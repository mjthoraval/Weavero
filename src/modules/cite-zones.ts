// WV-TEMP-CITEZONES (upstream register #76; MJT 2026-11-25): one hover and
// click area per in-text citation in a PDF. The rules and their reasons are in
// lib/cite-zones.ts; this applies them to the reader's page data.
//
// WHERE. Zotero 11 builds a page's areas in PDFDocumentData._composePage
// (reader pdf-document-data.mjs), the one place both page publishes pass
// through: the PDF's own links arriving (ensurePage -> publish) and the
// structure data arriving (_runSemanticEntry). Its result is the page object
// the view reads (`pv._pdfPages` is `documentData.pages`): the hover
// (_getSelectableOverlay), the click (_handlePointerUp), the keyboard stops
// (_focusNext) and the citation colour (page.js isTextColorOverlay). Wrapping
// it covers all of them, and a page published again is fixed again. The
// structure data's own overlays are never changed: the fix returns a new page
// object with a new overlay list, built in the reader's compartment
// (resource://zotero, not a system principal) so the reader can read it.
//
// Zotero 10 has no structure-data citations (no _documentData): nothing is
// installed there. Pages already composed when the view is wired are composed
// again, as _runSemanticEntry does.
//
// Private reader members: view._documentData (_composePage, pages,
// _basicPages, _semanticPages, _onPageData), page.overlays (type, source,
// references[].text, position.rects), page.chars (c, rect, fontSize).
// Shutdown: reader.ts _wvReaderUnwireInternals unwraps and composes again.
// Tripwire: test/cite-zones.spec.js.

import { wvUnwrap, wvWrap } from "../lib/wrap";
import { WvCzChar, WvCzOverlay, wvCiteZonesPlan } from "../lib/cite-zones";
import { wvCloneFor } from "../lib/xray";

declare const Zotero: any;
declare const Components: any;

const LAYER = "citeZones";

function livePlugin(): any {
    const p: any = Zotero.Weavero && Zotero.Weavero.plugin;
    return p && !p._wvDestroyed ? p : null;
}

function rect4(r: any): number[] | null {
    try {
        if (!r || r.length < 4) return null;
        const a = [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3])];
        if (!a.every(Number.isFinite)) return null;
        return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])];
    }
    catch (e) { return null; }
}

function rectsOf(pos: any): number[][] {
    const out: number[][] = [];
    try {
        const rs = pos && pos.rects;
        const n = rs ? rs.length : 0;
        for (let i = 0; i < n; i++) { const r = rect4(rs[i]); if (r) out.push(r); }
    }
    catch (e) {}
    return out;
}

class _CiteZonesMixin {
    [k: string]: any;

    /** The fixed page, or null when nothing changes. `page` is the reader's. */
    _wvCzFix(page: any): any {
        const Cu = Components.utils;
        if (!page || typeof page !== "object") return null;
        page = Cu.waiveXrays(page);
        const ovs = page.overlays;
        const n = ovs ? Number(ovs.length) : 0;
        if (!n) return null;
        const plain: WvCzOverlay[] = [];
        let any = false;
        for (let i = 0; i < n; i++) {
            const o = ovs[i];
            const type = String((o && o.type) || "");
            let sig = "", refText = "";
            if (type === "citation") {
                any = true;
                try {
                    const refs = o.references;
                    const parts: string[] = [], texts: string[] = [];
                    for (let k = 0; k < Number(refs.length); k++) {
                        const r = refs[k];
                        const t = String((r && r.text) || "");
                        const p0 = r && r.position && r.position.rects && rect4(r.position.rects[0]);
                        parts.push(t.slice(0, 200) + "@" + (r && r.position ? r.position.pageIndex : "") + ":" + (p0 ? p0.map(Math.round).join(",") : ""));
                        texts.push(t);
                    }
                    sig = parts.join("|");
                    refText = texts.join(" ");
                }
                catch (e) { sig = ""; }
            }
            plain.push({ type, source: String((o && o.source) || ""), sig, rects: rectsOf(o && o.position), refText });
        }
        if (!any) return null;
        // The characters near a citation's lines only: a page has thousands.
        const bands = plain.filter((o) => o.type === "citation").flatMap((o) => o.rects);
        const chars: WvCzChar[] = [];
        try {
            const cs = page.chars;
            const m = cs ? Number(cs.length) : 0;
            for (let i = 0; i < m; i++) {
                const ch = cs[i];
                const r = rect4(ch && ch.rect);
                if (!r) continue;
                if (!bands.some((b) => Math.min(b[3], r[3]) - Math.max(b[1], r[1]) > 0)) continue;
                chars.push({ c: String(ch.c || ""), r, fs: Number(ch.fontSize) || (r[3] - r[1]) });
            }
        }
        catch (e) {}
        const plan = wvCiteZonesPlan(plain, chars);
        if (!plan.some((p) => p !== undefined)) return null;
        // Built in the reader's compartment, from the reader's own values.
        const g = Cu.getGlobalForObject(page);
        const W = Cu.waiveXrays(g);
        const list = Cu.waiveXrays(new W.Array());
        for (let i = 0; i < n; i++) {
            const p = plan[i];
            if (p === null) continue;
            const src = ovs[i];
            if (p === undefined) { list.push(src); continue; }
            const o = Cu.waiveXrays(new W.Object());
            for (const k of Object.keys(src)) if (k !== "position") o[k] = src[k];
            const pos = Cu.waiveXrays(wvCloneFor({ pageIndex: Number(src.position.pageIndex), rects: p }, g));
            for (const k of Object.keys(src.position)) if (k !== "rects" && k !== "pageIndex") pos[k] = src.position[k];
            o.position = pos;
            o._wvCiteZone = true;
            list.push(o);
        }
        const out = Cu.waiveXrays(new W.Object());
        for (const k of Object.keys(page)) out[k] = page[k];
        out.overlays = list;
        return out;
    }

    /** Wire one reader's views (primary, and the split view's second). Retries
     *  while the view is not built yet. */
    _wvWireCiteZones(reader: any, tries = 0) {
        try {
            const ir = reader && reader._internalReader;
            const views = ir ? [ir._primaryView, ir._secondaryView].filter(Boolean) : [];
            const pdf = views.filter((v: any) => v && v._documentData && typeof v._documentData._composePage === "function");
            if (!pdf.length) {
                const isEpubOrSnap = views.some((v: any) => v && !v._documentData && v._iframeWindow && !v._iframeWindow.PDFViewerApplication);
                if (!isEpubOrSnap && tries < 40) {
                    const w = Zotero.getMainWindow && Zotero.getMainWindow();
                    if (w) w.setTimeout(() => { const p = livePlugin(); if (p) p._wvWireCiteZones(reader, tries + 1); }, 250);
                }
                return;
            }
            const tag = this._wvWireTag();
            for (const v of pdf) {
                const dd = v._documentData;
                const fresh = !(dd._wvWraps && dd._wvWraps._composePage);
                wvWrap(dd, "_composePage", LAYER, tag, (orig: any) => function (this: any, ...args: any[]) {
                    // Spread, never apply(this, args): the reader's code cannot read a
                    // chrome array ("Permission denied to access property length",
                    // every page compose failed on 11.0-beta.5, 2026-11-26).
                    const page = orig.call(this, ...args);
                    try {
                        const p = livePlugin();
                        const fixed = p && p._wvCzFix(page);
                        if (fixed) return fixed;
                    }
                    catch (e) { Zotero.debug("[Weavero] cite zones: " + e); }
                    return page;
                });
                if (fresh) this._wvCzRecompose(dd);
            }
        }
        catch (e) { Zotero.debug("[Weavero] cite zones wire err: " + e); }
    }

    /** Compose again the pages that already have their structure data. */
    _wvCzRecompose(dd: any) {
        try {
            const sem = dd._semanticPages || {};
            for (const key of Object.keys(sem)) {
                const i = Number(key);
                if (!dd.pages[i] || !dd._basicPages || !dd._basicPages[i]) continue;
                dd.pages[i] = dd._composePage(i, dd._basicPages[i]);
                if (typeof dd._onPageData === "function") dd._onPageData(i, dd.pages[i], wvCloneFor({ semanticChanged: true }, Components.utils.getGlobalForObject(dd)));
            }
        }
        catch (e) { Zotero.debug("[Weavero] cite zones recompose err: " + e); }
    }
}

const _citeZonesDescriptors = Object.getOwnPropertyDescriptors(_CiteZonesMixin.prototype);
delete (_citeZonesDescriptors as any).constructor;
export const citeZonesMethods = _citeZonesDescriptors;
