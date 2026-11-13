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
    // Emote variants are fulfilled locally: no Twitch requests or login needed.
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = message.params;
      const fails = request.url.includes('unavailable') || (request.url.includes('missing-large') && request.url.endsWith('/3.0'));
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="purple"/></svg>';
      send('Fetch.fulfillRequest', {
        requestId, responseCode: fails ? 404 : 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }],
        body: Buffer.from(fails ? '' : svg).toString('base64')
      }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://static-cdn.jtvnw.net/emoticons/*' }] });
    closeBrowser = () => send('Browser.close');
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
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
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await pause(20);
      }
      assert.fail(`Timed out waiting for: ${expression}`);
    };
    const tooltipMarkup = fs.readFileSync(path.join(__dirname, 'fixtures', 'emote-tooltip.html'), 'utf8');
    const nativeTooltip = async (name, { source = 'chat-emote', id = 'native-emote-tooltip', linked = true, edge = false } = {}) => evaluate(`(()=>{
      const template=document.createElement('template');template.innerHTML=${JSON.stringify(tooltipMarkup)};
      const layer=template.content.querySelector('.tw-tooltip-layer');layer.id=${JSON.stringify(id)};
      const content=layer.querySelector('[role="tooltip"]');content.style.position='absolute';content.style.inset='0';
      const wrapper=layer.querySelector('.tw-tooltip-wrapper');wrapper.textContent=${JSON.stringify(name)};
      wrapper.style.cssText='background:rgb(52,40,64);color:rgb(245,245,245);padding:6px 8px;border-radius:4px;font:600 13px/16px Arial,sans-serif;white-space:nowrap';
      const positioner=layer.querySelector('[data-popper-placement]');positioner.id=${JSON.stringify(id + '-positioner')};positioner.style.width='max-content';
      document.body.append(template.content);
      const image=document.getElementById(${JSON.stringify(source)}),anchor=image.getBoundingClientRect(),width=positioner.getBoundingClientRect().width;
      positioner.style.transform=${edge ? "`translate(${innerWidth-10}px, ${-innerHeight+12}px)`" : "`translate(${anchor.left+(anchor.width-width)/2}px, ${anchor.top-innerHeight-8}px)`"};
      if(${linked}) image.setAttribute('aria-describedby', [image.getAttribute('aria-describedby'),positioner.id].filter(Boolean).join(' '));
      return {transform:positioner.style.transform,style:wrapper.style.cssText,description:image.getAttribute('aria-describedby')};
    })()`);

    await t.test('emote click shows one anchored name bubble with a sharp 3x image', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`window.nativeClicks = 0; document.querySelector('#emote-button').addEventListener('click', () => nativeClicks++); document.querySelector('#chat-emote').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), true);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').textContent`), 'eyesonbHmm');
      assert.deepEqual(await evaluate(`(()=>{
        const source=document.querySelector('#chat-emote').getBoundingClientRect();
        const image=document.querySelector('#twitch-min-emote-preview img');
        const r=image.getBoundingClientRect();
        return {width:r.width,height:r.height,sourceWidth:source.width,sourceHeight:source.height,src:image.src};
      })()`), { width: 84, height: 84, sourceWidth: 28, sourceHeight: 28, src: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_fixture/default/dark/3.0' });
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').naturalWidth > 0`);
      assert.equal(await evaluate(`nativeClicks`), 0, 'no competing native emote click card');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').hasAttribute('title') || document.querySelector('#emote-button').hasAttribute('title')`), false, 'native title bubbles suppressed while preview is open');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint twitch-min-emote-preview');
      await evaluate(`document.querySelector('#second-emote').click()`);
      assert.equal(await evaluate(`document.querySelectorAll('#twitch-min-emote-preview').length`), 1);
      assert.deepEqual(await evaluate(`(()=>{const i=document.querySelector('#twitch-min-emote-preview img');const r=i.getBoundingClientRect();return {width:r.width,height:r.height,src:i.src}})()`), {
        width: 72, height: 54, src: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_second/animated/light/3.0'
      }, 'non-square size, animation format, and light theme preserved');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').title`), 'eyesonbHmm');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint');
      await evaluate(`document.querySelector('#second-emote').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'same emote click closes it');
    });

    await t.test('emote bubble dismisses cleanly and ignores badges, composer and unrelated images', async () => {
      await evaluate(`document.querySelector('#chat-emote').click(); document.querySelector('#player').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'click outside closes');
      await evaluate(`document.querySelector('#emote-button').focus();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'keyboard activation on native emote buttons');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'emote-button');
      for (const id of ['chat-badge', 'outside-emote', 'picker-emote']) {
        await evaluate(`__storagePatch({chatComposer:false}); document.getElementById(${JSON.stringify(id)}).click()`);
        assert.equal(await isVisible('twitch-min-emote-preview'), false, `${id} retains its native behavior`);
      }
      await evaluate(`document.querySelector('#chat-emote').click(); __storagePatch({enabled:false})`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'master off dismisses preview');
      await evaluate(`document.querySelector('#chat-emote').click()`);
      assert.equal(await evaluate(`nativeClicks`), 1, 'master off restores native emote clicks');
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      await evaluate(`__storagePatch({...TwitchMinSettings.DEFAULTS}); document.querySelector('#chat-emote').click(); document.querySelector('#messages').dispatchEvent(new Event('scroll'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'scroll dismisses without a detached bubble');
      await evaluate(`document.querySelector('#chat-emote').click(); window.dispatchEvent(new Event('resize'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
    });

    await t.test('late replay emotes, viewport edges, navigation and unavailable larger variants', async () => {
      await navigate('tests/fixtures/twitch.html');
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      await evaluate(`(()=>{
        const image=document.querySelector('#second-emote').cloneNode(true);
        image.id='late-emote'; image.title='Late emote'; image.alt='<img src=x onerror=alert(1)>';
        image.style.cssText='position:fixed;right:0;bottom:0;width:24px;height:18px';
        document.querySelector('#messages').appendChild(image); image.click();
      })()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'delegation covers later messages');
      assert.equal(await evaluate(`document.querySelectorAll('#twitch-min-emote-preview img').length`), 1, 'emote name rendered as text');
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('#twitch-min-emote-preview').getBoundingClientRect();return r.left>=8 && r.top>=8 && r.right<=innerWidth-8 && r.bottom<=innerHeight-8})()`), true);
      await evaluate(`document.querySelector('#late-emote').remove()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'removed messages close preview');
      await evaluate(`document.querySelector('#chat-emote').click(); history.pushState({}, '', '?new-replay'); document.querySelector('#messages').appendChild(document.createElement('span'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'same-document navigation closes preview');
      await evaluate(`(()=>{
        const image=document.querySelector('#second-emote').cloneNode(true);
        image.id='fallback-emote'; image.src='https://static-cdn.jtvnw.net/emoticons/v2/missing-large/default/dark/1.0';
        document.querySelector('#messages').appendChild(image);
      })()`);
      await waitFor(`document.querySelector('#fallback-emote').complete`);
      await evaluate(`document.querySelector('#fallback-emote').click()`);
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').src.endsWith('/1.0') && document.querySelector('#twitch-min-emote-preview img').naturalWidth > 0`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect().width`), 72, 'fallback remains 3x');
      await evaluate(`document.querySelector('#player').click()`);
      await evaluate(`document.querySelector('#fallback-emote').src='https://static-cdn.jtvnw.net/emoticons/v2/unavailable/default/dark/1.0'`);
      await waitFor(`document.querySelector('#fallback-emote').complete`);
      await evaluate(`document.querySelector('#fallback-emote').click()`);
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').hidden`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').textContent`), 'OtherEmote — image unavailable');
      await evaluate(`document.querySelector('#player').click()`);
    });

    await t.test('supplied Twitch tooltip keeps its name, theme, arrow and native positioning around the 3x image', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`(()=>{const owner=document.createElement('div');owner.id='native-emote-owner';owner.tabIndex=0;const image=document.querySelector('#chat-emote').cloneNode(true);image.id='native-chat-emote';image.alt='karkalMuscles';image.title='karkalMuscles';owner.append(image);document.querySelector('#messages').append(owner);})()`);
      const before = await nativeTooltip('karkalMuscles', { source: 'native-chat-emote' });
      await evaluate(`document.querySelector('#native-chat-emote').click()`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').parentElement.matches('#native-emote-tooltip .tw-tooltip-wrapper')`), true, 'image is inserted into the real tooltip wrapper');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip').querySelectorAll('[role="tooltip"]').length`), 1, 'one native tooltip, without a nested tooltip or separate bubble');
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').hidden`), true, 'native name is retained without a second visible label');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').innerText.trim()`), 'karkalMuscles');
      assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect();return {width:r.width,height:r.height}})()`), { width: 84, height: 84 });
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper')).backgroundColor`), 'rgb(52, 40, 64)');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#twitch-min-emote-preview')).backgroundColor`), 'rgba(0, 0, 0, 0)', 'add-on inherits the native theme');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip-positioner').style.transform`), before.transform);
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-popper-arrow').style.transform`), 'translate(53px, 0px)');
      await evaluate(`document.querySelector('#native-chat-emote').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').textContent`), 'karkalMuscles', 'closing removes only the extension image');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').style.cssText`), before.style);
      assert.equal(await evaluate(`document.querySelector('#native-chat-emote').getAttribute('aria-describedby')`), before.description);
      await evaluate(`document.querySelector('#native-emote-owner').focus();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').hasAttribute('data-tq-native-emote')`), true, 'Twitch tabindex=0 emote wrappers support keyboard activation');
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'native-emote-owner');
    });

    await t.test('late native tooltips adopt the same preview; unrelated names and native dismissal stay safe', async () => {
      await navigate('tests/fixtures/twitch.html');
      await nativeTooltip('UnrelatedTooltip', { id: 'unrelated-tooltip', linked: false });
      await evaluate(`document.querySelector('#chat-emote').click();window.originalPreview=document.querySelector('#twitch-min-emote-preview')`);
      assert.equal(await evaluate(`originalPreview.hasAttribute('data-tq-native-emote')`), false, 'unrelated name is not enlarged');
      await nativeTooltip('eyesonbHmm', { id: 'matching-tooltip', linked: false });
      await waitFor(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper > #twitch-min-emote-preview')`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')===originalPreview && document.querySelectorAll('#twitch-min-emote-preview').length===1`), true, 'fallback moves into the native tooltip rather than duplicating it');
      assert.equal(await evaluate(`document.querySelector('#unrelated-tooltip .tw-tooltip-wrapper').textContent`), 'UnrelatedTooltip');
      await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper').textContent='eyesonbHmm'`);
      assert.equal(await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper > #twitch-min-emote-preview')===originalPreview`), true, 'same-name React text refresh reattaches the image');
      await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper').firstChild.data='OtherEmote'`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native wrapper reused for a different name drops the old preview');
      await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper').textContent='eyesonbHmm';document.querySelector('#chat-emote').click()`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').hasAttribute('data-tq-native-emote')`), true);
      await evaluate(`document.querySelector('#matching-tooltip .tw-transition').setAttribute('aria-hidden','true')`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native hide transition dismisses the enlarged content');
      await evaluate(`document.querySelector('#matching-tooltip .tw-transition').setAttribute('aria-hidden','false');document.querySelector('#chat-emote').click();document.querySelector('#matching-tooltip').remove()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native unmount closes the preview');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint', 'temporary native tooltip reference restores');
    });

    await t.test('native tooltip grows within viewport edges and restores markers and original Popper styles', async () => {
      await navigate('tests/fixtures/twitch.html');
      const before = await nativeTooltip('eyesonbHmm', { linked: false, edge: true });
      await evaluate(`document.querySelector('#native-emote-tooltip-positioner').removeAttribute('id');document.querySelector('#chat-emote').click()`);
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('[data-tq-emote-positioner]').getBoundingClientRect();return r.left>=7.99 && r.top>=7.99 && r.right<=innerWidth-7.99 && r.bottom<=innerHeight-7.99})()`), true);
      assert.equal(await evaluate(`document.querySelector('[data-tq-emote-positioner]').style.transform`), before.transform, 'native transform remains unchanged during clamping');
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').parentElement.id`), 'twitch-min-emote-preview-native-host', 'an ID is added only when the native wrapper has none');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-emote-host], [data-tq-emote-positioner], #twitch-min-emote-preview-native-host').length`), 0);
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').style.cssText`), before.style);
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint');
    });

    await t.test('default screenshot preset hides targets and preserves intended UI', async () => {
      await navigate('tests/fixtures/twitch.html');
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      for (const id of ['top-bits','top-turbo','top-turbo-gift','top-turbo-test','top-turbo-text','luna-offers','shouts','sidebar-for-you','sidebar-arrow','sidebar-streak','sidebar-channel-name','sidebar-hype','stray-avatar-text','stray-nested-text','offline-transition','offline-channel','other-section','show-more','channel-bell','channel-bits','channel-gift','video-share','video-share-label','vod-channel-card','vod-recommendations','about','panels','chat-header','leaderboard','composer']) {
        assert.equal(await isVisible(id), false, `${id} should be hidden`);
      }
      for (const id of ['sidebar-heading','live-heading','similar-heading','top-bell','top-bell-wrapper','actual-notifications','top-notifications-label','replay-time','replay-time-link','actual-replay-time','browse','whispers','search','account','avatar','second-avatar','viewer-count','sidebar-game','player','video-title','video-category','video-menu','follow','channel-subscribe','messages','replay-body','replay-body-link','actual-replay-message','points','chat-settings','chat-send','outside-gift','outside-share','outside-metadata']) {
        assert.equal(await isVisible(id), true, `${id} must stay visible`);
      }
      assert.equal(await evaluate(`document.querySelector('[data-a-target="chat-input"]').getClientRects().length`), 0, 'hidden editor cannot receive focus');
      const geometry = () => evaluate(`(()=>{
        const rect = id => { const r=document.getElementById(id).getBoundingClientRect(); return {x:r.x,width:r.width,height:r.height,y:r.y}; };
        return Object.fromEntries(['sidebar-shell','sidebar-overlay','sidebar-nav','channel-row','second-channel-row','avatar','viewer-count','sidebar-game','main','after-about'].map(id=>[id,rect(id)]));
      })()`);
      const before = await geometry();
      for (const id of ['sidebar-shell','sidebar-overlay','sidebar-nav','channel-row','second-channel-row']) {
        assert.equal(before[id].width, 144, `${id} uses the narrower compact sidebar width`);
      }
      assert.equal(before['sidebar-shell'].height, 650, 'native sidebar retains its full height');
      assert.equal(before['sidebar-overlay'].height, 650, 'overlay is not squeezed into a 50px vertical flex basis');
      assert.equal(await evaluate(`__nativeSidebarClicks`), 0, 'expanded native metadata stays mounted');
      assert.equal(before.main.x, 144, 'main starts immediately after the compact sidebar');
      assert.ok(before.avatar.x + before.avatar.width <= before['viewer-count'].x, 'count stays beside the avatar');
      assert.equal(before['viewer-count'].x, before['sidebar-game'].x, 'game aligns with the count');
      assert.ok(before['sidebar-game'].y >= before['viewer-count'].y + before['viewer-count'].height, 'game is below the viewer count');
      assert.ok(before['sidebar-game'].x + before['sidebar-game'].width <= before['channel-row'].x + before['channel-row'].width, 'game stays inside the row');
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      for (const id of ['top-bell','top-turbo-text','actual-notifications','sidebar-heading','sidebar-metadata','viewer-count','channel-bits','video-share','vod-channel-card','vod-recommendations','about','panels','replay-time','actual-replay-time','chat-header','leaderboard','composer']) assert.equal(await isVisible(id), true, `${id} restores`);
      const after = await geometry();
      assert.equal(after['sidebar-shell'].width, 240, 'restores the original sidebar width');
      assert.equal(after.main.x, 240);
      assert.equal(before.main.width - after.main.width, 96, 'video gains all reclaimed sidebar space');
      assert.ok(before['channel-row'].height >= 36 && before['channel-row'].height < 48, 'two-line rows have tighter spacing');
      assert.ok(after['after-about'].y - before['after-about'].y >= 340, 'About and panels collapse their entire layout space');
    });

    await t.test('channel Bits variants hide and subscription buttons keep only icons with accessible names and native actions', async () => {
      await navigate('tests/fixtures/twitch.html');
      for (const id of ['channel-bits','channel-bits-alt']) assert.equal(await isVisible(id), false, `${id} hides below the player`);
      for (const id of ['channel-subscribe','channel-resubscribe','channel-resubscribe-fallback','subscribe-star','subscribe-arrow','resubscribe-star']) assert.equal(await isVisible(id), true, `${id} remains usable`);
      for (const id of ['subscribe-label','resubscribe-label']) {
        assert.equal(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).clipPath`), 'inset(50%)');
        assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().width`), 1, 'visible text takes no space in the button layout');
      }
      const compactWidth = await evaluate(`document.querySelector('#channel-subscribe').getBoundingClientRect().width`);
      const { root: documentNode } = await send('DOM.getDocument');
      for (const [id,name] of [['channel-subscribe','Subscribe'],['channel-resubscribe','Resubscribe'],['channel-resubscribe-fallback','Resubscribe']]) {
        const { nodeId } = await send('DOM.querySelector', { nodeId: documentNode.nodeId, selector: `#${id}` });
        const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        assert.equal(nodes.find(node=>node.role?.value==='button')?.name?.value, name, `${id} retains its accessible name`);
      }
      await evaluate(`window.subscriptionClicks=0;const button=document.querySelector('#channel-subscribe');button.addEventListener('click',()=>subscriptionClicks++);button.focus();button.click();button.setAttribute('aria-label','Resubscribe');document.querySelector('#subscribe-label').textContent='Resubscribe';document.querySelector('.metadata-layout__support').insertAdjacentHTML('beforeend','<button id="late-channel-bits" aria-label="Get Bits">Bits</button>');document.body.insertAdjacentHTML('beforeend','<button id="outside-subscribe" data-a-target="subscribe-button"><svg width="20" height="20"></svg><span id="outside-subscribe-label" data-a-target="tw-core-button-label-text">Subscribe</span></button>')`);
      assert.equal(await evaluate(`subscriptionClicks`), 1, 'native subscription handlers remain attached');
      assert.equal(await evaluate(`document.activeElement.id`), 'channel-subscribe');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#subscribe-label')).clipPath`), 'inset(50%)', 'switching to resubscribe keeps text visually hidden');
      assert.equal(await isVisible('late-channel-bits'), false, 'later Bits variants hide automatically');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#outside-subscribe-label')).clipPath`), 'none', 'subscription controls outside video details stay native');
      await evaluate(`__storagePatch({topNavigation:false})`);
      assert.equal(await isVisible('top-bits'), true);
      assert.equal(await isVisible('channel-bits-alt'), false, 'channel controls do not depend on top navigation hiding');
      await evaluate(`__storagePatch({channelActions:false})`);
      for (const id of ['channel-bits','channel-bits-alt','late-channel-bits']) assert.equal(await isVisible(id), true, `${id} restores`);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#subscribe-label')).clipPath`), 'none');
      assert.ok(await evaluate(`document.querySelector('#channel-subscribe').getBoundingClientRect().width`) > compactWidth, 'pausing channel actions restores full text width');
      assert.equal(await evaluate(`document.querySelector('#subscribe-label').textContent`), 'Resubscribe', 'native label text is never rewritten or removed');
      await evaluate(`__storagePatch({channelActions:true});__storagePatch({enabled:false})`);
      assert.equal(await isVisible('channel-bits-alt'), true, 'master switch restores the channel Bits control');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#subscribe-label')).clipPath`), 'none');

      const snapshotFile = path.join(root, '.browser-tests', 'live.html');
      if (fs.existsSync(snapshotFile)) {
        await evaluate(`__storagePatch({enabled:true})`);
        await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
        try {
          const source = fs.readFileSync(snapshotFile, 'utf8');
          await evaluate(`(()=>{
            const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
            const support=snapshot.querySelector('.metadata-layout__support').cloneNode(true);
            support.querySelectorAll('script,style,link,iframe,object,embed').forEach(node=>node.remove());
            for(const node of [support,...support.querySelectorAll('*')])for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name))node.removeAttribute(attribute.name);
            support.querySelector('[data-a-target="top-nav-get-bits-button"]').id='snapshot-channel-bits';
            support.querySelector('[data-a-target="subscribe-button"]').id='snapshot-channel-subscribe';
            document.body.append(support);
          })()`);
          assert.equal(await isVisible('snapshot-channel-bits'), false, 'the actual live Bits control hides');
          assert.equal(await isVisible('snapshot-channel-subscribe'), true, 'the actual live subscription button stays visible');
          assert.equal(await evaluate(`getComputedStyle(document.querySelector('#snapshot-channel-subscribe [data-a-target="tw-core-button-label-text"]')).clipPath`), 'inset(50%)');
          assert.equal(await evaluate(`[...document.querySelectorAll('#snapshot-channel-subscribe .tw-core-button-icon svg')].every(icon=>icon.checkVisibility({checkVisibilityCSS:true}))`), true, 'native subscription icons and caret stay visible');
          assert.equal(await evaluate(`document.querySelector('#snapshot-channel-subscribe').getAttribute('aria-label')`), 'Subscribe');
        } finally {
          await send('Fetch.enable', { patterns: [{ urlPattern: 'https://static-cdn.jtvnw.net/emoticons/*' }] });
        }
      }
    });

    await t.test('sidebar scrollbar hides while scrolling works, replay times retain minutes and seeking', async () => {
      await navigate('tests/fixtures/twitch.html');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.side-nav__scrollable_content')).scrollbarWidth`), 'none');
      assert.equal(await evaluate(`(()=>{const x=document.querySelector('.side-nav__scrollable_content');const filler=document.createElement('div');filler.style.height='1500px';x.append(filler);x.scrollTop=80;return x.scrollTop>0})()`), true);
      assert.equal(await evaluate(`document.querySelector('#replay-time').getAttribute('data-tq-time')`), '1:28');
      assert.equal(await evaluate(`document.querySelector('#actual-replay-time p').getAttribute('data-tq-time')`), '1:32');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#actual-replay-time p'),'::after').content`), '"1:32"');
      assert.equal(await evaluate(`document.querySelector('#replay-time').getAttribute('href')`), '/videos/2921409707?t=1h28m10s', 'original seek target unchanged');
      await evaluate(`window.seeks=0;document.querySelector('#actual-replay-time button').addEventListener('click',()=>seeks++);document.querySelector('#actual-replay-time button').click()`);
      assert.equal(await evaluate(`seeks`), 1);
      await evaluate(`document.querySelector('#actual-replay-time p').firstChild.data='5:26'`);
      assert.equal(await evaluate(`document.querySelector('#actual-replay-time p').getAttribute('data-tq-time')`), '0:05', 'under-hour timestamps retain hours:minutes format');
      await evaluate(`document.querySelector('#messages').insertAdjacentHTML('beforeend','<div class="video-chat"><div class="vod-message__header"><button><p id="late-time">12:05:59</p></button></div></div>')`);
      assert.equal(await evaluate(`document.querySelector('#late-time').getAttribute('data-tq-time')`), '12:05');
      await evaluate(`__storagePatch({chatTimestamps:false})`);
      assert.equal(await evaluate(`document.querySelector('#late-time').hasAttribute('data-tq-time')`), false);
      assert.equal(await evaluate(`document.querySelector('#late-time').textContent`), '12:05:59', 'pausing formatting restores full native seconds');
    });

    await t.test('wheel over video adjusts volume, respects bounds and leaves page/chat/zoom/menu scrolling alone', async () => {
      await navigate('tests/fixtures/twitch.html');
      const wheel = async (target, options) => evaluate(`(()=>{const video=document.querySelector('#stream-video');const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...${JSON.stringify(options)}});document.querySelector(${JSON.stringify(target)}).dispatchEvent(event);return {volume:video.volume,muted:video.muted,prevented:event.defaultPrevented}})()`);
      await evaluate(`document.querySelector('#stream-video').volume=0.5;window.sliderEvents=0;document.querySelector('[data-a-target="player-volume-slider"]').addEventListener('input',()=>sliderEvents++)`);
      assert.deepEqual(await wheel('#stream-video', { deltaY: -100 }), { volume: 0.55, muted: false, prevented: true });
      assert.equal(await evaluate(`document.querySelector('[data-a-target="player-volume-slider"]').value`), '0.55');
      assert.equal(await evaluate(`sliderEvents`), 1);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-volume').textContent`), 'Volume 55%');
      assert.equal((await wheel('#stream-video', { deltaY: 100 })).volume, 0.5);
      await evaluate(`document.querySelector('#stream-video').volume=0.98`);
      assert.equal((await wheel('#player', { deltaY: -100 })).volume, 1);
      await evaluate(`document.querySelector('#stream-video').volume=0.02`);
      assert.equal((await wheel('#stream-video', { deltaY: 100 })).volume, 0);
      await evaluate(`document.querySelector('#stream-video').muted=true`);
      assert.deepEqual(await wheel('#stream-video', { deltaY: -100 }), { volume: 0.05, muted: false, prevented: true });
      for (const [target, options] of [['#messages',{deltaY:100}],['#player-menu',{deltaY:100}],['#stream-video',{deltaY:100,ctrlKey:true}],['#stream-video',{deltaY:1,deltaX:100}]]) {
        assert.deepEqual(await wheel(target, options), { volume: 0.05, muted: false, prevented: false });
      }
      await evaluate(`__storagePatch({enabled:false})`);
      assert.deepEqual(await wheel('#stream-video', { deltaY: -100 }), { volume: 0.05, muted: false, prevented: false });
      assert.equal(await isVisible('twitch-min-volume'), false);
    });

    await t.test('hidden About leaves a fitted player and metadata with no reserved blank lower panel', async () => {
      await navigate('tests/fixtures/player-layout.html');
      const fitted = () => evaluate(`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();const root=rect('.channel-root'),player=rect('.channel-root__player'),video=rect('#fit-video'),info=rect('.channel-root__info');return {adjacent:Math.abs(player.bottom-info.top)<1,bottom:Math.abs(info.bottom-root.bottom)<1,videoFits:Math.abs(video.height-player.height)<1,height:root.height,videoHeight:video.height}})()`);
      const initial = await fitted();
      assert.deepEqual(initial, { adjacent: true, bottom: true, videoFits: true, height: 650, videoHeight: 550 });
      await evaluate(`document.querySelector('main').style.height='450px'`);
      await waitFor(`Math.abs(document.querySelector('#fit-video').getBoundingClientRect().height-350)<1`);
      assert.deepEqual(await fitted(), { adjacent: true, bottom: true, videoFits: true, height: 450, videoHeight: 350 });
      await evaluate(`document.querySelector('.channel-root').classList.add('channel-root--theatre-mode')`);
      assert.equal(await evaluate(`document.querySelector('.persistent-player').hasAttribute('data-tq-fit-player')`), false, 'theatre mode keeps its native portal sizing');
      await evaluate(`document.querySelector('.channel-root').classList.remove('channel-root--theatre-mode')`);
      await waitFor(`document.querySelector('.persistent-player').hasAttribute('data-tq-fit-player')`);
      await evaluate(`__storagePatch({channelAbout:false})`);
      assert.equal(await isVisible('vod-card'), true);
      assert.equal(await isVisible('recommendations'), true);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.channel-root__player')).position`), 'absolute', 'native layout restores');
      assert.equal(await evaluate(`document.querySelector('.persistent-player').hasAttribute('data-tq-fit-player')`), false);
      assert.equal(await evaluate(`document.querySelector('.channel-root').style.getPropertyValue('--tq-vod-height')`), '', 'pixel fit height restores cleanly');
      await evaluate(`const main=document.querySelector('main');main.style.overflowY='auto';main.style.overflowX='hidden';main.scrollTop=180`);
      assert.ok(await evaluate(`document.querySelector('main').scrollTop > 0`), 'fixture reproduces an old About scroll offset');
      await evaluate(`__storagePatch({channelAbout:true})`);
      await waitFor(`Math.abs(document.querySelector('#fit-video').getBoundingClientRect().height-350)<1`);
      assert.equal(await evaluate(`document.querySelector('main').scrollTop`), 0, 'old panel scroll offset is removed');
      assert.equal(await evaluate(`document.querySelector('.channel-root').style.getPropertyValue('--tq-vod-height')`), '450px', 'fit uses the actual viewport height even through auto-height ancestors');
      assert.deepEqual(await fitted(), { adjacent: true, bottom: true, videoFits: true, height: 450, videoHeight: 350 });
    });

    await t.test('sidebar allowlist labels, offline transitions and unexpected third-line captions', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.sidebarHeadings = false;');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('.side-nav-section')].filter(x=>x.checkVisibility({checkVisibilityCSS:true})).map(x=>x.getAttribute('data-tq-section'))`), ['Followed','Live','Similar']);
      for (const [id,title] of [['sidebar-heading','Followed'],['live-heading','Live'],['similar-heading','Similar']]) {
        assert.equal(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}),'::before').content`), JSON.stringify(title));
      }
      const originalHeight = await evaluate(`document.querySelector('#channel-row').getBoundingClientRect().height`);
      await evaluate(`document.querySelector('#sidebar-channel-details > :first-child').insertAdjacentHTML('beforeend','<span id="late-stray" style="min-height:40px;font-size:20px">T...</span>'); document.querySelector('#sidebar-nav').insertAdjacentHTML('beforeend','<div id="late-section" class="side-nav-section" aria-label="Other recommendations"><header>Other recommendations</header><p>Extra section</p></div>')`);
      assert.equal(await isVisible('late-stray'), false);
      assert.equal(await isVisible('late-section'), false);
      assert.equal(await evaluate(`document.querySelector('#channel-row').getBoundingClientRect().height`), originalHeight, 'hidden caption creates no third row');
      await evaluate(`document.querySelector('#channel-row').classList.add('side-nav-card__link--offline')`);
      assert.equal(await isVisible('channel-row'), false);
      assert.equal(await evaluate(`document.querySelector('#channel-row').closest('.tw-transition').getBoundingClientRect().height`), 0, 'offline transition wrapper leaves no gap');
      await evaluate(`document.querySelector('#channel-row').classList.remove('side-nav-card__link--offline')`);
      assert.equal(await isVisible('viewer-count'), true, 'channel returning online reappears');
      await evaluate(`__storagePatch({sidebarSections:false})`);
      for (const id of ['offline-channel','other-section','sidebar-for-you','sidebar-streak']) assert.equal(await isVisible(id), true, `${id} restores with section filtering paused`);
    });

    await t.test('promoted followed cards keep an unclipped avatar, count and game in a normal compact row', async () => {
      const snapshotFile = path.join(root, '.browser-tests', 'live.html');
      for (const variant of ['fixture', ...(fs.existsSync(snapshotFile) ? ['supplied HTML'] : [])]) {
        await navigate('tests/fixtures/promoted-sidebar.html');
        if (variant === 'supplied HTML') {
          await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
          try {
            const source = fs.readFileSync(snapshotFile, 'utf8');
            await evaluate(`(()=>{
              const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
              const row=snapshot.querySelector('.side-nav-card__link--promoted-followed').cloneNode(true);
              row.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
              for(const node of [row,...row.querySelectorAll('*')])for(const attribute of [...node.attributes]) {
                if(/^on/i.test(attribute.name) || /^data-tq-/.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name))node.removeAttribute(attribute.name);
              }
              row.id='promoted-row';document.querySelector('#promoted-row').replaceWith(row);
            })()`);
          } finally {
            await send('Fetch.enable', { patterns: [{ urlPattern: 'https://static-cdn.jtvnw.net/emoticons/*' }] });
          }
        }
        const href = await evaluate(`(()=>{
          const row=document.querySelector('#promoted-row');
          const targets={avatar:'.tw-avatar',status:'.side-nav-card__live-status',count:'.side-nav-card__live-status span[aria-hidden="true"]',game:'.side-nav-promoted-followed-card__content p',title:'.side-nav-promoted-followed-card__title',sponsor:'.side-nav-promoted-followed-card__sponsorship',gradient:'.side-nav-promoted-followed-card__gradient',tooltip:'.side-nav-card__link__tooltip-arrow',art:'.tw-avatar + img'};
          for(const [id,selector] of Object.entries(targets))row.querySelector(selector).id='promoted-'+id;
          window.promotedClicks=0;row.addEventListener('click',event=>{event.preventDefault();promotedClicks++});return row.getAttribute('href');
        })()`);
        for (const id of ['promoted-avatar','promoted-count','promoted-game']) assert.equal(await isVisible(id), true, `${variant}: ${id} remains visible`);
        for (const id of ['promoted-title','promoted-sponsor','promoted-gradient','promoted-tooltip','promoted-art']) assert.equal(await isVisible(id), false, `${variant}: ${id} is hidden`);
        const geometry = () => evaluate(`(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return Object.fromEntries(['promoted-row','promoted-avatar','promoted-status','promoted-game','reference-row'].map(id=>[id,rect(id)]))})()`);
        const rects = await geometry(), row = rects['promoted-row'], avatar = rects['promoted-avatar'], count = rects['promoted-status'], game = rects['promoted-game'];
        assert.equal(row.width, 144, variant);
        assert.equal(row.height, rects['reference-row'].height, `${variant}: same compact height as an ordinary channel`);
        assert.equal(avatar.width, 26, variant); assert.equal(avatar.height, 26, variant);
        assert.ok(avatar.y >= row.y && avatar.bottom <= row.bottom, `${variant}: the full avatar stays inside its row`);
        assert.ok(count.x >= avatar.right, `${variant}: count appears beside the avatar`);
        assert.equal(count.x, game.x, `${variant}: game aligns with the count`);
        assert.ok(game.y >= count.bottom && game.right <= row.right, `${variant}: game fits below the count`);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('#promoted-count')).fontSize`), '13px');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('#promoted-game')).fontSize`), '12px');
        await evaluate(`document.querySelector('#promoted-count').textContent='101K';const game=document.querySelector('#promoted-game');game.textContent='Another current game';game.title='Another current game';document.querySelector('#promoted-row').click()`);
        assert.equal(await evaluate(`promotedClicks`), 1, `${variant}: native link handlers survive`);
        assert.equal((await geometry())['promoted-row'].height, row.height, `${variant}: native count/game updates preserve row height`);
        await evaluate(`__storagePatch({sidebarLabels:false})`);
        for (const id of ['promoted-title','promoted-sponsor','promoted-gradient']) assert.equal(await isVisible(id), true, `${variant}: ${id} restores`);
        assert.ok((await geometry())['promoted-row'].height > row.height, `${variant}: native card sizing restores`);
        assert.equal(await evaluate(`document.querySelector('#promoted-row').getAttribute('href')`), href, `${variant}: native destination stays intact`);
      }
    });

    await t.test('chat tints follow author colors subtly without replacing native highlights, search loses white border', async () => {
      await navigate('tests/fixtures/twitch.html');
      const colors = await evaluate(`['tint-red','tint-blue'].map(id=>{const row=document.getElementById(id),style=getComputedStyle(row);return {color:row.style.getPropertyValue('--tq-chat-color'),image:style.backgroundImage,background:style.backgroundColor}})`);
      assert.equal(colors[0].color, 'rgb(220, 30, 60)');
      assert.equal(colors[1].color, 'rgb(30, 100, 220)');
      assert.notEqual(colors[0].image, colors[1].image);
      assert.match(colors[0].image, /0\.06/);
      assert.equal(colors[1].background, 'rgb(40, 40, 40)', 'native highlight background is preserved underneath the tint');
      await evaluate(`document.querySelector('#tint-red [data-a-target="chat-message-username"]').style.color='rgb(10, 180, 90)'; document.querySelector('#messages').insertAdjacentHTML('beforeend','<div id="late-tint" class="vod-message"><span data-a-target="chat-message-username" style="color:rgb(180,80,200)">NewUser</span><span>New message</span></div>')`);
      assert.equal(await evaluate(`document.querySelector('#tint-red').style.getPropertyValue('--tq-chat-color')`), 'rgb(10, 180, 90)');
      assert.equal(await evaluate(`document.querySelector('#late-tint').style.getPropertyValue('--tq-chat-color')`), 'rgb(180, 80, 200)');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#search')).borderTopColor`), 'rgba(0, 0, 0, 0)');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#search')).boxShadow`), 'none');
      await evaluate(`document.querySelector('#search').focus()`);
      assert.equal(await evaluate(`document.querySelector('#search').matches(':focus')`), true, 'focused text input retains a focus indicator');
      assert.match(await evaluate(`getComputedStyle(document.querySelector('#search')).boxShadow`), /145, 71, 255/);
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-tint]').length`), 0);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#search')).borderTopColor`), 'rgb(255, 255, 255)');
    });

    await t.test('live chat tints read nested colored display names rather than gray username wrappers', async () => {
      await navigate('tests/fixtures/live-chat.html');
      const colors = await evaluate(`['live-pink','live-purple','live-repeat','live-class-name','live-fallback-name'].map(id=>{const row=document.getElementById(id),style=getComputedStyle(row);return {color:row.style.getPropertyValue('--tq-chat-color'),image:style.backgroundImage,background:style.backgroundColor}})`);
      assert.deepEqual(colors.map(x=>x.color), ['rgb(244, 165, 205)','rgb(139, 88, 255)','rgb(139, 88, 255)','rgb(230, 140, 20)','rgb(40, 180, 100)']);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#live-pink-wrapper')).color`), 'rgb(239, 239, 241)', 'outer wrapper uses the ordinary text color');
      assert.notEqual(colors[0].image, colors[1].image, 'different name colors produce different backgrounds');
      for (const color of colors) assert.match(color.image, /0\.06/, 'tints stay subtle');
      assert.equal(colors[1].background, 'rgb(40, 40, 40)', 'native highlights remain under the tint');
      for (const id of ['live-repeat-wrapper','live-repeat-colon']) assert.equal(await isVisible(id), false, `${id} stays grouped`);
      for (const id of ['live-repeat-badge','live-repeat-body','live-repeat-emote']) assert.equal(await isVisible(id), true, `${id} stays visible`);
      await evaluate(`document.querySelector('#live-repeat-name').style.color='rgb(10, 180, 90)'`);
      assert.equal(await evaluate(`document.querySelector('#live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(10, 180, 90)', 'hidden repeated names still update their row tint');
      await evaluate(`(()=>{const row=document.querySelector('#live-pink').cloneNode(true);for(const node of [row,...row.querySelectorAll('[id]')])node.removeAttribute('id');row.id='live-new';row.dataset.aUser='new_user';const name=row.querySelector('[data-a-target="chat-message-username"]');name.dataset.aUser='new_user';name.textContent='NewUser';name.style.color='rgb(20, 100, 220)';document.querySelector('#live-native-items').append(row)})()`);
      assert.equal(await evaluate(`document.querySelector('#live-new').style.getPropertyValue('--tq-chat-color')`), 'rgb(20, 100, 220)', 'new messages use their own inner color');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-tint], [data-tq-chat-author], [data-tq-chat-separator]').length`), 0);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#live-purple')).backgroundColor`), 'rgb(40, 40, 40)');
      for (const id of ['live-repeat-wrapper','live-repeat-colon']) assert.equal(await isVisible(id), true);
      await evaluate(`__storagePatch({enabled:true})`);
      assert.equal(await evaluate(`document.querySelector('#live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(10, 180, 90)');
      assert.equal(await isVisible('live-repeat-wrapper'), false);
    });

    await t.test('consecutive VOD senders hide only repeated names and colons, keeping every message and timestamp', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      for (const id of ['k1-author','b1-author','a1-author','k5-author','remote-author']) assert.equal(await isVisible(id), true, `${id} starts a visible sender run`);
      for (const id of ['k2-author','k3-author','k4-author','a2-author','k2-colon','k3-colon','k4-colon','a2-colon']) assert.equal(await isVisible(id), false, `${id} is hidden only on continuations`);
      for (const id of ['k2-time','k3-time','a2-time','k2-badges','a2-badges','k2-emote','k1-body','k2-body','k3-body','k4-body','a2-body']) assert.equal(await isVisible(id), true, `${id} stays intact`);
      assert.equal(await evaluate(`document.querySelector('#a2-body').textContent`), 'They now have 171 carrots!');
      assert.equal(await evaluate(`document.querySelector('#k2-time').textContent`), '2:39:30');
      assert.equal(await evaluate(`document.querySelectorAll('#vod-items > li').length`), 8, 'rows are not merged or removed');
      assert.equal(await evaluate(`document.querySelector('#k2').style.getPropertyValue('--tq-chat-color')`), 'rgb(255, 0, 0)', 'hidden author still supplies its tint');
      assert.equal(await isVisible('b1-author'), true, 'same color with another account never merges');
    });

    await t.test('sender groups repair after inserts, deletes, history prepend, identity changes and notices', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      await evaluate(`(()=>{const template=document.querySelector('#k1').closest('li').cloneNode(true);window.makeVod=(id,login)=>{const li=template.cloneNode(true);for(const n of li.querySelectorAll('[id]'))n.removeAttribute('id');const row=li.querySelector('.vod-message');row.id=id;const author=row.querySelector('[data-a-target="chat-message-username"]');author.dataset.aUser=login;author.textContent=login;row.querySelector('.video-chat__message-author').setAttribute('href','/'+login);return li;};document.querySelector('#k2').closest('li').before(makeVod('intruder','belzaca'));})()`);
      assert.equal(await isVisible('k2-author'), true, 'intervening speaker restores the next header');
      assert.equal(await isVisible('k3-author'), false, 'the following same-user message stays grouped');
      await evaluate(`document.querySelector('#intruder').closest('li').remove()`);
      assert.equal(await isVisible('k2-author'), false, 'deleting the intervening speaker joins the run');
      await evaluate(`document.querySelector('#k1').closest('li').remove()`);
      assert.equal(await isVisible('k2-author'), true, 'first visible row regains its username');
      await evaluate(`document.querySelector('#vod-items').prepend(makeVod('older','kurt442288'))`);
      assert.equal(await evaluate(`document.querySelector('#older .video-chat__message-author').checkVisibility({checkVisibilityCSS:true})`), true);
      assert.equal(await isVisible('k2-author'), false, 'loading earlier history adjusts the boundary');
      await evaluate(`const name=document.querySelector('#k2 [data-a-target="chat-message-username"]');name.dataset.aUser='another_user';name.textContent='AnotherUser';document.querySelector('#k2-author').setAttribute('href','/another_user')`);
      assert.equal(await isVisible('k2-author'), true);
      assert.equal(await isVisible('k3-author'), true, 'reused row with a different sender repairs its neighbor');
      await evaluate(`document.querySelector('#k2').closest('li').remove();const notice=document.createElement('li');notice.id='group-notice';notice.className='chat-line__status';notice.textContent='Chat status';document.querySelector('#k3').closest('li').before(notice)`);
      assert.equal(await isVisible('k3-author'), true, 'status notice breaks a sender run');
      await evaluate(`document.querySelector('#group-notice').remove()`);
      assert.equal(await isVisible('k3-author'), false);
      await evaluate(`const spacer=document.createElement('li');spacer.id='group-spacer';spacer.style.height='20px';document.querySelector('#k3').closest('li').before(spacer)`);
      assert.equal(await isVisible('k3-author'), false, 'empty virtual spacers do not become speakers');
      await evaluate(`document.querySelector('#group-spacer').textContent='Unknown system notice'`);
      assert.equal(await isVisible('k3-author'), true, 'unknown notice text also breaks the run');
      await evaluate(`document.querySelector('#group-spacer').textContent=''`);
      assert.equal(await isVisible('k3-author'), false);
    });

    await t.test('live sender grouping respects notices, stable IDs, color changes and master restoration', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      for (const id of ['l1-author','l4-author','l6-author','l7-author']) assert.equal(await isVisible(id), true, `${id} follows a boundary`);
      for (const id of ['l2-author','l2-colon','l5-author']) assert.equal(await isVisible(id), false);
      for (const id of ['l2-time','l2-body']) assert.equal(await isVisible(id), true);
      await evaluate(`document.querySelector('#l2 [data-a-target="chat-message-username"]').style.color='rgb(10,10,250)'`);
      assert.equal(await isVisible('l2-author'), false, 'color changes do not split the same account');
      assert.equal(await evaluate(`document.querySelector('#l2').style.getPropertyValue('--tq-chat-color')`), 'rgb(10, 10, 250)');
      await evaluate(`document.querySelector('#l1').remove()`);
      assert.equal(await isVisible('l2-author'), true, 'removing an old live row restores the first visible name');
      await evaluate(`document.querySelector('#live-items').insertAdjacentHTML('beforeend','<div class="chat-line__message"><span id="same-name-one" data-a-target="chat-message-username" data-user-id="101">SameName</span><span>One</span></div><div class="chat-line__message"><span id="same-name-two" data-a-target="chat-message-username" data-user-id="202">SameName</span><span>Two</span></div><div class="chat-line__message"><span id="same-name-three" data-a-target="chat-message-username" data-user-id="202">SameName</span><span>Three</span></div>')`);
      assert.equal(await isVisible('same-name-one'), true);
      assert.equal(await isVisible('same-name-two'), true, 'different account IDs are kept separate');
      assert.equal(await isVisible('same-name-three'), false, 'repeated stable account ID groups');
      await evaluate(`window.authorClicks=0;document.querySelector('#l5-author').addEventListener('click',()=>authorClicks++);__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-continuation], [data-tq-chat-author], [data-tq-chat-separator]').length`), 0);
      for (const id of ['k3-author','k4-author','a2-author','a2-colon','l5-author','same-name-three']) assert.equal(await isVisible(id), true, `${id} restores`);
      await evaluate(`document.querySelector('#l5-author').click()`);
      assert.equal(await evaluate(`authorClicks`), 1, 'native author handlers stay attached');
      await evaluate(`__storagePatch({enabled:true})`);
      assert.equal(await isVisible('l5-author'), false);
      assert.equal(await isVisible('l6-author'), true);
    });

    await t.test('each group toggles independently and CSS covers later insertions', async () => {
      await navigate('tests/fixtures/twitch.html');
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`__storagePatch({...TwitchMinSettings.DEFAULTS,chatComposer:false})`);
      assert.equal(await isVisible('composer'), true);
      assert.equal(await isVisible('leaderboard'), false);
      await evaluate(`__storagePatch({chatLeaderboard:false})`);
      assert.equal(await isVisible('leaderboard'), true);
      await evaluate(`__storagePatch({chatComposer:true,chatLeaderboard:true})`);
      await evaluate(`document.querySelector('.metadata-layout__support').insertAdjacentHTML('beforeend', '<button id="late-gift" data-a-target="gift-button">Gift</button>'); history.pushState({}, '', '?another-channel');`);
      assert.equal(await isVisible('late-gift'), false);
      await evaluate(`__storagePatch({channelActions:false})`);
      assert.equal(await isVisible('late-gift'), true);
      assert.equal(await isVisible('composer'), false);
      await evaluate(`__storagePatch({channelAbout:false,chatTimestamps:false,sidebarLabels:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      for (const id of ['about','panels','replay-time','sidebar-metadata','viewer-count']) assert.equal(await isVisible(id), true, `${id} restores independently`);
      assert.equal(await isVisible('sidebar-heading'), true, 'short section headings remain visible independently');
      assert.equal(await evaluate(`document.querySelector('#sidebar-shell').getBoundingClientRect().width`), 240);
      await evaluate(`__storagePatch({channelAbout:true,chatTimestamps:true,sidebarLabels:true}); document.querySelector('#vod-info').insertAdjacentHTML('beforeend', '<section id="late-about" data-a-target="channel-about-panel">About another channel</section>');`);
      assert.equal(await isVisible('late-about'), false, 'About rule covers later SPA inserts');
      await evaluate(`__storagePatch({enabled:false}, 'sync')`);
      assert.equal(await isVisible('composer'), false, 'sync-area changes ignored');
      await evaluate(`document.querySelector('#viewer-count').textContent='18.2K'; document.querySelector('#sidebar-game p').textContent='Warhammer Survivors'; document.querySelector('#sidebar-game p').title='Warhammer Survivors'`);
      assert.equal(await isVisible('viewer-count'), true, 'live count updates stay visible');
      assert.equal(await evaluate(`document.querySelector('#sidebar-game p').textContent`), 'Warhammer Survivors', 'native game updates appear without copying/caching metadata');
    });

    await t.test('native sidebar handles saved collapse, fast toggles, remounts and late navigation controls', async () => {
      await navigate('tests/fixtures/twitch.html', 'window.__initialSidebarCollapsed = true;');
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      assert.equal(await evaluate(`__nativeSidebarClicks`), 1, 'native expansion restores metadata omitted by Twitch collapsed rows');
      assert.equal(await isVisible('viewer-count'), true);
      assert.equal(await isVisible('sidebar-game'), true);
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed') && __nativeSidebarClicks === 2`);
      await evaluate(`__storagePatch({enabled:true}); __storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed') && __nativeSidebarClicks === 4`);
      await evaluate(`__storagePatch({enabled:true})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`(()=>{
        const old=document.querySelector('#sidebar-shell'), replacement=old.cloneNode(true);
        old.replaceWith(replacement); __mountNativeSidebar(replacement); __setNativeSidebarExpanded(false);
      })()`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      assert.equal(await isVisible('avatar'), true, 'composite avatar without side-nav-card__avatar survives remount');
      assert.equal(await isVisible('viewer-count'), true, 'count survives native sidebar remount');
      await evaluate(`document.querySelector('.top-nav').insertAdjacentHTML('beforeend', '<div><button id="late-turbo"><div data-a-target="tw-core-button-label-text">Gift Turbo</div></button></div>')`);
      assert.equal(await isVisible('late-turbo'), false, 'text-only control inserted later is hidden');
      await evaluate(`document.querySelector('#late-turbo').textContent='Account'`);
      assert.equal(await isVisible('late-turbo'), true, 'reused control is unmarked if its purpose changes');
      await evaluate(`__storagePatch({topNavigation:false}); document.querySelector('#late-turbo').textContent='Gift Turbo'`);
      assert.equal(await isVisible('late-turbo'), true, 'navigation switch restores text-only controls');
    });

    const sessionFile = path.join(root, '.browser-tests', 'test.html');
    await t.test('provided logged-in HTML: real notification, Turbo, VOD card and timestamp markup', { skip: !fs.existsSync(sessionFile) }, async () => {
      await navigate('tests/fixtures/twitch.html');
      // The supplied document is parsed inertly. Block all HTTP requests during
      // parsing, then import only sanitized UI fragments, never its scripts.
      await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
      try {
        const source = fs.readFileSync(sessionFile, 'utf8');
        const counts = await evaluate(`(()=>{
          const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)}, 'text/html');
          const clean=node=>{
            node=node.cloneNode(true);
            node.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(x=>x.remove());
          for(const element of [node,...node.querySelectorAll('*')]) {
            const nameColor=element.matches('[data-a-target="chat-message-username"], .chat-author__display-name') ? element.style.color : '';
            for(const attribute of [...element.attributes]) {
              if (/^on/i.test(attribute.name) || ['style','src','srcset'].includes(attribute.name)) element.removeAttribute(attribute.name);
            }
            if(nameColor && CSS.supports('color',nameColor)) element.style.color=nameColor;
          }
            return node;
          };
          const nav=clean(snapshot.querySelector('.top-nav'));
          document.querySelector('.top-nav').replaceWith(nav);
          const bell=nav.querySelector('.onsite-notifications'); bell.id='snapshot-notifications';
          nav.querySelector('.top-nav__prime').id='snapshot-luna';
          nav.querySelector('button[aria-label="Shouts"]').id='snapshot-shouts';
          const turbo=[...nav.querySelectorAll('button')].find(x=>x.textContent.replace(/\\s+/g,' ').trim()==='Gift Turbo'); turbo.id='snapshot-turbo';
          const side=clean(snapshot.querySelector('.side-nav'));side.id='snapshot-sidebar';
          side.querySelector('.side-nav__title').id='snapshot-for-you';
          side.querySelector('[role="group"][aria-label="Watch Streaks at risk"]').id='snapshot-streaks';
          const composite=[...side.querySelectorAll('.side-nav-card__link .tw-avatar')].find(x=>!x.closest('.side-nav-card__avatar'));
          composite.id='snapshot-composite-avatar';document.querySelector('#sidebar-shell').replaceWith(side);
          const sectionHeaders=[['Followed Channels','snapshot-followed-heading'],['Live Channels','snapshot-live-heading'],['Karkalla Viewers Also Watch','snapshot-similar-heading']];
          for(const [label,id] of sectionHeaders) [...side.querySelectorAll('.side-nav-section')].find(x=>x.getAttribute('aria-label')===label).firstElementChild.id=id;
          side.querySelector('.side-nav-card__link--offline').closest('.tw-transition').id='snapshot-offline';
          const count=side.querySelector('[data-a-target="side-nav-live-status"]');count.id='snapshot-viewers';
          const row=count.closest('.side-nav-card__link');
          row.querySelector('.side-nav-card__metadata').id='snapshot-game';
          row.querySelector('.side-nav-card__title').id='snapshot-channel-name';
          const info=clean(snapshot.querySelector('.channel-info-content'));
          document.querySelector('#vod-info').replaceWith(info);
          const metadata=info.querySelector('.metadata-layout__split-top'); metadata.id='snapshot-metadata';
          metadata.nextElementSibling.id='snapshot-channel-card';
          info.querySelector('#live-channel-stream-information').nextElementSibling.id='snapshot-recommendations';
          const message=clean(snapshot.querySelector('.vod-message'));
          message.querySelector('.vod-message__header').id='snapshot-timestamp';
          message.querySelector('.video-chat__message').id='snapshot-message';
          const repeated=message.cloneNode(true);
          for(const node of repeated.querySelectorAll('[id]'))node.removeAttribute('id');
          repeated.id='snapshot-repeated-row';
          message.querySelector('.video-chat__message-author').id='snapshot-first-author';
          repeated.querySelector('.video-chat__message-author').id='snapshot-repeated-author';
          repeated.querySelector('.video-chat__message > span:first-child').id='snapshot-repeated-colon';
          repeated.querySelector('[data-a-target="chat-message-text"]').id='snapshot-repeated-text';
          repeated.querySelector('.vod-message__header').id='snapshot-repeated-time';
          const chat=document.createElement('div');chat.className='video-chat';chat.append(message,repeated);document.querySelector('#messages').append(chat);
          return {bell:!!bell,turbo:!!turbo,metadata:!!metadata};
        })()`);
        assert.deepEqual(counts, { bell: true, turbo: true, metadata: true });
        for (const id of ['snapshot-luna','snapshot-shouts','snapshot-turbo','snapshot-channel-card','snapshot-recommendations','snapshot-for-you','snapshot-streaks','snapshot-channel-name','snapshot-offline']) assert.equal(await isVisible(id), false, `${id} hidden in supplied markup`);
        for (const id of ['snapshot-notifications','snapshot-timestamp','snapshot-metadata','snapshot-message','snapshot-composite-avatar','snapshot-viewers','snapshot-game']) assert.equal(await isVisible(id), true, `${id} retained in supplied markup`);
        assert.match(await evaluate(`document.querySelector('#snapshot-timestamp p').getAttribute('data-tq-time')`), /^\d+:\d{2}$/, 'real replay timestamp shows hours and minutes');
        assert.equal(await isVisible('snapshot-first-author'), true);
        for (const id of ['snapshot-repeated-author','snapshot-repeated-colon']) assert.equal(await isVisible(id), false, `${id} hides in native VOD markup`);
        for (const id of ['snapshot-repeated-row','snapshot-repeated-time','snapshot-repeated-text']) assert.equal(await isVisible(id), true, `${id} is preserved`);
        assert.equal(await evaluate(`(()=>{const count=document.querySelector('#snapshot-viewers').getBoundingClientRect(),game=document.querySelector('#snapshot-game').getBoundingClientRect();return count.x===game.x && game.y>=count.bottom})()`), true, 'actual logged-in game appears below its viewer count');
        for (const [id,label] of [['snapshot-followed-heading','Followed'],['snapshot-live-heading','Live'],['snapshot-similar-heading','Similar']]) {
          assert.equal(await isVisible(id), true);
          assert.equal(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}),'::before').content`), JSON.stringify(label));
        }
        assert.ok(await evaluate(`document.querySelector('#snapshot-sidebar .side-nav__overlay-wrapper').getBoundingClientRect().height >= 650`), 'logged-in overlay is never squeezed into a 50px vertical flex basis');
        await evaluate(`__storagePatch({enabled:false})`);
        for (const id of ['snapshot-repeated-author','snapshot-repeated-colon']) assert.equal(await isVisible(id), true, `${id} restores`);
        for (const id of ['snapshot-notifications','snapshot-turbo','snapshot-channel-card','snapshot-recommendations','snapshot-timestamp','snapshot-for-you','snapshot-streaks']) assert.equal(await isVisible(id), true, `${id} restores in supplied markup`);
      } finally {
        await send('Fetch.enable', { patterns: [{ urlPattern: 'https://static-cdn.jtvnw.net/emoticons/*' }] });
      }
    });

    const liveSessionFile = path.join(root, '.browser-tests', 'live.html');
    await t.test('provided live HTML: every tint uses the nested name color and native grouping preserves badges', { skip: !fs.existsSync(liveSessionFile) }, async () => {
      await navigate('tests/fixtures/live-chat.html');
      await send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
      try {
        const source = fs.readFileSync(liveSessionFile, 'utf8');
        const imported = await evaluate(`(()=>{
          const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
          const container=snapshot.querySelector('.chat-scrollable-area__message-container').cloneNode(true);
          container.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
          for(const node of [container,...container.querySelectorAll('*')]) {
            const nameColor=node.matches('[data-a-target="chat-message-username"], .chat-author__display-name') ? node.style.color : '';
            for(const attribute of [...node.attributes]) {
              if(/^on/i.test(attribute.name) || /^data-tq-/.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name)) node.removeAttribute(attribute.name);
            }
            if(nameColor && CSS.supports('color',nameColor)) node.style.color=nameColor;
          }
          container.id='snapshot-live-chat';
          const first=container.querySelector('.chat-line__message').cloneNode(true),repeat=first.cloneNode(true);
          first.id='snapshot-live-first';repeat.id='snapshot-live-repeat';
          repeat.querySelector('.chat-line__username').id='snapshot-live-repeat-author';
          repeat.querySelector('.chat-line__username-container').id='snapshot-live-repeat-identity';
          repeat.querySelector('.chat-line__username-container + span[aria-hidden="true"]').id='snapshot-live-repeat-colon';
          repeat.querySelector('[data-a-target="chat-line-message-body"]').id='snapshot-live-repeat-body';
          container.append(first,repeat);
          document.querySelector('#live-native-items').replaceWith(container);
          const rows=[...container.querySelectorAll('.chat-line__message')];
          return {rows:rows.length, distinct:new Set(rows.map(row=>row.querySelector('[data-a-target="chat-message-username"]').style.color)).size};
        })()`);
        assert.ok(imported.rows > 100, 'the supplied live message history is covered');
        assert.ok(imported.distinct > 5, 'the snapshot includes varied name colors');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#snapshot-live-chat .chat-line__message')].flatMap((row,i)=>{const author=row.querySelector('[data-a-target="chat-message-username"]'),style=getComputedStyle(row);return row.style.getPropertyValue('--tq-chat-color')===getComputedStyle(author).color && style.backgroundImage!=='none' ? [] : [i]})`), [], 'every live tint matches its colored display name');
        for (const id of ['snapshot-live-repeat-author','snapshot-live-repeat-colon']) assert.equal(await isVisible(id), false, `${id} stays grouped`);
        for (const id of ['snapshot-live-repeat-identity','snapshot-live-repeat-body']) assert.equal(await isVisible(id), true, `${id} stays visible`);
        assert.equal(await evaluate(`document.querySelector('#snapshot-live-repeat [data-tq-chat-author]').matches('.chat-line__username')`), true, 'the name wrapper hides independently of its badge siblings');
        await evaluate(`document.querySelector('#snapshot-live-repeat [data-a-target="chat-message-username"]').style.color='rgb(25, 190, 150)'`);
        assert.equal(await evaluate(`document.querySelector('#snapshot-live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(25, 190, 150)');
        await evaluate(`__storagePatch({enabled:false})`);
        assert.equal(await evaluate(`document.querySelectorAll('#snapshot-live-chat [data-tq-chat-tint], #snapshot-live-chat [data-tq-chat-author], #snapshot-live-chat [data-tq-chat-separator]').length`), 0);
        for (const id of ['snapshot-live-repeat-author','snapshot-live-repeat-colon']) assert.equal(await isVisible(id), true, `${id} restores`);
      } finally {
        await send('Fetch.enable', { patterns: [{ urlPattern: 'https://static-cdn.jtvnw.net/emoticons/*' }] });
      }
    });

    await t.test('saved disabled state and read failure leave Twitch usable', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.enabled = false;');
      assert.equal(await isVisible('composer'), true);
      await evaluate(`document.querySelector('#chat-emote').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      await navigate('tests/fixtures/twitch.html', '__readError = true;');
      assert.equal(await isVisible('composer'), true);
      await evaluate(`document.querySelector('#chat-emote').click()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'unknown preferences leave native emotes alone');
      assert.equal(await evaluate(`document.documentElement.hasAttribute('data-tq-enabled')`), false);
    });

    await t.test('popup saves changed keys, restores, presets, and handles external changes', async () => {
      await navigate('extension/popup.html');
      assert.equal(await evaluate(`document.querySelectorAll('#groups input').length`), 8);
      assert.equal(await evaluate(`document.body.scrollWidth <= document.body.clientWidth`), true, 'no horizontal overflow');
      await evaluate(`document.querySelector('#group-chatComposer').focus(); document.querySelector('#group-chatComposer').click()`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { chatComposer: false });
      assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'group-chatComposer', 'keyboard focus survives saving');
      await evaluate(`document.querySelector('#restore-button').click()`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { enabled: false });
      assert.equal(await evaluate(`document.querySelector('#master-toggle').checked`), false);
      await evaluate(`document.querySelector('#preset-button').click()`);
      assert.equal(await evaluate(`Object.values(__writes.at(-1)).every(value=>value===true) && Object.keys(__writes.at(-1)).length===9`), true);
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
