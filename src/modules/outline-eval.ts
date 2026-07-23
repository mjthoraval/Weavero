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
        const state = this._wvOeScanState = { running: true, done: false, cancel: false, total: pdfs.length, idx: 0, lib };
        const protectTab = Tabs.selectedID;
        const sleep = (ms: number) => new Promise(r => win.setTimeout(r, ms));
        const getApp = (reader: any) => {
            const iw = reader && reader._iframeWindow;
            if (!iw) return null;
            return iw.PDFViewerApplication || (iw.wrappedJSObject && iw.wrappedJSObject.PDFViewerApplication) || null;
        };
        (async () => {
            try {
                for (state.idx = 0; state.idx < pdfs.length; state.idx++) {
                    if (state.cancel) break;
                    const att = pdfs[state.idx];
                    let tabID: any = null;
                    try {
                        let ftState: any = null;
                        try { ftState = await Zotero.FullText.getIndexedState(att); } catch (_) {}
                        const isScan = ftState === Zotero.FullText.INDEX_STATE_UNINDEXED || ftState === Zotero.FullText.INDEX_STATE_UNAVAILABLE;
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
                        const cls = this._wvOeClassifyTree(oc && oc.tree, isScan ? "scan" : ((oc && oc.source) || "unknown"), pages);
                        if (!this._wvOeRoot.classifications) this._wvOeRoot.classifications = {};
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
