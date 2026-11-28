// One area per in-text citation in a PDF (WV-TEMP-CITEZONES; MJT 2026-11-25,
// three reports; upstream register #76). Zotero 11 makes a citation's hover and
// click areas from the structure data, one per TEXT NODE (reader
// semantic-overlays.mjs projectPDFSDTPage -> addPageOverlay), so
//   - a font change splits one citation: "Thoraval et al. 2012" with an italic
//     "et al." was three areas to the same reference (Constante-Amores et al.
//     2023, JFM, p. 2);
//   - the node can stop short of the citation: "Clerc (2004" without its ")",
//     "Richard, Clanet & Quere 200" without its last digit, and "Clerc (2004)"
//     for "Van Dam & Le Clerc (2004)" (Li & Thoroddsen 2015, JFM 780, p. 2).
// This is the plan only, on plain numbers: which areas merge, how far each
// stretches, and which PDF links a stretched area now covers. The reader side
// (modules/cite-zones.ts) reads the page and applies it.
//
// Rules, each bounded so it cannot run into the text around a citation:
//  - MERGE: two citation areas next in the page's order, to the same
//    references, on the same line, only a space apart (no character between);
//  - RIGHT: to the end of the word the area stops inside (letters and digits
//    touching it), then a ")" or "]" the area opened and did not close;
//  - LEFT: back over the author names before it on the same line -- each word
//    capitalised or a name particle ("van", "de", "Le"), found in the author
//    part of the reference's own text (before its year), "&" / "and" / "et"
//    only between names; a "(" before the first name stays outside, and no word
//    of another area is taken;
//  - a PDF link (not from the structure data) lying inside a merged or
//    stretched area is dropped, so the area is one target throughout.
// Retire when Zotero's citation areas cover the whole citation by themselves.

export interface WvCzChar {
    /** The character. */
    c: string;
    /** [x1, y1, x2, y2], PDF points. */
    r: number[];
    /** Font size, points. */
    fs: number;
}

export interface WvCzOverlay {
    type: string;
    source: string;
    /** Same references => same signature ("" for none). */
    sig: string;
    rects: number[][];
    /** The references' own text, joined. */
    refText: string;
}

/** Per input overlay: undefined = untouched, null = dropped, else its new rects. */
export type WvCzPlan = Array<number[][] | null | undefined>;

const PARTICLES = new Set(["van", "von", "de", "der", "den", "du", "le", "la", "di", "da", "del", "della", "dos", "das", "ten", "ter", "el", "al", "bin", "ibn"]);
const CONNECTORS = new Set(["&", "and", "et", "und", "y", "e"]);

function norm(s: string): string {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function height(r: number[]): number { return Math.max(0, r[3] - r[1]); }

/** Vertical overlap as a share of the smaller height. */
function sameLine(a: number[], b: number[]): boolean {
    const o = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    const h = Math.min(height(a), height(b));
    return h > 0 && o / h >= 0.5;
}

function union(a: number[], b: number[]): number[] {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

const cx = (r: number[]) => (r[0] + r[2]) / 2;
const cy = (r: number[]) => (r[1] + r[3]) / 2;

function inside(r: number[], box: number[], tol = 0.5): boolean {
    return cx(r) >= box[0] - tol && cx(r) <= box[2] + tol && cy(r) >= box[1] - tol && cy(r) <= box[3] + tol;
}

const WORD = /[\p{L}\p{N}]/u;

/** The author part of a reference's text: up to its first year, else its start. */
function authorPart(refText: string): string {
    const t = norm(refText);
    const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(t);
    return m && m.index > 0 ? t.slice(0, m.index) : t.slice(0, 160);
}

function hasWord(hay: string, w: string): boolean {
    if (!w) return false;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^\\p{L}])" + esc + "($|[^\\p{L}])", "u").test(hay);
}

export function wvCiteZonesPlan(ovs: WvCzOverlay[], chars: WvCzChar[]): WvCzPlan {
    const plan: WvCzPlan = new Array(ovs.length).fill(undefined);
    const cur: number[][][] = ovs.map((o) => (o.rects || []).map((r) => r.slice()));
    const lineOf = (box: number[]) => chars.filter((ch) => sameLine(ch.r, box)).sort((a, b) => cx(a.r) - cx(b.r));

    // MERGE
    let last = -1;
    for (let i = 0; i < ovs.length; i++) {
        if (ovs[i].type !== "citation" || !cur[i].length) continue;
        if (last >= 0 && ovs[i].sig && ovs[last].sig === ovs[i].sig) {
            const a = cur[last][cur[last].length - 1];
            const b = cur[i][0];
            const h = Math.min(height(a), height(b));
            const gap = b[0] - a[2];
            const between = sameLine(a, b) && chars.some((ch) => sameLine(ch.r, a) && cx(ch.r) > a[2] + 0.5 && cx(ch.r) < b[0] - 0.5);
            if (sameLine(a, b) && gap >= -h && gap <= 1.5 * h && !between) {
                cur[last][cur[last].length - 1] = union(a, b);
                for (const r of cur[i].slice(1)) cur[last].push(r);
                plan[last] = cur[last];
                plan[i] = null;
                continue;
            }
        }
        last = i;
    }

    // STRETCH
    const citations = ovs.map((o, i) => i).filter((i) => ovs[i].type === "citation" && plan[i] !== null);
    const others = (i: number) => citations.filter((j) => j !== i).flatMap((j) => cur[j]);
    for (const i of citations) {
        const rects = cur[i];
        if (!rects.length) continue;
        let changed = false;
        const allIn = rects.flatMap((box) => chars.filter((ch) => sameLine(ch.r, box) && inside(ch.r, box)));
        if (!allIn.length) continue;
        const fs = allIn.map((ch) => ch.fs).sort((a, b) => a - b)[allIn.length >> 1] || height(rects[0]);
        const space = 0.15 * fs;
        const text = allIn.map((ch) => ch.c).join("");
        const blocked = others(i);

        // RIGHT, on the last rect
        {
            const k = rects.length - 1;
            const line = lineOf(rects[k]);
            const idx = line.map((ch, n) => (inside(ch.r, rects[k]) ? n : -1)).filter((n) => n >= 0);
            if (idx.length) {
                let hi = idx[idx.length - 1];
                const gapTo = (n: number) => line[n].r[0] - line[n - 1].r[2];
                while (hi + 1 < line.length && gapTo(hi + 1) <= space && WORD.test(line[hi + 1].c)
                        && !blocked.some((b) => inside(line[hi + 1].r, b))) hi++;
                const opens = (o: string, c: string) => text.split(o).length - text.split(c).length;
                const nx = line[hi + 1];
                if (nx && gapTo(hi + 1) <= 0.4 * fs && ((nx.c === ")" && opens("(", ")") > 0) || (nx.c === "]" && opens("[", "]") > 0))) hi++;
                if (hi > idx[idx.length - 1]) {
                    for (let n = idx[idx.length - 1] + 1; n <= hi; n++) rects[k] = union(rects[k], [line[n].r[0], rects[k][1], line[n].r[2], rects[k][3]]);
                    changed = true;
                }
            }
        }

        // LEFT, on the first rect
        {
            const line = lineOf(rects[0]);
            const idx = line.map((ch, n) => (inside(ch.r, rects[0]) ? n : -1)).filter((n) => n >= 0);
            const names = authorPart(ovs[i].refText);
            if (idx.length && names) {
                const lo0 = idx[0];
                let lo = lo0;
                let pendingConn = -1;
                let j = lo0 - 1;
                while (j >= 0) {
                    if (line[j + 1].r[0] - line[j].r[2] > 1.0 * fs) break;
                    let k = j;
                    while (k - 1 >= 0 && line[k].r[0] - line[k - 1].r[2] <= space) k--;
                    const word = line.slice(k, j + 1);
                    if (word.some((ch) => blocked.some((b) => inside(ch.r, b)))) break;
                    let w = word.map((ch) => ch.c).join("");
                    let start = k;
                    let stop = false;
                    if (/^[([]/.test(w)) { w = w.slice(1); start = k + 1; stop = true; }
                    w = w.replace(/[,]$/, "");
                    if (!w || /[\d;)\]]/.test(w)) break;
                    const nw = norm(w).replace(/[.’'-]/g, "");
                    if (CONNECTORS.has(nw) || w === "&") {
                        if (pendingConn >= 0) break;
                        pendingConn = start;
                        j = k - 1;
                        if (stop) break;
                        continue;
                    }
                    const cap = /^\p{Lu}/u.test(w);
                    if (!(cap || PARTICLES.has(nw)) || !hasWord(names, nw)) break;
                    lo = start;
                    pendingConn = -1;
                    j = k - 1;
                    if (stop) break;
                }
                if (lo < lo0) {
                    for (let n = lo; n < lo0; n++) rects[0] = union(rects[0], [line[n].r[0], rects[0][1], line[n].r[2], rects[0][3]]);
                    changed = true;
                }
            }
        }
        if (changed) plan[i] = rects;
    }

    // PDF links inside a merged or stretched area
    const touched = citations.filter((i) => plan[i]).flatMap((i) => plan[i] as number[][]);
    if (touched.length) {
        for (let j = 0; j < ovs.length; j++) {
            const o = ovs[j];
            if (o.type !== "internal-link" || o.source === "sdt" || plan[j] !== undefined || !cur[j].length) continue;
            if (cur[j].every((r) => touched.some((t) => inside(r, t, 1)))) plan[j] = null;
        }
    }
    return plan;
}
