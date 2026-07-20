// Module: bookmarks — a dropdown bookmarks affordance with folders.
//
// A bookmark icon at the top of the collections pane (next to "New
// Collection") opens a dropdown listing the user's bookmarks (items,
// annotations, collections) organized into optional folders. The dropdown
// is a XUL <panel> hosting an HTML list (the same "panel + HTML" pattern
// the filter window uses, #wv-filter-popup) — a native <menupopup> can't
// tint icons, host drag-and-drop, or carry per-row right-click menus.
// Rows show the target's real Zotero icon, navigate on click (modifier-
// aware), can be reordered / nested by drag, and have right-click menus.
//
// Storage (per Claude memory project_weavero_bookmarks_storage): one JSON
// document at `<Zotero data dir>/weavero/bookmarks.json`, behind this thin
// store so the backend can later swap for Zotero's managed synced store.
//
// Data shape (v2 — a tree; v1 flat data is forward-compatible):
//   { version: 2, bookmarks: [
//       { id, type: "item",       libraryID, itemKey,       label, created },
//       { id, type: "collection", libraryID, collectionKey, label, created },
//       { id, type: "folder", name, expanded, created, children: [ … ] }
//   ] }   (annotations are items with itemType 'annotation')
//
// (An alternative docked-panel "tab" UI is parked at
// work/saved-variants/bookmarks-panel-variant.ts.)
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { BOOKMARK_PATH, BOOKMARK_PATH_20, URL_GLOBE_SVG, URL_EXTERNAL_SVG, WV_FUNNEL_PATH, WV_FUNNEL_STEM_COLOR } from "./constants";
import { BM_HOVERCARD_CSS, WV_PIN_ICON_URI } from "./reader-panels";

// Gecko globals — not in the project's TS lib set (cf. tabs.ts).
declare const IOUtils: any;
declare const PathUtils: any;
declare const Services: any;

const BM_BTN_ID = "wv-bookmarks-toolbar-button";
const BM_POPUP_ID = "wv-bookmarks-popup";       // the <panel>
const BM_INNER_ID = "wv-bookmarks-inner";
const BM_CHIP_POPUP_ID = "wv-bookmarks-chip-popup";   // sibling XUL <panel>
const BM_CHIP_INNER_ID = "wv-bookmarks-chip-inner";
const BM_STYLE_ID = "wv-bookmarks-style";
const BM_ROW_MENU_ID = "wv-bm-row-menu";
const NS_HTML = "http://www.w3.org/1999/xhtml";

// Annotation-type SVG glyphs — same paths the reader-sidebar chip popup
// uses (kept in sync with RP_ANN_TYPE_SVG in reader-panels.ts).
const BM_ANN_TYPE_SVG: { [k: string]: string } = {
    highlight:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M2 2H14V14H2V2ZM1 1H2H14H15V2V14V15H14H2H1V14V2V1ZM13 13L8.75 3H7.25L3 13H4.62985L5.90485 10H10.0952L11.3702 13H13ZM8 5.07023L6.32985 9H9.67015L8 5.07023Z" fill="currentColor"/>'
        + '</svg>',
    underline:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M13 13L8.75 3H7.25L3 13H4.62985L5.90485 10H10.0952L11.3702 13H13ZM8 5.07023L6.32985 9H9.67015L8 5.07023ZM15 15V14H1V15H15Z" fill="currentColor"/>'
        + '</svg>',
    note:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path d="M7.5 14.5H14.5V1.5H1.5V8.5M7.5 14.5L1.5 8.5M7.5 14.5V8.5H1.5" stroke="currentColor"/>'
        + '</svg>',
    text:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M13 1.5H3V3H7.24997V14H8.74997V3H13V1.5Z" fill="currentColor"/>'
        + '</svg>',
    image:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.0001 1H6.00015V2H10.0001V1ZM12.0001 4H4.00015V12H12.0001V4ZM3.00015 3V13H13.0001V3H3.00015ZM14.0001 14V12H15V15H12V14H14.0001ZM15.0001 6H14.0001V10H15.0001V6ZM1.0001 6H2.0001V10H1.0001V6ZM6.0001 14H10.0001V15H6.0001V14ZM12.0002 2L14.0003 2.00001L14.0002 4H15.0002V1H12.0002V2ZM2.0001 2.00001V4.00001H1.0001L1.0001 1.00001L4.0001 1.00001V2L2.0001 2.00001ZM4 14L2.00015 14L2.00015 12H1L1 15L4 15V14Z" fill="currentColor"/>'
        + '</svg>',
    ink:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M12.2379 1.96038C7.35382 -0.685304 3.87074 -0.185451 2.14056 1.6023C1.09277 2.68497 0.770104 4.18435 1.20189 5.49993C0.859503 5.9151 0.586015 6.39922 0.406392 6.94321C-0.251619 8.93602 0.392748 11.5506 3.14369 14.3518L3.55138 13.3325C1.22808 10.8298 0.880354 8.69716 1.35597 7.25675C1.44524 6.98637 1.56492 6.73451 1.70984 6.50322C2.01734 6.9348 2.42776 7.31991 2.94254 7.62876C5.08604 8.91477 7.00043 8.47453 7.78686 7.27398C8.17397 6.68302 8.24618 5.93402 7.87663 5.2695C7.51213 4.61407 6.76938 4.12858 5.69987 3.91011C4.4187 3.64842 3.08109 3.95856 2.04205 4.71173C1.9233 3.869 2.19892 2.97994 2.85915 2.29774C4.12914 0.98549 7.04616 0.285329 11.7616 2.83966L12.2379 1.96038ZM3.45701 6.77126C2.98486 6.48799 2.62971 6.12157 2.39003 5.71152C3.22891 4.98627 4.3888 4.66296 5.49973 4.88988C6.38853 5.07143 6.82496 5.43594 7.00268 5.75551C7.17534 6.06599 7.1528 6.41698 6.95036 6.72602C6.55769 7.32546 5.31375 7.88522 3.45701 6.77126ZM13.2929 4C13.6834 3.60948 14.3166 3.60948 14.7071 4L15.5 4.79289C15.8905 5.18342 15.8905 5.81658 15.5 6.20711L7.42612 14.281C7.33036 14.3767 7.21615 14.4521 7.09041 14.5024L4.6857 15.4642L3.60247 15.8975L4.03576 14.8143L4.99765 12.4096C5.04794 12.2839 5.12325 12.1696 5.21902 12.0739L13.2929 4ZM12.5 6.20715L5.92612 12.781L5.39753 14.1025L6.71902 13.5739L13.2929 7.00004L12.5 6.20715ZM13.2071 5.50004L14 6.29293L14.7929 5.5L14 4.70711L13.2071 5.50004Z" fill="currentColor"/>'
        + '</svg>',
};

// annotationType → Zotero skin icon (mirrors the filter pane's mapping).
const BM_ANNOTATION_ICONS: { [k: string]: string } = {
    highlight: "annotate-highlight.svg",
    underline: "annotate-underline.svg",
    note: "annotate-note.svg",
    image: "annotate-area.svg",
    ink: "annotate-ink.svg",
    text: "annotate-text.svg",
};

// Hollow bookmark-ribbon glyph for the toolbar button — themed via
// `context-fill` (the button sets -moz-context-properties + fill:
// currentColor). Sized at 20×20 to match Zotero's own collections-
// toolbar icons (the native "Add Collection" button uses the
// `chrome://zotero/skin/20/…` icon set), so the bookmark icon visually
// matches its toolbar neighbours.
//
// Uses the 20-unit `BOOKMARK_PATH_20` shared with the reader Bookmarks
// tab: at 20px render, 1 SVG unit = 1 device pixel and the outer
// edges (top, sides, bottom corners, V-apex) land on integer pixel
// rows — razor-sharp top stripe, matching the tab.
const BOOKMARK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" '
    + 'viewBox="0 0 20 20" fill="context-fill">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" '
    + 'd="' + BOOKMARK_PATH_20 + '"/>'
    + '</svg>';

// Neutral-gray fallback for a row whose target can't be resolved.
const BM_FALLBACK_DATA_URI = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path fill="#888" d="M4 1.5h8a1 1 0 0 1 1 1V15l-5-3.2L3 15V2.5a1 1 0 0 1 1-1z"/>'
    + '</svg>');

// "Delete Bookmark" icon — red cross. Intentionally OFF-theme: Weavero's
// delete is one-step destructive (no "Bin" intermediate), so a red colour
// call-out signals danger more clearly than Zotero's themed grey icons.
const BM_DELETE_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path d="M4 4l8 8M12 4l-8 8" stroke="#e0483b" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>');

// Type-specific row icons for `position` / `page` / `text` bookmarks.
// Mirror the reader's RP_PIN_EMOJI / RP_BM_RIBBON / RP_TEXT_SVG so the
// same bookmark shows the same glyph in both panels. The library popup
// uses <img> for row icons (can't host inline SVG/text), so the emoji
// is wrapped in an SVG <text> element and the others are data: URIs.
// Page + text use context-fill so they inherit the row's text colour
// via the -moz-context-properties: fill set on the <img>.
// The SAME pushpin drawing as the reader (in-document marker, list rows, menus)
// rather than a platform emoji, so one bookmark shows one pin everywhere.
const BM_PIN_ICON = WV_PIN_ICON_URI;
// Page bookmark uses a SOLID-FILLED ribbon (just the outer half of
// BOOKMARK_PATH, no inner cutout) so it visually contrasts with the
// hollow ribbon used elsewhere for "general bookmarks" (e.g. the
// reader-sidebar tab glyph).
const BM_PAGE_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill">'
    + '<path d="M4 1H12V15L8 12L4 15Z"/></svg>');
const BM_TEXT_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="context-fill">'
    + '<path d="M3 3H10V5H3ZM3 7H13V9H3ZM3 11H10V13H3Z"/></svg>');

// "+" glyph for the context-menu "Add Bookmark…" item. Uses
// `context-fill` so it inherits `var(--fill-secondary)` from Zotero's
// global `menupopup image` CSS — themes identically to Zotero's own
// menu icons (sets `-moz-context-properties: fill` + `fill:` on every
// menuitem image).
const BM_MENU_ADD_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path fill="context-fill" d="M7 7V2h2v5h5v2H9v5H7V9H2V7z"/></svg>');
// Hollow bookmark ribbon for the collections-pane right-click "Bookmark
// Collection" menu item — the SAME glyph as the collections-pane toolbar
// button (shared BOOKMARK_PATH), at the menu's native 16×16 slot and themed
// via `context-fill` like Zotero's own menu icons.
const BM_MENU_BOOKMARK_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path fill="context-fill" fill-rule="evenodd" clip-rule="evenodd" d="' + BOOKMARK_PATH + '"/></svg>');
// Globe glyph for the "Add Link…" menu item — the same world icon URL
// bookmarks use, redrawn so its strokes pick up `context-fill` (exposed by
// the menupopup CSS via `-moz-context-properties: fill`) and theme like
// Zotero's own menu icons.
const BM_MENU_LINK_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"'
    + ' fill="none" stroke="context-fill" stroke-width="1">'
    + '<circle cx="8" cy="8" r="6.5"/><line x1="1.5" y1="8" x2="14.5" y2="8"/>'
    + '<ellipse cx="8" cy="8" rx="3" ry="6.5"/></svg>');
// Folder+plus glyph for "New Folder…" / "New Subfolder…" menu items.
// Redrawn at 16-unit to MATCH the menu's icon slot (chrome forces
// `menuitem-iconic` images to 16×16 — so a 20-unit SVG was being
// scaled 20→16 internally, reintroducing the 0.8× anti-aliasing the
// prior fix tried to remove). Every coordinate sits on a `.5` offset
// so stroke-width 1 centers between pixel rows/columns — each
// horizontal/vertical stroke covers exactly one pixel; only the short
// tab slope retains unavoidable 45° anti-aliasing.
// Filled folder + circle-badge "+" — Zotero-style visual concept,
// authored with SVG arc commands and explicit per-corner radii
// rather than borrowing specific bezier control points. Layered:
//   1. Folder outline (filled ring via evenodd): tab on the LEFT
//      (x 0-4, y 0-2), 1-unit rounded corners at top-left, top-
//      right, and bottom-left. The bottom-right is carved along
//      the badge's outer circle (r=4, large-arc-flag=1 so the
//      arc wraps the badge's right-bottom-left side, not the
//      side facing the folder interior).
//   2. Badge ring: outer r=4 minus inner r=3, centred (11.5, 11.5).
//   3. + cross (3-unit cross with 1-unit-thick arms) filled inside
//      the badge's hollow centre.
const BM_MENU_NEWFOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">'
    + '<path fill-rule="evenodd" fill="context-fill" d="'
    + 'M0 1A1 1 0 0 1 1 0H3.586A1 1 0 0 1 4.293 0.293L6 2H13A1 1 0 0 1 14 3V7.76A4.5 4.5 0 0 0 7.03 12H1A1 1 0 0 1 0 11Z'
    + 'M1 1H3.586L5.293 2.707C5.505 2.919 5.7 3 6 3H13V7.26A4.5 4.5 0 0 0 7.03 11H1Z"/>'
    + '<path fill-rule="evenodd" fill="context-fill" d="'
    + 'M11.5 7A4.5 4.5 0 0 1 16 11.5A4.5 4.5 0 0 1 11.5 16A4.5 4.5 0 0 1 7 11.5A4.5 4.5 0 0 1 11.5 7Z'
    + 'M11.5 8A3.5 3.5 0 0 0 8 11.5A3.5 3.5 0 0 0 11.5 15A3.5 3.5 0 0 0 15 11.5A3.5 3.5 0 0 0 11.5 8Z"/>'
    + '<path fill="context-fill" d="M11 9H12V11H14V12H12V14H11V12H9V11H11Z"/>'
    + '</svg>');

// Row folder glyph for bookmark folder rows — same filled-with-evenodd
// design language as the "New folder" action above (rounded corners,
// left-aligned tab, hollow interior) but with no badge. `context-fill`
// themes the silhouette from the host element's CSS.
// viewBox y-min set to -2 (instead of 0) shifts the rendered folder
// down by 2 units so its visual centre aligns with the row's text
// baseline. The path stays unchanged (folder at SVG y=0-12); only the
// viewBox window moves. The new-folder icon doesn't need this — its
// badge already extends to y=16, so it's already vertically centred.
const BM_FOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -2 16 16" fill="none">'
    + '<path fill-rule="evenodd" fill="context-fill" d="'
    + 'M0 1A1 1 0 0 1 1 0H3.586A1 1 0 0 1 4.293 0.293L6 2H13A1 1 0 0 1 14 3V11A1 1 0 0 1 13 12H1A1 1 0 0 1 0 11Z'
    + 'M1 1H3.586L5.293 2.707C5.505 2.919 5.7 3 6 3H13V11H1Z"/></svg>');

// "Add Bookmark" + glyph for the popup toolbar — 20-unit native so the
// 2-unit-thick cross arms land on integer pixel boundaries at the
// toolbar's 20px display size (no sub-pixel blur). Themed via
// `context-fill`. Replaces Zotero's chrome://zotero/skin/20/universal/
// plus.svg which was rendering blurry.
const BM_ADD_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">'
    + '<path fill="context-fill" d="M9 2H11V9H18V11H11V18H9V11H2V9H9Z"/>'
    + '</svg>');

// "New Folder" action icon for the popup toolbar — same Zotero-style
// design as BM_MENU_NEWFOLDER_ICON, but authored natively in a 20-unit
// viewBox so stroke-width=1 lands on a 1-pixel boundary at the
// toolbar's 20px display size (no sub-pixel blur). Themed via
// `context-fill` / `context-stroke` (the toolbar CSS sets both).
const BM_NEW_FOLDER_ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">'
    + '<path fill-rule="evenodd" fill="context-fill" d="'
    + 'M0 1A1 1 0 0 1 1 0H4.586A1 1 0 0 1 5.293 0.293L8 3H17A1 1 0 0 1 18 4V11.672A4.5 4.5 0 0 0 10.028 15H1A1 1 0 0 1 0 14Z'
    + 'M1 1H4.586L7.293 3.707C7.505 3.919 7.7 4 8 4H17V10.758A4.5 4.5 0 0 0 10.028 14H1Z"/>'
    + '<circle cx="14.5" cy="14.5" r="4" fill="none" stroke="context-stroke" stroke-width="1"/>'
    + '<path fill="context-fill" d="M14 12H15V14H17V15H15V17H14V15H12V14H14Z"/>'
    + '</svg>');

// "Rename…" icon — uses Zotero's native rename.svg (same icon Zotero
// uses for "Rename Collection"). Themes automatically.
const BM_RENAME_ICON = "chrome://zotero/skin/16/universal/rename.svg";
// "Reset to Original Name" icon — Zotero's native reset.svg (curved arrow),
// the same glyph the reader-side menu uses. Themes automatically.
const BM_RESET_ICON = "chrome://zotero/skin/16/universal/reset.svg";

// Bare-class selectors so the same styles apply in the main panel AND in
// flyout sub-panels (each flyout is a separate <panel>, not nested in the
// main one). The wv-bm-* classes are unique to this module.
const BM_POPUP_CSS = [
    "#" + BM_INNER_ID + ",.wv-bm-flyout-inner{position:relative;display:flex;flex-direction:column;min-width:230px;max-width:340px;max-height:460px;padding:4px;}",
    ".wv-bm-flyout-inner{overflow:auto;}",
    "#" + BM_INNER_ID + " .wv-bm-actions{display:flex;align-items:center;gap:2px;padding:2px 4px;}",
    ".wv-bm-iconbtn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:none;cursor:pointer;border-radius:5px;}",
    // The funnel variant carries an extra ▾ chevron — widen the box
    // (keyed off the chevron child via `:has()` so it targets the
    // funnel button specifically, not the search button which uses
    // the `wv-bm-funnel-spacer` margin-helper class).
    ".wv-bm-iconbtn:has(.wv-bm-funnel-chev){width:auto;min-width:28px;padding:0 4px;gap:1px;position:relative;}",
    // Accent-blue dot at the funnel icon's top-right when any chip is
    // selected — same convention as the library filter and reader
    // bookmarks filter (see constants.ts `.wv-filter-tb-dot` and
    // reader-panels.ts `.wv-bm-filter-active`). Funnel sits at x=4..24
    // inside the button; dot at top:3, left:18 lands at its top-right.
    ".wv-bm-iconbtn.wv-bm-lib-filter-active::after{content:'';position:absolute;top:3px;left:18px;width:6px;height:6px;border-radius:50%;background:var(--color-accent,#5e6ad2);pointer-events:none;}",
    ".wv-bm-iconbtn:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    ".wv-bm-iconbtn.wv-active{background:var(--fill-quarternary,rgba(128,128,128,.24));}",
    "#" + BM_INNER_ID + " .wv-bm-funnel-spacer{margin-left:auto;}",
    "#" + BM_INNER_ID + " .wv-bm-search{display:flex;padding:0 6px 4px;}",
    ".wv-bm-search-input{flex:1;padding:4px 8px;font-size:13px;border:1px solid rgba(127,127,127,.35);border-radius:4px;background:rgba(127,127,127,.06);color:inherit;}",
    ".wv-bm-search-input:focus{outline:none;border-color:var(--color-accent,#5e6ad2);}",
    ".wv-bm-search-empty{padding:10px 12px;opacity:.55;font-style:italic;}",
    // Chip filter SIDE popup — a separate XUL panel anchored to the
    // right edge of the bookmarks popup. Lives in its own <panel> so the
    // bookmark list stays fully visible while filtering.
    // Chip popup container — color/type tiles now use the same
    // `.wv-filter-opt.wv-filter-opt-icon` class as the library
    // filter popup (constants.ts already provides those rules
    // globally in the chrome window). Only popup-specific layout
    // remains here.
    "#" + BM_CHIP_INNER_ID + "{display:flex;flex-direction:column;gap:6px;padding:8px 10px;min-width:220px;max-width:300px;max-height:520px;overflow:auto;font-size:12px;}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip-bar-lib-empty{padding:4px 2px;opacity:.6;font-style:italic;}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip-row{display:flex;flex-wrap:wrap;gap:4px;}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;font-size:11px;line-height:1.4;border:1px solid rgba(127,127,127,.4);border-radius:10px;cursor:pointer;background:rgba(127,127,127,.06);color:inherit;user-select:none;-moz-user-select:none;}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip:hover{background:rgba(127,127,127,.16);}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip.selected{background:var(--color-accent,#5e6ad2);color:#fff;border-color:var(--color-accent,#5e6ad2);}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip.excluded{background:rgba(220,72,72,0.16);border-color:rgba(220,72,72,0.95);text-decoration:line-through;}",
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip-tag-dot{width:7px;height:7px;border-radius:50%;display:inline-block;}",
    // Cap the tag row at ~7 chip rows and let it scroll inside the
    // popup. Same idea as the reader filter popup's `.wv-rf-tags-row`
    // — many tags shouldn't push the rest of the chip popup off-screen.
    // `scrollbar-width:thin` removes the legacy up/down arrow buttons
    // at the top and bottom of the scrollbar (Firefox/Gecko native
    // scrollbar style), leaving just a continuous thumb track.
    "#" + BM_CHIP_INNER_ID + " .wv-bm-chip-row.wv-bm-tags-row{max-height:170px;overflow-y:auto;scrollbar-width:thin;align-content:flex-start;padding-right:2px;}",
    // Inline annotation-type SVGs appended via DOMParser don't carry
    // a sizing class — pin them to 16×16 so they fill the icon area.
    "#" + BM_CHIP_INNER_ID + " .wv-filter-opt-icon svg{width:16px;height:16px;display:block;}",
    // 20px icons in 28px buttons, matching the collections toolbar; dimmed
    // like the toolbar icons and brightening on hover.
    ".wv-bm-iconbtn img{width:20px;height:20px;-moz-context-properties:fill,stroke;fill:var(--fill-secondary,rgba(127,127,127,.85));stroke:var(--fill-secondary,rgba(127,127,127,.85));}",
    // Funnel chevron — narrower than the icon, sits after it with 1px
    // gap. Same -moz-context-properties as the funnel img so it picks
    // up the same currentColor tint.
    ".wv-bm-iconbtn img.wv-bm-funnel-chev{width:8px;height:8px;margin-left:1px;}",
    ".wv-bm-iconbtn:hover img{fill:var(--fill-primary,currentColor);stroke:var(--fill-primary,currentColor);}",
    ".wv-bm-iconbtn svg{width:22px;height:22px;color:var(--fill-secondary,rgba(127,127,127,.85));}",
    ".wv-bm-iconbtn:hover svg{color:var(--fill-primary,currentColor);}",
    ".wv-bm-iconbtn.wv-active svg{color:var(--fill-primary,currentColor);}",
    "#" + BM_INNER_ID + " .wv-bm-sep{height:1px;background:var(--fill-quinary,rgba(128,128,128,.22));margin:4px 2px;}",
    ".wv-bm-scroll{overflow:auto;min-height:0;}",
    ".wv-bm-row{display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:4px;}",
    ".wv-bm-row:hover{background:var(--fill-quinary,rgba(128,128,128,.16));}",
    ".wv-bm-row.wv-bm-dragging{opacity:.4;}",
    ".wv-bm-row.wv-bm-dragover{box-shadow:inset 0 2px 0 0 var(--color-accent,#4072e5);}",
    ".wv-bm-row.wv-bm-dragover-bottom{box-shadow:inset 0 -2px 0 0 var(--color-accent,#4072e5);}",
    ".wv-bm-row.wv-bm-dragover-into{background:var(--fill-quinary,rgba(128,128,128,.16));box-shadow:inset 0 0 0 2px var(--color-accent,#4072e5);}",
    ".wv-bm-arrow{flex:0 0 auto;margin-left:auto;opacity:.55;padding-left:8px;display:flex;align-items:center;}",
    ".wv-bm-arrow svg{width:12px;height:12px;}",
    ".wv-bm-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-sublabel{opacity:.55;font-style:italic;}",
    // URL-bookmark labels follow the same scheme palette Weavero uses
    // in notes / reader / item pane. Same hex values; self-contained
    // so the dropdown paints correctly without relying on a global
    // link-colour stylesheet.
    ".wv-bm-label.wv-link-http{color:#1a73e8;}",
    ".wv-bm-label.wv-link-zotero{color:#8b4513;}",
    ".wv-bm-label.wv-link-app{color:#9333ea;}",
    "@media (prefers-color-scheme: dark){",
    " .wv-bm-label.wv-link-http{color:#8ab4f8;}",
    " .wv-bm-label.wv-link-zotero{color:#cd853f;}",
    " .wv-bm-label.wv-link-app{color:#c084fc;}",
    "}",
    ".wv-bm-empty{padding:8px 10px;opacity:.6;font-size:.9em;}",
    // Orphan bookmark (its Zotero target was deleted/purged): dim the row,
    // strike the label, and show a ⚠ badge. Clicking flashes the row (the
    // click feedback for a missing target) instead of silently doing nothing.
    ".wv-bm-row.wv-bm-missing{opacity:.55;}",
    ".wv-bm-row.wv-bm-missing .wv-bm-label{text-decoration:line-through;text-decoration-color:rgba(224,72,59,.55);}",
    ".wv-bm-missing-badge{flex:0 0 auto;margin-left:4px;color:#e0483b;font-size:11px;line-height:1;cursor:help;}",
    "@keyframes wv-bm-missing-pulse{0%,100%{background:transparent;}30%{background:rgba(224,72,59,.30);}}",
    ".wv-bm-row.wv-bm-flash{animation:wv-bm-missing-pulse .6s ease;}",
    // The folder-flyout hover card lives in its OWN XUL panel (so it floats
    // beside the clipped flyout, not over its rows). Strip the panel's native
    // chrome so only the card's own bordered/shadowed box shows; a small
    // shadow-margin keeps the card's box-shadow from being clipped.
    "#wv-bm-hovercard-panel{appearance:none;background:transparent;border:0;box-shadow:none;--panel-padding:0;--panel-background:transparent;--panel-border-color:transparent;--panel-shadow-margin:6px;-moz-window-shadow:none;}",
].join("");

// Edit-bookmark dialog: title + (for annotation/location bookmarks) the
// comment, edited together. A bare XUL <panel> hosting HTML fields. Kept in
// its own stylesheet (injected by _bmEnsureEditDialogStyles) so it can also
// be hosted in the reader-window bookmark sidebar's document, not just the
// main-window bookmarks popup.
const BM_EDITDLG_CSS = [
    "#wv-bm-editdlg-panel{appearance:none;--panel-padding:0;}",
    // Opaque background: --material-menu is translucent (meant to overlay a
    // panel's own backdrop), so layer it over an opaque --material-sidepane
    // base — same trick the reader's filter/settings popups use — or content
    // shows through the bare appearance:none panel.
    ".wv-bm-editdlg{display:flex;flex-direction:column;gap:6px;padding:14px;min-width:320px;max-width:460px;background-color:var(--material-sidepane,var(--material-background,#fff));background-image:linear-gradient(var(--material-menu),var(--material-menu));color:var(--fill-primary);border:1px solid var(--material-panedivider,rgba(127,127,127,.4));border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,.28);}",
    // Draggable title bar — grab it to move the dialog (panel.moveTo). Full-bleed
    // to the box edges via negative margins; the rest of the box keeps its pad.
    ".wv-bm-editdlg-header{margin:-14px -14px 6px -14px;padding:8px 14px;font-size:12px;font-weight:600;opacity:.9;cursor:move;-moz-user-select:none;user-select:none;border-bottom:1px solid var(--material-panedivider,rgba(127,127,127,.4));border-radius:8px 8px 0 0;background:var(--fill-quinary,rgba(127,127,127,.06));}",
    ".wv-bm-editdlg-caption{font-size:10px;font-weight:600;opacity:.65;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}",
    ".wv-bm-editdlg-input,.wv-bm-editdlg-textarea{box-sizing:border-box;width:100%;font:inherit;font-size:13px;padding:6px 8px;border-radius:5px;border:1px solid var(--material-panedivider,rgba(127,127,127,.4));background:var(--fill-quinary,rgba(127,127,127,.06));color:inherit;}",
    ".wv-bm-editdlg-textarea{resize:vertical;min-height:68px;line-height:1.4;}",
    ".wv-bm-editdlg-input:focus,.wv-bm-editdlg-textarea:focus{outline:none;border-color:var(--color-accent,#4072e5);}",
    ".wv-bm-editdlg-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;}",
    ".wv-bm-editdlg-btn{font:inherit;font-size:12px;padding:5px 14px;border-radius:5px;border:1px solid var(--material-panedivider,rgba(127,127,127,.4));background:var(--fill-quinary,rgba(127,127,127,.08));color:inherit;cursor:pointer;}",
    ".wv-bm-editdlg-btn:hover{background:var(--fill-quarternary,rgba(127,127,127,.16));}",
    ".wv-bm-editdlg-btn-primary{background:var(--color-accent,#4072e5);border-color:var(--color-accent,#4072e5);color:#fff;}",
    ".wv-bm-editdlg-btn-primary:hover{filter:brightness(1.08);}",
    // Original-title row under the Title field — shown only when the title
    // differs from the bookmark's auto-generated original (hidden by default).
    ".wv-bm-editdlg-origrow{display:none;align-items:center;justify-content:space-between;gap:8px;margin:-1px 0 1px;font-size:11px;}",
    ".wv-bm-editdlg-origlabel{opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".wv-bm-editdlg-resetlink{flex:none;font:inherit;font-size:11px;padding:1px 6px;border:none;background:none;color:var(--color-accent,#4072e5);cursor:pointer;text-decoration:underline;border-radius:4px;}",
    ".wv-bm-editdlg-resetlink:hover{filter:brightness(1.12);background:var(--fill-quinary,rgba(127,127,127,.1));text-decoration:none;}",
].join("");
const BM_EDITDLG_STYLE_ID = "wv-bm-editdlg-style";

class _BookmarksMixin {
    [k: string]: any;

    // ---- File-backed store ------------------------------------------------

    _bmDir() {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero");
    }

    _bmFilePath() {
        return PathUtils.join(this._bmDir(), "bookmarks.json");
    }

    _bmNormalize(doc: any) {
        if (!doc || typeof doc !== "object" || !Array.isArray(doc.bookmarks)) {
            return { version: 2, bookmarks: [] };
        }
        const fix = (nodes: any[]): any[] => {
            if (!Array.isArray(nodes)) return [];
            for (const n of nodes) {
                if (n && n.type === "folder") {
                    if (!Array.isArray(n.children)) n.children = [];
                    if (typeof n.expanded !== "boolean") n.expanded = true;
                    fix(n.children);
                }
            }
            return nodes;
        };
        const readerBookmarks = (doc.readerBookmarks && typeof doc.readerBookmarks === "object")
            ? doc.readerBookmarks : {};
        return { version: doc.version || 2, bookmarks: fix(doc.bookmarks), readerBookmarks };
    }

    // ---- Reader (in-document) bookmarks -----------------------------------
    // Per-attachment bookmarks shown in the reader's Bookmarks tab, split into
    // two manually-ordered, foldered sections:
    //   readerBookmarks[<libraryID>:<itemKey>] = { local: Node[], global: Node[] }
    // `local` = "In this document" (positions/selected-text/this-doc
    // annotations); `global` = "Elsewhere in Zotero" (items/collections/…).
    // A Node is a bookmark record or a folder {id, type:"folder", name,
    // expanded, children: Node[]}. Order within a section is the array order
    // (user-draggable); folders may nest. Bookmark records keep their prior
    // shape (location bookmarks: { id, type:"position"|"text", viewType,
    // location, pageLabel, position?, label }; target bookmarks mirror the
    // collections-pane shapes). A legacy flat array is migrated to
    // {local, global} on first access (see _bmReaderDoc).

    _bmReaderKey(libraryID: number, itemKey: string) {
        return libraryID + ":" + itemKey;
    }

    /** Set of "lib:key" attachment keys that currently have reader bookmarks
     *  (local or global). Cached; invalidated in _bmPersist on any change.
     *  Used by the library "Has Bookmarks" filter for O(1) membership tests. */
    _bmAttachmentsWithReaderBookmarks(): Set<string> {
        if (this._bmAttBmSet) return this._bmAttBmSet;
        const set = new Set<string>();
        try {
            const rb = (this._bmDoc && this._bmDoc.readerBookmarks) || {};
            for (const k of Object.keys(rb)) {
                const e = rb[k] || {};
                if ((e.local && e.local.length) || (e.global && e.global.length)) set.add(k);
            }
        } catch (_) {}
        this._bmAttBmSet = set;
        return set;
    }

    /** True if the attachment (libraryID + itemKey) has reader bookmarks.
     *  READ-ONLY; O(1) after the cached set is built. */
    _bmAttachmentHasReaderBookmarks(libraryID: number, itemKey: string): boolean {
        if (!this._bmDoc) { try { this._bmInit(); } catch (_) {} return false; }
        return this._bmAttachmentsWithReaderBookmarks().has(this._bmReaderKey(libraryID, itemKey));
    }

    _bmReaderStore() {
        if (!this._bmDoc) return {};
        if (!this._bmDoc.readerBookmarks || typeof this._bmDoc.readerBookmarks !== "object") {
            this._bmDoc.readerBookmarks = {};
        }
        return this._bmDoc.readerBookmarks;
    }

    // ---- Curated outline store (Phase 3) --------------------------------
    // Per-attachment curated outline, created lazily on the FIRST edit
    // (copy-on-first-edit). Stored in its OWN file, `<data dir>/weavero/
    // outlines.json`, NOT in bookmarks.json -- the outline is a distinct
    // concept and the file self-identifies as Weavero's. File shape:
    //   { producer: "weavero", schemaVersion: 1, outlines: {
    //       "<libraryID:itemKey>": { importedFrom, importedAt, entries: [
    //           { id, title, indentLevel, position?, url?, source:{…frozen} } ]
    //   } } }
    // (Local, not synced -- same as bookmarks/sessions. `_wvOutlineRoot` is the
    //  in-memory copy; missing/unreadable -> fresh.)

    _wvOutlineFilePath() {
        return PathUtils.join(this._bmDir(), "outlines.json");
    }

    /** Load `outlines.json` into `_wvOutlineRoot` once (cached promise), then
     *  migrate any legacy `readerOutlines` that a dev.13 build wrote into
     *  bookmarks.json. */
    _wvOutlineInit() {
        if (this._wvOutlineInitPromise) return this._wvOutlineInitPromise;
        this._wvOutlineInitPromise = (async () => {
            let root: any = null;
            try {
                const text: any = await Zotero.File.getContentsAsync(this._wvOutlineFilePath());
                const j = JSON.parse(text);
                if (j && typeof j === "object" && j.outlines && typeof j.outlines === "object") {
                    root = { producer: "weavero", schemaVersion: j.schemaVersion || 1, outlines: j.outlines };
                }
            } catch (_) {}
            if (!root) root = { producer: "weavero", schemaVersion: 1, outlines: {} };
            this._wvOutlineRoot = root;
            try { await this._wvOutlineMigrateFromBookmarks(); } catch (_) {}
            return this._wvOutlineRoot;
        })();
        return this._wvOutlineInitPromise;
    }

    /** One-time migration: an early Phase-3 build (dev.13) stored curated
     *  outlines under `readerOutlines` in bookmarks.json. Read that raw (the
     *  bookmarks normalizer drops the key on load), move it into outlines.json,
     *  and rewrite bookmarks.json without it. Idempotent. */
    async _wvOutlineMigrateFromBookmarks() {
        let raw: any = null;
        try { const t: any = await Zotero.File.getContentsAsync(this._bmFilePath()); raw = JSON.parse(t); } catch (_) { return; }
        const ro = raw && raw.readerOutlines;
        if (!ro || typeof ro !== "object" || !Object.keys(ro).length) return;
        let migrated = false;
        for (const key of Object.keys(ro)) {
            if (!this._wvOutlineRoot.outlines[key]) { this._wvOutlineRoot.outlines[key] = ro[key]; migrated = true; }
        }
        if (migrated) await this._wvOutlinePersist();
        // Drop readerOutlines from bookmarks.json (the normalizer already omits
        // it in memory; force a rewrite so the on-disk file is clean).
        try {
            await this._bmInit();
            if (this._bmDoc && (this._bmDoc as any).readerOutlines) delete (this._bmDoc as any).readerOutlines;
            await this._bmPersist();
        } catch (_) {}
    }

    /** Atomic, serialized write of the outline root to outlines.json. */
    _wvOutlinePersist() {
        if (!this._wvOutlineRoot) return Promise.resolve();
        const snapshot = JSON.stringify(this._wvOutlineRoot, null, 2);
        const dir = this._bmDir();
        const path = this._wvOutlineFilePath();
        this._wvOutlineWriteChain = (this._wvOutlineWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) => Zotero.debug("[Weavero] outlines persist failed: " + e));
        return this._wvOutlineWriteChain;
    }

    /** The per-attachment map (sync; {} until `_wvOutlineInit` has loaded). */
    _wvOutlineStore() {
        if (!this._wvOutlineRoot) { try { this._wvOutlineInit(); } catch (_) {} return {}; }
        if (!this._wvOutlineRoot.outlines || typeof this._wvOutlineRoot.outlines !== "object") {
            this._wvOutlineRoot.outlines = {};
        }
        return this._wvOutlineRoot.outlines;
    }

    /** The curated outline doc for an attachment, or null if none yet. */
    _wvOutlineDoc(libraryID: number, itemKey: string): any {
        return this._wvOutlineStore()[this._bmReaderKey(libraryID, itemKey)] || null;
    }

    /** True if the attachment has a curated (Weavero-edited) outline. */
    _wvOutlineHasCurated(libraryID: number, itemKey: string): boolean {
        const d = this._wvOutlineDoc(libraryID, itemKey);
        return !!(d && Array.isArray(d.entries));
    }

    /** Snapshot a plain getOutline2 tree into a curated outline
     *  (copy-on-first-edit). Idempotent: returns the existing curated outline
     *  unchanged if one already exists. The tree ({title,url,position,items})
     *  is flattened depth-first into entries carrying `indentLevel`; each keeps
     *  a frozen `source` snapshot for later re-enrichment / re-import. */
    async _wvOutlineEnsureCurated(libraryID: number, itemKey: string, importedFrom: string, tree: any[]): Promise<any> {
        await this._wvOutlineInit();
        const store = this._wvOutlineStore();
        const key = this._bmReaderKey(libraryID, itemKey);
        if (store[key] && Array.isArray(store[key].entries)) return store[key];
        const entries: any[] = [];
        const walk = (nodes: any[], depth: number) => {
            for (const n of (nodes || [])) {
                const title = String(n.title == null ? "" : n.title);
                entries.push({
                    id: "wvo-" + Zotero.Utilities.randomString(8),
                    title, indentLevel: depth,
                    position: n.position || null,
                    url: n.url || null,
                    source: { title, position: n.position || null, url: n.url || null, origin: importedFrom },
                });
                walk(n.items, depth + 1);
            }
        };
        walk(tree, 0);
        store[key] = { importedFrom, importedAt: new Date().toISOString(), entries };
        await this._wvOutlinePersist();
        return store[key];
    }

    /** Delete a curated outline entry by id. */
    async _wvOutlineDeleteEntry(libraryID: number, itemKey: string, id: string) {
        await this._wvOutlineInit();
        const d = this._wvOutlineDoc(libraryID, itemKey);
        if (!d || !Array.isArray(d.entries)) return;
        const i = d.entries.findIndex((e: any) => e.id === id);
        if (i >= 0) { d.entries.splice(i, 1); await this._wvOutlinePersist(); }
    }

    /** Rename a curated outline entry. */
    async _wvOutlineRenameEntry(libraryID: number, itemKey: string, id: string, title: string) {
        await this._wvOutlineInit();
        const d = this._wvOutlineDoc(libraryID, itemKey);
        if (!d || !Array.isArray(d.entries)) return;
        const e = d.entries.find((x: any) => x.id === id);
        if (e) { e.title = String(title == null ? "" : title); await this._wvOutlinePersist(); }
    }

    /** Reset an entry's title to its frozen original (`source.title`). */
    async _wvOutlineResetEntryName(libraryID: number, itemKey: string, id: string) {
        await this._wvOutlineInit();
        const d = this._wvOutlineDoc(libraryID, itemKey);
        if (!d || !Array.isArray(d.entries)) return;
        const e = d.entries.find((x: any) => x.id === id);
        if (e && e.source && typeof e.source.title === "string") {
            e.title = e.source.title;
            await this._wvOutlinePersist();
        }
    }

    /** Persist an entry's ESTABLISHED navigation position (`resolvedPosition`).
     *  The embedded outline's own dests are coarse page-top points; the precise
     *  heading box is recovered ONCE (from the frozen original title) and stored
     *  here, so navigation thereafter uses this saved box directly and never
     *  re-searches the PDF -- editing the display title can't move the target.
     *  A recovery that FAILS stores the coarse point itself, which still counts
     *  as established (so it isn't re-searched every click). */
    async _wvOutlineSetEntryPosition(libraryID: number, itemKey: string, id: string, position: any,
            regionTitle?: string) {
        await this._wvOutlineInit();
        const d = this._wvOutlineDoc(libraryID, itemKey);
        if (!d || !Array.isArray(d.entries)) return;
        const e = d.entries.find((x: any) => x.id === id);
        if (e) {
            e.resolvedPosition = position;
            // WHICH title this region was detected from. "Re-detect Region from
            // Title" is only offered while the entry's title differs from this,
            // i.e. only when re-detecting could actually land somewhere new --
            // re-running it against the same text would just redo the same work.
            if (regionTitle != null) e.regionTitle = regionTitle;
            await this._wvOutlinePersist();
        }
    }

    /** Discard the curated outline -- revert to embedded/extracted. */
    async _wvOutlineRevert(libraryID: number, itemKey: string) {
        await this._wvOutlineInit();
        delete this._wvOutlineStore()[this._bmReaderKey(libraryID, itemKey)];
        await this._wvOutlinePersist();
    }

    /** Which section a record belongs to, by type/identity (no reader needed —
     *  mirrors _wvReaderBookmarkIsLocal but keyed off the attachment). */
    _bmReaderEntrySection(attLibraryID: number, attItemKey: string, rec: any): "local" | "global" {
        try {
            if (!rec) return "global";
            // URL / app-link bookmarks never point INTO the document —
            // always file them under "Elsewhere in Zotero".
            if (rec.type === "url") return "global";
            // `position` (pin: precise spot with rects), `page` (whole-page
            // bookmark, no rects), and `text` (selected text) are in-doc
            // bookmark types — all local by default unless carrying a
            // cross-doc source ref.
            if (rec.type === "position" || rec.type === "page"
                    || rec.type === "text" || rec.type === "folder") {
                // Folders carry their own section via _section; default local.
                if (rec.type === "folder") return rec._section === "global" ? "global" : "local";
                // A location bookmark carrying a source ref to a DIFFERENT
                // attachment (a text selection dragged from another document)
                // is elsewhere, not in this document.
                if (rec.srcItemKey
                    && (rec.srcLibraryID !== attLibraryID || rec.srcItemKey !== attItemKey)) {
                    return "global";
                }
                return "local";
            }
            if (rec.type === "item") {
                if (rec.libraryID === attLibraryID && rec.itemKey === attItemKey) return "local";
                const it: any = Zotero.Items.getByLibraryAndKey(rec.libraryID, rec.itemKey);
                const att: any = Zotero.Items.getByLibraryAndKey(attLibraryID, attItemKey);
                if (it && att && typeof it.isAnnotation === "function" && it.isAnnotation()
                    && it.parentItemID === att.id) return "local";
            }
        } catch (_) {}
        return "global";
    }

    /** The per-attachment store value as { local: Node[], global: Node[] },
     *  migrating a legacy flat array (split by section) on first access. */
    _bmReaderDoc(libraryID: number, itemKey: string): any {
        const store = this._bmReaderStore();
        const key = this._bmReaderKey(libraryID, itemKey);
        let v = store[key];
        if (Array.isArray(v)) {
            const local: any[] = [], global: any[] = [];
            for (const e of v) (this._bmReaderEntrySection(libraryID, itemKey, e) === "local" ? local : global).push(e);
            v = { local, global };
            store[key] = v;
        } else if (!v || typeof v !== "object") {
            v = { local: [], global: [] };
            store[key] = v;
        } else {
            if (!Array.isArray(v.local)) v.local = [];
            if (!Array.isArray(v.global)) v.global = [];
        }
        return v;
    }

    /** The tree array for one section. */
    _bmReaderSection(libraryID: number, itemKey: string, section: "local" | "global"): any[] {
        const doc = this._bmReaderDoc(libraryID, itemKey);
        return section === "global" ? doc.global : doc.local;
    }

    /** Flattened bookmark records (folders excluded) across BOTH sections —
     *  used for counts and identity checks. */
    _bmReaderList(libraryID: number, itemKey: string): any[] {
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const out: any[] = [];
        const walk = (nodes: any[]) => {
            for (const n of nodes) {
                if (n.type === "folder") walk(n.children || []);
                else out.push(n);
            }
        };
        walk(doc.local); walk(doc.global);
        return out;
    }

    /** Add a bookmark to the appropriate section's root. `rec` carries the
     *  type-specific fields (location bookmark or collections-pane-style
     *  target). Firefox-style list semantics: the same target may be
     *  bookmarked multiple times (filed into several folders, kept as
     *  separate copies, etc.). `opts.allowDuplicate` is accepted for
     *  backward compatibility but has no effect — adds always proceed. */
    async _bmReaderAdd(libraryID: number, itemKey: string, rec: any, opts?: any) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        rec = rec || {};
        // Destination section is always derived from the record's
        // identity (`_bmReaderEntrySection`). No caller override:
        // Elsewhere bookmarks are not allowed in the local section, so a
        // wrong-button add (e.g. picking another doc's item from the
        // "This Document" +) still files correctly under Elsewhere.
        const section = this._bmReaderEntrySection(libraryID, itemKey, rec);
        const entry = Object.assign(
            { id: "wv-" + Zotero.Utilities.randomString(8), type: "position", created: new Date().toISOString() },
            rec);
        // Remember the auto-generated label immutably so a later rename (which
        // overwrites `label` for DISPLAY only) never loses the original text.
        // Bookmark-only: lives in our JSON store, never written to the Zotero item.
        if (entry.type !== "folder" && entry.label && entry.originalLabel == null) {
            entry.originalLabel = entry.label;
        }
        doc[section].push(entry);
        await this._bmPersist();
        // First-bookmark-on-empty-doc transition: tell the reader-panels
        // gate to re-evaluate the Bookmarks tab visibility for any open
        // reader on this attachment, so an auto-hidden tab pops back in.
        try { this._wvReaderRefreshBookmarksTabAll(libraryID, itemKey); } catch (_) {}
        return entry;
    }

    /** Remove a node (bookmark or folder + its contents) from either section. */
    async _bmReaderRemove(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc) return;
        loc.parentArr.splice(loc.index, 1);
        if (!doc.local.length && !doc.global.length) {
            delete this._bmReaderStore()[this._bmReaderKey(libraryID, itemKey)];
        }
        await this._bmPersist();
        // Last-bookmark-removed transition: re-evaluate the auto-hide
        // gate so the tab vanishes when the doc has become empty.
        try { this._wvReaderRefreshBookmarksTabAll(libraryID, itemKey); } catch (_) {}
    }

    /** Rename a bookmark (label) or folder (name) anywhere in either tree. For a
     *  bookmark this sets a CUSTOM display name and flags it `renamed` so the
     *  live source sync no longer overwrites `label`. `originalLabel` is left
     *  alone (it keeps tracking the source). Bookmark-record only — the Zotero
     *  item is never touched. */
    async _bmReaderRename(libraryID: number, itemKey: string, id: string, label: string) {
        await this._bmInit();
        if (!label) return;
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc) return;
        if (loc.entry.type === "folder") loc.entry.name = label;
        else { loc.entry.label = label; loc.entry.renamed = true; }
        await this._bmPersist();
    }

    /** The live source name for a bookmark's target — annotation text/comment,
     *  item title, collection/library name, or page. Returns null for targets
     *  with no derivable live source (text selections; deleted items). READ-ONLY:
     *  never writes to the item. */
    _bmReaderDeriveSourceLabel(bm: any): string | null {
        try {
            if (!bm) return null;
            switch (bm.type) {
                case "item": {
                    const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
                    if (!it) return null;
                    if (it.isAnnotation && it.isAnnotation()) return this._wvReaderAnnLabel(it);
                    let title = "";
                    try { title = it.getDisplayTitle ? it.getDisplayTitle() : (it.getField ? it.getField("title") : ""); } catch (_) {}
                    return title ? String(title) : null;
                }
                case "collection": {
                    const c: any = (bm.collectionKey && Zotero.Collections.getByLibraryAndKey)
                        ? Zotero.Collections.getByLibraryAndKey(bm.libraryID, bm.collectionKey) : null;
                    return (c && c.name) ? String(c.name) : null;
                }
                case "library": {
                    const lib: any = Zotero.Libraries.get(bm.libraryID);
                    return (lib && lib.name) ? String(lib.name) : null;
                }
                case "position": {
                    // Use the live-aware page-label resolver so a pin that
                    // changed pages (drag, re-anchor) tracks the current
                    // PDF label table on every re-render, rather than the
                    // stale `bm.pageLabel` captured at create / last-move
                    // time. The resolver falls back to bm.pageLabel when no
                    // open reader matches.
                    const live = this._bmReaderPageLabel(bm);
                    return live ? ("Page " + live) : null;
                }
                case "treerow": {
                    // Re-derive the live tree-row name (saved-search / special-
                    // view name) from the rowID via the main window's collections
                    // tree, so a renamed treerow can see + reset to its source
                    // name even when no `originalLabel` snapshot was captured.
                    // `_bmReaderOriginalLabel` falls back to the stored snapshot
                    // when the row isn't currently in the tree.
                    try {
                        const w = Zotero.getMainWindow();
                        const cv = w && w.ZoteroPane && w.ZoteroPane.collectionsView;
                        if (cv && bm.rowID != null && typeof cv.getRow === "function") {
                            for (let i = 0; i < cv.rowCount; i++) {
                                const r = cv.getRow(i);
                                if (r && r.id === bm.rowID && typeof r.getName === "function") {
                                    const nm = r.getName();
                                    return nm ? String(nm) : null;
                                }
                            }
                        }
                    } catch (_) {}
                    return null;
                }
                default:
                    return null;   // text (no live source — snapshot only)
            }
        } catch (_) { return null; }
    }

    /** Whether the user has given this bookmark a custom name. Uses the explicit
     *  `renamed` flag; falls back (for pre-flag bookmarks) to comparing label vs
     *  originalLabel. */
    _bmReaderIsRenamed(bm: any): boolean {
        if (!bm || bm.type === "folder") return false;
        if (bm.renamed != null) return !!bm.renamed;
        return bm.originalLabel != null && bm.label !== bm.originalLabel;
    }

    /** The bookmark's ORIGINAL (auto-generated) name — the live source name when
     *  available, else the last stored `originalLabel`. Used for the tooltip on a
     *  renamed bookmark and for "Reset to original name". READ-ONLY. */
    _bmReaderOriginalLabel(bm: any): string | null {
        if (!bm || bm.type === "folder") return null;
        const live = this._bmReaderDeriveSourceLabel(bm);
        if (live) return live;
        return bm.originalLabel != null ? String(bm.originalLabel) : null;
    }

    /** The page label to show for a bookmark: the stored `pageLabel` (position /
     *  text bookmarks capture it at creation), else — for an annotation item
     *  bookmark — the annotation's live page. Empty string when there's no page.
     *  READ-ONLY. */
    _bmReaderPageLabel(bm: any): string {
        try {
            if (!bm) return "";
            // ANNOTATION bookmark → `annotationPageLabel` directly (same as
            // upstream's annotations sidebar; never re-derive, so the two
            // listings always agree).
            if (bm.type === "item") {
                let it: any = null;
                try { it = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey); } catch (_) {}
                if (it && it.isAnnotation && it.isAnnotation() && it.annotationPageLabel) {
                    return String(it.annotationPageLabel);
                }
            }
            // PIN / TEXT bookmark → match the ANNOTATIONS-SIDEBAR convention,
            // which uses `annotationPageLabel` stored on each annotation (NOT
            // the PDF's `_pageLabels` table). The two can disagree: a PDF may
            // ship rich labels like "4843" while annotations were saved when
            // those labels weren't loaded yet so they got `pageIndex + 1`
            // ("5"). The user wants pin/text to read like an annotation, so:
            //   1. Look up any annotation on the same pageIndex of this
            //      attachment → use its annotationPageLabel.
            //   2. No annotation on that page → fall back to pageIndex + 1
            //      (what Zotero's annotation code uses as a last resort).
            // We never reach for pv._pageLabels here — it answers a different
            // question ("what does the PDF call this page?") that we don't
            // want to expose, since it'd disagree with the annotation row.
            if ((bm.type === "position" || bm.type === "page" || bm.type === "text")
                    && bm.position && Number.isInteger(bm.position.pageIndex)) {
                const pageIndex = bm.position.pageIndex;
                // Find this bookmark's owning attachment. LOCAL records carry
                // no libraryID/itemKey — they're identified only by being in a
                // particular attachment's doc.local list. CROSS-DOC ("global")
                // records carry srcLibraryID/srcItemKey.
                const srcLib = bm.srcLibraryID != null ? bm.srcLibraryID : null;
                const srcKey = bm.srcItemKey || null;
                let att: any = null;
                try {
                    if (srcLib != null && srcKey) {
                        const id = Zotero.Items.getIDFromLibraryAndKey(srcLib, srcKey);
                        if (id) att = Zotero.Items.get(id);
                    } else {
                        const readers: any[] = (Zotero as any).Reader && (Zotero as any).Reader._readers || [];
                        for (const r of readers) {
                            let cand: any = null;
                            try { cand = Zotero.Items.get(r.itemID); } catch (_) {}
                            if (!cand) continue;
                            const rdoc = this._bmReaderDoc(cand.libraryID, cand.key);
                            const owns = !!(rdoc && rdoc.local && rdoc.local.some((n: any) => n && n.id === bm.id));
                            if (owns) { att = cand; break; }
                        }
                    }
                } catch (_) {}
                if (att && att.getAnnotations) {
                    try {
                        for (const a of (att.getAnnotations() || [])) {
                            try {
                                const raw = a.annotationPosition;
                                const pos = (typeof raw === "string") ? JSON.parse(raw) : raw;
                                if (pos && pos.pageIndex === pageIndex
                                        && a.annotationPageLabel) {
                                    return String(a.annotationPageLabel);
                                }
                            } catch (__) {}
                        }
                    } catch (_) {}
                }
                // No same-page annotation. Use the index-based fallback (what
                // Zotero itself uses when annotationPageLabel can't be derived
                // from the PDF — keeps pin labels in the same "number space"
                // as annotation labels).
                return String(pageIndex + 1);
            }
            if (bm.pageLabel) return String(bm.pageLabel);
            return "";
        } catch (_) { return ""; }
    }

    /** Keep `originalLabel` in sync with the live source for every bookmark of
     *  this attachment, and (when NOT renamed) `label` too, so default names
     *  track edits to the underlying annotation/item/collection/library. The
     *  original data stays current even for renamed bookmarks where it isn't
     *  displayed. Synchronous in-memory update + one debounced persist if
     *  anything changed. Item never modified. */
    _bmReaderSyncLabels(libraryID: number, itemKey: string) {
        try {
            if (!this._bmDoc) return;
            const doc = this._bmReaderDoc(libraryID, itemKey);
            let changed = false;
            const walk = (nodes: any[]) => {
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { walk(n.children || []); continue; }
                    const renamed = this._bmReaderIsRenamed(n);
                    if (n.renamed == null) { n.renamed = renamed; changed = true; }   // migrate old records
                    const derived = this._bmReaderDeriveSourceLabel(n);
                    if (derived == null) continue;                                    // no live source — keep stored
                    if (n.originalLabel !== derived) { n.originalLabel = derived; changed = true; }
                    if (!renamed && n.label !== derived) { n.label = derived; changed = true; }
                }
            };
            walk(doc.local); walk(doc.global);
            if (changed) this._bmPersist();
        } catch (_) {}
    }

    /** Reset a bookmark's display name back to the original (live source) name
     *  and clear its renamed flag, so it resumes tracking the source. Bookmark-
     *  record only — the Zotero item is untouched. */
    async _bmReaderResetLabel(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type === "folder") return;
        const orig = this._bmReaderOriginalLabel(loc.entry);
        if (!orig) return;
        loc.entry.label = orig;
        loc.entry.originalLabel = orig;
        loc.entry.renamed = false;
        await this._bmPersist();
    }

    /** Sets of the item + collection keys bookmarked for this attachment — for a
     *  cheap test of whether a changed item/collection affects this pane.
     *  READ-ONLY. */
    _bmReaderBookmarkedKeys(libraryID: number, itemKey: string): { items: Set<string>; collections: Set<string> } {
        const out = { items: new Set<string>(), collections: new Set<string>() };
        try {
            if (!this._bmDoc) return out;
            const doc = this._bmReaderDoc(libraryID, itemKey);
            const walk = (nodes: any[]) => {
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { walk(n.children || []); continue; }
                    if (n.type === "item" && n.itemKey) out.items.add(n.itemKey);
                    else if (n.type === "collection" && n.collectionKey) out.collections.add(n.collectionKey);
                }
            };
            walk(doc.local); walk(doc.global);
        } catch (_) {}
        return out;
    }

    /** Reorder / nest `draggedId` relative to `targetId` (mode
     *  before|after|into) WITHIN its section. Cross-section moves are refused
     *  (a bookmark's section is intrinsic to its type). A null target drops at
     *  the dragged item's section root. */
    async _bmReaderMove(libraryID: number, itemKey: string, draggedId: string, targetId: string | null, mode: string) {
        await this._bmInit();
        if (draggedId === targetId) return;
        const doc = this._bmReaderDoc(libraryID, itemKey);
        let srcSection: any = null, src: any = null;
        for (const s of ["local", "global"]) { const f = this._bmLocate(draggedId, doc[s]); if (f) { src = f; srcSection = s; break; } }
        if (!src) return;
        if (targetId) {
            let tgtSection: any = null;
            for (const s of ["local", "global"]) { if (this._bmLocate(targetId, doc[s])) { tgtSection = s; break; } }
            if (tgtSection && tgtSection !== srcSection) return;   // no cross-section moves
        }
        if (src.entry.type === "folder" && targetId && this._bmIsDescendant(targetId, src.entry)) return;
        const arr = doc[srcSection];
        const moved = src.parentArr.splice(src.index, 1)[0];
        if ((mode === "into" || mode === "intotop") && targetId) {
            const t = this._bmLocate(targetId, arr);
            if (t && t.entry.type === "folder") {
                t.entry.children = t.entry.children || [];
                // "intotop" inserts as the FIRST child (the slot just below an
                // expanded folder's header); "into" appends to the end.
                if (mode === "intotop") t.entry.children.unshift(moved);
                else t.entry.children.push(moved);
                t.entry.expanded = true;
            }
            else arr.push(moved);
        } else if (targetId) {
            const t = this._bmLocate(targetId, arr);
            if (!t) arr.push(moved);
            else t.parentArr.splice(t.index + (mode === "after" ? 1 : 0), 0, moved);
        } else {
            arr.push(moved);
        }
        await this._bmPersist();
    }

    /** Create a folder at a section's root, or inside `parentId` (a folder in
     *  the same section) for a subfolder; returns its id. */
    async _bmReaderAddFolder(libraryID: number, itemKey: string, section: "local" | "global", name: string, parentId?: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const folder = {
            id: "wv-" + Zotero.Utilities.randomString(8), type: "folder",
            name: name || "New Folder", expanded: true, _section: section,
            created: new Date().toISOString(), children: [] as any[],
        };
        let arr: any[] = (section === "global" ? doc.global : doc.local);
        if (parentId) {
            const loc = this._bmLocate(parentId, doc.local) || this._bmLocate(parentId, doc.global);
            if (loc && loc.entry.type === "folder") {
                loc.entry.children = loc.entry.children || [];
                loc.entry.expanded = true;
                arr = loc.entry.children;
            }
        }
        arr.push(folder);
        await this._bmPersist();
        return folder.id;
    }

    /** Merge updates (e.g. a moved `position` + new pageLabel/label) onto a
     *  reader bookmark anywhere in either section tree. */
    async _bmReaderUpdatePosition(libraryID: number, itemKey: string, id: string, updates: any) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type === "folder") return;
        Object.assign(loc.entry, updates || {});
        await this._bmPersist();
    }

    async _bmReaderToggleFolder(libraryID: number, itemKey: string, id: string) {
        await this._bmInit();
        const doc = this._bmReaderDoc(libraryID, itemKey);
        const loc = this._bmLocate(id, doc.local) || this._bmLocate(id, doc.global);
        if (!loc || loc.entry.type !== "folder") return;
        loc.entry.expanded = !loc.entry.expanded;
        await this._bmPersist();
    }

    /** Load the file into `_bmDoc` once (cached promise). Missing → fresh;
     *  unreadable → backed up to `*.corrupt-<ts>` and start clean. */
    _bmInit() {
        if (this._bmInitPromise) return this._bmInitPromise;
        this._bmInitPromise = (async () => {
            const path = this._bmFilePath();
            try {
                const text: any = await Zotero.File.getContentsAsync(path);
                this._bmDoc = this._bmNormalize(JSON.parse(text));
            } catch (e) {
                let exists = false;
                try { exists = await IOUtils.exists(path); } catch (_) {}
                if (exists) {
                    const bak = path + ".corrupt-" + Date.now();
                    try { await IOUtils.move(path, bak); } catch (_) {}
                    Zotero.debug("[Weavero] bookmarks.json unreadable, backed up to "
                        + bak + ": " + e);
                }
                this._bmDoc = { version: 2, bookmarks: [] };
            }
            try { this._bmMigratePageTypes(); } catch (e) {
                Zotero.debug("[Weavero] _bmMigratePageTypes err: " + e);
            }
            try { this._bmMigrateSectionPlacement(); } catch (e) {
                Zotero.debug("[Weavero] _bmMigrateSectionPlacement err: " + e);
            }
            // Now that the bookmarks store is loaded, re-evaluate the
            // Bookmarks tab on every open reader. Two things need
            // catching up:
            //   1. The auto-hide gate ran with `_bmDoc` null at reader-
            //      open time (post-restart race) and skipped its check;
            //      now apply it.
            //   2. `_wvReaderApplyBmTabState` reads the persisted
            //      "tab was active" pref AND now sees an actual stored
            //      bookmark list, so restoring the user's last-active
            //      tab on each attachment is fully accurate from here.
            try {
                if (typeof this._wvReaderRefreshBookmarksTabAll === "function") {
                    this._wvReaderRefreshBookmarksTabAll();
                }
            } catch (e) {
                Zotero.debug("[Weavero] post-init reader refresh err: " + e);
            }
            // Same race for the library toolbar button: if
            // autoHideEmptyLibraryBookmarks is on, `_setupBookmarksToolbarButton`
            // ran before `_bmDoc` was loaded and skipped the empty-check,
            // showing the button regardless. Re-run it now that the
            // store is loaded so the auto-hide actually applies.
            if (this._getAutoHideEmptyLibraryBookmarks()) {
                try {
                    const wins: any = Zotero.getMainWindows && Zotero.getMainWindows();
                    if (wins) for (const w of wins) {
                        try { this._setupBookmarksToolbarButton(w); } catch (_) {}
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] post-init lib-toolbar refresh err: " + e);
                }
            }
            return this._bmDoc;
        })();
        return this._bmInitPromise;
    }

    /** One-time migration of dev.13–dev.20 page bookmarks. The buggy
     *  thumbnail "Add Bookmark to This Page" entry stored whole-page
     *  records as `type: "position"` with `position.pageIndex` set and
     *  no `position.rects`. With the page/pin split (dev.21), those
     *  rebrand to `type: "page"` so the icon picker (ribbon), navigator
     *  (scroll-to-page, no pin), and dedup all key off the correct type.
     *  Idempotent (no-op once the records are already `"page"`). Skips
     *  any `position` record that has real rects — those are real pins. */
    _bmMigratePageTypes() {
        if (!this._bmDoc || !this._bmDoc.readerBookmarks) return;
        let changed = false;
        const walk = (arr: any[]) => {
            for (const n of (arr || [])) {
                if (!n) continue;
                if (n.type === "folder") { walk(n.children); continue; }
                if (n.type === "position"
                    && n.position
                    && Number.isInteger(n.position.pageIndex)
                    && (!Array.isArray(n.position.rects)
                        || n.position.rects.length === 0)) {
                    n.type = "page";
                    changed = true;
                }
            }
        };
        for (const key of Object.keys(this._bmDoc.readerBookmarks)) {
            const doc = this._bmDoc.readerBookmarks[key];
            if (!doc) continue;
            walk(doc.local);
            walk(doc.global);
        }
        if (changed) {
            try { this._bmPersist(); } catch (_) {}
        }
    }

    /** Repair reader bookmarks that landed in the wrong section due to
     *  an earlier per-section "+" override (now removed): records whose
     *  identity-derived section (`_bmReaderEntrySection`) doesn't match
     *  the array they sit in get extracted (from any depth, including
     *  inside folders) and re-appended at the root of the correct
     *  section. Folders themselves stay in their own section — they're
     *  organizational and have no inherent "local vs global" identity.
     *  Idempotent: a second pass over a clean store does nothing. */
    _bmMigrateSectionPlacement() {
        if (!this._bmDoc || !this._bmDoc.readerBookmarks) return;
        let changed = false;
        for (const key of Object.keys(this._bmDoc.readerBookmarks)) {
            const doc = this._bmDoc.readerBookmarks[key];
            if (!doc || typeof doc !== "object") continue;
            const colon = key.indexOf(":");
            if (colon < 0) continue;
            const libraryID = Number(key.slice(0, colon));
            const itemKey = key.slice(colon + 1);
            if (!Number.isFinite(libraryID) || !itemKey) continue;

            // `moved.local` = records that SHOULD be local but were found
            // in the global tree (will be appended to local root after
            // both sides are filtered). Symmetric for `moved.global`.
            const moved: { local: any[], global: any[] } = { local: [], global: [] };
            const filter = (nodes: any[], wantSection: "local" | "global"): any[] => {
                const kept: any[] = [];
                for (const n of (nodes || [])) {
                    if (!n) continue;
                    if (n.type === "folder") {
                        n.children = filter(n.children || [], wantSection);
                        kept.push(n);
                        continue;
                    }
                    const actual = this._bmReaderEntrySection(libraryID, itemKey, n);
                    if (actual !== wantSection) moved[actual].push(n);
                    else kept.push(n);
                }
                return kept;
            };
            const newLocal = filter(Array.isArray(doc.local) ? doc.local : [], "local");
            const newGlobal = filter(Array.isArray(doc.global) ? doc.global : [], "global");
            if (moved.local.length || moved.global.length) {
                for (const n of moved.local) newLocal.push(n);
                for (const n of moved.global) newGlobal.push(n);
                doc.local = newLocal;
                doc.global = newGlobal;
                changed = true;
            }
        }
        if (changed) {
            try { this._bmPersist(); } catch (_) {}
        }
    }

    /** Open the side chip-filter popup (a separate XUL panel) anchored
     *  to the right of the bookmarks popup so the bookmark list stays
     *  fully visible while filtering. The funnel button toggles it. */
    _bmOpenLibChipPopup(win: any, anchorBtn: any) {
        const doc: any = win && win.document;
        if (!doc) return;
        if (doc.getElementById(BM_CHIP_POPUP_ID)) return;
        const bmPanel = doc.getElementById(BM_POPUP_ID);
        if (!bmPanel) return;
        const panel = doc.createXULElement("panel");
        panel.id = BM_CHIP_POPUP_ID;
        panel.setAttribute("animate", "false");
        panel.setAttribute("noautohide", "true");
        panel.setAttribute("consumeoutsideclicks", "false");
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.id = BM_CHIP_INNER_ID;
        panel.appendChild(inner);
        const host = doc.getElementById("mainPopupSet") || doc.documentElement;
        host.appendChild(panel);
        this._bmRenderLibChipBar(doc, win, inner);
        // Anchor the chip popup to the FUNNEL BUTTON inside the
        // bookmarks popup: its top edge lines up with the funnel
        // icon's top edge (clear visual link between the button
        // and the popup it opens), and its left edge sits just
        // past the bookmarks popup's right edge so the popup
        // appears beside (not over) the bookmark list. Fall back
        // to the bookmarks popup top if the funnel button isn't
        // reachable for some reason.
        try {
            const bmR = bmPanel.getBoundingClientRect();
            const aR = anchorBtn ? anchorBtn.getBoundingClientRect() : null;
            const x = win.screenX + bmR.right;
            const y = win.screenY + (aR ? aR.top : bmR.top);
            panel.openPopupAtScreen(x, y, false);
        } catch (_) {
            try { panel.openPopup(anchorBtn || bmPanel, "end_before", 0, 0, false, false); } catch (__) {}
        }
    }

    _bmCloseLibChipPopup(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc = win && win.document;
        if (!doc) return;
        const panel = doc.getElementById(BM_CHIP_POPUP_ID);
        if (!panel) return;
        try { panel.hidePopup(); } catch (_) {}
        try { panel.remove(); } catch (_) {}
    }

    /** Chip-filter state for the library bookmarks toolbar popup —
     *  parallel to `_wvReaderBmChipState` but scoped to the chrome-window
     *  popup. Lazy init; reset via `_bmLibResetChipState` on popup close. */
    _bmLibChipState() {
        if (!this._bmLibChipStateBag) {
            this._bmLibChipStateBag = {
                colors: new Set<string>(),
                tags: new Set<string>(),
                authors: new Set<string>(),
                types: new Set<string>(),
                colorsExcl: new Set<string>(),
                tagsExcl: new Set<string>(),
                authorsExcl: new Set<string>(),
                typesExcl: new Set<string>(),
            };
        }
        return this._bmLibChipStateBag;
    }

    _bmLibResetChipState() {
        this._bmLibChipStateBag = null;
    }

    _bmLibChipsActive(): boolean {
        const s = this._bmLibChipStateBag;
        if (!s) return false;
        return (s.colors.size + s.tags.size + s.authors.size + s.types.size
            + (this as any)._wvBmChipExcl(s, "colors").size + (this as any)._wvBmChipExcl(s, "tags").size
            + (this as any)._wvBmChipExcl(s, "authors").size + (this as any)._wvBmChipExcl(s, "types").size) > 0;
    }

    /** Walk the library bookmarks tree and collect facet counts for the
     *  chip popup. Mirrors `_wvReaderBmChipFacets` but only over the
     *  library store (no per-attachment doc bookmarks). */
    _bmLibChipFacets() {
        const colors = new Map<string, number>();
        const tags = new Map<string, { color: string, count: number, position: number }>();
        const authors = new Map<string, number>();
        const types = new Map<string, number>();
        try {
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
                            let tpos = Number.POSITIVE_INFINITY;
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
            collect((this._bmDoc && this._bmDoc.bookmarks) || []);
        } catch (_) {}
        return { colors, tags, authors, types };
    }

    /** Render the chip rows (colors / types / tags / authors) into the
     *  given container. Click on a chip toggles its inclusion in the
     *  filter state; the bookmark list re-renders live via
     *  `_bmRefreshPopupList`. Layout mirrors the reader-sidebar chip
     *  popup (`_wvReaderRenderBmChipBar`). */
    _bmRenderLibChipBar(doc: any, win: any, bar: any) {
        while (bar.firstChild) bar.firstChild.remove();
        const st = this._bmLibChipState();
        const facets = this._bmLibChipFacets();
        const TYPE_ORDER = ["highlight", "underline", "note", "text", "image", "ink"];
        const TYPE_NAME: { [k: string]: string } = {
            highlight: "Highlights", underline: "Underlines", note: "Notes",
            text: "Text annotations", image: "Image annotations", ink: "Ink annotations",
        };
        const anyFacets = facets.colors.size || facets.tags.size || facets.authors.size || facets.types.size;
        if (!anyFacets) {
            const empty = doc.createElementNS(NS_HTML, "div");
            empty.className = "wv-bm-chip-bar-lib-empty";
            empty.textContent = "No filters available for the current bookmark list.";
            bar.appendChild(empty);
            return;
        }
        // `wv-filter-or-group` adds the same subtle grey background tint
        // the library filter popup uses on its OR-group rows (color,
        // type, file-type, etc.) — visually marks each chip row as a
        // "pick any of these" set. CSS rule lives in constants.ts
        // (global in the chrome window).
        const mkRow = () => {
            const r = doc.createElementNS(NS_HTML, "div");
            r.className = "wv-bm-chip-row wv-filter-or-group";
            return r;
        };
        const toggle = (set: Set<string>, key: string) => { if (set.has(key)) set.delete(key); else set.add(key); };
        const rerender = () => {
            try {
                this._bmRefreshPopupList(win);
                this._bmRenderLibChipBar(doc, win, bar);
                // Funnel reflects "popup open OR any selection" (sticky bg
                // tint via wv-active) AND "any chip selected" (blue dot via
                // wv-bm-lib-filter-active). `:has(.wv-bm-funnel-chev)` picks
                // the filter button — the prior selector matched the SEARCH
                // button instead (it carries `.wv-bm-funnel-spacer`).
                const fb = doc.getElementById(BM_INNER_ID)?.querySelector(".wv-bm-iconbtn:has(.wv-bm-funnel-chev)");
                if (fb) {
                    fb.classList.toggle("wv-active",
                        !!doc.getElementById(BM_CHIP_POPUP_ID) || this._bmLibChipsActive());
                    fb.classList.toggle("wv-bm-lib-filter-active",
                        this._bmLibChipsActive());
                }
            } catch (_) {}
        };

        // Colors row — same SVG tile (IconColor16 path + black-0.1 stroke
        // ring) the reader chip popup uses, in canonical Zotero palette
        // order with extras alphabetical at the end.
        if (facets.colors.size) {
            const row = mkRow();
            const CANON = ["#ffd400", "#ff6666", "#5fb236", "#2ea8e5",
                "#a28ae5", "#e56eee", "#f19837", "#aaaaaa", "#000000"];
            const rank = (c: string): number => {
                const i = CANON.indexOf(String(c || "").toLowerCase());
                return i < 0 ? CANON.length : i;
            };
            const keys = Array.from(facets.colors.keys()).sort((a, b) => {
                const ra = rank(a), rb = rank(b);
                return ra !== rb ? ra - rb : a.localeCompare(b);
            });
            for (const c of keys) {
                // Black sits apart from the standard 8-colour palette
                // (upstream Zotero treats it as EXTRA_INK_AND_TEXT_COLORS
                // — only valid for ink/text annotations). Push it to the
                // right edge after a thin vertical separator — same
                // pattern the library filter uses in filter.ts.
                if (c === "#000000") {
                    const sep: any = doc.createElementNS(NS_HTML, "div");
                    sep.className = "wv-filter-vertical-separator";
                    sep.style.marginLeft = "auto";
                    row.appendChild(sep);
                }
                // Unified with the library filter popup (popup 1):
                // 26×28 button holding the Zotero-native rounded-square
                // swatch (filter.ts _wvNativeColorSwatch),
                // `data-selected="true"` for the highlight state.
                const btn: any = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt wv-filter-opt-icon";
                btn.setAttribute("title", c + " — " + facets.colors.get(c) + " annotation(s) — Alt+click to exclude");
                if (st.colors.has(c)) btn.dataset.selected = "true";
                if ((this as any)._wvBmChipExcl(st, "colors").has(c)) btn.dataset.excluded = "true";
                btn.appendChild((this as any)._wvNativeColorSwatch(doc, c));
                btn.addEventListener("click", (e: any) => { (this as any)._wvBmChipToggle(st, "colors", c, !!e.altKey); rerender(); });
                row.appendChild(btn);
            }
            bar.appendChild(row);
        }
        // Types row — canonical annotation-type ordering. The SVGs are
        // imported via DOMParser because innerHTML doesn't parse inline
        // SVG correctly inside the XUL <panel> context (unlike the
        // reader's HTML iframe, where the same code in
        // `_wvReaderRenderBmChipBar` uses innerHTML directly).
        if (facets.types.size) {
            const row = mkRow();
            const keys = TYPE_ORDER.filter(t => facets.types.has(t));
            for (const tp of keys) {
                // Unified with the library filter popup: 30×28 button
                // containing the 16×16 annotate-* SVG glyph. DOMParser
                // import because innerHTML doesn't parse inline SVG
                // correctly inside the XUL <panel> context.
                const chip: any = doc.createElementNS(NS_HTML, "button");
                chip.type = "button";
                chip.className = "wv-filter-opt wv-filter-opt-icon";
                chip.setAttribute("title", (TYPE_NAME[tp] || tp) + " — " + facets.types.get(tp) + " — Alt+click to exclude");
                if (st.types.has(tp)) chip.dataset.selected = "true";
                if ((this as any)._wvBmChipExcl(st, "types").has(tp)) chip.dataset.excluded = "true";
                const svgStr = BM_ANN_TYPE_SVG[tp];
                if (svgStr) {
                    try {
                        const parsed = new (win as any).DOMParser().parseFromString(svgStr, "image/svg+xml");
                        const svgEl = parsed && parsed.documentElement;
                        if (svgEl) chip.appendChild(doc.importNode(svgEl, true));
                    } catch (_) {}
                }
                chip.addEventListener("click", (e: any) => { (this as any)._wvBmChipToggle(st, "types", tp, !!e.altKey); rerender(); });
                row.appendChild(chip);
            }
            bar.appendChild(row);
        }
        // Tags row — colored tags first (sorted by their library color
        // position), then plain tags alphabetically, ALL on a single
        // wrapping row. Matches the reader filter popup's pattern (the
        // user can scan a flat list of "tags in this library bookmark
        // set" without artificial group splits). Capped via CSS at
        // ~170 px tall with vertical scroll when there are many tags.
        if (facets.tags.size) {
            const allKeys = Array.from(facets.tags.keys());
            const coloured = allKeys.filter(k => !!facets.tags.get(k)!.color).sort((a, b) => {
                const pa = facets.tags.get(a)!.position;
                const pb = facets.tags.get(b)!.position;
                return pa !== pb ? pa - pb : a.localeCompare(b);
            });
            const plain = allKeys.filter(k => !facets.tags.get(k)!.color).sort((a, b) => a.localeCompare(b));
            const keys = [...coloured, ...plain];
            const row = mkRow();
            row.classList.add("wv-bm-tags-row");
            for (const t of keys) {
                const info = facets.tags.get(t)!;
                const chip = doc.createElementNS(NS_HTML, "span");
                chip.className = "wv-bm-chip" + (st.tags.has(t) ? " selected" : "")
                    + ((this as any)._wvBmChipExcl(st, "tags").has(t) ? " excluded" : "");
                chip.setAttribute("title", t + " — " + info.count + " bookmark(s) — Alt+click to exclude");
                if (info.color) {
                    const dot = doc.createElementNS(NS_HTML, "span");
                    dot.className = "wv-bm-chip-tag-dot";
                    dot.style.background = info.color;
                    chip.appendChild(dot);
                }
                const lbl = doc.createElementNS(NS_HTML, "span");
                lbl.textContent = t;
                chip.appendChild(lbl);
                chip.addEventListener("click", (e: any) => { (this as any)._wvBmChipToggle(st, "tags", t, !!e.altKey); rerender(); });
                row.appendChild(chip);
            }
            bar.appendChild(row);
        }
        // Authors row — only when >1 (matching the reader's upstream rule).
        if (facets.authors.size > 1) {
            const row = mkRow();
            const keys = Array.from(facets.authors.keys()).sort((a, b) => a.localeCompare(b));
            for (const a of keys) {
                const chip = doc.createElementNS(NS_HTML, "span");
                chip.className = "wv-bm-chip" + (st.authors.has(a) ? " selected" : "")
                    + ((this as any)._wvBmChipExcl(st, "authors").has(a) ? " excluded" : "");
                chip.setAttribute("title", a + " — " + facets.authors.get(a) + " annotation(s) — Alt+click to exclude");
                chip.textContent = a;
                chip.addEventListener("click", (e: any) => { (this as any)._wvBmChipToggle(st, "authors", a, !!e.altKey); rerender(); });
                row.appendChild(chip);
            }
            bar.appendChild(row);
        }
    }

    /** Root-level entries (folders + bookmarks). */
    _bmGetAll() {
        return (this._bmDoc && Array.isArray(this._bmDoc.bookmarks))
            ? this._bmDoc.bookmarks.slice()
            : [];
    }

    _bmRootArray() {
        return (this._bmDoc && Array.isArray(this._bmDoc.bookmarks))
            ? this._bmDoc.bookmarks : [];
    }

    /** Flattened list of every entry in the tree (folders included). */
    _bmFlatten(nodes?: any[], out?: any[]): any[] {
        nodes = nodes || this._bmRootArray();
        out = out || [];
        for (const n of nodes) {
            out.push(n);
            if (n.type === "folder" && Array.isArray(n.children)) {
                this._bmFlatten(n.children, out);
            }
        }
        return out;
    }

    /** Locate an entry anywhere in the tree → { parentArr, index, entry }. */
    _bmLocate(id: string, nodes?: any[]): any {
        nodes = nodes || this._bmRootArray();
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) return { parentArr: nodes, index: i, entry: nodes[i] };
            if (nodes[i].type === "folder" && Array.isArray(nodes[i].children)) {
                const found = this._bmLocate(id, nodes[i].children);
                if (found) return found;
            }
        }
        return null;
    }

    _bmFindFolder(id: string) {
        const loc = this._bmLocate(id);
        return (loc && loc.entry.type === "folder") ? loc.entry : null;
    }

    /** True if `id` is `folder` itself or anywhere inside it. */
    _bmIsDescendant(id: string, folder: any): boolean {
        if (!folder) return false;
        if (folder.id === id) return true;
        if (!Array.isArray(folder.children)) return false;
        for (const c of folder.children) {
            if (c.id === id) return true;
            if (c.type === "folder" && this._bmIsDescendant(id, c)) return true;
        }
        return false;
    }

    /** Ensure item data for every referenced library is loaded (icons/
     *  labels). First open after a restart may not have group libraries
     *  cached yet, leaving icons blank until the next open. */
    async _bmPreloadTargets() {
        const libIDs = new Set<number>();
        for (const bm of this._bmFlatten()) {
            if (typeof bm.libraryID === "number") libIDs.add(bm.libraryID);
        }
        for (const libID of libIDs) {
            try {
                const lib: any = Zotero.Libraries.get(libID);
                if (lib && typeof lib.waitForDataLoad === "function") {
                    await lib.waitForDataLoad("item");
                }
            } catch (e) {}
        }
    }

    _bmHasItem(libraryID: number, itemKey: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "item" && b.libraryID === libraryID && b.itemKey === itemKey);
    }

    _bmHasCollection(libraryID: number, collectionKey: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "collection" && b.libraryID === libraryID
            && b.collectionKey === collectionKey);
    }

    _bmHasLibrary(libraryID: number) {
        return this._bmFlatten().some((b: any) =>
            b.type === "library" && b.libraryID === libraryID);
    }

    /** A "treerow" bookmark stores a collections-tree row's selectByID id
     *  (e.g. 'S123' saved search, 'D1' duplicates, 'U1' unfiled, 'T1'
     *  trash, 'P1' my publications). */
    _bmHasTreeRow(rowID: string) {
        return this._bmFlatten().some((b: any) =>
            b.type === "treerow" && b.rowID === rowID);
    }

    _bmAddTreeRowSync(rowID: string, libraryID: number, label: string) {
        if (!this._bmDoc || !rowID || this._bmHasTreeRow(rowID)) return false;
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "treerow",
            rowID,
            libraryID,
            label: label || rowID,
            // treerow has no live source to re-derive its name from (unlike
            // item/collection/library), so snapshot the tree-row name immutably
            // — this is what "Reset to Original Name" restores to after a rename.
            originalLabel: label || rowID,
            created: new Date().toISOString(),
        });
        return true;
    }

    /** Atomic, serialized write of the current document to disk. */
    _bmPersist() {
        if (!this._bmDoc) return Promise.resolve();
        this._bmAttBmSet = null;   // bookmark set changed → drop the "has bookmarks" cache
        const snapshot = JSON.stringify(this._bmDoc, null, 2);
        const dir = this._bmDir();
        const path = this._bmFilePath();
        this._bmWriteChain = (this._bmWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) =>
                Zotero.debug("[Weavero] bookmarks persist failed: " + e));
        // If auto-hide-when-empty is on, the library bookmarks count
        // transitioning from 0→1 (or 1→0) must toggle the toolbar
        // button's visibility in every Zotero main window. Cheap call —
        // _setupBookmarksToolbarButton no-ops when the button is already
        // in the right state (it tears down + rebuilds, but only when
        // the prefs and store agree the button SHOULD exist).
        if (this._getAutoHideEmptyLibraryBookmarks()) {
            try {
                const wins: any = Zotero.getMainWindows && Zotero.getMainWindows();
                if (wins) for (const w of wins) {
                    try { this._setupBookmarksToolbarButton(w); } catch (_) {}
                }
            } catch (_) {}
        }
        return this._bmWriteChain;
    }

    _bmAddItemSync(item: any) {
        if (!item || !this._bmDoc) return false;
        const libraryID = item.libraryID;
        const itemKey = item.key;
        // Firefox-style list semantics: duplicates are explicitly allowed.
        // The same item can be bookmarked into multiple folders, or simply
        // bookmarked twice — `_bmHasItem` is no longer consulted at add
        // time. (Callers that need set-semantics can check it themselves.)
        if (!itemKey) return false;
        let label = "";
        try {
            label = (typeof item.getDisplayTitle === "function")
                ? item.getDisplayTitle()
                : (item.getField ? item.getField("title") : "");
        } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "item",
            libraryID,
            itemKey,
            label: label || itemKey,
            created: new Date().toISOString(),
        });
        return true;
    }

    _bmAddCollectionSync(collection: any) {
        if (!collection || !this._bmDoc) return false;
        const libraryID = collection.libraryID;
        const collectionKey = collection.key;
        // Firefox-style list semantics — no `_bmHasCollection` dedup at
        // add time. See `_bmAddItemSync` for rationale.
        if (!collectionKey) return false;
        let label = "";
        try { label = collection.name || ""; } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "collection",
            libraryID,
            collectionKey,
            label: label || collectionKey,
            created: new Date().toISOString(),
        });
        return true;
    }

    _bmAddLibrarySync(libraryID: number) {
        if (!this._bmDoc || typeof libraryID !== "number") return false;
        // Firefox-style list semantics — no `_bmHasLibrary` dedup at
        // add time. See `_bmAddItemSync` for rationale.
        let label = "";
        try { const lib: any = Zotero.Libraries.get(libraryID); label = lib && lib.name; } catch (_) {}
        this._bmDoc.bookmarks.push({
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "library",
            libraryID,
            label: label || ("Library " + libraryID),
            created: new Date().toISOString(),
        });
        return true;
    }

    async _bmBookmarkLibrary(libraryID: number) {
        try {
            await this._bmInit();
            if (this._bmAddLibrarySync(libraryID)) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkLibrary err: " + e);
        }
    }

    async _bmBookmarkCollection(collection?: any) {
        try {
            await this._bmInit();
            if (!collection) {
                const win = Zotero.getMainWindow();
                const zp = win && win.ZoteroPane;
                collection = (zp && typeof zp.getSelectedCollection === "function")
                    ? zp.getSelectedCollection() : null;
            }
            if (!collection || !collection.key) return;
            if (this._bmAddCollectionSync(collection)) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkCollection err: " + e);
        }
    }

    /** Remove an entry (anywhere in the tree). For a folder this drops it
     *  and its contents; folders are normally removed via _bmDeleteFolder. */
    async _bmRemove(id: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc) return;
        loc.parentArr.splice(loc.index, 1);
        await this._bmPersist();
    }

    // ---- Folders ----------------------------------------------------------

    async _bmAddFolder(name: string, parentId?: string) {
        await this._bmInit();
        if (!this._bmDoc) return null;
        const folder = {
            id: "wv-" + Zotero.Utilities.randomString(8),
            type: "folder",
            name: name || "New Folder",
            expanded: true,
            created: new Date().toISOString(),
            children: [] as any[],
        };
        let arr = this._bmDoc.bookmarks;
        if (parentId) {
            const f = this._bmFindFolder(parentId);
            if (f) { f.children = f.children || []; arr = f.children; }
        }
        arr.push(folder);
        await this._bmPersist();
        return folder.id;
    }

    async _bmRenameFolder(id: string, name: string) {
        await this._bmInit();
        const f = this._bmFindFolder(id);
        if (!f || !name) return;
        f.name = name;
        await this._bmPersist();
    }

    /** Rename a bookmark's display label (non-folder entry, anywhere in tree). */
    async _bmRenameBookmark(id: string, label: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc || !loc.entry || loc.entry.type === "folder" || !label) return;
        // Snapshot the auto-generated original before overwriting, so types with
        // no live source (treerow, url, text) can still "Reset to Original Name".
        // Live-source types re-derive their original anyway, so this is a
        // harmless fallback for them; it also covers treerows created before the
        // creation-time snapshot above existed.
        if (loc.entry.originalLabel == null && loc.entry.label) {
            loc.entry.originalLabel = loc.entry.label;
        }
        loc.entry.label = label;
        // Flag as renamed (the reader rename already does this). Callers only
        // invoke this for a genuine title change, so this is always correct, and
        // it keeps `_bmReaderIsRenamed` — hence the context-menu Reset + the
        // "Original:" hovercard — accurate even when a stale `renamed:false`
        // flag was previously stored.
        loc.entry.renamed = true;
        await this._bmPersist();
    }

    async _bmToggleFolder(id: string) {
        await this._bmInit();
        const f = this._bmFindFolder(id);
        if (!f) return;
        f.expanded = !f.expanded;
        await this._bmPersist();
    }

    /** Count every entry nested inside a folder (bookmarks + subfolders,
     *  recursively) — for the delete confirmation. */
    _bmCountDescendants(folder: any): number {
        let n = 0;
        const kids = (folder && Array.isArray(folder.children)) ? folder.children : [];
        for (const c of kids) {
            n += 1;
            if (c.type === "folder") n += this._bmCountDescendants(c);
        }
        return n;
    }

    /** Move an entry next to / into a target. mode ∈ "before"|"after"|"into". */
    async _bmMove(draggedId: string, targetId: string | null, mode: string) {
        await this._bmInit();
        if (!this._bmDoc || draggedId === targetId) return;
        const src = this._bmLocate(draggedId);
        if (!src) return;
        // Never drop a folder into itself or one of its descendants.
        if (src.entry.type === "folder" && targetId
            && this._bmIsDescendant(targetId, src.entry)) return;
        const moved = src.parentArr.splice(src.index, 1)[0];
        if (mode === "into" && targetId) {
            const f = this._bmFindFolder(targetId);
            if (f) { f.children = f.children || []; f.children.push(moved); f.expanded = true; }
            else this._bmDoc.bookmarks.push(moved);
        } else {
            const tgt = targetId ? this._bmLocate(targetId) : null;
            if (!tgt) {
                this._bmDoc.bookmarks.push(moved);
            } else {
                const idx = tgt.index + (mode === "after" ? 1 : 0);
                tgt.parentArr.splice(idx, 0, moved);
            }
        }
        await this._bmPersist();
    }

    /** Bookmark the items currently selected in the items list. (Retained
     *  for a future right-click "Bookmark Item"; not wired to the UI.) */
    async _bmBookmarkSelectedItems() {
        try {
            await this._bmInit();
            const win = Zotero.getMainWindow();
            const items = (win && win.ZoteroPane
                && typeof win.ZoteroPane.getSelectedItems === "function")
                ? win.ZoteroPane.getSelectedItems() : [];
            if (!items || !items.length) return;
            let added = 0;
            for (const it of items) {
                if (this._bmAddItemSync(it)) added++;
            }
            if (added) await this._bmPersist();
        } catch (e) {
            Zotero.debug("[Weavero] _bmBookmarkSelectedItems err: " + e);
        }
    }

    /** Bookmark items / collections / searches / libraries dropped onto the
     *  toolbar icon. Payloads (zotero/item, zotero/collection, zotero/search,
     *  weavero/library) are comma-separated IDs, read synchronously by the drop
     *  handler. (weavero/library is set by our own library-drag shim — see
     *  `_setupLibraryDragSource` — since Zotero won't drag library rows.) */
    async _bmDropAdd(itemData: string, colData: string, searchData?: string, libData?: string) {
        try {
            await this._bmInit();
            const ids = (s: string) => (s || "").split(",")
                .map(x => parseInt(x, 10)).filter(n => !isNaN(n));
            let added = 0;
            for (const id of ids(itemData)) {
                const it = Zotero.Items.get(id);
                if (it && this._bmAddItemSync(it)) added++;
            }
            for (const id of ids(colData)) {
                const col = Zotero.Collections.get(id);
                if (col && this._bmAddCollectionSync(col)) added++;
            }
            for (const id of ids(searchData || "")) {
                const s: any = Zotero.Searches.get(id);
                if (s && this._bmAddTreeRowSync("S" + id, s.libraryID, s.name)) added++;
            }
            for (const id of ids(libData || "")) {
                if (this._bmAddLibrarySync(id)) added++;
            }
            if (added) await this._bmPersist();
            this._bmRenderPopupList();
        } catch (e) {
            Zotero.debug("[Weavero] _bmDropAdd err: " + e);
        }
    }

    /** Open Zotero's select-items dialog (like "Add Related") and bookmark
     *  every chosen item. No library filter — bookmarks may span libraries. */
    async _bmAddBookmarksDialog() {
        try {
            await this._bmInit();
            const win = Zotero.getMainWindow();
            if (!win) return;
            const io: any = {
                dataIn: null,
                dataOut: null,
                deferred: Zotero.Promise.defer(),
                itemTreeID: "weavero-bookmarks-select",
            };
            const dlg: any = win.openDialog(
                "chrome://zotero/content/selectItemsDialog.xhtml", "",
                "chrome,dialog=no,centerscreen,resizable=yes", io);
            // The dialog only returns selected items. If the user instead
            // highlights a library/collection in its tree and hits Select,
            // capture that row at accept-time so we can bookmark it.
            let pickedCollection: any = null;
            let pickedLibraryID: any = null;
            let pickedTreeRow: any = null;
            try {
                dlg && dlg.addEventListener("dialogaccept", () => {
                    try {
                        const cv = dlg.collectionsView;
                        const tr = cv && cv.selectedTreeRow;
                        if (!tr) return;
                        if (typeof tr.isCollection === "function" && tr.isCollection()) {
                            pickedCollection = tr.ref;
                        } else if (this._bmTreeRowIsLibrary(tr) && tr.ref) {
                            pickedLibraryID = tr.ref.libraryID;
                        } else if (this._bmTreeRowIsSpecial(tr) && tr.id && tr.getName) {
                            pickedTreeRow = {
                                rowID: tr.id,
                                libraryID: tr.ref && tr.ref.libraryID,
                                label: tr.getName(),
                            };
                        }
                    } catch (e) {}
                }, true);
            } catch (e) {}
            await io.deferred.promise;
            let added = 0;
            if (io.dataOut && io.dataOut.length) {
                const targets: any = await Zotero.Items.getAsync(io.dataOut);
                for (const it of (targets || [])) if (this._bmAddItemSync(it)) added++;
            } else if (pickedCollection && pickedCollection.key) {
                if (this._bmAddCollectionSync(pickedCollection)) added++;
            } else if (typeof pickedLibraryID === "number") {
                if (this._bmAddLibrarySync(pickedLibraryID)) added++;
            } else if (pickedTreeRow) {
                if (this._bmAddTreeRowSync(pickedTreeRow.rowID, pickedTreeRow.libraryID,
                    pickedTreeRow.label)) added++;
            }
            if (added) await this._bmPersist();
            this._bmRenderPopupList(win);
        } catch (e) {
            Zotero.debug("[Weavero] _bmAddBookmarksDialog err: " + e);
        }
    }

    /** Modal name prompt (folder create/rename). Returns trimmed string or null. */
    _bmPromptName(win: any, title: string, initial: string) {
        try {
            const input = { value: initial || "" };
            const ok = Services.prompt.prompt(win, title, "Name:", input, null, { value: false });
            if (!ok) return null;
            const v = (input.value || "").trim();
            return v || null;
        } catch (e) {
            Zotero.debug("[Weavero] _bmPromptName err: " + e);
            return null;
        }
    }

    /** A bookmark's target annotation item (loaded), or null if the bookmark
     *  doesn't point to an annotation. */
    async _bmAnnotationItem(bm: any): Promise<any> {
        try {
            if (!bm || bm.type !== "item") return null;
            const iid = Zotero.Items.getIDFromLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!iid) return null;
            let item: any = null;
            try { item = await Zotero.Items.getAsync(iid); } catch (_) { return null; }
            if (!item || !(item.isAnnotation && item.isAnnotation())) return null;
            try { if (item.loadAllData) await item.loadAllData(); } catch (_) {}
            return item;
        } catch (_) { return null; }
    }

    /** Synchronous read of a bookmark's annotation comment (for the row
     *  tooltip). Returns null when not an annotation, unloaded, or empty. */
    _bmAnnotationCommentSync(bm: any): string | null {
        try {
            if (!bm || bm.type !== "item") return null;
            const it: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!it || !(it.isAnnotation && it.isAnnotation())) return null;
            const c = String(it.annotationComment || "").trim();
            return c || null;
        } catch (_) { return null; }
    }

    /** Inject the edit-dialog stylesheet into `doc` (idempotent; re-assigns
     *  textContent so a plugin reload picks up changes). Works for the main
     *  window AND the reader-window bookmark sidebar's document. */
    _bmEnsureEditDialogStyles(doc: any) {
        try {
            let style: any = doc.getElementById(BM_EDITDLG_STYLE_ID);
            if (!style) {
                style = doc.createElementNS(NS_HTML, "style");
                style.id = BM_EDITDLG_STYLE_ID;
                (doc.documentElement || doc).appendChild(style);
            }
            style.textContent = BM_EDITDLG_CSS;
        } catch (_) {}
    }

    /** Generic two-field bookmark editor: a Title input plus an optional
     *  Comment textarea, together in one centered XUL <panel>. Builds in `doc`
     *  (the main window OR the reader-window bookmark sidebar) and positions
     *  using `win`. `commentValue === null` hides the comment field. On Save,
     *  awaits `opts.onSave(newTitle, newComment)` — the caller owns persistence
     *  and re-render. Enter saves from the title; Ctrl/⌘-Enter from anywhere;
     *  Escape cancels. */
    _bmShowEditDialog(doc: any, win: any, opts: any) {
        try {
            if (!doc || !win) return;
            this._bmEnsureEditDialogStyles(doc);
            const hasComment = opts.commentValue != null;
            const hasUrl = opts.urlValue != null;
            const originalTitle = opts.originalTitle != null ? String(opts.originalTitle) : null;
            doc.getElementById("wv-bm-editdlg-panel")?.remove();
            const panel = doc.createXULElement("panel");
            panel.id = "wv-bm-editdlg-panel";
            panel.setAttribute("animate", "false");
            panel.setAttribute("noautohide", "true");
            panel.setAttribute("consumeoutsideclicks", "false");
            const box = doc.createElementNS(NS_HTML, "div");
            box.className = "wv-bm-editdlg";
            const cap = (text: string) => {
                const c = doc.createElementNS(NS_HTML, "div");
                c.className = "wv-bm-editdlg-caption";
                c.textContent = text;
                return c;
            };

            // Draggable title bar — the panel has no OS chrome, so grab the
            // header to move it. moveTo() takes screen coords; accumulate the
            // pointer's screen-coord deltas onto the open position. Pointer
            // capture keeps the drag tracking even when the cursor leaves the
            // header (or the panel moves out from under it).
            const pos = { x: 0, y: 0 };
            const header = doc.createElementNS(NS_HTML, "div");
            header.className = "wv-bm-editdlg-header";
            header.textContent = opts.dialogTitle || "Edit Bookmark";
            box.appendChild(header);
            let dragging = false, lastX = 0, lastY = 0;
            header.addEventListener("pointerdown", (e: any) => {
                if (e.button !== 0) return;
                dragging = true; lastX = e.screenX; lastY = e.screenY;
                try { header.setPointerCapture(e.pointerId); } catch (_) {}
                e.preventDefault();
            });
            header.addEventListener("pointermove", (e: any) => {
                if (!dragging) return;
                pos.x += e.screenX - lastX; pos.y += e.screenY - lastY;
                lastX = e.screenX; lastY = e.screenY;
                try { panel.moveTo(pos.x, pos.y); } catch (_) {}
            });
            const endDrag = (e: any) => { dragging = false; try { header.releasePointerCapture(e.pointerId); } catch (_) {} };
            header.addEventListener("pointerup", endDrag);
            header.addEventListener("pointercancel", endDrag);

            box.appendChild(cap(opts.titleCaption || "Title"));
            const titleInput = doc.createElementNS(NS_HTML, "input");
            titleInput.className = "wv-bm-editdlg-input";
            titleInput.setAttribute("type", "text");
            titleInput.value = String(opts.titleValue || "");
            box.appendChild(titleInput);

            // Original-title row: shows the bookmark's auto-generated name plus a
            // "Reset to original" link, visible whenever the Title field differs
            // from it — i.e. the bookmark was renamed, or the user just edited the
            // title. Lets you see and restore the original without leaving the
            // dialog. Hidden when there's no original (some treerow types) or when
            // the title already matches it.
            let origRow: any = null;
            const updateOrigRow = () => {
                if (!origRow) return;
                const changed = originalTitle != null
                    && (titleInput.value || "").trim() !== originalTitle;
                origRow.style.display = changed ? "flex" : "none";
            };
            if (originalTitle != null) {
                origRow = doc.createElementNS(NS_HTML, "div");
                origRow.className = "wv-bm-editdlg-origrow";
                const olbl = doc.createElementNS(NS_HTML, "span");
                olbl.className = "wv-bm-editdlg-origlabel";
                olbl.textContent = "Original: " + originalTitle;
                olbl.setAttribute("title", originalTitle);
                const resetLink = doc.createElementNS(NS_HTML, "button");
                resetLink.className = "wv-bm-editdlg-resetlink";
                resetLink.textContent = "Reset to original";
                resetLink.addEventListener("click", (e: any) => {
                    e.preventDefault();
                    titleInput.value = originalTitle;
                    updateOrigRow();
                    try { titleInput.focus(); } catch (_) {}
                });
                origRow.appendChild(olbl);
                origRow.appendChild(resetLink);
                box.appendChild(origRow);
                titleInput.addEventListener("input", updateOrigRow);
                updateOrigRow();   // initial — visible if the bookmark is already renamed
            }

            // URL field — shown only when the caller supplies `urlValue` (a
            // `url` bookmark). Step 1 of the see/edit-link feature: the link IS
            // the target, so it's directly editable.
            let urlInput: any = null;
            if (hasUrl) {
                box.appendChild(cap(opts.urlCaption || "URL"));
                urlInput = doc.createElementNS(NS_HTML, "input");
                urlInput.className = "wv-bm-editdlg-input";
                urlInput.setAttribute("type", "text");
                urlInput.setAttribute("spellcheck", "false");
                urlInput.value = String(opts.urlValue || "");
                box.appendChild(urlInput);
            }

            let commentInput: any = null;
            if (hasComment) {
                box.appendChild(cap(opts.commentCaption || "Comment"));
                commentInput = doc.createElementNS(NS_HTML, "textarea");
                commentInput.className = "wv-bm-editdlg-textarea";
                commentInput.setAttribute("rows", "4");
                commentInput.value = String(opts.commentValue || "");
                box.appendChild(commentInput);
            }

            const btns = doc.createElementNS(NS_HTML, "div");
            btns.className = "wv-bm-editdlg-buttons";
            const cancelBtn = doc.createElementNS(NS_HTML, "button");
            cancelBtn.className = "wv-bm-editdlg-btn";
            cancelBtn.textContent = "Cancel";
            const saveBtn = doc.createElementNS(NS_HTML, "button");
            saveBtn.className = "wv-bm-editdlg-btn wv-bm-editdlg-btn-primary";
            saveBtn.textContent = "Save";
            btns.appendChild(cancelBtn);
            btns.appendChild(saveBtn);
            box.appendChild(btns);
            panel.appendChild(box);

            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(panel);
            const close = () => { try { panel.remove(); } catch (_) {} };
            const doSave = async () => {
                const newTitle = (titleInput.value || "").trim();
                const newComment = hasComment ? String(commentInput.value || "") : null;
                const newUrl = hasUrl ? (urlInput.value || "").trim() : null;
                close();
                try { if (opts.onSave) await opts.onSave(newTitle, newComment, newUrl); }
                catch (e) { Zotero.debug("[Weavero] bm edit save err: " + e); }
            };
            cancelBtn.addEventListener("click", close);
            saveBtn.addEventListener("click", () => { doSave(); });
            panel.addEventListener("keydown", (e: any) => {
                if (e.key === "Escape") { e.preventDefault(); close(); }
                else if (e.key === "Enter" && (e.target === titleInput || e.target === urlInput)) { e.preventDefault(); doSave(); }
                else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSave(); }
            });

            const sx = win.screenX + Math.round(win.outerWidth / 2) - 180;
            const sy = win.screenY + Math.round(win.outerHeight / 2) - 130;
            pos.x = sx; pos.y = sy;   // seed the drag accumulator at the open position
            panel.openPopupAtScreen(sx, sy, false);
            win.setTimeout(() => { try { titleInput.focus(); titleInput.select(); } catch (_) {} }, 50);
        } catch (e) {
            Zotero.debug("[Weavero] _bmShowEditDialog err: " + e);
        }
    }

    /** "Add Link…" for the collections-pane store. Opens the main-window edit
     *  dialog (Title + URL) empty, and on save parses the link and pushes a new
     *  bookmark into `_bmDoc.bookmarks`. A `zotero://select|open/…` link is
     *  stored as its native `item`/`collection` target (so the icon + click
     *  handler match); anything else becomes a plain `url` bookmark. When the
     *  Title is left blank for a URL, a default label is derived from the URL.
     *  `onDone` overrides the default re-render (the dropdown popup). */
    async _bmAddLinkDialog(win: any, onDone?: any) {
        try {
            await this._bmInit();
            if (!this._bmDoc) return;
            this._bmShowEditDialog(win.document, win, {
                dialogTitle: "Add Link Bookmark",
                titleValue: "",
                urlValue: "",
                urlCaption: "URL",
                onSave: async (newTitle: string, _comment: any, newUrl: string | null) => {
                    const url = (newUrl || "").trim();
                    if (!url) return;
                    const rec = this._wvLinkToBookmarkRec(url, (newTitle || "").trim());
                    if (!rec || !this._bmDoc) return;
                    if (rec.type === "url" && !rec.label) {
                        rec.label = this._wvUrlBookmarkDefaultLabel(url) || url;
                    }
                    this._bmDoc.bookmarks.push(Object.assign({
                        id: "wv-" + Zotero.Utilities.randomString(8),
                        created: new Date().toISOString(),
                    }, rec));
                    await this._bmPersist();
                    if (onDone) onDone(); else this._bmRenderPopupList(win);
                },
            });
        } catch (e) {
            Zotero.debug("[Weavero] _bmAddLinkDialog err: " + e);
        }
    }

    /** Set a (non-annotation) bookmark entry's own free-text comment. */
    async _bmSetComment(id: string, comment: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc || !loc.entry || loc.entry.type === "folder") return;
        loc.entry.comment = comment || "";
        await this._bmPersist();
    }

    /** Set a `url` bookmark's target link (step 1 of see/edit-link). Only
     *  applies to URL bookmarks — other types store a structured target. */
    async _bmSetUrl(id: string, url: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc || !loc.entry || loc.entry.type !== "url") return;
        loc.entry.url = url || "";
        await this._bmPersist();
    }

    /** Reset a global-store bookmark's display name to its original and clear the
     *  renamed flag, so it resumes tracking the source. Collections-pane analogue
     *  of `_bmReaderResetLabel`. */
    async _bmResetBookmarkName(id: string) {
        await this._bmInit();
        const loc = this._bmLocate(id);
        if (!loc || !loc.entry || loc.entry.type === "folder") return;
        const orig = this._bmReaderOriginalLabel(loc.entry);
        if (!orig) return;
        loc.entry.label = orig;
        loc.entry.originalLabel = orig;
        loc.entry.renamed = false;
        await this._bmPersist();
    }

    /** Shared bookmark editor — the SINGLE place that decides which fields to
     *  show (Title always; URL for `url` bookmarks; future steps: a Link field
     *  for the other linkable types) and how to persist them. Both entry points
     *  — the collections-pane dropdown (`_bmEditBookmarkDialog`) and the reader
     *  "Elsewhere" panel (`_wvReaderEditBookmarkDialog`) — delegate here, each
     *  passing only its window + a small save `strategy` (the two stores differ:
     *  the global store vs the reader-doc view). Annotation comments are saved
     *  here directly (live `saveTx`, reflected everywhere); every other field
     *  goes through the strategy. */
    async _bmShowBookmarkEditor(win: any, entry: any, strategy: any) {
        try {
            await this._bmInit();
            if (!win || !win.document || !entry || !strategy) return;
            const ann = await this._bmAnnotationItem(entry);
            let curComment = "";
            if (ann) { try { curComment = String(ann.annotationComment || ""); } catch (_) {} }
            else { curComment = String(entry.comment || ""); }
            // The auto-generated original name (live-derived or stored snapshot),
            // for the dialog's "Original: …" row + Reset link. Null when there's
            // none to restore to.
            const originalTitle = this._bmReaderOriginalLabel(entry);
            this._bmShowEditDialog(win.document, win, {
                titleValue: entry.label || entry.itemKey || entry.collectionKey || "",
                originalTitle,
                commentValue: curComment,
                // A plain URL bookmark's target IS a link, so expose it as an
                // editable field. Other types store a structured target (keys /
                // reader position) — handled in later steps of the feature.
                urlValue: entry.type === "url" ? String(entry.url || "") : null,
                urlCaption: "URL",
                onSave: async (newTitle: string, newComment: string | null, newUrl: string | null) => {
                    if (newTitle) {
                        if (originalTitle != null && newTitle === originalTitle
                                && entry.label !== originalTitle) {
                            // Title set back to the original → real reset: clears
                            // the renamed flag so it resumes tracking the source.
                            try { await strategy.resetName(); } catch (_) {}
                        } else if (newTitle !== entry.label) {
                            try { await strategy.rename(newTitle); } catch (_) {}
                        }
                    }
                    if (entry.type === "url" && newUrl != null && newUrl !== String(entry.url || "")) {
                        try { await strategy.setUrl(newUrl); } catch (_) {}
                    }
                    if (newComment != null) {
                        if (ann) {
                            let cur = ""; try { cur = String(ann.annotationComment || ""); } catch (_) {}
                            if (newComment !== cur) {
                                try { ann.annotationComment = newComment; await ann.saveTx(); }
                                catch (e) { Zotero.debug("[Weavero] bm comment save err: " + e); }
                            }
                        } else if (newComment !== String(entry.comment || "")) {
                            try { await strategy.setComment(newComment); } catch (_) {}
                        }
                    }
                    try { strategy.reRender(); } catch (_) {}
                },
            });
        } catch (e) {
            Zotero.debug("[Weavero] _bmShowBookmarkEditor err: " + e);
        }
    }

    /** Collections-pane "Edit Bookmark…": delegates to the shared editor with
     *  the global-store save strategy. */
    async _bmEditBookmarkDialog(win: any, bm: any, onDone?: any) {
        return this._bmShowBookmarkEditor(win, bm, {
            rename: (title: string) => this._bmRenameBookmark(bm.id, title),
            resetName: () => this._bmResetBookmarkName(bm.id),
            setUrl: (url: string) => this._bmSetUrl(bm.id, url),
            setComment: (comment: string) => this._bmSetComment(bm.id, comment),
            reRender: () => { if (onDone) onDone(); else this._bmRenderPopupList(win); },
        });
    }

    // ---- Navigation / opening ---------------------------------------------

    /** Row click. Modifiers pick the destination without the context menu
     *  (mirrors Zotero's Shift = alternate-window convention):
     *    • plain click     → open in a new reader tab
     *    • Shift-click     → open in a new window
     *    • Ctrl/Cmd-click  → show in library (reveal, don't open)
     *  Targets with nothing to open fall back to showing in the library. */
    /** True if a bookmark points at a Zotero object that no longer exists
     *  (annotation / item / collection / library purged, or a cross-document
     *  location whose source attachment is gone). URL / folder bookmarks, and
     *  LOCAL in-document location bookmarks, have no external target and are
     *  never "missing". Drives the orphan-row marking + click feedback — see the
     *  "Bookmark integrity when the target is deleted" TODO, option (b). */
    _bmTargetMissing(bm: any): boolean {
        try {
            if (!bm) return false;
            switch (bm.type) {
                case "folder":
                case "url":
                    return false;
                case "collection": {
                    if (!bm.collectionKey) return false;
                    let c: any = null;
                    try { c = Zotero.Collections.getByLibraryAndKey(bm.libraryID, bm.collectionKey); } catch (_) {}
                    return !c;
                }
                case "library":
                    try { return !Zotero.Libraries.get(bm.libraryID); } catch (_) { return true; }
                case "item":
                    return !Zotero.Items.getIDFromLibraryAndKey(bm.libraryID, bm.itemKey);
                case "position":
                case "page":
                case "text":
                    // Only a CROSS-document location bookmark has an external
                    // target (its source attachment); a local one's target is
                    // the document it's listed under, present by definition.
                    if (bm.srcItemKey) return !Zotero.Items.getIDFromLibraryAndKey(bm.srcLibraryID, bm.srcItemKey);
                    return false;
                default:
                    return false;
            }
        } catch (_) { return false; }
    }

    /** Brief red pulse on a bookmark row whose target is gone — the click
     *  feedback for an orphan bookmark (instead of a silent no-op). Works in
     *  any document (library popup or reader iframe); the `.wv-bm-flash` /
     *  `.wv-rb-flash` keyframes live in each surface's stylesheet. */
    _bmFlashMissingRow(row: any, cls?: string) {
        try {
            if (!row) return;
            const c = cls || "wv-bm-flash";
            row.classList.remove(c);
            // Force reflow so re-adding the class restarts the animation.
            try { void row.offsetWidth; } catch (_) {}
            row.classList.add(c);
            const win = row.ownerDocument && row.ownerDocument.defaultView;
            const t = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            t(() => { try { row.classList.remove(c); } catch (_) {} }, 650);
        } catch (_) {}
    }

    async _bmActivateBookmark(bm: any, event: any) {
        try {
            if (!bm) return;
            // URL / app-link bookmarks: route through Weavero's
            // `_launchURL`, the same helper note-editor / annotation
            // clicks use. It honours `weavero.enableAppLinksSkipConfirm`
            // (when set, bypasses Firefox's "Allow this site to open
            // the <scheme> link with <app>?" dialog by calling
            // `handlerInfo.launchWithURI` directly), and intercepts
            // `zotero://` URLs to dispatch into ZoteroPane / Reader /
            // openNote without prompting.
            if (bm.type === "url" && bm.url) {
                try { this._launchURL(String(bm.url)); }
                catch (e) { Zotero.debug("[Weavero] url-bm launch err: " + e); }
                return;
            }
            if (event && (event.ctrlKey || event.metaKey)) {
                await this._bmShowInLibrary(bm);
                return;
            }
            const target = await this._bmResolveOpenTarget(bm);
            if (target) {
                await this._bmOpenInReader(bm, !!(event && event.shiftKey));
                return;
            }
            await this._bmShowInLibrary(bm);
        } catch (e) {
            Zotero.debug("[Weavero] _bmActivateBookmark err: " + e);
        }
    }

    async _bmShowInLibrary(bm: any) {
        try {
            if (!bm) return;
            const win = Zotero.getMainWindow();
            const zp = win && win.ZoteroPane;
            if (!zp) return;
            // Library-side bookmarks (library / saved search / collection)
            // need the main library tab focused first; otherwise the selection
            // happens in a tree the user can't see while a reader tab is on top.
            // (For item bookmarks `selectItem` already does this — see
            // zoteroPane.js:3086 — so we only need the explicit jump here.)
            const tabs: any = (win as any).Zotero_Tabs;
            const jumpToLibrary = () => {
                try { if (tabs && typeof tabs.select === "function") tabs.select("zotero-pane"); } catch (_) {}
            };
            if (bm.type === "library") {
                jumpToLibrary();
                const cv = zp.collectionsView;
                if (cv && typeof cv.selectLibrary === "function") {
                    await cv.selectLibrary(bm.libraryID);
                }
                return;
            }
            if (bm.type === "treerow") {
                jumpToLibrary();
                const cv = zp.collectionsView;
                if (cv && typeof cv.selectByID === "function") {
                    await cv.selectByID(bm.rowID);
                }
                return;
            }
            if (bm.type === "collection") {
                jumpToLibrary();
                const col = Zotero.Collections.getByLibraryAndKey(
                    bm.libraryID, bm.collectionKey);
                if (col && zp.collectionsView
                    && typeof zp.collectionsView.selectCollection === "function") {
                    await zp.collectionsView.selectCollection(col.id);
                }
                return;
            }
            // A cross-document location bookmark (text selection, pinned
            // position, or whole-page bookmark) has no annotation item to
            // reveal — show its source attachment FILE instead (the
            // "parent" of the location).
            if ((bm.type === "text" || bm.type === "position"
                    || bm.type === "page") && bm.srcItemKey) {
                const _aid = Zotero.Items.getIDFromLibraryAndKey(bm.srcLibraryID, bm.srcItemKey);
                if (!_aid) return;
                let att: any = null;
                try { att = await Zotero.Items.getAsync(_aid); } catch (_) { return; }
                if (!att) return;
                await zp.selectItem(att.id);
                return;
            }
            // After a restart a cross-doc item may not be loaded — and
            // getByLibraryAndKey THROWS for it. Resolve the id via the
            // pure key→id lookup, then load it.
            const _id = Zotero.Items.getIDFromLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!_id) return;
            let item: any = null;
            try { item = await Zotero.Items.getAsync(_id); } catch (_) { return; }
            if (!item) return;
            // For an annotation, reveal the annotation ITSELF in the items
            // tree (Zotero expands its attachment + parent and selects it);
            // for everything else walk up to the top-level so the regular
            // item — not a child attachment/note — is what gets shown.
            if (!(item.isAnnotation && item.isAnnotation())) {
                while (item.parentItem) item = item.parentItem;
            }
            await zp.selectItem(item.id);
        } catch (e) {
            Zotero.debug("[Weavero] _bmShowInLibrary err: " + e);
        }
    }

    /** Resolve a bookmark to a reader-openable attachment + location +
     *  type label, or null if there's nothing to open in the reader. */
    async _bmResolveOpenTarget(bm: any) {
        try {
            if (!bm || bm.type === "collection" || bm.type === "folder"
                || bm.type === "library" || bm.type === "treerow") return null;
            // Cross-document location bookmark (text selection, pinned
            // position, or whole-page bookmark dragged from another reader):
            // open its SOURCE attachment at the stored position.
            if ((bm.type === "text" || bm.type === "position"
                    || bm.type === "page") && bm.srcItemKey) {
                const sid = Zotero.Items.getIDFromLibraryAndKey(bm.srcLibraryID, bm.srcItemKey);
                if (!sid) return null;
                let srcAtt: any = null;
                try { srcAtt = await Zotero.Items.getAsync(sid); } catch (_) { return null; }
                if (!srcAtt || !(srcAtt.isAttachment && srcAtt.isAttachment())) return null;
                let tl: any = null;
                if (srcAtt.isPDFAttachment && srcAtt.isPDFAttachment()) tl = "PDF";
                else if (srcAtt.isEPUBAttachment && srcAtt.isEPUBAttachment()) tl = "EPUB";
                else if (srcAtt.isSnapshotAttachment && srcAtt.isSnapshotAttachment()) tl = "Snapshot";
                else return null;
                // Whole-page bookmark: scroll to that page index (no rects).
                let location: any = null;
                if (bm.type === "page") {
                    const pi = (bm.location && Number.isInteger(bm.location.pageIndex))
                        ? bm.location.pageIndex
                        : (bm.position && Number.isInteger(bm.position.pageIndex))
                            ? bm.position.pageIndex
                            : null;
                    if (pi != null) location = { pageIndex: pi };
                }
                else if (bm.position) {
                    location = { position: bm.position };
                }
                return { attachment: srcAtt, location, typeLabel: tl };
            }
            const iid = Zotero.Items.getIDFromLibraryAndKey(bm.libraryID, bm.itemKey);
            if (!iid) return null;
            let item: any = null;
            try { item = await Zotero.Items.getAsync(iid); } catch (_) { return null; }
            if (!item) return null;
            try { if (item.loadAllData) await item.loadAllData(); } catch (_) {}
            let attachment: any = null;
            let location: any = null;
            if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
                attachment = item.parentItem
                    || (item.parentItemID && Zotero.Items.get(item.parentItemID));
                location = { annotationID: item.key };
            } else if (typeof item.isAttachment === "function" && item.isAttachment()) {
                attachment = item;
            } else if (typeof item.isRegularItem === "function" && item.isRegularItem()) {
                attachment = await item.getBestAttachment();
            }
            if (!attachment) return null;
            let typeLabel = null;
            if (attachment.isPDFAttachment && attachment.isPDFAttachment()) typeLabel = "PDF";
            else if (attachment.isEPUBAttachment && attachment.isEPUBAttachment()) typeLabel = "EPUB";
            else if (attachment.isSnapshotAttachment && attachment.isSnapshotAttachment()) typeLabel = "Snapshot";
            else return null; // not a reader type → no tab/window open
            return { attachment, location, typeLabel };
        } catch (e) {
            Zotero.debug("[Weavero] _bmResolveOpenTarget err: " + e);
            return null;
        }
    }

    async _bmOpenInReader(bm: any, openInWindow: boolean) {
        try {
            const t = await this._bmResolveOpenTarget(bm);
            if (!t) return;
            // The target may be open ONLY in a Weavero multi-tab reader WINDOW
            // (its strip tabs host base ReaderInstances, which Zotero.Reader.open
            // can't focus — it just navigates a hidden background reader, so the
            // click appears to do nothing). On a plain click, when the item isn't
            // in any main-window tab, route to that reader window: raise it,
            // switch the strip to the tab, then navigate.
            if (!openInWindow && t.attachment && this._wvWTFindTabForItem) {
                let inMainTab = false;
                try {
                    for (const mw of (Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()])) {
                        const ZT: any = mw && (mw as any).Zotero_Tabs;
                        if (ZT && typeof ZT.getTabIDByItemID === "function" && ZT.getTabIDByItemID(t.attachment.id)) { inMainTab = true; break; }
                    }
                } catch (_) {}
                if (!inMainTab) {
                    const hosted = this._wvWTFindTabForItem(t.attachment.id);
                    if (hosted && hosted.win && hosted.tab) {
                        try { hosted.win.focus(); } catch (_) {}
                        try { this._wvWTSwitch(hosted.win, hosted.tab.id); } catch (_) {}
                        const navTab = hosted.tab;
                        const doNav = () => {
                            try { if (navTab.reader && t.location && typeof navTab.reader.navigate === "function") navTab.reader.navigate(t.location); } catch (_) {}
                            if (bm && bm.type === "position" && bm.position && navTab.reader) {
                                try { this._wvShowPinWhenReady(navTab.reader, bm.position, bm.id); } catch (_) {}
                            }
                        };
                        // _wvWTSwitch realizes a lazy tab (async document load) —
                        // navigate immediately if already loaded, else after a tick.
                        const w2: any = hosted.win;
                        const st2 = (w2 && w2.setTimeout) ? w2.setTimeout.bind(w2) : setTimeout;
                        if (navTab.reader && navTab.reader._internalReader) doNav(); else st2(doNav, 200);
                        return;
                    }
                }
            }
            const opened: any = await Zotero.Reader.open(t.attachment.id, t.location || null,
                { openInWindow: !!openInWindow });
            // Position bookmarks drop a 📌 marker — show it after the
            // reader is ready. `Zotero.Reader.open` returns three things:
            //   1. A Reader instance (a new tab/window was created)
            //   2. An existing Reader (already-loaded item is focused)
            //   3. `undefined` — an UNLOADED tab is being selected and
            //      its Reader instance is created asynchronously by the
            //      tab-select handler. In case 3, polling
            //      `_readers.find(itemID)` is the only way to pick up
            //      the instance once it lands. Then `_wvShowPinWhenReady`
            //      takes over (waits for pages to render).
            if (bm && bm.type === "position" && bm.position) {
                const itemID = t.attachment && t.attachment.id;
                const win: any = Zotero.getMainWindow();
                const st: any = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
                const tryShow = (tries: number) => {
                    let r: any = opened;
                    if (!r) {
                        try {
                            const readers: any = (Zotero.Reader as any)._readers;
                            if (Array.isArray(readers)) {
                                r = readers.find((rd: any) => rd && rd.itemID === itemID) || null;
                            }
                            if (!r) {
                                const tabID = win && win.Zotero_Tabs && win.Zotero_Tabs.selectedID;
                                if (tabID) r = Zotero.Reader.getByTabID(tabID);
                            }
                        } catch (_) {}
                    }
                    if (r) { try { this._wvShowPinWhenReady(r, bm.position, bm.id); } catch (_) {} return; }
                    if (tries < 40) st(() => tryShow(tries + 1), 150);
                };
                tryShow(0);
            }
        } catch (e) {
            Zotero.debug("[Weavero] _bmOpenInReader err: " + e);
        }
    }

    // ---- Icons ------------------------------------------------------------

    _bmIsDark(win: any) {
        try {
            return !!(win && win.matchMedia
                && win.matchMedia("(prefers-color-scheme: dark)").matches);
        } catch (e) { return true; }
    }

    _bmShowInLibraryIcon(bm: any, win: any) {
        const theme = this._bmIsDark(win) ? "dark" : "light";
        let name = "library.svg";
        try {
            const lib: any = Zotero.Libraries.get(bm.libraryID);
            if (lib && lib.libraryType === "group") name = "library-group.svg";
            else if (lib && lib.libraryType === "feed") name = "feed-library.svg";
        } catch (e) {}
        return "chrome://zotero/skin/collection-tree/16/" + theme + "/" + name;
    }

    /** Title of the parent attachment that an in-doc location bookmark
     *  (`position`/`page`/`text`) points into. Returns `null` when the
     *  bookmark isn't an in-doc type, doesn't carry a `srcItemKey`, or
     *  the item can't be resolved (e.g. detached attachment, foreign
     *  library not yet loaded). Used to render the "in *Foo*" subtitle
     *  on library-store rows. */
    _bmParentAttachmentTitle(bm: any): string | null {
        try {
            if (!bm || !bm.srcItemKey) return null;
            if (bm.type !== "position" && bm.type !== "page" && bm.type !== "text") return null;
            const id = Zotero.Items.getIDFromLibraryAndKey(bm.srcLibraryID, bm.srcItemKey);
            if (!id) return null;
            const it: any = Zotero.Items.get(id);
            if (!it) return null;
            // Prefer the parent regular item's display title (e.g. the
            // paper) when the attachment is filed under one; fall back
            // to the attachment's own title (linked PDFs, standalone
            // attachments). Mirrors `_bmShowInLibrary`'s walk-up logic.
            let titleSource: any = it;
            try {
                if (it.parentItem) titleSource = it.parentItem;
                else if (it.parentItemID) {
                    const p = Zotero.Items.get(it.parentItemID);
                    if (p) titleSource = p;
                }
            } catch (_) {}
            const t = (typeof titleSource.getDisplayTitle === "function")
                ? titleSource.getDisplayTitle()
                : (titleSource.getField && titleSource.getField("title")) || "";
            return String(t || "") || null;
        } catch (_) { return null; }
    }

    /** `{ image, fill? }` for a bookmark row. */
    _bmIconInfo(bm: any, win: any): any {
        try {
            if (bm.type === "library") {
                return { image: this._bmShowInLibraryIcon(bm, win) };
            }
            // In-doc location bookmarks: same type-specific glyph the
            // reader uses (RP_PIN_EMOJI / RP_BM_RIBBON / RP_TEXT_SVG)
            // so the same bookmark looks identical in both panels. The
            // "in <attachment>" suffix already conveys which file it
            // belongs to — no need to mirror that in the icon.
            if (bm.type === "position") return { image: BM_PIN_ICON };
            if (bm.type === "page")     return { image: BM_PAGE_ICON, fill: "currentColor" };
            if (bm.type === "text")     return { image: BM_TEXT_ICON, fill: "currentColor" };
            if (bm.type === "treerow") {
                const theme = this._bmIsDark(win) ? "dark" : "light";
                const map: { [k: string]: string } = {
                    S: "search.svg", D: "duplicates.svg", U: "unfiled.svg",
                    T: "trash.svg", P: "publications.svg", Y: "retracted.svg",
                };
                const name = map[(bm.rowID || "")[0]] || "search.svg";
                return { image: "chrome://zotero/skin/collection-tree/16/" + theme + "/" + name };
            }
            if (bm.type === "collection") {
                const theme = this._bmIsDark(win) ? "dark" : "light";
                return { image: "chrome://zotero/skin/collection-tree/16/" + theme + "/collection.svg" };
            }
            // URL bookmarks: pick a scheme-aware icon AND bake the
            // matching link colour into the SVG stroke so the `<img>`
            // glyph matches the row label's colour. (img elements don't
            // inherit `currentColor`, so we substitute the explicit
            // hex at data-URI build time.)
            if (bm.type === "url") {
                const cls = this._urlLinkClass(String(bm.url || ""));
                const dark = this._bmIsDark(win);
                const colorFor = (c: string) => {
                    if (c === "wv-link-http")    return dark ? "#8ab4f8" : "#1a73e8";
                    if (c === "wv-link-zotero")  return dark ? "#cd853f" : "#8b4513";
                    return dark ? "#c084fc" : "#9333ea";          // app
                };
                const svgFor = (c: string) => {
                    if (c === "wv-link-http")    return URL_GLOBE_SVG;
                    if (c === "wv-link-app")     return URL_EXTERNAL_SVG;
                    return null;
                };
                const tinted = (svgFor(cls) || "").replace(
                    /currentColor/g, colorFor(cls));
                if (tinted) {
                    return { image: "data:image/svg+xml;utf8,"
                        + encodeURIComponent(tinted) };
                }
                // zotero:// urls that escaped auto-conversion — let the
                // fallback chain (BM_FALLBACK_DATA_URI) kick in below.
            }
            const item: any = Zotero.Items.getByLibraryAndKey(bm.libraryID, bm.itemKey);
            if (item) {
                if (typeof item.isAnnotation === "function" && item.isAnnotation()) {
                    const svg = BM_ANNOTATION_ICONS[item.annotationType]
                        || "annotate-highlight.svg";
                    return {
                        image: "chrome://zotero/skin/16/universal/" + svg,
                        fill: item.annotationColor || null,
                    };
                }
                if (typeof item.getImageSrc === "function") {
                    return { image: item.getImageSrc() };
                }
            }
        } catch (e) {}
        return { image: BM_FALLBACK_DATA_URI };
    }

    // ---- UI: toolbar button -----------------------------------------------

    _setupBookmarksToolbarButton(win?: any, _attempt?: number) {
        try {
            win = win || Zotero.getMainWindow();
            if (!win || win.closed) return;
            // Gate on the Bookmarks master + library sub-toggle. The
            // call sites already check this, but observer-driven
            // re-binds and other indirect callers route through here,
            // so this is the canonical pref gate.
            if (!this._getEnableLibraryBookmarks()) {
                this._teardownBookmarksToolbarButton(win);
                return;
            }
            // Auto-hide-when-empty: when the pref is on and the library
            // bookmarks store has zero entries, hide the toolbar button
            // until something is added. `_bmDoc` may not be loaded yet
            // at first window-open — treat "not yet loaded" as "show"
            // (the button reappears after persist if the store is empty;
            // see the `_bmPersist` hook below).
            if (this._getAutoHideEmptyLibraryBookmarks()
                    && this._bmDoc
                    && Array.isArray(this._bmDoc.bookmarks)
                    && this._bmDoc.bookmarks.length === 0) {
                this._teardownBookmarksToolbarButton(win);
                return;
            }
            const doc = win.document;
            if (!doc) return;
            const toolbar = doc.getElementById("zotero-collections-toolbar");
            if (!toolbar) {
                const attempt = _attempt || 0;
                if (attempt < 40 && typeof win.setTimeout === "function") {
                    win.setTimeout(
                        () => this._setupBookmarksToolbarButton(win, attempt + 1), 250);
                }
                return;
            }
            this._teardownBookmarksToolbarButton(win);
            const addBtn = doc.getElementById("zotero-tb-collection-add");
            const btn = doc.createXULElement("toolbarbutton");
            btn.id = BM_BTN_ID;
            btn.setAttribute("tabindex", "-1");
            btn.setAttribute("class", "zotero-tb-button");
            btn.setAttribute("tooltiptext", "Bookmarks");
            const dataURI = "data:image/svg+xml," + encodeURIComponent(BOOKMARK_SVG);
            btn.style.setProperty("list-style-image", 'url("' + dataURI + '")');
            btn.style.setProperty("-moz-context-properties", "fill, stroke");
            btn.style.setProperty("fill", "currentColor");
            btn.style.setProperty("stroke", "currentColor");
            btn.addEventListener("command", () => {
                try { this._openBookmarksPopup(btn); }
                catch (e) { Zotero.debug("[Weavero] open bookmarks popup err: " + e); }
            });
            // Drop target: drag items/collections from Zotero onto the icon
            // to bookmark them.
            const dtHasZotero = (dt: any) => {
                try {
                    const t = dt && dt.types;
                    if (!t) return false;
                    const has = (k: string) => (typeof t.includes === "function")
                        ? t.includes(k) : (Array.prototype.indexOf.call(t, k) >= 0);
                    return has("zotero/item") || has("zotero/collection")
                        || has("zotero/search") || has("weavero/library");
                } catch (e) { return false; }
            };
            btn.addEventListener("dragover", (e: any) => {
                if (!dtHasZotero(e.dataTransfer)) return;
                e.preventDefault();
                try { e.dataTransfer.dropEffect = "copy"; } catch (_) {}
                btn.style.outline = "2px solid var(--color-accent,#4072e5)";
                btn.style.outlineOffset = "-2px";
            });
            btn.addEventListener("dragleave", () => { btn.style.outline = ""; });
            btn.addEventListener("drop", (e: any) => {
                btn.style.outline = "";
                if (!dtHasZotero(e.dataTransfer)) return;
                e.preventDefault();
                // Read synchronously — dataTransfer is neutered after an await.
                let itemData = "", colData = "", searchData = "", libData = "";
                try { itemData = e.dataTransfer.getData("zotero/item") || ""; } catch (_) {}
                try { colData = e.dataTransfer.getData("zotero/collection") || ""; } catch (_) {}
                try { searchData = e.dataTransfer.getData("zotero/search") || ""; } catch (_) {}
                try { libData = e.dataTransfer.getData("weavero/library") || ""; } catch (_) {}
                this._bmDropAdd(itemData, colData, searchData, libData);
            });
            if (addBtn && addBtn.parentNode === toolbar) addBtn.after(btn);
            else toolbar.appendChild(btn);
            this._setupCollectionsBookmarkMenu(win);
            this._setupLibraryDragSource(win);
            this._bmInit();
        } catch (e) {
            Zotero.debug("[Weavero] _setupBookmarksToolbarButton err: " + e);
        }
    }

    _teardownBookmarksToolbarButton(win?: any) {
        try {
            win = win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc) {
                this._bmHidePopup(win);
                doc.getElementById(BM_BTN_ID)?.remove();
                doc.getElementById(BM_STYLE_ID)?.remove();
                doc.getElementById(BM_ROW_MENU_ID)?.remove();
            }
            this._teardownCollectionsBookmarkMenu(win);
            this._teardownLibraryDragSource(win);
        } catch (e) {}
    }

    // ---- UI: the dropdown panel -------------------------------------------

    _bmEnsurePopupStyles(doc: any) {
        let style: any = doc.getElementById(BM_STYLE_ID);
        if (!style) {
            style = doc.createElementNS(NS_HTML, "style");
            style.id = BM_STYLE_ID;
            (doc.documentElement || doc).appendChild(style);
        }
        // Always re-assign textContent so a plugin reload picks up CSS
        // changes — the chrome window itself persists across reloads,
        // so a stale `<style>` from a previous build would otherwise
        // shadow new rules until the user restarted Zotero. Cheap (a
        // string assignment) so re-running on every popup open is fine.
        // Includes the rich-hover-card CSS so library-pane rows can show
        // the same details popup the reader does.
        style.textContent = BM_POPUP_CSS + BM_HOVERCARD_CSS;
    }

    /** Toggle the bookmarks dropdown: a XUL <panel> hosting an HTML list. */
    _openBookmarksPopup(anchorBtn: any) {
        const win = Zotero.getMainWindow();
        const doc: any = win && win.document;
        if (!doc) return;
        if (doc.getElementById(BM_POPUP_ID)) { this._bmHidePopup(win); return; }
        this._bmEnsurePopupStyles(doc);
        const panel = doc.createXULElement("panel");
        panel.id = BM_POPUP_ID;
        panel.setAttribute("animate", "false");
        panel.setAttribute("noautohide", "true");          // we dismiss manually
        panel.setAttribute("consumeoutsideclicks", "false");
        panel.setAttribute("tooltip", "html-tooltip");
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.id = BM_INNER_ID;
        // Right-click on empty areas (row menus stopPropagation) → Add
        // Bookmark / New Folder, Firefox-bookmarks style.
        inner.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            this._bmEmptyContextMenu(win, e.screenX, e.screenY);
        });
        panel.appendChild(inner);
        const host = doc.getElementById("mainPopupSet") || doc.documentElement;
        host.appendChild(panel);
        this._bmRenderPopupList(win);
        this._bmInstallDismiss(win, panel, anchorBtn);
        panel.openPopup(anchorBtn, "after_start", 0, 0, false, false);
        // Firefox-bookmarks style: extend the popup vertically to fill
        // the space from below the anchor button down to ~20px above
        // the window's bottom. Computed at popup-open time (after the
        // panel is laid out so getBoundingClientRect is valid). The
        // CSS max-height: 460px stays as a fallback if the calc fails.
        const fitHeight = () => {
            try {
                const rect = panel.getBoundingClientRect();
                const winHeight = win.innerHeight
                    || (doc.documentElement && doc.documentElement.clientHeight)
                    || 800;
                const avail = winHeight - rect.top - 20;
                if (avail > 200) inner.style.maxHeight = avail + "px";
            } catch (_) {}
        };
        // Run twice: once on next tick (panel laid out), once after
        // resize (window-resize while open keeps it filling the space).
        win.setTimeout(fitHeight, 0);
        const onResize = () => fitHeight();
        try { win.addEventListener("resize", onResize); } catch (_) {}
        panel.addEventListener("popuphidden", () => {
            try { win.removeEventListener("resize", onResize); } catch (_) {}
        }, { once: true });
        // First open after a restart: a referenced library may not be
        // loaded yet → blank icons. Load them, then refresh if still open.
        this._bmPreloadTargets().then(() => {
            if (doc.getElementById(BM_POPUP_ID)) this._bmRenderPopupList(win);
        }).catch(() => {});
    }

    _bmHidePopup(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc = win && win.document;
        if (!doc) return;
        // Filter is transient — reset so the next open starts clean.
        this._bmCloseLibChipPopup(win);
        this._bmLibResetChipState();
        this._bmLibFilterText = "";
        this._bmLibSearchOpen = false;
        // Cancel any pending hover-card show timer (set by a row's mouseenter)
        // and remove a currently-shown card. Otherwise a 450ms timer queued
        // just before close could fire post-removal and reattach to doc.body.
        try { if (this._wvBmHoverTimer && win) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
        try { this._wvReaderHideBmHoverCard(doc); } catch (_) {}
        this._bmCloseAllFlyouts();
        this._bmRemoveDismiss();
        doc.getElementById(BM_ROW_MENU_ID)?.remove();
        const panel = doc.getElementById(BM_POPUP_ID);
        if (panel) {
            try { panel.hidePopup(); } catch (e) {}
            try { panel.remove(); } catch (e) {}
        }
    }

    _bmInstallDismiss(win: any, panel: any, anchorBtn: any) {
        const doc = win.document;
        const onKey = (e: any) => {
            if (e.key === "Escape") { e.preventDefault(); this._bmHidePopup(win); }
        };
        const onDown = (e: any) => {
            try {
                const t = e.target;
                if (panel.contains && panel.contains(t)) return;
                // Clicks inside the side chip-filter popup (a sibling XUL
                // panel, not a child of the bookmarks panel) shouldn't
                // dismiss the bookmarks popup.
                const chipPanel = doc.getElementById(BM_CHIP_POPUP_ID);
                if (chipPanel && chipPanel.contains && chipPanel.contains(t)) return;
                if (t && t.closest && (t.closest(".wv-bm-flyout")
                    || t.closest("#" + BM_ROW_MENU_ID))) return;
                if (anchorBtn && (t === anchorBtn
                    || (anchorBtn.contains && anchorBtn.contains(t)))) return;
                this._bmHidePopup(win);
            } catch (err) {}
        };
        win.addEventListener("keydown", onKey, true);
        doc.addEventListener("mousedown", onDown, true);
        this._bmDismiss = { win, onKey, onDown };
    }

    _bmRemoveDismiss() {
        if (!this._bmDismiss) return;
        try {
            const { win, onKey, onDown } = this._bmDismiss;
            win.removeEventListener("keydown", onKey, true);
            win.document.removeEventListener("mousedown", onDown, true);
        } catch (e) {}
        this._bmDismiss = null;
    }

    /** (Re)build the panel: action buttons + the bookmark/folder tree. */
    _bmRenderPopupList(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc: any = win && win.document;
        if (!doc) return;
        const inner = doc.getElementById(BM_INNER_ID);
        if (!inner) return;
        this._bmCloseAllFlyouts();
        while (inner.firstChild) inner.firstChild.remove();

        // Icon-only action row: "+" (add bookmarks) and folder-with-+
        // (new folder, the same glyph as Zotero's New Collection).
        const actions = doc.createElementNS(NS_HTML, "div");
        actions.className = "wv-bm-actions";
        const mkIconBtn = (iconUrl: string, title: string, onClick: any) => {
            const b = doc.createElementNS(NS_HTML, "button");
            b.className = "wv-bm-iconbtn";
            b.setAttribute("title", title);
            const img = doc.createElementNS(NS_HTML, "img");
            img.setAttribute("src", iconUrl);
            img.setAttribute("width", "20");
            img.setAttribute("height", "20");
            b.appendChild(img);
            b.addEventListener("click", onClick);
            actions.appendChild(b);
            return b;
        };
        const addBtn = mkIconBtn(BM_ADD_ICON, "Add Bookmarks…", () => {
            this._bmShowDropdownAddMenu(win, addBtn);
        });
        mkIconBtn(BM_NEW_FOLDER_ICON, "New Folder…", () => {
            const name = this._bmPromptName(win, "New Folder", "New Folder");
            if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
        });

        // Funnel button — toggles the filter input row below. Mirrors the
        // reader-sidebar bookmarks filter affordance; for the library list
        // the filter is text-only (label substring match), so the input is
        // the whole UI. Push the funnel to the right so it doesn't crowd
        // the +/folder add buttons. Uses the SAME hollow funnel SVG as
        // the reader sidebar so the affordance reads identically —
        // including the amber Weavero-identity stem.
        const filterBtn = doc.createElementNS(NS_HTML, "button");
        filterBtn.className = "wv-bm-iconbtn";
        filterBtn.setAttribute("title", "Filter bookmarks");
        // Render the funnel exactly like the +/folder icons: an <img>
        // pointing at a data:image/svg+xml URI. Inline SVG via
        // createElementNS works in HTML iframes but Gecko's chrome layer
        // can refuse to give it intrinsic size in XUL panels, leaving
        // the button collapsed even with explicit width/height. The img
        // path is bulletproof and lets the existing `.wv-bm-iconbtn img`
        // rule (with `-moz-context-properties: fill, stroke` + the
        // var(--fill-secondary) tint) handle sizing and color.
        const funnelSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">'
            + '<clipPath id="wvstem"><rect x="0" y="7" width="16" height="9"/></clipPath>'
            + '<path fill="context-fill" fill-rule="evenodd" clip-rule="evenodd" d="' + WV_FUNNEL_PATH + '"/>'
            + '<path clip-path="url(#wvstem)" fill="' + WV_FUNNEL_STEM_COLOR + '" fill-rule="evenodd" clip-rule="evenodd" d="' + WV_FUNNEL_PATH + '"/>'
            + '</svg>';
        const funnelImg = doc.createElementNS(NS_HTML, "img");
        funnelImg.setAttribute("src", "data:image/svg+xml;charset=utf-8," + encodeURIComponent(funnelSvg));
        funnelImg.setAttribute("width", "20");
        funnelImg.setAttribute("height", "20");
        filterBtn.appendChild(funnelImg);
        // ▾ chevron — matches the library filter popup's
        // toolbarbutton-menu-dropmarker, signalling that the button
        // opens a popup (same affordance as popups 1 & 2). Inline
        // 8×8 SVG via data: URI so it inherits `currentColor` through
        // -moz-context-properties on the image.
        const chevSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" fill="context-fill">'
            + '<path d="M1 2.5h6L4 6z"/></svg>';
        const chevImg = doc.createElementNS(NS_HTML, "img");
        chevImg.setAttribute("src", "data:image/svg+xml;charset=utf-8," + encodeURIComponent(chevSvg));
        chevImg.setAttribute("width", "8");
        chevImg.setAttribute("height", "8");
        chevImg.className = "wv-bm-funnel-chev";
        filterBtn.appendChild(chevImg);
        filterBtn.addEventListener("click", () => {
            const open = !!doc.getElementById(BM_CHIP_POPUP_ID);
            if (open) {
                this._bmCloseLibChipPopup(win);
                this._bmLibResetChipState();
                this._bmRefreshPopupList(win);
            } else {
                this._bmOpenLibChipPopup(win, filterBtn);
            }
            filterBtn.classList.toggle("wv-active",
                !!doc.getElementById(BM_CHIP_POPUP_ID) || this._bmLibChipsActive());
            // wv-active = popup-open OR any chip selected (sticky bg
            // tint). wv-bm-lib-filter-active = ONLY chip selected (blue
            // dot). Two states because the user needs the dot AFTER
            // closing the popup, when the bg-tint also clears.
            filterBtn.classList.toggle("wv-bm-lib-filter-active",
                this._bmLibChipsActive());
        });
        if (doc.getElementById(BM_CHIP_POPUP_ID) || this._bmLibChipsActive()) {
            filterBtn.classList.add("wv-active");
        }
        if (this._bmLibChipsActive()) {
            filterBtn.classList.add("wv-bm-lib-filter-active");
        }
        // Search button — toggles a search input row below the actions
        // row. Sits between +/folder and the funnel (data:image/svg+xml
        // path mirrors the funnel approach so the icon picks up the
        // same `-moz-context-properties: fill,stroke` tint as +/folder).
        const searchBtn = doc.createElementNS(NS_HTML, "button");
        // First of the right-grouped buttons → carry the spacer so the
        // gap sits between the +/folder add-cluster and the search +
        // funnel filter-cluster (instead of between search and funnel).
        searchBtn.className = "wv-bm-iconbtn wv-bm-funnel-spacer";
        searchBtn.setAttribute("title", "Search bookmarks");
        // Use Zotero's native `magnifier.svg` (the same icon the
        // library's main quick-search field shows) so the search
        // affordance reads consistently across the UI. `<img>` in the
        // chrome window can load chrome:// directly — no data URI
        // dance — and the existing `.wv-bm-iconbtn img` rule themes
        // it via `-moz-context-properties: fill, stroke`.
        const searchImg = doc.createElementNS(NS_HTML, "img");
        searchImg.setAttribute("src", "chrome://zotero/skin/16/universal/magnifier.svg");
        searchImg.setAttribute("width", "20");
        searchImg.setAttribute("height", "20");
        searchBtn.appendChild(searchImg);
        searchBtn.addEventListener("click", () => {
            this._bmLibSearchOpen = !this._bmLibSearchOpen;
            if (!this._bmLibSearchOpen) this._bmLibFilterText = "";
            this._bmRenderPopupList(win);
        });
        if (this._bmLibSearchOpen || (this._bmLibFilterText && this._bmLibFilterText.length)) {
            searchBtn.classList.add("wv-active");
        }
        actions.appendChild(searchBtn);
        actions.appendChild(filterBtn);
        inner.appendChild(actions);

        // Search input — only rendered when the user has toggled the
        // search button open. Live-filters labels; composes with the
        // chip filter (both must match). `_bmRefreshPopupList` only
        // rebuilds the list, so the input keeps focus + caret on every
        // keystroke.
        if (this._bmLibSearchOpen) {
            const searchRow = doc.createElementNS(NS_HTML, "div");
            searchRow.className = "wv-bm-search";
            const searchInput: any = doc.createElementNS(NS_HTML, "input");
            searchInput.className = "wv-bm-search-input";
            searchInput.setAttribute("type", "text");
            searchInput.setAttribute("placeholder", "Search bookmarks…");
            searchInput.value = this._bmLibFilterText || "";
            searchInput.addEventListener("input", () => {
                this._bmLibFilterText = searchInput.value;
                this._bmRefreshPopupList(win);
            });
            searchInput.addEventListener("keydown", (e: any) => {
                if (e.key === "Escape" && searchInput.value) {
                    e.stopPropagation();
                    searchInput.value = "";
                    this._bmLibFilterText = "";
                    this._bmRefreshPopupList(win);
                }
            });
            searchRow.appendChild(searchInput);
            inner.appendChild(searchRow);
            win.setTimeout(() => { try { searchInput.focus(); searchInput.select(); } catch (_) {} }, 0);
        }

        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-bm-sep";
        inner.appendChild(sep);

        const list = doc.createElementNS(NS_HTML, "div");
        list.className = "wv-bm-scroll";
        inner.appendChild(list);

        this._bmRenderPopupBody(doc, win, list);
    }

    /** Render just the scrollable list (folders/items or filtered flat list)
     *  into the existing container — preserves the search input's focus
     *  and caret while the user types. Called from the live `input` event;
     *  full re-render via `_bmRenderPopupList` only when the filter UI
     *  itself toggles. */
    _bmRefreshPopupList(win?: any) {
        win = win || Zotero.getMainWindow();
        const doc: any = win && win.document;
        if (!doc) return;
        const inner = doc.getElementById(BM_INNER_ID);
        if (!inner) return;
        const list = inner.querySelector(".wv-bm-scroll");
        if (!list) return;
        this._bmCloseAllFlyouts();
        this._bmRenderPopupBody(doc, win, list);
    }

    /** Populate the bookmark list container — branches by whether any
     *  filter (text or chip) is active. Inactive → normal one-level
     *  tree (folders open as cascading flyouts). Active → walk the
     *  entire tree and show matching item rows as a flat list. When
     *  both text and chip filters are active, BOTH must match. */
    _bmRenderPopupBody(doc: any, win: any, list: any) {
        while (list.firstChild) list.firstChild.remove();
        const root = this._bmGetAll();
        if (!root.length) {
            const empty = doc.createElementNS(NS_HTML, "div");
            empty.className = "wv-bm-empty";
            empty.textContent = "No bookmarks yet. Use ＋ Add Bookmarks…";
            list.appendChild(empty);
            return;
        }
        const q = (this._bmLibFilterText || "").trim().toLowerCase();
        const chipsOn = this._bmLibChipsActive();
        if (q || chipsOn) {
            const st = chipsOn ? this._bmLibChipState() : null;
            let any = false;
            const walk = (arr: any[]) => {
                for (const n of (arr || [])) {
                    if (!n) continue;
                    if (n.type === "folder") { walk(n.children || []); continue; }
                    if (q) {
                        const t = String(n.label || "").toLowerCase();
                        if (t.indexOf(q) < 0) continue;
                    }
                    if (st && !this._wvBmNodeMatchesChips(n, st)) continue;
                    this._bmRenderItemRow(doc, win, list, n, 0);
                    any = true;
                }
            };
            walk(root);
            if (!any) {
                const empty = doc.createElementNS(NS_HTML, "div");
                empty.className = "wv-bm-search-empty";
                empty.textContent = q
                    ? "No bookmarks match \"" + (this._bmLibFilterText || "") + "\"."
                    : "No bookmarks match the current filter.";
                list.appendChild(empty);
            }
            return;
        }
        this._bmRenderInto(doc, win, list, root, 0);
    }

    /** Render ONE level of entries into a container. Children of folders
     *  are NOT shown here — they appear in a hover/click flyout. `level`
     *  is the depth of this container (main list = 0). */
    _bmRenderInto(doc: any, win: any, container: any, nodes: any[], level: number) {
        for (const bm of nodes) {
            if (bm.type === "folder") this._bmRenderFolderRow(doc, win, container, bm, level);
            else this._bmRenderItemRow(doc, win, container, bm, level);
        }
    }

    // ---- Cascading flyout submenus (Firefox-style) ------------------------

    _bmCancelOpenTimer() {
        if (this._bmOpenTimer) {
            try { Zotero.getMainWindow().clearTimeout(this._bmOpenTimer); } catch (e) {}
            this._bmOpenTimer = null;
        }
    }

    _bmCancelCloseTimer() {
        if (this._bmCloseTimer) {
            try { Zotero.getMainWindow().clearTimeout(this._bmCloseTimer); } catch (e) {}
            this._bmCloseTimer = null;
        }
    }

    /** Close flyouts whose depth >= `depth`. */
    _bmCloseFlyoutsFrom(depth: number) {
        const st = this._bmFlyoutStack || [];
        while (st.length && st[st.length - 1].depth >= depth) {
            const f = st.pop();
            try { f.panel.hidePopup(); } catch (e) {}
            try { f.panel.remove(); } catch (e) {}
        }
    }

    _bmCloseAllFlyouts() {
        this._bmCancelOpenTimer();
        this._bmCancelCloseTimer();
        this._bmCloseFlyoutsFrom(0);
        this._bmFlyoutStack = [];
    }

    _bmScheduleOpenFlyout(win: any, rowEl: any, folder: any, depth: number) {
        this._bmCancelOpenTimer();
        this._bmOpenTimer = win.setTimeout(
            () => this._bmOpenFlyout(win, rowEl, folder, depth), 220);
    }

    _bmScheduleCloseFlyouts(depth: number) {
        this._bmCancelCloseTimer();
        const win = Zotero.getMainWindow();
        this._bmCloseTimer = win.setTimeout(() => this._bmCloseFlyoutsFrom(depth), 320);
    }

    /** Open a folder's children as a flyout sub-panel to the right of its
     *  row. Each flyout is its own XUL <panel> (so it's not clipped and
     *  layers above), chained by depth. */
    _bmOpenFlyout(win: any, rowEl: any, folder: any, depth: number) {
        try {
            this._bmCancelCloseTimer();
            this._bmCloseFlyoutsFrom(depth);
            const kids = (folder && Array.isArray(folder.children)) ? folder.children : [];
            const doc: any = win.document;
            const panel = doc.createXULElement("panel");
            panel.id = "wv-bm-flyout-" + depth;
            panel.className = "wv-bm-flyout";
            panel.setAttribute("animate", "false");
            panel.setAttribute("noautohide", "true");
            panel.setAttribute("consumeoutsideclicks", "false");
            panel.setAttribute("tooltip", "html-tooltip");
            const finner = doc.createElementNS(NS_HTML, "div");
            finner.className = "wv-bm-flyout-inner";
            panel.appendChild(finner);
            if (kids.length) {
                this._bmRenderInto(doc, win, finner, kids, depth);
            } else {
                const empty = doc.createElementNS(NS_HTML, "div");
                empty.className = "wv-bm-empty";
                empty.textContent = "(empty)";
                finner.appendChild(empty);
            }
            panel.addEventListener("mouseenter", () => this._bmCancelCloseTimer());
            panel.addEventListener("mouseleave", () => this._bmScheduleCloseFlyouts(depth));
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(panel);
            this._bmFlyoutStack = this._bmFlyoutStack || [];
            this._bmFlyoutStack.push({ panel, depth, folderId: folder.id });
            // To the right of the row, top-aligned.
            panel.openPopup(rowEl, "end_before", 0, 0, false, false);
        } catch (e) {
            Zotero.debug("[Weavero] _bmOpenFlyout err: " + e);
        }
    }

    /** Hover wiring shared by folder rows at any level. */
    _bmAttachFolderHover(win: any, row: any, bm: any, level: number) {
        const childDepth = level + 1;
        row.addEventListener("mouseenter", () => {
            this._bmCancelCloseTimer();
            const open = (this._bmFlyoutStack || []).some(
                (f: any) => f.depth === childDepth && f.folderId === bm.id);
            if (!open) {
                this._bmCloseFlyoutsFrom(childDepth);
                this._bmScheduleOpenFlyout(win, row, bm, childDepth);
            }
        });
        row.addEventListener("mouseleave", () => {
            this._bmCancelOpenTimer();
            this._bmScheduleCloseFlyouts(childDepth);
        });
    }

    /** Shared drag-and-drop wiring. Item rows get before/after zones;
     *  folder rows additionally get a middle "into" zone. */
    _bmAttachDragHandlers(doc: any, win: any, row: any, bm: any, isFolder: boolean) {
        row.setAttribute("draggable", "true");
        const clearDrop = () => row.classList.remove(
            "wv-bm-dragover", "wv-bm-dragover-bottom", "wv-bm-dragover-into");
        const computeMode = (e: any) => {
            const r = row.getBoundingClientRect();
            const y = e.clientY - r.top;
            if (isFolder) {
                if (y < r.height * 0.25) return "before";
                if (y > r.height * 0.75) return "after";
                return "into";
            }
            return (y > r.height / 2) ? "after" : "before";
        };
        row.addEventListener("dragstart", (e: any) => {
            try {
                e.dataTransfer.setData("text/plain", bm.id);
                e.dataTransfer.effectAllowed = "move";
            } catch (_) {}
            row.classList.add("wv-bm-dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("wv-bm-dragging"));
        row.addEventListener("dragover", (e: any) => {
            e.preventDefault();
            try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
            const mode = computeMode(e);
            clearDrop();
            if (mode === "before") row.classList.add("wv-bm-dragover");
            else if (mode === "after") row.classList.add("wv-bm-dragover-bottom");
            else row.classList.add("wv-bm-dragover-into");
        });
        row.addEventListener("dragleave", clearDrop);
        row.addEventListener("drop", (e: any) => {
            e.preventDefault();
            clearDrop();
            let draggedId = "";
            try { draggedId = e.dataTransfer.getData("text/plain"); } catch (_) {}
            if (draggedId && draggedId !== bm.id) {
                const mode = computeMode(e);
                this._bmMove(draggedId, bm.id, mode)
                    .then(() => this._bmRenderPopupList(win));
            }
        });
    }

    _bmRenderItemRow(doc: any, win: any, container: any, bm: any, _level: number) {
        const row = doc.createElementNS(NS_HTML, "div");
        row.className = "wv-bm-row";

        const ic = this._bmIconInfo(bm, win);
        const icon = doc.createElementNS(NS_HTML, "img");
        icon.setAttribute("src", ic.image);
        icon.setAttribute("width", "16");
        icon.setAttribute("height", "16");
        let st = "flex:0 0 auto;";
        if (ic.fill) st += "-moz-context-properties:fill;fill:" + ic.fill + ";";
        icon.setAttribute("style", st);
        icon.addEventListener("error", () => {
            try {
                if (icon.getAttribute("src") !== BM_FALLBACK_DATA_URI) {
                    icon.setAttribute("src", BM_FALLBACK_DATA_URI);
                }
            } catch (e) {}
        });

        const label = doc.createElementNS(NS_HTML, "div");
        label.className = "wv-bm-label";
        // URL bookmarks inherit the same scheme-coloured link palette
        // Weavero uses in notes / reader / item pane.
        if (bm.type === "url") {
            const cls = this._urlLinkClass(String(bm.url || ""));
            if (cls) label.classList.add(cls);
        }
        const labelText = bm.label || bm.itemKey || bm.collectionKey;
        label.textContent = labelText;
        // In-doc location bookmarks (`position`/`page`/`text`) in the
        // library store get an inline "— in <attachment>" suffix so the
        // row reads as "spot — in <doc>" without breaking row rhythm.
        const parentTitle = this._bmParentAttachmentTitle(bm);
        if (parentTitle) {
            const sub = doc.createElementNS(NS_HTML, "span");
            sub.className = "wv-bm-sublabel";
            sub.textContent = " — in " + parentTitle;
            label.appendChild(sub);
            label.setAttribute("title", labelText + " — in " + parentTitle);
        } else {
            label.setAttribute("title", labelText);
        }
        // Surface the bookmark's comment in the row tooltip — the annotation's
        // comment for annotation bookmarks, else the bookmark's own comment
        // (both edited via right-click → Edit Bookmark…).
        try {
            let cmt = this._bmAnnotationCommentSync(bm);
            if (!cmt && bm.comment) cmt = String(bm.comment).trim() || null;
            if (cmt) {
                label.setAttribute("title", (label.getAttribute("title") || labelText) + "\n\n" + cmt);
            }
        } catch (_) {}

        row.appendChild(icon);
        row.appendChild(label);

        // Orphan bookmark — its Zotero target was deleted/purged. Mark the row
        // (dim + strikethrough via CSS) and append a ⚠ badge; clicking flashes
        // instead of silently no-opping. Remove via the right-click menu.
        const missing = this._bmTargetMissing(bm);
        if (missing) {
            row.classList.add("wv-bm-missing");
            const warn = doc.createElementNS(NS_HTML, "span");
            warn.className = "wv-bm-missing-badge";
            warn.textContent = "⚠";
            warn.setAttribute("title", "This bookmark's target no longer exists. Right-click → Delete Bookmark to remove it.");
            row.appendChild(warn);
            label.setAttribute("title", (label.getAttribute("title") || labelText) + " — target no longer exists");
        }

        // Hovering a non-folder cancels any pending sibling-folder open.
        row.addEventListener("mouseenter", () => this._bmCancelOpenTimer());
        // Rich hover card (same look as the reader bookmarks pane). Show on
        // delay; cancel if the cursor leaves before the timer fires.
        row.addEventListener("mouseenter", () => {
            try { if (this._wvBmHoverHideTimer && win) win.clearTimeout(this._wvBmHoverHideTimer); this._wvBmHoverHideTimer = null; } catch (_) {}
            try { if (this._wvBmHoverTimer && win) win.clearTimeout(this._wvBmHoverTimer); } catch (_) {}
            this._wvBmHoverTimer = win.setTimeout(() => {
                this._wvBmHoverTimer = null;
                try { this._wvReaderShowBmHoverCard(null, doc, row, bm); } catch (_) {}
            }, 450);
        });
        row.addEventListener("mouseleave", () => {
            try { if (this._wvBmHoverTimer && win) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
            try { this._wvReaderScheduleHideBmHoverCard(doc); } catch (_) {}
        });
        row.addEventListener("click", (e: any) => {
            // Orphan target → flash the row as feedback, keep the popup open.
            if (missing) { this._bmFlashMissingRow(row); return; }
            this._bmActivateBookmark(bm, e);
            this._bmHidePopup(win);
        });
        row.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            // Right-click dismisses the hover card immediately (re-hover
            // re-shows it after the standard delay).
            try { if (this._wvBmHoverTimer && win) { win.clearTimeout(this._wvBmHoverTimer); this._wvBmHoverTimer = null; } } catch (_) {}
            try { this._wvReaderHideBmHoverCard(doc); } catch (_) {}
            this._bmRowContextMenu(win, bm, e.screenX, e.screenY);
        });
        this._bmAttachDragHandlers(doc, win, row, bm, false);
        container.appendChild(row);
    }

    _bmRenderFolderRow(doc: any, win: any, container: any, bm: any, level: number) {
        const row = doc.createElementNS(NS_HTML, "div");
        row.className = "wv-bm-row wv-bm-folder";

        const folderIcon = doc.createElementNS(NS_HTML, "img");
        folderIcon.setAttribute("src", BM_FOLDER_ICON);
        folderIcon.setAttribute("width", "16");
        folderIcon.setAttribute("height", "16");
        folderIcon.setAttribute("style",
            "flex:0 0 auto;-moz-context-properties:fill;fill:currentColor;");

        const label = doc.createElementNS(NS_HTML, "div");
        label.className = "wv-bm-label";
        label.textContent = bm.name || "Folder";
        label.setAttribute("title", label.textContent);

        // Right-side chevron, Firefox-style (the flyout opens on hover/click).
        // Built with createElementNS — innerHTML doesn't auto-set the SVG
        // namespace in this XHTML/XUL context so a raw <svg> string wouldn't
        // render. 12px SVG, same shape as RP_CHEV_RIGHT, themed via
        // currentColor so it tracks the row's text colour.
        const arrow = doc.createElementNS(NS_HTML, "span");
        arrow.className = "wv-bm-arrow";
        const NS_SVG = "http://www.w3.org/2000/svg";
        const arrowSvg = doc.createElementNS(NS_SVG, "svg");
        arrowSvg.setAttribute("viewBox", "0 0 16 16");
        arrowSvg.setAttribute("fill", "none");
        arrowSvg.setAttribute("stroke", "currentColor");
        arrowSvg.setAttribute("stroke-width", "1.5");
        arrowSvg.setAttribute("stroke-linecap", "round");
        arrowSvg.setAttribute("stroke-linejoin", "round");
        const arrowPath = doc.createElementNS(NS_SVG, "path");
        arrowPath.setAttribute("d", "M6 4l4 4-4 4");
        arrowSvg.appendChild(arrowPath);
        arrow.appendChild(arrowSvg);

        row.appendChild(folderIcon);
        row.appendChild(label);
        row.appendChild(arrow);

        row.addEventListener("click", () => {
            this._bmCancelOpenTimer();
            this._bmCancelCloseTimer();
            this._bmOpenFlyout(win, row, bm, level + 1);
        });
        row.addEventListener("contextmenu", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this._bmFolderContextMenu(win, bm, e.screenX, e.screenY);
        });
        this._bmAttachFolderHover(win, row, bm, level);
        this._bmAttachDragHandlers(doc, win, row, bm, true);
        container.appendChild(row);
    }

    /** The dropdown toolbar's "+" button opens this 2-item menu (anchored under
     *  the button): "Pick item from library…" (the item picker) and "Add Link…"
     *  (a URL/zotero-link bookmark). Mirrors the reader sidebar's + menu — and
     *  the same two entries the right-click "Add Bookmark" submenu offers. */
    _bmShowDropdownAddMenu(win: any, anchorBtn: any) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) { mi.classList.add("menuitem-iconic"); mi.setAttribute("image", image); }
                mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            add("Pick item from library…", () => { this._bmHidePopup(win); this._bmAddBookmarksDialog(); }, BM_MENU_BOOKMARK_ICON);
            add("Add Link…", () => { this._bmHidePopup(win); this._bmAddLinkDialog(win); }, BM_MENU_LINK_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopup(anchorBtn, "after_start", 0, 0, false, false);
        } catch (e) {
            Zotero.debug("[Weavero] _bmShowDropdownAddMenu err: " + e);
        }
    }

    /** Append an "Add Bookmark ▸" submenu (a XUL <menu>) to a context menu,
     *  with "Pick item from library…" and "Add Link…" children. Adding a link
     *  *is* adding a bookmark, so the two live together under one parent rather
     *  than as siblings of each other. Shared by the row / folder / empty menus. */
    _bmAppendAddBookmarkSubmenu(doc: any, menu: any, win: any) {
        const parent = doc.createXULElement("menu");
        parent.setAttribute("label", "Add Bookmark");
        parent.classList.add("menu-iconic");
        parent.setAttribute("image", BM_MENU_ADD_ICON);
        const popup = doc.createXULElement("menupopup");
        const mk = (label: string, fn: any, image: string) => {
            const mi = doc.createXULElement("menuitem");
            mi.setAttribute("label", label);
            mi.classList.add("menuitem-iconic");
            mi.setAttribute("image", image);
            mi.addEventListener("command", fn);
            popup.appendChild(mi);
        };
        mk("Pick item from library…", () => { this._bmHidePopup(win); this._bmAddBookmarksDialog(); }, BM_MENU_BOOKMARK_ICON);
        mk("Add Link…", () => { this._bmHidePopup(win); this._bmAddLinkDialog(win); }, BM_MENU_LINK_ICON);
        parent.appendChild(popup);
        menu.appendChild(parent);
    }

    /** Right-click menu for a bookmark row. */
    async _bmRowContextMenu(win: any, bm: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) {
                    mi.classList.add("menuitem-iconic");
                    mi.setAttribute("image", image);
                }
                if (fn) mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            const target = await this._bmResolveOpenTarget(bm);
            if (target) {
                let attIcon = "";
                try { attIcon = target.attachment.getImageSrc(); } catch (e) {}
                add("Open " + target.typeLabel + " in New Tab", () => {
                    this._bmOpenInReader(bm, false);
                    this._bmHidePopup(win);
                }, attIcon);
                add("Open " + target.typeLabel + " in New Window", () => {
                    this._bmOpenInReader(bm, true);
                    this._bmHidePopup(win);
                }, attIcon);
            }
            add("Show in Library", () => {
                this._bmShowInLibrary(bm);
                this._bmHidePopup(win);
            }, this._bmShowInLibraryIcon(bm, win));
            menu.appendChild(doc.createXULElement("menuseparator"));
            add("Edit Bookmark…", () => {
                this._bmEditBookmarkDialog(win, bm);
            }, BM_RENAME_ICON);
            // "Reset to Original Name" — only when the current title actually
            // differs from the bookmark's original. Gated on the label vs the
            // (live-derived or stored) original rather than the `renamed` flag,
            // so previously-renamed bookmarks carrying a stale `renamed:false`
            // still get the option. Mirrors the reader-side menu.
            {
                const orig = this._bmReaderOriginalLabel(bm);
                if (orig && orig !== bm.label) {
                    add("Reset to Original Name", () => {
                        this._bmResetBookmarkName(bm.id).then(() => this._bmRenderPopupList(win));
                    }, BM_RESET_ICON);
                }
            }
            add("Delete Bookmark", () => {
                this._bmRemove(bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_DELETE_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            this._bmAppendAddBookmarkSubmenu(doc, menu, win);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmRowContextMenu err: " + e);
        }
    }

    /** Right-click menu for a folder row. */
    _bmFolderContextMenu(win: any, bm: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) {
                    mi.classList.add("menuitem-iconic");
                    mi.setAttribute("image", image);
                }
                if (fn) mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            add("Rename Folder…", () => {
                const name = this._bmPromptName(win, "Rename Folder", bm.name || "");
                if (name) this._bmRenameFolder(bm.id, name).then(() => this._bmRenderPopupList(win));
            }, BM_RENAME_ICON);
            add("New Subfolder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name, bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            // Destructive (folder + contents), but confirm when non-empty —
            // the confirmation stands in for the undo we don't have.
            add("Delete Folder", () => {
                const count = this._bmCountDescendants(bm);
                if (count > 0) {
                    let ok = false;
                    try {
                        ok = Services.prompt.confirm(win, "Delete Folder",
                            'Delete the folder "' + (bm.name || "Folder") + '" and its '
                            + count + " item" + (count === 1 ? "" : "s") + "?");
                    } catch (e) { ok = false; }
                    if (!ok) return;
                }
                this._bmRemove(bm.id).then(() => this._bmRenderPopupList(win));
            }, BM_DELETE_ICON);
            menu.appendChild(doc.createXULElement("menuseparator"));
            this._bmAppendAddBookmarkSubmenu(doc, menu, win);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmFolderContextMenu err: " + e);
        }
    }

    /** Right-click on the dropdown's empty area → Add Bookmark / New Folder. */
    _bmEmptyContextMenu(win: any, screenX: number, screenY: number) {
        try {
            const doc: any = win.document;
            doc.getElementById(BM_ROW_MENU_ID)?.remove();
            const menu = doc.createXULElement("menupopup");
            menu.id = BM_ROW_MENU_ID;
            const add = (label: string, fn: any, image?: string) => {
                const mi = doc.createXULElement("menuitem");
                mi.setAttribute("label", label);
                if (image) { mi.classList.add("menuitem-iconic"); mi.setAttribute("image", image); }
                mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            this._bmAppendAddBookmarkSubmenu(doc, menu, win);
            add("New Folder…", () => {
                const name = this._bmPromptName(win, "New Folder", "New Folder");
                if (name) this._bmAddFolder(name).then(() => this._bmRenderPopupList(win));
            }, BM_MENU_NEWFOLDER_ICON);
            const host = doc.getElementById("mainPopupSet") || doc.documentElement;
            host.appendChild(menu);
            menu.addEventListener("popuphidden",
                () => { try { menu.remove(); } catch (e) {} }, { once: true });
            menu.openPopupAtScreen(screenX, screenY, true);
        } catch (e) {
            Zotero.debug("[Weavero] _bmEmptyContextMenu err: " + e);
        }
    }

    // ---- Collections right-click "Bookmark Collection" --------------------

    /** True if a tree row is a saved search or a special row (duplicates,
     *  unfiled, trash, my publications, retracted, recently read) — i.e.
     *  bookmarkable as a generic "treerow". */
    _bmTreeRowIsSpecial(tr: any) {
        try {
            const f = (n: string) => typeof tr[n] === "function" && tr[n]();
            return !!(tr && (f("isSearch") || f("isDuplicates") || f("isUnfiled")
                || f("isTrash") || f("isPublications") || f("isRetracted")
                || f("isRecentlyRead")));
        } catch (e) { return false; }
    }

    /** True if a collections-tree row is a library-level row (My Library,
     *  a group library, or a feed) — i.e. bookmarkable as a library. */
    _bmTreeRowIsLibrary(treeRow: any) {
        try {
            return !!(treeRow && (
                (typeof treeRow.isLibrary === "function" && treeRow.isLibrary())
                || (typeof treeRow.isGroup === "function" && treeRow.isGroup())
                || (typeof treeRow.isFeed === "function" && treeRow.isFeed())));
        } catch (e) { return false; }
    }

    _setupCollectionsBookmarkMenu(win?: any) {
        try {
            win = win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const menu = doc.getElementById("zotero-collectionmenu");
            if (!menu) return;
            this._teardownCollectionsBookmarkMenu(win);
            const ID = "wv-collectionmenu-bookmark";
            const mkEntry = (label: string, fn: any) => {
                const mi = doc.createXULElement("menuitem");
                mi.id = ID;
                mi.classList.add("menuitem-iconic");
                mi.setAttribute("label", label);
                mi.setAttribute("image", BM_MENU_BOOKMARK_ICON);
                mi.addEventListener("command", fn);
                menu.appendChild(mi);
            };
            const onShowing = () => {
                try {
                    const stale = doc.getElementById(ID);
                    if (stale) stale.remove();
                    const zp = win.ZoteroPane;
                    if (!zp) return;
                    const col = (typeof zp.getSelectedCollection === "function")
                        ? zp.getSelectedCollection() : null;
                    if (col && col.key) {
                        const bookmarked = this._bmHasCollection(col.libraryID, col.key);
                        mkEntry(bookmarked ? "Remove Collection Bookmark" : "Bookmark Collection",
                            () => {
                                try {
                                    const c = zp.getSelectedCollection();
                                    if (!c || !c.key) return;
                                    if (this._bmHasCollection(c.libraryID, c.key)) {
                                        const ex = this._bmFlatten().find((b: any) =>
                                            b.type === "collection" && b.libraryID === c.libraryID
                                            && b.collectionKey === c.key);
                                        if (ex) this._bmRemove(ex.id);
                                    } else { this._bmBookmarkCollection(c); }
                                } catch (e) {
                                    Zotero.debug("[Weavero] bookmark-collection cmd err: " + e);
                                }
                            });
                        return;
                    }
                    // No collection selected -> a library row (My Library / group /
                    // feed)? Offer "Bookmark Library".
                    const cv = zp.collectionsView;
                    const tr = cv && cv.selectedTreeRow;
                    if (tr && this._bmTreeRowIsLibrary(tr) && tr.ref
                            && typeof tr.ref.libraryID === "number") {
                        const libraryID = tr.ref.libraryID;
                        const bookmarked = this._bmHasLibrary(libraryID);
                        mkEntry(bookmarked ? "Remove Library Bookmark" : "Bookmark Library",
                            () => {
                                try {
                                    if (this._bmHasLibrary(libraryID)) {
                                        const ex = this._bmFlatten().find((b: any) =>
                                            b.type === "library" && b.libraryID === libraryID);
                                        if (ex) this._bmRemove(ex.id);
                                    } else { this._bmBookmarkLibrary(libraryID); }
                                } catch (e) {
                                    Zotero.debug("[Weavero] bookmark-library cmd err: " + e);
                                }
                            });
                        return;
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] collection bookmark popupshowing err: " + e);
                }
            };
            const onHidden = () => {
                try { const el = doc.getElementById(ID); if (el) el.remove(); } catch (e) {}
            };
            menu.addEventListener("popupshowing", onShowing);
            menu.addEventListener("popuphidden", onHidden);
            this._collectionBookmarkMenuHandlers = { menu, onShowing, onHidden };
        } catch (e) {
            Zotero.debug("[Weavero] _setupCollectionsBookmarkMenu err: " + e);
        }
    }

    _teardownCollectionsBookmarkMenu(_win?: any) {
        if (!this._collectionBookmarkMenuHandlers) return;
        try {
            const { menu, onShowing, onHidden } = this._collectionBookmarkMenuHandlers;
            try { menu.removeEventListener("popupshowing", onShowing); } catch (e) {}
            try { menu.removeEventListener("popuphidden", onHidden); } catch (e) {}
            try {
                const stale = menu.ownerDocument.getElementById("wv-collectionmenu-bookmark");
                if (stale) stale.remove();
            } catch (e) {}
        } catch (e) {}
        this._collectionBookmarkMenuHandlers = null;
    }

    // ---- Make library rows draggable onto the bookmark icon ----------------

    /** Let library rows (My Library / group / feed) be dragged onto the bookmark
     *  icon. Zotero's collection tree only starts a drag for collections and
     *  searches — its `onDragStart` bails on library rows (collectionTree.jsx),
     *  so a dragged library carries NO drag data and can't be dropped anywhere.
     *
     *  Safe, non-invasive shim: we do NOT touch Zotero's handler. The row's own
     *  (passive) `dragstart` already fires for library rows (every row is
     *  `draggable`); we add our OWN bubble-phase listener on `#collection-tree`
     *  that runs AFTER it and, when the dragged (selected) row is a library and
     *  Zotero set no native drag data, attaches `weavero/library` = libraryID.
     *  Our toolbar drop target reads that; Zotero's own drop targets ignore the
     *  unknown type, so nothing else in the app changes. Fully removable. */
    _setupLibraryDragSource(win?: any) {
        try {
            win = win || Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            this._teardownLibraryDragSource(win);
            const tree = doc.getElementById("collection-tree");
            if (!tree) return;
            const onDragStart = (e: any) => {
                try {
                    const dt = e.dataTransfer;
                    if (!dt) return;
                    const t = dt.types;
                    const has = (k: string) => t && (typeof t.includes === "function"
                        ? t.includes(k) : Array.prototype.indexOf.call(t, k) >= 0);
                    // A native collection/search/item drag already carries data — leave it.
                    if (has("zotero/collection") || has("zotero/search") || has("zotero/item")) return;
                    const cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
                    const tr = cv && cv.selectedTreeRow;
                    if (tr && this._bmTreeRowIsLibrary(tr) && tr.ref
                            && typeof tr.ref.libraryID === "number") {
                        dt.setData("weavero/library", String(tr.ref.libraryID));
                        try { dt.effectAllowed = "copy"; } catch (_) {}
                        // Use the row element as the drag image for visual feedback.
                        try {
                            const rowEl = e.target && e.target.closest && e.target.closest(".row");
                            if (rowEl && typeof dt.setDragImage === "function") {
                                dt.setDragImage(rowEl, 12, 8);
                            }
                        } catch (_) {}
                    }
                } catch (er) {}
            };
            tree.addEventListener("dragstart", onDragStart, false);
            this._libraryDragSource = { tree, onDragStart };
        } catch (e) {
            Zotero.debug("[Weavero] _setupLibraryDragSource err: " + e);
        }
    }

    _teardownLibraryDragSource(_win?: any) {
        if (!this._libraryDragSource) return;
        try {
            const { tree, onDragStart } = this._libraryDragSource;
            try { tree.removeEventListener("dragstart", onDragStart, false); } catch (e) {}
        } catch (e) {}
        this._libraryDragSource = null;
    }
}

const _bookmarksDescriptors = Object.getOwnPropertyDescriptors(_BookmarksMixin.prototype);
delete (_bookmarksDescriptors as any).constructor;
export const bookmarksMethods = _bookmarksDescriptors;
