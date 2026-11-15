# Validation notes

## November 14, 2026 — popup scroll cue

- All 133 tests and packaging passed. The popup has no visible scrollbar and
  shows More settings only when options remain below the current scroll position.
- Native wheel scrolling, keyboard focus to the last setting, returning upward,
  and resizing between overflowing and fully visible lists passed. Cue changes
  preserve the popup's height; the installed-extension dark layout fits at
  360 by 585 pixels.
- An initial sandbox run encountered the existing emote-interception timing race;
  subsequent commands also hit Windows account-lock error 1909. The focused popup
  checks and final full suite passed outside the locked sandbox account.

## November 14, 2026 — compact branded popup

- All 132 tests passed. Packaging, popup syntax, and whitespace checks passed.
- The popup restores the logo and short visible descriptions in a scrollable
  settings list. Its header holds one master pause/resume control and a secondary
  Enable all settings action, disabled when everything is already active.
- Light/dark layout, enlarged text, keyboard activation, label clicks, and
  accessible names/descriptions passed. Installed-extension screenshot review
  confirmed the dark popup fits at 360 by 565 pixels.
- Real Chrome storage checks verified that master pause/resume preserves choices
  across tabs and browser restart, while enable-all selects every setting.
- New harness regressions accept a confirmed cancelled image response but still
  reject an invalid interception ID without a matching cancellation. Sidebar
  scrollbar checks now wait for native list expansion to finish before asserting.

## November 14, 2026 — minimal popup

- All 129 tests passed after replacing the popup's custom switches and decorated
  cards with native checkboxes and plain buttons. Packaging and syntax checks passed.
- Offline Chrome layout checks and a local screenshot review confirmed that all
  settings and actions fit at 280 by 375 pixels. Light/dark modes and enlarged
  text retained the controls without horizontal overflow.
- Native Tab/Space activation, whole-label clicks, focus retention after saves,
  and screen-reader names/descriptions passed. Help remains available through
  hover titles and accessible descriptions without persistent explanatory copy.
- The installed-extension check also passed with the renamed bulk-action controls,
  real storage, multiple tabs, page reload, and browser restart.

## November 14, 2026 — preferences and installed-extension follow-up

Validation passed on Node 26.3.0 with Chrome 157.0.8103.51:

- All 129 tests passed, including independent enhancement switches, restoration,
  later mounts, and pause/resume. JavaScript and CommonJS syntax checks passed.
- The unpacked-extension smoke check used real Chrome storage and isolated content
  scripts in a temporary profile. Popup changes reached both supported Twitch
  origins, opted-out settings survived page reload and browser restart, and the
  non-Twitch fixture stayed unchanged. All page responses were served locally.
- Packaging verified the current extension assets and ZIP contents successfully.
- The 124-second soak passed 60 cycles, 12,000 message insertions, and 12 remounts.
  Final tracked mutation observers, resize observers, document/window listeners,
  and temporary markers were all zero. Fixture theatre entry/exit also passed.
- Headless fullscreen permission remained unavailable. Signed-in live Twitch
  checks remain pending at the user's direction. Hosted CI execution, including
  the new artifact upload, has not been exercised in this session.

The popup actions now say **Pause all** and **Enable all**. Pausing keeps
individual choices while enabling all replaces them with enabled defaults.
Existing defaults remain on for the new switches.

## November 14, 2026

Release validation passed on Node 26.3.0 with Chrome 157.0.8103.51:

- All 119 tests passed, including offline browser fixtures and packaging failures.
- Release packaging verified the source assets and ZIP contents successfully.
- The full soak command passed in 124 seconds: 60 pause/resume cycles, 12,000
  message insertions, and 12 region remounts. No tracked observers, document/window
  listeners, or temporary markers remained after pause. Fixture theatre entry/exit
  also passed.
- Headless Chrome denied fullscreen permission; the soak command reported that
  check as unavailable. Signed-in live validation and hosted CI execution remain
  pending.

The Windows process-launch issue recorded below did not block this run.

## November 13, 2026

The CI workflow runs the full suite and packaging in one Windows job using the
latest Node.js LTS selected directly with `lts/*`. Workflow/ref concurrency cancels
superseded runs. The configuration was reviewed against the official Node
support schedule and GitHub workflow documentation. Hosted execution and actual
cancellation behavior have not been verified in this session.

### Signed-out Twitch smoke check

The available preview profile was signed out and had no installed extension.
Production scripts and CSS were injected temporarily, in manifest order, with
the browser fixtures' storage mock. These checks exercise current Twitch DOM,
not extension installation, saved Chrome settings, or authenticated behavior.

- Page: `https://www.twitch.tv/jynxzi`, a busy live channel.
- Browser: Chrome 152.0.7977.169 / Electron 44.10.1 in T3 preview.
- Sidebar compaction, collapsed-sidebar restoration, chat tinting, composer
  visibility toggling, emote preview opening/dismissal, and native theatre-mode
  entry/exit were exercised. The signed-out composer did not accept editor focus.
- Pausing removed tint, composer-toggle, badge-hide, and tooltip-detail markers.
  No extension warning was recorded during the smoke check.
- The injected changes were paused and the test tab was closed afterward.

Signed-in validation remains pending at the user's direction. Authenticated
composer/draft behavior, live replay navigation, and live fullscreen checks are
not verified by this smoke check.

### Offline stress workload

An isolated Chrome run on Node 26.3.0 completed 60 cycles with a two-second pause
per cycle: 12,000 live/replay message insertions, bounded retained lists, 12 region
remounts, simulated same-document navigation, and repeated pause/resume.
Instrumentation found no active mutation observers, resize observers, tracked
document/window listeners, or temporary markers after each pause and at the end
of the chat workload. Fixture theatre entry/exit also passed.

Headless Chrome rejected the fullscreen request with `TypeError: not granted`.
The command now catches this permission denial and reports it as unavailable;
the final version could not be rerun because Windows stopped launching test
processes with `CreateProcessWithLogonW failed: 1909` (account lockout).
The same launch failure prevented a final full-suite/package rerun. The complete
headless browser version was not retained from the interrupted result report.

This workload validates repeated cleanup and bounded visible DOM. It does not
establish absence of all heap leaks or benchmark live Twitch performance.
Run `npm.cmd run test:soak` to reproduce it after the runner becomes available;
the command records the browser version and results in ignored
`.browser-tests/soak-results.json`. See [development commands](../README.md#development)
for requirements and [the roadmap](../ROADMAP.md#validate-the-current-architecture-first)
for the remaining live validation scenarios.
