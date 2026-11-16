const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createZip, readZip } = require('./zip.cjs');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json')));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(manifest.version) || manifest.version !== pkg.version) {
  throw new Error('Package and manifest versions must agree and be a valid extension version.');
}
const hash = data => createHash('sha256').update(data).digest('hex');
const sources = new Map();
function snapshot(file, name) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`Source links are not supported: ${file}`);
  if (stat.isDirectory() && name !== 'LICENSE') {
    for (const child of fs.readdirSync(file)) snapshot(path.join(file, child), name ? `${name}/${child}` : child);
  } else {
    if (!stat.isFile()) throw new Error(`Source must be a regular file: ${file}`);
    const data = fs.readFileSync(file);
    sources.set(name, { data, hash: hash(data) });
  }
}
snapshot(sourceRoot, '');
snapshot(path.join(root, 'LICENSE'), 'LICENSE');
function assertAsset(name) {
  if (typeof name !== 'string' || !name.trim() || /[\\:?#]/.test(name) || name.startsWith('/') ||
      name.split('/').includes('..') || !sources.has(name)) throw new Error(`Missing or invalid extension asset: ${name}`);
}
const icons = value => typeof value === 'string' ? [value] : Object.values(value || {});
const assets = ['manifest.json', 'LICENSE',
  ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]),
  ...icons(manifest.icons), ...icons(manifest.action?.default_icon),
  manifest.background?.service_worker, ...(manifest.background?.scripts || []),
  manifest.options_page, manifest.options_ui?.page];
const popup = manifest.action?.default_popup;
if (popup) {
  assertAsset(popup); assets.push(popup);
  for (const match of sources.get(popup).data.toString('utf8').matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/[\\:?#]/.test(reference) || reference.startsWith('/')) throw new Error(`Invalid popup asset: ${reference}`);
    assets.push(path.posix.normalize(path.posix.join(path.posix.dirname(popup), reference)));
  }
}
for (const asset of assets) if (asset != null) assertAsset(asset);
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
const archive = path.join(output, `twitch-min-${manifest.version}.zip`);
const temporaryArchive = path.join(output, `.package-${randomUUID()}.zip`);
try {
  fs.writeFileSync(temporaryArchive, createZip([...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, source]) => ({ name, data: source.data }))), { flag: 'wx' });
  const entries = readZip(fs.readFileSync(temporaryArchive));
  if (entries.length !== sources.size) throw new Error('Archive file count differs from source.');
  const seen = new Set();
  for (const { name, data } of entries) {
    if (!sources.has(name) || seen.has(name)) throw new Error(`Unexpected archive entry: ${name}`);
    seen.add(name);
    if (hash(data) !== sources.get(name).hash) throw new Error(`Archive content differs from source: ${name}`);
  }
  for (const asset of assets) if (asset != null && !seen.has(asset)) throw new Error(`Missing archive asset: ${asset}`);
  if (JSON.parse(entries.find(entry => entry.name === 'manifest.json').data).version !== pkg.version) {
    throw new Error('Archived manifest version differs from package.');
  }
  fs.renameSync(temporaryArchive, archive);
  console.log(archive);
} finally {
  fs.rmSync(temporaryArchive, { force: true });
}
