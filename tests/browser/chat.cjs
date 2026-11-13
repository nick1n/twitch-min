const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
    await t.test('chat batches repeated author changes and cleans detached rows without touching retained rows', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      await evaluate(`window.colorReads=0;window.nativeComputedStyle=window.getComputedStyle;window.getComputedStyle=function(...args){colorReads++;return nativeComputedStyle.apply(this,args)};for(let i=0;i<20;i++)document.querySelector('#l2 [data-a-target="chat-message-username"]').classList.toggle('batch-test')`);
      assert.equal(await evaluate(`colorReads`), 1, 'one color read per affected row in a batch');
      await evaluate(`window.removedChatRow=document.querySelector('#l2');colorReads=0;removedChatRow.remove()`);
      assert.equal(await evaluate(`colorReads`), 0, 'removal repairs grouping without retinting retained history');
      assert.equal(await evaluate(`removedChatRow.hasAttribute('data-tq-chat-tint') || removedChatRow.hasAttribute('data-tq-chat-continuation')`), false);
      await evaluate(`document.querySelector('#live-items').append(removedChatRow)`);
      assert.equal(await evaluate(`removedChatRow.hasAttribute('data-tq-chat-tint')`), true, 'reinserted rows are styled again');
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
};
