# Roadmap

Stabilize the current architecture. The options below are deferred, not rewrite
plans; use a reproduced issue or measured bottleneck to justify them.

## Future v1 feature: Firefox support

Support Firefox alongside Chrome using the shared vanilla JavaScript/CSS
codebase. Add Firefox manifest metadata, verify storage API compatibility, and
review feature behavior and appearance in Firefox. Include Firefox packaging,
installation instructions, and browser test coverage, with signed-in Twitch
validation before release. Preserve Twitch-only scope, local settings, and the
storage-only API permission.

## Validate the current architecture first

- Check signed-in live/replay navigation, busy chat, theatre/fullscreen, repeated
  pause/resume, and initially expanded/collapsed sidebars.
- Profile observer work, layout reads, and retained DOM over a longer enabled vs
  paused session. Record browser, page type, workload, and steps.
- Turn failures into small sanitized fixtures; keep private snapshots out of Git
  and release ZIPs. See [current validation](docs/validation.md).

## Deferred: explicit sidebar state machine

**Trigger:** reproduced expansion/restoration races make pending-click handling
hard to maintain.

Model native state, desired state, pending actions, and restoration obligations
explicitly. Drive transitions from DOM/preference events, not assumed synchronous
clicks. Preserve restoration intent through rapid toggles and remounts.

Required outcomes: one outstanding native action at a time; an initially collapsed
sidebar is restored after pause; rapid resume converges without duplicate clicks;
removal releases observers/references. Keep appearance and saved settings stable,
with delayed-action and remount regressions.

## Deferred: Twitch DOM compatibility layer

**Trigger:** supported layouts repeat the same fallback logic across features.

Extract small semantic lookups only where duplication exists. Keep variant
handling in fixture-backed helpers and feature CSS with its rules; avoid copying
Twitch state into a separate application model.

Required outcomes: native controls stay usable on unknown markup; helpers use
scoped lookups without document-wide chat scans; supported variants have fixtures;
CSS and saved preferences remain compatible unless deliberately changed.
