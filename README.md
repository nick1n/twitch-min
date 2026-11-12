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

Alternatively, extract `dist/twitch-min-0.1.0.zip` and load the extracted folder
containing `manifest.json`. Keep that folder: Chrome loads the extension from it.
This is an unpacked extension, not a Chrome Web Store installation.

All six groups are enabled initially. Toggle any group independently, use the
master switch or **Restore everything** to pause hiding, and choose **Use screenshot
preset** to enable all groups again. Restoring preserves your individual choices.
Preferences update open Twitch tabs without a reload after the first installation.

## What it hides

| Switch | Hides | Preserves |
| --- | --- | --- |
| Sidebar headings & streaks | Section headers, collapse arrow, streak prompts, Show More/Less | Channel links and rows |
| Sidebar channel text | Channel names, categories, hype-train/status extras | Avatars, viewer counts, and row dimensions |
| Top navigation extras | Notification bell, Gift Turbo, Bits | Search, browsing, whispers, and account controls |
| Channel action extras | Channel notification bell, Bits, Gift a Sub | Follow, regular Subscribe, title, tags, and viewer count |
| Chat leaderboard | Gift/cheer ranking strip and its carousel arrows | Chat header and messages |
| Chat message composer | Input strip and its inline Bits/emote tools | Bottom points, settings, and Chat button, as in the screenshot |

Hiding the composer makes chat read-only until that switch is turned off.
The bottom Chat button remains visible because it was not highlighted, but there
is no visible message box to type into. Sidebar labels use `visibility: hidden`
to preserve their spacing; whole controls use `display: none`. Streak prompts
and Show More/Less are unavailable while their group is on; pause hiding to use them.

## Verification and current limits

Inspected the live **signed-out** `twitch.tv/karkalla` page on November 12, 2026:

- Confirmed the sidebar metadata/header targets and hype-train row structure.
- Confirmed channel `gift-button`, `.chat-input__textarea`, and the leaderboard's
  `leaderboard-item-name-test-selector` inside a direct chat-content child.
- Confirmed the composer can be targeted separately from the points/settings row.

The test suite runs the actual styles and content script in real headless Chrome
against representative fixtures, with a mocked Chrome storage API. It checks
visibility, retained controls and sidebar geometry, settings changes, late DOM
insertions, same-document navigation, restoration, failures, and the actual popup.
It does **not** claim to install the extension into your Chrome profile or verify
all signed-in Twitch UI variants.

Signed-in-only notification, Turbo/Bits, and watch-streak controls have scoped
selector fallbacks but still need a check in your session. English aria-label
fallbacks may miss localized variants. Twitch can change selectors or run different
layouts for different accounts. These are cosmetic rules, not a guarantee that
every future variant is covered.

If an item remains visible, first enable its switch and refresh Twitch. If it
still appears, inspect that item in DevTools and copy its `outerHTML` so the
selector can be adjusted. Keep all selector changes in `extension/rules.js`.
Avoid broad selectors such as all buttons, all chat panels, or the entire sidebar.

After editing the extension, click **Reload** on its `chrome://extensions` card
and refresh Twitch. **Remove** uninstalls it and removes its stored preferences.

## Privacy and permissions

- Content scripts match only `https://www.twitch.tv/*` and `https://twitch.tv/*`.
- The only API permission is `storage`, for locally saved boolean settings.
- No account credentials, Twitch API calls, analytics, backend, remote scripts,
  or network interception are used. The extension sends no page content anywhere.
- Hiding is cosmetic. Twitch itself can still load/run the hidden features.

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
  popup.*             Controls, local storage, and error states
  icons/              PNG extension icons
tests/                Node checks and real Chrome fixture checks
scripts/package.ps1   ZIP the installable extension files
```

The document-start content script waits for saved preferences before activating
the rules, so a previously paused extension does not temporarily hide controls.
This can allow a brief initial flash while storage loads. There is no continuous
DOM scan: CSS handles new matching elements during Twitch navigation. The only
observer waits for the initial document root, then disconnects.

Icons can be regenerated with `python scripts/generate_icons.py` (standard library only).
