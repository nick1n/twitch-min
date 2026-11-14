const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    const nativeStyle = selector => evaluate(`(()=>{
      const copy=document.createElement('div').style;copy.cssText=document.querySelector(${JSON.stringify(selector)}).style.cssText;
      // The independent brightness feature owns these temporary variables.
      for(const key of [...copy])if(key.startsWith('--tq-cap-'))copy.removeProperty(key);
      return copy.cssText;
    })()`);
    const tooltipMarkup = fs.readFileSync(path.join(__dirname, '../fixtures', 'emote-tooltip.html'), 'utf8');
    const nativeTooltip = async (name, { source = 'chat-emote', id = 'native-emote-tooltip', linked = true, edge = false, hidden = false } = {}) => evaluate(`(()=>{
      const template=document.createElement('template');template.innerHTML=${JSON.stringify(tooltipMarkup)};
      const layer=template.content.querySelector('.tw-tooltip-layer');layer.id=${JSON.stringify(id)};
      if(${hidden})layer.setAttribute('aria-hidden','true');
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


    await t.test('first real pointer hover enlarges the user-supplied Twitch popup without clicks', async () => {
      await navigate('tests/fixtures/twitch.html');
      const point = await evaluate(`(()=>{
        const image=document.querySelector('#chat-emote'),source=document.querySelector('#emote-button');
        image.alt='jmaria2Giggle';source.style.cssText='position:fixed;left:500px;top:200px;z-index:10';
        window.nativeHoverCount=0;window.nativeClickCount=0;
        source.addEventListener('click',()=>nativeClickCount++);
        source.addEventListener('mouseover',()=>{
          nativeHoverCount++;
          const template=document.createElement('template');template.innerHTML=${JSON.stringify(tooltipMarkup)};
          const wrapper=template.content.querySelector('.tw-tooltip-wrapper');wrapper.textContent=image.alt;
          const rect=image.getBoundingClientRect();
          const positioner=template.content.querySelector('[data-popper-placement]');
          positioner.style.transform='translate('+rect.left+'px,'+(rect.top-innerHeight-8)+'px)';
          document.body.append(template.content);
        },{once:true});
        const rect=image.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
      })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await waitFor(`document.querySelector('.tw-tooltip-wrapper > #twitch-min-emote-preview img')?.naturalWidth>0`);
      assert.deepEqual(await evaluate(`[nativeHoverCount,nativeClickCount]`), [1,0], 'one hover opens the enlarged native tooltip without a click or re-hover');
      assert.equal(await evaluate(`document.querySelector('.tw-tooltip-wrapper').innerText.trim()`), 'jmaria2Giggle');
      assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect();return [r.width,r.height]})()`), [84,84]);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'pointer exit removes only the image');
      assert.equal(await evaluate(`document.querySelector('.tw-tooltip-wrapper').textContent`), 'jmaria2Giggle');
    });

    await t.test('emote hover puts one sharp 3x image above the name inside Twitch\'s tooltip', async () => {
      await navigate('tests/fixtures/twitch.html');
      await nativeTooltip('eyesonbHmm');
      await evaluate(`window.nativeClicks = 0; document.querySelector('#emote-button').addEventListener('click', () => nativeClicks++); document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), true);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').hidden`), true, 'Twitch owns the name label');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').firstElementChild.id`), 'twitch-min-emote-preview', 'image is above the native name');
      assert.deepEqual(await evaluate(`(()=>{
        const source=document.querySelector('#chat-emote').getBoundingClientRect();
        const image=document.querySelector('#twitch-min-emote-preview img');
        const r=image.getBoundingClientRect();
        return {width:r.width,height:r.height,sourceWidth:source.width,sourceHeight:source.height,src:image.src};
      })()`), { width: 84, height: 84, sourceWidth: 28, sourceHeight: 28, src: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_fixture/default/dark/3.0' });
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').naturalWidth > 0`);
      assert.equal(await evaluate(`nativeClicks`), 0, 'no competing native emote click card');
      await evaluate(`document.querySelector('#chat-emote').click()`);
      assert.equal(await evaluate(`nativeClicks`), 1, 'the extension leaves native emote clicks alone');
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'click does not toggle the hover image');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').hasAttribute('title') || document.querySelector('#emote-button').hasAttribute('title')`), false, 'native title bubbles suppressed while preview is open');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint native-emote-tooltip-positioner');
      await nativeTooltip('OtherEmote', { source: 'second-emote', id: 'second-tooltip' });
      await evaluate(`document.querySelector('#second-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelectorAll('#twitch-min-emote-preview').length`), 1);
      assert.deepEqual(await evaluate(`(()=>{const i=document.querySelector('#twitch-min-emote-preview img');const r=i.getBoundingClientRect();return {width:r.width,height:r.height,src:i.src}})()`), {
        width: 72, height: 54, src: 'https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_second/animated/light/3.0'
      }, 'non-square size, animation format, and light theme preserved');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').title`), 'eyesonbHmm');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint native-emote-tooltip-positioner');
      await evaluate(`document.querySelector('#second-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      await evaluate(`document.querySelector('#second-emote').dispatchEvent(new PointerEvent('pointerout',{bubbles:true}))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'leaving the emote closes it');
    });

    await t.test('emote hover dismisses cleanly and ignores badges, composer and unrelated images', async () => {
      await navigate('tests/fixtures/twitch.html');
      await nativeTooltip('eyesonbHmm');
      await evaluate(`window.nativeClicks=0;window.nativeKeys=[];document.querySelector('#emote-button').addEventListener('click',()=>nativeClicks++);document.querySelector('#emote-button').addEventListener('keydown',event=>nativeKeys.push([event.key,event.defaultPrevented]))`);
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); document.dispatchEvent(new Event('scroll'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'click outside closes');
      await evaluate(`document.querySelector('#emote-button').focus({preventScroll:true});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.deepEqual(await evaluate(`nativeKeys`), [['Enter',false]], 'native keyboard handlers receive an unmodified Enter');
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'focus supports native buttons without intercepting Enter');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'emote-button');
      for (const id of ['chat-badge', 'outside-emote', 'picker-emote']) {
        await evaluate(`__storagePatch({chatComposer:false}); document.getElementById(${JSON.stringify(id)}).dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
        assert.equal(await isVisible('twitch-min-emote-preview'), false, `${id} retains its native behavior`);
      }
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); __storagePatch({enabled:false})`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'master off dismisses preview');
      const previousClicks = await evaluate(`nativeClicks`);
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      await evaluate(`document.querySelector('#chat-emote').click()`);
      assert.equal(await evaluate(`nativeClicks`), previousClicks + 1, 'paused clicks retain native behavior');
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      await evaluate(`__storagePatch({...TwitchMinSettings.DEFAULTS}); document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); document.querySelector('#messages').dispatchEvent(new Event('scroll'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'scroll dismisses without a detached bubble');
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); window.dispatchEvent(new Event('resize'))`);
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
        document.querySelector('#messages').appendChild(image);
      })()`);
      await nativeTooltip('<img src=x onerror=alert(1)>', { source: 'late-emote' });
      await evaluate(`document.querySelector('#late-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'delegation covers later messages');
      assert.equal(await evaluate(`document.querySelectorAll('#twitch-min-emote-preview img').length`), 1, 'emote name rendered as text');
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('#twitch-min-emote-preview').getBoundingClientRect();return r.left>=8 && r.top>=8 && r.right<=innerWidth-8 && r.bottom<=innerHeight-8})()`), true);
      await evaluate(`document.querySelector('#late-emote').remove()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'removed messages close preview');
      await nativeTooltip('eyesonbHmm', { id: 'navigation-tooltip' });
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); history.pushState({}, '', '?new-replay'); document.querySelector('#messages').appendChild(document.createElement('span'))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'same-document navigation closes preview');
      await evaluate(`(()=>{
        const image=document.querySelector('#second-emote').cloneNode(true);
        image.id='fallback-emote'; image.src='https://static-cdn.jtvnw.net/emoticons/v2/missing-large/default/dark/1.0';
        document.querySelector('#messages').appendChild(image);
      })()`);
      await waitFor(`document.querySelector('#fallback-emote').complete`);
      await nativeTooltip('OtherEmote', { source: 'fallback-emote', id: 'fallback-tooltip' });
      await evaluate(`document.querySelector('#fallback-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').src.endsWith('/1.0') && document.querySelector('#twitch-min-emote-preview img').naturalWidth > 0`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect().width`), 72, 'fallback remains 3x');
      await evaluate(`document.dispatchEvent(new Event('scroll'))`);
      await evaluate(`document.querySelector('#fallback-emote').src='https://static-cdn.jtvnw.net/emoticons/v2/unavailable/default/dark/1.0'`);
      await waitFor(`document.querySelector('#fallback-emote').complete`);
      await evaluate(`document.querySelector('#fallback-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      await waitFor(`document.querySelector('#twitch-min-emote-preview img').hidden`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').textContent`), 'Image unavailable');
      await evaluate(`document.dispatchEvent(new Event('scroll'))`);
    });

    await t.test('supplied Twitch tooltip keeps its name, theme, arrow and native positioning around the 3x image', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`(()=>{const owner=document.createElement('div');owner.id='native-emote-owner';owner.tabIndex=0;const image=document.querySelector('#chat-emote').cloneNode(true);image.id='native-chat-emote';image.alt='karkalMuscles';image.title='karkalMuscles';owner.append(image);document.querySelector('#messages').append(owner);})()`);
      const before = await nativeTooltip('karkalMuscles', { source: 'native-chat-emote' });
      await evaluate(`document.querySelector('#native-chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').parentElement.matches('#native-emote-tooltip .tw-tooltip-wrapper')`), true, 'image is inserted into the real tooltip wrapper');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip').querySelectorAll('[role="tooltip"]').length`), 1, 'one native tooltip, without a nested tooltip or separate bubble');
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview > span').hidden`), true, 'native name is retained without a second visible label');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').innerText.trim()`), 'karkalMuscles');
      assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect();return {width:r.width,height:r.height}})()`), { width: 84, height: 84 });
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper')).backgroundColor`), 'rgb(52, 40, 64)');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#twitch-min-emote-preview')).backgroundColor`), 'rgba(0, 0, 0, 0)', 'add-on inherits the native theme');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip-positioner').style.transform`), before.transform);
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-popper-arrow').style.transform`), 'translate(53px, 0px)');
      await evaluate(`document.querySelector('#native-chat-emote').dispatchEvent(new PointerEvent('pointerout',{bubbles:true}))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').textContent`), 'karkalMuscles', 'closing removes only the extension image');
      assert.equal(await nativeStyle('#native-emote-tooltip .tw-tooltip-wrapper'), before.style);
      assert.equal(await evaluate(`document.querySelector('#native-chat-emote').getAttribute('aria-describedby')`), before.description);
      await evaluate(`document.querySelector('#native-emote-owner').focus({preventScroll:true});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').hasAttribute('data-tq-native-emote')`), true, 'Twitch tabindex=0 emote wrappers support focus previews');
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.activeElement.id`), 'native-emote-owner');
    });

    await t.test('late native tooltips receive the pending image without any standalone popup', async () => {
      await navigate('tests/fixtures/twitch.html');
      await nativeTooltip('UnrelatedTooltip', { id: 'unrelated-tooltip', linked: false });
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null, 'no custom popup while waiting for a matching Twitch tooltip');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint', 'no dangling reference to a detached preview');
      await nativeTooltip('eyesonbHmm', { id: 'matching-tooltip', linked: false, hidden: true });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null, 'a hidden native layer does not receive a visible preview');
      await evaluate(`document.querySelector('#matching-tooltip').setAttribute('aria-hidden','false')`);
      await waitFor(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper > #twitch-min-emote-preview')`);
      await evaluate(`window.originalPreview=document.querySelector('#twitch-min-emote-preview')`);
      assert.equal(await evaluate(`document.querySelectorAll('#twitch-min-emote-preview').length`), 1, 'only the native tooltip receives an image');
      assert.equal(await evaluate(`document.querySelector('#unrelated-tooltip .tw-tooltip-wrapper').textContent`), 'UnrelatedTooltip');
      await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper').textContent='eyesonbHmm'`);
      assert.equal(await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper > #twitch-min-emote-preview')===originalPreview`), true, 'same-name React text refresh reattaches the image');
      await evaluate(`[...document.querySelector('#matching-tooltip .tw-tooltip-wrapper').childNodes].find(node=>node.nodeType===Node.TEXT_NODE).data='OtherEmote'`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native wrapper reused for a different name drops the old preview');
      await evaluate(`document.querySelector('#matching-tooltip .tw-tooltip-wrapper').textContent='eyesonbHmm';document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').hasAttribute('data-tq-native-emote')`), true);
      await evaluate(`document.querySelector('#matching-tooltip .tw-transition').setAttribute('aria-hidden','true')`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native hide transition dismisses the enlarged content');
      await evaluate(`document.querySelector('#matching-tooltip .tw-transition').setAttribute('aria-hidden','false');document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));document.querySelector('#matching-tooltip').remove()`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false, 'native unmount closes the preview');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint', 'temporary native tooltip reference restores');
    });

    await t.test('rich native emote tooltip keeps its metadata below the 3x image and restores original nodes', async () => {
      await navigate('tests/fixtures/twitch.html');
      const before = await nativeTooltip('eyesonbHmm');
      await evaluate(`(()=>{
        const wrapper=document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper');
        wrapper.innerHTML='<strong id="native-emote-name" style="display:block">eyesonbHmm</strong><span id="native-emote-author" style="display:block">ChannelAuthor</span><span id="native-emote-provider" style="display:block">Twitch Emotes</span>';
        window.originalEmoteDetails=[...wrapper.childNodes];document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
      })()`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').parentElement.matches('#native-emote-tooltip .tw-tooltip-wrapper')`), true, 'metadata does not prevent matching the native emote name');
      assert.equal(await evaluate(`document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').innerText.trim()`), 'eyesonbHmm\nChannelAuthor\nTwitch Emotes');
      assert.equal(await evaluate(`(()=>{const image=document.querySelector('#twitch-min-emote-preview img').getBoundingClientRect();const name=document.querySelector('#native-emote-name').getBoundingClientRect();return image.bottom<=name.top && image.width===84 && image.height===84})()`), true, 'image appears above the centered native labels at three times the source size');
      assert.equal(await evaluate(`originalEmoteDetails.every(node=>node.parentElement.matches('#native-emote-tooltip .tw-tooltip-wrapper'))`), true, 'native labels are retained, without cloning or reconstruction');
      assert.equal(await evaluate(`document.querySelectorAll('#native-emote-tooltip [role="tooltip"]').length`), 1);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').hasAttribute('popover') || document.querySelector('#twitch-min-emote-preview').hasAttribute('role')`), false);
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null);
      assert.equal(await evaluate(`originalEmoteDetails.every((node,i)=>document.querySelector('#native-emote-tooltip .tw-tooltip-wrapper').childNodes[i]===node)`), true);
      assert.equal(await nativeStyle('#native-emote-tooltip .tw-tooltip-wrapper'), before.style);
    });

    await t.test('pending native-only emote previews cancel on pointer exit, pause, removal and navigation', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerout',{bubbles:true}))`);
      await nativeTooltip('eyesonbHmm', { linked: false });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null, 'a canceled pending hover cannot attach to a later tooltip');
      await evaluate(`document.querySelector('#native-emote-tooltip').remove();document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));__storagePatch({enabled:false})`);
      await nativeTooltip('eyesonbHmm', { linked: false });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null, 'pause cancels the pending observer');
      assert.equal(await evaluate(`document.querySelector('#chat-emote').title`), 'eyesonbHmm');
      await evaluate(`document.querySelector('#native-emote-tooltip').remove();__storagePatch({enabled:true});document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));window.detachedEmote=document.querySelector('#chat-emote');detachedEmote.remove()`);
      assert.equal(await evaluate(`detachedEmote.title`), 'eyesonbHmm', 'detached source restores its title');
      await evaluate(`document.querySelector('#emote-button').append(detachedEmote);detachedEmote.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));history.pushState({},'', '?later-video');document.querySelector('#messages').append(document.createElement('span'))`);
      await nativeTooltip('eyesonbHmm', { linked: false });
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null, 'navigation cancels pending work');
      await evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await isVisible('twitch-min-emote-preview'), true, 'later navigation can activate a new native preview');
    });

    await t.test('native tooltip grows within viewport edges and restores markers and original Popper styles', async () => {
      await navigate('tests/fixtures/twitch.html');
      const before = await nativeTooltip('eyesonbHmm', { linked: false, edge: true });
      await evaluate(`document.querySelector('#native-emote-tooltip-positioner').removeAttribute('id');document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('[data-tq-emote-positioner]').getBoundingClientRect();return r.left>=7.99 && r.top>=7.99 && r.right<=innerWidth-7.99 && r.bottom<=innerHeight-7.99})()`), true);
      assert.equal(await evaluate(`document.querySelector('[data-tq-emote-positioner]').style.transform`), before.transform, 'native transform remains unchanged during clamping');
      assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview').parentElement.id`), 'twitch-min-emote-preview-native-host', 'an ID is added only when the native wrapper has none');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await isVisible('twitch-min-emote-preview'), false);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-emote-host], [data-tq-emote-positioner], #twitch-min-emote-preview-native-host').length`), 0);
      assert.equal(await nativeStyle('#native-emote-tooltip .tw-tooltip-wrapper'), before.style);
      assert.equal(await evaluate(`document.querySelector('#chat-emote').getAttribute('aria-describedby')`), 'native-emote-hint');
    });
};
