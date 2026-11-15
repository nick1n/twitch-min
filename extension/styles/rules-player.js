/* Feature rules; numeric slots preserve the original CSS cascade across files. */
(() => {
  "use strict";

  const PLAYER = `:is(${globalThis.TwitchMinSelectors.player})`;
  const CHANNEL_INFO = globalThis.TwitchMinSelectors.channelInfo;
  const CHANNEL_MENU = `:is(.channel-root__info, ${CHANNEL_INFO})`;
  const SUBSCRIBE = `${CHANNEL_INFO} :is([data-a-target="subscribe-button"], [data-a-target="resubscribe-button"], button[aria-label="Subscribe" i], button[aria-label="Resubscribe" i]):has(.tw-core-button-icon, svg)`;
  const VOD = globalThis.TwitchMinSelectors.vodRoot.replace(".channel-root", ".channel-root:not(.channel-root--theatre-mode):not(.channel-root--theatre)");

  globalThis.TwitchMinPlayerRules = Object.freeze([
    [0, {
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
    }],
    [33, {
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
    }],
    [33.5, {
      key: 'channelActions',
      // Live Share/More controls can sit outside .channel-info-content, while
      // the VOD menu has only its native Video Options accessible label.
      selectors: [
        `${CHANNEL_MENU} [data-a-target="report-button-more-button"]`,
        `${CHANNEL_MENU} button[aria-label="Video Options" i]`
      ],
      declaration: 'display: none !important;'
    }],
    [34, {
      key: "channelActions",
      selectors: [`${SUBSCRIBE} [data-a-target="tw-core-button-label-text"]`],
      // Remove the visible label and its layout space without losing the
      // accessible name on subscription variants that have no aria-label.
      declaration: "position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; padding: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; white-space: nowrap !important;"
    }],
    [35, {
      key: "channelActions",
      selectors: [`${SUBSCRIBE} .tw-core-button-icon`],
      declaration: "margin-inline: 0 !important;"
    }],
    [36, {
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
    }],
    [37, {
      key: "channelAbout",
      selectors: [VOD, `${VOD} :is(.channel-root__main, .channel-root__main--with-chat)`],
      declaration: "height: var(--tq-vod-height, 100%) !important; min-height: 0 !important;"
    }],
    [38, {
      key: "channelAbout",
      selectors: [`${VOD} :is(.channel-root__main, .channel-root__main--with-chat)`],
      declaration: "display: flex !important; flex-direction: column !important;"
    }],
    [39, {
      key: "channelAbout",
      selectors: [`${VOD} .channel-root__player`],
      declaration: "position: relative !important; flex: 1 1 0 !important; min-height: 0 !important; height: auto !important; top: auto !important;"
    }],
    [40, {
      key: "channelAbout",
      selectors: [`${VOD} .channel-root__info`],
      declaration: "position: relative !important; flex: 0 0 auto !important; height: auto !important; min-height: 0 !important; transform: none !important; margin-top: 0 !important; padding-top: 0 !important;"
    }],
    [41, {
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
    }],
    [42, {
      key: "channelAbout",
      selectors: [`${VOD} .channel-page__video-player .tw-aspect > :first-child:empty`],
      declaration: "display: none !important;"
    }]
  ].map(([order, rule]) => Object.freeze([order, Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })])));
})();
