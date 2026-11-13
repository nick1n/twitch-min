(() => {
  "use strict";

  const { DEFAULTS, ATTRIBUTES, normalize } = globalThis.TwitchMinSettings;
  let settings = null;
  let root = null;
  let pendingChanges = {};
  let applied = null;
  const featureApplied = new Map();

  function apply() {
    if (!root || !settings) return;
    for (const [key, attribute] of Object.entries(ATTRIBUTES)) {
      if (!applied || applied[key] !== settings[key]) root.setAttribute(attribute, String(settings[key]));
    }
    applied = { ...settings };
    for (const name of ['TwitchMinEmotes', 'TwitchMinLayout', 'TwitchMinTimestamps',
      'TwitchMinPlayer', 'TwitchMinChat', 'TwitchMinComposer']) {
      const feature = globalThis[name];
      if (!feature) continue;
      const previous = featureApplied.get(name);
      if (previous && Object.keys(DEFAULTS).every(key => previous[key] === settings[key])) continue;
      try {
        feature.update(settings);
        featureApplied.set(name, { ...settings });
      } catch (error) {
        featureApplied.delete(name);
        console.warn(`twitch-min feature ${name} failed to apply settings.`, error);
      }
    }
  }

  function mount() {
    root = document.documentElement;
    if (!root) return false;
    const style = document.createElement("style");
    style.id = "twitch-min-styles";
    style.textContent = globalThis.TwitchMinRules.buildCSS();
    root.appendChild(style);
    apply();
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
      pendingChanges = { ...pendingChanges, ...patch };
      return;
    }
    settings = normalize({ ...settings, ...patch });
    apply();
  });

  chrome.storage.local.get(DEFAULTS).then(raw => {
    settings = normalize({ ...raw, ...pendingChanges });
    pendingChanges = {};
    apply();
  }).catch(error => {
    // Leave Twitch usable if preference loading fails. Never hide against an
    // unknown preference (especially when the user previously paused hiding).
    console.warn("twitch-min could not load settings; hiding is paused.", error);
  });
})();
