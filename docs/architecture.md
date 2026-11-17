# Architecture

Setup and commands: [README](../README.md#development).
Working rules: [AGENTS.md](../AGENTS.md). Paths below are repository-relative.

## Ownership

| File or directory | Responsibility |
| --- | --- |
| `extension/manifest.json` | Production script order and assets; fixtures and tooling derive their lists from it. |
| `extension/shared/settings.js` | Stable setting keys, defaults, attributes, popup labels, and normalization. |
| `extension/content.js` | Load settings, mount CSS, coordinate controllers, and retire an instance. |
| `extension/background.js` | Reconnect existing Twitch tabs on install, update, startup, or popup request. |
| `extension/styles/rules-*.js` | Feature CSS; `rules.js` builds the stylesheet in frozen cascade-slot order. |
| `extension/shared/runtime.js` | Attach/update/dispose lifecycle and failure recovery. |
| `extension/shared/regions.js` | Shared region discovery and cleanup ownership. |
| `extension/shared/selectors.js` | Shared selectors; feature-specific selectors stay with their controller. |
| `extension/controllers/` | DOM behavior. |
| `extension/popup/` | Settings UI, storage updates, and save-error recovery. |

## Settings and lifecycle

CSS and controllers activate after saved settings load, so the native page may
appear briefly. A temporary document-start observer disconnects once the root
exists. Only one initial settings read runs at a time. Failed reads retain queued
changes and removals; relevant storage events retry without timers.

Controllers use `TwitchMinRuntime.create`. Failed setup rolls back; cleanup must
succeed before reattachment. One failing feature does not block others. Relevant
storage events retry failed features even for unchanged settings, while healthy
features and unchanged attributes are skipped.

Popup edits are optimistic. Newer storage notifications override save completions
and recovery reads. If both saving and rereading fail, rollback touches only fields
without newer notifications. Scroll and ResizeObserver events update popup
navigation without polling.

## Reconnecting open tabs

`background.js` checks open Twitch tabs on install, update, and browser startup.
Ready instances at the current version stay in place. Other instances are cleaned
up before replacement. Concurrent requests for the same tab share one recovery
operation; script and style lists come from the manifest.

The extension uses `storage` for local settings and `scripting` with host access
limited to `https://www.twitch.tv/*` and `https://twitch.tv/*`. It needs neither
`tabs` nor `activeTab` permission. Chrome 106 or newer is required to target a
specific document during reinjection, so navigation can't redirect the operation
to a different page.

After saving **Enabled**, the popup asks the active tab's top frame for its applied
state, stylesheet status, and controller failures. A missing, outdated, or unready
response triggers one recovery attempt through the worker. Status requests have
a two-second timeout; the popup allows eight seconds for recovery. These checks
don't block the settings controls. Newer changes supersede earlier results.

Before reinjection, a `twitch-min:retire` DOM event asks the old instance to release
its controllers, listeners, styles, and attributes. It responds with
`twitch-min:retired` or `twitch-min:retire-failed`. Plain events work across an
invalidated extension context; objects passed through `CustomEvent.detail` don't.
Cleanup waits up to two seconds for native sidebar restoration, and the worker
waits up to three seconds for the acknowledgement. Failed cleanup or a legacy
instance without this hook requires a manual refresh. The extension never reloads
the page itself.

Unconfirmed changes show troubleshooting in the popup. Reports contain extension
status and errors, not page content, and clear on a new attempt or confirmed
change. Logs use the name and version from the installed manifest. To debug,
inspect the popup for save/recovery logs and Twitch's console for controller errors.

## Regions and controllers

One shared observer tracks mounts, identity changes, and removals while features
are active. It observes class, ID, and target attributes, sharing added-subtree
scans for identical selectors within a batch. Subscriptions keep separate ownership.

`regions.watch(selector, attach, own)` provides unsubscribe before discovery.
Attachments register `onCleanup` before setup. Unsubscribe attempts every cleanup
and retains failures for retry. Feature observers process affected regions and
subtrees rather than rescanning the document on chat updates.

| Controller | Key contract |
| --- | --- |
| `layout.js` | Native sidebar expansion/restoration, Following shelf expansion, and Browse recap discovery. |
| `chat.js` | One row observer per region; deduplicate changed rows/neighbors and clean removed subtrees. Author and sender-run caches last one update batch. |
| `chat-badges.js` | Share chat's row pass; own badge wrappers, cross-region transfers, native tooltips, and delegated listeners. |
| `timestamps.js` | Handle inserted, replaced, removed, and moved leaves; preserve native text and seek targets. Direct text/attribute edits are not observed. |
| `emotes.js` | Add an image to a matching native tooltip; release it on dismissal, navigation, removal, or pause. |
| `player.js` | Wheel-volume feedback, side-button seeking within available playback ranges, and fitted VOD portals; observe player/metadata independently of chat. Fitting excludes theatre/fullscreen. |
| `composer.js` | Preserve drafts and native Send state; release temporary controls, IDs, and listeners on pause. |

### Live rewind

Side-button Back on an infinite-duration video with a usable native seekbar sends a
mouse click near the seekbar's end to request Twitch's recording timeline. The
live video may report a placeholder seekable range spanning far beyond its
actual buffer. Live playback requires a visible, enabled, nonzero-size scrubber;
reported media ranges alone never authorize seeking or direct live `currentTime`
changes. Without that control, native side-button behavior remains in place.
Once media events or video replacement expose a finite duration,
the controller seeks 30 seconds before that recording's end. The live and
recording clocks are separate. Forward reaching or passing the seekable end clicks
the player's visible, enabled `button[aria-label="Skip to Live"]` when present;
otherwise seeking clamps normally. Forward at live stays at live and cancels a
pending rewind. Temporary media listeners and the player-scoped observer release on
completion, manual seeking, pause, opt-out, region removal, or history events;
completion also rejects a changed URL.

### Sidebar and page shelves

Sidebar rows and headings have separate expansion markers. Filtering waits for
native expansion; pending pagination keeps compact styling and unfiltered lists.
The For You title and pagination hide independently of list completion. Pagination
is unmasked synchronously for native visibility checks and clicks, then hidden
again even if a request stalls. Replacement headings are
relabelled. Retained pagination controls are clicked again only after new rows arrive.

Layout distinguishes automatic clicks from manual Collapse/Expand and waits for
native expansion before styling. It respects manual collapse while retaining the
obligation to restore an initially collapsed sidebar when neither sidebar option
needs expansion. Restoration may finish asynchronously; remounts repeat setup.
Collapsed-sidebar scrollbar CSS does not require a readiness marker.

Following expansion targets native **Show more** controls in Recommended channels
and Latest videos, waiting for new articles before requesting another page.
Automatic clicks preserve scroll and focus through one animation-frame restoration
per batch; user input cancels it. Pause/removal cancels pending work. Stories
visibility is independent of expansion.

Browse recap discovery marks only the Recent Recaps shelf inside the directory
region. CSS hides the marker. Disabling, pausing, removal, or reuse for another
heading releases its observer and markers.

### Chat tooltips

Badge and emote enhancements retain native labels, metadata, placement, styling,
and handlers. Tooltip observers run only while active and filter unrelated
mutations before geometry reads. Larger-image failure uses the original emote;
native tooltip hiding also releases previews and temporary state. Badge compaction
stays active independently when message grouping is off.

## Tests and harnesses

`tests/browser.test.cjs` registers each feature module once, with independent
fixture state per check. `tests/support/rules.cjs` loads rules in a fresh VM;
`production.cjs` expands fixture markers. Both follow manifest order.

Browser cases use committed, sanitized fixtures rather than ignored private snapshots.

Architecture checks enforce focused-command coverage, browser registration,
script order, matching versions, and the reviewed CSS baseline in
`tests/rules-baseline.json`. Root and `docs/` Markdown inline file links are checked;
anchors, external URLs, reference links, and HTML links are outside that check.

`tests/support/launch.cjs` uses Puppeteer for startup, debugging pipes, timeouts,
and shutdown. Browser selection is an explicit path, then `CHROME_PATH`, then
Puppeteer's downloaded Chrome. Invalid overrides fail with diagnostics. Each run's
UUID profile is removed on success or failure; native scrollbars remain enabled.
Profiles, snapshots, and results stay in ignored `.browser-tests/`; generated
ZIPs stay in ignored `dist/`.

- `chrome.cjs` runs fixtures with mocked storage through Puppeteer and CDP.
  Uncaught page exceptions and rejections fail checks.
- `interceptions.cjs` tracks cancellations and retired documents/frames across
  out-of-order events. Only matching cancelled-request stale-ID errors are excused;
  pending handlers drain before assertions and disposal releases metadata/waits.
- `installed.cjs` tests the unchanged unpacked extension with real storage and
  isolated content scripts through Chrome's experimental Extensions debugging API.

Coverage and recorded results: [validation notes](validation.md).

## Development tooling

Versions are pinned in `package.json` and `pnpm-lock.yaml`; `packageManager`
selects pnpm. `pnpm-workspace.yaml` allows Puppeteer and Sharp installation scripts.
Development packages stay outside `extension/` and release archives.

`.puppeteerrc.cjs` disables the standalone Chrome Headless Shell download: tests
use regular Chrome for Testing in headless mode. CI caches only that Chrome
directory and includes the Puppeteer configuration in its browser cache key.

| Dependency | Use |
| --- | --- |
| Puppeteer | Browser automation and downloaded Chrome for Testing. Harnesses serve fixtures locally or block requests. |
| Sharp | PNG/GIF encoding, decoding, SVG rasterization, and palette reduction, using native tooling for the host platform. |
| fflate | ZIP compression/decompression; packaging checks assets and SHA-256 hashes before replacing the archive. |

Icons derive from `extension/icons/logo.svg` using the reviewed center-sampled
pixel grid. Preview processing reuses decoded source pixels, quantizes edge shades,
and preserves exact theme colors. Output decoding checks dimensions, GIF timing
and looping, theme pixels, and PNG size. Tooling edits alone do not require image
regeneration; see [image commands](../README.md#images).
