const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, isVisible }) => {
  const retained = ['messages', 'message-progress', 'community-wrapper', 'community-highlight', 'plain-progress', 'composer-wrapper', 'composer-progress', 'chat-settings', 'outside-carousel'];
  const assertHidden = async id => {
    assert.equal(await isVisible(id), false, `${id} hides without rotating to a ranking slide`);
    assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().height`), 0, 'carousel height is reclaimed');
    for (const kept of retained) assert.equal(await isVisible(kept), true, `${kept} stays visible`);
  };

  await t.test('goal-first carousel hides on refresh and restores with its native controls', async () => {
    await navigate('tests/fixtures/chat-carousel.html');
    await assertHidden('carousel');
    assert.equal(await evaluate('nativeSlideClicks'), 0, 'hiding never clicks native arrows');
    await evaluate(`__storagePatch({chatLeaderboard:false})`);
    for (const id of ['carousel', 'previous', 'next']) assert.equal(await isVisible(id), true, `${id} restores with the group off`);
    assert.equal(await evaluate(`document.querySelector('#carousel').getBoundingClientRect().height`), 80);
    await evaluate(`document.querySelector('#next').click()`);
    assert.equal(await evaluate('nativeSlideClicks'), 1, 'native handlers are retained');
    await evaluate(`__storagePatch({chatLeaderboard:true})`);
    await assertHidden('carousel');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('carousel'), true, 'master pause restores the goal');
    await evaluate(`__storagePatch({enabled:true})`);
    await assertHidden('carousel');

    // A fresh page load must hide the goal even when rankings never mount.
    await navigate('tests/fixtures/chat-carousel.html');
    await assertHidden('carousel');
    await navigate('tests/fixtures/chat-carousel.html', '__stored.chatLeaderboard=false;');
    assert.equal(await isVisible('carousel'), true, 'saved group preference is respected at startup');
    await navigate('tests/fixtures/chat-carousel.html', '__stored.enabled=false;');
    assert.equal(await isVisible('carousel'), true, 'saved pause is respected at startup');
  });

  await t.test('goal carousel covers later content, rotations, and navigation without hiding chat', async () => {
    await navigate('tests/fixtures/chat-carousel.html');
    await evaluate(`globalThis.goalSlide = document.querySelector('#carousel').innerHTML;
      document.querySelector('#carousel').replaceChildren();`);
    assert.equal(await isVisible('carousel'), true, 'an unidentified empty mount is left alone');
    await evaluate(`document.querySelector('#carousel').innerHTML = goalSlide`);
    await assertHidden('carousel');
    await evaluate(`document.querySelector('#carousel').innerHTML = '<button aria-label="Expand Top Gifters Leaderboard">Top gifters</button>'`);
    await assertHidden('carousel');
    await evaluate(`document.querySelector('#carousel').innerHTML = goalSlide`);
    await assertHidden('carousel');

    // Chat may be the direct child or arrive inside a native layout wrapper.
    await evaluate(`const messages = document.querySelector('#messages');
      messages.removeAttribute('data-a-target'); messages.className = 'chat-scrollable-area__message-container';`);
    await assertHidden('carousel');
    await evaluate(`document.querySelector('#messages').outerHTML = '<div><div id="messages" class="video-chat__message-list-wrapper"><div class="tw-transition-group"><div id="message-progress" role="progressbar">Replay message content</div></div></div></div>';
      document.querySelector('#community-wrapper').className = 'sticky-community-highlight';
      document.querySelector('#composer-wrapper').className = 'chat-input';`);
    await assertHidden('carousel');

    // Native progress bars can expose their class or semantic role separately.
    await evaluate(`document.querySelector('#carousel [role="progressbar"]').removeAttribute('class')`);
    await assertHidden('carousel');
    await evaluate(`document.querySelector('#carousel').innerHTML = goalSlide;
      document.querySelector('#carousel [role="progressbar"]').removeAttribute('role')`);
    await assertHidden('carousel');

    await evaluate(`history.pushState({}, '', '?another-channel');
      document.querySelector('#carousel').remove();
      const mount = document.createElement('div'); mount.id = 'later-carousel'; mount.className = 'carousel';
      mount.innerHTML = goalSlide; document.querySelector('.chat-room__content').prepend(mount);`);
    await assertHidden('later-carousel');
    await evaluate(`__storagePatch({chatLeaderboard:false})`);
    assert.equal(await isVisible('later-carousel'), true, 'later mount restores too');
    await evaluate(`__storagePatch({chatLeaderboard:true})`);
    await assertHidden('later-carousel');
  });
};
