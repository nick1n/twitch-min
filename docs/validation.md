# Validation notes

## Current verification and limitations

Latest successful full run: **November 14, 2026**, Node 26.3.0,
Chrome 157.0.8103.51. All **150 tests**, syntax checks, and packaging passed after
the badge extraction and harness hardening. The Windows sandbox account hit error
1909; final checks ran outside it.

The 125-second offline soak passed 60 pause/resume cycles, 12,000 message insertions,
and 12 region remounts. No tracked mutation/resize observers, document/window
listeners, or temporary markers remained after pause. Fixture theatre entry/exit
also passed. This verifies cleanup and bounded visible DOM, not every possible
heap leak or live Twitch performance.

Still unverified:

- Signed-in live/replay navigation, authenticated composer/drafts, and live
  fullscreen, pending at the user's direction.
- Headless fullscreen: Chrome denied permission.
- Hosted CI execution, artifact upload, and run cancellation.

See the [roadmap](../ROADMAP.md#validate-the-current-architecture-first) for live
scenarios and [development commands](../README.md#development) to reproduce checks.
Soak results are written to ignored `.browser-tests/soak-results.json`.

## What the checks establish

| Check | Coverage and boundary |
| --- | --- |
| Offline feature fixtures | Appearance, activation/restoration, late mounts, navigation, storage failures, tooltip ownership, and cross-pane transfers; remote requests stay local or blocked. |
| Unpacked-extension smoke | Real Chrome storage, isolated scripts, both Twitch origins, non-Twitch scope, popup changes, reload, and restart in a temporary profile; no live account. |
| Harness regressions | Locked/partial port files, bounded failure cleanup, out-of-order cancellations, retired document/frame requests, and genuine interception errors. |
| Popup checks | Light/dark layout, readable blurbs, keyboard/label activation, hidden scrollbars, scroll navigation without row highlighting, and stable enable-all layout. |
| Packaging | Required assets, root manifest, byte-for-byte ZIP contents, and preservation of the previous archive on failure. |

## Signed-out live smoke (November 13, 2026)

Checked a busy live channel (`https://www.twitch.tv/jynxzi`) in T3 preview,
Chrome 152.0.7977.169 / Electron 44.10.1. The profile was signed out with no installed
extension; production scripts/CSS were injected in manifest order with mocked
storage. This exercised live DOM compatibility, not installation or authenticated use.

Sidebar compaction/restoration, chat tinting, composer visibility, emote preview,
and native theatre mode were exercised. The signed-out editor did not accept focus.
Pausing removed extension markers, no extension warning was recorded, and the
injection and test tab were cleaned up.

Intermediate popup designs and older fixture runs are superseded by current
results. Release history is in [CHANGELOG.md](../CHANGELOG.md).
