// Module: the reference entry in a link preview (MJT 2026-11-17).
//
// Zotero's internal-link preview (pdf-view.js _openOverlayPopup ->
// pdf-renderer.js renderPreviewPage) is a picture of the destination page
// with ONE mark: rects[0] of the destination position filled with #f57b7b in
// 'multiply' mode. On a reference list that is the first line of the entry
// in a dark red box, hard to read, and the rest of the entry unmarked ("the
// red line is too dark ... I would prefer if it could highlight the whole
// citation rather than just the first line", MJT with 11.0-beta.4 on a
// Physical Review Research paper). His picks:
//   - Weavero redraws the picture;
//   - a LIGHT red tint (Zotero's #f57b7b at 25 %, plain source-over, not
//     multiply) over EVERY line of the target's reference entry;
//   - a target whose entry cannot be found keeps its own line(s) under the
//     same tint;
//   - a POINT target (Zotero's 7-px dot: the rect under 5 px either way at the
//     render scale) stays as Zotero draws it.
//
// UPSTREAM CONSTRAINT -- revisit if Zotero changes renderPreviewPage: Zotero's
// renderer marks only rects[0], with a multiply fill (pdf-renderer.js
// renderPreviewPage, mirror 2026-11-10). The picture is rendered again here
// with Zotero's own geometry -- scale = devicePixelRatio x the boosted zoom,
// capped by maxCanvasPixels; the renderer's own _trimCanvas with its 15-px
// padding; x / y = the centre of rects[0] -- so the popup keeps its size and
// Weavero's link zones (reader.ts _wvPreviewInjectZones, which mirrors the
// same math) still land on the DOIs. If Zotero starts marking the whole entry
// itself, this module can go. Register: work/upstream-collision-checklist.md.
//
// Where the entry comes from, first that answers:
//   1. the reader's own page data (view._pdfPages[*].overlays), an entry
//      whose rects hold the target: a citation overlay's reference (Zotero 11:
//      the SDT reference block, one rect per line; Zotero 10.0.8: the entry's
//      bounding box), a 'reference' overlay (Zotero 10.0.8, on the reference
//      page, the same box), or a 'matched' internal link (Zotero 11) --
//      measured on both 2026-11-17 with the spec's fixture;
//   2. a 'matched' popup's own destination rects (the entry, Zotero 11);
//   3. the page's text geometry (_wvPrevHlEntryFromLines): the target line
//      and the lines after it in the same column, until the next entry's
//      label ("[24]", "24.", "(24)"), a line back at the margin when the
//      entry has a hanging indent, a gap wider than a line, or 12 lines.
//      With neither a label nor a hanging indent nothing tells the entries
//      apart, and only the target line is taken.
// One column only: an entry going on in the next column or on the next page
// is cut where the column ends (the picture shows one page anyway).
//
// A destination that holds the hovered link itself is not where the link
// goes, and the page is shown with NO mark (MJT 2026-11-17: "The link to
// Figure 4(b) highlights a full paragraph of the main text"). Zotero 11's
// text matcher ('matched', semantic-overlays.mjs) had sent "Fig. 4(b)" in a
// Physical Review Research paper to the 26-line paragraph the link is written
// in; Zotero alone boxes that paragraph's first line, Weavero would tint all
// of it. Both point at the wrong place.

import { wvTimeout, wvClearTimeout } from "../lib/timers";
import { wvCloneFor } from "../lib/xray";

declare const Zotero: any;
declare const Components: any;

/** How long Zotero's own popup waits for Weavero's picture before it is shown
 *  as Zotero made it. Rendering the page again costs what Zotero's own render
 *  cost; past this the user would wait longer than a hover deserves. */
export const WV_PREVHL_HOLD_MS = 1500;
/** Zotero's red (pdf-renderer.js) at 25 %. */
export const WV_PREVHL_TINT = "rgba(245, 123, 123, 0.25)";
/** At most this many lines in one entry (a runaway guard). */
const WV_PREVHL_MAX_LINES = 12;

interface WvPrevHlLine { text: string; rect: number[]; fs: number; rot: number }

const LABELS: { [k: string]: RegExp } = {
    bracket: /^\s*\[\s*\d{1,4}[a-z]?\s*\]/,
    // Not "2.5": pdf.js gives a line's spaces only where it saw a word gap.
    dot: /^\s*\d{1,4}\.(?!\d)/,
    paren: /^\s*\(\s*\d{1,4}[a-z]?\s*\)/,
};

const num = (v: any) => Number(v);
const rect4 = (r: any): number[] | null => {
    try {
        if (!r || r.length < 4) return null;
        const a = [num(r[0]), num(r[1]), num(r[2]), num(r[3])];
        if (!a.every(Number.isFinite)) return null;
        return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])];
    }
    catch (e) { return null; }
};
const rectsOf = (pos: any): number[][] => {
    const out: number[][] = [];
    try {
        const rs = pos && pos.rects;
        const n = rs ? rs.length : 0;
        for (let i = 0; i < n; i++) { const r = rect4(rs[i]); if (r) out.push(r); }
    }
    catch (e) {}
    return out;
};
/** Do `r` and `t` share a line: they cross, and the shared height is at
 *  least half the lower of the two. */
const sameLine = (r: number[], t: number[]) => {
    const ix = Math.min(r[2], t[2]) - Math.max(r[0], t[0]);
    const iy = Math.min(r[3], t[3]) - Math.max(r[1], t[1]);
    if (ix <= 0 || iy <= 0) return false;
    return iy >= 0.5 * Math.min(r[3] - r[1], t[3] - t[1]);
};
const area = (rs: number[][]) => rs.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0);

class _PreviewHighlightMixin {
    [k: string]: any;

    /** Is `popup` (what pdf-view hands its `_onSetOverlayPopup`) an
     *  internal-link preview this module redraws? Cheap: no await. A point
     *  target (Zotero's own `_getPositionFromDestination` makes [x, y, x, y])
     *  is left to Zotero at once; a rect that is only under 5 px at the render
     *  scale is found out in _wvPrevHlBuild. */
    _wvPrevHlWanted(this: any, popup: any): boolean {
        try {
            if (!popup || popup.type !== "internal-link" || typeof popup.image !== "string" || !popup.image) return false;
            if (!this._wvPref("previewEntryHighlight")) return false;
            const d = popup.destinationPosition;
            if (!d || !Number.isInteger(num(d.pageIndex))) return false;
            const r = rectsOf(d)[0];
            return !!r && r[2] - r[0] > 0 && r[3] - r[1] > 0;
        }
        catch (e) { return false; }
    }

    /** Hold Zotero's popup until Weavero's picture is ready, then hand it on
     *  through `deliver` -- with Weavero's picture, or as Zotero made it when
     *  the picture failed or took longer than WV_PREVHL_HOLD_MS. Showing
     *  Zotero's first and swapping later would flash the dark box. `seq` is
     *  the view's `_wvPrevHlSeq` for this call: any later call of the wrapper
     *  (another popup, a close) bumps it, and this one is then dropped. */
    _wvPrevHlHold(this: any, reader: any, pv: any, popup: any, seq: number, deliver: (p: any) => void): void {
        const v = (Components as any).utils.waiveXrays(pv);
        let rev: any = null;
        try { rev = v._overlayRevision; } catch (e) {}
        // WV-TEMP-134821: Zotero 11's text matcher sent the link to the text it is
        // written in, while the PDF has its own link on that spot -- that one is shown.
        const alt = this._wvPrevHlSelfLinkAlt(pv, popup);
        if (alt) {
            this._wvPrevHlShowOwnLink(pv, popup, alt, rev, seq, deliver);
            return;
        }
        let done = false;
        let timer: any = null;
        const finish = (pic: any) => {
            if (done) return;
            done = true;
            wvClearTimeout(timer);
            // Superseded, or the view moved on as Zotero's own check after its
            // render would have found (pdf-view.js _openOverlayPopup: the
            // overlay revision), or the view is gone: dropped.
            try { if (seq !== pv._wvPrevHlSeq || v._destroyed || v._overlayRevision !== rev) return; } catch (e) { return; }
            if (pic) {
                try {
                    const w = (Components as any).utils.waiveXrays(popup);
                    w.image = pic.image;
                    w.width = pic.width;
                    w.height = pic.height;
                    w.x = pic.x;
                    w.y = pic.y;
                }
                catch (e) { Zotero.debug("[Weavero] preview highlight: popup not updated: " + e); }
            }
            try { deliver(popup); } catch (e) { Zotero.debug("[Weavero] preview highlight: deliver err: " + e); }
        };
        timer = wvTimeout(() => finish(null), WV_PREVHL_HOLD_MS);
        let job: Promise<any>;
        try { job = this._wvPrevHlBuild(reader, pv, popup); }
        catch (e) { job = Promise.resolve(null); }
        job.then((pic: any) => finish(pic), (e: any) => {
            Zotero.debug("[Weavero] preview highlight: build err: " + e);
            finish(null);
        });
    }

    /** The preview picture again, without Zotero's mark and with the entry's
     *  lines tinted: `{ image, width, height, x, y }` as renderPreviewPage
     *  returns it, or null (Zotero's own picture stays). */
    async _wvPrevHlBuild(this: any, reader: any, pv: any, popup: any): Promise<any> {
        const Cu = (Components as any).utils;
        const v = Cu.waiveXrays(pv);
        const dest = popup.destinationPosition;
        const pageIndex = num(dest.pageIndex);
        const target = rectsOf(dest);
        if (!target.length) return null;
        const iwin = pv._iframeWindow;
        const app = Cu.waiveXrays(iwin.PDFViewerApplication);
        const renderer = v._pdfRenderer;
        if (!app || !app.pdfDocument || !app.pdfViewer || !renderer || typeof renderer._trimCanvas !== "function") return null;
        const page = Cu.waiveXrays(await app.pdfDocument.getPage(pageIndex + 1));
        if (this._wvDestroyed) return null;
        // pdf-renderer.js renderPreviewPage's geometry, step by step. `window`
        // there is the reader's page (reader.html), whose devicePixelRatio
        // this is.
        const rwin = reader && reader._iframeWindow;
        const dpr = num((rwin && rwin.devicePixelRatio) || iwin.devicePixelRatio || 1);
        const viewer = app.pdfViewer;
        const cur = num(viewer._currentScale);
        const extra = cur > 1 ? 1 + (cur - 1) * 1.8 : cur;
        let scale = dpr * extra;
        const vp1 = Cu.waiveXrays(page.getViewport(wvCloneFor({ scale: 1 }, iwin)));
        const maxScale = Math.sqrt(num(viewer.maxCanvasPixels) / (num(vp1.width) * num(vp1.height)));
        if (scale > maxScale) scale = maxScale;
        if (!(scale > 0)) return null;
        const vp = Cu.waiveXrays(page.getViewport(wvCloneFor({ scale }, iwin)));
        const toVp = (r: number[]): number[] => {
            const a = Cu.waiveXrays(vp.convertToViewportPoint(r[0], r[1]));
            const b = Cu.waiveXrays(vp.convertToViewportPoint(r[2], r[3]));
            return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        };
        const t0 = toVp(target[0]);
        // Zotero's point test (a dot, not a box): left to Zotero.
        if (t0[2] - t0[0] < 5 || t0[3] - t0[1] < 5) return null;
        const w = num(vp.width), h = num(vp.height);
        if (!w || !h) return null;

        const entry = await this._wvPrevHlEntryRects(pv, popup, pageIndex, target);
        if (this._wvDestroyed || !entry || !entry.rects.length) return null;
        // The link's own block is no destination: no mark (module header).
        const selfLink = this._wvPrevHlHoldsLink(popup, pageIndex, entry.rects.concat(target));
        const marks = selfLink ? [] : entry.rects;

        // Through the Xray (unwaived): the context's options dictionary is
        // then read on this side; a waived call hands content a chrome object
        // it cannot read. Same document as renderPreviewPage's canvas.
        const idoc = Cu.unwaiveXrays(Cu.waiveXrays(iwin).document);
        const canvas = idoc.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!ctx) return null;
        try {
            canvas.width = w;
            canvas.height = h;
            const rc = Cu.waiveXrays(wvCloneFor({}, iwin));
            rc.canvasContext = Cu.waiveXrays(ctx);
            rc.viewport = vp;
            await page.render(rc).promise;
            if (this._wvDestroyed) return null;
            const trimmed = Cu.waiveXrays(renderer._trimCanvas(canvas, ctx, 15));
            const tr = rect4(trimmed && trimmed.rect);
            if (!tr) return null;
            const out = Cu.unwaiveXrays(trimmed.canvas) || canvas;
            // One path, one fill: where two padded lines overlap the tint is
            // laid once, never twice as dark.
            if (marks.length) {
                ctx.globalCompositeOperation = "source-over";
                ctx.fillStyle = WV_PREVHL_TINT;
                ctx.beginPath();
                for (const r of marks) {
                    const pad = Math.min(2, (r[3] - r[1]) * 0.15);
                    const q = toVp([r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad]);
                    ctx.rect(q[0] - tr[0], q[1] - tr[1], q[2] - q[0], q[3] - q[1]);
                }
                ctx.fill();
            }
            const image = out.toDataURL("image/png", 1);
            const res = {
                image,
                width: out.width / dpr,
                height: out.height / dpr,
                x: ((t0[0] + t0[2]) / 2 - tr[0]) / dpr,
                y: ((t0[1] + t0[3]) / 2 - tr[1]) / dpr,
            };
            this._wvPrevHlLastInfo = { how: selfLink ? "self-link" : entry.how, rects: marks.map(r => r.slice()), pageIndex };
            return res;
        }
        finally {
            // As renderPreviewPage: a zero-size canvas frees its memory now.
            try { canvas.width = 0; canvas.height = 0; } catch (e) {}
        }
    }

    /** The rects (PDF space, page `pageIndex`) to tint, and where they came
     *  from. Never empty while `target` is not: the last resort is the target
     *  itself. */
    async _wvPrevHlEntryRects(this: any, pv: any, popup: any, pageIndex: number, target: number[][]): Promise<{ rects: number[][]; how: string }> {
        const Cu = (Components as any).utils;
        const v = Cu.waiveXrays(pv);
        try {
            const fromData = this._wvPrevHlFromPageData(v._pdfPages, pageIndex, target);
            if (fromData) return fromData;
        }
        catch (e) {}
        try {
            const d = popup.destinationPosition;
            if (popup.source === "matched" && num(d.pageIndex) === pageIndex && target.length > 1) {
                return { rects: target, how: "matched" };
            }
        }
        catch (e) {}
        let chars: any = null;
        try {
            const pg = v._pdfPages && v._pdfPages[pageIndex];
            if (pg && pg.chars && pg.chars.length) chars = pg.chars;
            if (!chars) {
                const doc = Cu.waiveXrays(pv._iframeWindow.PDFViewerApplication).pdfDocument;
                if (doc && typeof doc.getPageData === "function") {
                    const data = Cu.waiveXrays(await doc.getPageData(wvCloneFor({ pageIndex }, pv._iframeWindow)));
                    if (data && data.chars && data.chars.length) chars = data.chars;
                }
            }
        }
        catch (e) { Zotero.debug("[Weavero] preview highlight: no page text: " + e); }
        if (chars) {
            const lines = this._wvPrevHlLines(chars);
            const found = this._wvPrevHlEntryFromLines(lines, target[0]);
            if (found) return found;
        }
        return { rects: target, how: "target-rects" };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134821 (forums.zotero.org/discussion/134821, upstream register #65).
    // Zotero 11's link previews: where a PDF has its own internal link AND Zotero's text
    // matcher made one ('matched', semantic-overlays.mjs) on the same words, the hover
    // takes the smaller -- the matched one -- and its target can be the very paragraph
    // the link is written in ("Fig. 4(b)" -> its own paragraph: 10 figure panels in
    // one PRR paper, 2026-11-17 audit). The PDF's own link names the right figure (its
    // point lies about an inch above the caption, as in Zotero 10, which used it).
    // Here, only in that self-pointing case: the preview of the PDF's own link at that
    // spot, rendered by Zotero's renderer for its destination. Other matched targets
    // (a citation to a wrong entry) are left alone: the PDF's point is an inch off
    // there and would mark the wrong entry too. RETIRE WHEN a plain beta no longer
    // previews a link's own paragraph; the case then never arises (behaviour gate).
    // Guard: test/preview-entry-highlight.spec.js.
    // ─────────────────────────────────────────────────────────────────────────
    /** The PDF's own internal link on the spot a 'matched' popup opened from, when the
     *  matched destination holds that very link; else null. */
    _wvPrevHlSelfLinkAlt(this: any, pv: any, popup: any): any {
        try {
            if (!popup || popup.type !== "internal-link" || popup.source !== "matched") return null;
            const dest = popup.destinationPosition;
            const own = popup.position;
            if (!dest || !own) return null;
            const pageIndex = num(dest.pageIndex);
            if (!this._wvPrevHlHoldsLink(popup, pageIndex, rectsOf(dest))) return null;
            const v = (Components as any).utils.waiveXrays(pv);
            const page = v._pdfPages && v._pdfPages[num(own.pageIndex)];
            const overlays = page && page.overlays;
            if (!overlays || typeof overlays.length !== "number") return null;
            const mine = rectsOf(own);
            for (let i = 0; i < overlays.length; i++) {
                const o = overlays[i];
                if (!o || o.type !== "internal-link" || o.source !== "annotation" || !o.destinationPosition || !o.position) continue;
                if (num(o.position.pageIndex) !== num(own.pageIndex)) continue;
                const rs = rectsOf(o.position);
                if (rs.some(r => mine.some(m => Math.min(r[2], m[2]) - Math.max(r[0], m[0]) > 0 && Math.min(r[3], m[3]) - Math.max(r[1], m[1]) > 0))) return o;
            }
        }
        catch (e) {}
        return null;
    }

    /** The preview of `alt` (the PDF's own link) in place of `popup`'s: Zotero's own
     *  render of its destination, handed on as the popup Zotero would have made for it.
     *  On a failure, or when the view moved on, `popup` as Zotero made it. */
    _wvPrevHlShowOwnLink(this: any, pv: any, popup: any, alt: any, rev: any, seq: number, deliver: (p: any) => void): void {
        const Cu = (Components as any).utils;
        const v = Cu.waiveXrays(pv);
        const still = () => { try { return seq === pv._wvPrevHlSeq && !v._destroyed && v._overlayRevision === rev; } catch (e) { return false; } };
        let job: Promise<any>;
        try { job = Promise.resolve(v._pdfRenderer && v._pdfRenderer.renderPreviewPage(alt.destinationPosition)); }
        catch (e) { job = Promise.resolve(null); }
        job.then((pic: any) => {
            if (!still()) return;
            if (pic) {
                try {
                    const w = Cu.waiveXrays(popup);
                    const p = Cu.waiveXrays(pic);
                    w.image = p.image; w.width = p.width; w.height = p.height; w.x = p.x; w.y = p.y;
                    w.destinationPosition = alt.destinationPosition;
                    w.source = "annotation";
                    this._wvPrevHlLastInfo = { how: "own-link (WV-TEMP-134821)" };
                    Zotero.debug("[Weavero] WV-TEMP-134821: a link matched to its own text -> the PDF's own link previewed");
                }
                catch (e) { Zotero.debug("[Weavero] WV-TEMP-134821: popup not updated: " + e); }
            }
            try { deliver(popup); } catch (e) {}
        }, () => { if (still()) { try { deliver(popup); } catch (e) {} } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WV-TEMP-134867 (forums.zotero.org/discussion/134867, upstream register #67).
    // Zotero 11 makes a reference card ('citation' overlay) for citations it reads, and
    // the PDF often has its own link (an 'internal-link', source 'annotation') on the
    // same number with a slightly different box. The hover takes the SMALLEST overlay
    // under the pointer (pdf-view.js _getSelectableOverlay), so one citation gives the
    // card on its digits and a page picture at its edges -- or, on a range "1–5" with a
    // PDF link per number, the picture on the digits and the card on the dash (Gupta &
    // Kumar 2020, plain 11.0-beta.4: 47 of 65 cards). Zotero 10.0.8 made no card there.
    // Here: an internal-link preview whose link crosses a card that has a reference on
    // the link's destination page becomes that card. Hovers only -- a click still takes
    // the link (pdf-view.js _handlePointerUp picks again), so "5" in "1–5" still jumps
    // to [5]. A link going elsewhere (an affiliation mark Zotero took for a citation)
    // keeps its picture. RETIRE WHEN a plain beta opens the same popup over the whole
    // citation; the tripwire in test/preview-entry-highlight.spec.js says when (and the
    // case never arises then: behaviour gate).
    // ─────────────────────────────────────────────────────────────────────────
    /** The 'citation' overlay to show instead of an internal-link `popup`, or null. */
    _wvCitCardFor(this: any, pv: any, popup: any): any {
        try {
            if (!popup || popup.type !== "internal-link" || !popup.position || !popup.destinationPosition) return null;
            const Cu = (Components as any).utils;
            const v = Cu.waiveXrays(pv);
            const pageIndex = num(popup.position.pageIndex);
            const destPage = num(popup.destinationPosition.pageIndex);
            const page = v._pdfPages && v._pdfPages[pageIndex];
            const overlays = page && page.overlays;
            if (!overlays || typeof overlays.length !== "number") return null;
            const mine = rectsOf(popup.position);
            if (!mine.length) return null;
            const shared = (rs: number[][]) => {
                let a = 0;
                for (const r of rs) for (const m of mine) {
                    const ix = Math.min(r[2], m[2]) - Math.max(r[0], m[0]);
                    const iy = Math.min(r[3], m[3]) - Math.max(r[1], m[1]);
                    if (ix > 0 && iy > 0) a += ix * iy;
                }
                return a;
            };
            let best: any = null, bestA = 0;
            for (let i = 0; i < overlays.length; i++) {
                const o = overlays[i];
                if (!o || o.type !== "citation" || !o.position || num(o.position.pageIndex) !== pageIndex) continue;
                const refs = o.references;
                const n = refs ? refs.length : 0;
                let there = false;
                for (let k = 0; k < n && !there; k++) { try { there = num(refs[k].position.pageIndex) === destPage; } catch (e) {} }
                if (!there) continue;
                const a = shared(rectsOf(o.position));
                if (a > bestA) { best = o; bestA = a; }
            }
            return best;
        }
        catch (e) { return null; }
    }

    /** Turn the internal-link `popup` into the card of `cit` in place, as pdf-view.js
     *  _openOverlayPopup builds one (`{ ...overlay, rect }`); the popup object stays the
     *  reader's own. False when it could not. */
    _wvCitCardSwap(this: any, pv: any, popup: any, cit: any): boolean {
        try {
            const Cu = (Components as any).utils;
            const v = Cu.waiveXrays(pv);
            const w = Cu.waiveXrays(popup);
            const c = Cu.waiveXrays(cit);
            const rect = v.getClientRect(c.position.rects[0], c.position.pageIndex);
            if (!rect) return false;
            for (const k of Object.keys(w)) if (!(k in c)) delete w[k];
            for (const k of Object.keys(c)) w[k] = c[k];
            w.rect = rect;
            this._wvCitCardLast = { at: Date.now(), page: num(c.position.pageIndex) };
            Zotero.debug("[Weavero] WV-TEMP-134867: a PDF link over a reference card -> the card");
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] WV-TEMP-134867: card swap err: " + e); return false; }
    }

    /** Does a destination (`rects`, PDF space, page `pageIndex`) hold the link
     *  the popup opened from -- the popup's own `position` (pdf-view.js
     *  _openOverlayPopup spreads the overlay into it), crossing one of them on
     *  the same page? */
    _wvPrevHlHoldsLink(this: any, popup: any, pageIndex: number, rects: number[][]): boolean {
        try {
            const own = popup && popup.position;
            if (!own || num(own.pageIndex) !== pageIndex) return false;
            const mine = rectsOf(own);
            return mine.some(m => rects.some(r =>
                Math.min(r[2], m[2]) - Math.max(r[0], m[0]) > 0 && Math.min(r[3], m[3]) - Math.max(r[1], m[1]) > 0));
        }
        catch (e) { return false; }
    }

    /** Tier 1: an entry Zotero's page data already knows, on `pageIndex`,
     *  whose rects share a line with the target. The smallest wins (the most
     *  specific). Null when none. */
    _wvPrevHlFromPageData(this: any, pages: any, pageIndex: number, target: number[][]): { rects: number[][]; how: string } | null {
        if (!pages) return null;
        const t = target[0];
        let best: { rects: number[][]; how: string } | null = null;
        const consider = (pos: any, how: string) => {
            try {
                if (!pos || num(pos.pageIndex) !== pageIndex) return;
                const rs = rectsOf(pos);
                if (!rs.length || !rs.some(r => sameLine(r, t))) return;
                if (!best || area(rs) < area(best.rects)) best = { rects: rs, how };
            }
            catch (e) {}
        };
        for (const k of Object.keys(pages)) {
            let ovs: any;
            try { ovs = pages[k] && pages[k].overlays; } catch (e) { continue; }
            const n = ovs ? ovs.length : 0;
            for (let i = 0; i < n; i++) {
                const o = ovs[i];
                try {
                    if (!o) continue;
                    if (o.type === "reference") consider(o.position, "page-data:reference");
                    else if (o.type === "citation" && o.references) {
                        for (let j = 0; j < o.references.length; j++) consider(o.references[j] && o.references[j].position, "page-data:citation");
                    }
                    else if (o.type === "internal-link" && o.source === "matched") consider(o.destinationPosition, "page-data:matched");
                }
                catch (e) {}
            }
        }
        return best;
    }

    /** The page's text lines, in Zotero's order: chars up to each
     *  `lineBreakAfter` (pdf.js structure.js), their line-high `inlineRect`s
     *  joined. */
    _wvPrevHlLines(this: any, chars: any): WvPrevHlLine[] {
        const out: WvPrevHlLine[] = [];
        let cur: WvPrevHlLine | null = null;
        const n = chars ? chars.length : 0;
        for (let i = 0; i < n; i++) {
            const ch = chars[i];
            if (!ch) continue;
            const r = rect4(ch.inlineRect || ch.rect);
            if (!cur) cur = { text: "", rect: r ? r.slice() : [0, 0, 0, 0], fs: 0, rot: num(ch.rotation) || 0 };
            if (r) {
                if (!cur.text && cur.rect[2] === 0) cur.rect = r.slice();
                else cur.rect = [Math.min(cur.rect[0], r[0]), Math.min(cur.rect[1], r[1]), Math.max(cur.rect[2], r[2]), Math.max(cur.rect[3], r[3])];
            }
            cur.text += String(ch.c || "");
            if (ch.spaceAfter) cur.text += " ";
            const fs = num(ch.fontSize);
            if (Number.isFinite(fs) && fs > cur.fs) cur.fs = fs;
            if (ch.lineBreakAfter || i === n - 1) {
                if (!cur.fs) cur.fs = cur.rect[3] - cur.rect[1];
                out.push(cur);
                cur = null;
            }
        }
        return out;
    }

    /** Tier 3: the entry around the target, from text geometry (see the
     *  module header). Null when no line holds the target. */
    _wvPrevHlEntryFromLines(this: any, lines: WvPrevHlLine[], t: number[]): { rects: number[][]; how: string } | null {
        let first = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].rot === 0 && sameLine(lines[i].rect, t)) { first = i; break; }
        }
        if (first < 0) return null;
        let last = first;
        while (last + 1 < lines.length && lines[last + 1].rot === 0 && sameLine(lines[last + 1].rect, t)) last++;
        const L0 = lines[first];
        const taken = lines.slice(first, last + 1);
        const fs = L0.fs > 0 ? L0.fs : L0.rect[3] - L0.rect[1];
        const style = Object.keys(LABELS).find(k => LABELS[k].test(L0.text)) || null;
        const left0 = L0.rect[0];
        let right = Math.max(...taken.map(l => l.rect[2]));
        let indent: number | null = null;
        let prev = taken[taken.length - 1];
        let how = style ? "text:" + style : "target-lines";
        for (let i = last + 1; i < lines.length && taken.length < WV_PREVHL_MAX_LINES; i++) {
            const L = lines[i];
            if (L.rot !== L0.rot || !L.text.trim()) break;
            const ph = prev.rect[3] - prev.rect[1];
            // Below the previous line: a line higher up is the next column.
            if (L.rect[3] > prev.rect[1] + 0.5 * ph) break;
            // A gap wider than most of a line ends the block.
            if (prev.rect[1] - L.rect[3] > 0.8 * ph) break;
            // The same column: mostly within the entry's span, not left of it.
            const lw = L.rect[2] - L.rect[0];
            const ov = Math.min(L.rect[2], right + fs) - Math.max(L.rect[0], left0 - fs);
            if (L.rect[0] < left0 - fs || ov < 0.5 * lw) break;
            if (style) {
                if (LABELS[style].test(L.text)) break;
            }
            else if (indent === null) {
                // No label: a hanging indent alone tells the entries apart.
                if (L.rect[0] > left0 + 0.5 * fs) { indent = L.rect[0]; how = "text:indent"; }
                else break;
            }
            else if (L.rect[0] < left0 + 0.3 * fs) break;
            taken.push(L);
            right = Math.max(right, L.rect[2]);
            prev = L;
        }
        return { rects: taken.map(l => l.rect.slice()), how };
    }
}

const _previewHighlightDescriptors = Object.getOwnPropertyDescriptors(_PreviewHighlightMixin.prototype);
delete (_previewHighlightDescriptors as any).constructor;
export const previewHighlightMethods = _previewHighlightDescriptors;
