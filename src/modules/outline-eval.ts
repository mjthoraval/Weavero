// Module: outline-eval — DEVELOPER-ONLY ground-truth collection for outline
// extraction quality. Hidden behind the `weavero.devOutlineEval` pref
// (default OFF); normal users never see it.
//
// Purpose: characterize where Zotero's outline pipeline (embedded outline,
// else the pdf.js typography extractor) fails on a real library, by letting
// a developer mark each inspected document Good / Bad / Scan and snapshotting
// the VERBATIM original outline at mark time. The developer then fixes bad
// outlines with Weavero's normal curation tools; the curated store
// (outlines.json) becomes the ground truth half of each labeled pair, and
// this store keeps the as-extracted half plus the verdict.
//
// HARD RULE: this module writes NOTHING to the user's library — no tags, no
// notes, no Extra-field edits. All eval state lives in its own JSON store:
//   <Zotero data dir>/weavero/outline-eval.json
//   { producer: "weavero", schemaVersion: 1, cases: {
//       "<libraryID>:<itemKey>": {
//           verdict: "good" | "bad" | "scan",
//           markedAt: ISO string,
//           source: "embedded" | "extracted",   // provenance at mark time
//           snapshot: [ { title, url?, position?, items: [...] } ],  // raw getOutline2 tree
//           pages: number | null,
//       } } }
//
// The offline census + scoring harness (work/eval/, not shipped) consumes
// this store together with outlines.json.

declare const Zotero: any;
declare const PathUtils: any;
declare const IOUtils: any;

class _OutlineEvalMixin {
    _wvOeRoot: any;
    _wvOeWriteChain: any;
    _wvOeScanState: any;

    /** Dev gate — every entry point checks this. Default OFF. */
    _wvOeEnabled(): boolean {
        try { return Zotero.Prefs.get("weavero.devOutlineEval") === true; } catch (_) { return false; }
    }

    /** Live tear-down when the dev pref toggles. Registered ONCE at startup
     *  (Prefs observers are global, not per-window). Without this, disabling
     *  `weavero.devOutlineEval` left the eval button in an open reader header and
     *  any active dev filter still filtering, until the next natural re-render.
     *  Reload-safe: unhooks a prior registration first. 2026-07-24. */
    _wvOeRegisterPrefObserver(this: any) {
        try {
            if (this._wvOePrefObsID != null) {
                try { Zotero.Prefs.unregisterObserver(this._wvOePrefObsID); } catch (_) {}
                this._wvOePrefObsID = null;
            }
            // Resolve the LIVE plugin at event time -- never close over `this`
            // (a reload would leave a stale reference behind).
            this._wvOePrefObsID = Zotero.Prefs.registerObserver("weavero.devOutlineEval", () => {
                const plugin = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                if (plugin) { try { plugin._wvOeOnPrefToggle(); } catch (_) {} }
            });
        } catch (e) { Zotero.debug("[Weavero] _wvOeRegisterPrefObserver err: " + e); }
    }

    _wvOeUnregisterPrefObserver(this: any) {
        try {
            if (this._wvOePrefObsID != null) {
                Zotero.Prefs.unregisterObserver(this._wvOePrefObsID);
                this._wvOePrefObsID = null;
            }
        } catch (_) {}
    }

    /** Clean tear-off / re-arm when the dev pref flips. On DISABLE, strip every
     *  filter group's dev-only tokens -- they can ONLY have been created while
     *  the pref was on (the facet UI is pref-gated), and `_filterState` is
     *  per-window in-memory (never persisted), so stripping here leaves no way
     *  for a dev filter to linger. Then refresh the live surfaces (filter bar,
     *  items list, open reader outline headers) whose dev bits are gated at
     *  render, so they appear on enable and vanish on disable immediately. */
    _wvOeOnPrefToggle(this: any) {
        try {
            const enabled = this._wvOeEnabled();
            const DEV_FIELDS = ["outlineClass", "outlineClassExclude", "outlineFlags",
                "outlineFlagsExclude", "outlineVerdict", "outlineVerdictExclude"];
            const scrub = (fs: any) => {
                if (!fs || !Array.isArray(fs.groups)) return;
                for (const g of fs.groups) {
                    for (const f of DEV_FIELDS) { if (Array.isArray(g[f]) && g[f].length) g[f] = []; }
                }
            };
            if (!enabled) {
                const wins = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()].filter(Boolean);
                for (const w of wins) { try { scrub((w as any)._wvFilterState); } catch (_) {} }
                try { scrub(this._wvFilterStateNoWin); } catch (_) {}
            }
            // Filter bar + items list (target the active window; groups scrubbed in
            // any OTHER window now carry no dev tokens, so their next render is
            // clean too). Prune groups left empty by the scrub.
            try { this._pruneEmptyGroups && this._pruneEmptyGroups(); } catch (_) {}
            try { this._renderFilterBar(); } catch (_) {}
            try { this._applyItemsListFilter({ cascade: true }); } catch (_) {}
            // Reader outline headers: the eval button (and the dev chip-menu
            // reachability) are pref-gated at render, so a re-render flips them.
            try {
                for (const rd of ((Zotero.Reader && (Zotero.Reader as any)._readers) || [])) {
                    try {
                        const iwin = rd._iframeWindow || (rd._iframe && rd._iframe.contentWindow);
                        const idoc = iwin && iwin.document;
                        if (idoc && idoc.querySelector(".wv-outline-reader-view")) this._wvReaderRenderOutline(rd, idoc);
                    } catch (_) {}
                }
            } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOeOnPrefToggle err: " + e); }
    }

    _wvOeFilePath(): string {
        return PathUtils.join(Zotero.DataDirectory.dir, "weavero", "outline-eval.json");
    }

    async _wvOeInit(this: any) {
        if (this._wvOeRoot) return;
        try {
            const raw = await IOUtils.readUTF8(this._wvOeFilePath());
            const d = JSON.parse(raw);
            if (d && typeof d === "object" && d.cases) {
                if (!d.classifications) d.classifications = {};   // schema v2 backfill
                this._wvOeRoot = d;
                return;
            }
        } catch (_) {}
        this._wvOeRoot = { producer: "weavero", schemaVersion: 2, cases: {}, classifications: {} };
    }

    _wvOePersist(this: any) {
        if (!this._wvOeRoot) return Promise.resolve();
        const snapshot = JSON.stringify(this._wvOeRoot, null, 2);
        const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero");
        const path = this._wvOeFilePath();
        this._wvOeWriteChain = (this._wvOeWriteChain || Promise.resolve())
            .then(async () => {
                await IOUtils.makeDirectory(dir, { ignoreExisting: true });
                await IOUtils.writeUTF8(path, snapshot, { tmpPath: path + ".tmp" });
            })
            .catch((e: any) => Zotero.debug("[Weavero] outline-eval persist failed: " + e));
        return this._wvOeWriteChain;
    }

    /** The recorded case for an attachment, or null. */
    _wvOeCase(this: any, libraryID: number, itemKey: string): any {
        const r = this._wvOeRoot;
        return (r && r.cases && r.cases[libraryID + ":" + itemKey]) || null;
    }

    /** Mark the CURRENT reader document Good/Bad/Scan, snapshotting the raw
     *  original outline tree + provenance at this moment (independent of any
     *  curation before or after -- the snapshot is always the ORIGINAL
     *  source, fetched fresh, never the curated view). */
    async _wvOeMark(this: any, reader: any, idoc: any, verdict: "good" | "bad" | "scan") {
        try {
            if (!this._wvOeEnabled()) return;
            const att = (this as any)._wvReaderAtt(reader);
            if (!att) return;
            await this._wvOeInit();
            // Fresh original tree (embedded-else-extracted), deep-copied plain.
            let cache = reader._wvOutlineCache;
            if (!cache || !cache.tree) {
                try { cache = await (this as any)._wvReaderFetchOutline(reader); reader._wvOutlineCache = cache; } catch (_) {}
            }
            let pages: number | null = null;
            try {
                const ir = reader._internalReader;
                const pv = ir && (ir._primaryView || ir._lastView);
                pages = pv && pv._iframeWindow && pv._iframeWindow.PDFViewerApplication
                    ? pv._iframeWindow.PDFViewerApplication.pagesCount : null;
            } catch (_) {}
            this._wvOeRoot.cases[att.libraryID + ":" + att.itemKey] = {
                verdict,
                markedAt: new Date().toISOString(),
                source: (cache && cache.source) || "extracted",
                snapshot: (cache && cache.tree) ? JSON.parse(JSON.stringify(cache.tree)) : [],
                pages,
            };
            await this._wvOePersist();
            try { (this as any)._wvReaderPanelNote(idoc, "Eval: marked " + verdict.toUpperCase() + " (" + Object.keys(this._wvOeRoot.cases).length + " cases recorded)"); } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOeMark err: " + e); }
    }

    /** Counts by verdict, for the menu / quick status. */
    _wvOeStats(this: any): any {
        const out: any = { good: 0, bad: 0, scan: 0, total: 0 };
        const r = this._wvOeRoot;
        if (r && r.cases) {
            for (const k of Object.keys(r.cases)) {
                out.total++;
                const v = r.cases[k].verdict;
                if (out[v] != null) out[v]++;
            }
        }
        return out;
    }

    /** Clear the CURRENT document's verdict back to "not marked" (delete the
     *  case). Mirrors _wvOeMark's shape so the header button can refresh. */
    async _wvOeUnmark(this: any, reader: any, idoc: any) {
        try {
            if (!this._wvOeEnabled()) return;
            const att = this._wvReaderAtt(reader);
            if (!att) return;
            await this._wvOeInit();
            const k = att.libraryID + ":" + att.itemKey;
            if (this._wvOeRoot.cases && this._wvOeRoot.cases[k]) {
                delete this._wvOeRoot.cases[k];
                await this._wvOePersist();
            }
            try { this._wvReaderPanelNote(idoc, "Eval: cleared mark"); } catch (_) {}
        } catch (e) { Zotero.debug("[Weavero] _wvOeUnmark err: " + e); }
    }

    /** Front/end-matter heading test -- not real body structure. */
    _wvOeIsBackMatter(t: string): boolean {
        return /^\s*(acknowledg|reference|bibliograph|data availab|supplement|declaration|credit\b|competing interest|conflict of interest|author contribution|funding|appendix|appendices|supporting information)/i.test(String(t || ""));
    }

    /** Classify an outline tree into {source, nodes, top, depth, flags, pages}.
     *  Pure; `source` is the caller's provenance ("embedded"/"extracted"/"scan").
     *  Reuses `_wvTitleSpacingSuspect` (on the prototype) for the spacing flag. */
    _wvOeClassifyTree(this: any, tree: any[], source: string, pages: number | null): any {
        const flat: string[] = [];
        const walk = (ns: any[], d: number): number => {
            let maxD = d;
            for (const n of (ns || [])) {
                flat.push(String(n && n.title != null ? n.title : ""));
                maxD = Math.max(maxD, walk(n && n.items, d + 1));
            }
            return maxD;
        };
        const depth = tree && tree.length ? walk(tree, 0) + 1 : 0;
        const nodes = flat.length;
        const top = (tree || []).length;
        let src = source || "unknown";
        if (nodes === 0 && src !== "scan") src = "empty";
        const flags: string[] = [];
        const nonBack = flat.filter(t => t.trim() && !this._wvOeIsBackMatter(t));
        if (nodes > 0 && nonBack.length === 0) flags.push("content-empty");
        if (flat.some(t => /&[a-z][a-z0-9]*;/i.test(t))) flags.push("entity-leak");
        if (flat.some(t => /[\r\n\t]/.test(t) || /\s{2,}/.test(t) || /^\s|\s$/.test(t))) flags.push("ws-junk");
        if (flat.some(t => /^\s*(fig(ure)?|table|scheme|plate)\b/i.test(t))) flags.push("fig-table");
        try { if (flat.some(t => this._wvTitleSpacingSuspect({ title: t }))) flags.push("spacing"); } catch (_) {}
        return { source: src, nodes, top, depth, flags, pages: pages == null ? null : pages };
    }

    async _wvOeSetClassification(this: any, libraryID: number, itemKey: string, cls: any) {
        try {
            await this._wvOeInit();
            if (!this._wvOeRoot.classifications) this._wvOeRoot.classifications = {};
            this._wvOeRoot.classifications[libraryID + ":" + itemKey] = Object.assign({ at: new Date().toISOString() }, cls);
            await this._wvOePersist();
        } catch (e) { Zotero.debug("[Weavero] _wvOeSetClassification err: " + e); }
    }

    _wvOeGetClassification(this: any, libraryID: number, itemKey: string): any {
        const r = this._wvOeRoot;
        return (r && r.classifications && r.classifications[libraryID + ":" + itemKey]) || null;
    }

    _wvOeScanCancel(this: any) { if (this._wvOeScanState) this._wvOeScanState.cancel = true; }

    /** Dev-only: classify every PDF attachment in a library by opening each in a
     *  background reader, fetching its outline, classifying, and closing -- the
     *  proven eval-session loop. Writes NOTHING to the library. Progress + cancel
     *  live on `_wvOeScanState`; the user's active tab is protected. */
    async _wvOeScanLibrary(this: any, libraryID?: number) {
        if (!this._wvOeEnabled()) return null;
        if (this._wvOeScanState && this._wvOeScanState.running) return this._wvOeScanState;
        const win = Zotero.getMainWindow();
        if (!win) return null;
        const Tabs = win.Zotero_Tabs;
        const lib = libraryID != null ? libraryID
            : ((win.ZoteroPane && win.ZoteroPane.getSelectedLibraryID && win.ZoteroPane.getSelectedLibraryID()) || Zotero.Libraries.userLibraryID);
        await this._wvOeInit();
        const items = await Zotero.Items.getAll(lib);
        const pdfs = items.filter((it: any) => it.isPDFAttachment && it.isPDFAttachment());
        const state = this._wvOeScanState = { running: true, done: false, cancel: false,
            phase: "quick", lib, quickIdx: 0, quickTotal: pdfs.length, idx: 0, total: pdfs.length };
        const protectTab = Tabs.selectedID;
        const sleep = (ms: number) => new Promise(r => win.setTimeout(r, ms));
        const getApp = (reader: any) => {
            const iw = reader && reader._iframeWindow;
            if (!iw) return null;
            return iw.PDFViewerApplication || (iw.wrappedJSObject && iw.wrappedJSObject.PDFViewerApplication) || null;
        };
        (async () => {
            try {
                if (!this._wvOeRoot.classifications) this._wvOeRoot.classifications = {};
                // PHASE 1 -- QUICK: a cheap text/scan signal for every PDF, NO readers
                // opened. Image-only PDFs (no full-text index) are classified "scan"
                // immediately -- so the facet + counts populate in seconds -- and are
                // then skipped by the heavy pass. NOTE: this reuses the existing
                // "unindexed => scan" heuristic, so a text PDF that merely hasn't been
                // indexed yet is treated as a scan (same outcome the full pass gave it
                // before -- source "scan" either way); it just won't get outline flags.
                const skip = new Set();
                for (state.quickIdx = 0; state.quickIdx < pdfs.length; state.quickIdx++) {
                    if (state.cancel) break;
                    const att = pdfs[state.quickIdx];
                    try {
                        let ftState: any = null;
                        try { ftState = await Zotero.FullText.getIndexedState(att); } catch (_) {}
                        const isScan = ftState === Zotero.FullText.INDEX_STATE_UNINDEXED || ftState === Zotero.FullText.INDEX_STATE_UNAVAILABLE;
                        if (isScan) {
                            skip.add(att.id);
                            const cls = this._wvOeClassifyTree([], "scan", null);
                            this._wvOeRoot.classifications[att.libraryID + ":" + att.key] = Object.assign({ at: new Date().toISOString(), quick: true }, cls);
                        }
                    } catch (_) {}
                    if ((state.quickIdx % 25) === 0) { try { await this._wvOePersist(); } catch (_) {} }
                }
                try { await this._wvOePersist(); } catch (_) {}
                if (state.cancel) return;
                // PHASE 2 -- FULL: open each remaining (text) PDF, fetch + classify its
                // real outline (embedded / extracted / empty + flags). Skips the
                // quick-classified scans, so the slow pass is shorter too.
                state.phase = "full";
                const todo = pdfs.filter((a: any) => !skip.has(a.id));
                state.total = todo.length;
                for (state.idx = 0; state.idx < todo.length; state.idx++) {
                    if (state.cancel) break;
                    const att = todo[state.idx];
                    let tabID: any = null;
                    try {
                        let opened: any = null;
                        for (let a = 0; a < 4 && !opened; a++) {
                            try { opened = await Zotero.Reader.open(att.id, null, { openInBackground: true }); } catch (_) {}
                            if (!opened) await sleep(600);
                        }
                        if (!opened) throw new Error("open failed");
                        tabID = opened.tabID;
                        const t0 = Date.now();
                        let pdfDoc: any = null;
                        while (Date.now() - t0 < 45000) {
                            const rd = Zotero.Reader.getByTabID(tabID);
                            const app = getApp(rd);
                            if (app && app.pdfDocument && typeof app.pdfDocument.getOutline === "function") { pdfDoc = app.pdfDocument; break; }
                            await sleep(200);
                        }
                        const rd = Zotero.Reader.getByTabID(tabID);
                        const oc = rd ? await this._wvReaderFetchOutline(rd) : null;
                        const pages = pdfDoc ? pdfDoc.numPages : null;
                        const cls = this._wvOeClassifyTree(oc && oc.tree, (oc && oc.source) || "unknown", pages);
                        this._wvOeRoot.classifications[att.libraryID + ":" + att.key] = Object.assign({ at: new Date().toISOString() }, cls);
                    } catch (e) { Zotero.debug("[Weavero] _wvOeScanLibrary item err: " + e); }
                    finally { if (tabID && tabID !== protectTab) { try { Tabs.close(tabID); } catch (_) {} } }
                    try { if (Tabs.selectedID !== protectTab) Tabs.select(protectTab); } catch (_) {}
                    if ((state.idx % 5) === 0) { try { await this._wvOePersist(); } catch (_) {} }
                    await sleep(150);
                }
            } finally {
                state.running = false; state.done = true;
                try { await this._wvOePersist(); } catch (_) {}
            }
        })();
        return state;
    }
}

const _outlineEvalDescriptors = Object.getOwnPropertyDescriptors(_OutlineEvalMixin.prototype);
delete (_outlineEvalDescriptors as any).constructor;
export const outlineEvalMethods = _outlineEvalDescriptors;
