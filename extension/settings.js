/* Shared by the isolated content script and the extension popup. */
(() => {
  "use strict";

  const GROUPS = Object.freeze([
    { key: "sidebarHeadings", title: "Sidebar headings & streaks", description: "Hide section headers, streak prompts, and Show More/Less." },
    { key: "sidebarLabels", title: "Sidebar channel text", description: "Hide names, categories, and status extras. Avatars and viewer counts stay." },
    { key: "topNavigation", title: "Top navigation extras", description: "Hide notifications, Gift Turbo, and Bits." },
    { key: "channelActions", title: "Channel action extras", description: "Hide the channel bell, Bits, and Gift a Sub. Keep Follow." },
    { key: "chatLeaderboard", title: "Chat leaderboard", description: "Hide the gift and cheer rankings above chat." },
    { key: "chatComposer", title: "Chat message composer", description: "Hide the message box and its tools. Chat becomes read-only; points and settings stay." }
  ].map(Object.freeze));

  const DEFAULTS = Object.freeze({ enabled: true, ...Object.fromEntries(GROUPS.map(({ key }) => [key, true])) });
  const ATTRIBUTES = Object.freeze({
    enabled: "data-tq-enabled",
    sidebarHeadings: "data-tq-sidebar-headings",
    sidebarLabels: "data-tq-sidebar-labels",
    topNavigation: "data-tq-top-navigation",
    channelActions: "data-tq-channel-actions",
    chatLeaderboard: "data-tq-chat-leaderboard",
    chatComposer: "data-tq-chat-composer"
  });

  function normalize(raw = {}) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key,
      typeof raw?.[key] === "boolean" ? raw[key] : fallback
    ]));
  }

  globalThis.TwitchMinSettings = Object.freeze({ GROUPS, DEFAULTS, ATTRIBUTES, normalize });
})();
