// Module: Feeds (branch feeds; MJT 2026-11-22, "Ok for the feeds plan").
//
// For every item of Zotero's Feeds, a relevance score 0-99 and its reasons,
// computed LOCALLY from the user's libraries -- never online, nothing written
// to any library:
//   (a) text closeness of title + abstract to the user's own papers (the My
//       Library items one of "Your name as author" wrote), then to My Library
//       (TF-IDF, lib/feed-score.ts, as a scored feed's tool computes it);
//   (b) authors who have papers in the libraries (groups too), and the
//       followed authors of the settings;
//   (c) the keyword alerts of the settings;
//   (d) the journals read most (publicationTitle counts, groups too);
//   (e) a scored feed's own score and reasons, read from its entries'
//       first two lines (lib/feed-score.ts wvFdParseRadar): they come first,
//       the local reasons follow.
// The weights are one table (lib/feed-score.ts WV_FD_WEIGHTS).
//
// Surfaces: a Relevance column in the feed views (a single feed and the Feeds
// row), sorting them most relevant first -- Zotero does not sort feeds at all
// (collectionTreeRow.js isSortable; collectionViewItemTree.jsx getSortField
// 'id', zotero#1072), so Weavero makes their columns sortable while the
// feature is on and gives Zotero's order back when it goes off; the "Why
// relevant" item-pane section; an in-library mark in the Relevance cell, and
// one items-list filter chip that hides those items (filter.ts
// `feedNotInLibrary`); Settings -> Weavero -> Feeds for the lists.
//
// The column's data provider only READS the score cache (a Cita column that
// parsed data in its renderer froze Zotero, cita#360): the scores are computed
// in the background, in idle slices as Cited by builds its index
// (cited-by.ts `_wvCbPace`), and kept in <data dir>/weavero/feeds/scores.json
// with the signature of what they were computed from (the libraries, the
// lists, the algorithm): a start whose signature matches reuses them without
// rebuilding the text index.
//
// The sorting override follows zotero-feed-sort (OssifiedSardine, MIT;
// https://github.com/OssifiedSardine/zotero-feed-sort): CollectionTreeRow's
// isSortable true for feeds, the items view's getSortField / getSortDirection
// answering the sorted column in a feed view, and a column-settings entry made
// before a header click so Zotero keeps the chosen sort. Here through wvWrap
// layers, given back in destroy() and when the setting goes off.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvSleep, wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvSvgEl } from "../lib/svg";
import { wvLibBadgeEl, wvLibBadgeMarkup } from "../lib/library-badge";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, wvSetBoolAttr } from "../lib/dom";
import { wvStoreRead, wvStoreWrite, wvStoreDir } from "../lib/store";
import { wvWrap, wvUnwrap } from "../lib/wrap";
import { wvMainWins, wvLibraryViews } from "../lib/windows";
import { wvRefCleanDOI, wvRefCompact } from "../lib/ref-match";
import { WvSectionDesc } from "./backlinks";
import { WV_REFS_ICONS } from "./refs";
import {
    WV_FD_WEIGHTS, WV_FD_TEXT_K, WV_FD_MIN_COSINE, WV_FD_MIN_JOURNAL, WvFdCorpus, WvFdVec, WvFdReason, WvFdLists,
    wvFdFold, wvFdTokenize, wvFdVector, wvFdCosine, wvFdCorpusSteps, wvFdNeighbours, wvFdNameParse, wvFdCreatorName,
    wvFdNameMatches, wvFdNameKey, wvFdAlertParse, wvFdAlertMatches, wvFdParseRadar, wvFdScore, wvFdImportAlerts,
    wvFdMergeList, wvFdExportDoc, wvFdIsNotice, wvFdGivenKey, wvFdNearLevel, WvFdName,
} from "../lib/feed-score";

declare const Zotero: any;
declare const Services: any;
declare const ChromeUtils: any;

const FD_DIR = "feeds";
/** The scores' format; and the algorithm's version, part of their signature
 *  (a change of the rules scores everything again). */
const FD_STORE_V = 1;
// 2: plain text, given names, notices out, the closest paper (2026-11-22).
// 3: a paper's own library copies out of its closeness and author counts (2026-11-22).
const FD_ALG_V = 3;
const SLICE_MS = 8;
/** The first pass this long after init (ms): Zotero's own start first. */
const START_DELAY_MS = 20000;
/** A library change rebuilds the text index this long after the last one (a
 *  sync or an import goes on for a while). */
const LIB_DELAY_MS = 60000;
/** New feed items are scored this long after they arrive. */
const FEED_DELAY_MS = 3000;
const SAVE_MS = 5000;
const REL_MAX = 8;
const TITLE_MIN = 20;
const COL_DATAKEY = "weaveroRelevance";
const LIBCOL_DATAKEY = "weaveroInLibrary";
const PLUGIN_ID = "weavero@mjthoraval";
const SEC_PANE_ID = "weavero-feeds";
const SEC_STYLE_ID = "wv-fd-sec-style";
const COL_STYLE_ID = "wv-fd-col-style";
const FD_PREFS = ["enableFeeds", "feedsJournals"];

const fdPath = (file: string) => PathUtils.join(wvStoreDir(), FD_DIR, file);

/** One item as the index reads it (SQL, no item objects: a group's items
 *  need not be loaded, and a feed's thousands of items stay unloaded). */
interface FdDoc { id: number; lib: number; key: string; title: string; abs: string; doi: string; pub: string; date: string; cr: Array<{ lastName: string; firstName: string }> }

interface FdIndex {
    sig: string;
    corpus: WvFdCorpus;
    own: Array<{ id: number; vec: WvFdVec }>;
    /** surname|first initial -> each way the given name is written there. */
    authors: Map<string, Map<string, { nm: WvFdName; n: number; ids: number[] }>>;
    journals: Map<string, { n: number; name: string }>;
    maxJ: number;
    byDOI: Map<string, number[]>;
    byTitle: Map<string, number[]>;
    byKey: Map<string, number[]>;
}

/** A feed item's score: `g` the signature it was computed under. */
export interface WvFdRec { g: string; score: number; inLib: boolean; libIDs: number[]; reasons: WvFdReason[]; rel: number[] }

/** The section's icon: a target -- what aims at your work -- in the grey,
 *  the 24-unit box and the 2-unit stroke of the References / Cited by glyphs
 *  (lib/link-glyph.ts wvPaperGlyphUri). DOUBLE quotes only: Zotero puts the
 *  URI in `url('...')` (the sidenav's --custom-sidenav-icon-*), and
 *  encodeURIComponent leaves `'` as it is, so a single-quoted attribute ended
 *  that string and no icon showed, in the header or the side navigation
 *  (MJT 2026-11-22, citations.14). */
function secIcon(color: string, size: number): string {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="9" stroke="' + color + '" stroke-width="2"/>'
        + '<circle cx="12" cy="12" r="4.5" stroke="' + color + '" stroke-width="2"/>'
        + '<circle cx="12" cy="12" r="1.25" fill="' + color + '"/></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
}

const FD_SECTION: WvSectionDesc = {
    paneID: SEC_PANE_ID,
    inst: "_wvFdSecKey", glob: "_wvFdSecKey", at: "_wvFdSecUnregAt", timer: "_wvFdSecTimer",
    header: { l10nID: "weavero-feeds-header", icon: secIcon("#5a5a5a", 16), darkIcon: secIcon("#c8c8c8", 16) },
    sidenav: { l10nID: "weavero-feeds-sidenav", icon: secIcon("#5a5a5a", 20), darkIcon: secIcon("#c8c8c8", 20) },
    bodyXHTML: '<html:div class="wv-fd-sec"></html:div>',
    hooks: { init: "_wvFdSecInit", destroy: "_wvFdSecDestroy", itemChange: "_wvFdSecItemChange", render: "_wvFdSecRender", asyncRender: "_wvFdSecAsyncRender" },
    enabled: (p) => { try { return !!p._wvFdOn(); } catch (e) { return false; } },
};

/** Zotero's row geometry (src-ts.md "Item-pane sections take Zotero's row
 *  geometry"), the rows and buttons of Cited by (cited-by.ts SEC_CSS). */
const SEC_CSS = `
.wv-fd-sec { display: flex; flex-direction: column; gap: 4px; contain: inline-size; }
/* The score and its reasons in a tinted box, apart from the related papers
   below (MJT 2026-11-22: "should be highlighted ... to distinguish it"):
   Zotero's own accent tint (the batch-edit header's --accent-blue10). */
.wv-fd-summary { display: flex; flex-direction: column; gap: 2px; padding: 6px 4px 6px 2px; border-radius: 5px;
    background: var(--accent-blue10, rgba(64, 114, 229, 0.1)); border-inline-start: 3px solid var(--accent-blue, #4072e5); contain: inline-size; }
.wv-fd-head { display: flex; align-items: center; gap: 6px; padding: 2px 4px; contain: inline-size; }
.wv-fd-score { font-weight: 600; }
.wv-fd-inlibline { display: inline-flex; align-items: center; gap: 4px; color: var(--fill-secondary, GrayText); }
.wv-fd-inlibline[hidden] { display: none; }
.wv-fd-inlibline svg { width: 12px; height: 12px; }
.wv-fd-reasons { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; }
.wv-fd-reason { contain: inline-size; overflow-wrap: anywhere; }
.wv-fd-reason::before { content: "\\2022"; color: var(--fill-secondary, GrayText); margin-inline-end: 6px; }
.wv-fd-reason.wv-fd-radar { font-style: italic; }
.wv-fd-subhead { padding: 4px 4px 0; color: var(--fill-secondary, GrayText); }
.wv-fd-subhead[hidden] { display: none; }
.wv-fd-list { display: flex; flex-direction: column; }
.wv-fd-row { display: flex; align-items: flex-start; gap: 4px; padding: 4px; border-radius: 5px; cursor: default; contain: inline-size; position: relative; }
.wv-fd-row:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }
.wv-fd-row .wv-fd-icon { flex: none; width: 16px; height: 16px; }
.wv-fd-row .wv-fd-icon > .icon { display: block; width: 16px; height: 16px; }
.wv-fd-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.wv-fd-meta { color: var(--fill-secondary, GrayText); }
/* The tag of the related paper a reason points at, in the score box's accent; the
   paper's own closeness at the row's end (MJT 2026-11-22). */
.wv-fd-reltag { font-size: 0.85em; padding: 0 5px; border-radius: 4px; white-space: nowrap;
    background: var(--accent-blue10, rgba(64, 114, 229, 0.1)); color: var(--accent-blue, #4072e5); }
.wv-fd-relscore { flex: none; margin-inline-start: auto; padding-inline-start: 6px; color: var(--fill-secondary, GrayText); font-variant-numeric: tabular-nums; }
.wv-fd-note { padding: 2px 4px; color: var(--fill-secondary, GrayText); font-size: 0.92em; }
.wv-fd-note[hidden] { display: none; }
.wv-fd-btns { position: absolute; inset-inline-end: 4px; top: 2px; display: none; gap: 1px; padding-inline-start: 4px; border-radius: 4px;
  background-color: var(--material-sidepane, Canvas); background-image: linear-gradient(var(--fill-quinary, rgba(128,128,128,0.12)), var(--fill-quinary, rgba(128,128,128,0.12))); }
.wv-fd-row:hover .wv-fd-btns, .wv-fd-row:focus-within .wv-fd-btns { display: flex; }
.wv-fd-btns .wv-refs-btn { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border-radius: 4px; color: var(--fill-secondary, #555); }
.wv-fd-btns .wv-refs-btn:hover { background: var(--fill-quinary, rgba(0,0,0,0.08)); color: var(--fill-primary, #222); }
.wv-fd-btns svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1; }
.wv-fd-btns svg .wv-fill { fill: currentColor; stroke: none; }
`;

/** The Relevance cell: the number at the end, the in-library mark before it. */
const COL_CSS = `
.wv-fd-cell { display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
.wv-fd-cell .wv-fd-inlib { flex: none; width: 12px; height: 12px; }
/* Block, else the inline <svg> sits on the text baseline, 2 px below its box
   (MJT 2026-11-22). White on a focused selected row, as Zotero turns its own
   row icons (_mixins.scss focus-states): the blue vanished into the blue. */
.wv-fd-cell .wv-fd-inlib svg { display: block; width: 12px; height: 12px; }
/* The In Library column: the icon centred; hovering it shows the copy's card. */
.wv-fd-libcell { display: flex; align-items: center; justify-content: center; }
.wv-fd-libcell .wv-fd-inlib { flex: none; width: 14px; height: 14px; cursor: default; }
.wv-fd-libcell .wv-fd-inlib svg { display: block; width: 14px; height: 14px; }
.virtualized-table:focus-within .row.selected .wv-fd-inlib svg { fill: var(--accent-white, #fff); }
`;

const secBodies: Map<any, () => any> = new Map();

const isFeedView = (v: any): boolean => {
    try {
        if (!v) return false;
        if (typeof v.isFeedsOrFeed === "function") return !!v.isFeedsOrFeed();
        // An items view without it: its (first) collection-tree row, plural
        // since Zotero 10 (the singular getter went).
        const r = (Array.isArray(v.collectionTreeRows) && v.collectionTreeRows[0]) || v.collectionTreeRow;
        return !!(r && r.isFeedsOrFeed && r.isFeedsOrFeed());
    }
    catch (e) { return false; }
};

const normList = (a: any): string[] => {
    const out: string[] = [];
    for (const s of Array.isArray(a) ? a : []) {
        const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
        if (t && out.indexOf(t) < 0) out.push(t);
    }
    return out;
};

const hash = (s: string): string => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
};

const yearOf = (d: string): string => { const m = String(d || "").match(/\d{4}/); return m ? m[0] : ""; };

class _FeedsMixin {
    [k: string]: any;

    /** The feature's switch (Settings -> Weavero -> Feeds). */
    _wvFdOn(): boolean {
        try { return !!this._wvPref("enableFeeds"); } catch (e) { return false; }
    }

    _wvFdIsFeedView(v: any): boolean { return isFeedView(v); }

    // ---- the lists (<data dir>/weavero/feeds/settings.json) ----------------------

    async _wvFdSettingsGet(): Promise<WvFdLists> {
        const P: any = this;
        if (P._wvFdSettings) return P._wvFdSettings;
        const r = await wvStoreRead(fdPath("settings.json"));
        const d = r.status === "ok" && r.doc ? r.doc : {};
        P._wvFdSettings = { myNames: normList(d.myNames), followed: normList(d.followed), alerts: normList(d.alerts), watched: normList(d.watched), citedPersons: normList(d.citedPersons) };
        return P._wvFdSettings;
    }

    /** Change some lists; written at once, scored again shortly. */
    async _wvFdSettingsSet(patch: Partial<WvFdLists>): Promise<WvFdLists> {
        const P: any = this;
        const s = Object.assign({}, await this._wvFdSettingsGet());
        for (const k of ["myNames", "followed", "alerts", "watched", "citedPersons"] as Array<keyof WvFdLists>) {
            if (patch && patch[k] !== undefined) s[k] = normList(patch[k]);
        }
        P._wvFdSettings = s;
        await wvStoreWrite(fdPath("settings.json"), Object.assign({ v: 1 }, s));
        if (!P._wvDestroyed && this._wvFdOn()) this._wvFdSchedule(1500, "lists changed");
        return s;
    }

    /** How many items of My Library one of `names` wrote (Settings' live
     *  count; "my publications"). */
    async _wvFdCountMine(names: string[]): Promise<number> {
        const ns = normList(names).map(wvFdNameParse).filter((n) => n) as any[];
        if (!ns.length) return 0;
        const surnames = new Set(ns.map((n) => n.last));
        const ids = new Set<number>();
        const skip = this._wvFdSkipTypes();
        await Zotero.DB.queryAsync(
            "SELECT ic.itemID, c.lastName, c.firstName FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID JOIN items i ON i.itemID = ic.itemID"
            + " WHERE i.libraryID = ? AND i.itemID NOT IN (SELECT itemID FROM deletedItems)"
            + (skip.length ? " AND i.itemTypeID NOT IN (" + skip.map(() => "?").join(",") + ")" : ""),
            [Zotero.Libraries.userLibraryID, ...skip],
            { onRow: (row: any) => {
                const c = { lastName: String(row.getResultByIndex(1) || ""), firstName: String(row.getResultByIndex(2) || "") };
                const n = wvFdCreatorName(c);
                if (n && surnames.has(n.last) && ns.some((m) => wvFdNameMatches(m, n))) ids.add(row.getResultByIndex(0));
            } });
        return ids.size;
    }

    /** The alerts file of the lists (lib/feed-score.ts wvFdExportDoc), at
     *  `path` or <data dir>/weavero/feeds/alerts.json. An alerts file already
     *  there is read first: its stamp stays, and so does what its tool resolved
     *  for an entry (its OpenAlex ids). Returns the path. */
    async _wvFdExport(path?: string): Promise<string> {
        const s = await this._wvFdSettingsGet();
        const p = path || fdPath("alerts.json");
        const prev = await wvStoreRead(p, { onParseError: "keep" });
        await wvStoreWrite(p, wvFdExportDoc(s, new Date(), prev.status === "ok" ? prev.doc : null), { pretty: 1 });
        return p;
    }

    async _wvFdPick(win: any, mode: "save" | "open"): Promise<string | null> {
        const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
        const fp = new FilePicker();
        fp.init(win, wvStr(mode === "save" ? "weavero-feeds-export-as-title" : "weavero-feeds-import-title", null, null), mode === "save" ? fp.modeSave : fp.modeOpen);
        fp.appendFilter("JSON", "*.json");
        if (mode === "save") fp.defaultString = "alerts.json";
        const rv = await fp.show();
        if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;
        return String(fp.file);
    }

    /** Export... : the same file wherever the user picks. */
    async _wvFdExportAs(win: any): Promise<string | null> {
        const p = await this._wvFdPick(win, "save");
        return p ? this._wvFdExport(p) : null;
    }

    /** The lists a Scholar alert file or an alerts file holds,
     *  added to the settings' (lib/feed-score.ts wvFdImportAlerts: of a Scholar
     *  file, target, type and name only). Returns how many entries were added. */
    async _wvFdImportDoc(doc: any): Promise<number> {
        const got = wvFdImportAlerts(doc);
        const s = await this._wvFdSettingsGet();
        const next = {
            followed: wvFdMergeList(s.followed, got.followed, true),
            citedPersons: wvFdMergeList(s.citedPersons, got.citedPersons, true),
            watched: wvFdMergeList(s.watched, got.watched, false),
            alerts: wvFdMergeList(s.alerts, got.alerts, false),
        };
        const n = (next.followed.length - s.followed.length) + (next.citedPersons.length - s.citedPersons.length)
            + (next.watched.length - s.watched.length) + (next.alerts.length - s.alerts.length);
        await this._wvFdSettingsSet(next);
        return n;
    }

    async _wvFdImportFrom(win: any): Promise<number | null> {
        const p = await this._wvFdPick(win, "open");
        if (!p) return null;
        const text = await Zotero.File.getContentsAsync(p);
        return this._wvFdImportDoc(JSON.parse(String(text)));
    }

    // ---- reading the libraries -------------------------------------------------------

    _wvFdSkipTypes(): number[] {
        const out: number[] = [];
        for (const t of ["note", "attachment", "annotation"]) { try { const id = Zotero.ItemTypes.getID(t); if (id) out.push(id); } catch (e) {} }
        return out;
    }

    /** The items of the libraries `libs` (an SQL subquery of libraryIDs), or
     *  of `ids`: their fields and creators. */
    async _wvFdRead(libs: string, ids?: number[]): Promise<Map<number, FdDoc>> {
        const F = Zotero.ItemFields;
        const fid: Record<string, number> = {};
        for (const f of ["title", "abstractNote", "publicationTitle", "DOI", "date"]) { try { const id = F.getID(f); if (id) fid[f] = id; } catch (e) {} }
        const byFid = new Map<number, string>(Object.keys(fid).map((k) => [fid[k], k] as [number, string]));
        const skip = this._wvFdSkipTypes();
        const docs = new Map<number, FdDoc>();
        const inIds = ids && ids.length ? " AND i.itemID IN (" + ids.map(() => "?").join(",") + ")" : "";
        const where = " WHERE i.libraryID IN (" + libs + ") AND i.itemID NOT IN (SELECT itemID FROM deletedItems)"
            + (skip.length ? " AND i.itemTypeID NOT IN (" + skip.map(() => "?").join(",") + ")" : "") + inIds;
        const args = [...skip, ...(ids || [])];
        await Zotero.DB.queryAsync("SELECT i.itemID, i.libraryID, i.key FROM items i" + where, args, { onRow: (row: any) => {
            const id = row.getResultByIndex(0);
            docs.set(id, { id, lib: row.getResultByIndex(1), key: String(row.getResultByIndex(2)), title: "", abs: "", doi: "", pub: "", date: "", cr: [] });
        } });
        const fids = Object.values(fid);
        if (fids.length) {
            await Zotero.DB.queryAsync("SELECT i.itemID, d.fieldID, v.value FROM items i JOIN itemData d ON d.itemID = i.itemID JOIN itemDataValues v ON v.valueID = d.valueID"
                + where + " AND d.fieldID IN (" + fids.map(() => "?").join(",") + ")", [...args, ...fids], { onRow: (row: any) => {
                const d = docs.get(row.getResultByIndex(0));
                const f = byFid.get(row.getResultByIndex(1));
                if (!d || !f) return;
                const v = String(row.getResultByIndex(2) || "");
                if (f === "title") d.title = v; else if (f === "abstractNote") d.abs = v; else if (f === "publicationTitle") d.pub = v;
                else if (f === "DOI") d.doi = v; else if (f === "date") d.date = v;
            } });
        }
        await Zotero.DB.queryAsync("SELECT i.itemID, c.lastName, c.firstName FROM items i JOIN itemCreators ic ON ic.itemID = i.itemID JOIN creators c ON c.creatorID = ic.creatorID"
            + where + " ORDER BY i.itemID, ic.orderIndex", args, { onRow: (row: any) => {
            const d = docs.get(row.getResultByIndex(0));
            if (d) d.cr.push({ lastName: String(row.getResultByIndex(1) || ""), firstName: String(row.getResultByIndex(2) || "") });
        } });
        return docs;
    }

    /** What the scores depend on, cheaply: the libraries' size and last change,
     *  the lists, the journals setting, the algorithm. */
    async _wvFdSig(): Promise<string> {
        const s = await this._wvFdSettingsGet();
        let lib = "";
        try {
            const r = await Zotero.DB.rowQueryAsync("SELECT COUNT(*) AS n, MAX(clientDateModified) AS m, MAX(itemID) AS x FROM items WHERE libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))");
            lib = r ? r.n + ":" + r.m + ":" + r.x : "";
        } catch (e) {}
        let j = true;
        try { j = !!this._wvPref("feedsJournals"); } catch (e) {}
        return hash([FD_ALG_V, lib, j ? 1 : 0, JSON.stringify(s)].join("|"));
    }

    // ---- pacing ----------------------------------------------------------------------

    /** Go on while the slice has time, else wait for a main window's next idle
     *  moment (cited-by.ts `_wvCbPace`, its backstop included: a window closed
     *  meanwhile never calls back). */
    async _wvFdPace(force = false): Promise<void> {
        const P: any = this;
        if (!force && P._wvFdSliceAt && Date.now() - P._wvFdSliceAt < SLICE_MS) return;
        P._wvFdSliceAt = 0;
        await new Promise<void>((res) => {
            let w: any = null;
            try { w = Zotero.getMainWindow(); } catch (e) {}
            let hidden = true;
            try { hidden = !w || w.closed || !!w.document.hidden; } catch (e) {}
            let done = false;
            const go = () => {
                if (done) return;
                done = true;
                const it = P._wvFdIdle;
                P._wvFdIdle = null;
                try { if (it && it.t) wvClearTimeout(it.t); } catch (e) {}
                try { if (it && it.w && !it.w.closed && it.id != null) it.w.cancelIdleCallback(it.id); } catch (e) {}
                res();
            };
            if (!hidden && typeof w.requestIdleCallback === "function") P._wvFdIdle = { w, id: w.requestIdleCallback(go, { timeout: 1000 }), t: wvTimeout(go, 2000), res: go };
            else P._wvFdIdle = { t: wvTimeout(go, 4), res: go };
        });
        P._wvFdSliceAt = Date.now();
    }

    async _wvFdSteps<T>(g: Generator<void, T, void>): Promise<T | null> {
        const P: any = this;
        for (;;) {
            const r = g.next();
            if (r.done) return r.value;
            await this._wvFdPace();
            if (P._wvDestroyed || !this._wvFdOn()) { try { g.return(undefined as any); } catch (e) {} return null; }
        }
    }

    // ---- the index -------------------------------------------------------------------

    /** The text index of My Library, the user's own papers in it, and the
     *  author, journal, DOI and title tables of every user and group library. */
    async _wvFdBuild(sig: string): Promise<FdIndex | null> {
        const P: any = this;
        const t0 = Date.now();
        const s = await this._wvFdSettingsGet();
        const docs = await this._wvFdRead("SELECT libraryID FROM libraries WHERE type IN ('user', 'group')");
        if (P._wvDestroyed) return null;
        await this._wvFdPace(true);
        const mine = s.myNames.map(wvFdNameParse).filter((n) => n);
        const userLib = Zotero.Libraries.userLibraryID;
        const ix: FdIndex = { sig, corpus: null as any, own: [], authors: new Map(), journals: new Map(), maxJ: 0, byDOI: new Map(), byTitle: new Map(), byKey: new Map() };
        const push = (m: Map<string, number[]>, k: string, id: number) => { if (!k) return; const a = m.get(k); if (a) a.push(id); else m.set(k, [id]); };
        const text: Array<[number, string]> = [];
        const ownIds: number[] = [];
        let n = 0;
        for (const d of docs.values()) {
            if (++n % 200 === 0) { await this._wvFdPace(); if (P._wvDestroyed || !this._wvFdOn()) return null; }
            push(ix.byKey, d.key, d.id);
            push(ix.byDOI, wvRefCleanDOI(d.doi), d.id);
            const ct = wvRefCompact(d.title);
            if (ct.length >= TITLE_MIN) push(ix.byTitle, ct, d.id);
            const jk = wvFdFold(d.pub).replace(/[^a-z0-9]+/g, " ").trim();
            if (jk) {
                const j = ix.journals.get(jk);
                if (j) j.n++; else ix.journals.set(jk, { n: 1, name: d.pub });
            }
            const seen = new Set<string>();
            let isMine = false;
            for (const c of d.cr) {
                const nm = wvFdCreatorName(c);
                const k = wvFdNameKey(nm);
                // One entry per way the name is written under a surname and
                // first initial: "Gao, Tian", "Gao, Tong", "Gao, T.-C." are kept
                // apart, so a feed's "Gao, Tian-Yu" meets none of them.
                const vk = nm ? (wvFdGivenKey(nm) || "#" + nm.inits) : "";
                if (k && nm && !seen.has(k + "|" + vk)) {
                    seen.add(k + "|" + vk);
                    let vars = ix.authors.get(k);
                    if (!vars) { vars = new Map(); ix.authors.set(k, vars); }
                    const a = vars.get(vk);
                    // Every paper's id (not 3): a feed paper's own copies are taken out of its counts.
                    if (a) { a.n++; a.ids.push(d.id); } else vars.set(vk, { nm, n: 1, ids: [d.id] });
                }
                if (!isMine && mine.some((m) => wvFdNameMatches(m, nm))) isMine = true;
            }
            // A correction notice's text is its paper's title: no closeness from it.
            if (d.lib === userLib && (d.title || d.abs) && !wvFdIsNotice(d.title)) {
                text.push([d.id, d.title + " " + d.abs]);
                if (isMine) ownIds.push(d.id);
            }
        }
        for (const j of ix.journals.values()) if (j.n > ix.maxJ) ix.maxJ = j.n;
        const corpus = await this._wvFdSteps(wvFdCorpusSteps(text));
        if (!corpus) return null;
        ix.corpus = corpus;
        const ownSet = new Set(ownIds);
        for (const [id, t] of text) {
            if (!ownSet.has(id)) continue;
            ix.own.push({ id, vec: wvFdVector(corpus, wvFdTokenize(t)) });
            await this._wvFdPace();
        }
        Zotero.debug("[Weavero] feeds: index of " + docs.size + " library items (" + text.length + " texts, " + ix.own.length + " of yours) in " + (Date.now() - t0) + " ms");
        return ix;
    }

    // ---- scoring -----------------------------------------------------------------------

    /** The library ids of a `key` (a scored feed's lib= / near=), My Library's first. */
    _wvFdIdsOfKey(ix: FdIndex, key: string): number[] {
        const ids = ix.byKey.get(key) || [];
        const u = Zotero.Libraries.userLibraryID;
        const lib = (id: number) => { try { const it = Zotero.Items.get(id); return it ? it.libraryID : 0; } catch (e) { return 0; } };
        return ids.slice().sort((a, b) => (lib(a) === u ? 0 : 1) - (lib(b) === u ? 0 : 1));
    }

    _wvFdScoreDoc(ix: FdIndex, d: FdDoc, s: WvFdLists, journals: boolean): WvFdRec {
        const radar = wvFdParseRadar(d.abs);
        const abs = radar ? radar.abstract : d.abs;
        const text = d.title + " " + abs;
        const vec = wvFdVector(ix.corpus, wvFdTokenize(text));
        // The library's own copies of this very paper (DOI, then title) are left out of
        // its closeness: "close to itself" said nothing and raised the score of every
        // paper already in the library (MJT 2026-11-22, "Close to 'Holes in Sheets'").
        let libIDs = ix.byDOI.get(wvRefCleanDOI(d.doi)) || [];
        if (!libIDs.length) { const ct = wvRefCompact(d.title); if (ct.length >= TITLE_MIN) libIDs = ix.byTitle.get(ct) || []; }
        const self = new Set<number>(libIDs);
        let own: { s: number; id: number } | null = null;
        for (const o of ix.own) { if (self.has(o.id)) continue; const c = wvFdCosine(vec, o.vec); if (!own || c > own.s) own = { s: c, id: o.id }; }
        const nb = vec.size ? wvFdNeighbours(ix.corpus, vec, 10, self) : [];
        const top = nb.slice(0, WV_FD_TEXT_K);
        // The closest paper named in the reason: not the user's own paper when
        // that one has its own reason already.
        const near = nb.find((x) => !(own && own.s >= WV_FD_MIN_COSINE && x.id === own.id)) || null;
        const lib = top.length ? { s: top.reduce((a, x) => a + x.s, 0) / WV_FD_TEXT_K, n: nb.filter((x) => x.s >= WV_FD_MIN_COSINE).length,
            id: near ? near.id : undefined, best: near ? near.s : undefined } : null;
        const authors: Array<{ name: string; n: number; k: number }> = [];
        const authorIds: number[] = [];
        const names = d.cr.map((c) => ({ c, n: wvFdCreatorName(c) }));
        for (const { c, n } of names) {
            const vars = ix.authors.get(wvFdNameKey(n));
            if (!vars) continue;
            // The ways the library writes this person; k: the different people
            // among them (written-out given names), the weight is split by it.
            // Their papers other than this one's own copies (an author known only
            // through the very paper is not "in your library").
            const hit = [...vars.values()].map((v) => ({ v, ids: v.ids.filter((i) => !self.has(i)) })).filter((x) => x.ids.length && wvFdNameMatches(n, x.v.nm));
            if (!hit.length) continue;
            const k = Math.max(1, new Set(hit.map((x) => wvFdGivenKey(x.v.nm)).filter((g) => g)).size);
            authors.push({ name: c.firstName ? c.firstName + " " + c.lastName : c.lastName, n: hit.reduce((a, x) => a + x.ids.length, 0), k });
            for (const x of hit) authorIds.push(...x.ids.slice(0, 2));
        }
        const followed = s.followed.filter((f) => { const fn = wvFdNameParse(f); return names.some(({ n }) => wvFdNameMatches(fn, n)); });
        const alerts = s.alerts.filter((q) => wvFdAlertMatches(wvFdAlertParse(q), text));
        let journal = null;
        if (journals && d.pub) {
            const j = ix.journals.get(wvFdFold(d.pub).replace(/[^a-z0-9]+/g, " ").trim());
            if (j && j.n >= WV_FD_MIN_JOURNAL && ix.maxJ > 0) journal = { name: j.name, n: j.n, share: Math.log(1 + j.n) / Math.log(1 + ix.maxJ) };
        }
        const sc = wvFdScore({ own, lib, authors, followed, alerts, journal, radar });
        const rel: number[] = [];
        const add = (id: number) => { if (id && rel.indexOf(id) < 0 && libIDs.indexOf(id) < 0 && rel.length < REL_MAX) rel.push(id); };
        if (radar) for (const k of ["lib", "near"]) for (const key of radar.fields[k] || []) { const ids = this._wvFdIdsOfKey(ix, key); if (ids.length) add(ids[0]); }
        if (own && own.s >= WV_FD_MIN_COSINE) add(own.id);
        for (const x of nb.slice(0, 5)) if (x.s >= WV_FD_MIN_COSINE) add(x.id);
        for (const id of authorIds) add(id);
        return { g: ix.sig, score: sc.score, inLib: libIDs.length > 0, libIDs: libIDs.slice(0, 5), reasons: sc.reasons, rel };
    }

    /** The cached score of feed item `id`, or null. */
    _wvFdRecOf(id: number): WvFdRec | null {
        const m: Map<number, WvFdRec> | null = (this as any)._wvFdRecs;
        return (m && m.get(id)) || null;
    }

    /** The column's data: the score, 3 digits (it sorts as text too), then "L"
     *  when the item is in a library; "" for an item without a score. */
    _wvFdCell(item: any): string {
        try {
            if (!item || !item.isFeedItem) return "";
            const r = this._wvFdRecOf(item.id);
            return r ? String(r.score).padStart(3, "0") + (r.inLib ? "L" : "") : "";
        }
        catch (e) { return ""; }
    }

    /** The filter's `feedNotInLibrary` test (filter.ts WV_DIM_TESTS): a feed
     *  item no library holds; any other row passes. */
    _wvFdNotInLibrary(item: any): boolean {
        try {
            if (!item || !item.isFeedItem) return true;
            const r = this._wvFdRecOf(item.id);
            return !(r && r.inLib);
        }
        catch (e) { return true; }
    }

    _wvFdIndexReady(): boolean { return !!(this as any)._wvFdRecs; }

    // ---- the pass ----------------------------------------------------------------------

    /** Score what needs it, one pass at a time (a call while one runs waits
     *  for it). `rebuild`: the index again and every feed item scored again;
     *  `ids`: only these feed items. */
    _wvFdRefresh(why: string, opts?: { rebuild?: boolean; ids?: number[] }): Promise<void> {
        const P: any = this;
        const next = (P._wvFdChain || Promise.resolve()).catch(() => {}).then(() => {
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed || !this._wvFdOn()) return;
            return this._wvFdPass(why, opts || {});
        });
        P._wvFdChain = next;
        next.then(() => { if (P._wvFdChain === next) P._wvFdChain = null; }, () => { if (P._wvFdChain === next) P._wvFdChain = null; });
        return next.catch((e: any) => Zotero.debug("[Weavero] feeds pass err: " + e));
    }

    async _wvFdPass(why: string, opts: { rebuild?: boolean; ids?: number[] }): Promise<void> {
        const P: any = this;
        const t0 = Date.now();
        P._wvFdRunning = true;
        try {
            if (!P._wvFdRecs) await this._wvFdLoadScores();
            if (P._wvDestroyed) return;
            const recs: Map<number, WvFdRec> = P._wvFdRecs;
            const sig = await this._wvFdSig();
            const feedLibs = "SELECT libraryID FROM feeds";
            // A long list of ids is a whole pass: SQLite binds a bounded number
            // of parameters (a first refresh of a big feed adds hundreds).
            if (opts.ids && opts.ids.length > 400) opts = Object.assign({}, opts, { ids: undefined });
            const docs = await this._wvFdRead(feedLibs, opts.ids);
            if (P._wvDestroyed) return;
            if (!opts.ids) for (const id of Array.from(recs.keys())) if (!docs.has(id)) recs.delete(id);
            const todo = Array.from(docs.values()).filter((d) => opts.rebuild || !recs.has(d.id) || recs.get(d.id)!.g !== sig);
            if (!todo.length) { if (!opts.ids) P._wvFdSavedSig = sig; return; }
            let ix: FdIndex | null = P._wvFdIx;
            if (opts.rebuild || !ix || ix.sig !== sig) {
                ix = await this._wvFdBuild(sig);
                if (!ix) return;
                P._wvFdIx = ix;
            }
            const s = await this._wvFdSettingsGet();
            let journals = true;
            try { journals = !!this._wvPref("feedsJournals"); } catch (e) {}
            let changed = 0;
            for (const d of todo) {
                await this._wvFdPace();
                if (P._wvDestroyed || !this._wvFdOn()) return;
                const r = this._wvFdScoreDoc(ix, d, s, journals);
                const old = recs.get(d.id);
                if (!old || old.score !== r.score || old.inLib !== r.inLib) changed++;
                recs.set(d.id, r);
            }
            Zotero.debug("[Weavero] feeds: pass (" + why + ") scored " + todo.length + " feed items in " + (Date.now() - t0) + " ms");
            this._wvFdSaveSoon();
            this._wvFdRefreshViews(changed > 0);
            this._wvFdSecRefreshAll();
        }
        finally { P._wvFdRunning = false; P._wvFdSliceAt = 0; }
    }

    async _wvFdLoadScores(): Promise<void> {
        const P: any = this;
        const m = new Map<number, WvFdRec>();
        const r = await wvStoreRead(fdPath("scores.json"));
        if (r.status === "ok" && r.doc && r.doc.v === FD_STORE_V && r.doc.recs) {
            for (const k of Object.keys(r.doc.recs)) { const id = Number(k); if (Number.isFinite(id)) m.set(id, r.doc.recs[k]); }
        }
        if (!P._wvFdRecs) P._wvFdRecs = m;
    }

    _wvFdSaveSoon() {
        const P: any = this;
        if (P._wvFdSaveT) return;
        P._wvFdSaveT = wvTimeout(() => {
            P._wvFdSaveT = null;
            const lp: any = wvLivePlugin();
            if (lp === P && !P._wvDestroyed) lp._wvFdSave().catch(() => {});
        }, SAVE_MS);
    }

    _wvFdSave(): Promise<void> {
        const P: any = this;
        const m: Map<number, WvFdRec> | null = P._wvFdRecs;
        if (!m) return Promise.resolve();
        const recs: Record<string, WvFdRec> = {};
        for (const [id, r] of m) recs[String(id)] = r;
        return wvStoreWrite(fdPath("scores.json"), { v: FD_STORE_V, recs }, { pretty: null });
    }

    _wvFdSchedule(ms: number, why: string, opts?: { rebuild?: boolean }) {
        const P: any = this;
        if (P._wvDestroyed || !this._wvFdOn()) return;
        const at = Date.now() + ms;
        if (P._wvFdPassT && P._wvFdPassAt <= at && !(opts && opts.rebuild)) return;
        wvClearTimeout(P._wvFdPassT);
        P._wvFdPassAt = at;
        P._wvFdPassT = wvTimeout(() => {
            P._wvFdPassT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            lp._wvFdRefresh(why, opts);
        }, ms);
    }

    // ---- the item observer ------------------------------------------------------------

    _wvFdWireNotifier() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvFdObsID) {
                if (g._wvFdObsVer === tag) return;
                try { Zotero.Notifier.unregisterObserver(g._wvFdObsID); } catch (e) {}
                delete g._wvFdObsID;
            }
            g._wvFdObsVer = tag;
            g._wvFdObsID = Zotero.Notifier.registerObserver({
                notify: (event: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = wvLivePlugin();
                        if (!lp || lp._wvWireTag() !== tag) return;
                        lp._wvFdOnItems(event, type, ids || []);
                    } catch (e) {}
                },
            }, ["item", "feedItem"], "weavero-feeds", 96);
        } catch (e) { Zotero.debug("[Weavero] feeds notifier err: " + e); }
    }

    _wvFdUnwireNotifier() {
        try {
            const g: any = Zotero;
            if (g._wvFdObsID) { try { Zotero.Notifier.unregisterObserver(g._wvFdObsID); } catch (e) {} }
            delete g._wvFdObsID; delete g._wvFdObsVer;
        } catch (e) {}
    }

    /** A feed item added or changed: scored a moment later; one gone: its score
     *  goes. A library item: the index is built again a minute after the last
     *  change. */
    _wvFdOnItems(event: string, type: string, ids: any[]) {
        const P: any = this;
        if (!this._wvFdOn() || !["add", "modify", "delete", "trash", "refresh", "move"].includes(event)) return;
        const feed: number[] = [];
        let lib = false;
        for (const raw of ids) {
            const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
            if (!Number.isFinite(id)) continue;
            let it: any = null;
            try { it = Zotero.Items.get(id); } catch (e) {}
            if (type === "feedItem" || (it && it.isFeedItem)) {
                if (event === "delete") { const m: Map<number, WvFdRec> | null = P._wvFdRecs; if (m) m.delete(id); }
                else feed.push(id);
            }
            else lib = true;
        }
        if (feed.length) {
            const q: Set<number> = P._wvFdNewIds || (P._wvFdNewIds = new Set());
            for (const id of feed) q.add(id);
            wvClearTimeout(P._wvFdNewT);
            P._wvFdNewT = wvTimeout(() => {
                P._wvFdNewT = null;
                const lp: any = wvLivePlugin();
                if (lp !== P || P._wvDestroyed) return;
                const list = Array.from(P._wvFdNewIds || []) as number[];
                P._wvFdNewIds = new Set();
                if (list.length) lp._wvFdRefresh("new feed items", { ids: list });
            }, FEED_DELAY_MS);
        }
        if (lib) this._wvFdSchedule(LIB_DELAY_MS, "library changed");
    }

    // ---- the column --------------------------------------------------------------------

    /** Zotero limits a column to view types (itemTree.jsx _matchesViewType,
     *  `enabledIn`; Zotero 10 and 11 have it): the column then exists in the
     *  feed views only. Without it, it shows everywhere, empty outside them. */
    _wvFdViewTypesKnown(): boolean {
        try {
            const w: any = Zotero.getMainWindow();
            const v = w && w.ZoteroPane && w.ZoteroPane.itemsView;
            if (v) return typeof v._matchesViewType === "function";
        } catch (e) {}
        return !!(Zotero.CollectionTreeRow && Zotero.CollectionTreeRow.visibilityGroups);
    }

    _wvFdColumnOn() {
        const P: any = this;
        try {
            const M = Zotero.ItemTreeManager;
            if (P._wvFdColKey || !M || typeof M.registerColumn !== "function") return;
            const opt: any = {
                dataKey: COL_DATAKEY,
                label: wvStr("weavero-feeds-col"),
                pluginID: PLUGIN_ID,
                // Shown by default in the feed views (Zotero's own Feed column
                // is `defaultIn` them, itemTreeColumns.jsx).
                defaultIn: ["feed", "feeds"],
                sortReverse: true,
                // 96: the header's words fit beside the sort arrow in every language (64 cut them to
                // "Rele…"; they need 39-60 px; l10n-fit audit 2026-11-26). A width the user stored stays.
                width: "96",
                minWidth: 40,
                staticWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["width", "hidden", "sortDirection"],
                dataProvider: (item: any) => { const lp: any = wvLivePlugin(); return lp ? lp._wvFdCell(item) : ""; },
                // The number only: the in-library mark has its own column since
                // citations.18 (MJT 2026-11-22). The data keeps its "L" so equal
                // scores still list the papers you have first.
                renderCell: (index: number, data: any, column: any, isFirst: boolean, doc: any) => {
                    const span = doc.createElement("span");
                    span.className = "cell wv-fd-cell " + (column.className || "");
                    const s = String(data || "");
                    if (s) {
                        const n = doc.createElement("span");
                        n.textContent = String(parseInt(s, 10));
                        span.appendChild(n);
                    }
                    try { const lp: any = wvLivePlugin(); if (lp) lp._wvFdColStyle(doc); } catch (e) {}
                    return span;
                },
            };
            if (this._wvFdViewTypesKnown()) opt.enabledIn = ["feed", "feeds"];
            const key = M.registerColumn(opt);
            if (key) P._wvFdColKey = key;
        } catch (e) { Zotero.debug("[Weavero] feeds column err: " + e); }
        this._wvFdLibColumnOn();
    }

    /** The "In Library" column of the feed views (MJT 2026-11-22: "The information that
     *  it is already in my library can probably fit in a separate column. When hovering
     *  on the library icon, it would show the item card"): the library's icon -- My
     *  Library's blue, a group's teal -- for a feed item a library holds; hovering it
     *  shows the badge's card (feeds-badge.ts). Sorts My Library's first. */
    _wvFdLibColumnOn() {
        const P: any = this;
        try {
            const M = Zotero.ItemTreeManager;
            if (P._wvFdLibColKey || !M || typeof M.registerColumn !== "function") return;
            const opt: any = {
                dataKey: LIBCOL_DATAKEY,
                label: wvStr("weavero-feeds-libcol"),
                pluginID: PLUGIN_ID,
                // The header is the library icon; the name shows in the column picker.
                // Fixed-colour, not context-fill: it needs no fill rule in the column
                // sheet (constants.ts; test/column-header-icons.spec.js, 2026-11-24).
                iconPath: "data:image/svg+xml," + encodeURIComponent(wvLibBadgeMarkup("user")),
                defaultIn: ["feed", "feeds"],
                sortReverse: true,
                width: "28",
                fixedWidth: true,
                showInColumnPicker: true,
                zoteroPersist: ["hidden", "sortDirection"],
                dataProvider: (item: any) => { const lp: any = wvLivePlugin(); return lp ? lp._wvFdLibCell(item) : ""; },
                renderCell: (index: number, data: any, column: any, isFirst: boolean, doc: any) => {
                    const span = doc.createElement("span");
                    span.className = "cell wv-fd-libcell " + (column.className || "");
                    const m = /^([12]):(\d+)$/.exec(String(data || ""));
                    if (m) {
                        const feedID = Number(m[2]);
                        const mk = doc.createElement("span");
                        mk.className = "wv-fd-inlib";
                        mk.setAttribute("data-wv-fd-item", String(feedID));
                        wvLibBadgeEl(doc, m[1] === "2" ? "user" : "group", mk).setAttribute("class", "wv-fd-inlib-svg");
                        // Hover or click: the reference menu of the copy (feeds-badge.ts).
                        try { const lp: any = wvLivePlugin(); if (lp) lp._wvFdCardHover(doc.defaultView, mk, feedID); } catch (e) {}
                        span.appendChild(mk);
                    }
                    try { const lp: any = wvLivePlugin(); if (lp) lp._wvFdColStyle(doc); } catch (e) {}
                    return span;
                },
            };
            if (this._wvFdViewTypesKnown()) opt.enabledIn = ["feed", "feeds"];
            const key = M.registerColumn(opt);
            if (key) P._wvFdLibColKey = key;
        } catch (e) { Zotero.debug("[Weavero] feeds library column err: " + e); }
    }

    /** The "In Library" column's data: "2:<id>" (My Library holds it), "1:<id>" (a
     *  group does), "" (none, or not scored yet); it sorts My Library's first. */
    _wvFdLibCell(item: any): string {
        try {
            if (!item || !item.isFeedItem) return "";
            const r = this._wvFdRecOf(item.id);
            if (!r || !r.inLib || !r.libIDs.length) return "";
            const u = Zotero.Libraries.userLibraryID;
            const mine = r.libIDs.some((id: number) => { try { const it = Zotero.Items.get(id); return !!(it && it.libraryID === u); } catch (e) { return false; } });
            return (mine ? "2:" : "1:") + item.id;
        }
        catch (e) { return ""; }
    }

    _wvFdColStyle(doc: any) {
        try { if (!doc.getElementById(COL_STYLE_ID)) wvInjectStyle(doc, COL_STYLE_ID, COL_CSS); } catch (e) {}
    }

    _wvFdColumnOff() {
        const P: any = this;
        try { if (P._wvFdColKey && Zotero.ItemTreeManager) Zotero.ItemTreeManager.unregisterColumn(P._wvFdColKey); } catch (e) {}
        P._wvFdColKey = null;
        try { if (P._wvFdLibColKey && Zotero.ItemTreeManager) Zotero.ItemTreeManager.unregisterColumn(P._wvFdLibColKey); } catch (e) {}
        P._wvFdLibColKey = null;
        for (const w of wvMainWins()) { try { wvRemoveStyle(w.document, COL_STYLE_ID); } catch (e) {} }
    }

    // ---- sorting the feed views -----------------------------------------------------------

    /** The sorted column of a feed view: the one the user clicked (saved in the
     *  view's column settings), else Relevance, most relevant first. Null when
     *  the view is not a feed's or the column is missing: Zotero answers. */
    _wvFdEnsureSort(v: any): any {
        const key = (this as any)._wvFdColKey;
        if (!key || !this._wvFdOn() || !isFeedView(v)) return null;
        const cols: any[] = v._getColumns();
        const rel = cols.find((c) => c.dataKey === key);
        const sc = v._sortedColumn;
        let saved = false;
        try { saved = Object.values(v._getColumnPrefs ? v._getColumnPrefs() : {}).some((x: any) => x && x.sortDirection); } catch (e) {}
        if (sc && cols.includes(sc) && sc.sortDirection && saved) return sc;
        if (!rel) return null;
        for (const c of cols) if (c !== rel) delete c.sortDirection;
        rel.sortDirection = -1;
        v._sortedColumn = rel;
        this._wvFdSyncHeader(v);
        return rel;
    }

    /** The header draws the TABLE's copies of the columns (virtualized-table.jsx
     *  `Columns`, Object.assign'ed from the view's when the view hands it a new
     *  array), not the view's own: a sort mark set on the view's columns after
     *  that copy never shows, and a first click on Relevance then only "sets"
     *  the direction it already had (MJT 2026-11-22: no arrow on a feed's first
     *  showing; test/feeds.spec.js "before any header click"). Mirror the
     *  mark onto the copies and draw the header again (later: never inside a
     *  render, where getSortField may be asked). */
    _wvFdSyncHeader(v: any) {
        try {
            const t = v && v.tree;
            if (!t || typeof t._getColumns !== "function") return;
            const want = new Map<string, any>(v._getColumns().map((c: any) => [c.dataKey, c.sortDirection]));
            let changed = false;
            for (const c of t._getColumns()) {
                const d = want.get(c.dataKey);
                if ((c.sortDirection || 0) === (d || 0)) continue;
                if (d) c.sortDirection = d; else delete c.sortDirection;
                changed = true;
            }
            if (changed) wvTimeout(() => { try { t.forceUpdate(); } catch (e) {} }, 0);
        } catch (e) {}
    }

    _wvFdSortField(v: any): string | null {
        const c = this._wvFdEnsureSort(v);
        return c ? c.dataKey : null;
    }

    _wvFdSortDir(v: any, sortFields: any): number {
        if (!this._wvFdEnsureSort(v)) return 0;
        const cols: any[] = v._getColumns();
        const fields: string[] = sortFields || v.getSortFields();
        for (const f of fields) { const c = cols.find((x) => x.dataKey === f); if (c && c.sortDirection) return c.sortDirection; }
        return (fields[0] === (this as any)._wvFdColKey || fields[0] === "date") ? -1 : 1;
    }

    /** Zotero keeps a header click's sort only for a column that already has
     *  settings (itemTree.jsx _handleColumnSort): give it some (zotero-feed-sort's
     *  remedy). */
    _wvFdBeforeColumnSort(v: any, index: number) {
        if (!isFeedView(v) || !v.props || !v.props.columnPicker) return;
        const c = v._getColumn(index);
        if (!v._columnPrefs) v._columnPrefs = {};
        if (c && !v._columnPrefs[c.dataKey]) v._columnPrefs[c.dataKey] = { dataKey: c.dataKey };
    }

    /** Feeds' rows sortable (Zotero.CollectionTreeRow, one prototype for every
     *  window). */
    _wvFdWireRows() {
        const P: any = this;
        const proto = Zotero.CollectionTreeRow && Zotero.CollectionTreeRow.prototype;
        if (!proto) return;
        wvWrap(proto, "isSortable", "feeds", P._wvWireTag(), (orig: any) => function (this: any) {
            try {
                const lp: any = wvLivePlugin();
                if (lp && lp._wvFdOn() && this.isFeedsOrFeed && this.isFeedsOrFeed()) return true;
            } catch (e) {}
            return orig.apply(this, arguments);
        });
    }

    /** A main window's items views: one per library tab on a Zotero with its
     *  own windows (zotero#6035), else the pane's one. */
    _wvFdViewsOf(win: any): any[] {
        const views = wvLibraryViews(win);
        const ivs = views.length ? views.map((v: any) => v && v.itemsView) : [win && win.ZoteroPane && win.ZoteroPane.itemsView];
        return ivs.filter((v: any, i: number) => v && ivs.indexOf(v) === i);
    }

    /** The window's items views: their sort answers in a feed view (the wiring
     *  table's `feeds-sort`, run again for each further library tab). */
    _wvFdWireView(win: any) {
        try {
            if (!this._wvFdOn()) return;
            for (const v of this._wvFdViewsOf(win)) this._wvFdWireOneView(v);
        } catch (e) { Zotero.debug("[Weavero] feeds view wire err: " + e); }
    }

    _wvFdWireOneView(v: any) {
        const P: any = this;
        try {
            if (!v || typeof v.getSortField !== "function") return;
            const tag = P._wvWireTag();
            wvWrap(v, "getSortField", "feeds", tag, (orig: any) => function (this: any) {
                try { const lp: any = wvLivePlugin(); const f = lp ? lp._wvFdSortField(this) : null; if (f) return f; } catch (e) {}
                return orig.apply(this, arguments);
            });
            wvWrap(v, "getSortDirection", "feeds", tag, (orig: any) => function (this: any, sortFields: any) {
                try { const lp: any = wvLivePlugin(); const d = lp ? lp._wvFdSortDir(this, sortFields) : 0; if (d) return d; } catch (e) {}
                return orig.apply(this, arguments);
            });
            // An arrow-function field, handed to the table as onColumnSort at
            // each render (its `this` is not the view): the view is captured.
            if (typeof v._handleColumnSort === "function") {
                wvWrap(v, "_handleColumnSort", "feeds", tag, (orig: any) => function (this: any, index: number) {
                    try { const lp: any = wvLivePlugin(); if (lp) lp._wvFdBeforeColumnSort(v, index); } catch (e) {}
                    return orig.apply(this, arguments);
                });
            }
            if (isFeedView(v)) {
                this._wvFdEnsureSort(v);
                const p = v.sort();
                if (p && typeof p.then === "function") p.then(() => { try { v.forceUpdate(); } catch (e) {} }, () => {});
            }
        } catch (e) { Zotero.debug("[Weavero] feeds view wire err: " + e); }
    }

    /** Zotero's own order back in every window (the setting off, destroy()). */
    _wvFdUnwireAll() {
        try { if (Zotero.CollectionTreeRow) wvUnwrap(Zotero.CollectionTreeRow.prototype, "isSortable", "feeds"); } catch (e) {}
        const all: any[] = [];
        for (const w of wvMainWins()) { try { all.push(...this._wvFdViewsOf(w)); } catch (e) {} }
        for (const v of all) {
            let had = false;
            for (const m of ["getSortField", "getSortDirection", "_handleColumnSort"]) { try { if (wvUnwrap(v, m, "feeds")) had = true; } catch (e) {} }
            if (!had) continue;
            // The table's props keep `this._handleColumnSort` from the last render (the
            // wrapper) until the view renders again: render now (zzz-disable-leftovers).
            if (!isFeedView(v)) { try { v.forceUpdate(); } catch (e) {} continue; }
            try {
                for (const c of v._getColumns()) delete c.sortDirection;
                v._sortedColumn = null;
                if ("_columnsId" in v) v._columnsId = null;
                const p = v.sort();
                if (p && typeof p.then === "function") p.then(() => { try { v.forceUpdate(); } catch (e) {} }, () => {});
            } catch (e) {}
        }
    }

    /** The feed views drawn again after a pass; sorted again when scores moved
     *  and Relevance is the sort. */
    _wvFdRefreshViews(resort: boolean) {
        const P: any = this;
        const all: any[] = [];
        for (const w of wvMainWins()) { try { all.push(...this._wvFdViewsOf(w)); } catch (e) {} }
        for (const v of all) {
            try {
                if (!v || !isFeedView(v)) continue;
                try { if (typeof v.invalidateRowCache === "function") v.invalidateRowCache(true); } catch (e) {}
                if (resort && P._wvFdColKey && v.getSortField() === P._wvFdColKey) {
                    const p = v.sort();
                    if (p && typeof p.catch === "function") p.catch(() => {});
                }
                else if (v.tree) v.tree.invalidate();
            } catch (e) {}
        }
    }

    // ---- the section ----------------------------------------------------------------------

    _wvFdSecInit({ body, doc, refresh }: any) {
        try {
            (this as any)._wvBlEnsureFtl(doc.defaultView);
            wvInjectStyle(doc, SEC_STYLE_ID, SEC_CSS);
            secBodies.set(body, refresh);
        } catch (e) {}
    }

    _wvFdSecDestroy({ body }: any) {
        try { secBodies.delete(body); } catch (e) {}
    }

    _wvFdSecItemChange({ item, setEnabled }: any) {
        try { setEnabled(!!(item && item.isFeedItem && this._wvFdOn())); }
        catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    _wvFdSecRender({ body, item, doc }: any) {
        try { if (item && item.isFeedItem) this._wvFdSecBuild(body, doc, item); }
        catch (e) { Zotero.debug("[Weavero] feeds section err: " + e); }
    }

    async _wvFdSecAsyncRender({ body, item, doc }: any) {
        try {
            if (!item || !item.isFeedItem) return;
            if (!this._wvFdRecOf(item.id)) {
                await this._wvFdRefresh("section", { ids: [item.id] });
                if (!body.isConnected) return;
            }
            this._wvFdSecBuild(body, doc, item);
        } catch (e) { Zotero.debug("[Weavero] feeds section err: " + e); }
    }

    /** The text closeness of each library item in `ids` to feed item `item`, 0-99:
     *  100 x the cosine of their title + abstract under the library's index (the
     *  score's own comparison, feed-score.ts). Empty while the index is not built. */
    _wvFdRelCloseness(item: any, ids: number[]): Map<number, number> {
        const out = new Map<number, number>();
        try {
            const ix: any = (this as any)._wvFdIx;
            if (!ix || !ix.corpus || !ids || !ids.length) return out;
            let abs = "";
            try { abs = String(item.getField("abstractNote") || ""); } catch (e) {}
            const radar = wvFdParseRadar(abs);
            const fvec = wvFdVector(ix.corpus, wvFdTokenize(String(item.getField("title") || "") + " " + (radar ? radar.abstract : abs)));
            if (!fvec.size) return out;
            for (const id of ids) {
                const it: any = Zotero.Items.get(id);
                if (!it) continue;
                let t = "";
                try { t = String(it.getField("title") || "") + " " + String(it.getField("abstractNote") || ""); } catch (e) {}
                const v = wvFdVector(ix.corpus, wvFdTokenize(t));
                out.set(id, Math.max(0, Math.min(99, Math.round(100 * wvFdCosine(fvec, v)))));
            }
        } catch (e) {}
        return out;
    }

    /** One reason in words (weavero.ftl). */
    _wvFdReasonText(r: WvFdReason): string {
        const list = (a?: string[]) => (a || []).join(", ");
        switch (r.k) {
            case "radar": return String(r.t || "");
            // The paper itself is the related row the reason points at, tagged there:
            // naming its title here said it twice (MJT 2026-11-22, "the Very close to
            // items seem to be repeated in the Related in your library part").
            case "own": return wvStr("weavero-feeds-reason-own-row", null, null);
            case "lib": {
                // How close the closest paper is (score fix 4); the count of the
                // 10 closest above a low floor said almost nothing (9 or 10).
                if (!r.id) return wvStr("weavero-feeds-reason-lib", { count: r.n || 0 }, null);
                return wvStr("weavero-feeds-reason-near-row", { level: wvFdNearLevel(r.s || 0) }, null);
            }
            case "author": return wvStr("weavero-feeds-reason-author", { names: list(r.names) }, null);
            case "followed": return wvStr("weavero-feeds-reason-followed", { names: list(r.names) }, null);
            case "alert": return wvStr("weavero-feeds-reason-alert", { queries: list(r.q) }, null);
            case "journal": return wvStr("weavero-feeds-reason-journal", { journal: String(r.name || ""), count: r.n || 0 }, null);
        }
        return "";
    }

    /** The score, the in-library line, the reasons, then the related papers
     *  of the libraries drawn as Cited by draws its rows (Zotero's icon and
     *  display title, creator and year after it; Tab, Split, Window and the ⋯
     *  menu over the row's end; a click opens the paper's PDF, else shows it in
     *  its library; a right-click, the reference menu). */
    _wvFdSecBuild(body: any, doc: any, item: any) {
        const P: any = this;
        const r = this._wvFdRecOf(item.id);
        let host: any = body.querySelector(":scope > .wv-fd-sec");
        if (!host) host = wvHtmlEl(doc, "div", "wv-fd-sec", undefined, body);
        const ctx = P._wvCbSecCtx(body, item, doc);
        let split = false;
        // Split from the library's pane too, beside the library tab, as Cited by's rows
        // (refs.ts _wvRefsCanSplit; MJT 2026-11-22, "Also need to be able to open in Split View").
        try { split = P._wvRefsCanSplit(ctx); } catch (e) {}
        const sig = item.id + "|" + (r ? r.g + ":" + r.score + ":" + r.rel.join(",") + ":" + r.libIDs.join(",") : "none") + "|" + (split ? "s" : "");
        if (host.getAttribute("data-wv-fd-sig") === sig && host.firstChild) return;
        host.setAttribute("data-wv-fd-sig", sig);
        host.textContent = "";
        if (!r) {
            wvHtmlEl(doc, "div", "wv-fd-note", wvStr("weavero-feeds-scoring", null, null), host);
            return;
        }
        const summary = wvHtmlEl(doc, "div", "wv-fd-summary", undefined, host);
        const head = wvHtmlEl(doc, "div", "wv-fd-head", undefined, summary);
        wvHtmlEl(doc, "span", "wv-fd-score", wvStr("weavero-feeds-score", { score: String(r.score) }, null), head);
        const inl = wvHtmlEl(doc, "span", "wv-fd-inlibline", undefined, head);
        wvLibBadgeEl(doc, "user", inl);
        wvHtmlEl(doc, "span", undefined, wvStr("weavero-feeds-inlib", null, null), inl);
        inl.hidden = !r.inLib;
        // Hovering it shows the library copy's card (feeds-badge.ts; MJT 2026-11-22).
        if (r.inLib) { inl.setAttribute("tabindex", "0"); try { P._wvFdCardHover(doc.defaultView, inl, item.id); } catch (e) {} }
        const rs = wvHtmlEl(doc, "div", "wv-fd-reasons", undefined, summary);
        for (const x of r.reasons) {
            const t = this._wvFdReasonText(x);
            if (!t) continue;
            const el = wvHtmlEl(doc, "div", "wv-fd-reason" + (x.k === "radar" ? " wv-fd-radar" : ""), t, rs);
            el.setAttribute("data-wv-fd-kind", x.k);
        }
        // The paper's own copies are not "related" to it: the "Already in your
        // library" line and its card show them (MJT 2026-11-22).
        // Each related paper's own closeness to the feed item, 0-99 (MJT 2026-11-22,
        // "add a relevance score for the Related in your library"), the rows closest
        // first; the paper a reason points at carries that reason's tag.
        const close = this._wvFdRelCloseness(item, r.rel);
        const ids = r.rel.filter((id: number) => r.libIDs.indexOf(id) < 0)
            .map((id: number, i: number) => ({ id, i, c: close.has(id) ? (close.get(id) as number) : -1 }))
            .sort((a: any, b: any) => (b.c - a.c) || (a.i - b.i))
            .map((x: any) => x.id);
        const nearR = r.reasons.find((x) => x.k === "lib" && !!x.id);
        const ownR = r.reasons.find((x) => x.k === "own" && !!x.id);
        const sub = wvHtmlEl(doc, "div", "wv-fd-subhead", wvStr("weavero-feeds-related", null, null), host);
        const list = wvHtmlEl(doc, "div", "wv-fd-list", undefined, host);
        let icons: any = null;
        try { const w = doc.defaultView; icons = w && w.require ? w.require("components/icons") : null; } catch (e) {}
        let shown = 0;
        for (const id of ids) {
            let it: any = null;
            try { it = Zotero.Items.get(id); } catch (e) { it = null; }
            if (!it || it.deleted || !it.isRegularItem || !it.isRegularItem()) continue;
            shown++;
            const row = wvHtmlEl(doc, "div", "wv-fd-row", undefined, list);
            row.setAttribute("data-wv-fd-item", String(it.id));
            if (r.libIDs.indexOf(id) >= 0) row.setAttribute("data-wv-fd-same", "true");
            const ic = wvHtmlEl(doc, "span", "wv-fd-icon", undefined, row);
            try { const el = icons && typeof icons.getCSSItemTypeIcon === "function" ? icons.getCSSItemTypeIcon(it.getItemTypeIconName()) : null; if (el) ic.appendChild(el); } catch (e) {}
            let title = "";
            try { title = String(it.getDisplayTitle() || ""); } catch (e) {}
            const tx = wvHtmlEl(doc, "span", "wv-fd-text", undefined, row);
            tx.appendChild(doc.createTextNode(title || wvStr("weavero-common-untitled")));
            let creator = "", year = "";
            try { creator = String(it.getField("firstCreator") || ""); } catch (e) {}
            try { year = yearOf(it.getField("date", true, true)); } catch (e) {}
            const meta = [creator, year].filter((x) => x).join(" · ");
            if (meta) { tx.appendChild(doc.createTextNode(" ")); wvHtmlEl(doc, "span", "wv-fd-meta", meta, tx); }
            const tag = ownR && ownR.id === id ? wvStr("weavero-feeds-reltag-own", null, null)
                : nearR && nearR.id === id ? wvStr("weavero-feeds-reltag-near", { level: wvFdNearLevel(nearR.s || 0) }, null) : "";
            if (tag) { tx.appendChild(doc.createTextNode(" ")); wvHtmlEl(doc, "span", "wv-fd-reltag", tag, tx).setAttribute("data-wv-fd-tag", ownR && ownR.id === id ? "own" : "near"); }
            if (close.has(id)) {
                const sc = wvHtmlEl(doc, "span", "wv-fd-relscore", String(close.get(id)), row);
                sc.setAttribute("title", wvStr("weavero-feeds-relscore-tip", null, null));
            }
            const btns = wvHtmlEl(doc, "span", "wv-fd-btns", undefined, row);
            for (const a of ["tab"].concat(split ? ["split"] : [], ["window", "more"])) {
                const b = wvHtmlEl(doc, "span", "wv-refs-btn", undefined, btns);
                b.setAttribute("role", "button");
                b.setAttribute("data-wv-fd-act", a);
                b.setAttribute("title", wvStr("weavero-refs-act-" + a, null, "title"));
                const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16 }, b);
                for (const [tagName, attrs] of WV_REFS_ICONS[a] || []) wvSvgEl(doc, tagName, attrs, svg);
            }
            const itemID = it.id;
            row.addEventListener("click", (e: any) => {
                try {
                    if (e.button !== 0) return;
                    const lp: any = wvLivePlugin();
                    if (!lp) return;
                    const btn = e.target && e.target.closest ? e.target.closest(".wv-refs-btn") : null;
                    const one = Zotero.Items.get(itemID);
                    if (!one) return;
                    if (btn) {
                        e.stopPropagation();
                        const act = String(btn.getAttribute("data-wv-fd-act"));
                        const go = async () => {
                            let att: any = null;
                            try { att = await one.getBestAttachment(); } catch (er) {}
                            return lp._wvCbAct(ctx, act, itemID, att ? att.id : 0, btn);
                        };
                        go().catch(() => {});
                        return;
                    }
                    // A click opens the paper's PDF in a tab, as a References or Cited by
                    // row opens one (MJT 2026-11-22: "In the refs sections, a click on the
                    // item directly opens the PDF file. In the Feeds, it only focuses the
                    // item in the library. It should be made consistent"); a paper without
                    // one is shown in its library.
                    const open = async () => {
                        let att: any = null;
                        try { att = await one.getBestAttachment(); } catch (er) {}
                        if (att) return lp._wvCbAct(ctx, "tab", itemID, att.id, row);
                        return lp._wvRefsShowInLibrary(one, lp._wvRefsHostWin(ctx));
                    };
                    open().catch(() => {});
                } catch (er) {}
            });
            row.addEventListener("contextmenu", (e: any) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvRefsMenu(ctx, [itemID], "none", row, { at: [e.screenX, e.screenY], opens: true });
                } catch (er) {}
            });
        }
        sub.hidden = !shown;
    }

    _wvFdSecRefreshAll() {
        for (const [body, refresh] of Array.from(secBodies.entries())) {
            try {
                if (!body.isConnected) { secBodies.delete(body); continue; }
                const p = refresh();
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (e) {}
        }
    }

    // ---- start, settings, destroy -------------------------------------------------------

    /** The feature on or off, everywhere (init, the setting). */
    _wvFdApply() {
        const P: any = this;
        if (this._wvFdOn()) {
            this._wvFdColumnOn();
            this._wvFdWireRows();
            for (const w of wvMainWins()) this._wvFdWireView(w);
            // The Graphical Abstract section first: it sits under Zotero's Abstract
            // (feeds-graphical.ts; backlinks.ts WV_SIDENAV_TIE: just above the Abstract).
            try { this._wvGaApply(); } catch (e) { Zotero.debug("[Weavero] graphical abstract on err: " + e); }
            try { P._wvBlRegisterSectionFor(FD_SECTION); } catch (e) {}
            this._wvFdWireNotifier();
            // The column's registration reaches the views by a notification:
            // sorted again once it has.
            wvTimeout(() => { const lp: any = wvLivePlugin(); if (lp === P && !P._wvDestroyed) { for (const w of wvMainWins()) lp._wvFdWireView(w); lp._wvFdRefreshViews(true); } }, 600);
        }
        else this._wvFdStop();
    }

    _wvFdStop() {
        const P: any = this;
        wvClearTimeout(P._wvFdPassT); P._wvFdPassT = null;
        wvClearTimeout(P._wvFdNewT); P._wvFdNewT = null;
        const idle = P._wvFdIdle;
        P._wvFdIdle = null;
        if (idle) {
            try { if (idle.w && idle.id != null) idle.w.cancelIdleCallback(idle.id); } catch (e) {}
            try { if (idle.t) wvClearTimeout(idle.t); } catch (e) {}
            try { idle.res(); } catch (e) {}
        }
        this._wvFdUnwireNotifier();
        try { P._wvBlUnregisterSectionFor(FD_SECTION); } catch (e) {}
        try { this._wvGaStop(); } catch (e) {}
        this._wvFdUnwireAll();
        try { this._wvFdBadgeUnwireAll(); } catch (e) {}
        this._wvFdColumnOff();
    }

    _wvFdInit() {
        const P: any = this;
        this._wvFdWirePrefWatch();
        if (!this._wvFdOn()) return;
        this._wvFdApply();
        // The scores kept from the last session, at once (the column reads them);
        // a pass a little later scores what is new.
        this._wvFdLoadScores().then(() => { const lp: any = wvLivePlugin(); if (lp === P && !P._wvDestroyed) lp._wvFdRefreshViews(true); }, () => {});
        this._wvFdSchedule(START_DELAY_MS, "start");
    }

    _wvFdWirePrefWatch() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvFdPrefObs) {
                if (g._wvFdPrefObsVer === tag) return;
                for (const s of g._wvFdPrefObs) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
                delete g._wvFdPrefObs;
            }
            g._wvFdPrefObsVer = tag;
            g._wvFdPrefObs = FD_PREFS.map((k) => Zotero.Prefs.registerObserver("weavero." + k, () => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag) return;
                    lp._wvFdPrefChanged(k);
                } catch (e) {}
            }));
        } catch (e) { Zotero.debug("[Weavero] feeds pref watch err: " + e); }
    }

    _wvFdPrefChanged(k: string) {
        const P: any = this;
        wvClearTimeout(P._wvFdPrefT);
        P._wvFdPrefT = wvTimeout(() => {
            P._wvFdPrefT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            if (k === "enableFeeds") {
                this._wvFdApply();
                if (this._wvFdOn()) this._wvFdSchedule(2000, "setting on");
            }
            else if (this._wvFdOn()) this._wvFdSchedule(1000, "journals setting");
        }, 50);
    }

    /** destroy(): every wrap given back, Zotero's feed order restored, the
     *  column, the section, the observers, the timers; the scores written. */
    _wvFdDestroy() {
        const P: any = this;
        try { if (P._wvFdSaveT) { wvClearTimeout(P._wvFdSaveT); P._wvFdSaveT = null; this._wvFdSave().catch(() => {}); } } catch (e) {}
        this._wvFdStop();
        wvClearTimeout(P._wvFdPrefT); P._wvFdPrefT = null;
        try {
            const g: any = Zotero;
            for (const s of g._wvFdPrefObs || []) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
            delete g._wvFdPrefObs; delete g._wvFdPrefObsVer;
        } catch (e) {}
        secBodies.clear();
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { wvRemoveStyle(w.document, SEC_STYLE_ID); wvRemoveStyle(w.document, COL_STYLE_ID); } catch (e) {}
            }
        } catch (e) {}
        P._wvFdIx = null; P._wvFdRecs = null; P._wvFdSettings = null; P._wvFdChain = null; P._wvFdNewIds = null;
    }
}

const _fdDescriptors = Object.getOwnPropertyDescriptors(_FeedsMixin.prototype);
delete (_fdDescriptors as any).constructor;
export const feedsMethods = _fdDescriptors;
