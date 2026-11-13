/* One declaration shared by the content script and popup. Storage keys are stable. */
(() => {
  "use strict";

  const DEFINITIONS = Object.freeze([
    {"key": "enabled", "default": true, "attribute": "data-tq-enabled", "title": "Enable hiding", "description": "Apply the selected cosmetic settings."},
    {"key": "sidebarSections", "default": true, "attribute": "data-tq-sidebar-sections", "title": "Sidebar sections", "description": "Show only Followed, Recommended, and Similar. Hide offline channels and other sections."},
    {"key": "sidebarLabels", "default": true, "attribute": "data-tq-sidebar-labels", "title": "Compact sidebar", "description": "Keep avatars, viewer counts, and the game underneath. Hide channel names."},
    {"key": "topNavigation", "default": true, "attribute": "data-tq-top-navigation", "title": "Top navigation extras", "description": "Hide Luna/Prime offers, Shouts, Gift Turbo, and Bits. Keep notifications."},
    {"key": "channelActions", "default": true, "attribute": "data-tq-channel-actions", "title": "Channel action extras", "description": "Hide Share, the channel bell, Bits, and Gift a Sub. Keep Follow and icon-only Subscribe/Resubscribe."},
    {"key": "channelAbout", "default": true, "attribute": "data-tq-channel-about", "title": "About & lower channel section", "description": "Hide About, the replay channel card, and recommendations below the video details."},
    {"key": "chatLeaderboard", "default": true, "attribute": "data-tq-chat-leaderboard", "title": "Chat leaderboard", "description": "Hide the gift and cheer rankings above chat."},
    {"key": "chatComposer", "default": true, "attribute": "data-tq-chat-composer", "title": "Chat message composer", "description": "Use Chat to show or hide the message box. The button never sends; Enter in the box sends normally."},
    {"key": "chatTimestamps", "default": true, "attribute": "data-tq-chat-timestamps", "title": "Short video chat times", "description": "Show hours and minutes beside replay messages, without seconds."}
  ].map(Object.freeze));

  const DEFAULTS = Object.freeze(Object.fromEntries(DEFINITIONS.map(setting => [setting.key, setting.default])));
  const ATTRIBUTES = Object.freeze(Object.fromEntries(DEFINITIONS.map(setting => [setting.key, setting.attribute])));
  const GROUPS = Object.freeze(DEFINITIONS.filter(({ key }) => key !== "enabled").map(({ key, title, description }) => Object.freeze({ key, title, description })));

  function normalize(raw = {}) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key,
      typeof raw?.[key] === "boolean" ? raw[key] : fallback
    ]));
  }

  globalThis.TwitchMinSettings = Object.freeze({ DEFINITIONS, GROUPS, DEFAULTS, ATTRIBUTES, normalize });
})();
