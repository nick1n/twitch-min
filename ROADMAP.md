# Roadmap

The current architecture is the baseline to stabilize. The larger changes below
are deferred options, not scheduled rewrites. Prioritize a reproduced live issue
or measured bottleneck before introducing another abstraction.

## Validate the current architecture first

- Exercise signed-in live and replay navigation, theatre/fullscreen, busy chat,
  and repeated pause/resume. Include both initially expanded and collapsed sidebars.
- Profile observer callbacks, layout reads, and retained DOM nodes over a longer
  session. Compare the same workload with the extension enabled and paused;
  record the browser version, page type, and steps so results are reproducible.
- Convert failures into small sanitized fixtures. Keep private HTML snapshots
  out of version control and packaged releases.

## Deferred: explicit sidebar state machine

**Trigger:** additional reproducible races involving native expansion, collapse,
restoration, or remounts make the current pending-click handling hard to maintain.

**Approach:** make the sidebar's states and transitions explicit, distinguishing
native state from the extension's desired state and restoration obligation.
Possible states include observing, awaiting expansion, compact, awaiting
restoration, and disposed. Drive transitions from observed native DOM changes
and preference changes; do not assume a click commits synchronously. Preserve
the original restoration intent through rapid toggles and handle remounts as a
new sidebar instance.

**Acceptance checks:**

- At most one native click is outstanding for a given sidebar action.
- Pausing restores an initially collapsed sidebar after a pending expansion.
- Resuming during restoration converges on the current preference without
  duplicate clicks or lost restoration state.
- Replacing/removing the sidebar releases its observers and references.
- The existing sidebar appearance, saved settings, and native handlers remain
  unchanged; transition tests cover delayed commits and rapid toggles.

## Deferred: Twitch DOM compatibility layer

**Trigger:** multiple supported Twitch layouts require the same fallback logic
in several features, beyond the shared selectors already in place.

**Approach:** introduce small semantic helpers for the repeated operations, such
as finding a chat author, locating player parts, or reading sidebar state. Keep
variant detection inside those helpers, backed by representative fixtures.
Keep CSS-only selectors with their feature rules and avoid copying Twitch state
into a separate application model. Add helpers incrementally where duplication
is demonstrated rather than migrating every DOM query at once.

**Acceptance checks:**

- Each supported variant has a sanitized fixture exercising the same feature
  behavior and restoration contract.
- Features do not duplicate the extracted layout-detection logic.
- Unknown or incomplete markup leaves native controls usable.
- Helpers use scoped lookups and do not introduce document-wide searches on
  ordinary chat updates.
- Generated CSS and existing saved-preference behavior remain compatible unless
  a separately documented behavior change is intentional.

## Completed small follow-ups

- Settings attributes, sidebar/navigation markers, and volume-indicator text
  now skip unchanged writes, preserving initial application and cleanup.
- Replay timestamp candidates and leaves are deduplicated within each mutation
  batch. Unchanged shortened labels are not rewritten; removal-only and
  wrapper-replacement regressions remain covered.
- The Chrome test harness captures uncaught page exceptions before navigation,
  including startup errors, timer errors, and unhandled promise rejections.
  Handled storage failures and console warnings do not count as uncaught errors.

Regression tests verify these changes. Live performance gains have not been
benchmarked.
