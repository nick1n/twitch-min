/* Feature rules; numeric slots preserve the original CSS cascade across files. */
(() => {
  "use strict";

  const COMPOSER = globalThis.TwitchMinSelectors.composer;
  const CHAT_SCROLLERS = ['[data-a-target="chat-scroller"]', '.video-chat__message-list-wrapper'];
  const REWARDS = '.reward-center__content .rewards-list';
  const POWER_UP = '[class*="bitsRewardListItem--"]';
  const REWARD = '[class*="rewardListItem--"]';
  const REWARD_CELL = `${REWARDS} > :is(${POWER_UP}, :has(> ${REWARD}))`;


  globalThis.TwitchMinChatRules = Object.freeze([
    [1, {
      key: 'enabled',
      selectors: [
        '.stream-chat-header',
        '.video-chat__header',
        '.right-column__toggle-visibility.toggle-visibility__right-column--expanded'
      ],
      // The collapse control floats outside the header. Keep the collapsed
      // state's expand control available so chat can still be reopened.
      declaration: 'display: none !important;'
    }],
    [1.5, {
      key: 'enabled',
      selectors: CHAT_SCROLLERS,
      // Hide only the scrollbar chrome; keep native overflow and scrolling.
      declaration: 'scrollbar-width: none !important;'
    }],
    [1.6, {
      key: 'enabled',
      selectors: CHAT_SCROLLERS.map(selector => `${selector}::-webkit-scrollbar`),
      declaration: 'display: none !important; width: 0 !important; height: 0 !important;'
    }],
    [1.7, {
      key: 'enabled',
      selectors: ['.vod-message .video-chat__message-menu'],
      declaration: 'display: none !important;'
    }],
    [4, {
      key: 'enabled',
      selectors: ['[data-tq-chat-tint]'],
      // Overlay the native background so mentions and moderation highlights stay.
      declaration: 'background-image: linear-gradient(var(--tq-chat-tint), var(--tq-chat-tint)) !important; background-image: linear-gradient(color-mix(in srgb, var(--tq-chat-color) 6%, transparent), color-mix(in srgb, var(--tq-chat-color) 6%, transparent)) !important; border-radius: 2px;'
    }],
    [4.5, {
      key: 'enabled',
      selectors: ['[data-tq-chat-tint].bttv-split-chat-alt-bg'],
      // BetterTTV zebra stripes otherwise change the base under equal tints.
      declaration: 'background-color: transparent !important;'
    }],
    [4.75, {
      key: 'enabled',
      selectors: ['.vod-message:not([data-tq-chat-continuation])', '.chat-line__message:not([data-tq-chat-continuation])'],
      declaration: 'border-top: 1px solid #000 !important;'
    }],
    [4.8, {
      key: 'enabled',
      selectors: ['.vod-message'],
      // Inline badges and emotes raise the first text baseline, independently
      // of the timestamp column's height. Follow that baseline, even on wraps.
      declaration: 'align-items: baseline !important;'
    }],
    [5, {
      key: 'enabled',
      selectors: ['[data-tq-chat-continuation] [data-tq-chat-author]', '[data-tq-chat-continuation] [data-tq-chat-separator]', '[data-tq-chat-continuation] :is(.chat-badge, [data-a-target="chat-badge"], .chat-line__message--flair, .chat-author__flair)'],
      declaration: 'display: none !important;'
    }],
    [5.5, {
      key: 'enabled',
      selectors: ['[data-tq-chat-badge-hidden]'],
      declaration: 'display: none !important;'
    }],
    [5.6, {
      key: 'enabled',
      selectors: ['[data-tq-chat-badge-details]'],
      declaration: 'display: block; white-space: pre-line;'
    }],
    [43, {
      key: "chatLeaderboard",
      selectors: [
        // Remove the whole strip, including its carousel arrows and fixed height.
        '.chat-room__content > :has([data-test-selector="leaderboard-item-name-test-selector"])',
        '.chat-room__content > :has(button[aria-label^="Expand Top"][aria-label$="Leaderboard"])',
        '.chat-room__content > .channel-leaderboard',
        '.chat-room__content > [data-test-selector="channel-leaderboard"]'
      ],
      declaration: "display: none !important;"
    }],
    [44, {
      key: "chatTimestamps",
      selectors: ['[data-tq-time]'],
      // Keep Twitch's original text and seek handler; change visual formatting.
      declaration: "font-size: 0 !important;"
    }],
    [45, {
      key: "chatTimestamps",
      selectors: ['[data-tq-time]::after'],
      declaration: 'content: attr(data-tq-time); font-size: 12px !important; line-height: inherit;'
    }],
    [46, {
      key: "chatComposer",
      selectors: [
        // This is the input strip, NOT .chat-input (which also owns points/settings).
        '.chat-input__textarea',
        '.chat-wysiwyg-input-box',
        '[data-a-target="chat-input"]',
        '[data-a-target="bits-button"]',
        '[data-a-target="emote-picker-button"]'
      ].map(selector => `${COMPOSER}:not([data-tq-composer-open]) ${selector}`),
      declaration: "display: none !important;"
    }],
    [47, {
      key: "chatComposer",
      selectors: [`${COMPOSER} [data-a-target="chat-send-button"]`],
      declaration: 'display: none !important;'
    }],
    [48, {
      key: "chatComposer",
      selectors: [`${COMPOSER} [data-tq-chat-toggle]`],
      declaration: 'display: inline-flex; align-items: center; justify-content: center; height: 30px; padding: 0 10px; border: 0; border-radius: 4px; background: var(--color-background-button-primary-default, #9147ff); color: var(--color-text-button-primary, #fff); font-size: 13px; font-weight: 600; line-height: normal; font-family: inherit; cursor: pointer;'
    }],
    [49, {
      key: "chatComposer",
      selectors: [`${COMPOSER} [data-tq-chat-toggle]:hover`],
      declaration: 'background: var(--color-background-button-primary-hover, #772ce8);'
    }],
    [50, {
      key: "chatComposer",
      selectors: [`${COMPOSER} [data-tq-chat-toggle]:focus-visible`],
      declaration: 'outline: 2px solid var(--color-border-input-focus, #a970ff); outline-offset: 2px;'
    }],
    [51, {
      key: 'enabled',
      selectors: [REWARDS],
      // Fixed native card widths can wrap the third card after zoom rounding
      // and scrollbar space. Let three tracks share the actual available width.
      declaration: 'display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important;'
    }],
    [52, {
      key: 'enabled',
      selectors: [`${REWARDS} > *`],
      // Section headings, spacers, and watch-streak content keep their own rows.
      declaration: 'grid-column: 1 / -1 !important; min-width: 0 !important;'
    }],
    [53, {
      key: 'enabled',
      selectors: [REWARD_CELL],
      // Power-ups are direct children; channel rewards have an extra wrapper.
      declaration: 'grid-column: auto !important; width: 100% !important; min-width: 0 !important; margin: 0 !important; box-sizing: border-box !important;'
    }],
    [54, {
      key: 'enabled',
      selectors: [`${REWARD_CELL} > ${REWARD}`],
      declaration: 'width: 100% !important; min-width: 0 !important;'
    }],
    [55, {
      key: 'enabled',
      selectors: [`${REWARDS} :is(${POWER_UP}, ${REWARD}) > button`, `${REWARDS} .reward-icon--large`],
      declaration: 'max-width: 100% !important; min-width: 0 !important; box-sizing: border-box !important;'
    }]
  ].map(([order, rule]) => Object.freeze([order, Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })])));
})();
