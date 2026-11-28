// A paper's reference list, from Zotero's structured document text (refs.ts
// reads it: `wvSdtReader(attachmentID)` (lib/sdt.ts) -> `materialize()`). Pure:
// no Zotero, no DOM, so the suite drives it with a fixture
// (test/refs-match.spec.js).
//
// 1. The blocks Zotero flags `reference: true` (document-worker
//    structure.js, markReferenceNode), a continuation (`previousPart`) joined
//    to the block it continues (`nextPart`).
// 2. None flagged: a NUMBERED list Weavero reads itself. Zotero keeps a list
//    only when most of its entries look like sources to it (document-worker
//    reference/support.js, `getReferenceSourceEvidence`), and an APS entry,
//    "D. Bartolo, ..., Phys. Rev. Lett. 96, 124501 (2006).", does not: the
//    year sits inside parentheses at the end, with nothing after it. Paper 02
//    of the 2026-11-18 test library (Physical Review Fluids) came out with
//    no reference list at all, its 66 entries three `list` blocks of `[n]`
//    items after the body -- and no "References" heading (APS prints none).
//    A run of entries numbered 1, 2, 3, ... counts as the reference list:
//      - right after a references heading ("References", "Bibliography", ...
//        a short line of its own), with any numbering: [1], 1., (1), 1);
//      - without one, only bracketed numbers, at least MIN_BARE entries, most
//        of them with a year.
//    The run goes on across page furniture, figures and page breaks; an
//    item without a number of its own inside a run (a line the layout split
//    off) joins the entry before it.
// 3. Some flagged, not all (1.2.1-refs.7). Zotero's flags can miss part of a
//    list, and can take a paper's front matter for references:
//    - Physics of Fluids (AIP; Zhu et al. 2020, MJT's library): Zotero
//      flagged "Cite as: Phys. Fluids 32, 041705 (2020); doi: ..." and
//      "Submitted: ... Accepted: ..." on page 1, and entries 6 to 55, not 1
//      to 5 (a list of their own under the REFERENCES heading). Wei &
//      Thoraval 2021: the two front-matter lines alone, none of its 85
//      entries. AIP prints each number as a superscript glued to the first
//      initial, "6V. Bertola", a label of its own kind here ("glued").
//    - Current Opinion in Colloid & Interface Science (Blanken et al. 2021):
//      annotated entries ("* . Zhang JM, ...: Fine radial jetting ...",
//      then a paragraph about the paper) are left unflagged between flagged
//      ones.
//    So: front-matter lines are never entries; a numbered list read here
//    that runs through the flagged entries adds the ones Zotero missed; and
//    between two flagged entries, an unflagged item that reads as a
//    reference (a year, and a DOI, a volume and page, or "et al.") is one.
// Every entry whose list is numbered keeps its label apart, written once
// with a space after it ("1.Quéré, D." -> "1. Quéré, D."; "6V. Bertola" ->
// "6 V. Bertola"): `label`, and the text starting with it.

import { ocrYearsRead, wvRefVolPages } from "./ref-match";

/** One entry: its text and its boxes, [page, x1, y1, x2, y2]; `label` the
 *  number as the paper prints it ("[12]", "12.", "(12)", "12") when its list
 *  is numbered -- the text then starts with it and one space. */
export interface WvRefEntry {
    text: string;
    rects: number[][];
    label?: string;
    /** The entry's own link in the PDF (1.2.1-refs.9, Open in Browser): an
     *  external target Zotero's structure data put on its text -- a link
     *  annotation over it, or a DOI / URL Zotero read in it (document-worker
     *  structure/link.js + apply-refs.js: a run's `target.url`); a doi.org
     *  one first. Absent when it has none. */
    url?: string;
}

/** An entry as read, with where it sits in the document (the first and last
 *  block of it, in reading order). */
interface Ent extends WvRefEntry {
    at: number;
    end: number;
    /** The numbered run it was read in (wvRefListDetect). */
    run?: number;
    /** Its blocks, in the order its text was read from them (a split needs
     *  their text maps: boxesFrom). */
    blocks?: any[];
}

/** Where a paper's entries came from. */
export type WvRefListHow = "flagged" | "detected" | "none";

/** A numbered entry's label: its number, how it is written, and the label
 *  itself as printed with the text after it. */
export interface WvRefLabel {
    n: number;
    kind: "bracket" | "dot" | "paren" | "bare" | "glued";
    label: string;
    rest: string;
}

/** A list without a references heading needs this many entries. */
const MIN_BARE = 5;
/** ... and this share of them with a year. */
const BARE_YEARS = 0.6;
/** A list under a references heading needs this share of its entries with
 *  a year (1.2.1-refsacc.1). */
const TITLED_YEARS = 0.3;
/** The share of a run's steps that must be +1 (a label the layout lost may skip one). */
const SEQ_SHARE = 0.8;
/** The largest forward jump that still continues a run. */
const MAX_JUMP = 3;
/** Lines without a number joined to one entry, at most. */
const MAX_CONT = 3;
/** Entries kept, at most. */
const MAX_ENTRIES = 2000;

/** Reference-list titles (document-worker reference/titles.js, the Latin-
 *  script languages and CJK), compared lower case without accents. */
const TITLES = new Set([
    "references", "bibliography", "references and notes", "notes and references", "works cited", "literature cited",
    "cited references", "list of references", "selected references", "reference list", "sources", "citations", "literature",
    "bibliographie", "references bibliographiques", "literaturverzeichnis", "quellenverzeichnis", "referenzen", "literatur",
    "literaturangaben", "referencias", "bibliografia", "referencias bibliograficas",
    "riferimenti", "riferimenti bibliografici", "referenties", "literatuurlijst", "bibliografie", "bronnen", "referenser",
    "referenslista", "referanser", "litteraturliste", "referencer", "lahteet", "viitteet", "literatura", "pismiennictwo",
    "kaynaklar", "kaynakca", "irodalomjegyzek", "参考文献", "参考资料", "文献", "참고문헌",
    // 1.2.1-citd.1 (the r5 set's Russian, Japanese, Chinese, Italian, German, Spanish, French papers):
    "список литературы", "литература", "библиография", "библиографический список", "литературные источники",
    "список использованной литературы", "использованная литература", "источники", "引用文献", "參考文獻", "参考書目",
    "opere citate", "schriftenverzeichnis", "quellen", "quellen und literatur", "quellen und literaturverzeichnis",
    "obras citadas", "literatura citada", "bibliografia consultada", "ouvrages cites", "references citees", "irodalom",
    "litteratur", "kallor", "pouzita literatura", "literatura cytowana",
].map((t) => fold(t)));
/** The same titles without their spaces: a heading set letter-spaced ("参 考 文 献", "引 用 文 献",
 *  "R E F E R E N C E S" in an old scan) or a Korean one written either way ("참고 문헌"). */
const TITLES_TIGHT = new Set([...TITLES].map((t) => t.replace(/[\s-]+/g, "")));

function fold(s: string): string {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Is `text` a reference-list title: "References", "7 References",
 *  "VII. REFERENCES", "References:"? */
export function wvRefListIsTitle(text: any): boolean {
    const t = fold(text)
        // A symbol before it: ACS's "■ REFERENCES".
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .replace(/^(?:\d+(?:\.\d+)*|[ivxlc]+)[.)]?\s+/, "")
        .replace(/[\s.:;-]+$/, "");
    if (!(t.length > 0 && t.length <= 40)) return false;
    if (TITLES.has(t)) return true;
    // Since 1.2.1-citd.1: letter-spaced ("参 考 文 献"); in two languages, the second in brackets
    // or after a slash ("参考文献(References)", "Литература / References").
    const tight = (x: string) => TITLES_TIGHT.has(x.replace(/[\s-]+/g, ""));
    if (tight(t)) return true;
    const two = t.match(/^(.+?)\s*(?:\(([^()]+)\)|[（]([^（）]+)[）]|\s\/\s(.+))$/);
    return !!two && (TITLES.has(two[1].trim()) || tight(two[1])) && [two[2], two[3], two[4]].some((x) => x !== undefined && (TITLES.has(x.trim()) || tight(x)));
}

/** The number an entry starts with: "[12]", "12.", "12.Smith" (the space
 *  lost), "(12)", "12)", "12 Smith", and AIP's superscript glued to the first
 *  initial or word, "12S. Smith" / "12Fundamentals of ...". */
export function wvRefListLabel(text: any): WvRefLabel | null {
    const t = String(text || "");
    const lab = (m: RegExpMatchArray, kind: WvRefLabel["kind"], label: string): WvRefLabel =>
        ({ n: Number(m[1]), kind, label, rest: t.slice(m[0].length).replace(/^\s+/, "") });
    let m = t.match(/^\s*\[\s*(\d{1,4})\s*\]/);
    if (m) return lab(m, "bracket", "[" + m[1] + "]");
    m = t.match(/^\s*\(\s*(\d{1,4})\s*\)(?=\s*\S)/);
    if (m) return lab(m, "paren", "(" + m[1] + ")");
    // Not "1.5 mm": a space or a letter after the dot.
    m = t.match(/^\s*(\d{1,4})\.(?=\s+\S|\p{L})/u);
    if (m) return lab(m, "dot", m[1] + ".");
    m = t.match(/^\s*(\d{1,4})\)(?=\s*\S)/);
    if (m) return lab(m, "paren", m[1] + ")");
    m = t.match(/^\s*(\d{1,3})(?=\s+\p{Lu})/u);
    if (m) return lab(m, "bare", m[1]);
    m = t.match(/^\s*(\d{1,3})(?=\p{Lu})/u);
    if (m) return lab(m, "glued", m[1]);
    return null;
}

/** A paper's front matter, never a reference: "Cite as: Phys. Fluids 32,
 *  041705 (2020); doi: ...", "Submitted: 24 February 2020 • Accepted: ...",
 *  "Received ...", "Published Online: ...", "Citation: ...", "© 2020 ...";
 *  since 1.2.1-refs.8 also APS's "(Received 2 February 2018; published 17
 *  October 2018)" and "This paper is associated with a video winner of ..."
 *  (Durey et al. 2018, Phys. Rev. Fluids: Zotero flagged these two lines
 *  alone, the paper's seven "[n]" entries not at all). */
export function wvRefListIsFrontMatter(text: any): boolean {
    const t = String(text || "").trim();
    return /^\(?\s*(?:cite\s+(?:as|this(?:\s+article)?)\b|to\s+cite\b|citation\s*:|(?:submitted|received|accepted|revised|published(?:\s+online)?|available\s+online|article\s+history)\b|copyright\s*(?:©|\(c\)|\d{4})|©)/i.test(t)
        || /^this\s+(?:paper|article)\s+is\s+(?:associated\s+with|part\s+of)\b/i.test(t);
}

/** Words of an argument -- pronouns, auxiliaries, connectives -- that a
 *  reference's title seldom holds three of ("when the higher temperature is on
 *  the under side" holds none). */
const PROSE_WORDS = new Set(["we", "it", "that", "which", "there", "can", "could", "was", "were", "has", "have", "been", "be", "our",
    "these", "this", "however", "thus", "therefore", "moreover", "shown", "found", "seen"]);

/** A paragraph of the paper's text, not a reference (1.2.1-refs.8, the
 *  2026-11-20 survey's F9): no number of its own, 200 characters or more, two
 *  citations in the text's own form -- "Grove et al. (1964)", "Nishioka & Sat0
 *  (1974)" (an OCR'd zero), "(Taylor 1934" -- and three words of an argument.
 *  Zotero flagged two such paragraphs of an old JFM scan (Coutanceau & Bouard
 *  1977) as its reference list. A reference with two dated names ("Rayleigh,
 *  Lord (1916a). On convection currents ... Also Scientific papers (1920)")
 *  holds no such word; an author's initials, "Hinch EJ (1977)", are never a
 *  name here (the second letter is lower case). */
function isProse(text: string): boolean {
    const t = clean(text);
    if (t.length < 200 || wvRefListLabel(t)) return false;
    const inText = (t.match(/\b\p{Lu}\p{Ll}[\p{L}\d'’-]*(?:\s+et\s+al\.?)?\s*\(\s*\d{4,5}[a-z]?\s*[),;]/gu) || []).length
        + (t.match(/\(\s*(?:see\s+)?\p{Lu}[\p{Ll}'’-]+(?:\s+et\s+al\.?|\s+(?:and|&)\s+\p{Lu}[\p{Ll}'’-]+)?,?\s+(?:1[6-9]|20)\d\d[a-z]?/gu) || []).length;
    if (inText < 2) return false;
    const seen = new Set<string>();
    for (const w of t.toLowerCase().split(/[^\p{L}]+/u)) if (PROSE_WORDS.has(w)) seen.add(w);
    return seen.size >= 3;
}

function num(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

function textOf(n: any): string {
    if (!n || typeof n !== "object") return "";
    if (typeof n.text === "string") return n.text;
    const kids = Array.isArray(n.content) ? n.content : [];
    const inline = kids.some((c: any) => c && typeof c.text === "string");
    return kids.map(textOf).join(inline ? "" : " ");
}

function rectsOf(n: any): number[][] {
    const pr = n && n.anchor && n.anchor.pageRects;
    const res: number[][] = [];
    if (!Array.isArray(pr)) return res;
    for (const r of pr) if (Array.isArray(r) && r.length >= 5) res.push([num(r[0]), num(r[1]), num(r[2]), num(r[3]), num(r[4])]);
    return res;
}

/** Text as read: Adobe's private-use small capitals and old-style figures
 *  (U+F761-F77A a-z, U+F730-F739 0-9) as the letters and digits they draw --
 *  an old JFM PDF sets its authors' names so ("S" + U+F761 U+F766 ... is
 *  "Saffman"), and nothing else reads them (1.2.1-refs.8) -- and spaces
 *  collapsed. */
function clean(s: string): string {
    return s.replace(/[\uf730-\uf739\uf761-\uf77a]/g, (c) => {
        const k = c.charCodeAt(0);
        return String.fromCharCode(k >= 0xf761 ? k - 0xf761 + 97 : k - 0xf730 + 48);
    }).replace(/\s+/g, " ").trim();
}

/** Every block of `s` (not its inline runs) -> its place in reading order. */
function orderOf(s: any): Map<any, number> {
    const m = new Map<any, number>();
    if (!s || !Array.isArray(s.content)) return m;
    const stack: any[] = s.content.slice().reverse();
    let k = 0;
    while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object" || typeof n.text === "string" || m.has(n)) continue;
        m.set(n, k++);
        if (Array.isArray(n.content)) for (let i = n.content.length - 1; i >= 0; i--) stack.push(n.content[i]);
    }
    return m;
}

function strip(es: Ent[]): WvRefEntry[] {
    return es.map((e) => {
        const o: WvRefEntry = { text: e.text, rects: e.rects };
        if (e.label) o.label = e.label;
        const u = e.blocks ? linkOf(e.blocks, e.text) : "";
        if (u) o.url = u;
        return o;
    });
}

/** The external link on the text of `blocks` that belongs to `text` (a run
 *  whose words are in it: an entry cut in two keeps its blocks, and the
 *  other part's link is not its own), http(s) only, a doi.org one first;
 *  "" when none. Internal links (`refs`: back to where the paper cites the
 *  entry, PLOS's numbers) never lead online and are not read. */
function linkOf(blocks: any[], text: string): string {
    let first = "";
    const flat = clean(text).replace(/\s+/g, "");
    for (const b of blocks) {
        for (const r of runsOf(b)) {
            const u = r && r.target && typeof r.target.url === "string" ? r.target.url : "";
            if (!u || !/^https?:\/\//i.test(u)) continue;
            const w = clean(String(r.text || "")).replace(/\s+/g, "");
            if (!w || flat.indexOf(w) < 0) continue;
            if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(u)) return u;
            if (!first) first = u;
        }
    }
    return first;
}

/** The node a structure path ([i, j, ...] from the top) names. */
function nodeAt(s: any, ref: any): any {
    let n: any = s;
    for (const i of ref) n = n && n.content && n.content[i];
    return n;
}

/** The blocks Zotero flagged `reference: true`, in document order, its
 *  front-matter lines and paragraphs of prose left out. */
function flaggedIn(s: any, order: Map<any, number>): Ent[] {
    const out: Ent[] = [];
    if (!s || !Array.isArray(s.content)) return out;
    const stack: any[] = s.content.slice().reverse();
    while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object" || typeof n.text === "string") continue;
        if (n.reference) {
            if (!Array.isArray(n.previousPart)) {
                let text = textOf(n);
                const rects = rectsOf(n);
                const blocks = [n];
                const k0 = order.get(n);
                const at = k0 === undefined ? -1 : k0;
                let end = at;
                let next = n.nextPart;
                for (let g = 0; Array.isArray(next) && g < 5; g++) {
                    const p = nodeAt(s, next);
                    if (!p) break;
                    text += " " + textOf(p);
                    rects.push(...rectsOf(p));
                    blocks.push(p);
                    const kp = order.get(p);
                    if (kp !== undefined && kp > end) end = kp;
                    next = p.nextPart;
                }
                text = clean(text);
                if (!wvRefListIsFrontMatter(text) && !isProse(text)) out.push({ text, rects, at, end, blocks });
            }
            continue;
        }
        if (Array.isArray(n.content)) for (let i = n.content.length - 1; i >= 0; i--) stack.push(n.content[i]);
    }
    return out;
}

/** The blocks Zotero flagged `reference: true`, in document order (front
 *  matter left out). */
export function wvRefListFlagged(s: any): WvRefEntry[] {
    return strip(flaggedIn(s, orderOf(s)));
}

/** A block the reading goes past: page furniture (running heads, page
 *  numbers), figures, captions, equations set apart. */
function transparent(b: any): boolean {
    const f = b && b.flowClass;
    return f === "excluded" || f === "auxiliary" || ["image", "caption", "figure", "math"].includes(b && b.type);
}

interface Run {
    kind: WvRefLabel["kind"];
    titled: boolean;
    /** `empty`: a label printed alone, its text still to come (take()). */
    entries: Array<Ent & { n: number; cont: number; empty?: boolean }>;
    last: number;
    steps: number;
    seq: number;
}

/** A numbered reference list Zotero did not flag (see the head of this
 *  file), in document order; [] when there is none. */
export function wvRefListDetect(s: any): WvRefEntry[] {
    return strip(labelled(detectIn(s, orderOf(s))));
}

/** A label OCR misread, under a references heading (1.2.1-refsacc.1): a
 *  bracket or parenthesis whose closing mark came out as "1", "l", "I", "J"
 *  or "}" ("[11 G. T. Taylor" for [1], "[71 H. Schlichting" for [7] -- J.
 *  Res. NBS 1947), digits read as letters ("(I)", "(IO)", "(I I )" -- Rep.
 *  Prog. Phys. 1937). The reading `want` accepts (the run's next number),
 *  written as the label it is, or null. */
function ocrLabel(text: string, want: (n: number) => boolean): WvRefLabel | null {
    // A closing parenthesis alone after digits OCR read as letters or spaced apart (refsfix,
    // 2026-11-24; Akao et al. 1980, Trans. ISIJ, MJT's scan): "I)" for 1), "II )" for 11) -- a
    // letter among them or a space before the mark (plain "11)" is wvRefListLabel's).
    const e = text.match(/^\s*([0-9Il|](?:\s?[0-9Il|]){0,2})(\s?)\)(?=\s*\S)/);
    if (e && (/[Il|]/.test(e[1]) || /\s/.test(e[1] + e[2]))) {
        const n = Number(e[1].replace(/[Il|]/g, "1").replace(/\s+/g, ""));
        if (!(Number.isFinite(n) && n > 0 && want(n))) return null;
        return { n, kind: "paren", label: n + ")", rest: text.slice(e[0].length).replace(/^\s+/, "") };
    }
    // Since 1.2.1-citd.1 also S for 5 ("[S] SAVICP., The cooling of a hot surface ...", MJT's
    // 1966 Chem. Eng. Sci. scan, between [4] and [6]).
    const m = text.match(/^\s*([[(])\s*([0-9IlOS|](?:\s?[0-9IlOS|]){0,3})\s*([\])}1lIJ|])(?=\s*\S)/);
    if (!m) return null;
    const norm = (x: string) => Number(x.replace(/[Il|]/g, "1").replace(/O/g, "0").replace(/S/g, "5").replace(/\s+/g, ""));
    const cands = [norm(m[2])];
    if (/[1lI]/.test(m[3])) cands.push(norm(m[2] + m[3]));
    const n = cands.find((x) => Number.isFinite(x) && x > 0 && want(x));
    if (n === undefined) return null;
    const bracket = m[1] === "[";
    return { n, kind: bracket ? "bracket" : "paren", label: bracket ? "[" + n + "]" : "(" + n + ")", rest: text.slice(m[0].length).replace(/^\s+/, "") };
}

/** A paragraph that heads another part than the references: "Figure
 *  Captions:", "Tables", "Appendix A" (1.2.1-refsacc.1: an arXiv preprint of
 *  1994 prints its figure captions, numbered "1." and "2.", right after its
 *  author-year list). */
function otherPart(text: string): boolean {
    const t = String(text || "").trim();
    return t.length <= 40 && /^(?:figures?|fig\.|tables?|captions?|appendi(?:x|ces)|acknowledge?ments?)\b[^.]{0,30}$/i.test(t);
}

function detectIn(s: any, order: Map<any, number>): Ent[] {
    if (!s || !Array.isArray(s.content)) return [];
    const done: Ent[] = [];
    let cur: Run | null = null;
    let titled = false;
    const ord = (n: any) => { const k = order.get(n); return k === undefined ? -1 : k; };
    let runs = 0;
    const close = () => {
        const r = cur;
        cur = null;
        if (!r) return;
        // A label alone whose text never came is no entry.
        r.entries = r.entries.filter((e) => !e.empty);
        if (!r.entries.length) return;
        const years = r.entries.filter((e) => YEAR_RX.test(e.text)).length;
        // Under a references heading one entry is a list when it has a year
        // (1.2.1-refsacc.1: APS Physics's one-reference viewpoints).
        if (r.entries.length < 2 && !(r.titled && years)) return;
        if (r.steps && r.seq / r.steps < SEQ_SHARE) return;
        // Under a heading too, some years (1.2.1-refsacc.1): not figure
        // captions numbered "1.", "2." after the list.
        if (r.titled && years / r.entries.length < TITLED_YEARS) return;
        if (!r.titled) {
            // No heading: at least MIN_BARE entries, most with a year -- any
            // numbering since 1.2.1-refs.7 ("(1)", "1.", AIP's glued
            // superscripts before 2019: no heading at all), a bare or glued
            // number only as a run 1, 2, 3, ... with (since 1.2.1-refsacc.1)
            // one step in ten skipped at most: a number the layout merged into
            // the entry before it (Phys. Fluids 2012, "8 S. V. Alekseenko ..."
            // holding 9).
            if (r.entries.length < MIN_BARE) return;
            if ((r.kind === "bare" || r.kind === "glued") && r.steps - r.seq > Math.floor(r.steps / 10)) return;
            if (years / r.entries.length < BARE_YEARS) return;
        }
        runs++;
        for (const e of r.entries) {
            if (done.length >= MAX_ENTRIES) break;
            done.push({ text: clean(e.text), rects: e.rects, at: e.at, end: e.end, run: runs, blocks: e.blocks });
        }
    };
    /** The label `text` starts with; in a run of glued numbers also the next
     *  number glued to a lower-case word ("28online database ...": AIP, 2016),
     *  which would otherwise end the run's strict 1, 2, 3, ... */
    const labelOf = (text: string): WvRefLabel | null => {
        const lab = wvRefListLabel(text);
        if (lab) return lab;
        if (cur && cur.kind === "glued") {
            const g = text.match(/^\s*(\d{1,3})(?=\p{Ll})/u);
            return g && Number(g[1]) === cur.last + 1 ? { n: Number(g[1]), kind: "glued", label: g[1], rest: text.slice(g[0].length) } : null;
        }
        // Under a references heading, a label OCR misread (ocrLabel): the
        // number that goes on the run, or one that may start it.
        if (cur ? cur.titled : titled) {
            const c = cur;
            return ocrLabel(text, (n) => (c ? (c.kind === "bracket" || c.kind === "paren") && n > c.last && n <= c.last + MAX_JUMP : n === 1));
        }
        // Without one (1.2.1-citd.1), only the very next number of a bracketed
        // run already going ("[4] ... [S] ... [6]").
        if (cur && (cur.kind === "bracket" || cur.kind === "paren")) {
            const c = cur;
            return ocrLabel(text, (n) => n === c.last + 1);
        }
        return null;
    };
    /** Labels printed alone in an item ("2)", "3)", "2) 3)", "[4]"; refsfix, 2026-11-24): each
     *  the run's next number and of its kind (brackets and parentheses only), nothing else in the
     *  item. Each goes on the run as an entry whose text is still to come (take() gives it the
     *  next items' text; close() drops one that got none). True when the item was that. */
    const aloneLabels = (it: any, text: string, c: Run): boolean => {
        if (c.kind !== "bracket" && c.kind !== "paren") return false;
        let t = clean(String(text || ""));
        if (!t || t.length > 24) return false;
        const got: WvRefLabel[] = [];
        let at = c.last;
        while (t) {
            const want = (n: number) => n > at && n <= at + MAX_JUMP;
            const probe = t + " X";
            const l = wvRefListLabel(probe) || ocrLabel(probe, want);
            if (!l || l.kind !== c.kind || !want(l.n)) return false;
            got.push(l);
            at = l.n;
            t = l.rest.replace(/\s*X$/, "").trim();
        }
        for (const l of got) {
            c.steps++;
            if (l.n === c.last + 1) c.seq++;
            c.entries.push({ text: l.label, rects: rectsOf(it), at: ord(it), end: ord(it), n: l.n, cont: 0, blocks: [it], empty: true });
            c.last = l.n;
        }
        return got.length > 0;
    };
    /** One item (a list item or a paragraph); false when it ends the run. */
    const take = (it: any, inList: boolean): boolean => {
        const text = textOf(it);
        const last = cur && cur.entries.length ? cur.entries[cur.entries.length - 1] : null;
        // Labels printed alone, their texts in the items after them, in order (refsfix,
        // 2026-11-24; Akao et al. 1980, Trans. ISIJ, MJT's scan: "2)", "3)", then "A. Moriyama:
        // ... 290.", "A. Moriyama and K . Araki: 533.", "Tetsu-to-Hagani, 64 ( 1978),"): the first
        // text item after them is the first label's, the next one the next label's, the rest
        // lines of the last -- never two entries' texts under one label.
        const waiting = cur ? cur.entries.find((e) => e.empty) : undefined;
        const give = (e: Ent & { cont: number; empty?: boolean }) => {
            e.text += " " + text;
            e.empty = false;
            e.rects.push(...rectsOf(it));
            e.blocks!.push(it);
            e.end = Math.max(e.end, ord(it));
        };
        if (Array.isArray(it.previousPart) && last) {
            give(waiting || last);
            return true;
        }
        if (cur && aloneLabels(it, text, cur)) return true;
        const lab = labelOf(text);
        // A label read through OCR's errors is written as the label it is.
        const own = lab && !wvRefListLabel(text) && (lab.kind === "bracket" || lab.kind === "paren") ? lab.label + " " + lab.rest : text;
        // A bare number, or one glued to the first initial (AIP): under a
        // references heading, or without one when it starts or goes on a run
        // of its own kind (close() then wants the evidence).
        const loose = lab && (lab.kind === "bare" || lab.kind === "glued");
        const allowed = lab && (!loose || titled || (cur && cur.titled) || !cur || cur.kind === lab.kind);
        if (lab && allowed) {
            if (cur && lab.kind === cur.kind && lab.n > cur.last && lab.n <= cur.last + MAX_JUMP) {
                cur.steps++;
                if (lab.n === cur.last + 1) cur.seq++;
                cur.entries.push({ text: own, rects: rectsOf(it), at: ord(it), end: ord(it), n: lab.n, cont: 0, blocks: [it] });
                cur.last = lab.n;
                return true;
            }
            if (lab.n === 1) {
                close();
                cur = { kind: lab.kind, titled, entries: [{ text: own, rects: rectsOf(it), at: ord(it), end: ord(it), n: lab.n, cont: 0, blocks: [it] }], last: lab.n, steps: 0, seq: 0 };
                return true;
            }
        }
        // No number of its own (or one out of order): the text of a label printed
        // alone before it, or a line split off the entry before it, inside a list or
        // under a references heading.
        if (waiting && (inList || cur!.titled)) {
            give(waiting);
            return true;
        }
        if (last && (inList || cur!.titled) && last.cont < MAX_CONT) {
            last.cont++;
            last.text += " " + text;
            last.rects.push(...rectsOf(it));
            last.blocks!.push(it);
            last.end = Math.max(last.end, ord(it));
            return true;
        }
        return false;
    };
    // A list or paragraph Zotero classed as a side note (`auxiliary`) is read
    // when its number goes on the run or starts one (1.2.1-refs.8, the
    // survey's F2): Phys. Fluids 2011 has its references 1-5 in such a list,
    // Phys. Rev. E 2023 its [1] in such a paragraph at a page foot; passed by
    // otherwise, as page furniture is.
    const fits = (b: any): boolean => {
        if (b.flowClass !== "auxiliary" || (b.type !== "list" && b.type !== "paragraph")) return false;
        const first = b.type === "list" ? (Array.isArray(b.content) ? b.content.find((x: any) => x && typeof x === "object") : null) : b;
        const lab = first ? labelOf(textOf(first)) : null;
        if (!lab) return false;
        return cur ? lab.kind === cur.kind && lab.n > cur.last && lab.n <= cur.last + MAX_JUMP : lab.n === 1;
    };
    for (const b of s.content) {
        if (!b || typeof b !== "object" || (transparent(b) && !fits(b))) continue;
        const text = b.type === "list" ? "" : textOf(b);
        if (b.type === "heading") {
            close();
            titled = wvRefListIsTitle(text);
            continue;
        }
        if (b.type === "paragraph" && wvRefListIsTitle(text)) {
            close();
            titled = true;
            continue;
        }
        if (b.type === "paragraph" && otherPart(text)) {
            close();
            titled = false;
            continue;
        }
        if (b.type === "list" && Array.isArray(b.content)) {
            for (const it of b.content) {
                if (!it || typeof it !== "object") continue;
                if (!take(it, true)) close();
            }
            continue;
        }
        if (b.type === "paragraph") {
            if (!take(b, false)) close();
            continue;
        }
        close();
    }
    close();
    return done;
}

/** Does `text` start an author-year entry: a surname and initials, then a
 *  year within its first 200 characters? "Acrivos, A., and T. S. Lo, 1978,
 *  J. Fluid Mech. ..." (Rev. Mod. Phys.), "de Bruijn, R. A., 1993", "Eggers J,
 *  Villermaux E (2008) ...", an old JFM scan's small capitals as OCR'd:
 *  "CRAPPER,G. D. 1957 ...", "LONGUET-HIQGINMS., S. 1983 ...". Not a
 *  number first (a numbered list is read otherwise), not "In SI units ..."
 *  (two capitals need a comma after them). */
function ayStart(text: string): boolean {
    // Composed (1.2.1-refsacc.1): "C" + a combining cedilla is "Ç" ("ÇELIK, B. 2011").
    const t = String(text || "").normalize("NFC").replace(/^[\s*•·]+/u, "");
    const y = t.slice(0, 200).search(YEAR_RX);
    if (y < 0 || /^\d/.test(t)) return false;
    // A CJK name first (1.2.1-citd.1): "龙花楼, 屠爽爽. 2017. 论乡村重构[J]", "中谷 友樹（2011）．
    // 健康と場所", "김윤미, 이지현 (2014)" -- a name of one to six characters (a space within
    // allowed), a separator, the year in the first 60 characters.
    if (CJK_START.test(t)) return y <= 60;
    // A given name written out, the year in brackets after the names (1.2.1-citd.1): French,
    // Italian, Spanish humanities lists, "Ayres-Bennett, Wendy (1987), Vaugelas and ...",
    // "Bauer, Laurie et Peter Trudgill (dir.) (1998), Language Myths".
    if (/^\p{Lu}[\p{Ll}'’-]+(?:[\s-]\p{Lu}[\p{Ll}'’-]+){0,2},\s+\p{Lu}[\p{Ll}'’-]+(?:[\s-]\p{Lu}[\p{Ll}'’.-]*){0,3}(?:\s+(?:et|and|und|e|y|&)\s+\p{Lu}[\p{Ll}'’-]+(?:\s+\p{Lu}[\p{Ll}'’-]+){0,2})?\s*(?:\((?:dir|éd|ed|eds|coord|Hrsg|a cura di)\.?\)\s*)?\(\s*(?:1[6-9]|20)\d\d[a-z]?\s*\)/u.test(t)) return true;
    if (/^\p{Lu}[\p{Lu}'’-]{2,}(?=[\s,.;&\d])/u.test(t)) return true;
    return /^(?:(?:van|von|de|der|den|del|della|di|du|da|le|la|ter|dos|das|el|al)\s+){0,3}\p{Lu}[\p{Ll}'’-]+(?:[\s-]\p{Lu}[\p{Ll}'’-]+){0,2}(?:,?\s+\p{Lu}\.|,\s*\p{Lu}{1,3}(?=[\s,.;:])|\s+\p{Lu}{1,3},)/u.test(t);
}

/** An author-year reference list Zotero did not flag (1.2.1-refs.8, the
 *  2026-11-20 survey's F7), in document order; [] when there is none.
 *  Only under a references heading, until the next heading: five entries or
 *  more (ayStart), most with a year. A line that does not start an entry
 *  joins the one before it in its list (MAX_CONT at most), a paragraph only
 *  a paragraph's. Old JFM scans OCR a list column by column -- first all the
 *  entries' first lines, then all their second lines (Longuet-Higgins 1990)
 *  -- so a list with three first lines or more followed by three lines or
 *  more that start none keeps its first lines alone; a list that starts no
 *  entry at all is not joined to anything. */
function authorYearIn(s: any, order: Map<any, number>, cut: number): Ent[] {
    if (!s || !Array.isArray(s.content)) return [];
    const done: Ent[] = [];
    const ord = (n: any) => { const k = order.get(n); return k === undefined ? -1 : k; };
    let titled = false;
    let cur: Array<Ent & { cont: number; para: boolean }> | null = null;
    let runs = 0;
    const close = () => {
        const r = cur;
        cur = null;
        if (!r || r.length < MIN_BARE) return;
        if (r.filter((e) => YEAR_RX.test(e.text)).length / r.length < BARE_YEARS) return;
        runs++;
        for (const e of r) {
            if (done.length >= MAX_ENTRIES) break;
            done.push({ text: clean(e.text), rects: e.rects, at: e.at, end: e.end, run: 100000 + runs, blocks: e.blocks });
        }
    };
    const begin = (it: any, para: boolean, text?: string) => { cur!.push({ text: text || textOf(it), rects: rectsOf(it), at: ord(it), end: ord(it), blocks: [it], cont: 0, para }); };
    // "The same authors, another year" (1.2.1-refsacc.1): ". 1991b, ApJ, 371,
    // L73" or "———, 1991" after "Iglesias, C. A., & Rogers, F. J. 1991a, ApJ,
    // 371, 408" -- an entry of its own, the authors before written in.
    const ditto = (t: string): string | null => {
        const last = cur && cur.length ? cur[cur.length - 1] : null;
        const m = String(t || "").match(/^\s*(?:[—–_.-]{1,6}\s*,?\s*)(?=\(?(?:1[6-9]|20)\d\d[a-z]?\b)/);
        if (!m || !last) return null;
        const y = last.text.search(YEAR_RX);
        const who = y > 0 ? last.text.slice(0, y).replace(/[\s,(]+$/, "") : "";
        return who ? who + " " + t.slice(m[0].length) : null;
    };
    const join = (it: any, force: boolean) => {
        const last = cur && cur.length ? cur[cur.length - 1] : null;
        if (!last || (!force && last.cont >= MAX_CONT)) return;
        if (!force) last.cont++;
        last.text += " " + textOf(it);
        last.rects.push(...rectsOf(it));
        last.blocks!.push(it);
        last.end = Math.max(last.end, ord(it));
    };
    for (const b of s.content) {
        if (!b || typeof b !== "object" || transparent(b)) continue;
        if (ord(b) <= cut) continue;
        const text = b.type === "list" ? "" : textOf(b);
        if (b.type === "heading" || (b.type === "paragraph" && wvRefListIsTitle(text))) {
            close();
            titled = wvRefListIsTitle(text);
            if (titled) cur = [];
            continue;
        }
        if (!titled || !cur) continue;
        if (b.type === "list" && Array.isArray(b.content)) {
            const items = b.content.filter((x: any) => x && typeof x === "object");
            // A continuation Zotero linked, unless it starts an entry itself
            // (1.2.1-refsacc.1: "ÇELIK, B. 2011 ..." tied to the "– 2000."
            // line before it, Antiquity 2023).
            const own = (it: any) => Array.isArray(it.previousPart) && !ayStart(textOf(it));
            const st = items.map((it: any) => !own(it) && ayStart(textOf(it)));
            const starts = st.filter(Boolean).length;
            const lastStart = st.lastIndexOf(true);
            const others = items.filter((it: any, i: number) => !st[i] && !own(it)).length;
            const trailing = items.slice(lastStart + 1).filter((it: any) => !own(it)).length;
            const scrambled = starts >= 3 && trailing >= 3 && trailing >= 0.7 * others;
            items.forEach((it: any, i: number) => {
                const dt = !own(it) && !st[i] ? ditto(textOf(it)) : null;
                if (own(it)) join(it, true);
                else if (st[i]) begin(it, false);
                else if (dt) begin(it, false, dt);
                else if (starts && !scrambled) join(it, false);
            });
            continue;
        }
        if (b.type === "paragraph") {
            const last = cur.length ? cur[cur.length - 1] : null;
            const dt = ditto(text);
            if (Array.isArray(b.previousPart) && last && !ayStart(text)) join(b, true);
            else if (ayStart(text)) begin(b, true);
            else if (dt) begin(b, true, dt);
            else if (last && last.para && text.length < 300 && !isProse(text)) join(b, false);
            else if (last) { close(); titled = false; }
            continue;
        }
        close();
        titled = false;
    }
    close();
    return done;
}

/** Does an unflagged block between two flagged entries read as a reference:
 *  a year, and a DOI, a volume and page ("885:A33", "32, 041705") or "et
 *  al."? (An annotation -- "The authors study the impact of ..." -- has
 *  neither.) Its text without the stray marks before the authors ("* .
 *  Zhang JM"), or null. */
function gapEntry(text: string): string | null {
    const t = clean(text).replace(/^[\s*.•·,;:]+/, "");
    if (t.length < 30 || t.length > 1500) return null;
    // A CJK name may start it too (1.2.1-citd.1).
    if (!/^[\p{Lu}\d[(]/u.test(t) && !CJK_START.test(t)) return null;
    if (!/(?<!\d)(1[6-9]\d\d|20\d\d)(?!\d)/.test(t)) return null;
    const doi = /\b10\.\d{4,9}\/\S+/.test(t);
    const vp = /(?<![\d.])\d{1,4}\s*(?:\([^()]{1,12}\))?\s*[,:]\s*(?:pp?\.\s*)?[A-Za-z]?\d{1,7}(?!\d)/.test(t);
    return doi || vp || ET_AL.test(t) ? t : null;
}

/** "et al." and its equivalents (1.2.1-citd.1): German "u. a.", Russian "и др.", French "et
 *  coll.", Spanish / Italian / Portuguese "y col.", "e col.", "y otros", "e altri", "e outros",
 *  Polish "i in.", Czech "a kol.", Chinese 等, Japanese ほか, Korean 외. */
const ET_AL = /\bet\s+al\b|\bu\.\s?a\.|(?<!\p{L})и\s+др\.|\bet\s+coll?\.|\b[ey]\s+cols?\.|\by\s+otros\b|\be\s+altri\b|\be\s+outros\b|\bi\s+in\.|\ba\s+kol\.|[,，、]\s*等|ほか|\s외[\s.,]/iu;

/** A CJK name at the start of an entry: one to six characters, a space within allowed, then a
 *  separator (comma, ideographic comma, middle dot, stop, an opening bracket, a space). */
const CJK_START = /^[\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}\p{Script=Hiragana}]{1,6}(?:\s[\p{Script=Han}\p{Script=Hangul}]{1,4})?\s*[,，、・.．(（\s]/u;

/** The blocks with text of their own (paragraphs, list items), in reading
 *  order, with their place. */
function leaves(s: any, order: Map<any, number>): Array<{ n: any; at: number }> {
    const out: Array<{ n: any; at: number }> = [];
    for (const [n, at] of order) {
        if (n.type !== "paragraph" && n.type !== "listitem") continue;
        const kids = Array.isArray(n.content) ? n.content : [];
        if (!kids.some((c: any) => c && typeof c.text === "string")) continue;
        out.push({ n, at });
    }
    return out.sort((a, b) => a.at - b.at);
}

/** The largest gap (in blocks) between two flagged entries that is looked into. */
const MAX_GAP = 12;

/** Zotero's flagged entries completed: a numbered list read here that runs
 *  through them adds the entries it holds that Zotero did not flag (the run
 *  must cover at least half of the flagged ones: then it is the same list),
 *  and an unflagged block between two flagged entries of the same or the
 *  next page that reads as a reference is one (see the head of this file). */
function completed(s: any, order: Map<any, number>, flagged: Ent[], cut: number): Ent[] {
    const covered = new Set<number>();
    const mark = (e: Ent) => { for (let k = e.at; k <= e.end; k++) covered.add(k); };
    for (const e of flagged) mark(e);
    let out = flagged.slice();
    // Numbered runs, and since 1.2.1-refs.8 author-year ones (Rev. Mod. Phys.
    // 1997: the first page of its list under REFERENCES not flagged, the rest
    // flagged).
    const all = detectIn(s, order).concat(authorYearIn(s, order, cut));
    // Run by run: one that holds flagged entries (at least 2, and 30 % of
    // its own) is this list; another one (a previous article's list on page 1
    // of an old Science or Nature PDF: the 2026-11-20 survey) is not added.
    const take = new Set<number>();
    const per = new Map<number, { n: number; inside: number }>();
    for (const e of all) {
        const p = per.get(e.run!) || { n: 0, inside: 0 };
        p.n++;
        if (covered.has(e.at)) p.inside++;
        per.set(e.run!, p);
    }
    for (const [id, p] of per) if (p.inside >= 2 && p.inside >= 0.3 * p.n) take.add(id);
    const run = all.filter((e) => take.has(e.run!));
    if (run.length) {
        for (const e of run) {
            // Not one Zotero has, nor one that took a flagged block as a
            // continuation (its text would hold that entry's too).
            let clash = false;
            for (let k = e.at; k <= e.end && !clash; k++) clash = covered.has(k);
            if (clash) continue;
            out.push(e);
            for (let k = e.at; k <= e.end; k++) covered.add(k);
        }
        out.sort((a, b) => a.at - b.at);
    }
    // Between two entries: unflagged blocks that read as references.
    const ls = leaves(s, order);
    const added: Ent[] = [];
    for (let k = 0; k + 1 < out.length; k++) {
        const a = out[k], b = out[k + 1];
        const pa = a.rects.length ? a.rects[0][0] : NaN, pb = b.rects.length ? b.rects[0][0] : NaN;
        if (!(Math.abs(pb - pa) <= 1)) continue;
        const gap = ls.filter((x) => x.at > a.end && x.at < b.at && !covered.has(x.at));
        if (!gap.length || gap.length > MAX_GAP) continue;
        for (const x of gap) {
            if (x.n.reference || transparent(x.n)) continue;
            const t = gapEntry(textOf(x.n));
            if (t) added.push({ text: t, rects: rectsOf(x.n), at: x.at, end: x.at, blocks: [x.n] });
        }
    }
    if (added.length) out = out.concat(added).sort((a, b) => a.at - b.at);
    return out;
}

/** The inline text runs of a block, in reading order. */
function runsOf(n: any, out: any[] = []): any[] {
    if (!n || typeof n !== "object") return out;
    if (typeof n.text === "string") { out.push(n); return out; }
    if (Array.isArray(n.content)) for (const c of n.content) runsOf(c, out);
    return out;
}

function nonSpace(s: string): number {
    return String(s || "").replace(/\s+/gu, "").length;
}

/** The boxes, [page, x1, y1, x2, y2], of the text of `blocks` from its
 *  non-space character `k` on: the line that character sits on, from it,
 *  then every line after it. Read from each inline run's text map
 *  (`anchor.textMap`, Zotero's structured-document-text: a JSON list of lines
 *  [header, page, x1, y1, x2, y2, c, c, ...], each c a character's width or
 *  [gap before it, width], one per non-space character of the run's text, as
 *  far as the map is exact -- ligatures and marks make it approximate: the
 *  first box's x then errs by a character or two). Null without a map. */
function boxesFrom(blocks: any[], k: number): number[][] | null {
    const out: number[][] = [];
    const seen = new Set<string>();
    const put = (L: any[], x: number) => {
        const key = num(L[1]) + ":" + Math.round(num(L[3])) + ":" + Math.round(num(L[5]));
        if (seen.has(key)) return;
        seen.add(key);
        out.push([num(L[1]), x, num(L[3]), num(L[4]), num(L[5])]);
    };
    let acc = 0;
    let started = false;
    for (const b of blocks) {
        for (const r of runsOf(b)) {
            let lines: any = [];
            try { const tm = r.anchor && r.anchor.textMap; lines = typeof tm === "string" ? JSON.parse(tm) : []; } catch (e) { lines = []; }
            if (!Array.isArray(lines)) lines = [];
            lines = lines.filter((L: any) => Array.isArray(L) && L.length >= 6);
            if (started) { for (const L of lines) put(L, num(L[2])); continue; }
            const n = nonSpace(r.text);
            if (k >= acc + n) { acc += n; continue; }
            if (!lines.length) return null;
            let local = k - acc;
            let li = 0;
            for (; li < lines.length - 1; li++) {
                const c = lines[li].length - 6;
                if (local < c) break;
                local -= c;
            }
            const L = lines[li];
            let x = num(L[2]);
            for (let j = 0; j < local && 6 + j < L.length; j++) { const c = L[6 + j]; x += Array.isArray(c) ? num(c[0]) + num(c[1]) : num(c); }
            const c0 = L[6 + local];
            if (Array.isArray(c0)) x += num(c0[0]);
            if (!Number.isFinite(x) || x < num(L[2]) || x > num(L[4])) x = num(L[2]);
            put(L, x);
            for (let j = li + 1; j < lines.length; j++) put(lines[j], num(lines[j][2]));
            started = true;
        }
    }
    return out.length ? out : null;
}

/** `e` cut at character `p` of its text: the first part keeps the entry's
 *  boxes (its mark stays where it was), the second gets its own from the
 *  text maps (its mark goes beside it), or the entry's when there is none. */
function cutAt(e: Ent, p: number, from: number): [Ent, Ent] {
    const head = e.text.slice(0, p).trim(), tail = e.text.slice(p).trim();
    const boxes = e.blocks ? boxesFrom(e.blocks, from + nonSpace(e.text.slice(0, p))) : null;
    return [Object.assign({}, e, { text: head }), { text: tail, rects: boxes || e.rects, at: e.at, end: e.end }];
}

const YEAR_RX = /(?<!\d)(1[6-9]\d\d|20\d\d)(?!\d)/;

/** The numbers a numbered list misses, looked for (1.2.1-refs.8, the
 *  2026-11-20 survey's F2). `es` in reading order; its numbering the kind
 *  most of its entries (60 %) start with.
 *  - A number merged into the entry before it ("[2] ... 445-76 [3] Ronald
 *    Young F 2004 Sonoluminescence", New J. Phys. 2024; "(39) ... (40) ...
 *    (41) ...", ACS) is an entry of its own: the entry is cut there, when
 *    that number is missing from the list and what follows has a year.
 *    Brackets and parentheses only: "12." inside a text is too often a page.
 *  - A missing number found in a block no entry holds is one: between the
 *    entries numbered below and above it, or after the last one (an ACS
 *    letter prints its notes at the foot of the pages: (17) on page 3,
 *    (18) and (19) on page 4), never past a list that starts again at 1.
 *    Within MAX_GAP blocks of its neighbour a year is enough; farther, it
 *    must read as a reference (gapEntry: a year, and a DOI, a volume and
 *    page or "et al."). Page furniture (`excluded`) only between its two
 *    neighbours (Phys. Fluids 2013: Zotero took entry 54 for a running
 *    head). Before the first entry only near it: a "1." far above is more
 *    likely another list's. */
function filled(s: any, order: Map<any, number>, es: Ent[], cut: number): Ent[] {
    // Since 1.2.1-citd.1 the cut of merged numbers (step 1) for a list of any length: the r5 set's
    // 1962 J-STAGE scan, whose entries "1)" to "9)" Zotero read as ONE list item, so that the
    // reader's run held one entry; the search for missing numbers (step 2) wants three entries.
    if (!es.length) return es;
    const labs = es.map((e) => wvRefListLabel(e.text));
    const count = new Map<string, number>();
    for (const l of labs) if (l) count.set(l.kind, (count.get(l.kind) || 0) + 1);
    let kind = "", most = 0;
    for (const [k, c] of count) if (c > most) { kind = k; most = c; }
    if (!kind || most / es.length < 0.6) return es;
    const have = new Set<number>();
    labs.forEach((l) => { if (l && l.kind === kind) have.add(l.n); });
    // 1. Numbers merged into the entry before them (again below, for the entries step 2 adds).
    const unmerge = (list: Ent[]): Ent[] => {
        const res: Ent[] = [];
        for (const e of list) {
            const l = wvRefListLabel(e.text);
            if (!l || l.kind !== kind || (kind !== "bracket" && kind !== "paren")) { res.push(e); continue; }
            let cur = e, n = l.n, from = 0;
            // Since 1.2.1-citd.1 also "m)" after an entry labelled so, a CJK name after the number
            // ("... (1962)参照 2) 片井: 農化, 19, 837 (1943) 3) 伊藤, ..."), up to 30 numbers.
            const endOnly = /^\d/.test(l.label);
            const after = "(?=\\s*[\\p{Lu}\\p{Script=Han}\\p{Script=Hangul}\\p{Script=Katakana}\\p{Script=Hiragana}])";
            for (let g = 0; g < 30 && !have.has(n + 1); g++) {
                const m = n + 1;
                const rx = kind === "bracket" ? new RegExp("\\s\\[\\s*" + m + "\\s*\\]" + after, "u")
                    : endOnly ? new RegExp("\\s" + m + "\\)" + after, "u") : new RegExp("\\s\\(\\s*" + m + "\\s*\\)" + after, "u");
                const hit = rx.exec(cur.text);
                if (!hit || hit.index < 20 || !YEAR_RX.test(cur.text.slice(hit.index))) break;
                const [a, b] = cutAt(cur, hit.index + 1, from);
                from += nonSpace(cur.text.slice(0, hit.index + 1));
                res.push(a);
                cur = Object.assign(b, { blocks: e.blocks });
                have.add(m);
                n = m;
            }
            res.push(cur);
        }
        return res;
    };
    let out = unmerge(es);
    // 2. Missing numbers in blocks no entry holds.
    if (out.length < 3) return out;
    const covered = new Set<number>();
    for (const e of out) for (let k = e.at; k <= e.end; k++) covered.add(k);
    const ls = leaves(s, order).filter((x) => x.at > cut && !covered.has(x.at));
    const labOf = (t: string) => {
        const l = wvRefListLabel(t);
        if (l || kind !== "glued") return l;
        const g = t.match(/^\s*(\d{1,3})(?=\p{Ll})/u);
        return g ? { n: Number(g[1]), kind: "glued" as const, label: g[1], rest: t.slice(g[0].length) } : null;
    };
    const numbered = () => out.map((e) => ({ e, l: wvRefListLabel(e.text) })).filter((x) => x.l && x.l.kind === kind) as Array<{ e: Ent; l: WvRefLabel }>;
    const top = Math.max(...[...have]);
    // Not a sequence with a few holes (years read as numbers, a list per chapter): nothing to fill.
    if (top - have.size > Math.max(10, have.size)) return out;
    const added: Ent[] = [];
    const taken = new Set<number>();
    // Past the last number: on while they are found, up to MAX_JUMP misses in a row.
    for (let m = 1, misses = 0; m <= top + MAX_ENTRIES && out.length + added.length < MAX_ENTRIES; m++) {
        if (m > top && misses > MAX_JUMP) break;
        if (have.has(m)) continue;
        const nb = numbered().concat(added.map((e) => ({ e, l: wvRefListLabel(e.text)! })));
        const below = nb.filter((x) => x.l.n < m), above = nb.filter((x) => x.l.n > m);
        const lo = below.length ? Math.max(...below.map((x) => x.e.end)) : -1;
        const hi = above.length ? Math.min(...above.map((x) => x.e.at)) : Infinity;
        if (lo < 0 && hi === Infinity) break;
        // A list starting again at 1 after the last entry ends the search.
        const restart = hi === Infinity ? ls.find((x) => x.at > lo && (() => { const l = labOf(textOf(x.n)); return l && l.kind === kind && l.n === 1; })()) : null;
        const end = hi === Infinity ? (restart ? restart.at : Infinity) : hi;
        let found: Ent | null = null;
        for (let j = 0; j < ls.length && !found; j++) {
            const x = ls[j];
            if (x.at <= lo || x.at >= end || taken.has(x.at)) continue;
            const t0 = textOf(x.n);
            const l = labOf(t0);
            if (!l || l.kind !== kind || l.n !== m) continue;
            if (x.n.flowClass === "excluded" && (lo < 0 || hi === Infinity)) continue;
            // Lines of a list item split off it: the next items without a number.
            let text = t0;
            const blocks = [x.n];
            let last = x.at;
            if (x.n.type === "listitem") {
                for (let q = j + 1; q < ls.length && blocks.length <= MAX_CONT; q++) {
                    const y = ls[q];
                    if (y.n.type !== "listitem" || y.at >= end || transparent(y.n) || labOf(textOf(y.n))) break;
                    text += " " + textOf(y.n);
                    blocks.push(y.n);
                    last = y.at;
                }
            }
            const between = (a: number, b: number) => ls.filter((y) => y.at > a && y.at < b && !transparent(y.n)).length;
            const near = (lo >= 0 && between(lo, x.at) <= MAX_GAP) || (hi < Infinity && between(last, hi) <= MAX_GAP);
            if (lo < 0 && !near) continue;
            if (!(near ? YEAR_RX.test(text) : gapEntry(text))) continue;
            found = { text: clean(text), rects: blocks.flatMap((b) => rectsOf(b)), at: x.at, end: last, blocks };
        }
        if (found) {
            added.push(found);
            for (const b of found.blocks!) { const k = order.get(b); if (k !== undefined) taken.add(k); }
            misses = 0;
        }
        else if (m > top) misses++;
    }
    if (added.length) out = out.concat(unmerge(added)).sort((a, b) => a.at - b.at);
    return out;
}

/** A volume and page: "66, 2838", "885:A33", "18(4):467". */
const VP_RX = /(?<![\d.])\d{1,4}\s*(?:\([^()]{1,12}\))?\s*[,:]\s*(?:pp?\.\s*)?[A-Za-z]?\d{1,7}(?!\d)/;

/** Where a work's authors start after "; ": initials then a surname ("A. C.
 *  Robinson", "J.-M. Fromental"; not "J. Phys. Conf. Ser.", a journal: no
 *  period after a surname) -- not a surname then initials: ACS writes
 *  "Flannigan, D. J.; Suslick, K. S." for the authors of one work. ACS's own
 *  form, "(3) (a) ... (b) ...", is cut at its letters. */
const NEXT_WORK = /;\s+(?=\p{Lu}\.(?:\s*-?\s*\p{Lu}\.)*\s*\p{Lu}[\p{Ll}'’-]+(?![\p{Ll}.]))|\s(?=\([b-h]\)\s+\p{Lu})/gu;

/** Entries that list several works under one number (1.2.1-refs.8, the
 *  2026-11-20 survey's F8; Phys. Rev. styles above all): "[9] J. W. Swegle
 *  ..., J. Appl. Phys. 66, 2838 (1989); A. C. Robinson ..., ibid. 66, 2859
 *  (1989)" is two entries, each with the number, so that each work can be
 *  marked -- cut at "; " before a work's authors when both sides have a year
 *  and a volume and page. The second part's box starts where it does on the
 *  page (boxesFrom), so its mark goes beside it. Not "Phys. Fluids 22, 224;
 *  23, 421" (no authors after the semicolon: one author's two papers stay one
 *  entry). */
function compounds(es: Ent[]): Ent[] {
    const out: Ent[] = [];
    for (const e of es) {
        if (!e.label || (e.text.indexOf(";") < 0 && e.text.indexOf("(b)") < 0)) { out.push(e); continue; }
        const body = e.text.slice(e.label.length + 1);
        const cuts: number[] = [];
        NEXT_WORK.lastIndex = 0;
        const lettered = /^\s*\(a\)\s/.test(body);
        for (const m of body.matchAll(NEXT_WORK)) if (m[0].startsWith(";") || lettered) cuts.push(m.index! + m[0].length);
        if (!cuts.length) { out.push(e); continue; }
        const parts: string[] = [];
        let from = 0;
        for (const c of cuts) {
            const p = body.slice(from, c);
            if (YEAR_RX.test(p) && VP_RX.test(p)) { parts.push(p); from = c; }
        }
        const last = body.slice(from);
        if (!parts.length || !(YEAR_RX.test(last) && VP_RX.test(last))) { out.push(e); continue; }
        parts.push(last);
        let off = e.label.length + 1;
        parts.forEach((p, i) => {
            const text = e.label + " " + p.replace(/[;\s]+$/, "");
            if (i === 0) out.push(Object.assign({}, e, { text }));
            else {
                const boxes = e.blocks ? boxesFrom(e.blocks, nonSpace(e.text.slice(0, off))) : null;
                out.push({ text, rects: boxes || e.rects, at: e.at, end: e.end, label: e.label });
            }
            off += p.length;
        });
    }
    return out;
}

/** Labels kept apart and written once with a space after them, when the
 *  list is numbered: most of its entries (60 %) start with a number of one
 *  kind, rising. A bare or glued number must follow the one before it. */
function labelled(es: Ent[]): Ent[] {
    if (!es.length) return es;
    const labs = es.map((e) => wvRefListLabel(e.text));
    const count = new Map<string, number>();
    for (const l of labs) if (l) count.set(l.kind, (count.get(l.kind) || 0) + 1);
    let kind = "", most = 0;
    for (const [k, c] of count) if (c > most) { kind = k; most = c; }
    if (!kind || most / es.length < 0.6) return es;
    const strict = kind === "bare" || kind === "glued";
    let last = 0;
    let author = "";
    return es.map((e, i) => {
        let l = labs[i];
        // The next glued number before a lower-case word ("28online ...").
        const g = !l && kind === "glued" ? e.text.match(/^\s*(\d{1,3})(?=\p{Ll})/u) : null;
        if (g && Number(g[1]) === last + 1) l = { n: last + 1, kind: "glued", label: g[1], rest: e.text.slice(g[0].length) };
        if (!l || l.kind !== kind || l.n <= last || (strict && l.n > last + MAX_JUMP) || !l.rest) return e;
        last = l.n;
        // The same authors as the entry before, a rule ("27. ———, Theory of
        // function spaces") or nothing at all where the text lost the rule
        // ("2. , Differentiation in lacunary directions ...", an AMS preprint
        // of 1995): the entry before's first author written in (1.2.1-
        // refsacc.1), so that the matcher sees who wrote it.
        let rest = l.rest;
        const d = rest.match(DITTO_RX);
        if (d && author) rest = author + ", " + rest.slice(d[0].length);
        else { const a = rest.match(/^([^,]{2,60}?),\s/); author = a ? a[1] : ""; }
        return Object.assign({}, e, { label: l.label, text: l.label + " " + rest });
    });
}

/** The rule a list prints for "the same authors" (a dash or several, or
 *  nothing left of it but its comma), then a comma. */
const DITTO_RX = /^(?:[—–_-]{1,6}\.?\s*)?,\s*/;

/** What wvRefList may know of the citing paper. */
export interface WvRefListOpts {
    /** Its title: a list printed before it, on the PDF's first pages, is
     *  another article's (1.2.1-refs.8). */
    title?: string;
}

function compactOf(s: any): string {
    return fold(s).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Where the citing paper's own title is printed: the first heading or
 *  paragraph of the first two pages that holds its first 24 letters and
 *  digits and little else (a rule of dots before it, as old Nature letters
 *  print one); -1 when none does (a title too short to look for, or written
 *  otherwise in the PDF). */
function titleAt(order: Map<any, number>, title: any): number {
    const ct = compactOf(title);
    if (ct.length < 12) return -1;
    const key = ct.slice(0, 24);
    let page = 0;
    for (const [n, at] of [...order].sort((a, b) => a[1] - b[1])) {
        const r = rectsOf(n);
        if (r.length && Number.isFinite(r[0][0])) page = r[0][0];
        if (page > 1) break;
        if ((n.type !== "heading" && n.type !== "paragraph") || n.flowClass === "excluded") continue;
        const c = compactOf(textOf(n));
        if (c.length <= ct.length + 120 && c.indexOf(key) >= 0) return at;
    }
    return -1;
}

/** A paper's reference list: Zotero's flagged entries (completed, front
 *  matter out), else a numbered list read here, else none.
 *
 *  Since 1.2.1-refs.8 (the 2026-11-20 survey's F5), with `opts.title`: an
 *  old Nature letter's PDF starts with the end of the letter printed before
 *  it, its reference list included, and Zotero flags that list as the
 *  paper's own (Aussillous & Quéré 2001: 32 entries, none of its 14; a 2014
 *  Science report, 37 of 71). Entries that come before the paper's title on
 *  its first two pages are not its references -- flagged or read here. The
 *  paper's own list may start on page 1 too (an ACS letter prints its notes
 *  at the foot of each page, under the title): only what precedes the title
 *  goes. Not "the longest list wins": in a Science PDF the run Weavero reads
 *  can be longer than Zotero's precisely because it holds the other article's
 *  list. */
export function wvRefList(s: any, opts?: WvRefListOpts): { entries: WvRefEntry[]; how: WvRefListHow } {
    const order = orderOf(s);
    const cut = opts && opts.title ? titleAt(order, opts.title) : -1;
    let flagged = flaggedIn(s, order);
    if (cut > 0) flagged = flagged.filter((e) => e.at > cut);
    // Flagged blocks before the first references heading are not in a list
    // (front matter, body paragraphs full of "(Name YEAR)"). The first one: a
    // book or a thesis has a list per chapter, each under its own heading.
    if (flagged.length) {
        const mid = flagged[Math.floor(flagged.length / 2)].at;
        let head = -1;
        for (const [n, at] of order) {
            if (at > cut && at < mid && (head < 0 || at < head) && (n.type === "heading" || n.type === "paragraph") && wvRefListIsTitle(textOf(n))) head = at;
        }
        if (head >= 0) flagged = flagged.filter((e) => e.at > head);
    }
    if (flagged.length) {
        const es = compounds(labelled(filled(s, order, completed(s, order, flagged, cut), cut)));
        return { entries: strip(withFootnotes(s, order, es, cut, String((opts && opts.title) || ""))), how: "flagged" };
    }
    let read = detectIn(s, order).filter((e) => e.at > cut);
    // No numbered list: an author-year one under a references heading (old JFM scans);
    // nor one of one or two entries in front of a longer author-year list (1.2.1-refsacc.1).
    if (read.length < 3) {
        const ay = authorYearIn(s, order, cut);
        if (ay.length > read.length) read = ay;
    }
    let found = withFootnotes(s, order, compounds(labelled(filled(s, order, read, cut))), cut, String((opts && opts.title) || ""));
    // Nothing at all: an old scan's short list at the document's end (1.2.1-citd.1, tailIn).
    if (!found.length) found = labelled(tailIn(s, order, cut));
    return { entries: strip(found), how: found.length ? "detected" : "none" };
}

/** A short list at the end, read from this many entries on ... */
const TAIL_MIN = 4;
/** ... its first number at most this (the ones before it lost) ... */
const TAIL_FIRST = 3;
/** ... and at most this much text after it (a summary in another language), in characters and as
 *  a share of the document's text ... */
const TAIL_AFTER = 4000;
const TAIL_AFTER_SHARE = 0.25;
/** ... and a document before it: this much text at least. */
const TAIL_BEFORE = 1500;

/** A year, as an old scan's OCR may spell it too ("I879": ref-match.ts ocrYearsRead). */
function hasYear(text: string): boolean {
    return YEAR_RX.test(text) || YEAR_RX.test(ocrYearsRead(text));
}

/** An old scan's short numbered list at the document's end, when nothing else is read
 *  (1.2.1-citd.1). MJT's 1966 Chemical Engineering Science scan, as Zotero 11's structure has it:
 *  nothing flagged, no "REFERENCES" heading and no entry [1] in the publisher's OCR text layer,
 *  "[2] MARQUENIEL., Znstrum. Pratt. 1962 16 45." typed as a heading, [3]-[6] a list of four (under
 *  MIN_BARE), the French and German summaries after it. Read backwards from the document's last
 *  bracketed or parenthesised label: the numbers before it one by one (an OCR'd label read as the
 *  number due: "[S]" for 5), whatever the block's type -- a heading too; a list item without a
 *  number between two entries is a line of the one before. Kept only with TAIL_MIN entries, the
 *  first at most TAIL_FIRST and printed (an OCR'd label only between two printed ones), every one
 *  with a year (one without allowed when it names a report, a thesis or a publisher), a document
 *  before the first (TAIL_BEFORE) and little text after the last (TAIL_AFTER). A paper's body with
 *  a few bracketed items in it has its text going on after them. The real scan (refsfix,
 *  2026-11-24) also lost [2]'s label: a heading right before the first printed number that reads as
 *  a reference joins as the number before it (lostEntry). */
function tailIn(s: any, order: Map<any, number>, cut: number): Ent[] {
    const bs: Array<{ n: any; at: number; t: string }> = [];
    for (const [n, at] of order) {
        if (at <= cut || transparent(n) || (n.type !== "heading" && n.type !== "paragraph" && n.type !== "listitem")) continue;
        const kids = Array.isArray(n.content) ? n.content : [];
        if (!kids.some((c: any) => c && typeof c.text === "string")) continue;
        bs.push({ n, at, t: clean(textOf(n)) });
    }
    bs.sort((a, b) => a.at - b.at);
    const numbered = (t: string) => { const l = wvRefListLabel(t); return l && (l.kind === "bracket" || l.kind === "paren") ? l : null; };
    let j = bs.length - 1;
    while (j >= 0 && !numbered(bs[j].t)) j--;
    if (j < 0) return [];
    const last = numbered(bs[j].t)!;
    // The last entry's own lines (list items without a number), then the text after the list.
    let end = j;
    while (end + 1 < bs.length && end - j < MAX_CONT && bs[end + 1].n.type === "listitem" && !wvRefListLabel(bs[end + 1].t)) end++;
    let total = 0, after = 0;
    for (let k = 0; k < bs.length; k++) { total += bs[k].t.length; if (k > end) after += bs[k].t.length; }
    if (after > TAIL_AFTER || after > TAIL_AFTER_SHARE * total) return [];
    // Backwards: the numbers before it, one by one.
    const heads: Array<{ k: number; l: WvRefLabel; ocr?: boolean }> = [{ k: j, l: last }];
    let k = j - 1, cont = 0;
    while (k >= 0 && heads[0].l.n > 1) {
        const want = heads[0].l.n - 1;
        const own = numbered(bs[k].t);
        const l = own ? (own.n === want && own.kind === last.kind ? own : null) : ocrLabel(bs[k].t, (x) => x === want);
        if (l && l.kind === last.kind) { heads.unshift({ k, l, ocr: !own }); cont = 0; k--; continue; }
        if (!own && bs[k].n.type === "listitem" && cont < MAX_CONT) { cont++; k--; continue; }
        break;
    }
    // An OCR'd label only between two printed ones: the run starts at a printed number.
    while (heads.length && heads[0].ocr) heads.shift();
    if (heads.length < TAIL_MIN || heads[0].l.n > TAIL_FIRST) return [];
    // The entry before the first printed number, its label lost, typed as a heading (refsfix,
    // 2026-11-24): MJT's real 1966 scan reads "MARQUENIEL., Znstrum. Pratt. 1962 16 45." for "[2] DE
    // JONG J., MARQUENIE L., ...", a heading right before "[3] ...". It joins the list as the number
    // before, when it reads as a reference (lostEntry); never a paragraph, never further up.
    const h0 = heads[0].k - 1;
    if (h0 >= 0 && heads[0].l.n > 1 && bs[h0].n.type === "heading" && lostEntry(bs[h0].t)) {
        const n = heads[0].l.n - 1;
        const bracket = last.kind === "bracket";
        heads.unshift({ k: h0, l: { n, kind: last.kind, label: bracket ? "[" + n + "]" : "(" + n + ")", rest: bs[h0].t } });
    }
    let before = 0;
    for (let q = 0; q < heads[0].k; q++) before += bs[q].t.length;
    if (before < TAIL_BEFORE) return [];
    const out: Ent[] = [];
    for (let h = 0; h < heads.length; h++) {
        const from = heads[h].k, to = h + 1 < heads.length ? heads[h + 1].k - 1 : end;
        const l = heads[h].l;
        let text = l.label + " " + l.rest;
        const blocks = [bs[from].n];
        for (let q = from + 1; q <= to; q++) { text += " " + bs[q].t; blocks.push(bs[q].n); }
        out.push({ text: clean(text), rects: blocks.flatMap((b) => rectsOf(b)), at: bs[from].at, end: bs[to].at, blocks });
    }
    // Every entry dated -- but one may go without when it reads as a reference all the same (refsfix,
    // 2026-11-24): the real 1966 scan's "[4] SA~IC P. and G. J. BOULT,The fluid flow associated with
    // ..., Nat. Res. Lab. Canada, rep. MT-26." prints no year. A paper's body is not let through so:
    // the other entries are dated, and the undated one names a report, a thesis or a publisher.
    const undated = out.filter((e) => !hasYear(e.text));
    return undated.length === 0 || (undated.length === 1 && UNDATED_REF.test(undated[0].text)) ? out : [];
}

/** What an entry printed without a year names (tailIn): a report and its number ("rep. MT-26",
 *  "Report No. 1234", "Tech. Note 12"), a thesis, a publisher ("Univ. Press", "Verlag"). */
const UNDATED_REF = /\brep(?:ort)?s?\.?\s*(?:no\.?\s*)?[A-Z]{0,6}[-\s]?\d{1,6}\b|\btech(?:nical)?\.?\s+(?:rep(?:ort)?|note|memo(?:randum)?)\b|\b(?:thesis|dissertation|proefschrift|doctoral)\b|\bph\.?\s?d\b|\b(?:press|verlag|publishers?|publishing)\b/i;

/** A heading that is a reference whose label OCR lost (tailIn): short, a capitalised name first, an
 *  abbreviated word ("Znstrum.", "Pratt."), a year and a volume and page ("1962 16 45") -- not a
 *  references title, no label of its own. "MARQUENIEL., Znstrum. Pratt. 1962 16 45." */
function lostEntry(t: string): boolean {
    if (t.length < 15 || t.length > 300 || wvRefListIsTitle(t) || wvRefListLabel(t)) return false;
    if (!/^\p{Lu}[\p{L}'’-]+/u.test(t) || !/\s\p{Lu}\p{Ll}{1,10}\.(?=[\s,])/u.test(t)) return false;
    return hasYear(t) && wvRefVolPages(ocrYearsRead(t)).length > 0;
}

/** A paper with fewer entries than this, and no references heading, is
 *  looked through for references in its footnotes. */
const FOOTNOTE_LIST_MAX = 10;
/** ... when it has at least this many. */
const FOOTNOTE_MIN = 3;

/** References printed as footnotes (1.2.1-refsacc.1; the r4 old papers:
 *  8 of 16 documents, government reports and theses of 1919-1935, cite in
 *  footnotes alone, and Zotero flags none or a few of them). Looked for only
 *  in a document with no references heading and fewer than
 *  FOOTNOTE_LIST_MAX entries read otherwise, so a paper with a list never
 *  gets its footnotes. A footnote is a paragraph or list item at the foot of
 *  its page (only footnotes, page furniture, figures after it on that page)
 *  that starts with its mark -- "4 Maxwell, ...", "12. Sutherland, ...",
 *  "3) ...", "* L. Ubbelohde, ...", "» I. M. Rapp, ..." -- and reads as a
 *  reference: a year, or a volume and page ("Vol. 8, p 738", "68, p. 12"),
 *  and a name; not front matter, not prose, not a bare "loc. cit." /
 *  "op. cit." / "ibid." pointer. FOOTNOTE_MIN of them at least. Added to the
 *  entries in reading order, each block once. */
function withFootnotes(s: any, order: Map<any, number>, es: Ent[], cut: number, title: string): Ent[] {
    if (es.length >= FOOTNOTE_LIST_MAX) return es;
    for (const [n] of order) if ((n.type === "heading" || n.type === "paragraph") && wvRefListIsTitle(textOf(n))) return es;
    const notes = footnotesIn(s, order, cut, title);
    if (notes.length < FOOTNOTE_MIN) return es;
    const covered = new Set<number>();
    for (const e of es) for (let k = e.at; k <= e.end; k++) covered.add(k);
    const add = notes.filter((e) => !covered.has(e.at));
    return add.length ? es.concat(add).sort((a, b) => a.at - b.at) : es;
}

/** A footnote's mark, then a capital (or OCR's 0 for O: "2. 0. E. Meyer"). */
const FOOTNOTE_MARK = /^\s*(?:\d{1,3}(?:\s*[.)])?|\(\d{1,2}\)|[*†‡§¶»])\s*(?=["“'‘(]?(?:\p{Lu}|0\.))/u;
const BACK_POINTER = /\b(?:loc\.\s*cit|op\.\s*cit|ibid|idem|l\.\s*c\.)\b/i;
/** "l. c." before a space or a mark, which BACK_POINTER's `\b` after the full stop never matched
 *  ("* Stokes, l.c. ante p. 123.", Lamb), and OCR's "L c." (Ann. IHP 1930, "(9) Voir L c. 7) b)
 *  p. 56-66.") -- since 2026-11-27, case-sensitive: never the initials "L. C." of an author ("L.
 *  C. Woods, Proc. Roy. Soc. A 229, 152 (1955)."). */
const LC_POINTER = /(?<![\p{L}.])(?:l\.\s?c|L\sc)\.(?!\p{L}|\s*\p{Lu}\.)/u;

/** A superscript note number an old scan's OCR read as one or two other characters (2026-11-27,
 *  Franz 1959, J. Acoust. Soc. Am. 31, 1080, MJT's scan): "t A.M. Worthington", "• E.G.
 *  Richardson", "aA. May", "sA. Mallock", ",oM. Minnaert", "n j. H. McMillen", "•4E.G. Richardson",
 *  "aaH. H. Skilling". A symbol or two, a symbol and a lower-case letter, one lower-case letter or
 *  one doubled -- never two different letters, so never a word ("of A. B. Smith", "cf. A. Smith"). */
const OCR_JUNK = "(?:[^\\s\\p{L}]{1,2}|[^\\s\\p{L}]\\p{Ll}|\\p{Ll}[^\\s\\p{L}]?|(?<jj>\\p{Ll})\\k<jj>)";
/** An author's initials and surname, as such a note starts: "A.M. Worthington", "E. N. Harvey",
 *  OCR's "j. H. McMillen" for J. H. */
const INITIALS_NAME = "(?:\\p{Lu}|j)\\.\\s?(?:-?\\s?\\p{Lu}\\.\\s?){0,3}\\p{Lu}\\p{Ll}[\\p{L}'’-]+";
/** OCR's mark at a note's start, the initials and surname after it. */
const OCR_MARK = new RegExp("^\\s*" + OCR_JUNK + "\\s?(?=" + INITIALS_NAME + ")", "u");
/** A block that starts like an OCR'd note, a symbol among its characters, then a capital ("•
 *  Folsom, Howe, and O'Brien, ..."): below a note in its column, it does not end the foot. */
const OCR_NOTE_START = /^\s*(?:[^\s\p{L}]{1,2}|[^\s\p{L}]\p{Ll}|\p{Ll}[^\s\p{L}])\s?(?=["“'‘(]?\p{Lu})/u;
/** A download stamp at a page's foot -- "18 Feb 2011 to 109.171.129.59. Redistribution subject to
 *  ASA license or copyright; see http://..." -- a date and a year, never a note; nor an ACS first
 *  page's "10.1021/la701878n CCC: $37.00 © 2007 American Chemical Society" (FOOTNOTE_MARK reads
 *  its "1" and "0."). */
const STAMP = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.]*\d)|\bredistribution subject to\b|\bcontent downloaded from\b|^\s*(?:doi:?\s*)?10\.\d{4,9}\/|©|\bCCC:/i;
/** A second note in the same block, after the first one's last full stop: its mark (a number or
 *  OCR's characters, group 1), the initials and surname after it -- "... (1948). aA. May et al.,
 *  J. Appl. Phys. 19, 1109 (1948)." */
const NEXT_NOTE = new RegExp("[.)]\\s+(\\d{1,3}|" + OCR_JUNK + ")\\s?(?=" + INITIALS_NAME + ")", "gu");
/** A dateline -- "(ReceivedMarch 4, 1959)" -- that, under another article's title, starts the
 *  next paper of the issue on this one's last page. */
const RECEIVED = /\(\s*Received\s*(?:\p{L}+\.?\s*)?\d/iu;
/** A section's heading, not an article's title: numbered ("IV. SUMMARY", "2. Flow", "(a)
 *  Apparatus") or a part's name ("Acknowledgements", "Appendix", "References"). */
const SECTION_HEAD = /^\s*(?:\(?(?:\d{1,2}|[ivxlc]{1,5}|[a-h])[.)]\s|(?:acknowledge?ments?|appendi(?:x|ces)|summary|conclusions?|discussion|introduction|notes?)\b)/iu;

/** Does a footnote's text, its mark off, read as a reference: a year or a volume and page? */
function citesWork(body: string): boolean {
    return YEAR_RX.test(body) || VP_RX.test(body) || /\b(?:vol\.?\s*[\dIVXLC]|pp?\.?\s*\d)/i.test(body);
}

/** The x extent of a block's boxes on page `p`. */
function xSpan(n: any, p: number): [number, number] {
    let a = Infinity, b = -Infinity;
    for (const r of rectsOf(n)) if (r[0] === p) { a = Math.min(a, r[1]); b = Math.max(b, r[3]); }
    return [a, b];
}

/** Footnotes, each in its block (see withFootnotes). After the paper's own title (`cut`, from
 *  wvRefList's opts.title) an old two-column scan's notes are read as well (2026-11-27, Franz 1959:
 *  0 of its references read; 16 notes on its first page, OCR made most marks letters or bullets,
 *  Zotero's structure data has them as list items at the foot of each column; Guard:
 *  test/refs-match.spec.js "Franz 1959"):
 *  - a mark OCR misread (OCR_MARK), when the author's initials and surname follow it -- the mark
 *    left out of the entry's text, so that the matcher sees the author first;
 *  - at the foot of its COLUMN: a block after it in reading order that sits beside it (no
 *    horizontal overlap: the next column) does not end it, nor another note of its list (an item
 *    whose year OCR lost: "x•Helndsmann, ... Am. 378 0955).");
 *  - two notes the layout merged into one block are two entries (NEXT_NOTE, both read as
 *    references), the second with its own box when the text map has it;
 *  - the paper's first page (the last of the PDF's first two that prints the title: a cover
 *    sheet may print it first) may hold more than FOOTNOTES_PER_PAGE (16 there): a list printed
 *    before the title is another article's and is not looked at;
 *  - not past the next article's front matter on a later page (a "(Received ...)" line under a
 *    heading that is neither this paper's title nor a section's): the PDF's last page starts
 *    the next paper of the issue, whose own notes are not this one's.
 *  Without the title nothing of this applies: the notes as before. Review fixes (franz.2, the
 *  2026-11-27 review): the cover sheet, the paper's own dateline, "L. C." initials (LC_POINTER),
 *  the cap in blocks that never loses what the first rule reads, stamps as furniture. */
function footnotesIn(s: any, order: Map<any, number>, cut: number, title: string): Ent[] {
    const own = cut >= 0;
    const pageOf = (n: any) => { const r = rectsOf(n); return r.length ? r[0][0] : NaN; };
    let titlePage = NaN, stop = Infinity;
    const parent = new Map<any, any>();
    if (own) {
        // The paper's first page: the last of the first two that prints its title -- after a
        // cover sheet (ResearchGate, JSTOR, Taylor & Francis) that prints it too (franz.2).
        const ct = compactOf(title), key = ct.slice(0, 24);
        const isTitle = (n: any) => { const c = compactOf(textOf(n)); return ct.length >= 12 && c.length <= ct.length + 120 && c.indexOf(key) >= 0; };
        const blocks = [...order].sort((a, b) => a[1] - b[1]);
        for (const [n, at] of blocks) {
            if (at === cut) titlePage = pageOf(n);
            if (at > cut && pageOf(n) <= 1 && pageOf(n) > titlePage && (n.type === "heading" || n.type === "paragraph") && n.flowClass !== "excluded" && isTitle(n)) titlePage = pageOf(n);
            if (Array.isArray(n.content)) for (const c of n.content) if (c && typeof c === "object" && typeof c.text !== "string") parent.set(c, n);
        }
        // Another article's dateline: under a heading of its own -- not this paper's title nor a
        // section's -- among the few blocks above it (franz.2: a paper's own "(Received ...)" under
        // its title, or at its end, stops nothing).
        for (let i = 0; i < blocks.length && stop === Infinity; i++) {
            const [n, at] = blocks[i];
            if (at <= cut || (n.type !== "paragraph" && n.type !== "heading") || !(pageOf(n) > titlePage)) continue;
            const t = clean(textOf(n));
            if (t.length > 300 || !RECEIVED.test(t)) continue;
            for (let j = i; j >= 0 && j >= i - 4; j--) {
                const h = blocks[j][0];
                if (h.type !== "heading") continue;
                const ht = clean(textOf(h));
                if (!isTitle(h) && !SECTION_HEAD.test(ht) && !wvRefListIsTitle(ht) && !otherPart(ht)) { stop = at; break; }
            }
        }
    }
    const ls = leaves(s, order).filter((x) => x.at > cut && x.at < stop);
    /** The note's text (the mark kept, OCR's left out), or null. */
    const isNote = (n: any): string | null => {
        const t = clean(textOf(n));
        if (t.length < 15 || t.length > 500) return null;
        const m = t.match(FOOTNOTE_MARK);
        const o = !m && own ? t.match(OCR_MARK) : null;
        if (!m && !o) return null;
        const body = t.slice((m || o)![0].length);
        if (wvRefListIsFrontMatter(body) || isProse(t) || (own && STAMP.test(t))) return null;
        for (const bp of [BACK_POINTER, LC_POINTER]) if (bp.test(body) && body.replace(bp, "").replace(/[^\p{L}]/gu, "").length < 25) return null;
        if (!citesWork(body)) return null;
        if (!/\p{Lu}[\p{Ll}\p{Lu}'’-]{2,}/u.test(body)) return null;
        return o ? body : t;
    };
    const out: Array<Ent & { page: number; strict: boolean }> = [];
    for (let i = 0; i < ls.length; i++) {
        const x = ls[i];
        const t = isNote(x.n);
        if (!t) continue;
        // At the foot of its page: what follows on the page is a footnote
        // too, page furniture or a figure -- after the title, or a block of
        // the next column, an OCR'd note, a download stamp, another item of
        // the note's list. `strict`: by the first rule alone, with a mark
        // that is no OCR's (franz.2: what the cap below falls back to).
        const p = pageOf(x.n);
        let foot = Number.isFinite(p), strict = foot && FOOTNOTE_MARK.test(clean(textOf(x.n)));
        const [xa, xb] = xSpan(x.n, p);
        for (let j = i + 1; j < ls.length && (foot || strict); j++) {
            const y = ls[j];
            if (pageOf(y.n) !== p) break;
            const u = clean(textOf(y.n));
            if (transparent(y.n) || FOOTNOTE_MARK.test(u)) continue;
            strict = false;
            if (isNote(y.n)) continue;
            if (own) {
                const [ya, yb] = xSpan(y.n, p);
                if (Math.min(xb, yb) <= Math.max(xa, ya) || OCR_NOTE_START.test(u) || OCR_MARK.test(u) || STAMP.test(u) || (parent.get(y.n) && parent.get(y.n) === parent.get(x.n))) continue;
            }
            foot = false;
        }
        if (!foot) continue;
        const e: Ent = { text: t, rects: rectsOf(x.n), at: x.at, end: x.at, blocks: [x.n] };
        // (OCR's mark left out of the text: its characters still count in the text maps.)
        for (const n of own ? notesOf(e, nonSpace(clean(textOf(x.n))) - nonSpace(t)) : [e]) out.push(Object.assign(n, { page: p, strict }));
    }
    // Footnotes are a few per page, on several pages: a page with more is a
    // list (another article's, or one the reader refused), not footnotes --
    // but the paper's own first page, after its title. Counted in blocks (a
    // block of merged notes is one); a page over the cap keeps the notes the
    // first rule reads, as it did before the column rule (franz.2).
    const per = new Map<number, Set<number>>(), perStrict = new Map<number, Set<number>>();
    const add = (m: Map<number, Set<number>>, e: { page: number; at: number }) => { if (!m.has(e.page)) m.set(e.page, new Set()); m.get(e.page)!.add(e.at); };
    for (const e of out) { add(per, e); if (e.strict) add(perStrict, e); }
    const kept = out.filter((e) => per.get(e.page)!.size <= FOOTNOTES_PER_PAGE || (own && e.page === titlePage)
        || (e.strict && perStrict.get(e.page)!.size <= FOOTNOTES_PER_PAGE));
    return new Set(kept.map((e) => e.page)).size >= 2 ? kept.map(({ page, strict, ...e }) => e) : [];
}

/** A note block cut where a second note starts (NEXT_NOTE), each part reading as a reference; the
 *  later part's box from the text maps (boxesFrom), else the block's. A number as the second
 *  mark stays in its text, OCR's characters do not. `skip`: the block's non-space characters
 *  before `e.text` starts. */
function notesOf(e: Ent, skip: number): Ent[] {
    const out: Ent[] = [];
    let cur = e, from = skip;
    for (let g = 0; g < 8; g++) {
        let at = -1, head = "";
        NEXT_NOTE.lastIndex = 0;
        for (const m of cur.text.matchAll(NEXT_NOTE)) {
            const p = /^\d/.test(m[1]) ? m.index! + m[0].indexOf(m[1]) : m.index! + m[0].length;
            const h = cur.text.slice(0, m.index! + 1).trim(), tail = cur.text.slice(p).trim();
            if (h.length >= 15 && tail.length >= 15 && citesWork(h) && citesWork(tail)) { at = p; head = h; break; }
        }
        if (at < 0) break;
        const boxes = e.blocks ? boxesFrom(e.blocks, from + nonSpace(cur.text.slice(0, at))) : null;
        out.push(Object.assign({}, cur, { text: head }));
        from += nonSpace(cur.text.slice(0, at));
        cur = { text: cur.text.slice(at).trim(), rects: boxes || e.rects, at: e.at, end: e.end, blocks: e.blocks };
    }
    out.push(cur);
    return out;
}

/** A page with more footnotes that read as references than this holds a list. */
const FOOTNOTES_PER_PAGE = 4;
