// Open in Browser for a reference that is in none of your libraries
// (1.2.1-refs.9, MJT 2026-11-20; refs.ts _wvRefsWebOpen does the network and
// the opening). Pure: no Zotero, no DOM, so the suite drives it with plain
// strings (test/refs-web.spec.js).
//
// What a click opens, in this order:
//   1. the entry's own link: a DOI written in it (https://doi.org/<DOI>), a
//      URL written in it, or the link Zotero's structure data puts on its
//      text (a link annotation over the entry: WvRefEntry.url) -- never the
//      citing paper's own DOI (a page footer read into the entry);
//   2. else Crossref's answer for the entry (api.crossref.org/works,
//      query.bibliographic = the entry, rows=2), when one of its two rows is
//      CONFIDENT: a relevance score of WV_REF_WEB_MIN_SCORE or more, AND the
//      work's first author is the entry's first author (the matcher's rule,
//      ref-match.ts wvRefFirstAuthorIs), AND a year of the work (issued,
//      print, online) is a year the entry writes (ref-match.ts wvRefYears);
//   3. else a Google Scholar search for the entry's title (or the entry
//      itself when no title was read), its first author and its year.
// The threshold, from five real queries (2026-11-20):
// true matches scored 107.2 (a Vancouver entry with its title), 59.9 and
// 48.0 (APS entries without a title); wrong ones 43.3 (a 1967 REVIEW of the
// cited book, same title and year, author Squire -- refused by the author
// check), 41.9 (another APS paper), 36.4 (a made-up reference).

import { wvRefCleanDOI, wvRefYears, wvRefFirstAuthorIs } from "./ref-match";
import { buildUrlRegex, joinSchemeAlt, schemeAltPart } from "./links";
import { wvTrimTrailing } from "./text";

/** Crossref's relevance score a confident answer needs (see the head of this file). */
export const WV_REF_WEB_MIN_SCORE = 40;

/** What a click opens: `how` "doi" / "url" (written in the entry), "pdf"
 *  (the PDF's own link on it), "crossref" (a confident answer), "scholar". */
export interface WvRefWebTarget {
    url: string;
    how: "doi" | "url" | "pdf" | "crossref" | "scholar";
    /** For "crossref": the answer's DOI and score. */
    doi?: string;
    score?: number;
}

const HTTP_URL = buildUrlRegex(joinSchemeAlt([schemeAltPart("https", "://"), schemeAltPart("http", "://")]));
const DOI_ANY = /\b10\.\d{4,9}\/[^\s"<>]+/gi;

/** The entry without its number ("[12]", "(12)", "12.", AIP's "12"
 *  glued to the first initial) and with its spaces collapsed. */
export function wvRefWebBare(text: any): string {
    return String(text || "").replace(/\s+/g, " ").trim()
        .replace(/^(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\)|\d{1,4}[.)](?=\s|\p{L})|\d{1,3}(?=\s+\p{Lu}|\p{Lu}))\s*/u, "");
}

/** https://doi.org/<doi>, each part of the DOI escaped (a DOI may hold
 *  "<", ";" or "#"). */
export function wvRefDoiUrl(doi: string): string {
    return "https://doi.org/" + String(doi).split("/").map((p) => encodeURIComponent(p)).join("/");
}

/** The entry's own link: a DOI it writes, a URL it writes, else the PDF's
 *  link on it (`pdfUrl`, WvRefEntry.url); null when none. `selfDOIs`: the
 *  citing paper's (lower case), never taken. */
export function wvRefWebOwnLink(text: any, pdfUrl?: string | null, selfDOIs?: string[]): WvRefWebTarget | null {
    const raw = String(text || "");
    const self = new Set((selfDOIs || []).map((d) => String(d).toLowerCase()));
    for (const m of raw.matchAll(DOI_ANY)) {
        const d = wvRefCleanDOI(m[0]);
        if (d && !self.has(d)) return { url: wvRefDoiUrl(d), how: "doi" };
    }
    const u = raw.match(HTTP_URL);
    if (u) {
        const url = wvTrimTrailing(u[0], ".,;:");
        if (url.length > 10 && !/doi\.org\//i.test(url)) return { url, how: "url" };
    }
    const p = String(pdfUrl || "");
    if (/^https?:\/\//i.test(p)) {
        const d = wvRefCleanDOI(p);
        if (!d || !self.has(d)) return { url: p, how: "pdf" };
    }
    return null;
}

/** The years of one Crossref work: issued, published in print, online, published. */
function workYears(w: any): number[] {
    const out: number[] = [];
    for (const f of ["issued", "published-print", "published-online", "published"]) {
        try {
            const y = Number(w[f]["date-parts"][0][0]);
            if (Number.isFinite(y) && out.indexOf(y) < 0) out.push(y);
        } catch (e) {}
    }
    return out;
}

/** The first author's surname of one Crossref work ("" when it has none). */
function workFirst(w: any): string {
    try {
        const a = (w.author || []).find((x: any) => x && x.sequence === "first") || (w.author || [])[0];
        return a ? String(a.family || a.name || "") : "";
    } catch (e) { return ""; }
}

/** Crossref's confident answer for `entry` in `json` (the /works response):
 *  the first of its rows that passes the three checks (the head of this
 *  file), or null; `why` says why each row was refused. */
export function wvRefWebPick(json: any, entry: any): { doi: string; score: number; why: string[] } | null {
    const why: string[] = [];
    let items: any[] = [];
    try { items = Array.from(json.message.items || []).slice(0, 2) as any[]; } catch (e) { items = []; }
    const years = wvRefYears(entry).map(Number);
    for (const w of items) {
        const doi = wvRefCleanDOI(w && w.DOI);
        const score = Number(w && w.score);
        if (!doi) { why.push("no DOI"); continue; }
        if (!(score >= WV_REF_WEB_MIN_SCORE)) { why.push(doi + ": score " + score); continue; }
        const first = workFirst(w);
        if (!first || !wvRefFirstAuthorIs(entry, first)) { why.push(doi + ": first author " + (first || "none")); continue; }
        const wy = workYears(w);
        if (!wy.some((y) => years.indexOf(y) >= 0)) { why.push(doi + ": year " + wy.join("/")); continue; }
        return { doi, score, why };
    }
    return null;
}

const PARTICLES = /^(?:van|von|de|der|den|del|della|di|du|da|le|la|ter|dos|das|el|al)$/i;

/** The entry's first author's surname as it is written ("Peters" in "I. R.
 *  Peters, ...", "van der Meer" in "van der Meer, D."); "" when none. */
export function wvRefWebFirstAuthor(text: any): string {
    const t = wvRefWebBare(text);
    const toks = t.match(/[\p{L}\p{M}'’-]+/gu) || [];
    const out: string[] = [];
    for (const w of toks.slice(0, 12)) {
        if (PARTICLES.test(w)) { out.push(w); continue; }
        if (w.replace(/[^\p{L}]/gu, "").length < 2) { if (out.length) break; continue; }
        out.push(w);
        break;
    }
    return out.length && !PARTICLES.test(out[out.length - 1]) ? out.join(" ") : "";
}

/** Words of two letters or more ("Nature 400:12-15" has one: not a title). */
function words(s: string): number {
    return (s.match(/\p{L}{2,}/gu) || []).length;
}

/** The entry's title, when its style shows where it is; "" otherwise:
 *  - in quotes ("..." or “...”: AIP, APS with titles, IEEE);
 *  - after the year, "(2001). Title." / "2001. Title." / "2001 Title." (APA,
 *    Elsevier, JFM);
 *  - after the authors, "Smith J, Jones AB. Title." (Vancouver).
 *  Three words at least. */
export function wvRefWebTitle(text: any): string {
    const t = wvRefWebBare(text);
    const ok = (s: string) => { const x = s.replace(/[\s.,;:]+$/, "").trim(); return words(x) >= 3 ? x : ""; };
    let m = t.match(/[“"]\s*([^”"]{12,300}?)\s*[”"]/u);
    if (m && ok(m[1])) return ok(m[1]);
    m = t.match(/(?<!\d)(?:1[6-9]|20)\d\d[a-z]?\)?[.,:]?\s+(\p{Lu}[^.?!]{11,300}[.?!])/u);
    if (m && ok(m[1])) return ok(m[1]);
    m = t.match(/^(?:\p{Lu}[\p{L}'’-]+(?:\s\p{Lu}[\p{L}'’-]+)?\s\p{Lu}{1,3},\s*){0,12}\p{Lu}[\p{L}'’-]+(?:\s\p{Lu}[\p{L}'’-]+)?\s\p{Lu}{1,3}(?:,\s*et\s+al)?\.\s+([^.?!]{12,300}[.?!])/u);
    if (m && ok(m[1])) return ok(m[1]);
    return "";
}

/** A Google Scholar search for the entry: its title, first author and year,
 *  or -- no title read -- the entry itself (its links and DOIs out, cut at
 *  250 characters on a word). */
export function wvRefWebScholarUrl(text: any): string {
    const title = wvRefWebTitle(text);
    let q: string;
    if (title) {
        const y = wvRefYears(text)[0] || "";
        q = [title, wvRefWebFirstAuthor(text), y].filter((x) => x).join(" ");
    }
    else {
        q = wvRefWebBare(text).replace(/\bhttps?:\/\/\S+/gi, " ").replace(DOI_ANY, " ").replace(/\bdoi:\s*/gi, " ").replace(/\s+/g, " ").trim();
        if (q.length > 250) q = q.slice(0, 250).replace(/\s+\S*$/, "");
    }
    return "https://scholar.google.com/scholar?q=" + encodeURIComponent(q);
}

/** Crossref's query for the entry: its text without the number, at most
 *  500 characters. */
export function wvRefWebCrossrefUrl(text: any): string {
    let q = wvRefWebBare(text);
    if (q.length > 500) q = q.slice(0, 500).replace(/\s+\S*$/, "");
    return "https://api.crossref.org/works?query.bibliographic=" + encodeURIComponent(q) + "&rows=2";
}
