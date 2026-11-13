# Repository instructions

## Scope and working practices

- Keep the extension vanilla JavaScript/CSS and dependency-free, with no build
  required for local installation. Preserve its Twitch-only scope, local settings,
  and storage-only API permission.
- Preserve unrelated working-tree changes. Keep changes focused on the requested
  behavior; the deferred ideas in [ROADMAP.md](ROADMAP.md) are not rewrite plans.
- Keep generated ZIPs and private `.browser-tests` HTML snapshots out of commits
  and packaged releases. Use small sanitized fixtures for reproduced issues.

## Architecture and behavior

- See [docs/architecture.md](docs/architecture.md) for architecture details.
  Treat `extension/manifest.json` as the production script-order source of truth;
  do not maintain duplicate script lists in fixtures or tooling.
- Keep stable preference definitions in `extension/shared/settings.js`. Preserve saved
  keys and defaults unless the task intentionally changes them.
- Keep cosmetic CSS in the matching `extension/styles/rules-*.js` module and DOM behavior
  in `extension/controllers/`. Shared selectors belong in `extension/shared/selectors.js`;
  feature-specific selectors stay with their feature. Scope comma-separated
  descendant selectors with `:is(...)` and avoid broad button/chat selectors.
- Keep shared discovery in `extension/shared/regions.js` and lifecycle support in
  `extension/shared/runtime.js`. Register teardown before DOM changes or observer setup.
  Release observers, listeners, temporary attributes, styles, and controls on
  pause or disposal, including failed setup and detached regions.
- Keep mutation work scoped to affected regions and subtrees. Do not introduce
  document-wide scans on ordinary chat updates or timer-based retry loops.
- Preserve native handlers, accessible names, drafts, timestamp seek targets,
  and retained player controls. Turning a feature off must restore native behavior.
- Sidebar collapse behavior belongs in `extension/controllers/layout.js`, with compact row
  styles in `extension/styles/rules-sidebar.js`. Preserve native metadata, overlay height,
  and the obligation to restore an initially collapsed sidebar.

## Validation

- Run `npm.cmd test` after code changes on Windows (`npm test` where supported).
  The full suite requires Node as declared in `package.json`, an installed Chrome,
  and Windows PowerShell. See [README.md](README.md#development) for focused commands;
  set `CHROME_PATH` when Chrome is outside the standard locations.
- For intentional cosmetic changes, review and update
  `tests/rules-baseline.json` along with relevant behavior assertions. Do not
  update the baseline just to silence an unexplained CSS regression.
- For packaging changes, run `npm.cmd run package` as well. Packaging uses
  Windows PowerShell and verifies source assets and ZIP contents before replacing
  the release archive; it does not publish a release.
- For DOM behavior changes, cover activation, pause/restoration, later mounts,
  and navigation where relevant. Keep browser fixtures offline; block or fulfill
  remote requests locally.
- Distinguish fixture verification from signed-in Twitch verification. Report
  checks that could not run and any live variants still requiring validation.
  Documentation-only edits need a diff/link review, not the browser suite.

## Versions and documentation

- Keep explicit release numbers only in `package.json`,
  `extension/manifest.json`, and `CHANGELOG.md`. Keep package and manifest versions
  equal; derive archive names and tooling references from those files. Use version
  placeholders in other documentation. Do not bump versions unless requested.
- Put agent working instructions here, installation/features/development reference
  in `README.md`, implementation details in `docs/architecture.md`, ZIP-user instructions in `extension/INSTALL.txt`, release history
  in `CHANGELOG.md`, and future work in `ROADMAP.md`.
- Link to existing explanations instead of duplicating them. Keep enforceable
  checks in tests and scripts rather than relying solely on these instructions.
