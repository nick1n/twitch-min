const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readZip } = require('../scripts/zip.cjs');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const version = manifest.version;
const archiveName = `twitch-min-${version}.zip`;
const oldRelease = Buffer.from('previous release must survive failed packaging');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'twitch-min-package-'));
  t.after(() => {
    // Resolve and verify absolute containment before any recursive deletion.
    const target = fs.realpathSync(dir);
    const relative = path.relative(parent, target);
    assert.ok(path.isAbsolute(target) && relative && !path.isAbsolute(relative));
    assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep));
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith('twitch-min-package-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const file of ['package.cjs', 'zip.cjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(dir, 'scripts', file));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'));
  fs.cpSync(path.join(root, 'extension'), path.join(dir, 'extension'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist', archiveName), oldRelease);
  fs.writeFileSync(path.join(dir, 'dist/unrelated.zip'), 'unrelated output');
  fs.mkdirSync(path.join(dir, '.browser-tests'));
  fs.writeFileSync(path.join(dir, '.browser-tests/private.html'), 'private snapshot');
  return dir;
}

function run(dir) {
  const result = spawnSync(process.execPath, [path.join(dir, 'scripts/package.cjs')], {
    cwd: dir, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.ifError(result.error);
  return result;
}

function assertPreserved(dir) {
  assert.equal(fs.readFileSync(path.join(dir, 'dist/unrelated.zip'), 'utf8'), 'unrelated output');
  assert.equal(fs.readFileSync(path.join(dir, '.browser-tests/private.html'), 'utf8'), 'private snapshot');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist')).sort(), [archiveName, 'unrelated.zip'].sort());
}

test('packaging replaces stale output with all source files at ZIP root, byte for byte', t => {
  const dir = fixture(t);
  fs.mkdirSync(path.join(dir, 'extension/nested'));
  fs.writeFileSync(path.join(dir, 'extension/nested/.binary'), Buffer.from([0, 1, 128, 255]));
  fs.writeFileSync(path.join(dir, 'extension/nested/café.txt'), 'UTF-8 filename');
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(archiveName));
  const entries = readZip(fs.readFileSync(path.join(dir, 'dist', archiveName)));
  const source = path.join(dir, 'extension');
  const names = fs.readdirSync(source, { recursive: true }).filter(name => fs.statSync(path.join(source, name)).isFile());
  assert.deepEqual(entries.map(entry => entry.name).sort(), [...names.map(name => name.split(path.sep).join('/')), 'LICENSE'].sort());
  for (const entry of entries) {
    const file = entry.name === 'LICENSE' ? path.join(dir, 'LICENSE') : path.join(source, entry.name);
    assert.deepEqual(entry.data, fs.readFileSync(file), entry.name);
  }
  const manifest = JSON.parse(Buffer.from(entries.find(entry => entry.name === 'manifest.json').data, 'base64'));
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.twitch.tv/*', 'https://twitch.tv/*']);
  assertPreserved(dir);
});

test('Node icon generator preserves the former Python raster algorithm', t => {
  const dir = fixture(t);
  fs.copyFileSync(path.join(root, 'scripts/generate-icons.cjs'), path.join(dir, 'scripts/generate-icons.cjs'));
  const result = spawnSync(process.execPath, [path.join(dir, 'scripts/generate-icons.cjs')], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  // Hash decoded scanlines, independent of zlib compression choices.
  const expected = {
    16: 'c6fc632c88437f93f0e75db98498866a69d86235aace0103efa556e9566ea140',
    32: 'aa98c0b9f2206290d0f791403a01c84f6515c0bd63531e42b31e31b69d9b5bdf',
    48: '77ac0422beaf62cbd58c93d5bbbf3643c1678dcfdcc08c0b7bfe86a9b96e0c01',
    128: '82b5438361af13e93bf38f0420a50185dbe7a26814fb2f3540301987dfa4a9ae',
  };
  for (const [size, hash] of Object.entries(expected)) {
    const bytes = fs.readFileSync(path.join(dir, `extension/icons/icon${size}.png`));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const parts = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      const type = bytes.subarray(offset + 4, offset + 8);
      assert.equal(require('node:zlib').crc32(Buffer.concat([type, data])), bytes.readUInt32BE(offset + 8 + length));
      if (type.toString() === 'IHDR') {
        assert.equal(data.readUInt32BE(0), Number(size));
        assert.equal(data.readUInt32BE(4), Number(size));
        assert.equal(data[8], 8); assert.equal(data[9], 6);
      }
      if (type.toString() === 'IDAT') parts.push(data);
      offset += length + 12;
    }
    const pixels = require('node:zlib').inflateSync(Buffer.concat(parts));
    assert.equal(require('node:crypto').createHash('sha256').update(pixels).digest('hex'), hash);
  }
});

test('packaging rejects a missing license and preserves the previous release', t => {
  const dir = fixture(t);
  fs.unlinkSync(path.join(dir, 'LICENSE'));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('LICENSE'), result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
  assertPreserved(dir);
});

function referencedAssets(manifest) {
  const popup = manifest.action.default_popup;
  const html = fs.readFileSync(path.join(root, 'extension', popup), 'utf8');
  const popupAssets = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(asset => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(asset))
    .map(asset => path.posix.normalize(path.posix.join(path.posix.dirname(popup), asset)));
  const icons = value => typeof value === 'string' ? [value] : Object.values(value || {});
  return [...new Set([
    ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])]),
    popup, ...icons(manifest.icons), ...icons(manifest.action.default_icon), ...popupAssets,
  ])];
}

for (const asset of referencedAssets(manifest)) {
  test('packaging rejects missing ' + asset + ' and preserves the previous release', t => {
    const dir = fixture(t);
    fs.unlinkSync(path.join(dir, 'extension', asset));
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(asset), result.stderr);
    assert.ok(!result.stdout.includes(archiveName));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
    assertPreserved(dir);
  });
}

test('packaging rejects a package/manifest version mismatch', t => {
  const dir = fixture(t);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  pkg.version = version === '0.0.0' ? '0.0.1' : '0.0.0';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /versions must agree/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
  assertPreserved(dir);
});

test('archive validation rejects same-name corruption and cleans its temporary ZIP', t => {
  const dir = fixture(t);
  const script = path.join(dir, 'scripts/package.cjs');
  const source = fs.readFileSync(script, 'utf8');
  const marker = '  const entries = readZip(fs.readFileSync(temporaryArchive));';
  assert.equal(source.split(marker).length, 2);
  // Replace one entry with a valid ZIP containing different bytes before validation.
  fs.writeFileSync(script, source.replace(marker, `
  const damaged = readZip(fs.readFileSync(temporaryArchive));
  damaged.find(entry => entry.name === 'shared/runtime.js').data = Buffer.from('corrupted module');
  fs.writeFileSync(temporaryArchive, createZip(damaged));
${marker}`));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Archive content differs from source: shared\/runtime.js/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
  assertPreserved(dir);
});
