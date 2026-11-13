const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, manifest, content, marker, fixtureHTML } = require('./support/production.cjs');
const { loadRules } = require('./support/rules.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('package and extension versions agree and Node 22 is the declared minimum', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, manifest.version);
  assert.equal(pkg.engines.node, '>=22');
});

test('focused test commands cover every root test exactly once', () => {
  const { scripts } = JSON.parse(read('package.json'));
  const files = fs.readdirSync(path.join(root, 'tests'))
    .filter(file => file.endsWith('.test.cjs'))
    .map(file => `tests/${file}`)
    .sort();
  const listed = [];
  for (const name of ['test:unit', 'test:browser', 'test:package']) {
    const command = scripts[name];
    assert.match(command, /^node --test(?: tests\/[\w.-]+\.test\.cjs)+$/, `${name} must list test paths explicitly`);
    listed.push(...command.split(' ').slice(2));
  }
  assert.equal(new Set(listed).size, listed.length, 'focused test paths must not be duplicated');
  assert.deepEqual(listed.sort(), files, 'focused test paths must match root test files');
  assert.equal(scripts.test, 'node --test tests/*.test.cjs', 'full test command must include every root test');
});

test('manifest is Twitch-only, storage-only, with unique local assets', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.twitch.tv/*', 'https://twitch.tv/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.equal(new Set(content.js).size, content.js.length, 'content scripts are loaded once');
  assert.equal(new Set(content.css).size, content.css.length, 'content styles are loaded once');
  for (const file of [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(root, 'extension', file)), file);
  }
  for (const file of Object.values(manifest.icons)) {
    const bytes = fs.readFileSync(path.join(root, 'extension', file));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  assert.doesNotMatch(read(`extension/${manifest.action.default_popup}`), /<script(?![^>]*\bsrc=)/i);
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
