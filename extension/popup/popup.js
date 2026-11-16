(() => {
  'use strict';

  const settingsApi = globalThis.TwitchMinSettings;
  const master = document.getElementById('master-toggle');
  const groupList = document.getElementById('groups');
  const moreSettings = document.getElementById('more-settings');
  const enableAllButton = document.getElementById('enable-all-button');
  const status = document.getElementById('status');
  const toggleErrorPanel = document.getElementById('toggle-error');
  const toggleErrorMessage = document.getElementById('toggle-error-message');
  const reloadHint = document.getElementById('reload-hint');
  const copyError = document.getElementById('copy-error');
  const copyErrorStatus = document.getElementById('copy-error-status');
  const errorDetails = document.getElementById('error-details');
  let toggleError = null;
  let copyFeedbackTimer;
  let state = null;
  let ready = false;
  let pendingWrites = 0;
  let pendingSave = null;
  let initialChanges = {};
  const groupControls = new Map();
  const manifest = globalThis.chrome?.runtime?.getManifest?.();
  const logTag = `[${manifest?.name || 'twitch-min'} v${manifest?.version || 'unknown'}]`;
  let diagnosticAttempt = 0;
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
      if (group.section) {
        const heading = document.createElement('h2');
        heading.className = 'settings-heading';
        heading.textContent = group.section;
        groupList.append(heading);
      }
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

  function resetCopyFeedback() {
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = undefined;
    copyError.textContent = 'Copy error details';
  }

  function clearToggleError() {
    toggleError = null;
    toggleErrorPanel.hidden = true;
    errorDetails.value = '';
    errorDetails.hidden = true;
    resetCopyFeedback();
    copyErrorStatus.hidden = true;
  }

  function showToggleError(expected, reason, message, { response, error, refresh = true } = {}) {
    // Include only extension state, never arbitrary response fields or page data.
    const observed = response ? {
      version: response.version,
      enabled: response.enabled,
      appliedEnabled: response.appliedEnabled,
      stylesheetMounted: response.stylesheetMounted,
      failedFeatures: response.failedFeatures,
      missingFeatures: response.missingFeatures
    } : undefined;
    toggleError = { text: `${logTag} Toggle troubleshooting\n${JSON.stringify({
      requestedEnabled: expected, reason, message, error: error?.message, observed
    }, null, 2)}` };
    toggleErrorMessage.textContent = message;
    reloadHint.hidden = !refresh;
    errorDetails.value = toggleError.text;
    errorDetails.hidden = true;
    resetCopyFeedback();
    copyErrorStatus.hidden = true;
    toggleErrorPanel.hidden = false;
  }

  copyError.addEventListener('click', async () => {
    const report = toggleError;
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      if (toggleError !== report) return;
      resetCopyFeedback();
      copyError.textContent = 'Copied!';
      copyFeedbackTimer = setTimeout(resetCopyFeedback, 5000);
      copyErrorStatus.hidden = true;
    } catch {
      if (toggleError !== report) return;
      resetCopyFeedback();
      errorDetails.hidden = false;
      errorDetails.focus();
      errorDetails.select();
      copyErrorStatus.textContent = 'Automatic copying is unavailable. Select and copy the details below.';
      copyErrorStatus.hidden = false;
    }
  });

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

  async function diagnoseToggle(expected, attempt) {
    let contactedTab = false;
    let timeout;
    try {
      if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
        console.warn(`${logTag} Popup: tab diagnostics are unavailable; storage success does not confirm that Twitch applied the toggle.`);
        showToggleError(expected, 'diagnostics-unavailable', "Couldn't check whether the change reached Twitch.");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (attempt !== diagnosticAttempt) return;
      if (!Number.isInteger(tab?.id)) {
        console.warn(`${logTag} Popup: no active tab was found; cannot confirm enable/disable.`);
        showToggleError(expected, 'no-active-tab', 'Open Twitch and try the switch again.');
        return;
      }
      contactedTab = true;
      const bounded = (promise, milliseconds, message) => Promise.race([
        promise,
        new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error(message)), milliseconds); })
      ]).finally(() => clearTimeout(timeout));
      let response, connectionError;
      try {
        response = await bounded(chrome.tabs.sendMessage(tab.id, { type: 'twitch-min:status' }, { frameId: 0 }),
          2000, 'No page acknowledgement within 2 seconds.');
      } catch (error) { connectionError = error; }
      if (attempt !== diagnosticAttempt) return;
      if (state.enabled !== expected) {
        console.info(`${logTag} Popup: a newer preference change superseded this toggle; its page acknowledgement is ignored.`);
        return;
      }
      if ((connectionError || response?.version !== manifest?.version || response?.type !== 'twitch-min:status' || response.ready === false) && chrome.runtime?.sendMessage) {
        console.info(`${logTag} Popup: reconnecting the active Twitch tab without reloading it.`);
        const recovered = await bounded(chrome.runtime.sendMessage({ type: 'twitch-min:recover', tabId: tab.id }),
          8000, 'Reconnection did not finish within 8 seconds. Try the switch again or refresh Twitch.');
        if (recovered?.type !== 'twitch-min:recovery' || !recovered.ok) {
          throw new Error(recovered?.error || 'Could not reconnect to the Twitch tab.');
        }
        response = recovered.status;
        connectionError = null;
      }
      if (connectionError) throw connectionError;
      if (attempt !== diagnosticAttempt) return;
      if (state.enabled !== expected) {
        console.info(`${logTag} Popup: a newer preference change superseded this toggle; its page acknowledgement is ignored.`);
      } else if (response?.type !== 'twitch-min:status' || response.version !== manifest?.version ||
          !Array.isArray(response.failedFeatures) || !Array.isArray(response.missingFeatures)) {
        console.warn(`${logTag} Popup: the active tab has a missing or outdated diagnostic response; the change cannot be confirmed. If this is Twitch, try refreshing the tab.`);
        showToggleError(expected, 'outdated-response', "Couldn't confirm the change because this tab returned an unsupported response.", { response });
      } else if (response.enabled === null) {
        console.warn(`${logTag} Popup: the page has not loaded preferences yet; the toggle is not applied. Check the Twitch console for a preference-read failure.`);
        showToggleError(expected, 'preferences-not-loaded', "Twitch hasn't loaded your preferences, so the change isn't applied yet.", { response });
      } else if (response.enabled !== expected || response.appliedEnabled !== String(expected)) {
        console.warn(`${logTag} Popup: storage was saved but the page has not applied the requested enabled state; storage delivery or document setup may still be pending.`, response);
        showToggleError(expected, 'state-not-applied', "Your choice was saved, but Twitch hasn't applied it yet.", { response });
      } else if (!response.stylesheetMounted || response.failedFeatures.length || response.missingFeatures.length) {
        console.warn(`${logTag} Popup: the page received the toggle but application is incomplete; check stylesheetMounted, failedFeatures and missingFeatures. Refresh Twitch if scripts/styles are missing.`, response);
        showToggleError(expected, 'incomplete-application', "Twitch received the change, but some extension features couldn't apply it.", { response });
      } else {
        clearToggleError();
        console.info(`${logTag} Popup: active tab confirmed ${expected ? 'enabled' : 'disabled'}; stylesheet present and controllers reported no failures.`);
      }
    } catch (error) {
      if (attempt !== diagnosticAttempt || state.enabled !== expected) return;
      if (contactedTab) {
        console.warn(`${logTag} Popup: cannot confirm enable/disable because the active tab did not respond. Make sure the tab is Twitch, then try refreshing it and check extension site access.`, error);
        showToggleError(expected, 'no-page-response', "Couldn't confirm the change or reconnect to this tab. Make sure it's Twitch and extension site access is allowed, then try refreshing it.", { error });
      } else {
        console.warn(`${logTag} Popup: active-tab lookup failed; cannot confirm enable/disable.`, error);
        showToggleError(expected, 'tab-lookup-failed', "Couldn't find the active Twitch tab to confirm the change.", { error });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function save(changes, previousState) {
    const toggling = Object.hasOwn(changes, 'enabled');
    const diagnostic = toggling ? ++diagnosticAttempt : null;
    if (toggling) clearToggleError();
    if (toggling) console.info(`${logTag} Popup: requested ${changes.enabled ? 'enable' : 'disable'}; saving to local storage.`);
    const focusedId = document.activeElement?.id;
    const attempt = pendingSave = { observed: {}, recovery: null };
    pendingWrites += 1;
    setBusy(true);
    showStatus('');
    try {
      await storageSet(changes);
      if (toggling) {
        console.info(`${logTag} Popup: enabled=${changes.enabled} saved; checking the active tab.`);
        void diagnoseToggle(changes.enabled, diagnostic);
      }
      // The change is already applied optimistically. Storage events received
      // while saving may contain newer values, so completion must keep them.
      render();
    } catch (error) {
      console.warn(`${logTag} Popup: preference save failed; the requested change is not confirmed.`, { keys: Object.keys(changes) }, error);
      if (toggling) showToggleError(changes.enabled, 'storage-save-failed', "Couldn't save the change. Try the switch again; if it still fails, report the error.", { error, refresh: false });
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
      } catch (recoveryError) {
        console.warn(`${logTag} Popup: preference recovery also failed; rolling back fields without newer storage notifications.`, recoveryError);
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
    if (!ready || pendingWrites) {
      if (key === 'enabled') console.warn(`${logTag} Popup: toggle ignored because ${!ready ? 'preferences are not loaded' : 'a previous save is still pending'}.`);
      return;
    }
    if (key === 'enabled' && state.enabled === value) {
      console.info(`${logTag} Popup: toggle has no effect because twitch-min is already ${value ? 'enabled' : 'disabled'}.`);
      return;
    }
    const previousState = state;
    state = normalize({ ...state, [key]: value });
    render();
    save({ [key]: value }, previousState);
  }

  master.addEventListener('change', () => updateField('enabled', master.checked));
  enableAllButton.addEventListener('click', () => {
    if (!ready || pendingWrites) return;
    const previousState = state;
    const enabledSettings = Object.fromEntries(Object.keys(settingsApi.DEFAULTS).map(key => [key, true]));
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
        const nextState = normalize({ ...state, ...patch });
        if (nextState.enabled !== state.enabled) clearToggleError();
        state = nextState;
        render();
      }
    });
  }

  function initialize() {
    if (!settingsApi || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn(`${logTag} Popup: preferences are unavailable; settings or the storage API is missing, so toggles are disabled.`);
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
          console.warn(`${logTag} Popup: preference load failed; toggles are disabled.`, error.message);
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
      console.warn(`${logTag} Popup: preference load failed; toggles are disabled.`, error);
      groupList.replaceChildren();
      groupList.setAttribute('aria-busy', 'false');
      showStatus(`Couldn't load preferences. ${error.message || 'Try reopening the popup.'}`);
      setBusy(true);
    }
  }

  const sizeObserver = new ResizeObserver(updateScrollCue);
  let scrollFrame = 0;
  function cancelScroll() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }
  groupList.addEventListener('wheel', cancelScroll, { passive: true });
  groupList.addEventListener('touchstart', cancelScroll, { passive: true });
  moreSettings.addEventListener('click', () => {
    cancelScroll();
    const atBottom = groupList.scrollHeight - groupList.clientHeight - groupList.scrollTop <= 1;
    const start = groupList.scrollTop;
    const target = atBottom ? 0 : groupList.scrollHeight - groupList.clientHeight;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      groupList.scrollTop = target;
    } else {
      const started = performance.now();
      const step = (now) => {
        const progress = Math.min((now - started) / 150, 1);
        groupList.scrollTop = start + (target - start) * (1 - (1 - progress) ** 3);
        scrollFrame = progress < 1 ? requestAnimationFrame(step) : 0;
      };
      scrollFrame = requestAnimationFrame(step);
    }
    moreSettings.focus({ preventScroll: true });
    updateScrollCue();
  });
  window.addEventListener('pagehide', () => {
    cancelScroll();
    groupList.removeEventListener('wheel', cancelScroll);
    groupList.removeEventListener('touchstart', cancelScroll);
    resetCopyFeedback();
    sizeObserver.disconnect();
    groupList.removeEventListener('scroll', updateScrollCue);
  }, { once: true });
  groupList.addEventListener('scroll', updateScrollCue, { passive: true });
  sizeObserver.observe(groupList);
  initialize();
})();
