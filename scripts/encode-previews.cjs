// Small dependency-free encoder for opaque Chrome screenshots, with a shared palette.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readPng } = require('./png.cjs');
const makePalette = require('./preview-palette.cjs');

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
  const { palette, lookup } = makePalette(images, reservedColors, 128);
  const size = Buffer.alloc(4);
  size.writeUInt16LE(width); size.writeUInt16LE(height, 2);
  const parts = [Buffer.from('GIF89a'), size, Buffer.from([0xf7, 0, 0]), palette,
    Buffer.from([0x21, 0xff, 11]), Buffer.from('NETSCAPE2.0'), Buffer.from([3, 1, 0, 0, 0])];
  let previous;
  for (const image of images) {
    const indices = Uint8Array.from(image.colors, color => lookup.get(color));
    let left = 0, top = 0, right = width - 1, bottom = height - 1, transparent = -1;
    if (previous) {
      // Keep the previous frame, writing only its changed bounding rectangle.
      const used = new Set(indices);
      transparent = Array.from({ length: 256 }, (_, index) => index).find(index => !used.has(index)) ?? -1;
      left = width; top = height; right = -1; bottom = -1;
      indices.forEach((index, offset) => {
        if (index === previous[offset]) return;
        const x = offset % width, y = Math.floor(offset / width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      });
      if (right < 0) left = top = right = bottom = 0;
    }
    const frameWidth = right - left + 1, frameHeight = bottom - top + 1;
    const frame = new Uint8Array(frameWidth * frameHeight);
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const source = (top + y) * width + left + x;
        frame[y * frameWidth + x] = previous && transparent >= 0 && indices[source] === previous[source]
          ? transparent : indices[source];
      }
    }
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(left, 1); descriptor.writeUInt16LE(top, 3);
    descriptor.writeUInt16LE(frameWidth, 5); descriptor.writeUInt16LE(frameHeight, 7);
    // Disposal 1 retains pixels under transparent areas. First frame fully resets each loop.
    parts.push(Buffer.from([0x21, 0xf9, 4, transparent >= 0 ? 5 : 4, 44, 1,
      transparent >= 0 ? transparent : 0, 0]), descriptor, lzw(frame));
    previous = indices;
  }
  parts.push(Buffer.from([0x3b]));
  fs.writeFileSync(output, Buffer.concat(parts));
}

module.exports = encodePreviews;
