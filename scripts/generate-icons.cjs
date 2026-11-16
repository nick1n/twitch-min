// Generate nearest-neighbor PNGs from the logo's native 32px grid.
const fs = require('node:fs');
const path = require('node:path');
const { crc32, deflateSync } = require('node:zlib');
const outer = [[4, 2], [28, 2], [28, 24], [16, 24], [10, 30], [10, 24], [4, 24]];
const inner = [[8, 6], [8, 20], [14, 20], [14, 21], [15, 20], [24, 20], [24, 6]];
function contains(x, y, polygon) {
  let inside = false, previous = polygon.at(-1);
  for (const current of polygon) {
    const [ax, ay] = previous, [bx, by] = current;
    if ((ay > y) !== (by > y) && x <= (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    previous = current;
  }
  return inside;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
const source = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) =>
  contains(x + 0.5, y + 0.5, inner) ? [255, 255, 255, 255] :
    contains(x + 0.5, y + 0.5, outer) ? [145, 70, 255, 255] : [0, 0, 0, 0]));
const output = path.resolve(__dirname, '../extension/icons');
fs.mkdirSync(output, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(31, Math.floor((2 * y + 1) * 32 / (2 * size)));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(31, Math.floor((2 * x + 1) * 32 / (2 * size)));
      raw.set(source[sy][sx], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(output, `icon${size}.png`), Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
