# Repository instructions

## Scope

- Keep the installed extension vanilla JavaScript/CSS, with no runtime dependencies
  or build. Use pnpm and the committed lockfile for development dependencies.
  Preserve Twitch-only scope, local settings, and storage-only API permission.
- Preserve unrelated working-tree changes. Keep work focused on the request;
  [ROADMAP.md](ROADMAP.md) contains deferred ideas, not rewrite plans.
- Keep generated ZIPs and private `.browser-tests` snapshots out of commits and
  release contents. Use small sanitized fixtures for reproduced issues.

## Implementation

See [architecture](docs/architecture.md) for ownership and lifecycle details.

- Derive production script lists from `extension/manifest.json`; do not duplicate
  them in tooling or fixtures.
- Keep preference definitions in `extension/shared/settings.js`. Preserve saved
  keys and defaults unless intentionally changing them.
- Put cosmetic CSS in the matching `extension/styles/rules-*.js` module and DOM
  behavior in `extension/controllers/`. Shared selectors belong in
  `extension/shared/selectors.js`; feature-specific selectors stay with the feature.
  Scope comma-separated descendant selectors with `:is(...)`; avoid broad
  button/chat selectors.
- Use `extension/shared/regions.js` for discovery and `extension/shared/runtime.js` for
  lifecycle support. Register teardown before DOM changes or observer setup.
  Release observers, listeners, temporary attributes, styles, and controls on
  pause/disposal, including failed setup and detached regions.
- Scope mutation work to affected regions and subtrees. No document-wide scans
  on ordinary chat updates or timer-based retry loops.
- Preserve native handlers, accessible names, drafts, timestamp seek targets,
  and retained player controls. Turning a feature off must restore native behavior.
- Keep sidebar collapse behavior in `extension/controllers/layout.js` and compact
  rows in `extension/styles/rules-sidebar.js`. Preserve native metadata, overlay
  height, and restoration of an initially collapsed sidebar.

## Validation

- Follow [development setup](README.md#development) and run `pnpm test` after code
  changes. Run `pnpm run package` for packaging changes. Use `pnpm.cmd` on Windows
  when needed; focused commands and browser requirements are in the README.
- For intentional cosmetic changes, review `tests/rules-baseline.json` and update
  it with relevant behavior assertions. Never update it to silence an unexplained
  CSS regression.
- For DOM behavior changes, cover activation, pause/restoration, later mounts,
  and navigation where relevant. Keep browser fixtures offline; fulfill remote
  requests locally or block them.
- Report checks that could not run and live variants still needing validation.
  Distinguish fixture results from signed-in Twitch verification.
- Documentation-only edits need a diff/link review, not the browser suite.

## Versions and documentation

- Keep explicit release numbers only in `package.json`, `extension/manifest.json`,
  and `CHANGELOG.md`. Package and manifest versions must match. Derive archive
  names and tooling references from them; use placeholders in other docs.
  Do not bump versions unless requested.
- Keep each topic in one place and link to it: usage and development in
  `README.md`, internals in `docs/architecture.md`, results and gaps in
  `docs/validation.md`, standalone ZIP instructions in `extension/INSTALL.txt`,
  history in `CHANGELOG.md`, future work in `ROADMAP.md`, and agent rules here.
- Put enforceable checks in tests and scripts rather than relying only on docs.
