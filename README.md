# twitch-min

A Chrome extension for a calmer Twitch: a compact sidebar, streamlined chat,
larger emote previews, and wheel volume control. No build or dependency install
is needed to use it.

## Install locally

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's **extension** folder.
3. Refresh existing Twitch tabs.
4. Pin **twitch-min** in Chrome's Extensions menu and open its popup.

For a packaged download, extract `twitch-min-<version>.zip` and load the folder
containing `manifest.json`. Keep that folder: Chrome loads the extension from it.
See [INSTALL.txt](extension/INSTALL.txt) for standalone ZIP instructions.

After updates, reload the extension at `chrome://extensions` and refresh Twitch.
**Remove** uninstalls it and deletes its saved preferences.

## Settings

All options start on and update open Twitch tabs immediately. **Enabled** pauses
or resumes without changing your choices. **Enable all settings** turns everything
on; it appears only when useful and keeps its layout space when hidden.
**More settings / Back to top** scrolls the list without changing a setting.

| Switch | Effect |
| --- | --- |
| Sidebar sections | Keep online Followed, Recommended, and Similar channels; hide offline rows and other sections. |
| Compact sidebar | Show avatars, viewer counts, and games in a narrow sidebar; hide names and promotional extras. |
| Top navigation extras | Hide Luna/Prime offers, Shouts, Gift Turbo, and Bits; keep search, notifications, whispers, and account controls. |
| Channel action extras | Hide Share, the channel bell, Bits, and Gift a Sub; keep Follow and subscription icons/dropdowns. |
| About & lower channel section | Hide About, panels, the replay channel card, and recommendations; fit the video above its details. |
| Chat leaderboard | Hide gift/cheer rankings and goal carousel slides. |
| Chat message composer | Use **Chat** to show or hide the editor instead of leaving it open. |
| Short video chat times | Show hours:minutes: `1:32:56` becomes `1:32`, and `5:26` becomes `0:05`. Seek targets stay unchanged. |
| Wheel volume | Scroll over the video to change volume; chat, sidebar, menu scrolling, and Ctrl+wheel zoom stay native. |
| Enlarged emote previews | Hover or focus an emote for a 3x image inside Twitch's native tooltip. Escape, scrolling, or leaving dismisses it. |
| Chat author tints | Add a subtle author-color background without replacing native highlights. |
| Group consecutive messages | Show repeated sender names once, hide their repeated badges, and separate sender groups with black borders. |

**Chat** never sends a message. It preserves drafts; Enter inside the editor keeps
Twitch's normal send behavior. Disabling the composer option restores the native
editor and Send button.

The sidebar uses Twitch's native expand and Show More controls before filtering.
Pausing both sidebar options restores native sidebar controls and re-collapses
the sidebar if it started collapsed.

While the extension is enabled, it also:

- Keeps one badge per visible sender header; hover/focus it for other badge names
  in Twitch's tooltip. Native badge actions remain available.
- Hides chat headers, replay message menus, and chat scrollbars. Native scrolling
  and the collapsed chat's expand control remain available.
- Hides player Clip, the middle speed display, and Follow/Gift/Subscribe overlays.
  Playback, volume, Settings, speed adjustment, theatre, and fullscreen remain.
- Softens the search border and keeps reward cards in three columns.

Turn a switch off to restore that feature's native behavior, or clear **Enabled**
to restore everything. The extension does not replace Twitch's player or chat.

## Privacy and permissions

- Runs only on `https://www.twitch.tv/*` and `https://twitch.tv/*`.
- Uses only the `storage` API permission, for local settings.
- No credentials, Twitch API calls, analytics, backend, remote scripts, or page
  content uploads. Emote previews may request a larger image from Twitch's CDN.
- Hiding is cosmetic: Twitch can still load and run hidden features.

## Limits and troubleshooting

Twitch layouts vary by account and language. English label fallbacks can miss
localized controls; third-party emote markup is not specifically supported.
Check the switch and refresh Twitch if something stays visible. For a reproducible
issue, provide steps and a small sanitized HTML example rather than a full page.

Tests use offline fixtures and an isolated installed-extension profile. Signed-in
Twitch checks remain pending. See [validation notes](docs/validation.md) for
verified scenarios and limits, and [CHANGELOG.md](CHANGELOG.md) for release history.

## Development

Full checks need the latest Node.js LTS, recent Chrome, and Windows PowerShell.
No `npm install` is needed. Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`;
set `CHROME_PATH` when Chrome is outside the standard locations.

```powershell
npm.cmd test
npm.cmd run package
```

| Focused command | Checks | Requires |
| --- | --- | --- |
| `npm.cmd run test:unit` | Settings, startup, lifecycle, request ordering, manifest, CSS, and docs links | Node |
| `npm.cmd run test:browser` | Offline features, real extension storage, and harness failures | Node + Chrome |
| `npm.cmd run test:package` | ZIP contents and failure recovery | Node + Windows PowerShell |
| `npm.cmd run test:soak` | Two-minute message/remount/pause stress workload | Node + Chrome |

Packaging verifies source assets and ZIP bytes before replacing
`dist/twitch-min-<version>.zip`; failure preserves the previous archive. It does not
publish a release. [CI](.github/workflows/ci.yml) runs tests and packaging on Windows
with the latest Node LTS and retains the ZIP as an artifact. Extract the artifact
wrapper to obtain the installable ZIP.

Browser checks use temporary profiles and locally fulfilled/blocked requests,
never your everyday profile. The harness uses `--no-sandbox` for this managed
Windows environment and loads trusted fixtures only. Private snapshots and
results stay in ignored `.browser-tests/`; ZIPs stay in ignored `dist/`.

Set `TWITCH_MIN_SOAK_CYCLES` to change the soak length. Regenerate PNG icons with
`python scripts/generate_icons.py` (standard library only).

For implementation and test ownership, see [architecture.md](docs/architecture.md).
Working rules are in [AGENTS.md](AGENTS.md); deferred work is in [ROADMAP.md](ROADMAP.md).
