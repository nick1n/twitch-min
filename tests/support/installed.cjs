const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { root } = require('./production.cjs');
const findChrome = require('./chrome-path.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// A pipe permits Chrome's Extensions.loadUnpacked command without modifying a
// user's profile or relying on the removed branded-Chrome --load-extension flag.
module.exports = async function withInstalledBrowser(run, { chromePath: configuredChromePath } = {}) {
  const chromePath = findChrome(configuredChromePath);
  assert.ok(chromePath, 'Install Chrome or set CHROME_PATH to run installed-extension checks.');
  const profile = path.join(root, '.browser-tests', randomUUID());
  fs.mkdirSync(profile, { recursive: true });
  let stop = async () => {};

  async function launch() {
    const browser = spawn(chromePath, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '', sequence = 0, buffer = '', closed = false;
    const pending = new Map(), handlers = new Map(), errors = [];
    browser.stderr.setEncoding('utf8');
    browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
    const failPending = error => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
      pending.clear();
    };
    const finished = new Promise(resolve => {
      browser.once('error', error => failPending(error));
      browser.once('close', () => {
        closed = true;
        failPending(new Error(`Chrome debugging pipe closed. Executable: ${chromePath}\n${stderr.trim()}`));
        resolve();
      });
    });
    browser.stdio[3].on('error', failPending);
    browser.stdio[4].on('error', failPending);
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (closed) return reject(new Error('Chrome debugging pipe is closed.'));
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome timed out: ${method}. Executable: ${chromePath}\n${stderr.trim()}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
    browser.stdio[4].setEncoding('utf8');
    browser.stdio[4].on('data', chunk => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf('\0')) !== -1) {
        const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        if (!raw) continue;
        const message = JSON.parse(raw);
        if (message.id) {
          const request = pending.get(message.id);
          if (!request) continue;
          pending.delete(message.id); clearTimeout(request.timer);
          if (message.error) request.reject(new Error(`${message.error.message} (${message.id})`));
          else request.resolve(message.result);
        } else {
          if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
          handlers.get(message.sessionId)?.(message).catch(error => errors.push(error.message));
        }
      }
    });
    stop = async () => {
      if (!closed) {
        await send('Browser.close').catch(() => {});
        // Bound graceful shutdown, then terminate only this test's child.
        let shutdownTimer;
        await Promise.race([finished, new Promise(resolve => { shutdownTimer = setTimeout(resolve, 2000); })]);
        clearTimeout(shutdownTimer);
        if (!closed) browser.kill();
      }
      await finished;
      failPending(new Error('Installed-extension test ended.'));
    };
    const { id } = await send('Extensions.loadUnpacked', { path: path.join(root, 'extension') });

    async function open(url, fixture) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const command = (method, params) => send(method, params, sessionId);
      handlers.set(sessionId, async message => {
        if (message.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = message.params;
        if (request.url.startsWith('chrome-extension:')) return command('Fetch.continueRequest', { requestId });
        if (fixture && request.url === url) return command('Fetch.fulfillRequest', {
          requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: Buffer.from(fixture).toString('base64')
        });
        return command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      });
      await command('Runtime.enable');
      await command('Page.enable');
      await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      const evaluate = async expression => {
        assert.deepEqual(errors, [], 'installed pages have no uncaught exceptions or request failures');
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const waitFor = async expression => {
        for (let attempt = 0; attempt < 200; attempt++) {
          if (await evaluate(expression)) return;
          await pause(25);
        }
        assert.fail(`Installed-extension page timed out: ${expression}`);
      };
      await command('Page.navigate', { url });
      await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`);
      return { evaluate, waitFor, command };
    }
    return { id, open, send };
  }
  try {
    const browser = await launch();
    await run(browser, async () => { await stop(); return launch(); });
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(root, '.browser-tests'));
    assert.match(path.basename(profile), /^[0-9a-f-]{36}$/);
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};
