const assert = require('node:assert/strict');
const sharp = require('sharp');
const previewPixels = require('./preview-pixels.cjs');
const { readPixels } = require('./png.cjs');

module.exports = async function encodePreviews(before, after, output, reservedColors = []) {
  const images = await Promise.all([before, after].map(readPixels));
  const { width, height } = images[0];
  assert.equal(images[1].width, width);
  assert.equal(images[1].height, height);
  const pixels = await previewPixels(Buffer.concat(images.map(image => image.data)),
    { width, height: height * 2, channels: 4 }, reservedColors);
  await sharp(pixels, {
    raw: { width, height: height * 2, channels: 4, pageHeight: height },
  }).gif({ loop: 0, delay: [3000, 3000], colours: 256, dither: 0, effort: 10,
    interFrameMaxError: 0, interPaletteMaxError: 0 }).toFile(output);
};
