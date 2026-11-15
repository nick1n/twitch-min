const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const withInstalledBrowser = require('./support/installed.cjs');
const { root, manifest, marker } = require('./support/production.cjs');

test('installed extension: real storage, popup, isolated world, tabs, reload and browser restart', { timeout: 90000 }, async () => {
  // No production injection or chrome mock: Chrome reads the unchanged manifest.
  const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/installed.html'), 'utf8').replace(marker, '');
  await withInstalledBrowser(async (browser, restart) => {
    const popupURL = id => `chrome-extension://${id}/${manifest.action.default_popup}`;
    const first = await browser.open('https://www.twitch.tv/offline-fixture-one', fixture);
    const second = await browser.open('https://twitch.tv/offline-fixture-two', fixture);
    const tabs = [first, second];
    for (const tab of tabs) {
      await tab.waitFor(`document.querySelector('#second').hasAttribute('data-tq-chat-continuation')`);
      assert.equal(await tab.evaluate(`getComputedStyle(document.querySelector('#bits')).display`), 'none');
      assert.equal(await tab.evaluate(`document.querySelector('#notifications').checkVisibility()`), true);
      assert.equal(await tab.evaluate(`typeof TwitchMinSettings`), 'undefined', 'content globals stay in Chrome\'s isolated world');
      assert.equal(await tab.evaluate(`typeof __storagePatch`), 'undefined', 'no fixture storage mock is present');
    }
    const outside = await browser.open('https://example.test/offline-fixture', fixture);
    assert.equal(await outside.evaluate(`document.querySelector('#bits').checkVisibility()`), true, 'non-Twitch origins remain native');
    assert.equal(await outside.evaluate(`document.querySelector('#twitch-min-styles')`), null);
    let popup = await browser.open(popupURL(browser.id));
    await popup.waitFor(`!document.querySelector('#group-chatTints').disabled`);
    assert.equal(await popup.evaluate(`getComputedStyle(document.body).fontSize`), '13px', 'extension-page defaults do not shrink popup text');
    await popup.evaluate(`document.querySelector('#group-chatTints').click()`);
    await popup.waitFor(`!document.querySelector('#group-chatTints').disabled`);
    for (const tab of tabs) {
      await tab.waitFor(`!document.querySelector('[data-tq-chat-tint]')`);
      assert.equal(await tab.evaluate(`document.querySelector('#second').hasAttribute('data-tq-chat-continuation')`), true, 'grouping stays active');
    }
    assert.equal(await popup.evaluate(`chrome.storage.local.get('chatTints').then(value => value.chatTints)`), false);
    await first.evaluate(`document.documentElement.setAttribute('data-before-reload','true')`);
    await first.command('Page.reload');
    await first.waitFor(`document.readyState === 'complete' && !document.documentElement.hasAttribute('data-before-reload') && document.documentElement.getAttribute('data-tq-chat-tints') === 'false'`);
    assert.equal(await first.evaluate(`document.querySelector('[data-tq-chat-tint]')`), null, 'reload reads the saved setting');

    await popup.evaluate(`document.querySelector('#master-toggle').click()`);
    await popup.waitFor(`!document.querySelector('#master-toggle').disabled`);
    for (const tab of tabs) await tab.waitFor(`document.documentElement.getAttribute('data-tq-enabled') === 'false' && !document.querySelector('[data-tq-chat-continuation]')`);
    assert.deepEqual(await popup.evaluate(`chrome.storage.local.get(['enabled','chatTints'])`), { enabled: false, chatTints: false }, 'the master toggle preserves individual choices');

    const id = browser.id;
    browser = await restart();
    assert.equal(browser.id, id, 'the same unpacked extension retains its identity');
    const restored = await browser.open('https://www.twitch.tv/offline-fixture-restart', fixture);
    await restored.waitFor(`document.documentElement.getAttribute('data-tq-enabled') === 'false'`);
    assert.equal(await restored.evaluate(`document.querySelector('#bits').checkVisibility()`), true, 'browser restart preserves pause');
    popup = await browser.open(popupURL(browser.id));
    await popup.waitFor(`!document.querySelector('#master-toggle').disabled`);
    assert.equal(await popup.evaluate(`document.querySelector('#group-chatTints').checked`), false);
    await popup.evaluate(`document.querySelector('#master-toggle').click()`);
    await restored.waitFor(`document.querySelector('#second').hasAttribute('data-tq-chat-continuation')`);
    assert.equal(await restored.evaluate(`document.querySelector('[data-tq-chat-tint]')`), null, 'resuming respects individual opt-outs');
    await popup.waitFor(`!document.querySelector('#enable-all-button').disabled`);
    await popup.evaluate(`document.querySelector('#enable-all-button').click()`);
    await restored.waitFor(`document.querySelector('#first').hasAttribute('data-tq-chat-tint')`);
    assert.equal(await popup.evaluate(`chrome.storage.local.get(null).then(value => Object.values(value).every(item => item === true))`), true, 'Enable all saves enabled defaults');
  });
});
