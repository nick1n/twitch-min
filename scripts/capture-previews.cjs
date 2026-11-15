const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const encodePreviews = require('./encode-previews.cjs');
const withBrowser = require('../tests/support/chrome.cjs');
const { root, intercept, initSource } = require('../tests/support/production.cjs');

async function run() {
  const frames = path.join(root, '.browser-tests/readme-previews');
  fs.mkdirSync(frames, { recursive: true });
  await withBrowser(async ({ navigate, evaluate, waitFor, send }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    for (const demo of ['sidebar', 'chat', 'nav']) {
      await navigate('tests/fixtures/readme-preview.html', `window.__demo=${JSON.stringify(demo)};__stored.enabled=false;`);
      await evaluate(`Promise.all([...document.images].map(img=>img.decode()))`);
      for (const enabled of [false, true]) {
        const state = enabled ? 'after' : 'before';
        await evaluate(`document.body.dataset.state=${JSON.stringify(state)};document.querySelectorAll('.state').forEach(label=>label.textContent=${JSON.stringify(enabled ? 'After' : 'Before')});__storagePatch({enabled:${enabled}})`);
        if (enabled && demo === 'sidebar') await waitFor(`document.querySelector('#sidebar-shell').hasAttribute('data-tq-sidebar-ready')`);
        if (enabled && demo === 'chat') await waitFor(`document.querySelector('[data-tq-chat-continuation]') && document.querySelector('[data-tq-time]') && document.querySelector('[data-tq-chat-toggle]')`);
        await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        if (enabled && demo === 'sidebar') {
          const centers = await evaluate(`(()=>{
            const button=document.querySelector('[data-a-target="side-nav-arrow"]').getBoundingClientRect();
            const heading=document.querySelector('[data-tq-section-title="Followed"]').getBoundingClientRect();
            const sidebar=document.querySelector('#sidebar-shell').getBoundingClientRect();
            return {button:button.y+button.height/2,heading:heading.y+heading.height/2,rightGap:sidebar.right-button.right};
          })()`);
          assert.ok(Math.abs(centers.button - centers.heading) <= 3, 'collapse button aligns with Followed');
          assert.ok(centers.rightGap >= 0 && centers.rightGap <= 12, 'collapse button stays at the right edge');
        }
        assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`), 'rgb(14, 14, 16)');
        const clip = await evaluate(`(()=>{const r=document.querySelector('#preview-${demo}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
        fs.writeFileSync(path.join(frames, `${demo}-${state}.png`), Buffer.from(data, 'base64'));
      }
    }
    const output = path.join(root, 'docs/images');
    fs.mkdirSync(output, { recursive: true });
    for (const demo of ['sidebar', 'chat', 'nav']) {
      const file = path.join(output, `${demo}-before-after.gif`);
      encodePreviews(path.join(frames, `${demo}-before.png`), path.join(frames, `${demo}-after.png`), file);
      const decoded = await evaluate(`(async()=>{
        const bytes=Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(file).toString('base64'))}),c=>c.charCodeAt(0));
        const decoder=new ImageDecoder({data:bytes,type:'image/gif'});
        await decoder.tracks.ready;
        const track=decoder.tracks.selectedTrack;
        const frames=[];
        for(let index=0;index<track.frameCount;index++) {
          const {image}=await decoder.decode({frameIndex:index});
          const canvas=document.createElement('canvas');
          canvas.width=image.displayWidth;canvas.height=image.displayHeight;
          const context=canvas.getContext('2d');context.drawImage(image,0,0);
          frames.push({duration:image.duration,pixel:[...context.getImageData(3,3,1,1).data],png:canvas.toDataURL('image/png').split(',')[1]});
          image.close();
        }
        const infinite=track.repetitionCount===Infinity;
        decoder.close();return {infinite,frames};
      })()`);
      assert.equal(decoded.infinite, true, 'GIF loops indefinitely');
      assert.equal(decoded.frames.length, 2, 'before and after frames decode');
      assert.notEqual(decoded.frames[0].png, decoded.frames[1].png, 'states differ');
      decoded.frames.forEach((frame, index) => {
        assert.equal(frame.duration, 3000000, 'three-second hold');
        assert.deepEqual(frame.pixel, [20, 20, 22, 255], 'flat header color stays exact');
        fs.writeFileSync(path.join(frames, `${demo}-gif-frame-${index}.png`), Buffer.from(frame.png, 'base64'));
      });
      process.stdout.write(`${file}\n`);
    }
  }, { intercept, initSource });
}

run().catch(error => { console.error(error); process.exitCode = 1; });
