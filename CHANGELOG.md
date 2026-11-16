# Changelog

Release history, newest first. For current checks and limits, see
[validation notes](docs/validation.md).

## 0.25.0 - Sticky footer cleanup and development tooling

- Hide Twitch's sticky footer while the extension is enabled.
- Combine and optimize README previews; document Opera GX installation.
- Use pnpm with locked development dependencies and Linux CI.
- Use Puppeteer for browser checks, Sharp for image tooling, and fflate for ZIPs.
- Refresh extension descriptions and simplify project documentation.

## 0.24.0 - Reliability fixes and DOM optimizations

- Keep sidebar headers styled while pagination waits or Twitch replaces headings.
- Detect Following and Browse regions that receive their IDs after mounting.
- Share region discovery scans between identical selectors.
- Cache sender-run lookups within each chat update.
- Clean up emote previews when native tooltips become hidden.
- Stop observing direct edits to existing timestamp text nodes.
- Skip unchanged player-fit and composer metadata writes.
- Add a repository skill for local release preparation.

## 0.23.0 - Sidebar reliability and README previews

- Keep compact sidebar sizing while Show more is pending.
- Add grouped, anonymized README previews with native Twitch icons and a title logo.
- Add GIF capture and regeneration tooling.

## 0.22.0 - Navigation controls and release automation

- Preserve scroll position and focus during automatic Following expansion.
- Keep sidebar Collapse/Expand visible and respect manual collapse.
- Hide the sidebar scrollbar in collapsed view.
- Hide the channel three-dot menu with Channel action extras.
- Add an off-by-default option to hide the entire top navigation bar.
- Automatically tag version changes after default-branch CI succeeds.
- Add the MIT license to the repository and packaged ZIPs.
- Add author and project links to package metadata and the manifest homepage.

## 0.21.0 - Following, Browse, and settings controls

- Add Following Stories and Browse Recent Recaps switches, both on by default.
- Auto-expand Show more in Following's Recommended channels and Latest videos.
- Reorder popup options under Sidebar, Main, and Chat headings.
- Default About & lower channel section to off; preserve saved choices.
- Keep Enable all settings turning every option on.
- Add offline Following and Browse tests.

## 0.20.0 - Popup polish and maintenance

- Extract badge compaction and native tooltip handling into a dedicated helper.
- Harden Chrome startup and request-cancellation tracking.
- Share Chrome executable discovery across browser harnesses.
- Shorten installation, feature, architecture, and validation guides.
- Polish popup branding, descriptions, separators, and hover/focus feedback.
- Preserve popup text sizing against Chrome extension-page defaults.
- Consolidate pause/resume and add Enable all settings without layout shifts.
- Show the manifest version beside the popup title.
- Hide the popup scrollbar; add More settings and Back to top actions that retain focus.
- Add switches for wheel volume, emote previews, chat tints, and message grouping.
- Verify unpacked installation, storage, cross-tab updates, reload, and restart offline.
- Retain validated ZIPs as GitHub Actions artifacts.
- Hide leaderboard goal slides on refresh and later mounts; restore them on pause.
- Right-align shortened replay timestamps while preserving native seek targets.
- Keep one badge per visible sender; hide badges on repeated sender labels.

## 0.19.0 - Twitch layout, chat, and reliability improvements

- Expand paginated sidebar Show more lists before filtering and compact styling.
- Align replay timestamps with the first message baseline.
- Add black borders between sender groups and keep reward cards in three columns.
- Hide replay message menus; restore native actions on pause.
- Refresh the extension description.
- Cancel superseded CI runs and require Node 26 or newer.
- Add an offline soak test for chat updates, remounts, cleanup, and player modes.
- Show 3x emote images above their names in Twitch's native tooltip on first hover.
- Hide chat scrollbars while preserving native scrolling.
- Clean up and transfer timestamp markers without changing native text or seek targets.
- Check browser-test registration, focused test coverage, and local documentation links.
- Show one chat badge; list other badge names in Twitch's native tooltip.
- Preserve newer storage changes and removed keys during saves and failed-save recovery.
- Retry failed preference reads on relevant storage events, retaining queued changes.
- Improve Chrome launch diagnostics, connection timeouts, and failed-profile cleanup.
- Derive missing-asset packaging checks from manifest and popup references.
- Separate test suites, share rule loading, and add Windows CI for tests and packaging.

## 0.18.0 - Lifecycle reliability and documentation

- Retry failed features after cleanup without blocking healthy features.
- Register teardown before setup and prevent duplicate attachments after failures.
- Add AGENTS.md and move implementation details into docs/architecture.md.
- Derive archive names from the manifest and remove hardcoded documentation versions.

## 0.17.0 - Architecture and reliability

- Validate assets, versions, ZIP contents, and hashes before replacing release archives.
- Skip unchanged settings attributes, sidebar markers, and volume text.
- Batch timestamp formatting and avoid rewriting unchanged labels.
- Detect startup and asynchronous page errors; clear pending requests on teardown.
- Extract the Chrome/CDP harness and feature suites into separate modules.
- Give emote dismissal and popup failure tests independent page setup.
- Load offline fixtures in manifest order and keep private snapshots out of releases.
- Split cosmetic rules by feature and guard CSS output with a baseline check.
- Derive defaults, attributes, and popup options from one settings declaration.
- Require Node 22 or newer and check package/manifest version consistency.
- Document selector, lifecycle, region, rule, and test ownership.

## 0.16.0 - Player speed controls

- Restore speed decrease/increase buttons; hide only the middle rate display.

## 0.15.0 - Player controls

- Hide Clip, Subscribe to clip, the extra speed group, and Follow/Gift/Subscribe overlays.
- Keep native playback controls available.

## 0.14.0 - Chat composer toggle

- Make Chat toggle the editor without sending or losing drafts.
- Preserve native Enter behavior, Send state, keyboard access, and late composer mounts.

## 0.13.0 - Chat headers

- Hide live/replay chat headers and the expanded chat's floating collapse control.
- Keep the collapsed chat's native expand control.

## 0.12.0 - Compact sidebar sizing

- Widen the compact sidebar to 144px with 38px rows.
- Use 13px viewer counts and 12px game names/headers for ordinary and promoted cards.

## 0.11.0 - Live channel actions

- Hide Bits in the standalone live action row.
- Make Subscribe/Resubscribe icon-only while preserving accessible names and handlers.

## 0.10.0 - Promoted sidebar cards

- Fix promoted followed cards clipping into the avatar slot.
- Match ordinary row sizing while preserving avatars, counts, games, and link handlers.

## 0.9.0 - Live chat colors

- Use the colored display name instead of its gray wrapper for live chat tints.
- Preserve dynamic colors, native highlights, badges, and repeated-name grouping.

## 0.8.0 - Consecutive sender grouping

- Group consecutive sender labels in live and replay chat.
- Handle history loading, changed senders, notices, and separate chat panes.

## 0.7.0 - Native emote tooltips

- Host enlarged emote previews in Twitch's native tooltip.
- Preserve tooltip styling, dismissal, keyboard access, positioning, and cleanup.

## 0.6.0 - Sidebar and layout fixes

- Verify sidebar headings, offline filtering, chat tints, and layout restoration.
- Check search styling and stale About scroll offsets on signed-out Twitch.

## 0.5.0 - Viewing and player controls

- Restore notifications and hide Luna/Prime offers and Shouts.
- Narrow the compact sidebar from 168px to 118px and hide its scrollbar.
- Shorten replay times, fit the VOD player above its metadata, and add wheel volume.

## 0.4.0 - Two-line sidebar

- Replace the avatar-only rail with compact viewer-count and game rows.
- Verify sizing, live updates, and restoration with browser fixtures and supplied markup.

## 0.3.0 - Sidebar and VOD layout

- Add an avatar-only 50px sidebar rail that restores to the native 240px width.
- Hide the VOD channel card, recommendations, Share button, and replay timestamps.
- Preserve VOD title/category/views and verify controls against supplied snapshots.

## Early validation - November 12, 2026

- Check sidebar, channel actions, composer, and leaderboard targets on signed-out Twitch.
