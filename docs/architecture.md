# Architecture

Implementation details for contributors. Paths below are relative to the repository root.
See [README.md](../README.md#development) for setup and commands and
[AGENTS.md](../AGENTS.md) for coding-agent instructions.

## Settings, rules, and ownership

See [ROADMAP.md](../ROADMAP.md) for validation priorities, small follow-ups, and the
conditions that would justify a sidebar state machine or DOM compatibility layer.

`extension/shared/settings.js` declares each stable storage key, default, HTML attribute, popup
title, and description once in `DEFINITIONS`. `DEFAULTS`, `ATTRIBUTES`, and the
existing eight-entry `GROUPS` popup API are derived from it. The master preference
is declared alongside the groups but remains a separate popup control.

Feature rule files in `extension/styles/` expose frozen `[cascadeSlot, rule]`
entries. `extension/styles/rules.js` sorts
those slots and retains the `TwitchMinRules.RULES` / `buildCSS()` API. The slots
preserve the existing cross-feature cascade, including interleaved master-switch
rules. `tests/rules-baseline.json` records the original rule count and SHA-256 of
the complete CSS; an intentional cosmetic change requires reviewing and updating
that baseline. Shared selectors can be comma-separated lists; descendant rules
wrap those lists in `:is(...)` so every alternative stays scoped. VOD rules add
the existing theatre exclusions to the shared VOD root.

Runtime controllers in `extension/controllers/` own DOM discovery, observers,
event handlers, and restoration; rule modules own cosmetic CSS. Shared region
discovery belongs in `extension/shared/regions.js` and lifecycle support in
`extension/shared/runtime.js`. Each feature supplies internal
`attach(settings)`, `update(settings)`, and `dispose()` hooks to
`TwitchMinRuntime.create`. The public controller API is `update(settings)` and
`dispose()`; the adapter attaches on activation, updates an active feature, and
disposes it on pause. Keep feature-specific selectors beside
their feature; promote selectors shared across controllers/rules to
`extension/shared/selectors.js`.
The production dependency order is defined by `extension/manifest.json`.
`extension/content.js` applies saved preferences and coordinates the controllers.
The popup's HTML, CSS, and script live in `extension/popup/` and load the same
shared settings declaration. See [README.md](../README.md#development) for the
repository folder map.

## Lifecycle recovery

Synchronous feature startup/update failures are reported in the console with the
feature name and do not block the remaining features. A later relevant storage
event retries failed features, even when its values are unchanged; healthy
features and unchanged root attributes are skipped. Retries are event-driven,
not a timer loop. Failed cleanup must succeed before a fresh attach can run.

If the initial preference read fails, the next relevant local storage event
retries it. Only one read may be in flight. Changes received before or during
recovery are retained, including removed keys and a saved pause; cosmetic rules
stay inactive until preferences load successfully.

The popup applies edits optimistically and merges storage notifications while a
save is pending. A successful save callback keeps that current state, so it cannot
overwrite a newer notification with the original edit.
After a failed save, notifications received during the recovery read override
that read's snapshot, including removed keys. If the read also fails, rollback
only restores fields without notifications since the save began.

## Region cleanup

Region attachments receive an `onCleanup` callback and register teardown before
changing the DOM or connecting observers. `regions.watch(selector, attach, own)`
passes unsubscribe to the feature's `own` callback before initial discovery, so
it remains reachable even if initial setup and rollback both throw. Unsubscribe
attempts every registered region cleanup and retains failures for another call.
Normal asynchronous sidebar restoration continues to settle before detaching.
Sidebar cosmetics require a per-region readiness marker. The layout controller
expands the native sidebar when either sidebar feature needs it, then clicks
native Show More controls before marking it ready. A retained pagination control
is clicked again only after its section gains rows; pending or disabled controls
leave the native sidebar visible. Later mounts repeat this sequence, and cleanup
removes the readiness marker alongside section labels.

## Discovery and mutation handling

The document-start content script waits for saved preferences before activating
the rules, so a previously paused extension does not temporarily hide controls.
This can allow a brief initial flash while storage loads. CSS handles new matching
elements during Twitch navigation. A mount observer waits for the initial document
root, then disconnects. After mounting, `extension/shared/regions.js` owns one shared document
observer for discovery while features are active. It tracks added subtrees,
region identity changes, and detached mounts; feature observers stay inside their
mounted sidebar, navigation, player, chat, or composer regions. Discovery handles
later mounts without rescanning the whole document on every chat mutation. Pausing
releases subscriptions and disconnects discovery when none remain; asynchronous
native sidebar restoration is allowed to finish. Delegated pointer and focus
handlers cover emotes in later messages without scanning chat or intercepting
native clicks and keyboard activation. While a preview is
active, its temporary observer checks source connectivity and filters mutations
before measuring the native tooltip. It disconnects when the preview closes.
Emote preview content stays detached until a matching Twitch tooltip mounts.
Its image is prepended above native labels; matching accepts a native name label
inside richer metadata without replacing those nodes. No standalone overlay or
popover is created. Pending activation is canceled by the same dismissal,
navigation, and pause paths as a mounted preview.
Replay time formatting observes added nodes/text changes and visits only the
affected subtrees. Each formatted leaf belongs to one mounted chat region. Moves
outside the timestamp context release its marker, including moves within a chat
region; transfers let the receiving region claim the leaf before the previous
region's teardown can clear it. Pausing releases owned markers even when nodes
have moved before observer delivery. Native timestamp text and seek targets stay
intact.
Player sizing observes its placeholder dimensions and root mode
changes, reconnecting when relevant player or metadata nodes change during navigation.
Unrelated chat updates do not trigger document-wide player searches.
Chat styling observes affected rows, author changes, and adjacent messages; it
deduplicates affected rows within each mutation batch and cleans up removed
subtrees without scanning every retained row. Disabling the
master switch removes tint variables and temporary grouping attributes.
The same row pass compacts badges, hiding only their empty layout wrappers.
Delegated hover/focus handlers add the other badge names beneath Twitch's original
text in its native tooltip, using native titles or image alt names as metadata.
Tooltip discovery prefers native `aria-describedby` links, with exact-name and
distance matching as a fallback. Its temporary observer filters tooltip mutations
while a badge is active; ordinary chat updates never search or measure tooltips.
Badge order, metadata changes, detached rows, and region disposal reconcile or
release added tooltip details and hidden markers. Native tooltip text nodes,
theme, arrow, placement, accessible names, titles and badge handlers are preserved.
The composer controller watches changed editor subtrees and later mounts. It
never rewrites the draft or changes Twitch's native Send disabled state; temporary
controls, IDs, and open-state markers are removed when the feature is paused.

## Test organization

`tests/settings.test.cjs` checks the stable preference API and normalization.
`tests/content.test.cjs` covers content startup, storage races, failure isolation,
and retries; `tests/runtime.test.cjs` covers the lifecycle adapter. Manifest,
version, CSS baseline, and fixture script-order contracts belong in
`tests/architecture.test.cjs`.

The architecture suite also checks that every root test file belongs to exactly
one focused npm command and every browser feature module is registered exactly
once, with no missing, duplicate, or stale entries. It verifies local inline
Markdown link and image targets in root and `docs/` Markdown files, including
angle-wrapped and percent-encoded paths. Code examples, external URLs, and
anchor-only links are ignored; reference links, HTML links, nested destination
parentheses, and Markdown escapes are outside this small check's scope.

Settings, content, and CSS checks use `tests/support/rules.cjs` to load settings,
selectors, and rules in manifest order without DOM controllers. Each call uses a fresh VM
context unless a content test supplies its own context with DOM and storage mocks.

Browser feature modules live in `tests/browser/`. `visibility.cjs` checks page
visibility, layout, and preference changes, while `popup.cjs` owns popup controls
and storage failures. `tests/browser.test.cjs` registers the modules sequentially.
Harness failures have their own suite in `tests/harness.test.cjs`, and ZIP checks
live in `tests/package.test.cjs`. See [README.md](../README.md#development) for
full and focused test commands and their requirements.

## Browser test harness

The browser harness launches one Chrome child and one UUID profile per run,
reuses their CDP connection for sequential feature modules, and removes only that
profile after the child exits, including on assertion/setup failures. Each test
navigates independently with a fresh storage mock; emote click tracking and popup
write failures have their own setup. HTML fixtures contain a production marker
that the local CDP response handler expands from the manifest, including CSS.
No generated script lists or fixture web server are needed. All remote requests
are blocked or fulfilled locally, including emote images and snapshot resources.
The harness captures uncaught page exceptions from startup onward, including
timer errors and unhandled promise rejections. Handled storage failures and
console warnings remain valid test scenarios. Harness failure checks use separate
isolated browsers so deliberately broken pages cannot contaminate feature tests.
Failed launches and early process exits report the executable and the last 8192
characters of stderr without waiting for the startup timeout. Profile cleanup
waits for the child process and its output streams to close, including launch
failures.
The debugging-target HTTP response and JSON body share a timeout, and WebSocket
connection setup has its own timeout. Both default to ten seconds. Failure aborts
the pending request or closes the socket, releases connection listeners and
timers, and follows the same browser/profile cleanup path.
