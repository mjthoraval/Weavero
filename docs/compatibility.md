# Weavero feature compatibility — Zotero 9 vs Zotero 10-beta

Tracks which Weavero features work on **Zotero 9 stable (9.0.3)** vs
**Zotero 10.0-beta** (the day-to-day dev/test target). Statuses carry the dev build / date they were last exercised.

Dev/test runs against Zotero 10-beta via the MCP bridge; the bridge can
also attach to a running Zotero 9 instance, which is how the v9 rows below
were checked. The coding rule behind the v9 rows: prefer `rowProvider || itemsView` style fallbacks and guard every v10-only API.

**Zotero 11 (Firefox 153):** not a column here yet — the Windows Gecko pin
is still 140, so nothing can be exercised on it locally. One forward-compat
change has landed regardless (v0.18.1): Firefox 153 renames `ownerGlobal` to
`documentGlobal`, so every use goes through `winOf()` in `src/lib/dom.ts`,
which works identically on 9, 10 and 11. Two known items stay deferred until
the pin moves: the `<search-textbox>` takeover (the filter funnel anchors to
`zotero-tb-search`) and command events for `<checkbox>` in the prefs pane.

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
| Clickable links in notes (note editor) | Untested | Yes | note-editor module; existing `<a>` links coloured/handled, plus bare-URL/`www.` display-only decoration via an injected ProseMirror plugin (dev.95+, note content untouched). |
| Clickable links in items-tree / right pane | Untested | Yes | pane module. |
| Annotation icons rendering | Untested | Yes | annotation module. |
| Items-tree extra columns | Untested | Yes | pane module. |
| Tabs-menu overhaul | Untested | Yes | tabs module. |
| Related-item plumbing / relations popup | Untested | Yes | pane module. |
| Prefs pane | Untested | Yes | prefs/index.ts. |
| Bookmarks — collections-pane dropdown (items / collections / searches / URLs) | Untested | Yes | bookmarks module; local JSON store. |
| Bookmarks — reader sidebar tab (positions / pages / selected text) | Untested | Yes | reader-panels + bookmarks; uses the reader sidebar-tab API. |
| Bookmarks — sorting (Manual / Name / Date added, per reader tab) | Untested | Yes (verified 2026-08-04, v0.18.1) | reader-panels + bookmarks; library popup and all reader sections; display-only, manual order preserved. |
| Bookmarks — Add to Bookmarks in the annotation context menu | Untested | Yes (verified 2026-08-04, v0.18.1) | reader module; `createAnnotationContextMenu` plugin API; opens the pane focused on the new entry. |
| Reader annotation filter (funnel) | Untested | Yes | reader-panels module; drives `reader.setFilter({hiddenIDs})`. |
| Reader annotation sorting (position / date added / date modified) | Untested | Yes (verified 2026-08-03, dev.75) | reader-panels; right-click the Annotations tab header; content-side render wrapper + chrome rank maps; toggle in Settings → Sort & Filters. |
| Reader filter date ranges (Added / Modified, rolling Last-N + custom calendar) | Untested | Yes (verified 2026-08-03, dev.66) | reader-panels; typed entry incl. year-only, arrows, Tab; Weavero-own calendar — Zotero's Gecko build ships no working native date picker or content `<select>`. |
| Copy Link to Selected Text / This Position (`wvpos`) | Untested | Yes (verified dev.26) | url module; self-contained payload, links degrade to plain page-open without Weavero. |
| Default attachment / child to open | Untested | Yes (verified 2026-08-03, dev.78 merge; developed on the Zotero 10 source build) | attachments module; synced automatic-tag marker `▶️ wv-defatt`; wraps `getBestAttachment` outermost; coexists with PikaPei/zotero-default-attachment (read-only, optional import). |
| Interlinked navigation (Ctrl/Shift+click internal links) | Untested | Yes | reader module; built on zotero/reader `PDFView` hit-test. |
| Pinned tabs (Firefox-style) | Untested | Yes | tabs module. |
| Tab groups | Untested | Yes | tab-groups module. |
| No-reload reader-tab move / tear-off between windows | Untested | Yes | tabs module; `swapDocShells` — likely v10-dependent, check. |
| Item pane in separate reader windows | Untested | Yes | reader module; mirrors the main-window item pane. |
| Compact title bar (hide title bar) | Untested | Yes | pane module; Windows/Linux only. |
| Outline text highlight on navigation | Untested | Yes | reader-panels module; ON by default (and has been since v0.12). All reader types: PDF recovers the heading on the page; EPUB/snapshot resolve the entry's exact anchor. Best-effort: encoding mismatches and ambiguous destinations decline rather than guess. |

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
then fills the gaps AM leaves. Since AM v0.6.1 the bridge is explicit on
AM's side as well (its architecture notes document a "Weavero bridge"):
AM keeps `zotero://` links live and routes their clicks to Weavero, and
adopts Weavero's link colours. Verified against **AM v0.7.1 + Weavero
v0.19.10-dev.1** on Zotero 10.0.3-beta.2 (2026-09-17); the automated
plugin-compat tier pins AM 0.7.1 (`npm run test:compat`).

### Where each plugin renders (both enabled)

| Surface | AM | Weavero |
|---|---|---|
| Reader **sidebar** comment | Renders (Markdown + KaTeX) | Yields to AM; renders itself when AM is off |
| **In-view (in-PDF) annotation popup** | **Does not render** (its comment node is filtered out) | **Renders** it (Markdown + clickable links) |
| Item pane annotation comment | — | Renders |

The in-view popup only appears when the reader **sidebar is closed** — with
the sidebar open, selecting an annotation shows it in the sidebar instead.

### Link types — what becomes clickable

| Link form in the comment | AM (v0.6.1+) | With Weavero |
|---|---|---|
| Bare web URL (`https://` / `http://`) | Linkified (since v0.5.0); opened by AM (`Zotero.launchURL`) | Recolours the anchor; renders itself if AM off |
| Schemeless `www.` (e.g. `www.zotero.org`) | Linkified → `http://…` (markdown-it linkify) | Linkified → launches as `https://…`; yields to AM. Added in Weavero dev.96 (bare domains without `www` stay plain in both) |
| Markdown web link `[text](https://…)` | Rendered | Yields to AM |
| `mailto:` | Linkified | Yields to AM |
| Markdown link to `zotero://select` / `open` / `open-pdf` / `note` | **Live anchor** (since v0.6.1); a click is handed to Weavero's `handleZoteroURI` — exactly once, verified | Recolours it; nothing to rescue any more |
| Bare `zotero://` URL | Linkified (markdown-it linkify with the `zotero:` scheme) and routed to Weavero the same way | Recolours it |
| Markdown link to an app scheme (`obsidian://`, …) | **Stripped → dead anchor** (still outside AM's safe-URI list) | **Rescued** when the scheme is enabled in Weavero; AM's opener then launches it (Weavero's "open app links without confirmation" preference does not apply inside AM previews) |
| Raw HTML `<a>` | Not rendered (`html:false`) | — (neither renders HTML links) |
| LaTeX `\href{}` | Not rendered (KaTeX `trust:false`) | — |

**Colours.** With `weavero.recolorAmLinks` on (default), AM adds
`annotation-markdown-weavero-link-colors` to its preview and reads
Weavero's `--wv-link-http` / `--wv-link-zotero` / `--wv-link-app`
variables, and Weavero tags AM's anchors `wv-am-recolored` — one palette
across the sidebar, the in-view popup and the item pane. With the
preference off, AM drops the class and its links fall back to Zotero's
`LinkText`; Weavero's own rescued links keep Weavero's colours. Cosmetic
AM edge (v0.7.1): a dead app-scheme anchor is still coloured as an app
link by AM's `a` selector.

### AM 0.6–0.7 features on the shared sidebar (verified 2026-09-17, AM v0.7.1)

| AM feature | With Weavero |
|---|---|
| **Fast comment editor** (v0.6.0) | Coexists. The empty-comment card shows Zotero's native editor; Weavero's "Add comment" fallback stays down; editing does not trigger Weavero rendering. |
| **Floating outline** (v0.7.0) — a `<nav>` portal beside the sidebar for the selected preview with ≥ 2 headings | Mounts on selection; **hides while Weavero's Bookmarks tab is active** and returns on the Annotations tab; follows the sidebar offset when Weavero's sort bar is shown; clears when Weavero's funnel hides the annotation and returns when the filter is cleared. Any focus change that deselects the annotation (Weavero's filter popup, Zotero's own search box) removes it — Zotero's selection rule, not either plugin's. Entry clicks scroll the sidebar only. |
| **Long-annotation positioning** (v0.7.0) — scroll-target marker on a selected row taller than the viewport | Marker present; the row parks at the 2 px inset with Weavero's sidebar chrome in place. |
| **Outline vs the in-view popup** (v0.7.1 fix) | No outline appears for the in-view popup (sidebar closed); Weavero still renders that popup. |
| **Disable AM without restarting** | AM removes its previews (v0.5.1+). Weavero takes the cards over **after the reader is reopened** — Weavero's AM detection is cached per document, so reopen the tab (the same reload rule as for link-type preferences). |

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
- **v0.6.1** — keeps `zotero://select|open|open-pdf|note` links live and
  routes their clicks to `Zotero.Weavero.plugin.handleZoteroURI()`
  (falls back to `Zotero.launchURL`).
- **v0.6.2** — adopts Weavero's link colours in its previews, honouring
  `weavero.recolorAmLinks`.
- **v0.7.0 / v0.7.1** — floating outline and long-annotation positioning;
  0.7.1 keeps the outline hidden while the sidebar is closed (in-view
  popup) or on another sidebar tab.

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
