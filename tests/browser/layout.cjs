const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor }) => {
    await t.test('Show more finishes every native list page before sidebar filtering or title changes', async () => {
      await navigate('tests/fixtures/sidebar-more.html', 'window.__initialSidebarCollapsed=true;');
      await waitFor(`__moreClicks.length === 2`);
      assert.equal(await evaluate(`__nativeSidebarClicks`), 1, 'expand a collapsed sidebar before finding its lists');
      assert.equal(await isVisible('followed-offline'), true, 'native offline rows remain during loading');
      assert.equal(await evaluate(`document.querySelector('#sidebar-shell').getBoundingClientRect().width`), 240);
      await evaluate(`document.querySelector('#followed-live .side-nav-card__metadata').textContent='Updated game';__storagePatch({topNavigation:false})`);
      assert.equal(await evaluate(`__moreClicks.length`), 2, 'unrelated edits and settings do not double-click pending controls');
      await evaluate(`__finishMore('followed')`);
      await waitFor(`__moreClicks.length === 3`);
      assert.equal(await isVisible('followed-loaded-1'), true, 'native handler reveals later live channels');
      assert.equal(await isVisible('followed-loaded-offline-1'), true, 'pagination finishes before filtering new offline channels');
      await evaluate(`__finishMore('followed');__finishMore('recommended')`);
      await waitFor(`document.querySelector('#sidebar-shell').hasAttribute('data-tq-sidebar-ready')`);
      assert.deepEqual(await evaluate(`__moreClicks`), ['followed','recommended','followed'].map(id => ({ id, offline: true, title: true, heading: 'none', visible: true, ready: false })));
      for (const id of ['followed-offline','followed-loaded-offline-1','followed-loaded-offline-2','recommended-loaded-offline-1','followed-more','recommended-more']) {
        assert.equal(await isVisible(id), false, `${id} hides only after list expansion`);
      }
      for (const id of ['followed-loaded-1','followed-loaded-2','recommended-loaded-1','outside-more']) assert.equal(await isVisible(id), true);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#followed header'),'::before').content`), '"Followed"');
      assert.equal(await evaluate(`document.querySelector('#sidebar-shell').getBoundingClientRect().width`), 144);
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed')`);
      assert.equal(await evaluate(`document.querySelector('[data-tq-sidebar-ready], [data-tq-section], [data-tq-section-title]')`), null, 'pause releases layout markers');
      await evaluate(`document.querySelector('#followed-more').click()`);
      assert.equal(await evaluate(`__lessClicks`), 1, 'native Show less handler remains usable on pause');
      await evaluate(`__storagePatch({enabled:true})`);
      await waitFor(`__moreClicks.length === 4`);
    });

    await t.test('late list controls, disabled links and sidebar replacements expand before restyling', async () => {
      await navigate('tests/fixtures/sidebar-more.html');
      await evaluate(`__finishMore('followed');__finishMore('recommended')`);
      await waitFor(`__moreClicks.length === 3`);
      await evaluate(`__finishMore('followed')`);
      await waitFor(`document.querySelector('[data-tq-sidebar-ready]') !== null`);
      await evaluate(`history.pushState({},'', '?another-channel');__mountMore('late', {link:true,disabled:true})`);
      assert.equal(await isVisible('late-offline'), true, 'a disabled native expansion keeps the sidebar usable');
      assert.equal(await evaluate(`__moreClicks.length`), 3);
      await evaluate(`document.querySelector('#late-more').setAttribute('aria-disabled','false')`);
      await waitFor(`__moreClicks.length === 4`);
      assert.deepEqual(await evaluate(`__moreClicks[3]`), { id: 'late', offline: true, title: true, heading: 'none', visible: true, ready: false });
      await evaluate(`__finishMore('late')`);
      await waitFor(`document.querySelector('[data-tq-sidebar-ready]') !== null`);
      assert.equal(await isVisible('late-loaded-1'), true);
      assert.equal(await isVisible('late-loaded-offline-1'), false);
      await evaluate(`window.oldSide=document.querySelector('#sidebar-shell');const replacement=document.createElement('aside');replacement.id='sidebar-shell';replacement.className='side-nav side-nav--expanded';oldSide.replaceWith(replacement);__mountMore('replacement')`);
      await waitFor(`__moreClicks.length === 5`);
      assert.equal(await evaluate(`oldSide.querySelector('[data-tq-section], [data-tq-section-title]') || (oldSide.hasAttribute('data-tq-sidebar-ready') ? true : null)`), null, 'detached sidebar markers are released');
      await evaluate(`__finishMore('replacement')`);
      await waitFor(`document.querySelector('[data-tq-sidebar-ready]') !== null`);
      assert.equal(await isVisible('replacement-loaded-offline-1'), false);
    });

    await t.test('sidebar expansion obeys both preferences and pause during a pending request', async () => {
      await navigate('tests/fixtures/sidebar-more.html', '__stored.sidebarSections=false;__stored.sidebarLabels=false;window.__initialSidebarCollapsed=true;');
      assert.equal(await evaluate(`__moreClicks.length`), 0, 'inactive sidebar features do not click native lists');
      assert.equal(await evaluate(`__nativeSidebarClicks`), 0, 'inactive sidebar features retain native collapse');
      await evaluate(`__storagePatch({sidebarSections:true})`);
      await waitFor(`__moreClicks.length === 2`);
      assert.equal(await evaluate(`__nativeSidebarClicks`), 1, 'section filtering alone expands the sidebar to reach Show more');
      await evaluate(`__storagePatch({enabled:false});__finishMore('followed');__finishMore('recommended')`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed')`);
      assert.equal(await evaluate(`__moreClicks.length`), 2, 'pause does not request the next page');
      assert.equal(await isVisible('followed-offline'), true);
      assert.equal(await isVisible('followed-more'), true);
      await evaluate(`__storagePatch({enabled:true,sidebarSections:false,sidebarLabels:true})`);
      await waitFor(`__moreClicks.length === 3`);
      await evaluate(`__finishMore('followed')`);
      await waitFor(`document.querySelector('[data-tq-sidebar-ready]') !== null`);
      assert.equal(await isVisible('followed-offline'), true, 'compact rows alone retain offline channels');
      assert.equal(await evaluate(`document.querySelector('#followed-live .side-nav-card__title').checkVisibility({checkVisibilityCSS:true})`), false);
      assert.equal(await isVisible('followed-more'), true, 'section filtering alone owns control hiding');
    });

    await t.test('sidebar scrollbar hides while scrolling works, replay times retain minutes and seeking', async () => {
      await navigate('tests/fixtures/twitch.html');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.side-nav__scrollable_content')).scrollbarWidth`), 'none');
      assert.equal(await evaluate(`(()=>{const x=document.querySelector('.side-nav__scrollable_content');const filler=document.createElement('div');filler.style.height='1500px';x.append(filler);x.scrollTop=80;return x.scrollTop>0})()`), true);
      assert.equal(await evaluate(`document.querySelector('#replay-time').getAttribute('data-tq-time')`), '1:28');
      assert.equal(await evaluate(`document.querySelector('#actual-replay-time p').getAttribute('data-tq-time')`), '1:32');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#actual-replay-time p'),'::after').content`), '"1:32"');
      assert.equal(await evaluate(`document.querySelector('#replay-time').getAttribute('href')`), '/videos/2921409707?t=1h28m10s', 'original seek target unchanged');
      await evaluate(`window.seeks=0;document.querySelector('#actual-replay-time button').addEventListener('click',()=>seeks++);document.querySelector('#actual-replay-time button').click()`);
      assert.equal(await evaluate(`seeks`), 1);
      await evaluate(`document.querySelector('#actual-replay-time p').firstChild.data='5:26'`);
      assert.equal(await evaluate(`document.querySelector('#actual-replay-time p').getAttribute('data-tq-time')`), '0:05', 'under-hour timestamps retain hours:minutes format');
      await evaluate(`document.querySelector('#messages').insertAdjacentHTML('beforeend','<div class="video-chat"><div class="vod-message__header"><button><p id="late-time">12:05:59</p></button></div></div>')`);
      assert.equal(await evaluate(`document.querySelector('#late-time').getAttribute('data-tq-time')`), '12:05');
      await evaluate(`__storagePatch({chatTimestamps:false})`);
      assert.equal(await evaluate(`document.querySelector('#late-time').hasAttribute('data-tq-time')`), false);
      assert.equal(await evaluate(`document.querySelector('#late-time').textContent`), '12:05:59', 'pausing formatting restores full native seconds');
    });

    await t.test('pause disconnects observers after asynchronous sidebar restoration and resumes on remount', async () => {
      await navigate('tests/fixtures/twitch.html', `window.__initialSidebarCollapsed=true;window.activeObservers=new Set();window.MutationObserver=class extends MutationObserver{observe(...args){super.observe(...args);activeObservers.add(this)}disconnect(){super.disconnect();activeObservers.delete(this)}}`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed') && activeObservers.size===0`);
      await evaluate(`const old=document.querySelector('#sidebar-shell');const replacement=old.cloneNode(true);old.replaceWith(replacement);__mountNativeSidebar(replacement);document.querySelector('.top-nav').insertAdjacentHTML('beforeend','<button id="paused-turbo">Gift Turbo</button>')`);
      assert.equal(await evaluate(`document.querySelector('#paused-turbo').hasAttribute('data-tq-top-extra')`), false, 'paused navigation is not scanned');
      await evaluate(`__storagePatch({enabled:true})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      assert.equal(await isVisible('paused-turbo'), false, 'resume discovers new navigation controls');
      await evaluate(`__storagePatch({enabled:false});__storagePatch({enabled:true})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`document.querySelector('#paused-turbo').textContent='Account'`);
      assert.equal(await isVisible('paused-turbo'), true, 'fast resume reconnects navigation observation');
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`activeObservers.size===0`);
    });

    await t.test('sidebar allowlist labels, offline transitions and unexpected third-line captions', async () => {
      await navigate('tests/fixtures/twitch.html', '__stored.sidebarHeadings = false;');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('.side-nav-section')].filter(x=>x.checkVisibility({checkVisibilityCSS:true})).map(x=>x.getAttribute('data-tq-section'))`), ['Followed','Recommended','Similar']);
      for (const [id,title] of [['sidebar-heading','Followed'],['live-heading','Recommended'],['similar-heading','Similar']]) {
        assert.equal(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}),'::before').content`), JSON.stringify(title));
      }
      const originalHeight = await evaluate(`document.querySelector('#channel-row').getBoundingClientRect().height`);
      await evaluate(`document.querySelector('#sidebar-channel-details > :first-child').insertAdjacentHTML('beforeend','<span id="late-stray" style="min-height:40px;font-size:20px">T...</span>'); document.querySelector('#sidebar-nav').insertAdjacentHTML('beforeend','<div id="late-section" class="side-nav-section" aria-label="Other recommendations"><header>Other recommendations</header><p>Extra section</p></div>')`);
      assert.equal(await isVisible('late-stray'), false);
      assert.equal(await isVisible('late-section'), false);
      assert.equal(await evaluate(`document.querySelector('#channel-row').getBoundingClientRect().height`), originalHeight, 'hidden caption creates no third row');
      await evaluate(`document.querySelector('#channel-row').classList.add('side-nav-card__link--offline')`);
      assert.equal(await isVisible('channel-row'), false);
      assert.equal(await evaluate(`document.querySelector('#channel-row').closest('.tw-transition').getBoundingClientRect().height`), 0, 'offline transition wrapper leaves no gap');
      await evaluate(`document.querySelector('#channel-row').classList.remove('side-nav-card__link--offline')`);
      assert.equal(await isVisible('viewer-count'), true, 'channel returning online reappears');
      await evaluate(`__storagePatch({sidebarSections:false})`);
      for (const id of ['offline-channel','other-section','sidebar-for-you','sidebar-streak']) assert.equal(await isVisible(id), true, `${id} restores with section filtering paused`);
    });

    await t.test('native sidebar handles saved collapse, fast toggles, remounts and late navigation controls', async () => {
      await navigate('tests/fixtures/twitch.html', 'window.__initialSidebarCollapsed = true;');
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      assert.equal(await evaluate(`__nativeSidebarClicks`), 1, 'native expansion restores metadata omitted by Twitch collapsed rows');
      assert.equal(await isVisible('viewer-count'), true);
      assert.equal(await isVisible('sidebar-game'), true);
      await evaluate(`__storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed') && __nativeSidebarClicks === 2`);
      await evaluate(`__storagePatch({enabled:true}); __storagePatch({enabled:false})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--collapsed') && __nativeSidebarClicks === 4`);
      await evaluate(`__storagePatch({enabled:true})`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      await evaluate(`(()=>{
        const old=document.querySelector('#sidebar-shell'), replacement=old.cloneNode(true);
        old.replaceWith(replacement); __mountNativeSidebar(replacement); __setNativeSidebarExpanded(false);
      })()`);
      await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
      assert.equal(await isVisible('avatar'), true, 'composite avatar without side-nav-card__avatar survives remount');
      assert.equal(await isVisible('viewer-count'), true, 'count survives native sidebar remount');
      await evaluate(`document.querySelector('.top-nav').insertAdjacentHTML('beforeend', '<div><button id="late-turbo"><div data-a-target="tw-core-button-label-text">Gift Turbo</div></button></div>')`);
      assert.equal(await isVisible('late-turbo'), false, 'text-only control inserted later is hidden');
      await evaluate(`document.querySelector('#late-turbo').textContent='Account'`);
      assert.equal(await isVisible('late-turbo'), true, 'reused control is unmarked if its purpose changes');
      await evaluate(`__storagePatch({topNavigation:false}); document.querySelector('#late-turbo').textContent='Gift Turbo'`);
      assert.equal(await isVisible('late-turbo'), true, 'navigation switch restores text-only controls');
    });
    await t.test('promoted followed cards keep an unclipped avatar, count and game in a normal compact row', async () => {
      const snapshotFile = path.join(root, '.browser-tests', 'live.html');
      for (const variant of ['fixture', ...(fs.existsSync(snapshotFile) ? ['supplied HTML'] : [])]) {
        await navigate('tests/fixtures/promoted-sidebar.html');
        if (variant === 'supplied HTML') {
          const source = fs.readFileSync(snapshotFile, 'utf8');
          await evaluate(`(()=>{
            const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
            const row=snapshot.querySelector('.side-nav-card__link--promoted-followed').cloneNode(true);
            row.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
            for(const node of [row,...row.querySelectorAll('*')])for(const attribute of [...node.attributes]) {
              if(/^on/i.test(attribute.name) || /^data-tq-/.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name))node.removeAttribute(attribute.name);
            }
            row.id='promoted-row';document.querySelector('#promoted-row').replaceWith(row);
          })()`);
        }
        const href = await evaluate(`(()=>{
          const row=document.querySelector('#promoted-row');
          const targets={avatar:'.tw-avatar',status:'.side-nav-card__live-status',count:'.side-nav-card__live-status span[aria-hidden="true"]',game:'.side-nav-promoted-followed-card__content p',title:'.side-nav-promoted-followed-card__title',sponsor:'.side-nav-promoted-followed-card__sponsorship',gradient:'.side-nav-promoted-followed-card__gradient',tooltip:'.side-nav-card__link__tooltip-arrow',art:'.tw-avatar + img'};
          for(const [id,selector] of Object.entries(targets))row.querySelector(selector).id='promoted-'+id;
          window.promotedClicks=0;row.addEventListener('click',event=>{event.preventDefault();promotedClicks++});return row.getAttribute('href');
        })()`);
        for (const id of ['promoted-avatar','promoted-count','promoted-game']) assert.equal(await isVisible(id), true, `${variant}: ${id} remains visible`);
        for (const id of ['promoted-title','promoted-sponsor','promoted-gradient','promoted-tooltip','promoted-art']) assert.equal(await isVisible(id), false, `${variant}: ${id} is hidden`);
        const geometry = () => evaluate(`(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return Object.fromEntries(['promoted-row','promoted-avatar','promoted-status','promoted-game','reference-row'].map(id=>[id,rect(id)]))})()`);
        const rects = await geometry(), row = rects['promoted-row'], avatar = rects['promoted-avatar'], count = rects['promoted-status'], game = rects['promoted-game'];
        assert.equal(row.width, 144, variant);
        assert.equal(row.height, rects['reference-row'].height, `${variant}: same compact height as an ordinary channel`);
        assert.equal(avatar.width, 26, variant); assert.equal(avatar.height, 26, variant);
        assert.ok(avatar.y >= row.y && avatar.bottom <= row.bottom, `${variant}: the full avatar stays inside its row`);
        assert.ok(count.x >= avatar.right, `${variant}: count appears beside the avatar`);
        assert.equal(count.x, game.x, `${variant}: game aligns with the count`);
        assert.ok(game.y >= count.bottom && game.right <= row.right, `${variant}: game fits below the count`);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('#promoted-count')).fontSize`), '13px');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('#promoted-game')).fontSize`), '12px');
        await evaluate(`document.querySelector('#promoted-count').textContent='101K';const game=document.querySelector('#promoted-game');game.textContent='Another current game';game.title='Another current game';document.querySelector('#promoted-row').click()`);
        assert.equal(await evaluate(`promotedClicks`), 1, `${variant}: native link handlers survive`);
        assert.equal((await geometry())['promoted-row'].height, row.height, `${variant}: native count/game updates preserve row height`);
        await evaluate(`__storagePatch({sidebarLabels:false})`);
        for (const id of ['promoted-title','promoted-sponsor','promoted-gradient']) assert.equal(await isVisible(id), true, `${variant}: ${id} restores`);
        assert.ok((await geometry())['promoted-row'].height > row.height, `${variant}: native card sizing restores`);
        assert.equal(await evaluate(`document.querySelector('#promoted-row').getAttribute('href')`), href, `${variant}: native destination stays intact`);
      }
    });

};
