/* One declaration shared by the content script and popup. Storage keys are stable. */
(() => {
  "use strict";

  const DEFINITIONS = Object.freeze([
    {"key": "enabled", "default": true, "attribute": "data-tq-enabled", "title": "Enable twitch-min", "description": "Apply the selected appearance and interaction settings."},
    {"key": "topNavigation", "default": true, "attribute": "data-tq-top-navigation", "title": "Top navigation extras", "description": "Hide promotional buttons at the top of Twitch. Keep search, notifications, whispers, and your account menu."},
    {"key": "hideTopNavigation", "default": false, "attribute": "data-tq-hide-top-navigation", "title": "Hide top navigation bar", "description": "Hide the whole bar at the top of Twitch, including search, notifications, and your account menu."},
    {"key": "sidebarSections", "default": true, "attribute": "data-tq-sidebar-sections", "title": "Sidebar sections", "description": "Hide the For You section and make the other section headings take up less space.", "section": "Sidebar"},
    {"key": "sidebarLabels", "default": true, "attribute": "data-tq-sidebar-labels", "title": "Compact sidebar", "description": "Make the sidebar narrower while keeping channel icons, viewer counts, and game names."},
    {"key": "channelActions", "default": true, "attribute": "data-tq-channel-actions", "title": "Channel action extras", "description": "Hide Share, the three-dot menu, the channel bell, Bits, and Gift a Sub. Keep Follow and subscription icons.", "section": "Main"},
    {"key": "channelAbout", "default": false, "attribute": "data-tq-channel-about", "title": "About & channel panels", "description": "Hide the About section, channel card, and channel panels below the video."},
    {"key": "wheelVolume", "default": true, "attribute": "data-tq-wheel-volume", "title": "Mouse wheel volume", "description": "Use the scroll wheel over the video to change the volume."},
    {"key": "followingStories", "default": true, "attribute": "data-tq-following-stories", "title": "Following Stories", "description": "Hide Stories at the top of the Following page."},
    {"key": "browseRecaps", "default": true, "attribute": "data-tq-browse-recaps", "title": "Browse Recent Recaps", "description": "Hide the Recent Recaps section on the Browse page."},
    {"key": "chatLeaderboard", "default": true, "attribute": "data-tq-chat-leaderboard", "title": "Chat leaderboard", "description": "Hide the gift rankings, cheer rankings, and goals shown above chat.", "section": "Chat"},
    {"key": "chatTimestamps", "default": true, "attribute": "data-tq-chat-timestamps", "title": "Shorter chat times", "description": "Show chat times in hours and minutes: 1:32:56 becomes 1:32, and 5:26 becomes 0:05."},
    {"key": "chatTints", "default": true, "attribute": "data-tq-chat-tints", "title": "Chat username tint", "description": "Give messages a background tint that matches the username color. Leave highlighted messages unchanged."},
    {"key": "chatGrouping", "default": true, "attribute": "data-tq-chat-grouping", "title": "Group consecutive chats", "description": "Show the username and first badge once for groups of messages from the same chatter."},
    {"key": "emotePreviews", "default": true, "attribute": "data-tq-emote-previews", "title": "Enlarged emote previews", "description": "Hover over an emote to see a preview at three times its normal size."},
    {"key": "chatComposer", "default": true, "attribute": "data-tq-chat-composer", "title": "Chat message box", "description": "Click Chat to show or hide the message box. Press Enter to send."}
  ].map(Object.freeze));

  const DEFAULTS = Object.freeze(Object.fromEntries(DEFINITIONS.map(setting => [setting.key, setting.default])));
  const ATTRIBUTES = Object.freeze(Object.fromEntries(DEFINITIONS.map(setting => [setting.key, setting.attribute])));
  const GROUPS = Object.freeze(DEFINITIONS.filter(({ key }) => key !== "enabled").map(({ key, title, description, section }) => Object.freeze({ key, title, description, section })));

  function normalize(raw = {}) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key,
      typeof raw?.[key] === "boolean" ? raw[key] : fallback
    ]));
  }

  globalThis.TwitchMinSettings = Object.freeze({ DEFINITIONS, GROUPS, DEFAULTS, ATTRIBUTES, normalize });
})();
