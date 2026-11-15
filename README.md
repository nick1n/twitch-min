# twitch-min

A small Manifest V3 Chrome extension for a calmer Twitch, with cosmetic changes
and interactive enhancements. Vanilla JavaScript and CSS; no build or npm install
is required to use it.

## Install locally

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's **extension** folder
   (the folder containing `manifest.json`).
3. Refresh Twitch tabs that were already open.
4. Pin **twitch-min** in Chrome's Extensions menu, then open its popup.

Alternatively, extract `dist/twitch-min-<version>.zip` and load the extracted folder
containing `manifest.json`. Keep that folder: Chrome loads the extension from it.
This is an unpacked extension, not a Chrome Web Store installation.

The ZIP is the upload package for the **Chrome Web Store**, with `manifest.json`
at its root. It can also be used for sharing or backups. You do **not** need the
ZIP when Chrome loads this repository's `extension` folder directly: reload the
extension at `chrome://extensions` and refresh Twitch after changes. Packaging
does not publish the extension. See [Chrome's preparation guide](https://developer.chrome.com/docs/webstore/prepare).

All settings are enabled initially. Use **Enabled** to pause or resume without
changing your individual choices. **Enable all settings** selects every setting
and resumes the extension; it only appears when available. **More settings ↓**
jumps to the bottom of the settings list, then becomes **Back to top ↑**.
Preferences update open Twitch tabs without a reload after the first installation.

## Cosmetic switches

| Switch | Hides | Preserves |
| --- | --- | --- |
| Sidebar sections | Offline channels, other sections, streak prompts, collapse arrow, sorting extras, Show More/Less | Only the shortened Followed, Recommended, and Similar headers and their online channels |
| Compact sidebar | Channel names, stray avatar captions, status extras, and scrollbar; narrows the sidebar to 144px with compact rows | Avatar on the left, 13px viewer count on the right, 12px current game underneath; scrolling and full sidebar height |
| Top navigation extras | Luna/Prime offers including its badge, Shouts, Gift Turbo (including text-only buttons), Bits | Notification bell and badge, search, browsing, whispers, and account controls |
| Channel action extras | Share (including VOD pages), channel notification bell, Bits, Gift a Sub, visible Subscribe/Resubscribe labels | Follow, subscription icons and dropdown arrow, title, tags, and viewer count |
| About & lower channel section | About/panels, the VOD channel card, and recommendations; the player fills available space above its details | Video title, category, views, and chat; native theatre/fullscreen sizing |
| Chat leaderboard | Gift/cheer ranking strip, goal slides, and carousel arrows | Chat messages |
| Chat message composer | Input strip and its inline tools until Chat is clicked; native Send button | Points, settings, and a Chat toggle to show/hide the editor |
| Short video chat times | Seconds in replay timestamp labels: `1:32:56` becomes `1:32`, `5:26` becomes `0:05` | Visible hours:minutes, original seek targets, and message text |

The message box starts hidden. Click **Chat** to show it and focus the editor;
click **Chat** again to hide it. Neither click sends a message, and your draft
stays intact. Enter inside the editor keeps Twitch's normal send behavior.
A separate button replaces the visible native Send control, so the toggle works
even when Twitch disables Send for an empty draft. It supports mouse, Enter,
and Space activation, with an accessible expanded state. The open/closed state
is local to the current composer and does not change your saved preferences.
Turning off **Chat message composer** or the master switch
restores Twitch's original editor and Send button. Hidden controls use `display: none`.

The compact sidebar keeps Twitch's expanded metadata mounted, because Twitch
removes viewer counts and games from its native collapsed rows. If necessary,
the extension uses Twitch's own expand control, then lays out the existing rows
as avatar + count + game. Counts and games update directly with Twitch's DOM.
Long game names truncate visually but retain Twitch's full-name hover title.
Only horizontal widths change; overlay flex sizing and sidebar height stay native.
Disabling the option restores the original width and names. Pausing both sidebar
features also re-collapses the sidebar if it was initially collapsed.
Before filtering offline rows or changing
sidebar titles, the extension clicks Twitch's Show More controls and waits for
their lists to expand. Streak prompts and Show More/Less are unavailable while
their group is on; pause hiding to use them.

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
Short labels are right-aligned in a fixed column measuring `00:00` in the timestamp
font, rounded up to the next whole CSS pixel in current Chrome, with tabular
digits and no extra width from native button padding. Older Chrome versions
without intrinsic-size rounding retain the exact content-width fallback.

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
Turn off **Wheel volume** or pause the extension to restore normal wheel behavior.

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
The master switch brings the header back.

Replay chat's per-message actions menu is hidden, including its wrapper. The
master switch restores the menu and its native actions.

Live and replay chat scrollbars are hidden while wheel, trackpad, and keyboard
scrolling stay native. The master switch restores the scrollbars.

Chat rows receive a **6% tint** of the author's displayed username color, using
`color-mix` with a translucent fallback. The tint overlays Twitch's existing
background instead of replacing its background color, preserving native highlight
colors. New messages, reused rows, and changed username colors update automatically.
Live chat reads the inner colored display name before falling back to its
clickable username wrapper, which can inherit the ordinary gray text color.
Turn off **Chat author tints** or pause the extension to restore native row backgrounds.

In live and replay chat, consecutive messages from the same account show the
username only on the first message. Later messages hide the repeated username
and its colon while retaining timestamps, emotes, text, and author-color
tints. Another speaker or a system notice starts a new run with a visible name.
New messages, deleted rows, and loaded history update the grouping automatically.
Turn off **Group consecutive messages** or pause the extension to restore every
username and its native click behavior. This also removes the sender-group borders.

Each visible username keeps the first badge in Twitch's existing order.
Continuation messages hide their badges along with the repeated username.
Hover or focus that badge to see the other badge names beneath its name in
Twitch's own tooltip. The popup keeps Twitch's theme and arrow. New badges and
changed names update automatically; the first badge keeps its native click
behavior and accessible name. The master switch restores all badges and removes
the added tooltip details.

The top navigation search field has a transparent border instead of the white
outline, with a subdued purple inset indicator while focused. Its native typing,
suggestions, and search controls remain intact.

## Emote previews

Hover a chat emote in a live stream or video replay to add an image at **3 times
its displayed chat size** above the name in Twitch's own emote tooltip. Existing
name and detail labels, theme, arrow, and Popper placement are retained. If Twitch
hasn't mounted its matching tooltip yet, the image waits for it; no separate
popup is shown.
The image appears on the first hover; moving away or pressing Escape dismisses
it. Focusing a native emote button also supports the preview. Native click and
Enter/Space behavior stay intact. Hovering another emote replaces the image;
scrolling or navigating away closes it.
Twitch dismissing or reusing its tooltip also closes the enlarged image. Closing
the extension preview removes only its image and temporary attributes, leaving
the native wrapper, name, arrow, and original inline styles intact. Tooltip IDs
are read dynamically; generated class hashes and the sample's ID are not selectors.

The preview uses a larger supplied image variant, or Twitch's existing
[emote CDN format](https://dev.twitch.tv/docs/irc/emotes/#emote-cdn-url-format),
without changing its animation format or theme. If that variant is unavailable,
the original image is enlarged instead. Chat messages keep their original sizes.
The preview suppresses browser title bubbles while active; original titles
are restored when **Enlarged emote previews** is turned off or the extension is
paused. Badges, images outside chat, and composer emotes are left to Twitch.
Third-party extension emote markup is not specifically supported.

## Verification and current limits

See [CHANGELOG.md](CHANGELOG.md) for release history and prior live verification notes.

The test suite runs the actual styles and content script in real headless Chrome
against representative fixtures, with a mocked Chrome storage API. It checks
visibility, retained controls, reclaimed sidebar width and About height, settings changes, late DOM
insertions, same-document navigation, restoration, failures, and the actual popup.
It also checks emote preview dimensions, image source selection, keyboard controls,
dismissal, late messages, viewport edges, and image-load fallback. Emote image
requests in tests are intercepted and fulfilled locally, without contacting Twitch.
An additional smoke test loads the actual unpacked extension in a temporary
Chrome profile. It uses real local storage and content-script isolation, checks
popup changes across two Twitch-origin tabs, page reload and browser restart,
and verifies that a non-Twitch page is untouched. These pages are local fixtures
served through Chrome's request interception; no Twitch page or account is used.
The test needs a recent Chrome with the experimental
[Extensions.loadUnpacked debugging command](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked).
It never loads the extension into your everyday Chrome profile or verifies
signed-in Twitch UI variants. When `.browser-tests/test.html` or
`.browser-tests/live.html` exists, additional tests parse that supplied HTML
inertly, block HTTP requests, and import sanitized UI fragments to check the
actual selectors. The private HTML stays ignored and is not included in the
packaged extension.

English aria-label and text fallbacks may miss localized variants. Twitch can change selectors or run different
layouts for different accounts. These are cosmetic rules, not a guarantee that
every future variant is covered.

If an item remains visible, first enable its switch and refresh Twitch. If it
still appears, inspect that item in DevTools and copy its `outerHTML` so the
selector can be adjusted.

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

Coding-agent instructions are in [AGENTS.md](AGENTS.md).

Use the latest Node.js LTS for development. CI selects it directly with `lts/*`.
Browser checks also require an installed
Chrome, and packaging checks require Windows PowerShell.
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
npm.cmd test
npm.cmd run package
```

`npm.cmd test` runs the full suite. For focused checks:

| Command | Checks | Requirements |
| --- | --- | --- |
| `npm.cmd run test:unit` | Settings, content startup/storage, lifecycle, manifest, and CSS contracts | Node |
| `npm.cmd run test:browser` | Offline Chrome fixtures, installed-extension smoke check, popup, and harness failures | Node and recent Chrome |
| `npm.cmd run test:package` | ZIP contents, missing assets, and preservation on failure in temporary fixtures | Node and Windows PowerShell |
| `npm.cmd run test:soak` | Optional two-minute message, remount, pause/resume, and player-mode stress check | Node and Chrome |

The [CI workflow](.github/workflows/ci.yml) runs the full suite and packaging on
Windows with the latest Node.js LTS for pushes and pull requests. Newer runs cancel
superseded runs for the same ref. The architecture checks ensure
the focused commands cover every root test file and the browser runner registers
every feature module exactly once. They also check local inline file links in
root and `docs/` Markdown files; see [architecture.md](docs/architecture.md#test-organization)
for the link check's scope.

After packaging succeeds, CI retains the validated ZIP as a workflow artifact.
Download it from the run's **Artifacts** section and extract the artifact wrapper
to get the installable `twitch-min-<version>.zip`. The workflow does not publish a release.

The optional soak check runs 60 cycles with 200 new messages per cycle, retaining
at most 300 live and 300 replay rows. It checks cleanup on every pause and remounts
chat regions periodically. Set `TWITCH_MIN_SOAK_CYCLES` to a positive integer to
change the run length. Results go to ignored `.browser-tests/soak-results.json`;
unavailable fullscreen permission is reported separately. This is offline
resource-cleanup validation, not a measurement of signed-in Twitch performance.
See [validation notes](docs/validation.md) for the latest checks and their limits.

Packaging requires Windows PowerShell and its built-in .NET ZIP support; no
additional dependencies are needed. It uses the manifest version and rebuilds the
ignored `dist/twitch-min-<version>.zip`. The script checks package/manifest version
agreement and the manifest's scripts, styles, popup, and icons, including local
assets referenced by the popup. It writes a temporary ZIP, verifies the root
manifest and every source file's SHA-256 content, then replaces the release ZIP
only after validation succeeds. Missing assets or validation failures fail the
command and preserve the previous release. Packaging tests use isolated temporary
fixtures and preserve unrelated outputs and private `.browser-tests` HTML files.
Missing-asset cases are derived from the manifest and the popup's local asset
references, so new production scripts and styles are covered automatically.
Packaging does not publish or change extension permissions or Twitch-only scope.

Set `CHROME_PATH` if Chrome is not at a standard location. Browser tests create
isolated profiles under the ignored `.browser-tests` folder and use a local
debugging connection. Tests never use your everyday browser profile. The test
browser uses `--no-sandbox` to run in the managed Windows environment and only
loads trusted local fixture files. Each run removes its own profile after Chrome exits; private HTML snapshots are preserved.

```text
extension/
  manifest.json       Twitch-only scope and popup declaration
  INSTALL.txt         Installation and usage instructions for ZIP users
  content.js          Stylesheet setup and saved-preference updates
  shared/
    settings.js       Single setting declaration; derived defaults, attributes, popup groups
    selectors.js      Shared region selectors used by controllers and rules
    runtime.js        Feature lifecycle adapter
    regions.js        Shared region discovery and remount notifications
  controllers/
    layout.js         Native sidebar state and text-only navigation controls
    emotes.js         Hover previews inside Twitch's native emote tooltip
    timestamps.js     Replay timestamp formatting without changing seek targets
    player.js         Wheel volume control and fitted VOD portal sizing
    chat.js           Author-color tints and consecutive-sender labels
    composer.js       Chat toggle, editor focus, and native Send restoration
  styles/
    rules-sidebar.js  Sidebar filtering and compact row CSS
    rules-navigation.js Navigation extras and search CSS
    rules-player.js   Player controls, channel actions, and VOD layout CSS
    rules-chat.js     Chat headers, tint, timestamps, and composer CSS
    rules.js          Thin ordered rule aggregator and CSS builder
    emotes.css        Anchored emote preview bubble
    player.css        Player volume indicator and fitted VOD sizing
  popup/
    popup.html/css/js Controls, local storage, and error states
  icons/              PNG extension icons and SVG popup logo
tests/
  architecture.test.cjs Manifest, exact CSS preservation, script order, version checks
  content.test.cjs     Content startup, storage races, failure isolation, and retries
  settings.test.cjs    Stable preference API and malformed-value normalization
  runtime.test.cjs     Lifecycle failure cleanup and retry checks
  browser.test.cjs     One browser run, sequential feature registration
  extension.test.cjs   Installed extension, real storage, tabs, reload, restart, and scope
  harness.test.cjs     Chrome launch failures, profile cleanup, and page exception reporting
  package.test.cjs     ZIP contents and packaging failure recovery
  browser/*.cjs        Independent feature checks and optional snapshot imports
  browser/visibility.cjs Page visibility, layout, and preference changes
  browser/popup.cjs    Popup controls, saved settings, and storage failures
  browser/runtime.cjs  Integration lifecycle, region, timestamp, and no-op regressions
  support/chrome.cjs   Reusable Chrome/CDP resource lifecycle and page helpers
  support/installed.cjs Isolated installed-extension Chrome profile and debugging pipe
  support/production.cjs Manifest-driven fixture scripts/styles and local network policy
  support/rules.cjs    Shared VM loader for settings and rules in manifest order
  support/mock-storage.cjs Shared Chrome storage mock injected into browser pages
scripts/package.ps1   ZIP the installable extension files
```

Icons can be regenerated with `python scripts/generate_icons.py` (standard library only).

### Architecture and ownership

Settings are declared centrally, cosmetic rules are split by feature, and runtime
controllers own DOM behavior and restoration. Shared discovery tracks Twitch's
changing page regions; the manifest defines production script order.

See [docs/architecture.md](docs/architecture.md) for lifecycle, observer, CSS
cascade, failure recovery, and browser harness details. See
[ROADMAP.md](ROADMAP.md) for validation priorities and deferred improvements.
