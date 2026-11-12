const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// A real installed Chrome, using only Node built-ins. No test server or npm deps.
test('real Chrome: CSS, reversible settings, dynamic content, popup and failures', { timeout: 60000 }, async t => {
  const chromePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(file => fs.existsSync(file));
  assert.ok(chromePath, 'Install Chrome or set CHROME_PATH to run browser tests.');
  const profile = path.join(root, '.browser-tests', randomUUID());
  fs.mkdirSync(profile, { recursive: true });
  const browser = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  let socket;
  let closeBrowser;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let attempt = 0; !fs.existsSync(portFile) && attempt < 200; attempt++) await pause(50);
    assert.ok(fs.existsSync(portFile), 'Chrome must expose its test debugging endpoint.');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    assert.ok(page);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeout);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
    closeBrowser = () => send('Browser.close');
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable');
    const mock = fs.readFileSync(path.join(__dirname, 'mock-storage.cjs'), 'utf8');
    let initScript;
    const navigate = async (file, setup = '') => {
      if (initScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
      initScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `${mock}\n${setup}` })).identifier;
      const url = pathToFileURL(path.join(root, file)).href;
      await send('Page.navigate', { url });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`)) return;
        await pause(25);
      }
      throw new Error(`Page did not load: ${file}`);
    };
    const isVisible = id => evaluate(`(()=>{ const x = document.getElementById(${JSON.stringify(id)}); return !!x && x.checkVisibility({checkVisibilityCSS:true}); })()`);

    await t.test('default screenshot preset hides targets and preserves intended UI', async () => {
      await navigate('tests/fixtures/twitch.html');
      for (const id of ['top-bell','top-bits','top-turbo','sidebar-heading','sidebar-arrow','sidebar-streak','sidebar-metadata','sidebar-hype','show-more','channel-bell','channel-bits','channel-gift','leaderboard','composer']) {
        assert.equal(await isVisible(id), false, `${id} should be hidden`);
      }
      for (const id of ['browse','whispers','avatar','viewer-count','player','follow','channel-subscribe','chat-header','messages','points','chat-settings','chat-send','outside-gift','outside-metadata']) {
        assert.equal(await isVisible(id), true, `${id} must stay visible`);
      }
      assert.equal(await evaluate(`document.querySelector('[data-a-target="chat-input"]').getClientRects().length`), 0, 'hidden editor cannot receive focus');
      const before = await evaluate(`(()=>{const r=document.querySelector('#channel-row').getBoundingClientRect();return {width:r.width,height:r.height,countX:document.querySelector('#viewer-count').getBoundingClientRect().x}})()`);
      await evaluate(`__storagePatch({enabled:false})`);
      for (const id of ['top-bell','sidebar-heading','sidebar-metadata','channel-bits','leaderboard','composer']) assert.equal(await isVisible(id), true, `${id} restores`);
      const after = await evaluate(`(()=>{const r=document.querySelector('#channel-row').getBoundingClientRect();return {width:r.width,height:r.height,countX:document.querySelector('#viewer-count').getBoundingClientRect().x}})()`);
      assert.deepEqual(before, after, 'sidebar geometry stays unchanged');
    });

    await t.test('each group toggles independently and CSS covers later insertions', async () => {
      await evaluate(`__storagePatch({...TwitchMinSettings.DEFAULTS,chatComposer:false})`);
      assert.equal(await isVisible('composer'), true);
      assert.equal(await isVisible('leaderboard'), false);
      await evaluate(`__storagePatch({chatLeaderboard:false})`);
      assert.equal(await isVisible('leaderboard'), true);
      await evaluate(`__storagePatch({chatComposer:true,chatLeaderboard:true})`);
      await evaluate(`document.querySelector('.channel-info-content').insertAdjacentHTML('beforeend', '<button id="late-gift" data-a-target="gift-button">Gift</button>'); history.pushState({}, '', '?another-channel');`);
      assert.equal(await isVisible('late-gift'), false);
      await evaluate(`__storagePatch({channelActions:false})`);
      assert.equal(await isVisible('late-gift'), true);
      assert.equal(await isVisible('composer'), false);
      await evaluate(`__storagePatch({enabled:false}, 'sync')`);
      assert.equal(await isVisible('composer'), false, 'sync-area changes ignored');
    });

    await t.test('saved disabled state and read failure leave Twitch usable', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.enabled = false;');
      assert.equal(await isVisible('composer'), true);
      await navigate('tests/fixtures/twitch.html', '__readError = true;');
      assert.equal(await isVisible('composer'), true);
      assert.equal(await evaluate(`document.documentElement.hasAttribute('data-tq-enabled')`), false);
    });

    await t.test('popup saves changed keys, restores, presets, and handles external changes', async () => {
      await navigate('extension/popup.html');
      assert.equal(await evaluate(`document.querySelectorAll('#groups input').length`), 6);
      assert.equal(await evaluate(`document.body.scrollWidth <= document.body.clientWidth`), true, 'no horizontal overflow');
      await evaluate(`document.querySelector('#group-chatComposer').focus(); document.querySelector('#group-chatComposer').click()`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { chatComposer: false });
      assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'group-chatComposer', 'keyboard focus survives saving');
      await evaluate(`document.querySelector('#restore-button').click()`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { enabled: false });
      assert.equal(await evaluate(`document.querySelector('#master-toggle').checked`), false);
      await evaluate(`document.querySelector('#preset-button').click()`);
      assert.equal(await evaluate(`Object.values(__writes.at(-1)).every(value=>value===true) && Object.keys(__writes.at(-1)).length===7`), true);
      await evaluate(`__storagePatch({sidebarLabels:false})`);
      assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), false);
      await evaluate(`__storagePatch({sidebarLabels:undefined})`);
      assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), true);
    });

    await t.test('popup exposes storage read/write failures without leaving controls stuck', async () => {
      await evaluate(`__writeError=true; document.querySelector('#group-chatComposer').click()`);
      assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'failed write rolls back');
      assert.equal(await evaluate(`document.querySelector('#status').hidden`), false);
      assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false);
      await navigate('extension/popup.html', '__readError=true;');
      assert.equal(await evaluate(`document.querySelector('#status').hidden`), false);
      assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), true);
    });
  } finally {
    if (closeBrowser && socket?.readyState === WebSocket.OPEN) await closeBrowser().catch(() => {});
    socket?.close();
    // Terminate only the Chrome child launched for this test profile.
    browser.kill();
  }
});
