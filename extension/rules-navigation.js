/* Feature rules; numeric slots preserve the original CSS cascade across files. */
(() => {
  "use strict";

  const TOP_NAV = `:is(${globalThis.TwitchMinSelectors.topNav})`;

  globalThis.TwitchMinNavigationRules = Object.freeze([
    [2, {
      key: 'enabled',
      selectors: [`${TOP_NAV} input[type="search"]`, `${TOP_NAV} [data-a-target="nav-search-box"] .tw-combo-input`, `${TOP_NAV} [data-a-target="nav-search-box"] .tw-combo-input__input`],
      declaration: 'border-color: transparent !important; box-shadow: none !important; outline: none !important;'
    }],
    [3, {
      key: 'enabled',
      selectors: [`${TOP_NAV} input[type="search"]:focus`],
      declaration: 'box-shadow: inset 0 0 0 1px rgba(145, 71, 255, 0.55) !important;'
    }],
    [32, {
      key: "topNavigation",
      selectors: [
        '[data-tq-top-extra]',
        '.top-nav__prime',
        '[data-a-target="prime-offers-icon"]',
        'button[aria-label="Prime offers" i]',
        'button[aria-label="Shouts" i]',
        'button[aria-label="Luna" i]',
        '[data-a-target="top-nav-get-bits-button"]',
        '[data-a-target="bits-button"]',
        '[data-a-target="turbo-link"]',
        '[data-a-target="gift-turbo-button"]',
        '[data-test-selector="gift-turbo-button"]',
        '[data-a-target="top-nav-gift-turbo-button"]',
        'a[href="/turbo"]',
        'a[href^="/turbo?"]',
        'a[href^="/turbo/"]',
        'a[href="https://www.twitch.tv/turbo"]',
        'a[href^="https://www.twitch.tv/turbo?"]',
        'a[href^="https://www.twitch.tv/turbo/"]',
        'button[aria-label="Get Bits" i]',
        'button[aria-label="Gift Turbo" i]'
      ].map(selector => `${TOP_NAV} ${selector}`),
      declaration: "display: none !important;"
    }]
  ].map(([order, rule]) => Object.freeze([order, Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })])));
})();
