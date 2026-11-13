/* Per-author tints and consecutive-sender labels; visit changed rows and neighbors. */
(() => {
  "use strict";
  const ROW = '.vod-message, .chat-line__message';
  const AUTHOR = '[data-a-target="chat-message-username"], .chat-author__display-name';
  const LIST = '.video-chat__message-list-wrapper, .chat-scrollable-area__message-container, [data-a-target="chat-scroller"], .video-chat, .chat-room';
  const NOTICE = '.chat-line__status, .user-notice-line, [data-a-target="chat-welcome-message"], .chat-line__message--deleted';
  const ENTRY = `${ROW}, ${NOTICE}`;
  const BARRIER = Symbol('chat boundary');
  const marked = new Set();
  const grouped = new Set();
  const labels = new WeakMap();
  let enabled = false;

  function authorFor(row) {
    // Live chat's clickable username wrapper inherits the ordinary text color.
    // Prefer its inner display name; keep the wrapper as a legacy fallback.
    return row.querySelector(AUTHOR) || row.querySelector('.chat-line__username');
  }

  function tint(row, author) {
    if (!author) {
      if (marked.delete(row)) {
        row.removeAttribute('data-tq-chat-tint');
        row.style.removeProperty('--tq-chat-color');
        row.style.removeProperty('--tq-chat-tint');
      }
      return;
    }
    const color = getComputedStyle(author).color;
    if (marked.has(row) && row.style.getPropertyValue('--tq-chat-color') === color) return;
    const rgb = color.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
    row.style.setProperty('--tq-chat-color', color);
    row.style.setProperty('--tq-chat-tint', rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.06)` : 'rgba(128, 128, 128, 0.04)');
    row.setAttribute('data-tq-chat-tint', '');
    marked.add(row);
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
    const identity = container && row.contains(container) ? container : author;
    const separators = [...row.querySelectorAll('.chat-line__message--colon, [data-a-target="chat-message-separator"], .chat-line__username-container + span[aria-hidden="true"], .video-chat__message > span:first-child')]
      .filter(node => node.closest(ROW) === row && node.textContent.trim() === ':' &&
        !node.matches('.text-fragment, [data-a-target="chat-message-text"]') &&
        (!node.parentElement.matches('.video-chat__message') || node.nextElementSibling));
    const old = labels.get(row);
    if (old?.author === identity && old.separators.length === separators.length && old.separators.every((node, i) => node === separators[i])) return;
    clearGroup(row);
    row.setAttribute('data-tq-chat-continuation', '');
    identity.setAttribute('data-tq-chat-author', '');
    for (const separator of separators) separator.setAttribute('data-tq-chat-separator', '');
    labels.set(row, { author: identity, separators });
    grouped.add(row);
  }

  function update(row) {
    const author = authorFor(row);
    tint(row, author);
    group(row, author);
  }

  function updateNext(node) {
    const next = adjacent(node);
    if (next?.matches(ROW)) group(next);
  }

  function visit(node, descendants = true) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!(element instanceof Element) && element !== document) return;
    const row = element.closest?.(ROW);
    if (row) { update(row); updateNext(row); }
    else if (element !== document) updateNext(element);
    if (descendants) for (const child of element.querySelectorAll(ROW)) { update(child); updateNext(child); }
  }

  function repairRemoval(record) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (!target || target.closest(ROW)) return;
    const root = target.closest(LIST);
    if (!root) return;
    for (let sibling = record.nextSibling; sibling; sibling = sibling.nextSibling) {
      const entry = entryWithin(sibling, root, false);
      if (entry) {
        if (entry !== BARRIER && entry.matches(ROW)) group(entry);
        return;
      }
    }
    updateNext(target);
  }

  const observer = new MutationObserver(records => {
    let removed = false;
    for (const record of records) {
      if (record.type === 'attributes') visit(record.target, false);
      else {
        visit(record.target, false);
        for (const node of record.addedNodes || []) visit(node);
        if (record.removedNodes?.length) repairRemoval(record);
        removed ||= record.removedNodes?.length > 0;
      }
    }
    if (removed) for (const row of marked) if (!row.isConnected) marked.delete(row);
    if (removed) for (const row of grouped) if (!row.isConnected) clearGroup(row);
  });

  globalThis.TwitchMinChat = Object.freeze({
    configure(settings) {
      const next = settings.enabled === true;
      if (enabled === next) return;
      enabled = next;
      if (enabled) {
        visit(document);
        observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-a-user', 'data-user-id', 'data-a-user-id', 'href'] });
      } else {
        observer.disconnect();
        for (const row of marked) {
          row.removeAttribute('data-tq-chat-tint');
          row.style.removeProperty('--tq-chat-color');
          row.style.removeProperty('--tq-chat-tint');
        }
        marked.clear();
        for (const row of grouped) clearGroup(row);
      }
    }
  });
})();
