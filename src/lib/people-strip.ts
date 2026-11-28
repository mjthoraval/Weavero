// The researchers strip (branch peoplenet, plan approved by MJT 2026-11-25:
// "I also want to get the researchers to appear at the top of a search results
// in the items list, when searching on an author name"; design work/people-
// genealogy-ui-survey-2026-11-25.md, part B, P1): who a quick search names.
// Pure: no Zotero, no DOM (modules/people-strip.ts draws).
//
// Matching (survey B5, MJT's brief): a last name, with or without a first name
// or initials, in any order; every typed word used; a word of 3 letters or more
// typed at all, and the start of a last-name word only from 3 letters ("li"
// alone names nobody, "wei li" names Wei Li); never a first name alone. Folded
// as Zotero 11 folds a quick
// search (utilities_internal.js normalizeForSearch: NFKD, marks dropped, lower
// case, then ø œ æ ł đ ð þ ß ı mapped) -- Weavero's own wvPpFold leaves ø, ł
// and ß as they are, so "Sorensen" missed "Sørensen" (survey B3) --, then
// anything but a letter or a digit as a space. Zotero 10 has no
// normalizeForSearch; the fold is written out here for both.

/** Zotero 11's map for the letters NFKD leaves alone (utilities_internal.js _searchNormalizeMap). */
const FOLD_MAP: Record<string, string> = { "ø": "o", "œ": "oe", "æ": "ae", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ß": "ss", "ı": "i" };

/** A text folded for matching names: Zotero's search fold, then words split
 *  on anything but letters and digits. */
export function wvPsFold(s: string): string {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[øœæłđðþßı]/g, (c) => FOLD_MAP[c] || c)
        .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The words of a quick search that can name a person: the free text, and the
 *  value of a `by:` / `creator:` / `author:` condition (Zotero 11's query
 *  syntax, searchQuery.js); never another condition's value ("tag:li" is not
 *  Li). Folded, in order. */
export function wvPsQueryWords(q: string): string[] {
    const out: string[] = [];
    const re = /([A-Za-z]+):("[^"]*"?|\S*)|"([^"]*)"?|(\S+)/g;
    let m: RegExpExecArray | null;
    const s = String(q || "");
    while ((m = re.exec(s))) {
        let text = "";
        if (m[1]) {
            if (!/^(by|creator|author)$/i.test(m[1])) continue;
            text = m[2].replace(/^"|"$/g, "");
        }
        else text = m[3] != null ? m[3] : (m[4] || "");
        for (const w of wvPsFold(text).split(" ")) if (w) out.push(w);
    }
    return out;
}

export interface WvPsPerson {
    key: string;
    last: string;
    first: string;
    /** Other forms of the name ("Last, First" split), every one counts. */
    forms?: Array<{ last: string; first: string }>;
}

export interface WvPsHit {
    key: string;
    person: WvPsPerson;
    /** "exact": every word a whole name word or an initial; "likely": the last
     *  word typed so far is the start of a name word. */
    level: "exact" | "likely";
}

/** The minimum letters of a word that names a last name. */
export const WV_PS_MIN = 3;

/** Whether the words name this form of a name, and how. */
function matchForm(words: string[], last: string, first: string): "exact" | "likely" | null {
    const L = wvPsFold(last).split(" ").filter(Boolean);
    const F = wvPsFold(first).split(" ").filter(Boolean);
    if (!L.length) return null;
    const usedL = new Set<number>(), usedF = new Set<number>();
    let likely = false, lastHit = false;
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const end = i === words.length - 1;
        // A last-name word, whole; or -- the word being typed -- its start.
        let j = L.findIndex((x, k) => !usedL.has(k) && x === w);
        let pre = false;
        if (j < 0 && end && w.length >= WV_PS_MIN) { j = L.findIndex((x, k) => !usedL.has(k) && x.startsWith(w)); pre = j >= 0; }
        if (j >= 0) {
            usedL.add(j);
            lastHit = true;
            if (pre) likely = true;
            continue;
        }
        // A first-name word, whole or by its initial; or the start of one.
        let k = F.findIndex((x, n) => !usedF.has(n) && (x === w || (w.length === 1 && x[0] === w)));
        if (k < 0 && end && w.length > 1) { k = F.findIndex((x, n) => !usedF.has(n) && x.startsWith(w)); if (k >= 0) likely = true; }
        if (k >= 0) { usedF.add(k); continue; }
        return null;
    }
    if (!lastHit) return null;
    return likely ? "likely" : "exact";
}

/** The people `words` name, exact matches first (each person once, at its best
 *  form). Likely matches -- a word still being typed -- only when no more than
 *  `max` people are named that way (a half-typed "tho" flashes nobody). */
export function wvPsMatch(words: string[], people: WvPsPerson[], max = 3): WvPsHit[] {
    const ws = (words || []).filter(Boolean);
    if (!ws.length || !ws.some((w) => w.length >= WV_PS_MIN)) return [];
    const exact: WvPsHit[] = [], likely: WvPsHit[] = [];
    for (const p of people || []) {
        let best: "exact" | "likely" | null = null;
        for (const f of [{ last: p.last, first: p.first }, ...(p.forms || [])]) {
            const m = matchForm(ws, f.last, f.first);
            if (m === "exact") { best = "exact"; break; }
            if (m) best = m;
        }
        if (best === "exact") exact.push({ key: p.key, person: p, level: "exact" });
        else if (best === "likely") likely.push({ key: p.key, person: p, level: "likely" });
    }
    return exact.concat(likely.length <= max ? likely : []);
}
