// Module: Weavero's DOCUMENT LAYER, the plugin side (doc layer Phase 1,
// 2026-11-24; design work/doc-layer-design-2026-11-24.md, approved by MJT the
// same day; the pure part is lib/doc-layer.ts).
//
// WHERE: `<data dir>/weavero/doc-layer/<lib>/<K>/<KEY>.jsonlz4` -- `u` for My
// Library, `g<groupID>` for a group (the group id survives leaving and joining
// it again), `K` the key's first character. Weavero's data folder only: never
// a library, never Zotero's files, never synced, never backed up (lib/backup.ts
// classifies the folder "cache"); Remove Built Data removes it (sdt-build.ts).
// The libraries of the groups the structure-data build skips (the hidden pref
// weavero.referencesBuildStructureSkipGroups) get NO layer file (MJT
// 2026-11-24, "Follow the build's skip list"): their outline is computed in
// memory as before and never saved.
//
// WHEN (Phase 1): right after Weavero's own build writes a pack (sdt-build.ts
// _wvSbRun, from the pack's bytes in memory), and at first need -- the Outline
// panel of a PDF (reader-panels.ts _wvOutlineSdtRead). The idle sweep is Phase
// 2. A saved layer is read when its stamp and fingerprints are the file's and
// the code's now (lib/doc-layer.ts wvDlStale); otherwise the stale components
// are computed again and the file rewritten, the others kept byte for byte.
//
// OFF THE MAIN THREAD: the components are computed in a ChromeWorker of
// Weavero's own (doc-layer-worker.ts), which opens the pack with Zotero's own
// pack module. Weavero's outline builder is one synchronous call; on the main
// thread a long book froze Zotero for seconds, and MJT's limit is a pause of
// ~50 ms. Where no worker can be had, a first need (a panel opening) computes
// on the main thread as the outline did before the layer; the build's trigger
// never does (the layer then comes at first need).
//
// RECOVERY: a file that does not decompress or parse is computed again and
// overwritten; a file another program holds (a read refused) is computed in
// memory and not written again this session, so a lock never starts a write
// loop; a pack older than its PDF, of another file, or of a format this Zotero
// does not read gives no layer (today's paths).
//
// CONCURRENCY: one computation per PDF at a time (an in-flight map: two
// windows or readers opening one PDF share it); writes serialised per path on
// the Zotero global (lib/store.ts); a computation of a destroyed instance, or
// one Remove Built Data overtook (a generation counter), writes nothing.
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via defineProperties.

import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvStoreRead, wvStoreWrite, wvStoreDir } from "../lib/store";
import { wvSdtModule, wvSdtMeta, wvSdtOpen } from "../lib/sdt";
import {
    WvDlComp, WvDlDoc, WvDlNow, WvDlComputed, WvDlComputeInput, WV_DL_STORED,
    wvDlChainFps, wvDlMetaSig, wvDlStale, wvDlComputeParts, wvDlAssemble, wvDlOutlineSdt,
} from "../lib/doc-layer";

declare const Zotero: any;
declare const Services: any;
declare const ChromeWorker: any;
declare const __WV_DL_OL_SRC__: string;
declare const __WV_DL_PL_SRC__: string;

const DL_OL_SRC = typeof __WV_DL_OL_SRC__ === "string" ? __WV_DL_OL_SRC__ : "";
const DL_PL_SRC = typeof __WV_DL_PL_SRC__ === "string" ? __WV_DL_PL_SRC__ : "";

/** The folder under weavero/ (lib/backup.ts: "cache"; sdt-build.ts SB_CLEAN_STORES). */
export const WV_DL_DIR = "doc-layer";
const DL_CACHE = ".zotero-sdt-cache";
/** The resource host the worker's script is loaded from (`_wvDlResRoot`). */
const DL_RES = "weavero";
/** A job in the worker longer than this: the worker is ended, the job gives nothing. */
const DL_JOB_MS = 180000;
/** The worker is ended after this long without a job (its memory back). */
const DL_IDLE_MS = 60000;

/** What `_wvDlGet` answers: the layer, and where it came from. */
export interface WvDlGot { doc: WvDlDoc; from: "file" | "computed"; saved: boolean; how?: "worker" | "main" }

interface WvDlState { now: WvDlNow; meta: any; packPath: string; pdfPath: string }

class _DocLayerMixin {
    [k: string]: any;

    // ---- where and what ---------------------------------------------------------------

    /** The components' fingerprints for this build's code (chained). The suite
     *  replaces it on the instance to stand for a rules change. */
    _wvDlFps(): Record<WvDlComp, string> {
        const P: any = this;
        return P._wvDlFpsO || (P._wvDlFpsO = wvDlChainFps({ q: "", tx: "", pl: DL_PL_SRC, ol: DL_OL_SRC }));
    }

    /** `u` (My Library), `g<groupID>` (a group); null for any other library. */
    _wvDlLibSeg(libraryID: number): string | null {
        try {
            const lib = Zotero.Libraries.get(libraryID);
            if (!lib) return null;
            if (lib.libraryType === "user") return "u";
            if (lib.libraryType === "group") {
                const g = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
                return g ? "g" + g : null;
            }
        } catch (e) {}
        return null;
    }

    /** A library of a group the structure-data build skips: no layer file. */
    _wvDlSkipped(libraryID: number): boolean {
        try { return this._wvSbSkipLibs().has(libraryID); } catch (e) { return false; }
    }

    /** The layer file of `key` in library segment `seg` (each folder its own
     *  PathUtils.join component: lib/store.ts wvStorePath). */
    _wvDlPath(seg: string, key: string): string {
        return PathUtils.join(wvStoreDir(), WV_DL_DIR, seg, String(key).charAt(0).toUpperCase(), key + ".jsonlz4");
    }

    /** The stamp of attachment `att` NOW, from stats alone, with the metadata the
     *  outline reads; null when it can have no layer (not a PDF, no structure
     *  data on this Zotero, no pack, a pack older than its PDF). */
    async _wvDlState(att: any): Promise<WvDlState | null> {
        try {
            if (!att || typeof att.isPDFAttachment !== "function" || !att.isPDFAttachment()) return null;
            if (!(Zotero as any).SDT || !wvSdtModule()) return null;
            const pdfPath = await att.getFilePathAsync();
            if (!pdfPath) return null;
            const packPath = PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, DL_CACHE);
            const st = async (p: string) => { try { return await IOUtils.stat(p); } catch (e) { return null; } };
            const [ss, ps]: any[] = await Promise.all([st(packPath), st(pdfPath)]);
            if (!ss || !ps || !ss.size) return null;
            if (ss.lastModified < ps.lastModified) return null;
            const fmt = await wvSdtMeta();
            const meta = this._wvOutlineSdtMeta(att);
            const now: WvDlNow = {
                pack: { size: Number(ss.size), mtime: Number(ss.lastModified) },
                pdf: { size: Number(ps.size), mtime: Number(ps.lastModified) },
                format: { pack: fmt.SDT_PACK_VERSION, schema: String(fmt.SDT_SCHEMA_VERSION) },
                meta: wvDlMetaSig(meta),
                lang: String((meta && meta.labels && meta.labels.references) || ""),
                fp: this._wvDlFps(),
            };
            return { now, meta, packPath, pdfPath };
        } catch (e) { return null; }
    }

    // ---- the layer of one PDF -----------------------------------------------------------

    /** Attachment `att`'s layer: the saved file when it describes the pack, the
     *  PDF, the metadata and the code now, else its stale components computed
     *  (`_wvDlCompute`) and the file written. Null when the PDF can have none.
     *  `opts.trigger` "open" (first need) or "build" (after Weavero's build);
     *  `opts.bytes` the pack's bytes when the caller has them (the build);
     *  `opts.allowMain` computing on the main thread when no worker can. One
     *  computation per PDF at a time. */
    _wvDlGet(att: any, opts?: { trigger?: string; bytes?: any; allowMain?: boolean }): Promise<WvDlGot | null> {
        const P: any = this;
        const o = opts || {};
        const k = att && att.libraryID + "/" + att.key;
        const fl: Map<string, Promise<WvDlGot | null>> = P._wvDlInflight || (P._wvDlInflight = new Map());
        const had = k ? fl.get(k) : null;
        if (had) return had;
        const p = this._wvDlGetNow(att, o).catch((e: any) => { Zotero.debug("[Weavero] doc layer: " + k + ": " + e); return null; });
        if (k) {
            fl.set(k, p);
            const done = () => { if (fl.get(k) === p) fl.delete(k); };
            p.then(done, done);
        }
        return p;
    }

    async _wvDlGetNow(att: any, o: { trigger?: string; bytes?: any; allowMain?: boolean }): Promise<WvDlGot | null> {
        const P: any = this;
        const gen = P._wvDlGen || 0;
        const st = await this._wvDlState(att);
        if (!st || P._wvDestroyed) return null;
        const seg = this._wvDlLibSeg(att.libraryID);
        const path = seg && !this._wvDlSkipped(att.libraryID) ? this._wvDlPath(seg, att.key) : null;
        let prev: any = null, status = "none";
        if (path) {
            const r = await wvStoreRead(path, { decompress: true, onParseError: "keep" });
            status = r.status;
            if (r.status === "ok") prev = r.doc;
            else if (r.status === "parse-error") Zotero.debug("[Weavero] doc layer: " + path + " is corrupt, computed again");
            else if (r.status === "io-error") {
                // Held by another program: computed in memory, never written this session.
                (P._wvDlNoWrite || (P._wvDlNoWrite = new Set())).add(path);
            }
        }
        if (P._wvDestroyed) return null;
        const want = wvDlStale(prev, st.now);
        if (!want.length) return { doc: prev, from: "file", saved: true };
        let hash = "";
        try { hash = String((await att.attachmentHash) || ""); } catch (e) {}
        if (!hash || P._wvDestroyed) return null;
        const input: WvDlComputeInput = { want, meta: JSON.parse(JSON.stringify(st.meta || {})), hash, format: st.now.format };
        const c = await this._wvDlCompute(st.packPath, input, o.bytes || null, !!o.allowMain);
        if (!c || !c.parts || P._wvDestroyed) return null;
        const parts = c.parts;
        if (parts.unusable || !parts.pack) {
            Zotero.debug("[Weavero] doc layer: no layer for " + att.libraryID + "/" + att.key + " (" + (parts.unusable || "?") + ")");
            return null;
        }
        const doc = wvDlAssemble(want.length === WV_DL_STORED.length ? null : prev, parts, {
            doc: { lib: seg || "", key: att.key, att: att.id },
            src: {
                pack: { size: st.now.pack.size, mtime: st.now.pack.mtime, packVersion: parts.pack.packVersion, schema: parts.pack.schema, processor: parts.pack.processor },
                pdf: { hash: parts.pack.hash, size: st.now.pdf.size, mtime: st.now.pdf.mtime },
                meta: st.now.meta, lang: st.now.lang,
            },
            fp: st.now.fp, by: String(P._version || ""), trigger: o.trigger || "open",
        });
        // Written only when the pack and the PDF are still what was read (a pack
        // rewritten meanwhile is computed again at the next need), by a live
        // instance no cleaning overtook, to a file nobody holds.
        let saved = false;
        if (path && status !== "io-error" && !(P._wvDlNoWrite && P._wvDlNoWrite.has(path))) {
            const st2 = await this._wvDlState(att);
            const same = !!st2 && st2.now.pack.size === st.now.pack.size && st2.now.pack.mtime === st.now.pack.mtime
                && st2.now.pdf.size === st.now.pdf.size && st2.now.pdf.mtime === st.now.pdf.mtime;
            if (same && !P._wvDestroyed && (P._wvDlGen || 0) === gen) {
                await wvStoreWrite(path, doc, { pretty: null, compress: true });
                saved = true;
            }
        }
        Zotero.debug("[Weavero] doc layer: " + att.libraryID + "/" + att.key + " computed (" + want.join("+") + ", " + c.how + ", "
            + Math.round(parts.ms || 0) + " ms)" + (saved ? ", saved" : path ? ", not saved" : ", not saved (no layer file for this library)"));
        return { doc, from: "computed", saved, how: c.how };
    }

    /** Computes `input.want` from the pack at `packPath` (or `bytes`): in the
     *  layer's worker, else -- `allowMain` -- on the main thread. Null when it
     *  could not run (no worker and not allowed, a job that timed out). */
    async _wvDlCompute(packPath: string, input: WvDlComputeInput, bytes: any, allowMain: boolean): Promise<{ parts: WvDlComputed; how: "worker" | "main" } | null> {
        const P: any = this;
        let u8: any = bytes ? (typeof bytes.byteOffset === "number" ? bytes : new Uint8Array(bytes)) : null;
        if (!u8) { try { u8 = await IOUtils.read(packPath); } catch (e) { return null; } }
        if (P._wvDestroyed) return null;
        const w = await this._wvDlWorkerRun(u8, input);
        if (w.ok) return { parts: w.out, how: "worker" };
        if (!w.unavailable) {
            Zotero.debug("[Weavero] doc layer: the worker could not compute " + packPath + ": " + w.error);
            return w.timeout ? null : { parts: { unusable: String(w.error || "worker error") }, how: "worker" };
        }
        if (!allowMain) return null;
        // No worker: on the main thread, as the outline was computed before the layer.
        let fresh = u8;
        if (!fresh || !fresh.byteLength) { try { fresh = await IOUtils.read(packPath); } catch (e) { return null; } }
        try {
            const rd = await wvSdtOpen(fresh);
            return { parts: await wvDlComputeParts(rd, input), how: "main" };
        }
        catch (e) { return { parts: { unusable: "pack unreadable: " + e }, how: "main" }; }
    }

    /** The outlines of attachment `att` from its layer (lib/outline-sdt.ts
     *  WvOlSdt), or null. */
    async _wvDlOutline(att: any): Promise<any> {
        const r = await this._wvDlGet(att, { trigger: "open", allowMain: true });
        return r && r.doc && r.doc.outline ? wvDlOutlineSdt(r.doc.outline) : null;
    }

    /** Trigger 1: Weavero's build has just written attachment `id`'s pack
     *  (`bytes`, when the build has them in memory): its layer now, in the
     *  worker -- never on the main thread (it comes at first need then). */
    async _wvDlAfterBuild(id: number, bytes?: any): Promise<void> {
        const P: any = this;
        try {
            if (P._wvDestroyed) return;
            const att = await Zotero.Items.getAsync(id);
            if (!att || typeof att.isPDFAttachment !== "function" || !att.isPDFAttachment()) return;
            if (this._wvDlSkipped(att.libraryID) || !this._wvDlLibSeg(att.libraryID)) return;
            // The parent's title and creators, which the outline reads (a group's
            // items are loaded lazily).
            try { if (att.parentID) { const p = await Zotero.Items.getAsync(att.parentID); if (p && typeof p.loadAllData === "function") await p.loadAllData(); } } catch (e) {}
            await this._wvDlGet(att, { trigger: "build", bytes: bytes || null, allowMain: false });
        } catch (e) { Zotero.debug("[Weavero] doc layer: after the build of " + id + ": " + e); }
    }

    // ---- the worker ---------------------------------------------------------------------

    /** `resource://weavero/`, mapped to the plugin's root (its XPI, or the
     *  build folder of a proxy install): a ChromeWorker loads its script only
     *  from a chrome: or resource: URL -- the plugin's own `jar:`/`file:` root
     *  and a blob: copy were both refused ("SecurityError: ChromeWorker
     *  constructor: Failed to load worker script", the spike of 2026-11-24 on
     *  11.0-beta.5). Set again whenever it is not this instance's root; given
     *  back in destroy() (`_wvDlDestroy`). "" when it cannot be set. */
    _wvDlResRoot(): string {
        const P: any = this;
        try {
            const root = String(P._rootURI || "");
            if (!root) return "";
            const rph = Services.io.getProtocolHandler("resource").QueryInterface((Components as any).interfaces.nsIResProtocolHandler);
            const want = Services.io.newURI(root);
            let cur: any = null;
            try { if (rph.hasSubstitution(DL_RES)) cur = rph.getSubstitution(DL_RES); } catch (e) {}
            if (!cur || cur.spec !== want.spec) rph.setSubstitution(DL_RES, want);
            P._wvDlResSet = root;
            return "resource://" + DL_RES + "/";
        } catch (e) {
            Zotero.debug("[Weavero] doc layer: no resource://" + DL_RES + "/: " + e);
            return "";
        }
    }

    /** The layer's ChromeWorker, made on first use from
     *  `resource://weavero/doc-layer-worker.js` (the script beside index.js),
     *  up once its first answer says Zotero's pack module loaded in it. Null
     *  when it cannot be had (then never tried again by this instance). */
    async _wvDlWorker(): Promise<any> {
        const P: any = this;
        if (P._wvDlW) return P._wvDlW;
        if (P._wvDestroyed || P._wvDlWBroken) return null;
        if (P._wvDlWMaking) return P._wvDlWMaking;
        const make = async (): Promise<any> => {
            if (typeof ChromeWorker !== "function") return null;
            const urls: Array<() => Promise<string>> = [
                async () => { const r = this._wvDlResRoot(); if (!r) throw new Error("no resource root"); return r + "doc-layer-worker.js"; },
            ];
            for (let i = 0; i < urls.length; i++) {
                let w: any = null;
                try {
                    const url = await urls[i]();
                    w = new ChromeWorker(url);
                    // Up only once its first answer comes: the script and Zotero's
                    // modules loaded (a refused script URL fires `error` instead).
                    const up = await new Promise<{ ok: boolean; error?: string }>((res) => {
                        const t = wvTimeout(() => res({ ok: false, error: "no answer in 20 s" }), 20000);
                        w.onmessage = (ev: any) => { wvClearTimeout(t); const d = ev && ev.data; res({ ok: !!(d && d.op === "pong" && d.ok), error: d && d.error }); };
                        w.onerror = (ev: any) => { wvClearTimeout(t); try { ev.preventDefault(); } catch (e) {} res({ ok: false, error: String((ev && ev.message) || "error") }); };
                        w.postMessage({ op: "ping" });
                    });
                    if (!up.ok) throw new Error(up.error || "no answer");
                    if (P._wvDestroyed) { try { w.terminate(); } catch (e) {} return null; }
                    w.onmessage = (ev: any) => this._wvDlWorkerMsg(w, ev);
                    w.onerror = (ev: any) => { try { ev.preventDefault(); } catch (e) {} this._wvDlWorkerEnd("error: " + ((ev && ev.message) || "?")); };
                    P._wvDlWUrlKind = "resource";
                    P._wvDlWorkersMade = (P._wvDlWorkersMade || 0) + 1;
                    Zotero.debug("[Weavero] doc layer: worker started");
                    return w;
                }
                catch (e) {
                    try { if (w) w.terminate(); } catch (e2) {}
                    Zotero.debug("[Weavero] doc layer: no worker: " + e);
                }
            }
            P._wvDlWBroken = true;
            return null;
        };
        const m = make();
        P._wvDlWMaking = m;
        try { P._wvDlW = await m; }
        finally { P._wvDlWMaking = null; }
        return P._wvDlW;
    }

    /** One job in the worker: `bytes` handed over (transferred), `input`. */
    async _wvDlWorkerRun(bytes: any, input: WvDlComputeInput): Promise<{ ok: boolean; out?: WvDlComputed; error?: string; unavailable?: boolean; timeout?: boolean }> {
        const P: any = this;
        const w = await this._wvDlWorker();
        if (!w) return { ok: false, unavailable: true, error: "no worker" };
        if (P._wvDestroyed) return { ok: false, unavailable: true, error: "destroyed" };
        wvClearTimeout(P._wvDlWIdleT); P._wvDlWIdleT = null;
        const jobs: Map<number, any> = P._wvDlJobs || (P._wvDlJobs = new Map());
        const id = (P._wvDlJobSeq = (P._wvDlJobSeq || 0) + 1);
        const u8: Uint8Array = bytes;
        const ab = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
        return new Promise((res) => {
            const t = wvTimeout(() => {
                if (!jobs.has(id)) return;
                jobs.delete(id);
                res({ ok: false, timeout: true, error: "the job took more than " + DL_JOB_MS / 1000 + " s" });
                this._wvDlWorkerEnd("a job timed out");
            }, DL_JOB_MS);
            jobs.set(id, { res, t });
            try { w.postMessage({ id, bytes: ab, input }, [ab]); }
            catch (e) { jobs.delete(id); wvClearTimeout(t); res({ ok: false, unavailable: true, error: String(e) }); }
        });
    }

    _wvDlWorkerMsg(w: any, ev: any) {
        const P: any = this;
        const d = ev && ev.data;
        const jobs: Map<number, any> | undefined = P._wvDlJobs;
        const j = d && jobs && jobs.get(d.id);
        if (!j) return;
        jobs!.delete(d.id);
        wvClearTimeout(j.t);
        j.res(d.ok ? { ok: true, out: d.out } : { ok: false, error: d.error });
        if (!jobs!.size && P._wvDlW === w) {
            wvClearTimeout(P._wvDlWIdleT);
            P._wvDlWIdleT = wvTimeout(() => { P._wvDlWIdleT = null; if (!(P._wvDlJobs && P._wvDlJobs.size)) this._wvDlWorkerEnd("idle"); }, DL_IDLE_MS);
        }
    }

    /** The worker ends: terminated, every job in hand answered "unavailable"
     *  (an open falls back to the main thread). The next job makes a new one. */
    _wvDlWorkerEnd(why: string) {
        const P: any = this;
        const w = P._wvDlW;
        P._wvDlW = null;
        wvClearTimeout(P._wvDlWIdleT); P._wvDlWIdleT = null;
        try { if (w) w.terminate(); } catch (e) {}
        const jobs: Map<number, any> | undefined = P._wvDlJobs;
        if (jobs) for (const [id, j] of Array.from(jobs)) { jobs.delete(id); wvClearTimeout(j.t); try { j.res({ ok: false, unavailable: true, error: "worker ended (" + why + ")" }); } catch (e) {} }
        if (w) Zotero.debug("[Weavero] doc layer: worker ended (" + why + ")");
    }

    // ---- Remove Built Data, destroy --------------------------------------------------------

    /** Remove Built Data (sdt-build.ts _wvSbCleanRun): every computation in
     *  flight writes nothing (the generation moves) and is forgotten. */
    _wvDlReset() {
        const P: any = this;
        P._wvDlGen = (P._wvDlGen || 0) + 1;
        try { if (P._wvDlInflight) P._wvDlInflight.clear(); } catch (e) {}
        P._wvDlNoWrite = null;
    }

    _wvDlDestroy() {
        const P: any = this;
        this._wvDlWorkerEnd("destroy");
        // resource://weavero/ given back -- when it is still this instance's root.
        try {
            if (P._wvDlResSet) {
                const rph = Services.io.getProtocolHandler("resource").QueryInterface((Components as any).interfaces.nsIResProtocolHandler);
                const cur = rph.hasSubstitution(DL_RES) ? rph.getSubstitution(DL_RES) : null;
                if (cur && cur.spec === Services.io.newURI(P._wvDlResSet).spec) rph.setSubstitution(DL_RES, null);
            }
        } catch (e) {}
        P._wvDlResSet = null;
        P._wvDlWBroken = false;
        P._wvDlInflight = null;
        P._wvDlNoWrite = null;
    }
}

const _dlDescriptors = Object.getOwnPropertyDescriptors(_DocLayerMixin.prototype);
delete (_dlDescriptors as any).constructor;
export const docLayerMethods = _dlDescriptors;
