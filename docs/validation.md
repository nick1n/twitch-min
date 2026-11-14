# Validation notes

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
