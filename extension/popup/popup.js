(() => {
  'use strict';

  const settingsApi = globalThis.TwitchMinSettings;
  const master = document.getElementById('master-toggle');
  const groupList = document.getElementById('groups');
  const moreSettings = document.getElementById('more-settings');
  const enableAllButton = document.getElementById('enable-all-button');
  const status = document.getElementById('status');
  let state = null;
  let ready = false;
  let pendingWrites = 0;
  let pendingSave = null;
  let initialChanges = {};
  const groupControls = new Map();
  const manifest = globalThis.chrome?.runtime?.getManifest?.();
  if (manifest?.version) {
    const version = document.getElementById('app-version');
    version.textContent = `v${manifest.version}`;
    version.hidden = false;
  }

  function updateScrollCue() {
    moreSettings.hidden = !ready || groupList.scrollHeight - groupList.clientHeight <= 1;
    moreSettings.textContent = groupList.scrollHeight - groupList.clientHeight - groupList.scrollTop <= 1
      ? 'Back to top ↑' : 'More settings ↓';
  }

  function buildGroupControls() {
    if (!settingsApi || groupControls.size) return;
    groupList.replaceChildren();
    settingsApi.GROUPS.forEach((group) => {
      const label = document.createElement('label');
      label.className = 'setting';
      const copy = document.createElement('span');
      copy.className = 'setting-copy';
      const title = document.createElement('span');
      title.id = `group-title-${group.key}`;
      title.className = 'setting-title';
      title.textContent = group.title;
      const description = document.createElement('span');
      description.className = 'setting-description';
      description.id = `group-description-${group.key}`;
      description.textContent = group.description;
      const input = document.createElement('input');
      input.id = `group-${group.key}`;
      input.type = 'checkbox';
      input.setAttribute('aria-labelledby', title.id);
      input.setAttribute('aria-describedby', description.id);
      input.addEventListener('change', () => updateField(group.key, input.checked));
      copy.append(title, description);
      label.append(copy, input);
      groupList.append(label);
      sizeObserver.observe(label);
      groupControls.set(group.key, input);
    });
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setBusy(busy) {
    master.disabled = busy || !ready;
    enableAllButton.disabled = busy || !ready || Object.values(state).every(value => value === true);
    enableAllButton.hidden = enableAllButton.disabled;
    for (const input of groupControls.values()) {
      input.disabled = busy || !ready;
    }
  }

  function render() {
    if (!state || !settingsApi) return;
    const focusedId = document.activeElement?.id;
    master.checked = Boolean(state.enabled);
    buildGroupControls();
    settingsApi.GROUPS.forEach((group) => {
      const input = groupControls.get(group.key);
      input.checked = Boolean(state[group.key]);
    });

    groupList.setAttribute('aria-busy', 'false');
    setBusy(pendingWrites > 0);
    const focused = document.getElementById(focusedId);
    if (focused && !focused.disabled) focused.focus();
    updateScrollCue();
  }

  function normalize(raw) {
    return settingsApi.normalize(raw);
  }

  function storageSet(changes) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(changes, () => {
          const error = chrome.runtime && chrome.runtime.lastError;
          if (error) reject(new Error(error.message || 'Could not save preferences.'));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function save(changes, previousState) {
    const focusedId = document.activeElement?.id;
    const attempt = pendingSave = { observed: {}, recovery: null };
    pendingWrites += 1;
    setBusy(true);
    showStatus('');
    try {
      await storageSet(changes);
      // The change is already applied optimistically. Storage events received
      // while saving may contain newer values, so completion must keep them.
      render();
    } catch (error) {
      // Merge notifications received during the recovery read over its snapshot.
      // If that read also fails, roll back only fields without newer notifications.
      try {
        attempt.recovery = {};
        const stored = await new Promise((resolve, reject) => {
          chrome.storage.local.get(settingsApi.DEFAULTS, (raw) => {
            const readError = chrome.runtime && chrome.runtime.lastError;
            if (readError) reject(new Error(readError.message));
            else resolve(raw);
          });
        });
        state = normalize({ ...stored, ...attempt.recovery });
      } catch {
        const rollback = Object.fromEntries(Object.keys(changes)
          .filter(key => !Object.hasOwn(attempt.observed, key))
          .map(key => [key, previousState[key]]));
        state = normalize({ ...state, ...rollback });
      }
      showStatus(`Couldn't save that change. ${error.message || 'Check extension storage and try again.'}`);
      render();
    } finally {
      pendingSave = null;
      pendingWrites = Math.max(0, pendingWrites - 1);
      setBusy(pendingWrites > 0);
      const focused = document.getElementById(focusedId);
      if (focused && !focused.disabled) focused.focus();
    }
  }

  function updateField(key, value) {
    if (!ready || pendingWrites) return;
    const previousState = state;
    state = normalize({ ...state, [key]: value });
    render();
    save({ [key]: value }, previousState);
  }

  master.addEventListener('change', () => updateField('enabled', master.checked));
  enableAllButton.addEventListener('click', () => {
    if (!ready || pendingWrites) return;
    const previousState = state;
    const enabledSettings = { ...settingsApi.DEFAULTS, enabled: true };
    state = normalize(enabledSettings);
    render();
    save(enabledSettings, previousState);
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !settingsApi) return;
      const patch = {};
      Object.keys(changes).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(settingsApi.DEFAULTS, key)) {
          patch[key] = changes[key].newValue;
        }
      });
      if (Object.keys(patch).length) {
        if (!ready) {
          initialChanges = { ...initialChanges, ...patch };
          return;
        }
        if (pendingSave) {
          Object.assign(pendingSave.observed, patch);
          if (pendingSave.recovery) Object.assign(pendingSave.recovery, patch);
        }
        state = normalize({ ...state, ...patch });
        render();
      }
    });
  }

  function initialize() {
    if (!settingsApi || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      groupList.replaceChildren();
      groupList.setAttribute('aria-busy', 'false');
      showStatus('Preferences are unavailable. Check that twitch-min has storage access, then reopen this popup.');
      setBusy(true);
      return;
    }
    try {
      chrome.storage.local.get(settingsApi.DEFAULTS, (raw) => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) {
          groupList.replaceChildren();
          groupList.setAttribute('aria-busy', 'false');
          showStatus(`Couldn't load preferences. ${error.message || 'Try reopening the popup.'}`);
          setBusy(true);
          return;
        }
        state = normalize({ ...raw, ...initialChanges });
        initialChanges = {};
        ready = true;
        render();
      });
    } catch (error) {
      groupList.replaceChildren();
      groupList.setAttribute('aria-busy', 'false');
      showStatus(`Couldn't load preferences. ${error.message || 'Try reopening the popup.'}`);
      setBusy(true);
    }
  }

  const sizeObserver = new ResizeObserver(updateScrollCue);
  moreSettings.addEventListener('click', () => {
    const atBottom = groupList.scrollHeight - groupList.clientHeight - groupList.scrollTop <= 1;
    groupList.scrollTop = atBottom ? 0 : groupList.scrollHeight;
    moreSettings.focus({ preventScroll: true });
    updateScrollCue();
  });
  window.addEventListener('pagehide', () => {
    sizeObserver.disconnect();
    groupList.removeEventListener('scroll', updateScrollCue);
  }, { once: true });
  groupList.addEventListener('scroll', updateScrollCue, { passive: true });
  sizeObserver.observe(groupList);
  initialize();
})();
