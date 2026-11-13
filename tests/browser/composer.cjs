const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    await t.test('Chat toggles the composer and preserves drafts without triggering native sends or form submission', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`(()=>{
        window.nativeSends=0;window.nativeSubmits=0;window.delegatedClicks=0;
        const owner=document.querySelector('.chat-input'),editor=owner.querySelector('[data-a-target="chat-input"]'),send=owner.querySelector('[data-a-target="chat-send-button"]');
        editor.textContent='A draft to keep';send.disabled=true;
        send.addEventListener('click',()=>nativeSends++);
        owner.addEventListener('click',()=>delegatedClicks++);
        editor.addEventListener('keydown',event=>{if(event.key==='Enter'){nativeSends++;event.preventDefault()}});
        const form=document.createElement('form');form.addEventListener('submit',event=>{nativeSubmits++;event.preventDefault()});owner.before(form);form.append(owner);
      })()`);
      const toggle = () => evaluate(`document.querySelector('[data-tq-chat-toggle]').click()`);
      const expanded = () => evaluate(`document.querySelector('[data-tq-chat-toggle]').getAttribute('aria-expanded')`);
      assert.equal(await isVisible('composer'), false);
      assert.equal(await isVisible('chat-send'), false);
      assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]').disabled`), false, 'toggle works even when native Send is disabled');
      assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]').type`), 'button');
      assert.equal(await expanded(), 'false');
      assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]').getAttribute('aria-controls')`), 'composer');
      await toggle();
      assert.equal(await isVisible('composer'), true);
      assert.equal(await isVisible('picker-emote'), true, 'opening restores native composer tools too');
      assert.equal(await expanded(), 'true');
      assert.equal(await evaluate(`document.activeElement.matches('[data-a-target="chat-input"]')`), true, 'opening focuses the editor');
      await evaluate(`__storagePatch({topNavigation:false})`);
      assert.equal(await expanded(), 'true', 'unrelated setting changes keep the composer open');
      await toggle();
      assert.equal(await isVisible('composer'), false);
      assert.equal(await evaluate(`document.querySelector('[data-a-target="chat-input"]').textContent`), 'A draft to keep');
      assert.equal(await evaluate(`document.activeElement.hasAttribute('data-tq-chat-toggle')`), true, 'closing returns focus to Chat');
      for (const [key,code,keyCode] of [['Enter','Enter',13],[' ','Space',32]]) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key === 'Enter' ? '\r' : ' ', unmodifiedText: key === 'Enter' ? '\r' : ' ' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
        assert.equal(await expanded(), 'true', `${code} opens the box instead of sending`);
        await toggle();
        assert.equal(await expanded(), 'false');
      }
      assert.deepEqual(await evaluate(`({sends:nativeSends,submits:nativeSubmits,delegated:delegatedClicks,writes:__writes.length})`), { sends: 0, submits: 0, delegated: 0, writes: 0 });
      await toggle();
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate(`nativeSends`), 1, 'Enter in the editor still reaches its native handler');
      await evaluate(`__storagePatch({chatComposer:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle], [data-tq-composer-open]').length`), 0);
      assert.equal(await isVisible('composer'), true);
      assert.equal(await isVisible('chat-send'), true);
      assert.equal(await evaluate(`document.querySelector('#chat-send').disabled`), true, 'native disabled state is never changed');
      assert.equal(await evaluate(`document.querySelector('#composer').id`), 'composer', 'native IDs stay intact');
      await evaluate(`document.querySelector('#chat-send').disabled=false;document.querySelector('#chat-send').click()`);
      assert.equal(await evaluate(`nativeSends`), 2, 'pausing restores native Send behavior');
      await evaluate(`__storagePatch({chatComposer:true})`);
      assert.equal(await expanded(), 'false', 'reenabling starts collapsed');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle], [data-tq-composer-open]').length`), 0);
      assert.equal(await isVisible('composer'), true);
      assert.equal(await isVisible('chat-send'), true);
    });

    await t.test('Chat toggle follows later and replaced composers, including the supplied live editor', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`document.querySelector('[data-tq-chat-toggle]').click();const old=document.querySelector('.chat-input');old.replaceWith(old.cloneNode(true))`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle]').length`), 1, 'cloned controls are replaced without duplicates');
      assert.equal(await isVisible('composer'), false, 'a new composer starts collapsed');
      await evaluate(`document.querySelector('.chat-input').remove();document.querySelector('.chat-room__content').insertAdjacentHTML('beforeend','<div class="chat-input" id="late-composer"><div class="chat-input__textarea"><textarea data-a-target="chat-input">Later draft</textarea></div><div class="footer"><button data-a-target="chat-send-button" disabled>Chat</button></div></div>')`);
      await waitFor(`document.querySelector('#late-composer [data-tq-chat-toggle]')`);
      await evaluate(`document.querySelector('[data-tq-chat-toggle]').click()`);
      assert.equal(await evaluate(`document.activeElement.matches('textarea')`), true);
      assert.equal(await evaluate(`document.activeElement.value`), 'Later draft');
      await evaluate(`document.querySelector('.chat-input__textarea').replaceWith(document.querySelector('.chat-input__textarea').cloneNode(true));document.querySelector('[data-a-target="chat-send-button"]').replaceWith(document.querySelector('[data-a-target="chat-send-button"]').cloneNode(true))`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-toggle]').length`), 1);
      assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]').getAttribute('aria-expanded')`), 'true', 'replacing editor internals preserves open state');
      assert.equal(await evaluate(`document.getElementById(document.querySelector('[data-tq-chat-toggle]').getAttribute('aria-controls'))===document.querySelector('.chat-input__textarea')`), true, 'controls points to the replacement editor');
      await evaluate(`__storagePatch({chatComposer:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[id^="twitch-min-composer-"], [data-tq-chat-toggle], [data-tq-composer-open]').length`), 0, 'generated IDs and markers are removed');
      assert.equal(await evaluate(`document.querySelector('textarea').value`), 'Later draft');

      const snapshotFile = path.join(root, '.browser-tests', 'live.html');
      if (fs.existsSync(snapshotFile)) {
        const source = fs.readFileSync(snapshotFile, 'utf8');
        await evaluate(`(()=>{
          const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html'),owner=snapshot.querySelector('.chat-input').cloneNode(true);
          owner.querySelectorAll('script,style,link,iframe,object,embed,img').forEach(node=>node.remove());
          for(const node of [owner,...owner.querySelectorAll('*')])for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name) || /^data-tq-/.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name))node.removeAttribute(attribute.name);
          const editor=owner.querySelector('[data-a-target="chat-input"]');editor.textContent='Native live draft';editor.id='native-live-editor';
          const send=owner.querySelector('[data-a-target="chat-send-button"]');send.disabled=true;window.liveNativeSends=0;send.addEventListener('click',()=>liveNativeSends++);
          document.querySelector('.chat-input').replaceWith(owner);__storagePatch({chatComposer:true});
        })()`);
        await evaluate(`document.querySelector('[data-tq-chat-toggle]').click()`);
        assert.equal(await evaluate(`document.activeElement.id`), 'native-live-editor');
        assert.equal(await evaluate(`document.querySelector('#native-live-editor').checkVisibility({checkVisibilityCSS:true})`), true);
        await evaluate(`document.querySelector('[data-tq-chat-toggle]').click()`);
        assert.equal(await evaluate(`document.querySelector('#native-live-editor').checkVisibility({checkVisibilityCSS:true})`), false);
        assert.equal(await evaluate(`document.querySelector('#native-live-editor').textContent`), 'Native live draft');
        assert.equal(await evaluate(`liveNativeSends`), 0);
        await evaluate(`__storagePatch({enabled:false})`);
        assert.equal(await evaluate(`document.querySelectorAll('[id^="twitch-min-composer-"], [data-tq-chat-toggle], [data-tq-composer-open]').length`), 0);
        assert.equal(await evaluate(`document.querySelector('[data-a-target="chat-send-button"]').disabled`), true);
      }
    });
};
