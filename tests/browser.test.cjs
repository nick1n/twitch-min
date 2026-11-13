const { test } = require('node:test');
const withBrowser = require('./support/chrome.cjs');
const { intercept, initSource } = require('./support/production.cjs');

// Sequential feature suites share one isolated browser. Every test creates its own page state.
test('real Chrome: production features and failures', { timeout: 120000 }, async t => {
  await withBrowser(async browser => {
    await require('./browser/emotes.cjs')(t, browser);
    await require('./browser/composer.cjs')(t, browser);
    await require('./browser/player.cjs')(t, browser);
    await require('./browser/chat.cjs')(t, browser);
    await require('./browser/layout.cjs')(t, browser);
    await require('./browser/settings.cjs')(t, browser);
    await require('./browser/snapshots.cjs')(t, browser);
    await require('./browser/runtime.cjs')(t, browser);
  }, { intercept, initSource });
});
