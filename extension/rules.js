/* Keep selectors here so Twitch layout changes can be repaired in one place.
 * Semantic targets/classes first. No generated styled-component hashes.
 * Signed-in-only fallbacks are deliberately scoped to their own page region.
 */
(() => {
  "use strict";

  const RULES = Object.freeze([
    {
      key: "sidebarHeadings",
      selectors: [
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-header-expanded"]',
        '[data-a-target="side-nav-bar"] .side-nav-header',
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-arrow"]',
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-show-more-button"]',
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-show-less-button"]',
        '[data-a-target="side-nav-bar"] [data-test-selector="ShowMore"]',
        '[data-a-target="side-nav-bar"] [data-test-selector="ShowLess"]',
        '[data-a-target="side-nav-bar"] .side-nav-section > header',
        '[data-a-target="side-nav-bar"] [data-a-target*="streak" i]',
        '[data-a-target="side-nav-bar"] [data-test-selector*="streak" i]',
        '[data-a-target="side-nav-bar"] [class~="side-nav-streaks"]',
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-for-you"]'
      ],
      declaration: "display: none !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [
        '[data-a-target="side-nav-bar"] [data-a-target="side-nav-card-metadata"]',
        '[data-a-target="side-nav-bar"] .side-nav-card__title',
        '[data-a-target="side-nav-bar"] .side-nav-card__metadata',
        '[data-a-target="side-nav-bar"] .side-nav-card__link div:has(> div > .hype-train-icon)',
        '[data-a-target="side-nav-bar"] .side-nav-card__link [data-a-target*="streak" i]',
        '[data-a-target="side-nav-bar"] .side-nav-card__link [data-test-selector*="streak" i]'
      ],
      // Keep the width and height of each channel row, including viewer counts.
      declaration: "visibility: hidden !important;"
    },
    {
      key: "topNavigation",
      selectors: [
        '[data-a-target="top-nav-container"] [data-a-target="activity-feed-button"]',
        '[data-a-target="top-nav-container"] [data-a-target="notifications-button"]',
        '[data-a-target="top-nav-container"] [data-test-selector="notifications-button"]',
        '[data-a-target="top-nav-container"] [data-a-target="top-nav-get-bits-button"]',
        '[data-a-target="top-nav-container"] [data-a-target="bits-button"]',
        '[data-a-target="top-nav-container"] [data-a-target="turbo-link"]',
        '[data-a-target="top-nav-container"] [data-a-target="gift-turbo-button"]',
        '[data-a-target="top-nav-container"] [data-a-target="top-nav-gift-turbo-button"]',
        '[data-a-target="top-nav-container"] a[href="/turbo"]',
        '[data-a-target="top-nav-container"] a[href^="/turbo?"]',
        '[data-a-target="top-nav-container"] a[href="https://www.twitch.tv/turbo"]',
        '[data-a-target="top-nav-container"] a[href^="https://www.twitch.tv/turbo?"]',
        '[data-a-target="top-nav-container"] a[href="/turbo/gift"]',
        '[data-a-target="top-nav-container"] button[aria-label="Notifications" i]',
        '[data-a-target="top-nav-container"] button[aria-label="Open Notifications" i]',
        '[data-a-target="top-nav-container"] button[aria-label="Get Bits" i]',
        '[data-a-target="top-nav-container"] button[aria-label="Gift Turbo" i]'
      ],
      declaration: "display: none !important;"
    },
    {
      key: "channelActions",
      selectors: [
        '.channel-info-content [data-a-target="gift-button"]',
        '.channel-info-content [data-a-target="bits-button"]',
        '.channel-info-content [data-a-target="cheer-button"]',
        '.channel-info-content [data-a-target="notifications-toggle"]',
        '.channel-info-content [data-a-target="live-notifications-toggle"]',
        '.channel-info-content [data-a-target="notification-toggle"]',
        '.channel-info-content [data-test-selector="notifications-toggle"]',
        '.channel-info-content button[aria-label="Notification Settings" i]',
        '.channel-info-content button[aria-label="Notifications" i]',
        '.channel-info-content button[aria-label="Gift a Sub" i]',
        '.channel-info-content button[aria-label="Bits" i]'
      ],
      declaration: "display: none !important;"
    },
    {
      key: "chatLeaderboard",
      selectors: [
        // Remove the whole strip, including its carousel arrows and fixed height.
        '.chat-room__content > :has([data-test-selector="leaderboard-item-name-test-selector"])',
        '.chat-room__content > :has(button[aria-label^="Expand Top"][aria-label$="Leaderboard"])',
        '.chat-room__content > .channel-leaderboard',
        '.chat-room__content > [data-test-selector="channel-leaderboard"]'
      ],
      declaration: "display: none !important;"
    },
    {
      key: "chatComposer",
      selectors: [
        // This is the input strip, NOT .chat-input (which also owns points/settings).
        '.chat-input .chat-input__textarea',
        '.chat-input .chat-wysiwyg-input-box',
        '.chat-input [data-a-target="chat-input"]',
        '.chat-input [data-a-target="bits-button"]',
        '.chat-input [data-a-target="emote-picker-button"]'
      ],
      declaration: "display: none !important;"
    }
  ].map(rule => Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })));

  function buildCSS() {
    const { ATTRIBUTES } = globalThis.TwitchMinSettings;
    return RULES.map(({ key, selectors, declaration }) => {
      const scope = `html[${ATTRIBUTES.enabled}="true"][${ATTRIBUTES[key]}="true"]`;
      return `${selectors.map(selector => `${scope} ${selector}`).join(",\n")} {\n  ${declaration}\n}`;
    }).join("\n\n");
  }

  globalThis.TwitchMinRules = Object.freeze({ RULES, buildCSS });
})();
