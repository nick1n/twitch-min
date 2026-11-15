# Changelog

Historical changes and verification notes, in release order.

## 0.20.0 - Popup polish and maintenance

- Extract badge compaction and native tooltip ownership into a dedicated helper,
  preserving chat's shared row observer, region lifecycle, and restoration behavior.
- Wait for readable, complete Chrome debugging port files, and correlate request
  cancellation with network events and document/frame lifetimes. Cover delayed
  cancellation, navigation, locked/partial files, and genuine interception failures.
- Shorten installation, feature, architecture, roadmap, and validation guides,
  keeping current results and outstanding checks easy to find.
- Share Chrome executable discovery between both browser harnesses and preserve
  the popup's intended text size against Chrome extension-page defaults.
- Keep compact popup branding and balanced, wrapping descriptions in a scrollable
  list. Consolidate pause/resume into the master control and retain a secondary
  Enable all settings action, shown only when available without changing layout.
- Show the manifest-derived version beside the popup title.
- Add pointer cursors and subtle hover/focus feedback to popup controls, with
  straight inset separators and rounded hover backgrounds.
- Hide the popup scrollbar and show a bottom More settings action while additional
  options remain below view. It switches to Back to top at the bottom; either
  direction scrolls while keeping focus on the button, preserving native
  scrolling and keyboard navigation without highlighting settings.
- Add independent switches for wheel volume, enlarged emote previews, chat author
  tints, and consecutive-message grouping, preserving current defaults and saved choices.
- Verify real unpacked installation, Chrome storage, isolated content scripts,
  cross-tab popup updates, Twitch-only scope, page reload, and browser restart
  with offline fixtures in a temporary Chrome profile.
- Retain the validated installable ZIP as a GitHub Actions artifact after packaging.
- Hide goal slides in the chat leaderboard carousel on refresh and later mounts,
  without waiting for a rankings slide to appear; restore the strip when paused.
- Right-align shortened replay timestamps in a column sized to 00:00 and rounded
  up to the next whole CSS pixel in current Chrome,
  preserving native seek targets and restoring native sizing when paused.
- Keep one badge beside each visible username in live and replay chat. Hide
  repeated badge wrappers on continuation messages along with the name and colon;
  preserve shared identity wrappers and restore all badges when paused.

## 0.19.0 - Twitch layout, chat, and reliability improvements

- Expand native Show More lists before sidebar filtering and compact styling,
  including later mounts and paginated lists.
- Align replay timestamps with the first message baseline, add black borders
  between sender groups, and keep reward cards in three columns across zoom levels.
- Hide the replay chat message-menu wrapper and restore its native actions when
  paused.
- Refresh the extension description to reflect its viewing, chat, and player features.
- Cancel superseded CI runs per ref and test Windows with the latest Node.js LTS
  selected directly in the workflow; require Node 26 or newer for development checks.
- Add an optional offline soak command covering message churn, region remounts,
  pause cleanup, and player modes, with explicit reporting of unavailable checks.
- Put the 3x emote image above the name in Twitch's native tooltip, retaining
  existing detail labels and removing the separate popup fallback. Show it on
  the first hover without a click; preserve native click and keyboard actions.
- Hide live and replay chat scrollbars without changing native scrolling;
  restore them when paused.
- Release timestamp markers when nodes leave their formatting context, transfer
  ownership between chat regions, and restore moved nodes on pause before
  observer delivery without changing native text or seek targets.
- Guard browser feature registration and local documentation links in the unit
  suite, including encoded paths and exclusions for code examples.
- Show only the first chat badge in Twitch's order, adding the other badge names
  to Twitch's native hover/focus tooltip; restore native badges and tooltips when
  paused.
- Preserve newer popup storage updates when an earlier save callback finishes.
- Preserve newer notifications and removed keys during failed-save recovery;
  if recovery also fails, roll back only fields without newer notifications.
- Retry a failed initial preference read on the next relevant storage event,
  retaining queued changes and keeping native Twitch UI usable until recovery.
- Report failed Chrome launches and early exits with executable and stderr
  details; verify cleanup of profiles from failed launches.
- Bound debugging-target requests and WebSocket connection setup, with offline
  stall regressions verifying cancellation and profile cleanup.
- Remove unused browser-test imports and helpers, and derive missing-asset
  packaging checks from the manifest and popup references.
- Separate test ownership, share rule loading, guard focused test coverage, and
  add Windows CI for the full suite and packaging.

## 0.18.0 - Lifecycle reliability and documentation

- Retry failed feature applications on a later settings change after cleanup,
  while allowing other features to continue.
- Register region teardown before setup, retain failed cleanup for retry, and
  prevent duplicate attachment after partial failures. Cover recovery in runtime,
  settings, and real-Chrome regressions.
- Add repository instructions in AGENTS.md and move implementation details into
  docs/architecture.md, leaving a concise architecture overview in the README.
- Remove hardcoded release numbers from installation and development documentation;
  packaging continues to derive archive names from the manifest version.

## 0.17.0 - Architecture and reliability

- Rebuild the 0.17.0 ZIP with all refactored modules. Validate referenced assets,
  package/manifest versions, root manifest, and every archived file's SHA-256
  before replacing the previous release; cover missing assets, corrupted archive
  contents, and safe cleanup with isolated packaging regressions.
- Skip unchanged settings attributes, sidebar/navigation markers, and volume text.
- Batch timestamp formatting and avoid rewriting unchanged shortened labels.
- Detect uncaught startup and asynchronous page errors in the Chrome harness;
  test the detection and clear pending protocol requests during teardown.
- Extract the dependency-free Chrome/CDP harness and feature test modules while
  retaining one isolated browser/profile per run and all existing checks.
- Give emote dismissal and popup failure regressions independent page setup.
- Load fixture production scripts and styles from the manifest through local CDP
  responses; block external resources and preserve private snapshot files.
- Split cosmetic rules by sidebar, navigation, player, and chat. Preserve the
  existing CSS output and cascade with a baseline regression check.
- Derive settings defaults, HTML attributes, and popup groups from one declaration.
- Require Node >=22 and assert package/extension version consistency.
- Document shared selector, lifecycle, region, feature-rule, and test ownership.


Inspected the live **signed-out** `twitch.tv/karkalla` page on November 12, 2026:

- Confirmed the sidebar metadata/header targets and hype-train row structure.
- Confirmed channel `gift-button`, `.chat-input__textarea`, and the leaderboard's
  `leaderboard-item-name-test-selector` inside a direct chat-content child.
- Confirmed the composer can be targeted separately from the points/settings row.

For 0.1.3, also inspected the live signed-out VOD at
`twitch.tv/videos/2921409707` and the supplied logged-in HTML snapshot:

- Confirmed the native expanded/collapsed DOM transition and a full-height 50px
  rail with visible avatars on the live page, plus restoration to 240px.
- Verified that the VOD title/category/views remain while its channel card,
  recommendation section, Share button, and `.vod-message__header` timestamps hide.
- Used the logged-in snapshot to check `.side-nav__title`, the streak reminder
  group, `.onsite-notifications` (including its badge), and the text-only Gift
  Turbo button. The snapshot is not a running signed-in Twitch session.

Version 0.1.4 changes the avatar-only rail to a compact two-line layout so counts
and games remain visible. Browser tests verify their visibility, vertical order,
sidebar height, dynamic updates, and restoration, including the supplied logged-in
markup. This revision has not been checked in a running signed-in session.

Version 0.1.5 restores the notification bell, hides Luna/Prime and Shouts, reduces
the sidebar from 168px to 118px, formats replay times without seconds, fits the
VOD player above its metadata, and adds wheel volume control. Live signed-out VOD
DOM checks confirmed the 118px sidebar, hidden scrollbar, formatted timestamps,
hidden Prime offers control, synchronized video/slider volume, and matching video,
placeholder, and metadata boundaries. Logged-in control matching is checked against
the supplied HTML; a running signed-in session is not claimed. Browser snapshot
capture timed out, so these live checks used DOM geometry and media properties.

Version 0.1.6 verifies the three shortened section headers and offline filtering
against the supplied signed-in HTML. Browser regressions cover nested third-line
captions, changing online status, dynamic chat tints, native highlight preservation,
search focus styling, auto-height player ancestors, and stale panel scroll offsets.
Live signed-out DOM checks confirmed no visible stray row text, 6% author-color
chat tints, a transparent search border, a reset scroll offset, and matching video,
metadata, and viewport boundaries. Snapshot capture still timed out.

Version 0.1.7 uses the supplied `.tw-tooltip-layer` / `.tw-tooltip-wrapper` markup
to host the emote preview. Real Chrome fixture tests cover native theme/arrow
preservation, exact-name matching, late tooltip adoption, same-name React refresh,
native dismissal/reuse, keyboard activation on Twitch's focusable emote wrappers,
viewport clamping, and cleanup. This integration is tested against the supplied
markup; it has not been checked in a running signed-in session.

Version 0.1.8 groups consecutive sender labels in live and replay chat. Chrome
fixture tests cover runs of four messages, distinct accounts with matching colors
or display names, inserts, deletions, history loading, changed senders, notices,
separate chat panes, retained message content, and restoration. Native VOD markup
is also checked against the supplied HTML; no running signed-in check is claimed.

Version 0.1.9 fixes live chat using its gray username wrapper instead of the
colored display name. Chrome tests reproduce the nested wrapper structure and
check dynamic colors, later messages, hidden repeated names, native highlights,
and restoration. An additional inert import of `.browser-tests/live.html` checks
all supplied live message rows against their actual display-name colors and
verifies that repeated names hide without their badge siblings. This uses the
provided snapshot, not a running signed-in Twitch session.

Version 0.1.10 fixes the first followed entry when Twitch renders it as a promoted
card. Its nested wrappers no longer clip the whole card into the avatar slot.
Chrome checks cover the complete avatar, count/game alignment, matching ordinary
row height, native metadata updates, link handlers, and restoration, using both
a representative fixture and the promoted card from the updated live snapshot.

Version 0.1.11 hides Bits in the standalone live action row and makes its
Subscribe/Resubscribe buttons icon-only. Chrome checks cover the supplied live
controls, accessible names with and without aria-label, retained icons and native
handlers, dynamic labels, independent settings, and full restoration.

Version 0.1.12 widens the compact sidebar from 118px to 144px, enlarges viewer
counts to 13px and game names/headers to 12px, and gives the two text lines 38px
rows. Ordinary and promoted cards use the same sizes.

Version 0.1.13 hides the live and replay chat header bars and the expanded chat's
floating collapse control. The native collapsed-state expand control is retained.
Header classes and control states were checked in the supplied HTML snapshots;
the existing Chrome preset/restoration check now covers the hidden header.

Version 0.1.14 makes Chat toggle the message box without sending. Chrome checks
cover mouse and keyboard activation, focus, retained drafts, disabled native Send,
form and delegated-handler isolation, native Enter behavior, editor replacements,
later composers, full restoration, and the supplied live editor markup.

Version 0.1.15 removes Clip (including the live Subscribe to clip variant), the
extra `tp-ps` speed group, and player subscription/follow overlays. Clip and speed
markup was checked against the supplied snapshots; the existing Chrome preset
and restoration checks cover the hidden controls and retained playback controls.

Version 0.16.0 restores the decrease/increase speed buttons and hides only the
middle rate display. Existing Chrome visibility checks now cover all three
speed controls separately.
