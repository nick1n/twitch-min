(() => {
  "use strict";

  const { DEFAULTS, ATTRIBUTES, normalize } = globalThis.TwitchMinSettings;
  let settings = null;
  let root = null;
  let pendingChanges = {};

  function apply() {
    if (!root || !settings) return;
    for (const [key, attribute] of Object.entries(ATTRIBUTES)) {
      root.setAttribute(attribute, String(settings[key]));
    }
    globalThis.TwitchMinEmotes?.setEnabled(settings.enabled);
    globalThis.TwitchMinLayout?.configure(settings);
    globalThis.TwitchMinTimestamps?.configure(settings);
    globalThis.TwitchMinPlayer?.configure(settings);
    globalThis.TwitchMinChat?.configure(settings);
    globalThis.TwitchMinComposer?.configure(settings);
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
