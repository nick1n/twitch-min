(() => {
  "use strict";
  globalThis.TwitchMinSelectors = Object.freeze({
    sidebar: '.side-nav, [data-a-target="side-nav-bar"], [data-a-target="side-nav-bar-collapsed"]',
    sidebarShowMore: '[data-a-target="side-nav-show-more-button"], [data-test-selector="ShowMore"]',
    topNav: '.top-nav, [data-a-target="top-nav-container"]',
    following: '#following-page-main-content',
    browse: '#directory-game-main-content',
    player: '.video-player, [data-a-target="video-player"], .channel-page__video-player',
    channelInfo: ':is(.channel-info-content, .video-info, [data-a-target="video-info"], .metadata-layout__support)',
    vodRoot: '.channel-root:has(.metadata-layout__split-top [data-a-target="video-info-game-boxart-link"])',
    chatRoot: '.video-chat__message-list-wrapper, .chat-scrollable-area__message-container, [data-a-target="chat-scroller"], .video-chat, .chat-room',
    composer: '.chat-input',
    tooltip: '.tw-tooltip-layer [role="tooltip"] .tw-tooltip-wrapper'
  });
})();
