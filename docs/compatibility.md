# Weavero feature compatibility — Zotero 9 vs Zotero 10-beta

Tracks which Weavero features work on **Zotero 9 stable (9.0.3)** vs
**Zotero 10.0-beta** (the day-to-day dev/test target). Statuses carry the dev build / date they were last exercised.

Dev/test runs against Zotero 10-beta via the MCP bridge; the bridge can
also attach to a running Zotero 9 instance, which is how the v9 rows below
were checked. The coding rule behind the v9 rows: prefer `rowProvider || itemsView` style fallbacks and guard every v10-only API.

## Legend

- **Yes** — works.
- **No** — not available.
- **Verified** — exercised on that version (date / dev build noted).
- **Inferred** — concluded from code (version gating / API availability),
  not yet exercised.
- **Untested** — status unknown on that version; needs checking.

## Items-tree filter (verified on both, 2026-05-20, dev.74)

| Feature | v9 | v10-beta | Notes |
|---|---|---|---|
| Filter pane / chips (annotation color, item type, attachment file type, …) | Yes (verified) | Yes (verified) | Core filter works on both. v9 reads row/search state via `itemsView` (no `rowProvider`). |
| Auto-expand cascade (reveal matching descendants) | Yes (verified) | Yes (verified) | v9 needed dev.72 (open containers highest-index-first; v10 uses batched `expandRows`). |
| Path-aware match (filter + quick search across levels) | Yes (verified) | Yes (verified) | v9 needed dev.68/70 (read search ids from `itemsView`). |
| "Show Non-Matching Annotations" toggle | Yes (verified) | Yes (verified) | v9 needed dev.73 (re-apply after Zotero's pref-observer refresh). |
| "Show Non-Matching Attachments" toggle | Yes (verified) | Yes (verified) | v9 uses the apply's own keep logic, not the v10 row-class patch. |
| Selection Target + Ctrl+A gating | Yes (verified) | Yes (verified) | v9: Ctrl+A selected only the targeted, matching rows. |
| Non-matching row dimming (text + icon) | Yes (verified) | Yes (verified) | CSS/class-based via DOM walk — version-independent. |
| Deselect selected item when it stops matching | Untested | Yes (verified) | v10 mirrors quick search. v9: `_reconcileSelectionAfterFilter` runs only while `getRowCount` is patched (active filter) — likely works, not yet exercised on v9. |

## v10-beta only (verified)

| Feature | v9 | v10-beta | Notes |
|---|---|---|---|
| Chevron "hidden children" reveal indicator | **No** | Yes | Drawn by wrapping `ZoteroItemTreeRow.prototype.renderPrimaryCell`, a per-row method that exists only in v10's React item tree. v9 rows are plain `ItemTreeRow` with no `renderPrimaryCell`. The hidden-count *data* IS computed on v9 (`_wvHiddenCounts` populated) — only the render hook is missing. A v9 chevron would need a separate render path. |
| Per-attachment annotation reveal twisty (`isContainerEmpty` override) | **No** | Yes | Part of `_patchFileItemTreeRow` (v10 `FileItemTreeRow`). Bails on v9 (no `rowProvider`). |

## Core / other features — NOT yet verified on v9

Not exercised on v9 this session. Likely work (they don't obviously
depend on v10-only row classes), but unconfirmed — check before relying.

| Feature | v9 | v10-beta | Notes |
|---|---|---|---|
| Clickable links in annotation comments (reader sidebar) | Untested | Yes | reader module. |
| Clickable links in notes (note editor) | Untested | Yes | note-editor module. |
| Clickable links in items-tree / right pane | Untested | Yes | pane module. |
| Annotation icons rendering | Untested | Yes | annotation module. |
| Items-tree extra columns | Untested | Yes | pane module. |
| Tabs-menu overhaul | Untested | Yes | tabs module. |
| Related-item plumbing / relations popup | Untested | Yes | pane module. |
| Prefs pane | Untested | Yes | prefs/index.ts. |
| Bookmarks — collections-pane dropdown (items / collections / searches / URLs) | Untested | Yes | bookmarks module; local JSON store. |
| Bookmarks — reader sidebar tab (positions / pages / selected text) | Untested | Yes | reader-panels + bookmarks; uses the reader sidebar-tab API. |
| Reader annotation filter (funnel) | Untested | Yes | reader-panels module; drives `reader.setFilter({hiddenIDs})`. |
| Interlinked navigation (Ctrl/Shift+click internal links) | Untested | Yes | reader module; built on zotero/reader `PDFView` hit-test. |
| Pinned tabs (Firefox-style) | Untested | Yes | tabs module. |
| Tab groups | Untested | Yes | tab-groups module. |
| No-reload reader-tab move / tear-off between windows | Untested | Yes | tabs module; `swapDocShells` — likely v10-dependent, check. |
| Item pane in separate reader windows | Untested | Yes | reader module; mirrors the main-window item pane. |
| Compact title bar (hide title bar) | Untested | Yes | pane module; Windows/Linux only. |
| PDF outline text highlight (experimental) | Untested | Yes | reader-panels module; off by default. |

## v9-specific cosmetic note

On v9 the "N items in this view" status counter reads Zotero's raw
`rowCount` getter, which the filter doesn't patch (it patches the render
path via `tree.props` / `jsWindow`). So that count can show the unfiltered
total while the tree itself shows the correct filtered/expanded rows.
Cosmetic only — no effect on what's displayed or selected.
