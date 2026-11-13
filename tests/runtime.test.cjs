const test = require('node:test');
const assert = require('node:assert/strict');
require('../extension/runtime.js');

test('failed lifecycle work cleans up and retries only after cleanup succeeds', () => {
  let allocated = 0, attempts = 0, failCleanup = true, failUpdate = true;
  const feature = TwitchMinRuntime.create({
    attach() { allocated++; if (++attempts === 1) throw Error('attach'); },
    update() { if (failUpdate) { failUpdate = false; throw Error('update'); } },
    dispose() { if (failCleanup) throw Error('cleanup'); allocated--; }
  });
  const settings = { enabled: true };
  assert.throws(() => feature.update(settings), AggregateError);
  assert.throws(() => feature.update(settings), /cleanup/);
  assert.equal(attempts, 1);
  failCleanup = false;
  feature.update(settings);
  assert.equal(allocated, 1);
  assert.throws(() => feature.update(settings), /update/);
  assert.equal(allocated, 0);
  feature.update(settings);
  assert.equal(allocated, 1);
  feature.dispose();
  assert.equal(allocated, 0);
});
