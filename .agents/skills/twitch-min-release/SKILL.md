---
name: twitch-min-release
description: Prepare local twitch-min releases when asked to bump the version or prepare a release, including concise changelog entries, tests, and a validated ZIP.
---

# twitch-min release

## Determine the target

- From the repository root, confirm `package.json` identifies twitch-min. Read
  [AGENTS.md](../../../AGENTS.md), the [development guide](../../../README.md#development),
  both version files, [CHANGELOG.md](../../../CHANGELOG.md), and the working-tree diff.
- Identify changes since the previous release using tags or version-change history,
  including relevant working-tree and untracked files. A clean tree can still
  contain unreleased commits.
- Use the requested major, minor, patch, or exact version. If the request and session
  do not specify one, ask while reviewing changes; do not guess.
- Compare working-tree and committed versions. Finish a release already in progress
  rather than bumping twice, unless requested. Resolve mismatches from the intended
  target and existing diff; ask only if the target remains ambiguous.

## Update and validate

1. Set `package.json` and `extension/manifest.json` to the same target version.
   Follow the repository's rules for other version references.
2. Add or finish that version's top changelog entry, using the existing heading
   style. Summarize implemented changes in short bullets; omit proposals and
   test-run narration. Preserve older entries and avoid duplicates.
3. Follow the development guide to install dependencies and run the full test
   script, then the package script. Use the existing asset/ZIP validation and
   derive the archive path from the package output or target version.
4. Confirm both versions and the newest changelog entry agree. Review the diff
   for unrelated changes and run `git diff --check` on edited release files.

Fix failed checks within the authorized release scope and rerun affected checks.
If the environment blocks validation, report the blocker and leave readiness
unconfirmed.

## Hand off

Report the target version, brief changelog summary, test/package results, and a
link to the validated ZIP. Distinguish fixture checks from signed-in Twitch checks
as required by AGENTS.md.

Editing this skill does not request a release. Release preparation does not
authorize committing, pushing, tagging, or publishing; do those only when requested.
Consult `.github/workflows/ci.yml` before describing its automatic tagging behavior.
