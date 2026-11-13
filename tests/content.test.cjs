const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./support/production.cjs');
const { loadRules } = require('./support/rules.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

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
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
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

test('content isolates failures and retries only unsuccessful features with unchanged settings', async () => {
  const calls = { first: 0, later: 0 };
  const warnings = [];
  let writes = 0, changeListener, fail = true;
  const context = vm.createContext({
    document: {
      documentElement: { setAttribute() { writes++; }, appendChild() {} },
      createElement: () => ({})
    },
    chrome: { storage: { onChanged: { addListener(callback) { changeListener = callback; } },
      local: { get: async defaults => defaults } } },
    console: { warn: (...args) => warnings.push(args) },
    TwitchMinEmotes: { update() { calls.first++; if (fail) throw Error('injected startup/update failure'); } },
    TwitchMinComposer: { update() { calls.later++; } }
  });
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { first: 1, later: 1 });
  assert.match(warnings[0][0], /TwitchMinEmotes/);
  assert.equal(writes, 9, 'initial settings are applied');
  fail = false;
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(calls, { first: 2, later: 1 });
  assert.equal(writes, 9, 'retry leaves unchanged attributes untouched');
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(calls, { first: 2, later: 1 });
  fail = true;
  changeListener({ chatComposer: { newValue: false } }, 'local');
  assert.deepEqual(calls, { first: 3, later: 2 }, 'a later update failure does not block the remaining feature');
  assert.equal(writes, 10);
  fail = false;
  changeListener({ chatComposer: { newValue: false } }, 'local');
  assert.deepEqual(calls, { first: 4, later: 2 });
  assert.equal(writes, 10);
});

test('content retries failed preference reads on relevant events and preserves changes during recovery', async () => {
  const attributes = {}, requests = [], warnings = [];
  let changeListener;
  const context = vm.createContext({
    document: {
      documentElement: { setAttribute: (key, value) => attributes[key] = value, appendChild() {} },
      createElement: () => ({})
    },
    chrome: { storage: {
      onChanged: { addListener(callback) { changeListener = callback; } },
      local: { get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) }
    } },
    console: { warn: (...args) => warnings.push(args) }
  });
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
  changeListener({ enabled: { newValue: false } }, 'local');
  assert.equal(requests.length, 1, 'events during a read do not launch a second read');
  requests[0].reject(new Error('temporary storage failure'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attributes, {}, 'unknown preferences leave native UI usable');
  assert.equal(warnings.length, 1);

  changeListener({ enabled: { newValue: true } }, 'sync');
  changeListener({ unrelated: { newValue: true } }, 'local');
  assert.equal(requests.length, 1, 'unrelated changes do not retry');
  changeListener({ chatComposer: { newValue: false } }, 'local');
  assert.equal(requests.length, 2, 'the next relevant event retries');
  requests[1].reject(new Error('still unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attributes, {});
  assert.equal(requests.length, 2, 'there is no automatic retry loop');

  changeListener({ sidebarLabels: { newValue: false } }, 'local');
  assert.equal(requests.length, 3);
  changeListener({ chatComposer: {} }, 'local');
  assert.equal(requests.length, 3, 'recovery has only one read in flight');
  requests[2].resolve(context.TwitchMinSettings.DEFAULTS);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attributes['data-tq-enabled'], 'false', 'the saved pause survives recovery');
  assert.equal(attributes['data-tq-sidebar-labels'], 'false');
  assert.equal(attributes['data-tq-chat-composer'], 'true', 'a removed key adopts its default');
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.equal(attributes['data-tq-enabled'], 'true', 'normal preference updates resume');
  assert.equal(requests.length, 3, 'loaded preferences do not need another read');
});
