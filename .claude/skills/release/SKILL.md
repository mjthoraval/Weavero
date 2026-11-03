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
git push origin main      # test.yml: Ubuntu, Windows, macOS x Zotero stable, beta
gh run watch <that test.yml run id> --exit-status    # in the BACKGROUND
git push origin vX.Y.Z    # starts no workflow
gh workflow run release.yml -f tag=vX.Y.Z   # checks test.yml green on the tag's commit, builds, publishes
```

Main goes up FIRST and the tag only once test.yml is green: test.yml is
the first CI run of every spec recorded or timed on the maintainer's
machine since the last push. A red test.yml is fixed by a `test:` commit
after the bump, the tag set on it -- never by a new version (v0.22.2 and
v0.22.0 re-pointed a pushed tag with `--force-with-lease`; v1.0.0-beta.1
kept the tag local until green, four Test runs, 2026-11-03). A job that
failed before any test ran (a rate-limited download, "error code: 1015")
is rerun alone: `gh run rerun <id> --failed`. release.yml runs no suite
since 2026-11-03: it refuses unless test.yml passed on that commit (any
attempt). Every wait on CI runs in the background, with a short status to
the maintainer at each step -- never chained 10-minute foreground waits
(1.0.0-beta.1: "You should be replying to me faster").

Monitor the run to conclusion (typecheck + the test.yml check + build +
publish). Then verify: release exists with `weavero.xpi` attached, and the
rolling `release` tag serves the new version -- `update.json` for a
release; for a pre-release (a version with "-": the scaffold writes only
`update-beta.json`, and the XPI's update_url points there), `update-beta.json`
carries it and `update.json` still the last release.

## 6. Hand-edit the release notes

Auto-notes put chores under "### undefined" — always rewrite: user-facing
sections in plain language with the icon headers (kept from the pre-squash
auto-notes era; restored across v0.18.6+ on 2026-08-28):
`### 🚀 New` / `### 🩹 Fixed` / `### ⚙️ Internal`. `gh release edit
vX.Y.Z --notes-file …`.

## 7. Aftermath

- Close/comment shipped issues only on the user's instruction.
- Local installs on `-dev.N` auto-update to the clean version — nothing to do.
- Update the tracking registers whose entries just shipped.
- Interim tags swallow commits from the next release's notes — don't create
  tags between releases.
