const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    await t.test('non-rewindable live streams never seek their buffer despite reported seekable ranges', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`window.liveDuration=Infinity;window.liveTime=587;window.liveWrites=0;window.nativeClicks=0;window.rangeEnd=1073741824;
        Object.defineProperties(document.querySelector('#stream-video'),{
          duration:{get:()=>liveDuration},currentTime:{get:()=>liveTime,set:value=>{liveTime=value;liveWrites++}},
          seekable:{get:()=>({length:1,start:()=>0,end:()=>rangeEnd})}
        });
        document.querySelector('#player').addEventListener('click',event=>{if(event.target.matches('[data-a-target="player-seekbar"]'))nativeClicks++});`);
      const mouse = (button,type='mousedown') => evaluate(`(()=>{const event=new MouseEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,button:${button}});document.querySelector('#stream-video').dispatchEvent(event);return event.defaultPrevented})()`);
      const bar = '<div data-a-target="player-seekbar" style="width:200px;height:10px"></div>';
      for (const markup of [
        '',
        bar.replace('style="','hidden style="'),
        bar.replace('width:200px','display:none;width:200px'),
        bar.replace('width:200px','visibility:hidden;width:200px'),
        bar.replace('width:200px','width:0px'),
        bar.replace('style="','aria-disabled="true" style="'),
        '<div inert>'+bar+'</div>',
        '<div aria-disabled="true">'+bar+'</div>'
      ]) {
        await evaluate(`document.querySelector('#live-controls')?.remove();document.querySelector('#player').insertAdjacentHTML('beforeend',${JSON.stringify('<div id="live-controls">'+markup+'</div>')})`);
        for(const button of [3,4]) for(const type of ['mousedown','mouseup','auxclick']) {
          assert.equal(await mouse(button,type),false,'unusable live controls preserve native side-button behavior');
        }
        assert.equal(await evaluate('liveTime'),587);
        assert.equal(await evaluate('liveWrites'),0);
        assert.equal(await evaluate('nativeClicks'),0);
      }
      await evaluate(`rangeEnd=588;document.querySelector('#live-controls').remove()`);
      await mouse(3);
      assert.equal(await evaluate('liveWrites'),0,'a realistic short live range is not sufficient either');
      await evaluate(`document.querySelector('#player').insertAdjacentHTML('beforeend',${JSON.stringify(bar)})`);
      assert.equal(await mouse(3),true,'later usable scrubber enables native rewind');
      assert.equal(await evaluate('nativeClicks'),1);
      assert.equal(await evaluate('liveWrites'),0,'live currentTime remains untouched during transition');
      await evaluate(`document.querySelector('[data-a-target="player-seekbar"]').remove()`);
      await evaluate(`rangeEnd=5000;liveDuration=5000;document.querySelector('#stream-video').dispatchEvent(new Event('seeked'))`);
      assert.equal(await evaluate('liveWrites'),0,'removing rewind controls cancels pending work');
      await evaluate(`history.pushState({},'', '?seekable-again');liveDuration=Infinity;document.querySelector('#player').insertAdjacentHTML('beforeend',${JSON.stringify(bar)})`);
      await mouse(3);
      await evaluate(`liveDuration=5000;document.querySelector('#stream-video').dispatchEvent(new Event('seeked'))`);
      assert.equal(await evaluate('liveTime'),4970,'a later supported stream still rewinds');
    });

    await t.test('Forward reaching the rewind limit invokes the native Skip to Live button once', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`window.seekTime=100;window.seekDuration=300;window.liveClicks=0;window.seekWrites=0;
        Object.defineProperties(document.querySelector('#stream-video'),{
          duration:{get:()=>seekDuration},currentTime:{get:()=>seekTime,set:value=>{seekTime=value;seekWrites++}},
          seekable:{get:()=>({length:1,start:()=>10,end:()=>seekDuration===Infinity?1073741824:290})}
        });
        document.querySelector('#player').insertAdjacentHTML('beforeend','<div data-a-target="player-seekbar" style="width:200px;height:10px"></div><button id="skip-live" aria-label="Skip to Live">Live</button>');
        document.querySelector('#skip-live').addEventListener('click',()=>{liveClicks++;seekDuration=Infinity;seekTime=587});
        document.body.insertAdjacentHTML('beforeend','<button aria-label="Skip to Live" id="outside-live">Other player</button>');
        document.querySelector('#outside-live').addEventListener('click',()=>{throw new Error('Clicked outside player')});`);
      const press = (button=4, type='mousedown') => evaluate(`document.querySelector('#stream-video').dispatchEvent(new MouseEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,button:${button}}))`);
      await press();
      assert.equal(await evaluate('seekTime'),160);
      assert.equal(await evaluate('liveClicks'),0,'ordinary jumps stay on the recording');
      await evaluate('seekTime=230');
      await press();
      assert.equal(await evaluate('liveClicks'),1,'exactly reaching seekable end returns to live, even before duration');
      assert.equal(await evaluate('seekWrites'),1,'native Live click replaces a direct media seek');
      for (const type of ['mouseup','auxclick']) await press(4,type);
      await press();
      assert.equal(await evaluate('liveClicks'),1,'release phases and Forward already at live do not click again');
      await evaluate('seekDuration=300;seekTime=280');
      await press();
      assert.equal(await evaluate('liveClicks'),2,'overshooting also returns to live');
      await evaluate('seekDuration=300;seekTime=280');
      await press(3);
      assert.equal(await evaluate('seekTime'),250,'Back never invokes Live');
      for (const state of ['hidden','disabled','aria-disabled']) {
        await evaluate(`(()=>{seekTime=280;const button=document.querySelector('#skip-live');button.hidden=${state==='hidden'};button.disabled=${state==='disabled'};button.setAttribute('aria-disabled',${JSON.stringify(String(state==='aria-disabled'))})})()`);
        await press();
        assert.equal(await evaluate('seekTime'),290,state+' Live control falls back to clamping');
        assert.equal(await evaluate('liveClicks'),2);
      }
      await evaluate(`document.querySelector('#skip-live').remove();seekTime=280`);
      await press();
      assert.equal(await evaluate('seekTime'),290,'missing Live control preserves VOD end behavior');
    });

    await t.test('live side-button rewind enters the native recording timeline before seeking', async () => {
      const setup = async () => {
        await navigate('tests/fixtures/twitch.html');
        await evaluate(`window.liveDuration=Infinity;window.liveTime=587;window.liveWrites=0;window.nativeSeeks=[];
          window.installLiveVideo=video=>Object.defineProperties(video,{
            duration:{configurable:true,get:()=>liveDuration},
            currentTime:{configurable:true,get:()=>liveTime,set:value=>{liveTime=value;liveWrites++}},
            seekable:{configurable:true,get:()=>({length:1,start:()=>0,end:()=>liveDuration===Infinity?1073741824:liveDuration})}
          });installLiveVideo(document.querySelector('#stream-video'));
          const bar=document.createElement('div');bar.setAttribute('data-a-target','player-seekbar');bar.style.cssText='width:200px;height:10px';document.querySelector('#player').append(bar);
          for(const type of ['mousedown','mouseup','click'])bar.addEventListener(type,event=>nativeSeeks.push({type:event.type,button:event.button,x:event.clientX}));`);
      };
      const press = button => evaluate(`(()=>{const event=new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:${button}});document.querySelector('#stream-video').dispatchEvent(event);return event.defaultPrevented})()`);
      const mediaEvent = type => evaluate(`document.querySelector('#stream-video').dispatchEvent(new Event(${JSON.stringify(type)}))`);
      const ready = () => evaluate('liveDuration=4521.05');
      const captureDeadline = () => evaluate(`
        const setPageTimeout = window.setTimeout;
        window.setTimeout = (callback, delay, ...args) => {
          if (delay !== 8000) return setPageTimeout(callback, delay, ...args);
          window.runRewindDeadline = callback;
        };`);
      await setup();
      assert.equal(await press(4),true);
      assert.equal(await evaluate('liveWrites'),0,'Forward at live does not seek the placeholder timeline');
      assert.equal(await press(3),true);
      assert.deepEqual(await evaluate('nativeSeeks.map(event=>event.type)'),['mousedown','mouseup','click']);
      assert.equal(await evaluate(`nativeSeeks.every(event=>event.button===0 && Math.abs(event.x-document.querySelector('[data-a-target="player-seekbar"]').getBoundingClientRect().left-196)<1)`),true);
      assert.equal(await evaluate('liveWrites'),0,'no direct seek on the live timeline');
      await press(3);
      assert.equal(await evaluate('nativeSeeks.length'),3,'repeated Back does not restart a pending transition');
      await ready();
      await mediaEvent('seeked');
      assert.equal(await evaluate('liveTime'),4491.05,'seek relative to the new recording end, not the old live clock');
      await press(3);
      assert.equal(await evaluate('liveTime'),4461.05);
      await press(4);
      assert.equal(await evaluate('liveTime'),4521.05);

      await setup();
      await evaluate(`window.nativeSeeking=false;window.recordingHasRange=false;
        const video=document.querySelector('#stream-video');
        Object.defineProperty(video,'seeking',{get:()=>nativeSeeking});
        Object.defineProperty(video,'seekable',{get:()=>({length:recordingHasRange?1:0,start:()=>0,end:()=>4500})});`);
      await press(3);
      await ready();
      await evaluate('recordingHasRange=true');
      await mediaEvent('durationchange');
      assert.equal(await evaluate('liveWrites'),0,'metadata and a playable range can precede the native seek');
      await evaluate('nativeSeeking=true');
      await mediaEvent('loadedmetadata');
      await press(3);
      assert.equal(await evaluate('liveWrites'),0,'Back during the native seek does not interrupt it');
      await evaluate('liveTime=4410;nativeSeeking=false;recordingHasRange=false');
      await mediaEvent('seeked');
      assert.equal(await evaluate('liveWrites'),0,'seek completion alone is insufficient while the playable range is empty');
      await evaluate('recordingHasRange=true');
      await mediaEvent('progress');
      assert.equal(await evaluate('liveTime'),4470,'rewind runs after the native seek and uses the playable end');
      await mediaEvent('seeked');
      assert.equal(await evaluate('liveWrites'),1,'the extension seek cannot trigger another rewind');

      await setup();
      await captureDeadline();
      await press(3);
      await evaluate('runRewindDeadline()');
      assert.equal(await evaluate('liveWrites'),0,'a stalled request never seeks the live timeline');
      await press(3);
      assert.equal(await evaluate('nativeSeeks.length'),6,'Back can retry after a stalled request');
      await ready();
      await mediaEvent('loadedmetadata');
      await evaluate('runRewindDeadline()');
      assert.equal(await evaluate('liveTime'),4491.05,'a playable source swap can finish without a native seeked event');

      await setup();
      await press(3);
      await evaluate(`history.pushState({}, '', '?new-stream')`);
      await press(3);
      assert.equal(await evaluate('nativeSeeks.length'),6,'the old route cannot block a new request on a reused player');
      await ready();
      await mediaEvent('seeked');
      assert.equal(await evaluate('liveWrites'),1);

      for(const action of [
        '__storagePatch({sideButtonSeek:false})',
        '__storagePatch({enabled:false})',
        `document.querySelector('#stream-video').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:4}))`,
        `document.querySelector('#player').remove()`,
        `history.pushState({},'', '?different-stream')`
      ]) {
        await setup();
        await press(3);
        await evaluate(action);
        await ready();
        if(!action.includes('.remove()')) await mediaEvent('seeked');
        assert.equal(await evaluate('liveWrites'),0,action+' cancels the pending seek');
      }
      await setup();
      await press(3);
      await evaluate(`liveDuration=4521.05;const old=document.querySelector('#stream-video'),replacement=old.cloneNode(true);installLiveVideo(replacement);old.replaceWith(replacement)`);
      await mediaEvent('seeked');
      await waitFor('liveWrites===1');
      assert.equal(await evaluate('liveTime'),4491.05,'replacement video completes the pending transition');
      await evaluate(`document.querySelector('#stream-video').dispatchEvent(new Event('loadedmetadata'))`);
      assert.equal(await evaluate('liveWrites'),1,'completion releases media listeners');
    });

    await t.test('side buttons seek recordings once, respect bounds and restore native behavior', async () => {
      await navigate('tests/fixtures/twitch.html');
      const prepare = `window.seekTime=100;window.seekWrites=0;Object.defineProperties(document.querySelector('#stream-video'),{duration:{configurable:true,get:()=>300},currentTime:{configurable:true,get:()=>seekTime,set:value=>{seekTime=value;seekWrites++}},seekable:{configurable:true,get:()=>({length:1,start:()=>10,end:()=>290})}})`;
      await evaluate(prepare);
      const mouse = (target, button, type = 'mousedown') => evaluate(`(()=>{const event=new MouseEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,button:${button}});document.querySelector(${JSON.stringify(target)}).dispatchEvent(event);return {time:seekTime,writes:seekWrites,prevented:event.defaultPrevented}})()`);
      assert.deepEqual(await mouse('#stream-video', 3), { time:70, writes:1, prevented:true });
      for (const type of ['mouseup','auxclick']) assert.deepEqual(await mouse('#stream-video',3,type), {time:70,writes:1,prevented:true});
      assert.deepEqual(await mouse('#player',4), {time:130,writes:2,prevented:true});
      await evaluate('seekTime=20');
      assert.equal((await mouse('#stream-video',3)).time,10);
      await evaluate('seekTime=280');
      assert.equal((await mouse('#stream-video',4)).time,290);
      for (const [target,button] of [['#messages',3],['#player-menu',4],['#stream-video',0],['#stream-video',1],['#stream-video',2]]) {
        assert.equal((await mouse(target,button)).prevented,false);
      }
      await evaluate(`Object.defineProperty(document.querySelector('#stream-video'),'duration',{configurable:true,value:Infinity})`);
      assert.deepEqual(await mouse('#stream-video',3),{time:290,writes:4,prevented:false},'live ranges alone do not authorize seeking');
      assert.deepEqual(await mouse('#stream-video',4),{time:290,writes:4,prevented:false},'Forward also leaves live playback untouched without a scrubber');
      await evaluate(`Object.defineProperty(document.querySelector('#stream-video'),'seekable',{configurable:true,value:{length:0}})`);
      assert.equal((await mouse('#stream-video',3)).prevented,false,'live streams without a buffer retain native behavior');
      await evaluate(prepare);
      await evaluate('__storagePatch({sideButtonSeek:false})');
      assert.deepEqual(await mouse('#stream-video',3), {time:100,writes:0,prevented:false});
      await evaluate('__storagePatch({sideButtonSeek:true});__storagePatch({enabled:false})');
      assert.equal((await mouse('#stream-video',3)).prevented,false,'pause releases listeners');
      await evaluate(`__storagePatch({enabled:true});history.pushState({},'', '?side-buttons');document.querySelector('#stream-video').replaceWith(document.querySelector('#stream-video').cloneNode(true))`);
      await evaluate(prepare);
      assert.deepEqual(await mouse('#stream-video',4), {time:160,writes:1,prevented:true});
      await evaluate('__storagePatch({enabled:false});__storagePatch({enabled:true})');
      assert.deepEqual(await mouse('#stream-video',3), {time:130,writes:2,prevented:true});
    });

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
