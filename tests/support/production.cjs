const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const content = manifest.content_scripts[0];
const marker = '<!-- twitch-min:production -->';

function fixtureHTML(source) {
  const tags = [
    ...content.css.map(file => `<link rel="stylesheet" href="../../extension/${file}">`),
    ...content.js.map(file => `<script src="../../extension/${file}" defer></script>`)
  ].join('\n');
  return source.replace(marker, tags);
}

// Serve fixtures in production dependency order without a server or generated files.
// All remote requests are either fulfilled locally or blocked, including snapshot imports.
async function intercept({ requestId, request }, send) {
  if (request.url.startsWith('file:')) {
    const file = fileURLToPath(new URL(request.url));
    const relative = path.relative(path.join(root, 'tests/fixtures'), file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && file.endsWith('.html')) {
      return send('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from(fixtureHTML(fs.readFileSync(file, 'utf8'))).toString('base64')
      });
    }
    return send('Fetch.continueRequest', { requestId });
  }
  if (request.url.startsWith('https://static-cdn.jtvnw.net/emoticons/')) {
    const fails = request.url.includes('unavailable') || (request.url.includes('missing-large') && request.url.endsWith('/3.0'));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112"><rect width="112" height="112" fill="purple"/></svg>';
    return send('Fetch.fulfillRequest', {
      requestId, responseCode: fails ? 404 : 200,
      responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }],
      body: Buffer.from(fails ? '' : svg).toString('base64')
    });
  }
  return send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
}

const initSource = fs.readFileSync(path.join(root, 'tests/mock-storage.cjs'), 'utf8');

module.exports = { initSource, root, manifest, content, marker, fixtureHTML, intercept };
