const assert = require('node:assert/strict');
const sharp = require('sharp');

// Let Sharp reduce edge shades, then restore the product's exact theme pixels.
// Lower the edge-shade quality to leave room for the exact theme colors.
module.exports = async function previewPixels(data, raw, reservedColors = []) {
  const exact = new Set(reservedColors.map(color => {
    assert.match(color, /^#[\da-f]{6}$/i, 'six-digit RGB theme color');
    return Number.parseInt(color.slice(1), 16);
  }));
  assert.ok(exact.size <= 64, 'leave palette space for screenshot colors');
  const indexed = await sharp(data, { raw }).png({ palette: true, quality: 80,
    dither: 0, effort: 10 }).toBuffer();
  const pixels = await sharp(indexed).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < data.length; i += 4) {
    const color = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
    if (exact.has(color)) data.copy(pixels, i, i, i + 4);
  }
  return pixels;
};
