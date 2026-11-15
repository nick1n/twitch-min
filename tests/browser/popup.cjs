const assert = require('node:assert/strict');
const { manifest } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, waitFor, send }) => {
  await t.test('popup saves changed keys, pauses, enables all, and handles external changes', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    assert.equal(await evaluate(`document.querySelectorAll('#groups input').length === TwitchMinSettings.GROUPS.length`), true);
    assert.equal(await evaluate(`document.querySelector('#pause-button')`), null, 'one master control handles pause and resume');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').textContent.trim()`), 'Enable all settings');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').disabled`), true, 'enabling everything is unavailable when already active');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), true, 'an unavailable action is not shown');
    const headerLayout = () => evaluate(`['header','.brand','.controls','#master-toggle','#enable-all-button','#groups','#scroll-cue'].map(selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {x:rect.x+scrollX,y:rect.y+scrollY,width:rect.width,height:rect.height}})`);
    const initialLayout = await headerLayout();
    await evaluate(`window.originalControls=[...document.querySelectorAll('#groups input')]`);
    assert.equal(await evaluate(`document.querySelector('#groups p')`), null, 'loading text is removed');
    assert.equal(await evaluate(`document.body.scrollWidth <= document.body.clientWidth`), true, 'no horizontal overflow');
    await evaluate(`document.querySelector('#group-chatComposer').focus(); document.querySelector('#group-chatComposer').click()`);
    assert.deepEqual(await evaluate(`__writes.at(-1)`), { chatComposer: false });
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false);
    assert.equal(await evaluate(`document.activeElement.id`), 'group-chatComposer', 'keyboard focus survives saving');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), false, 'the action appears when a setting is off');
    assert.deepEqual(await headerLayout(), initialLayout, 'showing Enable all settings does not move or resize the popup controls');
    await evaluate(`document.querySelector('#master-toggle').click()`);
    assert.deepEqual(await evaluate(`__writes.at(-1)`), { enabled: false });
    assert.equal(await evaluate(`document.querySelector('#master-toggle').checked`), false);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false, 'pausing keeps individual choices');
    await evaluate(`document.querySelector('#master-toggle').click()`);
    assert.deepEqual(await evaluate(`__writes.at(-1)`), { enabled: true });
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false, 'resuming keeps individual choices');
    await evaluate(`document.querySelector('#enable-all-button').click()`);
    assert.equal(await evaluate(`Object.values(__writes.at(-1)).every(value=>value===true) && Object.keys(__writes.at(-1)).length===Object.keys(TwitchMinSettings.DEFAULTS).length`), true);
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), true, 'enabling all hides the action again');
    assert.deepEqual(await headerLayout(), initialLayout, 'hiding Enable all settings preserves its footprint');
    await evaluate(`__storagePatch({sidebarLabels:false})`);
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), false);
    await evaluate(`__storagePatch({sidebarLabels:undefined})`);
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), true);
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), true, 'external changes update action availability');
    assert.equal(await evaluate(`originalControls.every(input=>input === document.getElementById(input.id))`), true, 'saves, bulk actions and external changes retain the original controls');
  });

  await t.test('branded popup keeps descriptions, scrolls settings, and supports keyboard and label activation', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    try {
      await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 600, deviceScaleFactor: 1, mobile: false });
      for (const theme of ['light', 'dark']) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        const layout = await evaluate(`(()=>{
          const body=document.body, button=document.querySelector('#enable-all-button'),list=document.querySelector('#groups');
          return {width:body.getBoundingClientRect().width, fits:body.scrollWidth<=body.clientWidth,
            height:body.getBoundingClientRect().height, bottom:button.getBoundingClientRect().bottom, copy:TwitchMinSettings.GROUPS.every(group=>body.innerText.includes(group.description)),
            scrolls:list.scrollHeight>list.clientHeight, logo:document.querySelector('.brand img').naturalWidth>0,
            wraps:[...document.querySelectorAll('.setting-description')].some(description=>description.getBoundingClientRect().height>parseFloat(getComputedStyle(description).lineHeight)*1.5),
            fullHelp:[...document.querySelectorAll('.setting-description')].every(description=>description.scrollWidth<=description.clientWidth+1 && description.scrollHeight<=description.clientHeight+1),
            labels:[...document.querySelectorAll('#groups label')].every(label=>label.getBoundingClientRect().height>=24)};
        })()`);
        assert.equal(layout.width, 360);
        assert.equal(layout.fits, true, `${theme}: no horizontal scrolling`);
        assert.ok(layout.height <= 600, `${theme}: the popup fits Chrome's height limit`);
        assert.ok(layout.bottom <= 600, `${theme}: the master and enable-all controls stay visible`);
        assert.equal(layout.copy, true, 'every setting has a visible blurb');
        assert.equal(layout.wraps, true, 'long help blurbs wrap onto multiple lines');
        assert.equal(layout.fullHelp, true, 'help text is not clipped or ellipsized');
        assert.equal(layout.scrolls, true, 'the settings list scrolls within the popup');
        assert.equal(layout.logo, true, 'the brand logo loads');
        assert.equal(layout.labels, true, 'the whole setting label remains a usable click target');
      }
      const { root } = await send('DOM.getDocument');
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#group-chatComposer' });
      const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const checkbox = nodes.find(node => node.role?.value === 'checkbox');
      assert.equal(checkbox?.name?.value, 'Chat message composer');
      assert.equal(checkbox?.description?.value, await evaluate(`TwitchMinSettings.GROUPS.find(group=>group.key==='chatComposer').description`), 'visible help remains available to screen readers');

      await evaluate(`document.querySelector('#master-toggle').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate(`document.activeElement.id`), 'group-sidebarSections');
      assert.equal(await evaluate(`document.activeElement.matches(':focus-visible')`), true, 'keyboard focus remains visible');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await waitFor(`!document.querySelector('#group-sidebarSections').disabled`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { sidebarSections: false });
      assert.equal(await evaluate(`document.activeElement.id`), 'group-sidebarSections', 'saving retains keyboard focus');
      await evaluate(`document.querySelector('#group-chatGrouping').parentElement.click()`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { chatGrouping: false }, 'clicking the text label saves its setting');
      await evaluate(`document.documentElement.style.fontSize='26px'`);
      assert.equal(await evaluate(`document.body.scrollWidth<=document.body.clientWidth`), true, 'larger text wraps without horizontal overflow');
    } finally {
      await send('Emulation.clearDeviceMetricsOverride');
      await send('Emulation.setEmulatedMedia', { features: [] });
    }
  });

  await t.test('popup hides scrollbar chrome and toggles between More settings and Back to top', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    const cueHidden = () => evaluate(`document.querySelector('#more-settings').hidden`);
    const popupHeight = await evaluate(`document.body.getBoundingClientRect().height`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#groups')).scrollbarWidth`), 'none');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#groups'),'::-webkit-scrollbar').display`), 'none');
    await waitFor(`!document.querySelector('#more-settings').hidden`);
    const point = await evaluate(`(()=>{const rect=document.querySelector('#groups').getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaY: 1000, deltaX: 0 });
    await waitFor(`document.querySelector('#groups').scrollTop > 0 && document.querySelector('#more-settings').textContent === 'Back to top ↑'`);
    assert.equal(await evaluate(`document.body.getBoundingClientRect().height`), popupHeight, 'cue changes do not shift the popup');
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaY: -1000, deltaX: 0 });
    await waitFor(`document.querySelector('#more-settings').textContent === 'More settings ↓'`);
    await evaluate(`document.querySelector('#more-settings').click()`);
    await waitFor(`document.querySelector('#more-settings').textContent === 'Back to top ↑'`);
    assert.equal(await evaluate(`document.activeElement.id`), 'more-settings', 'scrolling down keeps focus on the scroll button');
    assert.equal(await evaluate(`document.querySelector('.setting:focus-within')`), null, 'scrolling does not highlight a setting');
    assert.equal(await evaluate(`document.querySelector('#groups').scrollHeight-document.querySelector('#groups').clientHeight-document.querySelector('#groups').scrollTop <= 1`), true, 'the action scrolls all the way to the bottom');
    await evaluate(`document.querySelector('#more-settings').click()`);
    await waitFor(`document.querySelector('#groups').scrollTop === 0 && document.querySelector('#more-settings').textContent === 'More settings ↓'`);
    assert.equal(await evaluate(`document.activeElement.id`), 'more-settings', 'scrolling up keeps focus on the scroll button');
    assert.equal(await evaluate(`document.querySelector('.setting:focus-within')`), null, 'returning to the top does not highlight a setting');
    await evaluate(`document.querySelector('#more-settings').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`document.querySelector('#more-settings').textContent === 'Back to top ↑'`);
    assert.equal(await evaluate(`document.activeElement.id`), 'more-settings', 'keyboard scrolling keeps focus on the scroll button');
    await evaluate(`document.querySelector('#more-settings').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`document.querySelector('#groups').scrollTop === 0 && document.querySelector('#more-settings').textContent === 'More settings ↓'`);
    await evaluate(`document.querySelector('#groups').style.maxHeight='none'`);
    await waitFor(`document.querySelector('#groups').clientHeight >= document.querySelector('#groups').scrollHeight`);
    await waitFor(`document.querySelector('#more-settings').hidden`);
    assert.equal(await cueHidden(), true, 'no cue appears when all settings fit');
    await evaluate(`document.querySelector('#groups').style.maxHeight='160px';document.querySelector('#groups').scrollTop=0`);
    await waitFor(`!document.querySelector('#more-settings').hidden`);
  });

  await t.test('popup exposes storage read/write failures without leaving controls stuck', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`__writeError=true; document.querySelector('#group-chatComposer').click()`);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'failed write rolls back');
    assert.equal(await evaluate(`document.querySelector('#status').hidden`), false);
    assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false);
    await navigate(`extension/${manifest.action.default_popup}`, '__readError=true;');
    assert.equal(await evaluate(`document.querySelector('#status').hidden`), false);
    assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), true);
  });

  await t.test('popup keeps newer storage changes when an earlier save callback finishes', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`
      chrome.storage.local.set=(patch,callback)=>{
        __storagePatch(patch);
        window.finishSave=callback;
      };
      document.querySelector('#group-chatComposer').click();
      __storagePatch({chatComposer:true,sidebarLabels:false});
    `);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').disabled`), true);
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), true, 'the action is hidden while a save is pending');
    await evaluate(`finishSave()`);
    assert.equal(await evaluate(`__stored.chatComposer`), true);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'save completion preserves the newer value');
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), false, 'unrelated external changes survive');
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').disabled`), false);
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').hidden`), false, 'the action returns when it becomes clickable');
  });

  await t.test('popup keeps its saved value when storage notifications arrive after the callback', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`
      chrome.storage.local.set=(patch,callback)=>{
        Object.assign(__stored,patch);
        callback();
      };
      document.querySelector('#group-chatComposer').click();
    `);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').disabled`), false);
    await evaluate(`__storagePatch({chatComposer:false});__storagePatch({chatComposer:true})`);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true);
  });

  for (const readFails of [false, true]) {
    await t.test(`popup preserves newer changes and removals when failed-save recovery ${readFails ? 'fails' : 'succeeds'}`, async () => {
      await navigate(`extension/${manifest.action.default_popup}`, '__stored.chatComposer=false;__stored.sidebarLabels=false;');
      await evaluate(`
        chrome.storage.local.set=(patch,callback)=>{
          window.failSave=()=>{
            chrome.runtime.lastError={message:'Write failed'};
            callback();
            chrome.runtime.lastError=null;
          };
        };
        chrome.storage.local.get=(defaults,callback)=>{
          const snapshot={...defaults,...__stored};
          window.finishRecovery=()=>{
            chrome.runtime.lastError=${readFails} ? {message:'Read failed'} : null;
            callback(snapshot);
            chrome.runtime.lastError=null;
          };
        };
        document.querySelector('#group-chatComposer').click();
        __storagePatch({chatComposer:false});
        failSave();
      `);
      await waitFor(`typeof finishRecovery==='function'`);
      await evaluate(`__storagePatch({chatComposer:undefined,sidebarLabels:undefined,enabled:false});finishRecovery()`);
      assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'a removed key keeps its default after recovery');
      assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), true, 'unrelated removals survive the recovery snapshot');
      assert.equal(await evaluate(`document.querySelector('#master-toggle').checked`), false, 'a newer pause is retained');
      assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false, 'controls unlock after recovery');
      assert.equal(await evaluate(`document.querySelector('#status').hidden`), false, 'the failed save remains visible');
    });
  }

  await t.test('popup rolls back only untouched fields when both saving and recovery fail', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`
      __writeError=true;__readError=true;
      document.querySelector('#group-chatComposer').click();
    `);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'an unconfirmed edit is rolled back');
    assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false);
  });

  await t.test('popup keeps a notification received before failed-save recovery begins', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`
      __writeError=true;__readError=true;
      document.querySelector('#group-chatComposer').click();
      __storagePatch({chatComposer:false});
    `);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false, 'rollback preserves the confirmed external value');
    assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false);
  });
};
