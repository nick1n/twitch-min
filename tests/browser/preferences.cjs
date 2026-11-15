const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor }) => {
  await t.test('chat tint and grouping switches restore independently through remounts and pause', async () => {
    await navigate('tests/fixtures/chat-sequences.html');
    for (const [chatTints, chatGrouping] of [[false,true], [true,false], [false,false], [true,true]]) {
      await evaluate(`__storagePatch(${JSON.stringify({ chatTints, chatGrouping })})`);
      assert.equal(await evaluate(`document.querySelector('#l2').hasAttribute('data-tq-chat-tint')`), chatTints);
      assert.equal(await evaluate(`document.querySelector('#l2').hasAttribute('data-tq-chat-continuation')`), chatGrouping);
      assert.equal(await isVisible('l2-author'), !chatGrouping);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#l2')).backgroundImage === 'none'`), !chatTints);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#l1')).borderTopWidth`), chatGrouping ? '1px' : '0px');
    }
    await evaluate(`__storagePatch({chatTints:false,chatGrouping:false});const list=document.querySelector('#live-items');list.replaceWith(list.cloneNode(true));history.pushState({},'', '?remounted-preferences');`);
    assert.equal(await isVisible('l2-author'), true);
    assert.equal(await evaluate(`document.querySelector('#l2').hasAttribute('data-tq-chat-tint')`), false);
    await evaluate(`__storagePatch({chatTints:true})`);
    await waitFor(`document.querySelector('#l2').hasAttribute('data-tq-chat-tint')`);
    assert.equal(await isVisible('l2-author'), true, 'enabling tints does not enable grouping');
    await evaluate(`__storagePatch({chatGrouping:true});__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-tint], [data-tq-chat-continuation]').length`), 0);
    await evaluate(`__storagePatch({chatGrouping:false});__storagePatch({enabled:true})`);
    await waitFor(`document.querySelector('#l2').hasAttribute('data-tq-chat-tint')`);
    assert.equal(await isVisible('l2-author'), true, 'resuming respects the saved grouping choice');
    assert.equal(await evaluate(`document.querySelector('#a2-time').hasAttribute('data-tq-time')`), true, 'timestamp formatting remains independent');
  });

  await t.test('wheel volume can be disabled during a volume change and restored after player remount', async () => {
    await navigate('tests/fixtures/twitch.html');
    const wheel = () => evaluate(`(()=>{const video=document.querySelector('#stream-video');video.volume=0.5;const event=new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true});video.dispatchEvent(event);return {volume:video.volume,prevented:event.defaultPrevented}})()`);
    assert.deepEqual(await wheel(), { volume: 0.55, prevented: true });
    assert.equal(await isVisible('twitch-min-volume'), true);
    await evaluate(`__storagePatch({wheelVolume:false})`);
    assert.equal(await isVisible('twitch-min-volume'), false, 'turning off removes the indicator immediately');
    assert.deepEqual(await wheel(), { volume: 0.5, prevented: false });
    await evaluate(`const player=document.querySelector('#player');player.replaceWith(player.cloneNode(true));history.pushState({},'', '?new-player')`);
    assert.deepEqual(await wheel(), { volume: 0.5, prevented: false });
    await evaluate(`__storagePatch({wheelVolume:true})`);
    assert.deepEqual(await wheel(), { volume: 0.55, prevented: true });
    await evaluate(`__storagePatch({enabled:false});__storagePatch({wheelVolume:false});__storagePatch({enabled:true})`);
    assert.deepEqual(await wheel(), { volume: 0.5, prevented: false });
    assert.equal(await isVisible('about'), false, 'other selected appearance features remain active');
  });

  await t.test('emote switch removes an open preview, preserves native tooltip and supports later emotes', async () => {
    await navigate('tests/fixtures/twitch.html');
    const markup = fs.readFileSync(path.join(__dirname, '../fixtures/emote-tooltip.html'), 'utf8');
    await evaluate(`(()=>{
      const template=document.createElement('template');template.innerHTML=${JSON.stringify(markup)};
      const positioner=template.content.querySelector('[data-popper-placement]');positioner.id='preference-tooltip';
      const wrapper=template.content.querySelector('.tw-tooltip-wrapper');wrapper.textContent='eyesonbHmm';
      document.body.append(template.content);
      document.querySelector('#chat-emote').setAttribute('aria-describedby','preference-tooltip');
      window.nativeEmoteClicks=0;document.querySelector('#emote-button').addEventListener('click',()=>nativeEmoteClicks++);
    })()`);
    const hover = () => evaluate(`document.querySelector('#chat-emote').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
    await hover();
    await waitFor(`document.querySelector('#twitch-min-emote-preview img')?.naturalWidth > 0`);
    await evaluate(`__storagePatch({emotePreviews:false})`);
    assert.equal(await isVisible('twitch-min-emote-preview'), false);
    assert.equal(await evaluate(`document.querySelector('.tw-tooltip-wrapper').textContent`), 'eyesonbHmm');
    assert.equal(await evaluate(`document.querySelector('#emote-button').title`), 'eyesonbHmm', 'native title is restored');
    await hover();
    assert.equal(await isVisible('twitch-min-emote-preview'), false);
    await evaluate(`document.querySelector('#emote-button').click()`);
    assert.equal(await evaluate(`nativeEmoteClicks`), 1, 'disabling preserves the native handler');
    await evaluate(`const source=document.querySelector('#chat-emote');source.replaceWith(source.cloneNode(true));history.pushState({},'', '?later-emote');__storagePatch({emotePreviews:true})`);
    await hover();
    await waitFor(`document.querySelector('#twitch-min-emote-preview img')?.naturalWidth > 0`);
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('twitch-min-emote-preview'), false);
    await evaluate(`__storagePatch({emotePreviews:false});__storagePatch({enabled:true})`);
    await hover();
    assert.equal(await isVisible('twitch-min-emote-preview'), false);
  });
};
