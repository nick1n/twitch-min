const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');
const { readPixels, pixelColors, readPng } = require('./png.cjs');
const previewPixels = require('./preview-pixels.cjs');

module.exports = async function optimizePreview(file, { indexed = false, reservedColors = [] } = {}) {
  const original = fs.readFileSync(file);
  const pixels = await readPixels(original);
  const source = pixelColors(pixels);
  const raw = { width: pixels.width, height: pixels.height, channels: 4 };
  let data = pixels.data;
  if (indexed) {
    data = await previewPixels(data, raw, reservedColors);
  }
  const optimized = await sharp(data, { raw }).png({ compressionLevel: 9, adaptiveFiltering: !indexed,
    palette: indexed, colours: 256, dither: 0, effort: 10 }).toBuffer();
  const decoded = await readPng(optimized);
  assert.equal(decoded.width, source.width);
  assert.equal(decoded.height, source.height);
  if (!indexed) assert.deepEqual(decoded.colors, source.colors, 'lossless PNG pixels');
  else {
    const exact = new Set(reservedColors.map(color => Number.parseInt(color.slice(1), 16)));
    assert.ok(!source.colors.some((color, index) => exact.has(color) && decoded.colors[index] !== color),
      'PNG preserves every theme pixel');
  }
  if (optimized.length < original.length) fs.writeFileSync(file, optimized);
  return { before: original.length, after: fs.statSync(file).size };
};
