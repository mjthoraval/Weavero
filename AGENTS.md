# Weavero — guidance for AI coding agents

Weavero is a Zotero 7+ plugin: clickable links in annotation comments and notes, a filter pane, bookmarks, related-item plumbing, a tabs overhaul, and items-tree columns. TypeScript, built with [zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold).

This file is the one instruction file for every coding agent; [CLAUDE.md](CLAUDE.md) imports it and adds only what is specific to Claude Code.

**How work happens here**: the repeatable workflows are skills in [.claude/skills/](.claude/skills/), one `SKILL.md` each — `feature`, `bugfix`, `verify` (build→install→live-check cycle), `release` (maintainer-only), `upstream-check`. Path-scoped conventions are in [.claude/rules/](.claude/rules/) (each file's `paths:` frontmatter names the files it covers). The architecture of this setup, and why, is explained in [.claude/README.md](.claude/README.md); the broader methodology is documented publicly at [docs/developing-with-ai.md](docs/developing-with-ai.md).

**Versioning and parallel sessions** (kept in this always-loaded file on purpose — loading rules in [.claude/README.md](.claude/README.md)):

- Any version bump: follow [.claude/skills/verify/SKILL.md](.claude/skills/verify/SKILL.md) (Claude Code: INVOKE the `verify` skill) — never bump from memory of the pattern. WIP builds on `main` are `-dev.N` of the next version; **branch/fork builds carry their own suffix** (`-defatt.N`, `-annsrc.N`), never main's `-dev.N`.
- If another agent session may share this clone (unexplained commits, dirty files, or the user says testing is ongoing elsewhere): do NOT commit to `main` — follow [.claude/skills/branch/SKILL.md](.claude/skills/branch/SKILL.md) (Claude Code: INVOKE the `branch` skill) and work in a separate clone on a suffixed branch. Merging a branch back also goes through the `branch` skill (merged-suite gate, renumbering, handoff message). Before any commit, check `git diff` for hunks that aren't yours; when installing into a shared test instance, state which version replaced which.

## For agents other than Claude Code

- Claude Code's hooks and settings in `.claude/` (`settings.json`, `hooks/`) are not active for you: follow their intent by hand. In particular, after editing TypeScript under `src/`, run `npm run typecheck` (0 errors) before you consider the work done.
- Where this file says to follow a skill, read its `SKILL.md` at that moment and follow its steps. Before editing a file, read the `.claude/rules/` files whose `paths:` match it (Claude Code loads them automatically).
- When the maintainer's private instructions are present one level above this checkout (`../AGENTS.md`), read them before any live check: they name the libraries that must never be written to.

## Commands

- Build: `npm run build` (prebuild runs `tsc --noEmit` — 0 errors required)
- Typecheck alone: `npm run typecheck`
- Tests: `npm test -- --exit-on-finish` (Mocha+Chai inside a temp-profile Zotero; the flag is required)
- Live verification: via the [MCP bridge](https://github.com/introfini/mcp-server-zotero-dev) against a running DEV-profile Zotero — never a real library

## Layout

- `src/index.ts` — `WeaveroPlugin` class; module method-bundles attach via `Object.assign`
- `src/modules/*.ts` — cohesive bundles (`url`, `annotation`, `reader`, `reader-panels`, `filter`, `pane`, `tabs`, `note-editor`, `sessions`, `bookmarks`)
- `src/bootstrap.js` — small stable lifecycle shim
- `test/` — specs; `test/live/` runs in a real Zotero via the bridge; `docs/` — user docs + manual test protocols (also the Pages site)

## Verify, don't guess

Never assert how Zotero or Firefox behaves from memory. Grep a local clone of [zotero/zotero](https://github.com/zotero/zotero) / [reader](https://github.com/zotero/reader), or probe the live runtime through the bridge, then state the behaviour and the source. Unverifiable claims are labeled as guesses.

## Hard invariants (each paid for with a real regression)

- Note tabs open via `ZoteroPane.openNote(id, {openInWindow: false})` ONLY.
- Taskbar overlay writes go through `_wvOvSetBadge` only — never `_wvSetTaskbarOverlay`/`_wvApplyTaskbarOverlay` directly (see `modules/tabs.ts`).
- The items-list filter is per-main-window: explicit target window, per-window expando state — never bind to `Zotero.getMainWindow()` implicitly.
- With quick/advanced search active, FILTER logic governs: every visible tree satisfies all criteria within the same item; user-reveal force-keeps are within-state only.
- Popup contracts are locked by `test/popups.spec.js`; `test/compat.spec.js` locks the `winOf(node)`-not-`ownerGlobal` rule.
- Sessions UI: expand via the twisty only — clicking the row switches sessions (destructive).
- The publication filter is case-sensitive by design.

Everything Weavero adds to shared surfaces is prefixed (`_wv*`, `wv-`, `weavero.`). Details: "Naming is namespacing" in [.claude/rules/src-ts-core.md](.claude/rules/src-ts-core.md); more conventions in the other TypeScript rule files beside it, split by topic ([src-ts-dom.md](.claude/rules/src-ts-dom.md), [src-ts-windows.md](.claude/rules/src-ts-windows.md), [src-ts-ui.md](.claude/rules/src-ts-ui.md); index: [src-ts.md](.claude/rules/src-ts.md)).
