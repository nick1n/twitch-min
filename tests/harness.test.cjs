const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const withBrowser = require('./support/chrome.cjs');
const { intercept, initSource, manifest, root } = require('./support/production.cjs');

for (const failure of ['missing executable', 'early process exit']) {
  test(`Chrome harness reports ${failure} promptly and removes its profile`, { timeout: 5000 }, async t => {
    const profiles = [];
    const mkdir = fs.mkdirSync;
    const mkdirMock = mock.method(fs, 'mkdirSync', (directory, options) => {
      if (path.dirname(directory) === path.join(root, '.browser-tests')) profiles.push(directory);
      return mkdir(directory, options);
    });
    t.after(() => mkdirMock.mock.restore());
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
