/* Compact badges and native tooltip details; chat owns row observation. */
(() => {
  "use strict";
  const BADGE = '.chat-badge, [data-a-target="chat-badge"]';
  const TOOLTIP = globalThis.TwitchMinSelectors.tooltip;
  const badgeOwners = new WeakMap();

  function create(root, ROW, onCleanup) {
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
      const continuation = row.hasAttribute('data-tq-chat-continuation');
      if (!badges.length || (badges.length === 1 && !continuation)) { clearBadges(row); return; }
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
      // Badge labels belong to the visible sender header, not every message in
      // its run. Hide entire badge wrappers when the repeated name is hidden.
      const hidden = new Set((continuation ? badges : badges.slice(1)).map(badge => {
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

    onCleanup(() => {
      closeBadgeHint();
      for (const type of ['pointerover', 'focusin']) root.removeEventListener(type, openBadgeHint, true);
      for (const type of ['pointerout', 'focusout']) root.removeEventListener(type, leaveBadgeHint, true);
      document.removeEventListener('scroll', dismissBadgeHint, true);
      document.removeEventListener('keydown', dismissBadgeHint, true);
      for (const type of ['popstate', 'hashchange', 'pagehide', 'resize']) window.removeEventListener(type, dismissBadgeHint);
      for (const row of badgeRows.keys()) clearBadges(row);
    });
    for (const type of ['pointerover', 'focusin']) root.addEventListener(type, openBadgeHint, true);
    for (const type of ['pointerout', 'focusout']) root.addEventListener(type, leaveBadgeHint, true);
    document.addEventListener('scroll', dismissBadgeHint, true);
    document.addEventListener('keydown', dismissBadgeHint, true);
    for (const type of ['popstate', 'hashchange', 'pagehide', 'resize']) window.addEventListener(type, dismissBadgeHint);
    return Object.freeze({ update: compactBadges, release: clearBadges });
  }

  globalThis.TwitchMinChatBadges = Object.freeze({
    create,
    hasBadges: node => Boolean(node.querySelector(BADGE))
  });
})();
