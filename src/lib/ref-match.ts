// Which item of the user's libraries a reference names -- offline, from what
// the libraries hold (refs.ts, "references in your library"; plan
// work/refs-feature-plan-2026-11-18.md). Pure: no Zotero, no DOM, so the
// suite drives it with a fixture (test/refs-match.spec.js).
//
// The method is Reference Checker's (zotero-reference-checker 1.3.3 by
// najibprog, MIT -- content/refcheck.js `_buildIndex`, `compact`, `cleanDOI`,
// `matchText`; notice in THIRD-PARTY-NOTICES.md): an exact DOI (the item's
// DOI field, an Extra `DOI:` line, its URL), then the longest library title
// contained in the reference's compacted text, a short title (under 25
// characters) only with the first author's surname there too. Weavero's own
// additions:
//   - the containment scan goes through an index of title heads instead of
//     every item (one map lookup per position of the reference);
//   - a volume + first-page key with the first author's surname in the
//     entry's first characters, for entries that carry no title (APS style);
//   - an approximate title (at most 10% of its characters wrong, Sellers'
//     edit distance) only when the first author and the year agree;
//   - a self-match guard: never the citing paper, nor any item that shares
//     its DOI or its exact title, in any library (Reference Checker marked
//     "See Supplemental Material [own DOI]" as the paper itself);
//   - since 1.3.0-refkeys.1 (2026-11-24) an arXiv identifier right after the
//     exact DOI (wvRefArxivIds, the item's from its DOI, Archive ID, URL or
//     Extra), and an `ambiguous` answer: several DIFFERENT works the winning
//     step finds with the same evidence (idea from Changed Reference Linker,
//     gesongping, MIT -- reference-linker.js: two candidates within 0.06 of
//     the best score are ambiguous; re-implemented on this matcher's own
//     steps and evidence, see AMBIG_MAX).
// A match names every COPY of the work (the same DOI, or the same title by
// the same first author; since refkeys.1 the same arXiv identifier on two
// preprint records) the caller may choose from.

import { wvTrimTrailing } from "./text";

/** One regular item, as the index takes it. */
export interface WvRefItem {
    id: number;
    lib: number;
    title: string;
    DOI?: string;
    url?: string;
    extra?: string;
    /** The first creator's last name (or single name), as written. */
    first?: string;
    date?: string;
    /** The Original Date field, where the item's type has one (a book; 1.3.0-refyear.2). */
    originalDate?: string;
    volume?: string;
    pages?: string;
    /** A PDF (or EPUB) under it the reader opens. */
    pdf?: boolean;
    /** Zotero's item type name ("preprint", "journalArticle"), when known. */
    itemType?: string;
    /** The Archive ID field (Zotero's `archiveID`, a preprint's: "arXiv:2101.12345"). */
    archiveID?: string;
}

interface WvRefRec {
    id: number;
    lib: number;
    title: string;
    ct: string;
    dois: string[];
    cdois: string[];
    first: string;
    /** Other compact forms of the first author's surname an entry may
     *  print (1.2.1-refsacc.1): without a leading particle ("de Gans" ->
     *  gans), without a trailing initial the library keeps in the name
     *  ("Dussan V." -> dussan). */
    forms: string[];
    year: string;
    /** The original date's year, when it differs from `year` (1.3.0-refyear.2): a reprint
     *  or a translation an entry cites by the year of the original. */
    oyear: string;
    /** `year` and `oyear` as numbers, those the item has: the years an entry may cite it by. */
    years: number[];
    /** Volume + first-page keys: the fields', and one the DOI spells out
     *  (Physical Review "...physrevlett.105.168101", IOP / EPL
     *  ".../71/3/036601") when the fields lack it (1.2.1-refsacc.1). */
    vps: string[];
    pdf: boolean;
    /** Other forms of the title an entry may print (1.2.1-refs.8), compact:
     *  without a leading roman numeral ("VI. On the capillary phenomena of
     *  jets"), without the subtitle ("An Introduction to Interfaces and
     *  Colloids: The Bridge to Nanoscience"). */
    alts: string[];
    /** When the item entered the index (its place in `byYear`'s order). */
    ord: number;
    /** The title's length for the short-title rule (1.2.1-citd.1): a CJK, kana or
     *  Hangul character counts two (titleWeight). */
    cw: number;
    /** Its arXiv identifiers (arxivIdsOf), canonical: "2101.12345", "hep-th/9901001". */
    axs: string[];
    /** How it stands for an arXiv identifier it carries (1.3.0-refkeys.1): 0 a
     *  preprint (its item type), 1 no DOI other than an arXiv one, 2 another DOI
     *  -- a journal version, which Zotero's arXiv translator gives the preprint's
     *  link and an Extra "arXiv:" line. */
    pre: number;
    /** Zotero's item type name, "" when not known. */
    type: string;
}

/** A character of a script written without spaces between words, or by syllable
 *  blocks: Han, kana, Hangul. */
const CJK_RX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** A compact title's length, a CJK / kana / Hangul character counted two (1.2.1-citd.1):
 *  such a character holds what two letters or more do, and a 16-character Japanese
 *  title ("健康と場所近隣環境と健康格差研究") is no short title. */
function titleWeight(ct: string): number {
    let n = 0;
    for (const ch of ct) n += CJK_RX.test(ch) ? 2 : 1;
    return n;
}

/** The script a name is written in, as far as telling names apart goes. */
function scriptOf(s: string): string {
    if (CJK_RX.test(s)) return "cjk";
    if (/\p{Script=Cyrillic}/u.test(s)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(s)) return "greek";
    if (/\p{Script=Latin}/u.test(s)) return "latin";
    return "";
}

export interface WvRefIndex {
    items: Map<number, WvRefRec>;
    byDOI: Map<string, Set<number>>;
    byTitle: Map<string, Set<number>>;
    /** The first HEAD characters of a compact title or DOI -> ids. */
    byHead: Map<string, Set<number>>;
    byVolPage: Map<string, Set<number>>;
    byYear: Map<string, Set<number>>;
    /** The first HEAD characters of an item's other title forms -> ids. */
    byAltHead: Map<string, Set<number>>;
    /** A year -> the items of that year with a title of 5 to 9 letters and
     *  digits ("Fast R-CNN"). */
    byShortYear: Map<string, Set<number>>;
    /** "year|surname form" -> the items of that year whose first author has that
     *  form (nameForms), when the approximate-title step can ask for them (a first
     *  author, a title of MIN_APPROX, no series part): that step's candidates. */
    byYearForm: Map<string, Set<number>>;
    /** A year -> those items whose first author has a form in another script
     *  (looked for inside the entry's words, not as one of them). */
    byYearOther: Map<string, Set<number>>;
    /** An arXiv identifier (canonical) -> the items that carry it (1.3.0-refkeys.1). */
    byArxiv: Map<string, Set<number>>;
    /** Bumped on every change: a cache of results keys on it. */
    seq: number;
}

/** What never counts as a match: the citing paper itself. */
export interface WvRefSelf {
    ids?: number[];
    dois?: string[];
    /** Compact titles. */
    cts?: string[];
    /** Its arXiv identifiers (1.3.0-refkeys.1). */
    axs?: string[];
}

export type WvRefHow = "doi" | "arxiv" | "title" | "volpage" | "approx";

export interface WvRefMatch {
    /** Every copy of the work, the matched item first. */
    ids: number[];
    how: WvRefHow;
    /** Since 1.3.0-refkeys.1: when the winning step found several DIFFERENT works
     *  with the same evidence, one item of each (the matched one first, at most
     *  AMBIG_MAX); absent otherwise. `ids` stays the first work's copies. */
    ambiguous?: number[];
}

/** The most works an ambiguous answer names (1.3.0-refkeys.1): the tooltip
 *  that lists them stays a few lines. */
const AMBIG_MAX = 5;
/** Two candidates of the approximate-title step (4) tie when their shares of
 *  wrong characters differ by this much at most (1.3.0-refkeys.1, 2026-11-24):
 *  a fifth of the step's own tolerance (APPROX_ERR 0.1), one character in fifty
 *  -- a line break's hyphen or one OCR slip on a title of ordinary length, which
 *  the entry's text cannot hold against either. Changed Reference Linker's 0.06
 *  is on a 0-1 similarity whose accepted band is wider; here it would be 60 %
 *  of the band. The other steps' evidence is in whole points (wvRefMatch
 *  yearEv / firstEv): equal is a tie. */
const APPROX_TIE = 0.02;

const HEAD = 8;
/** Titles shorter than this (compact) are never looked for. */
const MIN_TITLE = 10;
/** A shorter title needs the first author too (Reference Checker's 25). */
const SHORT_TITLE = 25;
/** A title an entry stops inside of is taken from this many compact
 *  characters on (1.2.1-refsacc.1; step 2c). */
const CUT_TITLE = 24;
/** An approximate title is tried from this length (compact) on. */
const MIN_APPROX = 15;
/** The share of a title's characters that may be wrong in an approximate match. */
const APPROX_ERR = 0.1;
/** The first author's surname is looked for in this many characters of the entry. */
const LEAD = 100;

/** A DOI: since 1.2.1-refsacc.1 with a SICI's "<...>" part kept ("10.1175/
 *  1520-0493(1999)127<1374:CODAUA>2.0.CO;2"): cut at "<", every article of a
 *  journal's volume had one DOI, and the r4 books' "van Leeuwen 1999,
 *  Monthly Weather Review 127, 1374" took Anderson's article of that volume. */
const DOI_BODY = "10\\.\\d{4,9}\\/(?:[^\\s\"<>]|<[^\\s\"<>]{1,40}>)+";
const DOI_RX = new RegExp("\\b" + DOI_BODY, "gi");
/** The first DOI of a string (wvRefCleanDOI): one object, not one per call -- the index
 *  build cleans three fields of every item. Not global: `match` keeps no state on it. */
const DOI_ONE_RX = new RegExp(DOI_BODY, "i");

/** Letters and digits only, lower case, accents dropped, ligatures split
 *  (Reference Checker's `compact`); since 1.2.1-refs.8 the dotless ı as i:
 *  AIP's PDFs set an accented i as ı and a loose accent ("Rodrıǵuez",
 *  "Martıńez"), and NFKD keeps ı a letter of its own. */
export function wvRefCompact(s: any): string {
    return String(s || "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\u0131/g, "i")
        .toLowerCase()
        // Since 1.2.1-citd.1 the letters NFKD keeps whole, as lists in other languages write
        // them: "Strasse" for Stra\u00dfe, "Sorensen" for S\u00f8rensen, "Lukasz" for \u0141ukasz.
        .replace(/[\u00df\u00e6\u0153\u00f8\u0142\u0111\u00fe\u00f0]/g, (c) => COMPACT_LETTERS[c])
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

const COMPACT_LETTERS: { [k: string]: string } = { "\u00df": "ss", "\u00e6": "ae", "\u0153": "oe", "\u00f8": "o", "\u0142": "l", "\u0111": "d", "\u00fe": "th", "\u00f0": "d" };

/** Cyrillic letters in Latin ones, three ways lists write a Russian name (1.2.1-citd.1):
 *  BGN-like ("\u0417\u0430\u0445\u0430\u0440\u043e\u0432" -> zakharov, "\u0424\u0440\u0435\u0439\u043a\u0430" -> freyka), scholarly (zaharov, freika) and
 *  with j (frejka); \u044c and \u044a dropped. */
const TRANSLIT: Array<{ [k: string]: string }> = [
    { \u0439: "y", \u0445: "kh", \u0446: "ts", \u044e: "yu", \u044f: "ya", \u0449: "shch" },
    { \u0439: "i", \u0445: "h", \u0446: "c", \u044e: "iu", \u044f: "ia", \u0449: "sch" },
    { \u0439: "j", \u0445: "kh", \u0446: "c", \u044e: "ju", \u044f: "ja", \u0449: "shch" },
];
const TRANSLIT_BASE: { [k: string]: string } = { \u0430: "a", \u0431: "b", \u0432: "v", \u0433: "g", \u0434: "d", \u0435: "e", \u0451: "e", \u0436: "zh", \u0437: "z", \u0438: "i", \u043a: "k", \u043b: "l", \u043c: "m",
    \u043d: "n", \u043e: "o", \u043f: "p", \u0440: "r", \u0441: "s", \u0442: "t", \u0443: "u", \u0444: "f", \u0447: "ch", \u0448: "sh", \u044a: "", \u044b: "y", \u044c: "", \u044d: "e", \u0456: "i", \u0457: "yi", \u0454: "ye", \u0491: "g" };

/** A compact Cyrillic name's Latin forms (TRANSLIT), without repeats. */
function translit(c: string): string[] {
    const out: string[] = [];
    for (const v of TRANSLIT) {
        let s = "";
        for (const ch of c) s += v[ch] !== undefined ? v[ch] : TRANSLIT_BASE[ch] !== undefined ? TRANSLIT_BASE[ch] : ch;
        if (/^[a-z]+$/.test(s) && out.indexOf(s) < 0) out.push(s);
    }
    return out;
}

/** A title that is one numbered part of a series: "Statistical theory of
 *  turbulence-II", "Transient cavities near boundaries. Part 1. Rigid
 *  boundary". Its siblings differ from it by a numeral alone, so it is never
 *  taken approximately (1.2.1-refs.8: r3's NACA scan cites Taylor's part
 *  "lII" -- III, OCR'd -- which the approximate rule took for part II). */
function isSeriesPart(title: string): boolean {
    return /\bpart\s*(?:\d+|[ivx]+)\b/i.test(title) || /[\s.,:;–—-](?:[IVX]{1,5}|\d{1,2})\s*\.?\s*$/.test(title);
}

/** After a title found inside an entry: another part's numeral ("... of
 *  Turbulence lII- Distribution ...", "... Part 3. ..."), OCR's l for I
 *  included. */
const SERIES_AFTER = /^\s*[-–—,.:]?\s*(?:[Pp]art\s*(?:\d+|[IVXivx]+)\b|[IVXl]{1,5}(?=[\s.,:;–—-]|$)|\d{1,2}(?=[\s.,:;–—-]|$))/;

/** What comes before a container's title in an entry (wvRefMatch step 2): "In" and its
 *  forms opening a part of the entry (after a stop, a comma, a bracket), then the editors
 *  and their mark ("(eds.)", "editors", "(Hrsg.)", "(dir.)", "(Org.)", "a cura di"), or the
 *  title right away; a quote before the title allowed. */
const CONTAINER_BEFORE = /(?:^|[.,;:)\]»”"]\s*)(?:In|in|IN|Dans|dans|En|en|Im|im|В|в)\s*:?\s+(?:.{0,140}?(?:\((?:[Ee]ds?|[Ee]ditors?|[Hh]rsg|[Dd]ir|[Cc]oord|[Oo]rgs?|[Rr]ed|ред)\.?\)|\b[Ee]ds?\.|\b[Ee]ditors?\b|\b[Ee]dited by\b|\ba cura di\b|\b[Hh]rsg\.\s*v\.)[^\p{L}\d]{0,4})?[«"“„‘']?\s*$/u;

/** The pages of the citing work an entry ends with (back-references: biblatex's "(p. 115,
 *  184)", "(cit. on pp. 3, 5)", amsalpha's "↑249, 255"). */
const BACKREF_RX = /(?:\(\s*(?:cit(?:ed|\.)?\s+on\s+)?pp?\.?\s*\d{1,5}(?:\s*[,–-]\s*\d{1,5})*\s*\)|↑\s*\d{1,5}(?:\s*,\s*\d{1,5})*)\s*\.?\s*$/u;

/** An entry that names an earlier version of a paper -- submitted, a preprint, in press
 *  (1.3.0-refyear.1): its year may be the version's, years before the journal's. */
const EARLIER_VERSION_RX = /\b(?:submitted|preprint|arxiv|in press|to appear|accepted for publication|under review|forthcoming)\b/i;

/** The first DOI in `s`, lower case, trailing punctuation off; "" when none
 *  (Reference Checker's `cleanDOI`). */
export function wvRefCleanDOI(s: any): string {
    if (!s) return "";
    const m = String(s).match(DOI_ONE_RX);
    if (!m) return "";
    return wvTrimTrailing(m[0], ".,;:)]}>").toLowerCase();
}

/** Every DOI written in `s`, cleaned, without repeats. */
export function wvRefDOIs(s: any): string[] {
    const out: string[] = [];
    for (const m of String(s || "").matchAll(DOI_RX)) {
        const d = wvRefCleanDOI(m[0]);
        if (d && out.indexOf(d) < 0) out.push(d);
    }
    return out;
}

// ---- arXiv identifiers (1.3.0-refkeys.1, 2026-11-24) ---------------------------------
// The scheme as arXiv documents it (info.arxiv.org/help/arxiv_identifier.html and
// arxiv_identifier_for_services.html, read 2026-11-24): from 0704 "YYMM.NNNN", 4
// digits up to 1412 and 5 from 1501; before it "archive/YYMMNNN" (9107 to 0703), an
// old one's ".SC" subject class optional and not part of it ("math.CA/0611800v2" is
// "arXiv:math/0611800v2"); "vN" names a version, the identifier without it the work.
// Kept canonical: lower case, the version and the subject class off.

/** The old scheme's archives, a longer name before one it starts with. arXiv's pages
 *  name astro-ph, cond-mat, gr-qc, hep-ex/lat/ph/th, math-ph, quant-ph, physics,
 *  nlin, math, q-bio, cs, chao-dyn, alg-geom; the others are archives it folded into
 *  those (from memory: a name missing here loses an identifier, never makes one). */
const AX_ARCHIVES = "astro-ph|cond-mat|gr-qc|hep-ex|hep-lat|hep-ph|hep-th|math-ph|nucl-ex|nucl-th|quant-ph|physics|nlin|math|q-bio|cs"
    + "|acc-phys|adap-org|alg-geom|ao-sci|atom-ph|bayes-an|chao-dyn|chem-ph|cmp-lg|comp-gas|dg-ga|funct-an|mtrl-th|patt-sol|plasm-ph|q-alg|solv-int|supr-con";
const AX_OLD = "(?:" + AX_ARCHIVES + ")(?:\\.[a-z]{2})?\\/\\d{7}";
/** After "arXiv", one space allowed after the period: a line break in a PDF's text ("arXiv:2101. 12345"). */
const AX_NEW_SP = "\\d{4}\\.\\s?\\d{4,5}";
const AX_NEW = "\\d{4}\\.\\d{4,5}";
/** Where an entry writes one: after "arXiv" (":", a space, the DOI's "10.48550/arXiv.",
 *  "arXiv preprint arXiv:", "arXiv ID:"), in an arxiv.org link (abs, pdf, ps, src,
 *  format), and an old-scheme one alone -- its archive's name says what it is, unless
 *  it is a piece of a path or a word. A new-scheme number alone ("2101.12345") is no
 *  identifier: a page, an article number, a decimal. */
const AX_RX = new RegExp("\\barxiv(?:\\s*(?:preprint|e-?prints?|id))?\\s*[:.]?\\s*(?:arxiv\\s*[:.]?\\s*)?(" + AX_NEW_SP + "|" + AX_OLD + ")(?:v\\d+)?(?!\\d)"
    + "|\\barxiv\\.org\\/(?:abs|pdf|ps|src|format)\\/(" + AX_NEW + "|" + AX_OLD + ")(?:v\\d+)?(?!\\d)"
    + "|(?<![\\w.\\/-])(" + AX_OLD + ")(?:v\\d+)?(?!\\d)", "gi");
/** What every form has: "arxiv" or an old identifier's "/" and seven digits. */
const AX_HINT = /arxiv|\/\d{7}/i;
/** The DOI arXiv gives a paper (DataCite), cleaned as wvRefCleanDOI cleans one. */
const AX_DOI = "10.48550/arxiv.";

/** An identifier as written (the version off), canonical, or "" when it is none: a month
 *  1-12, a new one from 0704 with its digits (4 to 1412, 5 from 1501), an old one of
 *  9107 to 0703. */
function axNorm(id: string): string {
    const s = String(id || "").toLowerCase().replace(/\s+/g, "");
    let m = /^(\d{2})(\d{2})\.(\d{4,5})$/.exec(s);
    if (m) {
        const mm = Number(m[2]), yymm = Number(m[1]) * 100 + mm;
        if (mm < 1 || mm > 12 || yymm < 704) return "";
        return m[3].length === (yymm <= 1412 ? 4 : 5) ? s : "";
    }
    m = /^([a-z-]+)(?:\.[a-z]{2})?\/((\d{2})(\d{2})\d{3})$/.exec(s);
    if (m) {
        const yy = Number(m[3]), mm = Number(m[4]);
        const ym = (yy >= 91 ? 1900 + yy : 2000 + yy) * 100 + mm;
        if (mm < 1 || mm > 12 || ym < 199107 || ym > 200703) return "";
        return m[1] + "/" + m[2];
    }
    return "";
}

/** The arXiv identifiers written in `s` (AX_RX), canonical, without repeats. */
export function wvRefArxivIds(s: any): string[] {
    const t = String(s || "");
    if (!AX_HINT.test(t)) return [];
    const out: string[] = [];
    for (const m of t.matchAll(AX_RX)) {
        const id = axNorm(m[1] || m[2] || m[3] || "");
        if (id && out.indexOf(id) < 0) out.push(id);
    }
    return out;
}

/** An item's arXiv identifiers: its DOIs' (10.48550/arXiv.<id>), its Archive ID's
 *  ("arXiv:<id>", Zotero's arXiv translator on a preprint), its URL's (arxiv.org/abs|pdf/
 *  <id>), and those of its Extra lines that start with "arXiv" ("arXiv:<id> [cat]" of the
 *  translator, "arXiv: <id>" of the Mendeley import, chrome/content/zotero/import/
 *  mendeley/mendeleyImport.mjs _addExtraField). */
function arxivIdsOf(it: WvRefItem, dois: string[]): string[] {
    const out: string[] = [];
    const put = (a: string) => { if (a && out.indexOf(a) < 0) out.push(a); };
    for (const d of dois) if (d.startsWith(AX_DOI)) put(axNorm(d.slice(AX_DOI.length).replace(/v\d+$/, "")));
    if (it.archiveID) for (const a of wvRefArxivIds(it.archiveID)) put(a);
    if (it.url && /arxiv\.org/i.test(it.url)) for (const a of wvRefArxivIds(it.url)) put(a);
    const ex = String(it.extra || "");
    if (/arxiv/i.test(ex)) for (const l of ex.split(/\r?\n/)) if (/^\s*arxiv\b/i.test(l)) for (const a of wvRefArxivIds(l)) put(a);
    return out;
}

/** The years written in `s` (1600-2099), a letter after one allowed ("2018a");
 *  since 1.2.1-citd.1 also a year as an old scan's OCR spells it (ocrYearsRead). */
export function wvRefYears(s: any): string[] {
    const t = String(s || "");
    // The matcher asks it several times per entry: the last answers kept.
    if (t === yearsMemo[0]) return yearsMemo[1].slice();
    const out: string[] = [];
    const u = ACCESS_WORD.test(t) ? t.replace(ACCESSED_RX, " ") : t;
    for (const m of ocrYearsRead(u).matchAll(/(?<!\d)(1[6-9]\d\d|20\d\d)(?!\d)/g)) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    yearsMemo[0] = t; yearsMemo[1] = out;
    return out.slice();
}

const yearsMemo: [string | null, string[]] = [null, []];
/** A word ACCESSED_RX starts with: only then is it run. */
const ACCESS_WORD = /access|retriev|viewed|cited|consult|zugegr|abgeruf|aufgeruf|acess|accedid|visitad|обращ|閲覧|参照|검색/i;

/** When a web page was read, which is no year of the work (1.2.1-citd.1; the r5 set's
 *  "（accessed 2018-02-15）" after a 2014 statement): "accessed", "retrieved", "cited", and
 *  the other languages' words for it, then a date. */
const ACCESSED_RX = /[([（]?\s*(?<!\p{L})(?:last\s+)?(?:accessed|retrieved|viewed|cited|consulted|consulté(?:\s+le)?|zugegriffen|abgerufen|aufgerufen|acesso\s+em|acessado\s+em|accedido|consultado|visitado|дата\s+обращения|обращения|閲覧|参照|검색일)(?:\s+(?:on|am|el|en|le))?\s*:?\s*[^()[\]（）\n]{0,32}?(?:1[6-9]|20)\d\d[^()[\]（）\n]{0,16}[)\]）]?/giu;

/** `s` with the years an old scan's OCR misspelt written in digits (1.2.1-citd.1): a word of
 *  four characters, digits and the letters OCR reads for 1 and 0 (I, l, |, O), at least two of
 *  them digits, that reads as a year 1600-2099 -- "I879" (MJT's 1966 Chem. Eng. Sci. scan:
 *  "Lord RAYLEIGH,Proc.R. Sot. I879 29 71."), "l905", "19l4". Letters alone ("IlOl") or another
 *  number ("1O4") stay as they are. */
export function ocrYearsRead(s: string): string {
    // Such a year has a digit beside one of those letters.
    if (!/\d[IlO|]|[IlO|]\d/.test(s)) return s;
    return s.replace(/(?<![\p{L}\p{N}])[0-9IlO|]{4}(?![\p{L}\p{N}])/gu, (w) => {
        if (/^\d{4}$/.test(w) || (w.match(/\d/g) || []).length < 2) return w;
        const y = w.replace(/[Il|]/g, "1").replace(/O/g, "0");
        return /^(?:1[6-9]\d\d|20\d\d)$/.test(y) ? y : w;
    });
}

/** Volume / first-page pairs written in `s`: "96 (12), 124501", "6(7), 993",
 *  "958, A24", "18(4):467-479", "32, 4179"; since 1.2.1-refs.7 also the
 *  styles the 2026-11-20 survey of MJT's library found unread (RSC 13.3 % and
 *  IOP 29.0 % of the in-library references found): "YEAR, VOL, PAGE" (RSC,
 *  ACS, MDPI: "1966, 9, 1153" -- the pairs overlap, so "9|1153" is read
 *  besides "1966|9"), "VOL (YEAR) PAGE" (EPL, Elsevier: "554 (2006) 85") and
 *  "VOL PAGE" after a journal's abbreviation (IOP: "Mech. 554 85-97"). Keys
 *  "volume|page", compact. */
export function wvRefVolPages(s: any): string[] {
    const out: string[] = [];
    const t = String(s || "");
    const put = (v: string, p: string) => {
        const k = wvRefCompact(v) + "|" + wvRefCompact(p);
        if (out.indexOf(k) < 0) out.push(k);
    };
    // Up to ten digits: PNAS's article numbers, "118, e2103215118" (1.2.1-refs.8).
    const rx = /(?<![\d.])(\d{1,4})\s*(?:\([^()]{1,12}\))?\s*[,:]\s*(?:pp?\.\s*)?([A-Za-z]?\d{1,10})(?![\d])/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t))) {
        put(m[1], m[2]);
        // The next pair may start at this one's page ("1966, 9, 1153").
        rx.lastIndex = m.index + m[0].length - m[2].length;
    }
    for (const y of t.matchAll(/(?<![\d.])(\d{1,4})\s*\(\s*(?:1[6-9]\d\d|20\d\d)\s*\)\s*(?:pp?\.\s*)?([A-Za-z]?\d{1,7})(?![\d])/g)) put(y[1], y[2]);
    // A law report or law review between the volume and the page (1.2.1-citd.1, the r5 set's
    // law papers): "403 U.S. 388", "5 U.S. (1 Cranch) 137", "78 N.Y.U. L. REV. 1309", "28 Yale
    // L.J. 1", "[1911] 1 KB 410", "2018 SCC 30", "102 DLR (4th) 456" -- abbreviations (a capital
    // and a period, or capitals alone), a word before them at most.
    for (const y of t.matchAll(/(?<![\d.\]\p{L}])(\d{1,4})\s+(?:\p{Lu}\p{Ll}{1,8}\s)?(?:(?:\p{Lu}[\p{L}]{0,6}\.|\p{Lu}{2,6})\s?){1,5}(?:\d[a-z]{1,2}\s)?(?:\((?:\d{1,3}\s+\p{Lu}\p{L}+\.?|\d{1,2}(?:st|nd|rd|th))\)\s*)?(\d{1,6})(?![\d])/gu)) put(y[1], y[2]);
    // "YEAR VOL PAGE", the three numbers set apart by spaces alone (1.2.1-citd.1): Chemical
    // Engineering Science and other journals of the 1960s, "Lord RAYLEIGH, Proc. R. Soc. 1879 29
    // 71." (MJT's 1966 scan) -- the year read as OCR may have spelt it ("I879", wvRefYears).
    for (const y of ocrYearsRead(t).matchAll(/(?<![\d.])(?:1[6-9]\d\d|20\d\d)\s+(\d{1,4})\s+([A-Za-z]?\d{1,7})(?![\d.,:]\d)(?=\s*(?:[-–—]|[.,;)]|$))/g)) put(y[1], y[2]);
    for (const y of t.matchAll(/(?<=[\p{L}.]\s)(\d{1,4})\s+([A-Za-z]?\d{1,7})(?![\d.,]\d)(?=\s*(?:[-–—]|[.,;)]|$))/gu)) put(y[1], y[2]);
    // An article number set with a thin space every three digits (1.2.1-
    // refsacc.1; the survey's "Europhys. Lett. 93, 28 008 (2011)", "Soft
    // Matter 7, 11 325 (2011)").
    for (const y of t.matchAll(/(?<![\d.])(\d{1,4})\s*,\s*(\d{1,3})\s(\d{3})(?![\d])/g)) put(y[1], y[2] + y[3]);
    // A volume and a page each named (1.2.1-refsacc.1): "Phys. Rev., Series
    // 2, Vol. 8, p 738, 1916", "vol. 115, no. 2, 2004, pp. 488-496" (NASA,
    // AIAA), "Proceedings of the Royal Society, Vol. XV, p 14" (a roman
    // volume, read as its number too).
    for (const y of t.matchAll(/\bvol(?:ume)?\.?\s*(\d{1,4}|[IVXLC]{1,7})\b[^;]{0,30}?\bpp?\.?\s*([A-Za-z]?\d{1,7})(?![\d])/gi)) {
        put(y[1], y[2]);
        const r = romanValue(y[1]);
        if (r) put(String(r), y[2]);
    }
    return out;
}

/** A roman numeral's value ("XV" -> 15, "CXXVII" -> 127), or 0. */
function romanValue(s: string): number {
    if (!/^[IVXLC]+$/i.test(s)) return 0;
    const v: { [k: string]: number } = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    const t = s.toLowerCase();
    let n = 0;
    for (let i = 0; i < t.length; i++) {
        const a = v[t[i]], b = i + 1 < t.length ? v[t[i + 1]] : 0;
        n += a < b ? -a : a;
    }
    return n;
}

/** The first page of a pages field, compact. Physical Review's "(R)" after an
 *  article number ("051901(R)", a Rapid Communication), or any short letter
 *  suffix in parentheses, is not part of the number the entries print
 *  ("Phys. Rev. Fluids 1, 051901(R) (2016)" gives 051901): 1.2.1-refs.6
 *  missed three of MJT's references for it. */
function firstPage(pages: any): string {
    const p = String(pages || "").trim().split(/[-‐-―,;\s]/)[0].replace(/\([A-Za-z]{1,3}\)$/, "");
    return wvRefCompact(p);
}

/** The words of `s`, each compact ("Gañán-Calvo" -> "ganan", "calvo"). */
function wordsOf(s: string): string[] {
    // Combining accents stay in their word ("Castrejón" written o + U+0301).
    return String(s || "").split(/[^\p{L}\p{M}\p{N}]+/u).map(wvRefCompact).filter((w) => w);
}

/** Is a compact surname `first` one of the words `ws`, or several of them
 *  written together ("van der Meer" -> vandermeer, "O'Brien" -> obrien)? Not
 *  inside a longer word: "landau" is not in "Queensland, Australia" (the
 *  1.2.1-refs.6 false mark on MJT's paper 05). A surname in a script written
 *  without spaces (CJK) is looked for inside the words. */
/** One person's other names (compact), as libraries and papers write them:
 *  John William Strutt is Lord Rayleigh ("Rayleigh L. On the capillary
 *  phenomena of jets" for Strutt 1879, r3's paper 23). */
const NAME_FORMS: { [k: string]: string[] } = { strutt: ["rayleigh", "lordrayleigh"], rayleigh: ["strutt"], lordrayleigh: ["strutt", "rayleigh"] };

function nameForms(first: string, more?: string[]): string[] {
    return [first].concat(NAME_FORMS[first] || [], more || []);
}

/** Is `f` written in a script other than Latin, Greek, Cyrillic (hasSurname1's own
 *  test), remembered per name: asked for every candidate item of step 4. */
const OTHER_SCRIPT = new Map<string, boolean>();
function otherScript(f: string): boolean {
    let v = OTHER_SCRIPT.get(f);
    if (v === undefined) {
        v = /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u.test(f);
        if (OTHER_SCRIPT.size > 50000) OTHER_SCRIPT.clear();
        OTHER_SCRIPT.set(f, v);
    }
    return v;
}

function hasSurname(ws: string[], first: string, more?: string[]): boolean {
    for (const f of nameForms(first, more)) if (hasSurname1(ws, f)) return true;
    return false;
}

function hasSurname1(ws: string[], first: string): boolean {
    if (!first) return false;
    if (/[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u.test(first)) return ws.some((w) => w.indexOf(first) >= 0);
    for (let i = 0; i < ws.length; i++) {
        let s = "";
        for (let j = i; j < ws.length && j < i + 4; j++) {
            s += ws[j];
            if (s === first) return true;
            if (s.length >= first.length || first.indexOf(s) !== 0) break;
        }
    }
    return false;
}

/** The entry's first author, as candidates: the first word of two letters or
 *  more (initials skipped) -- "I. R. Peters, Y. Tagawa" -> peters; "PETERS,
 *  I.R. & TAGAWA, Y." -> peters -- and, when a second such word follows it
 *  after a space alone (a given name written out, "Rowan Zellers"), that one
 *  too; with up to three words joined (a surname of several words). */
function firstAuthorIs(raw: string, first: string, more?: string[]): boolean {
    for (const f of nameForms(first, more)) if (firstAuthorIs1(raw, f)) return true;
    return false;
}

/** Levenshtein distance of `a` and `b`, or `max + 1` once it is more. */
function editDistance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = new Array(b.length + 1);
    let cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        let low = cur[0];
        const ac = a.charCodeAt(i - 1);
        for (let j = 1; j <= b.length; j++) {
            const sub = prev[j - 1] + (ac === b.charCodeAt(j - 1) ? 0 : 1);
            const v = Math.min(sub, prev[j] + 1, cur[j - 1] + 1);
            cur[j] = v;
            if (v < low) low = v;
        }
        if (low > max) return max + 1;
        const sw = prev; prev = cur; cur = sw;
    }
    return prev[b.length] <= max ? prev[b.length] : max + 1;
}

/** Is the entry's first author `first` give or take what OCR and typing do
 *  to a name (1.2.1-refsacc.1)? The entry's lead name (leadAuthor's
 *  candidates: its first word of two letters or more, alone or joined with
 *  the next ones) within one edit of a surname of 4-7 letters, two of a
 *  longer one: "Barlett" for Bartlett, "Scardiovelli" for Scardovelli,
 *  "]~URRILL" for Burrill, "PIERREHUMBRE.HTT." for Pierrehumbert. A whole
 *  name to a whole name -- never a name found inside other words. */
function firstAuthorNear(raw: string, first: string, more?: string[]): boolean {
    if (firstAuthorIs(raw, first, more)) return true;
    if (!first || first.length < 4) return false;
    const max = first.length >= 8 ? 2 : 1;
    for (const c of leadAuthor(raw).cands) if (c.length >= 3 && editDistance(c, first, max) <= max) return true;
    return false;
}

/** An entry's label ("[7]", "(7)", "7.", old APS "@7#"), and since 1.2.1-citd.1 the signal a
 *  footnote opens with before its author ("See", "See also", "See, e.g.,", "Cf.", "Compare",
 *  "Vgl.", "Siehe", "Voir", "Véase", "Ver", "Cfr.", "Vide"): the r5 set's law, history and
 *  religion papers cite so ("15. Cf. Ariella Azoulay, The Civil Contract of Photography ..."). */
const LEAD_OFF = /^\s*(?:\[\s*\d{1,4}\s*\]|\(\s*\d{1,4}\s*\)|@\d{1,4}#|\d{1,4}[.)]?)?\s*(?:(?:See(?:\s+also|\s+generally)?|see(?:\s+also|\s+generally)?|Cf\.|cf\.|Compare|Vgl\.|vgl\.|Siehe|Voir(?:\s+aussi)?|Véase(?:\s+también)?|Ver|Cfr\.|Vide|Vid\.)(?:,?\s+e\.\s?g\.)?,?\s+(?=\p{Lu}))?/u;

function firstAuthorIs1(raw: string, first: string): boolean {
    if (!first) return false;
    // The label off, and a footnote's signal (LEAD_OFF).
    const t = String(raw || "").replace(LEAD_OFF, "");
    const rx = /[\p{L}\p{M}\p{N}'’]+/gu;
    const toks: Array<{ w: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t)) && toks.length < 16) {
        const w = wvRefCompact(m[0]);
        if (w) toks.push({ w, start: m.index, end: m.index + m[0].length });
    }
    // Words of two letters or more start a name (initials and numbers skip);
    // a name goes on over the next words, short ones included ("Dussan V."
    // -> dussanv, OCR's "Ogũ z" -> oguz). Since 1.2.1-citd.1 a CJK character
    // alone is a name, not an initial ("王 小明").
    const starts = toks.map((x, i) => ((x.w.length >= 2 || CJK_RX.test(x.w)) && !/^\d+$/.test(x.w) ? i : -1)).filter((i) => i >= 0);
    if (!starts.length) return false;
    const joined = (from: number) => {
        let s = "";
        for (let j = from; j < toks.length && j < from + 3; j++) { s += toks[j].w; if (s === first) return true; }
        return false;
    };
    if (joined(starts[0])) return true;
    const k = starts[0];
    // A CJK surname the library keeps apart from the given name ("荒井" + "秀典",
    // "龙" + "花楼"): the entry's first name starts with it (1.2.1-citd.1).
    if (CJK_RX.test(first) && CJK_RX.test(toks[k].w) && toks[k].w.length > first.length && toks[k].w.startsWith(first)) return true;
    // An old scan's OCR glues the initials to the surname: "ROSHKOA, . 1976", "KONRADJ,. H.".
    if (first.length >= 4 && toks[k].w.length - first.length <= 2 && toks[k].w.startsWith(first) && /^[A-Z]+$/.test(t.slice(toks[k].start, toks[k].end))) return true;
    // "Rowan Zellers, ...": the second word right after the first, a space between.
    if (starts.length > 1 && starts[1] === k + 1 && /^\s+$/.test(t.slice(toks[k].end, toks[k + 1].start)) && joined(k + 1)) return true;
    return false;
}

/** Is `surname` (as written anywhere: "van der Meer", "PETERS") the first
 *  author of the reference `raw`? The rule of the matcher's volume + page and
 *  other-title steps (firstAuthorIs), for a name that does not come from the
 *  index -- Open in Browser's check of a Crossref answer (lib/ref-web.ts). */
export function wvRefFirstAuthorIs(raw: any, surname: any): boolean {
    const f = wvRefCompact(surname);
    return f.length >= 2 && firstAuthorIs(dePUA(String(raw || "")), f);
}

/** The entry's first author as authorIn (wvRefMatch) reads it: `cands`, its
 *  first word of two letters or more joined with up to two words after it
 *  (and the next word's, when a given name written out comes first);
 *  `initial`, the entry's very first letter when it stands alone ("M, H. K."
 *  -- `comma` -- or "W. Liwei"); `years`, those the entry writes. */
function leadAuthor(raw: string): { cands: string[]; initial: string; comma: boolean; years: number[] } {
    const t = String(raw || "").replace(LEAD_OFF, "");
    const rx = /[\p{L}\p{M}\p{N}'’]+/gu;
    const toks: Array<{ w: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t)) && toks.length < 16) {
        const w = wvRefCompact(m[0]);
        if (w) toks.push({ w, start: m.index, end: m.index + m[0].length });
    }
    const cands: string[] = [];
    const joins = (from: number) => { let s = ""; for (let j = from; j < toks.length && j < from + 3; j++) { s += toks[j].w; cands.push(s); } };
    const starts = toks.map((x, i) => ((x.w.length >= 2 || CJK_RX.test(x.w)) && !/^\d+$/.test(x.w) ? i : -1)).filter((i) => i >= 0);
    if (starts.length) joins(starts[0]);
    if (starts.length > 1 && starts[1] === starts[0] + 1) joins(starts[1]);
    let initial = "", comma = false;
    if (toks.length && toks[0].w.length === 1 && /^\p{L}$/u.test(toks[0].w) && !CJK_RX.test(toks[0].w)) {
        initial = toks[0].w;
        comma = /^\s*,/.test(t.slice(toks[0].end));
    }
    return { cands, initial, comma, years: wvRefYears(raw).map(Number) };
}

/** `raw` compacted as wvRefCompact does, with each compact character's place
 *  in `raw`; null when the two compactions differ (then no rule needs it). */
function compactMap(raw: string, c: string): number[] | null {
    const pos: number[] = [];
    let i = 0;
    for (const ch of raw) {
        const k = wvRefCompact(ch);
        for (let j = 0; j < k.length; j++) pos.push(i);
        i += ch.length;
    }
    return pos.length === c.length ? pos : null;
}

/** An empty index. */
export function wvRefIndexNew(): WvRefIndex {
    return { items: new Map(), byDOI: new Map(), byTitle: new Map(), byHead: new Map(), byVolPage: new Map(), byYear: new Map(), byAltHead: new Map(), byShortYear: new Map(), byYearForm: new Map(), byYearOther: new Map(), byArxiv: new Map(), seq: 0 };
}

function add(m: Map<string, Set<number>>, k: string, id: number) {
    if (!k) return;
    let s = m.get(k);
    if (!s) { s = new Set(); m.set(k, s); }
    s.add(id);
}
function del(m: Map<string, Set<number>>, k: string, id: number) {
    const s = k ? m.get(k) : null;
    if (!s) return;
    s.delete(id);
    if (!s.size) m.delete(k);
}

/** The Original Date an Extra field gives, or "" (1.3.0-refyear.2), read as Zotero reads
 *  Extra (Zotero.Utilities.Internal.extractExtraFields, _normalizeExtraKey): a "key: value"
 *  line whose key starts the line, the key normalized ("Original Date", "original-date",
 *  "originalDate" all one), the old "{:key: value}" form too, the first one wins. */
function extraOriginalDate(extra: any): string {
    for (const line of String(extra || "").split(/\n/)) {
        const p = line.match(/^([a-z][a-z -_]+):(.+)/i) || line.match(/^{:([a-z -_]+):(.+)}/i);
        if (!p) continue;
        const key = p[1].trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[\s\-_]/g, "-");
        const v = p[2].trim();
        if (key === "original-date" && v) return v;
    }
    return "";
}

/** Does one of the entry's years `ys` fall within one of an item's years (its date's or its
 *  original date's; one off allowed: online or issue year)? */
function yearNear(ys: number[], r: WvRefRec): boolean {
    return r.years.some((y) => ys.some((x) => Math.abs(x - y) <= 1));
}

/** Is one of an item's years exactly one of the entry's `ys`? */
function yearIn(ys: number[], r: WvRefRec): boolean {
    return r.years.some((y) => ys.indexOf(y) >= 0);
}

/** The record an item becomes. */
function recOf(it: WvRefItem): WvRefRec {
    const dois: string[] = [];
    const push = (d: string) => { if (d && dois.indexOf(d) < 0) dois.push(d); };
    push(wvRefCleanDOI(it.DOI));
    for (const m of String(it.extra || "").matchAll(/^\s*DOI:\s*(\S+)/gim)) push(wvRefCleanDOI(m[1]));
    push(wvRefCleanDOI(it.url));
    const ym = String(it.date || "").match(/\d{4}/);
    const vol = wvRefCompact(it.volume);
    const pg = firstPage(it.pages);
    const title = String(it.title || "");
    const ct = wvRefCompact(title);
    // Other forms of the title: without a leading roman numeral (a Phil. Mag.
    // or Proc. R. Soc. article number), without the subtitle.
    const alts: string[] = [];
    const bare = title.replace(/^\s*[IVXLC]{1,7}\.\s+/, "");
    const head = title.split(/\s*[:—–]\s+|\s+-\s+/)[0];
    // Most titles have no numeral and no subtitle: each form is the title itself,
    // compact already (`ct`, never an alternative) -- not normalized three times more
    // (the index build's main-thread time, work/refs-marks-speed-2026-11-21.md).
    for (const t of [bare, head, bare === title ? title : bare.split(/\s*[:—–]\s+|\s+-\s+/)[0]]) {
        if (t === title) continue;
        const a = wvRefCompact(t);
        if (a.length >= MIN_APPROX && a !== ct && alts.indexOf(a) < 0) alts.push(a);
    }
    const first = wvRefCompact(it.first);
    const vps: string[] = [];
    if (vol && pg) vps.push(vol + "|" + pg);
    for (const d of dois) {
        const k = doiVolPage(d);
        if (k && vps.indexOf(k) < 0) vps.push(k);
    }
    // The year in the volume's place: an entry that leaves the volume out
    // ("Proc. R. Soc. A, 2006, 973-999", "Phys. Rev. Lett., 2016, 064501")
    // reads "2006|973" (wvRefVolPages); a first page of three characters or
    // more (the first author and the year are asked as for any key).
    if (ym && pg.length >= 3 && vps.indexOf(ym[0] + "|" + pg) < 0) vps.push(ym[0] + "|" + pg);
    // The original date (1.3.0-refyear.2, MJT 2026-11-26 "Use Original Date"): the field where
    // the item's type has it, else Extra's line -- Zotero's own place for it on a journal
    // article, whose type has no such field. A reprint or a translation is cited by it:
    // Kolmogorov's 1941 Doklady paper, held as its 1991 Proc. R. Soc. A translation.
    const year = ym ? ym[0] : "";
    const om = (String(it.originalDate || "").trim() || extraOriginalDate(it.extra)).match(/\d{4}/);
    const oyear = om && om[0] !== year ? om[0] : "";
    const years = [year, oyear].filter((y) => y).map(Number);
    const type = String(it.itemType || "");
    return {
        id: it.id, lib: it.lib, title, ct,
        dois, cdois: dois.map(wvRefCompact).filter((c) => c.length >= MIN_TITLE),
        first, forms: surnameForms(it.first, first), year, oyear, years,
        vps, pdf: !!it.pdf, alts, ord: 0, cw: titleWeight(ct),
        axs: arxivIdsOf(it, dois), pre: type === "preprint" ? 0 : dois.every((d) => d.startsWith(AX_DOI)) ? 1 : 2, type,
    };
}

/** Particles a surname may start with, which an entry may leave out ("Gans,
 *  B.-J." for de Gans). */
const PARTICLES = new Set(["de", "da", "das", "dos", "du", "di", "del", "della", "der", "den", "van", "von", "le", "la", "ter", "ten", "op"]);

/** The other compact forms of a first author's surname `raw` (compact
 *  `first`), see WvRefRec.forms. */
function surnameForms(raw: any, first: string): string[] {
    const ws = String(raw || "").split(/[^\p{L}\p{M}\p{N}'’]+/u).map(wvRefCompact).filter((w) => w);
    const out: string[] = [];
    const put = (f: string) => { if (f.length >= 3 && f !== first && out.indexOf(f) < 0) out.push(f); };
    if (ws.length >= 2) {
        if (PARTICLES.has(ws[0])) put(ws.slice(1).join(""));
        if (ws[ws.length - 1].length === 1) put(ws.slice(0, -1).join(""));
    }
    // Since 1.2.1-citd.1: an umlaut written out ("Mueller" for Müller), a Cyrillic name in
    // Latin letters ("Fomin I.V." for Фомин: Russian journals print every reference so in a
    // second list, "References").
    const um = String(raw || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
    if (/[äöü]/.test(um.normalize("NFC"))) put(wvRefCompact(um.normalize("NFC").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")));
    // From the name as written: NFKD turns й into и (its breve dropped), ё into е.
    if (/\p{Script=Cyrillic}/u.test(first)) for (const t of translit(um.normalize("NFC").replace(/[^\p{L}]+/gu, ""))) put(t);
    return out;
}

/** The volume + first-page key a DOI spells out, or "": Physical Review's
 *  "10.1103/physrevlett.105.168101" (105|168101), IOP's and EPL's
 *  "10.1088/0034-4885/71/3/036601" and "10.1209/0295-5075/93/28008"
 *  (71|036601, 93|28008). */
function doiVolPage(d: string): string {
    let m = d.match(/^10\.1103\/(?:physrev[a-z]*|revmodphys)\.(\d{1,4})\.([a-z]?\d{2,7})$/);
    if (m) return m[1] + "|" + m[2];
    m = d.match(/^10\.(?:1088|1209)\/\d{4}-\d{3}[\dx]\/(\d{1,4})\/(?:\d{1,3}\/)?([a-z]?\d{1,7})$/);
    return m ? m[1] + "|" + m[2] : "";
}

/** A title shorter than MIN_TITLE that is still looked for (by its first
 *  author and its year, as a phrase of its own): "Fast R-CNN". */
const MIN_SHORT = 5;

function keysOf(r: WvRefRec): Array<[keyof WvRefIndex, string]> {
    const k: Array<[keyof WvRefIndex, string]> = [];
    for (const d of r.dois) k.push(["byDOI", d]);
    if (r.ct.length >= MIN_TITLE) { k.push(["byTitle", r.ct]); k.push(["byHead", r.ct.slice(0, HEAD)]); }
    for (const c of r.cdois) k.push(["byHead", c.slice(0, HEAD)]);
    for (const v of r.vps) k.push(["byVolPage", v]);
    for (const a of r.alts) k.push(["byAltHead", a.slice(0, HEAD)]);
    // Under the original date's year too (1.3.0-refyear.2): the year-keyed steps (an
    // approximate title, a short title) find a reprint by the year it is cited by.
    for (const y of [r.year, r.oyear]) {
        if (!y) continue;
        k.push(["byYear", y]);
        if (r.ct.length >= MIN_SHORT && r.ct.length < MIN_TITLE) k.push(["byShortYear", y]);
        if (r.first.length >= 2 && r.ct.length >= MIN_APPROX && !isSeriesPart(r.title)) {
            let other = false;
            for (const f of nameForms(r.first)) {
                if (otherScript(f)) other = true;
                else k.push(["byYearForm", y + "|" + f]);
            }
            if (other) k.push(["byYearOther", y]);
        }
    }
    for (const a of r.axs) k.push(["byArxiv", a]);
    return k;
}

/** Add or replace an item. */
export function wvRefIndexPut(ix: WvRefIndex, it: WvRefItem) {
    if (!it || typeof it.id !== "number") return;
    wvRefIndexDrop(ix, it.id);
    const r = recOf(it);
    ix.items.set(r.id, r);
    for (const [m, k] of keysOf(r)) add(ix[m] as Map<string, Set<number>>, k, r.id);
    ix.seq++;
    r.ord = ix.seq;
}

/** Remove an item; false when it was not there. */
export function wvRefIndexDrop(ix: WvRefIndex, id: number): boolean {
    const r = ix.items.get(id);
    if (!r) return false;
    for (const [m, k] of keysOf(r)) del(ix[m] as Map<string, Set<number>>, k, id);
    ix.items.delete(id);
    ix.seq++;
    return true;
}

/** What the index knows of an item, or null. */
export function wvRefIndexGet(ix: WvRefIndex, id: number): { id: number; lib: number; title: string; ct: string; dois: string[]; first: string; year: string; oyear: string; pdf: boolean; axs: string[]; type: string } | null {
    const r = ix.items.get(id);
    return r ? { id: r.id, lib: r.lib, title: r.title, ct: r.ct, dois: r.dois.slice(), first: r.first, year: r.year, oyear: r.oyear, pdf: r.pdf, axs: r.axs.slice(), type: r.type } : null;
}

/** The self-match guard of an item of the index: its id, DOIs, title and arXiv identifiers. */
export function wvRefSelfOf(ix: WvRefIndex, ids: number[]): WvRefSelf {
    const self: WvRefSelf = { ids: ids.slice(), dois: [], cts: [], axs: [] };
    for (const id of ids) {
        const r = ix.items.get(id);
        if (!r) continue;
        for (const d of r.dois) if (self.dois.indexOf(d) < 0) self.dois.push(d);
        if (r.ct.length >= MIN_TITLE && self.cts.indexOf(r.ct) < 0) self.cts.push(r.ct);
        for (const a of r.axs) if (self.axs.indexOf(a) < 0) self.axs.push(a);
    }
    return self;
}

/** Edit distance of `p` to its best-matching substring of `t` (Sellers), or
 *  `max + 1` when it is more than `max`. */
export function wvRefApproxDistance(p: string, t: string, max: number): number {
    const m = p.length, n = t.length;
    if (!m) return 0;
    if (m - max > n) return max + 1;
    // Column by column over the text: col[i] = the distance of p[0..i) to the
    // best substring of t ending at j (a substring may start anywhere: row 0 is 0).
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
    for (let i = 0; i <= m; i++) prev[i] = i;
    let best = prev[m];
    for (let j = 1; j <= n; j++) {
        cur[0] = 0;
        const tc = t.charCodeAt(j - 1);
        for (let i = 1; i <= m; i++) {
            const sub = prev[i - 1] + (p.charCodeAt(i - 1) === tc ? 0 : 1);
            const ins = prev[i] + 1;
            const dl = cur[i - 1] + 1;
            cur[i] = sub < ins ? (sub < dl ? sub : dl) : (ins < dl ? ins : dl);
        }
        if (cur[m] < best) best = cur[m];
        if (best === 0) return 0;
        const sw = prev; prev = cur; cur = sw;
    }
    return best <= max ? best : max + 1;
}

/** Adobe's private-use small capitals and old-style figures (U+F761-F77A
 *  a-z, U+F730-F739 0-9) as the letters and digits they draw: old JFM PDFs
 *  set authors' names so, and a popup's text comes from Zotero as it is. */
function dePUA(s: string): string {
    return s.replace(/[\uf730-\uf739\uf761-\uf77a]/g, (c) => {
        const k = c.charCodeAt(0);
        return String.fromCharCode(k >= 0xf761 ? k - 0xf761 + 97 : k - 0xf730 + 48);
    });
}

/** Find the item `text` (one reference, as written) names. Null when none. */
export function wvRefMatch(ix: WvRefIndex, text: any, self?: WvRefSelf): WvRefMatch | null {
    const raw = dePUA(String(text || ""));
    const c = wvRefCompact(raw);
    if (c.length < MIN_TITLE) return null;
    const sIds = new Set(self && self.ids || []);
    const sDois = new Set(self && self.dois || []);
    const sCts = new Set(self && self.cts || []);
    const sAxs = new Set(self && self.axs || []);
    const excluded = (r: WvRefRec) => sIds.has(r.id) || r.dois.some((d) => sDois.has(d)) || (!!r.ct && sCts.has(r.ct)) || r.axs.some((a) => sAxs.has(a));
    // The entry's words, all of them and those of its first characters: a
    // surname is looked for as a word (1.2.1-refs.7; see hasSurname).
    const ws = wordsOf(raw);
    const leadWs = wordsOf(raw.slice(0, LEAD));
    const rec = (id: number) => ix.items.get(id);
    // A DOI match names its item only when the entry also has the item's
    // first author or its year (one off allowed: online / issue year), outside
    // the DOIs and links themselves: the Antiquity paper of the test library
    // prints Friesem et al. 2019's DOI under Finlayson & Mithen 2007, and
    // 1.2.1-refs.6 marked that entry as Friesem's paper. An item with neither
    // a first author nor a year is taken on its DOI alone.
    // Since 1.3.0-refkeys.1 the arXiv identifiers out too: "arXiv:2001.01234" (January
    // 2020) would read as the year 2001.
    let plain: { ws: string[]; years: number[] } | null = null;
    const plainOf = (): { ws: string[]; years: number[] } => {
        if (!plain) {
            const t = raw.replace(/\bhttps?:\/\/\S+/gi, " ").replace(DOI_RX, " ").replace(AX_RX, " ");
            plain = { ws: wordsOf(t), years: wvRefYears(t).map(Number) };
        }
        return plain;
    };
    const doiNames = (r: WvRefRec) => {
        if (!r.first || !r.years.length) return true;
        const p = plainOf();
        if (hasSurname(p.ws, r.first, r.forms)) return true;
        return yearNear(p.years, r);
    };
    // The evidence that tells candidates of one step apart (1.3.0-refkeys.1), in whole
    // points: the entry's first author the item's (2); the item's year in the entry (2),
    // one off (1). Steps 1 and 1b read the years outside the links and identifiers.
    // The item's years are its date's and its original date's (1.3.0-refyear.2: yearIn /
    // yearNear); named yearPts, the module's yearIn being refyear's (ys, r) test.
    const firstEv = (r: WvRefRec) => (r.first && firstAuthorIs(raw, r.first, r.forms) ? 2 : 0);
    const yearPts = (r: WvRefRec, years: number[]) => (!r.years.length ? 0 : yearIn(years, r) ? 2 : yearNear(years, r) ? 1 : 0);
    // What an identifier names (steps 1 and 1b), `cands` its items in the index's order:
    // ONE work -- its copies (copiesOf), led for an arXiv identifier by the record it
    // names best (`pre`: the preprint before a journal version whose Extra carries it) --
    // unless two DIFFERENT works carry it (otherWork: a book and a chapter given the
    // book's DOI). Then the evidence picks, its tie is ambiguous, and no other work's item
    // passes for a copy of the one taken.
    const idHit = (cands: WvRefRec[], how: WvRefHow): WvRefMatch => {
        const works: WvRefRec[][] = [];
        for (const r of cands) {
            const w = works.find((g) => !g.some((o) => otherWork(o, r)));
            if (w) w.push(r); else works.push([r]);
        }
        const leads = works.map((g) => (how === "arxiv" ? g.slice().sort((a, b) => a.pre - b.pre)[0] : g[0]));
        if (leads.length === 1) return { ids: copiesOf(ix, leads[0], excluded), how };
        const years = plainOf().years;
        const ev = leads.map((r) => firstEv(r) + yearPts(r, years));
        const top = Math.max(...ev);
        const at = ev.indexOf(top);
        const tied = leads.filter((r, k) => ev[k] === top);
        const others = new Set<number>();
        works.forEach((g, k) => { if (k !== at) for (const r of g) others.add(r.id); });
        const ids = copiesOf(ix, leads[at], excluded).filter((id) => !others.has(id));
        return tied.length > 1 ? { ids, how, ambiguous: tied.slice(0, AMBIG_MAX).map((r) => r.id) } : { ids, how };
    };

    // 1. A DOI written in the entry -- an arXiv one last (1.3.0-refkeys.1): an entry
    //    that writes its journal version's DOI beside its preprint's cites the journal
    //    version. Never ambiguous, unless two different works carry the DOI (idHit).
    //    wholeDOIs (in the entry's order) also serves step 2's componentOf (1.3.0-refyear.1).
    const wholeDOIs = wvRefDOIs(raw);
    const dois = wholeDOIs.slice().sort((a, b) => (a.startsWith(AX_DOI) ? 1 : 0) - (b.startsWith(AX_DOI) ? 1 : 0));
    for (const d of dois) {
        const cands: WvRefRec[] = [];
        for (const id of ix.byDOI.get(d) || []) {
            const r = rec(id);
            if (r && !excluded(r) && doiNames(r)) cands.push(r);
        }
        if (cands.length) return idHit(cands, "doi");
    }

    // 1b. An arXiv identifier written in the entry (1.3.0-refkeys.1, 2026-11-24; the
    //     matcher had none: a physics list often cites a preprint by it alone, "P.
    //     Lewin-Jones and J. Sprittles, arXiv:2101.12345"). Named as a DOI names its item
    //     -- with the item's first author or year in the entry (doiNames). When the
    //     library holds the preprint AND its journal version (the same title, often the
    //     identifier in the journal item's Extra), the entry's identifier names the
    //     PREPRINT: it is what the entry cites; an entry that also writes the journal's
    //     DOI was answered by step 1. Never ambiguous, unless two different works carry
    //     the identifier.
    for (const a of wvRefArxivIds(raw)) {
        const cands: WvRefRec[] = [];
        for (const id of ix.byArxiv.get(a) || []) {
            const r = rec(id);
            if (r && !excluded(r) && doiNames(r)) cands.push(r);
        }
        if (cands.length) return idHit(cands, "arxiv");
    }

    // 2. A DOI split by the layout ("10.1017/jfm. 2017.424"), or the longest
    //    title contained in the entry -- one head lookup per position.
    //    Not a DOI the entry writes whole that goes on past the item's ("<item
    //    DOI>." and more): that names a component of the work, not the work --
    //    AIP registers a paper's supplementary files as "10.1063/5.0129427.8"
    //    (Crossref type "dataset"), and the compact DOIs compared here made such
    //    an entry the paper itself (MJT 2026-11-26, 1.3.0-refyear.1).
    const componentOf = (r: WvRefRec) => wholeDOIs.some((d) => r.dois.some((x) => d.startsWith(x + ".")));
    const titles: Array<{ r: WvRefRec; i: number }> = [];
    // Items a title found inside the entry was refused for: the approximate
    // rule (step 4) would find the same text again and must not take them.
    const refused = new Set<number>();
    // Is an item's first author anywhere in the entry -- a word of it, or near
    // its start one or two letters off (OCR: "LONGUET-HIQGINMS" for
    // Longuet-Higgins)? A title alone is not enough when it is not: the
    // survey's old JFM lists cite "ABRAMOWITZ, M. & STEGUN, I. A. 1972
    // Handbook of Mathematical Functions", and the library also holds a 2001
    // chapter by Boisvert with exactly that title. An item without a first
    // author (or one of two letters) is not asked.
    let leadC: string | null = null;
    let lead: { cands: string[]; initial: string; comma: boolean; years: number[] } | null = null;
    const authorIn = (r: WvRefRec): boolean => {
        const first = r.first;
        // A CJK surname is one or two characters: asked all the same (1.2.1-citd.1).
        if (!first || (first.length < 3 && !CJK_RX.test(first)) || hasSurname(ws, first, r.forms)) return true;
        if (!lead) lead = leadAuthor(raw);
        // A surname the item writes in full: "de La Mora" (Fernández de la
        // Mora), "Wal" (Vander Wal), "VEEN" (van der Veen), "Rayleigh, Lord",
        // "VAND m" (OCR of VAN DYKE).
        if (lead.cands.some((w) => (w.length >= 3 && first.endsWith(w)) || (w.length >= 4 && first.startsWith(w)))) return true;
        // OCR one letter in four off: "LONQUET-HIQQINMS" for Longuet-Higgins.
        const max = first.length >= 10 ? Math.floor(first.length / 3.5) : first.length >= 7 ? 2 : first.length >= 4 ? 1 : 0;
        if (max) {
            if (leadC === null) leadC = wvRefCompact(raw.slice(0, 160));
            if (wvRefApproxDistance(first, leadC, max) <= max) return true;
        }
        // Its first letter alone, the year the item's: an old JFM scan's small
        // capitals cut to one letter ("M, H. K. 1964 Viscous and resistive
        // eddies ..." for Moffatt), and -- with the exact year and a long
        // title -- a name written given name first ("W. Liwei, W. Xiao, ..."
        // for Wang Liwei).
        if (lead.initial && lead.initial === first[0] && r.years.length) {
            if (lead.comma && yearNear(lead.years, r)) return true;
            if (!lead.comma && r.ct.length >= 40 && yearIn(lead.years, r)) return true;
        }
        // A name the library writes in another script than the entry (1.2.1-citd.1): Crossref
        // gives Japanese and Korean authors romanized ("Nakaya", "YAMANAKA", "Choi") whose
        // papers' lists print them in kanji or Hangul ("中谷 友樹", "山中英生", "최정아"), and
        // a Russian work cited in Latin letters ("Fomin I.V.") is "Фомин" in a library. The
        // name cannot be compared: a title that is no short one (titleWeight) with the
        // item's year (one off allowed) names it.
        if (r.years.length && r.cw >= SHORT_TITLE && crossScript(r) && yearNear(lead.years, r)) return true;
        return false;
    };
    // The entry's first name and the item's first author in different scripts.
    let leadScript: string | null = null;
    const crossScript = (r: WvRefRec): boolean => {
        if (!r.first) return false;
        if (leadScript === null) { if (!lead) lead = leadAuthor(raw); leadScript = lead.cands.length ? scriptOf(lead.cands[0]) : ""; }
        const s = scriptOf(r.first);
        return !!s && !!leadScript && s !== leadScript;
    };
    const entryYears = wvRefYears(raw).map(Number);
    const exactYear = (r: WvRefRec) => yearIn(entryYears, r);
    const yearEv = (r: WvRefRec) => yearPts(r, entryYears);
    // Titles the entry stops inside of (see 2c below).
    const cut: WvRefRec[] = [];
    // A book the entry names as the one its chapter is in (step 2).
    let inBookHit: WvRefRec | null = null;
    // A title whose volume and page the entry contradicts (step 2): kept unless another fits.
    let vpOff: WvRefRec | null = null;
    // Does the entry print the item's volume and page (1), other pages only (-1), or can
    // it not tell -- no key on one side or the other (0)?
    let evp: string[] | null = null;
    const vpFit = (r: WvRefRec): number => {
        if (!r.vps.length) return 0;
        // Not where the citing work cites it: a thesis's "(p. 115, 184)", amsalpha's "↑249, 255".
        if (evp === null) evp = wvRefVolPages(raw.replace(BACKREF_RX, " "));
        const e = evp;
        if (!e.length) return 0;
        if (r.vps.some((k) => e.indexOf(k) >= 0)) return 1;
        const pages = e.map((k) => k.split("|")[1]);
        // A range whose dash went with a line break: Zotero's text of "27(5):1047- 53" is
        // "27(5):104753" (the r5 set's French paper, Wild et al. 2004).
        const fits = (p: string) => pages.some((q) => q === p || (/^\d+$/.test(q) && q.length > p.length && q.length <= p.length + 4 && q.startsWith(p)));
        return r.vps.some((k) => fits(k.split("|")[1])) ? 1 : -1;
    };
    for (let i = 0; i + MIN_TITLE <= c.length; i++) {
        const ids = ix.byHead.get(c.substr(i, HEAD));
        if (!ids) continue;
        for (const id of ids) {
            const r = rec(id);
            if (!r || excluded(r)) continue;
            if (r.cdois.some((cd) => c.startsWith(cd, i)) && doiNames(r) && !componentOf(r)) return { ids: copiesOf(ix, r, excluded), how: "doi" };
            if (r.ct.length < MIN_TITLE) continue;
            if (!c.startsWith(r.ct, i)) {
                if (c.length - i >= CUT_TITLE && r.ct.length > c.length - i && r.ct.startsWith(c.slice(i))) cut.push(r);
                continue;
            }
            // A short title needs its first author as a word; since 1.2.1-
            // refsacc.1 also as OCR spelt it, with the item's year exactly
            // ("PROSPEREAT.,TIC,RUM, L. A. ... 1989 The underwater noise of
            // rain", an old JFM scan).
            // Since 1.2.1-citd.1 a short title of three words or more of an item with no
            // creator, its exact year in the entry: a law report ("See Marbury v. Madison, 5
            // U.S. (1 Cranch) 137, 163 (1803)", "Ewert v Canada, 2018 SCC 30").
            if (r.cw < SHORT_TITLE && !hasSurname(ws, r.first, r.forms) && !(exactYear(r) && firstAuthorNear(raw, r.first, r.forms))
                && !(!r.first && exactYear(r) && wordsOf(r.title).length >= 3)) continue;
            titles.push({ r, i });
        }
    }
    if (titles.length) {
        // The longest first; a title the entry's own goes on past (a colon or
        // a dash and more words: "Highly focused supersonic microjets:
        // Numerical simulations" holds "Highly Focused Supersonic Microjets")
        // names the item only when its first author is the entry's.
        // Likewise a title inside a longer phrase -- a word right before it
        // ("Gas-assisted droplet impact on a solid surface" holds "Droplet
        // Impact on a Solid Surface"), or more words right after it
        // ("Experimental investigation of water droplet impact ..." holds
        // the title "Experimental investigation"): found on the 2026-11-20
        // survey's lists, once refs.7 read more of them.
        titles.sort((a, b) => b.r.ct.length - a.r.ct.length);
        let pos: number[] | null | undefined;
        // The checks a title found inside the entry passes -- one function since
        // 1.3.0-refkeys.1, so that the titles as long as the winner's are asked the same
        // (titleWin): "refuse" (the item never names this entry, nor may the approximate
        // step take it), "book" (the book a chapter is in), else the entry's volume-and-
        // page fit (vpFit). No side effect: the loop below keeps what each answer means.
        const judge = (r: WvRefRec, i: number): "refuse" | "book" | number => {
            if (pos === undefined) pos = compactMap(raw, c);
            let inside = false;
            if (pos) {
                const start = pos[i], end = pos[i + r.ct.length - 1] + 1;
                const after = raw.slice(end, end + 30);
                const before = raw.slice(Math.max(0, start - 30), start);
                inside = /^[”"’'»]?\s*(?:[:–—]|\s-)\s*[\p{L}\d]/u.test(after) || /^[\p{L}\d]|^\s+\p{Ll}/u.test(after) || /\p{L}\s*$/u.test(before);
            }
            // The book or volume a chapter is in (1.2.1-citd.1): a title after "In" / "in" /
            // "dans" / "En" opening a part of the entry, its editors between ("MARCHETTI,
            // Chiara. The expanded border. ... In GEIGER, Martin; PÉCOUD, Antoine (eds.). The
            // politics of international migration management", "Gelichi, ..., History of a
            // forgotten town ..., in From one sea to another ..." -- the r5 set's Italian
            // papers). The chapter when the library holds it (any rule below), else the book
            // (Rahner's essays "in Faith in a Wintry Season", a handbook's chapter: the book
            // is what a library holds of them).
            const inBook = !!pos && pos[i] >= 20 && CONTAINER_BEFORE.test(raw.slice(Math.max(0, pos[i] - 160), pos[i]));
            const firstIs = firstAuthorIs(raw, r.first, r.forms);
            if (inside && !firstIs) return "refuse";
            // The entry names another part of the same series (1.2.1-refs.8).
            const numeral = !!pos && SERIES_AFTER.test(raw.slice(pos[i + r.ct.length - 1] + 1, pos[i + r.ct.length - 1] + 31));
            if (inside && numeral) return "refuse";
            // Since 1.2.1-refsacc.1, where both sides write a year and none of
            // the entry's is within one of the item's: not a title inside a
            // longer one (the r4 books: "ICASE/LaRC Workshop Benchmark
            // Problems in Computational Aeroacoustics (CAA)", 1995, for Hardin
            // 1993 "Computational Aeroacoustics"), not a title by a co-author
            // ("L. Evans and S. Michizono, The International Linear Collider
            // Machine Staging Report, November 2017" for Michizono 2019 "The
            // International Linear Collider": the item's first author a word
            // of the entry, not its first one -- an OCR'd first author,
            // "BATCHELOGR,. K. 1967" for the 2000 edition, is not asked), not
            // a title the entry follows with a part's numeral the item's title
            // lacks ("... on Unstructured Grids III: Extension to
            // One-Dimensional Systems ... 2004" for the 2002 part II item,
            // whose title carries no "II"). A book's other edition, its title
            // alone, stays its own.
            const coauthor = !firstIs && hasSurname(ws, r.first, r.forms);
            if ((inside || coauthor || numeral) && r.years.length && entryYears.length && !yearNear(entryYears, r)) return "refuse";
            if (numeral && !r.years.length) return "refuse";
            if (numeral && !entryYears.length) return "refuse";
            // A title another work also bears: the item's first author is not
            // in the entry at all (1.2.1-refs.8).
            if (!authorIn(r)) return "refuse";
            // Volume and page as evidence between titles (1.2.1-citd.1): a short title found
            // inside a longer one, the entry's pages and the item's disagreeing, is another
            // work ("Sørensen K, Brand H (2014) Health literacy lost in translations? ...
            // Health Promot Int 29:634-644" is no 2015 encyclopedia entry "Health Literacy",
            // pp. 653-656, the r5 set's German paper); and of two titles, the one whose volume
            // and page the entry prints wins over a longer one whose do not (Wild et al. 2004,
            // Diabetes Care 27(5):1047, whose authors' reply 27(10):2569 bears the full printed
            // title, the paper's Crossref record only its head).
            const vp = vpFit(r);
            // A journal article's exact title across the years (1.3.0-refyear.1): where both
            // sides write a year and none of the entry's is within one of the item's, an item
            // with a volume and a first page (a periodical piece, not a book) is another work
            // unless the entry prints that volume and page -- a talk, a preprint or a report
            // under the same title. MJT 2026-11-26: Schmid 2022 (Annu. Rev. Fluid Mech. 54)
            // cites "Schmid PJ, Sesterhenn JL. 2008. Dynamic mode decomposition of numerical and
            // experimental data. Paper presented at 61st Annual Meeting of the APS Division of
            // Fluid Dynamics", marked as Schmid's 2010 J. Fluid Mech. 656:5-28 paper of that
            // title. A book's other edition (no volume and page) stays its own, as above; so does
            // an entry that calls itself an earlier version of the paper (EARLIER_VERSION_RX: the
            // library survey's "J. Fluid Mech. (submitted)" 1990 for Jiang et al. 1992,
            // "Harvard University preprint" 1997 for Stone et al. 1999, "arXiv:2012.10433
            // (2021)" for Shah & Driscoll 2024).
            if (r.years.length && r.vps.length && vp !== 1 && entryYears.length && !yearNear(entryYears, r)
                && !EARLIER_VERSION_RX.test(raw)) return "refuse";
            if (vp < 0 && inside && r.cw < SHORT_TITLE) return "refuse";
            if (inBook) return "book";
            return vp;
        };
        // Of the titles as long as the winner's -- the step's own order is the longest
        // title the entry holds -- another WORK (not a copy: copiesOf) that passes the same
        // checks with the same evidence makes the answer ambiguous; one with more evidence
        // is the answer (1.3.0-refkeys.1, 2026-11-24: a conference paper and its journal
        // version a year apart, one title, the entry's year the journal's -- until then the
        // first in the index's order won). The evidence: yearEv, firstEv, and 1 for the
        // entry's volume and page (vpFit). A title the entry's volume and page contradict
        // (vp < 0) is no rival: the loop keeps it for when nothing else fits (vpOff).
        const titleWin = (r0: WvRefRec, v0: number): WvRefMatch => {
            const evOf = (x: WvRefRec, vp: number) => yearEv(x) + firstEv(x) + (vp > 0 ? 1 : 0);
            let best = r0, top = evOf(r0, v0);
            let tied: WvRefRec[] = [r0];
            const seen = new Set<number>(copiesOf(ix, r0, excluded));
            for (const { r, i } of titles) {
                if (r.ct.length !== r0.ct.length || seen.has(r.id)) continue;
                const v = judge(r, i);
                if (typeof v !== "number" || v < 0) continue;
                for (const id of copiesOf(ix, r, excluded)) seen.add(id);
                const e = evOf(r, v);
                if (e > top) { best = r; top = e; tied = [r]; }
                else if (e === top) tied.push(r);
            }
            const ids = copiesOf(ix, best, excluded);
            return tied.length > 1 ? { ids, how: "title", ambiguous: tied.slice(0, AMBIG_MAX).map((x) => x.id) } : { ids, how: "title" };
        };
        for (const { r, i } of titles) {
            const v = judge(r, i);
            if (v === "refuse") { refused.add(r.id); continue; }
            if (v === "book") { if (!inBookHit) inBookHit = r; refused.add(r.id); continue; }
            if (v < 0) { if (!vpOff) vpOff = r; continue; }
            if (vpOff && v === 0) return { ids: copiesOf(ix, vpOff, excluded), how: "title" };
            return titleWin(r, v);
        }
        if (vpOff) return { ids: copiesOf(ix, vpOff, excluded), how: "title" };
    }
    const rest = matchRest();
    if (rest) return rest;
    return inBookHit ? { ids: copiesOf(ix, inBookHit, excluded), how: "title" } : null;
    // Steps 2b to 5: the rules after the titles found whole (a function, so that a book a
    // chapter is in -- inBookHit -- is the answer only when none of them finds one).
    function matchRest(): WvRefMatch | null {

    // 2b. Another form of an item's title (1.2.1-refs.8; see WvRefRec.alts):
    //     r3's "Berg, J.C., 2009. An Introduction To Interfaces and Colloids."
    //     for the item with the subtitle; "Rayleigh L. On the capillary
    //     phenomena of jets ... (1879)" for "VI. On the capillary phenomena of
    //     jets". Only by the entry's first author, of the year the entry
    //     writes (Benard's 1900 and 1901 papers share a main title), the form
    //     ending where the entry's title does (not "Evaporation of pinned
    //     sessile microdroplets of water on a highly heat-conductive
    //     substrate" for "... of Water: Computer Simulations"), never a part
    //     of a series ("... by Collection: Part III" is not Part I).
    let pos: number[] | null | undefined;
    for (let i = 0; i + MIN_APPROX <= c.length; i++) {
        const ids = ix.byAltHead.get(c.substr(i, HEAD));
        if (!ids) continue;
        for (const id of ids) {
            const r = rec(id);
            if (!r || excluded(r) || refused.has(r.id) || isSeriesPart(r.title)) continue;
            const a = r.alts.find((x) => c.startsWith(x, i));
            if (!a || !firstAuthorIs(raw, r.first, r.forms) || !yearIn(entryYears, r)) continue;
            if (pos === undefined) pos = compactMap(raw, c);
            if (!pos) continue;
            const after = raw.slice(pos[i + a.length - 1] + 1, pos[i + a.length - 1] + 31);
            if (/^[\p{L}\d]|^\s+[\p{L}\d]|^[”"’'»]?\s*(?:[:–—]|\s-)\s*[\p{L}\d]/u.test(after) && !/^[”"’'»]?\s*[.,;]/u.test(after)) continue;
            if (SERIES_AFTER.test(after)) continue;
            // The book a chapter is in (step 2, inBookHit): the chapter first, if a rule below finds it.
            if (pos[i] >= 20 && CONTAINER_BEFORE.test(raw.slice(Math.max(0, pos[i] - 160), pos[i]))) { if (!inBookHit) inBookHit = r; refused.add(r.id); continue; }
            return { ids: copiesOf(ix, r, excluded), how: "title" };
        }
    }

    // 2c. A title the entry stops inside of (1.2.1-refsacc.1): an old JFM
    //     scan whose OCR reads a list column by column keeps each entry's
    //     first line alone (ref-list.ts authorYearIn), "BRAZIER-SMITPH.,R.,
    //     JENNINS.OGS. ,& LATHAMJ,. 1972 The interaction of falling water
    //     drops:" for "... drops: coalescence". At least CUT_TITLE compact
    //     characters of the title, up to the entry's very end; by the entry's
    //     first author (as OCR spelt it), of the item's year exactly; never a
    //     part of a series; and only when one work fits.
    let cutHit: WvRefRec | null = null;
    for (const r of cut) {
        if (refused.has(r.id) || isSeriesPart(r.title) || !exactYear(r) || !firstAuthorNear(raw, r.first, r.forms)) continue;
        if (cutHit && cutHit.id !== r.id && copiesOf(ix, cutHit, excluded).indexOf(r.id) < 0) { cutHit = null; break; }
        if (!cutHit) cutHit = r;
    }
    if (cutHit) return { ids: copiesOf(ix, cutHit, excluded), how: "title" };

    // 3. Volume + first page, by the entry's first author, the year agreeing
    //    (one off allowed) when the entry writes one. Since 1.2.1-refs.7 the
    //    first author, not any author near the start, and the year: more
    //    pairs are read (wvRefVolPages), and the survey's lists gave "Weiss
    //    K, Khoshgoftaar T M, Wang D D. ... 2016, 3(1): 1-40" for Wang 2016,
    //    volume 3, page 1, and "Kumar S 2006 ... 27 1-2" for Kumar 2016.
    //    Since 1.2.1-refsacc.1, with the item's year exactly in the entry,
    //    also a first author OCR or a typist misspelt (firstAuthorNear: the
    //    survey's "Barlett, P. ... (2012), Phys. Rev. E 85, 021404" for
    //    Bartlett, "Scardiovelli A and Zaleski S 1999 Annu. Rev. Fluid Mech.
    //    31 567", an old J. Colloid Interface Sci. scan's "]~URRILL, K. A."),
    //    a surname without its particle or its trailing initial (forms), and
    //    an item with no creator at all, its first page of three characters
    //    or more ("Taylor G I 1950 Proc. R. Soc. Lond. A 201 192-6": the
    //    library's record of Taylor 1950 lists no author).
    //    Since 1.3.0-refkeys.1 every key's items are asked, not the first that passes: of
    //    two works by the entry's first author with that volume and page, the one with the
    //    entry's year wins (yearEv, firstEv), and a tie is ambiguous.
    const ys = wvRefYears(raw).map(Number);
    let vpBest: WvRefRec | null = null;
    let vpTop = -1;
    let vpTied: WvRefRec[] = [];
    const vpSeen = new Set<number>();
    for (const k of wvRefVolPages(raw)) {
        for (const id of ix.byVolPage.get(k) || []) {
            const r = rec(id);
            if (!r || excluded(r) || vpSeen.has(r.id)) continue;
            const exact = yearIn(ys, r);
            // A CJK surname of one character is a name too (1.2.1-citd.1). Not a name in
            // another script: on the 2026-11-20 survey of MJT's library, "H. Duan, ..., Aerosol
            // Science and Technology 2016, 50, 1" took a Chinese item by 林 of that year,
            // volume and page.
            if (r.first.length >= 2 || CJK_RX.test(r.first)) {
                if (!firstAuthorIs(raw, r.first, r.forms) && !(exact && firstAuthorNear(raw, r.first, r.forms))) continue;
                if (r.years.length && ys.length && !yearNear(ys, r)) continue;
            }
            else if (r.first || !exact || k.split("|")[1].length < 3) continue;
            for (const x of copiesOf(ix, r, excluded)) vpSeen.add(x);
            const e = yearEv(r) + firstEv(r);
            if (e > vpTop) { vpBest = r; vpTop = e; vpTied = [r]; }
            else if (e === vpTop) vpTied.push(r);
        }
    }
    if (vpBest) {
        const ids = copiesOf(ix, vpBest, excluded);
        return vpTied.length > 1 ? { ids, how: "volpage", ambiguous: vpTied.slice(0, AMBIG_MAX).map((x) => x.id) } : { ids, how: "volpage" };
    }

    // 4. An approximate title, the first author and the year agreeing.
    //    The lead's words joined 1 to 4 at a time, once per entry: hasSurname1's
    //    candidates as a set, asked for every item of the year -- the same answer
    //    (all 100,331 entries of 981 of MJT's texts), the matching 17.5 % faster
    //    (citedby plan §13: step 4 was most of the Cited by pass).
    const leadRuns = new Set<string>();
    for (let i = 0; i < leadWs.length; i++) {
        let x = "";
        for (let j = i; j < leadWs.length && j < i + 4; j++) { x += leadWs[j]; leadRuns.add(x); }
    }
    const leadHas = (first: string) => {
        for (const f of nameForms(first)) {
            if (otherScript(f)) { if (leadWs.some((w) => w.indexOf(f) >= 0)) return true; }
            else if (leadRuns.has(f)) return true;
        }
        return false;
    };
    let bestA: WvRefRec | null = null;
    let bestErr = 1;
    // Every candidate within the step's tolerance, for the tie (APPROX_TIE).
    const approx: Array<{ r: WvRefRec; err: number }> = [];
    for (const y of wvRefYears(raw)) {
        // The year's items whose first author is one of the lead's runs (byYearForm),
        // and those written in another script, asked as before -- in the year's own
        // order (`ord`), so a tie goes where it always went.
        const cand = new Set<number>();
        for (const s of leadRuns) for (const id of ix.byYearForm.get(y + "|" + s) || []) cand.add(id);
        for (const id of ix.byYearOther.get(y) || []) { const r = rec(id); if (r && leadHas(r.first)) cand.add(id); }
        if (!cand.size) continue;
        const ordered = Array.from(cand).map((id) => rec(id)).filter((r): r is WvRefRec => !!r).sort((a, b) => a.ord - b.ord);
        for (const r of ordered) {
            if (excluded(r) || refused.has(r.id)) continue;
            const max = Math.floor(r.ct.length * APPROX_ERR);
            const d = wvRefApproxDistance(r.ct, c, max);
            if (d > max) continue;
            const err = d / r.ct.length;
            approx.push({ r, err });
            if (!bestA || err < bestErr || (err === bestErr && r.ct.length > bestA.ct.length)) { bestA = r; bestErr = err; }
        }
    }
    if (bestA) {
        // Other works within APPROX_TIE of the best's share of wrong characters: a tie,
        // the best first, then by their share (1.3.0-refkeys.1).
        const a0: WvRefRec = bestA;
        const ids = copiesOf(ix, a0, excluded);
        const seen = new Set<number>(ids);
        const tied: WvRefRec[] = [a0];
        for (const x of approx.slice().sort((p, q) => p.err - q.err)) {
            if (seen.has(x.r.id) || x.err - bestErr > APPROX_TIE) continue;
            for (const id of copiesOf(ix, x.r, excluded)) seen.add(id);
            tied.push(x.r);
        }
        return tied.length > 1 ? { ids, how: "approx", ambiguous: tied.slice(0, AMBIG_MAX).map((x) => x.id) } : { ids, how: "approx" };
    }

    // 5. A title of 5 to 9 letters and digits (1.2.1-refs.8; r3's "[23] Ross
    //    Girshick. Fast R-CNN. In ICCV, 2015."): by the entry's first author,
    //    of the year the entry writes, and as a phrase of its own -- after a
    //    period, a comma or a quote and followed by one (not "Faster R-CNN").
    let pos2: number[] | null | undefined;
    for (const y of new Set(entryYears)) {
        for (const id of ix.byShortYear.get(String(y)) || []) {
            const r = rec(id);
            if (!r || excluded(r) || !firstAuthorIs(raw, r.first, r.forms)) continue;
            if (pos2 === undefined) pos2 = compactMap(raw, c);
            if (!pos2) return null;
            for (let i = c.indexOf(r.ct); i >= 0; i = c.indexOf(r.ct, i + 1)) {
                const start = pos2[i], end = pos2[i + r.ct.length - 1] + 1;
                // Since 1.2.1-citd.1 also CJK brackets and stops ("「", "《", "．", "，") and the
                // document type GB/T 7714 writes after a title ("论乡村重构[J]", "[M]", "[D]").
                if (/(?:^|[.,;:”"“'(「『《【〈（．，。、：])\s*$/.test(raw.slice(Math.max(0, start - 3), start)) && /^\s*(?:[.,;:”"’')」』》】〉）．，。、：]|\[[A-Z/]{1,6}\]|$)/.test(raw.slice(end, end + 8))) {
                    return { ids: copiesOf(ix, r, excluded), how: "title" };
                }
            }
        }
    }
    return null;
    }
}

/** `r` and its copies: the items sharing one of its DOIs, or its exact
 *  title with the same first author and year (each where both have one). */
function copiesOf(ix: WvRefIndex, r: WvRefRec, excluded: (r: WvRefRec) => boolean): number[] {
    const out = [r.id];
    const take = (id: number) => {
        if (out.indexOf(id) >= 0) return;
        const o = ix.items.get(id);
        if (o && !excluded(o)) out.push(id);
    };
    for (const d of r.dois) for (const id of ix.byDOI.get(d) || []) take(id);
    if (r.ct.length >= MIN_TITLE) {
        for (const id of ix.byTitle.get(r.ct) || []) {
            const o = ix.items.get(id);
            if (!o) continue;
            if (r.first && o.first && r.first !== o.first) continue;
            if (r.year && o.year && r.year !== o.year) continue;
            if (r.dois.length && o.dois.length && !o.dois.some((d) => r.dois.indexOf(d) >= 0)) continue;
            take(id);
        }
    }
    // Since 1.3.0-refkeys.1: the same arXiv identifier on two records that carry no DOI
    // but an arXiv one (`pre` < 2: one preprint in My Library and a group, one of them
    // titled as a later version), not two works (otherWork). A journal version whose
    // Extra names the preprint is no copy of it: an entry names one or the other
    // (wvRefMatch steps 1 and 1b).
    if (r.pre < 2) {
        for (const a of r.axs) {
            for (const id of ix.byArxiv.get(a) || []) {
                const o = ix.items.get(id);
                if (o && o.pre < 2 && !otherWork(r, o)) take(id);
            }
        }
    }
    return out;
}

/** Are `a` and `b`, which one identifier names, two different works (1.3.0-refkeys.1)?
 *  Each has a first author and they are not one person (nameForms), and neither compact
 *  title holds the other: a book and a chapter that carries the book's DOI. A copy whose
 *  title is off, a version retitled, keeps its first author: one work. */
function otherWork(a: WvRefRec, b: WvRefRec): boolean {
    if (!a.first || !b.first) return false;
    if (nameForms(a.first, a.forms).indexOf(b.first) >= 0 || nameForms(b.first, b.forms).indexOf(a.first) >= 0) return false;
    if (a.ct.length < MIN_TITLE || b.ct.length < MIN_TITLE) return false;
    return a.ct.indexOf(b.ct) < 0 && b.ct.indexOf(a.ct) < 0;
}
