# Architecture

Contributor reference. See [README](../README.md#development) for commands,
[AGENTS.md](../AGENTS.md) for working rules, and [ROADMAP.md](../ROADMAP.md) for
validation priorities and deferred refactors. Paths below are repository-relative.

## Settings, rules, and ownership

| Owner | Responsibility |
| --- | --- |
| `extension/manifest.json` | Production script order and assets; tooling and fixtures derive their lists from it. |
| `extension/shared/settings.js` | Stable keys, defaults, attributes, titles, and descriptions; derives the popup groups and normalization API. |
| `extension/content.js` | Load saved preferences, mount CSS, and coordinate controllers. |
| `extension/styles/rules-*.js` | Feature CSS; `rules.js` sorts frozen cascade-slot entries and builds the stylesheet. |
| `extension/shared/runtime.js` | Feature attach/update/dispose lifecycle and failure recovery. |
| `extension/shared/regions.js` | Shared region discovery, ownership, and cleanup. |
| `extension/controllers/` | Scoped DOM behavior; shared selectors live in `shared/selectors.js`. |
| `extension/popup/` | Settings UI, storage updates, and save-error recovery. |

Rules scope comma-separated descendants with `:is(...)`; VOD fitting excludes
native theatre/fullscreen layouts. `tests/rules-baseline.json` records the reviewed
CSS count and hash. Update it only for an explained, intentional cosmetic change.

Enhancement preferences default on for existing installations. Wheel volume is
independent of player fitting; chat tinting and grouping refresh only attached
regions when their preferences change. Disabling grouping restores sender headers
and borders while independent badge compaction stays active until master pause.

The popup uses labelled native checkboxes and visible `aria-describedby` help.
Its scroll control retains button focus, and the hidden enable-all action reserves
its footprint. Scoped scroll events and a ResizeObserver keep the cue current
without polling. Status text is reserved for storage errors.

## Lifecycle recovery

Controllers use `TwitchMinRuntime.create` with attach/update/dispose hooks. Failed
setup rolls back; failed cleanup must succeed before reattachment. One failed
feature does not block others. Relevant storage events retry failed features,
even for unchanged settings; healthy features and unchanged attributes are skipped.

Only one initial settings read may run at a time. Pending changes and removals,
including a saved pause, survive failures; CSS stays inactive until preferences
load. The next relevant storage event retries the read without a timer loop.

Popup edits are optimistic. Save completion retains newer storage notifications.
After a failed save, notifications during recovery override the reread snapshot;
if the reread also fails, rollback touches only fields without newer notifications.

## Region cleanup

`regions.watch(selector, attach, own)` provides unsubscribe before initial
discovery. Region attachments register teardown through `onCleanup` before DOM
changes, listeners, or observers. Unsubscribe attempts every cleanup and retains
failures for retry. Native sidebar restoration may finish asynchronously.

Sidebar CSS requires a per-region readiness marker. Layout expands the native
sidebar and Show More lists before setting it. Retained pagination controls are
clicked again only after new rows arrive; pending/disabled controls leave the
native view visible. Remounts repeat setup; pause removes markers and restores an
initially collapsed sidebar when neither sidebar feature needs expansion.

## Discovery and mutation handling

At document start, a temporary observer waits for the document root and then
disconnects. Saved preferences gate activation, preserving a saved pause at the
cost of a possible initial native-page flash. One shared discovery observer tracks
region mounts, identity changes, and removals while features are active. Feature
observers process affected regions/subtrees, not document-wide chat scans.

| Controller | Important contract |
| --- | --- |
| `layout.js` | Own sidebar expansion/restoration and navigation extras; use native controls and readiness events. |
| `chat.js` | One row observer per chat region; deduplicate changed rows/neighbors and clean removed subtrees. |
| `chat-badges.js` | Share chat's row pass; own badge wrappers, cross-region ownership, native tooltip state, and delegated listeners. |
| `timestamps.js` | Transfer leaf ownership safely between regions; preserve native text and seek targets, including moves before observer delivery. |
| `emotes.js` | Add only an enlarged image to a matching native tooltip; support late mounts and cancel on dismissal, navigation, removal, or pause. |
| `player.js` | Own wheel-volume feedback and fitted VOD portals; observe player/metadata changes without rediscovery on ordinary chat updates. |
| `composer.js` | Preserve drafts and native Send state; remove temporary controls, IDs, and listeners on pause. |

Badge and emote tooltip handling preserves native labels, metadata, theme, arrow,
placement, accessible names, and handlers. Badge discovery prefers native links,
then exact-name/distance matching. Temporary tooltip observers run only while
active and filter unrelated mutations before geometry reads. No standalone emote
popover is created; larger-image failure falls back to the original image.

## Test organization

- Root suites separate settings, content startup, lifecycle, request ordering,
  architecture, browser integration, harness failures, and packaging.
- `tests/browser.test.cjs` registers each `tests/browser/` module exactly once.
  Each feature check starts from its own fixture state.
- `tests/support/rules.cjs` loads settings/selectors/rules into a fresh VM in
  manifest order. `production.cjs` expands fixture markers from the same manifest.
- Architecture checks enforce complete focused-command coverage, unique browser
  registration, script order, versions, and the CSS baseline.
- Local inline file links in root/`docs/` Markdown are checked, including encoded
  and angle-wrapped paths. Code, external URLs, and anchor-only links are ignored;
  reference/HTML links, complex escapes, and nested parentheses are outside scope.

Run full or focused commands from [README](../README.md#development). Browser
fixtures and optional private snapshot fragments stay offline; snapshots are
parsed inertly, sanitized, ignored by Git, and excluded from packages.

## Browser test harness

Both harnesses use `tests/support/chrome-path.cjs`: explicit override, then
`CHROME_PATH`, then standard installation paths. Invalid overrides reach launch
diagnostics rather than silently selecting another browser.

`chrome.cjs` runs sequential feature checks with mocked storage in an isolated
UUID profile. Port-file, HTTP/body, and WebSocket setup have bounded waits;
locked/partial port files retry until complete. Startup diagnostics include the
executable and stderr tail. Uncaught page exceptions/rejections fail checks.
Cleanup waits for process exit and removes only that run's verified profile.

`interceptions.cjs` correlates Fetch pauses with network and document/frame
lifetimes, including out-of-order events. A bounded history retains cancellation
and retired-loader evidence. Only a stale-ID error for the actual cancelled request
is excused; unrelated failures and wrong IDs still fail with their URL. Pending
handlers drain before the final check; disposal releases waits and metadata.

`installed.cjs` loads the unchanged unpacked extension through Chrome's debugging
pipe into a temporary profile. It checks real storage, isolated content scripts,
popup changes across both Twitch origins, non-Twitch scope, reload, and restart.
Requests are fulfilled locally or blocked. It requires recent Chrome's experimental
Extensions debugging domain and checks the popup page, not browser-action popup
lifetime or authenticated Twitch layouts. See [validation notes](validation.md).
