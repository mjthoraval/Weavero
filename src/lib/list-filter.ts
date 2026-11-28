// Filter and sort for the long item-pane lists -- References and Cited by now,
// Related by Citations and "Cited by your papers, not in your library" next
// (plan work/citations-plan-2026-11-21.md M4; design approved by MJT
// 2026-11-21, "Ok for the design you propose"). Pure: no Zotero, no DOM, so
// the suite drives it with rows of its own (test/list-filter.spec.js); the
// line in the section, the facets read from the libraries and the slicing are
// modules/list-filter.ts's.
//
// What can be typed (every word must match, in any order; accents and case
// ignored):
//   - words: looked for in the row's title, authors, year, journal, the
//     reference's own text and its type's name in Zotero's words;
//   - years: `2015`, `2015-2020`, `2020-` (from), `-1980` (up to) -- the
//     row's year, not its text;
//   - `-word`: rows without it.
// A row is what the section draws, reduced to a WvLfRow (its facet).

/** One row as the filter sees it. Folded strings (wvLfFold). */
export interface WvLfRow {
    /** What words are looked for in: title, authors, year, journal, the
     *  entry's own text, the type's name -- folded, fields apart by "\n". */
    hay: string;
    /** Its year, 0 when none is known. */
    year: number;
    /** Zotero's item type name ("journalArticle"), "" when none is known. */
    type: string;
    /** It has a PDF (or an EPUB) the reader opens. */
    pdf: boolean;
    /** It is an item of your libraries (a matched reference). */
    lib: boolean;
    /** When it was added to Zotero (ms), 0 without a library item. */
    added: number;
    /** How many of your papers cite it (the Cited by index), 0 when none. */
    cites: number;
    /** Its place in the list as the section gives it. */
    order: number;
    /** Its title, folded; "" when none (sorted last). */
    title: string;
    /** Its first author's name, folded; "" when none (sorted last). */
    first: string;
}

/** The orders a list could be shown in until 1.2.1-lfsort.1, each a field and a
 *  direction in one word -- still read from a stored pref (wvLfSortParse). */
export type WvLfSort = "paper" | "newest" | "oldest" | "cited" | "title" | "author" | "added";
export const WV_LF_SORTS: WvLfSort[] = ["paper", "newest", "oldest", "cited", "title", "author", "added"];

/** What a list is sorted by since 1.2.1-lfsort.1, the reader's annotation sort
 *  bar's design (MJT 2026-11-22): a field, picked from the dropdown chip's menu,
 *  and its direction, the arrow chip beside it -- `asc` drawn ↑, `desc` ↓, as the
 *  reader draws them (reader-panels.ts _wvAnnSortBarEnsure). */
export type WvLfField = "paper" | "year" | "cited" | "title" | "author" | "added";
export const WV_LF_FIELDS: WvLfField[] = ["paper", "year", "cited", "title", "author", "added"];
export type WvLfDir = "asc" | "desc";
export interface WvLfOrderSpec { field: WvLfField; dir: WvLfDir }
/** A spec, or a stored string ("year:asc", or an old order such as "newest"). */
export type WvLfSortLike = WvLfOrderSpec | string;

/** Each field's direction when it is picked (the reader's rule: switching to a
 *  field takes its default, re-picking the field keeps its direction): the
 *  newest years and dates and the most cited first, titles and names A to Z. */
export const WV_LF_FIELD_DIR: Record<WvLfField, WvLfDir> = { paper: "asc", year: "desc", cited: "desc", title: "asc", author: "asc", added: "desc" };

/** Does `field` have a direction? Not the paper's order: it is the list as the
 *  paper prints it -- an arrangement, not a scale, as the reader's Manual order
 *  has no arrow either -- and the default header stays one chip lighter in a
 *  narrow pane (lfsort.1). */
export function wvLfFieldHasDir(field: WvLfField): boolean {
    return field !== "paper";
}

/** What an old one-word order stood for (until 1.2.1-lfsort.1). */
const OLD_ORDERS: Record<WvLfSort, WvLfOrderSpec> = {
    paper: { field: "paper", dir: "asc" },
    newest: { field: "year", dir: "desc" },
    oldest: { field: "year", dir: "asc" },
    cited: { field: "cited", dir: "desc" },
    title: { field: "title", dir: "asc" },
    author: { field: "author", dir: "asc" },
    added: { field: "added", dir: "desc" },
};

/** The order a stored value names: the form written since lfsort.1 ("year:asc",
 *  "paper"), or an old one-word order ("newest" -> Year ↓, "oldest" -> Year ↑);
 *  a spec as it is. Null for anything else. A field without a direction is
 *  always "asc". */
export function wvLfSortParse(v: WvLfSortLike | null | undefined): WvLfOrderSpec | null {
    if (!v) return null;
    if (typeof v === "object") {
        if (WV_LF_FIELDS.indexOf(v.field) < 0) return null;
        return { field: v.field, dir: wvLfFieldHasDir(v.field) && v.dir === "desc" ? "desc" : "asc" };
    }
    const s = String(v).trim();
    if (Object.prototype.hasOwnProperty.call(OLD_ORDERS, s)) { const o = OLD_ORDERS[s as WvLfSort]; return { field: o.field, dir: o.dir }; }
    const m = s.match(/^([a-z]+):(asc|desc)$/);
    if (!m || WV_LF_FIELDS.indexOf(m[1] as WvLfField) < 0) return null;
    const field = m[1] as WvLfField;
    return { field, dir: wvLfFieldHasDir(field) ? (m[2] as WvLfDir) : "asc" };
}

/** The stored form of `spec`: "paper", or "<field>:<dir>". */
export function wvLfSortStr(spec: WvLfOrderSpec): string {
    return wvLfFieldHasDir(spec.field) ? spec.field + ":" + spec.dir : spec.field;
}

/** Do `a` and `b` name the same order? */
export function wvLfSortSame(a: WvLfSortLike | null | undefined, b: WvLfSortLike | null | undefined): boolean {
    const x = wvLfSortParse(a), y = wvLfSortParse(b);
    return !!x && !!y && x.field === y.field && x.dir === y.dir;
}

export interface WvLfWord { neg: boolean; text: string }
export interface WvLfYears { lo: number; hi: number }
export interface WvLfQuery { words: WvLfWord[]; years: WvLfYears[] }

/** The chips on: types shown (any of them), a year from which on, with a PDF,
 *  in your libraries or not ("" for either). */
export interface WvLfChipsOn { types: string[]; since: number; pdf: boolean; lib: "" | "in" | "out" }

export function wvLfChipsNone(): WvLfChipsOn {
    return { types: [], since: 0, pdf: false, lib: "" };
}

export function wvLfChipsActive(c: WvLfChipsOn | null | undefined): boolean {
    return !!c && (c.types.length > 0 || c.since > 0 || c.pdf || c.lib !== "");
}

/** Letters NFD does not take apart, and the marks typed for a dash or a quote. */
const FOLD_EXTRA: Record<string, string> = {
    "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i",
    "ς": "σ", "’": "'", "‘": "'", "–": "-", "—": "-",
};
const FOLD_EXTRA_RX = /[ßæœøłđðþıς’‘–—]/g;
const MARKS_RX = /[̀-ͯ]/g;

/** `s` without accents, in lower case ("Élan Šimek" -> "elan simek"). */
export function wvLfFold(s: string): string {
    let t = String(s == null ? "" : s);
    if (!t) return t;
    t = t.normalize("NFD").replace(MARKS_RX, "").toLowerCase();
    if (/[^\x00-\x7f]/.test(t)) t = t.replace(FOLD_EXTRA_RX, (c) => FOLD_EXTRA[c] || c);
    return t;
}

const YEAR_ONE = /^(\d{4})$/;
const YEAR_SPAN = /^(\d{4})[-–](\d{4})$/;
const YEAR_FROM = /^(\d{4})[-–]$/;
const YEAR_UPTO = /^[-–](\d{4})$/;
/** A year range's open end. */
const YEAR_MAX = 9999;

/** What `text` asks for (the grammar above). Words are folded. */
export function wvLfParse(text: string): WvLfQuery {
    const q: WvLfQuery = { words: [], years: [] };
    for (const tok of String(text || "").trim().split(/\s+/)) {
        if (!tok) continue;
        let m = tok.match(YEAR_ONE);
        if (m) { const y = Number(m[1]); q.years.push({ lo: y, hi: y }); continue; }
        m = tok.match(YEAR_SPAN);
        if (m) { const a = Number(m[1]), b = Number(m[2]); q.years.push({ lo: Math.min(a, b), hi: Math.max(a, b) }); continue; }
        m = tok.match(YEAR_FROM);
        if (m) { q.years.push({ lo: Number(m[1]), hi: YEAR_MAX }); continue; }
        m = tok.match(YEAR_UPTO);
        if (m) { q.years.push({ lo: 1, hi: Number(m[1]) }); continue; }
        if ((tok[0] === "-" || tok[0] === "–") && tok.length > 1) {
            const w = wvLfFold(tok.slice(1));
            if (w) q.words.push({ neg: true, text: w });
            continue;
        }
        if (tok === "-" || tok === "–") continue;
        const w = wvLfFold(tok);
        if (w) q.words.push({ neg: false, text: w });
    }
    return q;
}

export function wvLfQueryEmpty(q: WvLfQuery): boolean {
    return !q.words.length && !q.years.length;
}

/** The words a row's text is marked for (the ones that must be there). */
export function wvLfMarkWords(q: WvLfQuery): string[] {
    const out: string[] = [];
    for (const w of q.words) if (!w.neg && out.indexOf(w.text) < 0) out.push(w.text);
    return out;
}

/** Does `row` pass the words and years of `q` and the chips `c`? */
export function wvLfPass(row: WvLfRow, q: WvLfQuery, c: WvLfChipsOn): boolean {
    for (const y of q.years) if (!(row.year && row.year >= y.lo && row.year <= y.hi)) return false;
    for (const w of q.words) if ((row.hay.indexOf(w.text) >= 0) === w.neg) return false;
    if (c.types.length && c.types.indexOf(row.type) < 0) return false;
    if (c.since && !(row.year >= c.since)) return false;
    if (c.pdf && !row.pdf) return false;
    if (c.lib === "in" && !row.lib) return false;
    if (c.lib === "out" && row.lib) return false;
    return true;
}

// ---- the chips ----------------------------------------------------------------

/** The chips a list offers, with how many of its rows each keeps. A chip is
 *  offered only when it splits the list (0 < count < total): one that keeps
 *  every row narrows nothing. */
export interface WvLfChipSet {
    total: number;
    /** Its most common item types, most first (at most WV_LF_TYPE_CHIPS). */
    types: Array<{ type: string; count: number }>;
    /** "Since <year>": a recent-years cut, null when the years do not split it. */
    since: { year: number; count: number } | null;
    /** Rows with a PDF, -1 when that does not split the list. */
    pdf: number;
    /** Rows in your libraries and not, -1 each when that does not split the list
     *  (or the list does not offer it). */
    inLib: number;
    outLib: number;
}

export const WV_LF_TYPE_CHIPS = 3;

/** The chips of `rows`; `lib`: the list offers In library / Not in library;
 *  `pdf`: it offers Has PDF (References offers neither since citations.6: its
 *  header's chips filter those, MJT 2026-11-21). "Since": of the years that
 *  split the list, the one keeping closest to a third of its rows, then down to
 *  a multiple of five while that still splits it and keeps at most two thirds
 *  ("Since 2020"). */
export function wvLfChips(rows: WvLfRow[], lib: boolean, pdf: boolean = true): WvLfChipSet {
    const total = rows.length;
    const byType = new Map<string, number>();
    const years: number[] = [];
    let withPdf = 0, inLib = 0;
    for (const r of rows) {
        if (r.type) byType.set(r.type, (byType.get(r.type) || 0) + 1);
        if (r.year) years.push(r.year);
        if (r.pdf) withPdf++;
        if (r.lib) inLib++;
    }
    const splits = (n: number) => n > 0 && n < total;
    const types = Array.from(byType.entries()).filter(([, n]) => splits(n))
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, WV_LF_TYPE_CHIPS).map(([type, count]) => ({ type, count }));
    let since: { year: number; count: number } | null = null;
    if (years.length > 1) {
        years.sort((a, b) => b - a);
        // Each distinct year with how many rows are of it or later.
        const third = total / 3;
        let best = 0, bestN = 0, n = 0;
        for (let i = 0; i < years.length; i++) {
            n++;
            if (i + 1 < years.length && years[i + 1] === years[i]) continue;
            if (splits(n) && (!best || Math.abs(n - third) < Math.abs(bestN - third))) { best = years[i]; bestN = n; }
        }
        if (best) {
            const round = best - (best % 5);
            let nr = 0;
            for (const x of years) { if (x >= round) nr++; else break; }
            since = round !== best && splits(nr) && nr <= (2 * total) / 3 ? { year: round, count: nr } : { year: best, count: bestN };
        }
    }
    return {
        total, types, since,
        pdf: pdf && splits(withPdf) ? withPdf : -1,
        inLib: lib && splits(inLib) ? inLib : -1,
        outLib: lib && splits(inLib) ? total - inLib : -1,
    };
}

// ---- the orders -----------------------------------------------------------------

/** Rows matched between two steps of wvLfOrderSteps. */
const MATCH_STEP = 2000;

/** The comparison of two rows for `spec`, its place in the list last (so a
 *  tie keeps the list's own order). Unknown values (no year, no title, no date
 *  added) go last in either direction; the direction turns the field's own
 *  comparison round, never the ties after it (Times cited ↑: the least cited
 *  first, a tie still newest first). A count is a value, 0 included. The
 *  defaults are the one-word orders' (newest, oldest, cited... until lfsort.1). */
function cmpOf(spec: WvLfOrderSpec): (a: WvLfRow, b: WvLfRow) => number {
    const up = spec.dir === "asc";
    const str = (x: string, y: string) => (x === y ? 0 : !x ? 1 : !y ? -1 : (x < y) === up ? -1 : 1);
    const num = (x: number, y: number) => (x === y ? 0 : !x ? 1 : !y ? -1 : up ? x - y : y - x);
    const ascKnown = (x: number, y: number) => (x === y ? 0 : !x ? 1 : !y ? -1 : x - y);
    const descKnown = (x: number, y: number) => (x === y ? 0 : !x ? 1 : !y ? -1 : y - x);
    switch (spec.field) {
        case "year": return (a, b) => num(a.year, b.year) || a.order - b.order;
        case "cited": return (a, b) => (up ? a.cites - b.cites : b.cites - a.cites) || descKnown(a.year, b.year) || a.order - b.order;
        case "title": return (a, b) => str(a.title, b.title) || a.order - b.order;
        case "author": return (a, b) => str(a.first, b.first) || ascKnown(a.year, b.year) || a.order - b.order;
        case "added": return (a, b) => num(a.added, b.added) || a.order - b.order;
        default: return up ? (a, b) => a.order - b.order : (a, b) => b.order - a.order;
    }
}

/** The rows of `rows` that pass `q` and `c`, as their indexes in `rows`, in
 *  the order `sort` -- in steps (MATCH_STEP rows, then the sort in one step).
 *  `natural`: the order `rows` already is in; sorted that way they are not
 *  sorted again. Either may be a spec or a stored string (wvLfSortParse); one
 *  that names nothing is the natural order. */
export function* wvLfOrderSteps(rows: WvLfRow[], q: WvLfQuery, c: WvLfChipsOn, sort: WvLfSortLike, natural: WvLfSortLike): Generator<void, number[], void> {
    const out: number[] = [];
    const all = wvLfQueryEmpty(q) && !wvLfChipsActive(c);
    for (let i = 0; i < rows.length; i++) {
        if (i && i % MATCH_STEP === 0) yield;
        if (all || wvLfPass(rows[i], q, c)) out.push(i);
    }
    const spec = wvLfSortParse(sort);
    if (spec && !wvLfSortSame(spec, natural) && out.length > 1) {
        yield;
        const cmp = cmpOf(spec);
        out.sort((x, y) => cmp(rows[x], rows[y]));
    }
    return out;
}

/** wvLfOrderSteps at once. */
export function wvLfOrder(rows: WvLfRow[], q: WvLfQuery, c: WvLfChipsOn, sort: WvLfSortLike, natural: WvLfSortLike): number[] {
    const g = wvLfOrderSteps(rows, q, c, sort, natural);
    for (;;) {
        const r = g.next();
        if (r.done) return r.value;
    }
}

// ---- the marks --------------------------------------------------------------------

/** Where the words `words` (folded) are in `text`, as [start, end) ranges of
 *  `text` itself, in order, overlapping ones joined -- accents and case
 *  ignored as the filter ignores them. */
export function wvLfMarks(text: string, words: string[]): Array<[number, number]> {
    const s = String(text || "");
    if (!s || !words.length) return [];
    // None of the words in it: nothing to map (most of a row's text nodes).
    const whole = wvLfFold(s);
    if (!words.some((w) => !!w && whole.indexOf(w) >= 0)) return [];
    // The folded text, and for each of its characters the original's (ASCII
    // folded by hand: a normalize() per character is the slow part).
    let f = "";
    const at: number[] = [];
    for (let i = 0; i < s.length;) {
        const c = s.charCodeAt(i);
        if (c < 128) {
            f += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
            at.push(i);
            i++;
            continue;
        }
        const cp = s.codePointAt(i) as number;
        const len = cp > 0xffff ? 2 : 1;
        const piece = wvLfFold(s.slice(i, i + len));
        for (let k = 0; k < piece.length; k++) { f += piece[k]; at.push(i); }
        i += len;
    }
    const spans: Array<[number, number]> = [];
    for (const w of words) {
        if (!w) continue;
        for (let k = f.indexOf(w); k >= 0; k = f.indexOf(w, k + w.length)) {
            const a = at[k], lastAt = at[k + w.length - 1];
            const cp = s.codePointAt(lastAt) as number;
            spans.push([a, lastAt + (cp > 0xffff ? 2 : 1)]);
        }
    }
    spans.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const out: Array<[number, number]> = [];
    for (const sp of spans) {
        const last = out[out.length - 1];
        if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
        else out.push([sp[0], sp[1]]);
    }
    return out;
}
