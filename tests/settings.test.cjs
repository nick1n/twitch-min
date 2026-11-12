const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('settings reject malformed values and retain explicit false preferences', () => {
  const context = vm.createContext({});
  vm.runInContext(read('extension/settings.js'), context);
  const api = context.TwitchMinSettings;
  assert.equal(api.normalize(null).enabled, true);
  assert.equal(api.normalize({ enabled: false }).enabled, false);
  assert.equal(api.normalize({ chatComposer: 'false' }).chatComposer, true);
  assert.equal(api.normalize({ sidebarLabels: false }).sidebarLabels, false);
  assert.equal(Object.hasOwn(api.normalize({ unrelated: true }), 'unrelated'), false);
  assert.equal(api.GROUPS.length, 6);
});

test('manifest is Twitch-only, storage-only, with local scripts in dependency order', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.twitch.tv/*', 'https://twitch.tv/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.deepEqual(manifest.content_scripts[0].js, ['settings.js', 'rules.js', 'content.js']);
  for (const file of [...manifest.content_scripts[0].js, manifest.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(root, 'extension', file)), file);
  }
  for (const file of Object.values(manifest.icons)) {
    const bytes = fs.readFileSync(path.join(root, 'extension', file));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  assert.doesNotMatch(read('extension/popup.html'), /<script(?![^>]*\bsrc=)/i);
});

test('content script handles late document root, initial-read races, removals and storage errors', async () => {
  const attributes = {};
  const styles = [];
  let rootObserver;
  let changeListener;
  let finishRead;
  let failRead;
  const rootElement = { setAttribute: (key, value) => attributes[key] = value, appendChild: style => styles.push(style) };
  const document = { documentElement: null, createElement: () => ({}) };
  const context = vm.createContext({
    document,
    MutationObserver: class { constructor(callback) { rootObserver = callback; } observe() {} disconnect() {} },
    chrome: { storage: { onChanged: { addListener: callback => changeListener = callback }, local: {
      get: () => new Promise((resolve, reject) => { finishRead = resolve; failRead = reject; })
    } } },
    console: { warn() {} }
  });
  for (const file of ['settings.js', 'rules.js', 'content.js']) vm.runInContext(read(`extension/${file}`), context);
  changeListener({ enabled: { newValue: false } }, 'local');
  finishRead({ enabled: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attributes, {});
  document.documentElement = rootElement;
  rootObserver();
  assert.equal(attributes['data-tq-enabled'], 'false');
  assert.equal(styles.length, 1);
  changeListener({ enabled: { newValue: true }, chatComposer: { newValue: false } }, 'local');
  assert.equal(attributes['data-tq-enabled'], 'true');
  assert.equal(attributes['data-tq-chat-composer'], 'false');
  changeListener({ enabled: { newValue: false } }, 'sync');
  assert.equal(attributes['data-tq-enabled'], 'true');
  changeListener({ chatComposer: {} }, 'local');
  assert.equal(attributes['data-tq-chat-composer'], 'true');

  for (const key of Object.keys(attributes)) delete attributes[key];
  vm.runInContext(read('extension/content.js'), context);
  failRead(new Error('storage unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attributes, {}, 'failed settings read must leave the page unhidden');
});
