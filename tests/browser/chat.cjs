const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, isVisible, send, waitFor }) => {
    await t.test('replay message menus hide as a whole, cover later rows and restore native actions on pause', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`(()=>{
        const menu=document.createElement('div');menu.className='video-chat__message-menu';menu.id='message-menu';
        menu.innerHTML='<div><div><button id="message-menu-button" aria-label="Message Actions Menu">⋮</button></div></div>';
        document.querySelector('#tint-blue').append(menu);
        window.messageActions=0;document.querySelector('#message-menu-button').addEventListener('click',()=>messageActions++);
        const outside=document.createElement('button');outside.id='outside-message-action';outside.setAttribute('aria-label','Message Actions Menu');outside.textContent='Other actions';document.body.append(outside);
      })()`);
      assert.equal(await isVisible('message-menu'), false);
      assert.equal(await isVisible('message-menu-button'), false);
      assert.equal(await evaluate(`document.querySelector('#message-menu').getBoundingClientRect().height`), 0, 'the entire wrapper leaves no menu space');
      assert.equal(await isVisible('outside-message-action'), true, 'matching labels outside chat stay native');
      assert.equal(await evaluate(`document.querySelector('#message-menu-button').getAttribute('aria-label')`), 'Message Actions Menu');
      assert.equal(await isVisible('actual-replay-message'), true);
      assert.equal(await isVisible('actual-replay-time'), true);
      await evaluate(`__storagePatch({enabled:false})`);
      for (const id of ['message-menu','message-menu-button']) assert.equal(await isVisible(id), true, `${id} restores`);
      await evaluate(`document.querySelector('#message-menu-button').click()`);
      assert.equal(await evaluate(`messageActions`), 1, 'the native handler remains attached');
      await evaluate(`__storagePatch({enabled:true});history.pushState({},'', '?later-replay');const row=document.createElement('div');row.className='vod-message';row.innerHTML='<span>Later message</span><div id="later-message-menu" class="video-chat__message-menu"><div><button aria-label="Message Actions Menu">⋮</button></div></div>';document.querySelector('#messages').append(row)`);
      for (const id of ['message-menu','later-message-menu']) assert.equal(await isVisible(id), false, `${id} hides after navigation`);
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await isVisible('later-message-menu'), true);
    });

    await t.test('live and replay chat hide scrollbars, keep native scrolling and restore on pause', async () => {
      await navigate('tests/fixtures/twitch.html');
      await evaluate(`(()=>{
        const live=document.querySelector('#messages');live.style.cssText='height:120px;overflow-y:scroll';live.tabIndex=0;
        const filler=document.createElement('div');filler.style.height='1500px';live.append(filler);
        const replay=document.createElement('div');replay.id='scroll-replay';replay.className='video-chat__message-list-wrapper';replay.style.cssText='width:220px;height:120px;overflow-y:scroll';replay.innerHTML='<div style="height:1500px">Replay messages</div>';
        document.body.append(replay);
        const outside=replay.cloneNode(true);outside.id='scroll-outside';outside.className='scrollable-area';document.body.append(outside);
      })()`);
      const scrollbars = () => evaluate(`['messages','scroll-replay','scroll-outside'].map(id=>{const node=document.getElementById(id);return {width:getComputedStyle(node).scrollbarWidth,webkit:getComputedStyle(node,'::-webkit-scrollbar').display,overflow:getComputedStyle(node).overflowY}})`);
      const hidden = { width: 'none', webkit: 'none', overflow: 'scroll' };
      assert.deepEqual((await scrollbars()).slice(0,2), [hidden,hidden]);
      assert.equal((await scrollbars())[2].width, 'auto', 'unrelated scroll areas keep their scrollbar');
      assert.equal(await evaluate(`(()=>{const node=document.querySelector('#scroll-replay');node.scrollTop=80;return node.scrollTop})()`), 80);
      const point = await evaluate(`(()=>{const node=document.querySelector('#messages');node.scrollIntoView();node.scrollTop=0;const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 80 });
      await waitFor(`document.querySelector('#messages').scrollTop>0`);
      await evaluate(`document.querySelector('#messages').focus();document.querySelector('#messages').scrollTop=0`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 });
      await waitFor(`document.querySelector('#messages').scrollTop>0`);
      await evaluate(`__storagePatch({enabled:false})`);
      for (const style of await scrollbars()) {
        assert.equal(style.width, 'auto', 'pause restores native scrollbars');
        assert.equal(style.overflow, 'scroll');
        assert.notEqual(style.webkit, 'none');
      }
      await evaluate(`__storagePatch({enabled:true});const old=document.querySelector('#scroll-replay');old.replaceWith(old.cloneNode(true))`);
      assert.deepEqual((await scrollbars()).slice(0,2), [hidden,hidden], 'later chat mounts inherit the rule');
    });

    await t.test('replay timestamps follow the first text baseline with badges, emotes and wrapped messages', async () => {
      await navigate('tests/fixtures/chat-alignment.html');
      const offsets = () => evaluate(`['plain','badge','emote','continuation','wrapped'].map(id=>{
        const text=document.getElementById(id+'-text'),range=document.createRange();
        range.setStart(text.firstChild,1);range.setEnd(text.firstChild,2);
        return range.getBoundingClientRect().top-document.getElementById(id+'-time').getBoundingClientRect().top;
      })`);
      const assertAligned = async () => {
        const values = await offsets();
        for (const value of values) assert.ok(Math.abs(value - values[0]) < 1, `timestamp/text offsets stay consistent: ${values}`);
      };
      await assertAligned();
      await evaluate(`window.seekClicks=0;document.querySelector('#emote-time').parentElement.addEventListener('click',()=>seekClicks++);document.querySelector('#emote-time').click()`);
      assert.equal(await evaluate(`seekClicks`), 1, 'native timestamp seek handler remains');
      await evaluate(`__storagePatch({enabled:false})`);
      const native = await offsets();
      assert.ok(Math.abs(native[2] - native[0]) > 2, 'pause restores the native emote-dependent offset');
      assert.equal(await evaluate(`document.querySelector('#emote-time').textContent`), '3:39:00');
      await evaluate(`__storagePatch({enabled:true})`);
      await assertAligned();
      await evaluate(`const rows=document.querySelector('#alignment-rows');rows.remove();history.pushState({},'', '?another-video');document.querySelector('.video-chat').append(rows.cloneNode(true))`);
      await assertAligned();
    });

    await t.test('live and VOD sender groups have black top borders that restore on pause', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      const continuations = new Set(['k2', 'k3', 'k4', 'a2', 'l2', 'l5']);
      const borders = () => evaluate(`[...document.querySelectorAll('.vod-message, .chat-line__message')].map(row=>({id:row.id,border:getComputedStyle(row).borderTop}))`);
      const assertBorders = async () => {
        const styles = await borders();
        assert.ok(styles.length > 0);
        for (const { id, border } of styles) {
          if (continuations.has(id)) assert.match(border, /^0px none /, `${id} continues without a border`);
          else assert.equal(border, '1px solid rgb(0, 0, 0)', `${id} starts a bordered group`);
        }
      };
      await assertBorders();
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#live-status')).borderTopWidth`), '0px', 'status notices stay unchanged');
      await evaluate(`document.querySelector('#live-items').insertAdjacentHTML('beforeend','<div class="chat-line__message">Later live message</div>');document.querySelector('#vod-items').insertAdjacentHTML('beforeend','<li><div class="vod-message">Later VOD message</div></li>')`);
      await assertBorders();
      await evaluate(`__storagePatch({enabled:false})`);
      for (const { border } of await borders()) assert.match(border, /^0px none /, 'pause restores native borders');
      await evaluate(`__storagePatch({enabled:true})`);
      await assertBorders();
      await evaluate(`document.querySelector('#k1').closest('li').remove();document.querySelector('#l1').remove()`);
      continuations.delete('k2');
      continuations.delete('l2');
      await assertBorders();
    });

    await t.test('BetterTTV stripes do not change equal sender backgrounds and restore on pause', async () => {
      await navigate('tests/fixtures/chat-sequences.html');
      const backgrounds = () => evaluate(`['k1','k2'].map(id=>{const style=getComputedStyle(document.getElementById(id));return [style.backgroundColor,style.backgroundImage]})`);
      let styles = await backgrounds();
      assert.deepEqual(styles[0], styles[1], 'same sender has the same full background despite a BetterTTV stripe');
      await evaluate(`__storagePatch({enabled:false})`);
      styles = await backgrounds();
      assert.notEqual(styles[0][0], styles[1][0], 'pausing restores BetterTTV backgrounds');
      await evaluate(`__storagePatch({enabled:true})`);
      styles = await backgrounds();
      assert.deepEqual(styles[0], styles[1]);
      await evaluate(`document.querySelector('#k2').classList.add('bttv-split-chat-alt-bg');document.querySelector('#k1').classList.remove('bttv-split-chat-alt-bg')`);
      styles = await backgrounds();
      assert.deepEqual(styles[0], styles[1], 'later stripe changes remain consistent');
    });

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
      assert.equal(await isVisible('live-repeat-badge'), false);
      for (const id of ['live-repeat-wrapper','live-repeat-colon']) assert.equal(await isVisible(id), false, `${id} stays grouped`);
      for (const id of ['live-repeat-body','live-repeat-emote']) assert.equal(await isVisible(id), true, `${id} stays visible`);
      await evaluate(`document.querySelector('#live-repeat-name').style.color='rgb(10, 180, 90)'`);
      assert.equal(await evaluate(`document.querySelector('#live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(139, 88, 255)', 'continuations share the first sender tint');
      await evaluate(`(()=>{const row=document.querySelector('#live-pink').cloneNode(true);for(const node of [row,...row.querySelectorAll('[id]')])node.removeAttribute('id');row.id='live-new';row.dataset.aUser='new_user';const name=row.querySelector('[data-a-target="chat-message-username"]');name.dataset.aUser='new_user';name.textContent='NewUser';name.style.color='rgb(20, 100, 220)';document.querySelector('#live-native-items').append(row)})()`);
      assert.equal(await evaluate(`document.querySelector('#live-new').style.getPropertyValue('--tq-chat-color')`), 'rgb(20, 100, 220)', 'new messages use their own inner color');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-tint], [data-tq-chat-author], [data-tq-chat-separator]').length`), 0);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#live-purple')).backgroundColor`), 'rgb(40, 40, 40)');
      for (const id of ['live-repeat-wrapper','live-repeat-colon','live-repeat-badge']) assert.equal(await isVisible(id), true);
      await evaluate(`__storagePatch({enabled:true})`);
      assert.equal(await evaluate(`document.querySelector('#live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(139, 88, 255)');
      assert.equal(await isVisible('live-repeat-wrapper'), false);
      await evaluate(`document.querySelector('#live-purple [data-a-target="chat-message-username"]').style.color='rgb(20, 160, 80)'`);
      assert.equal(await evaluate(`document.querySelector('#live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(20, 160, 80)', 'first-row color updates propagate to continuations');
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
      assert.equal(await evaluate(`document.querySelector('#l2').style.getPropertyValue('--tq-chat-color')`), 'rgb(20, 150, 200)');
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
