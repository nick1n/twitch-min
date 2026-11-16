const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const withBrowser = require('./support/chrome.cjs');
const withChrome = require('./support/launch.cjs');
const { intercept, initSource, manifest, root } = require('./support/production.cjs');
const chromePath = require('./support/chrome-path.cjs');
const puppeteer = require('puppeteer');

test('browser selection defaults to Puppeteer and preserves explicit overrides', async () => {
  const previous = process.env.CHROME_PATH;
  try {
    delete process.env.CHROME_PATH;
    assert.equal(await chromePath(), await puppeteer.executablePath());
    process.env.CHROME_PATH = '/missing/environment-chrome';
    assert.equal(await chromePath(), '/missing/environment-chrome');
    assert.equal(await chromePath('/missing/configured-chrome'), '/missing/configured-chrome');
  } finally {
    if (previous === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previous;
  }
});

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

test('Chrome releases an intercepted old-document image after navigation', { timeout: 10000 }, async () => {
  let release, paused;
  const responseReady = new Promise(resolve => { release = resolve; });
  const requestPaused = new Promise(resolve => { paused = resolve; });
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`window.oldImage=new Image();oldImage.src='https://fixture.invalid/old-document';document.body.append(oldImage)`);
    await requestPaused;
    await navigate('tests/fixtures/installed.html');
    release();
  }, { initSource, intercept: async (params, send) => {
    if (params.request.url === 'https://fixture.invalid/old-document') {
      paused();
      await responseReady;
      return send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, body: '' });
    }
    return intercept(params, send);
  } });
});

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
  test(`Chrome harness reports ${failure} promptly and removes its profile`, { timeout: 5000 }, async t => {
    const profiles = trackProfiles(t);
    const chromePath = failure === 'missing executable'
      ? path.join(root, '.browser-tests', `missing-chrome-${randomUUID()}.exe`) : process.execPath;
    await assert.rejects(withChrome(async launch => {
      await launch();
      assert.fail('a failed launch must not run feature checks');
    }, { chromePath }), error => {
      assert.ok(error.message.includes(chromePath), 'diagnostics include the executable path');
      if (failure === 'missing executable') {
        assert.match(error.message, /Chrome failed to start[\s\S]*not found|ENOENT/i);
      } else {
        assert.match(error.message, /Chrome failed to start/);
        assert.ok(error.cause, 'the original Puppeteer launch failure is retained');
      }
      return true;
    });
    assert.equal(profiles.length, 1);
    assert.equal(fs.existsSync(profiles[0]), false, 'failed startup leaves no test profile behind');
  });
}

test('Puppeteer cleans its profile after failed assertions', { timeout: 15000 }, async t => {
  const profiles = trackProfiles(t);
  await assert.rejects(withBrowser(async () => { throw new Error('callback-failure-probe'); }),
    /callback-failure-probe/);
  assert.equal(profiles.length, 1);
  assert.equal(fs.existsSync(profiles[0]), false);
});

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
