const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const withBrowser = require('../tests/support/chrome.cjs');
const { root, intercept, initSource } = require('../tests/support/production.cjs');

const cycles = Number(process.env.TWITCH_MIN_SOAK_CYCLES || 60);
assert.ok(Number.isInteger(cycles) && cycles > 0, 'TWITCH_MIN_SOAK_CYCLES must be a positive integer');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const instrumentation = `
  window.__soak={mutation:new Set(),resize:new Set(),listeners:[]};
  for(const [name,key] of [['MutationObserver','mutation'],['ResizeObserver','resize']]) {
    const Native=window[name];
    window[name]=class extends Native {
      observe(...args){super.observe(...args);__soak[key].add(this)}
      disconnect(){super.disconnect();__soak[key].delete(this)}
    };
  }
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  const capture=options=>typeof options==='boolean' ? options : !!options?.capture;
  EventTarget.prototype.addEventListener=function(type,listener,options){
    if((this===document||this===window)&&!__soak.listeners.some(x=>x.target===this&&x.type===type&&x.listener===listener&&x.capture===capture(options)))
      __soak.listeners.push({target:this,type,listener,capture:capture(options)});
    return add.call(this,type,listener,options);
  };
  EventTarget.prototype.removeEventListener=function(type,listener,options){
    __soak.listeners=__soak.listeners.filter(x=>!(x.target===this&&x.type===type&&x.listener===listener&&x.capture===capture(options)));
    return remove.call(this,type,listener,options);
  };
`;
const resources = `({mutation:__soak.mutation.size,resize:__soak.resize.size,listeners:__soak.listeners.length,
  markers:document.body.querySelectorAll('[data-tq-time],[data-tq-chat-tint],[data-tq-chat-continuation],[data-tq-chat-badge-hidden],[data-tq-chat-badges],[data-tq-fit-player],[data-tq-vod-fit]').length})`;
const cleared = { mutation: 0, resize: 0, listeners: 0, markers: 0 };

async function run() {
  const started = Date.now();
  const result = { node: process.version, cycles, insertedMessages: 0, remounts: 0, modeChecks: [], unavailableChecks: [], finalResources: null };
  await withBrowser(async ({ navigate, evaluate, waitFor, send }) => {
    result.browser = (await send('Browser.getVersion')).product;
    await navigate('tests/fixtures/chat-sequences.html');
    for (let cycle = 0; cycle < cycles; cycle++) {
      await evaluate(`__storagePatch({enabled:false})`);
      assert.deepEqual(await evaluate(resources), cleared, `pause cleanup at cycle ${cycle + 1}`);
      await evaluate(`(()=>{
        __storagePatch({enabled:true});
        const live=document.querySelector('#live-items'),vod=document.querySelector('#vod-items');
        let liveHTML='',vodHTML='';
        for(let i=0;i<100;i++) {
          const user='soak_'+Math.floor(i/3);
          liveHTML+='<div class="chat-line__message"><span data-a-target="chat-message-username" data-a-user="'+user+'" style="color:rgb(20,150,200)">'+user+'</span><span>Offline stress message</span></div>';
          vodHTML+='<li><div class="vod-message"><div class="vod-message__header"><p>1:32:56</p></div><span data-a-target="chat-message-username" data-a-user="'+user+'">'+user+'</span><div class="video-chat__message">Offline replay message</div></div></li>';
        }
        live.insertAdjacentHTML('beforeend',liveHTML);vod.insertAdjacentHTML('beforeend',vodHTML);
        for(const list of [live,vod])while(list.children.length>300)list.firstElementChild.remove();
        history.pushState({},'','?soak=${cycle}');
      })()`);
      assert.ok(await evaluate(`document.querySelectorAll('[data-tq-chat-tint]').length`) >= 200);
      assert.equal(await evaluate(`document.querySelector('#vod-items > :last-child .vod-message__header p').getAttribute('data-tq-time')`), '1:32');
      result.insertedMessages += 200;
      if ((cycle + 1) % 10 === 0) {
        await evaluate(`for(const id of ['live-items','vod-items']){const list=document.getElementById(id),region=list.closest('.chat-room,.video-chat');region.replaceWith(region.cloneNode(true))}`);
        assert.ok(await evaluate(`document.querySelectorAll('[data-tq-chat-tint]').length`) >= 200);
        result.remounts += 2;
        process.stdout.write(`Completed ${cycle + 1}/${cycles} cycles\n`);
      }
      await pause(2000);
    }
    await evaluate(`__storagePatch({enabled:false})`);
    result.finalResources = await evaluate(resources);
    assert.deepEqual(result.finalResources, cleared);

    await navigate('tests/fixtures/player-layout.html', '__stored.channelAbout=true;');
    await waitFor(`document.querySelector('[data-tq-fit-player]')`);
    await evaluate(`document.querySelector('.channel-root').classList.add('channel-root--theatre-mode')`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player]')`), null);
    await evaluate(`document.querySelector('.channel-root').classList.remove('channel-root--theatre-mode')`);
    await waitFor(`document.querySelector('[data-tq-fit-player]')`);
    result.modeChecks.push('theatre enter/exit');
    const fullscreen = await send('Runtime.evaluate', {
      expression: `(async()=>{try{await document.querySelector('.channel-root').requestFullscreen();return {granted:true}}catch(error){return {granted:false,name:error.name,message:error.message}}})()`,
      userGesture: true, awaitPromise: true, returnByValue: true
    });
    assert.equal(fullscreen.exceptionDetails, undefined);
    if (fullscreen.result.value.granted) {
      assert.equal(await evaluate(`!!document.fullscreenElement`), true);
      assert.equal(await evaluate(`document.querySelector('[data-tq-fit-player]')`), null);
      await evaluate(`document.exitFullscreen()`);
      await waitFor(`document.querySelector('[data-tq-fit-player]')`);
      result.modeChecks.push('fullscreen enter/exit');
    } else {
      assert.equal(fullscreen.result.value.name, 'TypeError');
      assert.match(fullscreen.result.value.message, /not granted|permission/i);
      result.unavailableChecks.push('Fullscreen permission was not granted by headless Chrome.');
    }
    await evaluate(`__storagePatch({enabled:false})`);
    assert.deepEqual(await evaluate(resources), cleared, 'player teardown');
  }, { intercept, initSource: initSource + '\n' + instrumentation });
  result.durationSeconds = Math.round((Date.now() - started) / 1000);
  const output = path.join(root, '.browser-tests', 'soak-results.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(`Stress checks passed. Results: ${output}\n`);
  for (const reason of result.unavailableChecks) process.stdout.write(`Not verified: ${reason}\n`);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
