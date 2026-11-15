---
name: twitch-min-release
description: Prepare local twitch-min releases when asked to bump the version or prepare a release, including concise changelog entries, tests, and a validated ZIP.
---

# twitch-min release

Prepare a local release using the repository's existing checks. Creating or
editing this skill does not itself request a release.

## Establish the release

- Work from the twitch-min repository root; verify `package.json` identifies it.
  Read [repository instructions](../../../AGENTS.md), the
  [development guide](../../../README.md#development), both version files,
  [CHANGELOG.md](../../../CHANGELOG.md), and the working-tree status/diff.
- Identify changes since the previous release using version tags or version-change
  history, plus relevant working-tree changes. A clean working tree can still
  contain unreleased commits.
- Use the requested major, minor, patch, or exact version. If that choice is
  missing from the request and session instructions, ask for it while reviewing
  the changes; do not guess a bump.
- Compare working-tree versions with their committed versions to recognize a
  release already in progress. Complete a partial or completed bump for this
  release rather than incrementing twice, unless another bump is explicitly
  requested. Resolve inconsistent files from the requested target and existing
  diff; ask only if the intended target remains ambiguous.

## Update versions and release notes

- Set `package.json` and `extension/manifest.json` to the same target version.
  Follow the repository's rules for version references elsewhere.
- Add or finish the target version's entry at the top of `CHANGELOG.md`, matching
  its existing heading style. Do not create duplicate entries for the same release.
- Summarize implemented changes within the requested release scope, including
  relevant untracked files. Use short, direct bullets with one change per bullet.
  Omit unimplemented proposals and test-run narration; preserve older entries.
- Preserve unrelated edits. Review the release diff for unintended changes.

## Validate and package

1. Confirm the package version, manifest version, and newest changelog entry agree.
2. Run the repository's full test script, then its package script. Current Windows
   commands are `npm.cmd test` and `npm.cmd run package`; use the current
   `package.json` and development guide as the authority if commands change.
3. Use the existing scripts to enforce asset and ZIP checks. Derive the archive
   path from the target version or package output, rather than hardcoding it.
4. Run `git diff --check` for the edited release files and review their diff.

If a check fails, diagnose it and fix issues within the authorized release scope
before rerunning the affected checks. If an environment requirement blocks a
check, report it and leave validation incomplete; do not claim release readiness.

## Report and hand off

Report the target version, a brief changelog summary, test/package results, and a
link to the validated ZIP when packaging succeeds. Distinguish fixture checks
from signed-in Twitch verification as required by the repository instructions.

Local release preparation does not authorize committing, pushing, creating tags,
or publishing. Perform those actions only when explicitly requested. The current
CI workflow creates missing version tags after a successful default-branch push;
consult `.github/workflows/ci.yml` before describing or changing that behavior.
