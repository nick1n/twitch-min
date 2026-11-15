/* Shared row updates for author tints, sender labels and the badge helper. */
(() => {
  "use strict";
  const ROW = '.vod-message, .chat-line__message';
  const AUTHOR = '[data-a-target="chat-message-username"], .chat-author__display-name';
  const LIST = globalThis.TwitchMinSelectors.chatRoot;
  const NOTICE = '.chat-line__status, .user-notice-line, [data-a-target="chat-welcome-message"], .chat-line__message--deleted';
  const ENTRY = `${ROW}, ${NOTICE}`;
  const BARRIER = Symbol('chat boundary');
  let preferences = {};
  const refreshRegions = new Set();
  function attachChat(root, onCleanup) {
    const marked = new Set();
    const grouped = new Set();
    const labels = new WeakMap();
    const badges = globalThis.TwitchMinChatBadges.create(root, ROW, onCleanup);

    function authorFor(row) {
      // Live chat's clickable username wrapper inherits the ordinary text color.
      // Prefer its inner display name; keep the wrapper as a legacy fallback.
      return row.querySelector(AUTHOR) || row.querySelector('.chat-line__username');
    }

    function tint(row, author) {
      if (!author) {
        if (marked.has(row)) {
          row.removeAttribute('data-tq-chat-tint');
          row.style.removeProperty('--tq-chat-color');
          row.style.removeProperty('--tq-chat-tint');
          marked.delete(row);
        }
        return;
      }
      // A hidden continuation may have a different native name color. Use the
      // first sender label in this run so every row has the same background.
      const key = sender(row, author);
      let first = row;
      let previous = adjacent(first, true);
      while (key && previous?.matches(ROW) && sender(previous) === key) {
        first = previous;
        previous = adjacent(first, true);
      }
      const color = getComputedStyle(authorFor(first) || author).color;
      if (marked.has(row) && row.style.getPropertyValue('--tq-chat-color') === color) return;
      const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
      marked.add(row);
      row.style.setProperty('--tq-chat-color', color);
      row.style.setProperty('--tq-chat-tint', rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.06)` : 'rgba(128, 128, 128, 0.04)');
      row.setAttribute('data-tq-chat-tint', '');
    }

    function sender(row, author = authorFor(row)) {
      if (!author || row.matches(NOTICE) || row.querySelector(NOTICE)) return null;
      const candidate = author.closest('[data-a-user], [data-user-id], [data-a-user-id]');
      const account = candidate && row.contains(candidate) ? candidate : null;
      const login = account?.getAttribute('data-a-user');
      if (login) return `login:${login.toLowerCase()}`;
      const link = author.closest('a.video-chat__message-author');
      if (link?.hasAttribute('href')) {
        try {
          const path = new URL(link.getAttribute('href'), 'https://www.twitch.tv/').pathname;
          if (/^\/[a-z0-9_]+\/?$/i.test(path)) return `login:${path.replaceAll('/', '').toLowerCase()}`;
        } catch { /* Fall back to the native author label. */ }
      }
      const id = account?.getAttribute('data-user-id') || account?.getAttribute('data-a-user-id');
      if (id) return `id:${id}`;
      const name = author.textContent.trim().toLowerCase();
      return name ? `name:${name}` : null;
    }

    function entryWithin(node, root, last) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim() ? BARRIER : null;
      if (!(node instanceof Element)) return null;
      if (node !== root && node.matches(LIST)) return BARRIER;
      const entries = node.matches(ENTRY) ? [node] : [...node.querySelectorAll(ENTRY)];
      const eligible = entries.filter(entry => entry.closest(LIST) === root && !entry.parentElement?.closest(ENTRY));
      if (eligible.length) return last ? eligible.at(-1) : eligible[0];
      // Unknown notices with visible text break a run, too. Empty virtual spacers do not.
      return node.textContent.trim() ? BARRIER : null;
    }

    function adjacent(node, previous = false) {
      const root = node.closest(LIST);
      if (!root) return null;
      const direction = previous ? 'previousSibling' : 'nextSibling';
      for (let current = node; current && current !== root; current = current.parentElement) {
        for (let sibling = current[direction]; sibling; sibling = sibling[direction]) {
          const entry = entryWithin(sibling, root, previous);
          if (entry) return entry === BARRIER ? null : entry;
        }
      }
      return null;
    }

    function clearGroup(row) {
      const old = labels.get(row);
      if (old) {
        old.author.removeAttribute('data-tq-chat-author');
        for (const separator of old.separators) separator.removeAttribute('data-tq-chat-separator');
      } else if (row.hasAttribute('data-tq-chat-continuation')) {
        for (const node of row.querySelectorAll('[data-tq-chat-author], [data-tq-chat-separator]')) {
          node.removeAttribute('data-tq-chat-author');
          node.removeAttribute('data-tq-chat-separator');
        }
      }
      row.removeAttribute('data-tq-chat-continuation');
      labels.delete(row);
      grouped.delete(row);
    }

    function group(row, author = authorFor(row)) {
      const previous = adjacent(row, true);
      const key = sender(row, author);
      if (!key || !previous?.matches(ROW) || sender(previous) !== key) { clearGroup(row); return; }
      const container = author.closest('.video-chat__message-author, .chat-line__username, .chat-line__username-container, button');
      // Some native identity wrappers also contain badges. Hide only the name
      // in that case, leaving badge visibility to the badge helper.
      const identity = container && row.contains(container) && !globalThis.TwitchMinChatBadges.hasBadges(container) ? container : author;
      const separators = [...row.querySelectorAll('.chat-line__message--colon, [data-a-target="chat-message-separator"], .chat-line__username-container + span[aria-hidden="true"], .video-chat__message > span:first-child')]
        .filter(node => node.closest(ROW) === row && node.textContent.trim() === ':' &&
          !node.matches('.text-fragment, [data-a-target="chat-message-text"]') &&
          (!node.parentElement.matches('.video-chat__message') || node.nextElementSibling));
      const old = labels.get(row);
      if (old?.author === identity && old.separators.length === separators.length && old.separators.every((node, i) => node === separators[i])) return;
      clearGroup(row);
      labels.set(row, { author: identity, separators });
      grouped.add(row);
      row.setAttribute('data-tq-chat-continuation', '');
      identity.setAttribute('data-tq-chat-author', '');
      for (const separator of separators) separator.setAttribute('data-tq-chat-separator', '');
    }

    function update(row) {
      const author = authorFor(row);
      tint(row, preferences.chatTints === false ? null : author);
      if (preferences.chatGrouping === false) clearGroup(row);
      else group(row, author);
      badges.update(row);
    }

    function updateNext(node, neighbors) {
      const next = adjacent(node);
      if (next?.matches(ROW)) neighbors.add(next);
    }

    function visit(node, dirty, neighbors, descendants = true) {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(element instanceof Element) && element !== document) return;
      const row = element.closest?.(ROW);
      if (row) { dirty.add(row); updateNext(row, neighbors); }
      else if (element !== document) updateNext(element, neighbors);
      if (descendants) for (const child of element.querySelectorAll(ROW)) { dirty.add(child); updateNext(child, neighbors); }
    }

    function repairRemoval(record, neighbors) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || target.closest(ROW)) return;
      const root = target.closest(LIST);
      if (!root) return;
      for (let sibling = record.nextSibling; sibling; sibling = sibling.nextSibling) {
        const entry = entryWithin(sibling, root, false);
        if (entry) {
          if (entry !== BARRIER && entry.matches(ROW)) neighbors.add(entry);
          return;
        }
      }
      updateNext(target, neighbors);
    }

    function releaseRemoved(node) {
      if (!(node instanceof Element) || root.contains(node)) return;
      // Visit the removed subtree instead of scanning every retained chat row.
      const selector = '[data-tq-chat-tint], [data-tq-chat-continuation], [data-tq-chat-badges]';
      const rows = node.matches(selector) ? [node, ...node.querySelectorAll(selector)] : node.querySelectorAll(selector);
      for (const row of rows) {
        badges.release(row);
        if (row.isConnected) {
          marked.delete(row);
          grouped.delete(row);
          labels.delete(row);
          continue;
        }
        if (marked.has(row)) tint(row, null);
        if (grouped.has(row)) clearGroup(row);
      }
    }

    function flush(dirty, neighbors) {
      for (const row of dirty) if (row.isConnected) update(row);
      for (const row of neighbors) if (row.isConnected && !dirty.has(row)) update(row);
      // Color or identity changes can affect the remainder of this sender run.
      const visited = new Set([...dirty, ...neighbors]);
      for (const row of visited) {
        const next = adjacent(row);
        if (next?.matches(ROW) && !visited.has(next) && sender(row) && sender(next) === sender(row)) {
          visited.add(next);
          update(next);
        }
      }
    }

    const observer = new MutationObserver(records => {
      const dirty = new Set();
      const neighbors = new Set();
      for (const record of records) {
        if (record.type === 'attributes') visit(record.target, dirty, neighbors, false);
        else {
          visit(record.target, dirty, neighbors, false);
          for (const node of record.addedNodes || []) visit(node, dirty, neighbors);
          if (record.removedNodes?.length) {
            repairRemoval(record, neighbors);
            for (const node of record.removedNodes) releaseRemoved(node);
          }
        }
      }
      flush(dirty, neighbors);
    });

    const refresh = () => {
      const dirty = new Set();
      const neighbors = new Set();
      visit(root, dirty, neighbors);
      flush(dirty, neighbors);
    };
    onCleanup(() => {
      refreshRegions.delete(refresh);
      observer.disconnect();
      for (const row of marked) if (!row.isConnected || root.contains(row)) tint(row, null);
      for (const row of grouped) if (!row.isConnected || root.contains(row)) clearGroup(row);
      marked.clear();
      grouped.clear();
    });
    refreshRegions.add(refresh);
    refresh();
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-a-user', 'data-user-id', 'data-a-user-id', 'href', 'alt', 'title', 'aria-label', 'data-a-target'] });
  }

  let stopRegions = null;
  globalThis.TwitchMinChat = globalThis.TwitchMinRuntime.create({
    attach(settings) {
      preferences = settings;
      stopRegions = globalThis.TwitchMinRegions.watch(LIST, attachChat, stop => { stopRegions = stop; });
    },
    update(settings) {
      const changed = preferences.chatTints !== settings.chatTints || preferences.chatGrouping !== settings.chatGrouping;
      preferences = settings;
      if (changed) for (const refresh of refreshRegions) refresh();
    },
    dispose() { stopRegions?.(); stopRegions = null; }
  });
})();
