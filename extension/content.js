(() => {
  "use strict";

  const { DEFAULTS, ATTRIBUTES, normalize } = globalThis.TwitchMinSettings;
  const manifest = globalThis.chrome?.runtime?.getManifest?.();
  const logTag = `[${manifest?.name || 'twitch-min'} v${manifest?.version || 'unknown'}]`;
  const features = ['TwitchMinEmotes', 'TwitchMinLayout', 'TwitchMinTimestamps',
    'TwitchMinPlayer', 'TwitchMinChat', 'TwitchMinComposer'];
  let settings = null;
  let root = null;
  let pendingChanges = {};
  let readingSettings = false;
  let applied = null;
  const featureApplied = new Map();
  const failedFeatures = new Set();

  function apply(report = false) {
    if (!settings) return;
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
      const feature = globalThis[name];
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
    const style = document.createElement("style");
    style.id = "twitch-min-styles";
    style.textContent = globalThis.TwitchMinRules.buildCSS();
    root.appendChild(style);
    apply(true);
    return true;
  }

  // document_start can precede <html>. Observe only until it exists, not Twitch's
  // chat mutations. CSS automatically matches elements added during navigation.
  if (!mount()) {
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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
  });

  // A read-only acknowledgement distinguishes a saved popup setting from an
  // actual update in the active page, without additional API permissions.
  chrome.runtime?.onMessage?.addListener((message, sender, respond) => {
    if (message?.type !== 'twitch-min:status') return;
    respond({
      type: 'twitch-min:status',
      version: manifest?.version,
      enabled: settings?.enabled ?? null,
      appliedEnabled: root === document.documentElement ? root?.getAttribute(ATTRIBUTES.enabled) ?? null : null,
      stylesheetMounted: Boolean(document.getElementById('twitch-min-styles')?.isConnected),
      failedFeatures: [...failedFeatures],
      missingFeatures: features.filter(name => !globalThis[name])
    });
  });

  async function readSettings() {
    if (readingSettings || settings !== null) return;
    readingSettings = true;
    try {
      const raw = await chrome.storage.local.get(DEFAULTS);
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

  readSettings();
})();
