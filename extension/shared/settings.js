/* One declaration shared by the content script and popup. Storage keys are stable. */
(() => {
  "use strict";

  const DEFINITIONS = Object.freeze([
    {"key": "enabled", "default": true, "attribute": "data-tq-enabled", "title": "Enable twitch-min", "description": "Apply the selected appearance and interaction settings."},
    {"key": "sidebarSections", "default": true, "attribute": "data-tq-sidebar-sections", "title": "Sidebar sections", "description": "Keep online Followed, Recommended, and Similar channels."},
    {"key": "sidebarLabels", "default": true, "attribute": "data-tq-sidebar-labels", "title": "Compact sidebar", "description": "Show avatars, viewer counts, and games in a narrow sidebar."},
    {"key": "topNavigation", "default": true, "attribute": "data-tq-top-navigation", "title": "Top navigation extras", "description": "Hide promotional links; keep search, notifications, and account controls."},
    {"key": "channelActions", "default": true, "attribute": "data-tq-channel-actions", "title": "Channel action extras", "description": "Hide extra channel actions; keep Follow and subscription icons."},
    {"key": "channelAbout", "default": true, "attribute": "data-tq-channel-about", "title": "About & lower channel section", "description": "Hide About and recommendations to give the video more space."},
    {"key": "chatLeaderboard", "default": true, "attribute": "data-tq-chat-leaderboard", "title": "Chat leaderboard", "description": "Hide the gift, cheer, and goal carousel above chat."},
    {"key": "chatComposer", "default": true, "attribute": "data-tq-chat-composer", "title": "Chat message composer", "description": "Use Chat to open the editor. Drafts and normal Enter-to-send stay intact."},
    {"key": "chatTimestamps", "default": true, "attribute": "data-tq-chat-timestamps", "title": "Short video chat times", "description": "Show replay times as hours:minutes; keep the original seek target."},
    {"key": "wheelVolume", "default": true, "attribute": "data-tq-wheel-volume", "title": "Wheel volume", "description": "Scroll over the video to adjust volume."},
    {"key": "emotePreviews", "default": true, "attribute": "data-tq-emote-previews", "title": "Enlarged emote previews", "description": "Enlarge emotes inside Twitch's tooltip on hover or focus."},
    {"key": "chatTints", "default": true, "attribute": "data-tq-chat-tints", "title": "Chat author tints", "description": "Add a subtle background tint using each author's color."},
    {"key": "chatGrouping", "default": true, "attribute": "data-tq-chat-grouping", "title": "Group consecutive messages", "description": "Show repeated names once, with borders between sender groups."}
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
