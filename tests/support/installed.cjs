const assert = require('node:assert/strict');
const path = require('node:path');
const withChrome = require('./launch.cjs');
const { root } = require('./production.cjs');

module.exports = async function withInstalledBrowser(run, options = {}) {
  return withChrome(async launch => {
    async function start() {
      const browser = await launch();
      const id = await browser.installExtension(path.join(root, 'extension'));
      const errors = [], active = new Set();
      const check = () => assert.deepEqual(errors, [], 'installed pages have no uncaught exceptions or request failures');
      async function open(url, fixture) {
        const page = await browser.newPage();
        await page.setViewport(null);
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', request => {
          const pending = (async () => {
            if (request.url().startsWith('chrome-extension:')) return request.continue();
            if (fixture && request.url() === url) return request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
            return request.abort('blockedbyclient');
          })().catch(error => errors.push(error.message)).finally(() => active.delete(pending));
          active.add(pending);
        });
        const evaluate = async expression => { check(); const value = await page.evaluate(expression); check(); return value; };
        const waitFor = async expression => {
          check();
          const handle = await page.waitForFunction(expression, { polling: 25, timeout: 5000 });
          await handle.dispose(); check();
        };
        await page.goto(url, { waitUntil: 'load', timeout: 10000 });
        check();
        const reload = async () => {
          check();
          await page.reload({ waitUntil: 'load', timeout: 10000 });
          check();
        };
        return { evaluate, waitFor, reload };
      }
      return { id, open, async check() { await Promise.all(active); check(); } };
    }
    let current = await start();
    await run(current, async () => { await current.check(); current = await start(); return current; });
    await current.check();
  }, { ...options, extensions: true });
};
