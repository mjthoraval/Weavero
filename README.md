# Weavero

A Zotero 7+ plugin that turns URLs in annotation comments into clickable links and adds a fast filter pane, related-item plumbing, and items-tree columns on top of the standard library view.

Out of the box, `https://`, `http://`, and `zotero://` links are recognised everywhere a comment is shown. Sixteen extra schemes (`mailto:`, `obsidian://`, `vscode://`, `slack://`, `notion://`, …) can be toggled per-scheme.

## Features

**Clickable links in annotation comments** across the items tree, right item pane, reader sidebar, in-PDF popup, link badges over annotation icons, and notes. Each surface is independently toggleable.

- **Two display modes** (preferences):
  - **Inline** — URLs, markdown, and app links render directly in the comment; an icon opens a popup with the full formatted view when the row is clipped.
  - **Icon & Popup** — Comments stay plain text; an icon next to each annotation opens the popup. Per-content-type sub-toggles for URLs / markdown / app-links.
- **Three colour buckets** so each kind of link reads at a glance: blue for `http(s)`, orange for `zotero://`, purple for app-scheme links.
- **Inline markdown** — `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[label](url)`.
- **App-link skip-confirm** — optional opt-in that bypasses Firefox's *"Allow this site to open the … link?"* prompt.
- **Right-click "Copy Link"** on any rendered URL.

**Filter popup** — a toolbar `▼` next to the search box opens a compact filter panel. Click to include, Alt+click to exclude.

- Annotation **color**, **type**, **has-comment**
- **Attachment** file type
- **Item Type** (native menulist + icon-only chips for selected types)
- **Cross-level**: *Has Related*, *Has Links* — applied across every row kind
- **Multi-select search**: Tag, Author, Added By, Collection, Saved Search. Colored tags rendered like Zotero's tag selector (colored block first by position, then plain — on separate rows).
- **Selection Target**: Parent / Attachment / Annotation tri-state — controls Ctrl+A scope and dims out-of-scope rows.
- Strict per-row matching: filtering keeps only items that match; ancestors are kept for tree shape, descendants are not auto-pulled.

**Items-list columns** (icon-only, hidden by default; enable via column-picker right-click):

- **Annotations** — count of annotations on attachments; sums across attachments on regular items.
- **Related** — count of related items per row.

**Right-click menus.**

- *Items list* — **Copy Item Link** (`zotero://select/.../items/<key>`, multi-select joins with newlines) and **Add Related…** (Zotero's select-items dialog, links the chosen items as `dc:relation` peers).
- *Collections tree* — **Copy Collection Link**.
- `zotero://` URI handler now resolves `…/collections/<key>` and `…/searches/<key>` paths (group-library variants supported), and switches focus to the library tab when followed from a note.

**Related-items badge.** Annotations with related items show a chain badge in the items tree; click opens a popup listing the relations.

## Install

1. Download the latest `weavero-v<version>.xpi` from the [Releases page](https://github.com/mjthoraval/Weavero/releases/latest).
2. In Zotero: `Tools → Plugins → ⚙ → Install Plugin From File…` → pick the XPI.
3. Restart Zotero if prompted.

## Configure

Open `Tools → Plugins → Weavero → Preferences` to enable/disable individual URL schemes and the optional markdown rendering.

## Build

Plugin source is in `src/`. A Zotero plugin is just a zip file with a `.xpi` extension — to build, zip the contents of `src/` (files at the archive root, no `src/` prefix) and name the result `weavero-v<version>.xpi`.

## Compatibility

- Zotero 7.0+ (declared `strict_min_version: 7.0`, `strict_max_version: 10.*`).
- Tested on Zotero 10.0-beta.

## License

[GNU Affero General Public License v3.0](LICENSE) — same license as Zotero itself.
