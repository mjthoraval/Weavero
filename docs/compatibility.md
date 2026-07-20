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

## Plugin interoperability — Annotation Markdown (AM)

[Annotation Markdown](https://github.com/qrkks/zotero-annotation-markdown)
(AM) renders annotation comments as Markdown/LaTeX in the reader. Weavero
makes links in those same comments clickable. Both can be enabled together;
Weavero detects AM per-document and **yields** the rendering AM will claim,
then fills the gaps AM leaves. Verified against **AM v0.5.1 + Weavero
v0.16.2-dev** on Zotero 10-beta (2026-07-20).

### Where each plugin renders (both enabled)

| Surface | AM | Weavero |
|---|---|---|
| Reader **sidebar** comment | Renders (Markdown + KaTeX) | Yields to AM; renders itself when AM is off |
| **In-view (in-PDF) annotation popup** | **Does not render** (its comment node is filtered out) | **Renders** it (Markdown + clickable links) |
| Item pane annotation comment | — | Renders |

The in-view popup only appears when the reader **sidebar is closed** — with
the sidebar open, selecting an annotation shows it in the sidebar instead.

### Link types — what becomes clickable

| Link form in the comment | AM (v0.5.x) | With Weavero |
|---|---|---|
| Bare web URL (`https://` / `http://`) | Linkified (added in v0.5.0) | Yields to AM; renders if AM off |
| Markdown web link `[text](https://…)` | Rendered | Yields to AM |
| `mailto:` | Linkified | Yields to AM |
| Markdown link to `zotero://` / app schemes | **Stripped → dead anchor** (AM keeps only web/mailto) | **Rescued** — Weavero rebuilds the anchor so it clicks |
| Bare `zotero://` URL | Not linkified | Rendered by Weavero |
| Raw HTML `<a>` | Not rendered (`html:false`) | — (neither renders HTML links) |
| LaTeX `\href{}` | Not rendered (KaTeX `trust:false`) | — |

Weavero also **recolours** AM's own links to match its scheme colours
(web / `zotero://` / app), controlled by the `weavero.recolorAmLinks`
preference (default on).

### Annotation types (verified 2026-07-20, AM v0.5.2)

Comment rendering + link handling is **type-independent** — it works the
same across every annotation type that shows a comment in the reader
sidebar, both with AM (AM renders, Weavero rescues `zotero://` + recolours)
and without AM (Weavero linkifies).

| Annotation type | Comment in sidebar card? | AM on | AM off (Weavero) |
|---|---|---|---|
| highlight | yes | AM renders | Weavero linkifies |
| underline | yes | AM renders | Weavero linkifies |
| note | yes | AM renders | Weavero linkifies |
| image | yes | AM renders | Weavero linkifies |
| text (free-text) | yes | AM renders | Weavero linkifies |
| **ink** | **no** | — | — |

**Ink is the sole exception, and it's native Zotero:** ink-annotation
comments are not surfaced in the sidebar card at all (verified both
collapsed and expanded — no `.comment` element), so there is nothing for
either plugin to act on. Not an AM or Weavero limitation.

### AM version history relevant to interop

These were surfaced during Weavero interop testing and fixed by AM's author:

- **v0.4.1** — fixed an *empty-comment lockout*: AM had hidden Zotero's
  native "Add comment" control for empty comments, so a first comment could
  not be typed. (This was AM behaviour, code-identical on Zotero 9 — not a
  Zotero 10 regression.)
- **v0.5.0** — added bare-URL linkification (web URLs had rendered as dead
  text).
- **v0.5.1** — disabling AM now removes its rendered previews from open
  readers (they had previously persisted until restart).
  [Reported as issue #1](https://github.com/qrkks/zotero-annotation-markdown/issues/1).

**Known remaining AM edge case (v0.5.1):** if AM had rendered in a reader
tab that was later *closed*, disabling AM afterwards throws
`can't access dead object` from its shutdown and aborts cleanup, leaving
previews stale in the still-open readers until restart. Does not affect
Weavero's own rendering. (Tracked in the same issue thread.)

### Weavero requirement

Weavero's link handling degrades cleanly: with AM absent it renders and
links comments itself; with AM present it yields the surfaces AM owns and
only adds what AM doesn't (the in-view popup, non-web-scheme link rescue,
recolouring). No Weavero feature is lost by running AM alongside it.
