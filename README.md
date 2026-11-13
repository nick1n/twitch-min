# twitch-min

A small Manifest V3 Chrome extension that hides the Twitch controls highlighted
in the supplied screenshot. Vanilla JavaScript and CSS; no build or npm install
is required to use it.

## Install locally

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's **extension** folder
   (the folder containing `manifest.json`).
3. Refresh Twitch tabs that were already open.
4. Pin **twitch-min** in Chrome's Extensions menu, then open its popup.

Alternatively, extract `dist/twitch-min-0.17.0.zip` and load the extracted folder
containing `manifest.json`. Keep that folder: Chrome loads the extension from it.
This is an unpacked extension, not a Chrome Web Store installation.

The ZIP is the upload package for the **Chrome Web Store**, with `manifest.json`
at its root. It can also be used for sharing or backups. You do **not** need the
ZIP when Chrome loads this repository's `extension` folder directly: reload the
extension at `chrome://extensions` and refresh Twitch after changes. Packaging
does not publish the extension. See [Chrome's preparation guide](https://developer.chrome.com/docs/webstore/prepare).

All eight groups are enabled initially. Toggle any group independently, use the
master switch or **Restore everything** to pause hiding, and choose **Use screenshot
preset** to enable all groups again. Restoring preserves your individual choices.
Preferences update open Twitch tabs without a reload after the first installation.

## What it hides

| Switch | Hides | Preserves |
| --- | --- | --- |
| Sidebar sections | Offline channels, other sections, streak prompts, collapse arrow, sorting extras, Show More/Less | Only the shortened Followed, Recommended, and Similar headers and their online channels |
| Compact sidebar | Channel names, stray avatar captions, status extras, and scrollbar; narrows the sidebar to 144px with compact rows | Avatar on the left, 13px viewer count on the right, 12px current game underneath; scrolling and full sidebar height |
| Top navigation extras | Luna/Prime offers including its badge, Shouts, Gift Turbo (including text-only buttons), Bits | Notification bell and badge, search, browsing, whispers, and account controls |
| Channel action extras | Share (including VOD pages), channel notification bell, Bits, Gift a Sub, visible Subscribe/Resubscribe labels | Follow, subscription icons and dropdown arrow, title, tags, and viewer count |
| About & lower channel section | About/panels, the VOD channel card, and recommendations; the player fills available space above its details | Video title, category, views, and chat; native theatre/fullscreen sizing |
| Chat leaderboard | Gift/cheer ranking strip and its carousel arrows | Chat messages |
| Chat message composer | Input strip and its inline tools until Chat is clicked; native Send button | Points, settings, and a Chat toggle to show/hide the editor |
| Short video chat times | Seconds in replay timestamp labels: `1:32:56` becomes `1:32`, `5:26` becomes `0:05` | Visible hours:minutes, original seek targets, and message text |

The message box starts hidden. Click **Chat** to show it and focus the editor;
click **Chat** again to hide it. Neither click sends a message, and your draft
stays intact. Enter inside the editor keeps Twitch's normal send behavior.
A separate button replaces the visible native Send control, so the toggle works
even when Twitch disables Send for an empty draft. It supports mouse, Enter,
and Space activation, with an accessible expanded state. The open/closed state
is local to the current composer and does not change your saved preferences.
Turning off **Chat message composer**, the master switch, or **Restore everything**
restores Twitch's original editor and Send button. Hidden controls use `display: none`.

The compact sidebar keeps Twitch's expanded metadata mounted, because Twitch
removes viewer counts and games from its native collapsed rows. If necessary,
the extension uses Twitch's own expand control, then lays out the existing rows
as avatar + count + game. Counts and games update directly with Twitch's DOM.
Long game names truncate visually but retain Twitch's full-name hover title.
Only horizontal widths change; overlay flex sizing and sidebar height stay native.
Disabling the option restores the original width and names, and re-collapses the
sidebar if it was initially collapsed. Streak prompts and Show More/Less are
unavailable while their group is on; pause hiding to use them.

**Sidebar sections** replaces the old header-hiding switch and defaults on even
if the old switch was off. Headers keep their native markup with short visible
labels. Offline transition wrappers are hidden too, so they leave no blank rows.
Compact rows render only the viewer count and game text; unexpected captions
inside native nested wrappers cannot create an extra third line.
Promoted followed cards use the same avatar/count/game grid as ordinary channels.
Their gradient, extra artwork, channel title, and sponsorship footer are hidden;
the original avatar, live viewer count, current game, and channel link remain.
Rows are 38px tall, with 12px section headers and 26px avatars.

Replay time formatting uses a visual label over Twitch's unchanged timestamp text,
so clicking a time still seeks to the original second. Turn off **Short video chat
times** to show the full native timestamps.

**Channel action extras** also covers the live action row when Twitch places it
outside `.channel-info-content`, including its reused navigation-style Bits
control. Subscribe/Resubscribe labels are visually hidden while their original
text remains available to assistive technology. Their icons, dropdown arrows,
focus, and native click behavior stay intact. Turning off the group restores the
full labels and the Bits button.

## Video volume and sizing

The player hides Clip, only the middle speed display, and its Follow, Gift a Sub,
Subscribe, and Resubscribe overlay buttons. The decrease/increase speed buttons
remain available. Playback, volume, Settings, theatre,
fullscreen, and playback speed inside Settings remain available. These rules
apply only inside the video player; the channel controls below it keep their
existing behavior. The master switch restores the hidden player controls.

Scroll up over the video to raise volume or down to lower it. A normal 100px wheel
notch changes volume by 5%; smaller trackpad deltas make smaller adjustments.
The level is clamped to 0–100%, and scrolling up unmutes the video. A short volume
indicator appears, and Twitch's volume slider is updated too. Scrolling in chat,
the sidebar, or player menus keeps its normal behavior; Ctrl+wheel still zooms.
The master switch pauses wheel volume control.

With **About & lower channel section** enabled on a VOD, the player and its metadata
fill the available main-column height. The player portal follows the actual video
placeholder using ResizeObserver, removing the reserved blank lower panel after
About is hidden. The video keeps its aspect ratio, so normal letterboxing can still
appear inside the video. Theatre/fullscreen modes keep Twitch's own sizing.
The fitted height comes directly from the visible scroll viewport rather than
percentage-height ancestors. Old channel-panel scroll offsets reset when fitting
starts; disabling it restores native sizing and removes the extension's height.

## Chat and search styling

The top chat header bar, including its title, community button, and floating
collapse control, is hidden to free vertical space for messages. This includes
the replay header. The expand control remains available when chat is collapsed.
The master switch or **Restore everything** brings the header back.

Chat rows receive a **6% tint** of the author's displayed username color, using
`color-mix` with a translucent fallback. The tint overlays Twitch's existing
background instead of replacing its background color, preserving native highlight
colors. New messages, reused rows, and changed username colors update automatically.
Live chat reads the inner colored display name before falling back to its
clickable username wrapper, which can inherit the ordinary gray text color.
The master switch pauses tints and restores the native row backgrounds.

In live and replay chat, consecutive messages from the same account show the
username only on the first message. Later messages hide the repeated username
and its colon while retaining timestamps, badges, emotes, text, and author-color
tints. Another speaker or a system notice starts a new run with a visible name.
New messages, deleted rows, and loaded history update the grouping automatically.
The master switch restores every username and its native click behavior.

The top navigation search field has a transparent border instead of the white
outline, with a subdued purple inset indicator while focused. Its native typing,
suggestions, and search controls remain intact.

## Emote previews

Click a chat emote in a live stream or video replay to add an image at **3 times
its displayed chat size** to Twitch's own emote-name tooltip. The original name,
theme, arrow, and Popper placement are retained. If Twitch hasn't mounted its
tooltip yet, a standalone white bubble appears and moves into the native tooltip
when its matching name becomes available.
Click the same emote again, click elsewhere, or press Escape to dismiss it.
Existing emote buttons also work with Enter or Space. Clicking a different emote
replaces the bubble. Scrolling or navigating away closes it.
Twitch dismissing or reusing its tooltip also closes the enlarged image. Closing
the extension preview removes only its image and temporary attributes, leaving
the native wrapper, name, arrow, and original inline styles intact. Tooltip IDs
are read dynamically; generated class hashes and the sample's ID are not selectors.

The preview uses a larger supplied image variant, or Twitch's existing
[emote CDN format](https://dev.twitch.tv/docs/irc/emotes/#emote-cdn-url-format),
without changing its animation format or theme. If that variant is unavailable,
the original image is enlarged instead. Chat messages keep their original sizes.
The bubble replaces the emote-name title tooltip while open; the original title
and click behavior are restored when previews are paused with the master switch
or **Restore everything**. Badges, images outside chat, and composer emotes are
left to Twitch. Third-party extension emote markup is not specifically supported.

## Verification and current limits

See [CHANGELOG.md](CHANGELOG.md) for release history and prior live verification notes.

The test suite runs the actual styles and content script in real headless Chrome
against representative fixtures, with a mocked Chrome storage API. It checks
visibility, retained controls, reclaimed sidebar width and About height, settings changes, late DOM
insertions, same-document navigation, restoration, failures, and the actual popup.
It also checks emote preview dimensions, image source selection, keyboard controls,
dismissal, late messages, viewport edges, and image-load fallback. Emote image
requests in tests are intercepted and fulfilled locally, without contacting Twitch.
It does **not** claim to install the extension into your Chrome profile or verify
all signed-in Twitch UI variants. When `.browser-tests/test.html` or
`.browser-tests/live.html` exists, additional tests parse that supplied HTML
inertly, block HTTP requests, and import sanitized UI fragments to check the
actual selectors. The private HTML stays ignored and is not included in the
packaged extension.

English aria-label and text fallbacks may miss localized variants. Twitch can change selectors or run different
layouts for different accounts. These are cosmetic rules, not a guarantee that
every future variant is covered.

If an item remains visible, first enable its switch and refresh Twitch. If it
still appears, inspect that item in DevTools and copy its `outerHTML` so the
selector can be adjusted. Keep shared region selectors in `extension/selectors.js` and cosmetic selectors in the matching `extension/rules-*.js` feature file.
Avoid broad selectors such as all buttons or all chat panels. Sidebar collapse
belongs in `extension/layout.js`, with compact row styles in `extension/rules-sidebar.js`;
keep the native metadata and overlay height intact.

After editing the extension, click **Reload** on its `chrome://extensions` card
and refresh Twitch. **Remove** uninstalls it and removes its stored preferences.

## Privacy and permissions

- Content scripts match only `https://www.twitch.tv/*` and `https://twitch.tv/*`.
- The only API permission is `storage`, for locally saved boolean settings.
- No account credentials, Twitch API calls, analytics, backend, remote scripts,
  or network interception are used. The extension sends no page content anywhere.
- Hiding is cosmetic. Twitch itself can still load/run the hidden features.
- Opening an emote preview may load a larger image from Twitch's emote CDN.
  This uses the emote's existing URL or image variants, with no Twitch API access.

## Development

Node 22 or newer and an installed Chrome are needed for tests, not for installation.
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
npm.cmd test
npm.cmd run package
```

Packaging requires Windows PowerShell and its built-in .NET ZIP support; no
additional dependencies are needed. It uses the manifest version (currently `0.17.0`) and rebuilds the
ignored `dist/twitch-min-0.17.0.zip`. The script checks package/manifest version
agreement and the manifest's scripts, styles, popup, and icons, including local
assets referenced by the popup. It writes a temporary ZIP, verifies the root
manifest and every source file's SHA-256 content, then replaces the release ZIP
only after validation succeeds. Missing assets or validation failures fail the
command and preserve the previous release. Packaging tests use isolated temporary
fixtures and preserve unrelated outputs and private `.browser-tests` HTML files.
Packaging does not publish or change extension permissions or Twitch-only scope.

Set `CHROME_PATH` if Chrome is not at a standard location. Browser tests create
isolated profiles under the ignored `.browser-tests` folder and use a local
debugging connection. Tests never use your everyday browser profile. The test
browser uses `--no-sandbox` to run in the managed Windows environment and only
loads trusted local fixture files. Each run removes its own profile after Chrome exits; private HTML snapshots are preserved.

```text
extension/
  manifest.json       Twitch-only scope and popup declaration
  settings.js         Single setting declaration; derived defaults, attributes, popup groups
  selectors.js        Shared region selectors used by controllers and rules
  runtime.js          Feature lifecycle adapter
  regions.js          Shared region discovery and remount notifications
  rules-sidebar.js    Sidebar filtering and compact row CSS
  rules-navigation.js Navigation extras and search CSS
  rules-player.js     Player controls, channel actions, and VOD layout CSS
  rules-chat.js       Chat headers, tint, timestamps, and composer CSS
  rules.js            Thin ordered rule aggregator and CSS builder
  content.js          Stylesheet setup and saved-preference updates
  layout.js           Native sidebar state and text-only navigation controls
  emotes.js/css       Click previews for chat emotes and their anchored bubble
  timestamps.js       Replay timestamp formatting without changing seek targets
  player.js/css       Wheel volume control and fitted VOD portal sizing
  chat.js             Author-color tints and consecutive-sender labels
  composer.js         Chat toggle, editor focus, and native Send restoration
  popup.*             Controls, local storage, and error states
  icons/              PNG extension icons
tests/
  browser.test.cjs     One browser run, sequential feature registration
  browser/*.cjs        Independent feature checks and optional snapshot imports
  support/chrome.cjs   Reusable Chrome/CDP resource lifecycle and page helpers
  support/production.cjs Manifest-driven fixture scripts/styles and local network policy
  architecture.test.cjs Settings, exact CSS preservation, script order, version checks
  runtime.browser.test.cjs Integration lifecycle, region, timestamp, and no-op regressions
scripts/package.ps1   ZIP the installable extension files
```

The document-start content script waits for saved preferences before activating
the rules, so a previously paused extension does not temporarily hide controls.
This can allow a brief initial flash while storage loads. CSS handles new matching
elements during Twitch navigation. A mount observer waits for the initial document
root, then disconnects. After mounting, `regions.js` owns one shared document
observer for discovery while features are active. It tracks added subtrees,
region identity changes, and detached mounts; feature observers stay inside their
mounted sidebar, navigation, player, chat, or composer regions. Discovery handles
later mounts without rescanning the whole document on every chat mutation. Pausing
releases subscriptions and disconnects discovery when none remain; asynchronous
native sidebar restoration is allowed to finish. Delegated click and keyboard
handlers cover emotes in later messages without scanning chat. While a preview is
open, its temporary observer checks source connectivity and filters mutations
before measuring the native tooltip. It disconnects when the preview closes.
Replay time formatting observes added nodes/text changes and visits only the
affected subtrees. Player sizing observes its placeholder dimensions and root mode
changes, reconnecting when relevant player or metadata nodes change during navigation.
Unrelated chat updates do not trigger document-wide player searches.
Chat styling observes affected rows, author changes, and adjacent messages; it
deduplicates affected rows within each mutation batch and cleans up removed
subtrees without scanning every retained row. Disabling the
master switch removes tint variables and temporary grouping attributes.
The composer controller watches changed editor subtrees and later mounts. It
never rewrites the draft or changes Twitch's native Send disabled state; temporary
controls, IDs, and open-state markers are removed when the feature is paused.

Icons can be regenerated with `python scripts/generate_icons.py` (standard library only).

### Architecture and ownership

See [ROADMAP.md](ROADMAP.md) for validation priorities, small follow-ups, and the
conditions that would justify a sidebar state machine or DOM compatibility layer.

`settings.js` declares each stable storage key, default, HTML attribute, popup
title, and description once in `DEFINITIONS`. `DEFAULTS`, `ATTRIBUTES`, and the
existing eight-entry `GROUPS` popup API are derived from it. The master preference
is declared alongside the groups but remains a separate popup control.

Feature rule files expose frozen `[cascadeSlot, rule]` entries. `rules.js` sorts
those slots and retains the `TwitchMinRules.RULES` / `buildCSS()` API. The slots
preserve the existing cross-feature cascade, including interleaved master-switch
rules. `tests/rules-baseline.json` records the original rule count and SHA-256 of
the complete CSS; an intentional cosmetic change requires reviewing and updating
that baseline. Shared selectors can be comma-separated lists; descendant rules
wrap those lists in `:is(...)` so every alternative stays scoped. VOD rules add
the existing theatre exclusions to the shared VOD root.

Runtime controllers own DOM discovery, observers, event handlers, and restoration;
rule modules own cosmetic CSS. Shared region discovery belongs in `regions.js`
and lifecycle support in `runtime.js`. Each feature supplies internal
`attach(settings)`, `update(settings)`, and `dispose()` hooks to
`TwitchMinRuntime.create`. The public controller API is `update(settings)` and
`dispose()`; the adapter attaches on activation, updates an active feature, and
disposes it on pause. Keep feature-specific selectors beside
their feature; promote selectors shared across controllers/rules to `selectors.js`.
The production dependency order is defined by `extension/manifest.json`.

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
