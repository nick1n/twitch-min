# Validation

Recorded results below are from earlier checks. Reproduction commands are in the
[README](../README.md#development).

## Latest recorded results

**November 16, 2026:** all **197 tests** and packaging passed using Node 26.3.0 and Puppeteer
Chrome for Testing. Sidebar fixtures cover stalled pagination, independent title
and control hiding, native expansion, restoration, later mounts, and navigation.
The installed-extension check also pauses/resumes existing tabs through the real
popup while pagination is stalled. Conditional troubleshooting and its copy/report
actions fit in both themes, including the manual-copy fallback.

Toggle diagnostics cover versioned tags, queued/unchanged settings, storage and
controller failures, missing/outdated page responses, and stale acknowledgements.
Installed-extension checks confirm the active-tab status exchange works with the
unchanged storage-only permissions. Missing receivers and diagnostic failures are
also simulated in offline popup fixtures. Tests cover missing acknowledgements,
clipboard rejection, successful retry cleanup, omission of unrelated response data,
and keeping troubleshooting hidden for confirmed toggles. Packaging accepts only
the configured issue destination as navigation and still rejects remote assets.
Signed-in site-access/failure variants remain unverified.

The final run used execution outside the Windows sandbox after its account became
locked. A temporary image-fixture cleanup failure on an earlier run passed on rerun.

The supplied sidebar HTML was checked offline with remote requests blocked:
For You, Show More, and both Show Less links hide while pagination is pending,
restore on pause, and hide again on resume. This is snapshot compatibility,
not signed-in Twitch verification.

The preceding tooling-migration run also passed packaging with Chrome for Testing
157.0.8103.50 and required execution outside the Windows sandbox.

An earlier 125-second offline soak passed 60 pause/resume cycles, 12,000 message
insertions, 12 region remounts, and theatre entry/exit. Pause left no tracked
mutation/resize observers, document/window listeners, or temporary markers.
This checks cleanup and bounded visible DOM, not all heap leaks or live performance.
Soak output stays in ignored `.browser-tests/soak-results.json`.

## Automated coverage

| Check | What it verifies |
| --- | --- |
| Feature fixtures | Appearance, activation/restoration, late mounts, navigation, storage failures, tooltips, and cross-pane ownership. |
| Installed-extension smoke | Real storage and isolated scripts, both Twitch origins, non-Twitch scope, popup changes, reload, and restart. |
| Harness regressions | Launcher and assertion cleanup, page exceptions/rejections, request cancellation, retired documents/frames, and interception errors. |
| Popup | Light/dark layout, readable help, keyboard/label activation, scroll navigation, and stable enable-all layout. |
| Image tooling | PNG dimensions and theme colors; GIF frames, timing, and looping. |
| Packaging | Required assets, root manifest, exact ZIP contents, and preservation of the previous archive on failure. |

Browser checks use offline fixtures in temporary profiles. Installed-extension
checks open the popup page; they do not test the browser-action popup's lifetime
or authenticated Twitch layouts.

## Live checks and remaining gaps

**November 13, 2026:** a signed-out busy live channel passed sidebar
compaction/restoration, chat tinting, composer visibility, emote preview, and native
theatre checks. This used T3 preview with Chrome 152.0.7977.169 / Electron 44.10.1,
injected production scripts in manifest order, and mocked storage. It was a DOM
compatibility check, not an installed-extension test. The editor could not receive
focus while signed out. Pause removed extension markers without extension warnings.

Still pending:

- Signed-in live/replay navigation, authenticated composer/drafts, busy chat,
  repeated pause/resume, and initially expanded/collapsed sidebars.
- Live fullscreen; headless Chrome denied fullscreen permission.
- Longer enabled-versus-paused profiling of observers, layout reads, and retained
  DOM. Record browser, page type, workload, and steps.
- Hosted CI execution, artifact upload, and run cancellation.

Turn reproduced failures into small sanitized fixtures. Keep private snapshots
out of Git and releases. [ROADMAP.md](../ROADMAP.md) tracks future work.
