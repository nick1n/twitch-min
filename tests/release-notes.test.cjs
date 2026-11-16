const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseNotes } = require('../scripts/release-notes.cjs');

test('release notes preserve newest entry Markdown and exclude older history', () => {
  const entry = '## 1.2.0 - Downloads\n\n- Keep **formatting**.\n  Continued line.\n\n### Details\n\nA link: [docs](https://example.com).';
  for (const newline of ['\n', '\r\n']) {
    const changelog = `# Changelog\n\n${entry}\n\n## 1.1.0 - Older\n\n- Old change.\n`.replaceAll('\n', newline);
    assert.equal(releaseNotes(changelog, '1.2.0'), entry.replaceAll('\n', newline) + '\n');
  }
});

test('release notes reject missing, stale, or empty newest entries', () => {
  for (const changelog of ['', '## 1.1.0 - Old\n\n- Old.', '## 1.3.0 - New\n\n- New.\n\n## 1.2.0 - Current\n\n- Current.']) {
    assert.throws(() => releaseNotes(changelog, '1.2.0'), /newest changelog entry must match/);
  }
  assert.throws(() => releaseNotes('## 1.2.0 - Empty\n\n## 1.1.0 - Old\n\n- Old.', '1.2.0'), /must not be empty/);
});
