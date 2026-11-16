(() => {
  "use strict";

  const { DEFAULTS, ATTRIBUTES, normalize } = globalThis.TwitchMinSettings;
  const manifest = globalThis.chrome?.runtime?.getManifest?.();
  const logTag = `[${manifest?.name || 'twitch-min'} v${manifest?.version || 'unknown'}]`;
  const features = ['TwitchMinEmotes', 'TwitchMinLayout', 'TwitchMinTimestamps',
    'TwitchMinPlayer', 'TwitchMinChat', 'TwitchMinComposer'];
  // Keep ownership of this generation even after new scripts replace globals.
  const controllers = features.map(name => globalThis[name]);
  let settings = null;
  let root = null;
  let pendingChanges = {};
  let readingSettings = false;
  let applied = null;
  const featureApplied = new Map();
  const failedFeatures = new Set();
  let style = null;
  let rootObserver = null;
  let disposed = false;
  let retiring = null;

  async function dispose() {
    disposed = true;
    rootObserver?.disconnect();
    // Invalidated extension contexts may reject API access; DOM cleanup still runs.
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    const results = await Promise.allSettled(controllers.map(feature => {
      try { return feature?.retire ? feature.retire() : feature?.dispose(); }
      catch (error) { return Promise.reject(error); }
    }));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Previous extension session could not restore the page');
    style?.remove();
    for (const attribute of Object.values(ATTRIBUTES)) root?.removeAttribute(attribute);
    document.removeEventListener?.('twitch-min:retire', onRetire);
  }

  function onRetire() {
    if (!retiring) retiring = dispose().finally(() => { retiring = null; });
    retiring.then(
      () => document.dispatchEvent(new Event('twitch-min:retired')),
      () => document.dispatchEvent(new Event('twitch-min:retire-failed'))
    );
  }

  // DOM listeners survive extension-context invalidation on an update. Register
  // the handoff before any setup so even partially initialized sessions can retire.
  document.addEventListener?.('twitch-min:retire', onRetire);

  function apply(report = false) {
    if (disposed || !settings) return;
    if (!root) {
      if (report) console.info(`${logTag} Page: enable/disable is waiting for the document root.`);
      return;
    }
    const previousEnabled = applied?.enabled;
    for (const [key, attribute] of Object.entries(ATTRIBUTES)) {
      if (!applied || applied[key] !== settings[key]) root.setAttribute(attribute, String(settings[key]));
    }
    applied = { ...settings };
    for (const name of features) {
      const feature = controllers[features.indexOf(name)];
      if (!feature) continue;
      const previous = featureApplied.get(name);
      if (previous && Object.keys(DEFAULTS).every(key => previous[key] === settings[key])) continue;
      try {
        feature.update(settings);
        featureApplied.set(name, { ...settings });
        failedFeatures.delete(name);
      } catch (error) {
        featureApplied.delete(name);
        failedFeatures.add(name);
        console.warn(`${logTag} Page: feature ${name} failed to ${settings.enabled ? 'enable/update' : 'disable/restore'}.`, error);
      }
    }
    if (report) {
      console.info(`${logTag} Page: ${previousEnabled === settings.enabled ? 'enabled state unchanged; already' : 'applied'} ${settings.enabled ? 'enabled' : 'disabled'}.`,
        { failedFeatures: [...failedFeatures] });
    }
  }

  function mount() {
    root = document.documentElement;
    if (!root) return false;
    if (disposed) return true;
    style = document.createElement("style");
    style.id = "twitch-min-styles";
    style.setAttribute('data-tq-session', '');
    style.textContent = globalThis.TwitchMinRules.buildCSS();
    root.appendChild(style);
    apply(true);
    return true;
  }

  // document_start can precede <html>. Observe only until it exists, not Twitch's
  // chat mutations. CSS automatically matches elements added during navigation.
  if (!mount()) {
    rootObserver = new MutationObserver(() => {
      if (mount()) rootObserver.disconnect();
    });
    rootObserver.observe(document, { childList: true });
  }

  function onStorageChanged(changes, area) {
    if (disposed || area !== "local") return;
    const patch = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (Object.hasOwn(changes, key)) patch[key] = changes[key].newValue;
    }
    if (!Object.keys(patch).length) return;
    if (settings === null) {
      if (Object.hasOwn(patch, 'enabled')) console.info(`${logTag} Page: enable/disable is queued until preferences finish loading.`);
      pendingChanges = { ...pendingChanges, ...patch };
      readSettings();
      return;
    }
    settings = normalize({ ...settings, ...patch });
    apply(Object.hasOwn(patch, 'enabled'));
  }
  chrome.storage.onChanged.addListener(onStorageChanged);

  // A read-only acknowledgement distinguishes a saved popup setting from an
  // actual update in the active page.
  function pageStatus() {
    return {
      type: 'twitch-min:status',
      version: manifest?.version,
      ready: !disposed && settings !== null && root === document.documentElement && Boolean(style?.isConnected),
      enabled: settings?.enabled ?? null,
      appliedEnabled: root === document.documentElement ? root?.getAttribute(ATTRIBUTES.enabled) ?? null : null,
      stylesheetMounted: Boolean(style?.isConnected),
      failedFeatures: [...failedFeatures],
      missingFeatures: features.filter(name => !globalThis[name])
    };
  }
  function onMessage(message, sender, respond) {
    if (disposed || message?.type !== 'twitch-min:status') return;
    respond(pageStatus());
  }
  chrome.runtime?.onMessage?.addListener(onMessage);

  async function readSettings() {
    if (disposed || readingSettings || settings !== null) return;
    readingSettings = true;
    try {
      const raw = await chrome.storage.local.get(DEFAULTS);
      if (disposed) return;
      settings = normalize({ ...raw, ...pendingChanges });
      pendingChanges = {};
      apply(true);
    } catch (error) {
      // Leave Twitch usable until a later relevant storage event retries the read.
      // Retain queued changes, including a saved pause, across failed attempts.
      console.warn(`${logTag} Page: could not load preferences; enable/disable cannot apply until a relevant storage event retries the read.`, error);
    } finally {
      readingSettings = false;
    }
  }

  // executeScript awaits this result, so recovery confirms preferences applied,
  // rather than racing a second message against the initial storage read.
  return readSettings().then(pageStatus);
})();
