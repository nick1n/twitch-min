# Validation

Commands: [README](../README.md#development).
Implementation: [architecture](architecture.md).

## Latest recorded results

**November 16, 2026:** all **184 tests** passed with Node 26.3.0 and Puppeteer's
Chrome for Testing. The full run took about ten seconds. ZIP validation passed.

Browser results come from offline fixtures, not signed-in Twitch or a
store-delivered extension update. Checks ran outside the Windows sandbox because
its execution account was locked.

## Automated coverage

| Check | What it verifies |
| --- | --- |
| Feature fixtures | Appearance, activation and restoration, later mounts, navigation, native controls, tooltips, and cleanup. |
| Installed extension | Real storage and isolated scripts, both Twitch origins, non-Twitch scope, settings changes, page refresh, and browser restart. |
| Update recovery | Reloading the extension keeps the document, draft, native handlers, and saved pause state. Missing listeners and removed stylesheets recover without a page refresh. |
| Recovery failures | Concurrent requests, document targeting, sender and site validation, timeouts, failed cleanup, and older instances that need a refresh. |
| Popup | Light and dark themes, keyboard access, settings scrolling, save errors, stale responses, error details, and manual copying. |
| Browser harness | Startup and shutdown, profile cleanup, page exceptions, request cancellation, and navigation during intercepted requests. |
| Image tooling | PNG dimensions and colors; GIF frames, timing, and looping. |
| Packaging | One missing asset per source category, every archived file compared with its source, rejected remote assets, and preservation of the previous ZIP on failure. |

Browser checks use temporary profiles. Installed-extension checks open the popup
as a page, so they don't cover closing the browser's toolbar popup mid-operation.

## Earlier checks

An offline soak ran for 125 seconds: 60 pause/resume cycles, 12,000 message
insertions, 12 region remounts, and theatre entry/exit. Pause left no tracked
observers, document/window listeners, or temporary markers. This checks cleanup
and bounded DOM growth, not all memory leaks or live performance.

**November 13, 2026:** a signed-out live channel passed sidebar restoration, chat
tinting, message-box visibility, emote preview, and theatre checks. This used
Chrome 152.0.7977.169 / Electron 44.10.1 with injected scripts and mocked storage,
not an installed extension. The signed-out message box couldn't receive focus.

## Live checks and remaining gaps

- Signed-in live and replay pages: navigation, drafts, busy chat, repeated
  pause/resume, and initially expanded or collapsed sidebars.
- Updates delivered by an extension store and site-access restrictions.
- Opera GX and the minimum supported Chrome version.
- Fullscreen; headless Chrome denied fullscreen permission.
- Longer profiling of observers, layout work, and retained DOM.
- Hosted CI, artifact upload, and run cancellation.

Turn reproduced failures into small sanitized fixtures. Future work is tracked in
the [roadmap](../ROADMAP.md).
