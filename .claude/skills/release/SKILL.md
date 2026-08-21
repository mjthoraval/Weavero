---
name: release
description: Cut and publish a Weavero release. Use ONLY when the user explicitly approves a release ("start the release", "ok to release"). Runs the full gate battery, squashes the dev line, tags, publishes, and hand-edits the notes.
---

# Release pipeline

**Precondition: the user has explicitly approved THIS release.** Suggesting a
release is fine; running this skill without their word is not.

> `disable-model-invocation: true` was removed on 2026-08-21: in the VS Code
> extension it hid the skill from the COMMAND PALETTE as well as from the
> model, so `/release` returned "No matching commands" and the maintainer
> could not start a release at all. The gate is now the precondition above
> plus the standing rule that releases and pushes need an explicit instruction
> in the user's current message. Do not restore the flag without checking that
> `/release` still autocompletes.

## 1. Commit everything outstanding

`git status` in the repo root — land every WIP change as its own logical commit
first. A release must never bury uncommitted work (the 0.17.9-dev.78 build
vanished from history exactly this way). Anything not worth committing gets
reverted or explicitly reported, never left dangling.

## 2. Decide the version

Patch increment by default. Minor only if the user says it's substantive, or
it resets a feature flag / changes previous behaviour. Major is user-directed
only. The number may be higher than the dev line predicted — that's expected.

## 3. Gates (all must pass before touching versions)

- `npm test -- --exit-on-finish` → full suite green, no orphaned test Zotero.
- prefs.html well-formedness (XUL-fragment wrap parse; see its rules file).
- `manifest.json` / `package.json` / `package-lock.json` parse + versions match.
- Live suites (`test/live/*.js`) if filter/search machinery changed since they
  last ran green — reset `search.quicksearch-mode` to the user's default
  (`fields`) before AND after; a polluted pref produces phantom failures.
- **Guard audit**: `git log <last-tag>..HEAD --oneline --grep "^fix"` — every
  `fix:` commit names its regression guard or its written exemption (the
  /bugfix lock-it-in convention). A fix with neither goes back through
  /bugfix Step 6 before the release proceeds.
- **Perf gate**: if the release ships perf-relevant changes (filter/search
  machinery, per-row or per-annotation rendering, reader load paths), run
  the matching Level-5 bench (`bench/bench-weavero-ui.js` for items-list
  filter apply/clear; see bench/README.md for comparability rules) and
  compare against the reference results — regressions are measured, not
  felt.
- Remind the user of any manual protocols due (restart testing, popup
  contracts) — flagged, not silently skipped.

## 4. Squash and bump (the push-cadence convention)

Dev commits stay local. Mirror the released history shape:

```bash
git branch -f archive/vX.Y.Z-dev main          # preserve the dev line locally
COMMIT_A=$(git commit-tree 'HEAD^{tree}' -p <origin/main tip> -m "feat(...): <release summary>")
git reset --soft $COMMIT_A
# set the clean version in the three files, npm run build (sanity), then:
git commit -am "release: bump to vX.Y.Z" && git tag vX.Y.Z
```

One squashed conventional `feat`/`fix` commit + a separate `release:` bump —
that's what renders in auto release notes. If origin/main moved (dependabot),
merge it in BEFORE squashing. Branch merges in the dev line are fine: the
commit-tree squash takes the FINAL TREE, so merge commits collapse with the
rest — but the guard audit must range over fix: commits that arrived via
merges too (`git log <last-tag>..HEAD` includes them). `--force-with-lease`
is allowed; plain `--force` and `reset --hard` are not.

## 5. Publish

```bash
git push origin main && git push origin vX.Y.Z
gh workflow run release.yml -f tag=vX.Y.Z
```

Monitor the run to conclusion (typecheck + tests + build + publish). Then
verify: release exists with `weavero.xpi` attached, and the rolling
`release` tag's `update.json` serves the new version.

## 6. Hand-edit the release notes

Auto-notes put chores under "### undefined" — always rewrite: user-facing
"New" / "Fixed" / "Internal" sections in plain language. `gh release edit
vX.Y.Z --notes-file …`.

## 7. Aftermath

- Close/comment shipped issues only on the user's instruction.
- Local installs on `-dev.N` auto-update to the clean version — nothing to do.
- Update the tracking registers whose entries just shipped.
- Interim tags swallow commits from the next release's notes — don't create
  tags between releases.
