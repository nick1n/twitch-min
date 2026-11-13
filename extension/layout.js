/* Keep native metadata mounted for the compact count/game sidebar rows. */
(() => {
  "use strict";

  const SIDE = globalThis.TwitchMinSelectors.sidebar;
  const NAV = globalThis.TwitchMinSelectors.topNav;
  const EXTRA = /^(?:gift turbo|get bits|buy bits|turbo|get ad-free|try 1-month ad-free|go ad-free for free|try 1 month free|try free|luna|prime offers|prime gaming|shouts)$/i;
  let enabled = false;
  let compact = false;
  let stopSides = null;
  let stopNavigation = null;
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
    if (enabled || [...sides].some(state => state.restoring())) return;
    const stop = stopSides;
    stopSides = null;
    stop?.();
  }

  function attachSide(side) {
    let restore = false;
    let pending = null;
    function expanded() {
      if (side.matches('.side-nav--collapsed, [data-a-target="side-nav-bar-collapsed"]')) return false;
      if (side.matches('.side-nav--expanded, [data-a-target="side-nav-bar"]')) return true;
      const label = side.querySelector('[data-a-target="side-nav-arrow"]')?.getAttribute('aria-label') || '';
      return /collapse/i.test(label) ? true : /expand/i.test(label) ? false : null;
    }
    function sync() {
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
      if (compact && !current) {
        restore = true;
        pending = { button, expanded: true };
        button.click();
      } else if (!compact && restore) {
        if (!current) restore = false;
        else { pending = { button, expanded: false }; button.click(); }
      }
    }
    const state = {
      sync,
      restoring: () => side.isConnected && side.querySelector('[data-a-target="side-nav-arrow"]') && (pending || restore)
    };
    sides.add(state);
    const observer = new MutationObserver(() => {
      sync();
      if (enabled) markSections(side);
      finishPause();
    });
    observer.observe(side, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-a-target', 'aria-label'] });
    sync();
    if (enabled) markSections(side);
    return () => {
      observer.disconnect();
      sides.delete(state);
      for (const node of side.querySelectorAll('[data-tq-section], [data-tq-section-title]')) {
        node.removeAttribute('data-tq-section');
        node.removeAttribute('data-tq-section-title');
      }
      finishPause();
    };
  }

  function attachNavigation(nav) {
    const observer = new MutationObserver(() => markNavigation(nav));
    observer.observe(nav, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title'] });
    markNavigation(nav);
    return () => {
      observer.disconnect();
      for (const node of nav.querySelectorAll('[data-tq-top-extra]')) node.removeAttribute('data-tq-top-extra');
    };
  }

  function update(settings) {
    enabled = true;
    compact = settings.sidebarLabels === true;
    if (!stopSides) stopSides = globalThis.TwitchMinRegions.watch(SIDE, attachSide);
    if (!stopNavigation) stopNavigation = globalThis.TwitchMinRegions.watch(NAV, attachNavigation);
    for (const state of sides) state.sync();
  }

  globalThis.TwitchMinLayout = globalThis.TwitchMinRuntime.create({
    attach: update,
    update,
    dispose() {
      enabled = compact = false;
      stopNavigation?.();
      stopNavigation = null;
      for (const state of sides) state.sync();
      // Only the sidebar subscription survives until native restoration settles.
      finishPause();
    }
  });
})();
