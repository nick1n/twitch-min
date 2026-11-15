const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, waitFor }) => {
  await t.test('a composer setup failure rolls back controls and listeners before a same-settings retry', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`__storagePatch({chatComposer:false});window.composerWarnings=[];console.warn=(...args)=>composerWarnings.push(String(args[0]));window.originalObserve=MutationObserver.prototype.observe;MutationObserver.prototype.observe=function(target,options){originalObserve.call(this,target,options);if(target.matches?.('.chat-input')){MutationObserver.prototype.observe=originalObserve;throw Error('injected failure after observing composer')}};__storagePatch({chatComposer:true})`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle], [data-tq-composer-id]').length`), 0, 'partial controls and generated IDs are removed');
    assert.equal(await evaluate(`composerWarnings.some(message=>message.includes('TwitchMinComposer'))`), true);
    await evaluate(`__storagePatch({chatComposer:true})`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle]').length`), 1);
    await evaluate(`document.querySelector('[data-tq-chat-toggle]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]').getAttribute('aria-expanded')`), 'true', 'one click produces one toggle after recovery');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle], [data-tq-composer-id]').length`), 0);
  });

  await t.test('failed region setup retains failed cleanup, releases other roots, and blocks duplicate attachment', async () => {
    await navigate('tests/fixtures/twitch.html');
    const result = await evaluate(`(()=>{
      document.body.insertAdjacentHTML('beforeend','<div class="fault-region" id="fault-one"></div><div class="fault-region" id="fault-two"></div>');
      let stop, attempts=0, failCleanup=true, failAttach=true;
      const live=new Set();
      const feature=TwitchMinRuntime.create({
        attach(){TwitchMinRegions.watch('.fault-region',(element,onCleanup)=>{
          attempts++;
          onCleanup(()=>{if(element.id==='fault-two'&&failCleanup)throw Error('cleanup blocked');live.delete(element.id)});
          live.add(element.id);
          if(element.id==='fault-two'&&failAttach)throw Error('attach failed');
        },dispose=>{stop=dispose})},
        dispose(){stop?.();stop=null}
      });
      try{feature.update({enabled:true})}catch{}
      const partial=[...live];
      try{feature.update({enabled:true})}catch{}
      const attemptsBeforeRecovery=attempts;
      failCleanup=failAttach=false;
      feature.update({enabled:true});
      const recovered=[...live].sort();
      feature.dispose();
      feature.dispose();
      return {partial,attemptsBeforeRecovery,attempts,recovered,remaining:live.size};
    })()`);
    assert.deepEqual(result, { partial: ['fault-two'], attemptsBeforeRecovery: 2, attempts: 4, recovered: ['fault-one', 'fault-two'], remaining: 0 });
  });

  await t.test('one discovery observer owns nested and independent chat mounts and fully pauses', async () => {
    await navigate('tests/fixtures/chat-sequences.html', `
      window.documentObservers=new Set();
      window.MutationObserver=class extends MutationObserver {
        observe(target,options){super.observe(target,options);if(target===document)documentObservers.add(this)}
        disconnect(){super.disconnect();documentObservers.delete(this)}
      };
    `);
    assert.equal(await evaluate('documentObservers.size'), 1);
    await evaluate(`window.retained=document.querySelector('#l2');window.oldPane=retained.closest('.chat-room');window.newPane=document.createElement('div');newPane.className='chat-room';document.body.append(newPane);newPane.append(retained)`);
    assert.equal(await evaluate(`retained.hasAttribute('data-tq-chat-continuation')`), false, 'moving a row into an independent pane restores its first name');
    await evaluate(`oldPane.remove()`);
    assert.equal(await evaluate(`retained.hasAttribute('data-tq-chat-tint')`), true, 'disposing the old region cannot clear the new region styling');
    await evaluate(`window.outer=document.createElement('div');outer.className='chat-room';newPane.before(outer);outer.append(newPane)`);
    assert.equal(await evaluate(`retained.hasAttribute('data-tq-chat-tint')`), true, 'wrapping a pane transfers ownership to the outer root');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate('documentObservers.size'), 0);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-tint], [data-tq-chat-continuation], [data-tq-time]').length`), 0);
    await evaluate(`__storagePatch({enabled:true})`);
    assert.equal(await evaluate('documentObservers.size'), 1);
    assert.equal(await evaluate(`retained.hasAttribute('data-tq-chat-tint')`), true);
  });

  await t.test('regions acquired or removed through class changes attach and dispose once', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`window.mounts=0;window.disposals=0;window.stopTestRegion=TwitchMinRegions.watch('.test-region',()=>{mounts++;return()=>disposals++});window.regionNode=document.createElement('div');document.body.append(regionNode)`);
    await evaluate(`regionNode.className='test-region'`);
    assert.equal(await evaluate('mounts'), 1);
    await evaluate(`regionNode.append(document.createElement('span'));regionNode.classList.add('other')`);
    assert.equal(await evaluate('mounts'), 1);
    await evaluate(`regionNode.classList.remove('test-region')`);
    assert.equal(await evaluate('disposals'), 1);
    await evaluate(`regionNode.classList.add('test-region')`);
    assert.equal(await evaluate('mounts'), 2);
    await evaluate(`stopTestRegion();stopTestRegion()`);
    assert.equal(await evaluate('disposals'), 2, 'unsubscribe is idempotent');
  });

  await t.test('timestamps clear on removal-only updates, wrapper replacement, and disposal', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`window.time=document.querySelector('#actual-replay-time p');time.textContent=''`);
    assert.equal(await evaluate(`time.hasAttribute('data-tq-time')`), false);
    await evaluate(`time.textContent='5:26'`);
    assert.equal(await evaluate(`time.getAttribute('data-tq-time')`), '0:05');
    await evaluate(`time.innerHTML='<span>1:32:56</span>'`);
    assert.equal(await evaluate(`time.hasAttribute('data-tq-time')`), false, 'the old leaf no longer hides the whole wrapper');
    assert.equal(await evaluate(`time.firstElementChild.getAttribute('data-tq-time')`), '1:32');
    await evaluate(`window.leaf=time.firstElementChild;leaf.remove()`);
    assert.equal(await evaluate(`leaf.hasAttribute('data-tq-time')`), false, 'detached timestamp markers are released');
    await evaluate(`time.append(leaf);__storagePatch({chatTimestamps:false})`);
    assert.equal(await evaluate(`leaf.hasAttribute('data-tq-time')`), false);
  });

  await t.test('timestamps moved outside their formatting context restore and can be formatted again', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`window.movedTime=document.querySelector('#actual-replay-time p');window.timeHome=movedTime.parentElement;document.body.append(movedTime)`);
    assert.equal(await evaluate(`movedTime.hasAttribute('data-tq-time')`), false, 'moving outside chat releases the marker');
    assert.equal(await evaluate(`movedTime.textContent`), '1:32:56', 'the native text is unchanged');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`movedTime.hasAttribute('data-tq-time')`), false);
    await evaluate(`__storagePatch({enabled:true});timeHome.append(movedTime)`);
    assert.equal(await evaluate(`movedTime.getAttribute('data-tq-time')`), '1:32', 'reinserting into chat reacquires formatting');
    await evaluate(`document.querySelector('.chat-room__content').append(movedTime)`);
    assert.equal(await evaluate(`movedTime.hasAttribute('data-tq-time')`), false, 'moving into ordinary chat content also restores native text');
    await evaluate(`timeHome.append(movedTime)`);
    assert.equal(await evaluate(`movedTime.getAttribute('data-tq-time')`), '1:32');
  });

  for (const sourceFirst of [true, false]) {
    await t.test(`timestamp ownership transfers between regions with the ${sourceFirst ? 'source' : 'destination'} observer first`, async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.enabled=false;');
      await evaluate(`
        document.querySelector('.chat-room').remove();
        const source='<div class="video-chat" id="time-source"><div class="vod-message__header"><a id="time-link" data-a-target="video-chat-timestamp" href="/videos/123?t=1h32m56s"><span id="time-leaf">1:32:56</span></a></div></div>';
        const destination='<div class="video-chat" id="time-destination"><div class="vod-message__header" id="time-target"></div></div>';
        document.body.insertAdjacentHTML('beforeend',${sourceFirst} ? source+destination : destination+source);
        window.timeLink=document.querySelector('#time-link');window.timeLeaf=document.querySelector('#time-leaf');window.seekClicks=0;
        timeLink.addEventListener('click',event=>{event.preventDefault();seekClicks++});
        __storagePatch({enabled:true});
      `);
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '1:32');
      await evaluate(`document.querySelector('#time-target').append(timeLink)`);
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '1:32', 'the receiving observer retains its marker');
      await evaluate(`document.querySelector('#time-source').remove();timeLeaf.textContent='5:26';history.pushState({},'', '?moved-timestamp')`);
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '0:05', 'source teardown leaves the destination active');
      await evaluate(`document.body.insertAdjacentHTML('beforeend','<div class="video-chat" id="time-later"></div>');document.querySelector('#time-later').append(timeLink)`);
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '0:05', 'a later region takes ownership');
      await evaluate(`document.querySelector('#time-destination').remove();timeLink.click()`);
      assert.equal(await evaluate(`seekClicks`), 1, 'the native click handler remains');
      assert.equal(await evaluate(`timeLink.getAttribute('href')`), '/videos/123?t=1h32m56s');
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '0:05');
      await evaluate(`document.body.append(timeLink);__storagePatch({chatTimestamps:false})`);
      assert.equal(await evaluate(`timeLeaf.hasAttribute('data-tq-time')`), false, 'pause cleans a move before observer delivery');
      await evaluate(`__storagePatch({chatTimestamps:true});document.querySelector('#time-later').append(timeLink)`);
      assert.equal(await evaluate(`timeLeaf.getAttribute('data-tq-time')`), '0:05');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`timeLeaf.hasAttribute('data-tq-time')`), false);
    });
  }

  await t.test('unrelated and unchanged settings produce no root attribute writes', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`window.rootWrites=0;const original=document.documentElement.setAttribute;document.documentElement.setAttribute=function(...args){rootWrites++;return original.apply(this,args)};__storagePatch({unrelated:true});__storagePatch({enabled:true});__storagePatch({chatComposer:true})`);
    assert.equal(await evaluate('rootWrites'), 0);
    await evaluate(`__storagePatch({chatComposer:false})`);
    assert.equal(await evaluate('rootWrites'), 1, 'only the changed preference attribute is written');
    await waitFor(`!document.querySelector('[data-tq-chat-toggle]')`);
  });

  await t.test('sidebar metadata updates and small wheel deltas skip unchanged markers and HUD text', async () => {
    await navigate('tests/fixtures/twitch.html');
    await waitFor(`document.querySelector('#sidebar-shell').hasAttribute('data-tq-sidebar-ready')`);
    await evaluate(`window.markerWrites=0;const original=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,...args){if(['data-tq-section','data-tq-section-title','data-tq-top-extra'].includes(name))markerWrites++;return original.call(this,name,...args)};document.querySelector('#viewer-count').textContent='19K';document.querySelector('.top-nav').append(document.createTextNode(' '))`);
    assert.equal(await evaluate('markerWrites'), 0);
    await evaluate(`window.section=document.querySelector('#sidebar-shell .side-nav-section');section.setAttribute('aria-label','Similar')`);
    await waitFor(`section.getAttribute('data-tq-section') === 'Similar'`);
    assert.equal(await evaluate(`section.getAttribute('data-tq-section')`), 'Similar', 'changed labels are still applied');
    await evaluate(`window.video=document.querySelector('#stream-video');video.volume=0.5;video.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100}))`);
    await evaluate(`window.hudMutations=0;new MutationObserver(records=>hudMutations+=records.length).observe(document.querySelector('#twitch-min-volume'),{childList:true,characterData:true,subtree:true});video.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-1}))`);
    assert.equal(await evaluate('hudMutations'), 0);
    assert.equal(await evaluate(`document.querySelector('#twitch-min-volume').textContent`), 'Volume 55%');
    assert.ok(await evaluate('video.volume') > 0.55, 'fractional volume still changes');
  });

  await t.test('timestamp batches format each leaf once and skip unchanged shortened labels', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`document.querySelector('#messages').insertAdjacentHTML('beforeend','<p id="batch-time" class="video-chat__message-time">5:00</p>')`);
    await evaluate(`window.timeReads=0;window.timeWrites=0;window.batchTime=document.querySelector('#batch-time');const text=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');Object.defineProperty(batchTime,'textContent',{get(){timeReads++;return text.get.call(this)},set(value){text.set.call(this,value)}});const set=batchTime.setAttribute;batchTime.setAttribute=function(...args){if(args[0]==='data-tq-time')timeWrites++;return set.apply(this,args)};for(let i=10;i<30;i++)batchTime.firstChild.data='5:'+i`);
    assert.equal(await evaluate('timeReads'), 1);
    assert.equal(await evaluate('timeWrites'), 0);
    await evaluate(`timeReads=0;for(let i=10;i<30;i++)batchTime.firstChild.data='6:'+i`);
    assert.equal(await evaluate('timeReads'), 1);
    assert.equal(await evaluate('timeWrites'), 1);
    assert.equal(await evaluate(`batchTime.getAttribute('data-tq-time')`), '0:06');
  });

  await t.test('native preview skips unrelated chat geometry reads and closes when an ancestor hides', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`document.body.insertAdjacentHTML('beforeend','<div class="tw-tooltip-layer" id="preview-layer"><div data-popper-placement="top" id="preview-positioner"><div role="tooltip"><div class="tw-tooltip-wrapper">eyesonbHmm</div></div></div></div>');document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
    await waitFor(`document.querySelector('#twitch-min-emote-preview[data-tq-native-emote] img').naturalWidth > 0`);
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    await evaluate(`window.previewReads=0;const positioner=document.querySelector('#preview-positioner');const measure=positioner.getBoundingClientRect;positioner.getBoundingClientRect=function(){previewReads++;return measure.call(this)};document.querySelector('#messages').append(document.createTextNode('Unrelated chat update'))`);
    assert.equal(await evaluate('previewReads'), 0);
    await evaluate(`document.querySelector('#preview-layer').setAttribute('aria-hidden','true')`);
    assert.equal(await evaluate(`document.querySelector('#twitch-min-emote-preview')`), null);
  });

  await t.test('player releases and reacquires fit when VOD metadata changes in place', async () => {
    await navigate('tests/fixtures/player-layout.html');
    await waitFor(`document.querySelector('[data-tq-fit-player]')`);
    await evaluate(`window.boxart=document.querySelector('[data-a-target="video-info-game-boxart-link"]');boxart.removeAttribute('data-a-target')`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player]')`), null);
    await evaluate(`boxart.setAttribute('data-a-target','video-info-game-boxart-link')`);
    await waitFor(`document.querySelector('[data-tq-fit-player]')`);
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player], [data-tq-vod-fit]')`), null);
  });

  await t.test('lifecycle attaches once, updates active features, and disposes idempotently', async () => {
    await navigate('tests/fixtures/twitch.html');
    const events = await evaluate(`(()=>{const events=[];const feature=TwitchMinRuntime.create({attach:s=>events.push('attach:'+s.value),update:s=>events.push('update:'+s.value),dispose:()=>events.push('dispose')},s=>s.enabled&&s.option);feature.update({enabled:false});feature.update({enabled:true,option:true,value:1});feature.update({enabled:true,option:true,value:2});feature.update({enabled:true,option:false});feature.dispose();feature.update({enabled:true,option:true,value:3});feature.dispose();return events})()`);
    assert.deepEqual(events, ['attach:1', 'update:2', 'dispose', 'attach:3', 'dispose']);
  });
};
