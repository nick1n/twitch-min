const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { unzipSync } = require('fflate');
const sharp = require('sharp');
const readZip = bytes => Object.entries(unzipSync(bytes)).map(([name, data]) => ({ name, data: Buffer.from(data) }));
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
  fs.copyFileSync(path.join(root, 'scripts/package.cjs'), path.join(dir, 'scripts/package.cjs'));
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
    env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
  });
  assert.ifError(result.error);
  return result;
}

function assertPreserved(dir) {
  assert.equal(fs.readFileSync(path.join(dir, 'dist/unrelated.zip'), 'utf8'), 'unrelated output');
  assert.equal(fs.readFileSync(path.join(dir, '.browser-tests/private.html'), 'utf8'), 'private snapshot');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist')).sort(), [archiveName, 'unrelated.zip'].sort());
}

for (const markup of ['<script src="URL"></script>', '<link rel="stylesheet" href="URL">', '<img src="URL">']) {
  test(`packaging still rejects remote popup assets: ${markup.split(' ')[0].slice(1)}`, t => {
    const dir = fixture(t);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    fs.appendFileSync(path.join(dir, 'extension', manifest.action.default_popup), markup.replace('URL', pkg.bugs.url));
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid popup asset/);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
    assertPreserved(dir);
  });
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
  const manifest = JSON.parse(entries.find(entry => entry.name === 'manifest.json').data);
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.twitch.tv/*', 'https://twitch.tv/*']);
  assertPreserved(dir);
});

test('Sharp icon generation preserves the reviewed raster pixels', async t => {
  const dir = fixture(t);
  fs.copyFileSync(path.join(root, 'scripts/generate-icons.cjs'), path.join(dir, 'scripts/generate-icons.cjs'));
  const result = spawnSync(process.execPath, [path.join(dir, 'scripts/generate-icons.cjs')], { encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') } });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  // Hash decoded RGBA pixels, independent of zlib compression choices.
  const expected = {
    16: '4068531703b81051ed1b72ae34090c9e8ff159058bb13ce120605ce804b6fe78',
    32: 'aa34980b2a1767a699f037bf848e97c920e272138872ba7be06b8d666568f470',
    48: 'b3e1ff304eb373fb702c81bb0be54cdebba86b8477c952fdaee681823f1ee6db',
    128: 'c1d3c45d71653f7266e9c06580351af87f28cd497d28aa21632539ff8395c379',
  };
  for (const [size, hash] of Object.entries(expected)) {
    const { data, info } = await sharp(path.join(dir, `extension/icons/icon${size}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, Number(size)); assert.equal(info.height, Number(size));
    assert.equal(require('node:crypto').createHash('sha256').update(data).digest('hex'), hash);
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
  const marker = '  const entries = Object.entries(unzipSync(fs.readFileSync(temporaryArchive)))';
  assert.equal(source.split(marker).length, 2);
  // Replace one entry with a valid ZIP containing different bytes before validation.
  fs.writeFileSync(script, source.replace(marker, `
  const damaged = unzipSync(fs.readFileSync(temporaryArchive));
  damaged['shared/runtime.js'] = Buffer.from('corrupted module');
  fs.writeFileSync(temporaryArchive, zipSync(damaged));
${marker}`));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Archive content differs from source: shared\/runtime.js/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
  assertPreserved(dir);
});
