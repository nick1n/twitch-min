// Generate nearest-neighbor PNGs from the logo's native 32px grid.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const output = path.resolve(__dirname, '../extension/icons');
fs.mkdirSync(output, { recursive: true });
async function generate() {
  const svg = fs.readFileSync(path.join(output, 'logo.svg'), 'utf8')
    .replace('<svg ', '<svg shape-rendering="crispEdges" ');
  // Sample just left of each center to preserve pixels on diagonal boundaries.
  const raster = await sharp(Buffer.from(svg)).resize(320, 320).ensureAlpha().raw().toBuffer();
  const source = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const offset = ((y * 10 + 5) * 320 + x * 10 + 4) * 4;
    raster.copy(source, (y * 32 + x) * 4, offset, offset + 4);
  }
  for (const size of [16, 32, 48, 128]) {
    // Keep the logo's reviewed center-sampled grid, including fractional scales.
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sourceOffset = (Math.floor((y + 0.5) * 32 / size) * 32 + Math.floor((x + 0.5) * 32 / size)) * 4;
      source.copy(pixels, (y * size + x) * 4, sourceOffset, sourceOffset + 4);
    }
    await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png()
      .toFile(path.join(output, `icon${size}.png`));
  }
}
generate().catch(error => { console.error(error); process.exitCode = 1; });
