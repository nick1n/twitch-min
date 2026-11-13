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

Alternatively, extract `dist/twitch-min-0.1.13.zip` and load the extracted folder
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
| Sidebar sections | Offline channels, other sections, streak prompts, collapse arrow, sorting extras, Show More/Less | Only the shortened Followed, Live, and Similar headers and their online channels |
| Compact sidebar | Channel names, stray avatar captions, status extras, and scrollbar; narrows the sidebar to 144px with compact rows | Avatar on the left, 13px viewer count on the right, 12px current game underneath; scrolling and full sidebar height |
| Top navigation extras | Luna/Prime offers including its badge, Shouts, Gift Turbo (including text-only buttons), Bits | Notification bell and badge, search, browsing, whispers, and account controls |
| Channel action extras | Share (including VOD pages), channel notification bell, Bits, Gift a Sub, visible Subscribe/Resubscribe labels | Follow, subscription icons and dropdown arrow, title, tags, and viewer count |
| About & lower channel section | About/panels, the VOD channel card, and recommendations; the player fills available space above its details | Video title, category, views, and chat; native theatre/fullscreen sizing |
| Chat leaderboard | Gift/cheer ranking strip and its carousel arrows | Chat messages |
| Chat message composer | Input strip and its inline Bits/emote tools | Bottom points, settings, and Chat button, as in the screenshot |
| Short video chat times | Seconds in replay timestamp labels: `1:32:56` becomes `1:32`, `5:26` becomes `0:05` | Visible hours:minutes, original seek targets, and message text |

Hiding the composer makes chat read-only until that switch is turned off.
The bottom Chat button remains visible because it was not highlighted, but there
is no visible message box to type into. Hidden controls use `display: none`.
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
selector can be adjusted. Keep all selector changes in `extension/rules.js`.
Avoid broad selectors such as all buttons or all chat panels. Sidebar collapse
belongs in `extension/layout.js`, with compact row styles in `extension/rules.js`;
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

Set `CHROME_PATH` if Chrome is not at a standard location. Browser tests create
isolated profiles under the ignored `.browser-tests` folder and use a local
debugging connection. Tests never use your everyday browser profile. The test
browser uses `--no-sandbox` to run in the managed Windows environment and only
loads trusted local fixture files. Test profiles may be deleted after the tests.

```text
extension/
  manifest.json       Twitch-only scope and popup declaration
  settings.js         Defaults, groups, and normalization
  rules.js            Scoped CSS selectors, grouped by switch
  content.js          Stylesheet setup and saved-preference updates
  layout.js           Native sidebar state and text-only navigation controls
  emotes.js/css       Click previews for chat emotes and their anchored bubble
  timestamps.js       Replay timestamp formatting without changing seek targets
  player.js/css       Wheel volume control and fitted VOD portal sizing
  chat.js             Author-color tints and consecutive-sender labels
  popup.*             Controls, local storage, and error states
  icons/              PNG extension icons
tests/                Node checks and real Chrome fixture checks
scripts/package.ps1   ZIP the installable extension files
```

The document-start content script waits for saved preferences before activating
the rules, so a previously paused extension does not temporarily hide controls.
This can allow a brief initial flash while storage loads. CSS handles new matching
elements during Twitch navigation. A mount observer waits for the initial document
root, then disconnects. The layout controller observes sidebar state and navigation
labels within those regions; its document observer only checks that the roots are
still connected during chat insertions. While an emote preview is open, another
observer checks whether its source is still connected and the URL is unchanged;
it disconnects when the bubble closes. Delegated click and keyboard handlers cover
emotes in later messages without scanning chat.
Replay time formatting observes added nodes/text changes and visits only the
affected subtrees. Player sizing observes its placeholder dimensions and root mode
changes, reconnecting if Twitch replaces the player during navigation.
Chat styling observes affected rows, author changes, and adjacent messages; it
does not scan the entire message history for every new message. Disabling the
master switch removes tint variables and temporary grouping attributes.

Icons can be regenerated with `python scripts/generate_icons.py` (standard library only).
