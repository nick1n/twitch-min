const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const encodePreviews = require('./encode-previews.cjs');
const optimizePreview = require('./optimize-previews.cjs');
const withBrowser = require('../tests/support/chrome.cjs');
const { root, intercept, initSource } = require('../tests/support/production.cjs');

async function run() {
  const frames = path.join(root, '.browser-tests/readme-previews');
  fs.mkdirSync(frames, { recursive: true });
  await withBrowser(async ({ navigate, evaluate, waitFor, send }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    let colors, sidebarSize;
    for (const demo of ['sidebar', 'chat', 'nav']) {
      await navigate('tests/fixtures/readme-preview.html', `window.__demo=${JSON.stringify(demo)};__stored.enabled=false;`);
      colors = await evaluate(`(()=>{
        const style=getComputedStyle(document.documentElement);
        return Object.fromEntries([...style].filter(name=>name.startsWith('--preview-'))
          .map(name=>[name.slice(10),style.getPropertyValue(name).trim()]));
      })()`);
      await evaluate(`Promise.all([...document.images].map(img=>img.decode()))`);
      for (const enabled of [false, true]) {
        const state = enabled ? 'after' : 'before';
        await evaluate(`document.body.dataset.state=${JSON.stringify(state)};document.querySelectorAll('.state').forEach(label=>label.textContent=${JSON.stringify(enabled ? 'After' : 'Before')});__storagePatch({enabled:${enabled}})`);
        if (enabled && demo === 'sidebar') await waitFor(`document.querySelector('#sidebar-shell').hasAttribute('data-tq-sidebar-ready')`);
        if (enabled && demo === 'chat') await waitFor(`document.querySelector('[data-tq-chat-continuation]') && document.querySelector('[data-tq-time]') && document.querySelector('[data-tq-chat-toggle]')`);
        await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        if (demo === 'sidebar') {
          if (!enabled) assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.sidebar-toolbar h2, .side-nav-section h3'), heading=>heading.textContent)`),
            ['For You', 'Followed Channels', 'Live Channels', 'Viewers Also Watch'], 'before image uses native sidebar headings');
          assert.equal(await evaluate(`getComputedStyle(document.querySelector('.viewing-area p')).visibility`),
            enabled ? 'visible' : 'hidden', 'viewing-area caption appears only in the after image');
        }
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
        if (enabled && demo === 'chat') {
          const rows = await evaluate(`Array.from(document.querySelectorAll('.vod-message')).map(row=>({
            height:row.getBoundingClientRect().height,continuation:row.hasAttribute('data-tq-chat-continuation')
          }))`);
          rows.forEach(row => assert.equal(row.height, row.continuation ? 30 : 31,
            'single-line chat rows retain native spacing plus the group border'));
        }
        assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`), 'rgb(14, 14, 16)');
        const clip = await evaluate(`(()=>{const r=document.querySelector('#preview-${demo}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
        if (demo === 'sidebar') sidebarSize = { width: clip.width, height: clip.height };
        if (demo === 'chat') assert.deepEqual({ width: clip.width, height: clip.height }, sidebarSize,
          'chat and sidebar screenshots have matching dimensions');
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
        fs.writeFileSync(path.join(frames, `${demo}-${state}.png`), Buffer.from(data, 'base64'));
      }
    }
    const output = path.join(root, 'docs/images');
    fs.mkdirSync(output, { recursive: true });
    // Compose original PNGs at native resolution so the stills remain lossless.
    for (const state of ['before', 'after']) {
      const sources = Object.fromEntries(['nav', 'sidebar', 'chat'].map(demo =>
        [demo, fs.readFileSync(path.join(frames, `${demo}-${state}.png`)).toString('base64')]));
      const png = await evaluate(`(async()=>{
        const sources=${JSON.stringify(sources)};
        const colors=${JSON.stringify(colors)};
        const images={};
        for(const [name,data] of Object.entries(sources)) {
          const image=new Image();image.src='data:image/png;base64,'+data;
          await image.decode();images[name]=image;
        }
        const {nav,sidebar,chat}=images;
        const canvas=document.createElement('canvas');
        const padding=24,gap=16,header=66;
        const contentWidth=sidebar.width+gap+chat.width;
        const rowHeight=Math.max(sidebar.height,chat.height);
        canvas.width=contentWidth+padding*2;
        canvas.height=nav.height+gap+rowHeight+padding*2;
        const context=canvas.getContext('2d');
        context.fillStyle=colors.page;context.fillRect(0,0,canvas.width,canvas.height);
        function card(x,y,width,height,draw) {
          context.save();
          context.beginPath();context.roundRect(x,y,width,height,10);context.clip();
          context.fillStyle=colors.surface;context.fillRect(x,y,width,height);
          draw();context.restore();
          context.strokeStyle=colors.button;context.lineWidth=1;
          context.beginPath();context.roundRect(x+.5,y+.5,width-1,height-1,10);context.stroke();
        }
        card(padding,padding,contentWidth,nav.height,()=>{
          context.fillStyle=colors.header;context.fillRect(padding,padding,contentWidth,header);
          context.fillStyle=colors.page;context.fillRect(padding,padding+header,contentWidth,nav.height-header);
          context.fillStyle=colors.surface;context.fillRect(padding,padding+88,contentWidth,56);
          // Extend the flat navigation background, keeping all text and icons at 1:1.
          context.drawImage(nav,0,0,300,header,padding,padding,300,header);
          context.drawImage(nav,nav.width/2-50,0,100,header,
            padding+contentWidth/2-50,padding,100,header);
          context.drawImage(nav,500,0,220,header,padding+contentWidth-220,padding,220,header);
          context.drawImage(nav,0,header,nav.width,nav.height-header,
            padding+contentWidth-nav.width,padding+header,nav.width,nav.height-header);
          context.strokeStyle='#303035';
          for(const offset of [header-.5,88.5,143.5]) {
            context.beginPath();context.moveTo(padding,padding+offset);
            context.lineTo(padding+contentWidth,padding+offset);context.stroke();
          }
        });
        const rowY=padding+nav.height+gap;
        card(padding,rowY,sidebar.width,rowHeight,()=>context.drawImage(sidebar,padding,rowY));
        card(padding+sidebar.width+gap,rowY,chat.width,rowHeight,
          ()=>context.drawImage(chat,padding+sidebar.width+gap,rowY));
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
      fs.writeFileSync(path.join(output, `${state}.png`), Buffer.from(png, 'base64'));
    }
    for (const state of ['before', 'after']) {
      const file = path.join(output, `${state}.png`);
      const size = await optimizePreview(file);
      process.stdout.write(`${file}: ${size.before} -> ${size.after} bytes (lossless)\n`);
    }
    for (const demo of ['combined', 'sidebar', 'chat', 'nav']) {
      const file = path.join(demo === 'combined' ? output : frames,
        demo === 'combined' ? 'before-after.gif' : `${demo}-before-after.gif`);
      const originals = ['before', 'after'].map(state => path.join(
        demo === 'combined' ? output : frames, demo === 'combined' ? `${state}.png` : `${demo}-${state}.png`));
      await encodePreviews(...originals, file, Object.values(colors));
      const decoded = await evaluate(`(async()=>{
        const originals=${JSON.stringify(originals.map(file => fs.readFileSync(file).toString('base64')))};
        const exact=new Set(${JSON.stringify(Object.values(colors))}.map(color=>parseInt(color.slice(1),16)));
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
          const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
          const png=canvas.toDataURL('image/png').split(',')[1];
          const original=new Image();original.src='data:image/png;base64,'+originals[index];await original.decode();
          context.drawImage(original,0,0);
          const source=context.getImageData(0,0,canvas.width,canvas.height).data;
          let checked=0,mismatches=0;
          for(let offset=0;offset<source.length;offset+=4) {
            const color=source[offset]<<16|source[offset+1]<<8|source[offset+2];
            if(!exact.has(color)) continue;
            checked++;
            if(source[offset]!==pixels[offset]||source[offset+1]!==pixels[offset+1]||source[offset+2]!==pixels[offset+2]) mismatches++;
          }
          frames.push({duration:image.duration,checked,mismatches,png});
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
        assert.ok(frame.checked > 1000, 'theme colors checked against source PNG');
        assert.equal(frame.mismatches, 0, 'GIF preserves every flat theme-color pixel exactly');
        fs.writeFileSync(path.join(frames, `${demo}-gif-frame-${index}.png`), Buffer.from(frame.png, 'base64'));
      });
      process.stdout.write(`${file}\n`);
    }
    // Quantize the published PNGs after GIF encoding to avoid double quantization.
    for (const state of ['before', 'after']) {
      const file = path.join(output, `${state}.png`);
      const size = await optimizePreview(file, { indexed: true, reservedColors: Object.values(colors) });
      assert.ok(size.after < 30000, 'published PNG stays below 30 KB');
      process.stdout.write(`${file}: ${size.before} -> ${size.after} bytes (palette compressed)\n`);
    }
  }, { intercept, initSource });
}

run().catch(error => { console.error(error); process.exitCode = 1; });
