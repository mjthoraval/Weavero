---
name: branch
description: Run a parallel/branch development effort and merge it back. Use when work must not touch the shared clone's main - a second agent session, a risky feature, or an isolated test build - and when merging such a branch back.
---

# Branch development lifecycle

Ambient rules in CLAUDE.md cover *detecting* a shared clone and the version
suffixes. This skill is the procedure. (Worked examples: `weavero-defatt`,
`weavero-annsource`, `weavero-fx153`.)

## 1. Start

- **Separate clone**, sibling directory named `weavero-<name>` (short,
  feature-evocative: `defatt`, `annsrc`); branch `<name>` off the current
  `main` tip. Set `git config user.name/email` locally in the clone.
- **Versions**: `-<name>.N` of the next version, NEVER main's `-dev.N`
  (verify skill owns the rule). First build = `<next>-<name>.1`.
- **Instance allocation**: say which Zotero instance the branch session
  tests in (dev profile 6100 / source build 6101). If it shares an
  instance with another session, every install states which version
  replaced which.

## 2. During

- No commits to the shared clone's `main` — all work in the branch clone.
- Registers (`work/`) live in the MAIN clone; append entries there rather
  than forking them.
- Before any commit: `git diff` for hunks that aren't yours (another
  session may share even the branch clone).
- Track main: rebase or merge main into the branch at natural checkpoints
  so the final merge is small.

## 3. Merge back (runs in the SHARED clone)

1. Both trees clean; announce the merge to any other live session BEFORE
   starting (they must not commit mid-merge).
2. Merge the branch into `main`. Resolve with the branch's `-<name>.N`
   versions DISCARDED: the merged line takes the next `-dev.N` (never
   reuse a number another session announced).
3. On the merged tree: `npm run typecheck` + FULL `npm test` — the merge
   is not done until the merged suite is green, including both sides'
   specs.
4. Single `chore:` bump to the next `-dev.N`.
5. **Install + self-test immediately** (standing rule): build, install
   into the running instance stating which version replaced which,
   force-reload, live-test BOTH sides' features on the merged build.
6. Update registers whose entries the branch resolves or adds.
7. Send the handoff (below) to other live sessions. Pushes stay HELD
   until the user's explicit word.

## 4. Handoff message template

> The `<name>` branch has been merged into main in this shared clone.
> - New commits on top of `<their-last-sha>`: `<sha> <subject>` ...
> - Dev line is now at `<version>`; your next bump is `<version+1>`.
>   Do not re-use `<version>`.
> - Your working tree already contains the merged code; any build now
>   includes: `<feature list>`.
> - Merged specs: `<spec files/blocks>`. Merged-suite status: `<result>`.
> - Installs into shared instances: state which version replaced which.
> - Register changes: `<work/ entries>`.
> - Pushes held until `<condition>`.

Every line of that template earned its place in the 2026-08-19
annotation-source merge — omit none.
