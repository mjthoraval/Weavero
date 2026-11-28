// Module: Cited by (branch citedby, plan work/citedby-plan-2026-11-20.md;
// MJT 2026-11-20, "start the work on the cited by feature ... take decisions
// yourself").
//
// "Cited by · n in your library": the papers of the user's libraries (every
// library, groups included) whose reference lists cite the selected item --
// the reverse of the References feature (refs.ts). Offline and read-only:
// nothing is asked of the network, nothing is written to any library.
//
// THE INDEX (lib/ref-citedby.ts): one record per PDF attachment of the user's
// libraries -- the items its reference list names, matched with the References
// matcher (lib/ref-match.ts, the same library index `_wvRefsIx`) -- read from
// what Zotero already keeps beside the PDF, never generated:
//   - its structure cache (`.zotero-sdt-cache`, Zotero 11 / 10.0.8 write it
//     when the reader opens the PDF), walked as the References section walks
//     it (lib/ref-list.ts);
//   - else its full-text cache (`.zotero-ft-cache`, Zotero's full-text index),
//     whose reference section is cut into entries (wvCbTextEntries).
// Measured on MJT's library 2026-11-20 (18,780 PDFs): 70 structure caches,
// 18,529 full-text caches -- the plan's coverage table.
//
// Built in the background, a little at a time (`_wvCbPace`: at most SLICE_MS of
// work, then the next idle moment of a main window), persisted in
// <data dir>/weavero/cited-by/ through wvStoreWrite (CB_SHARDS small files, a
// write never serialises the whole index), each record keyed by the stamp of
// the file it was read from (size + mtime): a later pass reads only what is
// new or changed. When the library changes (an item added, or its title, DOI,
// first creator or year changed: `_wvCbLibChanged`), only the PDFs that can
// cite the changed items are read again: each record keeps a filter of what
// its entries hold (lib/ref-citedby.ts wvCbMayCite; filter-NNN.json, read only
// then). Every record is matched again only for a matcher of other code
// (`mv`) or once a week (CB_FULL_EVERY_MS: what a filter cannot foresee).
//
// THE ENTRIES (citations.1, plan work/citations-plan-2026-11-21.md M1): each PDF's
// reference entries as read, matched or not, with their keys (lib/ref-citedby.ts
// wvCbEntryKeys), one compressed file a PDF under cited-by/entries/ -- stamped
// with the stamp of the file they were read from and the LIST fingerprint of the
// code that read them (wvCbListFp). Matching again (a matcher of other code, the
// weekly full match, a library change) reads them, never the PDF's caches: a PDF
// is read again only when its file changed or the reading code did.
//
// THE SECTION: "Cited by" in the item pane (library and reader), right after
// References (backlinks.ts WV_SIDENAV_ORDER); a row per citing WORK -- its copies
// in other libraries folded into it (citations.1) -- (Zotero's icon and display
// title of its best copy, the first creator and year after it, "also in" the
// other copies' libraries, the library's badge when it is in another library),
// the References rows' buttons, and a click opens the citing PDF at its entry for
// the item, a quarter down the view (refs.ts _wvRefsShowEntry). 50 rows, then
// "Show N more" a hundred at a time; the header counts them all. Hidden while
// nothing cites the item.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvSleep, wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvInjectStyle, wvRemoveStyle } from "../lib/style";
import { wvSvgEl } from "../lib/svg";
import { wvLibBadgeEl } from "../lib/library-badge";
import { wvPaperGlyphUri } from "../lib/link-glyph";
import { wvStr } from "../lib/l10n";
import { wvHtmlEl, wvSetBoolAttr, winOf } from "../lib/dom";
import { wvStoreRead, wvStoreWrite, wvStoreRemove, wvStoreDir } from "../lib/store";
import { WvSectionDesc } from "./backlinks";
import { WV_REFS_ICONS, wvRefsLibIcon, wvRefsLibNames, BADGE_AT } from "./refs";
import { WV_LF_SECTION_BUTTONS, WvLfList, WvLfView, wvLfMarkEl } from "./list-filter";
import { WvLfRow, WvLfField } from "../lib/list-filter";
import { WvRefIndex, wvRefMatch, wvRefIndexGet, wvRefSelfOf } from "../lib/ref-match";
import { wvRefList } from "../lib/ref-list";
import { wvSdtModule, wvSdtOpen, wvSdtVersionOk } from "../lib/sdt";
import {
    WvCbIndex, WvCbRec, WvCbItemKeys, WvCbSteps, WvCbTokenSink, WvCbWork, WvCbEntriesDoc, wvCbIndexNew, wvCbPut, wvCbDrop, wvCbCiters, wvCbShardOf, wvCbShardLoad,
    wvCbTextEntries, wvCbSectionsSteps, wvCbChunksSteps, WV_CB_MAX_TEXT_ENTRIES,
    wvCbEntryTokens, wvCbFilterOfSteps, wvCbFilterEncodeSteps, wvCbFilterDecode, wvCbItemKeys, wvCbMayCite,
    wvCbEntryKeys, wvCbEntryKeysSteps, wvCbEntriesUsable, wvCbWorksSteps, wvCbRun, WV_CB_FIRST_ROWS, WV_CB_PAGE_ROWS,
} from "../lib/ref-citedby";

declare const Zotero: any;
declare const Components: any;
declare const Services: any;

/** The store: <data dir>/weavero/cited-by/shard-NN.json (the records),
 *  filter-NNN.json (each record's filter, lib/ref-citedby.ts -- read only
 *  when the library changes, never kept in memory: 1.8 KB a record), and the
 *  library's matching signatures in sigs.json. */
const CB_DIR = "cited-by";
const CB_SHARDS = 32;
/** The filter files: a few hundred KB each, one JSON parse within a slice. */
const CB_FILTER_SHARDS = 128;
/** The records' format: 2 since the filters (citedby.3) -- every PDF read once
 *  more, to make its filter. */
const CB_STORE_V = 2;
/** Main-thread work per slice, at most (ms); then the next idle moment. */
export const WV_CB_SLICE_MS = 8;
/** The first pass starts this long after init (ms): Zotero's own start first. */
const START_DELAY_MS = 30000;
/** A pass for a library change waits this long after the last change (ms): a
 *  sync or an import goes on for a while. It reads only the PDFs whose filter
 *  passes the changed items' keys (_wvCbTargets). */
const LIB_PASS_DELAY_MS = 60000;
/** Every record is matched again in full -- from its stored entries, no PDF
 *  read (citations.1) -- only when
 *  - the matcher's code changed (`mv`, wvCbMatchFp: its answers may differ
 *    for any entry), or
 *  - this long has passed since the last full match: the matches a filter
 *    cannot foresee -- a first author the matcher finds only by OCR distance
 *    or by an initial (ref-match.ts authorIn's approximate branches), words a
 *    PDF's text ran together -- are caught then (0.34 % of a full re-match's
 *    matches on 300 of MJT's PDFs, plan §12). Checked by every pass; a pass
 *    runs at start and every PERIODIC_MS.
 *  Every PDF is read again only when the reading code changed (`lv`, wvCbListFp). */
const CB_FULL_EVERY_MS = 7 * 24 * 3600000;
const PERIODIC_MS = 6 * 3600000;
/** A new PDF is read this long after it was added (ms): Zotero's full-text
 *  indexing writes its cache first. */
const NEW_PDF_DELAY_MS = 90000;
/** Dirty shards are written this long after the first change (ms). */
const FLUSH_MS = 20000;
/** Visible sections are redrawn at most this often while a pass runs (ms). */
const SEC_REFRESH_MS = 3000;
/** Stats in one go (each an off-main-thread call). */
const STAT_BATCH = 64;
/** A work cited by more PDFs than this gets its section's works in idle slices of
 *  CB_WORKS_SLICE_MS (plan §0's bounds); fewer -- every item of MJT's library,
 *  1,308 at most -- at once: 20,000 took 61.5 ms in one call on Zotero 11
 *  (2026-11-21, ~3 µs a PDF; 2,000 ~6 ms). */
const CB_WORKS_SYNC = 2000;
const CB_WORKS_SLICE_MS = 8;
/** Structure caches larger than this are read as full text instead: the walk
 *  of a materialized structure (lib/ref-list.ts wvRefList) is one call, and on
 *  MJT's 70 caches it took up to 21 ms below 300 KB (55 of them), 14-202 ms
 *  above (books, theses; probe 2026-11-20, plan §7). */
const SDT_MAX_BYTES = 300000;
const SEC_PANE_ID = "weavero-citedby";
const SEC_STYLE_ID = "wv-cb-sec-style";
/** The settings the feature follows, its masters included. */
const CB_PREFS = ["referencesCitedBy", "enableReferences", "enableRelations", "enableLinksAndRelations"];

/** `<data dir>/weavero/cited-by/<file>`, one segment at a time: PathUtils.join
 *  refuses a segment holding a separator ("cited-by/x.json") on Windows. */
function cbPath(file: string): string {
    return PathUtils.join(wvStoreDir(), CB_DIR, file);
}

/** The entries store: cited-by/entries/NN/<attachment id>.jsonlz4, NN one of
 *  CB_ENT_DIRS folders (a few hundred files each on MJT's 18,780 PDFs). A file
 *  a PDF: written once when the PDF is read, read when it is matched again,
 *  never rewritten to add another PDF's (a shard of entries would be read,
 *  changed and written whole for every PDF a first pass reads). Compressed
 *  (IOUtils mozlz4; sizes in work/citations-log-2026-11-21.md M1). */
const CB_ENT_DIR = "entries";
const CB_ENT_DIRS = 64;
const CB_ENT_V = 1;

/** A full-text cache's stamp as a pass names it ("ft:size:mtime"), "" for none
 *  or an empty one: the record's and the entries file's `s` (_wvCbStamp), and
 *  what the References section checks a stored file against (_wvCbFtStampOf). */
function cbFtStamp(fs: any): string {
    return fs && fs.size > 0 ? "ft:" + fs.size + ":" + fs.lastModified : "";
}

function cbHash(src: string): string {
    let h = 2166136261;
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36) + ":" + src.length.toString(36);
}

/** The source hashes of the list reader's and the matcher's modules, set by the
 *  build (zotero-plugin.config.ts wvSrcHash); "" where no build set them (a
 *  module imported by a Node script). */
declare const __WV_REFMATCH_SRC__: string;
declare const __WV_REFLIST_SRC__: string;
const REFMATCH_SRC = typeof __WV_REFMATCH_SRC__ === "string" ? __WV_REFMATCH_SRC__ : "";
const REFLIST_SRC = typeof __WV_REFLIST_SRC__ === "string" ? __WV_REFLIST_SRC__ : "";

/** The LIST fingerprint: the code that makes a PDF's entries from its caches
 *  (the structure walk, the full text's sections and cuts) -- lib/ref-list.ts
 *  whole, so a helper's change counts too. Records and entries read by other
 *  code are read again (the shard's `lv`). */
let listFp = "";
export function wvCbListFp(): string {
    return listFp || (listFp = cbHash(String(wvRefList) + String(wvCbTextEntries) + String(wvCbSectionsSteps) + String(wvCbChunksSteps) + "|" + WV_CB_MAX_TEXT_ENTRIES + "|" + REFLIST_SRC));
}

/** The MATCH fingerprint: the code that matches the entries (the References
 *  matcher keeps improving, branch refsacc) and the filter's tokens, made from
 *  them too. Records made by other code are matched again from their stored
 *  entries, their filters made again; no PDF is read (the shard's `mv`). The
 *  plan put the tokens with the reading code; they are made from the entries,
 *  so a change of theirs needs no read (citations log, M1). */
let matchFp = "";
export function wvCbMatchFp(): string {
    // lib/ref-match.ts whole: its helpers (copiesOf, the name forms, the
    // approximate titles) decide as much as wvRefMatch's own lines.
    return matchFp || (matchFp = cbHash(String(wvRefMatch) + String(wvCbEntryTokens) + "|" + REFMATCH_SRC));
}

/** The keys' fingerprint (`kf` of an entries file): keys of other code are
 *  made again from the entries by whoever reads them (no PDF read). */
let keysFp = "";
function wvCbKeysFp(): string {
    return keysFp || (keysFp = cbHash(String(wvCbEntryKeys)));
}

/** A library item's matching data, as a number (sigs.json). */
function sigOf(r: { title: string; dois: string[]; first: string; year: string; oyear?: string; axs?: string[] } | null): number {
    if (!r) return 0;
    // The original date's year too (1.3.0-refyear.2): an "Original Date" added to a reprint
    // changes what the matcher finds for it. Only when there is one -- every other item's
    // signature stays what it was.
    // Its arXiv identifiers since refkeys.1 (the matcher's step 1b), added only when there
    // are some: an item without one keeps the signature it had, and no pass reads it again.
    const s = r.title + "|" + r.dois.join(",") + "|" + r.first + "|" + r.year + (r.oyear ? "|" + r.oyear : "")
        + (r.axs && r.axs.length ? "|a:" + r.axs.join(",") : "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
}

/** The section's icon: a page with an arrow into it -- papers citing this one
 *  (lib/link-glyph.ts wvPaperGlyphUri; References' points out), in the grey of
 *  Weavero's other section icons. */
function secIcon(color: string, size: number): string {
    return wvPaperGlyphUri(color, size, "in");
}

const CB_SECTION: WvSectionDesc = {
    paneID: SEC_PANE_ID,
    inst: "_wvCbSecKey", glob: "_wvCbSecKey", at: "_wvCbSecUnregAt", timer: "_wvCbSecTimer",
    header: { l10nID: "weavero-citedby-header", icon: secIcon("#5a5a5a", 16), darkIcon: secIcon("#c8c8c8", 16) },
    sidenav: { l10nID: "weavero-citedby-sidenav", icon: secIcon("#5a5a5a", 20), darkIcon: secIcon("#c8c8c8", 20) },
    bodyXHTML: '<html:div class="wv-cb-sec"></html:div>',
    hooks: { init: "_wvCbSecInit", destroy: "_wvCbSecDestroy", itemChange: "_wvCbSecItemChange", render: "_wvCbSecRender", asyncRender: "_wvCbSecAsyncRender" },
    enabled: (p) => { try { return !!p._wvCbOn(); } catch (e) { return false; } },
    // The long lists' magnifier (list-filter.ts, citations M4); the sort's chips
    // go before it in the header (lfsort.1).
    buttons: WV_LF_SECTION_BUTTONS,
};

/** Zotero's row geometry (src-ts.md "Item-pane sections take Zotero's row
 *  geometry"), the References rows' buttons over the row's end. */
const SEC_CSS = `
.wv-cb-sec { display: flex; flex-direction: column; gap: 4px; contain: inline-size; }
.wv-cb-list { display: flex; flex-direction: column; }
.wv-cb-row { display: flex; align-items: flex-start; gap: 4px; padding: 4px; border-radius: 5px; cursor: default; contain: inline-size; position: relative; }
.wv-cb-row:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }
.wv-cb-row .wv-cb-icon { flex: none; width: 16px; height: 16px; position: relative; }
.wv-cb-row .wv-cb-icon > .icon { display: block; width: 16px; height: 16px; }
/* A library's badge with its corner at BADGE_AT on the 16-px icon -- where the References
   marks carry theirs (refs.ts; one badge on every surface, MJT 2026-11-20). */
.wv-cb-row .wv-cb-icon > .wv-cb-libbadge { position: absolute; width: 8px; height: 8px; inset-inline-start: ${BADGE_AT.x * 16}px; top: ${BADGE_AT.y * 16}px; filter: drop-shadow(0 0 0.7px #1c1c1e) drop-shadow(0 0 0.7px #1c1c1e); pointer-events: none; }
.wv-cb-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
/* Three lines: the journal joined the author and year (MJT 2026-11-21, "I want to see also the
   journal where it is published") and two lines cut it from most titles. */
.wv-cb-text { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow-wrap: anywhere; }
.wv-cb-meta { color: var(--fill-secondary, GrayText); }
.wv-cb-pub { font-style: italic; }
/* The other libraries holding a copy: a line of their own, never cut with the citation, each a
   chip with the library's badge (MJT 2026-11-21, "the 'also in' information should be in a
   distinct format from the rest of the citation"). */
.wv-cb-libs { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 4px; min-width: 0; font-size: 0.92em; color: var(--fill-secondary, GrayText); }
.wv-cb-lib { display: inline-flex; align-items: center; gap: 3px; min-width: 0; max-width: 100%; padding: 0 5px 0 3px; border-radius: 4px; line-height: 16px; background: var(--fill-quinary, rgba(128,128,128,0.12)); }
.wv-cb-lib > svg { flex: none; width: 10px; height: 10px; }
.wv-cb-lib-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wv-cb-more { padding: 4px; border-radius: 5px; color: var(--fill-secondary, GrayText); cursor: default; }
.wv-cb-more:hover { background: var(--fill-quinary, rgba(128,128,128,0.12)); }
.wv-cb-more:focus-visible { outline: 2px solid var(--color-focus-outer, Highlight); outline-offset: -2px; }
.wv-cb-note { padding: 2px 4px; color: var(--fill-secondary, GrayText); font-size: 0.92em; }
.wv-cb-note[hidden] { display: none; }
.wv-cb-btns { position: absolute; inset-inline-end: 4px; top: 2px; display: none; gap: 1px; padding-inline-start: 4px; border-radius: 4px;
  background-color: var(--material-sidepane, Canvas); background-image: linear-gradient(var(--fill-quinary, rgba(128,128,128,0.12)), var(--fill-quinary, rgba(128,128,128,0.12))); }
.wv-cb-row:hover .wv-cb-btns, .wv-cb-row:focus-within .wv-cb-btns { display: flex; }
.wv-cb-btns .wv-refs-btn { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border-radius: 4px; color: var(--fill-secondary, #555); }
.wv-cb-btns .wv-refs-btn:hover { background: var(--fill-quinary, rgba(0,0,0,0.08)); color: var(--fill-primary, #222); }
.wv-cb-btns svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1; }
.wv-cb-btns svg .wv-fill { fill: currentColor; stroke: none; }
`;

/** The sections' bodies and their redraw (onInit's `refresh`). */
const secBodies: Map<any, () => any> = new Map();
/** How many rows a section's body shows for its item ("Show N more" adds a
 *  page), and the list its rows were drawn from (a page is added from that
 *  list only): the works and the filter line's answer over them (`vsig`). The
 *  pages start again when the filter changes (`fsig`). */
const secShown: WeakMap<any, { item: number; shown: number; works?: WvCbWork[]; vsig?: string; fsig: string }> = new WeakMap();

/** A PDF attachment the index reads. */
interface WvCbCand { id: number; parent: number; lib: number; key: string; linkMode: number; path: string; storageHash: string }

class _CitedByMixin {
    [k: string]: any;

    /** The feature's switch: References in your library, and its Cited by box. */
    _wvCbOn(): boolean {
        try { return !!this._wvRefsOn() && !!this._wvPref("referencesCitedBy"); } catch (e) { return false; }
    }

    // ---- the index in memory and on disk ------------------------------------

    /** The index, loaded from the store once (concurrent callers share the load).
     *  While Remove Built Data removes the store (`_wvCbHold`, _wvCbReset) a load
     *  waits for it: read meanwhile, the old records would come back in memory and
     *  be written back. A load that a reset overtook is never published. */
    _wvCbLoad(): Promise<WvCbIndex> {
        const P: any = this;
        if (P._wvCbIx) return Promise.resolve(P._wvCbIx);
        if (P._wvCbLoading) return P._wvCbLoading;
        const me: Promise<WvCbIndex> = (async () => {
            if (P._wvCbHold) { try { await P._wvCbHold; } catch (e) {} }
            const ep = P._wvCbEpoch || 0;
            const ix = wvCbIndexNew();
            const t0 = Date.now();
            let n = 0, stale = 0, relist = 0;
            for (let s = 0; s < CB_SHARDS; s++) {
                const r = await wvStoreRead(this._wvCbShardPath(s));
                if (P._wvDestroyed) return ix;
                if (r.status !== "ok") continue;
                n += wvCbShardLoad(ix, r.doc, CB_STORE_V);
                // Kept for the section meanwhile: read by other code (a shard before
                // citations.1 has no `lv`, and no entries stored) -- read again, the
                // stamp no file has; matched by other code -- matched again from the
                // entries, generation 0 (its filter made again too).
                const lvOk = !!r.doc && r.doc.lv === wvCbListFp(), mvOk = !!r.doc && r.doc.mv === wvCbMatchFp();
                if (r.doc && (!lvOk || !mvOk)) {
                    for (const k of Object.keys(r.doc.recs || {})) {
                        const rec = ix.recs.get(Number(k));
                        if (!rec) continue;
                        if (!lvOk) { rec.s = ""; relist++; }
                        else { rec.g = 0; stale++; }
                    }
                }
            }
            const sg = await wvStoreRead(cbPath("sigs.json"));
            const sigs: Map<number, number> = new Map();
            const pendIds: number[] = [];
            let fullAt = 0;
            if (sg.status === "ok" && sg.doc && sg.doc.v === CB_STORE_V && Array.isArray(sg.doc.s)) {
                const a = sg.doc.s;
                for (let i = 0; i + 1 < a.length; i += 2) sigs.set(Number(a[i]), Number(a[i + 1]));
                // Changes a pass had not taken yet when Zotero stopped.
                for (const id of Array.isArray(sg.doc.pend) ? sg.doc.pend : []) if (Number.isFinite(Number(id))) pendIds.push(Number(id));
                fullAt = Number(sg.doc.full) || 0;
            }
            if (P._wvDestroyed || (P._wvCbEpoch || 0) !== ep) return ix;
            const pend: Set<number> = P._wvCbChanged || (P._wvCbChanged = new Set());
            for (const id of pendIds) pend.add(id);
            P._wvCbFullAt = fullAt;
            P._wvCbSigs = sigs;
            P._wvCbIx = ix;
            Zotero.debug("[Weavero] cited by: " + n + " records loaded (" + relist + " read by other code, " + stale + " matched by other code) in " + (Date.now() - t0) + " ms");
            return ix;
        })();
        P._wvCbLoading = me;
        const done = () => { if (P._wvCbLoading === me) P._wvCbLoading = null; };
        me.then(done, done);
        return me;
    }

    /** The pass running must stop: the instance destroyed, the feature off, or the
     *  index reset since the pass started (Remove Built Data: the records it holds
     *  are of files that are gone). */
    _wvCbHalt(): boolean {
        const P: any = this;
        if (P._wvDestroyed || !this._wvCbOn()) return true;
        return !!P._wvCbRunning && (P._wvCbRunEpoch || 0) !== (P._wvCbEpoch || 0);
    }

    /** Remove Built Data (sdt-build.ts _wvSbCleanRun): the index in memory
     *  forgotten -- its records, signatures, dirty shards and pending filters, the
     *  library's changes not taken yet, the works cache -- the timers cancelled,
     *  and the pass running ended WITHOUT a write (it halts at its next check: its
     *  epoch is gone, and its end writes nothing). Resolves once that pass has
     *  ended and no flush is in flight, with the release of the hold every load
     *  waits on meanwhile (`_wvCbLoad`): the caller removes the files, then
     *  releases, then schedules a fresh pass. */
    async _wvCbReset(): Promise<() => void> {
        const P: any = this;
        P._wvCbEpoch = (P._wvCbEpoch || 0) + 1;
        let release: () => void = () => {};
        const hold = new Promise<void>((res) => { release = res; });
        P._wvCbHold = hold;
        const free = () => { if (P._wvCbHold === hold) P._wvCbHold = null; release(); };
        for (const k of ["_wvCbPassT", "_wvCbNewT", "_wvCbLibT", "_wvCbTgtT", "_wvCbFlushT"]) { wvClearTimeout(P[k]); P[k] = null; }
        P._wvCbIx = null; P._wvCbLoading = null; P._wvCbSigs = null; P._wvCbDirtySet = null; P._wvCbFiltPending = null;
        P._wvCbNewPdfs = null; P._wvCbChanged = null; P._wvCbFullAt = 0; P._wvCbWorksCache = null;
        P._wvCbRerun = null; P._wvCbLibPending = false; P._wvCbPassedGen = 0;
        if (P._wvCbWorksRun) { P._wvCbWorksRun.stop = true; P._wvCbWorksRun = null; }
        // Every pacing wait, not one: _wvCbPace keeps a handle per wait.
        const wake = () => this._wvCbWakeAll();
        // The pass of an older epoch: woken from its idle wait, it halts at its next
        // check. Bounded (a minute): a pass stuck in a long read must not hold the
        // cleaning for good -- what it would still write, it writes into the index
        // it holds, which is no longer the one in memory.
        for (let i = 0; i < 1200 && P._wvCbRunning && (P._wvCbRunEpoch || 0) !== P._wvCbEpoch; i++) {
            wake();
            await wvSleep(50);
        }
        if (P._wvCbFlushing) { try { await P._wvCbFlushing; } catch (e) {} }
        Zotero.debug("[Weavero] cited by: the index in memory reset (built data removed)");
        return free;
    }

    _wvCbShardPath(s: number): string {
        return cbPath("shard-" + String(s).padStart(2, "0") + ".json");
    }

    /** Mark the shard of `att` for the next write. */
    _wvCbDirty(att: number) {
        const P: any = this;
        const d: Set<number> = P._wvCbDirtySet || (P._wvCbDirtySet = new Set());
        d.add(wvCbShardOf(att, CB_SHARDS));
        if (!P._wvCbFlushT) {
            P._wvCbFlushT = wvTimeout(() => {
                P._wvCbFlushT = null;
                const lp: any = wvLivePlugin();
                if (lp === P && !P._wvDestroyed) lp._wvCbFlush().catch(() => {});
            }, FLUSH_MS);
        }
    }

    _wvCbFilterPath(s: number): string {
        return cbPath("filter-" + String(s).padStart(3, "0") + ".json");
    }

    /** A record's filter, to be written with the next flush (null: removed). */
    _wvCbFilterSet(att: number, enc: string | null) {
        const P: any = this;
        const m: Map<number, string | null> = P._wvCbFiltPending || (P._wvCbFiltPending = new Map());
        m.set(att, enc);
        this._wvCbDirty(att);
    }

    /** Write the dirty shards: the records sorted into their shards in one
     *  walk, then each shard serialised in a task of its own (wvStoreWrite
     *  stringifies at the call: a few hundred records, about a millisecond);
     *  then the filters changed since, each filter file read, changed and
     *  written again (one flush at a time: two would lose each other's). */
    async _wvCbFlush(): Promise<void> {
        const P: any = this;
        if (P._wvCbFlushing) { await P._wvCbFlushing.catch(() => {}); }
        const ix: WvCbIndex = P._wvCbIx;
        const d: Set<number> = P._wvCbDirtySet;
        const fp: Map<number, string | null> = P._wvCbFiltPending;
        if (!ix || ((!d || !d.size) && (!fp || !fp.size))) return;
        P._wvCbDirtySet = new Set();
        P._wvCbFiltPending = new Map();
        wvClearTimeout(P._wvCbFlushT); P._wvCbFlushT = null;
        P._wvCbFlushing = (async () => {
            const ws: Promise<void>[] = [];
            if (d && d.size) {
                const buckets = new Map<number, Record<string, WvCbRec>>();
                for (const s of d) buckets.set(s, {});
                // A slice at a time: 18,600 records in one walk took 14 ms (plan §13).
                let t = Date.now(), n = 0;
                for (const [att, r] of ix.recs) {
                    const b = buckets.get(wvCbShardOf(att, CB_SHARDS));
                    if (b) b[String(att)] = r;
                    if (++n % 256 === 0 && Date.now() - t >= WV_CB_SLICE_MS / 2) { await wvSleep(0); t = Date.now(); }
                }
                for (const [s, recs] of buckets) {
                    ws.push(wvStoreWrite(this._wvCbShardPath(s), { v: CB_STORE_V, gen: ix.gen, lv: wvCbListFp(), mv: wvCbMatchFp(), recs }, { pretty: null }));
                    await wvSleep(0);
                }
            }
            if (fp && fp.size) {
                const byShard = new Map<number, Array<[number, string | null]>>();
                for (const [att, enc] of fp) {
                    const s = wvCbShardOf(att, CB_FILTER_SHARDS);
                    const a = byShard.get(s) || []; a.push([att, enc]); byShard.set(s, a);
                }
                for (const [s, list] of byShard) {
                    // Written to the end even after destroy(): a filter lost makes
                    // its PDF one the next library change reads again.
                    const r = await wvStoreRead(this._wvCbFilterPath(s));
                    const f: Record<string, string> = r.status === "ok" && r.doc && r.doc.v === CB_STORE_V && r.doc.f ? r.doc.f : {};
                    for (const [att, enc] of list) { if (enc !== null) f[String(att)] = enc; else delete f[String(att)]; }
                    ws.push(wvStoreWrite(this._wvCbFilterPath(s), { v: CB_STORE_V, f }, { pretty: null }));
                    await wvSleep(0);
                }
            }
            await Promise.all(ws);
        })();
        try { await P._wvCbFlushing; } finally { P._wvCbFlushing = null; }
    }

    /** The library's matching signatures, the time of the last full match and
     *  the changed items no pass has taken yet, written after a pass. */
    _wvCbFlushSigs(): Promise<void> {
        const P: any = this;
        const sigs: Map<number, number> = P._wvCbSigs;
        if (!sigs) return Promise.resolve();
        const a: number[] = [];
        for (const [id, s] of sigs) a.push(id, s);
        const pend = Array.from((P._wvCbChanged as Set<number>) || []);
        return wvStoreWrite(cbPath("sigs.json"), { v: CB_STORE_V, s: a, full: P._wvCbFullAt || 0, pend }, { pretty: null });
    }

    // ---- the entries store (one file a PDF) ---------------------------------------

    _wvCbEntDir(n: number): string {
        return PathUtils.join(wvStoreDir(), CB_DIR, CB_ENT_DIR, String(n).padStart(2, "0"));
    }

    _wvCbEntPath(att: number): string {
        return PathUtils.join(this._wvCbEntDir(wvCbShardOf(att, CB_ENT_DIRS)), att + ".jsonlz4");
    }

    /** Store the entries PDF `att` was just read into (`rec`: its record): their
     *  keys made in steps, then the file written through the store (compressed,
     *  atomic, retried; never awaited -- a write per PDF of a pass). False when
     *  the feature stopped meanwhile. */
    async _wvCbEntWrite(att: number, rec: WvCbRec, entries: string[], pace: (force?: boolean) => Promise<void>): Promise<boolean> {
        const keys = await this._wvCbSteps(wvCbEntryKeysSteps(entries), pace);
        if (!keys) return false;
        const doc: WvCbEntriesDoc = { v: CB_ENT_V, s: rec.s, src: rec.src, lf: wvCbListFp(), kf: wvCbKeysFp(), x: entries, k: keys };
        // Written, a library pane that looked for this PDF's list looks again: the
        // References section of a PDF never opened comes up with no polling
        // (refs.ts _wvRefsLibRecheck, citations.6).
        wvStoreWrite(this._wvCbEntPath(att), doc, { pretty: null, compress: true }).then(() => {
            const lp: any = wvLivePlugin();
            if (lp && typeof lp._wvRefsLibRecheck === "function") lp._wvRefsLibRecheck(att);
        }, () => {});
        const st = this._wvCbStatsObj();
        st.entWrites++;
        return true;
    }

    /** The stored entries of PDF `att` when they are those of its file of stamp
     *  `s`, read by this code: { x, src }; null otherwise -- missing, another
     *  file's, another reading code's, corrupt (kept in place: the read that
     *  follows writes it again). */
    async _wvCbEntRead(att: number, s: string): Promise<{ x: string[]; src: "sdt" | "ft" } | null> {
        const r = await wvStoreRead(this._wvCbEntPath(att), { decompress: true, onParseError: "keep" });
        if (r.status !== "ok") return null;
        const x = wvCbEntriesUsable(r.doc, CB_ENT_V, s, wvCbListFp());
        if (!x) return null;
        return { x, src: r.doc.src === "sdt" ? "sdt" : "ft" };
    }

    /** Remove PDF `att`'s stored entries (absent is fine). */
    _wvCbEntRemove(att: number) {
        wvStoreRemove(this._wvCbEntPath(att)).catch(() => {});
    }

    /** After a full pass: the entries files no record names (a PDF gone while
     *  Zotero was not running, a write that outlived its record) removed. A
     *  folder at a time, `pace` between. */
    async _wvCbEntSweep(ix: WvCbIndex, pace: (force?: boolean) => Promise<void>): Promise<number> {
        const P: any = this;
        let n = 0;
        for (let d = 0; d < CB_ENT_DIRS; d++) {
            await pace();
            if (P._wvDestroyed || this._wvCbHalt()) return n;
            let files: string[] = [];
            this._wvCbIoWait();
            try { files = await IOUtils.getChildren(this._wvCbEntDir(d)); } catch (e) { files = []; }
            this._wvCbIoDone();
            for (const f of files) {
                const m = /[\\/](\d+)\.jsonlz4$/.exec(f);
                if (m && !ix.recs.has(Number(m[1]))) { wvStoreRemove(f).catch(() => {}); n++; }
            }
        }
        if (n) Zotero.debug("[Weavero] cited by: " + n + " entries files of PDFs gone removed");
        return n;
    }

    // ---- pacing ------------------------------------------------------------------

    /** Go on while the current slice has time; else wait for the next idle
     *  moment of a main window (re-resolved each time: a closed window's
     *  callback never comes) and start a new slice. Slices are counted for
     *  the stats (`_wvCbStats`). `force`: a new slice in any case (after I/O,
     *  whose wait is not main-thread work). */
    async _wvCbPace(force = false): Promise<void> {
        const P: any = this;
        const st = this._wvCbStatsObj();
        const now = Date.now();
        if (!force && P._wvCbSliceAt && now - P._wvCbSliceAt < WV_CB_SLICE_MS) return;
        if (P._wvCbSliceAt) {
            const len = now - P._wvCbSliceAt;
            st.slices++;
            st.workMs += len;
            if (len > st.maxSliceMs) st.maxSliceMs = len;
            if (len > WV_CB_SLICE_MS + 7) st.over++;
        }
        P._wvCbSliceAt = 0;
        await new Promise<void>((res) => {
            let w: any = null;
            try { w = Zotero.getMainWindow(); } catch (e) {}
            // A window on screen: its idle moments (the user's typing and
            // scrolling come first). Hidden or minimised -- nobody is using
            // it, and Gecko gives a hidden window's idle callbacks only their
            // timeout: a short timer.
            let hidden = true;
            try { hidden = !w || w.closed || !!w.document.hidden; } catch (e) {}
            // One handle PER WAIT, in a set: two waits can be in flight (a
            // pass, and the library-change check _wvCbLibChanged paces
            // through here too). Until 2026-11-27 they shared one slot
            // (`_wvCbIdle`): the first to wake took the other's handle,
            // cancelled its idle callback and its backstop, and the other
            // never woke -- a pass "running" for good, refs-fulltext's
            // 240-s hang and sdt-clean after it (dev.99 triage). Each wake
            // now cancels only its own; _wvCbReset / _wvCbStop wake every
            // one (_wvCbWakeAll). Guard: test/cited-by-pace.spec.js.
            const idles: Set<any> = P._wvCbIdles || (P._wvCbIdles = new Set());
            const h: any = { w: null, id: null, t: null, res: null };
            let done = false;
            const go = () => {
                if (done) return;
                done = true;
                idles.delete(h);
                try { if (h.t) wvClearTimeout(h.t); } catch (e) {}
                try { if (h.w && !h.w.closed && h.id != null) h.w.cancelIdleCallback(h.id); } catch (e) {}
                res();
            };
            h.res = go;
            idles.add(h);
            if (!hidden && typeof w.requestIdleCallback === "function") {
                // The sandbox clock as a backstop: a window closed meanwhile
                // never calls back, and the pass would wait for good.
                h.w = w;
                h.id = w.requestIdleCallback(go, { timeout: 1000 });
                h.t = wvTimeout(go, 2000);
            }
            else h.t = wvTimeout(go, 4);
        });
        P._wvCbSliceAt = Date.now();
    }

    /** Wake every pacing wait at once (each cancels its own idle callback and
     *  backstop): the passes waiting go on and stop at their next check. */
    _wvCbWakeAll() {
        const P: any = this;
        const idles: Set<any> | null = P._wvCbIdles || null;
        if (!idles || !idles.size) return;
        for (const h of [...idles]) { try { h.res(); } catch (e) {} }
    }

    /** I/O is about to be awaited: the slice ends here (the wait for the
     *  answer is not main-thread work); `_wvCbIoDone` starts the next. */
    _wvCbIoWait() {
        const P: any = this;
        if (!P._wvCbSliceAt) return;
        const st = this._wvCbStatsObj();
        const len = Date.now() - P._wvCbSliceAt;
        st.slices++;
        st.workMs += len;
        if (len > st.maxSliceMs) st.maxSliceMs = len;
        if (len > WV_CB_SLICE_MS + 7) st.over++;
        P._wvCbSliceAt = 0;
    }

    _wvCbIoDone() {
        (this as any)._wvCbSliceAt = Date.now();
    }

    _wvCbStatsObj(): any {
        const P: any = this;
        return P._wvCbStatsO || (P._wvCbStatsO = { slices: 0, workMs: 0, maxSliceMs: 0, over: 0, passes: 0, read: { sdt: 0, ft: 0, none: 0 }, skipped: 0, total: 0, done: 0, lastPassMs: 0, readMs: 0,
            rematched: 0, entMissing: 0, entWrites: 0, lastPassReads: 0, lastPassRematches: 0 });
    }

    /** The source hashes the fingerprints take (the suite: the build set them). */
    _wvCbSrcHashes(): { match: string; list: string } {
        return { match: REFMATCH_SRC, list: REFLIST_SRC };
    }

    /** What the index has done so far (the suite, the plan's measurements). */
    _wvCbStats(): any {
        const P: any = this;
        const st = this._wvCbStatsObj();
        const ix: WvCbIndex | null = P._wvCbIx || null;
        return Object.assign({}, st, { read: Object.assign({}, st.read), records: ix ? ix.recs.size : 0, cited: ix ? ix.rev.size : 0, gen: ix ? ix.gen : 0, running: !!P._wvCbRunning,
            fullAt: P._wvCbFullAt || 0, changedPending: P._wvCbChanged ? P._wvCbChanged.size : 0 });
    }

    // ---- reading one PDF's reference list -------------------------------------

    /** The PDF attachments the index reads, in every user and group library,
     *  out of the trash (their parent too), most recently changed first. */
    async _wvCbCandidates(): Promise<WvCbCand[]> {
        const out: WvCbCand[] = [];
        const linkedUrl = this._wvRefsLinkedUrlMode();
        await Zotero.DB.queryAsync(
            "SELECT a.itemID, a.parentItemID, i.libraryID, i.key, a.linkMode, a.path, a.storageHash FROM itemAttachments a JOIN items i ON i.itemID = a.itemID"
            + " WHERE a.contentType = ? AND a.linkMode != ?"
            + " AND i.libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))"
            + " AND i.itemID NOT IN (SELECT itemID FROM deletedItems)"
            + " AND (a.parentItemID IS NULL OR a.parentItemID NOT IN (SELECT itemID FROM deletedItems))"
            + " ORDER BY i.clientDateModified DESC",
            ["application/pdf", linkedUrl],
            { onRow: (row: any) => {
                out.push({
                    id: row.getResultByIndex(0), parent: row.getResultByIndex(1) || 0, lib: row.getResultByIndex(2),
                    key: String(row.getResultByIndex(3)), linkMode: row.getResultByIndex(4),
                    path: String(row.getResultByIndex(5) || ""), storageHash: String(row.getResultByIndex(6) || ""),
                });
            } });
        return out;
    }

    /** The folder of `c`'s caches (Zotero keeps them in the storage folder, a
     *  linked file's too: sdt.js _getCachePath, fulltext.js getItemCacheFile). */
    _wvCbDir(c: WvCbCand): string {
        try { return Zotero.Attachments.getStorageDirectoryByLibraryAndKey(c.lib, c.key).path; } catch (e) {}
        return PathUtils.join(Zotero.DataDirectory.dir, "storage", c.key);
    }

    /** The PDF's own path ("" when it cannot be told without loading the item). */
    _wvCbPdfPath(c: WvCbCand): string {
        try {
            if (c.path.startsWith("storage:")) return PathUtils.join(this._wvCbDir(c), c.path.slice(8));
            if (c.path.startsWith("attachments:")) return String(Zotero.Attachments.resolveRelativePath(c.path) || "");
            return c.path;
        } catch (e) { return ""; }
    }

    /** Which cache to read for `c` and its stamp: the structure cache when it
     *  is the PDF's own (not older than the PDF; Zotero keeps it with the
     *  file's MD5, which the stored hash of a synced file must equal -- that
     *  is checked at the read) and not too big, else the full-text cache;
     *  "none" with neither. Stats only. */
    async _wvCbStamp(c: WvCbCand): Promise<{ src: "sdt" | "ft" | "none"; s: string; path: string }> {
        const dir = this._wvCbDir(c);
        const sdt = PathUtils.join(dir, ".zotero-sdt-cache");
        const ft = PathUtils.join(dir, ".zotero-ft-cache");
        const stat = async (p: string) => { try { return await IOUtils.stat(p); } catch (e) { return null; } };
        const [ss, fs] = await Promise.all([stat(sdt), stat(ft)]);
        if (ss && ss.size <= SDT_MAX_BYTES && this._wvCbSdtUsable()) {
            const pdf = this._wvCbPdfPath(c);
            const ps = pdf ? await stat(pdf) : null;
            if (ps && ss.lastModified >= ps.lastModified) return { src: "sdt", s: "sdt:" + ss.size + ":" + ss.lastModified, path: sdt };
        }
        if (fs && fs.size > 0) return { src: "ft", s: cbFtStamp(fs), path: ft };
        return { src: "none", s: "none", path: "" };
    }

    /** The stamp attachment `att`'s full-text cache has NOW, as a pass names it
     *  (cbFtStamp); "" without one. One stat, nothing read -- the References
     *  section's stored list is read only for that stamp (refs.ts
     *  _wvRefsStoredEntries, citations.6). */
    async _wvCbFtStampOf(att: any): Promise<string> {
        try {
            const ft = PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-ft-cache");
            return cbFtStamp(await IOUtils.stat(ft));
        } catch (e) { return ""; }
    }

    /** Zotero's structure-data module and its versions, when this Zotero has
     *  them (Zotero 11, 10.0.8); null elsewhere -- then only full texts are read. */
    _wvCbSdtUsable(): any {
        return wvSdtModule();
    }

    /** The entries of a structure cache's bytes: the pack opened as Zotero
     *  opens it (sdt.js _openPack), checked as it checks it (pack and schema
     *  version, a PDF processor, the file's hash when known), its blocks read
     *  chunk by chunk with `pace` between, then walked (lib/ref-list.ts). Null
     *  when it is not usable. */
    async _wvCbSdtEntries(bytes: any, opts: { title?: string; hash?: string; pace?: () => Promise<void> }): Promise<string[] | null> {
        if (!this._wvCbSdtUsable()) return null;
        const rd = await wvSdtOpen(bytes);
        if (!rd || !(await wvSdtVersionOk(rd))) return null;
        const md = await rd.getMetadata();
        if (!md || !md.processor || md.processor.type !== "pdf") return null;
        if (opts.hash && md.source && md.source.hash && md.source.hash !== opts.hash) return null;
        const catalog = await rd.getCatalog();
        const starts: number[] = Array.from(rd.index && rd.index.chunkBlockStarts || []);
        const content: any[] = [];
        for (let k = 0; k + 1 < starts.length; k++) {
            if (opts.pace) await opts.pace();
            const blocks = await rd.getBlocks(starts[k], starts[k + 1] - 1);
            for (const b of blocks) content.push(b);
        }
        if (opts.pace) await opts.pace();
        const r = wvRefList({ schemaVersion: rd.header.schemaVersion, metadata: md, catalog, content }, { title: opts.title || "" });
        return r.entries.map((e) => e.text);
    }

    /** Run the steps of `g` (lib/ref-citedby.ts WvCbSteps), `pace` between
     *  two; null when the feature stopped meanwhile (the steps left unfinished). */
    async _wvCbSteps<T>(g: WvCbSteps<T>, pace: (force?: boolean) => Promise<void>): Promise<T | null> {
        for (;;) {
            const r = g.next();
            if (r.done) return r.value;
            await pace();
            if (this._wvCbHalt()) { try { g.return(undefined as any); } catch (e) {} return null; }
        }
    }

    /** Match `entries` against the library index: [[entry, id, copies...], ...];
     *  each entry's filter tokens put in `tokens` (lib/ref-citedby.ts). */
    async _wvCbMatchAll(rix: WvRefIndex, entries: string[], self: any, pace?: () => Promise<void>, tokens?: { add(t: string): unknown }): Promise<number[][]> {
        const out: number[][] = [];
        for (let i = 0; i < entries.length; i++) {
            if (pace) {
                await pace();
                if (this._wvCbHalt()) break;
            }
            const m = wvRefMatch(rix, entries[i], self);
            if (m && m.ids.length) out.push([i].concat(m.ids));
            if (tokens) wvCbEntryTokens(entries[i], tokens);
        }
        return out;
    }

    /** Read and match one PDF (`c`, its stamp `st`): its record, its filter
     *  encoded ("" when it has no entries: it can cite nothing), and the entries
     *  read (null when there was nothing to read). A cache whose read THREW (a
     *  lock, an antivirus scan -- not a file that cannot be used): `failed`, no
     *  entries, no filter, and a record with a blank stamp, so the next pass
     *  reads the PDF again (review of M1, 2026-11-21: an empty list was kept
     *  under the file's stamp, trusted by every re-match until the file changed;
     *  a structure cache's failed read left the full text under its stamp). */
    async _wvCbReadOne(rix: WvRefIndex, c: WvCbCand, st: { src: "sdt" | "ft" | "none"; s: string; path: string }, gen: number, pace: (force?: boolean) => Promise<void>): Promise<{ rec: WvCbRec; filt?: string; entries: string[] | null; failed?: boolean }> {
        const P: any = this;
        const rec: WvCbRec = { s: st.s, src: st.src, p: c.parent, l: c.lib, g: gen, c: [] };
        if (st.src === "none") return { rec, filt: "", entries: null };
        const failed = () => { rec.s = ""; return { rec, entries: null, failed: true }; };
        // The citing paper from the library index (a group's items need not be
        // loaded): its title for the walk, and the self-match guard.
        const top = c.parent ? wvRefIndexGet(rix, c.parent) : null;
        const title = top ? top.title : "";
        const self = wvRefSelfOf(rix, c.parent ? [c.id, c.parent] : [c.id]);
        let entries: string[] | null = null;
        const t0 = Date.now();
        if (st.src === "sdt") {
            this._wvCbIoWait();
            let bytes: any = null;
            try { bytes = await IOUtils.read(st.path); } catch (e) { bytes = null; }
            if (P._wvDestroyed) return { rec, filt: "", entries: null };
            if (!bytes) return failed();
            await pace(true);
            try { if (bytes) entries = await this._wvCbSdtEntries(bytes, { title, hash: c.storageHash, pace: () => pace() }); } catch (e) { entries = null; }
            // Not usable after all (another PDF's, a version this Zotero cannot
            // read): the full text, if there is one. The record keeps the
            // structure cache's stamp, so the next pass does not try it again
            // until that file changes.
            if (!entries) {
                const ft = PathUtils.join(this._wvCbDir(c), ".zotero-ft-cache");
                let fs: any = null;
                this._wvCbIoWait();
                try { fs = await IOUtils.stat(ft); } catch (e) {}
                this._wvCbIoDone();
                if (fs && fs.size > 0) { rec.src = "ft"; st = { src: "ft", s: rec.s, path: ft }; }
                else { rec.src = "none"; return { rec, filt: "", entries: null }; }
            }
        }
        if (st.src === "ft") {
            this._wvCbIoWait();
            let text: string | null = null;
            try { text = await IOUtils.readUTF8(st.path); } catch (e) { text = null; }
            if (P._wvDestroyed) return { rec, filt: "", entries: null };
            if (text == null) return failed();
            await pace(true);
            // In steps (lib/ref-citedby.ts): a book's headings looked for over
            // its 5 MB took 65 ms in one call, a region cut into entries 32 ms
            // (Zotero 11, plan §13).
            const sec = await this._wvCbSteps(wvCbSectionsSteps(text), pace);
            if (!sec) return { rec, filt: "", entries: null };
            entries = [];
            for (const [a, b] of sec.regions) {
                await pace();
                const ch = await this._wvCbSteps(wvCbChunksSteps(text.slice(a, b)), pace);
                if (!ch) return { rec, filt: "", entries: null };
                entries = entries.concat(ch);
                if (entries.length >= WV_CB_MAX_TEXT_ENTRIES) { entries = entries.slice(0, WV_CB_MAX_TEXT_ENTRIES); break; }
            }
        }
        this._wvCbStatsObj().readMs += Date.now() - t0;
        const tokens = new WvCbTokenSink();
        rec.c = await this._wvCbMatchAll(rix, entries || [], self, () => pace(), tokens);
        await pace();
        if (!tokens.size) return { rec, filt: "", entries: entries || [] };
        // In steps too: a book's filter, 100,000 tokens, took 46 ms to make.
        const f = await this._wvCbSteps(wvCbFilterOfSteps(tokens), pace);
        const filt = f ? await this._wvCbSteps(wvCbFilterEncodeSteps(f), pace) : null;
        return { rec, filt: filt || "", entries: entries || [] };
    }

    /** Match PDF `c` again from its stored entries, its file unchanged (stamp
     *  `st`): its record, and its filter made again when `withFilter` (a matcher
     *  of other code: the filter's tokens may have changed with it; a record
     *  lost). Null when no entries are stored for that file and this reading
     *  code: the PDF is read then. Its caches are not touched. */
    async _wvCbReMatchOne(rix: WvRefIndex, c: WvCbCand, st: { src: "sdt" | "ft" | "none"; s: string; path: string }, gen: number, pace: (force?: boolean) => Promise<void>, withFilter: boolean): Promise<{ rec: WvCbRec; filt?: string } | null> {
        const P: any = this;
        this._wvCbIoWait();
        const ent = await this._wvCbEntRead(c.id, st.s);
        this._wvCbIoDone();
        if (!ent || P._wvDestroyed) return null;
        await pace();
        const rec: WvCbRec = { s: st.s, src: ent.src, p: c.parent, l: c.lib, g: gen, c: [] };
        const self = wvRefSelfOf(rix, c.parent ? [c.id, c.parent] : [c.id]);
        const tokens = withFilter ? new WvCbTokenSink() : undefined;
        rec.c = await this._wvCbMatchAll(rix, ent.x, self, () => pace(), tokens);
        if (!tokens) return { rec };
        await pace();
        if (!tokens.size) return { rec, filt: "" };
        const f = await this._wvCbSteps(wvCbFilterOfSteps(tokens), pace);
        const filt = f ? await this._wvCbSteps(wvCbFilterEncodeSteps(f), pace) : null;
        return { rec, filt: filt || "" };
    }

    // ---- the pass ----------------------------------------------------------------

    /** Schedule a pass in `ms` (the earliest asked wins). */
    _wvCbSchedule(ms: number, why: string) {
        const P: any = this;
        if (P._wvDestroyed || !this._wvCbOn()) return;
        const at = Date.now() + ms;
        if (P._wvCbPassT && P._wvCbPassAt <= at) return;
        wvClearTimeout(P._wvCbPassT);
        P._wvCbPassAt = at;
        P._wvCbPassT = wvTimeout(() => {
            P._wvCbPassT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            lp._wvCbPass(why).catch((e: any) => Zotero.debug("[Weavero] cited by pass err: " + e));
        }, ms);
    }

    /** A pass for the library's changes alone, in `ms` (the earliest asked wins). */
    _wvCbScheduleTargeted(ms: number) {
        const P: any = this;
        if (P._wvDestroyed || !this._wvCbOn()) return;
        const at = Date.now() + ms;
        if (P._wvCbTgtT && P._wvCbTgtAt <= at) return;
        wvClearTimeout(P._wvCbTgtT);
        P._wvCbTgtAt = at;
        P._wvCbTgtT = wvTimeout(() => {
            P._wvCbTgtT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            lp._wvCbPass("library changed", undefined, true).catch((e: any) => Zotero.debug("[Weavero] cited by pass err: " + e));
        }, ms);
    }

    /** One pass, paced throughout; one at a time (another asked meanwhile runs
     *  after it).
     *  - Plain: every PDF's caches stat-ed; what is new or changed read and
     *    matched; what is older than the full-match generation matched again
     *    from its stored entries (read when they are not stored); records of
     *    PDFs gone dropped. A week after the last full match (CB_FULL_EVERY_MS)
     *    the generation moves first: every record is matched again, then the
     *    entries files of PDFs gone removed. Then, as below, the library's
     *    changes.
     *  - `only`: these attachments alone, when new or changed (a PDF just added).
     *  - `targeted`: the library's changes alone -- the PDFs that can cite an
     *    item added or changed since (_wvCbTargets), matched again from their
     *    stored entries. */
    async _wvCbPass(why: string, only?: number[], targeted?: boolean): Promise<void> {
        const P: any = this;
        if (P._wvCbRunning) {
            // After this one: the PDFs asked for, the library's changes, or a whole pass.
            if (only) { const q: Set<number> = P._wvCbNewPdfs || (P._wvCbNewPdfs = new Set()); for (const id of only) q.add(id); }
            else if (!targeted) P._wvCbRerun = P._wvCbRerun || why;
            return;
        }
        if (!this._wvCbOn()) return;
        P._wvCbRunning = true;
        // The epoch it runs in: a reset (Remove Built Data) moves it, and from then
        // on the pass halts (_wvCbHalt) and its end writes nothing.
        const ep = P._wvCbEpoch || 0;
        P._wvCbRunEpoch = ep;
        const st = this._wvCbStatsObj();
        const t0 = Date.now();
        let read = 0, rematched = 0, complete = false, full = false;
        try {
            const ix = await this._wvCbLoad();
            const rix: WvRefIndex | null = await this._wvRefsIndexEnsure();
            if (!rix || this._wvCbHalt()) return;
            this._wvCbWireNotifier();
            const pace = (force?: boolean) => this._wvCbPace(!!force);
            await this._wvCbSigsCheck(rix, pace);
            if (this._wvCbHalt()) return;
            if (!only && !targeted && Date.now() - (P._wvCbFullAt || 0) > CB_FULL_EVERY_MS) {
                full = true;
                if (P._wvCbFullAt) { ix.gen++; Zotero.debug("[Weavero] cited by: the weekly full match, generation " + ix.gen); }
            }
            this._wvCbIoWait();
            const all = await this._wvCbCandidates();
            this._wvCbIoDone();
            if (this._wvCbHalt()) return;
            const doneNow = new Set<number>();
            /** PDF `c` (its stamp now `sp`) matched again from its stored entries
             *  when its file is the one they were read from (`same`: the record's
             *  stamp; no record -- a shard lost -- they may be there too), else
             *  read; its record put (its shard written with the next flush), its
             *  filter set when one was made -- made again from the entries when
             *  `noFilter` (none in the filter files: _wvCbTargets). */
            const doOne = async (c: WvCbCand, sp: { src: "sdt" | "ft" | "none"; s: string; path: string }, noFilter?: boolean): Promise<boolean> => {
                await pace(true);
                if (this._wvCbHalt()) return false;
                const had = ix.recs.get(c.id);
                const same = !!had && had.s === sp.s && had.p === c.parent && had.l === c.lib;
                let res: { rec: WvCbRec; filt?: string } | null = null;
                if (sp.src === "none") {
                    // No cache to read: nothing cites.
                    res = { rec: { s: sp.s, src: "none", p: c.parent, l: c.lib, g: ix.gen, c: [] }, filt: "" };
                    st.read.none++;
                    if (had && had.src !== "none") this._wvCbEntRemove(c.id);
                }
                else if (same || !had) {
                    res = await this._wvCbReMatchOne(rix, c, sp, ix.gen, pace, !had || (had as WvCbRec).g === 0 || !!noFilter);
                    if (this._wvCbHalt()) return false;
                    if (res) { st.rematched++; rematched++; }
                    else st.entMissing++;
                }
                if (!res) {
                    const r = await this._wvCbReadOne(rix, c, sp, ix.gen, pace);
                    // Stopped meanwhile: the record may be partial, never kept.
                    if (this._wvCbHalt()) return false;
                    if (r.entries) { if (!(await this._wvCbEntWrite(c.id, r.rec, r.entries, pace))) return false; }
                    else this._wvCbEntRemove(c.id);
                    // A cache that could not be read (a lock, an antivirus scan): no
                    // stamp, so the next pass reads it again; its matches kept meanwhile.
                    if (r.failed && had) r.rec.c = had.c;
                    st.read[r.rec.src]++;
                    read++;
                    res = r;
                }
                wvCbPut(ix, c.id, res.rec);
                // Every record put is written: a re-match changes no filter (the
                // weekly one, a library change's), and its shard was never written --
                // the match lost at the next start, the old generation's records
                // matched again at every start (review of M1, 2026-11-21).
                this._wvCbDirty(c.id);
                if (res.filt !== undefined) this._wvCbFilterSet(c.id, res.filt);
                doneNow.add(c.id);
                return true;
            };
            if (!targeted) {
                let cands = all;
                if (only) { const s = new Set(only); cands = all.filter((c) => s.has(c.id)); }
                else {
                    // PDFs gone (erased, trashed, no longer a PDF): their records go.
                    const live = new Set(all.map((c) => c.id));
                    for (const att of Array.from(ix.recs.keys())) if (!live.has(att)) { wvCbDrop(ix, att); this._wvCbFilterSet(att, null); this._wvCbEntRemove(att); }
                    st.total = cands.length;
                    st.done = 0;
                }
                st.passes++;
                Zotero.debug("[Weavero] cited by: pass (" + why + ") over " + cands.length + " PDFs");
                let lastSec = Date.now();
                for (let i = 0; i < cands.length; i += STAT_BATCH) {
                    await pace();
                    if (this._wvCbHalt()) return;
                    const batch = cands.slice(i, i + STAT_BATCH);
                    this._wvCbIoWait();
                    const stamps = await Promise.all(batch.map((c) => this._wvCbStamp(c)));
                    this._wvCbIoDone();
                    if (this._wvCbHalt()) return;
                    for (let k = 0; k < batch.length; k++) {
                        const c = batch[k], sp = stamps[k];
                        const had = ix.recs.get(c.id);
                        if (had && had.s === sp.s && had.g >= ix.gen && had.p === c.parent && had.l === c.lib) { st.skipped++; if (!only) st.done++; continue; }
                        if (!(await doOne(c, sp))) return;
                        if (!only) st.done++;
                        if (Date.now() - lastSec > SEC_REFRESH_MS) { lastSec = Date.now(); this._wvCbSecRefreshAll(); }
                    }
                }
            }
            if (!only) {
                // The library's changes: the PDFs that can cite what was added or
                // changed. A full match covers them all.
                const changed: Set<number> = P._wvCbChanged || new Set();
                P._wvCbChanged = new Set();
                if (changed.size && !full) {
                    const tt = Date.now();
                    const noFilter = new Set<number>();
                    // Stopped: the changes are left for the next pass -- not after a
                    // reset, they concern records that are gone.
                    const keep = () => {
                        if ((P._wvCbEpoch || 0) !== ep) return;
                        const ch: Set<number> = P._wvCbChanged || (P._wvCbChanged = new Set());
                        for (const id of changed) ch.add(id);
                    };
                    const targets = await this._wvCbTargets(rix, ix, Array.from(changed), pace, noFilter);
                    if (this._wvCbHalt()) { keep(); return; }
                    const byId = new Map(all.map((c) => [c.id, c] as [number, WvCbCand]));
                    let n = 0;
                    const read0 = read;
                    for (const att of targets) {
                        if (doneNow.has(att)) continue;
                        const c = byId.get(att);
                        if (!c) continue;
                        this._wvCbIoWait();
                        const sp = await this._wvCbStamp(c);
                        this._wvCbIoDone();
                        if (!(await doOne(c, sp, noFilter.has(att)))) { keep(); return; }
                        n++;
                    }
                    st.targeted = { items: changed.size, pdfs: targets.size, done: n, read: read - read0, ms: Date.now() - tt };
                    Zotero.debug("[Weavero] cited by: " + changed.size + " library item(s) new or changed: " + targets.size + " PDF(s) can cite them, " + n + " matched again (" + (read - read0) + " read) in " + st.targeted.ms + " ms");
                }
            }
            // The entries files no record names, after a full pass (every record known).
            if (full && !only && !targeted) { await this._wvCbEntSweep(ix, pace); if (this._wvCbHalt()) return; }
            if (this._wvCbHalt()) return;
            complete = true;
            if (full) P._wvCbFullAt = Date.now();
            if (!only && !targeted) P._wvCbPassedGen = ix.gen;
        }
        finally {
            P._wvCbRunning = false;
            P._wvCbSliceAt = 0;
            st.lastPassMs = Date.now() - t0;
            st.lastPassReads = read;
            st.lastPassRematches = rematched;
            // Reset meanwhile (Remove Built Data): nothing written, nothing scheduled
            // -- the files are going and the cleaning schedules a fresh pass.
            const reset = (P._wvCbEpoch || 0) !== ep;
            if (reset && !P._wvDestroyed) Zotero.debug("[Weavero] cited by: pass (" + why + ") ended by a reset, nothing written");
            if (!P._wvDestroyed && !reset) {
                Zotero.debug("[Weavero] cited by: pass (" + why + ") read " + read + " PDFs, matched " + rematched + " again from their entries, in " + st.lastPassMs + " ms (max slice " + st.maxSliceMs + " ms)" + (complete ? "" : ", stopped"));
                this._wvCbFlush().catch(() => {});
                this._wvCbFlushSigs().catch(() => {});
                this._wvCbSecRefreshAll();
                const again = P._wvCbRerun;
                P._wvCbRerun = null;
                if (again) this._wvCbSchedule(1000, again);
                else {
                    if (!only && !targeted) this._wvCbSchedule(PERIODIC_MS, "periodic");
                    // Asked while this pass ran: the new PDFs, the library's changes.
                    if (P._wvCbNewPdfs && P._wvCbNewPdfs.size && !P._wvCbNewT) {
                        P._wvCbNewT = wvTimeout(() => {
                            P._wvCbNewT = null;
                            const lp: any = wvLivePlugin();
                            if (lp !== P || P._wvDestroyed) return;
                            const list = Array.from(P._wvCbNewPdfs || []) as number[];
                            P._wvCbNewPdfs = new Set();
                            if (list.length) lp._wvCbPass("new PDFs", list).catch(() => {});
                        }, 2000);
                    }
                    if (P._wvCbLibPending) { P._wvCbLibPending = false; this._wvCbLibChanged().catch(() => {}); }
                    else if (P._wvCbChanged && P._wvCbChanged.size) this._wvCbScheduleTargeted(2000);
                }
            }
        }
    }

    // ---- the library changes -------------------------------------------------------

    /** The PDFs the changed items `ids` concern: those whose filter passes one
     *  of the items' keys (lib/ref-citedby.ts wvCbMayCite), those that cite an
     *  item now (its title or DOI may have changed), and those that cite a copy
     *  of it (the same DOI or title: a match names every copy, ref-match.ts
     *  copiesOf -- the copy's own keys may be absent from the entry, an APS one
     *  that names it by volume and page). Items gone from the library concern
     *  none. The filters are read from their files a file at a time and
     *  dropped after; a record with no filter there cannot be told and is
     *  matched again -- put in `noFilter` too, so its filter is made again
     *  (review of M1, 2026-11-21: matched without one, it never got it back). */
    async _wvCbTargets(rix: WvRefIndex, ix: WvCbIndex, ids: number[], pace: () => Promise<void>, noFilter?: Set<number>): Promise<Set<number>> {
        const P: any = this;
        const out = new Set<number>();
        const keys: WvCbItemKeys[] = [];
        for (const id of ids) {
            for (const a of wvCbCiters(ix, id)) out.add(a);
            const r: any = rix.items.get(id);
            if (!r) continue;
            keys.push(wvCbItemKeys(r));
            const copies = new Set<number>();
            for (const d of r.dois || []) for (const o of rix.byDOI.get(d) || []) copies.add(o);
            if (r.ct && r.ct.length >= 10) for (const o of rix.byTitle.get(r.ct) || []) copies.add(o);
            for (const a of r.axs || []) for (const o of (rix.byArxiv && rix.byArxiv.get(a)) || []) copies.add(o);
            copies.delete(id);
            for (const o of copies) for (const a of wvCbCiters(ix, o)) out.add(a);
        }
        if (!keys.length) return out;
        // The filters written first: one taken out of the pending ones but not
        // yet in its file would count as missing (read again for nothing).
        await this._wvCbFlush();
        const pending: Map<number, string | null> = P._wvCbFiltPending || new Map();
        const seen = new Set<number>();
        const test = (att: number, enc: string) => {
            seen.add(att);
            if (enc === "") return;   // nothing to cite
            const f = wvCbFilterDecode(enc);
            if (!f || keys.some((k) => wvCbMayCite(f, k))) out.add(att);
        };
        for (let s = 0; s < CB_FILTER_SHARDS; s++) {
            await pace();
            if (P._wvDestroyed) return out;
            this._wvCbIoWait();
            const r = await wvStoreRead(this._wvCbFilterPath(s));
            this._wvCbIoDone();
            if (P._wvDestroyed) return out;
            const f = r.status === "ok" && r.doc && r.doc.v === CB_STORE_V && r.doc.f ? r.doc.f : null;
            if (!f) continue;
            let n = 0;
            for (const k of Object.keys(f)) {
                const att = Number(k);
                if (!ix.recs.has(att) || pending.has(att)) continue;
                if (++n % 64 === 0) await pace();
                test(att, f[k]);
            }
        }
        for (const [att, enc] of pending) if (enc !== null && ix.recs.has(att)) test(att, enc);
        for (const [att, rec] of ix.recs) {
            if (rec.src !== "none" && rec.c && !seen.has(att) && !pending.has(att)) { out.add(att); if (noFilter) noFilter.add(att); }
        }
        return out;
    }

    /** Compare the library index with the signatures the records were matched
     *  against: an item new, or whose title, DOI, first creator or year changed,
     *  is put among the changes the next pass takes (_wvCbTargets). Gone items
     *  need nothing (their rows are left out when shown). The very first look
     *  has nothing to compare with. Returns how many changed. */
    async _wvCbSigsCheck(rix: WvRefIndex, pace?: () => Promise<void>): Promise<number> {
        const P: any = this;
        const ix: WvCbIndex = P._wvCbIx;
        if (!ix || !rix) return 0;
        const sigs: Map<number, number> = P._wvCbSigs || (P._wvCbSigs = new Map());
        const changedSet: Set<number> = P._wvCbChanged || (P._wvCbChanged = new Set());
        const first = !sigs.size;
        let changed = 0;
        const seen = new Set<number>();
        const ids = Array.from(rix.items.keys());
        for (let i = 0; i < ids.length; i++) {
            if (pace && i % 500 === 0) { await pace(); if (P._wvDestroyed) return 0; }
            const id = ids[i];
            seen.add(id);
            const s = sigOf(wvRefIndexGet(rix, id));
            if (sigs.get(id) !== s) {
                sigs.set(id, s);
                if (!first) { changedSet.add(id); changed++; }
            }
        }
        for (const id of Array.from(sigs.keys())) if (!seen.has(id)) sigs.delete(id);
        if (changed) Zotero.debug("[Weavero] cited by: " + changed + " library item(s) new or changed");
        return changed;
    }

    /** The item observer, stamped like every long-lived hook (src-ts.md). */
    _wvCbWireNotifier() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvCbObsID) {
                if (g._wvCbObsVer === tag) return;
                try { Zotero.Notifier.unregisterObserver(g._wvCbObsID); } catch (e) {}
                delete g._wvCbObsID;
            }
            g._wvCbObsVer = tag;
            g._wvCbObsID = Zotero.Notifier.registerObserver({
                notify: (event: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = wvLivePlugin();
                        if (!lp || type !== "item" || lp._wvWireTag() !== tag) return;
                        lp._wvCbOnItems(event, ids || []);
                    } catch (e) {}
                },
            }, ["item"], "weavero-citedby", 95);
        } catch (e) { Zotero.debug("[Weavero] cited by notifier err: " + e); }
    }

    _wvCbUnwireNotifier() {
        try {
            const g: any = Zotero;
            if (g._wvCbObsID) { try { Zotero.Notifier.unregisterObserver(g._wvCbObsID); } catch (e) {} }
            delete g._wvCbObsID; delete g._wvCbObsVer;
        } catch (e) {}
    }

    /** An item event: a citing PDF erased or trashed leaves at once; a PDF
     *  added is read once Zotero has indexed it; any item added or modified
     *  may change what papers cite -- checked after the References index has
     *  taken the change (its own observer flushes within half a second). */
    _wvCbOnItems(event: string, ids: any[]) {
        const P: any = this;
        if (!this._wvCbOn() || !["add", "modify", "trash", "delete", "refresh", "move"].includes(event)) return;
        const ix: WvCbIndex | null = P._wvCbIx;
        const added: number[] = [];
        for (const raw of ids) {
            const id = typeof raw === "number" ? raw : parseInt(String(raw), 10);
            if (!Number.isFinite(id)) continue;
            if ((event === "delete" || event === "trash") && ix && wvCbDrop(ix, id)) { this._wvCbFilterSet(id, null); this._wvCbEntRemove(id); }
            if (event === "add") {
                try { const it = Zotero.Items.get(id); if (it && it.isPDFAttachment && it.isPDFAttachment()) added.push(id); } catch (e) {}
            }
        }
        if (added.length) {
            const q: Set<number> = P._wvCbNewPdfs || (P._wvCbNewPdfs = new Set());
            for (const id of added) q.add(id);
            wvClearTimeout(P._wvCbNewT);
            P._wvCbNewT = wvTimeout(() => {
                P._wvCbNewT = null;
                const lp: any = wvLivePlugin();
                if (lp !== P || P._wvDestroyed) return;
                const list = Array.from(P._wvCbNewPdfs || []) as number[];
                P._wvCbNewPdfs = new Set();
                if (list.length) lp._wvCbPass("new PDFs", list).catch(() => {});
            }, NEW_PDF_DELAY_MS);
        }
        if (event === "delete" || event === "trash") this._wvCbSecRefreshAll();
        wvClearTimeout(P._wvCbLibT);
        P._wvCbLibT = wvTimeout(() => {
            P._wvCbLibT = null;
            const lp: any = wvLivePlugin();
            if (lp === P && !P._wvDestroyed) lp._wvCbLibChanged().catch(() => {});
        }, 1500);
    }

    /** After a burst of item events: the items whose matching data moved are
     *  put among the changes, and a pass for them alone comes a minute later
     *  (a sync or an import goes on for a while). */
    async _wvCbLibChanged(): Promise<void> {
        const P: any = this;
        const rix: WvRefIndex | null = P._wvRefsIx;
        if (!rix || !P._wvCbIx) return;
        // A pass checks the library itself when it starts; one running now
        // started before this change: checked once it ends.
        if (P._wvCbRunning) { P._wvCbLibPending = true; return; }
        const n = await this._wvCbSigsCheck(rix, () => this._wvCbPace());
        P._wvCbSliceAt = 0;
        if (P._wvDestroyed || !n) return;
        this._wvCbFlushSigs().catch(() => {});
        this._wvCbScheduleTargeted(LIB_PASS_DELAY_MS);
    }

    // ---- what the section shows --------------------------------------------------------

    /** The works citing `item` (lib/ref-citedby.ts wvCbWorks): ONE per work, its
     *  copies in other libraries folded in, best first -- from the References
     *  index's records (regular items out of the trash), no item loaded, linear
     *  in the citers -- cached per item and the two indexes' states. Null while
     *  either index is not there (its load started, the sections drawn again
     *  after it). */
    _wvCbWorksOf(item: any): WvCbWork[] | null {
        const P: any = this;
        const ix: WvCbIndex | null = P._wvCbIx;
        if (!ix || !item) return null;
        const rix: WvRefIndex | null = P._wvRefsIx || null;
        if (!rix) {
            try { if (this._wvCbOn()) this._wvRefsIndexEnsure().then((r: any) => { const lp: any = wvLivePlugin(); if (r && lp) lp._wvCbSecRefreshAll(); }, () => {}); } catch (e) {}
            return null;
        }
        const key = ix.seq + ":" + rix.seq;
        const hit = this._wvCbWorksCacheMap().get(item.id);
        if (hit && hit.key === key) return hit.works;
        // Cited by thousands of PDFs: in idle slices, the works known before shown meanwhile.
        if ((ix.rev.get(item.id) || []).length > CB_WORKS_SYNC) {
            this._wvCbWorksLater(item, key);
            return hit ? hit.works : null;
        }
        const t0 = Date.now();
        const works = wvCbRun(this._wvCbWorksSteps(item, ix, rix));
        const ms = Date.now() - t0;
        if (ms > 20) Zotero.debug("[Weavero] cited by: " + works.length + " works citing item " + item.id + " in " + ms + " ms");
        this._wvCbWorksKeep(item.id, key, works);
        return works;
    }

    _wvCbWorksCacheMap(): Map<number, { key: string; works: WvCbWork[] }> {
        const P: any = this;
        return P._wvCbWorksCache || (P._wvCbWorksCache = new Map());
    }

    /** Keep `works` for item `id` and the indexes' state `key` (the last few items only). */
    _wvCbWorksKeep(id: number, key: string, works: WvCbWork[]) {
        const cache = this._wvCbWorksCacheMap();
        cache.delete(id);
        cache.set(id, { key, works });
        if (cache.size > 8) cache.delete(cache.keys().next().value as number);
    }

    /** The steps of `item`'s works (lib/ref-citedby.ts wvCbWorksSteps) over the two indexes. */
    _wvCbWorksSteps(item: any, ix: WvCbIndex, rix: WvRefIndex): WvCbSteps<WvCbWork[]> {
        let user = 1;
        try { user = Zotero.Libraries.userLibraryID; } catch (e) {}
        return wvCbWorksSteps(ix, item.id, (id) => rix.items.get(id), item.libraryID, user, (att) => {
            // A standalone PDF (rare): the attachment itself.
            try {
                const it = Zotero.Items.get(att);
                if (!it || it.deleted) return null;
                return { id: att, lib: it.libraryID, title: String(it.getDisplayTitle() || ""), ct: "", dois: [], first: "", year: "" };
            } catch (e) { return null; }
        });
    }

    /** `item`'s works computed in idle slices of at most CB_WORKS_SLICE_MS (a
     *  step may run past it), one computation at a time: another item asked, or
     *  the indexes moved on, and the running one stops; so does one no section
     *  shows any more (the item changed). Done: kept, the sections drawn again.
     *  How it went is in `_wvCbWorksStat` (the stress spec). */
    _wvCbWorksLater(item: any, key: string) {
        const P: any = this;
        const run = P._wvCbWorksRun;
        if (run && run.item === item.id && run.key === key) return;
        if (run) run.stop = true;
        const me = { item: item.id, key, stop: false };
        P._wvCbWorksRun = me;
        const ix: WvCbIndex = P._wvCbIx, rix: WvRefIndex = P._wvRefsIx;
        const st = P._wvCbWorksStat = { item: item.id, citers: (ix.rev.get(item.id) || []).length, slices: 0, maxSliceMs: 0, workMs: 0, done: false, stopped: false };
        const g = this._wvCbWorksSteps(item, ix, rix);
        // An idle moment of the main window, the sandbox clock as a backstop: a
        // window that closes meanwhile never calls back, and the computation would
        // stay "running" for good -- that item's works never computed again (as
        // _wvCbPace's backstop).
        const idle = () => new Promise<void>((res) => {
            let done = false;
            const go = () => { if (!done) { done = true; res(); } };
            const t = wvTimeout(go, 250);
            let w: any = null;
            try { w = Zotero.getMainWindow(); } catch (e) {}
            try { if (w && !w.closed && !w.document.hidden && typeof w.requestIdleCallback === "function") { w.requestIdleCallback(go, { timeout: 100 }); return; } } catch (e) {}
            wvClearTimeout(t);
            wvTimeout(go, 0);
        });
        (async () => {
            for (;;) {
                await idle();
                if (me.stop || P._wvDestroyed || P._wvCbIx !== ix || P._wvRefsIx !== rix || !this._wvCbSecShows(item.id)) {
                    st.stopped = true;
                    try { g.return(undefined as any); } catch (e) {}
                    if (P._wvCbWorksRun === me) P._wvCbWorksRun = null;
                    return;
                }
                const t0 = Date.now();
                let r = g.next();
                while (!r.done && Date.now() - t0 < CB_WORKS_SLICE_MS) r = g.next();
                const d = Date.now() - t0;
                st.slices++;
                st.workMs += d;
                if (d > st.maxSliceMs) st.maxSliceMs = d;
                if (r.done) {
                    this._wvCbWorksKeep(item.id, key, r.value);
                    st.done = true;
                    if (P._wvCbWorksRun === me) P._wvCbWorksRun = null;
                    Zotero.debug("[Weavero] cited by: " + r.value.length + " works citing item " + item.id + " (" + st.citers + " PDFs) in " + st.slices + " slices, " + st.workMs + " ms of work, longest " + st.maxSliceMs + " ms");
                    this._wvCbSecRefreshAll();
                    return;
                }
            }
        })().catch((e: any) => { if (P._wvCbWorksRun === me) P._wvCbWorksRun = null; Zotero.debug("[Weavero] cited by works err: " + e); });
    }

    /** Does a section on screen or in a pane show item `id` (its item-pane section, hidden or not)? */
    _wvCbSecShows(id: number): boolean {
        for (const body of secBodies.keys()) {
            try {
                if (!body.isConnected) continue;
                const el = body.closest && body.closest("item-pane-custom-section");
                if (el && el.item && el.item.id === id) return true;
            } catch (e) {}
        }
        return false;
    }

    /** The section's context: the reader its pane belongs to (a reader tab's
     *  pane), else a stand-in -- { wvLib, itemID, _window, tabID: null } --
     *  the shape refs.ts's menu and opens read. */
    _wvCbSecCtx(body: any, item: any, doc: any): any {
        try {
            const det = body && body.closest ? body.closest("item-details") : null;
            const inLibrary = !!det && (det.tabType === "library" || !!(det.closest && det.closest("#zotero-item-pane")));
            if (!inLibrary) {
                const tabID = det && (det.tabID || (det.dataset && det.dataset.tabId));
                const r = tabID ? Zotero.Reader.getByTabID(tabID) : null;
                if (r) return r;
            }
        } catch (e) {}
        return { wvLib: true, itemID: item ? item.id : 0, _window: doc && doc.defaultView, tabID: null, type: "pdf" };
    }

    _wvCbSecInit({ body, doc, refresh }: any) {
        const P: any = this;
        try {
            P._wvBlEnsureFtl(doc.defaultView);
            wvInjectStyle(doc, SEC_STYLE_ID, SEC_CSS);
            secBodies.set(body, refresh);
            P._wvLfSectionInit(body, doc);
        } catch (e) {}
    }

    _wvCbSecDestroy({ body }: any) {
        try { secBodies.delete(body); } catch (e) {}
        try { (this as any)._wvLfSectionDestroy(body); } catch (e) {}
    }

    _wvCbSecItemChange({ body, doc, item, setEnabled, setL10nArgs }: any) {
        try {
            const ok = !!(item && item.isRegularItem && item.isRegularItem());
            const works = ok ? this._wvCbWorksOf(item) : null;
            setEnabled(!!(works && works.length));
            if (works) this._wvCbSecHeader(body, doc, setL10nArgs, works.length);
            // Not loaded yet: load it; its end shows the section.
            else if (ok && this._wvCbOn()) this._wvCbLoad().then(() => { const lp: any = wvLivePlugin(); if (lp) lp._wvCbSecRefreshAll(); }, () => {});
        } catch (e) { try { setEnabled(false); } catch (e2) {} }
    }

    _wvCbSecRender({ body, item, doc, setL10nArgs }: any) {
        try {
            const works = item ? this._wvCbWorksOf(item) : null;
            if (!works) return;
            this._wvCbSecBuild(body, doc, item, works);
            this._wvCbSecHeader(body, doc, setL10nArgs, works.length);
        } catch (e) { Zotero.debug("[Weavero] cited by section err: " + e); }
    }

    async _wvCbSecAsyncRender({ body, item, doc, setL10nArgs, setEnabled }: any) {
        try {
            if (!item) return;
            const P: any = this;
            if (!P._wvCbIx) {
                // The store not read yet (it is read ahead after startup, refs.ts
                // _wvRefsPreloadSoon): an idle moment first, so an item pane drawn while a
                // PDF opens does not read and parse it in that task (MJT 2026-11-20).
                await new Promise<void>((res) => {
                    try {
                        const w: any = doc && doc.defaultView;
                        if (w && typeof w.requestIdleCallback === "function") { w.requestIdleCallback(() => res(), { timeout: 3000 }); return; }
                    } catch (e) {}
                    wvTimeout(() => res(), 500);
                });
                if (!body.isConnected || P._wvDestroyed) return;
            }
            await this._wvCbLoad();
            await this._wvRefsIndexEnsure();
            if (!body.isConnected) return;
            const works = this._wvCbWorksOf(item);
            if (!works) return;
            try { setEnabled(!!works.length); } catch (e) {}
            this._wvCbSecBuild(body, doc, item, works);
            this._wvCbSecHeader(body, doc, setL10nArgs, works.length);
        } catch (e) { Zotero.debug("[Weavero] cited by section err: " + e); }
    }

    /** "Cited by · 3 in your library". */
    _wvCbSecHeader(body: any, doc: any, setL10nArgs: any, n: number) {
        try { setL10nArgs(JSON.stringify({ state: n ? "counted" : "none", count: n })); } catch (e) {}
        try {
            const sec = body && body.closest && body.closest("collapsible-section");
            if (sec) { if ("empty" in sec) sec.empty = !n; else wvSetBoolAttr(sec, "empty", !n); }
            if (sec && doc && doc.l10n && typeof doc.l10n.translateElements === "function") {
                const p = doc.l10n.translateElements([sec]);
                if (p && typeof p.catch === "function") p.catch(() => {});
            }
        } catch (e) {}
    }

    /** The rows, one per work (_wvCbWorksOf): Zotero's icon and display title of
     *  its best copy (as Related draws an item), the first creator and year after
     *  it, muted, and "also in <library>" for its other copies; the library's
     *  badge on the icon when the best copy is in another library than the item;
     *  the References rows' buttons while the row is under the pointer. A click
     *  opens the paper at its entry for the item; a right-click, the ⋯ menu.
     *  WV_CB_FIRST_ROWS rows, then a "Show N more" row adding WV_CB_PAGE_ROWS at a
     *  time: a work cited by thousands of PDFs draws a page, never all of them
     *  (plan §0's bounds). While a pass runs, a line says how far it is.
     *  The filter line (list-filter.ts, citations M4) filters and sorts the WHOLE
     *  list first; the rows and the pages are then the result's, the header still
     *  counting every work. */
    _wvCbSecBuild(body: any, doc: any, item: any, works: WvCbWork[]) {
        const P: any = this;
        const view: WvLfView = P._wvLfView(body, doc, this._wvCbLfList(item, works));
        const seq: WvCbWork[] = view.rows;
        const draw = this._wvCbSecDraw(body, doc, item);
        draw.words = view.words;
        let state = secShown.get(body);
        if (!state || state.item !== item.id || state.fsig !== view.fsig) { state = { item: item.id, shown: WV_CB_FIRST_ROWS, fsig: view.fsig }; secShown.set(body, state); }
        const upto = Math.min(state.shown, seq.length);
        const sig = this._wvCbSecSig(item, seq, upto, draw) + "|" + works.length + "|" + view.sig;
        let host: any = body.querySelector(":scope > .wv-cb-sec");
        if (!host) host = wvHtmlEl(doc, "div", "wv-cb-sec", undefined, body);
        if (host.getAttribute("data-wv-cb-sig") === sig && host.querySelector(":scope > .wv-cb-list")) { state.works = works; state.vsig = view.sig; return; }
        host.setAttribute("data-wv-cb-sig", sig);
        state.works = works;
        state.vsig = view.sig;
        host.textContent = "";
        const list = wvHtmlEl(doc, "div", "wv-cb-list", undefined, host);
        P._wvLfListKeys(body, list);
        if (view.active && !seq.length && !view.busy) wvHtmlEl(doc, "div", "wv-lf-none", wvStr("weavero-lf-none", { kind: "citedBy" }, null), list);
        for (let i = 0; i < upto; i++) this._wvCbSecRow(list, seq[i], draw);
        this._wvCbSecMore(body, host, list, seq, state, draw);
        const note = wvHtmlEl(doc, "div", "wv-cb-note", undefined, host);
        const st = this._wvCbStatsObj();
        if (draw.busy) note.textContent = wvStr("weavero-citedby-building", { done: st.done, total: st.total }, null);
        else note.hidden = true;
    }

    /** The works as the filter line takes them (list-filter.ts WvLfList): newest
     *  first as wvCbWorks gives them; a row's facet from its best copy (every
     *  work has a PDF: the one that cites the item). */
    _wvCbLfList(item: any, works: WvCbWork[]): WvLfList {
        const P: any = this;
        const sorts: WvLfField[] = ["year"];
        if (P._wvLfCitesOn()) sorts.push("cited");
        sorts.push("title", "author", "added");
        return {
            kind: "citedBy", item: item.id, rows: works, total: works.length, key: works, variant: "",
            fid: (w: WvCbWork, i: number) => i,
            facet: (w: WvCbWork, i: number) => {
                const f: WvLfRow = P._wvLfItemFacet(w.ids[0], i, "", w.year);
                f.pdf = true;
                return f;
            },
            natural: { field: "year", dir: "desc" }, sorts, libChips: false, pdfChip: true, redraw: "_wvCbSecRedraw",
        };
    }

    /** Draw `body`'s Cited by section again (the filter line changed). */
    _wvCbSecRedraw(body: any) {
        try {
            const el = body && body.closest ? body.closest("item-pane-custom-section") : null;
            const item = el && el.item;
            if (!item) return;
            const works = this._wvCbWorksOf(item);
            if (works) this._wvCbSecBuild(body, body.ownerDocument, item, works);
        } catch (e) { Zotero.debug("[Weavero] cited by redraw err: " + e); }
    }

    /** What every row of a section needs: its context, Split's availability,
     *  Zotero's icon module, the pass's progress; the filter's words to mark
     *  (`words`, set by the build). */
    _wvCbSecDraw(body: any, doc: any, item: any): any {
        const P: any = this;
        const ctx = this._wvCbSecCtx(body, item, doc);
        // Split beside the PDF's tab, or from the library's pane beside the library
        // tab (citations.6, MJT 2026-11-21 "OK").
        const split = this._wvRefsCanSplit(ctx);
        const st = this._wvCbStatsObj();
        const busy = !!P._wvCbRunning && st.total > 0 && st.done < st.total;
        let icons: any = null;
        try { const w = doc.defaultView; icons = w && w.require ? w.require("components/icons") : null; } catch (e) {}
        return { doc, item, ctx, split, icons, busy, pct: busy ? Math.floor(100 * st.done / st.total) : -1, words: [] as string[] };
    }

    /** The section's drawn state: the rows shown (each work's copies and PDF), split, progress. */
    _wvCbSecSig(item: any, works: WvCbWork[], upto: number, draw: any): string {
        let sig = item.id + "|" + works.length + "|" + upto + "|" + (draw.split ? "s" : "") + "|" + draw.pct + "|";
        for (let i = 0; i < upto; i++) sig += works[i].ids.join("+") + ":" + works[i].att + ",";
        return sig;
    }

    /** Where `it` was published, as its Cited by row names it: the journal -- or
     *  the book, the proceedings, the website, through Zotero's base-field mapping
     *  of publicationTitle -- else the publisher's base field (a thesis's
     *  university, a preprint's repository, a report's institution). The full
     *  name: the abbreviation field is filled for some papers only. */
    _wvCbPubOf(it: any): string {
        let s = "";
        try { s = String(it.getField("publicationTitle", false, true) || ""); } catch (e) { s = ""; }
        if (!s) { try { s = String(it.getField("publisher", false, true) || ""); } catch (e) { s = ""; } }
        return s.trim();
    }

    /** One work's row in `list`; null when its best copy cannot be loaded. */
    _wvCbSecRow(list: any, w: WvCbWork, draw: any): any {
        const P: any = this;
        const { doc, item, ctx, split, icons } = draw;
        let it: any = null;
        try { it = Zotero.Items.get(w.ids[0]); } catch (e) { it = null; }
        if (!it || it.deleted) return null;
        const row = wvHtmlEl(doc, "div", "wv-cb-row", undefined, list);
        row.setAttribute("data-wv-lf-row", "");
        row.setAttribute("data-wv-cb-item", String(it.id));
        row.setAttribute("data-wv-cb-att", String(w.att));
        row.setAttribute("data-wv-cb-src", w.src);
        if (w.ids.length > 1) row.setAttribute("data-wv-cb-copies", w.ids.slice(1).join(","));
        const ic = wvHtmlEl(doc, "span", "wv-cb-icon", undefined, row);
        try {
            const el = icons && typeof icons.getCSSItemTypeIcon === "function" ? icons.getCSSItemTypeIcon(it.getItemTypeIconName()) : null;
            if (el) ic.appendChild(el);
        } catch (e) {}
        if (it.libraryID !== item.libraryID) {
            try {
                const lib = Zotero.Libraries.get(it.libraryID);
                const kind = lib && lib.libraryType;
                if (kind === "user" || kind === "group") {
                    wvLibBadgeEl(doc, kind, ic).setAttribute("class", "wv-cb-libbadge");
                    ic.setAttribute("data-wv-cb-lib", kind);
                }
            } catch (e) {}
        }
        let title = "";
        try { title = String(it.getDisplayTitle() || ""); } catch (e) {}
        const body = wvHtmlEl(doc, "span", "wv-cb-body", undefined, row);
        const tx = wvHtmlEl(doc, "span", "wv-cb-text", undefined, body);
        tx.appendChild(doc.createTextNode(title || wvStr("weavero-common-untitled")));
        let creator = "", year = "";
        try { creator = String(it.getField("firstCreator") || ""); } catch (e) {}
        try { const m = String(it.getField("date", true, true) || "").match(/\d{4}/); year = m ? m[0] : ""; } catch (e) {}
        const pub = this._wvCbPubOf(it);
        if (creator || pub || year) {
            tx.appendChild(doc.createTextNode(" "));
            const meta = wvHtmlEl(doc, "span", "wv-cb-meta", undefined, tx);
            let first = true;
            for (const [part, cls] of [[creator, ""], [pub, "wv-cb-pub"], [year, ""]]) {
                if (!part) continue;
                if (!first) meta.appendChild(doc.createTextNode(" · "));
                first = false;
                if (cls) wvHtmlEl(doc, "span", cls, part, meta);
                else meta.appendChild(doc.createTextNode(part));
            }
        }
        // The filter's words in the title, the author and the journal (list-filter.ts).
        if (draw.words && draw.words.length) wvLfMarkEl(tx, draw.words);
        // The other copies' libraries, as the References card names a reference's
        // (MJT 2026-11-21, a paper with copies in My Library and a group showed twice):
        // a line of chips under the citation, each with its library's badge.
        if (w.ids.length > 1) {
            const rix: WvRefIndex | null = P._wvRefsIx || null;
            const libs: number[] = [];
            for (const id of w.ids.slice(1)) {
                let lib: number | null = null;
                try { const r = rix ? rix.items.get(id) : null; lib = r ? r.lib : Zotero.Items.get(id).libraryID; } catch (e) { lib = null; }
                if (lib != null && lib !== it.libraryID && libs.indexOf(lib) < 0) libs.push(lib);
            }
            let line: any = null;
            for (const lib of libs) {
                let name = "", kind = "";
                try { name = String(Zotero.Libraries.getName(lib) || ""); const L: any = Zotero.Libraries.get(lib); kind = L ? L.libraryType : ""; } catch (e) {}
                if (!name) continue;
                if (!line) {
                    line = wvHtmlEl(doc, "span", "wv-cb-libs", undefined, body);
                    wvHtmlEl(doc, "span", "wv-cb-libs-label", wvStr("weavero-citedby-also-label"), line);
                }
                const chip = wvHtmlEl(doc, "span", "wv-cb-lib", undefined, line);
                chip.setAttribute("data-wv-cb-lib", String(lib));
                chip.setAttribute("title", wvStr("weavero-citedby-also", { libraries: wvRefsLibNames([lib]) }, null));
                if (kind === "user" || kind === "group") wvLibBadgeEl(doc, kind, chip);
                wvHtmlEl(doc, "span", "wv-cb-lib-name", name, chip);
            }
        }
        row.setAttribute("title", wvStr("weavero-citedby-row", { title }, null));
        const btns = wvHtmlEl(doc, "span", "wv-cb-btns", undefined, row);
        // The References rows' buttons for a reference with a file -- Tab, Window,
        // Split, ⋯ -- in the same order (one set on every surface, MJT 2026-11-20);
        // Show in Library is in the ⋯ menu, as there.
        // Split before Window (MJT 2026-11-20, "Open in split view should be before the open in new window").
        const acts = ["tab"].concat(split ? ["split"] : [], ["window", "more"]);
        for (const a of acts) {
            const b = wvHtmlEl(doc, "span", "wv-refs-btn", undefined, btns);
            b.setAttribute("role", "button");
            b.setAttribute("data-wv-cb-act", a);
            b.setAttribute("title", wvStr("weavero-refs-act-" + a, null, "title"));
            const svg = wvSvgEl(doc, "svg", { viewBox: "0 0 16 16", width: 16, height: 16 }, b);
            for (const [tagName, attrs] of (a === "library" ? wvRefsLibIcon(it.id) : WV_REFS_ICONS[a]) || []) wvSvgEl(doc, tagName, attrs, svg);
        }
        const citedID = item.id, citingID = it.id, attID = w.att, copies = w.ids.slice();
        row.addEventListener("click", (e: any) => {
            try {
                if (e.button !== 0) return;
                const lp: any = wvLivePlugin();
                if (!lp) return;
                const btn = e.target && e.target.closest ? e.target.closest(".wv-refs-btn") : null;
                if (btn) {
                    e.stopPropagation();
                    const p = lp._wvCbAct(ctx, String(btn.getAttribute("data-wv-cb-act")), citingID, attID, btn, copies);
                    if (p && typeof p.catch === "function") p.catch(() => {});
                    return;
                }
                const p = lp._wvCbOpenAt(ctx, attID, citedID);
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (er) {}
        });
        row.addEventListener("contextmenu", (e: any) => {
            try {
                e.preventDefault();
                e.stopPropagation();
                const lp: any = wvLivePlugin();
                // Every copy, best first: the menu's "Also in" entries (refs.ts _wvRefsMenu).
                if (lp) lp._wvRefsMenu(ctx, copies, "none", row, { at: [e.screenX, e.screenY], opens: true });
            } catch (er) {}
        });
        return row;
    }

    /** The "Show N more" row after `list` while works are left to show: N the
     *  next page (WV_CB_PAGE_ROWS, or what is left); removed when none is. */
    _wvCbSecMore(body: any, host: any, list: any, works: WvCbWork[], state: { item: number; shown: number }, draw: any) {
        let more: any = host.querySelector(":scope > .wv-cb-more");
        const left = works.length - state.shown;
        if (left <= 0) { if (more) more.remove(); return; }
        if (!more) {
            more = wvHtmlEl(draw.doc, "div", "wv-cb-more");
            list.after(more);
            more.setAttribute("role", "button");
            more.setAttribute("tabindex", "0");
            const item = draw.item, doc = draw.doc;
            const go = (e: any) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                    const lp: any = wvLivePlugin();
                    if (lp) lp._wvCbSecShowMore(body, doc, item);
                } catch (er) {}
            };
            more.addEventListener("click", (e: any) => { if (e.button === 0) go(e); });
            more.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") go(e); });
        }
        more.textContent = wvStr("weavero-citedby-more", { count: Math.min(WV_CB_PAGE_ROWS, left) }, null);
    }

    /** "Show N more": the next page of rows added to the section of `body` --
     *  from the list its rows were drawn from; when the list changed since (a
     *  pass running moved it), the section is drawn again from the list now,
     *  a page longer: a page of the new list after rows of the old one doubled
     *  rows and left others out (review of M1, 2026-11-21). The same for the
     *  filter line's answer over the list (its own result moved: `vsig`). */
    _wvCbSecShowMore(body: any, doc: any, item: any) {
        const P: any = this;
        try {
            const host: any = body && body.querySelector(":scope > .wv-cb-sec");
            const list: any = host && host.querySelector(":scope > .wv-cb-list");
            const state = secShown.get(body);
            const works = this._wvCbWorksOf(item);
            if (!list || !works || !state || state.item !== item.id) return;
            const view: WvLfView = P._wvLfView(body, doc, this._wvCbLfList(item, works));
            if (state.works !== works || state.vsig !== view.sig || state.fsig !== view.fsig) {
                state.shown += WV_CB_PAGE_ROWS;
                host.removeAttribute("data-wv-cb-sig");
                this._wvCbSecBuild(body, doc, item, works);
                return;
            }
            const seq: WvCbWork[] = view.rows;
            const draw = this._wvCbSecDraw(body, doc, item);
            draw.words = view.words;
            const from = state.shown, to = Math.min(seq.length, from + WV_CB_PAGE_ROWS);
            for (let i = from; i < to; i++) this._wvCbSecRow(list, seq[i], draw);
            state.shown = from + WV_CB_PAGE_ROWS;
            host.setAttribute("data-wv-cb-sig", this._wvCbSecSig(item, seq, Math.min(state.shown, seq.length), draw) + "|" + works.length + "|" + view.sig);
            this._wvCbSecMore(body, host, list, seq, state, draw);
        } catch (e) { Zotero.debug("[Weavero] cited by show more err: " + e); }
    }

    /** A row's button on the citing paper (`citingID`, its PDF `attID`; `copies`:
     *  every copy of the work, best first, for the ⋯ menu's "Also in"). */
    async _wvCbAct(ctx: any, act: string, citingID: number, attID: number, btn?: any, copies?: number[]): Promise<boolean> {
        const P: any = this;
        let it: any = null, att: any = null;
        try { it = Zotero.Items.get(citingID); att = Zotero.Items.get(attID); } catch (e) {}
        if (!it) return false;
        const win = this._wvRefsHostWin(ctx);
        if (act === "more") { this._wvRefsMenu(ctx, copies && copies.length ? copies : [citingID], "none", btn); return true; }
        if (act === "library") return this._wvRefsShowInLibrary(it, win);
        const target = att || it;
        if (act === "tab") return this._wvRefsOpenTab(target, win);
        if (act === "window") {
            const spec = await P._wvOpenSpecOf(target);
            if (!spec || spec.kind !== "reader") return this._wvRefsShowInLibrary(it, win);
            return !!(await P._wvOpenSpecWhere(win, spec, "window"));
        }
        if (act === "split") {
            if (!this._wvRefsCanSplit(ctx)) return false;
            // From the library's pane: beside the library tab of the pane's own
            // window (the row's), as Ctrl+Enter in the items list (refs.ts _wvRefsSplit).
            let w = ctx._window;
            if (ctx.wvLib && btn && btn.nodeType) { const bw = winOf(btn); if (bw && bw.Zotero_Tabs) w = bw; }
            const src = ctx.wvLib ? this._wvRefsLibTabOf(w, btn) : ctx.tabID;
            if (await P._wvOpenTarget(w, { item: target }, "beside", src)) return true;
            return this._wvRefsOpenTab(target, w);
        }
        return false;
    }

    /** The citing PDF `attID` open in a tab, at its entry for item `citedID`
     *  (the References section's landing: the entry a quarter down, marked).
     *  The entry is found in the reader's own list (refs.ts _wvRefsPrepare;
     *  Zotero builds the structure data at the reader's start): the first
     *  entry whose match names the item. Without one (a list the reader cannot
     *  read), the PDF is open and that is all. */
    async _wvCbOpenAt(ctx: any, attID: number, citedID: number): Promise<boolean> {
        const P: any = this;
        try {
            const att = Zotero.Items.get(attID);
            if (!att) return false;
            const win = this._wvRefsHostWin(ctx);
            const spec = await P._wvOpenSpecOf(att);
            if (!spec || spec.kind !== "reader") return false;
            const tab = await P._wvOpenTabFor(win, spec, null);
            if (!tab) return false;
            win.Zotero_Tabs.select(tab.id);
            let reader: any = null;
            const end = Date.now() + 20000;
            while (Date.now() < end && !P._wvDestroyed) {
                reader = Zotero.Reader.getByTabID(tab.id);
                const v = reader ? this._wvRefsViewOf(reader) : null;
                try { if (v && v._iframeWindow.PDFViewerApplication.pdfViewer._pages.length) break; } catch (e) {}
                await wvSleep(150);
            }
            if (!reader || P._wvDestroyed) return !!reader;
            await this._wvRefsPrepare(reader);
            const entry = this._wvCbEntryFor(reader, citedID);
            if (!entry) return true;
            this._wvRefsShowEntry(reader, entry);
            // A reader just opened puts back its last view once its pages are
            // there, and on Zotero 10.0.8 that came after the landing: the PDF
            // stayed at its top (cited-by.spec.js, 2026-11-20). Landed again,
            // once, when the entry is not in view a moment later.
            await wvSleep(800);
            if (!P._wvDestroyed && !this._wvCbEntryInView(reader)) this._wvRefsShowEntry(reader, entry);
            return true;
        } catch (e) { Zotero.debug("[Weavero] cited by open err: " + e); return false; }
    }

    /** Is the entry mark of _wvRefsShowEntry in `reader`'s view (its first box
     *  inside the view's scroll container)? False without a mark. */
    _wvCbEntryInView(reader: any): boolean {
        try {
            const v = this._wvRefsViewOf(reader);
            const doc = v && v._iframeWindow && v._iframeWindow.document;
            const b = doc && doc.querySelector(".wv-refs-entryhl-box");
            const cont = doc && doc.getElementById("viewerContainer");
            if (!b || !cont) return false;
            const r = b.getBoundingClientRect(), c = cont.getBoundingClientRect();
            return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
        } catch (e) { return false; }
    }

    /** The entry of `reader`'s list that names item `citedID` (any copy), or null. */
    _wvCbEntryFor(reader: any, citedID: number): any {
        const P: any = this;
        try {
            const rix: WvRefIndex | null = P._wvRefsIx;
            const entries: any[] = (P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(reader.itemID)) || [];
            if (!rix || !entries.length) return null;
            const self = this._wvRefsSelf(rix, reader);
            let citingLib: number | null = null;
            try { const a = Zotero.Items.get(reader.itemID); citingLib = a ? a.libraryID : null; } catch (e) {}
            for (const e of entries) {
                const h = this._wvRefsMatchText(rix, e.text, self, citingLib);
                if (h && h.ids.indexOf(citedID) >= 0 && e.rects && e.rects.length) return e;
            }
        } catch (e) {}
        return null;
    }

    /** Draw every shown section again (the index moved). */
    _wvCbSecRefreshAll() {
        for (const [body, refresh] of Array.from(secBodies.entries())) {
            try {
                if (!body.isConnected) { secBodies.delete(body); continue; }
                const el = body.closest && body.closest("item-pane-custom-section");
                // Shown or hidden here first: Zotero renders a hidden section
                // never (refs.ts _wvRefsSecRefreshFor).
                if (el && el.item) {
                    const works = el.item.isRegularItem && el.item.isRegularItem() ? this._wvCbWorksOf(el.item) : null;
                    const show = !!(works && works.length);
                    if (el.hidden === show) el.hidden = !show;
                }
                const p = refresh();
                if (p && typeof p.catch === "function") p.catch(() => {});
            } catch (e) {}
        }
    }

    // ---- start, settings, destroy --------------------------------------------------

    _wvCbApplySectionPref() {
        const P: any = this;
        if (CB_SECTION.enabled(P)) P._wvBlRegisterSectionFor(CB_SECTION);
        else P._wvBlUnregisterSectionFor(CB_SECTION);
    }

    /** init(): the section, the settings' watch, the first pass a little later. */
    _wvCbInit() {
        try { this._wvCbApplySectionPref(); } catch (e) { Zotero.debug("[Weavero] cited by section init err: " + e); }
        this._wvCbWirePrefWatch();
        if (this._wvCbOn()) {
            this._wvCbWireNotifier();
            this._wvCbSchedule(START_DELAY_MS, "start");
        }
    }

    _wvCbWirePrefWatch() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvCbPrefObs) {
                if (g._wvCbPrefObsVer === tag) return;
                for (const s of g._wvCbPrefObs) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
                delete g._wvCbPrefObs;
            }
            g._wvCbPrefObsVer = tag;
            g._wvCbPrefObs = CB_PREFS.map((k) => Zotero.Prefs.registerObserver("weavero." + k, () => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag) return;
                    lp._wvCbApplyPrefs();
                } catch (e) {}
            }));
        } catch (e) { Zotero.debug("[Weavero] cited by pref watch err: " + e); }
    }

    _wvCbApplyPrefs() {
        const P: any = this;
        wvClearTimeout(P._wvCbPrefT);
        P._wvCbPrefT = wvTimeout(() => {
            P._wvCbPrefT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            try { this._wvCbApplySectionPref(); } catch (e) {}
            if (this._wvCbOn()) { this._wvCbWireNotifier(); this._wvCbSchedule(5000, "setting on"); }
            else this._wvCbStop();
        }, 50);
    }

    /** Stop the background work (the setting went off; destroy()). */
    _wvCbStop() {
        const P: any = this;
        wvClearTimeout(P._wvCbPassT); P._wvCbPassT = null;
        wvClearTimeout(P._wvCbNewT); P._wvCbNewT = null;
        wvClearTimeout(P._wvCbLibT); P._wvCbLibT = null;
        wvClearTimeout(P._wvCbTgtT); P._wvCbTgtT = null;
        // Every pacing wait (one handle per wait, _wvCbPace): the pass waiting
        // goes on at once and stops at its next check (the setting, the
        // instance): a wait that never ends would leave it "running" for good,
        // and no pass would start again.
        this._wvCbWakeAll();
        this._wvCbUnwireNotifier();
    }

    /** destroy(): the section, the observers, the timers, the index in memory.
     *  Shards changed since the last write are written now (the next session
     *  would read those PDFs again otherwise). */
    _wvCbDestroy() {
        const P: any = this;
        try { P._wvBlUnregisterSectionFor(CB_SECTION); } catch (e) {}
        this._wvCbStop();
        wvClearTimeout(P._wvCbPrefT); P._wvCbPrefT = null;
        try { if (P._wvCbIx && P._wvCbDirtySet && P._wvCbDirtySet.size) this._wvCbFlush().catch(() => {}); } catch (e) {}
        wvClearTimeout(P._wvCbFlushT); P._wvCbFlushT = null;
        secBodies.clear();
        try {
            const en = Services.wm.getEnumerator(null);
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                try { wvRemoveStyle(w.document, SEC_STYLE_ID); } catch (e) {}
            }
        } catch (e) {}
        P._wvCbIx = null; P._wvCbLoading = null; P._wvCbSigs = null; P._wvCbDirtySet = null;
        P._wvCbNewPdfs = null; P._wvCbRunning = false; P._wvCbSdtMod = undefined;
        P._wvCbChanged = null; P._wvCbFullAt = 0; P._wvCbWorksCache = null;
        if (P._wvCbWorksRun) { P._wvCbWorksRun.stop = true; P._wvCbWorksRun = null; }
    }
}

const _cbDescriptors = Object.getOwnPropertyDescriptors(_CitedByMixin.prototype);
delete (_cbDescriptors as any).constructor;
export const citedByMethods = _cbDescriptors;
