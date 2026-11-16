/* Coordinate native sidebar, navigation and Following page behavior. */
(() => {
  "use strict";

  const SIDE = globalThis.TwitchMinSelectors.sidebar;
  const MORE = globalThis.TwitchMinSelectors.sidebarShowMore;
  const NAV = globalThis.TwitchMinSelectors.topNav;
  const FOLLOWING = globalThis.TwitchMinSelectors.following;
  const BROWSE = globalThis.TwitchMinSelectors.browse;
  const EXTRA = /^(?:gift turbo|get bits|buy bits|turbo|get ad-free|try 1-month ad-free|go ad-free for free|try 1 month free|try free|luna|prime offers|prime gaming|shouts)$/i;
  let enabled = false;
  let compact = false;
  let sections = false;
  let stopSides = null;
  let stopNavigation = null;
  let stopFollowing = null;
  let stopBrowse = null;
  let stoppingSides = false;
  const sides = new Set();

  function markNavigation(nav) {
    if (!nav?.isConnected) return;
    for (const button of nav.querySelectorAll('button, a')) {
      // The full-size Gift Turbo control has text but no aria-label or test ID.
      const labels = [button.textContent, button.getAttribute("aria-label"), button.getAttribute("title")];
      const extra = labels.some(label => EXTRA.test((label || "").replace(/\s+/g, " ").trim()));
      if (extra && !button.hasAttribute('data-tq-top-extra')) button.setAttribute('data-tq-top-extra', '');
      else if (!extra && button.hasAttribute('data-tq-top-extra')) button.removeAttribute('data-tq-top-extra');
    }
  }

  function markSections(side) {
    if (!side?.isConnected) return;
    for (const section of side.querySelectorAll('.side-nav-section')) {
      const heading = section.querySelector(':scope > .followed-side-nav-header, :scope > .side-nav-header, :scope > header') || section.firstElementChild;
      const label = (section.getAttribute('aria-label') || heading?.textContent || '').replace(/\s+/g, ' ').trim();
      const title = /^followed(?: channels)?$/i.test(label) ? 'Followed'
        : /^(?:live|recommended)(?: channels)?$/i.test(label) ? 'Recommended'
        : /viewers also watch|^similar(?: channels)?$/i.test(label) ? 'Similar' : 'other';
      if (section.getAttribute('data-tq-section') !== title) section.setAttribute('data-tq-section', title);
      if (heading) {
        if (title === 'other') heading.removeAttribute('data-tq-section-title');
        else if (heading.getAttribute('data-tq-section-title') !== title) heading.setAttribute('data-tq-section-title', title);
      }
    }
  }

  function finishPause() {
    if (enabled || stoppingSides || [...sides].some(state => state.restoring())) return;
    stoppingSides = true;
    try { stopSides?.(); stopSides = null; }
    finally { stoppingSides = false; }
  }

  function attachSide(side, onCleanup) {
    let restore = false;
    let pending = null;
    let userCollapsed = false;
    let automaticToggle = false;
    const moreClicks = new Map();
    function compactReady(value) {
      if (side.hasAttribute('data-tq-sidebar-compact') !== value) side.toggleAttribute('data-tq-sidebar-compact', value);
    }
    function headingsReady(value) {
      if (side.hasAttribute('data-tq-sidebar-headings') !== value) side.toggleAttribute('data-tq-sidebar-headings', value);
    }
    function ready(value) {
      if (side.hasAttribute('data-tq-sidebar-ready') !== value) side.toggleAttribute('data-tq-sidebar-ready', value);
    }
    function expandSections() {
      const buttons = [...new Set([...side.querySelectorAll(MORE)].map(control =>
        control.matches('button, a, [role="button"]') ? control : control.querySelector('button, a, [role="button"]')
      ).filter(Boolean))];
      for (const button of moreClicks.keys()) {
        if (!buttons.includes(button)) moreClicks.delete(button);
      }
      if (!buttons.length) return true;
      // Unmask native pagination controls before invoking Twitch's handlers.
      ready(false);
      side.setAttribute('data-tq-sidebar-expanding', '');
      try {
        let waiting = false;
        for (const button of buttons) {
          if (!button.checkVisibility({ checkVisibilityCSS: true })) continue;
          waiting = true;
          if (button.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]')) continue;
          const section = button.closest('.side-nav-section') || side;
          const count = section.querySelectorAll('.side-nav-card__link, a.side-nav-card').length;
          const previous = moreClicks.get(button);
          // React may retain the same Show more button for several pages. Only
          // request another page after new rows arrive, never on unrelated edits.
          if (previous && previous.section === section && count <= previous.count) continue;
          moreClicks.set(button, { section, count });
          button.click();
        }
        return !waiting;
      } finally {
        side.removeAttribute('data-tq-sidebar-expanding');
      }
    }
    function expanded() {
      if (side.matches('.side-nav--collapsed, [data-a-target="side-nav-bar-collapsed"]')) return false;
      if (side.matches('.side-nav--expanded, [data-a-target="side-nav-bar"]')) return true;
      const label = side.querySelector('[data-a-target="side-nav-arrow"]')?.getAttribute('aria-label') || '';
      return /collapse/i.test(label) ? true : /expand/i.test(label) ? false : null;
    }
    function clickToggle(button) {
      automaticToggle = true;
      try { button.click(); }
      finally { automaticToggle = false; }
    }
    function onToggle(event) {
      if (!enabled || automaticToggle) return;
      const button = event.target.closest?.('[data-a-target="side-nav-arrow"]');
      const current = expanded();
      if (!button || current === null) return;
      // Keep the native handler, including keyboard activation, in charge.
      // A deliberate collapse must not trigger our initial auto-expansion.
      userCollapsed = current;
      pending = { button, expanded: !current };
      ready(false);
      compactReady(false);
      headingsReady(false);
    }
    function syncCollapse() {
      if (!side.isConnected) return;
      const current = expanded();
      const button = side.querySelector('[data-a-target="side-nav-arrow"]');
      if (current === null || !button) return;
      // Native React clicks settle asynchronously. Retain this state through
      // a pause/resume so a pending expansion is never clicked twice.
      if (pending?.button === button) {
        if (pending.expanded !== current) return;
        pending = null;
      }
      if ((compact || sections) && !current && !userCollapsed) {
        restore = true;
        pending = { button, expanded: true };
        clickToggle(button);
      } else if (!compact && !sections && restore) {
        if (!current) restore = false;
        else { pending = { button, expanded: false }; clickToggle(button); }
      }
    }
    function sync() {
      if (!side.isConnected) return;
      syncCollapse();
      // Row sizing depends only on native expansion, not pagination completing.
      // Section filtering waits for pagination; heading/control styling does not.
      compactReady(enabled && compact && !pending && expanded() !== false);
      headingsReady(enabled && sections && !pending && expanded() !== false);
      if (!enabled || (!compact && !sections) || pending || expanded() === false) {
        ready(false);
        return;
      }
      // Headings need only native expansion. A late or stalled page must not
      // revert existing headings or prevent replacements from being labelled.
      markSections(side);
      ready(expandSections());
    }
    const state = {
      sync,
      restoring: () => side.isConnected && side.querySelector('[data-a-target="side-nav-arrow"]') && (pending || restore)
    };
    const observer = new MutationObserver(() => {
      sync();
      finishPause();
    });
    onCleanup(() => {
      observer.disconnect();
      side.removeAttribute('data-tq-sidebar-expanding');
      side.removeEventListener('click', onToggle, true);
      sides.delete(state);
      moreClicks.clear();
      compactReady(false);
      headingsReady(false);
      ready(false);
      for (const node of side.querySelectorAll('[data-tq-section], [data-tq-section-title]')) {
        node.removeAttribute('data-tq-section');
        node.removeAttribute('data-tq-section-title');
      }
      finishPause();
    });
    sides.add(state);
    side.addEventListener('click', onToggle, true);
    observer.observe(side, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-a-target', 'data-test-selector', 'aria-label', 'disabled', 'aria-disabled', 'aria-busy', 'hidden'] });
    sync();
  }

  function attachNavigation(nav, onCleanup) {
    const observer = new MutationObserver(() => markNavigation(nav));
    onCleanup(() => {
      observer.disconnect();
      for (const node of nav.querySelectorAll('[data-tq-top-extra]')) node.removeAttribute('data-tq-top-extra');
    });
    observer.observe(nav, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title'] });
    markNavigation(nav);
  }

  function attachFollowing(page, onCleanup) {
    const requested = new Map();
    const pendingRestores = new Set();
    const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    let restoreFrame = null;
    const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
    function capturePosition(shelf) {
      const scrolls = [];
      for (let element = page; element; element = element.parentElement) {
        scrolls.push({ element, left: element.scrollLeft, top: element.scrollTop });
      }
      return { shelf, scrolls, focus: document.activeElement };
    }
    function restorePosition(position) {
      if (!enabled || !page.isConnected || !page.contains(position.shelf)) return;
      if (position.focus?.isConnected && document.activeElement !== position.focus && page.contains(document.activeElement)) {
        document.activeElement.blur();
        position.focus.focus({ preventScroll: true });
      }
      for (const { element, left, top } of position.scrolls) {
        if (element.isConnected && (element.scrollLeft !== left || element.scrollTop !== top)) {
          element.scrollTo({ left, top, behavior: 'instant' });
        }
      }
    }
    function preservePosition(position) {
      if (!position) return;
      restorePosition(position);
      pendingRestores.add(position);
      if (restoreFrame !== null) return;
      // Native handlers may focus/scroll after React commits the new cards.
      // Settle once after layout; never keep the viewport pinned with a loop.
      restoreFrame = requestAnimationFrame(() => {
        restoreFrame = null;
        for (const pending of pendingRestores) restorePosition(pending);
        pendingRestores.clear();
      });
    }
    function cancelRestoration() {
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
      restoreFrame = null;
      pendingRestores.clear();
      for (const request of requested.values()) request.position = null;
    }
    function expand() {
      if (!enabled || !page.isConnected) return;
      const shelves = [...page.querySelectorAll('[aria-labelledby]')].filter(shelf =>
        (shelf.getAttribute('aria-labelledby') || '').split(/\s+/).some(id => {
          const heading = document.getElementById(id);
          if (!heading || !page.contains(heading)) return false;
          return heading.matches('[data-a-target="followed-videos-header"]') ||
            heading.querySelector('[data-a-target="followed-videos-header"]') ||
            /^(?:recommended channels|latest videos)$/i.test(normalize(heading.getAttribute('aria-label') || heading.textContent));
        })
      );
      for (const shelf of requested.keys()) {
        if (!shelves.includes(shelf)) requested.delete(shelf);
      }
      for (const shelf of shelves) {
        const count = shelf.querySelectorAll('article').length;
        const previous = requested.get(shelf);
        if (previous && count > previous.count) {
          preservePosition(previous.position);
          previous.position = null;
        }
        const button = [...shelf.querySelectorAll('.show-more__move-up button')].find(control =>
          /^show more$/i.test(normalize(control.textContent))
        );
        if (!button || !button.checkVisibility({ checkVisibilityCSS: true }) ||
            button.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]')) continue;
        // A retained or replaced control can still be waiting on React. Only
        // advance after cards arrive; unrelated text/attribute edits do not retry.
        if (previous && count <= previous.count) continue;
        const position = capturePosition(shelf);
        requested.set(shelf, { count, position });
        button.click();
        preservePosition(position);
      }
    }
    const observer = new MutationObserver(expand);
    onCleanup(() => {
      observer.disconnect();
      cancelRestoration();
      for (const type of inputEvents) document.removeEventListener(type, cancelRestoration, true);
      requested.clear();
    });
    // User scrolling, focusing, or navigation always wins over saved positions.
    for (const type of inputEvents) document.addEventListener(type, cancelRestoration, { capture: true, passive: true });
    observer.observe(page, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['aria-labelledby', 'aria-label', 'disabled', 'aria-disabled', 'aria-busy', 'hidden', 'class']
    });
    expand();
  }

  function attachBrowse(page, onCleanup) {
    const marked = new Set();
    function markRecaps() {
      if (!enabled || !page.isConnected) return;
      const matches = new Set();
      for (const heading of page.querySelectorAll('h2')) {
        if (!/^recent recaps$/i.test(heading.textContent.replace(/\s+/g, ' ').trim())) continue;
        // Twitch supplies no recap-specific ID. Match the heading's own shelf,
        // never a shared ancestor that also contains filters or live channels.
        const shelf = heading.parentElement?.parentElement;
        if (shelf !== page && page.contains(shelf) && shelf.querySelector(':scope > .preview-card-carousel')) matches.add(shelf);
      }
      for (const shelf of marked) {
        if (matches.has(shelf)) continue;
        shelf.removeAttribute('data-tq-recent-recaps');
        marked.delete(shelf);
      }
      for (const shelf of matches) {
        marked.add(shelf);
        if (!shelf.hasAttribute('data-tq-recent-recaps')) shelf.setAttribute('data-tq-recent-recaps', '');
      }
    }
    const observer = new MutationObserver(markRecaps);
    onCleanup(() => {
      observer.disconnect();
      for (const shelf of marked) shelf.removeAttribute('data-tq-recent-recaps');
      marked.clear();
    });
    observer.observe(page, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    markRecaps();
  }

  function update(settings) {
    enabled = true;
    compact = settings.sidebarLabels === true;
    sections = settings.sidebarSections === true;
    if (!stopSides) stopSides = globalThis.TwitchMinRegions.watch(SIDE, attachSide, stop => { stopSides = stop; });
    if (!stopNavigation) stopNavigation = globalThis.TwitchMinRegions.watch(NAV, attachNavigation, stop => { stopNavigation = stop; });
    if (!stopFollowing) stopFollowing = globalThis.TwitchMinRegions.watch(FOLLOWING, attachFollowing, stop => { stopFollowing = stop; });
    if (settings.browseRecaps) {
      if (!stopBrowse) stopBrowse = globalThis.TwitchMinRegions.watch(BROWSE, attachBrowse, stop => { stopBrowse = stop; });
    } else {
      stopBrowse?.();
      stopBrowse = null;
    }
    for (const state of sides) state.sync();
  }

  globalThis.TwitchMinLayout = globalThis.TwitchMinRuntime.create({
    attach: update,
    update,
    dispose() {
      enabled = compact = sections = false;
      stopNavigation?.();
      stopNavigation = null;
      stopFollowing?.();
      stopFollowing = null;
      stopBrowse?.();
      stopBrowse = null;
      for (const state of sides) state.sync();
      // Only the sidebar subscription survives until native restoration settles.
      finishPause();
    }
  });
})();
