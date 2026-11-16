const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { readPng } = require('../scripts/png.cjs');
const optimizePreview = require('../scripts/optimize-previews.cjs');
const encodePreviews = require('../scripts/encode-previews.cjs');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'twitch-min-images-'));
  t.after(() => {
    const target = fs.realpathSync(dir);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith('twitch-min-images-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return dir;
}

async function image(file, base) {
  const width = 160, height = 80, data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const color = x < 40 ? base : x < 80 ? [145, 70, 255] : [x, i % 251, i % 239];
    data.set([...color, 255], i * 4);
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toFile(file);
}

test('Sharp lossless and indexed preview optimization retain dimensions and exact theme pixels', async t => {
  const file = path.join(fixture(t), 'preview.png');
  await image(file, [14, 14, 16]);
  const uncompressed = fs.readFileSync(file);
  const source = await readPng(file);
  const lossless = await optimizePreview(file);
  assert.ok(lossless.after < lossless.before);
  assert.deepEqual(await readPng(file), source);
  fs.writeFileSync(file, uncompressed);
  const indexed = await optimizePreview(file, { indexed: true, reservedColors: ['#0e0e10', '#9146ff'] });
  assert.ok(indexed.after < indexed.before);
  const decoded = await readPng(file);
  assert.equal(decoded.width, source.width); assert.equal(decoded.height, source.height);
  source.colors.forEach((color, i) => {
    if ([0x0e0e10, 0x9146ff].includes(color)) assert.equal(decoded.colors[i], color);
  });
});

test('Sharp GIF encoding retains two distinct frames, timing, looping, and theme pixels', async t => {
  const dir = fixture(t), before = path.join(dir, 'before.png'), after = path.join(dir, 'after.png');
  await image(before, [14, 14, 16]); await image(after, [24, 24, 27]);
  const output = path.join(dir, 'preview.gif');
  await encodePreviews(before, after, output, ['#0e0e10', '#18181b', '#9146ff']);
  const metadata = await sharp(output, { animated: true }).metadata();
  assert.equal(metadata.pages, 2); assert.equal(metadata.loop, 0);
  assert.deepEqual(metadata.delay, [3000, 3000]);
  const frames = await Promise.all([0, 1].map(page => readFrame(output, page)));
  assert.notDeepEqual(frames[0], frames[1]);
  for (const [index, file] of [before, after].entries()) {
    const original = await readPng(file);
    assert.equal(frames[index].length, original.colors.length * 4);
    original.colors.forEach((color, i) => {
      if ([0x0e0e10, 0x18181b, 0x9146ff].includes(color)) {
        assert.equal(frames[index][i * 4] << 16 | frames[index][i * 4 + 1] << 8 | frames[index][i * 4 + 2], color);
      }
    });
  }
});

async function readFrame(file, page) {
  return sharp(file, { page, pages: 1 }).ensureAlpha().raw().toBuffer();
}

test('preview reader rejects transparency and GIF encoder rejects unequal dimensions', async t => {
  const dir = fixture(t), file = path.join(dir, 'transparent.png');
  await sharp({ create: { width: 3, height: 3, channels: 4, background: '#00000000' } }).png().toFile(file);
  await assert.rejects(readPng(file), /opaque screenshot/);
  const other = path.join(dir, 'other.png');
  await image(other, [14, 14, 16]);
  await assert.rejects(encodePreviews(file, other, path.join(dir, 'invalid.gif')));
});
