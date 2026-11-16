const assert = require('node:assert/strict');
const sharp = require('sharp');

async function readPixels(file) {
  const { data, info } = await sharp(file).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, 'opaque screenshot');
  return { width: info.width, height: info.height, data };
}

function pixelColors({ width, height, data }) {
  const colors = new Uint32Array(width * height);
  for (let i = 0; i < colors.length; i++) {
    colors[i] = data[i * 4] << 16 | data[i * 4 + 1] << 8 | data[i * 4 + 2];
  }
  return { width, height, colors };
}

async function readPng(file) {
  return pixelColors(await readPixels(file));
}

module.exports = { readPixels, pixelColors, readPng };
