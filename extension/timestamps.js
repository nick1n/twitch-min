/* Format only replay timestamp labels, leaving Twitch's text/seek controls intact. */
(() => {
  "use strict";
  const TIME = '.video-chat .vod-message__header p, .video-chat__message-time, .video-chat [data-a-target="video-chat-timestamp"], .video-chat__message a[href^="/videos/"][href*="?t="], [data-a-target="video-chat-message"] a[href^="/videos/"][href*="?t="]';
  function attachTimes(root) {
    const marked = new Set();

    function shortTime(text) {
      const value = text.trim();
      if (!/^\d+:\d{2}(?::\d{2})?$/.test(value)) return null;
      const parts = value.split(":").map(Number);
      const seconds = parts.pop();
      if (seconds > 59 || (parts.length === 2 && parts[1] > 59)) return null;
      const minutes = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    }

    function update(candidate, visited) {
      // A previously formatted leaf can become a wrapper after a React update.
      if (candidate.childElementCount && marked.delete(candidate)) candidate.removeAttribute('data-tq-time');
      const leaves = candidate.childElementCount ? [...candidate.querySelectorAll("*")].filter(x => !x.childElementCount) : [candidate];
      for (const leaf of leaves) {
        if (visited.has(leaf)) continue;
        visited.add(leaf);
        const value = shortTime(leaf.textContent);
        if (value !== null) {
          if (leaf.getAttribute('data-tq-time') !== value) leaf.setAttribute('data-tq-time', value);
          marked.add(leaf);
        } else if (marked.delete(leaf)) leaf.removeAttribute("data-tq-time");
      }
    }

    function visit(node, candidates) {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(element instanceof Element) && element !== document) return;
      const candidate = element.closest?.(TIME);
      if (candidate) candidates.add(candidate);
      for (const match of element.querySelectorAll(TIME)) candidates.add(match);
    }

    function flush(candidates) {
      const visited = new Set();
      for (const candidate of candidates) if (root.contains(candidate)) update(candidate, visited);
    }

    function releaseRemoved(node) {
      if (!(node instanceof Element) || root.contains(node)) return;
      const leaves = node.matches('[data-tq-time]') ? [node, ...node.querySelectorAll('[data-tq-time]')] : node.querySelectorAll('[data-tq-time]');
      for (const leaf of leaves) if (marked.delete(leaf) && !leaf.isConnected) leaf.removeAttribute('data-tq-time');
    }

    const observer = new MutationObserver(records => {
      const candidates = new Set();
      for (const record of records) {
        if (record.type === "characterData") visit(record.target, candidates);
        else {
          // A removal-only mutation must clear an obsolete visual label too.
          const candidate = record.target.closest?.(TIME);
          if (candidate) candidates.add(candidate);
          for (const node of record.addedNodes) visit(node, candidates);
          for (const node of record.removedNodes) releaseRemoved(node);
        }
      }
      flush(candidates);
    });
    const initial = new Set();
    visit(root, initial);
    flush(initial);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      for (const leaf of marked) if (!leaf.isConnected || root.contains(leaf)) leaf.removeAttribute('data-tq-time');
      marked.clear();
    };
  }

  let stopRegions = null;
  globalThis.TwitchMinTimestamps = globalThis.TwitchMinRuntime.create({
    attach() { stopRegions = globalThis.TwitchMinRegions.watch(globalThis.TwitchMinSelectors.chatRoot, attachTimes); },
    dispose() { stopRegions?.(); stopRegions = null; }
  }, settings => settings.enabled === true && settings.chatTimestamps === true);
})();
