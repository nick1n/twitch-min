// Browser-only Chrome API fixture. Product files never include this script.
globalThis.__stored = {};
globalThis.__writes = [];
globalThis.__listeners = [];
globalThis.__readError = false;
globalThis.__writeError = false;
globalThis.__storagePatch = (patch, area = "local") => {
  const changes = {};
  for (const [key, newValue] of Object.entries(patch)) {
    changes[key] = { oldValue: __stored[key], newValue };
    if (area === "local") {
      if (newValue === undefined) delete __stored[key];
      else __stored[key] = newValue;
    }
  }
  __listeners.forEach(listener => listener(changes, area));
};
globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    onChanged: { addListener: listener => __listeners.push(listener) },
    local: {
      get(defaults, callback) {
        const result = { ...defaults, ...__stored };
        if (callback) {
          queueMicrotask(() => {
            chrome.runtime.lastError = __readError ? { message: "Test read error" } : null;
            callback(result);
            chrome.runtime.lastError = null;
          });
          return;
        }
        return __readError ? Promise.reject(new Error("Test read error")) : Promise.resolve(result);
      },
      set(patch, callback) {
        __writes.push(patch);
        queueMicrotask(() => {
          if (!__writeError) __storagePatch(patch);
          chrome.runtime.lastError = __writeError ? { message: "Test write error" } : null;
          callback?.();
          chrome.runtime.lastError = null;
        });
      }
    }
  }
};
