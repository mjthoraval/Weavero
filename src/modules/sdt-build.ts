// Module: "Build Zotero's structure data for all PDFs" (branch citations, plan
// work/citations-plan-2026-11-21.md M5; MJT 2026-11-21 night: "let Zotero build the
// full index, same as if all PDF files where opened in Zotero, so that the
// references and citing papers data gets improved. The option should be off by
// default, and get a proper warning when activated regarding the costs.").
//
// Zotero builds a PDF's structure data (`.zotero-sdt-cache` beside the PDF) when its
// reader opens it; References (refs.ts) and Cited by (cited-by.ts) read it. This
// option has Zotero build it for every PDF, through Zotero's own
// `Zotero.SDT.ensure(itemID)` ("for warming up the cache (e.g., at import time)",
// sdt.js), which runs in Zotero's document worker, off the main thread.
//
// - A Settings option under References, OFF by default, shown only where the API is
//   (a feature test of Zotero.SDT.ensure: Zotero 11, and Zotero 10.0.8, whose sdt.js
//   is the same file -- the M5 log). Turning it on first shows what it costs for
//   THIS library, counted live (lib/sdt-build.ts's measured model): Build / Cancel.
// - The run: one PDF at a time, most recently added first, a short gap between two;
//   it waits while a reader opens a PDF, while Zotero's PDF worker has other work
//   (its queue, read only), and for a while after a memory-pressure notice; it
//   stops at quit, at Pause and when the option goes off; after a restart it starts
//   again from what is missing (a cache is looked for, never trusted from memory).
// - The user's current use first (MJT 2026-11-22: "The current use of the user
//   should always have priority."). Zotero runs every PDF-worker job on ONE Web
//   Worker, one job at a time; a priority request (a reader's) goes to the front of
//   the queue but never interrupts the job running, and there is no cancel
//   (pdfWorker/manager.js _processQueue / _enqueue). So each PDF is built in
//   Weavero's OWN instance of Zotero's worker class -- a second Web Worker -- and its
//   pack written where sdt.js writes it; a reader's request never queues behind it.
//   Zotero.SDT.ensure (on Zotero's worker) only where a piece is missing. A PDF
//   starts only once the user has been away from the computer for a minute
//   (nsIUserIdleService, as Zotero's own full-text content processor waits,
//   fulltext.js); the one in hand finishes. The own worker is terminated when the
//   run pauses, stops, ends, waits more than 2 minutes or for memory, at quit and
//   in destroy().
// - A PDF Zotero could not build (a password, an unreadable file): kept in
//   <data dir>/weavero/sdt-build.json with its file's stamp, not tried again at
//   every start -- only once the file changes.
// - Each PDF built: References looks at it again (refs.ts _wvRefsLibRecheck), and
//   Cited by reads it again (its stamp changed: cited-by.ts _wvCbPass, the PDFs
//   built handed over in batches).
// - Steps aside while Zotero builds them itself (zotero#6012's Zotero.SDT.AutoIndex,
//   feature-tested).
// - Writes nothing to any library: the caches are Zotero's own files (Zotero's file
//   sync skips `.zotero*` files), the memo is Weavero's store.
//
// Kept apart from refs.ts / cited-by.ts (another branch reworks how Weavero READS
// structure data for zotero#6012): only _wvRefsLibRecheck, _wvCbPass, _wvCbOn,
// _wvCbDir and _wvCbPdfPath are called from here -- and, for Remove Built Data,
// _wvCbReset, _wvCbSchedule, _wvCbWireNotifier, _wvCbSecRefreshAll and
// _wvRefsDropCaches. The document layer (doc-layer.ts): _wvDlAfterBuild after each
// PDF built (its layer straight after its pack), _wvDlReset for Remove Built Data.
//
// REMOVE BUILT DATA (MJT 2026-11-24: "If Weavero builds so much data, the user should
// have a way to clean it, as the data can be rebuilt again without loosing anything";
// intake: ALL rebuildable data -- Zotero's structure data and Weavero's caches built
// from the library -- in Settings beside the build option, and cleaning turns the
// build off). Settings shows what it takes, measured when the pane opens
// (`_wvSbCleanMeasure`), and Remove Built Data… asks, then removes
// (`_wvSbCleanRun`): the pack beside every attachment (but in the groups of the
// hidden skip list) and the stores SB_CLEAN_STORES names, each a "cache" of
// lib/backup.ts's table -- never a store of the user's.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvLivePlugin } from "../lib/live";
import { wvTimeout, wvClearTimeout, wvSleep } from "../lib/timers";
import { wvStr } from "../lib/l10n";
import { wvStoreRead, wvStoreWrite, wvStorePath, wvStoreDir, wvStoreChain, wvStoreSettled, wvStoreGate } from "../lib/store";
import { wvBkClassify, wvBkSkipDir } from "../lib/backup";
import { WV_DL_DIR } from "./doc-layer";
import {
    WvSbCand, WvSbEstimate, wvSbQueue, wvSbMemoKey, wvSbMemoPrune, wvSbEstimate, wvSbEta, wvSbPages,
    wvSbDurationRange, wvSbBytesRange,
} from "../lib/sdt-build";

declare const Zotero: any;
declare const Services: any;

/** The option: default OFF (prefs-table.ts); set only once the user confirmed
 *  the warning (Settings has no native binding for it). */
export const WV_SB_PREF = "referencesBuildStructure";
/** Pause / Resume in Settings (kept across restarts). */
export const WV_SB_PAUSE_PREF = "referencesBuildStructurePaused";
/** Hidden: group ids (comma separated) whose PDFs the run leaves alone. */
export const WV_SB_SKIP_PREF = "referencesBuildStructureSkipGroups";
const SB_FILE = "sdt-build.json";
const SB_V = 1;
/** The first run this long after Zotero's start (after Cited by's first pass, 30 s). */
const SB_START_DELAY_MS = 120000;
/** The option turned on (or resumed): the run starts this long after. */
const SB_ON_DELAY_MS = 3000;
/** A run done: the next looks for PDFs added since, this long after. */
const SB_AGAIN_MS = 6 * 3600000;
const SB_STAT_BATCH = 64;
/** The PDFs built are handed to Cited by at most this often (and at the run's end). */
const SB_CB_EVERY_MS = 60000;
const SB_MEMO_FLUSH_MS = 5000;
/** A count made for the warning is the run's own when this fresh. */
const SB_COUNT_FRESH_MS = 120000;
/** The pacing (the suite shortens it: `_wvSbTuneO`). `idle`: a PDF starts only
 *  once the user has been away this long; `keep`: a wait this long ends Weavero's
 *  own worker (a new one for the next PDF). */
const SB_TUNE = { gap: 500, poll: 2000, readerQuiet: 15000, pressure: 300000, idle: 60000, keep: 120000 };
/** sdt.js's file name (SDT_CACHE_FILE_NAME) and Weavero's own temporary name beside
 *  it (sdt.js writes through `<cache>.tmp`: two writers never share one; `.zotero*`
 *  files are skipped by Zotero's file sync). */
const SB_CACHE = ".zotero-sdt-cache";
const SB_TMP = ".wv.tmp";

/** Remove Built Data: Weavero's stores it removes under <data dir>/weavero/ -- its
 *  caches BUILT from the library alone, each "cache" in lib/backup.ts's table, which
 *  every use checks (`_wvSbCleanStores`): a store named here that the table one day
 *  calls anything else is left alone. Not people-cache/ (downloaded: a rebuild needs
 *  the network), win-icons/ nor feeds/scores.json ("cache" too, not built from the
 *  library's documents). The document layer's folder (doc-layer.ts) is one: built
 *  from the packs alone, and orphaned by their removal anyway (its stamps). */
const SB_CLEAN_STORES: ReadonlyArray<{ rel: string; dir: boolean }> = [{ rel: "cited-by", dir: true }, { rel: SB_FILE, dir: false }, { rel: WV_DL_DIR, dir: true }];
/** Files looked at or removed between two yields to the main thread. */
const SB_CLEAN_BATCH = 64;
/** A measure this fresh is the answer (Settings opened again: no new walk of every
 *  storage folder). */
const SB_MEASURE_FRESH_MS = 10000;
/** The cleaning waits this long, at most, for the build's PDF in hand to end. */
const SB_CLEAN_WAIT_RUN_MS = 30000;
/** Cited by starts its index again this long after a cleaning (when on). */
const SB_CLEAN_CB_DELAY_MS = 30000;
/** A cleaning's report stays in Settings this long. */
const SB_CLEAN_REPORT_MS = 10 * 60000;

/** What the built data takes (Settings' line, the confirmation's figures). `index`:
 *  the Cited by folder has files. */
interface WvSbMeasure { packs: number; packBytes: number; storeFiles: number; storeBytes: number; bytes: number; index: boolean; at: number }
/** What a cleaning removed; `failed`: files it could not remove. */
interface WvSbCleanReport { packs: number; packBytes: number; storeFiles: number; storeBytes: number; bytes: number; failed: number; at: number }
/** Where an attachment's pack may be. */
interface WvSbPack { id: number; lib: number; key: string; path: string }

/** A PDF's build: true built (or there already), false Zotero's worker could not
 *  read it (the failure memo), "cancelled" left for later (Weavero's worker ended
 *  with it in hand), "error" built but not written (tried again at the next run). */
type WvSbOutcome = boolean | "cancelled" | "error";
/** The settings the run follows, its masters included. */
const SB_PREFS = [WV_SB_PREF, WV_SB_PAUSE_PREF, "enableReferences", "enableRelations", "enableLinksAndRelations"];

/** What the run is doing, for Settings and the suite. */
interface WvSbSt {
    state: "idle" | "scanning" | "running" | "waiting" | "done" | "stopped";
    wait: "" | "reader" | "busy" | "memory" | "active";
    scanned: number; total: number; have: number; queue: number;
    done: number; built: number; failed: number; skipped: number;
    msBuilt: number; pagesBuilt: number; pdfsLeft: number; pagesLeft: number;
    current: number; runs: number; lastRunMs: number;
}

interface WvSbCount { at: number; cands: WvSbCand[]; queue: WvSbCand[]; est: WvSbEstimate }

class _SdtBuildMixin {
    [k: string]: any;

    /** Zotero's structure-data API, when this Zotero has what the run needs. */
    _wvSbApi(): any {
        try {
            const S = (Zotero as any).SDT;
            if (!S || typeof S.ensure !== "function") return null;
            if (!Zotero.Attachments || typeof Zotero.Attachments.getStorageDirectoryByLibraryAndKey !== "function") return null;
            return S;
        } catch (e) { return null; }
    }

    /** Zotero builds every PDF's structure data itself (zotero#6012's AutoIndex, on). */
    _wvSbZoteroBuilds(): boolean {
        try {
            const A = (Zotero as any).SDT && (Zotero as any).SDT.AutoIndex;
            return !!(A && typeof A.isEnabled === "function" && A.isEnabled());
        } catch (e) { return false; }
    }

    _wvSbPrefOn(): boolean {
        try { return Zotero.Prefs.get("weavero." + WV_SB_PREF) === true; } catch (e) { return false; }
    }

    _wvSbPaused(): boolean {
        try { return Zotero.Prefs.get("weavero." + WV_SB_PAUSE_PREF) === true; } catch (e) { return false; }
    }

    /** The option is on and can run here. */
    _wvSbOn(): boolean {
        try { return this._wvSbPrefOn() && !!this._wvRefsOn() && !!this._wvSbApi() && !this._wvSbZoteroBuilds(); } catch (e) { return false; }
    }

    _wvSbSt(): WvSbSt {
        const P: any = this;
        return P._wvSbStO || (P._wvSbStO = { state: "idle", wait: "", scanned: 0, total: 0, have: 0, queue: 0, done: 0, built: 0, failed: 0, skipped: 0,
            msBuilt: 0, pagesBuilt: 0, pdfsLeft: 0, pagesLeft: 0, current: 0, runs: 0, lastRunMs: 0 });
    }

    _wvSbTune(): typeof SB_TUNE {
        return Object.assign({}, SB_TUNE, (this as any)._wvSbTuneO || {});
    }

    /** The libraries of the groups the hidden pref names. */
    _wvSbSkipLibs(): Set<number> {
        const out = new Set<number>();
        try {
            const v = String(Zotero.Prefs.get("weavero." + WV_SB_SKIP_PREF) || "");
            for (const s of v.split(/[\s,;]+/)) {
                const g = parseInt(s, 10);
                if (!(g > 0)) continue;
                const lib = Zotero.Groups.getLibraryIDFromGroupID(g);
                if (lib) out.add(lib);
            }
        } catch (e) {}
        return out;
    }

    // ---- what there is to build ---------------------------------------------------

    /** Every PDF attachment of the user's libraries (groups included), out of the
     *  trash, with its file's bytes and stamp, its pages as Zotero counted them,
     *  and whether its structure cache is there; null when stopped meanwhile.
     *  `onProgress(done, total)` while the files are looked at. */
    async _wvSbList(onProgress?: (done: number, total: number) => void): Promise<WvSbCand[] | null> {
        const P: any = this;
        const rows: any[] = [];
        await Zotero.DB.queryAsync(
            "SELECT a.itemID, i.libraryID, i.key, a.linkMode, a.path, i.dateAdded, (SELECT f.totalPages FROM fulltextItems f WHERE f.itemID = a.itemID)"
            + " FROM itemAttachments a JOIN items i ON i.itemID = a.itemID"
            + " WHERE a.contentType = ? AND a.linkMode != ?"
            + " AND i.libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))"
            + " AND i.itemID NOT IN (SELECT itemID FROM deletedItems)"
            + " AND (a.parentItemID IS NULL OR a.parentItemID NOT IN (SELECT itemID FROM deletedItems))",
            ["application/pdf", Zotero.Attachments.LINK_MODE_LINKED_URL],
            { onRow: (row: any) => {
                rows.push({
                    id: row.getResultByIndex(0), lib: row.getResultByIndex(1), key: String(row.getResultByIndex(2)),
                    linkMode: row.getResultByIndex(3), path: String(row.getResultByIndex(4) || ""),
                    added: String(row.getResultByIndex(5) || ""), pages: Number(row.getResultByIndex(6)) || 0,
                });
            } });
        const stat = async (p: string) => { try { return p ? await IOUtils.stat(p) : null; } catch (e) { return null; } };
        const out: WvSbCand[] = [];
        if (onProgress) onProgress(0, rows.length);
        for (let i = 0; i < rows.length; i += SB_STAT_BATCH) {
            if (P._wvDestroyed) return null;
            const batch = rows.slice(i, i + SB_STAT_BATCH);
            const got = await Promise.all(batch.map(async (r) => {
                const dir = this._wvCbDir(r);
                const [cs, ps] = await Promise.all([stat(PathUtils.join(dir, ".zotero-sdt-cache")), stat(this._wvCbPdfPath(r))]);
                const c: WvSbCand = { id: r.id, lib: r.lib, key: r.key, added: r.added, pages: r.pages,
                    bytes: ps ? ps.size : 0, has: !!cs, stamp: ps ? ps.size + ":" + ps.lastModified : "" };
                return c;
            }));
            for (const c of got) out.push(c);
            if (onProgress) onProgress(Math.min(i + SB_STAT_BATCH, rows.length), rows.length);
        }
        return out;
    }

    /** The PDFs to build and what they cost (the warning's figures). */
    async _wvSbCount(onProgress?: (done: number, total: number) => void): Promise<WvSbCount | null> {
        const cands = await this._wvSbList(onProgress);
        if (!cands) return null;
        const memo = await this._wvSbMemoLoad();
        const queue = wvSbQueue(cands, memo.failed, this._wvSbSkipLibs());
        return { at: Date.now(), cands, queue, est: wvSbEstimate(queue) };
    }

    // ---- the warning ------------------------------------------------------------------

    /** A duration's words (one value, or a range in one unit). */
    _wvSbDurText(lo: number, hi: number): string {
        const r = wvSbDurationRange(lo, hi);
        if (r.lo >= r.hi) return wvStr("weavero-sdt-build-dur-one", { n: r.hi, unit: r.unit });
        return wvStr("weavero-sdt-build-dur", { lo: r.lo, hi: r.hi, unit: r.unit });
    }

    _wvSbSizeText(lo: number, hi: number): string {
        const r = wvSbBytesRange(lo, hi);
        if (r.lo >= r.hi) return wvStr("weavero-sdt-build-size-one", { n: r.hi, unit: r.unit });
        return wvStr("weavero-sdt-build-size", { lo: r.lo, hi: r.hi, unit: r.unit });
    }

    /** The warning's title, text and button, from the costs `est`. */
    _wvSbWarningText(est: WvSbEstimate): { title: string; body: string; ok: string } {
        const time = this._wvSbDurText(est.secLo, est.secHi);
        const disk = this._wvSbSizeText(est.diskLo, est.diskHi);
        const body = [
            wvStr("weavero-sdt-build-warn-intro", { count: est.pdfs }),
            "• " + wvStr("weavero-sdt-build-warn-time", { time }),
            "• " + wvStr("weavero-sdt-build-warn-disk", { disk }),
            "• " + wvStr("weavero-sdt-build-warn-sync"),
            "• " + wvStr("weavero-sdt-build-warn-cache"),
        ].join("\n\n");
        return { title: wvStr("weavero-sdt-build-warn-title"), body, ok: wvStr("weavero-sdt-build-warn-ok") };
    }

    /** The warning itself: Zotero's own confirm dialog, Cancel the default. */
    async _wvSbPrompt(win: any, text: { title: string; body: string; ok: string }): Promise<boolean> {
        const ps = Services.prompt;
        const flags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL + ps.BUTTON_POS_1_DEFAULT;
        return ps.confirmEx(win || null, text.title, text.body, flags, text.ok, null, null, null, {}) === 0;
    }

    /** Settings' checkbox turned on: count this library, show the costs, and turn
     *  the option on only on Build. True when it went on. */
    async _wvSbAskOn(win: any): Promise<boolean> {
        const P: any = this;
        if (P._wvSbAsking || !this._wvSbApi() || this._wvSbZoteroBuilds()) return false;
        P._wvSbAsking = true;
        try {
            P._wvSbCounting = { done: 0, total: 0 };
            const c = await this._wvSbCount((done, total) => { P._wvSbCounting = { done, total }; });
            P._wvSbCounting = null;
            if (!c || P._wvDestroyed) return false;
            const ok = await this._wvSbPrompt(win, this._wvSbWarningText(c.est));
            if (!ok || P._wvDestroyed) return false;
            P._wvSbLastCount = c;
            Zotero.Prefs.set("weavero." + WV_SB_PAUSE_PREF, false);
            Zotero.Prefs.set("weavero." + WV_SB_PREF, true);
            return true;
        }
        finally { P._wvSbAsking = false; P._wvSbCounting = null; }
    }

    // ---- the run ----------------------------------------------------------------------

    /** Whether the run may go on now. */
    _wvSbCanGo(): boolean {
        const P: any = this;
        return !P._wvDestroyed && !P._wvSbQuit && wvLivePlugin() === P && this._wvSbOn() && !this._wvSbPaused();
    }

    _wvSbSchedule(ms: number, why: string) {
        const P: any = this;
        wvClearTimeout(P._wvSbT);
        P._wvSbT = wvTimeout(() => {
            P._wvSbT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            lp._wvSbRun(why).catch((e: any) => Zotero.debug("[Weavero] structure data: run err: " + e));
        }, ms);
    }

    /** Sleep `ms`, woken early by a stop (the option off, Pause, quit, destroy()). */
    _wvSbSleep(ms: number): Promise<void> {
        const P: any = this;
        const wake: Set<() => void> = P._wvSbWake || (P._wvSbWake = new Set());
        return new Promise<void>((res) => {
            let t: any = null;
            const w = () => { wvClearTimeout(t); wake.delete(w); res(); };
            t = wvTimeout(w, ms);
            wake.add(w);
        });
    }

    _wvSbWakeAll() {
        const P: any = this;
        const wake: Set<() => void> | undefined = P._wvSbWake;
        if (!wake) return;
        for (const w of Array.from(wake)) { try { w(); } catch (e) {} }
    }

    /** The readers Zotero has (read only). */
    _wvSbReaders(): any[] {
        try { const a = Zotero.Reader && Zotero.Reader._readers; return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }

    /** Zotero's PDF worker has other work queued or running (read only; false
     *  where its fields are not there). */
    _wvSbWorkerBusy(): boolean {
        try {
            const W = Zotero.PDFWorker;
            return !!(W && Array.isArray(W._queue) && (W._queue.length > 0 || W._processingQueue === true));
        } catch (e) { return false; }
    }

    /** Milliseconds since the user last used the computer -- keyboard or mouse,
     *  anywhere, not only in Zotero: Gecko's nsIUserIdleService (on Windows
     *  GetLastInputInfo; the least of that and Gecko's own last input,
     *  widget/nsUserIdleService.cpp), the service Zotero's own full-text content
     *  processor waits on (fulltext.js). Infinity where it cannot be told. */
    _wvSbIdleMs(): number {
        try {
            const svc: any = Components.classes["@mozilla.org/widget/useridleservice;1"].getService(Components.interfaces.nsIUserIdleService);
            const v = Number(svc.idleTime);
            return Number.isFinite(v) && v >= 0 ? v : Infinity;
        } catch (e) { return Infinity; }
    }

    /** Why the run waits now ("" = it may build the next PDF). */
    _wvSbWaitWhy(tune: typeof SB_TUNE): "" | "reader" | "busy" | "memory" | "active" {
        const P: any = this;
        const now = Date.now();
        if (P._wvSbPressureAt && now - P._wvSbPressureAt < tune.pressure) return "memory";
        const seen: WeakMap<any, number> = P._wvSbSeen || (P._wvSbSeen = new WeakMap());
        let opening = false;
        for (const r of this._wvSbReaders()) {
            if (!r || typeof r !== "object") continue;
            let t = seen.get(r);
            if (t === undefined) { t = now; seen.set(r, t); }
            if (now - t < tune.readerQuiet) opening = true;
        }
        if (opening) return "reader";
        // Zotero generating anything (a reader's structure data, its indexing): no
        // start meanwhile -- so Weavero never starts a PDF Zotero is generating
        // (sdt.js's own per-item generation map is private; its jobs are in this queue).
        if (this._wvSbWorkerBusy()) return "busy";
        if (tune.idle > 0 && this._wvSbIdleMs() < tune.idle) return "active";
        return "";
    }

    /** Wait for the next PDF's turn; false when the run must stop. A wait of more
     *  than `keep`, or any wait for memory, ends Weavero's own worker (a new one
     *  for the next PDF). */
    async _wvSbTurn(): Promise<boolean> {
        const P: any = this;
        const st = this._wvSbSt();
        const tune = this._wvSbTune();
        let since = 0;
        for (;;) {
            if (!this._wvSbCanGo()) return false;
            const why = this._wvSbWaitWhy(tune);
            if (!why) { st.wait = ""; st.state = "running"; return true; }
            if (st.wait !== why) Zotero.debug("[Weavero] structure data: waiting (" + why + ")");
            st.wait = why;
            st.state = "waiting";
            const now = Date.now();
            if (!since) since = now;
            // Memory low: Weavero's worker (hundreds of MB after a long PDF: the log's
            // "M5 priority") is not kept even that long.
            if (P._wvSbW && (why === "memory" || now - since >= tune.keep)) this._wvSbWorkerEnd(why === "memory" ? "memory pressure" : "waited " + Math.round((now - since) / 1000) + " s");
            await this._wvSbSleep(tune.poll);
        }
    }

    /** One PDF's structure data: built in Weavero's own worker (`_wvSbOwnBuild`),
     *  else -- a piece of it missing in this Zotero -- by Zotero.SDT.ensure on
     *  Zotero's shared worker (not a priority request: a reader's own goes first,
     *  after the job running). */
    async _wvSbEnsure(id: number): Promise<WvSbOutcome> {
        const own = await this._wvSbOwnBuild(id);
        if (own !== null) return own;
        const S = this._wvSbApi();
        return S ? !!(await S.ensure(id)) : false;
    }

    // ---- Weavero's own PDF worker -----------------------------------------------------------

    /** Zotero's PDF worker class (pdfWorker/manager.js `class PDFWorker`, whose one
     *  instance is Zotero.PDFWorker) when it has what a second instance needs; null
     *  elsewhere (feature test, never a version test). */
    _wvSbWorkerClass(W: any = (Zotero as any).PDFWorker): any {
        try {
            if (!W || typeof W !== "object") return null;
            const p0 = Object.getPrototypeOf(W);
            const C = p0 && p0.constructor;
            if (typeof C !== "function" || C === Object || !(W instanceof C)) return null;
            for (const m of ["getStructuredDocumentText", "_init", "_enqueue", "_processQueue", "_query"]) if (typeof C.prototype[m] !== "function") return null;
            return C;
        } catch (e) { return null; }
    }

    /** What writing a pack where sdt.js keeps it needs (sdt.js _getCachePath:
     *  the attachment's storage folder, a linked file's too). */
    _wvSbPathRule(): boolean {
        try {
            return typeof Zotero.Attachments.getStorageDirectory === "function" && typeof Zotero.Items.getAsync === "function"
                && typeof IOUtils.write === "function" && typeof IOUtils.makeDirectory === "function" && typeof PathUtils.parent === "function";
        } catch (e) { return false; }
    }

    /** Weavero's own instance of Zotero's worker class, made on first use: its own
     *  Web Worker (manager.js _init: `new Worker(...)` per instance), checked to be
     *  one and not Zotero's. Null where that fails (then Zotero.SDT.ensure). */
    _wvSbOwnWorker(): any {
        const P: any = this;
        if (P._wvSbW) return P._wvSbW;
        if (P._wvDestroyed || P._wvSbOwnBroken) return null;
        const C = this._wvSbWorkerClass();
        if (!C) return null;
        const zw = () => { try { return (Zotero as any).PDFWorker && (Zotero as any).PDFWorker._worker; } catch (e) { return null; } };
        let w: any = null;
        try {
            w = new C();
            if (!w || w === (Zotero as any).PDFWorker || !Array.isArray(w._queue) || !w._waitingPromises || typeof w._waitingPromises !== "object") throw new Error("not a fresh instance");
            w._init();
            const ww = w._worker;
            if (!ww || ww === zw() || typeof ww.terminate !== "function" || typeof ww.postMessage !== "function") throw new Error("no Web Worker of its own");
        }
        catch (e) {
            try { if (w && w._worker && w._worker !== zw()) w._worker.terminate(); } catch (e2) {}
            P._wvSbOwnBroken = true;
            Zotero.debug("[Weavero] structure data: no PDF worker of its own (" + e + "): Zotero.SDT.ensure instead");
            return null;
        }
        P._wvSbW = w;
        P._wvSbWorkersMade = (P._wvSbWorkersMade || 0) + 1;
        Zotero.debug("[Weavero] structure data: own PDF worker started");
        return w;
    }

    /** One PDF built in Weavero's own worker: Zotero's own job on it (manager.js
     *  getStructuredDocumentText: the item, its file's hash, its bytes to the Web
     *  Worker), the pack written where sdt.js writes it and as it writes it (a
     *  temporary file renamed over: IOUtils.write's tmpPath; sdt.js
     *  _generateUnqueued). NOT checked through Zotero.SDT.getPack / ensure: on a
     *  bad pack they build it again on Zotero's worker, the one kept free here;
     *  Zotero checks it when it next reads it (sdt.js _readValidCache), and
     *  Weavero's readers check it as Zotero does (refs.ts, cited-by.ts). Null when
     *  this Zotero lacks a piece (the caller then uses Zotero.SDT.ensure). */
    async _wvSbOwnBuild(id: number): Promise<WvSbOutcome | null> {
        const P: any = this;
        if (!this._wvSbPathRule()) return null;
        const w = this._wvSbOwnWorker();
        if (!w) return null;
        let item: any = null;
        try { item = await Zotero.Items.getAsync(id); } catch (e) {}
        if (!item || typeof item.isAttachment !== "function" || !item.isAttachment()) return false;
        let path = "";
        try { path = PathUtils.join(Zotero.Attachments.getStorageDirectory(item).path, SB_CACHE); } catch (e) { return false; }
        let cancel: () => void = () => {};
        const cancelled = new Promise<"cancelled">((res) => { cancel = () => res("cancelled"); });
        const job = { id, cancel: () => cancel() };
        P._wvSbJob = job;
        let r: any = null;
        try { r = await Promise.race([w.getStructuredDocumentText(id, { isPriority: false }), cancelled]); }
        catch (e) {
            // The Web Worker could not read it (a password, a broken file): Zotero
            // logged why (manager.js _throwWorkerError).
            return false;
        }
        finally { if (P._wvSbJob === job) P._wvSbJob = null; }
        if (r === "cancelled" || P._wvDestroyed) return "cancelled";
        if (!r || !r.buf || !(r.buf.byteLength > 0)) return false;
        try {
            // Zotero wrote it meanwhile (a reader opened that PDF): its file stays. A
            // write of both at once is harmless: the same PDF's pack, each through its
            // own temporary file, each renamed over in one step.
            if (await IOUtils.exists(path)) return true;
            await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true, createAncestors: true });
            await IOUtils.write(path, new Uint8Array(r.buf), { tmpPath: path + SB_TMP });
            // The pack's bytes for its document layer, computed next (_wvSbRun).
            P._wvSbPackBytes = { id, buf: r.buf };
            return true;
        }
        catch (e) {
            try { await IOUtils.remove(path + SB_TMP, { ignoreAbsent: true }); } catch (e2) {}
            Zotero.debug("[Weavero] structure data: could not write " + path + ": " + e);
            try { if (await IOUtils.exists(path)) return true; } catch (e2) {}
            return "error";
        }
    }

    /** Weavero's own worker ends: its Web Worker terminated, the instance dropped,
     *  the job in hand settled at once ("cancelled": left for later) and every
     *  promise of the dropped instance settled too, so nothing waits forever. */
    _wvSbWorkerEnd(why: string) {
        const P: any = this;
        const job = P._wvSbJob, w = P._wvSbW;
        P._wvSbJob = null;
        P._wvSbW = null;
        if (job) { try { job.cancel(); } catch (e) {} }
        if (!w) return;
        // The dropped instance never makes a Web Worker again (_processQueue calls
        // _init), and a step of the job in hand still to come (its file read, then
        // its message to the worker) ends with nothing instead of waiting forever.
        try { w._init = () => {}; w._query = () => Promise.resolve(null); } catch (e) {}
        try { if (w._worker && typeof w._worker.terminate === "function") w._worker.terminate(); } catch (e) {}
        try {
            const wp = w._waitingPromises || {};
            for (const k of Object.keys(wp)) { const x = wp[k]; delete wp[k]; try { x.resolve(null); } catch (e) {} }
        } catch (e) {}
        try {
            const q = Array.isArray(w._queue) ? w._queue.splice(0) : [];
            for (const it of q) { try { it[1](null); } catch (e) {} }
        } catch (e) {}
        Zotero.debug("[Weavero] structure data: own PDF worker ended (" + why + ")" + (job ? ", the PDF in hand left for later" : ""));
    }

    /** One run over what is missing, newest first; one at a time. */
    async _wvSbRun(why: string): Promise<void> {
        const P: any = this;
        if (P._wvSbRunning) { P._wvSbRerun = true; return; }
        if (!this._wvSbCanGo()) return;
        P._wvSbRunning = true;
        const st = this._wvSbSt();
        const tune = this._wvSbTune();
        const t0 = Date.now();
        let complete = false;
        try {
            st.runs++;
            st.state = "scanning"; st.wait = "";
            st.done = 0; st.built = 0; st.skipped = 0; st.msBuilt = 0; st.pagesBuilt = 0;
            const fresh: WvSbCount | null = P._wvSbLastCount && Date.now() - P._wvSbLastCount.at < SB_COUNT_FRESH_MS ? P._wvSbLastCount : null;
            P._wvSbLastCount = null;
            const c = fresh ? { cands: fresh.cands } : { cands: await this._wvSbList((d, t) => { st.scanned = d; st.total = t; }) };
            if (!c.cands || !this._wvSbCanGo()) return;
            const memo = await this._wvSbMemoLoad();
            const pruned = wvSbMemoPrune(memo.failed, c.cands);
            if (Object.keys(pruned).length !== Object.keys(memo.failed).length) { memo.failed = pruned; this._wvSbMemoDirty(); }
            const queue = wvSbQueue(c.cands, memo.failed, this._wvSbSkipLibs());
            st.total = c.cands.length;
            st.have = c.cands.filter((x) => x.has).length;
            st.queue = queue.length;
            st.failed = Object.keys(memo.failed).length;
            st.pdfsLeft = queue.length;
            st.pagesLeft = queue.reduce((s, q) => s + wvSbPages(q), 0);
            Zotero.debug("[Weavero] structure data: run (" + why + ") over " + queue.length + " PDFs without it (" + st.have + " of " + st.total + " have it, " + st.failed + " failed before)");
            st.state = "running";
            for (const q of queue) {
                // Its turn; then built meanwhile (the reader opened the PDF): nothing
                // to do. The waits looked at again after that look, so a PDF starts at
                // once after them (the user back meanwhile: it waits again).
                let has = false;
                for (;;) {
                    if (!(await this._wvSbTurn())) return;
                    try { has = await IOUtils.exists(PathUtils.join(this._wvCbDir(q), SB_CACHE)); } catch (e) {}
                    if (!this._wvSbCanGo()) return;
                    if (has || !this._wvSbWaitWhy(tune)) break;
                }
                if (has) st.skipped++;
                else {
                    st.current = q.id;
                    const t1 = Date.now();
                    let ok: WvSbOutcome = false;
                    try { ok = await this._wvSbEnsure(q.id); } catch (e) { ok = false; }
                    st.current = 0;
                    // Left for later (Pause, Stop, quit, destroy() with it in hand).
                    if (P._wvDestroyed || ok === "cancelled") return;
                    if (ok === true) {
                        st.built++; st.msBuilt += Date.now() - t1; st.pagesBuilt += wvSbPages(q);
                        this._wvSbBuilt(q.id);
                        // Its document layer straight after (doc layer Phase 1, trigger 1;
                        // modules/doc-layer.ts): from the bytes in memory when Weavero's
                        // own worker built it, else from the file; in the layer's worker.
                        const pb = P._wvSbPackBytes;
                        P._wvSbPackBytes = null;
                        try { await this._wvDlAfterBuild(q.id, pb && pb.id === q.id ? pb.buf : null); } catch (e) {}
                        if (P._wvDestroyed) return;
                    }
                    else if (ok === "error") Zotero.debug("[Weavero] structure data: " + wvSbMemoKey(q) + " built but not written (tried again at the next run)");
                    else {
                        memo.failed[wvSbMemoKey(q)] = q.stamp;
                        st.failed++;
                        this._wvSbMemoDirty();
                        Zotero.debug("[Weavero] structure data: Zotero could not build " + wvSbMemoKey(q) + " (kept until its file changes)");
                    }
                }
                st.done++; st.pdfsLeft--; st.pagesLeft -= wvSbPages(q);
                await this._wvSbSleep(tune.gap);
            }
            complete = true;
        }
        finally {
            P._wvSbRunning = false;
            st.current = 0; st.wait = "";
            st.state = complete ? "done" : "stopped";
            st.lastRunMs = Date.now() - t0;
            // Weavero's own worker is not kept between two runs.
            this._wvSbWorkerEnd(complete ? "run done" : "run stopped");
            if (!P._wvDestroyed) {
                Zotero.debug("[Weavero] structure data: run (" + why + ") " + (complete ? "done" : "stopped") + ": " + st.built + " built, " + st.done + " of " + st.queue + " looked at, in " + st.lastRunMs + " ms");
                this._wvSbCbFlush();
                this._wvSbMemoFlush().catch(() => {});
                const again = P._wvSbRerun;
                P._wvSbRerun = false;
                if (again) this._wvSbSchedule(1000, "again");
                else if (complete && this._wvSbOn()) this._wvSbSchedule(SB_AGAIN_MS, "periodic");
            }
        }
    }

    /** A PDF built: References looks again; Cited by reads it again (batched). */
    _wvSbBuilt(id: number) {
        const P: any = this;
        try { this._wvRefsLibRecheck(id); } catch (e) {}
        const ids: Set<number> = P._wvSbCbIds || (P._wvSbCbIds = new Set());
        ids.add(id);
        if (!P._wvSbCbT) P._wvSbCbT = wvTimeout(() => { P._wvSbCbT = null; const lp: any = wvLivePlugin(); if (lp === P) this._wvSbCbFlush(); }, SB_CB_EVERY_MS);
    }

    _wvSbCbFlush() {
        const P: any = this;
        wvClearTimeout(P._wvSbCbT); P._wvSbCbT = null;
        const ids: Set<number> | undefined = P._wvSbCbIds;
        if (!ids || !ids.size) return;
        const list = Array.from(ids);
        ids.clear();
        try { if (this._wvCbOn()) this._wvCbPass("structure data built", list).catch((e: any) => Zotero.debug("[Weavero] structure data: cited by err: " + e)); } catch (e) {}
    }

    // ---- the failure memo ---------------------------------------------------------------

    async _wvSbMemoLoad(): Promise<{ v: number; failed: Record<string, string> }> {
        const P: any = this;
        if (P._wvSbMemo) return P._wvSbMemo;
        let doc: any = null;
        try {
            const r = await wvStoreRead(wvStorePath(SB_FILE));
            if (r.status === "ok" && r.doc && typeof r.doc === "object") doc = r.doc;
        } catch (e) {}
        const failed: Record<string, string> = {};
        if (doc && doc.failed && typeof doc.failed === "object") for (const k of Object.keys(doc.failed)) if (typeof doc.failed[k] === "string") failed[k] = doc.failed[k];
        if (!P._wvSbMemo) P._wvSbMemo = { v: SB_V, failed };
        return P._wvSbMemo;
    }

    _wvSbMemoDirty() {
        const P: any = this;
        P._wvSbMemoIsDirty = true;
        if (!P._wvSbMemoT) P._wvSbMemoT = wvTimeout(() => { P._wvSbMemoT = null; this._wvSbMemoFlush().catch(() => {}); }, SB_MEMO_FLUSH_MS);
    }

    async _wvSbMemoFlush(): Promise<void> {
        const P: any = this;
        wvClearTimeout(P._wvSbMemoT); P._wvSbMemoT = null;
        if (!P._wvSbMemoIsDirty || !P._wvSbMemo) return;
        P._wvSbMemoIsDirty = false;
        await wvStoreWrite(wvStorePath(SB_FILE), { v: SB_V, failed: P._wvSbMemo.failed }, { pretty: null });
    }

    // ---- Settings -----------------------------------------------------------------------

    /** The status line's message for Settings, or null for none. */
    _wvSbStatusL10n(): { id: string; args?: any } | null {
        const P: any = this;
        if (!this._wvSbApi()) return null;
        if (this._wvSbZoteroBuilds()) return { id: "weavero-sdt-build-status-zotero" };
        const counting = P._wvSbCounting;
        if (counting) return { id: "weavero-sdt-build-status-counting", args: { done: counting.done, total: counting.total } };
        if (!this._wvSbPrefOn()) return null;
        if (this._wvSbPaused() && !P._wvSbRunning) return { id: "weavero-sdt-build-status-paused" };
        const st = this._wvSbSt();
        if (P._wvSbRunning && st.state === "scanning") return { id: "weavero-sdt-build-status-counting", args: { done: st.scanned, total: st.total } };
        if (P._wvSbRunning) {
            const eta = wvSbEta({ pdfs: st.built, pages: st.pagesBuilt, ms: st.msBuilt }, { pdfs: st.pdfsLeft, pages: st.pagesLeft });
            return { id: "weavero-sdt-build-status-run", args: { wait: st.wait || "none", done: st.done, total: st.queue, left: this._wvSbDurText(eta, eta) } };
        }
        if (st.state === "done") return { id: "weavero-sdt-build-status-done", args: { failed: st.failed } };
        return { id: "weavero-sdt-build-status-start" };
    }

    /** Pause / Resume. */
    _wvSbSetPaused(paused: boolean) {
        try { Zotero.Prefs.set("weavero." + WV_SB_PAUSE_PREF, !!paused); } catch (e) {}
    }

    /** Stop: the option off (Settings' checkbox follows it). */
    _wvSbTurnOff() {
        try { Zotero.Prefs.set("weavero." + WV_SB_PREF, false); } catch (e) {}
    }

    // ---- Remove Built Data --------------------------------------------------------------

    /** The stores of SB_CLEAN_STORES that lib/backup.ts classifies "cache" (a folder:
     *  its content, and a backup's walk skips it whole), with their paths: the only
     *  stores the cleaning may remove. */
    _wvSbCleanStores(): Array<{ rel: string; dir: boolean; path: string }> {
        const out: Array<{ rel: string; dir: boolean; path: string }> = [];
        for (const s of SB_CLEAN_STORES) {
            const cache = s.dir ? wvBkSkipDir(s.rel) && wvBkClassify(s.rel + "/x.json") === "cache" : wvBkClassify(s.rel) === "cache";
            if (!cache) { Zotero.debug("[Weavero] built data: " + s.rel + " is no cache in lib/backup.ts, left alone"); continue; }
            out.push({ rel: s.rel, dir: s.dir, path: PathUtils.join(wvStoreDir(), s.rel) });
        }
        return out;
    }

    /** Where Zotero may keep a structure-data pack: beside every attachment with a
     *  file of its own -- a PDF, an EPUB, a snapshot, a linked file too (sdt.js
     *  _getProcessorType; _getCachePath: the attachment's storage folder) -- of the
     *  user's libraries, the trash included (rebuilt like the others). Never in the
     *  libraries of the groups the hidden skip list names, nor in a folder whose key
     *  one of their items has: storage/<key> does not name its library
     *  (attachments.js getStorageDirectoryByLibraryAndKey). */
    async _wvSbCleanList(): Promise<WvSbPack[]> {
        const skip = this._wvSbSkipLibs();
        const rows: Array<{ id: number; lib: number; key: string }> = [];
        await Zotero.DB.queryAsync(
            "SELECT a.itemID, i.libraryID, i.key FROM itemAttachments a JOIN items i ON i.itemID = a.itemID"
            + " WHERE a.linkMode != ? AND i.libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))",
            [Zotero.Attachments.LINK_MODE_LINKED_URL],
            { onRow: (row: any) => { rows.push({ id: row.getResultByIndex(0), lib: row.getResultByIndex(1), key: String(row.getResultByIndex(2)) }); } });
        const held = new Set<string>();
        for (const r of rows) if (skip.has(r.lib)) held.add(r.key);
        const out: WvSbPack[] = [];
        for (const r of rows) {
            if (skip.has(r.lib) || held.has(r.key)) continue;
            let dir = "";
            try { dir = Zotero.Attachments.getStorageDirectoryByLibraryAndKey(r.lib, r.key).path; } catch (e) { continue; }
            out.push({ id: r.id, lib: r.lib, key: r.key, path: PathUtils.join(dir, SB_CACHE) });
        }
        return out;
    }

    /** Every file of folder `dir` (none when it is not there), with its size, and its
     *  folders, the deepest first. A batch of stats at a time, a yield between two. */
    async _wvSbCleanWalk(dir: string): Promise<{ files: Array<{ path: string; size: number }>; dirs: string[] }> {
        const P: any = this;
        const files: Array<{ path: string; size: number }> = [];
        const dirs: string[] = [];
        const todo = [dir];
        while (todo.length && !P._wvDestroyed) {
            const d = todo.shift() as string;
            let kids: string[] = [];
            try { kids = await IOUtils.getChildren(d); } catch (e) { continue; }
            dirs.push(d);
            for (let i = 0; i < kids.length; i += SB_CLEAN_BATCH) {
                const sts = await Promise.all(kids.slice(i, i + SB_CLEAN_BATCH).map(async (k) => {
                    try { return { k, st: await IOUtils.stat(k) }; } catch (e) { return { k, st: null as any }; }
                }));
                for (const { k, st } of sts) {
                    if (!st) continue;
                    if (st.type === "directory") todo.push(k);
                    else files.push({ path: k, size: Number(st.size) || 0 });
                }
                await wvSleep(0);
            }
        }
        // Breadth first: a folder comes after its parent, so reversed, before it.
        return { files, dirs: dirs.reverse() };
    }

    /** A store's files (a folder's whole tree, or the file itself). */
    async _wvSbCleanStoreFiles(s: { dir: boolean; path: string }): Promise<{ files: Array<{ path: string; size: number }>; dirs: string[] }> {
        if (s.dir) return this._wvSbCleanWalk(s.path);
        let st: any = null;
        try { st = await IOUtils.stat(s.path); } catch (e) {}
        return { files: st && st.type !== "directory" ? [{ path: s.path, size: Number(st.size) || 0 }] : [], dirs: [] };
    }

    /** What the built data takes now: the packs (count, bytes) and the stores' files,
     *  stat-ed a batch at a time. One measure at a time, the answer kept
     *  SB_MEASURE_FRESH_MS; `force`: one started after this call. A measure a
     *  cleaning overtook is answered but not kept. Null when stopped meanwhile. */
    _wvSbCleanMeasure(force = false): Promise<WvSbMeasure | null> {
        const P: any = this;
        const kept: WvSbMeasure | null = P._wvSbCleanM || null;
        if (!force && kept && Date.now() - kept.at < SB_MEASURE_FRESH_MS) return Promise.resolve(kept);
        if (P._wvSbMeasuring) {
            if (!force) return P._wvSbMeasuring;
            const again = () => this._wvSbCleanMeasure(true);
            return P._wvSbMeasuring.then(again, again);
        }
        const gen = P._wvSbCleanGen || 0;
        const me: Promise<WvSbMeasure | null> = (async () => {
            const list = await this._wvSbCleanList();
            let packs = 0, packBytes = 0;
            for (let i = 0; i < list.length; i += SB_CLEAN_BATCH) {
                if (P._wvDestroyed) return null;
                const sts = await Promise.all(list.slice(i, i + SB_CLEAN_BATCH).map(async (c) => { try { return await IOUtils.stat(c.path); } catch (e) { return null; } }));
                for (const st of sts) if (st && st.type === "regular") { packs++; packBytes += Number(st.size) || 0; }
                await wvSleep(0);
            }
            let storeFiles = 0, storeBytes = 0, index = false;
            for (const s of this._wvSbCleanStores()) {
                const f = await this._wvSbCleanStoreFiles(s);
                storeFiles += f.files.length;
                for (const x of f.files) storeBytes += x.size;
                if (s.dir && f.files.length) index = true;
            }
            if (P._wvDestroyed) return null;
            const m: WvSbMeasure = { packs, packBytes, storeFiles, storeBytes, bytes: packBytes + storeBytes, index, at: Date.now() };
            if ((P._wvSbCleanGen || 0) === gen && !P._wvSbCleaning) P._wvSbCleanM = m;
            return m;
        })();
        P._wvSbMeasuring = me;
        const done = () => { if (P._wvSbMeasuring === me) P._wvSbMeasuring = null; };
        me.then(done, done);
        return me;
    }

    /** One file the cleaning removes (a pack, a store's file); the suite stubs it to
     *  stand for a file another program holds. */
    async _wvSbCleanRemove(path: string): Promise<void> {
        await IOUtils.remove(path, { ignoreAbsent: true });
    }

    /** Remove Built Data, in this order:
     *   1. the build off, its PDF in hand ended -- the run awaits that PDF's write, so
     *      no pack of Weavero's comes once it has ended (bounded: Zotero's own ensure,
     *      the fallback, cannot be cut) -- its memo and hand-offs forgotten;
     *   2. the Cited by index in memory reset, its pass running ended without a write,
     *      every load held until the files are gone (cited-by.ts _wvCbReset);
     *   3. every pack of _wvSbCleanList, a batch at a time, a yield between two (and
     *      Weavero's own temporary file beside it, a write cut short);
     *   4. the stores of _wvSbCleanStores, once their pending writes have landed
     *      (lib/store.ts), a file at a time, then their emptied folders;
     *   5. References' lists in memory (refs.ts _wvRefsDropCaches), the document
     *      layer's computations in flight (doc-layer.ts _wvDlReset, also at step
     *      2), the build's counters; Cited by builds its index again when on.
     *  A file that cannot be removed (another program holds it, on Windows) is
     *  counted and skipped. One cleaning at a time; nothing written to any library. */
    _wvSbCleanRun(): Promise<WvSbCleanReport> {
        const P: any = this;
        if (P._wvSbCleaning) return P._wvSbCleaning;
        const me: Promise<WvSbCleanReport> = (async () => {
            const rep: WvSbCleanReport = { packs: 0, packBytes: 0, storeFiles: 0, storeBytes: 0, bytes: 0, failed: 0, at: 0 };
            const t0 = Date.now();
            P._wvSbCleanGen = (P._wvSbCleanGen || 0) + 1;
            P._wvSbCleanM = null;
            P._wvSbCleanProg = { done: 0, total: 0 };
            let release: () => void = () => {};
            const failed = (path: string, e: any) => { rep.failed++; Zotero.debug("[Weavero] built data: could not remove " + path + ": " + e); };
            try {
                this._wvSbTurnOff();
                wvClearTimeout(P._wvSbT); P._wvSbT = null;
                this._wvSbWakeAll();
                this._wvSbWorkerEnd("built data removed");
                for (const t = Date.now(); P._wvSbRunning && Date.now() - t < SB_CLEAN_WAIT_RUN_MS;) { this._wvSbWakeAll(); await wvSleep(50); }
                if (P._wvSbRunning) Zotero.debug("[Weavero] built data: the build still holds a PDF, its pack may come back");
                wvClearTimeout(P._wvSbMemoT); P._wvSbMemoT = null;
                wvClearTimeout(P._wvSbCbT); P._wvSbCbT = null;
                P._wvSbMemo = null; P._wvSbMemoIsDirty = false; P._wvSbCbIds = null; P._wvSbLastCount = null;
                try { if (typeof this._wvCbReset === "function") release = await this._wvCbReset(); }
                catch (e) { Zotero.debug("[Weavero] built data: cited by reset err: " + e); }
                // The document layer: a computation in flight writes nothing now.
                try { this._wvDlReset(); } catch (e) {}
                const list = await this._wvSbCleanList();
                P._wvSbCleanProg = { done: 0, total: list.length };
                for (let i = 0; i < list.length && !P._wvDestroyed; i += SB_CLEAN_BATCH) {
                    await Promise.all(list.slice(i, i + SB_CLEAN_BATCH).map(async (c) => {
                        let st: any = null;
                        try { st = await IOUtils.stat(c.path); } catch (e) { st = null; }
                        if (st && st.type === "regular") {
                            try { await this._wvSbCleanRemove(c.path); rep.packs++; rep.packBytes += Number(st.size) || 0; }
                            catch (e) { failed(c.path, e); }
                        }
                        try { await IOUtils.remove(c.path + SB_TMP, { ignoreAbsent: true }); } catch (e) {}
                    }));
                    P._wvSbCleanProg = { done: Math.min(i + SB_CLEAN_BATCH, list.length), total: list.length };
                    await wvSleep(0);
                }
                // A restore or an update backup in progress first (modules/backups.ts).
                try { await wvStoreGate(); } catch (e) {}
                for (const s of this._wvSbCleanStores()) {
                    if (P._wvDestroyed) break;
                    if (s.dir) await wvStoreSettled(s.path);
                    else await wvStoreChain(s.path);
                    const f = await this._wvSbCleanStoreFiles(s);
                    for (let i = 0; i < f.files.length; i += SB_CLEAN_BATCH) {
                        await Promise.all(f.files.slice(i, i + SB_CLEAN_BATCH).map(async (x) => {
                            try { await this._wvSbCleanRemove(x.path); rep.storeFiles++; rep.storeBytes += x.size; }
                            catch (e) { failed(x.path, e); }
                        }));
                        await wvSleep(0);
                    }
                    // Emptied, the deepest first; one still holding a file stays.
                    for (const d of f.dirs) { try { await IOUtils.remove(d, { ignoreAbsent: true }); } catch (e) {} }
                }
                try { this._wvRefsDropCaches(); } catch (e) { Zotero.debug("[Weavero] built data: references caches err: " + e); }
                // ...nor one started during the cleaning.
                try { this._wvDlReset(); } catch (e) {}
                P._wvSbStO = null; P._wvSbSeen = null;
            }
            finally {
                release();
                P._wvSbCleanProg = null;
                P._wvSbCleanGen = (P._wvSbCleanGen || 0) + 1;
            }
            rep.bytes = rep.packBytes + rep.storeBytes;
            rep.at = Date.now();
            P._wvSbCleanLast = rep;
            Zotero.debug("[Weavero] built data removed: " + rep.packs + " packs (" + rep.packBytes + " bytes), " + rep.storeFiles + " files of Weavero's caches ("
                + rep.storeBytes + " bytes), " + rep.failed + " that could not be removed, in " + (Date.now() - t0) + " ms");
            if (!P._wvDestroyed) {
                try { if (this._wvCbOn()) { this._wvCbWireNotifier(); this._wvCbSchedule(SB_CLEAN_CB_DELAY_MS, "built data removed"); } } catch (e) {}
                try { this._wvCbSecRefreshAll(); } catch (e) {}
            }
            return rep;
        })();
        P._wvSbCleaning = me;
        // Settings' line measures again.
        const done = () => {
            if (P._wvSbCleaning === me) P._wvSbCleaning = null;
            if (!P._wvDestroyed) this._wvSbCleanMeasure(true).catch(() => {});
        };
        me.then(done, done);
        return me;
    }

    /** A size in Settings' words ("0 MB" for nothing; the warning's rounding else). */
    _wvSbCleanSize(bytes: number): string {
        if (!(bytes > 0)) return wvStr("weavero-sdt-build-size-one", { n: 0, unit: "MB" });
        return this._wvSbSizeText(bytes, bytes);
    }

    /** The confirmation's title, text and button, from the measure `m`. */
    _wvSbCleanText(m: WvSbMeasure): { title: string; body: string; ok: string } {
        const body = [
            wvStr("weavero-sdt-clean-warn-intro", { size: this._wvSbCleanSize(m.bytes), count: m.packs }),
            "• " + wvStr("weavero-sdt-clean-warn-back"),
            "• " + wvStr("weavero-sdt-clean-warn-off"),
            "• " + wvStr("weavero-sdt-clean-warn-kept"),
        ].join("\n\n");
        return { title: wvStr("weavero-sdt-clean-warn-title"), body, ok: wvStr("weavero-sdt-clean-warn-ok") };
    }

    /** Settings' button: the measure (the one just made, else a new one), the
     *  confirmation (Zotero's own dialog, Cancel the default), then the cleaning. Its
     *  report; null with nothing to remove or on Cancel. */
    async _wvSbCleanAsk(win: any): Promise<WvSbCleanReport | null> {
        const P: any = this;
        if (P._wvSbCleaning || P._wvSbCleanAsking) return null;
        P._wvSbCleanAsking = true;
        try {
            const m = await this._wvSbCleanMeasure();
            if (!m || !m.bytes || P._wvDestroyed) return null;
            const ok = await this._wvSbPrompt(win, this._wvSbCleanText(m));
            if (!ok || P._wvDestroyed) return null;
        }
        finally { P._wvSbCleanAsking = false; }
        return this._wvSbCleanRun();
    }

    /** Settings' line (measuring, the measure, the cleaning's progress), the last
     *  cleaning's report, and the button's state. */
    _wvSbCleanL10n(): { line: { id: string; args?: any } | null; result: { id: string; args?: any } | null; busy: boolean; empty: boolean } {
        const P: any = this;
        const m: WvSbMeasure | null = P._wvSbCleanM || null;
        const prog = P._wvSbCleanProg;
        let line: { id: string; args?: any } | null = null;
        if (P._wvSbCleaning) line = { id: "weavero-sdt-clean-running", args: { done: prog ? prog.done : 0, total: prog ? prog.total : 0 } };
        else if (!m && P._wvSbMeasuring) line = { id: "weavero-sdt-clean-measuring" };
        else if (m && m.bytes > 0) line = { id: "weavero-sdt-clean-size", args: { size: this._wvSbCleanSize(m.bytes), count: m.packs, index: m.index ? "yes" : "no" } };
        const last: WvSbCleanReport | null = P._wvSbCleanLast || null;
        let result: { id: string; args?: any } | null = null;
        if (last && !P._wvSbCleaning && Date.now() - last.at < SB_CLEAN_REPORT_MS) {
            result = { id: last.failed ? "weavero-sdt-clean-done-failed" : "weavero-sdt-clean-done", args: { size: this._wvSbCleanSize(last.bytes), count: last.packs, failed: last.failed } };
        }
        return { line, result, busy: !!(P._wvSbCleaning || P._wvSbCleanAsking || (!m && P._wvSbMeasuring)), empty: !!m && !(m.bytes > 0) };
    }

    // ---- lifecycle ------------------------------------------------------------------------

    _wvSbInit() {
        this._wvSbWirePrefWatch();
        this._wvSbWireObs();
        if (this._wvSbOn() && !this._wvSbPaused()) this._wvSbSchedule(SB_START_DELAY_MS, "start");
    }

    _wvSbWirePrefWatch() {
        const P: any = this;
        try {
            const g: any = Zotero;
            const tag = P._wvWireTag();
            if (g._wvSbPrefObs) {
                if (g._wvSbPrefObsVer === tag) return;
                for (const s of g._wvSbPrefObs) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
                delete g._wvSbPrefObs;
            }
            g._wvSbPrefObsVer = tag;
            g._wvSbPrefObs = SB_PREFS.map((k) => Zotero.Prefs.registerObserver("weavero." + k, () => {
                try {
                    const lp: any = wvLivePlugin();
                    if (!lp || lp._wvWireTag() !== tag) return;
                    lp._wvSbApply();
                } catch (e) {}
            }));
        } catch (e) { Zotero.debug("[Weavero] structure data: pref watch err: " + e); }
    }

    _wvSbUnwirePrefWatch() {
        try {
            const g: any = Zotero;
            for (const s of g._wvSbPrefObs || []) { try { Zotero.Prefs.unregisterObserver(s); } catch (e) {} }
            delete g._wvSbPrefObs;
            delete g._wvSbPrefObsVer;
        } catch (e) {}
    }

    /** Memory pressure: the run waits a while; quit: it stops. */
    _wvSbWireObs() {
        const P: any = this;
        if (P._wvSbObs) return;
        const obs = {
            observe: (_s: any, topic: string) => {
                if (wvLivePlugin() !== P) return;
                if (topic === "memory-pressure") { P._wvSbPressureAt = Date.now(); }
                else { P._wvSbQuit = true; this._wvSbWakeAll(); this._wvSbWorkerEnd("quit"); }
            },
        };
        try {
            Services.obs.addObserver(obs, "memory-pressure");
            Services.obs.addObserver(obs, "quit-application-granted");
            P._wvSbObs = obs;
        } catch (e) {}
    }

    _wvSbUnwireObs() {
        const P: any = this;
        const obs = P._wvSbObs;
        P._wvSbObs = null;
        if (!obs) return;
        for (const t of ["memory-pressure", "quit-application-granted"]) { try { Services.obs.removeObserver(obs, t); } catch (e) {} }
    }

    /** A setting changed: start (soon) or stop. */
    _wvSbApply() {
        const P: any = this;
        wvClearTimeout(P._wvSbPrefT);
        P._wvSbPrefT = wvTimeout(() => {
            P._wvSbPrefT = null;
            const lp: any = wvLivePlugin();
            if (lp !== P || P._wvDestroyed) return;
            if (this._wvSbOn() && !this._wvSbPaused()) this._wvSbSchedule(SB_ON_DELAY_MS, "setting on");
            else {
                wvClearTimeout(P._wvSbT); P._wvSbT = null;
                // A running run stops at its next turn; a wait ends now; Weavero's
                // worker ends now too, the PDF in hand left for later.
                this._wvSbWakeAll();
                this._wvSbWorkerEnd("off");
            }
        }, 50);
    }

    _wvSbDestroy() {
        const P: any = this;
        wvClearTimeout(P._wvSbT); P._wvSbT = null;
        wvClearTimeout(P._wvSbPrefT); P._wvSbPrefT = null;
        wvClearTimeout(P._wvSbCbT); P._wvSbCbT = null;
        this._wvSbWakeAll();
        // Weavero's own Web Worker: terminated, its job settled (disable, reload).
        this._wvSbWorkerEnd("destroy");
        P._wvSbOwnBroken = false;
        this._wvSbUnwireObs();
        this._wvSbUnwirePrefWatch();
        try { if (P._wvSbMemoIsDirty) this._wvSbMemoFlush().catch(() => {}); } catch (e) {}
        wvClearTimeout(P._wvSbMemoT); P._wvSbMemoT = null;
        P._wvSbCbIds = null; P._wvSbLastCount = null; P._wvSbSeen = null; P._wvSbPackBytes = null;
    }
}

const _sbDescriptors = Object.getOwnPropertyDescriptors(_SdtBuildMixin.prototype);
delete (_sbDescriptors as any).constructor;
export const sdtBuildMethods = _sbDescriptors;
