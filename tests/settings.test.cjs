const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadRules } = require('./support/rules.cjs');

test('settings declaration derives the stable storage and popup API', () => {
  const { TwitchMinSettings: api } = loadRules();
  const keys = ['enabled', 'sidebarSections', 'sidebarLabels', 'topNavigation', 'channelActions', 'channelAbout', 'chatLeaderboard', 'chatComposer', 'chatTimestamps', 'wheelVolume', 'emotePreviews', 'chatTints', 'chatGrouping'];
  assert.deepEqual(Object.keys(api.DEFAULTS), keys);
  assert.deepEqual(Object.keys(api.ATTRIBUTES), keys);
  assert.deepEqual(Array.from(api.GROUPS, group => group.key), keys.slice(1));
  assert.equal(new Set(Object.values(api.ATTRIBUTES)).size, keys.length);
  for (const setting of api.DEFINITIONS) {
    assert.equal(api.DEFAULTS[setting.key], setting.default);
    assert.equal(api.ATTRIBUTES[setting.key], setting.attribute);
    assert.ok(setting.title && setting.description);
    assert.ok(Object.isFrozen(setting));
    if (setting.key !== 'enabled') {
      const group = api.GROUPS.find(group => group.key === setting.key);
      assert.equal(group.title, setting.title);
      assert.equal(group.description, setting.description);
    }
  }
});

test('settings reject malformed values and retain explicit false preferences', () => {
  const { TwitchMinSettings: api } = loadRules();
  assert.equal(api.normalize(null).enabled, true);
  assert.equal(api.normalize({ enabled: false }).enabled, false);
  assert.equal(api.normalize({ chatComposer: 'false' }).chatComposer, true);
  assert.equal(api.normalize({ sidebarLabels: false }).sidebarLabels, false);
  assert.equal(Object.hasOwn(api.normalize({ unrelated: true }), 'unrelated'), false);
  assert.equal(api.normalize({ sidebarLabels: true, enabled: false }).channelAbout, true, 'old saved settings adopt the new default');
  assert.equal(api.normalize({ channelAbout: false }).channelAbout, false);
  assert.equal(api.GROUPS.length, 12);
  for (const key of ['wheelVolume', 'emotePreviews', 'chatTints', 'chatGrouping']) {
    assert.equal(api.normalize({ enabled: false })[key], true, `${key}: existing installations retain the enhancement`);
    assert.equal(api.normalize({ [key]: false })[key], false, `${key}: explicit opt-out persists`);
  }
  assert.equal(api.normalize({ sidebarHeadings: false }).sidebarSections, true, 'old header-hiding preference does not disable new section labels');
});
