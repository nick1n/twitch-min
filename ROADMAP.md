# Roadmap

Stabilize current behavior before refactoring. Start with the remaining live
checks and profiling in [validation notes](docs/validation.md#live-checks-and-remaining-gaps).
The refactors below need a reproduced issue or measured bottleneck.

## Planned: Firefox support

Support Firefox alongside Chrome using the shared JavaScript/CSS codebase.
Add manifest metadata, check storage API compatibility, and verify appearance
and behavior. Include Firefox packaging, installation instructions, browser tests,
and signed-in Twitch validation before release. Keep Twitch-only scope, local
settings, and storage-only API permission.

## Deferred: explicit sidebar state machine

**Trigger:** reproduced expansion/restoration races make pending-click handling
hard to maintain.

Model native state, desired state, pending actions, and restoration obligations.
Drive transitions from DOM and preference events. Allow one native action at a
time, restore an initially collapsed sidebar, and converge after rapid toggles
without duplicate clicks. Removal must release observers and references.

Keep appearance and saved settings stable. Cover delayed actions and remounts.

## Deferred: Twitch DOM compatibility layer

**Trigger:** supported layouts repeat fallback logic across features.

Extract small semantic lookups where duplication exists, backed by fixtures for
supported variants. Keep feature CSS with its rules and native controls usable
on unknown markup. Use scoped lookups rather than document-wide chat scans;
avoid duplicating Twitch state in a separate application model.

Preserve CSS and saved preferences unless deliberately changing them.
