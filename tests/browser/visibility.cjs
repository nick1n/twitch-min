const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor }) => {
  await t.test('default screenshot preset hides targets and preserves intended UI', async () => {
    await navigate('tests/fixtures/twitch.html');
    await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
    for (const id of ['top-bits','top-turbo','top-turbo-gift','top-turbo-test','top-turbo-text','luna-offers','shouts','sidebar-for-you','sidebar-arrow','sidebar-streak','sidebar-channel-name','sidebar-hype','stray-avatar-text','stray-nested-text','offline-transition','offline-channel','other-section','show-more','channel-bell','channel-bits','channel-gift','video-share','video-share-label','vod-channel-card','vod-recommendations','about','panels','chat-header','leaderboard','composer','chat-send','player-clip','player-clip-subscribe','player-speed-display','player-follow','player-gift','player-subscribe']) {
      assert.equal(await isVisible(id), false, `${id} should be hidden`);
    }
    for (const id of ['sidebar-heading','live-heading','similar-heading','top-bell','top-bell-wrapper','actual-notifications','top-notifications-label','replay-time','replay-time-link','actual-replay-time','browse','whispers','search','account','avatar','second-avatar','viewer-count','sidebar-game','player','video-title','video-category','video-menu','follow','channel-subscribe','messages','replay-body','replay-body-link','actual-replay-message','points','chat-settings','outside-gift','outside-share','outside-metadata','outside-clip','player-play','player-mute','player-settings','player-theatre','player-fullscreen','player-settings-speed','player-speed','player-speed-decrease','player-speed-increase']) {
      assert.equal(await isVisible(id), true, `${id} must stay visible`);
    }
    assert.equal(await evaluate(`document.querySelector('[data-a-target="chat-input"]').getClientRects().length`), 0, 'hidden editor cannot receive focus');
    const geometry = () => evaluate(`(()=>{
      const rect = id => { const r=document.getElementById(id).getBoundingClientRect(); return {x:r.x,width:r.width,height:r.height,y:r.y}; };
      return Object.fromEntries(['sidebar-shell','sidebar-overlay','sidebar-nav','channel-row','second-channel-row','avatar','viewer-count','sidebar-game','main','after-about'].map(id=>[id,rect(id)]));
    })()`);
    const before = await geometry();
    for (const id of ['sidebar-shell','sidebar-overlay','sidebar-nav','channel-row','second-channel-row']) {
      assert.equal(before[id].width, 144, `${id} uses the narrower compact sidebar width`);
    }
    assert.equal(before['sidebar-shell'].height, 650, 'native sidebar retains its full height');
    assert.equal(before['sidebar-overlay'].height, 650, 'overlay is not squeezed into a 50px vertical flex basis');
    assert.equal(await evaluate(`__nativeSidebarClicks`), 0, 'expanded native metadata stays mounted');
    assert.equal(before.main.x, 144, 'main starts immediately after the compact sidebar');
    assert.ok(before.avatar.x + before.avatar.width <= before['viewer-count'].x, 'count stays beside the avatar');
    assert.equal(before['viewer-count'].x, before['sidebar-game'].x, 'game aligns with the count');
    assert.ok(before['sidebar-game'].y >= before['viewer-count'].y + before['viewer-count'].height, 'game is below the viewer count');
    assert.ok(before['sidebar-game'].x + before['sidebar-game'].width <= before['channel-row'].x + before['channel-row'].width, 'game stays inside the row');
    await evaluate(`__storagePatch({enabled:false})`);
    await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
    for (const id of ['top-bell','top-turbo-text','actual-notifications','sidebar-heading','sidebar-metadata','viewer-count','channel-bits','video-share','vod-channel-card','vod-recommendations','about','panels','replay-time','actual-replay-time','chat-header','leaderboard','composer','player-clip','player-clip-subscribe','player-speed-display','player-follow','player-gift','player-subscribe']) assert.equal(await isVisible(id), true, `${id} restores`);
    const after = await geometry();
    assert.equal(after['sidebar-shell'].width, 240, 'restores the original sidebar width');
    assert.equal(after.main.x, 240);
    assert.equal(before.main.width - after.main.width, 96, 'video gains all reclaimed sidebar space');
    assert.ok(before['channel-row'].height >= 36 && before['channel-row'].height < 48, 'two-line rows have tighter spacing');
    assert.ok(after['after-about'].y - before['after-about'].y >= 340, 'About and panels collapse their entire layout space');
  });

  await t.test('each group toggles independently and CSS covers later insertions', async () => {
    await navigate('tests/fixtures/twitch.html');
    await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
    await evaluate(`__storagePatch({...TwitchMinSettings.DEFAULTS,chatComposer:false})`);
    assert.equal(await isVisible('composer'), true);
    assert.equal(await isVisible('leaderboard'), false);
    await evaluate(`__storagePatch({chatLeaderboard:false})`);
    assert.equal(await isVisible('leaderboard'), true);
    await evaluate(`__storagePatch({chatComposer:true,chatLeaderboard:true})`);
    await evaluate(`document.querySelector('.metadata-layout__support').insertAdjacentHTML('beforeend', '<button id="late-gift" data-a-target="gift-button">Gift</button>'); history.pushState({}, '', '?another-channel');`);
    assert.equal(await isVisible('late-gift'), false);
    await evaluate(`__storagePatch({channelActions:false})`);
    assert.equal(await isVisible('late-gift'), true);
    assert.equal(await isVisible('composer'), false);
    await evaluate(`__storagePatch({channelAbout:false,chatTimestamps:false,sidebarLabels:false})`);
    await waitFor(`document.querySelector('#sidebar-shell').classList.contains('side-nav--expanded')`);
    for (const id of ['about','panels','replay-time','sidebar-metadata','viewer-count']) assert.equal(await isVisible(id), true, `${id} restores independently`);
    assert.equal(await isVisible('sidebar-heading'), true, 'short section headings remain visible independently');
    assert.equal(await evaluate(`document.querySelector('#sidebar-shell').getBoundingClientRect().width`), 240);
    await evaluate(`__storagePatch({channelAbout:true,chatTimestamps:true,sidebarLabels:true}); document.querySelector('#vod-info').insertAdjacentHTML('beforeend', '<section id="late-about" data-a-target="channel-about-panel">About another channel</section>');`);
    assert.equal(await isVisible('late-about'), false, 'About rule covers later SPA inserts');
    await evaluate(`__storagePatch({enabled:false}, 'sync')`);
    assert.equal(await isVisible('composer'), false, 'sync-area changes ignored');
    await evaluate(`document.querySelector('#viewer-count').textContent='18.2K'; document.querySelector('#sidebar-game p').textContent='Warhammer Survivors'; document.querySelector('#sidebar-game p').title='Warhammer Survivors'`);
    assert.equal(await isVisible('viewer-count'), true, 'live count updates stay visible');
    assert.equal(await evaluate(`document.querySelector('#sidebar-game p').textContent`), 'Warhammer Survivors', 'native game updates appear without copying/caching metadata');
  });

  await t.test('saved disabled state and read failure leave Twitch usable', async () => {
    await navigate('tests/fixtures/twitch.html', '__stored.enabled = false;');
    assert.equal(await isVisible('composer'), true);
    await evaluate(`document.querySelector('#chat-emote').click()`);
    assert.equal(await isVisible('twitch-min-emote-preview'), false);
    await navigate('tests/fixtures/twitch.html', '__readError = true;');
    assert.equal(await isVisible('composer'), true);
    await evaluate(`document.querySelector('#chat-emote').click()`);
    assert.equal(await isVisible('twitch-min-emote-preview'), false, 'unknown preferences leave native emotes alone');
    assert.equal(await evaluate(`document.documentElement.hasAttribute('data-tq-enabled')`), false);
  });

  await t.test('a later settings change recovers a failed initial read and restores normal pause behavior', async () => {
    await navigate('tests/fixtures/twitch.html', '__readError=true;');
    assert.equal(await isVisible('composer'), true);
    assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]')`), null);
    await evaluate(`__readError=false;__storagePatch({enabled:true})`);
    await waitFor(`document.querySelector('[data-tq-chat-toggle]') !== null`);
    assert.equal(await isVisible('composer'), false, 'recovery activates the saved settings');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('composer'), true, 'pause restores the native composer');
    assert.equal(await evaluate(`document.querySelector('[data-tq-chat-toggle]')`), null);
    await evaluate(`history.pushState({},'', '?after-recovery');__storagePatch({enabled:true})`);
    await waitFor(`document.querySelector('[data-tq-chat-toggle]') !== null`);
    assert.equal(await isVisible('composer'), false, 'features resume after same-document navigation');
  });
};
