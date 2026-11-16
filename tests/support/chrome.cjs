const path = require('node:path');
const { pathToFileURL } = require('node:url');
const withChrome = require('./launch.cjs');
const createInterceptions = require('./interceptions.cjs');
const root = path.resolve(__dirname, '../..');

module.exports = async function withBrowser(run, { intercept, initSource = '', ...options } = {}) {
  return withChrome(async launch => {
    const browser = await launch();
    const page = await browser.newPage();
    await page.setViewport(null);
    const session = await page.createCDPSession();
    const send = async (method, params = {}) => {
      try { return await session.send(method, params); }
      catch (error) { throw new Error(error.originalMessage || error.message, { cause: error }); }
    };
    const interceptions = createInterceptions({ send,
      handle: intercept || (({ requestId }, command) => command('Fetch.continueRequest', { requestId })) });
    const events = ['Network.requestWillBeSent', 'Network.loadingFailed', 'Network.loadingFinished',
      'Page.frameNavigated', 'Page.frameDetached', 'Fetch.requestPaused'];
    const listeners = events.map(method => {
      const listener = params => interceptions.event({ method, params });
      session.on(method, listener);
      return [method, listener];
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    function check() {
      interceptions.check();
      if (pageErrors.length) throw new Error(`Uncaught page exception:\n${pageErrors.join('\n\n')}`);
    }
    try {
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      await send('Network.enable');
      await send('Page.enable');
      await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      const evaluate = async expression => {
        check();
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        check();
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      let initScript;
      const navigate = async (file, setup = '') => {
        check();
        if (initScript) await page.removeScriptToEvaluateOnNewDocument(initScript.identifier);
        initScript = await page.evaluateOnNewDocument(`${initSource}\n${setup}`);
        try { await page.goto(pathToFileURL(path.join(root, file)).href, { waitUntil: 'load', timeout: 10000 }); }
        catch (error) { check(); throw error; }
        check();
      };
      const waitFor = async expression => {
        check();
        const handle = await page.waitForFunction(expression, { polling: 20, timeout: 2500 });
        await handle.dispose();
        check();
      };
      const isVisible = id => evaluate(`(()=>{ const x = document.getElementById(${JSON.stringify(id)}); return !!x && x.checkVisibility({checkVisibilityCSS:true}); })()`);
      await run({ send, evaluate, navigate, isVisible, waitFor });
      await evaluate('0');
      await interceptions.drain();
      check();
    } finally {
      for (const [event, listener] of listeners) session.off(event, listener);
      interceptions.dispose();
    }
  }, options);
};
