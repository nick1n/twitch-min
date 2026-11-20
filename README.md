# ![twitch-min logo](extension/icons/icon32.png) twitch-min

A browser extension that hides Twitch promos, shrinks the sidebar, and simplifies chat to keep the video and chat the main focus.

![Top navigation, sidebar, and chat before and after twitch-min.](docs/images/before-after.gif)

Screenshots: [Before](docs/images/before.png) & [After](docs/images/after.png)

## Install locally

[Download the latest release ZIP](https://github.com/nick1n/twitch-min/releases/latest/download/twitch-min.zip)
and follow these steps, also included in [INSTALL.txt](extension/INSTALL.txt):

1. Extract the ZIP and keep the extracted folder in place.
2. Open `chrome://extensions` (Chrome) or `opera://extensions` (Opera GX).
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted
   folder containing `manifest.json`.
4. Pin **twitch-min** in the Extensions menu, then open Twitch. Click the
   extension icon to change your settings.

If installing from a repository checkout, select its **extension** folder instead.

Keep the loaded folder in place. To update, replace its files and click **Reload**
for twitch-min on your browser's extensions page. **Remove** uninstalls it and
deletes saved settings.

## Settings

Changes apply immediately. Turn **Enabled** off to pause without losing your
choices. **Enable all settings** turns every option on. Use **More settings** or
**Back to top** to scroll the list.

All options start on except **Hide top navigation bar** and
**About & channel panels**.

| Setting | What it does |
| --- | --- |
| Top navigation extras   | Hide promotional buttons at the top of Twitch. Keep search, notifications, whispers, and your account menu. |
| Hide top navigation bar | Hide the whole bar at the top of Twitch, including search, notifications, and your account menu. |
| Sidebar sections        | Hide For You and Play on Luna, and shorten the remaining section headings. |
| Compact sidebar         | Make the sidebar narrower while keeping channel icons, viewer counts, and game names. |
| Channel action extras   | Hide Share, the three-dot menu, the channel bell, Bits, and Gift a Sub. Keep Follow and subscription icons. |
| About & channel panels  | Hide the About section, channel card, and channel panels below the video. |
| Mouse wheel volume      | Use the scroll wheel over the video to change the volume. |
| Mouse side button seeking | Over the video, Back skips back 30 seconds and Forward skips ahead 1 minute. |
| Following Stories       | Hide Stories at the top of the Following page. |
| Browse Recent Recaps    | Hide the Recent Recaps section on the Browse page. |
| Chat leaderboard        | Hide the gift rankings, cheer rankings, and goals shown above chat. |
| Shorter chat times      | Show chat times in hours and minutes: `1:32:56` becomes `1:32`, and `5:26` becomes `0:05`. |
| Chat username tint      | Give messages a background tint that matches the username color. Leave highlighted messages unchanged. |
| Group consecutive chats | Show the username and first badge once for groups of messages from the same chatter. |
| Enlarged emote previews | Hover over an emote to see a preview at three times its normal size. |
| Chat message box        | Click **Chat** to show or hide the message box. Press Enter in the message box to send. |

The sidebar's **Collapse/Expand** button still works.

While enabled, twitch-min also:

- Shows one chat badge per sender. Hover over it to see the other badge names.
- Hides chat headers, replay message menus, and chat scrollbars.
- Hides Clip, the extra playback-speed label, and Follow, Gift, and Subscribe overlays.
- Softens the search border and keeps reward cards in three columns.
- Expands **Show more** in Following's Recommended channels and Latest videos.

Playback controls, chat scrolling, and Twitch's button actions remain available.
Turn a setting off to restore that feature, or pause to restore everything.

## Hide and report an element

1. On Twitch, open the extension popup and click **Hide and report**.
2. Hover to see the selection, then click to hide it. Use **Hide larger section**
   if you clicked a heading or thumbnail and want to hide its container.
3. Review the HTML, then click **Open GitHub issue**. Describe what should be
   hidden and submit the prefilled issue on GitHub.

Use **Undo** to restore the section. The hide also clears when you reload, switch
to another Twitch page, or pause the extension.

## Troubleshooting

If a setting doesn't seem to work:

1. Check that **Enabled** and the setting you want are turned on.
2. In your browser's extension settings, make sure twitch-min is allowed to run
   on Twitch.
3. Refresh the Twitch tab and try again. This can also help after an update.

If the popup shows an error, use **Copy error details** and **Report the issue**.
Include what happened and the steps to reproduce it. If copying fails, select
and copy the displayed text manually.

## Privacy and limits

Runs only on Twitch and saves your settings in your browser. It doesn't collect
analytics. **Open GitHub issue** passes the reviewed markup to GitHub in the
draft URL. The markup includes structural attributes and omits page text, links,
and form values. Larger emote previews load from Twitch's image servers. Hiding
a Twitch feature doesn't stop it from loading or running.

Twitch layouts vary by account and language, so some controls may be missed.
Third-party emotes aren't specifically supported. Error reports are shared only
when you choose to copy and submit them.

See [validation notes](docs/validation.md) for tested scenarios and remaining gaps.

## Development

Install Git and a Node.js version that meets `engines.node` in
[package.json](package.json). Install pnpm, then run these commands from the
repository root:

```sh
npm install --global pnpm
pnpm install --frozen-lockfile
pnpm test
```

On Windows, use `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

Puppeteer downloads Chrome for Testing during installation; the unused standalone
Headless Shell download is disabled. Set `CHROME_PATH` to
use another Chrome executable. Browser checks use temporary profiles and offline
fixtures, never your everyday profile. The harness runs Chrome with `--no-sandbox`
and loads trusted fixtures only.

| Command | Purpose |
| --- | --- |
| `pnpm test` | All unit, browser, and packaging checks. |
| `pnpm run test:unit` | Settings, recovery, lifecycle, and tooling checks. |
| `pnpm run test:browser` | Feature fixtures, installed-extension checks, and browser harness tests. |
| `pnpm run test:package` | ZIP contents and failure recovery. |
| `pnpm run test:soak` | Two-minute message, remount, and pause/resume workload. Set `TWITCH_MIN_SOAK_CYCLES` to change its length. |

Development dependencies are locked in [pnpm-lock.yaml](pnpm-lock.yaml) and excluded
from the installed extension. See [tooling details](docs/architecture.md#development-tooling)
for Puppeteer, Sharp, fflate, and their installation scripts.

### Packaging and CI

Run `pnpm run package` to create `dist/twitch-min-<version>.zip`. It packages
only the contents of `extension/` (including its MIT license), validates assets
and ZIP contents, and preserves the previous archive on failure. The version comes from the matching package and
manifest versions.

[CI](.github/workflows/ci.yml) runs tests and packaging on Linux with the latest
Node LTS and a frozen lockfile. Download and extract its artifact wrapper to get
the installable ZIP. Successful default-branch pushes also create a missing
`v<version>` tag at the tested commit; existing tags are never moved. CI
then publishes a GitHub Release with the validated archive named `twitch-min.zip`.
The release description uses the matching newest entry in [CHANGELOG.md](CHANGELOG.md).
Publication only proceeds when the version tag points to the tested commit;
existing releases and tags are never overwritten.

### Images

After installing development dependencies:

- `node scripts/generate-icons.cjs` regenerates PNG icons from
  `extension/icons/logo.svg`
- `node scripts/capture-previews.cjs` uses Chrome and offline fixtures to regenerate
  the README GIF and PNGs in `docs/images/`

## Reference

- [Architecture](docs/architecture.md): implementation and tooling.
- [Validation](docs/validation.md): recorded results and unverified scenarios.
- [Contributing rules](AGENTS.md): repository working instructions.
- [Roadmap](ROADMAP.md): future work and triggers for deferred refactors.
- [Changelog](CHANGELOG.md): release history.
- [MIT license](LICENSE)

![twitch-min logo](extension/icons/icon128.png)
