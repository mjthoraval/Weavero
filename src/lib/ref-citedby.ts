// Cited by (modules/cited-by.ts; plan work/citedby-plan-2026-11-20.md): the
// reverse of "references in your library" -- for an item, the papers of the
// user's libraries whose reference lists cite it. Offline: the index is built
// from what Zotero already keeps beside each PDF, and the matching is the
// References feature's (lib/ref-match.ts). Pure: no Zotero, no DOM, so the
// suite drives it directly (test/cited-by.spec.js).
//
// Two sources, per citing PDF, the better one first:
//  - "sdt": Zotero's structure cache (`.zotero-sdt-cache`, written by Zotero
//    11 / 10.0.8 when the PDF is opened in its reader), walked as the
//    References section walks it (lib/ref-list.ts): real entries;
//  - "ft": Zotero's full-text cache (`.zotero-ft-cache`, plain text, written
//    by Zotero's full-text indexing for nearly every PDF): the reference
//    section found and cut into entries here (wvCbTextEntries). Measured on
//    MJT's library 2026-11-20: 70 of 18,780 PDFs had a structure cache, 18,529
//    a full-text one (the plan's coverage table); on the 70 with both, the
//    full text finds 90.0 % of what the structure data finds, and 97.9 % of
//    what it finds the structure data finds too (the others inspected: another
//    copy of the same work, or a plausible citation the structure data missed).
// A match names every copy of the cited work (ref-match's copiesOf), so the
// reverse map answers for each copy.

import { wvRefListIsTitle } from "./ref-list";
import { wvRefCompact, wvRefDOIs, wvRefVolPages, wvRefYears, wvRefArxivIds } from "./ref-match";

// ---- long work in steps -----------------------------------------------------------
// A pass runs on Zotero's main thread a few milliseconds at a time (cited-by.ts
// _wvCbPace). One call over a book's text took up to 65 ms (its headings looked
// for, 5 MB of lines), 32 ms (a 120,000-character list cut into entries), 46 ms
// (a filter of 100,000 tokens), Zotero 11 on the PDFs MJT's own first pass read
// first (plan §13). Each is written as steps: a generator yielding between
// pieces of well under a millisecond, where the pass's pace may let Zotero run;
// the plain function runs it through at once. The pieces' loops are plain
// functions the generator calls: SpiderMonkey ran the filter's hashing loop
// inside a generator twice as slow (1,887 against 955 ms on those PDFs).

/** The steps of one computation; its result, the generator's return value. */
export type WvCbSteps<T> = Generator<void, T, void>;

/** Run `g` to its end at once. */
export function wvCbRun<T>(g: WvCbSteps<T>): T {
    for (;;) {
        const r = g.next();
        if (r.done) return r.value;
    }
}

/** What the index keeps of one citing PDF, by its attachment id. Short keys:
 *  the store holds one per PDF of the user's libraries. */
export interface WvCbRec {
    /** The stamp of the file it was read from: "<src>:<size>:<mtime>". */
    s: string;
    /** The source read: "sdt", "ft", or "none" (no usable cache: nothing cites). */
    src: "sdt" | "ft" | "none";
    /** The parent item (the citing paper), 0 for a standalone PDF. */
    p: number;
    /** Its library. */
    l: number;
    /** The full-match generation it was matched in (wvCbIndex.gen). */
    g: number;
    /** The matches: [entry index, cited item id, its copies...] per entry. */
    c: number[][];
}

export interface WvCbIndex {
    recs: Map<number, WvCbRec>;
    /** Cited item id -> the citing attachment ids. */
    rev: Map<number, number[]>;
    /** The full-match generation: bumped for the weekly full match (cited-by.ts
     *  CB_FULL_EVERY_MS); a record of an older one is matched again, from its
     *  stored entries (citations.1). A library change moves it no more: only
     *  the PDFs that can cite what changed are matched again (wvCbMayCite,
     *  cited-by.ts _wvCbTargets). A record of generation 0 was matched by
     *  another matcher's code: matched again, its filter made again. */
    gen: number;
    /** Bumped by every put and drop: what is computed from the index (the
     *  section's works, cited-by.ts _wvCbWorksOf) keys on it. */
    seq: number;
}

export function wvCbIndexNew(): WvCbIndex {
    return { recs: new Map(), rev: new Map(), gen: 1, seq: 0 };
}

function revAdd(ix: WvCbIndex, cited: number, att: number) {
    const a = ix.rev.get(cited);
    if (!a) ix.rev.set(cited, [att]);
    else if (a.indexOf(att) < 0) a.push(att);
}

function revDel(ix: WvCbIndex, cited: number, att: number) {
    const a = ix.rev.get(cited);
    if (!a) return;
    const k = a.indexOf(att);
    if (k >= 0) a.splice(k, 1);
    if (!a.length) ix.rev.delete(cited);
}

/** Put (or replace) the record of citing attachment `att`. */
export function wvCbPut(ix: WvCbIndex, att: number, rec: WvCbRec) {
    wvCbDrop(ix, att);
    ix.recs.set(att, rec);
    for (const m of rec.c || []) for (let i = 1; i < m.length; i++) revAdd(ix, m[i], att);
    ix.seq = (ix.seq || 0) + 1;
}

/** Remove citing attachment `att`; false when it was not there. */
export function wvCbDrop(ix: WvCbIndex, att: number): boolean {
    const old = ix.recs.get(att);
    if (!old) return false;
    for (const m of old.c || []) for (let i = 1; i < m.length; i++) revDel(ix, m[i], att);
    ix.recs.delete(att);
    ix.seq = (ix.seq || 0) + 1;
    return true;
}

// ---- the works citing an item (the Cited by section) ------------------------------

/** One work citing an item: its copies' items, best first (`ids`), the PDF of the
 *  best one that the row opens (`att`, its source `src`), and what it is sorted by
 *  (its year, its compact title). */
export interface WvCbWork { ids: number[]; att: number; src: string; year: number; ct: string }

/** What the works need of a library item: the References index's record
 *  (lib/ref-match.ts, regular items out of the trash only). */
export interface WvCbWorkItem { id: number; lib: number; title: string; ct: string; dois: string[]; first: string; year: string }

/** A title this short (compact) names no copy (ref-match.ts MIN_TITLE). */
const CB_COPY_TITLE = 10;

/** Could `a` and `b` be copies of one work by their title (ref-match.ts copiesOf's
 *  rule: the same compact title; first author, year and DOIs not disagreeing)? */
function cbTitleCopies(a: WvCbWorkItem, b: WvCbWorkItem): boolean {
    if (a.first && b.first && a.first !== b.first) return false;
    if (a.year && b.year && a.year !== b.year) return false;
    if (a.dois.length && b.dois.length && !a.dois.some((d) => b.dois.indexOf(d) >= 0)) return false;
    return true;
}

/** Citing PDFs walked, papers joined, works made or sorted between two steps of
 *  wvCbWorksSteps. */
const WORKS_STEP = 1000;

/** The works citing item `cited` -- ONE per work: the citing papers that are
 *  copies of each other (the same DOI, or the same title by the same first
 *  author, the References matcher's copies) folded into one, a paper with PDFs
 *  in My Library and a group shown once (MJT 2026-11-21). Each work's copies
 *  best first as References orders a reference's copies (refs.ts _wvRefsOrder):
 *  in `prefLib` (the cited item's library), then My Library (`userLib`), then the
 *  groups by library id, then the oldest item; its PDF a structure cache's when
 *  it has one. Newest first -- a bucket a year, each a sort of its own -- then by
 *  title, its compact form (lower case, no accents: the References index's
 *  `ct`) compared as it is: an ICU collation for each comparison would cost what
 *  the rest does. `itemOf`: the library item of a citing paper, null when it is
 *  none (gone, in the trash) -- a standalone PDF (a record with no parent) gets a
 *  stand-in from `standalone`. Linear in the citers, in steps of WORKS_STEP
 *  (cited-by.ts computes a work cited by thousands of PDFs in idle slices: the
 *  plan's stress fixture, 20,000, took 61.5 ms in one call on Zotero 11). */
export function* wvCbWorksSteps(ix: WvCbIndex, cited: number, itemOf: (id: number) => WvCbWorkItem | null | undefined, prefLib: number, userLib: number,
    standalone?: (att: number, rec: WvCbRec) => WvCbWorkItem | null): WvCbSteps<WvCbWork[]> {
    // A copy: the index may change between two steps (a pass running).
    const atts = (ix.rev.get(cited) || []).slice();
    const byPid = new Map<number, { att: number; src: string; it: WvCbWorkItem }>();
    for (let i = 0; i < atts.length; i++) {
        if (i && i % WORKS_STEP === 0) yield;
        const att = atts[i];
        const rec = ix.recs.get(att);
        if (!rec) continue;
        const pid = rec.p || att;
        if (pid === cited) continue;
        const had = byPid.get(pid);
        if (had) {
            // Two PDFs of one paper: the one with real entries opens.
            if (rec.src === "sdt" && had.src !== "sdt") { had.att = att; had.src = "sdt"; }
            continue;
        }
        const it = rec.p ? itemOf(pid) : (standalone ? standalone(att, rec) : null);
        if (!it) continue;
        byPid.set(pid, { att, src: rec.src, it });
    }
    // Copies joined: a union over the shared DOIs and the compatible titles.
    const up = new Map<number, number>();
    const find = (x: number): number => {
        let r = x;
        while (up.get(r) !== r) r = up.get(r) as number;
        for (let y = x; up.get(y) !== r;) { const n = up.get(y) as number; up.set(y, r); y = n; }
        return r;
    };
    // Each group's DOIs, kept at its root: two groups whose DOIs are known on
    // both sides and share none are two works, whatever a title-only copy
    // between them says -- cbTitleCopies is checked pair by pair, and a copy
    // without a DOI joined a Smith's (DOI X) and a Jones's (DOI Y) into one row
    // through the union (review of M1, 2026-11-21).
    const doisAt = new Map<number, Set<string>>();
    const join = (a: number, b: number) => {
        const ra = find(a), rb = find(b);
        if (ra === rb) return;
        const da = doisAt.get(ra), db = doisAt.get(rb);
        if (da && db) {
            let shared = false;
            for (const d of da) if (db.has(d)) { shared = true; break; }
            if (!shared) return;
        }
        up.set(ra, rb);
        if (da) { if (db) { for (const d of da) db.add(d); } else doisAt.set(rb, da); doisAt.delete(ra); }
    };
    const byDoi = new Map<string, number>();
    const byTitle = new Map<string, number[]>();
    let n = 0;
    for (const [pid, v] of byPid) {
        if (++n % WORKS_STEP === 0) yield;
        up.set(pid, pid);
        if (v.it.dois && v.it.dois.length) doisAt.set(pid, new Set(v.it.dois));
        for (const d of v.it.dois || []) { const o = byDoi.get(d); if (o === undefined) byDoi.set(d, pid); else join(pid, o); }
        const ct = v.it.ct || "";
        if (ct.length >= CB_COPY_TITLE) {
            const list = byTitle.get(ct);
            if (!list) byTitle.set(ct, [pid]);
            else {
                for (const o of list) { const w = byPid.get(o); if (w && cbTitleCopies(v.it, w.it)) join(pid, o); }
                // A title that many papers share (an editorial's "Preface") is no copy's: kept short.
                if (list.length < 8) list.push(pid);
            }
        }
    }
    const groups = new Map<number, number[]>();
    n = 0;
    for (const pid of byPid.keys()) {
        if (++n % WORKS_STEP === 0) yield;
        const r = find(pid);
        const g = groups.get(r);
        if (g) g.push(pid); else groups.set(r, [pid]);
    }
    const rank = (pid: number): number[] => {
        const it = (byPid.get(pid) as any).it as WvCbWorkItem;
        return [it.lib === prefLib ? 0 : it.lib === userLib ? 1 : 2, it.lib, pid];
    };
    const byYear = new Map<number, WvCbWork[]>();
    n = 0;
    for (const ids of groups.values()) {
        if (++n % WORKS_STEP === 0) yield;
        if (ids.length > 1) {
            const rk = new Map(ids.map((id) => [id, rank(id)] as [number, number[]]));
            ids.sort((a, b) => { const x = rk.get(a) as number[], y = rk.get(b) as number[]; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
        }
        // The best copy's own PDF opens (its library is the row's).
        const best = byPid.get(ids[0]) as { att: number; src: string; it: WvCbWorkItem };
        const w: WvCbWork = { ids, att: best.att, src: best.src, year: Number(best.it.year) || 0, ct: String(best.it.ct || "") };
        const b = byYear.get(w.year);
        if (b) b.push(w); else byYear.set(w.year, [w]);
    }
    const out: WvCbWork[] = [];
    n = 0;
    for (const y of Array.from(byYear.keys()).sort((a, b) => b - a)) {
        const b = byYear.get(y) as WvCbWork[];
        b.sort((p, q) => (p.ct < q.ct ? -1 : p.ct > q.ct ? 1 : 0) || (p.ids[0] - q.ids[0]));
        for (const w of b) out.push(w);
        n += b.length;
        if (n >= WORKS_STEP) { n = 0; yield; }
    }
    return out;
}

/** wvCbWorksSteps at once. */
export function wvCbWorks(ix: WvCbIndex, cited: number, itemOf: (id: number) => WvCbWorkItem | null | undefined, prefLib: number, userLib: number,
    standalone?: (att: number, rec: WvCbRec) => WvCbWorkItem | null): WvCbWork[] {
    return wvCbRun(wvCbWorksSteps(ix, cited, itemOf, prefLib, userLib, standalone));
}

/** The Cited by section's rows: this many first, then pages of WV_CB_PAGE_ROWS
 *  behind a "Show N more" row (plan §0's bounds: MJT's most cited work has 1,308
 *  citing PDFs). */
export const WV_CB_FIRST_ROWS = 50;
export const WV_CB_PAGE_ROWS = 100;

/** The attachments whose reference lists cite item `id` (any copy of it). */
export function wvCbCiters(ix: WvCbIndex, id: number): number[] {
    return (ix.rev.get(id) || []).slice();
}

/** The entry of `att`'s list that cites `id`, or -1. */
export function wvCbEntryOf(ix: WvCbIndex, att: number, id: number): number {
    const r = ix.recs.get(att);
    if (!r) return -1;
    for (const m of r.c || []) if (m.indexOf(id, 1) > 0) return m[0];
    return -1;
}

/** The store's shard of attachment `att` (the store is cut in `n` files so a
 *  write serialises a small part: cited-by.ts CB_SHARDS). */
export function wvCbShardOf(att: number, n: number): number {
    return ((att % n) + n) % n;
}

/** A shard's document: { v, gen, recs: { "<att>": rec } }. */
export function wvCbShardDoc(ix: WvCbIndex, shard: number, n: number, v: number): any {
    const recs: Record<string, WvCbRec> = {};
    for (const [att, r] of ix.recs) if (wvCbShardOf(att, n) === shard) recs[String(att)] = r;
    return { v, gen: ix.gen, recs };
}

/** Read a shard's document into `ix` (records of another version ignored).
 *  Returns how many were taken. */
export function wvCbShardLoad(ix: WvCbIndex, doc: any, v: number): number {
    if (!doc || doc.v !== v || !doc.recs || typeof doc.recs !== "object") return 0;
    if (Number.isFinite(doc.gen) && doc.gen > ix.gen) ix.gen = doc.gen;
    let n = 0;
    for (const k of Object.keys(doc.recs)) {
        const att = Number(k);
        const r = doc.recs[k];
        if (!Number.isFinite(att) || !r || typeof r.s !== "string" || !Array.isArray(r.c)) continue;
        wvCbPut(ix, att, { s: r.s, src: r.src, p: Number(r.p) || 0, l: Number(r.l) || 0, g: Number(r.g) || 0, c: r.c });
        n++;
    }
    return n;
}

// ---- the filter: which PDFs can cite an item new to the library ---------------
// A record keeps a Bloom filter of what its entries hold that wvRefMatch must
// find before it can name an item (lib/ref-match.ts): the words -- surnames
// among them, joined as hasSurname / firstAuthorIs join a name of several
// words ("van der Meer", "de la Mora", "Castrejón-Pita", "O'Brien") -- the
// DOIs, the volume|page keys and the years. When an item is added or its
// matching data changes, only the records whose filter passes its keys
// (wvCbMayCite) are read and matched again (cited-by.ts _wvCbLibChanged).
// What it cannot foresee -- a first author the matcher finds by OCR distance or
// by an initial (authorIn's approximate branches), a DOI the layout split --
// the weekly full pass catches (cited-by.ts CB_FULL_EVERY_MS).

/** Words that name nothing: never kept, never asked. */
const CB_STOP = new Set(["the", "and", "for", "with", "from", "into", "onto", "its", "their", "this", "that", "these", "those",
    "under", "over", "between", "via", "using", "are", "was", "were", "has", "have", "not", "but", "per", "than", "then", "also",
    "about", "after", "before", "during", "through", "toward", "towards", "within", "without", "new", "use", "based", "some",
    "les", "des", "une", "dans", "sur", "par", "pour", "avec", "und", "der", "die", "das", "von", "zur", "den", "dem", "del", "los", "las", "por", "una"]);
/** Name particles: a word joined to the next one into one name ("van der Meer"). */
const CB_PARTICLES = new Set(["van", "von", "der", "den", "de", "del", "della", "dei", "di", "da", "du", "dos", "das", "la", "le", "lo",
    "ten", "ter", "te", "st", "mc", "mac", "o", "d", "l", "al", "el", "bin", "ben", "ibn", "y", "zu", "af"]);
/** One person's other names (ref-match.ts NAME_FORMS). */
const CB_NAME_FORMS: { [k: string]: string[] } = { strutt: ["rayleigh", "lordrayleigh"], rayleigh: ["strutt"], lordrayleigh: ["strutt", "rayleigh"] };
/** Filter bits per kept token, and hash functions: 1.7 % false positives per
 *  token asked, 1.6 KB a record on MJT's PDFs (8 x 5; 10 x 7 gave 0.6 % and
 *  2.0 KB, 6 x 4 gave 4.4 % and 1.2 KB: plan §12). */
const CB_BITS_PER = 8;
const CB_HASHES = 5;

/** Adobe's private-use small capitals and old-style figures as letters and
 *  digits (ref-match.ts dePUA: the matcher reads an entry so). */
function cbDePUA(s: string): string {
    return s.replace(/[\uf730-\uf739\uf761-\uf77a]/g, (c) => {
        const k = c.charCodeAt(0);
        return String.fromCharCode(k >= 0xf761 ? k - 0xf761 + 97 : k - 0xf730 + 48);
    });
}

/** The words of `s` with their places, compact as the matcher compacts them
 *  (its wordsOf splits on what is not a letter, a mark or a digit). */
function cbWords(s: string): Array<{ w: string; start: number; end: number }> {
    const out: Array<{ w: string; start: number; end: number }> = [];
    const rx = /[\p{L}\p{M}\p{N}]+/gu;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(s))) {
        // A word of ASCII letters and digits compacts to its lower case
        // (wvRefCompact's NFKD and accent stripping change nothing in it): the
        // common case, without them (a fifth of the filter's time, plan §13).
        const w = CB_ASCII.test(m[0]) ? m[0].toLowerCase() : wvRefCompact(m[0]);
        if (w) out.push({ w, start: m.index, end: m.index + m[0].length });
    }
    return out;
}

const CB_ASCII = /^[A-Za-z0-9]+$/;

/** A content word: three letters or more, no stop word, no number. */
function cbContent(w: string): boolean {
    return w.length >= 3 && !CB_STOP.has(w) && !/^\d+$/.test(w);
}

/** `s`'s words as the filter reads them, the same for an entry and a title: a
 *  word the text cut with a mark between its pieces and no space ("Que´re´",
 *  "Castrejo´n-Pita", "O’Brien", "co-flow") or with a line's hyphen ("Tear-
 *  ing") is one word, as in the matcher's compact text. `pieces`: the words as
 *  the text cut them (cbWords), for the names joined over them. */
function cbSeq(s: string): { seq: string[]; pieces: Array<{ w: string; start: number; end: number }> } {
    const pieces = cbWords(s);
    const seq: string[] = [];
    for (let i = 0; i < pieces.length; i++) {
        let w = pieces[i].w;
        while (i + 1 < pieces.length) {
            const sep = s.slice(pieces[i].end, pieces[i + 1].start);
            const glued = sep.length > 0 && !/[\s.,;:()[\]{}<>/]/.test(sep);
            const hyphen = /^[-‐‑]\s+$/.test(sep);
            if (!glued && !hyphen) break;
            i++;
            w += pieces[i].w;
        }
        seq.push(w);
    }
    return { seq, pieces };
}

/** Add to `out` the tokens of one reference entry the filter keeps: its
 *  content words and the pairs of adjacent content words ("drop_impact": a
 *  title is asked by its pairs, so words strewn over a list never pass for
 *  it); names of several words joined -- after a name particle ("van der
 *  Meer", "de la Mora", up to four words) and, at the entry's start, its first
 *  author's first three words as firstAuthorIs joins them ("Dussan V.",
 *  "Angue- lova"); "d:"+DOI, "v:"+volume|page, "y:"+year (the matcher's own
 *  readers of them, lib/ref-match.ts). */
export function wvCbEntryTokens(text: string, out: { add(t: string): unknown }) {
    const raw = cbDePUA(String(text || ""));
    const { seq, pieces } = cbSeq(raw);
    let prev = "";
    for (const w of seq) {
        if (!cbContent(w)) continue;
        out.add(w);
        if (prev) out.add(prev + "_" + w);
        prev = w;
    }
    for (let i = 0; i < pieces.length; i++) {
        let s = pieces[i].w;
        for (let j = i + 1; j < pieces.length && j < i + 4 && CB_PARTICLES.has(pieces[j - 1].w) && !/^\d+$/.test(pieces[j].w); j++) {
            s += pieces[j].w;
            if (s.length >= 3) out.add(s);
        }
    }
    // The first author (ref-match.ts firstAuthorIs / leadAuthor): the first
    // word of two letters or more after the entry's number, with the next two
    // joined to it; the same from the next word when it follows right after.
    const lead = cbWords(raw.slice(0, 200).replace(/^\s*(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\)|@\d{1,4}#|\d{1,4}[.)]?)\s*/, ""));
    const starts = lead.map((x, i) => (x.w.length >= 2 && !/^\d+$/.test(x.w) ? i : -1)).filter((i) => i >= 0).slice(0, 2);
    for (const k of starts) {
        let s = "";
        for (let j = k; j < lead.length && j < k + 3; j++) { s += lead[j].w; if (s.length >= 3) out.add(s); }
    }
    // A DOI or a volume|page key alone can name an item: kept under two names,
    // and asked under both, its false positive is the square of a word's.
    for (const d of wvRefDOIs(raw)) { out.add("d:" + d); out.add("D:" + d); }
    // An arXiv identifier the same (1.3.0-refkeys.1: the matcher's step 1b names an item by it).
    for (const a of wvRefArxivIds(raw)) { out.add("a:" + a); out.add("A:" + a); }
    for (const k of wvRefVolPages(raw)) { out.add("v:" + k); out.add("V:" + k); }
    for (const y of wvRefYears(raw)) out.add("y:" + y);
}

/** The filter of a reference list's entries (the record's `f`, encoded). */
export function wvCbFilterOfEntries(entries: string[]): WvCbFilter {
    const t = new Set<string>();
    for (const e of entries) wvCbEntryTokens(e, t);
    return wvCbFilterOf(t);
}

/** A Bloom filter: `m` bits, `k` hashes; its bits as bytes (`b`), or read
 *  where asked from its encoded text (`s`, the bits from offset `o`): a
 *  library change asks a few bits of each of thousands of filters, and
 *  decoding them whole took 5.3 s of main-thread work for 18,600 records
 *  (plan §13). */
export interface WvCbFilter { m: number; k: number; b?: Uint8Array; s?: string; o?: number }

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Each base64 character's value by its code ("=" and others 0). */
const B64_VAL: Int8Array = (() => {
    const t = new Int8Array(128);
    for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
    return t;
})();

function cbHash(s: string, seed: number): number {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0;
}

/** The tokens of a PDF's entries as the filter needs them: each distinct one's
 *  two hashes (a pair of hashes is one token: two tokens with the same pair set
 *  the same bits). No token string outlives its entry -- a book's 100,000 of
 *  them kept in a Set were all copied out of the nursery by the minor GCs,
 *  which took up to 170 ms in a pass's steps on Zotero 11 (plan §13). */
export class WvCbTokenSink {
    /** The pairs: h1, h2 (odd), in the order first seen. */
    h: Uint32Array = new Uint32Array(2048);
    /** How many pairs. */
    size = 0;
    private seen: Map<number, number | number[]> = new Map();
    add(t: string) {
        const h1 = cbHash(t, 2166136261), h2 = (cbHash(t, 0x9747b28c) | 1) >>> 0;
        const v = this.seen.get(h1);
        if (v === undefined) this.seen.set(h1, h2);
        else if (v === h2 || (typeof v !== "number" && v.indexOf(h2) >= 0)) return this;
        else if (typeof v === "number") this.seen.set(h1, [v, h2]);
        else v.push(h2);
        if (2 * this.size + 2 > this.h.length) { const g = new Uint32Array(this.h.length * 2); g.set(this.h); this.h = g; }
        this.h[2 * this.size] = h1;
        this.h[2 * this.size + 1] = h2;
        this.size++;
        return this;
    }
}

/** Tokens hashed between two steps of a filter's making. */
const FILTER_STEP = 2000;

/** The filter of `tokens`, in steps (`bitsPer`, `hashes`: the measurements' variants). */
export function* wvCbFilterOfSteps(tokens: Set<string> | WvCbTokenSink, bitsPer = CB_BITS_PER, hashes = CB_HASHES): WvCbSteps<WvCbFilter> {
    const m = Math.max(64, Math.ceil(tokens.size * bitsPer / 8) * 8);
    const b = new Uint8Array(m / 8);
    if (tokens instanceof WvCbTokenSink) {
        for (let i = 0; i < tokens.size; i += FILTER_STEP) {
            if (i) yield;
            cbFilterAddPairs(b, m, hashes, tokens.h, i, Math.min(tokens.size, i + FILTER_STEP));
        }
        return { m, k: hashes, b };
    }
    const all = Array.from(tokens);
    for (let i = 0; i < all.length; i += FILTER_STEP) {
        if (i) yield;
        cbFilterAdd(b, m, hashes, all, i, Math.min(all.length, i + FILTER_STEP));
    }
    return { m, k: hashes, b };
}

/** Set the bits of hash pairs `from` to `to` (excluded). */
function cbFilterAddPairs(b: Uint8Array, m: number, hashes: number, h: Uint32Array, from: number, to: number) {
    for (let j = from; j < to; j++) {
        const h1 = h[2 * j], h2 = h[2 * j + 1];
        for (let i = 0; i < hashes; i++) { const x = (h1 + Math.imul(i, h2)) >>> 0; const bit = x % m; b[bit >> 3] |= 1 << (bit & 7); }
    }
}

/** Set the bits of tokens `from` to `to` (excluded). */
function cbFilterAdd(b: Uint8Array, m: number, hashes: number, all: string[], from: number, to: number) {
    for (let j = from; j < to; j++) {
        const t = all[j];
        const h1 = cbHash(t, 2166136261), h2 = cbHash(t, 0x9747b28c) | 1;
        for (let i = 0; i < hashes; i++) { const x = (h1 + Math.imul(i, h2)) >>> 0; const bit = x % m; b[bit >> 3] |= 1 << (bit & 7); }
    }
}

/** The filter of `tokens`, at once. */
export function wvCbFilterOf(tokens: Set<string> | WvCbTokenSink, bitsPer = CB_BITS_PER, hashes = CB_HASHES): WvCbFilter {
    return wvCbRun(wvCbFilterOfSteps(tokens, bitsPer, hashes));
}

/** Byte `i` of the filter's bits (from its text: the two characters that hold it). */
function cbByte(f: WvCbFilter, i: number): number {
    if (f.b) return f.b[i];
    const s = f.s as string, r = i % 3, at = (f.o as number) + 4 * ((i - r) / 3) + r;
    const c1 = B64_VAL[s.charCodeAt(at) & 127], c2 = B64_VAL[s.charCodeAt(at + 1) & 127];
    return (r === 0 ? (c1 << 2) | (c2 >> 4) : r === 1 ? (c1 << 4) | (c2 >> 2) : (c1 << 6) | c2) & 255;
}

/** Might the filter hold `token`? (false: certainly not) */
export function wvCbFilterHas(f: WvCbFilter, token: string): boolean {
    const h1 = cbHash(token, 2166136261), h2 = cbHash(token, 0x9747b28c) | 1;
    for (let i = 0; i < f.k; i++) { const x = (h1 + Math.imul(i, h2)) >>> 0; const bit = x % f.m; if (!(cbByte(f, bit >> 3) & (1 << (bit & 7)))) return false; }
    return true;
}

/** Bytes encoded between two steps (a multiple of 3). */
const ENCODE_STEP = 30000;

/** "<m>.<k>.<base64 bits>", the record's `f`, in steps. */
export function* wvCbFilterEncodeSteps(f: WvCbFilter): WvCbSteps<string> {
    if (!f.b) return f.m + "." + f.k + "." + String(f.s).slice(f.o);
    const b = f.b;
    const parts: string[] = [];
    for (let i0 = 0; i0 < b.length; i0 += ENCODE_STEP) {
        if (i0) yield;
        parts.push(cbEncodeRange(b, i0, Math.min(b.length, i0 + ENCODE_STEP)));
    }
    return f.m + "." + f.k + "." + parts.join("");
}

/** Bytes `from` to `to` of `b` in base64 (`from` a multiple of 3). */
function cbEncodeRange(b: Uint8Array, from: number, to: number): string {
    let s = "";
    for (let i = from; i < to; i += 3) {
        const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
    }
    return s;
}

export function wvCbFilterEncode(f: WvCbFilter): string {
    return wvCbRun(wvCbFilterEncodeSteps(f));
}

/** A filter from its encoded text, its bits left there (read where asked);
 *  null when the text is not one -- a cut one included (as many characters
 *  as its bits need). */
export function wvCbFilterDecode(s: any): WvCbFilter | null {
    const t = String(s || "");
    const h = /^(\d{1,9})\.(\d{1,2})\./.exec(t);
    if (!h) return null;
    const m = Number(h[1]), k = Number(h[2]), o = h[0].length;
    if (!m || m % 8 || !k || t.length - o !== 4 * Math.ceil(m / 24)) return null;
    return { m, k, s: t, o };
}

/** What a library item gives the filter to answer: its compact first author
 *  and the other forms of it the matcher accepts, DOIs, arXiv identifiers,
 *  volume|page keys, year, and the words and word pairs of its title. */
export interface WvCbItemKeys { first: string; forms: string[]; dois: string[]; axs: string[]; vps: string[]; year: number; words: string[]; pairs: string[]; ctLen: number }

/** An item's keys from its record in the library index (lib/ref-match.ts:
 *  `title`, `ct`, `dois`, `first`, `forms`, `year`, `vps` -- since refsacc.1
 *  `vps`, several keys, and `forms`; an older record's `vp` read too; since
 *  refkeys.1 `axs`). */
export function wvCbItemKeys(r: { title: string; ct: string; dois: string[]; first: string; year: string; vps?: string[]; vp?: string; forms?: string[]; axs?: string[] }): WvCbItemKeys {
    const seq = cbSeq(cbDePUA(String(r.title || ""))).seq.filter(cbContent);
    const words = Array.from(new Set(seq));
    const pairs: string[] = [];
    for (let i = 0; i + 1 < seq.length; i++) if (pairs.indexOf(seq[i] + "_" + seq[i + 1]) < 0) pairs.push(seq[i] + "_" + seq[i + 1]);
    const vps = Array.isArray(r.vps) ? r.vps.slice() : (r.vp ? [String(r.vp)] : []);
    return { first: String(r.first || ""), forms: Array.isArray(r.forms) ? r.forms.slice() : [], dois: (r.dois || []).slice(), axs: Array.isArray(r.axs) ? r.axs.slice() : [], vps,
        year: Number(r.year) || 0, words, pairs, ctLen: String(r.ct || "").length };
}

/** Can a reference list whose filter is `f` name the item of `k`? False only
 *  when none of the matcher's ways can (lib/ref-match.ts wvRefMatch):
 *  - its DOI, with its first author or year (doiNames); since refkeys.1 its arXiv
 *    identifier the same (step 1b);
 *  - a volume|page key, with its first author; an item with no creator, with
 *    its year (step 3);
 *  - its title -- 75 % of its word pairs; a title of one content word, that
 *    word with the first author -- the name asked only for a short title (step
 *    2; a long title is taken without the name: authorIn's own approximations);
 *  - its title's first pairs with its first author and year (step 2c, a title
 *    the entry stops inside of);
 *  - its first author and year with 60 % of the title's words and 40 % of its
 *    pairs (steps 2b, 4, 5: another form of the title, an approximate one, a
 *    short one; all three want the year the item has).
 *  The first author: its compact name or one of its other forms (a surname
 *  without its particle or trailing initial). One of fewer than three letters,
 *  or in a script written without spaces, cannot be told: taken as there (the
 *  matcher does not ask either). A name OCR misspelt (ref-match.ts
 *  firstAuthorNear) is not foreseen: the weekly full match's.
 *  Measured on 300 of MJT's PDFs with the dev.19 matcher (plan §12, §13):
 *  2,595 of a full re-match's 2,610 matches let through (99.4 %); 0.095 % of
 *  the PDFs pass for an item they do not cite. */
export function wvCbMayCite(f: WvCbFilter, k: WvCbItemKeys): boolean {
    const has = (t: string) => wvCbFilterHas(f, t);
    const first = k.first;
    const sur = first.length < 3 || /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u.test(first)
        || has(first) || (CB_NAME_FORMS[first] || []).some(has) || k.forms.some(has);
    const yearX = !k.year || has("y:" + k.year);
    const year1 = yearX || has("y:" + (k.year - 1)) || has("y:" + (k.year + 1));
    if (k.dois.some((d) => has("d:" + d) && has("D:" + d)) && (!first || !k.year || sur || year1)) return true;
    if ((k.axs || []).some((a) => has("a:" + a) && has("A:" + a)) && (!first || !k.year || sur || year1)) return true;
    if (k.vps.some((v) => has("v:" + v) && has("V:" + v)) && (first ? sur : yearX)) return true;
    const n = k.words.length, nq = k.pairs.length;
    let got = 0, gotQ = 0;
    for (const w of k.words) if (has(w)) got++;
    for (const q of k.pairs) if (has(q)) gotQ++;
    if (nq) { if (gotQ >= Math.ceil(0.75 * nq) && (k.ctLen >= 25 || sur)) return true; }
    else if (n && got === n && sur) return true;
    if (!n) return sur && yearX;
    if (sur && yearX && nq >= 2 && k.pairs.slice(0, 3).every(has)) return true;
    return sur && yearX && got >= Math.ceil(0.6 * n) && (nq < 2 || gotQ >= Math.ceil(0.4 * nq));
}

// ---- what an entry is known by, without the matcher (the entries store) ------------
// Each PDF's entries are kept with their keys (cited-by.ts _wvCbEntriesWrite; plan
// work/citations-plan-2026-11-21.md, M1): what tells two entries of different papers
// for the same work apart from the library's items -- the unmatched ones grouped by
// work (M3), a reference named again after the user corrected it (M2). Best effort:
// the matcher (lib/ref-match.ts) reads the raw text, never these.

/** One entry's keys: [first author, year, title head, DOIs, volume|page keys] --
 *  the author compact as the matcher compacts a surname (a particle joined to the
 *  name: "van der Meer" -> "vandermeer"), the first year it writes, the compact
 *  start of what reads as its title (TITLE_HEAD characters), DOIs and up to
 *  MAX_VPS volume|page keys, each list space-separated; "" for what it lacks. */
export type WvCbEntryKey = [string, string, string, string, string];
const TITLE_HEAD = 40;
const MAX_VPS = 4;

/** A piece of an entry cut where an initial ended it ("Adams, J" of "Adams, J. 2016"). */
const CB_INITIAL_END = /(?:^|[\s,.(-])\p{Lu}$/u;

/** The keys of one entry (WvCbEntryKey). */
export function wvCbEntryKeys(text: string): WvCbEntryKey {
    const raw = cbDePUA(String(text || ""));
    const body = raw.replace(/^\s*(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\)|@\d{1,4}#|\d{1,4}[.)]?)\s*/, "");
    // The first author: the first word of two letters or more (an initial is one),
    // a particle joined to the words after it.
    let first = "";
    const lead = cbWords(body.slice(0, 200));
    for (let i = 0; i < lead.length; i++) {
        const w = lead[i].w;
        if (w.length < 2 || /^\d+$/.test(w)) continue;
        first = w;
        for (let j = i + 1; j < lead.length && j < i + 4 && CB_PARTICLES.has(lead[j - 1].w) && !/^\d+$/.test(lead[j].w); j++) first += lead[j].w;
        break;
    }
    const years = wvRefYears(raw);
    const dois = wvRefDOIs(raw);
    const vps = wvRefVolPages(raw).slice(0, MAX_VPS);
    return [first, years.length ? years[0] : "", cbTitleHead(body), dois.join(" "), vps.join(" ")];
}

/** Entries keyed between two steps: 0.048 ms an entry in Node on the 53,433
 *  entries of 1,000 of MJT's PDFs (2026-11-21), a book's 3,000 in one call
 *  would be ~150 ms. */
const KEYS_STEP = 64;

/** wvCbEntryKeys of every entry, in steps. */
export function* wvCbEntryKeysSteps(entries: string[]): WvCbSteps<WvCbEntryKey[]> {
    const out: WvCbEntryKey[] = [];
    for (let i = 0; i < entries.length; i++) {
        if (i && i % KEYS_STEP === 0) yield;
        out.push(wvCbEntryKeys(entries[i]));
    }
    return out;
}

/** The entries store's document of one PDF (cited-by.ts _wvCbEntWrite): the
 *  stamp of the file its entries were read from and the fingerprint of the code
 *  that read them (`lf`), the keys' (`kf`), the entries as read (`x`, in the
 *  order a record's matches number them), their keys (`k`). */
export interface WvCbEntriesDoc { v: number; s: string; src: string; lf: string; kf: string; x: string[]; k: WvCbEntryKey[] }

/** The entries of `doc` when they are those of a PDF whose file has stamp `s`,
 *  read by the code of LIST fingerprint `lf` (store format `v`); else null: the
 *  PDF is read again. */
export function wvCbEntriesUsable(doc: any, v: number, s: string, lf: string): string[] | null {
    if (!doc || typeof doc !== "object" || doc.v !== v || doc.s !== s || doc.lf !== lf || !Array.isArray(doc.x)) return null;
    for (const e of doc.x) if (typeof e !== "string") return null;
    return doc.x;
}

/** The compact start of what reads as `s`'s title: a quoted title ("“Emergence of
 *  two lamellas,”", AIP, IEEE); else, of the pieces between sentence ends, the one
 *  with the most words in lower case -- titles are in sentence case; an author list
 *  is names and initials, a journal its abbreviations -- leaving out a piece an
 *  initial ended (an author's) and a leading year or label; in a script without
 *  case, the piece with the most letters. "" when nothing reads as one (APS: no
 *  title printed). */
function cbTitleHead(s: string): string {
    // Links and DOIs out, and GB/T 7714's type marks ("液滴撞击研究[J]. 力学学报").
    const t = s.replace(/\bhttps?:\/\/\S+/gi, " ").replace(/\b10\.\d{4,9}\/\S+/g, " ").replace(/\[[A-Z]{1,2}(?:\/OL)?\]/g, " ");
    const q = /[“"«]([^”"»]{12,300})[”"»]/u.exec(t);
    if (q) return wvRefCompact(q[1]).slice(0, TITLE_HEAD);
    let best = "", bestScore = 0, uncased = "", uncasedN = 0;
    for (const piece of t.split(/\.\s+|[。．]|\(\s*(?:1[6-9]|20)\d\d[a-z]?\s*\)\.?/u)) {
        const p = piece.trim();
        if (!p || CB_INITIAL_END.test(p)) continue;
        const words = p.match(/[\p{L}\p{M}]+/gu) || [];
        let lower = 0, letters = 0;
        for (const w of words) { letters += w.length; if (w.length >= 2 && /^\p{Ll}/u.test(w)) lower++; }
        if (!/[\p{Lu}\p{Ll}]/u.test(p)) { if (letters > uncasedN) { uncasedN = letters; uncased = p; } continue; }
        if (words.length >= 3 && lower > bestScore) { bestScore = lower; best = p; }
    }
    const pick = bestScore >= 2 ? best : uncasedN >= 4 ? uncased : "";
    // A leading year, label or page left by the cut ("2016 Drop impact ..."), never a
    // title's own first characters ("3D printing ...").
    return wvRefCompact(pick.replace(/^(?:[\s,;:.()–-]|\d+(?=[\s,;:.()–-]))+/u, "")).slice(0, TITLE_HEAD);
}

// ---- the full-text source ----------------------------------------------------

/** How a full text's reference section was found. */
export type WvCbSectionHow = "heading" | "numbered" | "none";

/** The reference section is looked for after this share of the text (a table
 *  of contents or an abstract that says "References" comes before it). */
const SECTION_FROM = 0.3;
/** A bracketed list without a heading starts in the text's last part. */
const NUMBERED_FROM = 0.4;
/** Entries taken from one text, at most (a book's bibliography). */
export const WV_CB_MAX_TEXT_ENTRIES = 3000;
const MAX_TEXT_ENTRIES = WV_CB_MAX_TEXT_ENTRIES;
/** An entry longer than this is cut at a sentence end before it. */
const MAX_ENTRY = 700;

/** A text this long is a book or a thesis: a reference list per chapter. */
const LONG_TEXT = 150000;
/** In such a text, headings are looked for past this share (its table of contents). */
const LONG_FROM = 0.05;
/** One chapter's reference list read, at most (up to the next heading). */
const REGION_MAX = 120000;
/** Lines looked at between two steps of the heading scan. */
const HEAD_STEP_LINES = 400;
/** Characters of a section scanned for its cuts between two steps, and what a
 *  match may read before and after them. */
const CHUNK_WINDOW = 16000;
const CHUNK_LOOK = 400;
/** A numbered list's next label is looked for this far after the last one. */
const SEQ_GAP = 3000;
/** A surname's particle written in lowercase before it ("de Gennes", "van der Meer"). */
const CB_PART = "(?:(?:van|von|de|der|den|del|della|da|di|du|dos|das|le|la)\\s)";
/** An accent the PDF's text put apart from its letter, a space on either side
 *  ("CASTREJ ́ON-PITA", "Mart ́ınez-Baza ́n", "Og ̃ uz", "MOL ́A ˇCEK"). */
const CB_ACC = "\\s?[\\p{M}\\u00b4\\u02c7\\u00a8\\u02dc\\u02c6\\u02d8\\u00b8\\u02da]\\s?";
/** A surname as a reference list writes it: particles, then a capital, letters and
 *  apart accents. Every author rule of the cut uses it (the survey's entries run
 *  together at "de Gennes", "van der Meer", "CASTREJ ́ON-PITA", 2026-11-20 night). */
const CB_NAME = CB_PART + "*\\p{Lu}(?:[\\p{L}'’-]|" + CB_ACC + ")+";
/** A journal's words set in capitals in old lists ("R. SOC.", "PROC.", "PHIL. MAG."):
 *  no author's name there. */
const CB_CAPS_JOURNAL = "(?:SOC|SOCA|PROC|PHIL|PHYS|TRANS|MECH|ROY|ACAD|SCI|ANN|REV|CHEM|MATH|APPL|ENGNG|ENG|AM|INST|MAG|NAT|AIAA|SIAM|IEEE|ASME|NASA|NACA|AIP|APS|IOP)\\b";
/** A year as an author-year entry writes it, a letter after it ("2008b"). */
const CB_YEAR = "(?:1[6-9]|20)\\d\\d[a-z]?\\b";

/** The reference sections of `text`, as [start, end] regions:
 *  - after the last references heading past SECTION_FROM of the text -- a
 *    line of its own ("References", "REFERENCES", "7 References"), or a line
 *    that starts with one and goes on with an entry -- to the text's end; with
 *    none there, the last one anywhere (a short paper, its list most of it);
 *  - in a book or a thesis (LONG_TEXT), after EVERY such heading past
 *    LONG_FROM, each to the next heading or REGION_MAX further: a list per
 *    chapter (five of MJT's 70 PDFs, 0 to 1 of 34 cited items found from the
 *    last list alone, plan §7);
 *  - with no heading, at a bracketed "[1]" past NUMBERED_FROM followed by
 *    "[2]" and "[3]" (APS: no heading, the list after the footnotes).
 *  None ("none") when nothing is found: a paper's body is never taken for its
 *  references. In steps: a book's 5 MB are HEAD_STEP_LINES lines a step. */
export function* wvCbSectionsSteps(text: string): WvCbSteps<{ regions: Array<[number, number]>; how: WvCbSectionHow }> {
    const r = yield* cbSectionsFound(text);
    return { regions: cbCutAtContents(String(text || ""), r.regions), how: r.how };
}

/** Where a journal's volume contents follow an article's references: Annual Reviews
 *  prints its volume's table of contents after every article ("Annual Review of Fluid
 *  Mechanics / Volume 40, 2008 / Contents / Flows of Dense Granular Media / Yoël
 *  Forterre and Olivier Pouliquen 1 / ..."), and the full-text path read its titles as
 *  references -- every Annual Reviews article "cited" the other articles of its
 *  volume (the survey's precision audit, 2026-11-20 night: 16 wrong marks in 5 papers). */
const CB_CONTENTS = /Annual Review of [\p{L} ]{3,60}?\s+(?:Volume \d{1,3},\s*(?:19|20)\d\d\s+CONTENTS|Volume \d{1,3},\s*(?:19|20)\d\d\s+Contents|(?:Contents|CONTENTS)\s+Volume \d{1,3},\s*(?:19|20)\d\d)/gu;

/** `regions` each ended where a volume's contents start inside it (CB_CONTENTS). */
function cbCutAtContents(t: string, regions: Array<[number, number]>): Array<[number, number]> {
    if (!regions.length || t.indexOf("Annual Review of") < 0) return regions;
    const marks: number[] = [];
    CB_CONTENTS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CB_CONTENTS.exec(t))) marks.push(m.index);
    if (!marks.length) return regions;
    return regions.map(([a, b]) => {
        const k = marks.find((x) => x > a && x < b);
        return [a, k === undefined ? b : k] as [number, number];
    });
}

function* cbSectionsFound(text: string): WvCbSteps<{ regions: Array<[number, number]>; how: WvCbSectionHow }> {
    const t = String(text || "");
    const long = t.length >= LONG_TEXT;
    const from = Math.floor(t.length * (long ? LONG_FROM : SECTION_FROM));
    function* headsFrom(at: number): WvCbSteps<number[]> {
        const heads: number[] = [];
        const lineRx = /[^\n\f]+/g;
        // From the first line break past `at` (a book's text runs to 800,000
        // characters: the lines before are not walked).
        const nl = at ? t.indexOf("\n", at) : 0;
        lineRx.lastIndex = nl < 0 ? t.length : nl;
        while (cbHeadLines(t, lineRx, heads, HEAD_STEP_LINES)) yield;
        return heads;
    }
    let heads = yield* headsFrom(from);
    // None past SECTION_FROM: a short paper whose list is most of its text (a
    // letter, a comment; the suite's two-page fixtures) has its heading before
    // it -- the last one anywhere then.
    if (!heads.length && !long) heads = yield* headsFrom(0);
    let m: RegExpExecArray | null;
    if (heads.length) {
        if (!long) return { regions: [[heads[heads.length - 1], t.length]], how: "heading" };
        const regions: Array<[number, number]> = heads.map((h, i) => [h, i + 1 < heads.length ? Math.min(heads[i + 1], h + REGION_MAX) : t.length] as [number, number]);
        return { regions, how: "heading" };
    }
    const nfrom = Math.floor(t.length * NUMBERED_FROM);
    const rx = /\[1\]\s/g;
    rx.lastIndex = nfrom;
    while ((m = rx.exec(t))) {
        yield;
        const i2 = t.indexOf("[2]", m.index + 3);
        const i3 = i2 >= 0 ? t.indexOf("[3]", i2 + 3) : -1;
        if (i2 >= 0 && i3 >= 0 && i2 - m.index < 4000 && i3 - i2 < 4000) return { regions: [[m.index, t.length]], how: "numbered" };
    }
    // The other numberings a list prints with no heading at all (AIP, APS, Nature,
    // PNAS, ACS): in the survey of MJT's library, 123 papers whose full text gave
    // no section -- 535 of the 840 cited works the full-text path missed
    // (work/refs-overnight-2026-11-20.md).
    let best = -1;
    for (const form of HEADLESS_FORMS) {
        yield;
        const at = cbHeadlessStart(t, nfrom, form);
        if (at >= 0 && (best < 0 || at < best)) best = at;
    }
    if (best >= 0) return { regions: [[best, t.length]], how: "numbered" };
    return { regions: [], how: "none" };
}

/** The label forms of a numbered list printed with no heading, each as the
 *  pattern of label `n` (its match starts where the entry starts, after what
 *  comes before the label):
 *  - "1. Wirth, W., ..." (Nature, PNAS, Science);
 *  - "1A. Vogel and V. ..." / "20 S. Chandra and ..." (AIP's superscript glued to
 *    the first initial; APS's and RSC's number and a space);
 *  - "(18) Krol, A.; ..." (ACS).
 *  A line starts after a page break too: "\f1 C. Josserand" (APS, Driscoll et al.
 *  2010, the list at a page's top). */
const HEADLESS_FORMS: Array<(n: number) => RegExp> = [
    (n) => new RegExp("(?<=^|[\\n\\f]|[.)]\\s)\\s*" + n + "\\.\\s+(?=\\p{Lu})", "gu"),
    (n) => new RegExp("(?<=^|[\\n\\f]|[.)”\"]\\s)" + n + "\\s?(?=\\p{Lu}\\.\\s)", "gu"),
    (n) => new RegExp("(?<=^|[\\n\\f]|[.]\\s)\\(" + n + "\\)\\s+(?=\\p{Lu})", "gu"),
];

/** A year a reference prints. */
const REF_YEAR = /\b(?:1[6-9]\d\d|20\d\d)\b/;
/** Labels 2 and 3 follow label 1 within this many characters each. */
const HEADLESS_GAP = 4000;

/** Where a numbered list in `form` starts in `t` past `from`: a label 1 followed
 *  by labels 2 and 3 of the same form, each within HEADLESS_GAP, the first two
 *  entries each printing a year -- a paper's numbered sections, its figure
 *  captions ("FIG. 1. Sketch ...") and equations print none, and a paper's body
 *  is never taken for its references. -1 when none. */
function cbHeadlessStart(t: string, from: number, form: (n: number) => RegExp): number {
    const r1 = form(1);
    r1.lastIndex = from;
    let m1: RegExpExecArray | null;
    let tries = 0;
    // Labels 2 and 3 are looked for in their window only (a few characters of context
    // before it for the lookbehind): a book with no heading would otherwise be scanned
    // to its end for every label 1.
    const within = (rx: RegExp, at: number): number => {
        const lo = Math.max(0, at - 4);
        const w = t.slice(lo, at + HEADLESS_GAP);
        rx.lastIndex = at - lo;
        const m = rx.exec(w);
        return m ? lo + m.index : -1;
    };
    while ((m1 = r1.exec(t)) && tries++ < 50) {
        const a1 = m1.index;
        const a2 = within(form(2), a1 + 1);
        if (a2 < 0) continue;
        const a3 = within(form(3), a2 + 1);
        if (a3 < 0) continue;
        if (!REF_YEAR.test(t.slice(a1, a2)) || !REF_YEAR.test(t.slice(a2, a3))) continue;
        return a1;
    }
    return -1;
}

/** Read up to `n` lines of `t` from `lineRx`'s place, the headings' ends put
 *  in `heads`; false once the text is done. */
function cbHeadLines(t: string, lineRx: RegExp, heads: number[], n: number): boolean {
    let m: RegExpExecArray | null;
    for (let k = 0; k < n; k++) {
        if (!(m = lineRx.exec(t))) return false;
        const line = m[0];
        if (line.length <= 60 && wvRefListIsTitle(line)) { heads.push(m.index + line.length); continue; }
        // "References 1. Smith ..." / "REFERENCES [1] ..." / "References Aarts, D. ...":
        // the heading glued to the first entry by the text's layout.
        const g = /^\s*(?:\d+\.?\s+|[IVX]+\.\s+)?([\p{L}][\p{L} ]{4,30}?)(?=\s+(?:\[\d|\d{1,3}\.\s|\p{Lu}[\p{L}'’-]+,\s))/u.exec(line);
        if (g && wvRefListIsTitle(g[1])) heads.push(m.index + g[0].length);
    }
    return true;
}

/** wvCbSectionsSteps at once. */
export function wvCbSections(text: string): { regions: Array<[number, number]>; how: WvCbSectionHow } {
    return wvCbRun(wvCbSectionsSteps(text));
}

/** Where `text`'s (first) reference section starts, and how it was found
 *  (wvCbSections); -1 with "none". */
export function wvCbSection(text: string): { start: number; how: WvCbSectionHow } {
    const r = wvCbSections(text);
    return { start: r.regions.length ? r.regions[0][0] : -1, how: r.how };
}

/** Cut a reference section into entries, by what numbers its list:
 *  - bracketed numbers ("[12]", three or more): before each, and nowhere else
 *    -- an APS entry's authors are initials first ("R. D. Deegan, O.
 *    Bakajin"), and a cut at a name after an initial's period shredded them;
 *    the numbering rules below took the full text from 61.7 % to 90.0 % of
 *    the matches the structure data finds on MJT's 70 PDFs with both (plan §7);
 *  - numbers with a dot at a line's start or after a sentence's end ("12. ",
 *    "805-12. 302. Cornelis MC", three or more): before each;
 *  - none: before an entry's first author after a sentence's end or at a
 *    line's start -- author-year ("Bird, J. C., ...", "AGRAWAL, D. C. & ...")
 *    or Vancouver ("Doherty M, Smith PM.") -- never after an initial ("R. D.
 *    Deegan") nor after an entry's own number.
 *  An entry that the layout ran into the next one stays one entry: the
 *  matcher still finds its titles; only the first-author checks may refuse
 *  one (fewer matches, never a wrong one). Long run-together entries are
 *  also the slow ones to match (MJT's PDFs, plan §7), hence MAX_ENTRY.
 *  In steps: the section is scanned CHUNK_WINDOW characters a step (`win`: the
 *  suite's smaller windows). */
export function* wvCbChunksSteps(section: string, win = CHUNK_WINDOW): WvCbSteps<string[]> {
    const s = String(section || "").replace(/\f/g, "\n");
    // Every match of `rx` in the section, in order, exactly as one scan of the
    // whole finds them: a window of `win` characters at a time, each scan
    // started where the last match ended (or the window starts), seeing
    // CHUNK_LOOK characters on either side (the lookbehinds and lookaheads).
    function* scan(rx: RegExp, each: (m: RegExpExecArray, at: number) => void): WvCbSteps<void> {
        let p = 0;
        for (let a = 0; a < s.length; a += win) {
            p = cbScanWindow(s, rx, a, Math.min(s.length, a + win), p, each);
            yield;
        }
    }
    const cuts = new Set<number>([0]);
    const add = (rx: RegExp) => scan(rx, (m, at) => { cuts.add(at + (m[1] ? m[1].length : 0)); });
    // A numbering counts when its numbers run 1, 2, 3 ... for the most part (a
    // label the layout lost may skip one): "Vol. 2. Springer" or a "[3]" inside
    // an author-year list are no numbering (a thesis's 442 entries ran into a
    // few long ones on a count alone).
    // And the numbered pieces read as references: 30 % of them at least print a year
    // -- a textbook chapter's numbered exercises after its author-year list ("1. Using
    // indicial notation, show that ...") print none, and took the list for numbered
    // (the 300 random PDFs, 2026-11-20 night; low, for old lists that print no year).
    function* numbered(rx: RegExp): WvCbSteps<boolean> {
        const ns: number[] = [];
        const at: number[] = [];
        yield* scan(rx, (m, p) => { ns.push(Number(m[1])); at.push(p); });
        if (ns.length < 3) return false;
        let up = 0;
        for (let i = 1; i < ns.length; i++) if (ns[i] === ns[i - 1] + 1) up++;
        if (up < 0.6 * (ns.length - 1)) return false;
        let years = 0;
        for (let i = 0; i < at.length; i++) {
            if (REF_YEAR.test(s.slice(at[i], Math.min(at[i] + 1500, i + 1 < at.length ? at[i + 1] : s.length)))) years++;
            if (i % 500 === 499) yield;
        }
        return years >= 0.3 * at.length;
    }
    // Labels 1, 2, 3 ... in turn, each `lab(k)` looked for within SEQ_GAP of the
    // last one found: a cut at each; a label not there is skipped once, two in a
    // row end the walk.
    function* seq(lab: (k: number) => RegExp): WvCbSteps<void> {
        let p = 0, k = 1, miss = 0, n = 0;
        while (k <= MAX_TEXT_ENTRIES && miss < 2 && p < s.length) {
            const rx = lab(k);
            const w = s.slice(Math.max(0, p - 4), p + SEQ_GAP);
            rx.lastIndex = Math.min(4, p);
            const m = rx.exec(w);
            if (m) { const at = Math.max(0, p - 4) + m.index; cuts.add(at); p = at + 1; miss = 0; }
            else miss++;
            k++;
            if (++n % 200 === 0) yield;
        }
    }
    const rx = (src: string) => new RegExp(src, "gu");
    // A capital, or a particle starting a surname ("16. von Kann", "(19) de Goede").
    const CAP = "(?:\\p{Lu}|" + CB_PART + ")";
    if (yield* numbered(/\[(\d{1,4})\]\s/g)) yield* add(/(\s*)\[\d{1,4}\]\s/g);
    // ... with a space after the period, or none at all ("(2013). 2.Chaudhury, M. K.",
    // Nature) -- never "maybe one": a book chapter's contents ("1. Introduction
    // 2. Kelvin's ...") then read as its numbering, and its author-year list ran
    // together (the 300 random PDFs, a fluid-mechanics textbook, 7 matches lost).
    // After "[CrossRef] " too (MDPI: "... 336. [CrossRef] 16. Yarin, A.L.").
    else if ((yield* numbered(rx("(?:^|\\n|[.)\\]]\\s)\\s*(\\d{1,4})\\.\\s+" + CAP))) || (yield* numbered(/(?:^|\n|[.)]\s)(\d{1,4})\.(?=\p{Lu})/gu))) {
        yield* add(rx("((?:^|\\n)\\s*)\\d{1,4}\\.\\s+(?=" + CAP + ")"));
        // Science's "(2016). 2. D. Foresti, ...": the list is a numbered one, any capital goes.
        yield* add(rx("((?:[.)\\]]\\s))\\d{1,4}\\.\\s+(?=" + CAP + ")"));
        // Each next number in turn, also with no space after its period ("(2013).
        // 2.Chaudhury, M. K.", Nature) or right after the pages ("772–775 4. Bertola
        // V", PNAS): the survey's entries run together.
        yield* seq((k) => rx("(?<=^|\\n|[.)”\"!;\\d\\]]\\s|[.)])" + k + "\\.\\s?(?=" + CAP + ")"));
    }
    // AIP's superscript glued to the first initial ("1W. K. Melville", "10M. V.
    // Trevorrow"; ref-list.ts's "glued" labels), RSC's number and a space ("18
    // E. Bormashenko"), initials with no space between ("1 G.C. Stokes"): before each.
    else if (yield* numbered(/(?:^|\n|[.)”"\]]\s)(\d{1,3})\s?\p{Lu}\.(?:\s|\p{Lu}\.|-\p{Lu}\.)/gu)) {
        yield* add(/((?:^|\n|[.)”"\]]\s))\d{1,3}\s?(?=\p{Lu}\.(?:\s|\p{Lu}\.|-\p{Lu}\.))/gu);
        // The numbers run 1, 2, 3: each next one cuts too where the entry does not
        // start with an initial and a space -- "25H.-R. Liu", "7M.-J. Thoraval",
        // "14Fundamentals of Inkjet Printing, edited by", "13Lord Rayleigh" (AIP); in
        // the survey of MJT's library 173 cited works missed in entries run together.
        yield* seq((k) => rx("(?<=^|\\n|[.)”\"!;\\]]\\s)" + k + "\\s?(?=" + CAP + ")"));
    }
    // ACS's "(18) Krol, A.; ... 1990, 19, 93-99. (19) Rabinovich, Y. I.; ...", "(19)WESZEL".
    else if (yield* numbered(rx("(?:^|\\n|[.]\\s)\\((\\d{1,4})\\)\\s*" + CAP))) yield* add(rx("((?:^|\\n|[.]\\s))\\(\\d{1,4}\\)\\s*(?=" + CAP + ")"));
    // Japanese "1）", "8)" at a line's start (1.2.1-citd.1; Zotero's text writes "1）" as "1)"), the
    // entry's first letter in any script ("1)日本老年医学会 フレイルに関する ...", "8) 山中英生：").
    else if (yield* numbered(/(?:^|\n)\s*(\d{1,4})\)\s?(?=[\p{L}「『(])/gu)) yield* add(/((?:^|\n)\s*)\d{1,4}\)\s?(?=[\p{L}「『(])/gu);
    else {
        // After a sentence's end -- not an initial's period, nor an entry's own
        // number -- while a page ends a sentence too ("Exp. Fluids 59, 77. Garcia, S.").
        // A surname is CB_NAME: a particle before it, an accent the text put apart.
        const after = "(?<=^|\\n|[.)]\\s)(?<!(?:^|[\\s.(-])\\p{Lu}\\.\\s)(?<!(?:^|\\n|[.)]\\s)\\s*\\d{1,4}[.)]\\s)";
        yield* add(rx(after + "(?=" + CB_NAME + "(?:[ -]" + CB_NAME + ")?,\\s+\\p{Lu}\\.)"));
        yield* add(rx(after + "(?=" + CB_NAME + "\\s\\p{Lu}{1,3},\\s+" + CB_NAME + "\\s\\p{Lu}{1,3}[,.])"));
        // Annual Reviews: an entry ends on its pages, no period ("Lett. 82:364-66
        // Bartolo D, Josserand C, ..." / "AIChE J. 48:1843-48 Basaran OA. 2002.",
        // "614:355–80 Alben S. 2008b.").
        yield* add(rx("(?<=\\d\\s)(?=" + CB_NAME + "\\s\\p{Lu}{1,3}(?:,\\s+" + CB_NAME + "\\s\\p{Lu}{1,3}[,.]|\\.\\s+" + CB_YEAR + "))"));
        // Springer: the same, the year in parentheses after the authors ("Exp Fluids
        // 36:888–900 Fedorchenko AI, Wang AB (2004) On some ..."), an entry ending on
        // its pages or its DOI ("https://doi. org/10.1039/C4SM00513A Sykes TC, ...").
        yield* add(rx("(?<=\\d\\s|10\\.\\d{4,9}\\/\\S+\\s)(?=" + CB_NAME + "\\s\\p{Lu}{1,3}(?:,\\s+" + CB_NAME + "\\s\\p{Lu}{1,3})*\\s\\(" + CB_YEAR + "\\))"));
        // IOP: initials spaced, the year bare ("Fluid Mech. 38 339–69 Bush J W M, Hu D L
        // and Prakash M 2007 The integument ...", "117–92 de Gennes P, ...").
        yield* add(rx("(?<=\\d\\s)(?=" + CB_NAME + "(?:\\s\\p{Lu}){1,3}(?:(?:,|\\sand)\\s" + CB_NAME + "(?:\\s\\p{Lu}){1,3})*\\s" + CB_YEAR + "\\s)"));
        // JFM's capitals, set or OCR'd ("LAMB, H. 1932 Hydrodynamics.", "MOL ́A ˇCEK, J. &
        // BUSH, J. W. M. 2012", "TURNERJ,. S., HUPPERT,H. E. & SPARKS,R. S. J. 1986"):
        // a capitalised name and a comma or period, its year within 160 characters with
        // no lowercase word between -- a title's words come after the year. Not a
        // journal's capitals ("Phil. Trans. R. SOC. 177 (1886)", OUP's lists), nor an
        // initial written in capitals after another ("REDNIKOV, A. YE., RYAZANTSEV").
        yield* add(rx("(?<=^|\\n|[.)]\\s|\\d[a-z]?\\s)(?<!(?:^|[\\s.(-])\\p{Lu}\\.\\s)(?!" + CB_CAPS_JOURNAL + ")(?=\\p{Lu}{2}[\\p{Lu}\\p{M}\\u00b4\\u02c7\\u00a8\\u02dc’' -]*[,.](?:(?!\\p{Ll}{4})[^\\n]){0,160}?\\b" + CB_YEAR + ")"));
    }
    const at = [...cuts].sort((a, b) => a - b);
    const out: string[] = [];
    for (let i = 0; i < at.length && out.length < MAX_TEXT_ENTRIES; i += 200) {
        if (i) yield;
        cbEntries(s, at, i, Math.min(at.length, i + 200), out);
    }
    return out;
}

/** The matches of `rx` starting in [a, b) of `s`, scanned from `p` (where
 *  the last match ended) or `a`, each given to `each`; the new `p`. */
function cbScanWindow(s: string, rx: RegExp, a: number, b: number, p: number, each: (m: RegExpExecArray, at: number) => void): number {
    if (p >= b) return p;
    const start = Math.max(a, p);
    const from = Math.max(0, start - CHUNK_LOOK);
    const w = s.slice(from, Math.min(s.length, b + CHUNK_LOOK));
    rx.lastIndex = start - from;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(w))) {
        const at = from + m.index;
        if (at >= b) break;
        if (rx.lastIndex === m.index) rx.lastIndex++;
        p = from + rx.lastIndex;
        each(m, at);
    }
    return p;
}

/** The entries between cuts `from` and `to` (excluded) of `s`, put in `out`. */
function cbEntries(s: string, at: number[], from: number, to: number, out: string[]) {
    for (let i = from; i < to && out.length < MAX_TEXT_ENTRIES; i++) {
        let e = s.slice(at[i], i + 1 < at.length ? at[i + 1] : s.length).replace(/\s+/g, " ").trim();
        while (e.length > MAX_ENTRY && out.length < MAX_TEXT_ENTRIES) {
            const k = e.lastIndexOf(". ", MAX_ENTRY);
            const cut = k > 100 ? k + 1 : MAX_ENTRY;
            out.push(e.slice(0, cut).trim());
            e = e.slice(cut).trim();
        }
        if (e.length >= 10) out.push(e);
    }
}

/** wvCbChunksSteps at once. */
export function wvCbChunks(section: string): string[] {
    return wvCbRun(wvCbChunksSteps(section));
}

/** The entries of a full text's reference sections (wvCbSections, each cut
 *  by wvCbChunks); none when no section is found. */
export function wvCbTextEntries(text: string): { entries: string[]; how: WvCbSectionHow } {
    const sec = wvCbSections(text);
    const t = String(text);
    let entries: string[] = [];
    for (const [a, b] of sec.regions) {
        entries = entries.concat(wvCbChunks(t.slice(a, b)));
        if (entries.length >= MAX_TEXT_ENTRIES) { entries = entries.slice(0, MAX_TEXT_ENTRIES); break; }
    }
    return { entries, how: sec.how };
}
