const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor }) => {
  const settleLayout = () => evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
  const scrollState = () => evaluate(`({document:document.scrollingElement.scrollTop,outer:document.querySelector('#following-outer').scrollTop,inner:document.querySelector('#following-mount').scrollTop,focus:document.activeElement.id})`);
  async function prepareScrolling() {
    await navigate('tests/fixtures/following.html', '__stored.enabled=false;__stored.followingStories=false;');
    await evaluate(`(()=>{
      const mount=document.querySelector('#following-mount'),outer=document.createElement('main');
      outer.id='following-outer';outer.style.cssText='height:300px;overflow:auto;scroll-behavior:smooth';
      mount.before(outer);outer.innerHTML='<div style="height:150px"></div>';outer.append(mount);
      outer.insertAdjacentHTML('beforeend','<div style="height:1000px"></div>');
      mount.style.cssText='height:240px;overflow:auto;scroll-behavior:smooth';
      document.body.style.height='2500px';document.documentElement.style.scrollBehavior='smooth';
      document.querySelector('#outside-more').focus({preventScroll:true});
      window.scrollTo({top:100,behavior:'instant'});outer.scrollTo({top:50,behavior:'instant'});mount.scrollTo({top:80,behavior:'instant'});
      window.__onFollowingMore=(shelf,phase)=>{
        const move=()=>{const button=shelf.querySelector('button');button.focus();button.scrollIntoView({block:'end',behavior:'instant'})};
        if(phase==='click')move();else requestAnimationFrame(move);
      };
    })()`);
    await settleLayout();
  }

  await t.test('automatic Following pagination preserves document/nested scrolling and focus through native effects', async () => {
    await prepareScrolling();
    const original = await scrollState();
    await evaluate(`__storagePatch({enabled:true})`);
    await settleLayout();
    assert.deepEqual(await scrollState(), original, 'native clicks must not move or focus the viewport');
    for (const id of ['recommended', 'latest', 'recommended', 'latest']) {
      await evaluate(`__finishFollowing('${id}')`);
      await settleLayout();
      assert.deepEqual(await scrollState(), original, `${id}: deferred native effects and new cards preserve position`);
    }
    assert.equal(await evaluate('__followingClicks.length'), 4, 'both lists still finish expanding');
  });

  await t.test('Following scroll preservation yields to user input and releases pending work on pause', async () => {
    await prepareScrolling();
    await evaluate(`__storagePatch({enabled:true});window.__onFollowingMore=null;const mount=document.querySelector('#following-mount');mount.style.overflowAnchor='none';mount.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:100}));mount.scrollTo({top:220,behavior:'instant'});document.querySelector('#outside-more').focus({preventScroll:true})`);
    const chosen = await scrollState();
    await settleLayout();
    assert.deepEqual(await scrollState(), chosen, 'a queued restoration never undoes user scrolling');
    await evaluate(`__finishFollowing('latest')`);
    await settleLayout();
    assert.deepEqual(await scrollState(), chosen, 'an old pending request never restores a stale position');
    await evaluate(`__storagePatch({enabled:false});document.querySelector('#following-mount').scrollTo({top:260,behavior:'instant'});__finishFollowing('recommended')`);
    const paused = await scrollState();
    await settleLayout();
    assert.deepEqual(await scrollState(), paused, 'pause cancels pending scroll work');
  });

  await t.test('Following hides Stories and expands only Recommended channels and Latest videos', async () => {
    await navigate('tests/fixtures/following.html');
    await waitFor('__followingClicks.length === 2');
    assert.equal(await isVisible('following-stories'), false);
    for (const id of ['following-title', 'following-tabs', 'following-page-main-content', 'other-scrollable', 'live-more', 'categories-more', 'continue-more', 'outside-more']) {
      assert.equal(await isVisible(id), true, `${id} stays visible`);
    }
    assert.equal(await evaluate(`document.querySelector('#following-stories').getBoundingClientRect().height`), 0, 'the entire Stories wrapper takes no space');
    const tabsTop = await evaluate(`document.querySelector('#following-tabs').getBoundingClientRect().top`);
    assert.equal(await evaluate(`document.querySelectorAll('#following-tabs [role="tab"]').length`), 5);
    assert.equal(await evaluate(`document.querySelector('#recommended article a').getAttribute('href')`), '/example');
    await evaluate(`document.querySelector('#recommended article a').textContent='Updated title';__storagePatch({topNavigation:false})`);
    assert.deepEqual(await evaluate('__followingClicks'), ['recommended', 'latest'], 'unrelated mutations/settings never duplicate pending clicks');
    await evaluate(`__finishFollowing('recommended')`);
    await waitFor('__followingClicks.length === 3');
    await evaluate(`__finishFollowing('recommended');__finishFollowing('latest')`);
    await waitFor('__followingClicks.length === 4');
    await evaluate(`__finishFollowing('latest')`);
    assert.deepEqual(await evaluate('__followingClicks'), ['recommended', 'latest', 'recommended', 'latest']);
    assert.equal(await evaluate('__followingLessClicks + __followingOtherClicks'), 0, 'Show less, Show all, categories and outside buttons are untouched');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#recommended, #latest')].map(shelf=>shelf.querySelectorAll('article').length)`), [3, 3]);
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('following-stories'), true, 'pause restores the entire Stories wrapper');
    assert.ok(await evaluate(`document.querySelector('#following-tabs').getBoundingClientRect().top`) >= tabsTop + 120, 'pause restores the native Stories space above the tabs');
    await evaluate(`document.querySelector('#recommended-more').click()`);
    assert.equal(await evaluate('__followingLessClicks'), 1, 'native Show less still works');
    await evaluate(`__storagePatch({enabled:true})`);
    await waitFor('__followingClicks.length === 5');
    assert.equal(await isVisible('following-stories'), false);
  });

  await t.test('Following Stories switch restores Stories independently of native shelf expansion', async () => {
    await navigate('tests/fixtures/following.html', '__stored.followingStories=false;');
    assert.equal(await isVisible('following-stories'), true, 'saved opt-out restores Stories');
    await waitFor('__followingClicks.length === 2');
    await evaluate(`window.storyClicks=0;document.querySelector('#story-button').addEventListener('click',()=>storyClicks++);__storagePatch({followingStories:true,browseRecaps:false})`);
    assert.equal(await isVisible('following-stories'), false, 'Stories hiding is independent of the Recaps switch');
    await evaluate(`__storagePatch({followingStories:false});document.querySelector('#story-button').click();__finishFollowing('recommended')`);
    assert.equal(await evaluate('storyClicks'), 1, 'native Stories handlers survive restoration');
    await waitFor('__followingClicks.length === 3');
    await evaluate(`__storagePatch({enabled:false});__storagePatch({enabled:true})`);
    assert.equal(await isVisible('following-stories'), true, 'master resume preserves the opt-out');
    await evaluate(`history.pushState({},'', '?stories-navigation');const page=document.querySelector('#following-shell');page.replaceWith(page.cloneNode(true))`);
    assert.equal(await isVisible('following-stories'), true, 'replacement page follows the saved opt-out');
    await evaluate(`__storagePatch({followingStories:true})`);
    assert.equal(await isVisible('following-stories'), false);
  });

  await t.test('Following honors saved pause, disabled/busy controls, visibility and replaced pending buttons', async () => {
    await navigate('tests/fixtures/following.html', '__stored.enabled=false;');
    assert.equal(await isVisible('following-stories'), true);
    assert.equal(await evaluate('__followingClicks.length'), 0);
    await evaluate(`document.querySelector('#recommended-more').disabled=true;document.querySelector('#latest-more').setAttribute('aria-busy','true');document.querySelector('#latest-heading').setAttribute('aria-label','Localized heading');document.querySelector('#latest-heading h3').textContent='Localized heading';__storagePatch({enabled:true})`);
    assert.equal(await evaluate('__followingClicks.length'), 0);
    await evaluate(`document.querySelector('#recommended-more').disabled=false`);
    await waitFor('__followingClicks.length === 1');
    await evaluate(`const button=document.querySelector('#recommended-more');button.replaceWith(button.cloneNode(true));document.querySelector('#recommended article a').textContent='Another title'`);
    assert.equal(await evaluate('__followingClicks.length'), 1, 'replacing a pending button does not request the same page twice');
    await evaluate(`document.querySelector('#latest').hidden=true;document.querySelector('#latest-more').setAttribute('aria-busy','false')`);
    assert.equal(await evaluate('__followingClicks.length'), 1);
    await evaluate(`document.querySelector('#latest').hidden=false;document.querySelector('#latest-more').setAttribute('aria-disabled','true')`);
    assert.equal(await evaluate('__followingClicks.length'), 1);
    await evaluate(`document.querySelector('#latest-more').setAttribute('aria-disabled','false')`);
    await waitFor('__followingClicks.length === 2');
    await evaluate(`__finishFollowing('recommended')`);
    await waitFor('__followingClicks.length === 3');
    await evaluate(`__storagePatch({enabled:false});__finishFollowing('recommended');__finishFollowing('latest')`);
    assert.equal(await evaluate('__followingClicks.length'), 3, 'pause during loading stops further expansion');
    assert.equal(await isVisible('latest-more'), true, 'native controls remain available');
  });

  await t.test('Following discovers later mounts and navigation replacements and releases detached observers', async () => {
    await navigate('tests/fixtures/following.html', `window.__deferFollowing=true;window.activeObservers=new Set();window.MutationObserver=class extends MutationObserver{observe(...args){super.observe(...args);activeObservers.add(this)}disconnect(){super.disconnect();activeObservers.delete(this)}}`);
    assert.equal(await evaluate('activeObservers.size'), 1, 'only shared discovery runs before the page mounts');
    await evaluate(`__mountFollowingPage()`);
    await waitFor('__followingClicks.length === 2');
    assert.equal(await evaluate('activeObservers.size'), 2);
    await evaluate(`history.pushState({},'', '?navigate-away');window.oldPage=document.querySelector('#following-shell');oldPage.remove()`);
    await waitFor('activeObservers.size === 1');
    await evaluate(`__finishFollowing('recommended');__finishFollowing('latest')`);
    assert.equal(await evaluate('__followingClicks.length'), 2, 'detached regions never request more cards');
    await evaluate(`history.pushState({},'', '?following-again');__mountFollowingPage()`);
    await waitFor('__followingClicks.length === 4');
    assert.equal(await isVisible('following-stories'), false);
    await evaluate(`__mountFollowingShelf('later', 'Recommended channels')`);
    await waitFor('__followingClicks.length === 5');
    await evaluate(`__storagePatch({enabled:false})`);
    await waitFor('activeObservers.size === 0');
    await evaluate(`document.querySelector('#following-shell').remove();__mountFollowingPage()`);
    assert.equal(await evaluate('__followingClicks.length'), 5, 'paused mounts stay native');
    await evaluate(`__storagePatch({enabled:true})`);
    await waitFor('__followingClicks.length === 7');
  });

};
