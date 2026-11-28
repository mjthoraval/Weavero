// Module: filter and sort for the long item-pane lists (plan
// work/citations-plan-2026-11-21.md M4; MJT 2026-11-21: "When there are many
// references or cited by, I want to be able to search or filter them quickly
// ... a design that keeps the interface light, with minimal impact, but still
// easily accessible"; the mock-up approved: "Ok for the design you propose").
//
// ONE piece for every such list -- References and Cited by now, Related by
// Citations and "Cited by your papers, not in your library" next -- in the
// library's item pane and beside a PDF, shown on lists of WV_LF_MIN_ROWS rows
// or more:
//   - in the section's header, before the magnifier, the SORT: the reader's
//     annotation sort bar (reader-panels.ts _wvAnnSortBarEnsure; MJT 2026-11-22,
//     "Can you move the sort options at the same level as the funnel to filter?
//     Try making a design similar to sorting the annotations in a PDF reader"):
//     a dropdown chip naming the field (its menu: the fields, a tick on the
//     current one, "(default)" on the list's own) and, for a field with a
//     direction, the ↑ / ↓ chip that turns it round (lib/list-filter.ts
//     WvLfOrderSpec). The sort chosen last is a pref per section kind;
//   - the magnifier -- Zotero's own header-button slot (ItemPaneManager
//     `sectionButtons` -> itemPaneCustomSection.js registerSectionButton: the
//     slot Tags and Related use for "+") -- opens the SEARCH line at the top of
//     the list: a text field ("Search 150 papers…", "3 of 150" when narrowed),
//     the focus in it; Esc clears its text, then closes it. A line stays open
//     while its text narrows the list; the magnifier then shows pressed
//     (Zotero's pressed toolbarbutton), and a click on it clears the text and
//     closes the line -- a closed line never hides a filter;
//   - the words typed are marked in the rows drawn.
// The filter chips (citations.6 to .27: a funnel left of the magnifier opened a
// line of the sort and chips built from the list -- its types, "Since <year>",
// Has PDF) are off since lfsort.1 behind ONE switch, WV_LF_FILTERS_UI below
// (MJT 2026-11-22: "The funnel is quite empty at the moment. Remove it until I
// have more clear ideas on what to put in it"): their engine stays, and while
// the switch is off no chip state reaches a computation (_wvLfChipsOf).
// The filter runs on the rows in memory over the WHOLE list (their facets,
// read once per list: lib/list-filter.ts WvLfRow), the section's own cap and
// "Show N more" then apply to the result. A list of thousands is computed in
// idle slices (plan §0's bounds), the last result shown meanwhile.
//
// What a section gives (WvLfList): its rows in their own order, a facet per
// row, the sorts it offers, the method that draws its body again. What it
// gets (WvLfView): the rows to draw, in order, and the words to mark.
//
// State per section BODY (each item pane's section element has its own: per
// window, per pane), reset when the body shows another item; the sort chosen
// last is a pref per section kind (`weavero.listSort.<kind>`, defaults in
// prefs-table.ts WV_PREF_VALUES): "paper" or "<field>:<dir>" ("year:asc"),
// written when the user changes the sort; an older one-word value ("newest",
// "oldest"...) is read as what it meant (lib/list-filter.ts wvLfSortParse).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvSvgEl } from "../lib/svg";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, wvSetBoolAttr, wvPopupHost, winOf } from "../lib/dom";
import { wvMenuItem } from "../lib/menu";
import { wvMainWins } from "../lib/windows";
import {
    WvLfRow, WvLfQuery, WvLfChipsOn, WvLfChipSet, WvLfField, WvLfDir, WvLfOrderSpec, WvLfSortLike, WV_LF_FIELDS, WV_LF_FIELD_DIR,
    wvLfFold, wvLfParse, wvLfQueryEmpty, wvLfMarkWords, wvLfChips, wvLfChipsNone, wvLfChipsActive, wvLfOrderSteps, wvLfMarks,
    wvLfSortParse, wvLfSortStr, wvLfSortSame, wvLfFieldHasDir,
} from "../lib/list-filter";

declare const Zotero: any;
declare const Components: any;
declare const Services: any;

/** The filter chips' interface: the funnel in the header and the line of chips
 *  it opens (citations.6 to .27). OFF since 1.2.1-lfsort.1 -- MJT 2026-11-22:
 *  "The funnel is quite empty at the moment. Remove it until I have more clear
 *  ideas on what to put in it." The chips' engine (lib/list-filter.ts
 *  wvLfChips, wvLfPass; the line's code below) stays for when they come back.
 *  While this is false no funnel is registered, the line never opens, a chip
 *  press is refused, and no chip state reaches a computation (_wvLfChipsOf): no
 *  row can be hidden by a filter the header does not show. */
export const WV_LF_FILTERS_UI = false;
/** The magnifier and the sort show on lists of this many rows or more. */
export const WV_LF_MIN_ROWS = 8;
/** The header buttons' types (each its class on the toolbarbutton, the event
 *  Zotero's section dispatches for it: collapsibleSection.js
 *  _buildExtraButtons): the magnifier (search), the funnel (filter chips,
 *  WV_LF_FILTERS_UI). */
export const WV_LF_BUTTON = "wv-lf-toggle";
export const WV_LF_FBUTTON = "wv-lf-filter";
/** Zotero's own magnifier, and its funnel -- the quick search's filter button
 *  (_quickSearchTextbox.scss), Zotero's `.icon-filter`, Weavero's filter pane
 *  and reader panels -- both 16 px, context-fill: the header buttons' colour.
 *  The same file on Zotero 10.0.8 and 11 (checked in both omni.ja). */
export const WV_LF_ICON = "chrome://zotero/skin/16/universal/magnifier.svg";
export const WV_LF_FICON = "chrome://zotero/skin/16/universal/filter.svg";
const LF_MAGNIFIER = { type: WV_LF_BUTTON, icon: WV_LF_ICON, darkIcon: WV_LF_ICON, l10nID: "weavero-lf-toggle", onClick: "_wvLfButtonClick" };
const LF_FUNNEL = { type: WV_LF_FBUTTON, icon: WV_LF_FICON, darkIcon: WV_LF_FICON, l10nID: "weavero-lf-filter-toggle", onClick: "_wvLfFilterButtonClick" };
/** The buttons as a section registers them (backlinks.ts WvSectionDesc.buttons),
 *  in their order before the twisty: the magnifier; the funnel left of it while
 *  the chips are on (WV_LF_FILTERS_UI). The sort's chips go before them
 *  (_wvLfSortSync). */
export const WV_LF_SECTION_BUTTONS = WV_LF_FILTERS_UI ? [LF_FUNNEL, LF_MAGNIFIER] : [LF_MAGNIFIER];
/** A line of the list's filter: the search ("q") or the filter chips ("f"). */
export type WvLfPart = "q" | "f";
/** Typing applies this long after the last key (ms). */
const DEBOUNCE_MS = 150;
/** A computation runs at once for this long (ms); what is left, in idle slices
 *  of SLICE_MS (plan §0: slices of 20 ms or less, cancelled on item change). */
const SYNC_MS = 12;
const SLICE_MS = 8;
/** Facets made between two steps (each reads a library item's fields). */
const FACET_STEP = 100;
const STYLE_ID = "wv-lf-style";
const MENU_ID = "wv-lf-sort-menu";
/** The sort's box in the header, its dropdown chip (the field's label and
 *  chevron) and its direction chip. */
export const WV_LF_SORTBOX = "wv-lf-sortbox";
const SORT_DROP = "wv-lf-sortdrop";
const SORT_LAB = "wv-lf-sortlab";
const SORT_DIR = "wv-lf-sortdir";
/** The reader's chip chevron (reader-panels.ts RP_OUTLINE_CHEVRON), 8 px. */
const CHEVRON_PATH = "M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2L0 2.70711Z";
/** The narrowest a squeezed field label gets (_wvLfSortSqueeze): about two
 *  letters and the ellipsis at the chip's 10.5 px. */
const LAB_MIN_PX = 22;
/** A click right after a key press on a chip is that press (the button's own
 *  activation, if Gecko sends one): ignored (ms). */
const KEY_CLICK_MS = 400;

/** What a section hands the filter. */
export interface WvLfList {
    /** The section's kind: its sort pref (`weavero.listSort.<kind>`), its words. */
    kind: string;
    /** The item the section shows (its state resets for another). */
    item: number;
    /** The rows the filter works on, in the list's own order. */
    rows: any[];
    /** How many rows the list has (the magnifier's threshold). */
    total: number;
    /** The list's identity: facets are kept per key object, a row's under fid. */
    key: object;
    /** What else decides `rows` beside `key` (References' header chips). */
    variant: string;
    fid: (row: any, i: number) => number | string;
    /** A row's facet; its `order` the row's place in the list's own order. */
    facet: (row: any, i: number) => WvLfRow;
    /** The order `rows` is in (a spec, or a stored form: "paper", "year:desc");
     *  the sort menu marks its field "(default)". */
    natural: WvLfSortLike;
    /** The fields the section offers, in the menu's order. */
    sorts: WvLfField[];
    /** In library / Not in library chips (none of today's lists: References'
     *  header chips filter those, MJT 2026-11-21). */
    libChips: boolean;
    /** A Has PDF chip where it narrows the list (Cited by; not References,
     *  whose header chips filter it). */
    pdfChip: boolean;
    /** The live plugin's method that draws `body` again: (body) => void. */
    redraw: string;
}

/** What the section draws. */
export interface WvLfView {
    /** The rows to draw, in order (the list's own when nothing applies). */
    rows: any[];
    /** Folded words to mark in each drawn row. */
    words: string[];
    /** Changes when what is drawn changes (a section's signature). */
    sig: string;
    /** The filter's own state (not the list's): "" when nothing applies. A
     *  section's "Show more" pages start again when it changes. */
    fsig: string;
    /** A result is being computed: `rows` are the last result's, or the list's. */
    busy: boolean;
    /** A filter narrows the list (text or chips). */
    active: boolean;
}

/** The rows a filter keeps, in order, for the list and filter of `key`. */
interface LfResult { key: string; lkey: string; order: number[] }
interface LfState {
    item: number;
    kind: string;
    /** The search line open, the filter chips' line open (WV_LF_FILTERS_UI). */
    openQ: boolean;
    openF: boolean;
    /** The field's text, and what was applied of it (the debounce). */
    text: string;
    q: WvLfQuery;
    chips: WvLfChipsOn;
    debT: any;
    run: { key: string; stop: boolean } | null;
    res: LfResult | null;
    /** The chips the list offers: counted over the whole list, whatever is typed --
     *  made once per list (`lkey`), not with every result. */
    chipSet: { lkey: string; set: WvLfChipSet } | null;
    list: WvLfList | null;
    /** What each line shows: the search line's, the chips' line's and its
     *  chips' signatures (written when they change). */
    qSig: string;
    fSig: string;
    chipSig: string;
}

/** The filter's state, per section body. */
const lfStates: WeakMap<any, LfState> = new WeakMap();
/** The bodies that have state, for the sort pref's redraw and destroy(). */
const lfBodies: Set<any> = new Set();
/** The facets of each list (its key object), per row id. */
let lfFacets: WeakMap<object, Map<number | string, WvLfRow>> = new WeakMap();
/** A number per list key, for the result keys. */
const lfKeyIds: WeakMap<object, number> = new WeakMap();
let lfKeyNext = 1;
/** Zotero's name of each item type, in its language (the type chips, the facets). */
const typeLabels: Map<string, string> = new Map();

function keyIdOf(o: object): number {
    let n = lfKeyIds.get(o);
    if (!n) { n = lfKeyNext++; lfKeyIds.set(o, n); }
    return n;
}

const Cu = () => (Components as any).utils;
function nowMs(): number {
    try { return Cu().now(); } catch (e) { return Date.now(); }
}

/** Zotero's name of item type `type` in its language. */
export function wvLfTypeLabel(type: string): string {
    if (!type) return "";
    let s = typeLabels.get(type);
    if (s == null) {
        try { s = String(Zotero.ItemTypes.getLocalizedString(type) || type); } catch (e) { s = type; }
        typeLabels.set(type, s);
    }
    return s;
}

/** A sort key: folded, letters and digits only ("The Drop-Impact" -> "thedropimpact"). */
export function wvLfSortKey(s: string): string {
    return wvLfFold(s).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Mark `words` (folded) in the text under `el` (a row's text): each match in a
 *  <mark class="wv-lf-hl">. SVG and marks already there are left alone. */
export function wvLfMarkEl(el: any, words: string[]) {
    if (!el || !words || !words.length) return;
    try {
        const doc = el.ownerDocument;
        const texts: any[] = [];
        const walk = (n: any) => {
            for (let c = n.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) texts.push(c);
                else if (c.nodeType === 1 && c.localName !== "svg" && !(c.classList && c.classList.contains("wv-lf-hl"))) walk(c);
            }
        };
        walk(el);
        for (const t of texts) {
            const s = String(t.nodeValue || "");
            const spans = wvLfMarks(s, words);
            if (!spans.length) continue;
            const frag = doc.createDocumentFragment();
            let at = 0;
            for (const [a, b] of spans) {
                if (a > at) frag.appendChild(doc.createTextNode(s.slice(at, a)));
                wvHtmlEl(doc, "mark", "wv-lf-hl", s.slice(a, b), frag);
                at = b;
            }
            if (at < s.length) frag.appendChild(doc.createTextNode(s.slice(at)));
            t.parentNode.replaceChild(frag, t);
        }
    } catch (e) {}
}

/** The item pane keeps its scroll while a section's list shrinks under it
 *  (refs.ts refsHoldPaneScroll, the same rule). */
function holdPaneScroll(el: any) {
    try {
        const det: any = el && el.closest ? el.closest("item-details") : null;
        const pp: any = det && det._paneParent;
        if (!pp || !pp.clientHeight || typeof det._minScrollHeight !== "number") return;
        const need = pp.scrollTop + pp.clientHeight;
        if (det._minScrollHeight < need) det._minScrollHeight = need;
    } catch (e) {}
}

/** The lines' look: Zotero's row geometry (the body 4 px in, as the rows), the
 *  field and chips in Zotero's fills; never wider than the pane. The header
 *  buttons as Zotero draws a toolbarbutton (_toolbarbutton.scss): open, the
 *  hover's fill; pressed -- its part narrows the list -- the `:active` /
 *  `[selected]` fill.
 *  The sort in the header: the reader's sort bar chips (reader-panels.ts
 *  .wv-outline-src-chip, .wv-ann-sortchip.wv-on) -- the dropdown a bordered
 *  pill, 10.5 px, its chevron at 8 px; the direction a filled pill, 11 px,
 *  semibold -- in the header's secondary text, as its title and buttons; the
 *  focus ring Zotero's (_mixins.scss focus-ring, which the section's own
 *  buttons get). Zotero's form-button look for every chrome <button> on Windows
 *  (scss/win/components/_button.scss: 28 px high, a gradient border drawn as
 *  background images) is undone: the chips stood 28 px tall in a 20-px header
 *  row (lfsort.1 probe). The box shrinks before the twisty and the magnifier (Zotero's
 *  header buttons do not shrink, _collapsibleSection.scss), the label by
 *  ellipsis; it is capped at 9em, so the pane's minimum never grows with a
 *  long translation. */
const LF_CSS = `
.wv-lf-bar { display: flex; flex-direction: column; gap: 6px; padding: 0 4px 6px; contain: inline-size; }
.wv-lf-bar[hidden] { display: none; }
.wv-lf-line { min-width: 0; contain: inline-size; }
.wv-lf-line[hidden] { display: none; }
.wv-lf-field { display: flex; align-items: center; gap: 6px; padding: 1px 6px; border-radius: 5px;
  border: 1px solid var(--fill-quarternary, rgba(128,128,128,0.35)); background: var(--material-background, Field); }
.wv-lf-field:focus-within { border-color: var(--color-accent, Highlight); }
.wv-lf-field > svg { flex: none; width: 12px; height: 12px; fill: currentColor; stroke: none; color: var(--fill-secondary, GrayText); }
.wv-lf-input { flex: 1 1 auto; min-width: 0; margin: 0; padding: 2px 0; border: none; outline: none; background: transparent; color: inherit; font: inherit; appearance: none; }
.wv-lf-count { flex: none; color: var(--fill-secondary, GrayText); font-size: 0.92em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wv-lf-count:empty { display: none; }
.wv-lf-fline { display: flex; align-items: flex-start; gap: 6px; }
.wv-lf-fline > .wv-lf-count { margin-inline-start: auto; padding: 1px 0; }
collapsible-section > .head > .${WV_LF_SORTBOX} { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 4px; margin-inline: 4px 2px; }
collapsible-section > .head > .${WV_LF_SORTBOX}[hidden] { display: none; }
.${WV_LF_SORTBOX} > button { appearance: none; margin: 0; box-sizing: border-box; height: auto; min-height: 0; min-width: 0; font: inherit; color: var(--fill-secondary, GrayText);
  background: transparent; white-space: nowrap; cursor: default; line-height: normal; }
.${WV_LF_SORTBOX} > button[hidden] { display: none; }
.${WV_LF_SORTBOX} > .${SORT_DROP} { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px;
  border: 1px solid rgba(127,127,127,0.3); border-radius: 10px; font-size: 10.5px; font-weight: 500; }
.${SORT_DROP} > .${SORT_LAB} { flex: 0 1 auto; min-width: 0; max-width: 9em; overflow: hidden; text-overflow: ellipsis; }
.${SORT_DROP} > .wv-lf-sortcaret { flex: none; display: inline-flex; opacity: 0.6; }
.${SORT_DROP} > .wv-lf-sortcaret > svg { width: 8px; height: 8px; fill: currentColor; stroke: none; }
.${WV_LF_SORTBOX} > .${SORT_DIR} { flex: none; padding: 2px 8px; border-radius: 9px; font-size: 11px; font-weight: 600;
  border: 1px solid var(--color-panedivider, rgba(127,127,127,0.3)); background: var(--fill-quarternary, rgba(127,127,127,0.18)); }
.${WV_LF_SORTBOX} > button:hover, .${WV_LF_SORTBOX} > .${SORT_DROP}[data-wv-lf-menu] { color: var(--fill-primary, CanvasText); }
.${WV_LF_SORTBOX} > .${SORT_DROP}:hover, .${WV_LF_SORTBOX} > .${SORT_DROP}[data-wv-lf-menu] { background: rgba(127,127,127,0.14); }
@media (-moz-platform: windows) { .${WV_LF_SORTBOX} > button:focus-visible { outline: var(--color-focus-outer-border) solid var(--width-focus-outer-border); outline-offset: var(--width-focus-border); box-shadow: 0 0 0 var(--width-focus-border) var(--color-focus-border); } }
@media not (-moz-platform: windows) { .${WV_LF_SORTBOX} > button:focus-visible { outline: none; box-shadow: 0 0 0 var(--width-focus-border) var(--color-focus-border); } }
@media (forced-colors) { .${WV_LF_SORTBOX} > button { border-color: ButtonText; color: ButtonText; } }
#${MENU_ID} > menuitem.wv-lf-sort-heading { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
.wv-lf-chip:focus-visible { outline: 2px solid var(--color-focus-outer, Highlight); outline-offset: 1px; }
.wv-lf-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.wv-lf-chips:empty { display: none; }
.wv-lf-chip { padding: 1px 8px; border-radius: 10px; background: var(--fill-quinary, rgba(128,128,128,0.15)); font-size: 0.88em; white-space: nowrap; cursor: default; }
.wv-lf-chip:hover { background: var(--fill-quarternary, rgba(128,128,128,0.25)); }
.wv-lf-chip[aria-pressed="true"] { background: var(--color-accent, Highlight); color: var(--accent-white, HighlightText); }
.wv-lf-chip > .wv-lf-chip-n { margin-inline-start: 4px; opacity: 0.7; font-variant-numeric: tabular-nums; }
mark.wv-lf-hl { background: color-mix(in srgb, var(--color-accent, Highlight) 28%, transparent); color: inherit; border-radius: 2px; }
.wv-lf-none { padding: 2px 4px; color: var(--fill-secondary, GrayText); }
collapsible-section > .head > toolbarbutton:is(.${WV_LF_BUTTON}, .${WV_LF_FBUTTON})[data-wv-lf-open] { background-color: var(--fill-quinary, rgba(128,128,128,0.15)); }
collapsible-section > .head > toolbarbutton:is(.${WV_LF_BUTTON}, .${WV_LF_FBUTTON})[data-wv-lf-on] { background-color: var(--fill-quarternary, rgba(128,128,128,0.3)); }
@media (forced-colors) { collapsible-section > .head > toolbarbutton:is(.${WV_LF_BUTTON}, .${WV_LF_FBUTTON})[data-wv-lf-on] { outline: 1px solid SelectedItem; } }
@media (forced-colors) { .wv-lf-chip[aria-pressed="true"] { outline: 1px solid SelectedItem; } mark.wv-lf-hl { background: Mark; color: MarkText; } }
`;

class _ListFilterMixin {
    [k: string]: any;

    /** A section's onInit: the lines' sheet, and the header buttons hidden until
     *  a list long enough is drawn (the sort's chips are made then). */
    _wvLfSectionInit(body: any, doc: any) {
        try {
            wvInjectStyle(doc, STYLE_ID, LF_CSS);
            for (const t of WV_LF_SECTION_BUTTONS.map((b) => b.type)) {
                const btn = this._wvLfButtonOf(body, t);
                if (btn) wvSetBoolAttr(btn, "hidden", true);
            }
        } catch (e) {}
    }

    /** A section's onDestroy: its body forgotten -- the set must never keep a closed
     *  window's DOM (src-ts.md: a field that names a node is cleared when it goes). */
    _wvLfSectionDestroy(body: any) {
        try {
            const st = lfStates.get(body);
            if (st) { if (st.run) st.run.stop = true; wvClearTimeout(st.debT); st.debT = null; st.list = null; }
            lfStates.delete(body);
            lfBodies.delete(body);
        } catch (e) {}
    }

    /** The header button of type `type` (WV_LF_BUTTON, WV_LF_FBUTTON) of `body`'s section. */
    _wvLfButtonOf(body: any, type: string): any {
        try {
            const sec = body && body.closest ? body.closest("collapsible-section") : null;
            return sec ? sec.querySelector(":scope > .head > ." + type) : null;
        } catch (e) { return null; }
    }

    /** A header button as the state says: shown on a list long enough, marked
     *  while its line is open, pressed while its part narrows the list (each
     *  attribute written only when it changes: the view runs at every draw). */
    _wvLfButtonState(btn: any, able: boolean, open: boolean, on: boolean) {
        if (!btn) return;
        wvSetBoolAttr(btn, "hidden", !able);
        wvSetBoolAttr(btn, "data-wv-lf-open", able && open);
        wvSetBoolAttr(btn, "data-wv-lf-on", able && on);
        const v = able && on ? "true" : "false";
        if (btn.getAttribute("aria-pressed") !== v) btn.setAttribute("aria-pressed", v);
    }

    /** The state of `body` for `list` (a new one for another item or kind). */
    _wvLfStateOf(body: any, list: { item: number; kind: string }): LfState {
        let st = lfStates.get(body);
        if (!st || st.item !== list.item || st.kind !== list.kind) {
            if (st) { if (st.run) st.run.stop = true; wvClearTimeout(st.debT); }
            st = { item: list.item, kind: list.kind, openQ: false, openF: false, text: "", q: wvLfParse(""), chips: wvLfChipsNone(), debT: null, run: null, res: null, chipSet: null, list: null, qSig: "", fSig: "", chipSig: "" };
            lfStates.set(body, st);
            for (const b of Array.from(lfBodies)) if (!b.isConnected) lfBodies.delete(b);
        }
        lfBodies.add(body);
        return st;
    }

    /** The list's own order as a spec (its `natural`). */
    _wvLfNaturalOf(list: WvLfList): WvLfOrderSpec {
        const n = wvLfSortParse(list.natural);
        if (n) return n;
        const f = list.sorts[0] || "paper";
        return { field: f, dir: WV_LF_FIELD_DIR[f] };
    }

    /** The sort chosen last for `list`'s kind (`weavero.listSort.<kind>`, either
     *  form: wvLfSortParse), when the list offers its field; else the list's own
     *  order. */
    _wvLfSortOf(list: WvLfList): WvLfOrderSpec {
        let v = "";
        try { v = String(Zotero.Prefs.get("weavero.listSort." + list.kind) || ""); } catch (e) {}
        const s = wvLfSortParse(v);
        return s && list.sorts.indexOf(s.field) >= 0 ? s : this._wvLfNaturalOf(list);
    }

    /** The chips a computation may apply: none while their interface is off
     *  (WV_LF_FILTERS_UI) -- whatever a state holds, a hidden chip never hides a
     *  row. Every computation and every "is a filter on" reads them here. */
    _wvLfChipsOf(st: LfState): WvLfChipsOn {
        return WV_LF_FILTERS_UI ? st.chips : wvLfChipsNone();
    }

    /** What `body`'s section draws for `list`: the rows filtered and sorted
     *  (lib/list-filter.ts) -- at once, or the last result while the next one is
     *  computed in slices -- with the header's sort and the lines kept as the
     *  state says. A list under WV_LF_MIN_ROWS rows: no magnifier and no sort,
     *  its own order, nothing filtered. */
    _wvLfView(body: any, doc: any, list: WvLfList): WvLfView {
        const plain: WvLfView = { rows: list.rows, words: [], sig: "", fsig: "", busy: false, active: false };
        try {
            const st = this._wvLfStateOf(body, list);
            st.list = list;
            const able = list.total >= WV_LF_MIN_ROWS;
            if (!able && (st.openQ || st.openF || st.text || wvLfChipsActive(st.chips))) this._wvLfReset(st);
            const chips = this._wvLfChipsOf(st);
            const textOn = !wvLfQueryEmpty(st.q), chipsOn = wvLfChipsActive(chips);
            this._wvLfButtonState(this._wvLfButtonOf(body, WV_LF_BUTTON), able, st.openQ, textOn);
            if (WV_LF_FILTERS_UI) this._wvLfButtonState(this._wvLfButtonOf(body, WV_LF_FBUTTON), able, st.openF, chipsOn);
            const sort = this._wvLfSortOf(list);
            this._wvLfSortSync(body, doc, list, able ? sort : null);
            if (!able) {
                this._wvLfBarSync(body, doc, st, list, null, false);
                return plain;
            }
            wvInjectStyle(doc, STYLE_ID, LF_CSS);
            const active = textOn || chipsOn;
            const needOrder = active || !wvLfSortSame(sort, this._wvLfNaturalOf(list));
            const openF = WV_LF_FILTERS_UI && st.openF;
            if (!needOrder && !st.openQ && !openF) {
                this._wvLfBarSync(body, doc, st, list, null, false);
                return plain;
            }
            const lkey = keyIdOf(list.key) + "|" + list.variant;
            const fsig = JSON.stringify(st.q) + "|" + JSON.stringify(chips) + "|" + wvLfSortStr(sort);
            const rkey = lkey + "|" + fsig;
            // The order (a filter or a sort applies) and the chips (their line open)
            // are kept apart: the chips are the whole list's, made once per list.
            const wantOrder = needOrder && !(st.res && st.res.key === rkey);
            const wantChips = openF && !(st.chipSet && st.chipSet.lkey === lkey);
            if (wantOrder || wantChips) this._wvLfCompute(body, st, list, rkey, lkey, sort, chips, wantOrder, wantChips);
            const res: LfResult | null = needOrder && st.res && st.res.key === rkey ? st.res : null;
            const busy = needOrder && !res;
            // Meanwhile the last result for this list, else the list as it is.
            const shown = res || (busy && st.res && st.res.lkey === lkey ? st.res : null);
            const rows = shown ? shown.order.map((i) => list.rows[i]) : list.rows;
            const view: WvLfView = {
                rows, words: wvLfMarkWords(st.q), busy, active,
                fsig: needOrder ? fsig : "",
                sig: (needOrder ? rkey : "") + (busy ? "|busy" : "") + "|" + rows.length,
            };
            this._wvLfBarSync(body, doc, st, list, view, true);
            return view;
        }
        catch (e) { Zotero.debug("[Weavero] list filter view err: " + e); return plain; }
    }

    /** The order for key `rkey` (`wantOrder`) and the list's chips (`wantChips`),
     *  kept in the state: computed at once when that takes under SYNC_MS (true),
     *  else the rest runs in idle slices of SLICE_MS (_wvLfLater) and the body is
     *  drawn again when it is done (false). How it went: `_wvLfStat` (the stress
     *  spec). */
    _wvLfCompute(body: any, st: LfState, list: WvLfList, rkey: string, lkey: string, sort: WvLfOrderSpec, chips: WvLfChipsOn, wantOrder: boolean, wantChips: boolean): boolean {
        const P: any = this;
        const runKey = rkey + "|" + (wantOrder ? "o" : "") + (wantChips ? "c" : "");
        if (st.run && st.run.key === runKey) return false;
        if (st.run) { st.run.stop = true; st.run = null; }
        const g = this._wvLfSteps(list, st.q, chips, sort, wantOrder, wantChips);
        const stat = P._wvLfStat = { kind: list.kind, item: list.item, rows: list.rows.length, slices: 1, maxSliceMs: 0, workMs: 0, firstMs: 0, done: false, stopped: false, sliced: false };
        const t0 = nowMs();
        let r = g.next();
        while (!r.done && nowMs() - t0 < SYNC_MS) r = g.next();
        const d = nowMs() - t0;
        stat.firstMs = d; stat.workMs = d; stat.maxSliceMs = d;
        if (r.done) {
            stat.done = true;
            this._wvLfKeep(st, rkey, lkey, r.value);
            return true;
        }
        stat.sliced = true;
        const me = { key: runKey, stop: false };
        st.run = me;
        this._wvLfLater(body, st, list, g, me, rkey, lkey, stat);
        return false;
    }

    /** A computation's answers into the state: the order, the chips. */
    _wvLfKeep(st: LfState, rkey: string, lkey: string, v: { order: number[] | null; chips: WvLfChipSet | null }) {
        if (v.order) st.res = { key: rkey, lkey, order: v.order };
        if (v.chips) st.chipSet = { lkey, set: v.chips };
    }

    /** The steps of one result: every row's facet (kept per list), the chips of
     *  the whole list (the line open), then the rows that pass, in order. */
    *_wvLfSteps(list: WvLfList, q: WvLfQuery, chips: WvLfChipsOn, sort: WvLfOrderSpec, wantOrder: boolean, wantChips: boolean): Generator<void, { order: number[] | null; chips: WvLfChipSet | null }, void> {
        let cache = lfFacets.get(list.key);
        if (!cache) { cache = new Map(); lfFacets.set(list.key, cache); }
        const rows = list.rows;
        const facets: WvLfRow[] = new Array(rows.length);
        let made = 0;
        for (let i = 0; i < rows.length; i++) {
            const id = list.fid(rows[i], i);
            let f = cache.get(id);
            if (!f) {
                f = list.facet(rows[i], i);
                cache.set(id, f);
                if (++made % FACET_STEP === 0) yield;
            }
            facets[i] = f;
            if (i % 5000 === 4999) yield;
        }
        let set: WvLfChipSet | null = null;
        if (wantChips) { yield; set = wvLfChips(facets, list.libChips, list.pdfChip); }
        let order: number[] | null = null;
        if (wantOrder) { yield; order = yield* wvLfOrderSteps(facets, q, chips, sort, list.natural); }
        return { order, chips: set };
    }

    /** The rest of a computation in idle moments of the body's window (the
     *  sandbox clock as a backstop: a window that closes meanwhile never calls
     *  back), SLICE_MS a slice; it stops when the body shows another item, its
     *  state moved on (a new filter), the body left the pane, or destroy(). */
    _wvLfLater(body: any, st: LfState, list: WvLfList, g: Generator<void, any, void>, me: { key: string; stop: boolean }, rkey: string, lkey: string, stat: any) {
        const P: any = this;
        const w: any = winOf(body);
        const idle = () => new Promise<void>((res) => {
            let done = false;
            const go = () => { if (!done) { done = true; res(); } };
            const t = wvTimeout(go, 250);
            try { if (w && !w.closed && typeof w.requestIdleCallback === "function") { w.requestIdleCallback(go, { timeout: 100 }); return; } } catch (e) {}
            wvClearTimeout(t);
            wvTimeout(go, 0);
        });
        const shows = () => {
            try {
                if (!body.isConnected) return false;
                const el = body.closest && body.closest("item-pane-custom-section");
                return !el || !el.item || el.item.id === list.item;
            } catch (e) { return false; }
        };
        (async () => {
            for (;;) {
                await idle();
                if (me.stop || P._wvDestroyed || st.run !== me || lfStates.get(body) !== st || !shows()) {
                    stat.stopped = true;
                    try { g.return(undefined as any); } catch (e) {}
                    if (st.run === me) st.run = null;
                    return;
                }
                const t0 = nowMs();
                let r = g.next();
                while (!r.done && nowMs() - t0 < SLICE_MS) r = g.next();
                const d = nowMs() - t0;
                stat.slices++;
                stat.workMs += d;
                if (d > stat.maxSliceMs) stat.maxSliceMs = d;
                if (r.done) {
                    stat.done = true;
                    st.run = null;
                    this._wvLfKeep(st, rkey, lkey, r.value);
                    if (stat.workMs > 20) Zotero.debug("[Weavero] list filter: " + stat.rows + " rows in " + stat.slices + " slices, " + Math.round(stat.workMs) + " ms of work, longest " + Math.round(stat.maxSliceMs) + " ms");
                    this._wvLfRedraw(body);
                    return;
                }
            }
        })().catch((e: any) => { if (st.run === me) st.run = null; Zotero.debug("[Weavero] list filter err: " + e); });
    }

    /** Draw `body`'s section again (its own method, on the live plugin). */
    _wvLfRedraw(body: any) {
        try {
            const st = lfStates.get(body);
            const lp: any = wvLivePlugin();
            if (!st || !st.list || !lp || typeof lp[st.list.redraw] !== "function") return;
            holdPaneScroll(body);
            lp[st.list.redraw](body);
        } catch (e) { Zotero.debug("[Weavero] list filter redraw err: " + e); }
    }

    _wvLfReset(st: LfState) {
        if (st.run) { st.run.stop = true; st.run = null; }
        wvClearTimeout(st.debT); st.debT = null;
        st.openQ = false;
        st.openF = false;
        st.text = "";
        st.q = wvLfParse("");
        st.chips = wvLfChipsNone();
    }

    /** One part cleared and its line closed: the search's text, or the chips (the
     *  sort stays: it is no filter). */
    _wvLfClearPart(st: LfState, part: WvLfPart) {
        if (part === "q") {
            wvClearTimeout(st.debT); st.debT = null;
            st.text = "";
            st.q = wvLfParse("");
            st.openQ = false;
        }
        else {
            st.chips = wvLfChipsNone();
            st.openF = false;
        }
    }

    // ---- the lines ------------------------------------------------------------------

    /** The lines of `body` as `st` says, in one box at the top of the body (its
     *  first child, above the section's own box): the search line, then the
     *  chips' line (WV_LF_FILTERS_UI). Each is built when it opens and gone when
     *  it closes; its count and chips are written when they change -- never
     *  rebuilt while open, so the field keeps its focus and caret. The count ("3
     *  of 150") is the search line's, or the chips' line's while the search line
     *  is closed. */
    _wvLfBarSync(body: any, doc: any, st: LfState, list: WvLfList, view: WvLfView | null, able: boolean) {
        try {
            let bar: any = body.querySelector(":scope > .wv-lf-bar");
            const wantQ = !!(able && view && st.openQ), wantF = !!(WV_LF_FILTERS_UI && able && view && st.openF);
            if (!wantQ && !wantF) {
                if (bar) bar.remove();
                st.qSig = ""; st.fSig = ""; st.chipSig = "";
                return;
            }
            if (!bar) {
                bar = wvHtmlEl(doc, "div", "wv-lf-bar");
                body.insertBefore(bar, body.firstChild);
            }
            let q: any = bar.querySelector(":scope > .wv-lf-qline");
            let f: any = bar.querySelector(":scope > .wv-lf-fline");
            if (wantQ && !q) { q = this._wvLfQLineBuild(body, doc); bar.insertBefore(q, bar.firstChild); st.qSig = ""; }
            else if (!wantQ && q) { q.remove(); q = null; st.qSig = ""; }
            if (wantF && !f) { f = this._wvLfFLineBuild(body, doc); bar.appendChild(f); st.fSig = ""; st.chipSig = ""; }
            else if (!wantF && f) { f.remove(); f = null; st.fSig = ""; st.chipSig = ""; }
            const v = view as WvLfView;
            const n = list.rows.length;
            const count = v.busy && v.active ? wvStr("weavero-lf-busy", null, null)
                : v.active ? wvStr("weavero-lf-count", { shown: v.rows.length, total: n }, null) : "";
            if (q) {
                const input: any = q.querySelector(".wv-lf-input");
                if (input && input.value !== st.text && doc.activeElement !== input) input.value = st.text;
                const sig = list.kind + "|" + n + "|" + count;
                if (sig !== st.qSig) {
                    st.qSig = sig;
                    if (input) input.setAttribute("placeholder", wvStr("weavero-lf-placeholder", { kind: list.kind, count: n }, "placeholder"));
                    const c = q.querySelector(".wv-lf-count");
                    if (c) c.textContent = count;
                }
            }
            if (f) {
                const fcount = q ? "" : count;
                const sig = list.kind + "|" + fcount;
                if (sig !== st.fSig) {
                    st.fSig = sig;
                    const c = f.querySelector(".wv-lf-count");
                    if (c) c.textContent = fcount;
                }
                this._wvLfChipsSync(body, f, doc, st, list);
            }
        } catch (e) { Zotero.debug("[Weavero] list filter bar err: " + e); }
    }

    // ---- the sort, in the header ------------------------------------------------------

    /** The sort's chips in `body`'s section header as `sort` says (null: hidden,
     *  a list too short): built once, before Weavero's header buttons; the
     *  field's label and the arrow written when they change. Mutation-quiet: the
     *  view runs at every draw. A box of another instance is made again. */
    _wvLfSortSync(body: any, doc: any, list: WvLfList, sort: WvLfOrderSpec | null) {
        try {
            const sec = body && body.closest ? body.closest("collapsible-section") : null;
            const head = sec ? sec.querySelector(":scope > .head") : null;
            if (!head) return;
            const P: any = this;
            const tag = P._wvWireTag();
            let box: any = head.querySelector(":scope > ." + WV_LF_SORTBOX);
            if (box && box.getAttribute("data-wv-tag") !== tag) { box.remove(); box = null; }
            if (!sort) { if (box) wvSetBoolAttr(box, "hidden", true); return; }
            wvInjectStyle(doc, STYLE_ID, LF_CSS);
            if (!box) box = this._wvLfSortBuild(body, doc, tag);
            // Before Weavero's header buttons (the funnel while the chips are on,
            // the magnifier), else before the twisty.
            const at = head.querySelector(":scope > ." + WV_LF_SECTION_BUTTONS[0].type) || head.querySelector(":scope > .twisty");
            if (at) { if (box.nextElementSibling !== at) head.insertBefore(box, at); }
            else if (box.parentNode !== head) head.appendChild(box);
            wvSetBoolAttr(box, "hidden", false);
            const sig = list.kind + "|" + wvLfSortStr(sort);
            if (box.getAttribute("data-wv-lf-sig") === sig) return;
            box.setAttribute("data-wv-lf-sig", sig);
            const drop: any = box.querySelector(":scope > ." + SORT_DROP);
            const lab: any = drop && drop.querySelector(":scope > ." + SORT_LAB);
            const dir: any = box.querySelector(":scope > ." + SORT_DIR);
            if (lab) {
                lab.textContent = wvStr("weavero-lf-sort-short", { field: sort.field }, null);
                // A squeeze made for the last label (_wvLfSortSqueeze) is the next
                // fit pass's to make again.
                lab.style.removeProperty("max-width");
            }
            if (drop) {
                drop.setAttribute("data-wv-lf-field", sort.field);
                if (!drop.hasAttribute("data-wv-lf-menu")) drop.setAttribute("title", wvStr("weavero-lf-sort-button", null, "title"));
            }
            if (dir) {
                const has = wvLfFieldHasDir(sort.field);
                wvSetBoolAttr(dir, "hidden", !has);
                if (has) {
                    dir.textContent = sort.dir === "asc" ? "↑" : "↓";
                    dir.setAttribute("data-wv-lf-dir", sort.dir);
                    const order = wvStr("weavero-lf-sort-dir", { order: this._wvLfDirWord(sort) }, "title");
                    const act = wvStr("weavero-rpanel-ann-sort-direction", null, null);
                    dir.setAttribute("title", order + "\n" + act);
                    dir.setAttribute("aria-label", act);
                    dir.setAttribute("aria-description", order);
                }
                else dir.removeAttribute("data-wv-lf-dir");
            }
        } catch (e) { Zotero.debug("[Weavero] list sort chips err: " + e); }
    }

    /** What `sort`'s direction reads as (weavero-lf-sort-dir's $order). */
    _wvLfDirWord(sort: WvLfOrderSpec): string {
        const up = sort.dir === "asc";
        if (sort.field === "cited") return up ? "least" : "most";
        if (sort.field === "title" || sort.field === "author") return up ? "az" : "za";
        return up ? "oldest" : "newest";
    }

    /** The sort's box: the dropdown chip (the field's label, the chevron) and the
     *  direction chip; their gestures (each resolves the live plugin). The header
     *  toggles its section on a click and on Enter / Space, and opens the
     *  section's menu on a right-click (collapsibleSection.js, Zotero's own
     *  buttons excepted by their class): the chips keep their events. */
    _wvLfSortBuild(body: any, doc: any, tag: string): any {
        const box = wvHtmlEl(doc, "span", WV_LF_SORTBOX);
        box.setAttribute("data-wv-tag", tag);
        const drop = wvHtmlEl(doc, "button", SORT_DROP, undefined, box);
        drop.setAttribute("type", "button");
        drop.setAttribute("aria-haspopup", "menu");
        drop.setAttribute("aria-expanded", "false");
        wvHtmlEl(doc, "span", SORT_LAB, undefined, drop);
        const caret = wvHtmlEl(doc, "span", "wv-lf-sortcaret", undefined, drop);
        caret.setAttribute("aria-hidden", "true");
        const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 8 8", width: 8, height: 8 }, caret);
        wvSvgEl(doc, "path", { d: CHEVRON_PATH }, svg);
        const dir = wvHtmlEl(doc, "button", SORT_DIR, undefined, box);
        dir.setAttribute("type", "button");
        let keyAt = 0;
        const act = (which: "menu" | "flip") => {
            try {
                const lp: any = wvLivePlugin();
                if (!lp) return;
                if (which === "menu") lp._wvLfSortMenu(body, drop);
                else lp._wvLfSortFlip(body);
            } catch (e) {}
        };
        const wire = (el: any, which: "menu" | "flip") => {
            el.addEventListener("click", (e: any) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                if (Date.now() - keyAt < KEY_CLICK_MS) return;
                act(which);
            });
            el.addEventListener("keydown", (e: any) => {
                // Zotero's header buttons take no Left / Right (collapsibleSection.js
                // _handleKeyDown); Up goes on to the header, as from them.
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); return; }
                if (e.key === "Enter" || e.key === " " || (which === "menu" && e.key === "ArrowDown")) {
                    e.preventDefault();
                    e.stopPropagation();
                    keyAt = Date.now();
                    act(which);
                }
            });
            el.addEventListener("contextmenu", (e: any) => { e.stopPropagation(); });
        };
        wire(drop, "menu");
        wire(dir, "flip");
        return box;
    }

    /** Give `over` px of the header to the title's line: the field's label of
     *  `head`'s sort narrowed (ellipsis), never under LAB_MIN_PX. What could not
     *  be given back is returned. A pass that measures again first releases
     *  (_wvLfSortRelease). References' header chips use it to stay on the
     *  header's line (refs.ts _wvRefsChipsPlace; lfsort.1: the label yields
     *  before the chips move). */
    _wvLfSortSqueeze(head: any, over: number): number {
        try {
            const lab: any = head && head.querySelector(":scope > ." + WV_LF_SORTBOX + ":not([hidden]) > ." + SORT_DROP + " > ." + SORT_LAB);
            if (!lab || !(over > 0)) return over;
            const w = lab.getBoundingClientRect().width;
            const take = Math.min(over, Math.max(0, w - LAB_MIN_PX));
            if (take <= 0) return over;
            lab.style.maxWidth = Math.floor(w - take) + "px";
            return over - take;
        } catch (e) { return over; }
    }

    /** The field's label of `head`'s sort at its own width again. */
    _wvLfSortRelease(head: any) {
        try {
            const lab: any = head && head.querySelector(":scope > ." + WV_LF_SORTBOX + " > ." + SORT_DROP + " > ." + SORT_LAB);
            if (lab && lab.style.maxWidth) lab.style.removeProperty("max-width");
        } catch (e) {}
    }

    /** The search line: Zotero's magnifier drawn, the field, the count; its
     *  gestures (each resolves the live plugin). */
    _wvLfQLineBuild(body: any, doc: any): any {
        const q = wvHtmlEl(doc, "div", "wv-lf-line wv-lf-qline wv-lf-field");
        // Zotero's magnifier, drawn (its 16-px drawing at 12 px: the line is small).
        const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 12, height: 12 }, q);
        wvSvgEl(doc, "path", { "fill-rule": "evenodd", d: "M11 6C11 8.76 8.76 11 6 11C3.24 11 1 8.76 1 6C1 3.24 3.24 1 6 1C8.76 1 11 3.24 11 6ZM9.87 10.58C8.83 11.47 7.48 12 6 12C2.69 12 0 9.31 0 6C0 2.69 2.69 0 6 0C9.31 0 12 2.69 12 6C12 7.48 11.47 8.83 10.58 9.87L16 15.29L15.29 16L9.87 10.58Z" }, svg);
        const input = wvHtmlEl(doc, "input", "wv-lf-input", undefined, q);
        input.setAttribute("type", "text");
        input.setAttribute("spellcheck", "false");
        wvHtmlEl(doc, "span", "wv-lf-count", undefined, q);
        input.addEventListener("input", () => {
            try { const lp: any = wvLivePlugin(); if (lp) lp._wvLfTyped(body, String(input.value || ""), false); } catch (e) {}
        });
        input.addEventListener("keydown", (e: any) => {
            try { const lp: any = wvLivePlugin(); if (lp) lp._wvLfFieldKey(body, e); } catch (er) {}
        });
        return q;
    }

    /** The chips' line (WV_LF_FILTERS_UI): the chips, the count; Esc anywhere in
     *  it (_wvLfFilterKey). The sort is the header's since lfsort.1. */
    _wvLfFLineBuild(body: any, doc: any): any {
        const f = wvHtmlEl(doc, "div", "wv-lf-line wv-lf-fline");
        wvHtmlEl(doc, "div", "wv-lf-chips", undefined, f);
        wvHtmlEl(doc, "span", "wv-lf-count", undefined, f);
        f.addEventListener("keydown", (e: any) => {
            try { const lp: any = wvLivePlugin(); if (lp) lp._wvLfFilterKey(body, e); } catch (er) {}
        });
        return f;
    }

    /** The chips of the list (lib/list-filter.ts wvLfChips) in line `line`, rebuilt
     *  when their counts or states change: its most common types (Zotero's names),
     *  "Since <year>", Has PDF where the list offers it; In library / Not in
     *  library where the list offers them. A chip that is on stays, whatever it
     *  counts. */
    _wvLfChipsSync(body: any, line: any, doc: any, st: LfState, list: WvLfList) {
        const host: any = line.querySelector(".wv-lf-chips");
        if (!host) return;
        const set: WvLfChipSet | null = st.chipSet && st.chipSet.lkey === keyIdOf(list.key) + "|" + list.variant ? st.chipSet.set : null;
        const c = st.chips;
        const chips: Array<{ id: string; label: string; count: number; on: boolean }> = [];
        if (set) {
            const types = set.types.slice();
            for (const t of c.types) if (!types.some((x) => x.type === t)) types.push({ type: t, count: 0 });
            for (const t of types) chips.push({ id: "type:" + t.type, label: wvLfTypeLabel(t.type), count: t.count, on: c.types.indexOf(t.type) >= 0 });
            const since = set.since || (c.since ? { year: c.since, count: 0 } : null);
            if (since) chips.push({ id: "since:" + since.year, label: wvStr("weavero-lf-chip", { chip: "since", year: String(since.year) }, null), count: since.count, on: c.since === since.year });
            if (list.pdfChip && (set.pdf >= 0 || c.pdf)) chips.push({ id: "pdf", label: wvStr("weavero-lf-chip", { chip: "pdf", year: "" }, null), count: Math.max(0, set.pdf), on: c.pdf });
            if (list.libChips) {
                if (set.inLib >= 0 || c.lib === "in") chips.push({ id: "lib:in", label: wvStr("weavero-lf-chip", { chip: "in", year: "" }, null), count: Math.max(0, set.inLib), on: c.lib === "in" });
                if (set.outLib >= 0 || c.lib === "out") chips.push({ id: "lib:out", label: wvStr("weavero-lf-chip", { chip: "out", year: "" }, null), count: Math.max(0, set.outLib), on: c.lib === "out" });
            }
        }
        const sig = chips.map((x) => x.id + ":" + x.count + (x.on ? "+" : "")).join(",");
        if (sig === st.chipSig) return;
        st.chipSig = sig;
        // A chip with the focus is rebuilt: the focus goes to the same chip again.
        let had = "";
        try { const a = doc.activeElement; if (a && host.contains(a)) had = String(a.getAttribute("data-wv-lf-chip") || ""); } catch (e) {}
        host.textContent = "";
        for (const x of chips) {
            const el = wvHtmlEl(doc, "span", "wv-lf-chip", x.label, host);
            wvHtmlEl(doc, "span", "wv-lf-chip-n", String(x.count), el);
            el.setAttribute("data-wv-lf-chip", x.id);
            el.setAttribute("role", "button");
            el.setAttribute("tabindex", "0");
            el.setAttribute("aria-pressed", x.on ? "true" : "false");
            el.setAttribute("title", wvStr("weavero-lf-chip-tip", { on: x.on ? "yes" : "no" }, "title"));
            const fire = (e: any) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvLfChip(body, x.id);
                } catch (er) {}
            };
            el.addEventListener("click", (e: any) => { if (e.button === 0) fire(e); });
            el.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") fire(e); });
            if (had && had === x.id) { try { el.focus(); } catch (e) {} }
        }
    }

    // ---- the gestures ----------------------------------------------------------------

    /** The magnifier (Zotero's header-button click, through the section's hook):
     *  opens the search line, focus in its field; open, clears its text and
     *  closes it. */
    _wvLfButtonClick({ body }: any) {
        try { this._wvLfToggle(body, "q"); } catch (e) { Zotero.debug("[Weavero] list filter toggle err: " + e); }
    }

    /** The funnel (WV_LF_FILTERS_UI): opens the chips' line, focus on its first
     *  chip; open, clears its chips and closes it. */
    _wvLfFilterButtonClick({ body }: any) {
        try { this._wvLfToggle(body, "f"); } catch (e) { Zotero.debug("[Weavero] list filter toggle err: " + e); }
    }

    /** Line `part` of `body` opened or closed (`open`; toggled when absent). A
     *  line closed has its part cleared: a closed line never hides a filter. The
     *  chips' line never opens while their interface is off. */
    _wvLfToggle(body: any, part: WvLfPart, open?: boolean) {
        const st = lfStates.get(body);
        if (!st || !st.list) return;
        if (part === "f" && !WV_LF_FILTERS_UI) {
            if (st.openF || wvLfChipsActive(st.chips)) { this._wvLfClearPart(st, "f"); this._wvLfRedraw(body); }
            return;
        }
        const cur = part === "q" ? st.openQ : st.openF;
        const want = open === undefined ? !cur : open;
        if (want === cur) { if (want) this._wvLfFocusLine(body, part); return; }
        if (want) {
            if (part === "q") st.openQ = true; else st.openF = true;
            // A folded section unfolds: the lines are in its body.
            try { const sec = body.closest ? body.closest("collapsible-section") : null; if (sec && sec.open === false) sec.open = true; } catch (e) {}
        }
        else this._wvLfClearPart(st, part);
        this._wvLfRedraw(body);
        if (want) this._wvLfFocusLine(body, part);
    }

    /** The focus into line `part`: the search's field, the first chip. */
    _wvLfFocusLine(body: any, part: WvLfPart) {
        try {
            const el = body.querySelector(part === "q" ? ":scope > .wv-lf-bar > .wv-lf-qline .wv-lf-input" : ":scope > .wv-lf-bar > .wv-lf-fline .wv-lf-chip");
            if (el) el.focus();
        } catch (e) {}
    }

    /** Text typed in the field: applied DEBOUNCE_MS after the last key, at once
     *  with `now` (Enter). */
    _wvLfTyped(body: any, text: string, now: boolean) {
        const st = lfStates.get(body);
        if (!st) return;
        st.text = text;
        wvClearTimeout(st.debT);
        st.debT = null;
        const apply = () => {
            st.debT = null;
            const lp: any = wvLivePlugin();
            if (!lp || lfStates.get(body) !== st) return;
            const q = wvLfParse(st.text);
            if (JSON.stringify(q) === JSON.stringify(st.q)) return;
            st.q = q;
            lp._wvLfRedraw(body);
        };
        if (now) apply();
        else st.debT = wvTimeout(apply, DEBOUNCE_MS);
    }

    /** The field's keys: Esc clears its text (the chips are the other line's),
     *  then closes the search line -- Zotero's own Esc then takes the focus back
     *  to the items list or the reader (itemDetails.js _handleKeydown); Enter
     *  applies at once; Down goes to the first row. */
    _wvLfFieldKey(body: any, e: any) {
        const st = lfStates.get(body);
        if (!st) return;
        if (e.key === "Escape") {
            const input = e.target;
            const had = !!(st.text || (input && input.value) || !wvLfQueryEmpty(st.q));
            if (had) {
                e.preventDefault();
                e.stopPropagation();
                if (input) input.value = "";
                wvClearTimeout(st.debT); st.debT = null;
                st.text = ""; st.q = wvLfParse("");
                this._wvLfRedraw(body);
                return;
            }
            this._wvLfToggle(body, "q", false);
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            this._wvLfTyped(body, String(e.target.value || ""), true);
            return;
        }
        if (e.key === "ArrowDown") {
            const row = this._wvLfRowAt(body, 0);
            if (row) { e.preventDefault(); e.stopPropagation(); row.setAttribute("tabindex", "-1"); row.focus(); }
        }
    }

    /** The chips' line's Esc (from a chip): the chips off, the focus on the
     *  first; then the line closed -- Zotero's own Esc after it, as the field's. */
    _wvLfFilterKey(body: any, e: any) {
        const st = lfStates.get(body);
        if (!st || e.key !== "Escape" || !WV_LF_FILTERS_UI) return;
        if (wvLfChipsActive(st.chips)) {
            e.preventDefault();
            e.stopPropagation();
            st.chips = wvLfChipsNone();
            this._wvLfRedraw(body);
            this._wvLfFocusLine(body, "f");
            return;
        }
        this._wvLfToggle(body, "f", false);
    }

    /** Row `n` of `body`'s list (the rows the section marks `data-wv-lf-row`). */
    _wvLfRowAt(body: any, n: number): any {
        try { return body.querySelectorAll("[data-wv-lf-row]")[n] || null; } catch (e) { return null; }
    }

    /** Up and Down between a list's rows (from the field's Down), Up from the
     *  first back to the field -- else to the chips, when only their line is
     *  open -- Enter as a click on the row. A section calls it for each list
     *  element it builds. */
    _wvLfListKeys(body: any, list: any) {
        try {
            list.addEventListener("keydown", (e: any) => {
                try {
                    const row = e.target && e.target.closest ? e.target.closest("[data-wv-lf-row]") : null;
                    if (!row || e.target !== row) return;
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        const rows = Array.from(body.querySelectorAll("[data-wv-lf-row]")) as any[];
                        const k = rows.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1);
                        e.preventDefault();
                        e.stopPropagation();
                        if (k < 0) {
                            const lp: any = wvLivePlugin();
                            const st = lfStates.get(body);
                            if (lp && st) lp._wvLfFocusLine(body, st.openQ || !st.openF ? "q" : "f");
                            return;
                        }
                        const next = rows[k];
                        if (next) { next.setAttribute("tabindex", "-1"); next.focus(); }
                        return;
                    }
                    if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        const t = row.querySelector(".wv-cb-text, .wv-refs-sec-text") || row;
                        t.dispatchEvent(new (winOf(row)).MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
                    }
                } catch (er) {}
            });
        } catch (e) {}
    }

    /** A chip pressed: on, or off again. The types are alternatives; In library and
     *  Not in library exclude each other. */
    _wvLfChip(body: any, id: string) {
        const st = lfStates.get(body);
        if (!st || !WV_LF_FILTERS_UI) return;
        const c: WvLfChipsOn = { types: st.chips.types.slice(), since: st.chips.since, pdf: st.chips.pdf, lib: st.chips.lib };
        const [kind, val] = [id.split(":")[0], id.slice(id.indexOf(":") + 1)];
        if (kind === "type") { const k = c.types.indexOf(val); if (k >= 0) c.types.splice(k, 1); else c.types.push(val); }
        else if (kind === "since") { const y = Number(val) || 0; c.since = c.since === y ? 0 : y; }
        else if (kind === "pdf") c.pdf = !c.pdf;
        else if (kind === "lib") c.lib = c.lib === val ? "" : (val as "in" | "out");
        st.chips = c;
        this._wvLfRedraw(body);
    }

    /** The sort menu under the header's dropdown chip, as the reader's annotation
     *  sort menu (reader-panels.ts _wvShowAnnSortMenu): a "Sort by" heading, then
     *  the fields the list offers, a tick on the current one (a checkbox entry:
     *  the platform's tick, the reader's ✓), "(default)" on the list's own (the
     *  sessions sort menu's acceltext slot, sessions.ts). A pick is remembered for
     *  every section of the kind; switching field takes that field's direction,
     *  re-picking the current one keeps it (the reader's rule, _wvAnnSetSort).
     *  The menu itself is the platform's: keyboard and focus as every XUL menu. */
    _wvLfSortMenu(body: any, anchor: any) {
        const P: any = this;
        try {
            const st = lfStates.get(body);
            const list = st && st.list;
            if (!list) return;
            const doc = anchor.ownerDocument;
            const old = doc.getElementById(MENU_ID);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const cur = this._wvLfSortOf(list);
            const nat = this._wvLfNaturalOf(list);
            const pop = doc.createXULElement("menupopup");
            pop.id = MENU_ID;
            pop.setAttribute("data-wv-tag", P._wvWireTag());
            wvMenuItem(doc, { l10n: { id: "weavero-lf-sort-heading" }, disabled: true, cls: "wv-lf-sort-heading" }, pop);
            for (const f of list.sorts) {
                if (WV_LF_FIELDS.indexOf(f) < 0) continue;
                const mi = wvMenuItem(doc, {
                    l10n: { id: "weavero-lf-sort", args: { field: f } },
                    attrs: { type: "checkbox", autocheck: "false", "data-wv-lf-field": f },
                    onCommand: () => {
                        const lp: any = wvLivePlugin();
                        if (lp) lp._wvLfSortPick(body, list.kind, { field: f, dir: f === cur.field ? cur.dir : WV_LF_FIELD_DIR[f] });
                    },
                }, pop);
                wvSetBoolAttr(mi, "checked", f === cur.field);
                if (f === nat.field) mi.setAttribute("acceltext", wvStr("weavero-menu-default-hint", null, null));
            }
            wvPopupHost(doc).appendChild(pop);
            // The chip's tooltip set aside while its menu is open (src-ts.md: a
            // dropdown Weavero opens itself keeps its anchor's title off it).
            const tip = anchor.getAttribute("title");
            anchor.removeAttribute("title");
            anchor.setAttribute("data-wv-lf-menu", "true");
            anchor.setAttribute("aria-expanded", "true");
            pop.addEventListener("popuphidden", (e: any) => {
                if (e.target !== pop) return;
                try {
                    anchor.removeAttribute("data-wv-lf-menu");
                    anchor.setAttribute("aria-expanded", "false");
                    if (tip) anchor.setAttribute("title", tip);
                } catch (er) {}
                try { pop.remove(); } catch (er) {}
            });
            pop.openPopup(anchor, "after_start", 0, 2, false, false);
        } catch (e) { Zotero.debug("[Weavero] list sort menu err: " + e); }
    }

    /** The direction chip: `body`'s list in the other direction, remembered for
     *  the kind. */
    _wvLfSortFlip(body: any) {
        try {
            const st = lfStates.get(body);
            const list = st && st.list;
            if (!list) return;
            const cur = this._wvLfSortOf(list);
            if (!wvLfFieldHasDir(cur.field)) return;
            this._wvLfSortPick(body, list.kind, { field: cur.field, dir: cur.dir === "asc" ? "desc" : "asc" });
        } catch (e) { Zotero.debug("[Weavero] list sort flip err: " + e); }
    }

    /** A sort the user chose in `body`'s header: remembered for the kind, every
     *  section of it drawn again; a folded section unfolds to show it (as the
     *  magnifier's line does). */
    _wvLfSortPick(body: any, kind: string, spec: WvLfOrderSpec) {
        try {
            const sec = body && body.closest ? body.closest("collapsible-section") : null;
            if (sec && sec.open === false) sec.open = true;
        } catch (e) {}
        this._wvLfSetSort(kind, spec);
    }

    /** Sort `kind`'s lists by `sort` from now on (a spec, "year:asc", or an older
     *  one-word order; `dir` turns a field with a direction), written in the
     *  stored form of lfsort.1 (wvLfSortStr), and draw them again. */
    _wvLfSetSort(kind: string, sort: WvLfSortLike, dir?: WvLfDir) {
        try {
            const spec = wvLfSortParse(sort);
            if (!spec) return;
            if (dir && wvLfFieldHasDir(spec.field)) spec.dir = dir;
            Zotero.Prefs.set("weavero.listSort." + kind, wvLfSortStr(spec));
            for (const body of Array.from(lfBodies)) {
                if (!body.isConnected) { lfBodies.delete(body); continue; }
                const st = lfStates.get(body);
                if (st && st.kind === kind) this._wvLfRedraw(body);
            }
        } catch (e) { Zotero.debug("[Weavero] list filter sort err: " + e); }
    }

    // ---- facets ---------------------------------------------------------------------

    /** The facet of library item `id` (a row's best copy): the References
     *  index's record (title, first author, year, PDF) -- what a row has even when
     *  the item is not loaded -- and, when Zotero holds the item, its type, every
     *  creator, its publication, its date added. `order`: its place in the list;
     *  `text`: the row's own text (a reference's entry); `year`: a year to use
     *  when the item has none. */
    _wvLfItemFacet(id: number, order: number, text: string, year: number): WvLfRow {
        const P: any = this;
        const rec: any = P._wvRefsIx ? P._wvRefsIx.items.get(id) : null;
        let title = rec ? String(rec.title || "") : "", first = rec ? String(rec.first || "") : "";
        let y = rec ? Number(rec.year) || 0 : 0;
        let type = "", creators = "", pub = "", added = 0;
        const pdf = !!(rec && rec.pdf);
        try {
            const it = Zotero.Items.get(id);
            if (it && !it.deleted) {
                try { type = String(Zotero.ItemTypes.getName(it.itemTypeID) || ""); } catch (e) {}
                try { if (!title) title = String(it.getDisplayTitle() || ""); } catch (e) {}
                try {
                    const cs: any[] = it.getCreators() || [];
                    creators = cs.map((c: any) => (c.firstName ? c.firstName + " " : "") + (c.lastName || "")).join("; ");
                    if (!first && cs.length) first = String(cs[0].lastName || "");
                } catch (e) {}
                for (const f of ["publicationTitle", "journalAbbreviation", "bookTitle", "proceedingsTitle", "university", "publisher"]) {
                    try { const v = it.getField(f); if (v) pub += " " + v; } catch (e) {}
                }
                try { if (!y) { const m = String(it.getField("date", true, true) || "").match(/\d{4}/); y = m ? Number(m[0]) : 0; } } catch (e) {}
                try { const d = Zotero.Date.sqlToDate(it.dateAdded, true); added = d ? d.getTime() : 0; } catch (e) {}
            }
        } catch (e) {}
        if (!y) y = year || 0;
        return {
            hay: wvLfFold([title, creators || first, y ? String(y) : "", pub, text || "", wvLfTypeLabel(type)].join("\n")),
            year: y, type, pdf, lib: true, added, cites: this._wvLfCitesOf(id), order,
            title: wvLfSortKey(title), first: wvLfSortKey(first),
        };
    }

    /** How many of your papers cite item `id` (any copy): the Cited by index's
     *  citing PDFs, a paper's several PDFs counted once. 0 without the index. */
    _wvLfCitesOf(id: number): number {
        const P: any = this;
        try {
            const ix = P._wvCbIx;
            const atts: number[] | undefined = ix && ix.rev.get(id);
            if (!atts || !atts.length) return 0;
            if (atts.length === 1) return 1;
            const papers = new Set<number>();
            for (const a of atts) { const r = ix.recs.get(a); papers.add(r && r.p ? r.p : a); }
            return papers.size;
        } catch (e) { return 0; }
    }

    /** Can the lists be sorted by how often they are cited (the Cited by index there)? */
    _wvLfCitesOn(): boolean {
        try { return !!(this as any)._wvCbOn() && !!(this as any)._wvCbIx; } catch (e) { return false; }
    }

    /** Every list's facets forgotten (the suite: a cold computation again). */
    _wvLfFacetsDrop() {
        lfFacets = new WeakMap();
    }

    /** destroy(): the lines, the header's sort chips, the sheet and the menu in
     *  every window, the state. */
    _wvLfDestroy() {
        lfFacets = new WeakMap();
        for (const body of Array.from(lfBodies)) {
            const st = lfStates.get(body);
            if (st) { if (st.run) st.run.stop = true; wvClearTimeout(st.debT); }
            try { const bar = body.querySelector(":scope > .wv-lf-bar"); if (bar) bar.remove(); } catch (e) {}
            try {
                const sec = body.closest ? body.closest("collapsible-section") : null;
                const box = sec && sec.querySelector(":scope > .head > ." + WV_LF_SORTBOX);
                if (box) box.remove();
            } catch (e) {}
        }
        lfBodies.clear();
        typeLabels.clear();
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { wvRemoveStyle(w.document, STYLE_ID); } catch (e) {}
                try { const m = w.document && w.document.getElementById(MENU_ID); if (m) m.remove(); } catch (e) {}
                try { for (const b of Array.from(w.document.querySelectorAll("." + WV_LF_SORTBOX)) as any[]) b.remove(); } catch (e) {}
            }
        } catch (e) {}
        try { for (const w of wvMainWins()) { const m = w.document.getElementById(MENU_ID); if (m) m.remove(); } } catch (e) {}
        (this as any)._wvLfStat = null;
    }
}

const _lfDescriptors = Object.getOwnPropertyDescriptors(_ListFilterMixin.prototype);
delete (_lfDescriptors as any).constructor;
export const listFilterMethods = _lfDescriptors;
