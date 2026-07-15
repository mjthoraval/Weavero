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

import { BOOKMARK_PATH, BOOKMARK_PATH_14, BOOKMARK_PATH_20, SCHEME_SVG_TEMPLATE, URL_GLOBE_SVG, URL_EXTERNAL_SVG, WV_FUNNEL_DATA_URI, WV_FUNNEL_PATH, WV_FUNNEL_STEM_COLOR } from "./constants";

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
const RP_TAG_ICON = "chrome://zotero/skin/16/universal/tag.svg";

// Weavero identity funnel (amber stem) — the canonical data: URI lives
// in constants.ts (WV_FUNNEL_DATA_URI) so every Weavero funnel shares
// the same artwork and stem colour. Used as the funnel-button icon at
// reader startup — gives the SAME visual as the library filter funnel
// without waiting for `_wvReaderPrefetchIcons` to land. `context-fill`
// cooperates with the parent IMG's `-moz-context-properties: fill` to
// inherit the outline colour.
const RP_FUNNEL_DATA_URI = WV_FUNNEL_DATA_URI;

// Person glyph for Added By / Modified By chips — the same Font Awesome
// "user" icon the reader uses for annotation authors (IconUser). Inline so
// it renders inside the reader iframe (chrome:// images are blocked there).
// The annotations-view author chip in Zotero's reader uses the same
// FontAwesome user silhouette at width="8" (see upstream
// reader/src/common/components/common/icons.js → IconUser). Matching
// it verbatim keeps Weavero's filter-popup author chips visually
// identical to Zotero's own. The 448×512 viewBox is FontAwesome's
// standard; at 8 px display the scale is extreme but the icon is so
// small it reads as a uniform glyph.
const RP_USER_SVG =
    '<svg width="8" viewBox="0 0 448 512" aria-hidden="true">'
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
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-options{flex:1 1 auto;display:flex;flex-wrap:wrap;gap:3px;}",
    // Tags can balloon into dozens of chips; cap the wrap-list at ~7
    // chip rows and scroll inside the popup. Slight horizontal padding
    // so the scrollbar doesn't crowd the right-most chip.
    // `scrollbar-width:thin` strips the legacy up/down arrow buttons
    // from the scrollbar so the thumb reads as one continuous track.
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-tags-row .wv-filter-options{max-height:170px;overflow-y:auto;scrollbar-width:thin;align-content:flex-start;padding-right:2px;}",
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
    // height:28px + box-sizing:border-box pins every icon-only tile at
    // the same outer height as the library popup. Without this clamp
    // the reader iframe's higher default line-height (16.8 vs 16 in
    // chrome) gave color tiles 22 tall and Has Comment 32 tall, while
    // annotation-type icons were 26 — mixed visual heights across what
    // should read as one row of tiles. Children center via flex
    // align-items, so the SVG/swatch inside is unaffected.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt-icon{padding:4px 6px;min-width:26px;height:28px;box-sizing:border-box;justify-content:center;gap:0;}",
    // `_makeLinkSvg` builds a 1em×1em SVG so it scales with surrounding
    // text in reader badges. Inside a filter-popup tile (font-size:12px
    // → 12×12 icon) that ends up smaller than the 16×16 icons next to
    // it (Has Tag / Has Related). Force 16×16 here for visual parity.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt-icon .wv-link-svg{width:16px;height:16px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-svg{display:inline-block;width:16px;height:16px;",
    "  -moz-context-properties:fill,stroke,fill-opacity,stroke-opacity;fill:currentColor;stroke:currentColor;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-chip-swatch{width:12px;height:12px;border-radius:50%;display:inline-block;box-sizing:border-box;border:1px solid rgba(0,0,0,0.15);}",
    "#" + RP_FILTER_POPUP_ID + " .wv-swatch-native{display:block;flex:0 0 auto;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-vertical-separator{width:1px;align-self:stretch;background:rgba(127,127,127,0.45);margin:2px 4px;}",
    // OR-group card tint (same as the library's .wv-filter-or-group) for
    // the "pick any of these" rows (colour, tags, added/modified by).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-or-group{background:rgba(127,127,127,0.18);border-radius:6px;padding:5px 6px;margin:1px 0;}",
    // Has Link inline SVG sizing inside a chip.
    "#" + RP_FILTER_POPUP_ID + " .wv-link-svg{width:16px;height:16px;display:inline-block;}",
    // Added By / Modified By person glyph.
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg{display:inline-flex;align-items:center;margin-right:5px;}",
    // Match Zotero's annotations-view author chip — `.author svg`
    // there gets no explicit size, the SVG renders at its declared
    // `width="8"`. Mirroring that keeps Weavero's filter-popup author
    // chips visually identical to the annotations-view footer.
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-user-svg svg{display:block;opacity:.8;}",
    // Group heading on its own line (separates Added By / Modified By without
    // eating chip width).
    "#" + RP_FILTER_POPUP_ID + " .wv-rf-grouphead{font-size:10px;opacity:.55;text-transform:uppercase;",
    "  letter-spacing:.04em;margin:3px 2px 1px;}",
    // Faded chip — value not present in the current filtered view (Tag Selector
    // style). Still clickable.
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-opt[data-inactive=\"true\"]{opacity:.35;}",
    // Bottom "Alt+Click to exclude" hint (same as library).
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-controls{display:flex;justify-content:center;align-items:center;margin-top:4px;}",
    "#" + RP_FILTER_POPUP_ID + " .wv-filter-bottom-hint{font-size:10px;opacity:0.5;text-align:center;padding:4px 0;}",
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
    "." + RP_FILTER_BTN_CLASS + " .wv-filter-svg{width:20px;height:20px;-moz-context-properties:fill,stroke;fill:currentColor;stroke:currentColor;}",
    // Dropmarker chevron next to the funnel icon — same 8×8 inline SVG
    // the tabs-menu file-type button uses; signals "opens a popup" so
    // the affordance matches Zotero's native filter buttons.
    "." + RP_FILTER_BTN_CLASS + " .wv-rf-chev{display:inline-flex;align-items:center;width:8px;height:8px;opacity:0.85;margin-left:1px;}",
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

// Solid-filled ribbon for "page" bookmark rows — just the outer half
// of BOOKMARK_PATH (no inner cutout). Visually contrasts with the
// hollow ribbon used for the sidebar tab glyph (RP_BM_RIBBON_TAB),
// so a "page" bookmark in a row reads as a different icon than the
// generic "bookmarks" tab. 16-unit viewBox so 1 SVG unit = 1 device
// pixel at the 16×16 row size — outer edges land on integer pixel
// rows for sharp rendering.
const RP_BM_RIBBON =
    '<svg viewBox="0 0 16 16" fill="currentColor">'
    + '<path d="M4 1H12V15L8 12L4 15Z"/></svg>';

// Tab-specific variant of the ribbon. The sidebar tab renders at 20×20,
// and 20 / 16 = 1.25 px per SVG unit on the shared path — every "integer"
// coordinate lands on a fractional pixel (the top edge at y=1 hits
// pixel-row 1.25, antialiased across two rows → the fuzzy top stripe).
// Re-author the same shape in a 20-unit viewBox with outer corners and
// the V-apex on **integer** coordinates so 1 SVG unit = 1 device pixel
// at the tab size; outer edges (top, sides, bottom corners, V-apex) are
// razor-sharp. Inner cutout uses a half-pixel y for the diagonals'
// perpendicular offset, where the slight AA is inside the glyph and
// unnoticeable.
const RP_BM_RIBBON_TAB =
    '<svg viewBox="0 0 20 20" fill="currentColor">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" '
    + 'd="' + BOOKMARK_PATH_20 + '"/></svg>';
const RP_PLUS_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 7V2h2v5h5v2H9v5H7V9H2V7z"/></svg>';
// 20-unit "+" specifically for the sidebar toolbar add button, which
// renders at 20×20. Same shape as BM_ADD_ICON (library toolbar +) —
// arms 2 units thick going edge-to-edge — so the same path is pixel-
// sharp at the 20-px display size. The 16-unit RP_PLUS_SVG above stays
// for 16-px sites (menu items).
const RP_PLUS_20_SVG =
    '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 4H11V9H16V11H11V16H9V11H4V9H9Z"/></svg>';
// Quote glyph for selected-text bookmarks — three filled "text line"
// rectangles. All y-edges on integer pixel rows so each line renders
// as exactly 2 sharp pixel rows with 2 empty rows between them
// (was: 1.4-tall lines on fractional y → every edge anti-aliased).
const RP_TEXT_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3H10V5H3ZM3 7H13V9H3ZM3 11H10V13H3Z"/></svg>';
// Pushpin glyph for position bookmarks — the 📌 emoji (user preference over a
// line map-pin). Used both as the list-row icon and the temporary in-document
// marker dropped on click.
const RP_PIN_EMOJI = "📌";
// Filled folder + folder-with-"+" matching the library popup icons
// (BM_FOLDER_ICON / BM_MENU_NEWFOLDER_ICON), themed via currentColor.
// Rounded body corners and a left-aligned tab; the "+" variant carves
// the bottom-right along the badge circle so the badge tessellates
// instead of overlapping.
// viewBox y-min = -2 shifts the rendered folder down by 2 units so it
// vertically centres with the row's text baseline. Path is unchanged.
const RP_FOLDER_SVG =
    '<svg viewBox="0 -2 16 16" fill="currentColor">'
    + '<path fill-rule="evenodd" d="'
    + 'M0 1A1 1 0 0 1 1 0H3.586A1 1 0 0 1 4.293 0.293L6 2H13A1 1 0 0 1 14 3V11A1 1 0 0 1 13 12H1A1 1 0 0 1 0 11Z'
    + 'M1 1H3.586L5.293 2.707C5.505 2.919 5.7 3 6 3H13V11H1Z"/></svg>';
const RP_FOLDER_PLUS_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor">'
    + '<path fill-rule="evenodd" d="'
    + 'M0 1A1 1 0 0 1 1 0H3.586A1 1 0 0 1 4.293 0.293L6 2H13A1 1 0 0 1 14 3V7.76A4.5 4.5 0 0 0 7.03 12H1A1 1 0 0 1 0 11Z'
    + 'M1 1H3.586L5.293 2.707C5.505 2.919 5.7 3 6 3H13V7.26A4.5 4.5 0 0 0 7.03 11H1Z"/>'
    + '<circle cx="11.5" cy="11.5" r="4" fill="none" stroke="currentColor" stroke-width="1"/>'
    + '<path d="M11 9H12V11H14V12H12V14H11V12H9V11H11Z"/></svg>';
// Reader bookmark context menu glyphs. Inlined paths from Zotero's
// native 16/universal/rename.svg + reset.svg (the reader iframe can't
// load chrome:// images), themed via `currentColor` to match the menu
// text colour. Delete keeps its baked red — same one-step-destructive
// reasoning as BM_DELETE_ICON in the library popup.
const RP_RENAME_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" d="M14.4141 0.707094C13.6331-0.0739541 12.3668-0.0739554 11.5857 0.707093L1.54845 10.7444L0.312744 15.6872L5.25555 14.4515L15.2928 4.4142C16.0739 3.63315 16.0739 2.36682 15.2928 1.58577L14.4141 0.707094ZM12.2928 1.4142C12.6833 1.02368 13.3165 1.02368 13.707 1.4142L14.5857 2.29288C14.9762 2.6834 14.9762 3.31657 14.5857 3.70709L13.4999 4.79288L11.207 2.49999L12.2928 1.4142ZM10.4999 3.20709L12.7928 5.49999L4.7443 13.5485L1.68711 14.3128L2.45141 11.2556L10.4999 3.20709ZM15 16H5.12134L6.12134 15H15V12H9.12134L10.1213 11H15H16V12V15V16H15Z"/></svg>';
const RP_DELETE_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="#e0483b" stroke-width="2" stroke-linecap="round">'
    + '<path d="M4 4l8 8M12 4l-8 8"/></svg>';
// "Reset to Original Name" — Zotero's native reset.svg (curved arrow).
const RP_REVERT_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" d="M4.79297 3.50001L8.29298 0L9 0.70719L6.70719 3L8.5 3V2.99998C12.0899 2.99998 15 5.91013 15 9.49998C15 13.087 12.0945 15.9953 8.50856 16L8.5 16L8.49145 16C4.90553 15.9954 2 13.087 2 9.49998C2 9.33175 2.00639 9.16501 2.01894 8.99999L3.02242 9C3.00758 9.16467 3 9.33144 3 9.49998C3 12.5375 5.46243 15 8.5 15C11.5376 15 14 12.5375 14 9.49998C14 6.46241 11.5376 3.99998 8.5 3.99998V4L6.70717 4L9 6.29282L8.29296 7L4.79297 3.50001Z"/></svg>';
// Expand/collapse chevrons for folder rows — Zotero's chevron-8 path
// (filled silhouette, same as the items-tree twisty). Down chevron is
// the canonical path; right chevron uses the same path rotated -90°
// around the centre (matches Zotero's CSS rotate(-90deg) on `.twisty`).
const RP_CHEV_DOWN =
    '<svg viewBox="0 0 8 8" fill="currentColor"><path d="M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2Z"/></svg>';
const RP_CHEV_RIGHT =
    '<svg viewBox="0 0 8 8" fill="currentColor"><path transform="rotate(-90 4 4)" d="M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2Z"/></svg>';
// Annotation-type glyphs for the bookmarks filter-chip row. Paths copied
// verbatim from Zotero's `chrome://zotero/skin/16/universal/annotate-*.svg`
// (same 16×16 viewBox the "Filter annotations" popup loads). Native size
// rendering = sharp at 16 CSS px. (Earlier we used the reader's res/icons/20
// 20×20 viewBox paths and scaled them to 16 px; 80 % non-integer scaling
// blurred the strokes.) `fill="context-fill"` in the original is rewritten
// to `currentColor` so my chip's `color` tints the glyph inline.
const RP_ANN_TYPE_SVG: { [k: string]: string } = {
    highlight:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M2 2H14V14H2V2ZM1 1H2H14H15V2V14V15H14H2H1V14V2V1ZM13 13L8.75 3H7.25L3 13H4.62985L5.90485 10H10.0952L11.3702 13H13ZM8 5.07023L6.32985 9H9.67015L8 5.07023Z" fill="currentColor"/>'
        + '</svg>',
    underline:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M13 13L8.75 3H7.25L3 13H4.62985L5.90485 10H10.0952L11.3702 13H13ZM8 5.07023L6.32985 9H9.67015L8 5.07023ZM15 15V14H1V15H15Z" fill="currentColor"/>'
        + '</svg>',
    note:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path d="M7.5 14.5H14.5V1.5H1.5V8.5M7.5 14.5L1.5 8.5M7.5 14.5V8.5H1.5" stroke="currentColor"/>'
        + '</svg>',
    text:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M13 1.5H3V3H7.24997V14H8.74997V3H13V1.5Z" fill="currentColor"/>'
        + '</svg>',
    image:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.0001 1H6.00015V2H10.0001V1ZM12.0001 4H4.00015V12H12.0001V4ZM3.00015 3V13H13.0001V3H3.00015ZM14.0001 14V12H15V15H12V14H14.0001ZM15.0001 6H14.0001V10H15.0001V6ZM1.0001 6H2.0001V10H1.0001V6ZM6.0001 14H10.0001V15H6.0001V14ZM12.0002 2L14.0003 2.00001L14.0002 4H15.0002V1H12.0002V2ZM2.0001 2.00001V4.00001H1.0001L1.0001 1.00001L4.0001 1.00001V2L2.0001 2.00001ZM4 14L2.00015 14L2.00015 12H1L1 15L4 15V14Z" fill="currentColor"/>'
        + '</svg>',
    ink:
        '<svg viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.2379 1.96038C7.35382 -0.685304 3.87074 -0.185451 2.14056 1.6023C1.09277 2.68497 0.770104 4.18435 1.20189 5.49993C0.859503 5.9151 0.586015 6.39922 0.406392 6.94321C-0.251619 8.93602 0.392748 11.5506 3.14369 14.3518L3.55138 13.3325C1.22808 10.8298 0.880354 8.69716 1.35597 7.25675C1.44524 6.98637 1.56492 6.73451 1.70984 6.50322C2.01734 6.9348 2.42776 7.31991 2.94254 7.62876C5.08604 8.91477 7.00043 8.47453 7.78686 7.27398C8.17397 6.68302 8.24618 5.93402 7.87663 5.2695C7.51213 4.61407 6.76938 4.12858 5.69987 3.91011C4.4187 3.64842 3.08109 3.95856 2.04205 4.71173C1.9233 3.869 2.19892 2.97994 2.85915 2.29774C4.12914 0.98549 7.04616 0.285329 11.7616 2.83966L12.2379 1.96038ZM3.45701 6.77126C2.98486 6.48799 2.62971 6.12157 2.39003 5.71152C3.22891 4.98627 4.3888 4.66296 5.49973 4.88988C6.38853 5.07143 6.82496 5.43594 7.00268 5.75551C7.17534 6.06599 7.1528 6.41698 6.95036 6.72602C6.55769 7.32546 5.31375 7.88522 3.45701 6.77126ZM13.2929 4C13.6834 3.60948 14.3166 3.60948 14.7071 4L15.5 4.79289C15.8905 5.18342 15.8905 5.81658 15.5 6.20711L7.42612 14.281C7.33036 14.3767 7.21615 14.4521 7.09041 14.5024L4.6857 15.4642L3.60247 15.8975L4.03576 14.8143L4.99765 12.4096C5.04794 12.2839 5.12325 12.1696 5.21902 12.0739L13.2929 4ZM12.5 6.20715L5.92612 12.781L5.39753 14.1025L6.71902 13.5739L13.2929 7.00004L12.5 6.20715ZM13.2071 5.50004L14 6.29293L14.7929 5.5L14 4.70711L13.2071 5.50004Z" fill="currentColor"/>'
        + '</svg>',
};

const RP_BM_CSS = [
    // When our tab is active, hide the React view wrappers and show ours.
    "#sidebarContainer." + RP_BM_TAB_ON + " #sidebarContent > .viewWrapper:not(." + RP_BM_VIEW_CLASS + "){display:none!important;}",
    "." + RP_BM_VIEW_CLASS + "{display:none;flex-direction:column;height:100%;min-height:0;overflow:hidden;}",
    "#sidebarContainer." + RP_BM_TAB_ON + " ." + RP_BM_VIEW_CLASS + "{display:flex!important;}",
    "." + RP_BM_TAB_CLASS + " svg{width:20px;height:20px;}",
    ".wv-bm-reader-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.2);}",
    ".wv-bm-reader-head .wv-bm-reader-htitle{flex:1;font-weight:600;opacity:.75;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}",
    ".wv-bm-reader-add{display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;border-radius:5px;color:var(--fill-secondary);}",
    ".wv-bm-reader-add:hover{background-color:var(--fill-quinary);color:var(--fill-primary);}",
    ".wv-bm-reader-add:active{background-color:var(--fill-quarternary);}",
    // Single-row header: scope toggle (segmented) on the left, + button right.
    ".wv-bm-scope-toggle{display:flex;align-items:center;gap:6px;padding:6px 8px;}",
    ".wv-bm-scope-group{display:flex;flex:1;min-width:0;}",
    ".wv-bm-scope-btn{flex:1;padding:3px 6px;font-size:12px;border:1px solid rgba(127,127,127,.35);background:none;color:inherit;cursor:pointer;opacity:.7;}",
    ".wv-bm-scope-group .wv-bm-scope-btn:first-child{border-radius:4px 0 0 4px;}",
    ".wv-bm-scope-group .wv-bm-scope-btn:last-child{border-radius:0 4px 4px 0;border-left:none;}",
    ".wv-bm-scope-btn:hover{opacity:.95;background:rgba(127,127,127,.12);}",
    ".wv-bm-scope-btn.wv-bm-scope-active{background:var(--color-accent,#5e6ad2);color:#fff;border-color:var(--color-accent,#5e6ad2);opacity:1;}",
    ".wv-bm-scope-btn.wv-bm-scope-dropok{outline:2px solid var(--color-accent,#5e6ad2);outline-offset:-2px;opacity:1;}",
    // While a cross-scope drop is hovering (group has .wv-bm-scope-dragover),
    // dim the active button so its solid blue doesn't compete with the
    // drop-target outline — the drop is going to the OTHER button.
    ".wv-bm-scope-group.wv-bm-scope-dragover .wv-bm-scope-btn.wv-bm-scope-active{"
        + "background:transparent;color:inherit;"
        + "border-color:rgba(127,127,127,.35);opacity:.55;}",
    // Search affordance — magnifier in the header row, input row below.
    // Action buttons live in the reader sidebar's top toolbar `.end` slot,
    // beside the tab icons. Hidden by default — the bookmarks-tab gate
    // class on `#sidebarContainer` reveals them only while the bookmarks
    // tab is active, so the other tabs (thumbnails / annotations /
    // outline) keep their clean toolbar.
    //
    // Fade-in instead of jumping when the bookmarks tab is focused.
    // Plain `display:none -> display:flex` is instant — we use Firefox's
    // `@starting-style` + `transition-behavior: allow-discrete` (Gecko
    // 129+, Zotero 10 runs Firefox 140) so opacity transitions from 0
    // even though the resting state is `display:none`. On other tabs
    // the buttons take no space; on the bookmarks tab they fade in.
    ".wv-bm-sidebar-actions{display:none;align-items:center;gap:2px;opacity:0;transition:opacity 0.15s ease-out, display 0.15s ease-out allow-discrete;}",
    "#sidebarContainer." + RP_BM_TAB_ON + " .wv-bm-sidebar-actions{display:flex;opacity:1;}",
    "@starting-style{",
    " #sidebarContainer." + RP_BM_TAB_ON + " .wv-bm-sidebar-actions{opacity:0;}",
    "}",
    // Fallback action bar at the top of the pane (only used when the
    // upstream `.sidebar-toolbar > .end` slot isn't found — e.g. some
    // alternative theme).
    ".wv-bm-actionbar{display:flex;align-items:center;justify-content:flex-end;gap:2px;padding:4px 8px 2px;}",
    ".wv-bm-search-btn,.wv-bm-reader-add{width:28px;height:28px;}",
    // Filter button grows horizontally to fit the funnel + ▾ chevron
    // (same icon-and-chevron pattern as the reader toolbar funnel).
    ".wv-bm-filter-btn{height:28px;padding:0 4px;gap:1px;}",
    ".wv-bm-search-btn svg,.wv-bm-reader-add svg{width:20px;height:20px;}",
    // Filter funnel renders at 16×16 (centered inside the 28×28 button)
    // to match Zotero's reader-toolbar filter button exactly. Same SVG
    // artwork, same dimensions, same visual weight.
    // Direct-child selector so this only sizes the funnel SVG; the
    // chevron's SVG is a grandchild inside `.wv-bm-filter-chev` and
    // stays at its own 8×8 size.
    ".wv-bm-filter-btn > svg{width:20px;height:20px;}",
    ".wv-bm-filter-btn .wv-bm-filter-chev{display:inline-flex;align-items:center;width:8px;height:8px;opacity:0.85;}",
    ".wv-bm-filter-btn .wv-bm-filter-chev svg{width:8px;height:8px;}",
    // Hover/dim pattern lifted verbatim from Zotero's reader
    // `_search-box.scss` so the bookmark action buttons (search /
    // filter / add) feel native to the sidebar toolbar:
    //   default: color var(--fill-secondary) — dim via colour, not opacity
    //   hover:   var(--fill-quinary) background, colour goes primary
    //   active:  var(--fill-quarternary) background (pressed feel)
    //   open:    var(--fill-quinary) background, colour primary (search
    //            row showing / filter popover open — sticky bg matches
    //            the upstream `.expanded` state of the search box)
    // Match Zotero's `_search-box.scss` exactly, including the smooth
    // transition on background-color / color so the state changes don't
    // pop. The hover rule is gated by `:not(.wv-bm-search-active)` to
    // mirror upstream's `:not(.expanded)` — once the search row is open,
    // the button stops responding to hover-bg (it stays in its open
    // state visual instead of being overridden by hover). Active state
    // uses a heavier `--fill-quarternary` background (matching upstream
    // expanded look) — distinguishes "search is open" from "search is
    // closed but you're hovering".
    ".wv-bm-search-btn{display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;border-radius:5px;color:var(--fill-secondary);transition:background-color 0.12s ease-out,color 0.12s ease-out;}",
    ".wv-bm-search-btn:not(.wv-bm-search-active):hover{background-color:var(--fill-quinary);color:var(--fill-primary);}",
    ".wv-bm-search-btn:not(.wv-bm-search-active):active{background-color:var(--fill-quarternary);}",
    ".wv-bm-search-btn.wv-bm-search-active{background-color:var(--fill-quarternary);color:var(--fill-primary);}",
    // Filter funnel button — same dimensions as the search button so the
    // toolbar reads as a row of equal-sized affordances. `wv-bm-filter-open`
    // marks the popover-open state; `wv-bm-filter-active` marks "any chip
    // currently selected" so the user notices the list is filtered even
    // when the popover is closed (accent dot in the bottom-right corner).
    // Same hover/dim ladder as the search button — color via
    // `--fill-secondary`, hover `--fill-quinary`, active `--fill-quarternary`,
    // popover-open keeps `--fill-quinary` background for a sticky "active
    // surface" feel. The accent-blue dot at the funnel icon's top-right
    // surfaces when any chip is selected — same style/position as the
    // library filter button's `.wv-filter-tb-dot` (see constants.ts).
    ".wv-bm-filter-btn{display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;border-radius:5px;color:var(--fill-secondary);position:relative;}",
    ".wv-bm-filter-btn:hover{background-color:var(--fill-quinary);color:var(--fill-primary);}",
    ".wv-bm-filter-btn:active{background-color:var(--fill-quarternary);}",
    ".wv-bm-filter-btn.wv-bm-filter-open{background-color:var(--fill-quinary);color:var(--fill-primary);}",
    // Funnel icon sits at x=4..24 (padding 4 + 20-wide svg). Dot at
    // top:3, left:18 lands at icon's top-right corner — same offset
    // the library filter uses against its own 20-wide funnel icon.
    ".wv-bm-filter-btn.wv-bm-filter-active::after{content:'';position:absolute;top:3px;left:18px;width:6px;height:6px;border-radius:50%;background:var(--color-accent,#5e6ad2);pointer-events:none;}",
    // Chip popover — anchored under the filter button by the toggle helper.
    // Position is set inline; visible-by-default once attached (toggle
    // adds/removes the element itself). Z-index sits above the row drop
    // indicators (which are at 2147483647 — see drop-line styles), and
    // matches the menu / context-menu z-index ladder.
    ".wv-bm-chip-popup{position:absolute;z-index:2147483647;background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.4);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:8px 10px;min-width:220px;max-width:340px;max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:5px;font-size:12px;}",
    ".wv-bm-chip-popup-empty{padding:4px 2px;opacity:.6;font-style:italic;}",
    // The old docked chip-bar + its resizer are now superseded by the
    // popover above. Hard-hide them so any cached DOM from a previous
    // build doesn't reserve space at the bottom of the pane.
    ".wv-bm-chip-bar{display:none!important;}",
    ".wv-bm-chip-resizer{display:none!important;}",
    ".wv-bm-search-row{display:flex;padding:0 8px 6px;}",
    ".wv-bm-search-input{flex:1;padding:3px 6px;font-size:12px;border:1px solid rgba(127,127,127,.35);border-radius:4px;background:rgba(127,127,127,.06);color:inherit;}",
    ".wv-bm-search-input:focus{outline:none;border-color:var(--color-accent,#5e6ad2);}",
    // Dim folders shown only because of a matching descendant (the folder
    // itself doesn't match the search query) so direct matches stand out.
    ".wv-bm-reader-row.wv-bm-dimmed{opacity:.55;}",
    // Orphan bookmark (Zotero target deleted/purged): dim + strike the label +
    // a ⚠ badge; clicking flashes the row instead of silently doing nothing.
    ".wv-bm-reader-row.wv-bm-missing{opacity:.55;}",
    ".wv-bm-reader-row.wv-bm-missing .wv-bm-reader-label{text-decoration:line-through;text-decoration-color:rgba(224,72,59,.55);}",
    ".wv-bm-reader-missing-badge{flex:0 0 auto;margin-left:2px;color:#e0483b;font-size:11px;line-height:1;}",
    "@keyframes wv-bm-reader-pulse{0%,100%{background:transparent;}30%{background:rgba(224,72,59,.30);}}",
    ".wv-bm-reader-row.wv-bm-reader-flash{animation:wv-bm-reader-pulse .6s ease;}",
    ".wv-bm-reader-add:hover{background:rgba(127,127,127,.16);}",
    // Inherit the 20×20 svg size from the .wv-bm-actionbar rule above;
    // the previous 15×15 override forced 15/16 sub-pixel scaling on a
    // 16-unit viewBox → blurry.
    ".wv-bm-reader-list{flex:1 1 auto;overflow:auto;min-height:0;padding:4px;}",
    // Filter chips at the bottom (selector strip) — mirrors the annotations
    // pane's color/tag/author rows. Persists across scopes and dimensions
    // AND together (a node must satisfy every active row).
    // Bottom chip-bar starts at ~140 px (same default cap as the reader's
    // own annotations Selector, _annotations-view.scss line 47). The height
    // is user-resizable via a drag handle above it (mirrors the library
    // tag-selector splitter); the chosen value is stored in the
    // `weavero.readerBmChipBarHeight` pref. Internally `flex:0 0 <px>` so
    // the bar carves out fixed space; `overflow:auto` lets crowded rows
    // scroll within it.
    ".wv-bm-chip-bar{flex:0 0 140px;padding:6px 8px;display:none;flex-direction:column;gap:5px;overflow:auto;}",
    ".wv-bm-chip-bar.wv-bm-chip-bar-on{display:flex;}",
    // Drag handle above the chip bar — same idiom as upstream's XUL splitter
    // (see scss/components/_splitter.scss): the bar is 5 px tall for a
    // comfortable hit zone, but a -4 px bottom margin overlaps it into the
    // chip bar so only a 1-px border line is visible. Result: a hair-thin
    // separator that's still easy to grab. position:relative + z-index keeps
    // the overlapping portion on top of the chip bar's edge.
    ".wv-bm-chip-resizer{flex:0 0 auto;height:5px;margin-bottom:-4px;border-top:1px solid rgba(127,127,127,.35);cursor:ns-resize;background:transparent;position:relative;z-index:2;display:none;}",
    ".wv-bm-chip-resizer.wv-bm-chip-bar-on{display:block;}",
    ".wv-bm-chip-row{display:flex;flex-wrap:wrap;gap:4px;}",
    // Pin toggle — same 20×20 box as the color filters (16px SVG +
    // 2px padding on every side). Sits at the right end of the FIRST
    // chip row via `margin-left: auto` so it lines up horizontally
    // with the colored squares. Off (default) = per-scope filters
    // (This Document / Library each keep their own); on = global.
    ".wv-bm-chip-pin{display:inline-flex;align-items:center;justify-content:center;"
        + "width:20px;height:20px;padding:2px;border:none;background:none;"
        + "cursor:pointer;color:inherit;opacity:.45;border-radius:3px;"
        + "margin-left:auto;flex:0 0 auto;}",
    ".wv-bm-chip-pin:hover{opacity:.85;background:var(--fill-quinary,rgba(127,127,127,.16));}",
    // On (pinned) — render as a solid accent-blue chip, matching the
    // visual weight of `.wv-bm-scope-active`. Filled background + white
    // icon reads unambiguously as "active state" instead of the easy-to-
    // miss accent-coloured outline glyph the earlier version used.
    ".wv-bm-chip-pin.wv-bm-chip-pin-on{opacity:1;color:#fff;"
        + "background:var(--color-accent,#5e6ad2);}",
    ".wv-bm-chip-pin.wv-bm-chip-pin-on:hover{background:var(--color-accent,#5e6ad2);"
        + "filter:brightness(1.1);}",
    ".wv-bm-chip-pin svg{width:16px;height:16px;display:block;}",
    // Colors row is tighter (1-px gap, like upstream's .colors .color
    // margin-left:1px) so 20×20 buttons read as a row of tiles, not as
    // spaced-out chips. Tags / authors / types keep the 4-px row gap.
    // Chip popup now uses the SAME button class as the filter popup
    // (`.wv-filter-opt.wv-filter-opt-icon` + `.wv-chip-swatch` for
    // colors) so tile sizes and rendering match popups 1 & 2 exactly.
    // The rules below scope the filter-popup styling to the chip
    // popup container too — same declarations as the
    // `#wv-reader-filter-popup` rules above (lines ~113-141).
    ".wv-bm-chip-popup .wv-filter-opt{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(127,127,127,0.4);background:transparent;color:inherit;font:inherit;font-size:12px;}",
    ".wv-bm-chip-popup .wv-filter-opt:hover{background:rgba(127,127,127,0.08);}",
    ".wv-bm-chip-popup .wv-filter-opt[data-selected=\"true\"]{background:rgba(94,106,210,0.34);border-color:rgba(94,106,210,0.95);box-shadow:inset 0 0 0 1px rgba(94,106,210,0.55);}",
    ".wv-bm-chip-popup .wv-filter-opt[data-selected=\"true\"]:hover{background:rgba(94,106,210,0.45);}",
    ".wv-bm-chip-popup .wv-filter-opt[data-excluded=\"true\"]{background:linear-gradient(to top right,transparent calc(50% - 1px),rgba(220,72,72,0.95) calc(50% - 1px),rgba(220,72,72,0.95) calc(50% + 1px),transparent calc(50% + 1px)),rgba(220,72,72,0.16);border-color:rgba(220,72,72,0.95);}",
    ".wv-bm-chip-popup .wv-bm-chip.excluded{background:rgba(220,72,72,0.16);border-color:rgba(220,72,72,0.95);text-decoration:line-through;}",
    ".wv-bm-chip-popup .wv-filter-opt-icon{padding:4px 6px;min-width:26px;height:28px;box-sizing:border-box;justify-content:center;gap:0;}",
    ".wv-bm-chip-popup .wv-chip-swatch{width:12px;height:12px;border-radius:50%;display:inline-block;box-sizing:border-box;border:1px solid rgba(0,0,0,0.15);}",
    ".wv-bm-chip-popup .wv-swatch-native{display:block;flex:0 0 auto;}",
    // OR-group card tint — applied to each chip row so the popup reads
    // as a stack of "pick any of these" sets, matching the library
    // filter / reader annotations filter (`#wv-reader-filter-popup
    // .wv-filter-or-group` at line ~147). Lives in the reader iframe
    // so this rule must be scoped under `.wv-bm-chip-popup` (the
    // chrome-window equivalent in constants.ts is unreachable from here).
    ".wv-bm-chip-popup .wv-filter-or-group{background:rgba(127,127,127,0.18);border-radius:6px;padding:5px 6px;margin:1px 0;}",
    // Vertical separator used to push black off the standard 8-colour
    // palette in the colors row (mirrors the library filter pattern —
    // upstream Zotero treats black as EXTRA_INK_AND_TEXT_COLORS).
    ".wv-bm-chip-popup .wv-filter-vertical-separator{width:1px;align-self:stretch;background:rgba(127,127,127,0.45);margin:2px 4px;}",
    // Inline annotation-type SVG injected into the type buttons via
    // innerHTML (RP_ANN_TYPE_SVG) lacks a sizing class — pin it to
    // 16×16 so the glyph fills the icon area like the filter popup.
    ".wv-bm-chip-popup .wv-filter-opt-icon svg{width:16px;height:16px;display:block;}",
    ".wv-bm-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;font-size:11px;line-height:1.4;border:1px solid rgba(127,127,127,.4);border-radius:10px;cursor:pointer;background:rgba(127,127,127,.06);color:inherit;user-select:none;-moz-user-select:none;}",
    ".wv-bm-chip:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-chip.selected{background:var(--color-accent,#5e6ad2);color:#fff;border-color:var(--color-accent,#5e6ad2);}",
    ".wv-bm-chip.inactive{opacity:.45;}",
    ".wv-bm-chip-tag-dot{width:7px;height:7px;border-radius:50%;display:inline-block;}",
    ".wv-bm-chip-type.selected svg{opacity:1;}",
    ".wv-bm-reader-row{position:relative;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:4px;cursor:pointer;user-select:none;-moz-user-select:none;}",
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
    ".wv-bm-reader-row .wv-bm-reader-ic svg{width:16px;height:16px;opacity:.85;}",
    ".wv-bm-reader-row .wv-bm-reader-ic img{width:16px;height:16px;}",
    ".wv-bm-reader-row .wv-bm-reader-ic.wv-bm-emoji{font-size:13px;line-height:16px;opacity:1;}",
    ".wv-bm-reader-row .wv-bm-reader-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    // URL bookmark labels follow the same scheme palette Weavero uses
    // for inline links in notes / reader / item pane. Self-contained
    // declaration so the sidebar paints correctly even if the surface's
    // global link-colour stylesheet isn't loaded.
    ":root .wv-bm-reader-label.wv-link-http{color:#1a73e8;}",
    ":root .wv-bm-reader-label.wv-link-zotero{color:#8b4513;}",
    ":root .wv-bm-reader-label.wv-link-app{color:#9333ea;}",
    "@media (prefers-color-scheme: dark){",
    " :root .wv-bm-reader-label.wv-link-http{color:#8ab4f8;}",
    " :root .wv-bm-reader-label.wv-link-zotero{color:#cd853f;}",
    " :root .wv-bm-reader-label.wv-link-app{color:#c084fc;}",
    "}",
    ".wv-bm-reader-sublabel{opacity:.55;font-style:italic;}",
    ".wv-bm-reader-row .wv-bm-reader-page{flex:0 0 auto;opacity:.5;font-size:11px;}",
    ".wv-bm-reader-row .wv-bm-reader-actions{display:none;gap:1px;flex:0 0 auto;}",
    ".wv-bm-reader-row:hover .wv-bm-reader-actions{display:flex;}",
    ".wv-bm-reader-actbtn{border:none;background:none;cursor:pointer;opacity:.55;padding:1px 4px;border-radius:3px;color:inherit;font-size:12px;line-height:1;}",
    ".wv-bm-reader-actbtn:hover{opacity:1;background:rgba(127,127,127,.2);}",
    ".wv-bm-reader-empty{opacity:.5;padding:14px 10px;font-size:12px;text-align:center;line-height:1.5;}",
    // Per-section how-to hint shown under an empty "This Document" / "Elsewhere"
    // header (so the sections stay visible + addable even with no bookmarks).
    ".wv-bm-reader-empty-section{opacity:.5;padding:3px 10px 8px;font-size:11px;line-height:1.45;}",
    ".wv-bm-reader-grouphead{font-size:11px;padding:6px 8px 2px;display:flex;align-items:center;gap:4px;}",
    ".wv-bm-reader-grouphead .wv-bm-gh-title{flex:1;opacity:.55;}",
    ".wv-bm-reader-newfolder{display:flex;align-items:center;justify-content:center;width:22px;height:20px;border:none;background:none;cursor:pointer;border-radius:3px;color:inherit;opacity:.5;padding:0;flex:0 0 auto;}",
    ".wv-bm-reader-newfolder:hover{opacity:.95;background:rgba(127,127,127,.2);}",
    ".wv-bm-reader-newfolder svg{width:16px;height:16px;}",
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
    ".wv-bm-reader-row .wv-bm-reader-chev{flex:0 0 auto;width:16px;height:16px;padding:4px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;opacity:.6;}",
    ".wv-bm-reader-row .wv-bm-reader-chev svg{width:8px;height:8px;}",
    ".wv-bm-reader-row .wv-bm-reader-chev.wv-bm-reader-chev-spacer{visibility:hidden;}",
    ".wv-bm-reader-row.wv-bm-drop-into{box-shadow:inset 0 0 0 2px var(--color-accent,#5e6ad2);border-radius:4px;}",
    // Right-click context menu (Add Bookmark / New Folder / row actions).
    "#" + RP_BM_CTX_ID + "{position:absolute;z-index:2147483647;background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.4);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:4px;min-width:160px;font-size:13px;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;cursor:pointer;white-space:nowrap;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-item:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic{flex:0 0 auto;width:16px;height:16px;display:flex;align-items:center;justify-content:center;opacity:.8;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic.wv-ctx-ic-native{opacity:1;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-ic svg{width:16px;height:16px;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-sep{height:1px;background:rgba(127,127,127,.3);margin:4px 2px;}",
    // "Add Bookmark ▸" submenu: a flyout that appears on hover of the parent
    // item. The flyout is a DOM descendant of the menu so click-outside dismiss
    // (which checks `menu.contains`) treats it as inside.
    "#" + RP_BM_CTX_ID + " .wv-ctx-haschild{position:relative;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-arrow{margin-left:auto;padding-left:14px;opacity:.6;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-submenu{display:none;position:absolute;left:100%;top:-5px;z-index:1;background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.4);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.3);padding:4px;min-width:180px;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-submenu.wv-ctx-submenu-left{left:auto;right:100%;}",
    "#" + RP_BM_CTX_ID + " .wv-ctx-haschild:hover > .wv-ctx-submenu{display:block;}",
    // Modal Add-Link dialog (Text + URL fields), mounted inside the
    // reader iframe so it covers the iframe viewport. Backdrop dims
    // the document; dialog centers and uses Canvas/CanvasText to track
    // light/dark themes.
    ".wv-bm-url-dialog-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.40);z-index:2147483646;display:flex;align-items:center;justify-content:center;}",
    ".wv-bm-url-dialog{background:Canvas;color:CanvasText;border:1px solid rgba(127,127,127,.5);border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.45);padding:14px 16px;min-width:340px;max-width:560px;font-size:13px;display:flex;flex-direction:column;gap:8px;}",
    ".wv-bm-url-dialog-row{display:flex;flex-direction:column;gap:3px;}",
    ".wv-bm-url-dialog-label{font-size:11px;opacity:.7;font-weight:500;}",
    ".wv-bm-url-dialog-input{font:inherit;padding:5px 7px;border:1px solid rgba(127,127,127,.4);border-radius:4px;background:Field;color:FieldText;outline:none;}",
    ".wv-bm-url-dialog-input:focus{border-color:var(--color-accent,#5e6ad2);box-shadow:0 0 0 2px color-mix(in srgb,var(--color-accent,#5e6ad2) 25%,transparent);}",
    ".wv-bm-url-dialog-btns{display:flex;justify-content:flex-end;gap:6px;margin-top:6px;}",
    ".wv-bm-url-dialog-btn{font:inherit;padding:5px 14px;border:1px solid rgba(127,127,127,.45);border-radius:4px;background:transparent;color:inherit;cursor:pointer;}",
    ".wv-bm-url-dialog-btn:hover{background:rgba(127,127,127,.14);}",
    ".wv-bm-url-dialog-btn-primary{background:var(--color-accent,#5e6ad2);border-color:var(--color-accent,#5e6ad2);color:#fff;}",
    ".wv-bm-url-dialog-btn-primary:hover{filter:brightness(1.08);}",
].join("");

/** Rich bookmark hover card styles. Extracted from RP_BM_CSS so the library-
 *  pane bookmark popup (in the main window) can inject the same look without
 *  pulling in reader-iframe-specific rules. */
export const BM_HOVERCARD_CSS = [
    // Interactive (expandable), so it captures the pointer; it auto-hides when
    // the cursor leaves BOTH the row and card.
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
    // Annotation-sidebar look: annotation text gets a coloured left bar (the
    // annotation color, via --wv-ann-color set inline; a neutral fallback for
    // non-annotation bookmarks). The text reads as a quote block.
    ".wv-bm-hovercard .wv-hc-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0;padding:1px 0 1px 8px;border-left:3px solid var(--wv-ann-color,rgba(127,127,127,.35));}",
    ".wv-bm-hovercard.wv-hc-has-color .wv-hc-text{font-style:italic;}",
    ".wv-bm-hovercard .wv-hc-author{flex:0 0 auto;margin-left:auto;font-size:11px;opacity:.6;font-weight:400;white-space:nowrap;}",
    // Comment block: NO colored left bar (Zotero's annotation sidebar styles
    // `.comment` with only a faint bottom separator, no `.blockquote-border`
    // — that's reserved for the highlight `.text` quote).
    ".wv-bm-hovercard .wv-hc-comment{margin:6px 0 3px;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;}",
    ".wv-bm-hovercard .wv-hc-tags{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-top:3px;}",
    // Tag glyph: filled, same orange as the library filter's Has Tag tile
    // (var(--accent-orange) — themed across light/dark).
    ".wv-bm-hovercard .wv-hc-tag-ic{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:14px;height:14px;margin-right:2px;color:var(--accent-orange,#e08a3c);opacity:1;}",
    ".wv-bm-hovercard .wv-hc-tag-ic svg{width:12px;height:12px;}",
    ".wv-bm-hovercard .wv-hc-tag{font-size:11px;padding:1px 6px;border-radius:8px;background:rgba(127,127,127,.18);display:inline-flex;align-items:center;}",
    // Colored dot prefix on tags that have a library-level Zotero tag color
    // (matches the item pane's coloured-tag indicator).
    ".wv-bm-hovercard .wv-hc-tag-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.15);}",
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
        const urls = [RP_FUNNEL_ICON, RP_RELATED_ICON, RP_TAG_ICON];
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
                    // (The funnel BUTTON keeps its two-tone data URI —
                    // the prefetched plain chrome funnel would erase the
                    // amber stem identity, so no src swap here any more.)
                    const pop = d.getElementById(RP_FILTER_POPUP_ID);
                    if (pop) this._wvRenderReaderFilterPopup(r, d, pop);
                }
            } catch (_) {}
        }).catch(() => { this._wvReaderIconsPrefetching = false; });
    }

    _wvEnsureReaderPanelStyles(idoc: any) {
        const css = RP_POPUP_CSS + RP_BM_CSS + BM_HOVERCARD_CSS;
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
                hasTag: null as (boolean | null),
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
            || st.hasComment !== null || st.hasRelated !== null || st.hasLink !== null || st.hasTag !== null
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

    // ---- Bookmarks-pane filter chips ---------------------------------------
    // Bottom selector strip (colors / tags / authors / annotation types) that
    // mirrors the annotations pane's bottom filter.
    //
    // Selections are kept PER-READER in a small bag carrying three independent
    // chip-state slots:
    //   • bag.document  — chips for the "This Document" scope (default)
    //   • bag.library   — chips for the "Library" scope (default)
    //   • bag.global    — chips applied to both scopes, used when bag.pinned
    //
    // When `bag.pinned` is true, the global slot is the effective filter on
    // every scope. When false (the default), each scope keeps its own filter
    // and switching scopes shows the chip selections for THAT scope.
    //
    // Strict matching with ancestor-folder dimming: non-matching items hide;
    // folders that hold a matching descendant render dimmed (same idiom as
    // the search filter).

    _wvReaderBmChipBag(reader: any) {
        if (!this._wvBmChips) this._wvBmChips = new WeakMap();
        let bag = this._wvBmChips.get(reader);
        if (!bag) {
            const fresh = () => ({
                colors: new Set<string>(), tags: new Set<string>(),
                authors: new Set<string>(), types: new Set<string>(),
                colorsExcl: new Set<string>(), tagsExcl: new Set<string>(),
                authorsExcl: new Set<string>(), typesExcl: new Set<string>(),
            });
            bag = { document: fresh(), library: fresh(), global: fresh(), pinned: false };
            this._wvBmChips.set(reader, bag);
        }
        return bag;
    }

    _wvReaderBmChipState(reader: any) {
        const bag = this._wvReaderBmChipBag(reader);
        // Filter behaviour follows the scope automatically:
        //   • "both"    → shared `global` slot (filter applies across all
        //                 three sections at once)
        //   • "library" → bag.library
        //   • "document" → bag.document
        // The legacy pin toggle is gone — Ctrl-click on a scope button now
        // controls the merged state, which controls the shared filter.
        const scope = this._wvReaderBmScope();
        if (scope === "both") return bag.global;
        return scope === "library" ? bag.library : bag.document;
    }

    /** Seed the global chip slot from whichever per-scope filter was last
     *  active, so entering the merged ("both") scope carries the existing
     *  filter context across rather than starting blank. Called from the
     *  scope-button click handler when transitioning into "both". */
    _wvReaderBmChipsSeedGlobal(reader: any, fromScope: string) {
        const bag = this._wvReaderBmChipBag(reader);
        const src = fromScope === "library" ? bag.library : bag.document;
        bag.global = {
            colors: new Set(src.colors),
            tags: new Set(src.tags),
            authors: new Set(src.authors),
            types: new Set(src.types),
            colorsExcl: new Set(this._wvBmChipExcl(src, "colors")),
            tagsExcl: new Set(this._wvBmChipExcl(src, "tags")),
            authorsExcl: new Set(this._wvBmChipExcl(src, "authors")),
            typesExcl: new Set(this._wvBmChipExcl(src, "types")),
        };
    }

    /** A chip state's EXCLUDE set for `dim` ("colors"/"types"/"tags"/
     *  "authors"), lazily created — state bags predating the exclude
     *  feature (or rebuilt from older code paths) get it on first use. */
    _wvBmChipExcl(st: any, dim: string): Set<string> {
        if (!(st[dim + "Excl"] instanceof Set)) st[dim + "Excl"] = new Set<string>();
        return st[dim + "Excl"];
    }

    /** Include/exclude toggle for a bookmark chip — same semantics as the
     *  items filter's `_toggleIncludeExclude`: plain click cycles the
     *  INCLUDE set, Alt+click cycles the EXCLUDE set; a key never sits in
     *  both at once. */
    _wvBmChipToggle(st: any, dim: string, key: string, alt: boolean) {
        const inc: Set<string> = st[dim];
        const exc = this._wvBmChipExcl(st, dim);
        if (alt) {
            if (exc.has(key)) exc.delete(key);
            else { exc.add(key); inc.delete(key); }
        } else {
            if (inc.has(key)) inc.delete(key);
            else { inc.add(key); exc.delete(key); }
        }
    }

    _wvReaderBmChipsActive(reader: any): boolean {
        const st = this._wvReaderBmChipState(reader);
        return (st.colors.size + st.tags.size + st.authors.size + st.types.size
            + this._wvBmChipExcl(st, "colors").size + this._wvBmChipExcl(st, "tags").size
            + this._wvBmChipExcl(st, "authors").size + this._wvBmChipExcl(st, "types").size) > 0;
    }

    /** Walk the bookmarks the chip filter should consider and collect
     *  facet → count. The walked set follows the same per-scope split
     *  the bookmark LIST already uses, so the chip bar matches what's
     *  visible:
     *    • not pinned + scope="document" → walk doc.local + doc.global
     *    • not pinned + scope="library"  → walk the library tree
     *    • pinned                         → walk all three (the chip set
     *                                       has to be the union so the
     *                                       pinned filter applies the
     *                                       same on either scope).
     *  Earlier this method always walked all three sources, which made
     *  the chip bar show library-only facets while the user was on the
     *  "This Document" tab. */
    _wvReaderBmChipFacets(reader: any) {
        const colors = new Map<string, number>();
        const tags = new Map<string, { color: string, count: number, position: number }>();
        const authors = new Map<string, number>();
        const types = new Map<string, number>();
        try {
            const att = this._wvReaderAtt(reader);
            const userLib = (Zotero as any).Libraries && (Zotero as any).Libraries.userLibraryID;
            // Walk doc bookmarks when scope includes the document, library
            // when scope includes the library; "both" walks all three.
            const scope = this._wvReaderBmScope();
            const includeDoc = scope === "document" || scope === "both";
            const includeLib = scope === "library" || scope === "both";
            const collect = (nodes: any[]) => {
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { collect(n.children); continue; }
                    if (n.type !== "item") continue;
                    let it: any = null;
                    try { it = Zotero.Items.getByLibraryAndKey(n.libraryID, n.itemKey); } catch (_) {}
                    if (!it) continue;
                    try {
                        if (it.isAnnotation && it.isAnnotation()) {
                            const c = String(it.annotationColor || "");
                            if (c) colors.set(c, (colors.get(c) || 0) + 1);
                            const tp = String(it.annotationType || "");
                            if (tp) types.set(tp, (types.get(tp) || 0) + 1);
                            const isPersonal = (typeof userLib === "number") && (it.libraryID === userLib);
                            if (!isPersonal) {
                                let name = String((it as any).annotationAuthorName || "").trim();
                                if (!name) {
                                    try {
                                        const uid = (it as any).createdByUserID;
                                        if (uid && (Zotero as any).Users && (Zotero as any).Users.getName) {
                                            name = String((Zotero as any).Users.getName(uid) || "").trim();
                                        }
                                    } catch (_) {}
                                }
                                if (name) authors.set(name, (authors.get(name) || 0) + 1);
                            }
                        }
                    } catch (_) {}
                    try {
                        for (const tag of (it.getTags() || [])) {
                            if (!tag || !tag.tag) continue;
                            let tc = "";
                            let tpos = Number.POSITIVE_INFINITY;   // non-coloured tags sort after coloured ones
                            try {
                                const ci: any = Zotero.Tags.getColor(it.libraryID, tag.tag);
                                if (ci && ci.color) tc = ci.color;
                                if (ci && Number.isFinite(ci.position)) tpos = ci.position;
                            } catch (_) {}
                            const cur = tags.get(tag.tag) || { color: tc, count: 0, position: tpos };
                            if (tc && !cur.color) cur.color = tc;
                            if (Number.isFinite(tpos) && !Number.isFinite(cur.position)) cur.position = tpos;
                            cur.count++;
                            tags.set(tag.tag, cur);
                        }
                    } catch (_) {}
                }
            };
            if (includeDoc && att) {
                const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
                if (doc) { collect(doc.local); collect(doc.global); }
            }
            if (includeLib) {
                const lib = (this._bmDoc && this._bmDoc.bookmarks) || [];
                collect(lib);
            }
        } catch (_) {}
        return { colors, tags, authors, types };
    }

    /** True iff this node (a bookmark leaf, never a folder) satisfies every
     *  active chip dimension. Folders never match themselves. INCLUDE sets
     *  are strict (a node that can't express the dimension is hidden);
     *  EXCLUDE sets (Alt+click) only remove matching nodes — everything
     *  else stays, including non-annotation bookmarks. */
    _wvBmNodeMatchesChips(node: any, st: any): boolean {
        if (!node || node.type === "folder") return false;
        const excColors = this._wvBmChipExcl(st, "colors");
        const excTypes = this._wvBmChipExcl(st, "types");
        const excAuthors = this._wvBmChipExcl(st, "authors");
        const excTags = this._wvBmChipExcl(st, "tags");
        const anyInclude = !!(st.colors.size || st.types.size || st.authors.size || st.tags.size);
        // Only item-bookmarks reference an underlying Zotero item; everything
        // else (positions, text, collection, library, treerow) can't satisfy
        // any INCLUDE dimension (strict mode → hidden), but has nothing an
        // EXCLUDE could match either → kept under exclude-only filtering.
        if (node.type !== "item") return !anyInclude;
        let it: any = null;
        try { it = Zotero.Items.getByLibraryAndKey(node.libraryID, node.itemKey); } catch (_) {}
        if (!it) return false;
        const isAnn = !!(it.isAnnotation && it.isAnnotation());
        if (st.colors.size) {
            if (!isAnn || !st.colors.has(String(it.annotationColor || ""))) return false;
        }
        if (excColors.size && isAnn && excColors.has(String(it.annotationColor || ""))) return false;
        if (st.types.size) {
            if (!isAnn || !st.types.has(String(it.annotationType || ""))) return false;
        }
        if (excTypes.size && isAnn && excTypes.has(String(it.annotationType || ""))) return false;
        if (st.authors.size || excAuthors.size) {
            let name = "";
            if (isAnn) {
                name = String((it as any).annotationAuthorName || "").trim();
                if (!name) {
                    try {
                        const uid = (it as any).createdByUserID;
                        if (uid && (Zotero as any).Users && (Zotero as any).Users.getName) {
                            name = String((Zotero as any).Users.getName(uid) || "").trim();
                        }
                    } catch (_) {}
                }
            }
            if (st.authors.size && (!isAnn || !st.authors.has(name))) return false;
            if (excAuthors.size && isAnn && excAuthors.has(name)) return false;
        }
        if (st.tags.size || excTags.size) {
            let have: Set<string>;
            try { have = new Set(((it.getTags() || []) as any[]).map((t: any) => t.tag)); } catch (_) { have = new Set(); }
            if (st.tags.size) {
                let ok = false;
                for (const t of st.tags) { if (have.has(t)) { ok = true; break; } }
                if (!ok) return false;
            }
            for (const t of excTags) { if (have.has(t)) return false; }
        }
        return true;
    }

    /** Combined visibility walker: handles search query + chip filter together,
     *  returning the same `{visible, dimmed}` shape the existing tree renderer
     *  consumes. Pass q="" to skip search; chipMatch=null to skip chips. */
    _wvBmFilterCombined(nodes: any[], q: string, chipMatch: ((n: any) => boolean) | null): { visible: Set<string>, dimmed: Set<string> } {
        const visible = new Set<string>();
        const dimmed = new Set<string>();
        const walk = (arr: any[]): boolean => {
            let anyMatch = false;
            for (const n of (arr || [])) {
                if (!n) continue;
                if (n.type === "folder") {
                    const childAny = walk(n.children || []);
                    const name = String(n.name || "").toLowerCase();
                    const folderSearchOK = !q || name.indexOf(q) >= 0;
                    if (childAny) {
                        visible.add(n.id);
                        // Folder never satisfies chip dimensions itself, so if
                        // chips are active OR search-only-and-name-misses, dim.
                        if (chipMatch || !folderSearchOK) dimmed.add(n.id);
                        anyMatch = true;
                    }
                } else {
                    const t = String(n.label || "").toLowerCase();
                    const searchOK = !q || t.indexOf(q) >= 0;
                    const chipsOK = chipMatch ? chipMatch(n) : true;
                    if (searchOK && chipsOK) { visible.add(n.id); anyMatch = true; }
                }
            }
            return anyMatch;
        };
        walk(nodes);
        return { visible, dimmed };
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
                // `<img>` with a BAKED-IN data: URI of Zotero's
                // filter.svg — same `context-fill` icon as the library
                // popup's funnel button, but ready at the first paint
                // (no chrome:// load, no waiting on the prefetch). Once
                // the prefetch lands the callback in
                // `_wvReaderPrefetchIcons` will overwrite the src with
                // the fetched copy; both URIs are byte-identical so the
                // user sees nothing change.
                const fimg = idoc.createElementNS(NS_HTML_RP, "img");
                fimg.className = "wv-filter-svg";
                fimg.setAttribute("src", RP_FUNNEL_DATA_URI);
                btn.appendChild(fimg);
                // Tiny ▾ chevron after the funnel — matches Zotero's
                // native UI convention (a chevron next to an icon
                // signals "opens a dropdown/popup") and the library
                // filter button's XUL `toolbarbutton-menu-dropmarker`.
                // Same 8×8 inline SVG the tabs-menu file-type button
                // uses (see tabs.ts).
                const chev = idoc.createElementNS(NS_HTML_RP, "span");
                chev.className = "wv-rf-chev";
                chev.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2.5h6L4 6z"/></svg>';
                btn.appendChild(chev);
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
                const { docs, wins, onDown, onKey, swallowLoneAlt } = this._wvReaderFilterDismiss;
                for (const d of (docs || [])) { try { d.removeEventListener("pointerdown", onDown, true); } catch (_) {} }
                for (const w of (wins || [])) {
                    try { w.removeEventListener("keydown", onKey, true); } catch (_) {}
                    if (swallowLoneAlt) {
                        try { w.removeEventListener("keydown", swallowLoneAlt, true); } catch (_) {}
                        try { w.removeEventListener("keyup", swallowLoneAlt, true); } catch (_) {}
                    }
                }
            } catch (_) {}
            this._wvReaderFilterDismiss = null;
        }
    }

    _wvOpenReaderFilterPopup(reader: any, idoc: any, anchorBtn: any) {
        try {
            this._wvEnsureReaderPanelStyles(idoc);
            // Remove any leftover popup before creating a fresh one — protects
            // against stale stylings (e.g. visibility:hidden) inherited from a
            // previous render lingering when a caller bypasses the toggle path.
            try { const old = idoc.getElementById(RP_FILTER_POPUP_ID); if (old) old.remove(); } catch (_) {}

            // Measure the sidebar BEFORE creating + appending the popup
            // so we can set the popup's final width inline ahead of the
            // first layout pass. Otherwise the popup is appended at the
            // CSS `max-width: 360px` default, lays out, THEN the width
            // assignment forces a reflow that re-wraps the chip rows —
            // visible to the user as a two-stage "popup grows taller"
            // rendering when the sidebar is narrower than 360px.
            let sbWidth = 0, sbLeft = -1;
            try {
                const sb = anchorBtn && anchorBtn.closest && anchorBtn.closest("#sidebarContainer");
                if (sb) {
                    const rect = sb.getBoundingClientRect();
                    sbWidth = rect.width;
                    sbLeft = rect.left;
                }
            } catch (_) {}

            const popup = idoc.createElementNS(NS_HTML_RP, "div");
            popup.id = RP_FILTER_POPUP_ID;
            if (sbWidth > 0) {
                popup.style.width = sbWidth + "px";
                popup.style.maxWidth = "none";
            }
            this._wvRenderReaderFilterPopup(reader, idoc, popup);
            (idoc.body || idoc.documentElement).appendChild(popup);

            // Position under the anchor button. When we know the sidebar's
            // bounds, left-align the popup with it; otherwise fall back to
            // the anchor's left edge. Always clamp to stay on-screen.
            const r = anchorBtn.getBoundingClientRect();
            const pw = sbWidth > 0 ? sbWidth : (popup.offsetWidth || 240);
            let left = sbLeft >= 0 ? sbLeft : r.left;
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
            // The reader iframe is its own docshell, so `.top` returns itself
            // (verified: `iframeWin === iframeWin.top`). The CHROME WINDOW
            // that hosts the reader iframe — and owns the menubar that Alt
            // activates — is reached via `_iframe.ownerDocument.defaultView`.
            // For a reader opened as a tab in the main window this is
            // zoteroPane.xhtml; for a stand-alone reader it's reader.xhtml.
            // Either way, attach there so swallowLoneAlt actually catches Alt.
            try {
                const hostWin = reader._iframe && reader._iframe.ownerDocument && reader._iframe.ownerDocument.defaultView;
                if (hostWin && wins.indexOf(hostWin) < 0) {
                    if (hostWin.document && docs.indexOf(hostWin.document) < 0) docs.push(hostWin.document);
                    wins.push(hostWin);
                }
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
            // Swallow lone-Alt while the popup is open. Same INTENT as the
            // library filter's swallowLoneAlt (filter.ts:4150-4165), but
            // attached to the WINDOWs that received the wins[] collection
            // (iframe + chrome host), not to the popup element. The library
            // works because a XUL <panel> auto-focuses on open, so subsequent
            // Alt keys land on a panel descendant and its capture listener
            // sees them. The reader popup is an HTML <div> with no auto-focus,
            // so focus stays in the reader (PDF view / toolbar / wherever)
            // and the popup never sees the Alt event. Window-level capture
            // catches it before Mozilla's menubar handler runs — regardless
            // of where focus is. Other modifiers (Shift / Ctrl / Meta) pass
            // through so Alt+click and accelerator combos still work.
            const swallowLoneAlt = (e: any) => {
                if (e.key !== "Alt") return;
                if (e.ctrlKey || e.shiftKey || e.metaKey) return;
                e.preventDefault();
                e.stopPropagation();
            };
            for (const w of wins) {
                try { w.addEventListener("keydown", swallowLoneAlt, true); } catch (_) {}
                try { w.addEventListener("keyup", swallowLoneAlt, true); } catch (_) {}
            }
            this._wvReaderFilterDismiss = { docs, wins, onDown, onKey, swallowLoneAlt };
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
        title.textContent = "Filter Annotations";
        head.appendChild(title);
        const clearState = () => {
            st.types = []; st.typesExcl = []; st.colorsExcl = []; st.tagsExcl = [];
            st.addedByExcl = []; st.modifiedBy = []; st.modifiedByExcl = [];
            st.hasComment = null; st.hasRelated = null; st.hasLink = null; st.hasTag = null;
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
        // Show Clear / Clear-and-Close only when at least one filter dimension
        // is set. Hidden via inline visibility (preserves layout); the chip-
        // toggle paths call `_wvRenderReaderFilterPopup` which re-runs this
        // check so the buttons appear/disappear in lockstep with state.
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
        // Sections in the reader filter popup are FLAT — no row-kind
        // grouping. The library filter popup groups its rows by row
        // kind (Cross-level / Parent / Attachment / Annotation) with
        // dashed-divider headers — useful there because items live at
        // multiple row kinds and the grouping tells the user which
        // level each filter targets. The reader filters annotations
        // only (no hierarchy), so the same grouping has nothing to
        // organise. This asymmetry between the two popups is intentional;
        // see filter.ts `addGroupHeader` for the library-side rationale.
        const addRow = (build: (opts: any) => void, groupBg?: boolean, label?: string, extraClass?: string) => {
            const sec = mk("div", "wv-filter-section" + (groupBg ? " wv-filter-or-group" : "")
                + (extraClass ? " " + extraClass : ""));
            // Optional visible label — used to separate the otherwise-identical
            // Added By / Modified By person rows.
            if (label) { const lb = mk("span", "wv-rf-grouplabel"); lb.textContent = label; sec.appendChild(lb); }
            const opts = mk("div", "wv-filter-options");
            build(opts);
            if (opts.childNodes.length) { sec.appendChild(opts); stack.appendChild(sec); }
        };
        // A small heading on its OWN line (full-width chips below it) — used to
        // label the Added By / Modified By rows without eating chip width.
        // This is NOT a row-kind group divider (the reader has none — see
        // `addRow` comment above); it's purely a semantic disambiguator for
        // two otherwise-identical rows of person-name chips.
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
                    (b: any) => { b.appendChild((this as any)._wvNativeColorSwatch(idoc, def.value)); },
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

        // ---- Cross-level: Has Tag → Has Related → Has Link (mirrors the
        //      library filter's order AND icon colors: orange tag, wood
        //      related, red link). Single-level here → no per-kind scope arrow.
        addRow((opts: any) => {
            opts.appendChild(mkTriTile(st.hasTag,
                "Has Tag — annotations with at least one tag. Alt+click to exclude.",
                // Use Zotero's `tag.svg` (same source as the library
                // popup's Has Tag icon) so both popups render visually
                // identical artwork at the same 16×16 size. The earlier
                // inline custom SVG drew a similar shape but with thinner
                // strokes that read as a smaller icon next to the library
                // version.
                () => {
                    const img: any = mk("img");
                    img.className = "wv-filter-svg";
                    // Only set `src` when the prefetch cache has the
                    // data: URI. Falling back to the chrome:// URL
                    // would paint a broken-image placeholder inside
                    // the content iframe (same reason the funnel
                    // button doesn't fall back either — see
                    // `_wvReaderEnsureFilterButton`). The prefetch
                    // is seeded with RP_TAG_ICON so by the time the
                    // user clicks the funnel to open this popup the
                    // cache is essentially always populated.
                    const u = this._wvReaderIconUri(RP_TAG_ICON);
                    if (u) img.setAttribute("src", u);
                    img.style.color = "var(--accent-orange)";
                    return img;
                },
                (alt: boolean) => { st.hasTag = alt ? (st.hasTag === false ? null : false) : (st.hasTag === true ? null : true); }));
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
        //      All tags share a single .wv-filter-or-group row so they read as
        //      one logical "tags" group. Three-bucket order: coloured FIRST,
        //      then plain "normal" tags (start with a letter/digit — bubble
        //      bursting, Fluid mechanics, …), then "special" tags (underscore,
        //      hashtag, slash-leading and other punctuation-prefixed
        //      conventions — _Tag1, #Category, etc.), so the eye walks from
        //      colours → familiar words → bookkeeping prefixes. Alphabetical
        //      within each bucket.
        if (tagsPresent.size) {
            const tagsAll = Array.from(tagsPresent);
            const isNormal = (t: string) => /^[\p{L}\p{N}]/u.test(t);
            const tagsColored = tagsAll.filter(t => !!tagColors[t]).sort((a, b) => a.localeCompare(b));
            const tagsNormal  = tagsAll.filter(t => !tagColors[t] &&  isNormal(t)).sort((a, b) => a.localeCompare(b));
            const tagsSpecial = tagsAll.filter(t => !tagColors[t] && !isNormal(t)).sort((a, b) => a.localeCompare(b));
            const tagsSorted = [...tagsColored, ...tagsNormal, ...tagsSpecial];
            addRow((opts: any) => {
                for (const tg of tagsSorted) {
                    const col = tagColors[tg];
                    opts.appendChild(mkNativeOpt("tags", nat.tags, st.tagsExcl, tg,
                        "Tag: " + tg + " — Alt+click to exclude",
                        (b: any) => {
                            if (col) { b.classList.add("wv-filter-tag-colored"); b.style.setProperty("--wv-tag-color", col); }
                            const sp = mk("span"); sp.textContent = tg; b.appendChild(sp);
                        },
                        actTags));
                }
            }, true, undefined, "wv-rf-tags-row");
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
        hint.textContent = "Alt+Click to Exclude";
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
        // Has Comment sits in the same row as a `.wv-filter-or-inline`
        // group that's taller because of its 3 px×2 padding. The flex
        // container defaults to `align-items: stretch`, but this
        // button's explicit `height: 28 px` wins → button hugs the top
        // of the row, 3 px above the icons inside the group's
        // background. `align-self: center` lines it up with the type
        // icons. Same fix as the library popup (filter.ts).
        btn.style.alignSelf = "center";
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
            if (st.hasTag !== null) {
                let hasT = false;
                try { hasT = !!(a.getTags && a.getTags().length); } catch (_) {}
                if (st.hasTag === true && !hasT) return false;
                if (st.hasTag === false && hasT) return false;
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
        // Library-popup context (no reader): chrome://resource:// load directly
        // since the popup runs in the privileged main-window doc. The data-URI
        // inlining dance is only needed for the reader's content iframe.
        if (!reader) return src;
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

    /** Re-evaluate the Bookmarks tab in every open reader whose
     *  attachment matches `(libraryID, itemKey)`. Used after bookmark
     *  add / remove so the auto-hide gate flips the tab in or out live
     *  (the gate itself is in `_wvReaderEnsureBookmarksTab`). No-op
     *  when `libraryID`/`itemKey` are missing — call without args to
     *  refresh every reader. */
    _wvReaderRefreshBookmarksTabAll(libraryID?: number, itemKey?: string) {
        try {
            for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const iwin = r._iframeWindow
                        || (r._iframe && r._iframe.contentWindow);
                    const idoc = iwin && iwin.document;
                    if (!idoc) continue;
                    if (libraryID != null && itemKey) {
                        const att = this._wvReaderAtt(r);
                        if (!att) continue;
                        if (att.libraryID !== libraryID || att.itemKey !== itemKey) continue;
                    }
                    this._wvReaderEnsureBookmarksTab(r, idoc);
                } catch (_) {}
            }
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderRefreshBookmarksTabAll err: " + e);
        }
    }

    /** Strip the Bookmarks tab + view from this reader's sidebar. Called
     *  when the user disables the reader bookmarks pref live, so the tab
     *  disappears across every open reader without a restart. */
    _wvRemoveReaderBookmarksTab(reader: any, idoc: any) {
        try {
            if (!idoc) return;
            // Deactivate first so the native sidebar comes back if the
            // user had the Bookmarks pane open (the deactivate path
            // clears `RP_BM_TAB_ON` and restores the prior sidebarView).
            try { this._wvReaderSetBmActive(reader, idoc, false); } catch (_) {}
            const tab = idoc.querySelector("." + RP_BM_TAB_CLASS);
            if (tab && tab.parentNode) tab.parentNode.removeChild(tab);
            const view = idoc.querySelector("." + RP_BM_VIEW_CLASS);
            if (view && view.parentNode) view.parentNode.removeChild(view);
            const sc = idoc.getElementById("sidebarContainer");
            if (sc) sc.classList.remove(RP_BM_TAB_ON);
        } catch (e) {
            Zotero.debug("[Weavero] _wvRemoveReaderBookmarksTab err: " + e);
        }
    }

    /** Inject the Bookmarks tab (beside Outline) and its view panel. */
    _wvReaderEnsureBookmarksTab(reader: any, idoc: any) {
        try {
            // Gate on the Bookmarks master + reader sub-toggle. If the
            // user disables either, strip any tab that's already in the
            // DOM and bail before rebuilding.
            if (!this._getEnableReaderBookmarks()) {
                try { this._wvRemoveReaderBookmarksTab(reader, idoc); } catch (e) {}
                return;
            }
            // Auto-hide-when-empty (opt-in). When the user has the
            // toggle on and this attachment has zero bookmarks across
            // both sections, strip the tab. Adding the first bookmark
            // re-fires this via `_wvReaderRefreshBookmarksTabAll`, so
            // the tab pops back into existence the moment there's
            // something to show. The Bookmarks pane stays unaffected
            // for attachments that DO have bookmarks.
            //
            // Gate on `this._bmDoc` being loaded — `_bmInit` is async,
            // and on Zotero restart the reader's mutation observer
            // fires this method BEFORE the bookmarks.json file read
            // resolves. At that moment `_bmReaderList` returns []
            // (empty in-memory store), which would falsely trip
            // auto-hide → `_wvRemoveReaderBookmarksTab` →
            // `_wvReaderSetBmActive(false)` → **wipes the persisted
            // tab-active state from the pref**. The post-init
            // re-render (kicked off at the bottom of `_bmInit`) walks
            // every open reader and re-evaluates auto-hide once the
            // store IS loaded, so the gate doesn't suppress the
            // feature — it just races safely.
            if (this._getAutoHideEmptyReaderBookmarks() && this._bmDoc) {
                try {
                    const att = this._wvReaderAtt(reader);
                    if (att && att.libraryID != null && att.itemKey) {
                        const list = this._bmReaderList(att.libraryID, att.itemKey);
                        if (!list || !list.length) {
                            this._wvRemoveReaderBookmarksTab(reader, idoc);
                            return;
                        }
                    }
                } catch (_) {}
            }
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
                tab.innerHTML = RP_BM_RIBBON_TAB;
                tab.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvReaderSetBmActive(reader, idoc, true);
                });
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) onto the tab to bookmark it (activates the tab).
                // A drag that originated FROM inside the bookmarks list
                // (`_wvBmRowDrag` for doc rows or `_wvLibRowDrag` for lib
                // rows) is NOT accepted here — the row already belongs to
                // bookmarks, so dropping it on the tab icon would be a
                // no-op semantically; refusing makes the cursor show the
                // standard no-drop state.
                tab.addEventListener("dragover", (e: any) => {
                    if (this._wvBmRowDrag || this._wvLibRowDrag) return;
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) { e.preventDefault(); tab.classList.add("wv-bm-dropok"); }
                });
                tab.addEventListener("dragleave", () => tab.classList.remove("wv-bm-dropok"));
                tab.addEventListener("drop", (e: any) => {
                    tab.classList.remove("wv-bm-dropok");
                    if (this._wvBmRowDrag || this._wvLibRowDrag) return;
                    if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                    if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                    e.preventDefault();
                    const payload = this._wvReaderReadDropPayload(e);
                    this._wvReaderSetBmActive(reader, idoc, true);
                    if (this._wvReaderBmScope() === "library") { this._wvReaderLibAcceptDrop(reader, idoc, payload, null); return; }
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
                        // Dismiss the hover card on right-click so it doesn't
                        // linger over the context menu — re-hover re-shows it,
                        // matching normal browser hover behavior. Also cancel
                        // any pending show-delay timer so the card doesn't pop
                        // in after the context menu opens.
                        try { const w: any = idoc.defaultView; if (this._wvBmHoverTimer && w) { w.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
                        this._wvReaderHideBmHoverCard(idoc);
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
                // Single header row: scope toggle on the left, + on the right
                // (the standalone "Bookmarks" title row was dropped to save
                // vertical space; the tab already labels the panel).
                const scopeBar = idoc.createElementNS(NS_HTML_RP, "div");
                scopeBar.className = "wv-bm-scope-toggle";
                const scopeGroup = idoc.createElementNS(NS_HTML_RP, "div");
                scopeGroup.className = "wv-bm-scope-group";
                // Set the active class at creation time using the persisted
                // pref. (A post-build idoc.querySelectorAll wouldn't see the
                // buttons yet — `view` isn't appended to `content` until later
                // in this block, so the buttons aren't reachable via idoc.)
                const initialScope = this._wvReaderBmScope();
                const mkScope = (lbl: string, scope: string) => {
                    const b = idoc.createElementNS(NS_HTML_RP, "button");
                    const isActive = (initialScope === "both") || (scope === initialScope);
                    b.className = "wv-bm-scope-btn" + (isActive ? " wv-bm-scope-active" : "");
                    b.setAttribute("data-scope", scope);
                    b.setAttribute("title", "Click: switch scope. Ctrl-click: merge both scopes (show together).");
                    b.textContent = lbl;
                    b.addEventListener("click", (e: any) => {
                        // Prevent the click from bubbling up to Zotero's
                        // sidebar tab handlers — without this, clicking
                        // the scope toggle can flip the active sidebar
                        // tab away from "Bookmarks" (the click event
                        // travels up past our panel and lands on a tab
                        // strip listener that interprets it as a tab
                        // selection).
                        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                        const ctrl = !!(e && (e.ctrlKey || e.metaKey));
                        const cur = this._wvReaderBmScope();
                        let next: string;
                        if (ctrl) {
                            // Ctrl-click merges/un-merges: toggle THIS button's
                            // inclusion in the current selection.
                            if (cur === "both") {
                                // Both selected → de-select the clicked one
                                // → leaves the OTHER as the single scope.
                                next = scope === "library" ? "document" : "library";
                            } else if (cur === scope) {
                                // Clicked the already-single-active button →
                                // refuse: can't end up with nothing selected.
                                return;
                            } else {
                                // Single scope + Ctrl-click on the OTHER button
                                // → merge both.
                                next = "both";
                            }
                        } else {
                            // Plain click: switch to that single scope.
                            next = scope;
                        }
                        // Entering "both" → seed the shared (global) chip
                        // slot from the previously-active scope so any
                        // existing filter context carries across into the
                        // merged view.
                        if (next === "both" && cur !== "both") {
                            try { this._wvReaderBmChipsSeedGlobal(reader, cur); } catch (_) {}
                        }
                        this._wvReaderSetBmScope(next);
                        this._wvReaderUpdateScopeToggle(idoc);
                        this._wvReaderRenderBmList(reader, idoc);
                        // Chip selections follow the scope: each single
                        // scope keeps its own filter, "both" uses the
                        // shared filter. Refresh the bar to reflect.
                        try { this._wvReaderRenderBmChipBar(reader, idoc); } catch (_) {}
                    });
                    // Cross-scope drop target — drop a doc-row on the
                    // "Library" button to copy/move it into the library
                    // store, drop a lib-row on "This Document" for the
                    // reverse. No modifier = copy, Shift = move (Mac:
                    // metaKey). Matches Zotero's collectionTree convention.
                    this._wvWireScopeBtnDrop(b, scope, reader, idoc);
                    scopeGroup.appendChild(b);
                };
                mkScope("Document", "document");
                if (this._getShowLibraryBookmarksInReader()) {
                    mkScope("Library", "library");
                } else {
                    // Pref hid the Library tab — if the user was last on
                    // it (or in merged "both" state), fall back to the
                    // doc scope so the panel stays usable.
                    const cur = this._wvReaderBmScope();
                    if (cur === "library" || cur === "both") {
                        try { this._wvReaderSetBmScope("document"); } catch (_) {}
                    }
                }
                // The +/search/scope buttons live above the bookmark list,
                // so the cursor passes over them during any drag up to the
                // top of the panel. Dropping a bookmark-row drag on them
                // is meaningless (the row already belongs to the bookmark
                // store) — refuse via stopPropagation so the event doesn't
                // bubble up to the ancestor section drop handler (which
                // would otherwise reorder the source row to section end).
                // Also sweep any lingering drop indicators from rows the
                // cursor passed through, so the first row's "before" bar
                // doesn't keep painting under the section header.
                const blockBmRowDrag = (el: any) => {
                    const sweep = () => {
                        try {
                            const stale = idoc.querySelectorAll(
                                ".wv-bm-drop-before,.wv-bm-drop-after,.wv-bm-drop-into");
                            for (let i = 0; i < stale.length; i++) {
                                stale[i].classList.remove("wv-bm-drop-before",
                                    "wv-bm-drop-after", "wv-bm-drop-into");
                            }
                        } catch (_) {}
                    };
                    el.addEventListener("dragover", (e: any) => {
                        if (!this._wvBmRowDrag && !this._wvLibRowDrag) return;
                        e.stopPropagation();   // no preventDefault → OS shows no-drop cursor
                        sweep();
                    });
                    el.addEventListener("drop", (e: any) => {
                        if (!this._wvBmRowDrag && !this._wvLibRowDrag) return;
                        e.stopPropagation();
                    });
                };

                // Top-level + button removed: the destination was
                // ambiguous when both scopes are merged. Per-section
                // "+" buttons (Elsewhere / Library headers) replaced
                // it — each one knows exactly where its bookmark lands.
                // Magnifier toggles a search input that filters bookmark
                // labels (folders with matching descendants stay open). Same
                // affordance as the reader's Annotations tab.
                const searchBtn = idoc.createElementNS(NS_HTML_RP, "button");
                searchBtn.className = "wv-bm-search-btn";
                blockBmRowDrag(searchBtn);
                searchBtn.setAttribute("title", "Search bookmarks");
                // Use Zotero's 16-px `magnifier.svg` path (byte-
                // identical to chrome://zotero/skin/16/universal/
                // magnifier.svg) so the search affordance is visually
                // consistent with the library's main quick-search
                // magnifier + the bookmark popup search icon.
                // `fill="currentColor"` for inline SVG so the icon
                // inherits the button's text color.
                searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M11 6C11 8.76142 8.76142 11 6 11C3.23858 11 1 8.76142 1 6C1 3.23858 3.23858 1 6 1C8.76142 1 11 3.23858 11 6ZM9.87438 10.5816C8.82905 11.4664 7.47683 12 6 12C2.68629 12 0 9.31371 0 6C0 2.68629 2.68629 0 6 0C9.31371 0 12 2.68629 12 6C12 7.47687 11.4664 8.82911 10.5815 9.87446L16 15.2929L15.2929 16L9.87438 10.5816Z"/></svg>';
                const searchRow = idoc.createElementNS(NS_HTML_RP, "div");
                searchRow.className = "wv-bm-search-row";
                searchRow.style.display = "none";
                const searchInput = idoc.createElementNS(NS_HTML_RP, "input") as any;
                searchInput.className = "wv-bm-search-input";
                // type="text" (not "search") so the reader's keyboard-manager
                // `isTextBox` gate skips letter shortcuts (r = Read Aloud, h =
                // hand tool, …) while typing in this field. Matches the reader
                // Annotations tab's search box, which uses type="text" too.
                searchInput.setAttribute("type", "text");
                searchInput.setAttribute("placeholder", "Search bookmarks…");
                searchInput.addEventListener("input", () => this._wvReaderRenderBmList(reader, idoc));
                searchInput.addEventListener("keydown", (ev: any) => {
                    if (ev.key === "Escape") {
                        searchInput.value = ""; searchRow.style.display = "none";
                        searchBtn.classList.remove("wv-bm-search-active");
                        this._wvReaderRenderBmList(reader, idoc);
                    }
                });
                // Click outside while the input is empty → auto-close the
                // search (mirrors the reader's annotation search box behavior).
                searchInput.addEventListener("blur", () => {
                    if (!String(searchInput.value || "").trim()) {
                        searchRow.style.display = "none";
                        searchBtn.classList.remove("wv-bm-search-active");
                    }
                });
                searchRow.appendChild(searchInput);
                searchBtn.addEventListener("click", () => {
                    const showing = searchRow.style.display !== "none";
                    if (showing) {
                        searchInput.value = ""; searchRow.style.display = "none";
                        searchBtn.classList.remove("wv-bm-search-active");
                    } else {
                        searchRow.style.display = "flex";
                        searchBtn.classList.add("wv-bm-search-active");
                        try { searchInput.focus(); } catch (_) {}
                    }
                    this._wvReaderRenderBmList(reader, idoc);
                });
                // Filter-funnel button — opens a popover that holds the
                // chip-bar (annotation color / type / author / tag chips,
                // plus the global-pin toggle). Previously the chip rows
                // lived in a docked panel at the bottom of the pane; the
                // popover keeps the same chips and behaviour, just anchored
                // to the funnel here instead of taking permanent vertical
                // space below the list.
                const filterBtn = idoc.createElementNS(NS_HTML_RP, "button");
                filterBtn.className = "wv-bm-filter-btn";
                blockBmRowDrag(filterBtn);
                filterBtn.setAttribute("title", "Filter bookmarks");
                // Use the same funnel path Weavero's reader-filter
                // button uses (the funnel above the reader in the
                // annotations toolbar), amber stem included. 16
                // viewBox, `currentColor` outline, rendered at 20×20
                // to match the toolbar.
                filterBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="none">'
                    + '<clipPath id="wv-bm-stem"><rect x="0" y="7" width="16" height="9"/></clipPath>'
                    + '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="' + WV_FUNNEL_PATH + '"/>'
                    + '<path clip-path="url(#wv-bm-stem)" fill="' + WV_FUNNEL_STEM_COLOR + '" fill-rule="evenodd" clip-rule="evenodd" d="' + WV_FUNNEL_PATH + '"/>'
                    + '</svg>';
                // Tiny ▾ chevron — same affordance as the reader
                // toolbar funnel (popup 2) signalling "opens a popup".
                const chev = idoc.createElementNS(NS_HTML_RP, "span");
                chev.className = "wv-bm-filter-chev";
                chev.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2.5h6L4 6z"/></svg>';
                filterBtn.appendChild(chev);
                filterBtn.addEventListener("click", (e: any) => {
                    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                    this._wvReaderToggleBmChipPopup(reader, idoc, filterBtn);
                });
                // Only show the scope group when there's a real choice
                // to make. With `showLibraryBookmarksInReader` off, the
                // group would render as a single highlighted "Reader"
                // pill — visually a redundant header. Hide it; the
                // section headings ("This Document", "Elsewhere") still
                // tell the user what they're looking at.
                if (this._getShowLibraryBookmarksInReader()) {
                    scopeBar.appendChild(scopeGroup);
                }
                // Action buttons (Add / Search / Filter) live in the
                // reader sidebar's TOP toolbar — Zotero's `.sidebar-toolbar`
                // already has a right-aligned `.end` slot that sits beside
                // the tab icons (thumbnails / annotations / outline /
                // bookmarks). Injecting our buttons there integrates them
                // into the reader's chrome instead of taking another row
                // inside the bookmark pane. Visibility is gated by the
                // `RP_BM_TAB_ON` class the bookmarks-tab activation already
                // toggles on `#sidebarContainer` (see CSS below).
                const sidebarEnd = idoc.querySelector(
                    "#sidebarContainer .sidebar-toolbar .end");
                let actionHost: any = null;
                if (sidebarEnd) {
                    // Clear any stale host from a prior plugin load so
                    // hot-reload doesn't stack duplicate buttons.
                    const stale = sidebarEnd.querySelector(".wv-bm-sidebar-actions");
                    if (stale) try { stale.remove(); } catch (_) {}
                    actionHost = idoc.createElementNS(NS_HTML_RP, "div");
                    actionHost.className = "wv-bm-sidebar-actions";
                    actionHost.appendChild(searchBtn);
                    actionHost.appendChild(filterBtn);
                    sidebarEnd.appendChild(actionHost);
                } else {
                    // Toolbar isn't there for some reason (alternative
                    // theme? upstream change?) — fall back to a row at
                    // the top of the pane so the buttons remain usable.
                    const actionBar = idoc.createElementNS(NS_HTML_RP, "div");
                    actionBar.className = "wv-bm-actionbar";
                    actionBar.appendChild(searchBtn);
                    actionBar.appendChild(filterBtn);
                    view.appendChild(actionBar);
                }
                const list = idoc.createElementNS(NS_HTML_RP, "div");
                list.className = "wv-bm-reader-list";
                view.appendChild(scopeBar);
                view.appendChild(searchRow);
                view.appendChild(list);
                // Drop an annotation/selection (from the sidebar OR the center
                // pane) anywhere on the bookmarks pane to bookmark it.
                view.addEventListener("dragover", (e: any) => {
                    if (this._wvLibRowDrag) { e.preventDefault(); return; }   // library row → empty area accepts (root end)
                    if (this._wvReaderDragHasBookmarkable(e.dataTransfer)) e.preventDefault();
                    // Over the pane but off any row → outside every folder; collapse springs.
                    try { if (!(e.target && e.target.closest && e.target.closest(".wv-bm-reader-row"))) this._wvSpringRecollapseLeft(reader, idoc, this._wvReaderAtt(reader), null); } catch (_) {}
                });
                view.addEventListener("dragleave", (e: any) => {
                    // Cursor left the bookmarks pane entirely → collapse all spring folders.
                    try { if (!view.contains(e.relatedTarget)) { const a = this._wvReaderAtt(reader); if (a) this._wvRecollapseAllSprings(reader, idoc, a); } } catch (_) {}
                });
                view.addEventListener("drop", (e: any) => {
                    if (this._wvLibRowDrag) {   // library row dropped on empty area → move to root end
                        e.preventDefault(); e.stopPropagation();
                        const d = this._wvLibRowDrag; this._wvLibRowDrag = null; this._wvCancelLibSpring();
                        this._bmMove(d, null, "after").then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} });
                        return;
                    }
                    // Library scope: an annotation/selection dropped on empty area
                    // → add a library item bookmark (at the root end).
                    if (this._wvReaderBmScope() === "library") {
                        if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
                        if (e._wvBmDropHandled) return; e._wvBmDropHandled = true;
                        e.preventDefault();
                        this._wvReaderLibAcceptDrop(reader, idoc, this._wvReaderReadDropPayload(e), null);
                        return;
                    }
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
            // Scope rendering:
            //   "library" → library bookmarks only
            //   "document" → this document + elsewhere (default)
            //   "both" → all three sections (Library + This Document +
            //             Elsewhere), reached via Ctrl-click on the
            //             other scope button.
            const _scope = this._wvReaderBmScope();
            if (_scope === "library") {
                this._wvReaderHideBmHoverCard(idoc);
                while (list.firstChild) list.firstChild.remove();
                this._wvReaderRenderLibraryInto(reader, idoc, list);
                try { this._wvReaderRenderBmChipBar(reader, idoc); } catch (_) {}
                return;
            }
            const includeLibrary = _scope === "both";
            // Refresh each bookmark's original (source) name from the live data
            // before rendering, so default names track edits and the stored
            // originalLabel stays current (even for renamed bookmarks).
            this._bmReaderSyncLabels(att.libraryID, att.itemKey);
            this._wvReaderHideBmHoverCard(idoc);   // rows are about to be rebuilt
            const NS = NS_HTML_RP;
            while (list.firstChild) list.firstChild.remove();
            const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
            // Pre-load data for item bookmarks whose item isn't loaded; once
            // loaded, re-render so the real icons / titles paint.
            this._wvBmEnsureItemsLoaded([doc.local, doc.global], () => {
                try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
            });
            // Empty sections are no longer collapsed to one placeholder:
            // addSection() below always renders the "This Document" / "Elsewhere"
            // headers (with their "+" buttons) plus a short how-to hint, so the
            // panel stays discoverable and addable even with zero bookmarks.
            const q = this._wvReaderBmQuery(idoc);
            const chipsOn = this._wvReaderBmChipsActive(reader);
            const chipSt = this._wvReaderBmChipState(reader);
            const chipMatch = chipsOn ? (n: any) => this._wvBmNodeMatchesChips(n, chipSt) : null;
            const useFilter = q || chipsOn;
            const fLocal = useFilter ? this._wvBmFilterCombined(doc.local, q, chipMatch) : null;
            const fGlobal = useFilter ? this._wvBmFilterCombined(doc.global, q, chipMatch) : null;
            const addSection = (heading: string, nodes: any[], section: "local" | "global", f: { visible: Set<string>, dimmed: Set<string> } | null) => {
                if (f && !f.visible.size) return;   // under search/chips with no matches → hide
                const gc = idoc.createElementNS(NS, "div");
                gc.className = "wv-bm-reader-group " + (section === "local" ? "wv-bm-grp-local" : "wv-bm-grp-global");
                const h = idoc.createElementNS(NS, "div");
                h.className = "wv-bm-reader-grouphead";
                const htitle = idoc.createElementNS(NS, "span");
                htitle.className = "wv-bm-gh-title";
                htitle.textContent = heading;
                h.appendChild(htitle);
                // Per-section "+" buttons. "Elsewhere" opens the
                // add-menu (Pick item / Add Link). "This Document"
                // skips the menu and goes straight to the item picker
                // — Add Link doesn't apply here (URLs auto-route to
                // Elsewhere) so a 2-item menu with one option is just
                // an extra click. The picker pre-selects the current
                // attachment and expands its annotations so the user
                // lands in the right place by default.
                const add = idoc.createElementNS(NS, "button");
                add.className = "wv-bm-reader-newfolder";
                add.setAttribute("title", section === "local"
                    ? "Pick an annotation or item to bookmark"
                    : "Add bookmark");
                add.innerHTML = RP_PLUS_SVG;
                add.addEventListener("click", (e: any) => {
                    e.stopPropagation();
                    if (section === "local") {
                        this._wvReaderAddViaDialog(reader, idoc, section);
                    } else {
                        this._wvShowReaderBmAddMenu(reader, idoc, add, "document", section);
                    }
                });
                h.appendChild(add);
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
                h.appendChild(nf);
                gc.appendChild(h);
                if (!nodes.length) {
                    // Empty section (only reached with no active search — the
                    // search/chip no-match case returns above). Keep the header +
                    // "+" for discoverability; show a short how-to hint, not a tree.
                    const hint = idoc.createElementNS(NS, "div");
                    hint.className = "wv-bm-reader-empty-section";
                    hint.textContent = section === "local"
                        ? "Right-click in the page, or drag an annotation here."
                        : "Use + to bookmark an item, collection, or link.";
                    gc.appendChild(hint);
                } else {
                    const treeWrap = idoc.createElementNS(NS, "div");
                    treeWrap.className = "wv-bm-reader-tree";
                    this._wvReaderRenderTree(reader, idoc, att, treeWrap, nodes, section, 0, f ? f.visible : undefined, f ? f.dimmed : undefined);
                    gc.appendChild(treeWrap);
                }
                this._wvReaderWireGroupDrop(reader, idoc, gc, section === "local");
                list.appendChild(gc);
            };
            // Merged scope ("both"): reader bookmarks first (This Document
            // → Elsewhere), then Library at the bottom. Reader is more
            // contextually relevant when you're reading a document, so
            // it appears above the global library list. Library tree is
            // rendered via `_wvReaderRenderLibraryTree` and wrapped with
            // a section heading so the three blocks read symmetrically.
            addSection("This Document", doc.local, "local", fLocal);
            addSection("Elsewhere", doc.global, "global", fGlobal);
            if (includeLibrary
                    && this._getShowLibraryBookmarksInReader()
                    && this._bmDoc
                    && Array.isArray(this._bmDoc.bookmarks)
                    && this._bmDoc.bookmarks.length) {
                const libNodes = this._bmDoc.bookmarks;
                const fLib = useFilter ? this._wvBmFilterCombined(libNodes, q, chipMatch) : null;
                if (!fLib || fLib.visible.size) {
                    const gc = idoc.createElementNS(NS, "div");
                    gc.className = "wv-bm-reader-group wv-bm-grp-library";
                    const h = idoc.createElementNS(NS, "div");
                    h.className = "wv-bm-reader-grouphead";
                    const htitle = idoc.createElementNS(NS, "span");
                    htitle.className = "wv-bm-gh-title";
                    htitle.textContent = "Global";
                    h.appendChild(htitle);
                    const addLib = idoc.createElementNS(NS, "button");
                    addLib.className = "wv-bm-reader-newfolder";
                    addLib.setAttribute("title", "Add bookmark to Library");
                    addLib.innerHTML = RP_PLUS_SVG;
                    addLib.addEventListener("click", (e: any) => {
                        e.stopPropagation();
                        this._wvShowReaderBmAddMenu(reader, idoc, addLib, "library");
                    });
                    h.appendChild(addLib);
                    const nfLib = idoc.createElementNS(NS, "button");
                    nfLib.className = "wv-bm-reader-newfolder";
                    nfLib.setAttribute("title", "New folder in Library");
                    nfLib.innerHTML = RP_FOLDER_PLUS_SVG;
                    nfLib.addEventListener("click", (e: any) => {
                        e.stopPropagation();
                        const name = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                        if (name) this._bmAddFolder(name)
                            .then(() => this._wvReaderRenderBmList(reader, idoc));
                    });
                    h.appendChild(nfLib);
                    gc.appendChild(h);
                    const treeWrap = idoc.createElementNS(NS, "div");
                    treeWrap.className = "wv-bm-reader-tree";
                    this._wvReaderRenderLibraryTree(reader, idoc, treeWrap, libNodes, 0,
                        fLib ? fLib.visible : undefined, fLib ? fLib.dimmed : undefined);
                    gc.appendChild(treeWrap);
                    list.appendChild(gc);
                }
            }
            if (useFilter && (!fLocal || !fLocal.visible.size) && (!fGlobal || !fGlobal.visible.size)) {
                const empty = idoc.createElementNS(NS, "div");
                empty.className = "wv-bm-reader-empty";
                empty.textContent = q ? ("No bookmarks match \"" + q + "\".") : "No bookmarks match the current filter.";
                list.appendChild(empty);
            }
            try { this._wvReaderRenderBmChipBar(reader, idoc); } catch (_) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderRenderBmList err: " + e);
        }
    }

    /** Render one tree level (folders + bookmarks) into a container; folders
     *  recurse when expanded. `depth` drives indentation. When `visible` is
     *  provided (search active), skip nodes not in the set and force-expand
     *  folders that contain matches. */
    _wvReaderRenderTree(reader: any, idoc: any, att: any, container: any, nodes: any[], section: "local" | "global", depth: number, visible?: Set<string>, dimmed?: Set<string>) {
        for (const node of nodes) {
            if (visible && !visible.has(node.id)) continue;
            if (node.type === "folder") {
                const row = this._wvReaderFolderRow(reader, idoc, att, node, section, depth);
                if (dimmed && dimmed.has(node.id)) row.classList.add("wv-bm-dimmed");
                container.appendChild(row);
                const expanded = visible ? true : node.expanded;
                if (expanded) {
                    this._wvReaderRenderTree(reader, idoc, att, container, node.children || [], section, depth + 1, visible, dimmed);
                }
            } else {
                container.appendChild(this._wvReaderBmRow(reader, idoc, att, node, section, depth));
            }
        }
    }

    // ---- Library-scope bookmarks in the reader tab -----------------------
    // The reader Bookmarks tab can show EITHER this document's bookmarks or
    // the global "library" bookmarks (the collections-pane store, _bmDoc).
    // The scope is a persisted pref toggled in the tab header.

    /** Current reader-tab bookmark scope: "document" (default) or "library". */
    _wvReaderBmScope(): string {
        try {
            const v = Zotero.Prefs.get("weavero.readerBmScope");
            if (v === "library" || v === "both") return v;
            return "document";
        }
        catch (_) { return "document"; }
    }
    _wvReaderSetBmScope(scope: string) {
        try {
            const norm = (scope === "library" || scope === "both") ? scope : "document";
            Zotero.Prefs.set("weavero.readerBmScope", norm);
        } catch (_) {}
    }
    /** Reflect the current scope on the header toggle buttons. "both"
     *  highlights BOTH buttons so the merged state is visually obvious. */
    _wvReaderUpdateScopeToggle(idoc: any) {
        try {
            const scope = this._wvReaderBmScope();
            const btns = idoc.querySelectorAll(".wv-bm-scope-btn");
            for (const b of btns) {
                const s = b.getAttribute("data-scope");
                const active = (scope === "both") || (s === scope);
                b.classList.toggle("wv-bm-scope-active", active);
            }
        } catch (_) {}
    }

    /** Current search query (lowercased, trimmed) from the header input —
     *  empty string when the input is hidden or empty. */
    _wvReaderBmQuery(idoc: any): string {
        try {
            const inp: any = idoc.querySelector(".wv-bm-search-input");
            if (!inp) return "";
            const row: any = idoc.querySelector(".wv-bm-search-row");
            if (row && row.style.display === "none") return "";
            return String(inp.value || "").trim().toLowerCase();
        } catch (_) { return ""; }
    }

    /** Compute, for a search query, the set of visible node ids (each match,
     *  plus every ancestor folder of any match — so the path stays visible)
     *  AND the set of "dimmed" ids: folders that are visible only because of
     *  a matching descendant, not their own name. Items only appear in
     *  `visible` when they match directly, so they're never dimmed. */
    _wvBmFilterVisible(nodes: any[], q: string): { visible: Set<string>, dimmed: Set<string> } {
        const visible = new Set<string>();
        const dimmed = new Set<string>();
        const walk = (arr: any[]) => {
            let anyMatch = false;
            for (const n of (arr || [])) {
                if (!n) continue;
                if (n.type === "folder") {
                    const childAny = walk(n.children || []);
                    const name = String(n.name || "").toLowerCase();
                    const folderMatch = name.indexOf(q) >= 0;
                    if (childAny || folderMatch) {
                        visible.add(n.id);
                        if (!folderMatch) dimmed.add(n.id);   // visible only via descendants
                        anyMatch = true;
                    }
                } else {
                    const t = String(n.label || "").toLowerCase();
                    if (t.indexOf(q) >= 0) { visible.add(n.id); anyMatch = true; }
                }
            }
            return anyMatch;
        };
        walk(nodes);
        return { visible, dimmed };
    }

    /** Open/close the chip-filter popover anchored to the funnel button.
     *  Lazily creates `.wv-bm-chip-popup` inside the bookmark view's
     *  popup-host on first open and tears it down on close so the
     *  click-outside listener gets removed cleanly. Repositions on
     *  every open since the funnel button can shift when the search
     *  row is shown/hidden. */
    _wvReaderToggleBmChipPopup(reader: any, idoc: any, anchor: any) {
        try {
            // Popup is appended to the iframe body (see below), look
            // it up at document scope.
            let popup = idoc && idoc.querySelector(".wv-bm-chip-popup");
            const isOpen = !!popup;
            if (isOpen) {
                this._wvReaderCloseBmChipPopup(idoc);
                try { anchor.classList.remove("wv-bm-filter-open"); } catch (_) {}
                return;
            }
            const NS = NS_HTML_RP;
            popup = idoc.createElementNS(NS, "div");
            popup.className = "wv-bm-chip-popup";
            // Append to the iframe body (not to `view`) so the popup's
            // `position: absolute` resolves against the viewport. Then
            // `popup.style.top = r.top` (where r comes from
            // `getBoundingClientRect`) lands the popup at the same Y as
            // the funnel button. Inside `view`, the popup's offset
            // parent is a positioned ancestor higher up the tree and
            // `top: <viewport-y>` ends up shifted downward by that
            // ancestor's own top.
            (idoc.body || idoc.documentElement).appendChild(popup);
            // Render the chips now that the popover exists.
            this._wvReaderRenderBmChipBar(reader, idoc);
            // Match the bookmarks sidebar's width so the popup reads as
            // a continuation of the bookmark list it filters. Override
            // the CSS max-width: 340px since wider sidebars deserve
            // wider popups.
            let sbWidth = 0, sbRight = -1;
            try {
                const sb = anchor && anchor.closest && anchor.closest("#sidebarContainer");
                if (sb) {
                    const rectSb = sb.getBoundingClientRect();
                    sbWidth = rectSb.width;
                    sbRight = rectSb.right;
                }
            } catch (_) {}
            if (sbWidth > 0) {
                popup.style.width = sbWidth + "px";
                popup.style.maxWidth = "none";
            }
            // Anchor to the right of the sidebar so the popup sits
            // alongside (not over) the bookmark list — the user can
            // see both at once while filtering. Top-aligned with the
            // funnel button. If overflow on the right, flip and place
            // it just left of the sidebar instead.
            try {
                const r = anchor.getBoundingClientRect();
                const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
                const vh = (idoc.documentElement && idoc.documentElement.clientHeight) || 9999;
                popup.style.visibility = "hidden";
                popup.style.display = "block";
                const pw = sbWidth > 0 ? sbWidth : (popup.offsetWidth || 240);
                const ph = popup.offsetHeight || 140;
                let x = sbRight >= 0 ? (sbRight + 4) : (r.right + 4);
                if (x + pw > vw - 6) {
                    // Not enough room — flip to the left of the sidebar.
                    const sbLeft = sbRight - sbWidth;
                    x = (sbLeft >= 0 ? sbLeft : r.left) - 4 - pw;
                }
                if (x < 6) x = 6;
                let y = r.top;
                if (y + ph > vh - 6) y = Math.max(6, vh - ph - 6);
                popup.style.left = x + "px";
                popup.style.top = y + "px";
                popup.style.visibility = "";
            } catch (_) {}
            try { anchor.classList.add("wv-bm-filter-open"); } catch (_) {}
            // Click-outside / Escape dismiss. The popup lives in the reader
            // iframe but events DON'T cross iframe boundaries — a click on
            // the surrounding Zotero chrome (sidebar, item list, toolbar)
            // would otherwise never reach a single-doc listener. Mirror
            // `_wvOpenReaderFilterPopup` and attach on every reachable doc:
            // the reader iframe, the chrome host window, plus nested content
            // iframes (PDF.js / EPUB page) and the primary view doc.
            const onDown = (ev: any) => {
                try {
                    const t = ev.target;
                    if (t && popup.contains && popup.contains(t)) return;
                    if (anchor && (anchor === t || (anchor.contains && anchor.contains(t)))) return;
                    this._wvReaderCloseBmChipPopup(idoc);
                } catch (_) {}
            };
            const onKey = (ev: any) => {
                if (ev.key === "Escape") {
                    this._wvReaderCloseBmChipPopup(idoc);
                }
            };
            const docs: any[] = [idoc];
            const wins: any[] = [];
            try { const w = idoc.defaultView; if (w) wins.push(w); } catch (_) {}
            try {
                const hostWin = reader._iframe && reader._iframe.ownerDocument && reader._iframe.ownerDocument.defaultView;
                if (hostWin && wins.indexOf(hostWin) < 0) {
                    if (hostWin.document && docs.indexOf(hostWin.document) < 0) docs.push(hostWin.document);
                    wins.push(hostWin);
                }
            } catch (_) {}
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
            try {
                const ir = reader._internalReader;
                const v = ir && (ir._primaryView || ir._lastView);
                const vd = v && v._iframeWindow && v._iframeWindow.document;
                if (vd && docs.indexOf(vd) < 0) docs.push(vd);
            } catch (_) {}
            for (const d of docs) { try { d.addEventListener("pointerdown", onDown, true); } catch (_) {} }
            for (const w of wins) { try { w.addEventListener("keydown", onKey, true); } catch (_) {} }
            (popup as any)._wvDismiss = { docs, wins, onDown, onKey };
        } catch (e) {
            Zotero.debug("[Weavero] _wvReaderToggleBmChipPopup err: " + e);
        }
    }

    /** Tear down the chip-filter popover and remove its outside-click /
     *  Escape listeners across every doc/window the toggle attached to. */
    _wvReaderCloseBmChipPopup(idoc: any) {
        try {
            // Popup is appended to the iframe body (see toggle helper),
            // not nested inside the bookmarks view, so look it up at
            // document scope.
            const popup = idoc && idoc.querySelector(".wv-bm-chip-popup");
            if (!popup) return;
            const d = (popup as any)._wvDismiss;
            if (d) {
                for (const doc2 of (d.docs || [])) {
                    try { doc2.removeEventListener("pointerdown", d.onDown, true); } catch (_) {}
                }
                for (const w of (d.wins || [])) {
                    try { w.removeEventListener("keydown", d.onKey, true); } catch (_) {}
                }
            }
            try { popup.remove(); } catch (_) {}
            // Restore the funnel button to its closed visual state — the
            // toggle helper added .wv-bm-filter-open on open, and the
            // dismiss listener relied on a callback to remove it. Now
            // that close is called from multiple paths (outside-click,
            // Escape, anchor-retoggle, programmatic), strip it here so
            // every path leaves the button visually consistent.
            try {
                const btn = idoc && idoc.querySelector(".wv-bm-filter-btn.wv-bm-filter-open");
                if (btn) btn.classList.remove("wv-bm-filter-open");
            } catch (_) {}
        } catch (_) {}
    }

    /** Rebuild the chip popover contents (colors / tags / authors / types).
     *  Hidden when no facets exist across the visible bookmark universe. */
    /** Wire ns-resize drag on the chip-bar handle. Drag-up grows the bar,
     *  drag-down shrinks it. Clamped to [40, view.height − 80] so the bar
     *  never swallows the list nor disappears. Persists to a pref.
     *  Retained for back-compat with cached resizer DOM nodes from prior
     *  builds; the popover doesn't need vertical resizing.  */
    _wvWireChipResizer(reader: any, idoc: any, handle: any) {
        const win: any = idoc.defaultView;
        // The reader's focus-manager has a window-level pointerdown handler
        // that calls preventDefault() for everything outside its whitelist
        // (.annotation, .thumbnails-view, ...). preventDefault on pointerdown
        // suppresses the subsequent mousedown too, so the drag never starts.
        // Same fix the bookmark rows use: stopPropagation on pointerdown to
        // keep the event from reaching the window-level guard.
        handle.addEventListener("pointerdown", (e: any) => {
            try { e.stopPropagation(); } catch (_) {}
        });
        // Use pointer events end-to-end (capture on the handle itself) so the
        // drag tracking works even when the cursor leaves the handle's bounds.
        handle.addEventListener("pointerdown", (ev: any) => {
            try {
                ev.preventDefault();
                const view = handle.closest("." + RP_BM_VIEW_CLASS);
                const bar = view && view.querySelector(".wv-bm-chip-bar");
                if (!bar) return;
                handle.classList.add("wv-bm-resizing");
                try { handle.setPointerCapture(ev.pointerId); } catch (_) {}
                const startY = ev.clientY;
                const startH = bar.getBoundingClientRect().height || 140;
                const viewH = view.getBoundingClientRect().height || 600;
                const pointerId = ev.pointerId;
                const onMove = (e: any) => {
                    // Drag-up (negative dy) → bigger bar; clamp to keep list visible.
                    const dy = e.clientY - startY;
                    let h = startH - dy;
                    const max = Math.max(60, viewH - 80);
                    if (h < 40) h = 40;
                    if (h > max) h = max;
                    bar.style.flex = "0 0 " + Math.round(h) + "px";
                };
                const onUp = () => {
                    handle.classList.remove("wv-bm-resizing");
                    try { handle.releasePointerCapture(pointerId); } catch (_) {}
                    handle.removeEventListener("pointermove", onMove);
                    handle.removeEventListener("pointerup", onUp);
                    handle.removeEventListener("pointercancel", onUp);
                    // Persist the final height for next session / re-render.
                    try {
                        const h = Math.round(bar.getBoundingClientRect().height || 140);
                        Zotero.Prefs.set("weavero.readerBmChipBarHeight", String(h));
                    } catch (_) {}
                };
                handle.addEventListener("pointermove", onMove);
                handle.addEventListener("pointerup", onUp);
                handle.addEventListener("pointercancel", onUp);
            } catch (_) {}
        });
    }

    _wvReaderRenderBmChipBar(reader: any, idoc: any) {
        try {
            const content = idoc.getElementById("sidebarContent");
            const view = content && content.querySelector("." + RP_BM_VIEW_CLASS);
            if (!view) return;
            // Reflect "any filter selected" state on the funnel button so
            // the user can see at a glance that something is filtering
            // the list even when the popover is closed. Always runs.
            try {
                // Funnel button lives in `.wv-bm-sidebar-actions` (a
                // sibling of the bookmark view), not inside `view`, so
                // query at doc scope to find it.
                const filterBtn = idoc.querySelector(".wv-bm-filter-btn");
                if (filterBtn) {
                    if (this._wvReaderBmChipsActive(reader)) {
                        filterBtn.classList.add("wv-bm-filter-active");
                    } else {
                        filterBtn.classList.remove("wv-bm-filter-active");
                    }
                }
            } catch (_) {}
            // Chips are rendered into a popover anchored to the funnel
            // button — only when the popover is open. If it doesn't
            // exist yet (closed) there's nothing else to do here; the
            // toggle helper will populate it when the user clicks the
            // funnel. Older builds used a docked bar at the bottom of
            // the pane (snapshot kept under `.claude/snapshots/`).
            const popup = idoc && idoc.querySelector(".wv-bm-chip-popup");
            if (!popup) return;
            const NS = NS_HTML_RP;
            const bar = popup;
            while (bar.firstChild) bar.firstChild.remove();
            const st = this._wvReaderBmChipState(reader);
            const facets = this._wvReaderBmChipFacets(reader);
            const TYPE_NAME: { [k: string]: string } = {
                highlight: "Highlights", underline: "Underlines", note: "Notes",
                text: "Text annotations", image: "Image annotations", ink: "Ink annotations",
            };
            const anyFacets = facets.colors.size || facets.tags.size || facets.authors.size || facets.types.size;
            if (!anyFacets) {
                const empty = idoc.createElementNS(NS, "div");
                empty.className = "wv-bm-chip-popup-empty";
                empty.textContent = "No filters available for the current bookmark list.";
                bar.appendChild(empty);
                return;
            }
            // `wv-filter-or-group` adds the subtle grey background tint
            // the library filter / reader annotations popups use on their
            // OR-group rows — visually marks each chip row as a "pick any
            // of these" set. CSS rule is scoped to `.wv-bm-chip-popup`
            // because the chip popup lives in the reader iframe, where
            // the chrome-window's `wv-filter-or-group` rule doesn't reach.
            const mkRow = () => { const r = idoc.createElementNS(NS, "div"); r.className = "wv-bm-chip-row wv-filter-or-group"; return r; };
            const toggle = (set: Set<string>, key: string) => { if (set.has(key)) set.delete(key); else set.add(key); };
            const rerender = () => {
                try {
                    this._wvReaderRenderBmList(reader, idoc);
                    this._wvReaderRenderBmChipBar(reader, idoc);   // refresh selected states
                } catch (_) {}
            };

            // (Filter-scope-pin button removed: scope-sharing of filters is
            // now driven by the merged-scope state — Ctrl-click on the
            // Reader/Library scope buttons to merge, and the filter
            // auto-applies across both. See `_wvReaderBmChipState`.)
            // Colors row — button wrapper + inner 16×16 rounded-square tile,
            // matching the reader's annotations-pane Selector .colors.
            // Order matches upstream's ANNOTATION_COLORS (defines.js): yellow,
            // red, green, blue, purple, magenta, orange, gray (+ black for
            // ink/text). Any non-canonical colours sort alphabetically at the
            // end so the canonical palette stays in fixed positions.
            if (facets.colors.size) {
                const row = mkRow();
                const CANON_ORDER = [
                    "#ffd400", "#ff6666", "#5fb236", "#2ea8e5",
                    "#a28ae5", "#e56eee", "#f19837", "#aaaaaa", "#000000",
                ];
                const rank = (col: string): number => {
                    const i = CANON_ORDER.indexOf(String(col || "").toLowerCase());
                    return i < 0 ? CANON_ORDER.length : i;
                };
                const keys = Array.from(facets.colors.keys()).sort((a, b) => {
                    const ra = rank(a), rb = rank(b);
                    if (ra !== rb) return ra - rb;
                    return a.localeCompare(b);
                });
                for (const c of keys) {
                    // Black sits apart from the standard 8-colour palette
                    // (upstream Zotero treats it as EXTRA_INK_AND_TEXT_COLORS
                    // — only valid for ink/text annotations). Push it to the
                    // right edge after a thin vertical separator — same
                    // pattern the library filter uses in filter.ts.
                    if (c === "#000000") {
                        const sep = idoc.createElementNS(NS, "div");
                        sep.className = "wv-filter-vertical-separator";
                        (sep as any).style.marginLeft = "auto";
                        row.appendChild(sep);
                    }
                    // Unified with the filter popup (popups 1 & 2):
                    // 26×28 button holding the Zotero-native rounded-
                    // square swatch (IconColor16 — the same shape this
                    // site briefly used before the circle unification;
                    // now ALL filters use it via _wvNativeColorSwatch),
                    // `data-selected="true"` for the highlight state.
                    const btn = idoc.createElementNS(NS, "button");
                    (btn as any).type = "button";
                    btn.className = "wv-filter-opt wv-filter-opt-icon";
                    btn.setAttribute("title", c + " — " + facets.colors.get(c) + " annotation(s) — Alt+click to exclude");
                    if (st.colors.has(c)) (btn as any).dataset.selected = "true";
                    if (this._wvBmChipExcl(st, "colors").has(c)) (btn as any).dataset.excluded = "true";
                    btn.appendChild((this as any)._wvNativeColorSwatch(idoc, c));
                    btn.addEventListener("click", (e: any) => { this._wvBmChipToggle(st, "colors", c, !!e.altKey); rerender(); });
                    row.appendChild(btn);
                }
                bar.appendChild(row);
            }
            // Types row (sits right below the colour row — the two
            // annotation-shape facets group together visually).
            if (facets.types.size) {
                const row = mkRow();
                const order = ["highlight", "underline", "note", "text", "image", "ink"];
                const keys = order.filter(t => facets.types.has(t));
                for (const tp of keys) {
                    // Unified with the filter popup (popups 1 & 2):
                    // 30×28 button containing the 16×16 inline SVG
                    // glyph (annotate-highlight/underline/note/text/
                    // area/ink). `data-selected="true"` for the
                    // active state.
                    const chip = idoc.createElementNS(NS, "button");
                    (chip as any).type = "button";
                    chip.className = "wv-filter-opt wv-filter-opt-icon";
                    chip.setAttribute("title", (TYPE_NAME[tp] || tp) + " — " + facets.types.get(tp) + " — Alt+click to exclude");
                    if (st.types.has(tp)) (chip as any).dataset.selected = "true";
                    if (this._wvBmChipExcl(st, "types").has(tp)) (chip as any).dataset.excluded = "true";
                    chip.innerHTML = RP_ANN_TYPE_SVG[tp] || "";
                    chip.addEventListener("click", (e: any) => { this._wvBmChipToggle(st, "types", tp, !!e.altKey); rerender(); });
                    row.appendChild(chip);
                }
                bar.appendChild(row);
            }
            // Tags: coloured tags on their OWN row, ordered by their library
            // color position (matches Zotero's tag selector). Plain tags
            // alphabetical on the next row. The two-row split mirrors the
            // library tag selector's visual grouping; if either group is
            // empty its row is skipped so we don't leave a blank line.
            if (facets.tags.size) {
                const allKeys = Array.from(facets.tags.keys());
                const coloured = allKeys.filter(k => !!facets.tags.get(k)!.color).sort((a, b) => {
                    const pa = facets.tags.get(a)!.position;
                    const pb = facets.tags.get(b)!.position;
                    if (pa !== pb) return pa - pb;
                    return a.localeCompare(b);
                });
                const plain = allKeys.filter(k => !facets.tags.get(k)!.color).sort((a, b) => a.localeCompare(b));
                const addTagRow = (keys: string[]) => {
                    if (!keys.length) return;
                    const row = mkRow();
                    for (const t of keys) {
                        const info = facets.tags.get(t)!;
                        const chip = idoc.createElementNS(NS, "span");
                        chip.className = "wv-bm-chip" + (st.tags.has(t) ? " selected" : "")
                            + (this._wvBmChipExcl(st, "tags").has(t) ? " excluded" : "");
                        chip.setAttribute("title", t + " — " + info.count + " bookmark(s) — Alt+click to exclude");
                        if (info.color) {
                            const dot = idoc.createElementNS(NS, "span");
                            dot.className = "wv-bm-chip-tag-dot";
                            dot.style.background = info.color;
                            chip.appendChild(dot);
                        }
                        const lbl = idoc.createElementNS(NS, "span");
                        lbl.textContent = t;
                        chip.appendChild(lbl);
                        chip.addEventListener("click", (e: any) => { this._wvBmChipToggle(st, "tags", t, !!e.altKey); rerender(); });
                        row.appendChild(chip);
                    }
                    bar.appendChild(row);
                };
                addTagRow(coloured);
                addTagRow(plain);
            }
            // Authors row (only when >1, matching upstream annotations pane)
            if (facets.authors.size > 1) {
                const row = mkRow();
                const keys = Array.from(facets.authors.keys()).sort((a, b) => a.localeCompare(b));
                for (const a of keys) {
                    const chip = idoc.createElementNS(NS, "span");
                    chip.className = "wv-bm-chip" + (st.authors.has(a) ? " selected" : "")
                        + (this._wvBmChipExcl(st, "authors").has(a) ? " excluded" : "");
                    chip.setAttribute("title", a + " — " + facets.authors.get(a) + " annotation(s) — Alt+click to exclude");
                    chip.textContent = a;
                    chip.addEventListener("click", (e: any) => { this._wvBmChipToggle(st, "authors", a, !!e.altKey); rerender(); });
                    row.appendChild(chip);
                }
                bar.appendChild(row);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderRenderBmChipBar err: " + e); }
    }

    /** Pre-load item-bookmark data for any items not yet in memory. After a
     *  restart, cross-document items aren't loaded at all — and even
     *  `Zotero.Items.get`/`getByLibraryAndKey` THROW for them, so the icon
     *  builder's `annotationType` / `getImageSrc` fail and it falls back to
     *  the generic ribbon glyph. Resolve ids via `getIDFromLibraryAndKey`
     *  (a pure key→id lookup that never touches unloaded data), load any
     *  missing items (primary via `getAsync`, then `loadAllData` for
     *  annotation type/colour), and invoke `rerender` once when done. */
    _wvBmEnsureItemsLoaded(nodeRoots: any[][], rerender: () => void) {
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
            for (const root of nodeRoots) collectIds(root);
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
                    try { rerender(); } catch (_) {}
                }).catch(() => { this._wvBmIconLoadInFlight = false; });
            }
        } catch (_) {}
    }

    /** Render the global library bookmarks tree into the list container. */
    _wvReaderRenderLibraryInto(reader: any, idoc: any, list: any) {
        const NS = NS_HTML_RP;
        const nodes = (this._bmDoc && this._bmDoc.bookmarks) || [];
        // Pre-load any cross-document items so their real icons/titles paint
        // (else they show the fallback ribbon glyph until the user clicks them).
        this._wvBmEnsureItemsLoaded([nodes], () => {
            try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
        });
        const q = this._wvReaderBmQuery(idoc);
        const chipsOn = this._wvReaderBmChipsActive(reader);
        const chipSt = this._wvReaderBmChipState(reader);
        const chipMatch = chipsOn ? (n: any) => this._wvBmNodeMatchesChips(n, chipSt) : null;
        const useFilter = q || chipsOn;
        const f = useFilter ? this._wvBmFilterCombined(nodes, q, chipMatch) : null;
        // Always render the section header (with its "+" add menu + new-folder
        // button) so the Library scope stays addable even when empty — same as
        // the document sections. The content below is a how-to hint when empty,
        // a no-match note under a search, else the tree.
        const gc = idoc.createElementNS(NS, "div");
        gc.className = "wv-bm-reader-group wv-bm-grp-library";
        // Section header with title + add + new-folder buttons (matches
        // the merged-scope layout so single-Library scope has the same
        // affordances as when it appears alongside the doc sections).
        const h = idoc.createElementNS(NS, "div");
        h.className = "wv-bm-reader-grouphead";
        const htitle = idoc.createElementNS(NS, "span");
        htitle.className = "wv-bm-gh-title";
        htitle.textContent = "Global";
        h.appendChild(htitle);
        const addBtn = idoc.createElementNS(NS, "button");
        addBtn.className = "wv-bm-reader-newfolder";
        addBtn.setAttribute("title", "Add bookmark to Library");
        addBtn.innerHTML = RP_PLUS_SVG;
        addBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            this._wvShowReaderBmAddMenu(reader, idoc, addBtn, "library");
        });
        h.appendChild(addBtn);
        const nfBtn = idoc.createElementNS(NS, "button");
        nfBtn.className = "wv-bm-reader-newfolder";
        nfBtn.setAttribute("title", "New folder in Library");
        nfBtn.innerHTML = RP_FOLDER_PLUS_SVG;
        nfBtn.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const name = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
            if (name) this._bmAddFolder(name)
                .then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        h.appendChild(nfBtn);
        gc.appendChild(h);
        if (!nodes.length) {
            const hint = idoc.createElementNS(NS, "div");
            hint.className = "wv-bm-reader-empty-section";
            hint.textContent = "Use + to bookmark an item, collection, library, or saved search — they appear here in every document.";
            gc.appendChild(hint);
        } else if (f && !f.visible.size) {
            const hint = idoc.createElementNS(NS, "div");
            hint.className = "wv-bm-reader-empty-section";
            hint.textContent = q ? ("No bookmarks match \"" + q + "\".") : "No bookmarks match the current filter.";
            gc.appendChild(hint);
        } else {
            const treeWrap = idoc.createElementNS(NS, "div");
            treeWrap.className = "wv-bm-reader-tree";
            this._wvReaderRenderLibraryTree(reader, idoc, treeWrap, nodes, 0, f ? f.visible : undefined, f ? f.dimmed : undefined);
            gc.appendChild(treeWrap);
        }
        list.appendChild(gc);
    }

    /** Render one level of the library tree (folders recurse when expanded).
     *  Under search, only nodes in `visible` render and matching folders
     *  force-expand so their match is shown. */
    _wvReaderRenderLibraryTree(reader: any, idoc: any, container: any, nodes: any[], depth: number, visible?: Set<string>, dimmed?: Set<string>) {
        for (const node of (nodes || [])) {
            if (visible && !visible.has(node.id)) continue;
            if (node.type === "folder") {
                const row = this._wvReaderLibFolderRow(reader, idoc, node, depth);
                if (dimmed && dimmed.has(node.id)) row.classList.add("wv-bm-dimmed");
                container.appendChild(row);
                const expanded = visible ? true : node.expanded;
                if (expanded) this._wvReaderRenderLibraryTree(reader, idoc, container, node.children || [], depth + 1, visible, dimmed);
            } else {
                container.appendChild(this._wvReaderLibBmRow(reader, idoc, node, depth));
            }
        }
    }

    /** A library folder row: chevron + folder glyph + name; click toggles. */
    _wvReaderLibFolderRow(reader: any, idoc: any, folder: any, depth: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row wv-bm-reader-folder";
        row.style.paddingLeft = (8 + depth * 14) + "px";
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
        row.appendChild(chev); row.appendChild(ic); row.appendChild(label);
        row.addEventListener("click", (e: any) => {
            e.stopPropagation();
            this._bmToggleFolder(folder.id).then(() => this._wvReaderRenderBmList(reader, idoc));
        });
        this._wvReaderWireLibRowDrag(reader, idoc, row, folder, depth, true);
        return row;
    }

    /** A library bookmark row: type icon + label; click navigates/opens. */
    _wvReaderLibBmRow(reader: any, idoc: any, bm: any, depth: number) {
        const NS = NS_HTML_RP;
        const row = idoc.createElementNS(NS, "div");
        row.className = "wv-bm-reader-row";
        row.style.paddingLeft = (8 + depth * 14) + "px";
        const chevSpacer = idoc.createElementNS(NS, "span");
        chevSpacer.className = "wv-bm-reader-chev wv-bm-reader-chev-spacer";
        chevSpacer.innerHTML = RP_CHEV_RIGHT;
        row.appendChild(chevSpacer);
        const ic = this._wvReaderBuildBmIcon(reader, idoc, bm);
        const label = idoc.createElementNS(NS, "span");
        label.className = "wv-bm-reader-label";
        // URL bookmarks inherit the same scheme-coloured link palette
        // (http=blue, zotero://=brown, app=violet) the rest of Weavero
        // uses in notes / reader / item pane. The CSS variables are
        // already injected per surface; just stamp the matching class.
        if (bm.type === "url") {
            const cls = this._urlLinkClass(String(bm.url || ""));
            if (cls) label.classList.add(cls);
        }
        const labelText = bm.label || "Bookmark";
        label.textContent = labelText;
        // Inline "— in <attachment>" suffix for in-doc location
        // bookmarks living in the library store: they point at a spot
        // inside an attachment, and the user is no longer "in" that
        // attachment. Kept single-line so row rhythm stays uniform.
        const parentTitle = this._bmParentAttachmentTitle(bm);
        if (parentTitle) {
            const sub = idoc.createElementNS(NS, "span");
            sub.className = "wv-bm-reader-sublabel";
            sub.textContent = " — in " + parentTitle;
            label.appendChild(sub);
        }
        // Drop the plain HTML tooltip in favour of the rich hover card wired
        // below — the two would otherwise both fire on hover.
        row.appendChild(ic); row.appendChild(label);
        // Orphan bookmark — Zotero target deleted/purged. Mark + flash on click.
        const missing = this._bmTargetMissing(bm);
        if (missing) {
            row.classList.add("wv-bm-missing");
            const warn = idoc.createElementNS(NS, "span");
            warn.className = "wv-bm-reader-missing-badge";
            warn.textContent = "⚠";
            warn.setAttribute("title", "This bookmark's target no longer exists. Right-click → Delete to remove it.");
            row.appendChild(warn);
        }
        row.addEventListener("click", (e: any) => {
            if (missing) { this._bmFlashMissingRow(row, "wv-bm-reader-flash"); return; }
            this._bmActivateBookmark(bm, e);
        });
        this._wvReaderWireRowHover(reader, idoc, row, bm);
        this._wvReaderWireLibRowDrag(reader, idoc, row, bm, depth, false);
        return row;
    }

    /** Drag/drop wiring for library rows in the reader tab — native HTML5 drag
     *  (so it survives the focus-manager pointerdown guard, like reader rows),
     *  operating on the MAIN store (_bmMove). Before/after reorder on every row;
     *  a middle "into" zone on folders; collapsed folders spring-open on hover. */
    _wvReaderWireLibRowDrag(reader: any, idoc: any, row: any, node: any, depth: number, isFolder: boolean) {
        const win = idoc.defaultView;
        row.setAttribute("data-wv-bm-id", node.id);
        row.setAttribute("draggable", "true");
        row.style.setProperty("--wv-drop-indent", this._wvBmDropIndentPx(depth) + "px");
        // Mid-drag re-renders (spring-load) rebuild rows; keep the dragged row
        // dimmed across them by re-applying the class when it's the drag source.
        if (this._wvLibRowDrag === node.id) row.classList.add("wv-bm-dragging");
        row.addEventListener("pointerdown", (e: any) => { try { e.stopPropagation(); } catch (_) {} });
        const clearInd = () => {
            try {
                const els = idoc.querySelectorAll(".wv-bm-drop-before,.wv-bm-drop-after,.wv-bm-drop-into");
                for (let i = 0; i < els.length; i++) els[i].classList.remove("wv-bm-drop-before", "wv-bm-drop-after", "wv-bm-drop-into");
            } catch (_) {}
        };
        const modeAt = (clientY: number) => {
            const r = row.getBoundingClientRect();
            const rel = clientY - r.top;
            if (isFolder) return rel < r.height * 0.28 ? "before" : rel > r.height * 0.72 ? "after" : "into";
            return rel > r.height / 2 ? "after" : "before";
        };
        row.addEventListener("dragstart", (e: any) => {
            this._wvLibRowDrag = node.id;
            try {
                // `copyMove` so cross-scope drops (onto the "This Document"
                // tab button) can pick `copy` (default) or `move` (Shift)
                // per the Zotero collectionTree convention.
                e.dataTransfer.effectAllowed = "copyMove";
                e.dataTransfer.setData("application/x-weavero-libbm", node.id);
            } catch (_) {}
            this._wvReaderHideBmHoverCard(idoc);
            row.classList.add("wv-bm-dragging");
        });
        row.addEventListener("dragend", () => {
            this._wvLibRowDrag = null; row.classList.remove("wv-bm-dragging"); clearInd(); this._wvCancelLibSpring();
        });
        row.addEventListener("dragover", (e: any) => {
            const libDrag = !!this._wvLibRowDrag;
            if (libDrag) { if (this._wvLibRowDrag === node.id) return; }
            else if (!this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;   // annotation/selection drag
            e.preventDefault();
            try { e.dataTransfer.dropEffect = libDrag ? "move" : "copy"; } catch (_) {}
            clearInd();
            const m = modeAt(e.clientY);
            if (m === "into") {
                row.classList.add("wv-bm-drop-into");
                if (isFolder && !node.expanded) this._wvLibSpringOpen(reader, idoc, node, win);
            } else {
                row.classList.add(m === "before" ? "wv-bm-drop-before" : "wv-bm-drop-after");
                row.style.setProperty("--wv-drop-indent", this._wvBmDropIndentPx(depth) + "px");
                this._wvCancelLibSpring();
            }
        });
        row.addEventListener("dragleave", () => { clearInd(); this._wvCancelLibSpring(); });
        row.addEventListener("drop", (e: any) => {
            const libDrag = !!this._wvLibRowDrag;
            if (!libDrag && !this._wvReaderDragHasBookmarkable(e.dataTransfer)) return;
            e.preventDefault(); e.stopPropagation();
            clearInd(); this._wvCancelLibSpring();
            const m = modeAt(e.clientY);
            if (libDrag) {
                const dragged = this._wvLibRowDrag; this._wvLibRowDrag = null;
                if (!dragged || dragged === node.id) return;
                this._bmMove(dragged, node.id, m).then(() => this._wvReaderRenderBmList(reader, idoc));
            } else {
                // Annotation dragged from the reader → add a library item bookmark
                // at this row's position.
                this._wvReaderLibAcceptDrop(reader, idoc, this._wvReaderReadDropPayload(e), { id: node.id, mode: m });
            }
        });
    }

    /** Spring-load: pause over a collapsed library folder's "into" zone to open
     *  it (a real expand — persisted) so you can drop inside. */
    _wvLibSpringOpen(reader: any, idoc: any, folder: any, win: any) {
        if (this._wvLibSpringId === folder.id) return;
        this._wvCancelLibSpring();
        this._wvLibSpringId = folder.id; this._wvLibSpringWin = win;
        this._wvLibSpringTimer = win.setTimeout(() => {
            this._wvLibSpringTimer = null; this._wvLibSpringId = null; this._wvLibSpringWin = null;
            this._bmToggleFolder(folder.id).then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} });
        }, 500);
    }
    _wvCancelLibSpring() {
        try { if (this._wvLibSpringTimer && this._wvLibSpringWin) this._wvLibSpringWin.clearTimeout(this._wvLibSpringTimer); } catch (_) {}
        this._wvLibSpringTimer = null; this._wvLibSpringId = null; this._wvLibSpringWin = null;
    }

    /** Accept an annotation/selection dragged FROM the reader (sidebar or page)
     *  into the LIBRARY view → add item bookmark(s) to the main store, optionally
     *  placed at `target` ({id, mode} or null = root end). Returns true if it
     *  handled the drop. Text-only selections become a `text`-type bookmark
     *  pointing at the source document via `srcLibraryID`/`srcItemKey` —
     *  same shape `_wvBmTransferDocToLib` produces when a doc-scope text
     *  bookmark is dragged to the library scope. */
    async _wvReaderLibAcceptDrop(reader: any, idoc: any, payload: any, target: any): Promise<boolean> {
        try {
            const att = this._wvReaderAtt(reader);
            const entries: any[] = [];
            let selAnn: any = null;
            if (payload.sidebarKey) {
                entries.push({ libraryID: att && att.libraryID, itemKey: payload.sidebarKey, label: null });
            } else if (payload.annJson) {
                try {
                    const arr = JSON.parse(payload.annJson);
                    for (const a of (arr || [])) {
                        if (a && a.id) {
                            let lib = att && att.libraryID;
                            if (a.attachmentItemID) { try { const s: any = Zotero.Items.get(a.attachmentItemID); if (s) lib = s.libraryID; } catch (_) {} }
                            entries.push({ libraryID: lib, itemKey: a.id, label: String(a.text || a.comment || "").trim() });
                        }
                        // Unsaved text selection (no id, but has text + position).
                        else if (a && !selAnn && (a.text || a.position)) selAnn = a;
                    }
                } catch (_) {}
            }
            this._wvDraggedAnnKey = null;
            // No saved annotations → try text selection fallback.
            if (!entries.length) {
                const selText = (selAnn && String(selAnn.text || "").trim())
                    || ((payload.txt && payload.txt.indexOf("wvbm:") !== 0) ? payload.txt.trim() : "");
                if (!selText) return false;
                await this._bmInit();
                let position: any = null;
                if (selAnn && selAnn.position) { try { position = JSON.parse(JSON.stringify(selAnn.position)); } catch (_) {} }
                // Cross-doc check: if the selection's source attachment
                // differs from the drop target's doc, store the source
                // ref so navigating opens the SOURCE document at the
                // selection (matches the doc-scope cross-doc semantics
                // in `_wvReaderDropPayload`).
                const srcAttId = selAnn && selAnn.attachmentItemID;
                let srcLib = att && att.libraryID;
                let srcKey = att && att.att && att.att.key;
                if (srcAttId && att && att.att && srcAttId !== att.att.id) {
                    try {
                        const srcAtt: any = Zotero.Items.get(srcAttId);
                        if (srcAtt) { srcLib = srcAtt.libraryID; srcKey = srcAtt.key; }
                    } catch (_) {}
                }
                const node: any = {
                    id: "wv-" + Zotero.Utilities.randomString(8),
                    type: "text",
                    label: selText.slice(0, 160),
                    pageLabel: (selAnn && selAnn.pageLabel) || null,
                    position,
                    srcLibraryID: srcLib,
                    srcItemKey: srcKey,
                    created: new Date().toISOString(),
                };
                this._bmDoc.bookmarks.push(node);
                await this._bmPersist();
                if (target && target.id) {
                    try { await this._bmMove(node.id, target.id, target.mode || "after"); } catch (_) {}
                }
                this._wvReaderRenderBmList(reader, idoc);
                this._wvReaderRecoverAnnotationPopup(reader);
                return true;
            }
            await this._bmInit();
            const addedIds: string[] = [];
            for (const en of entries) {
                if (!en.itemKey) continue;
                // Firefox-style list semantics: same item may be bookmarked
                // multiple times (e.g. filed into several folders), so the
                // `_bmHasItem` dedup check that used to live here is gone.
                let label = en.label;
                if (!label) { try { const it: any = Zotero.Items.getByLibraryAndKey(en.libraryID, en.itemKey); label = it ? String(it.annotationText || it.annotationComment || "").trim() : ""; } catch (_) {} }
                label = (label || "Annotation").slice(0, 100);
                const node = { id: "wv-" + Zotero.Utilities.randomString(8), type: "item", libraryID: en.libraryID, itemKey: en.itemKey, label, created: new Date().toISOString() };
                this._bmDoc.bookmarks.push(node);
                addedIds.push(node.id);
            }
            if (addedIds.length) {
                await this._bmPersist();
                if (target && target.id) {
                    let relId = target.id, mode = target.mode || "after";
                    for (const id of addedIds) { if (id === target.id) continue; try { await this._bmMove(id, relId, mode); } catch (_) {} relId = id; mode = "after"; }
                }
            }
            this._wvReaderRenderBmList(reader, idoc);
            return true;
        } catch (e) { Zotero.debug("[Weavero] _wvReaderLibAcceptDrop err: " + e); return false; }
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

    /** Wire a scope-toggle button (`mkScope`-built) as a cross-scope drop
     *  target. Convention from Zotero's `collectionTree.jsx`:
     *    • no modifier  → copy
     *    • Shift        → move
     *    • Mac metaKey  → move
     *  Drop a doc-row onto the "Library" button to copy/move it into the
     *  library store; drop a lib-row onto "This Document" for the reverse.
     *  Drops onto the SAME-scope button are ignored — no preventDefault, so
     *  the browser keeps the no-drop cursor. */
    _wvWireScopeBtnDrop(btn: any, btnScope: string, reader: any, idoc: any) {
        const plugin: any = this;
        const dragInfo = () => {
            if (plugin._wvBmRowDrag) return { kind: "doc", src: plugin._wvBmRowDrag };
            if (plugin._wvLibRowDrag) return { kind: "lib", id: plugin._wvLibRowDrag };
            return null;
        };
        const opposite = (kind: string) =>
            (kind === "doc" && btnScope === "library")
            || (kind === "lib" && btnScope === "document");
        // Firefox-style cross-scope convention: drag = move (default),
        // Ctrl-drag (Mac: Cmd-drag) = copy. The pre-Firefox convention
        // was the inverse — default copy, Shift to move — mirroring
        // Zotero's collection tree. Holding ANY of Ctrl/Meta flips to
        // copy; we keep Shift too as a no-op-historical alias so old
        // muscle memory doesn't accidentally trigger move.
        const copyModifier = (e: any) => !!(e && (e.ctrlKey
            || ((typeof Zotero !== "undefined" && Zotero.isMac) && e.metaKey)));

        // Tag the scope-group while a valid drop is hovering so CSS can
        // dim the OTHER (active) button — otherwise its solid blue
        // background looks like a drop target and competes with the
        // outline on the actual drop target.
        const group = btn.parentNode;
        btn.addEventListener("dragover", (e: any) => {
            try {
                const d = dragInfo();
                // Annotation/selection dragged in from the reader sidebar
                // (or PDF view): accept on the LIBRARY scope button so it
                // creates a library item-bookmark, same as dropping on a
                // library row (which the per-row handler accepts already).
                const isAnnotDrag = !d && btnScope === "library"
                    && plugin._wvReaderDragHasBookmarkable(e.dataTransfer);
                if (!isAnnotDrag && (!d || !opposite(d.kind))) return;
                e.preventDefault();
                // stopPropagation: an ancestor section container also has
                // a drop handler that, given an active row drag, calls
                // `_wvReaderDropBmRow(reader, idoc, null)` (reorder to
                // section end). Without stopping the bubble, dropping
                // here copies/moves AND reorders the source — visibly
                // shifting its position in "In This Document". (Same
                // issue on dragover would set the wrong dropEffect.)
                e.stopPropagation();
                e.dataTransfer.dropEffect = isAnnotDrag ? "copy"
                    : (copyModifier(e) ? "copy" : "move");
                // Clear any row-level drop indicators left over from the
                // cursor moving up through bookmark rows on its way to
                // this button. Without this, the first row visible at
                // the top of the list keeps its `wv-bm-drop-before`
                // class — drawing a blue line under the section header
                // — even though the drop is going to the scope button.
                try {
                    const stale = idoc.querySelectorAll(
                        ".wv-bm-drop-before,.wv-bm-drop-after,.wv-bm-drop-into");
                    for (let i = 0; i < stale.length; i++) {
                        stale[i].classList.remove("wv-bm-drop-before",
                            "wv-bm-drop-after", "wv-bm-drop-into");
                    }
                } catch (_) {}
                btn.classList.add("wv-bm-scope-dropok");
                if (group && group.classList) group.classList.add("wv-bm-scope-dragover");
            } catch (_) {}
        });
        btn.addEventListener("dragleave", () => {
            btn.classList.remove("wv-bm-scope-dropok");
            if (group && group.classList) group.classList.remove("wv-bm-scope-dragover");
        });
        btn.addEventListener("drop", (e: any) => {
            btn.classList.remove("wv-bm-scope-dropok");
            if (group && group.classList) group.classList.remove("wv-bm-scope-dragover");
            try {
                const d = dragInfo();
                // Annotation/selection dropped on the LIBRARY scope button:
                // add the item-bookmark to the library root (target=null).
                const isAnnotDrag = !d && btnScope === "library"
                    && plugin._wvReaderDragHasBookmarkable(e.dataTransfer);
                if (!isAnnotDrag && (!d || !opposite(d.kind))) return;
                e.preventDefault();
                // Same bubble-stop as in dragover, for the same reason —
                // without this, the section's append-on-drop handler
                // ALSO fires after us and reorders the source row.
                e.stopPropagation();
                if (isAnnotDrag) {
                    const payload = plugin._wvReaderReadDropPayload(e);
                    Promise.resolve(plugin._wvReaderLibAcceptDrop(reader, idoc, payload, null))
                        .catch((err: any) => Zotero.debug("[Weavero] annot→lib err: " + err));
                    return;
                }
                const isMove = !copyModifier(e);
                if (d.kind === "doc") {
                    Promise.resolve(plugin._wvBmTransferDocToLib(d.src, isMove, reader, idoc))
                        .catch((err: any) => Zotero.debug("[Weavero] doc→lib err: " + err));
                } else {
                    Promise.resolve(plugin._wvBmTransferLibToDoc(d.id, isMove, reader, idoc))
                        .catch((err: any) => Zotero.debug("[Weavero] lib→doc err: " + err));
                }
            } catch (err: any) {
                Zotero.debug("[Weavero] scope-btn drop err: " + err);
            }
        });
    }

    /** Deep-clone a bookmark node, regenerating ids recursively (folders +
     *  their children) so the copy doesn't collide with the source on
     *  identity checks (drag highlight, dedup-by-id, etc.). */
    _wvBmCloneNodeFresh(node: any): any {
        if (!node) return node;
        const fresh = Object.assign({}, node);
        fresh.id = "wv-" + Zotero.Utilities.randomString(8);
        fresh.created = new Date().toISOString();
        if (node.type === "folder" && Array.isArray(node.children)) {
            fresh.children = node.children.map((c: any) => this._wvBmCloneNodeFresh(c));
        }
        return fresh;
    }

    /** Copy/move a doc-row to the library store. `src = { libraryID, itemKey,
     *  id, section, type }` (the captured drag state). All types transfer —
     *  including the in-document location types (`position`, `page`, `text`),
     *  which gain a `srcLibraryID/srcItemKey` source ref pointing back at
     *  their host attachment so the library store can still navigate
     *  there (clicking opens that attachment at that spot). The url, item,
     *  collection, library, treerow and folder types are self-contained. */
    async _wvBmTransferDocToLib(src: any, isMove: boolean, reader: any, idoc: any) {
        if (!src || !src.id || src.libraryID == null || !src.itemKey) return;
        await this._bmInit();
        const srcDoc = this._bmReaderDoc(src.libraryID, src.itemKey);
        const loc = this._bmLocate(src.id, srcDoc.local)
            || this._bmLocate(src.id, srcDoc.global);
        if (!loc || !loc.entry) return;
        const rec = loc.entry;

        // Firefox-style list semantics: cross-scope drops always add, even
        // if the same target is already bookmarked in the library.
        {
            const fresh = this._wvBmCloneNodeFresh(rec);
            // In-doc location types need a source ref so the library
            // store knows which attachment to open. Stamp it if missing;
            // if the entry already carries one (e.g. a text selection
            // dragged from another doc), keep it as-is.
            if ((fresh.type === "position" || fresh.type === "page"
                    || fresh.type === "text") && !fresh.srcItemKey) {
                fresh.srcLibraryID = src.libraryID;
                fresh.srcItemKey = src.itemKey;
            }
            // For all OTHER types the src refs are noise — the library
            // record stands on its own.
            else if (fresh.type !== "position" && fresh.type !== "page"
                    && fresh.type !== "text") {
                delete fresh.srcLibraryID; delete fresh.srcItemKey;
            }
            // Strip section flag (folders use it for reader-store sectioning).
            delete fresh._section;
            this._bmDoc.bookmarks.push(fresh);
            await this._bmPersist();
        }

        if (isMove) {
            try { await this._bmReaderRemove(src.libraryID, src.itemKey, src.id); }
            catch (_) {}
        }

        if (idoc) {
            try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
        }
    }

    /** Copy/move a library-row to the current attachment's reader store.
     *  The section classifier inside `_bmReaderAdd` routes annotations of
     *  this attachment to "In this document" and everything else to
     *  "Elsewhere in Zotero". All library types map cleanly. */
    async _wvBmTransferLibToDoc(libRecId: string, isMove: boolean, reader: any, idoc: any) {
        if (!libRecId) return;
        await this._bmInit();
        const loc = this._bmLocate(libRecId);
        if (!loc || !loc.entry) return;
        const rec = loc.entry;
        const att = this._wvReaderAtt(reader);
        if (!att || att.libraryID == null || !att.itemKey) return;

        const fresh = this._wvBmCloneNodeFresh(rec);
        // `_bmReaderAdd` assigns its own id + created timestamp on the
        // merged record, so strip the ones we just generated to let the
        // store-side defaults win (avoids two random-id collisions).
        delete fresh.id;
        delete fresh.created;
        // Round-trip clean-up: if this is an in-doc location bookmark
        // (position/page/text) that points back at the SAME attachment
        // we're dropping into, drop the src refs so the entry looks
        // identical to a freshly-made local bookmark (and `_bmReaderEntrySection`
        // files it under "This Document" rather than "Elsewhere").
        if ((fresh.type === "position" || fresh.type === "page"
                || fresh.type === "text")
                && fresh.srcItemKey === att.itemKey
                && fresh.srcLibraryID === att.libraryID) {
            delete fresh.srcLibraryID;
            delete fresh.srcItemKey;
        }

        try {
            await this._bmReaderAdd(att.libraryID, att.itemKey, fresh,
                { allowDuplicate: false });
        } catch (e) {
            Zotero.debug("[Weavero] lib→doc add err: " + e);
            return;
        }

        if (isMove) {
            try { await this._bmRemove(libRecId); } catch (_) {}
        }

        if (idoc) {
            try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
        }
    }

    /** True for bookmarks that point INTO the currently-open document
     *  (positions, selected-text, and annotations of this attachment). */
    _wvReaderBookmarkIsLocal(reader: any, bm: any) {
        try {
            if (!bm) return false;
            if (bm.type === "position" || bm.type === "page" || bm.type === "text") {
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

    /** Dismiss the in-document annotation popup if one is open. Used when
     *  navigating to a different bookmark so a stale popup from a previous
     *  annotation click doesn't linger. */
    _wvDismissReaderAnnPopup(reader: any) {
        try {
            const ir = reader && reader._internalReader;
            if (!ir || !ir._state || !ir._state.primaryViewAnnotationPopup) return;
            const iwin: any = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
            const upd: any = (iwin && (Components as any).utils)
                ? (Components as any).utils.cloneInto({ primaryViewAnnotationPopup: null }, iwin)
                : { primaryViewAnnotationPopup: null };
            if (ir._updateState) ir._updateState(upd);
        } catch (_) {}
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
        // URL / app-link bookmark — hand off to the OS browser via
        // Route via Weavero's `_launchURL` — same helper note-editor
        // and annotation clicks use. It honours the per-scheme
        // `weavero.enableAppLinksSkipConfirm` pref (when set, bypasses
        // Firefox's "Allow this site to open the <scheme> link?" dialog
        // by calling `handlerInfo.launchWithURI` directly), and routes
        // `zotero://` URLs through the internal dispatcher.  Modifier
        // keys intentionally don't change behaviour here (no "Show in
        // Library" for a URL — it doesn't have a library presence).
        if (bm.type === "url" && bm.url) {
            try { this._launchURL(String(bm.url)); }
            catch (err) { Zotero.debug("[Weavero] url-bm launch err: " + err); }
            return;
        }
        // Clicking a bookmark should reset any open in-document annotation
        // popup; the annotation-bookmark branch below re-opens it for the
        // new annotation if applicable.
        this._wvDismissReaderAnnPopup(reader);
        const ctrl = !!(e && (e.ctrlKey || e.metaKey));
        const shift = !!(e && e.shiftKey);
        const isLocalLoc = (bm.type === "position" || bm.type === "page" || bm.type === "text")
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
                    else if (bm.type === "page") {
                        // Whole-page bookmark — page-level scroll, no pin.
                        const pi = (bm.location && Number.isInteger(bm.location.pageIndex))
                            ? bm.location.pageIndex
                            : (bm.position && Number.isInteger(bm.position.pageIndex))
                                ? bm.position.pageIndex
                                : null;
                        if (pi != null) loc = { pageIndex: pi };
                    }
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
            if (isLocalAnno) {
                // Mirror a direct annotation click: select it (so the view
                // scrolls + highlights), then open the in-document popup.
                //
                // Two gotchas:
                //  1. The Reader's setSelectedAnnotations is bundled inside the
                //     reader iframe; its `ids.length` read fails through Xray
                //     when an array crosses from chrome into that compartment.
                //     Cu.cloneInto re-creates the array in the iframe's
                //     compartment so the call goes through cleanly.
                //  2. setSelectedAnnotations only flips the selection state —
                //     the in-document popup is opened by the view's own
                //     _openAnnotationPopup() (PDF + DOM views both have it).
                // SCROLL FIRST: passing triggeredFromView=true to
                // setSelectedAnnotations tells the reader "click happened
                // inside the PDF view, don't scroll" (reader.js:1982-2003).
                // The sidebar's own listbox path uses navigate() to scroll
                // BEFORE setting selection. Mirror that: navigate to the
                // annotation (scrolls the PDF + opens the popup), then run
                // setSelectedAnnotations with triggeredFromView=true to
                // mark the row as selected without re-scrolling.
                try {
                    reader.navigate({ annotationID: bm.itemKey });
                } catch (_) {}
                try {
                    const iwin: any = reader._iframeWindow || (reader._iframe && reader._iframe.contentWindow);
                    const idsArr: any = (iwin && (Components as any).utils)
                        ? (Components as any).utils.cloneInto([bm.itemKey], iwin)
                        : [bm.itemKey];
                    reader.setSelectedAnnotations(idsArr, true);
                    try {
                        const ir = reader._internalReader;
                        const v = ir && (ir._primaryView || ir._lastView);
                        if (v && v._openAnnotationPopup) v._openAnnotationPopup();
                    } catch (_) {}
                } catch (_) {}
            }
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
        if (bm.type === "position") {
            // "Add Bookmark to This Position" — a precise spot, marked with
            // the 📌 pushpin both in the list row and as the in-document
            // overlay (`_wvReaderShowPin`).
            ic.classList.add("wv-bm-emoji");
            ic.textContent = RP_PIN_EMOJI;
        }
        else if (bm.type === "page") {
            // "Add Bookmark to This Page" — whole-page bookmark, ribbon
            // glyph (no rects → not a precise spot → not a pin).
            ic.innerHTML = RP_BM_RIBBON;
        }
        else if (bm.type === "text") ic.innerHTML = RP_TEXT_SVG;
        else if (bm.type === "url") {
            // Scheme-aware icon: globe for http(s)://, external-link arrow
            // for app-link schemes (obsidian://, slack://, mailto:, …),
            // chain for the few zotero:// links that aren't auto-converted.
            // (Zotero `select`/`open` links are normally rewritten to
            // native `item`/`collection` bookmark types at save time and
            // never hit this branch — they get their own type icons via
            // `_bmIconInfo`.) Strokes use `currentColor` so the SVG
            // inherits the row's link colour.
            const cls = this._urlLinkClass(String(bm.url || ""));
            if (cls === "wv-link-http") ic.innerHTML = URL_GLOBE_SVG;
            else if (cls === "wv-link-app") ic.innerHTML = URL_EXTERNAL_SVG;
            else ic.innerHTML = SCHEME_SVG_TEMPLATE.replace("__FILL__", "currentColor");
        }
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
        if (bm.type === "url") {
            const cls = this._urlLinkClass(String(bm.url || ""));
            if (cls) label.classList.add(cls);
        }
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
        // Orphan bookmark — its Zotero target was deleted/purged. Mark the row
        // (dim + strikethrough) + ⚠ badge; clicking flashes instead of no-op.
        const missing = this._bmTargetMissing(bm);
        if (missing) {
            row.classList.add("wv-bm-missing");
            const warn = idoc.createElementNS(NS, "span");
            warn.className = "wv-bm-reader-missing-badge";
            warn.textContent = "⚠";
            warn.setAttribute("title", "This bookmark's target no longer exists. Right-click → Delete to remove it.");
            row.appendChild(warn);
        }
        row.addEventListener("click", (e: any) => {
            if (missing) { this._bmFlashMissingRow(row, "wv-bm-reader-flash"); return; }
            this._wvNavigateReaderBookmark(reader, bm, e);
        });
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
            const cw = card.offsetWidth || 260, ch = card.offsetHeight || 120;
            // Library-popup parent (an HTML container inside a XUL <panel>):
            // the card lives in the popup's overflow:auto inner, so use
            // offset-relative coords. The card sits BELOW the row by default,
            // overlapping rows further down (acceptable for a tooltip card).
            const popupParent = card.parentNode && card.parentNode.id === "wv-bm-list-inner" ? card.parentNode
                : (card.parentNode && card.parentNode.classList && card.parentNode.classList.contains("wv-bm-flyout-inner") ? card.parentNode : null);
            if (popupParent) {
                const rTop = rowEl.offsetTop;
                const rH = rowEl.offsetHeight;
                const pH = popupParent.clientHeight || 460;
                const pW = popupParent.clientWidth || 340;
                let top = rTop + rH + 4;
                // If below the row would overflow the popup, place above the row instead.
                if (top + ch > popupParent.scrollTop + pH - 6) {
                    top = Math.max(popupParent.scrollTop + 6, rTop - ch - 4);
                }
                // Card width is constrained by the popup width (max 340).
                const left = Math.max(2, Math.min(rowEl.offsetLeft, pW - cw - 4));
                card.style.left = left + "px";
                card.style.top = top + "px";
                return;
            }
            // Reader iframe: viewport-relative positioning (same coord system
            // as the row inside the iframe).
            const rr = rowEl.getBoundingClientRect();
            const de = idoc.documentElement;
            const vw = (de && de.clientWidth) || 9999, vh = (de && de.clientHeight) || 9999;
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
        const info: any = { kind: "", color: null, page: "", text: "", comment: "", tags: [], source: "", created: "", itemCreated: "", original: "", author: "" };
        try {
            info.page = this._bmReaderPageLabel(bm);
            if (bm.created) { try { info.created = new Date(bm.created).toLocaleDateString(); } catch (_) {} }
            if (this._bmReaderIsRenamed(bm)) info.original = this._bmReaderOriginalLabel(bm) || "";
            const ANN: { [k: string]: string } = {
                highlight: "Highlight", underline: "Underline", note: "Note",
                text: "Text annotation", image: "Image annotation", ink: "Ink annotation",
            };
            if (bm.type === "position") { info.kind = "Location"; info.comment = String(bm.comment || "").trim(); }
            else if (bm.type === "text") { info.kind = "Selected text"; info.text = bm.label || ""; info.comment = String(bm.comment || "").trim(); }
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
                    // Author chip stays EMPTY for personal-library annotations
                    // (implicitly "you"). For group-library annotations, mirror
                    // Zotero's annotation popup (annotations.js toJSONSync):
                    // prefer the explicit `annotationAuthorName`, otherwise fall
                    // back to the createdByUser display name.
                    try {
                        const userLib = (Zotero as any).Libraries && (Zotero as any).Libraries.userLibraryID;
                        const isPersonal = (typeof userLib === "number") && (it.libraryID === userLib);
                        if (!isPersonal) {
                            let name = String((it as any).annotationAuthorName || "").trim();
                            if (!name) {
                                try {
                                    const uid = (it as any).createdByUserID;
                                    if (uid && (Zotero as any).Users && (Zotero as any).Users.getName) {
                                        name = String((Zotero as any).Users.getName(uid) || "").trim();
                                    }
                                } catch (__) {}
                            }
                            info.author = name;
                        }
                    } catch (_) {}
                    // Tags carry their library-level color (Zotero "colored tag"
                    // associations) when available — surface that so chips can
                    // render a colored dot, matching the item pane's display.
                    try {
                        for (const t of (it.getTags() || [])) {
                            if (t && t.tag) {
                                let color = "";
                                try { const c: any = Zotero.Tags.getColor(it.libraryID, t.tag); if (c && c.color) color = c.color; } catch (_) {}
                                info.tags.push({ tag: t.tag, color });
                            }
                        }
                    } catch (_) {}
                    if (!info.page) { try { info.page = it.annotationPageLabel || ""; } catch (_) {} }
                    try {
                        // Source line ("in: <title>") for cross-document annotations.
                        // Reader context: hide when the annotation lives in the
                        // currently-open document (reader.itemID).
                        // No reader (library popup): every annotation is "elsewhere".
                        const ownItemID = reader && reader.itemID;
                        if (it.parentItemID && (!ownItemID || it.parentItemID !== ownItemID)) {
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
            card.className = "wv-bm-hovercard" + (info.color ? " wv-hc-has-color" : "");
            try { card.style.colorScheme = (this._bmIsDark && this._bmIsDark(idoc.defaultView)) ? "dark" : "light"; } catch (_) {}
            // Expose the annotation color to the CSS so the text/comment blocks
            // get a coloured left bar (matching the reader Annotations sidebar).
            if (info.color) { try { card.style.setProperty("--wv-ann-color", info.color); } catch (_) {} }
            // Header layout mirrors the reader Annotations tab:
            //   annotations         → [icon] [Page X] ............ [author]
            //   other bookmarks     → [icon] [name]   ............ [page]
            const head = mk("wv-hc-head");
            const hic = this._wvReaderBuildBmIcon(reader, idoc, bm);
            try { hic.setAttribute("aria-label", info.kind || ""); } catch (_) {}
            head.appendChild(hic);
            const isAnn = !!info.color;
            // Location-like bookmarks (annotation / text selection / pinned
            // position) all get the annotation-sidebar header: "Page N" in the
            // name slot (or empty for HTML/Snapshot which has no page label),
            // and the author chip on the right (only annotations carry one in
            // practice; text/position have no author).
            const isLocLike = isAnn || bm.type === "text" || bm.type === "position";
            const nm = idoc.createElementNS(NS, "span"); nm.className = "wv-hc-name";
            nm.textContent = isLocLike
                ? (info.page ? "Page " + info.page : "")
                : (bm.label || info.kind || "Bookmark");
            head.appendChild(nm);
            if (isLocLike) {
                if (info.author) { const au = idoc.createElementNS(NS, "span"); au.className = "wv-hc-author"; au.textContent = info.author; head.appendChild(au); }
            } else if (info.page) {
                const pg = idoc.createElementNS(NS, "span"); pg.className = "wv-hc-page"; pg.textContent = "p. " + info.page; head.appendChild(pg);
            }
            card.appendChild(head);
            // Body: the variable-length content — capped by default, scrolls when expanded.
            const body = mk("wv-hc-body");
            // Show the full text unless it's identical to the name already in
            // the header (avoid repetition) — but ALWAYS for text-selection
            // bookmarks AND for annotations (info.color set), so the quote
            // block + coloured left bar render and the card mirrors the
            // reader Annotations tab's row.
            if (info.text && (bm.type === "text" || info.color || info.text !== (bm.label || ""))) body.appendChild(mk("wv-hc-text", info.text));
            if (info.comment) body.appendChild(mk("wv-hc-comment", info.comment));
            if (info.tags && info.tags.length) {
                const tg = mk("wv-hc-tags");
                // Tag glyph in front of the row (mirrors the reader Annotations
                // tab where tags are prefixed by an icon).
                const tagIc = idoc.createElementNS(NS, "span");
                tagIc.className = "wv-hc-tag-ic";
                // Filled glyph from Zotero's own `tag.svg` (chrome://zotero/skin/
                // 16/universal/tag.svg) — currentColor so we can theme it via CSS.
                tagIc.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M6.086 1L14.586 9.5L9.5 14.586L1 6.086V1H6.086ZM6.5 0H0.5C0.367 0 0.24 0.053 0.146 0.146C0.053 0.24 0 0.367 0 0.5L0 6.5L9.146 15.646C9.24 15.74 9.367 15.792 9.5 15.792C9.632 15.792 9.759 15.74 9.853 15.646L15.646 9.853C15.74 9.759 15.792 9.632 15.792 9.5C15.792 9.367 15.74 9.24 15.646 9.146L6.5 0ZM4 2.75C3.586 2.75 3.211 2.918 2.94 3.189C2.668 3.461 2.5 3.836 2.5 4.25C2.5 4.664 2.668 5.039 2.94 5.311C3.211 5.582 3.586 5.75 4 5.75C4.414 5.75 4.789 5.582 5.061 5.311C5.332 5.039 5.5 4.664 5.5 4.25C5.5 3.836 5.332 3.461 5.061 3.189C4.789 2.918 4.414 2.75 4 2.75Z"/></svg>';
                tg.appendChild(tagIc);
                for (const t of info.tags) {
                    const chip = idoc.createElementNS(NS, "div");
                    chip.className = "wv-hc-tag";
                    if (t && t.color) {
                        const dot = idoc.createElementNS(NS, "span");
                        dot.className = "wv-hc-tag-dot";
                        dot.style.backgroundColor = t.color;
                        chip.appendChild(dot);
                    }
                    chip.appendChild(idoc.createTextNode((t && t.tag) || ""));
                    tg.appendChild(chip);
                }
                body.appendChild(tg);
            }
            if (info.source) body.appendChild(mk("wv-hc-src", info.source));
            card.appendChild(body);
            // Append now so we can measure whether the body is clamped.
            // Library-popup case: append to the popup's inner container so the
            // card lives inside the panel widget (same coord system as the row;
            // popup-hide auto-removes the card). Reader iframe case: append to
            // the iframe's body where the row also lives.
            // Where to host the card:
            //  • Inside a folder FLYOUT (a small, clipped native panel) → give the
            //    card its OWN XUL panel anchored to the RIGHT of the row, so it
            //    floats BESIDE the flyout instead of on top of its rows.
            //  • Main library list / reader iframe → inline, positioned in the
            //    same scroll container (existing behaviour).
            const flyoutInner: any = (rowEl && rowEl.closest) ? rowEl.closest(".wv-bm-flyout-inner") : null;
            let hostPanel: any = null;
            if (flyoutInner && idoc.createXULElement) {
                try {
                    const stale = idoc.getElementById("wv-bm-hovercard-panel");
                    if (stale) stale.remove();
                    hostPanel = idoc.createXULElement("panel");
                    hostPanel.id = "wv-bm-hovercard-panel";
                    hostPanel.setAttribute("animate", "false");
                    hostPanel.setAttribute("noautohide", "true");
                    hostPanel.setAttribute("consumeoutsideclicks", "false");
                    card.style.position = "static";   // let the panel size to the card
                    hostPanel.appendChild(card);
                    const phost = idoc.getElementById("mainPopupSet") || idoc.documentElement;
                    phost.appendChild(hostPanel);
                } catch (_) { hostPanel = null; }
            }
            if (!hostPanel) {
                let parent: any = null;
                try {
                    if (rowEl && rowEl.closest) {
                        parent = rowEl.closest("#wv-bm-list-inner") || rowEl.closest(".wv-bm-flyout-inner");
                    }
                } catch (_) {}
                (parent || idoc.body || idoc.documentElement).appendChild(card);
            }
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
            if (info.original) meta.push("Original: " + info.original);
            if (info.itemCreated) meta.push("Created: " + info.itemCreated);
            if (info.created) meta.push("Bookmarked: " + info.created);
            for (const m of meta) card.appendChild(mk("wv-hc-meta", m));   // one per line
            // Keep the card alive while the cursor is over it (it's interactive).
            const win = idoc.defaultView;
            card.addEventListener("mouseenter", () => { try { if (this._wvBmHoverHideTimer) { win.clearTimeout(this._wvBmHoverHideTimer); this._wvBmHoverHideTimer = null; } } catch (_) {} });
            card.addEventListener("mouseleave", () => this._wvReaderScheduleHideBmHoverCard(idoc));
            if (hostPanel) {
                // Float the card panel just past the flyout row's right edge,
                // top-aligned with it — beside the flyout, never over its rows.
                try { hostPanel.openPopup(rowEl, "end_before", 0, 0, false, false); } catch (_) {}
            } else {
                this._wvReaderPositionBmHoverCard(card, rowEl, idoc);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderShowBmHoverCard err: " + e); }
    }

    _wvReaderHideBmHoverCard(idoc: any) {
        try { if (this._wvBmHoverHideTimer && idoc.defaultView) idoc.defaultView.clearTimeout(this._wvBmHoverHideTimer); } catch (_) {}
        this._wvBmHoverHideTimer = null;
        try { const c = idoc.querySelector(".wv-bm-hovercard"); if (c) c.remove(); } catch (_) {}
        // Flyout case: the card lives in its own anchored panel — close + drop it.
        try {
            const pnl = idoc.getElementById && idoc.getElementById("wv-bm-hovercard-panel");
            if (pnl) { try { pnl.hidePopup(); } catch (_) {} try { pnl.remove(); } catch (_) {} }
        } catch (_) {}
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
        // Keep the drag source dimmed across mid-drag re-renders (spring-load).
        if (this._wvBmRowDrag && this._wvBmRowDrag.id === node.id) row.classList.add("wv-bm-dragging");
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
                // Uniform folder zones (collapsed OR expanded) — top 28%
                // = before (sibling above), middle 44% = into (append as
                // last child), bottom 28% = after (sibling below). For
                // expanded folders the "into" zone is the folder header
                // itself (highlighted as a box), so dropping ANYWHERE on
                // the folder's row body appends to the end of its
                // children, matching the user's mental model "drop on
                // folder → last position". Mirror the library-side
                // `modeAt`'s folder zoning so doc + library behave
                // identically. (Earlier versions used `intotop` here for
                // expanded folders to track the first-child slot visually,
                // but that contradicted the "drop on folder = append"
                // intent.)
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
            } else if ((n.type === "position" || n.type === "page"
                    || n.type === "text") && !n.srcItemKey) {
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
    async _wvReaderAddViaDialog(reader: any, idoc: any, section?: string) {
        try {
            const att = this._wvReaderAtt(reader); if (!att) return;
            // `section` controls only the picker's INITIAL focus (current
            // doc for "local", library root for "global"). The
            // destination section is ALWAYS decided by the item's actual
            // nature (`_bmReaderEntrySection`) — clicking "This Document"
            // + and picking an item from a different document still
            // routes the bookmark to "Elsewhere", because Elsewhere
            // bookmarks aren't allowed in the local section.
            const addOpts: any = undefined;
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
            // Focus the file currently in the reader so its annotations
            // are right there to pick — but ONLY when adding to "This
            // Document" (section === "local"). For Elsewhere /
            // Library-scope adds, the user is explicitly looking
            // outside the current doc, so pre-selecting it would just
            // make them navigate away. Skip the focus dance in those
            // cases and let the dialog open at its default location.
            try {
                const attItem: any = att.att || Zotero.Items.get(reader.itemID);
                let hasAnns = false;
                try { hasAnns = !!(attItem && attItem.getAnnotations && attItem.getAnnotations().length); } catch (_) {}
                const focusCurrentDoc = section === "local";
                (async () => {
                    if (!focusCurrentDoc) return;
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
            const add = (rec: any) => this._bmReaderAdd(att.libraryID, att.itemKey, rec, addOpts);
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

    /** Small popup menu anchored to the + button. Two options:
     *    • "Pick item from library…" — the existing picker (current scope-
     *      aware dialog).
     *    • "Add URL or app link…"    — prompts for a URL + label and stores
     *      a `type: "url"` bookmark in the current scope's store.
     *  Reuses the bookmark-pane's existing `RP_BM_CTX_ID` styling for a
     *  consistent look with the right-click context menu. Anchored to the
     *  button's bottom-right; dismissed on outside click / Escape via the
     *  shared `_wvReaderBmCtxDismiss` plumbing. */
    _wvShowReaderBmAddMenu(reader: any, idoc: any, anchor: any, destScope?: string, section?: string) {
        try {
            this._wvCloseReaderBmContextMenu(idoc);
            const menu = idoc.createElementNS(NS_HTML_RP, "div");
            menu.id = RP_BM_CTX_ID;
            const close = () => this._wvCloseReaderBmContextMenu(idoc);
            const mkItem = (label: string, icon: string, fn: () => void) => {
                const it = idoc.createElementNS(NS_HTML_RP, "div");
                it.className = "wv-ctx-item";
                const ic = idoc.createElementNS(NS_HTML_RP, "span");
                ic.className = "wv-ctx-ic";
                ic.innerHTML = icon || "";
                const lb = idoc.createElementNS(NS_HTML_RP, "span");
                lb.textContent = label;
                it.appendChild(ic); it.appendChild(lb);
                it.addEventListener("click", () => { close(); fn(); });
                menu.appendChild(it);
            };
            // destScope overrides the panel's active scope so a per-section
            // + button can route the add unambiguously: "library" for the
            // Library section, "document" for Elsewhere. Without it, fall
            // back to the active scope (legacy single-scope behaviour).
            const target = destScope || this._wvReaderBmScope();
            // No icons yet for either entry — the user said icons can come
            // later. Placeholder empty span keeps layout consistent with
            // the rest of the context menu.
            mkItem("Pick item from library…", "", () => {
                if (target === "library") {
                    Promise.resolve(this._bmAddBookmarksDialog())
                        .then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} })
                        .catch(() => {});
                } else {
                    this._wvReaderAddViaDialog(reader, idoc, section);
                }
            });
            // Suppress "Add Link…" when invoked from "This Document":
            // URL bookmarks always auto-route to "Elsewhere" (per
            // `_bmReaderEntrySection`), so offering it here would
            // create the bookmark in a different section than the
            // user expected — confusing.
            if (section !== "local") {
                mkItem("Add Link…", "", () => {
                    Promise.resolve(this._wvAddUrlBookmark(reader, idoc, target, section))
                        .catch((e: any) => Zotero.debug("[Weavero] add-url-bm err: " + e));
                });
            }
            (idoc.body || idoc.documentElement).appendChild(menu);

            // Anchor under the bottom-LEFT of the button so the menu opens
            // downward like a typical dropdown. Clamp inside viewport.
            const r = anchor.getBoundingClientRect();
            const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
            const vh = (idoc.documentElement && idoc.documentElement.clientHeight) || 9999;
            const mw = menu.offsetWidth || 200, mh = menu.offsetHeight || 70;
            let x = r.left;
            let y = r.bottom + 2;
            if (x + mw > vw - 6) x = Math.max(6, vw - mw - 6);
            if (y + mh > vh - 6) y = Math.max(6, r.top - mh - 2);
            menu.style.left = x + "px";
            menu.style.top = y + "px";

            const onDown = (ev: any) => {
                try {
                    if (ev.target && menu.contains && menu.contains(ev.target)) return;
                    if (ev.target === anchor) return;
                    close();
                } catch (_) {}
            };
            const onKey = (ev: any) => { if (ev.key === "Escape") close(); };
            const docs: any[] = [idoc]; const wins: any[] = [];
            try { const w = idoc.defaultView; if (w) wins.push(w); } catch (_) {}
            for (const d of docs) { try { d.addEventListener("pointerdown", onDown, true); } catch (_) {} }
            for (const w of wins) { try { w.addEventListener("keydown", onKey, true); } catch (_) {} }
            this._wvReaderBmCtxDismiss = { docs, wins, onDown, onKey };
        } catch (e) {
            Zotero.debug("[Weavero] _wvShowReaderBmAddMenu err: " + e);
        }
    }

    /** Prompt the user for a link (Text + URL) and add a bookmark to the
     *  current scope's store. The link can be:
     *    • a web URL                 (http://, https://, …)
     *    • an app-link               (obsidian://, slack://, vscode://, …)
     *    • a Zotero link             (zotero://select/…, zotero://open/…)
     *  Zotero `select` / `open` links are PARSED at save time and stored
     *  as the native bookmark type they correspond to (`item`,
     *  `collection`) — so the icon picker, click handler, and integration
     *  surfaces all match the link's true target rather than treating
     *  every link as a generic URL. Anything else gets the `type: "url"`
     *  record + `Zotero.launchURL` on click. */
    async _wvAddUrlBookmark(reader: any, idoc: any, destScope?: string, section?: string) {
        try {
            await this._bmInit();
            const result = await this._wvShowUrlBookmarkDialog(idoc, { text: "", url: "" });
            if (!result) return;
            const url = result.url;
            const label = result.text;
            const rec = this._wvLinkToBookmarkRec(url, label);
            if (!rec) return;
            // destScope overrides the panel's active scope so a per-section
            // + button can route the add to the correct store ("library"
            // for the Library section, "document" for the doc sections).
            const scope = destScope || this._wvReaderBmScope();
            if (scope === "library") {
                if (!this._bmDoc) return;
                const fresh = Object.assign({
                    id: "wv-" + Zotero.Utilities.randomString(8),
                    created: new Date().toISOString(),
                }, rec);
                this._bmDoc.bookmarks.push(fresh);
                await this._bmPersist();
            } else {
                const att = this._wvReaderAtt(reader);
                if (!att || att.libraryID == null || !att.itemKey) return;
                // URL bookmarks always auto-route to "Elsewhere" via
                // `_bmReaderEntrySection` — no section override even if
                // invoked from a per-section + button.
                await this._bmReaderAdd(att.libraryID, att.itemKey, rec, { allowDuplicate: false });
            }
            if (idoc) this._wvReaderRenderBmList(reader, idoc);
        } catch (e) {
            Zotero.debug("[Weavero] _wvAddUrlBookmark err: " + e);
        }
    }

    /** Edit an existing URL bookmark's display text + URL via the same
     *  two-field dialog the Add Link path uses, pre-filled with the
     *  bookmark's current values. Persists in place — id, created
     *  timestamp, and the bookmark's slot in its parent folder all
     *  survive. Type stays `url` even if the user pastes a
     *  `zotero://select/...` (Add Link auto-converts on FIRST save; we
     *  don't surprise users by mutating an existing bookmark's type
     *  out from under them — delete + re-add to convert). */
    async _wvEditUrlBookmark(reader: any, idoc: any, entry: any, reRender: any) {
        try {
            const result = await this._wvShowUrlBookmarkDialog(idoc, {
                text: entry.label || "",
                url: entry.url || "",
            });
            if (!result) return;
            const url = String(result.url || "").trim();
            if (!url) return;
            const label = String(result.text || "").trim() || url;
            entry.url = url;
            entry.label = label;
            await this._bmPersist();
            try { reRender(); } catch (_) {}
        } catch (e) {
            Zotero.debug("[Weavero] _wvEditUrlBookmark err: " + e);
        }
    }

    /** Convert a user-typed link string into a bookmark record:
     *    • `zotero://select/<lib>/items/<key>`        → `type: "item"`
     *    • `zotero://select/<lib>/collections/<key>`  → `type: "collection"`
     *    • `zotero://select/<lib>/searches/<key>`     → `type: "item"`
     *      (saved searches are rows in Zotero's `items` table)
     *    • `zotero://open/<lib>/items/<key>?…`        → `type: "item"`
     *      (page/annotation query params are stored as-is, lost on
     *      the integration side; click still opens the file at top
     *      via the existing reader-open behaviour)
     *    • anything else                              → `type: "url"`
     *  `<lib>` accepts both `library` (user library) and `groups/<gid>`. */
    _wvLinkToBookmarkRec(url: string, label: string): any {
        const s = String(url || "");
        const m = s.match(
            /^zotero:\/\/(?:select|open)\/((?:library)|(?:groups\/\d+))\/(items|collections|searches)\/([A-Za-z0-9]+)(?:\?(.*))?$/i);
        if (m) {
            const libToken = m[1].toLowerCase();
            const kind = m[2].toLowerCase();
            const key = m[3];
            const query = m[4] || "";
            // `zotero://open/.../items/PARENT?annotation=ANN_KEY` — the
            // PATH key is the parent attachment, the annotation's own
            // key sits in the query string. Store the ANNOTATION as the
            // bookmark target so clicking navigates to that specific
            // location instead of just opening the attachment at page 1.
            let annKey: string | null = null;
            if (query) {
                const qm = query.match(/(?:^|&)annotation=([A-Za-z0-9]+)/);
                if (qm) annKey = qm[1];
            }
            let libraryID: number | null = null;
            try {
                if (libToken === "library") {
                    libraryID = Zotero.Libraries.userLibraryID;
                } else {
                    const gm = libToken.match(/^groups\/(\d+)$/);
                    if (gm) {
                        libraryID = Zotero.Groups.getLibraryIDFromGroupID(parseInt(gm[1], 10)) || null;
                    }
                }
            } catch (_) {}
            if (libraryID != null) {
                if (kind === "collections") {
                    return {
                        type: "collection",
                        libraryID,
                        collectionKey: key,
                        label: label || "",
                    };
                }
                // items + searches both live in the items table
                return {
                    type: "item",
                    libraryID,
                    itemKey: annKey || key,
                    label: label || "",
                };
            }
        }
        // Web / app-link / unparseable zotero link → plain URL bookmark.
        return { type: "url", url, label };
    }

    /** Two-field modal (Text + URL) matching the note-editor's Edit Link
     *  dialog. Lives inside the reader iframe (position:fixed → covers the
     *  iframe viewport). Resolves to `{ text, url }` on Apply, `null` on
     *  Cancel / backdrop click / Escape. Apply is gated on a non-empty
     *  URL; Text auto-fills from a derived label as the user types in
     *  URL, but only while the Text field is empty or still matches the
     *  last derived value (so once the user edits Text manually it stays
     *  put). */
    _wvShowUrlBookmarkDialog(idoc: any, initial: any): Promise<any> {
        return new Promise((resolve) => {
            try {
                const NS = NS_HTML_RP;
                const backdrop = idoc.createElementNS(NS, "div");
                backdrop.className = "wv-bm-url-dialog-backdrop";
                const dlg = idoc.createElementNS(NS, "div");
                dlg.className = "wv-bm-url-dialog";

                const mkRow = (label: string, initialVal: string) => {
                    const row = idoc.createElementNS(NS, "div");
                    row.className = "wv-bm-url-dialog-row";
                    const lbl = idoc.createElementNS(NS, "label");
                    lbl.className = "wv-bm-url-dialog-label";
                    lbl.textContent = label;
                    const input: any = idoc.createElementNS(NS, "input");
                    input.className = "wv-bm-url-dialog-input";
                    input.setAttribute("type", "text");
                    input.value = initialVal || "";
                    row.appendChild(lbl); row.appendChild(input);
                    return { row, input };
                };

                const textRow = mkRow("Text", (initial && initial.text) || "");
                const urlRow = mkRow("URL", (initial && initial.url) || "");

                let lastDerived = "";
                urlRow.input.addEventListener("input", () => {
                    const cur = String(textRow.input.value || "");
                    if (cur === "" || cur === lastDerived) {
                        const derived = this._wvUrlBookmarkDefaultLabel(urlRow.input.value);
                        textRow.input.value = derived;
                        lastDerived = derived;
                    }
                });

                const btnRow = idoc.createElementNS(NS, "div");
                btnRow.className = "wv-bm-url-dialog-btns";
                const cancelBtn: any = idoc.createElementNS(NS, "button");
                cancelBtn.textContent = "Cancel";
                cancelBtn.className = "wv-bm-url-dialog-btn";
                const applyBtn: any = idoc.createElementNS(NS, "button");
                applyBtn.textContent = "Apply";
                applyBtn.className = "wv-bm-url-dialog-btn wv-bm-url-dialog-btn-primary";
                btnRow.appendChild(cancelBtn); btnRow.appendChild(applyBtn);

                dlg.appendChild(textRow.row);
                dlg.appendChild(urlRow.row);
                dlg.appendChild(btnRow);
                backdrop.appendChild(dlg);
                (idoc.body || idoc.documentElement).appendChild(backdrop);

                let resolved = false;
                const finish = (result: any) => {
                    if (resolved) return;
                    resolved = true;
                    try { backdrop.remove(); } catch (_) {}
                    resolve(result);
                };
                const submit = () => {
                    const url = String(urlRow.input.value || "").trim();
                    if (!url) { try { urlRow.input.focus(); } catch (_) {} return; }
                    const text = String(textRow.input.value || "").trim() || url;
                    finish({ text, url });
                };
                cancelBtn.addEventListener("click", () => finish(null));
                applyBtn.addEventListener("click", submit);
                backdrop.addEventListener("click", (e: any) => {
                    if (e.target === backdrop) finish(null);
                });
                const onKey = (e: any) => {
                    if (e.key === "Escape") { e.preventDefault(); finish(null); }
                    else if (e.key === "Enter") { e.preventDefault(); submit(); }
                };
                textRow.input.addEventListener("keydown", onKey);
                urlRow.input.addEventListener("keydown", onKey);

                try { urlRow.input.focus(); urlRow.input.select(); } catch (_) {}
            } catch (e) {
                Zotero.debug("[Weavero] _wvShowUrlBookmarkDialog err: " + e);
                resolve(null);
            }
        });
    }

    /** Derive a friendly default label from a URL/app-link string. For
     *  http(s): use the hostname (drop www.). For app-link schemes (`foo:`
     *  or `foo://path`): use the scheme name capitalised, plus the host or
     *  first path segment if present. Anything unparseable falls back to
     *  the raw URL. */
    _wvUrlBookmarkDefaultLabel(url: string): string {
        try {
            const s = String(url || "");
            // `zotero://(open|select)/<lib>/(items|collections|searches)/<KEY>[?annotation=ANN_KEY]`
            // — resolve the target and mirror the label drag-and-drop /
            // the item picker would set (so the dialog's default text
            // matches what the same bookmark looks like via other paths).
            const zm = s.match(
                /^zotero:\/\/(?:select|open)\/((?:library)|(?:groups\/\d+))\/(items|collections|searches)\/([A-Za-z0-9]+)(?:\?(.*))?$/i);
            if (zm) {
                const libToken = zm[1].toLowerCase();
                const kind = zm[2].toLowerCase();
                const key = zm[3];
                const query = zm[4] || "";
                let annKey: string | null = null;
                if (query) {
                    const qm = query.match(/(?:^|&)annotation=([A-Za-z0-9]+)/);
                    if (qm) annKey = qm[1];
                }
                let libraryID: number | null = null;
                try {
                    if (libToken === "library") libraryID = Zotero.Libraries.userLibraryID;
                    else {
                        const gm = libToken.match(/^groups\/(\d+)$/);
                        if (gm) libraryID = Zotero.Groups.getLibraryIDFromGroupID(parseInt(gm[1], 10)) || null;
                    }
                } catch (_) {}
                if (libraryID != null) {
                    if (kind === "collections") {
                        try {
                            const col: any = Zotero.Collections.getByLibraryAndKey(libraryID, key);
                            if (col && col.name) return String(col.name);
                        } catch (_) {}
                    } else {
                        const targetKey = annKey || key;
                        try {
                            const it: any = Zotero.Items.getByLibraryAndKey(libraryID, targetKey);
                            if (it) {
                                if (it.isAnnotation && it.isAnnotation()) return this._wvReaderAnnLabel(it);
                                const title = (it.getDisplayTitle && it.getDisplayTitle())
                                    || (it.getField && it.getField("title")) || "";
                                if (title) return String(title);
                            }
                        } catch (_) {}
                    }
                }
            }
            const m = s.match(/^([a-z][a-z0-9+.\-]*):(\/\/)?(.*)$/i);
            if (!m) return url;
            const scheme = m[1].toLowerCase();
            const rest = m[3] || "";
            if (scheme === "http" || scheme === "https") {
                const host = rest.split(/[\/?#]/)[0] || "";
                return host.replace(/^www\./i, "") || url;
            }
            const head = rest.split(/[\/?#]/)[0] || "";
            const niceScheme = scheme.charAt(0).toUpperCase() + scheme.slice(1);
            return head ? (niceScheme + " — " + head) : niceScheme;
        } catch (_) { return url; }
    }

    /** Reader-sidebar "Edit Bookmark…": delegates to the shared bookmark editor
     *  (`_bmShowBookmarkEditor`), opened over the reader's chrome window. The
     *  entry can be a per-document reader bookmark ("This document", in the
     *  att's reader doc) OR a collections-pane bookmark surfaced in "Elsewhere"
     *  (the global `_bmDoc.bookmarks` store, which `_bmLocate` searches). Route
     *  each save to the store the entry actually lives in — otherwise an
     *  "Elsewhere" edit silently no-ops against the wrong store. */
    async _wvReaderEditBookmarkDialog(reader: any, att: any, entry: any, reRender: any) {
        const win = reader && reader._window;
        if (!win || !att || !entry) return;
        const reRenderCb = () => { try { reRender(); } catch (_) {} };
        const inGlobalStore = !!this._bmLocate(entry.id);
        const strategy = inGlobalStore ? {
            rename: (title: string) => this._bmRenameBookmark(entry.id, title),
            resetName: () => this._bmResetBookmarkName(entry.id),
            setUrl: (url: string) => this._bmSetUrl(entry.id, url),
            setComment: (comment: string) => this._bmSetComment(entry.id, comment),
            reRender: reRenderCb,
        } : {
            rename: (title: string) => this._bmReaderRename(att.libraryID, att.itemKey, entry.id, title),
            resetName: () => this._bmReaderResetLabel(att.libraryID, att.itemKey, entry.id),
            setUrl: (url: string) => this._bmReaderUpdatePosition(att.libraryID, att.itemKey, entry.id, { url }),
            setComment: (comment: string) => this._bmReaderUpdatePosition(att.libraryID, att.itemKey, entry.id, { comment }),
            reRender: reRenderCb,
        };
        return this._bmShowBookmarkEditor(win, entry, strategy);
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
            // `icon` is one of:
            //   • inline SVG markup       → assign to ic.innerHTML
            //   • chrome:// URL           → fetched + inlined as SVG
            //                               (the reader iframe can't load
            //                               chrome:// images directly)
            //   • data: URI               → wrap in an <img src=…>; would
            //                               otherwise be inserted as text.
            const item = (label: string, icon: string, fn: any) => {
                const it = idoc.createElementNS(NS_HTML_RP, "div"); it.className = "wv-ctx-item";
                const ic = idoc.createElementNS(NS_HTML_RP, "span"); ic.className = "wv-ctx-ic";
                if (icon && icon.indexOf("chrome://") === 0) {
                    ic.classList.add("wv-ctx-ic-native");
                    this._wvChromeIconSvg(icon).then((svg: string) => { try { ic.innerHTML = svg || ""; } catch (_) {} });
                } else if (icon && icon.indexOf("data:") === 0) {
                    const img = idoc.createElementNS(NS_HTML_RP, "img");
                    img.setAttribute("src", icon);
                    img.setAttribute("width", "16");
                    img.setAttribute("height", "16");
                    img.setAttribute("style", "-moz-context-properties:fill;fill:currentColor;");
                    ic.appendChild(img);
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
            // A parent menu item with a hover flyout of children — used for the
            // "Add Bookmark ▸ [Pick item…, Add Link…]" grouping, since adding a
            // link is itself adding a bookmark. `children` is an array of
            // {label, icon, fn}. Mirrors the XUL submenu in the collections-pane.
            const itemSub = (label: string, icon: string,
                children: Array<{ label: string; icon: string; fn: any }>) => {
                const it = idoc.createElementNS(NS_HTML_RP, "div");
                it.className = "wv-ctx-item wv-ctx-haschild";
                const ic = idoc.createElementNS(NS_HTML_RP, "span"); ic.className = "wv-ctx-ic"; ic.innerHTML = icon || "";
                const lb = idoc.createElementNS(NS_HTML_RP, "span"); lb.textContent = label;
                const ar = idoc.createElementNS(NS_HTML_RP, "span"); ar.className = "wv-ctx-arrow"; ar.textContent = "▸";
                it.appendChild(ic); it.appendChild(lb); it.appendChild(ar);
                const fly = idoc.createElementNS(NS_HTML_RP, "div"); fly.className = "wv-ctx-submenu";
                for (const c of children) {
                    const ci = idoc.createElementNS(NS_HTML_RP, "div"); ci.className = "wv-ctx-item";
                    const cic = idoc.createElementNS(NS_HTML_RP, "span"); cic.className = "wv-ctx-ic"; cic.innerHTML = c.icon || "";
                    const clb = idoc.createElementNS(NS_HTML_RP, "span"); clb.textContent = c.label;
                    ci.appendChild(cic); ci.appendChild(clb);
                    ci.addEventListener("click", (ev: any) => { try { ev.stopPropagation(); } catch (_) {} this._wvCloseReaderBmContextMenu(idoc); c.fn(); });
                    fly.appendChild(ci);
                }
                it.appendChild(fly);
                menu.appendChild(it);
            };
            if (this._wvReaderBmScope() === "library") {
                this._wvReaderBuildLibCtxItems(reader, idoc, e, item, sep, reRender, itemSub);
            } else {
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
                    // Unified edit: title + comment together in one dialog.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        this._wvReaderEditBookmarkDialog(reader, att, entry, reRender);
                    });
                    {
                        // Gate on label-vs-original, not the `renamed` flag, so a
                        // previously-renamed bookmark with a stale flag still gets
                        // Reset (matches the collections-pane menu).
                        const orig = this._bmReaderOriginalLabel(entry);
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
                    // Unified edit: title + comment together in one dialog.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        this._wvReaderEditBookmarkDialog(reader, att, entry, reRender);
                    });
                    {
                        // Gate on label-vs-original, not the `renamed` flag, so a
                        // previously-renamed bookmark with a stale flag still gets
                        // Reset (matches the collections-pane menu).
                        const orig = this._bmReaderOriginalLabel(entry);
                        if (orig && orig !== entry.label) {
                            item("Reset to Original Name", RP_REVERT_SVG, () => this._bmReaderResetLabel(att.libraryID, att.itemKey, entry.id).then(reRender));
                        }
                    }
                    item("Delete Bookmark", RP_DELETE_SVG, () => this._bmReaderRemove(att.libraryID, att.itemKey, entry.id).then(reRender));
                }
                sep();
            }
            itemSub("Add Bookmark…", RP_PLUS_SVG, [
                { label: "Pick item from library…", icon: RP_BM_RIBBON_TAB, fn: () => this._wvReaderAddViaDialog(reader, idoc, section) },
                { label: "Add Link…", icon: URL_GLOBE_SVG, fn: () => {
                    Promise.resolve(this._wvAddUrlBookmark(reader, idoc, "document", section))
                        .catch((err: any) => Zotero.debug("[Weavero] add-link err: " + err));
                } },
            ]);
            item("New Folder…", RP_FOLDER_PLUS_SVG, () => {
                const n = this._bmPromptName(Zotero.getMainWindow(), "New Folder", "New Folder");
                if (n) this._bmReaderAddFolder(att.libraryID, att.itemKey, section, n).then(reRender);
            });
            }
            (idoc.body || idoc.documentElement).appendChild(menu);
            const vw = (idoc.documentElement && idoc.documentElement.clientWidth) || 9999;
            const vh = (idoc.documentElement && idoc.documentElement.clientHeight) || 9999;
            let x = e.clientX, y = e.clientY;
            const mw = menu.offsetWidth || 170, mh = menu.offsetHeight || 90;
            if (x + mw > vw - 6) x = Math.max(6, vw - mw - 6);
            if (y + mh > vh - 6) y = Math.max(6, vh - mh - 6);
            menu.style.left = x + "px"; menu.style.top = y + "px";
            // If the menu sits near the right edge, flip any "Add Bookmark"
            // flyout to open leftward so it doesn't overflow the iframe.
            if (x + mw + 190 > vw) {
                try { menu.querySelectorAll(".wv-ctx-submenu").forEach((s: any) => s.classList.add("wv-ctx-submenu-left")); } catch (_) {}
            }
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

    /** Build the context-menu items for the LIBRARY scope (main store) using the
     *  same `item`/`sep` helpers as the reader menu. Open / Show in Library /
     *  Rename / Delete on a row; Rename/New Subfolder/Delete on a folder; plus
     *  Add Library Bookmark… / New Folder… always. All re-render the tree. */
    _wvReaderBuildLibCtxItems(reader: any, idoc: any, e: any, item: any, sep: any, reRender: any, itemSub: any) {
        const win = Zotero.getMainWindow();
        const rowEl = e.target && e.target.closest && e.target.closest(".wv-bm-reader-row");
        const nodeId = rowEl && rowEl.getAttribute("data-wv-bm-id");
        const loc = nodeId ? this._bmLocate(nodeId) : null;
        const entry = loc && loc.entry;
        if (entry) {
            if (entry.type === "folder") {
                item("Rename Folder…", RP_RENAME_SVG, () => {
                    const n = this._bmPromptName(win, "Rename Folder", entry.name || "");
                    if (n) this._bmRenameFolder(entry.id, n).then(reRender);
                });
                item("New Subfolder…", RP_FOLDER_PLUS_SVG, () => {
                    const n = this._bmPromptName(win, "New Folder", "New Folder");
                    if (n) this._bmAddFolder(n, entry.id).then(reRender);
                });
                sep();
                item("Delete Folder", RP_DELETE_SVG, () => {
                    const c = this._bmCountDescendants(entry);
                    if (c > 0) { const ok = Services.prompt.confirm(win, "Delete Folder", 'Delete "' + (entry.name || "") + '" and its ' + c + " item" + (c === 1 ? "" : "s") + "?"); if (!ok) return; }
                    this._bmRemove(entry.id).then(reRender);
                });
            } else {
                // Mirror the row's own icon on the Open menuitem so a URL
                // bookmark shows the globe / external-link glyph (with
                // its baked-in scheme colour), an item bookmark shows
                // the type icon, etc. Earlier code gated this on a
                // `chrome://` prefix — that filtered out the data: URIs
                // `_bmIconInfo` returns for URL bookmarks, which then
                // fell back to the library icon (the columns glyph)
                // regardless of scheme.  HTML menu items handle data
                // URIs fine, so the gate is unnecessary; the library
                // icon is now only the fallback when there's no row
                // icon at all (folders don't reach this branch).
                let openIcon = "";
                try {
                    const im = this._bmIconInfo(entry, win).image;
                    openIcon = im || this._bmShowInLibraryIcon(
                        { libraryID: entry.libraryID }, win);
                } catch (_) {}
                item("Open", openIcon, () => this._bmActivateBookmark(entry, {}));
                // Library bookmarks point at the library itself — "Show in
                // Library" would just select the library, which is exactly
                // what "Open" already does. Suppress the redundant entry.
                if (entry.type !== "library") {
                    item("Show in Library", this._bmShowInLibraryIcon({ libraryID: entry.libraryID }, win), () => this._bmShowInLibrary(entry));
                }
                sep();
                if (entry.type === "url") {
                    // URL bookmarks have TWO mutable fields (display text +
                    // URL), so a plain rename prompt would only let the user
                    // touch half of it. Open the same two-field dialog the
                    // Add Link path uses, pre-filled with the current values.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        this._wvEditUrlBookmark(reader, idoc, entry, reRender);
                    });
                } else {
                    // Title + (annotation bookmarks) the annotation comment,
                    // together — same combined dialog as the library popup.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        const rw = (reader && reader._window) || win;
                        this._bmEditBookmarkDialog(rw, entry, reRender);
                    });
                }
                item("Delete Bookmark", RP_DELETE_SVG, () => this._bmRemove(entry.id).then(reRender));
            }
            sep();
        }
        itemSub("Add Library Bookmark…", RP_PLUS_SVG, [
            { label: "Pick item from library…", icon: RP_BM_RIBBON_TAB, fn: () => {
                Promise.resolve(this._bmAddBookmarksDialog()).then(reRender).catch(() => {});
            } },
            { label: "Add Link…", icon: URL_GLOBE_SVG, fn: () => {
                Promise.resolve(this._wvAddUrlBookmark(reader, idoc, "library"))
                    .catch((err: any) => Zotero.debug("[Weavero] add-link err: " + err));
            } },
        ]);
        item("New Folder…", RP_FOLDER_PLUS_SVG, () => {
            const n = this._bmPromptName(win, "New Folder", "New Folder");
            if (n) this._bmAddFolder(n).then(reRender);
        });
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
                // Menu items are scope-aware: when the bookmarks panel's
                // Library tab is the active scope, the right-click items
                // add to the library store (with a src ref to this doc)
                // instead of the per-doc store. Label reflects scope so
                // the action is unambiguous.
                const activeScope = this._wvReaderBmScope();
                const isLib = activeScope === "library";
                const LABEL = isLib
                    ? "Add Library Bookmark to This Position"
                    : "Add Bookmark to This Position";
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

                // Collect the bookmark items and append them in ONE
                // group (each `append(...)` call from the reader plugin
                // API becomes a separate visual group / separator). The
                // pin-position entry plus the PDF-only page entry sit
                // together as "Add Bookmark to …" siblings.
                const bmItems: any[] = [
                    { label: LABEL, onCommand: () => this._wvReaderAddCurrentBookmark(reader, idoc, click, activeScope) },
                ];

                // "Add Bookmark to This Page" — PDF-only sibling of the
                // pin-position entry. Same record shape as the thumbnails
                // menu entry (`position.pageIndex` with no rects → whole-
                // page → ribbon icon, label resolves via pageIndex + 1).
                // Page resolution mirrors the copy-link entry: clicked
                // position → `.page:hover` element → viewport-top page,
                // resolved at popupshowing time so the captured pageIndex
                // is correct even if the popup lingers.
                let LABEL_PAGE: string | null = null;
                if (reader._type === "pdf") {
                    let pageIndex: number | null = null;
                    try {
                        const p = event.params || {};
                        const pp = p.position || (p.overlay && p.overlay.position);
                        if (pp && Number.isInteger(pp.pageIndex) && pp.pageIndex >= 0) {
                            pageIndex = pp.pageIndex;
                        }
                    } catch (_) {}
                    if (pageIndex == null) {
                        try {
                            const hovered = idoc && idoc.querySelector
                                && idoc.querySelector(".page:hover");
                            const pageDiv = hovered
                                && (hovered.matches && hovered.matches(".page")
                                    ? hovered
                                    : hovered.closest && hovered.closest(".page"));
                            const n = pageDiv && parseInt(
                                pageDiv.getAttribute("data-page-number"), 10);
                            if (Number.isInteger(n) && n >= 1) pageIndex = n - 1;
                        } catch (_) {}
                    }
                    if (pageIndex == null) {
                        try {
                            const stats = reader._internalReader
                                && reader._internalReader._state
                                && reader._internalReader._state.primaryViewStats;
                            if (stats && Number.isInteger(stats.pageIndex)
                                && stats.pageIndex >= 0) {
                                pageIndex = stats.pageIndex;
                            }
                        } catch (_) {}
                    }
                    if (pageIndex == null) pageIndex = 0;
                    const piCaptured = pageIndex;
                    const att = this._wvReaderAtt(reader);
                    if (att && att.libraryID != null && att.itemKey) {
                        LABEL_PAGE = isLib
                            ? "Add Library Bookmark to This Page"
                            : "Add Bookmark to This Page";
                        bmItems.push({
                            label: LABEL_PAGE,
                            onCommand: async () => {
                                try {
                                    const pageLabel = String(piCaptured + 1);
                                    const rec: any = {
                                        type: "page",
                                        viewType: "pdf",
                                        location: { pageIndex: piCaptured },
                                        position: { pageIndex: piCaptured },
                                        pageLabel,
                                        label: "Page " + pageLabel,
                                    };
                                    if (isLib) {
                                        await this._bmInit();
                                        const node = Object.assign({
                                            id: "wv-" + Zotero.Utilities.randomString(8),
                                            srcLibraryID: att.libraryID,
                                            srcItemKey: att.itemKey,
                                            created: new Date().toISOString(),
                                        }, rec);
                                        this._bmDoc.bookmarks.push(node);
                                        await this._bmPersist();
                                    } else {
                                        await this._bmReaderAdd(att.libraryID, att.itemKey, rec, { allowDuplicate: true });
                                    }
                                    if (idoc) this._wvReaderRenderBmList(reader, idoc);
                                } catch (e) {
                                    Zotero.debug("[Weavero] view-menu Add Page Bookmark err: " + e);
                                }
                            },
                        });
                    }
                }

                append(...bmItems);
                this._wvReaderStampMenuIcon(reader, LABEL, this._wvReaderPinMenuIconURL());
                if (LABEL_PAGE) this._wvReaderStampMenuIcon(reader, LABEL_PAGE, icon);
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderViewContextMenu err: " + e); }
    }

    /** Bookmark-ribbon data URI for the reader context-menu icon, themed to
     *  the reader window (the menu lives in chrome, so a baked-colour data URI
     *  is simplest). SOLID-FILLED ribbon — same shape as the page-bookmark
     *  row icon (BM_PAGE_ICON / RP_BM_RIBBON) so the "Add Bookmark to This
     *  Page" menu item stays visually consistent with what it creates. */
    _wvReaderBmMenuIconURL() {
        let dark = true;
        try { dark = this._detectUIDark(); } catch (_) {}
        const color = dark ? "#e3e3e3" : "#555555";
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" '
            + 'viewBox="0 0 16 16" fill="' + color + '">'
            + '<path d="M4 1H12V15L8 12L4 15Z"/></svg>';
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

    // ---- Outline text highlight (in-place, no scroll, no flash) -----------
    // Clicking a PDF outline (table-of-contents) entry flashes the actual HEADING
    // TEXT, not just the page. When a PDF has its OWN embedded outline, each entry's
    // destination is only a POINT, so Zotero scrolls there but its highlight (zero
    // area) lands on nothing — the gap this fills. Navigation runs unchanged (honors
    // the real dest); we then recover the heading's bounding box and paint the
    // highlight IN PLACE (see _wvOutlinePaint — avoids a second scroll / full-page
    // flash). Wiring lives in _wvOutlineInstallRecovery.
    //
    // CREDIT & SOURCES — built on Zotero's open-source reader (AGPL-3.0, the same
    // licence as Weavero). We REUSE, but do not reimplement, Zotero's machinery:
    //   * Per-glyph text data — `_pdfPages[i].chars` (exact glyph rects) comes from
    //     Zotero's TEXT ANALYZER, fetched by the reader via getProcessedData() /
    //     getPageData(). Those are siblings of getOutline2(), all introduced in one
    //     direct commit (Zotero maintains its pdf.js/reader forks by direct pushes,
    //     NOT pull requests): zotero/pdf.js@2ec80d8581 "Implement text analyzer"
    //     (Martynas Bagdonas / mrtcode, 2023-03-09).
    //     https://github.com/zotero/pdf.js/commit/2ec80d8581
    //   * In-place highlight + outline navigation — navigateToPosition,
    //     _highlightPosition / _highlightedPosition — are zotero/reader's:
    //     https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js
    // What is NEW here is only the JOIN: matching the embedded outline's title text
    // against the analyzer's glyph rects to recover the heading box. Zotero's
    // getOutline2 yields rectangles only for the text-analyzer-EXTRACTED outline
    // (PDFs with no embedded TOC); an embedded TOC passes through as bare points and
    // never highlights — a gap Zotero acknowledged but never shipped a fix for.
    // Feature discussion: forums.zotero.org/discussion/122030 (the highlight-timer
    // inconsistency this also works around), zotero/zotero#2285 (TOC extraction),
    // zotero/zotero#3752 (highlight the current outline item — still open).

    /** True if a position is a degenerate (zero-area) rect — a bare dest point. */
    _wvOutlineIsPointRect(position: any): boolean {
        try {
            const r = position && Array.isArray(position.rects) && position.rects[0];
            if (!r || r.length < 4) return false;
            return r[0] === r[2] && r[1] === r[3];
        } catch (_) { return false; }
    }

    /** Title of the outline entry for a navigation `location`. The reader passes
     *  a structurally-equal COPY (not the tree's own object), so reference
     *  identity fails — match by VALUE: same pageIndex + same dest point. */
    _wvOutlineFindTitle(outline: any, location: any): string {
        try {
            const pos = location && location.position;
            const pi = pos && pos.pageIndex;
            const r = pos && pos.rects && pos.rects[0];
            const stack = Array.isArray(outline) ? outline.slice() : [];
            while (stack.length) {
                const it = stack.shift();
                if (!it) continue;
                if (it.location === location) return String(it.title || "");
                const ip = it.location && it.location.position;
                const ir = ip && ip.rects && ip.rects[0];
                if (ip && r && ir && ip.pageIndex === pi
                        && Math.abs(ir[0] - r[0]) < 0.5 && Math.abs(ir[1] - r[1]) < 0.5) {
                    return String(it.title || "");
                }
                if (Array.isArray(it.items) && it.items.length) stack.push(...it.items);
            }
        } catch (_) {}
        return "";
    }

    /** Normalise for fuzzy title↔page-text matching: NFKC, lowercase, keep only
     *  letters/digits (drops whitespace + punctuation like "1." vs "1"). */
    _wvOutlineNorm(s: string): string {
        try {
            let t = String(s == null ? "" : s);
            if ((t as any).normalize) t = t.normalize("NFKC");
            t = t.toLowerCase();
            try { return t.replace(/[^\p{L}\p{N}]+/gu, ""); }
            catch (_) { return t.replace(/[^a-z0-9]+/g, ""); }
        } catch (_) { return ""; }
    }

    /** A REAL pdf.js page proxy (one with getTextContent). Zotero wraps
     *  `app.pdfDocument`, stripping getTextContent, so reach the genuine proxy
     *  via the rendered page view, else the viewer's own document proxy. */
    async _wvOutlineGetPdfPage(app: any, pageIndex: number): Promise<any> {
        try {
            const pageView = app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            const pp = pageView && pageView.pdfPage;
            if (pp && typeof pp.getTextContent === "function") return pp;
        } catch (_) {}
        try {
            const vd = app.pdfViewer.pdfDocument;
            if (vd && typeof vd.getPage === "function") {
                const p = await vd.getPage(pageIndex + 1);
                if (p && typeof p.getTextContent === "function") return p;
            }
        } catch (_) {}
        return null;
    }

    /** Recover the heading title's bounding box AND the page it sits on (PDF
     *  points, bottom-left origin). Matches the (punctuation-insensitive) title
     *  against the page text, preferring — in order — the FULL numbered title over
     *  the bare stripped form (so a section heading wins over body prose like
     *  "…a similar conclusion was reached…"), the DEST page over its neighbours,
     *  and on the dest page the occurrence nearest the dest y. Also searches the
     *  NEIGHBOUR the dest point leans toward (dest near page bottom → next page
     *  top; near top → previous page), because a PDF's outline destination often
     *  points a hair before the heading and lands on the adjacent page. Returns
     *  { rect, pageIndex } or null. Best-effort; scanned / odd-font pages may miss. */
    async _wvOutlineRecoverRect(pv: any, pageIndex: number, destX: number, destY: number, title: string): Promise<{ rect: number[]; pageIndex: number } | null> {
        try {
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            if (!app || !app.pdfViewer) return null;
            const numPages = (app.pdfViewer._pages && app.pdfViewer._pages.length) || 0;

            const candidates: string[] = [];
            const full = this._wvOutlineNorm(title);
            if (full.length >= 2) candidates.push(full);
            const stripped = String(title == null ? "" : title)
                .replace(/^\s*[\divxlcdmIVXLCDM]+[.\d]*[\s.):–—-]+/, "");
            const noNum = this._wvOutlineNorm(stripped);
            if (noNum.length >= 3 && noNum !== full) candidates.push(noNum);
            if (!candidates.length) return null;

            // Per-page tokeniser (cached so each page is built at most once across
            // both candidate passes). PREFERRED source: the reader's OWN structured
            // chars (`_pdfPages[pi].chars`) — their `.rect` is the exact glyph box
            // used for text selection, so the highlight lines up with a manual
            // selection. FALLBACK: pdf.js getTextContent run boxes (baseline-derived,
            // sits a little high) when chars aren't available.
            const cache = new Map<number, any>();
            const tokensFor = async (pi: number) => {
                if (cache.has(pi)) return cache.get(pi);
                const toks: any[] = [];
                try { if (typeof pv._ensureBasicPageData === "function") await pv._ensureBasicPageData(pi); } catch (_) {}
                let chars: any = null;
                try { chars = pv._pdfPages && pv._pdfPages[pi] && pv._pdfPages[pi].chars; } catch (_) {}
                if (chars && chars.length) {
                    for (const ch of chars) {
                        const c = ch && ch.c, rc = ch && ch.rect;
                        if (!c || !rc) continue;
                        const nn = this._wvOutlineNorm(c);
                        if (!nn) continue;
                        toks.push({ n: nn, x0: rc[0], y0: rc[1], x1: rc[2], y1: rc[3] });
                    }
                }
                if (!toks.length) {
                    const page = await this._wvOutlineGetPdfPage(app, pi);
                    if (page && typeof page.getTextContent === "function") {
                        const tc = await page.getTextContent();
                        for (const it of ((tc && tc.items) || [])) {
                            const s = it && it.str;
                            if (!s) continue;
                            const nn = this._wvOutlineNorm(s);
                            if (!nn) continue;
                            const tr = it.transform || [1, 0, 0, 1, 0, 0];
                            const x0 = tr[4], yb = tr[5], w = it.width || 0, h = it.height || 0;
                            toks.push({ n: nn, x0, y0: yb, x1: x0 + w, y1: yb + h });
                        }
                    }
                }
                let concat = "";
                const map: number[] = [];
                for (let i = 0; i < toks.length; i++) {
                    for (let k = 0; k < toks[i].n.length; k++) { concat += toks[i].n[k]; map.push(i); }
                }
                const data = toks.length ? { toks, concat, map } : null;
                cache.set(pi, data);
                return data;
            };

            // Best occurrence of `target` on one page → bounding box. With `refY`
            // (the dest page), pick the occurrence whose top is nearest refY; else
            // (a neighbour) the TOPMOST occurrence, since a section heading sits high.
            const matchOnPage = (data: any, target: string, refY: number | null): number[] | null => {
                if (!data) return null;
                const { toks, concat, map } = data;
                let best: number[] | null = null, bestScore = Infinity;
                let from = 0, idx: number;
                while ((idx = concat.indexOf(target, from)) !== -1) {
                    const startTok = map[idx], endTok = map[idx + target.length - 1];
                    const topY = toks[startTok].y1;
                    const score = refY != null ? Math.abs(topY - refY) : -topY;   // -topY → higher on page wins
                    if (score < bestScore) { bestScore = score; best = [startTok, endTok]; }
                    from = idx + 1;
                }
                if (!best) return null;
                let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
                for (let i = best[0]; i <= best[1]; i++) {
                    if (toks[i].x0 < X0) X0 = toks[i].x0;
                    if (toks[i].y0 < Y0) Y0 = toks[i].y0;
                    if (toks[i].x1 > X1) X1 = toks[i].x1;
                    if (toks[i].y1 > Y1) Y1 = toks[i].y1;
                }
                if (!isFinite(X0) || !isFinite(Y0) || !isFinite(X1) || !isFinite(Y1)) return null;
                return [X0, Y0, X1, Y1];
            };

            // Page search order: dest page, then the neighbour the dest leans toward.
            let pageHeight = 0;
            try { pageHeight = app.pdfViewer._pages[pageIndex].viewport.viewBox[3]; } catch (_) {}
            const nearBottom = pageHeight ? (destY < pageHeight / 2) : true;
            const order = [pageIndex];
            for (const np of (nearBottom ? [pageIndex + 1, pageIndex - 1] : [pageIndex - 1, pageIndex + 1])) {
                if (np >= 0 && np < numPages) order.push(np);
            }

            // Prefer the FULL candidate ANYWHERE over the stripped one; within a
            // candidate, the earliest page in `order` (dest first) wins.
            for (const target of candidates) {
                for (const pi of order) {
                    const data = await tokensFor(pi);
                    const box = matchOnPage(data, target, pi === pageIndex ? destY : null);
                    if (box) return { rect: box, pageIndex: pi };
                }
            }
            return null;
        } catch (_) { return null; }
    }

    /** Scroll the reader so the recovered heading `rect` (PDF points, bottom-left
     *  origin) on `pageIndex` sits near the top of the viewport. Done by setting
     *  the viewer container's `scrollTop` DIRECTLY — the reader's own
     *  `navigateToPosition` throws across the chrome↔content Xray boundary
     *  (`_pages[pageIndex]` reads as undefined even when the page is laid out), but
     *  a plain DOM scroll property works. Falls back to `currentPageNumber` when the
     *  page view isn't laid out yet. Returns true on a precise scroll. */
    _wvOutlineScrollToRect(pv: any, pageIndex: number, rect: number[]): boolean {
        try {
            const win = pv && pv._iframeWindow;
            const app = win && win.PDFViewerApplication;
            const viewer = app && app.pdfViewer;
            const container = win && win.document && win.document.getElementById("viewerContainer");
            if (!viewer || !container) return false;
            const pageView = viewer._pages && viewer._pages[pageIndex];
            const vp = pageView && pageView.viewport;
            if (!pageView || !pageView.div || !vp) {
                try { viewer.currentPageNumber = pageIndex + 1; } catch (_) {}   // at least the right page
                return false;
            }
            const scale = vp.scale || viewer.currentScale || 1;
            const pageHeightPts = (vp.viewBox && vp.viewBox[3]) || 0;
            const fromTopPts = pageHeightPts - rect[3];   // rect[3] = y1 = heading top edge
            const headingTopDocY = pageView.div.offsetTop + fromTopPts * scale;
            // Place the heading ONE QUARTER down from the top of the view. This is the
            // single consistent rule for ALL outline clicks (embedded + extracted) —
            // deliberately neither native's top-align (`block: 'start'`, outline
            // sidebar) nor its centre (`block: 'center'`, search/annotations).
            const target = headingTopDocY - (container.clientHeight / 4);
            container.scrollTop = Math.max(0, target);
            return true;
        } catch (e) { return false; }
    }

    /** The reader LAYER page object bound to the LIVE pdf.js page view for
     *  `pageIndex` (match by `_originalPage` identity — indexing the pool gives
     *  stale entries whose canvas is detached). Null if not currently built. */
    _wvOutlineLiveLayer(pv: any, pageIndex: number): any {
        try {
            const app = pv._iframeWindow && pv._iframeWindow.PDFViewerApplication;
            const live = app && app.pdfViewer && app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            if (!live) return null;
            const ps = pv._pages || [];
            for (let i = 0; i < ps.length; i++) {
                if (ps[i] && ps[i]._originalPage === live) return ps[i];
            }
        } catch (_) {}
        return null;
    }

    /** Paint (or, with posOrNull = null, clear) the highlight IN PLACE — no
     *  scroll, no flash. Sets `_highlightedPosition` (must be an iframe-compartment
     *  object — see caller's cloneInto), then re-composites ONLY the overlay onto
     *  the page's existing canvas via the live layer's `refresh(false)` (busting
     *  its signature cache first). NOT `reset()`+`draw()`, which re-renders the
     *  pdf.js content and flashes the whole page.
     *
     *  In-place highlight technique, outline navigation and TOC extraction are
     *  derived from / call into Zotero's own reader (AGPL-3.0):
     *  https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js */
    _wvOutlinePaint(pv: any, pageIndex: number, posOrNull: any) {
        try {
            pv._highlightedPosition = posOrNull;
            const layer = this._wvOutlineLiveLayer(pv, pageIndex);
            if (layer) {
                try { if (layer._pageRenderer) layer._pageRenderer._lastRenderSignature = null; } catch (_) {}
                try { layer.refresh(false); } catch (_) {}
            }
        } catch (_) {}
    }

    /** Flash the recovered heading box in place once the page view is fully
     *  rendered (renderingState 3). Clones the position into the iframe
     *  compartment (chrome objects read as undefined there → no paint), paints,
     *  and auto-clears after ~2s. Polls briefly for the page to finish rendering.
     *
     *  `gen` is the click generation (`pv._wvHlSeq`): a click that's been
     *  superseded by a newer one aborts (so a slow older recovery can't paint
     *  over a newer highlight). The 2s clear is a SINGLE timer per view,
     *  cancelled + rescheduled on each paint — so rapid clicks behave
     *  consistently (the timer is reset to 2s from the latest highlight) and a
     *  prior highlight left on another page is cleared.
     *
     *  `rects` is an array of [x0,y0,x1,y1] (one per line for a multi-line text
     *  selection; a single entry for an outline heading box). */
    _wvOutlineHighlightInPlace(pv: any, pageIndex: number, rects: number[][], gen: number, tries?: number) {
        if (pv._wvHlSeq !== gen) return;   // superseded by a newer click
        const n = tries || 0;
        let ready = false;
        try {
            const app = pv && pv._iframeWindow && pv._iframeWindow.PDFViewerApplication;
            const pView = app && app.pdfViewer && app.pdfViewer._pages && app.pdfViewer._pages[pageIndex];
            ready = !!(pView && pView.viewport && pView.div && pView.renderingState === 3);
        } catch (_) {}
        const w: any = Zotero.getMainWindow();
        const st: any = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
        if (ready) {
            try {
                // Cancel the prior clear timer and clear a highlight still
                // showing on a different page, then paint and (re)start the 2s.
                try { if (pv._wvHlClearTimer && w && w.clearTimeout) w.clearTimeout(pv._wvHlClearTimer); } catch (_) {}
                pv._wvHlClearTimer = null;
                if (pv._wvHlPage != null && pv._wvHlPage !== pageIndex) {
                    this._wvOutlinePaint(pv, pv._wvHlPage, null);
                }
                const clean = (rects || []).map((r: any) => [r[0], r[1], r[2], r[3]]);
                const pos = (Components as any).utils.cloneInto({ pageIndex, rects: clean }, pv._iframeWindow);
                this._wvOutlinePaint(pv, pageIndex, pos);
                pv._wvHlPage = pageIndex;
                pv._wvHlClearTimer = st(() => {
                    if (pv._wvHlSeq === gen) { this._wvOutlinePaint(pv, pageIndex, null); pv._wvHlPage = null; }
                    pv._wvHlClearTimer = null;
                }, 2000);
            } catch (_) {}
            return;
        }
        if (n < 60) {
            st(() => this._wvOutlineHighlightInPlace(pv, pageIndex, rects, gen, n + 1), 150);
        }
    }

    /** Wrap a reader primary view's `navigate` so an outline click flashes the
     *  heading text consistently — for EMBEDDED outlines (recover the heading box
     *  from a bare-point dest) and EXTRACTED outlines (use the entry's own rect),
     *  both via our own reset-on-each-click timer (works around the native
     *  rapid-click bug, Zotero forums #122030). Gated at click time on
     *  `weavero.enableOutlineTextHighlight` (default on). Idempotent per view;
     *  captures the true original navigate once for clean re-install; reads the
     *  live plugin so it survives reloads. */
    _wvOutlineInstallRecovery(reader: any, tries?: number) {
        const n = tries || 0;
        let pv: any = null;
        try { const ir = reader && reader._internalReader; pv = ir && ir._primaryView; } catch (_) {}
        if (pv && typeof pv.navigate === "function") {
            if (pv._wvOutlineWired) return;
            try {
                pv._wvOutlineWired = true;
                if (!pv._wvOutlineOrigNavigate) pv._wvOutlineOrigNavigate = pv.navigate.bind(pv);
                const origNavigate = pv._wvOutlineOrigNavigate;
                pv.navigate = function (location: any, options: any) {
                    let handled = false;
                    try {
                        const plugin: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                        // Handle ANY outline click — embedded (bare-point dest)
                        // OR extracted (real heading rect). We identify it as an
                        // outline click by matching the location to an outline
                        // entry (non-empty title). Opt-in via the toggle.
                        if (plugin && typeof plugin._getEnableOutlineTextHighlight === "function"
                                && plugin._getEnableOutlineTextHighlight()
                                && location && location.position
                                && location.position.rects && location.position.rects.length) {
                            const title = plugin._wvOutlineFindTitle(pv._outline, location);
                            if (title) {
                                handled = true;
                                const pi = location.position.pageIndex;
                                // New click generation — supersedes any in-flight
                                // recovery/highlight from a previous click.
                                const gen = (pv._wvHlSeq = (pv._wvHlSeq || 0) + 1);
                                // Scroll to the dest WITHOUT the reader's native
                                // flash. The native _highlightPosition arms an
                                // unconditional 2s timer that nulls
                                // _highlightedPosition — and on rapid clicks an
                                // earlier click's timer wipes a later click's
                                // highlight (native bug, Zotero forums #122030).
                                // We do the scroll and fully own the highlight +
                                // its (reset-on-each-click) timer — fixing the
                                // inconsistency for BOTH outline kinds.
                                // Record the manual navigation (history + suppress the
                                // reader's own scroll-spy) up front; the actual scroll is
                                // done per-branch below.
                                const markNav = function () {
                                    try {
                                        if (!(options && options.skipHistory) && typeof pv._onManualNavigation === "function") {
                                            try { pv._onManualNavigation(); } catch (_) {}
                                        }
                                        try { pv._lastNavigationTime = Date.now(); } catch (_) {}
                                    } catch (_) {}
                                };
                                // Plain dest scroll (native-style centre on the bare point) —
                                // the fallback when there's nothing better to aim at.
                                const destScroll = function () {
                                    markNav();
                                    try { pv.navigateToPosition(location.position, options); }
                                    catch (e) { try { origNavigate(location, options); } catch (_) {} }
                                };
                                if (plugin._wvOutlineIsPointRect(location.position)) {
                                    // Embedded: the dest is a bare POINT, often a hair before
                                    // the heading (sometimes on the previous page). Recover the
                                    // heading's real box and scroll DIRECTLY to it in ONE move —
                                    // no dest pre-scroll. The page views are laid out on
                                    // document load, so _wvOutlineScrollToRect can compute the
                                    // offset (via div.offsetTop) without the page being rendered
                                    // first. Doing both scrolls used to flicker: the view jumped
                                    // to the bare point, then re-jumped to the recovered heading.
                                    // Recovery is data-only (no scroll), so we just wait for it.
                                    const r = location.position.rects[0];
                                    Promise.resolve(
                                        plugin._wvOutlineRecoverRect(pv, pi, r[0], r[1], title)
                                    ).then(function (res: any) {
                                        if (pv._wvHlSeq !== gen) return;   // superseded by a newer click
                                        if (!res) { destScroll(); return; }   // nothing recovered → plain dest scroll
                                        markNav();
                                        // Scroll the heading into view via a direct DOM scroll
                                        // (navigateToPosition throws across the Xray boundary).
                                        try { plugin._wvOutlineScrollToRect(pv, res.pageIndex, res.rect); } catch (_) {}
                                        plugin._wvOutlineHighlightInPlace(pv, res.pageIndex, [res.rect], gen, 0);
                                    }).catch(function () { try { destScroll(); } catch (_) {} });
                                } else {
                                    // Extracted: the entry already carries the real heading rect
                                    // on the dest page. Scroll DIRECTLY to it one-third down (the
                                    // SAME rule as the embedded case) in ONE move — NOT native's
                                    // block:'start' top-jump — so both outline kinds land
                                    // identically and there's no flicker. Fall back to the native
                                    // nav only if the page isn't laid out yet.
                                    const rr = location.position.rects[0];
                                    markNav();
                                    if (!plugin._wvOutlineScrollToRect(pv, pi, rr)) {
                                        try { pv.navigateToPosition(location.position, options); }
                                        catch (e) { try { origNavigate(location, options); } catch (_) {} }
                                    }
                                    plugin._wvOutlineHighlightInPlace(pv, pi, [[rr[0], rr[1], rr[2], rr[3]]], gen, 0);
                                }
                            }
                        }
                    } catch (_) {}
                    if (!handled) return origNavigate(location, options);
                };
            } catch (_) {}
            return;
        }
        if (n < 40) {
            const w: any = Zotero.getMainWindow();
            const st: any = (w && w.setTimeout) ? w.setTimeout.bind(w) : setTimeout;
            st(() => this._wvOutlineInstallRecovery(reader, n + 1), 150);
        }
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
                                // Use the SAME page-label resolver the row /
                                // hover-card / sync paths use, so a moved pin
                                // stores a label that matches whatever the
                                // bookmarks list will show. This is the
                                // annotation-style label (same-page annotation
                                // or pageIndex+1), NOT pv._pageLabels (which
                                // would diverge from the annotations sidebar).
                                const probeBm: any = { type: "position", id: bmId,
                                    position: newPos, srcLibraryID: att.libraryID, srcItemKey: att.itemKey };
                                const pageLabel = this._bmReaderPageLabel(probeBm)
                                    || String((newPos.pageIndex || 0) + 1);
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

    async _wvReaderAddCurrentBookmark(reader: any, idoc: any, click?: any, scope?: string) {
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
            let entry: any;
            if (scope === "library") {
                // Library scope: push directly to the library store with a
                // src ref pointing at this document, so clicking the bookmark
                // re-opens this attachment at the captured position.
                await this._bmInit();
                const node: any = Object.assign({
                    id: "wv-" + Zotero.Utilities.randomString(8),
                    srcLibraryID: att.libraryID,
                    srcItemKey: att.itemKey,
                    created: new Date().toISOString(),
                }, rec);
                this._bmDoc.bookmarks.push(node);
                await this._bmPersist();
                entry = node;
            } else {
                entry = await this._bmReaderAdd(att.libraryID, att.itemKey, rec);
            }
            this._wvReaderRenderBmList(reader, idoc);
            // Show the pin overlay at the just-added spot so the user
            // sees it land — same temporary marker as clicking the row
            // (PDF-only; EPUB/snapshot have no rects-based overlay and
            // `_wvReaderShowPin` returns early there).
            if (entry && entry.type === "position" && entry.position) {
                try { this._wvReaderShowPin(reader, entry.position, entry.id); } catch (_) {}
            }
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

    /** PDF only: scroll to a stored text-selection bookmark and flash its rects
     *  via the in-place highlighter (consistent reset-on-each-click timer, no
     *  native flash-timer bug). Clones the position into the iframe compartment
     *  for the scroll (chrome objects read as undefined there). Returns true if
     *  handled; false (non-PDF / bad position / failure) → caller falls back to
     *  the native `reader.navigate({position})`. */
    _wvReaderHighlightTextBookmark(reader: any, position: any): boolean {
        try {
            const ir = reader && reader._internalReader;
            const pv = ir && (ir._primaryView || ir._lastView);
            const iwin = pv && pv._iframeWindow;
            const app = iwin && iwin.PDFViewerApplication;
            if (!pv || !app || !app.pdfViewer) return false;   // not a PDF view
            if (!position || !Number.isInteger(position.pageIndex)
                    || !Array.isArray(position.rects) || !position.rects.length) return false;
            const pi = position.pageIndex;
            const rects = position.rects.map((r: any) => [r[0], r[1], r[2], r[3]]);
            const gen = (pv._wvHlSeq = (pv._wvHlSeq || 0) + 1);
            // Scroll WITHOUT the native flash (which arms the buggy 2s timer).
            try {
                if (typeof pv._onManualNavigation === "function") { try { pv._onManualNavigation(); } catch (_) {} }
                try { pv._lastNavigationTime = Date.now(); } catch (_) {}
                const cpos = (Components as any).utils.cloneInto({ pageIndex: pi, rects }, iwin);
                const copts = (Components as any).utils.cloneInto({ block: "center" }, iwin);
                pv.navigateToPosition(cpos, copts);
            } catch (e) {
                try { reader.navigate({ position: position }); return true; } catch (_) { return false; }
            }
            this._wvOutlineHighlightInPlace(pv, pi, rects, gen, 0);
            return true;
        } catch (_) { return false; }
    }

    _wvNavigateReaderLocation(reader: any, bm: any) {
        try {
            // Whole-page bookmark — scroll the named page to the top,
            // no pin marker (the bookmark isn't a precise spot). The
            // page index can live in `position.pageIndex` (new records
            // also set it for `_bmReaderPageLabel`) or `location.pageIndex`
            // (the canonical field).
            if (bm && bm.type === "page") {
                const pi = (bm.position && Number.isInteger(bm.position.pageIndex))
                    ? bm.position.pageIndex
                    : (bm.location && Number.isInteger(bm.location.pageIndex))
                        ? bm.location.pageIndex
                        : null;
                if (pi != null) {
                    try { reader.navigate({ pageIndex: pi }); } catch (_) {}
                }
                return;
            }
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
                // text. For PDF, when the outline-highlight toggle is on, route
                // through Weavero's in-place highlighter (consistent timer, no
                // native rapid-click bug); otherwise / for EPUB / snapshot, fall
                // back to the native navigate.
                if (this._getEnableOutlineTextHighlight && this._getEnableOutlineTextHighlight()
                        && this._wvReaderHighlightTextBookmark(reader, bm.position)) {
                    return;
                }
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

    /** Register a `createThumbnailContextMenu` listener on Zotero.Reader so
     *  the PDF Thumbnails sidebar's right-click menu gains two Weavero
     *  entries:
     *
     *    • "Add Bookmark to This Page" — gated by `enableReaderBookmarks`.
     *      Creates a position bookmark for the right-clicked page (or one
     *      per page in a multi-select). The page label mirrors what the
     *      Bookmarks list already shows for same-page annotations.
     *
     *    • "Copy Link to This Page" — gated by the URI-utilities pref
     *      (matches the items-list "Copy Open Link"). Builds
     *      `zotero://open/…/items/<attKey>?page=N` for the page;
     *      multi-select copies one link per line.
     *
     *  The Reader plugin API surfaces this hook once (not per-window), so
     *  one listener covers every reader instance. Keep the handler ref so
     *  the teardown call passes the exact handler to `unregisterEventListener`. */
    _setupThumbnailContextMenu() {
        try {
            if (!Zotero.Reader || typeof Zotero.Reader.registerEventListener !== "function") return;
            if (this._thumbnailMenuHandler) return; // idempotent
            const plugin: any = this;
            const handler = (event: any) => {
                try {
                    const { reader, params, append } = event || {};
                    if (!reader || !params || !append) return;
                    if (reader._type && reader._type !== "pdf") return;
                    const pageIndexes: number[] = Array.isArray(params.pageIndexes)
                        ? params.pageIndexes.slice().sort((a: number, b: number) => a - b)
                        : [];
                    if (!pageIndexes.length) return;
                    const att = plugin._wvReaderAtt(reader);
                    if (!att || att.libraryID == null || !att.itemKey) return;

                    // Match the pin's label convention by using `pageIndex + 1`
                    // directly — the display path (`_bmReaderPageLabel`)
                    // explicitly ignores `pv._pageLabels` ("answers a different
                    // question") and falls back to `pageIndex + 1` when no
                    // annotation labels apply. Reading `pv._pageLabels` here
                    // would store rich journal labels like "4839" that the
                    // display path would never produce on its own, giving the
                    // list an inconsistent two-number-spaces feel.
                    const labelFor = (pi: number) => String(pi + 1);
                    const single = pageIndexes.length === 1;
                    const items: any[] = [];

                    let addBmLabel: string | null = null;
                    if (plugin._getEnableReaderBookmarks()) {
                        addBmLabel = single
                            ? "Add Bookmark to This Page"
                            : "Add Bookmarks to " + pageIndexes.length + " Pages";
                        items.push({
                            label: addBmLabel,
                            onCommand: async () => {
                                try {
                                    for (const pi of pageIndexes) {
                                        const pageLabel = labelFor(pi);
                                        await plugin._bmReaderAdd(att.libraryID, att.itemKey, {
                                            // `type: "page"` is the dedicated
                                            // whole-page bookmark type — the
                                            // section classifier, icon picker,
                                            // and navigator all key off this
                                            // (ribbon icon, scroll-to-page,
                                            // routes to "In this document").
                                            type: "page",
                                            viewType: "pdf",
                                            location: { pageIndex: pi },
                                            // Mirror pageIndex into `position`
                                            // so `_bmReaderPageLabel` resolves
                                            // the column label via its
                                            // position branch.
                                            position: { pageIndex: pi },
                                            pageLabel,
                                            label: "Page " + pageLabel,
                                        }, { allowDuplicate: true });
                                    }
                                } catch (e) {
                                    Zotero.debug("[Weavero] thumb-menu Add Bookmark err: " + e);
                                }
                            },
                        });
                    }

                    // The Copy Link entry is a sibling of the items-tree
                    // "Copy Open Link", so gate it the same way: URI
                    // utilities master + Copy Item Link sub-toggle (the
                    // sub-toggle is named for items-list links but its
                    // contract is broader — "Weavero may copy zotero://
                    // links from right-click menus").
                    let copyLinkLabel: string | null = null;
                    if (plugin._getEnableUriUtilities && plugin._getEnableCopyItemLink
                        && plugin._getEnableUriUtilities() && plugin._getEnableCopyItemLink()) {
                        copyLinkLabel = single
                            ? "Copy Link to This Page"
                            : "Copy Links to " + pageIndexes.length + " Pages";
                        items.push({
                            label: copyLinkLabel,
                            onCommand: async () => {
                                try {
                                    const base = plugin._buildOpenLink && att.att && plugin._buildOpenLink(att.att);
                                    if (!base) return;
                                    const links = pageIndexes.map(pi =>
                                        base + (base.includes("?") ? "&" : "?") + "page=" + (pi + 1));
                                    const text = links.join("\n");
                                    try {
                                        Zotero.Utilities.Internal.copyTextToClipboard(text);
                                    } catch (_) {
                                        // Fallback path
                                        try {
                                            const w = Zotero.getMainWindow();
                                            if (w && w.navigator && w.navigator.clipboard
                                                && w.navigator.clipboard.writeText) {
                                                w.navigator.clipboard.writeText(text);
                                            }
                                        } catch (_2) {}
                                    }
                                } catch (e) {
                                    Zotero.debug("[Weavero] thumb-menu Copy Link err: " + e);
                                }
                            },
                        });
                    }

                    if (items.length) append(...items);

                    // Icon stamping — the reader's append() API carries
                    // no icon, but the popup itself is XUL (not React;
                    // see `_openContextMenu` in xpcom/reader.js), so we
                    // wait for popupshowing on the reader window's
                    // popupset and stamp `menuitem-iconic` + `image`
                    // onto the menuitems by label. Same trick used by
                    // the in-document "Add Bookmark to This Position"
                    // and "Copy Link to This Page" entries.
                    try {
                        if (addBmLabel) {
                            plugin._wvReaderStampMenuIcon(reader, addBmLabel,
                                plugin._wvReaderBmMenuIconURL());
                        }
                        if (copyLinkLabel) {
                            plugin._wvReaderStampMenuIcon(reader, copyLinkLabel,
                                plugin._menuItemIconURL);
                        }
                    } catch (_) {}
                } catch (e) {
                    Zotero.debug("[Weavero] thumbnail menu handler err: " + e);
                }
            };
            Zotero.Reader.registerEventListener(
                "createThumbnailContextMenu", handler, "weavero@mjthoraval");
            this._thumbnailMenuHandler = handler;
        } catch (e) {
            Zotero.debug("[Weavero] _setupThumbnailContextMenu err: " + e);
        }
    }

    _teardownThumbnailContextMenu() {
        try {
            if (!this._thumbnailMenuHandler) return;
            if (Zotero.Reader && typeof Zotero.Reader.unregisterEventListener === "function") {
                Zotero.Reader.unregisterEventListener(
                    "createThumbnailContextMenu", this._thumbnailMenuHandler);
            }
            this._thumbnailMenuHandler = null;
        } catch (e) {}
    }
}

const _readerPanelsDescriptors = Object.getOwnPropertyDescriptors(_ReaderPanelsMixin.prototype);
delete (_readerPanelsDescriptors as any).constructor;
export const readerPanelsMethods = _readerPanelsDescriptors;
