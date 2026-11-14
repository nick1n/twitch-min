/* Per-author tints, sender labels and compact badges; visit changed rows and neighbors. */
(() => {
  "use strict";
  const ROW = '.vod-message, .chat-line__message';
  const AUTHOR = '[data-a-target="chat-message-username"], .chat-author__display-name';
  const LIST = globalThis.TwitchMinSelectors.chatRoot;
  const NOTICE = '.chat-line__status, .user-notice-line, [data-a-target="chat-welcome-message"], .chat-line__message--deleted';
  const ENTRY = `${ROW}, ${NOTICE}`;
  const BADGE = '.chat-badge, [data-a-target="chat-badge"]';
  const TOOLTIP = globalThis.TwitchMinSelectors.tooltip;
  const badgeOwners = new WeakMap();
  const BARRIER = Symbol('chat boundary');
  function attachChat(root, onCleanup) {
    const marked = new Set();
    const grouped = new Set();
    const labels = new WeakMap();
    const badgeRows = new Map();
    let badgeHint = null;

    function badgeName(value) {
      return (value || '').replace(/\s+/g, ' ').trim().replace(/ badge$/i, '');
    }

    function closeBadgeHint() {
      if (!badgeHint) return;
      badgeHint.observer.disconnect();
      badgeHint.extra.remove();
      badgeHint = null;
    }

    function nativeBadgeText(wrapper) {
      return [...wrapper.childNodes].filter(node => node !== badgeHint?.extra)
        .map(node => node.textContent).join('').trim();
    }

    function syncBadgeHint() {
      if (!badgeHint) return;
      const { row, first, extra, href } = badgeHint;
      const state = badgeRows.get(row);
      if (!root.contains(first) || state?.first !== first || location.href !== href ||
          !first.checkVisibility({ checkVisibilityCSS: true })) { closeBadgeHint(); return; }
      const visible = wrapper => wrapper.isConnected && wrapper.matches(TOOLTIP) &&
        !wrapper.closest('[aria-hidden="true"], [data-popper-reference-hidden="true"]') &&
        wrapper.checkVisibility({ checkVisibilityCSS: true });
      const matches = wrapper => state.names.some(name =>
        badgeName(nativeBadgeText(wrapper)).toLowerCase() === name.toLowerCase());
      // An explicit native association also covers richer/localized badge names.
      const linked = new Set();
      for (let node = first.matches('img') ? first : first.querySelector('img') || first;
          node && row.contains(node); node = node.parentElement) {
        for (const id of (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
          const ref = document.getElementById(id);
          const wrapper = ref?.matches(TOOLTIP) ? ref : ref?.querySelector(TOOLTIP);
          if (wrapper && visible(wrapper)) linked.add(wrapper);
        }
      }
      let host = badgeHint.host;
      if (host && !visible(host)) { closeBadgeHint(); return; }
      if (host && nativeBadgeText(host) !== badgeHint.nativeText && !matches(host)) {
        // React reused this popup for another target; a stale describedby must
        // not carry badge details into that target's tooltip.
        closeBadgeHint();
        return;
      }
      if (host && !linked.has(host) && !matches(host)) {
        extra.remove();
        badgeHint.host = host = null;
      }
      if (!host) {
        // Discovery runs only during a badge hover/focus and on tooltip changes,
        // never on ordinary message updates. Prefer the nearest exact-name match.
        const anchor = first.getBoundingClientRect();
        const distance = wrapper => {
          const rect = wrapper.getBoundingClientRect();
          return Math.hypot(rect.x - anchor.x, rect.y - anchor.y);
        };
        host = [...linked][0] || [...document.querySelectorAll(TOOLTIP)]
          .filter(wrapper => visible(wrapper) && matches(wrapper))
          .sort((a, b) => distance(a) - distance(b))[0];
        if (!host) return;
        badgeHint.host = host;
        badgeHint.nativeText = nativeBadgeText(host);
      }
      const text = state.others.join('\n');
      if (extra.textContent !== text) extra.textContent = text;
      // Keep Twitch's original text nodes, theme, arrow, role and Popper owner.
      if (extra.parentElement !== host) host.append(extra);
    }

    function openBadgeHint(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest(ROW);
      const first = badgeRows.get(row)?.first;
      if (!first?.contains(target)) return;
      if (badgeHint?.first === first) {
        if (event.type === 'focusin') badgeHint.type = event.type;
        return;
      }
      closeBadgeHint();
      const extra = document.createElement('span');
      extra.setAttribute('data-tq-chat-badge-details', '');
      const observer = new MutationObserver(records => {
        if (!badgeHint) return;
        if (!root.contains(first) || location.href !== badgeHint.href) { closeBadgeHint(); return; }
        if (badgeHint.host && !badgeHint.host.isConnected) { closeBadgeHint(); return; }
        const relevant = records.some(record => {
          const node = record.target instanceof Element ? record.target : record.target.parentElement;
          return node?.closest('.tw-tooltip-layer') || (badgeHint.host && node?.contains(badgeHint.host)) ||
            (record.type === 'attributes' && row.contains(node) && record.attributeName === 'aria-describedby') ||
            [...record.addedNodes].some(added => added instanceof Element &&
              (added.matches('.tw-tooltip-layer') || added.querySelector('.tw-tooltip-layer')));
        });
        if (relevant) syncBadgeHint();
      });
      badgeHint = { row, first, extra, observer, host: null, href: location.href, type: event.type };
      observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-hidden', 'data-popper-reference-hidden', 'aria-describedby', 'class', 'style', 'hidden'] });
      syncBadgeHint();
    }

    function leaveBadgeHint(event) {
      if (!badgeHint || (event.type === 'pointerout' && badgeHint.type === 'focusin')) return;
      if (badgeHint.first.contains(event.target) && !badgeHint.first.contains(event.relatedTarget)) closeBadgeHint();
    }

    function dismissBadgeHint(event) {
      if (event.type !== 'keydown' || event.key === 'Escape') closeBadgeHint();
    }

    function clearBadges(row) {
      const state = badgeRows.get(row);
      if (!state) return;
      for (const node of state.hidden) node.removeAttribute('data-tq-chat-badge-hidden');
      if (badgeHint?.row === row) closeBadgeHint();
      row.removeAttribute('data-tq-chat-badges');
      badgeRows.delete(row);
      badgeOwners.delete(row);
    }

    function compactBadges(row) {
      // A virtualized row can move between independently observed chat panes.
      // Release its former owner before taking over, in either observer order.
      const owner = badgeOwners.get(row);
      if (owner && owner !== badgeRows.get(row)) owner.release();
      const badges = [...row.querySelectorAll(BADGE)].filter(node =>
        node.closest(ROW) === row && !node.parentElement.closest(BADGE) &&
        !node.closest('.text-fragment, [data-a-target="chat-message-text"], .video-chat__message'));
      if (badges.length < 2) { clearBadges(row); return; }
      let state = badgeRows.get(row);
      if (!state) {
        state = { hidden: new Set(), release: () => clearBadges(row) };
        badgeRows.set(row, state);
        badgeOwners.set(row, state);
        row.setAttribute('data-tq-chat-badges', '');
      }
      const nameFor = badge => {
        const image = badge.matches('img') ? badge : badge.querySelector('img');
        return badgeName(badge.getAttribute('title') || image?.getAttribute('title') ||
          image?.getAttribute('alt') || badge.getAttribute('aria-label') || badge.textContent);
      };
      const hidden = new Set(badges.slice(1).map(badge => {
        // Remove the badge's empty layout wrappers too, without hiding names,
        // timestamps, other badges or any unrelated text/control.
        let node = badge;
        while (node.parentElement !== row && node.parentElement.children.length === 1 &&
            !node.parentElement.textContent.trim()) node = node.parentElement;
        return node;
      }));
      for (const node of state.hidden) if (!hidden.has(node)) node.removeAttribute('data-tq-chat-badge-hidden');
      for (const node of hidden) if (!state.hidden.has(node)) node.setAttribute('data-tq-chat-badge-hidden', '');
      state.hidden = hidden;
      state.first = badges[0];
      const image = state.first.matches('img') ? state.first : state.first.querySelector('img');
      state.names = [nameFor(state.first), badgeName(image?.getAttribute('alt')),
        badgeName(state.first.getAttribute('aria-label'))].filter(Boolean);
      state.others = badges.slice(1).map(nameFor).filter(Boolean);
      if (badgeHint?.row === row) syncBadgeHint();
    }

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
      const identity = container && row.contains(container) ? container : author;
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
      tint(row, author);
      group(row, author);
      compactBadges(row);
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
        clearBadges(row);
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

    onCleanup(() => {
      closeBadgeHint();
      for (const type of ['pointerover', 'focusin']) root.removeEventListener(type, openBadgeHint, true);
      for (const type of ['pointerout', 'focusout']) root.removeEventListener(type, leaveBadgeHint, true);
      document.removeEventListener('scroll', dismissBadgeHint, true);
      document.removeEventListener('keydown', dismissBadgeHint, true);
      for (const type of ['popstate', 'hashchange', 'pagehide', 'resize']) window.removeEventListener(type, dismissBadgeHint);
      observer.disconnect();
      for (const row of marked) if (!row.isConnected || root.contains(row)) tint(row, null);
      for (const row of grouped) if (!row.isConnected || root.contains(row)) clearGroup(row);
      for (const row of badgeRows.keys()) clearBadges(row);
      marked.clear();
      grouped.clear();
    });
    for (const type of ['pointerover', 'focusin']) root.addEventListener(type, openBadgeHint, true);
    for (const type of ['pointerout', 'focusout']) root.addEventListener(type, leaveBadgeHint, true);
    document.addEventListener('scroll', dismissBadgeHint, true);
    document.addEventListener('keydown', dismissBadgeHint, true);
    for (const type of ['popstate', 'hashchange', 'pagehide', 'resize']) window.addEventListener(type, dismissBadgeHint);
    const dirty = new Set();
    const neighbors = new Set();
    visit(root, dirty, neighbors);
    flush(dirty, neighbors);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-a-user', 'data-user-id', 'data-a-user-id', 'href', 'alt', 'title', 'aria-label', 'data-a-target'] });
  }

  let stopRegions = null;
  globalThis.TwitchMinChat = globalThis.TwitchMinRuntime.create({
    attach() { stopRegions = globalThis.TwitchMinRegions.watch(LIST, attachChat, stop => { stopRegions = stop; }); },
    dispose() { stopRegions?.(); stopRegions = null; }
  });
})();
