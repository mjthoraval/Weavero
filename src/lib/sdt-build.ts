// Pure parts of "Build Zotero's structure data for all PDFs" (modules/sdt-build.ts;
// branch citations, plan work/citations-plan-2026-11-21.md M5): the order of the
// run, what is left to build, the failure memo, and the costs the warning states.
//
// The costs come from a MEASURED model (work/citations-log-2026-11-21.md, "M5"):
// Zotero.SDT.ensure on read-only copies of 50 of MJT's PDFs (35 articles, 15 books,
// book sections and theses; 2,119 pages), Zotero 11.0-beta.5, a throwaway profile.
// A PDF's time and its cache grow with its pages (least squares over the 50):
//   seconds = 0.6353 + 0.02843 x pages,  cache bytes = 41,988 + 3,575.67 x pages,
// its pages being Zotero's own count (fulltextItems.totalPages, kept when it indexed
// the PDF), else its bytes / 106,576 (the sample's bytes per page). The warning gives
// a range around that: a bootstrap of the sample gave 0.90-1.11 of the middle for
// the time and 0.91-1.09 for the disk on MJT's library; the ends are widened to
// 0.8-1.5 and 0.85-1.25 (a margin chosen, not measured: books longer than the
// sample's 287 pages, a busier machine).

/** A PDF the run may build, as the module lists it. */
export interface WvSbCand {
    /** The attachment's item id. */
    id: number;
    lib: number;
    key: string;
    /** Its dateAdded as Zotero stores it ("YYYY-MM-DD hh:mm:ss", UTC): the order. */
    added: string;
    /** The PDF's bytes (0 when its file is missing). */
    bytes: number;
    /** Its pages as Zotero counted them when it indexed the PDF; 0 when unknown. */
    pages: number;
    /** Whether `.zotero-sdt-cache` is beside it already. */
    has: boolean;
    /** The PDF's stamp (size:mtime): the failure memo's way to know a NEW file. */
    stamp: string;
}

/** The measured model (above). */
export interface WvSbModel {
    sec0: number; secPerPage: number;
    cache0: number; cachePerPage: number;
    bytesPerPage: number;
    timeLo: number; timeHi: number;
    diskLo: number; diskHi: number;
}

export const WV_SB_MODEL: WvSbModel = {
    sec0: 0.6353, secPerPage: 0.02843,
    cache0: 41988, cachePerPage: 3575.67,
    bytesPerPage: 106576,
    timeLo: 0.8, timeHi: 1.5,
    diskLo: 0.85, diskHi: 1.25,
};

/** The failure memo's key for a PDF: its library and key (an id is not kept
 *  across a database rebuild; a library/key is). */
export function wvSbMemoKey(c: { lib: number; key: string }): string {
    return c.lib + "/" + c.key;
}

/** Newest first: dateAdded descending, then the larger id (added later in the
 *  same second). A copy, the input unchanged. */
export function wvSbOrder<T extends { added: string; id: number }>(cands: T[]): T[] {
    return cands.slice().sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : b.id - a.id));
}

/** What the run builds, in its order: the PDFs with a file and no cache, out of
 *  the libraries skipped, but not the ones that failed before on THIS file (the
 *  memo holds the stamp of the file that failed; a new file is tried again). */
export function wvSbQueue(cands: WvSbCand[], failed: Record<string, string>, skipLibs?: Set<number> | number[]): WvSbCand[] {
    const skip = skipLibs instanceof Set ? skipLibs : new Set(skipLibs || []);
    const out: WvSbCand[] = [];
    for (const c of wvSbOrder(cands)) {
        if (c.has || !(c.bytes > 0) || skip.has(c.lib)) continue;
        const f = failed[wvSbMemoKey(c)];
        if (f !== undefined && f === c.stamp) continue;
        out.push(c);
    }
    return out;
}

/** The memo without the PDFs gone or rebuilt (a cache there now, or another file). */
export function wvSbMemoPrune(failed: Record<string, string>, cands: WvSbCand[]): Record<string, string> {
    const by = new Map<string, WvSbCand>();
    for (const c of cands) by.set(wvSbMemoKey(c), c);
    const out: Record<string, string> = {};
    for (const k of Object.keys(failed)) {
        const c = by.get(k);
        if (c && !c.has && c.stamp === failed[k]) out[k] = failed[k];
    }
    return out;
}

/** A PDF's pages for the model: Zotero's count, else from its bytes (at least 1). */
export function wvSbPages(c: { pages?: number; bytes: number }, m: WvSbModel = WV_SB_MODEL): number {
    if (c.pages && c.pages > 0) return c.pages;
    return Math.max(1, Math.round((c.bytes > 0 ? c.bytes : 0) / m.bytesPerPage));
}

/** The costs the warning states, for the PDFs of `queue`: seconds of work and
 *  bytes of cache, the middle and the range's ends. */
export interface WvSbEstimate { pdfs: number; bytes: number; pages: number; secMid: number; secLo: number; secHi: number; diskMid: number; diskLo: number; diskHi: number }

export function wvSbEstimate(queue: { pages?: number; bytes: number }[], m: WvSbModel = WV_SB_MODEL): WvSbEstimate {
    let bytes = 0, pages = 0;
    for (const c of queue) { bytes += c.bytes > 0 ? c.bytes : 0; pages += wvSbPages(c, m); }
    const n = queue.length;
    const secMid = n * m.sec0 + pages * m.secPerPage;
    const diskMid = n * m.cache0 + pages * m.cachePerPage;
    return { pdfs: n, bytes, pages, secMid, secLo: secMid * m.timeLo, secHi: secMid * m.timeHi, diskMid, diskLo: diskMid * m.diskLo, diskHi: diskMid * m.diskHi };
}

/** Seconds of work left: the model's middle for what is left, scaled to this
 *  run's own pace once it has built enough (at least `minDone` PDFs and 60 s of
 *  work: the model's middle for those against the time they took). */
export function wvSbEta(done: { pdfs: number; pages: number; ms: number }, left: { pdfs: number; pages: number }, m: WvSbModel = WV_SB_MODEL, minDone = 10): number {
    if (left.pdfs <= 0) return 0;
    const mid = (x: { pdfs: number; pages: number }) => x.pdfs * m.sec0 + x.pages * m.secPerPage;
    const l = mid(left);
    if (done.pdfs >= minDone && done.ms >= 60000) {
        const seen = mid(done);
        if (seen > 0) return l * (done.ms / 1000) / seen;
    }
    return l;
}

/** A range of durations in ONE unit (the high end's), both ends rounded in it:
 *  minutes under 90 minutes, hours under 48 hours (halves under 10), else days. */
export function wvSbDurationRange(lo: number, hi: number): { lo: number; hi: number; unit: "minutes" | "hours" | "days" } {
    const unit: "minutes" | "hours" | "days" = hi < 90 * 60 ? "minutes" : hi < 48 * 3600 ? "hours" : "days";
    const per = unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86400;
    const r = (x: number) => {
        const v = x / per;
        if (unit === "minutes") return Math.max(1, Math.round(v));
        return v < 10 ? Math.max(0.5, Math.round(v * 2) / 2) : Math.round(v);
    };
    const h = r(hi);
    return { lo: Math.min(r(lo), h), hi: h, unit };
}

/** Bytes in MB or GB (the high end's unit), one decimal under 10. */
export function wvSbBytesRange(lo: number, hi: number): { lo: number; hi: number; unit: "MB" | "GB" } {
    const gb = hi >= 1024 * 1048576;
    const per = gb ? 1024 * 1048576 : 1048576;
    const r = (x: number) => { const v = x / per; return v < 10 ? Math.max(0.1, Math.round(v * 10) / 10) : Math.round(v); };
    return { lo: Math.min(r(lo), r(hi)), hi: r(hi), unit: gb ? "GB" : "MB" };
}
