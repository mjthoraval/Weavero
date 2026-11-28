// People (plan approved by MJT 2026-11-22, branch people2; research
// work/people-database-research-2026-11-22.md section 3, its note storage
// superseded): "I want that data only in Weavero, in a structured way, with a
// special interface especially designed to build and check the data on other
// researchers."
//
// - The data: <data dir>/weavero/people.json, one structured record per
//   researcher (lib/people-record.ts); the raw source records and their
//   publication lists in weavero/people-cache/ (rebuildable). Through
//   lib/store.ts. NOTHING in any Zotero library, ever (test/people.spec.js
//   counts items, notes and collections around every action).
// - The network, on the user's click only (Add, Refresh, Build): OpenAlex,
//   ORCID's public API, theses.fr, IdRef, Wikidata (lib/people-sources.ts), the
//   researcher's name or id alone, no key. A person is found by ids once
//   known, never by a name alone: the profiles carrying the name are listed
//   for the user to pick (homonyms, research doc 3.7).
// - The People tab: a tab of type "wvpeople" (NO hyphen: Zotero's
//   parseTabType splits a type on "-", tabs.js 429-438), one per main window,
//   filled by Weavero. Zotero has tab hooks (restore, transfer, duplicate, ...)
//   for library / reader / note only (tabs.js _getHook: a no-op otherwise), so
//   Weavero keeps it across restarts itself (weavero/people-tabs.json, matched
//   to a window by what its tabs show, as the split view's records), and
//   leaves it out of what Zotero saves: Zotero's restoreState destructures
//   its hook's answer (tabs.js restoreState), and a no-op hook's `undefined`
//   would abort the restore of every tab after it. Moving it to another
//   window is not in v1: Zotero offers no move without a transfer hook, and
//   Weavero's moves go by the tab's item, which it has none of.
// - Entry points: File -> People (pane.ts, beside Weavero's other window
//   entries); the Researchers button in the collections pane's toolbar
//   (people-toolbar.ts, MJT 2026-11-27); "Add to People" / "Show in People" on
//   an author of an item's Info section (MenuManager target
//   "itemPane/info/row"), items of any library.
// - The look: the References card's (refs.ts CARD_CSS), Zotero's colours,
//   light and dark.

import { wvLivePlugin } from "../lib/live";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, wvPopupHost, wvSetBoolAttr, wvWithin } from "../lib/dom";
import { wvSvgEl } from "../lib/svg";
import { wvFilterTileRules, wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvDismissOff, wvOutsideClick } from "../lib/dismiss";
import { wvMMRegister, wvMenuItem } from "../lib/menu";
import { wvMainWins, wvIsLibraryTabID } from "../lib/windows";
import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvListen, wvUnlisten } from "../lib/listen";
import { wvStoreDir, wvStoreRead, wvStoreWrite, wvStoreRemove } from "../lib/store";
import { WV_FUNNEL_DATA_URI } from "./constants";
import { WV_LT_CSS } from "./people-lineage";
import { WV_REFS_DOC_TYPES, WvRefsMarkKind, wvRefsDrawMark, wvRefsMarkColorCSS } from "./refs";
import {
    WvPpLine, WvPpNameOrder, WvPpRecord, WvPpRef, WvPpShown, WvPpSource, WV_PP_COUNTRY_FACTS, WV_PP_FACTS, WV_PP_ID_KEYS, WV_PP_LINKS, WV_PP_NAME_FACT, WV_PP_SOURCES,
    wvPpAct, wvPpCountryCode, wvPpCountryName, wvPpDisplayName, wvPpEdit, wvPpFact, wvPpFold, wvPpFormKey, wvPpFormLines, wvPpGroups, wvPpIds, wvPpMerge, wvPpNameAs,
    wvPpNameForms, wvPpNameMatch, wvPpNameTextAs, wvPpNewRecord, wvPpNormalizeRecord, wvPpRecordIs, wvPpRefOf, wvPpRejectedForms, wvPpRename, wvPpSame, wvPpShown,
    wvPpSplitName, wvPpToday, WvPpEvent, WV_PP_EVENT_DATE, wvPpEventNorm, wvPpEventsSorted, wvPpEventSuggest, wvPpEventDate, wvPpEventLink,
    WvPpEvidence, wvPpEvidenceFromLink, wvPpEvidenceLink, WV_PP_FACTS_SHOWN,
} from "../lib/people-record";
import {
    WV_PP_MENUS, WV_PP_TOGGLES, WvPpFilters, WvPpInfo, WvPpLibIndex, WvPpLibStat,
    wvPpFilterClick, wvPpFiltersParse, wvPpInfos, wvPpLibFormsOf, wvPpLibIndexCreator, wvPpLibIndexNew, wvPpLibIndexPair,
    wvPpLibStatOf, wvPpInitials,
    wvPpLinkQueue, wvPpDateChecks, WvPpDateIssue, wvPpDuplicates, wvPpMergeInto, WvPpDupe,
} from "../lib/people-list";
import { WV_PP_TABLE_CSS, WV_PP_TABLE_ID, wvPpFilterValueLabel, wvPpTableDrop } from "./people-table";
import { WV_PP_PANE_CSS } from "./people-pane";
import { WV_PP_TAGS_CSS } from "./people-tags";
import { wvPpTagColorsNorm } from "../lib/people-tags";
import {
    WV_PP_API, WV_PP_WEB, WvPpCandidate, WvPpWork, wvPpAuthorOfWork, wvPpCandidates, wvPpFollowEntries, wvPpFromOpenAlexAuthor,
    wvPpFromOrcid, wvPpFromThesesPerson, wvPpFromWikidata, wvPpIdrefIds, wvPpThesesCandidates, wvPpWikidataQuery, wvPpWorks, wvPpWorksCount, wvPpWorksHidden, wvPpWorkIsDoiOnly, wvPpMetrics, wvPpS2AuthorOf, wvPpS2Figures, wvPpScholarId, wvPpScholarFigures,
} from "../lib/people-sources";

declare const Zotero: any;
declare const Services: any;
declare const ChromeUtils: any;

export const WV_PP_TAB_TYPE = "wvpeople";
const STYLE_ID = "wv-people-tab-style";
// The deck's listener for Zotero's tab switch (_wvPeopleWireSelect).
const SELCHANGE_KEY = "lazy:people-selchange";
const MM_ROW_ID = "weavero-people-creator";
const STORE_FILE = "people.json";
const CACHE_DIR = "people-cache";
const TABS_FILE = "people-tabs.json";
const PP_PREFS = ["enablePeople"];
/** The places of the tab that write a researcher's name, each with its own
 *  order (`weavero.people.names.<place>`, "last" | "first"; MJT 2026-11-24:
 *  "Last, First" everywhere by default, "offer display options to change them
 *  all separately"). */
const NAME_PLACES = ["list", "title", "links", "tree"];
/** The view and the filters chosen last (prefs, defaults in prefs-table.ts
 *  WV_PREF_VALUES): a new view starts from them. The table's sort, columns and
 *  widths: `weavero.people.columns` (people-table.ts). */
const PREF_SHOW = "weavero.people.show";
const PREF_FILTERS = "weavero.people.filters";
/** After items change, the library index is read again this much later (a
 *  sync or an import changes many at once). */
const LIB_REBUILD_MS = 2000;
/** The publications' sort button's and funnel's chevron (list-filter.ts
 *  CHEVRON_PATH, the reader's chip chevron), 8 px. */
const CHEVRON_PATH = "M0 2.70711L4 6.70711L8 2.70711L7.29289 2L4 5.29289L0.707107 2L0 2.70711Z";
/** The click that ends a name edit outside its two fields (people4). */
const NAME_EDIT_KEY = "lazy:people-nameedit";
const MAX_PROFILES = 3;
const MAX_THESES_CANDIDATES = 5;
const MAX_WORK_PAGES = 3;
/** Between two people of a Build: OpenAlex allows 10 requests a second
 *  without a key, ORCID 12; a person costs 6 to 10 (research doc 2). */
const BUILD_GAP_MS = 1500;
/** A recorded tab waits this long for its window (windows come back one by
 *  one at a start or a session switch), as the split view's records. */
const TABS_PENDING_MS = 90000;
const FP_MIN = 0.8;
const WORKS_SHOWN = 60;

/** A person, drawn from Zotero's group.svg (chrome/skin/default/zotero/16/
 *  universal): its left figure alone, moved to the middle on whole pixels,
 *  1-px lines. `context-fill`, as Zotero's own toolbar icons. */
const PERSON_PATH = "M7 6.5C7 7.88071 5.88071 9 4.5 9C3.11929 9 2 7.88071 2 6.5C2 5.11929 3.11929 4 4.5 4C5.88071 4 7 5.11929 7 6.5ZM6 6.5C6 7.32843 5.32843 8 4.5 8C3.67157 8 3 7.32843 3 6.5C3 5.67157 3.67157 5 4.5 5C5.32843 5 6 5.67157 6 6.5ZM9 14.5C9 13.3065 8.52589 12.1619 7.68198 11.318C6.83807 10.4741 5.69347 10 4.5 10C3.30653 10 2.16193 10.4741 1.31802 11.318C0.474106 12.1619 0 13.3065 0 14.5V16H9V14.5ZM8 14.5C8 13.5717 7.63125 12.6815 6.97487 12.0251C6.3185 11.3687 5.42826 11 4.5 11C3.57174 11 2.6815 11.3687 2.02513 12.0251C1.36875 12.6815 1 13.5717 1 14.5V15H8V14.5Z";
// Parentheses escaped too: an unquoted CSS url(...) ends at the first ")".
export const WV_PP_ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
    + '<path transform="translate(4 -2)" fill-rule="evenodd" clip-rule="evenodd" fill="context-fill" d="' + PERSON_PATH + '"/></svg>')
    .replace(/\(/g, "%28").replace(/\)/g, "%29");

/** The same person, FILLED and drawn to the full box, for the Researchers tab's
 *  icon and the Info section's author mark (16 px, people-cmark.ts) and the
 *  collections-toolbar button (20 px, the size of Zotero's toolbar icons). MJT
 *  2026-11-27, on the thin outline at 9 x 12 px: "Not enough visible. Can it be
 *  larger? Or filled maybe?" -> "Larger and filled"; then, of the Info mark left
 *  in outline: "You forgot to fix this one". */
function wvPpSolid(size: 16 | 20): string {
    const s = size === 20
        ? '<circle cx="10" cy="6" r="3.75"/><path d="M2.5 18.5C2.5 13.8 5.9 11 10 11C14.1 11 17.5 13.8 17.5 18.5Z"/>'
        : '<circle cx="8" cy="4.75" r="3"/><path d="M1.5 15.5C1.5 11.4 4.4 8.9 8 8.9C11.6 8.9 14.5 11.4 14.5 15.5Z"/>';
    return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size
        + '" viewBox="0 0 ' + size + ' ' + size + '"><g fill="context-fill">' + s + '</g></svg>')
        .replace(/\(/g, "%28").replace(/\)/g, "%29");
}
export const WV_PP_ICON_SOLID = wvPpSolid(16);
export const WV_PP_ICON_SOLID20 = wvPpSolid(20);

const FACT_L10N: Record<string, string> = {
    [WV_PP_NAME_FACT]: "weavero-people-fact-other-names",
    "position": "weavero-people-fact-position",
    "institution": "weavero-people-fact-institution",
    "country": "weavero-people-fact-country",
    "phd.institution": "weavero-people-fact-phd",
    "phd.country": "weavero-people-fact-phd-country",
    "phd.year": "weavero-people-fact-phd-year",
    "phd.thesis": "weavero-people-fact-phd-thesis",
    "birth.year": "weavero-people-fact-birth-year",
    "web": "weavero-people-fact-web",
    "link.advisor": "weavero-people-link-advisor",
    "link.coadvisor": "weavero-people-link-coadvisor",
    "link.postdoc": "weavero-people-link-postdoc",
    "link.lab": "weavero-people-link-lab",
    "link.linked": "weavero-people-link-linked",
    "link.student": "weavero-people-link-student",
};
/** The Facts section's facts; the right pane shows the same (lib/people-record.ts). */
const FACTS_SHOWN = WV_PP_FACTS_SHOWN;

/** The tab's look: the References card's (refs.ts CARD_CSS) -- the window's
 *  own font size, Zotero's --fill-secondary for the lesser lines, its
 *  --fill-quinary rounded boxes, the accent for links -- on Zotero's pane
 *  materials, so light and dark follow Zotero. */
// The publications' funnel popup (the researchers' funnel gave way to the left
// pane's Browse by, people-table.ts).
const FP = "#wv-pp-wfilter-popup";
const CSS = `
#tabs-deck > [data-wv-people] { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: clip; position: relative; }
:root[wv-people-paneoff] :is(#zotero-context-splitter, #zotero-context-splitter-stacked, #zotero-context-pane) { display: none !important; }
.wv-pp-root { flex: 1 1 auto; display: flex; min-width: 0; min-height: 0; height: 100%; box-sizing: border-box;
  background: var(--material-background, Canvas); color: var(--fill-primary, CanvasText); font: message-box; font-size: 1rem; }
.wv-pp-side { flex: 0 1 250px; min-width: 180px; display: flex; flex-direction: column; min-height: 0;
  background: var(--material-sidepane, var(--material-background, Canvas)); border-inline-end: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); }
.wv-pp-search { width: 100%; box-sizing: border-box; margin: 0; }
.wv-pp-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.wv-pp-chip { appearance: none; font: inherit; font-size: 0.92em; padding: 1px 8px; border-radius: 10px; margin: 0;
  border: 1px solid var(--fill-quinary, rgba(127,127,127,.3)); background: transparent; color: inherit; cursor: default;
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-width: 0; box-sizing: border-box; }
.wv-pp-chip[hidden] { display: none; }
.wv-pp-chip[aria-pressed="true"] { background: var(--color-accent, var(--accent-blue, #4072e5)); border-color: transparent; color: #fff; }
.wv-pp-chip[data-wv-pp-menu-open]:not([aria-pressed="true"]) { background: rgba(127,127,127,0.14); }
.wv-pp-chiplab { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-pp-chip-n { flex: none; opacity: 0.8; }
.wv-pp-caret { flex: none; display: inline-flex; opacity: 0.6; }
.wv-pp-caret > svg { width: 8px; height: 8px; fill: currentColor; stroke: none; }
/* The publications' funnel: Zotero's toolbar-button look, as the tabs menu's funnel (constants.ts
   #wv-tabs-menu-filetype-btn) -- no box at rest, the fills on hover and while open. */
.wv-pp-funnel { appearance: none; flex: none; position: relative; display: inline-flex; align-items: center; gap: 1px;
  margin: 0; padding: 2px 4px; border: none; border-radius: 5px; background: transparent; color: var(--fill-secondary, GrayText);
  -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity; fill: currentColor; }
.wv-pp-funnel:hover, .wv-pp-funnel[aria-expanded="true"] { background-color: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-funnel:active { background-color: var(--fill-quarternary, rgba(127,127,127,.25)); }
.wv-pp-funnel > img { width: 16px; height: 16px; -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity; fill: currentColor; }
/* A filter on: the accent dot of every Weavero funnel (reader-panels.ts .wv-rf-active::after). */
.wv-pp-funnel.wv-pp-funnel-active::after { content: ""; position: absolute; top: 1px; left: 14px; width: 6px; height: 6px;
  border-radius: 50%; background: var(--color-accent, #5e6ad2); pointer-events: none; }
/* The funnel's popup: the frame of the tabs menu's filter popup (constants.ts
   #wv-tabs-menu-filetype-popup), the top bar and tiles of every Weavero filter. */
${FP} { position: absolute; z-index: 1000; box-sizing: border-box; width: 330px; max-width: calc(100% - 16px); overflow: auto;
  display: flex; flex-direction: column; gap: 6px; padding: 10px;
  background-color: var(--material-sidepane, Canvas); background-image: linear-gradient(var(--material-menu, transparent), var(--material-menu, transparent));
  border: 1px solid var(--material-panedivider, rgba(127,127,127,0.4)); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
  color: var(--fill-primary, CanvasText); font: message-box; font-size: 12px; user-select: none; scrollbar-width: thin; }
${FP} .wv-filter-top-bar { display: flex; align-items: center; gap: 6px; }
${FP} .wv-filter-top-hint { font-size: 10px; opacity: 0.5; }
${FP} .wv-filter-clear-btn { margin-left: auto; font: inherit; font-size: 11px; line-height: 1; color: inherit; cursor: pointer; padding: 3px 8px;
  border-radius: 10px; border: 1px solid rgba(127,127,127,0.4); background: rgba(127,127,127,0.10); }
${FP} .wv-filter-clear-btn:hover { background: rgba(127,127,127,0.22); }
${FP} .wv-filter-clear-icon { background: rgba(127,127,127,0.18); border: none; padding: 0; color: rgb(220,72,72); cursor: pointer;
  width: 24px; height: 24px; border-radius: 50%; position: relative; display: inline-block; font-size: 0; flex: none; }
${FP} .wv-filter-clear-icon::before, ${FP} .wv-filter-clear-icon::after { content: ""; position: absolute; top: 50%; left: 50%;
  width: 12px; height: 1.5px; background: currentColor; border-radius: 1px; }
${FP} .wv-filter-clear-icon::before { transform: translate(-50%,-50%) rotate(45deg); }
${FP} .wv-filter-clear-icon::after { transform: translate(-50%,-50%) rotate(-45deg); }
${FP} .wv-filter-clear-icon:hover { background: rgba(220,72,72,0.28); color: rgb(255,255,255); }
${FP} .wv-pp-fsec { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
${FP} .wv-filter-or-group { background: rgba(127,127,127,0.18); border-radius: 6px; padding: 5px 6px; }
${FP} .wv-pp-fhead { display: flex; align-items: center; gap: 5px; font-size: 10px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.04em; }
${FP} .wv-pp-fhead > img { width: 16px; height: 16px; flex: none; -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity; fill: currentColor; stroke: currentColor; }
${FP} .wv-filter-options { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
${FP} .wv-pp-fsec:not([data-wv-pp-fsec="toggles"]) .wv-filter-options { max-height: 150px; overflow-y: auto; scrollbar-width: thin; align-content: flex-start; padding-right: 2px; }
${wvFilterTileRules(FP, "class").join("\n")}
${FP} .wv-filter-opt { gap: 4px; padding: 2px 6px; max-width: 100%; min-width: 0; box-sizing: border-box; }
${FP} .wv-filter-svg { display: inline-block; flex: none; width: 16px; height: 16px; -moz-context-properties: fill, fill-opacity, stroke, stroke-opacity; fill: currentColor; stroke: currentColor; }
${FP} .wv-pp-fchip > .icon-item-type { flex: none; width: 16px; height: 16px; }
${FP} .wv-pp-flab { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${FP} .wv-pp-fn { flex: none; opacity: 0.65; font-variant-numeric: tabular-nums; }
/* A value no researcher has now (a choice kept from before): faded, as the Tag Selector's. */
${FP} .wv-filter-opt[data-wv-pp-zero="true"] { opacity: 0.6; }
/* The name, edited in place (people4): Zotero's creator fields, Last name then First name. */
.wv-pp-name[role="button"] { cursor: text; border-radius: 4px; padding: 0 2px; margin: 0 -2px; }
.wv-pp-name[role="button"]:hover { background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-namesrc { align-self: center; }
.wv-pp-nameedit { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; flex: 1 1 22em; min-width: 0; }
.wv-pp-nameedit input { flex: 1 1 9em; min-width: 6em; margin: 0; font: inherit; font-size: 1.2em; font-weight: 600; }
.wv-pp-nameedit input[aria-invalid="true"] { outline: 1px solid var(--accent-red, #d93425); }
.wv-pp-nameerr { flex: 1 1 100%; font-size: 0.92em; color: var(--accent-red, #d93425); }
.wv-pp-nameerr[hidden] { display: none; }
.wv-pp-build { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.wv-pp-buildst { font-size: 0.92em; color: var(--fill-secondary, GrayText); flex: 1 1 100%; }
.wv-pp-buildst[hidden] { display: none; }
.wv-pp-rowsub { font-size: 0.92em; color: var(--fill-secondary, GrayText); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-pp-empty { padding: 12px 8px; color: var(--fill-secondary, GrayText); }
.wv-pp-main { flex: 1 1 0; min-width: 0; min-height: 0; overflow: auto; padding: 12px 18px 24px; box-sizing: border-box; }
.wv-pp-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.wv-pp-name { font-size: 1.45em; font-weight: 600; overflow-wrap: anywhere; }
.wv-pp-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-inline-start: auto; }
.wv-pp-btn { font: inherit; font-size: 0.92em; padding: 1px 9px; margin: 0; }
.wv-pp-btn[aria-pressed="true"] { font-weight: 600; }
.wv-pp-sub, .wv-pp-muted, .wv-pp-srcline, .wv-pp-agree, .wv-pp-wmeta { font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-pp-status { margin-top: 4px; font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-pp-status[data-kind="error"] { color: var(--accent-red, #d93425); }
.wv-pp-status[hidden] { display: none; }
.wv-pp-sec { margin-top: 16px; }
.wv-pp-sectitle { font-weight: 600; font-size: 1.05em; margin: 0 0 6px; padding-bottom: 2px; border-bottom: 1px solid var(--color-panedivider, rgba(127,127,127,.3)); display: flex; align-items: baseline; gap: 10px; }
.wv-pp-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 14px; row-gap: 6px; }
.wv-pp-flabel { color: var(--fill-secondary, GrayText); padding-top: 3px; }
.wv-pp-fvals { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.wv-pp-val { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 3px 6px; border-radius: 5px; background: var(--fill-quinary, rgba(127,127,127,.12)); }
.wv-pp-val[data-status="alternative"] { background: transparent; border: 1px dashed var(--fill-quinary, rgba(127,127,127,.35)); }
.wv-pp-val[data-status="rejected"] { background: transparent; }
.wv-pp-val[data-status="rejected"] .wv-pp-vtext { text-decoration: line-through; color: var(--fill-secondary, GrayText); }
.wv-pp-vtext { flex: 1 1 12em; min-width: 0; overflow-wrap: anywhere; }
.wv-pp-vtext[role="link"] { color: var(--wv-link-http, LinkText); cursor: pointer; }
.wv-pp-vtext[role="link"]:hover { text-decoration: underline; }
.wv-pp-srcs { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.wv-pp-src { font-size: 0.85em; padding: 0 6px; border-radius: 8px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.35)); color: var(--fill-secondary, GrayText); cursor: pointer; }
.wv-pp-src[data-status="confirmed"] { color: var(--accent-green, #39a845); border-color: currentColor; }
.wv-pp-src[data-status="chosen"] { color: var(--wv-link-http, LinkText); border-color: currentColor; font-weight: 600; }
.wv-pp-src[data-status="rejected"] { text-decoration: line-through; }
.wv-pp-agree { color: var(--accent-green, #39a845); }
.wv-pp-new { color: var(--accent-orange, #e66b00); font-weight: 600; font-size: 0.85em; }
.wv-pp-conflict { color: var(--accent-orange, #e66b00); font-size: 0.85em; }
.wv-pp-vbtns { display: inline-flex; gap: 3px; margin-inline-start: auto; }
.wv-pp-vbtn { font: inherit; font-size: 0.85em; padding: 0 6px; margin: 0; }
.wv-pp-edit { display: flex; gap: 4px; align-items: center; }
.wv-pp-edit input { flex: 1 1 auto; min-width: 6em; font: inherit; margin: 0; }
.wv-pp-cands { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.wv-pp-cand { padding: 3px 8px; border-radius: 5px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.3)); cursor: pointer; }
.wv-pp-cand:hover { background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-candmeta { display: block; font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-pp-linkadd { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
.wv-pp-evs { display: flex; flex-direction: column; gap: 3px; }
.wv-pp-back { font: inherit; font-size: 1.1em; padding: 0 8px; margin: 0; align-self: center; }
.wv-pp-main[data-wv-pp-record] { container-type: inline-size; }
.wv-pp-havatar { width: 36px; height: 36px; font-size: 1em; align-self: center; }
.wv-pp-hsub { margin-top: 2px; color: var(--fill-secondary, GrayText); }
.wv-pp-pencil[aria-pressed="true"] { background: var(--fill-quinary, rgba(127,127,127,.2)); }
/* The page's header actions: icons as the table's row actions (people-table.ts .wv-pp-ract). */
.wv-pp-actions { align-items: center; }
.wv-pp-hact { font-size: 1.15em; width: 26px; height: 24px; }
.wv-pp-done { font-weight: 600; }
/* The view mode (MJT 2026-11-26, "This is still taking too much space. Make it more compact"):
   one tight line per value, smaller headings and padding; the edit mode keeps the boxes. */
.wv-pp-main[data-wv-pp-mode="view"] > .wv-pp-sec { margin-top: 10px; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-cols { gap: 8px; margin-top: 8px; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-col { gap: 8px; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-col > .wv-pp-sec { padding: 5px 10px 6px; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-sectitle { font-size: 0.92em; margin-bottom: 3px; padding-bottom: 0; color: var(--fill-secondary, GrayText); }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-facts { row-gap: 1px; column-gap: 12px; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-flabel { padding-top: 0; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-fvals { gap: 0; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-val { padding: 0; background: transparent; border: none; border-radius: 0; }
.wv-pp-main[data-wv-pp-mode="view"] .wv-pp-ev { padding: 1px 0; }
.wv-pp-queuebtn[aria-pressed="true"] { font-weight: 600; }
.wv-pp-qrow { grid-template-columns: minmax(8em, 14em) minmax(0, 1fr) auto; }
.wv-pp-qwho { color: var(--wv-link-http, LinkText); cursor: pointer; }
.wv-pp-qwho:hover { text-decoration: underline; }
.wv-pp-qsrcs { margin-inline-start: 8px; }
.wv-pp-qbtns { display: inline-flex; gap: 4px; }
.wv-pp-dateissues { margin: 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--accent-orange, #e66b00); }
.wv-pp-dtitle { font-weight: 600; color: var(--accent-orange, #e66b00); margin-bottom: 2px; }
.wv-pp-dateissue { font-size: 0.92em; padding: 1px 0; }
.wv-pp-dupes { margin: 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.35)); }
.wv-pp-dupe { padding: 6px 0; border-top: 1px solid var(--fill-quinary, rgba(127,127,127,.2)); }
.wv-pp-dupe:first-of-type { border-top: none; }
.wv-pp-dupecards { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.wv-pp-dupecard { padding: 4px 8px; border-radius: 6px; background: var(--fill-quinary, rgba(127,127,127,.1)); min-width: 0; overflow-wrap: anywhere; }
.wv-pp-dupereasons { margin: 4px 0; }
.wv-pp-src-ev::after { content: " \\1F4C4"; }
.wv-pp-dateissue[role="link"] { cursor: pointer; }
.wv-pp-dateissue[role="link"]:hover { text-decoration: underline; }
.wv-pp-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; margin-top: 12px; }
.wv-pp-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.wv-pp-col > .wv-pp-sec { margin-top: 0; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.3)); background: var(--material-background, transparent); }
.wv-pp-col > .wv-pp-sec > .wv-pp-sectitle { border-bottom: none; }
@container (max-width: 640px) { .wv-pp-cols { grid-template-columns: minmax(0, 1fr); } }
.wv-pp-tcount { font-size: 0.92em; color: var(--fill-secondary, GrayText); margin-bottom: 6px; }
${WV_PP_TABLE_CSS}
.wv-pp-avatar { flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 600; color: #fff; background: hsl(var(--wv-pp-hue, 210), 45%, 45%); }
.wv-pp-metrics { margin-inline-start: auto; font-weight: normal; font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-pp-wcited { align-self: baseline; white-space: nowrap; font-size: 0.85em; color: var(--fill-secondary, GrayText); font-variant-numeric: tabular-nums; }
.wv-pp-ev { display: grid; grid-template-columns: 7.5em minmax(0, 1fr) auto; column-gap: 10px; align-items: baseline; padding: 3px 6px; border-radius: 5px; }
.wv-pp-ev:hover, .wv-pp-ev:focus-within { background: var(--fill-quinary, rgba(127,127,127,.12)); }
.wv-pp-evdate { color: var(--fill-secondary, GrayText); font-variant-numeric: tabular-nums; }
.wv-pp-evbody { min-width: 0; overflow-wrap: anywhere; }
.wv-pp-evwhat { font-weight: 600; }
.wv-pp-evlink { color: var(--wv-link-http, LinkText); cursor: pointer; margin-inline-start: 6px; }
.wv-pp-evlink:hover { text-decoration: underline; }
.wv-pp-evnote { display: block; font-size: 0.92em; color: var(--fill-secondary, GrayText); white-space: pre-wrap; }
.wv-pp-ev .wv-pp-vbtns, .wv-pp-val .wv-pp-vbtns { visibility: hidden; }
.wv-pp-val:hover .wv-pp-vbtns, .wv-pp-val:focus-within .wv-pp-vbtns { visibility: visible; }
.wv-pp-ev:hover .wv-pp-vbtns, .wv-pp-ev:focus-within .wv-pp-vbtns { visibility: visible; }
.wv-pp-evform { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 8px; align-items: center; margin-top: 6px; padding: 6px; border-radius: 6px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.35)); }
.wv-pp-evform input, .wv-pp-evform textarea { font: inherit; margin: 0; min-width: 0; }
.wv-pp-evform textarea { min-height: 2.6em; resize: vertical; }
.wv-pp-evsugg { grid-column: 2; display: flex; flex-wrap: wrap; gap: 3px; }
.wv-pp-evsugg button { font: inherit; font-size: 0.85em; padding: 0 7px; margin: 0; border-radius: 9px; }
.wv-pp-evbtns { grid-column: 2; display: flex; gap: 4px; align-items: center; }
.wv-pp-everr { color: var(--accent-red, #d93425); font-size: 0.92em; }
.wv-pp-crow .wv-pp-evdate { overflow-wrap: anywhere; }
.wv-pp-caddr { white-space: pre-wrap; }
.wv-pp-clabel { margin-inline-start: 8px; font-size: 0.85em; padding: 0 6px; border-radius: 8px; border: 1px solid var(--fill-quinary, rgba(127,127,127,.35)); color: var(--fill-secondary, GrayText); }
.wv-pp-cmap { font-size: 0.92em; }
.wv-pp-pickbox { position: relative; flex: 1 1 10em; min-width: 6em; display: flex; }
.wv-pp-pickbox input { flex: 1 1 auto; min-width: 0; font: inherit; margin: 0; }
.wv-pp-pick { position: absolute; top: 100%; inset-inline: 0; z-index: 10; margin-top: 2px; max-height: 16em; overflow-y: auto;
  padding: 4px; box-sizing: border-box; border-radius: 6px; border: 1px solid var(--color-panedivider, rgba(127,127,127,.45));
  background: var(--material-background, Canvas); box-shadow: 0 4px 12px rgba(0,0,0,.25); }
.wv-pp-pick[hidden] { display: none; }
.wv-pp-pickopt { display: flex; flex-direction: column; gap: 1px; padding: 4px 8px; border-radius: 5px; cursor: default; }
.wv-pp-pickopt:hover { background: var(--fill-quinary, rgba(127,127,127,.15)); }
.wv-pp-pickopt[aria-selected="true"] { background: var(--color-accent, var(--accent-blue, #4072e5)); color: #fff; }
.wv-pp-pickopt[aria-selected="true"] .wv-pp-rowsub { color: inherit; opacity: 0.85; }
${WV_LT_CSS}
.wv-pp-works { display: flex; flex-direction: column; gap: 4px; }
.wv-pp-work { display: flex; gap: 8px; align-items: baseline; padding: 2px 4px; border-radius: 4px; }
.wv-pp-work:hover { background: var(--fill-quinary, rgba(127,127,127,.12)); }
.wv-pp-wyear { flex: none; width: 3em; color: var(--fill-secondary, GrayText); font-variant-numeric: tabular-nums; }
/* The publications' toolbar: the search field, then the chips (show, sort, type, journal). */
.wv-pp-wtools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0 0 8px; }
.wv-pp-wsearch { flex: 1 1 14em; min-width: 8em; max-width: 26em; margin: 0; font: inherit; }
.wv-pp-wlist { display: flex; flex-direction: column; gap: 4px; }
/* The item type's icon: Zotero's .icon-item-type rules draw it; an empty slot keeps the titles aligned. */
.wv-pp-wicon { flex: none; width: 16px; height: 16px; align-self: center; }
.wv-pp-wmore { align-self: flex-start; margin-top: 4px; }
/* The References' marks (refs.ts drawMark, markColorCSS): green dot, blue dot, grey ring. */
.wv-pp-wmark { flex: none; width: 10px; height: 10px; align-self: center; display: inline-flex; }
.wv-pp-wmark > svg, ${FP} .wv-pp-fmark > svg { width: 10px; height: 10px; display: block; }
${FP} .wv-pp-fmark { flex: none; display: inline-flex; }
${wvRefsMarkColorCSS(".wv-pp-wmark")}
${wvRefsMarkColorCSS(FP + " .wv-pp-fmark")}
/* A publication's References card (refs.ts _wvRefsCardOf), in the look of the funnel's popup;
   the card's own box as in its menu (refs.ts CARD_CSS: 420 px, its padding). */
.wv-pp-whcard { position: absolute; z-index: 1000; box-sizing: border-box; max-width: calc(100% - 16px);
  background-color: var(--material-sidepane, Canvas); background-image: linear-gradient(var(--material-menu, transparent), var(--material-menu, transparent));
  border: 1px solid var(--material-panedivider, rgba(127,127,127,0.4)); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
  color: var(--fill-primary, CanvasText); font: message-box; }
.wv-pp-whcard > .wv-refs-card { box-sizing: border-box; width: 420px; max-width: 100%; padding: 6px 9px 7px; display: flex; flex-direction: column; gap: 1px; white-space: normal; cursor: default; font-size: 1rem; }
.wv-pp-wbody { flex: 1 1 auto; min-width: 0; }
/* Text links in Weavero's link blue (lib/links.ts WV_LINK_PALETTE, switched with the theme): Zotero's
   --accent-blue is a fill colour (#4072e5, 3.78:1 on the dark #1e1e1e); the link blue is 7.91:1 there and
   4.51:1 on white (MJT 2026-11-23: "The blue you are using in Researchers is difficult to read"). */
.wv-pp-wtitle { color: var(--wv-link-http, LinkText); cursor: pointer; overflow-wrap: anywhere; }
.wv-pp-wtitle:hover { text-decoration: underline; }
.wv-pp-notes { width: 100%; box-sizing: border-box; min-height: 6em; font: inherit; resize: vertical; }
.wv-pp-hint { color: var(--fill-secondary, GrayText); padding: 24px 4px; }
${WV_PP_PANE_CSS}
${WV_PP_TAGS_CSS}
#tab-bar-container .tab-icon.icon-item-type[data-item-type="${WV_PP_TAB_TYPE}"],
#zotero-tabs-menu-list .tab-icon.icon-item-type[data-item-type="${WV_PP_TAB_TYPE}"],
.wv-tsplit-icon[data-item-type="${WV_PP_TAB_TYPE}"] {
  background: url("${WV_PP_ICON_SOLID}") center / 16px 16px no-repeat !important;
  /* Blue, as Google Contacts' person and the authors' marks in the Info section
     (people-cmark.ts; MJT 2026-11-26): Zotero's own accent blue, dark mode included. */
  -moz-context-properties: fill; fill: var(--accent-blue, #1a73e8);
}
`;

interface WvPpView {
    tabID: string;
    sel: string | null;
    filter: "check" | "followed" | "all";
    /** The list's filters that are on (Browse by in the left pane); started
     *  from the prefs, written back to them at each change. */
    ff: WvPpFilters;
    /** A view of the left pane's "Fix and manage" over every researcher:
     *  Sources disagree, Without ORCID (people-table.ts). */
    fix?: "conflict" | "noOrcid" | null;
    /** The table's checked rows (record ids), and the one checked last (the
     *  start of a Shift+click range); the Browse groups open. Per window, not saved. */
    checked?: Set<string>;
    checkAnchor?: string | null;
    browseOpen?: string[];
    /** The table's selected row (one click, the arrow keys): the right pane
     *  shows it (people-pane.ts); the table stays. */
    paneSel?: string | null;
    /** The tag selector's selected tags (AND) and its filter text
     *  (people-tags.ts); per window, not saved. */
    tagSel?: string[];
    tagQ?: string;
    /** The name being edited (people4): the record and the two fields' text,
     *  kept across a redraw; `err`: an empty last name was refused. */
    nameEdit?: { id: string; last: string; first: string; err: boolean } | null;
    q: string;
    /** The publications list's search, show, sort and filters (MJT
     *  2026-11-25: "For the publications part, add some sorting and filtering
     *  options"); per window, kept across a redraw, not saved. */
    wk: WvPpWorksView;
    editing: { fact: string; value: string | null; ref?: WvPpRef } | null;
    works: Map<string, { key: string; inLib: Map<string, number[]> | null }>;
    /** Add a Link's kind and typed name, kept across a re-render (a lookup
     *  finishing redraws the tab while the user types). */
    linkDraft?: { fact: string; text: string } | null;
    /** The event being added (`id` null) or edited, its fields as typed, kept
     *  across a redraw; `err`: why Save refused it. */
    evEdit?: { rec: string; id: string | null; date: string; what: string; where: string; link: string; note: string; err: string } | null;
    /** The page's edit mode (the Edit pencil; MJT 2026-11-26, "Reserve the more
     *  advanced sources and edit buttons to the edit mode"): every field, the
     *  sources, every control; off (the view mode), the values shown only, and
     *  a field or card with no value hidden. For one record (`pageEditFor`):
     *  another one opens in the view mode. */
    pageEdit?: boolean;
    pageEditFor?: string | null;
    /** What the centre pane shows with no researcher open: the table, the
     *  "Suggested links" queue or the possible duplicates. A page opened from
     *  one goes back to it. */
    view?: "table" | "queue" | "dupes";
    /** The evidence form open under one of the user's own values: the link (a
     *  zotero:// link, or one an open PDF filled in) and the quote, as typed. */
    evForm?: { rec: string; fact: string; value: string; ref?: WvPpRef; link: string; quote: string; err: string } | null;
}
/** The publications list's controls: `q` words to find in the title, the
 *  authors or the journal; `sort` (WORKS_SORTS); `inc` / `exc` the funnel's
 *  included and excluded values per filter (WORKS_FILTERS; "kind": the
 *  References' marks, pdf / nopdf / web); `limit` how many rows are drawn. */
interface WvPpWorksView { q: string; sort: string; inc: Record<string, string[]>; exc: Record<string, string[]>; limit: number; }
const WORKS_SORTS = ["new", "old", "cited", "title", "venue"];
/** The funnel's filters (MJT 2026-11-25: "The filters should follow the Weavero
 *  filters design, with the Alt+Click option to exclude"): an on/off tile, then a
 *  section per value filter, any of its values (the group tint). */
const WORKS_FILTERS = ["kind", "type", "venue", "decade"];
const MENU_WSORT = "wv-pp-wsort-menu";
const WORKS_FUNNEL_ID = "wv-pp-wfilter-popup";
const worksViewNew = (): WvPpWorksView => ({ q: "", sort: "new", inc: {}, exc: {}, limit: WORKS_SHOWN });
/** A publication's value for a funnel filter ("" = Unknown). */
const worksValue = (r: WvPpWorkRow, key: string): string =>
    key === "kind" ? r.kind : key === "type" ? r.type : key === "venue" ? r.venue
    : key === "decade" ? (r.w.year ? String(Math.floor(r.w.year / 10) * 10) : "") : "";
/** How many filter values are on, included and excluded: the funnel's dot. */
const worksFiltersOn = (wk: WvPpWorksView): number =>
    WORKS_FILTERS.reduce((n, k) => n + ((wk.inc && wk.inc[k]) || []).length + ((wk.exc && wk.exc[k]) || []).length, 0);
/** One publication as its row shows it: the work, and where it is in a
 *  library, its first item, whose type and citation fields win (they are the
 *  user's); else what OpenAlex gave. */
interface WvPpWorkRow {
    w: WvPpWork;
    ids: number[] | null;
    item: any;
    /** The References' mark (refs.ts, MJT 2026-11-20): in your library with a
     *  PDF or EPUB the reader opens, without one, or not in your libraries. */
    kind: WvRefsMarkKind;
    /** Zotero's item type (the Type filter) and the icon to draw ("" none). */
    type: string;
    icon: string;
    venue: string;
    volume: string;
    issue: string;
    pages: string;
    /** Where a click goes: the item in the library, else the paper's page. */
    url: string;
}
/** Each main window's People view: kept off the window (nothing for the
 *  wiring snapshot, nothing that outlives it). */
const views = new WeakMap<any, WvPpView>();
/** A window's view gone: the publications' funnel popup, the name edit and
 *  the table (React's root unmounted) too. */
function dropView(win: any) {
    const v = views.get(win);
    if (v) { wvDismissOff(v, "wfunnelDismiss"); v.nameEdit = null; }
    try { const p = win && win.document && win.document.getElementById("wv-pp-wfilter-popup"); if (p) p.remove(); } catch (e) {}
    try { wvPpTableDrop(win); } catch (e) {}
    try { if (win && win.document) wvUnlisten(win.document, NAME_EDIT_KEY); } catch (e) {}
    views.delete(win);
}

const live = () => wvLivePlugin();
const tabIn = (win: any, id: any): any => {
    try { return win && win.Zotero_Tabs && id ? win.Zotero_Tabs._tabs.find((t: any) => t && t.id === id) || null : null; } catch (e) { return null; }
};
const baseType = (t: any): string => String((t && t.type) || "").replace(/-(unloaded|loading|reloaded)$/, "");

/** A window by what it holds -- every tab's description but the People tab's,
 *  sorted -- and how much of a recorded one another holds (as the split
 *  view's records, tab-split.ts fingerprintOf / fpScore). */
function fingerprintOf(win: any): string[] {
    const out: string[] = [];
    try {
        for (const t of (win && win.Zotero_Tabs && win.Zotero_Tabs._tabs) || []) {
            if (!t || baseType(t) === WV_PP_TAB_TYPE) continue;
            if (wvIsLibraryTabID(t.id) || baseType(t) === "library") { out.push("lib"); continue; }
            const iid = t.data && t.data.itemID;
            const it = iid ? Zotero.Items.get(iid) : null;
            if (it) out.push(baseType(t) + ":" + it.libraryID + "/" + it.key);
        }
    } catch (e) {}
    return out.sort();
}
function fpScore(fp: string[], cur: string[]): number {
    if (!fp.length || !cur.length) return 0;
    const left = new Map<string, number>();
    for (const d of cur) left.set(d, (left.get(d) || 0) + 1);
    let n = 0;
    for (const d of fp) { const k = left.get(d) || 0; if (k > 0) { n++; left.set(d, k - 1); } }
    return n / Math.max(fp.length, cur.length);
}

/** The DOI of an item, lower case, or "". */
function doiOf(item: any): string {
    let d = "";
    try { d = String(item.getField("DOI") || ""); } catch (e) {}
    if (!d) {
        try { const m = String(item.getField("extra") || "").match(/^DOI:\s*(\S+)/im); if (m) d = m[1]; } catch (e) {}
    }
    return d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
}

/** A short, plain text for a failed request. */
function errText(e: any): string {
    try {
        if (e && e.status) return "HTTP " + e.status;
        if (e && e.name === "BrowserOfflineException") return String(e.message || e.name);
        return String((e && (e.message || e)) || "").split("\n")[0].slice(0, 160);
    } catch (er) { return "?"; }
}

/** The interface's language, for country names and sorting. */
const uiLocale = (): string => { try { return String(Zotero.locale || "en-US"); } catch (e) { return "en-US"; } };
const isToggle = (k: string) => (WV_PP_TOGGLES as readonly string[]).includes(k);
const isMenu = (k: string) => (WV_PP_MENUS as readonly string[]).includes(k);

/** A value filter's value as written: "Unknown", a country's name, a decade
 *  ("1960s"), or the value itself (people-table.ts). */
const filterValueLabel = (key: string, value: string): string => wvPpFilterValueLabel(key, value);

/** The chevron of a chip that opens a menu. */
function caretEl(doc: any, parent: any): any {
    const caret = wvHtmlEl(doc, "span", "wv-pp-caret", undefined, parent);
    caret.setAttribute("aria-hidden", "true");
    const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 8 8", width: 8, height: 8 }, caret);
    wvSvgEl(doc, "path", { d: CHEVRON_PATH }, svg);
    return caret;
}

const srcName = (s: WvPpSource) => (s === "me" ? wvStr("weavero-people-source-me", null, null)
    : s === "items" ? wvStr("weavero-people-source-items", null, null)
    : s === "radar" ? wvStr("weavero-people-source-radar", null, null) : WV_PP_SOURCES[s].name);
const factLabel = (fact: string) => {
    const d = wvPpFact(fact);
    if (d && d.id) return WV_PP_SOURCES[fact as WvPpSource] ? WV_PP_SOURCES[fact as WvPpSource].name : fact;
    return wvStr(FACT_L10N[fact] || fact, null, null);
};
const idWeb = (fact: string, v: string): string | null => {
    if (fact === "orcid") return WV_PP_WEB.orcid(v);
    if (fact === "openalex") return WV_PP_WEB.openalex(v);
    if (fact === "idref") return WV_PP_WEB.idref(v);
    if (fact === "wikidata") return WV_PP_WEB.wikidata(v);
    return null;
};

class _PeopleMixin {
    [k: string]: any;

    // ---- the switch -------------------------------------------------------

    _wvPeopleOn(): boolean {
        try { return !!this._wvPref("enablePeople"); } catch (e) { return false; }
    }

    _wvPeopleInit() {
        this._wvPeopleWirePrefWatch();
        this._wvPeopleApply();
    }

    /** On: the author rows' entries, the tab observer, the recorded tabs back;
     *  off: none of them, every People tab closed. */
    _wvPeopleApply() {
        if (this._wvPeopleOn()) {
            this._wvPeopleRegisterMenu();
            this._wvPeopleWireNotifier();
            this._wvPeopleTabsLoad().catch((e: any) => Zotero.debug("[Weavero] people tabs load err: " + e));
        }
        else {
            this._wvPeopleUnregisterMenu();
            for (const w of wvMainWins()) { try { this._wvPeopleTabClose(w); } catch (e) {} }
            // The researchers strips (people-strip.ts) go too.
            try { this._wvPsDestroy(); } catch (e) {}
        }
        // The Info sections' marks (people-cmark.ts): on, off.
        try { this._wvPpCmarkAll(); } catch (e) {}
        // The collections toolbar's button (people-toolbar.ts): on, off, in every main window.
        try { this._wvPpTbApplyAll(); } catch (e) {}
    }

    _wvPeopleWirePrefWatch() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvPeoplePrefObs) {
                if (g._wvPeoplePrefObsVer === tag) return;
                for (const s of g._wvPeoplePrefObs) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
                delete g._wvPeoplePrefObs;
            }
            g._wvPeoplePrefObsVer = tag;
            g._wvPeoplePrefObs = PP_PREFS.map((k) => Zotero.Prefs.registerObserver("weavero." + k, () => {
                try {
                    const lp: any = live();
                    if (!lp || lp._wvWireTag() !== tag) return;
                    wvClearTimeout(lp._wvPeoplePrefT);
                    lp._wvPeoplePrefT = wvTimeout(() => {
                        const lp2: any = live();
                        if (!lp2) return;
                        lp2._wvPeoplePrefT = null;
                        lp2._wvPeopleApply();
                    }, 30);
                } catch (e) {}
            }));
            // The name orders (Settings): every People tab drawn again.
            for (const place of NAME_PLACES) {
                g._wvPeoplePrefObs.push(Zotero.Prefs.registerObserver("weavero.people.names." + place, () => {
                    try { const lp: any = live(); if (lp && lp._wvWireTag() === tag) lp._wvPeopleRenderAll(); } catch (e) {}
                }));
            }
            // The collections toolbar's button (people-toolbar.ts): its right-click's Hide
            // and Settings' box show or hide it in every main window, live.
            g._wvPeoplePrefObs.push(Zotero.Prefs.registerObserver("weavero.peopleToolbarButton", () => {
                try { const lp: any = live(); if (lp && lp._wvWireTag() === tag) lp._wvPpTbApplyAll(); } catch (e) {}
            }));
        } catch (e) { Zotero.debug("[Weavero] people pref watch err: " + e); }
    }

    /** destroy(): the entries, the observers, the timers, the build; every
     *  People tab recorded (a reload or a re-enable brings it back) and
     *  closed -- a tab of a type Zotero does not know left in its list would
     *  go into its session -- and their sheet. Not at a quit: the windows
     *  close anyway, and the record of the restart is the one written last. */
    _wvPeopleDestroy() {
        const P: any = this;
        wvClearTimeout(P._wvPeoplePrefT); P._wvPeoplePrefT = null;
        wvClearTimeout(P._wvPpTabsPersistT); P._wvPpTabsPersistT = null;
        wvClearTimeout(P._wvPpTabsRestoreT); P._wvPpTabsRestoreT = null;
        wvClearTimeout(P._wvPpSaveT); P._wvPpSaveT = null;
        try {
            const g: any = Zotero;
            for (const s of g._wvPeoplePrefObs || []) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
            delete g._wvPeoplePrefObs; delete g._wvPeoplePrefObsVer;
        } catch (e) {}
        if (P._wvPpObserverID) { try { Zotero.Notifier.unregisterObserver(P._wvPpObserverID); } catch (e) {} P._wvPpObserverID = null; }
        if (P._wvPpItemObsID) { try { Zotero.Notifier.unregisterObserver(P._wvPpItemObsID); } catch (e) {} P._wvPpItemObsID = null; }
        wvClearTimeout(P._wvPpLibT); P._wvPpLibT = null;
        P._wvPpLibIx = null; P._wvPpLibMemo = null; P._wvPpInfoMemo = null;
        this._wvPeopleUnregisterMenu();
        try { this._wvPsDestroy(); } catch (e) {}
        try { this._wvPpCmarkDestroy(); } catch (e) {}
        if (P._wvPpBuild) P._wvPpBuild.stop = true;
        let quitting = false;
        try { quitting = !!Services.startup.shuttingDown || !!P._wvQuitting; } catch (e) {}
        if (!quitting) {
            try { this._wvPeopleTabsPersist(true); } catch (e) {}
            for (const w of wvMainWins()) {
                try { this._wvPeopleTabClose(w); } catch (e) {}
                try { wvRemoveStyle(w.document, STYLE_ID); } catch (e) {}
            }
        }
        P._wvPeopleDB = null;
        P._wvPeopleBusy = null;
        P._wvPpBuild = null;
    }

    // ---- the store ----------------------------------------------------------------

    _wvPeoplePath(): string { return PathUtils.join(wvStoreDir(), STORE_FILE); }

    /** The records, read once (concurrent callers share the read). A file
     *  that cannot be read now is KEPT and the store stays read-only (lib/
     *  store.ts "io-error"): a write would replace the user's records. */
    async _wvPeopleLoad(): Promise<WvPpRecord[]> {
        const P: any = this;
        if (P._wvPeopleDB) return P._wvPeopleDB.people;
        if (!P._wvPeopleLoading) {
            P._wvPeopleLoading = (async () => {
                const r = await wvStoreRead(this._wvPeoplePath());
                const people: WvPpRecord[] = [];
                if (r.status === "ok" && r.doc && Array.isArray(r.doc.people)) {
                    for (const x of r.doc.people) { const rec = wvPpNormalizeRecord(x); if (rec && !people.some((p) => p.id === rec.id)) people.push(rec); }
                }
                // The coloured tags (people-tags.ts): the store's own list, beside the records.
                P._wvPeopleDB = { people, readOnly: r.status === "io-error", tagColors: wvPpTagColorsNorm(r.status === "ok" && r.doc ? r.doc.tagColors : null) };
                return people;
            })().finally(() => { P._wvPeopleLoading = null; });
        }
        return P._wvPeopleLoading;
    }

    /** The records in memory now ([] before the first read). */
    _wvPeopleAllSync(): WvPpRecord[] {
        const db = (this as any)._wvPeopleDB;
        return db ? db.people : [];
    }

    _wvPeopleGetRec(id: string | null): WvPpRecord | null {
        if (!id) return null;
        return this._wvPeopleAllSync().find((p) => p.id === id) || null;
    }

    /** Write the records (atomic, through the store's chain); every People
     *  tab drawn again. `touch`: the records whose modified date moves. */
    async _wvPeopleSave(touch?: WvPpRecord[]): Promise<void> {
        const P: any = this;
        const db = P._wvPeopleDB;
        if (!db) return;
        const now = new Date().toISOString();
        for (const r of touch || []) r.modified = now;
        if (db.readOnly) { Zotero.debug("[Weavero] people: people.json could not be read; nothing written"); return; }
        const doc: any = { v: 1, people: db.people };
        if (Array.isArray(db.tagColors) && db.tagColors.length) doc.tagColors = db.tagColors;
        const p = wvStoreWrite(this._wvPeoplePath(), doc, { pretty: 1 });
        this._wvPeopleRenderAll();
        // The authors marked in the Info sections follow the records (people-cmark.ts).
        try { this._wvPpCmarkAll(); } catch (e) {}
        await p;
    }

    _wvPeopleNewID(): string {
        const P: any = this;
        P._wvPpIdSeq = ((P._wvPpIdSeq || 0) + 1) % 1296;
        let id = "";
        do { id = "p" + Date.now().toString(36) + P._wvPpIdSeq.toString(36).padStart(2, "0") + Math.floor(Math.random() * 1296).toString(36); }
        while (this._wvPeopleGetRec(id));
        return id;
    }

    /** The records whose name fits an author's, exact names first. A NAME
     *  match (homonyms): it shows a record, it never fetches one. */
    _wvPeopleFindByName(last: string, first: string): Array<{ rec: WvPpRecord; match: "exact" | "initials" }> {
        const out: Array<{ rec: WvPpRecord; match: "exact" | "initials" }> = [];
        for (const rec of this._wvPeopleAllSync()) {
            let m = wvPpNameMatch(rec.last, rec.first, last, first);
            // The other forms of the name (people4; the legacy variants among
            // them) are read whenever the record's own name is not an EXACT fit
            // -- an initials fit too (MJT 2026-11-23: "A. L. Yarin", variant
            // "Alexander L. Yarin", and the author "Yarin, Alexander L." still
            // got Add beside Show: the variants were read only when the name
            // did not fit at all). A rejected form is never read.
            if (m !== "exact") {
                for (const v of wvPpNameForms(rec)) {
                    const n = wvPpSplitName(v);
                    const mv = wvPpNameMatch(n.last, n.first, last, first);
                    if (mv === "exact") { m = "exact"; break; }
                    if (mv && !m) m = mv;
                }
            }
            if (m) out.push({ rec, match: m });
        }
        return out.sort((a, b) => (a.match === "exact" ? 0 : 1) - (b.match === "exact" ? 0 : 1));
    }

    /** The record a link's ids name, else (no id in common) one whose name is
     *  exactly the link's and whose ids do not contradict it. */
    _wvPeopleFindByRef(name: string, ref?: WvPpRef): WvPpRecord | null {
        const all = this._wvPeopleAllSync();
        const byId = all.find((r) => wvPpRecordIs(r, ref));
        if (byId) return byId;
        const n = wvPpSplitName(name);
        const clashes = (r: WvPpRecord) => {
            const ids = wvPpRefOf(r);
            return !!ref && WV_PP_ID_KEYS.some((k) => ref[k] && (ids as any)[k] && String((ids as any)[k]).toUpperCase() !== String(ref[k]).toUpperCase());
        };
        for (const r of all) {
            if (wvPpNameMatch(r.last, r.first, n.last, n.first) === "exact" && !clashes(r)) return r;
        }
        // Then a researcher one of whose other forms is exactly that name (people4).
        for (const r of all) {
            const hit = wvPpNameForms(r).some((f) => { const s = wvPpSplitName(f); return wvPpNameMatch(s.last, s.first, n.last, n.first) === "exact"; });
            if (hit && !clashes(r)) return r;
        }
        return null;
    }

    /** A new record (To check), saved. `ref`: ids it starts with (a link's
     *  other person, a followed author), suggested from `source`. */
    async _wvPeopleCreate(last: string, first: string, opts?: { ref?: WvPpRef; source?: WvPpSource; url?: string; from?: WvPpRecord["from"]; followed?: boolean; aft?: string }): Promise<WvPpRecord> {
        await this._wvPeopleLoad();
        const o = opts || {};
        const rec = wvPpNewRecord(this._wvPeopleNewID(), last, first);
        if (o.from) rec.from = o.from;
        if (o.followed) rec.followed = true;
        if (o.aft) rec.aft = String(o.aft);
        const lines: WvPpLine[] = [];
        for (const k of WV_PP_ID_KEYS) {
            const v = o.ref && o.ref[k];
            if (!v) continue;
            const l: WvPpLine = { fact: k, value: v, source: o.source || "me", status: "suggested" };
            const u = o.url || idWeb(k, v);
            if (u) l.url = u;
            lines.push(l);
        }
        if (lines.length) wvPpMerge(rec, lines, wvPpToday());
        (this as any)._wvPeopleDB.people.push(rec);
        await this._wvPeopleSave();
        return rec;
    }

    async _wvPeopleRemove(id: string): Promise<boolean> {
        await this._wvPeopleLoad();
        const db = (this as any)._wvPeopleDB;
        const i = db.people.findIndex((p: WvPpRecord) => p.id === id);
        if (i < 0) return false;
        db.people.splice(i, 1);
        for (const w of wvMainWins()) { const v = views.get(w); if (v && v.sel === id) v.sel = null; }
        await this._wvPeopleSave();
        await wvStoreRemove(this._wvPeopleCachePath(id));
        return true;
    }

    // ---- the cache (raw source records, publication lists) ---------------------

    _wvPeopleCachePath(id: string): string {
        // One component per argument: PathUtils.join refuses "a/b" on Windows.
        return PathUtils.join(wvStoreDir(), CACHE_DIR, String(id).replace(/[^A-Za-z0-9]/g, "") + ".jsonlz4");
    }

    async _wvPeopleCacheRead(id: string): Promise<any> {
        const P: any = this;
        if (!P._wvPpCacheMem) P._wvPpCacheMem = new Map();
        if (P._wvPpCacheMem.has(id)) return P._wvPpCacheMem.get(id);
        let doc: any = null;
        try {
            const r = await wvStoreRead(this._wvPeopleCachePath(id), { retries: 0, decompress: true });
            doc = r.status === "ok" ? r.doc : null;
        } catch (e) { doc = null; }
        if (P._wvPpCacheMem.size > 50) P._wvPpCacheMem.clear();
        P._wvPpCacheMem.set(id, doc);
        return doc;
    }

    async _wvPeopleCacheWrite(id: string, doc: any): Promise<void> {
        const P: any = this;
        if (!P._wvPpCacheMem) P._wvPpCacheMem = new Map();
        P._wvPpCacheMem.set(id, doc);
        await wvStoreWrite(this._wvPeopleCachePath(id), doc, { pretty: null, compress: true });
    }

    // ---- the network, on a click ----------------------------------------------

    /** THE one request path: GET JSON, no cookies (`anon`), no key, no
     *  address of the user's; Zotero's own User-Agent. The specs stub this. */
    async _wvPeopleGet(url: string): Promise<any> {
        const xhr = await Zotero.HTTP.request("GET", url, {
            headers: { Accept: "application/json" },
            responseType: "json",
            anon: true,
            timeout: 20000,
            errorDelayMax: 0,
        });
        return xhr && xhr.response;
    }

    /** Look person `id` up -- on a click only. `pick`: the OpenAlex profile
     *  the user picked among homonyms. `stop`: a Build's stop flag. Returns
     *  what the tab says next. */
    async _wvPeopleRefresh(id: string, opts?: { pick?: string; stop?: { stop: boolean } }): Promise<{ added: number; errors: Array<{ source: string; error: string }>; candidates: WvPpCandidate[] | null; notes: string[]; date: string }> {
        const P: any = this;
        const o = opts || {};
        const date = wvPpToday();
        const res = { added: 0, errors: [] as Array<{ source: string; error: string }>, candidates: null as WvPpCandidate[] | null, notes: [] as string[], date };
        await this._wvPeopleLoad();
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return res;
        if (!P._wvPeopleBusy) P._wvPeopleBusy = new Set();
        if (P._wvPeopleBusy.has(id)) return res;
        P._wvPeopleBusy.add(id);
        this._wvPeopleRenderAll();
        const stopped = () => !!(o.stop && o.stop.stop) || !!P._wvDestroyed;
        try {
            const name = wvPpDisplayName(rec);
            const incoming: WvPpLine[] = [];
            const ownKey = wvPpFold(rec.last) + "|" + wvPpFold(rec.first);
            const notOwnName = (ls: WvPpLine[]) => ls.filter((l) => l.fact !== WV_PP_NAME_FACT || wvPpFormKey(l.value) !== ownKey);
            const raw: any = {};
            const get = async (source: string, url: string) => {
                if (stopped()) return null;
                try { const lp: any = live() || P; return await lp._wvPeopleGet(url); }
                catch (e) { res.errors.push({ source, error: errText(e) }); return null; }
            };
            if (o.pick) {
                const pid = o.pick.toUpperCase();
                wvPpMerge(rec, [{ fact: "openalex", value: pid, source: "openalex", url: WV_PP_WEB.openalex(pid), status: "suggested" }], date);
                wvPpAct(rec, "openalex", pid, "keep");
            }
            // How your items write the researcher (people4, the Other names row's
            // "your items"): read from the library index, nothing fetched; merged
            // after the sources' forms (a form both give is written as the source
            // writes it).
            let itemForms: WvPpLine[] = [];
            try {
                const ix: WvPpLibIndex | null = P._wvPpLibIx && !P._wvPpLibStale ? P._wvPpLibIx.ix : await this._wvPeopleLibIndexBuild();
                if (ix) itemForms = wvPpFormLines(wvPpLibFormsOf(rec, ix, 30), "items");
            }
            catch (e) { Zotero.debug("[Weavero] people item forms err: " + e); }
            const one = (fact: string) => { const s = wvPpShown(rec, fact)[0]; return s ? s.value : ""; };
            let oa = wvPpIds(rec, "openalex");
            let orcid = one("orcid");
            let ppn = one("idref");
            let qid = one("wikidata");
            // No OpenAlex profile yet: the one carrying the ORCID iD, else the
            // one that wrote the paper the person was added from (an id
            // reached through the paper).
            if (!oa.length && orcid) {
                const a = await get("OpenAlex", WV_PP_API.openalexAuthor("orcid:" + orcid));
                const got = a ? wvPpFromOpenAlexAuthor(a) : null;
                if (got && got.lines.length) { incoming.push(...got.lines); oa = [got.lines[0].value]; raw.openalex = { [oa[0]]: a }; }
            }
            if (!oa.length && !orcid && !ppn && !qid && rec.from && rec.from.doi) {
                const w = await get("OpenAlex", WV_PP_API.openalexWork(rec.from.doi));
                const au = w ? wvPpAuthorOfWork(w, rec.last, rec.first) : null;
                if (au && au.id) {
                    incoming.push({ fact: "openalex", value: au.id, source: "openalex", url: WV_PP_WEB.openalex(au.work || au.id), status: "suggested" });
                    oa = [au.id];
                }
            }
            // Still nothing to go by: the profiles carrying the name, for the user to pick.
            if (!oa.length && !orcid && !ppn && !qid) {
                const s = await get("OpenAlex", WV_PP_API.openalexSearch(name));
                res.candidates = s ? wvPpCandidates(s) : null;
                if (incoming.length || itemForms.length) res.added = wvPpMerge(rec, notOwnName(incoming.concat(itemForms)), date);
                await this._wvPeopleSave([rec]);
                return res;
            }
            raw.openalex = raw.openalex || {};
            for (const aid of oa.slice(0, MAX_PROFILES)) {
                if (raw.openalex[aid]) continue;
                const a = await get("OpenAlex", WV_PP_API.openalexAuthor(aid));
                if (!a) continue;
                raw.openalex[aid] = a;
                incoming.push(...wvPpFromOpenAlexAuthor(a).lines);
            }
            if (!orcid) {
                const fromOa = incoming.find((l) => l.fact === "orcid");
                if (fromOa && !rec.lines.some((l) => l.fact === "orcid" && l.status === "rejected" && wvPpSame("orcid", l.value, fromOa.value))) orcid = fromOa.value;
            }
            // Their works (the publications section), newest first.
            // A work titled by its DOI alone (a supplementary file) is left out of the
            // list and of the count; on pages not fetched (past MAX_WORK_PAGES) it
            // cannot be seen and stays in OpenAlex's count.
            let works: WvPpWork[] | null = null, worksCount = 0, hidden = 0, seen = 0;
            if (oa.length) {
                for (let page = 1; page <= MAX_WORK_PAGES; page++) {
                    const w = await get("OpenAlex", WV_PP_API.openalexWorks(oa.slice(0, MAX_PROFILES), page));
                    if (!w) break;
                    const ws = wvPpWorks(w);
                    const got = ((w && w.results) || []).length;
                    seen += got;
                    hidden += wvPpWorksHidden(w);
                    works = (works || []).concat(ws);
                    const total = wvPpWorksCount(w) || seen;
                    worksCount = Math.max(works.length, total - hidden);
                    if (got < 200 || seen >= total) break;
                }
            }
            if (orcid) {
                const r = await get("ORCID", WV_PP_API.orcidRecord(orcid));
                if (r) { raw.orcid = r; incoming.push(...wvPpFromOrcid(r, orcid)); }
            }
            // theses.fr by the IdRef id; with none, a person of that name whose
            // IdRef record carries this ORCID (an id match, never the name).
            let idref: { orcid: string; wikidata: string } | undefined;
            if (!ppn && orcid) {
                const s = await get("theses.fr", WV_PP_API.thesesSearch(name));
                if (s) {
                    for (const c of wvPpThesesCandidates(s, rec.last, rec.first).slice(0, MAX_THESES_CANDIDATES)) {
                        const ids = wvPpIdrefIds(await get("IdRef", WV_PP_API.idref2id(c)));
                        if (ids.orcid && ids.orcid === orcid) { ppn = c; idref = ids; break; }
                    }
                    if (!ppn) res.notes.push("theses-none");
                }
            }
            else if (ppn) {
                const j = await get("IdRef", WV_PP_API.idref2id(ppn));
                if (j) { raw.idref = j; idref = wvPpIdrefIds(j); }
            }
            if (ppn) {
                const p = await get("theses.fr", WV_PP_API.thesesPerson(ppn));
                if (p) { raw.thesesfr = p; incoming.push(...wvPpFromThesesPerson(p, ppn, idref)); }
            }
            // Wikidata: the advisors and students it records, by the person's
            // item, else by the ORCID iD. One query; the mirror when the
            // endpoint refuses (research doc 3.7).
            if (!qid && idref && idref.wikidata) qid = idref.wikidata;
            const q = wvPpWikidataQuery({ qid, orcid });
            if (q && !stopped()) {
                let wd: any = null;
                try { const lp: any = live() || P; wd = await lp._wvPeopleGet(WV_PP_API.wikidata(q)); }
                catch (e) {
                    try { const lp: any = live() || P; wd = await lp._wvPeopleGet(WV_PP_API.wikidataMirror(q)); }
                    catch (e2) { res.errors.push({ source: "Wikidata", error: errText(e2) }); }
                }
                const got = wd ? wvPpFromWikidata(wd) : null;
                if (wd) raw.wikidata = wd;
                if (got) incoming.push(...got.lines);
            }
            if (stopped()) return res;
            // The sources' names are forms of the name ("name.other" lines, people4);
            // the record's own name is never one, nor ever replaced by them.
            res.added = wvPpMerge(rec, notOwnName(incoming.concat(itemForms)), date);
            const prev = await this._wvPeopleCacheRead(id);
            const cache: any = Object.assign({ v: 1 }, prev || {}, { date, raw: Object.assign({}, (prev && prev.raw) || {}, raw) });
            if (works) { cache.works = works; cache.worksCount = worksCount; }
            await this._wvPeopleCacheWrite(id, cache);
            for (const w of wvMainWins()) { const v = views.get(w); if (v) v.works.delete(id); }
            await this._wvPeopleSave([rec]);
            return res;
        }
        finally {
            P._wvPeopleBusy.delete(id);
            this._wvPeopleRenderAll();
        }
    }

    // ---- build from followed authors ------------------------------------------

    /** The followed authors (Feeds' list and the alerts file's, the file
     *  feeds.ts imports and exports, with their OpenAlex ids): a record for
     *  each one not in People yet, marked To check and followed; those already
     *  there are marked followed. Then each new one with an id is looked up in
     *  the background, one at a time, until done or stopped. `doc`: an alerts
     *  file the user picked (else weavero/feeds/alerts.json). Returns the
     *  count of records made. */
    async _wvPeopleBuild(doc?: any): Promise<{ added: number; followed: number; queued: number }> {
        const P: any = this;
        await this._wvPeopleLoad();
        let radar: any = doc || null;
        if (!radar) {
            try {
                const r = await wvStoreRead(PathUtils.join(wvStoreDir(), "feeds", "alerts.json"), { onParseError: "keep", retries: 0 });
                radar = r.status === "ok" ? r.doc : null;
            } catch (e) {}
        }
        let feeds: string[] = [];
        try { const s = typeof P._wvFdSettingsGet === "function" ? await P._wvFdSettingsGet() : null; feeds = (s && s.followed) || []; } catch (e) {}
        const entries = wvPpFollowEntries(radar, feeds);
        const out = { added: 0, followed: 0, queued: 0 };
        const fresh: WvPpRecord[] = [];
        const touched: WvPpRecord[] = [];
        for (const e of entries) {
            let rec = e.openalex.length ? this._wvPeopleAllSync().find((r) => e.openalex.some((a) => wvPpRecordIs(r, { openalex: a }))) || null : null;
            if (!rec) {
                const byName = this._wvPeopleFindByName(e.last, e.first).filter((m) => m.match === "exact");
                // A name with ids of its own that differ is someone else.
                rec = byName.map((m) => m.rec).find((r) => !e.openalex.length || !wvPpIds(r, "openalex").length) || null;
            }
            if (rec) {
                if (!rec.followed) { rec.followed = true; out.followed++; touched.push(rec); }
                continue;
            }
            const r = wvPpNewRecord(this._wvPeopleNewID(), e.last, e.first);
            r.followed = true;
            const lines: WvPpLine[] = e.openalex.slice(0, MAX_PROFILES).map((a) => ({ fact: "openalex", value: a, source: "radar" as WvPpSource, url: WV_PP_WEB.openalex(a), status: "suggested" as const }));
            if (lines.length) wvPpMerge(r, lines, wvPpToday());
            P._wvPeopleDB.people.push(r);
            fresh.push(r);
            out.added++;
        }
        await this._wvPeopleSave(touched);
        const queue = fresh.filter((r) => wvPpIds(r, "openalex").length).map((r) => r.id);
        out.queued = queue.length;
        if (queue.length) this._wvPeopleBuildRun(queue);
        return out;
    }

    /** The background lookups of a Build: one person at a time, a pause
     *  between two, the state on the plugin for the tab's progress line. */
    _wvPeopleBuildRun(queue: string[]) {
        const P: any = this;
        if (P._wvPpBuild && P._wvPpBuild.running) { for (const id of queue) if (!P._wvPpBuild.queue.includes(id)) { P._wvPpBuild.queue.push(id); P._wvPpBuild.total++; } this._wvPeopleRenderAll(); return; }
        const st = { running: true, stop: false, queue: queue.slice(), done: 0, total: queue.length, errors: 0 };
        P._wvPpBuild = st;
        this._wvPeopleRenderAll();
        (async () => {
            while (st.queue.length && !st.stop) {
                const id = st.queue.shift() as string;
                const lp: any = live();
                if (!lp || lp._wvPpBuild !== st) break;
                try { const r = await lp._wvPeopleRefresh(id, { stop: st }); if (r.errors.length) st.errors++; }
                catch (e) { st.errors++; }
                st.done++;
                const lp2: any = live();
                if (lp2) lp2._wvPeopleRenderAll();
                if (st.queue.length && !st.stop) await new Promise((res) => wvTimeout(res, BUILD_GAP_MS));
            }
            st.running = false;
            const lp3: any = live();
            if (lp3) lp3._wvPeopleRenderAll();
        })().catch((e: any) => { st.running = false; Zotero.debug("[Weavero] people build err: " + e); });
    }

    _wvPeopleBuildStop() {
        const st = (this as any)._wvPpBuild;
        if (st) st.stop = true;
        this._wvPeopleRenderAll();
    }

    /** Build from an alerts file the user picks. */
    async _wvPeopleBuildFromFile(win: any): Promise<any> {
        try {
            const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
            const fp = new FilePicker();
            fp.init(win, wvStr("weavero-people-build-file-title", null, null), fp.modeOpen);
            fp.appendFilter("JSON", "*.json");
            const rv = await fp.show();
            if (rv !== fp.returnOK) return null;
            const doc = JSON.parse(await IOUtils.readUTF8(String(fp.file)));
            return await this._wvPeopleBuild(doc);
        } catch (e) { Zotero.debug("[Weavero] people build from file err: " + e); return null; }
    }

    // ---- the library ---------------------------------------------------------

    /** The library index (lib/people-list.ts WvPpLibIndex): every creator of
     *  your libraries by last name, and the items each one is on -- authored
     *  or not, thesis or not; the trash and the feeds left out. ONE read of
     *  `creators` and ONE of `itemCreators`, row by row as the database
     *  answers (MJT's library: ~18,700 items; plan point 7: never a scan per
     *  researcher at each draw). Read once, kept, read again a moment after
     *  items change (_wvPeopleLibWire). Concurrent callers share the read.
     *  Read-only: nothing is written to any library. */
    async _wvPeopleLibIndexBuild(): Promise<WvPpLibIndex | null> {
        const P: any = this;
        if (P._wvPpLibBuilding) return P._wvPpLibBuilding;
        P._wvPpLibBuilding = (async (): Promise<WvPpLibIndex | null> => {
            const ix = wvPpLibIndexNew();
            const feeds = new Set<number>();
            try { for (const l of Zotero.Libraries.getAll()) if (l.libraryType === "feed") feeds.add(l.libraryID); } catch (e) {}
            let thesisType = -1, authorType = -1;
            try { thesisType = Zotero.ItemTypes.getID("thesis"); } catch (e) {}
            try { authorType = Zotero.CreatorTypes.getID("author"); } catch (e) {}
            const primary = new Map<number, number>();
            const primaryOf = (t: number): number => {
                if (!primary.has(t)) {
                    let p = -1;
                    try { const v = Zotero.CreatorTypes.getPrimaryIDForType(t); if (typeof v === "number") p = v; } catch (e) {}
                    primary.set(t, p);
                }
                return primary.get(t) as number;
            };
            // Stale before the read: an item changed while it runs reads again.
            P._wvPpLibStale = false;
            await Zotero.DB.queryAsync("SELECT creatorID, lastName, firstName FROM creators /* wv-people-lib */", [], {
                onRow: (row: any) => { wvPpLibIndexCreator(ix, Number(row.getResultByIndex(0)), String(row.getResultByIndex(1) || ""), String(row.getResultByIndex(2) || "")); },
            });
            if (P._wvDestroyed) return null;
            await Zotero.DB.queryAsync("SELECT IC.creatorID, IC.itemID, IC.creatorTypeID, I.itemTypeID, I.libraryID FROM itemCreators IC JOIN items I USING (itemID)"
                + " WHERE IC.itemID NOT IN (SELECT itemID FROM deletedItems) /* wv-people-lib */", [], {
                onRow: (row: any) => {
                    if (feeds.has(Number(row.getResultByIndex(4)))) return;
                    const ct = Number(row.getResultByIndex(2)), it = Number(row.getResultByIndex(3));
                    wvPpLibIndexPair(ix, Number(row.getResultByIndex(0)), Number(row.getResultByIndex(1)), ct === authorType || ct === primaryOf(it), it === thesisType);
                },
            });
            if (P._wvDestroyed) return null;
            P._wvPpLibIx = { ix, ver: (P._wvPpLibIx ? P._wvPpLibIx.ver : 0) + 1 };
            P._wvPpLibMemo = new Map();
            this._wvPeopleLibWire();
            return ix;
        })().catch((e: any) => { Zotero.debug("[Weavero] people library index err: " + e); return null; })
            .finally(() => { P._wvPpLibBuilding = null; });
        const ix = await P._wvPpLibBuilding;
        if (ix) this._wvPeopleRenderAll();
        return ix;
    }

    /** Items changed: the index is read again LIB_REBUILD_MS later -- at once
     *  when a People tab is open, else at its next draw. Feed items aside. */
    _wvPeopleLibWire() {
        const P: any = this;
        if (P._wvPpItemObsID) return;
        try {
            P._wvPpItemObsID = Zotero.Notifier.registerObserver({
                notify: (event: string, type: string, ids: any[], extra: any) => {
                    try {
                        const lp: any = live();
                        if (!lp || type !== "item" || !lp._wvPpLibIx || !/^(add|modify|delete|trash|restore|move|refresh)$/.test(String(event))) return;
                        let feeds: Set<number> | null = null;
                        try { feeds = new Set(Zotero.Libraries.getAll().filter((l: any) => l.libraryType === "feed").map((l: any) => l.libraryID)); } catch (e) { feeds = null; }
                        if (feeds && feeds.size && (ids || []).length) {
                            const libOf = (id: any) => {
                                const x = extra && extra[id];
                                if (x && typeof x.libraryID === "number") return x.libraryID;
                                try { const it = Zotero.Items.get(id); return it ? it.libraryID : null; } catch (e) { return null; }
                            };
                            if ((ids || []).every((id: any) => feeds!.has(libOf(id)))) return;
                        }
                        lp._wvPpLibStale = true;
                        wvClearTimeout(lp._wvPpLibT);
                        lp._wvPpLibT = wvTimeout(() => {
                            const lp2: any = live();
                            if (!lp2) return;
                            lp2._wvPpLibT = null;
                            if (wvMainWins().some((w: any) => lp2._wvPeopleTabOf(w))) lp2._wvPeopleLibIndexBuild().catch(() => {});
                        }, LIB_REBUILD_MS);
                    } catch (e) {}
                },
            }, ["item"], "weavero-people-lib");
        } catch (e) { Zotero.debug("[Weavero] people library observer err: " + e); }
    }

    /** Each researcher's items in your libraries (authored, theses), from the
     *  index -- per researcher remembered until their name or the index
     *  changes. Null before the first read (which this starts). */
    _wvPeopleLibStats(): Map<string, WvPpLibStat> | null {
        const P: any = this;
        const cur = P._wvPpLibIx;
        if ((!cur || (P._wvPpLibStale && !P._wvPpLibT)) && !P._wvPpLibBuilding && !P._wvDestroyed) this._wvPeopleLibIndexBuild().catch(() => {});
        if (!cur) return null;
        if (!P._wvPpLibMemo) P._wvPpLibMemo = new Map();
        const memo: Map<string, { sig: string; stat: WvPpLibStat }> = P._wvPpLibMemo;
        const out = new Map<string, WvPpLibStat>();
        for (const r of this._wvPeopleAllSync()) {
            // The name, its other forms and the ones rejected decide the matches (people4).
            const sig = cur.ver + "|" + r.last + "|" + r.first + "|" + wvPpNameForms(r).join("\u0001") + "|" + wvPpRejectedForms(r).join("\u0001");
            let m = memo.get(r.id);
            if (!m || m.sig !== sig) { const s = wvPpLibStatOf(r, cur.ix); m = { sig, stat: { n: s.n, thesis: s.thesis } }; memo.set(r.id, m); }
            out.set(r.id, m.stat);
        }
        return out;
    }

    /** Every researcher's list facts (lib/people-list.ts wvPpInfos), worked out
     *  again only when a record changed. */
    _wvPeopleInfos(): Map<string, WvPpInfo> {
        const P: any = this;
        const all = this._wvPeopleAllSync();
        let sig = String(all.length);
        for (const r of all) sig += "|" + r.id + ":" + r.modified + ":" + r.last + ":" + r.first + ":" + r.lines.length + ":" + r.lines.map((l) => l.status.charAt(0)).join("");
        const m = P._wvPpInfoMemo;
        if (m && m.sig === sig) return m.infos;
        const infos = wvPpInfos(all);
        P._wvPpInfoMemo = { sig, infos };
        return infos;
    }

    /** Items of every library but feeds with an author whose name fits
     *  (offline; a name match, labelled so), any role. From the library
     *  index (read first when there is none yet); the database itself only
     *  when the index cannot be read. */
    async _wvPeopleItemsByName(last: string, first: string, rec?: WvPpRecord): Promise<number[]> {
        const P: any = this;
        // The researcher's record: its other forms count too, its rejected ones never (people4).
        const who = rec || { last, first };
        const ix: WvPpLibIndex | null = P._wvPpLibIx ? P._wvPpLibIx.ix : await this._wvPeopleLibIndexBuild();
        if (ix) return wvPpLibStatOf(who, ix, true).items || [];
        const rows = await Zotero.DB.queryAsync("SELECT creatorID, firstName, lastName FROM creators /* wv-people-lib */");
        const names = [{ last, first }, ...(rec ? wvPpNameForms(rec).map(wvPpSplitName) : [])];
        const refused = new Set(rec ? wvPpRejectedForms(rec).map(wvPpFormKey) : []);
        const cids: number[] = [];
        for (const r of rows || []) {
            try {
                const cl = String(r.lastName || ""), cf = String(r.firstName || "");
                if (refused.has(wvPpFold(cl) + "|" + wvPpFold(cf))) continue;
                if (names.some((n) => wvPpNameMatch(cl, cf, n.last, n.first))) cids.push(Number(r.creatorID));
            }
            catch (e) {}
        }
        const feeds = new Set<number>();
        try { for (const l of Zotero.Libraries.getAll()) if (l.libraryType === "feed") feeds.add(l.libraryID); } catch (e) {}
        const out = new Set<number>();
        for (let i = 0; i < cids.length; i += 400) {
            const part = cids.slice(i, i + 400);
            const rs = await Zotero.DB.queryAsync(
                "SELECT DISTINCT itemID, libraryID FROM itemCreators JOIN items USING (itemID) WHERE creatorID IN ("
                + part.map(() => "?").join(",") + ") AND itemID NOT IN (SELECT itemID FROM deletedItems) /* wv-people-lib */", part);
            for (const r of rs || []) if (!feeds.has(Number(r.libraryID))) out.add(Number(r.itemID));
        }
        return [...out];
    }

    /** Which of `works` the libraries hold, by Weavero's reference matcher
     *  (refs.ts: DOI, then title with the first author): work id -> item ids. */
    async _wvPeopleWorksInLib(works: WvPpWork[]): Promise<Map<string, number[]>> {
        const out = new Map<string, number[]>();
        const P: any = this;
        const ix = typeof P._wvRefsIndexEnsure === "function" ? await P._wvRefsIndexEnsure() : null;
        if (!ix) return out;
        for (const w of works) {
            const text = [w.authors.join(", "), w.year ? "(" + w.year + ")" : "", w.title, w.venue, w.doi ? "https://doi.org/" + w.doi : ""].filter(Boolean).join(". ");
            try {
                const hit = P._wvRefsMatchText(ix, text, { ids: [], dois: [], cts: [] }, null);
                if (hit && hit.ids && hit.ids.length) out.set(w.id, hit.ids.slice());
            } catch (e) {}
        }
        return out;
    }

    // ---- the author rows' right-click entries ---------------------------------

    _wvPeopleRegisterMenu() {
        const MM: any = (Zotero as any).MenuManager;
        if (!MM || typeof MM.registerMenu !== "function" || this._wvPeopleMenuID) return;
        const isCreator = (ctx: any) => /^creator-\d+-/.test(String((ctx && ctx.fieldName) || ""));
        const vis = (ctx: any, on: boolean) => { try { ctx.setVisible(on); } catch (e) {} };
        const showing = (act: string) => (_ev: any, ctx: any) => {
            try {
                const lp: any = live();
                const el = ctx && ctx.menuElem;
                if (el) el.setAttribute("data-wv-people-act", act);
                if (!lp || !lp._wvPeopleOn() || !isCreator(ctx)) { vis(ctx, false); return; }
                const c = lp._wvPeopleMenuCreator(ctx);
                if (!c || !c.last) { vis(ctx, false); return; }
                // The records are read at the first open; until then, Add.
                if (!lp._wvPeopleDB) lp._wvPeopleLoad().catch(() => {});
                const has = lp._wvPeopleFindByName(c.last, c.first).length > 0;
                if (act === "sep") vis(ctx, true);
                else vis(ctx, act === "show" ? has : !lp._wvPeopleFindByName(c.last, c.first).some((m: any) => m.match === "exact"));
            } catch (e) { vis(ctx, false); }
        };
        const command = (act: string) => (_ev: any, ctx: any) => {
            try { const lp: any = live(); if (lp) lp._wvPeopleFromMenu(ctx, act).catch((e: any) => Zotero.debug("[Weavero] people menu err: " + e)); }
            catch (e) { Zotero.debug("[Weavero] people menu err: " + e); }
        };
        const menus = [
            { menuType: "separator", onShowing: showing("sep") },
            // No icons: Zotero's own entries of this menu have none (Swap
            // First/Last, Fix Case, Move Up / Down).
            { menuType: "menuitem", l10nID: "weavero-people-menu-show", onShowing: showing("show"), onCommand: command("show") },
            { menuType: "menuitem", l10nID: "weavero-people-menu-add", onShowing: showing("add"), onCommand: command("add") },
        ];
        try {
            const id = wvMMRegister(MM, { menuID: MM_ROW_ID, pluginID: "weavero@mjthoraval", target: "itemPane/info/row", menus });
            this._wvPeopleMenuID = id || null;
            (this as any)._wvPeopleMenus = menus;
        } catch (e) { Zotero.debug("[Weavero] people menu register err: " + e); }
        // The tab menu of the People tab: Zotero offers "Show in Library" on
        // every tab but a library tab (tabs.js _openMenu), which selects the
        // tab's item -- the People tab has none. Hidden there; Zotero builds
        // the menu again at each opening. The entry itself never shows.
        try {
            const tabMenus = [{
                menuType: "menuitem",
                l10nID: "weavero-people-menu-show",
                onShowing: (_ev: any, ctx: any) => {
                    try {
                        ctx.setVisible(false);
                        const lp: any = live();
                        const el = ctx.menuElem, popup = el && el.parentNode;
                        const w = el && el.ownerDocument && el.ownerDocument.defaultView;
                        const t = w && tabIn(w, ctx.tabID);
                        if (!lp || !popup || !t || baseType(t) !== WV_PP_TAB_TYPE) return;
                        const sil = typeof lp._wvTabMenuFind === "function" ? lp._wvTabMenuFind(popup, "showInLibrary") : null;
                        if (sil) { wvSetBoolAttr(sil, "hidden", true); sil.setAttribute("data-wv-people-hidden", "true"); }
                    } catch (e) {}
                },
            }];
            this._wvPeopleTabMenuID = wvMMRegister(MM, { menuID: "weavero-people-tab", pluginID: "weavero@mjthoraval", target: "main/tab", menus: tabMenus }) || null;
        } catch (e) { Zotero.debug("[Weavero] people tab menu register err: " + e); }
    }

    _wvPeopleUnregisterMenu() {
        try {
            const MM: any = (Zotero as any).MenuManager;
            if (this._wvPeopleMenuID && MM && typeof MM.unregisterMenu === "function") MM.unregisterMenu(this._wvPeopleMenuID);
            if (this._wvPeopleTabMenuID && MM && typeof MM.unregisterMenu === "function") MM.unregisterMenu(this._wvPeopleTabMenuID);
        } catch (e) {}
        this._wvPeopleMenuID = null;
        this._wvPeopleTabMenuID = null;
        (this as any)._wvPeopleMenus = null;
    }

    /** The author a right-click menu was opened on (itemBox.js fills
     *  `fieldName` with "creator-N-…"). */
    _wvPeopleMenuCreator(ctx: any): { item: any; index: number; last: string; first: string } | null {
        try {
            const m = String(ctx.fieldName || "").match(/^creator-(\d+)-/);
            const item = ctx.items && ctx.items[0];
            const c = m && item ? item.getCreator(Number(m[1])) : null;
            return c ? { item, index: Number(m![1]), last: String(c.lastName || "").trim(), first: String(c.firstName || "").trim() } : null;
        } catch (e) { return null; }
    }

    async _wvPeopleFromMenu(ctx: any, act: string) {
        const c = this._wvPeopleMenuCreator(ctx);
        if (!c || !c.last) return;
        let win: any = null;
        try { win = ctx.menuElem.ownerDocument.defaultView; } catch (e) {}
        if (!win || !win.Zotero_Tabs) win = Zotero.getMainWindow();
        await this._wvPeopleLoad();
        if (act === "show") {
            const m = this._wvPeopleFindByName(c.last, c.first)[0];
            if (m) this._wvPeopleTabOpen(win, { personID: m.rec.id });
            return;
        }
        await this._wvPeopleAddFromItem(win, c.item, c.last, c.first);
    }

    /** "Add to People": a record for an author of `item` (the item it came
     *  from kept: its DOI finds the person's profile through the paper), the
     *  People tab on it, then the lookup -- the user's click is the consent.
     *  An exact name already there is that person: shown, not doubled. */
    async _wvPeopleAddFromItem(win: any, item: any, last: string, first: string): Promise<WvPpRecord | null> {
        await this._wvPeopleLoad();
        const have = this._wvPeopleFindByName(last, first).find((m) => m.match === "exact");
        if (have) { this._wvPeopleTabOpen(win, { personID: have.rec.id }); return have.rec; }
        let from: WvPpRecord["from"] | undefined;
        try {
            let title = "";
            try { title = String(item.getDisplayTitle() || ""); } catch (e) {}
            from = { lib: item.libraryID, key: item.key, title };
            const d = doiOf(item);
            if (d) from.doi = d;
        } catch (e) {}
        const rec = await this._wvPeopleCreate(last, first, { from });
        this._wvPeopleTabOpen(win, { personID: rec.id });
        this._wvPeopleRefreshFromTab(win, rec.id);
        return rec;
    }

    // ---- the People tab ----------------------------------------------------------

    _wvPeopleTabOf(win: any): any {
        try { return (win.Zotero_Tabs._tabs || []).find((t: any) => t && baseType(t) === WV_PP_TAB_TYPE) || null; } catch (e) { return null; }
    }

    _wvPeopleViewOf(win: any): WvPpView | null { return views.get(win) || null; }

    /** The window's People tab -- made the first time, at `index` -- selected
     *  unless `select` is false, on person `personID` when given. */
    _wvPeopleTabOpen(win: any, opts?: { personID?: string | null; select?: boolean; index?: number; edit?: boolean }): any {
        const o = opts || {};
        try {
            if (!this._wvPeopleOn()) return null;
            const Z: any = win && win.Zotero_Tabs;
            if (!Z || typeof Z.add !== "function") return null;
            const doc = win.document;
            wvInjectStyle(doc, STYLE_ID, CSS);
            let t = this._wvPeopleTabOf(win);
            if (!t) {
                const index = typeof o.index === "number" && o.index >= 0 ? Math.min(o.index, Z._tabs.length) : undefined;
                // `data.icon`: what the tab bar draws (tabs.js _update keeps it;
                // tabBar.jsx CSSItemTypeIcon) -- the person, from the sheet.
                const r = Z.add({ type: WV_PP_TAB_TYPE, title: wvStr("weavero-people-tab-title", null, null), data: { icon: WV_PP_TAB_TYPE }, index, select: false });
                t = tabIn(win, r && r.id);
                if (!t) return null;
                const box = r.container || doc.getElementById(r.id);
                if (box) box.setAttribute("data-wv-people", "true");
                views.set(win, { tabID: t.id, sel: null, filter: this._wvPeoplePrefShow(), ff: this._wvPeoplePrefFilters(),
                    q: "", wk: worksViewNew(), editing: null, works: new Map(), view: "table", fix: null, checked: new Set<string>() });
                this._wvPeopleWireNotifier();
            }
            this._wvPeopleWireSelect(win);
            const v = views.get(win) as WvPpView;
            if (v) v.tabID = t.id;
            if (o.personID && v) { v.sel = o.personID; v.editing = null; }
            // `edit`: the page in its edit mode (the specs, the table's pencil).
            if (o.personID && v && o.edit) { v.pageEdit = true; v.pageEditFor = o.personID; }
            this._wvPeopleTabRender(win);
            this._wvPeopleLoad().then(() => { const lp: any = live(); if (lp) lp._wvPeopleTabRender(win); }).catch(() => {});
            if (o.select !== false && Z.selectedID !== t.id) Z.select(t.id);
            else if (o.select !== false) this._wvPeoplePaneOff(win);
            this._wvPeopleTabsPersistSoon();
            return t;
        } catch (e) { Zotero.debug("[Weavero] people tab open err: " + e); return null; }
    }

    _wvPeopleTabClose(win: any) {
        const t = this._wvPeopleTabOf(win);
        if (t) {
            try { win.Zotero_Tabs.close(t.id, { skipHistory: true }); } catch (e) {}
        }
        this._wvPeoplePaneMark(win, false);
        try { const deck = win && win.document && win.document.getElementById("tabs-deck"); if (deck) wvUnlisten(deck, SELCHANGE_KEY); } catch (e) {}
        dropView(win);
    }

    // ---- the list's choices: name orders, sort, chip, filters ------------------------

    /** How `place` (list, title, links, tree) writes a name: "last" ("Last,
     *  First", the default) or "first". */
    _wvPeopleNameOrder(place: string): WvPpNameOrder {
        if (!NAME_PLACES.includes(place)) return "last";
        try { return Zotero.Prefs.get("weavero.people.names." + place) === "first" ? "first" : "last"; } catch (e) { return "last"; }
    }

    _wvPeoplePrefShow(): "check" | "followed" | "all" {
        let v = "";
        try { v = String(Zotero.Prefs.get(PREF_SHOW) || ""); } catch (e) {}
        return v === "check" || v === "followed" ? v : "all";
    }

    _wvPeoplePrefFilters(): WvPpFilters {
        try { return wvPpFiltersParse(String(Zotero.Prefs.get(PREF_FILTERS) || "{}")); } catch (e) { return {}; }
    }

    /** The view To check / Followed / Researchers (all) in `win`, the table
     *  shown; saved. */
    _wvPeopleSetShow(win: any, show: string) {
        const s: "check" | "followed" | "all" = show === "check" || show === "followed" ? show : "all";
        const v = views.get(win);
        if (v) { v.filter = s; v.fix = null; if (v.view !== "table" && !v.sel) v.view = "table"; }
        try { Zotero.Prefs.set(PREF_SHOW, s); } catch (e) {}
        this._wvPeopleTabRender(win);
    }

    /** A filter of `win`'s list set outright: a toggle included (`true`),
     *  excluded ("out") or off; a value filter's values -- one value ("" =
     *  Unknown) or a list, included -- or off (null / undefined). Saved. */
    _wvPeopleSetFilter(win: any, key: string, value: any) {
        const v = views.get(win);
        const ff: any = wvPpFiltersParse(v ? v.ff : this._wvPeoplePrefFilters());
        const not: any = ff.not || {};
        if (!isToggle(key) && !isMenu(key)) return;
        delete ff[key]; delete not[key];
        if (isToggle(key)) { if (value === true) ff[key] = true; else if (value === "out") not[key] = true; }
        else if (typeof value === "string") ff[key] = [value];
        else if (Array.isArray(value)) ff[key] = value.filter((x: any) => typeof x === "string");
        if (Object.keys(not).length) ff.not = not; else delete ff.not;
        this._wvPeopleSaveFilters(win, wvPpFiltersParse(ff));
    }

    /** A chip of the funnel clicked (people4): a click includes -- or clears
     *  an included chip --, Alt+click excludes -- or clears an excluded one
     *  (lib/people-list.ts wvPpFilterClick). A toggle: `value` null. Saved. */
    _wvPeopleFilterClick(win: any, key: string, value: string | null, alt: boolean) {
        if (!isToggle(key) && !isMenu(key)) return;
        const v = views.get(win);
        this._wvPeopleSaveFilters(win, wvPpFilterClick(v ? v.ff : this._wvPeoplePrefFilters(), key, isMenu(key) ? String(value == null ? "" : value) : null, !!alt));
    }

    _wvPeopleClearFilters(win: any) { this._wvPeopleSaveFilters(win, {}); }

    _wvPeopleSaveFilters(win: any, ff: WvPpFilters) {
        const v = views.get(win);
        if (v) v.ff = ff;
        try { Zotero.Prefs.set(PREF_FILTERS, JSON.stringify(ff)); } catch (e) {}
        this._wvPeopleTabRender(win);
    }

    /** The pane put away -- or the window's mark taken off -- IN Zotero's tab
     *  switch, before it is painted. The tab notifier is asynchronous: its
     *  observers after the first run in later microtasks, after any that
     *  awaits, and the pane-off waited one more timeout on top; the switch to
     *  the People tab was painted with the last reader's item pane beside it,
     *  and the switch back with no pane (MJT 2026-11-24, "it keeps the item
     *  pane for a short time before showing it correctly"). Zotero's select
     *  (tabs.js, 10.0.8 and 11) ends with the new tab content's
     *  `onTabSelectionChanged(true)`, a "tab-selection-change" event on its
     *  `tab-content`, the People tab's too; it does not bubble, a capture
     *  listener on the deck hears it -- for every select, the tab bar's
     *  included, which calls a `select` bound at Zotero's init and passes no
     *  wrap of `Zotero_Tabs.select` (tab-split.ts, item 18). The notifier
     *  stays the fallback. Guard: test/people-pane-sync.spec.js. */
    _wvPeopleWireSelect(win: any) {
        try {
            const deck = win && win.document && win.document.getElementById("tabs-deck");
            if (!deck) return;
            wvListen(deck, SELCHANGE_KEY, "tab-selection-change", (e: any) => {
                try {
                    if (!e || !e.detail || !e.detail.selected) return;
                    const lp: any = live();
                    if (!lp || lp._wvDestroyed) return;
                    const t = lp._wvPeopleTabOf(win);
                    if (t && win.Zotero_Tabs.selectedID === t.id) lp._wvPeoplePaneOff(win);
                    else lp._wvPeoplePaneMark(win, false);
                } catch (er) {}
            }, true, (this as any)._wvWireTag());
        } catch (e) { Zotero.debug("[Weavero] people select wire err: " + e); }
    }

    /** The People tab selected: Zotero's context pane put away, as Zotero
     *  does for a library tab (contextPane.js _handleTabSelect), which it does
     *  not for a tab type it does not know -- the last reader's item pane
     *  stayed beside the People view. Beside a reader or a note in a split,
     *  the split view shows that side's item instead (tab-split.ts). */
    _wvPeoplePaneOff(win: any) {
        try {
            const Z: any = win && win.Zotero_Tabs;
            const t = Z && tabIn(win, Z.selectedID);
            if (!t || baseType(t) !== WV_PP_TAB_TYPE) return;
            const P: any = this;
            const doc = win.document;
            try {
                const s = typeof P._wvTabSplitShownOf === "function" ? P._wvTabSplitShownOf(win, t.id) : null;
                if (s && s.right && !s.picker) {
                    const ot = tabIn(win, s.left === t.id ? s.right : s.left);
                    if (ot && Z.hasContextPane(baseType(ot))) { this._wvPeoplePaneMark(win, false); P._wvTabSplitContextPane(win); return; }
                }
            } catch (e) {}
            const CP: any = win.ZoteroContextPane;
            const sp = (CP && CP.splitter) || doc.getElementById("zotero-context-splitter");
            const pane = doc.getElementById("zotero-context-pane");
            if (sp) wvSetBoolAttr(sp, "hidden", true);
            if (pane) wvSetBoolAttr(pane, "collapsed", true);
            const inner: any = doc.getElementById("zotero-context-pane-inner");
            if (inner && inner._sidenav) inner._sidenav.hidden = true;
            try { if (CP && typeof CP.showLoadingMessage === "function") CP.showLoadingMessage(false); } catch (e) {}
            // Zotero 9/10's ZoteroContextPane.update() lays the pane out for any
            // tab but the library -- its splitter shown again at every select and
            // window resize --, so the pane is also kept off by the window's mark
            // (the sheet), taken off as soon as another tab is selected.
            this._wvPeoplePaneMark(win, true);
        } catch (e) { Zotero.debug("[Weavero] people pane err: " + e); }
    }

    /** The window's mark that keeps Zotero's context pane off while its People
     *  tab is selected alone (the sheet's rule). */
    _wvPeoplePaneMark(win: any, on: boolean) {
        try {
            const de = win && win.document && win.document.documentElement;
            if (!de) return;
            if (on) { if (!de.hasAttribute("wv-people-paneoff")) de.setAttribute("wv-people-paneoff", "true"); }
            else if (de.hasAttribute("wv-people-paneoff")) de.removeAttribute("wv-people-paneoff");
        } catch (e) {}
    }

    /** One tab observer: the selected People tab puts the context pane away
     *  (the fallback: _wvPeopleWireSelect does it in Zotero's switch itself);
     *  tabs opened, closed or selected re-record the People tabs; tabs coming
     *  back let a recorded People tab find its window. */
    _wvPeopleWireNotifier() {
        const P: any = this;
        if (P._wvPpObserverID) return;
        try {
            P._wvPpObserverID = Zotero.Notifier.registerObserver({
                notify: (action: string, type: string) => {
                    try {
                        const lp: any = live();
                        if (!lp || type !== "tab") return;
                        if (action === "select") {
                            for (const w of wvMainWins()) {
                                const t = lp._wvPeopleTabOf(w);
                                if (t && w.Zotero_Tabs.selectedID === t.id) w.setTimeout(() => { const lp2: any = live(); if (lp2) lp2._wvPeoplePaneOff(w); }, 0);
                                else lp._wvPeoplePaneMark(w, false);
                            }
                        }
                        if (action === "close") {
                            for (const w of wvMainWins()) if (views.has(w) && !lp._wvPeopleTabOf(w)) dropView(w);
                        }
                        if (action === "add" || action === "close" || action === "select") lp._wvPeopleTabsPersistSoon();
                        if (action === "add") lp._wvPeopleTabsRestoreSoon(1000);
                    } catch (e) {}
                },
            }, ["tab"], "weavero-people");
        } catch (e) { Zotero.debug("[Weavero] people notifier err: " + e); }
    }

    // ---- the tab across restarts ------------------------------------------------

    _wvPeopleTabsPath(): string { return PathUtils.join(wvStoreDir(), TABS_FILE); }

    /** Every window's People tab, by what the window holds; and the records
     *  still waiting for their window. `now`: write at once (destroy). */
    _wvPeopleTabsPersist(now?: boolean) {
        const P: any = this;
        try {
            if (!now && (P._wvQuitting || P._wvDestroyed)) return;
            try { if (Services.startup.shuttingDown) return; } catch (e) {}
            // Never before the recorded tabs are read (_wvPeopleTabsLoad): an
            // instance stopped in that window -- an install, then a reload a
            // second later, the read waiting for the update backup -- wrote
            // "no tab" over the record, and the tab never came back (MJT
            // 2026-11-23, 1.3.0-dev.76: "A Researcher tab is not recovered
            // after installing Weavero").
            if (!P._wvPpTabsRead) return;
            const tabs: any[] = [];
            for (const w of wvMainWins()) {
                const t = this._wvPeopleTabOf(w);
                if (!t) continue;
                const Z = w.Zotero_Tabs;
                const v = views.get(w);
                // `pin`: Zotero's pin (Zotero 11's setPinned fires no notifier, so
                // the record follows at the next tab event or at Weavero's stop).
                tabs.push({ w: fingerprintOf(w), i: Z._tabs.indexOf(t), sel: Z.selectedID === t.id, p: (v && v.sel) || null, pin: t.pinned ? true : undefined });
            }
            for (const r of this._wvPeopleTabsPending()) tabs.push(r);
            const doc = { v: 1, tabs };
            const json = JSON.stringify(doc);
            if (json === P._wvPpTabsLast) return;
            P._wvPpTabsLast = json;
            wvStoreWrite(this._wvPeopleTabsPath(), doc, { pretty: null });
        } catch (e) { Zotero.debug("[Weavero] people tabs persist err: " + e); }
    }

    _wvPeopleTabsPersistSoon() {
        const P: any = this;
        if (P._wvQuitting || P._wvDestroyed) return;
        wvClearTimeout(P._wvPpTabsPersistT);
        P._wvPpTabsPersistT = wvTimeout(() => {
            const lp: any = live();
            if (!lp) return;
            lp._wvPpTabsPersistT = null;
            lp._wvPeopleTabsPersist();
        }, 800);
    }

    /** The recorded tabs, read once at the start (or the re-enable), kept for
     *  90 s while their windows come back. */
    async _wvPeopleTabsLoad() {
        const P: any = this;
        if (P._wvPpTabsPending) return;
        P._wvPpTabsPending = [];
        const r = await wvStoreRead(this._wvPeopleTabsPath(), { retries: 0, onParseError: "keep" });
        if (P._wvDestroyed) return;
        const recs = r.status === "ok" && r.doc && Array.isArray(r.doc.tabs) ? r.doc.tabs.filter((x: any) => x && Array.isArray(x.w)) : [];
        P._wvPpTabsPending = recs;
        P._wvPpTabsRead = true;
        P._wvPpTabsUntil = Date.now() + TABS_PENDING_MS;
        if (recs.length) {
            const tries = (n: number) => {
                const lp: any = live();
                if (!lp) return;
                lp._wvPeopleTabsRestoreAll();
                if (n < 20 && lp._wvPeopleTabsPending().length) wvTimeout(() => tries(n + 1), 2000);
            };
            wvTimeout(() => tries(0), 1500);
        }
    }

    _wvPeopleTabsPending(): any[] {
        const P: any = this;
        if (!Array.isArray(P._wvPpTabsPending)) return [];
        if (Date.now() > (P._wvPpTabsUntil || 0)) P._wvPpTabsPending = [];
        return P._wvPpTabsPending;
    }

    _wvPeopleTabsRestoreSoon(ms: number) {
        const P: any = this;
        if (!this._wvPeopleTabsPending().length) return;
        wvClearTimeout(P._wvPpTabsRestoreT);
        P._wvPpTabsRestoreT = wvTimeout(() => { const lp: any = live(); if (lp) { lp._wvPpTabsRestoreT = null; lp._wvPeopleTabsRestoreAll(); } }, ms);
    }

    /** Each recorded tab into the window that holds best what its window
     *  held (at least 80 % of it), at its place, selected as it was; then a
     *  split it was a side of can form again (tab-split.ts). */
    _wvPeopleTabsRestoreAll() {
        const P: any = this;
        try {
            if (!this._wvPeopleOn() || P._wvTabGroupRestoreGuard) { if (P._wvTabGroupRestoreGuard) this._wvPeopleTabsRestoreSoon(1500); return; }
            const recs = this._wvPeopleTabsPending();
            if (!recs.length) return;
            const wins = wvMainWins().filter((w: any) => !w.closed && w.Zotero_Tabs);
            const fps = new Map<any, string[]>(wins.map((w: any) => [w, fingerprintOf(w)]));
            let made = false;
            for (const rec of recs.slice()) {
                let best: any = null, bestScore = 0;
                for (const w of wins) {
                    const s = fpScore(rec.w, fps.get(w) || []);
                    if (s > bestScore) { best = w; bestScore = s; }
                }
                if (!best || bestScore < FP_MIN) continue;
                recs.splice(recs.indexOf(rec), 1);
                if (this._wvPeopleTabOf(best)) continue;
                this._wvPeopleTabOpen(best, { index: Number(rec.i), select: !!rec.sel, personID: typeof rec.p === "string" ? rec.p : null });
                // Pinned again, at its place among the pins (MJT 2026-11-25: an
                // install unpinned the Researchers tab he had just pinned).
                if (rec.pin) {
                    try {
                        const Z = best.Zotero_Tabs, t = this._wvPeopleTabOf(best);
                        if (t && !t.pinned && typeof Z.setPinned === "function") {
                            Z.setPinned(t.id, true);
                            if (Number.isInteger(Number(rec.i))) Z.move(t.id, Number(rec.i));
                        }
                    } catch (e) {}
                }
                made = true;
                try { if (typeof P._wvTabSplitRestore === "function") P._wvTabSplitRestore(best); } catch (e) {}
            }
            if (made) this._wvPeopleTabsPersistSoon();
        } catch (e) { Zotero.debug("[Weavero] people tabs restore err: " + e); }
    }

    // ---- drawing -------------------------------------------------------------------

    _wvPeopleRenderAll() {
        const P: any = this;
        if (P._wvPpRenderPending) return;
        P._wvPpRenderPending = true;
        Promise.resolve().then(() => {
            const lp: any = live() || P;
            lp._wvPpRenderPending = false;
            P._wvPpRenderPending = false;
            for (const w of wvMainWins()) { try { if (lp._wvPeopleTabOf(w)) lp._wvPeopleTabRender(w); } catch (e) {} }
        });
    }

    /** The whole tab: the left pane (people-table.ts), the table or a record in
     *  the centre. The scroll positions and the focus are kept across a redraw
     *  (the table itself is not drawn again: its box moves into the new centre). */
    _wvPeopleTabRender(win: any) {
        const t = this._wvPeopleTabOf(win);
        const v = views.get(win);
        if (!t || !v) return;
        const doc = win.document;
        const box = doc.getElementById(t.id);
        if (!box) return;
        box.setAttribute("data-wv-people", "true");
        // The publications' funnel popup belongs to the list the redraw replaces.
        this._wvPeopleWorksFunnelClose(win);
        const rootID = "wv-pp-root-" + t.id;
        let root = doc.getElementById(rootID);
        const keep: any = {};
        if (root) {
            for (const k of ["wv-pp-nav", "wv-pp-main", "wv-pp-pane"]) { const el = root.querySelector("." + k); if (el) keep[k] = el.scrollTop; }
            const ae = doc.activeElement;
            if (ae && root.contains(ae) && ae.getAttribute("data-wv-pp-focus")) keep.focus = { key: ae.getAttribute("data-wv-pp-focus"), s: ae.selectionStart, e: ae.selectionEnd };
            // The table had the keys (Space, Escape...): it gets them back.
            else if (ae && root.contains(ae) && ae.closest && ae.closest("#" + WV_PP_TABLE_ID)) keep.table = true;
            root.remove();
        }
        root = wvHtmlEl(doc, "div", "wv-pp-root", undefined, box);
        root.id = rootID;
        root.setAttribute("data-wv-tag", (this as any)._wvWireTag());
        const side = wvHtmlEl(doc, "div", "wv-pp-side", undefined, root);
        const main = wvHtmlEl(doc, "div", "wv-pp-main", undefined, root);
        this._wvPeopleRenderNav(win, side, v);
        this._wvPeopleRenderMain(win, main, v);
        // The details pane beside the table (people-pane.ts); a page, the queue
        // and the duplicates take the whole width.
        if (!v.sel && (!v.view || v.view === "table")) this._wvPeopleRenderPaneBox(win, root, v);
        for (const k of ["wv-pp-nav", "wv-pp-main", "wv-pp-pane"]) { const el = root.querySelector("." + k); if (el && keep[k]) el.scrollTop = keep[k]; }
        if (keep.focus) {
            const el = root.querySelector("[data-wv-pp-focus='" + keep.focus.key + "']");
            if (el) { try { el.focus(); if (keep.focus.s != null && typeof el.setSelectionRange === "function") el.setSelectionRange(keep.focus.s, keep.focus.e); } catch (e) {} }
        }
        else if (keep.table) {
            const el = root.querySelector("#" + WV_PP_TABLE_ID);
            if (el) { try { el.focus(); } catch (e) {} }
        }
    }

    /** "+ Add a researcher": ask for the name; a researcher of exactly that name
     *  opens; else a new one (marked To check) opens and Refresh lists OpenAlex's
     *  profiles of the name, for the user to pick (`name`: the specs give it). */
    async _wvPeopleAddByName(win: any, name?: string): Promise<WvPpRecord | null> {
        let typed = name;
        if (typed == null) {
            const val: any = { value: "" };
            let ok = false;
            // What the click does, the network part too, now that the toolbar's
            // icon says only "Add a researcher" (1.3.0-peoplenet.16).
            const text = wvStr("weavero-people-add-researcher-tip", null, null) + "\n\n" + wvStr("weavero-people-add-researcher-prompt", null, null);
            try { ok = Services.prompt.prompt(win, wvStr("weavero-people-add-researcher", null, null), text, val, null, {}); } catch (e) {}
            if (!ok) return null;
            typed = String(val.value || "");
        }
        const { last, first } = wvPpSplitName(typed);
        if (!last) return null;
        await this._wvPeopleLoad();
        const same = this._wvPeopleFindByName(last, first).find((m) => m.match === "exact");
        if (same) { this._wvPeopleTabOpen(win, { personID: same.rec.id }); return same.rec; }
        const rec = await this._wvPeopleCreate(last, first);
        rec.check = true;
        await this._wvPeopleSave([rec]);
        this._wvPeopleTabOpen(win, { personID: rec.id });
        const vv = views.get(win);
        if (vv) { vv.sel = rec.id; vv.q = ""; }
        this._wvPeopleTabRender(win);
        this._wvPeopleRefreshFromTab(win, rec.id).catch((e: any) => Zotero.debug("[Weavero] people add refresh err: " + e));
        return rec;
    }

    async _wvPeopleBuildFromTab(win: any, fromFile: boolean) {
        const P: any = this;
        P._wvPpBuildMsg = "";
        const r = fromFile ? await this._wvPeopleBuildFromFile(win) : await this._wvPeopleBuild();
        if (!r) { this._wvPeopleRenderAll(); return; }
        P._wvPpBuildMsg = r.added || r.followed
            ? wvStr("weavero-people-build-done", { added: r.added, followed: r.followed, queued: r.queued }, null)
            : wvStr("weavero-people-build-none", null, null);
        const v = views.get(win);
        if (v && r.added) this._wvPeopleSetShow(win, "check");
        this._wvPeopleRenderAll();
    }

    /** A menu under its chip or button (the publications' sort, a value's
     *  actions): built anew at each opening, its anchor's tooltip set aside while
     *  it is open (src-ts.md: a dropdown Weavero opens keeps its anchor's title
     *  off it). */
    _wvPeopleOpenMenu(win: any, anchor: any, id: string, fill: (pop: any) => void) {
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
            const tip = anchor ? anchor.getAttribute("title") : null;
            if (anchor) {
                anchor.removeAttribute("title");
                anchor.setAttribute("data-wv-pp-menu-open", "true");
                anchor.setAttribute("aria-expanded", "true");
            }
            pop.addEventListener("popuphidden", (e: any) => {
                if (e.target !== pop) return;
                try {
                    if (anchor) {
                        anchor.removeAttribute("data-wv-pp-menu-open");
                        anchor.setAttribute("aria-expanded", "false");
                        if (tip) anchor.setAttribute("title", tip);
                    }
                } catch (er) {}
                try { pop.remove(); } catch (er) {}
            });
            pop.openPopup(anchor, "after_start", 0, 2, false, false);
            return pop;
        } catch (e) { Zotero.debug("[Weavero] people menu err: " + e); return null; }
    }

    /** The centre: the record selected, else the view of the left pane -- the
     *  table (people-table.ts), the suggested links or the duplicates. */
    _wvPeopleRenderMain(win: any, main: any, v: WvPpView) {
        const doc = win.document;
        const rec = this._wvPeopleGetRec(v.sel);
        if (!rec && v.view !== "queue" && v.view !== "dupes") { this._wvPeopleRenderTable(win, main, v); return; }
        // The table's box is kept aside for the way back.
        this._wvPeopleTableDetach(win);
        if (!rec) {
            if (v.view === "queue") this._wvPeopleRenderQueue(win, main, v);
            else this._wvPeopleRenderDupesView(win, main);
            return;
        }
        main.setAttribute("data-wv-pp-record", rec.id);
        // The edit mode belongs to the record it was turned on for: another
        // record opens in the view mode (it remembers nothing).
        if (v.pageEdit && v.pageEditFor !== rec.id) v.pageEdit = false;
        main.setAttribute("data-wv-pp-mode", v.pageEdit ? "edit" : "view");
        const P: any = this;
        const busy = !!(P._wvPeopleBusy && P._wvPeopleBusy.has(rec.id));
        const head = wvHtmlEl(doc, "div", "wv-pp-head", undefined, main);
        // Back to the table (the Google Contacts design, MJT 2026-11-25).
        const back = wvHtmlEl(doc, "button", "wv-pp-back", "\u2190", head);
        back.setAttribute("type", "button");
        back.setAttribute("data-wv-pp-act", "back");
        back.setAttribute("title", wvStr("weavero-people-back", null, null));
        back.setAttribute("aria-label", wvStr("weavero-people-back", null, null));
        back.addEventListener("click", () => {
            const lp: any = live(); const vv = views.get(win);
            if (!lp || !vv) return;
            vv.sel = null; vv.editing = null; vv.nameEdit = null; vv.evEdit = null;
            vv.pageEdit = false; vv.evForm = null; vv.linkDraft = null;
            lp._wvPeopleTabRender(win);
            lp._wvPeopleTabsPersistSoon();
        });
        // Their initials in a coloured circle, as the table shows them.
        const hav = wvHtmlEl(doc, "span", "wv-pp-avatar wv-pp-havatar", wvPpInitials(rec.last, rec.first), head);
        hav.setAttribute("aria-hidden", "true");
        hav.style.setProperty("--wv-pp-hue", String(this._wvPeopleHue(rec.last + " " + rec.first)));
        // The name, or its two fields while it is edited (people4).
        if (v.nameEdit && v.nameEdit.id === rec.id) this._wvPeopleRenderNameEditor(win, head, v);
        else {
            const nm = wvHtmlEl(doc, "span", "wv-pp-name", wvPpNameAs(rec, this._wvPeopleNameOrder("title")), head);
            nm.setAttribute("role", "button");
            nm.setAttribute("tabindex", "0");
            nm.setAttribute("data-wv-pp-focus", "name-title");
            nm.setAttribute("title", wvStr("weavero-people-name-edit-tip", null, null));
            nm.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleNameEditStart(win); });
            nm.addEventListener("keydown", (e: any) => {
                if (e.key !== "Enter" && e.key !== " " && e.key !== "F2") return;
                e.preventDefault(); e.stopPropagation();
                const lp: any = live(); if (lp) lp._wvPeopleNameEditStart(win);
            });
            // A name the user typed: theirs, as their values of the facts are
            // (a source mark: the edit mode's).
            if (rec.nameBy === "me" && v.pageEdit) {
                const me = wvHtmlEl(doc, "span", "wv-pp-src wv-pp-namesrc", srcName("me"), head);
                me.setAttribute("data-source", "me");
                me.setAttribute("data-status", "chosen");
                me.setAttribute("data-wv-pp-namesrc", "me");
                me.setAttribute("title", wvStr("weavero-people-name-mine-tip", null, null));
            }
        }
        // The header's actions, compact as the table's row actions (MJT
        // 2026-11-26): the star (Follow), the pencil (the edit mode), ⋮ (Refresh,
        // Mark as checked or to check, Remove); in the edit mode Done -- and
        // Cancel while something typed is not saved yet -- in the pencil's place.
        const acts = wvHtmlEl(doc, "div", "wv-pp-actions", undefined, head);
        const textBtn = (act: string, id: string, fn: () => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr(id, null, null), acts);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-act", act);
            b.addEventListener("click", () => { try { fn(); } catch (e) {} });
            return b;
        };
        this._wvPeopleHeadIcons(win, acts, rec, busy, () => { const lp: any = live(); if (lp) lp._wvPeoplePageEdit(win, true); }, v.pageEdit ? () => {
            if (this._wvPeoplePageStaged(win, true)) textBtn("page-cancel", "weavero-common-cancel", () => { const lp: any = live(); if (lp) lp._wvPeoplePageEdit(win, false, "cancel"); });
            textBtn("page-done", "weavero-people-page-done", () => { const lp: any = live(); if (lp) lp._wvPeoplePageEdit(win, false, "done").catch(() => {}); }).classList.add("wv-pp-done");
        } : null);
        // Under the name: the position and the institution shown.
        const sub = [wvPpShown(rec, "position")[0], wvPpShown(rec, "institution")[0]].filter(Boolean).map((s: any) => String(s.value || "")).filter(Boolean);
        if (sub.length) wvHtmlEl(doc, "div", "wv-pp-hsub", sub.join(" · "), main);
        if (rec.from) {
            const f = wvHtmlEl(doc, "div", "wv-pp-sub", wvStr("weavero-people-added-from", { title: rec.from.title || rec.from.key }, null), main);
            f.setAttribute("data-wv-pp-from", rec.from.key);
        }
        const status = P._wvPpStatus && P._wvPpStatus.get(rec.id);
        const sl = wvHtmlEl(doc, "div", "wv-pp-status", status ? status.text : "", main);
        sl.hidden = !status;
        if (status) sl.setAttribute("data-kind", status.kind);
        const cands: WvPpCandidate[] | null = P._wvPpCands && P._wvPpCands.get(rec.id);
        if (cands) this._wvPeopleRenderCandidates(win, main, rec, cands);
        // The Google Contacts design (MJT 2026-11-25): rounded cards in two
        // columns -- Identifiers, Career, Contact and the custom fields on the
        // left; the academic family (Links) and the Events on the right -- one
        // column when the side is narrow (a container query). The tree, the
        // publications and the notes take the whole width under them.
        const cols = wvHtmlEl(doc, "div", "wv-pp-cols", undefined, main);
        const left = wvHtmlEl(doc, "div", "wv-pp-col", undefined, cols);
        left.setAttribute("data-wv-pp-col", "left");
        const right = wvHtmlEl(doc, "div", "wv-pp-col", undefined, cols);
        right.setAttribute("data-wv-pp-col", "right");
        // Identifiers, then the other forms of the name (people4: "Other names").
        this._wvPeopleRenderFactSec(win, left, rec, v, "weavero-people-sec-ids", [...WV_PP_ID_KEYS, WV_PP_NAME_FACT], "ids");
        if (v.pageEdit && !WV_PP_ID_KEYS.some((k) => wvPpShown(rec, k).length)) {
            const ids = left.querySelector("[data-wv-pp-sec='ids']");
            wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-no-ids", null, null), ids || left);
        }
        this._wvPeopleRenderFactSec(win, left, rec, v, "weavero-people-sec-facts", FACTS_SHOWN, "facts");
        (this as any)._wvPeopleRenderContact(win, left, rec);
        (this as any)._wvPeopleRenderCustom(win, left, rec);
        (this as any)._wvPeopleRenderTagsSec(win, left, rec, v);
        this._wvPeopleRenderLinks(win, right, rec, v);
        this._wvPeopleRenderEvents(win, right, rec, v);
        this._wvPeopleRenderTree(win, main, rec);
        this._wvPeopleRenderWorks(win, main, rec, v);
        // Notes.
        const ns = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        ns.setAttribute("data-wv-pp-sec", "notes");
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-sec-notes", null, null), ns);
        const ta = wvHtmlEl(doc, "textarea", "wv-pp-notes", undefined, ns);
        ta.setAttribute("data-wv-pp-focus", "notes");
        ta.setAttribute("placeholder", wvStr("weavero-people-notes", null, "placeholder"));
        ta.value = rec.notes;
        ta.addEventListener("input", () => {
            const lp: any = live();
            if (!lp) return;
            rec.notes = ta.value;
            wvClearTimeout(lp._wvPpSaveT);
            // Saved a moment after the typing stops, without a redraw (the
            // text being typed stays as it is).
            lp._wvPpSaveT = wvTimeout(() => { const lp2: any = live(); if (lp2) { lp2._wvPpSaveT = null; lp2._wvPeopleSaveQuiet([rec]); } }, 600);
        });
    }

    /** A researcher's header actions, as icons (the page and the right pane,
     *  people-pane.ts): the star (Follow), the pencil (`onEdit`) -- or, in the
     *  page's edit mode, what `mid` draws in its place (Done, Cancel) --, ⋮
     *  (Refresh, Mark as checked or to check, Remove). */
    _wvPeopleHeadIcons(win: any, acts: any, rec: WvPpRecord, busy: boolean, onEdit: () => void, mid?: (() => void) | null) {
        const doc = win.document;
        const icon = (act: string, text: string, tip: string, fn: (b: any) => void, pressed?: boolean) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-ract wv-pp-hact", text, acts);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-act", act);
            b.setAttribute("title", tip);
            b.setAttribute("aria-label", tip);
            if (pressed != null) b.setAttribute("aria-pressed", pressed ? "true" : "false");
            b.addEventListener("click", () => { try { fn(b); } catch (e) {} });
            return b;
        };
        icon("follow", rec.followed ? "★" : "☆", wvStr("weavero-people-row-act", { act: rec.followed ? "unfollow" : "follow" }, null),
            () => { const lp: any = live(); if (lp) lp._wvPeopleSetFlag(rec.id, "followed", !rec.followed).catch(() => {}); }, !!rec.followed).classList.add("wv-pp-star");
        // The Edit pencil (MJT 2026-11-25, "Edit pencil in the header"): every
        // field, the empty ones with their Add, the sources, every control.
        if (mid) mid();
        else icon("page-edit", "✎", wvStr("weavero-people-row-act", { act: "edit" }, null), () => { try { onEdit(); } catch (e) {} }, false).classList.add("wv-pp-pencil");
        const more = icon("more", "⋮", wvStr("weavero-people-row-act", { act: "more" }, null), (b) => {
            const lp: any = live(); if (!lp) return;
            lp._wvPeopleMenuAt(win, "wv-pp-pagemenu", b, 0, 0, (pop: any) => {
                const add = (act: string, fn: () => void) => wvMenuItem(doc, { l10n: { id: "weavero-people-row-menu", args: { act } }, attrs: { "data-wv-pp-rmenu": act },
                    onCommand: () => { try { fn(); } catch (e) {} } }, pop);
                const r = add("refresh", () => { const lp2: any = live(); if (lp2) lp2._wvPeopleRefreshFromTab(win, rec.id); });
                if (busy) wvSetBoolAttr(r, "disabled", true);
                add(rec.check ? "checked" : "check", () => { const lp2: any = live(); if (lp2) lp2._wvPeopleSetFlag(rec.id, "check", !rec.check).catch(() => {}); });
                pop.appendChild(doc.createXULElement("menuseparator"));
                add("remove", () => { const lp2: any = live(); if (lp2) lp2._wvPeopleRemoveAsk(win, rec.id); });
            });
        });
        // Refresh under way: the ⋮ says so (its menu has Refresh greyed).
        if (busy) { more.setAttribute("data-wv-pp-busy", "true"); more.setAttribute("title", wvStr("weavero-people-refreshing", null, null)); }
    }

    /** An identifier's web page (ORCID, OpenAlex, IdRef, Wikidata), or null. */
    _wvPeopleIdWeb(fact: string, value: string): string | null { return idWeb(fact, value); }

    /** Something typed in the page's edit mode and not saved yet: a value
     *  being edited, an event, a contact or custom field, an evidence, a link's
     *  name. An empty new form is nothing -- unless `open` (Cancel shows while
     *  any form is open: the header is drawn when one opens, not at each key). */
    _wvPeoplePageStaged(win: any, open?: boolean): boolean {
        const v = views.get(win);
        if (!v) return false;
        if (v.editing) return true;
        const e = v.evEdit;
        if (e && (open || e.id || [e.date, e.what, e.where, e.link, e.note].some((x) => String(x || "").trim()))) return true;
        const f = v.evForm;
        if (f && (open || f.link.trim() || f.quote.trim())) return true;
        if (v.linkDraft && String(v.linkDraft.text || "").trim()) return true;
        const c = (this as any)._wvPeopleCardEdit(win);
        return !!(c && (open || c.id || String(c.value || "").trim() || String(c.custom || "").trim() || (c.card === "custom" && String(c.label || "").trim())));
    }

    /** The page's edit mode on (for the record shown), or off: Done saves what
     *  was typed and not saved yet -- a refusal (a date, an email that is not
     *  one) keeps the edit mode, its reason shown --, Cancel drops it. Either
     *  way the edit mode then remembers nothing. */
    async _wvPeoplePageEdit(win: any, on: boolean, how?: "done" | "cancel"): Promise<boolean> {
        const v = views.get(win);
        if (!v) return false;
        if (on) {
            v.pageEdit = true;
            v.pageEditFor = v.sel;
            this._wvPeopleTabRender(win);
            return true;
        }
        const P: any = this;
        if (how === "done" && this._wvPeoplePageStaged(win)) {
            const rec = this._wvPeopleGetRec(v.sel);
            try {
                if (rec && v.editing) {
                    const inp = win.document.querySelector("[data-wv-pp-editing] input");
                    const ed = v.editing;
                    if (inp && inp.value.trim()) await this._wvPeopleFactEdit(win, rec.id, ed.fact, inp.value, ed.value, ed.ref);
                }
                const e = v.evEdit;
                if (e && (e.id || [e.date, e.what, e.where, e.link, e.note].some((x) => String(x || "").trim()))) {
                    if (!(await this._wvPeopleEventSave(win))) return false;
                }
                const f = v.evForm;
                if (f && (f.link.trim() || f.quote.trim())) {
                    if (!(await this._wvPeopleEvidenceSave(win, false))) return false;
                }
                if (rec && v.linkDraft && String(v.linkDraft.text || "").trim()) {
                    const d = v.linkDraft;
                    v.linkDraft = null;
                    await this._wvPeopleFactEdit(win, rec.id, d.fact, d.text, null, undefined);
                }
                const c = P._wvPeopleCardEdit(win);
                if (c && (c.id || String(c.value || "").trim() || String(c.custom || "").trim() || (c.card === "custom" && String(c.label || "").trim()))) {
                    if (!(await P._wvPeopleCardSave(win))) return false;
                }
            }
            catch (e) { Zotero.debug("[Weavero] people done err: " + e); return false; }
        }
        const vv = views.get(win);
        if (!vv) return false;
        vv.pageEdit = false; vv.pageEditFor = null;
        vv.editing = null; vv.evEdit = null; vv.evForm = null; vv.linkDraft = null;
        if (P._wvPeopleCardEdit(win)) P._wvPeopleCardSetEdit(win, null);
        this._wvPeopleTabRender(win);
        return true;
    }

    /** The "Suggested links" queue (the Nodus study's idea 1, MJT 2026-11-26):
     *  every link a source suggested and the user has not kept or rejected, for
     *  all researchers, each asked as a question ("Was X the PhD advisor of
     *  Y?") with its years and sources (their dates in the tooltips); Keep and
     *  Reject act at once (the row goes), the name opens the researcher's page,
     *  whose Back arrow comes back here. */
    _wvPeopleRenderQueue(win: any, main: any, v: WvPpView) {
        const doc = win.document;
        main.setAttribute("data-wv-pp-queue", "true");
        const items = wvPpLinkQueue(this._wvPeopleAllSync());
        const head = wvHtmlEl(doc, "div", "wv-pp-head", undefined, main);
        const back = wvHtmlEl(doc, "button", "wv-pp-back", "←", head);
        back.setAttribute("type", "button");
        back.setAttribute("data-wv-pp-act", "queue-back");
        back.setAttribute("title", wvStr("weavero-people-back", null, null));
        back.setAttribute("aria-label", wvStr("weavero-people-back", null, null));
        back.addEventListener("click", () => {
            const lp: any = live(); const vv = views.get(win);
            if (!lp || !vv) return;
            vv.view = "table";
            lp._wvPeopleTabRender(win);
        });
        wvHtmlEl(doc, "span", "wv-pp-name", wvStr("weavero-people-queue-title", null, null), head);
        // The dates that do not fit (the Nodus study's idea 2): first, as they ask
        // for a look at a record rather than a yes or no.
        // The possible duplicates have their own screen (Duplicates, people-table.ts).
        this._wvPeopleRenderDateIssues(win, main, wvPpDateChecks(this._wvPeopleAllSync()), true);
        wvHtmlEl(doc, "div", "wv-pp-tcount", wvStr("weavero-people-queue-count", { count: items.length }, null), main);
        if (!items.length) { wvHtmlEl(doc, "div", "wv-pp-hint", wvStr("weavero-people-queue-none", null, null), main); return; }
        const list = wvHtmlEl(doc, "div", "wv-pp-evs wv-pp-queue", undefined, main);
        const order = this._wvPeopleNameOrder("list");
        for (const it of items) {
            const row = wvHtmlEl(doc, "div", "wv-pp-ev wv-pp-qrow", undefined, list);
            row.setAttribute("data-wv-pp-person", it.rec.id);
            row.setAttribute("data-wv-pp-fact", it.fact);
            row.setAttribute("data-value", it.value);
            const nm = wvPpNameAs(it.rec, order) || it.rec.last;
            const who = wvHtmlEl(doc, "span", "wv-pp-evdate wv-pp-qwho", nm, row);
            who.setAttribute("role", "link");
            who.setAttribute("tabindex", "0");
            const rid = it.rec.id;
            const open = () => {
                const lp: any = live(); const vv = views.get(win);
                if (!lp || !vv) return;
                vv.sel = rid; vv.view = "queue";
                lp._wvPeopleTabRender(win);
                lp._wvPeopleTabsPersistSoon();
            };
            who.addEventListener("click", open);
            who.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); open(); } });
            const body = wvHtmlEl(doc, "span", "wv-pp-evbody", undefined, row);
            // The link kind without its "link." prefix: a Fluent variant key holds no dot.
            wvHtmlEl(doc, "span", "wv-pp-qq", wvStr("weavero-people-queue-q", { fact: it.fact.replace(/^link\./, ""), other: it.value, name: wvPpDisplayName(it.rec) || it.rec.last }, null), body);
            if (it.years) wvHtmlEl(doc, "span", "wv-pp-muted", " (" + it.years + ")", body);
            const srcs = wvHtmlEl(doc, "span", "wv-pp-srcs wv-pp-qsrcs", undefined, body);
            for (const l of it.lines) {
                const chip = wvHtmlEl(doc, "span", "wv-pp-src", srcName(l.source), srcs);
                chip.setAttribute("data-source", l.source);
                chip.setAttribute("data-status", l.status);
                chip.setAttribute("title", wvStr("weavero-people-status-" + l.status, null, null) + (l.date ? " · " + l.date : "") + (l.url ? " — " + l.url : ""));
                if (l.url) { const u = l.url; chip.setAttribute("data-wv-url", u); chip.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(u); }); }
            }
            const bs = wvHtmlEl(doc, "span", "wv-pp-qbtns", undefined, row);
            for (const [act, id] of [["keep", "weavero-people-keep"], ["reject", "weavero-people-reject"]] as Array<[string, string]>) {
                const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr(id, null, null), bs);
                b.setAttribute("type", "button");
                b.setAttribute("data-wv-pp-do", act);
                b.addEventListener("click", () => {
                    const lp: any = live();
                    if (!lp) return;
                    lp._wvPeopleFactAct(win, rid, it.fact, it.value, act, it.ref)
                        .then(() => { const lp2: any = live(); if (lp2) lp2._wvPeopleRenderAll(); })
                        .catch((e: any) => Zotero.debug("[Weavero] people queue act err: " + e));
                });
            }
        }
    }

    /** The possible duplicates (the Nodus study's idea 3, MJT 2026-11-26): each
     *  pair side by side -- name, institution, identifiers, items in your
     *  libraries -- with the reasons, then Merge into A / Merge into B / Not the
     *  same person. Nothing merges by itself; Not the same is remembered. */
    _wvPeopleRenderDupes(win: any, parent: any, dupes: WvPpDupe[]) {
        if (!dupes.length) return;
        const doc = win.document;
        const box = wvHtmlEl(doc, "div", "wv-pp-dupes", undefined, parent);
        box.setAttribute("data-wv-pp-dupes", String(dupes.length));
        wvHtmlEl(doc, "div", "wv-pp-dtitle", wvStr("weavero-people-dupe-title", { count: dupes.length }, null), box);
        const order = this._wvPeopleNameOrder("list");
        const libStats = this._wvPeopleLibStats();
        for (const d of dupes) {
            const row = wvHtmlEl(doc, "div", "wv-pp-dupe", undefined, box);
            row.setAttribute("data-wv-pp-pair", d.a.id + "|" + d.b.id);
            const cards = wvHtmlEl(doc, "div", "wv-pp-dupecards", undefined, row);
            for (const r of [d.a, d.b]) {
                const c = wvHtmlEl(doc, "div", "wv-pp-dupecard", undefined, cards);
                c.setAttribute("data-wv-pp-person", r.id);
                wvHtmlEl(doc, "div", "wv-pp-evwhat", wvPpNameAs(r, order) || r.last, c);
                const inst = wvPpShown(r, "institution")[0];
                if (inst) wvHtmlEl(doc, "div", "wv-pp-muted", String(inst.value), c);
                const idl = WV_PP_ID_KEYS.map((k) => { const s = wvPpShown(r, k)[0]; return s ? WV_PP_SOURCES[k as WvPpSource] ? WV_PP_SOURCES[k as WvPpSource].name + " " + s.value : s.value : ""; }).filter(Boolean);
                if (idl.length) wvHtmlEl(doc, "div", "wv-pp-muted wv-pp-dupeids", idl.join(" · "), c);
                const st = libStats && libStats.get(r.id);
                wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-dupe-items", { count: st ? st.n : 0 }, null), c);
            }
            const reasons = wvHtmlEl(doc, "div", "wv-pp-srcs wv-pp-dupereasons", undefined, row);
            for (const rs of d.reasons) wvHtmlEl(doc, "span", "wv-pp-src", wvStr("weavero-people-dupe-reason", { reason: rs }, null), reasons).setAttribute("data-reason", rs);
            const bs = wvHtmlEl(doc, "div", "wv-pp-qbtns", undefined, row);
            for (const [keep, drop] of [[d.a, d.b], [d.b, d.a]]) {
                const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-dupe-merge", { name: wvPpDisplayName(keep) || keep.last }, null), bs);
                b.setAttribute("type", "button");
                b.setAttribute("data-wv-pp-do", "merge");
                b.setAttribute("data-wv-pp-keep", keep.id);
                const k = keep.id, dr = drop.id;
                b.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleMergeAsk(win, k, dr); });
            }
            const ns = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-dupe-notsame", null, null), bs);
            ns.setAttribute("type", "button");
            ns.setAttribute("data-wv-pp-do", "notsame");
            const ia = d.a.id, ib = d.b.id;
            ns.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleNotSame(ia, ib).catch((e: any) => Zotero.debug("[Weavero] people not-same err: " + e)); });
        }
    }

    _wvPeopleMergeAsk(win: any, keepID: string, dropID: string) {
        const keep = this._wvPeopleGetRec(keepID), drop = this._wvPeopleGetRec(dropID);
        if (!keep || !drop) return;
        let ok = false;
        try {
            ok = Services.prompt.confirm(win, wvStr("weavero-people-dupe-confirm-title", null, null),
                wvStr("weavero-people-dupe-confirm", { keep: wvPpDisplayName(keep) || keep.last, drop: wvPpDisplayName(drop) || drop.last }, null));
        } catch (e) {}
        if (ok) this._wvPeopleMerge(keepID, dropID).catch((e: any) => Zotero.debug("[Weavero] people merge err: " + e));
    }

    /** Merge record `dropID` into `keepID` (lib wvPpMergeInto), save, then remove
     *  the merged one; a window that showed it shows the one kept. */
    async _wvPeopleMerge(keepID: string, dropID: string): Promise<boolean> {
        await this._wvPeopleLoad();
        const keep = this._wvPeopleGetRec(keepID), drop = this._wvPeopleGetRec(dropID);
        if (!keep || !drop || keep === drop) return false;
        wvPpMergeInto(keep, drop);
        for (const w of wvMainWins()) { const v = views.get(w); if (v && v.sel === dropID) v.sel = keepID; }
        await this._wvPeopleSave([keep]);
        await this._wvPeopleRemove(dropID);
        this._wvPeopleRenderAll();
        return true;
    }

    /** "Not the same person": remembered on both records, never proposed again. */
    async _wvPeopleNotSame(aID: string, bID: string): Promise<boolean> {
        const a = this._wvPeopleGetRec(aID), b = this._wvPeopleGetRec(bID);
        if (!a || !b) return false;
        a.notSame = [...new Set([...(a.notSame || []), bID])];
        b.notSame = [...new Set([...(b.notSame || []), aID])];
        await this._wvPeopleSave([a, b]);
        this._wvPeopleRenderAll();
        return true;
    }

    /** A date issue in words: who, which PhD years, which link years. The years
     *  go to Fluent as strings (a number would be grouped: "2,013"). */
    _wvPeopleDateIssueText(i: WvPpDateIssue): string {
        const nm = (r: WvPpRecord | null, fallback: string) => (r ? wvPpDisplayName(r) || r.last : fallback);
        const ys = (n: number | null) => (n == null ? "?" : String(n));
        const studentLink = i.fact === "link.student";
        const advisor = studentLink ? nm(i.rec, "") : nm(i.other, i.value);
        const student = studentLink ? nm(i.other, i.value) : nm(i.rec, "");
        const ay = studentLink ? ys(i.year) : ys(i.otherYear);
        const sy = studentLink ? ys(i.otherYear) : ys(i.year);
        return wvStr("weavero-people-date-issue", { kind: i.kind, advisor, student, ay, sy, years: i.years }, null);
    }

    /** The date issues as a list, each opening the page of the record that holds
     *  the link (`open`: in the review screen; on a page, the issues are that
     *  researcher's own and open nothing). */
    _wvPeopleRenderDateIssues(win: any, parent: any, issues: WvPpDateIssue[], open: boolean) {
        if (!issues.length) return;
        const doc = win.document;
        const box = wvHtmlEl(doc, "div", "wv-pp-dateissues", undefined, parent);
        box.setAttribute("data-wv-pp-dates", String(issues.length));
        wvHtmlEl(doc, "div", "wv-pp-dtitle", wvStr("weavero-people-date-title", { count: issues.length }, null), box);
        for (const i of issues) {
            const row = wvHtmlEl(doc, "div", "wv-pp-dateissue", "⚠ " + this._wvPeopleDateIssueText(i), box);
            row.setAttribute("data-kind", i.kind);
            row.setAttribute("data-wv-pp-person", i.rec.id);
            if (!open) continue;
            row.setAttribute("role", "link");
            row.setAttribute("tabindex", "0");
            const rid = i.rec.id;
            const go = () => {
                const lp: any = live(); const vv = views.get(win);
                if (!lp || !vv) return;
                vv.sel = rid; vv.view = "queue";
                lp._wvPeopleTabRender(win);
            };
            row.addEventListener("click", go);
            row.addEventListener("keydown", (e: any) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
        }
    }

    /** A hue for a name's avatar, the same every time. */
    _wvPeopleHue(s: string): number {
        let h = 0;
        for (const c of wvPpFold(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
        return h;
    }

    /** A save that draws nothing again (the notes being typed). */
    async _wvPeopleSaveQuiet(touch: WvPpRecord[]) {
        const db = (this as any)._wvPeopleDB;
        if (!db || db.readOnly) return;
        const now = new Date().toISOString();
        for (const r of touch) r.modified = now;
        await wvStoreWrite(this._wvPeoplePath(), { v: 1, people: db.people }, { pretty: 1 });
    }

    // ---- the name, edited (people4) -------------------------------------------------

    /** The title becomes two fields, Last name and First name, as Zotero edits
     *  a creator (MJT 2026-11-24: "I should be able to edit the name"; intake
     *  "Click the name"). Enter saves, Escape cancels, a click anywhere else in
     *  the window saves -- a CLICK, heard in the capture phase, not a press: a
     *  press that redrew the list would replace the row about to be clicked, and
     *  the click itself would be lost. */
    _wvPeopleNameEditStart(win: any) {
        const v = views.get(win);
        const rec = v ? this._wvPeopleGetRec(v.sel) : null;
        if (!v || !rec) return;
        v.nameEdit = { id: rec.id, last: rec.last, first: rec.first, err: false };
        this._wvPeopleTabRender(win);
        try {
            const doc = win.document;
            wvListen(doc, NAME_EDIT_KEY, "click", (e: any) => {
                try {
                    const lp: any = live();
                    const vv = views.get(win);
                    if (!lp || !vv || !vv.nameEdit) { wvUnlisten(doc, NAME_EDIT_KEY); return; }
                    const r = lp._wvPeopleRootOf(win);
                    const ed = r && r.querySelector(".wv-pp-nameedit");
                    if (!ed) return;
                    // wvWithin, not contains() (src-ts.md: a press on a scrollbar).
                    if (wvWithin(ed, e.target)) return;
                    lp._wvPeopleNameEditSave(win, "outside").catch((er: any) => Zotero.debug("[Weavero] people name save err: " + er));
                }
                catch (er) {}
            }, true, (this as any)._wvWireTag());
        }
        catch (e) { Zotero.debug("[Weavero] people name edit wire err: " + e); }
        win.setTimeout(() => {
            try {
                const r = this._wvPeopleRootOf(win);
                const inp = r && r.querySelector(".wv-pp-nameedit input[data-wv-pp-name='last']");
                if (inp) { inp.focus(); inp.select(); }
            }
            catch (e) {}
        }, 0);
    }

    /** The two fields of the name being edited, in the head. */
    _wvPeopleRenderNameEditor(win: any, head: any, v: WvPpView) {
        const doc = win.document;
        const ne = v.nameEdit;
        if (!ne) return;
        const box = wvHtmlEl(doc, "div", "wv-pp-nameedit", undefined, head);
        box.setAttribute("data-wv-pp-nameedit", ne.id);
        for (const k of ["last", "first"] as const) {
            const inp = wvHtmlEl(doc, "input", undefined, undefined, box);
            inp.setAttribute("type", "text");
            inp.setAttribute("data-wv-pp-name", k);
            inp.setAttribute("data-wv-pp-focus", "name-" + k);
            inp.setAttribute("placeholder", wvStr("weavero-people-name-" + k, null, "placeholder"));
            inp.setAttribute("aria-label", wvStr("weavero-people-name-" + k, null, "aria-label"));
            if (k === "last" && ne.err) inp.setAttribute("aria-invalid", "true");
            inp.value = ne[k];
            inp.addEventListener("input", () => { const vv = views.get(win); if (vv && vv.nameEdit) vv.nameEdit[k] = inp.value; });
            inp.addEventListener("keydown", (e: any) => {
                if (e.key === "Enter") {
                    e.preventDefault(); e.stopPropagation();
                    const vv = views.get(win);
                    if (vv && vv.nameEdit) vv.nameEdit[k] = inp.value;
                    const lp: any = live(); if (lp) lp._wvPeopleNameEditSave(win, "enter").catch((er: any) => Zotero.debug("[Weavero] people name save err: " + er));
                }
                else if (e.key === "Escape") {
                    e.preventDefault(); e.stopPropagation();
                    const lp: any = live(); if (lp) lp._wvPeopleNameEditCancel(win);
                }
            });
        }
        const err = wvHtmlEl(doc, "div", "wv-pp-nameerr", wvStr("weavero-people-name-empty", null, null), box);
        err.setAttribute("role", "alert");
        err.hidden = !ne.err;
    }

    _wvPeopleNameEditCancel(win: any) {
        const v = views.get(win);
        try { wvUnlisten(win.document, NAME_EDIT_KEY); } catch (e) {}
        if (!v || !v.nameEdit) return;
        v.nameEdit = null;
        this._wvPeopleTabRender(win);
        this._wvPeopleFocusTitle(win);
    }

    /** Save the name being edited. An empty last name is refused: with Enter
     *  the fields stay and say why; with a click outside the edit ends and the
     *  name stays as it was (the status line says why). */
    async _wvPeopleNameEditSave(win: any, how: "enter" | "outside"): Promise<boolean> {
        const P: any = this;
        const v = views.get(win);
        const ne = v && v.nameEdit;
        if (!v || !ne) return false;
        const last = String(ne.last || "").replace(/\s+/g, " ").trim();
        const first = String(ne.first || "").replace(/\s+/g, " ").trim();
        if (!last && how === "enter") { ne.err = true; this._wvPeopleTabRender(win); return false; }
        v.nameEdit = null;
        try { wvUnlisten(win.document, NAME_EDIT_KEY); } catch (e) {}
        if (!last) {
            if (!P._wvPpStatus) P._wvPpStatus = new Map();
            P._wvPpStatus.set(ne.id, { kind: "error", text: wvStr("weavero-people-name-empty", null, null) });
            this._wvPeopleTabRender(win);
            return false;
        }
        const ok = await this._wvPeopleRename(ne.id, last, first);
        if (how === "enter") this._wvPeopleFocusTitle(win);
        return ok;
    }

    /** The researcher `id` renamed by the user: the old name REPLACED (not
     *  kept as another form), the name marked theirs -- no Refresh or Build
     *  changes it (lib/people-record.ts wvPpRename) --, saved; the list, the
     *  Links rows and the tree are drawn again from the record. False for an
     *  empty last name. */
    async _wvPeopleRename(id: string, last: string, first: string): Promise<boolean> {
        const P: any = this;
        await this._wvPeopleLoad();
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return false;
        const r = wvPpRename(rec, last, first, "me");
        if (r === "empty") return false;
        if (r === "ok") {
            try { const st = P._wvPpStatus && P._wvPpStatus.get(id); if (st && st.kind === "error") P._wvPpStatus.delete(id); } catch (e) {}
            await this._wvPeopleSave([rec]);
        }
        else this._wvPeopleRenderAll();
        return true;
    }

    /** The focus back on the title after an edit (the keyboard goes on from there). */
    _wvPeopleFocusTitle(win: any) {
        win.setTimeout(() => {
            try {
                const r = this._wvPeopleRootOf(win);
                const t = r && r.querySelector(".wv-pp-head .wv-pp-name[role='button']");
                const ae = win.document.activeElement;
                // Only when the focus went nowhere (the field it was in is gone).
                if (t && (!ae || !ae.isConnected || ae === win.document.documentElement || ae === win.document.body)) t.focus();
            }
            catch (e) {}
        }, 0);
    }

    async _wvPeopleSetFlag(id: string, flag: "followed" | "check", on: boolean) {
        await this._wvPeopleLoad();
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return;
        (rec as any)[flag] = !!on;
        await this._wvPeopleSave([rec]);
    }

    _wvPeopleRemoveAsk(win: any, id: string) {
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return;
        let ok = false;
        try { ok = Services.prompt.confirm(win, wvStr("weavero-people-remove-title", null, null), wvStr("weavero-people-remove-confirm", { name: wvPpNameAs(rec, this._wvPeopleNameOrder("title")) }, null)); } catch (e) {}
        if (ok) this._wvPeopleRemove(id).catch((e: any) => Zotero.debug("[Weavero] people remove err: " + e));
    }

    /** Refresh from the tab: the tab says it is looking, then what came back
     *  -- new values, failures in plain words, profiles to pick from. */
    async _wvPeopleRefreshFromTab(win: any, id: string, pick?: string) {
        const P: any = this;
        if (!P._wvPpStatus) P._wvPpStatus = new Map();
        if (!P._wvPpCands) P._wvPpCands = new Map();
        P._wvPpStatus.set(id, { kind: "busy", text: wvStr("weavero-people-refreshing", null, null) });
        P._wvPpCands.delete(id);
        let res: any = null;
        try { res = await this._wvPeopleRefresh(id, { pick }); }
        catch (e) { res = { added: 0, errors: [{ source: "Weavero", error: errText(e) }], candidates: null, notes: [], date: wvPpToday() }; }
        const lp: any = live() || P;
        const lines: string[] = [];
        for (const er of res.errors || []) lines.push(wvStr("weavero-people-error", { source: er.source, error: er.error }, null));
        if (res.notes && res.notes.includes("theses-none")) lines.push(wvStr("weavero-people-theses-none", null, null));
        if (!res.candidates) lines.unshift(wvStr("weavero-people-refreshed", { count: res.added, date: res.date }, null));
        if (!lp._wvPpStatus) lp._wvPpStatus = new Map();
        if (!lp._wvPpCands) lp._wvPpCands = new Map();
        lp._wvPpStatus.set(id, { kind: (res.errors || []).length ? "error" : "info", text: lines.join(" ") });
        if (res.candidates) lp._wvPpCands.set(id, res.candidates);
        lp._wvPeopleRenderAll();
        return res;
    }

    /** The homonyms: the profiles OpenAlex has under the name; a click on
     *  one takes it (the user's choice) and looks the person up. */
    _wvPeopleRenderCandidates(win: any, main: any, rec: WvPpRecord, cands: WvPpCandidate[]) {
        const doc = win.document;
        const box = wvHtmlEl(doc, "div", "wv-pp-cands", undefined, main);
        box.setAttribute("data-wv-pp-cands", String(cands.length));
        if (!cands.length) { wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-no-profile", null, null), box); return; }
        wvHtmlEl(doc, "div", "wv-pp-sub", wvStr("weavero-people-pick", { count: cands.length }, null), box);
        for (const c of cands) {
            const row = wvHtmlEl(doc, "div", "wv-pp-cand", c.name, box);
            row.setAttribute("role", "button");
            row.setAttribute("data-wv-pp-cand", c.id);
            const meta = [wvStr("weavero-people-cand-works", { count: c.works }, null)];
            if (c.institutions.length) meta.push(c.institutions.join(", "));
            if (c.orcid) meta.push(WV_PP_SOURCES.orcid.name + " " + c.orcid);
            meta.push(WV_PP_SOURCES.openalex.name + " " + c.id);
            wvHtmlEl(doc, "span", "wv-pp-candmeta", meta.join(" · "), row);
            row.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleRefreshFromTab(win, rec.id, c.id); });
        }
    }

    /** A section of facts: each fact with every value, every source of each
     *  value side by side (its status, a link to its record), a mark when
     *  several sources agree, Keep / Reject / Edit; Add for a value of the
     *  user's own. */
    _wvPeopleRenderFactSec(win: any, main: any, rec: WvPpRecord, v: WvPpView, titleID: string, facts: string[], key: string) {
        const doc = win.document;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", key);
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr(titleID, null, null), sec);
        const grid = wvHtmlEl(doc, "div", "wv-pp-facts", undefined, sec);
        for (const fact of facts) this._wvPeopleRenderFact(win, grid, rec, v, fact);
        // Nothing known: out of the edit mode, no card (as Google Contacts hides
        // empty fields); in it, a word (the Identifiers say so in their own words).
        if (!grid.firstChild && !v.pageEdit) { sec.remove(); return; }
        if (!grid.firstChild && key !== "ids") wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-sec-empty", null, null), sec);
    }

    _wvPeopleRenderFact(win: any, grid: any, rec: WvPpRecord, v: WvPpView, fact: string, opts?: { limit?: number }) {
        const doc = win.document;
        const d = wvPpFact(fact);
        if (!d) return;
        // The name itself is never one of its other forms (a form a source gave
        // before the user renamed the researcher to it).
        const ownKey = wvPpFold(rec.last) + "|" + wvPpFold(rec.first);
        let groups = wvPpGroups(rec, fact).filter((g) => !d.forms || wvPpFormKey(g[0].value) !== ownKey);
        const shown = wvPpShown(rec, fact);
        const shownOf = (g: WvPpLine[]) => shown.find((s) => wvPpSame(fact, s.value, g[0].value, s.ref, g[0].ref)) || null;
        // The view and edit modes (MJT 2026-11-26, "Reserve the more advanced
        // sources and edit buttons to the edit mode"): out of the edit mode, the
        // values shown only, one line each -- no alternative or rejected value,
        // no source, no agreement or disagreement, no button. A field with no
        // value shows only in the edit mode, or while its value is being typed.
        const edit = !!v.pageEdit;
        const typing = !!(v.editing && v.editing.fact === fact);
        if (!edit) groups = groups.filter((g) => !!shownOf(g) && !g.every((l) => l.status === "rejected"));
        if (!groups.length && !edit && !typing) return;
        const lab = wvHtmlEl(doc, "div", "wv-pp-flabel", factLabel(fact), grid);
        lab.setAttribute("data-wv-pp-flabel", fact);
        const vals = wvHtmlEl(doc, "div", "wv-pp-fvals", undefined, grid);
        vals.setAttribute("data-wv-pp-fact", fact);
        // Shown values first (in the order shown), then alternatives, then rejected.
        const order = (g: WvPpLine[]) => {
            const s = shownOf(g);
            if (s) return shown.indexOf(s);
            return g.every((l) => l.status === "rejected") ? 200 : 100;
        };
        groups.sort((a, b) => order(a) - order(b));
        if (edit && shown[0] && shown[0].conflict) {
            const c = wvHtmlEl(doc, "span", "wv-pp-conflict", wvStr(shown[0].isNew ? "weavero-people-conflict-new" : "weavero-people-conflict", { count: shown[0].values }, null), vals);
            c.setAttribute("data-wv-pp-conflict", shown[0].isNew ? "new" : "values");
        }
        // The first `limit` values, then "N more" (the right pane, people-pane.ts).
        const more = opts && opts.limit && !edit && groups.length > opts.limit ? groups.length - opts.limit : 0;
        if (more) groups = groups.slice(0, opts.limit);
        for (const g of groups) {
            const s = shownOf(g);
            const rejected = g.every((l) => l.status === "rejected");
            const status = rejected ? "rejected" : g.some((l) => l.status === "chosen") ? "chosen" : s ? (s.why === "confirmed" ? "confirmed" : "suggested") : "alternative";
            const value = g[0].value;
            const ref = s && s.ref ? s.ref : g[0].ref;
            const isEditing = v.editing && v.editing.fact === fact && v.editing.value != null && wvPpSame(fact, v.editing.value, value, v.editing.ref, ref);
            if (isEditing) { this._wvPeopleRenderEditor(win, vals, rec, fact, value, ref, (s && s.years) || g[0].years); continue; }
            const row = wvHtmlEl(doc, "div", "wv-pp-val", undefined, vals);
            row.setAttribute("data-value", value);
            row.setAttribute("data-status", status);
            row.setAttribute("data-shown", s ? "true" : "false");
            const years = (s && s.years) || (g.find((l) => l.years) || {} as any).years;
            // A link's person written as the Links rows write names (their record's
            // name when they are in Researchers, else the source's, split); a
            // country by its name. The value itself stays the source's (data-value).
            const target = d.link ? this._wvPeopleFindByRef(value, ref) : null;
            const lOrder = this._wvPeopleNameOrder("links");
            const shownText = d.link ? (target ? wvPpNameAs(target, lOrder) : wvPpNameTextAs(value, lOrder)) || value
                : WV_PP_COUNTRY_FACTS.includes(fact) ? wvPpCountryName(value, uiLocale()) : value;
            const text = shownText + (years ? " (" + years + ")" : "");
            const vt = wvHtmlEl(doc, "span", "wv-pp-vtext", text, row);
            const web = d.id ? idWeb(fact, value) : (fact === "web" && /^https?:\/\//i.test(value) ? value : null);
            if (web) {
                vt.setAttribute("role", "link");
                vt.setAttribute("data-wv-url", web);
                vt.setAttribute("title", web);
                vt.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(web); });
            }
            else if (d.link) {
                vt.setAttribute("role", "link");
                vt.setAttribute("data-wv-pp-target", target ? target.id : "");
                vt.setAttribute("title", wvStr(target ? "weavero-people-open-person" : "weavero-people-add-person", { name: shownText }, null));
                vt.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleOpenOrAdd(win, value, ref); });
            }
            const srcs = edit ? wvHtmlEl(doc, "span", "wv-pp-srcs", undefined, row) : null;
            for (const l of srcs ? g : []) {
                // A short label; its date in the tooltip (the Google Contacts design,
                // MJT 2026-11-25: "short source labels (dates in tooltips)").
                const chip = wvHtmlEl(doc, "span", "wv-pp-src", srcName(l.source), srcs);
                chip.setAttribute("data-source", l.source);
                chip.setAttribute("data-status", l.status);
                if (l.date) chip.setAttribute("data-date", l.date);
                chip.setAttribute("title", wvStr("weavero-people-status-" + l.status, null, null)
                    + (l.date && l.source !== "me" ? " · " + l.date : "") + (l.url ? " — " + l.url : ""));
                if (l.url) { const u = l.url; chip.setAttribute("data-wv-url", u); chip.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(u); }); }
                // The user's value with its evidence (the Nodus study's idea 4): the
                // chip opens the item at its page; the tooltip says where and the quote.
                if (l.source === "me" && l.ev) {
                    const evl = wvPpEvidenceLink(l.ev);
                    chip.setAttribute("data-wv-pp-ev", evl);
                    chip.classList.add("wv-pp-src-ev");
                    chip.setAttribute("title", this._wvPeopleEvidenceTip(l.ev));
                    chip.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(evl); });
                }
                if (l.isNew) wvHtmlEl(doc, "span", "wv-pp-new", wvStr("weavero-people-new", null, null), srcs);
            }
            if (edit && s && s.sources.length >= 2) {
                const a = wvHtmlEl(doc, "span", "wv-pp-agree", "✓ " + wvStr("weavero-people-agree", { count: s.sources.length }, null), row);
                a.setAttribute("data-wv-pp-agree", String(s.sources.length));
            }
            // The buttons in the edit mode only; a right-click offers the same in both.
            const bs = edit ? wvHtmlEl(doc, "span", "wv-pp-vbtns", undefined, row) : null;
            const vb = (act: string, id: string) => {
                const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr(id, null, null), bs);
                b.setAttribute("type", "button");
                b.setAttribute("data-wv-pp-do", act);
                b.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleFactAct(win, rec.id, fact, value, act, ref); });
            };
            const acts: string[] = rejected ? ["restore"]
                // A form of the name has no Keep: every form not rejected counts already.
                : [...(status !== "chosen" && !d.forms ? ["keep"] : []), "reject", "edit",
                    // Evidence on the user's own value (the Nodus study's idea 4).
                    ...(g.some((l) => l.source === "me") ? ["evidence"] : [])];
            const BTN: Record<string, string> = { keep: "weavero-people-keep", reject: "weavero-people-reject", edit: "weavero-people-edit", restore: "weavero-people-restore", evidence: "weavero-people-ev-act" };
            const MENU: Record<string, string> = { keep: "weavero-people-row-keep", reject: "weavero-people-row-reject", edit: "weavero-people-row-edit", restore: "weavero-people-row-restore", evidence: "weavero-people-row-evidence" };
            if (bs) for (const a of acts) vb(a, BTN[a]);
            // The same actions on a right-click (the Google Contacts design, MJT
            // 2026-11-25); the buttons show on the row under the mouse.
            row.addEventListener("contextmenu", (ev: any) => {
                try {
                    if (ev.target && ev.target.closest && ev.target.closest("input, textarea")) return;
                    ev.preventDefault();
                    const lp: any = live();
                    if (!lp) return;
                    lp._wvPeopleOpenMenu(win, row, "wv-pp-row-menu", (pop: any) => {
                        for (const a of acts) {
                            wvMenuItem(doc, { l10n: { id: MENU[a] }, attrs: { "data-wv-pp-do": a },
                                onCommand: () => { const lp2: any = live(); if (lp2) lp2._wvPeopleFactAct(win, rec.id, fact, value, a, ref); } }, pop);
                        }
                    });
                }
                catch (e) {}
            });
            if (v.evForm && v.evForm.rec === rec.id && v.evForm.fact === fact && v.evForm.value === value) this._wvPeopleRenderEvidenceForm(win, vals, rec);
        }
        if (more) wvHtmlEl(doc, "span", "wv-pp-more", wvStr("weavero-people-works-more", { count: more }, null), vals);
        if (v.editing && v.editing.fact === fact && v.editing.value == null) this._wvPeopleRenderEditor(win, vals, rec, fact, null, undefined, undefined);
        else if (edit && (d.multi || !groups.some((g) => g.some((l) => l.status !== "rejected")))) {
            const add = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-add-value", null, null), vals);
            add.setAttribute("type", "button");
            add.setAttribute("data-wv-pp-do", "add");
            add.style.alignSelf = "flex-start";
            add.addEventListener("click", () => { const lp: any = live(); const vv = views.get(win); if (!lp || !vv) return; vv.editing = { fact, value: null }; lp._wvPeopleTabRender(win); });
        }
    }

    /** Where a value's evidence is, in the chip's tooltip: the item's title, its
     *  page, the quote. */
    _wvPeopleEvidenceTip(ev: WvPpEvidence): string {
        let title = ev.title || ev.key;
        try {
            const libID = ev.group != null ? Zotero.Groups.getLibraryIDFromGroupID(ev.group) : Zotero.Libraries.userLibraryID;
            const it = libID ? Zotero.Items.getByLibraryAndKey(libID, ev.key) : null;
            const top = it && it.parentItem ? it.parentItem : it;
            if (top) title = String(top.getDisplayTitle() || title);
        } catch (e) {}
        return wvStr("weavero-people-ev-tip", { title, page: ev.page || "none", quote: ev.quote || "none" }, null);
    }

    /** The evidence form under one of the user's own values (the Nodus study's
     *  idea 4, MJT 2026-11-26): a zotero:// link to the item -- or a click on
     *  one of the PDFs open in this window, which fills it at their current
     *  page -- and the words quoted; Save, Remove the evidence, Cancel. */
    _wvPeopleRenderEvidenceForm(win: any, parent: any, rec: WvPpRecord) {
        const doc = win.document;
        const v = views.get(win);
        const f = v && v.evForm;
        if (!f) return;
        const form = wvHtmlEl(doc, "div", "wv-pp-evform", undefined, parent);
        form.setAttribute("data-wv-pp-evidence", f.fact);
        wvHtmlEl(doc, "label", "wv-pp-flabel", wvStr("weavero-people-ev-field", { field: "link" }, null), form);
        const link = wvHtmlEl(doc, "input", undefined, undefined, form);
        link.setAttribute("type", "text");
        link.setAttribute("data-wv-pp-evf", "link");
        link.setAttribute("data-wv-pp-focus", "ev-link");
        link.setAttribute("placeholder", wvStr("weavero-people-ev-ph", null, null));
        link.value = f.link;
        link.addEventListener("input", () => { const vv = views.get(win); if (vv && vv.evForm) vv.evForm.link = link.value; });
        // The PDFs open in this window, at their current page.
        const tabs = wvHtmlEl(doc, "div", "wv-pp-evsugg", undefined, form);
        tabs.setAttribute("data-wv-pp-evtabs", "true");
        try {
            for (const t of (win.Zotero_Tabs && win.Zotero_Tabs._tabs) || []) {
                if (t.type !== "reader") continue;
                const reader = Zotero.Reader.getByTabID(t.id);
                const it = reader && Zotero.Items.get(reader.itemID);
                if (!it) continue;
                let page = "";
                try { page = String(((reader._internalReader._state || {}).primaryViewStats || {}).pageLabel || ""); } catch (e) {}
                const group = it.library && it.library.isGroup ? Zotero.Groups.getGroupIDFromLibraryID(it.libraryID) : null;
                const ln = wvPpEvidenceLink({ group, key: it.key, page: page || undefined });
                const b = wvHtmlEl(doc, "button", undefined, wvStr("weavero-people-ev-tab", { title: String(t.title || it.getDisplayTitle() || ""), page: page || "none" }, null), tabs);
                b.setAttribute("type", "button");
                b.setAttribute("data-wv-pp-evlink", ln);
                b.addEventListener("mousedown", (e: any) => e.preventDefault());
                b.addEventListener("click", () => { link.value = ln; const vv = views.get(win); if (vv && vv.evForm) vv.evForm.link = ln; });
            }
        } catch (e) {}
        if (!tabs.firstChild) tabs.remove();
        wvHtmlEl(doc, "label", "wv-pp-flabel", wvStr("weavero-people-ev-field", { field: "quote" }, null), form);
        const quote = wvHtmlEl(doc, "textarea", undefined, undefined, form);
        quote.setAttribute("data-wv-pp-evf", "quote");
        quote.value = f.quote;
        quote.addEventListener("input", () => { const vv = views.get(win); if (vv && vv.evForm) vv.evForm.quote = quote.value; });
        const btns = wvHtmlEl(doc, "div", "wv-pp-evbtns", undefined, form);
        const mk = (act: string, id: string, fn: () => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr(id, null, null), btns);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-evact", act);
            b.addEventListener("click", () => { try { fn(); } catch (e) {} });
        };
        mk("save", "weavero-people-save", () => { const lp: any = live(); if (lp) lp._wvPeopleEvidenceSave(win, false); });
        if (rec.lines.some((l) => l.fact === f.fact && l.value === f.value && l.ev)) mk("remove", "weavero-people-ev-remove", () => { const lp: any = live(); if (lp) lp._wvPeopleEvidenceSave(win, true); });
        mk("cancel", "weavero-people-event-cancel", () => { const vv = views.get(win); const lp: any = live(); if (vv && lp) { vv.evForm = null; lp._wvPeopleTabRender(win); } });
        if (f.err) wvHtmlEl(doc, "span", "wv-pp-everr", f.err, btns).setAttribute("role", "alert");
    }

    /** Save (or, `remove`, take off) the form's evidence on the user's own lines
     *  of that value; the item's title kept for when it cannot be read. */
    async _wvPeopleEvidenceSave(win: any, remove: boolean): Promise<boolean> {
        const v = views.get(win);
        const f = v && v.evForm;
        if (!v || !f) return false;
        const rec = this._wvPeopleGetRec(f.rec);
        if (!rec) { v.evForm = null; this._wvPeopleTabRender(win); return false; }
        const mine = rec.lines.filter((l) => l.fact === f.fact && l.value === f.value && l.source === "me");
        if (!mine.length) { v.evForm = null; this._wvPeopleTabRender(win); return false; }
        if (remove) for (const l of mine) delete l.ev;
        else {
            const ev = wvPpEvidenceFromLink(f.link);
            if (!ev) { f.err = wvStr("weavero-people-ev-bad", null, null); this._wvPeopleTabRender(win); return false; }
            try {
                const libID = ev.group != null ? Zotero.Groups.getLibraryIDFromGroupID(ev.group) : Zotero.Libraries.userLibraryID;
                const it = libID ? Zotero.Items.getByLibraryAndKey(libID, ev.key) : null;
                const top = it && it.parentItem ? it.parentItem : it;
                if (top) ev.title = String(top.getDisplayTitle() || "") || undefined;
            } catch (e) {}
            if (f.quote.trim()) ev.quote = f.quote.trim();
            for (const l of mine) l.ev = ev;
        }
        v.evForm = null;
        await this._wvPeopleSave([rec]);
        this._wvPeopleRenderAll();
        return true;
    }

    /** The inline editor of a value (Edit) or of a new one (Add): Enter or
     *  Save writes the user's value (source "me"), Escape or Cancel leaves. */
    _wvPeopleRenderEditor(win: any, parent: any, rec: WvPpRecord, fact: string, value: string | null, ref: WvPpRef | undefined, years: string | undefined) {
        const doc = win.document;
        const box = wvHtmlEl(doc, "div", "wv-pp-edit", undefined, parent);
        box.setAttribute("data-wv-pp-editing", fact);
        const inp = wvHtmlEl(doc, "input", undefined, undefined, box);
        inp.setAttribute("type", "text");
        inp.setAttribute("data-wv-pp-focus", "edit");
        const d = wvPpFact(fact);
        // A country is edited by its name (saved as its code, _wvPeopleFactEdit).
        const shown = value != null && WV_PP_COUNTRY_FACTS.includes(fact) ? wvPpCountryName(value, uiLocale()) : value;
        inp.value = shown != null ? shown + (years && d && d.years && !d.id ? " (" + years + ")" : "") : "";
        const save = () => {
            const lp: any = live();
            if (!lp) return;
            lp._wvPeopleFactEdit(win, rec.id, fact, inp.value, value, ref).catch((e: any) => Zotero.debug("[Weavero] people edit err: " + e));
        };
        const cancel = () => { const lp: any = live(); const vv = views.get(win); if (!lp || !vv) return; vv.editing = null; lp._wvPeopleTabRender(win); };
        inp.addEventListener("keydown", (e: any) => {
            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); save(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
        });
        const sb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-save", null, null), box);
        sb.setAttribute("type", "button");
        sb.setAttribute("data-wv-pp-do", "save");
        sb.addEventListener("click", save);
        const cb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-common-cancel", null, null), box);
        cb.setAttribute("type", "button");
        cb.setAttribute("data-wv-pp-do", "cancel");
        cb.addEventListener("click", cancel);
        win.setTimeout(() => { try { if (inp.isConnected) { inp.focus(); inp.select(); } } catch (e) {} }, 0);
    }

    /** Keep / Reject / Restore / Edit on a value: written at once. */
    async _wvPeopleFactAct(win: any, id: string, fact: string, value: string, act: string, ref?: WvPpRef) {
        await this._wvPeopleLoad();
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return;
        if (act === "edit") {
            const v = views.get(win);
            if (v) { v.editing = { fact, value, ref }; this._wvPeopleTabRender(win); }
            return;
        }
        if (act === "evidence") {
            const v = views.get(win);
            if (!v) return;
            const g = wvPpGroups(rec, fact).find((x) => x.some((l) => l.value === value));
            const ev = g && (g.find((l) => l.source === "me" && l.ev) || {} as any).ev;
            v.evForm = { rec: id, fact, value, ref, link: ev ? wvPpEvidenceLink(ev) : "", quote: ev && ev.quote ? ev.quote : "", err: "" };
            this._wvPeopleTabRender(win);
            return;
        }
        if (!wvPpAct(rec, fact, value, act as any, ref)) return;
        await this._wvPeopleSave([rec]);
    }

    async _wvPeopleFactEdit(win: any, id: string, fact: string, text: string, replace: string | null, ref?: WvPpRef) {
        await this._wvPeopleLoad();
        const rec = this._wvPeopleGetRec(id);
        const v = views.get(win);
        if (v) v.editing = null;
        if (!rec) return;
        const d = wvPpFact(fact);
        let value = String(text || "").trim();
        // A country typed by its name or its code is kept as its code; one the
        // platform does not name stays as typed.
        if (WV_PP_COUNTRY_FACTS.includes(fact) && value) value = wvPpCountryCode(value, uiLocale()) || value;
        let years: string | undefined;
        if (d && d.years && !d.id) {
            const ym = value.match(/\s*\(([^()]*\d{4}[^()]*)\)\s*$/);
            if (ym) { years = ym[1].trim(); value = value.slice(0, ym.index).trim(); }
        }
        // A link typed by hand: the person of that name in People, with their ids.
        let lref = ref;
        if (d && d.link && !lref) {
            const t = this._wvPeopleFindByRef(value, undefined);
            if (t) { const r = wvPpRefOf(t); lref = {}; for (const k of WV_PP_ID_KEYS) if ((r as any)[k]) (lref as any)[k] = (r as any)[k]; if (!Object.keys(lref).length) lref = undefined; }
        }
        const ok = value ? wvPpEdit(rec, fact, value, wvPpToday(), { years, ref: lref, replace: replace != null ? replace : undefined, replaceRef: ref }) : false;
        if (ok) await this._wvPeopleSave([rec]);
        else this._wvPeopleTabRender(win);
    }

    /** A link's person: their record when it is in People, else a new one
     *  with the link's ids (To check) -- nothing fetched until Refresh. */
    async _wvPeopleOpenOrAdd(win: any, name: string, ref?: WvPpRef) {
        await this._wvPeopleLoad();
        let rec = this._wvPeopleFindByRef(name, ref);
        if (!rec) {
            const n = wvPpSplitName(name);
            rec = await this._wvPeopleCreate(n.last, n.first, { ref, source: "me" });
        }
        this._wvPeopleTabOpen(win, { personID: rec.id });
    }

    /** The links: each kind with its values (the facts' own rows), the
     *  students also from the other side -- People whose advisor is this
     *  person -- and Add a Link. */
    /** Dated events (MJT 2026-11-25: "add information for researchers on some
     *  dated events, such as giving a seminar in LadHyX, with the link to the
     *  seminar announcement"; approved as proposed 22:10): newest first, each a
     *  date, what, where, the announcement's link (its address in the tooltip)
     *  and a note; Edit and Remove on the row under the mouse; "Add an event"
     *  opens the form, whose What and Where offer the labels used before (as
     *  buttons: Zotero's main window never shows a <datalist>, see the Links). */
    _wvPeopleRenderEvents(win: any, main: any, rec: WvPpRecord, v: WvPpView) {
        const doc = win.document;
        const ed = v.evEdit && v.evEdit.rec === rec.id ? v.evEdit : null;
        const events = wvPpEventsSorted(rec.events || []);
        // Out of the edit mode: no card without an event, no button (MJT 2026-11-26).
        const editMode = !!v.pageEdit;
        if (!editMode && !events.length && !ed) return;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "events");
        const title = wvHtmlEl(doc, "div", "wv-pp-sectitle", undefined, sec);
        wvHtmlEl(doc, "span", undefined, wvStr("weavero-people-sec-events", null, null), title);
        const list = wvHtmlEl(doc, "div", "wv-pp-evs", undefined, sec);
        let locale: string | undefined;
        try { locale = Zotero.locale; } catch (e) {}
        for (const e of events) {
            if (ed && ed.id === e.id) { this._wvPeopleRenderEventForm(win, list, v); continue; }
            const row = wvHtmlEl(doc, "div", "wv-pp-ev", undefined, list);
            row.setAttribute("data-wv-pp-event", e.id);
            const d = wvHtmlEl(doc, "span", "wv-pp-evdate", wvPpEventDate(e.date, locale), row);
            d.setAttribute("title", e.date);
            const body = wvHtmlEl(doc, "span", "wv-pp-evbody", undefined, row);
            wvHtmlEl(doc, "span", "wv-pp-evwhat", e.what, body);
            if (e.where) wvHtmlEl(doc, "span", "wv-pp-evwhere", " " + wvStr("weavero-people-event-at", { where: e.where }, null), body);
            if (e.link) {
                const a = wvHtmlEl(doc, "span", "wv-pp-evlink", wvStr("weavero-people-event-announcement", null, null), body);
                a.setAttribute("role", "link");
                a.setAttribute("tabindex", "0");
                a.setAttribute("title", e.link);
                a.setAttribute("data-wv-url", e.link);
                const u = e.link;
                const go = () => { const lp: any = live(); if (lp) lp._launchURL(u); };
                a.addEventListener("click", go);
                a.addEventListener("keydown", (ev: any) => { if (ev.key === "Enter") { ev.preventDefault(); go(); } });
            }
            if (e.note) wvHtmlEl(doc, "span", "wv-pp-evnote", e.note, body);
            if (!editMode) continue;
            const bs = wvHtmlEl(doc, "span", "wv-pp-vbtns", undefined, row);
            const eb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-edit", null, null), bs);
            eb.setAttribute("type", "button");
            eb.setAttribute("data-wv-pp-evact", "edit");
            eb.addEventListener("click", () => {
                const lp: any = live(); const vv = views.get(win);
                if (!lp || !vv) return;
                vv.evEdit = { rec: rec.id, id: e.id, date: e.date, what: e.what, where: e.where || "", link: e.link || "", note: e.note || "", err: "" };
                lp._wvPeopleTabRender(win);
            });
            const rb = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-event-remove", null, null), bs);
            rb.setAttribute("type", "button");
            rb.setAttribute("data-wv-pp-evact", "remove");
            rb.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleEventRemoveAsk(win, rec.id, e.id); });
        }
        if (ed && ed.id === null) this._wvPeopleRenderEventForm(win, list, v);
        if (!ed && editMode) {
            const add = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-event-add", null, null), title);
            add.setAttribute("type", "button");
            add.setAttribute("data-wv-pp-act", "event-add");
            add.addEventListener("click", () => {
                const lp: any = live(); const vv = views.get(win);
                if (!lp || !vv) return;
                vv.evEdit = { rec: rec.id, id: null, date: "", what: "", where: "", link: "", note: "", err: "" };
                lp._wvPeopleTabRender(win);
                try { const f = win.document.querySelector("[data-wv-pp-focus='ev-date']"); if (f) f.focus(); } catch (er) {}
            });
            if (!events.length) wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-events-none", null, null), sec);
        }
    }

    /** The event form: date, what, where, link, note; Save and Cancel. Enter
     *  saves (but in the note), Escape cancels. */
    _wvPeopleRenderEventForm(win: any, parent: any, v: WvPpView) {
        const doc = win.document;
        const ed = v.evEdit;
        if (!ed) return;
        const form = wvHtmlEl(doc, "div", "wv-pp-evform", undefined, parent);
        form.setAttribute("data-wv-pp-evform", ed.id || "new");
        const all = this._wvPeopleAllSync();
        type EvKey = "date" | "what" | "where" | "link" | "note";
        const field = (key: EvKey, multi?: boolean) => {
            wvHtmlEl(doc, "label", "wv-pp-flabel", wvStr("weavero-people-event-field", { field: key }, null), form);
            const inp = wvHtmlEl(doc, multi ? "textarea" : "input", undefined, undefined, form);
            if (!multi) inp.setAttribute("type", "text");
            inp.setAttribute("data-wv-pp-focus", "ev-" + key);
            inp.setAttribute("data-wv-pp-evfield", key);
            const ph = wvStr("weavero-people-event-ph", { field: key }, null);
            if (ph) inp.setAttribute("placeholder", ph);
            inp.value = (ed as any)[key];
            inp.addEventListener("input", () => { const vv = views.get(win); if (vv && vv.evEdit) (vv.evEdit as any)[key] = inp.value; });
            inp.addEventListener("keydown", (e: any) => {
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const lp: any = live(); if (lp) lp._wvPeopleEventCancel(win); }
                else if (e.key === "Enter" && !multi) { e.preventDefault(); e.stopPropagation(); const lp: any = live(); if (lp) lp._wvPeopleEventSave(win); }
            });
            return inp;
        };
        const suggest = (key: "what" | "where", inp: any, defaults: string[]) => {
            const opts = wvPpEventSuggest(all, key, defaults).slice(0, 12);
            if (!opts.length) return;
            const box = wvHtmlEl(doc, "div", "wv-pp-evsugg", undefined, form);
            box.setAttribute("data-wv-pp-evsugg", key);
            for (const o of opts) {
                const b = wvHtmlEl(doc, "button", undefined, o, box);
                b.setAttribute("type", "button");
                b.setAttribute("tabindex", "-1");
                b.addEventListener("mousedown", (e: any) => e.preventDefault());
                b.addEventListener("click", () => {
                    inp.value = o;
                    const vv = views.get(win);
                    if (vv && vv.evEdit) (vv.evEdit as any)[key] = o;
                    try { inp.focus(); } catch (e) {}
                });
            }
        };
        field("date");
        const what = field("what");
        suggest("what", what, ["seminar", "visit", "talk", "jury"].map((k) => wvStr("weavero-people-event-kind", { kind: k }, null)).filter(Boolean));
        const where = field("where");
        suggest("where", where, []);
        field("link");
        field("note", true);
        const btns = wvHtmlEl(doc, "div", "wv-pp-evbtns", undefined, form);
        const save = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-save", null, null), btns);
        save.setAttribute("type", "button");
        save.setAttribute("data-wv-pp-evact", "save");
        save.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleEventSave(win); });
        const cancel = wvHtmlEl(doc, "button", "wv-pp-btn", wvStr("weavero-people-event-cancel", null, null), btns);
        cancel.setAttribute("type", "button");
        cancel.setAttribute("data-wv-pp-evact", "cancel");
        cancel.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleEventCancel(win); });
        if (ed.err) wvHtmlEl(doc, "span", "wv-pp-everr", ed.err, btns).setAttribute("role", "alert");
    }

    _wvPeopleEventCancel(win: any) {
        const vv = views.get(win);
        if (!vv) return;
        vv.evEdit = null;
        this._wvPeopleTabRender(win);
    }

    /** Save the form's event: a date of the three forms and a What are needed;
     *  a link must be a web address. Saved to people.json, then drawn. */
    async _wvPeopleEventSave(win: any): Promise<boolean> {
        const vv = views.get(win);
        const ed = vv && vv.evEdit;
        if (!vv || !ed) return false;
        const rec = this._wvPeopleGetRec(ed.rec);
        if (!rec) { vv.evEdit = null; this._wvPeopleTabRender(win); return false; }
        const date = ed.date.trim(), what = ed.what.trim(), link = ed.link.trim();
        let err = "";
        if (!WV_PP_EVENT_DATE.test(date)) err = wvStr("weavero-people-event-bad-date", null, null);
        else if (!what) err = wvStr("weavero-people-event-need-what", null, null);
        else if (link && !wvPpEventLink(link)) err = wvStr("weavero-people-event-bad-link", null, null);
        if (err) { ed.err = err; this._wvPeopleTabRender(win); return false; }
        const e = wvPpEventNorm({ id: ed.id || undefined, date, what, where: ed.where, link, note: ed.note });
        if (!e) return false;
        const list: WvPpEvent[] = (rec.events || []).filter((x) => x.id !== e.id);
        list.push(e);
        rec.events = list;
        vv.evEdit = null;
        await this._wvPeopleSave([rec]);
        this._wvPeopleRenderAll();
        return true;
    }

    _wvPeopleEventRemoveAsk(win: any, recID: string, evID: string) {
        const rec = this._wvPeopleGetRec(recID);
        const e = rec && (rec.events || []).find((x) => x.id === evID);
        if (!rec || !e) return;
        let ok = false;
        try { ok = Services.prompt.confirm(win, wvStr("weavero-people-event-remove", null, null), wvStr("weavero-people-event-remove-confirm", { what: e.what, date: e.date }, null)); } catch (er) {}
        if (ok) this._wvPeopleEventRemove(recID, evID).catch((er: any) => Zotero.debug("[Weavero] people event remove err: " + er));
    }

    async _wvPeopleEventRemove(recID: string, evID: string): Promise<boolean> {
        const rec = this._wvPeopleGetRec(recID);
        if (!rec || !(rec.events || []).some((x) => x.id === evID)) return false;
        rec.events = (rec.events || []).filter((x) => x.id !== evID);
        if (!rec.events.length) delete rec.events;
        await this._wvPeopleSave([rec]);
        this._wvPeopleRenderAll();
        return true;
    }

    _wvPeopleRenderLinks(win: any, main: any, rec: WvPpRecord, v: WvPpView) {
        const doc = win.document;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "links");
        wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-sec-links", null, null), sec);
        const grid = wvHtmlEl(doc, "div", "wv-pp-facts", undefined, sec);
        for (const fact of WV_PP_LINKS) {
            if (!wvPpGroups(rec, fact).length && !(v.editing && v.editing.fact === fact)) continue;
            this._wvPeopleRenderFact(win, grid, rec, v, fact);
        }
        // Students seen from their own record.
        const rev = this._wvPeopleStudentsOf(rec).filter((x) => x.fromRecord);
        if (rev.length) {
            wvHtmlEl(doc, "div", "wv-pp-flabel", wvStr("weavero-people-link-student", null, null), grid).setAttribute("data-wv-pp-flabel", "reverse");
            const vals = wvHtmlEl(doc, "div", "wv-pp-fvals", undefined, grid);
            vals.setAttribute("data-wv-pp-fact", "reverse");
            const lOrder = this._wvPeopleNameOrder("links");
            for (const s of rev) {
                const row = wvHtmlEl(doc, "div", "wv-pp-val", undefined, vals);
                row.setAttribute("data-value", s.name);
                row.setAttribute("data-status", "reverse");
                const sr = s.id ? this._wvPeopleGetRec(s.id) : null;
                const nm = (sr ? wvPpNameAs(sr, lOrder) : wvPpNameTextAs(s.name, lOrder)) || s.name;
                const vt = wvHtmlEl(doc, "span", "wv-pp-vtext", nm + (s.years ? " (" + s.years + ")" : ""), row);
                vt.setAttribute("role", "link");
                vt.setAttribute("data-wv-pp-target", s.id || "");
                const sid = s.id;
                vt.addEventListener("click", () => { const lp: any = live(); if (lp && sid) lp._wvPeopleTabOpen(win, { personID: sid }); });
                // Where it comes from: in the edit mode (the sources are there).
                if (v.pageEdit) wvHtmlEl(doc, "span", "wv-pp-muted", wvStr("weavero-people-from-record", { name: s.name }, null), row);
            }
        }
        const issues = wvPpDateChecks(this._wvPeopleAllSync()).filter((i) => i.rec.id === rec.id || (i.other && i.other.id === rec.id));
        // Out of the edit mode (MJT 2026-11-26): the links only -- no card
        // without one, no add-link row.
        if (!v.pageEdit && !grid.firstChild && !issues.length) { sec.remove(); return; }
        if (!grid.firstChild) wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-links-none", null, null), sec);
        // This researcher's dates that do not fit (either side of the link).
        this._wvPeopleRenderDateIssues(win, sec, issues, false);
        if (!v.pageEdit) return;
        // Add a Link: a kind and a name (a person of People by that name gets their ids).
        const add = wvHtmlEl(doc, "div", "wv-pp-linkadd", undefined, sec);
        const sel = wvHtmlEl(doc, "select", undefined, undefined, add);
        sel.setAttribute("data-wv-pp-linktype", "true");
        for (const f of WV_PP_LINKS) {
            const opt = wvHtmlEl(doc, "option", undefined, factLabel(f), sel);
            opt.setAttribute("value", f);
        }
        const draft = v.linkDraft || null;
        if (draft && (WV_PP_LINKS as readonly string[]).includes(draft.fact)) sel.value = draft.fact;
        const box = wvHtmlEl(doc, "div", "wv-pp-pickbox", undefined, add);
        const inp = wvHtmlEl(doc, "input", undefined, undefined, box);
        inp.setAttribute("type", "text");
        inp.setAttribute("data-wv-pp-focus", "linkname");
        inp.setAttribute("placeholder", wvStr("weavero-people-link-name", null, "placeholder"));
        inp.setAttribute("role", "combobox");
        inp.setAttribute("aria-autocomplete", "list");
        inp.setAttribute("aria-expanded", "false");
        if (draft) inp.value = draft.text;
        // The researchers of People, offered under the field as it is focused
        // and typed in. Not a <datalist>: Zotero's main window never shows one
        // (its PopupAutoComplete stayed closed, 0 rows, after trusted typing
        // on 11.0-beta.5, MJT 2026-11-23 "I should be able to add another
        // researcher in my cards").
        const pick = wvHtmlEl(doc, "div", "wv-pp-pick", undefined, box);
        pick.setAttribute("role", "listbox");
        pick.hidden = true;
        const others = this._wvPeopleAllSync().filter((p) => p.id !== rec.id)
            .sort((a, b) => wvPpFold(a.last + " " + a.first).localeCompare(wvPpFold(b.last + " " + b.first)));
        let opts: Array<{ el: any; p: WvPpRecord }> = [];
        let active = -1;
        const keepDraft = () => { const vv = views.get(win); if (vv) vv.linkDraft = inp.value || sel.value !== WV_PP_LINKS[0] ? { fact: sel.value, text: inp.value } : null; };
        const close = () => { pick.hidden = true; active = -1; inp.setAttribute("aria-expanded", "false"); };
        const setActive = (i: number) => {
            active = i;
            opts.forEach((o, j) => o.el.setAttribute("aria-selected", j === i ? "true" : "false"));
            try { if (opts[i]) opts[i].el.scrollIntoView({ block: "nearest" }); } catch (e) {}
        };
        const choose = (p: WvPpRecord) => {
            const lp: any = live();
            const vv = views.get(win);
            if (vv) vv.linkDraft = null;
            close();
            // Out of the field: the redraw after the save would focus it again and reopen the list.
            try { inp.blur(); } catch (e) {}
            // The chosen record's own ids, so the link names that person even
            // when two records share the name.
            const r = wvPpRefOf(p);
            const ref: WvPpRef = {};
            for (const k of WV_PP_ID_KEYS) if ((r as any)[k]) (ref as any)[k] = (r as any)[k];
            // A link whose dates do not fit is asked about first (the Nodus study's
            // idea 2): the same check as the review screen's, on the two records.
            try {
                const trial: WvPpRecord = JSON.parse(JSON.stringify(rec));
                trial.lines.push({ fact: sel.value, value: wvPpDisplayName(p) || p.last, source: "me", status: "chosen", ref: Object.keys(ref).length ? ref : undefined });
                const lpd: any = lp || live();
                if (!lpd) return;
                const others = lpd._wvPeopleAllSync().filter((x: WvPpRecord) => x.id !== rec.id);
                const before = wvPpDateChecks([rec, ...others]).length;
                const issues = wvPpDateChecks([trial, ...others]);
                if (issues.length > before) {
                    const added = issues.find((i) => i.rec.id === rec.id && i.fact === sel.value) || issues[issues.length - 1];
                    let ok = false;
                    try { ok = Services.prompt.confirm(win, wvStr("weavero-people-date-confirm-title", null, null), wvStr("weavero-people-date-confirm", { text: lpd._wvPeopleDateIssueText(added) }, null)); } catch (e) { ok = true; }
                    if (!ok) return;
                }
            }
            catch (e) { Zotero.debug("[Weavero] people date check err: " + e); }
            if (lp) lp._wvPeopleFactEdit(win, rec.id, sel.value, wvPpDisplayName(p) || p.last, null, Object.keys(ref).length ? ref : undefined)
                .catch((e: any) => Zotero.debug("[Weavero] people link pick err: " + e));
        };
        const fill = () => {
            pick.textContent = "";
            opts = [];
            active = -1;
            const fq = wvPpFold(inp.value);
            const toks = fq ? fq.split(" ") : [];
            const lOrder = this._wvPeopleNameOrder("links");
            for (const p of others) {
                // Both orders: "Sauret, Alban" typed as the list writes it finds him too.
                const all = wvPpFold(wvPpDisplayName(p) + " " + p.last + " " + p.first + " " + wvPpNameForms(p).join(" "));
                const words = all.split(" ");
                // Any order, each word a prefix ("thor sig"), or a plain substring.
                if (fq && !all.includes(fq) && !toks.every((t) => words.some((w) => w.startsWith(t)))) continue;
                const o = wvHtmlEl(doc, "div", "wv-pp-pickopt", undefined, pick);
                o.setAttribute("role", "option");
                o.setAttribute("aria-selected", "false");
                o.setAttribute("data-wv-pp-person", p.id);
                const name = wvPpNameAs(p, lOrder) || p.last;
                wvHtmlEl(doc, "div", "wv-pp-rowname", name, o);
                const inst = wvPpShown(p, "institution")[0];
                if (inst) wvHtmlEl(doc, "div", "wv-pp-rowsub", inst.value, o);
                o.setAttribute("title", inst ? name + " -- " + inst.value : name);
                // The press keeps the focus in the field (else its blur closes the list first).
                o.addEventListener("mousedown", (e: any) => { e.preventDefault(); });
                o.addEventListener("click", () => { try { choose(p); } catch (e) {} });
                opts.push({ el: o, p });
            }
            pick.hidden = !opts.length;
            inp.setAttribute("aria-expanded", opts.length ? "true" : "false");
        };
        const go = () => {
            const lp: any = live();
            const text = inp.value;
            if (!lp || !text.trim()) return;
            const vv = views.get(win);
            if (vv) vv.linkDraft = null;
            close();
            try { inp.blur(); } catch (e) {}
            lp._wvPeopleFactEdit(win, rec.id, sel.value, text, null, undefined);
        };
        inp.addEventListener("focus", () => { try { fill(); } catch (e) {} });
        inp.addEventListener("blur", () => { try { close(); } catch (e) {} });
        inp.addEventListener("input", () => { try { keepDraft(); fill(); } catch (e) {} });
        sel.addEventListener("change", () => { try { keepDraft(); } catch (e) {} });
        inp.addEventListener("keydown", (e: any) => {
            try {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (pick.hidden) { fill(); if (opts.length) setActive(e.key === "ArrowDown" ? 0 : opts.length - 1); return; }
                    if (!opts.length) return;
                    setActive(e.key === "ArrowDown" ? Math.min(active + 1, opts.length - 1) : Math.max(active - 1, 0));
                }
                else if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!pick.hidden && opts[active]) choose(opts[active].p);
                    else go();
                }
                else if (e.key === "Escape" && !pick.hidden) {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            }
            catch (err) {}
        });
        const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr("weavero-people-link-add", null, null), add);
        b.setAttribute("type", "button");
        b.setAttribute("data-wv-pp-do", "link-add");
        b.addEventListener("click", go);
    }

    /** A record's advisors, as the tree draws them: shown values of its
     *  advisor and co-advisor links, each with their record when in People. */
    _wvPeopleAdvisorsOf(rec: WvPpRecord): Array<{ name: string; ref?: WvPpRef; id: string | null; years?: string }> {
        const out: Array<{ name: string; ref?: WvPpRef; id: string | null; years?: string }> = [];
        for (const f of ["link.advisor", "link.coadvisor"]) {
            for (const s of wvPpShown(rec, f)) {
                const t = this._wvPeopleFindByRef(s.value, s.ref);
                if (t && t.id === rec.id) continue;
                if (out.some((o) => (t && o.id === t.id) || wvPpSame("link.advisor", o.name, s.value, o.ref, s.ref))) continue;
                out.push({ name: t ? wvPpDisplayName(t) : s.value, ref: s.ref, id: t ? t.id : null, years: s.years });
            }
        }
        return out;
    }

    /** A record's students: its own student links, and the People whose
     *  advisor links name it (`fromRecord`). */
    _wvPeopleStudentsOf(rec: WvPpRecord): Array<{ name: string; ref?: WvPpRef; id: string | null; years?: string; fromRecord: boolean }> {
        const out: Array<{ name: string; ref?: WvPpRef; id: string | null; years?: string; fromRecord: boolean }> = [];
        for (const s of wvPpShown(rec, "link.student")) {
            const t = this._wvPeopleFindByRef(s.value, s.ref);
            if (t && t.id === rec.id) continue;
            out.push({ name: t ? wvPpDisplayName(t) : s.value, ref: s.ref, id: t ? t.id : null, years: s.years, fromRecord: false });
        }
        const mine = wvPpRefOf(rec);
        for (const other of this._wvPeopleAllSync()) {
            if (other.id === rec.id || out.some((o) => o.id === other.id)) continue;
            const names = ["link.advisor", "link.coadvisor"].flatMap((f) => wvPpShown(other, f));
            const hit = names.find((s) => wvPpRecordIs(rec, s.ref)
                || (!(s.ref && WV_PP_ID_KEYS.some((k) => s.ref && s.ref[k] && (mine as any)[k])) && wvPpNameMatch(rec.last, rec.first, wvPpSplitName(s.value).last, wvPpSplitName(s.value).first) === "exact"));
            if (!hit) continue;
            const py = wvPpShown(other, "phd.year")[0];
            out.push({ name: wvPpDisplayName(other), id: other.id, years: (py && py.value) || hit.years, fromRecord: true });
        }
        return out;
    }

    /** The publications: the person's OpenAlex works (the cache), each marked
     *  in the library or not (Weavero's reference matcher), with its item
     *  type's icon and its citation -- journal, volume, issue, pages: the
     *  library item's own fields where it is there, else OpenAlex `biblio`
     *  (MJT 2026-11-25: "the full metadata information usually displayed as
     *  citation"). A toolbar finds, shows all / in your library / not, sorts,
     *  and keeps some types or one journal, redrawn in place so the search
     *  field keeps the focus (`_wvPeopleWorksTools`). A click opens the
     *  library's item through Weavero's open rules (open-where.ts: Ctrl+click
     *  beside, Shift+click a window...), a paper you lack its page; the
     *  title's tooltip says where. Not looked up yet: the library's items with
     *  an author of this name. */
    _wvPeopleRenderWorks(win: any, main: any, rec: WvPpRecord, v: WvPpView) {
        const doc = win.document;
        const sec = wvHtmlEl(doc, "div", "wv-pp-sec", undefined, main);
        sec.setAttribute("data-wv-pp-sec", "works");
        const title = wvHtmlEl(doc, "div", "wv-pp-sectitle", wvStr("weavero-people-sec-works", null, null), sec);
        const body = wvHtmlEl(doc, "div", "wv-pp-works", undefined, sec);
        const P: any = this;
        (async () => {
            const cache = await this._wvPeopleCacheRead(rec.id);
            const lp: any = live() || P;
            if (!body.isConnected) return;
            // A work titled by its DOI alone is never shown nor counted (a cache
            // written before 1.3.0-peoplenet.15 still holds them).
            const cached: WvPpWork[] | null = cache && Array.isArray(cache.works) ? cache.works : null;
            const works: WvPpWork[] | null = cached ? cached.filter((w) => w && !wvPpWorkIsDoiOnly(w)) : null;
            const dropped = cached && works ? cached.length - works.length : 0;
            if (!works) {
                const ids = await lp._wvPeopleItemsByName(rec.last, rec.first, rec);
                if (!body.isConnected) return;
                wvHtmlEl(doc, "div", "wv-pp-muted", wvStr(ids.length ? "weavero-people-works-offline" : "weavero-people-works-none", null, null), body);
                body.setAttribute("data-wv-pp-works", "offline");
                for (const iid of ids.slice(0, WORKS_SHOWN)) {
                    const it = Zotero.Items.get(iid);
                    if (!it) continue;
                    let y: any = "";
                    try { y = Zotero.Date.multipartToSQL(it.getField("date", true, true)).slice(0, 4); } catch (e) {}
                    const w0: WvPpWork = { id: "item-" + iid, doi: doiOf(it), title: String(it.getDisplayTitle() || ""), year: Number(y) || null, venue: "", authors: [], nAuthors: 0 };
                    lp._wvPeopleWorkRow(win, body, lp._wvPeopleWorkInfo(w0, [iid]));
                }
                return;
            }
            body.setAttribute("data-wv-pp-works", "openalex");
            const key = works.length + ":" + (cache.date || "");
            let st = v.works.get(rec.id);
            if (!st || st.key !== key) { st = { key, inLib: null }; v.works.set(rec.id, st); }
            if (!st.inLib) {
                wvHtmlEl(doc, "div", "wv-pp-muted", "…", body);
                const m = await lp._wvPeopleWorksInLib(works);
                const cur = v.works.get(rec.id);
                if (cur && cur.key === key) cur.inLib = m;
                if (!body.isConnected) return;
                body.textContent = "";
                st = cur || st;
            }
            const inLib = (st && st.inLib) || new Map();
            const rows: WvPpWorkRow[] = works.map((w) => lp._wvPeopleWorkInfo(w, inLib.get(w.id) || null));
            const nIn = rows.filter((r) => r.ids).length;
            wvHtmlEl(doc, "span", "wv-pp-muted", wvStr("weavero-people-works-count", { inlib: nIn, total: Math.max(works.length, (Number(cache.worksCount) || cached.length) - dropped) }, null), title)
                .setAttribute("data-wv-pp-inlib", String(nIn));
            // The citation figures, with their source and date (MJT 2026-11-25:
            // "citation counts ... and also H-index for researchers"): OpenAlex's
            // own for one profile, else computed from the works listed.
            const oaIds = wvPpIds(rec, "openalex");
            const authors = oaIds.map((a) => cache.raw && cache.raw.openalex && cache.raw.openalex[a]).filter(Boolean);
            const mx = wvPpMetrics(authors, works);
            const dateText = cache.date ? String(cache.date).slice(0, 10) : "";
            sec.setAttribute("data-wv-pp-date", dateText);
            if (mx) {
                const ms = wvHtmlEl(doc, "span", "wv-pp-metrics", wvStr("weavero-people-metrics", { h: mx.h, i10: mx.i10, cites: mx.cites }, null), title);
                ms.setAttribute("data-wv-pp-metrics", mx.from);
                ms.setAttribute("data-h", String(mx.h));
                ms.setAttribute("title", wvStr("weavero-people-metrics-tip", { from: mx.from, date: dateText, works: mx.works, profiles: mx.profiles }, null));
            }
            // Semantic Scholar's figures, asked for on a click (the survey's step 5:
            // a second opinion, on demand only; its keyless pool refuses often).
            lp._wvPeopleRenderS2(win, title, rec, cache, works);
            lp._wvPeopleRenderScholar(win, title, rec, cache);
            lp._wvPeopleWorksTools(win, body, v, rows);
        })().catch((e: any) => Zotero.debug("[Weavero] people works err: " + e));
    }

    /** Semantic Scholar's figures in the Publications title: the ones read last
     *  (a link to the profile, the date in the tooltip), else a button that
     *  asks -- the network only on that click. */
    _wvPeopleRenderS2(win: any, title: any, rec: WvPpRecord, cache: any, works: WvPpWork[]) {
        const doc = win.document;
        const P: any = this;
        const st = P._wvPpS2Status && P._wvPpS2Status.get(rec.id);
        const s2 = cache && cache.s2;
        if (s2 && typeof s2.h === "number") {
            const el = wvHtmlEl(doc, "span", "wv-pp-metrics wv-pp-s2", wvStr("weavero-people-s2-figures", { h: s2.h, cites: s2.cites }, null), title);
            el.setAttribute("role", "link");
            el.setAttribute("tabindex", "0");
            el.setAttribute("data-wv-pp-s2", String(s2.h));
            el.setAttribute("title", wvStr("weavero-people-s2-tip", { date: String(s2.date || ""), url: String(s2.url || "") }, null));
            const u = String(s2.url || "");
            el.addEventListener("click", () => { const lp: any = live(); if (lp && u) lp._launchURL(u); });
        }
        if (!works.some((w) => w.doi)) return;
        const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr(st && st.busy ? "weavero-people-s2-busy" : s2 ? "weavero-people-s2-again" : "weavero-people-s2-ask", null, null), title);
        b.setAttribute("type", "button");
        b.setAttribute("data-wv-pp-act", "s2");
        b.setAttribute("title", wvStr("weavero-people-s2-ask-tip", null, null));
        b.disabled = !!(st && st.busy);
        b.addEventListener("click", () => { const lp: any = live(); if (lp) lp._wvPeopleS2FromTab(rec.id); });
        if (st && st.msg) wvHtmlEl(doc, "span", "wv-pp-muted wv-pp-s2msg", st.msg, title).setAttribute("role", "status");
    }

    /** Google Scholar (MJT 2026-11-25: "Yes, add the Google Scholar page"): the
     *  researcher's public profile, which the user gives, read on a click only --
     *  its first page, the one robots.txt allows. Its figures with the day and a
     *  link to the profile; a refusal (Scholar asks to prove one is not a robot)
     *  is said as such. */
    _wvPeopleRenderScholar(win: any, title: any, rec: WvPpRecord, cache: any) {
        const doc = win.document;
        const P: any = this;
        const st = P._wvPpGsStatus && P._wvPpGsStatus.get(rec.id);
        const gs = cache && cache.scholar;
        const btn = (act: string, id: string, tip: string, fn: () => void) => {
            const b = wvHtmlEl(doc, "button", "wv-pp-vbtn", wvStr(id, null, null), title);
            b.setAttribute("type", "button");
            b.setAttribute("data-wv-pp-act", act);
            if (tip) b.setAttribute("title", wvStr(tip, null, null));
            b.addEventListener("click", () => { try { fn(); } catch (e) {} });
            return b;
        };
        if (!rec.scholar) {
            btn("gs-add", "weavero-people-gs-add", "weavero-people-gs-add-tip", () => { const lp: any = live(); if (lp) lp._wvPeopleScholarAsk(win, rec.id); });
            if (st && st.msg) wvHtmlEl(doc, "span", "wv-pp-muted wv-pp-gsmsg", st.msg, title).setAttribute("role", "status");
            return;
        }
        const url = WV_PP_API.scholarProfile(rec.scholar);
        if (gs && gs.user === rec.scholar && typeof gs.h === "number") {
            const el = wvHtmlEl(doc, "span", "wv-pp-metrics wv-pp-gs", wvStr("weavero-people-gs-figures", { h: gs.h, i10: gs.i10, cites: gs.cites }, null), title);
            el.setAttribute("role", "link");
            el.setAttribute("tabindex", "0");
            el.setAttribute("data-wv-pp-gs", String(gs.h));
            el.setAttribute("title", wvStr("weavero-people-gs-tip", { date: String(gs.date || ""), url }, null));
            el.addEventListener("click", () => { const lp: any = live(); if (lp) lp._launchURL(url); });
        }
        btn("gs-read", st && st.busy ? "weavero-people-gs-busy" : "weavero-people-gs-read", "weavero-people-gs-read-tip", () => { const lp: any = live(); if (lp) lp._wvPeopleScholarRead(rec.id); }).disabled = !!(st && st.busy);
        btn("gs-forget", "weavero-people-gs-forget", "weavero-people-gs-forget-tip", () => { const lp: any = live(); if (lp) lp._wvPeopleScholarSet(rec.id, ""); });
        if (st && st.msg) wvHtmlEl(doc, "span", "wv-pp-muted wv-pp-gsmsg", st.msg, title).setAttribute("role", "status");
    }

    /** Ask for the profile's address; keep its user id. */
    _wvPeopleScholarAsk(win: any, id: string) {
        const P: any = this;
        const val: any = { value: "" };
        let ok = false;
        try { ok = Services.prompt.prompt(win, wvStr("weavero-people-gs-add", null, null), wvStr("weavero-people-gs-add-prompt", null, null), val, null, {}); } catch (e) {}
        if (!ok) return;
        const user = wvPpScholarId(String(val.value || ""));
        if (!P._wvPpGsStatus) P._wvPpGsStatus = new Map();
        if (!user) { P._wvPpGsStatus.set(id, { busy: false, msg: wvStr("weavero-people-gs-bad", null, null) }); this._wvPeopleRenderAll(); return; }
        P._wvPpGsStatus.delete(id);
        this._wvPeopleScholarSet(id, user).catch((e: any) => Zotero.debug("[Weavero] people scholar set err: " + e));
    }

    /** Keep (`user`) or forget ("") a researcher's Scholar profile. */
    async _wvPeopleScholarSet(id: string, user: string): Promise<boolean> {
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return false;
        if (user) rec.scholar = user;
        else delete rec.scholar;
        await this._wvPeopleSave([rec]);
        for (const w of wvMainWins()) { const v = views.get(w); if (v) v.works.delete(id); }
        this._wvPeopleRenderAll();
        return true;
    }

    /** THE request path for a page's HTML (Google Scholar's profile): no
     *  cookies (`anon`), Zotero's own User-Agent. The specs stub this. */
    async _wvPeopleGetText(url: string): Promise<string> {
        const xhr = await Zotero.HTTP.request("GET", url, { responseType: "text", anon: true, timeout: 20000, errorDelayMax: 0 });
        return xhr ? String(xhr.response || "") : "";
    }

    /** Read the profile's figures, on a click; kept in the cache with the day. */
    async _wvPeopleScholarRead(id: string): Promise<boolean> {
        const P: any = this;
        const rec = this._wvPeopleGetRec(id);
        if (!rec || !rec.scholar) return false;
        if (!P._wvPpGsStatus) P._wvPpGsStatus = new Map();
        if (P._wvPpGsStatus.get(id) && P._wvPpGsStatus.get(id).busy) return false;
        P._wvPpGsStatus.set(id, { busy: true, msg: "" });
        this._wvPeopleRenderAll();
        let msg = "", ok = false;
        try {
            const html = await (live() || P)._wvPeopleGetText(WV_PP_API.scholarProfile(rec.scholar));
            const fig = wvPpScholarFigures(html, rec.scholar, wvPpToday());
            if (!fig) msg = wvStr("weavero-people-gs-failed", { why: "refused", error: "" }, null);
            else {
                const lp: any = live() || P;
                const cur = (await lp._wvPeopleCacheRead(id)) || { v: 1 };
                await lp._wvPeopleCacheWrite(id, Object.assign({}, cur, { scholar: fig }));
                ok = true;
            }
        }
        catch (e) {
            const t = errText(e);
            msg = wvStr("weavero-people-gs-failed", { why: /\b(429|403)\b/.test(t) ? "refused" : "error", error: t }, null);
        }
        const lp: any = live() || P;
        if (!lp._wvPpGsStatus) lp._wvPpGsStatus = new Map();
        lp._wvPpGsStatus.set(id, { busy: false, msg });
        for (const w of wvMainWins()) { const v = views.get(w); if (v) v.works.delete(id); }
        lp._wvPeopleRenderAll();
        return ok;
    }

    async _wvPeopleS2FromTab(id: string) {
        const P: any = this;
        if (!P._wvPpS2Status) P._wvPpS2Status = new Map();
        if (P._wvPpS2Status.get(id) && P._wvPpS2Status.get(id).busy) return;
        P._wvPpS2Status.set(id, { busy: true, msg: "" });
        this._wvPeopleRenderAll();
        const r = await this._wvPeopleS2Fetch(id);
        const lp: any = live() || P;
        if (!lp._wvPpS2Status) lp._wvPpS2Status = new Map();
        lp._wvPpS2Status.set(id, { busy: false, msg: r.ok ? "" : wvStr("weavero-people-s2-failed", { why: r.why || "error", error: r.error || "" }, null) });
        for (const w of wvMainWins()) { const v = views.get(w); if (v) v.works.delete(id); }
        lp._wvPeopleRenderAll();
    }

    /** Ask Semantic Scholar for researcher `id`: their author id through the
     *  first of their papers with a DOI (at most three tried) whose authors hold
     *  exactly one name that fits, then that author's figures; kept in the
     *  cache with the day. `why`: "nodoi", "nomatch" or "error". */
    async _wvPeopleS2Fetch(id: string): Promise<{ ok: boolean; why?: string; error?: string }> {
        const P: any = this;
        const rec = this._wvPeopleGetRec(id);
        if (!rec) return { ok: false, why: "error" };
        const cache = await this._wvPeopleCacheRead(id);
        const works: WvPpWork[] = (cache && Array.isArray(cache.works) ? cache.works : []).filter((w: WvPpWork) => w && w.doi && !wvPpWorkIsDoiOnly(w));
        if (!works.length) return { ok: false, why: "nodoi" };
        try {
            let author = "";
            for (const w of works.slice(0, 3)) {
                const lp: any = live() || P;
                let p: any = null;
                try { p = await lp._wvPeopleGet(WV_PP_API.s2Paper(w.doi)); }
                catch (e) { if (/\b429\b/.test(errText(e))) throw e; continue; }
                author = wvPpS2AuthorOf(p, rec.last, rec.first);
                if (author) break;
            }
            if (!author) return { ok: false, why: "nomatch" };
            const lp: any = live() || P;
            const fig = wvPpS2Figures(await lp._wvPeopleGet(WV_PP_API.s2Author(author)), wvPpToday());
            if (!fig) return { ok: false, why: "nomatch" };
            const cur = (await lp._wvPeopleCacheRead(id)) || { v: 1 };
            await lp._wvPeopleCacheWrite(id, Object.assign({}, cur, { s2: fig }));
            return { ok: true };
        }
        catch (e) { return { ok: false, why: "error", error: errText(e) }; }
    }

    /** One publication as its row shows it (WvPpWorkRow): in a library, its
     *  first item's type, icon and citation fields (publicationTitle with its
     *  base-mapped proceedings/book titles, volume, issue, pages), each falling
     *  back to OpenAlex's; else OpenAlex's alone. */
    _wvPeopleWorkInfo(w: WvPpWork, ids: number[] | null): WvPpWorkRow {
        let item: any = null;
        try { item = ids && ids.length ? Zotero.Items.get(ids[0]) || null : null; } catch (e) {}
        const f = (name: string): string => { try { return item ? String(item.getField(name, false, true) || "").trim() : ""; } catch (e) { return ""; } };
        let type = w.type || "", icon = w.type || "";
        if (item) {
            try { type = String(Zotero.ItemTypes.getName(item.itemTypeID) || type); } catch (e) {}
            try { icon = String(item.getItemTypeIconName() || type); } catch (e) {}
        }
        let url = "";
        if (item) { try { url = String((this as any)._buildSelectLink(item) || ""); } catch (e) {} }
        else url = w.doi ? "https://doi.org/" + w.doi : (/^W\d+$/.test(w.id) ? "https://openalex.org/" + w.id : "");
        // The References' rule (refs.ts _wvRefsRead): a copy with a child file,
        // not a linked URL, of a type the reader opens (PDF, EPUB), not deleted.
        let linkedURL = 3;
        try { const m = Zotero.Attachments.LINK_MODE_LINKED_URL; if (typeof m === "number") linkedURL = m; } catch (e) {}
        const isDoc = (a: any): boolean => {
            try { return !!a && !a.deleted && a.isAttachment() && a.attachmentLinkMode !== linkedURL && WV_REFS_DOC_TYPES.includes(String(a.attachmentContentType || "")); }
            catch (e) { return false; }
        };
        const hasDoc = (id: number): boolean => {
            try {
                const it = Zotero.Items.get(id);
                if (!it) return false;
                if (it.isAttachment && it.isAttachment()) return isDoc(it);
                return (it.getAttachments ? it.getAttachments(false) : []).some((a: number) => isDoc(Zotero.Items.get(a)));
            } catch (e) { return false; }
        };
        const kind: WvRefsMarkKind = !ids || !ids.length ? "web" : ids.some(hasDoc) ? "pdf" : "nopdf";
        return {
            w, ids, item, type, icon, url, kind,
            venue: f("publicationTitle") || w.venue || "",
            volume: f("volume") || w.volume || "",
            issue: f("issue") || w.issue || "",
            pages: f("pages") || w.pages || "",
        };
    }

    /** `rows` as the toolbar `wk` keeps and orders them: the words of `q` all
     *  in the title, the authors, the journal or the DOI (folded); per funnel
     *  filter, one of its included values (if any) and none of its excluded
     *  ones. Newest first keeps OpenAlex's order within a year (a stable sort). */
    _wvPeopleWorksFilter(rows: WvPpWorkRow[], wk: WvPpWorksView): WvPpWorkRow[] {
        const words = wvPpFold(wk.q).split(" ").filter(Boolean);
        const out = rows.filter((r) => {
            for (const k of WORKS_FILTERS) {
                const v = worksValue(r, k);
                const inc = (wk.inc && wk.inc[k]) || [], exc = (wk.exc && wk.exc[k]) || [];
                if (inc.length && !inc.includes(v)) return false;
                if (exc.includes(v)) return false;
            }
            if (words.length) {
                const hay = wvPpFold([r.w.title, r.w.authors.join(" "), r.venue, r.w.doi].join(" "));
                if (!words.every((x) => hay.includes(x))) return false;
            }
            return true;
        });
        const year = (r: WvPpWorkRow) => r.w.year || 0;
        const cmp = (a: string, b: string): number => {
            try { if (typeof Zotero.localeCompare === "function") return Zotero.localeCompare(a, b); } catch (e) {}
            return a.localeCompare(b);
        };
        if (wk.sort === "old") out.sort((a, b) => (year(a) || 99999) - (year(b) || 99999));
        else if (wk.sort === "title") out.sort((a, b) => cmp(a.w.title || "", b.w.title || ""));
        // Without a journal: last.
        else if (wk.sort === "venue") out.sort((a, b) => (a.venue ? 0 : 1) - (b.venue ? 0 : 1) || cmp(a.venue, b.venue) || year(b) - year(a));
        // Most cited first; a work with no count (a cache from before the counts) last.
        else if (wk.sort === "cited") out.sort((a, b) => (typeof b.w.cited === "number" ? b.w.cited : -1) - (typeof a.w.cited === "number" ? a.w.cited : -1) || year(b) - year(a));
        else out.sort((a, b) => year(b) - year(a));
        return out;
    }

    /** The publications' toolbar and list, as the researchers' list above
     *  them: a search field (the words in the title, authors, journal or DOI),
     *  "Sort:" and its menu, and the funnel -- Weavero's filter popup
     *  (`_wvPeopleWorksFunnelOpen`: tri-state tiles, Alt+click excludes). Then
     *  the rows, and "N more" for the next ones. A change redraws the list
     *  alone (the search field keeps the focus). */
    _wvPeopleWorksTools(win: any, body: any, v: WvPpView, rows: WvPpWorkRow[]) {
        const doc = win.document;
        const wk = v.wk || (v.wk = worksViewNew());
        if (!wk.inc) wk.inc = {};
        if (!wk.exc) wk.exc = {};
        const bar = wvHtmlEl(doc, "div", "wv-pp-wtools", undefined, body);
        const search = wvHtmlEl(doc, "input", "wv-pp-wsearch", undefined, bar);
        search.setAttribute("type", "search");
        search.setAttribute("data-wv-pp-wsearch", "true");
        search.setAttribute("placeholder", wvStr("weavero-people-works-search", null, "placeholder"));
        search.value = wk.q;
        const tools = wvHtmlEl(doc, "div", "wv-pp-tools", undefined, bar);
        wvHtmlEl(doc, "span", "wv-pp-sortlab", wvStr("weavero-people-sort-label", null, null), tools);
        const sort = wvHtmlEl(doc, "button", "wv-pp-chip wv-pp-sortchip", undefined, tools);
        sort.setAttribute("type", "button");
        sort.setAttribute("aria-haspopup", "menu");
        sort.setAttribute("aria-expanded", "false");
        sort.setAttribute("data-wv-pp-wsort", "true");
        sort.setAttribute("title", wvStr("weavero-people-works-sort-tip", null, null));
        const sortLab = wvHtmlEl(doc, "span", "wv-pp-chiplab", "", sort);
        caretEl(doc, sort);
        const f = wvHtmlEl(doc, "button", "wv-pp-funnel", undefined, tools);
        f.setAttribute("type", "button");
        f.setAttribute("data-wv-pp-wfunnel", "true");
        f.setAttribute("aria-haspopup", "dialog");
        f.setAttribute("aria-expanded", "false");
        f.setAttribute("aria-label", wvStr("weavero-people-works-funnel-tip", null, null));
        f.setAttribute("title", wvStr("weavero-people-works-funnel-tip", null, null));
        const img = wvHtmlEl(doc, "img", undefined, undefined, f);
        img.setAttribute("src", WV_FUNNEL_DATA_URI);
        img.setAttribute("alt", "");
        caretEl(doc, f);
        const list = wvHtmlEl(doc, "div", "wv-pp-wlist", undefined, body);
        const draw = () => {
            const lp: any = live() || this;
            sortLab.textContent = wvStr("weavero-people-works-sort", { sort: wk.sort }, null);
            const on = worksFiltersOn(wk) > 0;
            f.classList.toggle("wv-pp-funnel-active", on);
            if (on) f.setAttribute("data-wv-pp-active", "true"); else f.removeAttribute("data-wv-pp-active");
            list.textContent = "";
            const shown: WvPpWorkRow[] = lp._wvPeopleWorksFilter(rows, wk);
            list.setAttribute("data-wv-pp-wshown", String(shown.length));
            if (!shown.length) { wvHtmlEl(doc, "div", "wv-pp-muted", wvStr("weavero-people-works-nomatch", null, null), list); return; }
            for (const r of shown.slice(0, wk.limit)) lp._wvPeopleWorkRow(win, list, r);
            if (shown.length > wk.limit) {
                const more = wvHtmlEl(doc, "button", "wv-pp-vbtn wv-pp-wmore", wvStr("weavero-people-works-more", { count: shown.length - wk.limit }, null), list);
                more.setAttribute("type", "button");
                more.setAttribute("data-wv-pp-wmore", "true");
                more.addEventListener("click", () => { wk.limit += WORKS_SHOWN; draw(); });
            }
        };
        sort.addEventListener("click", (e: any) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const lp: any = live() || this;
            lp._wvPeopleOpenMenu(win, sort, MENU_WSORT, (pop: any) => {
                for (const s of WORKS_SORTS) {
                    const mi = wvMenuItem(doc, {
                        l10n: { id: "weavero-people-works-sort", args: { sort: s } },
                        attrs: { type: "checkbox", autocheck: "false", "data-wv-pp-wsort": s },
                        onCommand: () => { wk.sort = s; wk.limit = WORKS_SHOWN; draw(); },
                    }, pop);
                    wvSetBoolAttr(mi, "checked", s === wk.sort);
                    if (s === "new") mi.setAttribute("acceltext", wvStr("weavero-menu-default-hint", null, null));
                }
            });
        });
        f.addEventListener("click", (e: any) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const lp: any = live() || this;
            if (doc.getElementById(WORKS_FUNNEL_ID)) lp._wvPeopleWorksFunnelClose(win);
            else lp._wvPeopleWorksFunnelOpen(win, f, rows, wk, () => { wk.limit = WORKS_SHOWN; draw(); });
        });
        search.addEventListener("input", () => { wk.q = search.value; wk.limit = WORKS_SHOWN; draw(); });
        draw();
    }

    /** The publications' funnel popup, Weavero's filter popup (the tabs menu's,
     *  the reader's): "Alt+click to exclude", Clear,
     *  Clear and Close; the on/off "In your library" tile; then Type (Zotero's
     *  item type icons), Journal and Decade, each value with how many
     *  publications have it, Unknown last. A tile click includes (or clears),
     *  Alt+click excludes (or clears); `changed` redraws the list. It lives in
     *  the tab's own box under the funnel; a press outside, Escape or a redraw
     *  of the tab closes it. */
    _wvPeopleWorksFunnelOpen(win: any, anchor: any, rows: WvPpWorkRow[], wk: WvPpWorksView, changed: () => void) {
        const P: any = this;
        try {
            const doc = win.document;
            const t = this._wvPeopleTabOf(win);
            const box = t ? doc.getElementById(t.id) : null;
            const v = views.get(win);
            if (!box || !v) return;
            this._wvPeopleWorksFunnelClose(win);
            const p = wvHtmlEl(doc, "div", undefined, undefined, box);
            p.id = WORKS_FUNNEL_ID;
            p.setAttribute("data-wv-tag", P._wvWireTag());
            p.setAttribute("role", "dialog");
            p.setAttribute("aria-label", wvStr("weavero-people-works-funnel-tip", null, null));
            p.addEventListener("keydown", (e: any) => {
                if (e.key !== "Escape") return;
                e.preventDefault(); e.stopPropagation();
                const lp: any = live(); if (lp) lp._wvPeopleWorksFunnelClose(win, true);
            });
            anchor.setAttribute("aria-expanded", "true");
            anchor.removeAttribute("title");
            (v as any).wfunnelDismiss = wvOutsideClick({
                panel: p, owner: this,
                keep: () => [anchor],
                onOutside: () => { const lp: any = live(); if (lp) lp._wvPeopleWorksFunnelClose(win); },
            });
            (p as any)._wvAnchor = anchor;
            const fill = () => {
                const scroll = p.scrollTop;
                p.textContent = "";
                const on = worksFiltersOn(wk) > 0;
                const top = wvHtmlEl(doc, "div", "wv-filter-top-bar", undefined, p);
                wvHtmlEl(doc, "span", "wv-filter-top-hint", wvStr("weavero-people-filter-hint", null, null), top);
                const clear = wvHtmlEl(doc, "button", "wv-filter-clear-btn", wvStr("weavero-people-filter-clear-all", null, null), top);
                clear.setAttribute("type", "button");
                clear.setAttribute("data-wv-pp-wfclear", "true");
                clear.addEventListener("click", (e: any) => { try { e.stopPropagation(); } catch (er) {} wk.inc = {}; wk.exc = {}; changed(); fill(); });
                const close = wvHtmlEl(doc, "button", "wv-filter-clear-icon", undefined, top);
                close.setAttribute("type", "button");
                close.setAttribute("data-wv-pp-wfclose", "true");
                close.setAttribute("title", wvStr("weavero-people-filter-clear-close", null, null));
                close.setAttribute("aria-label", wvStr("weavero-people-filter-clear-close", null, null));
                close.addEventListener("click", (e: any) => {
                    try { e.stopPropagation(); } catch (er) {}
                    wk.inc = {}; wk.exc = {}; changed();
                    const lp: any = live(); if (lp) lp._wvPeopleWorksFunnelClose(win, true);
                });
                if (!on) { clear.style.visibility = "hidden"; close.style.visibility = "hidden"; }
                const tile = (parent: any, key: string, value: string, label: string, count: number, iconType?: string, mark?: WvRefsMarkKind) => {
                    const inc = (wk.inc[key] || []).includes(value), exc = (wk.exc[key] || []).includes(value);
                    const b = wvHtmlEl(doc, "button", "wv-filter-opt wv-pp-fchip", undefined, parent);
                    b.setAttribute("type", "button");
                    b.setAttribute("data-wv-pp-wfkey", key);
                    b.setAttribute("data-wv-pp-wfval", value);
                    if (inc) b.dataset.selected = "true";
                    if (exc) b.dataset.excluded = "true";
                    b.setAttribute("aria-pressed", inc ? "true" : exc ? "mixed" : "false");
                    if (!count) b.setAttribute("data-wv-pp-zero", "true");
                    if (iconType) {
                        const i = wvHtmlEl(doc, "span", "icon icon-css icon-item-type", undefined, b);
                        i.setAttribute("data-item-type", iconType);
                    }
                    if (mark) wvRefsDrawMark(doc, wvHtmlEl(doc, "span", "wv-pp-fmark", undefined, b), mark, { width: 10, height: 10 }, null);
                    wvHtmlEl(doc, "span", "wv-pp-flab", label, b);
                    wvHtmlEl(doc, "span", "wv-pp-fn", String(count), b);
                    b.setAttribute("title", wvStr("weavero-people-filter-value-tip", { value: label, count }, null));
                    b.addEventListener("click", (e: any) => {
                        try { e.stopPropagation(); } catch (er) {}
                        // Weavero's tri-state tile (lib/people-list.ts wvPpFilterClick):
                        // a click includes or clears, Alt+click excludes or clears.
                        const alt = !!(e && e.altKey);
                        const was = inc ? "in" : exc ? "out" : null;
                        wk.inc[key] = (wk.inc[key] || []).filter((x) => x !== value);
                        wk.exc[key] = (wk.exc[key] || []).filter((x) => x !== value);
                        if (alt) { if (was !== "out") wk.exc[key].push(value); }
                        else if (was !== "in") wk.inc[key].push(value);
                        if (!wk.inc[key].length) delete wk.inc[key];
                        if (!wk.exc[key].length) delete wk.exc[key];
                        changed();
                        fill();
                    });
                    return b;
                };
                // The References' marks first (refs.ts _wvRefsSecChips: green dot,
                // blue dot, grey ring), any of them; a kind none has is left out.
                const ks = wvHtmlEl(doc, "div", "wv-pp-fsec wv-filter-or-group", undefined, p);
                ks.setAttribute("data-wv-pp-fsec", "kind");
                const krow = wvHtmlEl(doc, "div", "wv-filter-options", undefined, ks);
                for (const k of ["pdf", "nopdf", "web"] as WvRefsMarkKind[]) {
                    const n = rows.filter((r) => r.kind === k).length;
                    if (!n && !(wk.inc.kind || []).includes(k) && !(wk.exc.kind || []).includes(k)) continue;
                    tile(krow, "kind", k, wvStr("weavero-people-works-mark", { kind: k }, null), n, undefined, k);
                }
                const typeName = (x: string): string => {
                    try { const s = Zotero.ItemTypes.getLocalizedString(x); if (s) return String(s); } catch (e) {}
                    return x;
                };
                for (const key of ["type", "venue", "decade"]) {
                    const counts = new Map<string, number>();
                    for (const r of rows) { const x = worksValue(r, key); counts.set(x, (counts.get(x) || 0) + 1); }
                    // A value chosen before that no publication has now stays offered (0).
                    for (const x of [...(wk.inc[key] || []), ...(wk.exc[key] || [])]) if (!counts.has(x)) counts.set(x, 0);
                    const vals = [...counts.entries()];
                    if (key === "decade") vals.sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || Number(b[0]) - Number(a[0]));
                    else vals.sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1] - a[1] || a[0].localeCompare(b[0]));
                    if (vals.length < 2 && !(wk.inc[key] || wk.exc[key])) continue;
                    const sec = wvHtmlEl(doc, "div", "wv-pp-fsec wv-filter-or-group", undefined, p);
                    sec.setAttribute("data-wv-pp-fsec", key);
                    const h = wvHtmlEl(doc, "div", "wv-pp-fhead", undefined, sec);
                    wvHtmlEl(doc, "span", undefined, wvStr("weavero-people-works-filter", { filter: key }, null), h);
                    const opts = wvHtmlEl(doc, "div", "wv-filter-options", undefined, sec);
                    for (const [x, n] of vals) {
                        const label = !x ? wvStr("weavero-people-filter-unknown", null, null)
                            : key === "type" ? typeName(x) : key === "decade" ? filterValueLabel("phd", x) : x;
                        tile(opts, key, x, label, n, key === "type" && x ? x : undefined);
                    }
                }
                p.scrollTop = scroll;
            };
            fill();
            // Under the funnel, inside the tab's box (reads, then writes).
            const fr = anchor.getBoundingClientRect(), br = box.getBoundingClientRect();
            const w = p.getBoundingClientRect().width || 330;
            const left = Math.max(8, Math.min(fr.left - br.left, br.width - w - 8));
            const top = fr.bottom - br.top + 4;
            p.style.left = Math.round(left) + "px";
            p.style.top = Math.round(top) + "px";
            p.style.maxHeight = Math.max(120, Math.round(br.height - top - 8)) + "px";
        } catch (e) { Zotero.debug("[Weavero] people works funnel err: " + e); }
    }

    /** The publications' funnel popup closed; its funnel gets its tooltip back. */
    _wvPeopleWorksFunnelClose(win: any, focus?: boolean) {
        try {
            const v: any = views.get(win);
            if (v) wvDismissOff(v, "wfunnelDismiss");
            const p = win.document.getElementById(WORKS_FUNNEL_ID);
            const a = p && (p as any)._wvAnchor;
            if (p) p.remove();
            if (a && a.isConnected) {
                a.setAttribute("aria-expanded", "false");
                a.setAttribute("title", wvStr("weavero-people-works-funnel-tip", null, null));
                if (focus) a.focus();
            }
        } catch (e) {}
    }

    /** A publication's row: the References' mark (refs.ts drawMark: green dot
     *  with a PDF, blue dot without, grey ring not in your libraries -- MJT
     *  2026-11-25, "Why not use the same circles convention as in the
     *  references?"), the year, the item type's icon (an empty slot when
     *  unknown, so the titles line up), the title as a link whose tooltip is
     *  where a click goes, the authors and the citation (journal volume
     *  (issue), pages). In your library, the References' card of the item
     *  when the pointer rests on the row (`_wvPeopleWorkCardWire`). */
    _wvPeopleWorkRow(win: any, body: any, r: WvPpWorkRow) {
        const doc = win.document;
        const w = r.w, ids = r.ids;
        const row = wvHtmlEl(doc, "div", "wv-pp-work", undefined, body);
        row.setAttribute("data-wv-pp-work", w.id);
        row.setAttribute("data-in", ids ? "true" : "false");
        if (r.type) row.setAttribute("data-wv-pp-wtype", r.type);
        const mk = wvHtmlEl(doc, "span", "wv-pp-wmark", undefined, row);
        wvRefsDrawMark(doc, mk, r.kind, { width: 10, height: 10 }, null);
        mk.setAttribute("title", wvStr("weavero-people-works-mark", { kind: r.kind }, null));
        wvHtmlEl(doc, "span", "wv-pp-wyear", w.year ? String(w.year) : "", row);
        const ic = wvHtmlEl(doc, "span", r.icon ? "icon icon-css icon-item-type wv-pp-wicon" : "wv-pp-wicon", undefined, row);
        if (r.icon) {
            ic.setAttribute("data-item-type", r.icon);
            try { ic.setAttribute("title", Zotero.ItemTypes.getLocalizedString(r.type) || r.type); } catch (e) {}
        }
        const b = wvHtmlEl(doc, "div", "wv-pp-wbody", undefined, row);
        const t = wvHtmlEl(doc, "span", "wv-pp-wtitle", w.title || w.doi || w.id, b);
        t.setAttribute("role", "link");
        if (r.url) { t.setAttribute("title", r.url); t.setAttribute("data-wv-url", r.url); }
        // The citation: "Journal 12 (3), 45–67".
        let cite = r.venue;
        if (r.volume) cite += (cite ? " " : "") + r.volume;
        if (r.issue) cite += (cite ? " " : "") + "(" + r.issue + ")";
        if (r.pages) cite += (cite ? ", " : "") + r.pages;
        const meta = [w.authors.join(", ") + (w.nAuthors > w.authors.length ? ", …" : ""), cite].filter(Boolean).join(" · ");
        if (meta) {
            const m = wvHtmlEl(doc, "div", "wv-pp-wmeta", meta, b);
            if (cite) m.setAttribute("data-wv-pp-cite", cite);
        }
        // Times cited, OpenAlex's count at the last Refresh (its date in the tooltip).
        if (typeof w.cited === "number") {
            const c = wvHtmlEl(doc, "span", "wv-pp-wcited", wvStr("weavero-people-work-cited", { count: w.cited }, null), row);
            c.setAttribute("data-wv-pp-cited", String(w.cited));
            let date = "";
            try { const s0 = body.closest("[data-wv-pp-date]"); date = s0 ? s0.getAttribute("data-wv-pp-date") || "" : ""; } catch (e) {}
            c.setAttribute("title", wvStr("weavero-people-work-cited-tip", { date }, null));
        }
        if (ids && ids.length) this._wvPeopleWorkCardWire(win, row, ids);
        const open = (e: any) => {
            const lp: any = live();
            if (!lp) return;
            if (ids && ids.length) {
                const item = Zotero.Items.get(ids[0]);
                if (!item) return;
                const where = lp._wvOpenWhere(e) || "here";
                Promise.resolve(where === "here" ? false : lp._wvOpenTarget(win, { item }, where, t)).then((done: boolean) => {
                    if (!done && win.ZoteroPane) win.ZoteroPane.selectItem(item.id);
                }).catch(() => {});
            }
            else if (r.url) lp._launchURL(r.url);
        };
        t.addEventListener("click", open);
        t.addEventListener("auxclick", (e: any) => { if (e.button === 1) open(e); });
    }

    /** The References' card of a publication in your library (refs.ts
     *  _wvRefsCardOf -- MJT 2026-11-25: "Also reuse the same item cards as in
     *  the references"), with the References' hover rule (refs.ts
     *  _wvRefsRowHoverWire): shown when the pointer has rested 450 ms on the
     *  row, beside it; gone 250 ms after the pointer leaves row and card, so it
     *  can cross into the card (its abstract's More, its libraries' names --
     *  a click shows that copy in its library). One card per window. */
    _wvPeopleWorkCardWire(win: any, row: any, ids: number[]) {
        const st = (): any => { const v: any = views.get(win); if (!v) return null; return v.whc || (v.whc = { box: null, key: "", showT: null, hideT: null }); };
        row.addEventListener("mouseenter", () => {
            try {
                const s = st();
                if (!s) return;
                if (s.hideT) { win.clearTimeout(s.hideT); s.hideT = null; }
                if (s.showT) win.clearTimeout(s.showT);
                s.showT = win.setTimeout(() => {
                    s.showT = null;
                    const lp: any = live();
                    if (lp && row.isConnected) lp._wvPeopleWorkCardShow(win, row, ids);
                }, 450);
            } catch (e) {}
        });
        row.addEventListener("mouseleave", () => {
            try {
                const s = st();
                if (!s) return;
                if (s.showT) { win.clearTimeout(s.showT); s.showT = null; }
                const lp: any = live();
                if (lp) lp._wvPeopleWorkCardHide(win, false);
            } catch (e) {}
        });
    }

    _wvPeopleWorkCardShow(win: any, row: any, ids: number[]) {
        try {
            const v: any = views.get(win);
            const t = this._wvPeopleTabOf(win);
            const doc = win.document;
            const box0 = t ? doc.getElementById(t.id) : null;
            if (!v || !box0) return;
            const s = v.whc || (v.whc = { box: null, key: "", showT: null, hideT: null });
            const key = ids.join(",");
            if (s.box && s.box.isConnected && s.key === key) return;
            this._wvPeopleWorkCardHide(win, true);
            const items = ids.map((id) => Zotero.Items.get(id)).filter(Boolean);
            const card = (this as any)._wvRefsCardOf(doc, items, (copy: any) => {
                const lp: any = live();
                if (!lp) return;
                lp._wvPeopleWorkCardHide(win, true);
                return lp._wvRefsShowInLibrary(copy, win);
            });
            if (!card) return;
            const box = wvHtmlEl(doc, "div", "wv-pp-whcard", undefined, box0);
            box.setAttribute("data-wv-pp-whcard", key);
            box.appendChild(card);
            // Beside the row, under its title; above it when there is no room below
            // (reads, then writes).
            const br = box0.getBoundingClientRect(), rr = row.getBoundingClientRect();
            const title = row.querySelector(".wv-pp-wtitle");
            const tr = title ? title.getBoundingClientRect() : rr;
            const w = box.getBoundingClientRect().width || 440, h = box.getBoundingClientRect().height || 200;
            const left = Math.max(8, Math.min(tr.left - br.left, br.width - w - 8));
            let top = rr.bottom - br.top + 2;
            if (top + h > br.height - 8) top = Math.max(8, rr.top - br.top - h - 2);
            box.style.left = Math.round(left) + "px";
            box.style.top = Math.round(top) + "px";
            box.addEventListener("mouseenter", () => { if (s.hideT) { win.clearTimeout(s.hideT); s.hideT = null; } });
            box.addEventListener("mouseleave", () => { const lp: any = live(); if (lp) lp._wvPeopleWorkCardHide(win, false); });
            s.box = box;
            s.key = key;
            // Its More where the abstract is cut, its picture (refs.ts).
            try { (this as any)._wvRefsCardShown(box, card); } catch (e) {}
        } catch (e) { Zotero.debug("[Weavero] people work card err: " + e); }
    }

    /** The publication's card away: at once (`now`), or after the moment the
     *  pointer may spend crossing from the row into the card. */
    _wvPeopleWorkCardHide(win: any, now: boolean) {
        try {
            const v: any = views.get(win);
            const s = v && v.whc;
            if (!s || !s.box) return;
            const box = s.box;
            const go = () => { try { box.remove(); } catch (e) {} if (s.box === box) { s.box = null; s.key = ""; } };
            if (s.hideT) { win.clearTimeout(s.hideT); s.hideT = null; }
            if (now) { go(); return; }
            s.hideT = win.setTimeout(() => { s.hideT = null; go(); }, 250);
        } catch (e) {}
    }

    /** Spec hooks. */
    _wvPeopleRootOf(win: any): any {
        const t = this._wvPeopleTabOf(win);
        return t ? win.document.getElementById("wv-pp-root-" + t.id) : null;
    }
}

const _ppDescriptors = Object.getOwnPropertyDescriptors(_PeopleMixin.prototype);
delete (_ppDescriptors as any).constructor;
export const peopleMethods = _ppDescriptors;
