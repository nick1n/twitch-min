const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  fs.copyFileSync(path.join(root, 'scripts/package.ps1'), path.join(dir, 'scripts/package.ps1'));
  fs.copyFileSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  fs.cpSync(path.join(root, 'extension'), path.join(dir, 'extension'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'));
  fs.writeFileSync(path.join(dir, 'dist', archiveName), oldRelease);
  fs.writeFileSync(path.join(dir, 'dist/unrelated.zip'), 'unrelated output');
  fs.mkdirSync(path.join(dir, '.browser-tests'));
  fs.writeFileSync(path.join(dir, '.browser-tests/private.html'), 'private snapshot');
  return dir;
}

function powershell(args, cwd) {
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
    cwd, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.ifError(result.error);
  return result;
}

function run(dir) {
  return powershell(['-File', path.join(dir, 'scripts/package.ps1')], dir);
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
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(archiveName));
  const inspect = powershell(['-Command', `
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path (Get-Location) 'dist/${archiveName}'))
    try {
      $files = @($zip.Entries | ForEach-Object {
        $stream = $_.Open(); $bytes = [IO.MemoryStream]::new()
        try { $stream.CopyTo($bytes); @{ name = $_.FullName; data = [Convert]::ToBase64String($bytes.ToArray()) } }
        finally { $stream.Dispose(); $bytes.Dispose() }
      })
      ConvertTo-Json -InputObject $files -Compress
    } finally { $zip.Dispose() }
  `], dir);
  assert.equal(inspect.status, 0, inspect.stderr);
  const entries = JSON.parse(inspect.stdout);
  const source = path.join(dir, 'extension');
  const names = fs.readdirSync(source, { recursive: true }).filter(name => fs.statSync(path.join(source, name)).isFile());
  assert.deepEqual(entries.map(entry => entry.name).sort(), names.map(name => name.split(path.sep).join('/')).sort());
  for (const entry of entries) {
    assert.deepEqual(Buffer.from(entry.data, 'base64'), fs.readFileSync(path.join(source, entry.name)), entry.name);
  }
  const manifest = JSON.parse(Buffer.from(entries.find(entry => entry.name === 'manifest.json').data, 'base64'));
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.twitch.tv/*', 'https://twitch.tv/*']);
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
  const script = path.join(dir, 'scripts/package.ps1');
  const source = fs.readFileSync(script, 'utf8');
  const marker = '    $zip = [IO.Compression.ZipFile]::OpenRead($temporaryArchive)';
  assert.equal(source.split(marker).length, 2);
  // Fault injection in the disposable script retains names but changes bytes
  // after archive creation, before the production content validator runs.
  fs.writeFileSync(script, source.replace(marker, `
    $damaged = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Update)
    try {
        $damaged.GetEntry('shared/runtime.js').Delete()
        $writer = [IO.StreamWriter]::new($damaged.CreateEntry('shared/runtime.js').Open())
        try { $writer.Write('corrupted module') } finally { $writer.Dispose() }
    } finally { $damaged.Dispose() }
${marker}`));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Archive content differs from source: shared\/runtime.js/);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'dist', archiveName)), oldRelease);
  assertPreserved(dir);
});
