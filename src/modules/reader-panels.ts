// Module: reader-panels — reader-side filter + bookmarks affordances.
//
// Two features that bring library-pane conveniences into the PDF/EPUB reader:
//
//  A. Annotation filter — a funnel button in the reader's top toolbar (to the
//     right of the Find/search icon) that opens a popup mirroring the library
//     filter pane's design, scoped to the open document's annotations:
//     annotation type, colour, has-comment, and tags. Applying the filter
//     drives the reader's own annotation-manager (`setFilter({ hiddenIDs })`),
//     so matched-out annotations vanish from BOTH the sidebar list AND the
//     rendered page/EPUB view — which means the filter still works with the
//     left sidebar collapsed (the reason it lives in the toolbar, not the
//     sidebar strip). The native colour/tag strip is intentionally duplicated
//     here so all dimensions are reachable when the sidebar is hidden.
//
//  B. Bookmarks tab — (added incrementally) a Bookmarks tab beside Outline in
//     the reader sidebar for manually-created in-document location bookmarks.
//
// Both are injected into the reader's React-app document and re-applied on
// every sidebar scan via the hook in reader.ts `_processReaderSidebar`, so
// they self-heal against React re-renders (idempotent: inject only if absent).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { BOOKMARK_PATH } from "./constants";

declare const Components: any;
declare const Services: any;

const RP_FILTER_BTN_CLASS = "wv-reader-filter-btn";
const RP_FILTER_POPUP_ID = "wv-reader-filter-popup";
const RP_BM_CTX_ID = "wv-bm-reader-ctxmenu";
const RP_STYLE_ID = "wv-reader-panels-style";
const NS_HTML_RP = "http://www.w3.org/1999/xhtml";

// Same funnel + related icons as the library filter.
const RP_FUNNEL_ICON = "chrome://zotero/skin/16/universal/filter.svg";
const RP_RELATED_ICON = "chrome://zotero/skin/16/universal/related.svg";

// Person glyph for Added By / Modified By chips — the same Font Awesome
// "user" icon the reader uses for annotation authors (IconUser). Inline so
// it renders inside the reader iframe (chrome:// images are blocked there).
const RP_USER_SVG =
    '<svg viewBox="0 0 448 512" aria-hidden="true">'
    + '<path fill="currentColor" d="M224 256c70.7 0 128-57.31 128-128s-57.3-128-128-128C153.3 0 96 57.31 96 128'
    + 'S153.3 256 224 256zM274.7 304H173.3C77.61 304 0 381.6 0 477.3c0 19.14 15.52 34.67 34.66 34.67h378.7'
    + 'C432.5 512 448 496.5 448 477.3C448 381.6 370.4 304 274.7 304z"/></svg>';

// Popup CSS. The contents use the EXACT library-filter classes
// (.wv-filter-section / .wv-filter-opt / .wv-chip-swatch / .wv-filter-svg /
// .wv-filter-or-inline / data-selected / data-excluded), copied verbatim from
// constants.ts so the reader filter is visually identical to the library one.
// They're scoped under #wv-reader-filter-popup so they can't leak into the
// reader's own UI. Only the popup-frame chrome is bespoke (the library uses a
// XUL <panel>; here it's an HTML div inside the reader iframe).
const RP_POPUP_CSS = [
    // ---- popup frame ----
    "#" + RP_FILTER_POPUP_ID + "{",
    "  position:absolute; z-index:2147483600; min-width:230px; max-width:360px;",
    "  background:Canvas; color:CanvasText;",
    "  border:1px solid rgba(127,127,127,.55); border-radius:5px;",
    "  box-shadow:0 6px 24px rgba(0,0,0,.30); padding:8px 10px;",
    "  font-size:12px; line-height:1.4; user-select:none;",
    "}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-stack{display:flex;flex-direction:column;gap:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-head{display:flex;align-items:center;gap:8px;margin:0 0 2px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-title{font-weight:600;flex:1;opacity:.85;}",
    // Clear / Clear-and-Close — copied verbatim from the library filter
    // (constants.ts .wv-filter-clear-btn / .wv-filter-clear-icon) so the
    // reader popup's actions look identical.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-btn{margin-left:auto;font:inherit;font-size:11px;line-height:1;",
    "  color:inherit;cursor:pointer;padding:3px 8px;border-radius:10px;",
    "  border:1px solid rgba(127,127,127,0.4);background:rgba(127,127,127,0.10);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-btn:hover{background:rgba(127,127,127,0.22);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon{background:rgba(127,127,127,0.18);border:none;padding:0;",
    "  color:rgb(220,72,72);cursor:pointer;width:24px;height:24px;border-radius:50%;position:relative;",
    "  display:inline-block;font-size:0;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::before,",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::after{content:\"\";position:absolute;top:50%;left:50%;",
    "  width:12px;height:1.5px;background:currentColor;border-radius:1px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::before{transform:translate(-50%,-50%) rotate(45deg);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon::after{transform:translate(-50%,-50%) rotate(-45deg);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-clear-icon:hover{background:rgba(220,72,72,0.28);color:rgb(255,255,255);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-empty{opacity:.5;font-style:italic;}",
    // ---- library-filter classes (verbatim from constants.ts) ----
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-section{display:flex;flex-direction:row;align-items:center;gap:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-or-inline{display:flex;align-items:center;gap:3px;",
    "  background:rgba(127,127,127,0.18);border-radius:6px;padding:3px 6px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-section-title{display:none;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-options{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:3px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt{display:inline-flex;align-items:center;gap:6px;",
    "  padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(127,127,127,0.4);",
    "  background:transparent;color:inherit;font:inherit;font-size:12px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt:hover{background:rgba(127,127,127,0.08);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-selected=\"true\"]{",
    "  background:rgba(94,106,210,0.34);border-color:rgba(94,106,210,0.95);",
    "  box-shadow:inset 0 0 0 1px rgba(94,106,210,0.55);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-selected=\"true\"]:hover{background:rgba(94,106,210,0.45);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-excluded=\"true\"]{",
    "  border-color:rgba(220,72,72,0.7);",
    "  background:linear-gradient(to top right,transparent calc(50% - 1px),",
    "    rgba(220,72,72,0.85) calc(50% - 1px),rgba(220,72,72,0.85) calc(50% + 1px),",
    "    transparent calc(50% + 1px)),rgba(220,72,72,0.10);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt-icon{padding:4px 6px;min-width:26px;justify-content:center;gap:0;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-svg{display:inline-block;width:16px;height:16px;",
    "  -moz-context-properties:fill,stroke,fill-opacity,stroke-opacity;fill:currentColor;stroke:currentColor;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-chip-swatch{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,0.15);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-vertical-separator{width:1px;align-self:stretch;background:rgba(127,127,127,0.45);margin:2px 4px;}",
    // OR-group card tint (same as the library's .wv-filter-or-group) for
    // the "pick any of these" rows (colour, tags, added/modified by).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-or-group{background:rgba(127,127,127,0.18);border-radius:6px;padding:5px 6px;margin:1px 0;}",
    // Has Link inline SVG sizing inside a chip.
    "#" + RP_FILTER_POPUP_ID + " .wv-link-svg{width:16px;height:16px;display:inline-block;}",
    // Added By / Modified By person glyph.
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg{display:inline-flex;align-items:center;margin-right:5px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg svg{height:11px;width:auto;display:block;opacity:.8;}",
    // Group heading on its own line (separates Added By / Modified By without
    // eating chip width).
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-grouphead{font-size:10px;opacity:.55;text-transform:uppercase;",
    "  letter-spacing:.04em;margin:3px 2px 1px;}",
    // Faded chip — value not present in the current filtered view (Tag Selector
    // style). Still clickable.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-inactive=\"true\"]{opacity:.35;}",
    // Bottom "Alt+Click to exclude" hint (same as library).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-controls{display:flex;justify-content:center;align-items:center;margin-top:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-hint{font-size:10px;opacity:0.5;text-align:center;padding:4px 0 2px;}",
    // "Hide annotations in the reader" — checkbox row (bottom of the popup).
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann{display:flex;align-items:center;gap:6px;margin-top:6px;",
    "  padding:4px 2px;font-size:12px;cursor:pointer;color:inherit;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann input{cursor:pointer;margin:0;flex:0 0 auto;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-hideann:hover{opacity:.85;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt.wv-filter-tag-colored{font-weight:600;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt.wv-filter-tag-colored::before{content:\" \";display:inline-block;",
    "  width:8px;height:8px;margin-right:4px;border-radius:50%;background:var(--wv-tag-color,currentColor);",
    "  border:1px solid rgba(127,127,127,0.3);vertical-align:-1px;flex:0 0 auto;}",
    // ---- toolbar button ----
    "." + RP_FILTER_BTN_CLASS + " .wv-filter-svg{width:16px;height:16px;-moz-context-properties:fill,stroke;fill:currentColor;stroke:currentColor;}",
    "." + RP_FILTER_BTN_CLASS + ".wv-rf-active{position:relative;}",
    "." + RP_FILTER_BTN_CLASS + ".wv-rf-active::after{content:'';position:absolute;top:4px;right:4px;",
    "  width:6px;height:6px;border-radius:50%;background:var(--color-accent,#5e6ad2);}",
].join("");

// ---- Feature B: Bookmarks sidebar tab ----------------------------------
const RP_BM_TAB_CLASS = "wv-bm-reader-tab";
const RP_BM_VIEW_CLASS = "wv-bm-reader-view";
const RP_BM_TAB_ON = "wv-bm-tab-on";
// Sentinel reader sidebarView value used while our Bookmarks tab is active.
// It's intentionally NOT "annotations": the reader only renders the in-document
// annotation popup when `sidebarView !== 'annotations'` (else it assumes you'll
// edit in the annotations sidebar — which our tab has replaced). It's also not
// any native view name, so no native tab activates and the PDF/EPUB views no-op
// on it (they only special-case "outline").
const RP_BM_SIDEBAR_VIEW = "wv-bookmarks";

// Outline-ribbon bookmark glyph — the shared even-odd outline
// (BOOKMARK_PATH), filled with currentColor so it themes with the
// reader. Sized by CSS at each use (20px tab, 14px row/hover card).
const RP_BM_RIBBON =
    '<svg viewBox="0 0 16 16" fill="currentColor">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" d="' + BOOKMARK_PATH + '"/></svg>';
const RP_PLUS_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 7V2h2v5h5v2H9v5H7V9H2V7z"/></svg>';
// Quote glyph for selected-text bookmarks.
const RP_TEXT_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 4h7v1.4H3zM3 7.3h10v1.4H3zM3 10.6h7V12H3z"/></svg>';
// Pushpin glyph for position bookmarks — the 📌 emoji (user preference over a
// line map-pin). Used both as the list-row icon and the temporary in-document
// marker dropped on click.
const RP_PIN_EMOJI = "📌";
// Outline folder for bookmark folder rows; folder-with-plus for "New folder";
// chevrons for expand/collapse. All themed by currentColor.
const RP_FOLDER_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">'
    + '<path d="M1.5 4.5H6L7.3 6H14.5V13H1.5Z"/></svg>';
const RP_FOLDER_PLUS_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M18 11.5V6.5H8.5L7 5H2.5V15.5H10"/><path d="M14.5 12.5v5M12 15h5"/></svg>';
// Rename (pencil) + Delete (red cross) glyphs for the reader bookmark context
// menu, themed via currentColor (pencil) / baked red (cross) to match the
// library menu's BM_RENAME_ICON / BM_DELETE_ICON. The Open and Show-in-Library
// items use the native Zotero icons instead, fetched + inlined by
// `_wvChromeIconSvg` (the reader iframe can't load chrome:// images directly).
const RP_RENAME_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M11.5 2.5l2 2"/><path d="M12.2 1.8a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L5.5 12.5 2.5 13.5 3.5 10.5z"/></svg>';
const RP_DELETE_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="#e0483b" stroke-width="2" stroke-linecap="round">'
    + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';
// Revert/undo glyph (circular arrow) for "Reset to original name".
const RP_REVERT_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M3.5 8a4.5 4.5 0 1 1 1.4 3.3"/><path d="M3.2 4.8v3h3"/></svg>';
const RP_CHEV_RIGHT =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
const RP_CHEV_DOWN =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';

const RP_BM_CSS = [
    // When our tab is active, hide the React view wrappers and show ours.
    "#sidebarContainer." + RP_BM_TAB_ON + " #sidebarContent > .viewWrapper:not(." + RP_BM_VIEW_CLASS + "){display:none!important;}",
    "." + RP_BM_VIEW_CLASS + "{display:none;flex-direction:column;height:100%;min-height:0;overflow:hidden;}",
    "#sidebarContainer." + RP_BM_TAB_ON + " ." + RP_BM_VIEW_CLASS + "{display:flex!important;}",
    "." + RP_BM_TAB_CLASS + " svg{width:20px;height:20px;}",
    ".wv-bm-reader-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.2);}",
    ".wv-bm-reader-head .wv-bm-reader-htitle{flex:1;font-weight:600;opacity:.75;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}",
    ".wv-bm-reader-add{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:4px;color:inherit;}",
    ".wv-bm-reader-add:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-reader-add svg{width:15px;height:15px;fill:currentColor;}",
    ".wv-bm-reader-list{flex:1 1 auto;overflow:auto;min-height:0;padding:4px;}",
    ".wv-bm-reader-row{position:relative;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:13px;user-select:none;-moz-user-select:none;}",
    // The reader's own CSS sets user-select:auto/text on text-bearing children
    // (the 📌 emoji, the label), so a press-drag on a row starts a text
    // selection despite the row's none. Force none on every descendant with
    // !important so dragging a bookmark — pins especially — never selects text.
    ".wv-bm-reader-row, .wv-bm-reader-row *{-moz-user-select:none!important;user-select:none!important;}",
    ".wv-bm-reader-row:hover{background:rgba(127,127,127,.14);}",
    ".wv-bm-reader-row .wv-bm-reader-ic{flex:0 0 auto;width:16px;height:16px;display:flex;align-items:center;justify-content:center;}",
    // Decorative monochrome glyphs (text quote / folder) stay subtle at 14px;
    // native item-type icons (<img>) render at full size/opacity to match the
    // library bookmark rows exactly.
    ".wv-bm-reader-row .wv-bm-reader-ic svg{width:14px;height:14px;opacity:.85;}",
    ".wv-bm-reader-row .wv-bm-reader-ic img{width:16px;height:16px;}",
    ".wv-bm-reader-row .wv-bm-reader-ic.wv-bm-emoji{font-size:13px;line-height:16px;opacity:1;}",
    ".wv-bm-reader-row .wv-bm-reader-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-reader-row .wv-bm-reader-page{flex:0 0 auto;opacity:.5;font-size:11px;}",
    ".wv-bm-reader-row .wv-bm-reader-actions{display:none;gap:1px;flex:0 0 auto;}",
    ".wv-bm-reader-row:hover .wv-bm-reader-actions{display:flex;}",
    ".wv-bm-reader-actbtn{border:none;background:none;cursor:pointer;opacity:.55;padding:1px 4px;border-radius:3px;color:inherit;font-size:12px;line-height:1;}",
    ".wv-bm-reader-actbtn:hover{opacity:1;background:rgba(127,127,127,.2);}",
    ".wv-bm-reader-empty{opacity:.5;padding:14px 10px;font-size:12px;text-align:center;line-height:1.5;}",
    ".wv-bm-reader-grouphead{font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px 2px;display:flex;align-items:center;}",
    ".wv-bm-reader-grouphead .wv-bm-gh-title{flex:1;opacity:.55;}",
    ".wv-bm-reader-newfolder{display:flex;align-items:center;justify-content:center;width:18px;height:16px;border:none;background:none;cursor:pointer;border-radius:3px;color:inherit;opacity:.5;padding:0;flex:0 0 auto;}",
    ".wv-bm-reader-newfolder:hover{opacity:.95;background:rgba(127,127,127,.2);}",
    ".wv-bm-reader-newfolder svg{width:13px;height:13px;}",
    "." + RP_BM_TAB_CLASS + ".wv-bm-dropok{outline:2px solid var(--color-accent,#5e6ad2);outline-offset:-2px;}",
    ".wv-bm-reader-row.wv-bm-dragging{opacity:.4;}",
    // Before/after indicators are INDENTED lines (a pseudo-element from
    // `--wv-drop-indent` to the right edge), so the line's start — and thus its
    // length — reflects the LEVEL the item will land at (top level = longest;
    // inside a folder/sub-folder = progressively shorter). `--wv-drop-indent`
    // is set per-drag from the resolved target depth.
    ".wv-bm-reader-row.wv-bm-drop-before::after{content:'';position:absolute;left:var(--wv-drop-indent,8px);right:6px;top:-1px;height:2px;background:var(--color-accent,#5e6ad2);pointer-events:none;border-radius:1px;}",
    // Below the row so "after A" lands at the SAME pixel as "before B" of the
    // next row — one stationary line instead of jumping across the boundary.
    ".wv-bm-reader-row.wv-bm-drop-after::after{content:'';position:absolute;left:var(--wv-drop-indent,8px);right:6px;bottom:-1px;height:2px;background:var(--color-accent,#5e6ad2);pointer-events:none;border-radius:1px;}",
    // Group drop feedback: the local section shows NO box (the row-level
    // target line is the only indicator); the global section dims to reject.
    ".wv-bm-reader-group{border-radius:6px;}",
    ".wv-bm-reader-group.wv-bm-grp-nodrop{opacity:.5;cursor:no-drop;}",
    // Folder rows: chevron + folder glyph; nested children indent via padding.
    ".wv-bm-reader-row .wv-bm-reader-chev{flex:0 0 auto;width:12px;height:12px;display:flex;align-items:center;justify-content:center;opacity:.6;}",
    ".wv-bm-reader-row .wv-bm-reader-chev svg{width:12px;height:12px;}",
    ".wv-bm-reader-row .wv-bm-reader-chev.wv-bm-reader-chev-spacer{visibility:hidden;}",
    ".wv-bm-reader-row.wv-bm-drop-into{box-shadow:inset 0 0 0 2px var(--color-accent,#5e6ad2);border-radius:4px;}",
    // Right-click context menu (Add Bookmark / New Folder / row actions).
    "#" + RP_BM_CTX_ID + "{position:absolute;z-index:2147483647;background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.4);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:4px;min-width:160px;font-size:13px;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;cursor:pointer;white-space:nowrap;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-item:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic{flex:0 0 auto;width:14px;height:14px;display:flex;align-items:center;justify-content:center;opacity:.8;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic.wv-ctx-ic-native{opacity:1;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic svg{width:14px;height:14px;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-sep{height:1px;background:rgba(127,127,127,.3);margin:4px 2px;}",
    // Rich hover card (details popup). Interactive (expandable), so it captures
    // the pointer; it auto-hides when the cursor leaves BOTH the row and card.
    ".wv-bm-hovercard{position:absolute;z-index:2147483647;max-width:340px;min-width:170px;",
    "  background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.5);border-radius:6px;",
    "  box-shadow:0 6px 24px rgba(0,0,0,.30);padding:8px 10px;font-size:12px;line-height:1.45;",
    "  user-select:none;-moz-user-select:none;pointer-events:auto;}",
    ".wv-bm-hovercard .wv-hc-head{display:flex;align-items:center;gap:6px;margin-bottom:3px;font-weight:600;}",
    ".wv-bm-hovercard .wv-hc-sw{width:10px;height:10px;border-radius:50%;border:1px solid rgba(0,0,0,.2);flex:0 0 auto;}",
    ".wv-bm-hovercard .wv-hc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-hovercard .wv-hc-page{flex:0 0 auto;margin-left:auto;opacity:.6;font-weight:400;white-space:nowrap;}",
    // The row icon CSS is scoped to .wv-bm-reader-row, so size it here too.
    ".wv-bm-hovercard .wv-bm-reader-ic{flex:0 0 auto;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;}",
    ".wv-bm-hovercard .wv-bm-reader-ic svg{width:14px;height:14px;}",
    ".wv-bm-hovercard .wv-bm-reader-ic img{width:16px;height:16px;}",
    ".wv-bm-hovercard .wv-bm-reader-ic.wv-bm-emoji{font-size:14px;line-height:16px;}",
    // Body holds the variable-length content: clamped by default, scrolls when expanded.
    ".wv-bm-hovercard .wv-hc-body{position:relative;max-height:200px;overflow:hidden;}",
    ".wv-bm-hovercard.wv-hc-expanded .wv-hc-body{max-height:65vh;overflow:auto;}",
    ".wv-bm-hovercard .wv-hc-fade{position:absolute;left:0;right:0;bottom:0;height:26px;",
    "  background:linear-gradient(to bottom,transparent,Canvas);pointer-events:none;}",
    ".wv-bm-hovercard.wv-hc-expanded .wv-hc-fade{display:none;}",
    ".wv-bm-hovercard .wv-hc-expand{display:block;margin-top:5px;font:inherit;font-size:11px;cursor:pointer;",
    "  color:var(--color-accent,#5e6ad2);background:none;border:none;padding:2px 0;text-align:left;}",
    ".wv-bm-hovercard .wv-hc-expand:hover{text-decoration:underline;}",
    ".wv-bm-hovercard .wv-hc-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0;}",
    ".wv-bm-hovercard .wv-hc-comment{margin:3px 0;padding:2px 7px;border-left:2px solid var(--color-accent,#5e6ad2);",
    "  opacity:.92;white-space:pre-wrap;overflow-wrap:anywhere;}",
    ".wv-bm-hovercard .wv-hc-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;}",
    ".wv-bm-hovercard .wv-hc-tag{font-size:11px;padding:1px 6px;border-radius:8px;background:rgba(127,127,127,.18);}",
    ".wv-bm-hovercard .wv-hc-src{margin-top:3px;font-size:11px;opacity:.7;overflow-wrap:anywhere;}",
    ".wv-bm-hovercard .wv-hc-meta{margin-top:4px;font-size:11px;opacity:.55;}",
    ".wv-bm-hovercard .wv-hc-meta + .wv-hc-meta{margin-top:1px;}",
].join("");

class _ReaderPanelsMixin {
    [k: string]: any;

    // ---- Entry: called from reader.ts _processReaderSidebar -----------------

    /** Idempotent per-scan processing for the reader React-app document.
     *  Re-applies button/tab injection (self-heals against React). */
    _wvProcessReaderPanels(idoc: any) {
        try {
            if (!idoc) return;
            const reader = this._findReaderForDoc(idoc);
            if (!reader) return;
            this._wvEnsureReaderPanelStyles(idoc);
            this._wvReaderPrefetchIcons();
            this._wvReaderEnsureFilterButton(reader, idoc);
            this._wvReaderEnsureBookmarksTab(reader, idoc);
            this._wvEnsureSpringDragEnd(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvProcessReaderPanels err: " + e);
        }
    }

    /** Wire a `dragend` on the PDF view's iframe document (once). An annotation
     *  dragged from the document originates THERE, so its dragend never reaches
     *  the reader-app doc — without this, a spring-opened folder wouldn't
     *  re-collapse when the drag is cancelled or dropped back in the document. */
    _wvEnsureSpringDragEnd(reader: any, idoc: any) {
        try {
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const pdoc = pv && pv._iframeWindow && pv._iframeWindow.document;
            if (!pdoc || pdoc._wvBmSpringDragEndWired) return;
            pdoc._wvBmSpringDragEndWired = true;
            pdoc.addEventListener("dragend", () => {
                this._wvCancelBmSpring();
                try { const a = this._wvReaderAtt(reader); if (a) this._wvRecollapseAllSprings(reader, idoc, a); } catch (_) {}
            }, true);
        } catch (_) {}
    }

    /** The reader iframe blocks chrome:// resource loads (CSP), so its
     *  <img src="chrome://…"> icons come up blank. We fetch the SVG text in
     *  the privileged context (where chrome:// is reachable) and cache a
     *  data: URI, which the iframe DOES allow. Synchronous cache getter. */
    _wvReaderIconUri(chromeUrl: string) {
        return (this._wvReaderIconCache && this._wvReaderIconCache[chromeUrl]) || null;
    }

    _wvReaderPrefetchIcons() {
        if (this._wvReaderIconsReady || this._wvReaderIconsPrefetching) return;
        this._wvReaderIconsPrefetching = true;
        if (!this._wvReaderIconCache) this._wvReaderIconCache = {};
        const urls = [RP_FUNNEL_ICON, RP_RELATED_ICON];
        try { for (const t of this._ANNOTATION_TYPES) if (t && t.icon) urls.push(t.icon); } catch (_) {}
        Promise.all(urls.map(async (u: string) => {
            try {
                const txt = await fetch(u).then((r: any) => r.text());
                this._wvReaderIconCache[u] = "data:image/svg+xml," + encodeURIComponent(txt);
            } catch (_) {}
        })).then(() => {
            this._wvReaderIconsReady = true;
            this._wvReaderIconsPrefetching = false;
            // Refresh any already-rendered funnel buttons + open popups.
            try {
                for (const r of (Zotero.Reader._readers || [])) {
                    const iw = r._iframeWindow || (r._iframe && r._iframe.contentWindow);
                    const d = iw && iw.document;
                    if (!d) continue;
                    const f = d.querySelector("." + RP_FILTER_BTN_CLASS + " img");
                    const furi = this._wvReaderIconCache[RP_FUNNEL_ICON];
                    if (f && furi) f.setAttribute("src", furi);
                    const pop = d.getElementById(RP_FILTER_POPUP_ID);
                    if (pop) this._wvRenderReaderFilterPopup(r, d, pop);
                }
            } catch (_) {}
        }).catch(() => { this._wvReaderIconsPrefetching = false; });
    }

    _wvEnsureReaderPanelStyles(idoc: any) {
        const css = RP_POPUP_CSS + RP_BM_CSS;
        const existing = idoc.getElementById(RP_STYLE_ID);
        if (existing) {
            // A reader left open across a plugin update keeps its stale
            // <style> — refresh it if the CSS changed.
            if (existing.textContent !== css) existing.textContent = css;
            return;
        }
        const s = idoc.createElementNS(NS_HTML_RP, "style");
        s.id = RP_STYLE_ID;
        s.textContent = css;
        (idoc.head || idoc.documentElement).appendChild(s);
    }

    // ---- Per-reader filter state -------------------------------------------

    /** Per-reader filter state. Include/exclude mirror the library filter's
     *  click (include) / Alt+click (exclude) model. hasComment is tri-state:
     *  true (require) / false (require absent) / null (off). */
    _wvReaderFilterState(reader: any) {
        if (!this._wvReaderFilters) this._wvReaderFilters = new WeakMap();
        let st = this._wvReaderFilters.get(reader);
        if (!st) {
            st = {
                // Colour / tag / author INCLUDES live in the reader's own
                // annotation-filter (the native sidebar strip's channel), so
                // the strip and this popup share one source of truth and never
                // stack. Only EXCLUDES and the dimensions the native filter
                // lacks (type, has-comment, has-related, has-link, modified-by)
                // are stored here and applied via hiddenIDs. Author dims are
                // keyed by display name (what the native `authors` filter uses).
                types: [], typesExcl: [],
                colorsExcl: [],
                tagsExcl: [],
                addedByExcl: [],
                modifiedBy: [], modifiedByExcl: [],
                hasComment: null as (boolean | null),
                hasRelated: null as (boolean | null),
                hasLink: null as (boolean | null),
            };
            this._wvReaderFilters.set(reader, st);
        }
        return st;
    }

    /** The reader's own annotation filter includes ({colors,tags,authors})
     *  — the channel the native sidebar strip uses; our popup shares it. */
    _wvReaderNativeIncludes(reader: any) {
        const out = { colors: [] as string[], tags: [] as string[], authors: [] as string[] };
        try {
            const f = reader._internalReader && reader._internalReader._state
                && reader._internalReader._state.filter;
            if (f) {
                if (f.colors) out.colors = Array.from(f.colors as any);
                if (f.tags) out.tags = Array.from(f.tags as any);
                if (f.authors) out.authors = Array.from(f.authors as any);
            }
        } catch (_) {}
        return out;
    }

    _wvReaderFilterActive(reader: any) {
        const st = this._wvReaderFilterState(reader);
        const nat = this._wvReaderNativeIncludes(reader);
        return !!(nat.colors.length || nat.tags.length || nat.authors.length
            || st.types.length || st.typesExcl.length
            || st.colorsExcl.length || st.tagsExcl.length
            || st.addedByExcl.length || st.modifiedBy.length || st.modifiedByExcl.length
            || st.hasComment !== null || st.hasRelated !== null || st.hasLink !== null
            // "Hide Annotations in the Reader" counts as an active filter.
            || this._wvReaderAnnotationsHidden(reader));
    }

    /** The open document's annotation items (Zotero items, same compartment). */
    _wvReaderAnnotations(reader: any): any[] {
        try {
            const att: any = Zotero.Items.get(reader.itemID);
            if (!att || typeof att.getAnnotations !== "function") return [];
            return att.getAnnotations() || [];
        } catch (e) { return []; }
    }

    // ---- Feature A: toolbar filter button + popup --------------------------

    _wvReaderEnsureFilterButton(reader: any, idoc: any) {
        try {
            const find = idoc.querySelector(".toolbar-button.find");
            const end = (find && find.parentNode)
                || idoc.querySelector(".toolbar .end")
                || idoc.querySelector(".end");
            if (!end) return;
            let btn = idoc.querySelector("." + RP_FILTER_BTN_CLASS);
            if (!btn) {
                btn = idoc.createElementNS(NS_HTML_RP, "button");
                btn.className = "toolbar-button " + RP_FILTER_BTN_CLASS;
                btn.setAttribute("tabindex", "-1");
                btn.setAttribute("title", "Filter annotations");
                const fimg = idoc.createElementNS(NS_HTML_RP, "img");
                fimg.className = "wv-filter-svg";
                fimg.setAttribute("src", this._wvReaderIconUri(RP_FUNNEL_ICON) || RP_FUNNEL_ICON);
                btn.appendChild(fimg);
                btn.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvToggleReaderFilterPopup(reader, idoc, btn);
                });
                // Right of the Find button when possible.
                if (find && find.nextSibling) end.insertBefore(btn, find.nextSibling);
                else end.appendChild(btn);
            }
            btn.classList.toggle("wv-rf-active", this._wvReaderFilterActive(reader));
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderEnsureFilterButton err: " + e);
        }
    }

    _wvToggleReaderFilterPopup(reader: any, idoc: any, anchorBtn: any) {
        if (idoc.getElementById(RP_FILTER_POPUP_ID)) {
            this._wvCloseReaderFilterPopup(idoc);
            return;
        }
        this._wvOpenReaderFilterPopup(reader, idoc, anchorBtn);
    }

    _wvCloseReaderFilterPopup(idoc: any) {
        try {
            const p = idoc.getElementById(RP_FILTER_POPUP_ID);
            if (p) p.remove();
        } catch (_) {}
        if (this._wvReaderFilterDismiss) {
            try {
                const { docs, wins, onDown, onKey } = this._wvReaderFilterDismiss;
                for (const d of (docs || [])) { try { d.removeEventListener("pointerdown", onDown, true); } catch (_) {} }
                for (const w of (wins || [])) { try { w.removeEventListener("keydown", onKey, true); } catch (_) {} }
            } catch (_) {}
            this._wvReaderFilterDismiss = null;
        }
    }

    _wvOpenReaderFilterPopup(reader: any, idoc: any, anchorBtn: any) {
        try {
            this._wvEnsureReaderPanelStyles(idoc);
            const popup = idoc.createElementNS(NS_HTML_RP, "div");
            popup.id = RP_FILTER_POPUP_ID;
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            (idoc.body || idoc.documentElement).appendChild(popup);

            // Position under the anchor button, right-aligned to stay on-screen.
            const r = anchorBtn.getBoundingClientRect();
            const pw = popup.offsetWidth || 240;
            let left = r.left;
            const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
            if (left + pw > vw - 6) left = Math.max(6, vw - pw - 6);
            popup.style.left = left + "px";
            popup.style.top = (r.bottom + 4) + "px";

            // Dismiss on a click ANYWHERE else in the UI / Escape. The popup
            // lives in the reader-app iframe, so we listen across every
            // reachable document: the reader app doc, the chrome window
            // (item pane, tabs, collections), and the inner content iframes
            // (PDF.js / EPUB page) — events don't cross iframe boundaries,
            // so one listener per document is needed.
            const onDown = (e: any) => {
                try {
                    const t = e.target;
                    if (t && popup.contains && popup.contains(t)) return;
                    if (anchorBtn && (anchorBtn === t || (anchorBtn.contains && anchorBtn.contains(t)))) return;
                    this._wvCloseReaderFilterPopup(idoc);
                } catch (_) {}
            };
            const onKey = (e: any) => {
                if (e.key === "Escape") { e.preventDefault(); this._wvCloseReaderFilterPopup(idoc); }
            };
            const docs: any[] = [idoc];
            const wins: any[] = [];
            try { const w = idoc.defaultView; if (w) wins.push(w); } catch (_) {}
            try {
                const top = idoc.defaultView && idoc.defaultView.top;
                if (top && top.document && docs.indexOf(top.document) < 0) { docs.push(top.document); wins.push(top); }
            } catch (_) {}
            // Nested content iframes (PDF.js / EPUB page) — walk 2 levels so
            // a click on the page itself also dismisses.
            const collectFrames = (doc2: any, depth: number) => {
                if (!doc2 || depth > 2) return;
                try {
                    for (const f of doc2.querySelectorAll("iframe")) {
                        try {
                            const d = f.contentDocument;
                            if (d && docs.indexOf(d) < 0) { docs.push(d); collectFrames(d, depth + 1); }
                        } catch (_) {}
                    }
                } catch (_) {}
            };
            collectFrames(idoc, 1);
            // Also the primary view's own iframe doc (robust for PDF.js).
            try {
                const ir = reader._internalReader;
                const v = ir && (ir._primaryView || ir._lastView);
                const vd = v && v._iframeWindow && v._iframeWindow.document;
                if (vd && docs.indexOf(vd) < 0) docs.push(vd);
            } catch (_) {}
            for (const d of docs) { try { d.addEventListener("pointerdown", onDown, true); } catch (_) {} }
            for (const w of wins) { try { w.addEventListener("keydown", onKey, true); } catch (_) {} }
            this._wvReaderFilterDismiss = { docs, wins, onDown, onKey };
        } catch (e) {
            Zotero.debug("[Weavero] _wvOpenReaderFilterPopup err: " + e);
        }
    }

    /** (Re)build the popup body using the EXACT library-filter markup so the
     *  reader filter is visually identical: hidden section titles, icon-only
     *  `.wv-filter-opt` chips with `data-selected`/`data-excluded`, type icons
     *  wrapped in a `.wv-filter-or-inline` pill, colour swatches, the Has
     *  Comment speech-bubble tile, and tag chips. Click = include, Alt+click
     *  = exclude (mirrors `_toggleIncludeExclude`). */
    _wvRenderReaderFilterPopup(reader: any, idoc: any, popup: any) {
        while (popup.firstChild) popup.firstChild.remove();
        try { popup.style.colorScheme = (this._bmIsDark && this._bmIsDark(idoc.defaultView)) ? "dark" : "light"; } catch (_) {}
        const st = this._wvReaderFilterState(reader);
        const anns = this._wvReaderAnnotations(reader);

        // What's present in this document.
        const typesPresent = new Set<string>();
        const colorsPresent = new Set<string>();
        const tagColors: { [k: string]: string } = {};
        const tagsPresent = new Set<string>();
        const addedByNames = new Set<string>();    // by display name (== native authorName)
        const modifiedByNames = new Set<string>();
        let anyComment = false;
        for (const a of anns) {
            try {
                if (a.annotationType) typesPresent.add(a.annotationType);
                if (a.annotationColor) colorsPresent.add(a.annotationColor);
                if (a.annotationComment) anyComment = true;
                for (const t of (a.getTags() || [])) if (t && t.tag) tagsPresent.add(t.tag);
                if (a.createdByUserID != null) addedByNames.add(this._wvUserName(a.createdByUserID));
                if (a.lastModifiedByUserID != null) modifiedByNames.add(this._wvUserName(a.lastModifiedByUserID));
            } catch (_) {}
        }
        const nat = this._wvReaderNativeIncludes(reader);

        // Values present in the CURRENTLY-VISIBLE (filtered) annotation set —
        // chips whose value isn't here get faded (like Zotero's Tag Selector).
        const visible = anns.filter((a: any) =>
            this._wvReaderPluginMatch(st, a) && this._wvReaderNativeMatch(a, nat));
        const actColors = new Set<string>();
        const actTags = new Set<string>();
        const actTypes = new Set<string>();
        const actAddedBy = new Set<string>();
        const actModifiedBy = new Set<string>();
        for (const a of visible) {
            if (a.annotationColor) actColors.add(a.annotationColor);
            if (a.annotationType) actTypes.add(a.annotationType);
            for (const t of (a.getTags() || [])) if (t && t.tag) actTags.add(t.tag);
            if (a.createdByUserID != null) actAddedBy.add(this._wvUserName(a.createdByUserID));
            if (a.lastModifiedByUserID != null) actModifiedBy.add(this._wvUserName(a.lastModifiedByUserID));
        }
        // Added By / Modified By are group-library-only (createdByUserID is
        // never set in My Library).
        let isGroupLib = false;
        try {
            const libID = (Zotero.Items.get(reader.itemID) || {}).libraryID;
            const lib: any = Zotero.Libraries.get(libID);
            isGroupLib = !!(lib && lib.libraryType === "group");
        } catch (_) {}
        // Tag colours (for the coloured dot), from the library's colour map.
        try {
            const libID = (this.libraryIDFromReader && this.libraryIDFromReader(reader))
                || (Zotero.Items.get(reader.itemID) || {}).libraryID;
            const cols = Zotero.Tags.getColors ? Zotero.Tags.getColors(libID) : null;
            if (cols && cols.forEach) cols.forEach((v: any, k: string) => { if (v && v.color) tagColors[k] = v.color; });
        } catch (_) {}

        const NS = NS_HTML_RP;
        const mk = (tag: string, cls?: string) => {
            const el = idoc.createElementNS(NS, tag);
            if (cls) el.className = cls;
            return el;
        };
        const stack = mk("div", "wv-rf-stack");
        popup.appendChild(stack);

        // Header + Clear / Clear-and-Close (mirrors the library filter).
        const head = mk("div", "wv-rf-head");
        const title = mk("div", "wv-rf-title");
        title.textContent = "Filter annotations";
        head.appendChild(title);
        const clearState = () => {
            st.types = []; st.typesExcl = []; st.colorsExcl = []; st.tagsExcl = [];
            st.addedByExcl = []; st.modifiedBy = []; st.modifiedByExcl = [];
            st.hasComment = null; st.hasRelated = null; st.hasLink = null;
            // The hide-annotations toggle counts as a filter — clear it too.
            if (this._wvReaderAnnotationsHidden(reader)) this._wvReaderApplyHideAnnotations(reader, false);
            // Also clear the native include channel (colour/tag/author).
            this._wvApplyReaderFilter(reader, { colors: [], tags: [], authors: [] });
        };
        // "Clear" — clears every filter but keeps the popup open.
        const clearBtn = mk("button", "wv-filter-clear-btn");
        clearBtn.type = "button";
        clearBtn.textContent = "Clear";
        clearBtn.title = "Clear all filters (keep this window open)";
        clearBtn.setAttribute("aria-label", "Clear all filters");
        clearBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            clearState();
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);
        });
        // Red × — "Clear and Close": clears every filter AND dismisses.
        const clearCloseBtn = mk("button", "wv-filter-clear-icon");
        clearCloseBtn.type = "button";
        clearCloseBtn.title = "Clear and Close";
        clearCloseBtn.setAttribute("aria-label", "Clear and Close");
        clearCloseBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            clearState();
            this._wvReaderEnsureFilterButton(reader, idoc);
            this._wvCloseReaderFilterPopup(idoc);
        });
        // Both are only meaningful when something is set — hide otherwise
        // (same visibility rule as the library popup's renderHeader).
        const anyActive = this._wvReaderFilterActive(reader);
        clearBtn.style.visibility = anyActive ? "" : "hidden";
        clearCloseBtn.style.visibility = anyActive ? "" : "hidden";
        head.appendChild(clearBtn);
        head.appendChild(clearCloseBtn);
        stack.appendChild(head);

        if (!anns.length) {
            const empty = mk("div", "wv-rf-empty");
            empty.textContent = "No annotations in this document.";
            stack.appendChild(empty);
            return;
        }

        // An icon-only `.wv-filter-opt` chip with include/exclude state.
        const mkOpt = (incl: string[], excl: string[], value: string, title2: string,
                       fillIcon: (b: any) => void, onChange: (next: any) => void, active?: Set<string>) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            const sel = incl.indexOf(value) >= 0, exc = excl.indexOf(value) >= 0;
            if (sel) btn.dataset.selected = "true";
            if (exc) btn.dataset.excluded = "true";
            if (active && !sel && !exc && !active.has(value)) btn.dataset.inactive = "true";
            fillIcon(btn);
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(value, incl.slice(), excl.slice(), e.altKey);
                onChange.call(null, next);
                this._wvApplyReaderFilter(reader);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };
        const addRow = (build: (opts: any) => void, groupBg?: boolean, label?: string) => {
            const sec = mk("div", "wv-filter-section" + (groupBg ? " wv-filter-or-group" : ""));
            const t = mk("div", "wv-filter-section-title"); sec.appendChild(t);
            // Optional visible label — used to separate the otherwise-identical
            // Added By / Modified By person rows.
            if (label) { const lb = mk("span", "wv-rf-grouplabel"); lb.textContent = label; sec.appendChild(lb); }
            const opts = mk("div", "wv-filter-options");
            build(opts);
            if (opts.childNodes.length) { sec.appendChild(opts); stack.appendChild(sec); }
        };
        // A small heading on its OWN line (full-width chips below it) — used to
        // label the Added By / Modified By rows without eating chip width.
        const addHead = (text: string) => {
            const h = mk("div", "wv-rf-grouphead");
            h.textContent = text;
            stack.appendChild(h);
        };
        // Chip whose INCLUDE lives in the reader's native filter channel
        // (colour/tag/author) and whose EXCLUDE lives in plugin state. dimKey
        // ∈ "colors"|"tags"|"authors". inclArr = native include snapshot;
        // exclArr = the st.*Excl array (mutated in place).
        const mkNativeOpt = (dimKey: string, inclArr: string[], exclArr: string[],
                             value: string, title2: string, fillIcon: (b: any) => void, active?: Set<string>) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            const sel = inclArr.indexOf(value) >= 0, exc = exclArr.indexOf(value) >= 0;
            if (sel) btn.dataset.selected = "true";
            if (exc) btn.dataset.excluded = "true";
            if (active && !sel && !exc && !active.has(value)) btn.dataset.inactive = "true";
            fillIcon(btn);
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                // Read the LIVE native include at click time so a sidebar-strip
                // change to the same dimension (while the popup is open) isn't
                // clobbered by a stale render-time snapshot.
                const live = (this._wvReaderNativeIncludes(reader) as any)[dimKey] || [];
                const next = this._toggleIncludeExclude(value, live.slice(), exclArr.slice(), e.altKey);
                exclArr.length = 0; for (const v of next.exclude) exclArr.push(v);
                const inc: any = {}; inc[dimKey] = next.include;
                this._wvApplyReaderFilter(reader, inc);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };
        // Tri-state icon tile (Has Related / Has Link / Has Comment):
        // click=require / Alt+click=require-absent / re-click=off.
        const mkTriTile = (cur: any, title2: string, iconBuilder: () => any, apply: (alt: boolean) => void) => {
            const btn = mk("button", "wv-filter-opt wv-filter-opt-icon");
            btn.type = "button";
            btn.title = title2;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            try { const ic = iconBuilder(); if (ic) btn.appendChild(ic); } catch (_) {}
            btn.addEventListener("click", (e: any) => {
                e.stopPropagation();
                apply(!!e.altKey);
                this._wvApplyReaderFilter(reader);
                this._wvRenderReaderFilterPopup(reader, idoc, popup);
                this._wvReaderEnsureFilterButton(reader, idoc);
            });
            return btn;
        };

        // Order (annotation-first per user request): Colour → Type+Has-Comment
        // → Cross-level (Has Related, Has Link) → Tags → Added By → Modified By.

        // ---- Annotation Colour (swatches) — include via native channel.
        addRow((opts: any) => {
            for (const def of this._ANNOTATION_COLORS) {
                if (!colorsPresent.has(def.value)) continue;
                // Black is the ink/text-only "extra" colour — push it to the
                // right edge after a separator, same as the library filter.
                if (def.value === "#000000") {
                    const sep = mk("div", "wv-filter-vertical-separator");
                    sep.style.marginLeft = "auto";
                    opts.appendChild(sep);
                }
                opts.appendChild(mkNativeOpt("colors", nat.colors, st.colorsExcl, def.value,
                    def.label + " — Alt+click to exclude",
                    (b: any) => { const sw = mk("span", "wv-chip-swatch"); sw.style.background = def.value; b.appendChild(sw); },
                    actColors));
            }
        }, true);

        // ---- Annotation Type (icons in an OR-inline pill) + Has Comment.
        addRow((opts: any) => {
            const grp = mk("div", "wv-filter-or-inline");
            let any = false;
            for (const def of this._ANNOTATION_TYPES) {
                if (!typesPresent.has(def.value)) continue;
                any = true;
                const btn = mkOpt(st.types, st.typesExcl, def.value,
                    def.label + " — Alt+click to exclude",
                    (b: any) => { const img = mk("img"); img.className = "wv-filter-svg"; img.src = this._wvReaderIconUri(def.icon) || def.icon; b.appendChild(img); },
                    (next: any) => { st.types = next.include; st.typesExcl = next.exclude; },
                    actTypes);
                grp.appendChild(btn);
            }
            if (any) opts.appendChild(grp);
            if (anyComment) {
                const sep = mk("div", "wv-filter-vertical-separator");
                sep.style.marginLeft = "auto";
                opts.appendChild(sep);
                opts.appendChild(this._wvMakeReaderHasCommentTile(reader, idoc, popup, st));
            }
        });

        // ---- Cross-level: Has Related, Has Link (single-level here → no
        //      per-kind scope arrow). AND filters, so no OR-group tint.
        addRow((opts: any) => {
            opts.appendChild(mkTriTile(st.hasRelated,
                "Has Related — annotations with at least one related-item link. Alt+click to exclude.",
                () => { const img = mk("img"); img.className = "wv-filter-svg"; img.src = this._wvReaderIconUri(RP_RELATED_ICON) || RP_RELATED_ICON; img.style.color = "var(--accent-wood)"; return img; },
                (alt: boolean) => { st.hasRelated = alt ? (st.hasRelated === false ? null : false) : (st.hasRelated === true ? null : true); }));
            opts.appendChild(mkTriTile(st.hasLink,
                "Has Link — annotations whose comment contains a URL. Alt+click to exclude.",
                () => this._makeLinkSvg(idoc),
                (alt: boolean) => { st.hasLink = alt ? (st.hasLink === false ? null : false) : (st.hasLink === true ? null : true); }));
        });

        // ---- Tags (coloured dot when the tag has a colour) — include via native.
        if (tagsPresent.size) {
            const tags = Array.from(tagsPresent).sort((a, b) => a.localeCompare(b));
            addRow((opts: any) => {
                for (const tg of tags) {
                    const col = tagColors[tg];
                    opts.appendChild(mkNativeOpt("tags", nat.tags, st.tagsExcl, tg,
                        "Tag: " + tg + " — Alt+click to exclude",
                        (b: any) => {
                            if (col) { b.classList.add("wv-filter-tag-colored"); b.style.setProperty("--wv-tag-color", col); }
                            const sp = mk("span"); sp.textContent = tg; b.appendChild(sp);
                        },
                        actTags));
                }
            }, true);
        }

        // ---- Added By (group libraries only) — include via native authors.
        //      Heading on its own line (chips full-width below) so the label
        //      doesn't eat chip space, and to separate it from Modified By.
        if (isGroupLib && addedByNames.size) {
            const names = Array.from(addedByNames).sort((a, b) => a.localeCompare(b));
            addHead("Added by");
            addRow((opts: any) => {
                for (const name of names) {
                    opts.appendChild(mkNativeOpt("authors", nat.authors, st.addedByExcl, name,
                        "Added by " + name + " — Alt+click to exclude",
                        (b: any) => { const ic = mk("span", "wv-rf-user-svg"); ic.innerHTML = RP_USER_SVG; b.appendChild(ic); const sp = mk("span"); sp.textContent = name; b.appendChild(sp); },
                        actAddedBy));
                }
            }, true);
        }
        // ---- Modified By (group libraries only) — plugin-only (no native dim).
        if (isGroupLib && modifiedByNames.size) {
            const names = Array.from(modifiedByNames).sort((a, b) => a.localeCompare(b));
            addHead("Modified by");
            addRow((opts: any) => {
                for (const name of names) {
                    opts.appendChild(mkOpt(st.modifiedBy, st.modifiedByExcl, name,
                        "Modified by " + name + " — Alt+click to exclude",
                        (b: any) => { const ic = mk("span", "wv-rf-user-svg"); ic.innerHTML = RP_USER_SVG; b.appendChild(ic); const sp = mk("span"); sp.textContent = name; b.appendChild(sp); },
                        (next: any) => { st.modifiedBy = next.include; st.modifiedByExcl = next.exclude; },
                        actModifiedBy));
                }
            }, true);
        }

        // ---- Bottom hint (same as the library filter).
        const bottom = mk("div", "wv-filter-bottom-controls");
        const hint = mk("span", "wv-filter-bottom-hint");
        hint.textContent = "Alt+Click to exclude";
        bottom.appendChild(hint);
        stack.appendChild(bottom);

        // ---- "Hide annotations in the reader" — checkbox with a fixed label
        // (mirrors the library filter's bottom display toggles). Checked =
        // hidden in the document view; the sidebar list is unaffected.
        const hidden = this._wvReaderAnnotationsHidden(reader);
        const hideRow = mk("label", "wv-rf-hideann");
        hideRow.title = "Hide the annotation marks in the document view (the sidebar list is unaffected).";
        const hideCb: any = mk("input");
        hideCb.type = "checkbox";
        hideCb.checked = hidden;
        const hideLbl = mk("span");
        hideLbl.textContent = "Hide Annotations in the Reader";
        hideRow.appendChild(hideCb);
        hideRow.appendChild(hideLbl);
        hideCb.addEventListener("change", (e: any) => {
            e.stopPropagation();
            this._wvReaderApplyHideAnnotations(reader, !!hideCb.checked);
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);   // refresh the funnel dot
        });
        stack.appendChild(hideRow);
    }

    _wvReaderAnnotationsHidden(reader: any) {
        if (!this._wvReaderHideAnnWM) this._wvReaderHideAnnWM = new WeakMap();
        return !!this._wvReaderHideAnnWM.get(reader);
    }

    /** Show/hide annotation marks in the reader's document view(s).
     *
     *  Two paths, chosen by view type (NOT by Zotero version):
     *   - EPUB / snapshot (DOM views) implement `setShowAnnotations`, so the
     *     reader's native `showAnnotations()` works — one clean call.
     *   - PDF does NOT: `setShowAnnotations` is defined only on the DOM view
     *     (`reader/src/dom/common/dom-view.tsx`), never on the PDF view, in
     *     every Zotero version (checked against latest reader source). And PDF
     *     highlights/underlines/ink are painted on the page CANVAS, not a
     *     hideable DOM layer. So for PDF we re-render the views without
     *     annotations via `setAnnotations([])` (hide) / re-apply the filter
     *     (show). This PDF fallback is permanent, not a version stopgap.
     *
     *  The sidebar list (driven by `_state.annotations`) is untouched either
     *  way. We feature-detect `pv.setShowAnnotations` so each view type takes
     *  the right path automatically. */
    _wvReaderApplyHideAnnotations(reader: any, hide: boolean) {
        try {
            if (!this._wvReaderHideAnnWM) this._wvReaderHideAnnWM = new WeakMap();
            this._wvReaderHideAnnWM.set(reader, !!hide);
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            // Weavero's OWN DOM overlays (note/link/relation badges,
            // text-annotation controls) and the PDF text-annotation layer are
            // NOT part of Zotero's annotation rendering, so neither
            // showAnnotations nor setAnnotations([]) removes them — hide those
            // via CSS in each view's inner doc, both paths.
            this._wvReaderSetOverlayHideCss(reader, hide);
            // Native path — only EPUB/snapshot views support it (see above).
            if (pv && typeof pv.setShowAnnotations === "function" && typeof ir.showAnnotations === "function") {
                try { ir.showAnnotations(!hide); return; } catch (_) {}
            }
            // PDF (and any view lacking setShowAnnotations): the annotation
            // manager re-renders the view from the filter, so a one-shot clear
            // loses the race. Instead BLOCK the view's setAnnotations (always
            // render []) while hidden — the filter then updates only the
            // sidebar (driven by _state.annotations). On show, unblock and
            // re-render the real (filtered) set.
            if (hide) this._wvReaderSetViewAnnotationsBlocked(reader, true);
            else { this._wvReaderSetViewAnnotationsBlocked(reader, false); try { this._wvApplyReaderFilter(reader); } catch (_) {} }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderApplyHideAnnotations err: " + e);
        }
    }

    /** Inject/remove a CSS rule in each view's inner doc that hides the DOM
     *  overlays Zotero's annotation hiding doesn't touch: the PDF
     *  `.customAnnotationLayer` (text-annotation textareas + Weavero badges),
     *  Weavero's `.wv-marker-badge` / `.wv-text-annotation-btn`, and the EPUB
     *  `.annotation-container`. Doubled-class selectors out-specify Weavero's
     *  own anti-flash rule (`.page > .customAnnotationLayer{display:block!important}`). */
    _wvReaderSetOverlayHideCss(reader: any, hide: boolean) {
        try {
            const ir = reader._internalReader;
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView, ir && ir._lastView]) {
                try {
                    const d = v && v._iframeWindow && v._iframeWindow.document;
                    if (!d) continue;
                    let st = d.getElementById("wv-hide-annotations");
                    if (hide) {
                        if (!st) { st = d.createElement("style"); st.id = "wv-hide-annotations"; (d.head || d.documentElement).appendChild(st); }
                        st.textContent =
                            ".page > .customAnnotationLayer.customAnnotationLayer,"
                            + ".page.loading > .customAnnotationLayer.customAnnotationLayer,"
                            + ".page.loadingIcon > .customAnnotationLayer.customAnnotationLayer,"
                            + ".customAnnotationLayer.customAnnotationLayer{display:none !important;}"
                            + ".wv-marker-badge.wv-marker-badge,.wv-text-annotation-btn.wv-text-annotation-btn{display:none !important;}"
                            + ".annotation-container.annotation-container{display:none !important;}";
                    } else if (st) { st.remove(); }
                } catch (_) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderSetOverlayHideCss err: " + e);
        }
    }

    /** Block/unblock the rendered annotations in every view. While blocked, the
     *  view's `setAnnotations` always renders [] (so the annotation manager's
     *  filter re-renders can't bring annotations back into the view) — the
     *  sidebar (driven by `_state.annotations`) is unaffected. Unblocking
     *  restores the original method. */
    _wvReaderSetViewAnnotationsBlocked(reader: any, block: boolean) {
        try {
            const ir = reader._internalReader;
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            const mkEmpty = () => { try { return (iwin && Components && Components.utils) ? Components.utils.cloneInto([], iwin) : []; } catch (_) { return []; } };
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView, ir && ir._lastView]) {
                if (!v || typeof v.setAnnotations !== "function") continue;
                if (block) {
                    if (!v._wvOrigSetAnnotations) {
                        v._wvOrigSetAnnotations = v.setAnnotations;
                        v.setAnnotations = function () { try { v._wvOrigSetAnnotations.call(v, mkEmpty()); } catch (_) {} };
                    }
                    try { v.setAnnotations(); } catch (_) {}   // clear now
                } else if (v._wvOrigSetAnnotations) {
                    v.setAnnotations = v._wvOrigSetAnnotations;
                    v._wvOrigSetAnnotations = null;
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderSetViewAnnotationsBlocked err: " + e);
        }
    }

    /** Display name for a group-library user ID. */
    _wvUserName(uid: any) {
        try {
            const n = Zotero.Users && Zotero.Users.getName && Zotero.Users.getName(uid);
            if (n) return n;
        } catch (_) {}
        return "User " + uid;
    }

    /** Has Comment tile mirroring the library's: speech-bubble glyph,
     *  click=require / Alt+click=require-absent / re-click=off. */
    _wvMakeReaderHasCommentTile(reader: any, idoc: any, popup: any, st: any) {
        const btn = idoc.createElementNS(NS_HTML_RP, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        if (st.hasComment === true) btn.dataset.selected = "true";
        else if (st.hasComment === false) btn.dataset.excluded = "true";
        btn.title = "Has Comment — annotations with non-empty comment text. Alt+click to exclude.";
        try { btn.appendChild(this._makeHasCommentSvg(idoc)); } catch (_) {}
        btn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            if (e.altKey) st.hasComment = (st.hasComment === false) ? null : false;
            else st.hasComment = (st.hasComment === true) ? null : true;
            this._wvApplyReaderFilter(reader);
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            this._wvReaderEnsureFilterButton(reader, idoc);
        });
        return btn;
    }

    /** Plugin-layer match (dimensions the native filter lacks + all excludes).
     *  An annotation is hidden (added to hiddenIDs) when this returns false. */
    _wvReaderPluginMatch(st: any, a: any) {
        try {
            const ty = a.annotationType;
            if (st.types.length && st.types.indexOf(ty) < 0) return false;
            if (st.typesExcl.length && st.typesExcl.indexOf(ty) >= 0) return false;
            if (st.colorsExcl.length && st.colorsExcl.indexOf(a.annotationColor) >= 0) return false;
            const hasC = !!(a.annotationComment && String(a.annotationComment).trim());
            if (st.hasComment === true && !hasC) return false;
            if (st.hasComment === false && hasC) return false;
            if (st.tagsExcl.length) {
                const tset = new Set((a.getTags() || []).map((t: any) => t.tag));
                for (const tg of st.tagsExcl) if (tset.has(tg)) return false;
            }
            if (st.hasRelated !== null) {
                const rel = !!(a.relatedItems && a.relatedItems.length);
                if (st.hasRelated === true && !rel) return false;
                if (st.hasRelated === false && rel) return false;
            }
            if (st.hasLink !== null) {
                const link = !!this.hasURI(a.annotationComment || "");
                if (st.hasLink === true && !link) return false;
                if (st.hasLink === false && link) return false;
            }
            if (st.addedByExcl.length) {
                const an = a.createdByUserID != null ? this._wvUserName(a.createdByUserID) : null;
                if (an != null && st.addedByExcl.indexOf(an) >= 0) return false;
            }
            if (st.modifiedBy.length || st.modifiedByExcl.length) {
                const mn = a.lastModifiedByUserID != null ? this._wvUserName(a.lastModifiedByUserID) : null;
                if (st.modifiedBy.length && (mn == null || st.modifiedBy.indexOf(mn) < 0)) return false;
                if (mn != null && st.modifiedByExcl.indexOf(mn) >= 0) return false;
            }
            return true;
        } catch (_) { return true; }
    }

    /** Native-channel match (colour/tag/author INCLUDES the reader applies). */
    _wvReaderNativeMatch(a: any, nat: any) {
        try {
            if (nat.colors.length && nat.colors.indexOf(a.annotationColor) < 0) return false;
            if (nat.tags.length) {
                const tset = new Set((a.getTags() || []).map((t: any) => t.tag));
                let any = false;
                for (const tg of nat.tags) if (tset.has(tg)) { any = true; break; }
                if (!any) return false;
            }
            if (nat.authors.length) {
                const an = a.createdByUserID != null ? this._wvUserName(a.createdByUserID) : null;
                if (an == null || nat.authors.indexOf(an) < 0) return false;
            }
            return true;
        } catch (_) { return true; }
    }

    /** Compute the non-matching annotation keys and push them to the reader's
     *  annotation manager as hiddenIDs — hides in BOTH sidebar and view. */
    _wvApplyReaderFilter(reader: any, inc?: any) {
        try {
            const st = this._wvReaderFilterState(reader);
            const anns = this._wvReaderAnnotations(reader);
            // Colour / tag / author INCLUDES go through the native channel
            // (shared with the sidebar strip). `inc` lets a chip click pass the
            // just-toggled include array; otherwise keep the current native one.
            const natCur = this._wvReaderNativeIncludes(reader);
            const colors = (inc && inc.colors) ? inc.colors : natCur.colors;
            const tags = (inc && inc.tags) ? inc.tags : natCur.tags;
            const authors = (inc && inc.authors) ? inc.authors : natCur.authors;
            // hiddenIDs carries everything the native filter can't: type,
            // has-comment/related/link, modified-by, and ALL excludes.
            const hiddenIDs = anns.filter(a => !this._wvReaderPluginMatch(st, a)).map(a => a.key);
            const ir = reader._internalReader;
            if (ir && typeof ir.setFilter === "function") {
                const iwin = reader._iframeWindow
                    || (reader._iframe && reader._iframe.contentWindow);
                let arg: any = { colors, tags, authors, hiddenIDs };
                try {
                    if (iwin && Components && Components.utils) {
                        arg = Components.utils.cloneInto(arg, iwin);
                    }
                } catch (_) {}
                ir.setFilter(arg);
            }
            // When "Hide Annotations in the Reader" is on (fallback path), the
            // view's setAnnotations is blocked, so this filter only updates the
            // sidebar — nothing extra to do here.
        } catch (e) {
            Zotero.debug("[Weavero] _wvApplyReaderFilter err: " + e);
        }
    }

    // ---- Feature B: Bookmarks tab -----------------------------------------

    /** Resolve a row icon src for use inside the reader iframe (which blocks
     *  chrome:// loads). data: URIs pass through; chrome/resource SVGs are
     *  fetched + cached as data: URIs, re-rendering the list when ready.
     *  Returns null while a fetch is pending (caller uses a fallback glyph). */
    _wvReaderResolveRowIcon(reader: any, idoc: any, src: string) {
        if (!src) return null;
        if (src.indexOf("data:") === 0) return src;
        if (src.indexOf("chrome://") !== 0 && src.indexOf("resource://") !== 0) return src;
        if (!/\.svg(\?|$)/.test(src)) return null;   // only SVGs are inlinable this way
        const cached = this._wvReaderIconUri(src);
        if (cached) return cached;
        if (!this._wvReaderIconCache) this._wvReaderIconCache = {};
        if (!this._wvReaderIconFetching) this._wvReaderIconFetching = {};
        if (!this._wvReaderIconFetching[src]) {
            this._wvReaderIconFetching[src] = true;
            fetch(src).then((r: any) => r.text()).then((txt: string) => {
                this._wvReaderIconCache[src] = "data:image/svg+xml," + encodeURIComponent(txt);
                delete this._wvReaderIconFetching[src];
                try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
            }).catch(() => { delete this._wvReaderIconFetching[src]; });
        }
        return null;
    }

    /** { libraryID, itemKey, att } for the reader's attachment, or null. */
    _wvReaderAtt(reader: any) {
        try {
            const att: any = Zotero.Items.get(reader.itemID);
            if (att) return { libraryID: att.libraryID, itemKey: att.key, att };
        } catch (_) {}
        return null;
    }

    _wvReaderBmActive(reader: any) {
        if (!this._wvReaderBmActiveWM) this._wvReaderBmActiveWM = new WeakMap();
        // An explicit choice this session wins; otherwise fall back to the
        // persisted pref. Read every scan so the Bookmarks tab is restored AND
        // STAYS restored — even if the reader's own late tab-restore re-selects
        // a native tab after us (`_wvReaderApplyBmTabState` re-asserts).
        if (this._wvReaderBmActiveWM.has(reader)) return !!this._wvReaderBmActiveWM.get(reader);
        try {
            const att = this._wvReaderAtt(reader);
            if (att) {
                const m = JSON.parse(String(Zotero.Prefs.get("weavero.readerBmTabs") || "{}"));
                return !!m[att.libraryID + ":" + att.itemKey];
            }
        } catch (_) {}
        return false;
    }
    _wvReaderSetBmActive(reader: any, idoc: any, on: boolean) {
        if (!this._wvReaderBmActiveWM) this._wvReaderBmActiveWM = new WeakMap();
        this._wvReaderBmActiveWM.set(reader, !!on);
        this._wvReaderSaveBmActive(reader, !!on);
        if (on) this._wvReaderRenderBmList(reader, idoc);
        this._wvReaderApplyBmTabState(reader, idoc);
    }

    /** Open readers whose Bookmarks pane is currently active (visible). */
    _wvReaderVisibleBmReaders(): any[] {
        const out: any[] = [];
        try {
            for (const r of ((Zotero.Reader && Zotero.Reader._readers) || [])) {
                try {
                    if (!this._wvReaderBmActive(r)) continue;
                    const iw = r._iframeWindow || (r._iframe && r._iframe.contentWindow);
                    if (iw && iw.document) out.push({ reader: r, idoc: iw.document });
                } catch (_) {}
            }
        } catch (_) {}
        return out;
    }

    /** Live-refresh handler for the bookmarks pane, wired to a Zotero.Notifier
     *  observer in index.ts. Refreshes a VISIBLE Bookmarks pane when a bookmark's
     *  underlying annotation/item/collection is modified, so default names track
     *  edits in real time. Cheap on purpose: returns immediately unless a pane is
     *  visible AND a changed id is actually bookmarked there; the re-render is
     *  debounced to coalesce edit bursts. Never modifies the item. */
    _wvReaderBmOnNotify(event: string, type: string, ids: any[]) {
        if (event !== "modify" && event !== "add") return;
        if (type !== "item" && type !== "collection") return;
        const panes = this._wvReaderVisibleBmReaders();
        if (!panes.length) return;   // nothing visible → nothing to refresh
        // Resolve changed ids → keys (existing items/collections only).
        const changed = new Set<string>();
        try {
            for (const id of (ids || [])) {
                const obj = type === "item" ? Zotero.Items.get(id) : Zotero.Collections.get(id);
                if (obj && obj.key) changed.add(obj.key);
            }
        } catch (_) {}
        if (!changed.size) return;
        // Does any changed key match a bookmark in a visible pane?
        let hit = false;
        for (const p of panes) {
            const att = this._wvReaderAtt(p.reader); if (!att) continue;
            const keys = this._bmReaderBookmarkedKeys(att.libraryID, att.itemKey);
            const set = type === "item" ? keys.items : keys.collections;
            for (const k of changed) { if (set.has(k)) { hit = true; break; } }
            if (hit) break;
        }
        if (!hit) return;
        // Debounce: coalesce a burst of edits into one re-render of visible panes.
        try {
            const win = Zotero.getMainWindow();
            if (this._wvReaderBmNotifyTimer && win) win.clearTimeout(this._wvReaderBmNotifyTimer);
            const st = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            this._wvReaderBmNotifyTimer = st(() => {
                this._wvReaderBmNotifyTimer = null;
                for (const p of this._wvReaderVisibleBmReaders()) {
                    try { this._wvReaderRenderBmList(p.reader, p.idoc); } catch (_) {}
                }
            }, 250);
        } catch (_) {}
    }

    /** Remember per-attachment whether the Bookmarks tab is the active reader
     *  sidebar tab, so it can be restored on reopen/restart (Zotero restores
     *  its own native tabs, but doesn't know about ours). Stored in a small
     *  JSON pref keyed by libraryID:itemKey; only "active" entries are kept. */
    _wvReaderSaveBmActive(reader: any, on: boolean) {
        try {
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            const key = att.libraryID + ":" + att.itemKey;
            let map: any = {};
            try { map = JSON.parse(String(Zotero.Prefs.get("weavero.readerBmTabs") || "{}")) || {}; } catch (_) {}
            if (on) map[key] = true; else delete map[key];
            Zotero.Prefs.set("weavero.readerBmTabs", JSON.stringify(map));
        } catch (_) {}
    }

    /** Inject the Bookmarks tab (beside Outline) and its view panel. */
    _wvReaderEnsureBookmarksTab(reader: any, idoc: any) {
        try {
            const tablist = idoc.querySelector("#sidebarContainer .sidebar-toolbar .start")
                || idoc.querySelector(".sidebar-toolbar .start");
            const content = idoc.getElementById("sidebarContent");
            if (!tablist || !content) return;

            // Record the SOURCE document of any drag that starts in this
            // reader (center pane or sidebar share this iframe document).
            // Stored on a plugin-global so a drop in ANOTHER reader window
            // can tell whether the drag came from the same document — which
            // drives the per-section "no drop" cursor (a same-doc item may
            // only land in "In this document"; a cross-doc item only in
            // "Elsewhere"). Idempotent per idoc; cleared on dragend.
            if (!(idoc as any)._wvDragSrcHooked) {
                (idoc as any)._wvDragSrcHooked = true;
                idoc.addEventListener("dragstart", () => {
                    try {
                        const a = this._wvReaderAtt(reader);
                        this._wvDragSourceAttId = (a && a.att) ? a.att.id : null;
                    } catch (_) { this._wvDragSourceAttId = null; }
                }, true);
                idoc.addEventListener("dragend", () => {
                    this._wvDragSourceAttId = null;
                }, true);
            }

            // Tab button.
            let tab = idoc.querySelector("." + RP_BM_TAB_CLASS);
            if (!tab) {
                tab = idoc.createElementNS(NS_HTML_RP, "button");
                tab.className = "toolbar-button " + RP_BM_TAB_CLASS;
                tab.setAttribute("tabindex", "-1");
                tab.setAttribute("role", "tab");
                tab.setAttribute("title", "Bookmarks");
                tab.innerHTML = RP_BM_RIBBON;
                tab.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvReaderSetBmActive(reader, idoc, true);
                });
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) onto the tab to bookmark it (activates the tab).
                tab.addEventListener("dragover", (e: any) => {
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) { e.preventDefault(); tab.classList.add("wv-bm-dropok"); }
                });
                tab.addEventListener("dragleave", () => tab.classList.remove("wv-bm-dropok"));
                tab.addEventListener("drop", (e: any) => {
                    tab.classList.remove("wv-bm-dropok");
                    if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                    if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                    e.preventDefault();
                    const payload = this._wvReaderReadDropPayload(e);
                    this._wvReaderSetBmActive(reader, idoc, true);
                    if (this._wvBmRowDrag) { this._wvReaderDropBmRow(reader, idoc, null); return; }
                    this._wvReaderDropPayload(reader, idoc, payload);
                });
                const outlineTab = idoc.getElementById("viewOutline");
                if (outlineTab && outlineTab.nextSibling) tablist.insertBefore(tab, outlineTab.nextSibling);
                else if (outlineTab) tablist.appendChild(tab);
                else tablist.appendChild(tab);
            }

            // Deactivate our tab whenever a native tab is clicked (one
            // document-level capture listener, survives React re-renders).
            if (!idoc._wvBmTabClickWired) {
                idoc._wvBmTabClickWired = true;
                idoc.addEventListener("click", (e: any) => {
                    try {
                        const t = e.target;
                        if (t && t.closest && t.closest("#viewThumbnail,#viewAnnotations,#viewOutline")) {
                            this._wvReaderSetBmActive(reader, idoc, false);
                        }
                    } catch (_) {}
                }, true);
            }
            // Right-click in the Bookmarks pane → our context menu. The reader
            // SUPPRESSES `contextmenu` (and mousedown/up) in its sidebar — a
            // right-click only surfaces as pointer events / `auxclick` with
            // button 2 (verified live). So we trigger on `auxclick`, capture
            // phase on the window, one listener per window (survives re-renders).
            const ctxWin: any = idoc.defaultView;
            if (ctxWin && !ctxWin._wvBmCtxWired) {
                ctxWin._wvBmCtxWired = true;
                ctxWin.addEventListener("auxclick", (e: any) => {
                    try {
                        if (e.button !== 2) return;
                        const t = e.target;
                        if (!t || !t.closest || !t.closest(".wv-bm-reader-list")) return;
                        e.preventDefault(); e.stopPropagation();
                        this._wvReaderShowBmContextMenu(reader, idoc, e);
                    } catch (_) {}
                }, true);
            }
            // Capture which annotation is being dragged from the sidebar so a
            // drop on our tab/view can bookmark it (MIME-independent).
            if (!idoc._wvBmAnnDragWired) {
                idoc._wvBmAnnDragWired = true;
                idoc.addEventListener("dragstart", (e: any) => {
                    try {
                        const a = e.target && e.target.closest && e.target.closest("[data-sidebar-annotation-id]");
                        this._wvDraggedAnnKey = a ? a.getAttribute("data-sidebar-annotation-id") : null;
                    } catch (_) { this._wvDraggedAnnKey = null; }
                }, true);
                idoc.addEventListener("dragend", () => {
                    this._wvDraggedAnnKey = null;
                    this._wvBmRowDrag = null;
                    this._wvCancelBmSpring();
                    try { const a = this._wvReaderAtt(reader); if (a) this._wvRecollapseAllSprings(reader, idoc, a); } catch (_) {}
                }, true);
            }

            // View panel.
            let view = content.querySelector("." + RP_BM_VIEW_CLASS);
            if (!view) {
                view = idoc.createElementNS(NS_HTML_RP, "div");
                view.className = "viewWrapper " + RP_BM_VIEW_CLASS;
                const head = idoc.createElementNS(NS_HTML_RP, "div");
                head.className = "wv-bm-reader-head";
                const htitle = idoc.createElementNS(NS_HTML_RP, "div");
                htitle.className = "wv-bm-reader-htitle";
                htitle.textContent = "Bookmarks";
                const add = idoc.createElementNS(NS_HTML_RP, "button");
                add.className = "wv-bm-reader-add";
                add.setAttribute("title", "Add a bookmark (anywhere in Zotero)…");
                add.innerHTML = RP_PLUS_SVG;
                add.setAttribute("title", "Add a bookmark — opens the picker focused on this file (expand it to bookmark its annotations)…");
                add.addEventListener("click", () => this._wvReaderAddViaDialog(reader, idoc));
                head.appendChild(htitle);
                head.appendChild(add);
                const list = idoc.createElementNS(NS_HTML_RP, "div");
                list.className = "wv-bm-reader-list";
                view.appendChild(head);
                view.appendChild(list);
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) anywhere on the bookmarks pane to bookmark it.
                view.addEventListener("dragover", (e: any) => {
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) e.preventDefault();
                    // Over the pane but off any row → outside every folder; collapse springs.
                    try { if (!(e.target && e.target.closest && e.target.closest(".wv-bm-reader-row"))) this._wvSpringRecollapseLeft(reader, idoc, this._wvReaderAtt(reader), null); } catch (_) {}
                });
                view.addEventListener("dragleave", (e: any) => {
                    // Cursor left the bookmarks pane entirely → collapse all spring folders.
                    try { if (!view.contains(e.relatedTarget)) { const a = this._wvReaderAtt(reader); if (a) this._wvRecollapseAllSprings(reader, idoc, a); } } catch (_) {}
                });
                view.addEventListener("drop", (e: any) => {
                    if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                    if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                    e.preventDefault();
                    // Reached here = dropped on empty pane area (rows claim their
                    // own drops), so not inside any spring folder → re-collapse all.
                    try { const a = this._wvReaderAtt(reader); if (a) this._wvRecollapseAllSprings(reader, idoc, a); } catch (_) {}
                    if (this._wvBmRowDrag) { this._wvReaderDropBmRow(reader, idoc, null); return; }
                    this._wvReaderDropPayload(reader, idoc, this._wvReaderReadDropPayload(e));
                });
                content.appendChild(view);
                this._wvReaderRenderBmList(reader, idoc);
            }

            // Apply the active state (restored from the pref via _wvReaderBmActive
            // when no explicit choice was made this session).
            this._wvReaderApplyBmTabState(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderEnsureBookmarksTab err: " + e);
        }
    }

    /** Show/hide our view vs the React views via inline display (React owns
     *  the wrappers' className, not their inline style, so this survives
     *  re-renders); toggle the active class on the tabs. */
    _wvReaderApplyBmTabState(reader: any, idoc: any) {
        try {
            const on = this._wvReaderBmActive(reader);
            const content = idoc.getElementById("sidebarContent");
            const view = content && content.querySelector("." + RP_BM_VIEW_CLASS);
            if (!content || !view) return;
            const wrappers = content.querySelectorAll(".viewWrapper");
            for (const w of wrappers) {
                if (w === view) continue;
                w.style.display = on ? "none" : "";
            }
            view.style.display = on ? "flex" : "none";
            const myTab = idoc.querySelector("." + RP_BM_TAB_CLASS);
            if (myTab) myTab.classList.toggle("active", on);
            const sc = idoc.getElementById("sidebarContainer");
            if (sc) sc.classList.toggle(RP_BM_TAB_ON, on);
            if (on) {
                for (const id of ["viewThumbnail", "viewAnnotations", "viewOutline"]) {
                    const t = idoc.getElementById(id);
                    if (t) { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); }
                }
            }
            // Tell the reader its sidebar is NOT showing the annotations view, so
            // it shows the in-document annotation popup on selection (it hides
            // that popup while sidebarView === 'annotations'). Use a sentinel
            // value that activates no native tab; restore the prior view when our
            // tab is turned off. Guarded so we only call setSidebarView on change
            // (no per-scan re-render spam).
            try {
                const ir = reader._internalReader;
                if (ir && typeof ir.setSidebarView === "function" && ir._state) {
                    const cur = ir._state.sidebarView;
                    if (on) {
                        if (cur !== RP_BM_SIDEBAR_VIEW) {
                            if (cur && cur !== RP_BM_SIDEBAR_VIEW) reader._wvPrevSidebarView = cur;
                            ir.setSidebarView(RP_BM_SIDEBAR_VIEW);
                        }
                    } else if (cur === RP_BM_SIDEBAR_VIEW) {
                        ir.setSidebarView(reader._wvPrevSidebarView || "annotations");
                    }
                }
            } catch (_) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderApplyBmTabState err: " + e);
        }
    }

    /** Render the per-attachment bookmarks in two sections — "In this document"
     *  (local) and "Elsewhere in Zotero" (global) — each a manually-ordered,
     *  foldered tree. A section header (with a "new folder" button) shows for
     *  every non-empty section. */
    _wvReaderRenderBmList(reader: any, idoc: any) {
        try {
            const content = idoc.getElementById("sidebarContent");
            const view = content && content.querySelector("." + RP_BM_VIEW_CLASS);
            const list = view && view.querySelector(".wv-bm-reader-list");
            if (!list) return;
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            // The store loads bookmarks.json asynchronously. On a fresh restart
            // the reader can render before it's ready (_bmDoc still undefined),
            // which would show a false "No bookmarks yet". Defer until loaded,
            // then render for real — don't paint an empty list meanwhile.
            if (!this._bmDoc) {
                this._bmInit().then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} });
                return;
            }
            // Refresh each bookmark's original (source) name from the live data
            // before rendering, so default names track edits and the stored
            // originalLabel stays current (even for renamed bookmarks).
            this._bmReaderSyncLabels(att.libraryID, att.itemKey);
            this._wvReaderHideBmHoverCard(idoc);   // rows are about to be rebuilt
            const NS = NS_HTML_RP;
            while (list.firstChild) list.firstChild.remove();
            const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
            // Pre-load data for item bookmarks whose item isn't loaded. After
            // a restart, cross-document items aren't loaded at all — and even
            // `Zotero.Items.get`/`getByLibraryAndKey` THROW for them, so the
            // icon builder's `annotationType` / `getImageSrc` fail and it
            // falls back to the generic ribbon glyph. Resolve ids via
            // `getIDFromLibraryAndKey` (a pure key→id lookup that never
            // touches unloaded data), load any missing items (primary via
            // `getAsync`, then `loadAllData` for annotation type/colour),
            // and re-render once so the real icons paint.
            try {
                const ids: number[] = [];
                const collectIds = (nodes: any[]) => {
                    for (const n of (nodes || [])) {
                        if (!n) continue;
                        if (n.type === "folder") { collectIds(n.children); continue; }
                        if (n.type !== "item") continue;
                        let id = 0;
                        try { id = Zotero.Items.getIDFromLibraryAndKey(n.libraryID, n.itemKey) || 0; } catch (_) {}
                        if (id) ids.push(id);
                    }
                };
                collectIds(doc.local); collectIds(doc.global);
                let anyUnloaded = false;
                for (const id of ids) {
                    try {
                        const it: any = Zotero.Items.get(id);
                        if (!it) { anyUnloaded = true; continue; }
                        if (it.isAnnotation && it.isAnnotation()) void it.annotationType;
                    } catch (_) { anyUnloaded = true; }
                }
                if (anyUnloaded && !this._wvBmIconLoadInFlight) {
                    this._wvBmIconLoadInFlight = true;
                    Promise.all(ids.map(async (id) => {
                        try { await Zotero.Items.getAsync(id); } catch (_) {}
                        try { const it: any = Zotero.Items.get(id); if (it && it.loadAllData) await it.loadAllData(); } catch (_) {}
                    })).then(() => {
                        this._wvBmIconLoadInFlight = false;
                        try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
                    }).catch(() => { this._wvBmIconLoadInFlight = false; });
                }
            } catch (_) {}
            if (!doc.local.length && !doc.global.length) {
                const empty = idoc.createElementNS(NS, "div");
                empty.className = "wv-bm-reader-empty";
                empty.textContent = "No bookmarks yet.\n+ bookmarks anywhere in Zotero. Right-click in the page to bookmark a position or selection; drag an annotation here to bookmark it.";
                list.appendChild(empty);
                return;
            }
            const addSection = (heading: string, nodes: any[], section: "local" | "global") => {
                if (!nodes.length) return;
                const gc = idoc.createElementNS(NS, "div");
                gc.className = "wv-bm-reader-group " + (section === "local" ? "wv-bm-grp-local" : "wv-bm-grp-global");
                const h = idoc.createElementNS(NS, "div");
                h.className = "wv-bm-reader-grouphead";
                const htitle = idoc.createElementNS(NS, "span");
                htitle.className = "wv-bm-gh-title";
                htitle.textContent = heading;
                const nf = idoc.createElementNS(NS, "button");
                nf.className = "wv-bm-reader-newfolder";
                nf.setAttribute("title", "New folder in this section");
                nf.innerHTML = RP_FOLDER_PLUS_SVG;
                nf.addEventListener("click", (e: any) => {
                    e.stopPropagation();
                    const name = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                    if (name) this._bmReaderAddFolder(att.libraryID, att.itemKey, section, name)
                        .then(() => this._wvReaderRenderBmList(reader, idoc));
                });
                h.appendChild(htitle); h.appendChild(nf);
                gc.appendChild(h);
                const treeWrap = idoc.createElementNS(NS, "div");
                treeWrap.className = "wv-bm-reader-tree";
                this._wvReaderRenderTree(reader, idoc, att, treeWrap, nodes, section, 0);
                gc.appendChild(treeWrap);
                this._wvReaderWireGroupDrop(reader, idoc, gc, section === "local");
                list.appendChild(gc);
            };
            addSection("In this document", doc.local, "local");
            addSection("Elsewhere in Zotero", doc.global, "global");
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderRenderBmList err: " + e);
        }
    }

    /** Render one tree level (folders + bookmarks) into a container; folders
     *  recurse when expanded. `depth` drives indentation. */
    _wvReaderRenderTree(reader: any, idoc: any, att: any, container: any, nodes: any[], section: "local" | "global", depth: number) {
        for (const node of nodes) {
            if (node.type === "folder") {
                container.appendChild(this._wvReaderFolderRow(reader, idoc, att, node, section, depth));
                if (node.expanded) {
                    this._wvReaderRenderTree(reader, idoc, att, container, node.children || [], section, depth + 1);
                }
            } else {
                container.appendChild(this._wvReaderBmRow(reader, idoc, att, node, section, depth));
            }
        }
    }

    /** A folder row: chevron (expand/collapse) + folder glyph + name +
     *  rename/delete; click toggles; draggable + drop target (before/after/
     *  into). */
    _wvReaderFolderRow(reader: any, idoc: any, att: any, folder: any, section: "local" | "global", depth: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row wv-bm-reader-folder";
        row.style.paddingLeft = (8 + depth * 14) + "px";
        row.style.setProperty("--wv-drop-indent", this._wvBmDropIndentPx(depth) + "px");
        const chev = idoc.createElementNS(NS, "span");
        chev.className = "wv-bm-reader-chev";
        chev.innerHTML = folder.expanded ? RP_CHEV_DOWN : RP_CHEV_RIGHT;
        const ic = idoc.createElementNS(NS, "span");
        ic.className = "wv-bm-reader-ic";
        ic.innerHTML = RP_FOLDER_SVG;
        const label = idoc.createElementNS(NS, "span");
        label.className = "wv-bm-reader-label";
        label.textContent = folder.name || "Folder";
        label.setAttribute("title", folder.name || "");
        // No inline rename/delete buttons on hover (user preference) —
        // both actions live in the folder's right-click context menu.
        row.appendChild(chev); row.appendChild(ic); row.appendChild(label);
        row.addEventListener("click", (e: any) => {
            e.stopPropagation();
            this._bmReaderToggleFolder(att.libraryID, att.itemKey, folder.id).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        this._wvReaderWireRowDrag(reader, idoc, att, row, folder, section, true);
        return row;
    }

    /** Drop wiring for one bookmark group, matched to where the item will
     *  actually file: an annotation/selection from the OPEN document belongs
     *  in "In this document" (local); one dragged from ANOTHER document
     *  belongs in "Elsewhere in Zotero" (global). The drag data can't be
     *  read during dragover, but `_wvDragSourceAttId` (set at dragstart,
     *  shared across windows) tells us the source document, so each group
     *  shows a "no drop" cursor — and refuses the drop — for items that
     *  belong in the OTHER section. When the source is unknown (e.g. a drag
     *  from the library), both groups accept and classification decides.
     *  Internal row-reorder drags (a distinct MIME) bypass this entirely. */
    _wvReaderWireGroupDrop(reader: any, idoc: any, gc: any, isLocal: boolean) {
        // True iff THIS group must refuse the in-flight drag's source.
        const forbids = () => {
            // A bookmark-row drag has its own target-section rule (a same-doc
            // reorder stays in its own section; a cross-doc copy goes to global).
            const rowSec = this._wvBmRowDropTargetSection(reader);
            if (rowSec != null) return rowSec !== (isLocal ? "local" : "global");
            const src = this._wvDragSourceAttId;
            if (src == null) return false;          // unknown source → allow
            const a = this._wvReaderAtt(reader);
            if (!a || !a.att) return false;
            const sameDoc = src === a.att.id;
            // local group refuses cross-doc items; global refuses same-doc.
            return isLocal ? !sameDoc : sameDoc;
        };
        gc.addEventListener("dragover", (e: any) => {
            if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
            // Cursor over the section but NOT over a row (empty area / header) =
            // it has left every folder → collapse any spring-opened folders.
            // (Row hovers are handled by the row's own _wvSpringRecollapseLeft.)
            try { if (!(e.target && e.target.closest && e.target.closest(".wv-bm-reader-row"))) this._wvSpringRecollapseLeft(reader, idoc, this._wvReaderAtt(reader), null); } catch (_) {}
            if (forbids()) {
                // Claim the event (stop the pane-level accept) and show the
                // "no drop" cursor over this section.
                e.stopPropagation();
                try { e.dataTransfer.dropEffect = "none"; } catch (_) {}
                gc.classList.add("wv-bm-grp-nodrop");
                return;
            }
            // Accept (so empty-area drops append) but draw NO section box —
            // the row-level target line is the only indicator.
            e.preventDefault();
        });
        gc.addEventListener("dragleave", (e: any) => {
            if (!gc.contains(e.relatedTarget)) gc.classList.remove("wv-bm-grp-nodrop");
        });
        gc.addEventListener("drop", (e: any) => {
            gc.classList.remove("wv-bm-grp-nodrop");
            if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
            if (forbids()) { e.stopPropagation(); return; }   // refuse here
            if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
            e.preventDefault();
            // A bookmark-row drop landing on the section (not a specific row) →
            // reorder/copy to the section bottom.
            if (this._wvBmRowDrag) { this._wvReaderDropBmRow(reader, idoc, null); return; }
            this._wvReaderDropPayload(reader, idoc, this._wvReaderReadDropPayload(e));
        });
    }

    /** True for bookmarks that point INTO the currently-open document
     *  (positions, selected-text, and annotations of this attachment). */
    _wvReaderBookmarkIsLocal(reader: any, bm: any) {
        try {
            if (!bm) return false;
            if (bm.type === "position" || bm.type === "text") {
                // A location bookmark with a source ref to a DIFFERENT
                // attachment (text selection dragged from another doc)
                // points elsewhere, not into the open document.
                if (bm.srcItemKey) {
                    const a = this._wvReaderAtt(reader);
                    if (a && (bm.srcLibraryID !== a.libraryID || bm.srcItemKey !== a.itemKey)) return false;
                }
                return true;
            }
            if (bm.type === "item") {
                const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                if (!it) return false;
                if (it.id === reader.itemID) return true;
                if (typeof it.isAnnotation === "function" && it.isAnnotation()
                    && it.parentItemID === reader.itemID) return true;
            }
            return false;
        } catch (_) { return false; }
    }

    /** Click a bookmark. For targets INSIDE the open document (positions,
     *  selected text, this-doc annotations) the same three modifier options as
     *  the collections-pane bookmark apply, mapped to the reader:
     *    • plain click    → jump to it within THIS reader
     *    • Shift-click    → open it in a NEW reader window (at the location)
     *    • Ctrl/Cmd-click → show the document in the library
     *  Global bookmarks (Elsewhere in Zotero) keep the collections-pane
     *  behavior (new tab / new window / show in library). */
    _wvNavigateReaderBookmark(reader: any, bm: any, e: any) {
        if (!bm) return;
        const ctrl = !!(e && (e.ctrlKey || e.metaKey));
        const shift = !!(e && e.shiftKey);
        const isLocalLoc = (bm.type === "position" || bm.type === "text")
            && this._wvReaderBookmarkIsLocal(reader, bm);
        const isLocalAnno = bm.type === "item" && this._wvReaderBookmarkIsLocal(reader, bm);
        if (isLocalLoc || isLocalAnno) {
            const att = this._wvReaderAtt(reader);
            if (ctrl) {
                this._bmShowInLibrary(isLocalAnno ? bm
                    : (att ? { type: "item", libraryID: att.libraryID, itemKey: att.itemKey } : null));
                return;
            }
            if (shift) {
                if (att) {
                    let loc: any = null;
                    if (isLocalAnno) loc = { annotationID: bm.itemKey };
                    else if (bm.position) loc = { position: bm.position };
                    else if (bm.viewType === "pdf" && bm.location && Number.isInteger(bm.location.pageIndex)) loc = { pageIndex: bm.location.pageIndex };
                    else if (bm.location && bm.location.cfi) loc = { pageNumber: bm.location.cfi };
                    try {
                        const opened: any = Zotero.Reader.open(att.att.id, loc, { openInWindow: true });
                        // A pinned location drops its 📌 marker in the new window
                        // too — but only once that window's view has rendered.
                        if (bm.type === "position" && bm.position) {
                            Promise.resolve(opened).then((nr: any) => {
                                if (nr) this._wvShowPinWhenReady(nr, bm.position, bm.id);
                            }).catch(() => {});
                        }
                    } catch (_) {}
                }
                return;
            }
            if (isLocalAnno) { try { reader.navigate({ annotationID: bm.itemKey }); } catch (_) {} }
            else this._wvNavigateReaderLocation(reader, bm);
            return;
        }
        this._bmActivateBookmark(bm, e);
    }

    /** Build the type icon for a bookmark — the same coloured glyph the row
     *  uses: 📌 for positions, a quote glyph for text, else the item/annotation/
     *  collection/library icon (annotations get their type glyph + colour).
     *  Shared by the list row and the hover card so they look identical. */
    _wvReaderBuildBmIcon(reader: any, idoc: any, bm: any) {
        const NS = NS_HTML_RP;
        const ic = idoc.createElementNS(NS, "span");
        ic.className = "wv-bm-reader-ic";
        if (bm.type === "position") { ic.classList.add("wv-bm-emoji"); ic.textContent = RP_PIN_EMOJI; }
        else if (bm.type === "text") ic.innerHTML = RP_TEXT_SVG;
        else {
            let done = false;
            try {
                const info = this._bmIconInfo(bm, idoc.defaultView);
                const src = info && this._wvReaderResolveRowIcon(reader, idoc, info.image);
                if (src) {
                    const img = idoc.createElementNS(NS, "img");
                    img.setAttribute("src", src);
                    img.setAttribute("width", "16"); img.setAttribute("height", "16");
                    if (info.fill) img.setAttribute("style", "-moz-context-properties:fill;fill:" + info.fill + ";");
                    ic.appendChild(img); done = true;
                }
            } catch (_) {}
            if (!done) ic.innerHTML = RP_BM_RIBBON;
        }
        return ic;
    }

    /** Build one bookmark row (icon by type, label, page, rename/delete,
     *  click→navigate, drag reorder/nest). `depth` indents nested rows; a
     *  hidden chevron spacer keeps icons aligned with folder rows. */
    _wvReaderBmRow(reader: any, idoc: any, att: any, bm: any, section?: "local" | "global", depth?: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row";
        row.style.paddingLeft = (8 + (depth || 0) * 14) + "px";
        // Default the drop-line indent to THIS row's own depth, so the bar lands
        // "indented inside" even if a (hot-reload-stale) dragover handler doesn't
        // override it; dragover only adjusts it for pop-out / first-child cases.
        row.style.setProperty("--wv-drop-indent", this._wvBmDropIndentPx(depth || 0) + "px");
        const chevSpacer = idoc.createElementNS(NS, "span");
        chevSpacer.className = "wv-bm-reader-chev wv-bm-reader-chev-spacer";
        chevSpacer.innerHTML = RP_CHEV_RIGHT;
        row.appendChild(chevSpacer);
        const ic = this._wvReaderBuildBmIcon(reader, idoc, bm);
        const label = idoc.createElementNS(NS, "span");
        label.className = "wv-bm-reader-label";
        label.textContent = bm.label || "Bookmark";
        // No native `title` tooltip here — the rich hover card supersedes it
        // (a title would show as a SECOND popup over the card).
        const page = idoc.createElementNS(NS, "span");
        page.className = "wv-bm-reader-page";
        // Annotation bookmarks don't store a pageLabel; derive it live from the
        // annotation so they show "p. N" like position/text bookmarks.
        const pageLbl = this._bmReaderPageLabel(bm);
        page.textContent = pageLbl ? ("p. " + pageLbl) : "";
        // No inline rename/delete buttons on hover (user preference) —
        // both actions live in the right-click context menu instead.
        row.appendChild(ic); row.appendChild(label); row.appendChild(page);
        row.addEventListener("click", (e: any) => this._wvNavigateReaderBookmark(reader, bm, e));
        this._wvReaderWireRowDrag(reader, idoc, att, row, bm,
            section || (this._wvReaderBookmarkIsLocal(reader, bm) ? "local" : "global"), false);
        this._wvReaderWireRowHover(reader, idoc, row, bm);
        return row;
    }

    /** Hover affordance: after a short delay over a bookmark row, show a rich
     *  details card. Hide is DELAYED on leave so the cursor can travel onto the
     *  (interactive) card to expand/scroll it without it vanishing. */
    _wvReaderWireRowHover(reader: any, idoc: any, row: any, bm: any) {
        const win = idoc.defaultView;
        row.addEventListener("mouseenter", () => {
            try { if (this._wvBmHoverHideTimer) { win.clearTimeout(this._wvBmHoverHideTimer); this._wvBmHoverHideTimer = null; } } catch (_) {}
            try { if (this._wvBmHoverTimer) win.clearTimeout(this._wvBmHoverTimer); } catch (_) {}
            this._wvBmHoverTimer = win.setTimeout(() => {
                this._wvBmHoverTimer = null;
                try { this._wvReaderShowBmHoverCard(reader, idoc, row, bm); } catch (_) {}
            }, 450);
        });
        row.addEventListener("mouseleave", () => {
            try { if (this._wvBmHoverTimer) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
            this._wvReaderScheduleHideBmHoverCard(idoc);
        });
    }

    /** Hide the hover card after a short grace period, so moving the cursor from
     *  the row onto the card (or vice-versa) doesn't dismiss it. */
    _wvReaderScheduleHideBmHoverCard(idoc: any) {
        try {
            const win = idoc.defaultView;
            if (this._wvBmHoverHideTimer) win.clearTimeout(this._wvBmHoverHideTimer);
            this._wvBmHoverHideTimer = win.setTimeout(() => {
                this._wvBmHoverHideTimer = null;
                this._wvReaderHideBmHoverCard(idoc);
            }, 200);
        } catch (_) { this._wvReaderHideBmHoverCard(idoc); }
    }

    /** Position the card to the right of its row, flipping left / clamping to
     *  stay on-screen. Re-run after expand/collapse changes its height. */
    _wvReaderPositionBmHoverCard(card: any, rowEl: any, idoc: any) {
        try {
            const rr = rowEl.getBoundingClientRect();
            const de = idoc.documentElement;
            const vw = (de && de.clientWidth) || 9999, vh = (de && de.clientHeight) || 9999;
            const cw = card.offsetWidth || 260, ch = card.offsetHeight || 120;
            let left = rr.right + 8;
            if (left + cw > vw - 6) left = Math.max(6, rr.left - cw - 8);
            if (left < 6) left = 6;
            let top = rr.top;
            if (top + ch > vh - 6) top = Math.max(6, vh - ch - 6);
            card.style.left = left + "px";
            card.style.top = top + "px";
        } catch (_) {}
    }

    /** Gather the rich info shown in the hover card for a bookmark. READ-ONLY —
     *  reads the live target (annotation/item/collection/library); never writes. */
    _wvReaderBmHoverInfo(reader: any, bm: any) {
        const info: any = { kind: "", color: null, page: "", text: "", comment: "", tags: [], source: "", created: "", itemCreated: "", original: "" };
        try {
            info.page = this._bmReaderPageLabel(bm);
            if (bm.created) { try { info.created = new Date(bm.created).toLocaleDateString(); } catch (_) {} }
            if (this._bmReaderIsRenamed(bm)) info.original = this._bmReaderOriginalLabel(bm) || "";
            const ANN: { [k: string]: string } = {
                highlight: "Highlight", underline: "Underline", note: "Note",
                text: "Text annotation", image: "Image annotation", ink: "Ink annotation",
            };
            if (bm.type === "position") { info.kind = "Location"; }
            else if (bm.type === "text") { info.kind = "Selected text"; info.text = bm.label || ""; }
            else if (bm.type === "collection") {
                info.kind = "Collection";
                try { const c: any = bm.collectionKey && Zotero.Collections.getByLibraryAndKey(bm.libraryID, bm.collectionKey); if (c) info.text = c.name; } catch (_) {}
            }
            else if (bm.type === "library") {
                info.kind = "Library";
                try { const l: any = Zotero.Libraries.get(bm.libraryID); if (l) info.text = l.name; } catch (_) {}
            }
            else if (bm.type === "treerow") { info.kind = "Saved search"; info.text = bm.label || ""; }
            else if (bm.type === "item") {
                const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                // The item's OWN creation time (distinct from when it was bookmarked).
                try { if (it && it.dateAdded) { const d = Zotero.Date.sqlToDate(it.dateAdded, true); if (d) info.itemCreated = d.toLocaleDateString(); } } catch (_) {}
                if (it && it.isAnnotation && it.isAnnotation()) {
                    info.kind = ANN[it.annotationType] || "Annotation";
                    try { info.color = it.annotationColor || null; } catch (_) {}
                    try { info.text = String(it.annotationText || "").trim(); } catch (_) {}
                    try { info.comment = String(it.annotationComment || "").trim(); } catch (_) {}
                    try { for (const t of (it.getTags() || [])) if (t && t.tag) info.tags.push(t.tag); } catch (_) {}
                    if (!info.page) { try { info.page = it.annotationPageLabel || ""; } catch (_) {} }
                    try {
                        if (it.parentItemID && it.parentItemID !== reader.itemID) {
                            const a: any = it.parentItem;
                            const top: any = a && (a.parentItem || a);
                            const title = (top && top.getDisplayTitle) ? top.getDisplayTitle()
                                : (a && a.getDisplayTitle ? a.getDisplayTitle() : "");
                            if (title) info.source = "in: " + title;
                        }
                    } catch (_) {}
                } else if (it) {
                    try { info.kind = Zotero.ItemTypes.getLocalizedString(it.itemTypeID); } catch (_) { info.kind = "Item"; }
                    try { info.text = it.getDisplayTitle ? it.getDisplayTitle() : (it.getField ? it.getField("title") : ""); } catch (_) {}
                    try { const d = it.getField && it.getField("date"); if (d) info.source = String(Zotero.Date.strToDate ? (Zotero.Date.strToDate(d).year || "") : String(d).slice(0, 4)); } catch (_) {}
                } else { info.kind = "Item (not found)"; }
            }
        } catch (_) {}
        return info;
    }

    _wvReaderShowBmHoverCard(reader: any, idoc: any, rowEl: any, bm: any) {
        try {
            this._wvReaderHideBmHoverCard(idoc);
            const info = this._wvReaderBmHoverInfo(reader, bm);
            const NS = NS_HTML_RP;
            const mk = (cls: string, txt?: string) => { const e = idoc.createElementNS(NS, "div"); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
            const card = idoc.createElementNS(NS, "div");
            card.className = "wv-bm-hovercard";
            try { card.style.colorScheme = (this._bmIsDark && this._bmIsDark(idoc.defaultView)) ? "dark" : "light"; } catch (_) {}
            // Header: the SAME coloured type glyph as the row (clearer than a
            // text label) + the name + page (all always visible).
            const head = mk("wv-hc-head");
            const hic = this._wvReaderBuildBmIcon(reader, idoc, bm);
            try { hic.setAttribute("aria-label", info.kind || ""); } catch (_) {}
            head.appendChild(hic);
            const nm = idoc.createElementNS(NS, "span"); nm.className = "wv-hc-name"; nm.textContent = bm.label || info.kind || "Bookmark"; head.appendChild(nm);
            if (info.page) { const pg = idoc.createElementNS(NS, "span"); pg.className = "wv-hc-page"; pg.textContent = "p. " + info.page; head.appendChild(pg); }
            card.appendChild(head);
            // Body: the variable-length content — capped by default, scrolls when expanded.
            const body = mk("wv-hc-body");
            // Show the full text unless it's identical to the name already in the
            // header (avoid repetition) — but always for text bookmarks, where the
            // header name is the (possibly clamped) selection.
            if (info.text && (info.text !== (bm.label || "") || bm.type === "text")) body.appendChild(mk("wv-hc-text", info.text));
            if (info.comment) body.appendChild(mk("wv-hc-comment", info.comment));
            if (info.tags && info.tags.length) {
                const tg = mk("wv-hc-tags");
                for (const t of info.tags) tg.appendChild(mk("wv-hc-tag", t));
                body.appendChild(tg);
            }
            if (info.source) body.appendChild(mk("wv-hc-src", info.source));
            card.appendChild(body);
            // Append now so we can measure whether the body is clamped.
            (idoc.body || idoc.documentElement).appendChild(card);
            if (body.scrollHeight > body.clientHeight + 2) {
                body.appendChild(mk("wv-hc-fade"));
                const btn: any = idoc.createElementNS(NS, "button");
                btn.className = "wv-hc-expand"; btn.type = "button"; btn.textContent = "Expand ▾";
                btn.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    const exp = card.classList.toggle("wv-hc-expanded");
                    btn.textContent = exp ? "Collapse ▴" : "Expand ▾";
                    this._wvReaderPositionBmHoverCard(card, rowEl, idoc);
                });
                card.appendChild(btn);
            }
            // Meta (always visible, below the body/expand).
            const meta: string[] = [];
            if (info.original) meta.push("original: " + info.original);
            if (info.itemCreated) meta.push("created " + info.itemCreated);
            if (info.created) meta.push("bookmarked " + info.created);
            for (const m of meta) card.appendChild(mk("wv-hc-meta", m));   // one per line
            // Keep the card alive while the cursor is over it (it's interactive).
            const win = idoc.defaultView;
            card.addEventListener("mouseenter", () => { try { if (this._wvBmHoverHideTimer) { win.clearTimeout(this._wvBmHoverHideTimer); this._wvBmHoverHideTimer = null; } } catch (_) {} });
            card.addEventListener("mouseleave", () => this._wvReaderScheduleHideBmHoverCard(idoc));
            this._wvReaderPositionBmHoverCard(card, rowEl, idoc);
        } catch (e) { Zotero.debug("[Weavero] _wvReaderShowBmHoverCard err: " + e); }
    }

    _wvReaderHideBmHoverCard(idoc: any) {
        try { if (this._wvBmHoverHideTimer && idoc.defaultView) idoc.defaultView.clearTimeout(this._wvBmHoverHideTimer); } catch (_) {}
        this._wvBmHoverHideTimer = null;
        try { const c = idoc.querySelector(".wv-bm-hovercard"); if (c) c.remove(); } catch (_) {}
    }

    /** Drag/drop wiring for bookmark + folder rows. The row is a NATIVE HTML5
     *  drag source (the earlier "draggable never fires in the reader sidebar"
     *  belief was wrong — Zotero's own annotation rows drag natively; ours were
     *  blocked by a mousedown-preventDefault, now removed). Native drag is what
     *  lets a bookmark be dragged BETWEEN reader windows. Drop zones: before/
     *  after on every row plus a middle "into" zone on folders. A same-document
     *  drag reorders within the dragged node's section; a different-document drag
     *  copies into "Elsewhere in Zotero". Rows carry `data-wv-bm-id`/
     *  `data-wv-bm-section` (also read by the context menu). */
    _wvReaderWireRowDrag(reader: any, idoc: any, att: any, row: any, node: any, section: "local" | "global", _isFolder: boolean) {
        row.setAttribute("data-wv-bm-id", node.id);
        row.setAttribute("data-wv-bm-section", section);
        const win = idoc.defaultView;
        const clearIndicators = () => {
            try {
                const els = idoc.querySelectorAll(".wv-bm-drop-before,.wv-bm-drop-after,.wv-bm-drop-into");
                for (let i = 0; i < els.length; i++) els[i].classList.remove("wv-bm-drop-before", "wv-bm-drop-after", "wv-bm-drop-into");
            } catch (_) {}
        };
        // NATIVE HTML5 drag source. Native drag is the ONLY drag that crosses
        // reader-window boundaries (pointer capture is window-local), so it's
        // what lets a bookmark be dragged from a separate window's list into
        // another reader's. Marking the row `draggable` also suppresses text
        // selection on drag (same mechanism Zotero's own annotation rows use),
        // which is why the old mousedown-preventDefault guard + pointer reorder
        // are gone. The drag's source is carried on the shared plugin singleton
        // (`_wvBmRowDrag`) because dataTransfer data is unreadable during
        // dragover; that singleton is the same object in every window.
        row.setAttribute("draggable", "true");
        // The reader's focus-manager has a window-level pointerdown handler that
        // calls preventDefault() for everything outside its whitelist
        // (`.annotation`, `.thumbnails-view`, …) — and preventDefault on
        // pointerdown blocks native drag from ever starting (this is what the
        // old "draggable never fires in the sidebar" note really observed). Our
        // rows aren't whitelisted, so we stop the event before it bubbles to
        // that window handler; stopPropagation ONLY (we keep the default, which
        // is what lets the drag — and the navigating click — happen). This is
        // the same net effect the whitelisted annotation rows get.
        row.addEventListener("pointerdown", (e: any) => { try { e.stopPropagation(); } catch (_) {} });
        row.addEventListener("dragstart", (e: any) => {
            this._wvBmRowDrag = { libraryID: att.libraryID, itemKey: att.itemKey, id: node.id, section, type: node.type };
            try {
                e.dataTransfer.effectAllowed = "copyMove";
                e.dataTransfer.setData("application/x-weavero-bm-row",
                    JSON.stringify({ libraryID: att.libraryID, itemKey: att.itemKey, id: node.id }));
            } catch (_) {}
            try { if (this._wvBmHoverTimer) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
            this._wvReaderHideBmHoverCard(idoc);
            row.classList.add("wv-bm-dragging");
        });
        row.addEventListener("dragend", () => {
            this._wvBmRowDrag = null;
            row.classList.remove("wv-bm-dragging");
            clearIndicators();
        });

        // HTML5 drop target: an annotation (from the sidebar) or text selection
        // (from the center pane) dragged in can be dropped ONTO this row to land
        // at an exact spot — before/after it, or INTO it when it's a folder —
        // instead of only at the section bottom. Claims the drop before the
        // pane's append-handler via `_wvBmDropHandled`.
        const dropModeAt = (clientY: number) => {
            const r = row.getBoundingClientRect();
            const rel = clientY - r.top;
            if (_isFolder) {
                // An EXPANDED folder's header has the first-child slot right
                // below it, so its lower half means "insert as first child"
                // (intotop) — matching where the indicator line shows. (A
                // top-level sibling after an expanded folder would otherwise
                // render below ALL its children, contradicting the line.) A
                // COLLAPSED folder keeps before / into(append) / after.
                if (node && node.expanded) return rel < r.height * 0.5 ? "before" : "intotop";
                return rel < r.height * 0.28 ? "before" : rel > r.height * 0.72 ? "after" : "into";
            }
            return rel > r.height / 2 ? "after" : "before";
        };
        // Positioned drop only applies in the LOCAL ("In this document")
        // section — a dragged reader annotation/selection is a local target, and
        // _bmReaderMove refuses cross-section moves. So on global rows we show no
        // indicator and don't claim the drop; it falls through to the pane's
        // append handler (lands at the bottom of the local section).
        row.addEventListener("dragover", (e: any) => {
            const rowSec = this._wvBmRowDropTargetSection(reader);
            if (rowSec != null) {
                // A bookmark-row drag (reorder within this doc, or a cross-doc
                // copy headed for "Elsewhere"): only rows in the allowed section
                // are targets, and never the dragged row itself.
                if (rowSec !== section) return;
                const dr = this._wvBmRowDrag;
                if (dr && dr.id === node.id) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = (dr && dr.libraryID === att.libraryID && dr.itemKey === att.itemKey) ? "move" : "copy"; } catch (_) {}
            } else {
                if (section === "global") return;
                if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                e.preventDefault();
            }
            clearIndicators();
            const m = dropModeAt(e.clientY);
            // Resolve to a concrete target+depth: "after" can pop out to a
            // shallower level by cursor X (drop OUT of a folder); the line is
            // indented to the landing depth so its length shows the level.
            const res = this._wvBmDropResolve(att, section, node.id, m, e.clientX, row.getBoundingClientRect());
            if (res.mode === "into") {
                // Dropping ONTO a (collapsed) folder to append inside it: the
                // contents aren't visible, so box the folder rather than draw a
                // bar at an unknown spot.
                row.classList.add("wv-bm-drop-into");
            } else {
                // before / after / intotop → an indented bar at the LANDING
                // depth (intotop = child level, drawn just below the folder
                // header = the first-child slot), so its indent/length shows
                // exactly where the item goes.
                row.classList.add(res.mode === "before" ? "wv-bm-drop-before" : "wv-bm-drop-after");
                row.style.setProperty("--wv-drop-indent", this._wvBmDropIndentPx(res.depth) + "px");
            }
            // Spring-opened folders that no longer contain the cursor re-collapse
            // (deepest first), keeping any ancestor still under the cursor — so a
            // nested spring collapses its sub-folder AND its top folder on leave.
            this._wvSpringRecollapseLeft(reader, idoc, att, node.id);
            // Spring-load: pausing over a collapsed folder's "into" zone expands
            // it so you can drop inside. (Safe to re-render here — the HTML5 drag
            // is tied to the source, not a captured target element.)
            this._wvMaybeSpringOpen(reader, idoc, att, win, node, _isFolder, m);
        });
        row.addEventListener("dragleave", () => { clearIndicators(); this._wvCancelBmSpring(); });
        row.addEventListener("drop", (e: any) => {
            const rowSec = this._wvBmRowDropTargetSection(reader);
            if (rowSec != null) {
                if (rowSec !== section) return;
                const dr = this._wvBmRowDrag;
                if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                e.preventDefault(); e.stopPropagation();
                clearIndicators();
                this._wvCancelBmSpring();
                const m = dropModeAt(e.clientY);
                const res = this._wvBmDropResolve(att, section, node.id, m, e.clientX, row.getBoundingClientRect());
                this._wvConsumeSpringStack(reader, idoc, att, node, m);
                // No-op when dropped onto itself (before/after the same row).
                if (dr && dr.id === res.targetId && (res.mode === "before" || res.mode === "after")) return;
                this._wvReaderDropBmRow(reader, idoc, { id: res.targetId, mode: res.mode });
                return;
            }
            if (section === "global") return;
            if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
            if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
            e.preventDefault(); e.stopPropagation();
            clearIndicators();
            this._wvCancelBmSpring();
            const m = dropModeAt(e.clientY);
            const res = this._wvBmDropResolve(att, section, node.id, m, e.clientX, row.getBoundingClientRect());
            const payload = this._wvReaderReadDropPayload(e);
            this._wvConsumeSpringStack(reader, idoc, att, node, m);
            this._wvReaderDropPayload(reader, idoc, payload, { id: res.targetId, mode: res.mode });
        });
    }

    /** During a bookmark-row drag, the section THIS reader will accept the drop
     *  into: a same-document drag reorders within the dragged node's own
     *  section; a different-document drag always lands in "Elsewhere in Zotero"
     *  (global). null when no row drag is in flight. Read from the shared
     *  singleton, so it works across reader windows. */
    _wvBmRowDropTargetSection(reader: any): "local" | "global" | null {
        const src = this._wvBmRowDrag;
        if (!src) return null;
        const a = this._wvReaderAtt(reader);
        if (!a) return null;
        const sameDoc = src.libraryID === a.libraryID && src.itemKey === a.itemKey;
        return sameDoc ? src.section : "global";
    }

    /** Spring-load: pausing over a collapsed folder's "into" zone expands it so
     *  you can drop inside; the folder is pushed onto the spring stack so it
     *  re-collapses if the drop doesn't land within it. (Shared by every drag
     *  kind — annotation/text and bookmark-row.) */
    _wvMaybeSpringOpen(reader: any, idoc: any, att: any, win: any, node: any, isFolder: boolean, m: string) {
        if (isFolder && node && node.type === "folder" && !node.expanded && m === "into") {
            if (this._wvBmSpringFolderId !== node.id) {
                this._wvCancelBmSpring();
                this._wvBmSpringFolderId = node.id;
                this._wvBmSpringWin = win;
                this._wvBmSpringTimer = win.setTimeout(() => {
                    this._wvBmSpringTimer = null; this._wvBmSpringFolderId = null; this._wvBmSpringWin = null;
                    if (!this._wvBmSpringStack) this._wvBmSpringStack = [];
                    if (this._wvBmSpringStack.indexOf(node.id) < 0) this._wvBmSpringStack.push(node.id);   // re-collapse if not dropped in
                    this._bmReaderToggleFolder(att.libraryID, att.itemKey, node.id)
                        .then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} });
                }, 600);
            }
        } else {
            this._wvCancelBmSpring();
        }
    }

    /** The drop is the terminal action, so it CONSUMES the spring stack:
     *  folders the drop landed inside (into the folder itself, or onto one of
     *  its descendants) stay open; the rest collapse. Clearing the stack here is
     *  essential — otherwise the dragend that fires next would run
     *  _wvRecollapseAllSprings and collapse the folder you just dropped into. */
    _wvConsumeSpringStack(reader: any, idoc: any, att: any, node: any, m: string) {
        if (this._wvBmSpringStack && this._wvBmSpringStack.length) {
            const insideOf = (sid: any) =>
                (sid === node.id) ? (m === "into" || m === "intotop") : this._wvNodeInsideFolder(att, sid, node.id);
            const toClose = this._wvBmSpringStack.filter((sid: any) => !insideOf(sid));
            this._wvBmSpringStack = [];
            if (toClose.length) this._wvRecollapseSpringFolders(reader, idoc, att, toClose);
        }
    }

    /** Handle a dropped bookmark ROW (the native, cross-window-capable drag).
     *  Same document → reorder via _bmReaderMove. Different document → copy the
     *  bookmark into THIS document's "Elsewhere in Zotero" section (a local
     *  position/text becomes a cross-doc reference; folders copy their whole
     *  subtree), then place it at the drop point. `target` is {id, mode} or
     *  null (section bottom). */
    async _wvReaderDropBmRow(reader: any, idoc: any, target: any) {
        try {
            const src = this._wvBmRowDrag;
            this._wvBmRowDrag = null;
            if (!src) return;
            const att = this._wvReaderAtt(reader); if (!att) return;
            const sameDoc = src.libraryID === att.libraryID && src.itemKey === att.itemKey;
            if (sameDoc) {
                await this._bmReaderMove(att.libraryID, att.itemKey, src.id,
                    (target && target.id) || null, (target && target.mode) || "after");
                this._wvReaderRenderBmList(reader, idoc);
                return;
            }
            const srcDoc = this._bmReaderDoc(src.libraryID, src.itemKey);
            const loc = this._bmLocate(src.id, srcDoc.local) || this._bmLocate(src.id, srcDoc.global);
            if (!loc || !loc.entry) return;
            const clone = this._wvCloneBmForCrossDoc(loc.entry, { libraryID: src.libraryID, itemKey: src.itemKey });
            const added = await this._bmReaderAdd(att.libraryID, att.itemKey, clone, { allowDuplicate: true });
            if (added && added.id) {
                await this._wvReaderPlaceDropped(att, [added.id], target);
                this._wvReaderRenderBmList(reader, idoc);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderDropBmRow err: " + e); }
    }

    /** Deep-clone a bookmark node for copying into ANOTHER document's list as an
     *  "Elsewhere in Zotero" reference. A local position/text bookmark (no
     *  source ref) gains srcLibraryID/srcItemKey pointing back to the source
     *  attachment so it still navigates there; folders are cloned with their
     *  whole subtree and forced into the global section. All ids are regenerated
     *  to stay unique in the destination store. */
    _wvCloneBmForCrossDoc(node: any, srcAtt: any): any {
        const clone = JSON.parse(JSON.stringify(node || {}));
        const fix = (n: any) => {
            n.id = "wv-" + Zotero.Utilities.randomString(8);
            if (n.type === "folder") {
                n._section = "global";
                if (Array.isArray(n.children)) n.children.forEach(fix);
            } else if ((n.type === "position" || n.type === "text") && !n.srcItemKey) {
                n.srcLibraryID = srcAtt.libraryID;
                n.srcItemKey = srcAtt.itemKey;
            }
        };
        fix(clone);
        return clone;
    }

    /** Cancel a PENDING (not-yet-fired) spring-load timer. Leaves
     *  already-spring-expanded folders alone (that's the recollapse helpers). */
    _wvCancelBmSpring() {
        try { if (this._wvBmSpringTimer && this._wvBmSpringWin) this._wvBmSpringWin.clearTimeout(this._wvBmSpringTimer); } catch (_) {}
        this._wvBmSpringTimer = null;
        this._wvBmSpringFolderId = null;
        this._wvBmSpringWin = null;
    }

    /** True if `nodeId` is `folderId` itself or nested inside it. */
    _wvNodeInsideFolder(att: any, folderId: any, nodeId: any) {
        if (!folderId || !att) return false;
        try {
            const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
            const loc = this._bmLocate(folderId, doc.local) || this._bmLocate(folderId, doc.global);
            return !!(loc && loc.entry && this._bmIsDescendant(nodeId, loc.entry));
        } catch (_) { return false; }
    }

    /** Left offset (px) of the drop-line at a given tree depth, aligned to the
     *  row's ICON — not its padding edge. The icon sits past the chevron column
     *  (12px) + flex gap (6px) = +18px from the paddingLeft (8 + depth*14).
     *  Measured live: depth 0 icon @26px, +14px per level. Keep in sync if the
     *  row's chevron width / gap / base padding change. */
    _wvBmDropIndentPx(depth: number): number { return 26 + (depth || 0) * 14; }

    /** Locate a node and its folder-ancestry within a section tree. Returns
     *  { node, index, siblings, ancestors } where each ancestor is
     *  { folder, siblings, index, depth } ordered top → immediate parent; null
     *  if not found. */
    _wvBmFindAncestry(nodes: any[], id: string, ancestors: any[]): any {
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.id === id) return { node: n, index: i, siblings: nodes, ancestors };
            if (n.type === "folder" && Array.isArray(n.children)) {
                const r = this._wvBmFindAncestry(n.children, id,
                    ancestors.concat([{ folder: n, siblings: nodes, index: i, depth: ancestors.length }]));
                if (r) return r;
            }
        }
        return null;
    }

    /** Resolve a drop on row `nodeId` into a concrete { targetId, mode, depth }.
     *  `mode` is the raw before/after/into/intotop from geometry. For "after" on
     *  a LAST child, the cursor's X "pops out" to a shallower level — after the
     *  parent folder, grandparent, … up to top level — which is how you drag an
     *  item OUT of a folder (e.g. to the last top-level position). `depth` drives
     *  the indicator line's indent so its length shows where the item lands. */
    _wvBmDropResolve(att: any, section: "local" | "global", nodeId: string, mode: string, clientX: number, rowRect: any): any {
        const STEP = 14;
        try {
            const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
            const nodes = section === "global" ? doc.global : doc.local;
            const f = this._wvBmFindAncestry(nodes, nodeId, []);
            if (!f) return { targetId: nodeId, mode, depth: 0 };
            const nodeDepth = f.ancestors.length;
            if (mode === "before") return { targetId: nodeId, mode, depth: nodeDepth };
            if (mode === "into" || mode === "intotop") return { targetId: nodeId, mode, depth: nodeDepth + 1 };
            // "after": pop chain from the node's own level up through each
            // ancestor for which the path so far is a LAST child.
            const chain = [{ targetId: nodeId, depth: nodeDepth }];
            let isLast = (f.index === f.siblings.length - 1);
            for (let a = f.ancestors.length - 1; a >= 0 && isLast; a--) {
                const anc = f.ancestors[a];
                chain.push({ targetId: anc.folder.id, depth: anc.depth });
                isLast = (anc.index === anc.siblings.length - 1);
            }
            let steps = Math.round((this._wvBmDropIndentPx(nodeDepth) - (clientX - rowRect.left)) / STEP);
            if (steps < 0) steps = 0;
            if (steps > chain.length - 1) steps = chain.length - 1;
            const pick = chain[steps];
            return { targetId: pick.targetId, mode: "after", depth: pick.depth };
        } catch (_) {
            return { targetId: nodeId, mode, depth: 0 };
        }
    }

    /** Collapse the given spring-opened folders (they were collapsed before the
     *  drag), re-rendering once. */
    _wvRecollapseSpringFolders(reader: any, idoc: any, att: any, ids: any[]) {
        if (!att || !ids || !ids.length) return;
        (async () => {
            for (const fid of ids) {
                try { await this._bmReaderToggleFolder(att.libraryID, att.itemKey, fid); } catch (_) {}
            }
            try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
        })();
    }

    /** Collapse EVERY spring-opened folder (clears the whole stack). */
    _wvRecollapseAllSprings(reader: any, idoc: any, att: any) {
        const ids = (this._wvBmSpringStack || []).slice();
        this._wvBmSpringStack = [];
        this._wvRecollapseSpringFolders(reader, idoc, att, ids);
    }

    /** Hovering `nodeId` during a drag: collapse spring-opened folders that no
     *  longer contain the cursor, popping from the DEEPEST outward and stopping
     *  at the first ancestor still under the cursor (which keeps all shallower
     *  ones, since they're its ancestors too). This is what makes a nested spring
     *  collapse its sub-folder when you move out to a sibling, and collapse both
     *  levels when you leave the top folder entirely. */
    _wvSpringRecollapseLeft(reader: any, idoc: any, att: any, nodeId: any) {
        const stack = this._wvBmSpringStack || [];
        const toClose: any[] = [];
        while (stack.length && !this._wvNodeInsideFolder(att, stack[stack.length - 1], nodeId)) {
            toClose.push(stack.pop());
        }
        if (toClose.length) this._wvRecollapseSpringFolders(reader, idoc, att, toClose);
    }

    /** True if a drag carries something bookmarkable: an annotation being
     *  dragged from the sidebar (`_wvDraggedAnnKey`), or a center-pane drag
     *  whose dataTransfer has `zotero/annotation` or `text/plain`. */
    _wvReaderDragHasBookmarkable(dt: any) {
        try {
            if (this._wvBmRowDrag) return true;     // our cross-window bookmark-row drag
            if (this._wvDraggedAnnKey) return true;
            const t = dt && dt.types;
            if (!t) return false;
            const has = (k: string) => (typeof t.includes === "function") ? t.includes(k) : (Array.prototype.indexOf.call(t, k) >= 0);
            if (has("application/x-weavero-bm-reorder")) return false;   // internal reorder
            return has("zotero/annotation") || has("text/plain");
        } catch (_) { return false; }
    }

    /** Read the drop payload SYNCHRONOUSLY (dataTransfer is neutered after an
     *  await): the sidebar annotation key, the center-pane `zotero/annotation`
     *  JSON, and any plain text. */
    _wvReaderReadDropPayload(e: any) {
        let annJson = "", txt = "";
        try { annJson = e.dataTransfer.getData("zotero/annotation"); } catch (_) {}
        try { txt = e.dataTransfer.getData("text/plain"); } catch (_) {}
        return { sidebarKey: this._wvDraggedAnnKey, annJson, txt };
    }

    /** Turn a drop payload into bookmark(s): annotation(s) → item bookmarks;
     *  otherwise a text selection → a location bookmark labelled with the text.
     *  Used by the Bookmarks tab button, the bookmarks pane, and rows. */
    async _wvReaderDropPayload(reader: any, idoc: any, payload: any, target?: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            this._wvDraggedAnnKey = null;
            // Saved annotations (have a key) → item bookmarks; an unsaved text
            // selection (no key, but carries text + position) → a text bookmark.
            const entries: any[] = [];
            let selAnn: any = null;
            if (payload.sidebarKey) entries.push({ key: payload.sidebarKey, label: null });
            else if (payload.annJson) {
                try {
                    const arr = JSON.parse(payload.annJson);
                    for (const a of (arr || [])) {
                        if (a && a.id) entries.push({ key: a.id, label: String(a.text || a.comment || "").trim(), attachmentItemID: a.attachmentItemID });
                        else if (a && !selAnn && (a.text || a.position)) selAnn = a;
                    }
                } catch (_) {}
            }
            if (entries.length) {
                const addedIds: string[] = [];
                for (const en of entries) {
                    // The dragged annotation may live in a DIFFERENT library
                    // than the drop target (e.g. dragging from a My Library
                    // reader window into a group-library document's panel).
                    // Zotero's reader stamps each dragged annotation with
                    // `attachmentItemID` (its source attachment); resolve the
                    // source library from it so the bookmark stores the
                    // annotation's REAL library. Otherwise it's stored under
                    // the target's library and getByLibraryAndKey() fails →
                    // broken navigation + ribbon icon instead of the type glyph.
                    let recLib = att.libraryID;
                    if (en.attachmentItemID) {
                        try {
                            const srcAtt: any = Zotero.Items.get(en.attachmentItemID);
                            if (srcAtt) recLib = srcAtt.libraryID;
                        } catch (_) {}
                    }
                    let label = en.label;
                    if (!label) {
                        try { const it: any = Zotero.Items.getByLibraryAndKey(recLib, en.key); label = it ? String(it.annotationText || it.annotationComment || "").trim() : ""; } catch (_) {}
                    }
                    label = (label || "Annotation").slice(0, 100);
                    // allowDuplicate: dragging the same annotation again files a
                    // second copy (e.g. into a different folder) instead of no-op.
                    const e2 = await this._bmReaderAdd(att.libraryID, att.itemKey, { type: "item", libraryID: recLib, itemKey: en.key, label }, { allowDuplicate: true });
                    if (e2 && e2.id) addedIds.push(e2.id);
                }
                if (addedIds.length) {
                    await this._wvReaderPlaceDropped(att, addedIds, target);
                    this._wvReaderRenderBmList(reader, idoc);
                }
                // A drag closes the in-document annotation popup but leaves the
                // annotation selected; with the Bookmarks tab active that popup
                // is the only read/edit surface, so re-open it for the still-
                // selected annotation.
                this._wvReaderRecoverAnnotationPopup(reader);
                return;
            }
            // Selected text → text bookmark, storing the selection's position
            // so a click scrolls to AND highlights it (like dragging to a
            // note). (The internal reorder marker is ignored.)
            const selText = (selAnn && String(selAnn.text || "").trim())
                || ((payload.txt && payload.txt.indexOf("wvbm:") !== 0) ? payload.txt.trim() : "");
            if (selText) {
                let position: any = null;
                if (selAnn && selAnn.position) { try { position = JSON.parse(JSON.stringify(selAnn.position)); } catch (_) {} }
                // A text selection dragged from ANOTHER document (separate
                // reader window) must NOT become a local "in this document"
                // bookmark — its position belongs to the source doc, and
                // navigating it in THIS reader would jump to a meaningless
                // location. Zotero stamps the source attachment on the
                // dragged (temp) annotation as `attachmentItemID`; if it
                // differs from the drop target, store the source attachment
                // ref so the bookmark files under "Elsewhere in Zotero" and
                // clicking it opens the SOURCE document at the selection.
                const srcAttId = selAnn && selAnn.attachmentItemID;
                const crossDoc = !!(srcAttId && att.att && srcAttId !== att.att.id);
                let rec: any;
                if (crossDoc) {
                    let srcAtt: any = null;
                    try { srcAtt = Zotero.Items.get(srcAttId); } catch (_) {}
                    rec = { type: "text", position, pageLabel: (selAnn && selAnn.pageLabel) || null, label: selText.slice(0, 160) };
                    if (srcAtt) { rec.srcLibraryID = srcAtt.libraryID; rec.srcItemKey = srcAtt.key; }
                } else {
                    const cap = this._wvCaptureReaderLocation(reader);
                    rec = { type: "text", viewType: cap.viewType, location: cap.location, position, pageLabel: (selAnn && selAnn.pageLabel) || cap.pageLabel, label: selText.slice(0, 160) };
                }
                const e2 = await this._bmReaderAdd(att.libraryID, att.itemKey, rec);
                if (e2 && e2.id) await this._wvReaderPlaceDropped(att, [e2.id], target);
                this._wvReaderRenderBmList(reader, idoc);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderDropPayload err: " + e); }
    }

    /** Re-open the in-document annotation popup for the currently-selected
     *  annotation (the PDF view closes it on the drag's select but leaves the
     *  annotation selected). Only when the Bookmarks tab is active — that's when
     *  the popup is the read/edit surface. PDF-only (`_openAnnotationPopup`);
     *  deferred a beat so it runs after the reader finishes the drag. */
    _wvReaderRecoverAnnotationPopup(reader: any) {
        try {
            if (!this._wvReaderBmActive(reader)) return;
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            if (!pv || typeof pv._openAnnotationPopup !== "function" || typeof pv.getSelectedAnnotations !== "function") return;
            const run = () => { try { if (pv.getSelectedAnnotations().length === 1) pv._openAnnotationPopup(); } catch (_) {} };
            const win = reader._iframeWindow;
            if (win && win.setTimeout) win.setTimeout(run, 60); else run();
        } catch (_) {}
    }

    /** After a positioned drop, move the freshly-added bookmark(s) to the exact
     *  target (a row id + before/after/into), preserving drop order. With no
     *  target they stay where `_bmReaderAdd` put them (section bottom). A
     *  cross-section move is refused by `_bmReaderMove`, so they fall back to
     *  the bottom of their natural section. */
    async _wvReaderPlaceDropped(att: any, ids: string[], target: any) {
        if (!target || !target.id || !ids || !ids.length) return;
        let relId = target.id;
        let mode = target.mode || "after";
        for (const id of ids) {
            if (id === target.id) continue;
            try { await this._bmReaderMove(att.libraryID, att.itemKey, id, relId, mode); } catch (_) {}
            relId = id; mode = "after";
        }
    }

    /** + → Zotero's select-items picker; bookmark the chosen item / collection
     *  / library / saved-search into the per-document list (same picker the
     *  collections-pane bookmark uses). */
    async _wvReaderAddViaDialog(reader: any, idoc: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            const win = Zotero.getMainWindow(); if (!win) return;
            const io: any = { dataIn: null, dataOut: null, deferred: Zotero.Promise.defer(), itemTreeID: "weavero-reader-bm-select" };
            const dlg: any = win.openDialog("chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            let pickedCollection: any = null, pickedLibraryID: any = null, pickedTreeRow: any = null;
            try {
                dlg && dlg.addEventListener("dialogaccept", () => {
                    try {
                        const cv = dlg.collectionsView; const tr = cv && cv.selectedTreeRow;
                        if (!tr) return;
                        if (typeof tr.isCollection === "function" && tr.isCollection()) pickedCollection = tr.ref;
                        else if (this._bmTreeRowIsLibrary(tr) && tr.ref) pickedLibraryID = tr.ref.libraryID;
                        else if (this._bmTreeRowIsSpecial(tr) && tr.id && tr.getName) pickedTreeRow = { rowID: tr.id, libraryID: tr.ref && tr.ref.libraryID, label: tr.getName() };
                    } catch (_) {}
                }, true);
            } catch (_) {}
            // Focus the file currently in the reader so its annotations are
            // right there to pick — but only EXPAND it if it actually has
            // annotations (no point opening an empty attachment).
            try {
                const attItem: any = att.att || Zotero.Items.get(reader.itemID);
                let hasAnns = false;
                try { hasAnns = !!(attItem && attItem.getAnnotations && attItem.getAnnotations().length); } catch (_) {}
                (async () => {
                    try {
                        const sleep = (ms: number) => new Promise(res => win.setTimeout(res, ms));
                        for (let n = 0; n < 80 && !(dlg.loaded && dlg.itemsView); n++) await sleep(75);
                        const iv = dlg.itemsView;
                        if (!iv || !attItem) return;
                        try { await dlg.collectionsView.selectLibrary(att.libraryID); } catch (_) {}
                        await sleep(400);
                        try { await iv.selectItems([attItem.id]); } catch (_) {}
                        await sleep(150);
                        if (!hasAnns) return;   // nothing to expand into
                        let row = -1;
                        for (let i = 0; i < iv.rowCount; i++) { if (iv.getRow(i).ref.id === attItem.id) { row = i; break; } }
                        if (row >= 0) {
                            let open = false;
                            try { open = iv.isContainerOpen ? iv.isContainerOpen(row) : false; } catch (_) {}
                            if (!open) { try { await iv.toggleOpenState(row); } catch (_) {} }
                            try { await iv.selectItems([attItem.id]); } catch (_) {}
                        }
                    } catch (_) {}
                })();
            } catch (_) {}
            await io.deferred.promise;
            const add = (rec: any) => this._bmReaderAdd(att.libraryID, att.itemKey, rec);
            if (io.dataOut && io.dataOut.length) {
                const targets: any = await Zotero.Items.getAsync(io.dataOut);
                for (const it of (targets || [])) {
                    let label = "";
                    try {
                        if (it.isAnnotation && it.isAnnotation()) label = this._wvReaderAnnLabel(it);
                        else label = it.getDisplayTitle ? it.getDisplayTitle() : (it.getField ? it.getField("title") : "");
                    } catch (_) {}
                    await add({ type: "item", libraryID: it.libraryID, itemKey: it.key, label: label || it.key });
                }
            } else if (pickedCollection && pickedCollection.key) {
                await add({ type: "collection", libraryID: pickedCollection.libraryID, collectionKey: pickedCollection.key, label: pickedCollection.name || pickedCollection.key });
            } else if (typeof pickedLibraryID === "number") {
                let label = ""; try { const lib: any = Zotero.Libraries.get(pickedLibraryID); label = lib && lib.name; } catch (_) {}
                await add({ type: "library", libraryID: pickedLibraryID, label: label || ("Library " + pickedLibraryID) });
            } else if (pickedTreeRow) {
                await add({ type: "treerow", rowID: pickedTreeRow.rowID, libraryID: pickedTreeRow.libraryID, label: pickedTreeRow.label || pickedTreeRow.rowID });
            }
            this._wvReaderRenderBmList(reader, idoc);
        } catch (e) { Zotero.debug("[Weavero] _wvReaderAddViaDialog err: " + e); }
    }

    /** Firefox-bookmarks-style right-click menu for the reader Bookmarks pane:
     *  Add Bookmark / New Folder always; Open / Rename / Delete when the click
     *  was on a row. New folders land in the section that was right-clicked. */
    async _wvReaderShowBmContextMenu(reader: any, idoc: any, e: any) {
        try {
            this._wvCloseReaderBmContextMenu(idoc);
            const att = this._wvReaderAtt(reader); if (!att) return;
            const rowEl = e.target && e.target.closest && e.target.closest(".wv-bm-reader-row");
            const grp = e.target && e.target.closest && e.target.closest(".wv-bm-reader-group");
            let section: "local" | "global" = "local";
            if (grp && grp.classList.contains("wv-bm-grp-global")) section = "global";
            else if (rowEl && rowEl.getAttribute("data-wv-bm-section") === "global") section = "global";
            let entry: any = null;
            const nodeId = rowEl && rowEl.getAttribute("data-wv-bm-id");
            if (nodeId) {
                const docv = this._bmReaderDoc(att.libraryID, att.itemKey);
                const loc = this._bmLocate(nodeId, docv.local) || this._bmLocate(nodeId, docv.global);
                entry = loc && loc.entry;
            }
            const menu = idoc.createElementNS(NS_HTML_RP, "div");
            menu.id = RP_BM_CTX_ID;
            // `icon` is either inline SVG markup, or a chrome:// URL for a
            // native Zotero icon — fetched + inlined async (the reader iframe
            // can't load chrome:// images, so we read their SVG source).
            const item = (label: string, icon: string, fn: any) => {
                const it = idoc.createElementNS(NS_HTML_RP, "div"); it.className = "wv-ctx-item";
                const ic = idoc.createElementNS(NS_HTML_RP, "span"); ic.className = "wv-ctx-ic";
                if (icon && icon.indexOf("chrome://") === 0) {
                    ic.classList.add("wv-ctx-ic-native");
                    this._wvChromeIconSvg(icon).then((svg: string) => { try { ic.innerHTML = svg || ""; } catch (_) {} });
                } else {
                    ic.innerHTML = icon || "";
                }
                const lb = idoc.createElementNS(NS_HTML_RP, "span"); lb.textContent = label;
                it.appendChild(ic); it.appendChild(lb);
                it.addEventListener("click", () => { this._wvCloseReaderBmContextMenu(idoc); fn(); });
                menu.appendChild(it);
            };
            const sep = () => { const s = idoc.createElementNS(NS_HTML_RP, "div"); s.className = "wv-ctx-sep"; menu.appendChild(s); };
            const reRender = () => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} };
            if (entry) {
                if (entry.type === "folder") {
                    item("Rename Folder…", RP_RENAME_SVG, () => {
                        const n = this._bmPromptName(Zotero.getMainWindow(), "Rename Folder", entry.name || "");
                        if (n) this._bmReaderRename(att.libraryID, att.itemKey, entry.id, n).then(reRender);
                    });
                    item("New Subfolder…", RP_FOLDER_PLUS_SVG, () => {
                        const n = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                        if (n) this._bmReaderAddFolder(att.libraryID, att.itemKey, section, n, entry.id).then(reRender);
                    });
                    sep();
                    item("Delete Folder", RP_DELETE_SVG, () => {
                        const c = (entry.children && entry.children.length) || 0;
                        if (c > 0) { const ok = Services.prompt.confirm(Zotero.getMainWindow(), "Delete Folder", 'Delete "' + (entry.name || "") + '" and its ' + c + " item" + (c === 1 ? "" : "s") + "?"); if (!ok) return; }
                        this._bmReaderRemove(att.libraryID, att.itemKey, entry.id).then(reRender);
                    });
                } else if (section === "local") {
                    // In-document location: opens "here" in this reader (no
                    // library equivalent). Plain/Shift/Ctrl mirror a row click.
                    let openIcon = "";
                    try { openIcon = att.att.getImageSrc(); } catch (_) {}
                    item("Open", openIcon, () => this._wvNavigateReaderBookmark(reader, entry, {}));
                    item("Open in New Window", openIcon, () => this._wvNavigateReaderBookmark(reader, entry, { shiftKey: true }));
                    // No "Show in Library" for in-document bookmarks — the
                    // target IS the open document, so there's nothing distinct
                    // to reveal (kept only for "Elsewhere in Zotero" items).
                    sep();
                    item("Rename…", RP_RENAME_SVG, () => {
                        const n = this._bmPromptName(Zotero.getMainWindow(), "Rename Bookmark", entry.label || "");
                        if (n) this._bmReaderRename(att.libraryID, att.itemKey, entry.id, n).then(reRender);
                    });
                    {
                        const orig = this._bmReaderIsRenamed(entry) ? this._bmReaderOriginalLabel(entry) : null;
                        if (orig && orig !== entry.label) {
                            item("Reset to Original Name", RP_REVERT_SVG, () => this._bmReaderResetLabel(att.libraryID, att.itemKey, entry.id).then(reRender));
                        }
                    }
                    item("Delete Bookmark", RP_DELETE_SVG, () => this._bmReaderRemove(att.libraryID, att.itemKey, entry.id).then(reRender));
                } else {
                    // "Elsewhere in Zotero" item bookmark: same icons AND wording
                    // as the library bookmark menu — the attachment file-type
                    // icon + "Open <type> in New Tab/Window", shown only when
                    // there's an openable file, then Show in Library.
                    const t = await this._bmResolveOpenTarget(entry);
                    if (t && t.attachment) {
                        let attIcon = "";
                        try { attIcon = t.attachment.getImageSrc(); } catch (_) {}
                        item("Open " + t.typeLabel + " in New Tab", attIcon,
                            () => this._wvNavigateReaderBookmark(reader, entry, {}));
                        item("Open " + t.typeLabel + " in New Window", attIcon,
                            () => this._wvNavigateReaderBookmark(reader, entry, { shiftKey: true }));
                    }
                    // A cross-document location (text selection or pinned
                    // position) has no annotation item to reveal — offer its
                    // source attachment FILE ("the parent") instead, under a
                    // distinct label.
                    const isCrossDocLoc = (entry.type === "text" || entry.type === "position") && !!entry.srcItemKey;
                    item(isCrossDocLoc ? "Show Parent in Library" : "Show in Library",
                        this._bmShowInLibraryIcon({ libraryID: entry.srcLibraryID || entry.libraryID || att.libraryID }, Zotero.getMainWindow()),
                        () => this._wvNavigateReaderBookmark(reader, entry, { ctrlKey: true }));
                    sep();
                    item("Rename…", RP_RENAME_SVG, () => {
                        const n = this._bmPromptName(Zotero.getMainWindow(), "Rename Bookmark", entry.label || "");
                        if (n) this._bmReaderRename(att.libraryID, att.itemKey, entry.id, n).then(reRender);
                    });
                    {
                        const orig = this._bmReaderIsRenamed(entry) ? this._bmReaderOriginalLabel(entry) : null;
                        if (orig && orig !== entry.label) {
                            item("Reset to Original Name", RP_REVERT_SVG, () => this._bmReaderResetLabel(att.libraryID, att.itemKey, entry.id).then(reRender));
                        }
                    }
                    item("Delete Bookmark", RP_DELETE_SVG, () => this._bmReaderRemove(att.libraryID, att.itemKey, entry.id).then(reRender));
                }
                sep();
            }
            item("Add Bookmark…", RP_PLUS_SVG, () => this._wvReaderAddViaDialog(reader, idoc));
            item("New Folder…", RP_FOLDER_PLUS_SVG, () => {
                const n = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                if (n) this._bmReaderAddFolder(att.libraryID, att.itemKey, section, n).then(reRender);
            });
            (idoc.body || idoc.documentElement).appendChild(menu);
            const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
            const vh = (idoc.documentElement && idoc.documentElement.clientHeight) || 9999;
            let x = e.clientX, y = e.clientY;
            const mw = menu.offsetWidth || 170, mh = menu.offsetHeight || 90;
            if (x + mw > vw - 6) x = Math.max(6, vw - mw - 6);
            if (y + mh > vh - 6) y = Math.max(6, vh - mh - 6);
            menu.style.left = x + "px"; menu.style.top = y + "px";
            // Dismiss on click-outside / Escape across reachable docs.
            const onDown = (ev: any) => { try { if (ev.target && menu.contains && menu.contains(ev.target)) return; this._wvCloseReaderBmContextMenu(idoc); } catch (_) {} };
            const onKey = (ev: any) => { if (ev.key === "Escape") this._wvCloseReaderBmContextMenu(idoc); };
            const docs: any[] = [idoc]; const wins: any[] = [];
            try { const w = idoc.defaultView; if (w) wins.push(w); } catch (_) {}
            try { const top = idoc.defaultView && idoc.defaultView.top; if (top && top.document && docs.indexOf(top.document) < 0) { docs.push(top.document); wins.push(top); } } catch (_) {}
            try { const ir = reader._internalReader; const v = ir && (ir._primaryView || ir._lastView); const vd = v && v._iframeWindow && v._iframeWindow.document; if (vd && docs.indexOf(vd) < 0) docs.push(vd); } catch (_) {}
            for (const d of docs) { try { d.addEventListener("pointerdown", onDown, true); } catch (_) {} }
            for (const w of wins) { try { w.addEventListener("keydown", onKey, true); } catch (_) {} }
            this._wvReaderBmCtxDismiss = { docs, wins, onDown, onKey };
        } catch (err) { Zotero.debug("[Weavero] _wvReaderShowBmContextMenu err: " + err); }
    }

    _wvCloseReaderBmContextMenu(idoc: any) {
        try { const m = idoc.getElementById(RP_BM_CTX_ID); if (m) m.remove(); } catch (_) {}
        if (this._wvReaderBmCtxDismiss) {
            try {
                const { docs, wins, onDown, onKey } = this._wvReaderBmCtxDismiss;
                for (const d of (docs || [])) { try { d.removeEventListener("pointerdown", onDown, true); } catch (_) {} }
                for (const w of (wins || [])) { try { w.removeEventListener("keydown", onKey, true); } catch (_) {} }
            } catch (_) {}
            this._wvReaderBmCtxDismiss = null;
        }
    }

    /** Fetch a chrome:// icon's SVG source (cached) so it can be inlined into
     *  the reader iframe, which can't load chrome:// images directly. */
    async _wvChromeIconSvg(src: string): Promise<string> {
        if (!src) return "";
        this._wvChromeIconCache = this._wvChromeIconCache || {};
        if (Object.prototype.hasOwnProperty.call(this._wvChromeIconCache, src)) {
            return this._wvChromeIconCache[src];
        }
        let out = "";
        try {
            const win: any = Zotero.getMainWindow();
            if (win && typeof win.fetch === "function") {
                const r: any = await win.fetch(src);
                out = await r.text();
            }
        } catch (e) { Zotero.debug("[Weavero] _wvChromeIconSvg err: " + e); }
        this._wvChromeIconCache[src] = out;
        return out;
    }

    /** A readable label for an annotation: its text/comment, else a type name. */
    _wvReaderAnnLabel(ann: any) {
        try {
            const t = String(ann.annotationText || ann.annotationComment || "").trim();
            if (t) return t;
            const m: { [k: string]: string } = {
                image: "Image annotation", ink: "Ink annotation", note: "Note",
                highlight: "Highlight", underline: "Underline", text: "Text annotation",
            };
            return m[ann.annotationType] || "Annotation";
        } catch (_) { return "Annotation"; }
    }

    /** Bookmark the current text selection (label = the selected text). Stores
     *  the selection's position so clicking it later scrolls to AND highlights
     *  the text, the same way dragging a selection to a note does. */
    async _wvReaderAddSelectedText(reader: any) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            let text = "", position: any = null;
            try {
                const sel = reader._internalReader._state.primaryViewSelectionPopup.annotation;
                text = String(sel.text || "").trim();
                if (sel.position) { try { position = JSON.parse(JSON.stringify(sel.position)); } catch (_) {} }
            } catch (_) {}
            if (!text) return;
            const cap = this._wvCaptureReaderLocation(reader);
            await this._bmReaderAdd(att.libraryID, att.itemKey,
                { type: "text", viewType: cap.viewType, location: cap.location, position, pageLabel: cap.pageLabel, label: text.slice(0, 160) });
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            if (iwin && iwin.document) this._wvReaderRenderBmList(reader, iwin.document);
        } catch (e) { Zotero.debug("[Weavero] _wvReaderAddSelectedText err: " + e); }
    }

    /** Append reader-context-menu items (called from reader.ts
     *  _viewContextHandlerImpl): bookmark current position / selection. */
    _wvReaderViewContextMenu(event: any) {
        try {
            const { append, reader } = event || {};
            if (typeof append !== "function" || !reader) return;
            const iwin = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            const idoc = iwin && iwin.document;
            let text = "";
            try { text = String(reader._internalReader._state.primaryViewSelectionPopup.annotation.text || "").trim(); } catch (_) {}
            const icon = this._wvReaderBmMenuIconURL();
            // With a text selection, offer to bookmark the selected text (which
            // also highlights it on click). Otherwise, bookmark the position.
            if (text) {
                const LABEL = "Add Selected Text to Bookmarks";
                append({ label: LABEL, onCommand: () => this._wvReaderAddSelectedText(reader) });
                this._wvReaderStampMenuIcon(reader, LABEL, icon);
            } else {
                const LABEL = "Add Bookmark to This Position";
                // A position bookmark drops a 📌 marker in the document, so the
                // menu item gets the matching pin glyph (not the ribbon).
                // Snapshot the exact click point NOW (params are stale by command
                // time): the cursor's x/y (chrome coords, → any point on the page,
                // text or whitespace) plus the word position as a fallback.
                let click: any = null;
                try {
                    const params = event.params || {};
                    const pp = params.position || (params.overlay && params.overlay.position);
                    click = {
                        position: pp ? JSON.parse(JSON.stringify(pp)) : null,
                        x: (typeof params.x === "number") ? params.x : null,
                        y: (typeof params.y === "number") ? params.y : null,
                    };
                } catch (_) {}
                append({ label: LABEL, onCommand: () => this._wvReaderAddCurrentBookmark(reader, idoc, click) });
                this._wvReaderStampMenuIcon(reader, LABEL, this._wvReaderPinMenuIconURL());
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderViewContextMenu err: " + e); }
    }

    /** Bookmark-ribbon data URI for the reader context-menu icon, themed to
     *  the reader window (the menu lives in chrome, so a baked-colour data URI
     *  is simplest). Same ribbon glyph as the Bookmarks tab. */
    _wvReaderBmMenuIconURL() {
        let dark = true;
        try { dark = this._detectUIDark(); } catch (_) {}
        const color = dark ? "#e3e3e3" : "#555555";
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
            + 'viewBox="0 0 16 16" fill="' + color + '">'
            + '<path fill-rule="evenodd" clip-rule="evenodd" d="' + BOOKMARK_PATH + '"/></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** Pushpin (📌) data URI for the reader context-menu icon, matching the
     *  in-document position-bookmark marker. The menu lives in chrome, so the
     *  emoji is baked into an SVG <text> data URI. */
    _wvReaderPinMenuIconURL() {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
            + 'viewBox="0 0 16 16"><text x="8" y="13" font-size="13" '
            + 'text-anchor="middle">' + RP_PIN_EMOJI + '</text></svg>';
        return "data:image/svg+xml," + encodeURIComponent(svg);
    }

    /** Stamp an icon onto a reader context-menu item (matched by label) once
     *  the popup renders — the reader's `append()` API carries no icon, so we
     *  decorate the rendered XUL menuitem (mirrors "Copy Link to This Page").
     *  The listener removes itself after stamping or a 3 s timeout. */
    _wvReaderStampMenuIcon(reader: any, label: string, iconURL: string) {
        try {
            const win = reader._window;
            const ps = reader._popupset;
            if (!win || !ps || typeof ps.addEventListener !== "function" || !iconURL) return;
            const st = (win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            const ct = (win.clearTimeout) ? win.clearTimeout.bind(win) : clearTimeout;
            let timer: any = null;
            const onShow = (ev: any) => {
                let done = false;
                try {
                    const popup = ev && ev.target;
                    const mi = popup && popup.querySelector
                        && popup.querySelector('menuitem[label="' + label + '"]');
                    if (mi) {
                        mi.classList.add("menuitem-iconic");
                        mi.setAttribute("image", iconURL);
                        done = true;
                    }
                } catch (_) { done = true; }
                if (done) {
                    try { ps.removeEventListener("popupshowing", onShow, true); } catch (_) {}
                    if (timer != null) { try { ct(timer); } catch (_) {} timer = null; }
                }
            };
            ps.addEventListener("popupshowing", onShow, true);
            timer = st(() => {
                try { ps.removeEventListener("popupshowing", onShow, true); } catch (_) {}
                timer = null;
            }, 3000);
        } catch (_) {}
    }

    /** Map a point in the PDF.js iframe (clientX/Y) to a precise PDF position
     *  `{pageIndex, rects:[[x,y,x,y]]}` — works anywhere on a page (mirrors
     *  pdf-view's pointerEventToPosition). Null if the point isn't over a page. */
    _wvReaderPdfPosFromPoint(pv: any, clientX: number, clientY: number) {
        try {
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win) return null;
            const targets = win.document.elementsFromPoint(clientX, clientY) || [];
            let div: any = null;
            for (let i = 0; i < targets.length; i++) {
                const d = targets[i] && targets[i].closest && targets[i].closest(".page");
                if (d) { div = d; break; }
            }
            if (!div) return null;
            const pages = app.pdfViewer._pages;
            let pageIndex = -1;
            for (let i = 0; i < pages.length; i++) { if (pages[i] && pages[i].div === div) { pageIndex = i; break; } }
            if (pageIndex < 0) return null;
            const page = pages[pageIndex];
            const rect = div.getBoundingClientRect();
            const x = clientX + (div.scrollLeft || 0) - rect.left;
            const y = clientY + (div.scrollTop || 0) - rect.top;
            const r = page.viewport.convertToPdfPoint(x, y);
            return { pageIndex, rects: [[r[0], r[1], r[0], r[1]]] };
        } catch (_) { return null; }
    }

    /** Drop a location pin at a PDF position to flag a position bookmark's exact
     *  spot. It pops in, then fades after a moment — but stays alive while
     *  hovered, and can be DRAGGED to move the bookmark: on drop the new precise
     *  point is written back (`_bmReaderUpdatePosition`) and the list refreshes.
     *  Lives in the PDF.js iframe. No-op for non-PDF or if the page isn't ready. */
    /** Drop the pin once a (possibly just-opened) reader's primary view has
     *  rendered the target page. Used after "Open in New Window" so the pin
     *  shows in the new window too; polls briefly, then gives up. */
    _wvShowPinWhenReady(reader: any, position: any, bmId?: string, tries?: number) {
        const n = tries || 0;
        try {
            const ir = reader && reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            const pageIndex = (position && position.pageIndex) || 0;
            const pageView = app && app.pdfViewer && app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            if (pageView && pageView.div && pageView.viewport) {
                this._wvReaderShowPin(reader, position, bmId);
                return;
            }
        } catch (_) {}
        if (n < 40) {
            const w: any = Zotero.getMainWindow();
            const st: any = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
            st(() => this._wvShowPinWhenReady(reader, position, bmId, n + 1), 150);
        }
    }

    _wvReaderShowPin(reader: any, position: any, bmId?: string) {
        try {
            if (!position || !Array.isArray(position.rects) || !position.rects.length) return;
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win || !win.document) return;
            const pageIndex = position.pageIndex || 0;
            const pageView = app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            if (!pageView || !pageView.div || !pageView.viewport) return;
            const rect = position.rects[0];
            const a = pageView.viewport.convertToViewportPoint(rect[0], rect[1]);
            const b = pageView.viewport.convertToViewportPoint(rect[2], rect[3]);
            const left = (a[0] + b[0]) / 2;
            const top = Math.min(a[1], b[1]);
            const doc = win.document;
            try { const old = doc.querySelector(".wv-reader-pin"); if (old) old.remove(); } catch (_) {}
            const pin: any = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            pin.className = "wv-reader-pin";
            pin.textContent = RP_PIN_EMOJI;
            pin.setAttribute("title", bmId ? "Drag to move this bookmark" : "");
            pin.style.cssText = "position:absolute;z-index:2147483646;"
                + (bmId ? "pointer-events:auto;cursor:grab;" : "pointer-events:none;")
                + "user-select:none;font-size:26px;line-height:1;left:" + left + "px;top:" + top + "px;"
                + "transform:translate(-50%,-118%) scale(.4);opacity:0;"
                + "transition:opacity .18s ease-out,transform .18s ease-out;"
                + "filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));";
            pageView.div.appendChild(pin);
            const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : ((f: any) => win.setTimeout(f, 16));
            raf(() => { try { pin.style.opacity = "1"; pin.style.transform = "translate(-50%,-100%) scale(1)"; } catch (_) {} });

            // Lifecycle: fade after a beat, but pause while hovered/dragged so
            // there's time to grab it.
            let fadeT: any = null, killT: any = null;
            const stopFade = () => { try { win.clearTimeout(fadeT); win.clearTimeout(killT); } catch (_) {} fadeT = killT = null; };
            const startFade = (delay: number) => {
                stopFade();
                fadeT = win.setTimeout(() => { try { pin.style.transition = "opacity .25s,transform .25s"; pin.style.opacity = "0"; pin.style.transform = "translate(-50%,-118%) scale(.6)"; } catch (_) {} }, delay);
                killT = win.setTimeout(() => { try { pin.remove(); } catch (_) {} }, delay + 320);
            };
            startFade(2200);
            pin.addEventListener("mouseenter", () => { stopFade(); try { pin.style.transition = "transform .12s"; pin.style.opacity = "1"; pin.style.transform = "translate(-50%,-100%) scale(1)"; } catch (_) {} });
            pin.addEventListener("mouseleave", () => { if (!pin._wvDragging) startFade(900); });

            if (bmId) {
                const ridoc = reader._iframeWindow ? reader._iframeWindow.document
                    : (reader._iframe && reader._iframe.contentWindow && reader._iframe.contentWindow.document);
                const rootEl = doc.documentElement;
                const onDown = (e: any) => {
                    if (e.button !== 0) return;
                    e.preventDefault(); e.stopPropagation();
                    stopFade();
                    pin._wvDragging = true;
                    // The reader builds its PDF text selection in JS:
                    // _handlePointerMove extends _selectionRanges while
                    // this.action.type === 'selectText' (action + pointerDownPosition
                    // are set by _handlePointerDown on the page mousedown). For a
                    // single press Gecko fixes the mousedown target at press time,
                    // so an overlay/shield created now is too late to retarget it,
                    // and user-select / preventDefault can't touch a JS-driven
                    // selection. So neutralise the reader's drag-selection at the
                    // source: its mousedown handler runs on the window (capture),
                    // BEFORE our document-capture handler, so right after it has set
                    // action/pointerDownPosition we null them — then
                    // _handlePointerMove returns early (no selectText branch; see
                    // reader pdf-view.js ~L2724/L2902). Re-applied on each move for
                    // safety. Our pin drag uses its own pointer handlers and is
                    // unaffected.
                    const killSel = () => { try { pv.action = null; pv.pointerDownPosition = null; } catch (_) {} };
                    const onDocMouseDown = () => killSel();
                    try { doc.addEventListener("mousedown", onDocMouseDown, true); } catch (_) {}
                    killSel();
                    try { win.getSelection().removeAllRanges(); } catch (_) {}
                    const cleanup = () => {
                        try { doc.removeEventListener("mousedown", onDocMouseDown, true); } catch (_) {}
                        try { win.getSelection().removeAllRanges(); } catch (_) {}
                    };
                    pin.style.transition = "none"; pin.style.opacity = "1"; pin.style.cursor = "grabbing";
                    pin.style.position = "fixed";
                    try { rootEl.appendChild(pin); } catch (_) {}
                    try { pin.setPointerCapture(e.pointerId); } catch (_) {}
                    const place = (cx: number, cy: number) => { pin.style.left = cx + "px"; pin.style.top = cy + "px"; pin.style.transform = "translate(-50%,-100%) scale(1)"; };
                    place(e.clientX, e.clientY);
                    const PIN_SHADOW = "drop-shadow(0 2px 3px rgba(0,0,0,.45))";
                    const onMove = (ev: any) => {
                        killSel(); ev.preventDefault();
                        try { win.getSelection().removeAllRanges(); } catch (_) {}
                        place(ev.clientX, ev.clientY);
                        // Visual clue: a drop is only accepted over a page. Off-page
                        // greys the pin out + shows a no-drop cursor to say "not here".
                        const onPage = !!this._wvReaderPdfPosFromPoint(pv, ev.clientX, ev.clientY);
                        pin.style.cursor = onPage ? "grabbing" : "no-drop";
                        pin.style.opacity = onPage ? "1" : "0.4";
                        pin.style.filter = onPage ? PIN_SHADOW : ("grayscale(1) " + PIN_SHADOW);
                    };
                    const onUp = (ev: any) => {
                        cleanup();
                        pin._wvDragging = false;
                        const newPos = this._wvReaderPdfPosFromPoint(pv, ev.clientX, ev.clientY);
                        try { pin.remove(); } catch (_) {}
                        if (newPos) {
                            const att = this._wvReaderAtt(reader);
                            if (att) {
                                let pageLabel = "";
                                try { if (Array.isArray(pv._pageLabels) && pv._pageLabels[newPos.pageIndex]) pageLabel = pv._pageLabels[newPos.pageIndex]; } catch (_) {}
                                if (!pageLabel) pageLabel = String((newPos.pageIndex || 0) + 1);
                                this._bmReaderUpdatePosition(att.libraryID, att.itemKey, bmId,
                                    { position: newPos, pageLabel, label: "Page " + pageLabel })
                                    .then(() => { try { if (ridoc) this._wvReaderRenderBmList(reader, ridoc); } catch (_) {} });
                            }
                            // Re-drop the pin where it landed (then it fades).
                            this._wvReaderShowPin(reader, newPos, bmId);
                        } else {
                            // Off-page drop isn't allowed → cancel the move and
                            // re-show the pin at its ORIGINAL position, so it's clear
                            // the bookmark didn't change.
                            this._wvReaderShowPin(reader, position, bmId);
                        }
                    };
                    const onCancel = () => { cleanup(); pin._wvDragging = false; try { pin.remove(); } catch (_) {} };
                    pin.addEventListener("pointermove", onMove);
                    pin.addEventListener("pointerup", onUp);
                    pin.addEventListener("pointercancel", onCancel);
                };
                pin.addEventListener("pointerdown", onDown, true);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderShowPin err: " + e); }
    }

    /** Capture the reader's current location as a bookmark record. */
    _wvCaptureReaderLocation(reader: any) {
        const type = reader._type || "pdf";
        const ir = reader._internalReader;
        if (type === "pdf") {
            let pageIndex: any = null, pageLabel = "";
            // Prefer the PDF viewer's LIVE current page (the debounced
            // primaryViewStats can lag a navigation by a frame or two).
            try {
                const pv = ir._primaryView || ir._lastView;
                const app = pv && pv._iframeWindow && pv._iframeWindow.PDFViewerApplication;
                if (app && app.pdfViewer) pageIndex = app.pdfViewer.currentPageNumber - 1;
                if (pageIndex != null && pv && Array.isArray(pv._pageLabels)) {
                    pageLabel = pv._pageLabels[pageIndex] || "";
                }
            } catch (_) {}
            if (pageIndex == null) {
                try { pageIndex = (ir._state.primaryViewStats || {}).pageIndex || 0; } catch (_) { pageIndex = 0; }
            }
            if (!pageLabel) {
                try { pageLabel = (ir._state.primaryViewStats || {}).pageLabel || ""; } catch (_) {}
            }
            if (!pageLabel) pageLabel = String((pageIndex || 0) + 1);
            return { viewType: "pdf", location: { pageIndex }, pageLabel, label: "Page " + pageLabel };
        }
        // EPUB / snapshot (DOM views): capture a live, full CFI.
        let cfi: any = null, offset: any = undefined;
        try {
            const v = ir._lastView || ir._primaryView;
            if (v && v.flow && v.flow.startCFI) {
                cfi = v.flow.startCFI.toString();
                offset = v.flow.startCFIOffset;
            }
        } catch (_) {}
        if (!cfi) { try { cfi = ir._state.primaryViewState.cfi; } catch (_) {} }
        let scrollYPercent: any = undefined;
        try { scrollYPercent = ir._state.primaryViewState.scrollYPercent; } catch (_) {}
        return {
            viewType: type,
            location: { cfi, cfiElementOffset: offset, scrollYPercent },
            pageLabel: "",
            label: "Bookmark",
        };
    }

    async _wvReaderAddCurrentBookmark(reader: any, idoc: any, click?: any) {
        try {
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            const rec: any = this._wvCaptureReaderLocation(reader);
            rec.type = "position";
            // Store a PRECISE position (the exact clicked point — text OR
            // whitespace) so the bookmark returns to that spot and drops the pin
            // there, not at the page top. (EPUB/snapshot use the CFI location.)
            const pos = this._wvCaptureReaderPosition(reader, click);
            if (pos) {
                rec.position = pos;
                // Page label from the resolved page, in case it differs from the
                // viewport-top page captured by _wvCaptureReaderLocation.
                try {
                    const pv = reader._internalReader._primaryView || reader._internalReader._lastView;
                    if (pv && Array.isArray(pv._pageLabels) && pv._pageLabels[pos.pageIndex]) {
                        rec.pageLabel = pv._pageLabels[pos.pageIndex];
                        rec.label = "Page " + rec.pageLabel;
                    }
                } catch (_) {}
            }
            await this._bmReaderAdd(att.libraryID, att.itemKey, rec);
            this._wvReaderRenderBmList(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderAddCurrentBookmark err: " + e);
        }
    }

    /** A precise PDF position for a "this position" bookmark, resolved in order:
     *  1. the EXACT clicked point (`click.x/y`, chrome coords) mapped to a PDF
     *     point via the page under the cursor — works ANYWHERE on the page,
     *     text or whitespace (mirrors pdf-view's `pointerEventToPosition`);
     *  2. the word position under the cursor (`click.position`, has rects);
     *  3. a point at the current viewport top (PDF viewer `_location`).
     *  Returns null for non-PDF or on failure → caller falls back to the
     *  page/CFI location from `_wvCaptureReaderLocation`. */
    _wvCaptureReaderPosition(reader: any, click?: any) {
        try {
            if ((reader._type || "pdf") !== "pdf") {
                return (click && click.position && Number.isInteger(click.position.pageIndex)) ? click.position : null;
            }
            const ir = reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer || !win) return null;

            // 1) Exact clicked point → PDF point (anywhere on the page).
            if (click && typeof click.x === "number" && typeof click.y === "number" && pv._iframe) {
                try {
                    const br = pv._iframe.getBoundingClientRect();
                    const pos = this._wvReaderPdfPosFromPoint(pv, click.x - br.x, click.y - br.y);
                    if (pos) return pos;
                } catch (_) {}
            }
            // 2) Word position under the cursor.
            if (click && click.position && Number.isInteger(click.position.pageIndex)
                && Array.isArray(click.position.rects)) {
                return click.position;
            }
            // 3) Viewport top (last resort).
            const loc = app.pdfViewer._location;
            if (loc && Number.isInteger(loc.pageNumber)) {
                const left = Math.max((typeof loc.left === "number") ? loc.left : 0, 8);
                const top = (typeof loc.top === "number") ? loc.top : 0;
                return { pageIndex: loc.pageNumber - 1, rects: [[left, Math.max(0, top - 12), left + 12, top]] };
            }
        } catch (_) {}
        return null;
    }

    _wvNavigateReaderLocation(reader: any, bm: any) {
        try {
            if (bm && bm.position) {
                if (bm.type === "position") {
                    // Scroll precisely WITHOUT the built-in highlight box, then
                    // drop a temporary pin marking the exact spot.
                    let scrolled = false;
                    try {
                        const pv = reader._internalReader
                            && (reader._internalReader._primaryView || reader._internalReader._lastView);
                        if (pv && typeof pv.navigateToPosition === "function") {
                            pv.navigateToPosition(bm.position); scrolled = true;
                        }
                    } catch (_) {}
                    if (!scrolled) { try { reader.navigate({ position: bm.position }); } catch (_) {} }
                    this._wvReaderShowPin(reader, bm.position, bm.id);
                    return;
                }
                // A stored selection position scrolls to AND highlights the
                // text (the same flash as navigating to an annotation). Works
                // for PDF (rects) and EPUB/snapshot (selector) alike.
                reader.navigate({ position: bm.position });
                return;
            }
            const loc = bm && bm.location;
            if (!loc) return;
            if (bm.viewType === "pdf") {
                reader.navigate({ pageIndex: loc.pageIndex || 0 });
            } else if (loc.cfi) {
                reader.navigate({ pageNumber: loc.cfi });
            } else if (typeof loc.scrollYPercent === "number") {
                reader.navigate({ scrollYPercent: loc.scrollYPercent });
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvNavigateReaderLocation err: " + e);
        }
    }
}

const _readerPanelsDescriptors = Object.getOwnPropertyDescriptors(_ReaderPanelsMixin.prototype);
delete (_readerPanelsDescriptors as any).constructor;
export const readerPanelsMethods = _readerPanelsDescriptors;
