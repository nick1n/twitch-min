// Small dependency-free encoder for opaque Chrome screenshots, with a shared palette.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readPng } = require('./png.cjs');

function makePalette(images, reservedColors) {
  const counts = new Map();
  for (const { colors } of images) for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const rgb = color => [color >>> 16, color >>> 8 & 255, color & 255];
  // Pin theme colors even when small icons use them less often than text edges.
  const exact = new Set(reservedColors.map(color => {
    assert.match(color, /^#[\da-f]{6}$/i, 'six-digit RGB palette color');
    return Number.parseInt(color.slice(1), 16);
  }));
  assert.ok(exact.size <= 64, 'leave palette space for screenshot colors');
  for (const [color] of sorted) {
    if (exact.size === 64) break;
    exact.add(color);
  }
  const palette = [...exact].map(rgb);
  const describe = entries => {
    const ranges = [0, 1, 2].map(axis => Math.max(...entries.map(e => e[axis])) - Math.min(...entries.map(e => e[axis])));
    const axis = ranges.indexOf(Math.max(...ranges));
    const weight = entries.reduce((sum, entry) => sum + entry[3], 0);
    return { entries, axis, weight, score: ranges[axis] * weight };
  };
  const remaining = sorted.filter(([color]) => !exact.has(color));
  const buckets = remaining.length ? [describe(remaining.map(([color, count]) => [...rgb(color), count]))] : [];
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

function encodePreviews(before, after, output, reservedColors = []) {
  const images = [readPng(before), readPng(after)];
  const { width, height } = images[0];
  assert.equal(images[1].width, width);
  assert.equal(images[1].height, height);
  const { palette, lookup } = makePalette(images, reservedColors);
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
