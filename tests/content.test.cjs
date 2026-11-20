const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, manifest } = require('./support/production.cjs');
const { loadRules } = require('./support/rules.cjs');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('content script handles late document root, initial-read races, removals and storage errors', async () => {
  const attributes = {};
  const styles = [];
  let rootObserver;
  let changeListener;
  let finishRead;
  const rootElement = { getAttribute: key => attributes[key] ?? null, setAttribute: (key, value) => attributes[key] = value, appendChild: style => styles.push(style) };
  const document = { documentElement: null, createElement: () => ({ setAttribute() {} }) };
  const context = vm.createContext({
    document,
    MutationObserver: class { constructor(callback) { rootObserver = callback; } observe() {} disconnect() {} },
    chrome: { storage: { onChanged: { addListener: callback => changeListener = callback }, local: {
      get: () => new Promise(resolve => { finishRead = resolve; })
    } } },
    console: { info() {}, warn() {} }
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


});

test('content isolates failures and retries only unsuccessful features with unchanged settings', async () => {
  const calls = { first: 0, later: 0 };
  const warnings = [];
  let writes = 0, changeListener, fail = true;
  const context = vm.createContext({
    document: {
      documentElement: { getAttribute() { return null; }, setAttribute() { writes++; }, appendChild() {} },
      createElement: () => ({ setAttribute() {} })
    },
    chrome: { storage: { onChanged: { addListener(callback) { changeListener = callback; } },
      local: { get: async defaults => defaults } } },
    console: { info() {}, warn: (...args) => warnings.push(args) },
    TwitchMinEmotes: { update() { calls.first++; if (fail) throw Error('injected startup/update failure'); } },
    TwitchMinComposer: { update() { calls.later++; } }
  });
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, { first: 1, later: 1 });
  assert.match(warnings[0][0], /TwitchMinEmotes/);
  const settingCount = Object.keys(context.TwitchMinSettings.DEFAULTS).length;
  assert.equal(writes, settingCount, 'initial settings are applied');
  fail = false;
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(calls, { first: 2, later: 1 });
  assert.equal(writes, settingCount, 'retry leaves unchanged attributes untouched');
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(calls, { first: 2, later: 1 });
  fail = true;
  changeListener({ chatComposer: { newValue: false } }, 'local');
  assert.deepEqual(calls, { first: 3, later: 2 }, 'a later update failure does not block the remaining feature');
  assert.equal(writes, settingCount + 1);
  fail = false;
  changeListener({ chatComposer: { newValue: false } }, 'local');
  assert.deepEqual(calls, { first: 4, later: 2 });
  assert.equal(writes, settingCount + 1);
  changeListener({ unrelated: { newValue: true } }, 'local');
  assert.equal(writes, settingCount + 1, 'unrelated keys leave root attributes untouched');
});

test('content retries failed preference reads on relevant events and preserves changes during recovery', async () => {
  const attributes = {}, requests = [], warnings = [];
  let changeListener;
  const context = vm.createContext({
    document: {
      documentElement: { getAttribute: key => attributes[key] ?? null, setAttribute: (key, value) => attributes[key] = value, appendChild() {} },
      createElement: () => ({ setAttribute() {} })
    },
    chrome: { storage: {
      onChanged: { addListener(callback) { changeListener = callback; } },
      local: { get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) }
    } },
    console: { info() {}, warn: (...args) => warnings.push(args) }
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

test('toggle diagnostics tag logs and report actual page state and controller failures', async () => {
  const logs = [], attributes = {}, styles = [];
  let changeListener, messageListener, finishRead, failFeature = false;
  const rootElement = {
    setAttribute: (key, value) => attributes[key] = value,
    getAttribute: key => attributes[key] ?? null,
    appendChild: style => { style.isConnected = true; styles.push(style); }
  };
  const context = vm.createContext({
    document: {
      documentElement: rootElement,
      createElement: () => ({ setAttribute() {} }),
      getElementById: id => styles.find(style => style.id === id)
    },
    chrome: {
      runtime: { getManifest: () => manifest, onMessage: { addListener: callback => messageListener = callback } },
      storage: {
        onChanged: { addListener: callback => changeListener = callback },
        local: { get: () => new Promise(resolve => finishRead = resolve) }
      }
    },
    console: {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args])
    }
  });
  for (const name of ['TwitchMinEmotes', 'TwitchMinLayout', 'TwitchMinTimestamps', 'TwitchMinPlayer', 'TwitchMinChat', 'TwitchMinComposer', 'TwitchMinReport']) {
    context[name] = { update() { if (name === 'TwitchMinLayout' && failFeature) throw Error('restoration failed'); } };
  }
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
  const status = () => {
    let response;
    messageListener({ type: 'twitch-min:status' }, {}, value => response = JSON.parse(JSON.stringify(value)));
    return response;
  };
  assert.equal(status().enabled, null, 'diagnostics do not mistake an unread preference for success');
  changeListener({ enabled: { newValue: false } }, 'local');
  assert.match(logs.at(-1)[1], /queued until preferences finish loading/);
  finishRead(context.TwitchMinSettings.DEFAULTS);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(status(), { type: 'twitch-min:status', version: manifest.version, ready: true, enabled: false,
    appliedEnabled: 'false', stylesheetMounted: true, failedFeatures: [], missingFeatures: [] });
  failFeature = true;
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(status().failedFeatures, ['TwitchMinLayout']);
  assert.equal(logs.some(([level, message]) => level === 'warn' && message.includes('TwitchMinLayout')), true);
  failFeature = false;
  changeListener({ enabled: { newValue: true } }, 'local');
  assert.deepEqual(status().failedFeatures, [], 'same-settings retry clears the reported failure');
  assert.match(logs.at(-1)[1], /unchanged; already enabled/);
  const count = logs.length;
  changeListener({ unrelated: { newValue: true } }, 'local');
  assert.equal(logs.length, count, 'unrelated page work stays quiet');
  styles[0].isConnected = false;
  assert.equal(status().stylesheetMounted, false, 'removed CSS is diagnosed');
  delete context.TwitchMinChat;
  assert.deepEqual(status().missingFeatures, ['TwitchMinChat']);
  assert.equal(logs.every(([, message]) => message.startsWith(`[${manifest.name} v${manifest.version}]`)), true);
});

function retirementFixture({ lateRoot = false, invalidated = false, failOnce = false } = {}) {
  const document = new EventTarget();
  const attributes = {}, calls = [], removed = [], listeners = {};
  let finishRead, observer;
  const rootElement = {
    getAttribute: key => attributes[key] ?? null,
    setAttribute: (key, value) => attributes[key] = value,
    removeAttribute: key => delete attributes[key],
    appendChild(style) { style.isConnected = true; }
  };
  document.documentElement = lateRoot ? null : rootElement;
  document.createElement = () => ({ setAttribute() {}, remove() { this.isConnected = false; calls.push('style'); } });
  const channel = name => ({
    addListener(callback) { listeners[name] = callback; },
    removeListener(callback) { removed.push([name, callback]); if (invalidated) throw Error('context invalidated'); }
  });
  const context = vm.createContext({ document, Event,
    MutationObserver: class { constructor(callback) { observer = this; this.callback = callback; } observe() {} disconnect() { this.disconnected = true; } },
    chrome: { runtime: { onMessage: channel('message') }, storage: { onChanged: channel('storage'), local: {
      get: () => new Promise(resolve => finishRead = resolve)
    } } }, console: { info() {}, warn() {} }
  });
  const names = ['TwitchMinEmotes', 'TwitchMinLayout', 'TwitchMinTimestamps', 'TwitchMinPlayer', 'TwitchMinChat', 'TwitchMinComposer', 'TwitchMinReport'];
  for (const name of names) context[name] = {
    update() { calls.push(`update:${name}`); },
    dispose() { calls.push(`dispose:${name}`); if (name === 'TwitchMinLayout' && failOnce) { failOnce = false; throw Error('restore failed'); } }
  };
  loadRules(context);
  vm.runInContext(read('extension/content.js'), context);
  const retire = () => new Promise(resolve => {
    const success = () => done('retired'), failure = () => done('retire-failed');
    function done(result) { document.removeEventListener('twitch-min:retired', success); document.removeEventListener('twitch-min:retire-failed', failure); resolve(result); }
    document.addEventListener('twitch-min:retired', success);
    document.addEventListener('twitch-min:retire-failed', failure);
    document.dispatchEvent(new Event('twitch-min:retire'));
  });
  return { context, document, rootElement, attributes, calls, removed, listeners, names, finishRead: value => finishRead(value), observer: () => observer, retire };
}

test('retirement disconnects a pending root and ignores late settings and storage callbacks', async () => {
  const f = retirementFixture({ lateRoot: true, invalidated: true });
  assert.equal(await f.retire(), 'retired');
  assert.equal(f.observer().disconnected, true);
  assert.deepEqual(f.removed.map(([name]) => name), ['storage', 'message']);
  assert.equal(f.removed[0][1], f.listeners.storage);
  assert.equal(f.removed[1][1], f.listeners.message);
  f.document.documentElement = f.rootElement;
  f.observer().callback();
  f.finishRead(f.context.TwitchMinSettings.DEFAULTS);
  f.listeners.storage({ enabled: { newValue: false } }, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.attributes, {});
  assert.equal(f.calls.some(call => call.startsWith('update:')), false);
});

test('retirement retries failed cleanup, retains captured controllers and releases DOM state', async () => {
  const f = retirementFixture({ failOnce: true });
  f.finishRead(f.context.TwitchMinSettings.DEFAULTS);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.attributes['data-tq-enabled'], 'true');
  for (const name of f.names) f.context[name] = { dispose() { throw Error('replacement must not be disposed'); } };
  assert.equal(await f.retire(), 'retire-failed');
  assert.equal(f.calls.filter(call => call.startsWith('dispose:')).length, f.names.length);
  assert.equal(f.attributes['data-tq-enabled'], 'true', 'failed cleanup retains page state for retry');
  assert.equal(await f.retire(), 'retired');
  assert.deepEqual(f.attributes, {});
  assert.equal(f.calls.filter(call => call === 'style').length, 1);
  const count = f.calls.length;
  f.listeners.storage({ enabled: { newValue: false } }, 'local');
  f.document.dispatchEvent(new Event('twitch-min:retire'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, count, 'successful retirement removes the hook and ignores stale callbacks');
});
