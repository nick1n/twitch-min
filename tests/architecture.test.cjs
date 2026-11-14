const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { root, manifest, content, marker, fixtureHTML } = require('./support/production.cjs');
const { loadRules } = require('./support/rules.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Handles inline Markdown destinations (including angle-wrapped paths and titles),
// not reference links, HTML, nested parentheses, or Markdown escape sequences.
function localLinks(markdown) {
  let fence = null;
  const prose = markdown.split(/\r?\n/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length))) {
      fence = fence ? null : marker[1];
      return '';
    }
    return fence ? '' : line;
  }).join('\n').replace(/(`+)([\s\S]*?)\1/g, '');
  const links = [];
  const inline = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s()]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g;
  for (const match of prose.matchAll(inline)) {
    const destination = match[1] || match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(destination)) continue;
    const target = destination.split(/[?#]/, 1)[0];
    if (target) links.push(decodeURIComponent(target));
  }
  return links;
}

function documentationFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) return documentationFiles(path.join(directory, entry.name), relative);
    return entry.isFile() && /\.md$/i.test(entry.name) ? [relative] : [];
  });
}

test('package and extension versions agree and the test runtime meets the declared Node minimum', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, manifest.version);
  const minimum = /^>=(\d+)$/.exec(pkg.engines.node);
  assert.ok(minimum, 'declare the minimum Node major in engines.node');
  assert.ok(Number(process.versions.node.split('.')[0]) >= Number(minimum[1]), `Tests require Node ${minimum[1]} or newer`);
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

test('browser runner registers every feature module exactly once', () => {
  const files = fs.readdirSync(path.join(root, 'tests/browser'))
    .filter(file => file.endsWith('.cjs')).sort();
  const registered = [...read('tests/browser.test.cjs').matchAll(/\brequire\(\s*['"]\.\/browser\/([^'"]+\.cjs)['"]\s*\)/g)]
    .map(match => match[1]);
  assert.equal(new Set(registered).size, registered.length, 'browser modules must not be registered twice');
  assert.deepEqual(registered.sort(), files, 'browser registrations must match feature modules');
});

test('local Markdown links resolve to existing files', () => {
  const files = [
    ...fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.md$/i.test(entry.name)).map(entry => entry.name),
    ...documentationFiles(path.join(root, 'docs'), 'docs')
  ];
  for (const file of files) {
    for (const target of localLinks(read(file))) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), target)), `${file}: missing ${target}`);
    }
  }
});

test('local Markdown link extraction ignores code and remote destinations', () => {
  const sample = [
    '[broken](missing.md#section) ![image](<folder/a%20b.png> "title")',
    '[space](<folder/a b.md?raw=1>) [remote](https://example.com) [anchor](#section)',
    '`[inline](ignored.md)`',
    '```md', '[fenced](ignored-too.md)', '```',
    '~~~', '![fenced image](ignored.png)', '~~~'
  ].join('\n');
  assert.deepEqual(localLinks(sample), ['missing.md', 'folder/a b.png', 'folder/a b.md']);
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
