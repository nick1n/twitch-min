const assert = require('node:assert/strict');

module.exports = async (t, { navigate, evaluate, waitFor, isVisible }) => {
  await t.test('Hide and report captures a reviewable draft and restores native elements', async () => {
    await navigate('tests/fixtures/twitch.html');
    await evaluate(`(() => {
      const attachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        const shadow = attachShadow.call(this, options);
        if (this.hasAttribute('data-tq-report-picker')) window.picker = shadow;
        return shadow;
      };
      const container = document.createElement('aside');
      container.dataset.aTarget = 'side-nav-bar';
      container.innerHTML = '<section id="luna" data-a-target="luna-shelf" style="display: grid; color: red"><button id="luna-heading">Play on Luna</button><a href="/private-channel"><img alt="Private name"></a><input value="secret draft"></section><section id="recommendations">Recommended</section>';
      document.body.prepend(container);
      window.nativeClicks = 0;
      document.getElementById('luna-heading').onclick = () => nativeClicks++;
    })()`);
    const start = () => evaluate('TwitchMinReport.start()');
    const select = () => evaluate("document.getElementById('luna-heading').click()");
    const control = selector => evaluate(`picker.querySelector(${JSON.stringify(selector)}).click()`);
    assert.equal(await start(), true);
    await evaluate("document.getElementById('luna-heading').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))");
    assert.equal(await evaluate("picker.querySelector('.outline').hidden"), false);
    await select();
    assert.equal(await isVisible('luna-heading'), false);
    assert.equal(await evaluate('nativeClicks'), 0);
    assert.match(await evaluate("picker.querySelector('textarea').value"),
      /<section data-a-target="luna-shelf">\n<!-- Selected element -->\n<button>/);
    await control('.parent');
    assert.equal(await isVisible('luna'), false);
    assert.equal(await isVisible('recommendations'), true);

    const report = await evaluate(`({
      draft: picker.querySelector('textarea').value,
      url: picker.querySelector('a').href
    })`);
    const url = new URL(report.url);
    assert.equal(url.origin + url.pathname, 'https://github.com/nick1n/twitch-min/issues/new');
    assert.equal(url.searchParams.get('body'), report.draft);
    assert.match(report.draft, /Twitch section: Sidebar/);
    assert.match(report.draft, /Please attach a screenshot/);
    assert.match(report.draft, /<aside data-a-target="side-nav-bar">\n<!-- Selected element -->\n<section data-a-target="luna-shelf">[\s\S]*<img>/);
    assert.doesNotMatch(report.draft, /private-channel|Private name|secret draft|Recommended|id=|style=/);
    await control('.undo');
    assert.equal(await isVisible('luna'), true);
    assert.equal(await evaluate("document.getElementById('luna').style.display"), 'grid');
    await select();
    assert.equal(await evaluate('nativeClicks'), 1);

    await start();
    await select();
    await evaluate('__storagePatch({ enabled: false })');
    assert.equal(await isVisible('luna-heading'), true);
    assert.equal(await evaluate("document.querySelector('[data-tq-report-picker]')"), null);
    await evaluate('__storagePatch({ enabled: true })');
    await start();
    await select();
    await evaluate("window.detached = document.getElementById('luna'); detached.remove()");
    await waitFor("!document.querySelector('[data-tq-report-picker]')");
    assert.equal(await evaluate("detached.firstElementChild.getAttribute('style')"), null);

    for (const [containerSelector, section] of [
      ['.top-nav', 'Top nav'],
      ['.chat-room', 'Chat bar'],
      ['#player', 'Main content (video player)'],
      ['body', 'Global']
    ]) {
      await start();
      await evaluate(`{
        const target = document.createElement('span');
        document.querySelector(${JSON.stringify(containerSelector)}).append(target);
        target.click();
        window.reportTarget = target;
      }`);
      const draft = await evaluate("picker.querySelector('textarea').value");
      assert.ok(draft.includes('Twitch section: ' + section));
      if (containerSelector === 'body') assert.match(draft, /<body[^>]*>\n<!-- Selected element -->\n<span>/);
      await control('.undo');
      await evaluate('reportTarget.remove()');
    }
  });
};
