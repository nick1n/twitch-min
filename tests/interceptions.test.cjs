const { test } = require('node:test');
const assert = require('node:assert/strict');
const createInterceptions = require('./support/interceptions.cjs');
const pause = { method: 'Fetch.requestPaused', params: { requestId: 'fetch', networkId: 'network', frameId: 'frame', request: { url: 'https://fixture.invalid/image' } } };
const failed = { method: 'Network.loadingFailed', params: { requestId: 'network', canceled: true } };
const metadata = { method: 'Network.requestWillBeSent', params: { requestId: 'network', frameId: 'frame', loaderId: 'old' } };
const frame = loaderId => ({ method: 'Page.frameNavigated', params: { frame: { id: 'frame', loaderId } } });
const turn = () => new Promise(resolve => setImmediate(resolve));

function tracker(handle, cancellationTimeoutMs = 1000) {
  return createInterceptions({ cancellationTimeoutMs,
    send: async command => { if (command === 'Fetch.fulfillRequest') throw new Error('Invalid InterceptionId.'); return {}; },
    handle: handle || ((params, send) => send('Fetch.fulfillRequest', { requestId: params.requestId }))
  });
}

test('cancelled network requests remain recognized when failure arrives before Fetch pause', async () => {
  const driver = tracker();
  driver.event(failed);
  driver.event(pause);
  await driver.drain();
  driver.dispose();
});

test('a cancellation delivered after the rejected response still settles its handler', async () => {
  const driver = tracker();
  driver.event(pause);
  await turn();
  driver.event(failed);
  await driver.drain();
  driver.dispose();
});

test('explicit ERR_ABORTED confirms cancellation when the optional flag is absent', async () => {
  const driver = tracker();
  driver.event({ method: 'Network.loadingFailed', params: { requestId: 'network', errorText: 'net::ERR_ABORTED' } });
  driver.event(pause);
  await driver.drain();
  driver.dispose();
});

test('committing a replacement document invalidates its old pending requests', async () => {
  const driver = tracker();
  driver.event(frame('old'));
  driver.event(metadata);
  driver.event(pause);
  driver.event(frame('new'));
  await driver.drain();
  driver.dispose();
});

test('late network metadata still associates a pause with a retired document', async () => {
  const driver = tracker();
  driver.event(frame('old'));
  driver.event(frame('new'));
  driver.event(pause);
  driver.event(metadata);
  await driver.drain();
  driver.dispose();
});

test('frame disposal cancels pending Fetch requests without a network ID', async () => {
  const driver = tracker();
  driver.event({ ...pause, params: { ...pause.params, networkId: undefined } });
  driver.event({ method: 'Page.frameDetached', params: { frameId: 'frame' } });
  await driver.drain();
  driver.dispose();
});

test('a swapped frame retains its retired loader identity for late request events', async () => {
  const driver = tracker();
  driver.event(frame('old'));
  driver.event({ method: 'Page.frameDetached', params: { frameId: 'frame', reason: 'swap' } });
  driver.event(frame('new'));
  driver.event(pause);
  driver.event(metadata);
  await driver.drain();
  driver.dispose();
});

for (const scenario of ['another request cancelled', 'another frame navigated', 'request finished successfully']) {
  test(`${scenario} does not excuse a genuine interception error`, async () => {
    const driver = tracker(undefined, 30);
    if (scenario === 'another request cancelled') driver.event({ ...failed, params: { ...failed.params, requestId: 'other' } });
    if (scenario === 'another frame navigated') {
      driver.event(frame('old'));
      driver.event(metadata);
      driver.event({ method: 'Page.frameNavigated', params: { frame: { id: 'other', loaderId: 'new' } } });
    }
    if (scenario === 'request finished successfully') driver.event({ method: 'Network.loadingFinished', params: { requestId: 'network' } });
    driver.event(pause);
    await assert.rejects(driver.drain(), /Fixture request failed:.*Invalid InterceptionId/);
    driver.dispose();
  });
}

test('a confirmed cancellation never excuses a handler using the wrong Fetch ID', async () => {
  const driver = tracker((_params, send) => send('Fetch.fulfillRequest', { requestId: 'wrong-id' }));
  driver.event(failed);
  driver.event(pause);
  await assert.rejects(driver.drain(), /Fixture request failed:.*Invalid InterceptionId/);
  driver.dispose();
});

test('disposal releases pending cancellation waits without reporting teardown errors', async () => {
  const driver = tracker();
  driver.event(pause);
  await turn();
  driver.dispose();
  await driver.drain();
});
