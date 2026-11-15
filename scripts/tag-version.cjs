const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function tagVersion(env = process.env, cwd = process.cwd()) {
  if (env.GITHUB_EVENT_NAME !== 'push') return 'Skip tagging: not a push.';
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const branch = event.repository?.default_branch;
  if (!branch || event.deleted || env.GITHUB_REF !== `refs/heads/${branch}`) {
    return 'Skip tagging: not a default-branch push.';
  }
  const read = file => JSON.parse(fs.readFileSync(path.join(cwd, file), 'utf8'));
  const { version } = read('package.json');
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version) || version !== read('extension/manifest.json').version) {
    throw new Error('Package and manifest versions must agree and be a valid extension version.');
  }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '')) {
    throw new Error('The push must identify its tested commit.');
  }
  function git(args, allowed = [0]) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    if (!allowed.includes(result.status)) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result;
  }
  if (git(['rev-parse', 'HEAD']).stdout.trim() !== env.GITHUB_SHA) {
    throw new Error('The checkout must match the tested push commit.');
  }
  // A bump's CI run may be cancelled or fail. The next successful run must
  // still tag that version, even if its immediate parent has the same version.
  const tag = `v${version}`;
  const ref = `refs/tags/${tag}`;
  const exists = () => git(['ls-remote', '--exit-code', '--refs', '--tags', 'origin', ref], [0, 2]).status === 0;
  if (exists()) return `Skip tagging: ${tag} already exists.`;
  // Push only this lightweight tag at the tested SHA. Never overwrite a tag or
  // publish other local refs. Checkout supplies the job-scoped GitHub credential.
  const push = git(['push', 'origin', `${env.GITHUB_SHA}:${ref}`], [0, 1, 128]);
  if (push.status !== 0) {
    // Another run may have created the tag after the check above.
    if (exists()) return `Skip tagging: ${tag} already exists.`;
    throw new Error(`Tag push failed: ${push.stderr.trim()}`);
  }
  return `Created ${tag} at ${env.GITHUB_SHA}.`;
}

if (require.main === module) {
  try { console.log(tagVersion()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { tagVersion };
