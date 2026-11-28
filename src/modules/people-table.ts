// Researchers tab as Google Contacts, step 2 (design approved by MJT 2026-11-25,
// his answers 2026-11-26): the left pane and the table of researchers.
//   - LEFT PANE, "Views + Manage + Browse" (Google Contacts' left navigation):
//     "+ Add a researcher"; the views with their counts -- Researchers,
//     Followed, To check --; "Fix and manage" -- Suggested links, Duplicates,
//     Sources disagree, Without ORCID (views over the records), Build from
//     Followed Authors, Import from a file --; "Browse by" Institution, Country,
//     Position, each opening to its values with their counts: a click filters
//     the table to the value, Alt+click excludes it (the list's filters, lib/
//     people-list.ts wvPpFilterClick); the filters on show above the table, each
//     with its x. No list of researchers, no sort control, no funnel any more.
//     No Export: Weavero has no export of the researchers yet.
//   - THE SEARCH across the top of the centre, above the table.
//   - THE TABLE is Zotero's own VirtualizedTable (chrome/content/zotero/
//     components/virtualized-table.jsx, the items list's; MJT 2026-11-26: "The
//     column headers should work the same as the column headers in the items
//     list of Zotero"): a click on a title sorts, again reverses, the arrow
//     shows it; a border dragged resizes; a title dragged moves the column; a
//     right-click on the titles opens the column menu, a checkmark per column.
//     Widths, order, sort and the columns shown or hidden are kept in ONE pref,
//     `weavero.people.columns` (JSON per column: width, ordinal, sortDirection,
//     shown -- `shown` only once the user chose it). By default a column no
//     researcher has a value in is hidden (today Country). Mounted the way
//     Zotero's Locate manager mounts one (locateManager.jsx): ReactDOM.createRoot
//     on our box, React.createElement(VirtualizedTable, props); the same API in
//     Zotero 10 and 11 (both checked, 2026-11-26).
//   - A ROW under the mouse: its initials become a checkbox (checked rows stay
//     checked, Shift+click checks a range, Ctrl+click on the row too); at its
//     right end a star (follow / unfollow, filled while followed), the pencil
//     (the page in edit mode) and ⋮ (the row's menu, also on a right-click). A
//     click elsewhere on the row opens the page; Enter and a double-click too.
//   - Rows checked: a bar above the table -- how many, select all, Follow,
//     Unfollow, Merge (exactly two, through the duplicates' merge). Escape clears.
//   - No "to check" dot after the names (the To check view says it); the number
//     columns are aligned left, as their titles.
//
// Mixed onto WeaveroPlugin.prototype after people.ts (index.ts).

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, wvPopupHost, wvSetBoolAttr } from "../lib/dom";
import { wvSvgEl } from "../lib/svg";
import { wvMenuItem } from "../lib/menu";
import { wvAccel, wvAccelAny } from "../lib/keys";
import { WvPpRecord, wvPpCountryName, wvPpDisplayName, wvPpNameAs } from "../lib/people-record";
import {
    WV_PP_MENUS, WV_PP_TOGGLES, WV_PP_TABLE_COLS, WvPpFilters,
    wvPpDuplicates, wvPpFilterValueState, wvPpFiltersCount, wvPpFiltersParse, wvPpInitials, wvPpLinkQueue, wvPpListFilter, wvPpMenuValues, wvPpTableSort,
} from "../lib/people-list";
import { wvPpTagFilter, wvPpTagsOf } from "../lib/people-tags";

declare const Zotero: any;

const live = (): any => wvLivePlugin();

/** The VirtualizedTable's id: its rows are `<id>-row-<n>`, its width rules in
 *  a `<style class="<id>-style">` it adds to the document (removed with it). */
export const WV_PP_TABLE_ID = "wv-pp-tbl";
const PREF_COLS = "weavero.people.columns";
const MENU_COLS = "wv-pp-colmenu";
const MENU_ROW = "wv-pp-rowmenu";
const MENU_MERGE = "wv-pp-mergemenu";
/** The views of the left pane, in its order: a view of the table (all,
 *  followed, check; conflict, noOrcid over every researcher), or a screen of
 *  its own (queue, dupes). */
const NAV_VIEWS = ["all", "followed", "check"] as const;
const NAV_FIX = ["conflict", "noOrcid"] as const;
const BROWSE = ["institution", "country", "position"] as const;
/** The 8-px chevron of Zotero's menus and of the list's chips. */
const CHEVRON_PATH = "M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2L0 2.70711Z";
const COL_FLEX: Record<string, number> = { name: 3, institution: 3, country: 1.5, papers: 1.5, phd: 1, tags: 2 };
/** The columns hidden until the user shows them (the column menu). */
const COL_OFF = new Set(["tags"]);

/** Each main window's table: our box (kept across the tab's redraws, so the
 *  table keeps its scroll and is not mounted again), React's root, the
 *  VirtualizedTable once mounted, the rows it shows, and what they were drawn
 *  with. Off the window, as the views (people.ts). */
interface TableState {
    host: any;
    root: any;
    tree: any;
    React: any;
    VT: any;
    rows: WvPpRecord[];
    infos: Map<string, any>;
    lib: Map<string, any> | null;
    cname: (code: string) => string;
    hidden: string;
    tag: string;
    /** A four-digit year's width in the table's font (_wvPeopleYearMin), 0 until measured. */
    yearW: number;
}
const tables = new WeakMap<any, TableState>();

/** The table of `win` taken down: React's root unmounted, our box and the
 *  table's width sheet removed (the People tab closed, Weavero stopped, or a
 *  newer instance drawing). */
export function wvPpTableDrop(win: any) {
    const st = tables.get(win);
    tables.delete(win);
    try { if (st && st.root) st.root.unmount(); } catch (e) {}
    try { if (st && st.host) st.host.remove(); } catch (e) {}
    try {
        const doc = win && win.document;
        const sheet = doc && doc.querySelector("style." + WV_PP_TABLE_ID + "-style");
        if (sheet) sheet.remove();
        for (const id of [MENU_COLS, MENU_ROW, MENU_MERGE]) { const p = doc && doc.getElementById(id); if (p) { try { p.hidePopup(); } catch (er) {} p.remove(); } }
    } catch (e) {}
}

/** The interface's language, for the countries' names. */
const uiLocale = (): string => { try { return String(Zotero.locale || "en-US"); } catch (e) { return "en-US"; } };

/** A value filter's value as written: "Unknown", a country's name, a decade
 *  ("1960s"), or the value itself. */
export function wvPpFilterValueLabel(key: string, value: string): string {
    if (!value) return wvStr("weavero-people-filter-unknown", null, null);
    if (key === "country" || key === "phdCountry") return wvPpCountryName(value, uiLocale()) || value;
    if (key === "birth" || key === "phd") return wvStr("weavero-people-decade", { decade: String(value) }, null);
    return value;
}

/** The columns' choices kept in `weavero.people.columns`, what is valid of
 *  them: per column a width, an ordinal, a sort direction (1 / -1), and
 *  `shown` once the user showed or hid it (the Name column always shows). */
export function wvPpColsParse(json: any): Record<string, any> {
    let o: any = null;
    try { o = typeof json === "string" ? JSON.parse(json || "{}") : json; } catch (e) { o = null; }
    const out: Record<string, any> = {};
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const k of WV_PP_TABLE_COLS) {
        const s = o[k];
        if (!s || typeof s !== "object") continue;
        const e: any = {};
        if (typeof s.width === "number" && isFinite(s.width) && s.width > 0) e.width = s.width;
        if (typeof s.ordinal === "number" && isFinite(s.ordinal)) e.ordinal = s.ordinal;
        if (s.sortDirection === 1 || s.sortDirection === -1) e.sortDirection = s.sortDirection;
        if (typeof s.shown === "boolean" && k !== "name") e.shown = s.shown;
        if (Object.keys(e).length) out[k] = e;
    }
    return out;
}
const colsStored = (): Record<string, any> => { try { return wvPpColsParse(String(Zotero.Prefs.get(PREF_COLS) || "{}")); } catch (e) { return {}; } };
const colsSave = (o: Record<string, any>) => { try { Zotero.Prefs.set(PREF_COLS, JSON.stringify(o)); } catch (e) {} };

/** The table's columns for VirtualizedTable (itemTreeColumns.js's shape):
 *  Papers starts with the most (`sortReverse`); widths persist through
 *  `zoteroPersist`. A new array each time: the table builds its columns again
 *  when it gets another one. `yearW`: a four-digit year's measured width, the
 *  PhD year's floor for a drag (VirtualizedTable adds the cell's padding). */
function colDefs(yearW = 0): any[] {
    return WV_PP_TABLE_COLS.map((k) => ({
        dataKey: k,
        label: k === "tags" ? wvStr("weavero-people-tags", null, null) : wvStr("weavero-people-table-col", { col: k }, null),
        flex: COL_FLEX[k] || 1,
        primary: k === "name" ? true : undefined,
        sortReverse: k === "papers" ? true : undefined,
        minWidth: k === "name" ? 120 : k === "phd" ? Math.max(40, yearW + 1) : 40,
        zoteroPersist: ["width"],
    }));
}

/** A small chevron (the Browse groups' twisty). */
function chevron(doc: any, parent: any): any {
    const s = wvHtmlEl(doc, "span", "wv-pp-twisty", undefined, parent);
    s.setAttribute("aria-hidden", "true");
    const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 8 8", width: 8, height: 8 }, s);
    wvSvgEl(doc, "path", { d: CHEVRON_PATH }, svg);
    return s;
}

/** "Add a researcher", drawn as Zotero's add-collection.svg (chrome/skin/default/
 *  zotero/20/universal): a person (people.ts's figure from group.svg, at 1.25 as
 *  Zotero's 20-px icons draw their lines) cut round by the circled plus at the
 *  bottom right. `context-fill`, as Zotero's toolbar icons. */
const ADD_PERSON_PATH = "M7 6.5C7 7.88071 5.88071 9 4.5 9C3.11929 9 2 7.88071 2 6.5C2 5.11929 3.11929 4 4.5 4C5.88071 4 7 5.11929 7 6.5ZM6 6.5C6 7.32843 5.32843 8 4.5 8C3.67157 8 3 7.32843 3 6.5C3 5.67157 3.67157 5 4.5 5C5.32843 5 6 5.67157 6 6.5ZM9 14.5C9 13.3065 8.52589 12.1619 7.68198 11.318C6.83807 10.4741 5.69347 10 4.5 10C3.30653 10 2.16193 10.4741 1.31802 11.318C0.474106 12.1619 0 13.3065 0 14.5V16H9V14.5ZM8 14.5C8 13.5717 7.63125 12.6815 6.97487 12.0251C6.3185 11.3687 5.42826 11 4.5 11C3.57174 11 2.6815 11.3687 2.02513 12.0251C1.36875 12.6815 1 13.5717 1 14.5V15H8V14.5Z";
const ADD_PLUS_PATH = "M15.375 20A4.625 4.625 0 1 1 15.375 10.75A4.625 4.625 0 1 1 15.375 20ZM15.375 18.75A3.375 3.375 0 1 0 15.375 12A3.375 3.375 0 1 0 15.375 18.75ZM14.75 13V14.75H13V16H14.75V17.75H16V16H17.75V14.75H16V13Z";
/** A row's actions at its end (_wvPeopleTableRow: follow ★, edit ✎, more ⋮) and the room the header
 *  and every row keep free for them (MJT 2026-11-27, "Reserve ~88 px": a followed researcher's ★
 *  covered the PhD year whenever the last column was about 66-118 px wide, "20★3"). The room is these
 *  rules' own sum, not a guess: three 24-px buttons, two 2-px gaps, the box's 6-px start padding (its
 *  row-coloured edge, which hides what is under it too) and its 6-px inset from the row's end
 *  = 3 x 24 + 2 x 2 + 6 + 6 = 88 px. A fourth action needs RACTS_N + 1. */
const RACT_W = 24, RACT_GAP = 2, RACTS_PAD = 6, RACTS_END = 6, RACTS_N = 3;
const RACTS_ROOM = RACTS_N * RACT_W + (RACTS_N - 1) * RACT_GAP + RACTS_PAD + RACTS_END;

// Parentheses escaped too: an unquoted CSS url(...) ends at the first ")".
const ADD_ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">'
    + '<mask id="m"><rect width="20" height="20" fill="white"/><circle cx="15.375" cy="15.375" r="4.625" fill="black"/></mask>'
    + '<g mask="url(#m)"><path transform="translate(2 -2) scale(1.25)" fill-rule="evenodd" clip-rule="evenodd" fill="context-fill" d="' + ADD_PERSON_PATH + '"/></g>'
    + '<path fill-rule="evenodd" clip-rule="evenodd" fill="context-fill" d="' + ADD_PLUS_PATH + '"/></svg>')
    .replace(/\(/g, "%28").replace(/\)/g, "%29");

export const WV_PP_TABLE_CSS = `
/* The two toolbars, as the library's (libraryView.js; scss/components/_toolbar.scss): Zotero's classes "toolbar",
   "zotero-collections-toolbar" and "zotero-items-toolbar" give Zotero 11 its own look; Zotero 10 styles those by id
   only, so the same values again here (41-px row, 8-px sides, 28-px buttons). Not "zotero-toolbar": on macOS it
   makes a window-drag area of the tab's content. */
.wv-pp-tb { flex: none; box-sizing: border-box; height: 41px; min-height: 41px; margin: 0; padding: 0 8px; min-width: 1px; display: flex; align-items: center; }
.wv-pp-tbrow { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; align-items: center; gap: 0; }
.wv-pp-tbrow > toolbarbutton { width: 28px; height: 28px; padding: 0 4px; margin: 0; }
.wv-pp-sidetb { background: var(--material-sidepane, transparent); }
.wv-pp-tabletb { background: var(--material-toolbar, transparent); border-bottom: var(--material-panedivider, 1px solid rgba(127,127,127,.3)); margin: -12px -18px 8px; }
.wv-pp-tabletb > .wv-pp-tbrow { margin-inline-start: -4px; }
.wv-pp-tb-add { list-style-image: url("${ADD_ICON}"); fill: currentColor; -moz-context-properties: fill, fill-opacity; }
.wv-pp-tbspace { flex: 1 1 auto; }
.wv-pp-tbrow > .wv-pp-tcount { margin: 0; padding-inline: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
/* Zotero's quick search's size (scss/elements/_quickSearchTextbox.scss). */
.wv-pp-tbrow > .wv-pp-search { flex: 0 1 auto; width: 146px; max-width: 300px; min-width: 60px; height: 28px; margin: 0; box-sizing: border-box; }
.wv-pp-nav { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 6px 12px; display: flex; flex-direction: column; gap: 1px; scrollbar-width: thin; }
.wv-pp-navitem { appearance: none; font: inherit; color: inherit; background: transparent; border: none; margin: 0; display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 14px; text-align: start; cursor: default; min-width: 0; }
.wv-pp-navitem:hover { background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-navitem:disabled { opacity: 0.5; }
.wv-pp-navitem[aria-current="true"] { background: color-mix(in srgb, var(--color-accent, #4072e5) 22%, transparent); font-weight: 600; }
.wv-pp-navlab { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-pp-navn { flex: none; font-variant-numeric: tabular-nums; color: var(--fill-secondary, GrayText); font-size: 0.92em; font-weight: normal; }
.wv-pp-navhead { margin: 12px 10px 2px; font-size: 0.85em; font-weight: 600; color: var(--fill-secondary, GrayText); }
.wv-pp-twisty { flex: none; display: inline-flex; width: 10px; justify-content: center; opacity: 0.7; transition: transform 0.125s ease; transform: rotate(-90deg); }
.wv-pp-twisty > svg { width: 8px; height: 8px; fill: currentColor; stroke: none; }
.wv-pp-browse[aria-expanded="true"] > .wv-pp-twisty { transform: rotate(0deg); }
.wv-pp-bvals { display: flex; flex-direction: column; gap: 1px; padding-inline-start: 16px; }
.wv-pp-bval[data-state="in"] { background: color-mix(in srgb, var(--color-accent, #4072e5) 22%, transparent); font-weight: 600; }
.wv-pp-bval[data-state="out"] .wv-pp-navlab { text-decoration: line-through; color: var(--fill-secondary, GrayText); }
.wv-pp-main[data-wv-pp-table] { display: flex; flex-direction: column; overflow: hidden; padding-bottom: 8px; }
.wv-pp-factive { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 6px; }
.wv-pp-fpill { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 8px; border-radius: 10px; font-size: 0.92em;
  background: color-mix(in srgb, var(--color-accent, #4072e5) 18%, transparent); }
.wv-pp-fpill[data-state="out"] { background: color-mix(in srgb, var(--accent-red, #d93425) 16%, transparent); }
.wv-pp-fpill-x { appearance: none; font: inherit; line-height: 1; border: none; background: transparent; color: inherit; padding: 1px 5px; margin: 0; border-radius: 8px; cursor: default; }
.wv-pp-fpill-x:hover { background: var(--fill-quinary, rgba(127,127,127,.2)); }
.wv-pp-selbar { display: flex; align-items: center; gap: 8px; min-height: 24px; margin-bottom: 6px; padding: 2px 8px; border-radius: 6px;
  background: color-mix(in srgb, var(--color-accent, #4072e5) 12%, transparent); }
.wv-pp-selbar > input { margin: 0; }
.wv-pp-selcount { font-weight: 600; margin-inline-end: 8px; }
.wv-pp-table { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.wv-pp-table > .virtualized-table { flex: 1 1 0; min-height: 0; }
.wv-pp-table .virtualized-table-body { min-height: 0; }
.wv-pp-table .row { position: relative; --wv-pp-rowbg: var(--material-background, Canvas); }
/* The items list's stripes (MJT 2026-11-26, "the same alternating background color as in the items list"):
   VirtualizedTable gives its rows odd / even; Zotero paints them in scss/components/_item-tree.scss with its
   theme's token. Before the hover and checked rules, which win at the same specificity; a selected row is
   left to VirtualizedTable's own colour. */
.wv-pp-table .row.odd:not(.selected) { background-color: var(--material-stripe); }
.wv-pp-table .row.even:not(.selected) { background-color: var(--material-background); }
.wv-pp-table .row:hover:not(.selected) { --wv-pp-rowbg: color-mix(in srgb, var(--fill-primary, CanvasText) 7%, var(--material-background, Canvas)); background: var(--wv-pp-rowbg); }
.wv-pp-table .row.wv-pp-checked:not(.selected) { --wv-pp-rowbg: color-mix(in srgb, var(--color-accent, #4072e5) 18%, var(--material-background, Canvas)); background: var(--wv-pp-rowbg); }
.wv-pp-table .row.selected { --wv-pp-rowbg: var(--color-accent, #4072e5); }
.wv-pp-table .virtualized-table:not(:focus-within) .row.selected { --wv-pp-rowbg: var(--color-quarternary-on-sidepane, rgba(127,127,127,.3)); }
.wv-pp-table .cell { font-variant-numeric: tabular-nums; text-align: start; }
.wv-pp-lead { position: relative; flex: none; width: 26px; height: 26px; margin-inline-end: 8px; display: inline-flex; align-items: center; justify-content: center; }
.wv-pp-lead > .wv-pp-rowcheck { display: none; margin: 0; }
.wv-pp-table .row:hover .wv-pp-lead > .wv-pp-avatar, .wv-pp-table .row.wv-pp-checked .wv-pp-lead > .wv-pp-avatar, .wv-pp-checking .wv-pp-lead > .wv-pp-avatar { display: none; }
.wv-pp-table .row:hover .wv-pp-lead > .wv-pp-rowcheck, .wv-pp-table .row.wv-pp-checked .wv-pp-lead > .wv-pp-rowcheck, .wv-pp-checking .wv-pp-lead > .wv-pp-rowcheck { display: inline-block; }
.wv-pp-racts { position: absolute; inset-inline-end: ${RACTS_END}px; top: 50%; transform: translateY(-50%); display: inline-flex; gap: ${RACT_GAP}px; padding-inline-start: ${RACTS_PAD}px;
  background: var(--wv-pp-rowbg); visibility: hidden; }
.wv-pp-table .row:hover .wv-pp-racts { visibility: visible; }
/* No padding of our own on a body cell: VirtualizedTable sizes the header's and the rows' cells with the
   same flex bases, and a cell's padding must be the header's (Zotero's own note, scss/components/
   _virtualized-table.scss, #5198). When the columns overflow, flex-shrink weighs each cell by its content
   box, so a body cell padded more than its header shrank less and the columns slid off their titles
   (2026-11-27: 30 px at the last body cell put the PhD year 15.8 px left of its title,
   test/people-contacts.spec.js 7; it was there for the followed ★, which it did not clear: the ★ sits
   58-82 px from the row's end, the year at its column's start). */
/* The actions' room (MJT 2026-11-27, "Reserve ~88 px"; RACTS_ROOM above): the same empty box after the
   cells of the header and of every row, so the columns share what is left and none reaches under the
   actions, whatever the widths. A box of the header's and of the row's own, not their padding: the
   header's end padding is Zotero's (in Zotero 11, 8 px + the body's scrollbar width, a variable its
   script sets). It never shrinks (flex 0 0), so the cells absorb any shrink alike in the header and the
   rows and the columns stay under their titles (test/people-contacts.spec.js 8). A pseudo-element is no
   child: VirtualizedTable's resize, which reads the header's cells by index, does not see it. The
   header's ::after is Zotero's (its bottom line), hence ::before, moved last with order. */
.wv-pp-table .virtualized-table-header::before, .wv-pp-table .row::after { content: ""; order: 1; flex: 0 0 ${RACTS_ROOM}px; }
/* The PhD year's floor (MJT 2026-11-27, 21:50, a 1900-px window: the column, stored at 40 px by a resize, came
   out 33 px wide and every year read "1..."). The room above is shared by the columns in proportion to their
   widths (flex-shrink weighs each by its base, header and rows alike), so a column the user had made narrow
   kept its share and fell under what a year needs. Its header and row cells both take this floor, so they stay
   aligned; a width the user gave above it is theirs. --wv-pp-year-min is measured (_wvPeopleYearMin): a
   four-digit year in the table's font plus the cell's padding; VirtualizedTable's 30 px until then. */
.wv-pp-table .cell.phd { min-width: var(--wv-pp-year-min, 30px); }
.wv-pp-table > .wv-pp-yearprobe { position: absolute; top: 0; inset-inline-start: 0; width: auto; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; }
.wv-pp-ract { appearance: none; font: inherit; font-size: 1.05em; line-height: 1; width: ${RACT_W}px; height: 22px; padding: 0; margin: 0; border: none; border-radius: 5px;
  background: transparent; color: inherit; cursor: default; display: inline-flex; align-items: center; justify-content: center; }
.wv-pp-ract:hover { background: var(--fill-quinary, rgba(127,127,127,.2)); }
.wv-pp-ract.wv-pp-star[aria-pressed="true"] { visibility: visible; color: var(--accent-yellow, #faa700); }
.wv-pp-table .row.selected .wv-pp-ract.wv-pp-star[aria-pressed="true"] { color: inherit; }
`;

class _PeopleTableMixin {
    [k: string]: any;

    // ---- the left pane ---------------------------------------------------------------

    /** Which entry of the left pane the centre shows: a view, a screen, or a
     *  view over every researcher. */
    _wvPeopleNavKey(v: any): string {
        if (!v) return "all";
        if (v.view === "queue" || v.view === "dupes") return v.view;
        if (v.fix === "conflict" || v.fix === "noOrcid") return v.fix;
        return v.filter || "all";
    }

    /** The left pane (MJT 2026-11-25, "Views + Manage + Browse"). */
    _wvPeopleRenderNav(win: any, side: any, v: any) {
        const doc = win.document;
        const P: any = this;
        const all: WvPpRecord[] = this._wvPeopleAllSync();
        const infos: Map<string, any> = this._wvPeopleInfos();
        // The left pane's toolbar, as the library's above its collections
        // (libraryView.js: a toolbar row, then "New Collection" as an icon
        // button; MJT 2026-11-26): "Add a researcher" -- a name, then OpenAlex's
        // profiles of that name to pick from, the network only on this click.
        const tb = wvHtmlEl(doc, "div", "toolbar wv-pp-tb wv-pp-sidetb", undefined, side);
        const row = wvHtmlEl(doc, "div", "zotero-collections-toolbar wv-pp-tbrow", undefined, tb);
        const addR = doc.createXULElement("toolbarbutton");
        addR.className = "zotero-tb-button wv-pp-tb-add";
        addR.setAttribute("tabindex", "-1");
        addR.setAttribute("data-wv-pp-act", "add-researcher");
        const addTip = wvStr("weavero-people-add-researcher", null, null);
        addR.setAttribute("tooltiptext", addTip);
        addR.setAttribute("aria-label", addTip);
        addR.addEventListener("command", () => { const lp: any = live(); if (lp) lp._wvPeopleAddByName(win).catch((e: any) => Zotero.debug("[Weavero] people add err: " + e)); });
        row.appendChild(addR);
        const nav = wvHtmlEl(doc, "div", "wv-pp-nav", undefined, side);
        nav.setAttribute("role", "navigation");
        const cur = this._wvPeopleNavKey(v);
        const item = (parent: any, key: string, label: string, count: number | null, tip: string | null, go: (e: any) => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-navitem", undefined, parent);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-nav", key);
            if (key === cur) b.setAttribute("aria-current", "true");
            wvHtmlEl(doc, "span", "wv-pp-navlab", label, b);
            if (count != null) {
                wvHtmlEl(doc, "span", "wv-pp-navn", String(count), b);
                b.setAttribute("data-count", String(count));
            }
            if (tip) b.setAttribute("title", tip);
            b.addEventListener("click", (e: any) => { try { go(e); } catch (er) { Zotero.debug("[Weavero] people nav err: " + er); } });
            return b;
        };
        const show = (key: string, set: (vv: any) => void) => (e: any) => {
            const lp: any = live(); const vv = lp && lp._wvPeopleViewOf(win);
            if (!lp || !vv) return;
            vv.sel = null; vv.editing = null; vv.nameEdit = null; vv.evEdit = null;
            if (vv.checked) vv.checked.clear();
            set(vv);
            lp._wvPeopleTabRender(win);
            lp._wvPeopleTabsPersistSoon();
        };
        // The views.
        const views = wvHtmlEl(doc, "div", "wv-pp-navgrp", undefined, nav);
        views.setAttribute("data-wv-pp-navgrp", "views");
        const counts: Record<string, number> = { all: all.length, followed: all.filter((r) => r.followed).length, check: all.filter((r) => r.check).length };
        for (const k of NAV_VIEWS) {
            item(views, k, wvStr("weavero-people-nav", { view: k }, null), counts[k], null, show(k, (vv) => {
                vv.view = "table"; vv.fix = null;
                vv.filter = k;
                try { Zotero.Prefs.set("weavero.people.show", k); } catch (er) {}
            }));
        }
        // Fix and manage.
        wvHtmlEl(doc, "div", "wv-pp-navhead", wvStr("weavero-people-nav-head", { group: "manage" }, null), nav);
        const manage = wvHtmlEl(doc, "div", "wv-pp-navgrp", undefined, nav);
        manage.setAttribute("data-wv-pp-navgrp", "manage");
        // "Suggested links": every link a source suggested, for all researchers
        // (the Nodus study's idea 1, MJT 2026-11-26).
        const q = item(manage, "queue", wvStr("weavero-people-nav", { view: "queue" }, null), wvPpLinkQueue(all).length, wvStr("weavero-people-queue-tip", null, null),
            show("queue", (vv) => { vv.view = "queue"; vv.fix = null; }));
        q.setAttribute("data-wv-pp-act", "queue");
        // The possible duplicates (the Nodus study's idea 3): their screen.
        const d = item(manage, "dupes", wvStr("weavero-people-nav", { view: "dupes" }, null), wvPpDuplicates(all).length, null,
            show("dupes", (vv) => { vv.view = "dupes"; vv.fix = null; }));
        d.setAttribute("data-wv-pp-act", "dupes");
        // Sources disagree, Without ORCID: views over every researcher (the
        // list's own filters "conflict" and "noOrcid").
        for (const k of NAV_FIX) {
            const n = all.filter((r) => { const i = infos.get(r.id); return !!i && (k === "conflict" ? i.conflict : !i.orcid); }).length;
            item(manage, k, wvStr("weavero-people-nav", { view: k }, null), n, wvStr("weavero-people-filter-tip", { filter: k }, null), show(k, (vv) => { vv.view = "table"; vv.fix = k; }));
        }
        const st = P._wvPpBuild;
        const running = !!(st && st.running);
        const b = item(manage, "build", wvStr("weavero-people-build", null, null), null, wvStr("weavero-people-build-tip", null, null),
            () => { const lp: any = live(); if (lp) lp._wvPeopleBuildFromTab(win, false); });
        b.setAttribute("data-wv-pp-act", "build");
        b.disabled = running;
        const bf = item(manage, "import", wvStr("weavero-people-nav", { view: "import" }, null), null, wvStr("weavero-people-build-file-tip", null, null),
            () => { const lp: any = live(); if (lp) lp._wvPeopleBuildFromTab(win, true); });
        bf.setAttribute("data-wv-pp-act", "build-file");
        bf.disabled = running;
        const bline = wvHtmlEl(doc, "div", "wv-pp-build", undefined, manage);
        if (running) {
            const s = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-build-stop", null, null), bline);
            s.setAttribute("type", "button");
            s.setAttribute("data-wv-pp-act", "build-stop");
            s.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleBuildStop(); });
        }
        const bs = wvHtmlEl(doc, "div", "wv-pp-buildst", undefined, bline);
        bs.setAttribute("data-wv-pp-build", running ? "running" : (st ? "done" : "none"));
        if (running) bs.textContent = wvStr("weavero-people-build-progress", { done: st.done, total: st.total }, null);
        else if (P._wvPpBuildMsg) bs.textContent = P._wvPpBuildMsg;
        else bs.hidden = true;
        // Browse by: each group opens to its values, counted over every researcher.
        wvHtmlEl(doc, "div", "wv-pp-navhead", wvStr("weavero-people-nav-head", { group: "browse" }, null), nav);
        const browse = wvHtmlEl(doc, "div", "wv-pp-navgrp", undefined, nav);
        browse.setAttribute("data-wv-pp-navgrp", "browse");
        const open: string[] = Array.isArray(v && v.browseOpen) ? v.browseOpen : [];
        const ff: WvPpFilters = (v && v.ff) || {};
        for (const k of BROWSE) {
            const g = wvHtmlEl(doc, "button", "wv-pp-navitem wv-pp-browse", undefined, browse);
            g.setAttribute("type", "button");
            g.setAttribute("data-wv-pp-browse", k);
            g.setAttribute("aria-expanded", open.includes(k) ? "true" : "false");
            chevron(doc, g);
            wvHtmlEl(doc, "span", "wv-pp-navlab", wvStr("weavero-people-filter", { filter: k }, null), g);
            g.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleBrowseToggle(win, k); });
            if (!open.includes(k)) continue;
            const vals = wvHtmlEl(doc, "div", "wv-pp-bvals", undefined, browse);
            vals.setAttribute("data-wv-pp-bvals", k);
            const list = wvPpMenuValues(all, infos, k as any, uiLocale());
            // A value chosen before that no researcher has now stays offered (0).
            const not: any = (ff as any).not || {};
            for (const c of [...(((ff as any)[k] || []) as string[]), ...((not[k] || []) as string[])]) {
                if (list.some((x) => (x.value === "" ? c === "" : c !== "" && wvPpFilterValueState({ [k]: [x.value] } as any, k as any, c) === "in"))) continue;
                list.splice(c === "" ? list.length : 0, 0, { value: c, label: "", count: 0 });
            }
            for (const x of list) {
                const label = x.value === "" || k === "country" ? wvPpFilterValueLabel(k, x.value) : (x.label || x.value);
                const state = wvPpFilterValueState(ff, k as any, x.value);
                const bv = wvHtmlEl(doc, "button", "wv-pp-navitem wv-pp-bval", undefined, vals);
                bv.setAttribute("type", "button");
                bv.setAttribute("data-wv-pp-fkey", k);
                bv.setAttribute("data-wv-pp-fval", x.value);
                if (state) bv.setAttribute("data-state", state);
                bv.setAttribute("aria-pressed", state === "in" ? "true" : state === "out" ? "mixed" : "false");
                wvHtmlEl(doc, "span", "wv-pp-navlab", label, bv);
                wvHtmlEl(doc, "span", "wv-pp-navn", String(x.count), bv);
                bv.setAttribute("title", wvStr("weavero-people-filter-value-tip", { value: label, count: x.count }, null));
                const value = x.value;
                bv.addEventListener("click", (e: any) => { const lp: any = live(); if (lp) lp._wvPeopleBrowseClick(win, k, value, !!(e && e.altKey)); });
            }
        }
        // The tag selector, at the bottom, as under the library's collections (people-tags.ts).
        if (v) P._wvPeopleRenderTagSel(win, side, v);
    }

    /** A Browse group opened or closed. */
    _wvPeopleBrowseToggle(win: any, key: string) {
        const v = this._wvPeopleViewOf(win);
        if (!v) return;
        const open: string[] = Array.isArray(v.browseOpen) ? v.browseOpen.slice() : [];
        const i = open.indexOf(key);
        if (i >= 0) open.splice(i, 1); else open.push(key);
        v.browseOpen = open;
        this._wvPeopleTabRender(win);
    }

    /** A Browse value clicked: the table, filtered to it (Alt: without it);
     *  clicked again, the filter goes. Saved, as every filter of the list. */
    _wvPeopleBrowseClick(win: any, key: string, value: string, alt: boolean) {
        const v = this._wvPeopleViewOf(win);
        if (v) {
            v.sel = null; v.editing = null; v.nameEdit = null; v.evEdit = null;
            if (v.view !== "table") v.view = "table";
        }
        this._wvPeopleFilterClick(win, key, value, alt);
    }

    // ---- the centre: search, filters on, the bar of the checked rows, the table ---------

    /** The rows the table shows for `win`'s view: its view, the search, the
     *  filters; in the columns' sort, the followed first. */
    _wvPeopleTableRows(win: any): WvPpRecord[] {
        const v = this._wvPeopleViewOf(win);
        if (!v) return [];
        const all: WvPpRecord[] = this._wvPeopleAllSync();
        const infos = this._wvPeopleInfos();
        const lib = this._wvPeopleLibStats();
        const fix = v.fix === "conflict" || v.fix === "noOrcid" ? v.fix : null;
        const ff = fix ? wvPpFiltersParse(Object.assign({}, v.ff || {}, { [fix]: true })) : (v.ff || {});
        const s = this._wvPeopleColSortOf();
        const locale = uiLocale();
        const cname = (code: string) => { try { return wvPpCountryName(code, locale) || code; } catch (e) { return code; } };
        // The tag selector's tags too, all of them (people-tags.ts).
        const listed = wvPpTagFilter(wvPpListFilter(all, infos, { show: fix ? "all" : v.filter, q: v.q, filters: ff }, lib), v.tagSel || []);
        return wvPpTableSort(listed, infos, s.col, s.dir, lib, cname);
    }

    /** Spec hooks: the table's records and names, in its order, as the view
     *  would draw them now (also while a page is open). */
    _wvPeopleTableIds(win: any): string[] { return this._wvPeopleTableRows(win).map((r: WvPpRecord) => r.id); }
    _wvPeopleTableNames(win: any): string[] {
        const order = this._wvPeopleNameOrder("list");
        return this._wvPeopleTableRows(win).map((r: WvPpRecord) => wvPpNameAs(r, order) || r.last);
    }
    _wvPeopleTableOf(win: any): any { const st = tables.get(win); return st ? st.tree : null; }

    /** The centre pane with no researcher open: the search, the filters on, the
     *  count (or the bar of the checked rows), the table. */
    _wvPeopleRenderTable(win: any, main: any, v: any) {
        const doc = win.document;
        const all: WvPpRecord[] = this._wvPeopleAllSync();
        main.setAttribute("data-wv-pp-table", "true");
        // The table's toolbar, as the library's above its items (libraryView.js:
        // a toolbar row, Zotero's quick search at its right end; MJT 2026-11-26):
        // how many at the left, the search at the right -- Zotero's generic
        // search-textbox (not quick-search-textbox: no item search modes here).
        const tb = wvHtmlEl(doc, "div", "toolbar wv-pp-tb wv-pp-tabletb", undefined, main);
        const row = wvHtmlEl(doc, "div", "zotero-items-toolbar wv-pp-tbrow", undefined, tb);
        const count = wvHtmlEl(doc, "span", "wv-pp-tcount", undefined, row);
        wvHtmlEl(doc, "div", "wv-pp-tbspace", undefined, row);
        const q = doc.createXULElement("search-textbox");
        q.className = "wv-pp-search";
        q.setAttribute("data-wv-pp-focus", "search");
        q.setAttribute("placeholder", wvStr("weavero-people-search", null, "placeholder"));
        q.setAttribute("aria-label", wvStr("weavero-people-search", null, "placeholder"));
        if (v.q) q.setAttribute("value", v.q);
        row.appendChild(q);
        try { if (v.q && q.value !== v.q) q.value = v.q; } catch (e) {}
        // Typing filters at once; Escape and the clear icon only send a command.
        // The field is drawn again at each keystroke: the command its own timer
        // sends half a second later comes from a field no longer in the tab, with
        // the text of then -- dropped, or it would put that text back.
        const onSearch = () => { if (!q.isConnected) return; const lp: any = live(); const vv = lp && lp._wvPeopleViewOf(win); if (!lp || !vv) return; const val = String(q.value || ""); if (val === (vv.q || "")) return; vv.q = val; lp._wvPeopleTabRender(win); };
        q.addEventListener("input", onSearch);
        q.addEventListener("command", onSearch);
        if (!all.length) { this._wvPeopleTableDetach(win); wvHtmlEl(doc, "div", "wv-pp-hint", wvStr("weavero-people-list-empty", null, null), main); return; }
        this._wvPeopleRenderActive(win, main, v);
        const rows = this._wvPeopleTableRows(win);
        count.textContent = wvStr("weavero-people-table-count", { count: rows.length }, null);
        // The checked rows: the ones still shown.
        if (!v.checked) v.checked = new Set<string>();
        const ids = new Set(rows.map((r) => r.id));
        for (const id of Array.from(v.checked as Set<string>)) if (!ids.has(id)) v.checked.delete(id);
        if (v.checked.size) this._wvPeopleRenderSelBar(win, main, v, rows);
        if (!rows.length) { this._wvPeopleTableDetach(win); wvHtmlEl(doc, "div", "wv-pp-hint", wvStr("weavero-people-list-none", null, null), main); return; }
        let st = tables.get(win);
        const tag = this._wvWireTag();
        if (st && st.tag !== tag) { wvPpTableDrop(win); st = undefined; }
        const fresh = !st;
        if (!st) {
            const host = wvHtmlEl(doc, "div", "wv-pp-table");
            st = { host, root: null, tree: null, React: null, VT: null, rows: [], infos: new Map(), lib: null, cname: (c: string) => c, hidden: "", tag, yearW: 0 };
            tables.set(win, st);
        }
        const locale = uiLocale();
        st.rows = rows;
        st.infos = this._wvPeopleInfos();
        st.lib = this._wvPeopleLibStats();
        st.cname = (code: string) => { try { return wvPpCountryName(code, locale) || code; } catch (e) { return code; } };
        // Our box goes back into the new centre: its scroll is the list's own
        // (WindowedList keeps it), given back to the box a re-insertion reset.
        main.appendChild(st.host);
        st.host.classList.toggle("wv-pp-checking", v.checked.size > 0);
        // The PhD year's floor, measured again at each drawing (in the font of now).
        st.yearW = this._wvPeopleYearMin(win, st) || st.yearW;
        const hidden = this._wvPeopleColHiddenKey();
        if (fresh) { st.hidden = hidden; this._wvPeopleTableMount(win, st, main); return; }
        try {
            const tree = st.tree;
            if (!tree) return;
            const body = st.host.querySelector(".virtualized-table-body");
            if (body && tree._jsWindow) body.scrollTop = tree._jsWindow.scrollOffset || 0;
            // The selection follows its researcher when the rows change (a search,
            // a filter, a sort): the table's selection is by index.
            const sel = tree.selection;
            if (sel) {
                const at = v.paneSel ? rows.findIndex((r) => r.id === v.paneSel) : -1;
                if (at < 0 && (v.paneSel || sel.count)) {
                    v.paneSel = null;
                    sel.selectEventsSuppressed = true;
                    sel.clearSelection();
                    sel.selectEventsSuppressed = false;
                }
                else if (at >= 0 && !(sel.count === 1 && sel.isSelected(at))) {
                    sel.selectEventsSuppressed = true;
                    sel.select(at);
                    sel.focused = at;
                    sel.selectEventsSuppressed = false;
                }
            }
            // A column emptied or filled by the records: the columns again.
            if (hidden !== st.hidden) { st.hidden = hidden; tree._resetColumns(); }
            else tree.invalidate();
        }
        catch (e) { Zotero.debug("[Weavero] people table redraw err: " + e); }
    }

    /** The PhD year column's floor, measured (MJT 2026-11-27: every year read
     *  "1..." in a 33-px column): a probe cell styled as the table's own --
     *  inside a `.virtualized-table`, so it gets VirtualizedTable's cell padding,
     *  and inside our box, so it gets the table's font and tabular figures (every
     *  year as wide as "0000") -- gives the year's width and the padding. The
     *  floor, + 1 px for the rounding of scrollWidth and clientWidth, goes to
     *  --wv-pp-year-min on our box, which the header's and the rows' PhD cells
     *  take as min-width (WV_PP_TABLE_CSS). Returns the year's own width
     *  (VirtualizedTable's minWidth for a drag adds the padding itself), 0 when
     *  it cannot be measured (the box not in a document yet). */
    _wvPeopleYearMin(win: any, st: TableState): number {
        const doc = win.document;
        let probe: any = null;
        try {
            probe = wvHtmlEl(doc, "div", "virtualized-table wv-pp-yearprobe", undefined, st.host);
            probe.setAttribute("aria-hidden", "true");
            // Not the probe's first child: Zotero takes a first cell's start padding off.
            wvHtmlEl(doc, "span", undefined, undefined, probe);
            const cell = wvHtmlEl(doc, "span", "cell", "0000", probe);
            const rg = doc.createRange();
            rg.selectNodeContents(cell);
            const text = rg.getBoundingClientRect().width;
            if (!(text > 0)) return 0;
            const cs = win.getComputedStyle(cell);
            const pad = (parseFloat(cs.paddingInlineStart) || 0) + (parseFloat(cs.paddingInlineEnd) || 0);
            st.host.style.setProperty("--wv-pp-year-min", (Math.ceil(text + pad) + 1) + "px");
            return Math.ceil(text);
        }
        catch (e) { return 0; }
        finally { try { if (probe) probe.remove(); } catch (e) {} }
    }

    /** The table's box out of the centre (a page, a screen of its own): kept
     *  for the way back. */
    _wvPeopleTableDetach(win: any) {
        const st = tables.get(win);
        try { if (st && st.host && st.host.parentNode) st.host.remove(); } catch (e) {}
    }

    /** Zotero's VirtualizedTable mounted on our box. */
    _wvPeopleTableMount(win: any, st: TableState, main: any) {
        try {
            const w: any = win;
            const React = w.require("react");
            const ReactDOM = w.require("react-dom");
            const m = w.require("components/virtualized-table");
            const VT = m && (m.default || m);
            if (!React || !ReactDOM || typeof ReactDOM.createRoot !== "function" || typeof VT !== "function") throw new Error("Zotero's VirtualizedTable is not available");
            st.React = React; st.VT = VT;
            const root = ReactDOM.createRoot(st.host);
            st.root = root;
            let width = 0;
            try { width = main.getBoundingClientRect().width; } catch (e) {}
            const props: any = {
                id: WV_PP_TABLE_ID,
                label: wvStr("weavero-people-tab-title", null, null),
                showHeader: true,
                multiSelect: false,
                columns: colDefs(st.yearW),
                containerWidth: width > 100 ? width : undefined,
                disableFontSizeScaling: true,
                linesPerRow: 1.6,
                // The avatar's 26 px with Zotero's row padding.
                getRowHeight: (vt: any) => Math.max(30, Math.round((Number(vt && vt._renderedTextHeight) || 16) + 14)),
                getRowCount: () => { const s = tables.get(win); return s ? s.rows.length : 0; },
                renderItem: (index: number, selection: any, oldDiv: any, columns: any[]) => {
                    const lp: any = live();
                    return lp ? lp._wvPeopleTableRow(win, index, selection, oldDiv, columns) : (oldDiv || win.document.createElement("div"));
                },
                getRowString: (index: number) => { const s = tables.get(win); const r = s && s.rows[index]; return r ? String(r.last || "") : ""; },
                getColumnPrefs: () => { const lp: any = live(); return lp ? lp._wvPeopleColPrefs() : {}; },
                storeColumnPrefs: (prefs: any) => { const lp: any = live(); if (lp) lp._wvPeopleColStore(prefs); },
                onColumnSort: (index: number, dir: number) => { const lp: any = live(); if (lp) lp._wvPeopleColSort(win, index, dir); },
                onColumnPickerMenu: (e: any) => { const lp: any = live(); if (lp) lp._wvPeopleColMenu(win, e); },
                onActivate: (e: any, indices: number[]) => {
                    const lp: any = live(); const s = tables.get(win);
                    const r = s && indices && indices.length ? s.rows[indices[0]] : null;
                    if (lp && r) lp._wvPeopleTableOpen(win, r.id, false);
                },
                onItemContextMenu: (e: any, x: number, y: number, index: number) => {
                    const lp: any = live(); const s = tables.get(win);
                    const i = typeof index === "number" ? index : (s && s.tree ? s.tree.selection.focused : -1);
                    const r = s && i >= 0 ? s.rows[i] : null;
                    if (lp && r) lp._wvPeopleRowMenu(win, r.id, null, x, y);
                },
                onKeyDown: (e: any) => { const lp: any = live(); return lp ? lp._wvPeopleTableKey(win, e) : true; },
                // One click or the arrow keys: the right pane shows the row (people-pane.ts).
                onSelectionChange: (selection: any) => { const lp: any = live(); if (lp) lp._wvPeoplePaneSel(win, selection); },
                ref: (ref: any) => { const s = tables.get(win); if (s && s.root === root) s.tree = ref; },
            };
            root.render(React.createElement(VT, props));
        }
        catch (e) { Zotero.debug("[Weavero] people table mount err: " + e); }
    }

    /** One row (VirtualizedTable's renderItem): the cells of the columns shown,
     *  the name's avatar and checkbox, the actions at the right end. A row's
     *  element comes back for the same index only (WindowedList.rerenderItem):
     *  its listeners, wired once, read the record from the element. */
    _wvPeopleTableRow(win: any, index: number, selection: any, oldDiv: any, columns: any[]): any {
        const doc = win.document;
        const st = tables.get(win);
        const v = this._wvPeopleViewOf(win);
        let div = oldDiv;
        if (div) div.textContent = "";
        else {
            div = wvHtmlEl(doc, "div", "row");
            this._wvPeopleTableRowWire(win, div);
        }
        const rec: WvPpRecord | undefined = st ? st.rows[index] : undefined;
        if (!rec || !st) { div.removeAttribute("data-wv-pp-person"); return div; }
        div.setAttribute("data-wv-pp-person", rec.id);
        const checked = !!(v && v.checked && v.checked.has(rec.id));
        div.classList.toggle("selected", !!(selection && selection.isSelected(index)));
        div.classList.toggle("focused", !!(selection && selection.focused === index));
        div.classList.toggle("wv-pp-checked", checked);
        if (checked) div.setAttribute("data-wv-pp-checked", "true"); else div.removeAttribute("data-wv-pp-checked");
        const info = st.infos.get(rec.id);
        const stat = st.lib && st.lib.get(rec.id);
        const name = wvPpNameAs(rec, this._wvPeopleNameOrder("list")) || rec.last;
        for (const col of columns || []) {
            if (!col || col.hidden) continue;
            const cell = wvHtmlEl(doc, "span", "cell " + (col.className || col.dataKey), undefined, div);
            cell.setAttribute("data-wv-pp-col", col.dataKey);
            switch (col.dataKey) {
                case "name": {
                    cell.classList.add("primary", "wv-pp-tname");
                    const lead = wvHtmlEl(doc, "span", "wv-pp-lead", undefined, cell);
                    const av = wvHtmlEl(doc, "span", "wv-pp-avatar", wvPpInitials(rec.last, rec.first), lead);
                    av.setAttribute("aria-hidden", "true");
                    av.style.setProperty("--wv-pp-hue", String(this._wvPeopleHue(rec.last + " " + rec.first)));
                    const cb = wvHtmlEl(doc, "input", "wv-pp-rowcheck", undefined, lead);
                    cb.setAttribute("type", "checkbox");
                    cb.setAttribute("tabindex", "-1");
                    cb.setAttribute("aria-label", wvStr("weavero-people-sel-row", { name }, null));
                    cb.checked = checked;
                    const rid = rec.id;
                    cb.addEventListener("click", (e: any) => {
                        try { e.stopPropagation(); } catch (er) {}
                        const lp: any = live(); if (lp) lp._wvPeopleCheck(win, rid, e && e.shiftKey ? "range" : "toggle");
                    });
                    wvHtmlEl(doc, "span", "cell-text wv-pp-tnametext", name, cell);
                    // Its coloured tags' dots, as the items list's swatches (people-tags.ts).
                    this._wvPeopleTagDots(doc, cell, rec);
                    break;
                }
                case "tags": cell.textContent = wvPpTagsOf(rec).join(", "); break;
                case "institution": cell.textContent = (info && info.institution) || ""; break;
                case "country": cell.textContent = info && info.country ? st.cname(info.country) : ""; break;
                case "papers": cell.classList.add("wv-pp-tnum"); cell.textContent = stat && stat.n ? String(stat.n) : ""; break;
                // A year as text (a number would be grouped: "2,013").
                case "phd": cell.classList.add("wv-pp-tnum"); cell.textContent = info && info.phdYear ? String(info.phdYear) : ""; break;
            }
        }
        // The actions at the right end, under the mouse (the star stays while followed).
        const acts = wvHtmlEl(doc, "span", "wv-pp-racts", undefined, div);
        const rid = rec.id;
        const act = (key: string, text: string, tip: string, fn: (b: any) => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-ract", text, acts);
            b.setAttribute("type", "button");
            b.setAttribute("tabindex", "-1");
            b.setAttribute("data-wv-pp-ract", key);
            b.setAttribute("title", tip);
            b.setAttribute("aria-label", tip);
            b.addEventListener("click", (e: any) => { try { e.stopPropagation(); } catch (er) {} try { fn(b); } catch (er) { Zotero.debug("[Weavero] people row act err: " + er); } });
            return b;
        };
        const star = act("follow", rec.followed ? "★" : "☆", wvStr("weavero-people-row-act", { act: rec.followed ? "unfollow" : "follow" }, null),
            () => { const lp: any = live(); if (lp) lp._wvPeopleSetFlag(rid, "followed", !rec.followed).catch((e: any) => Zotero.debug("[Weavero] people follow err: " + e)); });
        star.classList.add("wv-pp-star");
        star.setAttribute("aria-pressed", rec.followed ? "true" : "false");
        act("edit", "✎", wvStr("weavero-people-row-act", { act: "edit" }, null), () => { const lp: any = live(); if (lp) lp._wvPeopleTableOpen(win, rid, true); });
        act("more", "⋮", wvStr("weavero-people-row-act", { act: "more" }, null), (b) => { const lp: any = live(); if (lp) lp._wvPeopleRowMenu(win, rid, b); });
        return div;
    }

    /** A row's own listeners, once per element: a press on its checkbox or its
     *  actions is theirs -- kept from the table's selection and activation (a
     *  quick second click on the star is no double-click on the row) --; a
     *  click elsewhere is the table's own selection (the right pane shows the
     *  row; a double-click or Enter opens the page, as Zotero's items list), with
     *  Ctrl it checks the row, with Shift the rows from the last one checked. */
    _wvPeopleTableRowWire(win: any, div: any) {
        const ctl = (e: any) => { const t = e && e.target; return !!(t && t.closest && t.closest(".wv-pp-lead, .wv-pp-racts")); };
        for (const type of ["mousedown", "mouseup", "dblclick"]) {
            div.addEventListener(type, (e: any) => {
                if (!ctl(e)) return;
                try { e.stopPropagation(); } catch (er) {}
                // The focus stays on the table (its keys: Space, Escape, Enter).
                if (type === "mousedown") { try { e.preventDefault(); } catch (er) {} }
            }, true);
        }
        div.addEventListener("click", (e: any) => {
            try {
                if (e.button !== 0 || ctl(e)) return;
                const id = div.getAttribute("data-wv-pp-person");
                const lp: any = live();
                if (!lp || !id) return;
                // Either accelerator, as Zotero's trees take a Ctrl- or Cmd-click (lib/keys.ts).
                if (wvAccelAny(e)) lp._wvPeopleCheck(win, id, "toggle");
                else if (e.shiftKey) lp._wvPeopleCheck(win, id, "range");
            }
            catch (er) { Zotero.debug("[Weavero] people row click err: " + er); }
        });
    }

    /** The table's keys (before VirtualizedTable's own): Space checks the
     *  focused row, Ctrl+A checks every row, Escape clears the checks. */
    _wvPeopleTableKey(win: any, e: any): boolean {
        try {
            const v = this._wvPeopleViewOf(win);
            const st = tables.get(win);
            if (!v || !st || !st.tree) return true;
            const t = e && e.target;
            if (t && t.localName === "input") return true;
            if (e.key === "Escape" && v.checked && v.checked.size) { e.preventDefault(); this._wvPeopleCheckAll(win, false); return false; }
            if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const r = st.rows[st.tree.selection.focused];
                e.preventDefault();
                if (r) this._wvPeopleCheck(win, r.id, e.shiftKey ? "range" : "toggle");
                return false;
            }
            if ((e.key === "a" || e.key === "A") && !e.shiftKey && !e.altKey && wvAccel(e)) { e.preventDefault(); this._wvPeopleCheckAll(win, true); return false; }
            // 1-9: the coloured tag at that position, toggled on the selected
            // researchers (Zotero's items list, Zotero.Tags.toggleItemsListTags).
            if (/^[1-9]$/.test(String(e.key)) && !e.ctrlKey && !e.metaKey && !e.altKey && this._wvPeopleTagKey(win, Number(e.key))) { e.preventDefault(); return false; }
        }
        catch (er) {}
        return true;
    }

    /** A researcher's page from the table (`edit`: with the Edit pencil on). */
    _wvPeopleTableOpen(win: any, id: string, edit: boolean) {
        const v = this._wvPeopleViewOf(win);
        if (!v || !this._wvPeopleGetRec(id)) return;
        v.sel = id; v.editing = null; v.nameEdit = null; v.evEdit = null; v.evForm = null; v.linkDraft = null;
        v.pageEdit = !!edit;
        v.pageEditFor = edit ? id : null;
        this._wvPeopleTabRender(win);
        this._wvPeopleTabsPersistSoon();
    }

    // ---- checked rows ------------------------------------------------------------------

    /** A row checked or unchecked (`how`: toggle, on, off, or range -- the
     *  rows from the last one checked to this one, all checked). */
    _wvPeopleCheck(win: any, id: string, how: string) {
        const v = this._wvPeopleViewOf(win);
        if (!v) return;
        if (!v.checked) v.checked = new Set<string>();
        const set: Set<string> = v.checked;
        const st = tables.get(win);
        const ids = (st ? st.rows : this._wvPeopleTableRows(win)).map((r: WvPpRecord) => r.id);
        if (how === "range" && v.checkAnchor && ids.includes(v.checkAnchor) && ids.includes(id)) {
            const a = ids.indexOf(v.checkAnchor), b = ids.indexOf(id);
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(ids[i]);
        }
        else if (how === "on") set.add(id);
        else if (how === "off") set.delete(id);
        else if (set.has(id)) set.delete(id);
        else set.add(id);
        v.checkAnchor = id;
        this._wvPeopleTabRender(win);
    }

    /** Every row shown checked (`on`), or none. */
    _wvPeopleCheckAll(win: any, on: boolean) {
        const v = this._wvPeopleViewOf(win);
        if (!v) return;
        v.checked = new Set<string>(on ? this._wvPeopleTableRows(win).map((r: WvPpRecord) => r.id) : []);
        v.checkAnchor = null;
        this._wvPeopleTabRender(win);
    }

    /** The bar of the checked rows: select all, how many, Follow, Unfollow,
     *  Merge (exactly two). */
    _wvPeopleRenderSelBar(win: any, main: any, v: any, rows: WvPpRecord[]) {
        const doc = win.document;
        const bar = wvHtmlEl(doc, "div", "wv-pp-selbar", undefined, main);
        bar.setAttribute("data-wv-pp-selbar", String(v.checked.size));
        const every = rows.length > 0 && rows.every((r) => v.checked.has(r.id));
        const all = wvHtmlEl(doc, "input", "wv-pp-selall", undefined, bar);
        all.setAttribute("type", "checkbox");
        all.setAttribute("aria-label", wvStr("weavero-people-sel", { act: "all" }, null));
        all.setAttribute("title", wvStr("weavero-people-sel", { act: "all" }, null));
        all.checked = every;
        all.indeterminate = !every && v.checked.size > 0;
        all.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleCheckAll(win, !every); });
        wvHtmlEl(doc, "span", "wv-pp-selcount", wvStr("weavero-people-sel-count", { count: v.checked.size }, null), bar);
        this._wvPeopleBulkButtons(win, bar, v);
    }

    /** The bulk actions on the checked rows (the bar above the table, the
     *  right pane): Follow, Unfollow, Merge (exactly two). */
    _wvPeopleBulkButtons(win: any, parent: any, v: any) {
        const doc = win.document;
        const btn = (act: string, fn: (b: any) => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-sel", { act }, null), parent);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-bulk", act);
            b.addEventListener("click", () => { try { fn(b); } catch (e) { Zotero.debug("[Weavero] people bulk err: " + e); } });
            return b;
        };
        btn("follow", () => { const lp: any = live(); if (lp) lp._wvPeopleBulkFlag(win, "followed", true).catch(() => {}); });
        btn("unfollow", () => { const lp: any = live(); if (lp) lp._wvPeopleBulkFlag(win, "followed", false).catch(() => {}); });
        const m = btn("merge", (b) => { const lp: any = live(); if (lp) lp._wvPeopleBulkMerge(win, b); });
        m.disabled = !v.checked || v.checked.size !== 2;
        if (m.disabled) m.setAttribute("title", wvStr("weavero-people-sel-merge-tip", null, null));
        // Tag: each tag on or off for them all, or a new one (people-tags.ts).
        const tg = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-bulk-tag", null, null), parent);
        tg.setAttribute("type", "button");
        tg.setAttribute("data-wv-pp-bulk", "tag");
        tg.setAttribute("aria-haspopup", "menu");
        tg.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleBulkTagMenu(win, tg); });
    }

    /** The table's selection moved (VirtualizedTable's onSelectionChange: a
     *  click, the arrow keys): the right pane shows that researcher. */
    _wvPeoplePaneSel(win: any, selection: any) {
        const v = this._wvPeopleViewOf(win);
        const st = tables.get(win);
        if (!v || !st) return;
        let id: string | null = null;
        try { if (selection && selection.count && selection.focused >= 0 && st.rows[selection.focused]) id = st.rows[selection.focused].id; } catch (e) {}
        if (id === v.paneSel) return;
        v.paneSel = id;
        this._wvPeoplePaneFill(win);
    }

    /** Follow or unfollow every checked researcher: one save. */
    async _wvPeopleBulkFlag(win: any, flag: "followed" | "check", on: boolean): Promise<number> {
        await this._wvPeopleLoad();
        const v = this._wvPeopleViewOf(win);
        const recs = Array.from((v && v.checked) || []).map((id: any) => this._wvPeopleGetRec(id)).filter(Boolean) as WvPpRecord[];
        const touch = recs.filter((r) => !!(r as any)[flag] !== on);
        for (const r of touch) (r as any)[flag] = on;
        if (touch.length) await this._wvPeopleSave(touch);
        return touch.length;
    }

    /** Merge the two checked researchers, through the duplicates' merge: which
     *  one to keep, then its question. */
    _wvPeopleBulkMerge(win: any, anchor: any) {
        const v = this._wvPeopleViewOf(win);
        const ids = Array.from((v && v.checked) || []) as string[];
        if (ids.length !== 2) return null;
        const a = this._wvPeopleGetRec(ids[0]), b = this._wvPeopleGetRec(ids[1]);
        if (!a || !b) return null;
        const doc = win.document;
        return this._wvPeopleMenuAt(win, MENU_MERGE, anchor, 0, 0, (pop: any) => {
            for (const [keep, drop] of [[a, b], [b, a]]) {
                const k = keep.id, d = drop.id;
                wvMenuItem(doc, {
                    l10n: { id: "weavero-people-sel-merge-into", args: { name: wvPpDisplayName(keep) || keep.last } },
                    attrs: { "data-wv-pp-keep": k },
                    onCommand: () => { const lp: any = live(); if (lp) lp._wvPeopleMergeAsk(win, k, d); },
                }, pop);
            }
        });
    }

    // ---- the menus ---------------------------------------------------------------------

    /** A menu of the table's, built anew at each opening: under `anchor`, or
     *  at the screen point (x, y) of a right-click. */
    _wvPeopleMenuAt(win: any, id: string, anchor: any, x: number, y: number, fill: (pop: any) => void): any {
        const P: any = this;
        try {
            const doc = win.document;
            const old = doc.getElementById(id);
            if (old) { try { old.hidePopup(); } catch (e) {} old.remove(); }
            const pop = doc.createXULElement("menupopup");
            pop.id = id;
            pop.setAttribute("data-wv-tag", P._wvWireTag());
            fill(pop);
            wvPopupHost(doc).appendChild(pop);
            pop.addEventListener("popuphidden", (e: any) => { if (e.target !== pop) return; try { pop.remove(); } catch (er) {} });
            if (anchor) pop.openPopup(anchor, "after_end", 0, 2, false, false);
            else pop.openPopupAtScreen(x, y, true);
            return pop;
        }
        catch (e) { Zotero.debug("[Weavero] people menu err: " + e); return null; }
    }

    /** A row's menu (its ⋮, a right-click, the menu key): Open, Edit, Follow or
     *  Unfollow, Mark to check or Mark as checked, Refresh, Remove. */
    _wvPeopleRowMenu(win: any, id: string, anchor: any, x?: number, y?: number): any {
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return null;
        const doc = win.document;
        return this._wvPeopleMenuAt(win, MENU_ROW, anchor, x || 0, y || 0, (pop: any) => {
            const add = (act: string, fn: () => void) => wvMenuItem(doc, {
                l10n: { id: "weavero-people-row-menu", args: { act } },
                attrs: { "data-wv-pp-rmenu": act },
                onCommand: () => { try { fn(); } catch (e) { Zotero.debug("[Weavero] people row menu err: " + e); } },
            }, pop);
            const sep = () => pop.appendChild(doc.createXULElement("menuseparator"));
            add("open", () => { const lp: any = live(); if (lp) lp._wvPeopleTableOpen(win, id, false); });
            add("edit", () => { const lp: any = live(); if (lp) lp._wvPeopleTableOpen(win, id, true); });
            sep();
            add(rec.followed ? "unfollow" : "follow", () => { const lp: any = live(); if (lp) lp._wvPeopleSetFlag(id, "followed", !rec.followed).catch(() => {}); });
            add(rec.check ? "checked" : "check", () => { const lp: any = live(); if (lp) lp._wvPeopleSetFlag(id, "check", !rec.check).catch(() => {}); });
            add("refresh", () => { const lp: any = live(); if (lp) lp._wvPeopleRefreshFromTab(win, id).catch(() => {}); });
            sep();
            add("remove", () => { const lp: any = live(); if (lp) lp._wvPeopleRemoveAsk(win, id); });
        });
    }

    // ---- the columns -------------------------------------------------------------------

    /** The sort the columns hold: one column, up or down; Name, A to Z, by default. */
    _wvPeopleColSortOf(): { col: string; dir: "asc" | "desc" } {
        const s = colsStored();
        for (const k of WV_PP_TABLE_COLS) if (s[k] && s[k].sortDirection) return { col: k, dir: s[k].sortDirection === -1 ? "desc" : "asc" };
        return { col: "name", dir: "asc" };
    }

    /** The columns no researcher has a value in (Papers only once your
     *  libraries are counted). */
    _wvPeopleColEmpty(): Set<string> {
        const all: WvPpRecord[] = this._wvPeopleAllSync();
        const infos = this._wvPeopleInfos();
        const lib = this._wvPeopleLibStats();
        const has: Record<string, boolean> = { institution: false, country: false, papers: lib == null, phd: false };
        for (const r of all) {
            const i = infos.get(r.id);
            if (i) {
                if (i.institution) has.institution = true;
                if (i.country) has.country = true;
                if (i.phdYear) has.phd = true;
            }
            const s = lib && lib.get(r.id);
            if (s && s.n) has.papers = true;
        }
        return new Set(Object.keys(has).filter((k) => !has[k]));
    }

    /** The columns' prefs as VirtualizedTable reads them (getColumnPrefs): the
     *  stored widths, order and sort; hidden as the user chose, else when no
     *  researcher has a value there. */
    _wvPeopleColPrefs(): Record<string, any> {
        const s = colsStored();
        const empty = this._wvPeopleColEmpty();
        const out: Record<string, any> = {};
        let sorted = false;
        for (const k of WV_PP_TABLE_COLS) {
            const e: any = Object.assign({}, s[k] || {});
            const shown = e.shown;
            delete e.shown;
            e.hidden = k === "name" ? false : typeof shown === "boolean" ? !shown : COL_OFF.has(k) || empty.has(k);
            if (e.sortDirection) sorted = true;
            out[k] = e;
        }
        if (!sorted) out.name.sortDirection = 1;
        return out;
    }

    /** Which columns are hidden now, as one string (a change rebuilds them). */
    _wvPeopleColHiddenKey(): string {
        const p = this._wvPeopleColPrefs();
        return WV_PP_TABLE_COLS.filter((k) => p[k] && p[k].hidden).join(",");
    }

    /** What VirtualizedTable stores (a resize, a move): widths, order, sort;
     *  never `hidden`, which the user's choice (`shown`) or the rule decides. */
    _wvPeopleColStore(prefs: any) {
        const old = colsStored();
        const out: Record<string, any> = {};
        for (const k of WV_PP_TABLE_COLS) {
            const p = (prefs && prefs[k]) || {};
            const e: any = {};
            if (typeof p.width === "number" && isFinite(p.width) && p.width > 0) e.width = Math.round(p.width);
            if (typeof p.ordinal === "number") e.ordinal = p.ordinal;
            if (p.sortDirection === 1 || p.sortDirection === -1) e.sortDirection = p.sortDirection;
            if (old[k] && typeof old[k].shown === "boolean") e.shown = old[k].shown;
            if (Object.keys(e).length) out[k] = e;
        }
        colsSave(out);
    }

    /** A column title clicked (VirtualizedTable's toggleSort): its sort, kept;
     *  the rows in that order. */
    _wvPeopleColSort(win: any, index: number, dir: number) {
        const st = tables.get(win);
        let cols: any[] = [];
        try { cols = st && st.tree ? st.tree._getColumns() : []; } catch (e) {}
        const key = cols[index] && cols[index].dataKey;
        if (!key) return;
        this._wvPeopleColSortSet(win, key, dir === -1 ? -1 : 1);
    }

    /** The table sorted by `key` (1 up, -1 down), kept; the rows again. Also
     *  the specs' way in. */
    _wvPeopleColSortSet(win: any, key: string, dir: number) {
        if (!(WV_PP_TABLE_COLS as readonly string[]).includes(key)) return;
        const s = colsStored();
        for (const k of Object.keys(s)) { delete s[k].sortDirection; if (!Object.keys(s[k]).length) delete s[k]; }
        (s[key] = s[key] || {}).sortDirection = dir === -1 ? -1 : 1;
        colsSave(s);
        const st = tables.get(win);
        if (!st) return;
        st.rows = this._wvPeopleTableRows(win);
        try {
            if (st.tree) {
                // A sort set from outside the titles: the table's columns read it again.
                const cols = st.tree._getColumns();
                const c = cols.find((x: any) => x.dataKey === key);
                if (!c || c.sortDirection !== (dir === -1 ? -1 : 1)) st.tree._resetColumns();
                else st.tree.invalidate();
            }
        }
        catch (e) {}
    }

    /** The column menu (a right-click on the titles, as Zotero's items list):
     *  every column, a checkmark on those shown (Name always); then Restore
     *  default columns. */
    _wvPeopleColMenu(win: any, e: any, x?: number, y?: number): any {
        try { if (e && typeof e.preventDefault === "function") e.preventDefault(); } catch (er) {}
        const doc = win.document;
        const prefs = this._wvPeopleColPrefs();
        const st = tables.get(win);
        let order: string[] = WV_PP_TABLE_COLS.slice();
        try { if (st && st.tree) order = st.tree._getColumns().map((c: any) => c.dataKey); } catch (er) {}
        const sx = e && typeof e.screenX === "number" ? e.screenX : (x || 0);
        const sy = e && typeof e.screenY === "number" ? e.screenY : (y || 0);
        return this._wvPeopleMenuAt(win, MENU_COLS, null, sx, sy, (pop: any) => {
            for (const k of order) {
                const mi = wvMenuItem(doc, {
                    l10n: k === "tags" ? { id: "weavero-people-tags-col" } : { id: "weavero-people-table-colmenu", args: { col: k } },
                    attrs: { type: "checkbox", autocheck: "false", "data-wv-pp-colmenu": k },
                    onCommand: () => { const lp: any = live(); if (lp) lp._wvPeopleColToggle(win, k); },
                }, pop);
                wvSetBoolAttr(mi, "checked", !(prefs[k] && prefs[k].hidden));
                if (k === "name") wvSetBoolAttr(mi, "disabled", true);
            }
            pop.appendChild(doc.createXULElement("menuseparator"));
            wvMenuItem(doc, {
                l10n: { id: "weavero-people-table-colreset" },
                attrs: { "data-wv-pp-colmenu": "reset" },
                onCommand: () => { const lp: any = live(); if (lp) lp._wvPeopleColReset(win); },
            }, pop);
        });
    }

    /** A column shown or hidden by the user: kept as their choice. */
    _wvPeopleColToggle(win: any, key: string) {
        if (key === "name" || !(WV_PP_TABLE_COLS as readonly string[]).includes(key)) return;
        const hiddenNow = !!(this._wvPeopleColPrefs()[key] || {}).hidden;
        const s = colsStored();
        (s[key] = s[key] || {}).shown = hiddenNow;
        colsSave(s);
        this._wvPeopleColRebuild(win);
    }

    /** Restore default columns: their order, widths and the automatic rule;
     *  the sort stays. */
    _wvPeopleColReset(win: any) {
        const s = colsStored();
        const out: Record<string, any> = {};
        for (const k of Object.keys(s)) if (s[k].sortDirection) out[k] = { sortDirection: s[k].sortDirection };
        colsSave(out);
        this._wvPeopleColRebuild(win);
    }

    /** The table's columns built again from the prefs (VirtualizedTable's
     *  _resetColumns: the columns, then every row). */
    _wvPeopleColRebuild(win: any) {
        const st = tables.get(win);
        if (!st || !st.tree) return;
        try { st.hidden = this._wvPeopleColHiddenKey(); st.tree._resetColumns(); } catch (e) { Zotero.debug("[Weavero] people columns err: " + e); }
    }

    // ---- the filters on, above the table ---------------------------------------------------

    /** Every filter on, included or excluded, as a pill with its x (the ones
     *  the funnel of earlier builds left on included: nothing filters unseen);
     *  Clear when there are several. */
    _wvPeopleRenderActive(win: any, main: any, v: any) {
        const ff: any = v.ff || {};
        if (!wvPpFiltersCount(ff)) return;
        const doc = win.document;
        const bar = wvHtmlEl(doc, "div", "wv-pp-factive", undefined, main);
        const pill = (key: string, value: string | null, state: "in" | "out") => {
            const p = wvHtmlEl(doc, "span", "wv-pp-fpill", undefined, bar);
            p.setAttribute("data-wv-pp-fkey", key);
            if (value != null) p.setAttribute("data-wv-pp-fval", value);
            p.setAttribute("data-state", state);
            const filter = wvStr("weavero-people-filter", { filter: key }, null);
            const text = value == null ? wvStr("weavero-people-fchip-toggle", { state, filter }, null)
                : wvStr("weavero-people-fchip", { state, filter, value: wvPpFilterValueLabel(key, value) }, null);
            wvHtmlEl(doc, "span", "wv-pp-fpill-lab", text, p);
            const x = wvHtmlEl(doc, "button", "wv-pp-fpill-x", "×", p);
            x.setAttribute("type", "button");
            x.setAttribute("title", wvStr("weavero-people-fchip-remove", null, null));
            x.setAttribute("aria-label", wvStr("weavero-people-fchip-remove", null, null));
            x.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleFilterClick(win, key, value, state === "out"); });
        };
        const not: any = ff.not || {};
        for (const [side, state] of [[ff, "in"], [not, "out"]] as Array<[any, "in" | "out"]>) {
            for (const k of WV_PP_TOGGLES) if (side[k] === true) pill(k, null, state);
            for (const k of WV_PP_MENUS) for (const val of (Array.isArray(side[k]) ? side[k] : [])) pill(k, String(val), state);
        }
        if (wvPpFiltersCount(ff) > 1) {
            const c = wvHtmlEl(doc, "button", "wv-pp-btn wv-pp-fclear", wvStr("weavero-people-filter-clear-all", null, null), bar);
            c.setAttribute("type", "button");
            c.setAttribute("data-wv-pp-fclear", "true");
            c.setAttribute("aria-label", wvStr("weavero-people-filter-clear-all", null, "aria-label"));
            c.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleClearFilters(win); });
        }
    }

    // ---- the duplicates' screen ------------------------------------------------------------

    /** "Duplicates": the possible duplicates, each pair side by side (people.ts
     *  _wvPeopleRenderDupes), or a word that there is none. */
    _wvPeopleRenderDupesView(win: any, main: any) {
        const doc = win.document;
        main.setAttribute("data-wv-pp-dupesview", "true");
        const dupes = wvPpDuplicates(this._wvPeopleAllSync());
        const head = wvHtmlEl(doc, "div", "wv-pp-head", undefined, main);
        wvHtmlEl(doc, "span", "wv-pp-name", wvStr("weavero-people-nav", { view: "dupes" }, null), head);
        if (!dupes.length) { wvHtmlEl(doc, "div", "wv-pp-hint", wvStr("weavero-people-dupe-none", null, null), main); return; }
        this._wvPeopleRenderDupes(win, main, dupes);
    }
}

const _ptDescriptors = Object.getOwnPropertyDescriptors(_PeopleTableMixin.prototype);
delete (_ptDescriptors as any).constructor;
export const peopleTableMethods = _ptDescriptors;
