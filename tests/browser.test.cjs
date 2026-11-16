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
    await require('./browser/badges.cjs')(t, browser);
    await require('./browser/layout.cjs')(t, browser);
    await require('./browser/following.cjs')(t, browser);
    await require('./browser/browse.cjs')(t, browser);
    await require('./browser/visibility.cjs')(t, browser);
    await require('./browser/leaderboard.cjs')(t, browser);
    await require('./browser/rewards.cjs')(t, browser);
    await require('./browser/popup.cjs')(t, browser);
    await require('./browser/preferences.cjs')(t, browser);
    await require('./browser/runtime.cjs')(t, browser);
  }, { intercept, initSource });
});
