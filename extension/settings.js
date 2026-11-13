/* Shared by the isolated content script and the extension popup. */
(() => {
  "use strict";

  const GROUPS = Object.freeze([
    { key: "sidebarSections", title: "Sidebar sections", description: "Show only Followed, Live, and Similar. Hide offline channels and other sections." },
    // Keep the existing storage key for the compact sidebar preference.
    { key: "sidebarLabels", title: "Compact sidebar", description: "Keep avatars, viewer counts, and the game underneath. Hide channel names." },
    { key: "topNavigation", title: "Top navigation extras", description: "Hide Luna/Prime offers, Shouts, Gift Turbo, and Bits. Keep notifications." },
    { key: "channelActions", title: "Channel action extras", description: "Hide Share, the channel bell, Bits, and Gift a Sub. Keep Follow and icon-only Subscribe/Resubscribe." },
    { key: "channelAbout", title: "About & lower channel section", description: "Hide About, the replay channel card, and recommendations below the video details." },
    { key: "chatLeaderboard", title: "Chat leaderboard", description: "Hide the gift and cheer rankings above chat." },
    { key: "chatComposer", title: "Chat message composer", description: "Hide the message box and its tools. Chat becomes read-only; points and settings stay." },
    { key: "chatTimestamps", title: "Short video chat times", description: "Show hours and minutes beside replay messages, without seconds." }
  ].map(Object.freeze));

  const DEFAULTS = Object.freeze({ enabled: true, ...Object.fromEntries(GROUPS.map(({ key }) => [key, true])) });
  const ATTRIBUTES = Object.freeze({
    enabled: "data-tq-enabled",
    sidebarSections: "data-tq-sidebar-sections",
    sidebarLabels: "data-tq-sidebar-labels",
    topNavigation: "data-tq-top-navigation",
    channelActions: "data-tq-channel-actions",
    channelAbout: "data-tq-channel-about",
    chatLeaderboard: "data-tq-chat-leaderboard",
    chatComposer: "data-tq-chat-composer",
    chatTimestamps: "data-tq-chat-timestamps"
  });

  function normalize(raw = {}) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key,
      typeof raw?.[key] === "boolean" ? raw[key] : fallback
    ]));
  }

  globalThis.TwitchMinSettings = Object.freeze({ GROUPS, DEFAULTS, ATTRIBUTES, normalize });
})();
