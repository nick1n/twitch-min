// Opaque 8-bit PNG reader shared by preview encoding and lossless optimization.
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

module.exports = { readPng };
