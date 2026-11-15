// Small dependency-free encoder for opaque Chrome screenshots, with a shared palette.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');

function readPng(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height, channels;
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, '8-bit screenshot');
      assert.ok(data[9] === 2 || data[9] === 6, 'RGB or RGBA screenshot');
      assert.equal(data[12], 0, 'non-interlaced screenshot');
      channels = data[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  assert.equal(raw.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, 'supported PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const diagonal = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = left + up - diagonal;
      const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - diagonal)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : diagonal;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[y * stride + x] = raw[y * (stride + 1) + x + 1] + prediction;
    }
  }
  const colors = new Uint32Array(width * height);
  for (let i = 0; i < colors.length; i++) {
    const offset = i * channels;
    if (channels === 4) assert.equal(pixels[offset + 3], 255, 'opaque screenshot');
    colors[i] = pixels[offset] << 16 | pixels[offset + 1] << 8 | pixels[offset + 2];
  }
  return { width, height, colors };
}

function makePalette(images) {
  const counts = new Map();
  for (const { colors } of images) for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const rgb = color => [color >>> 16, color >>> 8 & 255, color & 255];
  // Preserve flat UI colors exactly; use weighted median cut for antialiased edges.
  const palette = sorted.slice(0, 64).map(([color]) => rgb(color));
  const describe = entries => {
    const ranges = [0, 1, 2].map(axis => Math.max(...entries.map(e => e[axis])) - Math.min(...entries.map(e => e[axis])));
    const axis = ranges.indexOf(Math.max(...ranges));
    const weight = entries.reduce((sum, entry) => sum + entry[3], 0);
    return { entries, axis, weight, score: ranges[axis] * weight };
  };
  const buckets = sorted.length > 64 ? [describe(sorted.slice(64).map(([color, count]) => [...rgb(color), count]))] : [];
  while (palette.length + buckets.length < 256) {
    buckets.sort((a, b) => b.score - a.score);
    const bucket = buckets[0];
    if (!bucket || bucket.entries.length < 2) break;
    buckets.shift();
    bucket.entries.sort((a, b) => a[bucket.axis] - b[bucket.axis]);
    let total = 0, split = 0;
    while (split < bucket.entries.length - 1 && total < bucket.weight / 2) total += bucket.entries[split++][3];
    buckets.push(describe(bucket.entries.slice(0, split)), describe(bucket.entries.slice(split)));
  }
  for (const bucket of buckets) palette.push([0, 1, 2].map(axis => Math.round(bucket.entries.reduce((sum, entry) => sum + entry[axis] * entry[3], 0) / bucket.weight)));
  const lookup = new Map();
  for (const [color] of counts) {
    const target = rgb(color);
    let distance = Infinity, best = 0;
    palette.forEach((candidate, index) => {
      const next = candidate.reduce((sum, value, axis) => sum + (value - target[axis]) ** 2, 0);
      if (next < distance) { distance = next; best = index; }
    });
    lookup.set(color, best);
  }
  while (palette.length < 256) palette.push([0, 0, 0]);
  return { palette: Buffer.from(palette.flat()), lookup };
}

function lzw(indices) {
  let dictionary = new Map(), next = 258, prefix = indices[0];
  const codes = [256];
  for (let i = 1; i < indices.length; i++) {
    const symbol = indices[i], key = prefix * 256 + symbol;
    if (dictionary.has(key)) { prefix = dictionary.get(key); continue; }
    codes.push(prefix);
    if (next < 4096) dictionary.set(key, next++);
    else { codes.push(256); dictionary = new Map(); next = 258; }
    prefix = symbol;
  }
  codes.push(prefix, 257);
  // Pack using the decoder's dictionary progression, including its first-code delay.
  let bits = 9, codeCount = 258, previous = false, pending = 0, bitCount = 0;
  const output = [];
  for (const code of codes) {
    pending |= code << bitCount;
    bitCount += bits;
    while (bitCount >= 8) { output.push(pending & 255); pending >>>= 8; bitCount -= 8; }
    if (code === 256) { bits = 9; codeCount = 258; previous = false; }
    else if (code !== 257) {
      if (previous && codeCount < 4096 && ++codeCount === 2 ** bits && bits < 12) bits++;
      previous = true;
    }
  }
  if (bitCount) output.push(pending & 255);
  const blocks = [Buffer.from([8])];
  for (let offset = 0; offset < output.length; offset += 255) {
    const block = output.slice(offset, offset + 255);
    blocks.push(Buffer.from([block.length, ...block]));
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

function encodePreviews(before, after, output) {
  const images = [readPng(before), readPng(after)];
  const { width, height } = images[0];
  assert.equal(images[1].width, width);
  assert.equal(images[1].height, height);
  const { palette, lookup } = makePalette(images);
  const size = Buffer.alloc(4);
  size.writeUInt16LE(width); size.writeUInt16LE(height, 2);
  const parts = [Buffer.from('GIF89a'), size, Buffer.from([0xf7, 0, 0]), palette,
    Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0])];
  for (const image of images) {
    // Full frames, three seconds each, looping indefinitely.
    parts.push(Buffer.from([0x21, 0xf9, 4, 8, 44, 1, 0, 0, 0x2c, 0, 0, 0, 0]), size, Buffer.from([0]),
      lzw(Uint8Array.from(image.colors, color => lookup.get(color))));
  }
  parts.push(Buffer.from([0x3b]));
  fs.writeFileSync(output, Buffer.concat(parts));
}

module.exports = encodePreviews;
