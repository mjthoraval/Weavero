// Module: references in your library (branch refs, plan
// work/refs-feature-plan-2026-11-18.md, approved by MJT 2026-11-18: "Go ahead
// for the refs plan").
//
// Zotero's citation popup (hover an in-text citation in a PDF; the reader's
// overlay-popup/reference/citation-popup.js draws one plain-text row per
// reference) gets, on each row whose reference is an item of one of your
// libraries:
//   - a mark, ● with a PDF (or an EPUB) the reader opens, ○ without;
//   - icon buttons in the row's corner: Tab (the cited PDF in a tab; an open
//     one is reused), Window (a new reader window), Split (the cited PDF
//     beside the citing paper in the split view, as a link's Ctrl/Cmd+click
//     opens -- open-where.ts "beside": a pair of the two, or the other side of
//     the pair the paper is in, so the next Split from the same paper replaces
//     it there; MJT 2026-11-19, no lock any more); without a PDF, Show in
//     Library;
//   - a ⋯ menu: Show in Library, "Also in: <library>" for the other copies,
//     Copy Link (zotero://select); since 1.2.1-refs.9 a card of the cited
//     work above them (_wvRefsCard: title, authors, year, journal, type,
//     library, abstract, graphical abstract), built when the menu opens.
// On a row whose reference is NOT in your libraries, a globe (Open in
// Browser, 1.2.1-refs.9, _wvRefsWebOpen): the entry's own link, else
// Crossref's confident answer at doi.org, else a Google Scholar search.
// The row's text stays Zotero's. Two more views of the same answers, one per
// entry of the paper's reference list:
//   - B2: a small ● / ○ in the margin beside each entry you have, in the PDF
//     (not in Reading Mode); a click opens the same choices as a menu
//     (_wvRefsMarksDraw);
//   - C: a "References" section in the reader's item pane: the list in
//     document order, "M References" in its header with the filter chips
//     beside it (_wvRefsSecChips), the same buttons on each row (the globe
//     on the others), the row's menu on a right-click; a click on an entry
//     shows it in the PDF (_wvRefsSecBuild).
// Nothing is written to any library, and the only network request is Open in
// Browser's Crossref lookup, made on the user's click: the marks are a view of
// an index kept in memory.
//
// The copy a button opens: one with a PDF, in the citing paper's library
// first, then My Library, then the groups (MJT's pick).
//
// WHERE THE DATA COMES FROM (measured 2026-11-18 on 11.0-beta.4 and 10.0.8
// with a probe run in each):
//   - the index (`_wvRefsIx`): every regular item of every library that is
//     not a feed, read from the database in one pass at the first reader that
//     needs it (lib/ref-match.ts holds the matching), then kept current from
//     the item notifier (stamped observer, `_wvRefsWireNotifier`);
//   - a paper's reference list: Zotero's structured document text,
//     `Zotero.SDT.getPack(attachmentID)` opened with the bundled module
//     (lib/sdt.ts; getReader where there is no getPack: zotero#6012 removes
//     getReader) -> `materialize()`, the blocks
//     flagged `reference: true` (continuations merged), each with its
//     `anchor.pageRects`; where Zotero flagged none, a numbered list read
//     from the same blocks (lib/ref-list.ts). Asked only for an attachment open in a reader:
//     the reader builds the pack at its init anyway (xpcom/reader.js
//     _createGetSDTPack), and SDT shares one build per item (sdt.js
//     _generating), so Weavero never builds one of its own;
//   - the popup's rows: `_internalReader._state.primaryViewOverlayPopup`
//     (or `secondary...`) holds the overlay, its `references` in row order.
//     A reference is tied to its entry by position (its first rect inside
//     the entry's box), else matched from its own text.
// Every private member read here (`_state`, `Zotero.SDT`, the popup's
// classes) is feature-tested; where one is missing the feature does
// nothing. test/refs.spec.js names them.
//
// zotero#5191 ("smart reference popup", not merged): when Zotero's popup
// recognises references itself (`Zotero.RecognizeReference`, or its rows'
// own status icon `.reference-row > .start`), Weavero adds only Window and
// Split -- Zotero shows the mark and Show in Library / Open in Reader.
// Tripwire: test/refs.spec.js.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvOpenedInstance } from "../lib/compat";
import { wvSleep, wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvSvgEl } from "../lib/svg";
import { wvLibBadgeEl, WV_LIB_BADGE_FILL, WV_LIB_BADGE_SHAPES } from "../lib/library-badge";
import { wvPaperGlyphUri } from "../lib/link-glyph";
import { wvStr, wvL10n, wvZoteroLabel, wvZoteroText } from "../lib/l10n";
import { wvMenuItem, wvMenuSeparator } from "../lib/menu";
import { wvPopupHost, winOf, wvHtmlEl, wvSetBoolAttr, wvBoolAttrOn, wvPlaceOnPages } from "../lib/dom";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvCloneFor } from "../lib/xray";
import { WvSectionDesc } from "./backlinks";
import { wvMainWins, wvIsLibraryTabID } from "../lib/windows";
import {
    WvRefIndex, WvRefItem, WvRefMatch, WvRefSelf,
    wvRefIndexNew, wvRefIndexPut, wvRefIndexDrop, wvRefIndexGet, wvRefMatch, wvRefSelfOf, wvRefCompact, wvRefCleanDOI,
} from "../lib/ref-match";
import { WvRefEntry, wvRefList } from "../lib/ref-list";
import { WvRefWebTarget, wvRefWebOwnLink, wvRefWebPick, wvRefWebScholarUrl, wvRefWebCrossrefUrl, wvRefWebBare, wvRefDoiUrl } from "../lib/ref-web";
import { WV_PREVHL_TINT } from "./preview-highlight";
import { refsCardsMethods } from "./refs-cards";
import { urlLinkClass, WV_LINK_SCAN_MAX } from "../lib/links";
import { WV_LF_SECTION_BUTTONS, WvLfList, wvLfMarkEl, wvLfSortKey } from "./list-filter";
import { WvLfRow, WvLfField, wvLfFold } from "../lib/list-filter";
import { wvCbEntryKeys } from "../lib/ref-citedby";
import { wvTrimTrailing } from "../lib/text";
import { wvIsImageFileName } from "../lib/open-guard";
import { wvSdtReader, wvSdtModule, wvSdtOpen, wvSdtVersionOk } from "../lib/sdt";

declare const Zotero: any;
declare const Components: any;
declare const Services: any;

const STYLE_ID = "wv-refs-style";
const MENU_ID = "wv-refs-menu";
const CTL_CLASS = "wv-refs-ctl";
const SVG_NS = "http://www.w3.org/2000/svg";
/** Zotero's accent blue (the split icon's active side, lib/split-glyph.ts). */
const BLUE = "#4072e5";
/** The marks' colours (MJT 2026-11-20: "a green circle if has the PDF file in my
 *  library, blue circle if in my library without the PDF file, and empty grey
 *  circle if not in my library"): Zotero's own annotation green and grey
 *  (xpcom/annotations.js general-green, general-gray), the accent blue. One
 *  meaning on every surface -- the PDF's reference list, Zotero's citation popup,
 *  the References section's rows and its chips. */
const GREEN = "#5fb236";
const GREY = "#aaaaaa";
/** A mark's kind: in your library with a PDF, without one, not in your libraries. */
type RefsMarkKind = "pdf" | "nopdf" | "web";
/** The colour rules of the marks under `sel` (an element carrying
 *  data-wv-refs-kind), for a surface's sheet; forced colours: the text's. */
const markColorCSS = (sel: string) => `
${sel}[data-wv-refs-kind="pdf"] { color: ${GREEN}; }
${sel}[data-wv-refs-kind="nopdf"] { color: ${BLUE}; }
${sel}[data-wv-refs-kind="web"] { color: ${GREY}; }
@media (forced-colors) { ${sel} { color: CanvasText !important; } }
`;
/** Main-thread time of the index build, and of a long list's match, before it yields (ms).
 *  8 until refspeed.4: while a PDF opens the main thread's queue is long and each yield
 *  waits behind it -- half the yields for the same work (the 1314-entry book's match:
 *  ~500 -> ~380 ms; work/refs-marks-speed-2026-11-21.md). A 16-ms step is still one frame. */
const BUILD_SLICE_MS = 16;
/** Items per database read when the whole index is built (_wvRefsLoad), read as an id
 *  range (BETWEEN: one statement, prepared once) and put BUILD_SLICE_MS at a time. 200
 *  took 5.8 s in all on MJT's 18,444 items (longest block 172 ms), mostly the reads' own
 *  overhead, and 500 traded ~50-ms steps for fewer reads (MJT 2026-11-20, "It seems to
 *  take a lot of time for loading the references?"); until refspeed.7 the slices were
 *  lists of 500 ids (`IN (...)`), and the first PDF of a session waited for the database
 *  most of its index build: 37 slices x 3 queries, 1.6-1.8 s of reads while Zotero starts
 *  (the same reads in one pass: 0.3-0.4 s on an idle Zotero; work/refs-marks-speed-
 *  2026-11-21.md). */
const LOAD_RANGE = 2000;
/** Entries a paper's list may have to be matched in one task (_wvRefsDocRows); a longer
 *  list is matched in steps (_wvRefsDocRowsBuild). About 0.35 ms an entry on MJT's library. */
const ROWS_SYNC_MAX = 100;
/** The References section's rows built at once (a paper's whole list), then per task
 *  (_wvRefsSecBuild): a book's 1314 rows were one 258 ms call. */
const SEC_ROWS_FIRST = 120;
const SEC_ROWS_STEP = 150;
/** The index and Cited by's store are read ahead this long after startup, at an idle
 *  moment (_wvRefsPreload), so the first PDF a session opens does not wait for them. */
const PRELOAD_DELAY_MS = 8000;
/** How often a reader still opening is asked whether it has drawn a page
 *  (_wvRefsAfterFirstPaint): the References work starts that much after it at most. 150
 *  until refspeed.2: Weavero saw a drawn page 83 ms after pdf.js drew it (median, up to
 *  187; work/refs-marks-speed-2026-11-21.md); a look is a few property reads. */
const PAINT_POLL_MS = 50;
/** The longest wait for an idle moment once the page is drawn, before the work starts
 *  anyway. 600 until refspeed.3: the wait took 1-454 ms (median ~70) on the bench's warm
 *  opens, pdf.js drawing the page's text layer and the next pages meanwhile. */
const PAINT_IDLE_MS = 300;
/** How long the work waits for the drawn page's text layer, at most (a page that has none
 *  drawn: an error, a page left before its layer). 0 since citations.6: the References
 *  marks no longer wait for page 1's text layer (MJT 2026-11-21: marks first, as he asked
 *  for marks sooner). The refspeed register (work/refs-marks-speed-2026-11-21.md) measured
 *  page 1's text about 94 ms later this way, and the marks 110-265 ms sooner on papers with
 *  a slow text layer (his PRL letter: 429 -> ~184 ms after page 1). The wait's code path
 *  stays (`!text && ... < PAINT_TEXT_MS` never waits at 0), so the value can come back.
 *  Published for the suite as WV_REFS_PAINT_TEXT_MS (test/refs-speed.spec.js). */
const PAINT_TEXT_MS = 0;
export const WV_REFS_PAINT_TEXT_MS = PAINT_TEXT_MS;
/** How often the drawn page's text layer is looked for meanwhile: at PAINT_POLL_MS Weavero
 *  saw it 35-63 ms after pdf.js drew it (refspeed.4), and the marks came 55 ms later than
 *  with no wait for the layer. At most 25 looks. */
const PAINT_TEXT_POLL_MS = 16;
/** Attachments whose reference lists are kept in memory. */
const ENTRY_CACHE = 30;
/** The content types counted as "with a PDF": what the reader opens as a document. */
const DOC_TYPES = ["application/pdf", "application/epub+zip"];

/** One entry of a paper's reference list: its text and its boxes, [page, x1, y1, x2, y2]. */
export type WvRefsEntry = WvRefEntry;
/** A row's answer: the copies of the cited work, best first, and whether one
 *  has a PDF. `away`: when no copy is in the citing paper's library, the
 *  library of the best copy (its mark carries that library's badge), else
 *  null; `others`: how many more libraries hold a copy then. `amb` (refkeys.1):
 *  when several different works fit the reference about equally (lib/ref-match.ts
 *  `ambiguous`), one item of each, `ids[0]` first -- the mark's uncertain variant
 *  and its tooltip; everything else takes `ids`, the first work's copies. */
export type WvRefsHit = { ids: number[]; how: string; pdf: boolean; away: number | null; others: number; amb?: number[] };

/** Reference lists by attachment id: plain data, no reader or window. */
const entryCache: Map<number, Promise<WvRefsEntry[]>> = new Map();
/** The file each attachment's list was read from: "size:lastModified"
 *  (_wvRefsFileStamp). A list is valid for that file only (1.2.1-refs.9, MJT
 *  2026-11-20: a cover page deleted after the list was read left every mark a
 *  page too far, until a restart). A stat, not the attachment's hash: the
 *  hash reads the whole file, and Zotero's own page edits (PDFWorker
 *  deletePages / rotatePages) rewrite the file without a notifier event
 *  (`saveTx({ skipAll: true })`), so only the file itself can say. */
const fileStamps: Map<number, string> = new Map();
/** Lists read from the entries the Cited by index stored for a PDF's full text
 *  (_wvRefsStoredEntries, citations.6), with the full-text cache's stamp each
 *  is of. Such a list has no position and is the LIBRARY pane's alone: a reader
 *  never takes one (_wvRefsPrepare, _wvRefsDocRows), so nothing of it marks a
 *  PDF; and the library pane leaves it for Zotero's structure once a cache is
 *  there (_wvRefsLibProbe). Keyed by the list itself: data only. */
const ftLists: WeakMap<WvRefsEntry[], string> = new WeakMap();
/** The prepare running for each reader (or library stand-in), the next one
 *  chained after it (_wvRefsPrepare). Weak: a reader gone takes its entry. */
const prepRuns: WeakMap<any, Promise<boolean>> = new WeakMap();

/** An entry of a full-text list as the section draws one: its text, no
 *  position, its number apart when it starts with one ("[12]", "(12)",
 *  "12.") -- the structure's rows show it so (lib/ref-list.ts `label`). Three
 *  digits at most before a dot: "2016." starts an entry with its year. */
function refsFtEntry(text: string): WvRefsEntry {
    const m = /^(\[\d{1,4}\]|\(\d{1,3}\)|\d{1,3}\.)\s/.exec(text);
    return m ? { text, rects: [], label: m[1] } : { text, rects: [] };
}

/** The References sections' bodies and their redraw (onInit's `refresh`);
 *  each leaves at its section's onDestroy, all at destroy(). */
const secBodies: Map<any, () => any> = new Map();
/** The section's filter, per main window ("all" | "have"), in this session. */
/** The References section's filter chips, per window (_wvRefsSecChips): the
 *  kinds shown alone (`inc`, alternatives) and hidden (`exc`). */
const secChips: WeakMap<any, { inc: string[]; exc: string[] }> = new WeakMap();
/** What each section body drew last -- its reader (or stand-in) and rows -- for the
 *  filter line's redraw (_wvRefsSecRedraw). */
const refsSecLast: WeakMap<any, { reader: any; data: any }> = new WeakMap();
/** Title boxes watched for room (_wvRefsChipsPlace), disconnected in destroy(). */
const chipBoxes: Set<any> = new Set();

const MARKS_STYLE_ID = "wv-refs-marks-style";
/** The PDF view window's resize, which places the marks' page boxes again
 *  (lib/listen.ts key; _wvRefsMarksDrawIn). */
const MARKS_RESIZE_KEY = "refsMarks:resize";
const BESIDE_RESIZE_KEY = "refsBeside:resize";
/** The split view's accent (tab-split.ts: the frame round the active side). */
const BESIDE_COLOR = "var(--color-accent, var(--accent-blue, #4072e5))";
const SEC_STYLE_ID = "wv-refs-sec-style";
/** The mark a section row's click leaves on its entry in the PDF
 *  (_wvRefsEntryMark): how long it stays, its sheet, its press listener. */
export const WV_REFS_ENTRY_HL_MS = 5000;
const ENTRYHL_STYLE_ID = "wv-refs-entryhl-style";
const ENTRYHL_KEY = "refsEntryHl:press";
/** The link preview's tint (Zotero's #f57b7b at 25 %, plain source-over), on
 *  every line of the entry; above the page, under nothing that takes presses. */
const ENTRYHL_CSS = `
.pdfViewer > .wv-refs-entryhl { position: absolute; inset: 0; pointer-events: none; z-index: 999998; }
.wv-refs-entryhl > .wv-refs-entryhl-page { position: absolute; width: 0; height: 0; }
.wv-refs-entryhl-box { position: absolute; background: ${WV_PREVHL_TINT}; border-radius: 1px; }
@media (forced-colors) { .wv-refs-entryhl-box { background: transparent; outline: 2px solid Highlight; } }
`;
/** Open in Browser (1.2.1-refs.9): Crossref's answer is waited for this long,
 *  then Google Scholar opens; the answers of this session are kept in memory
 *  (by the entry's text, at most WEB_CACHE), never on disk. */
const WEB_TIMEOUT_MS = 5000;
const WEB_CACHE = 200;
const webCache: Map<string, Promise<WvRefWebTarget>> = new Map();
/** The reference card's sheet, in the document of the menu that shows it. */
const CARD_STYLE_ID = "wv-refs-card-style";
/** A globe while its lookup runs (_wvRefsWebOpen): the drawing pulses, the
 *  pointer says so; still with reduced motion. */
const BUSY_CSS = (sel: string) => `
${sel} .wv-refs-btn[data-wv-refs-busy] { cursor: progress; }
${sel} .wv-refs-btn[data-wv-refs-busy] svg { animation: wv-refs-busy 0.9s ease-in-out infinite; }
@keyframes wv-refs-busy { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { ${sel} .wv-refs-btn[data-wv-refs-busy] svg { animation: none; opacity: 0.4; } }
`;
/** The settings the feature follows, its masters included. */
const REFS_PREFS = ["enableReferences", "referencesBibliographyMarks", "referencesSection", "enableRelations", "enableLinksAndRelations"];
const SEC_PANE_ID = "weavero-references";

/** The section's icon: a page with an arrow out of it -- what this paper cites
 *  (lib/link-glyph.ts wvPaperGlyphUri; Cited by's points in), in the grey of the
 *  Backlinks / Item Links icons (backlinks.ts). */
function secIcon(color: string, size: number): string {
    return wvPaperGlyphUri(color, size, "out");
}

const REFS_SECTION: WvSectionDesc = {
    paneID: SEC_PANE_ID,
    inst: "_wvRefsSecKey", glob: "_wvRefsSecKey", at: "_wvRefsSecUnregAt", timer: "_wvRefsSecTimer",
    header: { l10nID: "weavero-refs-header", icon: secIcon("#5a5a5a", 16), darkIcon: secIcon("#c8c8c8", 16) },
    sidenav: { l10nID: "weavero-refs-sidenav", icon: secIcon("#5a5a5a", 20), darkIcon: secIcon("#c8c8c8", 20) },
    bodyXHTML: '<html:div class="wv-refs-sec"></html:div>',
    hooks: { init: "_wvRefsSecInit", destroy: "_wvRefsSecDestroy", itemChange: "_wvRefsSecItemChange", render: "_wvRefsSecRender", asyncRender: "_wvRefsSecAsyncRender" },
    enabled: (p) => { try { return !!p._wvRefsSectionOn(); } catch (e) { return false; } },
    // The long lists' magnifier (list-filter.ts, citations M4); the sort's chips
    // go before it in the header (lfsort.1).
    buttons: WV_LF_SECTION_BUTTONS,
};

/** A mark's library badge (drawMark), as the tab strip draws the group badge
 *  on a tab's icon (tabs.ts _decorateTabBar): a thin dark halo lifts the
 *  temple off the dot under it; never a target of its own (the mark's
 *  tooltip and click). Each surface sets its size and corner. */
const LIBBADGE_LOOK = "filter: drop-shadow(0 0 0.7px #1c1c1e) drop-shadow(0 0 0.7px #1c1c1e); pointer-events: none;";
/** Where a badge's corner sits on its dot, as fractions of the dot across and down:
 *  the badge overlaps the dot's lower right, a little above and left of its centre
 *  (MJT 2026-11-20: "half of the circle horizontally and vertically", then "A bit
 *  more to the top and slightly to the left"). Every surface takes it: the PDF's
 *  margin, the popup's rows, the References rows (cited-by.ts the same on its icon). */
export const BADGE_AT = { x: 0.4, y: 0.3 };

/** B2's marks, in the PDF view's frame: small, in their kind's colour
 *  (markColorCSS), a hair more opaque under the pointer. Sized and placed in
 *  page units times pdf.js's `--scale-factor` (set on `.pdfViewer`), so they
 *  zoom with the page; a library badge as large as the dot, its corner on the
 *  dot's centre -- overlapping half of it across and half down (MJT 2026-11-20,
 *  after a turn on the dot's right at its height: "it would still be better to
 *  shift a bit down the library icon ... maybe half of the circle horizontally
 *  and vertically"; with the dots on the letters' middle it clears the next
 *  entry's dot). Every dot in one column, badge or not (_wvRefsMarkAnchor). */
const MARKS_CSS = `
.pdfViewer > .wv-refs-marks { position: absolute; inset: 0; pointer-events: none; z-index: 999999; }
.wv-refs-marks > .wv-refs-marks-page { position: absolute; width: 0; height: 0; }
.wv-refs-bibmark {
  position: absolute; display: block; pointer-events: auto; cursor: pointer;
  width: calc(6px * var(--scale-factor, 1)); height: calc(6px * var(--scale-factor, 1));
  min-width: 6px; min-height: 6px; transform: translate(-50%, -50%);
  opacity: 0.75;
}
.wv-refs-bibmark:hover { opacity: 1; }
/* Until its page's text has placed it (_wvRefsMarksDrawIn, MARK_TEXT_WAIT_MS): hidden, its box kept. */
.wv-refs-bibmark[data-wv-refs-wait] { visibility: hidden; }
.wv-refs-bibmark svg { display: block; width: 100%; height: 100%; }
.wv-refs-bibmark > .wv-refs-libbadge { position: absolute; left: ${BADGE_AT.x * 100}%; top: ${BADGE_AT.y * 100}%; ${LIBBADGE_LOOK} }
${markColorCSS(".wv-refs-bibmark")}
@media (forced-colors) { .wv-refs-bibmark { opacity: 1; } }
/* The paper open beside this one in the split view (_wvRefsBesideApply): its entry's mark
   ringed and its in-text citations boxed, in the split's accent -- the colour of the frame
   round the active side (MJT 2026-11-20, "Can you show that this reference is the one that
   is opened in split view?" ... "Do all 3. Every citation of the paper"). */
.wv-refs-bibmark[data-wv-refs-beside] { opacity: 1; border-radius: 50%; outline: 1.5px solid ${BESIDE_COLOR}; outline-offset: 1.5px; }
.pdfViewer > .wv-refs-beside { position: absolute; inset: 0; pointer-events: none; z-index: 999998; }
.wv-refs-beside > .wv-refs-beside-page { position: absolute; width: 0; height: 0; }
.wv-refs-beside-box { position: absolute; box-sizing: border-box; border: 1.5px solid ${BESIDE_COLOR}; border-radius: 2px; }
`;

/** How long a mark waits, hidden, for its page's text (refsPageText) before it shows where
 *  the entry's box put it (_wvRefsMarksDrawIn): a page whose text never comes keeps no mark
 *  hidden. From the draw to the marks placed by the text, on the test library's paper
 *  (refs.spec.js "B2: a mark shows once", 2026-11-24): 40 and 64 ms on Zotero 11.0-beta.5,
 *  6 ms on 10.0.8 -- six times the slowest leaves a loaded machine's page its own text. */
const MARK_TEXT_WAIT_MS = 400;

/** The section's rows, Zotero's row geometry (src-ts.md "Item-pane sections
 *  take Zotero's row geometry": 4px padding, 4px icon gap, 5px corners); a
 *  row never widens the pane (`contain: inline-size`). */
const SEC_CSS = `
.wv-refs-sec { display: flex; flex-direction: column; gap: 4px; contain: inline-size; }
/* The reference open beside the paper in the split view: a bar of the split's accent at its
   row's start (_wvRefsBesideApply). */
.wv-refs-sec-row[data-wv-refs-beside] { box-shadow: inset 2px 0 0 ${BESIDE_COLOR}; }
.wv-refs-sec-bar { display: flex; gap: 4px; padding-inline: 4px; }
.wv-refs-sec-bar > .wv-refs-chips { margin-inline-start: 0; }
/* The chips' icons: the marks themselves (green dot, blue dot, grey ring), a library's temple. */
.wv-refs-chips .wv-refs-chip-ic { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; }
.wv-refs-chips .wv-refs-chip-ic > svg { width: 10px; height: 10px; }
.wv-refs-chips .wv-refs-chip-ic[data-kind="away"] > svg { width: 12px; height: 12px; fill: currentColor; }
${markColorCSS(".wv-refs-chips .wv-refs-chip-ic")}
.wv-refs-sec-list { display: flex; flex-direction: column; }
/* A list read from the PDF's full text (no structure cache yet; citations.6): a muted line above it. */
.wv-refs-sec-approx { padding: 0 4px; color: var(--fill-secondary, GrayText); font-size: 0.92em; contain: inline-size; overflow-wrap: anywhere; }
.wv-refs-sec-row { display: flex; align-items: flex-start; gap: 4px; padding: 4px; border-radius: 5px; cursor: default; contain: inline-size; position: relative; }
.wv-refs-sec-row:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }
.wv-refs-sec-row .wv-refs-mark { flex: none; width: 12px; height: 16px; display: inline-flex; align-items: center; justify-content: center; position: relative; }
${markColorCSS(".wv-refs-sec-row .wv-refs-mark")}
/* The badge's corner at BADGE_AT on its dot, as in the PDF's margin (one badge on every
   surface, MJT 2026-11-20): the 8-px dot spans 2..10 of the 12-px mark, 4..12 of its 16. */
.wv-refs-sec-row .wv-refs-mark > .wv-refs-libbadge { position: absolute; width: 8px; height: 8px; inset-inline-start: ${2 + BADGE_AT.x * 8}px; top: ${4 + BADGE_AT.y * 8}px; ${LIBBADGE_LOOK} }
.wv-refs-sec-row .wv-refs-mark[data-wv-refs-lib] { margin-inline-end: 4px; }
.wv-refs-sec-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.wv-refs-sec-label { font-weight: 600; font-variant-numeric: tabular-nums; }
${refsUrlCSS(".wv-refs-sec-text")}
/* The buttons over the row's end while it is under the pointer, not a column of
   their own: the text takes the row's whole width (MJT 2026-11-20, "It is still a
   lot of empty space wasted"). Opaque -- the pane's colour under the row's hover
   tint -- so the text under them does not show through. */
.wv-refs-sec-btns { position: absolute; inset-inline-end: 4px; top: 2px; display: none; gap: 1px; padding-inline-start: 4px; border-radius: 4px;
  background-color: var(--material-sidepane, Canvas); background-image: linear-gradient(var(--fill-quinary, rgba(128,128,128,0.12)), var(--fill-quinary, rgba(128,128,128,0.12))); }
.wv-refs-sec-row:hover .wv-refs-sec-btns, .wv-refs-sec-row:focus-within .wv-refs-sec-btns { display: flex; }
.wv-refs-sec-btns .wv-refs-btn {
  display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center;
  border-radius: 4px; color: var(--fill-secondary, #555);
}
.wv-refs-sec-btns .wv-refs-btn:hover { background: var(--fill-quinary, rgba(0,0,0,0.08)); color: var(--fill-primary, #222); }
.wv-refs-sec-btns svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1; }
.wv-refs-sec-btns svg .wv-fill { fill: currentColor; stroke: none; }
${BUSY_CSS(".wv-refs-sec-btns")}
`;

/** The popup's CSS, in the reader's page (reader.html). The controls float at
 *  the row's end, so the reference's text flows around them and stays
 *  Zotero's; `inline-end` follows the page's direction. */
const CSS = `
/* The row's number apart, bold (_wvRefsRowText): React's own text hidden, the copy shown. */
.citation-popup .reference-row.wv-refs-row-fmt > div:not([class]) { display: none; }
.citation-popup .reference-row > .wv-refs-rowtext .wv-refs-row-label { font-weight: 600; font-variant-numeric: tabular-nums; }
${refsUrlCSS(".citation-popup .reference-row > .wv-refs-rowtext")}
/* The buttons over the row's end while it is under the pointer (or holds the focus, or a
   button is busy), on the row's hover tint -- the References section's rows (MJT
   2026-11-20, "The buttons could appear only on hover, to match the item pane design").
   Opaque, the popup's own background (the reader's popup mixin: --material-toolbar) under
   the tint, so the text under them does not show through. */
.citation-popup .reference-row:has(> .${CTL_CLASS}) { position: relative; }
.citation-popup .reference-row:has(> .${CTL_CLASS}):hover { background: var(--fill-quinary, rgba(128, 128, 128, 0.12)); }
.citation-popup .reference-row > .${CTL_CLASS} {
  position: absolute; inset-inline-end: 4px; top: 3px; display: none; align-items: center; gap: 1px;
  padding-inline-start: 4px; border-radius: 4px;
  background-color: var(--material-toolbar, Canvas);
  background-image: linear-gradient(var(--fill-quinary, rgba(128, 128, 128, 0.12)), var(--fill-quinary, rgba(128, 128, 128, 0.12)));
  user-select: none; -moz-user-select: none;
}
.citation-popup .reference-row:hover > .${CTL_CLASS},
.citation-popup .reference-row:focus-within > .${CTL_CLASS},
.citation-popup .reference-row > .${CTL_CLASS}:has(.wv-refs-btn[data-wv-refs-busy]) { display: flex; }
/* ONE reference: Zotero's row first -- the citation as the PDF prints it, to check the
   match against (MJT 2026-11-20, "I would still keep the Zotero popup at the top") -- then
   the card under a line (_wvRefsPopupCard), then the buttons, always shown; no hover tint
   for a lone row. */
.citation-popup .reference-row:has(> .wv-refs-pcard) { display: flex; flex-direction: column; }
.citation-popup .reference-row:has(> .wv-refs-pcard):hover { background: none; }
/* The card from the row's own left edge (where the mark starts), not under the text's
   indent: the indent belongs to Zotero's part (MJT 2026-11-20, "The horizontal shift is
   only for the Zotero part. The rest of the card can be left aligned"): the row's 21 px
   minus Zotero's 5. */
/* What Weavero adds -- the card and its buttons -- framed as one box on a background a
   step off the popup's (Zotero's side-pane colour against its toolbar colour), so it
   reads as Weavero's, not Zotero's (MJT 2026-11-20, "The Weavero part of the popup should
   get a different background color or line around to see clearly that it is produced by
   Weavero"): the card the box's top, the buttons its bottom. */
.citation-popup .reference-row > .wv-refs-pcard {
  order: 1; margin-top: 6px; margin-inline-start: -16px; padding: 6px 8px 2px;
  background: var(--material-sidepane, rgba(128, 128, 128, 0.08));
  border: 1px solid var(--fill-quinary, rgba(128, 128, 128, 0.3)); border-bottom: none; border-radius: 5px 5px 0 0;
}
.citation-popup .reference-row > .wv-refs-pcard > .wv-refs-card { display: flex; flex-direction: column; gap: 1px; white-space: normal; }
.citation-popup .reference-row:has(> .wv-refs-pcard) > .${CTL_CLASS} {
  order: 2; position: static; display: flex; justify-content: flex-end; align-self: stretch;
  margin: 0; margin-inline-start: -16px; padding: 0 6px 4px;
  background: var(--material-sidepane, rgba(128, 128, 128, 0.08));
  border: 1px solid var(--fill-quinary, rgba(128, 128, 128, 0.3)); border-top: none; border-radius: 0 0 5px 5px;
}
.citation-popup .inner:has(.wv-refs-pcard) { max-height: 420px; }
/* SEVERAL: a row's card beside the popup while the pointer rests on the row
   (_wvRefsHoverCardShow), in the popup's own look (the reader's popup mixin). */
.citation-popup > .wv-refs-hcard {
  position: absolute; z-index: 2; width: 360px; box-sizing: border-box; padding: 8px 10px; border-radius: 6px;
  background: var(--material-toolbar, Canvas); color: var(--fill-primary, CanvasText); cursor: default;
  box-shadow: 0 0 3px 0 rgba(0, 0, 0, 0.55), 0 8px 40px 0 rgba(0, 0, 0, 0.25), 0 0 3px 0 rgba(255, 255, 255, 0.1) inset;
}
.citation-popup > .wv-refs-hcard > .wv-refs-card { display: flex; flex-direction: column; gap: 1px; white-space: normal; }
/* The mark at the row's start, in a column of its own -- as the References rows and the
   PDF's margin carry theirs (MJT 2026-11-20, "The circle should go to the left of the
   references"): the row's 5-px padding, a 12-px column centred on the first line (1lh),
   4 px, then the text; wrapped lines keep that indent. */
.citation-popup .reference-row:has(> .wv-refs-row-mark) { position: relative; padding-inline-start: 21px; }
.citation-popup .reference-row > .wv-refs-row-mark { position: absolute; inset-inline-start: 5px; top: 5px; width: 12px; height: 1lh; display: flex; align-items: center; justify-content: center; }
${markColorCSS(".citation-popup .reference-row > .wv-refs-row-mark")}
.citation-popup .reference-row > .wv-refs-row-mark svg { width: 10px; height: 10px; }
/* The badge's corner at BADGE_AT on its dot (as everywhere): the 10-px dot spans 1..11 of
   the 12-px column, centred in its 1lh height. */
.citation-popup .reference-row > .wv-refs-row-mark > .wv-refs-libbadge { position: absolute; width: 9px; height: 9px; inset-inline-start: ${1 + BADGE_AT.x * 10}px; top: calc(50% - 5px + ${BADGE_AT.y * 10}px); ${LIBBADGE_LOOK} }
.${CTL_CLASS} .wv-refs-btn {
  display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center;
  border-radius: 4px; color: var(--fill-secondary, #555); cursor: default;
}
.${CTL_CLASS} .wv-refs-btn:hover { background: var(--fill-quinary, rgba(0, 0, 0, 0.08)); color: var(--fill-primary, #222); }
.${CTL_CLASS} .wv-refs-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1; overflow: visible; }
.${CTL_CLASS} .wv-refs-btn > .wv-refs-btn-img { display: block; width: 16px; height: 16px; }
.${CTL_CLASS} .wv-refs-btn svg .wv-fill { fill: currentColor; stroke: none; }
@media (forced-colors) {
  .${CTL_CLASS} .wv-refs-btn:hover { outline: 1px solid SelectedItem; }
}
${BUSY_CSS("." + CTL_CLASS)}
`;

/** The reference card at the top of a reference's menu (_wvRefsCard), in the
 *  menu's own look: the menu's text colour, Zotero's --fill-secondary for the
 *  lesser lines (the colour Zotero gives a menu's shortcut text, scss/win
 *  _menupopup.scss .menu-accel), the menu item's padding; the type of the
 *  hover cards (backlinks.ts: a bold head, 0.92em lines under it). A fixed
 *  width, so a long title wraps instead of widening the menu: 420 px since
 *  MJT 2026-11-20 ("I would make the card a bit wider"; 340 px wrapped a
 *  four-library line onto three lines). */
const CARD_CSS = `
/* The card's text at Zotero's own size, the citation popup's: the window root's, which
   Zotero's font-size setting sets (13 px by default; the menu's entries keep the system
   menu font, 12 px) -- MJT 2026-11-20, "The
   font size in the Weavero popups should match the one in the Zotero citation popup". */
/* The card's actions as on the citation popup (MJT 2026-11-26, "Probably better adopt the same
   design as the one appearing on the references in the text"; _wvRefsMenu): icon buttons at the
   card's foot, on the end side -- the popup's own entries (a menugroup of icon-only menu items, as
   Firefox's navigation row), so Up / Down and the highlight are the menu's. Their words are their
   tooltips and accessible names. Copy As is a submenu without the arrow the popup's button has none
   of either. They replaced the 2 x 2 grid of words (MJT 2026-11-22) and the Copy As row. */
#${MENU_ID} > menugroup.wv-refs-btn-row { display: flex; justify-content: flex-end; gap: 2px; padding: 0 6px 4px; }
#${MENU_ID} > menugroup.wv-refs-btn-row > :is(menuitem, menu) { flex: none; margin: 0; padding: 4px; min-width: 0; border-radius: 4px; }
#${MENU_ID} > menugroup.wv-refs-btn-row > :is(menuitem, menu) > :is(.menu-text, .menu-highlightable-text, .menu-accel) { display: none; }
#${MENU_ID} > menugroup.wv-refs-btn-row > :is(menuitem, menu) > .menu-icon { margin: 0; }
#${MENU_ID} > menugroup.wv-refs-btn-row > menu::after { display: none; }
/* The captions over the cited item's rows (refsMenuCaption) start where the rows' icons do, as
   the toolkit draws a menucaption on Zotero 11 (elements/menu.js MozMenuCaption: a label alone).
   Zotero 10's toolkit still gives it an empty icon box before the label, which put its words
   under the rows' words, 24 px further in, as if it were an entry without an icon (measured
   2026-11-25: 38 px against the icons' 14; refs-menu-children.spec.js). */
#${MENU_ID} > menucaption > .menu-icon:not([src]) { display: none; }
/* The card in its menu, and its off-screen double that decides "More" before the menu opens
   (refsCardMoreAhead): one rule, the same box. */
:is(#${MENU_ID}, .wv-refs-card-measure) > .wv-refs-card { box-sizing: border-box; width: 420px; padding: 4px 9px 6px; display: flex; flex-direction: column; gap: 1px; white-space: normal; cursor: default; font-size: 1rem; }
.wv-refs-card-title { font-weight: 600; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.wv-refs-card-authors, .wv-refs-card-meta, .wv-refs-card-lib { font-size: 0.92em; color: var(--fill-secondary, GrayText); overflow-wrap: anywhere; }
/* The type icon in a column of its own before the work (16 px, Zotero's drawing at its
   own size -- its rules size the background, the box only is set here), on the first line. */
.wv-refs-card-ref { display: flex; align-items: flex-start; gap: 6px; }
.wv-refs-card-type { flex: none; width: 16px; height: 16px; margin-top: 1px; }
.wv-refs-card-type > .icon { display: block; width: 16px; height: 16px; }
.wv-refs-card-reftext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.wv-refs-card-bib { overflow-wrap: anywhere; }
.wv-refs-card-bib .csl-bib-body, .wv-refs-card-bib .csl-entry { margin: 0; padding: 0; text-indent: 0; line-height: normal; }
${refsUrlCSS(".wv-refs-card-bib")}
.wv-refs-card-lib { display: block; }
.wv-refs-card-libname { white-space: nowrap; }
.wv-refs-card-libname[role="button"] { cursor: pointer; }
.wv-refs-card-libname[role="button"]:hover { color: var(--fill-primary, CanvasText); text-decoration: underline; }
.wv-refs-card-libname > .wv-refs-libbadge { display: inline-block; width: 12px; height: 12px; vertical-align: -2px; margin-inline-end: 3px; }
/* "N other libraries": drops the other libraries' names down under the line, one per line
   (refsCardLibMore). */
.wv-refs-card-libtoggle { white-space: nowrap; cursor: pointer; }
.wv-refs-card-libtoggle::after { content: " ▾"; }
.wv-refs-card-libtoggle[aria-expanded="true"]::after { content: " ▴"; }
.wv-refs-card-libtoggle:hover { color: var(--fill-primary, CanvasText); text-decoration: underline; }
.wv-refs-card-libmore { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; margin-top: 2px; padding-inline-start: 1em; }
.wv-refs-card-libmore[hidden] { display: none; }
.wv-refs-card-abs { margin-top: 4px; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
.wv-refs-card.wv-refs-card-open .wv-refs-card-abs { display: block; -webkit-line-clamp: none; max-height: 18em; overflow-y: auto; }
.wv-refs-card-more { align-self: flex-start; font-size: 0.92em; color: var(--fill-secondary, GrayText); text-decoration: underline; cursor: pointer; }
.wv-refs-card-more:hover { color: inherit; }
.wv-refs-card-more[hidden], .wv-refs-card-ga[hidden] { display: none; }
/* The graphical abstract's box has its size before the picture loads (refsGaBoxSize): the picture
   fits inside it, at most 240 x 140, never enlarged. */
.wv-refs-card-ga { margin-top: 6px; align-self: flex-start; box-sizing: content-box; }
.wv-refs-card-ga > img { display: block; max-width: 100%; max-height: 100%; border-radius: 4px; cursor: pointer; }
`;

/** The icons, 16px, 1px lines on the half pixel as Zotero's 16/universal set.
 *  Zotero ships no tab / window drawing for this (checked 2026-11-18); the split
 *  one is the split view's menu icon (lib/split-glyph.ts), its left pane in the
 *  accent blue. Show in Library is not here: it is the library's own icon
 *  (libIcon). Shared with the Cited by section's rows (cited-by.ts). */
export const WV_REFS_ICONS: Record<string, Array<[string, Record<string, string>]>> = {
    tab: [["path", { d: "M1.5 5.5h13v7a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5z" }],
        ["path", { d: "M1.5 5.5V3.5A1.5 1.5 0 0 1 3 2h3.5A1.5 1.5 0 0 1 8 3.5v2" }]],
    window: [["rect", { x: "4.5", y: "1.5", width: "10", height: "9", rx: "1.5" }],
        ["path", { d: "M4.5 4.5h10" }],
        ["path", { d: "M11.5 12.5v.5a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V7A1.5 1.5 0 0 1 3 5.5h1.5" }]],
    split: [["path", { d: "M8 2.5h5a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8" }],
        ["path", { d: "M8 2.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h5z", stroke: BLUE }]],
    more: [["circle", { cx: "3", cy: "8", r: "1.25", class: "wv-fill" }],
        ["circle", { cx: "8", cy: "8", r: "1.25", class: "wv-fill" }],
        ["circle", { cx: "13", cy: "8", r: "1.25", class: "wv-fill" }]],
    // Zotero's own globe (chrome/skin/default/zotero/16/universal/globe.svg), verbatim.
    web: [["path", { class: "wv-fill", "fill-rule": "evenodd", d: "M8 15C8.52174 15 9.26329 14.5511 9.934 13.2096C10.2431 12.5915 10.502 11.8433 10.6873 11H5.31274C5.49798 11.8433 5.75691 12.5915 6.066 13.2096C6.73671 14.5511 7.47826 15 8 15ZM5.13485 10C5.04756 9.36875 5 8.69819 5 8C5 7.30181 5.04756 6.63125 5.13485 6H10.8652C10.9524 6.63125 11 7.30181 11 8C11 8.69819 10.9524 9.36875 10.8652 10H5.13485ZM11.7092 11C11.4085 12.486 10.8909 13.7502 10.235 14.6356C12.0409 14.0276 13.5173 12.703 14.3264 11H11.7092ZM14.7101 10H11.874C11.9562 9.36076 12 8.6906 12 8C12 7.3094 11.9562 6.63924 11.874 6H14.7101C14.8987 6.63371 15 7.30503 15 8C15 8.69497 14.8987 9.36629 14.7101 10ZM4.12602 10H1.28988C1.10128 9.36629 1 8.69497 1 8C1 7.30503 1.10128 6.63371 1.28988 6H4.12602C4.04375 6.63924 4 7.3094 4 8C4 8.6906 4.04375 9.36076 4.12602 10ZM1.67363 11H4.29076C4.59153 12.486 5.10906 13.7502 5.76495 14.6356C3.9591 14.0276 2.48266 12.703 1.67363 11ZM5.31274 5H10.6873C10.502 4.15675 10.2431 3.40854 9.934 2.79036C9.26329 1.44895 8.52174 1 8 1C7.47826 1 6.73671 1.44895 6.066 2.79036C5.75691 3.40854 5.49798 4.15675 5.31274 5ZM11.7092 5H14.3264C13.5173 3.29696 12.0409 1.97243 10.235 1.3644C10.8909 2.24982 11.4085 3.51397 11.7092 5ZM5.76495 1.3644C5.10906 2.24982 4.59152 3.51397 4.29076 5H1.67363C2.48266 3.29696 3.9591 1.97243 5.76495 1.3644ZM8 0C12.4183 0 16 3.58172 16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0Z" }]],
};

/** Show in Library's icon: the library's own, as Zotero draws it in the
 *  collection tree (collection-tree/16/{light,dark}/library.svg and
 *  library-group.svg: one path, My Library's blue, a group's teal, the same in
 *  light and dark) -- what Weavero's other Show in Library entries show
 *  (bookmarks.ts _bmShowInLibraryIcon; MJT 2026-11-20, "Show in Library should
 *  use the My Library icon"). Inline, not the chrome:// file: the citation
 *  popup's buttons live in the reader's page. `itemID`: the item it shows. */
const LIB_PATH = "M16 15V16H1V15H16ZM15 14H2V13H3V5H2V3L8.5 0L15 3V5H14V13H15V14ZM3 4H14V3.64L8.5 1.1L3 3.64V4ZM5 5H4V13H5V5ZM7 5H6V13H7V5ZM9 5H8V13H9V5ZM11 5H10V13H11V5ZM13 5H12V13H13V5Z";
function libIcon(itemID: any): Array<[string, Record<string, string>]> {
    let kind: "user" | "group" = "user";
    try { const it = Zotero.Items.get(Number(itemID)); if (it && Zotero.Libraries.get(it.libraryID).libraryType === "group") kind = "group"; } catch (e) {}
    return [["path", { d: LIB_PATH, fill: WV_LIB_BADGE_FILL[kind], stroke: "none" }]];
}
export const wvRefsLibIcon = libIcon;
const ICONS = WV_REFS_ICONS;

/** A button's drawing (WV_REFS_ICONS) as a menu image, stroked with `context-fill`, which
 *  Zotero's menu CSS paints as it paints its own menu icons (lib/link-glyph.ts
 *  WV_LINK_MENU_ICON); a part with its own colour (Split's blue pane) keeps it. The menu's
 *  Open entries wear the buttons' icons (MJT 2026-11-20, "use the new hover icons on the
 *  left"). */
/** Zotero's item-type drawing (chrome://zotero/skin/item-type/16/<theme>/<name>.svg, the
 *  icon module's own files) put INTO `box` as inline SVG: the reader's page loads no
 *  chrome:// image (an <img> there errors, measured 2026-11-20 on 11.0-beta.4). Each file's
 *  text is read once, privileged, and kept. `iconName`: item.getItemTypeIconName()
 *  ("journalArticle" -> journal-article.svg). */
const typeSvgText = new Map<string, any>();

/** The citation popup's hover card (_wvRefsHoverCardShow), per reader: the card shown,
 *  whose it is, its show and hide timers (the reader page's window clock). Off the
 *  reader object, and the rows wired, off React's elements: weak. */
const refsHover = new WeakMap<any, { card: any; key: string; showT: any; hideT: any }>();
function refsHoverOf(reader: any) {
    let s = refsHover.get(reader);
    if (!s) { s = { card: null, key: "", showT: null, hideT: null }; refsHover.set(reader, s); }
    return s;
}
const refsHoverWired = new WeakSet<any>();
/** Readers that have drawn their first page (_wvRefsAfterFirstPaint). */
const refsPainted = new WeakSet<any>();

/** The References work of each reader open, timed: a debug record for the marks bench
 *  (the maintainer's marks-speed measurements of 2026-11-21, MJT
 *  2026-11-21: "It can take some time for the references in a paper to be recognized by
 *  Weavero. Can you time this on different papers"). The last TL_MAX opens, oldest
 *  first, in `Zotero._wvRefsTimeline.opens`: { att, tab, at (Date.now() at the wiring),
 *  ev: phase -> ms after `at` (the first time each phase is reached), and what the phases
 *  found }. Phases: wire, paint (a drawn page seen), text (its text layer seen, or the
 *  wait for it over), idle (the work starts), prep, stamp,
 *  sdt (Zotero's structure data read; `cache`: its cache file was there before),
 *  mat (materialized), list (entries walked), ix (the index there; `ixAt`: ready |
 *  building | none at the prepare), match (every entry answered), marks (the reference
 *  list's marks drawn), sec (the References section's rows built). Numbers and ids only,
 *  never a reader or a window (reader-leak.spec.js); a few writes per open, nothing runs
 *  for it otherwise; released at shutdown with every `Zotero._wv*` object
 *  (_wvReleaseGlobalState). */
const TL_MAX = 50;
const refsTl = new WeakMap<any, any>();
function tlStart(reader: any) {
    try {
        if (refsTl.has(reader)) return;
        const g: any = Zotero;
        if (!g._wvRefsTimeline || !Array.isArray(g._wvRefsTimeline.opens)) g._wvRefsTimeline = { opens: [] };
        const rec: any = { att: num(reader.itemID), tab: String(reader.tabID || ""), at: Date.now(), ev: { wire: 0 } };
        refsTl.set(reader, rec);
        const opens: any[] = g._wvRefsTimeline.opens;
        opens.push(rec);
        while (opens.length > TL_MAX) opens.shift();
    } catch (e) {}
}
/** Phase `phase` of `reader`'s open reached now (its first time only), with what it found. */
function tlMark(reader: any, phase: string, data?: Record<string, any>) {
    try {
        const rec = reader ? refsTl.get(reader) : null;
        if (!rec) return;
        if (rec.ev[phase] === undefined) {
            rec.ev[phase] = Date.now() - rec.at;
            if (data) for (const k of Object.keys(data)) if (rec[k] === undefined) rec[k] = data[k];
        }
    } catch (e) {}
}
/** The paper open beside a reader (_wvRefsBesideApply): its look-again timer. */
const refsBeside = new WeakMap<any, { t: any }>();
function refsBesideOf(reader: any) {
    let s = refsBeside.get(reader);
    if (!s) { s = { t: null }; refsBeside.set(reader, s); }
    return s;
}
/** A reference of Zotero's (a popup's, an overlay's) as _wvRefsEntryAt reads it. */
/** The URLs in a reference's text `s`, by Weavero's one URL rule (`re`: the plugin's
 *  URL_REGEX), a line break after "://" healed -- a list's line can end there
 *  ("http:// dow-answer.custhelp.com/.", Backhaus et al. 2011 [10]). Each as its span
 *  [a, b) in `s` and the URL to open, the sentence's closing punctuation left out. */
export function refsUrlsIn(re: RegExp | null, s: string): Array<{ a: number; b: number; url: string }> {
    const out: Array<{ a: number; b: number; url: string }> = [];
    if (!re || !s) return out;
    // A reference entry is scanned up to WV_LINK_SCAN_MAX characters.
    if (s.length > WV_LINK_SCAN_MAX) s = s.slice(0, WV_LINK_SCAN_MAX);
    const map: number[] = [];
    let q = "";
    for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i]) && q.endsWith("://")) continue;
        map.push(i);
        q += s[i];
    }
    let g: RegExp;
    try { g = new RegExp(re.source, "gi"); }
    catch (e) { return out; }
    let m: RegExpExecArray | null;
    while ((m = g.exec(q))) {
        if (!m[0]) { g.lastIndex++; continue; }
        const url = wvTrimTrailing(m[0], ".,;:!?");
        if (!url || /:\/*$/.test(url)) continue;
        out.push({ a: map[m.index], b: map[m.index + url.length - 1] + 1, url: url.replace(/\s+/g, "") });
    }
    return out;
}

/** The URLs in `root`'s text as links in Weavero's colours (`.wv-refs-url` and the
 *  kind's wv-link-* class, URL in `data-wv-url`), and Zotero's own links there in the
 *  same colours (MJT 2026-11-20, "Hyperlink should be clickable in Weavero color").
 *  Text inside a link stays as it is. The click is the surface's (the popup row's
 *  copy, the section's row: _wvRefsUrlClick). */
function refsLinkify(re: RegExp | null, root: any) {
    try {
        const doc = root.ownerDocument;
        for (const a of Array.from(root.querySelectorAll("a")) as any[]) {
            a.classList.add("wv-refs-url", urlLinkClass(String(a.getAttribute("href") || "")));
        }
        if (!re) return;
        const walker = doc.createTreeWalker(root, 4);   // NodeFilter.SHOW_TEXT
        const nodes: any[] = [];
        for (let n: any = walker.nextNode(); n; n = walker.nextNode()) {
            if (!(n.parentElement && n.parentElement.closest("a"))) nodes.push(n);
        }
        for (const n of nodes) {
            const s = String(n.nodeValue || "");
            const hits = refsUrlsIn(re, s);
            if (!hits.length) continue;
            const frag = doc.createDocumentFragment();
            let at = 0;
            for (const h of hits) {
                if (h.a > at) frag.appendChild(doc.createTextNode(s.slice(at, h.a)));
                const a = wvHtmlEl(doc, "a", "wv-refs-url " + urlLinkClass(h.url), s.slice(h.a, h.b));
                a.setAttribute("data-wv-url", h.url);
                a.setAttribute("title", h.url);
                frag.appendChild(a);
                at = h.b;
            }
            if (at < s.length) frag.appendChild(doc.createTextNode(s.slice(at)));
            n.replaceWith(frag);
        }
    } catch (e) {}
}

/** The CSS of those links, for a surface's sheet (`scope`: the text's selector). */
function refsUrlCSS(scope: string): string {
    return `${scope} a.wv-refs-url { cursor: pointer; text-decoration: underline; }
${scope} a.wv-refs-url.wv-link-http { color: var(--wv-link-http, #1a73e8); }
${scope} a.wv-refs-url.wv-link-zotero { color: var(--wv-link-zotero, #8b4513); }
${scope} a.wv-refs-url.wv-link-app { color: var(--wv-link-app, #9333ea); }
`;
}

/** A marks layer's page boxes placed in the next animation frame, once for all the
 *  changes of a frame (wvPlaceOnPages). The observer runs on every style change pdf.js
 *  makes while it renders pages; placing at once read the pages' places in the middle
 *  of pdf.js's task, a layout of the whole viewer before the one the paint does. In the
 *  frame, the read uses the layout the paint needs anyway. (The one 117-148 ms frame of
 *  a scroll through the 214-page book's references with References on is not this: it
 *  stayed in 2 of 3 runs, with no Weavero method running in it -- work/refs-overnight-
 *  2026-11-20.md.) A hidden window runs no frame: placed at once there. */
function refsPlaceSoon(layer: any, win: any, boxes: Map<number, any>, pages: any) {
    try {
        if (!layer.isConnected) { try { layer._wvRefsObs && layer._wvRefsObs.disconnect(); } catch (e) {} return; }
        if (layer._wvRefsRaf) return;
        if (win.document.hidden) { wvPlaceOnPages(boxes, pages); return; }
        layer._wvRefsRaf = win.requestAnimationFrame(() => {
            layer._wvRefsRaf = 0;
            if (layer.isConnected) wvPlaceOnPages(boxes, pages);
        });
    } catch (e) {}
}

/** Resolves once `win` has painted what this task drew -- its next animation frame, then a
 *  task -- so the marks show before the References section is built (_wvRefsPrepare). A
 *  window that paints nothing (hidden; gone) resolves after 100 ms. */
function refsAfterNextPaint(win: any): Promise<void> {
    return new Promise<void>((res) => {
        let done = false;
        const go = () => { if (!done) { done = true; res(); } };
        try {
            if (win && !win.closed && !win.document.hidden && typeof win.requestAnimationFrame === "function") {
                win.requestAnimationFrame(() => { wvTimeout(go, 0); });
            }
        } catch (e) {}
        wvTimeout(go, 100);
    });
}

/** What a citation popup shows: its references, in order (_wvRefsPopupWatch). */
function refsPopupSig(refs: Array<{ text: string; pageIndex: number }>): string {
    return refs.map((r) => r.pageIndex + "@" + r.text).join("\n");
}

function refsRefShape(r: any): { text: string; pageIndex: number; rect: number[] | null } {
    let rect: number[] | null = null;
    let pageIndex = NaN;
    try {
        pageIndex = num(r.position.pageIndex);
        const r0 = r.position.rects && r.position.rects[0];
        if (r0) rect = [num(r0[0]), num(r0[1]), num(r0[2]), num(r0[3])];
    } catch (e) {}
    let text = "";
    try { text = String(r.text || ""); } catch (e) {}
    if (!text) {
        try { text = Array.from(r.chars || []).map((c: any) => String(c.c || "") + (c.spaceAfter ? " " : "")).join(""); } catch (e) {}
    }
    return { text, pageIndex, rect };
}

/** Zotero's citation popup kept where Zotero puts it when Weavero changes its height
 *  (`h0`: its height before): Zotero places it for its own content in a layout effect
 *  and again on a timer (reader view-popup.js updatePopupPosition) -- a card added in
 *  between was painted where the shorter popup belonged, then the popup moved (MJT
 *  2026-11-20, "The position of the popup first appears too low, then moves up").
 *  Above its citation it keeps its bottom (top - growth), beside it its middle (top -
 *  growth / 2), below it its top: what Zotero's own placing gives for the new height,
 *  so its timer finds it there. React gives the transform back on a later render. */
/** Zotero's citation popup placed for its size with the card in it, as Zotero's own
 *  placement will place it (reader view-popup.js updatePopupPosition: under the
 *  citation if it fits, else above, else beside; then kept in the view; padding 10,
 *  citation-popup.js). Zotero places the popup before the card is in it and again one
 *  task later (its `setTimeout(updatePopupPosition, 0)`), after a paint: a popup that
 *  fitted under the citation without the card opened there and jumped above (MJT
 *  2026-11-20). Placed here first, in the task that adds the card, Zotero's second
 *  pass finds it where it would put it. `rect` is the popup's own (the reader state's
 *  overlay popup), in its parent's coordinates. Returns false when it cannot place. */
function refsPopupPlace(pop: any, rect: number[] | null): boolean {
    try {
        if (!rect || rect.length < 4 || rect.some((x) => typeof x !== "number" || !isFinite(x))) return false;
        const parent = pop.parentNode;
        if (!parent || !parent.getBoundingClientRect) return false;
        const pad = 10;
        const width = pop.offsetWidth, height = pop.offsetHeight;
        const vb = parent.getBoundingClientRect();
        const vw = vb.width, vh = vb.height;
        const anchorX = rect[0] + (rect[2] - rect[0]) / 2;
        const anchorY = rect[1] + (rect[3] - rect[1]) / 2;
        const calcTop = () => {
            let t = anchorY - height / 2;
            if (rect[3] - rect[1] > height) t = Math.min(Math.max(t, rect[1]), rect[3] - height);
            return t;
        };
        const leftFor = (placeLeft: boolean) => {
            if (placeLeft) {
                const l = rect[0] - width - pad;
                return l < pad ? anchorX - width - pad : l;
            }
            const l = rect[2] + pad;
            return l + width > vw - pad ? anchorX + pad : l;
        };
        let left = anchorX - width / 2;
        let side: string;
        let top: number;
        if (left < 0) { side = "right"; left = leftFor(false); top = calcTop(); }
        else if (left + width > vw) { side = "left"; left = leftFor(true); top = calcTop(); }
        else {
            const fitsAbove = rect[1] - pad - height > 0;
            const fitsBelow = rect[3] + height + pad < vh;
            if (fitsBelow) { top = rect[3] + pad; side = "bottom"; }
            else if (fitsAbove) { top = rect[1] - pad - height; side = "top"; }
            else {
                const placeLeft = rect[0] >= vw / 2;
                side = placeLeft ? "left" : "right";
                left = leftFor(placeLeft);
                top = calcTop();
            }
        }
        if (left + width > vw - pad) left = vw - width - pad;
        if (left < pad) left = pad;
        if (top + height > vh - pad) top = vh - height - pad;
        if (top < pad) top = pad;
        pop.style.transform = "translate(" + left + "px, " + top + "px)";
        for (const s of ["top", "bottom", "left", "right"]) {
            const c = "page-popup-" + s + "-center";
            if (s === side) pop.classList.add(c);
            else pop.classList.remove(c);
        }
        return true;
    } catch (e) { return false; }
}

function refsPopupKeepPlace(pop: any, h0: number) {
    try {
        const dh = pop.offsetHeight - h0;
        if (!dh) return;
        const cls = String(pop.className || "");
        const k = /\bpage-popup-top-center\b/.test(cls) ? 1 : /\bpage-popup-(left|right)-center\b/.test(cls) ? 0.5 : 0;
        if (!k) return;
        const m = String(pop.style.transform || "").match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\s*\)/);
        if (!m) return;
        pop.style.transform = "translate(" + m[1] + "px, " + (Number(m[2]) - k * dh) + "px)";
    } catch (e) {}
}

/** The card's "More" where its abstract is cut, once it is laid out (it reads the
 *  layout: call it with the card in the page, in the task that put it there). */
function refsCardMoreNow(card: any) {
    try {
        const abs = card.querySelector(".wv-refs-card-abs");
        const more = card.querySelector(".wv-refs-card-more");
        if (abs && more) more.hidden = !(abs.scrollHeight > abs.clientHeight + 1);
    } catch (e) {}
}
function refsTypeIconInto(box: any, iconName: string) {
    try {
        const doc = box.ownerDocument;
        const win = doc.defaultView;
        const dark = !!(win && win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches);
        const file = String(iconName || "document").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        const url = "chrome://zotero/skin/item-type/16/" + (dark ? "dark" : "light") + "/" + file + ".svg";
        const put = (txt: any) => {
            try {
                if (!txt || typeof txt !== "string") return;
                const svg: any = new win.DOMParser().parseFromString(txt, "image/svg+xml").documentElement;
                if (!svg || svg.localName !== "svg") return;
                const el: any = doc.importNode(svg, true);
                el.setAttribute("width", "16");
                el.setAttribute("height", "16");
                box.textContent = "";
                box.appendChild(el);
            } catch (e) {}
        };
        const known = typeSvgText.get(url);
        if (typeof known === "string") { put(known); return; }
        if (known === null) return;
        const p = known || Promise.resolve((Zotero.File as any).getContentsFromURLAsync(url)).then((t: any) => (t ? String(t) : null), () => null);
        typeSvgText.set(url, p);
        p.then((t: any) => { typeSvgText.set(url, t); put(t); });
    } catch (e) {}
}

/** Left and Right between the buttons of the reference menu's row (_wvRefsMenu; until
 *  2026-11-26 the two cells of a row of its grid),
 *  as a keydown listener on the menu's window, in the capture phase: it sees the key before
 *  the menu's document does. Gecko moves a menu's highlight with Up and Down only:
 *  through the cells in reading order (a menugroup's items are the popup's items), Left and
 *  Right meaning something on a submenu alone (open it, close it; measured 2026-11-22 on
 *  11.0-beta.5 and 10.0.8). And a menupopup has no script setter for its active item
 *  (`activeChild` is a menu's or a menulist's): the highlight moves the way the pointer moves
 *  it, a mousemove on the cell, which Gecko's menu code takes from script too. Never onto a
 *  submenu (Show in Library with several libraries): a scripted move does not activate one,
 *  and its own key (Right in a left-to-right menu) opens it. */
function refsGridKey(pop: any) {
    return (e: any) => {
        try {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !pop.isConnected || pop.state !== "open") return;
            const cur: any = pop.querySelector(":scope > menugroup.wv-refs-btn-row > [_moz-menuactive]");
            if (!cur || (cur.localName !== "menuitem" && cur.localName !== "menu")) return;
            const w = pop.ownerDocument.defaultView;
            const toEnd = (e.key === "ArrowRight") !== (w.getComputedStyle(pop).direction === "rtl");
            const next: any = toEnd ? cur.nextElementSibling : cur.previousElementSibling;
            if (!next || (next.localName !== "menuitem" && next.localName !== "menu") || wvBoolAttrOn(next, "disabled")) return;
            e.preventDefault();
            e.stopPropagation();
            const move = () => {
                const r = next.getBoundingClientRect();
                next.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, view: w, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
            };
            move();
            // Gecko moves the highlight a moment after the move (never within the dispatch),
            // and not after every move: one Left moved nothing in the runner's right-to-left
            // check, the next one did (2026-11-22). Again a few times, while the highlight is
            // still on the cell the key left.
            let tries = 0;
            const again = () => {
                try {
                    if (tries++ >= 12 || pop.state !== "open" || next.hasAttribute("_moz-menuactive") || !cur.hasAttribute("_moz-menuactive")) return;
                    move();
                    w.setTimeout(again, 50);
                } catch (er) {}
            };
            if (!next.hasAttribute("_moz-menuactive")) w.setTimeout(again, 50);
        } catch (er) {}
    };
}

export function refsActIconURI(act: string): string {
    const esc = (v: string) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const parts = (ICONS[act] || []).map(([tag, attrs]) => {
        const a: Record<string, string> = Object.assign({}, attrs);
        const filled = a.class === "wv-fill";
        delete a.class;
        if (filled) { a.fill = a.fill || "context-fill"; a.stroke = "none"; }
        else { a.fill = a.fill || "none"; a.stroke = a.stroke || "context-fill"; a["stroke-width"] = a["stroke-width"] || "1"; }
        return "<" + tag + Object.keys(a).map((k) => " " + k + '="' + esc(a[k]) + '"').join("") + "/>";
    });
    return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' + parts.join("") + "</svg>");
}

/** The reference card's CSL engine (the item pane header's style and locale)
 *  and the HTML it made, per item and modification: _wvRefsCardBib. */
let cardCsl: { key: string; engine: any; html: Map<string, string> } | null = null;
const CARD_BIB_CACHE = 100;

// ---- the card's menu opens ONCE, at its final size (MJT 2026-11-24) ---------
// "The menu opens in two steps with a flicker": "More" was decided at
// popupshown and the graphical abstract's box shown when its picture loaded --
// each a native resize of a menu already on screen. Both now have their size
// before the menu's first layout. Guard: test/refs-menu-once.spec.js.

/** What the card inherits from its menu, copied onto its off-screen double
 *  (refsCardMoreAhead). The card sets its own size (1rem), width and spacing. */
const MEASURE_FONT = ["font-family", "font-weight", "font-style", "font-stretch", "line-height", "letter-spacing", "word-spacing",
    "font-variant", "font-feature-settings", "font-variation-settings", "font-kerning", "font-size-adjust", "font-optical-sizing",
    "font-synthesis", "text-rendering", "text-transform"];

/** "More" where the abstract is cut, decided BEFORE `pop` (the card's menu, in
 *  the document, closed) is laid out. A closed menupopup's content has no
 *  layout and no computed style -- every read 0, every property "", measured
 *  2026-11-24 on Zotero 10.0.8 and 11.0-beta.5 -- nor at popupshowing (XUL
 *  makes a popup's frames after that event), and the first layout after the
 *  open is the one that shows its window. So the cut is measured on a double
 *  in the same document: the card's own box (one sheet rule with the menu's
 *  card) holding a copy of the abstract, under a host carrying the font the
 *  menu hands down (the menupopup's own computed style is there while
 *  closed). Its verdict equalled the open menu's at every length from 2 to 10
 *  lines on both versions (probe 2026-11-24). One layout of one block, ~1 ms. */
function refsCardMoreAhead(pop: any, card: any) {
    let host: any = null;
    try {
        const abs = card.querySelector(".wv-refs-card-abs");
        const more = card.querySelector(".wv-refs-card-more");
        if (!abs || !more) return;
        const doc = card.ownerDocument;
        const pcs = doc.defaultView.getComputedStyle(pop);
        host = wvHtmlEl(doc, "div", "wv-refs-card-measure");
        for (const p of MEASURE_FONT) {
            const v = pcs.getPropertyValue(p);
            if (v) host.style.setProperty(p, v);
        }
        for (const [p, v] of [["position", "fixed"], ["left", "-10000px"], ["top", "0"], ["visibility", "hidden"], ["pointer-events", "none"]]) host.style.setProperty(p, v);
        const twin = card.cloneNode(false);
        const a = abs.cloneNode(true);
        twin.appendChild(a);
        host.appendChild(twin);
        doc.documentElement.appendChild(host);
        more.hidden = !(a.scrollHeight > a.clientHeight + 1);
    } catch (e) {}
    finally { try { if (host) host.remove(); } catch (e) {} }
}

// ---- ONE menu element per window, kept between openings (MJT 2026-11-24) ---
// "Just before the final card appears, it first appears as a rectangle with a
// grey background. Why?" Windows 11 draws menus on its Mica backdrop (toolkit
// menu.css `-moz-windows-mica-popups`; on in Zotero 11.0-beta.5 with
// widget.windows.mica.popups 2), and a NEW popup window shows that backdrop
// alone -- a plain rounded rectangle, #d3d3d3 light, #545454 dark -- until
// Gecko's first frame of it, 60-80 ms later. Filmed off the screen in the
// runner, 2026-11-24: Zotero's own items-list menu does it at its first
// opening only; a three-item menupopup made new does it every time, so weight
// is not the cause; a menupopup KEPT between openings shows its new content in
// its first frame, never the backdrop alone nor the previous content. The
// reference menu was made new and removed at every opening. Now each window
// keeps one: closed, it is emptied, the opening's listeners and expandos go,
// and it waits under IDLE_MENU_ID, so `#wv-refs-menu` is still only ever the
// menu on screen. Moved in the document, it would lose its popup window: it
// stays where it was made. Guard: test/refs-menu-once.spec.js.
const IDLE_MENU_ID = "wv-refs-menu-idle";

/** `doc`'s reference menu for a new opening, under MENU_ID: the window's kept
 *  element when it is idle and this instance's (`tag`), else a new one. A menu
 *  still up is dropped (a builder closes it first; one not closed at once is not
 *  reopened). */
function refsMenuPopup(doc: any, tag: string): any {
    const cur = doc.getElementById(MENU_ID);
    if (cur) { try { cur.hidePopup(); } catch (e) {} if (cur.id === MENU_ID) { try { cur.remove(); } catch (e) {} } }
    let pop = doc.getElementById(IDLE_MENU_ID);
    if (pop && (pop.localName !== "menupopup" || pop.getAttribute("data-wv-tag") !== tag || pop.state !== "closed")) { try { pop.remove(); } catch (e) {} pop = null; }
    if (!pop) {
        pop = doc.createXULElement("menupopup");
        pop.setAttribute("data-wv-tag", tag);
        wvPopupHost(doc).appendChild(pop);
    }
    pop.id = MENU_ID;
    return pop;
}

/** A reference menu that closed (or was built and not opened), idle again: every
 *  listener this instance put on it (the opening's builder added its own:
 *  popupshowing, popupshown, popuphidden), its `_wv` expandos (feeds-badge's
 *  `_wvFdFeed`), its `data-wv-refs` attributes and inline style, its content --
 *  the toolkit's own listeners stay. */
function refsMenuIdle(pop: any) {
    try {
        const els: any = (Services as any).els;
        const mine = Cu().getGlobalForObject(refsMenuIdle);
        for (const li of (els && els.getListenerInfoFor ? els.getListenerInfoFor(pop) : [])) {
            try {
                const fn = li.listenerObject;
                if (typeof fn === "function" && Cu().getGlobalForObject(fn) === mine) pop.removeEventListener(li.type, fn, li.capturing);
            } catch (e) {}
        }
    } catch (e) {}
    try { for (const k of Object.keys(pop)) if (k.startsWith("_wv")) delete pop[k]; } catch (e) {}
    try { for (const a of Array.from(pop.attributes) as any[]) if (a.name.startsWith("data-wv-refs") || a.name === "style") pop.removeAttribute(a.name); } catch (e) {}
    try { while (pop.firstChild) pop.firstChild.remove(); } catch (e) {}
    pop.id = IDLE_MENU_ID;
}

/** The graphical abstract's box, at most 240 x 140, reserved before its
 *  picture loads: the picture's own size fitted in when this session has seen
 *  it (gaSizes, kept at its load), else the whole 240 x 140 with the picture
 *  fitted inside (its natural size is only known once it has loaded, after the
 *  menu is up; reading the file's header first would hold the menu back). */
const GA_W = 240, GA_H = 140, GA_SIZES_MAX = 200;
const gaSizes: Map<number, [number, number]> = new Map();
function refsGaBoxSize(attID: number): [number, number] {
    const n = gaSizes.get(attID);
    if (!n || !(n[0] > 0) || !(n[1] > 0)) return [GA_W, GA_H];
    const k = Math.min(1, GA_W / n[0], GA_H / n[1]);
    return [n[0] * k, n[1] * k];
}
function refsGaRemember(attID: number, w: number, h: number) {
    if (!(w > 0) || !(h > 0)) return;
    gaSizes.delete(attID);
    gaSizes.set(attID, [w, h]);
    while (gaSizes.size > GA_SIZES_MAX) gaSizes.delete(gaSizes.keys().next().value as number);
}

/** A section row's kind for the chips: in your library with a PDF, without one,
 *  or not in your libraries. */
function refsChipKind(r: any): RefsMarkKind { return refsHitKind(r.hit); }
/** A match's mark: with a PDF, without one, or none (not in your libraries). */
function refsHitKind(hit: any): RefsMarkKind { return hit ? (hit.pdf ? "pdf" : "nopdf") : "web"; }
/** The items list's rule (pane-scope.ts _wvScopePass): the kinds shown alone are
 *  alternatives, a hidden kind is out; "away" (only in another library) on its own. */
function refsChipPass(r: any, st: { inc: string[]; exc: string[] }): boolean {
    const k = refsChipKind(r);
    const away = !!(r.hit && r.hit.away != null);
    const inc = st.inc.filter((x) => x !== "away");
    if (inc.length && inc.indexOf(k) < 0) return false;
    if (st.exc.indexOf(k) >= 0) return false;
    if (st.inc.indexOf("away") >= 0 && !away) return false;
    if (st.exc.indexOf("away") >= 0 && away) return false;
    return true;
}

/** An attachment Zotero's reader shows (item.js attachmentReaderType: a PDF, an
 *  EPUB, an HTML snapshot), not a linked URL. */
function refsReaderAtt(a: any): boolean {
    try {
        return !!(a && a.isAttachment && a.isAttachment() && a.attachmentReaderType
            && a.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL);
    } catch (e) { return false; }
}

/** More rows of the cited item's own attachments and notes than this, and one
 *  submenu holds them (MJT 2026-11-24), named for what it holds (_wvRefsMenu). */
const CHILD_ROWS_MAX = 5;

/** A caption over a group of the reference menu's rows of the cited item's own
 *  (_wvRefsMenu): `id` is weavero-menu-refs-attachments or -notes, `count` the
 *  rows under it (MJT 2026-11-25, on Carslaw & Jaeger's menu, a DjVu row right
 *  under Show in Library: "There should be a clear Attachments title for the
 *  attachments below the item. Otherwise, it appears confusing in this form").
 *  The toolkit's own heading inside a menupopup, `menucaption`: what Firefox
 *  draws for a <select>'s <optgroup> (SelectParent.sys.mjs: an optgroup becomes
 *  a menucaption, its options menuitems; the element is toolkit elements/menu.js
 *  MozMenuCaption, a label and nothing else), and what Firefox's sidebar names
 *  its "Sort by:" heading (sidebar.ftl sidebar-history-sort-by-heading-
 *  menucaption). Not a menuitem, so Gecko's menu code never makes it active: Up
 *  and Down pass it, the pointer does not light it, a click runs nothing,
 *  nothing focuses it; and toolkit menu.css draws it bold, with the entries'
 *  padding, in their own colour -- light or dark. A disabled menuitem (the
 *  list-filter sort heading) would be greyed (menu.css `menuitem:where(
 *  [disabled])`). Zotero styles menucaption too (scss/mac _menupopup.scss).
 *  Guard: test/refs-menu-children.spec.js. */
function refsMenuCaption(doc: any, id: string, count: number): any {
    const c = doc.createXULElement("menucaption");
    c.setAttribute("data-wv-refs-caption", id === "weavero-menu-refs-notes" ? "notes" : "attachments");
    wvL10n(c, id, { count });
    return c;
}

/** The icon the items list draws for `it` (item.js getItemTypeIconName, what
 *  itemTreeRow.js and the Attachments section render -- never `(true)`, which
 *  takes every stored image or video for a linked one: filter.ts
 *  WV_ATT_KIND_FOLD), as Zotero's own file: chrome://zotero/skin/item-type/16/
 *  <theme>/<name>.svg, the camelCase name in kebab case ("attachmentPDFLink" ->
 *  attachment-pdf-link), the stored other file drawn as `document`
 *  (_item-tree.scss $-itemTypesMap). */
function refsItemIconURL(it: any, dark: boolean): string {
    let name = "document";
    try { name = String(it.getItemTypeIconName() || "document"); } catch (e) {}
    let file = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase();
    if (file === "attachment-file") file = "document";
    return "chrome://zotero/skin/item-type/16/" + (dark ? "dark" : "light") + "/" + file + ".svg";
}

/** Whether Zotero fetches `att`'s file when it is not on the disk: a stored file
 *  in a library with file syncing (zoteroPane.js viewAttachment downloads it
 *  then, "download as needed"); never a linked file, which no server holds. */
function refsFetchable(att: any): boolean {
    try {
        if (!att || !att.isStoredFileAttachment || !att.isStoredFileAttachment()) return false;
        const L = Zotero.Sync && Zotero.Sync.Storage && Zotero.Sync.Storage.Local;
        return !!(L && typeof L.getEnabledForLibrary === "function" && L.getEnabledForLibrary(att.libraryID));
    } catch (e) { return false; }
}

/** Grey out `els` -- a row of the reference menu, or the grid's open cells --
 *  while `att`'s file is not on the disk and Zotero cannot fetch it
 *  (refsFetchable; MJT 2026-11-24, "Enabled, downloads"), with Zotero's words
 *  as their tooltip ("File Not Found", pane.item.attachments.fileNotFound.title):
 *  at once from what Zotero last saw (fileExistsCached), then from the disk
 *  (fileExists: a stat; it writes nothing). Nothing changes size: the menu keeps
 *  the size it opened at (refs-menu-once.spec.js). */
function refsMarkMissing(els: any[], att: any) {
    if (refsFetchable(att)) return;
    const set = (gone: boolean) => {
        for (const el of els) {
            try {
                wvSetBoolAttr(el, "disabled", gone);
                if (gone) el.setAttribute("tooltiptext", wvStr("weavero-refs-att-missing"));
                else el.removeAttribute("tooltiptext");
            } catch (e) {}
        }
    };
    try { if (typeof att.fileExistsCached === "function" && att.fileExistsCached() === false) set(true); } catch (e) {}
    try { Promise.resolve(att.fileExists()).then((ok: any) => set(!ok), () => {}); } catch (e) {}
}

/** The file the menu's open entries open, for their words: "pdf" when the item
 *  has a PDF (Zotero's best attachment puts PDFs first, item.js
 *  getBestAttachments), "epub" when an EPUB is all it has. An EPUB counts as a
 *  PDF for the marks (DOC_TYPES; MJT 2026-11-20). */
function refsDocType(item: any): "pdf" | "epub" {
    try {
        const atts: any[] = item && item.isRegularItem && item.isRegularItem()
            ? item.getAttachments().map((id: number) => Zotero.Items.get(id))
            : [item];
        let epub = false;
        for (const a of atts) {
            if (!a || a.deleted) continue;
            const ct = a.attachmentContentType;
            if (ct === "application/pdf") return "pdf";
            if (ct === "application/epub+zip") epub = true;
        }
        return epub ? "epub" : "pdf";
    } catch (e) { return "pdf"; }
}

/** A page's text as [x, baseline, size] items (pdf.js getTextContent, PDF
 *  points), read once per page of a document: where the marks' dots go
 *  (_wvRefsMarkAnchor, the letters' middle). Keyed by the document, so it goes
 *  with it. */
const pageTextCache: WeakMap<any, Map<number, Promise<Array<[number, number, number]>>>> = new WeakMap();
function refsPageText(app: any, pageIndex: number): Promise<Array<[number, number, number]>> {
    try {
        const wapp = Cu().waiveXrays(app);
        const pdfDoc = wapp && wapp.pdfDocument;
        if (!pdfDoc) return Promise.resolve([]);
        let byPage = pageTextCache.get(pdfDoc);
        if (!byPage) { byPage = new Map(); pageTextCache.set(pdfDoc, byPage); }
        let p = byPage.get(pageIndex);
        if (!p) {
            // Each pdf.js object unwrapped before use: through the Xray, a page's
            // getTextContent is not there (2026-11-20, dev.23's live check).
            p = Promise.resolve(pdfDoc.getPage(pageIndex + 1)).then((pg: any) => Cu().waiveXrays(pg).getTextContent()).then((tc0: any) => {
                const tc = Cu().waiveXrays(tc0);
                const out: Array<[number, number, number]> = [];
                const items = (tc && tc.items) || [];
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    const t = it && it.transform;
                    if (!t || !String(it.str || "").trim()) continue;
                    out.push([Number(t[4]), Number(t[5]), Math.hypot(Number(t[2]), Number(t[3]))]);
                }
                return out;
            }).catch(() => [] as Array<[number, number, number]>);
            byPage.set(pageIndex, p);
        }
        return p;
    } catch (e) { return Promise.resolve([]); }
}

/** The names of the libraries holding copies `libIDs` (best copy first, each
 *  once), as the UI language writes a list ("My Library and Dome Over"). The
 *  card and the marks' tooltips name them all: "Only in My Library" while a
 *  group held a copy too was wrong (MJT 2026-11-20, Medwin 1992, "Also in Dome
 *  Over" in the same menu). Cited by's folded rows name their other copies'
 *  libraries with it (cited-by.ts). */
export function wvRefsLibNames(libIDs: number[]): string {
    return refsLibNames(libIDs);
}

function refsLibNames(libIDs: number[]): string {
    const names = refsLibs(libIDs).map((l) => l.name);
    // Several names in a sentence each in Zotero's quotes ("remove “%S” from this
    // computer"), or "My Library and Dome Over" reads as one name (MJT 2026-11-20,
    // "some way of identifying which words belong to which title").
    const shown = names.length > 1 ? names.map((n) => wvStr("weavero-refs-libname", { name: n }, null)) : names;
    const lf = refsListFormat();
    return lf ? lf.format(shown) : shown.join(", ");
}

/** The libraries holding copies `libIDs`, best copy first, each once. */
function refsLibs(libIDs: number[]): Array<{ id: number; name: string; kind: "user" | "group" | "" }> {
    const out: Array<{ id: number; name: string; kind: "user" | "group" | "" }> = [];
    for (const id of libIDs) {
        try {
            const lib = Zotero.Libraries.get(id);
            const n = String((lib && lib.name) || "");
            const t = lib && lib.libraryType;
            if (n && !out.some((o) => o.name === n)) out.push({ id, name: n, kind: t === "user" || t === "group" ? t : "" });
        } catch (e) {}
    }
    return out;
}

function refsListFormat(): any {
    try { return new (Intl as any).ListFormat(String(Zotero.locale || "en-US"), { style: "long", type: "conjunction" }); }
    catch (e) { return null; }
}

/** The card's library line: the sentence, each library's name after its own
 *  library icon and kept in one piece -- the icon starts every name, as in
 *  Zotero's collection tree (MJT 2026-11-20, "My Library and Dome Over should
 *  have some way of identifying which words belong to which title"). */
function refsCardLibLine(doc: any, line: any, where: "here" | "other", libIDs: number[], citingLib?: number | null) {
    const libs = refsLibs(libIDs);
    if (libs.length > 2 && refsCardLibMore(doc, line, where, libs, citingLib)) return;
    const MARK = "\u0001";
    const text = wvStr("weavero-refs-card-library", { where, library: MARK }, null);
    const at = text.indexOf(MARK);
    const lf = refsListFormat();
    if (at < 0 || !libs.length || !lf || typeof lf.formatToParts !== "function") {
        line.appendChild(doc.createTextNode(wvStr("weavero-refs-card-library", { where, library: refsLibNames(libIDs) }, null)));
        return;
    }
    // Fluent's isolation marks around the placeable stay out of the text nodes.
    const pre = text.slice(0, at).replace(/[⁨⁩]+$/, "");
    const post = text.slice(at + 1).replace(/^[⁨⁩]+/, "");
    if (pre) line.appendChild(doc.createTextNode(pre));
    let i = 0;
    for (const part of lf.formatToParts(libs.map((l) => l.name))) {
        if (part.type !== "element") { line.appendChild(doc.createTextNode(part.value)); continue; }
        refsCardLibName(doc, line, libs[i++], part.value);
    }
    if (post) line.appendChild(doc.createTextNode(post));
}

/** One library's name in the card: its library icon first, kept in one piece. */
function refsCardLibName(doc: any, parent: any, lib: { id: number; name: string; kind: "user" | "group" | "" } | undefined, text: string) {
    const name = wvHtmlEl(doc, "span", "wv-refs-card-libname", undefined, parent);
    if (lib && lib.id != null) name.setAttribute("data-wv-refs-lib", String(lib.id));
    if (lib && lib.kind) wvLibBadgeEl(doc, lib.kind, name).setAttribute("class", "wv-refs-libbadge");
    name.appendChild(doc.createTextNode(text));
    return name;
}

/** More than two libraries: one named -- the citing paper's library when it holds a copy,
 *  else the copy the card shows -- and "N other libraries", a button that drops the others' names down
 *  under the line, one per line, each a click away from its copy as the first is (MJT
 *  2026-11-26: a reference in seven libraries took three lines of the card -- "If more than
 *  2 libraries, the one beyond the current library should probably be shown in a dropdown
 *  menu"). The list drops down INSIDE the card: the card lives in a XUL menu and in the
 *  reader's page, and a popup of its own would close the menu. False when the sentence
 *  cannot be cut (the caller writes every name). */
function refsCardLibMore(doc: any, line: any, where: "here" | "other", libs: Array<{ id: number; name: string; kind: "user" | "group" | "" }>, citingLib?: number | null): boolean {
    const M1 = "\u0001", M2 = "\u0002";
    const text = wvStr("weavero-refs-card-library-more", { where, library: M1, others: M2 }, null);
    const a = text.indexOf(M1), b = text.indexOf(M2);
    if (a < 0 || b < a) return false;
    // Fluent's isolation marks around the placeables stay out of the text nodes.
    const bare = (s: string) => s.replace(/[⁨⁩]/g, "");
    const first = libs.find((l) => citingLib != null && l.id === citingLib) || libs[0];
    const rest = libs.filter((l) => l !== first);
    const pre = bare(text.slice(0, a)), mid = bare(text.slice(a + 1, b)), post = bare(text.slice(b + 1));
    if (pre) line.appendChild(doc.createTextNode(pre));
    refsCardLibName(doc, line, first, first.name);
    if (mid) line.appendChild(doc.createTextNode(mid));
    const btn = wvHtmlEl(doc, "span", "wv-refs-card-libtoggle", wvStr("weavero-refs-card-library-others", { count: rest.length }, null), line);
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-expanded", "false");
    if (post) line.appendChild(doc.createTextNode(post));
    const list = wvHtmlEl(doc, "div", "wv-refs-card-libmore", undefined, line);
    list.hidden = true;
    for (const l of rest) refsCardLibName(doc, list, l, l.name);
    btn.addEventListener("click", (e: any) => {
        try {
            e.stopPropagation();
            e.preventDefault();
            // In Zotero's citation popup (the card in its row) the popup keeps its place, as
            // the abstract's More does.
            const zp: any = line.closest ? line.closest(".citation-popup") : null;
            const h0 = zp && !line.closest(".wv-refs-hcard") ? zp.offsetHeight : -1;
            const open = !!list.hidden;
            list.hidden = !open;
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            if (h0 >= 0) refsPopupKeepPlace(zp, h0);
        }
        catch (er) {}
    });
    return true;
}

/** Keep the item pane where it is while a chip shortens the list under it. Zotero's
 *  own spacer (itemPaneContainerBase.mjs `_minScrollHeight`, the scroller's
 *  `--min-scroll-height`) holds the range down to the view's bottom; Zotero's scroll
 *  handler (itemDetails.js _handleContainerScroll) gives the room back as the view
 *  moves up. Without it, a pane scrolled to its end by hand (no pinned section, so no
 *  spacer) clamped, and the view jumped by what the filter took away (MJT
 *  2026-11-20, "A click on the filter makes the items pane scroll down"). */
function refsHoldPaneScroll(el: any) {
    try {
        const det: any = el && el.closest ? el.closest("item-details") : null;
        const pp: any = det && det._paneParent;
        if (!pp || !pp.clientHeight || typeof det._minScrollHeight !== "number") return;
        const need = pp.scrollTop + pp.clientHeight;
        if (det._minScrollHeight < need) det._minScrollHeight = need;
    } catch (e) {}
}

const Cu = () => (Components as any).utils;

function num(v: any): number { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

/** Is `r` (x1, y1, x2, y2) inside `box` (x1, y1, x2, y2), give or take `tol` points? */
function within(r: number[], box: number[], tol = 2): boolean {
    const a = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
    const b = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
    return a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol;
}

/** A mark's drawing in `mark` (the popup row's, the reference list's, the
 *  section row's, a chip's), its colour from its kind (`data-wv-refs-kind`,
 *  markColorCSS): a dot in your library -- green with a PDF, blue without --
 *  a grey ring in none of your libraries; and when every copy is in another
 *  library than the citing paper's (`badge`), that library's badge on its
 *  lower inline-end corner, as the tab strip puts the group badge on a tab's
 *  icon -- lib/library-badge.ts, the same drawing; each surface's sheet sizes
 *  it. `svgAttrs`: the dot's own size, where the sheet does not give it.
 *  `uncertain` (refkeys.1): the reference could be several works of the libraries
 *  (WvRefsHit `amb`). */
function drawMark(doc: any, mark: any, kind: RefsMarkKind, svgAttrs: Record<string, string | number>, badge: { kind: "user" | "group" } | null, uncertain?: boolean) {
    mark.setAttribute("data-wv-refs-kind", kind);
    const svg = wvSvgEl(doc, "svg", Object.assign({ viewBox: "0 0 10 10" }, svgAttrs), mark);
    if (kind !== "web" && uncertain) {
        // Several works of the libraries fit the reference about equally (lib/ref-match.ts
        // `ambiguous`, 1.3.0-refkeys.1, 2026-11-24, MJT "Also ok"; idea from Changed
        // Reference Linker, gesongping, MIT): the dot smaller, inside a dashed ring, both in
        // the kind's colour -- the colour still says where the reference is (one meaning on
        // every surface, markColorCSS: fixed hues, CanvasText in forced colours, the same in
        // both themes), the dashes that the link may be to the wrong work. The ring as the
        // grey one (r 3.75, 1.5 wide: its outer edge is the full dot's 4.5); six dashes,
        // 2 x pi x 3.75 = 23.56 = 6 x (2.36 + 1.57).
        mark.setAttribute("data-wv-refs-uncertain", "");
        wvSvgEl(doc, "circle", { cx: 5, cy: 5, r: 2.25, fill: "currentColor" }, svg);
        wvSvgEl(doc, "circle", { cx: 5, cy: 5, r: 3.75, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "2.36 1.57" }, svg);
    }
    else if (kind !== "web") wvSvgEl(doc, "circle", { cx: 5, cy: 5, r: 4.5, fill: "currentColor" }, svg);
    // Not in your libraries: a ring as wide as the dot (3.75 + 1.5 / 2 = 4.5),
    // bold enough to read on a dark pane at 8 px (a half-filled ◐ did not, MJT
    // 2026-11-20). Until the colours (same day) the ring meant "no PDF" and an
    // entry you do not have carried no mark at all.
    else wvSvgEl(doc, "circle", { cx: 5, cy: 5, r: 3.75, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
    if (!badge) return;
    mark.setAttribute("data-wv-refs-lib", badge.kind);
    wvLibBadgeEl(doc, badge.kind, mark).setAttribute("class", "wv-refs-libbadge");
}

class _RefsMixin {
    [k: string]: any;

    /** The feature's switch (Settings: Links & Relations -> References in your library). */
    _wvRefsOn(): boolean {
        try { return !!this._wvPref("enableReferences"); } catch (e) { return false; }
    }

    // ---- the index ----------------------------------------------------------

    /** The index, built once (concurrent callers share the build); null when
     *  it cannot be read or the instance is gone. */
    _wvRefsIndexEnsure(): Promise<WvRefIndex | null> {
        const self: any = this;
        if (self._wvRefsIx) return Promise.resolve(self._wvRefsIx);
        if (self._wvRefsIxBuilding) return self._wvRefsIxBuilding;
        self._wvRefsIxBuilding = (async () => {
            const t0 = Date.now();
            try {
                await Zotero.Schema.schemaUpdatePromise;
                if (self._wvDestroyed) return null;
                const ix = wvRefIndexNew();
                // The observer first: a change landing during the build is
                // queued and re-read once the index is there.
                this._wvRefsWireNotifier();
                const n = await this._wvRefsLoad(ix, null);
                if (self._wvDestroyed) return null;
                self._wvRefsIx = ix;
                Zotero.debug("[Weavero] references index: " + n + " items in " + (Date.now() - t0) + " ms");
                this._wvRefsFlushSoon();
                return ix;
            }
            catch (e) { Zotero.debug("[Weavero] references index err: " + e); return null; }
            finally { self._wvRefsIxBuilding = null; }
        })();
        return self._wvRefsIxBuilding;
    }

    /** The index if it is built, else null (and its build started when the feature is on). */
    _wvRefsIndexNow(): WvRefIndex | null {
        const self: any = this;
        if (self._wvRefsIx) return self._wvRefsIx;
        if (this._wvRefsOn()) this._wvRefsIndexEnsure().catch(() => {});
        return null;
    }

    /** Read the regular items `ids` (null: every one) of every library that
     *  is not a feed into `ix`, in passes that yield. Returns the count. */
    async _wvRefsLoad(ix: WvRefIndex, ids: number[] | null): Promise<number> {
        const self: any = this;
        if (ids === null) {
            // The whole library in slices, a yield between: one pass over every row of
            // MJT's 18,444 items held the main thread ~1.9 s and, run while a PDF
            // opened, drew its page 1 1386 ms later (work/refs-perf-2026-11-20.md; MJT
            // 2026-11-20, "make the changes that you decide to prevent Weavero from
            // slowing down opening PDF files"). Each slice is the re-read path below.
            const T0 = Zotero.ItemTypes;
            const skip0 = ["note", "attachment", "annotation"].map((t) => { try { return T0.getID(t); } catch (e) { return null; } }).filter((x) => x);
            const all: number[] = ((await Zotero.DB.columnQueryAsync(
                "SELECT itemID FROM items WHERE libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))"
                + " AND itemID NOT IN (SELECT itemID FROM deletedItems)"
                + (skip0.length ? " AND itemTypeID NOT IN (" + skip0.map(() => "?").join(",") + ")" : ""),
                skip0)) || []).map(Number).sort((a, b) => a - b);
            let total = 0;
            // Pipelined: the next slice's reads run on the database's thread while this
            // slice's rows are put on the main thread (work/refs-marks-speed-2026-11-21.md).
            // A slice is the ids from all[i] to all[i + LOAD_RANGE - 1]: a range holds the
            // regular items between them and nothing else the read keeps.
            const range = (i: number): [number, number] => [all[i], all[Math.min(i + LOAD_RANGE, all.length) - 1]];
            let next: Promise<Map<number, any>> | null = all.length ? this._wvRefsRead(null, range(0)) : null;
            for (let i = 0; i < all.length; i += LOAD_RANGE) {
                const recs = await (next as Promise<Map<number, any>>);
                next = null;
                if (self._wvDestroyed) return total;
                if (i + LOAD_RANGE < all.length) {
                    next = this._wvRefsRead(null, range(i + LOAD_RANGE));
                    next.catch(() => {});
                }
                total += await this._wvRefsPut(ix, recs);
                await wvSleep(0);
            }
            return total;
        }
        const recs = await this._wvRefsRead(ids);
        if (self._wvDestroyed) return 0;
        return this._wvRefsPut(ix, recs);
    }

    /** The index's fields of the regular items `ids` (null: every one; `range`: the
     *  ids from range[0] to range[1]), from the database: id -> { id, lib, itemType, title,
     *  DOI, url, extra, archiveID, date, originalDate, volume, pages, first, pdf }; the documents' attachment ->
     *  parent ids go into the attachment map (_wvRefsAttMap) as they are read. */
    async _wvRefsRead(ids: number[] | null, range?: [number, number]): Promise<Map<number, any>> {
        const self: any = this;
        const F = Zotero.ItemFields;
        const fieldOf = new Map<number, string>();
        const take = (name: string, base: boolean) => {
            try { const id = F.getID(name); if (id) fieldOf.set(id, name); } catch (e) {}
            if (!base) return;
            try { for (const id of F.getTypeFieldsFromBase(name) || []) fieldOf.set(id, name); } catch (e) {}
        };
        take("title", true); take("DOI", false); take("url", false); take("extra", false);
        take("date", true); take("volume", true); take("pages", true);
        // The Original Date field where a type has it (a book; 1.3.0-refyear.2) -- a journal
        // article keeps it in Extra, read above; ref-match.ts takes the field first, as Zotero
        // does. take() skips a Zotero without the field.
        take("originalDate", false);
        // A preprint's Archive ID (refkeys.1: the matcher's arXiv key, "arXiv:2101.12345" as
        // Zotero's arXiv translator writes it). Kept under the type's own field id, as every
        // type-specific field (xpcom/data/item.js setField: "Make sure to use type-specific
        // field ID if available").
        take("archiveID", false);
        const T = Zotero.ItemTypes;
        const typeName = new Map<number, string>();
        const typeOf = (id: number): string => {
            let n = typeName.get(id);
            if (n === undefined) { try { n = String(T.getName(id) || ""); } catch (e) { n = ""; } typeName.set(id, n); }
            return n;
        };
        const skipTypes = ["note", "attachment", "annotation"].map((t) => { try { return T.getID(t); } catch (e) { return null; } }).filter((x) => x);
        const fids = [...fieldOf.keys()];
        const recs = new Map<number, any>();
        const rg: number[] = !ids && range ? [range[0], range[1]] : [];
        const inIds = ids ? " AND i.itemID IN (" + ids.map(() => "?").join(",") + ")" : rg.length ? " AND i.itemID BETWEEN ? AND ?" : "";
        const libs = "i.libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))";
        const notDeleted = "i.itemID NOT IN (SELECT itemID FROM deletedItems)";
        await Zotero.DB.queryAsync(
            "SELECT i.itemID, i.libraryID, d.fieldID, v.value, i.itemTypeID FROM items i"
            + " JOIN itemData d ON d.itemID = i.itemID JOIN itemDataValues v ON v.valueID = d.valueID"
            + " WHERE " + libs + " AND " + notDeleted
            + (skipTypes.length ? " AND i.itemTypeID NOT IN (" + skipTypes.map(() => "?").join(",") + ")" : "")
            + " AND d.fieldID IN (" + fids.map(() => "?").join(",") + ")" + inIds,
            [...skipTypes, ...fids, ...(ids || rg)],
            { noCache: !!ids, onRow: (row: any) => {
                const id = row.getResultByIndex(0);
                let r = recs.get(id);
                if (!r) { r = { id, lib: row.getResultByIndex(1), itemType: typeOf(row.getResultByIndex(4)) }; recs.set(id, r); }
                const name = fieldOf.get(row.getResultByIndex(2));
                if (name && r[name] === undefined) r[name] = String(row.getResultByIndex(3) == null ? "" : row.getResultByIndex(3));
            } });
        if (self._wvDestroyed) return recs;
        await Zotero.DB.queryAsync(
            "SELECT ic.itemID, c.lastName, c.firstName FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID"
            + " JOIN items i ON i.itemID = ic.itemID WHERE ic.orderIndex = 0 AND " + libs + inIds,
            [...(ids || rg)],
            { noCache: !!ids, onRow: (row: any) => {
                const r = recs.get(row.getResultByIndex(0));
                if (r) r.first = String(row.getResultByIndex(1) || row.getResultByIndex(2) || "");
            } });
        if (self._wvDestroyed) return recs;
        const att = this._wvRefsAttMap();
        const pIn = ids ? " AND a.parentItemID IN (" + ids.map(() => "?").join(",") + ")" : rg.length ? " AND a.parentItemID BETWEEN ? AND ?" : "";
        await Zotero.DB.queryAsync(
            "SELECT a.parentItemID, a.itemID FROM itemAttachments a JOIN items i ON i.itemID = a.itemID"
            + " WHERE a.parentItemID IS NOT NULL AND a.linkMode != ? AND a.contentType IN (" + DOC_TYPES.map(() => "?").join(",") + ")"
            + " AND " + libs + " AND " + notDeleted + pIn,
            [this._wvRefsLinkedUrlMode(), ...DOC_TYPES, ...(ids || rg)],
            { noCache: !!ids, onRow: (row: any) => {
                const p = row.getResultByIndex(0);
                att.set(row.getResultByIndex(1), p);
                const r = recs.get(p);
                if (r) r.pdf = true;
            } });
        return recs;
    }

    /** Put the records `recs` (_wvRefsRead) into `ix`, BUILD_SLICE_MS of the main
     *  thread at a time. Returns the count. */
    async _wvRefsPut(ix: WvRefIndex, recs: Map<number, any>): Promise<number> {
        const self: any = this;
        let n = 0;
        let t = Date.now();
        for (const r of recs.values()) {
            wvRefIndexPut(ix, r as WvRefItem);
            n++;
            // By time, not by count: 2,000 items took up to 83 ms on MJT's
            // library (Zotero 11, the Cited by probe 2026-11-20); Cited by
            // builds this index in the background, where no step may hold the
            // main thread for long.
            if (Date.now() - t >= BUILD_SLICE_MS) {
                await wvSleep(0);
                if (self._wvDestroyed) return n;
                t = Date.now();
            }
        }
        return n;
    }

    /** Attachment id -> parent id, for the documents the index counts (the
     *  notifier names an attachment that went away by its id alone). */
    _wvRefsAttMap(): Map<number, number> {
        const self: any = this;
        if (!self._wvRefsAtt) self._wvRefsAtt = new Map();
        return self._wvRefsAtt;
    }

    _wvRefsLinkedUrlMode(): number {
        try { const m = Zotero.Attachments.LINK_MODE_LINKED_URL; return typeof m === "number" ? m : 3; } catch (e) { return 3; }
    }

    // ---- the notifier ---------------------------------------------------------

    /** The item observer, stamped like every long-lived hook (src-ts.md: a
     *  reload re-registers; the previous build's `notify` never stays). */
    _wvRefsWireNotifier() {
        const self: any = this;
        try {
            const g: any = Zotero;
            const tag = self._wvWireTag();
            if (g._wvRefsObsID) {
                if (g._wvRefsObsVer === tag) return;
                try { Zotero.Notifier.unregisterObserver(g._wvRefsObsID); } catch (e) {}
                delete g._wvRefsObsID;
            }
            g._wvRefsObsVer = tag;
            g._wvRefsObsID = Zotero.Notifier.registerObserver({
                notify: (event: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = wvLivePlugin();
                        if (!lp || type !== "item" || lp._wvWireTag() !== tag) return;
                        lp._wvRefsOnItems(event, ids || []);
                    } catch (e) {}
                },
            }, ["item"], "weavero-refs", 90);
        } catch (e) { Zotero.debug("[Weavero] references notifier err: " + e); }
    }

    _wvRefsUnwireNotifier() {
        try {
            const g: any = Zotero;
            if (g._wvRefsObsID) { try { Zotero.Notifier.unregisterObserver(g._wvRefsObsID); } catch (e) {} }
            delete g._wvRefsObsID; delete g._wvRefsObsVer;
        } catch (e) {}
    }

    /** Queue the items an event names -- each one, its parent when it is an
     *  attachment -- for a re-read. */
    _wvRefsOnItems(event: string, ids: any[]) {
        const self: any = this;
        if (!["add", "modify", "trash", "delete", "refresh", "move"].includes(event)) return;
        const q: Set<number> = self._wvRefsPending || (self._wvRefsPending = new Set());
        const att = this._wvRefsAttMap();
        for (const raw of ids) {
            const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
            if (!Number.isFinite(id)) continue;
            q.add(id);
            if (att.has(id)) q.add(att.get(id));
            try {
                const it = Zotero.Items.get(id);
                if (it && it.parentItemID) q.add(it.parentItemID);
            } catch (e) {}
        }
        this._wvRefsFlushSoon();
    }

    _wvRefsFlushSoon() {
        const self: any = this;
        if (!self._wvRefsPending || !self._wvRefsPending.size || !self._wvRefsIx) return;
        wvClearTimeout(self._wvRefsFlushT);
        self._wvRefsFlushT = wvTimeout(() => {
            self._wvRefsFlushT = null;
            const lp: any = wvLivePlugin();
            if (lp !== self || self._wvDestroyed) return;
            this._wvRefsFlush().catch((e: any) => Zotero.debug("[Weavero] references update err: " + e));
        }, 400);
    }

    /** Re-read the queued items: each is dropped, then put back when the
     *  database still has it as a regular item. */
    async _wvRefsFlush() {
        const self: any = this;
        const ix: WvRefIndex = self._wvRefsIx;
        const q: Set<number> = self._wvRefsPending;
        if (!ix || !q || !q.size) return;
        self._wvRefsPending = new Set();
        const ids = [...q];
        const att = this._wvRefsAttMap();
        for (const [a, p] of [...att]) { if (q.has(p) || q.has(a)) att.delete(a); }
        for (const id of ids) wvRefIndexDrop(ix, id);
        for (let i = 0; i < ids.length; i += 400) {
            await this._wvRefsLoad(ix, ids.slice(i, i + 400));
            if (self._wvDestroyed) return;
        }
        ix.seq++;
        // The marks and the sections show what the index says now -- the Cited by
        // sections too: their rows are this index's records (cited-by.ts _wvCbWorksOf),
        // a paper put in the trash leaves them here.
        this._wvRefsRefreshAll();
        try { if (typeof self._wvCbSecRefreshAll === "function") self._wvCbSecRefreshAll(); } catch (e) {}
    }

    // ---- a paper's reference list ---------------------------------------------

    /** The reference list of attachment `attID` (open in a reader), from
     *  Zotero's structured document text; [] when there is none or SDT is
     *  not there. */
    _wvRefsEntries(attID: number, reader?: any): Promise<WvRefsEntry[]> {
        const id = num(attID);
        if (!Number.isFinite(id)) return Promise.resolve([]);
        const had = entryCache.get(id);
        if (had) { entryCache.delete(id); entryCache.set(id, had); return had; }
        const p = (async (): Promise<WvRefsEntry[]> => {
            try {
                // getPack + the bundled module (lib/sdt.ts): zotero#6012 removes getReader.
                // The open's timeline (tlMark): was the structure cached, or did Zotero
                // process the PDF for this read?
                let cache: boolean | null = null;
                if (reader && refsTl.has(reader)) {
                    try {
                        const att = Zotero.Items.get(id);
                        cache = await IOUtils.exists(PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache"));
                    } catch (e) {}
                }
                const rd = await wvSdtReader(id);
                tlMark(reader, "sdt", { cache });
                if (!rd || typeof rd.materialize !== "function") return [];
                const s = await rd.materialize();
                tlMark(reader, "mat");
                // The walk in a task of its own: with the materialize, one block of a
                // long document's read (the 214-page book: 85 + 174 ms, a 515-page
                // workshop volume 141 + 156; work/refs-marks-speed-2026-11-21.md).
                await wvSleep(0);
                if ((this as any)._wvDestroyed) return [];
                return this._wvRefsWalk(s, id);
            }
            catch (e) { Zotero.debug("[Weavero] references: no structure data for " + id + ": " + e); return []; }
        })();
        entryCache.set(id, p);
        while (entryCache.size > ENTRY_CACHE) entryCache.delete(entryCache.keys().next().value);
        // A failed read is not kept: the next popup asks again.
        p.then((r) => { if (!r.length && entryCache.get(id) === p) entryCache.delete(id); }, () => entryCache.delete(id));
        return p;
    }

    /** The reference list of attachment `attID` read from its structure cache
     *  ALONE, for the library's item pane (1.2.1-refs.7, MJT 2026-11-19: "Also
     *  in the library's item pane"): `.zotero-sdt-cache` in the attachment's
     *  storage folder (sdt.js _getCachePath), parsed with the module Zotero
     *  parses it with (sdt.js _openPack), checked as sdt.js _validateBytes
     *  checks it -- pack and schema versions, the PDF's own hash (a cache of
     *  another version of the file is not read), a PDF processor. Never
     *  Zotero.SDT.getPack: that one builds a missing cache (the PDF processed
     *  for the first time, a file written) and rebuilds one of an older
     *  processor in the background (sdt.js getPack). A cache of an older
     *  processor is read as it is, as getPack itself returns it. Null when
     *  there is no usable cache: then the section stays hidden. */
    async _wvRefsCachedEntries(attID: number): Promise<WvRefsEntry[] | null> {
        const id = num(attID);
        if (!Number.isFinite(id)) return null;
        const had = entryCache.get(id);
        if (had) { const r = await had; if (r.length) return r; }
        try {
            const att = Zotero.Items.get(id);
            if (!att || !att.isPDFAttachment || !att.isPDFAttachment()) return null;
            const path = PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
            if (!(await IOUtils.exists(path))) return null;
            if (!wvSdtModule()) return null;
            const rd = await wvSdtOpen(await IOUtils.read(path));
            if (!rd || !(await wvSdtVersionOk(rd))) return null;
            const md = await rd.getMetadata();
            if (!md || !md.processor || md.processor.type !== "pdf") return null;
            const hash = await att.attachmentHash;
            if (!hash || !md.source || md.source.hash !== hash) return null;
            const entries = this._wvRefsWalk(await rd.materialize(), id);
            const p = Promise.resolve(entries);
            if (entries.length) {
                entryCache.set(id, p);
                while (entryCache.size > ENTRY_CACHE) entryCache.delete(entryCache.keys().next().value);
            }
            return entries;
        }
        catch (e) { Zotero.debug("[Weavero] references: no cached structure for " + id + ": " + e); return null; }
    }

    /** The reference list of attachment `attID` from the entries the Cited by
     *  index stored when it read the PDF's full text (cited-by.ts _wvCbEntRead,
     *  citations M1) -- for the library's item pane when the PDF has no usable
     *  structure cache (citations.6, MJT 2026-11-21: 107 of his 18,787 PDFs had
     *  one, the others showed no References). Only a file whose stamp is the
     *  PDF's full-text cache NOW, read by this build's list code; anything else
     *  (none yet, the index re-reading, another full text) is no list: null.
     *  The entries have no position, so no mark can come from them. A list known
     *  for the same stamp is not read again. */
    async _wvRefsStoredEntries(attID: number): Promise<WvRefsEntry[] | null> {
        const P: any = this;
        const id = num(attID);
        if (!Number.isFinite(id)) return null;
        try {
            const att = Zotero.Items.get(id);
            if (!att || !att.isPDFAttachment || !att.isPDFAttachment()) return null;
            if (typeof P._wvCbFtStampOf !== "function" || typeof P._wvCbEntRead !== "function") return null;
            const s: string = await P._wvCbFtStampOf(att);
            if (!s || P._wvDestroyed) return null;
            const known: WvRefsEntry[] | undefined = P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(id);
            if (known && ftLists.get(known) === s) return known;
            const ent = await P._wvCbEntRead(id, s);
            if (!ent || ent.src !== "ft" || !ent.x.length) return null;
            const list = ent.x.map((t: string) => refsFtEntry(String(t)));
            ftLists.set(list, s);
            return list;
        }
        catch (e) { Zotero.debug("[Weavero] references: no stored entries for " + id + ": " + e); return null; }
    }

    /** The library's item pane: the stand-in "reader" of item `item` -- its
     *  best PDF with a structure cache (Zotero's best-attachment order), else
     *  its best PDF with stored full-text entries (_wvRefsStoredEntries) -- as
     *  { wvLib, itemID: the PDF's id, _window, tabID: null, type: "pdf" }, the
     *  shape the section's code reads; null while not known or when it has
     *  none (then the probe starts: one existence check per PDF of the item,
     *  then, with no structure cache, a stat of each full-text cache and the
     *  read of a stored file). */
    _wvRefsLibCtx(item: any, win: any): any {
        const P: any = this;
        try {
            if (!item || !win) return null;
            const probes: Map<number, any> = P._wvRefsLibProbes || (P._wvRefsLibProbes = new Map());
            const got = probes.get(item.id);
            // Looked again after a few seconds (a PDF opened since has its
            // cache now); the last answer stands meanwhile.
            if (!got || (!got.busy && Date.now() - got.at > 5000)) this._wvRefsLibProbe(item, win).catch(() => {});
            if (!got || !got.att) return null;
            const ctxs: Map<number, any> = P._wvRefsLibCtxs || (P._wvRefsLibCtxs = new Map());
            let ctx = ctxs.get(got.att);
            if (!ctx || ctx._window !== win) {
                ctx = { wvLib: true, itemID: got.att, _window: win, tabID: null, type: "pdf", libItemID: item.id };
                ctxs.set(got.att, ctx);
                while (ctxs.size > ENTRY_CACHE) ctxs.delete(ctxs.keys().next().value);
            }
            return ctx;
        } catch (e) {}
        return null;
    }

    async _wvRefsLibProbe(item: any, win: any): Promise<void> {
        const P: any = this;
        const probes: Map<number, any> = P._wvRefsLibProbes || (P._wvRefsLibProbes = new Map());
        let rec: any = probes.get(item.id);
        if (!rec) { rec = { at: 0, att: 0 }; probes.set(item.id, rec); }
        if (rec.busy) return;
        rec.busy = true;
        while (probes.size > 200) probes.delete(probes.keys().next().value);
        const was = rec.att, wasKind = rec.kind || "";
        let found = 0, kind = "", ftList: WvRefsEntry[] | null = null, swapped = false;
        try {
            let atts: any[] = [];
            if (item.isRegularItem && item.isRegularItem()) {
                let best: any[] = [];
                try { best = await item.getBestAttachments(); } catch (e) { best = []; }
                const seen = new Set(best.map((a: any) => a.id));
                atts = best.concat(item.getAttachments().map((id: number) => Zotero.Items.get(id)).filter((a: any) => a && !seen.has(a.id)));
            }
            else if (item.isPDFAttachment && item.isPDFAttachment()) atts = [item];
            const pdfs = atts.filter((a: any) => a && a.isPDFAttachment && a.isPDFAttachment() && a.attachmentLinkMode !== this._wvRefsLinkedUrlMode());
            // The PDFs looked at: a stored file written for one of them makes this
            // pane look again (_wvRefsLibRecheck).
            rec.atts = pdfs.map((a: any) => a.id);
            for (const a of pdfs) {
                let dir = "";
                try { dir = Zotero.Attachments.getStorageDirectory(a).path; } catch (e) { continue; }
                if (await IOUtils.exists(PathUtils.join(dir, ".zotero-sdt-cache"))) { found = a.id; kind = "sdt"; break; }
            }
            // No structure cache: the entries the Cited by index read from a full text.
            if (!found) {
                for (const a of pdfs) {
                    const l = await this._wvRefsStoredEntries(a.id);
                    if (P._wvDestroyed) break;
                    if (l) { found = a.id; kind = "ft"; ftList = l; break; }
                }
            }
            // The list known for that PDF, when it is not the one to show: a full
            // text's once a structure cache is there (read again from it); another
            // full text's, or none, when a stored list is (taken at once).
            const m: Map<number, WvRefsEntry[]> = P._wvRefsEntriesNow || (P._wvRefsEntriesNow = new Map());
            const now = found ? m.get(found) : undefined;
            if (kind === "sdt" && now && ftLists.has(now)) { this._wvRefsForget(found); swapped = true; }
            else if (kind === "ft" && ftList && now !== ftList && (!now || !now.length || ftLists.has(now))) {
                this._wvRefsForget(found);
                m.delete(found); m.set(found, ftList);
                while (m.size > ENTRY_CACHE) m.delete(m.keys().next().value);
                swapped = true;
            }
        } catch (e) {}
        rec.att = found;
        rec.kind = kind;
        // A file written while this look ran (_wvRefsLibRecheck): due again at once.
        const again = !!rec.again;
        rec.again = false;
        rec.at = again ? 0 : Date.now();
        rec.busy = false;
        if (P._wvDestroyed) return;
        const ctx = found ? this._wvRefsLibCtx(item, win) : null;
        if (ctx) await this._wvRefsPrepare(ctx);
        // Shown or hidden as the answer changed (a list already known is not read again).
        if (found !== was || kind !== wasKind || swapped || again) { const lp: any = wvLivePlugin(); if (lp) lp._wvRefsSecRefreshFor(null); }
    }

    /** A library pane that looked for attachment `attID`'s list looks again (its
     *  probe due, every section drawn again): the Cited by index wrote that PDF's
     *  entries (cited-by.ts _wvCbEntWrite), or a reader read its structure in
     *  place of a full-text list. Its References section comes up, or follows the
     *  new list, with no polling (citations.6). The panes concerned: the look of
     *  the PDF's parent item (or of the PDF itself) -- also one made before the
     *  PDF was attached, which knew none of its PDFs -- and any look that saw this
     *  PDF. Nothing to do for a PDF no library pane looked for -- every other PDF
     *  of a pass. */
    _wvRefsLibRecheck(attID: number) {
        const P: any = this;
        try {
            const probes: Map<number, any> | null = P._wvRefsLibProbes || null;
            if (!probes || P._wvDestroyed) return;
            let parent = 0;
            try { const a = Zotero.Items.get(attID); parent = (a && a.parentItemID) || 0; } catch (e) {}
            let hit = false;
            for (const [itemID, rec] of probes.entries()) {
                if (!rec) continue;
                const mine = itemID === attID || (!!parent && itemID === parent) || (Array.isArray(rec.atts) && rec.atts.indexOf(attID) >= 0);
                if (!mine) continue;
                if (rec.busy) rec.again = true;
                else rec.at = 0;
                hit = true;
            }
            if (hit) this._wvRefsSecRefreshFor(null);
        } catch (e) { Zotero.debug("[Weavero] references recheck err: " + e); }
    }

    /** The entries of a materialized structure, with their boxes
     *  (lib/ref-list.ts): the blocks Zotero flagged `reference`, else a
     *  numbered list it did not flag (paper 02 of the test library, Physical
     *  Review Fluids: no list at all on 1.1.1-refs.3). */
    _wvRefsWalk(s: any, attID?: number): WvRefsEntry[] {
        // The citing paper's title (its parent item's): a list printed before
        // it is another article's (1.2.1-refs.8, lib/ref-list.ts wvRefList).
        let title = "";
        try {
            const att = attID != null ? Zotero.Items.get(attID) : null;
            const top = att && att.parentItem;
            if (top) title = String(top.getField("title") || "");
        } catch (e) {}
        const r = wvRefList(s, { title });
        if (r.how === "detected") Zotero.debug("[Weavero] references: Zotero flagged no entry; a numbered list of " + r.entries.length + " read instead");
        return r.entries;
    }

    // ---- matching ---------------------------------------------------------------

    /** The citing paper of `reader`: its attachment and the attachment's
     *  parent, for the self-match guard. */
    _wvRefsSelf(ix: WvRefIndex, reader: any): WvRefSelf {
        const ids: number[] = [];
        try {
            const att = Zotero.Items.get(reader.itemID);
            if (att) { ids.push(att.id); if (att.parentItemID) ids.push(att.parentItemID); }
        } catch (e) {}
        const self = wvRefSelfOf(ix, ids);
        // A parent the index does not hold (a standalone file): its own words.
        if (!self.cts.length) {
            try {
                const att = Zotero.Items.get(reader.itemID);
                const top = att && (att.parentItem || att);
                const ct = wvRefCompact(top && top.getField && top.getField("title"));
                if (ct.length >= 10) self.cts.push(ct);
            } catch (e) {}
        }
        return self;
    }

    /** The answer for one reference text, cached per index state. */
    _wvRefsMatchText(ix: WvRefIndex, text: string, self: WvRefSelf, citingLib: number | null): WvRefsHit | null {
        const P: any = this;
        let cache: any = P._wvRefsHitCache;
        if (!cache || cache.seq !== ix.seq) cache = P._wvRefsHitCache = { seq: ix.seq, map: new Map() };
        const key = (self.ids || []).join(",") + "\n" + text;
        if (cache.map.has(key)) return cache.map.get(key);
        let hit: WvRefsHit | null = null;
        const m: WvRefMatch | null = wvRefMatch(ix, text, self);
        if (m) {
            const ids = this._wvRefsOrder(ix, m.ids, citingLib);
            const best = wvRefIndexGet(ix, ids[0]);
            // The libraries holding a copy: none of them the citing paper's,
            // and the mark names the best copy's (MJT 2026-11-19, "Group
            // badge", then "the icon of the library that holds the copy").
            const libs = new Set<number>();
            for (const id of ids) { const r = wvRefIndexGet(ix, id); if (r) libs.add(r.lib); }
            const away = citingLib != null && best && !libs.has(citingLib) ? best.lib : null;
            hit = { ids, how: m.how, pdf: !!(best && best.pdf), away, others: away != null ? libs.size - 1 : 0 };
            // The works it could be (refkeys.1): the first is this work, named by the copy shown.
            if (m.ambiguous && m.ambiguous.length > 1) hit.amb = [ids[0]].concat(m.ambiguous.slice(1));
        }
        if (cache.map.size > 5000) cache.map.clear();
        cache.map.set(key, hit);
        return hit;
    }

    /** Copies, best first: with a PDF; then the citing paper's library, My
     *  Library, the groups (by library id); then the oldest item. */
    _wvRefsOrder(ix: WvRefIndex, ids: number[], citingLib: number | null): number[] {
        let user = 1;
        try { user = Zotero.Libraries.userLibraryID; } catch (e) {}
        const rank = (id: number) => {
            const r = wvRefIndexGet(ix, id);
            if (!r) return [9, 9, 0, id];
            return [r.pdf ? 0 : 1, r.lib === citingLib ? 0 : r.lib === user ? 1 : 2, r.lib, id];
        };
        return ids.slice().sort((a, b) => {
            const x = rank(a), y = rank(b);
            for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return 0;
        });
    }

    /** The answers for the references of a popup, in row order: a hit, null
     *  (not in your libraries), or undefined (not known yet: the index is
     *  being built). */
    _wvRefsHitsFor(reader: any, refs: Array<{ text: string; pageIndex: number; rect: number[] | null }>): Array<WvRefsHit | null | undefined> {
        const ix = this._wvRefsIndexNow();
        if (!ix) return refs.map(() => undefined);
        const self = this._wvRefsSelf(ix, reader);
        let citingLib: number | null = null;
        try { const a = Zotero.Items.get(reader.itemID); citingLib = a ? a.libraryID : null; } catch (e) {}
        return refs.map((r) => {
            const e = this._wvRefsEntryAt(reader, r);
            return e ? this._wvRefsMatchText(ix, e.text, self, citingLib) : null;
        });
    }

    /** The paper's entry a popup reference is (its first rect inside the
     *  entry's box), else the reference's own text as an entry; null without
     *  text. */
    _wvRefsEntryAt(reader: any, r: { text: string; pageIndex: number; rect: number[] | null }): WvRefsEntry | null {
        const P: any = this;
        const entries: WvRefsEntry[] | null = (P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(reader.itemID)) || null;
        if (entries && r.rect) {
            const e = entries.find((en) => en.rects.some((b) => b[0] === r.pageIndex && within(r.rect as number[], [b[1], b[2], b[3], b[4]])));
            if (e && e.text) return e;
        }
        return r.text ? { text: r.text, rects: [] } : null;
    }

    /** Make the reference list of `reader`'s paper known synchronously
     *  (`_wvRefsEntriesNow`), and the index built when it has one -- one prepare
     *  of a reader at a time: a caller while one runs waits for it, then runs its
     *  own (which finds the list and rows known, the file's stamp checked again).
     *  Right after page 1 the wiring's prepare, a views change's and the item
     *  pane's section all asked at once; with no wait for the text layer
     *  (PAINT_TEXT_MS 0, citations.6) a second one matched the rows in the
     *  first's gap and drew the marks twice (refs.spec.js's timeline case, red in
     *  the citations.6 picked run). */
    _wvRefsPrepare(reader: any): Promise<boolean> {
        if (!reader || typeof reader !== "object") return this._wvRefsPrepareRun(reader);
        const prev = prepRuns.get(reader);
        const run: Promise<boolean> = prev
            ? prev.then(() => {}, () => {}).then(() => { const lp: any = wvLivePlugin(); return lp && !lp._wvDestroyed ? lp._wvRefsPrepareRun(reader) : false; })
            : this._wvRefsPrepareRun(reader);
        prepRuns.set(reader, run);
        const done = () => { if (prepRuns.get(reader) === run) prepRuns.delete(reader); };
        run.then(done, done);
        return run;
    }

    async _wvRefsPrepareRun(reader: any): Promise<boolean> {
        const P: any = this;
        try {
            if (!this._wvRefsOn() || !reader || (reader.type || reader._type) !== "pdf") return false;
            const id = reader.itemID;
            tlMark(reader, "prep");
            // The file the known list was read from is still the file: else
            // (a page deleted or rotated, a new version synced) the list, its
            // rows and its marks are the old file's -- forgotten, read again.
            const stamp = await this._wvRefsFileStamp(id);
            if (P._wvDestroyed) return false;
            tlMark(reader, "stamp");
            const was = fileStamps.get(id);
            if (was !== undefined && was !== stamp) {
                Zotero.debug("[Weavero] references: the file of " + id + " changed (" + was + " -> " + stamp + "), its list read again");
                this._wvRefsForget(id);
            }
            // Known already: nothing new to draw. (The section's async render
            // asks for this; a refresh from here re-ran that render, which
            // asked again -- an endless round, 1.1.1-refs.2 in the making.)
            // A list known for this file is not read again while its rows are
            // still being matched (a long list, _wvRefsDocRowsBuild).
            let known: WvRefsEntry[] | null = null;
            // A full text's list (no position, the library pane's: _wvRefsStoredEntries)
            // is never a reader's: a reader reads the structure, which then stands for
            // the library pane too (citations.6).
            const had: WvRefsEntry[] | undefined = P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(id);
            const ftHad = !!had && ftLists.has(had) && !reader.wvLib;
            if ((was === undefined || was === stamp) && !ftHad) {
                const now: WvRefsEntry[] | undefined = had;
                if (now) {
                    if (was === undefined) fileStamps.set(id, stamp);
                    tlMark(reader, "list", { entries: now.length, known: true });
                    if (this._wvRefsDocRows(reader)) return true;
                    known = now;
                }
            }
            let entries: WvRefsEntry[];
            if (known) entries = known;
            else {
                fileStamps.delete(id);
                fileStamps.set(id, stamp);
                while (fileStamps.size > 200) fileStamps.delete(fileStamps.keys().next().value);
                // The library's item pane reads the structure cache alone (_wvRefsCachedEntries),
                // else, with none, the entries the Cited by index stored from the full text
                // (_wvRefsStoredEntries, citations.6).
                entries = reader.wvLib ? ((await this._wvRefsCachedEntries(id)) || (await this._wvRefsStoredEntries(id)) || []) : await this._wvRefsEntries(id, reader);
                if (P._wvDestroyed) return false;
                if (!P._wvRefsEntriesNow) P._wvRefsEntriesNow = new Map();
                const m: Map<number, WvRefsEntry[]> = P._wvRefsEntriesNow;
                m.delete(id); m.set(id, entries);
                while (m.size > ENTRY_CACHE) m.delete(m.keys().next().value);
                tlMark(reader, "list", { entries: entries.length });
                // A reader's structure in place of the full text's list: the library
                // pane showing that list switches to this one.
                if (ftHad) this._wvRefsLibRecheck(id);
                // A task of its own after the list's read (a book's: 118 ms).
                await wvSleep(0);
                if (P._wvDestroyed) return false;
            }
            if (entries.length) {
                if (refsTl.has(reader)) tlMark(reader, "ix0", { ixAt: P._wvRefsIx ? "ready" : P._wvRefsIxBuilding ? "building" : "none" });
                await this._wvRefsIndexEnsure();
                tlMark(reader, "ix");
            }
            if (P._wvDestroyed) return false;
            // A long list: matched in steps, which then draw the marks and the
            // section themselves, a task each.
            if (entries.length > ROWS_SYNC_MAX) { await this._wvRefsDocRowsBuild(reader); return true; }
            // The reference list's marks and the References section, now that
            // both are known: the marks painted first, the section after (in the
            // same task they waited 14-129 ms for the section's rows and layout,
            // work/refs-marks-speed-2026-11-21.md).
            this._wvRefsMarksDraw(reader);
            await refsAfterNextPaint(reader._iframeWindow);
            if (P._wvDestroyed) return false;
            this._wvRefsSecRefreshFor(reader);
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] references prepare err: " + e); return false; }
    }

    /** "size:lastModified" of attachment `attID`'s file ("" when it has none
     *  or it cannot be read): one stat, no read. */
    async _wvRefsFileStamp(attID: number): Promise<string> {
        try {
            const att = Zotero.Items.get(attID);
            const path = att && att.isAttachment && att.isAttachment() ? await att.getFilePathAsync() : null;
            if (!path) return "";
            const st: any = await IOUtils.stat(path);
            return st ? st.size + ":" + st.lastModified : "";
        } catch (e) { return ""; }
    }

    /** Forget what was read from attachment `attID`'s file: its list (both
     *  caches) and its rows. */
    _wvRefsForget(attID: number) {
        const P: any = this;
        entryCache.delete(attID);
        try { if (P._wvRefsEntriesNow) P._wvRefsEntriesNow.delete(attID); } catch (e) {}
        try { if (P._wvRefsRowCache) P._wvRefsRowCache.delete(attID); } catch (e) {}
        fileStamps.delete(attID);
    }

    /** Remove Built Data (sdt-build.ts _wvSbCleanRun): what was read from the
     *  structure caches and from the Cited by index's stored lists is forgotten --
     *  the lists (entryCache, fileStamps, `_wvRefsEntriesNow`), their rows, the
     *  library panes' looks and stand-ins -- so that no pane shows a list whose
     *  file is gone; each pane drawn again looks afresh. A document open in a
     *  reader keeps its own: the reader holds Zotero's structure in memory, and a
     *  list of it read again would have Zotero build the pack at once. */
    _wvRefsDropCaches() {
        const P: any = this;
        const open = new Set<number>();
        try { for (const r of (Zotero.Reader._readers || []) as any[]) { try { if (r && !r.wvLib && r.itemID) open.add(r.itemID); } catch (e) {} } } catch (e) {}
        for (const id of Array.from(entryCache.keys())) if (!open.has(id)) entryCache.delete(id);
        for (const id of Array.from(fileStamps.keys())) if (!open.has(id)) fileStamps.delete(id);
        const now: Map<number, WvRefsEntry[]> | null = P._wvRefsEntriesNow || null;
        if (now) for (const [id, l] of Array.from(now.entries())) if (!open.has(id) || ftLists.has(l)) now.delete(id);
        const rows: Map<number, any> | null = P._wvRefsRowCache || null;
        if (rows) for (const id of Array.from(rows.keys())) if (!open.has(id)) rows.delete(id);
        P._wvRefsLibProbes = null;
        P._wvRefsLibCtxs = null;
        try { this._wvRefsSecRefreshFor(null); } catch (e) {}
    }

    // ---- the reader -------------------------------------------------------------

    /** Wire `reader`'s page (reader.ts _setupReaderObserver calls this for
     *  every reader): an observer of the reader UI for Zotero's citation
     *  popup, and the paper's references read ahead. A reader wired by
     *  another instance is re-wired. */
    _wvRefsWireReader(reader: any) {
        const P: any = this;
        try {
            if (!reader || (reader.type || reader._type) !== "pdf") return;
            const iwin = reader._iframeWindow;
            const doc = iwin && iwin.document;
            if (!doc) return;
            const tag = P._wvWireTag();
            const had = reader._wvRefsMO;
            if (had && had.tag === tag) return;
            if (had) { try { had.mo.disconnect(); } catch (e) {} }
            wvInjectStyle(doc, STYLE_ID, CSS);
            const mo = new iwin.MutationObserver((muts: any) => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag) { mo.disconnect(); return; }
                    lp._wvRefsOnMutations(reader, muts);
                } catch (e) {}
            });
            mo.observe(doc.getElementById("reader-ui") || doc.body || doc.documentElement, { childList: true, subtree: true });
            // The views' frames live beside the reader UI, in #primary-view and
            // #secondary-view (reader index.reader.html): a reload() replaces
            // them there (reader.js reload: replaceChildren, then _createView).
            // Those two containers alone: a popup's frame elsewhere (a link
            // preview) is no new view.
            for (const id of ["primary-view", "secondary-view"]) {
                const el = doc.getElementById(id);
                if (el) mo.observe(el, { childList: true });
            }
            reader._wvRefsMO = { mo, tag };
            // The views up now are the ones this wiring reads; a later new one
            // (a reload after Delete Page) is _wvRefsViewsChanged's.
            this._wvRefsNewViews(reader);
            // Reading Mode's state now, the baseline _wvRefsOnMutations compares
            // against: set here, not only at the next mutation of the reader's
            // UI, or a reader re-wired by a reload (a quiet page) went without it
            // (zz-reader-window-wiring.spec.js, 1.1.1-refs.4 on Zotero 10).
            try { reader._wvRefsRm = !!this._wvReadingModeActive(reader); } catch (e) {}
            // The list read ahead; the marks drawn (again, after a teardown: the
            // list itself may be known already) -- once the paper has drawn a page
            // (_wvRefsAfterFirstPaint: opening a PDF is not slowed by any of it).
            if (this._wvRefsOn()) {
                tlStart(reader);
                this._wvRefsAfterFirstPaint(reader, () => {
                    const lp: any = wvLivePlugin();
                    if (!lp || !lp._wvRefsOn()) return;
                    lp._wvRefsPrepare(reader).then(() => {
                        const l2: any = wvLivePlugin();
                        if (!l2) return;
                        l2._wvRefsMarksDraw(reader);
                        // A paper already in a split (restored at startup, a reload while
                        // the split shows): the paper beside it marked now -- the split
                        // itself does not change (MJT 2026-11-20, "Ref 13 is opened in
                        // split view, but not identified in the PDF").
                        l2._wvRefsBesideApply(reader);
                    }, () => {});
                });
            }
            // A popup open already (a reload while it shows).
            for (const pop of doc.querySelectorAll(".citation-popup")) this._wvRefsDecorate(reader, pop);
        } catch (e) { Zotero.debug("[Weavero] references wire err: " + e); }
    }

    /** Everything this module put in `reader`'s page goes (destroy(), through
     *  _wvReaderPageTeardown). */
    _wvRefsReaderTeardown(reader: any) {
        try {
            const had = reader && reader._wvRefsMO;
            if (had) { try { had.mo.disconnect(); } catch (e) {} }
            try { delete reader._wvRefsMO; } catch (e) {}
            try { wvClearTimeout(reader._wvRefsRmT); delete reader._wvRefsRmT; delete reader._wvRefsRm; } catch (e) {}
            try { wvClearTimeout(reader._wvRefsViewT); delete reader._wvRefsViewT; } catch (e) {}
            this._wvRefsMarksClear(reader);
            try { const sb = refsBeside.get(reader); if (sb && sb.t) wvClearTimeout(sb.t); refsBeside.delete(reader); } catch (e) {}
            for (const v of this._wvRefsViews(reader)) { try { this._wvRefsBesideClearIn(v._iframeWindow.document); } catch (e) {} }
            const doc = reader && reader._iframeWindow && reader._iframeWindow.document;
            if (!doc) return;
            for (const p of doc.querySelectorAll(".citation-popup") as any) {
                try { if (p._wvRefsPopObs) p._wvRefsPopObs.mo.disconnect(); delete p._wvRefsPopObs; delete p._wvRefsSig; } catch (e) {}
            }
            for (const el of doc.querySelectorAll("." + CTL_CLASS + ", .wv-refs-row-mark, .wv-refs-pcard, .wv-refs-hcard")) el.remove();
            for (const row of doc.querySelectorAll(".reference-row")) this._wvRefsRowText(row, null);
            try { const s = refsHover.get(reader); if (s) { const w = doc.defaultView; if (s.showT) w.clearTimeout(s.showT); if (s.hideT) w.clearTimeout(s.hideT); refsHover.delete(reader); } } catch (e) {}
            wvRemoveStyle(doc, STYLE_ID);
            wvRemoveStyle(doc, CARD_STYLE_ID);
        } catch (e) {}
    }

    /** The observer's batch: a citation popup that appeared, or rows React
     *  put in one again. */
    _wvRefsOnMutations(reader: any, muts: any) {
        const pops: any[] = [];
        let views = false;
        for (const m of muts) {
            // A view's frame in a view container: the reader made its views
            // again -- reload() after Delete Page / Rotate Page
            // (xpcom/reader.js), a split.
            const tid = m.target && m.target.id;
            const inView = tid === "primary-view" || tid === "secondary-view";
            for (const node of m.addedNodes) {
                if (!node || node.nodeType !== 1) continue;
                if (inView) { if (node.localName === "iframe") views = true; continue; }
                const cl = node.classList;
                if (cl && (cl.contains(CTL_CLASS) || cl.contains("wv-refs-row-mark") || cl.contains("wv-refs-pcard") || cl.contains("wv-refs-hcard"))) continue;
                let pop: any = null;
                if (cl && cl.contains("citation-popup")) pop = node;
                else if (cl && (cl.contains("reference-row") || cl.contains("inner"))) pop = node.closest(".citation-popup");
                else if (node.firstElementChild && typeof node.querySelector === "function") pop = node.querySelector(".citation-popup");
                if (pop && pops.indexOf(pop) < 0) pops.push(pop);
            }
        }
        for (const pop of pops) this._wvRefsDecorate(reader, pop);
        // New views: the paper's file may have changed under them (a page
        // deleted or rotated: the reader reloads), and they hold no marks
        // yet. The list is checked against the file (_wvRefsPrepare) and the
        // marks drawn in them, once the burst has settled.
        if (views) {
            try {
                wvClearTimeout(reader._wvRefsViewT);
                reader._wvRefsViewT = wvTimeout(() => {
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsViewsChanged(reader);
                }, 300);
            } catch (e) {}
        }
        // Reading Mode on or off (the reader UI redraws its toolbar and views):
        // the reference list's marks follow, soon after.
        try {
            const rm = !!this._wvReadingModeActive(reader);
            if (reader._wvRefsRm !== undefined && reader._wvRefsRm !== rm) {
                wvClearTimeout(reader._wvRefsRmT);
                reader._wvRefsRmT = wvTimeout(() => {
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsMarksDraw(reader);
                }, 300);
            }
            reader._wvRefsRm = rm;
        } catch (e) {}
    }

    /** Does `reader` show a primary or secondary view this module has not
     *  seen yet? Each one is stamped as seen (an expando on the view object,
     *  which goes with the view: nothing here holds a view). */
    _wvRefsNewViews(reader: any): boolean {
        let fresh = false;
        try {
            const ir = Cu().waiveXrays(reader._internalReader);
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView]) {
                if (!v || v._wvRefsSeen) continue;
                v._wvRefsSeen = true;
                fresh = true;
            }
        } catch (e) {}
        return fresh;
    }

    /** The reader made new views (_wvRefsOnMutations): the list checked
     *  against the file -- read again, with the section, when it changed --
     *  then the marks drawn in every view (a view that has them keeps them). */
    _wvRefsViewsChanged(reader: any) {
        if (!this._wvRefsOn() || !reader) return;
        // Only when the reader's views themselves are new (a reload, a split):
        // the frames Zotero adds for Reading Mode and its structure data go in
        // the same containers and change nothing here -- reacting to them (a
        // stat, a marks pass) upset the link previews being drawn meanwhile
        // (preview-entry-highlight.spec.js, red three times in a row).
        if (!this._wvRefsNewViews(reader)) return;
        // After the paper's first drawn page, as the wiring's own read: the reader's
        // first view arrives after the wiring and came here at once, before page 1
        // (work/refs-perf-2026-11-20.md "dev.42", 963-1026 ms into every open).
        this._wvRefsAfterFirstPaint(reader, () => {
            const lp: any = wvLivePlugin();
            if (!lp || !lp._wvRefsOn()) return;
            lp._wvRefsPrepare(reader).then(() => {
                const l2: any = wvLivePlugin();
                if (!l2) return;
                l2._wvRefsMarksDraw(reader);
                l2._wvRefsBesideApply(reader);
            }, () => {});
        });
    }

    /** The overlay a popup element shows: the reader state's popup (primary
     *  or secondary view) of type citation whose references are its rows. */
    _wvRefsPopupState(reader: any, rowCount: number): { view: "primary" | "secondary"; refs: any[]; rect: number[] | null } | null {
        try {
            const ir = Cu().waiveXrays(reader._internalReader);
            const st = ir && ir._state;
            if (!st) return null;
            for (const view of ["primary", "secondary"] as const) {
                const p = st[view + "ViewOverlayPopup"];
                if (!p || p.type !== "citation" || !p.references) continue;
                const n = num(p.references.length);
                if (n !== rowCount) continue;
                const refs: any[] = [];
                for (let i = 0; i < n; i++) refs.push(p.references[i]);
                let rect: number[] | null = null;
                try { if (p.rect && num(p.rect.length) >= 4) rect = [0, 1, 2, 3].map((k) => Number(p.rect[k])); } catch (e) {}
                return { view, refs, rect };
            }
        } catch (e) {}
        return null;
    }

    /** Is Zotero's own smart reference popup (zotero#5191) there? */
    _wvRefsSmartPopup(pop: any): boolean {
        try {
            if ((Zotero as any).RecognizeReference) return true;
            return !!(pop && pop.querySelector(".reference-row > .start"));
        } catch (e) { return false; }
    }

    /** Mark the rows of the citation popup `pop` and give them their buttons. */
    _wvRefsDecorate(reader: any, pop: any) {
        const P: any = this;
        let h0 = -1;
        let rect: number[] | null = null;
        try {
            if (!pop || !pop.isConnected) return;
            h0 = pop.offsetHeight;
            const rows = Array.from(pop.querySelectorAll(".reference-row")) as any[];
            if (!this._wvRefsOn()) { for (const r of rows) { this._wvRefsRowSet(reader, r, null, null); this._wvRefsRowText(r, null); this._wvRefsPopupCard(reader, r, null); } return; }
            const st = this._wvRefsPopupState(reader, rows.length);
            if (!st) return;
            rect = st.rect;
            const refs = st.refs.map((r: any) => refsRefShape(r));
            // Before anything is changed: the popup's own observer sees these changes too.
            pop._wvRefsSig = refsPopupSig(refs);
            this._wvRefsPopupWatch(reader, pop);
            // The entry's number apart and bold, as in the section (MJT 2026-11-20).
            rows.forEach((row: any, i: number) => {
                const en: any = this._wvRefsEntryAt(reader, refs[i]);
                this._wvRefsRowText(row, en && en.label ? String(en.label) : "");
            });
            const hits = this._wvRefsHitsFor(reader, refs);
            const smart = this._wvRefsSmartPopup(pop);
            let waiting = false;
            rows.forEach((row: any, i: number) => {
                const h = hits[i];
                if (h === undefined) { waiting = true; return; }
                // Not in your libraries: the globe (Open in Browser), with the
                // paper's entry when the row is one (its whole text, its link).
                const web = h ? null : this._wvRefsEntryAt(reader, refs[i]);
                this._wvRefsRowSet(reader, row, h, { view: st.view, smart }, web);
            });
            // The reference's card: in the popup itself for ONE reference (the two popups
            // merged), on a row's hover for several (MJT 2026-11-20). Zotero's own smart
            // popup (zotero#5191) draws its rows itself.
            const one = rows.length === 1 && !smart ? (hits[0] || null) : null;
            for (const row of rows) this._wvRefsPopupCard(reader, row, one);
            if (rows.length > 1 && !smart) for (const row of rows) this._wvRefsRowHoverWire(reader, row);
            // Not known yet: decorate again once the index and the paper's
            // list are there, if the popup is still up -- once per popup (an
            // index that cannot be read must not loop).
            if ((waiting || !(P._wvRefsEntriesNow && P._wvRefsEntriesNow.has(reader.itemID))) && !pop._wvRefsKicked) {
                pop._wvRefsKicked = true;
                Promise.all([this._wvRefsIndexEnsure(), this._wvRefsPrepare(reader)]).then(() => {
                    const lp: any = wvLivePlugin();
                    if (lp && pop.isConnected) lp._wvRefsDecorate(reader, pop);
                }, () => {});
            }
        } catch (e) { Zotero.debug("[Weavero] references decorate err: " + e); }
        // What the decoration added, before the paint: placed as Zotero will place it
        // (refsPopupPlace), else kept where it is (refsPopupKeepPlace).
        if (h0 >= 0 && pop && pop.isConnected && pop.offsetHeight !== h0) {
            if (!refsPopupPlace(pop, rect)) refsPopupKeepPlace(pop, h0);
        }
    }

    /** React keeps an open citation popup, and its rows, when the pointer goes on to
     *  another citation: only their contents change, and the reader's observer
     *  (_wvRefsOnMutations) sees no popup or row added. The row kept the previous
     *  citation's mark and card -- [13] showed [14]'s mark and no card after
     *  [14,18,19] (MJT 2026-11-20, "Why do I get this without the Weavero part
     *  below?"). The popup is decorated again when the references it shows change;
     *  Weavero's own changes leave them as they are and cost one comparison. */
    _wvRefsPopupWatch(reader: any, pop: any) {
        try {
            const tag = (this as any)._wvWireTag();
            const had = pop._wvRefsPopObs;
            if (had && had.tag === tag) return;
            if (had) { try { had.mo.disconnect(); } catch (e) {} }
            const win = pop.ownerDocument.defaultView;
            const mo = new win.MutationObserver(() => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag || !pop.isConnected) { mo.disconnect(); return; }
                    const st = lp._wvRefsPopupState(reader, pop.querySelectorAll(".reference-row").length);
                    if (!st || refsPopupSig(st.refs.map((r: any) => refsRefShape(r))) === pop._wvRefsSig) return;
                    lp._wvRefsDecorate(reader, pop);
                } catch (e) {}
            });
            mo.observe(pop, wvCloneFor({ childList: true, subtree: true, characterData: true }, win));
            pop._wvRefsPopObs = { mo, tag };
        } catch (e) {}
    }

    /** A popup row's text with the entry's number apart: bold, then one space,
     *  as the section's rows (MJT 2026-11-20, "make the number in bold and add
     *  the space after it in the popup, same as in the item pane"). Zotero's
     *  row is React's (reference/common/formated-text.js: a div of spans built
     *  from the reference's characters, the number glued to the text): its text
     *  nodes are never touched -- React keeps them and writes them again. It is
     *  hidden (`wv-refs-row-fmt`) and a copy shown, its number split off; a link
     *  clicked in the copy is the hidden link's click, so React's own handler
     *  opens it. The copy follows React's text (an observer of it: a popup for
     *  another citation reuses the row). `label`: the entry's number as the
     *  paper prints it (the paper's list, _wvRefsEntryAt) -- no number guessed
     *  from the text; null takes the copy away. */
    _wvRefsRowText(row: any, label: string | null) {
        try {
            const src: any = Array.from(row.children).find((c: any) => c.localName === "div" && !c.hasAttribute("class"));
            const old: any = row.querySelector(":scope > .wv-refs-rowtext");
            const off = () => { if (old) old.remove(); row.classList.remove("wv-refs-row-fmt"); };
            // `label` null: the feature off (the copy goes); "" : no number to set apart
            // (a copy only for the text's links).
            if (!src || label === null) { off(); if (src && src._wvRefsObs) { try { src._wvRefsObs.disconnect(); } catch (e) {} src._wvRefsObs = null; } return; }
            row._wvRefsLabel = label;
            const build = () => {
                try {
                    const lab = String(row._wvRefsLabel || "");
                    const text = String(src.textContent || "");
                    const cur: any = row.querySelector(":scope > .wv-refs-rowtext");
                    const lead = text.length - text.replace(/^\s+/, "").length;
                    const numbered = !!lab && text.slice(lead).startsWith(lab);
                    const lp: any = wvLivePlugin();
                    let re: RegExp | null = null;
                    try { re = lp ? lp.URL_REGEX : null; } catch (e) {}
                    if (!numbered && !refsUrlsIn(re, text).length) { if (cur) cur.remove(); row.classList.remove("wv-refs-row-fmt"); return; }
                    if (cur && cur._wvRefsSrc === text + "|" + lab) return;
                    const doc = row.ownerDocument;
                    const copy: any = src.cloneNode(true);
                    copy.className = "wv-refs-rowtext";
                    if (numbered) {
                        // The number's characters out of the copy's first text nodes, then
                        // the spaces after it.
                        let cut = lead + lab.length;
                        let trim = true;
                        const walker = doc.createTreeWalker(copy, 4);   // NodeFilter.SHOW_TEXT
                        for (let n: any = walker.nextNode(); n && trim; n = walker.nextNode()) {
                            let v = String(n.nodeValue || "");
                            const k = Math.min(cut, v.length);
                            v = v.slice(k);
                            cut -= k;
                            if (cut <= 0) { const t = v.replace(/^\s+/, ""); if (t.length) trim = false; v = t; }
                            n.nodeValue = v;
                        }
                        const sp = wvHtmlEl(doc, "span", "wv-refs-row-label", lab);
                        copy.insertBefore(doc.createTextNode(" "), copy.firstChild);
                        copy.insertBefore(sp, copy.firstChild);
                    }
                    refsLinkify(re, copy);
                    copy._wvRefsSrc = text + "|" + lab;
                    // A link of Zotero's: the hidden one's click (React's handler,
                    // onOpenLink); one Weavero found in the text: opened by Weavero.
                    copy.addEventListener("click", (e: any) => {
                        try {
                            const a = e.target && e.target.closest ? e.target.closest("a") : null;
                            if (!a) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const url = a.getAttribute("data-wv-url");
                            if (url) {
                                const l2: any = wvLivePlugin();
                                if (l2) l2._launchURL(url);
                                return;
                            }
                            const twin = src.querySelectorAll("a")[Array.from(copy.querySelectorAll("a:not([data-wv-url])")).indexOf(a)];
                            if (twin) twin.click();
                        } catch (er) {}
                    }, true);
                    if (cur) cur.replaceWith(copy); else src.after(copy);
                    row.classList.add("wv-refs-row-fmt");
                } catch (e) {}
            };
            build();
            if (!src._wvRefsObs) {
                const win = row.ownerDocument.defaultView;
                const mo = new win.MutationObserver(() => build());
                mo.observe(src, wvCloneFor({ childList: true, subtree: true, characterData: true }, win));
                src._wvRefsObs = mo;
            }
        } catch (e) { Zotero.debug("[Weavero] references row text err: " + e); }
    }

    /** One row: its controls for `hit` (null: none, or the globe alone when
     *  `web` -- the reference's entry -- is given: Open in Browser), rebuilt
     *  only when what they show changes. */
    _wvRefsRowSet(reader: any, row: any, hit: WvRefsHit | null, opts: { view: string; smart: boolean } | null, web?: WvRefsEntry | null) {
        const P: any = this;
        const old = row.querySelector(":scope > ." + CTL_CLASS);
        // The mark is the row's own child, at its start (MJT 2026-11-20); it goes and
        // comes with the controls.
        const clear = () => {
            if (old) old.remove();
            for (const m of Array.from(row.querySelectorAll(":scope > .wv-refs-row-mark")) as any[]) m.remove();
        };
        if (!opts || (!hit && !web)) { clear(); return; }
        const canSplit = this._wvRefsCanSplit(reader);
        const acts: string[] = [];
        // With Zotero's own smart popup (zotero#5191) a row it does not know
        // keeps what Zotero gives it.
        if (!hit) { if (!opts.smart) acts.push("web"); }
        // Split before Window (MJT 2026-11-20, "Open in split view should be before the open in new window").
        else if (opts.smart) { if (hit.pdf && canSplit) acts.push("split"); if (hit.pdf) acts.push("window"); }
        // Copy As in place of a ⋯: Show in Library is the card's library names (one click),
        // the open entries are these buttons -- a ⋯ held two entries two steps away (MJT
        // 2026-11-20, "The Show in Library and Copy As options are too many steps away").
        else if (hit.pdf) { acts.push("tab"); if (canSplit) acts.push("split"); acts.push("window", "copy"); }
        else acts.push("library", "copy");
        if (!acts.length) { clear(); return; }
        const sig = (hit ? hit.ids.join(",") + "|" + (hit.pdf ? 1 : 0) + "|" + (hit.amb ? hit.amb.join(",") : "") : "web|" + (web!.url || "") + "|" + web!.text.length) + "|" + acts.join(",") + "|" + opts.view;
        if (old && old.getAttribute("data-wv-refs-sig") === sig && (opts.smart || row.querySelector(":scope > .wv-refs-row-mark"))) return;
        clear();
        const doc = row.ownerDocument;
        const ctl = doc.createElement("span");
        ctl.className = CTL_CLASS;
        ctl.setAttribute("data-wv-refs-sig", sig);
        ctl.setAttribute("data-wv-refs-ids", hit ? hit.ids.join(",") : "");
        ctl.setAttribute("data-wv-refs-view", opts.view);
        if (!hit && web) {
            ctl.setAttribute("data-wv-refs-web-text", web.text);
            if (web.url) ctl.setAttribute("data-wv-refs-web-url", web.url);
        }
        // Every row its mark, a reference you do not have the grey ring (MJT
        // 2026-11-20); Zotero's own smart popup marks its rows itself. It sits at the
        // row's start, before the number, as in the References section and the PDF's
        // margin, and says where the reference is without acting: the row is in a
        // popup already, its buttons on hover are the quick way (MJT 2026-11-20, "I
        // would remove the popup from the circles, in the citation popup and in the
        // item pane"). Only the PDF's margin marks act -- a click there is the whole
        // menu, to keep the page itself quiet.
        let mark: any = null;
        if (!opts.smart) {
            mark = doc.createElement("span");
            mark.className = "wv-refs-mark wv-refs-row-mark";
            mark.setAttribute("title", this._wvRefsMarkTip(reader, hit, web || null, undefined, true));
            drawMark(doc, mark, refsHitKind(hit), { width: 10, height: 10 }, hit ? this._wvRefsBadge(hit) : null, !!(hit && hit.amb));
        }
        for (const a of acts) {
            const b = doc.createElement("span");
            b.className = "wv-refs-btn";
            b.setAttribute("role", "button");
            b.setAttribute("data-wv-refs-act", a);
            if (a === "copy") {
                // The items list's Copy As: its words, its icon (the plugin's mark, a data:
                // image -- the reader's page loads those, not chrome:// ones).
                b.setAttribute("title", wvStr("weavero-menu-copy-as", null, "label"));
                const icon = P._menuItemIconURL;
                if (icon) { const im = wvHtmlEl(doc, "img", "wv-refs-btn-img", undefined, b); im.setAttribute("src", icon); im.setAttribute("alt", ""); }
                ctl.appendChild(b);
                continue;
            }
            b.setAttribute("title", a === "web" ? this._wvRefsWebTip(reader, web!) : wvStr("weavero-refs-act-" + a, null, "title"));
            const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16 }, b);
            for (const [tagName, attrs] of (a === "library" ? libIcon(hit && hit.ids[0]) : ICONS[a]) || []) wvSvgEl(doc, tagName, attrs, svg);
            ctl.appendChild(b);
        }
        // FocusManager cancels presses in reader.html (src-ts.md): the press
        // itself acts. The handler resolves the live plugin when it fires.
        const press = (ev: any) => {
            try {
                if (ev.button !== 0) return;
                const btn = ev.target && ev.target.closest ? ev.target.closest(".wv-refs-btn") : null;
                ev.preventDefault();
                ev.stopPropagation();
                if (!btn) return;
                const lp: any = wvLivePlugin();
                if (!lp) return;
                if (btn.getAttribute("data-wv-refs-act") === "web") {
                    const entry = { text: String(ctl.getAttribute("data-wv-refs-web-text") || ""), rects: [], url: ctl.getAttribute("data-wv-refs-web-url") || undefined };
                    const view = String(ctl.getAttribute("data-wv-refs-view"));
                    const p = lp._wvRefsWebOpen(reader, entry, btn);
                    if (p && typeof p.then === "function") p.then((t: any) => { if (t) { const l2: any = wvLivePlugin(); if (l2) l2._wvRefsClosePopup(reader, view); } }, () => {});
                    return;
                }
                const ids = String(ctl.getAttribute("data-wv-refs-ids") || "").split(",").map(Number).filter((x) => x > 0);
                const act = String(btn.getAttribute("data-wv-refs-act"));
                // Copy As: its choices at once (_wvRefsCopyAsMenu).
                if (act === "copy") { lp._wvRefsHoverCardHide(reader, true); lp._wvRefsCopyAsMenu(reader, ids, btn); return; }
                const p = lp._wvRefsAct(reader, act, ids, String(ctl.getAttribute("data-wv-refs-view")), btn);
                if (p && typeof p.catch === "function") p.catch((e: any) => Zotero.debug("[Weavero] references act err: " + e));
            } catch (e) {}
        };
        ctl.addEventListener("pointerdown", press, true);
        // React's own children stay after them: the controls are the row's first
        // child, the mark its second. No class on the row itself (React owns its
        // className): the row's indent keys on :has(> .wv-refs-row-mark).
        row.insertBefore(ctl, row.firstChild);
        if (mark) row.insertBefore(mark, ctl.nextSibling);
    }

    /** A reference's card drawn in the reader's page (the citation popup's own row, or the
     *  hover card beside it): _wvRefsCard on the reader's document, its menu-only parts
     *  out (the graphical abstract loads through the menu), "More" once laid out. */
    _wvRefsPageCard(reader: any, doc: any, hit: WvRefsHit, view: string): any {
        try {
            const items = hit.ids.map((id: number) => { try { return Zotero.Items.get(id); } catch (e) { return null; } }).filter((x: any) => x);
            if (!items.length) return null;
            let citingLib: number | null = null;
            try { const a = Zotero.Items.get(reader.itemID); citingLib = a ? a.libraryID : null; } catch (e) {}
            wvInjectStyle(doc, CARD_STYLE_ID, CARD_CSS);
            // A library's name shows the copy there; the popup goes, as a button's act does.
            const card = this._wvRefsCard(doc, items[0], items, citingLib, (copy: any) => {
                const lp: any = wvLivePlugin();
                if (!lp) return;
                lp._wvRefsHoverCardHide(reader, true);
                lp._wvRefsClosePopup(reader, view);
                return lp._wvRefsShowInLibrary(copy, lp._wvRefsHostWin(reader));
            });
            if (!card) return null;
            const ga = card.querySelector(".wv-refs-card-ga");
            if (ga) ga.remove();
            return card;
        } catch (e) { Zotero.debug("[Weavero] references page card err: " + e); return null; }
    }

    /** ONE reference in the citation popup: its card in the row, under Zotero's own text
     *  (the citation as the PDF prints it, kept on top to check the match against: MJT
     *  2026-11-20, "I would still keep the Zotero popup at the top"), and the row's buttons
     *  under it, always shown: the popup and the ⋯ menu's card were two popups for one
     *  thing (MJT 2026-11-20, "For a single citation, I would still merge these 2 popups
     *  into one"). `hit` null takes it away (several references, none known, Weavero off). */
    _wvRefsPopupCard(reader: any, row: any, hit: WvRefsHit | null) {
        try {
            const old: any = row && row.querySelector(":scope > .wv-refs-pcard");
            if (!row || !hit || !hit.ids || !hit.ids.length) { if (old) old.remove(); return; }
            const sig = hit.ids.join(",") + "|" + (hit.pdf ? 1 : 0);
            if (old && old.getAttribute("data-wv-refs-sig") === sig) return;
            const doc = row.ownerDocument;
            const ctl = row.querySelector(":scope > ." + CTL_CLASS);
            const card = this._wvRefsPageCard(reader, doc, hit, ctl ? String(ctl.getAttribute("data-wv-refs-view") || "primary") : "primary");
            if (old) old.remove();
            if (!card) return;
            const box = wvHtmlEl(doc, "div", "wv-refs-pcard");
            box.setAttribute("data-wv-refs-sig", sig);
            box.appendChild(card);
            row.appendChild(box);
            // In this task, before the paint: the height is final when the decoration
            // keeps the popup's place (refsPopupKeepPlace).
            refsCardMoreNow(card);
        } catch (e) { Zotero.debug("[Weavero] references popup card err: " + e); }
    }

    /** Several references in the citation popup: a row's card beside the popup once the
     *  pointer rests on the row (the bookmark and link cards' rest, BL_CARD_DELAY's
     *  450 ms), gone when it leaves row and card. Wired once per row element; the
     *  handlers resolve the live plugin and read the row's current reference when they
     *  fire (React reuses a row for another citation). */
    _wvRefsRowHoverWire(reader: any, row: any) {
        try {
            if (refsHoverWired.has(row)) return;
            refsHoverWired.add(row);
            const win = row.ownerDocument.defaultView;
            row.addEventListener("mouseenter", () => {
                try {
                    const st = refsHoverOf(reader);
                    if (st.hideT) { win.clearTimeout(st.hideT); st.hideT = null; }
                    if (st.showT) win.clearTimeout(st.showT);
                    st.showT = win.setTimeout(() => {
                        st.showT = null;
                        const lp: any = wvLivePlugin();
                        if (lp && row.isConnected) lp._wvRefsHoverCardShow(reader, row);
                    }, 450);
                } catch (e) {}
            });
            row.addEventListener("mouseleave", () => {
                try {
                    const st = refsHoverOf(reader);
                    if (st.showT) { win.clearTimeout(st.showT); st.showT = null; }
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsHoverCardHide(reader, false);
                } catch (e) {}
            });
        } catch (e) {}
    }

    _wvRefsHoverCardShow(reader: any, row: any) {
        try {
            const pop = row.closest(".citation-popup");
            if (!pop || pop.querySelectorAll(".reference-row").length < 2) return;
            const ctl = row.querySelector(":scope > ." + CTL_CLASS);
            const ids = ctl ? String(ctl.getAttribute("data-wv-refs-ids") || "").split(",").map(Number).filter((x: number) => x > 0) : [];
            const st = refsHoverOf(reader);
            if (!ids.length) { this._wvRefsHoverCardHide(reader, true); return; }
            const key = ids.join(",");
            if (st.card && st.card.isConnected && st.key === key) return;
            this._wvRefsHoverCardHide(reader, true);
            const doc = row.ownerDocument;
            const card = this._wvRefsPageCard(reader, doc, { ids, pdf: false } as any, String(ctl.getAttribute("data-wv-refs-view") || "primary"));
            if (!card) return;
            const box = wvHtmlEl(doc, "div", "wv-refs-hcard");
            box.appendChild(card);
            // Inside the popup, so it goes with it; placed beside it (the popup is moved
            // by a transform: its box is the containing block).
            pop.appendChild(box);
            refsCardMoreNow(card);
            const win = doc.defaultView;
            const pr = pop.getBoundingClientRect();
            const rr = row.getBoundingClientRect();
            const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
            const w = box.getBoundingClientRect().width || 360;
            const right = pr.right + 8 + w <= vw - 4 || pr.left - 8 - w < 4;
            box.style.left = (right ? pr.width + 8 : -(w + 8)) + "px";
            const h = box.getBoundingClientRect().height;
            let top = rr.top - pr.top;
            top = Math.min(top, vh - 8 - h - pr.top);
            top = Math.max(top, 8 - pr.top);
            box.style.top = top + "px";
            box.addEventListener("mouseenter", () => { const s = refsHoverOf(reader); if (s.hideT) { win.clearTimeout(s.hideT); s.hideT = null; } });
            box.addEventListener("mouseleave", () => { const lp: any = wvLivePlugin(); if (lp) lp._wvRefsHoverCardHide(reader, false); });
            st.card = box;
            st.key = key;
        } catch (e) { Zotero.debug("[Weavero] references hover card err: " + e); }
    }

    /** The hover card away: at once (`now`), or after a moment the pointer may spend
     *  crossing from the row into the card. */
    _wvRefsHoverCardHide(reader: any, now: boolean) {
        try {
            const st = refsHoverOf(reader);
            const card = st.card;
            if (!card) return;
            const win = card.ownerDocument && card.ownerDocument.defaultView;
            const go = () => { try { card.remove(); } catch (e) {} if (st.card === card) { st.card = null; st.key = ""; } };
            if (st.hideT && win) { win.clearTimeout(st.hideT); st.hideT = null; }
            if (now || !win) { go(); return; }
            st.hideT = win.setTimeout(() => { st.hideT = null; go(); }, 250);
        } catch (e) {}
    }

    /** Split can apply: the split view on, and `reader` a tab of a main window --
     *  or the library's item pane of a main window (a stand-in, `wvLib`: refs.ts
     *  _wvRefsLibCtx, cited-by.ts _wvCbSecCtx), whose Split opens beside the
     *  library tab (citations.6, MJT 2026-11-21 "OK"). */
    _wvRefsCanSplit(reader: any): boolean {
        const P: any = this;
        try {
            const win = reader && reader._window;
            if (!(win && win.Zotero_Tabs && P._wvTabSplitOn && P._wvTabSplitOn())) return false;
            if (reader.wvLib) return true;
            return !!(reader.tabID && win.Zotero_Tabs._tabs.some((t: any) => t && t.id === reader.tabID));
        } catch (e) { return false; }
    }

    /** The library tab a library-pane gesture comes from: the tab of the deck
     *  holding `from` (open-where.ts _wvOpenSourceTab, as Ctrl+Enter in the items
     *  list finds it; one per library tab on zotero#6035), else the selected tab
     *  when it is a library tab, else Zotero's own. */
    _wvRefsLibTabOf(win: any, from?: any): string {
        const P: any = this;
        const Z = win && win.Zotero_Tabs;
        const isLib = (id: any) => {
            if (!id || !Z) return false;
            if (wvIsLibraryTabID(id)) return true;
            const t = Z._tabs.find((x: any) => x && x.id === id);
            return !!t && /^library(-|$)/.test(String(t.type || ""));
        };
        try {
            const id = from && from.nodeType && typeof P._wvOpenSourceTab === "function" ? P._wvOpenSourceTab(win, from) : null;
            if (isLib(id)) return id;
            if (Z && isLib(Z.selectedID)) return Z.selectedID;
        } catch (e) {}
        return "zotero-pane";
    }

    /** The name of the library item `id` is in ("" when unknown). */
    _wvRefsLibName(id: number): string {
        try {
            const it = Zotero.Items.get(id);
            const lib = it && Zotero.Libraries.get(it.libraryID);
            return lib ? String(lib.name || "") : "";
        } catch (e) { return ""; }
    }

    /** The badge on a hit's mark: when no copy is in the citing paper's
     *  library, the library its best copy is in -- "group" (the tab strip's
     *  teal temple) or "user" (My Library's blue one) -- and its name. Null
     *  when a copy is in the citing paper's library: the plain ● / ○. */
    _wvRefsBadge(hit: WvRefsHit | null): { kind: "user" | "group"; name: string } | null {
        try {
            if (!hit || hit.away == null) return null;
            const lib = Zotero.Libraries.get(hit.away);
            const t = lib && lib.libraryType;
            if (t !== "user" && t !== "group") return null;
            return { kind: t, name: String(lib.name || "") };
        } catch (e) { return null; }
    }

    /** A mark's tooltip, ONE per kind on every surface -- the PDF's margin, the
     *  popup's rows, the References rows (MJT 2026-11-20): a dot says where the
     *  reference is and that a click opens its menu (weavero-refs-bibmark); the
     *  grey ring, what a click opens online (weavero-refs-web-tip, the globe's
     *  too). `entry`: the reference's entry, for the ring. */
    _wvRefsMarkTip(reader: any, hit: WvRefsHit | null, entry: WvRefsEntry | null, selfDOIs?: string[], statusOnly?: boolean): string {
        const tip = hit ? wvStr("weavero-refs-bibmark", this._wvRefsMarkArgs(hit), "title") : this._wvRefsWebTip(reader, entry || { text: "", rects: [] }, selfDOIs);
        // A mark that does not act (a popup row's, a References row's: the row's buttons
        // act there, MJT 2026-11-20) says where the reference is and no more: the
        // message's first line, every locale writing what a click does on a line of its
        // own after it (weavero-refs-bibmark, weavero-refs-web-tip).
        const head = statusOnly ? tip.split("\n")[0] : tip;
        // An ambiguous reference (refkeys.1): the works it could be, after the status line
        // and before what a click does -- on every surface.
        const amb = this._wvRefsUncertainTip(hit);
        if (!amb) return head;
        const lines = head.split("\n");
        lines.splice(1, 0, amb);
        return lines.join("\n");
    }

    /** The lines an ambiguous reference's mark adds to its tooltip (refkeys.1, 2026-11-24):
     *  that several items of the libraries could be this reference, then each work -- its
     *  title, Zotero's name of its item type, its year -- the one the row shows first.
     *  From the library index (the items need not be loaded: a group's are not at start);
     *  "" when the hit is not ambiguous. */
    _wvRefsUncertainTip(hit: WvRefsHit | null): string {
        if (!hit || !hit.amb || hit.amb.length < 2) return "";
        const ix: WvRefIndex | null = (this as any)._wvRefsIx || null;
        const lines = [wvStr("weavero-refs-uncertain", null, null)];
        for (const id of hit.amb) {
            const r = ix ? wvRefIndexGet(ix, id) : null;
            if (!r) continue;
            let type = r.type;
            try { if (r.type) type = String(Zotero.ItemTypes.getLocalizedString(r.type) || r.type); } catch (e) {}
            lines.push(wvStr("weavero-refs-uncertain-item", { title: r.title, type, year: r.year || "none" }, null));
        }
        return lines.length > 2 ? lines.join("\n") : "";
    }

    /** A grey ring's tip in the PDF as lines (reader.ts _wvExtTipShow draws them
     *  in the URL tip): weavero-refs-web-tip's lines, the one that is the link the
     *  click opens marked to be drawn in the Weavero link colour (MJT 2026-11-20,
     *  "Put the tooltip on different lines. Color the link in the same color as the
     *  Weavero links"). Null when the ring's entry is not known. */
    _wvRefsWebTipLines(reader: any, mark: any): Array<{ text: string; link?: boolean | string }> | null {
        try {
            const d = this._wvRefsDocRows(reader);
            const row = d && d.rows.find((x: any) => String(x.i) === String(mark.getAttribute("data-wv-refs-entry")));
            if (!row) return null;
            const selfDOIs = this._wvRefsSelfDOIs(reader);
            const own = wvRefWebOwnLink(row.entry.text, row.entry.url, selfDOIs);
            // Fluent's isolation marks around the placeable go: the line compares to the URL.
            const text = this._wvRefsWebTip(reader, row.entry, selfDOIs).replace(/[⁨⁩]/g, "");
            // The link inside its line ("Click to open in your browser: <link>", MJT
            // 2026-11-20, "Keep the link on the same line"): `link` names the part to colour.
            return text.split("\n").filter((l: string) => l.trim()).map((l: string) => ({ text: l, link: own && l.indexOf(own.url) >= 0 ? own.url : undefined }));
        } catch (e) { return null; }
    }

    /** A mark's tooltip arguments (weavero-refs-bibmark):
     *  $where "other" with the badge's library and how many more hold a
     *  copy, else "here" with the best copy's library; $file, the kind of
     *  file the best copy has -- an EPUB counts as a PDF for the dot, and the
     *  tooltip names it (MJT 2026-11-20, "Is the text of the tooltip
     *  automatically adjusted in that case?"). */
    _wvRefsMarkArgs(hit: WvRefsHit): { pdf: string; file: string; where: string; library: string; others: number } {
        const b = this._wvRefsBadge(hit);
        let file = "pdf";
        if (hit.pdf) { try { file = refsDocType(Zotero.Items.get(hit.ids[0])); } catch (e) {} }
        // Away from the citing paper's library: every library holding a copy, named
        // ("Only in My Library and Dome Over"), not one name and a count.
        let library = b ? b.name : this._wvRefsLibName(hit.ids[0]);
        if (b) {
            const libs: number[] = [];
            for (const id of hit.ids) { try { const it = Zotero.Items.get(id); if (it) libs.push(it.libraryID); } catch (e) {} }
            library = refsLibNames(libs) || library;
        }
        return {
            pdf: hit.pdf ? "yes" : "no",
            file,
            where: b ? "other" : "here",
            library,
            others: 0,
        };
    }

    /** The main window (with tabs) `reader` is in, else Zotero's main window. */
    _wvRefsHostWin(reader: any): any {
        try {
            const w = reader && reader._window;
            if (w && w.Zotero_Tabs) return w;
        } catch (e) {}
        return Zotero.getMainWindow();
    }

    /** Close the citation popup of `reader`'s view `view` (Zotero's own path:
     *  the view's popup callback with nothing). */
    _wvRefsClosePopup(reader: any, view: string) {
        try {
            const ir = Cu().waiveXrays(reader._internalReader);
            const v = view === "secondary" ? ir._secondaryView : ir._primaryView;
            if (v && typeof v._onSetOverlayPopup === "function") v._onSetOverlayPopup(null);
        } catch (e) {}
    }

    /** A row's button: `act` on the copies `ids` (best first). */
    async _wvRefsAct(reader: any, act: string, ids: number[], view: string, btn?: any): Promise<boolean> {
        const P: any = this;
        let item: any = null;
        try { item = ids.length ? Zotero.Items.get(ids[0]) : null; } catch (e) { item = null; }
        if (!item) return false;
        if (act === "more") { this._wvRefsMenu(reader, ids, view, btn); return true; }
        this._wvRefsClosePopup(reader, view);
        const win = this._wvRefsHostWin(reader);
        if (act === "library") return this._wvRefsShowInLibrary(item, win);
        // An attachment named itself (the menu's grid and its rows of the cited
        // item's documents) opens through the links' check (url.ts
        // _wvMayOpenAttachment): a document the reader shows passes at once; one
        // the user sends to another viewer is refused when its name runs a program.
        if (!(await P._wvMayOpenAttachment(item, win))) return false;
        if (!(await this._wvRefsEnsureFile(item))) return false;
        if (act === "tab") return this._wvRefsOpenTab(item, win);
        if (act === "window") {
            const spec = await P._wvOpenSpecOf(item);
            if (!spec || spec.kind !== "reader") return this._wvRefsShowInLibrary(item, win);
            return !!(await P._wvOpenSpecWhere(win, spec, "window"));
        }
        if (act === "split") return this._wvRefsSplit(reader, item, btn);
        return false;
    }

    async _wvRefsShowInLibrary(item: any, win: any): Promise<boolean> {
        const P: any = this;
        try {
            const link = P._buildSelectLink(item);
            if (!link) return false;
            await P.handleZoteroURI(link, { win });
            return true;
        } catch (e) { Zotero.debug("[Weavero] references show err: " + e); return false; }
    }

    /** The cited document in a tab of `win`, selected: an open one reused. */
    async _wvRefsOpenTab(item: any, win: any): Promise<boolean> {
        const P: any = this;
        try {
            const spec = await P._wvOpenSpecOf(item);
            if (!spec || spec.kind !== "reader") return this._wvRefsShowInLibrary(item, win);
            const r = await P._wvOpenTabFor(win, spec, null);
            if (!r) return false;
            win.Zotero_Tabs.select(r.id);
            try { if (win !== Services.focus.activeWindow) win.focus(); } catch (e) {}
            return true;
        } catch (e) { Zotero.debug("[Weavero] references tab err: " + e); return false; }
    }

    /** Split ("Open Beside This Paper"): the cited document beside the citing
     *  paper through the split view's shared "beside" open -- the one every
     *  link's Ctrl/Cmd+click takes (open-where.ts _wvOpenTarget): from the
     *  paper alone, a new pair of the two; from a paper in a pair, the cited
     *  document takes the pair's other side; with a lock of the user's own on,
     *  it shows beside the locked tab. MJT 2026-11-19: "When using Open Beside
     *  This Paper, it should use the Weavero split view instead of the locked
     *  tab" (1.1.1-refs.1 to .5 locked the citing paper). From the LIBRARY's
     *  pane (citations.6) the same open beside the library tab, as Ctrl+Enter in
     *  the items list: the library on one side, the document on the other; the
     *  pane's own window (`from`'s), never Zotero's main one. Where beside cannot
     *  apply (an external viewer), the plain open: a tab. */
    async _wvRefsSplit(reader: any, item: any, from?: any): Promise<boolean> {
        const P: any = this;
        try {
            if (!this._wvRefsCanSplit(reader)) return false;
            let win = reader._window;
            if (reader.wvLib && from && from.nodeType) { const w = winOf(from); if (w && w.Zotero_Tabs) win = w; }
            const src = reader.wvLib ? this._wvRefsLibTabOf(win, from) : reader.tabID;
            if (await P._wvOpenTarget(win, { item }, "beside", src)) return true;
            return this._wvRefsOpenTab(item, win);
        } catch (e) { Zotero.debug("[Weavero] references split err: " + e); return false; }
    }

    /** The reference's one menu, in the reader's own window under the button
     *  (or at the screen point `opts.at`): the card, then Show in Library and,
     *  with a PDF or EPUB, the open entries two by two (New Tab, Split View,
     *  New Window) on it, then a row per other attachment and per note of the
     *  cited item (_wvRefsChildRow; each kind under its caption, refsMenuCaption;
     *  in one submenu past CHILD_ROWS_MAX), then Copy As. `opens` is no longer read: every caller gets the open entries
     *  (2026-11-20). */
    _wvRefsMenu(reader: any, ids: number[], view: string, btn: any, opts?: { opens?: boolean; at?: number[] }) {
        const P: any = this;
        try {
            const win: any = reader && reader._window;
            if (!win || !win.document) return;
            const doc = win.document;
            const old = doc.getElementById(MENU_ID);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const items = ids.map((id) => { try { return Zotero.Items.get(id); } catch (e) { return null; } }).filter((x) => x);
            if (!items.length) return;
            const best = items[0];
            const host = this._wvRefsHostWin(reader);
            // The citing paper's library: the card names the others where a copy is.
            let citingLib: number | null = null;
            try { const a = Zotero.Items.get(reader.itemID); citingLib = a ? a.libraryID : null; } catch (e) {}
            // The window's kept menu element (refsMenuPopup: a new one flashes the backdrop).
            const pop = refsMenuPopup(doc, P._wvWireTag());
            // The reference card first (1.2.1-refs.9): what the cited work is,
            // from the item alone; its picture after the menu is up.
            // The menu's sheet (the card, the Open entries' file icons), card or not.
            wvInjectStyle(doc, CARD_STYLE_ID, CARD_CSS);
            const card = this._wvRefsCard(doc, best, items, citingLib, (copy: any) => {
                try { pop.hidePopup(); } catch (e) {}
                const lp: any = wvLivePlugin();
                if (!lp) return;
                lp._wvRefsClosePopup(reader, view);
                return lp._wvRefsShowInLibrary(copy, host);
            });
            if (card) {
                pop.appendChild(card);
                pop.addEventListener("popupshown", (e: any) => {
                    if (e.target !== pop) return;
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsCardShown(pop, card);
                });
            }
            const done = (fn: () => any) => () => {
                const lp: any = wvLivePlugin();
                if (!lp) return;
                lp._wvRefsClosePopup(reader, view);
                return fn();
            };
            // ONE menu, whatever opened it -- a mark, a row's ⋯, a right-click (MJT
            // 2026-11-20, "bring the design of all places displaying the references
            // more coherent"): the open entries are always there, even where the row
            // has buttons for them (they were left out of the ⋯ until then); with a
            // PDF or EPUB only. Split before Window (MJT 2026-11-20, "Open in split
            // view should be before the open in new window").
            // The entries open ONE document, named (MJT 2026-11-24, the cited item's
            // attachments and notes): _wvRefsChildren's PDF or EPUB. Its children not
            // known (not loaded), the index's word and the item's best, as before.
            const canSplit = this._wvRefsCanSplit(reader);
            const kids = this._wvRefsChildren(best);
            const gridAtt = kids ? kids.grid : null;
            const acts: string[] = [];
            {
                let has = !!gridAtt;
                if (!kids) {
                    const ix = P._wvRefsIx;
                    const r = ix && wvRefIndexGet(ix, best.id);
                    has = !!(r && r.pdf);
                }
                if (has) {
                    acts.push("tab");
                    if (canSplit) acts.push("split");
                    acts.push("window");
                }
            }
            const openIds = gridAtt ? [gridAtt.id] : ids;
            // The card says where the reference is; the menu acts (MJT 2026-11-20, "The
            // library information is duplicated in the card", option B): ONE Show in
            // Library -- an entry when one library holds a copy, a submenu of the
            // libraries, each with its icon, when several do. It replaced Show in X plus
            // an "Also in Y" entry per other library.
            // The citation popup's design (MJT 2026-11-26: Show in Library's submenu opened
            // over the grid's right column -- "Probably better adopt the same design as the one
            // appearing on the references in the text"; his pick, "Card + buttons, rows kept").
            // The card's library names show the copy in each library (its onShow above); its
            // actions are icon buttons at its foot, on the end side, in the popup's order
            // (_wvRefsRowSet): New Tab, Split View, New Window with a PDF or EPUB -- Show in
            // Library without one --, then Copy As. They stay the popup's own items, as
            // Firefox's navigation row (a menugroup of icon-only entries, CARD_CSS
            // .wv-refs-btn-row): Up and Down reach them, Left and Right move between them
            // (refsGridKey), Copy As is a submenu (a popup of its own would close this menu).
            // Replaced the 2 x 2 grid of words (MJT 2026-11-22) and the Copy As row.
            const btnRow = doc.createXULElement("menugroup");
            btnRow.classList.add("wv-refs-btn-row");
            const opens: any[] = [];
            for (const a of (acts.length ? acts : ["library"])) {
                const lib = a === "library";
                const mi = wvMenuItem(doc, {
                    attrs: { "data-wv-refs-act": a },
                    image: lib ? P._bmShowInLibraryIcon({ libraryID: best.libraryID }, host) : refsActIconURI(a),
                    // `btn` names the library tab a library pane's Split opens beside.
                    onCommand: lib ? done(() => wvLivePlugin()._wvRefsShowInLibrary(best, host))
                        : () => { const lp: any = wvLivePlugin(); return lp && lp._wvRefsAct(reader, a, openIds, view, btn); },
                }, btnRow);
                const tip = wvStr("weavero-refs-act-" + a, null, "title");
                mi.setAttribute("tooltiptext", tip);
                mi.setAttribute("aria-label", tip);
                if (!lib) opens.push(mi);
            }
            // Its file gone from the disk: the open buttons greyed out, as a row would be.
            if (gridAtt) refsMarkMissing(opens, gridAtt);
            // Copy As, the items list's copies of the cited item (MJT 2026-11-20, "I would
            // like to get a Copy As, same as in the items list"): Citation, Bibliography,
            // Citation Key, Select Link (the former Copy Link), Open Link, Online Library
            // Link, Better BibTeX's formats -- url.ts WV_COPY_AS through
            // _wvBuildCopyAsSubmenu, as the reader windows' tab menus build it, filled
            // when it opens. It wears the items list's Copy As icon.
            const copyAs = doc.createXULElement("menu");
            copyAs.setAttribute("data-wv-refs-act", "copy-as");
            const copyIcon = P._menuItemIconURL;
            if (copyIcon) { copyAs.classList.add("menu-iconic"); copyAs.setAttribute("image", copyIcon); }
            {
                // Its words set here, NOT through a data-l10n-id: Fluent's translation of an
                // element removes the localizable attributes its message lacks, so the
                // tooltip and aria-label beside a .label-only message vanished once it ran
                // (an icon-only button with no words; refs.spec.js, 2026-11-27).
                const tip = wvStr("weavero-menu-copy-as", null, "label");
                copyAs.setAttribute("label", tip);
                copyAs.setAttribute("tooltiptext", tip);
                copyAs.setAttribute("aria-label", tip);
            }
            const copyPop = doc.createXULElement("menupopup");
            copyAs.appendChild(copyPop);
            // popupshowing bubbles: only this submenu's own (src-ts.md).
            copyPop.addEventListener("popupshowing", (ev: any) => {
                if (ev.target !== copyPop) return;
                try {
                    while (copyPop.firstChild) copyPop.firstChild.remove();
                    const lp: any = wvLivePlugin();
                    if (lp && lp._wvBuildCopyAsSubmenu) lp._wvBuildCopyAsSubmenu(doc, copyPop, () => best);
                } catch (e) {}
            });
            btnRow.appendChild(copyAs);
            pop.appendChild(btnRow);
            // Left / Right between the buttons while the menu is up (refsGridKey): ONE
            // listener per window, this menu's -- a menu replaced while open (a new one
            // removes the old, refs.ts MENU_ID) may hear its popuphidden late or never.
            {
                const keyOf = "lazy:refs-grid-keys";
                pop.addEventListener("popupshown", (e: any) => {
                    if (e.target !== pop) return;
                    const lp: any = wvLivePlugin();
                    wvUnlisten(win, keyOf);
                    if (lp) wvListen(win, keyOf, "keydown", refsGridKey(pop), true, lp._wvWireTag());
                });
                pop.addEventListener("popuphidden", (e: any) => {
                    if (e.target !== pop) return;
                    const cur = doc.getElementById(MENU_ID);
                    if (!cur || cur === pop) wvUnlisten(win, keyOf);
                });
            }
            // The cited item's own attachments and notes under Show in Library (MJT
            // 2026-11-24, on Carslaw & Jaeger's book, whose one attachment is a DjVu file:
            // "When the item cited in the reference has some attachment files or item notes,
            // I would like to get options to open them"; his pick, "Listed in the menu"): one
            // row each, the items list's icon and the name, the grid's document left out --
            // the grid opens it. More than CHILD_ROWS_MAX: one submenu holds them.
            // Each kind under its caption (refsMenuCaption; MJT 2026-11-25): "Attachment(s)"
            // over the attachments, "Note(s)" over the notes. Two captions, not one
            // "Attachments and Notes": the rows come as two blocks (_wvRefsChildren: the
            // attachments, then the notes), as the item pane shows them in two sections, and
            // each caption counts its own rows for its plural. The submenu holds no caption:
            // its label names what it holds -- the captions' words when it holds one kind
            // (with the note icon for notes alone), "Attachments and Notes" for both.
            if (kids && kids.list.length) {
                wvMenuSeparator(doc, pop);
                const dark = !!P._bmIsDark(win);
                const rows = kids.list.map((it: any) => this._wvRefsChildRow(doc, reader, view, btn, it, dark, canSplit)).filter((x: any) => x);
                const noteRows = rows.filter((r: any) => r.getAttribute("data-wv-refs-kind") === "note");
                const attRows = rows.filter((r: any) => r.getAttribute("data-wv-refs-kind") !== "note");
                if (rows.length > CHILD_ROWS_MAX) {
                    const m = doc.createXULElement("menu");
                    if (!noteRows.length) wvL10n(m, "weavero-menu-refs-attachments", { count: attRows.length });
                    else if (!attRows.length) wvL10n(m, "weavero-menu-refs-notes", { count: noteRows.length });
                    else wvL10n(m, "weavero-menu-refs-children");
                    m.setAttribute("data-wv-refs-act", "children");
                    m.classList.add("menu-iconic");
                    m.setAttribute("image", "chrome://zotero/skin/16/universal/" + (attRows.length ? "attachment" : "note") + ".svg");
                    const sub = doc.createXULElement("menupopup");
                    m.appendChild(sub);
                    for (const r of rows) sub.appendChild(r);
                    pop.appendChild(m);
                }
                else {
                    if (attRows.length) pop.appendChild(refsMenuCaption(doc, "weavero-menu-refs-attachments", attRows.length));
                    for (const r of attRows) pop.appendChild(r);
                    if (noteRows.length) pop.appendChild(refsMenuCaption(doc, "weavero-menu-refs-notes", noteRows.length));
                    for (const r of noteRows) pop.appendChild(r);
                }
            }
            this._wvRefsMenuOpen(doc, pop, btn, opts && opts.at);
        } catch (e) { Zotero.debug("[Weavero] references menu err: " + e); }
    }

    /** The cited item's children for its menu: `grid`, the PDF or EPUB the grid's
     *  entries open -- the user's default file (attachments.ts _wvGetDefaultChild)
     *  when it is one, else the first in Zotero's best order (item.js
     *  getBestAttachments: a PDF first, then a file whose URL is the item's, then
     *  the oldest; null without one: no grid); `list`, every other attachment in
     *  the Attachments section's order (getAttachments), then the notes
     *  (getNotes). Synchronous, from the item's loaded children: the menu is
     *  built at once. Null when they are not loaded. */
    _wvRefsChildren(item: any): { grid: any; list: any[] } | null {
        const P: any = this;
        try {
            if (!item || !item.isRegularItem || !item.isRegularItem()) return { grid: null, list: [] };
            const atts: any[] = item.getAttachments().map((id: number) => Zotero.Items.get(id)).filter((a: any) => a && !a.deleted);
            const notes: any[] = item.getNotes().map((id: number) => Zotero.Items.get(id)).filter((n: any) => n && !n.deleted);
            const docs = atts.filter((a: any) => refsReaderAtt(a) && DOC_TYPES.indexOf(a.attachmentContentType) >= 0);
            let grid: any = null;
            if (docs.length) {
                let def: any = null;
                try { def = typeof P._wvGetDefaultChild === "function" ? P._wvGetDefaultChild(item) : null; } catch (e) { def = null; }
                grid = def ? docs.find((a: any) => a.id === def.id) || null : null;
                if (!grid) {
                    let url = "";
                    try { url = String(item.getField("url") || ""); } catch (e) {}
                    const key = (a: any): any[] => {
                        let u = "";
                        try { u = String(a.getField("url") || ""); } catch (e) {}
                        return [a.attachmentContentType === "application/pdf" ? 0 : 1, url && u === url ? 0 : 1, String(a.dateAdded || ""), a.id];
                    };
                    grid = docs.slice().sort((a: any, b: any) => {
                        const x = key(a), y = key(b);
                        for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; }
                        return 0;
                    })[0];
                }
            }
            return { grid, list: atts.filter((a: any) => !grid || a.id !== grid.id).concat(notes) };
        } catch (e) { return null; }
    }

    /** One row of the cited item's (_wvRefsChildren) in its menu: its icon as the
     *  items list draws it (refsItemIconURL), its name as the Attachments and Notes
     *  sections show it (the title; the file's name or the link where it has
     *  none). A document the reader shows (a PDF, an EPUB, an HTML snapshot -- MJT
     *  2026-11-24, "Should also work for snapshots") is a submenu of the grid's
     *  entries on it -- New Tab, Split View where the grid has it, New Window --
     *  through the same _wvRefsAct; anything else is an entry
     *  (_wvRefsOpenChild). A file gone from the disk that Zotero cannot fetch is
     *  greyed out (refsMarkMissing). Null for an item that is neither. */
    _wvRefsChildRow(doc: any, reader: any, view: string, btn: any, it: any, dark: boolean, canSplit: boolean): any {
        try {
            const isNote = !!(it.isNote && it.isNote());
            const isAtt = !isNote && !!(it.isAttachment && it.isAttachment());
            if (!isNote && !isAtt) return null;
            const linked = isAtt && it.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL;
            const kind = isNote ? "note" : linked ? "link" : refsReaderAtt(it) ? "reader" : "file";
            let label = "";
            try { label = String(it.getDisplayTitle() || ""); } catch (e) {}
            if (!label && isAtt) { try { label = String((linked ? it.getField("url") : it.attachmentFilename) || ""); } catch (e) {} }
            if (!label) { try { label = String(Zotero.ItemTypes.getLocalizedString(it.itemType) || ""); } catch (e) {} }
            const image = refsItemIconURL(it, dark);
            const attrs: { [k: string]: string } = { "data-wv-refs-act": "child", "data-wv-refs-child": String(it.id), "data-wv-refs-kind": kind };
            let el: any;
            if (kind === "reader") {
                el = doc.createXULElement("menu");
                el.setAttribute("label", label);
                el.classList.add("menu-iconic");
                el.setAttribute("image", image);
                for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
                const sub = doc.createXULElement("menupopup");
                el.appendChild(sub);
                for (const a of canSplit ? ["tab", "split", "window"] : ["tab", "window"]) {
                    wvMenuItem(doc, {
                        l10n: { id: "weavero-menu-refs-open-short", args: { where: a, from: "here", library: "" } },
                        attrs: { "data-wv-refs-act": a },
                        image: refsActIconURI(a),
                        onCommand: () => { const lp: any = wvLivePlugin(); return lp && lp._wvRefsAct(reader, a, [it.id], view, btn); },
                    }, sub);
                }
            }
            else {
                el = wvMenuItem(doc, {
                    label,
                    image,
                    attrs,
                    onCommand: () => { const lp: any = wvLivePlugin(); return lp && lp._wvRefsOpenChild(reader, it.id, view); },
                });
            }
            if (kind === "reader" || kind === "file") refsMarkMissing([el], it);
            return el;
        } catch (e) { Zotero.debug("[Weavero] references menu row err: " + e); return null; }
    }

    /** A row of the cited item's that is not a document the reader shows: a note
     *  in a note tab -- ZoteroPane.openNote with openInWindow false ONLY
     *  (CLAUDE.md, hard invariant); a linked URL through the links' launcher
     *  (url.ts _launchURL and its checks); any other file as Zotero opens an
     *  attachment (ZoteroPane.viewAttachment: the system's application for a
     *  DjVu, a Word file ..., a stored file downloaded first where file syncing
     *  is on), after the links' check with no question (url.ts
     *  _wvMayOpenAttachment `askExternal: false`: a program refused). Nothing for
     *  a file gone from the disk that Zotero cannot fetch (refsFetchable).
     *  Weavero writes nothing. */
    async _wvRefsOpenChild(reader: any, id: number, view: string): Promise<boolean> {
        const P: any = this;
        try {
            const it: any = Zotero.Items.get(id);
            if (!it) return false;
            this._wvRefsClosePopup(reader, view);
            const win = this._wvRefsHostWin(reader);
            const zpOf = () => (win && win.ZoteroPane) || (Zotero.getMainWindow() && Zotero.getMainWindow().ZoteroPane);
            if (it.isNote && it.isNote()) {
                const zp = zpOf();
                if (!zp || typeof zp.openNote !== "function") return false;
                await zp.openNote(it.id, { openInWindow: false });
                return true;
            }
            if (!it.isAttachment || !it.isAttachment()) return false;
            if (it.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
                const url = String(it.getField("url") || "");
                if (!url) return false;
                P._launchURL(url);
                return true;
            }
            // Not on the disk: Zotero's own opening fetches it where it can.
            if ((!(await it.fileExists()) && !refsFetchable(it)) || P._wvDestroyed) return false;
            // The row names the file: it opens as Zotero's double-click opens it,
            // with no question (MJT 2026-11-24, "Open, no question"); a program is
            // refused all the same.
            if (!(await P._wvMayOpenAttachment(it, win, { askExternal: false }))) return false;
            const zp = zpOf();
            if (!zp || typeof zp.viewAttachment !== "function") return false;
            await zp.viewAttachment(it.id);
            return true;
        } catch (e) { Zotero.debug("[Weavero] references open row err: " + e); return false; }
    }

    /** `att`'s file on the disk before a document of the reader's opens from the
     *  reference menu (its grid, its rows): there already, or fetched first the
     *  way Zotero's own opening fetches it (zoteroPane.js viewAttachment: a stored
     *  file in a library with file syncing, Zotero.Sync.Runner.downloadFile, its
     *  error shown by Zotero's alert). False when it cannot be had. Anything that
     *  is not a file attachment (a regular item: a row's buttons) passes. */
    async _wvRefsEnsureFile(att: any): Promise<boolean> {
        try {
            if (!att || !att.isAttachment || !att.isAttachment()) return true;
            if (att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) return true;
            if (await att.fileExists()) return true;
            if (!refsFetchable(att)) return false;
            const R: any = Zotero.Sync && Zotero.Sync.Runner;
            if (!R || typeof R.downloadFile !== "function") return false;
            try { await R.downloadFile(att); }
            catch (e) {
                Zotero.logError(e);
                try { R.alert(e); } catch (er) {}
                return false;
            }
            return !!(await att.fileExists());
        } catch (e) { Zotero.debug("[Weavero] references fetch err: " + e); return false; }
    }

    /** A popup row's Copy As: the items list's copies of the cited item (url.ts
     *  _wvBuildCopyAsSubmenu, the ⋯ menu's Copy As) as a menu of its own, at once (MJT
     *  2026-11-20, "The Show in Library and Copy As options are too many steps away"). */
    _wvRefsCopyAsMenu(reader: any, ids: number[], btn: any) {
        const P: any = this;
        try {
            const win: any = reader && reader._window;
            if (!win || !win.document) return;
            const doc = win.document;
            const old = doc.getElementById(MENU_ID);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const best = ids.map((id) => { try { return Zotero.Items.get(id); } catch (e) { return null; } }).find((x) => x);
            if (!best) return;
            const pop = refsMenuPopup(doc, P._wvWireTag());
            pop.setAttribute("data-wv-refs-copyas", "true");
            if (P._wvBuildCopyAsSubmenu) P._wvBuildCopyAsSubmenu(doc, pop, () => best);
            if (!pop.firstElementChild) { refsMenuIdle(pop); return; }
            this._wvRefsMenuOpen(doc, pop, btn);
        } catch (e) { Zotero.debug("[Weavero] references copy-as err: " + e); }
    }

    /** Show `pop` (a reference's menu, MENU_ID, from refsMenuPopup) in `doc`:
     *  under `btn`, in whichever document it is drawn -- the reader's page (the
     *  popup), its PDF view (a mark), the item pane (a row) -- or at the screen
     *  point `at` (a right-click). Closed, it is idle again (refsMenuIdle). */
    _wvRefsMenuOpen(doc: any, pop: any, btn: any, at?: number[]) {
        // The kept element is not moved: re-inserted, it would lose its popup window.
        const host = wvPopupHost(doc);
        if (pop.parentNode !== host) host.appendChild(pop);
        // A card's "More" before the menu's first layout (refsCardMoreAhead).
        try { const card = pop.querySelector(":scope > .wv-refs-card"); if (card) refsCardMoreAhead(pop, card); } catch (e) {}
        // Last of the opening's listeners: the builder's own popuphidden have run.
        pop.addEventListener("popuphidden", (e: any) => { if (e.target === pop) { try { refsMenuIdle(pop); } catch (er) {} } });
        let x = 0, y = 0;
        if (at && at.length === 2) { x = Math.round(at[0]); y = Math.round(at[1]); }
        else {
            try {
                const bw = winOf(btn);
                const r = btn.getBoundingClientRect();
                x = Math.round(bw.mozInnerScreenX + r.left);
                y = Math.round(bw.mozInnerScreenY + r.bottom);
            } catch (e) {}
        }
        pop.openPopupAtScreen(x, y, !!at);
    }

    // ---- the reference card (1.2.1-refs.9) -------------------------------------
    // MJT 2026-11-20: "more information on the reference when opening that
    // popup, including the most important metadata, and eventually the
    // abstract, even graphical abstract ... More features should not be
    // developed at the cost of speed." So: built when a menu opens, never
    // ahead; from the item in memory alone (field reads, its child list -- no
    // database query, no network, no PDF); the picture loaded after the menu
    // is on screen.

    /** The card of `item` (the copy the menu opens; `copies` all of them,
     *  best first) for a menu of `doc`: its title, first three authors, year,
     *  publication (or publisher) and type, the library it is in -- "Only in"
     *  with that library's badge when no copy is in the citing paper's
     *  library (`citingLib`), the marks' rule (_wvRefsBadge) -- its abstract
     *  (four lines, More / Less), and a box for its graphical abstract (an
     *  image attachment), filled by _wvRefsCardShown. Null when it cannot be
     *  read. `onShow(copy)`: a library's name is a click away from showing the
     *  copy in that library (MJT 2026-11-20, "The Show in Library and Copy As
     *  options are too many steps away now"). */
    _wvRefsCard(doc: any, item: any, copies: any[], citingLib: number | null, onShow?: (copy: any) => any): any {
        try {
            if (!item || !item.isRegularItem || !item.isRegularItem()) return null;
            const field = (f: string) => { try { return String(item.getField(f, false, true) || "").trim(); } catch (e) { return ""; } };
            const card = wvHtmlEl(doc, "div", "wv-refs-card");
            card.setAttribute("data-wv-refs-card", String(item.id));
            // The work as the item pane's header shows it in its Bibliography Entry
            // mode (MJT 2026-11-20, "Use similar format as the one in the other
            // screenshot"); the plain lines below only while Zotero's styles load.
            // The work's type first: Zotero's item-type icon in front of it, as the items
            // list and the Related rows draw an item, its name as the icon's tooltip (MJT
            // 2026-11-20, "the reference information in the popup is missing what is the
            // item type. I think that the item type icon should be put in front").
            let type = "";
            try { type = String(Zotero.ItemTypes.getLocalizedString(item.itemTypeID) || ""); } catch (e) {}
            const ref = wvHtmlEl(doc, "div", "wv-refs-card-ref", undefined, card);
            const typeBox = wvHtmlEl(doc, "span", "wv-refs-card-type", undefined, ref);
            try {
                const w = doc.defaultView;
                const icons = w && w.require ? w.require("components/icons") : null;
                const el = icons && typeof icons.getCSSItemTypeIcon === "function" ? icons.getCSSItemTypeIcon(item.getItemTypeIconName()) : null;
                if (el) typeBox.appendChild(el);
                // The reader's page (a card in the citation popup) has neither Zotero's
                // icon module nor its icon rules: the drawing inlined (refsTypeIconInto).
                else refsTypeIconInto(typeBox, item.getItemTypeIconName());
            } catch (e) {}
            if (type) typeBox.setAttribute("title", type);
            const text = wvHtmlEl(doc, "div", "wv-refs-card-reftext", undefined, ref);
            const bib = this._wvRefsCardBib(doc, item);
            if (bib) text.appendChild(bib);
            else {
                let title = "";
                try { title = String(item.getDisplayTitle() || ""); } catch (e) { title = field("title"); }
                wvHtmlEl(doc, "div", "wv-refs-card-title", title, text);
                const authors = this._wvRefsCardAuthors(item);
                if (authors) wvHtmlEl(doc, "div", "wv-refs-card-authors", authors, text);
                const ym = field("date").match(/(?<!\d)\d{4}(?!\d)/);
                const meta = [ym ? ym[0] : "", field("publicationTitle") || field("publisher"), type].filter((x) => x).join(" · ");
                if (meta) wvHtmlEl(doc, "div", "wv-refs-card-meta", meta, text);
            }
            const libs = new Set(copies.map((c: any) => c.libraryID));
            const away = citingLib != null && !libs.has(citingLib);
            let lib: any = null;
            try { lib = Zotero.Libraries.get(item.libraryID); } catch (e) {}
            if (lib) {
                const line = wvHtmlEl(doc, "div", "wv-refs-card-lib", undefined, card);
                // Every library holding a copy, the shown one first, each name after
                // its library's icon (refsCardLibLine).
                refsCardLibLine(doc, line, away ? "other" : "here", [item.libraryID].concat(copies.map((c: any) => c.libraryID)), citingLib);
                if (onShow) {
                    for (const nm of Array.from(line.querySelectorAll(".wv-refs-card-libname[data-wv-refs-lib]")) as any[]) {
                        const libID = Number(nm.getAttribute("data-wv-refs-lib"));
                        const copy = item.libraryID === libID ? item : copies.find((c: any) => c.libraryID === libID);
                        if (!copy) continue;
                        nm.setAttribute("role", "button");
                        nm.setAttribute("data-wv-refs-copy", String(copy.id));
                        nm.setAttribute("title", wvStr("weavero-menu-refs-show-in", { library: String(nm.textContent || "") }, "label"));
                        nm.addEventListener("click", (e: any) => {
                            try { e.stopPropagation(); e.preventDefault(); const r = onShow(copy); if (r && typeof r.catch === "function") r.catch(() => {}); } catch (er) {}
                        });
                    }
                }
            }
            const abs = field("abstractNote");
            if (abs) {
                wvHtmlEl(doc, "div", "wv-refs-card-abs", abs, card);
                const more = wvHtmlEl(doc, "span", "wv-refs-card-more", wvStr("weavero-refs-card-more", null, null), card);
                more.setAttribute("role", "button");
                more.hidden = true;
                more.addEventListener("click", (e: any) => {
                    try {
                        e.stopPropagation();
                        // In Zotero's citation popup (the card in its row): it keeps its place.
                        const zp: any = card.closest ? card.closest(".citation-popup") : null;
                        const h0 = zp && !card.closest(".wv-refs-hcard") ? zp.offsetHeight : -1;
                        const open = !card.classList.contains("wv-refs-card-open");
                        card.classList.toggle("wv-refs-card-open", open);
                        more.textContent = wvStr(open ? "weavero-refs-card-less" : "weavero-refs-card-more", null, null);
                        if (h0 >= 0) refsPopupKeepPlace(zp, h0);
                    } catch (er) {}
                });
            }
            const img = this._wvRefsCardImage(item);
            if (img) {
                const box = wvHtmlEl(doc, "div", "wv-refs-card-ga", undefined, card);
                box.setAttribute("data-wv-refs-att", String(img.id));
                let t = "";
                try { t = String(img.getField("title") || ""); } catch (e) {}
                box.setAttribute("title", wvStr("weavero-refs-card-image", { title: t }, "title"));
                // Its room from the start (refsGaBoxSize), unless Zotero already
                // knows the file is missing.
                let gone = false;
                try { gone = typeof img.fileExistsCached === "function" && img.fileExistsCached() === false; } catch (e) {}
                if (gone) box.hidden = true;
                else {
                    const [w, h] = refsGaBoxSize(img.id);
                    box.style.width = w + "px";
                    box.style.height = h + "px";
                }
            }
            return card;
        } catch (e) { Zotero.debug("[Weavero] references card err: " + e); return null; }
    }

    /** The reference card of `items` (copies of one work, best first) for any
     *  page of a main window -- the Researchers tab's publications (MJT
     *  2026-11-25: "Also reuse the same item cards as in the references"): its
     *  sheet put in `doc`, the card _wvRefsCard makes. Null when none of them
     *  can be read. Once the card is on screen, _wvRefsCardShown(host, card)
     *  sets its More and loads its picture. */
    _wvRefsCardOf(doc: any, items: any[], onShow?: (copy: any) => any): any {
        try {
            const list = (items || []).filter((x: any) => x && x.isRegularItem && x.isRegularItem());
            if (!list.length) return null;
            wvInjectStyle(doc, CARD_STYLE_ID, CARD_CSS);
            return this._wvRefsCard(doc, list[0], list, null, onShow);
        } catch (e) { return null; }
    }

    /** `item` as the item pane's header draws it in Bibliography Entry mode
     *  (elements/itemPaneHeader.js _renderBibEntry): Zotero's CSL output in the
     *  header's own style and locale (itemPaneHeader.bibEntry.style / .locale;
     *  Zotero's default is APA, MJT's "Bibliography Preview": creator and year,
     *  the title in bold, the journal line in italics), with the header's
     *  clean-up -- no indent or line height of the style's, no number of a
     *  numeric style, no COinS span. Speed: one engine per style and locale,
     *  made at the first card and kept (not Zotero's shared cached one, which
     *  the header rebuilds), and each item's HTML kept until it changes. Null
     *  while Zotero's styles are not loaded (their load is started) or when the
     *  style cannot render the item: the card falls back to plain lines. */
    _wvRefsCardBib(doc: any, item: any): any {
        try {
            const S: any = (Zotero as any).Styles;
            if (!S || typeof S.get !== "function") return null;
            if (typeof S.initialized === "function" && !S.initialized()) { try { S.init(); } catch (e) {} return null; }
            const style: any = S.get(String(Zotero.Prefs.get("itemPaneHeader.bibEntry.style") || "")) || S.get("http://www.zotero.org/styles/apa");
            if (!style) return null;
            const locale = String(Zotero.Prefs.get("itemPaneHeader.bibEntry.locale") || "");
            const key = style.styleID + "|" + locale;
            if (!cardCsl || cardCsl.key !== key) cardCsl = { key, engine: style.getCiteProc(locale, "html"), html: new Map() };
            const ck = item.id + "|" + item.dateModified;
            let html = cardCsl.html.get(ck);
            if (html == null) {
                cardCsl.engine.updateItems([]);
                html = String(Zotero.Cite.makeFormattedBibliographyOrCitationList(cardCsl.engine, [item], "html", false) || "");
                cardCsl.html.set(ck, html);
                while (cardCsl.html.size > CARD_BIB_CACHE) cardCsl.html.delete(cardCsl.html.keys().next().value);
            }
            const parsed = new doc.defaultView.DOMParser().parseFromString(html, "text/html");
            const body: any = parsed.querySelector(".csl-bib-body");
            if (!body || !body.textContent.trim()) return null;
            for (const z of Array.from(body.querySelectorAll(".Z3988")) as any[]) z.remove();
            body.removeAttribute("style");
            if (style.categories === "numeric") {
                const n: any = body.querySelector(".csl-entry > .csl-left-margin:first-child");
                if (n) {
                    const next: any = n.nextElementSibling;
                    if (next && next.classList.contains("csl-right-inline")) { next.classList.remove("csl-right-inline"); next.removeAttribute("style"); }
                    n.remove();
                }
            }
            const box = wvHtmlEl(doc, "div", "wv-refs-card-bib");
            box.appendChild(doc.importNode(body, true));
            // The style wraps the URL and DOI fields in <a href>: no anchor
            // keeps an href a click would follow in the card's document (the
            // reader's page, a chrome popup); its address goes to Weavero's
            // launcher like every link Weavero draws, as the item pane's
            // header sends the same output to Zotero.launchURL.
            for (const a of Array.from(box.querySelectorAll("a")) as any[]) {
                const href = String(a.getAttribute("href") || "").trim();
                a.removeAttribute("href");
                if (!href) continue;
                a.setAttribute("data-wv-url", href);
                a.setAttribute("title", href);
                a.classList.add("wv-refs-url", urlLinkClass(href));
            }
            box.addEventListener("click", (e: any) => {
                try {
                    const a = e.target && e.target.closest ? e.target.closest("a[data-wv-url]") : null;
                    if (!a) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const lp: any = wvLivePlugin();
                    if (lp) lp._launchURL(String(a.getAttribute("data-wv-url")));
                } catch (er) {}
            });
            return box;
        } catch (e) { Zotero.debug("[Weavero] references card entry err: " + e); return null; }
    }

    /** "J. Adams, K. Brown, L. Clark et al.": the item's first three
     *  creators of its primary type (all creators when it has none of it). */
    _wvRefsCardAuthors(item: any): string {
        try {
            const all: any[] = item.getCreators() || [];
            let prim: number | null = null;
            try { prim = Zotero.CreatorTypes.getPrimaryIDForType(item.itemTypeID); } catch (e) {}
            const own = all.filter((c: any) => c.creatorTypeID === prim);
            const cs = own.length ? own : all;
            const name = (c: any) => {
                const last = String(c.lastName || "").trim();
                const first = String(c.firstName || "").trim();
                if (!first) return last;
                const ini = first.split(/\s+/).map((w) => w.split("-").map((p) => (p ? p[0].toUpperCase() + "." : "")).join("-")).join(" ");
                return (ini + " " + last).trim();
            };
            const names = cs.slice(0, 3).map(name).filter((x) => x);
            if (!names.length) return "";
            return names.join(", ") + (cs.length > 3 ? " " + wvStr("weavero-refs-card-et-al", null, null) : "");
        } catch (e) { return ""; }
    }

    /** The item's graphical abstract: an image attachment of its own (a
     *  stored or linked file), one titled "Graphical abstract" / "TOC" /
     *  "Table of contents" first; null when it has none. Sync: the item's
     *  child list and the attachments' fields, in memory. */
    _wvRefsCardImage(item: any): any {
        try {
            let first: any = null;
            for (const id of item.getAttachments() || []) {
                let a: any = null;
                try { a = Zotero.Items.get(id); } catch (e) { a = null; }
                if (!a || !a.isAttachment || !a.isAttachment()) continue;
                if (!String(a.attachmentContentType || "").startsWith("image/")) continue;
                if (a.attachmentLinkMode === this._wvRefsLinkedUrlMode()) continue;
                // The file's own name must be an image's too: its click hands the
                // file to the system, which goes by the name, not the type.
                let fname = "";
                try { fname = String(a.attachmentFilename || ""); } catch (e) {}
                if (!wvIsImageFileName(fname)) continue;
                let t = "";
                try { t = String(a.getField("title") || ""); } catch (e) {}
                if (/graphical\s*abstract|\btoc\b|table\s+of\s+contents/i.test(t)) return a;
                if (!first) first = a;
            }
            return first;
        } catch (e) { return null; }
    }

    /** The card's work once its menu is on screen: "More" checked again on the
     *  menu's own layout (a no-op when refsCardMoreAhead was right, the menu's
     *  one resize when it was not), and the graphical abstract's picture --
     *  its file found, then decoded off the main thread -- into the box kept for
     *  it (refsGaBoxSize), a click opening the image; the box goes only when
     *  the file is missing or cannot be read. Nothing when the menu has closed
     *  meanwhile. */
    async _wvRefsCardShown(pop: any, card: any) {
        try {
            const abs = card.querySelector(".wv-refs-card-abs");
            const more = card.querySelector(".wv-refs-card-more");
            if (abs && more) {
                const cut = abs.scrollHeight > abs.clientHeight + 1;
                if (more.hidden === cut) more.hidden = !cut;
            }
            const box = card.querySelector(".wv-refs-card-ga");
            if (!box || box.hidden || box.querySelector("img")) return;
            const att = Zotero.Items.get(Number(box.getAttribute("data-wv-refs-att")));
            const path = att ? await att.getFilePathAsync() : null;
            // The menu element is kept between openings: this card may be gone from it.
            if (!pop.isConnected || pop.state === "closed" || !card.isConnected) return;
            if (!path) { box.hidden = true; return; }
            const doc = box.ownerDocument;
            const img = wvHtmlEl(doc, "img", undefined, undefined, box);
            img.setAttribute("alt", "");
            img.decoding = "async";
            // Its size kept for the next time the card opens: the box then fits it.
            img.addEventListener("load", () => { refsGaRemember(att.id, img.naturalWidth, img.naturalHeight); }, { once: true });
            img.addEventListener("error", () => { box.hidden = true; }, { once: true });
            img.addEventListener("click", (e: any) => {
                try {
                    e.stopPropagation();
                    try { pop.hidePopup(); } catch (er) {}
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsCardOpenImage(att.id);
                } catch (er) {}
            });
            img.src = Zotero.File.pathToFileURI(path);
        } catch (e) { Zotero.debug("[Weavero] references card picture err: " + e); }
    }

    /** Open the graphical abstract `attID` as Zotero opens an attachment: an
     *  image file only, and through the links' check (url.ts
     *  `_wvMayOpenAttachment`: the system's viewer once the user confirms). */
    async _wvRefsCardOpenImage(attID: number) {
        try {
            const att: any = Zotero.Items.get(attID);
            let fname = "";
            try { fname = String((att && att.attachmentFilename) || ""); } catch (e) {}
            if (!att || !wvIsImageFileName(fname)) return;
            const w: any = Zotero.getMainWindow();
            if (!(await (this as any)._wvMayOpenAttachment(att, w))) return;
            if (w && w.ZoteroPane && typeof w.ZoteroPane.viewAttachment === "function") await w.ZoteroPane.viewAttachment(attID);
        } catch (e) { Zotero.debug("[Weavero] references card open picture err: " + e); }
    }

    // ---- Open in Browser (1.2.1-refs.9) ----------------------------------------
    // MJT 2026-11-20: a reference in none of your libraries gets an easy way
    // to open it online. Its own link when it has one (lib/ref-web.ts); else,
    // on the click and only then, Crossref is asked for it -- the one network
    // request of the whole feature -- and a confident answer opens at doi.org,
    // anything else (a weak answer, an error, no answer within
    // WEB_TIMEOUT_MS) a Google Scholar search. Zotero's own request API, with
    // Zotero's own User-Agent (no name, no e-mail, no cookies: anon).

    /** The citing paper's DOIs (its DOI field, an Extra "DOI:" line), lower case. */
    _wvRefsSelfDOIs(reader: any): string[] {
        const out: string[] = [];
        try {
            const att = Zotero.Items.get(reader.itemID);
            const top = att && (att.parentItem || att);
            if (!top) return out;
            const push = (d: string) => { if (d && out.indexOf(d) < 0) out.push(d); };
            try { push(wvRefCleanDOI(top.getField("DOI"))); } catch (e) {}
            try { for (const m of String(top.getField("extra") || "").matchAll(/^\s*DOI:\s*(\S+)/gim)) push(wvRefCleanDOI(m[1])); } catch (e) {}
        } catch (e) {}
        return out;
    }

    /** Forget this session's Crossref answers (destroy(); the suite). */
    _wvRefsWebForget() {
        webCache.clear();
    }

    /** Open in Browser's tooltip, ONE message for the globe on a row and the grey
     *  ring in the PDF, which do the same (MJT 2026-11-20, "I don't see why the
     *  message and icon should be different", then "The globe is probably good
     *  to keep consistent with the icon in the item pane"): the link a click
     *  opens when the entry has one of its own ("does it make sense to show also
     *  the link that it will open?"), else what a click will do -- Crossref, else
     *  Google Scholar: nothing goes online on a hover. */
    _wvRefsWebTip(reader: any, entry: WvRefsEntry, selfDOIs?: string[]): string {
        const own = wvRefWebOwnLink(entry.text, entry.url, selfDOIs || this._wvRefsSelfDOIs(reader));
        return wvStr("weavero-refs-web-tip", { how: own ? "link" : "lookup", url: own ? own.url : "" }, "title");
    }

    /** Crossref's answer for the request `url` (lib/ref-web.ts
     *  wvRefWebCrossrefUrl), parsed; throws on an error or a timeout. */
    async _wvRefsWebFetch(url: string): Promise<any> {
        const xhr = await Zotero.HTTP.request("GET", url, {
            responseType: "json", timeout: WEB_TIMEOUT_MS, errorDelayMax: 0, anon: true,
            headers: { Accept: "application/json" },
        });
        return xhr ? xhr.response : null;
    }

    /** What a click on `entry` opens (lib/ref-web.ts): its own link at once,
     *  else Crossref's confident answer or Google Scholar. A Crossref answer
     *  is kept for the session (by the entry's text); a failed or timed-out
     *  ask is not, the next click asks again. */
    _wvRefsWebTarget(reader: any, entry: WvRefsEntry): Promise<WvRefWebTarget> {
        const own = wvRefWebOwnLink(entry.text, entry.url, this._wvRefsSelfDOIs(reader));
        if (own) return Promise.resolve(own);
        const key = wvRefWebBare(entry.text);
        const had = webCache.get(key);
        if (had) return had;
        let failed = false;
        const p = (async (): Promise<WvRefWebTarget> => {
            let json: any = null;
            try {
                json = await Promise.race([
                    this._wvRefsWebFetch(wvRefWebCrossrefUrl(entry.text)),
                    wvSleep(WEB_TIMEOUT_MS).then(() => { throw new Error("timeout"); }),
                ]);
            }
            catch (e) { failed = true; Zotero.debug("[Weavero] references: Crossref did not answer (" + e + "), Google Scholar instead"); }
            const pick = json ? wvRefWebPick(json, entry.text) : null;
            if (pick) return { url: wvRefDoiUrl(pick.doi), how: "crossref", doi: pick.doi, score: pick.score };
            if (!json) failed = true;
            return { url: wvRefWebScholarUrl(entry.text), how: "scholar" };
        })();
        webCache.set(key, p);
        while (webCache.size > WEB_CACHE) webCache.delete(webCache.keys().next().value);
        p.then(() => { if (failed && webCache.get(key) === p) webCache.delete(key); }, () => webCache.delete(key));
        return p;
    }

    /** Open `entry` online (Zotero.launchURL), `btn` (a globe) showing that
     *  it looks the reference up meanwhile. The target, or null. */
    async _wvRefsWebOpen(reader: any, entry: WvRefsEntry, btn?: any): Promise<WvRefWebTarget | null> {
        if (!entry || !entry.text) return null;
        // A second press while the first one looks it up opens nothing more.
        try { if (btn && btn.hasAttribute("data-wv-refs-busy")) return null; } catch (e) {}
        let tip: string | null = null;
        try {
            if (btn) {
                tip = btn.getAttribute("title");
                btn.setAttribute("data-wv-refs-busy", "true");
                btn.setAttribute("title", wvStr("weavero-refs-act-web-busy", null, "title"));
            }
            const t = await this._wvRefsWebTarget(reader, entry);
            Zotero.debug("[Weavero] references: open in browser (" + t.how + (t.score != null ? ", score " + t.score : "") + ")");
            Zotero.launchURL(t.url);
            return t;
        }
        catch (e) { Zotero.debug("[Weavero] references open in browser err: " + e); return null; }
        finally {
            if (btn) {
                // Back to what it had -- none on the PDF's grey ring, whose words
                // Weavero's URL tip draws: a lookup's title stayed there and showed
                // beside that tip (MJT 2026-11-20, "Why 2 tooltips?").
                try {
                    btn.removeAttribute("data-wv-refs-busy");
                    if (tip != null) btn.setAttribute("title", tip);
                    else btn.removeAttribute("title");
                } catch (e) {}
            }
        }
    }

    /** The row menu of a reference in none of your libraries (a right-click
     *  on its section row): Open in Browser. `anchor`: the row (its globe
     *  shows the lookup), `at`: the screen point. */
    _wvRefsWebMenu(reader: any, entry: WvRefsEntry, anchor: any, at?: number[]) {
        const P: any = this;
        try {
            const win: any = reader && reader._window;
            if (!win || !win.document || !entry || !entry.text) return;
            const doc = win.document;
            const old = doc.getElementById(MENU_ID);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const pop = refsMenuPopup(doc, P._wvWireTag());
            wvMenuItem(doc, {
                l10n: { id: "weavero-menu-refs-web" },
                attrs: { "data-wv-refs-act": "web" },
                iconClass: "zotero-menuitem-view-online",   // the items list's View Online globe
                onCommand: () => {
                    const lp: any = wvLivePlugin();
                    const globe = anchor && anchor.querySelector ? anchor.querySelector('.wv-refs-btn[data-wv-refs-act="web"]') : null;
                    return lp && lp._wvRefsWebOpen(reader, entry, globe);
                },
            }, pop);
            this._wvRefsMenuOpen(doc, pop, anchor, at);
        } catch (e) { Zotero.debug("[Weavero] references web menu err: " + e); }
    }

    // ---- the paper's list, row by row (B2 marks, C section) -------------------

    /** A line that is only a link or a DOI: the layout split it off its entry
     *  (paper 06 of the test library: "https://doi.org/..." on a line of its
     *  own, flagged as an entry). */
    _wvRefsIsFragment(text: string): boolean {
        return /^\s*(?:https?:\/\/\S+|doi:\s*\S+|10\.\d{4,9}\/\S+)\s*\.?\s*$/i.test(String(text || ""));
    }

    /** The paper's reference list with an answer for each entry, or null
     *  while the list or the index is not known yet. A fragment (a DOI line
     *  split off) is shown only when it names an item no neighbour names
     *  already; one without an answer belongs to its entry and is not shown.
     *  `have` / `total` count what is shown; `ft`: the list is a full text's (no
     *  positions; the library pane's alone -- a reader gets none of it, so no
     *  mark can come from it). Cached per index state. */
    _wvRefsDocRows(reader: any): { rows: Array<{ i: number; entry: WvRefsEntry; hit: WvRefsHit | null; shown: boolean }>; have: number; total: number; ft?: boolean } | null {
        const P: any = this;
        try {
            const ix: WvRefIndex = P._wvRefsIx;
            const entries: WvRefsEntry[] | null = (P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(reader.itemID)) || null;
            if (!entries || (entries.length && !ix)) return null;
            if (!reader.wvLib && ftLists.has(entries)) return null;
            const cache: Map<number, any> = P._wvRefsRowCache || (P._wvRefsRowCache = new Map());
            const had = cache.get(reader.itemID);
            const seq = ix ? ix.seq : -1;
            if (had && had.entries === entries && had.seq === seq) return had.res;
            // A long list is matched in short steps (_wvRefsDocRowsBuild): a book's 1314
            // entries took 457 ms in one task, after its page 1 (work/refs-perf-2026-11-20.md
            // "dev.42"). Meanwhile the answer it had, else none.
            if (entries.length > ROWS_SYNC_MAX) {
                this._wvRefsDocRowsBuild(reader).catch(() => {});
                return had && had.entries === entries ? had.res : null;
            }
            const hits = entries.length ? this._wvRefsHitsFor(reader, entries.map((e) => ({ text: e.text, pageIndex: NaN, rect: null }))) : [];
            return this._wvRefsRowsSet(reader, entries, seq, hits);
        } catch (e) { Zotero.debug("[Weavero] references rows err: " + e); return null; }
    }

    /** The rows of `entries` from their `hits`, cached at index state `seq`. */
    _wvRefsRowsSet(reader: any, entries: WvRefsEntry[], seq: number, hits: Array<WvRefsHit | null | undefined>): { rows: Array<{ i: number; entry: WvRefsEntry; hit: WvRefsHit | null; shown: boolean }>; have: number; total: number; ft?: boolean } | null {
        const P: any = this;
        try {
            const cache: Map<number, any> = P._wvRefsRowCache || (P._wvRefsRowCache = new Map());
            const best = (k: number) => { const h = hits[k]; return h ? h.ids[0] : null; };
            const rows = entries.map((entry, i) => {
                const hit = hits[i] || null;
                let shown = true;
                if (this._wvRefsIsFragment(entry.text)) {
                    const b = best(i);
                    shown = b != null && b !== best(i - 1) && b !== best(i + 1);
                }
                return { i, entry, hit, shown };
            });
            const vis = rows.filter((r) => r.shown);
            const res = { rows, have: vis.filter((r) => r.hit).length, total: vis.length, ft: ftLists.has(entries) };
            tlMark(reader, "match", { have: res.have, total: res.total });
            cache.set(reader.itemID, { entries, seq, res });
            while (cache.size > ENTRY_CACHE) cache.delete(cache.keys().next().value);
            return res;
        } catch (e) { Zotero.debug("[Weavero] references rows err: " + e); return null; }
    }

    /** A long list's rows built in short steps (BUILD_SLICE_MS of matching, then a
     *  yield), then what waits for them, a task each: the marks, the section. One build
     *  per paper at a time; a build overtaken by a change (another list read, the index
     *  changed) drops its result and the next read starts another. */
    _wvRefsDocRowsBuild(reader: any): Promise<void> {
        const P: any = this;
        const builds: Map<number, Promise<void>> = P._wvRefsRowBuilds || (P._wvRefsRowBuilds = new Map());
        const key = reader.itemID;
        const cur = builds.get(key);
        if (cur) return cur;
        const p: Promise<void> = Promise.resolve().then(async () => {
            try {
                const ix: WvRefIndex = P._wvRefsIx;
                const entries: WvRefsEntry[] | null = (P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(key)) || null;
                if (!ix || !entries) return;
                const seq = ix.seq;
                const self = this._wvRefsSelf(ix, reader);
                let citingLib: number | null = null;
                try { const a = Zotero.Items.get(key); citingLib = a ? a.libraryID : null; } catch (e) {}
                const hits: Array<WvRefsHit | null> = [];
                let t = Date.now();
                for (const e of entries) {
                    hits.push(e && e.text ? this._wvRefsMatchText(ix, e.text, self, citingLib) : null);
                    if (Date.now() - t >= BUILD_SLICE_MS) {
                        await wvSleep(0);
                        if (P._wvDestroyed) return;
                        t = Date.now();
                    }
                }
                if (P._wvDestroyed || P._wvRefsIx !== ix || ix.seq !== seq || !P._wvRefsEntriesNow || P._wvRefsEntriesNow.get(key) !== entries) return;
                this._wvRefsRowsSet(reader, entries, seq, hits);
                await wvSleep(0);
                const lp: any = wvLivePlugin();
                if (!lp) return;
                lp._wvRefsMarksDraw(reader);
                await refsAfterNextPaint(reader._iframeWindow);
                const l2: any = wvLivePlugin();
                if (!l2) return;
                l2._wvRefsSecRefreshFor(reader);
                l2._wvRefsBesideApply(reader);
            }
            catch (e) { Zotero.debug("[Weavero] references rows build err: " + e); }
            finally { if (builds.get(key) === p) builds.delete(key); }
        });
        builds.set(key, p);
        return p;
    }

    /** The marks' switch: the feature and its "reference list" box. */
    _wvRefsMarksOn(): boolean {
        try { return this._wvRefsOn() && !!this._wvPref("referencesBibliographyMarks"); } catch (e) { return false; }
    }

    /** The PDF views of `reader` (Zotero's same-file split has two), waived. */
    _wvRefsViews(reader: any): any[] {
        const out: any[] = [];
        try {
            const ir = Cu().waiveXrays(reader._internalReader);
            for (const v of [ir && ir._primaryView, ir && ir._secondaryView]) {
                try { if (v && v._iframeWindow && v._iframeWindow.PDFViewerApplication) out.push(v); } catch (e) {}
            }
        } catch (e) {}
        return out;
    }

    /** B2: a small mark in the margin beside each entry of the reference list
     *  that is an item of yours (● with a PDF, ○ without), in every PDF view
     *  of `reader`; a click on it opens the same choices as the popup's
     *  buttons, as a menu. Not in Reading Mode (it would sit on the hidden
     *  page view, as the bookmark pin does: reader-panels.ts _wvReaderShowPin).
     *  The marks live in a layer of their own inside `.pdfViewer`, a sibling
     *  of the pages (never inside `.page`: pdf.js rebuilds a page's children
     *  when it renders again -- reader.ts _ensureBadgeOverlay), one box per
     *  page placed at the page's offset, the marks in unscaled page units
     *  times pdf.js's `--scale-factor`, so a zoom moves them with the text by
     *  CSS alone; the page boxes follow a page's move synchronously from an
     *  observer of the viewer's and the pages' style (requestAnimationFrame is
     *  throttled in this frame -- the pin's note), and the view's resize (a
     *  page re-centred by layout alone). */
    _wvRefsMarksDraw(reader: any, tries = 0) {
        const P: any = this;
        try {
            if (!reader || reader.wvLib || (reader.type || reader._type) !== "pdf" || P._wvDestroyed) return;
            if (!this._wvRefsMarksOn() || this._wvReadingModeActive(reader)) { this._wvRefsMarksClear(reader); return; }
            const data = this._wvRefsDocRows(reader);
            if (!data) return;
            const views = this._wvRefsViews(reader);
            if (!views.length) {
                if (tries < 20) wvTimeout(() => { const lp: any = wvLivePlugin(); if (lp) lp._wvRefsMarksDraw(reader, tries + 1); }, 500);
                return;
            }
            // Every entry its mark, one you do not have the grey ring: which
            // entries were read and matched shows at a glance, and the ring opens
            // the reference online from the page (MJT 2026-11-20).
            const marks = data.rows.filter((r) => r.shown && r.entry.rects.length);
            for (const v of views) this._wvRefsMarksDrawIn(reader, v, marks, tries);
        } catch (e) { Zotero.debug("[Weavero] references marks err: " + e); }
    }

    /** Where a mark's centre goes beside an entry's first box ([page, x1, y1, x2,
     *  y2], PDF points): 8 points left of it, the same for every dot (a badge
     *  does not move it), and at its first line's middle. A
     *  box one line high (at most 14 points: Zotero gives a box per line for most
     *  lists) is centred on; a taller one (a box over the entry's lines) keeps 5
     *  points under its top. A fixed 5 points sat low on small type: an RSC
     *  list's 7-point lines put each dot 1.4 points under the middle (MJT
     *  2026-11-20, "How is the horizontal alignment done between the circles
     *  and the text?"). */
    _wvRefsMarkAnchor(box0: number[], badge: boolean, text?: Array<[number, number, number]> | null): [number, number] {
        const top0 = Math.max(box0[2], box0[4]), bot0 = Math.min(box0[2], box0[4]);
        const left = Math.min(box0[1], box0[3]), right = Math.max(box0[1], box0[3]);
        // One column for every dot, badge or not (MJT 2026-11-20: "I would like to
        // keep the horizontal alignment of the circles"): 8 points left of the
        // text, which leaves a badge (corner on the dot's centre, 6 points wide)
        // 2 points short of it. `badge` no longer moves the dot.
        void badge;
        const x = left - 8;
        // The letters themselves when the page's text is known (`text`: pdf.js
        // items, [x, baseline, size]): the middle between the first line's
        // baseline and its capitals' top, baseline + 0.33 x the type size. A
        // box from Zotero is no guide there: it covers several lines (a 2026
        // paper's entry: 19.3 points high, the dot 2 points under the letters'
        // middle) or reaches below the baseline (MJT 2026-11-20, "I would like to
        // get the vertical alignment on the text. It does not look correct").
        if (text && text.length) {
            const inBox = text.filter((t) => t[0] >= left - 2 && t[0] <= right && t[1] >= bot0 - 1 && t[1] <= top0 + 1 && t[2] > 0);
            if (inBox.length) {
                const maxS = Math.max(...inBox.map((t) => t[2]));
                // The first line: the highest baseline at full size (not a superscript).
                let first: [number, number, number] | null = null;
                for (const t of inBox) if (t[2] >= 0.8 * maxS && (!first || t[1] > first[1])) first = t;
                if (first) return [x, first[1] + 0.33 * first[2]];
            }
        }
        const y = top0 - bot0 > 0 && top0 - bot0 <= 14 ? (top0 + bot0) / 2 : top0 - 5;
        return [x, y];
    }

    _wvRefsMarksDrawIn(reader: any, v: any, marks: any[], tries: number) {
        const P: any = this;
        const win = v._iframeWindow;
        const doc = win.document;
        const app = win.PDFViewerApplication;
        const viewer = doc.querySelector(".pdfViewer");
        const pages = app && app.pdfViewer && app.pdfViewer._pages;
        if (!viewer || !pages || !pages.length) {
            if (tries < 20) wvTimeout(() => { const lp: any = wvLivePlugin(); if (lp) lp._wvRefsMarksDraw(reader, tries + 1); }, 500);
            return;
        }
        const tag = P._wvWireTag();
        // The citing paper's own DOIs: a grey ring's tooltip never offers them.
        const selfDOIs = this._wvRefsSelfDOIs(reader);
        // Where each mark goes too: a list read again from a changed file puts
        // the same entries elsewhere (1.2.1-refs.9).
        const sig = marks.map((r) => r.i + ":" + (r.hit ? r.hit.ids[0] + ":" + (r.hit.pdf ? 1 : 0) + ":" + (r.hit.away == null ? "" : r.hit.away) + (r.hit.amb ? ":?" + r.hit.amb.join("/") : "") : "w")
            + "@" + r.entry.rects[0].map((v: number) => Math.round(v)).join("/")).join(",");
        let layer = viewer.querySelector(":scope > .wv-refs-marks");
        if (layer && layer.getAttribute("data-wv-tag") === tag && layer.getAttribute("data-wv-refs-sig") === sig) return;
        if (layer) this._wvRefsMarksClearIn(doc);
        if (!marks.length) return;
        wvInjectStyle(doc, MARKS_STYLE_ID, MARKS_CSS);
        layer = wvHtmlEl(doc, "div", "wv-refs-marks");
        layer.setAttribute("data-wv-tag", tag);
        layer.setAttribute("data-wv-refs-sig", sig);
        const boxes = new Map<number, any>();
        const boxOf = (pageIndex: number) => {
            let b = boxes.get(pageIndex);
            if (!b) {
                b = wvHtmlEl(doc, "div", "wv-refs-marks-page", undefined, layer);
                b.setAttribute("data-wv-page", String(pageIndex));
                boxes.set(pageIndex, b);
            }
            return b;
        };
        const placed: Array<{ m: any; box0: number[]; badge: boolean; pageIndex: number }> = [];
        const beside = this._wvRefsBesideEntries(reader);
        for (const r of marks) {
            const box0 = r.entry.rects[0];
            const pageIndex = box0[0];
            const pageView = pages[pageIndex];
            if (!pageView || !pageView.viewport) continue;
            const vp = pageView.viewport;
            const sf = vp.scale || 1;
            const badge = r.hit ? this._wvRefsBadge(r.hit) : null;
            // Beside the first line: left of the entry's box, a little under
            // its top; 3 points further left with a library badge, which
            // reaches 6 points to the right of the mark's centre (MARKS_CSS),
            // so it ends short of the entry's text.
            const at = this._wvRefsMarkAnchor(box0, !!badge);
            const p = vp.convertToViewportPoint(at[0], at[1]);
            const ux = p[0] / sf, uy = p[1] / sf;
            const m = wvHtmlEl(doc, "span", "wv-refs-bibmark", undefined, boxOf(pageIndex));
            m.setAttribute("data-wv-refs-ids", r.hit ? r.hit.ids.join(",") : "");
            m.setAttribute("data-wv-refs-entry", String(r.i));
            // A dot: its title tooltip (two lines). The grey ring: Weavero's URL tip
            // draws its lines, the link coloured (reader.ts _wvExtTipShow,
            // _wvRefsWebTipLines) -- no title, or the native one would show too; the
            // same words as its label.
            const tipText = this._wvRefsMarkTip(reader, r.hit, r.entry, selfDOIs);
            if (r.hit) m.setAttribute("title", tipText);
            else m.setAttribute("aria-label", tipText);
            m.style.left = "calc(" + ux + "px * var(--scale-factor, 1))";
            m.style.top = "calc(" + uy + "px * var(--scale-factor, 1))";
            // Hidden until its page's text has placed it (below).
            m.setAttribute("data-wv-refs-wait", "");
            drawMark(doc, m, refsHitKind(r.hit), {}, badge, !!(r.hit && r.hit.amb));
            if (beside.has(r.i)) m.setAttribute("data-wv-refs-beside", "");
            placed.push({ m, box0, badge: !!badge, pageIndex });
        }
        // A press on a mark is the mark's: pdf-view's own handlers (selection,
        // annotation tools) never see it; the click opens the menu (the view's
        // frame is not reader.html: no FocusManager there, as for the
        // annotation badges, reader.ts _processNoteAnnotationOverlays).
        const stop = (e: any) => { try { if (e.target && e.target.closest && e.target.closest(".wv-refs-bibmark")) { e.stopPropagation(); e.preventDefault(); } } catch (er) {} };
        layer.addEventListener("pointerdown", stop, true);
        layer.addEventListener("mousedown", stop, true);
        layer.addEventListener("click", (e: any) => {
            try {
                const m = e.target && e.target.closest ? e.target.closest(".wv-refs-bibmark") : null;
                if (!m || e.button !== 0) return;
                e.stopPropagation(); e.preventDefault();
                const lp: any = wvLivePlugin();
                if (!lp) return;
                // The grey ring: the reference online, at once (Open in Browser,
                // _wvRefsWebOpen: its own link, a DOI, else a lookup).
                if (m.getAttribute("data-wv-refs-kind") === "web") {
                    const d = lp._wvRefsDocRows(reader);
                    const row = d && d.rows.find((x: any) => String(x.i) === m.getAttribute("data-wv-refs-entry"));
                    if (row) { const p = lp._wvRefsWebOpen(reader, row.entry, m); if (p && typeof p.catch === "function") p.catch(() => {}); }
                    return;
                }
                const ids = String(m.getAttribute("data-wv-refs-ids") || "").split(",").map(Number).filter((x) => x > 0);
                lp._wvRefsMenu(reader, ids, "none", m, { opens: true });
            } catch (er) {}
        }, true);
        viewer.appendChild(layer);
        tlMark(reader, "marks", { marksN: placed.length });
        // Each dot on its letters' middle once its page's text is read (pdf.js,
        // once per page; _wvRefsMarkAnchor), and shown only then, ONCE, where it
        // stays: drawn from the box and moved by the text, a dot was seen to jump
        // on every first open (MJT 2026-11-24, "The circles first appeared at a
        // position, then shifted up. Why?"). Hidden by visibility, so nothing is
        // laid out again. A page whose text is empty shows its dots at the box's
        // place at once; one whose text does not come within MARK_TEXT_WAIT_MS
        // shows them there then -- a mark is never lost -- and its text, if it
        // comes later, still moves them. `data-wv-refs-text` says the text is done,
        // for the spec. Guard: refs.spec.js "B2: a mark shows once".
        {
            const show = (list: typeof placed) => { for (const pm of list) { try { pm.m.removeAttribute("data-wv-refs-wait"); } catch (er) {} } };
            const byPage = new Map<number, typeof placed>();
            for (const pm of placed) { const a = byPage.get(pm.pageIndex) || []; a.push(pm); byPage.set(pm.pageIndex, a); }
            wvTimeout(() => { if (layer.isConnected) show(placed); }, MARK_TEXT_WAIT_MS);
            Promise.all(Array.from(byPage.entries()).map(([pi, list]) => refsPageText(app, pi).then((text) => {
                try {
                    const lp: any = wvLivePlugin();
                    const pg = pages[pi];
                    const vp = pg && pg.viewport;
                    if (!lp || !layer.isConnected || !vp || !text.length) return;
                    const sf = vp.scale || 1;
                    for (const pm of list) {
                        const at = lp._wvRefsMarkAnchor(pm.box0, pm.badge, text);
                        const q = vp.convertToViewportPoint(at[0], at[1]);
                        pm.m.style.left = "calc(" + (q[0] / sf) + "px * var(--scale-factor, 1))";
                        pm.m.style.top = "calc(" + (q[1] / sf) + "px * var(--scale-factor, 1))";
                    }
                } catch (er) {}
                finally { show(list); }
            }))).then(() => { try { layer.setAttribute("data-wv-refs-text", "1"); } catch (er) {} }, () => {});
        }
        const place = () => {
            if (!layer.isConnected) { try { layer._wvRefsObs && layer._wvRefsObs.disconnect(); } catch (er) {} return; }
            wvPlaceOnPages(boxes, pages);
        };
        place();
        try {
            const init = wvCloneFor({ attributes: true, attributeFilter: ["style"] }, win);
            const mo = new win.MutationObserver(() => refsPlaceSoon(layer, win, boxes, pages));
            mo.observe(viewer, init);
            for (const pi of boxes.keys()) { const pg = pages[pi] && pages[pi].div; if (pg) mo.observe(pg, init); }
            layer._wvRefsObs = mo;
        } catch (e) {}
        // A view that narrows or widens re-centres its pages by layout alone:
        // at a fixed zoom no page changes size, nothing changes a style, and
        // the boxes kept the wider page's left -- after Open Beside This Paper
        // the citing side narrowed and its marks sat mid-line (MJT
        // 2026-11-19). The view's resize places them again: at once (reading
        // offsetLeft lays the page out) and in the next frame, after pdf.js's
        // own resize handler (a named zoom, "page-width", rescales there; its
        // style change reaches the observer too). Keyed (lib/listen.ts), one
        // per view, given back with the layer (_wvRefsMarksClearIn).
        try {
            wvUnlisten(win, MARKS_RESIZE_KEY);
            wvListen(win, MARKS_RESIZE_KEY, "resize", () => {
                place();
                try { win.requestAnimationFrame(() => place()); } catch (er) {}
            }, false, tag);
        } catch (e) {}
    }

    // ---- the paper open beside (Weavero's split view) ---------------------------

    /** The paper open on the other side of `reader`'s split, the split on screen: its
     *  attachment and its parent item; none when `reader` is not a side of it. */
    _wvRefsBesideIDs(reader: any): number[] {
        const P: any = this;
        try {
            const win = reader && reader._window;
            const Z = win && win.Zotero_Tabs;
            if (!Z || !reader.tabID || typeof P._wvTabSplitShownOf !== "function" || !P._wvTabSplitOn()) return [];
            const s = P._wvTabSplitShownOf(win, Z.selectedID);
            if (!s || s.picker || (s.left !== reader.tabID && s.right !== reader.tabID)) return [];
            const other = s.left === reader.tabID ? s.right : s.left;
            const r2: any = other ? Zotero.Reader.getByTabID(other) : null;
            const att: any = r2 ? Zotero.Items.get(r2.itemID) : null;
            if (!att) return [];
            const out = [att.id];
            if (att.parentItemID) out.push(att.parentItemID);
            return out.sort((a, b) => a - b);
        } catch (e) { return []; }
    }

    /** The entries of `reader`'s reference list that are the paper open beside it. */
    _wvRefsBesideEntries(reader: any): Set<number> {
        const out = new Set<number>();
        try {
            const ids = this._wvRefsBesideIDs(reader);
            if (!ids.length) return out;
            const data = this._wvRefsDocRows(reader);
            if (!data) return out;
            for (const r of data.rows) if (r.hit && r.hit.ids.some((id: number) => ids.indexOf(id) >= 0)) out.add(r.i);
        } catch (e) {}
        return out;
    }

    /** Every reader of main window `win` (a split changed, a tab was selected). */
    _wvRefsBesideSyncWin(win: any) {
        try {
            for (const r of (Zotero.Reader._readers || []) as any[]) {
                try { if (r && r._window === win && r._wvRefsMO) this._wvRefsBesideApply(r); } catch (e) {}
            }
        } catch (e) {}
    }

    /** The paper open beside `reader` marked in it, or the marks taken away: the
     *  entry's margin mark ringed and its References row barred (attributes, at once),
     *  every in-text citation of it boxed (_wvRefsBesideBoxes). While a paper is beside,
     *  looked at again every 1.5 s: the citations of a page arrive with its structure
     *  data and Zotero 11 drops a page's data out of view (a signature keeps it cheap). */
    _wvRefsBesideApply(reader: any) {
        try {
            if (!reader || reader.wvLib || (reader.type || reader._type) !== "pdf") return;
            const st = refsBesideOf(reader);
            if (st.t) { wvClearTimeout(st.t); st.t = null; }
            // Looked at again for as long as a paper is beside, found in the list or not,
            // and the marks left as drawn while the rows are unknown (the index or a long
            // list being rebuilt): the look stopped at the first pass that found no entry,
            // and the boxes and ring stayed off for good (MJT 2026-11-20, "no square around
            // [13] again", after an index rebuild).
            const ids = this._wvRefsOn() ? this._wvRefsBesideIDs(reader) : [];
            const again = () => {
                st.t = wvTimeout(() => {
                    const lp: any = wvLivePlugin();
                    if (lp && (Zotero.Reader._readers || []).indexOf(reader) >= 0) lp._wvRefsBesideApply(reader);
                }, 1500);
            };
            if (ids.length && !this._wvRefsDocRows(reader)) { again(); return; }
            const entries = ids.length ? this._wvRefsBesideEntries(reader) : new Set<number>();
            for (const v of this._wvRefsViews(reader)) {
                try {
                    for (const m of Array.from(v._iframeWindow.document.querySelectorAll(".wv-refs-bibmark[data-wv-refs-entry]")) as any[]) {
                        const on = entries.has(Number(m.getAttribute("data-wv-refs-entry")));
                        if (on !== m.hasAttribute("data-wv-refs-beside")) { if (on) m.setAttribute("data-wv-refs-beside", ""); else m.removeAttribute("data-wv-refs-beside"); }
                    }
                } catch (e) {}
            }
            this._wvRefsBesideRows(reader, entries);
            this._wvRefsBesideBoxes(reader, entries.size ? ids : []);
            if (ids.length) again();
        } catch (e) { Zotero.debug("[Weavero] references beside err: " + e); }
    }

    _wvRefsBesideRows(reader: any, entries: Set<number>) {
        for (const body of Array.from(secBodies.keys())) {
            try {
                if (!body.isConnected) continue;
                const el = body.closest && body.closest("item-pane-custom-section");
                if (!el || this._wvRefsSecReader(body, el.item, body.ownerDocument) !== reader) continue;
                for (const row of Array.from(body.querySelectorAll(".wv-refs-sec-row[data-wv-refs-entry]")) as any[]) {
                    const on = entries.has(Number(row.getAttribute("data-wv-refs-entry")));
                    if (on !== row.hasAttribute("data-wv-refs-beside")) { if (on) row.setAttribute("data-wv-refs-beside", ""); else row.removeAttribute("data-wv-refs-beside"); }
                }
            } catch (e) {}
        }
    }

    /** The in-text citations of the beside paper (`ids`: its attachment and item),
     *  boxed: the loaded pages' citation overlays (Zotero's, `pv._pdfPages[i].overlays`)
     *  whose references match it as the citation popup matches them (_wvRefsHitsFor), a
     *  box round each of their rects -- in a layer of their own like the marks'
     *  (`.wv-refs-beside`, per-page boxes at the page's offset, sizes in unscaled units
     *  times `--scale-factor`, placed again on a style change and a resize). The matching
     *  runs again only when the loaded pages' citations change (`data-wv-refs-pre`). */
    _wvRefsBesideBoxes(reader: any, ids: number[]) {
        const P: any = this;
        for (const v of this._wvRefsViews(reader)) {
            try {
                const win = v._iframeWindow;
                const doc = win.document;
                const app = win.PDFViewerApplication;
                const viewer = doc.querySelector(".pdfViewer");
                const pages = app && app.pdfViewer && app.pdfViewer._pages;
                const old = viewer && viewer.querySelector(":scope > .wv-refs-beside");
                if (!ids.length || !viewer || !pages || !pages.length) { if (old) this._wvRefsBesideClearIn(doc); continue; }
                const pd: any = v._pdfPages || {};
                const tag = P._wvWireTag();
                let pre = ids.join(",") + "|";
                for (let pi = 0; pi < pages.length; pi++) { const ovs = pd[pi] && pd[pi].overlays; if (ovs) pre += pi + ":" + ovs.length + ","; }
                if (old && old.getAttribute("data-wv-tag") === tag && old.getAttribute("data-wv-refs-pre") === pre) continue;
                const found: Array<{ pi: number; rect: number[] }> = [];
                const cands: Array<{ pi: number; rects: number[][]; lo: number; key: string }> = [];
                let unknown = false;
                for (let pi = 0; pi < pages.length; pi++) {
                    const ovs = pd[pi] && pd[pi].overlays;
                    if (!ovs) continue;
                    for (const o of Array.from(ovs) as any[]) {
                        try {
                            if (!o || o.type !== "citation") continue;
                            const refs = (Array.from(o.references || []) as any[]).map((ref: any) => refsRefShape(ref));
                            const hits = this._wvRefsHitsFor(reader, refs);
                            // Not known yet (the index or the list still loading): look again.
                            if (hits.some((h: any) => h === undefined)) unknown = true;
                            const mine = hits.some((h: any) => !!h && h.ids.some((id: number) => ids.indexOf(id) >= 0));
                            if (!mine) continue;
                            const opi = num(o.position && o.position.pageIndex);
                            const rects: number[][] = [];
                            for (const rc of Array.from((o.position && o.position.rects) || []) as any[]) {
                                const q = [num(rc[0]), num(rc[1]), num(rc[2]), num(rc[3])];
                                if (q.every((x) => Number.isFinite(x)) && Number.isFinite(opi)) rects.push(q);
                            }
                            if (!rects.length) continue;
                            // How much of it the PDF's own link covers (an "internal-link"
                            // overlay of the same page): the largest shared area, 0 for none.
                            let lo = 0;
                            for (const l of Array.from(ovs) as any[]) {
                                if (!l || l.type !== "internal-link") continue;
                                for (const lr of Array.from((l.position && l.position.rects) || []) as any[]) {
                                    const L = [num(lr[0]), num(lr[1]), num(lr[2]), num(lr[3])];
                                    for (const q of rects) {
                                        const w = Math.min(q[2], L[2]) - Math.max(q[0], L[0]), h = Math.min(q[3], L[3]) - Math.max(q[1], L[1]);
                                        if (w > 0 && h > 0) lo = Math.max(lo, w * h);
                                    }
                                }
                            }
                            cands.push({ pi: opi, rects, lo, key: opi + "|" + refs.map((r: any) => r.text).join("\u0001") });
                        } catch (e) {}
                    }
                }
                // A PDF holding its text twice (a hidden copy a few points off: Liu et al.
                // 2021, Sensors) gives Zotero two citations for each one, the second on
                // other words or overlapping the first ("-II" for "[13]"; MJT 2026-11-20,
                // "Why the square around the II?"). Of the citations naming the same
                // references on a page: the PDF's own link sits on the visible text, so when
                // some are under a link the others go, and of two that overlap the one the
                // link covers most stays. Separate places citing the same references all
                // keep their box; a PDF without links keeps every place once.
                {
                    const overlap = (a: number[][], b: number[][]) => a.some((p) => b.some((q) => Math.min(p[2], q[2]) > Math.max(p[0], q[0]) && Math.min(p[3], q[3]) > Math.max(p[1], q[1])));
                    const groups = new Map<string, typeof cands>();
                    for (const c of cands) { const g = groups.get(c.key) || []; g.push(c); groups.set(c.key, g); }
                    for (const g of groups.values()) {
                        const anyLinked = g.some((c) => c.lo > 0);
                        const kept: typeof cands = [];
                        for (const c of g.slice().sort((a, b) => b.lo - a.lo)) {
                            if (anyLinked && c.lo <= 0) continue;
                            if (kept.some((k) => overlap(k.rects, c.rects))) continue;
                            kept.push(c);
                        }
                        for (const c of kept) for (const rect of c.rects) found.push({ pi: c.pi, rect });
                    }
                }
                if (old) this._wvRefsBesideClearIn(doc);
                wvInjectStyle(doc, MARKS_STYLE_ID, MARKS_CSS);
                // The layer even with no citation found yet: it keeps `pre`, so the
                // matching waits for the pages' citations to change.
                const layer = wvHtmlEl(doc, "div", "wv-refs-beside");
                layer.setAttribute("data-wv-tag", tag);
                layer.setAttribute("data-wv-refs-pre", unknown ? "" : pre);
                const boxes = new Map<number, any>();
                for (const f of found) {
                    const pv = pages[f.pi];
                    if (!pv || !pv.viewport) continue;
                    const vp = pv.viewport;
                    const sf = vp.scale || 1;
                    // Two points, numbers only: an array made here is refused by the
                    // reader's page ("Permission denied to pass object", src-ts.md),
                    // as the marks' anchor passes its point.
                    const a = vp.convertToViewportPoint(f.rect[0], f.rect[1]);
                    const c = vp.convertToViewportPoint(f.rect[2], f.rect[3]);
                    const x1 = Math.min(a[0], c[0]) / sf, x2 = Math.max(a[0], c[0]) / sf;
                    const y1 = Math.min(a[1], c[1]) / sf, y2 = Math.max(a[1], c[1]) / sf;
                    let b = boxes.get(f.pi);
                    if (!b) { b = wvHtmlEl(doc, "div", "wv-refs-beside-page", undefined, layer); b.setAttribute("data-wv-page", String(f.pi)); boxes.set(f.pi, b); }
                    const box = wvHtmlEl(doc, "div", "wv-refs-beside-box", undefined, b);
                    // A point of room round the citation's letters, at every zoom.
                    box.style.left = "calc(" + (x1 - 1) + "px * var(--scale-factor, 1))";
                    box.style.top = "calc(" + (y1 - 1) + "px * var(--scale-factor, 1))";
                    box.style.width = "calc(" + (x2 - x1 + 2) + "px * var(--scale-factor, 1))";
                    box.style.height = "calc(" + (y2 - y1 + 2) + "px * var(--scale-factor, 1))";
                }
                viewer.appendChild(layer);
                const place = () => {
                    if (!layer.isConnected) { try { layer._wvRefsObs && layer._wvRefsObs.disconnect(); } catch (er) {} return; }
                    wvPlaceOnPages(boxes, pages);
                };
                place();
                try {
                    const init = wvCloneFor({ attributes: true, attributeFilter: ["style"] }, win);
                    const mo = new win.MutationObserver(() => refsPlaceSoon(layer, win, boxes, pages));
                    mo.observe(viewer, init);
                    for (const pi of boxes.keys()) { const pg = pages[pi] && pages[pi].div; if (pg) mo.observe(pg, init); }
                    layer._wvRefsObs = mo;
                } catch (e) {}
                try {
                    wvUnlisten(win, BESIDE_RESIZE_KEY);
                    wvListen(win, BESIDE_RESIZE_KEY, "resize", () => { place(); try { win.requestAnimationFrame(() => place()); } catch (er) {} }, false, tag);
                } catch (e) {}
            } catch (e) { Zotero.debug("[Weavero] references beside boxes err: " + e); }
        }
    }

    _wvRefsBesideClearIn(doc: any) {
        for (const layer of Array.from(doc.querySelectorAll(".wv-refs-beside")) as any[]) {
            try { layer._wvRefsObs && layer._wvRefsObs.disconnect(); } catch (e) {}
            try { delete layer._wvRefsObs; } catch (e) {}
            layer.remove();
        }
        try { if (doc.defaultView) wvUnlisten(doc.defaultView, BESIDE_RESIZE_KEY); } catch (e) {}
    }

    /** The marks of `reader`'s views, their layer and observer. */
    _wvRefsMarksClear(reader: any) {
        for (const v of this._wvRefsViews(reader)) { try { this._wvRefsMarksClearIn(v._iframeWindow.document); } catch (e) {} }
    }

    _wvRefsMarksClearIn(doc: any) {
        for (const layer of Array.from(doc.querySelectorAll(".wv-refs-marks")) as any[]) {
            try { layer._wvRefsObs && layer._wvRefsObs.disconnect(); } catch (e) {}
            try { delete layer._wvRefsObs; } catch (e) {}
            layer.remove();
        }
        try { if (doc.defaultView) wvUnlisten(doc.defaultView, MARKS_RESIZE_KEY); } catch (e) {}
        wvRemoveStyle(doc, MARKS_STYLE_ID);
    }

    // ---- C: the References section of the reader's item pane ---------------

    /** The section's switch: the feature and its "References section" box. */
    _wvRefsSectionOn(): boolean {
        try { return this._wvRefsOn() && !!this._wvPref("referencesSection"); } catch (e) { return false; }
    }

    _wvRefsApplySectionPref() {
        const P: any = this;
        if (REFS_SECTION.enabled(P)) P._wvBlRegisterSectionFor(REFS_SECTION);
        else P._wvBlUnregisterSectionFor(REFS_SECTION);
    }

    /** The PDF reader a section body belongs to: its item pane's tab (a
     *  reader tab's context pane), else a reader of the item in the same
     *  window (a reader window's own item pane). In the LIBRARY's item pane
     *  (1.2.1-refs.7) the stand-in of _wvRefsLibCtx: the item's PDF that has
     *  a structure cache, read from that cache alone. */
    _wvRefsSecReader(body: any, item: any, doc: any): any {
        try {
            if (!item) return null;
            const ofItem = (r: any) => {
                if (!r || (r.type || r._type) !== "pdf") return false;
                if (r.itemID === item.id) return true;
                try { const a = Zotero.Items.get(r.itemID); return !!(a && a.parentItemID === item.id); } catch (e) { return false; }
            };
            const det = body && body.closest ? body.closest("item-details") : null;
            const inLibrary = !!det && (det.tabType === "library" || !!(det.closest && det.closest("#zotero-item-pane")));
            if (inLibrary) return this._wvRefsLibCtx(item, doc && doc.defaultView);
            const tabID = det && (det.tabID || (det.dataset && det.dataset.tabId));
            if (tabID) {
                const r = Zotero.Reader.getByTabID(tabID);
                return ofItem(r) ? r : null;
            }
            const w = doc && doc.defaultView;
            return (Zotero.Reader._readers || []).find((r: any) => { try { return r._window === w && ofItem(r); } catch (e) { return false; } }) || null;
        } catch (e) { return null; }
    }

    _wvRefsSecInit({ body, doc, refresh }: any) {
        const P: any = this;
        try {
            P._wvBlEnsureFtl(doc.defaultView);
            wvInjectStyle(doc, SEC_STYLE_ID, SEC_CSS);
            secBodies.set(body, refresh);
            P._wvLfSectionInit(body, doc);
        } catch (e) {}
    }

    _wvRefsSecDestroy({ body }: any) {
        try { secBodies.delete(body); } catch (e) {}
        try { refsSecLast.delete(body); } catch (e) {}
        try { (this as any)._wvLfSectionDestroy(body); } catch (e) {}
    }

    _wvRefsSecItemChange({ body, doc, item, setEnabled, setL10nArgs }: any) {
        try {
            const reader = this._wvRefsSecReader(body, item, doc);
            const data = reader ? this._wvRefsDocRows(reader) : null;
            // Shown when the paper has a reference list (Zotero's, or a numbered
            // list read where it flagged none: lib/ref-list.ts).
            setEnabled(!!(data && data.total));
            if (data) this._wvRefsSecHeader(body, doc, setL10nArgs, data);
            // Not known yet: read it; its end shows the section
            // (_wvRefsPrepare -> _wvRefsSecRefreshFor).
            // A paper still opening: its own prepare, after its first page
            // (_wvRefsAfterFirstPaint), shows the section.
            else if (reader && this._wvRefsOn() && (reader.wvLib || refsPainted.has(reader))) this._wvRefsPrepare(reader).catch(() => {});
        } catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    _wvRefsSecRender({ body, item, doc, setL10nArgs }: any) {
        try {
            const reader = this._wvRefsSecReader(body, item, doc);
            const data = reader ? this._wvRefsDocRows(reader) : null;
            if (!reader || !data) return;
            this._wvRefsSecBuild(body, doc, reader, data);
            this._wvRefsSecHeader(body, doc, setL10nArgs, data);
        } catch (e) { Zotero.debug("[Weavero] references section err: " + e); }
    }

    async _wvRefsSecAsyncRender({ body, item, doc, setL10nArgs, setEnabled }: any) {
        try {
            const reader = this._wvRefsSecReader(body, item, doc);
            if (!reader) return;
            if (!this._wvRefsDocRows(reader)) {
                // A paper still opening: not in the item pane's render, which runs while
                // the PDF opens -- its own prepare, after its first page, refreshes the
                // section (_wvRefsAfterFirstPaint).
                if (!reader.wvLib && !refsPainted.has(reader)) return;
                await this._wvRefsPrepare(reader);
            }
            if (!body.isConnected) return;
            const data = this._wvRefsDocRows(reader);
            if (!data) return;
            try { setEnabled(!!data.total); } catch (e) {}
            this._wvRefsSecBuild(body, doc, reader, data);
            this._wvRefsSecHeader(body, doc, setL10nArgs, data);
        } catch (e) { Zotero.debug("[Weavero] references section err: " + e); }
    }

    /** "104 References", as Zotero counts its own sections ("0 Tags", "1
     *  Attachment"). How many are in your library is the blue dot's chip beside it:
     *  the header said it too ("References · 102 of 104 in your library") until MJT
     *  2026-11-20, "This 13 is the same information as the blue circle filter, so
     *  only need to say 20 References". */
    _wvRefsSecHeader(body: any, doc: any, setL10nArgs: any, data: { have: number; total: number }) {
        try { setL10nArgs(JSON.stringify({ state: data.total ? "counted" : "none", total: data.total })); } catch (e) {}
        try {
            const sec = body && body.closest && body.closest("collapsible-section");
            if (sec) { if ("empty" in sec) sec.empty = !data.total; else wvSetBoolAttr(sec, "empty", !data.total); }
            if (sec && doc && doc.l10n && typeof doc.l10n.translateElements === "function") {
                const p = doc.l10n.translateElements([sec]);
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) {}
    }

    /** The section's filter chips, Weavero's filter design (MJT 2026-11-20, "The
     *  filters should follow the Weavero filters design: use icons (blue dot, empty
     *  circle, ...), allow negative selection if relevant"): the Backlinks / Item
     *  Links counts' look and gestures (pane-scope.ts _wvScopeSetCounts, the
     *  constants.ts .wv-scope-count rules) -- an icon and a number; a click shows
     *  that kind alone (several: any of them), Alt+click hides it, the same
     *  gesture again undoes it. The kinds a reference is exactly one of -- in your
     *  library with a PDF (the blue dot), without one (the ring), not in your
     *  libraries (the globe) -- on one grey card; "only in another library" (the
     *  marks' badge) cuts across them, after it. A chip shows when its count is
     *  above 0 or its state is on (an active filter stays in reach). Per window,
     *  for the session. On the header's line when it fits, else on a row of their
     *  own above the list (MJT: "See if it fits in the header line. But I will
     *  probably add more filters later") -- moved, never dropped. */
    _wvRefsSecChips(body: any, doc: any, reader: any, data: any, host: any, st: { inc: string[]; exc: string[] }) {
        try {
            const win = doc.defaultView;
            const sec = body.closest ? body.closest("collapsible-section") : null;
            const title = sec ? sec.querySelector(":scope > .head .title") : null;
            const counts: Record<string, number> = { pdf: 0, nopdf: 0, web: 0, away: 0 };
            for (const r of data.rows) {
                if (!r.shown) continue;
                counts[refsChipKind(r)]++;
                if (r.hit && r.hit.away != null) counts.away++;
            }
            const named = (k: string) => st.inc.indexOf(k) >= 0 || st.exc.indexOf(k) >= 0;
            const kinds = ["pdf", "nopdf", "web"].filter((k) => counts[k] > 0 || named(k));
            const away = counts.away > 0 || named("away");
            const sig = kinds.map((k) => k + counts[k]).join(",") + (away ? ";away" + counts.away : "") + "|" + st.inc.join("+") + "/" + st.exc.join("+");
            const tb = title ? title.parentNode : null;
            const olds: any[] = Array.from(doc.querySelectorAll(".wv-refs-chips")).filter((c: any) => (tb && c.parentNode === tb) || host.contains(c));
            const old = olds[0] || null;
            for (const o of olds.slice(1)) o.remove();
            if (old && old._wvRefsSig === sig) { this._wvRefsChipsPlace(old, title, host); return; }
            if (old) old.remove();
            if (!kinds.length && !away) { const bar = host.querySelector(":scope > .wv-refs-sec-bar"); if (bar) bar.remove(); return; }
            const el = wvHtmlEl(doc, "span", "wv-scope-counts wv-refs-chips");
            el._wvRefsSig = sig;
            const card = kinds.length ? wvHtmlEl(doc, "span", "wv-scope-kinds wv-scope-or-group", undefined, el) : null;
            const chip = (k: string, parent: any) => {
                const c = wvHtmlEl(doc, "span", "wv-scope-count", undefined, parent);
                c.dataset.kind = k;
                const ic = wvHtmlEl(doc, "span", "wv-refs-chip-ic", undefined, c);
                ic.dataset.kind = k;
                // The marks themselves -- green dot, blue dot, grey ring -- and the
                // library's temple for "only in another library".
                if (k !== "away") drawMark(doc, ic, k as RefsMarkKind, {}, null);
                else {
                    const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16" }, ic);
                    for (const [t, a] of WV_LIB_BADGE_SHAPES) wvSvgEl(doc, t, a, svg);
                }
                wvHtmlEl(doc, "span", "wv-scope-count-n", String(counts[k]), c);
                const v = st.inc.indexOf(k) >= 0 ? 1 : st.exc.indexOf(k) >= 0 ? -1 : 0;
                if (v === 1) c.dataset.selected = "true";
                else if (v === -1) c.dataset.excluded = "true";
                c.setAttribute("role", "button");
                c.setAttribute("tabindex", "0");
                c.setAttribute("aria-pressed", v === 1 ? "true" : "false");
                c.title = wvStr("weavero-refs-chip", { kind: k, count: counts[k] }, "title") + "\n"
                    + wvStr("weavero-scope-toggle-hint", { state: v === 1 ? "only" : v === -1 ? "hidden" : "off" });
                // The press is the chip's: the header must not fold (collapsibleSection.js).
                const fire = (alt: boolean) => {
                    try {
                        const cur = secChips.get(win) || { inc: [], exc: [] };
                        const on = alt ? cur.exc : cur.inc, off = alt ? cur.inc : cur.exc;
                        const next = on.indexOf(k) >= 0
                            ? { on: on.filter((x) => x !== k), off }
                            : { on: on.concat(k), off: off.filter((x) => x !== k) };
                        secChips.set(win, alt ? { inc: next.off, exc: next.on } : { inc: next.on, exc: next.off });
                        refsHoldPaneScroll(body);
                        const lp: any = wvLivePlugin();
                        if (lp) lp._wvRefsSecBuild(body, doc, reader, lp._wvRefsDocRows(reader) || data);
                    } catch (e) {}
                };
                c.addEventListener("click", (e: any) => { e.preventDefault(); e.stopPropagation(); fire(!!e.altKey); });
                c.addEventListener("keydown", (e: any) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault(); e.stopPropagation();
                    fire(!!e.altKey);
                });
            };
            for (const k of kinds) chip(k, card);
            if (away) chip("away", el);
            this._wvRefsChipsPlace(el, title, host);
        } catch (e) { Zotero.debug("[Weavero] references chips err: " + e); }
    }

    /** The chips on the header's line when they fit in it, else on a row above
     *  the list; the header's box watched, so they come back when it widens.
     *  The sort's field label in the header (list-filter.ts) yields first: it is
     *  narrowed, down to a few letters, before the chips leave the header's line
     *  -- and once they have left, before the title is cut (lfsort.1). */
    _wvRefsChipsPlace(el: any, title: any, host: any) {
        try {
            const P: any = this;
            const doc = el.ownerDocument;
            const tb = title ? title.parentNode : null;
            let bar = host.querySelector(":scope > .wv-refs-sec-bar");
            if (tb) {
                const head = tb.parentNode;
                if (!tb.hasAttribute("data-wv-counts")) tb.setAttribute("data-wv-counts", "true");
                P._wvLfSortRelease(head);
                if (el.parentNode !== tb) title.after(el);
                const over = () => tb.scrollWidth - tb.clientWidth;
                let o = over();
                if (o > 0.5) o = P._wvLfSortSqueeze(head, o);
                if (o <= 0.5) { if (bar) bar.remove(); }
                else {
                    P._wvLfSortRelease(head);
                    if (!bar) { bar = wvHtmlEl(doc, "div", "wv-refs-sec-bar"); host.insertBefore(bar, host.firstChild); }
                    bar.appendChild(el);
                    const o2 = over();
                    if (o2 > 0.5) P._wvLfSortSqueeze(head, o2);
                }
                const win = doc.defaultView;
                if (!tb._wvRefsChipRO && win && win.ResizeObserver) {
                    const ro = new win.ResizeObserver(() => {
                        try {
                            const lp: any = wvLivePlugin();
                            const sec = tb.closest && tb.closest("collapsible-section");
                            const h = sec && sec.querySelector(".wv-refs-sec");
                            const c = sec && sec.querySelector(".wv-refs-chips");
                            const t = sec && sec.querySelector(":scope > .head .title");
                            if (lp && c && h && t) lp._wvRefsChipsPlace(c, t, h);
                        } catch (e) {}
                    });
                    ro.observe(tb);
                    tb._wvRefsChipRO = ro;
                    for (const b of Array.from(chipBoxes)) if (!b.isConnected) { try { b._wvRefsChipRO.disconnect(); } catch (e) {} delete b._wvRefsChipRO; chipBoxes.delete(b); }
                    chipBoxes.add(tb);
                }
            }
            else {
                if (!bar) { bar = wvHtmlEl(doc, "div", "wv-refs-sec-bar"); host.insertBefore(bar, host.firstChild); }
                if (el.parentNode !== bar) bar.appendChild(el);
            }
        } catch (e) {}
    }

    /** The list: the filter chips (_wvRefsSecChips), then a row per
     *  entry in document order -- the mark, the text (two lines; the whole
     *  entry in its tooltip), the popup's buttons while the row is under the
     *  pointer. A click on the text shows the entry in the PDF. */
    _wvRefsSecBuild(body: any, doc: any, reader: any, data: any) {
        const P: any = this;
        const win = doc.defaultView;
        const st = secChips.get(win) || { inc: [], exc: [] };
        refsSecLast.set(body, { reader, data });
        const todo = data.rows.filter((r: any) => r.shown && refsChipPass(r, st));
        // The filter line's answer (list-filter.ts, citations M4): the rows to draw, in
        // order, the words to mark; the line itself kept above the section's box.
        const view = P._wvLfView(body, doc, this._wvRefsLfList(body, reader, data, todo, st));
        // "w": the rows not in your libraries carry the globe (1.2.1-refs.9).
        const sig = "w|" + st.inc.join("+") + "/" + st.exc.join("+") + "|" + data.rows.map((r: any) => r.shown ? r.i + ":" + (r.hit ? r.hit.ids.join("+") + (r.hit.pdf ? "p" : "") : "-") : "").join(",")
            + "|" + (this._wvRefsCanSplit(reader) ? "s" : "") + "|" + (data.ft ? "ft" : "") + "|" + view.sig;
        // The section's own box (bodyXHTML) inside Zotero's body element.
        let host: any = body.querySelector(":scope > .wv-refs-sec");
        if (!host) host = wvHtmlEl(doc, "div", "wv-refs-sec", undefined, body);
        this._wvRefsSecChips(body, doc, reader, data, host, st);
        if (host.getAttribute("data-wv-refs-sig") === sig && host.querySelector(":scope > .wv-refs-sec-list")) return;
        host.setAttribute("data-wv-refs-sig", sig);
        const oldList = host.querySelector(":scope > .wv-refs-sec-list");
        if (oldList) oldList.remove();
        const list = wvHtmlEl(doc, "div", "wv-refs-sec-list", undefined, host);
        P._wvLfListKeys(body, list);
        // A list read from the PDF's full text (the library pane, no structure cache
        // yet; citations.6): a muted line above it says so, and that the PDF opened
        // gives the precise one.
        const oldNote = host.querySelector(":scope > .wv-refs-sec-approx");
        if (oldNote) oldNote.remove();
        if (data.ft) host.insertBefore(wvHtmlEl(doc, "div", "wv-refs-sec-approx", wvStr("weavero-refs-sec-fulltext", null, null)), list);
        const selfDOIs = this._wvRefsSelfDOIs(reader);
        const beside = this._wvRefsBesideEntries(reader);
        const rows: any[] = view.rows;
        const words: string[] = view.words;
        if (view.active && !rows.length && !view.busy) wvHtmlEl(doc, "div", "wv-lf-none", wvStr("weavero-lf-none", { kind: "references" }, null), list);
        // A long list a few rows at a time: the 214-page book's 1314 rows were one
        // 258 ms call, inside a 431 ms block after its first page (the open bench's
        // attribution run, dev.57, 2026-11-21). The first SEC_ROWS_FIRST at once (a
        // paper's whole list), the rest SEC_ROWS_STEP per task while the list is the
        // one shown.
        for (const r of rows.slice(0, SEC_ROWS_FIRST)) this._wvRefsSecRow(list, doc, reader, r, selfDOIs, beside, words);
        if (rows.length) tlMark(reader, "sec", { secRows: rows.length });
        if (rows.length > SEC_ROWS_FIRST) {
            (async () => {
                for (let i = SEC_ROWS_FIRST; i < rows.length; i += SEC_ROWS_STEP) {
                    await wvSleep(0);
                    const lp: any = wvLivePlugin();
                    if (!lp || !list.isConnected || host.getAttribute("data-wv-refs-sig") !== sig) return;
                    for (const r of rows.slice(i, i + SEC_ROWS_STEP)) lp._wvRefsSecRow(list, doc, reader, r, selfDOIs, beside, words);
                }
            })().catch(() => {});
        }
        P._wvRefsSecLastBuilt = Date.now();
    }

    /** The References list as the filter line takes it (list-filter.ts WvLfList):
     *  the rows the header's chips keep, in the paper's order; a row's facet from
     *  its library item when it is one (_wvRefsLfFacet). */
    _wvRefsLfList(body: any, reader: any, data: any, todo: any[], st: { inc: string[]; exc: string[] }): WvLfList {
        const P: any = this;
        let item = reader ? reader.itemID : 0;
        try { const el = body.closest ? body.closest("item-pane-custom-section") : null; if (el && el.item) item = el.item.id; } catch (e) {}
        const sorts: WvLfField[] = ["paper", "year"];
        if (P._wvLfCitesOn()) sorts.push("cited");
        sorts.push("title", "author", "added");
        return {
            kind: "references", item, rows: todo, total: data.total, key: data,
            variant: st.inc.join("+") + "/" + st.exc.join("+"),
            fid: (r: any) => r.i,
            facet: (r: any) => this._wvRefsLfFacet(r),
            // No In library / Not in library / Has PDF chips: the header's own chips
            // (● ● ○ and the library badge) filter those, in view without opening
            // anything (MJT 2026-11-21, citations.6).
            natural: "paper", sorts, libChips: false, pdfChip: false, redraw: "_wvRefsSecRedraw",
        };
    }

    /** A reference's facet: a matched one's from its library item (its year, type,
     *  authors, journal...) and its entry's text; another's from the entry alone --
     *  its first author, year and title head as the Cited by keys read them
     *  (lib/ref-citedby.ts wvCbEntryKeys). */
    _wvRefsLfFacet(r: any): WvLfRow {
        const P: any = this;
        const text = String((r.entry && r.entry.text) || "");
        const k = wvCbEntryKeys(text);
        if (r.hit && r.hit.ids && r.hit.ids.length) {
            const f: WvLfRow = P._wvLfItemFacet(r.hit.ids[0], r.i, text, Number(k[1]) || 0);
            f.pdf = !!r.hit.pdf;
            f.lib = true;
            return f;
        }
        return { hay: wvLfFold(text), year: Number(k[1]) || 0, type: "", pdf: false, lib: false, added: 0, cites: 0, order: r.i, title: wvLfSortKey(k[2]), first: wvLfSortKey(k[0]) };
    }

    /** Draw `body`'s References section again (the filter line changed): its item's
     *  list, else the last one drawn there (a body outside an item pane). */
    _wvRefsSecRedraw(body: any) {
        try {
            const doc = body.ownerDocument;
            const last = refsSecLast.get(body);
            const el = body.closest ? body.closest("item-pane-custom-section") : null;
            let reader = el && el.item ? this._wvRefsSecReader(body, el.item, doc) : null;
            if (!reader && last) reader = last.reader;
            if (!reader) return;
            const data = this._wvRefsDocRows(reader) || (last && last.reader === reader ? last.data : null);
            if (data) this._wvRefsSecBuild(body, doc, reader, data);
        } catch (e) { Zotero.debug("[Weavero] references redraw err: " + e); }
    }

    /** One row of the References section's list (_wvRefsSecBuild); `words` (folded)
     *  marked in its text -- the filter line's. */
    _wvRefsSecRow(list: any, doc: any, reader: any, r: any, selfDOIs: string[], beside: Set<number>, words?: string[]) {
        {
            const row = wvHtmlEl(doc, "div", "wv-refs-sec-row", undefined, list);
            row.setAttribute("data-wv-refs-entry", String(r.i));
            row.setAttribute("data-wv-lf-row", "");
            if (beside.has(r.i)) row.setAttribute("data-wv-refs-beside", "");
            row.setAttribute("title", r.entry.text);
            const mark = wvHtmlEl(doc, "span", "wv-refs-mark", undefined, row);
            // The mark says where the reference is and does not act: the section is
            // open already, the row's buttons on hover are one step (MJT 2026-11-20, "I
            // have already made the effort to open that section, so I do not want to
            // add an extra step to open a popup"). Its own words over the row's (the
            // whole entry); a click on it is the row's (the entry in the PDF).
            mark.setAttribute("title", this._wvRefsMarkTip(reader, r.hit, r.entry, selfDOIs, true));
            drawMark(doc, mark, refsHitKind(r.hit), { width: 8, height: 8 }, r.hit ? this._wvRefsBadge(r.hit) : null, !!(r.hit && r.hit.amb));
            // The entry's number as the paper prints it ("[1]", "1.", "(1)",
            // AIP's superscript "6"), BOLD in the text's own colour, then a space
            // and the text (MJT 2026-11-19: "put the citation number in another
            // color, and keep a space after it"; 2026-11-20, the accent blue too
            // faint in the dark theme: "Bold, normal colour"; lib/ref-list.ts
            // keeps it apart).
            const tx = wvHtmlEl(doc, "span", "wv-refs-sec-text", undefined, row);
            const lab = r.entry.label;
            if (lab && r.entry.text.startsWith(lab + " ")) {
                wvHtmlEl(doc, "span", "wv-refs-sec-label", lab, tx);
                tx.appendChild(doc.createTextNode(" " + r.entry.text.slice(lab.length + 1)));
            }
            else tx.textContent = r.entry.text;
            let urlRe: RegExp | null = null;
            try { urlRe = (this as any).URL_REGEX; } catch (e) {}
            refsLinkify(urlRe, tx);
            if (words && words.length) wvLfMarkEl(tx, words);
            // In your library: the popup's buttons. Not: the globe (Open in
            // Browser, 1.2.1-refs.9).
            const btns = wvHtmlEl(doc, "span", "wv-refs-sec-btns", undefined, row);
            const acts = !r.hit ? ["web"] : r.hit.pdf ? ["tab"].concat(this._wvRefsCanSplit(reader) ? ["split"] : [], ["window", "more"]) : ["library", "more"];
            for (const a of acts) {
                const b = wvHtmlEl(doc, "span", "wv-refs-btn", undefined, btns);
                b.setAttribute("role", "button");
                b.setAttribute("data-wv-refs-act", a);
                b.setAttribute("title", a === "web" ? this._wvRefsWebTip(reader, r.entry, selfDOIs) : wvStr("weavero-refs-act-" + a, null, "title"));
                const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16 }, b);
                for (const [tagName, attrs] of (a === "library" ? libIcon(r.hit && r.hit.ids[0]) : ICONS[a]) || []) wvSvgEl(doc, tagName, attrs, svg);
            }
            row.addEventListener("click", (e: any) => {
                try {
                    if (e.button !== 0) return;
                    const lp: any = wvLivePlugin();
                    if (!lp) return;
                    // A link in the entry's text: opened, not the entry shown in the PDF.
                    const link = e.target && e.target.closest ? e.target.closest("a.wv-refs-url[data-wv-url]") : null;
                    if (link) {
                        e.stopPropagation();
                        e.preventDefault();
                        lp._launchURL(String(link.getAttribute("data-wv-url")));
                        return;
                    }
                    const btn = e.target && e.target.closest ? e.target.closest(".wv-refs-btn") : null;
                    if (btn) {
                        e.stopPropagation();
                        const act = String(btn.getAttribute("data-wv-refs-act"));
                        const p = act === "web" ? lp._wvRefsWebOpen(reader, r.entry, btn) : lp._wvRefsAct(reader, act, r.hit ? r.hit.ids : [], "none", btn);
                        if (p && typeof p.catch === "function") p.catch(() => {});
                        return;
                    }
                    // An entry of a full text's list has no position (citations.6): the PDF
                    // opens, and once its reader has read its own list, the entry naming the
                    // same item is shown -- the Cited by row's landing (cited-by.ts
                    // _wvCbOpenAt); a reference you do not have: the PDF alone.
                    if (reader.wvLib && !(r.entry.rects && r.entry.rects.length) && typeof lp._wvCbOpenAt === "function") {
                        const p = lp._wvCbOpenAt(reader, reader.itemID, r.hit ? r.hit.ids[0] : 0);
                        if (p && typeof p.catch === "function") p.catch(() => {});
                        return;
                    }
                    lp._wvRefsShowEntry(reader, r.entry);
                } catch (er) {}
            });
            // The row's menu on a right-click: the ⋯ menu (with the card) for
            // a reference you have, Open in Browser for another.
            row.addEventListener("contextmenu", (e: any) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const lp: any = wvLivePlugin();
                    if (!lp) return;
                    const at = [e.screenX, e.screenY];
                    if (r.hit) lp._wvRefsMenu(reader, r.hit.ids, "none", row, { at });   // the one menu, open entries included
                    else lp._wvRefsWebMenu(reader, r.entry, row, at);
                } catch (er) {}
            });
        }
    }

    /** The PDF at an entry, the whole entry marked (MJT 2026-11-19: "A click
     *  in the item pane of the reader should highlight the reference in the
     *  reader, same color as in the preview"): the view goes to the entry's
     *  first box through its own navigation (pdf-view.js navigate, so Back
     *  returns), with Zotero's own 2-second outline of the position (the
     *  selection colour, pdf-view.js _highlightPosition) taken off at once --
     *  one mark, Weavero's: every box of the entry on every page it covers, in
     *  the link preview's tint (preview-highlight.ts WV_PREVHL_TINT). The mark
     *  goes at the next press in the view, at the next row's click, or after
     *  WV_REFS_ENTRY_HL_MS. From the LIBRARY's pane (`reader` a stand-in,
     *  _wvRefsLibCtx) the PDF opens in a tab first, then the same. */
    _wvRefsShowEntry(reader: any, entry: WvRefsEntry): boolean {
        const P: any = this;
        try {
            const b = entry && entry.rects && entry.rects[0];
            if (!b) return false;
            if (reader && reader.wvLib) {
                (async () => {
                    const r = wvOpenedInstance(await Zotero.Reader.open(reader.itemID, undefined, {}));
                    if (!r) return;
                    const end = Date.now() + 20000;
                    while (Date.now() < end) {
                        const v = this._wvRefsViewOf(r);
                        try { if (v && v._iframeWindow.PDFViewerApplication.pdfViewer._pages[b[0]]) break; } catch (e) {}
                        await wvSleep(150);
                    }
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsShowEntry(r, entry);
                })().catch((e: any) => Zotero.debug("[Weavero] references open at entry err: " + e));
                return true;
            }
            const rects = entry.rects.filter((x) => x[0] === b[0]).map((x) => [x[1], x[2], x[3], x[4]]);
            const v = this._wvRefsViewOf(reader);
            let done = false;
            // Weavero's landing: the entry's first line a quarter down the view, as
            // every outline, bookmark and link jump (reader-panels.ts
            // _wvOutlineScrollToRect; MJT 2026-11-20, "The focusing position rule
            // should follow the Weavero rule of 1/4th from the top"); Zotero's own
            // navigate, which centres, only when that scroll cannot be done.
            try {
                let top = rects[0];
                for (const r of rects) if (Math.max(r[1], r[3]) > Math.max(top[1], top[3])) top = r;
                if (v && P._wvOutlineScrollToRect(v, b[0], top)) done = true;
            } catch (e) {}
            if (!done && v && typeof v.navigate === "function") {
                try {
                    const pos = wvCloneFor({ position: { pageIndex: b[0], rects } }, reader._iframeWindow);
                    const p = v.navigate(pos);
                    if (p && typeof p.catch === "function") p.catch(() => {});
                    done = true;
                    // Zotero's outline is set synchronously, drawn at the next render.
                    try { if (v._highlightedPosition) { v._highlightedPosition = null; if (typeof v._render === "function") v._render(); } } catch (e) {}
                } catch (e) { done = false; }
            }
            if (!done) {
                const p = reader.navigate({ position: { pageIndex: b[0], rects } });
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
            this._wvRefsEntryMark(reader, v, entry);
            return true;
        } catch (e) { Zotero.debug("[Weavero] references show entry err: " + e); return false; }
    }

    /** The PDF view a reader shows its document in (its last-used view when
     *  Zotero splits the same file), waived. */
    _wvRefsViewOf(reader: any): any {
        try {
            const ir = Cu().waiveXrays(reader._internalReader);
            const v = (ir && (ir._lastView || ir._primaryView)) || null;
            return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication ? v : (ir && ir._primaryView) || null;
        } catch (e) { return null; }
    }

    /** The entry mark of _wvRefsShowEntry in view `v`: a layer of its own in
     *  `.pdfViewer` (as B2's marks), a box per page in page units times
     *  `--scale-factor`, a box per rect of the entry. */
    _wvRefsEntryMark(reader: any, v: any, entry: WvRefsEntry) {
        const P: any = this;
        try {
            if (!v) return;
            const win = v._iframeWindow;
            const doc = win.document;
            const viewer = doc.querySelector(".pdfViewer");
            const pages = win.PDFViewerApplication && win.PDFViewerApplication.pdfViewer && win.PDFViewerApplication.pdfViewer._pages;
            this._wvRefsEntryMarkClear(doc);
            if (!viewer || !pages) return;
            wvInjectStyle(doc, ENTRYHL_STYLE_ID, ENTRYHL_CSS);
            const layer = wvHtmlEl(doc, "div", "wv-refs-entryhl");
            layer.setAttribute("data-wv-tag", P._wvWireTag());
            const boxes = new Map<number, any>();
            for (const r of entry.rects) {
                const pv = pages[r[0]];
                if (!pv || !pv.viewport || !pv.div) continue;
                let box = boxes.get(r[0]);
                if (!box) {
                    box = wvHtmlEl(doc, "div", "wv-refs-entryhl-page", undefined, layer);
                    box.style.top = pv.div.offsetTop + "px";
                    box.style.left = pv.div.offsetLeft + "px";
                    boxes.set(r[0], box);
                }
                const vp = pv.viewport;
                const sf = vp.scale || 1;
                // Two points (scalars in, as the marks do): an array handed to
                // the page's code from here would be out of its reach.
                const p1 = vp.convertToViewportPoint(r[1], r[2]), p2 = vp.convertToViewportPoint(r[3], r[4]);
                const x = Math.min(p1[0], p2[0]) / sf, y = Math.min(p1[1], p2[1]) / sf;
                const w = Math.abs(p2[0] - p1[0]) / sf, h = Math.abs(p2[1] - p1[1]) / sf;
                const m = wvHtmlEl(doc, "div", "wv-refs-entryhl-box", undefined, box);
                m.style.left = "calc(" + x + "px * var(--scale-factor, 1))";
                m.style.top = "calc(" + y + "px * var(--scale-factor, 1))";
                m.style.width = "calc(" + w + "px * var(--scale-factor, 1))";
                m.style.height = "calc(" + h + "px * var(--scale-factor, 1))";
            }
            if (!boxes.size) return;
            viewer.appendChild(layer);
            const clear = () => { const lp: any = wvLivePlugin(); if (lp) lp._wvRefsEntryMarkClear(doc); else try { layer.remove(); } catch (e) {} };
            layer._wvT = wvTimeout(clear, WV_REFS_ENTRY_HL_MS);
            try { wvListen(win, ENTRYHL_KEY, "pointerdown", clear, true, P._wvWireTag()); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] references entry mark err: " + e); }
    }

    _wvRefsEntryMarkClear(doc: any) {
        try {
            for (const l of Array.from(doc.querySelectorAll(".wv-refs-entryhl")) as any[]) { try { wvClearTimeout(l._wvT); } catch (e) {} l.remove(); }
            try { if (doc.defaultView) wvUnlisten(doc.defaultView, ENTRYHL_KEY); } catch (e) {}
        } catch (e) {}
    }

    /** Draw the sections of `reader`'s item pane again (its list became
     *  known), or every section (`reader` null). A section is shown or hidden
     *  here first, as its own setEnabled would: Zotero renders a hidden section
     *  never, its refresh included (itemPaneSectionElementBase.mjs
     *  _forceRenderAll), and a section hidden while the list was not known yet
     *  stayed hidden (live check, 1.1.1-refs.2 in the making). */
    _wvRefsSecRefreshFor(reader: any) {
        for (const [body, refresh] of Array.from(secBodies.entries())) {
            try {
                if (!body.isConnected) { secBodies.delete(body); continue; }
                const el = body.closest && body.closest("item-pane-custom-section");
                // The bodies of `reader` alone (a reader tab's pane, or the
                // library's pane of the item whose cached PDF `reader` stands for).
                if (reader && (!el || this._wvRefsSecReader(body, el.item, body.ownerDocument) !== reader)) continue;
                if (el) {
                    const r = this._wvRefsSecReader(body, el.item, body.ownerDocument);
                    const data = r ? this._wvRefsDocRows(r) : null;
                    const show = !!(data && data.total);
                    if (el.hidden === show) el.hidden = !show;
                }
                const p = refresh();
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (e) {}
        }
    }

    /** Every open reader's marks and every section again (the index or a
     *  setting changed). */
    _wvRefsRefreshAll() {
        for (const r of (Zotero.Reader._readers || []) as any[]) {
            try {
                if (!r || !r._wvRefsMO) continue;
                this._wvRefsMarksDraw(r);
                const doc = r._iframeWindow && r._iframeWindow.document;
                if (doc) for (const pop of doc.querySelectorAll(".citation-popup")) this._wvRefsDecorate(r, pop);
            } catch (e) {}
        }
        this._wvRefsSecRefreshFor(null);
    }

    // ---- start, settings -------------------------------------------------------

    /** init(): the section (when its setting is on) and the settings' watch. */
    _wvRefsInit() {
        try { this._wvRefsApplySectionPref(); } catch (e) { Zotero.debug("[Weavero] references section init err: " + e); }
        this._wvRefsWirePrefWatch();
        this._wvRefsPreloadSoon();
    }

    /** The index -- then Cited by's store -- read ahead a little after startup, at an
     *  idle moment of a main window (PRELOAD_DELAY_MS), so the first PDF a session opens
     *  never waits for them: the index built during that open drew its page 1 1386 ms
     *  later (work/refs-perf-2026-11-20.md; MJT 2026-11-20, "Zotero is already too slow to
     *  open papers"). Both builds yield in short steps. */
    _wvRefsPreloadSoon() {
        const P: any = this;
        try {
            wvClearTimeout(P._wvRefsPreloadT);
            P._wvRefsPreloadT = null;
            if (!this._wvRefsOn()) return;
            P._wvRefsPreloadT = wvTimeout(() => {
                const lp: any = wvLivePlugin();
                if (!lp || lp._wvDestroyed) return;
                lp._wvRefsPreloadT = null;
                const go = () => {
                    const l2: any = wvLivePlugin();
                    if (!l2 || l2._wvDestroyed || !l2._wvRefsOn()) return;
                    l2._wvRefsIndexEnsure().then(() => {
                        const l3: any = wvLivePlugin();
                        if (l3 && typeof l3._wvCbOn === "function" && l3._wvCbOn() && typeof l3._wvCbLoad === "function") l3._wvCbLoad().catch(() => {});
                    }, () => {});
                };
                try {
                    const w: any = Zotero.getMainWindow();
                    if (w && typeof w.requestIdleCallback === "function") { w.requestIdleCallback(go, { timeout: 10000 }); return; }
                } catch (e) {}
                go();
            }, PRELOAD_DELAY_MS);
        } catch (e) {}
    }

    /** `reader` has drawn a page (pdf.js: a page view FINISHED, renderingState 3) with
     *  its text layer (PAINT_TEXT_MS at most) and had an idle moment since (PAINT_IDLE_MS
     *  at most): the work this module does for a paper -- its list read, the index looked
     *  up, the marks drawn, the section built -- waits for it, so opening a PDF draws its
     *  page first (MJT 2026-11-20). Looked at every PAINT_POLL_MS. Then `fn`, once.
     *  Readers past it are remembered (refsPainted). Fifteen seconds at most. */
    _wvRefsAfterFirstPaint(reader: any, fn: () => void) {
        if (refsPainted.has(reader)) { try { fn(); } catch (e) {} return; }
        const t0 = Date.now();
        let drawnAt = 0;
        const tick = () => {
            const lp: any = wvLivePlugin();
            if (!lp || lp._wvDestroyed) return;
            let drawn = false, text = false;
            try {
                const ir = Cu().waiveXrays(reader._internalReader);
                const v = ir && ir._primaryView;
                const app = v && v._iframeWindow && v._iframeWindow.PDFViewerApplication;
                const pages = app && app.pdfViewer && app.pdfViewer._pages;
                const n = pages ? num(pages.length) : 0;
                for (let i = 0; i < n; i++) {
                    const p = pages[i];
                    if (!p || p.renderingState !== 3) continue;
                    drawn = true;
                    // Its text layer too: pdf.js appends `.endOfContent` once the layer is
                    // drawn (text_layer_builder.js render). Started before it, the work
                    // drew page 1's text layer 94 ms later (refspeed.3,
                    // work/refs-marks-speed-2026-11-21.md).
                    try { if (p.div && p.div.querySelector(".textLayer > .endOfContent")) { text = true; break; } } catch (e) {}
                }
            } catch (e) {}
            if (drawn && !drawnAt) { drawnAt = Date.now(); tlMark(reader, "paint", { painted: true }); }
            const waited = Date.now() - t0;
            if (waited < 15000 && (!drawn || (!text && Date.now() - drawnAt < PAINT_TEXT_MS))) { wvTimeout(tick, drawn ? PAINT_TEXT_POLL_MS : PAINT_POLL_MS); return; }
            tlMark(reader, "paint", { painted: drawn });
            tlMark(reader, "text", { textLayer: text });
            const go = () => { refsPainted.add(reader); tlMark(reader, "idle"); try { fn(); } catch (e) {} };
            try {
                const w: any = reader._iframeWindow;
                if (w && typeof w.requestIdleCallback === "function") { w.requestIdleCallback(go, { timeout: PAINT_IDLE_MS }); return; }
            } catch (e) {}
            wvTimeout(go, 200);
        };
        tick();
    }

    /** The three settings and the masters above them, watched (stamped on the
     *  Zotero global as `_wvRefsPrefObs`, released by destroy's
     *  _wvReleaseGlobalPrefObservers): the section comes and goes, the marks
     *  and the popups follow at once. */
    _wvRefsWirePrefWatch() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvRefsPrefObs) {
                if (g._wvRefsPrefObsVer === tag) return;
                for (const s of g._wvRefsPrefObs) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
                delete g._wvRefsPrefObs;
            }
            g._wvRefsPrefObsVer = tag;
            g._wvRefsPrefObs = REFS_PREFS.map((k) => Zotero.Prefs.registerObserver("weavero." + k, () => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag) return;
                    lp._wvRefsApplyPrefs();
                } catch (e) {}
            }));
        } catch (e) { Zotero.debug("[Weavero] references pref watch err: " + e); }
    }

    _wvRefsApplyPrefs() {
        const P: any = this;
        wvClearTimeout(P._wvRefsPrefT);
        // Several settings change together (a master): one pass.
        P._wvRefsPrefT = wvTimeout(() => {
            P._wvRefsPrefT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            try { this._wvRefsApplySectionPref(); } catch (e) {}
            if (this._wvRefsOn()) {
                for (const r of (Zotero.Reader._readers || []) as any[]) { try { if (r && r._wvRefsMO) this._wvRefsPrepare(r).catch(() => {}); } catch (e) {} }
            }
            this._wvRefsRefreshAll();
        }, 50);
    }

    /** destroy(): the observer, the caches, the menus. The reader pages are
     *  cleaned by _wvReaderPageTeardown (_wvRefsReaderTeardown). */
    _wvRefsDestroy() {
        const P: any = this;
        try { P._wvBlUnregisterSectionFor(REFS_SECTION); } catch (e) {}
        wvClearTimeout(P._wvRefsPrefT); P._wvRefsPrefT = null;
        P._wvRefsRowCache = null;
        P._wvRefsRowBuilds = null;
        secBodies.clear();
        for (const b of Array.from(chipBoxes)) { try { b._wvRefsChipRO.disconnect(); } catch (e) {} try { delete b._wvRefsChipRO; } catch (e) {} }
        chipBoxes.clear();
        try {
            const en0 = Services.wm.getEnumerator(null);
            while (en0.hasMoreElements()) {
                const w: any = en0.getNext();
                try { wvRemoveStyle(w.document, SEC_STYLE_ID); } catch (e) {}
                try { wvRemoveStyle(w.document, CARD_STYLE_ID); } catch (e) {}
            }
        } catch (e) {}
        this._wvRefsWebForget();
        try { this._wvRefsUnwireNotifier(); } catch (e) {}
        wvClearTimeout(P._wvRefsFlushT); P._wvRefsFlushT = null;
        wvClearTimeout(P._wvRefsPreloadT); P._wvRefsPreloadT = null;
        P._wvRefsIx = null; P._wvRefsIxBuilding = null; P._wvRefsPending = null; P._wvRefsAtt = null;
        P._wvRefsHitCache = null; P._wvRefsEntriesNow = null;
        P._wvRefsLibProbes = null; P._wvRefsLibCtxs = null;
        entryCache.clear();
        fileStamps.clear();
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                for (const id of [MENU_ID, IDLE_MENU_ID]) { try { const m = w.document && w.document.getElementById(id); if (m) m.remove(); } catch (e) {} }
            }
        } catch (e) {}
        try { for (const w of wvMainWins()) for (const id of [MENU_ID, IDLE_MENU_ID]) { const m = w.document.getElementById(id); if (m) m.remove(); } } catch (e) {}
    }
}

const _refsDescriptors = Object.getOwnPropertyDescriptors(_RefsMixin.prototype);
delete (_refsDescriptors as any).constructor;
// R2, the reference card for a PDF link Zotero did not read as a citation
// (refs-cards.ts), rides on this bundle.
export const refsMethods = Object.assign(_refsDescriptors, refsCardsMethods);

// The marks' one meaning on every surface (MJT 2026-11-20), the Researchers tab's
// publications too (2026-11-25: "Why not use the same circles convention as in the
// references?"): the drawing, its colours, and what counts as "with a PDF".
export { drawMark as wvRefsDrawMark, markColorCSS as wvRefsMarkColorCSS, DOC_TYPES as WV_REFS_DOC_TYPES };
export type { RefsMarkKind as WvRefsMarkKind };
