// Annotation Links — Zotero 7/10 Plugin
// bootstrap.js — plugin lifecycle entry point

var Weavero = null;
var _rootURI = "";

function startup({ id, version, rootURI }) {
    _rootURI = rootURI;
    Zotero.initializationPromise.then(() => {
        try {
            Weavero = new WeaveroPlugin();
            Weavero.init().catch(e =>
                Zotero.debug("[Weavero] init error: " + e)
            );
        } catch (e) {
            Zotero.debug("[Weavero] startup error: " + e);
        }
    });
}

function shutdown() {
    if (Weavero) { Weavero.destroy(); Weavero = null; }
}

// Zotero 7+ calls these whenever a main window is opened or closed. Without
// them, our window-specific observers (items-tree mutation observer,
// right-pane observer, document-level click/mousedown handlers) stay
// attached to the previous window's now-dead document — so on the second
// main-window-open they never fire, items list reverts to raw markdown,
// and the right pane stops re-marking. Re-bind the window-specific setup
// on load; tear it down on unload.
function onMainWindowLoad({ window }) {
    if (!Weavero) return;
    try { Weavero.onMainWindowLoad(window); }
    catch(e) { Zotero.debug("[Weavero] onMainWindowLoad error: " + e); }
}

function onMainWindowUnload({ window }) {
    if (!Weavero) return;
    try { Weavero.onMainWindowUnload(window); }
    catch(e) { Zotero.debug("[Weavero] onMainWindowUnload error: " + e); }
}

function install() {}
function uninstall() {}

// ===========================================================================

const STYLE_ID = "weavero-styles";
const PANEL_ID = "weavero-panel";
const BTN_CLASS = "wv-btn";
const BTN_TREE_CLASS = "wv-btn-tree";
const BTN_PANE_CLASS = "wv-btn-pane";
const BTN_POPUP_CLASS = "wv-btn-popup";
const BTN_SIDEBAR_CLASS = "wv-btn-sidebar";

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
const SCHEME_SVG_TEMPLATE =
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

// User-toggleable URL schemes. The two always-on schemes
// (`https?://`, `zotero://`) are baked into URL_REGEX directly; this
// list adds optional ones the user can enable in the prefs pane.
//   sep "://" → matches `<name>://...`
//   sep ":"   → matches `<name>:...` (mailto, tel, magnet, …)
// Ordering: alphabetical within tier (bare-colon `name:` first, then
// slash `name://`). Keep this in sync with the SCHEMES list in
// prefs.js and the grid in prefs.html.
const URL_SCHEMES = [
    // ---- Tier 1: bare-colon schemes (name:) ------------------------------
    { name: "magnet",   pref: "enableMagnetScheme",   sep: ":",
      label: "magnet:",     desc: "Torrent magnet links" },
    { name: "mailto",   pref: "enableMailtoScheme",   sep: ":",
      label: "mailto:",     desc: "Email addresses" },
    { name: "skype",    pref: "enableSkypeScheme",    sep: ":",
      label: "skype:",      desc: "Skype calls / chats" },
    { name: "sms",      pref: "enableSmsScheme",      sep: ":",
      label: "sms:",        desc: "SMS messages" },
    { name: "spotify",  pref: "enableSpotifyScheme",  sep: ":",
      label: "spotify:",    desc: "Spotify tracks / playlists" },
    { name: "tel",      pref: "enableTelScheme",      sep: ":",
      label: "tel:",        desc: "Phone numbers" },
    // ---- Tier 2: slash schemes (name://) ---------------------------------
    { name: "discord",  pref: "enableDiscordScheme",  sep: "://",
      label: "discord://",  desc: "Discord servers" },
    { name: "evernote", pref: "enableEvernoteScheme", sep: "://",
      label: "evernote://", desc: "Evernote notes" },
    { name: "figma",    pref: "enableFigmaScheme",    sep: "://",
      label: "figma://",    desc: "Figma files" },
    { name: "file",     pref: "enableFileScheme",     sep: "://",
      label: "file://",     desc: "Local files" },
    { name: "ftp",      pref: "enableFtpScheme",      sep: "://",
      label: "ftp://",      desc: "FTP servers" },
    { name: "msteams",  pref: "enableMsteamsScheme",  sep: "://",
      label: "msteams://",  desc: "Microsoft Teams" },
    { name: "notion",   pref: "enableNotionScheme",   sep: "://",
      label: "notion://",   desc: "Notion pages" },
    { name: "obsidian", pref: "enableObsidianScheme", sep: "://",
      label: "obsidian://", desc: "Obsidian notes" },
    { name: "slack",    pref: "enableSlackScheme",    sep: "://",
      label: "slack://",    desc: "Slack channels" },
    { name: "vscode",   pref: "enableVscodeScheme",   sep: "://",
      label: "vscode://",   desc: "VS Code workspaces / files" },
    { name: "zoommtg",  pref: "enableZoomScheme",     sep: "://",
      label: "zoommtg://",  desc: "Zoom meetings" },
];

const MENU_LABEL_PREFIXES = [
    "Add Related",  // covers both single ("Add Related…") and multi-select
                    // ("Add Related…  (N annotations)") label variants
];

const PLUGIN_CSS = [
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
    // Breathing room between the comment text and the icon, so
    // the icon doesn't visually attach to the last word.
    "  margin-left: 6px;",
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
    ".virtualized-table-header .cell-icon",
    "  .icon-bg[style*=\"universal/annotate-highlight.svg\"] {",
    "  -moz-context-properties: fill, fill-opacity;",
    "  fill: var(--tag-yellow);",
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
    // URL hover tooltip (items-tree only — other surfaces use the
    // native title-attribute tooltip). Mozilla/Zotero classic look:
    // pale cream background, light gray border, system menu font.
    // Dark-mode variant uses Zotero's UI-theme class so it flips
    // with the rest of the UI rather than tracking OS color scheme.
    ".wv-url-tooltip {",
    "  position: fixed;",
    // Tooltip sits ABOVE the right-click menu (.wv-url-menu, z-index
    // 1000001) so when the suppression class lifts on first mousemove,
    // the tooltip renders in front of the still-open menu rather than
    // peeking out from behind it.
    "  z-index: 1000002;",
    "  background: #fffae8;",
    "  color: #000;",
    "  border: 1px solid rgba(0, 0, 0, 0.5);",
    "  border-radius: 2px;",
    "  padding: 3px 7px;",
    "  font: menu;",
    "  font-size: 12px;",
    "  line-height: 1.4;",
    "  max-width: 700px;",
    "  white-space: nowrap;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  pointer-events: none;",
    "  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);",
    "}",
    ":root.wv-ui-dark .wv-url-tooltip {",
    "  background: #2b2b2b;",
    "  color: #fff;",
    "  border: 1px solid rgba(255, 255, 255, 0.6);",
    "  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);",
    "}",
    // OS-level dark mode backstop: if the user has an OS-dark theme
    // and our `wv-ui-dark` class hasn't been applied (e.g. detection
    // race during init), still render a dark tooltip rather than a
    // jarring cream box on a dark UI.
    "@media (prefers-color-scheme: dark) {",
    "  .wv-url-tooltip {",
    "    background: #2b2b2b;",
    "    color: #fff;",
    "    border: 1px solid rgba(255, 255, 255, 0.6);",
    "    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);",
    "  }",
    "}",
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
    ":root.wv-context-menu-open .wv-url-tooltip {",
    "  display: none !important;",
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
].join("\n");

// ===========================================================================

class WeaveroPlugin {

    INVISIBLE_RE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;
    TRAILING_RE  = /[.,;:!?)\]\}>'"`]+$/;

    /** Source string for the alternation between the always-on schemes
     *  (`https?://`, `zotero://`) and any user-enabled extra schemes
     *  from `URL_SCHEMES`. Cached on the instance and invalidated by
     *  the pref observer when an `enable*Scheme` toggle changes.
     *  Returned WITHOUT outer parentheses or body suffix so callers
     *  that build their own combined regex (e.g. the markdown TOKEN
     *  regex) can drop it in directly. */
    get URL_SCHEME_ALT() {
        if (this._urlSchemeAltCache) return this._urlSchemeAltCache;
        const parts = ["https?:\\/\\/", "zotero:\\/\\/"];
        // Master "App links" toggle gates ALL URL_SCHEMES \u2014 when off,
        // even ticked individual schemes don't render. This lets the
        // user opt out of every non-web scheme with one click.
        let appLinksOn = false;
        try { appLinksOn = !!Zotero.Prefs.get("weavero.enableAppLinks"); }
        catch (e) {}
        if (appLinksOn) {
            for (const def of URL_SCHEMES) {
                try {
                    if (Zotero.Prefs.get("weavero." + def.pref)) {
                        // Scheme names are alphanumeric only \u2014 no regex
                        // metachars to escape. Convert `/` in `sep` to
                        // `\/` for embedding in a regex source string.
                        parts.push(def.name + def.sep.replace(/\//g, "\\/"));
                    }
                } catch (e) {}
            }
        }
        this._urlSchemeAltCache = parts.join("|");
        return this._urlSchemeAltCache;
    }

    /** Single-match regex for a URL in plain text. The body class
     *  `[^\s<>"')\]]+` stops at whitespace and the punctuation that's
     *  most commonly trailing punctuation. Cached and invalidated
     *  with `URL_SCHEME_ALT`. */
    get URL_REGEX() {
        if (this._urlRegexCache) return this._urlRegexCache;
        this._urlRegexCache = new RegExp(
            "(" + this.URL_SCHEME_ALT + ")[^\\s<>\"')\\]]*");
        return this._urlRegexCache;
    }

    /** Classify a URL into one of three CSS class buckets so each kind
     *  is colour-coded distinctly across all surfaces:
     *    `wv-link-http`   — http(s)://… (default web links, blue)
     *    `wv-link-zotero` — zotero://…  (Zotero deep links, orange)
     *    `wv-link-app`    — anything else (mailto:, obsidian://,
     *                       slack://, …) — the user-enabled
     *                       App-link schemes, purple. */
    _urlLinkClass(url) {
        if (!url) return "wv-link-http";
        if (url.startsWith("zotero://")) return "wv-link-zotero";
        if (/^https?:\/\//i.test(url))   return "wv-link-http";
        return "wv-link-app";
    }

    /** Launch a URL the way Zotero would — with a fast no-prompt path
     *  for app-link schemes (mailto:, obsidian://, slack://, …) gated
     *  on the user's `enableAppLinksSkipConfirm` preference.
     *
     *  When skip-confirm is OFF (default): fall through to
     *  `Zotero.launchURL`, which goes through `svc.loadURI` → OS
     *  dispatch → Firefox's "Open with…" prompt. The user gets the
     *  safety dialog they expect.
     *
     *  When skip-confirm is ON: call `handlerInfo.launchWithURI`
     *  directly on the user-stored handler info. This bypasses the
     *  prompt entirely. We use the user-stored variant
     *  (`getProtocolHandlerInfo`, not `…FromOS`) so the
     *  `alwaysAskBeforeHandling` / `preferredAction` overrides set
     *  by `_applyAppLinkConfirmPref` are honored. */
    _launchURL(url) {
        if (!url) return;
        try {
            // zotero:// URLs must NOT go through the OS dispatch
            // (which would trigger Firefox's "Allow this site to open
            // the zotero link with Zotero?" prompt). Route them
            // through our internal handler that knows how to dispatch
            // zotero://select / zotero://open / zotero://note paths
            // directly into ZoteroPane / Reader / openNote.
            if (url.startsWith("zotero://")) {
                this.handleZoteroURI(url);
                return;
            }
            const cls = this._urlLinkClass(url);
            if (cls === "wv-link-app") {
                let skip = false;
                try { skip = !!Zotero.Prefs.get(
                    "weavero.enableAppLinksSkipConfirm"); }
                catch (e) {}
                if (skip) {
                    const m = /^([a-z][a-z0-9+.-]+):/i.exec(url);
                    const scheme = m && m[1].toLowerCase();
                    if (scheme) {
                        const svc = Components.classes[
                            "@mozilla.org/uriloader/external-protocol-service;1"]
                            .getService(Components.interfaces.nsIExternalProtocolService);
                        const handlerInfo = svc.getProtocolHandlerInfo(scheme);
                        if (handlerInfo) {
                            const uri = Services.io.newURI(url, null, null);
                            handlerInfo.launchWithURI(uri, null);
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _launchURL direct err: " + e);
            // fall through
        }
        try { Zotero.launchURL(url); }
        catch (e) { Zotero.debug("[Weavero] _launchURL fallback err: " + e); }
    }

    /** Sync the per-scheme `network.protocol-handler.warn-external.<x>`
     *  Firefox prefs to match the user's "Open without confirmation"
     *  choice. When the master is on AND a scheme is enabled, set the
     *  per-scheme warn-external pref to FALSE — clicks open the app
     *  directly with no prompt. Otherwise CLEAR our override so the
     *  default behaviour (prompt) returns.
     *
     *  Called at init() and from the pref observer whenever any of:
     *    - weavero.enableAppLinks
     *    - weavero.enableAppLinksSkipConfirm
     *    - weavero.enable*Scheme
     *  changes. Idempotent — re-applying yields the same prefs.
     *
     *  We use `clearUserPref` to revert (instead of writing `true`)
     *  so the user's profile stays clean and the system default
     *  (`network.protocol-handler.warn-external-default = true`)
     *  takes effect for any scheme we don't manage. */
    _applyAppLinkConfirmPref() {
        try {
            const masterAppLinks = !!Zotero.Prefs.get("weavero.enableAppLinks");
            const skip = !!Zotero.Prefs.get("weavero.enableAppLinksSkipConfirm");

            // Modern Firefox shows TWO different dialogs depending on
            // the scheme + how it's registered:
            //   1. A simple "warn external" prompt — controlled by
            //      `network.protocol-handler.warn-external.<scheme>`.
            //   2. An app-picker prompt with a "Choose a different
            //      application" link — controlled by the handler
            //      service's `alwaysAskBeforeHandling` flag.
            // Skipping needs BOTH to be set. We touch the pref AND the
            // handler info per scheme; either one alone leaves the
            // user with a prompt for many real-world schemes.
            let externalSvc = null, handlerSvc = null;
            try {
                externalSvc = Components.classes[
                    "@mozilla.org/uriloader/external-protocol-service;1"]
                    .getService(Components.interfaces.nsIExternalProtocolService);
                handlerSvc = Components.classes[
                    "@mozilla.org/uriloader/handler-service;1"]
                    .getService(Components.interfaces.nsIHandlerService);
            } catch (e) {
                Zotero.debug("[Weavero] handler-svc unavailable: " + e);
            }

            for (const def of URL_SCHEMES) {
                const prefName = "network.protocol-handler.warn-external." + def.name;
                let enabledThis = false;
                try { enabledThis = !!Zotero.Prefs.get("weavero." + def.pref); }
                catch (e) {}
                const shouldSkip = masterAppLinks && skip && enabledThis;

                // ---- (1) warn-external pref ------------------------------
                try {
                    if (shouldSkip) {
                        Services.prefs.setBoolPref(prefName, false);
                    } else if (Services.prefs.prefHasUserValue(prefName)) {
                        // Only clear if the override is our own FALSE —
                        // never clobber an explicit TRUE the user may
                        // have set themselves.
                        const cur = Services.prefs.getBoolPref(prefName, true);
                        if (cur === false) Services.prefs.clearUserPref(prefName);
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] warn-external sync ("
                        + def.name + ") err: " + e);
                }

                // ---- (2) handler service ---------------------------------
                if (!externalSvc || !handlerSvc) continue;
                try {
                    const handlerInfo = externalSvc.getProtocolHandlerInfo(def.name);
                    if (!handlerInfo) continue;
                    if (shouldSkip) {
                        handlerInfo.alwaysAskBeforeHandling = false;
                        handlerInfo.preferredAction =
                            Components.interfaces.nsIHandlerInfo.useSystemDefault;
                    } else {
                        // Restore the safe default: ask before
                        // handling. We don't try to remember whatever
                        // value was there before — the safe behaviour
                        // is to ask, which matches Firefox's default
                        // for any scheme the user hasn't customised.
                        handlerInfo.alwaysAskBeforeHandling = true;
                    }
                    handlerSvc.store(handlerInfo);
                } catch (e) {
                    Zotero.debug("[Weavero] handler-svc sync ("
                        + def.name + ") err: " + e);
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _applyAppLinkConfirmPref err: " + e);
        }
    }

    constructor() {
        this._readerObservers = new WeakMap();
        this._notifierIDs     = [];
        this._pollInterval    = null;
        this._treeObserver    = null;
        this._treeScanTimer   = null;
        this._paneObserver    = null;
        // Keys we just removed via the delete notifier. The debounced
        // _processNoteAnnotationOverlays scan that fires ~100 ms later
        // calls attachment.getAnnotations(); if Zotero's in-memory cache
        // hasn't settled yet, that call still returns the deleted
        // annotation and the badge gets recreated. We exclude these keys
        // from wantList for ~2 s, by which time the cache has caught up.
        // Map<key, timestamp>.
        this._recentlyDeletedKeys = new Map();
    }

    // ---- Utilities --------------------------------------------------------

    normalize(t) { return t ? String(t).replace(this.INVISIBLE_RE, "") : ""; }
    hasURI(t)    { return !!t && this.URL_REGEX.test(this.normalize(t)); }

    /** Detect Mozilla "dead wrappers" — JS handles to XPCOM objects whose
     *  underlying native object has been destroyed. Common when our
     *  setTimeout / MutationObserver callbacks capture references to
     *  reader windows that the user then closes; accessing any property
     *  on a dead wrapper throws "TypeError: can't access dead object".
     *
     *  Use as a guard at the entry of any callback that holds onto an
     *  element/window/document captured from a closure that may outlive
     *  its target. Returns false if the platform API isn't available
     *  (better to attempt access than to abort everything).
     *
     *  Reference: https://firefox-source-docs.mozilla.org/js/index.html#dead-wrappers */
    _isDead(obj) {
        try {
            if (typeof ChromeUtils !== "undefined" && ChromeUtils.isDeadWrapper) {
                return ChromeUtils.isDeadWrapper(obj);
            }
            if (typeof Components !== "undefined"
                && Components.utils && Components.utils.isDeadWrapper) {
                return Components.utils.isDeadWrapper(obj);
            }
        } catch(e) {}
        return false;
    }
    /** Markdown marks that the popup renders. Cheap regex; runs only on
     * comments that already failed the hasURI fast path. */
    MD_REGEX = /(\*\*[\s\S]+?\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*|~~[\s\S]+?~~|`[^`\n]+?`|\[[^\]\n]+?\]\([^)\s]+\))/;
    /** Layout / rendering predicate: does this comment have any URL or
     *  markdown content that the popup or inline renderer would format?
     *  NOT a mode-aware icon-show predicate — for that, see _iconWantedFor.
     *
     *  Used to gate the items-tree CSS flex layout (the data-has-rich
     *  attribute) and to short-circuit the right-pane render path when a
     *  comment is plain text. Stays a static union of URL ∨ markdown
     *  because the layout/render setup is needed in both display modes.
     */
    _commentHasIconableContent(t) {
        if (!t) return false;
        const n = this.normalize(t);
        if (this.URL_REGEX.test(n)) return true;
        return this._anyMarkdownEnabled() && this.MD_REGEX.test(n);
    }

    /** Mode-aware icon-show predicate: should we attach a chain icon to a
     *  comment with this text? Used by every surface that decides whether
     *  to render the icon (right pane, reader sidebar, in-PDF popup,
     *  canvas badges, text annotation buttons, items-tree overflow).
     *
     *  Inline mode (inlineLinks=true): byte-equivalent to legacy behaviour.
     *    Only URL-bearing comments get the icon — markdown is rendered
     *    in place so doesn't need a separate indicator.
     *
     *  Icon & Popup mode (inlineLinks=false): the popup is the only access
     *    path to formatted content. Each content type has its own sub-toggle
     *    (enableIconUrls / enableIconMarkdown / enableIconAppLinks); the
     *    icon shows when ANY enabled type is present in the comment.
     *    URLs are classified per-match via matchAll: a comment containing
     *    BOTH http://… and mailto:… triggers the icon if EITHER toggle is on.
     *
     *  Master gates still apply: enableAppLinks=false strips app schemes
     *  from URL_REGEX entirely, so enableIconAppLinks becomes a no-op when
     *  the master is off. _anyMarkdownEnabled() must also be true for the
     *  markdown branch to fire. */
    _iconWantedFor(t) {
        if (!t) return false;
        const n = this.normalize(t);

        if (this._getInlineLinks()) {
            // Inline mode: byte-equivalent to the old _shouldShowIcon.
            return this.URL_REGEX.test(n);
        }

        // Icon & Popup mode: classify URL matches and gate per sub-toggle.
        if (this.URL_REGEX.test(n)) {
            // Mixed-content comments (e.g. http://… + mailto:…) should
            // pass if EITHER sub-toggle is on. Iterate matches via
            // matchAll to classify each one — a whole-string starts-with
            // check would misclassify embedded URLs.
            const re = new RegExp(this.URL_REGEX.source, "gi");
            let hasHttpOrZotero = false, hasAppLink = false;
            for (const m of n.matchAll(re)) {
                if (/^(https?|zotero):/i.test(m[0])) hasHttpOrZotero = true;
                else hasAppLink = true;
                if (hasHttpOrZotero && hasAppLink) break;
            }
            if (hasHttpOrZotero && this._getEnableIconUrls()) return true;
            if (hasAppLink && this._getEnableIconAppLinks()) return true;
        }

        if (this._getEnableIconMarkdown()
            && this._anyMarkdownEnabled()
            && this.MD_REGEX.test(n)) {
            return true;
        }

        return false;
    }

    /** Returns true if a popup-access icon (the 🔗 / M button) on a comment
     *  would add value beyond what's already rendered inline on the surface.
     *  Used by the right pane, reader sidebar, and reader popup so that all
     *  three surfaces hide the icon when its only purpose has been satisfied
     *  by inline rendering. The items list uses CSS-based visibility driven
     *  by :root classes (wv-icons-only, wv-md-disabled, wv-show-tree-icon)
     *  which encodes the same logic.
     *
     *  Returns true when:
     *    - icons-only mode (Mode 2): inline rendering is off; icon is the
     *      only access path to view comment formatting.
     *    - markdown is in the comment but inline comment-markdown rendering
     *      is disabled: the popup is the only place markdown shows formatted.
     *  Returns false when:
     *    - inline mode + markdown-render enabled: the inline view shows
     *      everything; the icon would clutter without adding value (overflow
     *      is the caller's concern via direct scrollHeight checks).
     *    - URL-only inline mode: URLs are clickable inline. */
    _iconAddsValueBeyondInline(t) {
        if (!this._getInlineLinks()) return true; // Mode 2 — only access path.
        const n = this.normalize(t || "");
        // Markdown present but inline-md sub-toggle off: popup is the only
        // path to the formatted view.
        if (!this._getEnableCommentMarkdown()
            && this._anyMarkdownEnabled()
            && this.MD_REGEX.test(n)) {
            return true;
        }
        // URL present but inline-URLs sub-toggle off: popup is the only
        // path to a clickable URL.
        if (!this._getEnableInlineUrls() && this.URL_REGEX.test(n)) {
            return true;
        }
        return false;
    }

    /** Build the inline Lucide-style chain SVG used as the link glyph.
     *  Created via createElementNS so it works in XHTML chrome documents
     *  and in the PDF.js inner iframe alike. The icon inherits its color
     *  from `currentColor`, so it picks up the surrounding text color
     *  (or the amber-disc override for type-3 icons). Sized to 1em so it
     *  scales with the icon container's font-size. */
    /** Build the URL/link icon — Weavero's needle logo, drawn
     *  programmatically here to match the source SVG that the
     *  rasterizer uses for the manifest / pref-pane PNGs.
     *  Used as the visual marker on annotation comments and other
     *  URL-bearing surfaces.
     *
     *  Theme-aware: the badge picks the LIGHT or DARK colour set
     *  based on `_detectUIDark()` at render time. Light = deep
     *  blue needle / black chain + thread; dark = lighter blue
     *  needle / white chain + thread.
     *
     *  The source SVG uses two `<clipPath>` overlays for a "woven"
     *  effect at large sizes; we skip them here because the
     *  clip-path IDs would collide when multiple badges render on
     *  the same page, and at the 16-px size this icon is most
     *  often used the woven detail isn't legible anyway. */
    _makeLinkSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-link-svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");

        // Theme detection per-doc, NOT per-UI:
        //  - Inner reader iframe (in-page badges) carries
        //    `wv-reader-dark` on its documentElement when the
        //    rendered PDF page is dark (`_applyDynamicReaderTheme`
        //    sets it from the page background luma). That's the
        //    right signal here — the badge sits on the page, not
        //    on the chrome.
        //  - Chrome doc + outer reader iframe carry `wv-ui-dark`
        //    when Zotero's UI is dark. That's the right signal
        //    for surfaces that follow the UI theme (items tree,
        //    right pane, reader sidebar).
        //  - If neither class is set yet (rare race during init),
        //    default to the light variant.
        const isDark = (() => {
            try {
                const root = doc && doc.documentElement;
                const cl = root && root.classList;
                if (cl) {
                    if (cl.contains("wv-reader-dark")) return true;
                    if (cl.contains("wv-ui-dark")) return true;
                }
            } catch (e) {}
            return false;
        })();
        const bodyColor  = isDark ? "#8ab4f8" : "#253c97";
        const chainColor = isDark ? "#ffffff" : "#000000";
        const threadColor = chainColor;

        const path = (attrs) => {
            const p = doc.createElementNS(NS, "path");
            for (const [k, v] of Object.entries(attrs)) {
                p.setAttribute(k, v);
            }
            return p;
        };
        const ellipse = (attrs) => {
            const e = doc.createElementNS(NS, "ellipse");
            for (const [k, v] of Object.entries(attrs)) {
                e.setAttribute(k, v);
            }
            return e;
        };

        // Eye outline (blue stroke ellipse).
        svg.appendChild(ellipse({
            cx: "18.52", cy: "18.52", rx: "1.5", ry: "2.78",
            transform: "translate(-7.67 18.52) rotate(-45)",
            fill: "none", stroke: bodyColor,
            "stroke-miterlimit": "10",
        }));
        // Needle body (blue fill).
        svg.appendChild(path({
            d: "M0,0c4.92,3.42,8.62,8.25,12.97,12.33.79.71,2.39"
                + ",2.54,3.42,2.9.47.24.93.48,1.49.61l-2.05,2.05"
                + "c-.31-1.03-.77-1.99-1.44-2.78,0,0-2.08-2.14"
                + "-2.08-2.14C8.25,8.62,3.42,4.92,0,0h0Z",
            fill: bodyColor,
        }));
        // Thread waves at the bottom (stroke only, default 1px).
        svg.appendChild(path({
            d: "M12.63,18.34c1.04,3.94,1.89,5.05,2.54,5.03"
                + ",1.39-.03,1.95-5.04,3.34-5.04,1.4,0,2.04,5.08"
                + ",3.15,5.04.46-.02,1.08-.91,1.71-5.04",
            fill: "none", stroke: threadColor,
            "stroke-linecap": "round",
            "stroke-miterlimit": "10",
        }));
        // Chain link 1 (top-right curve).
        svg.appendChild(path({
            d: "M10,12.76c1.65,2.21,4.79,2.66,7,1.01.19-.14.37"
                + "-.3.54-.47l3-3c1.92-1.99,1.86-5.15-.12-7.07"
                + "-1.94-1.87-5.01-1.87-6.95,0l-1.72,1.71",
            fill: "none", stroke: chainColor,
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }));
        // Chain link 2 (bottom-left curve).
        svg.appendChild(path({
            d: "M14,10.76c-1.65-2.21-4.79-2.66-7-1.01-.19.14"
                + "-.37.3-.54.47l-3,3c-1.92,1.99-1.86,5.15.12,7.07"
                + ",1.94,1.87,5.01,1.87,6.95,0l1.71-1.71",
            fill: "none", stroke: chainColor,
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }));
        return svg;
    }

    /** Build the inline relations SVG — same path as upstream Zotero's
     *  `chrome://zotero/skin/16/universal/related.svg`, but with
     *  `fill="currentColor"` so we can colour it from CSS instead of
     *  needing the chrome-only `context-fill` keyword. Used in the
     *  annotation-header relations icon button (and matches the icon
     *  Zotero shows in the item pane's Related section). */
    _makeRelationsSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-relations-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("aria-hidden", "true");
        const p = doc.createElementNS(NS, "path");
        p.setAttribute("fill", "currentColor");
        p.setAttribute("d",
            "M12.5 13H8.5C7.57174 13 6.6815 12.6313 6.02513 11.9749"
            + "C5.36875 11.3185 5 10.4283 5 9.5C5 8.57174 5.36875 7.6815 6.02513 7.02513"
            + "C6.6815 6.36875 7.57174 6 8.5 6H8.908C9.03111 6.32197 9.03111 6.67803 8.908 7"
            + "H8.5C7.83696 7 7.20107 7.26339 6.73223 7.73223C6.26339 8.20107 6 8.83696 6 9.5"
            + "C6 10.163 6.26339 10.7989 6.73223 11.2678C7.20107 11.7366 7.83696 12 8.5 12"
            + "H12.5C13.163 12 13.7989 11.7366 14.2678 11.2678C14.7366 10.7989 15 10.163 15 9.5"
            + "C15 8.83696 14.7366 8.20107 14.2678 7.73223C13.7989 7.26339 13.163 7 12.5 7"
            + "H11.953C11.9778 6.83432 11.9935 6.6674 12 6.5C11.9935 6.3326 11.9778 6.16568 11.953 6"
            + "H12.5C13.4283 6 14.3185 6.36875 14.9749 7.02513C15.6313 7.6815 16 8.57174 16 9.5"
            + "C16 10.4283 15.6313 11.3185 14.9749 11.9749C14.3185 12.6313 13.4283 13 12.5 13Z"
            + "M0 6.5C0 7.42826 0.368749 8.3185 1.02513 8.97487C1.6815 9.63125 2.57174 10 3.5 10"
            + "H4.047C4.02219 9.83432 4.0065 9.6674 4 9.5C4.0065 9.3326 4.02219 9.16568 4.047 9"
            + "H3.5C2.83696 9 2.20107 8.73661 1.73223 8.26777C1.26339 7.79893 1 7.16304 1 6.5"
            + "C1 5.83696 1.26339 5.20107 1.73223 4.73223C2.20107 4.26339 2.83696 4 3.5 4"
            + "H7.5C8.16304 4 8.79893 4.26339 9.26777 4.73223C9.73661 5.20107 10 5.83696 10 6.5"
            + "C10 7.16304 9.73661 7.79893 9.26777 8.26777C8.79893 8.73661 8.16304 9 7.5 9"
            + "H7.092C6.96889 9.32197 6.96889 9.67803 7.092 10H7.5C8.42826 10 9.3185 9.63125 9.97487 8.97487"
            + "C10.6313 8.3185 11 7.42826 11 6.5C11 5.57174 10.6313 4.6815 9.97487 4.02513"
            + "C9.3185 3.36875 8.42826 3 7.5 3H3.5C2.57174 3 1.6815 3.36875 1.02513 4.02513"
            + "C0.368749 4.6815 0 5.57174 0 6.5Z");
        svg.appendChild(p);
        return svg;
    }

    /** Stamp data-has-url on an icon element and (re)populate it with
     *  the chain SVG when the comment has a URL. Markdown-only comments
     *  no longer get a dedicated icon — markdown formatting is still
     *  rendered inline, but the historic amber-disc / "M" letter
     *  decoration is gone. */
    _applyIconState(el, comment) {
        if (!el || !comment) return;
        const n = this.normalize(comment);
        const hasUrl = this.URL_REGEX.test(n);
        if (hasUrl) el.setAttribute("data-has-url", "true");
        else el.removeAttribute("data-has-url");
        if (hasUrl) el.classList.add("wv-has-url");
        else el.classList.remove("wv-has-url");

        const tooltip = "Comment popup";
        if (el.title !== tooltip) el.title = tooltip;

        const existingSvg = el.querySelector(".wv-link-svg");
        if (hasUrl) {
            if (!existingSvg) {
                while (el.firstChild) el.removeChild(el.firstChild);
                el.appendChild(this._makeLinkSvg(el.ownerDocument));
            }
        } else if (existingSvg || (el.textContent && el.textContent.length)) {
            while (el.firstChild) el.removeChild(el.firstChild);
        }
    }

    /** Extract all <a href> links from a DOM element. */
    collectAnchorURLs(el) {
        if (!el || !el.querySelectorAll) return [];
        return [...el.querySelectorAll("a[href]")]
            .map(a => a.getAttribute("href"))
            .filter(h => h && /^(https?:|zotero:)/i.test(h));
    }

    /** Walk an element and produce text with "\n" inserted at every <br>,
     *  <p>, and <div> boundary. textContent silently drops <br> separators
     *  so a Zotero-rendered multi-line comment ("line 1<br>line 2") reads as
     *  "line 1line 2", which (a) collapses the visual break and (b) lets the
     *  URL regex (which terminates at \s) eat into the next line when a URL
     *  sits at end-of-line. Reading via this helper preserves the line
     *  structure as the user authored it. */
    _readCommentTextWithBreaks(el) {
        if (!el) return "";
        const out = [];
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3 /* TEXT_NODE */) {
                out.push(node.nodeValue || "");
                return;
            }
            if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
            const tag = (node.tagName || "").toUpperCase();
            if (tag === "BR") {
                out.push("\n");
                return;
            }
            const isBlock = (tag === "P" || tag === "DIV");
            if (isBlock && out.length && !out[out.length - 1].endsWith("\n")) {
                out.push("\n");
            }
            for (const c of node.childNodes) walk(c);
            if (isBlock && out.length && !out[out.length - 1].endsWith("\n")) {
                out.push("\n");
            }
        };
        for (const c of el.childNodes) walk(c);
        return out.join("");
    }

    /** Always read comment text from Zotero's data model, not the DOM. */
    getModelComment(libraryID, annotationKey) {
        if (!annotationKey) return null;
        try {
            const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
            if (item && item.isAnnotation && item.isAnnotation())
                return item.annotationComment || "";
        } catch (e) {
            Zotero.debug("[Weavero] getModelComment error: " + e.message);
        }
        return null;
    }

    libraryIDFromReader(reader) {
        return (reader && reader._item)
            ? reader._item.libraryID
            : Zotero.Libraries.userLibraryID;
    }

    /** Resolve an annotation item from the (libraryID, key) pair the
     *  reader exposes. Returns null when nothing matches or the lookup
     *  throws (deleted-since, wrong library, etc.). */
    _getAnnotationItem(libraryID, annotationKey) {
        if (!annotationKey) return null;
        try {
            const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
            if (item && item.isAnnotation && item.isAnnotation()) return item;
        } catch (e) {
            Zotero.debug("[Weavero] _getAnnotationItem error: " + e.message);
        }
        return null;
    }

    /** Return the related items of an annotation. Annotations are first-
     *  class items in Zotero's data model and `dc:relation` triples are
     *  stored on them just like any other item, even though the upstream
     *  UI doesn't expose a relations pane for annotations — that gap is
     *  exactly what this feature fills.
     *
     *  Returns an empty array on any failure or when there are no
     *  relations, so callers can use `.length` directly. */
    _getAnnotationRelatedItems(annotationItem) {
        if (!annotationItem) return [];
        try {
            const keys = annotationItem.relatedItems || [];
            if (!keys.length) return [];
            const lib = annotationItem.libraryID;
            const out = [];
            for (const k of keys) {
                try {
                    const it = Zotero.Items.getByLibraryAndKey(lib, k);
                    if (it) out.push(it);
                } catch (e) {}
            }
            return out;
        } catch (e) {
            Zotero.debug("[Weavero] _getAnnotationRelatedItems error: " + e.message);
            return [];
        }
    }

    /** Mirror upstream relatedBox.js's `_handleShowItem`: select the
     *  target item in the library pane, switch to the main Zotero tab
     *  (so the selection becomes visible if the user is currently in
     *  a reader tab), and focus the window. Annotations as the target
     *  resolve to their parent attachment selection — `selectItem`
     *  handles that path inside ZoteroPane. */
    _navigateToItem(item) {
        if (!item) return;
        try {
            const win = Zotero.getMainWindow();
            if (!win) return;
            if (win.ZoteroPane && typeof win.ZoteroPane.selectItem === "function") {
                win.ZoteroPane.selectItem(item.id);
            }
            if (win.Zotero_Tabs && typeof win.Zotero_Tabs.select === "function") {
                win.Zotero_Tabs.select("zotero-pane");
            }
            win.focus();
        } catch (e) {
            Zotero.debug("[Weavero] _navigateToItem error: " + e.message);
        }
    }

    /** Wire a contextmenu listener on the given `<annotation-row>` so
     *  right-clicking the row opens the same type-aware menu that the
     *  related-box rows use (Open in Reader, Show in Library, Copy
     *  Item Link, etc.). Resolves the underlying Zotero.Item from the
     *  row's `annotation-id` attribute (set by upstream's
     *  AnnotationRow custom element — see annotationRow.js:64).
     *  Idempotent via a dataset flag so repeat scans don't stack
     *  duplicate listeners. */
    _wireAnnotationRowContextMenu(row) {
        if (!row || !row.dataset) return;
        if (row.dataset.wvCtxWired === "1") return;
        try {
            const handler = (e) => {
                try {
                    const idStr = row.getAttribute("annotation-id");
                    const id = idStr ? parseInt(idStr, 10) : NaN;
                    if (!Number.isFinite(id)) return;
                    const item = Zotero.Items.get(id);
                    if (!item) return;
                    e.preventDefault();
                    e.stopPropagation();
                    // Right-pane annotation-rows already live inside the
                    // library view; "Show in Library" would just jump
                    // the items list to the same place the user is
                    // already looking at, so skip it here.
                    this._openRelatedItemContextMenu(
                        item, e.screenX, e.screenY,
                        { skipShowInLibrary: true });
                } catch (err) {
                    Zotero.debug("[Weavero] pane row ctx err: " + err);
                }
            };
            row.addEventListener("contextmenu", handler);
            row.dataset.wvCtxWired = "1";
        } catch (e) {
            Zotero.debug("[Weavero] _wireAnnotationRowContextMenu err: " + e);
        }
    }

    /** Right-click context menu for a related item (used from the
     *  Weavero relations popup, the right-pane Related section, and
     *  right-pane annotation rows). Builds a fresh chrome XUL
     *  `menupopup` per open with all open options that apply to the
     *  item's type, opens it at the given screen coordinates, and
     *  removes itself on `popuphidden`.
     *
     *  Options listed (filtered by type at build time):
     *    Annotation        Open in Reader
     *    Attachment        Open in Reader / Open in New Window / Show File
     *    Note              Open Note
     *    Regular Item      Open Primary Attachment
     *    All               Show in Library (unless opts.skipShowInLibrary),
     *                       Show Parent in Library (if has parent),
     *                       Copy Item Link
     *
     *  `opts.skipShowInLibrary`: omit the "Show in Library" entry —
     *  used by the right-pane annotation-row wiring where the user
     *  is already viewing the library and the entry would just
     *  jump them around.
     */
    _openRelatedItemContextMenu(item, screenX, screenY, opts) {
        opts = opts || {};
        if (!item) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const popupset = doc.getElementById("zotero-pane-popupset")
            || doc.documentElement;

        const oldPopup = doc.getElementById("wv-related-item-menu");
        if (oldPopup) {
            try { oldPopup.remove(); } catch(e) {}
        }
        const popup = doc.createXULElement("menupopup");
        popup.id = "wv-related-item-menu";

        const append = (label, onCommand, opts) => {
            opts = opts || {};
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            if (opts.iconURL) {
                mi.classList.add("menuitem-iconic");
                mi.setAttribute("image", opts.iconURL);
            }
            if (opts.disabled) mi.setAttribute("disabled", "true");
            mi.addEventListener("command", () => {
                try { onCommand(); }
                catch (e) {
                    Zotero.debug("[Weavero] rel-ctx cmd err: " + e);
                }
            });
            popup.appendChild(mi);
        };
        const addSep = () => {
            popup.appendChild(doc.createXULElement("menuseparator"));
        };

        const isAnnotation = !!(item.isAnnotation && item.isAnnotation());
        const isAttachment = !!(item.isAttachment && item.isAttachment());
        const isNote       = !!(item.isNote       && item.isNote());
        const isRegular    = !!(item.isRegularItem && item.isRegularItem());
        let attachmentFilePath = null;
        if (isAttachment) {
            try { attachmentFilePath = item.getFilePathSync && item.getFilePathSync(); }
            catch (e) {}
        }
        // Resolve a "primary attachment" for regular items. Sync
        // walk through attachments — first one with an
        // `attachmentReaderType` (pdf/epub/snapshot) wins, mirroring
        // the criteria Zotero's `_getFirstUsableItem` applies to
        // pick the attachment to open.
        let primaryAttachment = null;
        if (isRegular) {
            try {
                const attIDs = item.getAttachments && item.getAttachments() || [];
                for (const id of attIDs) {
                    const att = Zotero.Items.get(id);
                    if (!att || !att.isAttachment()) continue;
                    if (att.attachmentReaderType
                            && att.attachmentLinkMode !==
                                Zotero.Attachments.LINK_MODE_LINKED_URL) {
                        primaryAttachment = att;
                        break;
                    }
                }
            } catch (e) {}
        }

        // ---- Type-specific open actions -------------------------------------
        // Icon strategy mirrors Zotero's locateMenu `ViewItem`:
        // when we know the attachment/note type, use the colored
        // item-type icon (red PDF, green snapshot, blue EPUB, …)
        // for the Open-in-Tab/Window rows. Otherwise fall back to
        // the generic universal `new-tab` / `new-window` glyphs.
        // Other actions use Zotero's universal 16px SVG set with
        // names taken from the `$menu-icons` SCSS map (e.g.
        // show-in-library → `library`, view-online → `globe`).
        const isDark = !!(doc.documentElement
            && doc.documentElement.classList.contains("wv-ui-dark"));
        const theme = isDark ? "dark" : "light";
        const ICON_NEW_TAB    = "chrome://zotero/skin/16/universal/new-tab.svg";
        const ICON_NEW_WINDOW = "chrome://zotero/skin/16/universal/new-window.svg";
        const ICON_GLOBE      = "chrome://zotero/skin/16/universal/globe.svg";
        const ICON_FOLDER     = "chrome://zotero/skin/16/universal/folder-open.svg";
        const ICON_LIBRARY    = "chrome://zotero/skin/16/universal/library.svg";
        // Same amber-brown as every other chain icon in the plugin
        // (items list `.wv-tree-rel-icon`, sidebar `.wv-btn-relations`,
        // PDF reader marker badge, context-menu "Add related item…"),
        // so the menuitem reads as part of one consistent affordance.
        // Used for the "Add Related…" entry below.
        const linkSvgFill = isDark ? "#ffb84d" : "#7a4a00";
        const linkSvgPath = "M12.5 13H8.5C7.57174 13 6.6815 12.6313 6.02513"
            + " 11.9749C5.36875 11.3185 5 10.4283 5 9.5C5 8.57174 5.36875"
            + " 7.6815 6.02513 7.02513C6.6815 6.36875 7.57174 6 8.5 6H8.908"
            + "C9.03111 6.32197 9.03111 6.67803 8.908 7H8.5C7.83696 7 7.20107"
            + " 7.26339 6.73223 7.73223C6.26339 8.20107 6 8.83696 6 9.5"
            + "C6 10.163 6.26339 10.7989 6.73223 11.2678C7.20107 11.7366"
            + " 7.83696 12 8.5 12H12.5C13.163 12 13.7989 11.7366 14.2678"
            + " 11.2678C14.7366 10.7989 15 10.163 15 9.5C15 8.83696 14.7366"
            + " 8.20107 14.2678 7.73223C13.7989 7.26339 13.163 7 12.5 7H11.953"
            + "C11.9778 6.83432 11.9935 6.6674 12 6.5C11.9935 6.3326 11.9778"
            + " 6.16568 11.953 6H12.5C13.4283 6 14.3185 6.36875 14.9749"
            + " 7.02513C15.6313 7.6815 16 8.57174 16 9.5C16 10.4283 15.6313"
            + " 11.3185 14.9749 11.9749C14.3185 12.6313 13.4283 13 12.5 13Z"
            + "M0 6.5C0 7.42826 0.368749 8.3185 1.02513 8.97487C1.6815 9.63125"
            + " 2.57174 10 3.5 10H4.047C4.02219 9.83432 4.0065 9.6674 4 9.5"
            + "C4.0065 9.3326 4.02219 9.16568 4.047 9H3.5C2.83696 9 2.20107"
            + " 8.73661 1.73223 8.26777C1.26339 7.79893 1 7.16304 1 6.5"
            + "C1 5.83696 1.26339 5.20107 1.73223 4.73223C2.20107 4.26339"
            + " 2.83696 4 3.5 4H7.5C8.16304 4 8.79893 4.26339 9.26777 4.73223"
            + "C9.73661 5.20107 10 5.83696 10 6.5C10 7.16304 9.73661 7.79893"
            + " 9.26777 8.26777C8.79893 8.73661 8.16304 9 7.5 9H7.092C6.96889"
            + " 9.32197 6.96889 9.67803 7.092 10H7.5C8.42826 10 9.3185 9.63125"
            + " 9.97487 8.97487C10.6313 8.3185 11 7.42826 11 6.5C11 5.57174"
            + " 10.6313 4.6815 9.97487 4.02513C9.3185 3.36875 8.42826 3 7.5 3"
            + "H3.5C2.57174 3 1.6815 3.36875 1.02513 4.02513C0.368749 4.6815"
            + " 0 5.57174 0 6.5Z";
        const ICON_LINK = "data:image/svg+xml;utf8,"
            + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
                + '<path fill="' + linkSvgFill + '" d="' + linkSvgPath + '"/>'
                + '</svg>');
        const itemTypeIconURL = (type) => {
            if (type === "pdf" || type === "epub" || type === "snapshot") {
                return "chrome://zotero/skin/item-type/16/" + theme
                    + "/attachment-" + type + ".svg";
            }
            if (type === "note") {
                return "chrome://zotero/skin/item-type/16/" + theme
                    + "/note.svg";
            }
            return null;
        };

        // Helper: read the user's tab-vs-window default preference.
        // Mirrors Zotero's locateMenu — when `openReaderInNewWindow`
        // is on, the Window row appears first as the primary verb.
        let prefersWindow = false;
        try {
            prefersWindow = !!Zotero.Prefs.get("openReaderInNewWindow");
        } catch (e) {}

        // Helper: emit a "Open <Type> in New Tab" + "Open <Type>
        // in New Window" pair with a shared type icon. `onOpen` is
        // a (inWindow) → action factory.
        const appendOpenPair = (typeStr, typeLabel, onOpen) => {
            const icon = itemTypeIconURL(typeStr);
            const tabIcon = icon || ICON_NEW_TAB;
            const winIcon = icon || ICON_NEW_WINDOW;
            const labelTab    = "Open " + typeLabel + " in New Tab";
            const labelWindow = "Open " + typeLabel + " in New Window";
            if (prefersWindow) {
                append(labelWindow, onOpen(true),  { iconURL: winIcon });
                append(labelTab,    onOpen(false), { iconURL: tabIcon });
            } else {
                append(labelTab,    onOpen(false), { iconURL: tabIcon });
                append(labelWindow, onOpen(true),  { iconURL: winIcon });
            }
        };

        // Map a reader type code (pdf/epub/snapshot/note) to its
        // display label, falling back to "Attachment" when unknown.
        const readerTypeLabel = (t) => {
            if (t === "pdf")      return "PDF";
            if (t === "epub")     return "EPUB";
            if (t === "snapshot") return "Snapshot";
            if (t === "note")     return "Note";
            return "Attachment";
        };

        if (isAnnotation) {
            // The reader to open is the parent attachment's reader;
            // the annotation key is passed so the reader scrolls to
            // and selects it. Type info comes from the parent.
            let parentReaderType = null;
            let parentID = null;
            try {
                const parent = (item.parentItem)
                    || (item.parentItemID
                        && Zotero.Items.get(item.parentItemID));
                if (parent) {
                    parentID = parent.id;
                    parentReaderType = parent.attachmentReaderType || null;
                }
            } catch (e) {}
            if (parentID) {
                appendOpenPair(parentReaderType,
                    readerTypeLabel(parentReaderType),
                    (inWindow) => async () => {
                        try {
                            await Zotero.Reader.open(parentID,
                                { annotationID: item.key },
                                { openInWindow: inWindow });
                            win.focus();
                        } catch (e) {
                            Zotero.debug(
                                "[Weavero] open-annotation err: " + e);
                        }
                    });
            }
        }
        if (isAttachment) {
            appendOpenPair(item.attachmentReaderType,
                readerTypeLabel(item.attachmentReaderType),
                (inWindow) => async () => {
                    try {
                        await Zotero.Reader.open(item.id, null,
                            { openInWindow: inWindow });
                        win.focus();
                    } catch (e) {
                        Zotero.debug("[Weavero] open-att err: " + e);
                    }
                });
            append("Show File", () => {
                try {
                    if (attachmentFilePath) Zotero.File.reveal(attachmentFilePath);
                } catch (e) {
                    Zotero.debug("[Weavero] show-file err: " + e);
                }
            }, { disabled: !attachmentFilePath, iconURL: ICON_FOLDER });
        }
        if (isNote) {
            // Note: opening a note doesn't go through Zotero.Reader;
            // ZoteroPane.openNote does the right thing for the
            // tab/window choice (it reads the `note.openInNewWindow`
            // pref internally on the default path). For an explicit
            // window override, use openNoteWindow.
            appendOpenPair("note", readerTypeLabel("note"),
                (inWindow) => () => {
                    try {
                        const zp = win.ZoteroPane;
                        if (inWindow) {
                            if (zp && typeof zp.openNoteWindow === "function") {
                                zp.openNoteWindow(item.id);
                            } else if (zp && typeof zp.openNote === "function") {
                                zp.openNote(item.id);
                            }
                        } else {
                            if (zp && typeof zp.openNote === "function") {
                                zp.openNote(item.id);
                            } else if (zp && typeof zp.openNoteWindow === "function") {
                                zp.openNoteWindow(item.id);
                            } else if (zp) {
                                zp.selectItem(item.id);
                            }
                        }
                        win.focus();
                    } catch (e) {
                        Zotero.debug("[Weavero] open-note err: " + e);
                    }
                });
        }
        if (isRegular) {
            // Order matches Zotero's library context menu (locate
            // menu items at the top, separator, then library
            // navigation): Open in New Tab → Open in New Window →
            // View Online → ─── → Show in Library.
            if (primaryAttachment) {
                const t = primaryAttachment.attachmentReaderType;
                appendOpenPair(t, readerTypeLabel(t),
                    (inWindow) => async () => {
                        try {
                            await Zotero.Reader.open(primaryAttachment.id,
                                null, { openInWindow: inWindow });
                            win.focus();
                        } catch (e) {
                            Zotero.debug(
                                "[Weavero] open-primary err: " + e);
                        }
                    });
            }
            // View Online — only when the item has a URL field.
            // Mirrors Zotero's `ViewOptions.online` check.
            let onlineUrl = "";
            try {
                onlineUrl = (item.getField && item.getField("url")) || "";
            } catch (e) {}
            if (onlineUrl) {
                append("View Online", () => {
                    try { Zotero.launchURL(onlineUrl); }
                    catch (e) {
                        Zotero.debug("[Weavero] view-online err: " + e);
                    }
                }, { iconURL: ICON_GLOBE });
            }
        }

        addSep();

        // ---- Universal options ----------------------------------------------
        if (!opts.skipShowInLibrary) {
            append("Show in Library", () => this._navigateToItem(item),
                { iconURL: ICON_LIBRARY });
        }
        // "Show Parent in Library" is meaningful only when the
        // parent is distinct from where "Show in Library" lands.
        // For annotations, `selectItem` already routes to the
        // parent attachment (annotations have no direct row in
        // the items tree), so this row would duplicate the one
        // above. Skip it for annotations.
        if (item.parentItemID && !isAnnotation) {
            append("Show Parent in Library", () => {
                try {
                    const zp = win.ZoteroPane;
                    if (zp && typeof zp.selectItem === "function") {
                        zp.selectItem(item.parentItemID);
                    }
                    if (win.Zotero_Tabs && typeof win.Zotero_Tabs.select === "function") {
                        win.Zotero_Tabs.select("zotero-pane");
                    }
                    win.focus();
                } catch (e) {
                    Zotero.debug("[Weavero] show-parent err: " + e);
                }
            }, { iconURL: ICON_LIBRARY });
        }
        append("Copy Item Link", () => {
            try {
                const lib = item.libraryID;
                let prefix = "library";
                try {
                    if (!Zotero.Libraries.isUserLibrary(lib)) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(lib);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                const url = "zotero://select/" + prefix + "/items/" + item.key;
                Zotero.Utilities.Internal.copyTextToClipboard(url);
            } catch (e) {
                Zotero.debug("[Weavero] copy-link err: " + e);
            }
            // Plugin's needle icon — distinguishes a Weavero-provided
            // affordance ("copy a zotero:// URI for this item") from
            // the chain icons that mean "related items".
        }, { iconURL: this._menuItemIconURL });

        addSep();

        // "Add Related…" — opens Zotero's select-items dialog and adds
        // the chosen items as `dc:relation` peers of this one. Uses the
        // chain icon for visual consistency with the rest of the
        // related-item affordances (items-list `.wv-tree-rel-icon`,
        // sidebar `.wv-btn-relations`, PDF reader marker badge, the
        // "Add related item…" entry on the annotation context menu).
        append("Add Related…", () => {
            try { this._addRelatedItemDialog([item]); }
            catch (e) {
                Zotero.debug("[Weavero] add-related err: " + e);
            }
        }, { iconURL: ICON_LINK });

        popupset.appendChild(popup);
        popup.addEventListener("popuphidden", () => {
            try { popup.remove(); } catch (e) {}
        });
        try { popup.openPopupAtScreen(screenX, screenY, true); }
        catch (e) {
            Zotero.debug("[Weavero] rel-ctx open err: " + e);
            try { popup.remove(); } catch (e2) {}
        }
    }

    /** Open an annotation directly in the reader at its source location.
     *  Mirrors the `zotero://open?annotation=…` URL-handler path: the
     *  attachment that owns the annotation is what `Zotero.Reader.open`
     *  takes as `itemID`; the annotation's key is passed as
     *  `annotationID` in the location dict so the reader scrolls to
     *  and selects it on open. If the reader for that attachment is
     *  already open in a tab, Zotero re-uses it.
     *
     *  Returns true on success so callers can fall back to
     *  `_navigateToItem` (library-pane selection) when this isn't an
     *  annotation, has no parent, or the open call rejects. */
    async _openAnnotationInReader(ann) {
        if (!ann || !ann.isAnnotation || !ann.isAnnotation()) return false;
        try {
            const parentID = ann.parentItemID;
            if (!parentID) return false;
            await Zotero.Reader.open(parentID, { annotationID: ann.key });
            try { Zotero.getMainWindow().focus(); } catch (e) {}
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _openAnnotationInReader err: " + e);
            return false;
        }
    }

    // ---- CSS injection -----------------------------------------------------

    injectStyles() {
        const doc = Zotero.getMainWindow().document;
        // Always remove any existing weavero-styles element first.
        // Zotero's in-place plugin upgrade flow doesn't reliably tear
        // down the previous plugin's DOM additions before the new init
        // runs — if we just `return` on existing-style, the new init
        // sees the OLD plugin's style element (with potentially stale
        // PLUGIN_CSS content from before the update) and skips. Result:
        // popup CSS rules don't match the new plugin's expectations,
        // padding/line-breaks/etc disappear until the user manually
        // disables and re-enables the plugin (which fully runs init
        // again from a clean state).
        const existing = doc.getElementById(STYLE_ID);
        if (existing) existing.remove();
        const s = doc.createElement("style");
        s.id = STYLE_ID;
        s.textContent = PLUGIN_CSS;
        (doc.head || doc.documentElement).appendChild(s);
    }

    removeStyles() {
        try {
            const el = Zotero.getMainWindow().document.getElementById(STYLE_ID);
            if (el) el.remove();
        } catch {}
    }

    // ---- zotero:// URI dispatch --------------------------------------------

    async handleZoteroURI(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const getLib = () => {
                if (parts[0] === "groups")
                    return Zotero.Groups.getLibraryIDFromGroupID(Number(parts[1]));
                return Zotero.Libraries.userLibraryID;
            };
            const lastKey = parts[parts.length - 1];

            if (url.startsWith("zotero://select/")) {
                // Path shapes Zotero accepts:
                //   .../items/<key>            (user-library item)
                //   .../collections/<key>      (user-library collection)
                //   .../searches/<key>         (user-library saved search)
                //   .../groups/<gid>/items/<key>
                //   .../groups/<gid>/collections/<key>
                //   .../groups/<gid>/searches/<key>
                // The selector keyword is the second-to-last segment;
                // the key is always last. Falling back to "items"
                // preserves behavior for the legacy bare form.
                const lib = getLib();
                const kind = parts[parts.length - 2] || "items";
                const win  = Zotero.getMainWindow();
                const pane = Zotero.getActiveZoteroPane();
                // When the link is clicked from a note tab (or any
                // non-library tab), `selectItem` / `selectCollection`
                // affect the library tab in the background but the
                // user keeps seeing the note. Switch to the library
                // tab first so the result is visible. Mirrors the
                // "Show in Library" affordance on the annotation
                // context menu.
                const switchToLibrary = () => {
                    try {
                        if (win.Zotero_Tabs
                            && typeof win.Zotero_Tabs.select === "function") {
                            win.Zotero_Tabs.select("zotero-pane");
                        }
                    } catch (e) {}
                };
                if (kind === "collections") {
                    const col = Zotero.Collections.getByLibraryAndKey(lib, lastKey);
                    if (col && pane.collectionsView
                        && typeof pane.collectionsView.selectCollection === "function") {
                        switchToLibrary();
                        await pane.collectionsView.selectCollection(col.id);
                        win.focus();
                    }
                    return;
                }
                if (kind === "searches") {
                    const search = Zotero.Searches.getByLibraryAndKey(lib, lastKey);
                    if (search && pane.collectionsView
                        && typeof pane.collectionsView.selectSearch === "function") {
                        switchToLibrary();
                        await pane.collectionsView.selectSearch(search.id);
                        win.focus();
                    }
                    return;
                }
                // Default: items
                const item = Zotero.Items.getByLibraryAndKey(lib, lastKey);
                if (item) {
                    switchToLibrary();
                    await pane.selectItem(item.id);
                    win.focus();
                }
                return;
            }
            if (url.startsWith("zotero://open")) {
                const item = Zotero.Items.getByLibraryAndKey(getLib(), lastKey);
                if (!item) return;
                const loc = {};
                const page = u.searchParams.get("page");
                const ann  = u.searchParams.get("annotation");
                if (page !== null) loc.pageIndex = Number(page) - 1;
                if (ann) loc.annotationID = ann;
                await Zotero.Reader.open(item.id, loc);
                return;
            }
            if (url.startsWith("zotero://note/")) {
                let key, lib;
                if (parts[0] === "u")      { lib = Zotero.Libraries.userLibraryID; key = parts[1]; }
                else if (parts[0] === "g" || parts[0] === "groups")
                                           { lib = getLib(); key = lastKey; }
                else                       { lib = Zotero.Libraries.userLibraryID; key = lastKey; }
                if (!key) return;
                const note = Zotero.Items.getByLibraryAndKey(lib, key);
                if (!note) return;
                const win  = Zotero.getMainWindow();
                const pane = win.ZoteroPane;
                try {
                    if (typeof pane.openNote === "function") await pane.openNote(note.id);
                    else if (typeof pane.openNoteWindow === "function") await pane.openNoteWindow(note.id);
                    else await pane.selectItem(note.id);
                    win.focus();
                } catch { await pane.selectItem(note.id); win.focus(); }
                return;
            }
            Zotero.launchURL(url);
        } catch (err) {
            Zotero.debug("[Weavero] handleZoteroURI error: " + err.message);
        }
    }

    // ---- Popup panel -------------------------------------------------------

    _getOrCreatePanel(doc) {
        let panel = doc.getElementById(PANEL_ID);
        if (panel && panel.tagName && panel.tagName.toLowerCase() === "panel") {
            // Old XUL panel from a previous version — replace it.
            try { panel.remove(); } catch(e) {}
            panel = null;
        }
        if (!panel) {
            const ns = "http://www.w3.org/1999/xhtml";
            panel = doc.createElementNS(ns, "div");
            panel.id = PANEL_ID;
            panel.className = "wv-popup-overlay";
            panel.style.cssText = [
                "position: fixed",
                "z-index: 999999",
                "background: var(--material-toolbar, #fafafa)",
                "color: inherit",
                "border: 1px solid rgba(127,127,127,0.45)",
                "border-radius: 6px",
                "box-shadow: 0 4px 18px rgba(0,0,0,0.28)",
                "min-width: 300px; max-width: 520px",
                "max-height: 70vh; overflow: auto",
                "display: none",
            ].join(";");

            // Compatibility shim so existing call sites that still use the
            // XUL-panel API (panel.hidePopup, panel.state) keep working.
            panel.hidePopup = function () {
                if (panel.style.display !== "none") {
                    panel.style.display = "none";
                    Object.defineProperty(panel, "state",
                        { value: "closed", configurable: true, writable: true });
                }
                // Tear down any per-open tracking listeners (set by
                // openCommentPopup when an anchorNode is provided).
                if (panel._wvCleanup) {
                    try { panel._wvCleanup(); } catch (e) {}
                    panel._wvCleanup = null;
                }
            };
            Object.defineProperty(panel, "state",
                { value: "closed", configurable: true, writable: true });

            // Escape closes the popup; only fires when the popup is open.
            doc.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && panel.style.display !== "none") {
                    panel.hidePopup();
                }
            });

            const target = doc.body || doc.documentElement;
            target.appendChild(panel);
        }
        return panel;
    }

    _makeLink(doc, url, panel, label) {
        const ns = "http://www.w3.org/1999/xhtml";
        const a = doc.createElementNS(ns, "a");
        a.href = url;
        a.textContent = (label != null && label !== "") ? label : url;
        // Hover tooltip showing the full URL — uses the browser's native
        // title-attribute tooltip so the delay and styling match what
        // Zotero shows for URL fields elsewhere in its UI.
        a.title = url;
        a.className = "wv-link " + this._urlLinkClass(url);
        a.addEventListener("click", e => {
            e.preventDefault();
            if (url.startsWith("zotero://")) this.handleZoteroURI(url);
            else this._launchURL(url);
            panel.hidePopup();
        });
        return a;
    }


    /**
     * Render a string as inline-markdown into a DocumentFragment.
     * Supported marks (best-effort, single-pass scanner with recursion for
     * styled spans): [label](url), **bold**, *italic*, ~~strike~~, `code`,
     * plus bare http(s)://, zotero:// URLs (carried through to _makeLink).
     * URLs that get rendered as links are added to `seen` so the caller can
     * avoid duplicating them in the "Additional links" footer.
     */
    _renderInlineMarkdown(text, doc, panel, seen) {
        const ns   = "http://www.w3.org/1999/xhtml";
        const frag = doc.createDocumentFragment();
        if (!text) return frag;
        // Markdown rendering disabled: degrade to plain text + URL spans
        // (the v0.0.78 popup behaviour).
        if (!this._getEnableMarkdown()) {
            const re = new RegExp(this.URL_REGEX.source, "g");
            let last = 0, m;
            while ((m = re.exec(text)) !== null) {
                if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
                const raw   = m[0];
                const url   = raw.replace(this.TRAILING_RE, "");
                const trail = raw.slice(url.length);
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel));
                if (trail) frag.appendChild(doc.createTextNode(trail));
                last = m.index + raw.length;
            }
            if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
            return frag;
        }
        // Order matters: longer markers first so **bold** beats *italic*,
        // [label](url) beats bare-URL, etc.
        const TOKEN = new RegExp(
            // 1: link label, 2: link url
            "\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            // 3: bold content
            + "|\\*\\*([\\s\\S]+?)\\*\\*"
            // 4: italic content (require non-space inner boundary so " * 3" doesn't trigger)
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            // 5: strike content
            + "|~~([\\s\\S]+?)~~"
            // 6: code content (double backtick — must come before single)
            + "|``([\\s\\S]+?)``"
            // 7: code content (single backtick)
            + "|`([^`\\n]+?)`"
            // 8: bare URL
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"')\\]]*)",
            "g"
        );
        let last = 0, m;
        while ((m = TOKEN.exec(text)) !== null) {
            if (m.index > last)
                frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
            if (m[1] !== undefined && m[2] !== undefined) {
                const label = m[1];
                const url   = m[2].replace(this.TRAILING_RE, "");
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel, label));
            } else if (m[3] !== undefined) {
                const el = doc.createElementNS(ns, "strong");
                el.appendChild(this._renderInlineMarkdown(m[3], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[4] !== undefined) {
                const el = doc.createElementNS(ns, "em");
                el.appendChild(this._renderInlineMarkdown(m[4], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[5] !== undefined) {
                const el = doc.createElementNS(ns, "s");
                el.appendChild(this._renderInlineMarkdown(m[5], doc, panel, seen));
                frag.appendChild(el);
            } else if (m[6] !== undefined) {
                // ``code`` (double backtick).
                const el = doc.createElementNS(ns, "code");
                el.textContent = m[6];
                frag.appendChild(el);
            } else if (m[7] !== undefined) {
                // `code` (single backtick).
                const el = doc.createElementNS(ns, "code");
                el.textContent = m[7];
                frag.appendChild(el);
            } else if (m[8] !== undefined) {
                const raw   = m[8];
                const url   = raw.replace(this.TRAILING_RE, "");
                const trail = raw.slice(url.length);
                if (seen) seen.add(url);
                frag.appendChild(this._makeLink(doc, url, panel));
                if (trail) frag.appendChild(doc.createTextNode(trail));
            }
            last = m.index + m[0].length;
        }
        if (last < text.length)
            frag.appendChild(doc.createTextNode(text.slice(last)));
        return frag;
    }

    _makeCopyBtn(doc, win, url) {
        const ns = "http://www.w3.org/1999/xhtml";
        const btn = doc.createElementNS(ns, "button");
        btn.className = "wv-copy-btn";
        btn.textContent = "Copy";
        btn.title = "Copy URL to clipboard";
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const original = btn.textContent;
            (win.navigator.clipboard
                ? win.navigator.clipboard.writeText(url)
                : Promise.reject()
            ).catch(() => {
                // Fallback for restricted contexts
                const ta = doc.createElementNS(ns, "textarea");
                ta.value = url;
                ta.style.cssText = "position:fixed;opacity:0;";
                doc.documentElement.appendChild(ta);
                ta.focus(); ta.select();
                doc.execCommand("copy");
                ta.remove();
            }).finally(() => {
                btn.textContent = "✓";
                win.setTimeout(() => { btn.textContent = original; }, 1500);
            });
        });
        return btn;
    }

    openCommentPopup(comment, opts = {}) {
        if (!comment && !(opts.extraURLs && opts.extraURLs.length)) return;
        const win  = Zotero.getMainWindow();
        const doc  = win.document;
        const ns   = "http://www.w3.org/1999/xhtml";
        const norm = this.normalize(String(comment || ""));

        const panel = this._getOrCreatePanel(doc);
        while (panel.firstChild) panel.removeChild(panel.firstChild);

        const container = doc.createElementNS(ns, "div");
        container.className = "wv-popup-container";
        // Give the container a tabindex so the XUL panel always has at
        // least one focusable descendant. Markdown-only comments produce
        // popups with no <a> links and the panel was self-dismissing
        // ~40ms after openPopup with no popupshown event firing.
        container.setAttribute("tabindex", "-1");

        // Render comment text with inline markdown + hyperlinks
        const seen = new Set();
        container.appendChild(this._renderInlineMarkdown(norm, doc, panel, seen));

        // Extra URLs (from <a href> in DOM) not already shown inline
        const extras = (opts.extraURLs || []).filter(u => u && !seen.has(u));
        if (extras.length) {
            const sep = doc.createElementNS(ns, "div");
            sep.className = "wv-separator";
            sep.textContent = "Additional links in comment:";
            container.appendChild(sep);
        }
        for (const url of extras) {
            const row = doc.createElementNS(ns, "div");
            row.className = "wv-extra-row";
            row.appendChild(this._makeLink(doc, url, panel));
            row.appendChild(this._makeCopyBtn(doc, win, url));
            container.appendChild(row);
        }

        panel.appendChild(container);

        try {
            // Show first so we can measure for clamping inside the viewport.
            panel.style.display = "block";
            Object.defineProperty(panel, "state",
                { value: "open", configurable: true, writable: true });

            // Position the overlay. After-start of the anchor (below + left-aligned),
            // clamped to viewport edges with a small margin.
            const margin = 6;
            const vw = (win.innerWidth || doc.documentElement.clientWidth) - margin;
            const vh = (win.innerHeight || doc.documentElement.clientHeight) - margin;
            let left = margin, top = margin;
            // Prefer the rect captured at click-time — the live
            // getBoundingClientRect of opts.anchorNode may be stale if
            // Zotero re-rendered the tree row between click and open.
            // anchorScreen is checked BEFORE anchorNode: callers in
            // iframe contexts (PDF/snapshot readers) pass anchorScreen
            // because anchorNode.getBoundingClientRect() would return
            // iframe-local coords mis-applied to main-window
            // positioning. anchorNode-only is the main-window case.
            if (opts.anchorRect) {
                left = opts.anchorRect.left;
                top  = opts.anchorRect.bottom + 4;
            } else if (opts.anchorScreen) {
                const dx = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                const dy = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                left = opts.anchorScreen.x - dx;
                top  = opts.anchorScreen.y - dy;
            } else if (opts.anchorNode && opts.anchorNode.getBoundingClientRect) {
                const r = opts.anchorNode.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) {
                    left = r.left;
                    top  = r.bottom + 4;
                }
            } else {
                left = 240; top = 200;
            }
            panel.style.left = "0px"; panel.style.top = "0px";
            const measured = panel.getBoundingClientRect();
            const w = measured.width  || 320;
            const h = measured.height || 80;
            if (left + w > vw) left = Math.max(margin, vw - w);
            if (top  + h > vh) top  = Math.max(margin, vh - h);
            panel.style.left = Math.round(left) + "px";
            panel.style.top  = Math.round(top)  + "px";

            this._dbg("[Weavero] openCommentPopup (HTML overlay): pos="
                + Math.round(left) + "," + Math.round(top) + " size=" + Math.round(w) + "x" + Math.round(h)
                + " anchor=" + (opts.anchorNode
                    ? (opts.anchorNode.tagName || "?") + "." + (opts.anchorNode.className || "")
                    : (opts.anchorScreen ? "screen" : "fallback")));

            // Click outside to dismiss. Defer attachment one tick so the
            // mousedown that opened the popup doesn't immediately match.
            try {
                const dismissOnOutsideClick = (e) => {
                    if (panel.style.display === "none") {
                        doc.removeEventListener("mousedown", dismissOnOutsideClick, true);
                        return;
                    }
                    if (e.target && (e.target === panel || panel.contains(e.target))) return;
                    panel.hidePopup();
                    doc.removeEventListener("mousedown", dismissOnOutsideClick, true);
                };
                win.setTimeout(() => {
                    doc.addEventListener("mousedown", dismissOnOutsideClick, true);
                }, 0);
            } catch(err) {
                Zotero.debug("[Weavero] outside-click bind err: " + err);
            }

            // Track the anchor on scroll/zoom so the popup follows the
            // annotation, mirroring Zotero's own annotation popup. Tear
            // down any prior tracking first (popup is reused across
            // opens, so previous open's listeners must be removed).
            if (panel._wvCleanup) {
                try { panel._wvCleanup(); } catch (e) {}
                panel._wvCleanup = null;
            }
            const anchor = opts.anchorNode;
            const anchorWin = anchor && anchor.ownerDocument
                && anchor.ownerDocument.defaultView;
            if (anchor && anchorWin) {
                let scheduled = false;
                const reposition = () => {
                    if (scheduled) return;
                    scheduled = true;
                    win.requestAnimationFrame(() => {
                        scheduled = false;
                        if (panel.style.display === "none") return;
                        if (!anchor.isConnected) {
                            // Anchor was removed (annotation deleted,
                            // page navigated): close the popup.
                            panel.hidePopup();
                            return;
                        }
                        // Recompute screen coords from the live anchor,
                        // mirror the initial-position logic.
                        const sc2 = this._screenCoords(anchor);
                        const dx2 = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                        const dy2 = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                        let nl, nt;
                        if (sc2) {
                            nl = sc2.x - dx2;
                            nt = sc2.y - dy2;
                        } else {
                            const r = anchor.getBoundingClientRect();
                            if (!r.width && !r.height) return;
                            nl = r.left;
                            nt = r.bottom + 4;
                        }
                        const m2 = panel.getBoundingClientRect();
                        const w2 = m2.width  || 320;
                        const h2 = m2.height || 80;
                        if (nl + w2 > vw) nl = Math.max(margin, vw - w2);
                        if (nt + h2 > vh) nt = Math.max(margin, vh - h2);
                        panel.style.left = Math.round(nl) + "px";
                        panel.style.top  = Math.round(nt) + "px";
                    });
                };
                // capture=true catches scrolls in any nested element
                // (e.g. the document scroll inside the inner iframe).
                anchorWin.addEventListener("scroll", reposition, true);
                anchorWin.addEventListener("resize", reposition);
                // Also listen on the main window so a scroll/resize of
                // the Zotero pane shifts the popup correspondingly.
                if (win !== anchorWin) {
                    win.addEventListener("scroll", reposition, true);
                    win.addEventListener("resize", reposition);
                }
                // Snapshot/EPUB readers zoom by setting the CSS custom
                // property `--scale` on the iframe's documentElement
                // (see snapshot-view.ts:_setScale). That's an inline-
                // style mutation, NOT a window resize — so observe
                // style attribute changes directly. PDF reader doesn't
                // hit this path, but the observer is cheap.
                let styleObserver = null;
                try {
                    const anchorDoc = anchor.ownerDocument;
                    if (anchorDoc && anchorDoc.documentElement) {
                        styleObserver = new anchorWin.MutationObserver(reposition);
                        styleObserver.observe(anchorDoc.documentElement, {
                            attributes: true,
                            attributeFilter: ["style"],
                        });
                    }
                } catch (e) {}
                panel._wvCleanup = () => {
                    try { anchorWin.removeEventListener("scroll", reposition, true); } catch (e) {}
                    try { anchorWin.removeEventListener("resize", reposition); } catch (e) {}
                    if (win !== anchorWin) {
                        try { win.removeEventListener("scroll", reposition, true); } catch (e) {}
                        try { win.removeEventListener("resize", reposition); } catch (e) {}
                    }
                    if (styleObserver) {
                        try { styleObserver.disconnect(); } catch (e) {}
                    }
                };
            }
        } catch(err) {
            Zotero.debug("[Weavero] openCommentPopup open err: " + err);
        }
    }

    /** Display-side relations popup. Lists the items the annotation is
     *  related to (read from `dc:relation` triples on the annotation
     *  item) — not editable for now; clicking a row navigates to the
     *  target item in the library, mirroring upstream `relatedBox.js`'s
     *  `_handleShowItem`.
     *
     *  Reuses the same XHTML overlay panel as `openCommentPopup` so
     *  positioning, dismissal, and tracking behaviour stay consistent.
     *  Doesn't reuse openCommentPopup itself because the content is
     *  rendered as a list of clickable item rows, not parsed as
     *  markdown. */
    openRelationsPopup(annotationItem, opts = {}) {
        if (!annotationItem) return;
        const win  = Zotero.getMainWindow();
        const doc  = win.document;
        const ns   = "http://www.w3.org/1999/xhtml";

        const items = this._getAnnotationRelatedItems(annotationItem);

        const panel = this._getOrCreatePanel(doc);
        while (panel.firstChild) panel.removeChild(panel.firstChild);

        const container = doc.createElementNS(ns, "div");
        container.className = "wv-popup-container";
        container.setAttribute("tabindex", "-1");

        const list = doc.createElementNS(ns, "div");
        list.className = "wv-relations-list";
        if (!items.length) {
            const empty = doc.createElementNS(ns, "div");
            empty.className = "wv-rel-empty";
            empty.textContent = "No related items.";
            list.appendChild(empty);
        }
        for (const item of items) {
            const row = doc.createElementNS(ns, "div");
            row.className = "wv-rel-row";
            row.setAttribute("role", "button");
            row.setAttribute("tabindex", "0");
            row.title = "Open in library";

            // Type icon. Zotero stores annotation icons in the
            // `universal` colour folder (`chrome://zotero/skin/16/
            // universal/annotate-<type>.svg`) — those resolve fine via
            // <img src>. Item-type icons, by contrast, live at
            // `chrome://zotero/skin/item-type/16/<light|dark>/<kebab>.svg`
            // and Zotero drives them via CSS keyed on
            // `[data-item-type="<camelCase>"]` so the right theme +
            // hidpi variant is picked automatically. We reuse that
            // mechanism rather than constructing URLs ourselves —
            // the popup lives in the main Zotero document which
            // already has those rules loaded.
            let iconEl;
            try {
                if (item.isAnnotation && item.isAnnotation()) {
                    const t = item.annotationType || "highlight";
                    const aType = (t === "image") ? "area" : t;
                    iconEl = doc.createElementNS(ns, "img");
                    iconEl.setAttribute("src",
                        "chrome://zotero/skin/16/universal/annotate-"
                        + aType + ".svg");
                    iconEl.className = "annotation-icon wv-rel-icon";
                    if (item.annotationColor) {
                        iconEl.style.fill = item.annotationColor;
                    }
                } else {
                    const name = (typeof item.getItemTypeIconName === "function")
                        ? item.getItemTypeIconName(true)
                        : "document";
                    iconEl = doc.createElementNS(ns, "span");
                    iconEl.className = "icon icon-css icon-item-type wv-rel-icon";
                    iconEl.setAttribute("data-item-type", name);
                }
            } catch (e) {
                iconEl = doc.createElementNS(ns, "span");
                iconEl.className = "icon icon-css icon-item-type wv-rel-icon";
                iconEl.setAttribute("data-item-type", "document");
            }

            const titleEl = doc.createElementNS(ns, "span");
            titleEl.className = "wv-rel-title";
            try { titleEl.textContent = item.getDisplayTitle() || "(untitled)"; }
            catch (e) { titleEl.textContent = "(untitled)"; }

            row.appendChild(iconEl);
            row.appendChild(titleEl);

            const onActivate = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                let opened = false;
                try {
                    if (item && item.isAnnotation && item.isAnnotation()) {
                        opened = await this._openAnnotationInReader(item);
                    }
                } catch (err) {
                    Zotero.debug("[Weavero] rel-popup activate err: " + err);
                }
                if (!opened) this._navigateToItem(item);
                try { panel.style.display = "none"; } catch (err) {}
            };
            row.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Intentionally keep the relations popup OPEN under
                // the context menu — the user is choosing how to open
                // THIS row's item; closing the popup discards their
                // place in the relations list.
                this._openRelatedItemContextMenu(item, e.screenX, e.screenY);
            });
            row.addEventListener("click", onActivate);
            row.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") onActivate(e);
            });

            list.appendChild(row);
        }
        container.appendChild(list);
        panel.appendChild(container);

        try {
            panel.style.display = "block";
            Object.defineProperty(panel, "state",
                { value: "open", configurable: true, writable: true });

            const margin = 6;
            const vw = (win.innerWidth || doc.documentElement.clientWidth) - margin;
            const vh = (win.innerHeight || doc.documentElement.clientHeight) - margin;
            let left = margin, top = margin;
            if (opts.anchorScreen) {
                const dx = (typeof win.mozInnerScreenX === "number") ? win.mozInnerScreenX : 0;
                const dy = (typeof win.mozInnerScreenY === "number") ? win.mozInnerScreenY : 0;
                left = opts.anchorScreen.x - dx;
                top  = opts.anchorScreen.y - dy;
            } else if (opts.anchorNode && opts.anchorNode.getBoundingClientRect) {
                const r = opts.anchorNode.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) {
                    left = r.left;
                    top  = r.bottom + 4;
                }
            } else {
                left = 240; top = 200;
            }
            panel.style.left = "0px"; panel.style.top = "0px";
            const measured = panel.getBoundingClientRect();
            const w = measured.width  || 320;
            const h = measured.height || 80;
            if (left + w > vw) left = Math.max(margin, vw - w);
            if (top  + h > vh) top  = Math.max(margin, vh - h);
            panel.style.left = Math.round(left) + "px";
            panel.style.top  = Math.round(top)  + "px";

            // Click-outside dismiss — same idiom as openCommentPopup.
            const dismissOnOutsideClick = (e) => {
                if (panel.style.display === "none") {
                    doc.removeEventListener("mousedown", dismissOnOutsideClick, true);
                    return;
                }
                if (!panel.contains(e.target)) {
                    panel.style.display = "none";
                    doc.removeEventListener("mousedown", dismissOnOutsideClick, true);
                }
            };
            win.setTimeout(() => {
                doc.addEventListener("mousedown", dismissOnOutsideClick, true);
            }, 0);
        } catch (err) {
            Zotero.debug("[Weavero] openRelationsPopup open err: " + err);
        }
    }

    // ---- Reader sidebar button --------------------------------------------

    /** One-line summary of an element for debug logs — tag, id, classes,
     *  child count, first 40 chars of textContent. Tolerant to nullish. */
    _elSummary(el) {
        if (!el) return "(null)";
        const tag = (el.tagName || "?").toLowerCase();
        const id = el.id ? "#" + el.id : "";
        const cls = el.className && typeof el.className === "string"
            ? "." + el.className.replace(/\s+/g, ".")
            : "";
        const kids = el.children ? "[" + el.children.length + "ch]" : "";
        const txt = el.textContent ? JSON.stringify(String(el.textContent).slice(0, 40)) : "";
        return tag + id + cls + kids + " " + txt;
    }

    /** PLUGIN_CSS lives in the main Zotero doc, but the reader's outer
     *  iframe is its own document. Inject the URL/relations/markdown
     *  styling there too so sidebar buttons inherit the same look. */
    _ensureReaderOuterStyles(doc) {
        if (!doc) return;
        // Defensive remove-then-add: a previous plugin instance's style
        // element can survive destroy() (Zotero's disable/enable flow
        // doesn't always tear down DOM artifacts cleanly). An early-return
        // guard would leave the old version's CSS in force after re-enable
        // and the new code's preview-panel rules would never apply, which
        // shows up as a mix of correctly-rendered and unstyled comments
        // in the reader sidebar after the user toggles the plugin off/on.
        const existing = doc.getElementById("weavero-reader-outer-styles");
        if (existing) existing.remove();
        const s = doc.createElement("style");
        s.id = "weavero-reader-outer-styles";
        s.textContent =
            // Preview-panel CSS (v0.0.106). The sidebar comments live in
            // this outer reader iframe, so the visibility-swap rules need
            // to be present here too. URL-span colors and md-text styles
            // are inherited from the same global classes used in the main
            // doc. We restate them as a defensive duplicate because the
            // outer iframe has its own document and may not see the main
            // stylesheet.
            ".wv-md-preview {"
            + "  font: inherit; color: inherit; line-height: inherit;"
            + "  white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word;"
            + "}"
            + ".comment.wv-comment-preview .content { display: none; }"
            + ".comment.wv-comment-preview .wv-md-preview {"
            + "  display: -webkit-box;"
            + "  -webkit-box-orient: vertical;"
            + "  -webkit-line-clamp: var(--wv-preview-line-clamp, 3);"
            + "  overflow: hidden;"
            + "}"
            // Lift the truncation when the row is selected — Zotero
            // applies the `selected` class to the .annotation div on
            // click (mirrors its own expand-on-click behaviour).
            + ".annotation.selected .wv-md-preview { -webkit-line-clamp: unset; }"
            + ".annotation-popup .wv-md-preview { -webkit-line-clamp: unset; }"
            // Hide the overflow-only icon when the row is selected
            // (clamp lifted, full content shown inline).
            + ".annotation.selected .wv-btn-sidebar[data-wv-icon-reason='overflow'] { display: none; }"
            // Sidebar-button layout: URL-only buttons (no .wv-format-md
            // class) inherit a default display:block from somewhere in
            // Zotero's iframe styles, which pushes them onto their own
            // line below the header strip and out of view. Force the
            // same inline-flex layout the .wv-format-md rule uses, so
            // URL-only and format-md sidebar icons sit next to the kebab
            // identically.
            // Reader-side icons (sidebar header + in-PDF popup
            // header) — boxless. The buttons are <button> elements
            // so browser-default chrome (gray fill, beveled border,
            // padding) needs to be explicitly reset. Layout forces
            // inline-flex so the icon sits alongside the kebab
            // instead of wrapping below the header strip. Markdown-
            // bearing icons still get the amber disc via the
            // .wv-format-md rule below (with !important).
            + ".wv-btn.wv-btn-sidebar,"
            + ".wv-btn.wv-btn-popup {"
            + "  display: inline-flex !important;"
            + "  align-items: center;"
            + "  justify-content: center;"
            + "  flex-shrink: 0;"
            + "  line-height: 1;"
            + "  font-size: 11px;"
            + "  opacity: 1;"
            + "  background: transparent; border: none;"
            + "  padding: 1px 3px; border-radius: 3px;"
            + "  transition: background 0.15s;"
            + "}"
            + ".wv-btn.wv-btn-sidebar:hover,"
            + ".wv-btn.wv-btn-popup:hover {"
            + "  background: rgba(0, 0, 0, 0.07);"
            + "}"
            + ":root.wv-ui-dark .wv-btn.wv-btn-sidebar:hover,"
            + ":root.wv-ui-dark .wv-btn.wv-btn-popup:hover {"
            + "  background: rgba(255, 255, 255, 0.08);"
            + "}"
            // Amber-disc hover ring (type-2 / type-3 icons), same
            + ".comment.wv-comment-preview.wv-editing .content { display: block; }"
            + ".comment.wv-comment-preview.wv-editing .wv-md-preview { display: none; }"
            + ".wv-md-bold { font-weight: 700; }"
            + ".wv-md-italic { font-style: italic; }"
            + ".wv-md-strike { text-decoration: line-through; opacity: 0.85; }"
            + ".wv-md-code {"
            + "  font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;"
            + "  font-size: 92%; padding: 0 3px; border-radius: 3px;"
            + "  background: rgba(127,127,127,0.15);"
            + "}"
            + ":root { --wv-link-http: #1a73e8;"
            +   " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }"
            + ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
            +   " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }"
            + ".wv-url-span { cursor: pointer !important; }"
            + ".wv-url-span.wv-link-http   { color: var(--wv-link-http); }"
            + ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero); }"
            + ".wv-url-span.wv-link-app    { color: var(--wv-link-app); }"
            + ".wv-link { cursor: pointer !important; }"
            + ".wv-link-svg {"
            + "  width: 1em; height: 1em; display: block; flex-shrink: 0;"
            + "}"
            // Annotation-header relations icon + side-by-side icon
            // group (mirrors PLUGIN_CSS — see the rationale there).
            + ".wv-icon-group {"
            + "  display: inline-flex; align-items: center; gap: 2px;"
            + "  flex-shrink: 0;"
            + "}"
            + ".wv-btn-relations { color: #7a4a00; }"
            + ".wv-btn-relations .wv-relations-svg {"
            + "  width: 14px; height: 14px; display: block; flex-shrink: 0;"
            + "}"
            + ":root.wv-ui-dark .wv-btn-relations { color: #ffb84d; }"
            + "";
        (doc.head || doc.documentElement).appendChild(s);
    }

    _sidebarHandler = (event) => {
        if (!this._getEnableReaderSidebar()) return;
        const { doc, append, params, reader } = event;
        const cmt = params.annotation.comment || "";
        const ns = "http://www.w3.org/1999/xhtml";

        // Always inject the reader-iframe CSS up front. Both the
        // comment icon and the relations icon depend on it, and we
        // can't predict which (if any) will be appended without
        // running the per-icon checks below.
        try { this._ensureReaderOuterStyles(doc); } catch(e) {}

        // Build a single wrapper so multiple icons sit side-by-side.
        // Zotero's CustomSections wraps each `append()` call in its own
        // `<div class="section">`, and the parent `.custom-sections` is
        // block-level — so calling append() once per icon stacks the
        // icons vertically. We bundle everything into one container and
        // make a single append() call instead.
        //
        // Order policy: when BOTH icons apply the relations icon goes
        // LAST (rightmost of our icons, closest to the kebab/⋯ menu).
        // Rationale: relations is the closer analog to a native Zotero
        // feature, so it sits adjacent to the native menu button; the
        // comment icon is a Weavero-specific affordance and sits to
        // its left.
        const group = doc.createElementNS(ns, "span");
        group.className = "wv-icon-group";
        let appended = 0;

        // --- Comment icon (chain / amber-disc) ------------------------------
        // Only emitted when there's something the icon should reveal that
        // isn't already rendered inline by the preview panel.
        if (this._iconWantedFor(cmt) && this._iconAddsValueBeyondInline(cmt)) {
            const btn = doc.createElementNS(ns, "button");
            btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
            this._applyIconState(btn, cmt);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                // Always pass anchorNode (so the popup can track it on
                // scroll/zoom). Pass anchorScreen too when available — the
                // button is in the reader's outer iframe, and the popup
                // lives in the main window, so screen coords are needed
                // for accurate initial placement.
                const sc = this._screenCoords(e.currentTarget);
                this.openCommentPopup(cmt, {
                    anchorNode: e.currentTarget,
                    ...(sc ? { anchorScreen: sc } : {}),
                });
            });
            group.appendChild(btn);
            appended++;
        }

        // --- Relations icon -------------------------------------------------
        // Surface the annotation's `dc:relation` triples (set from any
        // other item's "Related" pane that points at this annotation).
        // Independent of comment content: an annotation with no comment
        // can still have related items.
        //
        // Idempotent: if a re-inject pass already added a relations
        // button to this row (via _reinjectSidebarButtons, which lands
        // adjacent to but outside `.custom-sections`), skip — React's
        // clear-on-render cleanup only touches `.custom-sections`, so
        // duplicating here would visibly stack two icons.
        try {
            const lib = this.libraryIDFromReader(reader);
            const annKey = params.annotation && params.annotation.id;
            const ann = this._getAnnotationItem(lib, annKey);
            const related = this._getAnnotationRelatedItems(ann);
            const row = annKey
                ? doc.querySelector(
                    "[data-sidebar-annotation-id=\"" + annKey + "\"]")
                : null;
            const alreadyHasRelBtn = row
                && row.querySelector(".wv-btn-relations");
            if (related.length && !alreadyHasRelBtn) {
                const relBtn = doc.createElementNS(ns, "button");
                relBtn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS
                    + " wv-btn-relations";
                relBtn.title = related.length + " Related";
                relBtn.appendChild(this._makeRelationsSvg(doc));
                relBtn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(e.currentTarget);
                    this.openRelationsPopup(ann, {
                        anchorNode: e.currentTarget,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                group.appendChild(relBtn);
                appended++;
            }
        } catch (e) {
            Zotero.debug("[Weavero] sidebar relations icon err: " + e.message);
        }

        if (appended) append(group);
    };

    // ---- Reader context menu ----------------------------------------------

    _contextHandler = (event) => {
        const { append, params, reader } = event;
        const ids = params.ids || [];
        const lib = this.libraryIDFromReader(reader);
        // Diagnostic — confirms the event fires and shows what's in
        // params. Only logs when the debug pref is on.
        this._dbg("[Weavero] _contextHandler fire: ids="
            + JSON.stringify(ids) + " currentID=" + (params.currentID || "")
            + " lib=" + lib);
        if (!ids.length) return;
        const key = params.currentID || ids[0];

        // Each `append({...})` call crosses the reader-iframe ↔ chrome
        // compartment boundary, so the captured environment of any
        // `onCommand` closure must be primitives (strings, numbers).
        // Capturing XPCOM objects (e.g. a Zotero.Item array) trips a
        // "Permission denied to pass object to privileged code" check
        // inside upstream `appendCustomItemGroups`, which propagates
        // back through dispatchEvent and halts our handler — silently
        // dropping every menu item beyond the offending append.
        // Wrapping each call in its own try/catch is a safety net so
        // a future regression in one entry can't take out the others.

        // "Add related item…" — independent of comment content, gated
        // only on the annotation existing. The same
        // `createAnnotationContextMenu` path fires for both right-click
        // on an annotation AND the 3-dots ("more") button in the
        // sidebar header, so this single entry covers both.
        //
        // Resolve once now (so we know whether to show the entry and
        // what label to use), but capture only the primitive keys +
        // libraryID in the closure. Re-resolve to live items at click
        // time. This avoids the cross-compartment trap that broke
        // v0.3.7's version of this entry — that one captured the
        // resolved Zotero.Item array and threw on every menu open.
        const annKeys = [];
        for (const id of ids) {
            const ann = this._getAnnotationItem(lib, id);
            if (ann) annKeys.push(ann.key);
        }
        this._dbg("[Weavero] _contextHandler resolved " + annKeys.length
            + "/" + ids.length + " annotation item(s)");
        if (annKeys.length) {
            const capturedLib  = lib;
            const capturedKeys = annKeys.slice();
            // Capture `self` instead of relying on `this` inside the
            // closure: upstream Zotero clones our menu item object via
            // `Components.utils.cloneInto(..., { cloneFunctions: true })`
            // when forwarding into the reader iframe, and although the
            // cloned function still executes in chrome when invoked,
            // resolving `this` through the cloned reflector has been
            // observed to crash the process. A direct named binding
            // sidesteps that path entirely.
            const self = this;
            try {
                append({
                    label: annKeys.length > 1
                        ? "Add Related…  (" + annKeys.length + " annotations)"
                        : "Add Related…",
                    onCommand: () => {
                        // Defer to next tick so the context menu fully
                        // closes / unwinds in the reader iframe before
                        // we open a new chrome dialog. Opening a modal-
                        // ish dialog while the menu is still tearing
                        // down has been the trigger of native crashes
                        // when chrome/iframe lifetimes overlap.
                        const win = Zotero.getMainWindow();
                        const setTimeoutFn = win && win.setTimeout
                            ? win.setTimeout.bind(win)
                            : setTimeout;
                        setTimeoutFn(() => {
                            try {
                                const fresh = capturedKeys
                                    .map(k => self._getAnnotationItem(
                                        capturedLib, k))
                                    .filter(Boolean);
                                Zotero.debug(
                                    "[Weavero] add-related onCommand: "
                                    + "resolved " + fresh.length + "/"
                                    + capturedKeys.length
                                    + " item(s) at click time");
                                if (!fresh.length) return;
                                self._addRelatedItemDialog(fresh)
                                    .catch(err => Zotero.debug(
                                        "[Weavero] _addRelatedItemDialog"
                                        + " rejected: " + err));
                            } catch (innerErr) {
                                Zotero.debug(
                                    "[Weavero] add-related onCommand "
                                    + "deferred err: " + innerErr);
                            }
                        }, 0);
                    },
                });
            } catch (e) {
                Zotero.debug(
                    "[Weavero] _contextHandler add-related append err: " + e);
            }
        }
    };

    /** Open Zotero's standard select-items dialog filtered to the
     *  annotation's library, then add a symmetric `dc:relation` triple
     *  between every picked item and every annotation in `annotations`.
     *
     *  Mirrors upstream `relatedBox.js`'s `add` flow exactly — same
     *  dialog, same XPCOM path (`Zotero.Items.getAsync` →
     *  `addRelatedItem` → `save` inside a single transaction). The
     *  resulting `notify('modify', 'item', ...)` callbacks fire our
     *  notifier hook, which refreshes the relations icons across both
     *  reader sidebar and right pane — no need to re-render manually. */
    async _addRelatedItemDialog(annotations) {
        const list = Array.isArray(annotations) ? annotations : [annotations];
        const anchor = list[0];
        if (!anchor) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        try {
            const io = {
                dataIn: null,
                dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-related-select",
                filterLibraryIDs: [anchor.libraryID],
            };
            win.openDialog(
                "chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            await io.deferred.promise;
            if (!io.dataOut || !io.dataOut.length) return;

            const targets = await Zotero.Items.getAsync(io.dataOut);
            if (!targets.length) return;
            // Cross-library relations aren't supported by Zotero's
            // relation predicate (URIs are library-scoped). Same alert
            // text upstream uses when blocking this case.
            if (targets[0].libraryID !== anchor.libraryID) {
                Zotero.alert(null, "",
                    "You cannot relate items in different libraries.");
                return;
            }

            await Zotero.DB.executeTransaction(async () => {
                for (const ann of list) {
                    for (const target of targets) {
                        // Skip self-relation. addRelatedItem also
                        // returns false if the relation already exists
                        // — we honor its return so we only save when
                        // something actually changed.
                        if (target.id === ann.id) continue;
                        if (ann.addRelatedItem(target)) {
                            await ann.save({ skipDateModifiedUpdate: true });
                        }
                        if (target.addRelatedItem(ann)) {
                            await target.save({ skipDateModifiedUpdate: true });
                        }
                    }
                }
            });
        } catch (e) {
            Zotero.debug("[Weavero] _addRelatedItemDialog err: " + e.message);
        }
    }

    /** Hook the items-tree right-click menu (`#zotero-itemmenu`) and
     *  insert "Add related item…" when the right-clicked selection
     *  contains at least one annotation. Mirrors the entry the plugin
     *  contributes to the reader's annotation context menu (see
     *  `_contextHandler`) so the same affordance is available from the
     *  items list, which is otherwise the only surface where you can
     *  reach annotations without opening the reader.
     *
     *  Pattern: bind `popupshowing` once, rebuild the entry on each
     *  open (selection changes between opens), strip it on
     *  `popuphidden` so we never leave a stale entry in the DOM. The
     *  command resolves a fresh annotation array at click time so a
     *  selection-mutation between popupshowing and command can't
     *  capture stale items. */
    _setupItemsListContextMenu() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-itemmenu");
            if (!menu) return;
            this._teardownItemsListContextMenu();
            const ADD_REL_ID = "wv-itemmenu-add-related";
            const COPY_LINK_ID = "wv-itemmenu-copy-link";
            const SEP_ID = "wv-itemmenu-separator";
            // Include any item type that has an `addRelatedItem`
            // method — annotations, attachments, regular items, and
            // notes all support the dc:relation predicate. Excludes
            // pure collections / search rows. Same capability check
            // is reused for Copy Item Link since `zotero://select`
            // works for any item type.
            const isRelatable = (it) => !!it && (
                (it.isAnnotation && it.isAnnotation())
                || (it.isAttachment && it.isAttachment())
                || (it.isRegularItem && it.isRegularItem())
                || (it.isNote && it.isNote())
            );
            // Build a `zotero://select/...` URI for an item, picking
            // the right library prefix (`library` vs `groups/<gid>`)
            // so the link works for both personal and group items.
            const buildSelectURI = (item) => {
                let prefix = "library";
                try {
                    if (!Zotero.Libraries.isUserLibrary(item.libraryID)) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(
                            item.libraryID);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                return "zotero://select/" + prefix + "/items/" + item.key;
            };
            const onShowing = () => {
                try {
                    // Remove any prior entries before re-adding.
                    for (const id of [ADD_REL_ID, COPY_LINK_ID, SEP_ID]) {
                        const stale = doc.getElementById(id);
                        if (stale) stale.remove();
                    }
                    const zp = win.ZoteroPane;
                    const selected = (zp && typeof zp.getSelectedItems === "function")
                        ? zp.getSelectedItems() : [];
                    const targets = selected.filter(isRelatable);
                    if (!targets.length) return;
                    const isDark = doc.documentElement
                        && doc.documentElement.classList.contains("wv-ui-dark");

                    // Order mirrors _buildAnnotationContextMenu
                    // exactly: Copy Item Link → separator → Add
                    // Related…. Keeps the same affordance ordering
                    // across both context-menu surfaces (annotation
                    // popup vs items-list).

                    // --- Copy Item Link --------------------------
                    // Mirrors the entry on the annotation context
                    // menu (_buildAnnotationContextMenu). Zotero
                    // doesn't expose this in the items-tree menu by
                    // default, so we add it for parity with the
                    // annotation surface. Multi-selection: copy
                    // newline-separated URIs so the user gets one
                    // link per selected item.
                    const cl = doc.createXULElement("menuitem");
                    cl.id = COPY_LINK_ID;
                    cl.setAttribute("label", targets.length > 1
                        ? "Copy Item Links  (" + targets.length + " items)"
                        : "Copy Item Link");
                    const linkIconURL = this._menuItemIconURL;
                    if (linkIconURL) {
                        cl.classList.add("menuitem-iconic");
                        cl.setAttribute("image", linkIconURL);
                    }
                    cl.addEventListener("command", () => {
                        try {
                            const zp2 = win.ZoteroPane;
                            const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                                ? zp2.getSelectedItems() : [];
                            const fresh = sel2.filter(isRelatable);
                            if (!fresh.length) return;
                            const uris = fresh.map(buildSelectURI).join("\n");
                            Zotero.Utilities.Internal.copyTextToClipboard(uris);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] itemmenu copy-link cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(cl);

                    // Separator between the two Weavero entries —
                    // matches the addSep() in
                    // _buildAnnotationContextMenu between Copy Item
                    // Link and Add Related….
                    const sep = doc.createXULElement("menuseparator");
                    sep.id = SEP_ID;
                    menu.appendChild(sep);

                    // --- Add Related… ----------------------------
                    const mi = doc.createXULElement("menuitem");
                    mi.id = ADD_REL_ID;
                    mi.setAttribute("label", targets.length > 1
                        ? "Add Related…  (" + targets.length + " items)"
                        : "Add Related…");
                    // Chain icon — semantic match for "Add Related…".
                    // Pick the theme-baked amber data URL so the icon
                    // matches the sidebar's `.wv-btn-relations` color
                    // (#7a4a00 light / #ffb84d dark) for visual
                    // consistency. The plugin's own _applyUIThemeClass
                    // toggles `wv-ui-dark` on the main window's
                    // documentElement, which we use as the theme signal.
                    const relIconURL = isDark
                        ? this._relationsIconURLDark
                        : this._relationsIconURLLight;
                    if (relIconURL) {
                        mi.classList.add("menuitem-iconic");
                        mi.setAttribute("image", relIconURL);
                    }
                    mi.addEventListener("command", async () => {
                        try {
                            const zp2 = win.ZoteroPane;
                            const sel2 = (zp2 && typeof zp2.getSelectedItems === "function")
                                ? zp2.getSelectedItems() : [];
                            const fresh = sel2.filter(isRelatable);
                            if (!fresh.length) return;
                            await this._addRelatedItemDialog(fresh);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] itemmenu add-related cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(mi);
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] itemmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    for (const id of [ADD_REL_ID, COPY_LINK_ID, SEP_ID]) {
                        const el = doc.getElementById(id);
                        if (el) el.remove();
                    }
                } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._itemMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupItemsListContextMenu err: " + e);
        }
    }

    _teardownItemsListContextMenu() {
        if (!this._itemMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._itemMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                for (const id of ["wv-itemmenu-add-related", "wv-itemmenu-copy-link", "wv-itemmenu-separator"]) {
                    const stale = menu.ownerDocument.getElementById(id);
                    if (stale) stale.remove();
                }
            } catch (e) {}
        } catch (e) {}
        this._itemMenuHandlers = null;
    }

    /** Hook the collections-tree right-click menu
     *  (`#zotero-collectionmenu`) and insert "Copy Collection Link"
     *  when the right-clicked row is a regular collection. Zotero
     *  doesn't expose a copy-link affordance for collections by
     *  default; this matches the items-list copy-link entry so users
     *  have a consistent way to drop `zotero://select/...` URIs.
     *
     *  Same lifecycle as `_setupItemsListContextMenu`: bind once,
     *  rebuild the entry on each open, strip on `popuphidden` so we
     *  never leave a stale entry. */
    _setupCollectionsContextMenu() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._teardownCollectionsContextMenu();
            const COPY_LINK_ID = "wv-collectionmenu-copy-link";
            // Build a `zotero://select/<lib-prefix>/collections/<key>`
            // URI for a collection. Same library-prefix logic as the
            // items-list copy-link.
            const buildCollectionURI = (col) => {
                let prefix = "library";
                try {
                    if (!Zotero.Libraries.isUserLibrary(col.libraryID)) {
                        const gid = Zotero.Groups.getGroupIDFromLibraryID(
                            col.libraryID);
                        if (gid) prefix = "groups/" + gid;
                    }
                } catch (e) {}
                return "zotero://select/" + prefix + "/collections/" + col.key;
            };
            const onShowing = () => {
                try {
                    const stale = doc.getElementById(COPY_LINK_ID);
                    if (stale) stale.remove();
                    const zp = win.ZoteroPane;
                    // Skip when the right-clicked row isn't a real
                    // collection (could be a library root, saved
                    // search, feed, or trash). `getSelectedCollection`
                    // returns the Collection object for a collection
                    // row; everything else returns null/false.
                    const col = (zp && typeof zp.getSelectedCollection === "function")
                        ? zp.getSelectedCollection() : null;
                    if (!col || !col.key) return;
                    const cl = doc.createXULElement("menuitem");
                    cl.id = COPY_LINK_ID;
                    cl.setAttribute("label", "Copy Collection Link");
                    const linkIconURL = this._menuItemIconURL;
                    if (linkIconURL) {
                        cl.classList.add("menuitem-iconic");
                        cl.setAttribute("image", linkIconURL);
                    }
                    cl.addEventListener("command", () => {
                        try {
                            // Re-resolve at click time in case the
                            // selection moved between popupshowing
                            // and the user actually clicking.
                            const zp2 = win.ZoteroPane;
                            const col2 = (zp2 && typeof zp2.getSelectedCollection === "function")
                                ? zp2.getSelectedCollection() : null;
                            if (!col2 || !col2.key) return;
                            const uri = buildCollectionURI(col2);
                            Zotero.Utilities.Internal.copyTextToClipboard(uri);
                        } catch (cmdErr) {
                            Zotero.debug(
                                "[Weavero] collectionmenu copy-link cmd err: " + cmdErr);
                        }
                    });
                    menu.appendChild(cl);
                } catch (showErr) {
                    Zotero.debug(
                        "[Weavero] collectionmenu popupshowing err: " + showErr);
                }
            };
            const onHidden = () => {
                try {
                    const el = doc.getElementById(COPY_LINK_ID);
                    if (el) el.remove();
                } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._collectionMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsContextMenu err: " + e);
        }
    }

    _teardownCollectionsContextMenu() {
        if (!this._collectionMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._collectionMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                const stale = menu.ownerDocument.getElementById("wv-collectionmenu-copy-link");
                if (stale) stale.remove();
            } catch (e) {}
        } catch (e) {}
        this._collectionMenuHandlers = null;
    }

    // ---- In-PDF annotation popup (MutationObserver) -----------------------

    _screenCoords(el) {
        try {
            const iwin = el.ownerDocument.defaultView;
            const r = el.getBoundingClientRect();
            if (typeof iwin.mozInnerScreenX !== "number") return null;
            return { x: iwin.mozInnerScreenX + r.left + r.width / 2,
                     y: iwin.mozInnerScreenY + r.bottom + 2 };
        } catch { return null; }
    }

    _findAnnotationKey(popup, reader) {
        // 1. Content element with 8-char ID
        const contentEl = popup.querySelector(".comment .content[id]");
        if (contentEl) {
            const id = contentEl.getAttribute("id");
            if (/^[A-Z0-9]{8}$/.test(id)) return id;
        }
        // 2. Known data attributes — check the element itself first (Zotero's
        // sidebar rows carry `data-sidebar-annotation-id` on the .annotation
        // div), then walk descendants. Without the self-check we'd skip
        // straight to the selected-annotation fallback for any unselected
        // row whose comment .content lacks an id, attributing icons to the
        // wrong annotation or dropping them entirely.
        for (const attr of [
            "data-annotation-id", "data-key", "data-id",
            "data-sidebar-annotation-id"
        ]) {
            if (popup && popup.getAttribute) {
                const own = popup.getAttribute(attr);
                if (own && /^[A-Z0-9]{8}$/.test(own)) return own;
            }
            const el = popup.querySelector("[" + attr + "]");
            if (el) {
                const v = el.getAttribute(attr);
                if (/^[A-Z0-9]{8}$/.test(v)) return v;
            }
        }
        // 3. Reader internal state
        try {
            const ir = reader && reader._internalReader;
            for (const src of [
                ir && ir._state && ir._state.selectedAnnotationIDs,
                ir && ir.selectedAnnotationIDs,
                ir && ir._readerInstance && ir._readerInstance._state &&
                    ir._readerInstance._state.selectedAnnotationIDs
            ]) {
                if (Array.isArray(src) && src.length) return src[0];
            }
        } catch {}
        return null;
    }

    _injectIconIntoPopup(popup, reader) {
        if (!this._getEnableReaderView()) return;
        try {
            const preview = popup.querySelector(".preview");
            if (!preview) return;
            const header = preview.querySelector("header");
            if (!header) return;
            const commentEl = preview.querySelector(".comment");

            if (!commentEl) {
                // Popup lost its comment — remove stale button
                preview.querySelector("." + BTN_POPUP_CLASS)?.remove();
                return;
            }

            // Render markdown + URLs into a sibling .wv-md-preview pane,
            // mirroring the sidebar's architecture. .content stays as raw
            // text (editable); CSS swaps which one is visible based on the
            // wv-comment-preview / wv-editing classes that focusin/focusout
            // manage globally for every .content in the reader iframe. This
            // path replaces the older in-place _markTextLinks treatment which
            // could only colourise URLs and missed every other markdown form.
            this._renderPreviewPanel(commentEl);

            const target = header.querySelector(".end") || header;
            const existingBtn = target.querySelector("." + BTN_POPUP_CLASS);

            const lib     = this.libraryIDFromReader(reader);
            const key     = this._findAnnotationKey(popup, reader);
            const comment = this.getModelComment(lib, key) ?? (commentEl.textContent || "");
            const anchors = this.collectAnchorURLs(commentEl);
            const hasURIs = this._iconWantedFor(comment) || anchors.length > 0;

            // Decide whether the popup-icon button adds value here. Same
            // logic as the right pane and reader sidebar (_iconAddsValueBeyondInline)
            // — show only when inline rendering can't carry the comment by
            // itself, OR when the popup text is overflowing so some content
            // may be clipped.
            let shouldShow = this._iconWantedFor(comment)
                && this._iconAddsValueBeyondInline(comment);
            if (!shouldShow && hasURIs) {
                try {
                    shouldShow =
                        popupTextEl.scrollHeight > popupTextEl.clientHeight + 1
                        || popupTextEl.scrollWidth > popupTextEl.clientWidth + 1;
                } catch(e) { shouldShow = false; }
            }
            if (!shouldShow) {
                existingBtn?.remove();
                return;
            }
            if (existingBtn) return;

            const doc = popup.ownerDocument;
            const btn = doc.createElement("button");
            btn.className = BTN_CLASS + " " + BTN_POPUP_CLASS;
            btn.setAttribute("tabindex", "-1");
            this._applyIconState(btn, comment);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                const freshKey  = this._findAnnotationKey(popup, reader);
                const freshCmt  = this.getModelComment(lib, freshKey) ?? (commentEl.textContent || comment);
                const freshAnch = this.collectAnchorURLs(commentEl);
                const sc = this._screenCoords(btn);
                this.openCommentPopup(freshCmt, {
                    extraURLs: freshAnch,
                    ...(sc ? { anchorScreen: sc } : { anchorNode: btn })
                });
            });
            const moreBtn = target.querySelector("button.more");
            if (moreBtn) target.insertBefore(btn, moreBtn); else target.appendChild(btn);
        } catch (err) {
            Zotero.debug("[Weavero] _injectIconIntoPopup error: " + err.message);
        }
    }

    /** Build a keydown handler that removes badges for the currently-
     *  selected annotation(s) the moment the user presses Delete /
     *  Backspace, instead of waiting for Zotero's `delete` notifier
     *  to fire (which only happens after the DB transaction +
     *  notifier queue commit, ~100–300 ms later, often longer when
     *  the main thread is busy refreshing item rows). The badge then
     *  vanishes in the same render frame as the highlight does,
     *  matching the user's mental model of "delete = gone".
     *
     *  We also stamp each removed key into _recentlyDeletedKeys so
     *  the inner observer's debounced overlay scan (which runs
     *  ~100 ms later in response to our DOM removal) won't recreate
     *  the badge while Zotero's in-memory annotation cache is still
     *  catching up. That entry is cleared again either by the
     *  upcoming notifier delete (which sets it itself) or by a
     *  later `_processNoteAnnotationOverlays` pass when
     *  getAnnotations() stops returning the key.
     *
     *  Skipped on contenteditable / input / textarea targets so
     *  Backspace continues to edit comment text instead of nuking
     *  the annotation. */
    /** Probe every reachable signal for the currently-selected
     *  annotation key(s) and return the union (NOT first-non-empty).
     *  We've seen Zotero's `selectedAnnotationIDs` keep stale keys
     *  after a delete + new-annotation-create — the proactive
     *  Delete-key handler then targets the wrong (already-gone) key
     *  and the new annotation's badge survives until the slow
     *  notifier path fires. Pulling from every source we can find
     *  and validating each against the live DOM (caller's job)
     *  defangs stale keys: their badge is already gone so the
     *  validation drops them silently. */
    _findSelectedAnnotationKeys(reader) {
        const found = new Set();
        const addAll = (arr) => {
            if (!Array.isArray(arr)) return;
            for (const k of arr) {
                if (typeof k === "string" && /^[A-Z0-9]{8}$/.test(k)) {
                    found.add(k);
                }
            }
        };

        // Reader-level state (Zotero 10 exposes some shapes here).
        try {
            addAll(reader && reader._selectedAnnotationIDs);
            if (reader && reader._state) {
                addAll(reader._state.selectedAnnotationIDs);
            }
            if (reader && typeof reader.getSelectedAnnotationIDs === "function") {
                try { addAll(reader.getSelectedAnnotationIDs()); } catch (e2) {}
            }
        } catch (e) {}

        // Internal reader (the wrapper around the iframe viewer).
        try {
            const ir = reader && reader._internalReader;
            if (ir) {
                addAll(ir.selectedAnnotationIDs);
                if (ir._state) addAll(ir._state.selectedAnnotationIDs);
                if (ir._readerInstance && ir._readerInstance._state) {
                    addAll(ir._readerInstance._state.selectedAnnotationIDs);
                }
                if (typeof ir.getSelectedAnnotationIDs === "function") {
                    try { addAll(ir.getSelectedAnnotationIDs()); } catch (e2) {}
                }
            }
        } catch (e) {}

        // Open .annotation-popup elements. The popup carries the
        // annotation key on its `.comment .content[id]` child (also
        // probed via _findAnnotationKey).
        try {
            const data = this._readerObservers.get(reader) || {};
            const iwin = reader._iframeWindow
                || (reader._iframe && reader._iframe.contentWindow);
            const docs = [data.innerDoc, iwin && iwin.document].filter(Boolean);
            for (const doc of docs) {
                for (const popup of doc.querySelectorAll(".annotation-popup")) {
                    const k = this._findAnnotationKey(popup, reader);
                    if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
                }
            }
        } catch (e) {}

        // Click tracker (set when user clicks on a marker badge or
        // annotation popup — see _trackAnnotationSelection).
        try {
            const data = this._readerObservers.get(reader);
            const k = data && data.lastClickedAnnotationKey;
            if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
        } catch (e) {}

        // Last-touched annotation (set by the notifier when an
        // annotation is added or its comment modified — see the
        // 'add'/'modify' handlers in init()). Catches the case where
        // the user creates a highlight, edits its comment, then
        // immediately presses Delete: `selectedAnnotationIDs` may
        // still hold the previously-selected (now deleted) key, but
        // the modify notifier just fired with the new key.
        try {
            const data = this._readerObservers.get(reader);
            const k = data && data.lastTouchedAnnotationKey;
            if (k && /^[A-Z0-9]{8}$/.test(k)) found.add(k);
        } catch (e) {}

        return [...found];
    }

    _makeProactiveDeleteKeydown(reader, where) {
        return (e) => {
            try {
                if (e.key !== "Delete" && e.key !== "Backspace") return;
                const t = e.target;
                if (t) {
                    const tag = (t.tagName || "").toLowerCase();
                    if (tag === "input" || tag === "textarea" || tag === "select") return;
                    if (t.isContentEditable) return;
                }

                const selectedKeys = this._findSelectedAnnotationKeys(reader);
                this._dbg("[Weavero] proactive keydown @"
                    + where + ": key=" + e.key
                    + " target=" + (t ? (t.tagName + "." + (t.className || "")) : "?")
                    + " selected=" + JSON.stringify(selectedKeys));

                if (!selectedKeys.length) return;

                const now = Date.now();
                const data = this._readerObservers.get(reader) || {};
                const innerDoc = data.innerDoc || null;
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                const outerDoc = iwin && iwin.document;
                let removed = 0;
                const removedKeys = [];
                for (const key of selectedKeys) {
                    if (!key) continue;
                    // Validate: only act on keys whose badge actually
                    // exists in the DOM. This drops stale entries
                    // (e.g. a `selectedAnnotationIDs` that still
                    // contains an already-deleted key) without
                    // poisoning _recentlyDeletedKeys, which would
                    // otherwise suppress legitimate badge re-creation
                    // for up to 60 s.
                    let badgesForKey = [];
                    for (const doc of [innerDoc, outerDoc]) {
                        if (!doc) continue;
                        const list = doc.querySelectorAll(
                            ".wv-marker-badge[data-wv-for=\"" + key + "\"]");
                        for (const b of list) badgesForKey.push(b);
                    }
                    if (!badgesForKey.length) continue;
                    this._recentlyDeletedKeys.set(key, now);
                    for (const badge of badgesForKey) {
                        badge.remove();
                        removed++;
                    }
                    removedKeys.push(key);
                }
                if (removed) {
                    this._dbg("[Weavero] proactive delete-key removal: "
                        + removed + " badge(s) for keys="
                        + JSON.stringify(removedKeys)
                        + " (candidates=" + JSON.stringify(selectedKeys) + ")");
                }
            } catch (err) {
                Zotero.debug("[Weavero] proactive keydown error: " + err);
            }
        };
    }

    /** Track the most recently clicked annotation per reader so the
     *  proactive Delete/Backspace handler has a fallback when the
     *  reader's `selectedAnnotationIDs`-style state doesn't expose
     *  the live selection. We set the key whenever the click target
     *  resolves to a known annotation surface (marker badge,
     *  annotation popup, or the canvas-rendered icon area) and clear
     *  it when the user clicks somewhere unrelated.
     *
     *  Also doubles as a lightweight diagnostic: every recorded key
     *  is logged so the next debug log shows exactly which clicks
     *  populated the tracker. */
    _trackAnnotationSelection(reader, doc) {
        if (!doc) return null;
        const handler = (e) => {
            try {
                const data = this._readerObservers.get(reader);
                if (!data) return;
                let key = null;
                const path = (typeof e.composedPath === "function")
                    ? e.composedPath() : [];
                const candidates = path.length ? path : [e.target];
                for (const node of candidates) {
                    if (!node || !node.getAttribute) continue;
                    // Marker badge — has the key directly.
                    if (node.classList && node.classList.contains("wv-marker-badge")) {
                        const k = node.getAttribute("data-wv-for");
                        if (k && /^[A-Z0-9]{8}$/.test(k)) { key = k; break; }
                    }
                    // Annotation popup — extract via _findAnnotationKey.
                    if (node.classList && node.classList.contains("annotation-popup")) {
                        const k = this._findAnnotationKey(node, reader);
                        if (k && /^[A-Z0-9]{8}$/.test(k)) { key = k; break; }
                    }
                }
                if (key) {
                    data.lastClickedAnnotationKey = key;
                    this._dbg("[Weavero] selection tracker: key=" + key);
                }
                // Don't clear on unrelated clicks — Zotero's annotation
                // selection persists across e.g. a click on the canvas
                // outside any annotation, until the user actually picks
                // a different one. The _recentlyDeletedKeys gate stops
                // a stale key from causing a false delete.
            } catch (err) {}
        };
        doc.addEventListener("mousedown", handler, true);
        return handler;
    }

    async _setupReaderObserver(reader) {
        if (this._readerObservers.has(reader)) return;
        try {
            if (typeof reader._waitForReader === "function") await reader._waitForReader();
            else if (reader._initPromise) await reader._initPromise;

            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            if (!iwin || !iwin.document) return;
            const idoc = iwin.document;
            if (!idoc.body) {
                await new Promise(resolve => {
                    if (idoc.readyState === "complete") return resolve();
                    iwin.addEventListener("load", resolve, { once: true });
                });
            }

            // Inject scoped CSS into the iframe so URL spans are styled there too.
            this._injectReaderStyles(idoc);
            // Tag the outer reader iframe with .wv-ui-dark when needed
            // — the sidebar lives here and follows the UI theme.
            this._applyUIThemeClass();

            // Inject into any popups already open
            for (const p of idoc.querySelectorAll(".annotation-popup"))
                this._injectIconIntoPopup(p, reader);

            // Verbose edit-flow trace — observe every .content element
            // for mutations during edit. Track only the first ~5 elements
            // we encounter so we don't drown the log; reset on new doc.
            const _editTracedContents = new WeakSet();
            const traceContent = (content) => {
                if (!content || _editTracedContents.has(content)) return;
                _editTracedContents.add(content);
                try {
                    const mo = new iwin.MutationObserver(muts => {
                        for (const m of muts) {
                            try {
                                this._dbg("[Weavero][edit] content-mutation"
                                    + " type=" + m.type
                                    + " added=" + m.addedNodes.length
                                    + " removed=" + m.removedNodes.length
                                    + " kids=" + content.children.length
                                    + " text=" + JSON.stringify(String(content.textContent || "").slice(0, 40))
                                    + " active=" + (idoc.activeElement === content ? "ME"
                                        : this._elSummary(idoc.activeElement)));
                            } catch(err) {}
                        }
                    });
                    mo.observe(content, { childList: true, characterData: true, subtree: true });
                } catch(err) {}
            };
            // Initial sidebar pass after traceContent is defined.
            this._processReaderSidebar(idoc);
            try {
                for (const c of idoc.querySelectorAll(".annotation-row .comment .content, .annotation .comment .content")) {
                    traceContent(c);
                }
            } catch(err) {}

            // mousedown handler in the iframe — fires URL action on first click,
            // independent of whatever Zotero does on row selection.
            const sidebarMouseDown = (e) => {
                if (e.button !== 0) return;
                if (!e.target || !e.target.closest) return;
                // Verbose edit-flow trace — log every click that lands inside
                // an annotation comment area, even if we don't act on it.
                const inCommentArea = e.target.closest(
                    ".annotation-row .comment, .annotation .comment");
                if (inCommentArea) {
                    try {
                        const active = idoc.activeElement;
                        this._dbg("[Weavero][edit] mousedown in comment"
                            + " target=" + this._elSummary(e.target)
                            + " active=" + this._elSummary(active)
                            + " contentChildren=" + (inCommentArea.querySelector(".content")
                                ? inCommentArea.querySelector(".content").children.length
                                : "?")
                            + " contentEditable=" + (inCommentArea.querySelector(".content")
                                ? inCommentArea.querySelector(".content").contentEditable
                                : "?"));
                    } catch(err) {}
                }
                const urlSpan = e.target.closest(".wv-url-span");
                if (!urlSpan) return;
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
                // Markdown links [label](url) put the destination in
                // data-href because the visible textContent is the label,
                // not the URL itself.
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) return;
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
            };
            idoc.addEventListener("mousedown", sidebarMouseDown, true);

            let sidebarTimer = null;
            const scheduleSidebarScan = (delay) => {
                if (sidebarTimer) iwin.clearTimeout(sidebarTimer);
                sidebarTimer = iwin.setTimeout(() => {
                    sidebarTimer = null;
                    // Trace any new .content elements before the scan.
                    try {
                        for (const c of idoc.querySelectorAll(".annotation-row .comment .content, .annotation .comment .content")) {
                            traceContent(c);
                        }
                    } catch(err) {}
                    try { this._processReaderSidebar(idoc); }
                    catch(e) { Zotero.debug("[Weavero] sidebar scan error: " + e); }
                }, delay);
            };

            const observer = new iwin.MutationObserver(mutations => {
                let needsSyncScan = false;
                let needsCtxDecorate = false;
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.classList?.contains("annotation-popup"))
                            this._injectIconIntoPopup(node, reader);
                        else
                            node.querySelectorAll?.(".annotation-popup")
                                .forEach(p => this._injectIconIntoPopup(p, reader));
                        // Iframe-rendered annotation context menu — mounts
                        // as a `.context-menu` div under the iframe body
                        // when the user right-clicks an annotation. React
                        // renders the buttons synchronously with the
                        // wrapper, so they're already in the subtree by
                        // the time this observer fires.
                        if (node.classList?.contains("context-menu")
                            || node.querySelector?.(".context-menu")) {
                            needsCtxDecorate = true;
                        }
                        // Annotation row / comment additions: render the
                        // preview panel synchronously inside the observer
                        // callback (which is a microtask, runs before the
                        // next browser paint), so the raw .content text
                        // never flashes when the sidebar reopens. The
                        // data-source cache check in _renderPreviewPanel
                        // makes subsequent calls cheap.
                        if (node.matches?.(".annotation-row, .annotation, .comment")
                            || node.querySelector?.(
                                ".annotation-row .comment, .annotation .comment")) {
                            needsSyncScan = true;
                        }
                    }
                    // Also re-check when comment text mutates inside an existing popup
                    const popup = m.target?.closest?.(".annotation-popup");
                    if (popup) this._injectIconIntoPopup(popup, reader);
                }
                if (needsSyncScan) {
                    try { this._processReaderSidebar(idoc); }
                    catch(e) { Zotero.debug(
                        "[Weavero] sync sidebar scan: " + e); }
                }
                if (needsCtxDecorate) {
                    try { this.decorateContextMenu(idoc); }
                    catch(e) { Zotero.debug(
                        "[Weavero] context-menu decorate err: " + e); }
                }
                // Debounced safety-net scan for mutations we didn't classify
                // as a sync trigger (e.g. far-future Zotero DOM shapes).
                scheduleSidebarScan(80);
            });
            observer.observe(idoc.body || idoc.documentElement,
                { childList: true, subtree: true, characterData: true });

            // Overlay refresh after filter UI interaction. The annotation
            // filter (color / tag / author / search query) lives in the
            // outer iframe sidebar; toggling it updates the reader's
            // `_state.annotations[i]._hidden` flags but does NOT fire a
            // MutationObserver on the inner viewer iframe (the PDF view
            // re-renders annotations onto canvas, and pixel changes don't
            // trigger MO). Without an explicit hook our overlay badges
            // would stay floating over annotations the reader has hidden.
            //
            // Hook clicks (filter button toggles) and keyup (search field
            // typing) on the outer iframe and schedule a debounced
            // re-process of the inner overlays.
            let overlayRefreshTimer = null;
            const scheduleOverlayRefresh = () => {
                if (overlayRefreshTimer) iwin.clearTimeout(overlayRefreshTimer);
                overlayRefreshTimer = iwin.setTimeout(() => {
                    overlayRefreshTimer = null;
                    try {
                        const cached = this._readerObservers
                            && this._readerObservers.get(reader);
                        const innerDoc = cached && cached.innerDoc;
                        if (innerDoc) {
                            this._processNoteAnnotationOverlays(innerDoc, reader);
                            this._sweepStaleOverlays(innerDoc, reader);
                        }
                    } catch(e) {
                        Zotero.debug("[Weavero] overlay refresh err: " + e);
                    }
                }, 300);
            };
            idoc.addEventListener("click", scheduleOverlayRefresh, true);
            idoc.addEventListener("keyup", scheduleOverlayRefresh, true);

            // Preview-panel architecture (v0.0.106):
            // .content stays plain text — we never inject spans into it, so
            // Zotero's editor never sees foreign DOM. Instead we render a
            // sibling .wv-md-preview inside .comment showing the formatted
            // version. CSS (wv-comment-preview class) hides .content and
            // shows the preview when not editing; the wv-editing class on
            // .comment swaps which one is visible during edit mode.
            //
            // Focus on .content -> add wv-editing (raw shows, preview hides).
            // Blur from .content -> remove wv-editing, regenerate preview
            // from the post-edit text via scheduleSidebarScan.
            const sidebarFocusIn = (e) => {
                try {
                    const target = e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest(".comment");
                    if (cmt) cmt.classList.add("wv-editing");
                } catch(e2) {
                    Zotero.debug("[Weavero] focusin handler error: " + e2);
                }
            };
            idoc.addEventListener("focusin", sidebarFocusIn, true);

            const sidebarFocusOut = (e) => {
                try {
                    const target = e && e.target;
                    if (target && target.classList && target.classList.contains("content")) {
                        const cmt = target.closest(".comment");
                        if (cmt) cmt.classList.remove("wv-editing");
                    }
                } catch(err) {}
                scheduleSidebarScan(80);
            };
            idoc.addEventListener("focusout", sidebarFocusOut, true);

            // Click forwarder: clicks on the preview-panel body should focus
            // the sibling .content so Zotero's editor takes over. Clicks on
            // a URL span inside the preview are already handled by
            // sidebarMouseDown (it scans for .wv-url-span first).
            //
            // Native Zotero behaviour: the first click on an annotation row
            // selects the row; once selected, a click on the comment enters
            // edit mode. We mirror that by only forwarding into edit mode
            // when the .annotation is already .selected. For the first
            // click on an unselected row we don't preventDefault, so the
            // event bubbles up to Zotero's row-select handler.
            const sidebarPreviewClick = (e) => {
                try {
                    const target = e && e.target;
                    if (!target || !target.closest) return;
                    if (target.closest(".wv-url-span")) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (target in .wv-url-span)");
                        return;
                    }
                    const preview = target.closest(".wv-md-preview");
                    if (!preview) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (no .wv-md-preview ancestor)");
                        return;
                    }
                    const annotation = preview.closest(".annotation, .annotation-row");
                    const popup = preview.closest(".annotation-popup");
                    this._dbg("[Weavero] sidebarPreviewClick: target=" + this._elSummary(target)
                        + " hasPreview=true popup=" + !!popup
                        + " annotation=" + (annotation ? "."+annotation.className : "null")
                        + " selected=" + !!(annotation && annotation.classList.contains("selected")));
                    if (!popup && (!annotation || !annotation.classList.contains("selected"))) {
                        this._dbg("[Weavero] sidebarPreviewClick: skip (not popup & row not selected)");
                        return;
                    }
                    const cmt = preview.closest(".comment");
                    const content = cmt && cmt.querySelector(".content");
                    if (!content) return;
                    e.preventDefault();
                    e.stopPropagation();
                    cmt.classList.add("wv-editing");
                    // Defer focus + caret placement to the next animation
                    // frame. Adding wv-editing un-hides .content via CSS,
                    // but the layout hasn't applied yet — calling focus()
                    // synchronously on a still-display:none element can
                    // fail silently (this is what made edit-mode appear
                    // dead in the in-document annotation popup).
                    const win = idoc.defaultView;
                    const raf = (win && win.requestAnimationFrame)
                        ? win.requestAnimationFrame.bind(win)
                        : (cb) => setTimeout(cb, 0);
                    raf(() => {
                        try {
                            content.focus();
                            // Place the caret at the end of the text so typing
                            // appends to the existing comment instead of replacing.
                            const sel = win && win.getSelection && win.getSelection();
                            if (sel) {
                                const range = idoc.createRange();
                                range.selectNodeContents(content);
                                range.collapse(false);
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }
                        } catch(err) {}
                    });
                } catch(e2) {
                    Zotero.debug("[Weavero] preview click error: " + e2);
                }
            };
            idoc.addEventListener("mousedown", sidebarPreviewClick, true);

            // Proactive Delete/Backspace handler — see
            // _makeProactiveDeleteKeydown for the rationale (skips the
            // ~100–300 ms wait between keystroke and the notifier
            // delete event). The reader has a deep frame stack
            // (Zotero main window > reader iframe > PDF.js viewer
            // iframe), and Zotero's own keyboard handlers attach at
            // the WINDOW level on these frames — a document-only
            // capture listener gets stopImmediatePropagation()'d
            // before it ever fires. So we attach at both window and
            // document on every frame the reader spans, with a label
            // so the diagnostic tells us which one actually caught
            // the keystroke.
            const proactiveOuterDoc =
                this._makeProactiveDeleteKeydown(reader, "outer-doc");
            const proactiveOuterWin =
                this._makeProactiveDeleteKeydown(reader, "outer-win");
            idoc.addEventListener("keydown", proactiveOuterDoc, true);
            iwin.addEventListener("keydown", proactiveOuterWin, true);

            // Selection tracker — see _trackAnnotationSelection.
            // _readerObservers.set has to happen first so the click
            // handler can find the data record.
            this._readerObservers.set(reader, {
                observer, sidebarMouseDown, sidebarFocusIn, sidebarFocusOut,
                sidebarPreviewClick,
                proactiveOuterDoc, proactiveOuterWin,
                proactiveOuterWindow: iwin
            });
            const selectionTrackerOuter =
                this._trackAnnotationSelection(reader, idoc);
            const dataAfterTracker = this._readerObservers.get(reader) || {};
            dataAfterTracker.selectionTrackerOuter = selectionTrackerOuter;
            this._readerObservers.set(reader, dataAfterTracker);

            // Also wire up text-annotation handling in the nested PDF.js iframe.
            // (The drag tracker for canvas annotations is wired from
            // INSIDE _setupInnerReaderObserver's wireUp closure — pointer
            // events on PDF.js's canvas fire only in the inner iframe and
            // do not bubble across the iframe boundary, so binding on
            // the outer doc never sees a highlight/image resize.)
            try { this._setupInnerReaderObserver(reader, idoc); }
            catch(e) { Zotero.debug("[Weavero] inner setup error: " + e); }
        } catch (err) {
            Zotero.debug("[Weavero] _setupReaderObserver error: " + err.message);
        }
    }

    /** Inject minimal CSS into the reader iframe (URL span colors + cursor).
     *  Defensive remove-then-add: see `_ensureReaderOuterStyles` for the
     *  rationale — a stale style element from a previous plugin instance
     *  must be replaced, not skipped, so the new code's rules win. */
    _injectReaderStyles(idoc) {
        if (!idoc) return;
        const existing = idoc.getElementById("weavero-reader-styles");
        if (existing) existing.remove();
        const s = idoc.createElement("style");
        s.id = "weavero-reader-styles";
        s.textContent = [
            ":root { --wv-link-http: #1a73e8;"
                + " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }",
            ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
                + " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }",
            ".wv-url-span { cursor: pointer !important; }",
            ".wv-url-span.wv-link-http   { color: var(--wv-link-http); }",
            ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero); }",
            ".wv-url-span.wv-link-app    { color: var(--wv-link-app); }",
            ".wv-link { cursor: pointer !important; }",
            // Mirror the main-window suppress rule inside the reader
            // iframe so a right-click in the sidebar / popup also
            // switches cursor to default and hides our tooltip while
            // the menu is up. The class on the OUTER documentElement
            // doesn't reach inside the iframe, so we apply our own
            // class on the iframe's root via the menu open/close path.
            ":root.wv-context-menu-open .wv-url-span,",
            ":root.wv-context-menu-open .wv-link { cursor: default !important; }",
            ":root.wv-context-menu-open .wv-url-tooltip { display: none !important; }",
            // Sidebar / popup button (the 🔗 icon) lives inside the reader
            // iframe, so we have to give it cursor:pointer here too — the
            // main-window stylesheet doesn't reach this document.
            ".wv-btn { cursor: pointer; opacity: 1;"
            + " transition: background 0.15s;"
            + " background: transparent; border: none;"
            + " padding: 1px 3px; border-radius: 3px; }",
            ".wv-btn:hover {"
            + " background: rgba(0, 0, 0, 0.07); }",
            ":root.wv-ui-dark .wv-btn:hover {"
            + " background: rgba(255, 255, 255, 0.08); }",
            // Chain SVG sizing for the reader iframe — same rule as
            // PLUGIN_CSS so URL-bearing buttons render the icon correctly.
            ".wv-link-svg {"
            + " width: 1em; height: 1em; display: block; flex-shrink: 0; }",
            // Plugin icon prepended to our annotation-context-menu items
            // by `decorateContextMenu`. Wrapped in `<div class="icon">`
            // so upstream's `.context-menu .icon` rules handle layout;
            // only the <img> itself needs sizing.
            ".context-menu .row.basic .wv-menuitem-icon {"
            + " width: 16px; height: 16px;"
            + " display: block; object-fit: contain; }",
            // Inline relations SVG used by `decorateContextMenu` for
            // "Add related item…". Same amber-brown as the sidebar's
            // `.wv-btn-relations` (the relations icon next to the
            // annotation header), so the menu entry visually matches
            // the icon the user sees on the annotation itself.
            //   Light theme: #7a4a00 (dark amber)
            //   Dark theme:  #ffb84d (light amber)
            // Theme detection via prefers-color-scheme — the reader
            // iframe doesn't reliably carry the wv-ui-dark / wv-reader-dark
            // class at this level, but it does honour the media query.
            ".context-menu .row.basic .icon .wv-relations-svg {"
            + " width: 16px; height: 16px; display: block; }",
            ".context-menu .row.basic .icon .wv-relations-svg path {"
            + " fill: #7a4a00 !important; }",
            "@media (prefers-color-scheme: dark) {",
            "  .context-menu .row.basic .icon .wv-relations-svg path {"
            + " fill: #ffb84d !important; }",
            "}",
        ].join("\n");
        (idoc.head || idoc.documentElement).appendChild(s);
    }

    /** Replace `el`'s contents with text + colored .wv-url-span elements.
     *  Mirrors the items-tree rebuild: drops any pre-existing structure
     *  (including Zotero-injected <a href> anchors) so URLs are styled
     *  consistently and clickable through our own handler. */
    _markTextLinks(el, opts) {
        if (!el || !el.querySelectorAll) return false;
        // Mode 2 (icons only): leave comment text plain.
        if (!this._getInlineLinks()) return false;

        // "tree" mode is set by the items-tree note/text-annotation row pass
        // (see _markCellLinks). Two differences from sidebar mode:
        //   1. Markdown rendering is gated on the user-facing
        //      enableCommentMarkdown pref instead of the hidden
        //      the (now-removed) experimental sidebar markdown toggle, because items-tree rows
        //      aren't editable so the v0.0.97 edit-mode breakage doesn't
        //      apply.
        //   2. Markdown markers (**, *, ~~, `) are stripped from the output
        //      so the row reads like the formatted preview, matching how
        //      highlight rows render via _markCellLinks's full rebuild.
        const isTreeMode = !!(opts && opts.mode === "tree");

        const doc = el.ownerDocument;

        // Don't touch a comment that's being edited — rebuilding the children
        // wipes the caret position, so each keystroke would reset the cursor
        // to position 0. We probe several signals here:
        //   1. el itself or a descendant is the focused element (typical
        //      case when user is typing into a contenteditable child of el).
        //   2. focused element is an ANCESTOR of el (Zotero's reader marks
        //      the outer .comment as the contenteditable container, so focus
        //      lives there while we're marking the inner .content).
        //   3. the selection's anchor node is inside el (covers transient
        //      focus loss on per-keystroke save → re-render — the active
        //      element bounces but the caret/selection stays in el).
        // We deliberately don't gate on the contenteditable attribute itself
        // because Zotero's reader sets contenteditable="" permanently on its
        // .content wrapper to make click-to-edit work; that would block all
        // marking, not just during active editing.
        // IMPORTANT: This MUST run before the stale-span detection below.
        // If the user is typing inside a span, unwrapping mid-edit thrashes
        // the contenteditable element and causes a hang.
        const active = doc && doc.activeElement;
        let activeRelated = false;
        if (active) {
            if (active === el) {
                this._dbg("[Weavero] _markTextLinks skip: active === el");
                return false;
            }
            if (el.contains(active)) {
                this._dbg("[Weavero] _markTextLinks skip: el.contains(active)");
                return false;
            }
            if (active.contains(el) && active.isContentEditable) {
                this._dbg("[Weavero] _markTextLinks skip: contenteditable ancestor focused");
                return false;
            }
            // Activity is "related" to el if focus is somewhere that could be
            // a transient blur during per-keystroke save (e.g. body briefly
            // takes focus before Zotero restores it). The classic non-related
            // case is focus on the iframe element or some sibling — at that
            // point the user has clearly clicked away and the selection
            // anchor (if still inside el) is stale.
            const tag = (active.tagName || "").toLowerCase();
            activeRelated = (tag === "body" || tag === "html" || active === doc.documentElement);
        } else {
            // No focused element at all — could be transient blur. Treat
            // selection anchor as authoritative.
            activeRelated = true;
        }
        if (activeRelated) {
            try {
                const win = doc && doc.defaultView;
                const sel = win && win.getSelection && win.getSelection();
                if (sel && sel.anchorNode && el.contains(sel.anchorNode)) {
                    this._dbg("[Weavero] _markTextLinks skip: selection anchor inside el (active=" + ((active && active.tagName) || "null") + ")");
                    return false;
                }
            } catch(e) { /* getSelection may throw in some doc contexts */ }
        }

        // We're not editing — safe to inspect. If our spans are already
        // present, compare them against the URLs in the current text:
        //   • exact match → skip (cache hit, common case).
        //   • count differs → likely React reconciliation corruption from a
        //     re-render that left our spans mixed with newly-injected text.
        //     We can't reliably "fix" this from inside without making the
        //     DOM more wrong; bail and wait for the next mutation. The
        //     focusin pre-unwrap (added in the sidebar listener) prevents
        //     this state from arising in the first place during edits.
        //   • same count, different URL text → an in-URL edit; unwrap and
        //     rebuild.
        const existing = el.querySelectorAll(".wv-url-span");
        if (existing.length) {
            const textNow = this.normalize(el.textContent || "");
            const reNow = new RegExp(this.URL_REGEX.source, "g");
            const want = [];
            let mNow;
            while ((mNow = reNow.exec(textNow)) !== null) {
                want.push(mNow[0].replace(this.TRAILING_RE, ""));
            }
            const have = [];
            for (const s of existing) have.push((s.textContent || "").trim());
            if (want.length !== have.length) {
                this._dbg("[Weavero] _markTextLinks skip: span count mismatch (have=" + have.length + " want=" + want.length + ") — leaving DOM alone");
                return false;
            }
            let same = true;
            for (let i = 0; i < want.length; i++) {
                if (want[i] !== have[i]) { same = false; break; }
            }
            if (same) {
                // Patch hover-tooltip title onto existing URL spans
                // that were created by an earlier plugin version
                // (pre-0.1.47) which didn't set the attribute.
                for (const sp of existing) {
                    if (!sp.hasAttribute("title")) {
                        const u = sp.getAttribute("data-href")
                            || sp.textContent || "";
                        if (u) sp.setAttribute("title", u);
                    }
                }
                this._dbg("[Weavero] _markTextLinks skip: spans match current URLs (" + want.length + ")");
                return false;
            }
            this._dbg("[Weavero] _markTextLinks: in-URL edit detected, unwrapping " + have.length + " spans and rebuilding");
            for (const s of existing) {
                s.replaceWith(doc.createTextNode(s.textContent || ""));
            }
            // Fall through to full rebuild below.
        }

        // Source-text recovery. Once we've rebuilt this element, our
        // children produce a textContent that's the STRIPPED form of the
        // original raw text (e.g. "bold something" instead of "**bold**
        // something"). If Zotero's reconciliation later removes our spans,
        // textContent loses the markdown markers / link URLs entirely and
        // we can't recreate the original from it. Stash the raw text in
        // `data-wv-raw` on rebuild and prefer it here when we can verify
        // the live text is still the form we last produced.
        const cachedRaw = el.getAttribute("data-wv-raw");
        const cachedRendered = el.getAttribute("data-wv-rendered");
        const liveText = el.textContent || "";
        const hasOurMarkers = !!el.querySelector(".wv-md, .wv-url-span");
        let text;
        if (hasOurMarkers) {
            text = cachedRaw || liveText;
        } else if (cachedRaw && cachedRendered !== null
                   && liveText === cachedRendered) {
            // Spans were reaped after our last rebuild; raw cache is the
            // source of truth.
            text = cachedRaw;
        } else {
            text = liveText;
        }
        // Markdown formatting (bold/italic/strike/code) only renders in tree
        // mode — items-tree note/text rows. Non-tree callers (the rare
        // contenteditable fallback in the right pane / sidebar) only need
        // URL marking + markdown-link rendering, both of which work
        // regardless of useMd. Full popup / sidebar markdown rendering goes
        // through _renderPreviewPanel and _renderPaneCommentInline now.
        const useMd = isTreeMode && this._getEnableCommentMarkdown();
        const hasMd = useMd && this.MD_REGEX.test(this.normalize(text));
        if (!this.hasURI(text) && !hasMd) return false;

        const norm = this.normalize(text);

        // Idempotency cache: encodes mode + content. For markdown-only
        // content (no URLs), the .wv-url-span cache check above is a no-op
        // because querySelectorAll returns 0, so without this we rebuilt
        // the DOM on every call. The popup observer in _setupReaderObserver
        // routes every popup mutation back to _injectIconIntoPopup, so a
        // non-idempotent _markTextLinks turns into an infinite loop:
        // rebuild → mutations → observer fires → _injectIconIntoPopup →
        // _markTextLinks → rebuild. Hangs Zotero. Same trick the right-pane
        // preview panel and items-list cells use.
        //
        // Honour the cache only if THREE conditions hold:
        //   1. data-wv-source matches the cache key.
        //   2. liveText matches data-wv-rendered (no partial reap that
        //      shifted textContent).
        //   3. The expected spans are still in the DOM. For bare URLs the
        //      stripped textContent equals the unstripped textContent, so
        //      check (2) is a no-op — without (3) we'd skip rebuild even
        //      though the .wv-url-span was reaped.
        const cacheKey = (isTreeMode ? "t:" : "") + (useMd ? "m:" : ":") + norm;
        const expectsURLSpan = this.hasURI(text);
        const expectsMdSpan = hasMd;
        const liveURLSpan = expectsURLSpan
            ? !!el.querySelector(".wv-url-span") : true;
        const liveMdSpan = expectsMdSpan
            ? !!el.querySelector(".wv-md") : true;
        if (el.getAttribute("data-wv-source") === cacheKey
            && cachedRendered !== null
            && cachedRendered === liveText
            && liveURLSpan
            && liveMdSpan) {
            this._dbg("[Weavero] _markTextLinks skip: data-wv-source cache hit");
            return false;
        }

        // Per-element rate limit. If Zotero's React reconciliation strips
        // our spans, the cache invalidates and we'd rebuild — Zotero strips
        // again — observer fires — loop. The 250 ms gate converts that
        // into a slow churn that can't lock the UI.
        const lastRebuild = parseInt(
            el.getAttribute("data-wv-last-rebuild") || "0", 10);
        if ((Date.now() - lastRebuild) < 250) {
            this._dbg("[Weavero] _markTextLinks skip: rate-limited");
            return false;
        }

        const frag = doc.createDocumentFragment();
        // TOKEN regex group indices:
        //   useMd:    1 bold, 2 italic, 3 strike, 4 code,
        //             5 link label, 6 link url, 7 bare URL
        //   non-useMd: 1 link label, 2 link url, 3 bare URL
        // Markdown links work in BOTH modes — only the bold/italic/strike/code
        // alternations are gated on useMd. This is what fixes the in-PDF
        // popup case where useMd=false (no experimental sidebar markdown
        // pref) was previously falling through to URL_REGEX only, leaving
        // [label](url) as raw text with the URL inside () colourised.
        const TOKEN = useMd ? new RegExp(
            "\\*\\*([\\s\\S]+?)\\*\\*"
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            + "|~~([\\s\\S]+?)~~"
            + "|`([^`\\n]+?)`"
            + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        ) : new RegExp(
            "\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        );
        const wrapMd = (cls, marker, inner) => {
            if (!isTreeMode) frag.appendChild(doc.createTextNode(marker));
            const span = doc.createElement("span");
            span.className = "wv-md " + cls;
            span.textContent = inner;
            frag.appendChild(span);
            if (!isTreeMode) frag.appendChild(doc.createTextNode(marker));
        };
        const emitUrlSpan = (label, url) => {
            const span = doc.createElement("span");
            span.className = "wv-url-span "
                + this._urlLinkClass(url);
            span.title = url;
            span.textContent = label;
            span.setAttribute("data-href", url);
            frag.appendChild(span);
        };
        let last = 0, m;
        while ((m = TOKEN.exec(norm)) !== null) {
            if (m.index > last)
                frag.appendChild(doc.createTextNode(norm.slice(last, m.index)));
            if (useMd && m[1] !== undefined) {
                wrapMd("wv-md-bold", "**", m[1]);
            } else if (useMd && m[2] !== undefined) {
                wrapMd("wv-md-italic", "*", m[2]);
            } else if (useMd && m[3] !== undefined) {
                wrapMd("wv-md-strike", "~~", m[3]);
            } else if (useMd && m[4] !== undefined) {
                wrapMd("wv-md-code", "`", m[4]);
            } else {
                // Markdown link [label](url) — useMd groups 5/6, non-useMd 1/2.
                const linkLabel = useMd ? m[5] : m[1];
                const linkUrl   = useMd ? m[6] : m[2];
                if (linkLabel !== undefined && linkUrl !== undefined) {
                    const url = linkUrl.replace(this.TRAILING_RE, "");
                    // Tree mode (items-list note/text rows) strips markers
                    // so only the label is visible. Sidebar / popup keep the
                    // markers as text nodes so the comment textContent is
                    // round-trippable for in-place edits — the user can
                    // still see the raw [label](url) when they click in.
                    if (!isTreeMode) frag.appendChild(doc.createTextNode("["));
                    emitUrlSpan(linkLabel, url);
                    if (!isTreeMode) frag.appendChild(doc.createTextNode("](" + linkUrl + ")"));
                } else {
                    // Bare URL — useMd group 7, non-useMd group 3.
                    const raw = useMd ? m[7] : m[3];
                    if (raw === undefined) { last = m.index + m[0].length; continue; }
                    const url   = raw.replace(this.TRAILING_RE, "");
                    const trail = raw.slice(url.length);
                    emitUrlSpan(url, url);
                    if (trail) frag.appendChild(doc.createTextNode(trail));
                }
            }
            last = m.index + m[0].length;
        }
        if (last < norm.length)
            frag.appendChild(doc.createTextNode(norm.slice(last)));

        // Stash raw source BEFORE replacing children — afterwards textContent
        // reflects the stripped/formatted view, not the source markdown.
        el.setAttribute("data-wv-raw", text);
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(frag);
        el.setAttribute("data-wv-source", cacheKey);
        el.setAttribute("data-wv-last-rebuild", String(Date.now()));
        // Record the textContent we just produced so a later pass can detect
        // whether the live text is still our stripped form (spans got
        // reaped) or differs (user edited / new source).
        el.setAttribute("data-wv-rendered", el.textContent || "");
        return true;
    }

    /** Cheap synchronous orphan sweep — removes our overlays whose target
     *  is gone. Used by the inner-iframe MutationObserver on any childList
     *  removal so deletion feels instant; the full reconciliation pass
     *  (debounced 100 ms) handles creation + positioning. */
    _sweepStaleOverlays(idoc, reader) {
        if (!idoc) return;
        // Build set of annotation keys hidden by the reader's filter so
        // we can bypass the zoom grace period for filter-hidden buttons
        // and badges. Same source as _processNoteAnnotationOverlays.
        const hiddenKeys = new Set();
        try {
            const iwin = reader && reader._iframeWindow;
            const ireader = iwin && iwin.wrappedJSObject
                && iwin.wrappedJSObject._reader;
            const stateAnns = ireader && ireader._state
                && ireader._state.annotations;
            if (stateAnns && stateAnns.length) {
                for (const a of stateAnns) {
                    if (a && a._hidden && a.id) hiddenKeys.add(a.id);
                }
            }
        } catch (e) {}
        // Text annotations: button has a coord-derived stable ID
        // (`p{N}-t{top}-l{left}`); orphan = no textarea at the same
        // page+coords. Same tombstone-grace pattern as
        // _processTextAnnotations: don't remove a button just because
        // Zotero is mid-rerender of the textarea. Without this guard,
        // every textarea-removal mutation observed by the parent
        // mutation-observer would call us synchronously, we'd find no
        // matching textareas, and remove the button — exactly the
        // flicker we already saw with the per-scan sweep.
        //
        // Filter-hidden buttons skip the grace period: we know the
        // textarea won't reappear until the user clears the filter,
        // so making the user wait 1.5 s for the button to disappear
        // makes the filter feel unresponsive.
        try {
            const parsePxLiteral = (s) => {
                if (!s) return null;
                const m = /([0-9.]+)\s*px/.exec(s);
                return m ? parseFloat(m[1]) : null;
            };
            const liveStableIds = new Set();
            for (const ta of idoc.querySelectorAll("textarea.textAnnotation")) {
                const taTop  = parsePxLiteral(ta.style.top);
                const taLeft = parsePxLiteral(ta.style.left);
                const page = ta.closest && ta.closest(".page");
                if (taTop === null || taLeft === null || !page) continue;
                const pn = page.getAttribute("data-page-number") || "";
                liveStableIds.add(
                    "p" + pn + "-t" + taTop.toFixed(4) + "-l" + taLeft.toFixed(4));
            }
            const now = Date.now();
            const SWEEP_GRACE_MS = 1500;
            for (const btn of idoc.querySelectorAll(".wv-text-annotation-btn")) {
                const id = btn.dataset && btn.dataset.wvFor;
                if (!id) { btn.remove(); continue; }
                const annKey = btn.dataset && btn.dataset.wvAnnKey;
                if (annKey && hiddenKeys.has(annKey)) {
                    btn.remove();
                    continue;
                }
                if (liveStableIds.has(id)) {
                    btn.dataset.wvLastSeen = String(now);
                } else {
                    const lastSeen = parseInt(btn.dataset.wvLastSeen || "0", 10);
                    if (now - lastSeen > SWEEP_GRACE_MS) btn.remove();
                }
            }
        } catch(e) { this._dbg("[Weavero] sweep text-ann err: " + e); }

        // Marker badges: build live-key set from the canonical data layer
        // (attachment.getAnnotations()) and drop any badge whose key isn't
        // present. We avoid DOM-attribute guessing because Zotero's
        // .customAnnotationLayer children may not carry the key in a
        // predictable attribute across versions.
        //
        // Filter-out: also subtract annotations the reader has hidden
        // via its sidebar filter (color/tag/author/query). Those still
        // exist in the data model but the reader doesn't draw them on
        // the page, so leaving the badge floating over an empty spot
        // is exactly the bug this sweep is here to prevent.
        try {
            const att = reader && reader._item;
            if (!att) return;
            let anns = [];
            try { anns = att.getAnnotations() || []; } catch(e) { return; }
            const liveKeys = new Set(anns.map(a => a.key).filter(Boolean));
            // Reuse the hiddenKeys set computed at the top of this
            // function instead of re-walking _state.annotations.
            for (const k of hiddenKeys) liveKeys.delete(k);
            for (const badge of idoc.querySelectorAll(".wv-marker-badge")) {
                const k = badge.getAttribute("data-wv-for");
                if (!k || !liveKeys.has(k)) badge.remove();
            }
        } catch(e) { this._dbg("[Weavero] sweep badge err: " + e); }
    }

    /** Find sidebar annotation comment elements and inject URL spans. */
    /** Sample the inner-iframe body's background to decide whether the
     *  reader is showing light or dark pages, then write a dynamic
     *  stylesheet that drives bg/color/border/hover-bg for both
     *  .wv-marker-badge and .wv-text-annotation-btn. Both surfaces
     *  share one rule, so every reader-side icon (canvas badges +
     *  text-annotation buttons) adapts together. The static
     *  weavero-inner-styles sheet keeps only structural
     *  rules (position, z-index, transitions, opacity); colors live
     *  here so they can refresh when the theme changes. */
    _applyDynamicReaderTheme(idoc) {
        if (!idoc) return;
        let dark = false;
        try {
            const win = idoc.defaultView;
            const root = idoc.documentElement;
            // The reader's appearance theme (Original / Dark / Sepia /
            // custom) decides the actual rendered PDF page color, which
            // is what the badge sits on. Two reliable sources for that:
            //   1. The `--background-color` CSS variable PDF.js sets on
            //      <html>'s inline style (e.g. #FFFFFF for Original,
            //      #000000 for Dark).
            //   2. The `.page` element's computed background-color —
            //      same value, materialised on the page wrapper.
            // We try (1) first because it's the canonical declaration
            // and exists even before any page has rendered. Body bg /
            // data-color-scheme track the viewer CHROME (which follows
            // Zotero's UI theme), not the page rendering, so they're
            // the wrong signal for tinting the chain over the page.
            const parseLuma = (s) => {
                if (!s) return null;
                s = s.trim();
                let r = null, g = null, b = null;
                let m = s.match(/^#([0-9a-f]{3})$/i);
                if (m) {
                    r = parseInt(m[1][0] + m[1][0], 16);
                    g = parseInt(m[1][1] + m[1][1], 16);
                    b = parseInt(m[1][2] + m[1][2], 16);
                } else if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
                    r = parseInt(m[1].slice(0, 2), 16);
                    g = parseInt(m[1].slice(2, 4), 16);
                    b = parseInt(m[1].slice(4, 6), 16);
                } else if ((m = s.match(
                        /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/))) {
                    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
                    if (alpha < 0.5) return null;    // transparent → no info
                    r = +m[1]; g = +m[2]; b = +m[3];
                } else {
                    return null;
                }
                return 0.299 * r + 0.587 * g + 0.114 * b;
            };
            const sample = (el, propName) => {
                if (!el) return null;
                const cs = win && win.getComputedStyle(el);
                if (!cs) return null;
                const v = propName ? cs.getPropertyValue(propName) : cs.backgroundColor;
                const luma = parseLuma(v);
                return luma === null ? null : luma < 128;
            };
            // 1. --background-color CSS var (PDF.js's declared page bg).
            let detected = sample(root, "--background-color");
            // 2. .page element's actual rendered bg.
            if (detected === null) detected = sample(idoc.querySelector(".page"));
            // 3. Body / html bg (only useful if the viewer chrome and
            //    page happen to share the theme).
            if (detected === null) detected = sample(idoc.body);
            if (detected === null) detected = sample(root);
            if (detected === null) {
                // Last resort: prefers-color-scheme.
                try {
                    detected = !!(win && win.matchMedia
                        && win.matchMedia("(prefers-color-scheme: dark)").matches);
                } catch (e) {}
            }
            dark = !!detected;
        } catch (e) {}
        const btnBg     = dark ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.12)";
        const btnHovBg  = dark ? "rgba(255, 255, 255, 0.32)" : "rgba(0, 0, 0, 0.22)";
        const btnColor  = dark ? "#f4f4f4" : "#1a1a1a";
        const btnBorder = dark ? "1px solid rgba(255, 255, 255, 0.25)"
                               : "1px solid rgba(0, 0, 0, 0.18)";
        // Apply the .wv-reader-dark class to the inner iframe's
        // documentElement so the M-icon dark variant rule (in the
        // inner stylesheet) takes effect when the reader is in
        // dark mode.
        try {
            if (idoc.documentElement) {
                idoc.documentElement.classList.toggle("wv-reader-dark", dark);
            }
        } catch (e) {}
        let style = idoc.getElementById("weavero-inner-dynamic-styles");
        if (!style) {
            style = idoc.createElement("style");
            style.id = "weavero-inner-dynamic-styles";
            (idoc.head || idoc.documentElement).appendChild(style);
        }
        // Boxless look: no bg, no border, just the bare 🔗 / M glyph.
        // The `.wv-format-md` rules below (with !important) still draw
        // the amber disc + "M" for markdown-only / URL+markdown icons,
        // so type-2 and type-3 keep their distinguishing decoration.
        // Hover background mirrors Zotero's --fill-quinary look —
        // a very subtle translucent gray that adapts to theme. We
        // can't use the CSS variable inside the PDF.js iframe (it's
        // a separate document without Zotero chrome), so we set the
        // literal value computed from the same theme detection.
        const btnHoverBg = dark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.07)";
        // Only rewrite the stylesheet when the dark flag actually
        // flips. Setting textContent re-parses the rule set and
        // triggers a full style recalc — calling this every scan
        // (which happens on every PDF zoom tick) was a flicker
        // source. The dataset stamp lets repeat calls short-circuit.
        const expectedKey = dark ? "1" : "0";
        if (style.dataset.wvLastTheme !== expectedKey) {
            style.dataset.wvLastTheme = expectedKey;
            style.textContent =
                ".wv-marker-badge,"
                + ".wv-text-annotation-btn {"
                + "  color: " + btnColor + ";"
                + "}"
                + ".wv-marker-badge:hover,"
                + ".wv-text-annotation-btn:hover {"
                + "  background: " + btnHoverBg + ";"
                + "}";
        }
    }

    /** Sample the Zotero main window's body background to decide
     *  whether the UI is currently in dark mode. Mirrors the
     *  technique _applyDynamicReaderTheme uses for the reader, but
     *  scoped to the chrome (so the same logic produces the right
     *  answer regardless of how Zotero gets its theme — OS-driven,
     *  manual override, custom CSS). */
    _detectUIDark() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return false;
            // Zotero's main window is XUL — `doc.body` is null
            // because the root is <window>, not <html><body>. Sample
            // documentElement (or body if it exists, e.g. on platforms
            // where the chrome is HTML-rooted) instead, and fall back
            // to OS color-scheme preference if the bg is transparent
            // or unparseable.
            const target = doc.body || doc.documentElement;
            if (target) {
                const bg = win.getComputedStyle(target).backgroundColor || "";
                const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?/);
                if (m) {
                    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
                    if (alpha >= 0.5) {
                        const luma = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
                        return luma < 128;
                    }
                }
            }
            // Last resort: prefers-color-scheme.
            try {
                if (win.matchMedia
                    && win.matchMedia("(prefers-color-scheme: dark)").matches) {
                    return true;
                }
            } catch (e) {}
        } catch (e) {}
        return false;
    }

    /** Apply the .wv-ui-dark class to every UI surface that should
     *  follow the Zotero UI theme — the main window doc and each
     *  open reader's outer iframe doc (which hosts the reader
     *  sidebar). The PDF.js inner iframe is intentionally NOT
     *  touched here; it follows the reader theme via
     *  _applyDynamicReaderTheme's :root.wv-reader-dark class. */
    _applyUIThemeClass() {
        try {
            const dark = this._detectUIDark();
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc && doc.documentElement) {
                doc.documentElement.classList.toggle("wv-ui-dark", dark);
            }
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document && iwin.document.documentElement) {
                        iwin.document.documentElement.classList.toggle(
                            "wv-ui-dark", dark);
                    }
                } catch (e) {}
            }
            // Theme-aware pref-pane icon. Updates the stored
            // `image` on the registered pane (so future opens of
            // the prefs window pick up the new URL) AND the live
            // DOM of any currently-open prefs window (so the swap
            // is visible immediately, without reload).
            this._refreshPrefPaneIcon(dark);
        } catch (e) {
            Zotero.debug("[Weavero] _applyUIThemeClass err: " + e);
        }
    }

    /** Refresh the pref-pane icon URL on theme change. Mutates
     *  the registered pane's `image` field (which Zotero's
     *  preferences renderer reads when the prefs window mounts)
     *  AND finds any open prefs windows to update the rendered
     *  `<image>` element directly — see upstream
     *  preferences.js `_addPane` for the DOM shape. */
    _refreshPrefPaneIcon(isDark) {
        try {
            const theme = isDark ? "dark" : "light";
            const newURL = _rootURI + "icons/icon-" + theme + "-32.png";
            const pluginID = "weavero@mjthoraval";
            const panes = (Zotero.PreferencePanes
                && Zotero.PreferencePanes.pluginPanes) || [];
            const ours = [];
            for (const pane of panes) {
                if (pane.pluginID === pluginID) {
                    pane.image = newURL;
                    ours.push(pane);
                }
            }
            if (!ours.length) return;
            const wins = Services.wm.getEnumerator("zotero:pref");
            while (wins.hasMoreElements()) {
                const w = wins.getNext();
                try {
                    const wdoc = w.document;
                    for (const pane of ours) {
                        const item = wdoc.querySelector(
                            'richlistitem[value="' + pane.id + '"]');
                        const img = item && item.querySelector("image");
                        if (img) img.setAttribute("src", newURL);
                    }
                } catch (e) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _refreshPrefPaneIcon err: " + e);
        }
    }

    /** Inject the floating 🔗 button next to text annotations whose value
     *  contains a URL. The button opens the popup with all clickable URLs.
     *  Idempotent — skips textareas that already have a button, and removes
     *  the button when a textarea no longer has any URL in its value. */
    _processTextAnnotations(idoc) {
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-text-annotation-btn")) b.remove();
            return;
        }
        const annotations = idoc.querySelectorAll("textarea.textAnnotation");
        if (annotations.length) {
            this._dbg("[Weavero] _processTextAnnotations: "
                + annotations.length + " textarea.textAnnotation found");
        }

        // Refresh the dynamic theme stylesheet — covers both this
        // surface and the marker badges via the shared rule.
        this._applyDynamicReaderTheme(idoc);

        // Resolve the page-level scale-factor for this textarea so the
        // glyph + box scale with zoom (matches the marker-badge behaviour
        // for canvas-drawn annotations).
        const scaleFactorFor = (ta) => {
            try {
                const page = ta.closest && ta.closest(".page");
                if (page) {
                    const cs = idoc.defaultView.getComputedStyle(page);
                    let sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                    if (sf && isFinite(sf)) return sf;
                    let p = page.parentElement;
                    while (p) {
                        const ps = idoc.defaultView.getComputedStyle(p);
                        sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                        if (sf && isFinite(sf)) return sf;
                        p = p.parentElement;
                    }
                }
            } catch(e) {}
            return 1;
        };
        // Extract the unscaled px coordinate from a textarea's inline
        // top/left. PDF.js writes them as `calc(N px * var(--scale-factor))`
        // on most builds; we want N so we can rebuild the same expression
        // with our page-offset variable prepended. Returns null if no
        // px literal can be found — the caller falls back to dividing
        // offsetTop/offsetLeft by the scale-factor.
        const parsePxLiteral = (s) => {
            if (!s) return null;
            const m = /([0-9.]+)\s*px/.exec(s);
            return m ? parseFloat(m[1]) : null;
        };

        const overlay = this._ensureBadgeOverlay(idoc);
        if (!overlay) return;

        // Coord-based stable IDs are crucial for text annotations: Zotero
        // re-renders text annotations on zoom (the textarea is replaced
        // with a new DOM node, dataset.alTaId is gone). If we keyed the
        // button by alTaId, every zoom would orphan the old button and
        // the loop would create a fresh one — exactly the flicker the
        // user reports. PDF coordinates ARE stable across the textarea
        // re-creation (they're properties of the underlying annotation,
        // not the DOM node), so a key derived from page + coords
        // identifies "the same button" across re-renders.
        const stableIdFor = (pn, taTop, taLeft) =>
            "p" + pn + "-t" + taTop.toFixed(4) + "-l" + taLeft.toFixed(4);

        // First pass: figure out which textareas are eligible (URL or
        // markdown in their value, parsable coords) and collect their
        // stable IDs.
        const wanted = []; // {ta, text, page, pn, taTop, taLeft, stableId, pageOffTop, pageOffLeft}
        const expectedIds = new Set();
        for (const ta of annotations) {
            const text = (ta.value || ta.getAttribute("data-comment") || "").trim();
            if (!this._iconWantedFor(text)) continue;
            let taTop  = parsePxLiteral(ta.style.top);
            let taLeft = parsePxLiteral(ta.style.left);
            const page = ta.closest && ta.closest(".page");
            if (!page) continue;
            if (taTop === null || taLeft === null) {
                const sf = scaleFactorFor(ta) || 1;
                if (taTop  === null) taTop  = ta.offsetTop  / sf;
                if (taLeft === null) taLeft = ta.offsetLeft / sf;
            }
            if (!isFinite(taTop) || !isFinite(taLeft)) continue;
            const pn = page.getAttribute("data-page-number") || "";
            const pageOffTop  = page.offsetTop  + "px";
            const pageOffLeft = page.offsetLeft + "px";
            const stableId = stableIdFor(pn, taTop, taLeft);
            expectedIds.add(stableId);
            wanted.push({ ta, text, page, pn, taTop, taLeft, stableId, pageOffTop, pageOffLeft });
        }

        // Tombstone-grace sweep. Zotero re-creates text annotation
        // textareas during PDF.js's zoom transition — they vanish for
        // ~120 ms and reappear at the same PDF coords. If we removed
        // buttons the instant their stable ID isn't in expectedIds,
        // every zoom would briefly empty the overlay and the button
        // would visibly flicker out and back. Instead we stamp
        // `alLastSeen` whenever a button's stable ID matches a current
        // textarea, and only remove buttons whose lastSeen is older
        // than the grace period below — long enough to outlive a zoom
        // transient, short enough that a deleted annotation's button
        // is gone before the user notices.
        const now = Date.now();
        const SWEEP_GRACE_MS = 1500;
        for (const btn of overlay.querySelectorAll(".wv-text-annotation-btn")) {
            if (expectedIds.has(btn.dataset.wvFor)) {
                btn.dataset.wvLastSeen = String(now);
            } else {
                const lastSeen = parseInt(btn.dataset.wvLastSeen || "0", 10);
                if (now - lastSeen > SWEEP_GRACE_MS) btn.remove();
            }
        }
        // Sweep any pre-overlay leftovers in the inner doc (older
        // builds appended the button as a sibling of the textarea).
        for (const btn of idoc.querySelectorAll(".customAnnotationLayer .wv-text-annotation-btn")) {
            btn.remove();
        }

        for (const w of wanted) {
            let btn = overlay.querySelector(
                ".wv-text-annotation-btn[data-wv-for='" + w.stableId + "']");
            const isNew = !btn;
            if (isNew) {
                btn = idoc.createElement("button");
                btn.className = "wv-btn wv-text-annotation-btn";
                btn.dataset.wvFor = w.stableId;
                btn.dataset.wvPage = w.pn;
                btn.dataset.wvTopPdf  = String(w.taTop);
                btn.dataset.wvLeftPdf = String(w.taLeft);
                btn.dataset.wvPageOffTop  = w.pageOffTop;
                btn.dataset.wvPageOffLeft = w.pageOffLeft;
                btn.dataset.wvComment = w.text;
                btn.dataset.wvLastSeen = String(Date.now());
                // Capture the annotation key so the sweep can match
                // this button against filter-hidden annotations
                // immediately (bypassing the 1500 ms zoom-flicker
                // grace period). Zotero sets data-id on the textarea
                // to the annotation's item key — see page.js:996 in
                // zotero/reader.
                const annKey = w.ta && w.ta.getAttribute
                    ? w.ta.getAttribute("data-id") : null;
                if (annKey) btn.dataset.wvAnnKey = annKey;
                this._applyIconState(btn, w.text);
                btn.style.setProperty("--page-offset-top",  w.pageOffTop);
                btn.style.setProperty("--page-offset-left", w.pageOffLeft);
                btn.style.cssText += [
                    "position: absolute",
                    "top: calc(var(--page-offset-top, 0px) + "
                        + w.taTop + "px * var(--scale-factor, 1))",
                    "left: calc(var(--page-offset-left, 0px) + "
                        + w.taLeft + "px * var(--scale-factor, 1))",
                    "z-index: 99999",
                    "pointer-events: auto",
                    "font-size: calc(7px * var(--scale-factor, 1))",
                    "padding: 0",
                    "margin: 0",
                    "border: none",
                    "background: transparent",
                    "appearance: none",
                    "-moz-appearance: none",
                    "border-radius: calc(2px * var(--scale-factor, 1))",
                ].join("; ") + ";";
                btn.addEventListener("mousedown", e => {
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    e.preventDefault();
                }, true);
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // The textarea ref captured in the click closure may
                    // be stale (Zotero re-renders text annotations) —
                    // resolve it dynamically from the current DOM by the
                    // button's stable position-derived ID.
                    let liveTa = null;
                    for (const t of idoc.querySelectorAll("textarea.textAnnotation")) {
                        const tt = parsePxLiteral(t.style.top);
                        const tl = parsePxLiteral(t.style.left);
                        const tp = t.closest && t.closest(".page");
                        if (tt === null || tl === null || !tp) continue;
                        const tpn = tp.getAttribute("data-page-number") || "";
                        if (stableIdFor(tpn, tt, tl) === w.stableId) {
                            liveTa = t;
                            break;
                        }
                    }
                    const fresh = liveTa
                        ? (liveTa.value || liveTa.getAttribute("data-comment") || "").trim()
                        : w.text;
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(fresh, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                overlay.appendChild(btn);
                this._attachTextAnnotationStyleObserver(idoc, w.ta, btn, w.pn);
                continue;
            }
            // Existing button: refresh page-offset variables only (the
            // calc() expressions and PDF coords don't need touching as
            // long as the stable ID matches — i.e. the annotation didn't
            // move). _applyIconState is GATED on comment-text change:
            // setAttribute(data-has-url) fires a mutation even when the
            // value is the same, so calling it every scan would thrash
            // the button's attributes during zoom and produce a visible
            // flicker. We only re-apply when the comment actually
            // changed (user edit).
            if (btn.dataset.wvPage !== w.pn) btn.dataset.wvPage = w.pn;
            // Backfill annotation key onto buttons created by older
            // builds that didn't capture it. Without this the
            // filter-bypass in _sweepStaleOverlays can't match the
            // button to a hidden annotation.
            if (!btn.dataset.wvAnnKey) {
                const annKey = w.ta && w.ta.getAttribute
                    ? w.ta.getAttribute("data-id") : null;
                if (annKey) btn.dataset.wvAnnKey = annKey;
            }
            if (btn.dataset.wvComment !== w.text) {
                btn.dataset.wvComment = w.text;
                this._applyIconState(btn, w.text);
            }
            if (btn.dataset.wvPageOffTop !== w.pageOffTop) {
                btn.dataset.wvPageOffTop = w.pageOffTop;
                btn.style.setProperty("--page-offset-top", w.pageOffTop);
            }
            if (btn.dataset.wvPageOffLeft !== w.pageOffLeft) {
                btn.dataset.wvPageOffLeft = w.pageOffLeft;
                btn.style.setProperty("--page-offset-left", w.pageOffLeft);
            }
            this._attachTextAnnotationStyleObserver(idoc, w.ta, btn, w.pn);
        }
    }

    /** Attach a per-textarea MutationObserver on `style` so the icon
     *  button tracks PDF.js's drag/resize updates in real time. PDF.js
     *  rewrites the textarea's inline `top`/`left` on every pointermove
     *  while a text annotation is being moved or resized; the observer
     *  fires synchronously after each write, before paint, so the
     *  button follows at native repaint cadence — no save round-trip.
     *
     *  Without this, the button only repositioned when a periodic
     *  `_processTextAnnotations` scan ran (triggered by the iframe-
     *  childList MutationObserver or, after drop, by the modify
     *  notifier), giving a visible "icon snaps to position" lag.
     *
     *  Idempotent: keyed by textarea via WeakMap. If the same textarea
     *  later gets a new button (e.g. after a zoom re-render), the
     *  prior observer is disconnected and replaced. */
    _attachTextAnnotationStyleObserver(idoc, ta, btn, pn) {
        if (!this._textAnnotationStyleObservers) {
            this._textAnnotationStyleObservers = new WeakMap();
        }
        const existing = this._textAnnotationStyleObservers.get(ta);
        if (existing && existing.btn === btn) return;
        if (existing) {
            try { existing.obs.disconnect(); } catch(e) {}
        }
        const win = idoc.defaultView;
        if (!win || !win.MutationObserver) return;
        const parsePx = (s) => {
            const m = /([0-9.]+)\s*px/.exec(s || "");
            return m ? parseFloat(m[1]) : null;
        };
        let entry;
        const update = () => {
            if (!btn.isConnected) {
                try { entry.obs.disconnect(); } catch(e) {}
                this._textAnnotationStyleObservers.delete(ta);
                return;
            }
            const taTop  = parsePx(ta.style.top);
            const taLeft = parsePx(ta.style.left);
            if (taTop === null || taLeft === null) return;
            if (!isFinite(taTop) || !isFinite(taLeft)) return;
            btn.style.top = "calc(var(--page-offset-top, 0px) + "
                + taTop + "px * var(--scale-factor, 1))";
            btn.style.left = "calc(var(--page-offset-left, 0px) + "
                + taLeft + "px * var(--scale-factor, 1))";
            // Keep dataset coords + stableId in sync. The next
            // `_processTextAnnotations` pass derives stableId from
            // (page, taTop, taLeft); without this rewrite it would
            // miss the existing button under its new coords, create a
            // duplicate, and the tombstone-grace window would briefly
            // overlap two icons before sweeping the old one.
            const newStableId = "p" + pn
                + "-t" + taTop.toFixed(4)
                + "-l" + taLeft.toFixed(4);
            if (btn.dataset.wvFor !== newStableId) {
                btn.dataset.wvFor    = newStableId;
                btn.dataset.wvTopPdf  = String(taTop);
                btn.dataset.wvLeftPdf = String(taLeft);
            }
        };
        const obs = new win.MutationObserver(update);
        obs.observe(ta, { attributes: true, attributeFilter: ["style"] });
        entry = { obs, btn };
        this._textAnnotationStyleObservers.set(ta, entry);
    }

    /** While the user has the pointer down inside the reader iframe,
     *  poll the in-iframe Reader's pdf-view `action` state on each
     *  animation frame and re-place the corresponding badge. This is
     *  the only way to track canvas-rendered annotations (highlight /
     *  underline / image / ink) during edit — they have no DOM marker
     *  to observe; PDF.js redraws to canvas directly.
     *
     *  Upstream's pdf-view.js handles drag/resize by mutating
     *  `this.action.annotation.position` synchronously on each
     *  pointermove (`'updateAnnotationRange'` for highlight selection
     *  extension, `'resize'` and `'moveAndDrag'` for box annotations),
     *  then calls `this._render()`. The `position` is the same field
     *  our badge top/left calc() expressions are derived from, so
     *  reading it on rAF and recomputing is enough.
     *
     *  Cross-realm read goes through `iwin.wrappedJSObject._reader`
     *  (set by `index.zotero.js`). Wrapped property access from
     *  chrome works for plain data values (numbers, strings, simple
     *  objects); we only read scalars + arrays of scalars from
     *  position.rects[0].
     *
     *  Per-reader. The rAF only runs between pointerdown and
     *  pointerup, so idle CPU cost is zero. */
    _setupAnnotationDragTracker(reader, idoc) {
        const win = idoc && idoc.defaultView;
        if (!win || !win.requestAnimationFrame) return;
        if (!this._annotationDragTrackers) {
            this._annotationDragTrackers = new WeakMap();
        }
        if (this._annotationDragTrackers.has(reader)) return;
        const state = { active: false, raf: 0 };
        const readAction = () => {
            try {
                const iwin = reader._iframeWindow;
                if (!iwin || !iwin.wrappedJSObject) return null;
                const ireader = iwin.wrappedJSObject._reader;
                if (!ireader) return null;
                const view = ireader._primaryView;
                if (!view) return null;
                return view.action || null;
            } catch (e) { return null; }
        };
        const tick = () => {
            if (!state.active) { state.raf = 0; return; }
            try {
                const action = readAction();
                // The live position is split across two fields depending
                // on the action type:
                //   - 'updateAnnotationRange' (highlight / underline)
                //     writes to action.annotation.position.
                //   - 'resize' / 'moveAndDrag' (image / ink / text-box)
                //     writes to action.position and leaves
                //     action.annotation.position frozen at drag-start.
                // Prefer action.position when present, fall back to
                // action.annotation.position. (Upstream pdf-view.js:
                //   - L2740-2745 highlight: action.annotation = { ..., position: _position }
                //   - L2807-2808 image:     action.position = { ..., rects: [rect] }
                // )
                if (action && action.annotation && action.annotation.id) {
                    const livePos = action.position
                        || (action.annotation && action.annotation.position);
                    if (livePos && livePos.rects && livePos.rects.length) {
                        this._updateCanvasBadgePositionLive(idoc, {
                            id: action.annotation.id,
                            position: livePos,
                        });
                        // Snapshot the live position + the dragged key
                        // so the post-pointerup commit-pending guard
                        // (in `_processNoteAnnotationOverlays`) knows
                        // where the badge legitimately sits and can
                        // skip the database re-placement until the
                        // commit catches up.
                        state.lastDraggedKey = action.annotation.id;
                        state.lastLivePos = livePos;
                    }
                }
            } catch (e) {}
            state.raf = win.requestAnimationFrame(tick);
        };
        const start = () => {
            if (state.active) return;
            state.active = true;
            state.raf = win.requestAnimationFrame(tick);
        };
        const stop = () => {
            state.active = false;
            if (state.raf) {
                try { win.cancelAnimationFrame(state.raf); } catch(e) {}
            }
            state.raf = 0;
            // If a drag just ended, mark the dragged annotation as
            // "commit-pending" so the immediate dragEndPointerUp
            // rescan doesn't snap the badge back to the pre-drag
            // database position. The pending entry is consulted by
            // `_processNoteAnnotationOverlays` and cleared once the
            // database position matches the live drag-end position
            // (or after a 2 s safety timeout).
            if (state.lastDraggedKey && state.lastLivePos) {
                if (!this._dragEndPending) {
                    this._dragEndPending = new Map();
                }
                this._dragEndPending.set(state.lastDraggedKey, {
                    livePos: state.lastLivePos,
                    ts: Date.now(),
                });
                state.lastDraggedKey = null;
                state.lastLivePos = null;
            }
        };
        idoc.addEventListener("pointerdown", start, true);
        idoc.addEventListener("pointerup", stop, true);
        idoc.addEventListener("pointercancel", stop, true);
        win.addEventListener("blur", stop);
        this._annotationDragTrackers.set(reader, {
            stop, start, idoc, win,
            handlers: { start, stop }
        });
    }

    /** Re-place the .wv-marker-badge(s) for a single annotation given
     *  a live `annotation` object (from upstream's
     *  `_primaryView.action.annotation`). Mirrors the placement formula
     *  in `_processNoteAnnotationOverlays`: leftPdf = rect.x1, topPdf
     *  = pageHeight - rect.y2, with the comment badge offset by
     *  REL_OFFSET_PDF when a relations badge also exists for the same
     *  annotation. */
    _updateCanvasBadgePositionLive(idoc, ann) {
        const overlay = idoc.querySelector(".pdfViewer .wv-badge-overlay");
        if (!overlay) return;
        const key = ann.id;
        if (!key) return;
        const pos = ann.position;
        if (!pos || !pos.rects || !pos.rects.length) return;
        const r = pos.rects[0];
        if (!r || r.length < 4) return;
        const pageIdx = pos.pageIndex || 0;
        const pn = pageIdx + 1;
        const page = idoc.querySelector(
            ".pdfViewer .page[data-page-number=\"" + pn + "\"]");
        if (!page) return;
        const pageHeight = parseFloat(page.dataset.wvPageHeight || "");
        if (!pageHeight || !isFinite(pageHeight)) return;
        const x1 = r[0], y2 = r[3];
        if (!isFinite(x1) || !isFinite(y2)) return;
        // Mirror the steady-state placement constants from
        // _processNoteAnnotationOverlays. Keep in sync.
        const REL_OFFSET_PDF      = 8;
        const HANDLE_CLEAR_DX_PDF = 1.25;
        const HANDLE_CLEAR_DY_PDF = 1.25;
        const topPdf = pageHeight - y2 - HANDLE_CLEAR_DY_PDF;
        const cmtBadge = overlay.querySelector(
            ".wv-marker-badge[data-wv-for=\"" + key + "\"]"
            + "[data-wv-purpose=\"comment\"]");
        const relBadge = overlay.querySelector(
            ".wv-marker-badge[data-wv-for=\"" + key + "\"]"
            + "[data-wv-purpose=\"relations\"]");
        const hasBoth = !!(cmtBadge && relBadge);
        const place = (badge, leftPdf) => {
            badge.style.left = "calc(var(--page-offset-left, 0px) + "
                + leftPdf + "px * var(--scale-factor, 1))";
            badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                + topPdf + "px - 5px) * var(--scale-factor, 1))";
            badge.dataset.wvLeftPdf = String(leftPdf);
            badge.dataset.wvTopPdf  = String(topPdf);
        };
        if (relBadge) place(relBadge, x1 + HANDLE_CLEAR_DX_PDF);
        if (cmtBadge) place(cmtBadge, x1 + HANDLE_CLEAR_DX_PDF
            + (hasBoth ? REL_OFFSET_PDF : 0));
    }

    /** Get / create the .wv-badge-overlay div that hosts BOTH our marker
     *  badges and our text-annotation buttons. Living inside .pdfViewer
     *  as a sibling of .page elements (instead of inside .page >
     *  .customAnnotationLayer where Zotero originally puts things) is
     *  what keeps these icons visible through PDF.js's zoom-stop
     *  re-render: the `loading` class transitions, opacity changes,
     *  and any inline-style flicker that PDF.js applies to .page
     *  can't reach a node outside of it. Opacity in particular is
     *  multiplicative across ancestors and CAN'T be overridden by
     *  a child's CSS — the only real fix is to live in a different
     *  subtree. The reposition observer is wired up on first creation
     *  so the page-offset CSS variables refresh when pages reflow. */
    _ensureBadgeOverlay(idoc) {
        const pdfViewer = idoc.querySelector(".pdfViewer");
        if (!pdfViewer) return null;
        let overlay = pdfViewer.querySelector(":scope > .wv-badge-overlay");
        if (!overlay) {
            overlay = idoc.createElement("div");
            overlay.className = "wv-badge-overlay";
            // High z-index defeats every PDF.js-side layer that might
            // otherwise paint above us. PDF.js's annotationLayer and
            // textLayer sit at z=2/z=3 within the page; .customAnnotationLayer
            // is at z=3. We pick a value that's safely above all of
            // them yet still finite (1e6 fits comfortably in 32-bit).
            overlay.style.cssText = "position: absolute; top: 0; left: 0;"
                + " width: 100%; height: 100%;"
                + " pointer-events: none; z-index: 1000000;";
            pdfViewer.appendChild(overlay);
            this._setupBadgeRepositionObserver(idoc, pdfViewer, overlay);
        }
        return overlay;
    }

    /** Watch .pdfViewer + each .page for `style` mutations (PDF.js sets
     *  --scale-factor on the viewer, and width/height on each page when
     *  zoom settles). When fired, refresh the per-icon `--page-offset-top`
     *  and `--page-offset-left` CSS variables so calc() in each badge's
     *  inline `top`/`left` re-evaluates with the new page position.
     *  All MutationObserver / requestAnimationFrame access goes through
     *  `idoc.defaultView`: globals from this constructor's scope don't
     *  exist inside the PDF.js inner iframe. */
    _setupBadgeRepositionObserver(idoc, pdfViewer, overlay) {
        if (!this._badgeRepositionObservers) {
            this._badgeRepositionObservers = new WeakMap();
        }
        if (this._badgeRepositionObservers.has(idoc)) return;
        const win = idoc.defaultView;
        if (!win || !win.MutationObserver || !win.requestAnimationFrame) {
            this._dbg("[Weavero] reposition obs: missing win APIs");
            return;
        }
        let raf = 0;
        const reposition = () => {
            if (raf) return;
            raf = win.requestAnimationFrame(() => {
                raf = 0;
                const icons = overlay.querySelectorAll(
                    ".wv-marker-badge, .wv-text-annotation-btn");
                for (const el of icons) {
                    const pn = el.dataset.wvPage;
                    if (!pn) continue;
                    const page = idoc.querySelector(
                        ".pdfViewer .page[data-page-number=\"" + pn + "\"]");
                    if (!page) continue;
                    const newTop  = page.offsetTop + "px";
                    const newLeft = page.offsetLeft + "px";
                    if (el.dataset.wvPageOffTop !== newTop) {
                        el.dataset.wvPageOffTop = newTop;
                        el.style.setProperty("--page-offset-top", newTop);
                    }
                    if (el.dataset.wvPageOffLeft !== newLeft) {
                        el.dataset.wvPageOffLeft = newLeft;
                        el.style.setProperty("--page-offset-left", newLeft);
                    }
                }
            });
        };
        const obs = new win.MutationObserver(reposition);
        obs.observe(pdfViewer, { attributes: true, attributeFilter: ["style"] });
        const pageObs = new win.MutationObserver(reposition);
        for (const page of pdfViewer.querySelectorAll(".page")) {
            pageObs.observe(page, { attributes: true, attributeFilter: ["style"] });
        }
        this._badgeRepositionObservers.set(idoc, { obs, pageObs, overlay });
    }

    /** Inject 🔗 badges over canvas-rendered annotations (note, highlight,
     *  underline, image, ink) whose comments contain URLs. These annotations
     *  have no DOM marker — Zotero draws the icon directly to the page
     *  canvas — so we can't decorate an existing element. Instead we use
     *  the annotation's PDF-coordinate rects + the page's CSS
     *  `--scale-factor` variable (the same mechanism Zotero uses to position
     *  text-annotation textareas) to place a DOM badge on top of the
     *  canvas at the matching screen location. The badge is purely visual
     *  (pointer-events: none); clicking the underlying icon still goes to
     *  Zotero's click handler as before, and our existing `_markTextLinks`
     *  pass styles the URL inside the popup that Zotero opens.
     *
     *  Implementation details:
     *    • Annotations come from `reader._item.getAnnotations()`. Text
     *      annotations are skipped (handled by `_processTextAnnotations`).
     *    • Per page, we find the matching `.customAnnotationLayer` via the
     *      enclosing `.page[data-page-number]`. PDF page index is 0-based
     *      while data-page-number is 1-based.
     *    • Position formula: PDF rects are bottom-up (y axis points up),
     *      while the viewer DOM is top-down. So
     *          left   = x1
     *          top    = pageHeight - y2
     *          width  = x2 - x1
     *          height = y2 - y1
     *      where pageHeight is the unscaled page height in PDF user space.
     *      We read pageHeight from the .page element's CSS height divided
     *      by `--scale-factor`.
     *    • Each value is then placed as `calc(<n>px * var(--scale-factor))`
     *      so the badge tracks zoom changes automatically. */
    _processNoteAnnotationOverlays(idoc, reader) {
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-marker-badge")) b.remove();
            return;
        }
        if (!reader || !reader._item) return;
        const attachment = reader._item;

        // Pull all annotations belonging to this attachment. getAnnotations
        // is sync if items are loaded (which they are by the time the
        // reader has rendered).
        let annotations = [];
        try { annotations = attachment.getAnnotations() || []; }
        catch(e) { this._dbg("[Weavero] overlay: getAnnotations error: " + e); return; }

        // Build a set of annotation keys filtered out by the reader's
        // sidebar filters (color / tag / author / search query). The
        // reader's annotation manager stores a `_hidden: true` flag on
        // every annotation that doesn't match the active filter; the
        // PDF view simply skips drawing those, but `getAnnotations()`
        // returns the full list, so without this check we'd keep
        // overlay badges hovering over empty PDF space where the
        // filtered-out annotation used to be.
        //
        // The filter UI lives in the outer reader iframe, but the
        // annotation state is owned by `_reader` on that same window.
        // Cross-realm read of `_state.annotations[i]._hidden` is safe —
        // they're plain booleans set by the reader app itself.
        const hiddenKeys = new Set();
        try {
            const iwin = reader._iframeWindow;
            const ireader = iwin && iwin.wrappedJSObject
                && iwin.wrappedJSObject._reader;
            const stateAnns = ireader && ireader._state
                && ireader._state.annotations;
            if (stateAnns && stateAnns.length) {
                for (const a of stateAnns) {
                    if (a && a._hidden && a.id) hiddenKeys.add(a.id);
                }
            }
        } catch (e) {
            this._dbg("[Weavero] overlay: read filter state err: " + e);
        }

        // Drop entries from the recently-deleted set ONLY when
        // getAnnotations() also stops returning them — i.e. when Zotero's
        // in-memory cache has caught up. The fixed 2 s TTL was too short
        // in some cases; tying expiry to actual data consistency removes
        // the race window entirely. Time-based fallback (60 s) for keys
        // that for any reason never get returned again.
        if (this._recentlyDeletedKeys.size) {
            const liveKeys = new Set();
            for (const a of annotations) {
                if (a && a.key) liveKeys.add(a.key);
            }
            const cutoff = Date.now() - 60000;
            for (const [k, ts] of this._recentlyDeletedKeys) {
                if (!liveKeys.has(k) || ts < cutoff) {
                    this._recentlyDeletedKeys.delete(k);
                }
            }
        }

        // Group annotations by 0-based page index.
        // Each page list is a flat array of "badge requests" — an
        // annotation with a comment + relations produces TWO entries
        // (kind="comment", kind="relations") so the placement loop can
        // treat them independently.
        //
        // Order policy: when BOTH apply, the relations badge takes the
        // primary position (the spot the badge would occupy if it were
        // alone) and the comment badge is offset to the RIGHT by
        // REL_OFFSET_PDF. Rationale: relations is the closer analog
        // to a native Zotero feature, so the user's eye should land
        // there first. If only one applies, that one sits at the
        // primary position with no offset.
        //
        // Spacing tuned to read as a tight pair (was 12 — visibly two
        // separate icons; 8 leaves a hairline gap at 100 % zoom).
        const REL_OFFSET_PDF = 8;
        // Shift the badge up-and-right of the first-rect's top-left
        // corner so it doesn't overlap PDF.js's resize handle (drawn
        // at that exact corner for highlight / underline / image / ink
        // annotations). Values are in PDF unscaled px — calc()
        // multiplies them by --scale-factor so the offset stays
        // visually constant across zoom. Mirror in
        // _updateCanvasBadgePositionLive when changing.
        const HANDLE_CLEAR_DX_PDF = 1.25;
        const HANDLE_CLEAR_DY_PDF = 1.25;
        const byPage = new Map();
        let skippedAsRecent = 0;
        let stillReturnedKeys = [];
        for (const ann of annotations) {
            if (!ann || !ann.annotationType) continue;
            // Text annotations are handled by _processTextAnnotations and
            // already get the wv-text-annotation-btn — skip here.
            if (ann.annotationType === "text") continue;
            // Skip annotations the user has filtered out (color / tag
            // / author / search). The reader hides them in the PDF
            // view; our badge would be left dangling otherwise.
            if (hiddenKeys.has(ann.key)) continue;
            // Drag-end commit-pending guard. After a drag ends, the
            // pointerup handler fires an immediate rescan to snap the
            // badge to the final position — but Zotero may not have
            // committed the new position to the database yet, so
            // `attachment.getAnnotations()` returns the PRE-drag
            // position. Re-placing from the database here would snap
            // the badge back to the original spot; the followup
            // rescan 60 ms later would then snap it to the final spot
            // ("snap back, then forward" flicker, especially visible
            // on note annotations).
            //
            // Override with the live drag-end position until either
            // the database catches up (positions match) or a 2 s
            // safety timeout elapses. We can't `continue` here — that
            // would drop the annotation from `allWantKeys` and the
            // sweep loop below would remove the badge entirely.
            let liveOverridePos = null;
            if (this._dragEndPending) {
                const pending = this._dragEndPending.get(ann.key);
                if (pending) {
                    let dbPos = ann.annotationPosition;
                    if (typeof dbPos === "string") {
                        try { dbPos = JSON.parse(dbPos); } catch(e) {}
                    }
                    const dbRect = dbPos && dbPos.rects && dbPos.rects[0];
                    const lvRect = pending.livePos && pending.livePos.rects
                        && pending.livePos.rects[0];
                    const matches = dbRect && lvRect
                        && Math.abs(dbRect[0] - lvRect[0]) < 0.5
                        && Math.abs(dbRect[1] - lvRect[1]) < 0.5;
                    if (matches) {
                        this._dragEndPending.delete(ann.key);
                    } else if (Date.now() - pending.ts < 2000) {
                        liveOverridePos = pending.livePos;
                    } else {
                        this._dragEndPending.delete(ann.key);
                    }
                }
            }
            // Skip annotations we just deleted via the notifier — Zotero's
            // getAnnotations() may still return them transiently. Without
            // this exclusion, the badge we removed in the notifier gets
            // recreated here ~100 ms later.
            if (this._recentlyDeletedKeys.has(ann.key)) {
                skippedAsRecent++;
                stillReturnedKeys.push(ann.key);
                continue;
            }
            const comment = ann.annotationComment || "";
            const wantsComment = this._iconWantedFor(comment);
            let relCount = 0;
            try { relCount = (ann.relatedItems || []).length; } catch (e) {}
            const wantsRel = relCount > 0;
            if (!wantsComment && !wantsRel) continue;
            let pos = liveOverridePos || ann.annotationPosition;
            if (typeof pos === "string") {
                try { pos = JSON.parse(pos); } catch(e) { continue; }
            }
            if (!pos || !pos.rects || !pos.rects.length) continue;
            const pi = pos.pageIndex || 0;
            if (!byPage.has(pi)) byPage.set(pi, []);
            const list = byPage.get(pi);
            if (wantsRel) {
                list.push({ key: ann.key, type: ann.annotationType,
                    pos, kind: "relations", offsetPdf: 0,
                    relCount });
            }
            if (wantsComment) {
                list.push({ key: ann.key, type: ann.annotationType,
                    pos, comment, kind: "comment",
                    offsetPdf: wantsRel ? REL_OFFSET_PDF : 0 });
            }
        }

        // Refresh the dynamic theme stylesheet so badges adopt the
        // same bg/color/border the text-annotation buttons use. Cheap,
        // and keeps the two surfaces visually synchronized whenever
        // either path runs.
        this._applyDynamicReaderTheme(idoc);

        // Iterate visible pages and reconcile overlays.
        const pages = idoc.querySelectorAll(".pdfViewer .page[data-page-number]");
        let totalAdded = 0, totalRemoved = 0;
        // Find / create the overlay (sibling of pages inside .pdfViewer)
        // — see _ensureBadgeOverlay for the rationale. Sweep stale
        // badges across all pages at once now that they all live in
        // the same parent node. Composite cleanup key is "<key>:<purpose>"
        // so a comment badge and a relations badge for the same
        // annotation track independently — removing one doesn't sweep
        // the other.
        const overlay = this._ensureBadgeOverlay(idoc);
        if (!overlay) return;
        const allWantKeys = new Set();
        for (const page of pages) {
            const pn = parseInt(page.getAttribute("data-page-number"), 10);
            if (!Number.isFinite(pn)) continue;
            const wantList = byPage.get(pn - 1) || [];
            for (const a of wantList) allWantKeys.add(a.key + ":" + a.kind);
        }
        for (const old of overlay.querySelectorAll(".wv-marker-badge")) {
            const k = old.getAttribute("data-wv-for");
            // Pre-existing badges (from before the relations refactor)
            // have no `data-wv-purpose` — treat them as `comment`.
            const p = old.getAttribute("data-wv-purpose") || "comment";
            if (!allWantKeys.has(k + ":" + p)) { old.remove(); totalRemoved++; }
        }

        for (const page of pages) {
            const pn = parseInt(page.getAttribute("data-page-number"), 10);
            if (!Number.isFinite(pn)) continue;
            const pageIdx = pn - 1;

            const wantList = byPage.get(pageIdx) || [];
            if (!wantList.length) continue;

            // Compute page height in unscaled PDF units. PDF.js sets the
            // page's inline style as e.g. style="height: calc(841.92px *
            // var(--scale-factor))" — the unscaled height is the literal
            // number inside the calc(). Read it directly so we don't
            // depend on whether `--scale-factor` is exposed via
            // getComputedStyle().getPropertyValue() (which returns empty
            // for inherited custom properties in some cases).
            // Cache pageHeight on the page element. PDF document
            // dimensions are intrinsic — they don't change across the
            // session — but the source we read from (calc() in style
            // height) can briefly switch to an absolute-pixel form
            // during PDF.js's zoom transition, causing the regex to
            // miss and the float-division fallback to give a number
            // that's a few ulp off the calc-derived value. That tiny
            // delta breaks the dataset comparison in the per-badge
            // loop below — `String(topPdf)` differs across scans, the
            // gate fires, every badge's inline style is rewritten, and
            // the cascade of style invalidations at zoom-stop time
            // produces a visible flicker. Caching once on the page
            // element kills the source of the flicker.
            let pageHeight = parseFloat(page.dataset.wvPageHeight || "");
            if (!pageHeight || !isFinite(pageHeight)) {
                const inlineH = page.style.height || "";
                // PDF.js writes the unscaled page height in two forms
                // depending on the build:
                //   • Older: `calc(841.92px * var(--scale-factor))`
                //   • Newer: `round(down, var(--total-scale-factor) * 841.92px, ...)`
                // Both expose the literal unscaled value as a `<N>px`
                // token; this regex matches a bare px literal anywhere
                // in the expression so we get the intrinsic height
                // regardless of which form is in use. (We deliberately
                // don't try to parse the full expression — `round()`
                // wraps the literal in extra args that the original
                // calc-only regex couldn't handle.)
                const m = /(\d+(?:\.\d+)?)\s*px/.exec(inlineH);
                if (m) pageHeight = parseFloat(m[1]);
                if (!pageHeight || !isFinite(pageHeight)) {
                    // Fallback: rendered height ÷ scale-factor read from
                    // either the inline style of an ancestor or the
                    // computed style at the page element.
                    const cs = idoc.defaultView.getComputedStyle(page);
                    const pxHeight = parseFloat(cs.height) || 0;
                    let sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                    if (!sf || !isFinite(sf)) {
                        let p = page.parentElement;
                        while (p && !sf) {
                            const ps = idoc.defaultView.getComputedStyle(p);
                            sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                            if (sf && isFinite(sf)) break;
                            p = p.parentElement;
                        }
                    }
                    if (!sf || !isFinite(sf)) sf = 1;
                    pageHeight = pxHeight / sf;
                }
                if (pageHeight && isFinite(pageHeight)) {
                    page.dataset.wvPageHeight = String(pageHeight);
                }
            }
            if (!pageHeight || !isFinite(pageHeight)) continue;

            // Resolve scale-factor in JS so we can write plain pixel
            // values for left/top. Cascade-only `calc(... * var(--scale-factor))`
            // failed in practice (badges stacked at the layer origin), so we
            // both inline `position: absolute` and bake the scale into px.
            let sf = 0;
            try {
                const cs = idoc.defaultView.getComputedStyle(page);
                sf = parseFloat(cs.getPropertyValue("--scale-factor"));
                if (!sf || !isFinite(sf)) {
                    let p = page.parentElement;
                    while (p && (!sf || !isFinite(sf))) {
                        const ps = idoc.defaultView.getComputedStyle(p);
                        sf = parseFloat(ps.getPropertyValue("--scale-factor"));
                        if (sf && isFinite(sf)) break;
                        p = p.parentElement;
                    }
                }
                if (!sf || !isFinite(sf)) {
                    // Last-ditch: derive from rendered height vs. unscaled height.
                    const pxH = parseFloat(idoc.defaultView.getComputedStyle(page).height) || 0;
                    if (pageHeight > 0 && pxH > 0) sf = pxH / pageHeight;
                }
            } catch(e) { /* ignore */ }
            if (!sf || !isFinite(sf) || sf <= 0) sf = 1;

            const pageOffTop  = page.offsetTop  + "px";
            const pageOffLeft = page.offsetLeft + "px";
            for (const item of wantList) {
                const purpose = item.kind;  // "comment" | "relations"
                const r = item.pos.rects[0];
                const x1 = r[0], y1 = r[1], x2 = r[2], y2 = r[3];
                const leftPdf = x1 + (item.offsetPdf || 0) + HANDLE_CLEAR_DX_PDF;
                const topPdf  = pageHeight - y2 - HANDLE_CLEAR_DY_PDF;
                let badge = overlay.querySelector(
                    ".wv-marker-badge[data-wv-for=\"" + item.key + "\"]"
                    + "[data-wv-purpose=\"" + purpose + "\"]");
                const isNew = !badge;
                if (isNew) {
                    badge = idoc.createElement("div");
                    badge.className = "wv-marker-badge";
                    if (purpose === "relations") {
                        badge.classList.add("wv-rel-marker");
                    }
                    badge.setAttribute("data-wv-for", item.key);
                    badge.setAttribute("data-wv-purpose", purpose);
                    badge.dataset.wvPage = String(pn);
                    badge.dataset.wvLeftPdf = String(leftPdf);
                    badge.dataset.wvTopPdf  = String(topPdf);
                    badge.dataset.wvPageOffTop  = pageOffTop;
                    badge.dataset.wvPageOffLeft = pageOffLeft;
                    if (purpose === "comment") {
                        this._applyIconState(badge, item.comment || "");
                    } else {
                        // Relations badge — chain icon, no amber-disc
                        // states, no comment-driven tooltip. Title
                        // shows the related-items count.
                        const n = item.relCount || 0;
                        badge.title = n + " Related";
                        badge.appendChild(this._makeRelationsSvg(idoc));
                    }

                    badge.style.position      = "absolute";
                    badge.style.pointerEvents = "auto";
                    badge.style.cursor        = "pointer";
                    badge.style.userSelect    = "none";
                    badge.style.zIndex        = "5";
                    badge.style.fontSize      = "calc(7px * var(--scale-factor, 1))";
                    badge.style.padding       = "0px";
                    badge.style.borderRadius  = "calc(2px * var(--scale-factor, 1))";

                    // Position uses two CSS variables we own:
                    //   --page-offset-top / --page-offset-left
                    //     pixel offset of this page within .pdfViewer
                    //     (refreshed by the reposition observer when
                    //     pages reflow at zoom-stop)
                    //   --scale-factor   inherited from .pdfViewer
                    //     (PDF.js writes it on every zoom step)
                    // The annotation's PDF-space coords are baked as
                    // literals; the browser handles smooth zoom via
                    // calc() with no JS write per zoom step.
                    badge.style.setProperty("--page-offset-top",  pageOffTop);
                    badge.style.setProperty("--page-offset-left", pageOffLeft);
                    badge.style.left = "calc(var(--page-offset-left, 0px) + "
                        + leftPdf + "px * var(--scale-factor, 1))";
                    badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                        + topPdf + "px - 5px) * var(--scale-factor, 1))";

                    const stopAndPrevent = (e) => {
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                        e.preventDefault();
                    };
                    badge.addEventListener("mousedown",  stopAndPrevent, true);
                    badge.addEventListener("pointerdown", stopAndPrevent, true);
                    if (purpose === "comment") {
                        badge.addEventListener("click", (e) => {
                            stopAndPrevent(e);
                            const c = badge.dataset.wvComment || "";
                            if (!c) return;
                            const sc = this._screenCoords(badge);
                            this.openCommentPopup(c, {
                                anchorNode: badge,
                                ...(sc ? { anchorScreen: sc } : {}),
                            });
                        }, true);
                    } else {
                        // Relations click: re-resolve the annotation
                        // item at click time so a relation that was
                        // added/removed since render is reflected.
                        const annKey = item.key;
                        const lib = attachment.libraryID;
                        badge.addEventListener("click", (e) => {
                            stopAndPrevent(e);
                            const annItem = this._getAnnotationItem(lib, annKey);
                            if (!annItem) return;
                            const sc = this._screenCoords(badge);
                            this.openRelationsPopup(annItem, {
                                anchorNode: badge,
                                ...(sc ? { anchorScreen: sc } : {}),
                            });
                        }, true);
                    }
                    overlay.appendChild(badge);
                    totalAdded++;
                }
                // Per-scan refresh: comment text + page-offset variable
                // (in case the annotation hopped pages OR the page
                // reflowed while our observer was off-frame). Comment
                // refresh is a no-op for relations badges.
                if (purpose === "comment") {
                    const newComment = item.comment || "";
                    if (badge.dataset.wvComment !== newComment) {
                        badge.dataset.wvComment = newComment;
                    }
                }
                if (badge.dataset.wvPage !== String(pn)) {
                    badge.dataset.wvPage = String(pn);
                }
                if (badge.dataset.wvPageOffTop !== pageOffTop) {
                    badge.dataset.wvPageOffTop = pageOffTop;
                    badge.style.setProperty("--page-offset-top", pageOffTop);
                }
                if (badge.dataset.wvPageOffLeft !== pageOffLeft) {
                    badge.dataset.wvPageOffLeft = pageOffLeft;
                    badge.style.setProperty("--page-offset-left", pageOffLeft);
                }
                // Position update guard: rewrite the calc() expressions
                // only if the annotation actually moved (rare). For
                // relations badges, the offset can also change if the
                // annotation gained/lost a comment badge alongside it.
                const leftKey = String(leftPdf);
                const topKey  = String(topPdf);
                if (!isNew && badge.dataset.wvLeftPdf !== leftKey) {
                    badge.dataset.wvLeftPdf = leftKey;
                    badge.style.left = "calc(var(--page-offset-left, 0px) + "
                        + leftPdf + "px * var(--scale-factor, 1))";
                }
                if (!isNew && badge.dataset.wvTopPdf !== topKey) {
                    badge.dataset.wvTopPdf = topKey;
                    badge.style.top = "calc(var(--page-offset-top, 0px) + ("
                        + topPdf + "px - 5px) * var(--scale-factor, 1))";
                }
            }
        }

        if (totalAdded || totalRemoved || skippedAsRecent) {
            this._dbg("[Weavero] overlay: pages=" + pages.length
                + " annsWithLinks=" + annotations.filter(a => a.annotationType !== "text"
                    && this.hasURI(a.annotationComment || "")).length
                + " badgesAdded=" + totalAdded + " badgesRemoved=" + totalRemoved
                + " skippedAsRecent=" + skippedAsRecent
                + " stillReturned=" + JSON.stringify(stillReturnedKeys)
                + " recentSize=" + this._recentlyDeletedKeys.size);
        }
    }

    /** Wire up icon overlays for a DOM-view reader (HTML snapshot or EPUB).
     *
     *  The DOM-view readers use a srcdoc iframe whose body contains an
     *  `#annotation-overlay` element with an open shadow root. Inside the
     *  shadow root, Zotero renders each annotation as an SVG/HTML element
     *  carrying `data-annotation-id="<numeric id>"`. Our icons go into the
     *  iframe's *light* DOM (sibling level) so React re-renders inside the
     *  shadow root don't reach them.
     *
     *  Re-runs the placement on:
     *  - shadow-root mutations (annotation create/edit/delete, page changes)
     *  - scroll/resize (positions are viewport-relative, change with scroll)
     */
    _wireUpDomViewReader(reader, innerWin, innerDoc) {
        try {
            this._dbg("[Weavero] DOM-view wireUp: URL=" + innerDoc.URL);

            // Inject our icon CSS into the iframe's light DOM. The badges
            // we place are siblings of the annotation-overlay element, so
            // they pick up styles from light-DOM stylesheets (not from
            // the shadow root).
            // Defensive remove-then-add: an old plugin instance's style
            // node may survive destroy(); skipping injection on a stale
            // element pins the page on the previous version's CSS.
            {
                const existing = innerDoc.getElementById("weavero-inner-styles");
                if (existing) existing.remove();
                const s = innerDoc.createElement("style");
                s.id = "weavero-inner-styles";
                // position: absolute with page coords (rect + scroll),
                // appended to documentElement (not body). This avoids
                // two problems with the inner iframe:
                //  1. body-level CSS transforms/filters/will-change/
                //     contain change the containing block for fixed
                //     descendants — making `position: fixed` anchor to
                //     body, not the viewport.
                //  2. body padding/margin offsets `position: absolute`
                //     children when body has `position: relative`.
                // documentElement (<html>) is far less likely to have
                // any of those properties; absolute positioning then
                // anchors to the initial containing block (page coords).
                // z-index: max int — Zotero's annotation overlay uses
                // 2147483647 too, but in body's stacking context. By
                // attaching to <html>, our badge's stacking context
                // sits above body's, so we paint on top.
                s.textContent =
                    ".wv-marker-badge {"
                    + "  position: absolute; pointer-events: auto; user-select: none;"
                    + "  cursor: pointer; line-height: 1;"
                    + "  z-index: 2147483647;"
                    + "  background: transparent; border: none; padding: 0;"
                    + "  display: inline-flex; align-items: center; justify-content: center;"
                    + "  width: 14px; height: 14px;"
                    + "  font-size: 14px;"  // controls 1em chain SVG size
                    + "  color: #7a4a00;"   // amber-brown, matches PDF reader
                    + "  transform: translateZ(0);"
                    + "}"
                    + ".wv-marker-badge:hover { opacity: 0.7; }"
                    // Same chain-link SVG used in the PDF reader. Sized
                    // to 1em so it fills the badge; stroke set on the
                    // path elements directly (currentColor's resolution
                    // order is unreliable across multiple style rules,
                    // see comment near _makeLinkSvg).
                    + ".wv-link-svg, .wv-relations-svg {"
                    + "  width: 1em; height: 1em; display: block; flex-shrink: 0;"
                    + "}"
                    // (Stroke-tint of `.wv-link-svg path` removed —
                    // the needle has its own multi-colour paint.)
                    // Relations marker — chain icon for `dc:relation`
                    // triples, painted in the same amber-brown as
                    // every other chain icon across the plugin
                    // (items list, sidebar, PDF reader badge,
                    // context-menu entry).
                    + ".wv-marker-badge.wv-rel-marker {"
                    + "  color: #7a4a00 !important;"
                    + "}"
                    + ":root.wv-reader-dark .wv-marker-badge.wv-rel-marker {"
                    + "  color: #ffb84d !important;"
                    + "}";
                (innerDoc.head || innerDoc.documentElement).appendChild(s);
            }

            const data = this._readerObservers.get(reader) || {};
            data.innerDoc = innerDoc;
            data.innerWindow = innerWin;
            data.isDomView = true;

            // Resolve the inner Reader instance ONCE per wireUp and
            // cache _primaryView / _annotationsByID on `data` for the
            // recompute loop (avoids re-walking the wrappedJSObject
            // chain on every scroll / zoom / mutation tick).
            try {
                const outerWin = reader && reader._iframeWindow;
                if (outerWin) {
                    const wrap = outerWin.wrappedJSObject;
                    const readerInst = outerWin._reader || (wrap && wrap._reader);
                    const primaryView = readerInst && readerInst._primaryView;
                    if (primaryView) {
                        data.domViewPrimaryView = primaryView;
                        data.domViewAnnsByID = primaryView._annotationsByID || null;
                        this._dbg("[Weavero] DOM-view wireUp: _reader OK "
                            + "(annsByID size=" + (data.domViewAnnsByID && data.domViewAnnsByID.size)
                            + ", hasToDisplayedRange="
                            + (typeof primaryView.toDisplayedRange === "function") + ")");
                    } else {
                        this._dbg("[Weavero] DOM-view wireUp: _reader/_primaryView missing — "
                            + "range strategy unavailable, will use DOM fallbacks");
                    }
                }
            } catch(e) {
                Zotero.debug("[Weavero] DOM-view wireUp: _reader resolve err: " + e.message);
            }

            // Single debounced recompute, shared across every trigger
            // (mutation, scroll, resize, zoom). rAF coalesces bursts
            // (e.g. continuous wheel-zoom) into one repaint per frame.
            let scheduled = false;
            const recompute = () => {
                if (scheduled) return;
                scheduled = true;
                innerWin.requestAnimationFrame(() => {
                    scheduled = false;
                    try { this._processDomViewAnnotationIcons(innerDoc, reader); }
                    catch(e) { Zotero.debug("[Weavero] DOM-view scan error: " + e); }
                });
            };

            // MutationObserver on the shadow root catches:
            //  - childList: annotation create/delete (React mounts/unmounts SVG nodes)
            //  - attributes: React re-renders that update existing SVG nodes
            //    (this is what fires during zoom — React adjusts x/y/width/height
            //    on the same elements rather than recreating them, so a
            //    childList-only observer misses it and badges drift).
            const overlay = innerDoc.getElementById("annotation-overlay");
            const shadowRoot = overlay && overlay.shadowRoot;
            if (shadowRoot && !data.domViewObserver) {
                const observer = new innerWin.MutationObserver(recompute);
                observer.observe(shadowRoot, {
                    childList: true, subtree: true, attributes: true,
                });
                data.domViewObserver = observer;
            }

            // ResizeObserver on the iframe body catches CSS-zoom and
            // font-size changes that don't fire scroll/resize on the window.
            if (innerWin.ResizeObserver && !data.domViewResizeObserver) {
                const ro = new innerWin.ResizeObserver(recompute);
                ro.observe(innerDoc.body);
                data.domViewResizeObserver = ro;
            }

            // Scroll/resize listeners cover regular scroll + window resize.
            // capture=true picks up scroll on inner scrollable elements.
            if (!data.domViewScrollHandler) {
                innerWin.addEventListener("scroll", recompute, true);
                innerWin.addEventListener("resize", recompute);
                data.domViewScrollHandler = recompute;
            }

            this._readerObservers.set(reader, data);

            // Initial placement.
            this._processDomViewAnnotationIcons(innerDoc, reader);

            this._dbg("[Weavero] DOM-view wireUp: observer + listeners attached");
        } catch(e) {
            Zotero.debug("[Weavero] DOM-view wireUp error: " + e);
        }
    }

    /** Place / update / remove `.wv-marker-badge` icons next to each
     *  annotation in the DOM-view reader's iframe, for any annotation
     *  whose comment has a URL or markdown.
     *
     *  Position is computed via the same `toDisplayedRange + collapse-
     *  to-first-character` sequence Zotero uses for its own comment
     *  indicator, so the chain badge overlays Zotero's blue speech-
     *  bubble. Badges are placed in the iframe's light DOM (attached
     *  to documentElement) and tagged with `data-wv-for="<key>"` so we
     *  can reconcile across re-runs (drop stale, update in place,
     *  create new).
     */
    _processDomViewAnnotationIcons(idoc, reader) {
        // Honor the master gates — when either pref is off, strip any
        // badges we previously placed and bail.
        if (!this._getEnableReaderView() || !this._getEnableReaderViewIcons()) {
            for (const b of idoc.querySelectorAll(".wv-marker-badge[data-wv-domview]")) {
                b.remove();
            }
            return;
        }
        if (!reader || !reader._item) return;

        const overlay = idoc.getElementById("annotation-overlay");
        const shadowRoot = overlay && overlay.shadowRoot;
        if (!shadowRoot) return;

        let annotations = [];
        try { annotations = reader._item.getAnnotations() || []; }
        catch(e) {
            this._dbg("[Weavero] DOM-view: getAnnotations error: " + e);
            return;
        }

        // Map<key, { ann, wantsComment, wantsRel }> — both flags can be
        // true on the same annotation, in which case we'll place TWO
        // badges (comment at primary position, relations offset 16 px
        // to the right). Same side-by-side pattern as the annotation
        // header and the PDF reader.
        const REL_OFFSET_PX = 16;
        const wantByKey = new Map();
        for (const ann of annotations) {
            if (!ann || !ann.key) continue;
            const comment = ann.annotationComment || "";
            const wantsComment = this._iconWantedFor(comment);
            let relCount = 0;
            try { relCount = (ann.relatedItems || []).length; } catch (e) {}
            const wantsRel = relCount > 0;
            if (!wantsComment && !wantsRel) continue;
            wantByKey.set(ann.key,
                { ann, wantsComment, wantsRel, relCount });
        }

        // Drop badges whose annotation no longer needs one. Composite
        // key "<annKey>:<purpose>" so a relations badge surviving past
        // a relation-removal and a comment badge surviving past a
        // comment-edit are reaped independently.
        for (const old of idoc.querySelectorAll(".wv-marker-badge[data-wv-domview]")) {
            const k = old.getAttribute("data-wv-for");
            const p = old.getAttribute("data-wv-purpose") || "comment";
            const entry = wantByKey.get(k);
            const stillWanted = entry
                && (p === "comment" ? entry.wantsComment : entry.wantsRel);
            if (!stillWanted) old.remove();
        }

        // primaryView / annsByID were resolved once at wireUp time and
        // cached on the reader's data object — see _wireUpDomViewReader.
        // (WADMAnnotation has `position` as a Selector, not a live
        // Range; we call `primaryView.toDisplayedRange(selector)` to
        // get a Range, the same method upstream uses, see dom-view.tsx:399.)
        const data = this._readerObservers.get(reader) || {};
        const primaryView = data.domViewPrimaryView || null;
        const annsByID = data.domViewAnnsByID || null;

        let placed = 0, skipped = 0;
        for (const [key, entry] of wantByKey) {
            const ann = entry.ann;
            // Strategy 1 (preferred): same method Zotero uses to position
            // its CommentIcon. Get the live Range via toDisplayedRange,
            // then mimic upstream's `collapseToOneCharacterAtStart` —
            // setEnd to start+1 so the range covers exactly one
            // character (NOT collapse(true) — empty ranges give
            // degenerate rects). Read range.getBoundingClientRect(),
            // place badge at (rect.left - 7, rect.top - 7) so its
            // center matches the comment indicator's center.
            let rect = null, isNoteIcon = false;
            try {
                const wadm = annsByID && annsByID.get(key);
                if (wadm && wadm.position && primaryView
                        && typeof primaryView.toDisplayedRange === "function") {
                    const range = primaryView.toDisplayedRange(wadm.position);
                    if (range && typeof range.cloneRange === "function") {
                        const r = range.cloneRange();
                        const sc = r.startContainer;
                        if (sc && sc.nodeValue && sc.nodeValue.length > r.startOffset) {
                            r.setEnd(sc, r.startOffset + 1);
                        } else {
                            r.collapse(true);
                        }
                        const rr = r.getBoundingClientRect();
                        if (rr.width || rr.height) rect = rr;
                    }
                }
            } catch(e) {
                this._dbg("[Weavero] DOM-view: range strategy err for "
                    + key + ": " + e.message);
            }

            // Strategy 2 (fallback, type-aware DOM lookup): used when
            // the range strategy fails (e.g. for note annotations whose
            // selector resolves to an empty range, or if _reader isn't
            // accessible). Pick by element kind in priority order.
            //
            //  - <svg data-annotation-id="X"> exists for notes (which
            //    pass `annotation` to CommentIcon). It IS the rendered
            //    24×24 note icon. Badge top-left = SVG top-left so the
            //    chain sits in the note icon's corner.
            //
            //  - For highlights/underlines, `data-annotation-id` lives
            //    on the inner <div class="annotation-div"> (one per
            //    highlight line, NOT on the wrapping <foreignObject>).
            //    Pick the topmost-then-leftmost div = first line's
            //    rect, anchor there.
            if (!rect) {
                const noteSvg = shadowRoot.querySelector(
                    'svg[data-annotation-id="' + key + '"]');
                if (noteSvg) {
                    const rr = noteSvg.getBoundingClientRect();
                    if (rr.width || rr.height) {
                        rect = rr;
                        isNoteIcon = true;
                    }
                }
            }
            if (!rect) {
                // For highlights/underlines the `data-annotation-id` is
                // on the inner annotation-div (not on the wrapping
                // <foreignObject>). One div per highlight line. Pick
                // the topmost-then-leftmost = first line's rect.
                const divs = shadowRoot.querySelectorAll(
                    'div[data-annotation-id="' + key + '"]');
                if (divs.length) {
                    let best = divs[0], bestRect = best.getBoundingClientRect();
                    for (let i = 1; i < divs.length; i++) {
                        const rr = divs[i].getBoundingClientRect();
                        if (rr.top < bestRect.top - 1
                            || (Math.abs(rr.top - bestRect.top) < 1 && rr.left < bestRect.left)) {
                            best = divs[i];
                            bestRect = rr;
                        }
                    }
                    if (bestRect.width || bestRect.height) rect = bestRect;
                }
            }
            if (!rect) {
                const any = shadowRoot.querySelector('[data-annotation-id="' + key + '"]');
                if (any) {
                    const rr = any.getBoundingClientRect();
                    if (rr.width || rr.height) rect = rr;
                }
            }

            if (!rect) {
                skipped++;
                this._dbg("[Weavero] DOM-view: skip key=" + key + " (no usable rect)");
                continue;
            }

            // position: absolute on documentElement → use PAGE coords
            // (rect + scroll). Visual placement matches the PDF
            // reader's badge-and-chain layout:
            //  - highlight (range strategy): comment indicator (14×14)
            //    is centered at first-char point (its top edge is at
            //    rect.top - 7). Place chain 2 px above that top edge
            //    so it pokes just out of the indicator's top:
            //      top = (rect.top - 7) - 2 = rect.top - 9
            //  - note-svg: rect IS the 24×24 note. Place chain at the
            //    note's top-left, raised by 8 so the chain's top half
            //    sits clearly above the note.
            //      left = rect.left, top = rect.top - 8
            const win = idoc.defaultView;
            const sX = (win && win.scrollX) || 0;
            const sY = (win && win.scrollY) || 0;
            const baseLeft = rect.left + sX;
            const baseTop  = rect.top  + sY - (isNoteIcon ? 8 : 9);

            // Helper: place / refresh one badge for a given purpose.
            // Both purposes share rect, top placement, and click-time
            // popup mechanics; they differ only in glyph, click target,
            // and horizontal offset.
            //
            // Order policy: relations gets the primary spot (closer to
            // a native Zotero feature). When BOTH badges apply, the
            // comment badge moves RIGHT by REL_OFFSET_PX; the relations
            // badge stays at the anchor.
            const placeBadge = (purpose) => {
                const isRel = purpose === "relations";
                const left = baseLeft
                    + (!isRel && entry.wantsRel ? REL_OFFSET_PX : 0);
                const top = baseTop;
                let badge = idoc.querySelector(
                    '.wv-marker-badge[data-wv-domview][data-wv-for="'
                    + key + '"][data-wv-purpose="' + purpose + '"]');
                if (!badge) {
                    badge = idoc.createElement("div");
                    badge.className = "wv-marker-badge";
                    if (isRel) badge.classList.add("wv-rel-marker");
                    badge.setAttribute("data-wv-domview", "1");
                    badge.setAttribute("data-wv-for", key);
                    badge.setAttribute("data-wv-purpose", purpose);
                    if (isRel) {
                        badge.appendChild(this._makeRelationsSvg(idoc));
                        const n = entry.relCount || 0;
                        badge.title = n + " Related";
                    } else {
                        badge.appendChild(this._makeLinkSvg(idoc));
                        badge.title = "Open comment";
                    }
                    badge.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        try {
                            // Prefer screen coords (mozInnerScreenX/Y +
                            // local rect): the popup is created in the
                            // main Zotero window, so anchorNode's
                            // getBoundingClientRect would return iframe-
                            // local coords misinterpreted as main-window
                            // coords. The PDF reader's badges use the
                            // same `_screenCoords` helper for the same
                            // reason.
                            const sc = this._screenCoords(badge);
                            if (isRel) {
                                // Re-resolve the annotation item at
                                // click time so a relation that was
                                // added/removed since render reflects
                                // in the popup.
                                const lib = reader._item.libraryID;
                                const annItem = this._getAnnotationItem(lib, key);
                                if (!annItem) return;
                                this.openRelationsPopup(annItem, {
                                    anchorNode: badge,
                                    ...(sc ? { anchorScreen: sc } : {}),
                                });
                            } else {
                                this.openCommentPopup(ann.annotationComment || "", {
                                    anchorNode: badge,
                                    ...(sc ? { anchorScreen: sc } : {}),
                                });
                            }
                        } catch(e) {
                            Zotero.debug("[Weavero] DOM-view badge click err: " + e);
                        }
                    });
                    // Append to documentElement (<html>), NOT body — see
                    // the CSS-injection comment for why.
                    idoc.documentElement.appendChild(badge);
                }
                badge.style.left = left + "px";
                badge.style.top  = top  + "px";
                placed++;
            };

            if (entry.wantsComment) placeBadge("comment");
            if (entry.wantsRel)     placeBadge("relations");
        }

        // Diagnostic — only emitted when weavero.debug is on.
        if (wantByKey.size || placed || skipped) {
            this._dbg("[Weavero] DOM-view: " + wantByKey.size
                + " annotation(s) want icons, " + placed
                + " badge(s) placed, " + skipped
                + " skipped (no DOM match or zero rect)");
        }
    }

    /** Set up our text-annotation processing on the inner PDF.js viewer
     *  iframe nested inside the outer reader iframe. Polls until the inner
     *  iframe + its document body are available, then wires up. */
    _setupInnerReaderObserver(reader, outerDoc) {
        let attempts = 0;

        const wireUp = (innerWin, innerDoc) => {
            try {
                this._dbg("[Weavero] inner wireUp: doc URL=" + innerDoc.URL);
                // Defensive remove-then-add: see _ensureReaderOuterStyles.
                {
                    const existing = innerDoc.getElementById("weavero-inner-styles");
                    if (existing) existing.remove();
                    const s = innerDoc.createElement("style");
                    s.id = "weavero-inner-styles";
                    s.textContent =
                        // Shared structural rule for both reader-side
                        // icon classes — boxless, just the bare glyph.
                        // The text-annotation button is a <button>
                        // element so browser-default chrome (gray
                        // fill, beveled border, padding) sneaks in
                        // unless we explicitly reset it. The marker
                        // badge is a <div> so the resets are no-ops
                        // there.
                        ".wv-marker-badge,"
                        + ".wv-text-annotation-btn {"
                        + "  position: absolute; pointer-events: auto; user-select: none;"
                        + "  line-height: 1; cursor: pointer;"
                        + "  background: transparent; border: none; padding: 0;"
                        + "  transition: background 0.15s;"
                        // Force the badge onto its own GPU compositing
                        // layer. PDF.js redraws the entire page surface
                        // at zoom stop (re-rasterizes the canvas), and
                        // the surrounding stacking context gets a brief
                        // "blank then re-paint" flash. translateZ(0)
                        // (the classic "null transform" hack) promotes
                        // the badge to its own layer.
                        + "  transform: translateZ(0);"
                        + "  backface-visibility: hidden;"
                        + "  contain: paint;"
                        + "}"
                        // Defense against PDF.js's .page.loading state.
                        // When PDF.js re-rasterizes the canvas at zoom
                        // stop, it briefly applies the `loading` class
                        // (and `loadingIcon`) to the .page element. The
                        // viewer's stylesheet uses that class to hide
                        // child layers via opacity / visibility so the
                        // user doesn't see a stale / partially-rendered
                        // state. Our badge is a child of .customAnnotationLayer
                        // — itself a child of .page — and gets caught
                        // in that flash. We force visibility / opacity
                        // through the transition with !important so
                        // the badge stays painted across the swap.
                        // High z-index defeats any overlay that
                        // PDF.js might draw via ::before/::after on
                        // the loading page.
                        + ".page > .customAnnotationLayer,"
                        + ".page.loading > .customAnnotationLayer,"
                        + ".page.loadingIcon > .customAnnotationLayer {"
                        + "  visibility: visible !important;"
                        + "  opacity: 1 !important;"
                        + "  display: block !important;"
                        + "  transform: none !important;"
                        + "  filter: none !important;"
                        + "}"
                        + ".wv-marker-badge,"
                        + ".wv-text-annotation-btn {"
                        + "  visibility: visible !important;"
                        + "  opacity: 1 !important;"
                        + "  z-index: 9999 !important;"
                        + "}"
                        // Chain SVG sizing — width/height 1em scales with
                        // the badge's calc-driven font-size so the icon
                        // tracks PDF.js zoom natively. Same for the
                        // relations SVG used by the new `.wv-rel-marker`
                        // badge variant.
                        + ".wv-link-svg, .wv-relations-svg {"
                        + "  width: 1em; height: 1em; display: block;"
                        + "  flex-shrink: 0;"
                        + "}"
                        // Relations marker badge — the chain icon for
                        // `dc:relation` triples. Painted in the same
                        // amber-brown as the items-list `.wv-tree-rel-icon`
                        // and sidebar `.wv-btn-relations` so all
                        // chain icons across the plugin read as one
                        // affordance.
                        //
                        // Override `color` (not `fill`) on the badge,
                        // because the path inside _makeRelationsSvg
                        // has `fill="currentColor"` baked in as an
                        // SVG attribute — that shadows any `fill` set
                        // on an ancestor SVG element. Setting `color`
                        // on the badge wins because currentColor
                        // resolves up to the nearest `color` rule.
                        // We need !important to beat
                        // `_applyDynamicReaderTheme`'s contrast color
                        // (`#f4f4f4` / `#1a1a1a`) on `.wv-marker-badge`.
                        + ".wv-marker-badge.wv-rel-marker {"
                        + "  color: #7a4a00 !important;"
                        + "}"
                        + ":root.wv-reader-dark .wv-marker-badge.wv-rel-marker {"
                        + "  color: #ffb84d !important;"
                        + "}"
                        // (No opacity override — uniform at 1 across themes;
                        // the hover-bg in the dynamic stylesheet provides
                        // the only hover affordance.)
                        + "";
                    (innerDoc.head || innerDoc.documentElement).appendChild(s);
                }

                const initialCount = innerDoc.querySelectorAll("textarea.textAnnotation").length;
                this._dbg("[Weavero] inner wireUp: "
                    + initialCount + " textarea.textAnnotation elements at init");
                this._processTextAnnotations(innerDoc);
                try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                catch(e) { Zotero.debug("[Weavero] overlay scan error: " + e); }

                // Live-drag tracker for canvas-rendered annotations
                // (highlight / underline / image / ink). Wired here so
                // pointerdown/move/up events on PDF.js's canvas fire on
                // the inner doc — events do NOT bubble out to the outer
                // reader iframe, so binding from _setupReaderObserver
                // never saw the drag.
                try { this._setupAnnotationDragTracker(reader, innerDoc); }
                catch(e) { Zotero.debug("[Weavero] drag tracker setup err: " + e); }

                let timer = null;
                const observer = new innerWin.MutationObserver((muts) => {
                    // Immediate orphan sweep on any childList mutation that
                    // removed nodes — covers annotation deletion. The full
                    // re-scan (positioning, badge creation) stays on the
                    // 100 ms debounce so we don't thrash during render
                    // bursts. _sweepStaleOverlays is a cheap O(N) pass that
                    // only removes badges/buttons whose target is gone.
                    let hadRemovals = false;
                    for (const m of muts) {
                        if (m.type === "childList" && m.removedNodes && m.removedNodes.length) {
                            hadRemovals = true; break;
                        }
                    }
                    if (hadRemovals) {
                        try { this._sweepStaleOverlays(innerDoc, reader); }
                        catch(e) { Zotero.debug("[Weavero] sweep error: " + e); }
                    }
                    if (timer) innerWin.clearTimeout(timer);
                    timer = innerWin.setTimeout(() => {
                        timer = null;
                        try { this._processTextAnnotations(innerDoc); }
                        catch(e) { Zotero.debug("[Weavero] inner scan error: " + e); }
                        try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                        catch(e) { Zotero.debug("[Weavero] overlay scan error: " + e); }
                    }, 100);
                });
                observer.observe(innerDoc.body || innerDoc.documentElement, {
                    childList: true, subtree: true,
                    attributes: true,
                    attributeFilter: ["data-comment", "value", "style"],
                });

                const data = this._readerObservers.get(reader) || {};
                data.innerObserver = observer;
                data.innerDoc = innerDoc;
                data.innerWindow = innerWin;

                // Proactive Delete/Backspace handler on the inner
                // PDF.js iframe. Attached at BOTH window and document
                // capture, because Zotero's reader keyboard handlers
                // run at the window level — a document-only listener
                // gets preempted before it fires. The handler short-
                // circuits if no annotation is selected, so attaching
                // broadly is safe.
                if (!data.proactiveInnerDoc) {
                    const proactiveInnerDoc =
                        this._makeProactiveDeleteKeydown(reader, "inner-doc");
                    const proactiveInnerWin =
                        this._makeProactiveDeleteKeydown(reader, "inner-win");
                    innerDoc.addEventListener("keydown", proactiveInnerDoc, true);
                    innerWin.addEventListener("keydown", proactiveInnerWin, true);
                    data.proactiveInnerDoc = proactiveInnerDoc;
                    data.proactiveInnerWin = proactiveInnerWin;
                }
                if (!data.selectionTrackerInner) {
                    data.selectionTrackerInner =
                        this._trackAnnotationSelection(reader, innerDoc);
                }

                // Drag-end repositioning. After the user finishes a
                // drag/resize of an annotation in the PDF, our overlay
                // badges need to move to the new annotation position.
                // Tracking during the drag is impractical (annotations
                // are canvas-rendered, not DOM, so MutationObserver
                // can't see them) — instead, fire a recompute on
                // pointerup so the badges land at the final spot once
                // Zotero commits the new position. setTimeout(120 ms)
                // gives Zotero's drag-end handler time to write the
                // updated position into the data model before we read
                // it back via `attachment.getAnnotations()`.
                if (!data.dragEndPointerUp) {
                    // Two-pass rescan: an immediate one (catches the
                    // common case where Zotero commits the new position
                    // synchronously before pointerup propagates) plus a
                    // 60-ms followup (covers the case where the commit
                    // is queued for the next tick). Two cheap rescans
                    // beats one delayed one — the perceived snap-to-
                    // new-position is now under 60 ms instead of 120 ms.
                    const rescan = (label) => {
                        try {
                            this._processNoteAnnotationOverlays(
                                innerDoc, reader);
                        } catch (err) {
                            Zotero.debug("[Weavero] drag-end overlay "
                                + "rescan (" + label + "): " + err);
                        }
                        try {
                            this._processTextAnnotations(innerDoc);
                        } catch (err) {
                            Zotero.debug("[Weavero] drag-end text "
                                + "rescan (" + label + "): " + err);
                        }
                    };
                    let followupTimer = null;
                    const dragEndPointerUp = (e) => {
                        if (e.button !== 0) return;
                        // Fire #1 inline — under most conditions Zotero's
                        // drag handler has already committed the new
                        // position by the time pointerup bubbles to us.
                        rescan("immediate");
                        if (followupTimer) {
                            innerWin.clearTimeout(followupTimer);
                        }
                        // Fire #2 after a short wait — safety net if the
                        // commit was async.
                        followupTimer = innerWin.setTimeout(() => {
                            followupTimer = null;
                            rescan("followup");
                        }, 60);
                    };
                    innerWin.addEventListener(
                        "pointerup", dragEndPointerUp, true);
                    data.dragEndPointerUp = dragEndPointerUp;
                    data.dragEndPointerUpWindow = innerWin;
                }

                this._readerObservers.set(reader, data);
                this._dbg("[Weavero] inner wireUp: observer attached");
            } catch(e) {
                Zotero.debug("[Weavero] inner wireUp error: " + e);
            }
        };

        const tryOnce = () => {
            attempts++;
            // Dead-wrapper guard: when the user closes / navigates the
            // reader window during the 1-second poll window, outerDoc
            // becomes a dead wrapper and `outerDoc.querySelector(...)`
            // throws "TypeError: can't access dead object". Returning
            // true halts the retry chain (no more tick re-schedules).
            if (this._isDead(outerDoc)) {
                this._dbg("[Weavero] inner setup: outerDoc is dead — "
                    + "reader was closed/navigated; abandoning retry");
                return true;
            }
            const innerFrame = outerDoc.querySelector("iframe");
            if (!innerFrame) {
                this._dbg("[Weavero] inner setup: no iframe found (attempt "
                    + attempts + ")");
                return false;
            }
            try {
                const innerWin = innerFrame.contentWindow;
                const innerDoc = innerWin && innerWin.document;
                if (!innerDoc) {
                    Zotero.debug("[Weavero] inner setup: no contentDocument (attempt "
                        + attempts + ")");
                    return false;
                }
                if (!innerDoc.body) {
                    Zotero.debug("[Weavero] inner setup: doc has no body yet (attempt "
                        + attempts + ", URL=" + innerDoc.URL + ")");
                    return false;
                }
                // The reader iframe initially holds about:blank, then
                // navigates to either the PDF.js viewer (PDF reader) or
                // a srcdoc-based DOM view (HTML snapshot, EPUB). Wiring
                // up before either is in place attaches our observer to
                // the now-dead about:blank document. Branch on which
                // reader type loaded.
                const url = String(innerDoc.URL || "");
                if (/viewer\.html/i.test(url)) {
                    wireUp(innerWin, innerDoc);
                    return true;
                }
                // DOM-view reader (HTML snapshot / EPUB) — identified by
                // the #annotation-overlay element that dom-view.tsx
                // attaches to the iframe body and gives a shadow root.
                if (innerDoc.getElementById("annotation-overlay")) {
                    this._wireUpDomViewReader(reader, innerWin, innerDoc);
                    return true;
                }
                Zotero.debug("[Weavero] inner setup: viewer not loaded yet (attempt "
                    + attempts + ", URL=" + url + ")");
                return false;
            } catch(e) {
                Zotero.debug("[Weavero] inner setup probe error (attempt "
                    + attempts + "): " + e);
                return false;
            }
        };

        if (tryOnce()) return null;

        // Poll up to 10 times (1s apart) waiting for the inner iframe to load.
        const win = (Zotero.getMainWindow && Zotero.getMainWindow()) || null;
        const sched = (cb, ms) => win
            ? win.setTimeout(cb, ms)
            : setTimeout(cb, ms);
        const tick = () => {
            if (attempts >= 10) {
                Zotero.debug("[Weavero] inner setup: gave up after "
                    + attempts + " attempts");
                return;
            }
            if (!tryOnce()) sched(tick, 1000);
        };
        sched(tick, 1000);
        return null;
    }

    /**
     * Render a sibling .wv-md-preview panel inside `commentEl` mirroring the
     * .content text with URLs and markdown formatted for display. Keeps
     * .content untouched so Zotero's contenteditable editor never sees foreign
     * DOM (which used to break click-to-edit and produce duplicated text).
     *
     * Visibility is controlled by CSS (.wv-comment-preview class) — when set,
     * .content hides and .wv-md-preview shows. The .wv-editing class on the
     * same .comment swaps them during edit mode (set by focusin handler).
     *
     * Idempotent: caches the rendered source in data-source, skips rebuild
     * when the source matches. Returns true when a render actually occurred.
     */
    _renderPreviewPanel(commentEl) {
        if (!commentEl || !commentEl.querySelector) return false;
        const doc = commentEl.ownerDocument;
        // .content is the editable text node; in Zotero 10 it's wrapped
        // by intermediate elements inside .comment, so we don't constrain
        // to direct-child selectors.
        const contentEl = commentEl.querySelector(".content");
        if (!contentEl) return false;



        // Icons-only mode (Mode 2): the user's pref says "comments stay
        // plain text", so tear down any preview overlay and let .content
        // show the raw source. The 🔗 icon button is the access path to
        // formatted view. Matches the items list's Mode 2 behaviour
        // (`useMd = inlineLinks && enableCommentMarkdown`).
        if (!this._getInlineLinks()) {
            for (const p of commentEl.querySelectorAll(".wv-md-preview")) p.remove();
            commentEl.classList.remove("wv-comment-preview");
            commentEl.classList.remove("wv-editing");
            return false;
        }

        // Read .content via _readCommentTextWithBreaks so multi-line
        // comments survive intact. textContent silently drops <br>
        // separators, which would (a) collapse the visual line break in
        // the rendered preview and (b) let the URL regex consume the next
        // line's text since nothing whitespace-y separates them anymore.
        const text  = this._readCommentTextWithBreaks(contentEl);
        const norm  = this.normalize(text);
        const useMd = this._getEnableCommentMarkdown();
        const useUrls = this._getEnableInlineUrls();
        const hasUrls = useUrls && this.hasURI(text);
        const hasMd   = useMd && this.MD_REGEX.test(norm);

        // Defensive cleanup: if a previous bug or version left multiple
        // .wv-md-preview nodes inside this .comment, drop all but the first.
        // Going forward we always reuse the single existing node.
        const allPreviews = commentEl.querySelectorAll(".wv-md-preview");
        for (let i = 1; i < allPreviews.length; i++) allPreviews[i].remove();

        // Existing preview lives as a sibling of .content (we put it
        // there). Search anywhere under .comment because .content's wrapper
        // varies between Zotero builds.
        let preview = allPreviews[0] || null;

        // Nothing worth rendering: tear down any stale preview, restore raw.
        if (!hasUrls && !hasMd) {
            if (preview) preview.remove();
            commentEl.classList.remove("wv-comment-preview");
            return false;
        }

        // Cache key encodes both inline-mode sub-toggles so flipping
        // either invalidates the cache and forces a rebuild.
        const cacheKey = (useMd ? "m" : "") + (useUrls ? "u" : "") + ":" + norm;
        if (preview && preview.getAttribute("data-source") === cacheKey) return false;

        // Per-comment rebuild rate limit. When Zotero's React reconciliation
        // strips our preview during sidebar close (or any other DOM
        // churn), cache invalidates and we'd rebuild — Zotero strips
        // again — observer fires — loop, hanging Zotero. The timestamp
        // converts the loop into a slow churn that can't lock the UI.
        const lastRebuild = parseInt(
            commentEl.getAttribute("data-wv-last-rebuild") || "0", 10);
        if ((Date.now() - lastRebuild) < 250) return false;

        if (!preview) {
            preview = doc.createElement("div");
            preview.className = "wv-md-preview";
            contentEl.insertAdjacentElement("afterend", preview);
        }

        // Copy contentEl's padding/margin to the preview so they line up
        // exactly. Zotero's CSS targets `.content` directly with its own
        // padding-left in the reader sidebar; without this our sibling
        // .wv-md-preview hangs flush against the left edge while plain
        // text-only comments (which still use .content) sit indented. We
        // re-apply on every render to follow any future Zotero CSS changes.
        try {
            const win = doc.defaultView;
            const cs = win && win.getComputedStyle && win.getComputedStyle(contentEl);
            if (cs) {
                for (const prop of ["padding-left", "padding-right",
                                    "padding-top", "padding-bottom",
                                    "margin-left", "margin-right",
                                    "margin-top", "margin-bottom"]) {
                    const v = cs.getPropertyValue(prop);
                    if (v) preview.style.setProperty(prop, v);
                }
            }
        } catch(e) {}

        // Build the formatted fragment. Markers (** * ~~ ` and the [ ]( )
        // around markdown links) are NOT included in the preview — that's
        // the whole point of having a separate rendered view. The raw
        // markers stay visible inside .content during edit mode.
        const frag = doc.createDocumentFragment();

        // Helper: split text on "\n" and emit <br> elements at each break
        // so multi-line comments keep their visual line structure. The
        // URL regex terminates at \s (which includes \n), so any <br>
        // here always sits BETWEEN tokens.
        const appendTextWithBreaks = (s) => {
            if (!s) return;
            const parts = s.split("\n");
            for (let i = 0; i < parts.length; i++) {
                if (parts[i]) frag.appendChild(doc.createTextNode(parts[i]));
                if (i < parts.length - 1) frag.appendChild(doc.createElement("br"));
            }
        };

        // Group order (when useMd):
        //   1 bold, 2 italic, 3 strike, 4 code-double, 5 code-single,
        //   6 link label, 7 link url, 8 bare URL.
        const TOKEN = useMd ? new RegExp(
            "\\*\\*([\\s\\S]+?)\\*\\*"
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            + "|~~([\\s\\S]+?)~~"
            + "|``([\\s\\S]+?)``"
            + "|`([^`\\n]+?)`"
            + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        ) : new RegExp(this.URL_REGEX.source, "g");

        const wrapMd = (cls, inner) => {
            const span = doc.createElement("span");
            span.className = "wv-md " + cls;
            span.textContent = inner;
            frag.appendChild(span);
        };

        let last = 0, m;
        while ((m = TOKEN.exec(norm)) !== null) {
            if (m.index > last)
                appendTextWithBreaks(norm.slice(last, m.index));
            if (useMd && m[1] !== undefined) {
                wrapMd("wv-md-bold", m[1]);
            } else if (useMd && m[2] !== undefined) {
                wrapMd("wv-md-italic", m[2]);
            } else if (useMd && m[3] !== undefined) {
                wrapMd("wv-md-strike", m[3]);
            } else if (useMd && m[4] !== undefined) {
                // ``code`` (double backtick).
                wrapMd("wv-md-code", m[4]);
            } else if (useMd && m[5] !== undefined) {
                // `code` (single backtick).
                wrapMd("wv-md-code", m[5]);
            } else if (useMd && m[6] !== undefined && m[7] !== undefined) {
                // Markdown link [label](url). When URLs sub-toggle is off,
                // drop the URL part and emit the label as plain text.
                if (useUrls) {
                    const url = m[7];
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = m[6];
                    span.setAttribute("data-href", url);
                    frag.appendChild(span);
                } else {
                    appendTextWithBreaks(m[6]);
                }
            } else {
                // Bare URL (group 8 in md regex, group 0 in URL-only regex).
                const raw = useMd ? m[8] : m[0];
                if (raw === undefined) { last = m.index + m[0].length; continue; }
                if (useUrls) {
                    const url   = raw.replace(this.TRAILING_RE, "");
                    const trail = raw.slice(url.length);
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = url;
                    frag.appendChild(span);
                    if (trail) appendTextWithBreaks(trail);
                } else {
                    appendTextWithBreaks(raw);
                }
            }
            last = m.index + m[0].length;
        }
        if (last < norm.length)
            appendTextWithBreaks(norm.slice(last));

        while (preview.firstChild) preview.removeChild(preview.firstChild);
        preview.appendChild(frag);
        preview.setAttribute("data-source", cacheKey);
        commentEl.setAttribute("data-wv-last-rebuild", String(Date.now()));
        commentEl.classList.add("wv-comment-preview");
        return true;
    }

    /** Find the open Zotero.Reader instance whose iframe document matches
     *  the given idoc. Lets `_processReaderSidebar` (which only knows about
     *  the doc) hand off to per-reader logic that needs the reader. */
    _findReaderForDoc(idoc) {
        if (!idoc) return null;
        for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
            try {
                const iwin = r._iframeWindow
                    || (r._iframe && r._iframe.contentWindow);
                if (iwin && iwin.document === idoc) return r;
            } catch(e) {}
        }
        return null;
    }

    /** Walk the sidebar's annotation rows and add a 🔗 icon to any row
     *  whose .wv-md-preview is overflowing — i.e. the line-clamp is
     *  hiding content the user might need to reach (most importantly,
     *  URLs that fall past line 3). Idempotent: tracks added icons via
     *  data-wv-icon-reason="overflow" and removes them when the row no
     *  longer overflows. CSS hides the icon when the row is `.selected`
     *  (selection lifts the clamp, content is fully visible inline).
     *
     *  Skip this only in icons-only mode (Mode 2), where every row gets
     *  an icon via _iconAddsValueBeyondInline anyway. We DO run when
     *  comment-markdown rendering is off — URL-only comments in that
     *  mode still get a preview (URL spans only), still get clamped,
     *  and still need the popup escape hatch when the URL gets clipped. */
    _updateSidebarOverflowIcons(idoc) {
        if (!this._getEnableReaderSidebar()) return;
        if (!this._getInlineLinks()) return;
        const reader = this._findReaderForDoc(idoc);
        if (!reader || !reader._item) return;

        for (const row of idoc.querySelectorAll(".annotation, .annotation-row")) {
            const cmt = row.querySelector(".comment.wv-comment-preview");
            if (!cmt) continue;
            const preview = cmt.querySelector(".wv-md-preview");
            if (!preview) continue;
            const overflows = preview.scrollHeight > preview.clientHeight + 1;
            const existing = row.querySelector("." + BTN_SIDEBAR_CLASS);

            if (overflows) {
                if (existing) continue;
                const key = this._findAnnotationKey(row, reader);
                if (!key) continue;
                const lib = this.libraryIDFromReader(reader);
                const comment = this.getModelComment(lib, key);
                if (!comment) continue;
                // Respect the markdown-icon pref — a markdown-only
                // comment that overflows must NOT get an icon when
                // the user has opted out of markdown decorations,
                // even though the popup would still show formatting.
                if (!this._iconWantedFor(comment)) {
                    if (existing
                        && existing.getAttribute("data-wv-icon-reason") === "overflow") {
                        existing.remove();
                    }
                    continue;
                }
                const target = row.querySelector(".head .end")
                            || row.querySelector("header .end")
                            || row.querySelector(".head .menu")
                            || row.querySelector("header .menu")
                            || row.querySelector(".head")
                            || row.querySelector("header")
                            || row;
                const btn = idoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
                btn.setAttribute("data-wv-icon-reason", "overflow");
                this._applyIconState(btn, comment);
                btn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(comment, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                const last = target.lastElementChild;
                if (last) target.insertBefore(btn, last);
                else target.appendChild(btn);
            } else if (existing
                && existing.getAttribute("data-wv-icon-reason") === "overflow") {
                // Row no longer overflows (maybe the comment was edited
                // shorter, or layout widened) — drop the overflow-only icon.
                existing.remove();
            }
        }
    }

    _processReaderSidebar(idoc) {
        // Re-entry guard: closing the reader's annotations sidebar tears
        // down many DOM nodes, our preview-panel writes (or strips) react
        // to that, and the resulting mutations can fire the iframe
        // observer multiple times before the close animation settles.
        // Without this guard, large sidebars can hang Zotero while this
        // function recurses through itself.
        if (this._processReaderSidebarBusy) return;
        this._processReaderSidebarBusy = true;
        try {
            this._processReaderSidebarBody(idoc);
        } finally {
            this._processReaderSidebarBusy = false;
        }
    }

    _processReaderSidebarBody(idoc) {
        if (!this._getEnableReaderSidebar()) {
            this._stripReaderSidebar(idoc);
            return;
        }
        // The preview-panel CSS (visibility swap rules + markdown classes)
        // must be in this iframe before _renderPreviewPanel adds the
        // .wv-comment-preview class — otherwise that class is meaningless
        // and the raw .content stays visible alongside .wv-md-preview.
        // _sidebarHandler also calls this on each row render, but that
        // pathway is skipped on rows whose icon adds no value, so we
        // can't rely on it as the sole entry point.
        try { this._ensureReaderOuterStyles(idoc); } catch(e) {}

        // After rendering previews, schedule an overflow-icons pass on the
        // next animation frame. Layout has settled by then, so we can
        // measure scrollHeight vs clientHeight on each .wv-md-preview and
        // add a 🔗 icon to rows where the line-clamp is hiding part of the
        // comment (e.g. a URL clipped after line 3). Icon disappears on
        // selection via CSS — see `.annotation.selected .wv-btn-sidebar`.
        const iwin = idoc.defaultView;
        if (iwin && iwin.requestAnimationFrame) {
            iwin.requestAnimationFrame(() => {
                try { this._updateSidebarOverflowIcons(idoc); }
                catch(e) { Zotero.debug(
                    "[Weavero] overflow icons: " + e); }
            });
        }
        this._dbg("[Weavero] _processReaderSidebar entered (active="
            + (idoc.activeElement
                ? idoc.activeElement.tagName + "." + (idoc.activeElement.className || "(no class)")
                : "null") + ")");
        // Sidebar comments: don't touch .content (Zotero's contenteditable
        // editor lives there). Render a sibling .wv-md-preview inside each
        // .comment so URLs and markdown render in a non-editable preview
        // shown when not editing. CSS swaps preview <-> raw .content based
        // on the wv-editing class set by the focusin/focusout handlers.
        const seen = new Set();
        let count = 0;
        for (const sel of [".annotation-row .comment", ".annotation .comment"]) {
            for (const cmt of idoc.querySelectorAll(sel)) {
                if (seen.has(cmt)) continue;
                seen.add(cmt);
                if (this._renderPreviewPanel(cmt)) count++;
            }
        }
        if (count) this._dbg("[Weavero] sidebar: rendered " + count + " previews");

        // Mirror right-pane behaviour: hide the popup-icon button injected by
        // _sidebarHandler when (a) we're in Mode 1 and (b) the comment isn't
        // overflowing, since the inline coloured URLs already cover everything.
        // We hide via display:none rather than remove() so Zotero's React
        // re-renders don't fight us.
        const inline = this._getInlineLinks();
        const active = idoc.activeElement;
        for (const row of idoc.querySelectorAll(".annotation-row, .annotation")) {
            const btn = row.querySelector("button.wv-btn");
            if (!btn) continue;
            const commentEl = row.querySelector(".comment .content")
                          || row.querySelector(".comment")
                          || row.querySelector(".body");
            // Skip the visibility recompute for the row currently being
            // edited — the overflow measurement flickers as the comment
            // text grows on each keystroke, which makes the icon blink.
            // Whatever state the icon was in before the user started
            // editing stays put until they click away.
            if (active && row.contains(active)) continue;

            // Format-only / URL+format always need the icon: the formatted
            // preview lives only inside the popup, never inline. Plain-URL
            // comments keep the original "show on overflow only" rule when
            // we're in inline mode.
            const hasFormat = btn.getAttribute("data-has-format") === "markdown";
            let shouldShow = !inline || hasFormat;
            if (inline && !hasFormat && commentEl) {
                try {
                    shouldShow =
                        commentEl.scrollHeight > commentEl.clientHeight + 1
                        || commentEl.scrollWidth > commentEl.clientWidth + 1;
                } catch(e) { shouldShow = false; }
            }
            btn.style.display = shouldShow ? "" : "none";
        }
    }

    // ---- Items tree (event delegation — no DOM injection, no blink) --------

    // ---- Items tree helpers -----------------------------------------------

    /** Return the character offset of (textNode, offsetInNode) relative to container. */
    _absoluteOffset(container, textNode, offsetInNode) {
        let total = 0;
        const walker = container.ownerDocument.createTreeWalker(
            container, 0x4 /* NodeFilter.SHOW_TEXT */, null);
        let node;
        while ((node = walker.nextNode())) {
            if (node === textNode) return total + offsetInNode;
            total += node.textContent.length;
        }
        return -1;
    }

    /**
     * If the pixel coords (x,y) land on a URL inside cell, return that URL.
     * Returns null if the click was in the ::after icon zone (past all text content).
     */
    _getURLAtClick(cell, x, y) {
        const doc = cell.ownerDocument;
        // If click is to the right of the full text content, it's on the ::after icon
        try {
            const textRange = doc.createRange();
            textRange.selectNodeContents(cell);
            const textRect = textRange.getBoundingClientRect();
            if (textRect.width > 0 && x > textRect.right + 2) return null;
        } catch(e) {}

        let charOffset = -1;
        try {
            if (doc.caretRangeFromPoint) {
                const range = doc.caretRangeFromPoint(x, y);
                if (range && range.startContainer.nodeType === 3)
                    charOffset = this._absoluteOffset(
                        cell, range.startContainer, range.startOffset);
            } else if (doc.caretPositionFromPoint) {
                const pos = doc.caretPositionFromPoint(x, y);
                if (pos && pos.offsetNode.nodeType === 3)
                    charOffset = this._absoluteOffset(
                        cell, pos.offsetNode, pos.offset);
            }
        } catch(e) { return null; }
        if (charOffset < 0) return null;

        const text = this.normalize(cell.textContent || "");
        const regex = new RegExp(this.URL_REGEX.source, "g");
        let m;
        while ((m = regex.exec(text)) !== null) {
            const url = m[0].replace(this.TRAILING_RE, "");
            if (charOffset >= m.index && charOffset <= m.index + m[0].length)
                return url;
        }
        return null;
    }

    /** Scan visible annotation-comment cells, stamp data-has-rich, and inject colored URL spans. */
    _markCellLinks() {
        if (!this._getEnableItemsList()) {
            this._stripItemsList();
            return;
        }
        try {
            const doc = Zotero.getMainWindow().document;
            const allCells = doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment");
            this._dbg("[Weavero] _markCellLinks: found " + allCells.length + " annotation cells");
            let stamped = 0;
            const wantInline = this._getInlineLinks();
            for (const cell of allCells) {
                // Already processed (in either mode) — .wv-text-wrap is set
                // by every full rebuild. Skip if the wrap matches the current
                // mode (inline ↔ has spans, icons-only ↔ no spans). On a
                // mismatch (e.g. virtualized cell rendered before the user
                // toggled), flatten and fall through to a fresh rebuild.
                if (cell.querySelector(".wv-text-wrap")) {
                    const cachedWrap = cell.querySelector(".wv-text-wrap");
                    const cachedMode = cachedWrap.getAttribute("data-render-mode") || "url";
                    const t = cell.getAttribute("data-comment-text")
                        || (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                    // wantMode key combines inline state with whether
                    // markdown rendering should fire for this comment.
                    // Mode key encodes which inline-mode sub-toggles affect
                    // THIS cell. URL-bearing text + URLs sub on → "url".
                    // Markdown text + Markdown sub on → "md". Both → "url+md".
                    // Neither (URLs/Md off OR text has none of either) → "plain".
                    let wantMode;
                    if (!wantInline) {
                        wantMode = "plain";
                    } else {
                        const norm_t = this.normalize(t);
                        const wantMd = this._getEnableCommentMarkdown()
                            && this.MD_REGEX.test(norm_t);
                        const wantUrl = this._getEnableInlineUrls()
                            && this.URL_REGEX.test(norm_t);
                        if (wantMd && wantUrl) wantMode = "url+md";
                        else if (wantMd) wantMode = "md";
                        else if (wantUrl) wantMode = "url";
                        else wantMode = "plain";
                    }
                    // Validate the wrap actually still has the right rendered
                    // structure. Zotero's items-tree React reconciliation
                    // has been observed to keep our .wv-text-wrap element
                    // (with its data-render-mode attribute) but strip the
                    // span children — leaving the wrap with just a text
                    // node, which renders the comment as plain unstyled
                    // text. The cache check therefore needs to verify that
                    // expected spans are still present, not just that the
                    // wrap is non-empty.
                    const sourceEmpty = !t;
                    const wrapEmpty = !cachedWrap.firstChild;
                    const sourceHasURL = !sourceEmpty
                        && this.URL_REGEX.test(this.normalize(t));
                    const expectURLSpan = sourceHasURL
                        && (wantMode === "url" || wantMode === "url+md");
                    const wrapMissingURLSpan = expectURLSpan
                        && !cachedWrap.querySelector(".wv-url-span");
                    const sourceHasMD = !sourceEmpty
                        && this._getEnableCommentMarkdown()
                        && this.MD_REGEX.test(this.normalize(t));
                    const expectMdSpan = sourceHasMD && wantMode === "url+md";
                    const wrapMissingMdSpan = expectMdSpan
                        && !cachedWrap.querySelector(".wv-md");
                    const cacheValid = cachedMode === wantMode
                        && !(wrapEmpty && !sourceEmpty)
                        && !wrapMissingURLSpan
                        && !wrapMissingMdSpan;
                    // Rebuild rate limit: when Zotero's React reconciliation
                    // strips our spans, we'd normally rebuild → it strips
                    // again → observer fires → rebuild → forever (Zotero
                    // hangs). Per-cell rebuild timestamp lets us bail out
                    // if we just rebuilt this cell. The retry-rebuild
                    // scheduled below in _applyInlineLinksPref picks up
                    // legitimate strips after the rate-limit window.
                    const lastRebuild = parseInt(
                        cell.getAttribute("data-wv-last-rebuild") || "0", 10);
                    const tooSoon = (Date.now() - lastRebuild) < 300;
                    if (cacheValid || (!cacheValid && tooSoon)) {
                        this._dbg("[Weavero] cache HIT mode=" + cachedMode
                            + " text=" + JSON.stringify(t.slice(0, 40))
                            + (cacheValid ? "" : " (rate-limited)"));
                        if (!cell.hasAttribute("data-has-rich")) {
                            if (this._commentHasIconableContent(t)) { cell.setAttribute("data-has-rich", "true"); stamped++; }
                        }
                        // data-icon-wanted gates the items-tree chain icon's
                        // visibility per the mode-aware _iconWantedFor (Inline
                        // = URL-only; Icon mode = per-content-type sub-toggles).
                        // ALWAYS update on cache HIT — the new icon sub-toggles
                        // can flip this without changing wantMode.
                        if (this._iconWantedFor(t)) {
                            cell.setAttribute("data-icon-wanted", "true");
                        } else {
                            cell.removeAttribute("data-icon-wanted");
                        }
                        // Stamp data-has-url so CSS can hide the icon
                        // for markdown-only cells when the pref is off.
                        if (this.URL_REGEX.test(this.normalize(t))) {
                            cell.setAttribute("data-has-url", "true");
                        } else {
                            cell.removeAttribute("data-has-url");
                        }
                        if (!cell.querySelector(".wv-tree-icon")) {
                            const ic = doc.createElement("span");
                            ic.className = "wv-tree-icon";
                            this._applyIconState(ic, t);
                            cell.appendChild(ic);
                        }
                        // Patch hover-tooltip title onto URL spans that
                        // were created by an earlier plugin version
                        // (pre-0.1.47) which didn't set the attribute.
                        // Without this, the cache-HIT path would leave
                        // old spans title-less indefinitely. URL source:
                        // data-href (markdown-link span) or textContent
                        // (plain-URL span).
                        for (const sp of cachedWrap.querySelectorAll(".wv-url-span")) {
                            if (!sp.hasAttribute("title")) {
                                const u = sp.getAttribute("data-href")
                                    || sp.textContent || "";
                                if (u) sp.setAttribute("title", u);
                            }
                        }
                        continue;
                    }
                    this._dbg("[Weavero] cache MISS cached=" + cachedMode
                        + " want=" + wantMode + " text=" + JSON.stringify(t.slice(0, 40)));
                    // Mode mismatch: flatten the cell so the rebuild path
                    // below sees raw text and produces output in the new mode.
                    const stashed = cell.getAttribute("data-comment-text");
                    const wrap = cell.querySelector(".wv-text-wrap");
                    const flatText = stashed
                        || (wrap ? (wrap.textContent || "") : "")
                        || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
                    cell.textContent = flatText;
                    cell.removeAttribute("data-has-rich");
                    cell.removeAttribute("data-icon-wanted");
                    cell.removeAttribute("data-comment-text");
                    cell.removeAttribute("data-truncated");
                    cell.removeAttribute("data-has-url");
                    // fall through to rebuild
                }

                // Source text: prefer the stashed data-comment-text (clean
                // raw text) over cell.textContent (which would include any
                // leftover icon glyphs and re-introduce them on rebuild).
                const text = (
                    cell.getAttribute("data-comment-text")
                    || (cell.textContent || "")
                          .replace(/[\s\u00A0]*🔗\s*$/, "")
                ).trim();
                if (!this._commentHasIconableContent(text)) {
                    cell.removeAttribute("data-has-rich");
                    cell.removeAttribute("data-icon-wanted");
                    cell.removeAttribute("data-has-url");
                    continue;
                }
                cell.setAttribute("data-has-rich", "true");
                if (this._iconWantedFor(text)) {
                    cell.setAttribute("data-icon-wanted", "true");
                } else {
                    cell.removeAttribute("data-icon-wanted");
                }
                if (this.URL_REGEX.test(this.normalize(text))) {
                    cell.setAttribute("data-has-url", "true");
                } else {
                    cell.removeAttribute("data-has-url");
                }
                stamped++;

                // Rebuild cell content. In inline mode we render URLs and
                // (if comment-markdown is on) markdown formatting directly.
                // Cells aren't editable, so we can format inline without
                // the preview-panel architecture used in the PDF reader.
                const norm = this.normalize(text);
                const frag = doc.createDocumentFragment();
                const inlineMode = this._getInlineLinks();
                const useMd = inlineMode && this._getEnableCommentMarkdown();
                const inlineUrls = inlineMode && this._getEnableInlineUrls();
                if (inlineMode) {
                    // Group order (when useMd):
                    //   1 bold, 2 italic, 3 strike, 4 code-double, 5 code-single,
                    //   6 link label, 7 link url, 8 bare URL.
                    const TOKEN = useMd ? new RegExp(
                        "\\*\\*([\\s\\S]+?)\\*\\*"
                        + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
                        + "|~~([\\s\\S]+?)~~"
                        + "|``([\\s\\S]+?)``"
                        + "|`([^`\\n]+?)`"
                        + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
                        + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
                        "g"
                    ) : new RegExp(this.URL_REGEX.source, "g");
                    const wrapMd = (cls, inner) => {
                        const span = doc.createElement("span");
                        span.className = "wv-md " + cls;
                        span.textContent = inner;
                        frag.appendChild(span);
                    };
                    let last = 0, m;
                    while ((m = TOKEN.exec(norm)) !== null) {
                        if (m.index > last)
                            frag.appendChild(doc.createTextNode(norm.slice(last, m.index)));
                        if (useMd && m[1] !== undefined) {
                            wrapMd("wv-md-bold", m[1]);
                        } else if (useMd && m[2] !== undefined) {
                            wrapMd("wv-md-italic", m[2]);
                        } else if (useMd && m[3] !== undefined) {
                            wrapMd("wv-md-strike", m[3]);
                        } else if (useMd && m[4] !== undefined) {
                            // ``code`` (double backtick).
                            wrapMd("wv-md-code", m[4]);
                        } else if (useMd && m[5] !== undefined) {
                            // `code` (single backtick).
                            wrapMd("wv-md-code", m[5]);
                        } else if (useMd && m[6] !== undefined && m[7] !== undefined) {
                            // Markdown link [label](url). With URLs sub-toggle
                            // off, drop the URL part and render just the label
                            // as plain text — the user can still see what was
                            // linked, just without the colour/click affordance.
                            if (inlineUrls) {
                                const url = m[7];
                                const cls = this._urlLinkClass(url);
                                const span = doc.createElement("span");
                                span.className = "wv-url-span " + cls;
                                span.title = url;
                                span.textContent = m[6];
                                span.setAttribute("data-href", url);
                                // Inline `color` references the same CSS
                                // variable as the class rule, so theme
                                // toggles propagate without re-rendering
                                // (and so app-link spans get the violet
                                // colour, which the old hard-coded
                                // "zotero ? orange : blue" branch missed).
                                span.style.setProperty("color",
                                    "var(--" + cls + ")", "important");
                                // Cursor is set via stylesheet so our
                                // :root.wv-context-menu-open suppress rule
                                // can override it to default while the
                                // right-click menu is open. Inline
                                // cursor:pointer !important would beat the
                                // stylesheet rule by specificity.
                                frag.appendChild(span);
                            } else {
                                frag.appendChild(doc.createTextNode(m[6]));
                            }
                        } else {
                            // Bare URL (group 8 in md regex, group 0 in URL-only regex).
                            const raw = useMd ? m[8] : m[0];
                            if (raw === undefined) { last = m.index + m[0].length; continue; }
                            if (inlineUrls) {
                                const url   = raw.replace(this.TRAILING_RE, "");
                                const trail = raw.slice(url.length);
                                const cls = this._urlLinkClass(url);
                                const span = doc.createElement("span");
                                span.className = "wv-url-span " + cls;
                                span.title = url;
                                span.textContent = url;
                                span.style.setProperty("color",
                                    "var(--" + cls + ")", "important");
                                // (See comment above re: stylesheet cursor.)
                                frag.appendChild(span);
                                if (trail) frag.appendChild(doc.createTextNode(trail));
                            } else {
                                // URLs sub-toggle off — emit raw URL as plain text.
                                frag.appendChild(doc.createTextNode(raw));
                            }
                        }
                        last = m.index + m[0].length;
                    }
                    if (last < norm.length)
                        frag.appendChild(doc.createTextNode(norm.slice(last)));
                } else {
                    // Icons-only mode: plain text only.
                    frag.appendChild(doc.createTextNode(norm));
                }

                // Wrap text/url-spans in .wv-text-wrap so flex ellipsis
                // clips them without touching the icon's slot.
                const wrap = doc.createElement("span");
                wrap.className = "wv-text-wrap";
                // Record the mode we just rendered in so the cache check
                // on the next pass can detect pref/text changes.
                let renderMode;
                if (!inlineMode) {
                    renderMode = "plain";
                } else {
                    const hasMd = useMd && this.MD_REGEX.test(norm);
                    const hasUrl = inlineUrls && this.URL_REGEX.test(norm);
                    if (hasMd && hasUrl) renderMode = "url+md";
                    else if (hasMd) renderMode = "md";
                    else if (hasUrl) renderMode = "url";
                    else renderMode = "plain";
                }
                wrap.setAttribute("data-render-mode", renderMode);
                wrap.appendChild(frag);

                // Real-DOM tree icon (display:none unless :root.wv-show-tree-icon)
                const treeIcon = doc.createElement("span");
                treeIcon.className = "wv-tree-icon";
                this._applyIconState(treeIcon, text);

                // Stash the clean comment text so the popup handler doesn't
                // pick up the trailing 🔗 from textContent.
                cell.setAttribute("data-comment-text", norm);

                while (cell.firstChild) cell.removeChild(cell.firstChild);
                cell.appendChild(wrap);
                cell.appendChild(treeIcon);

                // v0.0.128 diagnostic: log every rebuild so we can see if
                // _markCellLinks is firing and what it produces.
                cell.setAttribute("data-wv-last-rebuild", String(Date.now()));
                this._dbg("[Weavero] rebuild: useMd=" + useMd
                    + " mode=" + renderMode
                    + " input=" + JSON.stringify(text.slice(0, 60))
                    + " result=" + JSON.stringify(wrap.textContent.slice(0, 60))
                    + " childCount=" + wrap.children.length
                    + " urlSpans=" + cell.querySelectorAll(".wv-url-span").length);
            }
            this._dbg("[Weavero] _markCellLinks: stamped " + stamped + " cells with data-has-rich");

            // Note-annotation rows in the items tree don't use `.tight` and
            // store their text in `.cell.title > span.cell-text` instead of
            // `.cell.annotation-comment`. Color URLs there too. Regular
            // annotation rows don't have `.cell-text` inside their comment
            // cell, so this selector matches note rows only.
            const noteSpans = doc.querySelectorAll(".annotation-row .cell-text");
            let noteMarked = 0;
            for (const span of noteSpans) {
                if (this._markTextLinks(span, { mode: "tree" })) noteMarked++;
            }
            if (noteMarked) {
                this._dbg("[Weavero] _markCellLinks: marked "
                    + noteMarked + " note-annotation cells");
            }

            // After layout settles, mark cells whose text-wrap is overflowing
            // so the icon shows as a fallback even when the pref is off.
            const win = Zotero.getMainWindow();
            if (win && win.requestAnimationFrame) {
                win.requestAnimationFrame(() => {
                    try { this._updateTruncationFlags(); }
                    catch(e) { Zotero.debug("[Weavero] truncation flag error: " + e); }
                });
            }

            // Relations icon — anchored to the right edge of every
            // annotation row that has related items, regardless of
            // whether the comment has URLs or markdown. Runs AFTER the
            // cell-rebuild loop above (which wipes children) so the icon
            // survives. Idempotent: skips cells whose annotation already
            // has the icon attached.
            for (const cell of allCells) {
                this._decorateAnnotationRowRelations(cell);
            }
            // Cover the OTHER annotation row layouts: note / area /
            // ink / image / text annotations, and highlight/underline
            // annotations without a comment, all use a different
            // upstream layout — the row has no `.annotation-comment`
            // cell because the displayable text is in `.cell.title`.
            // These rows otherwise wouldn't get the related-items
            // indicator. Decorate the title cell instead.
            // (See itemTreeRow.js — `.annotation-comment` is added
            // only for `["highlight", "underline"].includes(type)`
            // AND when `annotationComment` is set.)
            const otherRows = doc.querySelectorAll(".annotation-row");
            for (const row of otherRows) {
                if (row.querySelector(":scope > .cell.annotation-comment")) {
                    continue; // handled in the loop above
                }
                const titleCell = row.querySelector(":scope > .cell.title");
                if (titleCell) {
                    this._decorateAnnotationRowRelations(titleCell);
                }
            }
        } catch(e) {
            Zotero.debug("[Weavero] _markCellLinks error: " + e);
        }
    }

    /** Resolve the Zotero.Item backing an items-tree row from its DOM
     *  node. Virtualized rows carry their index in the `id` attribute
     *  (set by upstream `virtualized-table.jsx` as
     *  `<treeID>-row-<index>`); we extract that index and look up the
     *  ref via `ZoteroPane.itemsView.getRow(index).ref`. Returns null
     *  if the row, the pane, or the view isn't available. */
    _getItemFromTreeRow(row) {
        if (!row || !row.id) return null;
        const m = /-row-(\d+)$/.exec(row.id);
        if (!m) return null;
        const index = parseInt(m[1], 10);
        if (!Number.isFinite(index)) return null;
        try {
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            const view = zp && zp.itemsView;
            if (!view || typeof view.getRow !== "function") return null;
            const r = view.getRow(index);
            return (r && r.ref) || null;
        } catch (e) { return null; }
    }

    /** Register the "Related" items-list column. Mirrors Zotero's
     *  built-in `numNotes` column shape: icon-only header, narrow
     *  static width, count text in the cell (empty when zero so the
     *  column reads as blank for items with no relations).
     *
     *  Uses Zotero's ItemTreeManager plugin API (introduced 2023; the
     *  registered dataKey is auto-prefixed with our plugin ID).
     *  Auto-removed when the plugin is uninstalled via `pluginID`,
     *  but we also call `unregisterColumn` in `destroy()` so a hot
     *  plugin reload during dev cleanly recycles the column. */
    _registerItemTreeColumns() {
        try {
            if (!Zotero.ItemTreeManager
                || typeof Zotero.ItemTreeManager.registerColumn !== "function") {
                this._dbg("[Weavero] ItemTreeManager unavailable; skip column register");
                return;
            }
            // Use Zotero's built-in `related.svg`. virtualized-table
            // expands `iconPath` into an `iconLabel` <span class="icon
            // icon-bg"> with backgroundImage:url(...), and the
            // presence of iconLabel triggers the `cell-icon` class
            // (zero column padding, fixed icon sizing). htmlLabel
            // alone does NOT trigger cell-icon, so the SVG would
            // render with normal padding and stretch oddly.
            // Shared cell renderer: blank when count is 0, count
            // text otherwise. Matches numNotes' display pattern at
            // itemTree.jsx:2299 (`treeRow.numNotes() || \"\"`).
            const renderCount = (_index, data, column, _isFirstColumn, doc) => {
                const span = doc.createElement("span");
                span.className = "cell " + (column.className || "");
                span.textContent = (data && data > 0) ? String(data) : "";
                return span;
            };
            // Both columns return numbers (0 when empty) from
            // dataProvider so _compareField skips the
            // empty-string-sorts-last shortcut and 0 collates
            // before 1, mirroring numNotes at itemTree.jsx:550-552.
            this._weaveroColumnKeys = this._weaveroColumnKeys || [];

            // Register Annotations BEFORE Related so when both are
            // visible the Annotations column appears first by
            // default. Zotero's column ordering follows registration
            // order (after the built-in columns).
            //
            // Annotations column: count of annotations on the item
            // itself when it's an attachment, or sum across all
            // attachments when it's a regular item. Annotations
            // themselves and notes get 0 — Zotero only shows
            // annotations under attachment containers.
            const annKey = Zotero.ItemTreeManager.registerColumn({
                dataKey: "weaveroAnnotations",
                label: "Annotations",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/annotate-highlight.svg",
                width: "30",
                minWidth: 26,
                staticWidth: true,
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                dataProvider: (item) => {
                    try {
                        if (!item) return 0;
                        if (item.isAttachment && item.isAttachment()) {
                            const ids = (item.getAnnotations && item.getAnnotations()) || [];
                            return ids.length;
                        }
                        if (item.isRegularItem && item.isRegularItem()) {
                            let total = 0;
                            const attIds = (item.getAttachments && item.getAttachments()) || [];
                            for (const id of attIds) {
                                const att = Zotero.Items.get(id);
                                if (!att || !att.isAttachment()) continue;
                                const annIds = (att.getAnnotations && att.getAnnotations()) || [];
                                total += annIds.length;
                            }
                            return total;
                        }
                        return 0;
                    } catch (e) { return 0; }
                },
                renderCell: renderCount,
            });
            if (annKey) this._weaveroColumnKeys.push(annKey);

            const relKey = Zotero.ItemTreeManager.registerColumn({
                dataKey: "weaveroRelated",
                label: "Related",
                pluginID: "weavero@mjthoraval",
                iconPath: "chrome://zotero/skin/16/universal/related.svg",
                width: "30",
                minWidth: 26,
                staticWidth: true,
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                dataProvider: (item) => {
                    try {
                        if (!item || !item.relatedItems) return 0;
                        return item.relatedItems.length;
                    } catch (e) { return 0; }
                },
                renderCell: renderCount,
            });
            if (relKey) this._weaveroColumnKeys.push(relKey);

            this._dbg("[Weavero] columns registered: "
                + this._weaveroColumnKeys.join(", "));
        } catch (e) {
            Zotero.debug("[Weavero] _registerItemTreeColumns err: " + e);
        }
    }

    _unregisterItemTreeColumns() {
        try {
            if (Zotero.ItemTreeManager
                && typeof Zotero.ItemTreeManager.unregisterColumn === "function"
                && this._weaveroColumnKeys) {
                for (const k of this._weaveroColumnKeys) {
                    try { Zotero.ItemTreeManager.unregisterColumn(k); }
                    catch (e) {}
                }
            }
            this._weaveroColumnKeys = [];
        } catch (e) {
            Zotero.debug("[Weavero] _unregisterItemTreeColumns err: " + e);
        }
    }

    /** Add (or refresh) a `.wv-tree-rel-icon` at the right edge of the
     *  annotation-comment cell when the underlying annotation has
     *  related items. Anchors to the cell as a flex sibling so the
     *  icon stays visible even when the comment text overflows with
     *  ellipsis. Click opens the same relations popup the reader
     *  sidebar uses. */
    _decorateAnnotationRowRelations(cell) {
        if (!cell) return;
        const row = cell.closest && cell.closest(".annotation-row");
        if (!row) return;
        const item = this._getItemFromTreeRow(row);
        if (!item || !item.isAnnotation || !item.isAnnotation()) {
            cell.removeAttribute("data-has-relations");
            const stale = cell.querySelector(":scope > .wv-tree-rel-icon");
            if (stale) stale.remove();
            return;
        }
        const related = this._getAnnotationRelatedItems(item);
        const existing = cell.querySelector(":scope > .wv-tree-rel-icon");
        if (!related.length) {
            cell.removeAttribute("data-has-relations");
            if (existing) existing.remove();
            return;
        }
        cell.setAttribute("data-has-relations", "1");
        if (existing) {
            // Refresh tooltip + count if it changed since last decorate.
            const newTitle = related.length + " Related";
            if (existing.title !== newTitle) existing.title = newTitle;
            return;
        }
        const doc = cell.ownerDocument;
        const icon = doc.createElement("span");
        icon.className = "wv-tree-rel-icon";
        icon.title = related.length + " Related";
        icon.appendChild(this._makeRelationsSvg(doc));
        // Capture the item's library + key — re-resolve at click time so
        // a relation added/removed since render is reflected.
        const lib = item.libraryID;
        const key = item.key;
        icon.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
                const ann = Zotero.Items.getByLibraryAndKey(lib, key);
                if (!ann) return;
                const sc = this._screenCoords(icon);
                this.openRelationsPopup(ann, {
                    anchorNode: icon,
                    ...(sc ? { anchorScreen: sc } : {}),
                });
            } catch (err) {
                Zotero.debug("[Weavero] tree-rel click err: " + err);
            }
        });
        // Row selection on mousedown / mouseup is suppressed by
        // _treeMouseDownHandler / _treeMouseUpHandler at the document
        // capture level — see those handlers for the rationale (must
        // run before upstream's row capture listener fires).
        cell.appendChild(icon);
    }

    /** Toggle data-truncated on cells whose text-wrap is overflowing. */
    _updateTruncationFlags() {
        const doc = Zotero.getMainWindow().document;
        const cells = doc.querySelectorAll(
            ".annotation-row.tight .cell.annotation-comment[data-has-rich]");
        let n = 0;
        for (const cell of cells) {
            const wrap = cell.querySelector(".wv-text-wrap");
            if (!wrap) continue;
            const isTrunc = wrap.scrollWidth > wrap.clientWidth + 1;
            if (isTrunc) {
                if (cell.getAttribute("data-truncated") !== "true") {
                    cell.setAttribute("data-truncated", "true");
                    n++;
                }
            } else if (cell.hasAttribute("data-truncated")) {
                cell.removeAttribute("data-truncated");
                n++;
            }
        }
        if (n) this._dbg("[Weavero] truncation flags updated: " + n + " cells");
    }

    _setupTreeClickDelegate() {
        const doc  = Zotero.getMainWindow().document;
        const win  = Zotero.getMainWindow();

        // Initial mark pass
        this._markCellLinks();

        // Watch for tree re-renders to re-mark cells (attribute only — lightweight)
        // Zotero 10 beta.4 (PR #5802 — Item tree refactor) renamed the
        // items-tree element from `item-tree-main-default` to `item-tree-main`.
        // Prefer the new ID; fall back to the old one for older builds.
        const tree = doc.getElementById("item-tree-main")
                  || doc.getElementById("item-tree-main-default");
        if (tree) {
            // Run _markCellLinks SYNCHRONOUSLY in the observer callback rather
            // than via setTimeout. MutationObserver callbacks are microtasks,
            // so they run before the next browser paint — meaning the user
            // never sees the raw markdown text flash when Zotero replaces a
            // cell's contents (e.g. on virtualized scroll, item swap, or item
            // selection). The previous setTimeout(..., 0) was a macrotask, and
            // the browser could paint between Zotero's DOM mutation and our
            // re-render. The cache check inside _markCellLinks (cachedMode ===
            // wantMode) prevents work amplification on our own DOM writes.
            this._treeMarkObserver = new win.MutationObserver(() => {
                try { this._markCellLinks(); }
                catch(e) { Zotero.debug("[Weavero] tree mark error: " + e); }
            });
            this._treeMarkObserver.observe(tree,
                { childList: true, subtree: true, characterData: true });
        } else {
            win.setTimeout(() => this._setupTreeClickDelegate(), 1000);
            return;
        }

        // JS tooltip widget for URL hover in items-tree. Zotero's
        // items-tree intercepts hover for its own row-summary tooltip,
        // suppressing the native browser title-attribute tooltip from
        // firing. We tried a XUL <tooltip> element but it doesn't
        // render even when openPopup is called manually — apparently
        // the XUL tooltip widget needs a specific document context
        // we're not providing. So this is a JS-rendered div styled to
        // look like the Mozilla/Zotero native tooltip, attached at
        // the documentElement with capture phase so items-tree's
        // event-handler interception can't disable it. Scoped to
        // items-tree spans only — other surfaces (right pane, reader
        // sidebar, popup) keep using native title-attribute tooltips
        // that work fine there.
        if (!this._urlTooltipState) {
            const state = { el: null, span: null, timer: 0 };
            const ensure = () => {
                if (state.el) return state.el;
                const t = doc.createElement("div");
                t.id = "wv-url-tooltip";
                t.className = "wv-url-tooltip";
                // Initial visibility only — the rest of the styling
                // lives in PLUGIN_CSS so the dark-mode variant via
                // :root.wv-ui-dark is picked up automatically.
                t.style.display = "none";
                doc.documentElement.appendChild(t);
                state.el = t;
                return t;
            };
            const hide = () => {
                if (state.timer) { win.clearTimeout(state.timer); state.timer = 0; }
                if (state.el) state.el.style.display = "none";
                state.span = null;
            };
            const onOver = (e) => {
                // Right-click menu open: suppress tooltip entirely. The
                // class is removed when the menu closes, so the next
                // mouseover after that re-enables this path normally.
                if (doc.documentElement.classList.contains("wv-context-menu-open")) {
                    this._dbg("[Weavero] tooltip onOver bailed: wv-context-menu-open still set");
                    hide();
                    return;
                }
                const sp = e.target && e.target.closest
                    && e.target.closest(".wv-url-span");
                if (!sp) { hide(); return; }
                // Scope to items-tree only — other surfaces already
                // get native browser tooltips from the title attribute.
                const itemsTree = doc.getElementById("item-tree-main")
                    || doc.getElementById("item-tree-main-default");
                if (!itemsTree || !itemsTree.contains(sp)) { hide(); return; }
                if (sp === state.span) return;
                state.span = sp;
                if (state.timer) win.clearTimeout(state.timer);
                const url = sp.getAttribute("title")
                    || sp.getAttribute("data-href")
                    || sp.textContent || "";
                if (!url) return;
                const x = e.clientX, y = e.clientY;
                state.timer = win.setTimeout(() => {
                    const t = ensure();
                    t.textContent = url;
                    const vw = win.innerWidth || 1920;
                    let left = x + 12;
                    if (left + t.offsetWidth + 16 > vw) {
                        left = Math.max(8, vw - t.offsetWidth - 16);
                    }
                    t.style.left = left + "px";
                    t.style.top = (y + 18) + "px";
                    t.style.display = "block";
                }, 500);
            };
            const onOut = (e) => {
                const sp = e.target && e.target.closest
                    && e.target.closest(".wv-url-span");
                if (sp && sp === state.span) hide();
            };
            const onDown = (e) => {
                if (e.target && e.target.closest
                    && e.target.closest(".wv-url-span")) hide();
            };
            const root = doc.documentElement;
            root.addEventListener("mouseover", onOver, true);
            root.addEventListener("mouseout", onOut, true);
            root.addEventListener("mousedown", onDown, true);
            state.root = root;
            state.handlers = { onOver, onOut, onDown };
            // Expose onOver so the right-click menu's first-mousemove
            // handler (in the menu block below) can synthesise a fresh
            // hover entry when the suppress class lifts — without this,
            // a cursor still over the link wouldn't see the tooltip
            // because mouseover only fires on entry, not on continued
            // movement inside the same element.
            state.onOver = onOver;
            this._urlTooltipState = state;
            Zotero.debug("[Weavero] URL tooltip widget ready");
        }

        // Right-click "Copy Link" menu for URL spans. Same pattern as
        // the tooltip widget — DOM-rendered menu attached to
        // documentElement, shown on contextmenu over a `.wv-url-span`
        // or `.wv-link` element. Suppresses Zotero's own row context
        // menu so the user gets just the link-relevant action.
        if (!this._urlMenuState) {
            const ms = { el: null, url: "" };
            const ensureMenu = () => {
                if (ms.el) return ms.el;
                const m = doc.createElement("div");
                m.id = "wv-url-menu";
                m.className = "wv-url-menu";
                const item = doc.createElement("div");
                item.className = "wv-url-menu-item";
                item.textContent = "Copy Link";
                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (ms.url) {
                        try {
                            Zotero.Utilities.Internal.copyTextToClipboard(ms.url);
                        } catch (err) {
                            Zotero.debug("[Weavero] copy link err: " + err);
                        }
                    }
                    // Use hideMenu (not just display:none) so the
                    // wv-context-menu-open class is cleared too.
                    hideMenu();
                });
                m.appendChild(item);
                doc.documentElement.appendChild(m);
                ms.el = m;
                return m;
            };
            const hideMenu = () => {
                const wasShown = !!(ms.el && ms.el.style.display !== "none");
                if (ms.el) ms.el.style.display = "none";
                // Reactivate hover (cursor + tooltip). The class is
                // normally removed on the first mousemove after onCtx
                // (see the one-shot mousemove handler), but we also
                // remove it here so a dismiss-without-moving cleans up.
                let hadClass = false;
                try {
                    hadClass = doc.documentElement.classList.contains("wv-context-menu-open");
                    doc.documentElement.classList.remove("wv-context-menu-open");
                } catch(err) {}
                if (ms.firstMoveHandler) {
                    try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                }
                this._dbg("[Weavero] hideMenu fired"
                    + " wasShown=" + wasShown
                    + " hadClass=" + hadClass);
            };
            const onCtx = (e) => {
                // Walk composedPath() so we match urlSpans even when the
                // event target is a Text node (no .closest), descends into
                // a shadow root (right-pane <annotation-row> in some Zotero
                // builds), or sits inside an iframe whose contentDocument
                // is included in the path. Falls back to .closest() on the
                // raw target when composedPath isn't available.
                let sp = null;
                const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
                for (const node of path) {
                    if (!node || !node.classList) continue;
                    if (node.classList.contains("wv-url-span")
                        || node.classList.contains("wv-link")) {
                        sp = node;
                        break;
                    }
                }
                if (!sp && e.target && e.target.closest) {
                    sp = e.target.closest(".wv-url-span")
                        || e.target.closest(".wv-link");
                }
                this._dbg("[Weavero] onCtx target="
                    + (e.target ? (e.target.nodeName || "?") + "/" + (e.target.nodeType || "?") : "null")
                    + " spMatched=" + !!sp
                    + " button=" + e.button);
                if (!sp) return;
                // Inside the in-document annotation popup, let the
                // browser's native context menu handle URL spans —
                // users expect "Copy Link Location" / "Open Link" /
                // etc., not our minimal Copy-Link menu. Our spans are
                // <a href> elements, so the native menu renders the
                // full link-specific options.
                if (sp.closest && sp.closest(".annotation-popup")) return;
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.stopPropagation();
                const url = sp.getAttribute("data-href")
                    || sp.getAttribute("href")
                    || sp.getAttribute("title")
                    || sp.textContent || "";
                if (!url) return;
                ms.url = url;
                // Kill any live URL tooltip BEFORE we show the menu so the
                // popup doesn't sit on top of (or just under) the menu.
                // Also flip the suppress class so the cursor over the link
                // turns from pointer back to default and a stray mouseover
                // can't re-show the tooltip while the menu is up.
                try {
                    const ts = this._urlTooltipState;
                    if (ts) {
                        if (ts.timer) {
                            try { win.clearTimeout(ts.timer); } catch(err) {}
                        }
                        if (ts.el) ts.el.style.display = "none";
                        ts.span = null;
                        ts.timer = 0;
                    }
                } catch(err) {}
                doc.documentElement.classList.add("wv-context-menu-open");
                // One-shot mousemove: lift the suppression as soon as
                // the user moves the mouse, even if the menu is still
                // open. Mirrors the user's spec: "reactivate the hover
                // behaviour after moving the mouse again". The handler
                // self-unregisters on first fire; hideMenu also tears
                // it down so a dismiss-without-moving doesn't leak it.
                if (ms.firstMoveHandler) {
                    try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                }
                const onFirstMove = (mEvt) => {
                    doc.documentElement.classList.remove("wv-context-menu-open");
                    try { doc.removeEventListener("mousemove", onFirstMove, true); } catch(err) {}
                    ms.firstMoveHandler = null;
                    // Synthesise a hover entry so the tooltip path runs
                    // for a cursor that's still over a link.
                    try {
                        const ts = this._urlTooltipState;
                        if (ts && typeof ts.onOver === "function") ts.onOver(mEvt);
                    } catch(err) {}
                };
                ms.firstMoveHandler = onFirstMove;
                doc.addEventListener("mousemove", onFirstMove, true);
                const m = ensureMenu();
                // Position at cursor; clamp to viewport so the menu
                // doesn't overflow the right / bottom edge.
                //
                // The menu has `position: fixed` (see .wv-url-menu
                // CSS), so left/top are in main-chrome-window viewport
                // coordinates. For events that cross iframe / chrome
                // <browser> boundaries, `e.clientX/Y` semantics vary
                // (Mozilla retargets some, leaves others alone). The
                // robust primitive is screen coordinates:
                //   * e.screenX/Y      — cursor in OS screen px
                //   * win.mozInnerScreenX/Y — chrome content area's
                //                        top-left in OS screen px
                // Their difference is always main-window-viewport.
                let cx, cy;
                if (typeof e.screenX === "number"
                        && typeof win.mozInnerScreenX === "number") {
                    cx = e.screenX - win.mozInnerScreenX;
                    cy = e.screenY - win.mozInnerScreenY;
                } else {
                    // Fallback if mozInnerScreenX isn't exposed —
                    // accept the popup may land in the wrong place
                    // for cross-frame clicks rather than crash.
                    cx = e.clientX;
                    cy = e.clientY;
                }
                const vw = win.innerWidth || 1920;
                const vh = win.innerHeight || 1080;
                m.style.display = "block";
                let left = cx;
                let top  = cy;
                if (left + m.offsetWidth + 8 > vw) {
                    left = Math.max(8, vw - m.offsetWidth - 8);
                }
                if (top + m.offsetHeight + 8 > vh) {
                    top = Math.max(8, vh - m.offsetHeight - 8);
                }
                m.style.left = left + "px";
                m.style.top  = top + "px";
                // Refresh the pointerdown targets — iframes (PDF reader
                // tabs, etc.) may have been added since init.
                if (ms.collectPointerTargets) {
                    const want = ms.collectPointerTargets();
                    const have = new Set(ms.pointerTargets || []);
                    for (const t of want) {
                        if (have.has(t)) continue;
                        try { t.addEventListener("pointerdown", ms.handlers.onPointerDown, { capture: true }); } catch(err) {}
                    }
                    ms.pointerTargets = want;
                }
            };
            const onPointerDown = (e) => {
                // Don't dismiss when the press lands inside our own menu —
                // that would cancel the menu-item click before it fires.
                if (ms.el && ms.el.contains(e.target)) return;
                hideMenu();
            };
            // Click stays as a fallback for keyboard-synthesised activations
            // (Space / Enter on a focused element fire `click` but not
            // `pointerdown`).
            const onAnyClick = () => hideMenu();
            const onKey = (e) => { if (e.key === "Escape") hideMenu(); };
            const onWheel = () => hideMenu();
            const onWinBlur = () => hideMenu();
            const root = doc.documentElement;
            root.addEventListener("contextmenu", onCtx, true);
            root.addEventListener("click", onAnyClick, true);
            root.addEventListener("keydown", onKey, true);
            root.addEventListener("wheel", onWheel, { capture: true, passive: true });
            // pointerdown: matches Zotero reader's overlay-popup idiom.
            // Attach to the main document AND every iframe's contentDocument,
            // because a pointerdown inside an iframe does not bubble to the
            // parent document even during capture phase. Iframes are mostly
            // the PDF reader frame in this app, but the same logic applies
            // anywhere — we re-discover the live iframe list on every menu
            // open, since iframes are added/removed as the user navigates.
            const collectPointerTargets = () => {
                const targets = [doc];
                try {
                    for (const f of doc.querySelectorAll("iframe")) {
                        const fd = f.contentDocument;
                        if (fd) targets.push(fd);
                    }
                } catch (e) { /* cross-origin frames throw; skip them */ }
                return targets;
            };
            ms.pointerTargets = collectPointerTargets();
            for (const t of ms.pointerTargets) {
                try { t.addEventListener("pointerdown", onPointerDown, { capture: true }); } catch(e) {}
            }
            try { win.addEventListener("blur", onWinBlur); } catch(e) {}
            ms.root = root;
            ms.win = win;
            ms.handlers = { onCtx, onAnyClick, onKey, onWheel, onPointerDown, onWinBlur };
            ms.collectPointerTargets = collectPointerTargets;
            this._urlMenuState = ms;
        }

        // Click handler: only fires if mousedown didn't already handle it
        // (e.g. keyboard-synthesised click). Otherwise just suppress the click.
        this._treeClickHandler = (e) => {
            // Defensive: `click` should not fire for non-left-clicks per the
            // DOM spec, but Mozilla can synthesize one in some platform
            // paths (notably right-click on a focused element that looks
            // link-like — pointer cursor + tooltip + data-href). If that
            // happens, bail before any launchURL path can run, otherwise
            // the right-click would open the link instead of opening our
            // context menu.
            if (e.button !== 0) {
                this._dbg("[Weavero] tree click suppressed: button=" + e.button);
                return;
            }
            const recentlyHandled = (Date.now() - this._lastHandledTime) < 600;
            if (recentlyHandled) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
                this._dbg("[Weavero] click suppressed (handled by mousedown)");
                return;
            }
            const urlSpan = e.target.closest && e.target.closest(".wv-url-span");
            if (urlSpan) {
                const cell = urlSpan.closest(".annotation-row.tight .cell.annotation-comment");
                if (!cell) return;
                e.stopPropagation(); e.preventDefault();
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) return;
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
                return;
            }
            const treeIcon = e.target.closest && e.target.closest(".wv-tree-icon");
            if (!treeIcon) return;
            const cell = treeIcon.closest(
                ".annotation-row.tight .cell.annotation-comment");
            if (!cell) return;
            e.stopPropagation(); e.preventDefault();
            const text = cell.getAttribute("data-comment-text")
                || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
            this.openCommentPopup(text, { anchorNode: treeIcon });
        };
        // Fire the action from mousedown, before React's row-selection logic
        // can re-render the cell and destroy the span before mouseup fires.
        // We block subsequent click/mouseup with a short-lived flag so the
        // action doesn't double-fire.
        this._lastHandledTime = 0;
        this._treeMouseDownHandler = (e) => {
            const tgt = e.target;
            const tgtDesc = tgt
                ? (tgt.nodeName + "." + (tgt.className || "(no class)"))
                : "null";
            this._dbg("[Weavero] mousedown received: target=" + tgtDesc
                + " button=" + e.button + " phase=" + e.eventPhase);
            if (e.button !== 0) return;
            if (!tgt || !tgt.closest) return;

            // .wv-tree-rel-icon owns its own click handler that opens
            // the relations popup directly. Suppress the row's
            // capture-phase _captureMouseUpDown (virtualized-table.jsx)
            // so the FIRST click goes straight to the popup instead of
            // selecting the row first. Document-level capture runs
            // before the row's, so stopPropagation here cuts the chain
            // cleanly.
            if (tgt.closest(".wv-tree-rel-icon")) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                return;
            }

            // Click on .wv-md-preview inside an in-document annotation
            // popup → enter edit mode. The popup is implemented as a
            // XUL panel in the main window (not in the reader iframe),
            // so the iframe-side sidebarPreviewClick handler never sees
            // these events — we have to handle them here, in the main
            // window's mousedown handler. Skip if the click was on a
            // URL span (the URL handler will fire instead).
            if (!tgt.closest(".wv-url-span")) {
                const previewInPopup = tgt.closest(".wv-md-preview");
                const popupAncestor = previewInPopup
                    && previewInPopup.closest(".annotation-popup");
                if (previewInPopup && popupAncestor) {
                    const cmt = previewInPopup.closest(".comment");
                    const content = cmt && cmt.querySelector(".content");
                    if (cmt && content) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                        cmt.classList.add("wv-editing");
                        // Defer focus so the wv-editing class' CSS has
                        // applied (un-hides .content); calling focus()
                        // on a still-display:none element silently fails.
                        const cwin = doc.defaultView || Zotero.getMainWindow();
                        const raf = (cwin && cwin.requestAnimationFrame)
                            ? cwin.requestAnimationFrame.bind(cwin)
                            : (cb) => setTimeout(cb, 0);
                        raf(() => {
                            try {
                                content.focus();
                                const sel = cwin && cwin.getSelection && cwin.getSelection();
                                if (sel) {
                                    const range = doc.createRange();
                                    range.selectNodeContents(content);
                                    range.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                }
                            } catch(err) {}
                        });
                        this._dbg("[Weavero] mainPreviewClick: entered edit mode for popup");
                        return;
                    }
                }
            }

            // Use composedPath() so we can detect spans inside open shadow roots
            // (right-pane <annotation-row> uses one in some Zotero versions).
            const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
            let urlSpan = null, treeIcon = null;
            for (const node of path) {
                if (!node || !node.classList) continue;
                if (!urlSpan && node.classList.contains("wv-url-span")) urlSpan = node;
                if (!treeIcon && node.classList.contains("wv-tree-icon")) treeIcon = node;
                if (urlSpan && treeIcon) break;
            }
            if (!urlSpan && tgt.closest) urlSpan = tgt.closest(".wv-url-span");
            if (!treeIcon && tgt.closest) treeIcon = tgt.closest(".wv-tree-icon");
            this._dbg("[Weavero] mousedown lookup: urlSpan="
                + !!urlSpan + " treeIcon=" + !!treeIcon);

            // Only URL-span and visible tree-icon clicks are handled.
            // Plain text in the cell: ignored, row selection proceeds.
            if (!urlSpan && !treeIcon) return;

            this._dbg("[Weavero] mousedown: blocking + firing action urlSpan="
                + !!urlSpan + " treeIcon=" + !!treeIcon);
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            e.preventDefault();
            this._lastHandledTime = Date.now();

            if (urlSpan) {
                // Markdown links [label](url) put the destination in
                // data-href; the visible textContent is the label.
                const url = (urlSpan.getAttribute("data-href")
                          || urlSpan.textContent || "").trim();
                if (!url) {
                    this._dbg("[Weavero] tree url click: empty url, ignored");
                    return;
                }
                if (url.startsWith("zotero://")) this.handleZoteroURI(url);
                else this._launchURL(url);
                return;
            }
            // Tree icon click → open popup with full comment (sans icon glyph).
            // Use a lenient lookup: prefer .annotation-row.tight, fall back
            // to any .cell.annotation-comment ancestor (some Zotero builds
            // omit the .tight modifier in newer DOM layouts).
            let cell = treeIcon.closest(
                ".annotation-row.tight .cell.annotation-comment")
                || treeIcon.closest(".cell.annotation-comment")
                || treeIcon.parentElement;
            if (!cell) {
                this._dbg("[Weavero] tree icon click: no cell ancestor for icon");
                return;
            }
            const text = cell.getAttribute("data-comment-text")
                || (cell.textContent || "").replace(/[\s\u00A0]*🔗\s*$/, "").trim();
            if (!text) {
                this._dbg("[Weavero] tree icon click: empty text, ignored");
                return;
            }
            this._dbg("[Weavero] tree icon click: opening popup ("
                + text.length + " chars: " + text.slice(0, 40).replace(/\n/g, " ") + ")");
            // Capture the icon's viewport rect SYNCHRONOUSLY here — Zotero
            // re-renders the items tree on row selection, which detaches
            // the original icon and gives it a 0,0,0,0 rect by the time a
            // deferred callback fires.
            let capturedRect = null;
            try {
                const r = treeIcon.getBoundingClientRect();
                capturedRect = {
                    left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                    width: r.width, height: r.height
                };
            } catch(rerr) {}
            // Defer one tick: Zotero's tree row click handler also fires on
            // mousedown, and a synchronous popup open racing against it
            // can be dismissed by Zotero's own focus/blur flow.
            const win = Zotero.getMainWindow();
            const setTimeoutFn = win && win.setTimeout || setTimeout;
            setTimeoutFn(() => {
                try {
                    this.openCommentPopup(text, {
                        anchorNode: treeIcon,
                        anchorRect: capturedRect
                    });
                }
                catch(err) { Zotero.debug("[Weavero] openCommentPopup err: " + err); }
            }, 0);
        };
        doc.addEventListener("mousedown", this._treeMouseDownHandler, true);

        // Also block the corresponding click so it can't re-trigger or focus
        this._treeMouseUpHandler = (e) => {
            // Mirror the mousedown short-circuit for .wv-tree-rel-icon
            // — _handleMouseUp finalises selection on left-click, so
            // we have to suppress the mouseup leg too.
            const tgt = e.target;
            if (e.button === 0 && tgt && tgt.closest
                    && tgt.closest(".wv-tree-rel-icon")) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                return;
            }
            if (Date.now() - this._lastHandledTime < 600) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        doc.addEventListener("mouseup", this._treeMouseUpHandler, true);

        doc.addEventListener("click", this._treeClickHandler, true);

        // Window resize → re-evaluate truncation flags so the fallback icon
        // toggles when the user widens/narrows the items column.
        this._resizeHandler = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = win.setTimeout(() => {
                try { this._updateTruncationFlags(); }
                catch(e) { Zotero.debug("[Weavero] resize truncation error: " + e); }
            }, 120);
        };
        win.addEventListener("resize", this._resizeHandler);

        Zotero.debug("[Weavero] tree mousedown/click delegates attached (document capture)");
    }

    _teardownTreeClickDelegate() {
        try {
            const doc = Zotero.getMainWindow().document;
            const win = Zotero.getMainWindow();
            doc.removeEventListener("click", this._treeClickHandler, true);
            doc.removeEventListener("mousedown", this._treeMouseDownHandler, true);
            doc.removeEventListener("mouseup", this._treeMouseUpHandler, true);
            if (this._resizeHandler) win.removeEventListener("resize", this._resizeHandler);
            clearTimeout(this._resizeTimer);
            if (this._treeMarkObserver) this._treeMarkObserver.disconnect();
            clearTimeout(this._treeMarkTimer);
        } catch(e) {}
        this._treeClickHandler     = null;
        this._treeMouseDownHandler = null;
        this._treeMouseUpHandler   = null;
        this._resizeHandler        = null;
        this._resizeTimer          = null;
        this._treeMarkObserver     = null;
        this._treeMarkTimer        = null;
    }

    /** Decorate the iframe-rendered annotation context menu so our
     *  contributed entries ("Open comment popup", "Add related item…")
     *  show the plugin icon next to their label.
     *
     *  In Zotero 10 every annotation context menu is `internal: true`
     *  (see upstream reader/src/common/context-menu.js), which means
     *  it's rendered inside the reader iframe by React
     *  (reader/src/common/components/context-menu.js — `BasicRow`
     *  emits `<button class="row basic">…label…</button>`), not as
     *  chrome XUL. The chrome `_openContextMenu` is never called for
     *  this menu, so chrome-side decoration is impossible.
     *
     *  Instead we watch the iframe DOM for `.context-menu` to mount
     *  (handled in `_setupReaderObserver`'s observer) and from this
     *  helper insert a `<div class="icon"><img src=icon-16.png/></div>`
     *  as the first child of every matching `.row.basic`. Wrapping in
     *  `<div class="icon">` reuses the existing upstream
     *  `.context-menu .icon` rules so spacing matches built-in items
     *  that already use icons (eraser/highlight/etc.) — only the
     *  `<img>` itself needs sizing CSS, which `_injectReaderStyles`
     *  adds to the iframe. */
    decorateContextMenu(idoc) {
        if (!idoc || !idoc.querySelectorAll) return 0;
        // Per-prefix icon factory:
        //   "Add Related" → inline <svg> chain via _makeRelationsSvg
        //                    (uses fill="currentColor" — inherits the
        //                     menu's theme text color, so it reads on
        //                     both light AND dark menu backgrounds).
        const buildIconNode = (text) => {
            if (text.startsWith("Add Related")) {
                return this._makeRelationsSvg(idoc);
            }
            return null;
        };
        const buttons = idoc.querySelectorAll(".context-menu .row.basic");
        let touched = 0;
        for (const btn of buttons) {
            if (btn.dataset && btn.dataset.wvDecorated) continue;
            const text = (btn.textContent || "").trim();
            let match = false;
            for (const prefix of MENU_LABEL_PREFIXES) {
                if (text.startsWith(prefix)) { match = true; break; }
            }
            if (!match) continue;
            const iconNode = buildIconNode(text);
            if (!iconNode) continue;
            try {
                const wrap = idoc.createElement("div");
                wrap.className = "icon";
                wrap.appendChild(iconNode);
                btn.insertBefore(wrap, btn.firstChild);
                btn.dataset.wvDecorated = "1";
                touched++;
            } catch(e) {
                Zotero.debug("[Weavero] decorateContextMenu insert err: " + e);
            }
        }
        if (buttons.length) {
            this._dbg("[Weavero] decorateContextMenu: items="
                + buttons.length + " touched=" + touched);
        }
        return touched;
    }

    // ---- Right pane annotation list ---------------------------------------

    /** Try to find a child via querySelector, falling back to shadowRoot. */
    _qsDeep(host, sel) {
        let el = host.querySelector?.(sel);
        if (el) return el;
        if (host.shadowRoot) {
            el = host.shadowRoot.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    _injectPaneRowIcon(row) {
        // Wire the type-aware right-click menu for this annotation-row
        // before the right-pane pref check below. The menu provides
        // basic navigation (Show in Library, Open in Reader, Copy
        // Item Link, etc.) and shouldn't depend on whether the user
        // has Weavero's right-pane rendering enabled — it's a generic
        // affordance the user expects on any annotation row.
        this._wireAnnotationRowContextMenu(row);

        // Pref check at the top because the pane mutation observer calls
        // this directly for each affected row (the sync-render path that
        // avoids the right-pane FOUC). Without this check, toggling the
        // right-pane pref off feeds an infinite cycle: strip → observer
        // fires → sync render re-applies our markup → 80 ms safety-net
        // scan strips again → ... Same shape as the items-list freeze
        // bug fixed in v0.0.149.
        if (!this._getEnableRightPane()) return;
        // Relations icon is independent of comment content (an
        // annotation with no comment can still have relations).
        // Run this BEFORE the comment-iconable bailout below, which
        // would otherwise short-circuit the relations decoration on
        // plain-text-only comments. Bug surfaced in v0.5.1: a Test
        // comment annotation kept its relation in data but the
        // chain icon never appeared on the right-pane card because
        // _commentHasIconableContent returned false and we returned.
        try { this._decoratePaneRowRelations(row); }
        catch (e) {
            Zotero.debug("[Weavero] _decoratePaneRowRelations err: " + e.message);
        }
        const commentEl = this._qsDeep(row, ".body .comment")
                       || this._qsDeep(row, ".comment");
        if (!commentEl) {
            this._dbg("[Weavero] pane row: no commentEl found"
                + " (hasShadow=" + !!row.shadowRoot + ")");
            return;
        }
        // textContent of a rendered comment is the STRIPPED form (markers
        // gone, e.g. "strike only" rather than "~~strike only~~"), so we
        // can't rely on it alone to decide whether the comment has rich
        // content. Three states to handle:
        //   1. Spans still present  → trust data-wv-raw, fall back to text.
        //   2. Spans stripped, textContent matches data-wv-rendered → spans
        //      got reaped by Zotero's React reconciliation; data-wv-raw is
        //      still the source of truth, so we use it. Without this case,
        //      _commentHasIconableContent would see only the markerless inner
        //      text and bail with "no rich content", leaving the comment
        //      stuck as raw markdown forever.
        //   3. Spans stripped AND textContent differs from data-wv-rendered
        //      → user edited the comment; live textContent is fresh.
        const ourMarkers = commentEl.querySelector(".wv-md, .wv-url-span");
        const cachedRaw = commentEl.getAttribute("data-wv-raw");
        const cachedRendered = commentEl.getAttribute("data-wv-rendered");
        const liveText = commentEl.textContent || "";
        let plainText;
        if (ourMarkers) {
            plainText = cachedRaw || liveText;
        } else if (cachedRaw && cachedRendered !== null && liveText === cachedRendered) {
            plainText = cachedRaw;
        } else {
            plainText = liveText;
        }
        // Bail only if there's nothing to render — neither URL nor markdown
        // formatting. Use _commentHasIconableContent (NOT _iconWantedFor) so
        // that the user-facing icon prefs control only the icon, not the
        // inline rendering. Items-tree's _markCellLinks gates the same way;
        // until v0.1.77 the right pane gated on the icon pref by accident,
        // which made markdown-only comments stop rendering when the user
        // turned the icon off.
        if (!this._commentHasIconableContent(plainText)) {
            this._dbg("[Weavero] pane row: no rich content in commentEl");
            return;
        }
        // If commentEl is inside a shadow root, main-doc styles don't reach it.
        // Inject a small stylesheet into that shadow root once.
        const root = commentEl.getRootNode();
        if (root !== row.ownerDocument && root.host && !root.getElementById?.("wv-shadow-style")) {
            try {
                const s = row.ownerDocument.createElement("style");
                s.id = "wv-shadow-style";
                s.textContent = ":root { --wv-link-http: #1a73e8;"
                    + " --wv-link-zotero: #8b4513; --wv-link-app: #9333ea; }"
                    + ":root.wv-ui-dark { --wv-link-http: #8ab4f8;"
                    + " --wv-link-zotero: #cd853f; --wv-link-app: #c084fc; }"
                    + ".wv-url-span { cursor: pointer !important; }"
                    + ".wv-url-span.wv-link-http   { color: var(--wv-link-http)   !important; }"
                    + ".wv-url-span.wv-link-zotero { color: var(--wv-link-zotero) !important; }"
                    + ".wv-url-span.wv-link-app    { color: var(--wv-link-app)    !important; }"
                    // Preview-panel rules: show the formatted preview
                    // when not editing, swap to raw .content on focus.
                    + ".wv-md-preview { font: inherit; color: inherit;"
                    + "  line-height: inherit; white-space: pre-wrap;"
                    + "  word-wrap: break-word; overflow-wrap: break-word; }"
                    + ".comment.wv-comment-preview .content { display: none; }"
                    + ".comment.wv-comment-preview .wv-md-preview { display: block; }"
                    + ".comment.wv-comment-preview.wv-editing .content { display: block; }"
                    + ".comment.wv-comment-preview.wv-editing .wv-md-preview { display: none; }"
                    + ".wv-md-bold { font-weight: 700; }"
                    + ".wv-md-italic { font-style: italic; }"
                    + ".wv-md-strike { text-decoration: line-through; opacity: 0.85; }"
                    + ".wv-md-code { font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace;"
                    + "  font-size: 92%; padding: 0 3px; border-radius: 3px;"
                    + "  background: rgba(127,127,127,0.15); }";
                root.appendChild(s);
            } catch(e) { Zotero.debug("[Weavero] shadow style inject failed: " + e); }
        }

        // Zotero 10's right-pane comment is a non-editable <div class="comment">
        // (verified via the v0.0.129 pane row diag). Since nothing inside it
        // is contenteditable, we can render markdown + URL spans directly into
        // the element — same approach the items-list cell uses. The earlier
        // architecture comment claiming this would break editing was based on
        // a previous Zotero version where the .comment was contenteditable.
        // Defensive: if a future Zotero version makes this editable, fall
        // back to URL-only marking which has edit-mode protections.
        let fresh;
        if (commentEl.isContentEditable) {
            fresh = this._markTextLinks(commentEl);
        } else {
            fresh = this._renderPaneCommentInline(commentEl);
        }
        this._dbg("[Weavero] pane row: "
            + (fresh ? "MARKED FRESH" : "already marked / skipped")
            + " (commentEl in " + (commentEl.getRootNode() === row.ownerDocument
                ? "light DOM" : "shadow DOM") + ")");

        // Decide whether the popup-icon button adds value.
        //   - Mode 2 (icons-only) and unrendered-markdown cases: the helper
        //     returns true; show the icon.
        //   - Otherwise: show only if the comment is overflowing, i.e. some
        //     URLs / formatted text may be clipped by Zotero's layout.
        let shouldShowIcon = this._iconAddsValueBeyondInline(plainText);
        if (!shouldShowIcon) {
            try {
                shouldShowIcon =
                    commentEl.scrollHeight > commentEl.clientHeight + 1
                    || commentEl.scrollWidth > commentEl.clientWidth + 1;
            } catch(e) { shouldShowIcon = false; }
        }
        // Existing comment-icon button (if any). The relations icon
        // (`.wv-btn-relations` below) is a separate button that LIVES
        // alongside this one, so we exclude it from the selector.
        let existingBtn = this._qsDeep(row,
            "." + BTN_PANE_CLASS + ":not(.wv-btn-relations)");
        const actionEl = this._qsDeep(row, ".head .action")
                      || this._qsDeep(row, ".action");

        if (!shouldShowIcon) {
            // Mode/overflow no longer warrants the icon — clean up if
            // it was added on a previous pass. Don't return: the
            // relations icon may still be wanted on this row.
            existingBtn?.remove();
            existingBtn = null;
        } else if (!existingBtn && actionEl) {
            const doc = row.ownerDocument;
            const btn = doc.createElementNS(
                "http://www.w3.org/1999/xhtml", "button");
            btn.className = BTN_CLASS + " " + BTN_PANE_CLASS;
            this._applyIconState(btn, plainText);
            btn.addEventListener("click", e => {
                e.stopPropagation(); e.preventDefault();
                this.openCommentPopup(plainText, { anchorNode: btn });
            });
            // Order policy: comment LEFT, relations RIGHT. If a
            // relations button is already present in `.action`,
            // insert comment BEFORE it. Otherwise append to the end.
            const existingRel = this._qsDeep(row, ".wv-btn-relations");
            if (existingRel && existingRel.parentNode === actionEl) {
                actionEl.insertBefore(btn, existingRel);
            } else {
                actionEl.appendChild(btn);
            }
            existingBtn = btn;
        }

    }

    /** Add (or refresh / remove) the right-pane chain icon for a
     *  single `<annotation-row>` based on the annotation's current
     *  `relatedItems`. Independent of comment content — pulled out
     *  of `_injectPaneRowIcon` so plain-text-only comments still
     *  surface relations. Order policy: comment icon LEFT, relations
     *  RIGHT. Inserts the relations button after any existing
     *  comment button; falls back to appendChild when no comment
     *  button is present yet. */
    _decoratePaneRowRelations(row) {
        const ann = row && row.annotation;
        if (!ann) return;
        const actionEl = this._qsDeep(row, ".head .action")
                      || this._qsDeep(row, ".action");
        const wantsRel = this._getAnnotationRelatedItems(ann).length > 0;
        const existingRel = this._qsDeep(row, ".wv-btn-relations");
        if (!wantsRel) {
            existingRel?.remove();
            return;
        }
        if (existingRel) {
            const newTitle = this._getAnnotationRelatedItems(ann).length + " Related";
            if (existingRel.title !== newTitle) existingRel.title = newTitle;
            return;
        }
        if (!actionEl) return;
        const doc = row.ownerDocument;
        const relBtn = doc.createElementNS(
            "http://www.w3.org/1999/xhtml", "button");
        relBtn.className = BTN_CLASS + " " + BTN_PANE_CLASS
            + " wv-btn-relations";
        const count = this._getAnnotationRelatedItems(ann).length;
        relBtn.title = count + " Related";
        relBtn.appendChild(this._makeRelationsSvg(doc));
        relBtn.addEventListener("click", e => {
            e.stopPropagation(); e.preventDefault();
            this.openRelationsPopup(ann, { anchorNode: relBtn });
        });
        const commentBtnEl = actionEl.querySelector(
            "." + BTN_PANE_CLASS + ":not(.wv-btn-relations)");
        if (commentBtnEl) {
            actionEl.insertBefore(relBtn, commentBtnEl.nextSibling);
        } else {
            actionEl.appendChild(relBtn);
        }
    }

    /**
     * Render a non-editable right-pane comment with inline markdown + URL
     * spans. Replaces commentEl's children with a fragment where:
     *   - **bold**, *italic*, ~~strike~~, `code` / ``code`` markers are
     *     consumed and the inner text wrapped in styled spans.
     *   - [label](url) becomes a clickable URL span with data-href.
     *   - Bare https://, zotero://, etc. URLs become clickable URL spans.
     * Markers are stripped from view so the user sees rendered formatting.
     *
     * Idempotent via two element attributes:
     *   - data-wv-raw stores the original source text (so subsequent
     *     passes can recover the unstripped text — commentEl.textContent
     *     would otherwise reflect the stripped view).
     *   - data-wv-source stores the cache key (md-pref + normalized text).
     *     A pass with a matching key short-circuits without rebuilding.
     *
     * Returns true when a rebuild actually occurred.
     */
    _renderPaneCommentInline(commentEl) {
        if (!commentEl || !commentEl.ownerDocument) return false;
        const doc = commentEl.ownerDocument;

        // Icons-only mode (Mode 2): "comments stay plain text". Restore the
        // raw source if we previously rendered formatting into this element,
        // then bail. Matches items list and sidebar Mode 2 behaviour.
        if (!this._getInlineLinks()) {
            const cachedRaw = commentEl.getAttribute("data-wv-raw");
            if (cachedRaw !== null) {
                while (commentEl.firstChild) commentEl.removeChild(commentEl.firstChild);
                commentEl.appendChild(doc.createTextNode(cachedRaw));
                commentEl.removeAttribute("data-wv-raw");
                commentEl.removeAttribute("data-wv-source");
                commentEl.removeAttribute("data-wv-rendered");
            }
            return false;
        }

        // Source text. Same three-state decision as _injectPaneRowIcon —
        // textContent of a rendered comment is the stripped form, so we
        // can't trust it after Zotero reaps our spans. data-wv-rendered
        // is the textContent we last produced; if liveText still matches
        // it, our raw cache is valid. If liveText differs, the user edited
        // the comment and we use the fresh text.
        // NOTE: textContent collapses any <br> separators Zotero might use,
        // which is fine here — the right pane intentionally renders comments
        // as a single line, so we don't try to reintroduce line breaks. The
        // PDF-reader sidebar uses the parallel _renderPreviewPanel which DOES
        // preserve breaks via _readCommentTextWithBreaks.
        const ourMarkers = commentEl.querySelector(".wv-md, .wv-url-span");
        const cachedRaw = commentEl.getAttribute("data-wv-raw");
        const cachedRendered = commentEl.getAttribute("data-wv-rendered");
        const liveText = commentEl.textContent || "";
        let raw;
        if (ourMarkers) {
            raw = cachedRaw || liveText;
        } else if (cachedRaw && cachedRendered !== null && liveText === cachedRendered) {
            raw = cachedRaw;
        } else {
            raw = liveText;
        }
        const norm = this.normalize(raw);
        const useMd = this._getEnableCommentMarkdown();
        const useUrls = this._getEnableInlineUrls();
        const hasUrls = useUrls && this.hasURI(raw);
        const hasMd   = useMd && this.MD_REGEX.test(norm);
        if (!hasUrls && !hasMd) return false;

        // Cache key invalidates when text or relevant prefs change.
        // BUT only honour the cache if our rendered output is still intact —
        // Zotero's React reconciliation can strip .wv-md / .wv-url-span
        // children while preserving the data-wv-source attribute. We detect
        // that via two signals:
        //   1. ourMarkers is non-null (some of our spans still in the DOM).
        //   2. liveText still matches data-wv-rendered (no partial reap that
        //      preserved one span class but stripped the other).
        // If either fails, fall through and rebuild.
        const cacheKey = (useMd ? "m" : "") + (useUrls ? "u" : "") + ":" + norm;
        const cacheHit = ourMarkers
            && commentEl.getAttribute("data-wv-source") === cacheKey
            && cachedRendered !== null
            && liveText === cachedRendered;
        if (cacheHit) return false;
        // If markers are gone, drop the stale attributes so a downstream
        // observer pass (or our own next call) sees an unrendered cell.
        if (!ourMarkers) {
            commentEl.removeAttribute("data-wv-source");
        }

        const frag = doc.createDocumentFragment();
        // Group order (when useMd):
        //   1 bold, 2 italic, 3 strike, 4 code-double, 5 code-single,
        //   6 link label, 7 link url, 8 bare URL.
        const TOKEN = useMd ? new RegExp(
            "\\*\\*([\\s\\S]+?)\\*\\*"
            + "|\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*"
            + "|~~([\\s\\S]+?)~~"
            + "|``([\\s\\S]+?)``"
            + "|`([^`\\n]+?)`"
            + "|\\[([^\\]\\n]+?)\\]\\(([^)\\s]+)\\)"
            + "|((?:" + this.URL_SCHEME_ALT + ")[^\\s<>\"\')\\]]*)",
            "g"
        ) : new RegExp(this.URL_REGEX.source, "g");

        const wrapMd = (cls, inner) => {
            const span = doc.createElement("span");
            span.className = "wv-md " + cls;
            span.textContent = inner;
            frag.appendChild(span);
        };

        let last = 0, m;
        while ((m = TOKEN.exec(norm)) !== null) {
            if (m.index > last)
                frag.appendChild(doc.createTextNode(norm.slice(last, m.index)));
            if (useMd && m[1] !== undefined) {
                wrapMd("wv-md-bold", m[1]);
            } else if (useMd && m[2] !== undefined) {
                wrapMd("wv-md-italic", m[2]);
            } else if (useMd && m[3] !== undefined) {
                wrapMd("wv-md-strike", m[3]);
            } else if (useMd && m[4] !== undefined) {
                wrapMd("wv-md-code", m[4]);
            } else if (useMd && m[5] !== undefined) {
                wrapMd("wv-md-code", m[5]);
            } else if (useMd && m[6] !== undefined && m[7] !== undefined) {
                // Markdown link [label](url). Drop the URL span when URLs
                // sub-toggle is off — render just the label as plain text.
                if (useUrls) {
                    const url = m[7];
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = m[6];
                    span.setAttribute("data-href", url);
                    frag.appendChild(span);
                } else {
                    frag.appendChild(doc.createTextNode(m[6]));
                }
            } else {
                // Bare URL — group 8 in md regex, group 0 in URL-only regex.
                const rawTok = useMd ? m[8] : m[0];
                if (rawTok === undefined) { last = m.index + m[0].length; continue; }
                if (useUrls) {
                    const url   = rawTok.replace(this.TRAILING_RE, "");
                    const trail = rawTok.slice(url.length);
                    const span = doc.createElement("span");
                    span.className = "wv-url-span "
                        + this._urlLinkClass(url);
                    span.title = url;
                    span.textContent = url;
                    frag.appendChild(span);
                    if (trail) frag.appendChild(doc.createTextNode(trail));
                } else {
                    frag.appendChild(doc.createTextNode(rawTok));
                }
            }
            last = m.index + m[0].length;
        }
        if (last < norm.length)
            frag.appendChild(doc.createTextNode(norm.slice(last)));

        // Stash the raw source BEFORE replacing children — afterwards
        // commentEl.textContent reflects the stripped/formatted view.
        commentEl.setAttribute("data-wv-raw", raw);
        while (commentEl.firstChild) commentEl.removeChild(commentEl.firstChild);
        commentEl.appendChild(frag);
        commentEl.setAttribute("data-wv-source", cacheKey);
        // Record the textContent we just produced so a later pass can tell
        // whether the live text is "spans-stripped form of cachedRaw" (use
        // cachedRaw) or "user edited" (use liveText).
        commentEl.setAttribute("data-wv-rendered", commentEl.textContent || "");
        this._dbg("[Weavero] pane comment rendered:"
            + " useMd=" + useMd
            + " childCount=" + commentEl.childNodes.length);
        return true;
    }

    _scanPaneRows() {
        if (!this._getEnableRightPane()) {
            this._stripRightPane();
            return;
        }
        const doc = Zotero.getMainWindow().document;
        // Scan ALL <annotation-row> custom elements anywhere in the document.
        // Zotero shows these in two right-pane views — the attachment's
        // annotation list (under #zotero-view-item) and the single-annotation
        // detail view (in a different container). The items tree uses a CSS
        // class .annotation-row on plain <div>s, NOT the custom element, so
        // tag-selecting `annotation-row` is unique to the right pane.
        const rows = doc.querySelectorAll("annotation-row");
        this._dbg("[Weavero] _scanPaneRows: found " + rows.length
            + " annotation-row elements");
        for (const row of rows)
            this._injectPaneRowIcon(row);
        const spans = doc.querySelectorAll("annotation-row .wv-url-span");
        this._dbg("[Weavero] _scanPaneRows: " + spans.length
            + " .wv-url-span elements live after pass");
        // Same surface — process related-box annotation rows so URLs
        // and markdown in the (already-truncated) display title are
        // styled like the rest of the comment surfaces.
        try { this._processRelatedBoxes(doc); }
        catch(e) { Zotero.debug("[Weavero] _processRelatedBoxes err: " + e); }
    }

    /** Render URLs / markdown inline inside the right pane's "Related"
     *  section labels, but only for related items that ARE annotations.
     *  Upstream (`relatedBox.js`) builds each related row as
     *      `<div class="row"><div class="box">[icon][span.label]</div></div>`
     *  where the `.label` text is `relatedItem.getDisplayTitle()`. For
     *  annotations that title is built by `Zotero.Item.updateDisplayTitle`
     *  as `"<text>" <comment>` (each part already truncated to 50 chars
     *  + ellipsis), so it's "the visible part" by construction — the
     *  CSS column ellipsis only kicks in if the row is even narrower.
     *  We pass the label span through `_markTextLinks(.., {mode:"tree"})`
     *  which is the same path the items-tree note rows use: it strips
     *  markdown markers and renders inline `.wv-url-span`s, preserving
     *  text length and therefore preserving any column-level ellipsis.
     *
     *  Detection: upstream's `getCSSIcon('annotation-…')` builds an
     *  `<img class="annotation-icon">` for annotations and a different
     *  span structure for everything else. Querying for
     *  `.row .box img.annotation-icon` selects only annotation rows.
     */
    /** Clear DOM markers left behind by a previous plugin instance
     *  (after an in-place plugin upgrade). The old plugin's event
     *  handlers are bound to closures that the new instance can't
     *  see, so any element that the new code skips because of an
     *  "already processed" marker is effectively dead. Re-running
     *  init alone doesn't help — the marker is on the DOM, not on
     *  the plugin instance.
     *
     *  Called from `onMainWindowLoad` so that an upgrade recovers
     *  to a working state without the user having to disable +
     *  re-enable the plugin manually. */
    _resetStaleMarkers(doc) {
        if (!doc || !doc.querySelectorAll) return;
        try {
            // Related-box rows: clear render-cache + context-menu
            // wire flags so `_processRelatedBoxes` reprocesses
            // every row from scratch.
            for (const l of doc.querySelectorAll(
                    "related-box .body .row .label[data-wv-related-rendered]")) {
                l.removeAttribute("data-wv-related-rendered");
                // Same elements may carry the _markTextLinks cache
                // markers too; clear them so the rebuild path runs.
                l.removeAttribute("data-wv-source");
                l.removeAttribute("data-wv-rendered");
                l.removeAttribute("data-wv-raw");
                l.removeAttribute("data-wv-last-rebuild");
            }
            for (const r of doc.querySelectorAll(
                    "related-box .body .row[data-wv-ctx-wired]")) {
                r.removeAttribute("data-wv-ctx-wired");
            }
            // Right-pane comment cells and any other element that
            // carries our render-cache markers. The previous plugin's
            // markers would otherwise stick around and make the new
            // instance's cache check skip the rebuild it needs to do.
            for (const el of doc.querySelectorAll(
                    "[data-wv-source], [data-wv-rendered], [data-wv-raw],"
                    + " [data-wv-last-rebuild]")) {
                el.removeAttribute("data-wv-source");
                el.removeAttribute("data-wv-rendered");
                el.removeAttribute("data-wv-raw");
                el.removeAttribute("data-wv-last-rebuild");
            }
        } catch (e) {
            Zotero.debug("[Weavero] _resetStaleMarkers err: " + e);
        }
    }

    _processRelatedBoxes(doc) {
        if (!doc) return;
        // Process every label, not just annotation rows. Other related
        // items (web pages, attachments) can have URLs in their displayTitle
        // too, and unwrapping during destroy would otherwise leave them
        // stuck as plain text on re-enable. _markTextLinks is idempotent —
        // labels without URL/markdown content are no-ops.
        const labels = doc.querySelectorAll(
            "related-box .body .row .box .label");
        let touched = 0;
        // DIAG: log how many labels we found and a sample of their state.
        // Crucial for diagnosing why disable+re-enable doesn't restore the
        // visual rendering — tells us whether labels are even present, and
        // whether the live textContent matches the aria-label source.
        Zotero.debug("[Weavero][diag] _processRelatedBoxes: "
            + labels.length + " label(s) found");
        let diagIdx = 0;
        for (const label of labels) {
            try {
                const box = label.closest(".box");
                const ariaText = box && box.getAttribute("aria-label");
                const liveTextBefore = label.textContent || "";
                const wvMdBefore = label.querySelectorAll(".wv-md").length;
                const wvUrlBefore = label.querySelectorAll(".wv-url-span").length;
                const sourceAttr = label.getAttribute("data-wv-source");
                if (diagIdx < 3) {
                    Zotero.debug("[Weavero][diag] label[" + diagIdx + "]"
                        + " live=" + JSON.stringify(liveTextBefore.slice(0, 80))
                        + " aria=" + JSON.stringify((ariaText || "").slice(0, 80))
                        + " wvMd=" + wvMdBefore + " wvUrl=" + wvUrlBefore
                        + " src=" + JSON.stringify(sourceAttr));
                }
                // Recover the original raw displayTitle from the parent
                // .box's aria-label. Zotero sets aria-label = label.textContent
                // exactly once at row-render time and never updates it
                // afterwards (see relatedBox.js:123 in zotero/zotero), so
                // it's a frozen copy of the source — useful when the live
                // label content has been corrupted (older plugin instance,
                // partial reaping). But once WE'VE rendered, liveText is
                // legitimately the stripped form ("Test app link" instead
                // of "[Test app link](url)") and that's NOT corruption —
                // resetting would cause an infinite reset → render → reset
                // loop via the mutation observer.
                //
                // So only reset when the label has no spans of ours AND
                // the live text differs from aria-label.
                let didReset = false;
                const hasOurSpans = !!label.querySelector(".wv-md, .wv-url-span");
                if (ariaText && ariaText !== liveTextBefore && !hasOurSpans) {
                    while (label.firstChild) label.removeChild(label.firstChild);
                    label.appendChild(doc.createTextNode(ariaText));
                    label.removeAttribute("data-wv-source");
                    label.removeAttribute("data-wv-rendered");
                    label.removeAttribute("data-wv-raw");
                    label.removeAttribute("data-wv-last-rebuild");
                    delete label.dataset.wvRelatedRendered;
                    didReset = true;
                }
                // Always call _markTextLinks. Its cache check now validates
                // that the expected spans are still in the DOM, so skipping
                // here on a textContent match alone would mask cases where
                // some other code path stripped our spans (e.g.
                // _applyInlineLinksPref unwraps every .wv-url-span globally).
                const raw = label.textContent || "";
                let renderResult;
                if (this._markTextLinks(label, { mode: "tree" })) {
                    label.dataset.wvRelatedRendered = raw;
                    touched++;
                    renderResult = "rebuilt";
                } else {
                    renderResult = "no-rebuild";
                }
                if (diagIdx < 3) {
                    const wvMdAfter = label.querySelectorAll(".wv-md").length;
                    const wvUrlAfter = label.querySelectorAll(".wv-url-span").length;
                    Zotero.debug("[Weavero][diag] label[" + diagIdx + "]"
                        + " reset=" + didReset
                        + " result=" + renderResult
                        + " wvMd=" + wvMdAfter + " wvUrl=" + wvUrlAfter
                        + " liveAfter=" + JSON.stringify(
                            (label.textContent || "").slice(0, 80)));
                }
                diagIdx++;
            } catch (e) {
                Zotero.debug("[Weavero] related label render err: " + e);
            }
        }
        if (touched) {
            this._dbg("[Weavero] _processRelatedBoxes: rendered "
                + touched + "/" + labels.length + " row(s)");
        }
        // Attach a contextmenu listener to EVERY related-box row (not
        // just annotation ones) so the user can right-click any related
        // item and get the type-aware open-options menu. Idempotent —
        // skip rows already wired via dataset flag. The listener
        // resolves the row's item lazily at click time.
        const rows = doc.querySelectorAll("related-box .body .row");
        for (const row of rows) {
            if (row.dataset && row.dataset.wvCtxWired) continue;
            row.addEventListener("contextmenu", (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = this._resolveRelatedRowItem(row);
                    if (!item) return;
                    this._openRelatedItemContextMenu(item, e.screenX, e.screenY);
                } catch (err) {
                    Zotero.debug("[Weavero] rel-box ctx err: " + err);
                }
            });
            if (row.dataset) row.dataset.wvCtxWired = "1";
        }
    }

    /** Resolve the Zotero.Item backing a `<div class="row">` inside the
     *  right-pane Related section. Upstream's relatedBox.js doesn't
     *  expose the id on the row DOM (it captures it in a click-handler
     *  closure), so we pivot off the currently-selected item: the
     *  related-box always shows ITS relations, so iterating
     *  `parent.relatedItems` and matching by display title resolves the
     *  row in O(N) where N is small (related-section size). Falls
     *  through to null if nothing matches — caller bails. */
    _resolveRelatedRowItem(row) {
        if (!row) return null;
        try {
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            const labelEl = row.querySelector(".label");
            const labelText = labelEl ? (labelEl.textContent || "").trim() : "";
            if (!zp || !labelText) return null;
            // Build a candidate set of "owning" items: every selected
            // item AND every annotation child of every selected item
            // (in case the related-box is for an attachment but a
            // related annotation is what we right-clicked under it).
            const selected = (typeof zp.getSelectedItems === "function")
                ? zp.getSelectedItems() : [];
            const candidates = new Set();
            for (const it of selected) {
                if (it) candidates.add(it);
            }
            for (const owner of candidates) {
                const keys = (owner && owner.relatedItems) || [];
                for (const k of keys) {
                    let it;
                    try { it = Zotero.Items.getByLibraryAndKey(owner.libraryID, k); }
                    catch (e) { continue; }
                    if (!it) continue;
                    let title;
                    try { title = (it.getDisplayTitle() || "").trim(); }
                    catch (e) { title = ""; }
                    if (title === labelText) return it;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _resolveRelatedRowItem err: " + e);
        }
        return null;
    }

    /** Render URLs / markdown in items-tree note rows. Each
     *  `<note-row>` (read-only custom element) has a `.note-content`
     *  div populated by upstream via `textContent = note.body`. We
     *  reuse `_markTextLinks(.., {mode:"tree"})` — same path the
     *  note-annotation rows already use. */
    _processNoteRows(doc) {
        if (!this._getEnableNotes()) return;
        doc = doc || Zotero.getMainWindow().document;
        if (!doc) return;
        const rows = doc.querySelectorAll("note-row .note-content");
        this._dbg("[Weavero] _processNoteRows: " + rows.length + " row(s)");
        for (const el of rows) {
            try { this._markTextLinks(el, { mode: "tree" }); }
            catch (e) { Zotero.debug("[Weavero] note-row render: " + e); }
        }
    }

    /** Render URLs / markdown in the right-pane Notes section
     *  (`<notes-box>` listing child notes for a parent item). Each
     *  row's `.label` span holds the note's first-line excerpt. */
    _processNotesBoxes(doc) {
        if (!this._getEnableNotes()) return;
        doc = doc || Zotero.getMainWindow().document;
        if (!doc) return;
        const labels = doc.querySelectorAll("notes-box .body .row .label");
        this._dbg("[Weavero] _processNotesBoxes: " + labels.length + " label(s)");
        for (const el of labels) {
            try { this._markTextLinks(el, { mode: "tree" }); }
            catch (e) { Zotero.debug("[Weavero] notes-box render: " + e); }
        }
    }

    /** Build the CSS rules that colour `<a>` elements in the note
     *  editor's iframe doc by URL scheme. Uses ATTRIBUTE-PREFIX
     *  selectors (`a[href^="..."]`) — pure CSS, zero DOM mutation,
     *  so we don't fight the rich-text editor's reconciliation
     *  (which was causing the entire note to blink as the editor
     *  re-applied its own DOM, our observer re-tagged anchors, and
     *  the editor re-applied again, ad infinitum).
     *
     *  Always-on rules: `zotero://` + `http(s)://`.
     *  App-link rules: only when the master `enableAppLinks` is on
     *  AND the per-scheme tickbox is on. */
    _buildNoteEditorCSS() {
        const rules = [
            // Light/dark variants via `prefers-color-scheme` — the
            // note editor iframe doesn't carry our `wv-ui-dark`
            // class, so we drive themed link colours from the OS
            // colour scheme instead. Same hex values as the rest
            // of Weavero's surfaces (PLUGIN_CSS / reader CSS).
            ":root { --wv-link-http: #1a73e8;"
                + " --wv-link-zotero: #8b4513;"
                + " --wv-link-app: #9333ea; }",
            "@media (prefers-color-scheme: dark) {"
                + " :root { --wv-link-http: #8ab4f8;"
                + " --wv-link-zotero: #cd853f;"
                + " --wv-link-app: #c084fc; } }",
            "a[href^=\"zotero://\"] { color: var(--wv-link-zotero) !important; }",
            "a[href^=\"http://\"],"
            + " a[href^=\"https://\"]"
            + " { color: var(--wv-link-http) !important; }",
            // Hide the note editor's built-in link popup in BOTH
            // modes. View mode (URL + Edit/Unlink buttons) is
            // replaced by Weavero's hover tooltip + right-click
            // menu. Edit mode (`<input>` for URL) is replaced by
            // Weavero's two-field Edit Link panel — a popup-mount
            // observer in `_setupNoteEditorObserver` watches for
            // the popup appearing in edit mode (triggered by
            // Ctrl-K, the toolbar's "Insert link" button, or the
            // Edit button — though the last is unreachable now)
            // and routes through `_takeOverEditorLinkPopup`.
            ".popup.link-popup { display: none !important; }",
            // Hand cursor over any `<a href>` — matches the PDF
            // reader's clickable-link cursor. The note editor
            // doesn't set a pointer cursor on anchors by default
            // (its default styling assumes anchors are edited as
            // text); since we take over the click ourselves, we
            // need to advertise that the link is clickable.
            "a[href] { cursor: pointer !important; }",
        ];
        let appLinksOn = false;
        try { appLinksOn = !!Zotero.Prefs.get("weavero.enableAppLinks"); }
        catch (e) {}
        if (appLinksOn) {
            const prefixes = [];
            for (const def of URL_SCHEMES) {
                let on = false;
                try { on = !!Zotero.Prefs.get("weavero." + def.pref); }
                catch (e) {}
                if (!on) continue;
                prefixes.push("a[href^=\"" + def.name + def.sep + "\"]");
            }
            if (prefixes.length) {
                rules.push(prefixes.join(", ")
                    + " { color: var(--wv-link-app) !important; }");
            }
        }
        return rules.join("\n");
    }

    /** Inject (or refresh) our colour stylesheet inside the note
     *  editor's iframe doc. Replaces any prior version of the
     *  stylesheet so toggling `enableAppLinks` or a scheme tick
     *  flips colours immediately on the next call. */
    _ensureNoteEditorStyles(idoc) {
        if (!idoc) return;
        let s = idoc.getElementById("weavero-note-editor-styles");
        if (!s) {
            s = idoc.createElement("style");
            s.id = "weavero-note-editor-styles";
            try { (idoc.head || idoc.documentElement).appendChild(s); }
            catch (e) { return; }
        }
        const css = this._buildNoteEditorCSS();
        if (s.textContent !== css) s.textContent = css;
    }

    /** Per-`<note-editor>` setup. CSS-only approach — we inject our
     *  scheme-color stylesheet into the iframe doc once on load, and
     *  re-inject (rebuild the rules) whenever the user toggles
     *  enableAppLinks or any individual scheme. NO MutationObserver
     *  on the editor's body: prior version used one to re-tag `<a>`
     *  classes on mutation, which fought the rich-text editor's
     *  reconciliation and produced an infinite blink-loop. CSS
     *  attribute-prefix selectors (`a[href^="..."]`) need no
     *  per-mutation work at all. */
    _setupNoteEditorObserver(noteEditorEl) {
        if (!noteEditorEl) return;
        if (!this._noteEditorObservers) {
            this._noteEditorObservers = new WeakMap();
        }
        if (this._noteEditorObservers.has(noteEditorEl)) {
            this._dbg("[Weavero] note-editor: already wired, skip");
            return;
        }
        const iframe = noteEditorEl.querySelector("iframe#editor-view")
            || noteEditorEl.querySelector("iframe");
        if (!iframe) {
            this._dbg("[Weavero] note-editor: no iframe found inside <note-editor>");
            return;
        }
        const wireUp = () => {
            try {
                const idoc = iframe.contentDocument;
                if (!idoc) return;
                const iwin = idoc.defaultView;
                this._ensureNoteEditorStyles(idoc);

                // Aggressive click suppression. The note editor's
                // link-popup widget can be wired to any of:
                //   pointerdown / mousedown / mouseup / click /
                //   auxclick (right-click) / contextmenu
                // We swallow ALL of them at capture phase on the
                // iframe document. Only `click` (left-button) and
                // `contextmenu` actually do something — the others
                // just stop the editor's popup from appearing.
                //
                // `findAnchor` walks up from text-node targets; some
                // editor framework events fire with a Text node as
                // target, which has no .closest method.
                const findAnchor = (e) => {
                    let t = e.target;
                    if (t && t.nodeType === 3) t = t.parentNode;
                    if (!t || !t.closest) return null;
                    return t.closest("a[href]");
                };
                // Swallow left-click only on mousedown/mouseup/pointerdown.
                // Calling preventDefault on a RIGHT-click mousedown
                // also suppresses the contextmenu event in Firefox —
                // which would silently kill our `onContext` handler.
                // For right-click we let the events pass through and
                // rely on `onContext` (capture) to take over.
                const swallowLeft = (e) => {
                    if (e.button !== 0) return null;
                    const a = findAnchor(e);
                    if (!a) return null;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    return a;
                };
                const onPointerDown = (e) => { swallowLeft(e); };
                const onMouseDown   = (e) => { swallowLeft(e); };
                const onMouseUp     = (e) => { swallowLeft(e); };
                const onAuxClick    = (e) => { swallowLeft(e); };  // button-1/middle
                const onClick = (e) => {
                    const a = swallowLeft(e);
                    if (!a) return;
                    const href = a.getAttribute("href") || "";
                    if (href) this._launchURL(href);
                };

                // Right-click on `<a>` → custom menu. Right-click
                // elsewhere → let Firefox show its textbox-contextmenu.
                //
                // We cancel the current timer, hide the panel, then
                // open the menu. The hover delay is otherwise
                // unaffected — onOut handles the case where the
                // cursor leaves the iframe (e.g. moves to the menu).
                const onContext = (e) => {
                    const a = findAnchor(e);
                    if (!a) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    if (this._noteLinkTooltipTimer) {
                        try { iwin.clearTimeout(this._noteLinkTooltipTimer); }
                        catch(err) {}
                        this._noteLinkTooltipTimer = null;
                    }
                    this._hideLinkTooltipFromIframe();
                    this._dbg("[Weavero] note-link contextmenu: opening custom");
                    this._openNoteLinkContextMenu(a, idoc, e.screenX, e.screenY);
                };

                // Hover → tooltip showing the URL, with a delay
                // before appearing and dismissed on movement
                // (matches the PDF reader's link hover popup,
                // which is driven by `PopupDelayer`).
                //
                // Model: every `mousemove` cancels the pending
                // open-timer; if the cursor stays still over a
                // link for `_NOTE_TOOLTIP_DELAY_MS` ms, the timer
                // fires and the panel opens at the position
                // captured at the last-move time. The panel is
                // hidden as soon as movement resumes.
                // 500 ms — matches the annotation-comment URL-span
                // hover delay (`_setupUrlHoverWidget` in the items
                // tree). The PDF reader's link tooltip is faster
                // (100 ms via `PopupDelayer`); we deliberately
                // mirror the in-app behaviour the user already sees
                // in annotation comments rather than the reader.
                const DELAY_MS = 500;
                const onMove = (e) => {
                    const a = findAnchor(e);
                    // Cancel any pending open — every movement
                    // restarts the delay window.
                    if (this._noteLinkTooltipTimer) {
                        try { iwin.clearTimeout(this._noteLinkTooltipTimer); }
                        catch(err) {}
                        this._noteLinkTooltipTimer = null;
                    }
                    // Hide an already-open tooltip on any movement
                    // (PDF reader behaviour: tooltip is "discarded
                    // when moving the mouse again").
                    if (this._noteLinkTooltipCurrentAnchor) {
                        this._hideLinkTooltipFromIframe();
                    }
                    if (!a) return;
                    const href = a.getAttribute("href") || "";
                    if (!href) return;
                    // Capture the current cursor position; the
                    // panel will anchor here when the timer fires.
                    const sx = e.screenX;
                    const sy = e.screenY;
                    this._noteLinkTooltipTimer = iwin.setTimeout(() => {
                        this._noteLinkTooltipTimer = null;
                        // The cursor has been still over a link for
                        // the full delay — open the tooltip.
                        this._showLinkTooltipFromIframe(href, sx, sy, a);
                    }, DELAY_MS);
                };
                const onOut = (e) => {
                    // `mouseout` from the iframe doc fires when the
                    // cursor leaves the entire iframe (e.g. into the
                    // sidebar / chrome / our right-click menu).
                    // Hide the tooltip AND cancel any pending open
                    // timer — without the cancel, the last
                    // `mousemove` before crossing the iframe boundary
                    // would leave a 500 ms timer scheduled, and the
                    // tooltip would pop up on top of the menu.
                    if (!e.relatedTarget) {
                        this._dbg("[Weavero] tooltip out: cursor left iframe");
                        if (this._noteLinkTooltipTimer) {
                            try {
                                iwin.clearTimeout(this._noteLinkTooltipTimer);
                            } catch(err) {}
                            this._noteLinkTooltipTimer = null;
                        }
                        this._hideLinkTooltipFromIframe();
                    }
                };

                idoc.addEventListener("pointerdown", onPointerDown, true);
                idoc.addEventListener("mousedown",   onMouseDown,   true);
                idoc.addEventListener("mouseup",     onMouseUp,     true);
                idoc.addEventListener("auxclick",    onAuxClick,    true);
                idoc.addEventListener("click",       onClick,       true);
                idoc.addEventListener("contextmenu", onContext,     true);
                idoc.addEventListener("mousemove",   onMove,        true);
                idoc.addEventListener("mouseout",    onOut,         true);

                // Watch for the editor's link popup mounting in
                // edit mode (Ctrl-K, toolbar "Insert link" button,
                // or any other path that calls `pluginState.link.
                // toggle()`). When detected, hand off to our own
                // Edit Link panel via `_takeOverEditorLinkPopup`.
                // The popup is hidden by our CSS in either mode,
                // but we still need to detect it to know when the
                // user wants to edit/create a link.
                const popupMo = new iwin.MutationObserver((mutations) => {
                    for (const m of mutations) {
                        if (m.type !== "childList") continue;
                        for (const n of m.addedNodes) {
                            if (!n || n.nodeType !== 1) continue;
                            const cands = (n.matches
                                && n.matches(".popup.link-popup"))
                                ? [n]
                                : (n.querySelectorAll
                                    ? n.querySelectorAll(".popup.link-popup")
                                    : []);
                            for (const p of cands) {
                                if (!p.querySelector("input")) continue;
                                if (p.dataset.weaveroSeen === "1") continue;
                                p.dataset.weaveroSeen = "1";
                                // Defer one tick so React's
                                // useLayoutEffect has run and
                                // pluginState.link.popup is settled.
                                iwin.setTimeout(() => {
                                    try {
                                        this._takeOverEditorLinkPopup(idoc, p);
                                    } catch(err) {
                                        Zotero.debug("[Weavero] popup "
                                            + "takeover err: " + err);
                                    }
                                }, 0);
                            }
                        }
                    }
                });
                popupMo.observe(idoc.body || idoc.documentElement,
                    { childList: true, subtree: true });

                this._noteEditorObservers.set(noteEditorEl,
                    { iframe, idoc, popupMo,
                      listeners: { onPointerDown, onMouseDown, onMouseUp,
                                   onAuxClick, onClick, onContext,
                                   onMove, onOut } });
                this._dbg("[Weavero] note-editor wired (styles + listeners + popup MO)");
            } catch (e) {
                Zotero.debug("[Weavero] note-editor wireUp err: " + e);
            }
        };
        try {
            const ready = iframe.contentDocument
                && iframe.contentDocument.readyState === "complete";
            if (ready) {
                wireUp();
            } else {
                iframe.addEventListener("load", wireUp, { once: true });
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-editor setup err: " + e);
        }
    }

    /** Walk every wired-up note editor and refresh its colour
     *  stylesheet. Called from the pref observer when an
     *  app-link / scheme pref changes so the new colour palette
     *  takes effect without requiring a window reopen. */
    /** Build + open the chrome XUL `menupopup` shown on right-click
     *  of an `<a>` inside a note editor. Items: Open Link / Copy
     *  Link Address / sep / Edit Link… / Unlink. Uses screen coords
     *  to position correctly even though the click event came from
     *  the iframe doc. Idempotent — removes any prior popup first. */
    _openNoteLinkContextMenu(anchor, idoc, screenX, screenY) {
        if (!anchor) return;
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const popupset = doc.getElementById("zotero-pane-popupset")
            || doc.documentElement;
        const old = doc.getElementById("wv-note-link-menu");
        if (old) { try { old.remove(); } catch(e) {} }
        const popup = doc.createXULElement("menupopup");
        popup.id = "wv-note-link-menu";

        const href = anchor.getAttribute("href") || "";
        const append = (label, fn) => {
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            mi.addEventListener("command", () => {
                try { fn(); }
                catch(e) { Zotero.debug("[Weavero] note-link menu cmd err: " + e); }
            });
            popup.appendChild(mi);
        };
        const sep = () => popup.appendChild(doc.createXULElement("menuseparator"));

        append("Copy Link", () => {
            try {
                if (href) Zotero.Utilities.Internal.copyTextToClipboard(href);
            } catch(e) { Zotero.debug("[Weavero] copy-link err: " + e); }
        });
        sep();
        append("Edit Link…", () => {
            this._editNoteLink(anchor, idoc);
        });
        append("Unlink", () => {
            this._unlinkNoteLink(anchor, idoc);
        });

        popupset.appendChild(popup);
        popup.addEventListener("popuphidden", () => {
            try { popup.remove(); } catch(e) {}
        });
        try { popup.openPopupAtScreen(screenX, screenY, true); }
        catch(e) {
            Zotero.debug("[Weavero] note-link menu open err: " + e);
            try { popup.remove(); } catch(e2) {}
        }
    }

    /** Resolve the note editor's ProseMirror link plugin from an
     *  iframe document. The editor exposes itself via the iframe
     *  window's `_currentEditorInstance` (see upstream
     *  note-editor/src/index.zotero.js) — we reach through
     *  `wrappedJSObject` to bypass the chrome-side Xray wrapper.
     *
     *  Returns `{ editorCore, view, link }` or `null`. */
    _getNoteEditorLinkPlugin(idoc) {
        if (!idoc) return null;
        const iwin = idoc.defaultView;
        if (!iwin) return null;
        try {
            const w = iwin.wrappedJSObject || iwin;
            const editorInstance = w._currentEditorInstance;
            const editorCore = editorInstance && editorInstance._editorCore;
            const link = editorCore
                && editorCore.pluginState
                && editorCore.pluginState.link;
            if (!link || !link.view) return null;
            return { editorCore, view: link.view, link };
        } catch (e) {
            Zotero.debug("[Weavero] _getNoteEditorLinkPlugin err: " + e);
            return null;
        }
    }

    /** Position the editor's caret inside `anchor` so the link
     *  plugin's `setURL` / `removeURL` can find the surrounding
     *  link mark range via `getMarkRangeAtCursor`. */
    _positionCursorInLink(view, anchor) {
        try {
            const target = anchor.firstChild || anchor;
            const dompos = view.posAtDOM(target, 0);
            const $pos = view.state.doc.resolve(dompos);
            // Both TextSelection and the base Selection class expose
            // a static `.near` that returns a valid selection close
            // to a resolved position. The iframe's prosemirror bundle
            // is shared with the existing selection's class, so we
            // pick it up from the live state instead of trying to
            // import prosemirror-state from chrome.
            const Sel = view.state.selection.constructor;
            const newSel = (Sel && typeof Sel.near === "function")
                ? Sel.near($pos)
                : null;
            if (!newSel) return false;
            view.dispatch(view.state.tr.setSelection(newSel));
            return true;
        } catch (e) {
            Zotero.debug("[Weavero] _positionCursorInLink err: " + e);
            return false;
        }
    }

    /** Edit Link command — open a chrome panel (anchored near the
     *  link) with Text + URL fields + Cancel/Apply buttons, then
     *  route changes through the editor's link plugin. Mirrors
     *  the two-field layout used by Evernote / Google Docs /
     *  Notion: editing existing links generally needs to update
     *  both the visible text and the underlying URL.
     *
     *  Fall-through:
     *  - URL only changed → `pluginState.link.setURL(newUrl)`
     *    (plugin uses `updateMarkRangeAtCursor` to find the link
     *    range from the cursor, which we position inside).
     *  - Text changed (with or without URL) → dispatch a single
     *    `replaceWith` transaction that swaps the entire anchor
     *    range for a new text node carrying the (possibly new)
     *    link mark. This keeps the edit in one undo step. */
    _editNoteLink(anchor, idoc) {
        if (!anchor || !idoc) return;
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) {
            Zotero.debug("[Weavero] edit-link: editor link plugin "
                + "unavailable");
            return;
        }
        const oldUrl = anchor.getAttribute("href") || "";
        const oldText = anchor.textContent || "";
        this._showLinkEditPanel(idoc, anchor, null, null,
            oldText, oldUrl,
            (newText, newUrl) => {
                this._applyNoteLinkEdit(ctx, anchor,
                    oldText, oldUrl, newText, newUrl);
            });
    }

    /** Apply Text/URL changes from the Edit Link panel.
     *
     *  Cross-realm notes — the editor's prosemirror-* runs in the
     *  iframe (content) realm; we run in chrome:
     *  1. `MarkType.create(attrs)` reads `attrs.href`. A bare
     *     chrome object is Xray-wrapped → property read returns
     *     undefined → "No value supplied for attribute href".
     *     `Cu.cloneInto` rehomes attrs into content.
     *  2. `schema.text(text, [mark])` would route the marks array
     *     through `Mark.setFrom`, which calls `.slice()`. A
     *     chrome-side array Xray-blocks `.slice()`. We sidestep
     *     by creating an UNMARKED text node and applying the link
     *     mark via `tr.addMark` (single mark, no array). */
    _applyNoteLinkEdit(ctx, anchor, oldText, oldUrl, newText, newUrl) {
        const trimmedUrl = (newUrl || "").trim();
        if (!trimmedUrl) return;  // empty URL is treated as cancel
        const textChanged = (newText !== null && newText !== oldText);
        const urlChanged = (trimmedUrl !== oldUrl);
        if (!textChanged && !urlChanged) return;
        if (textChanged && !newText) return;  // empty text — skip
        const view = ctx.view;
        try {
            if (textChanged) {
                const fromPos = view.posAtDOM(anchor, 0);
                const toPos = view.posAtDOM(anchor,
                    anchor.childNodes.length);
                const schema = view.state.schema;
                const iwin = view.dom && view.dom.ownerDocument
                    && view.dom.ownerDocument.defaultView;
                const rawAttrs = { href: trimmedUrl, title: null };
                const attrs = (iwin && Components && Components.utils
                    && Components.utils.cloneInto)
                    ? Components.utils.cloneInto(rawAttrs, iwin)
                    : rawAttrs;
                const linkMark = schema.marks.link.create(attrs);
                // Replace the anchor's contents with an unmarked
                // text node, then mark the new range with the link
                // mark. Both ops in one tr → single undo step.
                const textNode = schema.text(newText);
                const tr = view.state.tr;
                tr.replaceWith(fromPos, toPos, textNode);
                tr.addMark(fromPos, fromPos + newText.length, linkMark);
                view.dispatch(tr);
                this._dbg("[Weavero] edit-link: replaced text="
                    + JSON.stringify(newText) + " href=" + trimmedUrl);
            } else {
                if (!this._positionCursorInLink(view, anchor)) return;
                ctx.link.setURL(trimmedUrl);
                this._dbg("[Weavero] edit-link: setURL("
                    + trimmedUrl + ") dispatched");
            }
        } catch (e) {
            Zotero.debug("[Weavero] edit-link apply err: " + e);
        }
    }

    /** Take over the editor's built-in link popup when it mounts in
     *  edit mode. Detected by the popup-mount MutationObserver in
     *  `_setupNoteEditorObserver`. Reads `pluginState.link.popup`
     *  to determine the context (cursor in existing link vs new
     *  link from selection), cancels the editor's popup, and opens
     *  Weavero's two-field Edit Link panel. */
    _takeOverEditorLinkPopup(idoc, popupEl) {
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) return;
        const pluginPopup = ctx.link && ctx.link.popup;
        if (!pluginPopup || !pluginPopup.active) return;
        // Only take over when the editor's link plugin entered
        // popup-edit mode explicitly — `pluginPopup.edit === true`
        // is set by `toggle()` (Ctrl-K / toolbar "Insert link"
        // button) and NOT by the regular `update()` path that
        // re-evaluates the popup whenever the cursor enters a
        // link. Right-clicking a link updates the selection to
        // the click point, which fires `update()` and mounts the
        // popup in view mode; without this guard our takeover
        // would race the right-click context menu and steal the
        // interaction.
        if (!pluginPopup.edit) return;

        const isEdit = !!pluginPopup.node;
        const initUrl = pluginPopup.href || "";
        let initText = "";
        let anchor = null;

        if (isEdit) {
            anchor = pluginPopup.node;
            initText = anchor.textContent || "";
        } else {
            try {
                const sel = ctx.view.state.selection;
                if (!sel.empty) {
                    initText = ctx.view.state.doc.textBetween(
                        sel.from, sel.to);
                }
            } catch(e) {}
        }

        // Capture selection bounds for the create-from-selection
        // path before cancelling — `cancel()` dispatches a no-op
        // transaction that doesn't move the selection, but we
        // capture defensively.
        const savedFrom = !isEdit ? ctx.view.state.selection.from : null;
        const savedTo   = !isEdit ? ctx.view.state.selection.to   : null;

        try { ctx.link.cancel(); } catch(e) {}
        this._dbg("[Weavero] popup takeover: isEdit=" + isEdit
            + " initUrl=" + initUrl
            + " initText=" + JSON.stringify(initText));

        this._showLinkEditPanel(idoc,
            isEdit ? anchor : null,
            isEdit ? null : savedFrom,
            isEdit ? null : savedTo,
            initText, initUrl,
            (newText, newUrl) => {
                if (isEdit) {
                    this._applyNoteLinkEdit(ctx, anchor,
                        initText, initUrl, newText, newUrl);
                } else {
                    this._createNoteLinkFromSelection(ctx, idoc,
                        savedFrom, savedTo,
                        initText, newText, newUrl);
                }
            });
    }

    /** Create a new link from the editor's current selection, used
     *  by the Ctrl-K / toolbar take-over flow when the user invokes
     *  the link popup with text selected (no existing link mark).
     *
     *  Same cross-realm pattern as `_applyNoteLinkEdit`:
     *  `Cu.cloneInto` the attrs, then `tr.replaceWith` an unmarked
     *  text node + `tr.addMark` over the new range — avoids the
     *  marks-array Xray slice() block. */
    _createNoteLinkFromSelection(ctx, idoc, fromPos, toPos,
            oldText, newText, newUrl) {
        const trimmedUrl = (newUrl || "").trim();
        if (!trimmedUrl) return;
        if (!newText) return;
        if (typeof fromPos !== "number" || typeof toPos !== "number") return;
        const view = ctx.view;
        try {
            const schema = view.state.schema;
            const iwin = idoc && idoc.defaultView;
            const rawAttrs = { href: trimmedUrl, title: null };
            const attrs = (iwin && Components && Components.utils
                && Components.utils.cloneInto)
                ? Components.utils.cloneInto(rawAttrs, iwin)
                : rawAttrs;
            const linkMark = schema.marks.link.create(attrs);
            const tr = view.state.tr;
            if (newText !== oldText) {
                const textNode = schema.text(newText);
                tr.replaceWith(fromPos, toPos, textNode);
                tr.addMark(fromPos, fromPos + newText.length, linkMark);
            } else {
                tr.addMark(fromPos, toPos, linkMark);
            }
            view.dispatch(tr);
            this._dbg("[Weavero] create-link: text="
                + JSON.stringify(newText) + " href=" + trimmedUrl);
        } catch (e) {
            Zotero.debug("[Weavero] create-link err: " + e);
        }
    }

    /** Build and open the Edit Link popup. Implemented as an HTML
     *  overlay INSIDE the iframe document (positioned `absolute`
     *  in body coords) rather than as a chrome XUL panel. That
     *  gives us three things for free:
     *  - **Natural clipping at the editor's frame** — the iframe's
     *    overflow clips anything that scrolls past its viewport,
     *    so the popup looks "as if it lived in the text" the same
     *    way the note's own content does.
     *  - **Native scroll** — wheel events over the popup bubble
     *    to the iframe doc and scroll the editor; with a XUL
     *    panel (separate OS window) wheel events were captured
     *    by the panel and the editor stayed put.
     *  - **No reposition on scroll** — `position: absolute` in
     *    body coords means the popup moves with the body's
     *    scrolled content automatically; no scroll listener.
     *
     *  Position source:
     *  - If `anchor` is given (existing-link edit), position from
     *    `anchor.getBoundingClientRect()` + iwin scroll offset.
     *  - Else if `fromPos` is a number (selection-based new link),
     *    position from `view.coordsAtPos(fromPos)`.
     *  Calls `onApply(newText, newUrl)` when the user confirms. */
    _showLinkEditPanel(idoc, anchor, fromPos, toPos,
            initText, initUrl, onApply) {
        if (!idoc) return;
        const HTML_NS = "http://www.w3.org/1999/xhtml";
        const win = Zotero.getMainWindow();
        if (!win) return;
        const chromeDoc = win.document;
        const iwin = idoc.defaultView;
        if (!iwin) return;

        // Tear down any prior overlay (defensive against fast
        // double-invocations).
        const prior = idoc.querySelector(".wv-link-edit-overlay");
        if (prior) {
            try { prior.remove(); } catch(e) {}
        }

        // One-time CSS injection into the iframe doc head. Subsequent
        // calls reuse the existing stylesheet.
        const STYLE_ID = "wv-link-edit-style";
        if (!idoc.getElementById(STYLE_ID)) {
            const style = idoc.createElementNS(HTML_NS, "style");
            style.id = STYLE_ID;
            style.textContent = ""
                + ".wv-link-edit-overlay{"
                +   "position:absolute;z-index:100000;"
                +   "background:#ffffff;color:#000;"
                +   "padding:14px 16px 12px;min-width:380px;"
                +   "border:1px solid rgba(0,0,0,0.20);"
                +   "border-radius:6px;"
                +   "box-shadow:0 4px 16px rgba(0,0,0,0.18);"
                +   "font:menu;font-size:13px;line-height:1.4;"
                +   "box-sizing:border-box;"
                + "}"
                + ".wv-link-edit-overlay .row{"
                +   "display:flex;align-items:center;"
                +   "margin-bottom:10px;gap:10px;"
                + "}"
                + ".wv-link-edit-overlay .row label{"
                +   "width:42px;font-weight:600;flex-shrink:0;"
                +   "color:#4a9eff;"
                + "}"
                + ".wv-link-edit-overlay .row input{"
                +   "flex:1;padding:5px 8px;"
                +   "background:#fff;color:inherit;"
                +   "border:1px solid rgba(0,0,0,0.30);"
                +   "border-radius:4px;font:inherit;outline:none;"
                + "}"
                + ".wv-link-edit-overlay .row input:focus{"
                +   "border-color:#4a9eff;"
                +   "box-shadow:0 0 0 2px rgba(74,158,255,0.25);"
                + "}"
                + ".wv-link-edit-overlay .buttons{"
                +   "display:flex;justify-content:flex-end;"
                +   "gap:8px;margin-top:6px;"
                + "}"
                + ".wv-link-edit-overlay button{"
                +   "padding:5px 14px;border-radius:4px;"
                +   "font:inherit;cursor:pointer;"
                +   "border:1px solid rgba(0,0,0,0.20);"
                +   "background:#f6f6f6;color:inherit;"
                + "}"
                + ".wv-link-edit-overlay button:hover{background:#ececec;}"
                + ".wv-link-edit-overlay button.apply{"
                +   "background:#4a9eff;color:#fff;"
                +   "border-color:#2c7fe0;font-weight:600;"
                + "}"
                + ".wv-link-edit-overlay button.apply:hover{"
                +   "background:#2c7fe0;"
                + "}"
                + "@media (prefers-color-scheme: dark){"
                +   ".wv-link-edit-overlay{"
                +     "background:#2b2b2b;color:#fff;"
                +     "border-color:rgba(255,255,255,0.30);"
                +     "box-shadow:0 4px 16px rgba(0,0,0,0.50);"
                +   "}"
                +   ".wv-link-edit-overlay .row input{"
                +     "background:#1e1e1e;color:#fff;"
                +     "border-color:rgba(255,255,255,0.30);"
                +   "}"
                +   ".wv-link-edit-overlay button{"
                +     "background:#3a3a3a;"
                +     "border-color:rgba(255,255,255,0.30);"
                +   "}"
                +   ".wv-link-edit-overlay button:hover{background:#4a4a4a;}"
                + "}";
            try {
                (idoc.head || idoc.documentElement).appendChild(style);
            } catch(e) {}
        }

        const overlay = idoc.createElementNS(HTML_NS, "div");
        overlay.className = "wv-link-edit-overlay";

        const makeRow = (labelText, value) => {
            const row = idoc.createElementNS(HTML_NS, "div");
            row.className = "row";
            const label = idoc.createElementNS(HTML_NS, "label");
            label.textContent = labelText;
            const input = idoc.createElementNS(HTML_NS, "input");
            input.type = "text";
            input.value = value || "";
            row.appendChild(label);
            row.appendChild(input);
            return { row, input };
        };

        const textRow = makeRow("Text", initText);
        const urlRow  = makeRow("URL",  initUrl);
        overlay.appendChild(textRow.row);
        overlay.appendChild(urlRow.row);

        const btns = idoc.createElementNS(HTML_NS, "div");
        btns.className = "buttons";
        const cancelBtn = idoc.createElementNS(HTML_NS, "button");
        cancelBtn.textContent = "Cancel";
        const applyBtn = idoc.createElementNS(HTML_NS, "button");
        applyBtn.textContent = "Apply";
        applyBtn.className = "apply";
        btns.appendChild(cancelBtn);
        btns.appendChild(applyBtn);
        overlay.appendChild(btns);

        // The note editor's actual scrolling element is
        // `.editor-core` (overflow:auto), with `.relative-container`
        // (position:relative) as its only child — that's where the
        // editor's own popups live (LinkPopup, HighlightPopup, …).
        // Append our overlay to `.relative-container` so it:
        //   - scrolls with the editor's content (no manual reposition)
        //   - is clipped at `.editor-core`'s overflow edge
        //     (the editor's frame, matching the note's text)
        //   - lets wheel events bubble up to `.editor-core` so
        //     scrolling works while the cursor is over the popup
        // Position is `top`/`left` relative to `.relative-container`,
        // computed from the link's viewport rect minus the
        // container's viewport rect.
        const relativeContainer = idoc.querySelector(
            ".editor-core .relative-container");
        const host = relativeContainer
            || idoc.body
            || idoc.documentElement;
        let top = 0, left = 0;
        try {
            let linkRect = null;
            if (anchor) {
                linkRect = anchor.getBoundingClientRect();
            } else if (typeof fromPos === "number") {
                const ctx = this._getNoteEditorLinkPlugin(idoc);
                if (ctx) {
                    const c = ctx.view.coordsAtPos(fromPos);
                    if (c) {
                        linkRect = {
                            left: c.left, right: c.right,
                            top: c.top, bottom: c.bottom,
                        };
                    }
                }
            }
            if (linkRect) {
                if (relativeContainer) {
                    const cr = relativeContainer.getBoundingClientRect();
                    top  = linkRect.bottom - cr.top;
                    left = linkRect.left   - cr.left;
                } else {
                    // Fallback when container missing: use viewport
                    // coords directly (less ideal, but better than
                    // nothing).
                    top  = linkRect.bottom;
                    left = linkRect.left;
                }
            }
        } catch(e) {}
        overlay.style.top  = (top + 4) + "px";
        overlay.style.left = left + "px";

        try {
            host.appendChild(overlay);
        } catch(e) {
            Zotero.debug("[Weavero] link-edit overlay append err: " + e);
            return;
        }

        let done = false;
        const close = () => {
            if (done) return;
            done = true;
            try { overlay.remove(); } catch(e) {}
            try {
                idoc.removeEventListener("mousedown", outsideHandler, true);
            } catch(e) {}
            try {
                chromeDoc.removeEventListener(
                    "mousedown", outsideHandler, true);
            } catch(e) {}
        };
        const outsideHandler = (e) => {
            const t = e.target;
            if (t && t.closest && t.closest(".wv-link-edit-overlay")) return;
            close();
        };
        try {
            idoc.addEventListener("mousedown", outsideHandler, true);
        } catch(e) {}
        try {
            chromeDoc.addEventListener("mousedown", outsideHandler, true);
        } catch(e) {}

        // Stop event propagation INSIDE the overlay so we don't
        // re-trigger editor handlers (cursor moves, link click, …)
        // when the user interacts with the popup. Applied at
        // capture-phase on the overlay itself.
        const stop = (e) => { e.stopPropagation(); };
        overlay.addEventListener("mousedown", stop, false);
        overlay.addEventListener("mouseup",   stop, false);
        overlay.addEventListener("click",     stop, false);

        // Focus-trap: keep Tab/Shift-Tab cycling within the popup
        // instead of escaping into the editor's content. Standard
        // UX pattern for modal/inline dialogs.
        const focusables = [textRow.input, urlRow.input,
            cancelBtn, applyBtn];
        overlay.addEventListener("keydown", (e) => {
            if (e.key !== "Tab") return;
            const idx = focusables.indexOf(idoc.activeElement);
            e.preventDefault();
            e.stopPropagation();
            const len = focusables.length;
            let next;
            if (idx === -1) {
                next = focusables[0];
            } else if (e.shiftKey) {
                next = focusables[(idx - 1 + len) % len];
            } else {
                next = focusables[(idx + 1) % len];
            }
            try { next.focus(); } catch(err) {}
        }, true);

        cancelBtn.addEventListener("click", (e) => {
            e.preventDefault();
            close();
        });
        applyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const t = textRow.input.value;
            const u = urlRow.input.value;
            close();
            try { onApply(t, u); } catch(err) {
                Zotero.debug("[Weavero] link-edit onApply err: " + err);
            }
        });

        const keyHandler = (e) => {
            if (e.key === "Enter") {
                e.preventDefault(); e.stopPropagation();
                applyBtn.click();
            } else if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                close();
            } else {
                // Stop other keys too — we don't want Ctrl-K /
                // arrow keys / etc. to reach the editor's keymap
                // while the user is typing in our inputs.
                e.stopPropagation();
            }
        };
        textRow.input.addEventListener("keydown", keyHandler);
        urlRow.input.addEventListener("keydown", keyHandler);

        // Focus the URL input after the overlay is in the DOM.
        win.setTimeout(() => {
            try { urlRow.input.focus(); urlRow.input.select(); }
            catch(e) {}
        }, 0);
    }

    /** Unlink command — strip the `<a>` mark, keeping the text. */
    _unlinkNoteLink(anchor, idoc) {
        if (!anchor || !idoc) return;
        const ctx = this._getNoteEditorLinkPlugin(idoc);
        if (!ctx) {
            Zotero.debug("[Weavero] unlink: editor link plugin "
                + "unavailable");
            return;
        }
        if (!this._positionCursorInLink(ctx.view, anchor)) return;
        try {
            ctx.link.removeURL();
            this._dbg("[Weavero] unlink: removeURL dispatched");
        } catch (e) {
            Zotero.debug("[Weavero] unlink removeURL err: " + e);
        }
    }

    /** Show the URL tooltip for a note-editor link hover. Anchored
     *  to the cursor at the time the iframe-doc `mousemove` timer
     *  fired (i.e. where the user came to rest over the link).
     *  Implemented as a XUL `<panel>` parented to the main window's
     *  popupset — the iframe is cross-doc, so direct `openPopup
     *  (anchor)` does not work; we use `openPopupAtScreen` with
     *  the captured screen coordinates. */
    _showLinkTooltipFromIframe(href, screenX, screenY, anchorEl) {
        if (!href) return;
        try {
            const win = Zotero.getMainWindow();
            if (!win || !win.document) return;
            const doc = win.document;
            let panel = doc.getElementById("wv-note-link-tooltip-panel");
            if (!panel) {
                const popupset = doc.getElementById("zotero-pane-popupset")
                    || doc.documentElement;
                panel = doc.createXULElement("panel");
                panel.id = "wv-note-link-tooltip-panel";
                // Plain panel (no `type="arrow"`). With an arrow
                // panel, Mozilla auto-decides above vs below based
                // on available space and sometimes overlaps the
                // cursor — causing a mouseout→hide→mouseover→show
                // flicker loop. A plain panel lets us position
                // explicitly and reliably below the link.
                panel.setAttribute("noautofocus", "true");
                panel.setAttribute("noautohide", "true");
                panel.setAttribute("level", "top");
                panel.setAttribute("ignorekeys", "true");
                // Zero out the system XUL panel chrome's own padding
                // (Mozilla's default theme adds ~6-10 px) so only the
                // description's tight padding shows visually.
                panel.style.padding    = "0";
                panel.style.margin     = "0";
                panel.style.minWidth   = "0";
                panel.style.minHeight  = "0";
                const desc = doc.createXULElement("description");
                desc.id = "wv-note-link-tooltip-desc";
                desc.style.maxWidth = "60ch";
                desc.style.padding  = "2px 6px";
                desc.style.margin   = "0";
                panel.appendChild(desc);
                popupset.appendChild(panel);
            }
            const desc = doc.getElementById("wv-note-link-tooltip-desc");
            if (desc) desc.textContent = href;
            // Position the panel just below the cursor — same shape
            // as the PDF reader's link hover tooltip. We're called
            // ONCE when the iframe-doc mousemove timer fires (after
            // the user has held still over a link for the hover
            // delay), so the position captured at the timer-arm
            // time is the right place to anchor.
            let sx = (typeof screenX === "number") ? screenX + 4  : 0;
            let sy = (typeof screenY === "number") ? screenY + 18 : 0;
            try {
                if (panel.state === "open" || panel.state === "showing") {
                    panel.hidePopup();
                }
                panel.openPopupAtScreen(sx, sy, false, null);
                this._noteLinkTooltipCurrentAnchor = anchorEl || null;
                this._dbg("[Weavero] tooltip: open href=" + href
                    + " sx=" + sx + " sy=" + sy);
            } catch (e) {
                Zotero.debug("[Weavero] tooltip open err: " + e);
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-link tooltip err: " + e);
        }
    }

    _hideLinkTooltipFromIframe() {
        this._noteLinkTooltipCurrentAnchor = null;
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            const tip = doc && doc.getElementById("wv-note-link-tooltip-panel");
            if (tip && tip.hidePopup) {
                tip.hidePopup();
                this._dbg("[Weavero] tooltip: hide");
            }
        } catch (e) {}
    }

    _refreshAllNoteEditorStyles() {
        try {
            // Right-pane editors live in the main window; pop-out
            // editors in `zotero:note` windows.
            const docs = [];
            try { docs.push(Zotero.getMainWindow().document); }
            catch (e) {}
            try {
                const winEnum = Services.wm.getEnumerator("zotero:note");
                while (winEnum.hasMoreElements()) {
                    const w = winEnum.getNext();
                    if (w && w.document) docs.push(w.document);
                }
            } catch (e) {}
            for (const d of docs) {
                if (!d) continue;
                for (const ne of d.querySelectorAll("note-editor")) {
                    try {
                        const ifr = ne.querySelector("iframe#editor-view")
                            || ne.querySelector("iframe");
                        const idoc = ifr && ifr.contentDocument;
                        if (idoc) this._ensureNoteEditorStyles(idoc);
                    } catch (e) {}
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _refreshAllNoteEditorStyles err: " + e);
        }
    }

    /** Find every `<note-editor>` across the main window AND every
     *  pop-out `zotero:note` window, and wire it up. Idempotent — the
     *  `_noteEditorObservers` WeakMap dedupes. */
    _processNoteEditors(doc) {
        if (!this._getEnableNotes()) return;
        const main = doc || Zotero.getMainWindow().document;
        let mainCount = 0;
        if (main) {
            for (const ne of main.querySelectorAll("note-editor")) {
                this._setupNoteEditorObserver(ne);
                mainCount++;
            }
        }
        let popoutCount = 0;
        try {
            const winEnum = Services.wm.getEnumerator("zotero:note");
            while (winEnum.hasMoreElements()) {
                const w = winEnum.getNext();
                const wd = w && w.document;
                if (!wd) continue;
                for (const ne of wd.querySelectorAll("note-editor")) {
                    this._setupNoteEditorObserver(ne);
                    popoutCount++;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] note-window enumerate err: " + e);
        }
        this._dbg("[Weavero] _processNoteEditors: main=" + mainCount
            + " popout=" + popoutCount);
    }

    /** Pop-out note window listener — onOpenWindow fires when a
     *  `chrome://zotero/content/note.xhtml` window is created. On
     *  load, scan the new document for `<note-editor>` elements and
     *  wire them up. */
    _setupNoteWindowListener() {
        if (this._noteWindowListener) return;
        // After a note window's `load` fires, the <note-editor>
        // element isn't always in the DOM yet — XUL custom-element
        // upgrades happen asynchronously. Poll briefly (up to ~1s)
        // until at least one editor element is found, then wire it.
        const tryWire = (w, retries) => {
            try {
                if (!w || !w.document) return;
                if (!this._getEnableNotes()) return;
                const before = (this._noteEditorObservers
                    ? 0 /* WeakMap has no .size */ : 0);
                let count = 0;
                for (const ne of w.document.querySelectorAll("note-editor")) {
                    this._setupNoteEditorObserver(ne);
                    count++;
                }
                this._dbg("[Weavero] tryWire pop-out note: count="
                    + count + " retriesLeft=" + retries);
                if (count === 0 && retries > 0) {
                    try {
                        w.setTimeout(() => tryWire(w, retries - 1), 100);
                    } catch (e) {}
                }
            } catch (e) {
                Zotero.debug("[Weavero] tryWire err: " + e);
            }
        };
        const onLoad = (w) => {
            try {
                const url = w && w.location && w.location.href;
                if (!url || !/note\.xhtml/.test(url)) return;
                tryWire(w, 10);
            } catch (e) {
                Zotero.debug("[Weavero] note-win load err: " + e);
            }
        };
        const listener = {
            // Required interface methods — `wm.addListener` silently
            // fails / drops the listener if any of the three are
            // missing, which is why our previous build didn't see
            // pop-out note windows.
            onOpenWindow: (xulWindow) => {
                try {
                    const w = xulWindow.docShell && xulWindow.docShell.domWindow;
                    if (!w) return;
                    if (w.document
                            && w.document.readyState === "complete") {
                        onLoad(w);
                    } else {
                        w.addEventListener("load",
                            () => onLoad(w), { once: true });
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] onOpenWindow err: " + e);
                }
            },
            onCloseWindow: () => {},
            onWindowTitleChange: () => {},
        };
        try { Services.wm.addListener(listener); }
        catch (e) {
            Zotero.debug("[Weavero] wm.addListener err: " + e);
            return;
        }
        this._noteWindowListener = listener;
        this._dbg("[Weavero] note-window listener registered");
    }

    _teardownNoteWindowListener() {
        if (!this._noteWindowListener) return;
        try { Services.wm.removeListener(this._noteWindowListener); }
        catch (e) {}
        this._noteWindowListener = null;
    }

    /** Revert decorated note surfaces to plain text. Mirrors
     *  `_stripRightPane` / `_stripItemsList`. Called when the user
     *  unticks Notes, and at destroy(). */
    _stripNotes() {
        try {
            const main = Zotero.getMainWindow().document;
            const docs = [main];
            try {
                const winEnum = Services.wm.getEnumerator("zotero:note");
                while (winEnum.hasMoreElements()) {
                    const w = winEnum.getNext();
                    if (w && w.document) docs.push(w.document);
                }
            } catch (e) {}
            for (const doc of docs) {
                if (!doc) continue;
                // Items-tree note rows + right-pane notes-box labels
                for (const span of doc.querySelectorAll(
                        "note-row .note-content .wv-url-span,"
                        + " notes-box .body .row .label .wv-url-span")) {
                    span.replaceWith(doc.createTextNode(span.textContent || ""));
                }
                // Note editor iframes (right-pane + pop-out): we
                // never modify the editor's DOM (CSS-only colouring
                // via attribute selectors), so all that's needed is
                // removing our injected stylesheet — the editor's
                // own anchor colours come back automatically.
                // Plus detach the capture-phase listeners we wired
                // on `idoc` so plugin-disable / strip-on-toggle-off
                // doesn't leave stale handlers intercepting clicks.
                for (const ne of doc.querySelectorAll("note-editor")) {
                    try {
                        const iframe = ne.querySelector("iframe#editor-view")
                            || ne.querySelector("iframe");
                        const idoc = iframe && iframe.contentDocument;
                        if (!idoc) continue;
                        const s = idoc.getElementById("weavero-note-editor-styles");
                        if (s) s.remove();
                        // Detach our listeners if we have them recorded.
                        if (this._noteEditorObservers
                                && this._noteEditorObservers.has(ne)) {
                            const entry = this._noteEditorObservers.get(ne);
                            const L = entry && entry.listeners;
                            if (L) {
                                try { idoc.removeEventListener("pointerdown", L.onPointerDown, true); } catch(e) {}
                                try { idoc.removeEventListener("mousedown",   L.onMouseDown,   true); } catch(e) {}
                                try { idoc.removeEventListener("mouseup",     L.onMouseUp,     true); } catch(e) {}
                                try { idoc.removeEventListener("auxclick",    L.onAuxClick,    true); } catch(e) {}
                                try { idoc.removeEventListener("click",       L.onClick,       true); } catch(e) {}
                                try { idoc.removeEventListener("contextmenu", L.onContext,     true); } catch(e) {}
                                try { idoc.removeEventListener("mousemove",   L.onMove,        true); } catch(e) {}
                                try { idoc.removeEventListener("mouseout",    L.onOut,         true); } catch(e) {}
                            }
                            // Disconnect the popup-mount observer so
                            // it doesn't fire after the editor is
                            // torn down (or after plugin disable).
                            if (entry && entry.popupMo) {
                                try { entry.popupMo.disconnect(); } catch(e) {}
                            }
                            this._noteEditorObservers.delete(ne);
                        }
                    } catch (e) {}
                }
                // Drop the hover tooltip panel + suppress flag too.
                try {
                    const tipPanel = doc.getElementById(
                        "wv-note-link-tooltip-panel");
                    if (tipPanel) {
                        try { tipPanel.hidePopup(); } catch(e) {}
                        try { tipPanel.remove(); } catch(e) {}
                    }
                    // Old `<div>` widget id from a pre-XUL-panel build.
                    const oldTip = doc.getElementById("wv-note-link-tooltip");
                    if (oldTip) oldTip.remove();
                } catch(e) {}
                // The timer was scheduled with the iframe window's
                // setTimeout — that window is being torn down with
                // the iframe, so the timer queue goes with it. Just
                // null the handle so a stale id doesn't linger.
                this._noteLinkTooltipTimer = null;
            }
        } catch (e) {
            Zotero.debug("[Weavero] _stripNotes err: " + e);
        }
    }

    _setupPaneObserver() {
        const doc = Zotero.getMainWindow().document;
        const win = doc.defaultView;

        // Initial pass — there may already be rows present.
        this._scanPaneRows();

        // Anchor the observer to documentElement, not #zotero-view-item:
        // Zotero's renderer can replace the right-pane container itself when
        // the selected item changes, which detaches an observer attached to
        // the inner element. The whole-document observer is broader but the
        // callback exits early unless a mutation involves annotation-row,
        // so the runtime cost stays small.
        let scanTimer = null;
        const scheduleScan = () => {
            if (scanTimer) win.clearTimeout(scanTimer);
            scanTimer = win.setTimeout(() => {
                scanTimer = null;
                try { this._scanPaneRows(); }
                catch(e) { Zotero.debug("[Weavero] pane scan error: " + e); }
            }, 80);
        };

        this._paneObserver = new win.MutationObserver(mutations => {
            const rowsToRender = new Set();
            let needsScan = false;
            let needsRelatedScan = false;
            let needsNotesScan = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const tag = node.tagName?.toLowerCase();
                    if (tag === "annotation-row") {
                        rowsToRender.add(node);
                        needsScan = true;
                        continue;
                    }
                    if (node.querySelector) {
                        const found = node.querySelector("annotation-row");
                        if (found) {
                            rowsToRender.add(found);
                            needsScan = true;
                        }
                    }
                    // Related-box rows. Three shapes worth catching:
                    //   1. The whole <related-box> mounting fresh.
                    //   2. The body div's contents being repopulated.
                    //   3. A single .row being appended.
                    if (tag === "related-box"
                        || (node.classList
                            && (node.classList.contains("row")
                                || node.classList.contains("body")))
                        || (node.querySelector
                            && (node.querySelector("related-box")
                                || node.querySelector(
                                    "related-box .body .row")))) {
                        needsRelatedScan = true;
                    }
                    // Note surfaces: items-tree <note-row>, right-pane
                    // <notes-box>, right-pane <note-editor>. Catch the
                    // element itself or any descendant, since all three
                    // can mount nested inside a re-rendered container.
                    if (tag === "note-row" || tag === "notes-box" || tag === "note-editor"
                        || (node.querySelector
                            && (node.querySelector("note-row")
                                || node.querySelector("notes-box")
                                || node.querySelector("note-editor")))) {
                        needsNotesScan = true;
                    }
                }
                // Comment text edits inside an existing row also count.
                const tgt = m.target;
                if (tgt && tgt.closest) {
                    const annotRow = tgt.closest("annotation-row");
                    if (annotRow) {
                        rowsToRender.add(annotRow);
                        needsScan = true;
                    }
                    // Label text changes inside related-box rows (e.g.
                    // a related annotation's display title was re-rendered).
                    if (tgt.closest("related-box")) {
                        needsRelatedScan = true;
                    }
                    // Note text edits / re-renders inside any of the
                    // note surfaces.
                    if (tgt.closest("note-row")
                        || tgt.closest("notes-box")
                        || tgt.closest("note-editor")) {
                        needsNotesScan = true;
                    }
                }
            }
            // Synchronous per-row re-render — runs in the observer microtask,
            // before the browser paints, so the user never sees the raw
            // markdown text flash when navigating between annotations. The
            // cache check inside _renderPaneCommentInline prevents re-entry
            // on the mutations our own writes generate.
            for (const row of rowsToRender) {
                try { this._injectPaneRowIcon(row); }
                catch(e) { Zotero.debug("[Weavero] sync pane re-render: " + e); }
            }
            if (needsRelatedScan) {
                try { this._processRelatedBoxes(doc); }
                catch(e) { Zotero.debug(
                    "[Weavero] related-box scan err: " + e); }
            }
            if (needsNotesScan && this._getEnableNotes()) {
                try { this._processNoteRows(doc); }
                catch(e) { Zotero.debug("[Weavero] note-rows scan err: " + e); }
                try { this._processNotesBoxes(doc); }
                catch(e) { Zotero.debug("[Weavero] notes-box scan err: " + e); }
                try { this._processNoteEditors(doc); }
                catch(e) { Zotero.debug("[Weavero] note-editors scan err: " + e); }
            }
            // Debounced full scan as a safety net for rows we missed (e.g.
            // sibling rows added in the same batch but not in mutation targets).
            if (needsScan) scheduleScan();
        });
        this._paneObserver.observe(doc.documentElement,
            { childList: true, subtree: true, characterData: true });
        Zotero.debug("[Weavero] pane observer attached to documentElement");

        // Focus toggle for right-pane comment editing. When a .content
        // inside a .comment.wv-comment-preview gets focus, swap to raw
        // editable text. On focusout, swap back to the rendered preview.
        // Also handles shadow-DOM cases since focusin bubbles through
        // shadow boundaries when composed:true (the default).
        if (!this._paneFocusInHandler) {
            this._paneFocusInHandler = (e) => {
                try {
                    const target = e && e.composedPath ? e.composedPath()[0] : e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest && target.closest(".comment");
                    if (cmt && cmt.classList.contains("wv-comment-preview")) {
                        cmt.classList.add("wv-editing");
                    }
                } catch(err) {}
            };
            this._paneFocusOutHandler = (e) => {
                try {
                    const target = e && e.composedPath ? e.composedPath()[0] : e && e.target;
                    if (!target || !target.classList) return;
                    if (!target.classList.contains("content")) return;
                    const cmt = target.closest && target.closest(".comment");
                    if (cmt) cmt.classList.remove("wv-editing");
                    // Re-render the preview after edit.
                    if (cmt) {
                        try { this._renderPreviewPanel(cmt); }
                        catch(err) {}
                    }
                } catch(err) {}
            };
            doc.addEventListener("focusin", this._paneFocusInHandler, true);
            doc.addEventListener("focusout", this._paneFocusOutHandler, true);
        }
    }

    // ---- Settings ---------------------------------------------------------

    _getShowTreeIcon() {
        try { return !!Zotero.Prefs.get("weavero.showTreeIcon"); }
        catch(e) { return false; }
    }

    _getInlineLinks() {
        try {
            const v = Zotero.Prefs.get("weavero.inlineLinks");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    // ---- Per-surface enable/disable prefs ---------------------------------
    // The user can independently enable each of the four surfaces where we
    // decorate annotation comments. All default to true.
    _getEnableItemsList() {
        try {
            const v = Zotero.Prefs.get("weavero.enableItemsList");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    _getEnableRightPane() {
        try {
            const v = Zotero.Prefs.get("weavero.enableRightPane");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Notes — standalone + child note items across every surface
     *  (items-tree note rows, right-pane Notes box, the note editor
     *  in both the right pane and the pop-out note window). Defaults
     *  OFF so existing users don't see new clickable spans on notes
     *  they've already curated until they explicitly opt in. */
    _getEnableNotes() {
        try {
            const v = Zotero.Prefs.get("weavero.enableNotes");
            return v === undefined ? false : !!v;
        } catch(e) { return false; }
    }
    /** Reader sidebar — the annotation list on the left side of the
     *  reader. Format-agnostic (PDF / EPUB / snapshot). */
    _getEnableReaderSidebar() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderSidebar");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Reader document view — the page area where the document renders.
     *  Covers in-document annotation popups and the link badges drawn
     *  over annotation icons. Format-agnostic. */
    _getEnableReaderView() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderView");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Sub-toggle of enableReaderView. When false, badges (.wv-marker-badge)
     *  and floating text-annotation buttons (.wv-text-annotation-btn) are NOT
     *  drawn over the document. In-document annotation popups (the small
     *  popup that shows when the user clicks an annotation) still receive
     *  URL / markdown rendering. Default true. */
    _getEnableReaderViewIcons() {
        try {
            const v = Zotero.Prefs.get("weavero.enableReaderViewIcons");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }
    /** Master switch for inline markdown rendering inside the popup.
     *  Default true. When false: _commentHasIconableContent ignores markdown
     *  marks (so the icon doesn't appear on markdown-only comments) and
     *  _renderInlineMarkdown degrades to a URL-only render. */
    _getEnableMarkdown() {
        // Hardcoded true since v0.0.161: the popup always renders markdown.
        // The original `enableMarkdown` toggle is gone from the UI — having
        // it off didn't add user value (the popup is the only fully
        // formatted view, so disabling it left no way to see markdown).
        return true;
    }

    /** Render markdown directly inside annotation comments. Sub-toggle of
     *  Inline mode (only effective when _getInlineLinks() is also true).
     *  Default true. */
    _getEnableCommentMarkdown() {
        try {
            const v = Zotero.Prefs.get("weavero.enableCommentMarkdown");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Render URLs as coloured/clickable spans directly inside annotation
     *  comments. Sub-toggle of Inline mode (only effective when
     *  _getInlineLinks() is also true). Default true. */
    _getEnableInlineUrls() {
        try {
            const v = Zotero.Prefs.get("weavero.enableInlineUrls");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on URL-bearing comments in Icon & Popup mode.
     *  Sub-toggle parallel to enableInlineUrls but mode-flipped. Only
     *  effective when _getInlineLinks() is FALSE. Default true. */
    _getEnableIconUrls() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconUrls");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on markdown-bearing comments in Icon & Popup mode.
     *  In Icon mode the popup is the only access to formatted markdown, so
     *  without this toggle markdown-only comments would have no affordance.
     *  Default true. */
    _getEnableIconMarkdown() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconMarkdown");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** Show the chain icon on app-link-bearing comments (mailto:, obsidian://,
     *  vscode://, ...) in Icon & Popup mode. Requires the master enableAppLinks
     *  toggle to be on (master invalidates URL_REGEX, dominating this sub).
     *  Default true. */
    _getEnableIconAppLinks() {
        try {
            const v = Zotero.Prefs.get("weavero.enableIconAppLinks");
            return v === undefined ? true : !!v;
        } catch(e) { return true; }
    }

    /** True when markdown rendering is on for AT LEAST ONE surface.
     *  Used by _commentHasIconableContent to decide whether markdown markers
     *  count as "iconable" — if neither popup nor inline rendering will
     *  format them, the marks are just text. */
    _anyMarkdownEnabled() {
        return this._getEnableMarkdown() || this._getEnableCommentMarkdown();
    }

    /** Hidden debug pref. When true, every routine sidebar/render pass
     *  emits verbose [Weavero] traces. Default false (silent).
     *  Toggle via Tools → Developer → Run JavaScript:
     *    Zotero.Prefs.set("weavero.debug", true);
     *  Errors and significant one-time events still log unconditionally. */
    _getDebug() {
        try {
            const v = Zotero.Prefs.get("weavero.debug");
            return v === undefined ? false : !!v;
        } catch(e) { return false; }
    }

    /** Routine debug log — only fires when the debug pref is on. Use this
     *  for per-render-pass spam (sidebar scans, span cache hits, etc.).
     *  Errors and rare events should keep using Zotero.debug() directly. */
    _dbg(msg) {
        if (this._getDebug()) Zotero.debug(msg);
    }

    /** Strip every decoration we add to the items-tree annotation rows. */
    _stripItemsList() {
        // Re-entry guard: with the items-list mutation observer running
        // synchronously (v0.0.132), every DOM change we make here instantly
        // re-fires _markCellLinks, which would call us again. Without this
        // guard we recurse / livelock when there are many annotation cells
        // visible. The idempotent shortcuts below also help.
        if (this._stripItemsListBusy) return;
        this._stripItemsListBusy = true;
        try {
            const doc = Zotero.getMainWindow().document;
            // 1. Restore tight annotation-comment cells (highlight / underline /
            //    image / ink / note rows) to plain text. SKIP cells that are
            //    already clean — touching them triggers redundant childList
            //    mutations that fire the tree observer in a tight loop and
            //    freeze Zotero.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                const isDirty =
                    cell.querySelector(".wv-text-wrap, .wv-tree-icon, .wv-tree-rel-icon, .wv-url-span")
                    || cell.hasAttribute("data-comment-text")
                    || cell.hasAttribute("data-has-rich")
                    || cell.hasAttribute("data-has-relations")
                    || cell.hasAttribute("data-truncated");
                if (!isDirty) continue;

                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Only assign textContent when it actually changes —
                // assigning the same value still emits a childList mutation.
                if (cell.textContent !== text) cell.textContent = text;
                if (cell.hasAttribute("data-has-rich"))     cell.removeAttribute("data-has-rich");
                if (cell.hasAttribute("data-icon-wanted"))   cell.removeAttribute("data-icon-wanted");
                if (cell.hasAttribute("data-has-relations")) cell.removeAttribute("data-has-relations");
                if (cell.hasAttribute("data-comment-text"))  cell.removeAttribute("data-comment-text");
                if (cell.hasAttribute("data-truncated"))     cell.removeAttribute("data-truncated");
                if (cell.hasAttribute("data-has-url"))       cell.removeAttribute("data-has-url");
            }
            // 2. Unwrap any URL spans we injected into other annotation-row
            //    types (text annotations and area / image annotations show
            //    their text in `.cell-text` and get coloured spans there).
            //    `.annotation-row` is the items-tree class — the right-pane
            //    uses the `<annotation-row>` custom *element*, which is a
            //    different selector and won't match.
            for (const span of doc.querySelectorAll(".annotation-row .wv-url-span")) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // 3. Remove any leftover tree icons that escaped the cell flatten.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-icon")) {
                ic.remove();
            }
            // 3b. Same for the relations icon.
            for (const ic of doc.querySelectorAll(".annotation-row .wv-tree-rel-icon")) {
                ic.remove();
            }
        } catch(e) {
            Zotero.debug("[Weavero] _stripItemsList: " + e);
        } finally {
            this._stripItemsListBusy = false;
        }
    }

    /** Strip URL spans + popup buttons from right-pane <annotation-row>s. */
    _stripRightPane() {
        try {
            const doc = Zotero.getMainWindow().document;
            for (const span of doc.querySelectorAll(
                    "annotation-row .wv-url-span")) {
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Revert inline-md rendering: restore the comment text from the
            // cached raw source so disabling the feature gives the user back
            // the original (markered) text instead of a stripped view.
            for (const cmt of doc.querySelectorAll(
                    "annotation-row .comment[data-wv-raw]")) {
                const raw = cmt.getAttribute("data-wv-raw") || "";
                while (cmt.firstChild) cmt.removeChild(cmt.firstChild);
                cmt.appendChild(doc.createTextNode(raw));
                cmt.removeAttribute("data-wv-raw");
                cmt.removeAttribute("data-wv-source");
            }
            for (const btn of doc.querySelectorAll(
                    "annotation-row .wv-btn-pane")) {
                btn.remove();
            }
            // Related-box label rendering: replace decorated labels
            // with a flat textNode of the same text.
            for (const label of doc.querySelectorAll(
                    "related-box .body .row .label[data-wv-related-rendered]")) {
                const t = label.dataset.wvRelatedRendered || label.textContent || "";
                while (label.firstChild) label.removeChild(label.firstChild);
                label.appendChild(doc.createTextNode(t));
                delete label.dataset.wvRelatedRendered;
            }
        } catch(e) { Zotero.debug("[Weavero] _stripRightPane: " + e); }
    }

    /** Re-inject sidebar 🔗 buttons on existing annotation rows whose
     *  comments contain URLs. Mirrors what _sidebarHandler does on render,
     *  but we walk the DOM ourselves because the Reader event has already
     *  fired for every visible row by the time the user toggles the pref. */
    _reinjectSidebarButtons(outerDoc, reader) {
        if (!outerDoc || !reader || !reader._item) return;
        try { this._ensureReaderOuterStyles(outerDoc); } catch(e) {}
        // Resolve the outer-iframe slot to inject into. Tried in priority
        // order; first match wins. The slot is typically a `.head`/
        // `<header>` end-area, sibling to the React `.custom-sections`
        // div where event-driven appends land.
        const findSlot = (row) =>
               row.querySelector(".head .end")
            || row.querySelector("header .end")
            || row.querySelector(".head .menu")
            || row.querySelector("header .menu")
            || row.querySelector(".head")
            || row.querySelector("header")
            || row;
        let addedComment = 0, addedRel = 0;
        const rows = outerDoc.querySelectorAll(".annotation-row, .annotation");
        for (const row of rows) {
            const key = this._findAnnotationKey(row, reader);
            const lib = this.libraryIDFromReader(reader);

            // Capture both icons up-front. The event-driven path
            // (`_sidebarHandler`) places them inside
            // `.custom-sections > .section > .wv-icon-group`; the
            // re-inject path (this function) historically placed them
            // directly in `.end`. To keep the visual order
            // [comment, relations, kebab] regardless of which level
            // each icon happens to live at, we use the OTHER icon as
            // the insertion reference rather than the slot's
            // lastElementChild. That way new buttons land as siblings
            // of any pre-existing icon.
            let existingBtn = row.querySelector(
                "." + BTN_SIDEBAR_CLASS + ":not(.wv-btn-relations)");
            let existingRel = row.querySelector(".wv-btn-relations");
            const comment = key ? this.getModelComment(lib, key) : "";
            const wantsComment = !!key
                && this._iconWantedFor(comment)
                && this._iconAddsValueBeyondInline(comment);
            const ann = this._getAnnotationItem(lib, key);
            const wantsRel = !!ann
                && this._getAnnotationRelatedItems(ann).length > 0;

            // ---- Comment icon -------------------------------------------
            if (!wantsComment) {
                existingBtn?.remove();
                existingBtn = null;
            } else if (!existingBtn) {
                const target = findSlot(row);
                const btn = outerDoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                btn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS;
                this._applyIconState(btn, comment);
                const cmt = comment;
                btn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(btn);
                    this.openCommentPopup(cmt, {
                        anchorNode: btn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a relations button is already present, insert
                // BEFORE it (within its parent) so the order stays
                // [comment, relations]. Otherwise fall back to
                // insert-before-kebab in the slot.
                if (existingRel && existingRel.parentNode) {
                    existingRel.parentNode.insertBefore(btn, existingRel);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(btn, last);
                    else      target.appendChild(btn);
                }
                existingBtn = btn;
                addedComment++;
            }

            // ---- Relations icon -----------------------------------------
            // Independent of comment content. Decision: present iff the
            // annotation has any related items right now. Also
            // self-heals when the last relation is removed (icon goes
            // away) or the first is added (icon appears).
            if (!wantsRel) {
                existingRel?.remove();
                existingRel = null;
            } else if (!existingRel) {
                const target = findSlot(row);
                const relBtn = outerDoc.createElementNS(
                    "http://www.w3.org/1999/xhtml", "button");
                relBtn.className = BTN_CLASS + " " + BTN_SIDEBAR_CLASS
                    + " wv-btn-relations";
                const count = this._getAnnotationRelatedItems(ann).length;
                relBtn.title = count + " Related";
                relBtn.appendChild(this._makeRelationsSvg(outerDoc));
                relBtn.addEventListener("click", e => {
                    e.stopPropagation(); e.preventDefault();
                    const sc = this._screenCoords(relBtn);
                    this.openRelationsPopup(ann, {
                        anchorNode: relBtn,
                        ...(sc ? { anchorScreen: sc } : {}),
                    });
                });
                // If a comment button is present (or was just added
                // above), place relations immediately AFTER it in the
                // same parent — guarantees [comment, relations]. The
                // `existingBtn` variable was updated when the comment
                // block inserted a fresh one, so this branch sees the
                // up-to-date state. Otherwise insert-before-kebab.
                if (existingBtn && existingBtn.parentNode) {
                    existingBtn.parentNode.insertBefore(
                        relBtn, existingBtn.nextSibling);
                } else {
                    const last = target.lastElementChild;
                    if (last) target.insertBefore(relBtn, last);
                    else      target.appendChild(relBtn);
                }
                addedRel++;
            }
        }
        if (addedComment || addedRel) {
            this._dbg("[Weavero] sidebar reinject: comment=" + addedComment
                + " relations=" + addedRel);
        }
    }

    /** Convenience wrapper: re-decorate every open reader's sidebar.
     *  Called from the item-modify notifier (relations changes don't
     *  flow through the reader's React annotation prop, so the
     *  renderSidebarAnnotationHeader event won't re-fire — we have to
     *  drive the refresh ourselves) and from `onMainWindowLoad` /
     *  `init` to cover already-rendered rows after a plugin restart. */
    _reinjectAllSidebars() {
        if (!this._getEnableReaderSidebar()) return;
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (idoc) this._reinjectSidebarButtons(idoc, reader);
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _reinjectAllSidebars err: " + e.message);
        }
    }

    /** Strip URL spans from sidebar comments + remove sidebar 🔗 buttons.
     *  If `idoc` is omitted, strips across every open reader. */
    _stripReaderSidebar(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripReaderSidebar(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            // Sidebar URL spans live inside .annotation-row / .annotation
            // wrappers; we exclude .annotation-popup so the in-PDF popup's
            // own spans aren't yanked away from underneath that surface.
            const sels = [
                ".annotation-row .comment .wv-url-span",
                ".annotation-row .body .wv-url-span",
                ".annotation .comment .wv-url-span",
            ];
            for (const sel of sels) {
                for (const span of idoc.querySelectorAll(sel)) {
                    if (span.closest(".annotation-popup")) continue;
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
            }
            // Tear down preview-panel DOM completely: remove the .wv-md-preview
            // overlays, drop the wv-comment-preview/wv-editing classes from
            // each .comment, so the raw .content becomes visible again. Also
            // unwrap any .wv-md-* spans so the rendered formatting reverts.
            for (const cmt of idoc.querySelectorAll(
                    ".annotation-row .comment, .annotation .comment")) {
                if (cmt.closest(".annotation-popup")) continue;
                for (const p of cmt.querySelectorAll(".wv-md-preview")) p.remove();
                cmt.classList.remove("wv-comment-preview");
                cmt.classList.remove("wv-editing");
                // Clear the rebuild rate-limit timestamp so the next
                // _renderPreviewPanel call after a pref toggle can run
                // immediately (the rate limit is only a loop-breaker —
                // a deliberate user-driven rebuild shouldn't have to
                // wait it out).
                cmt.removeAttribute("data-wv-last-rebuild");
            }
            for (const span of idoc.querySelectorAll(
                    ".wv-md-bold, .wv-md-italic, .wv-md-strike, .wv-md-code")) {
                if (span.closest(".annotation-popup")) continue;
                span.replaceWith(idoc.createTextNode(span.textContent || ""));
            }
            for (const btn of idoc.querySelectorAll("." + BTN_SIDEBAR_CLASS)) {
                btn.remove();
            }
        } catch(e) { Zotero.debug("[Weavero] _stripReaderSidebar: " + e); }
    }

    /** Strip in-PDF popup decoration + marker badges + text-annotation
     *  buttons. If `idoc` is omitted, strips across every open reader. */
    _stripPdfView(idoc) {
        if (!idoc) {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    if (iwin && iwin.document) this._stripPdfView(iwin.document);
                } catch(e) {}
            }
            return;
        }
        try {
            for (const b of idoc.querySelectorAll(".wv-marker-badge")) b.remove();
            for (const b of idoc.querySelectorAll(".wv-text-annotation-btn")) b.remove();
            for (const popup of idoc.querySelectorAll(".annotation-popup")) {
                for (const span of popup.querySelectorAll(".wv-url-span")) {
                    span.replaceWith(idoc.createTextNode(span.textContent || ""));
                }
                for (const btn of popup.querySelectorAll("." + BTN_POPUP_CLASS)) {
                    btn.remove();
                }
            }
        } catch(e) { Zotero.debug("[Weavero] _stripPdfView: " + e); }
    }

    /** Apply a per-surface pref change at runtime — re-runs the surface's
     *  entry point, which now strips or rebuilds based on the new pref. */
    _applySurfacePref(surface) {
        Zotero.debug("[Weavero] _applySurfacePref: " + surface);
        try {
            if (surface === "itemsList") {
                this._markCellLinks();
                return;
            }
            if (surface === "rightPane") {
                this._scanPaneRows();
                return;
            }
            if (surface === "notes") {
                // Three sub-surfaces share one toggle:
                //   1. <note-row>       — items-tree note rows
                //   2. <notes-box>      — right-pane Notes section on a
                //                         parent item
                //   3. <note-editor>    — the contenteditable iframe
                //                         in both the right pane and
                //                         the pop-out note window
                try { this._processNoteRows(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteRows err: " + e); }
                try { this._processNotesBoxes(); }
                catch(e) { Zotero.debug("[Weavero] _processNotesBoxes err: " + e); }
                try { this._processNoteEditors(); }
                catch(e) { Zotero.debug("[Weavero] _processNoteEditors err: " + e); }
                return;
            }
            if (surface !== "readerSidebar" && surface !== "readerView") return;
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                // Outer reader iframe — sidebar list + the in-document popup
                // (`.annotation-popup`) live here.
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                const outerDoc = iwin && iwin.document;
                if (outerDoc) {
                    if (surface === "readerSidebar") {
                        this._processReaderSidebar(outerDoc);
                        // renderSidebarAnnotationHeader only fires on row
                        // re-render, so a pref-flip alone won't restore the
                        // sidebar 🔗 buttons. Re-inject manually.
                        if (this._getEnableReaderSidebar()) {
                            try { this._reinjectSidebarButtons(outerDoc, reader); }
                            catch(e) { Zotero.debug("[Weavero] sidebar reinject err: " + e); }
                        }
                    }
                    if (surface === "readerView") {
                        for (const popup of outerDoc.querySelectorAll(".annotation-popup")) {
                            this._injectIconIntoPopup(popup, reader);
                        }
                    }
                }
                if (surface === "readerView") {
                    // Inner viewer iframe — marker badges and text-annotation
                    // buttons live here. We cache the doc when our inner
                    // observer wires up; if that hasn't run yet, fall back
                    // to walking the outer doc's iframes for viewer.html.
                    let innerDoc = null;
                    try {
                        const cached = this._readerObservers
                            && this._readerObservers.get(reader);
                        innerDoc = cached && cached.innerDoc;
                    } catch(e) {}
                    if (!innerDoc && outerDoc) {
                        for (const f of outerDoc.querySelectorAll("iframe")) {
                            try {
                                const cd = f.contentDocument;
                                if (cd && (cd.URL || "").includes("viewer.html")) {
                                    innerDoc = cd;
                                    break;
                                }
                            } catch(e) {}
                        }
                    }
                    if (innerDoc) {
                        this._processTextAnnotations(innerDoc);
                        this._processNoteAnnotationOverlays(innerDoc, reader);
                    }
                }
                // Each entry point above gates on its own getter and strips
                // on disabled, so this rescan handles both directions.
            }
        } catch(e) { Zotero.debug("[Weavero] _applySurfacePref err: " + e); }
    }

    /** Apply the inline-vs-icons-only mode change at runtime.
     *  - Toggles :root.wv-icons-only so the tree icon is always visible in
     *    Mode 2 (the only access path to URLs there).
     *  - Wipes existing per-cell state in the items tree so the next mark
     *    pass rebuilds in the new mode (with or without coloured spans).
     *  - Strips any leftover .wv-url-span elements elsewhere so the switch
     *    feels live; right-pane / sidebar will re-mark on the next scan
     *    according to the new mode. */
    _applyInlineLinksPref(inline) {
        Zotero.debug("[Weavero] _applyInlineLinksPref: inline=" + inline);
        try {
            const win = Zotero.getMainWindow();
            const doc = win.document;
            const root = doc.documentElement;
            root.classList.toggle("wv-icons-only", !inline);

            // Items tree: restore each cell to its raw text so the next
            // _markCellLinks pass rebuilds it in the new mode. Removing the
            // .wv-text-wrap directly would wipe the cell content (the wrap
            // holds the text), leaving _markCellLinks nothing to rebuild.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s\u00A0]*🔗\s*$/, "")
                              .trim();
                }
                // Flatten back to plain text — also drops the .wv-tree-icon
                // and any leftover .wv-url-span children.
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
                // Reset the rate-limit timestamp so the upcoming rebuild
                // can run regardless of how recent the previous one was.
                cell.removeAttribute("data-wv-last-rebuild");
            }
            this._markCellLinks();
            // Zotero's items-tree React reconciliation can strip our spans
            // after our rebuild. Schedule retries that clear the per-cell
            // rate-limit attribute and re-run _markCellLinks. The first
            // retry runs at the next animation frame (~16 ms) — early
            // enough that the user never sees plain text — and a backup
            // retry at 150 ms catches reconciliations that happen later
            // than that. The rate-limit on _markCellLinks (which we just
            // cleared per-cell) means these retries can't induce a loop:
            // each retry rebuilds at most once, then is blocked again
            // until the next retry's clear.
            const tryRecover = () => {
                for (const cell of doc.querySelectorAll(
                        ".annotation-row.tight .cell.annotation-comment")) {
                    cell.removeAttribute("data-wv-last-rebuild");
                }
                try { this._markCellLinks(); } catch(e) {}
            };
            if (win.requestAnimationFrame) {
                win.requestAnimationFrame(tryRecover);
            }
            win.setTimeout(tryRecover, 150);

            // Right pane / items-tree-note rows: unwrap any leftover URL spans
            // back into plain text. Marking will re-add them only if Mode 1.
            //
            // CRITICAL: stripping the span invalidates the cache validation
            // markers (data-wv-source / data-wv-rendered / data-wv-last-rebuild,
            // _processRelatedBoxes' data-wv-related-rendered) — without
            // clearing them, the next pass thinks "already rendered" and
            // skips the rebuild that's needed to recreate the span we
            // just removed.
            //
            // BUT — `data-wv-raw` is not a cache marker; it's the SOURCE
            // text (the raw markdown). For text-annotation rows the only
            // copy of the original source is `data-wv-raw` on the
            // .cell-text — `el.textContent` is the stripped form
            // ("bold ..." not "**bold** ..."). Clearing data-wv-raw here
            // would force the next rebuild to read textContent and
            // permanently lose the markdown markers, leaving bold
            // unrendered after a disable/re-enable cycle.
            for (const span of doc.querySelectorAll(".wv-url-span")) {
                let p = span.parentNode;
                while (p && p.nodeType === 1) {
                    if (p.hasAttribute("data-wv-source")
                        || p.hasAttribute("data-wv-rendered")
                        || p.hasAttribute("data-wv-last-rebuild")
                        || (p.dataset && p.dataset.wvRelatedRendered)) {
                        p.removeAttribute("data-wv-source");
                        p.removeAttribute("data-wv-rendered");
                        p.removeAttribute("data-wv-last-rebuild");
                        if (p.dataset) delete p.dataset.wvRelatedRendered;
                        // NOTE: data-wv-raw deliberately NOT cleared.
                        break;
                    }
                    p = p.parentNode;
                }
                span.replaceWith(doc.createTextNode(span.textContent || ""));
            }
            // Trigger a fresh pane scan so right-pane rows re-mark per the
            // new mode (no-op in Mode 2 since _markTextLinks skips early).
            try { this._scanPaneRows(); } catch(e) {}

            // Reader iframe(s): unwrap leftover spans, then explicitly re-run
            // the sidebar marker + popup icon pass for the new mode. Relying
            // on the iframe mutation observer alone fails when Mode 2 → Mode 1
            // because there's nothing to mutate (no spans to strip), so no
            // observer callback fires and the sidebar stays plain text.
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;
                    // Unwrap any leftover URL spans from when we used to mark
                    // .content directly. SKIP spans inside .wv-md-preview —
                    // those are part of our preview-panel DOM, owned by
                    // _renderPreviewPanel; tearing them down here without
                    // also invalidating the preview's data-source cache
                    // would leave them un-restored on the next pass (the
                    // cache hit makes _renderPreviewPanel skip the rebuild).
                    for (const span of idoc.querySelectorAll(".wv-url-span")) {
                        if (span.closest(".wv-md-preview")) continue;
                        span.replaceWith(idoc.createTextNode(span.textContent || ""));
                    }
                    // Re-mark per the new mode (idempotent in Mode 1, no-op
                    // in Mode 2 since _markTextLinks returns early).
                    this._processReaderSidebar(idoc);
                    // Mode 1 ↔ Mode 2 also flips _iconAddsValueBeyondInline
                    // for every comment, so the 🔗 sidebar buttons must be
                    // re-evaluated. The sidebar handler only fires on row
                    // render (not on pref change), so without this the
                    // buttons stay in whatever state Mode 1 left them.
                    if (this._getEnableReaderSidebar()) {
                        try { this._reinjectSidebarButtons(idoc, reader); }
                        catch(e) { Zotero.debug(
                            "[Weavero] sidebar reinject (inline-links) err: " + e); }
                    }
                    // Re-evaluate any open in-PDF popups too.
                    for (const popup of idoc.querySelectorAll(".annotation-popup")) {
                        this._injectIconIntoPopup(popup, reader);
                    }
                } catch(e) {}
            }
        } catch(e) {
            Zotero.debug("[Weavero] _applyInlineLinksPref error: " + e);
        }
    }

    /** Previously toggled :root.wv-md-disabled to drive M-icon
     *  visibility. The M-icon decoration was removed in v0.3.130; the
     *  pref now only affects whether markdown is rendered inline.
     *  Kept as a no-op so call sites don't need refactoring; safe to
     *  delete in a future cleanup. */
    _applyCommentMarkdownPref() {}

    _applyTreeIconPref(show) {
        Zotero.debug("[Weavero] _applyTreeIconPref called: " + show);
        try {
            const win = Zotero.getMainWindow();
            const el = win.document.documentElement;
            el.classList.toggle("wv-show-tree-icon", show);
            this._dbg("[Weavero] wv-show-tree-icon class set to: " + show
                + " (classList has it: " + el.classList.contains("wv-show-tree-icon") + ")");
            this._dbg("[Weavero] documentElement diag: tagName=" + el.tagName
                + " localName=" + el.localName
                + " namespaceURI=" + el.namespaceURI);
            if (show) {
                // Immediate stamp pass
                this._markCellLinks();
                // Delayed stamp after tree re-renders settle (PDF open / item-select re-renders follow pref change)
                win.setTimeout(() => {
                    this._dbg("[Weavero] _applyTreeIconPref delayed _markCellLinks firing");
                    this._markCellLinks();
                }, 250);
            }
        } catch(e) { Zotero.debug("[Weavero] _applyTreeIconPref error: " + e); }
    }

    _registerPrefPane() {
        try {
            // Theme-aware icon: pick the dark variant if Zotero's
            // UI is currently dark. Theme is detected once at
            // registration; switching theme mid-session won't swap
            // the pref-pane icon (Zotero's PreferencePanes API has
            // no live-update path), but startup is the dominant
            // case anyway.
            const theme = this._detectUIDark() ? "dark" : "light";
            Zotero.PreferencePanes.register({
                pluginID : "weavero@mjthoraval",
                src      : _rootURI + "prefs.html",
                scripts  : [_rootURI + "prefs.js"],
                label    : "Weavero",
                // Plugin icon bundled under icons/ at the XPI root.
                // The pref-pane sidebar renders this around 16–20 px,
                // so pick the smallest bundled size; bigger would
                // just downscale and look softer.
                image    : _rootURI + "icons/icon-" + theme + "-32.png",
            });
        } catch(e) {
            Zotero.debug("[Weavero] _registerPrefPane error: " + e);
        }
    }

    // ---- Init / Destroy ---------------------------------------------------

    async init() {
        // 0. Register default pref values so Zotero's pref-binding system can find them
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.showTreeIcon", false);
        } catch(e) {}
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.inlineLinks", true);
        } catch(e) {}
        // Per-surface enable prefs — default to true so the four core
        // surfaces are decorated out of the box. (Notes default OFF —
        // see below.)
        for (const k of ["enableItemsList", "enableRightPane",
                         "enableReaderSidebar", "enableReaderView"]) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + k, true);
            } catch(e) {}
        }
        // Notes default to OFF — it's a new surface (post-v0.3.42) and
        // we don't want to surprise existing users with new clickable
        // spans / formatting on notes they've already curated.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableNotes", false);
        } catch(e) {}
        // Migration: if the old enablePdfReader pref was explicitly set
        // (rare — user disabled the reader integration), mirror its value
        // into the new sidebar+view keys the first time we run with them
        // missing. The old pref then becomes inert (nothing reads it).
        try {
            const oldVal = Zotero.Prefs.get("weavero.enablePdfReader");
            if (oldVal !== undefined) {
                const sb = Zotero.Prefs.get("weavero.enableReaderSidebar");
                const vw = Zotero.Prefs.get("weavero.enableReaderView");
                if (sb === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderSidebar", !!oldVal);
                }
                if (vw === undefined) {
                    Zotero.Prefs.set("weavero.enableReaderView", !!oldVal);
                }
            }
        } catch(e) {
            Zotero.debug("[Weavero] enablePdfReader migration err: " + e);
        }
        // Inline-mode sub-toggles (URLs / Markdown) and Icon & Popup-mode
        // sub-toggles (URLs / Markdown / App links). Default to true so
        // both modes show full content affordances out of the box. The Icon-
        // mode sub-toggles let users pick which content types trigger the
        // chain icon when comments stay plain text in the items tree.
        for (const k of ["enableInlineUrls", "enableCommentMarkdown",
                         "enableReaderViewIcons",
                         "enableIconUrls", "enableIconMarkdown",
                         "enableIconAppLinks"]) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + k, true);
            } catch(e) {}
        }
        // Diagnostic / advanced toggles default to FALSE.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.debug", false);
        } catch(e) {}
        // App links master toggle — defaults to FALSE so the per-scheme
        // ticks below have no effect until the user explicitly opts in.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableAppLinks", false);
        } catch(e) {}
        // Skip-confirmation toggle — defaults to FALSE so Firefox's
        // safety prompt stays in place unless the user opts out.
        try {
            Services.prefs.getDefaultBranch("extensions.zotero.")
                .setBoolPref("weavero.enableAppLinksSkipConfirm", false);
        } catch(e) {}
        // Extra URL schemes default to FALSE — opt-in. Avoids
        // surprising the user with new clickable spans on existing
        // comments after an update.
        for (const def of URL_SCHEMES) {
            try {
                Services.prefs.getDefaultBranch("extensions.zotero.")
                    .setBoolPref("weavero." + def.pref, false);
            } catch(e) {}
        }

        // 1. CSS — and clear any leftover popup panel from a previous
        // plugin instance. Same rationale as injectStyles' defensive
        // remove-then-add: Zotero's in-place plugin upgrade flow doesn't
        // reliably tear down DOM artifacts the previous version added,
        // so init must be defensive about cleaning before adding fresh.
        try {
            const oldPanel = Zotero.getMainWindow().document.getElementById(PANEL_ID);
            if (oldPanel) oldPanel.remove();
        } catch(e) {}
        this.injectStyles();
        // Plugin-upgrade recovery: clear DOM markers left behind by
        // a previous plugin instance. Without this, the new code
        // sees `data-wv-related-rendered` / `data-wv-ctx-wired` etc.
        // on related-box rows and skips reprocessing — leaving the
        // rendered DOM (and its event handlers) tied to the dead
        // old closures. Runs from init() (covers plugin enable /
        // upgrade cases where onMainWindowLoad doesn't refire) and
        // also from onMainWindowLoad below (covers new windows).
        try {
            const win = Zotero.getMainWindow();
            this._resetStaleMarkers(win && win.document);
        } catch(e) {}

        // 2. Reader event listeners
        Zotero.Reader.registerEventListener(
            "renderSidebarAnnotationHeader", this._sidebarHandler, "weavero");
        Zotero.Reader.registerEventListener(
            "createAnnotationContextMenu", this._contextHandler, "weavero");

        // 3. Notifier: new reader tabs
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: async (event, type) => {
                if (type !== "tab" || event !== "add") return;
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 250));
                    for (const reader of Zotero.Reader._readers || [])
                        if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
                }
            }
        }, ["tab"], "weavero-tab"));

        // 3b. Notifier: annotation lifecycle (delete/trash/modify).
        // Backstop for the proactive Delete/Backspace handler — the
        // notifier fires only after Zotero's DB transaction + queue
        // commit (often ~100–300 ms after the keystroke), so this
        // path runs second. We still use it because it's the only
        // signal that catches non-keyboard deletions (right-click →
        // Delete, undo, sync). Keys are stamped into
        // _recentlyDeletedKeys so the inner observer's debounced
        // overlay scan can't recreate badges while Zotero's in-memory
        // cache is still settling.
        this._notifierIDs.push(Zotero.Notifier.registerObserver({
            notify: (event, type, ids, extraData) => {
                if (type !== "item") return;
                if (event !== "delete" && event !== "trash"
                    && event !== "modify" && event !== "add") return;

                // Pull annotation keys from extraData (the items are
                // already gone from the DB so id-based lookup fails).
                const deletedKeys = new Set();
                if (event === "delete" || event === "trash") {
                    if (extraData && typeof extraData === "object") {
                        for (const id of ids || []) {
                            const meta = extraData[id];
                            if (meta && meta.key) deletedKeys.add(meta.key);
                        }
                    }
                }

                // Track the most-recently-touched annotation per
                // reader. The proactive Delete-key handler uses this
                // when `selectedAnnotationIDs` returns a stale key
                // (the bug we're working around: after a delete,
                // creating a fresh annotation, then pressing Delete,
                // the reader's selectedAnnotationIDs still pointed at
                // the previous, deleted key — so the proactive path
                // tried to remove a badge that was already gone, and
                // the slow notifier path was the only thing that
                // could clean up the new annotation's badge).
                if (event === "add" || event === "modify") {
                    try {
                        for (const id of ids || []) {
                            let item;
                            try { item = Zotero.Items.get(id); } catch (e2) { continue; }
                            if (!item || !item.isAnnotation || !item.isAnnotation()) continue;
                            const parentID = item.parentItemID;
                            const key = item.key;
                            if (!parentID || !key) continue;
                            for (const reader of Zotero.Reader._readers || []) {
                                if (reader._item && reader._item.id === parentID) {
                                    const data = this._readerObservers.get(reader);
                                    if (data) {
                                        data.lastTouchedAnnotationKey = key;
                                        this._dbg("[Weavero] lastTouched: key="
                                            + key + " event=" + event);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] lastTouched track error: " + e);
                    }
                }

                // Only the delete/trash/modify branches do reader-
                // doc work below; 'add' alone just primes the
                // lastTouched tracker and exits.
                if (event === "add") return;

                for (const reader of Zotero.Reader._readers || []) {
                    const data = this._readerObservers.get(reader);
                    const innerDoc = data && data.innerDoc;
                    if (!innerDoc) continue;

                    // Stamp deleted keys so the debounced overlay scan
                    // skips recreating their badges. Cleared again by
                    // _processNoteAnnotationOverlays once getAnnotations()
                    // stops returning the key (cache caught up), or
                    // after 60 s as a safety net.
                    if (deletedKeys.size) {
                        const now = Date.now();
                        for (const k of deletedKeys) {
                            this._recentlyDeletedKeys.set(k, now);
                        }
                    }

                    // Direct DOM removal by key — both inner PDF.js
                    // and outer reader iframe (badges may live in
                    // either depending on Zotero's layout).
                    let removed = 0;
                    if (deletedKeys.size) {
                        let outerDoc = null;
                        try {
                            const iwin = reader._iframeWindow
                                || (reader._iframe && reader._iframe.contentWindow);
                            if (iwin && iwin.document) outerDoc = iwin.document;
                        } catch (e) {}
                        for (const doc of [innerDoc, outerDoc]) {
                            if (!doc) continue;
                            for (const k of deletedKeys) {
                                for (const badge of doc.querySelectorAll(
                                    ".wv-marker-badge[data-wv-for=\"" + k + "\"]")) {
                                    badge.remove();
                                    removed++;
                                }
                            }
                        }
                        if (removed) {
                            this._dbg("[Weavero] notifier "
                                + event + " removed " + removed
                                + " badge(s) keys="
                                + JSON.stringify([...deletedKeys]));
                        }
                    }

                    // Refresh text-annotation buttons. For delete/
                    // trash skip the full overlay scan — getAnnotations()
                    // may still return the just-deleted annotation
                    // (cache stale), and the inner observer will run
                    // the scan ~100 ms later anyway, by which time the
                    // _recentlyDeletedKeys gate is in place.
                    try { this._processTextAnnotations(innerDoc); }
                    catch (e) { Zotero.debug("[Weavero] notifier text-ann scan: " + e); }
                    if (event !== "delete" && event !== "trash") {
                        try { this._processNoteAnnotationOverlays(innerDoc, reader); }
                        catch (e) { Zotero.debug("[Weavero] notifier overlay scan: " + e); }
                    }
                }

                // Refresh relations icons across both surfaces (reader
                // sidebar + right pane). Relations are stored as
                // `dc:relation` triples on items and don't flow into
                // the reader's React annotation prop or trigger a
                // right-pane row re-render — so neither
                // renderSidebarAnnotationHeader nor the right-pane
                // mutation observer catches a relation add/remove.
                // We drive the refresh from the notifier instead:
                // `addRelatedItem` / `removeRelatedItem` both `save()`
                // the involved items, which fires "modify".
                //
                // Bounded by visible rows (typically <50 per surface)
                // and gated on each surface pref, so this is cheap to
                // run on every item modification.
                if (event === "modify" || event === "add"
                    || event === "delete" || event === "trash") {
                    try { this._reinjectAllSidebars(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier sidebar reinject: " + e); }
                    try { this._scanPaneRows(); }
                    catch (e) { Zotero.debug(
                        "[Weavero] notifier pane reinject: " + e); }
                }
            }
        }, ["item"], "weavero-item"));

        // 4. Polling fallback for readers
        this._pollInterval = setInterval(() => {
            for (const reader of Zotero.Reader._readers || [])
                if (!this._readerObservers.has(reader)) this._setupReaderObserver(reader);
        }, 2000);

        // 5. Readers already open at load time
        for (const reader of Zotero.Reader._readers || [])
            await this._setupReaderObserver(reader);

        // 6. Tree: event delegation (no DOM injection, no blink)
        this._setupTreeClickDelegate();

        // 6b. Resolve the icon URLs used by `decorateContextMenu`. The
        // reader iframe is content (loaded from `resource://zotero/`),
        // which Mozilla's CheckLoadURI policy forbids from linking to
        // `jar:file:///…/weavero.xpi!/icon-16.png` — `<img src>` set
        // to the raw `_rootURI + …` path triggers a "may not load or
        // link to" Security Error and renders the broken-image glyph.
        // Workaround: fetch the icon once at startup and embed it as
        // a `data:image/png;base64,…` URL, which is allowed inside
        // content. Cache BOTH light and dark variants on the instance
        // so we can swap them based on theme without re-encoding.
        // `decorateContextMenu` reads `_menuItemIconURL` (a getter
        // below) to pick the right variant at use time.
        const encodeIcon = async (path) => {
            try {
                const resp = await fetch(_rootURI + path);
                const buf = await resp.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let bin = "";
                for (let i = 0; i < bytes.length; i++) {
                    bin += String.fromCharCode(bytes[i]);
                }
                return "data:image/png;base64," + btoa(bin);
            } catch(e) {
                Zotero.debug("[Weavero] menu icon encode err ("
                    + path + "): " + e);
                return "";
            }
        };
        this._menuItemIconURLLight = await encodeIcon("icons/icon-light-16.png");
        this._menuItemIconURLDark  = await encodeIcon("icons/icon-dark-16.png");
        // Back-compat alias: callers that read `_menuItemIconURL`
        // directly (rather than the getter below) get the
        // theme-appropriate URL via the getter property.
        Object.defineProperty(this, "_menuItemIconURL", {
            get: () => this._detectUIDark()
                ? this._menuItemIconURLDark
                : this._menuItemIconURLLight,
            configurable: true,
        });
        // (Chain icon for the iframe React menu is rendered as inline
        // <svg> by `decorateContextMenu` via `_makeRelationsSvg`, which
        // uses a baked amber fill via prefers-color-scheme — see
        // `_injectReaderStyles`.)
        // For the chrome XUL items-tree menu, bake amber-fill data URLs
        // (one per theme) so the chain icon matches the sidebar's
        // `.wv-btn-relations` color regardless of theme. The system
        // chrome://...related.svg uses `context-fill` which resolves
        // to the menu's neutral icon color, not amber.
        try {
            this._relationsIconURLLight = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#7a4a00"));
            this._relationsIconURLDark = "data:image/svg+xml;base64,"
                + btoa(SCHEME_SVG_TEMPLATE.replace("__FILL__", "#ffb84d"));
        } catch (e) {
            Zotero.debug("[Weavero] relations icon encode err: " + e);
            this._relationsIconURLLight = "";
            this._relationsIconURLDark  = "";
        }

        // 7. Right pane
        this._setupPaneObserver();

        // 7b. Items-tree right-click menu — adds "Add related item…"
        // when the right-clicked selection contains annotation(s).
        this._setupItemsListContextMenu();
        // 7b-bis. Collections-tree right-click menu — adds
        // "Copy Collection Link" on collection rows.
        this._setupCollectionsContextMenu();

        // 7c. Pop-out note windows — main-window pane observer doesn't
        // see them, so wire a Window Mediator listener that catches
        // note.xhtml windows as they open.
        this._setupNoteWindowListener();
        // Initial pass over any note surface that's already mounted
        // when the plugin starts (e.g. user enabled the toggle, then
        // restarted Zotero with a note already selected).
        if (this._getEnableNotes()) {
            try { this._processNoteRows(); }
            catch(e) { Zotero.debug("[Weavero] init note-rows err: " + e); }
            try { this._processNotesBoxes(); }
            catch(e) { Zotero.debug("[Weavero] init notes-box err: " + e); }
            try { this._processNoteEditors(); }
            catch(e) { Zotero.debug("[Weavero] init note-editors err: " + e); }
        }

        // 8. Preferences pane + apply saved icon pref
        this._registerPrefPane();
        // Items-list "Related" column.
        this._registerItemTreeColumns();
        this._applyTreeIconPref(this._getShowTreeIcon());
        this._applyInlineLinksPref(this._getInlineLinks());
        this._applyCommentMarkdownPref();
        this._applyUIThemeClass();
        // Sync per-scheme `network.protocol-handler.warn-external.<x>`
        // prefs with the user's "Open without confirmation" choice.
        // Idempotent — covers a Zotero restart with the toggle still on.
        try { this._applyAppLinkConfirmPref(); }
        catch(e) { Zotero.debug("[Weavero] init confirm sync err: " + e); }
        // React to OS-driven theme changes by listening on the main
        // window's prefers-color-scheme media query. Zotero's
        // theme-detection isn't fully exposed, but UI bg luma is
        // what _detectUIDark samples — and a media-query change is
        // a strong signal that bg may have flipped, so a re-detect
        // is appropriate.
        try {
            const win = Zotero.getMainWindow();
            if (win && win.matchMedia) {
                this._uiThemeMq = win.matchMedia("(prefers-color-scheme: dark)");
                this._uiThemeMqHandler = () => this._applyUIThemeClass();
                if (typeof this._uiThemeMq.addEventListener === "function") {
                    this._uiThemeMq.addEventListener("change", this._uiThemeMqHandler);
                }
            }
            // Also watch the Zotero main window's documentElement for
            // attribute/class flips. Zotero's three theme settings
            // (System / Light / Dark in General → Appearance) toggle
            // an attribute on this node; the matchMedia listener
            // above only catches the System-mode case where a flip
            // is OS-driven. Without this observer, a direct setting
            // change between Light and Dark wouldn't fire any of our
            // hooks until the next reader open / window load.
            const win2 = Zotero.getMainWindow();
            const doc2 = win2 && win2.document;
            if (doc2 && doc2.documentElement && win2.MutationObserver) {
                this._uiThemeObserver = new win2.MutationObserver(() => {
                    try { this._applyUIThemeClass(); } catch (e) {}
                });
                this._uiThemeObserver.observe(doc2.documentElement, {
                    attributes: true,
                    attributeFilter: [
                        "class", "lwtheme", "lwthemetextcolor",
                        "theme", "data-theme",
                    ],
                });
            }
        } catch (e) {}

        // 9. Watch pref changes from Settings pane
        // Use root branch + broad match to diagnose what path Zotero actually writes
        try {
            this._prefBranch = Services.prefs.getBranch("");
            this._prefObserver = {
                observe: (_s, _t, data) => {
                    if (data.includes("weavero")) {
                        this._dbg("[Weavero] pref changed at path: " + data);
                    }
                    if (data === "extensions.zotero.weavero.showTreeIcon") {
                        this._applyTreeIconPref(this._getShowTreeIcon());
                    }
                    if (data === "extensions.zotero.weavero.inlineLinks") {
                        this._applyInlineLinksPref(this._getInlineLinks());
                    }
                    if (data === "extensions.zotero.weavero.enableItemsList") {
                        this._applySurfacePref("itemsList");
                    }
                    if (data === "extensions.zotero.weavero.enableRightPane") {
                        this._applySurfacePref("rightPane");
                    }
                    if (data === "extensions.zotero.weavero.enableNotes") {
                        // Toggling Notes off → strip decorated content
                        // back to plain text BEFORE the rescan (which
                        // would no-op since `_processNote*` early-return
                        // when the toggle is off). Toggling on → rescan
                        // re-decorates everything.
                        try {
                            if (!this._getEnableNotes()) this._stripNotes();
                        } catch(e) { Zotero.debug("[Weavero] strip-notes err: " + e); }
                        this._applySurfacePref("notes");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderSidebar") {
                        this._applySurfacePref("readerSidebar");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderView") {
                        this._applySurfacePref("readerView");
                    }
                    if (data === "extensions.zotero.weavero.enableReaderViewIcons") {
                        this._applySurfacePref("readerView");
                    }
                    // Content-type sub-prefs — Inline mode (enableInlineUrls /
                    // enableCommentMarkdown) and Icon & Popup mode (enableIcon*).
                    // Toggling any of these changes how comments render or
                    // whether the chain icon attaches on every surface, so
                    // rescan all four. The comment-md pref also drives
                    // :root.wv-md-disabled (gates M-icon visibility in the
                    // items list).
                    //
                    // Strip the right-pane and reader-sidebar spans /
                    // previews BEFORE re-scanning so any stale state
                    // (e.g. URL spans from a previous "URLs on" render)
                    // is cleared. The re-scan then rebuilds whatever the
                    // new prefs call for. Without this, URL-only comments
                    // retain their old spans because the early-return
                    // case in _renderPaneCommentInline can't safely strip
                    // (running on every observer fire risks an infinite
                    // loop during sidebar tear-down).
                    if (data === "extensions.zotero.weavero.enableInlineUrls"
                        || data === "extensions.zotero.weavero.enableCommentMarkdown"
                        || data === "extensions.zotero.weavero.enableIconUrls"
                        || data === "extensions.zotero.weavero.enableIconMarkdown"
                        || data === "extensions.zotero.weavero.enableIconAppLinks") {
                        if (data === "extensions.zotero.weavero.enableCommentMarkdown") {
                            this._applyCommentMarkdownPref();
                        }
                        try { this._stripRightPane(); } catch(e) {}
                        for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                            try {
                                const iwin = reader._iframeWindow
                                    || (reader._iframe && reader._iframe.contentWindow);
                                const idoc = iwin && iwin.document;
                                if (idoc) this._stripReaderSidebar(idoc);
                            } catch(e) {}
                        }
                        this._applySurfacePref("itemsList");
                        this._applySurfacePref("rightPane");
                        this._applySurfacePref("readerSidebar");
                        this._applySurfacePref("readerView");
                    }
                    // Skip-confirm toggle — sync warn-external prefs.
                    if (data === "extensions.zotero.weavero.enableAppLinksSkipConfirm") {
                        try { this._applyAppLinkConfirmPref(); }
                        catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
                    }
                    // Extra-scheme toggles — invalidate the cached
                    // URL_REGEX / URL_SCHEME_ALT, then strip and rescan
                    // every surface so newly-enabled schemes start
                    // rendering and newly-disabled ones flatten back to
                    // plain text. Same teardown sequence as the
                    // inline-toggle branch above.
                    // Also fires for the master `enableAppLinks` toggle
                    // since flipping it changes which schemes the regex
                    // includes.
                    if (/^extensions\.zotero\.weavero\.enable\w+Scheme$/.test(data)
                        || data === "extensions.zotero.weavero.enableAppLinks") {
                        // Re-apply warn-external prefs too, since the
                        // set of "enabled schemes that should skip
                        // confirmation" depends on this pref.
                        try { this._applyAppLinkConfirmPref(); }
                        catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
                        // Refresh note-editor stylesheets too — the
                        // app-link colour rules depend on enabled schemes.
                        try { this._refreshAllNoteEditorStyles(); }
                        catch(e) { Zotero.debug("[Weavero] note-css refresh err: " + e); }
                        this._urlRegexCache     = null;
                        this._urlSchemeAltCache = null;
                        try { this._stripRightPane(); } catch(e) {}
                        for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                            try {
                                const iwin = reader._iframeWindow
                                    || (reader._iframe && reader._iframe.contentWindow);
                                const idoc = iwin && iwin.document;
                                if (idoc) this._stripReaderSidebar(idoc);
                            } catch(e) {}
                        }
                        this._applySurfacePref("itemsList");
                        this._applySurfacePref("rightPane");
                        this._applySurfacePref("readerSidebar");
                        this._applySurfacePref("readerView");
                    }
                }
            };
            this._prefBranch.addObserver("", this._prefObserver, false);
            Zotero.debug("[Weavero] pref observer registered on root branch");
        } catch(e) { Zotero.debug("[Weavero] pref observer error: " + e); }

        Zotero.debug("[Weavero] initialized — showTreeIcon=" + this._getShowTreeIcon());
    }

    /** Called by the bootstrap shim when a fresh main window opens. The
     *  previous window's observers/handlers (if any) hold stale doc
     *  references — tear them down and re-attach to the live window.
     *  Called BEFORE init() too if Zotero opens the window before the
     *  plugin's init resolves; the teardown calls are no-op safe so this
     *  is idempotent. */
    onMainWindowLoad(_window) {
        try {
            this._teardownTreeClickDelegate();
            this._teardownItemsListContextMenu();
            this._teardownCollectionsContextMenu();
            this._paneObserver?.disconnect();
            this._paneObserver = null;
            this._treeMarkObserver?.disconnect();
            this._treeMarkObserver = null;
            // Plugin-upgrade recovery: clear any DOM markers the
            // OLD plugin instance left behind. Without this, the
            // new code sees `data-wv-related-rendered` /
            // `data-wv-ctx-wired` etc. on related-box rows and
            // skips reprocessing — leaving the rendered DOM
            // (and its event handlers) tied to the dead old
            // closures, which then no-op.
            try { this._resetStaleMarkers(_window && _window.document); }
            catch(e) {}
            // (Re-)inject the plugin stylesheet and clear any leftover
            // popup panel. On a Zotero startup, init() runs as part of
            // plugin startup BEFORE any main window has been created, so
            // its injectStyles() call silently throws (Zotero.getMainWindow()
            // returns null). Re-running it here, when a window is
            // guaranteed to exist, finally lands the CSS — without this,
            // the comment popup looks unstyled until the user disables
            // and re-enables the plugin. injectStyles' defensive
            // remove-then-add makes calling twice idempotent.
            try {
                const oldPanel = _window
                    && _window.document
                    && _window.document.getElementById(PANEL_ID);
                if (oldPanel) oldPanel.remove();
            } catch(e) {}
            this.injectStyles();
            // Re-attach to the now-live document.
            this._setupTreeClickDelegate();
            this._setupItemsListContextMenu();
            this._setupCollectionsContextMenu();
            this._setupPaneObserver();
            // Re-apply CSS-class state (these set classes on root.documentElement).
            this._applyTreeIconPref(this._getShowTreeIcon());
            this._applyInlineLinksPref(this._getInlineLinks());
            this._applyCommentMarkdownPref();
            this._applyUIThemeClass();
            // Refresh sidebar icons across any open readers. The
            // renderSidebarAnnotationHeader event won't re-fire for rows
            // that were already mounted before the plugin (re-)started,
            // so without this pass the relations + comment icons would
            // be missing on those rows until the user scrolls or the
            // annotation otherwise re-renders.
            try { this._reinjectAllSidebars(); } catch(e) {}
        } catch(e) {
            Zotero.debug("[Weavero] onMainWindowLoad init err: " + e);
        }
    }

    /** Called by the bootstrap shim when the main window closes. Disconnect
     *  observers eagerly so the next mutation in the dying doc doesn't go
     *  through dead refs. Lighter than destroy() — preferences observer,
     *  reader event listeners etc. survive across windows. */
    onMainWindowUnload(_window) {
        try {
            this._teardownTreeClickDelegate();
            this._teardownItemsListContextMenu();
            this._teardownCollectionsContextMenu();
            this._paneObserver?.disconnect();
            this._paneObserver = null;
            this._treeMarkObserver?.disconnect();
            this._treeMarkObserver = null;
        } catch(e) {
            Zotero.debug("[Weavero] onMainWindowUnload err: " + e);
        }
    }

    destroy() {
        // 1. Tear down listeners / observers / timers.
        if (this._prefObserver && this._prefBranch) {
            try { this._prefBranch.removeObserver("", this._prefObserver); } catch(e) {}
            this._prefObserver = null;
            this._prefBranch = null;
        }
        if (this._uiThemeMq && this._uiThemeMqHandler) {
            try {
                if (typeof this._uiThemeMq.removeEventListener === "function") {
                    this._uiThemeMq.removeEventListener("change", this._uiThemeMqHandler);
                }
            } catch (e) {}
            this._uiThemeMq = null;
            this._uiThemeMqHandler = null;
        }
        if (this._uiThemeObserver) {
            try { this._uiThemeObserver.disconnect(); } catch (e) {}
            this._uiThemeObserver = null;
        }

        try { Zotero.Reader.unregisterEventListener("renderSidebarAnnotationHeader", "weavero"); } catch(e) {}
        try { Zotero.Reader.unregisterEventListener("createAnnotationContextMenu", "weavero"); } catch(e) {}
        this._unregisterItemTreeColumns();

        for (const id of this._notifierIDs || []) {
            try { Zotero.Notifier.unregisterObserver(id); } catch(e) {}
        }
        this._notifierIDs = [];

        clearInterval(this._pollInterval); this._pollInterval = null;
        this._teardownTreeClickDelegate();
        this._teardownItemsListContextMenu();
        this._teardownCollectionsContextMenu();
        this._teardownNoteWindowListener();
        this._paneObserver?.disconnect(); this._paneObserver = null;

        // Clear any `network.protocol-handler.warn-external.<x>`
        // overrides we set so the user's profile doesn't carry our
        // pref churn after the plugin is removed. Only clears values
        // we recognise as ours (FALSE) — leaves any TRUE overrides
        // the user might have set themselves intact.
        try {
            for (const def of URL_SCHEMES) {
                const prefName = "network.protocol-handler.warn-external." + def.name;
                try {
                    if (Services.prefs.prefHasUserValue(prefName)
                            && Services.prefs.getBoolPref(prefName, true) === false) {
                        Services.prefs.clearUserPref(prefName);
                    }
                } catch(e) {}
            }
        } catch(e) {}

        // 2. Clean up everything we put into the main window's DOM.
        try {
            const doc = Zotero.getMainWindow().document;
            const root = doc.documentElement;

            // Drop the mode classes we add to <html>
            root.classList.remove("wv-show-tree-icon", "wv-icons-only", "wv-ui-dark");

            // DIAG: pre-unwrap snapshot of related-box labels so we can
            // see the live state at disable-time.
            try {
                const relLabels = doc.querySelectorAll(
                    "related-box .body .row .box .label");
                Zotero.debug("[Weavero][diag] destroy: "
                    + relLabels.length + " related-box label(s) before unwrap");
                let i = 0;
                for (const l of relLabels) {
                    if (i >= 3) break;
                    const box = l.closest(".box");
                    Zotero.debug("[Weavero][diag] destroy pre[" + i + "]"
                        + " live=" + JSON.stringify(
                            (l.textContent || "").slice(0, 80))
                        + " aria=" + JSON.stringify(
                            ((box && box.getAttribute("aria-label")) || "").slice(0, 80))
                        + " wvMd=" + l.querySelectorAll(".wv-md").length
                        + " wvUrl=" + l.querySelectorAll(".wv-url-span").length);
                    i++;
                }
            } catch (e) {}

            // Strip notes surfaces (items-tree note rows, right-pane
            // notes-box labels, note-editor iframes — both right-pane
            // and pop-out windows). _stripNotes does the cell-by-cell
            // unwrap + removes the injected note-editor stylesheet +
            // detaches the per-iframe listeners, mirroring what
            // happens when the user unticks the Notes surface pref.
            // Without this call, plugin-disable leaves stale rendered
            // links / formatted text in note content until the user
            // re-enables the plugin or restarts Zotero.
            try { this._stripNotes(); } catch(e) {}

            // Restore items-tree annotation comment cells to their raw text.
            for (const cell of doc.querySelectorAll(
                    ".annotation-row.tight .cell.annotation-comment")) {
                let text = cell.getAttribute("data-comment-text");
                if (!text) {
                    const wrap = cell.querySelector(".wv-text-wrap");
                    text = wrap
                        ? (wrap.textContent || "")
                        : (cell.textContent || "")
                              .replace(/[\s ]*🔗\s*$/, "")
                              .trim();
                }
                cell.textContent = text;
                cell.removeAttribute("data-has-rich");
                cell.removeAttribute("data-icon-wanted");
                cell.removeAttribute("data-comment-text");
                cell.removeAttribute("data-truncated");
                cell.removeAttribute("data-has-url");
            }

            // Unwrap leftover .wv-md / .wv-url-span elements (right pane,
            // related-box labels, note rows). These need source-text restoration
            // so a re-enable can re-parse the original markdown / URLs.
            //
            // Two render modes produce these spans:
            //   - "tree" mode (related-box, items-list note .cell-text):
            //     markdown markers / link brackets are STRIPPED so the row
            //     reads cleanly. Restore them here so re-render works.
            //   - "non-tree" mode (right pane / popup): the markers / brackets
            //     are emitted as adjacent text nodes around the span. Just
            //     unwrap; the surrounding text already has them.
            //
            // Detect mode by looking at the previous sibling text node — if
            // it ends with the expected marker / bracket, we're in non-tree
            // mode (markers already preserved). Otherwise we're in tree mode
            // and need to re-emit them.
            for (const span of doc.querySelectorAll(".wv-md")) {
                const cls = span.className || "";
                let marker = "";
                if (cls.includes("wv-md-bold"))         marker = "**";
                else if (cls.includes("wv-md-italic"))  marker = "*";
                else if (cls.includes("wv-md-strike"))  marker = "~~";
                else if (cls.includes("wv-md-code"))    marker = "`";
                const prev = span.previousSibling;
                const haveMarker = !!(prev && prev.nodeType === 3
                    && (prev.nodeValue || "").endsWith(marker));
                const inner = span.textContent || "";
                const text = haveMarker ? inner : (marker + inner + marker);
                span.replaceWith(doc.createTextNode(text));
            }
            for (const span of doc.querySelectorAll(".wv-url-span")) {
                const inner = span.textContent || "";
                const href = span.getAttribute("data-href") || "";
                let text;
                if (!href || inner === href) {
                    // Bare URL — same in both modes.
                    text = inner;
                } else {
                    // Markdown link [label](url). Tree mode strips the brackets
                    // so the label is the only text; restore as `[label](url)`.
                    // Non-tree mode keeps `[` before and `](url)` after as
                    // adjacent text nodes; just unwrap the label.
                    const prev = span.previousSibling;
                    const prevHasBracket = !!(prev && prev.nodeType === 3
                        && (prev.nodeValue || "").endsWith("["));
                    text = prevHasBracket ? inner
                        : ("[" + inner + "](" + href + ")");
                }
                span.replaceWith(doc.createTextNode(text));
            }

            // Remove any of our buttons / icons that escaped the cell-restore
            // pass (e.g. injected outside .annotation-row.tight). Unwrap
            // `.wv-text-wrap` separately — it contains the host element's
            // text content, so removing it would erase the label / row.
            for (const wrap of doc.querySelectorAll(".wv-text-wrap")) {
                const parent = wrap.parentNode;
                if (!parent) continue;
                while (wrap.firstChild) {
                    parent.insertBefore(wrap.firstChild, wrap);
                }
                parent.removeChild(wrap);
            }
            for (const el of doc.querySelectorAll(
                    ".wv-btn, .wv-tree-icon")) {
                el.remove();
            }

            // DIAG: post-unwrap snapshot of related-box labels.
            try {
                const relLabels = doc.querySelectorAll(
                    "related-box .body .row .box .label");
                let i = 0;
                for (const l of relLabels) {
                    if (i >= 3) break;
                    Zotero.debug("[Weavero][diag] destroy post[" + i + "]"
                        + " live=" + JSON.stringify(
                            (l.textContent || "").slice(0, 80))
                        + " wvMd=" + l.querySelectorAll(".wv-md").length
                        + " wvUrl=" + l.querySelectorAll(".wv-url-span").length);
                    i++;
                }
            } catch (e) {}

            // Drop our cache markers from any element that wasn't already
            // wiped above (related-box labels, right-pane comments, note
            // .cell-text spans). Without this the next plugin instance
            // sees `data-wv-source` from the old run and skips the rebuild.
            for (const el of doc.querySelectorAll(
                    "[data-wv-source], [data-wv-rendered], [data-wv-raw],"
                    + " [data-wv-related-rendered], [data-wv-ctx-wired],"
                    + " [data-wv-last-rebuild]")) {
                el.removeAttribute("data-wv-source");
                el.removeAttribute("data-wv-rendered");
                el.removeAttribute("data-wv-raw");
                el.removeAttribute("data-wv-related-rendered");
                el.removeAttribute("data-wv-ctx-wired");
                el.removeAttribute("data-wv-last-rebuild");
            }

            // Remove the popup panel + main-window stylesheet.
            doc.getElementById(PANEL_ID)?.remove();
            this.removeStyles();

            // Clean up the right-click Copy Link menu.
            if (this._urlMenuState) {
                try {
                    const ms = this._urlMenuState;
                    if (ms.root && ms.handlers) {
                        try { ms.root.removeEventListener("contextmenu", ms.handlers.onCtx, true); } catch(e) {}
                        try { ms.root.removeEventListener("click", ms.handlers.onAnyClick, true); } catch(e) {}
                        try { ms.root.removeEventListener("keydown", ms.handlers.onKey, true); } catch(e) {}
                        try { ms.root.removeEventListener("wheel", ms.handlers.onWheel, { capture: true, passive: true }); } catch(e) {}
                    }
                    if (ms.pointerTargets && ms.handlers && ms.handlers.onPointerDown) {
                        for (const t of ms.pointerTargets) {
                            try { t.removeEventListener("pointerdown", ms.handlers.onPointerDown, { capture: true }); } catch(e) {}
                        }
                    }
                    if (ms.firstMoveHandler) {
                        try { doc.removeEventListener("mousemove", ms.firstMoveHandler, true); } catch(e) {}
                    }
                    if (ms.win && ms.handlers && ms.handlers.onWinBlur) {
                        try { ms.win.removeEventListener("blur", ms.handlers.onWinBlur); } catch(e) {}
                    }
                    if (ms.el && ms.el.parentNode) ms.el.parentNode.removeChild(ms.el);
                } catch(e) {}
                this._urlMenuState = null;
            }
            // Make sure the suppress class doesn't outlive the menu —
            // would otherwise leave links stuck with default cursor and
            // no tooltip after a teardown that didn't go through hideMenu.
            try { root.classList.remove("wv-context-menu-open"); } catch(e) {}
            // Clean up the URL hover tooltip widget.
            if (this._urlTooltipState) {
                try {
                    const s = this._urlTooltipState;
                    if (s.timer) {
                        try { Zotero.getMainWindow().clearTimeout(s.timer); } catch(e) {}
                    }
                    if (s.root && s.handlers) {
                        try { s.root.removeEventListener("mouseover", s.handlers.onOver, true); } catch(e) {}
                        try { s.root.removeEventListener("mouseout", s.handlers.onOut, true); } catch(e) {}
                        try { s.root.removeEventListener("mousedown", s.handlers.onDown, true); } catch(e) {}
                    }
                    if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
                } catch(e) {}
                this._urlTooltipState = null;
            }
        } catch(e) {
            Zotero.debug("[Weavero] destroy main-doc cleanup error: " + e);
        }

        // 3. Clean up open reader iframes.
        try {
            for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = reader._iframeWindow
                        || (reader._iframe && reader._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;

                    // Disconnect observer + drop the iframe-doc listeners.
                    const data = this._readerObservers.get(reader);
                    if (data) {
                        try { data.observer && data.observer.disconnect(); } catch(e) {}
                        try { data.innerObserver && data.innerObserver.disconnect(); } catch(e) {}
                        if (data.sidebarMouseDown) {
                            try { idoc.removeEventListener("mousedown",
                                data.sidebarMouseDown, true); } catch(e) {}
                        }
                        if (data.sidebarFocusIn) {
                            try { idoc.removeEventListener("focusin",
                                data.sidebarFocusIn, true); } catch(e) {}
                        }
                        if (data.sidebarFocusOut) {
                            try { idoc.removeEventListener("focusout",
                                data.sidebarFocusOut, true); } catch(e) {}
                        }
                        // Proactive Delete/Backspace listeners (both
                        // window and document on each iframe frame).
                        if (data.proactiveOuterDoc) {
                            try { idoc.removeEventListener("keydown",
                                data.proactiveOuterDoc, true); } catch(e) {}
                        }
                        if (data.proactiveOuterWin && data.proactiveOuterWindow) {
                            try { data.proactiveOuterWindow.removeEventListener("keydown",
                                data.proactiveOuterWin, true); } catch(e) {}
                        }
                        if (data.selectionTrackerOuter) {
                            try { idoc.removeEventListener("mousedown",
                                data.selectionTrackerOuter, true); } catch(e) {}
                        }
                        // Inner-iframe cleanup: text-annotation buttons,
                        // marker icon badges, our stylesheet, the inner
                        // proactive keydown + selection tracker listeners,
                        // and (for DOM-view readers) the shadow-root
                        // MutationObserver and scroll/resize handlers.
                        const innerDoc = data.innerDoc;
                        const innerWindow = data.innerWindow;
                        if (innerDoc) {
                            try {
                                if (data.proactiveInnerDoc) {
                                    try { innerDoc.removeEventListener("keydown",
                                        data.proactiveInnerDoc, true); } catch(e) {}
                                }
                                if (data.proactiveInnerWin && innerWindow) {
                                    try { innerWindow.removeEventListener("keydown",
                                        data.proactiveInnerWin, true); } catch(e) {}
                                }
                                if (data.selectionTrackerInner) {
                                    try { innerDoc.removeEventListener("mousedown",
                                        data.selectionTrackerInner, true); } catch(e) {}
                                }
                                if (data.dragEndPointerUp
                                        && data.dragEndPointerUpWindow) {
                                    try { data.dragEndPointerUpWindow
                                        .removeEventListener("pointerup",
                                            data.dragEndPointerUp, true);
                                    } catch(e) {}
                                }
                                if (data.domViewObserver) {
                                    try { data.domViewObserver.disconnect(); } catch(e) {}
                                }
                                if (data.domViewResizeObserver) {
                                    try { data.domViewResizeObserver.disconnect(); } catch(e) {}
                                }
                                if (data.domViewScrollHandler && innerWindow) {
                                    try { innerWindow.removeEventListener("scroll",
                                        data.domViewScrollHandler, true); } catch(e) {}
                                    try { innerWindow.removeEventListener("resize",
                                        data.domViewScrollHandler); } catch(e) {}
                                }
                                for (const btn of innerDoc.querySelectorAll(
                                        ".wv-text-annotation-btn")) {
                                    btn.remove();
                                }
                                for (const b of innerDoc.querySelectorAll(
                                        ".wv-marker-badge")) {
                                    b.remove();
                                }
                                innerDoc.getElementById(
                                    "weavero-inner-styles")?.remove();
                            } catch(e) {}
                        }
                    }

                    // Full sidebar teardown: unwrap URL spans, remove
                    // .wv-md-preview panels and the wv-comment-preview
                    // class, drop any markdown-style spans, and remove
                    // sidebar buttons. This is what _stripReaderSidebar
                    // does — calling it directly keeps the cleanup logic
                    // in one place.
                    //
                    // Without removing .wv-md-preview here, the stale
                    // preview node survives plugin disable. On re-enable,
                    // _renderPreviewPanel's data-source cache hits on
                    // that stale node and returns early — leaving the
                    // OLD instance's render (with its URL spans already
                    // unwrapped by this very pass) in place. URL-bearing
                    // comments then look broken while markdown-only ones
                    // look fine, matching the disable/enable regression.
                    try { this._stripReaderSidebar(idoc); } catch(e) {}
                    // Strip any of our wrappers / buttons that fell
                    // outside _stripReaderSidebar's targeted selectors
                    // (e.g. .wv-btn placed on rows that weren't part of
                    // .annotation-row / .annotation, or popup spans).
                    for (const span of idoc.querySelectorAll(".wv-url-span")) {
                        span.replaceWith(idoc.createTextNode(span.textContent || ""));
                    }
                    for (const el of idoc.querySelectorAll(".wv-btn")) el.remove();
                    idoc.getElementById("weavero-reader-styles")?.remove();
                    // _ensureReaderOuterStyles also injects into idoc
                    // (preview-panel CSS for the reader sidebar). Without
                    // this cleanup, a stale element from this instance
                    // leaks across disable/enable and the next instance's
                    // remove-then-add still does the right thing — but
                    // we strip it here for symmetry and to keep the doc
                    // clean during the time the plugin is off.
                    idoc.getElementById("weavero-reader-outer-styles")?.remove();
                } catch(e) {}
            }
        } catch(e) {}

        Zotero.debug("[Weavero] destroyed");
    }
}
