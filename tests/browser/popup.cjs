const assert = require('node:assert/strict');
const { manifest } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, waitFor }) => {
  await t.test('popup saves changed keys, restores, presets, and handles external changes', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    assert.equal(await evaluate(`document.querySelectorAll('#groups input').length`), 8);
    await evaluate(`window.originalControls=[...document.querySelectorAll('#groups input')]`);
    assert.equal(await evaluate(`document.querySelector('#groups .loading')`), null);
    assert.equal(await evaluate(`document.body.scrollWidth <= document.body.clientWidth`), true, 'no horizontal overflow');
    await evaluate(`document.querySelector('#group-chatComposer').focus(); document.querySelector('#group-chatComposer').click()`);
    assert.deepEqual(await evaluate(`__writes.at(-1)`), { chatComposer: false });
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), false);
    assert.equal(await evaluate(`document.activeElement.id`), 'group-chatComposer', 'keyboard focus survives saving');
    await evaluate(`document.querySelector('#restore-button').click()`);
    assert.deepEqual(await evaluate(`__writes.at(-1)`), { enabled: false });
    assert.equal(await evaluate(`document.querySelector('#master-toggle').checked`), false);
    await evaluate(`document.querySelector('#preset-button').click()`);
    assert.equal(await evaluate(`Object.values(__writes.at(-1)).every(value=>value===true) && Object.keys(__writes.at(-1)).length===9`), true);
    await evaluate(`__storagePatch({sidebarLabels:false})`);
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), false);
    await evaluate(`__storagePatch({sidebarLabels:undefined})`);
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), true);
    assert.equal(await evaluate(`originalControls.every(input=>input === document.getElementById(input.id))`), true, 'save, preset and external changes retain the original controls');
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
    await evaluate(`finishSave()`);
    assert.equal(await evaluate(`__stored.chatComposer`), true);
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').checked`), true, 'save completion preserves the newer value');
    assert.equal(await evaluate(`document.querySelector('#group-sidebarLabels').checked`), false, 'unrelated external changes survive');
    assert.equal(await evaluate(`document.querySelector('#group-chatComposer').disabled`), false);
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
