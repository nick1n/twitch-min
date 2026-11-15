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
      if (heading && heading.getAttribute('data-tq-section-title') !== title) heading.setAttribute('data-tq-section-title', title);
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
    const moreClicks = new Map();
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
      // Unmask native controls and titles before invoking Twitch's handlers.
      ready(false);
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
    }
    function expanded() {
      if (side.matches('.side-nav--collapsed, [data-a-target="side-nav-bar-collapsed"]')) return false;
      if (side.matches('.side-nav--expanded, [data-a-target="side-nav-bar"]')) return true;
      const label = side.querySelector('[data-a-target="side-nav-arrow"]')?.getAttribute('aria-label') || '';
      return /collapse/i.test(label) ? true : /expand/i.test(label) ? false : null;
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
      if ((compact || sections) && !current) {
        restore = true;
        pending = { button, expanded: true };
        button.click();
      } else if (!compact && !sections && restore) {
        if (!current) restore = false;
        else { pending = { button, expanded: false }; button.click(); }
      }
    }
    function sync() {
      if (!side.isConnected) return;
      syncCollapse();
      if (!enabled || (!compact && !sections) || pending || expanded() === false) {
        ready(false);
        return;
      }
      const settled = expandSections();
      if (settled) markSections(side);
      ready(settled);
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
      sides.delete(state);
      moreClicks.clear();
      ready(false);
      for (const node of side.querySelectorAll('[data-tq-section], [data-tq-section-title]')) {
        node.removeAttribute('data-tq-section');
        node.removeAttribute('data-tq-section-title');
      }
      finishPause();
    });
    sides.add(state);
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
    const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
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
        const button = [...shelf.querySelectorAll('.show-more__move-up button')].find(control =>
          /^show more$/i.test(normalize(control.textContent))
        );
        if (!button || !button.checkVisibility({ checkVisibilityCSS: true }) ||
            button.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]')) continue;
        const count = shelf.querySelectorAll('article').length;
        // A retained or replaced control can still be waiting on React. Only
        // advance after cards arrive; unrelated text/attribute edits do not retry.
        if (requested.has(shelf) && count <= requested.get(shelf)) continue;
        requested.set(shelf, count);
        button.click();
      }
    }
    const observer = new MutationObserver(expand);
    onCleanup(() => {
      observer.disconnect();
      requested.clear();
    });
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
