/* Feature rules; numeric slots preserve the original CSS cascade across files. */
(() => {
  "use strict";

  const COMPOSER = globalThis.TwitchMinSelectors.composer;


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
    [4, {
      key: 'enabled',
      selectors: ['[data-tq-chat-tint]'],
      // Overlay the native background so mentions and moderation highlights stay.
      declaration: 'background-image: linear-gradient(var(--tq-chat-tint), var(--tq-chat-tint)) !important; background-image: linear-gradient(color-mix(in srgb, var(--tq-chat-color) 6%, transparent), color-mix(in srgb, var(--tq-chat-color) 6%, transparent)) !important; border-radius: 2px;'
    }],
    [5, {
      key: 'enabled',
      selectors: ['[data-tq-chat-continuation] [data-tq-chat-author]', '[data-tq-chat-continuation] [data-tq-chat-separator]'],
      declaration: 'display: none !important;'
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
    }]
  ].map(([order, rule]) => Object.freeze([order, Object.freeze({ ...rule, selectors: Object.freeze(rule.selectors) })])));
})();
