const { test } = require('node:test');
const assert = require('node:assert/strict');
const withBrowser = require('./support/chrome.cjs');
const { intercept, initSource, manifest } = require('./support/production.cjs');

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
