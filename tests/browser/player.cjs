const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    await t.test('channel action extras hide live and VOD three-dot menus and restore native handlers', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.channelActions=false;');
      for (const id of ['channel-menu', 'video-menu']) assert.equal(await isVisible(id), true, `${id} respects the saved opt-out`);
      await evaluate(`window.menuClicks=0;document.querySelector('#channel-menu').addEventListener('click',()=>menuClicks++);document.querySelector('#player').insertAdjacentHTML('beforeend','<button id="player-other-menu" aria-label="Video Options">Player menu</button>');document.querySelector('#messages').insertAdjacentHTML('beforeend','<button id="chat-other-menu" data-a-target="report-button-more-button" aria-label="More options">Chat menu</button>');document.body.insertAdjacentHTML('beforeend','<button id="outside-menu" data-a-target="report-button-more-button">Other menu</button>');__storagePatch({channelActions:true,channelAbout:false})`);
      for (const id of ['channel-menu', 'video-menu']) assert.equal(await isVisible(id), false, `${id} hides independently of About`);
      for (const id of ['follow', 'channel-subscribe', 'player-other-menu', 'chat-other-menu', 'outside-menu']) assert.equal(await isVisible(id), true, `${id} remains available`);
      await evaluate(`history.pushState({},'', '?new-channel-menu');document.querySelector('#channel-menu').replaceWith(document.querySelector('#channel-menu').cloneNode(true));document.querySelector('.metadata-layout__support').insertAdjacentHTML('beforeend','<button id="late-channel-menu" data-a-target="report-button-more-button" aria-label="More options">Menu</button>')`);
      for (const id of ['channel-menu', 'late-channel-menu']) assert.equal(await isVisible(id), false, `${id} hides after navigation or mount`);
      await evaluate(`document.querySelector('#channel-menu').addEventListener('click',()=>menuClicks++);__storagePatch({channelActions:false});document.querySelector('#channel-menu').click()`);
      assert.equal(await evaluate('menuClicks'), 1, 'restored native handlers remain usable');
      for (const id of ['channel-menu', 'video-menu', 'late-channel-menu']) assert.equal(await isVisible(id), true, `${id} restores with the option off`);
      await evaluate(`__storagePatch({channelActions:true});__storagePatch({enabled:false})`);
      for (const id of ['channel-menu', 'video-menu', 'late-channel-menu']) assert.equal(await isVisible(id), true, `${id} restores on master pause`);

      for (const [file, selector] of [['live.html', '[data-a-target="report-button-more-button"]'], ['test.html', 'button[aria-label="Video Options"]']]) {
        const snapshotFile = path.join(root, '.browser-tests', file);
        if (!fs.existsSync(snapshotFile)) continue;
        const source = fs.readFileSync(snapshotFile, 'utf8');
        await evaluate(`(()=>{
          const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
          const native=snapshot.querySelector(${JSON.stringify(selector)});
          const scope=native.closest('.channel-info-content') ? 'channel-info-content' : 'channel-root__info';
          const button=native.cloneNode(true);
          button.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
          for(const node of [button,...button.querySelectorAll('*')])for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name)||/^data-tq-/.test(attribute.name)||['id','style','src','srcset'].includes(attribute.name))node.removeAttribute(attribute.name);
          button.id='snapshot-channel-menu';const region=document.createElement('div');region.className=scope;region.append(button);document.querySelector('#snapshot-channel-menu')?.parentElement.remove();document.body.append(region);__storagePatch({enabled:true});
        })()`);
        assert.equal(await isVisible('snapshot-channel-menu'), false, `${file}: native menu markup hides`);
        await evaluate(`__storagePatch({channelActions:false})`);
        assert.equal(await isVisible('snapshot-channel-menu'), true, `${file}: native menu markup restores`);
        await evaluate(`__storagePatch({channelActions:true})`);
      }
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
      }
    });

    await t.test('wheel over video adjusts volume, respects bounds and leaves page/chat/zoom/menu scrolling alone', async () => {
      await navigate('tests/fixtures/twitch.html');
      const wheel = async (target, options) => evaluate(`(()=>{const video=document.querySelector('#stream-video');const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...${JSON.stringify(options)}});document.querySelector(${JSON.stringify(target)}).dispatchEvent(event);return {volume:video.volume,muted:video.muted,prevented:event.defaultPrevented}})()`);
      await evaluate(`document.querySelector('#stream-video').volume=0.5;window.sliderEvents=0;document.querySelector('[data-a-target="player-volume-slider"]').addEventListener('input',()=>sliderEvents++)`);
      assert.deepEqual(await wheel('#stream-video', { deltaY: -100 }), { volume: 0.55, muted: false, prevented: true });
      assert.equal(await evaluate(`document.querySelector('[data-a-target="player-volume-slider"]').value`), '0.55');
      assert.equal(await evaluate(`sliderEvents`), 1);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-volume').textContent`), 'Volume 55%');
      await evaluate(`window.originalHUD=document.querySelector('#twitch-min-volume')`);
      assert.equal((await wheel('#stream-video', { deltaY: 100 })).volume, 0.5);
      assert.equal(await evaluate(`document.querySelector('#twitch-min-volume') === originalHUD && originalHUD.textContent === 'Volume 50%'`), true, 'wheel events reuse the indicator');
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
      await navigate('tests/fixtures/player-layout.html', '__stored.channelAbout=true;');
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

    await t.test('unchanged VOD geometry skips writes while resize and native edits still update the fit', async () => {
      await navigate('tests/fixtures/player-layout.html', '__stored.channelAbout=true;');
      await waitFor(`document.querySelector('[data-tq-fit-player]')`);
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await evaluate(`window.fitWrites=0;for(const selector of ['.channel-root','.persistent-player']){const element=document.querySelector(selector),set=element.setAttribute,style=element.style,setProperty=style.setProperty;element.setAttribute=function(...args){fitWrites++;return set.apply(this,args)};style.setProperty=function(...args){fitWrites++;return setProperty.apply(this,args)}};for(let i=0;i<10;i++)window.dispatchEvent(new Event('resize'))`);
      assert.equal(await evaluate('fitWrites'), 0, 'unchanged geometry does not rewrite markers or CSS variables');
      await evaluate(`document.querySelector('main').style.height='450px'`);
      await waitFor(`document.querySelector('.channel-root').style.getPropertyValue('--tq-vod-height')==='450px' && document.querySelector('.persistent-player').style.getPropertyValue('--tq-player-height')==='350px'`);
      assert.ok(await evaluate('fitWrites') > 0, 'a real viewport resize still updates the fit');
      await evaluate(`document.querySelector('.channel-root').removeAttribute('data-tq-vod-fit');document.querySelector('.persistent-player').removeAttribute('data-tq-fit-player');document.querySelector('.persistent-player').style.setProperty('--tq-player-height','1px');fitWrites=0;window.dispatchEvent(new Event('resize'))`);
      assert.equal(await evaluate(`document.querySelector('.channel-root').hasAttribute('data-tq-vod-fit') && document.querySelector('.persistent-player').hasAttribute('data-tq-fit-player')`), true, 'missing markers are restored');
      assert.equal(await evaluate(`document.querySelector('.persistent-player').style.getPropertyValue('--tq-player-height')`), '350px', 'external changes are corrected without a stale cache');
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await evaluate(`fitWrites=0;window.dispatchEvent(new Event('resize'))`);
      assert.equal(await evaluate('fitWrites'), 0, 'settled geometry skips writes again');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player], [data-tq-vod-fit]')`), null);
      await evaluate(`__storagePatch({enabled:true});history.pushState({},'', '?fit-writes')`);
      await waitFor(`document.querySelector('.persistent-player').style.getPropertyValue('--tq-player-height')==='350px'`);
    });

    await t.test('live chat updates skip player discovery but later VOD mounts still fit', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.channelAbout=true;');
      await evaluate(`window.playerLookups=0;for(const method of ['querySelector','querySelectorAll']){const original=document[method];document[method]=function(selector){if(selector.includes('.channel-root') || selector.includes('.root-scrollable__wrapper'))playerLookups++;return original.call(this,selector)}};`);
      await evaluate(`for(let i=0;i<30;i++){const row=document.createElement('div');row.className='chat-line__message';row.textContent='Message '+i;document.querySelector('#messages').append(row)}`);
      assert.equal(await evaluate(`playerLookups`), 0, 'ordinary live messages do not search the document for VOD players');
      const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/player-layout.html'), 'utf8');
      await evaluate(`(()=>{const template=document.createElement('template');template.innerHTML=${JSON.stringify(fixture)};template.content.querySelectorAll('script').forEach(node=>node.remove());document.body.append(template.content)})()`);
      await waitFor(`document.querySelector('[data-tq-fit-player]')`);
      assert.equal(await evaluate(`playerLookups`), 0, 'a later VOD mounts through subtree discovery without document-wide player searches');
      await evaluate(`window.oldFit=document.querySelector('[data-tq-fit-player]');oldFit.replaceWith(oldFit.cloneNode(true))`);
      await waitFor(`document.querySelector('[data-tq-fit-player]') !== oldFit`);
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player]')`), null, 'replacement portal remains managed and restores');
    });
};
