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
    ".wv-bm-reader-add{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:4px;color:inherit;}",
    // Single-row header: scope toggle (segmented) on the left, + button right.
    ".wv-bm-scope-toggle{display:flex;align-items:center;gap:6px;padding:6px 8px;}",
    ".wv-bm-scope-group{display:flex;flex:1;min-width:0;}",
    ".wv-bm-scope-btn{flex:1;padding:3px 6px;font-size:11px;border:1px solid rgba(127,127,127,.35);background:none;color:inherit;cursor:pointer;opacity:.7;}",
    ".wv-bm-scope-group .wv-bm-scope-btn:first-child{border-radius:4px 0 0 4px;}",
    ".wv-bm-scope-group .wv-bm-scope-btn:last-child{border-radius:0 4px 4px 0;border-left:none;}",
    ".wv-bm-scope-btn:hover{opacity:.95;background:rgba(127,127,127,.12);}",
    ".wv-bm-scope-btn.wv-bm-scope-active{background:var(--color-accent,#5e6ad2);color:#fff;border-color:var(--color-accent,#5e6ad2);opacity:1;}",
    // Search affordance — magnifier in the header row, input row below.
    ".wv-bm-search-btn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:none;cursor:pointer;border-radius:4px;color:inherit;opacity:.65;}",
    ".wv-bm-search-btn:hover{opacity:1;background:rgba(127,127,127,.14);}",
    ".wv-bm-search-btn.wv-bm-search-active{opacity:1;background:rgba(127,127,127,.18);}",
    ".wv-bm-search-row{display:flex;padding:0 8px 6px;}",
    ".wv-bm-search-input{flex:1;padding:3px 6px;font-size:12px;border:1px solid rgba(127,127,127,.35);border-radius:4px;background:rgba(127,127,127,.06);color:inherit;}",
    ".wv-bm-search-input:focus{outline:none;border-color:var(--color-accent,#5e6ad2);}",
    // Dim folders shown only because of a matching descendant (the folder
    // itself doesn't match the search query) so direct matches stand out.
    ".wv-bm-reader-row.wv-bm-dimmed{opacity:.55;}",
    ".wv-bm-reader-add:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-reader-add svg{width:15px;height:15px;fill:currentColor;}",
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
    // Colors row is tighter (1-px gap, like upstream's .colors .color
    // margin-left:1px) so 20×20 buttons read as a row of tiles, not as
    // spaced-out chips. Tags / authors / types keep the 4-px row gap.
    ".wv-bm-chip-row:has(> .wv-bm-chip-color){gap:1px;}",
    // Match the reader's annotations-pane color tiles (upstream
    // _annotations-view.scss .selector .colors .color + IconColor16):
    // a 2-px-padded button wrapping a 16×16 rounded-corner square. The
    // wrapper handles the hover/selected background; the inner tile is
    // the actual annotation color with a subtle black-0.1 inset ring.
    ".wv-bm-chip-color{display:inline-flex;padding:2px;border-radius:3px;cursor:pointer;background:transparent;}",
    ".wv-bm-chip-color:hover{background:var(--fill-quinary,rgba(127,127,127,.16));}",
    ".wv-bm-chip-color.selected{background:var(--fill-secondary,rgba(127,127,127,.45));}",
    ".wv-bm-chip-color.inactive .wv-bm-chip-color-tile{opacity:.4;}",
    // The tile is now an inline 16×16 SVG (same path upstream's IconColor16
    // uses), so it carries its own width/height/colours — no extra rules needed.
    ".wv-bm-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;font-size:11px;line-height:1.4;border:1px solid rgba(127,127,127,.4);border-radius:10px;cursor:pointer;background:rgba(127,127,127,.06);color:inherit;user-select:none;-moz-user-select:none;}",
    ".wv-bm-chip:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-chip.selected{background:var(--color-accent,#5e6ad2);color:#fff;border-color:var(--color-accent,#5e6ad2);}",
    ".wv-bm-chip.inactive{opacity:.45;}",
    ".wv-bm-chip-tag-dot{width:7px;height:7px;border-radius:50%;display:inline-block;}",
    // Type chips: same 16×16 SVGs the filter popup uses (chrome://zotero/
    // skin/16/universal/annotate-*.svg) at NATIVE size, no scaling. Box is
    // 24×24 outer for a comfortable hit zone (4 px padding around the 16×16
    // glyph) — matches the visual scale of the reader's Filter annotations
    // popup type buttons.
    ".wv-bm-chip-type{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid rgba(127,127,127,.4);border-radius:3px;cursor:pointer;background:rgba(127,127,127,.06);}",
    ".wv-bm-chip-type:hover{background:rgba(127,127,127,.16);}",
    ".wv-bm-chip-type.selected{background:var(--color-accent,#5e6ad2);border-color:var(--color-accent,#5e6ad2);}",
    ".wv-bm-chip-type svg{width:16px;height:16px;opacity:1;display:block;}",
    // currentColor inherits the chip's text color; we set it via the chip
    // class. Most icons use `fill="currentColor"`, but the note glyph uses
    // `stroke="currentColor"` — both inherit from the chip color.
    // Type-chip glyph stays white in both unselected and selected states —
    // matches the reader's Filter annotations popup. (Icons use
    // fill="currentColor" / stroke="currentColor"; setting color on the
    // chip tints them.)
    ".wv-bm-chip-type{color:#fff;}",
    ".wv-bm-chip-type.selected{color:#fff;}",
    ".wv-bm-chip-type.selected svg{opacity:1;}",
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
    // mirrors the annotations pane's bottom filter. Chip selections persist
    // PER-READER across scope flips (This Document / Library / Elsewhere) so
    // toggling scope doesn't lose the active filter. Strict matching with
    // ancestor-folder dimming: non-matching items hide; folders that hold a
    // matching descendant render dimmed (same idiom as the search filter).

    _wvReaderBmChipState(reader: any) {
        if (!this._wvBmChips) this._wvBmChips = new WeakMap();
        let st = this._wvBmChips.get(reader);
        if (!st) {
            st = { colors: new Set<string>(), tags: new Set<string>(), authors: new Set<string>(), types: new Set<string>() };
            this._wvBmChips.set(reader, st);
        }
        return st;
    }

    _wvReaderBmChipsActive(reader: any): boolean {
        const st = this._wvReaderBmChipState(reader);
        return (st.colors.size + st.tags.size + st.authors.size + st.types.size) > 0;
    }

    /** Walk every bookmark this reader can see (in-doc local + cross-doc global
     *  + library tree) and collect facet → count. */
    _wvReaderBmChipFacets(reader: any) {
        const colors = new Map<string, number>();
        const tags = new Map<string, { color: string, count: number, position: number }>();
        const authors = new Map<string, number>();
        const types = new Map<string, number>();
        try {
            const att = this._wvReaderAtt(reader);
            const userLib = (Zotero as any).Libraries && (Zotero as any).Libraries.userLibraryID;
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
            if (att) {
                const doc = this._bmReaderDoc(att.libraryID, att.itemKey);
                if (doc) { collect(doc.local); collect(doc.global); }
            }
            const lib = (this._bmDoc && this._bmDoc.bookmarks) || [];
            collect(lib);
        } catch (_) {}
        return { colors, tags, authors, types };
    }

    /** True iff this node (a bookmark leaf, never a folder) satisfies every
     *  active chip dimension. Folders never match themselves. */
    _wvBmNodeMatchesChips(node: any, st: any): boolean {
        if (!node || node.type === "folder") return false;
        // Only item-bookmarks reference an underlying Zotero item; everything
        // else (positions, text, collection, library, treerow) can't satisfy
        // any chip dimension. Strict mode → hidden when any chip is active.
        if (node.type !== "item") return false;
        let it: any = null;
        try { it = Zotero.Items.getByLibraryAndKey(node.libraryID, node.itemKey); } catch (_) {}
        if (!it) return false;
        const isAnn = !!(it.isAnnotation && it.isAnnotation());
        if (st.colors.size) {
            if (!isAnn || !st.colors.has(String(it.annotationColor || ""))) return false;
        }
        if (st.types.size) {
            if (!isAnn || !st.types.has(String(it.annotationType || ""))) return false;
        }
        if (st.authors.size) {
            if (!isAnn) return false;
            let name = String((it as any).annotationAuthorName || "").trim();
            if (!name) {
                try {
                    const uid = (it as any).createdByUserID;
                    if (uid && (Zotero as any).Users && (Zotero as any).Users.getName) {
                        name = String((Zotero as any).Users.getName(uid) || "").trim();
                    }
                } catch (_) {}
            }
            if (!st.authors.has(name)) return false;
        }
        if (st.tags.size) {
            let have: Set<string>;
            try { have = new Set(((it.getTags() || []) as any[]).map((t: any) => t.tag)); } catch (_) { return false; }
            let ok = false;
            for (const t of st.tags) { if (have.has(t)) { ok = true; break; } }
            if (!ok) return false;
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
        title.textContent = "Filter annotations";
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

        // ---- Cross-level: Has Tag → Has Related → Has Link (mirrors the
        //      library filter's order AND icon colors: orange tag, wood
        //      related, red link). Single-level here → no per-kind scope arrow.
        addRow((opts: any) => {
            opts.appendChild(mkTriTile(st.hasTag,
                "Has Tag — annotations with at least one tag. Alt+click to exclude.",
                () => {
                    const sp = mk("span"); sp.className = "wv-filter-svg";
                    sp.style.color = "var(--accent-orange)";
                    sp.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M6.086 1L14.586 9.5L9.5 14.586L1 6.086V1H6.086ZM6.5 0H0.5C0.367 0 0.24 0.053 0.146 0.146C0.053 0.24 0 0.367 0 0.5L0 6.5L9.146 15.646C9.24 15.74 9.367 15.792 9.5 15.792C9.632 15.792 9.759 15.74 9.853 15.646L15.646 9.853C15.74 9.759 15.792 9.632 15.792 9.5C15.792 9.367 15.74 9.24 15.646 9.146L6.5 0ZM4 2.75C3.586 2.75 3.211 2.918 2.94 3.189C2.668 3.461 2.5 3.836 2.5 4.25C2.5 4.664 2.668 5.039 2.94 5.311C3.211 5.582 3.586 5.75 4 5.75C4.414 5.75 4.789 5.582 5.061 5.311C5.332 5.039 5.5 4.664 5.5 4.25C5.5 3.836 5.332 3.461 5.061 3.189C4.789 2.918 4.414 2.75 4 2.75Z"/></svg>';
                    return sp;
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
        //      one logical "tags" group; coloured tags come FIRST (then plain,
        //      alphabetical within each subset) to mirror Zotero's library tag
        //      selector — but on the same line, wrapping if it overflows.
        if (tagsPresent.size) {
            const tagsAll = Array.from(tagsPresent);
            const tagsColored = tagsAll.filter(t => !!tagColors[t]).sort((a, b) => a.localeCompare(b));
            const tagsPlain = tagsAll.filter(t => !tagColors[t]).sort((a, b) => a.localeCompare(b));
            const tagsSorted = [...tagsColored, ...tagsPlain];
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
                    b.className = "wv-bm-scope-btn" + (scope === initialScope ? " wv-bm-scope-active" : "");
                    b.setAttribute("data-scope", scope);
                    b.textContent = lbl;
                    b.addEventListener("click", () => {
                        this._wvReaderSetBmScope(scope);
                        this._wvReaderUpdateScopeToggle(idoc);
                        this._wvReaderRenderBmList(reader, idoc);
                    });
                    scopeGroup.appendChild(b);
                };
                mkScope("This Document", "document");
                mkScope("Library", "library");
                const add = idoc.createElementNS(NS_HTML_RP, "button");
                add.className = "wv-bm-reader-add";
                add.setAttribute("title", "Add a bookmark — opens the picker focused on this file (expand it to bookmark its annotations)…");
                add.innerHTML = RP_PLUS_SVG;
                add.addEventListener("click", () => {
                    if (this._wvReaderBmScope() === "library") {
                        Promise.resolve(this._bmAddBookmarksDialog())
                            .then(() => { try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {} })
                            .catch(() => {});
                    } else {
                        this._wvReaderAddViaDialog(reader, idoc);
                    }
                });
                // Magnifier toggles a search input that filters bookmark
                // labels (folders with matching descendants stay open). Same
                // affordance as the reader's Annotations tab.
                const searchBtn = idoc.createElementNS(NS_HTML_RP, "button");
                searchBtn.className = "wv-bm-search-btn";
                searchBtn.setAttribute("title", "Search bookmarks");
                searchBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4"/><line x1="9.2" y1="9.2" x2="13" y2="13"/></svg>';
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
                scopeBar.appendChild(scopeGroup);
                scopeBar.appendChild(add);
                scopeBar.appendChild(searchBtn);
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
            // Library scope: render the GLOBAL library bookmarks tree (the
            // collections-pane bookmarks) instead of this document's sections,
            // using the same inline tree UI. The header toggle switches scope.
            if (this._wvReaderBmScope() === "library") {
                this._wvReaderHideBmHoverCard(idoc);
                while (list.firstChild) list.firstChild.remove();
                this._wvReaderRenderLibraryInto(reader, idoc, list);
                try { this._wvReaderRenderBmChipBar(reader, idoc); } catch (_) {}
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
            // Pre-load data for item bookmarks whose item isn't loaded; once
            // loaded, re-render so the real icons / titles paint.
            this._wvBmEnsureItemsLoaded([doc.local, doc.global], () => {
                try { this._wvReaderRenderBmList(reader, idoc); } catch (_) {}
            });
            if (!doc.local.length && !doc.global.length) {
                const empty = idoc.createElementNS(NS, "div");
                empty.className = "wv-bm-reader-empty";
                empty.textContent = "No bookmarks yet.\n+ bookmarks anywhere in Zotero. Right-click in the page to bookmark a position or selection; drag an annotation here to bookmark it.";
                list.appendChild(empty);
                try { this._wvReaderRenderBmChipBar(reader, idoc); } catch (_) {}
                return;
            }
            const q = this._wvReaderBmQuery(idoc);
            const chipsOn = this._wvReaderBmChipsActive(reader);
            const chipSt = this._wvReaderBmChipState(reader);
            const chipMatch = chipsOn ? (n: any) => this._wvBmNodeMatchesChips(n, chipSt) : null;
            const useFilter = q || chipsOn;
            const fLocal = useFilter ? this._wvBmFilterCombined(doc.local, q, chipMatch) : null;
            const fGlobal = useFilter ? this._wvBmFilterCombined(doc.global, q, chipMatch) : null;
            const addSection = (heading: string, nodes: any[], section: "local" | "global", f: { visible: Set<string>, dimmed: Set<string> } | null) => {
                if (!nodes.length) return;
                if (f && !f.visible.size) return;   // section has no matches under search
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
                this._wvReaderRenderTree(reader, idoc, att, treeWrap, nodes, section, 0, f ? f.visible : undefined, f ? f.dimmed : undefined);
                gc.appendChild(treeWrap);
                this._wvReaderWireGroupDrop(reader, idoc, gc, section === "local");
                list.appendChild(gc);
            };
            addSection("In this document", doc.local, "local", fLocal);
            addSection("Elsewhere in Zotero", doc.global, "global", fGlobal);
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
        try { return Zotero.Prefs.get("weavero.readerBmScope") === "library" ? "library" : "document"; }
        catch (_) { return "document"; }
    }
    _wvReaderSetBmScope(scope: string) {
        try { Zotero.Prefs.set("weavero.readerBmScope", scope === "library" ? "library" : "document"); } catch (_) {}
    }
    /** Reflect the current scope on the header toggle buttons. */
    _wvReaderUpdateScopeToggle(idoc: any) {
        try {
            const scope = this._wvReaderBmScope();
            const btns = idoc.querySelectorAll(".wv-bm-scope-btn");
            for (const b of btns) b.classList.toggle("wv-bm-scope-active", b.getAttribute("data-scope") === scope);
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

    /** Rebuild the bottom chip selector bar (colors / tags / authors / types).
     *  Hidden when no facets exist across the visible bookmark universe. */
    /** Wire ns-resize drag on the chip-bar handle. Drag-up grows the bar,
     *  drag-down shrinks it. Clamped to [40, view.height − 80] so the bar
     *  never swallows the list nor disappears. Persists to a pref. */
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
            const NS = NS_HTML_RP;
            // Ensure resizer + bar exist as adjacent siblings at the bottom.
            // Order: resizer first (it sits ABOVE the bar via DOM order, since
            // both are flex-items at the bottom of the column view).
            let resizer = view.querySelector(".wv-bm-chip-resizer");
            let bar = view.querySelector(".wv-bm-chip-bar");
            if (!resizer) {
                resizer = idoc.createElementNS(NS, "div");
                resizer.className = "wv-bm-chip-resizer";
                resizer.setAttribute("title", "Drag to resize");
                this._wvWireChipResizer(reader, idoc, resizer);
                view.appendChild(resizer);
            }
            if (!bar) {
                bar = idoc.createElementNS(NS, "div");
                bar.className = "wv-bm-chip-bar";
                view.appendChild(bar);
            }
            // Apply the persisted height (default 140 px).
            try {
                const h = parseInt(String(Zotero.Prefs.get("weavero.readerBmChipBarHeight") || "140"), 10);
                if (Number.isFinite(h) && h > 0) bar.style.flex = "0 0 " + h + "px";
            } catch (_) {}
            while (bar.firstChild) bar.firstChild.remove();
            const st = this._wvReaderBmChipState(reader);
            const facets = this._wvReaderBmChipFacets(reader);
            const TYPE_NAME: { [k: string]: string } = {
                highlight: "Highlights", underline: "Underlines", note: "Notes",
                text: "Text annotations", image: "Image annotations", ink: "Ink annotations",
            };
            const anyFacets = facets.colors.size || facets.tags.size || facets.authors.size || facets.types.size;
            if (!anyFacets) {
                bar.classList.remove("wv-bm-chip-bar-on");
                resizer.classList.remove("wv-bm-chip-bar-on");
                return;
            }
            bar.classList.add("wv-bm-chip-bar-on");
            resizer.classList.add("wv-bm-chip-bar-on");
            const mkRow = () => { const r = idoc.createElementNS(NS, "div"); r.className = "wv-bm-chip-row"; return r; };
            const toggle = (set: Set<string>, key: string) => { if (set.has(key)) set.delete(key); else set.add(key); };
            const rerender = () => {
                try {
                    this._wvReaderRenderBmList(reader, idoc);
                    this._wvReaderRenderBmChipBar(reader, idoc);   // refresh selected states
                } catch (_) {}
            };
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
                    const btn = idoc.createElementNS(NS, "span");
                    btn.className = "wv-bm-chip-color" + (st.colors.has(c) ? " selected" : "");
                    btn.setAttribute("title", c + " — " + facets.colors.get(c) + " annotation(s)");
                    // Match upstream's IconColor16 exactly: 16×16 SVG canvas
                    // with a 14×14 rounded-rect colored path (1 px inset on
                    // every side) + a black-0.1 stroke overlay. Filling a flat
                    // 16×16 span made the coloured area ~14% bigger than the
                    // annotations-pane tiles. Build via createElementNS — the
                    // reader iframe's parser was leaving innerHTML-built SVG
                    // contents un-rendered (0×0).
                    const SVG_NS = "http://www.w3.org/2000/svg";
                    const svg: any = idoc.createElementNS(SVG_NS, "svg");
                    svg.setAttribute("class", "wv-bm-chip-color-tile");
                    svg.setAttribute("width", "16");
                    svg.setAttribute("height", "16");
                    svg.setAttribute("viewBox", "0 0 16 16");
                    svg.setAttribute("fill", "none");
                    const fillPath: any = idoc.createElementNS(SVG_NS, "path");
                    fillPath.setAttribute("d", "M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z");
                    fillPath.setAttribute("fill", c);
                    const strokePath: any = idoc.createElementNS(SVG_NS, "path");
                    strokePath.setAttribute("d", "M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z");
                    strokePath.setAttribute("stroke", "black");
                    strokePath.setAttribute("stroke-opacity", "0.1");
                    svg.appendChild(fillPath);
                    svg.appendChild(strokePath);
                    btn.appendChild(svg);
                    btn.addEventListener("click", () => { toggle(st.colors, c); rerender(); });
                    row.appendChild(btn);
                }
                bar.appendChild(row);
            }
            // Types row (sits right below the colour row — the two
            // annotation-shape facets group together visually).
            if (facets.types.size) {
                const row = mkRow();
                // Use upstream's canonical type ordering for natural left-right flow.
                const order = ["highlight", "underline", "note", "text", "image", "ink"];
                const keys = order.filter(t => facets.types.has(t));
                for (const tp of keys) {
                    const chip = idoc.createElementNS(NS, "span");
                    chip.className = "wv-bm-chip-type" + (st.types.has(tp) ? " selected" : "");
                    chip.setAttribute("title", (TYPE_NAME[tp] || tp) + " — " + facets.types.get(tp));
                    // Match the reader's "Filter annotations" popup — annotate-
                    // highlight/underline/note/text/area/ink SVG glyphs.
                    chip.innerHTML = RP_ANN_TYPE_SVG[tp] || "";
                    chip.addEventListener("click", () => { toggle(st.types, tp); rerender(); });
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
                        chip.className = "wv-bm-chip" + (st.tags.has(t) ? " selected" : "");
                        chip.setAttribute("title", t + " — " + info.count + " bookmark(s)");
                        if (info.color) {
                            const dot = idoc.createElementNS(NS, "span");
                            dot.className = "wv-bm-chip-tag-dot";
                            dot.style.background = info.color;
                            chip.appendChild(dot);
                        }
                        const lbl = idoc.createElementNS(NS, "span");
                        lbl.textContent = t;
                        chip.appendChild(lbl);
                        chip.addEventListener("click", () => { toggle(st.tags, t); rerender(); });
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
                    chip.className = "wv-bm-chip" + (st.authors.has(a) ? " selected" : "");
                    chip.setAttribute("title", a + " — " + facets.authors.get(a) + " annotation(s)");
                    chip.textContent = a;
                    chip.addEventListener("click", () => { toggle(st.authors, a); rerender(); });
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
        if (!nodes.length) {
            const empty = idoc.createElementNS(NS, "div");
            empty.className = "wv-bm-reader-empty";
            empty.textContent = "No library bookmarks yet.\nUse + to bookmark an item, collection, library, or saved search — they appear here in every document.";
            list.appendChild(empty);
            return;
        }
        if (f && !f.visible.size) {
            const empty = idoc.createElementNS(NS, "div");
            empty.className = "wv-bm-reader-empty";
            empty.textContent = q ? ("No bookmarks match \"" + q + "\".") : "No bookmarks match the current filter.";
            list.appendChild(empty);
            return;
        }
        const gc = idoc.createElementNS(NS, "div");
        gc.className = "wv-bm-reader-group wv-bm-grp-global";
        const treeWrap = idoc.createElementNS(NS, "div");
        treeWrap.className = "wv-bm-reader-tree";
        this._wvReaderRenderLibraryTree(reader, idoc, treeWrap, nodes, 0, f ? f.visible : undefined, f ? f.dimmed : undefined);
        gc.appendChild(treeWrap);
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
        label.textContent = bm.label || "Bookmark";
        // Drop the plain HTML tooltip in favour of the rich hover card wired
        // below — the two would otherwise both fire on hover.
        row.appendChild(ic); row.appendChild(label);
        row.addEventListener("click", (e: any) => this._bmActivateBookmark(bm, e));
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
            try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("application/x-weavero-libbm", node.id); } catch (_) {}
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
     *  handled the drop. (Text-only selections have no library equivalent.) */
    async _wvReaderLibAcceptDrop(reader: any, idoc: any, payload: any, target: any): Promise<boolean> {
        try {
            const att = this._wvReaderAtt(reader);
            const entries: any[] = [];
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
                    }
                } catch (_) {}
            }
            this._wvDraggedAnnKey = null;
            if (!entries.length) return false;
            await this._bmInit();
            const addedIds: string[] = [];
            for (const en of entries) {
                if (!en.itemKey) continue;
                if (this._bmHasItem(en.libraryID, en.itemKey)) continue;   // de-dupe
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
        // Clicking a bookmark should reset any open in-document annotation
        // popup; the annotation-bookmark branch below re-opens it for the
        // new annotation if applicable.
        this._wvDismissReaderAnnPopup(reader);
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
            let parent: any = null;
            try {
                if (rowEl && rowEl.closest) {
                    parent = rowEl.closest("#wv-bm-list-inner") || rowEl.closest(".wv-bm-flyout-inner");
                }
            } catch (_) {}
            (parent || idoc.body || idoc.documentElement).appendChild(card);
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
            if (this._wvReaderBmScope() === "library") {
                this._wvReaderBuildLibCtxItems(reader, idoc, e, item, sep, reRender);
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
                    // Unified edit: rename + (for text/position) edit comment.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        const win = Zotero.getMainWindow();
                        const newName = this._bmPromptName(win, "Edit Bookmark — Name", entry.label || "");
                        if (newName === null) return;
                        const renameP = (newName && newName !== entry.label)
                            ? this._bmReaderRename(att.libraryID, att.itemKey, entry.id, newName)
                            : Promise.resolve();
                        if (entry.type === "text" || entry.type === "position") {
                            const newComment = this._bmPromptName(win, "Edit Bookmark — Comment (optional)", entry.comment || "");
                            const commentP = (newComment !== null && newComment !== (entry.comment || ""))
                                ? this._bmReaderUpdatePosition(att.libraryID, att.itemKey, entry.id, { comment: newComment })
                                : Promise.resolve();
                            Promise.all([renameP, commentP]).then(reRender);
                        } else {
                            renameP.then(reRender);
                        }
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
                    // Unified edit: rename + (for text/position) edit comment.
                    item("Edit Bookmark…", RP_RENAME_SVG, () => {
                        const win = Zotero.getMainWindow();
                        const newName = this._bmPromptName(win, "Edit Bookmark — Name", entry.label || "");
                        if (newName === null) return;
                        const renameP = (newName && newName !== entry.label)
                            ? this._bmReaderRename(att.libraryID, att.itemKey, entry.id, newName)
                            : Promise.resolve();
                        if (entry.type === "text" || entry.type === "position") {
                            const newComment = this._bmPromptName(win, "Edit Bookmark — Comment (optional)", entry.comment || "");
                            const commentP = (newComment !== null && newComment !== (entry.comment || ""))
                                ? this._bmReaderUpdatePosition(att.libraryID, att.itemKey, entry.id, { comment: newComment })
                                : Promise.resolve();
                            Promise.all([renameP, commentP]).then(reRender);
                        } else {
                            renameP.then(reRender);
                        }
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
            }
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

    /** Build the context-menu items for the LIBRARY scope (main store) using the
     *  same `item`/`sep` helpers as the reader menu. Open / Show in Library /
     *  Rename / Delete on a row; Rename/New Subfolder/Delete on a folder; plus
     *  Add Library Bookmark… / New Folder… always. All re-render the tree. */
    _wvReaderBuildLibCtxItems(reader: any, idoc: any, e: any, item: any, sep: any, reRender: any) {
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
                let openIcon = "";
                try { const im = this._bmIconInfo(entry, win).image; openIcon = (im && im.indexOf("chrome://") === 0) ? im : this._bmShowInLibraryIcon({ libraryID: entry.libraryID }, win); } catch (_) {}
                item("Open", openIcon, () => this._bmActivateBookmark(entry, {}));
                item("Show in Library", this._bmShowInLibraryIcon({ libraryID: entry.libraryID }, win), () => this._bmShowInLibrary(entry));
                sep();
                item("Rename…", RP_RENAME_SVG, () => {
                    const n = this._bmPromptName(win, "Rename Bookmark", entry.label || "");
                    if (n) this._bmRenameBookmark(entry.id, n).then(reRender);
                });
                item("Delete Bookmark", RP_DELETE_SVG, () => this._bmRemove(entry.id).then(reRender));
            }
            sep();
        }
        item("Add Library Bookmark…", RP_PLUS_SVG, () => {
            Promise.resolve(this._bmAddBookmarksDialog()).then(reRender).catch(() => {});
        });
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
