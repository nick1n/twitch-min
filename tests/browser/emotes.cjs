const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    const tooltipMarkup = fs.readFileSync(path.join(__dirname, '../fixtures', 'emote-tooltip.html'), 'utf8');
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
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`window.nativeClicks = 0; document.querySelector('#emote-button').addEventListener('click', () => nativeClicks++)`);
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
};
