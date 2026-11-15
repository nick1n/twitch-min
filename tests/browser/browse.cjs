const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor }) => {
  await t.test('Browse hides the entire Recent Recaps shelf and restores its native controls on pause', async () => {
    await navigate('tests/fixtures/browse.html');
    assert.equal(await isVisible('recaps'), false);
    assert.equal(await evaluate(`document.querySelector('#recaps').getBoundingClientRect().height`), 0, 'no carousel height or wrapper spacing remains');
    for (const id of ['browse-title', 'browse-header', 'browse-filter', 'other-carousel', 'live-directory', 'text-only', 'outside-recaps']) {
      assert.equal(await isVisible(id), true, `${id} stays visible`);
    }
    await evaluate(`__storagePatch({topNavigation:false,channelAbout:false})`);
    assert.equal(await isVisible('recaps'), false, 'recap hiding follows master Enabled');
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('recaps'), true);
    assert.equal(await evaluate(`document.querySelector('[data-tq-recent-recaps]')`), null);
    assert.ok(await evaluate(`document.querySelector('#recaps').getBoundingClientRect().height`) >= 343, 'native wrapper padding and carousel height restore');
    await evaluate(`document.querySelector('#recap-next').click()`);
    assert.equal(await evaluate('__recapClicks'), 1, 'native handlers remain attached');
    await evaluate(`__storagePatch({enabled:true})`);
    assert.equal(await isVisible('recaps'), false);
    assert.equal(await evaluate(`document.querySelector('#live-channel').getAttribute('href')`), '/example');
  });

  await t.test('Browse handles late shelves, reused headings, navigation and detached-region cleanup', async () => {
    await navigate('tests/fixtures/browse.html', '__stored.enabled=false;');
    assert.equal(await isVisible('recaps'), true, 'saved pause stays native');
    await evaluate(`window.page=document.querySelector('#directory-game-main-content');window.shelf=document.querySelector('#recaps');shelf.remove();__storagePatch({enabled:true})`);
    await evaluate(`document.querySelector('#browse-root-filter-sort-options').after(shelf)`);
    await waitFor(`shelf.hasAttribute('data-tq-recent-recaps')`);
    await evaluate(`document.querySelector('#recap-heading').firstChild.data='Featured clips'`);
    assert.equal(await isVisible('recaps'), true, 'a shelf reused for other content restores');
    await evaluate(`document.querySelector('#recap-heading').textContent='  Recent   Recaps  '`);
    assert.equal(await isVisible('recaps'), false);
    await evaluate(`history.pushState({},'', '?another-category');window.replacement=page.cloneNode(true);page.replaceWith(replacement)`);
    await waitFor(`!shelf.hasAttribute('data-tq-recent-recaps')`);
    assert.equal(await isVisible('recaps'), false, 'replacement Browse region is discovered');
    await evaluate(`document.querySelector('#recaps').classList.remove('recap-shelf');__storagePatch({enabled:false})`);
    assert.equal(await evaluate(`document.querySelector('[data-tq-recent-recaps]')`), null);
    assert.equal(await isVisible('recaps'), true);
  });

  await t.test('Browse Recaps switch restores native content and disconnects recap discovery until enabled', async () => {
    await navigate('tests/fixtures/browse.html', `__stored.browseRecaps=false;window.browseObservers=new Set();window.MutationObserver=class extends MutationObserver{observe(target,...args){super.observe(target,...args);if(target.matches?.('#directory-game-main-content'))browseObservers.add(this)}disconnect(){super.disconnect();browseObservers.delete(this)}}`);
    assert.equal(await isVisible('recaps'), true, 'saved opt-out keeps native recaps');
    assert.equal(await evaluate('browseObservers.size'), 0);
    await evaluate(`__storagePatch({browseRecaps:true,followingStories:false})`);
    assert.equal(await isVisible('recaps'), false, 'Recaps hiding is independent of the Stories switch');
    assert.equal(await evaluate('browseObservers.size'), 1);
    await evaluate(`__storagePatch({browseRecaps:false})`);
    assert.equal(await isVisible('recaps'), true);
    assert.equal(await evaluate(`document.querySelector('[data-tq-recent-recaps]')`), null, 'opt-out releases markers');
    assert.equal(await evaluate('browseObservers.size'), 0, 'opt-out disconnects the region observer');
    await evaluate(`history.pushState({},'', '?recaps-navigation');const page=document.querySelector('#directory-game-main-content');page.replaceWith(page.cloneNode(true));__storagePatch({enabled:false});__storagePatch({enabled:true})`);
    assert.equal(await isVisible('recaps'), true, 'master resume and navigation keep the opt-out');
    assert.equal(await evaluate('browseObservers.size'), 0);
    await evaluate(`__storagePatch({browseRecaps:true})`);
    assert.equal(await isVisible('recaps'), false, 'reenabling discovers the replacement region');
    assert.equal(await evaluate('browseObservers.size'), 1);
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await evaluate('browseObservers.size'), 0);
  });

  await t.test('ordinary chat updates do not rescan Browse headings', async () => {
    await navigate('tests/fixtures/browse.html');
    await evaluate(`window.browseScans=0;const page=document.querySelector('#directory-game-main-content');const query=page.querySelectorAll;page.querySelectorAll=function(selector){if(selector==='h2')browseScans++;return query.call(this,selector)};document.querySelector('#browse-test-messages').insertAdjacentHTML('beforeend','<div class="chat-line__message">A message</div>')`);
    assert.equal(await evaluate('browseScans'), 0);
  });

  const snapshotFile = path.join(root, '.browser-tests/browse.html');
  await t.test('supplied Browse HTML hides Recent Recaps while keeping filters and live channels', { skip: !fs.existsSync(snapshotFile) }, async () => {
    await navigate('tests/fixtures/browse.html');
    const source = fs.readFileSync(snapshotFile, 'utf8');
    await evaluate(`(()=>{
      const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
      const page=snapshot.querySelector('#directory-game-main-content').cloneNode(true);
      page.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
      for(const node of [page,...page.querySelectorAll('*')])for(const attribute of [...node.attributes]) {
        if(/^on/i.test(attribute.name)||/^data-tq-/.test(attribute.name)||['style','src','srcset','poster'].includes(attribute.name))node.removeAttribute(attribute.name);
      }
      const heading=[...page.querySelectorAll('h2')].find(node=>node.textContent.replace(/\\s+/g,' ').trim()==='Recent Recaps');
      const shelf=heading.parentElement.parentElement;shelf.id='snapshot-recaps';
      shelf.nextElementSibling.id='snapshot-live-directory';
      document.querySelector('#directory-game-main-content').replaceWith(page);
    })()`);
    await waitFor(`document.querySelector('#snapshot-recaps').hasAttribute('data-tq-recent-recaps')`);
    assert.equal(await isVisible('snapshot-recaps'), false);
    for (const id of ['directory-game-main-content', 'browse-root-filter-sort-options', 'snapshot-live-directory']) assert.equal(await isVisible(id), true, `${id} stays visible`);
    await evaluate(`__storagePatch({enabled:false})`);
    assert.equal(await isVisible('snapshot-recaps'), true);
  });
};
