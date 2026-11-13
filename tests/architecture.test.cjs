const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { root, manifest, content, marker, fixtureHTML } = require('./support/production.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadRules() {
  const context = vm.createContext({});
  for (const file of content.js.filter(file => file === 'shared/settings.js' || file === 'shared/selectors.js' || file.startsWith('styles/'))) {
    vm.runInContext(read(`extension/${file}`), context, { filename: file });
  }
  return context;
}

test('package and extension versions agree and Node 22 is the declared minimum', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, manifest.version);
  assert.equal(pkg.engines.node, '>=22');
});

test('settings declaration derives the stable storage and popup API', () => {
  const { TwitchMinSettings: api } = loadRules();
  const keys = ['enabled', 'sidebarSections', 'sidebarLabels', 'topNavigation', 'channelActions', 'channelAbout', 'chatLeaderboard', 'chatComposer', 'chatTimestamps'];
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

test('feature rules preserve the complete pre-refactor CSS and cascade order', () => {
  const context = loadRules();
  const api = context.TwitchMinRules;
  const baseline = JSON.parse(read('tests/rules-baseline.json'));
  assert.equal(api.RULES.length, baseline.ruleCount);
  assert.equal(createHash('sha256').update(api.buildCSS()).digest('hex'), baseline.cssSha256);
  const slots = ['Sidebar', 'Navigation', 'Player', 'Chat'].flatMap(feature =>
    Array.from(context[`TwitchMin${feature}Rules`], ([order]) => order));
  assert.equal(new Set(slots).size, baseline.ruleCount);
  for (const rule of api.RULES) {
    assert.ok(Object.hasOwn(context.TwitchMinSettings.DEFAULTS, rule.key));
    assert.ok(Object.isFrozen(rule) && Object.isFrozen(rule.selectors));
  }
});

test('all runnable HTML fixtures load the manifest scripts and styles in production order', () => {
  for (const file of fs.readdirSync(path.join(root, 'tests/fixtures')).filter(file => file.endsWith('.html') && file !== 'emote-tooltip.html')) {
    const source = read(`tests/fixtures/${file}`);
    assert.equal(source.split(marker).length, 2, file);
    assert.doesNotMatch(source, /<script[^>]+src="\.\.\/\.\.\/extension\//);
    const html = fixtureHTML(source);
    const scripts = [...html.matchAll(/<script src="\.\.\/\.\.\/extension\/([^"]+)" defer>/g)].map(match => match[1]);
    const styles = [...html.matchAll(/<link rel="stylesheet" href="\.\.\/\.\.\/extension\/([^"]+)">/g)].map(match => match[1]);
    assert.deepEqual(scripts, content.js, file);
    assert.deepEqual(styles, content.css, file);
  }
});
