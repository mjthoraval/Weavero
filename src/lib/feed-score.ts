// Feeds: the pure parts of the relevance score (modules/feeds.ts; branch
// feeds, MJT 2026-11-22 "Ok for the feeds plan"). Nothing here touches Zotero:
// the module reads the library, these turn what it read into a score and its
// reasons. Published on `Zotero.Weavero.lib` for test/feeds.spec.js.
//
// The text closeness takes the rules of the tool behind a scored feed (a feed
// whose entries carry their own score lines, wvFdParseRadar): folded words with
// a light stemming plus adjacent-word bigrams, stopwords out, TF-IDF fitted on
// the library, cosine through an inverted index that skips the commonest terms.
// The same rules on both sides, so the two scores read alike.

import { wvRefCleanDOI } from "./ref-match";

/** The weights, ONE table (MJT 2026-11-22: "Consolidate later based on the
 *  new features being developed"). A raw score is their sum; `half` is the
 *  raw score that reads Relevance 50 (the scored feed's own half point). */
export const WV_FD_WEIGHTS = {
    /** x the cosine to the user's closest own paper. */
    textOwn: 60,
    /** x the mean cosine of the TEXT_K closest papers of the library. */
    textLib: 80,
    /** per feed author who has papers in the library (at most AUTHOR_MAX),
     *  x min(1, log2(1 + n) / 3) for their n papers, / k when the feed's name
     *  fits k different people of the library (score fix 2). */
    author: 10,
    followed: 40,
    followedExtra: 10,
    alert: 25,
    alertExtra: 5,
    /** x log(1 + n) / log(1 + the most read journal's n). */
    journal: 12,
    half: 40,
};
export const WV_FD_TEXT_K = 5;
export const WV_FD_AUTHOR_MAX = 3;
/** Cosines below this say nothing (a shared common word). */
export const WV_FD_MIN_COSINE = 0.05;
/** A contribution below this many raw points is not given as a reason. */
export const WV_FD_MIN_REASON = 2;
/** A journal counts from this many papers in the library. */
export const WV_FD_MIN_JOURNAL = 2;

const STOPWORDS = new Set(("a about above across after again against all almost along also although am among an and another any "
    + "are around as at be because been before being below between both but by can could did do does doing "
    + "done down due during each either else etc even ever every few for from further had has have having he "
    + "her here hers him his how however i if in into is it its itself just less many may might more most "
    + "much must my near neither no nor not now of off often on once one only onto or other others otherwise "
    + "our ours out over own per perhaps rather same several shall she should since so some such than that "
    + "the their theirs them themselves then there thereby therefore these they this those though through "
    + "thus to too toward towards under unless until up upon us very via was we well were what whatever when "
    + "where whereas whether which while who whom whose why will with within without would yet you your "
    + "paper article study studies studied present presents presented report reports reported show shows "
    + "shown showed demonstrate demonstrates demonstrated investigate investigates investigated investigation "
    + "result results find finds found obtain obtained use used uses using based new novel propose proposed "
    + "approach method methods work works first second third two three four five also significant "
    + "significantly respectively various different furthermore moreover addition additionally finally "
    + "compared comparison effect effects analysis analyzed analysed observed observe provide provides "
    + "provided important considered consider including include includes key main case cases large small "
    + "high low higher lower increase increases increased decrease decreases decreased").split(" "));

/** Lower case, accents dropped, ligatures split (the scored feed's folding). */
export function wvFdFold(s: any): string {
    return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\u0131/g, "i").toLowerCase();
}

/** A light stemming, the scored feed's own. */
export function wvFdStem(w: string): string {
    if (w.length <= 3) return w;
    if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
    else if (w.endsWith("sses")) w = w.slice(0, -2);
    else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    for (const suf of ["ing", "ed"]) {
        if (w.endsWith(suf) && w.length - suf.length >= 4) {
            w = w.slice(0, -suf.length);
            if (/([bcdfghjkmnpqrtvwxy])\1$/.test(w)) w = w.slice(0, -1);
            break;
        }
    }
    if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
    return w;
}

/** `s` without markup, entities and links. A journal feed's abstract is XHTML
 *  with image links (Journal of Fluid Mechanics: a graphical abstract, 156 of
 *  MJT's feed items), and some library abstracts are nothing but such a link
 *  (5 in MJT's My Library): their words -- "static", "cambridge", "content",
 *  "xmlns" -- made every such feed item "close" to those 5 papers (MJT
 *  2026-11-22, score fix 1). */
export function wvFdPlainText(s: any): string {
    return String(s || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(?:[a-z][a-z0-9]*|#[0-9]+|#x[0-9a-f]+);/gi, " ")
        .replace(/(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>]+/gi, " ")
        .replace(/\bwww\.[^\s"'<>]+/gi, " ")
        .replace(/\b(?:doi|urn):[^\s"'<>]+/gi, " ");
}

/** The words of `text` as plain text, folded: [a-z][a-z0-9]*. */
function words(text: any): string[] {
    return wvFdFold(wvFdPlainText(text)).replace(/-/g, " ").match(/[a-z][a-z0-9]*/g) || [];
}

/** A correction notice, not a paper: "<title> – CORRIGENDUM" (Cambridge),
 *  "Erratum: <title>" (APS), "Corrigendum to ..." (Elsevier), "Retraction Note:
 *  ..." / "Correction to: ..." (Springer). Its text is the paper's title and
 *  little else, so it is left out of the closeness (score fix 3). A title that
 *  merely begins with "Retraction of ..." is physics (a film's retraction) and
 *  stays. */
export function wvFdIsNotice(title: any): boolean {
    const t = String(title || "").trim();
    if (!t) return false;
    if (/[-–—]\s*(?:corrigendum|corrigenda|erratum|errata|retraction|addendum|correction|expression of concern)\s*$/i.test(t)) return true;
    if (/^(?:corrigendum|corrigenda|erratum|errata|addendum|expression of concern)\b/i.test(t)) return true;
    return /^(?:retraction(?: note| notice)?|correction|notice of retraction)\s*(?:to\s*)?:/i.test(t);
}

/** The text's terms: stemmed words without stopwords, then the adjacent-word
 *  bigrams (the scored feed's tokens). */
export function wvFdTokenize(text: any, bigrams = true): string[] {
    const seq: Array<string | null> = words(text).map((w) => (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) ? null : wvFdStem(w));
    const terms = seq.filter((t) => t) as string[];
    if (bigrams) for (let i = 0; i + 1 < seq.length; i++) if (seq[i] && seq[i + 1] && seq[i] !== seq[i + 1]) terms.push(seq[i] + " " + seq[i + 1]);
    return terms;
}

// ---- TF-IDF --------------------------------------------------------------------

/** A library's text index: document frequencies and an inverted index of the
 *  L2-normalised document vectors (terms in more than `limit` documents are
 *  left out of the postings, as the scored feed's tool does: their weight is
 *  small and they would dominate the cost). */
export interface WvFdCorpus {
    n: number;
    minDf: number;
    df: Map<string, number>;
    defIdf: number;
    limit: number;
    ids: number[];
    post: Map<string, { d: Int32Array; w: Float32Array }>;
}

export type WvFdVec = Map<string, number>;

function idfOf(c: { n: number; minDf: number; df: Map<string, number> }, term: string): number | null {
    const d = c.df.get(term);
    return d && d >= c.minDf ? Math.log((c.n + 1) / (d + 1)) + 1 : null;
}

/** The vector of `tokens` under the corpus' IDF; unknown terms count in the
 *  norm only (textsim.py `vector`). */
export function wvFdVector(c: { n: number; minDf: number; df: Map<string, number>; defIdf: number }, tokens: string[]): WvFdVec {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec: WvFdVec = new Map();
    let norm2 = 0;
    for (const [t, n] of tf) {
        const w = 1 + Math.log(n);
        const idf = idfOf(c, t);
        if (idf === null) { norm2 += (w * c.defIdf) ** 2; continue; }
        const v = w * idf;
        vec.set(t, v);
        norm2 += v * v;
    }
    if (norm2 <= 0) return new Map();
    const nm = Math.sqrt(norm2);
    for (const [t, v] of vec) vec.set(t, v / nm);
    return vec;
}

export function wvFdCosine(a: WvFdVec, b: WvFdVec): number {
    if (a.size > b.size) [a, b] = [b, a];
    let s = 0;
    for (const [t, v] of a) { const o = b.get(t); if (o) s += v * o; }
    return s;
}

/** Build the corpus of `docs` ([id, text]) in steps: the generator yields
 *  between pieces of work so the caller paces it (modules/feeds.ts
 *  `_wvFdSteps`), and returns the corpus. */
export function* wvFdCorpusSteps(docs: Array<[number, string]>): Generator<void, WvFdCorpus, void> {
    const toks: string[][] = [];
    const df = new Map<string, number>();
    for (let i = 0; i < docs.length; i++) {
        const t = wvFdTokenize(docs[i][1]);
        toks.push(t);
        for (const term of new Set(t)) df.set(term, (df.get(term) || 0) + 1);
        if (i % 64 === 63) yield;
    }
    const n = docs.length;
    // A small library keeps every term: with min 2, a library of a few dozen
    // papers keeps almost none.
    const minDf = n >= 200 ? 2 : 1;
    const c: WvFdCorpus = { n, minDf, df, defIdf: Math.log(n + 1) + 1, limit: Math.max(10, Math.floor(0.05 * n)), ids: docs.map((d) => d[0]), post: new Map() };
    const tmp = new Map<string, { d: number[]; w: number[] }>();
    for (let i = 0; i < n; i++) {
        for (const [term, w] of wvFdVector(c, toks[i])) {
            if ((df.get(term) || 0) > c.limit) continue;
            let p = tmp.get(term);
            if (!p) { p = { d: [], w: [] }; tmp.set(term, p); }
            p.d.push(i);
            p.w.push(w);
        }
        toks[i] = [];
        if (i % 64 === 63) yield;
    }
    let k = 0;
    for (const [term, p] of tmp) {
        c.post.set(term, { d: Int32Array.from(p.d), w: Float32Array.from(p.w) });
        if (++k % 2048 === 0) yield;
    }
    return c;
}

/** The corpus' documents closest to `vec`: [{ id, s }] best first (cosines
 *  over the indexed terms; `skip` ids left out). */
export function wvFdNeighbours(c: WvFdCorpus, vec: WvFdVec, k: number, skip?: Set<number>): Array<{ id: number; s: number }> {
    const acc = new Map<number, number>();
    for (const [term, w] of vec) {
        const p = c.post.get(term);
        if (!p) continue;
        for (let j = 0; j < p.d.length; j++) acc.set(p.d[j], (acc.get(p.d[j]) || 0) + w * p.w[j]);
    }
    const out: Array<{ id: number; s: number }> = [];
    for (const [d, s] of acc) { const id = c.ids[d]; if (!skip || !skip.has(id)) out.push({ id, s }); }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, k);
}

// ---- names ----------------------------------------------------------------------

/** A person's name as it is compared: the surname's letters (particles and
 *  hyphens kept together, "hernandezsanchez", "vanderwaals"), the initials of
 *  the given names ("mj") and the given names' parts ("marie", "jean"; an
 *  initial is a one-letter part). */
export interface WvFdName { last: string; inits: string; given?: string[] }

const letters = (s: string) => wvFdFold(s).replace(/[^a-z]+/g, "");
/** The given names' parts: "Peng-Nan (孙鹏楠)" -> peng, nan; "T.-C." -> t, c. */
const givenParts = (given: string) => wvFdFold(String(given || "").replace(/\([^)]*\)/g, " ")).match(/[a-z]+/g) || [];
const initialsOf = (given: string) => givenParts(given).map((w) => w[0]).join("");
const hasFull = (n: WvFdName) => !!(n.given && n.given.some((p) => p.length > 1));

/** Two written-out given names of one person: the same letters ("Tianyu",
 *  "Tian-Yu"), or the same parts where both are written out, an initial
 *  agreeing with a part, and nothing more on the longer side than initials
 *  ("Detlef" and "Detlef J."; never "Tian" and "Tian-Yu", "Kai" and
 *  "Kai-Jun": score fix 2). */
function sameGiven(a: string[], b: string[]): boolean {
    if (a.join("") === b.join("")) return true;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    for (let i = 0; i < s.length; i++) {
        const x = s[i], y = l[i];
        if (x.length > 1 && y.length > 1 ? x !== y : x[0] !== y[0]) return false;
    }
    return l.slice(s.length).every((p) => p.length === 1);
}

/** "Last, First", "Last, F. M.", "First Middle Last", "F. Last" (a lower-case
 *  particle before the surname belongs to it: "Johannes van der Waals"). */
export function wvFdNameParse(s: any): WvFdName | null {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    const comma = t.indexOf(",");
    if (comma >= 0) {
        const last = letters(t.slice(0, comma));
        const g = t.slice(comma + 1);
        return last ? { last, inits: initialsOf(g), given: givenParts(g) } : null;
    }
    const ws = t.split(" ");
    let i = ws.length - 1;
    while (i > 0 && /^[a-z]/.test(ws[i - 1]) && !/\.$/.test(ws[i - 1])) i--;
    const last = letters(ws.slice(i).join(""));
    const g = ws.slice(0, i).join(" ");
    return last ? { last, inits: initialsOf(g), given: givenParts(g) } : null;
}

/** A Zotero creator ({ lastName, firstName } or a one-field name). */
export function wvFdCreatorName(c: { lastName?: string; firstName?: string; name?: string } | null): WvFdName | null {
    if (!c) return null;
    if (c.firstName) { const last = letters(c.lastName || ""); return last ? { last, inits: initialsOf(c.firstName), given: givenParts(c.firstName) } : null; }
    return wvFdNameParse(c.lastName || c.name || "");
}

/** The same person: the same surname; given names that are the same where
 *  both are written out (`sameGiven`), else initials that agree as far as both
 *  go ("M." and "M.-J."; none on either side is no objection). Matching on
 *  surname and initials alone took "Gao, Tian" and "Gao, Tong" for "Gao,
 *  Tian-Yu" (MJT 2026-11-22). */
export function wvFdNameMatches(a: WvFdName | null, b: WvFdName | null): boolean {
    if (!a || !b || a.last !== b.last) return false;
    if (!a.inits || !b.inits) return true;
    if (hasFull(a) && hasFull(b)) return sameGiven(a.given as string[], b.given as string[]);
    const n = Math.min(a.inits.length, b.inits.length);
    return a.inits.slice(0, n) === b.inits.slice(0, n);
}

/** The written-out given name of `n` ("" when only initials): the key one
 *  person's variants share in the library's author table. */
export function wvFdGivenKey(n: WvFdName | null): string {
    return n && hasFull(n) ? (n.given as string[]).join("") : "";
}

/** The key the library's author table uses: surname and first initial. */
export function wvFdNameKey(n: WvFdName | null): string {
    return n ? n.last + "|" + (n.inits[0] || "") : "";
}

// ---- keyword alerts --------------------------------------------------------------

/** An alert: every word present, every "quoted phrase" present as it is
 *  written, no -excluded word. Words are compared folded and stemmed, so
 *  "bubble" finds "bubbles". */
export interface WvFdAlert { q: string; words: string[]; phrases: string[][]; not: string[] }

const stemWords = (s: string) => words(s).map(wvFdStem);

export function wvFdAlertParse(q: any): WvFdAlert {
    const a: WvFdAlert = { q: String(q || "").trim(), words: [], phrases: [], not: [] };
    const rx = /(-?)"([^"]*)"|(-?)(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(a.q))) {
        if (m[2] !== undefined) {
            const p = stemWords(m[2]);
            if (!p.length) continue;
            if (m[1]) a.not.push(...p);
            else if (p.length === 1) a.words.push(p[0]);
            else a.phrases.push(p);
        }
        else {
            const p = stemWords(m[4]);
            if (m[3]) a.not.push(...p);
            else a.words.push(...p);
        }
    }
    return a;
}

/** Does `text` satisfy the alert? An alert with nothing to find matches nothing. */
export function wvFdAlertMatches(a: WvFdAlert, text: any): boolean {
    if (!a || (!a.words.length && !a.phrases.length)) return false;
    const seq = stemWords(text);
    const set = new Set(seq);
    if (a.not.some((w) => set.has(w))) return false;
    if (!a.words.every((w) => set.has(w))) return false;
    for (const p of a.phrases) {
        let found = false;
        for (let i = 0; i + p.length <= seq.length && !found; i++) {
            let ok = true;
            for (let j = 0; j < p.length && ok; j++) ok = seq[i + j] === p[j];
            found = ok;
        }
        if (!found) return false;
    }
    return true;
}

// ---- a scored feed's two lines ----------------------------------------------------

/** What a scored feed entry's abstract starts with (grammar v1): line 1
 *  "Relevance <score> · <reason> · ...", for people; line 2 "radar: v1
 *  key=value,value ...", for machines; then the abstract. */
export interface WvFdRadar { score: number; reasons: string[]; fields: Record<string, string[]>; abstract: string }

const RADAR_ITEM = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/;

/** The ONE parser of the format, to its documented grammar ("The feed (for
 *  Weavero)"):
 *    content = line1 LF line2 LF [ LF abstract ]
 *    line1   = "Relevance " score *( " · " segment )   ; score 1*2DIGIT, 0..99
 *    line2   = "radar: v1" *( SP key "=" item *( "," item ) )
 *    item    = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / pct-encoded )
 *  Unknown keys are kept (and ignored by the score); a field whose value is not
 *  of the grammar is dropped. The text is taken as Zotero stores it (the
 *  content through XMLSerializer: & < > as entities) or raw. One tolerance of
 *  Weavero's own, outside the grammar: lines run together (a feed reader that
 *  dropped the line breaks) -- the machine line then ends at its last
 *  key=value. Null for any other abstract. */
export function wvFdParseRadar(text: any): WvFdRadar | null {
    if (!text) return null;
    const t = String(text).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/^\s+/, "");
    const m = /^Relevance (\d{1,2})(?= · |\s|$)/.exec(t);
    if (!m) return null;
    const at = t.indexOf("radar: v1");
    if (at < 0) return null;
    const line1 = t.slice(0, at).trim();
    if (/\n/.test(line1)) return null;
    const parts = line1.split(" · ");
    if (parts[0].trim() !== "Relevance " + m[1]) return null;
    const rest = t.slice(at + "radar: v1".length);
    let line2 = "", after = "";
    const nl = rest.indexOf("\n");
    if (nl >= 0) { line2 = rest.slice(0, nl); after = rest.slice(nl + 1); }
    else {
        const toks = rest.split(" ");
        let i = 0;
        const kept: string[] = [];
        for (; i < toks.length; i++) {
            if (toks[i] === "") continue;
            if (/^[a-z_]+=\S+$/.test(toks[i])) kept.push(toks[i]);
            else break;
        }
        line2 = kept.join(" ");
        after = toks.slice(i).join(" ");
    }
    const fields: Record<string, string[]> = {};
    for (const tok of line2.trim().split(/\s+/)) {
        const f = /^([a-z_]+)=(.+)$/.exec(tok);
        if (!f) continue;
        const items = f[2].split(",");
        if (!items.every((x) => RADAR_ITEM.test(x))) continue;
        fields[f[1]] = items.map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    }
    return {
        score: Math.max(0, Math.min(99, Number(m[1]))),
        reasons: parts.slice(1).map((s) => s.trim()).filter((s) => s),
        fields,
        abstract: after.trim(),
    };
}

// ---- the score -------------------------------------------------------------------

/** The relevance, as the scored feed's tool computes it: 0..99, monotone in the raw score. */
export function wvFdRelevance(raw: number, half: number): number {
    if (!(raw > 0)) return 0;
    return Math.min(99, Math.round(100 * raw / (raw + half)));
}

export interface WvFdSignals {
    own?: { s: number; id: number } | null;
    /** s: the mean closeness of the TEXT_K closest; n: how many of the 10
     *  closest pass MIN_COSINE; id, best: the closest one and its closeness. */
    lib?: { s: number; n: number; id?: number; best?: number } | null;
    /** n: their papers in the library; k: the different people the name fits. */
    authors?: Array<{ name: string; n: number; k?: number }>;
    followed?: string[];
    alerts?: string[];
    journal?: { name: string; n: number; share: number } | null;
    radar?: WvFdRadar | null;
}

/** A reason, kept as data (the section words it in the UI's language):
 *  k = "radar" (t: the feed's own words), "own" (id: the paper), "lib" (n),
 *  "author" (names), "followed" (names), "alert" (q), "journal" (name, n). */
export interface WvFdReason { k: string; w: number; t?: string; id?: number; n?: number; s?: number; names?: string[]; q?: string[]; name?: string }

/** How close the closest library paper is, in words (score fix 4): the cosine
 *  of the two texts. Bounds from MJT's 2,331 feed items against his 17,933-item
 *  library (2026-11-22, citations.16): median 0.107, 75th percentile 0.138, 90th
 *  0.174, 97th 0.229 -- "very close" about the top 3 %, "close" the next 22 %.
 *  The first guess (0.35 / 0.2) said "loosely" for 94 %. */
export const WV_FD_NEAR_LEVELS = { strong: 0.22, moderate: 0.14 };
export function wvFdNearLevel(s: number): "strong" | "moderate" | "weak" {
    return s >= WV_FD_NEAR_LEVELS.strong ? "strong" : s >= WV_FD_NEAR_LEVELS.moderate ? "moderate" : "weak";
}

/** The score and its reasons, strongest first. A scored feed's entry keeps its
 *  own score and its reasons come first; the local ones follow, without
 *  repeating what the radar already says (a followed author, an alert). */
export function wvFdScore(sig: WvFdSignals, W = WV_FD_WEIGHTS): { score: number; raw: number; reasons: WvFdReason[] } {
    const rs: WvFdReason[] = [];
    if (sig.own && sig.own.s >= WV_FD_MIN_COSINE) rs.push({ k: "own", w: W.textOwn * sig.own.s, id: sig.own.id });
    if (sig.lib && sig.lib.s > 0) rs.push({ k: "lib", w: W.textLib * sig.lib.s, n: sig.lib.n, id: sig.lib.id, s: sig.lib.best });
    const au = (sig.authors || []).slice(0, WV_FD_AUTHOR_MAX);
    if (au.length) rs.push({ k: "author", w: au.reduce((a, x) => a + W.author * Math.min(1, Math.log2(1 + x.n) / 3) / Math.max(1, x.k || 1), 0), names: au.map((x) => x.name) });
    const fo = sig.followed || [];
    if (fo.length) rs.push({ k: "followed", w: W.followed + W.followedExtra * (fo.length - 1), names: fo.slice() });
    const al = sig.alerts || [];
    if (al.length) rs.push({ k: "alert", w: W.alert + W.alertExtra * (al.length - 1), q: al.slice() });
    if (sig.journal && sig.journal.share > 0) rs.push({ k: "journal", w: W.journal * sig.journal.share, name: sig.journal.name, n: sig.journal.n });
    const raw = rs.reduce((a, r) => a + r.w, 0);
    rs.sort((a, b) => b.w - a.w);
    let local = rs.filter((r) => r.w >= WV_FD_MIN_REASON);
    if (!local.length && rs.length) local = [rs[0]];
    const rd = sig.radar;
    if (!rd) return { score: wvFdRelevance(raw, W.half), raw, reasons: local };
    const said = rd.reasons.join(" · ").toLowerCase();
    const has = (k: string) => !!(rd.fields[k] && rd.fields[k].length);
    local = local.filter((r) => !(r.k === "followed" && (has("followed") || said.includes("followed")))
        && !(r.k === "alert" && (has("alert") || said.includes("alert"))));
    return { score: rd.score, raw, reasons: rd.reasons.map((t) => ({ k: "radar", w: 1e6, t } as WvFdReason)).concat(local) };
}

// ---- the lists: Scholar alert lists and alerts files in, an alerts file out ----------

/** The alerts file's stamp (its "format"): "alerts/1", alone or after one
 *  prefix segment ("<tool>/alerts/1"); any other stamp is not an alerts file.
 *  The stamp of the file written over is kept, so the tool that owns the file
 *  still reads it; a new file gets WV_FD_ALERTS_FORMAT. */
export const WV_FD_ALERTS_FORMAT = "alerts/1";
export const WV_FD_ALERTS_FORMAT_RX = /^(?:[a-z0-9._-]+\/)?alerts\/1$/i;

/** `doc` is an alerts file: an object whose stamp WV_FD_ALERTS_FORMAT_RX accepts. */
export function wvFdIsAlertsDoc(doc: any): boolean {
    return !!doc && typeof doc === "object" && typeof doc.format === "string" && WV_FD_ALERTS_FORMAT_RX.test(doc.format);
}

/** MJT's Google Scholar alert lists ({ source, alerts: [{ target: "author" |
 *  "paper", name, type, ... }] }): an author's new articles -> followed
 *  authors; an author's new citations -> the citation alerts for a person; a
 *  paper's new citations -> the watched papers. Only `target`, `type` and `name` are read: nothing else of the file
 *  (its accounts) goes anywhere. */
export function wvFdImportAlerts(doc: any): { followed: string[]; citedPersons: string[]; watched: string[]; alerts: string[] } {
    const out = { followed: [] as string[], citedPersons: [] as string[], watched: [] as string[], alerts: [] as string[] };
    // An alerts file: its enabled entries.
    if (wvFdIsAlertsDoc(doc)) {
        const on = (key: string) => (Array.isArray(doc[key]) ? doc[key] : []).filter((e: any) => e && typeof e === "object" && e.enabled !== false);
        const txt = (v: any) => String(v || "").replace(/\s+/g, " ").trim();
        for (const e of on("followed_authors")) if (txt(e.name)) out.followed.push(txt(e.name));
        for (const e of on("cited_people")) if (txt(e.name)) out.citedPersons.push(txt(e.name));
        for (const e of on("watched_works")) { const l = [txt(e.doi), txt(e.label)].filter((x) => x).join(" "); if (l) out.watched.push(l); }
        for (const e of on("keyword_alerts")) if (txt(e.query)) out.alerts.push(txt(e.query));
        return out;
    }
    const list = doc && Array.isArray(doc.alerts) ? doc.alerts : Array.isArray(doc) ? doc : [];
    for (const a of list) {
        if (!a || typeof a !== "object") continue;
        const name = String(a.name || "").replace(/\s+/g, " ").trim();
        if (!name) continue;
        const target = String(a.target || "").toLowerCase();
        const type = String(a.type || "").toLowerCase();
        if (target === "paper") out.watched.push(name);
        else if (target === "author") (type.includes("citation") ? out.citedPersons : out.followed).push(name);
    }
    return out;
}

/** `add` merged into `base`: no repeats (the same person for names, the same
 *  folded text otherwise), `base`'s order first. */
export function wvFdMergeList(base: string[], add: string[], names: boolean): string[] {
    const out = base.slice();
    for (const s of add) {
        const same = (o: string) => {
            if (wvFdFold(o).trim() === wvFdFold(s).trim()) return true;
            if (!names) return false;
            const a = wvFdNameParse(o), b = wvFdNameParse(s);
            return !!(a && b && a.inits && b.inits && wvFdNameMatches(a, b));
        };
        if (!out.some(same)) out.push(s);
    }
    return out;
}

export interface WvFdLists { myNames: string[]; followed: string[]; alerts: string[]; watched: string[]; citedPersons: string[] }

/** A watched paper's line: a DOI, a title, or both ("10.1103/... Drop
 *  splashing on a dry smooth surface"). */
function watchedParts(line: string): { doi: string; label: string } {
    const doi = wvRefCleanDOI(line);
    let label = String(line);
    if (doi) {
        const at = label.toLowerCase().indexOf(doi);
        if (at >= 0) label = label.slice(0, at) + label.slice(at + doi.length);
    }
    label = label.replace(/^[\s:;,.\-–—]+|[\s:;,\-–—]+$/g, "").replace(/\s+/g, " ");
    return { doi, label };
}

/** The alerts file of these lists (followed_authors, cited_people,
 *  watched_works, keyword_alerts), plus Weavero's `identity` (the names as
 *  author, and their surnames). Written over an alerts file (`prev`,
 *  wvFdIsAlertsDoc), its stamp and its other fields stay, and an entry Weavero
 *  still lists keeps what the file's tool added to it (OpenAlex ids,
 *  confidence, institutions, notes); an entry no longer listed goes, unless
 *  the tool had it disabled (`enabled: false`), which stays. Anything else as
 *  `prev` is not merged: the file is written as a new one. */
export function wvFdExportDoc(s: WvFdLists, now: Date, prev?: any): any {
    const old = wvFdIsAlertsDoc(prev) ? prev : null;
    const prevList = (key: string): any[] => (old && Array.isArray(old[key]) ? old[key] : []).filter((e: any) => e && typeof e === "object");
    const same = (a: any, b: any) => wvFdFold(a).trim() === wvFdFold(b).trim() && !!String(a || "").trim();
    const merge = (key: string, items: string[], find: (e: any, item: string) => boolean, make: (item: string) => any): any[] => {
        const pl = prevList(key);
        const used = new Set<any>();
        const out = items.map((item) => {
            const e = pl.find((x) => !used.has(x) && find(x, item));
            if (e) used.add(e);
            return Object.assign({}, e || {}, make(item), { enabled: true });
        });
        for (const x of pl) if (!used.has(x) && x.enabled === false) out.push(x);
        return out;
    };
    const personIs = (e: any, n: string) => {
        if (same(e.name, n) || same(e.scholar_name, n)) return true;
        const a = wvFdNameParse(n), b = wvFdNameParse(e.name);
        return !!(a && b && a.inits && b.inits && wvFdNameMatches(a, b));
    };
    const person = (key: string, names: string[]) => merge(key, names, personIs, (n) => ({ name: n }));
    const surnames: string[] = [];
    for (const n of s.myNames) {
        const t = String(n).trim();
        const sur = t.includes(",") ? t.slice(0, t.indexOf(",")).trim() : t.split(/\s+/).slice(-1)[0];
        if (sur && surnames.indexOf(sur) < 0) surnames.push(sur);
    }
    const followed = person("followed_authors", s.followed);
    // A followed person keeps the alerts file's name for them ("Q. Zed" stays when
    // Weavero lists "Zed, Q."): the ids it resolved belong to that spelling.
    for (const e of followed) { const p = prevList("followed_authors").find((x) => x.name && personIs(x, e.name)); if (p && p.name) e.name = p.name; }
    const cited = person("cited_people", s.citedPersons);
    for (const e of cited) { const p = prevList("cited_people").find((x) => x.name && personIs(x, e.name)); if (p && p.name) e.name = p.name; }
    return Object.assign({}, old || {}, {
        format: old ? old.format : WV_FD_ALERTS_FORMAT,
        updated: now.toISOString().slice(0, 10),
        followed_authors: followed,
        cited_people: cited,
        watched_works: merge("watched_works", s.watched, (e, line) => {
            const w = watchedParts(line);
            return w.doi ? wvRefCleanDOI(e.doi) === w.doi : same(e.label, w.label);
        }, (line) => {
            const w = watchedParts(line);
            const o: any = {};
            if (w.doi) o.doi = w.doi;
            if (w.label) o.label = w.label;
            return o;
        }),
        keyword_alerts: merge("keyword_alerts", s.alerts, (e, q) => same(e.query, q), (q) => ({ query: q })),
        identity: { names: s.myNames.slice(), surnames },
    });
}
