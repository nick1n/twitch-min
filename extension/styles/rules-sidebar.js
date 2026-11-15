/* Feature rules; numeric slots preserve the original CSS cascade across files. */
(() => {
  "use strict";

  const SIDEBAR = `:is(${globalThis.TwitchMinSelectors.sidebar})[data-tq-sidebar-ready]`;
  const HEADINGS = `:is(${globalThis.TwitchMinSelectors.sidebar})[data-tq-sidebar-headings]`;
  const COMPACT = `:is(${globalThis.TwitchMinSelectors.sidebar})[data-tq-sidebar-compact]`;
  const SCROLL_SIDEBAR = `:is(${globalThis.TwitchMinSelectors.sidebar}):is([data-tq-sidebar-compact], .side-nav--collapsed, [data-a-target="side-nav-bar-collapsed"])`;
  const PROMOTED = `${COMPACT} .side-nav-card__link--promoted-followed`;

  globalThis.TwitchMinSidebarRules = Object.freeze([
    [6, {
      key: "sidebarSections",
      selectors: [
        '.side-nav-section[data-tq-section="other"]',
        '.side-nav-card__link.side-nav-card__link--offline',
        '.side-nav-card:has(.side-nav-card__link--offline)',
        '.tw-transition:has(.side-nav-card__link--offline)',
        '.side-nav-card:has(.side-nav-card__avatar--offline)',
        '.side-nav__title',
        '[role="group"][aria-label*="streak" i]',
        '[aria-label^="Save your Streak" i]',
        '.side-nav-card__link div:has(> p[title^="Watch Streak" i])',
        `:is(${globalThis.TwitchMinSelectors.sidebarShowMore})`,
        '[data-a-target="side-nav-show-less-button"]',
        '[data-test-selector="ShowLess"]',
        '[data-a-target*="streak" i]',
        '[data-test-selector*="streak" i]',
        '.side-nav-streaks',
        '.side-nav-streak',
        '.side-nav-card__streak',
        '[data-a-target="side-nav-for-you"]'
      ].map(selector => `${SIDEBAR} ${selector}`),
      declaration: "display: none !important;"
    }],
    [7, {
      key: "sidebarSections",
      selectors: [`${HEADINGS} [data-tq-section-title] > *`],
      declaration: "display: none !important;"
    }],
    [8, {
      key: "sidebarSections",
      selectors: [`${HEADINGS} [data-tq-section-title]`],
      declaration: "display: block !important; box-sizing: border-box !important; width: 100% !important; height: 25px !important; min-height: 0 !important; padding: 6px 4px 3px !important; margin: 0 !important; font-size: 0 !important; line-height: 16px !important;"
    }],
    [9, {
      key: "sidebarSections",
      selectors: [`${HEADINGS} [data-tq-section-title]::before`],
      declaration: 'content: attr(data-tq-section-title); font-size: 12px !important; line-height: 16px !important; font-weight: 600 !important; color: var(--color-text-base, #dedee3);'
    }],
    [10, {
      key: "sidebarLabels",
      selectors: [COMPACT],
      // Only the horizontal layout owner gets a fixed width. In particular,
      // never set flex-basis on the overlay: its parent can be a column.
      declaration: "width: 144px !important; min-width: 144px !important; max-width: 144px !important;"
    }],
    [11, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav__overlay-wrapper`],
      declaration: "width: 100% !important; min-width: 0 !important; max-width: 100% !important;"
    }],
    [12, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link`],
      declaration: "display: grid !important; grid-template-columns: 26px minmax(0, 1fr) !important; grid-template-rows: auto auto !important; column-gap: 5px !important; row-gap: 0 !important; align-items: center !important; box-sizing: border-box !important; width: 100% !important; min-width: 0 !important; max-width: 100% !important; height: auto !important; min-height: 38px !important; margin: 0 !important; padding: 2px 4px !important;"
    }],
    [13, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link > :first-child`],
      // Includes composite/hype-train avatars without side-nav-card__avatar.
      declaration: "grid-column: 1 !important; grid-row: 1 / span 2 !important; min-width: 0 !important; width: 26px !important; height: 26px !important; overflow: hidden !important;"
    }],
    [14, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link > :first-child .tw-avatar`, `${COMPACT} .side-nav-card__link > .side-nav-card__avatar`],
      declaration: "width: 26px !important; height: 26px !important;"
    }],
    [15, {
      key: "sidebarLabels",
      selectors: [
        `${COMPACT} .side-nav-card__link > :nth-child(2)`,
        `${COMPACT} .side-nav-card__link > :nth-child(2) > :first-child`,
        `${COMPACT} .side-nav-card__link [data-a-target="side-nav-card-metadata"]`
      ],
      // Flatten native layout wrappers so count and game share the grid column.
      declaration: "display: contents !important;"
    }],
    [16, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link`, `${COMPACT} .side-nav-card__link *`],
      // Allow only the count and category to render text. Native promotional
      // captions can appear inside avatar wrappers or unexpected nested boxes.
      declaration: "font-size: 0 !important; line-height: 0 !important;"
    }],
    [17, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link [data-a-target="side-nav-live-status"]`],
      declaration: "grid-column: 2 !important; grid-row: 1 !important; justify-self: start !important; width: auto !important; min-width: 0 !important; font-size: 13px !important; line-height: 18px !important;"
    }],
    [18, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link [data-a-target="side-nav-live-status"] span[aria-hidden="true"]`],
      declaration: "font-size: 13px !important; line-height: 18px !important;"
    }],
    [19, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link .side-nav-card__metadata`],
      declaration: "grid-column: 2 !important; grid-row: 2 !important; min-width: 0 !important; max-width: 100% !important; padding: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important; line-height: 15px !important;"
    }],
    [20, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card__link .side-nav-card__metadata *`],
      declaration: "overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: inherit !important; line-height: inherit !important;"
    }],
    [21, {
      key: "sidebarLabels",
      selectors: [
        `${COMPACT} .side-nav-card__link .side-nav-card__title`,
        `${COMPACT} .side-nav-card__link > :first-child p`,
        `${COMPACT} .side-nav-card__link > :first-child [data-a-target="side-nav-title"]`,
        `${COMPACT} .side-nav-card__link > :nth-child(2) > :first-child > :not([data-a-target="side-nav-card-metadata"]):not([data-a-target="side-nav-live-status"])`,
        `${COMPACT} .side-nav-card__link [data-a-target="side-nav-card-metadata"] > :not(.side-nav-card__title):not(.side-nav-card__metadata)`,
        `${COMPACT} .side-nav-card__link > :nth-child(2) > :not(:first-child)`,
        `${COMPACT} .side-nav-card__link > :nth-child(n+3)`
      ],
      declaration: "display: none !important;"
    }],
    [22, {
      key: "sidebarLabels",
      selectors: [
        `${PROMOTED} > :first-child`,
        `${PROMOTED} :has(> .side-nav-promoted-followed-card__title)`,
        `${PROMOTED} :has(> .side-nav-card__live-status)`
      ],
      // Promoted followed channels put the entire card inside the first child.
      // Flatten its layout wrappers so the avatar, count and game join the grid.
      declaration: "display: contents !important;"
    }],
    [23, {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} :has(> .tw-avatar)`],
      declaration: "display: block !important; position: relative !important; grid-column: 1 !important; grid-row: 1 / span 2 !important; align-self: center !important; width: 26px !important; height: 26px !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important;"
    }],
    [24, {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-card__live-status`],
      declaration: "position: static !important; grid-column: 2 !important; grid-row: 1 !important; justify-self: start !important; width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; font-size: 13px !important; line-height: 18px !important;"
    }],
    [25, {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-card__live-status span[aria-hidden=\"true\"]`],
      declaration: "font-size: 13px !important; line-height: 18px !important;"
    }],
    [26, {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-promoted-followed-card__content`],
      declaration: "grid-column: 2 !important; grid-row: 2 !important; min-width: 0 !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important; line-height: 15px !important;"
    }],
    [27, {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-promoted-followed-card__content p`],
      declaration: "display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: inherit !important; line-height: inherit !important;"
    }],
    [28, {
      key: "sidebarLabels",
      selectors: [
        `${PROMOTED} .side-nav-promoted-followed-card__gradient`,
        `${PROMOTED} .side-nav-promoted-followed-card__title`,
        `${PROMOTED} .side-nav-promoted-followed-card__sponsorship`,
        `${PROMOTED} .side-nav-card__link__tooltip-arrow`,
        `${PROMOTED} :has(> .tw-avatar) > :not(.tw-avatar)`
      ],
      declaration: "display: none !important;"
    }],
    [29, {
      key: "sidebarLabels",
      selectors: [`${COMPACT} .side-nav-card`, `${COMPACT} .side-nav-section`],
      declaration: "margin-block: 0 !important;"
    }],
    [30, {
      key: "sidebarLabels",
      selectors: [`${SCROLL_SIDEBAR} .scrollable-area`, `${SCROLL_SIDEBAR} .side-nav__scrollable_content`],
      declaration: "scrollbar-width: none !important; -ms-overflow-style: none !important; overflow-y: auto !important; overflow-x: hidden !important;"
    }],
    [31, {
      key: "sidebarLabels",
      selectors: [`${SCROLL_SIDEBAR} .scrollable-area::-webkit-scrollbar`, `${SCROLL_SIDEBAR} .side-nav__scrollable_content::-webkit-scrollbar`],
      declaration: "display: none !important; width: 0 !important; height: 0 !important;"
    }]
  ].map(([order, rule]) => Object.freeze([order, Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })])));
})();
