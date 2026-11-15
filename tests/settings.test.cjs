const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadRules } = require('./support/rules.cjs');

test('settings declaration derives the stable storage and popup API', () => {
  const { TwitchMinSettings: api } = loadRules();
  const keys = ['enabled', 'topNavigation', 'hideTopNavigation', 'sidebarSections', 'sidebarLabels', 'channelActions', 'channelAbout', 'wheelVolume', 'followingStories', 'browseRecaps', 'chatLeaderboard', 'chatTimestamps', 'chatTints', 'chatGrouping', 'emotePreviews', 'chatComposer'];
  assert.deepEqual(Object.keys(api.DEFAULTS), keys);
  assert.deepEqual(Object.keys(api.ATTRIBUTES), keys);
  assert.deepEqual(Array.from(api.GROUPS, group => group.key), keys.slice(1));
  assert.deepEqual(Array.from(api.GROUPS).filter(group => group.section).map(({ key, section }) => [key, section]), [
    ['sidebarSections', 'Sidebar'], ['channelActions', 'Main'], ['chatLeaderboard', 'Chat']
  ]);
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
      assert.equal(group.section, setting.section);
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
  assert.equal(api.DEFAULTS.channelAbout, false);
  assert.equal(api.normalize({ sidebarLabels: true, enabled: false }).channelAbout, false, 'missing saved preferences adopt the off default');
  assert.equal(api.normalize({ channelAbout: 'true' }).channelAbout, false, 'malformed values use the off default');
  assert.equal(api.normalize({ channelAbout: true }).channelAbout, true, 'saved opt-ins are preserved');
  assert.equal(api.normalize({ channelAbout: false }).channelAbout, false);
  assert.equal(api.DEFAULTS.hideTopNavigation, false);
  assert.equal(api.normalize({ topNavigation: false }).hideTopNavigation, false, 'existing installs keep the bar visible');
  assert.equal(api.normalize({ hideTopNavigation: 'true' }).hideTopNavigation, false);
  assert.equal(api.normalize({ hideTopNavigation: true }).hideTopNavigation, true, 'explicit opt-in persists');
  assert.equal(api.normalize({ hideTopNavigation: false }).hideTopNavigation, false);
  assert.equal(api.GROUPS.length, 15);
  for (const key of ['wheelVolume', 'emotePreviews', 'chatTints', 'chatGrouping', 'followingStories', 'browseRecaps']) {
    assert.equal(api.normalize({ enabled: false })[key], true, `${key}: existing installations retain the enhancement`);
    assert.equal(api.normalize({ [key]: false })[key], false, `${key}: explicit opt-out persists`);
  }
  assert.equal(api.normalize({ sidebarHeadings: false }).sidebarSections, true, 'old header-hiding preference does not disable new section labels');
});
