const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async (t, { navigate, evaluate, isVisible }) => {
  const markup = fs.readFileSync(path.join(__dirname, '../fixtures/emote-tooltip.html'), 'utf8');
  const hover = (id = 'live-first-image') => evaluate(`document.getElementById(${JSON.stringify(id)}).dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))`);
  const leave = (id = 'live-first-image') => evaluate(`document.getElementById(${JSON.stringify(id)}).dispatchEvent(new PointerEvent('pointerout',{bubbles:true}))`);
  const nativeTooltip = (name, { id = 'badge-tooltip', source = 'live-first', linked = true } = {}) => evaluate(`(()=>{
    const template=document.createElement('template');template.innerHTML=${JSON.stringify(markup)};
    const layer=template.content.querySelector('.tw-tooltip-layer');layer.id=${JSON.stringify(id)};
    const wrapper=layer.querySelector('.tw-tooltip-wrapper');wrapper.textContent=${JSON.stringify(name)};
    wrapper.style.cssText='background:rgb(255,255,255);color:rgb(20,20,20);padding:6px 8px;border-radius:4px;font:600 13px/16px Arial,sans-serif;white-space:nowrap';
    const positioner=layer.querySelector('[data-popper-placement]');positioner.id=${JSON.stringify(id + '-positioner')};
    if(${linked})document.getElementById(${JSON.stringify(source)}).setAttribute('aria-describedby',positioner.id);
    document.body.append(template.content);
    return {style:wrapper.style.cssText,transform:positioner.style.transform};
  })()`);
  const details = (id = 'badge-tooltip') => evaluate(`document.getElementById(${JSON.stringify(id)}).querySelector('[data-tq-chat-badge-details]')?.textContent ?? null`);

  await t.test('live and replay keep one badge, unchanged native titles and controls, and restore on pause', async () => {
    await navigate('tests/fixtures/chat-badges.html');
    const title = id => evaluate(`document.getElementById(${JSON.stringify(id)}).getAttribute('title')`);
    assert.equal(await title('live-first'), null, 'no browser title is synthesized');
    assert.equal(await title('live-first-image'), null);
    assert.equal(await title('vod-first'), 'Prime');
    assert.equal(await title('vod-first-image'), 'Image title');
    for (const id of ['live-first','live-first-layout','vod-first','single-image','live-body','body-emote','vod-body','vod-time','vod-actions','outside-first','outside-second','continuation-body']) assert.equal(await isVisible(id), true, `${id} remains visible`);
    for (const id of ['live-second','live-third','live-second-layout','live-third-layout','vod-second-layout','continuation-first','continuation-second']) assert.equal(await isVisible(id), false, `${id} leaves no badge space`);
    assert.equal(await title('single-image'), 'Original single title');
    assert.equal(await title('outside-first'), null);
    assert.equal(await evaluate(`document.querySelector('#live-first').getAttribute('aria-label')`), 'Moderator');
    await evaluate(`window.badgeClicks=0;window.seekClicks=0;document.querySelector('#live-first').addEventListener('click',()=>badgeClicks++);document.querySelector('#vod-time').addEventListener('click',()=>seekClicks++);document.querySelector('#live-first').click();document.querySelector('#vod-time').click()`);
    assert.deepEqual(await evaluate(`[badgeClicks,seekClicks,document.querySelector('#vod-time').textContent]`), [1,1,'1:32:56']);
    await nativeTooltip('Moderator');
    await hover();
    assert.equal(await details(), '3-Month Subscriber\nPrime');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await details(), null);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-badge-hidden], [data-tq-chat-badges]').length`), 0);
    for (const id of ['live-second-layout','live-third-layout','vod-second-layout','continuation-first','continuation-second']) assert.equal(await isVisible(id), true, `${id} restores`);
    await evaluate(`__storagePatch({enabled:true})`);
    assert.equal(await isVisible('live-second-layout'), false);
    await hover('vod-first-image');
    await nativeTooltip('Prime', { id: 'vod-tooltip', source: 'vod-first' });
    assert.equal(await details('vod-tooltip'), 'Bits Leader 3');
  });

  await t.test('live and replay sender runs show one header badge and hide continuation badge wrappers', async () => {
    await navigate('tests/fixtures/chat-badge-groups.html');
    const first = ['vod-start-first','vod-single-first','vod-inline-first','live-start-first','live-inline-first'];
    const extras = ['vod-start-extra','vod-inline-extra','live-start-extra','live-inline-extra'];
    const names = ['vod-single-author','vod-inline-author','live-inline-author'];
    const assertCompact = async () => {
      const rows = await evaluate(`[...document.querySelectorAll('.vod-message, .chat-line__message')].map(row=>({id:row.id,continuation:row.hasAttribute('data-tq-chat-continuation'),visible:[...row.querySelectorAll('.chat-badge')].filter(node=>node.checkVisibility({checkVisibilityCSS:true})).length,nameVisible:row.querySelector('[data-a-target="chat-message-username"]').checkVisibility({checkVisibilityCSS:true})}))`);
      for (const row of rows) {
        assert.equal(row.visible, row.continuation ? 0 : 1, `${row.id}: only a visible username gets a badge`);
        assert.equal(row.nameVisible, !row.continuation, `${row.id}: grouping and badges stay aligned`);
      }
    };
    await assertCompact();
    await nativeTooltip('6-Month Subscriber', { source: 'vod-start-first' });
    await hover('vod-start-first');
    assert.equal(await details(), 'Prime', 'the retained badge still lists the hidden badge in Twitch\'s tooltip');
    await evaluate(`window.nativeBadgeClicks=0;document.querySelector('#live-inline-control').addEventListener('click',()=>nativeBadgeClicks++);__storagePatch({enabled:false})`);
    assert.equal(await details(), null, 'pause removes added tooltip details');
    for (const id of [...first,...extras,...names]) assert.equal(await isVisible(id), true, `${id} restores`);
    await evaluate(`document.querySelector('#live-inline-control').click()`);
    assert.equal(await evaluate(`nativeBadgeClicks`), 1, 'pause restores the original badge handler');
    await evaluate(`window.laterBadgeRow=document.querySelector('#vod-inline').cloneNode(true);for(const node of [laterBadgeRow,...laterBadgeRow.querySelectorAll('[id]')])node.removeAttribute('id');laterBadgeRow.id='later-badge-row';laterBadgeRow.querySelector('.chat-badge').id='later-first';laterBadgeRow.querySelectorAll('.chat-badge')[1].id='later-extra';laterBadgeRow.querySelector('[data-a-target="chat-message-username"]').id='later-author';__storagePatch({enabled:true})`);
    await assertCompact();
    await evaluate(`document.querySelector('#grouped-vod .video-chat__message-list-wrapper').append(laterBadgeRow)`);
    for (const id of ['later-first','later-extra','later-author']) assert.equal(await isVisible(id), false, 'later continuation badges stay hidden');
    await evaluate(`document.querySelector('#vod-start').remove()`);
    assert.equal(await isVisible('vod-single-first'), true, 'trimming history restores the new leading row\'s single badge');
    assert.equal(await isVisible('vod-single-author'), true);
    await evaluate(`document.querySelector('#vod-single').remove()`);
    assert.equal(await isVisible('vod-inline-first'), true, 'the new leading shared identity wrapper keeps one badge');
    assert.equal(await isVisible('vod-inline-extra'), false);
    await assertCompact();
    await evaluate(`window.oldBadgeRegion=document.querySelector('#grouped-vod');oldBadgeRegion.remove();history.pushState({},'', '?another-video')`);
    assert.equal(await evaluate(`oldBadgeRegion.querySelector('[data-tq-chat-badge-hidden], [data-tq-chat-author]')`), null, 'navigation restores detached rows');
    await evaluate(`document.body.prepend(oldBadgeRegion)`);
    await assertCompact();
    assert.equal(await isVisible('later-first'), false, 'remounted continuation badges stay hidden');
  });

  await t.test('native badge popup retains its text nodes, theme, arrow, role and placement; late and reused tooltips stay safe', async () => {
    await navigate('tests/fixtures/chat-badges.html');
    await evaluate(`document.querySelector('#live-first-image').alt='Founder badge';document.querySelector('#live-first').setAttribute('aria-label','Founder')`);
    await hover();
    await nativeTooltip('Unrelated', { id: 'unrelated-tooltip', linked: false });
    assert.equal(await details('unrelated-tooltip'), null);
    const before = await nativeTooltip('Founder', { linked: false });
    await evaluate(`window.nativeBadgeLabel=document.querySelector('#badge-tooltip .tw-tooltip-wrapper').firstChild`);
    assert.equal(await details(), '3-Month Subscriber\nPrime');
    assert.equal(await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-wrapper').innerText`), 'Founder\n3-Month Subscriber\nPrime');
    assert.equal(await evaluate(`nativeBadgeLabel===document.querySelector('#badge-tooltip .tw-tooltip-wrapper').firstChild`), true);
    assert.equal(await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-wrapper').style.cssText`), before.style);
    assert.equal(await evaluate(`document.querySelector('#badge-tooltip-positioner').style.transform`), before.transform);
    assert.equal(await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-popper-arrow').style.transform`), 'translate(53px, 0px)');
    assert.equal(await evaluate(`document.querySelectorAll('#badge-tooltip [role="tooltip"]').length`), 1);
    await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-wrapper').textContent='Founder'`);
    assert.equal(await details(), '3-Month Subscriber\nPrime', 'native rerender reattaches only our details');
    // First badge and tooltip metadata can change without remounting either.
    await evaluate(`document.querySelector('#live-second img').alt='6-Month Subscriber badge'`);
    assert.equal(await details(), '6-Month Subscriber\nPrime');
    await evaluate(`document.querySelector('#live-first').setAttribute('aria-describedby','badge-tooltip-positioner');document.querySelector('#badge-tooltip .tw-tooltip-wrapper').firstChild.data='Another tooltip'`);
    assert.equal(await details(), null, 'a stale native association cannot decorate a reused tooltip');
    await leave();
    assert.equal(await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-wrapper').textContent`), 'Another tooltip');
    await hover();
    await evaluate(`document.querySelector('#badge-tooltip .tw-tooltip-wrapper').textContent='Founder'`);
    assert.equal(await details(), '6-Month Subscriber\nPrime');
    await evaluate(`document.querySelector('#badge-tooltip .tw-transition').setAttribute('aria-hidden','true')`);
    assert.equal(await details(), null, 'native dismissal removes added names');
  });

  await t.test('badge hover/focus dismissal, unrelated mutations, order changes and removed sources release tooltip details', async () => {
    await navigate('tests/fixtures/chat-badges.html');
    await nativeTooltip('Moderator');
    await hover();
    await evaluate(`window.geometryReads=0;const host=document.querySelector('#badge-tooltip .tw-tooltip-wrapper');const rect=host.getBoundingClientRect.bind(host);host.getBoundingClientRect=()=>{geometryReads++;return rect()};document.querySelector('.chat-scrollable-area__message-container').insertAdjacentHTML('beforeend','<div class="chat-line__message"><span data-a-target="chat-message-username">OtherUser</span><span>New message</span></div>')`);
    assert.equal(await evaluate(`geometryReads`), 0, 'ordinary messages do not rediscover or measure tooltips');
    await evaluate(`document.querySelector('#live-first-image').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.querySelector('#live-first')}))`);
    assert.equal(await details(), '3-Month Subscriber\nPrime', 'movement within the badge keeps the native tooltip');
    await leave();
    assert.equal(await details(), null);
    await evaluate(`document.querySelector('#live-first').focus()`);
    assert.equal(await details(), '3-Month Subscriber\nPrime', 'keyboard focus uses the same native popup');
    await leave();
    assert.equal(await details(), '3-Month Subscriber\nPrime', 'pointer exit does not dismiss a focused badge');
    await evaluate(`document.querySelector('#live-first').blur()`);
    assert.equal(await details(), null);
    for (const event of ["new KeyboardEvent('keydown',{key:'Escape',bubbles:true})", "new Event('scroll')"]) {
      await hover();
      assert.equal(await details(), '3-Month Subscriber\nPrime');
      await evaluate(`document.dispatchEvent(${event})`);
      assert.equal(await details(), null);
    }
    await hover();
    await evaluate(`document.querySelector('#live-badge-slot').prepend(document.querySelector('#live-second-layout'))`);
    assert.equal(await details(), null, 'changing the first badge closes the old hint');
    assert.equal(await isVisible('live-second-layout'), true);
    assert.equal(await isVisible('live-first-layout'), false);
    await hover('live-second');
    await nativeTooltip('3-Month Subscriber', { id: 'second-tooltip', source: 'live-second' });
    assert.equal(await details('second-tooltip'), 'Moderator\nPrime');
    await evaluate(`window.removedBadgeRow=document.querySelector('#live-badges');removedBadgeRow.remove()`);
    assert.equal(await details('second-tooltip'), null);
    assert.equal(await evaluate(`removedBadgeRow.querySelector('[data-tq-chat-badge-hidden]')`), null);
    await evaluate(`document.querySelector('.chat-scrollable-area__message-container').prepend(removedBadgeRow)`);
    await hover('live-second');
    assert.equal(await details('second-tooltip'), 'Moderator\nPrime', 'a later row mount activates hover handling');
    await evaluate(`window.removedChat=document.querySelector('#live-root');removedChat.remove()`);
    assert.equal(await details('second-tooltip'), null);
    assert.equal(await evaluate(`removedChat.querySelector('[data-tq-chat-badge-hidden], [data-tq-chat-badges]')`), null);
    await evaluate(`document.body.append(removedChat)`);
    await hover('live-second');
    assert.equal(await details('second-tooltip'), 'Moderator\nPrime', 'navigation remount reactivates compaction and native hover');
    await evaluate(`document.querySelector('#second-tooltip').remove()`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-chat-badge-details]')`), null);
    await leave('live-second');
    await hover('live-second');
    await nativeTooltip('3-Month Subscriber', { id: 'last-tooltip', source: 'live-second' });
    await evaluate(`document.querySelector('#live-first-layout').remove();document.querySelector('#live-third-layout').remove()`);
    assert.equal(await details('last-tooltip'), null, 'one remaining badge needs no added names');
    assert.equal(await isVisible('live-second-layout'), true);
  });

  await t.test('compact badge ownership transfers between chat panes in either observer order', async () => {
    await navigate('tests/fixtures/chat-badges.html');
    // Live was discovered first: exercise source-first and destination-first
    // observers, preserving hidden wrappers and the native badge popup in both.
    for (const [row, destination, first, name, expected] of [
      ['live-badges', '#vod-root .video-chat__message-list-wrapper', 'live-first', 'Moderator', '3-Month Subscriber\nPrime'],
      ['vod-badges', '#live-root .chat-scrollable-area__message-container', 'vod-first', 'Prime', 'Bits Leader 3']
    ]) {
      await evaluate(`document.querySelector(${JSON.stringify(destination)}).append(document.getElementById(${JSON.stringify(row)}))`);
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(row)}).querySelectorAll('[data-tq-chat-badge-hidden]').length`), row === 'live-badges' ? 2 : 1);
      await hover(first);
      await nativeTooltip(name, { id: row + '-tooltip', source: first });
      assert.equal(await details(row + '-tooltip'), expected);
      await leave(first);
    }
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-tq-chat-badge-hidden], [data-tq-chat-badge-details]').length`), 0);
  });
};
