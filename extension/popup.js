(() => {
  'use strict';

  const settingsApi = globalThis.TwitchMinSettings;
  const master = document.getElementById('master-toggle');
  const groupList = document.getElementById('groups');
  const restoreButton = document.getElementById('restore-button');
  const presetButton = document.getElementById('preset-button');
  const status = document.getElementById('status');
  let state = null;
  let ready = false;
  let pendingWrites = 0;
  let initialChanges = {};

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setBusy(busy) {
    master.disabled = busy || !ready;
    restoreButton.disabled = busy || !ready;
    presetButton.disabled = busy || !ready;
    groupList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.disabled = busy || !ready;
    });
  }

  function render() {
    if (!state || !settingsApi) return;
    const focusedId = document.activeElement?.id;
    master.checked = Boolean(state.enabled);
    master.setAttribute('aria-checked', String(master.checked));
    groupList.replaceChildren();

    settingsApi.GROUPS.forEach((group) => {
      const row = document.createElement('div');
      row.className = `group-row${state[group.key] ? '' : ' is-off'}`;

      const copy = document.createElement('div');
      copy.className = 'group-copy';
      const title = document.createElement('span');
      title.className = 'group-title';
      title.id = `group-title-${group.key}`;
      title.textContent = group.title;
      const description = document.createElement('span');
      description.className = 'group-description';
      description.id = `group-description-${group.key}`;
      description.textContent = group.description;
      copy.append(title, description);

      const label = document.createElement('label');
      label.className = 'switch';
      label.setAttribute('for', `group-${group.key}`);
      const input = document.createElement('input');
      input.id = `group-${group.key}`;
      input.type = 'checkbox';
      input.role = 'switch';
      input.checked = Boolean(state[group.key]);
      input.disabled = !ready || pendingWrites > 0;
      input.setAttribute('aria-labelledby', title.id);
      input.setAttribute('aria-describedby', description.id);
      input.addEventListener('change', () => updateField(group.key, input.checked));
      const track = document.createElement('span');
      track.className = 'switch-track';
      track.setAttribute('aria-hidden', 'true');
      const thumb = document.createElement('span');
      thumb.className = 'switch-thumb';
      track.append(thumb);
      label.append(input, track);
      row.append(copy, label);
      groupList.append(row);
    });

    groupList.setAttribute('aria-busy', 'false');
    setBusy(pendingWrites > 0);
    document.getElementById('mode-note').textContent = state.enabled
      ? 'Hiding is on. Changes apply instantly.'
      : 'Hiding is paused. Twitch controls are restored.';
    const focused = document.getElementById(focusedId);
    if (focused && !focused.disabled) focused.focus();
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
    pendingWrites += 1;
    setBusy(true);
    showStatus('');
    try {
      await storageSet(changes);
      state = normalize({ ...state, ...changes });
      render();
    } catch (error) {
      // Re-read rather than discard preferences another popup changed while
      // this write was pending. Fall back to rolling back only our own fields.
      try {
        const stored = await new Promise((resolve, reject) => {
          chrome.storage.local.get(settingsApi.DEFAULTS, (raw) => {
            const readError = chrome.runtime && chrome.runtime.lastError;
            if (readError) reject(new Error(readError.message));
            else resolve(raw);
          });
        });
        state = normalize(stored);
      } catch {
        const rollback = Object.fromEntries(Object.keys(changes).map(key => [key, previousState[key]]));
        state = normalize({ ...state, ...rollback });
      }
      showStatus(`Couldn't save that change. ${error.message || 'Check extension storage and try again.'}`);
      render();
    } finally {
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
  restoreButton.addEventListener('click', () => updateField('enabled', false));
  presetButton.addEventListener('click', () => {
    if (!ready || pendingWrites) return;
    const previousState = state;
    const preset = { ...settingsApi.DEFAULTS, enabled: true };
    state = normalize(preset);
    render();
    save(preset, previousState);
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

  initialize();
})();
