// Model Twitch's asynchronous native collapse action, including its different
// collapsed link class and omitted metadata. Compact rows need native expansion.
(() => {
  window.__nativeSidebarClicks = 0;
  function render(side, expanded) {
    side.classList.toggle('side-nav--expanded', expanded);
    side.classList.toggle('side-nav--collapsed', !expanded);
    side.setAttribute('data-a-target', expanded ? 'side-nav-bar' : 'side-nav-bar-collapsed');
    side.querySelector('[data-a-target="side-nav-arrow"]')?.setAttribute('aria-label', expanded ? 'Collapse Side Nav' : 'Expand Side Nav');
    for (const row of side.querySelectorAll('a.side-nav-card, a.side-nav-card__link')) {
      row.classList.toggle('side-nav-card__link', expanded);
      row.classList.toggle('side-nav-card', !expanded);
    }
    for (const row of side.querySelectorAll('a.side-nav-card, a.side-nav-card__link')) if (row.children[1]) row.children[1].hidden = !expanded;
  }
  window.__mountNativeSidebar = side => {
    side.querySelector('[data-a-target="side-nav-arrow"]').addEventListener('click', () => {
      window.__nativeSidebarClicks++;
      const next = side.classList.contains('side-nav--collapsed');
      setTimeout(() => render(side, next), 10);
    });
  };
  window.__setNativeSidebarExpanded = expanded => render(document.querySelector('#sidebar-shell'), expanded);
  const side = document.querySelector('#sidebar-shell');
  render(side, !window.__initialSidebarCollapsed);
  window.__mountNativeSidebar(side);
})();
