// @ts-nocheck — see note in src/index.ts.
// Module: shared top-level constants. These were inline at the
// top of index.ts before the per-module split made them
// inaccessible from extracted modules (esbuild's IIFE bundle
// gives each module its own closure, so a top-level const in
// index.ts can't be referenced from modules/reader.ts directly).
// Re-exported here so any module can import what it needs.

// ===========================================================================

export const STYLE_ID = "weavero-styles";
export const PANEL_ID = "weavero-panel";
export const BTN_CLASS = "wv-btn";
export const BTN_TREE_CLASS = "wv-btn-tree";
export const BTN_PANE_CLASS = "wv-btn-pane";
export const BTN_POPUP_CLASS = "wv-btn-popup";
export const BTN_SIDEBAR_CLASS = "wv-btn-sidebar";

// Exact label prefixes we contribute to the reader annotation context
// menu via Zotero.Reader's plugin event system. Used in
// `decorateContextMenu` to identify our own menuitems and prepend the
// plugin icon — upstream's iframe React renderer
// (reader/src/common/components/context-menu.js) puts no class or data
// attribute on plugin-contributed `<button class="row basic">` rows
// that we could target by CSS, so we match by label text instead.
//
// In Zotero 10 every annotation context menu is `internal: true`
// (see reader/src/common/context-menu.js: createAnnotationContextMenu),
// which routes it through the in-iframe React menu rather than chrome
// XUL — so decoration has to happen on the iframe DOM after React
// mounts the buttons.
//
// String-prefix matching is robust against the chrome ↔ iframe
// `cloneInto` boundary (which can normalize Unicode-format markers
// like ZWSP away), at the small cost that another plugin using the
// exact same label would also pick up our icon.
// Chain (relations) icon SVG markup with a `__FILL__` placeholder
// for the path's fill color. Used at init() to bake light + dark
// theme variants into data: URLs that the chrome XUL items-tree menu
// can use as the `image=` attribute. (The system
// `chrome://zotero/skin/16/universal/related.svg` themes via
// `context-fill` to the menu's neutral icon color; we want the same
// amber that `.wv-btn-relations` uses in the reader sidebar header,
// for visual consistency.)
export const SCHEME_SVG_TEMPLATE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"'
    + ' viewBox="0 0 16 16">'
    + '<path fill="__FILL__" d="M12.5 13H8.5C7.57174 13 6.6815'
    + ' 12.6313 6.02513 11.9749C5.36875 11.3185 5 10.4283 5 9.5C5'
    + ' 8.57174 5.36875 7.6815 6.02513 7.02513C6.6815 6.36875'
    + ' 7.57174 6 8.5 6H8.908C9.03111 6.32197 9.03111 6.67803 8.908'
    + ' 7H8.5C7.83696 7 7.20107 7.26339 6.73223 7.73223C6.26339'
    + ' 8.20107 6 8.83696 6 9.5C6 10.163 6.26339 10.7989 6.73223'
    + ' 11.2678C7.20107 11.7366 7.83696 12 8.5 12H12.5C13.163 12'
    + ' 13.7989 11.7366 14.2678 11.2678C14.7366 10.7989 15 10.163'
    + ' 15 9.5C15 8.83696 14.7366 8.20107 14.2678 7.73223C13.7989'
    + ' 7.26339 13.163 7 12.5 7H11.953C11.9778 6.83432 11.9935'
    + ' 6.6674 12 6.5C11.9935 6.3326 11.9778 6.16568 11.953'
    + ' 6H12.5C13.4283 6 14.3185 6.36875 14.9749 7.02513C15.6313'
    + ' 7.6815 16 8.57174 16 9.5C16 10.4283 15.6313 11.3185 14.9749'
    + ' 11.9749C14.3185 12.6313 13.4283 13 12.5 13ZM0 6.5C0 7.42826'
    + ' 0.368749 8.3185 1.02513 8.97487C1.6815 9.63125 2.57174 10'
    + ' 3.5 10H4.047C4.02219 9.83432 4.0065 9.6674 4 9.5C4.0065'
    + ' 9.3326 4.02219 9.16568 4.047 9H3.5C2.83696 9 2.20107'
    + ' 8.73661 1.73223 8.26777C1.26339 7.79893 1 7.16304 1 6.5C1'
    + ' 5.83696 1.26339 5.20107 1.73223 4.73223C2.20107 4.26339'
    + ' 2.83696 4 3.5 4H7.5C8.16304 4 8.79893 4.26339 9.26777'
    + ' 4.73223C9.73661 5.20107 10 5.83696 10 6.5C10 7.16304'
    + ' 9.73661 7.79893 9.26777 8.26777C8.79893 8.73661 8.16304 9'
    + ' 7.5 9H7.092C6.96889 9.32197 6.96889 9.67803 7.092 10H7.5'
    + 'C8.42826 10 9.3185 9.63125 9.97487 8.97487C10.6313 8.3185'
    + ' 11 7.42826 11 6.5C11 5.57174 10.6313 4.6815 9.97487'
    + ' 4.02513C9.3185 3.36875 8.42826 3 7.5 3H3.5C2.57174 3'
    + ' 1.6815 3.36875 1.02513 4.02513C0.368749 4.6815 0 5.57174'
    + ' 0 6.5Z"/></svg>';

// URL_SCHEMES (the user-toggleable scheme registry) lives in
// modules/url.ts now and is re-imported here for the few non-URL
// call sites (CSS selector building, default-pref seeding,
// destroy-time pref cleanup).

export const MENU_LABEL_PREFIXES = [
    "Add Related",  // covers both single ("Add Related…") and multi-select
                    // ("Add Related…  (N annotations)") label variants
];

export const PLUGIN_CSS = [
    "." + BTN_CLASS + " {",
    "  cursor: pointer; border: none; background: transparent;",
    "  font-size: 14px; padding: 1px 3px; margin-left: 4px;",
    "  line-height: 1; flex-shrink: 0; opacity: 1;",
    "  border-radius: 3px;",
    "  transition: background 0.15s;",
    "}",
    "." + BTN_CLASS + ":hover {",
    "  background: rgba(0, 0, 0, 0.07);",
    "}",
    ":root.wv-ui-dark ." + BTN_CLASS + ":hover {",
    "  background: rgba(255, 255, 255, 0.08);",
    "}",
    "." + BTN_TREE_CLASS + " { font-size: 12px; vertical-align: middle; }",
    // Inline-flex wrapper so multiple sidebar/right-pane icons (comment +
    // relations + ...) sit side-by-side rather than stacking vertically
    // when the host slot is block-level (e.g. Zotero's reader
    // `.custom-sections`, which wraps each plugin append() in its own
    // `.section` div).
    ".wv-icon-group {",
    "  display: inline-flex; align-items: center; gap: 2px;",
    "  flex-shrink: 0;",
    "}",
    // Annotation-header relations icon: same chrome glyph Zotero uses
    // for the item-pane Related section, in amber to match the rest
    // of our reader-side affordances. Sized in CSS pixels (not 1em)
    // because it shares the sidebar header row with native Zotero
    // controls that themselves are pixel-sized.
    ".wv-btn-relations { color: #7a4a00; }",
    ".wv-btn-relations .wv-relations-svg {",
    "  width: 14px; height: 14px; display: block; flex-shrink: 0;",
    "}",
    ":root.wv-ui-dark .wv-btn-relations { color: #ffb84d; }",
    // Relations popup — flat list of related items. Each row is a
    // type-icon + title that's clickable to navigate into the
    // library. No separator above the list (it's the only content
    // in this popup variant).
    ".wv-relations-list { display: flex; flex-direction: column; gap: 2px; }",
    ".wv-rel-row {",
    "  display: flex; align-items: center; gap: 6px;",
    "  padding: 4px 6px; border-radius: 3px;",
    "  cursor: pointer; user-select: none;",
    "}",
    ".wv-rel-row:hover { background: rgba(0, 0, 0, 0.07); }",
    ":root.wv-ui-dark .wv-rel-row:hover { background: rgba(255, 255, 255, 0.08); }",
    ".wv-rel-icon {",
    "  width: 16px; height: 16px; flex-shrink: 0;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "}",
    ".wv-rel-title {",
    "  flex: 1; min-width: 0;",
    "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
    "}",
    ".wv-rel-empty {",
    "  padding: 4px 6px; opacity: 0.6; font-style: italic;",
    "}",
    // Link colours via CSS custom properties — `:root.wv-ui-dark`
    // swaps the values, so `var(--wv-link-*)` references everywhere
    // (class rules + inline styles set via JS) react to theme
    // changes automatically without re-rendering. Light variants
    // hit ≥ 4.5:1 against white; dark variants ≥ 4.5:1 against
    // ~#1e1e1e.
    ":root {",
    "  --wv-link-http:   #1a73e8;",  // URL — Google blue
    "  --wv-link-zotero: #8b4513;",  // Zotero internal — saddle brown
    "  --wv-link-app:    #9333ea;",  // App link — violet-600
    "}",
    ":root.wv-ui-dark {",
    "  --wv-link-http:   #8ab4f8;",  // lighter blue for dark bg
    "  --wv-link-zotero: #cd853f;",  // lighter orange for dark bg
    "  --wv-link-app:    #c084fc;",  // lighter violet for dark bg
    "}",
    // URL-span styling is intentionally global so it applies everywhere we
    // mark URLs (items tree, right pane, reader sidebar, in-PDF popup).
    // !important defends against Zotero's own `.comment { color: ... }` rule.
    ".wv-url-span { cursor: pointer !important; }",
    ".wv-url-span.wv-link-http   { color: var(--wv-link-http)   !important; }",
    ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero) !important; }",
    ".wv-url-span.wv-link-app    { color: var(--wv-link-app)    !important; }",
    ".wv-link { cursor: pointer !important; }",
    // Experimental inline-markdown rendering (off by default).
    ".wv-md-bold { font-weight: 700; }",
    ".wv-md-italic { font-style: italic; }",
    ".wv-md-strike { text-decoration: line-through; opacity: 0.85; }",
    ".wv-md-code {",
    "  font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;",
    "  font-size: 92%; padding: 0 3px; border-radius: 3px;",
    "  background: rgba(127,127,127,0.15);",
    "}",
    // v0.0.106: preview-panel rendering. .content stays plain text and
    // editable; .wv-md-preview is a sibling that shows the formatted view.
    // We swap them based on focus (see wv-editing class). The preview
    // mimics .content's typography so toggling between them is visually
    // seamless. inherit cascades font/size/color from Zotero's editor.
    ".wv-md-preview {",
    "  font: inherit; color: inherit; line-height: inherit;",
    "  white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;",
    "}",
    // When a comment has a preview attached, hide the raw .content; the
    // preview takes its place. On focusin (wv-editing class set by
    // sidebarFocusIn), swap them so the editable .content shows.
    // The preview uses -webkit-box + line-clamp to mirror Zotero's own
    // truncation on .content (~3 lines in the reader sidebar). The
    // editing-state rule has higher specificity (3 classes vs 2) so it
    // wins over the line-clamp display when the user is editing.
    ".comment.wv-comment-preview .content { display: none; }",
    ".comment.wv-comment-preview .wv-md-preview {",
    "  display: -webkit-box;",
    "  -webkit-box-orient: vertical;",
    "  -webkit-line-clamp: var(--wv-preview-line-clamp, 3);",
    "  overflow: hidden;",
    "}",
    // Lift the truncation when the row is selected — Zotero applies the
    // `selected` class to the .annotation row on click, mirroring its own
    // expand-on-click behaviour. (Verified via the v0.0.141 sel-diag log.)
    ".annotation.selected .wv-md-preview { -webkit-line-clamp: unset; }",
    ".annotation-popup .wv-md-preview { -webkit-line-clamp: unset; }",
    // The overflow-only icon is the user's escape hatch when the clamp
    // hides part of the comment. Once the row is selected (clamp lifted,
    // full content visible), the icon would just clutter — hide it.
    ".annotation.selected .wv-btn-sidebar[data-wv-icon-reason='overflow'] { display: none; }",
    ".comment.wv-comment-preview.wv-editing .content { display: block; }",
    ".comment.wv-comment-preview.wv-editing .wv-md-preview { display: none; }",

    // Flex layout gives the icon its own slot the text physically can't enter.
    // Comment text lives in .wv-text-wrap which clips with ellipsis; icon is a
    // non-shrinking flex sibling.
    ".annotation-row.tight .cell.annotation-comment[data-has-rich],",
    ".annotation-row.tight .cell.annotation-comment[data-has-relations] {",
    "  display: flex; align-items: center; gap: 3px;",
    "}",
    ".wv-text-wrap {",
    "  flex: 1 1 auto; min-width: 0;",
    "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
    "}",
    ".wv-tree-icon {",
    "  display: none; font-size: 10px; opacity: 1;",
    "  user-select: none; flex-shrink: 0;",
    "  line-height: 1; padding: 1px 3px; border-radius: 3px;",
    // Match the spacing every other after-comment item uses, so
    // [comment] [badge] [link icon] [rel icon] is evenly spaced
    // regardless of which subset of those elements is present.
    // 4px matches Zotero's items-tree convention for adjacent
    // inline items (`.item-icon`, tag swatches, emoji — all use
    // `margin-inline-end: 4px` in `_item-tree.scss`).
    "  margin-inline-start: 4px;",
    "  transition: background 0.15s;",
    "}",
    // Items-tree relations icon — anchored to the right edge of the
    // annotation-comment cell next to .wv-tree-icon. ALWAYS visible
    // when the annotation has related items (no pref / truncation
    // gating) — flex-shrink: 0 reserves a slot the .wv-text-wrap's
    // ellipsis can't encroach on, so the icon stays visible even when
    // the comment text overflows the column.
    ".wv-tree-rel-icon {",
    "  display: inline-flex; align-items: center; justify-content: center;",
    "  flex-shrink: 0; cursor: pointer;",
    "  padding: 1px 2px; border-radius: 3px;",
    // Same 4px gap that every other after-comment item uses.
    "  margin-inline-start: 4px;",
    "  color: #7a4a00;",
    "  transition: background 0.15s;",
    "}",
    ".wv-tree-rel-icon .wv-relations-svg {",
    "  width: 12px; height: 12px; display: block; flex-shrink: 0;",
    "}",
    ".wv-tree-rel-icon:hover { background: rgba(0, 0, 0, 0.07); }",
    ":root.wv-ui-dark .wv-tree-rel-icon { color: #ffb84d; }",
    ":root.wv-ui-dark .wv-tree-rel-icon:hover {",
    "  background: rgba(255, 255, 255, 0.08);",
    "}",
    // Items-list custom column header icons. iconPath plugs the
    // icon URL into a `<span class=\"icon icon-bg\" style=\"background-
    // image: url(...)\">` inside the header cell. The Zotero SVGs
    // we use declare fill=\"context-fill\", so without
    // `-moz-context-properties: fill` set on the host span, the
    // fill falls back to black — invisible on dark themes.
    //
    // Match by the svg URL in the inline style attribute since
    // each plugin column's dataKey contains a literal `\\@`,
    // awkward to escape in a CSS class selector.
    //
    // \"Related\" → --accent-wood, mirroring the item-pane Related
    // section header (scss/abstracts/_variables.scss:
    // $item-pane-sections \"related\": --accent-wood).
    // \"Annotations\" → --tag-yellow, Zotero's highlight-annotation
    // yellow (scss/themes/_light.scss: #ffd400; _dark.scss:
    // #ffd400bf with alpha for softer dark-mode contrast). Same
    // hex Zotero stores on the default highlight annotation
    // (annotationColor). Both variables are already theme-aware,
    // so no :root.wv-ui-dark override is needed.
    ".virtualized-table-header .cell-icon",
    "  .icon-bg[style*=\"universal/related.svg\"] {",
    "  -moz-context-properties: fill, fill-opacity;",
    "  fill: var(--accent-wood);",
    "}",
    // Annotations column header — the SVG uses `fill="context-fill"`
    // and `.icon-bg` doesn't set `-moz-context-properties` by
    // default, so without an explicit fill the icon resolves to
    // black (invisible in dark mode). Use `--fill-secondary` so it
    // renders as a normal column glyph (white in dark, dark grey
    // in light), matching every other column header.
    ".virtualized-table-header .cell-icon",
    "  .icon-bg[style*=\"universal/annotate-highlight.svg\"] {",
    "  -moz-context-properties: fill, fill-opacity;",
    "  fill: var(--fill-secondary);",
    "}",
    // Format-state styling — A3 (amber disc) + M1 (bold sans M).
    // The selector list covers every surface where we drop a 🔗 icon: the
    // items-tree icon, the generic .wv-btn family (sidebar / popup / pane /
    // tree / text-annotation), and the in-PDF marker badge.
    // Chain SVG sizing — 1em scales with the surrounding font-size, so
    // the icon stays visually consistent with the emoji it replaced.
    // flex-shrink stops it collapsing inside the row's flex layout;
    // display:block kills the 1px inline-baseline gap.
    ".wv-link-svg {",
    "  width: 1em; height: 1em; display: block; flex-shrink: 0;",
    "}",
    ":root.wv-show-tree-icon .wv-tree-icon,",
    ":root.wv-icons-only .annotation-row.tight .cell.annotation-comment[data-icon-wanted] .wv-tree-icon,",
    ".annotation-row.tight .cell.annotation-comment[data-truncated=\"true\"] .wv-tree-icon {",
    "  display: inline-block; cursor: pointer;",
    "}",
    // Always show a hand cursor on any visible tree icon. Catches the
    // M-on-amber variant whose display:inline-flex !important rule
    // doesn't go through the visibility selectors above.
    ".wv-tree-icon { cursor: pointer; }",
    // Hover bg is literal (not via var(--fill-quinary)) — Zotero's
    // own variable resolves to ~5.88% alpha which is too subtle on
    // small icons. 7% / 8% gives a visible-but-restrained hover halo
    // that matches the inner-iframe values from _applyDynamicReaderTheme.
    ":root.wv-show-tree-icon .wv-tree-icon:hover,",
    ":root.wv-icons-only .annotation-row.tight .cell.annotation-comment[data-icon-wanted] .wv-tree-icon:hover,",
    ".annotation-row.tight .cell.annotation-comment[data-truncated=\"true\"] .wv-tree-icon:hover {",
    "  background: rgba(0, 0, 0, 0.07);",
    "}",
    ":root.wv-ui-dark.wv-show-tree-icon .wv-tree-icon:hover,",
    ":root.wv-ui-dark.wv-icons-only .annotation-row.tight .cell.annotation-comment[data-icon-wanted] .wv-tree-icon:hover,",
    ":root.wv-ui-dark .annotation-row.tight .cell.annotation-comment[data-truncated=\"true\"] .wv-tree-icon:hover {",
    "  background: rgba(255, 255, 255, 0.08);",
    "}",
    // Opacity is uniform at 1 across all themes — the hover
    // affordance is now purely the background fade-in (Zotero's
    // var(--fill-quinary) halo), so the dark-mode opacity bump
    // that lived here is no longer needed.
    // (URL hover tooltips are handled by Mozilla's native
    // `html-tooltip` — no custom styles needed; see the comment in
    // `_setupTreeClickDelegate` for the rationale.)
    // URL right-click context menu — shows "Copy Link" when the
    // user right-clicks a URL span. Mirrors the reader's context-menu
    // affordance ("Copy Link") for items list / right pane / sidebar
    // surfaces where Zotero's row context menu would otherwise show
    // unrelated item options.
    ".wv-url-menu {",
    "  position: fixed;",
    "  z-index: 1000001;",
    "  background: #ffffff;",
    "  color: #000;",
    "  border: 1px solid rgba(0, 0, 0, 0.20);",
    "  border-radius: 4px;",
    "  padding: 4px 0;",
    "  font: menu;",
    "  font-size: 12px;",
    "  min-width: 140px;",
    "  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);",
    "  display: none;",
    "}",
    ".wv-url-menu-item {",
    "  padding: 5px 18px;",
    "  cursor: default;",
    "  user-select: none;",
    "}",
    ".wv-url-menu-item:hover {",
    "  background: rgba(0, 0, 0, 0.08);",
    "}",
    ":root.wv-ui-dark .wv-url-menu {",
    "  background: #2b2b2b;",
    "  color: #fff;",
    "  border: 1px solid rgba(255, 255, 255, 0.30);",
    "  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);",
    "}",
    ":root.wv-ui-dark .wv-url-menu-item:hover {",
    "  background: rgba(255, 255, 255, 0.12);",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  .wv-url-menu {",
    "    background: #2b2b2b;",
    "    color: #fff;",
    "    border: 1px solid rgba(255, 255, 255, 0.30);",
    "    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);",
    "  }",
    "  .wv-url-menu-item:hover {",
    "    background: rgba(255, 255, 255, 0.12);",
    "  }",
    "}",
    // While our right-click menu is open we add .wv-context-menu-open to
    // <html>. Class name mirrors Zotero's reader convention (the reader
    // sets context-menu-open on its containers for the same purpose). The
    // CSS below revokes the pointer cursor on links and hides the URL
    // tooltip; the class is removed on menu close so the next mousemove
    // re-enables both, matching Zotero's "arrow cursor while menu is up,
    // hand cursor returns once you move the mouse" behaviour.
    ":root.wv-context-menu-open .wv-url-span,",
    ":root.wv-context-menu-open .wv-link {",
    "  cursor: default !important;",
    "}",
    "#" + PANEL_ID + " { min-width: 300px; max-width: 520px; }",
    ".wv-popup-container {",
    "  font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;",
    "  font-size: 13px; padding: 12px; line-height: 1.6;",
    "  white-space: pre-wrap; max-height: 400px; overflow: auto;",
    "}",
    ".wv-popup-container code {",
    "  font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;",
    "  font-size: 92%; padding: 1px 5px; border-radius: 3px;",
    "  background: rgba(127,127,127,0.15);",
    "}",
    ".wv-popup-container strong { font-weight: 600; }",
    ".wv-popup-container em { font-style: italic; }",
    ".wv-popup-container s { text-decoration: line-through; opacity: 0.85; }",
    ".wv-link { text-decoration: none; cursor: pointer; word-break: break-all; }",
    ".wv-link:hover { text-decoration: underline; }",
    ".wv-link-http   { color: var(--wv-link-http); }",
    ".wv-link-zotero { color: var(--wv-link-zotero); }",
    ".wv-link-app    { color: var(--wv-link-app); }",
    ".wv-extra-row { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }",
    ".wv-separator {",
    "  margin-top: 8px; padding-top: 8px;",
    "  border-top: 1px solid #ccc; font-size: 11px; color: #888;",
    "}",
    ".wv-copy-btn {",
    "  font-size: 10px; padding: 1px 5px; flex-shrink: 0;",
    "  border: 1px solid #aaa; border-radius: 3px;",
    "  cursor: pointer; background: transparent; color: inherit;",
    "}",
    ".wv-copy-btn:hover { background: rgba(128,128,128,0.15); }",
    // ---- Items-list filter bar (Linear-style chips) ------------------
    // Sits between the items toolbar and the items tree. Inline chips
    // for each active filter; "+ Filter" button opens a popover for
    // adding more conditions. Hidden rows use `wv-filter-hidden` —
    // virtualized-table positions each row absolutely so display:none
    // removes it without disturbing surrounding row positions.
    ".wv-filter-bar {",
    "  display: flex; align-items: center; gap: 6px;",
    "  padding: 4px 8px; flex-wrap: wrap;",
    "  border-bottom: 1px solid var(--fill-quinary, rgba(127,127,127,0.15));",
    "  min-height: 28px;",
    "}",
    ".wv-filter-add {",
    "  display: inline-flex; align-items: center;",
    "  padding: 3px 8px; cursor: pointer;",
    "  background: transparent; color: inherit;",
    "  border: 1px dashed rgba(127,127,127,0.5);",
    "  border-radius: 4px;",
    "  font: inherit; font-size: 12px;",
    "}",
    ".wv-filter-add:hover {",
    "  background: rgba(127,127,127,0.08);",
    "  border-color: rgba(127,127,127,0.8);",
    "}",
    // "Added By" badge appended to annotation rows in the items
    // tree. Stylised as a small pill in the accent-blue palette so
    // it reads as metadata, not as part of the annotation comment.
    // Background + colour are set inline (per user) by
    // `_ensureAnnotationRowPatched`. CSS only governs layout.
    // Same 4px margin-inline-start the other after-comment items
    // use so the spacing is uniform regardless of which subset
    // (badge, link icon, rel icon) is present. 4px matches
    // Zotero's items-tree convention. No margin-end so the next
    // item's own margin-start controls the gap.
    ".wv-annotation-added-by {",
    "  margin-inline-start: 4px;",
    "  padding: 1px 7px;",
    "  border-radius: 8px;",
    "  font-size: 11px; font-weight: 500;",
    "  align-self: center; flex-shrink: 0;",
    "  white-space: nowrap;",
    "}",
    // Per-user pill inside the built-in `addedBy` column. Shape
    // matches `.wv-annotation-added-by` (same padding, radius,
    // font-weight) so the two read as one design. Constrained to
    // `max-width: 100%` so the column width is never increased,
    // and carries its own ellipsis (the cell would normally
    // ellipsize a raw text node, but we replace that with this
    // span). `font-size: inherit` keeps the column's native size.
    ".wv-added-by-pill {",
    "  display: inline-block;",
    "  max-width: 100%; box-sizing: border-box;",
    "  padding: 1px 7px; border-radius: 8px;",
    "  font-weight: 500;",
    "  overflow: hidden; text-overflow: ellipsis;",
    "  white-space: nowrap; vertical-align: middle;",
    "}",
    // OR separator badge between groups in the chip bar.
    ".wv-filter-or {",
    "  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;",
    "  padding: 2px 6px; border-radius: 3px; opacity: 0.65;",
    "  background: rgba(127,127,127,0.12);",
    "  align-self: center;",
    "}",
    // The + Group button is visually distinct from + Filter so the
    // user can tell apart "add condition to this group" vs "start a
    // new OR'd group".
    ".wv-filter-add-group {",
    "  border-style: solid;",
    "  opacity: 0.85;",
    "}",
    ".wv-filter-chip {",
    "  display: inline-flex; align-items: stretch;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  border-radius: 4px; overflow: hidden;",
    "  cursor: pointer; font-size: 12px;",
    "  user-select: none;",
    "}",
    ".wv-filter-chip:hover { background: rgba(127,127,127,0.06); }",
    ".wv-chip-seg {",
    "  padding: 3px 7px; display: inline-flex;",
    "  align-items: center; gap: 3px;",
    "  border-right: 1px solid rgba(127,127,127,0.4);",
    "}",
    ".wv-chip-seg:last-child { border-right: none; }",
    ".wv-chip-field { font-weight: 500; opacity: 0.8; }",
    ".wv-chip-op { font-style: italic; opacity: 0.7; }",
    ".wv-chip-value { gap: 4px; }",
    // Per-user pill inside the Added By chip's value segment.
    // Same shape vocabulary as `.wv-annotation-added-by` and
    // `.wv-added-by-pill` so the three surfaces look consistent.
    ".wv-chip-value-user {",
    "  padding: 1px 7px; border-radius: 8px;",
    "  font-weight: 500;",
    "}",
    ".wv-chip-value-sep { opacity: 0.6; }",
    ".wv-chip-remove {",
    "  cursor: pointer; opacity: 0.6;",
    "  padding: 3px 7px; font-size: 14px; line-height: 1;",
    "}",
    ".wv-chip-remove:hover { opacity: 1; background: rgba(127,127,127,0.12); }",
    ".wv-chip-swatch {",
    "  width: 10px; height: 10px; border-radius: 50%;",
    "  display: inline-block;",
    "  border: 1px solid rgba(0,0,0,0.15);",
    "}",
    // Tags-column counts: manual in blue, automatic in default text
    // colour. Tracks Zotero's accent palette via a CSS var fallback
    // so it adapts to dark/light themes.
    ".wv-tags-count-manual {",
    "  color: var(--accent-blue, #2ea8e5); font-weight: 600;",
    "}",
    ".wv-tags-count-auto {",
    "  color: currentColor; opacity: 0.85;",
    "}",
    ".wv-tags-count-sep {",
    "  color: currentColor; opacity: 0.45;",
    "  margin: 0 2px;",
    "}",
    // Column-header icons need three things to render properly:
    //   1. `-moz-context-properties: fill, fill-opacity, stroke,
    //      stroke-opacity` so the SVG's `context-fill` /
    //      `context-stroke` references resolve at render time.
    //   2. A specific `fill` (and `stroke` for outline icons like
    //      `annotate-note.svg`) to drive the colour.
    //   3. The original `background-image` (set inline by Zotero's
    //      virtualized-table when `iconPath` is provided) — left
    //      untouched.
    //
    // Without #1+#2 the icon renders in its raw black SVG default
    // and looks very dim on dark themes. Built-in columns get this
    // via the `.icon-css` class — registered columns get
    // `.icon-bg`, which doesn't include them, so we add the rules.
    //
    // Colours match the right-pane section header icons (see
    // `_collapsibleSection.scss` ::before mapping in
    // `$item-pane-sections`): tags → orange, related → wood
    // (brown-ish). For annotations we use the highlight-yellow
    // accent so the column icon visually echoes the highlight
    // glyph it depicts.
    ".virtualized-table-header .cell[class*=\"weavero\"] .icon-bg {",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "}",
    ".virtualized-table-header .cell[class*=\"weaveroTags\"] .icon-bg {",
    "  fill: var(--accent-orange); stroke: var(--accent-orange);",
    "}",
    ".virtualized-table-header .cell[class*=\"weaveroRelated\"] .icon-bg {",
    "  fill: var(--accent-wood); stroke: var(--accent-wood);",
    "}",
    // Same rule scoped via the cell class — `iconPath` columns add
    // a `weaveroAnnotations` class on the header cell. Both
    // selectors are needed because some Zotero builds match on the
    // class while others rely on the inline style attribute above.
    ".virtualized-table-header .cell[class*=\"weaveroAnnotations\"] .icon-bg {",
    "  -moz-context-properties: fill, fill-opacity;",
    "  fill: var(--fill-secondary);",
    "}",
    // Popup-internal styles (the panel hosts an HTML subtree).
    ".wv-filter-popup-inner { padding: 6px; min-width: 200px; }",
    ".wv-filter-popup-header {",
    "  padding: 4px 8px 6px;",
    "  font-size: 11px; opacity: 0.6;",
    "  text-transform: uppercase; letter-spacing: 0.04em;",
    "}",
    ".wv-filter-color-list { display: flex; flex-direction: column; }",
    ".wv-filter-color-row {",
    "  display: flex; align-items: center; gap: 8px;",
    "  padding: 5px 8px; cursor: pointer; border-radius: 3px;",
    "  font-size: 13px;",
    "}",
    ".wv-filter-color-row:hover { background: rgba(127,127,127,0.12); }",
    // Wide unified-panel layout (one section per filter type).
    ".wv-filter-panel-inner {",
    "  display: flex; flex-direction: column;",
    "  gap: 3px; padding: 4px 6px;",
    // Anchor for absolutely-positioned children — currently used
    // by the per-cross-level-filter scope popup.
    "  position: relative;",
    "}",
    ".wv-filter-section {",
    "  display: flex; flex-direction: row; align-items: center; gap: 4px;",
    "}",
    // Section titles (e.g. "Annotation Color", "Has Comment", …)
    // are hidden — the icon swatches and the search-input placeholder
    // identify each filter on their own. The element stays in the
    // DOM so existing renderers don't need to branch on whether the
    // title exists.
    ".wv-filter-section-title {",
    "  display: none;",
    "}",
    // Toggle-bar layout shared by the Selection Target row at the
    // bottom of the filter popup. (Was previously also used by a
    // top-of-popup Scope row; that role has been removed.) The
    // bottom-bar variant (`wv-filter-bottom-bar`) flips the borders
    // for the bottom-of-popup placement.
    ".wv-filter-scope-bar {",
    "  display: flex; align-items: center; gap: 8px;",
    "  padding: 6px 0 8px;",
    "  border-bottom: 1px solid rgba(127,127,127,0.35);",
    "  margin-bottom: 4px;",
    "}",
    ".wv-filter-scope-bar-label {",
    "  flex: 0 0 var(--wv-title-col, 150px);",
    "  font-size: 12px; opacity: 0.75;",
    "  text-align: right; padding-right: 4px;",
    "}",
    ".wv-filter-scope-toggle {",
    "  font-weight: 500;",
    "}",
    // Bottom-bar variant — Scope and Selection Target sit at the
    // bottom of the panel, separated from the filter sections by
    // a thin top border. The Selection Target row has the same
    // styling but is the LAST row so its bottom margin is zero.
    ".wv-filter-bottom-bar {",
    "  border-top: 1px solid rgba(127,127,127,0.35);",
    "  border-bottom: none;",
    "  margin-top: 6px; margin-bottom: 0;",
    "}",
    ".wv-filter-seltarget-bar {",
    "  margin-bottom: 0;",
    "}",
    // Greyed rows in the items tree — same color treatment Zotero
    // uses for quick-search context rows (`.context-row`), so
    // unselectable rows still read but stay subdued.
    ".wv-not-target:not(.selected) {",
    "  color: var(--fill-secondary) !important;",
    "}",
    // Divider between kind-specific (top) and scope-applicable
    // (bottom) filter groups in the panel. Visual marker that the
    // scope-handling work for these filters is still TBD.
    ".wv-filter-group-header {",
    "  display: flex; align-items: center; gap: 8px;",
    "  margin: 2px 0 0; padding: 2px 0 0;",
    "  border-top: 1px dashed rgba(127,127,127,0.35);",
    "}",
    // First group's header sits at the top of the panel — no
    // divider line needed above it.
    ".wv-filter-group-header:first-child {",
    "  border-top: none; margin-top: 0; padding-top: 0;",
    "}",
    // Group-header label and TBD tag are also hidden — the dashed
    // top border of each group still provides visual separation.
    ".wv-filter-group-header-title,",
    ".wv-filter-group-header-todo {",
    "  display: none;",
    "}",
    // Added By section's scope checkboxes — three ticks stacked
    // under the title in the same left column. The section flips
    // to a 2-column grid when the scope row is present so the
    // user-button column on the right keeps its full height while
    // the title + ticks share the title column.
    ".wv-filter-section:has(> .wv-filter-scope-row:not([style*=\"none\"])) {",
    "  display: grid;",
    "  grid-template-columns: var(--wv-title-col, 150px) 1fr;",
    "  align-items: start; column-gap: 8px; row-gap: 2px;",
    "}",
    ".wv-filter-section:has(> .wv-filter-scope-row:not([style*=\"none\"])) > .wv-filter-section-title {",
    "  grid-row: 1; grid-column: 1;",
    "}",
    ".wv-filter-section:has(> .wv-filter-scope-row:not([style*=\"none\"])) > .wv-filter-options {",
    "  grid-row: 1 / 3; grid-column: 2;",
    "}",
    ".wv-filter-scope-row {",
    "  grid-row: 2; grid-column: 1;",
    "  display: flex; flex-direction: column; align-items: flex-end;",
    "  gap: 2px; padding-right: 4px;",
    "  font-size: 11px; opacity: 0.85;",
    "}",
    ".wv-filter-scope-cb {",
    "  display: inline-flex; align-items: center; gap: 4px;",
    "  cursor: pointer; user-select: none;",
    "}",
    ".wv-filter-scope-cb input { margin: 0; }",
    ".wv-filter-options {",
    "  flex: 1 1 auto;",
    "  display: flex; flex-wrap: wrap; gap: 3px;",
    "}",
    ".wv-filter-opt {",
    "  display: inline-flex; align-items: center; gap: 6px;",
    "  padding: 2px 8px; border-radius: 4px; cursor: pointer;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  background: transparent; color: inherit; font: inherit;",
    "  font-size: 12px;",
    "}",
    ".wv-filter-opt:hover { background: rgba(127,127,127,0.08); }",
    ".wv-filter-opt[data-selected=\"true\"] {",
    "  background: rgba(94,106,210,0.18);",
    "  border-color: rgba(94,106,210,0.6);",
    "}",
    // Alt+click negative-selection state. Red border, faint red
    // wash, and a diagonal slash overlay (universal "prohibited"
    // glyph) drawn via a thin gradient so the icon underneath
    // stays visible.
    ".wv-filter-opt[data-excluded=\"true\"] {",
    "  border-color: rgba(220,72,72,0.7);",
    "  background:",
    "    linear-gradient(",
    "      to top right,",
    "      transparent calc(50% - 1px),",
    "      rgba(220,72,72,0.85) calc(50% - 1px),",
    "      rgba(220,72,72,0.85) calc(50% + 1px),",
    "      transparent calc(50% + 1px)),",
    "    rgba(220,72,72,0.10);",
    "}",
    ".wv-filter-opt[data-excluded=\"true\"]:hover {",
    "  background:",
    "    linear-gradient(",
    "      to top right,",
    "      transparent calc(50% - 1px),",
    "      rgba(220,72,72,0.95) calc(50% - 1px),",
    "      rgba(220,72,72,0.95) calc(50% + 1px),",
    "      transparent calc(50% + 1px)),",
    "    rgba(220,72,72,0.16);",
    "}",
    ".wv-filter-opt-glyph {",
    "  display: inline-flex; width: 14px; justify-content: center;",
    "  font-size: 12px; opacity: 0.85;",
    "}",
    // Icon-only variant: compact square so 6-8 options fit on one row.
    ".wv-filter-opt-icon {",
    "  padding: 4px 6px; min-width: 26px;",
    "  justify-content: center; gap: 0;",
    "}",
    // (Old in-search Item Type picker CSS removed — Item Type now
    // has its own dedicated row above the search box, styled by
    // `.wv-filter-itype-trigger-row` / `-trigger` / `-selected`
    // / `-chip` rules later in this stylesheet.)
    // Attachment File Type icons rendered via direct <img> with the
    // chrome:// SVG paths (Zotero's CSS `.icon-attachment-type` rules
    // are scoped inside `.row` so we can't reuse them here).
    ".wv-attach-icon {",
    "  display: inline-block; width: 16px; height: 16px;",
    "}",
    // SVG icon themed via Mozilla's -moz-context-properties so the
    // SVG's `context-fill` / `context-stroke` references resolve to
    // currentColor — works for fill-painted icons AND stroke-only
    // icons like `annotate-note.svg`.
    ".wv-filter-svg {",
    "  display: inline-block; width: 16px; height: 16px;",
    "  -moz-context-properties: fill, stroke, fill-opacity, stroke-opacity;",
    "  fill: currentColor; stroke: currentColor;",
    "}",
    // Stacked variant for sections that need a search input above
    // their option chips (currently the Annotation Tag picker).
    ".wv-filter-options-stacked {",
    "  flex-direction: column; align-items: stretch;",
    "}",
    ".wv-filter-search-input {",
    "  width: 100%; box-sizing: border-box;",
    "  padding: 4px 8px; font: inherit; font-size: 12px;",
    "  border-radius: 4px; color: inherit;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  background: rgba(127,127,127,0.06);",
    "}",
    // Unified search row — mode dropdown + search input on one line.
    ".wv-filter-search-row {",
    "  display: flex; gap: 6px; align-items: stretch; width: 100%;",
    "}",
    ".wv-filter-search-row .wv-filter-search-input {",
    "  flex: 1 1 auto;",
    "}",
    // Combined search field — a single rounded box that holds BOTH
    // the ▾ mode trigger AND the text input, matching Zotero's
    // quick-search field (where the dropmarker is embedded inside
    // the field). The wrap carries the border + background; the
    // trigger and input inside are borderless.
    ".wv-filter-search-wrap {",
    "  display: flex; align-items: stretch; flex: 1 1 auto;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  border-radius: 4px;",
    "  background: rgba(127,127,127,0.06);",
    "}",
    ".wv-filter-search-wrap:focus-within {",
    "  border-color: rgba(94,106,210,0.8);",
    "  background: rgba(127,127,127,0.10);",
    "}",
    ".wv-filter-search-wrap .wv-filter-mode-trigger {",
    "  border: none; border-right: 1px solid rgba(127,127,127,0.4);",
    "  border-radius: 0; background: transparent;",
    "  padding: 2px 6px;",
    "}",
    ".wv-filter-search-wrap .wv-filter-search-input {",
    "  border: none; background: transparent; flex: 1 1 auto;",
    "  border-radius: 0; padding: 2px 8px;",
    "}",
    ".wv-filter-search-wrap .wv-filter-search-input:focus {",
    "  outline: none;",
    "}",
    // Mode dropmarker — small chevron-only button that opens the
    // mode-picker popup. No label, just an arrow; the active mode
    // is read off the search input's placeholder.
    ".wv-filter-mode-trigger {",
    "  font: inherit; font-size: 11px; line-height: 1;",
    "  color: inherit; cursor: pointer;",
    "  padding: 0 6px;",
    "  min-width: 22px;",
    "  display: inline-flex; align-items: center; justify-content: center;",
    "}",
    ".wv-filter-mode-trigger:hover {",
    "  background: rgba(127,127,127,0.12);",
    "}",
    ".wv-filter-search-input:focus {",
    "  outline: none;",
    "  border-color: rgba(94,106,210,0.8);",
    "  background: rgba(127,127,127,0.10);",
    "}",
    ".wv-filter-select {",
    "  font: inherit; font-size: 12px; color: inherit;",
    "  padding: 3px 6px; border-radius: 4px;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  background: rgba(127,127,127,0.06);",
    "  min-width: 180px;",
    "}",
    ".wv-filter-tag-list {",
    "  display: flex; flex-wrap: wrap; gap: 3px;",
    "  max-height: 120px; overflow-y: auto;",
    "}",
    // Suggestion-pill truncation. Long Tag / Collection / Saved
    // Search / Author names are capped at a sensible width and
    // ellipsised; the full name remains accessible via the button's
    // `title` attribute (Mozilla's html-tooltip handles the hover).
    ".wv-filter-tag-list .wv-filter-opt {",
    "  max-width: 180px;",
    "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
    "  display: inline-block;",
    "}",
    // Vertical-list mode (used by Item Type) — one row per value
    // with a Zotero CSS item-type icon prepended. Buttons span the
    // full width of the suggestion box so the icon column lines up.
    // Explicit overflow-x: hidden so long labels ellipsise instead
    // of triggering a horizontal scrollbar; overflow-y: auto keeps
    // the box vertically scrollable when the type list is taller
    // than the max-height.
    ".wv-filter-tag-list[data-vertical=\"true\"] {",
    "  flex-direction: column; flex-wrap: nowrap;",
    "  align-items: stretch; gap: 2px;",
    "  max-height: 220px;",
    "  overflow-x: hidden; overflow-y: auto;",
    "}",
    // 2-column grid variant for facets with many short labels
    // (Item Type). Switches the box from flex-column to a CSS grid
    // and lets buttons sit two-per-row with vertical scroll.
    ".wv-filter-tag-list[data-vertical=\"true\"][data-columns=\"2\"] {",
    "  display: grid;",
    "  grid-template-columns: 1fr 1fr;",
    "  column-gap: 4px; row-gap: 2px;",
    "}",
    // Thin vertical bar used to visually split related tile groups
    // inside the same `.wv-filter-options` row — currently used in
    // the Attachment File Type row to set the Item Note tile apart
    // from the file-type icons. align-self lets it stretch to the
    // row's natural height.
    ".wv-filter-vertical-separator {",
    "  width: 1px; align-self: stretch;",
    "  background: rgba(127,127,127,0.45);",
    "  margin: 2px 4px;",
    "}",
    // Group separator. In horizontal flex-wrap lists (e.g. the Tag
    // dropdown), force `flex-basis: 100%` so the separator spans
    // a full row, pushing what comes after it onto a new line
    // (matching the tag selector's coloured-vs-rest layout — see
    // tagSelectorList.jsx, which uses ~25% of rowHeight as a blank
    // gap with no visible divider). Vertical lists ignore the basis
    // since they're column-flexed.
    ".wv-filter-list-separator {",
    "  flex: 0 0 100%;",
    "  height: 4px;",
    "}",
    // In a 2-column grid, the separator must span both columns.
    ".wv-filter-tag-list[data-columns=\"2\"] .wv-filter-list-separator {",
    "  grid-column: 1 / -1;",
    "}",
    // Tag-list rows mirror Zotero's tag selector treatment:
    //   coloured (non-emoji) → bold + a small coloured dot before
    //   the name; coloured emoji → bold (the emoji is the visual);
    //   plain → no styling. Dot color comes from `--wv-tag-color`
    //   set inline by the tag mode's `styleButton` hook.
    ".wv-filter-opt.wv-filter-tag-colored {",
    "  font-weight: 600;",
    "}",
    ".wv-filter-opt.wv-filter-tag-colored:not(.wv-filter-tag-emoji)::before {",
    "  content: \" \";",
    "  display: inline-block;",
    "  width: 8px; height: 8px;",
    "  margin-right: 4px;",
    "  border-radius: 50%;",
    "  background: var(--wv-tag-color, currentColor);",
    "  border: 1px solid rgba(127,127,127,0.3);",
    "  vertical-align: -1px;",
    "  flex: 0 0 auto;",
    "}",
    ".wv-filter-tag-list[data-vertical=\"true\"] .wv-filter-opt {",
    "  display: flex; flex-direction: row; align-items: center;",
    "  justify-content: flex-start; gap: 6px;",
    "  max-width: none; text-align: left;",
    "  padding: 2px 6px;",
    "  min-width: 0;",
    // flex-shrink: 0 keeps each row at its natural height when the
    // box is `max-height: 220px`. Without this, a long list (e.g.
    // 40+ collections) gets compressed proportionally and rows
    // collapse to a few pixels of overlapping text instead of
    // triggering the box's vertical scroll.
    "  flex: 0 0 auto;",
    "}",
    // Label-span inside a button — needed in vertical-list mode so
    // long names ellipsise properly (flex children default to
    // `min-width: auto = content width`, preventing shrinkage). The
    // span carries the ellipsis, the icon next to it stays full size.
    ".wv-filter-tag-list[data-vertical=\"true\"] .wv-filter-opt-label {",
    "  flex: 0 1 auto; min-width: 0;",
    "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
    "}",
    // Selected-pills row — chips below the search box for values
    // the user has already picked. Each pill carries an × to
    // remove. Hidden when the selected set is empty.
    ".wv-filter-selected-list {",
    "  display: flex; flex-wrap: wrap; gap: 3px;",
    "  margin-top: 2px;",
    "}",
    ".wv-filter-selected-list:empty {",
    "  display: none;",
    "}",
    ".wv-filter-selected-pill {",
    "  display: inline-flex; align-items: center; gap: 4px;",
    "  padding: 2px 4px 2px 6px;",
    "  background: rgba(94,106,210,0.18);",
    "  border: 1px solid rgba(94,106,210,0.6);",
    "  border-radius: 4px;",
    "  font-size: 12px;",
    "  max-width: 220px;",
    "}",
    // Excluded pill (Alt+click in the search box). Red border +
    // faint red wash + diagonal slash overlay through the pill,
    // mirroring the icon-grid exclude visual.
    ".wv-filter-selected-pill[data-exclude=\"true\"] {",
    "  border-color: rgba(220,72,72,0.7);",
    "  background:",
    "    linear-gradient(",
    "      to top right,",
    "      transparent calc(50% - 0.5px),",
    "      rgba(220,72,72,0.85) calc(50% - 0.5px),",
    "      rgba(220,72,72,0.85) calc(50% + 0.5px),",
    "      transparent calc(50% + 0.5px)),",
    "    rgba(220,72,72,0.10);",
    "}",
    ".wv-filter-selected-pill-mode {",
    "  font-size: 11px; opacity: 0.65; flex: 0 0 auto;",
    "}",
    // Size Zotero's `icon-css` icons (collection / search /
    // item-type) when they're embedded in our pills or list rows.
    // Without an explicit size they collapse to 0×0 since Zotero's
    // base `.icon-css` rule only sets the background-image.
    ".wv-filter-selected-pill .icon,",
    ".wv-filter-tag-list .icon,",
    ".wv-filter-chip .icon {",
    "  display: inline-block; flex: 0 0 auto;",
    "  width: 16px; height: 16px;",
    "}",
    // Icon-only pill variant (used by Item Type after selection):
    // tighter padding, no label gap, icon flush.
    ".wv-filter-selected-pill[data-icon-only=\"true\"] {",
    "  padding: 2px 4px 2px 4px;",
    "  gap: 2px;",
    "}",
    // ── Item Type dedicated row (above the search box) ──────────
    // The trigger is a native XUL `<menulist native="true">` so its
    // chrome (border, background, dropmarker) matches the "Search
    // in library" trigger in advanced search exactly. We only set
    // `flex: 0 0 auto` so it sits on the first line and lets the
    // chip row absorb the remaining width.
    ".wv-filter-itype-trigger-row {",
    "  display: flex; flex-wrap: nowrap; align-items: flex-start;",
    "  gap: 4px; min-width: 0;",
    "}",
    ".wv-filter-itype-trigger {",
    "  flex: 0 0 auto;",
    // XUL menulists ship with platform-default outer margins (Mozilla
    // applies ~5px inline + ~2px block from `chrome://global/skin/menulist.css`)
    // so they line up with sibling form controls in dialogs. We don't
    // want that offset here — the trigger should sit flush-left with
    // the other rows in the panel.
    "  margin: 0 !important;",
    "}",
    ".wv-filter-itype-selected {",
    "  display: flex; flex-wrap: wrap; gap: 3px;",
    "  flex: 1 1 auto; min-width: 0;",
    "}",
    ".wv-filter-itype-chip {",
    "  display: inline-flex; align-items: center;",
    "  padding: 2px 4px;",
    "  border: 1px solid rgba(94,106,210,0.6);",
    "  background: rgba(94,106,210,0.18);",
    "  border-radius: 4px;",
    "  cursor: pointer;",
    "}",
    ".wv-filter-itype-chip:hover {",
    "  background: rgba(94,106,210,0.28);",
    "}",
    // Excluded type chip — red border + diagonal slash overlay.
    ".wv-filter-itype-chip[data-exclude=\"true\"] {",
    "  border-color: rgba(220,72,72,0.7);",
    "  background:",
    "    linear-gradient(",
    "      to top right,",
    "      transparent calc(50% - 0.5px),",
    "      rgba(220,72,72,0.85) calc(50% - 0.5px),",
    "      rgba(220,72,72,0.85) calc(50% + 0.5px),",
    "      transparent calc(50% + 0.5px)),",
    "    rgba(220,72,72,0.10);",
    "}",
    ".wv-filter-selected-pill-label {",
    "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
    "  flex: 0 1 auto;",
    "}",
    ".wv-filter-selected-pill-x {",
    "  cursor: pointer; opacity: 0.65;",
    "  font: inherit; line-height: 1;",
    "  background: transparent; border: none;",
    "  padding: 0 2px; border-radius: 2px;",
    "  color: inherit;",
    "}",
    ".wv-filter-selected-pill-x:hover {",
    "  opacity: 1; background: rgba(127,127,127,0.18);",
    "}",
    // Cross-level filter slot — the main icon button + a small ▾
    // scope arrow share the same border-rounding so they read as
    // one widget. The arrow opens a per-filter row-kind scope
    // popup (Annotation / Attachment+Item-Note / Parent).
    ".wv-filter-cross-slot {",
    "  display: inline-flex; align-items: stretch;",
    "}",
    ".wv-filter-cross-slot .wv-filter-cross-main {",
    "  border-top-right-radius: 0; border-bottom-right-radius: 0;",
    "  border-right: none;",
    "}",
    ".wv-filter-cross-scope-arrow {",
    "  display: inline-flex; align-items: center; justify-content: center;",
    "  font: inherit; font-size: 9px; line-height: 1;",
    "  color: inherit; cursor: pointer;",
    "  padding: 0 4px;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  border-top-left-radius: 0; border-bottom-left-radius: 0;",
    "  border-top-right-radius: 4px; border-bottom-right-radius: 4px;",
    "  background: transparent;",
    "  opacity: 0.7;",
    "}",
    ".wv-filter-cross-scope-arrow:hover {",
    "  opacity: 1; background: rgba(127,127,127,0.12);",
    "}",
    // Visible cue when the scope is narrowed below the all-on
    // default (any kind unchecked) — uses the same accent the
    // Tags item-pane section uses.
    ".wv-filter-cross-scope-arrow[data-modified=\"true\"] {",
    "  color: var(--accent-orange, #cc8400);",
    "  border-color: var(--accent-orange, rgba(204,132,0,0.6));",
    "}",
    // Per-filter scope popup. Lives inside the panel's inner box
    // so its absolute positioning is relative to the popup —
    // parking it in mainPopupSet would make positioning fragile
    // when the panel shifts.
    ".wv-filter-scope-popup {",
    "  position: absolute; z-index: 200;",
    "  background: var(--material-background, rgba(40,40,40,0.98));",
    "  color: inherit;",
    "  border: 1px solid rgba(127,127,127,0.5);",
    "  border-radius: 4px;",
    "  padding: 4px 6px;",
    "  box-shadow: 0 2px 6px rgba(0,0,0,0.25);",
    "  font-size: 12px;",
    "  min-width: 160px;",
    "}",
    ".wv-filter-scope-popup-head {",
    "  font-size: 10px; opacity: 0.6;",
    "  text-transform: uppercase; letter-spacing: 0.04em;",
    "  margin: 1px 0 3px;",
    "}",
    ".wv-filter-scope-popup-row {",
    "  display: flex; align-items: center; gap: 6px;",
    "  padding: 2px 0; cursor: pointer;",
    "}",
    ".wv-filter-scope-popup-row input { margin: 0; }",
    // Subtle text-button used for "Clear all" both in the chip bar
    // and in the panel footer.
    ".wv-filter-clear {",
    "  background: transparent; border: none; color: inherit;",
    "  font: inherit; font-size: 12px; cursor: pointer;",
    "  padding: 3px 8px; border-radius: 4px; opacity: 0.7;",
    "}",
    ".wv-filter-clear:hover {",
    "  opacity: 1; background: rgba(127,127,127,0.1);",
    "}",
    // In the chip bar, push the Clear-all button to the right end of
    // the line so it sits opposite the chips + `+ Filter` cluster.
    // The popup footer keeps its own right-alignment via the footer's
    // `justify-content: flex-end`.
    ".wv-filter-bar .wv-filter-clear {",
    "  margin-left: auto;",
    "}",
    ".wv-filter-panel-footer {",
    "  display: flex; justify-content: flex-end;",
    "  margin-top: 4px;",
    "  border-top: 1px solid rgba(127,127,127,0.15);",
    "  padding-top: 8px;",
    "}",
    // Top-of-popup bar — Alt+click hint on the left, red × on the
    // right. Sits above the first group header so the × lands
    // roughly above the rightmost Annotation Color swatch.
    ".wv-filter-top-bar {",
    "  display: flex; align-items: center;",
    "  gap: 6px;",
    "}",
    ".wv-filter-top-hint {",
    "  font-size: 10px; opacity: 0.5;",
    "}",
    // Text-style "Clear" button — sits between the hint and the
    // red × in the top bar. Margin-auto pushes it (and the × that
    // follows) to the right edge so the hint stays on the left.
    // Subtle pill so it reads as a tappable label without competing
    // with the more prominent red × beside it.
    ".wv-filter-clear-btn {",
    "  margin-left: auto;",
    "  font: inherit; font-size: 11px; line-height: 1;",
    "  color: inherit; cursor: pointer;",
    "  padding: 3px 8px; border-radius: 10px;",
    "  border: 1px solid rgba(127,127,127,0.4);",
    "  background: rgba(127,127,127,0.10);",
    "}",
    ".wv-filter-clear-btn:hover {",
    "  background: rgba(127,127,127,0.22);",
    "}",
    // Circular red × button (GitHub clear-search style, but red).
    // Slotted into the first group header (right side), so it
    // shares the row with the "Annotation" label and adds no
    // vertical space of its own. Idle state has a faint neutral
    // fill so the icon reads as tappable even before hover. Hover
    // deepens to a red wash. Clicking both clears every filter
    // AND dismisses the popup — there's nothing worth keeping the
    // popup open for after a full reset.
    ".wv-filter-clear-icon {",
    "  background: rgba(127,127,127,0.18);",
    "  border: none; padding: 0;",
    "  color: rgb(220,72,72);",
    "  cursor: pointer;",
    "  width: 24px; height: 24px;",
    "  border-radius: 50%;",
    "  position: relative;",
    "  display: inline-block;",
    "  font-size: 0;", // hide the textContent fallback
    "}",
    // Draw the × with two rotated bars instead of a glyph — keeps
    // it perfectly centered regardless of font metrics (the Unicode
    // × character has noticeable per-font baseline drift).
    ".wv-filter-clear-icon::before,",
    ".wv-filter-clear-icon::after {",
    "  content: \"\";",
    "  position: absolute;",
    "  top: 50%; left: 50%;",
    "  width: 12px; height: 1.5px;",
    "  background: currentColor;",
    "  border-radius: 1px;",
    "}",
    ".wv-filter-clear-icon::before {",
    "  transform: translate(-50%, -50%) rotate(45deg);",
    "}",
    ".wv-filter-clear-icon::after {",
    "  transform: translate(-50%, -50%) rotate(-45deg);",
    "}",
    ".wv-filter-clear-icon:hover {",
    "  background: rgba(220,72,72,0.28);",
    "  color: rgb(255,255,255);",
    "}",
    ".wv-filter-check {",
    "  width: 14px; display: inline-flex;",
    "  justify-content: center; opacity: 0.8;",
    "}",
    ".wv-filter-swatch {",
    "  width: 12px; height: 12px; border-radius: 50%;",
    "  border: 1px solid rgba(0,0,0,0.15);",
    "}",
    // Hidden rows — virtualized table positions rows absolutely, so
    // display:none removes the row from layout without shifting
    // siblings. Visual gap stays where the row was, but the alternative
    // (re-running Zotero's data layer) would require deep integration.
    ".row.wv-filter-hidden { display: none !important; }",
    // "List all tabs" panel — when there are 2+ libraries open in
    // tabs, Weavero groups the rows by library and inserts a header
    // row before each group: themed library icon + library name,
    // matching the look of a top-level row in Zotero's collection
    // tree. Headers are presentation-only (not focusable, don't
    // participate in keyboard nav).
    ".wv-tabs-menu-library-header {",
    "  display: flex; align-items: center; gap: 6px;",
    // Flush-left so the section title sits at the panel edge.
    "  padding: 6px 6px 4px 2px;",
    "  font-size: 12px; font-weight: 600;",
    "  border-top: 1px solid rgba(127,127,127,0.25);",
    "  margin-top: 4px;",
    "  pointer-events: none;",
    "}",
    ".wv-tabs-menu-library-header:first-child {",
    "  border-top: none;",
    "  margin-top: 0;",
    "}",
    ".wv-tabs-menu-library-header .icon {",
    "  width: 16px; height: 16px;",
    "  flex: 0 0 16px;",
    "}",
    ".wv-tabs-menu-library-name {",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  white-space: nowrap;",
    "  min-width: 0;",
    "  flex: 0 1 auto;",
    "}",
    // Tab count badge — sits flush against the library name so the
    // pair reads as one unit (\"My Library 5\"). The tickbox is
    // pushed to the far right via `margin-left: auto`, leaving the
    // intervening space between count and tick rather than between
    // name and count.
    ".wv-tabs-menu-library-count {",
    "  flex: 0 0 auto;",
    "  font-size: 11px;",
    "  font-weight: 400;",
    "  opacity: 0.65;",
    "  font-variant-numeric: tabular-nums;",
    "  margin-left: 4px;",
    "}",
    // Tristate tickbox at the right end of the library header.
    // Idle: empty square. `data-selected`: filled accent (include).
    // `data-excluded`: red diagonal slash on red-tinted background.
    // Header has pointer-events: none so the box re-enables them.
    ".wv-tabs-menu-library-tick {",
    "  pointer-events: auto;",
    "  flex: 0 0 14px;",
    "  width: 14px; height: 14px;",
    "  margin-left: auto;",
    "  padding: 0;",
    "  border: 1px solid rgba(127,127,127,0.55);",
    "  border-radius: 3px;",
    "  background: transparent;",
    "  cursor: pointer;",
    "  position: relative;",
    "}",
    ".wv-tabs-menu-library-tick:hover {",
    "  border-color: rgba(127,127,127,0.85);",
    "}",
    ".wv-tabs-menu-library-tick[data-selected=\"true\"] {",
    "  background: var(--color-accent, #2ea8e5);",
    "  border-color: var(--color-accent, #2ea8e5);",
    "}",
    ".wv-tabs-menu-library-tick[data-selected=\"true\"]::after {",
    "  content: \"\";",
    "  position: absolute;",
    "  left: 3px; top: 1px;",
    "  width: 5px; height: 8px;",
    "  border: solid #fff;",
    "  border-width: 0 1.5px 1.5px 0;",
    "  transform: rotate(45deg);",
    "}",
    ".wv-tabs-menu-library-tick[data-excluded=\"true\"] {",
    "  border-color: rgba(220,72,72,0.75);",
    "  background:",
    "    linear-gradient(to top right,",
    "      transparent calc(50% - 1px),",
    "      rgba(220,72,72,0.9) calc(50% - 1px),",
    "      rgba(220,72,72,0.9) calc(50% + 1px),",
    "      transparent calc(50% + 1px)),",
    "    rgba(220,72,72,0.18);",
    "}",
    // Filter-driven hide: applied to row[data-tab-id] elements
    // whose library is excluded (or not in the active include set).
    // Headers remain visible so the user can toggle the filter
    // back off without exiting the panel.
    ".wv-tabs-menu-row-hidden {",
    "  display: none !important;",
    "}",
    // Tabs-menu toolbar button picks up an accent tint when at least
    // one library filter is active, so the user can tell at a glance
    // that the visible tab list is narrowed.
    "#zotero-tb-tabs-menu.wv-tabs-menu-filter-active {",
    "  background-color: var(--color-accent-secondary, rgba(46,168,229,0.18)) !important;",
    "  border-radius: 4px;",
    "}",
    "#zotero-tb-tabs-menu.wv-tabs-menu-filter-active .toolbarbutton-icon {",
    "  fill: var(--color-accent, #2ea8e5);",
    "}",
    // File-type filter button: small funnel positioned over the right
    // edge of the search input. Wrapper is given `position: relative`
    // so the absolute positioning anchors to the panel header.
    "#zotero-tabs-menu-wrapper {",
    "  position: relative;",
    "}",
    // Trim the input on the right so the funnel button sits OUTSIDE
    // it (not floating on top of the input background).
    "#zotero-tabs-menu-panel #zotero-tabs-menu-filter {",
    "  margin-inline-end: 38px !important;",
    "}",
    // Transparent at rest, hover/active fills from the same
    // `--fill-*` vars Zotero's `toolbarbutton` (and the items-tree
    // filter button) uses. No border, no permanent background.
    "#wv-tabs-menu-filetype-btn {",
    "  position: absolute;",
    // Match the search input's row exactly: it sits at the top of
    // the wrapper and is 32 px tall. We can't anchor with `bottom`
    // because the wrapper extends down through the tab list.
    "  top: 0;",
    "  inset-inline-end: 4px;",
    "  height: 32px;",
    "  display: inline-flex;",
    "  align-items: center; justify-content: center;",
    "  gap: 1px;",
    "  padding: 2px 4px;",
    "  background: none;",
    "  background-color: transparent;",
    "  border: none;",
    "  box-shadow: none;",
    "  outline: none;",
    "  border-radius: 5px;",
    "  color: var(--fill-secondary);",
    "  cursor: pointer;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "  appearance: none;",
    "  -moz-appearance: none;",
    "}",
    "#wv-tabs-menu-filetype-btn .wv-tabs-menu-filetype-icon {",
    "  width: 16px; height: 16px;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "}",
    "#wv-tabs-menu-filetype-btn .wv-tabs-menu-filetype-chev {",
    "  display: inline-flex; align-items: center;",
    "  width: 8px; height: 8px;",
    "  opacity: 0.85;",
    "}",
    "#wv-tabs-menu-filetype-btn:hover {",
    "  background-color: var(--fill-quinary);",
    "}",
    "#wv-tabs-menu-filetype-btn:active {",
    "  background-color: var(--fill-quarternary);",
    "}",
    "#wv-tabs-menu-filetype-btn.wv-active {",
    "  color: var(--color-accent, #2ea8e5);",
    "}",
    "#wv-tabs-menu-filetype-btn.wv-active:hover {",
    "  background-color: var(--fill-quinary);",
    "}",
    // Custom tooltip for group-library tabs. XUL <tooltip> won't
    // render HTML children, so the inner structure is built from
    // <vbox>/<hbox>/<description>/<image>; these CSS rules style
    // them.
    "tooltip#wv-tab-library-tooltip {",
    "  --panel-padding: 0;",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-wrap {",
    "  padding: 6px 8px;",
    "  min-width: 200px;",
    "  max-width: 480px;",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-title {",
    "  font-weight: 600;",
    "  margin: 0 0 2px 0 !important;",
    "  white-space: normal;",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-sep {",
    "  height: 1px;",
    "  margin: 2px 0;",
    "  background: rgba(127,127,127,0.3);",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-header {",
    "  margin-top: 2px;",
    "  gap: 6px;",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-icon {",
    "  width: 16px;",
    "  height: 16px;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: #59ADC4;",
    "}",
    "#wv-tab-library-tooltip .wv-tab-tooltip-libname {",
    "  margin: 0 !important;",
    "  font-weight: 600;",
    "}",
    // File-type popup: small floating row of icon buttons under the
    // funnel. Mounts inside the tabs-menu panel so clicks on it
    // don't dismiss the parent <panel>. Matches the items-tree
    // filter popup's background by using the same `--material-menu`
    // var Mozilla applies to its menu/panel chrome. No transition
    // — appears in a single render.
    // Gear (settings) button mirroring the funnel — sits OUTSIDE
    // the search input on the LEFT. Same visual rules as the
    // funnel: no permanent box, hover fill from `--fill-quinary`.
    "#zotero-tabs-menu-panel #zotero-tabs-menu-filter {",
    "  margin-inline-start: 38px !important;",
    "}",
    "#wv-tabs-menu-settings-btn {",
    "  position: absolute;",
    "  top: 0;",
    "  inset-inline-start: 4px;",
    "  height: 32px;",
    "  display: inline-flex;",
    "  align-items: center; justify-content: center;",
    "  padding: 2px 4px;",
    "  background: none;",
    "  background-color: transparent;",
    "  border: none;",
    "  box-shadow: none;",
    "  outline: none;",
    "  border-radius: 5px;",
    "  color: var(--fill-secondary);",
    "  cursor: pointer;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "  appearance: none;",
    "  -moz-appearance: none;",
    "}",
    "#wv-tabs-menu-settings-btn .wv-tabs-menu-settings-icon {",
    "  width: 16px; height: 16px;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "}",
    "#wv-tabs-menu-settings-btn:hover {",
    "  background-color: var(--fill-quinary);",
    "}",
    "#wv-tabs-menu-settings-btn:active {",
    "  background-color: var(--fill-quarternary);",
    "}",
    // Settings popup: stacked checkbox rows. Same chrome / no-fade
    // treatment as the file-type popup.
    "#wv-tabs-menu-settings-popup {",
    "  position: absolute;",
    "  top: 38px;",
    "  inset-inline-start: 6px;",
    "  display: flex; flex-direction: column; gap: 4px;",
    "  padding: 8px 10px;",
    "  background-color: var(--material-sidepane);",
    "  background-image: linear-gradient(var(--material-menu), var(--material-menu));",
    "  border: 1px solid var(--material-panedivider, rgba(127,127,127,0.4));",
    "  border-radius: 6px;",
    "  box-shadow: 0 4px 12px rgba(0,0,0,0.18);",
    "  z-index: 1000;",
    "  transition: none !important;",
    "  animation: none !important;",
    "  opacity: 1;",
    "  min-width: 180px;",
    "}",
    ".wv-tabs-menu-settings-row {",
    "  display: flex; align-items: center; gap: 8px;",
    "  font-size: 12px;",
    "  cursor: pointer;",
    "  padding: 2px 0;",
    "}",
    ".wv-tabs-menu-settings-cb {",
    "  margin: 0;",
    "  cursor: pointer;",
    "}",
    ".wv-tabs-menu-settings-label {",
    "  user-select: none;",
    "}",
    // Highlight the library row of the currently-displayed item in
    // the libraries-collections-box when the item is replicated
    // across libraries (linked items present). Coloured background
    // on the inner `.box` so the existing `.current` font-weight
    // overlay still applies when both states match.
    "libraries-collections-box .row.wv-libraries-current-library .box {",
    "  background-color: var(--color-accent-secondary, rgba(46,168,229,0.18));",
    "  border-radius: 4px;",
    "}",
    // Annotation count badge — matches the item-pane attachment row
    // (`scss/elements/_attachmentRow.scss .annotation-btn`): a 12×12
    // universal `annotation-12` icon followed by the count, both
    // tinted with `--fill-secondary`.
    "#zotero-tabs-menu-list .row .wv-tabs-menu-anncount {",
    "  flex: 0 0 auto;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 4px;",
    "  margin: 0 6px;",
    "  color: var(--fill-secondary);",
    "  font-variant-numeric: tabular-nums;",
    "}",
    "#zotero-tabs-menu-list .row .wv-tabs-menu-anncount-icon {",
    "  width: 12px;",
    "  height: 12px;",
    "  display: inline-block;",
    "  background-image: url(\"chrome://zotero/skin/16/universal/annotation-12.svg\");",
    "  background-repeat: no-repeat;",
    "  background-position: center;",
    "  background-size: 12px 12px;",
    "  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity;",
    "  fill: currentColor;",
    "}",
    "#zotero-tabs-menu-list .row .wv-tabs-menu-anncount-label {",
    "  line-height: 16px;",
    "}",
    // Row of file-type tiles inside the popup — sits below the
    // top bar (hint + Clear / × buttons) in column flow.
    "#wv-tabs-menu-filetype-popup .wv-tabs-menu-filetype-row {",
    "  display: flex; flex-direction: row; gap: 4px;",
    "  align-items: stretch;",
    "}",
    // Thin vertical separator between the file-type icons and the
    // Note tile inside the file-type filter popup.
    "#wv-tabs-menu-filetype-popup .wv-tabs-menu-filetype-sep {",
    "  width: 1px;",
    "  align-self: stretch;",
    "  background: rgba(127,127,127,0.4);",
    "  margin: 2px 4px;",
    "}",
    "#wv-tabs-menu-filetype-popup {",
    "  position: absolute;",
    "  top: 38px;",
    "  inset-inline-end: 6px;",
    // Stack the top bar (hint + Clear / × buttons) above the row
    // of file-type tiles.
    "  display: flex; flex-direction: column; gap: 8px;",
    // Match the items-tree filter popup's breathing room: the
    // platform `<panel type="arrow">` chrome adds ~6 px padding on
    // each side and `wv-filter-popup-inner` adds another 6 px on top
    // — combined ~12 px. Mirror that here so both popups feel the
    // same despite us being a plain HTML div.
    "  padding: 12px;",
    // `--material-menu` is rgba(…, 0.58) — designed for XUL panels
    // that have a native backdrop-filter blur. Without the blur it
    // reads as transparent, so layer the same translucent menu var
    // on top of an opaque sidepane fill so the result is solid and
    // close to the items-tree filter's visual.
    "  background-color: var(--material-sidepane);",
    "  background-image: linear-gradient(var(--material-menu), var(--material-menu));",
    "  border: 1px solid var(--material-panedivider, rgba(127,127,127,0.4));",
    "  border-radius: 6px;",
    "  box-shadow: 0 4px 12px rgba(0,0,0,0.18);",
    "  z-index: 1000;",
    "  transition: none !important;",
    "  animation: none !important;",
    "  opacity: 1;",
    "}",
    // When the Tabs panel is in grouped layout (Weavero added
    // section headers), every row is indented uniformly so the
    // Library tab and the section tabs align — headers
    // themselves stay flush-left (they don't match `.row`).
    "#zotero-tabs-menu-panel.wv-tabs-menu-grouped .row[data-tab-id] {",
    "  padding-inline-start: 18px !important;",
    "}",
    // Widen the panel to recover the horizontal space the row
    // indent eats into the tab title — AND to leave room for the
    // gear / funnel buttons flanking the search input. Default
    // upstream width is 350px (`scss/elements/_tabsMenuPanel.scss`).
    // Driven by `wv-tabs-menu-wide` (separate from `wv-tabs-menu-grouped`)
    // so the panel stays the same width whether or not the user has
    // "Sort by Library" enabled — avoids a width-jump on toggle.
    "#zotero-tabs-menu-panel.wv-tabs-menu-wide {",
    "  width: 420px !important;",
    "}",
].join("\n");
