const assert = require('node:assert/strict');
const { manifest } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, waitFor, send }) => {
  await t.test('popup reconnects missing and outdated receivers once without reloading the tab', async () => {
    for (const initial of ['missing', 'outdated', 'not-ready']) {
      await navigate(`extension/${manifest.action.default_popup}`);
      await evaluate(`
        window.recoveryRequests=[];
        chrome.tabs={query:async()=>[{id:17}],sendMessage:async()=>{
          if(${JSON.stringify(initial)}==='missing')throw Error('Receiving end does not exist.');
          if(${JSON.stringify(initial)}==='not-ready')return {type:'twitch-min:status',version:chrome.runtime.getManifest().version,ready:false};
          return {type:'twitch-min:status',version:'outdated'};
        }};
        chrome.runtime.sendMessage=async message=>{
          recoveryRequests.push(message);
          return {type:'twitch-min:recovery',ok:true,status:{type:'twitch-min:status',version:chrome.runtime.getManifest().version,enabled:__stored.enabled,appliedEnabled:String(__stored.enabled),stylesheetMounted:true,failedFeatures:[],missingFeatures:[]}};
        };
        document.querySelector('#master-toggle').click();
      `);
      await waitFor(`recoveryRequests.length===1 && !document.querySelector('#master-toggle').disabled`);
      assert.deepEqual(await evaluate(`recoveryRequests`), [{ type: 'twitch-min:recover', tabId: 17 }]);
      assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true);
      assert.equal(await evaluate(`__stored.enabled`), false);
    }
  });

  await t.test('popup reports recovery failure and ignores a superseded recovery result', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`
      chrome.tabs={query:async()=>[{id:17}],sendMessage:async()=>{throw Error('Missing receiver')}};
      chrome.runtime.sendMessage=async()=>({type:'twitch-min:recovery',ok:false,error:'Refresh required to update the existing extension session'});
      document.querySelector('#master-toggle').click();
    `);
    await waitFor(`!document.querySelector('#toggle-error').hidden`);
    assert.match(await evaluate(`document.querySelector('#error-details').value`), /Refresh required/);
    await evaluate(`
      window.recoveries=[];
      chrome.runtime.sendMessage=()=>new Promise(resolve=>recoveries.push(resolve));
      document.querySelector('#master-toggle').click();
    `);
    await waitFor(`recoveries.length===1`);
    await evaluate(`document.querySelector('#master-toggle').click()`);
    await waitFor(`recoveries.length===2`);
    await evaluate(`recoveries[1]({type:'twitch-min:recovery',ok:true,status:{type:'twitch-min:status',version:chrome.runtime.getManifest().version,enabled:false,appliedEnabled:'false',stylesheetMounted:true,failedFeatures:[],missingFeatures:[]}});recoveries[0]({type:'twitch-min:recovery',ok:false,error:'Stale failure'})`);
    assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true, 'old recovery failure cannot overwrite newer success');
  });

  await t.test('toggle troubleshooting appears only for an unconfirmed change and supports copying and reporting', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#reload-hint').checkVisibility()`), false, 'no permanent refresh explanation');
    await evaluate(`
      chrome.tabs={query:async()=>[{id:17}],sendMessage:async()=>{throw Error('Receiving end does not exist.')}};
      window.copiedErrors=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copiedErrors.push(text)}});
      document.querySelector('#master-toggle').click();
    `);
    await waitFor(`!document.querySelector('#toggle-error').hidden`);
    assert.match(await evaluate(`document.querySelector('#toggle-error-message').textContent`), /Couldn't confirm the change/);
    assert.equal(await evaluate(`document.querySelector('#toggle-error a').href`), `${manifest.homepage_url}/issues`);
    assert.equal(await evaluate(`document.querySelector('#toggle-error a').rel`), 'noopener noreferrer');
    await evaluate(`document.querySelector('#copy-error').click()`);
    await waitFor(`document.querySelector('#copy-error').textContent === 'Copied!'`);
    assert.equal(await evaluate(`document.querySelector('#copy-error-status').hidden`), true, 'copy success appears only in the button');
    const copied = await evaluate(`copiedErrors[0]`);
    assert.ok(copied.startsWith(`[${manifest.name} v${manifest.version}]`));
    const details = JSON.parse(copied.slice(copied.indexOf('\n') + 1));
    assert.equal(details.requestedEnabled, false);
    assert.equal(details.reason, 'no-page-response');
    assert.equal(details.error, 'Receiving end does not exist.');
    try {
      await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 600, deviceScaleFactor: 1, mobile: false });
      for (const theme of ['light', 'dark']) {
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        assert.equal(await evaluate(`document.body.getBoundingClientRect().height<=600 && document.body.scrollWidth<=document.body.clientWidth && document.querySelector('#toggle-error').getBoundingClientRect().bottom<=600`), true, `${theme}: help and actions stay inside popup limits`);
        assert.equal(await evaluate(`(()=>{const row=document.querySelector('.error-actions').getBoundingClientRect(),button=document.querySelector('#copy-error').getBoundingClientRect(),link=document.querySelector('.error-actions a').getBoundingClientRect();return Math.abs(button.left-row.left)<1 && Math.abs(link.right-row.right)<1})()`), true, `${theme}: copy and report actions align to opposite edges`);
      }
      await evaluate(`navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied')};document.querySelector('#copy-error').click()`);
      await waitFor(`!document.querySelector('#error-details').hidden`);
      assert.equal(await evaluate(`document.querySelector('#copy-error').textContent`), 'Copy error details', 'a failed copy does not retain the success label');
      assert.equal(await evaluate(`document.querySelector('#error-details').value`), copied, 'manual copy fallback retains the same report');
      assert.equal(await evaluate(`document.activeElement.id`), 'error-details');
      assert.equal(await evaluate(`document.querySelector('#error-details').selectionEnd`), copied.length);
      assert.equal(await evaluate(`document.body.getBoundingClientRect().height<=600 && document.querySelector('#error-details').getBoundingClientRect().bottom<=600`), true, 'manual copy also fits');
    } finally {
      await send('Emulation.clearDeviceMetricsOverride');
      await send('Emulation.setEmulatedMedia', { features: [] });
    }
    await evaluate(`chrome.tabs.sendMessage=async()=>({type:'twitch-min:status',version:chrome.runtime.getManifest().version,enabled:true,appliedEnabled:'true',stylesheetMounted:true,failedFeatures:[],missingFeatures:[]});document.querySelector('#master-toggle').click()`);
    await waitFor(`!document.querySelector('#master-toggle').disabled`);
    assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true, 'successful retry removes troubleshooting');
    assert.equal(await evaluate(`document.querySelector('#error-details').value`), '', 'old report is cleared');
    assert.equal(await evaluate(`document.querySelector('#copy-error').textContent`), 'Copy error details', 'new attempts reset copy feedback');
  });

  await t.test('a page that never acknowledges a toggle gets bounded troubleshooting without blocking controls', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    await evaluate(`chrome.tabs={query:async()=>[{id:17}],sendMessage:()=>new Promise(()=>{})};document.querySelector('#master-toggle').click()`);
    await waitFor(`!document.querySelector('#master-toggle').disabled`);
    assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true, 'pending acknowledgement is not reported as a proven failure');
    await waitFor(`!document.querySelector('#toggle-error').hidden`);
    assert.match(await evaluate(`document.querySelector('#error-details').value`), /No page acknowledgement within 2 seconds/);
  });

  await t.test('popup diagnoses toggle acknowledgements and failures with name/version tags', async () => {
    await navigate(`extension/${manifest.action.default_popup}`, `
      window.toggleLogs=[];
      console.info=(message,...details)=>toggleLogs.push({level:'info',message,details});
      console.warn=(message,...details)=>toggleLogs.push({level:'warn',message,details});
    `);
    await evaluate(`
      window.tabQueries=[];window.tabMessages=[];
      window.reply={type:'twitch-min:status',version:chrome.runtime.getManifest().version,enabled:false,appliedEnabled:'false',stylesheetMounted:true,failedFeatures:[],missingFeatures:[]};
      chrome.tabs={
        query:async query=>{tabQueries.push(query);return [{id:17}]},
        sendMessage:async (...args)=>{tabMessages.push(args);return reply}
      };
      document.querySelector('#master-toggle').click();
    `);
    await waitFor(`toggleLogs.some(log=>log.message.includes('active tab confirmed disabled'))`);
    assert.deepEqual(await evaluate(`tabQueries`), [{ active: true, currentWindow: true }], 'diagnostics query no URLs or titles');
    assert.deepEqual(await evaluate(`tabMessages[0]`), [17, { type: 'twitch-min:status' }, { frameId: 0 }]);
    await evaluate(`document.querySelector('#master-toggle').dispatchEvent(new Event('change'))`);
    assert.match(await evaluate(`toggleLogs.at(-1).message`), /already disabled/);

    const cases = [
      ["reply={...reply,enabled:null}", 'has not loaded preferences'],
      ["reply={...reply,enabled:true,appliedEnabled:'false'}", 'has not applied the requested enabled state'],
      ["reply={...reply,enabled:true,appliedEnabled:'true',failedFeatures:['TwitchMinLayout'],pageData:'unrelated-private-page-data'}", 'application is incomplete'],
      ["reply={...reply,version:'outdated'}", 'outdated diagnostic response'],
      ["chrome.tabs.sendMessage=async()=>{throw Error('Could not establish connection. Receiving end does not exist.')}", 'active tab did not respond'],
      ["chrome.tabs.query=async()=>[]", 'no active tab was found'],
      ["chrome.tabs.query=async()=>{throw Error('Tab lookup failed')}", 'active-tab lookup failed'],
      ["delete chrome.tabs", 'tab diagnostics are unavailable']
    ];
    for (const [setup, reason] of cases) {
      await evaluate(`${setup};toggleLogs.length=0;document.querySelector('#master-toggle').click()`);
      await waitFor(`toggleLogs.some(log=>log.level==='warn' && log.message.includes(${JSON.stringify(reason)}))`);
      assert.equal(await evaluate(`toggleLogs.every(log=>log.message.startsWith('[twitch-min v'+chrome.runtime.getManifest().version+']'))`), true, reason);
      assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), false, reason);
      if (reason === 'application is incomplete') {
        const report = await evaluate(`document.querySelector('#error-details').value`);
        assert.match(report, /TwitchMinLayout/);
        assert.doesNotMatch(report, /unrelated-private-page-data/, 'reports omit unrelated response fields');
      }
    }
    await evaluate(`toggleLogs.length=0;__writeError=true;__readError=true;document.querySelector('#master-toggle').click()`);
    await waitFor(`toggleLogs.some(log=>log.message.includes('preference recovery also failed'))`);
    assert.equal(await evaluate(`toggleLogs.some(log=>log.message.includes('preference save failed'))`), true);
    assert.equal(await evaluate(`toggleLogs.some(log=>log.message.includes('saved; checking'))`), false, 'failed saves do not claim success');
    assert.equal(await evaluate(`toggleLogs.every(log=>log.message.startsWith('[twitch-min v'+chrome.runtime.getManifest().version+']'))`), true);
    assert.equal(await evaluate(`document.querySelector('#reload-hint').hidden`), true, 'storage errors offer retry/reporting instead of irrelevant refresh guidance');
  });

  await t.test('toggle diagnostics ignore stale replies and report attempts blocked by a pending save', async () => {
    await navigate(`extension/${manifest.action.default_popup}`, `
      window.toggleLogs=[];
      console.info=console.warn=(message)=>toggleLogs.push(message);
    `);
    await evaluate(`
      window.replies=[];
      chrome.tabs={query:async()=>[{id:17}],sendMessage:()=>new Promise(resolve=>replies.push(resolve))};
      window.statusReply=enabled=>({type:'twitch-min:status',version:chrome.runtime.getManifest().version,enabled,appliedEnabled:String(enabled),stylesheetMounted:true,failedFeatures:[],missingFeatures:[]});
      document.querySelector('#master-toggle').click();
    `);
    await waitFor(`replies.length===1`);
    await evaluate(`document.querySelector('#master-toggle').click()`);
    await waitFor(`replies.length===2`);
    await evaluate(`replies[0](statusReply(false));replies[1](statusReply(true))`);
    await waitFor(`toggleLogs.some(message=>message.includes('active tab confirmed enabled'))`);
    assert.equal(await evaluate(`toggleLogs.some(message=>message.includes('active tab confirmed disabled'))`), false, 'an old acknowledgement cannot confirm a newer toggle');
    assert.equal(await evaluate(`document.querySelector('#toggle-error').hidden`), true, 'stale replies do not display troubleshooting');
    await evaluate(`
      chrome.storage.local.set=(patch,callback)=>{window.finishWrite=()=>{__storagePatch(patch);callback()}};
      document.querySelector('#master-toggle').click();
      document.querySelector('#master-toggle').dispatchEvent(new Event('change'));
    `);
    assert.match(await evaluate(`toggleLogs.at(-1)`), /previous save is still pending/);
    await evaluate(`finishWrite()`);
    await waitFor(`replies.length===3`);
    await evaluate(`__storagePatch({enabled:true});replies[2](statusReply(false))`);
    await waitFor(`toggleLogs.some(message=>message.includes('newer preference change superseded'))`);
    assert.equal(await evaluate(`document.querySelector('#master-toggle').disabled`), false, 'diagnostic replies never hold controls busy');
    assert.equal(await evaluate(`toggleLogs.every(message=>message.startsWith('[twitch-min v'+chrome.runtime.getManifest().version+']'))`), true);
  });

  await t.test('popup saves changed keys, pauses, enables all, and handles external changes', async () => {
    await navigate(`extension/${manifest.action.default_popup}`);
    assert.equal(await evaluate(`document.querySelector('#app-version').innerText`), `v${manifest.version}`);
    assert.equal(await evaluate(`document.querySelectorAll('#groups input').length === TwitchMinSettings.GROUPS.length`), true);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#groups input')].map(input=>input.id)`), [
      'group-topNavigation', 'group-hideTopNavigation', 'group-sidebarSections', 'group-sidebarLabels', 'group-channelActions',
      'group-channelAbout', 'group-wheelVolume', 'group-followingStories', 'group-browseRecaps', 'group-chatLeaderboard', 'group-chatTimestamps',
      'group-chatTints', 'group-chatGrouping', 'group-emotePreviews', 'group-chatComposer'
    ]);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#groups h2')].map(heading=>[heading.textContent,heading.nextElementSibling.querySelector('input').id])`), [
      ['Sidebar', 'group-sidebarSections'], ['Main', 'group-channelActions'], ['Chat', 'group-chatLeaderboard']
    ]);
    assert.equal(await evaluate(`document.querySelector('#pause-button')`), null, 'one master control handles pause and resume');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').textContent.trim()`), 'Enable all settings');
    assert.equal(await evaluate(`document.querySelector('#group-channelAbout').checked`), false, 'About hiding defaults off');
    assert.equal(await evaluate(`document.querySelector('#group-hideTopNavigation').checked`), false, 'whole-bar hiding defaults off');
    assert.equal(await evaluate(`document.querySelector('#enable-all-button').disabled`), false, 'Enable all is available with the off default');
    await evaluate(`document.querySelector('#enable-all-button').click()`);
    assert.equal(await evaluate(`document.querySelector('#group-channelAbout').checked`), true, 'Enable all opts into About hiding too');
    assert.equal(await evaluate(`document.querySelector('#group-hideTopNavigation').checked`), true, 'Enable all opts into whole-bar hiding too');
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
        assert.equal(await evaluate(`document.querySelector('#reload-hint').checkVisibility()`), false, `${theme}: refresh guidance stays hidden during normal use`);
        assert.equal(layout.labels, true, 'the whole setting label remains a usable click target');
          assert.equal(await evaluate(`(()=>{
            const on=document.querySelector('input:checked'),off=document.querySelector('input:not(:checked)');
            const track=getComputedStyle(on),thumb=getComputedStyle(on,'::before');
            return track.appearance==='none' && track.backgroundColor==='rgb(145, 70, 255)'
              && thumb.backgroundColor==='rgb(255, 255, 255)'
              && thumb.transform!==getComputedStyle(off,'::before').transform
              && on.getBoundingClientRect().width===30 && off.getBoundingClientRect().width===30;
          })()`), true, `${theme}: switches show an accent track and distinct thumb positions`);
      }
      const { root } = await send('DOM.getDocument');
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#group-chatComposer' });
      const { nodes } = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const checkbox = nodes.find(node => node.role?.value === 'checkbox');
      assert.equal(checkbox?.name?.value, 'Chat message box');
      assert.equal(checkbox?.description?.value, await evaluate(`TwitchMinSettings.GROUPS.find(group=>group.key==='chatComposer').description`), 'visible help remains available to screen readers');

      await evaluate(`document.querySelector('#master-toggle').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate(`document.activeElement.id`), 'enable-all-button');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate(`document.activeElement.id`), 'group-topNavigation');
      assert.equal(await evaluate(`document.activeElement.matches(':focus-visible')`), true, 'keyboard focus remains visible');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await waitFor(`!document.querySelector('#group-topNavigation').disabled`);
      assert.deepEqual(await evaluate(`__writes.at(-1)`), { topNavigation: false });
      assert.equal(await evaluate(`document.activeElement.id`), 'group-topNavigation', 'saving retains keyboard focus');
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
    assert.equal(await evaluate(`(()=>{
      const list=document.querySelector('#groups');
      document.querySelector('#more-settings').click();
      return list.scrollTop===0;
    })()`), true, 'animated scrolling does not jump straight to the bottom');
    await waitFor(`document.querySelector('#more-settings').textContent === 'Back to top ↑'`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    try {
      assert.equal(await evaluate(`(()=>{
        document.querySelector('#more-settings').click();
        return document.querySelector('#groups').scrollTop;
      })()`), 0, 'reduced motion returns to the top immediately');
    } finally {
      await send('Emulation.setEmulatedMedia', { features: [] });
    }
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
    await evaluate(`document.querySelector('main').style.maxHeight='none';document.querySelector('#groups').style.maxHeight='none'`);
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
