/* Keep selectors here so Twitch layout changes can be repaired in one place.
 * Semantic targets/classes first. No generated styled-component hashes.
 * Signed-in-only fallbacks are deliberately scoped to their own page region.
 */
(() => {
  "use strict";

  const SIDEBAR = ':is(.side-nav, [data-a-target="side-nav-bar"], [data-a-target="side-nav-bar-collapsed"])';
  const PROMOTED = `${SIDEBAR} .side-nav-card__link--promoted-followed`;
  const TOP_NAV = ':is(.top-nav, [data-a-target="top-nav-container"])';
  const PLAYER = ':is(.video-player, [data-a-target="video-player"], .channel-page__video-player)';
  const CHANNEL_INFO = ':is(.channel-info-content, .video-info, [data-a-target="video-info"], .metadata-layout__support)';
  const SUBSCRIBE = `${CHANNEL_INFO} :is([data-a-target="subscribe-button"], [data-a-target="resubscribe-button"], button[aria-label="Subscribe" i], button[aria-label="Resubscribe" i]):has(.tw-core-button-icon, svg)`;
  const VOD = '.channel-root:not(.channel-root--theatre-mode):not(.channel-root--theatre):has(.metadata-layout__split-top [data-a-target="video-info-game-boxart-link"])';

  const RULES = Object.freeze([
    {
      key: 'enabled',
      selectors: [
        '[data-a-target="player-clip-button"]',
        'button[aria-label="Clip" i]',
        'button[aria-label^="Clip (" i]',
        'button[aria-label="Create Clip" i]',
        'button[aria-label="Subscribe to clip" i]',
        // Hide only the middle rate display; keep decrease/increase controls.
        '.tp-ps-group > :nth-child(2)',
        '[data-a-target="follow-button"]',
        '[data-a-target="unfollow-button"]',
        '[data-a-target="gift-button"]',
        '[data-a-target="subscribe-button"]',
        '[data-a-target="resubscribe-button"]',
        'button[aria-label="Follow" i]',
        'button[aria-label^="Follow " i]',
        'button[aria-label="Unfollow" i]',
        'button[aria-label^="Unfollow " i]',
        'button[aria-label="Gift a Sub" i]',
        'button[aria-label="Subscribe" i]',
        'button[aria-label="Resubscribe" i]'
      ].map(selector => `${PLAYER} ${selector}`),
      declaration: 'display: none !important;'
    },
    {
      key: 'enabled',
      selectors: [
        '.stream-chat-header',
        '.video-chat__header',
        '.right-column__toggle-visibility.toggle-visibility__right-column--expanded'
      ],
      // The collapse control floats outside the header. Keep the collapsed
      // state's expand control available so chat can still be reopened.
      declaration: 'display: none !important;'
    },
    {
      key: 'enabled',
      selectors: [`${TOP_NAV} input[type="search"]`, `${TOP_NAV} [data-a-target="nav-search-box"] .tw-combo-input`, `${TOP_NAV} [data-a-target="nav-search-box"] .tw-combo-input__input`],
      declaration: 'border-color: transparent !important; box-shadow: none !important; outline: none !important;'
    },
    {
      key: 'enabled',
      selectors: [`${TOP_NAV} input[type="search"]:focus`],
      declaration: 'box-shadow: inset 0 0 0 1px rgba(145, 71, 255, 0.55) !important;'
    },
    {
      key: 'enabled',
      selectors: ['[data-tq-chat-tint]'],
      // Overlay the native background so mentions and moderation highlights stay.
      declaration: 'background-image: linear-gradient(var(--tq-chat-tint), var(--tq-chat-tint)) !important; background-image: linear-gradient(color-mix(in srgb, var(--tq-chat-color) 6%, transparent), color-mix(in srgb, var(--tq-chat-color) 6%, transparent)) !important; border-radius: 2px;'
    },
    {
      key: 'enabled',
      selectors: ['[data-tq-chat-continuation] [data-tq-chat-author]', '[data-tq-chat-continuation] [data-tq-chat-separator]'],
      declaration: 'display: none !important;'
    },
    {
      key: "sidebarSections",
      selectors: [
        '.side-nav-section[data-tq-section="other"]',
        '.side-nav-card__link--offline',
        '.side-nav-card:has(.side-nav-card__link--offline)',
        '.tw-transition:has(.side-nav-card__link--offline)',
        '.side-nav-card:has(.side-nav-card__avatar--offline)',
        '.side-nav__title',
        '[role="group"][aria-label*="streak" i]',
        '[aria-label^="Save your Streak" i]',
        '.side-nav-card__link div:has(> p[title^="Watch Streak" i])',
        '.collapse-toggle',
        '[data-a-target="side-nav-arrow"]',
        '[data-a-target="side-nav-show-more-button"]',
        '[data-a-target="side-nav-show-less-button"]',
        '[data-test-selector="ShowMore"]',
        '[data-test-selector="ShowLess"]',
        '[data-a-target*="streak" i]',
        '[data-test-selector*="streak" i]',
        '.side-nav-streaks',
        '.side-nav-streak',
        '.side-nav-card__streak',
        '[data-a-target="side-nav-for-you"]'
      ].map(selector => `${SIDEBAR} ${selector}`),
      declaration: "display: none !important;"
    },
    {
      key: "sidebarSections",
      selectors: [`${SIDEBAR} [data-tq-section-title] > *`],
      declaration: "display: none !important;"
    },
    {
      key: "sidebarSections",
      selectors: [`${SIDEBAR} [data-tq-section-title]`],
      declaration: "display: block !important; box-sizing: border-box !important; width: 100% !important; height: 25px !important; min-height: 0 !important; padding: 6px 4px 3px !important; margin: 0 !important; font-size: 0 !important; line-height: 16px !important;"
    },
    {
      key: "sidebarSections",
      selectors: [`${SIDEBAR} [data-tq-section-title]::before`],
      declaration: 'content: attr(data-tq-section-title); font-size: 12px !important; line-height: 16px !important; font-weight: 600 !important; color: var(--color-text-base, #dedee3);'
    },
    {
      key: "sidebarLabels",
      selectors: ['.side-nav', '[data-a-target="side-nav-bar"]', '[data-a-target="side-nav-bar-collapsed"]'],
      // Only the horizontal layout owner gets a fixed width. In particular,
      // never set flex-basis on the overlay: its parent can be a column.
      declaration: "width: 144px !important; min-width: 144px !important; max-width: 144px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav__overlay-wrapper`],
      declaration: "width: 100% !important; min-width: 0 !important; max-width: 100% !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link`],
      declaration: "display: grid !important; grid-template-columns: 26px minmax(0, 1fr) !important; grid-template-rows: auto auto !important; column-gap: 5px !important; row-gap: 0 !important; align-items: center !important; box-sizing: border-box !important; width: 100% !important; min-width: 0 !important; max-width: 100% !important; height: auto !important; min-height: 38px !important; margin: 0 !important; padding: 2px 4px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link > :first-child`],
      // Includes composite/hype-train avatars without side-nav-card__avatar.
      declaration: "grid-column: 1 !important; grid-row: 1 / span 2 !important; min-width: 0 !important; width: 26px !important; height: 26px !important; overflow: hidden !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link > :first-child .tw-avatar`, `${SIDEBAR} .side-nav-card__link > .side-nav-card__avatar`],
      declaration: "width: 26px !important; height: 26px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [
        `${SIDEBAR} .side-nav-card__link > :nth-child(2)`,
        `${SIDEBAR} .side-nav-card__link > :nth-child(2) > :first-child`,
        `${SIDEBAR} .side-nav-card__link [data-a-target="side-nav-card-metadata"]`
      ],
      // Flatten native layout wrappers so count and game share the grid column.
      declaration: "display: contents !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link`, `${SIDEBAR} .side-nav-card__link *`],
      // Allow only the count and category to render text. Native promotional
      // captions can appear inside avatar wrappers or unexpected nested boxes.
      declaration: "font-size: 0 !important; line-height: 0 !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link [data-a-target="side-nav-live-status"]`],
      declaration: "grid-column: 2 !important; grid-row: 1 !important; justify-self: start !important; width: auto !important; min-width: 0 !important; font-size: 13px !important; line-height: 18px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link [data-a-target="side-nav-live-status"] span[aria-hidden="true"]`],
      declaration: "font-size: 13px !important; line-height: 18px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link .side-nav-card__metadata`],
      declaration: "grid-column: 2 !important; grid-row: 2 !important; min-width: 0 !important; max-width: 100% !important; padding: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important; line-height: 15px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card__link .side-nav-card__metadata *`],
      declaration: "overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: inherit !important; line-height: inherit !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [
        `${SIDEBAR} .side-nav-card__link .side-nav-card__title`,
        `${SIDEBAR} .side-nav-card__link > :first-child p`,
        `${SIDEBAR} .side-nav-card__link > :first-child [data-a-target="side-nav-title"]`,
        `${SIDEBAR} .side-nav-card__link > :nth-child(2) > :first-child > :not([data-a-target="side-nav-card-metadata"]):not([data-a-target="side-nav-live-status"])`,
        `${SIDEBAR} .side-nav-card__link [data-a-target="side-nav-card-metadata"] > :not(.side-nav-card__title):not(.side-nav-card__metadata)`,
        `${SIDEBAR} .side-nav-card__link > :nth-child(2) > :not(:first-child)`,
        `${SIDEBAR} .side-nav-card__link > :nth-child(n+3)`
      ],
      declaration: "display: none !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [
        `${PROMOTED} > :first-child`,
        `${PROMOTED} :has(> .side-nav-promoted-followed-card__title)`,
        `${PROMOTED} :has(> .side-nav-card__live-status)`
      ],
      // Promoted followed channels put the entire card inside the first child.
      // Flatten its layout wrappers so the avatar, count and game join the grid.
      declaration: "display: contents !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} :has(> .tw-avatar)`],
      declaration: "display: block !important; position: relative !important; grid-column: 1 !important; grid-row: 1 / span 2 !important; align-self: center !important; width: 26px !important; height: 26px !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-card__live-status`],
      declaration: "position: static !important; grid-column: 2 !important; grid-row: 1 !important; justify-self: start !important; width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; font-size: 13px !important; line-height: 18px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-card__live-status span[aria-hidden=\"true\"]`],
      declaration: "font-size: 13px !important; line-height: 18px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-promoted-followed-card__content`],
      declaration: "grid-column: 2 !important; grid-row: 2 !important; min-width: 0 !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: 12px !important; line-height: 15px !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${PROMOTED} .side-nav-promoted-followed-card__content p`],
      declaration: "display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; font-size: inherit !important; line-height: inherit !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [
        `${PROMOTED} .side-nav-promoted-followed-card__gradient`,
        `${PROMOTED} .side-nav-promoted-followed-card__title`,
        `${PROMOTED} .side-nav-promoted-followed-card__sponsorship`,
        `${PROMOTED} .side-nav-card__link__tooltip-arrow`,
        `${PROMOTED} :has(> .tw-avatar) > :not(.tw-avatar)`
      ],
      declaration: "display: none !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .side-nav-card`, `${SIDEBAR} .side-nav-section`],
      declaration: "margin-block: 0 !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .scrollable-area`, `${SIDEBAR} .side-nav__scrollable_content`],
      declaration: "scrollbar-width: none !important; -ms-overflow-style: none !important; overflow-y: auto !important; overflow-x: hidden !important;"
    },
    {
      key: "sidebarLabels",
      selectors: [`${SIDEBAR} .scrollable-area::-webkit-scrollbar`, `${SIDEBAR} .side-nav__scrollable_content::-webkit-scrollbar`],
      declaration: "display: none !important; width: 0 !important; height: 0 !important;"
    },
    {
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
    },
    {
      key: "channelActions",
      selectors: [
        '[data-a-target="gift-button"]',
        '[data-a-target="bits-button"]',
        '[data-a-target="top-nav-get-bits-button"]',
        '[data-a-target="cheer-button"]',
        '[data-a-target="notifications-toggle"]',
        '[data-a-target="live-notifications-toggle"]',
        '[data-a-target="notification-toggle"]',
        '[data-test-selector="notifications-toggle"]',
        '[data-a-target="share-button"]',
        '[data-test-selector="share-button"]',
        'button[aria-label="Share" i]',
        'button[aria-label="Notification Settings" i]',
        'button[aria-label="Notifications" i]',
        'button[aria-label="Gift a Sub" i]',
        'button[aria-label="Get Bits" i]',
        'button[aria-label="Bits" i]'
      ].map(selector => `${CHANNEL_INFO} ${selector}`),
      declaration: "display: none !important;"
    },
    {
      key: "channelActions",
      selectors: [`${SUBSCRIBE} [data-a-target="tw-core-button-label-text"]`],
      // Remove the visible label and its layout space without losing the
      // accessible name on subscription variants that have no aria-label.
      declaration: "position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; white-space: nowrap !important;"
    },
    {
      key: "channelActions",
      selectors: [`${SUBSCRIBE} .tw-core-button-icon`],
      declaration: "margin-inline: 0 !important;"
    },
    {
      key: "channelAbout",
      selectors: [
        // VOD title/category/views live in split-top. Its following sibling is
        // the gray channel card, not .about-section (the live-page variant).
        '.channel-info-content .metadata-layout__split-top:has([data-a-target="video-info-game-boxart-link"]) ~ *',
        '.channel-info-content:has(.metadata-layout__split-top [data-a-target="video-info-game-boxart-link"]) > #live-channel-stream-information ~ *',
        '.about-section',
        '.channel-about',
        '.channel-panels',
        '[data-a-target="channel-about-panel"]',
        '[data-a-target="channel-panels"]',
        '[data-test-selector="channel-about-panel"]',
        '[data-test-selector="about-section"]'
      ],
      declaration: "display: none !important;"
    },
    {
      key: "channelAbout",
      selectors: [VOD, `${VOD} :is(.channel-root__main, .channel-root__main--with-chat)`],
      declaration: "height: var(--tq-vod-height, 100%) !important; min-height: 0 !important;"
    },
    {
      key: "channelAbout",
      selectors: [`${VOD} :is(.channel-root__main, .channel-root__main--with-chat)`],
      declaration: "display: flex !important; flex-direction: column !important;"
    },
    {
      key: "channelAbout",
      selectors: [`${VOD} .channel-root__player`],
      declaration: "position: relative !important; flex: 1 1 0 !important; min-height: 0 !important; height: auto !important; top: auto !important;"
    },
    {
      key: "channelAbout",
      selectors: [`${VOD} .channel-root__info`],
      declaration: "position: relative !important; flex: 0 0 auto !important; height: auto !important; min-height: 0 !important; transform: none !important; margin-top: 0 !important; padding-top: 0 !important;"
    },
    {
      key: "channelAbout",
      selectors: [
        `${VOD} .channel-root__player > div`,
        `${VOD} .channel-root__player > div > div`,
        `${VOD} .channel-root__player > div > div > div`,
        `${VOD} .channel-root__player-background`,
        `${VOD} .channel-page__video-player`,
        `${VOD} .channel-page__video-player .tw-aspect`
      ],
      declaration: "height: 100% !important; min-height: 0 !important; max-height: none !important;"
    },
    {
      key: "channelAbout",
      selectors: [`${VOD} .channel-page__video-player .tw-aspect > :first-child:empty`],
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
      key: "chatTimestamps",
      selectors: ['[data-tq-time]'],
      // Keep Twitch's original text and seek handler; change visual formatting.
      declaration: "font-size: 0 !important;"
    },
    {
      key: "chatTimestamps",
      selectors: ['[data-tq-time]::after'],
      declaration: 'content: attr(data-tq-time); font-size: 12px !important; line-height: inherit;'
    },
    {
      key: "chatComposer",
      selectors: [
        // This is the input strip, NOT .chat-input (which also owns points/settings).
        '.chat-input__textarea',
        '.chat-wysiwyg-input-box',
        '[data-a-target="chat-input"]',
        '[data-a-target="bits-button"]',
        '[data-a-target="emote-picker-button"]'
      ].map(selector => `.chat-input:not([data-tq-composer-open]) ${selector}`),
      declaration: "display: none !important;"
    },
    {
      key: "chatComposer",
      selectors: ['.chat-input [data-a-target="chat-send-button"]'],
      declaration: 'display: none !important;'
    },
    {
      key: "chatComposer",
      selectors: ['.chat-input [data-tq-chat-toggle]'],
      declaration: 'display: inline-flex; align-items: center; justify-content: center; height: 30px; padding: 0 10px; border: 0; border-radius: 4px; background: var(--color-background-button-primary-default, #9147ff); color: var(--color-text-button-primary, #fff); font-size: 13px; font-weight: 600; line-height: normal; font-family: inherit; cursor: pointer;'
    },
    {
      key: "chatComposer",
      selectors: ['.chat-input [data-tq-chat-toggle]:hover'],
      declaration: 'background: var(--color-background-button-primary-hover, #772ce8);'
    },
    {
      key: "chatComposer",
      selectors: ['.chat-input [data-tq-chat-toggle]:focus-visible'],
      declaration: 'outline: 2px solid var(--color-border-input-focus, #a970ff); outline-offset: 2px;'
    }
  ].map(rule => Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })));

  function buildCSS() {
    const { ATTRIBUTES } = globalThis.TwitchMinSettings;
    return RULES.map(({ key, selectors, declaration }) => {
      const scope = `html[${ATTRIBUTES.enabled}="true"]${key === 'enabled' ? '' : `[${ATTRIBUTES[key]}="true"]`}`;
      return `${selectors.map(selector => `${scope} ${selector}`).join(",\n")} {\n  ${declaration}\n}`;
    }).join("\n\n");
  }

  globalThis.TwitchMinRules = Object.freeze({ RULES, buildCSS });
})();
