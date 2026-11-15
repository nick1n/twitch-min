// Correlate Fetch pauses with network and document lifetimes, including events
// delivered before their pause. Only confirmed cancellation excuses a stale ID.
module.exports = function createInterceptions({ send, handle, cancellationTimeoutMs = 1000 }) {
  const networks = new Map(), terminal = new Map(), active = new Set();
  const frames = new Map(), retiredLoaders = new Set(), detachedFrames = new Set();
  const fetchMethods = new Set(['Fetch.continueRequest', 'Fetch.fulfillRequest', 'Fetch.failRequest']);
  let failure, disposed = false;

  function remember(collection, key, value) {
    collection.delete(key);
    if (collection instanceof Map) collection.set(key, value);
    else collection.add(key);
    while (collection.size > 256) collection.delete(collection.keys().next().value);
  }

  function network(id) {
    if (!id) return null;
    let record = networks.get(id) || terminal.get(id);
    if (!record) {
      record = { requests: new Set(), cancelled: false };
      networks.set(id, record);
    }
    return record;
  }

  function cancel(record) {
    record.cancelled = true;
    for (const request of record.requests) request.cancel(true);
  }

  function obsolete(record) {
    return detachedFrames.has(record.frameId) ||
      (record.loaderId && retiredLoaders.has(`${record.frameId}:${record.loaderId}`));
  }

  function check() { if (failure) throw failure; }
  function records() { return new Set([...networks.values(), ...terminal.values(), ...[...active].map(request => request.record)]); }

  function event({ method, params }) {
    if (disposed) return;
    if (method === 'Network.requestWillBeSent') {
      const record = network(params.requestId);
      record.frameId = params.frameId;
      record.loaderId = params.loaderId;
      if (obsolete(record)) cancel(record);
    } else if (method === 'Network.loadingFailed' || method === 'Network.loadingFinished') {
      const record = network(params.requestId);
      record.terminal = true;
      if (params.canceled || params.errorText === 'net::ERR_ABORTED') cancel(record);
      if (!record.requests.size) networks.delete(params.requestId);
      remember(terminal, params.requestId, record);
    } else if (method === 'Page.frameNavigated') {
      const { id, loaderId } = params.frame;
      const old = frames.get(id);
      if (old && old !== loaderId) remember(retiredLoaders, `${id}:${old}`);
      frames.set(id, loaderId);
      detachedFrames.delete(id);
      for (const record of records()) if (obsolete(record)) cancel(record);
    } else if (method === 'Page.frameDetached') {
      const old = frames.get(params.frameId);
      if (old) remember(retiredLoaders, `${params.frameId}:${old}`);
      frames.delete(params.frameId);
      remember(detachedFrames, params.frameId);
      for (const record of records()) if (record.frameId === params.frameId) cancel(record);
    } else if (method === 'Fetch.requestPaused') {
      const { requestId, networkId, frameId } = params;
      const record = network(networkId) || { requests: new Set(), frameId, cancelled: false };
      record.frameId ||= frameId;
      let resolveCancellation;
      const request = { record, cancelled: new Promise(resolve => { resolveCancellation = resolve; }), cancel: resolveCancellation };
      if (networkId) networks.set(networkId, record);
      record.requests.add(request);
      active.add(request);
      if (record.cancelled || obsolete(record)) cancel(record);
      const sendRequest = async (command, options) => {
        try { return await send(command, options); }
        catch (error) {
          if (fetchMethods.has(command) && options?.requestId === requestId && /^Invalid InterceptionId\.?$/.test(error.message)) {
            let timer;
            const confirmed = await Promise.race([request.cancelled,
              new Promise(resolve => { timer = setTimeout(() => resolve(false), cancellationTimeoutMs); })]);
            clearTimeout(timer);
            if (confirmed) return {};
          }
          throw error;
        }
      };
      request.done = Promise.resolve().then(() => handle(params, sendRequest)).catch(async error => {
        if (disposed) return;
        failure ||= new Error(`Fixture request failed: ${params.request.url}: ${error.message}`, { cause: error });
        await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
      }).finally(() => {
        record.requests.delete(request);
        active.delete(request);
        if (record.terminal && !record.requests.size && networks.get(networkId) === record) networks.delete(networkId);
      });
    }
  }

  return {
    event,
    check,
    async drain() {
      while (active.size) await Promise.all([...active].map(request => request.done));
      check();
    },
    dispose() {
      disposed = true;
      for (const request of active) request.cancel(false);
      networks.clear(); terminal.clear(); frames.clear(); retiredLoaders.clear(); detachedFrames.clear();
    }
  };
};
