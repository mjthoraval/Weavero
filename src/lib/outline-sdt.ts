// Zotero's outline in its structure data (`catalog.outline` of the SDT pack),
// in the tree shape the reader's Outline panel renders (reader-panels.ts
// `_wvOutlineCopyTree`: {title, url, position, href, items}). outline2 P1,
// 2026-11-24 (plan work/outline-extraction-plan-notes-2026-11-23.md).
//
// What the catalog holds (document-worker src/pdf/structure/outline/outline.js
// getOutline, read 2026-11-24 in the mirror):
// - a PDF with a usable outline of its own: that outline VERBATIM (titles,
//   order, nesting), every entry `source: 'native'`, its destination as
//   `target.position {pageIndex, rect}` (a point) and, when Zotero found the
//   heading the entry points to, `ref: [topLevelBlockIndex]`
//   (projectNativeSkeleton);
// - otherwise an outline GENERATED from the heading blocks (or rebuilt from a
//   printed table of contents): entries without `source`, each with `ref`,
//   plus the PDF's own URL-only entries appended (`source: 'native'`). Its
//   newer reader also accepts `source: 'detected'`, which this mirror's worker
//   never writes: anything not 'native' counts as Zotero's generated outline.
// Weavero's own extracted outline (outline2 P2) is built from the same data
// by lib/outline-build.ts.
// A heading block is `{type: 'heading', anchor: {pageRects: [[pageIndex, x1,
// y1, x2, y2], ...]}, content}`. Its rects are in unrotated PDF user space
// (origin bottom-left, y up), the space of annotation rects and of the
// reader's navigation positions: the document-worker builds a block's bbox
// from its glyph boxes and says so where it resolves destinations ("Destinations
// and text geometry share unrotated PDF coordinates", structure/util.js
// resolveDestination), and the reader turns `anchor.pageRects` straight into a
// position (reader src/pdf/semantic-overlays.mjs positionFromPageRects).
// Checked on Zotero 11 and 10.0.8 against the reader's own glyph boxes
// (test/outline-sdt.spec.js).
//
// Positions, best first: a `ref` to a HEADING block -> that block's rects on its
// first page (the exact heading box: no title search needed); else the native
// destination point (the panel's title search, `_wvOutlineRecoverRect`, then
// finds the heading as it always has); else a ref to a non-heading block (a
// heading run into its paragraph) -> a point at the block's top-left, where the
// title search starts.

import { WvOlNode, WvOlBlock, WvOlMeta, wvOlPosFromPageRects, wvOlBlockText, wvOlLead, wvOlLostSpaces, wvOlNorm, wvOlCharBoxes, wvOlItems, wvOlGoodBookmarks, wvOlSpaceGaps, wvOutlineBuild } from "./outline-build";

export type { WvOlNode };
export { wvOlPosFromPageRects };

/** A PDF's outlines from its structure data: the PDF's own (Zotero's snapped
 *  copy of it), Zotero's generated one as Zotero stores it ("Zotero" in the
 *  source chip), and Weavero's extracted one (lib/outline-build.ts). Any may
 *  be empty; `zotero` is empty when the PDF has its own outline (Zotero's
 *  catalog then IS that outline). */
export interface WvOlSdt { embedded: WvOlNode[]; zotero: WvOlNode[]; extracted: WvOlNode[]; notes?: string[];
    /** Good bookmarks Extracted disagrees with badly: Embedded is shown first (outline2.13). */
    embeddedFirst?: boolean; }

function finiteRect(r: any): boolean {
    return Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every((v: any) => typeof v === "number" && Number.isFinite(v));
}

/** Bookmarks all labelled alike, in document order (`flat`): each takes the
 *  title and box of the heading at its destination -- the nearest heading
 *  block, bold lead-in or numbered line at or below the destination on its
 *  page, each used once. True when every entry found one (they are renamed in
 *  place), false otherwise (nothing changed). */
export function wvOlNameFromHeadings(flat: WvOlNode[], blocks: any[], pages: any[]): boolean {
    type Cand = { i: number; page: number; top: number; h: number; x1: number; x2: number; title: string; tier: number };
    const pageCount = Array.isArray(pages) ? pages.length : 0;
    const cands: Cand[] = [];
    // Page banners are no headings: the top and bottom 6 % of a page, or a
    // text found on two pages ("View Article Online").
    const seen = new Map<string, Set<number>>();
    (blocks || []).forEach((b: any) => {
        const pr = b && b.anchor && Array.isArray(b.anchor.pageRects) && b.anchor.pageRects[0];
        if (!pr) return;
        const k = wvOlNorm(wvOlBlockText(b));
        if (k) (seen.get(k) || seen.set(k, new Set()).get(k) as Set<number>).add(pr[0]);
    });
    (blocks || []).forEach((b: any, i: number) => {
        const pr = b && b.anchor && Array.isArray(b.anchor.pageRects) && b.anchor.pageRects[0];
        if (!pr || !Number.isInteger(pr[0]) || !finiteRect(pr.slice(1))) return;
        const vr = pages[pr[0]] && pages[pr[0]].viewRect;
        if (finiteRect(vr)) { const hh = vr[3] - vr[1]; if (hh > 0 && (pr[4] > vr[3] - 0.06 * hh || pr[2] < vr[1] + 0.06 * hh)) return; }
        const rep = seen.get(wvOlNorm(wvOlBlockText(b)));
        if (rep && rep.size >= 2) return;
        let title = "", tier = 1;
        if (b.type === "heading") title = wvOlBlockText(b);
        else if (b.type === "paragraph") {
            const L = wvOlLead(b);
            const t = wvOlBlockText(b);
            tier = 2;
            if (L.lead && (L.style === "b" || L.style === "bi") && L.lead.split(/\s+/).length <= 15) title = L.lead.replace(/[\s.:\u2014\u2013]+$/, "");
            else if (/^\s*(?:\d+(?:\.\d+)*|[IVXLC]+|[A-Z])\.?\s+\p{Lu}/u.test(t) && t.length <= 120 && t.split(/\s+/).length <= 15) title = t;
        }
        title = title.replace(/\s+/g, " ").trim();
        if (title) cands.push({ i, page: pr[0], top: pr[4], h: Math.max(1, pr[4] - pr[2]), x1: pr[1], x2: pr[3], title, tier });
    });
    const used = new Set<number>();
    const pick: Array<{ n: WvOlNode; c: Cand }> = [];
    for (const n of flat) {
        const pos = n.position;
        if (!pos || !Number.isInteger(pos.pageIndex) || pos.pageIndex >= pageCount) return false;
        // A destination that is only the page (its top-left corner) says
        // nothing of the place: the page's headings in reading order.
        const r = Array.isArray(pos.rects) && pos.rects[0];
        const vr = pages[pos.pageIndex] && pages[pos.pageIndex].viewRect;
        const pageOnly = !r || (finiteRect(vr) && r[0] <= vr[0] + 1 && r[3] >= vr[3] - 1);
        const y = pageOnly ? Infinity : r[3], x = pageOnly ? NaN : r[0];
        // The first heading in reading order at or below the destination (its
        // column first); heading blocks before lead-ins and numbered lines.
        const pickIn = (tier: number, inColumn: boolean): Cand | null => {
            let best: Cand | null = null;
            for (const c of cands) {
                if (c.tier !== tier || c.page !== pos.pageIndex || used.has(c.i) || c.top > y + 1.5 * c.h) continue;
                if (inColumn && !(x >= c.x1 - 30 && x <= c.x2)) continue;
                if (!best || c.i < best.i) best = c;
            }
            return best;
        };
        const best = (Number.isFinite(x) ? pickIn(1, true) : null) || pickIn(1, false)
            || (Number.isFinite(x) ? pickIn(2, true) : null) || pickIn(2, false);
        if (!best) return false;
        used.add(best.i);
        pick.push({ n, c: best });
    }
    for (const { n, c } of pick) {
        n.title = c.title;
        const b = blocks[c.i];
        // A lead-in's own characters, not its paragraph (outline2.11).
        const own = c.tier === 2 ? wvOlCharBoxes(b, c.title.replace(/\s+/g, "").length) : null;
        const p = own ? { pageIndex: own[0][0], rects: own.filter((x) => x[0] === own[0][0]).map((x) => x.slice(1, 5)) }
            : wvOlPosFromPageRects(b && b.anchor && b.anchor.pageRects, pageCount);
        if (p) n.position = p;
    }
    return true;
}

/** Every top-level block of the pack, read chunk by chunk (one `getBlocks`
 *  per chunk, rd.index.chunkBlockStarts, as cited-by.ts reads them; the whole
 *  range at once where the pack has no such index). */
export async function wvOlReadAllBlocks(rd: any): Promise<any[]> {
    const starts: number[] = Array.from((rd.index && rd.index.chunkBlockStarts) || []);
    const out: any[] = [];
    if (starts.length >= 2) {
        for (let k = 0; k + 1 < starts.length; k++) {
            const blocks: any[] = await rd.getBlocks(starts[k], starts[k + 1] - 1);
            for (const b of blocks || []) out.push(b);
        }
        return out;
    }
    const n = typeof rd.getTopLevelBlockCount === "function" ? rd.getTopLevelBlockCount() : 0;
    if (n > 0) for (const b of (await rd.getBlocks(0, n - 1)) || []) out.push(b);
    return out;
}

/** The outlines of an opened pack (`rd`, lib/sdt.ts wvSdtOpen), for the
 *  parent item's `meta` (title and creators: bylines and title lines). */
export async function wvOutlineFromSdt(rd: any, meta?: WvOlMeta): Promise<WvOlSdt> {
    const cat = await rd.getCatalog();
    const items: any[] = (cat && Array.isArray(cat.outline)) ? cat.outline : [];
    const pages: any[] = (cat && Array.isArray(cat.pages)) ? cat.pages : [];
    const pageCount = pages.length;
    const all = await wvOlReadAllBlocks(rd);
    const targetPos = (t: any): { pageIndex: number; rects: number[][] } | null => {
        const p = t && t.position;
        const pi = p && p.pageIndex;
        if (!Number.isInteger(pi) || pi < 0 || pi >= pageCount) return null;
        if (finiteRect(p.rect)) return { pageIndex: pi, rects: [p.rect.slice(0, 4)] };
        // No point: the page's top-left corner, as the reader does (getTargetPosition).
        const vr = pages[pi] && pages[pi].viewRect;
        return finiteRect(vr) ? { pageIndex: pi, rects: [[vr[0], vr[3], vr[0], vr[3]]] } : null;
    };
    const convert = (list: any[]): WvOlNode[] => {
        const out: WvOlNode[] = [];
        for (const it of list || []) {
            if (!it || typeof it.title !== "string") continue;
            const blk = (Array.isArray(it.ref) && it.ref.length) ? all[it.ref[0]] : null;
            const blkPos = blk ? wvOlPosFromPageRects(blk.anchor && blk.anchor.pageRects, pageCount) : null;
            let position = (blk && blk.type === "heading") ? blkPos : null;
            if (!position) position = targetPos(it.target);
            if (!position && blkPos) {
                const r = blkPos.rects[0];
                position = { pageIndex: blkPos.pageIndex, rects: [[r[0], r[3], r[0], r[3]]] };
            }
            const url = (!position && it.target && typeof it.target.url === "string") ? it.target.url : null;
            out.push({ title: it.title, url, position, href: null, items: convert(it.children) });
        }
        return out;
    };
    // Zotero's own verdict decides: every top-level entry native = the PDF's
    // outline was usable and IS the catalog outline; any generated entry = it
    // was not, and the native URL entries Zotero appended belong to that
    // generated outline (as the reader shows them).
    let nodes = convert(items);
    const own = items.length > 0 && items.every((it: any) => it && it.source === "native");
    // The PDF's own bookmarks all labelled alike (S426KUSL: the paper's title
    // on each): named from the heading at each destination, or not offered
    // (MJT 2026-11-24, "Name from headings"). Otherwise exactly the file's.
    if (own) {
        const flat: WvOlNode[] = [];
        const w = (l: WvOlNode[]) => { for (const n of l) { flat.push(n); w(n.items); } };
        w(nodes);
        if (flat.length >= 2 && flat.every((n) => wvOlNorm(n.title) === wvOlNorm(flat[0].title))) {
            nodes = wvOlNameFromHeadings(flat, all, pages) ? nodes : [];
        }
    }
    // Weavero's: the summary of every block (text cut to 300 characters: the
    // rules read headings and repeated lines, never long paragraphs whole;
    // lists to 3000, where rule 16 counts a reference list's entries).
    // Paragraphs also carry their lead-in (rule 14: run-in headings).
    // Headings also carry the spaces their text layer lost (rule 17).
    // A book's first pages (its Contents, rule 18) also carry their blocks'
    // lines: a list's items, a table's cells, a paragraph's whole text.
    let strong = false;
    const front = pageCount > 60 ? Math.min(pageCount, Math.max(8, Math.ceil(pageCount * 0.15)) + 20) : 0;
    const summary: WvOlBlock[] = all.map((b: any, i: number) => {
        const s: WvOlBlock = {
            i, type: String((b && b.type) || ""), text: wvOlBlockText(b).slice(0, b && b.type === "list" ? 3000 : 300),
            pageRects: (b && b.anchor && Array.isArray(b.anchor.pageRects)) ? b.anchor.pageRects : null,
        };
        const p0 = s.pageRects && s.pageRects[0] && s.pageRects[0][0];
        if (front && Number.isInteger(p0) && p0 < front) s.items = wvOlItems(b).map((t) => t.slice(0, 3000)).slice(0, 400);
        if (s.type === "paragraph") {
            const L = wvOlLead(b);
            s.lead = L.lead; s.leadStyle = L.style; s.line = L.line;
            // The boxes of the lead-in's own characters, and of those before an
            // em dash (rule 14's entries sit on them, outline2.11).
            const n = (t: string) => t.replace(/\s+/g, "").length;
            if (L.lead) s.leadBox = wvOlCharBoxes(b, n(L.lead));
            const m = /^(\p{Lu}[^\u2014]{0,118}?)\s?\u2014/u.exec(s.text);
            if (m) s.dashBox = wvOlCharBoxes(b, n(m[1]));
        }
        if (s.type === "heading") {
            const L = wvOlLostSpaces(b); if (L && L.lost.length) { s.lost = L.lost; if (L.strong) strong = true; }
            // Rule 21: each space's glyph gap (a space inside a word, OCR's "R esult s").
            const G = s.text.includes(" ") ? wvOlSpaceGaps(b) : null;
            if (G && G.length) s.spaceGaps = G;
        }
        return s;
    });
    // Only in a document where some heading shows a strong lost space.
    if (!strong) for (const s of summary) delete s.lost;
    const notes: string[] = [];
    const extracted = wvOutlineBuild(items, summary, pages, meta || {}, notes);
    // Safety net (outline2.13, MJT 2026-11-24): GOOD bookmarks that Extracted
    // disagrees with badly -- fewer than half of them with an Extracted entry
    // on their page -- make Embedded the PDF's first source (reader-panels).
    let embeddedFirst = false;
    const pageOfRef = (i: number): number | null => { const pr = all[i] && all[i].anchor && Array.isArray(all[i].anchor.pageRects) && all[i].anchor.pageRects[0]; return pr && Number.isInteger(pr[0]) ? pr[0] : null; };
    if (own && nodes.length && wvOlGoodBookmarks(items, pageCount, pageOfRef)) {
        const exPages = new Set<number>();
        const bm: WvOlNode[] = [];
        const wE = (l: WvOlNode[]) => { for (const n of l) { if (n.position) exPages.add(n.position.pageIndex); wE(n.items); } };
        const wB = (l: WvOlNode[]) => { for (const n of l) { if (n.position) bm.push(n); wB(n.items); } };
        wE(extracted); wB(nodes);
        const hit = bm.filter((n) => exPages.has((n.position as any).pageIndex)).length;
        embeddedFirst = bm.length > 0 && hit < 0.5 * bm.length;
        if (embeddedFirst) notes.push("embedded first: " + hit + " of " + bm.length + " bookmarks have an Extracted entry on their page");
    }
    return own ? { embedded: nodes, zotero: [], extracted, notes, embeddedFirst } : { embedded: [], zotero: nodes, extracted, notes };
}
