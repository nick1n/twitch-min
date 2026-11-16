// Shared palette quantization for GIFs and indexed PNG previews.
const assert = require('node:assert/strict');

function makePalette(images, reservedColors, limit = 256) {
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
  while (palette.length + buckets.length < limit) {
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

module.exports = makePalette;
