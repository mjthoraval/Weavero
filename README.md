<h1>
  <img src="src/icons/icon-96.png" alt="" width="48" height="48" align="absmiddle">
  Weavero
</h1>

[![Zotero](https://img.shields.io/badge/Zotero-7%E2%80%9310--beta-brightgreen?logo=zotero&logoColor=red)](https://www.zotero.org)
[![Tested on](https://img.shields.io/badge/Tested-Zotero%2010.0--beta-blue?logo=zotero&logoColor=red)](https://www.zotero.org/support/dev/client_coding/zotero_7_for_developers)
[![CI](https://img.shields.io/github/actions/workflow/status/mjthoraval/Weavero/test.yml?branch=main&label=CI&logo=github)](https://github.com/mjthoraval/Weavero/actions/workflows/test.yml)

[![Latest release](https://img.shields.io/github/v/release/mjthoraval/Weavero?label=Release&color=blue)](https://github.com/mjthoraval/Weavero/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/mjthoraval/Weavero/latest/total?color=brightgreen)](https://github.com/mjthoraval/Weavero/releases)
[![License](https://img.shields.io/github/license/mjthoraval/Weavero?label=License&color=lightgrey)](LICENSE)

A Zotero 7 to 10-beta plugin that layers convenience features on top of the standard library and reader: clickable links in annotation comments and notes, a fast filter pane, bookmarks, related-item tools, a structured tabs menu, tab and window management, and extra items-tree columns. Everything is individually toggleable in Preferences.

> [!NOTE]
> **Your documents are safe.** Weavero never writes to or modifies your PDF files or attachments on disk — there's no risk of corrupting your documents. It only layers UI on top of Zotero's standard views and keeps its own data (bookmarks, preferences) in separate files. Any feature you turn off is inert.

> [!WARNING]
> **Weavero is under active development — please report anything that misbehaves** ([open an issue](https://github.com/mjthoraval/Weavero/issues)). A few things to know:
>
> - **Built on Zotero's internals, and on a beta.** Weavero hooks deep into Zotero's reader, items tree, tabs menu, and preferences, and is developed and tested against **Zotero 10.0-beta**. A Zotero update (beta or stable) can temporarily break a feature until the plugin catches up.
> - **Bookmarks are local-only.** The Bookmarks feature stores its data in `<Zotero data dir>/weavero/bookmarks.json`. Bookmarks are **not synced** across computers and are **not included in Zotero's cloud backup** — they won't appear on your other devices, and they're lost if you start a fresh profile or lose that folder. **Back up your Zotero data directory if your bookmarks matter to you.** (The Zotero developers have said they intend to add plugin-managed synced storage; Weavero will adopt it once it's available.)
> - **Some features need Zotero 10.** A few rely on Zotero 10 APIs and may be unavailable or behave differently on Zotero 9.
> - **Experimental, opt-in features.** Some features are off by default and marked *experimental* in Preferences (e.g. *PDF outline text highlight* in the Extras tab) — they may be rough or change.

## Features at a glance

Grouped the same way as the Preferences tabs. Expand a group below for the details and screenshots.

- **[Enhanced links and relations](#enhanced-links-and-relations)** — clickable links (URLs, `zotero://`, 17 optional app schemes) in comments and notes; inline or icon + popup, colour-coded, with markdown; copy `zotero://` links for items / collections / searches / reader page / location / selection; Ctrl/Shift+click navigation through internal document links (into a split pane or a second window); related-item tools (*Add Related…*, chain badge, *Open Related* submenu, Related column, linked-library highlight).
- **[Filters](#filters)** — items-tree filter popup (annotation colour/type/comment, attachment & item type, *Has DOI/URL/Related/Links*, multi-select tag/publication/author/added-by/collection/search) with a removable chip bar; reader annotation filter; Selection Target tri-state; structured tabs menu with per-library and file-type filters.
- **[Bookmarks](#bookmarks)** — library bookmarks (items / collections / searches / URLs) via a toolbar dropdown; document bookmarks (in-PDF positions, pages, selected text, annotations) in a reader-sidebar tab, foldered and draggable, with search + funnel filter and hover cards; auto-hide when empty.
- **[Tabs and Windows](#tabs-and-windows)** — pinned tabs (Firefox-style, icon-only); named, colour-coded **tab groups** (collapse, drag-into, reopen, move between windows); **tab sessions** (save and switch whole workspaces); multi-select tabs; **move or tear-off a reader tab to another window with no reload** (scroll, zoom and selection preserved); **multi-tab reader windows** with their own tab strip and a Firefox-style **+** button; full drag-and-drop tab management in the "List all tabs" popup; reopen the last closed window/group; an item-details pane beside the reader in separate windows; optional multiple main windows (experimental).
- **[Extras](#extras)** — items-tree columns (annotation, related, tag counts); *Added By* for annotations with per-user colours; group-library tab glyph; Hide title bar (Firefox-style); *Open in External Viewer*; *PDF outline text highlight* (experimental).

## Features

<details id="enhanced-links-and-relations">
<summary><b>Enhanced links and relations</b></summary>

**Clickable links in annotation comments** across the items tree, right item pane, reader sidebar, in-PDF popup, link badges over annotation icons, and notes. Each surface is independently toggleable. Out of the box `https://`, `http://`, and `zotero://` are recognised; seventeen extra schemes (`mailto:`, `obsidian://`, `vscode://`, `slack://`, `notion://`, …) can be toggled per-scheme.

- **Two display modes:**
  - **Inline** — URLs, markdown, and app links render directly in the comment; an icon opens a popup with the full formatted view when the row is clipped.
  - **Icon & Popup** — comments stay plain text; an icon next to each annotation opens the popup. Per-content-type sub-toggles for URLs / markdown / app-links.
- **Three colour buckets** so each kind of link reads at a glance: blue for `http(s)`, orange for `zotero://`, purple for app-scheme links.
- **Inline markdown** — `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[label](url)`.
- **App-link skip-confirm** — optional opt-in that bypasses Firefox's *"Allow this site to open the … link?"* prompt.
- **Right-click "Copy Link"** on any rendered URL.

<div align="center"><img src="docs/screenshots/08-annotation-links.png" width="480" alt="Reader sidebar with annotation comments containing clickable links, beside the PDF page with in-document annotation badges"></div>

**Copy `zotero://` links** (right-click menus). All are standard `zotero://open` / `zotero://select` links — they work without the plugin and from other apps.

- *Items list* — **Copy Item Link** (`zotero://select/.../items/<key>`; multi-select joins with newlines).
- *Collections tree* — **Copy Collection Link** / **Copy Saved Search Link**.
- *Reader (right-click on the page)* — **Copy Link to This Page** in a PDF (`zotero://open/.../items/<key>?page=N`, N = the page you clicked, even in spread / continuous-scroll layouts), or **Copy Link to This Location** in an EPUB / web snapshot (`?cfi=…` / `?sel=…` for the element under the cursor). With text selected it becomes **Copy Link to Selected Text** — for EPUB / snapshots that's a `?cfi=`/`?sel=` link to the exact passage; for PDFs it stays page-level (no `?rects=` URL form exists yet — [zotero/zotero#4508](https://github.com/zotero/zotero/issues/4508)).
- The `zotero://` URI handler also resolves `…/collections/<key>` and `…/searches/<key>` paths (group-library variants supported), `?cfi=` / `?sel=` location params, and `…/items?itemKey=K1,K2` multi-select, and switches focus to the library tab when followed from a note.

**Interlinked navigation** — <kbd>Ctrl/Cmd</kbd>-click or <kbd>Shift</kbd>+click an *internal* link to follow it without losing your place. Internal links include PDF cross-references and citations, EPUB section links, and web-snapshot `#fragment` links (external `http(s)` links are left alone).

- **<kbd>Ctrl/Cmd</kbd>+click → split pane** — opens (or reuses) a split and sends the target to the *other* pane, so the pane you clicked from stays put; a reverse Ctrl+click from the second pane drives the first. Split orientation (horizontal / vertical) is configurable.
- **<kbd>Shift</kbd>+click → duplicate window** — opens (or reuses) a second reader window of the same document and sends the target there; the two windows stay coupled both ways — handy across monitors.
- The target is highlighted **in place** (no scroll-to-top, no flash); a page reference with no text region gets a brief red locator dot instead.

Built on Zotero's own reader ([`zotero/reader`](https://github.com/zotero/reader), AGPL-3.0); it implements an idea first raised in [this 2022 forum request](https://forums.zotero.org/discussion/100095) for interconnected split views and reader windows.

**Related and linked items** — features built around Zotero's related-items relations (`dc:relation`) and the linked-items mechanism.

- **Add Related…** in the items-list right-click menu — opens Zotero's select-items dialog and links the chosen items as `dc:relation` peers (multi-annotation aware).
- **Chain badge** on annotation rows that have related items; click it for a popup listing the relations.
- **Open Related Item** submenu in the reader's annotation context menu (Open in Reader / In New Window per related item).
- **Related column** (items tree, icon-only) — count of related items per row.
- **Linked-libraries highlight** — when an item is replicated across libraries (linked items), the row matching the displayed item's library gets an accent background in the item pane's *Libraries and Collections* section.

<div align="center"><img src="docs/screenshots/07-libraries-highlight.png" width="320" alt="Libraries and Collections section with the active library highlighted"></div>

</details>

<details id="filters">
<summary><b>Filters</b></summary>

**Filter popup** — a toolbar funnel `▼` next to the search box opens a compact filter panel; an accent dot marks the button while any filter is active. Click a facet to include, **Alt+click to exclude**.

- Annotation **colour**, **type**, **has-comment**
- **Attachment file type** — PDF / EPUB / Snapshot / Image / Video / Web Link / Linked File / Other File
- **Item Type** (native menulist + icon-only chips for the types you use), plus a **Standalone Note** tile
- **Parent flags**: *Has DOI*, *Has URL*, *Has Abstract*, *Has Attachment File*
- **Attachment / annotation flags**: *Has Bookmarks* (Weavero document bookmarks), *Has Annotations*, *Item Note*
- **Cross-level**: *Has Tag*, *Has Related*, *Has Link* (a URL in a comment or note) — each with an *Apply to* scope (parent / attachment / annotation)
- **Multi-select search**: Tag, Publication / Journal (exact match — case matters), Author / Creator, Added By (group libraries), Collection, Saved Search; ranked matching (typing *jfm* finds *Journal of Fluid Mechanics*) with keyboard navigation (↑/↓ + Enter), and selections shown as include/exclude pills like Zotero's tag selector
- **Selection Target**: Parent / Attachment / Annotation tri-state — controls Ctrl+A scope and dims out-of-scope rows
- Strict per-row matching: OR across groups, AND within a group; filtering keeps only rows that match — ancestors are kept for tree shape, descendants are not auto-pulled.

Active filters show as a **chip bar** above the items tree — one removable chip each, plus **+ Filter**, **+ OR Group**, and **Clear all**. A chevron on a container's first visible child reveals rows the filter hid, and a scope button inside the search box can restrict quick-search to chosen row kinds.

See [Filtering rules](docs/filter-rules.md) for the full logic.

<div align="center"><img src="docs/screenshots/06-items-filter.png" width="500" alt="Items-tree filter popup"></div>

**Reader annotation filter.** A funnel `▼` in the PDF / EPUB reader toolbar (next to *Find*) filters the open document's annotations by **type**, **colour**, **has-comment**, **tags**, and **author** — matched-out annotations disappear from both the sidebar list and the page, and it works even with the sidebar collapsed. Alt+click a chip to exclude; an accent dot marks the funnel while filtering, and a *hide all annotations* checkbox is included.

**Tabs menu.** The "List all tabs" dropdown gets a structured layout:

- **Library grouping** — section headers (themed library icon + name + tab count); the Library tab stays above all sections.
- **Per-library tickbox filter** — click to include, Alt+click to exclude. Hidden tabs disappear from the popup *and* from the main tab strip; the toolbar tabs-menu button picks up an accent tint while any filter is active.
- **File-type filter** (funnel button) — same theme-aware attachment icons as the items-tree filter (PDF / EPUB / Snapshot / Image / Video / Web Link / Other File), plus a yellow Note tile.
- **Settings** (gear button) — *Sort by Library* and *Show Annotations Count* toggles.

<div align="center">
<img src="docs/screenshots/03-tabs-menu.png" width="360" alt="Tabs menu popup with library grouping">
&nbsp;
<img src="docs/screenshots/04-filetype-filter.png" width="360" alt="File-type filter popup">
</div>

</details>

<details id="bookmarks">
<summary><b>Bookmarks</b></summary>

Bookmarks across two scopes. **Stored locally** in `<Zotero data dir>/weavero/bookmarks.json` — see the syncing/backup warning near the top of this page.

- **Library bookmarks** — a **Bookmarks dropdown** on the collections-pane toolbar for **items, collections, saved searches, whole libraries, and plain URLs**. Right-click a collection or library in the tree for **Bookmark Collection** / **Bookmark Library**. Quick access to the things you return to.
- **Document bookmarks** — a **Bookmarks tab in the reader sidebar** for **in-document locations**: a precise position (drops a 📌 pin you can drag to re-place), a whole page (PDF), a selected-text passage, or an annotation in the current document — plus an "Elsewhere in Zotero" section for items / collections / URLs and cross-document selections. Add them from the **+** button or the reader's right-click menu.
- **Library-bookmarks tab in the reader** (optional) — also browse your Library-scope bookmarks from the reader's Bookmarks panel; a scope toggle switches between *this document* and *library* (Ctrl-click to show both).
- **Folders &amp; drag-and-drop** — organise either list into folders and subfolders; reorder, nest (folders spring open on hover), and drag annotations, text selections, or items / collections / searches / libraries straight in.
- **Search &amp; filter** — each list has a search field and a **funnel** that filters by annotation type / colour / tags / author.
- **Rename, edit &amp; reset** — rename a bookmark (and edit its comment) without touching the source; *Reset to Original Name* restores the live label. Deleted targets show as dimmed, struck-through **orphans** with a ⚠ badge.
- **Hover card** — hovering a row shows a rich card: kind, colour swatch, page label, text preview, comment, tags, source document, and created date.
- **Auto-hide when empty** (optional, per scope) — hide the collections-pane button / reader tab until you add the first bookmark.

</details>

<details id="tabs-and-windows">
<summary><b>Tabs and Windows</b></summary>

Tab and window management on top of Zotero's tab bar. Each piece is individually toggleable.

- **Pinned tabs** — drag a tab into the pinned region (or *Pin Tab* in the tab right-click menu) for a Firefox-style, icon-only tab. Pins persist across restarts, never scroll out of view when the tab strip overflows, and clear automatically if the item is deleted.
- **Tab groups** — named, colour-coded groups on the tab bar: click to collapse/expand, hover to preview, right-click to rename, recolour, ungroup or close. Add tabs with the *Add Tab to Group ▸* submenu or by dragging; saved groups can be reopened from the "List all tabs" dropdown. **Groups move between windows as a whole**: drag the group's chip onto any other main or reader window (released anywhere on the target window) and every member travels with it; drag it onto the desktop to pop the group into its own new window.
- **Tab sessions** — save the current workspace (every window and its tabs) as a named session and switch between sessions from the "List all tabs" dropdown. Switching first snapshots the current workspace to a *Last workspace (auto)* safety net, so nothing is lost.
- **Multi-select tabs** — <kbd>Ctrl/Cmd</kbd>+click to toggle and <kbd>Shift</kbd>+click for a range, then move or close several tabs at once.
- **Move / tear-off reader tabs between windows** — drag a reader tab into another window, or use *Move to New Window*. For PDFs this is a **no-reload** move that preserves scroll position, zoom and text selection (other attachment types fall back to a reload); the tab keeps its identity.
- **Multi-tab reader windows** — a separate reader window gets its own tab strip: hold several documents and notes in one window, with a Firefox-style **+** button (opens Zotero's item picker to add a tab, sitting flush against the last tab) and its own "List all tabs" button. Reader windows and their tabs — including their groups — are restored on restart.
- **Drag-and-drop in the "List all tabs" popup** — reorder tabs, drag them between windows (main or reader) or into groups with a WYSIWYG drop preview, and drag a group's header row to move the whole group. Popup moves land **in the background**: the tab you're reading stays focused, and moved tabs arrive unloaded until you select them.
- **Reopen closed window / group** — <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>, or the matching context-menu entry.
- **Item pane in separate reader windows** — a standalone reader window can show the same item-details pane as the main window (metadata, attachments, related, notes, tags, collections). Resizable, with the width remembered.
- **Multiple main windows** *(experimental, opt-in)* — adds a *"New Main Window"* entry to the tab right-click menu.

<div align="center"><img src="docs/screenshots/09-tabs-and-windows.png" width="900" alt="Two Zotero windows: the main window's tab strip shows pinned tabs, colour-coded tab groups, and window controls moved into the strip (compact title bar); a second reader window in front has its own tab group and an item-details pane on the right"></div>

The "List all tabs" dropdown's library grouping and file-type filter live under [Filters](#filters) — that's the tabs *menu*; this group is tab *management*.

</details>

<details id="extras">
<summary><b>Extras</b></summary>

**Items-tree columns** (icon-only, hidden by default; enable via the column-picker right-click on the items-tree header):

- **Annotations** — count of annotations on attachments; sums across attachments on regular items.
- **Tags** — count of tags per row: manual tags (blue) and automatic tags (default colour). Toggle off the automatic count to show only the manual count.
- **Related** — count of related items per row.

**Group-library visuals:**

- **Added By for annotations** — in group libraries, a badge showing who created each annotation (annotation rows aren't covered by Zotero's built-in Added By column), optionally tinted with a **per-user colour** so contributors are easy to scan.
- **Group-library tab glyph + tooltip** — tabs whose item lives in a group library get a small "Group Libraries" cluster glyph on the file-type icon, plus a tooltip showing the tab title and a *library icon + Library Name* header.

<div align="center"><img src="docs/screenshots/02-tab-strip.png" width="900" alt="Tab strip with group library badge on the third tab"></div>

**Window and utility extras:**

- **Hide title bar (Firefox-style)** — replace the title bar with a browser-style bar (menus move out of the way, press <kbd>Alt</kbd> to summon them; window buttons move into the tab strip). Per-window-type sub-toggles (main window / separate reader window / separate note window). **Windows / Linux only; off by default.**
- **Open in External Viewer** — a right-click item that launches an item's best attachment with the OS default application (below *Show File* in the items list and *Show in Library* in the tab menu). Works for any stored file; the entry's icon mirrors the attachment type. *(Replaces the standalone "Open PDF for Zotero" plugin.)*
- **PDF outline text highlight** *(experimental, off by default)* — clicking a PDF outline (table-of-contents) entry flashes the actual **heading text**, not just the page. It recovers the heading position for embedded outlines (which only store a target point) and uses it directly for outlines Zotero generates itself, painting the highlight in place and keeping the timing consistent on rapid clicks (working around [zotero/zotero forums #122030](https://forums.zotero.org/discussion/122030)). The same consistent highlight applies to text-selection bookmarks. **Built on Zotero's open-source reader (AGPL-3.0):** it reuses the reader's text-analyzer glyph data (`getProcessedData` / `getPageData`) and its in-place highlight + outline-navigation internals — see [`zotero/pdf.js@2ec80d8` "Implement text analyzer"](https://github.com/zotero/pdf.js/commit/2ec80d8581) (mrtcode, 2023-03-09; a direct commit — Zotero's pdf.js/reader forks don't use PRs) and [`zotero/reader` → `src/pdf/pdf-view.js`](https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js). Weavero only adds the *join* — matching the outline's title text against those glyph positions to recover the heading box that Zotero leaves as a bare point for embedded TOCs ([zotero/zotero#2285](https://github.com/zotero/zotero/issues/2285), [#3752](https://github.com/zotero/zotero/issues/3752)).

</details>

## Install

1. Download the latest `weavero.xpi` from the [Releases page](https://github.com/mjthoraval/Weavero/releases/latest).
2. In Zotero: `Tools → Plugins → ⚙ → Install Plugin From File…` → pick the XPI.
3. Restart Zotero if prompted.

## Quick start

After installing, a few things to try:

1. **Clickable links** — add a URL to an annotation comment (or note); it becomes clickable wherever the comment shows. Tune the surfaces and display mode in *Preferences → Enhanced Links and Relations*.
2. **Filter your library** — click the `▼` next to the items-tree search box and pick an annotation colour, item type, tag, … (Alt+click a chip to exclude).
3. **Bookmark something** — enable *Preferences → Bookmarks*, then use the Bookmarks dropdown on the collections-pane toolbar (items / collections / searches) or the Bookmarks tab in the reader sidebar (in-document locations).
4. **Tidy the tabs menu** — open "List all tabs" to see library grouping and the per-library / file-type filters.

Every feature is opt-in/opt-out under `Tools → Plugins → Weavero → Preferences`.

## Configure

Open `Tools → Plugins → Weavero → Preferences`. Features are grouped into tabs (**Enhanced Links and Relations**, **Filters**, **Bookmarks**, **Extras**) and individually toggleable; optional URL schemes and experimental features are off by default.

## Build

Plugin source is TypeScript under `src/`. A Zotero plugin ships as a zip with a `.xpi` extension, but the source has to be bundled first:

```bash
npm install        # one-time
npm run build      # esbuild bundles src/ → .scaffold/build/weavero.xpi (+ update.json with the XPI's SHA512 hash)
```

(Through the pre-TypeScript releases there was also a no-Node manual-zip path — `scripts/build.ps1` zipping `src/*` directly. That no longer applies now that `src/` is TypeScript and needs bundling; use `npm run build`.)

## Development

Developed with [Claude](https://claude.ai) and [MCP Server Zotero Dev](https://github.com/introfini/mcp-server-zotero-dev) (hot-reload + privileged-context JS for fast iteration). The full workflow — and a from-scratch guide to building Zotero plugins with an AI agent — is documented at **[Developing Zotero plugins with AI](https://mjthoraval.github.io/Weavero/developing-with-ai)**.

The Node toolchain (optional but recommended) provides:

```bash
npm install              # one-time setup
npm run typecheck        # tsc --noEmit, hard-gated to 0 errors
npm test                 # Mocha + Chai inside a temp-profile Zotero
npm run build            # build the XPI to .scaffold/build/
npm start                # hot-reload dev loop (auto-reload on src/ changes)
npm run release          # interactive: bump → tag → push (CI then publishes)
```

Tests run inside a separate Zotero instance against a temp profile — your primary library is unaffected. CI runs the same suite headlessly on every PR and on every push to `main`.

Build/test tooling is all `devDependencies` (nothing from npm ships in the XPI): `typescript` (the `typecheck` gate), `zotero-plugin-scaffold` (the esbuild-based bundler + XPI packer + temp-profile test runner behind `npm run build` / `test` / `start` / `release`), `zotero-types` (Zotero's TypeScript definitions), and `mocha` + `chai` (+ their `@types`).

## Compatibility

- Zotero 7.0+ (declared `strict_min_version: 7.0`, `strict_max_version: 10.*`).
- Tested on Zotero 10.0-beta. Some features rely on Zotero 10 APIs and may be unavailable or behave differently on Zotero 9.

## License

[GNU Affero General Public License v3.0](LICENSE) — same license as Zotero itself.
