const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const withBrowser = require('./support/chrome.cjs');
const withInstalledBrowser = require('./support/installed.cjs');
const { intercept, initSource, manifest, root } = require('./support/production.cjs');

function trackProfiles(t) {
  const profiles = [];
  const mkdir = fs.mkdirSync;
  const mkdirMock = mock.method(fs, 'mkdirSync', (directory, options) => {
    if (path.dirname(directory) === path.join(root, '.browser-tests')) profiles.push(directory);
    return mkdir(directory, options);
  });
  t.after(() => mkdirMock.mock.restore());
  return profiles;
}

test('Chrome harness accepts confirmed cancellation before an intercepted image response', { timeout: 10000 }, async () => {
  let release, paused;
  const responseReady = new Promise(resolve => { release = resolve; });
  const requestPaused = new Promise(resolve => { paused = resolve; });
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`window.cancelledImage=new Image();cancelledImage.src='https://fixture.invalid/cancelled-image';document.body.append(cancelledImage)`);
    await requestPaused;
    await evaluate(`cancelledImage.removeAttribute('src');cancelledImage.remove()`);
    release();
  }, { initSource, intercept: async (params, send) => {
    if (params.request.url === 'https://fixture.invalid/cancelled-image') {
      paused();
      await responseReady;
      return send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body: '' });
    }
    return intercept(params, send);
  } });
});

test('Chrome harness still rejects an invalid interception ID without a confirmed cancellation', { timeout: 10000 }, async () => {
  await assert.rejects(withBrowser(async ({ navigate }) => {
    await navigate(`extension/${manifest.action.default_popup}`);
  }, { initSource, intercept: (_params, send) =>
    send('Fetch.fulfillRequest', { requestId: 'not-a-real-interception', responseCode: 200, body: '' })
  }), /Fixture request failed:[\s\S]*Invalid InterceptionId/);
});

for (const failure of ['missing executable', 'early process exit']) {
  test(`installed-extension harness cleans its profile after ${failure}`, { timeout: 5000 }, async t => {
    const profiles = trackProfiles(t);
    const chromePath = failure === 'missing executable'
      ? path.join(root, '.browser-tests', `missing-installed-chrome-${randomUUID()}.exe`) : process.execPath;
    await assert.rejects(withInstalledBrowser(() => assert.fail('failed launch must not run checks'), { chromePath }), error => {
      assert.ok(error.message.includes(chromePath), 'launch diagnostics identify the executable');
      assert.match(error.message, failure === 'missing executable' ? /ENOENT/ : /Chrome debugging pipe closed/);
      return true;
    });
    assert.equal(profiles.length, 1);
    assert.equal(fs.existsSync(profiles[0]), false, 'the failed run removes only its isolated profile');
  });
}

for (const failure of ['missing executable', 'early process exit']) {
  test(`Chrome harness reports ${failure} promptly and removes its profile`, { timeout: 5000 }, async t => {
    const profiles = trackProfiles(t);
    const chromePath = failure === 'missing executable'
      ? path.join(root, '.browser-tests', `missing-chrome-${randomUUID()}.exe`) : process.execPath;
    await assert.rejects(withBrowser(() => assert.fail('a failed launch must not run feature checks'), { chromePath }), error => {
      assert.ok(error.message.includes(chromePath), 'diagnostics include the executable path');
      if (failure === 'missing executable') {
        assert.match(error.message, /Chrome failed to start:[\s\S]*ENOENT/);
      } else {
        assert.match(error.message, /Chrome exited before exposing.*exit code \d+/);
        assert.match(error.message, /Chrome stderr:[\s\S]*--headless=new/, 'stderr explains why the child failed');
      }
      return true;
    });
    assert.equal(profiles.length, 1);
    assert.equal(fs.existsSync(profiles[0]), false, 'failed startup leaves no test profile behind');
  });
}

for (const stage of ['target response', 'target body', 'WebSocket handshake']) {
  test(`Chrome harness bounds a stalled ${stage} and removes its profile`, { timeout: 5000 }, async t => {
    const profiles = trackProfiles(t);
    let signal, socket;
    const fetchMock = mock.method(globalThis, 'fetch', async (_url, options) => {
      signal = options.signal;
      const stalled = () => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      if (stage === 'target response') return stalled();
      return { json: stage === 'target body' ? stalled : async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:1/stalled' }] };
    });
    t.after(() => fetchMock.mock.restore());
    if (stage === 'WebSocket handshake') {
      const WebSocket = globalThis.WebSocket;
      globalThis.WebSocket = class extends EventTarget {
        static OPEN = 1;
        constructor() { super(); this.readyState = 0; socket = this; }
        close() { this.readyState = 3; }
      };
      t.after(() => { globalThis.WebSocket = WebSocket; });
    }
    const message = stage === 'WebSocket handshake' ? /Chrome debugging WebSocket connection timed out/
      : /Chrome debugging target request timed out/;
    await assert.rejects(withBrowser(() => assert.fail('stalled startup must not run feature checks'), { connectionTimeoutMs: 100 }), message);
    if (socket) assert.equal(socket.readyState, 3, 'the stalled socket is closed');
    else assert.equal(signal.aborted, true, 'the stalled request or body is aborted');
    assert.equal(profiles.length, 1);
    assert.equal(fs.existsSync(profiles[0]), false, 'connection failure leaves no test profile behind');
  });
}

test('Chrome harness reports startup exceptions before assertions', { timeout: 30000 }, async () => {
  await assert.rejects(withBrowser(async ({ navigate }) => {
    await navigate(`extension/${manifest.action.default_popup}`, `throw new Error('startup-exception-probe')`);
  }, { intercept, initSource }), /Uncaught page exception:[\s\S]*startup-exception-probe/);
});

for (const [name, source] of [
  ['timer exception', `setTimeout(()=>{throw new Error('async-exception-probe')},0)`],
  ['unhandled rejection', `Promise.reject(new Error('async-exception-probe'))`]
]) {
  test(`Chrome harness reports ${name} outside the evaluated call`, { timeout: 30000 }, async () => {
    await assert.rejects(withBrowser(async ({ navigate, evaluate }) => {
      await navigate(`extension/${manifest.action.default_popup}`);
      // Give Chrome a task turn to report the independent error; the evaluated
      // promise itself resolves successfully and must not be the failure signal.
      await evaluate(`new Promise(resolve=>{${source};setTimeout(resolve,30)})`);
    }, { intercept, initSource }), /Uncaught page exception:[\s\S]*async-exception-probe/);
  });
}
