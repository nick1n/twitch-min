const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const manifest = require('../extension/manifest.json');
const source = fs.readFileSync(require.resolve('../extension/background.js'), 'utf8');

function setup(options = {}) {
  const events = {}, calls = [], warnings = [];
  const event = name => ({ addListener(fn) { events[name] = fn; } });
  const status = { type: 'twitch-min:status', version: manifest.version, ready: true };
  const chrome = {
    runtime: { id: 'extension', getManifest: () => manifest, getURL: p => `chrome-extension://extension/${p}`, onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message') },
    tabs: {
      async query(arg) { calls.push(['query', arg]); return options.tabs || []; },
      async get(id) { calls.push(['get', id]); if (options.get) return options.get(id); return { id, url: 'https://www.twitch.tv/channel' }; },
      async sendMessage(...args) { calls.push(['ping', ...args]); if (options.ping) return options.ping(...args); throw Error('no receiver'); }
    },
    scripting: {
      async executeScript(arg) { calls.push(['execute', arg]); if (options.execute) return options.execute(arg); return arg.func ? [{ documentId: 'document', result: { retired: true, legacy: false } }] : [{ documentId: 'document', result: status }]; },
      async removeCSS(arg) { calls.push(['remove', arg]); if (options.remove) return options.remove(arg); },
      async insertCSS(arg) { calls.push(['insert', arg]); if (options.insert) return options.insert(arg); }
    }
  };
  vm.runInNewContext(source, { chrome, URL, setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout, console: { warn: (...args) => warnings.push(args) } });
  const popup = { id: 'extension', url: chrome.runtime.getURL(manifest.action.default_popup) };
  function request(tabId, sender = popup) {
    return new Promise(resolve => { let asyncResult; asyncResult = events.message({ type: 'twitch-min:recover', tabId }, sender, result => queueMicrotask(() => resolve({ asyncResult, result }))); });
  }
  return { events, calls, warnings, request, popup, status };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('healthy receiver returns without injection', async () => {
  const h = setup({ ping: async () => ({ type: 'twitch-min:status', version: manifest.version, ready: true }) });
  const { result } = await h.request(1);
  assert.equal(result.ok, true);
  assert.deepEqual(h.calls.map(c => c[0]), ['get', 'ping']);
  assert.equal(h.calls[1][3].frameId, 0);
});

test('missing and outdated sessions use manifest files in the identified document', async () => {
  for (const ping of [undefined, async () => ({ type: 'twitch-min:status', version: 'old', ready: true }), async () => ({ type: 'twitch-min:status', version: manifest.version, ready: false }), async () => ({ version: manifest.version, ready: true })]) {
    const h = setup({ ping });
    const { result, asyncResult } = await h.request(3);
    assert.equal(asyncResult, true); assert.equal(result.ok, true);
    assert.deepEqual(h.calls.map(c => c[0]), ['get', 'ping', 'execute', 'remove', 'insert', 'execute']);
    for (const c of h.calls.slice(3)) assert.equal(c[1].target.documentIds[0], 'document');
    assert.deepEqual(h.calls[3][1].files, manifest.content_scripts[0].css);
    assert.deepEqual(h.calls[4][1].files, manifest.content_scripts[0].css);
    assert.deepEqual(h.calls[5][1].files, manifest.content_scripts[0].js);
  }
});

test('rejects invalid senders, tab IDs and non-Twitch URLs', async () => {
  const h = setup();
  for (const [id, sender] of [[1, { ...h.popup, id: 'other' }], [1, { ...h.popup, tab: {}, url: 'https://www.twitch.tv/' }], [1, { ...h.popup, url: h.popup.url + '?x' }], [-1, h.popup], [1.5, h.popup]]) {
    assert.equal((await h.request(id, sender)).result.ok, false);
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await h.request(1, { ...h.popup, tab: {} })).result.ok, true);
  for (const url of ['https://twitch.tv:443/a', 'https://twitch.tv.evil/a', 'http://twitch.tv/a', 'https://user@twitch.tv/a']) {
    const invalid = setup({ get: async () => ({ url }) });
    assert.equal((await invalid.request(1)).result.ok, false);
    assert.deepEqual(invalid.calls.map(c => c[0]), ['get']);
  }
});

test('deduplicates concurrent requests', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const h = setup({ ping: async () => { await gate; throw Error('missing'); } });
  const first = h.request(5), second = h.request(5); release();
  assert.equal((await first).result.ok, true); assert.equal((await second).result.ok, true);
  assert.equal(h.calls.filter(c => c[0] === 'get').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'insert').length, 1);
});

test('retirement, document navigation and readiness failures stop recovery', async () => {
  for (const execute of [
    async () => { throw Error('retirement failed'); },
    async () => [{ result: { retired: true, legacy: false } }],
    async arg => arg.func ? [{ documentId: 'doc', result: { retired: true } }] : [{ result: { ready: false } }]
  ]) {
    const h = setup({ execute });
    assert.equal((await h.request(1)).result.ok, false);
    if (h.calls.length < 6) assert.equal(h.calls.some(c => c[0] === 'insert'), false);
  }
  const h = setup({ insert: async () => { throw Error('document navigated'); } });
  assert.equal((await h.request(1)).result.ok, false);
  assert.equal(h.calls.filter(c => c[0] === 'execute').length, 1);
});

test('install, update and startup enumerate matching tabs independently', async () => {
  const h = setup({ tabs: [{ id: 1, url: 'https://twitch.tv/a' }, { id: 2, url: 'https://www.twitch.tv/b' }, { id: 3, url: 'https://evil.test/' }], get: async id => { if (id === 1) throw Error('closed'); return { id, url: 'https://www.twitch.tv/b' }; } });
  h.events.installed({ reason: 'chrome_update' }); await flush(); assert.equal(h.calls.length, 0);
  for (const trigger of [() => h.events.installed({ reason: 'install' }), () => h.events.installed({ reason: 'update' }), () => h.events.startup()]) {
    trigger(); await flush(); await flush();
  }
  assert.equal(h.calls.filter(c => c[0] === 'query').length, 3);
  assert.deepEqual(h.calls.filter(c => c[0] === 'query')[0][1].url, manifest.content_scripts[0].matches);
  assert.equal(h.calls.filter(c => c[0] === 'get' && c[1] === 3).length, 0);
  assert.equal(h.calls.filter(c => c[0] === 'insert').length, 3);
  assert.equal(h.warnings.length, 3);
});


function preflightHarness(styleKind, applied = false) {
  const listeners = new Map(), timers = new Map();
  let nextTimer = 0, style = styleKind;
  const document = {
    documentElement: { hasAttribute: () => applied },
    getElementById() { return style ? { hasAttribute: () => style === 'owned' } : null; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    dispatchEvent(event) { if (event.type === 'twitch-min:retire') dispatched++; else listeners.get(event.type)?.(event); }
  };
  let dispatched = 0;
  class Event { constructor(type) { this.type = type; } }
  const context = { document, Event, Promise,
    setTimeout(fn, ms) { assert.equal(ms, 3000); const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const h = setup({ execute: async arg => {
    if (!arg.func) return [{ result: { type: 'twitch-min:status', version: manifest.version, ready: true } }];
    const fn = vm.runInNewContext(`(${arg.func.toString()})`, context);
    return [{ documentId: 'doc', result: await fn() }];
  } });
  return { ...h, listeners, timers, get dispatched() { return dispatched; },
    acknowledge(type, removeStyle = true) { if (removeStyle) style = null; document.dispatchEvent(new Event(type)); },
    timeout() { for (const fn of [...timers.values()]) fn(); }
  };
}

test('preflight injects with no existing session and rejects legacy sessions', async () => {
  const absent = preflightHarness(null);
  assert.equal((await absent.request(1)).result.ok, true);
  assert.equal(absent.dispatched, 0);
  assert.equal(absent.timers.size, 0);
  const legacy = preflightHarness('legacy');
  assert.match((await legacy.request(1)).result.error, /Refresh required/);
  assert.equal(legacy.dispatched, 0);
  assert.equal(legacy.calls.some(c => c[0] === 'insert'), false);
});

test('preflight waits for retirement acknowledgement and releases listeners and timer', async () => {
  const h = preflightHarness('owned');
  const result = h.request(1);
  await flush();
  assert.equal(h.dispatched, 1);
  assert.equal(h.listeners.size, 2);
  assert.equal(h.timers.size, 1);
  assert.equal(h.calls.some(c => c[0] === 'insert'), false);
  h.acknowledge('twitch-min:retired');
  assert.equal((await result).result.ok, true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test('preflight retires active controllers even if the page removed their stylesheet', async () => {
  const h = preflightHarness(null, true);
  const result = h.request(1);
  await flush();
  assert.equal(h.dispatched, 1);
  assert.equal(h.calls.some(c => c[0] === 'insert'), false);
  h.acknowledge('twitch-min:retired');
  assert.equal((await result).result.ok, true);
  assert.equal(h.listeners.size, 0);
});

test('retirement failure, timeout and retained style prevent injection and release resources', async () => {
  for (const outcome of ['failed', 'timeout', 'retained']) {
    const h = preflightHarness('owned');
    const result = h.request(1);
    await flush();
    if (outcome === 'timeout') h.timeout();
    else h.acknowledge(outcome === 'failed' ? 'twitch-min:retire-failed' : 'twitch-min:retired', outcome !== 'retained');
    assert.equal((await result).result.ok, false);
    assert.equal(h.calls.some(c => c[0] === 'insert'), false);
    assert.equal(h.listeners.size, 0);
    assert.equal(h.timers.size, 0);
  }
});

test('unresponsive ping times out and releases its timer', async () => {
  const timers = new Map(); let next = 0;
  const h = setup({
    ping: () => new Promise(() => {}),
    setTimeout(fn, ms) { assert.equal(ms, 2000); const id = ++next; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const result = h.request(1);
  await flush();
  assert.equal(timers.size, 1);
  assert.equal(h.calls.some(c => c[0] === 'execute'), false);
  for (const fn of [...timers.values()]) fn();
  assert.equal((await result).result.ok, true);
  assert.equal(timers.size, 0);
});

test('ping timer is cleared on response and receiver error', async () => {
  for (const ping of [async () => ({ type: 'twitch-min:status', version: manifest.version, ready: true }), async () => { throw Error('missing'); }]) {
    const timers = new Map(); let next = 0, cleared = 0;
    const h = setup({ ping,
      setTimeout(fn, ms) { assert.equal(ms, 2000); const id = ++next; timers.set(id, fn); return id; },
      clearTimeout(id) { if (timers.delete(id)) cleared++; }
    });
    assert.equal((await h.request(1)).result.ok, true);
    assert.equal(cleared, 1);
    assert.equal(timers.size, 0);
  }
});
