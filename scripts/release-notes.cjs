const fs = require('node:fs');
const path = require('node:path');

function releaseNotes(changelog, version) {
  const sections = [...changelog.matchAll(/^## (\S+)[^\r\n]*\r?$/gm)];
  const current = sections[0];
  if (!current || current[1] !== version) {
    throw new Error('The newest changelog entry must match the release version.');
  }
  const end = sections[1]?.index ?? changelog.length;
  const body = changelog.slice(current.index + current[0].length, end).trim();
  if (!body) throw new Error('The release changelog entry must not be empty.');
  return changelog.slice(current.index, end).trim() + '\n';
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  process.stdout.write(releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version));
}

module.exports = { releaseNotes };
