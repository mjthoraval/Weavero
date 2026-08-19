# Weavero — guidance for AI coding agents

Weavero is a Zotero 7+ plugin: clickable links in annotation comments and notes, a filter pane, bookmarks, related-item plumbing, a tabs overhaul, and items-tree columns. TypeScript, built with [zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold).

**How work happens here**: the repeatable workflows are skills in [.claude/skills/](.claude/skills/) — `feature`, `bugfix`, `verify` (build→install→live-check cycle), `release` (maintainer-only), `upstream-check`. Path-scoped conventions are in [.claude/rules/](.claude/rules/). The architecture of this setup, and why, is explained in [.claude/README.md](.claude/README.md); the broader methodology is documented publicly at [docs/developing-with-ai.md](docs/developing-with-ai.md).

**Versioning and parallel sessions** (kept in this always-loaded file on purpose — loading rules in [.claude/README.md](.claude/README.md)):

- Any version bump: INVOKE the `verify` skill — never bump from memory of the pattern. WIP builds on `main` are `-dev.N` of the next version; **branch/fork builds carry their own suffix** (`-defatt.N`, `-annsrc.N`), never main's `-dev.N`.
- If another agent session may share this clone (unexplained commits, dirty files, or the user says testing is ongoing elsewhere): do NOT commit to `main` — INVOKE the `branch` skill and work in a separate clone on a suffixed branch. Merging a branch back also goes through the `branch` skill (merged-suite gate, renumbering, handoff message). Before any commit, check `git diff` for hunks that aren't yours; when installing into a shared test instance, state which version replaced which.

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

Everything Weavero adds to shared surfaces is prefixed (`_wv*`, `wv-`, `weavero.`). Details and more conventions: [.claude/rules/src-ts.md](.claude/rules/src-ts.md).
