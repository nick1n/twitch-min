const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const findChrome = require('./chrome-path.cjs');
const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function debuggerTargets(port, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Chrome debugging target request timed out.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function waitForSocket(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
      error ? reject(error) : resolve();
    };
    const onOpen = () => finish();
    const onError = () => finish(new Error('Chrome debugging WebSocket connection failed.'));
    const onClose = () => finish(new Error('Chrome debugging WebSocket closed before connecting.'));
    const timer = setTimeout(() => finish(new Error('Chrome debugging WebSocket connection timed out.')), timeoutMs);
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('close', onClose, { once: true });
  });
}

module.exports = async function withBrowser(run, { intercept, initSource = '', chromePath: configuredChromePath, connectionTimeoutMs = 10000 } = {}) {
  const chromePath = findChrome(configuredChromePath);
  assert.ok(chromePath, 'Install Chrome or set CHROME_PATH to run browser tests.');
  const profile = path.join(root, '.browser-tests', randomUUID());
  fs.mkdirSync(profile, { recursive: true });
  const browser = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let launchError, exit;
  let stderr = '';
  browser.stderr.setEncoding('utf8');
  browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
  // Attach immediately; close also waits for diagnostic output to finish.
  const browserClosed = new Promise(resolve => {
    browser.once('error', error => { launchError = error; });
    browser.once('exit', (code, signal) => { exit = { code, signal }; });
    browser.once('close', resolve);
  });
  const startupError = message => new Error(`${message}\nExecutable: ${chromePath}${stderr.trim() ? `\nChrome stderr:\n${stderr.trim()}` : ''}`, { cause: launchError });
  let socket;
  let closeBrowser;
  let closeProtocol = () => {};
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let attempt = 0; !fs.existsSync(portFile) && !launchError && !exit && attempt < 200; attempt++) await pause(50);
    if (launchError || exit) {
      await browserClosed;
      throw startupError(launchError ? `Chrome failed to start: ${launchError.message}`
        : `Chrome exited before exposing its test debugging endpoint (exit code ${exit.code}, signal ${exit.signal || 'none'}).`);
    }
    if (!fs.existsSync(portFile)) throw startupError('Chrome timed out before exposing its test debugging endpoint.');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await debuggerTargets(port, connectionTimeoutMs);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await waitForSocket(socket, connectionTimeoutMs);
    let sequence = 0;
    const pending = new Map();
    closeProtocol = () => {
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error('Chrome debugging connection closed'));
      }
      pending.clear();
    };
    socket.addEventListener('close', closeProtocol, { once: true });
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeout);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
    const send = (method, params = {}) => {
      if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Chrome debugging connection closed'));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    };
    let interceptionError;
    const interceptions = new Map();
    const pageErrors = [];
    const checkPageErrors = () => {
      if (pageErrors.length) throw new Error(`Uncaught page exception:\n${pageErrors.join('\n\n')}`);
    };
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        const location = details.url ? `\n${details.url}:${details.lineNumber + 1}:${details.columnNumber + 1}` : '';
        pageErrors.push(`${details.exception?.description || details.text}${location}`);
      }
      if (message.method === 'Network.loadingFailed' && message.params.canceled) {
        for (const request of interceptions.values()) {
          if (request.networkId === message.params.requestId) request.cancel();
        }
      }
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, networkId } = message.params;
        let cancelled;
        const request = { networkId, cancelled: new Promise(resolve => { cancelled = resolve; }), cancel: () => cancelled(true) };
        interceptions.set(requestId, request);
        const handle = intercept || (({ requestId }, send) => send('Fetch.continueRequest', { requestId }));
        request.done = Promise.resolve().then(() => handle(message.params, send)).catch(async error => {
          // Removing an image or navigating can cancel it before a local response
          // reaches Chrome. Ignore only IDs with a confirmed Network cancellation.
          if (networkId && error.message === 'Invalid InterceptionId.') {
            let timer;
            const wasCancelled = await Promise.race([request.cancelled,
              new Promise(resolve => { timer = setTimeout(() => resolve(false), 250); })]);
            clearTimeout(timer);
            if (wasCancelled) return;
          }
          interceptionError = new Error(`Fixture request failed: ${message.params.request.url}: ${error.message}`, { cause: error });
          await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
        }).finally(() => { interceptions.delete(requestId); });
      }
    });

    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await send('Network.enable');
    closeBrowser = () => send('Browser.close');
    // Subscribe before the first navigation so startup and async failures are
    // retained even if a later page replaces the failing execution context.
    await send('Runtime.enable');
    const evaluate = async expression => {
      if (interceptionError) throw interceptionError;
      checkPageErrors();
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      checkPageErrors();
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    let initScript;
    const navigate = async (file, setup = '') => {
      checkPageErrors();
      if (initScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
      initScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `${initSource}\n${setup}` })).identifier;
      const url = pathToFileURL(path.join(root, file)).href;
      await send('Page.navigate', { url });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`)) return;
        await pause(25);
      }
      throw new Error(`Page did not load: ${file}`);
    };
    const isVisible = id => evaluate(`(()=>{ const x = document.getElementById(${JSON.stringify(id)}); return !!x && x.checkVisibility({checkVisibilityCSS:true}); })()`);
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await pause(20);
      }
      assert.fail(`Timed out waiting for: ${expression}`);
    };
    await run({ send, evaluate, navigate, isVisible, waitFor });
    // A protocol round trip drains already-delivered page errors before teardown.
    await evaluate('0');
    await Promise.all([...interceptions.values()].map(request => request.done));
    if (interceptionError) throw interceptionError;

  } finally {
    if (closeBrowser && socket?.readyState === WebSocket.OPEN) await closeBrowser().catch(() => {});
    socket?.close();
    closeProtocol();
    // Terminate only the Chrome child launched for this test profile.
    browser.kill();
    await browserClosed;
    // Only delete this run's direct child directory, never snapshots or other runs.
    const profilesRoot = path.resolve(root, '.browser-tests');
    assert.equal(path.dirname(path.resolve(profile)), profilesRoot);
    assert.match(path.basename(profile), /^[0-9a-f-]{36}$/);
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
};
