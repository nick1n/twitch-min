/* Keep native metadata mounted for the compact count/game sidebar rows. */
(() => {
  "use strict";

  const SIDE = '.side-nav, [data-a-target="side-nav-bar"], [data-a-target="side-nav-bar-collapsed"]';
  const NAV = '.top-nav, [data-a-target="top-nav-container"]';
  const EXTRA = /^(?:gift turbo|get bits|buy bits|turbo|get ad-free|try 1-month ad-free|go ad-free for free|try 1 month free|try free|luna|prime offers|prime gaming|shouts)$/i;
  let started = false;
  let compact = false;
  let side = null;
  let nav = null;
  let restoreSide = null;
  let pending = null;

  function expanded() {
    if (side.matches('.side-nav--collapsed, [data-a-target="side-nav-bar-collapsed"]')) return false;
    if (side.matches('.side-nav--expanded, [data-a-target="side-nav-bar"]')) return true;
    const label = side.querySelector('[data-a-target="side-nav-arrow"]')?.getAttribute("aria-label") || "";
    if (/collapse/i.test(label)) return true;
    if (/expand/i.test(label)) return false;
    return null;
  }

  function syncSide() {
    if (!side?.isConnected) return;
    const current = expanded();
    const button = side.querySelector('[data-a-target="side-nav-arrow"]');
    if (current === null || !button) return;
    // React can commit the click asynchronously. Never click again in between.
    if (pending?.side === side && pending.button === button) {
      if (pending.expanded !== current) return;
      pending = null;
    }
    if (compact && !current) {
      // Native collapsed rows omit both viewer counts and game metadata.
      restoreSide = side;
      pending = { side, button, expanded: true };
      button.click();
    } else if (!compact && restoreSide === side) {
      if (!current) restoreSide = null;
      else {
        pending = { side, button, expanded: false };
        button.click();
      }
    }
  }

  function markNavigation() {
    if (!nav?.isConnected) return;
    for (const button of nav.querySelectorAll('button, a')) {
      // The full-size Gift Turbo control has text but no aria-label or test ID.
      const labels = [button.textContent, button.getAttribute("aria-label"), button.getAttribute("title")];
      const extra = labels.some(label => EXTRA.test((label || "").replace(/\s+/g, " ").trim()));
      if (extra) button.setAttribute("data-tq-top-extra", "");
      else button.removeAttribute("data-tq-top-extra");
    }
  }

  function markSections() {
    if (!side?.isConnected) return;
    for (const section of side.querySelectorAll('.side-nav-section')) {
      const heading = section.querySelector(':scope > .followed-side-nav-header, :scope > .side-nav-header, :scope > header') || section.firstElementChild;
      const label = (section.getAttribute('aria-label') || heading?.textContent || '').replace(/\s+/g, ' ').trim();
      const title = /^followed(?: channels)?$/i.test(label) ? 'Followed'
        : /^(?:live|recommended)(?: channels)?$/i.test(label) ? 'Live'
        : /viewers also watch|^similar(?: channels)?$/i.test(label) ? 'Similar' : 'other';
      section.setAttribute('data-tq-section', title);
      if (heading) heading.setAttribute('data-tq-section-title', title);
    }
  }

  const sideObserver = new MutationObserver(() => { syncSide(); markSections(); });
  const navObserver = new MutationObserver(markNavigation);

  function findRoots() {
    if (!side?.isConnected) {
      sideObserver.disconnect();
      side = document.querySelector(SIDE);
      pending = null;
      restoreSide = null;
      if (side) {
        sideObserver.observe(side, {
          childList: true, subtree: true, attributes: true,
          characterData: true, attributeFilter: ["class", "data-a-target", "aria-label"]
        });
        syncSide();
        markSections();
      }
    }
    if (!nav?.isConnected) {
      navObserver.disconnect();
      nav = document.querySelector(NAV);
      if (nav) {
        navObserver.observe(nav, {
          childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: ["aria-label", "title"]
        });
        markNavigation();
      }
    }
  }

  const mountObserver = new MutationObserver(() => {
    // Chat insertions do no DOM searches while both layout roots are mounted.
    if (side?.isConnected && nav?.isConnected) return;
    findRoots();
  });

  globalThis.TwitchMinLayout = Object.freeze({
    configure(settings) {
      compact = settings.enabled && settings.sidebarLabels;
      if (!started && settings.enabled) {
        started = true;
        mountObserver.observe(document, { childList: true, subtree: true });
        findRoots();
      }
      syncSide();
    }
  });
})();
