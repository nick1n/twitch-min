// Dependency-free, lossless RGB PNG optimization for the generated screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { readPng } = require('./png.cjs');

function chunk(type, data) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function optimizePreview(file) {
  const original = fs.readFileSync(file);
  const { width, height, colors } = readPng(file);
  const stride = width * 3;
  const rgb = Buffer.alloc(stride * height);
  colors.forEach((color, index) => {
    rgb[index * 3] = color >>> 16;
    rgb[index * 3 + 1] = color >>> 8 & 255;
    rgb[index * 3 + 2] = color & 255;
  });
  // Test each fixed PNG filter and an adaptive signed-byte-cost filter.
  const candidates = Array.from({ length: 6 }, () => Buffer.alloc((stride + 1) * height));
  for (let y = 0; y < height; y++) {
    const rows = Array.from({ length: 5 }, () => Buffer.alloc(stride));
    const scores = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const offset = y * stride + x;
      const left = x >= 3 ? rgb[offset - 3] : 0;
      const up = y ? rgb[offset - stride] : 0;
      const diagonal = y && x >= 3 ? rgb[offset - stride - 3] : 0;
      const p = left + up - diagonal;
      const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - diagonal);
      const paeth = a <= b && a <= c ? left : b <= c ? up : diagonal;
      const predictors = [0, left, up, Math.floor((left + up) / 2), paeth];
      predictors.forEach((predictor, filter) => {
        const value = rgb[offset] - predictor & 255;
        rows[filter][x] = value;
        scores[filter] += Math.min(value, 256 - value);
      });
    }
    const adaptive = scores.indexOf(Math.min(...scores));
    candidates.forEach((candidate, index) => {
      const filter = index === 5 ? adaptive : index;
      const offset = y * (stride + 1);
      candidate[offset] = filter;
      rows[filter].copy(candidate, offset + 1);
    });
  }
  let compressed;
  for (const candidate of candidates) {
    for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE]) {
      const data = zlib.deflateSync(candidate, { level: 9, strategy });
      if (!compressed || data.length < compressed.length) compressed = data;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const optimized = Buffer.concat([original.subarray(0, 8), chunk('IHDR', header),
    chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
  if (optimized.length < original.length) fs.writeFileSync(file, optimized);
  const decoded = readPng(file);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual(decoded.colors, colors, 'lossless PNG optimization preserves every pixel');
  return { before: original.length, after: fs.statSync(file).size };
}

module.exports = optimizePreview;
