const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate }) => {
  const geometry = () => evaluate(`(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom }; };
    const list = document.querySelector('#reward-dialog .rewards-list');
    return {
      rows: Object.fromEntries([...list.children].filter(node => node.id).map(node => [node.id, rect(node)])),
      overflow: [...list.querySelectorAll('*')].some(node => node.scrollWidth > node.clientWidth + 1),
      listOverflow: list.scrollWidth > list.clientWidth,
      scrolls: document.querySelector('.scrollable-area').scrollHeight > document.querySelector('.scrollable-area').clientHeight
    };
  })()`);

  const checkColumns = async label => {
    const { rows, overflow, listOverflow, scrolls } = await geometry();
    for (const prefix of ['power-up', 'reward']) {
      const cards = [1, 2, 3].map(n => rows[`${prefix}-${n}`]);
      assert.ok(cards.every(card => Math.abs(card.y - cards[0].y) < 0.1), `${label}: ${prefix} has three cards on one row`);
      for (let i = 1; i < cards.length; i++) {
        assert.ok(cards[i].x > cards[i - 1].right, `${label}: columns do not overlap`);
        assert.ok(Math.abs(cards[i].width - cards[0].width) < 0.1, `${label}: columns share the available width equally`);
      }
    }
    for (const id of ['power-ups-heading', 'rewards-heading', 'watch-streak']) {
      assert.ok(Math.abs(rows[id].x - rows['power-up-1'].x) < 0.1, `${label}: ${id} starts at the first column`);
      assert.ok(Math.abs(rows[id].right - rows['power-up-3'].right) < 0.1, `${label}: ${id} spans all three columns`);
    }
    assert.ok(rows['rewards-heading'].y >= rows['power-up-3'].bottom, `${label}: section heading follows power-ups`);
    assert.ok(rows['reward-1'].y >= rows['watch-streak'].bottom, `${label}: streak keeps its separate row`);
    assert.ok(rows['reward-4'].y >= rows['reward-1'].bottom, `${label}: fourth reward wraps to the next row`);
    assert.equal(overflow || listOverflow, false, `${label}: labels, costs, and buttons fit without horizontal clipping`);
    assert.equal(scrolls, true, `${label}: vertical scrolling stays available`);
  };

  await t.test('reward cards keep three columns at fractional widths and zoom, and restore on pause', async () => {
    await navigate('tests/fixtures/rewards.html');
    // CSS zoom exercises fractional CSS/device-pixel sizing offline; this is
    // fixture coverage, not signed-in Twitch or browser-toolbar zoom validation.
    for (const zoom of [1, 0.9, 0.8, 1.1, 1.25]) {
      for (const width of [300, 320, 324.5, 340]) {
        await evaluate(`document.documentElement.style.zoom = ${zoom}; document.querySelector('#reward-dialog').style.width = '${width}px'`);
        await checkColumns(`zoom ${zoom}, width ${width}`);
      }
    }
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#outside-rewards')).display`), 'flex', 'other lists stay native');
    await evaluate(`document.documentElement.style.zoom = '0.9'; document.querySelector('#reward-dialog').style.width = '320px';
      window.rewardClicks = 0; window.rewardButton = document.querySelector('#power-up-3 button');
      rewardButton.addEventListener('click', () => rewardClicks++); rewardButton.focus(); rewardButton.click()`);
    assert.equal(await evaluate(`document.activeElement === rewardButton && rewardClicks === 1`), true, 'native reward focus and click handler remain');
    assert.deepEqual(await evaluate(`[rewardButton.querySelector('.power-up-title').textContent, rewardButton.querySelector('.power-up-cost').textContent]`), ['On-Screen Celebration', '100'], 'native name and price remain');
    await evaluate(`__storagePatch({enabled:false})`);
    const { rows } = await geometry();
    assert.ok(rows['power-up-3'].y > rows['power-up-1'].y, 'pause restores the reproduced native two-column layout');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#reward-dialog .rewards-list')).display`), 'flex');
    await evaluate(`__storagePatch({enabled:true})`);
    await checkColumns('resumed');
    await evaluate(`const panel = document.querySelector('#reward-dialog'); panel.remove();
      history.pushState({}, '', '?another-channel'); document.body.prepend(panel.cloneNode(true));`);
    await checkColumns('later reward popover after navigation');
  });
};
