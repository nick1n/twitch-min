const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tagVersion } = require('../scripts/tag-version.cjs');
const baseVersion = require('../package.json').version;
const nextVersion = baseVersion.split('.').map((part, index, parts) => index === parts.length - 1 ? Number(part) + 1 : part).join('.');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'twitch-min-tag-'));
  const cwd = path.join(dir, 'checkout'), remote = path.join(dir, 'origin.git');
  t.after(() => {
    const target = fs.realpathSync(dir);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith('twitch-min-tag-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  fs.mkdirSync(cwd);
  function git(...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '--bare', remote);
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Tag fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  fs.mkdirSync(path.join(cwd, 'extension'));
  function commit(version, manifestVersion = version) {
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version }));
    fs.writeFileSync(path.join(cwd, 'extension/manifest.json'), JSON.stringify({ version: manifestVersion }));
    git('add', '.');
    git('commit', '--allow-empty', '-m', 'Fixture version');
    return git('rev-parse', 'HEAD');
  }
  const before = commit(baseVersion);
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main');
  const event = { before, deleted: false, repository: { default_branch: 'main' } };
  const eventPath = path.join(dir, 'event.json');
  const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: before, GITHUB_EVENT_PATH: eventPath };
  function run() {
    fs.writeFileSync(eventPath, JSON.stringify(event));
    return tagVersion(env, cwd);
  }
  function bump(version = nextVersion, manifestVersion = version) {
    env.GITHUB_SHA = commit(version, manifestVersion);
    git('push', 'origin', 'main');
  }
  const tags = () => git('ls-remote', '--refs', '--tags', remote);
  return { cwd, remote, env, event, git, run, bump, tags, before };
}

test('version bump tags exactly the tested default-branch SHA and safely reruns', t => {
  const f = fixture(t);
  f.bump();
  assert.match(f.run(), /^Created /);
  assert.equal(f.tags(), `${f.env.GITHUB_SHA}\trefs/tags/v${nextVersion}`);
  assert.match(f.run(), /already exists/);
  assert.equal(f.tags(), `${f.env.GITHUB_SHA}\trefs/tags/v${nextVersion}`);
});

test('a successful follow-up commit tags a version missed by a failed or cancelled run', t => {
  const f = fixture(t);
  f.bump();
  f.event.before = f.env.GITHUB_SHA;
  f.bump();
  assert.match(f.run(), /^Created /);
  assert.equal(f.tags(), `${f.env.GITHUB_SHA}\trefs/tags/v${nextVersion}`);
});

test('pull requests, non-default branches, tag pushes and deleted branches never tag', t => {
  const f = fixture(t);
  f.bump();
  f.env.GITHUB_EVENT_NAME = 'pull_request';
  assert.match(f.run(), /not a push/);
  f.env.GITHUB_EVENT_NAME = 'push';
  for (const ref of ['refs/heads/feature', `refs/tags/v${nextVersion}`]) {
    f.env.GITHUB_REF = ref;
    assert.match(f.run(), /not a default-branch push/);
  }
  f.env.GITHUB_REF = 'refs/heads/main';
  f.event.deleted = true;
  assert.match(f.run(), /not a default-branch push/);
  assert.equal(f.tags(), '');
});

test('existing remote version tags are never moved to newer commits', t => {
  const f = fixture(t);
  f.bump();
  f.git('push', 'origin', `${f.before}:refs/tags/v${nextVersion}`);
  assert.match(f.run(), /already exists/);
  assert.equal(f.tags(), `${f.before}\trefs/tags/v${nextVersion}`);
});

test('the first default-branch push can tag its initial version', t => {
  const f = fixture(t);
  f.event.before = '0'.repeat(40);
  assert.match(f.run(), /^Created /);
  assert.equal(f.tags(), `${f.before}\trefs/tags/v${baseVersion}`);
});

test('mismatched or malformed versions fail without creating tags', t => {
  const f = fixture(t);
  f.bump(nextVersion, baseVersion);
  assert.throws(f.run, /versions must agree/);
  f.bump('invalid-version');
  assert.throws(f.run, /valid extension version/);
  assert.equal(f.tags(), '');
});

test('a checkout that differs from the tested push is rejected', t => {
  const f = fixture(t);
  f.bump();
  f.env.GITHUB_SHA = f.before;
  assert.throws(f.run, /checkout must match/);
  assert.equal(f.tags(), '');
});

test('missing push SHAs and unavailable remotes fail instead of guessing a tag', t => {
  const f = fixture(t);
  f.bump();
  const sha = f.env.GITHUB_SHA;
  delete f.env.GITHUB_SHA;
  assert.throws(f.run, /push must identify its tested commit/);
  f.env.GITHUB_SHA = sha;
  f.git('remote', 'set-url', 'origin', path.join(f.cwd, 'missing.git'));
  assert.throws(f.run, /git ls-remote failed/);
  assert.equal(f.tags(), '');
});
