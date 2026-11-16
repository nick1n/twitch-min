const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const puppeteer = require('puppeteer');
const findChrome = require('./chrome-path.cjs');
const root = path.resolve(__dirname, '../..');

// Puppeteer owns startup, the debugging transport, and shutdown.
module.exports = async function withChrome(run, { chromePath, extensions = false } = {}) {
  const executablePath = await findChrome(chromePath);
  const profile = path.join(root, '.browser-tests', randomUUID());
  fs.mkdirSync(profile, { recursive: true });
  let browser;
  async function launch() {
    if (browser) await browser.close();
    browser = undefined;
    try {
      browser = await puppeteer.launch({ executablePath, userDataDir: profile,
        headless: true, pipe: true, timeout: 10000, protocolTimeout: 10000,
        enableExtensions: extensions,
        ignoreDefaultArgs: ['--hide-scrollbars'],
        args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'],
      });
      return browser;
    } catch (error) {
      throw new Error(`Chrome failed to start. Executable: ${executablePath}\n${error.message}`, { cause: error });
    }
  }
  try { return await run(launch); }
  finally {
    try { if (browser) await browser.close(); }
    finally {
      assert.equal(path.dirname(path.resolve(profile)), path.resolve(root, '.browser-tests'));
      assert.match(path.basename(profile), /^[0-9a-f-]{36}$/);
      await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
};
