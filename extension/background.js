'use strict';

const manifest = chrome.runtime.getManifest();
const content = manifest.content_scripts[0];
const inFlight = new Map();
const responseType = 'twitch-min:recovery';
const logTag = `[${manifest.name} v${manifest.version}]`;

function isTwitchUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/(?:www\.)?twitch\.tv(?:[/?#]|$)/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'www.twitch.tv' || url.hostname === 'twitch.tv') && !url.port && !url.username && !url.password;
  } catch { return false; }
}

async function recoverTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isTwitchUrl(tab.url)) throw new Error('Tab is not a supported Twitch page');
  let status, timeout;
  try {
    status = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'twitch-min:status' }, { frameId: 0 }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Page status timed out')), 2000); })
    ]);
  } catch { /* No current receiver. */ }
  finally { clearTimeout(timeout); }
  if (status?.type === 'twitch-min:status' && status.version === manifest.version && status.ready === true) return status;

  const preflight = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: async () => {
      const style = document.getElementById('twitch-min-styles');
      if (style && !style.hasAttribute('data-tq-session')) return { retired: true, legacy: true };
      // The page may have removed our stylesheet while controllers still own
      // listeners and DOM state. Retire those instances too, rather than stacking.
      if (!style && !document.documentElement?.hasAttribute('data-tq-enabled')) return { retired: true };
      await new Promise((resolve, reject) => {
        const finish = event => {
          clearTimeout(timer);
          document.removeEventListener('twitch-min:retired', finish);
          document.removeEventListener('twitch-min:retire-failed', finish);
          if (event.type === 'twitch-min:retired') resolve();
          else reject(new Error('Previous extension session could not retire; refresh Twitch to reconnect'));
        };
        const timer = setTimeout(() => finish({ type: 'timeout' }), 3000);
        document.addEventListener('twitch-min:retired', finish);
        document.addEventListener('twitch-min:retire-failed', finish);
        document.dispatchEvent(new Event('twitch-min:retire'));
      });
      return { retired: !document.getElementById('twitch-min-styles') };
    }
  });
  const documentId = preflight[0]?.documentId;
  if (!documentId) throw new Error('Could not identify the Twitch document');
  if (!preflight[0].result?.retired) throw new Error('Previous extension session could not retire; refresh Twitch to reconnect');
  if (preflight[0].result?.legacy) throw new Error('Refresh required to update the existing extension session');
  const target = { tabId, documentIds: [documentId] };
  if (content.css?.length) {
    await chrome.scripting.removeCSS({ target, files: content.css });
    await chrome.scripting.insertCSS({ target, files: content.css });
  }
  const results = await chrome.scripting.executeScript({ target, files: content.js });
  status = results[0]?.result;
  if (status?.type !== 'twitch-min:status' || status.version !== manifest.version || status.ready !== true) throw new Error('Extension session did not become ready');
  return status;
}

function recover(tabId) {
  if (!inFlight.has(tabId)) {
    const promise = recoverTab(tabId).finally(() => inFlight.delete(tabId));
    inFlight.set(tabId, promise);
  }
  return inFlight.get(tabId);
}

async function recoverOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: content.matches });
    await Promise.all(tabs.filter(tab => Number.isInteger(tab.id) && isTwitchUrl(tab.url)).map(async tab => {
      try { await recover(tab.id); }
      catch { console.warn(`${logTag} Background: could not reconnect tab; refresh it if toggles fail.`, tab.id); }
    }));
  } catch { console.warn(`${logTag} Background: could not find open Twitch tabs.`); }
}

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install' || details.reason === 'update') void recoverOpenTabs();
});
chrome.runtime.onStartup.addListener(() => { void recoverOpenTabs(); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'twitch-min:recover') return false;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL(manifest.action.default_popup) || !Number.isInteger(message.tabId) || message.tabId < 0) {
    sendResponse({ type: responseType, ok: false, error: 'Invalid recovery request' });
    return false;
  }
  recover(message.tabId).then(
    status => sendResponse({ type: responseType, ok: true, status }),
    error => sendResponse({ type: responseType, ok: false, error: error?.message || String(error) })
  );
  return true;
});

