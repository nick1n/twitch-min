/* Format only replay timestamp labels, leaving Twitch's text/seek controls intact. */
(() => {
  "use strict";
  const TIME = '.video-chat .vod-message__header p, .video-chat__message-time, .video-chat [data-a-target="video-chat-timestamp"], .video-chat__message a[href^="/videos/"][href*="?t="], [data-a-target="video-chat-message"] a[href^="/videos/"][href*="?t="]';
  const marked = new Set();
  let enabled = false;

  function shortTime(text) {
    const value = text.trim();
    if (!/^\d+:\d{2}(?::\d{2})?$/.test(value)) return null;
    const parts = value.split(":").map(Number);
    const seconds = parts.pop();
    if (seconds > 59 || (parts.length === 2 && parts[1] > 59)) return null;
    const minutes = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function update(candidate) {
    const leaves = candidate.childElementCount ? [...candidate.querySelectorAll("*")].filter(x => !x.childElementCount) : [candidate];
    for (const leaf of leaves) {
      const value = shortTime(leaf.textContent);
      if (value !== null) {
        leaf.setAttribute("data-tq-time", value);
        marked.add(leaf);
      } else if (marked.delete(leaf)) leaf.removeAttribute("data-tq-time");
    }
  }

  function visit(node) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!(element instanceof Element) && element !== document) return;
    const candidate = element.closest?.(TIME);
    if (candidate) update(candidate);
    for (const match of element.querySelectorAll(TIME)) update(match);
  }

  const observer = new MutationObserver(records => {
    let removed = false;
    for (const record of records) {
      if (record.type === "characterData") visit(record.target);
      else {
        for (const node of record.addedNodes) visit(node);
        removed ||= record.removedNodes.length > 0;
      }
    }
    if (removed) for (const leaf of marked) if (!leaf.isConnected) marked.delete(leaf);
  });

  globalThis.TwitchMinTimestamps = Object.freeze({
    configure(settings) {
      const next = settings.enabled && settings.chatTimestamps;
      if (next === enabled) return;
      enabled = next;
      if (enabled) {
        visit(document);
        observer.observe(document, { childList: true, subtree: true, characterData: true });
      } else {
        observer.disconnect();
        for (const leaf of marked) leaf.removeAttribute("data-tq-time");
        marked.clear();
      }
    }
  });
})();
