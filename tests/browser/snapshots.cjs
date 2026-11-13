const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('../support/production.cjs');

module.exports = async (t, { navigate, evaluate, isVisible, waitFor, send }) => {
  const sessionFile = path.join(root, '.browser-tests', 'test.html');
  const liveSessionFile = path.join(root, '.browser-tests', 'live.html');
    await t.test('provided logged-in HTML: real notification, Turbo, VOD card and timestamp markup', { skip: !fs.existsSync(sessionFile) }, async () => {
      await navigate('tests/fixtures/twitch.html');
      // The supplied document is parsed inertly. Block all HTTP requests during
      // parsing, then import only sanitized UI fragments, never its scripts.
      const source = fs.readFileSync(sessionFile, 'utf8');
      const counts = await evaluate(`(()=>{
        const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)}, 'text/html');
        const clean=node=>{
          node=node.cloneNode(true);
          node.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(x=>x.remove());
        for(const element of [node,...node.querySelectorAll('*')]) {
          const nameColor=element.matches('[data-a-target="chat-message-username"], .chat-author__display-name') ? element.style.color : '';
          for(const attribute of [...element.attributes]) {
            if (/^on/i.test(attribute.name) || ['style','src','srcset'].includes(attribute.name)) element.removeAttribute(attribute.name);
          }
          if(nameColor && CSS.supports('color',nameColor)) element.style.color=nameColor;
        }
          return node;
        };
        const nav=clean(snapshot.querySelector('.top-nav'));
        document.querySelector('.top-nav').replaceWith(nav);
        const bell=nav.querySelector('.onsite-notifications'); bell.id='snapshot-notifications';
        nav.querySelector('.top-nav__prime').id='snapshot-luna';
        nav.querySelector('button[aria-label="Shouts"]').id='snapshot-shouts';
        const turbo=[...nav.querySelectorAll('button')].find(x=>x.textContent.replace(/\\s+/g,' ').trim()==='Gift Turbo'); turbo.id='snapshot-turbo';
        const side=clean(snapshot.querySelector('.side-nav'));side.id='snapshot-sidebar';
        side.querySelector('.side-nav__title').id='snapshot-for-you';
        side.querySelector('[role="group"][aria-label="Watch Streaks at risk"]').id='snapshot-streaks';
        const composite=[...side.querySelectorAll('.side-nav-card__link .tw-avatar')].find(x=>!x.closest('.side-nav-card__avatar'));
        composite.id='snapshot-composite-avatar';document.querySelector('#sidebar-shell').replaceWith(side);
        const sectionHeaders=[['Followed Channels','snapshot-followed-heading'],['Live Channels','snapshot-live-heading'],['Karkalla Viewers Also Watch','snapshot-similar-heading']];
        for(const [label,id] of sectionHeaders) [...side.querySelectorAll('.side-nav-section')].find(x=>x.getAttribute('aria-label')===label).firstElementChild.id=id;
        side.querySelector('.side-nav-card__link--offline').closest('.tw-transition').id='snapshot-offline';
        const count=side.querySelector('[data-a-target="side-nav-live-status"]');count.id='snapshot-viewers';
        const row=count.closest('.side-nav-card__link');
        row.querySelector('.side-nav-card__metadata').id='snapshot-game';
        row.querySelector('.side-nav-card__title').id='snapshot-channel-name';
        const info=clean(snapshot.querySelector('.channel-info-content'));
        document.querySelector('#vod-info').replaceWith(info);
        const metadata=info.querySelector('.metadata-layout__split-top'); metadata.id='snapshot-metadata';
        metadata.nextElementSibling.id='snapshot-channel-card';
        info.querySelector('#live-channel-stream-information').nextElementSibling.id='snapshot-recommendations';
        const message=clean(snapshot.querySelector('.vod-message'));
        message.querySelector('.vod-message__header').id='snapshot-timestamp';
        message.querySelector('.video-chat__message').id='snapshot-message';
        const repeated=message.cloneNode(true);
        for(const node of repeated.querySelectorAll('[id]'))node.removeAttribute('id');
        repeated.id='snapshot-repeated-row';
        message.querySelector('.video-chat__message-author').id='snapshot-first-author';
        repeated.querySelector('.video-chat__message-author').id='snapshot-repeated-author';
        repeated.querySelector('.video-chat__message > span:first-child').id='snapshot-repeated-colon';
        repeated.querySelector('[data-a-target="chat-message-text"]').id='snapshot-repeated-text';
        repeated.querySelector('.vod-message__header').id='snapshot-repeated-time';
        const chat=document.createElement('div');chat.className='video-chat';chat.append(message,repeated);document.querySelector('#messages').append(chat);
        return {bell:!!bell,turbo:!!turbo,metadata:!!metadata};
      })()`);
      assert.deepEqual(counts, { bell: true, turbo: true, metadata: true });
      for (const id of ['snapshot-luna','snapshot-shouts','snapshot-turbo','snapshot-channel-card','snapshot-recommendations','snapshot-for-you','snapshot-streaks','snapshot-channel-name','snapshot-offline']) assert.equal(await isVisible(id), false, `${id} hidden in supplied markup`);
      for (const id of ['snapshot-notifications','snapshot-timestamp','snapshot-metadata','snapshot-message','snapshot-composite-avatar','snapshot-viewers','snapshot-game']) assert.equal(await isVisible(id), true, `${id} retained in supplied markup`);
      assert.match(await evaluate(`document.querySelector('#snapshot-timestamp p').getAttribute('data-tq-time')`), /^\d+:\d{2}$/, 'real replay timestamp shows hours and minutes');
      assert.equal(await isVisible('snapshot-first-author'), true);
      for (const id of ['snapshot-repeated-author','snapshot-repeated-colon']) assert.equal(await isVisible(id), false, `${id} hides in native VOD markup`);
      for (const id of ['snapshot-repeated-row','snapshot-repeated-time','snapshot-repeated-text']) assert.equal(await isVisible(id), true, `${id} is preserved`);
      assert.equal(await evaluate(`(()=>{const count=document.querySelector('#snapshot-viewers').getBoundingClientRect(),game=document.querySelector('#snapshot-game').getBoundingClientRect();return count.x===game.x && game.y>=count.bottom})()`), true, 'actual logged-in game appears below its viewer count');
      for (const [id,label] of [['snapshot-followed-heading','Followed'],['snapshot-live-heading','Recommended'],['snapshot-similar-heading','Similar']]) {
        assert.equal(await isVisible(id), true);
        assert.equal(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}),'::before').content`), JSON.stringify(label));
      }
      assert.ok(await evaluate(`document.querySelector('#snapshot-sidebar .side-nav__overlay-wrapper').getBoundingClientRect().height >= 650`), 'logged-in overlay is never squeezed into a 50px vertical flex basis');
      await evaluate(`__storagePatch({enabled:false})`);
      for (const id of ['snapshot-repeated-author','snapshot-repeated-colon']) assert.equal(await isVisible(id), true, `${id} restores`);
      for (const id of ['snapshot-notifications','snapshot-turbo','snapshot-channel-card','snapshot-recommendations','snapshot-timestamp','snapshot-for-you','snapshot-streaks']) assert.equal(await isVisible(id), true, `${id} restores in supplied markup`);
    });

    await t.test('provided live HTML: every tint uses the nested name color and native grouping preserves badges', { skip: !fs.existsSync(liveSessionFile) }, async () => {
      await navigate('tests/fixtures/live-chat.html');
      const source = fs.readFileSync(liveSessionFile, 'utf8');
      const imported = await evaluate(`(()=>{
        const snapshot=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');
        const container=snapshot.querySelector('.chat-scrollable-area__message-container').cloneNode(true);
        container.querySelectorAll('script,style,link,iframe,object,embed,video,audio,source').forEach(node=>node.remove());
        for(const node of [container,...container.querySelectorAll('*')]) {
          const nameColor=node.matches('[data-a-target="chat-message-username"], .chat-author__display-name') ? node.style.color : '';
          for(const attribute of [...node.attributes]) {
            if(/^on/i.test(attribute.name) || /^data-tq-/.test(attribute.name) || ['id','style','src','srcset'].includes(attribute.name)) node.removeAttribute(attribute.name);
          }
          if(nameColor && CSS.supports('color',nameColor)) node.style.color=nameColor;
        }
        container.id='snapshot-live-chat';
        const first=container.querySelector('.chat-line__message').cloneNode(true),repeat=first.cloneNode(true);
        first.id='snapshot-live-first';repeat.id='snapshot-live-repeat';
        repeat.querySelector('.chat-line__username').id='snapshot-live-repeat-author';
        repeat.querySelector('.chat-line__username-container').id='snapshot-live-repeat-identity';
        repeat.querySelector('.chat-line__username-container + span[aria-hidden="true"]').id='snapshot-live-repeat-colon';
        repeat.querySelector('[data-a-target="chat-line-message-body"]').id='snapshot-live-repeat-body';
        container.append(first,repeat);
        document.querySelector('#live-native-items').replaceWith(container);
        const rows=[...container.querySelectorAll('.chat-line__message')];
        return {rows:rows.length, distinct:new Set(rows.map(row=>row.querySelector('[data-a-target="chat-message-username"]').style.color)).size};
      })()`);
      assert.ok(imported.rows > 100, 'the supplied live message history is covered');
      assert.ok(imported.distinct > 5, 'the snapshot includes varied name colors');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('#snapshot-live-chat .chat-line__message')].flatMap((row,i)=>{const author=row.querySelector('[data-a-target="chat-message-username"]'),style=getComputedStyle(row);return row.style.getPropertyValue('--tq-chat-color')===getComputedStyle(author).color && style.backgroundImage!=='none' ? [] : [i]})`), [], 'every live tint matches its colored display name');
      for (const id of ['snapshot-live-repeat-author','snapshot-live-repeat-colon']) assert.equal(await isVisible(id), false, `${id} stays grouped`);
      for (const id of ['snapshot-live-repeat-identity','snapshot-live-repeat-body']) assert.equal(await isVisible(id), true, `${id} stays visible`);
      assert.equal(await evaluate(`document.querySelector('#snapshot-live-repeat [data-tq-chat-author]').matches('.chat-line__username')`), true, 'the name wrapper hides independently of its badge siblings');
      await evaluate(`document.querySelector('#snapshot-live-repeat [data-a-target="chat-message-username"]').style.color='rgb(25, 190, 150)'`);
      assert.equal(await evaluate(`document.querySelector('#snapshot-live-repeat').style.getPropertyValue('--tq-chat-color')`), 'rgb(25, 190, 150)');
      await evaluate(`__storagePatch({enabled:false})`);
      assert.equal(await evaluate(`document.querySelectorAll('#snapshot-live-chat [data-tq-chat-tint], #snapshot-live-chat [data-tq-chat-author], #snapshot-live-chat [data-tq-chat-separator]').length`), 0);
      for (const id of ['snapshot-live-repeat-author','snapshot-live-repeat-colon']) assert.equal(await isVisible(id), true, `${id} restores`);
    });
};
