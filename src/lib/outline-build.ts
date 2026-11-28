// Weavero's extracted outline (outline2 P2, first cut 2026-11-24): Zotero's
// stored outline (`catalog.outline` of the structure data) corrected with the
// pack's heading blocks and the parent item's metadata. Pure: the caller reads
// the pack (lib/outline-sdt.ts) and passes plain data.
//
// Rules (MJT 2026-11-24, from his library: IH8CQQBV, Baumeister & Simon 1973,
// "It uses author names as headers", "missing Part I", "Conclusions should be a
// top level outline item"; plan work/outline-extraction-plan-notes-2026-11-23.md):
//  1. a heading that is the item's creators (last names, initials and caps
//     allowed) is a byline, never a section -- from the metadata;
//  2. headings that are the item's title are left out, and nothing is nested
//     under them (their children move up);
//  3. heading blocks Zotero's generator dropped come back when they start with
//     Part / Chapter / Section + a numeral (any case) or are a section word;
//  4. one-character headings are left out (OCR drop caps);
//  5. "part" / "Fart" before a Roman numeral reads "Part" -- nothing broader;
//  6. unnumbered standard section words are top-level entries whatever their
//     type size; numbering gives the level otherwise ("4.3 Conclusions" stays
//     under 4); a level is never skipped;
//  7. the unnumbered headings Zotero nested under an unnumbered parent go up to
//     the parent's level when every one of them has a box not smaller than
//     the parent's (height >= 0.95 x) and the parent's letter case (both
//     capitals, or both mixed) -- all of them or none, so a sibling never
//     becomes a child: Zotero's generator nests a heading whose style is new
//     on its stack under the previous one (document-worker outline.js
//     buildOutline, `depth = stack.length`), and a scan's taller OCR box
//     makes a new style (MJT 2026-11-24, YUM6RVCJ, Prosperetti & Oguz 1993:
//     "ACOUSTICS OF IMPACT" under "THEORETICAL ASPECTS"); a real sub-heading
//     is smaller or styled otherwise. Any label ("4.1.Results", "(a)", "§2",
//     "1B.4", a bullet) on either side keeps Zotero's nesting;
//  8. entries that only open a web page (the PDF's own URL bookmarks that
//     Zotero appends to the outline it generates: "Annual Reviews Online"...)
//     have no place in the document: left out, a parent of nothing else too;
//     they stay in Zotero's source (MJT 2026-11-24, YUM6RVCJ);
//  9. numbering sequences (outline2.7, MJT 2026-11-24: ZHRASH52, Medwin et al.
//     1992, a scan; S426KUSL, Tsai et al. 2011, born-digital): Roman sections
//     (I., II., ...) with lettered subsections (A., B., ... starting again
//     under each Roman) -- Roman at the top, letters one level down, Arabic
//     numbers and lower-case letters further down, unnumbered headings at the
//     top. A label read wrong by OCR ("v." "Vl." "Il." "lV.", "C.Average...")
//     is repaired when, and only when, the sequence expects it there; the text
//     after it is never touched;
// 10. a numbered entry out of its sequence ("4. Silvervessel" between 2 and 3:
//     a figure legend, 5XHMXMSG) whose letter case is not the sequence's is
//     left out; one signal alone keeps it (a note says so). A number missing
//     from the sequence ("1. In tro duction" in a paragraph, issue #41's
//     Sari & Piran arXiv) comes back from the blocks between its neighbours;
// 11. "Chapter" / "Part" + a number word (ONE, TWO...) is a chapter too (issue
//     #41, Doherty 2011); a section word inside a chapter goes under it unless
//     it has the chapters' letter case (the dissertation's own CONCLUSION);
// 12. a body sentence taken for a heading is left out (before a colon only
//     with a verb in it, outline2.9: a noun phrase there is a heading): it ends as a sentence
//     (. : ; ,) and its words ran together ("Mid-sizedropsradiate..."), or it
//     starts with a decimal glued to a word ("8.7and12.1m/s..."), or it reads as
//     a sentence ("Two possibilities exist:"); a section word never is;
// 13. a reference-list entry taken for a heading (initials, a year, volume and
//     page: "MARQUENIE L., Instrum. Pract. 1962 16 45.", 5XHMXMSG), or any
//     unnumbered entry with a year after the references heading, is left out;
//     a references title Zotero did not list as a heading (a paragraph line)
//     comes back;
// 14. run-in headings (outline2.8, MJT 2026-11-24: 4C3CTP2L, Blech 1983, an
//     ASME scan; FDAZTHDH, Dixit et al. 2026, PRL): a paragraph that starts
//     with a bold lead-in of 2-15 words ending in "." ":" or a dash ("Annular
//     Plates in a Tilting Mode."), or with a short capitalized phrase and an
//     em dash ("Phenomenology—We first examine..."), followed by 40+
//     characters of text, is a sub-heading one level under the section
//     heading before it (the top level without one). Italic lead-ins count
//     only where a document has no bold ones; bold-italic never. Never a
//     running header, never in the reference list; only for PDFs without
//     usable bookmarks of their own (theirs win). Placed on the paragraph's
//     first line;
// 15. cleaned bookmarks (MJT 2026-11-24): a PDF whose heading blocks give no
//     section but whose own bookmarks are usable (not all labelled alike, as
//     S426KUSL's) gets them as Extracted -- a single wrapper entry that is
//     the paper's title removed (its children come up), web links out. The
//     Embedded source keeps them exactly as the file has them;
// 16. a reference list with no references heading before it (APS prints
//     none; 5XHMXMSG's scan lost it) gets a top-level "References" entry
//     (`meta.labels.references`, the UI's language) at its first entry: a run
//     of 4+ entries in the second half of the document -- bracketed or
//     numbered with a year, or a citation's shape -- most of them with a year
//     (outline2.10, MJT 2026-11-24);
// 17. the spaces a text layer lost come back in Extracted titles, from the
//     glyph gaps of the heading's text map ("RAINFALL|RATES|AND",
//     "DISCUSSION|OF"): in a line whose other in-word gaps are (almost all)
//     exactly zero -- an OCR layer placing each word; a kerned or letter-
//     spaced line has gaps all along --, a gap of at least 15 % (positive,
//     and then beside another one unless it reaches 25 %) or 25 % (negative)
//     of the line's own word spaces (a line without a space of its own is
//     left alone), never across a kerning pair, never inside a web address,
//     never leaving a piece under two characters; and only in a document
//     where some heading shows a gap of half a word space or more. The text
//     is otherwise the heading's (outline2.10, MJT 2026-11-24);
// 18. a book's printed Contents page (outline2.12, MJT 2026-11-24: "Ok to
//     rebuild the Contents-page chapters with the rule above", after
//     YX7EPSV9, Barenblatt, opened at its Contents page): in a document of
//     more than 60 pages, a "Contents" title in its first 15 % of pages and
//     the "title .... page" entries after it (full section numbers kept;
//     "CHAPTER 2" joined with its title line; a line without a page number
//     joined with the next line of its page unless that one starts with a
//     label); printed pages mapped to page indexes by the PDF's page labels,
//     else by the best constant offset; an entry is kept only when its page
//     shows its title (a block of that page starts with it -- the label
//     aside --, or, for 3+ words, has them anywhere), and the Contents only
//     when >= 60 % of its entries are kept. Levels from the numbering: Part >
//     Chapter / N > N.M > N.M.K; "§ N", and sections numbered again in each
//     chapter, one under "Chapter"; a letter one under the entry before; an
//     unnumbered entry repeated in the Contents ("Problems") or followed by
//     its chapter's next section goes under the chapter, any other at the
//     top; front matter numbered in Roman kept at the top only when it lands
//     (page labels); too few letters, no entry. It replaces Extracted when
//     it finds more of the book's chapters than Extracted does, and at least
//     60 % of them: of the Contents' chapter-level entries with an Arabic
//     page number (the numbered ones when there are two or more), the ones it
//     keeps, against the ones Extracted has at its top level (or under a
//     Part or a bare "Chapter N") within a page of the same place with the same title (the label
//     aside, cut short by 20 % at most), plus Extracted's other "Chapter N
//     <title>" entries. A chapter line without a page
//     number takes its first section's; sections numbered from 1 again in
//     each chapter are sections, never chapters. Never
//     where the PDF has GOOD bookmarks of its own (rule 19: theirs win). Each entry
//     sits on the block showing its title (the block's box when the block is
//     about the title's length or a heading, else its first line), else on
//     the page top;
// 19. GOOD bookmarks are Extracted's skeleton (outline2.13, MJT 2026-11-24 on
//     YX7EPSV9, Barenblatt: "the Extracted outline is worse than the Embedded
//     one. Is it possible to prevent this from happening?", and QCTQJ9ZR,
//     Burke et al.): bookmarks are good when not all one label, fewer than
//     20 % of them anchor names ("s1", "d3"), at least two with a page, in
//     page order (90 % of neighbouring pairs), the first in the document's
//     first fifth and spanning half of its pages or more. Each sits at the
//     publisher's destination (its heading's box when Zotero found it); a
//     file-name label ("07.0_pp_28_63_Dimensions_...") takes the heading at
//     its destination that says the same (with a bare number line before
//     it), else its words; a label without its section's number takes the
//     number of the heading on its page that has it. Weavero's headings fill
//     in each bookmark's pages, under it, levels relative to the shallowest;
//     none before the first bookmark, none in front matter (Title page,
//     Copyright, Contents, Preface...), only appendices and back matter after
//     References or in an Index, none that is the bookmark's own heading or
//     an unlabeled piece of it ("of Caffeine in Sport"). Embedded stays the
//     file's; the 2.8 cleaned bookmarks (rule 15) are the case with no
//     heading to fill in; rule 18 applies only without good bookmarks;
// 20. a heading line that goes on with the one above it is joined to it
//     (outline2.13, QCTQJ9ZR: "Finding Caffeine" / "in Our Diets"): the next
//     heading block on the same page, just below, the same line height (15 %),
//     unlabeled, starting in lower case or with a connector ("of", "in",
//     "and"...), or the line above ending with one, an article or a comma;
//     both lines are lit. Also (outline2.13): a lone connector ("or", "and")
//     is no entry, nor two lower-case letters (OCR's "kk"), nor a heading
//     whose very text stands in the top or bottom 10 % of a page within two
//     pages of the same text there, not taller (a chapter's running header,
//     YX7EPSV9's "0. Introduction");
//  plus page furniture: a heading text repeated in the top or bottom 18% of a
//  page on >= 30% of pages (at least 3), or on >= 50% of pages anywhere, is a
//  running header (the repetition rule of zotero-TOC, MIT licence,
//  https://github.com/liotou/zotero-toc src/detect.js; re-implemented here,
//  not copied).
// A PDF whose catalog outline is the PDF's own (every entry `source:
// 'native'`) or empty has no generated outline to start from: its heading
// blocks are the base then, under the same rules.
// Positions are Zotero's: a heading block's box (lib/outline-sdt.ts notes).

import { wvRefListIsTitle } from "./ref-list";

/** One outline node, as the Outline panel renders it. */
export interface WvOlNode {
    title: string;
    url: string | null;
    position: { pageIndex: number; rects: number[][] } | null;
    href: string | null;
    items: WvOlNode[];
}

/** A top-level block of the pack, as the builder needs it. */
export interface WvOlBlock {
    i: number; type: string; text: string; pageRects: any[] | null;
    /** Rule 14: the block's leading emphasized run(s), their style ("b", "i", "bi"), its first line [page, x1, y1, x2, y2]. */
    lead?: string; leadStyle?: string; line?: number[] | null;
    /** Rule 14: the boxes of the lead-in's own characters, and of the characters
     *  before an em dash, per text-map line: [page, x1, y1, x2, y2] (outline2.11). */
    leadBox?: number[][] | null; dashBox?: number[][] | null;
    /** Rule 17: the non-space character indexes before which the text layer lost a space (headings). */
    lost?: number[] | null;
    /** Rule 18: the block's lines as a Contents page shows them (a list's items, a table's cells, else its
     *  whole text), for the first pages of a book only (wvOlItems). */
    items?: string[] | null;
    /** Rule 21: per space of the (whitespace-collapsed) text, the glyph gap before the character after it; null
     *  where that character starts a new text-map line (headings; wvOlSpaceGaps). */
    spaceGaps?: Array<number | null> | null;
}

/** Rule 14: lead-ins that are never headings -- environment and float labels,
 *  front matter (English, French, German). */
const RUNIN_STOP = /^\s*(?:proof|preuve|d\u00e9monstration|theorem|th\u00e9or\u00e8me|lemma|lemme|proposition|corollary|corollaire|definition|d\u00e9finition|remark|remarque|example|exemple|examples|note|notes|question|notation|claim|conjecture|assumption|hypothesis|hypoth\u00e8se|problem|probl\u00e8me|exercise|exercice|solution|hint|answer|step|case|cas|recommandation|recommendation|figure|fig|table|tableau|scheme|sch\u00e9ma|chart|graph|equation|eq|abstract|r\u00e9sum\u00e9|summary|keywords?|key words|index terms|mots[- ]cl\u00e9s|title|titre|schl\u00fcsselw\u00f6rter|zusammenfassung|movie|video|supplementary|cite this|ocis|pacs|msc)\b/iu;

/** Back matter set as run-ins (MDPI, PRL...): top-level entries, not part of the last section. */
const BACK_MATTER = new Set(["author contributions", "authors contributions", "funding", "conflicts of interest", "conflict of interest",
    "data availability", "data availability statement", "publisher s note", "institutional review board statement",
    "informed consent statement", "abbreviations", "supplementary materials", "supplementary material",
    "declaration of competing interest", "credit authorship contribution statement", "competing interests", "author information",
    "code availability", "ethics statement", "acknowledgments", "acknowledgements", "acknowledgment", "acknowledgement"]);

/** Page furniture: the texts (lower case, digits out) repeated in the top or
 *  bottom 18 % of a page on >= 30 % of pages (at least 3), or anywhere on
 *  >= 50 % of them. */
export function wvOlRunningHeaders(blocks: WvOlBlock[], pages: any[]): Set<string> {
    const running = new Set<string>();
    const pageCount = Array.isArray(pages) ? pages.length : 0;
    if (pageCount < 3) return running;
    const band = new Map<string, Set<number>>(), any = new Map<string, Set<number>>();
    for (const b of blocks || []) {
        const pr = b && Array.isArray(b.pageRects) && b.pageRects[0];
        if (!pr || !Number.isInteger(pr[0])) continue;
        const key = wvOlNorm(b.text).replace(/\d+/g, "").trim();
        if (!key) continue;
        (any.get(key) || any.set(key, new Set()).get(key) as Set<number>).add(pr[0]);
        const vr = pages[pr[0]] && pages[pr[0]].viewRect;
        if (finiteRect(vr) && finiteRect(pr.slice(1))) {
            const h = vr[3] - vr[1];
            const top = pr[4], bottom = pr[2];
            if (h > 0 && (top >= vr[3] - h * 0.18 || bottom <= vr[1] + h * 0.18)) {
                (band.get(key) || band.set(key, new Set()).get(key) as Set<number>).add(pr[0]);
            }
        }
    }
    const minBand = Math.max(3, Math.ceil(pageCount * 0.3)), minAny = Math.max(3, Math.ceil(pageCount * 0.5));
    for (const [k, s] of band) if (s.size >= minBand) running.add(k);
    for (const [k, s] of any) if (s.size >= minAny) running.add(k);
    return running;
}

/** A block's lead-in (rule 14): its leading bold and/or italic text runs, their
 *  style ("b" bold, "i" italic, "bi" both; "" without), and its first line's
 *  box across the block's width, [page, x1, y1, x2, y2] (the first run's
 *  text map gives the line's height). */
export function wvOlLead(b: any): { lead: string; style: string; line: number[] | null } {
    const runs: any[] = [];
    const walk = (n: any) => { if (!n) return; if (typeof n.text === "string") { runs.push(n); return; } if (Array.isArray(n.content)) for (const c of n.content) walk(c); };
    walk(b);
    const kind = (r: any) => { const st = r && r.style; return st ? (st.bold ? "b" : "") + (st.italic ? "i" : "") : ""; };
    let lead = "", style = "", k = 0;
    while (k < runs.length && !/\S/.test(runs[k].text)) k++;
    if (k < runs.length && kind(runs[k])) {
        style = kind(runs[k]);
        for (; k < runs.length; k++) {
            if (!/\S/.test(runs[k].text)) { lead += runs[k].text; continue; }
            if (kind(runs[k]) !== style) break;
            lead += runs[k].text;
        }
    }
    let line: number[] | null = null;
    try {
        const first = runs.find((r) => r && r.anchor && r.anchor.textMap);
        let tm = first && first.anchor.textMap;
        if (typeof tm === "string") tm = JSON.parse(tm);
        const l0 = Array.isArray(tm) && tm[0];
        const prs = b && b.anchor && b.anchor.pageRects;
        const pr = Array.isArray(prs) && (prs[l0 && Number.isInteger(l0[0]) ? l0[0] : 0] || prs[0]);
        if (Array.isArray(l0) && finiteRect(l0.slice(2, 6)) && Array.isArray(pr) && finiteRect(pr.slice(1))) {
            line = [pr[0], Math.min(pr[1], l0[2]), l0[3], Math.max(pr[3], l0[4]), l0[5]];
        }
    } catch (_) {}
    return { lead: lead.replace(/\s+/g, " ").trim(), style, line };
}

/** Rule 14 (outline2.11): the boxes of a block's first `count` non-space
 *  characters, one per text-map line they cover, [page, x1, y1, x2, y2] --
 *  each run's text map, per line: [rect, ?, x1, y1, x2, y2, then one item per
 *  non-space character: its advance, or [gap before it, advance]]. Null
 *  without text maps or when they run short. */
export function wvOlCharBoxes(b: any, count: number): number[][] | null {
    const runs: any[] = [];
    const walk = (n: any) => { if (!n) return; if (typeof n.text === "string") { runs.push(n); return; } if (Array.isArray(n.content)) for (const c of n.content) walk(c); };
    walk(b);
    const prs = b && b.anchor && Array.isArray(b.anchor.pageRects) ? b.anchor.pageRects : [];
    const out: number[][] = [];
    let left = count;
    for (const r of runs) {
        if (left <= 0) break;
        if (!/\S/.test(r.text)) continue;
        let tm = r.anchor && r.anchor.textMap;
        if (typeof tm === "string") { try { tm = JSON.parse(tm); } catch (_) { return null; } }
        if (!Array.isArray(tm)) return null;
        for (const ln of tm) {
            if (left <= 0) break;
            if (!Array.isArray(ln) || !finiteRect(ln.slice(2, 6))) return null;
            const pr = prs[ln[0]] || prs[0];
            if (!Array.isArray(pr) || !Number.isInteger(pr[0])) return null;
            let x = Number(ln[2]), x1 = Infinity, x2 = -Infinity;
            for (const it of ln.slice(6)) {
                if (left <= 0) break;
                const gap = Array.isArray(it) ? Number(it[0]) || 0 : 0, w = Array.isArray(it) ? Number(it[1]) || 0 : Number(it) || 0;
                x += gap;
                x1 = Math.min(x1, x); x2 = Math.max(x2, x + w);
                x += w; left--;
            }
            if (x2 > x1) out.push([pr[0], x1, Number(ln[3]), x2, Number(ln[5])]);
        }
    }
    return left <= 0 && out.length ? out : null;
}

/** Rule 14: the run-in headings among `blocks` (paragraphs only), before
 *  block `before` (the reference list), none in `running` (page furniture). */
export function wvOlRunIns(blocks: WvOlBlock[], running?: Set<string>, before?: number, pages?: any[]): Array<{ i: number; title: string; line: number[] | null; page: number | null; boxes: number[][] | null }> {
    // Papers only: in books and novels a bold first sentence is not a heading.
    if (Array.isArray(pages) && pages.length > 60) return [];
    // A side column's glossary term (Annual Reviews' margin definitions): a
    // block narrower than 30 % of its page.
    const narrow = (b: WvOlBlock): boolean => {
        const pr = Array.isArray(b.pageRects) && b.pageRects[0];
        const vr = pr && Array.isArray(pages) && pages[pr[0]] && pages[pr[0]].viewRect;
        return !!(pr && finiteRect(vr) && finiteRect(pr.slice(1)) && (pr[3] - pr[1]) < 0.3 * (vr[2] - vr[0]));
    };
    const end = before == null ? Infinity : before;
    // Never an environment or float label, nor front matter.
    const notHeading = (t: string) => RUNIN_STOP.test(t);
    const lettersOk = (t: string) => {
        const chars = t.replace(/\s+/g, "");
        return chars.length > 0 && (t.match(/\p{L}/gu) || []).length / chars.length >= 0.7 && /^\p{Lu}/u.test(t);
    };
    const furniture = (b: WvOlBlock) => !!running && running.has(wvOlNorm(b.text).replace(/\d+/g, "").trim());
    const styled: Record<string, Array<{ b: WvOlBlock; t: string; dash?: boolean }>> = { b: [], i: [] };
    const dashed: Array<{ b: WvOlBlock; t: string; dash?: boolean }> = [];
    for (const b of blocks || []) {
        if (!b || b.type !== "paragraph" || b.i >= end || furniture(b) || narrow(b)) continue;
        const lead = String(b.lead || "");
        if (lead && (b.leadStyle === "b" || b.leadStyle === "i") && /[.:\u2014\u2013]$/.test(lead)) {
            const words = lead.split(/\s+/).filter(Boolean).length;
            if (words >= 2 && words <= 15 && lettersOk(lead) && !notHeading(lead) && b.text.length - lead.length >= 40) styled[b.leadStyle as string].push({ b, t: lead });
            continue;
        }
        const m = /^(\p{Lu}[^\u2014]{0,118}?)\s?\u2014\s?(?=\p{Lu})/u.exec(b.text);
        if (m) {
            const t = m[1].trim(), words = t.split(/\s+/).filter(Boolean).length;
            if (words >= 1 && words <= 15 && lettersOk(t) && !notHeading(t) && b.text.length - m[0].length >= 40) dashed.push({ b, t, dash: true });
        }
    }
    const pick = styled.b.length ? styled.b : (styled.i.length >= 2 ? styled.i : []);
    let all = pick.concat(dashed.length >= 2 ? dashed : []).sort((x, y) => x.b.i - y.b.i);
    // A lead-in repeated three times or more in one document labels boxes
    // ("Key contributions" x4), not sections; twice can be a real pair.
    const seen = new Map<string, number>();
    for (const x of all) { const k = wvOlNorm(x.t); seen.set(k, (seen.get(k) || 0) + 1); }
    all = all.filter((x) => (seen.get(wvOlNorm(x.t)) || 0) < 3);
    return all.map(({ b, t, dash }) => ({
        i: b.i, title: t.replace(/[\s.:\u2014\u2013]+$/, "").trim(), line: b.line || null,
        page: b.line ? b.line[0] : (Array.isArray(b.pageRects) && b.pageRects[0] && Number.isInteger(b.pageRects[0][0]) ? b.pageRects[0][0] : null),
        // Its own characters' boxes (outline2.11), not the whole line.
        boxes: (dash ? b.dashBox : b.leadBox) || null,
    }));
}

/** The parent item's metadata the rules read. */
export interface WvOlMeta {
    title?: string;
    creators?: Array<{ lastName?: string; firstName?: string; name?: string }>;
    /** Entry titles Weavero writes itself, in the UI's language (rule 16). */
    labels?: { references?: string };
}

/** Kerning pairs (rule 17): a negative gap between them is the font's, not a lost space. */
const KERN_PAIRS = /^(?:A[TVWYOCGQU]|[TVWYF][AO.,]|L[TVWY]|P[A.,]|R[TVWY]|K[O]|O[AVWXY]|D[AVWY]|[VW][e-o]|T[a-z]|Y[a-z]|F[a-z]|r[.,aeogc]|f[.,]|[aeo][vwy]|[vwy][aeo.,]|[gj][aeo])$/;

/** Rule 17: a block's non-space characters with their glyph gaps, from its
 *  runs' text maps (per line: [rect, ?, x1, y1, x2, y2, then one item per
 *  non-space character: its advance, or [gap before it, advance]), in
 *  wvOlBlockText's order; `sp` when the text has a space before it. Null
 *  without text maps or when they do not match the text. */
function glyphGaps(b: any): Array<{ ch: string; gap: number; line: string; sp: boolean }> | null {
    const runs: any[] = [];
    const walk = (n: any) => { if (!n) return; if (typeof n.text === "string") { runs.push(n); return; } if (Array.isArray(n.content)) for (const c of n.content) walk(c); };
    walk(b);
    const chars: Array<{ ch: string; gap: number; line: string; sp: boolean }> = [];
    let sp = false;
    for (const r of runs) {
        if (!/\S/.test(r.text)) { if (r.text.length) sp = true; continue; }
        let tm = r.anchor && r.anchor.textMap;
        if (typeof tm === "string") { try { tm = JSON.parse(tm); } catch (_) { return null; } }
        if (!Array.isArray(tm)) return null;
        const items: Array<{ it: any; line: string }> = [];
        const base = chars.length;
        tm.forEach((ln: any, li: number) => { if (Array.isArray(ln)) for (const it of ln.slice(6)) items.push({ it, line: base + ":" + li }); });
        let k = 0;
        for (const ch of r.text) {
            if (/\s/.test(ch)) { sp = true; continue; }
            const x = items[k++];
            if (!x) return null;
            chars.push({ ch, gap: Array.isArray(x.it) ? Number(x.it[0]) || 0 : 0, line: x.line, sp });
            sp = false;
        }
        if (k !== items.length) return null;
    }
    return chars;
}

/** Rule 21: the glyph gap after each space of a block's text (wvOlBlockText's,
 *  whitespace collapsed): the gap before the character that follows the space,
 *  null when that character starts a new line of the text map (or the run has
 *  none). Null when the text maps do not match the text. */
export function wvOlSpaceGaps(b: any): Array<number | null> | null {
    const runs: any[] = [];
    const w = (x: any) => { if (!x) return; if (typeof x.text === "string") { runs.push(x); return; } for (const c of x.content || []) w(c); };
    w(b);
    const out: Array<number | null> = [];
    let pendingSpace = false, any = false;
    for (const r of runs) {
        let tm = r.anchor && r.anchor.textMap;
        if (typeof tm === "string") { try { tm = JSON.parse(tm); } catch (_) { tm = null; } }
        const items: Array<{ it: any; nl: boolean }> = [];
        if (Array.isArray(tm)) for (const line of tm) { if (!Array.isArray(line)) continue; let first = true; for (const it of line.slice(6)) { items.push({ it, nl: first }); first = false; } }
        let k = 0;
        for (const ch of String(r.text)) {
            if (/\s/.test(ch)) { if (any) pendingSpace = true; continue; }
            const x = Array.isArray(tm) ? items[k++] : null;
            if (Array.isArray(tm) && !x) return null;
            if (pendingSpace) out.push(!x || x.nl ? null : Array.isArray(x.it) ? Number(x.it[0]) : 0);
            pendingSpace = false; any = true;
        }
        if (Array.isArray(tm) && k !== items.length) return null;
    }
    return out;
}

/** Rule 17: the non-space character indexes of a block's text (wvOlBlockText's
 *  order) before which the text layer lost a space, and whether one of them
 *  is strong (half a word space or more). Null without text maps. */
export function wvOlLostSpaces(b: any): { lost: number[]; strong: boolean } | null {
    const chars = glyphGaps(b);
    if (!chars) return null;
    const med = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const lost: number[] = [];
    let strong = false;
    const lines = new Map<string, number[]>();
    chars.forEach((c, k) => { (lines.get(c.line) || lines.set(c.line, []).get(c.line) as number[]).push(k); });
    for (const ks of lines.values()) {
        // The line's word space: the gaps after its own spaces. A line without
        // a space, or whose spaces carry no gap (the space glyph has the
        // width), says nothing: skipped.
        const spaced = ks.filter((k) => k > 0 && chars[k].sp);
        if (!spaced.length) continue;
        const space = med(spaced.map((k) => chars[k].gap));
        if (!(space > 0.5)) continue;
        // In-word positions: an OCR layer placing each word leaves them at
        // exactly zero but at the lost spaces; a kerned or letter-spaced line
        // has gaps all along.
        const inner = ks.filter((k) => k > 0 && !chars[k].sp);
        if (!inner.length) continue;
        const letter = (ch: string) => /[\p{Lu}\p{Ll}\p{Lt}\p{Lo}]/u.test(ch);
        // Never inside a web address.
        const word = (k: number) => { let i = k, j = k; while (i > 0 && !chars[i].sp) i--; while (j + 1 < chars.length && !chars[j + 1].sp) j++; return chars.slice(i, j + 1).map((c) => c.ch).join(""); };
        const cand: number[] = [];
        for (const k of inner) {
            const a = chars[k - 1].ch, c = chars[k].ch, g = chars[k].gap;
            const before = letter(a) || (/[.,;:)]/.test(a) && k >= 2 && letter(chars[k - 2].ch) && !chars[k - 1].sp);
            if (!letter(c) || !before || KERN_PAIRS.test(a + c)) continue;
            if (g > 0 ? g >= 0.15 * space : -g >= 0.25 * space) {
                if (/www\.|:\/\/|@|\.(?:com|org|net|fr)\b/i.test(word(k))) continue;
                cand.push(k);
            }
        }
        // A small positive gap is a lost space only beside another candidate.
        const firm = cand.filter((k) => chars[k].gap < 0 || chars[k].gap >= 0.25 * space);
        const kept = firm.length || cand.length >= 2 ? cand : [];
        // The other in-word gaps (noise against the word space) must be rare.
        const noise = inner.filter((k) => !cand.includes(k) && Math.abs(chars[k].gap) >= 0.08 * space).length;
        if (!kept.length || noise > Math.max(1, Math.floor(0.08 * inner.length))) continue;
        // Small positive gaps alone: only in a line whose other in-word gaps
        // are all zero (a kerned line has small gaps elsewhere too).
        if (!firm.length && inner.some((k) => !cand.includes(k) && Math.abs(chars[k].gap) >= 0.05 * space)) continue;
        for (const k of kept) { lost.push(k); if (Math.abs(chars[k].gap) >= 0.5 * space) strong = true; }
    }
    // Never a piece under two characters: the pieces between word starts
    // (the text's spaces, the lost ones) on both sides of each lost space.
    lost.sort((x, y) => x - y);
    const starts = new Set<number>([0, ...lost]);
    chars.forEach((c, k) => { if (c.sp) starts.add(k); });
    const bounds = [...starts].sort((x, y) => x - y).concat([chars.length]);
    return {
        lost: lost.filter((k) => {
            const at = bounds.indexOf(k);
            return at > 0 && k - bounds[at - 1] >= 2 && bounds[at + 1] - k >= 2;
        }),
        strong,
    };
}

/** Rule 16: the first entry of an untitled reference list, or null. */
export function wvOlRefListStart(blocks: WvOlBlock[]): WvOlBlock | null {
    const list = (blocks || []).filter(Boolean);
    if (!list.length) return null;
    const year = /(?:^|[^\d])(?:1[6-9]\d\d|20\d\d)[a-z]?(?!\d)/;
    const entriesIn = (b: WvOlBlock): { n: number; years: number } => {
        if (!b || !["list", "paragraph", "heading"].includes(b.type)) return { n: 0, years: 0 };
        const t = b.text || "";
        if (b.type === "list") {
            // The items' text runs together ("...1965.[4] SAVIC P."): labels anywhere.
            const n = (t.match(/\[\d{1,3}\]|(?:^|[^\w])\(\d{1,3}\)\s|(?:^|[\s.;])\d{1,3}\.\s+\p{Lu}/gu) || []).length;
            return { n, years: Math.min(n, (t.match(new RegExp(year.source, "g")) || []).length) };
        }
        const lab = /^\s*(?:\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}\.)\s*\p{Lu}/u.test(t);
        return (lab && year.test(t)) || isCitation(t) ? { n: 1, years: year.test(t) ? 1 : 0 } : { n: 0, years: 0 };
    };
    const half = list[Math.floor(list.length / 2)].i;
    for (let k = 0; k < list.length; k++) {
        if (list[k].i < half) continue;
        const first = entriesIn(list[k]);
        if (!first.n) continue;
        // A list starts at its first entry: unnumbered (author-year) or number 1.
        const num = /^\s*(?:\[(\d{1,3})\]|\((\d{1,3})\)|(\d{1,3})\.)/.exec(list[k].text || "");
        if (num && Number(num[1] || num[2] || num[3]) !== 1) continue;
        let n = 0, years = 0, misses = 0;
        for (let j = k; j < list.length && misses <= 2; j++) {
            const r = entriesIn(list[j]);
            if (r.n) { n += r.n; years += r.years; misses = 0; } else misses++;
        }
        if (n >= 4 && years >= 0.6 * n) return list[k];
    }
    return null;
}

/** Rule 18: Contents titles and the headings that end a Contents (normalized, wvOlNorm). */
const TOC_TITLES = /^(?:contents|table of contents|brief contents|detailed contents|contents in brief|table des matieres|sommaire|inhalt|inhaltsverzeichnis|indice|indice general|contenido|contenidos|содержание|оглавление|目录|目次)$/;
const TOC_END = /^(?:list of (?:figures|tables|symbols|illustrations|abbreviations|publications|plates)|liste des (?:figures|tableaux|symboles)|table des figures|abbildungsverzeichnis|tabellenverzeichnis|preface|foreword|avant propos|vorwort|acknowledgments?|acknowledgements?|remerciements|abstract|nomenclature)$/;
/** Rule 18: a Contents label at a title's start (Part / Chapter / Appendix + numeral, section sign, number, Roman, letter). */
const TOC_LABEL = /^\s*(?:(?:part|partie|teil|chapter|chap\.?|chapitre|kapitel|lecture|appendix|appendices|annexes?|anhang)\s*(?:[ivxlcdm]+|\d+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)?(?![\p{L}\d])\.?:?|§\s*\d+\.?|\d+(?:\.\d+)*\.?(?=\s|\p{Lu}|$)|[IVXLC]+(?:\.\d+)*[.)](?=\s)|[A-Za-z][.)](?=\s))\s*/iu;

/** Rule 18: a block's lines as a Contents page shows them -- a list's items, a
 *  table's cells or rows, else the block's whole text. */
export function wvOlItems(b: any): string[] {
    const kids: any[] = b && Array.isArray(b.content) ? b.content : [];
    if (b && (b.type === "list" || b.type === "table") && kids.length) {
        return kids.map((c: any) => c && Array.isArray(c.content) && c.type !== "listitem" && b.type === "table"
            ? c.content.map((x: any) => wvOlBlockText(x)).join(" ").replace(/\s+/g, " ").trim()
            : wvOlBlockText(c)).filter(Boolean);
    }
    const t = wvOlBlockText(b);
    return t ? [t] : [];
}

/** Rule 18: one entry of a Contents page. */
export interface WvOlTocEntry {
    title: string;
    /** The page number as printed ("17", "xi"). */
    printed: string;
    roman: boolean;
    kind: "part" | "chapter" | "appendix" | "sect" | "num" | "roman" | "letter" | "none";
    /** The numbering's parts ("2.3" -> ["2", "3"]; "Chapter IX" -> ["9"]). */
    parts: string[];
    level: number;
    /** A chapter-level entry (the top level, or under a Part). */
    chapter: boolean;
    /** The page index the printed page maps to (null: none). */
    pageIndex: number | null;
    landed: boolean;
    position: { pageIndex: number; rects: number[][] } | null;
}

/** Rule 18: a book's Contents page read, mapped and checked; null without one. */
export interface WvOlToc { contentsPage: number; parsed: number; landed: number; mapping: string; pass: boolean; entries: WvOlTocEntry[]; }

/** Rule 18: the words a page must show for a title -- its leading words, the
 *  label aside, up to its 4th word of 3+ letters; and how many such words. */
function tocNeedle(title: string): { nd: string; sig: number } {
    const ws = wvOlNorm(String(title || "").replace(TOC_LABEL, "")).split(" ").filter(Boolean);
    let sig = 0, k = 0;
    for (; k < ws.length && sig < 4; k++) if (ws[k].length > 2) sig++;
    return { nd: sig ? ws.slice(0, k).join(" ") : "", sig };
}

/** Rule 18: the book's Contents page(s), read from `blocks` (with `items` on
 *  the first pages: lib/outline-sdt.ts) and checked against the pages. */
export function wvOlContents(blocks: WvOlBlock[], pages: any[]): WvOlToc | null {
    const pageCount = Array.isArray(pages) ? pages.length : 0;
    if (pageCount <= 60 || !Array.isArray(blocks)) return null;
    const pageOfB = (b: WvOlBlock): number => { const pr = b && Array.isArray(b.pageRects) && b.pageRects[0]; return pr && Number.isInteger(pr[0]) ? pr[0] : -1; };
    const list = blocks.filter((b) => b && pageOfB(b) >= 0).slice().sort((a, b) => a.i - b.i);
    const limit = Math.max(8, Math.ceil(pageCount * 0.15));
    // (A caption block too: Doherty's "TABLE OF CONTENTS", issue #41.)
    const ti = list.findIndex((b) => pageOfB(b) < limit && (b.type === "heading" || b.type === "paragraph" || b.type === "caption") && b.text.length <= 40 && TOC_TITLES.test(wvOlNorm(b.text)));
    if (ti < 0) return null;
    const titlePage = pageOfB(list[ti]);

    // The entries: each line ending in a page number (after dot leaders or a
    // space), followed by the end of the line or the next entry's start.
    const LEADERS = /(?:\s*[.…·•∙⋅_]){2,}\s*/g;
    const ENTRY = /(\S.*?)\s+(?:\u0001\s+)?(\d{1,4}|[ivxlcdm]{1,7})(?=$|\s+(?:\u0001\s+)?[\d\p{Lu}§])/gu;
    const startsLabel = (t: string) => /^\s*(?:(?:part|partie|teil|chapter|chap\.?|chapitre|kapitel|lecture|appendix|annexes?|anhang)\b|§|\d+(?:\.\d+)*\.?\s|[IVXLC]+\.\s)/i.test(t);
    const raw: Array<{ title: string; printed: string }> = [];
    let page = titlePage, misses = 0, lastPage = titlePage, maxArabic = 0, lows = 0, stop = false;
    let pending = "", pendLines = 0, head = "";
    // A page's entries count only when most of its lines are entries: a body
    // page after the Contents has a few lines ending in a number, not most.
    let buf: Array<{ title: string; printed: string }> = [], lines = 0, hits = 0;
    const flush = (): "kept" | "empty" | "body" => {
        const r = !buf.length ? "empty" : hits >= 0.5 * lines ? "kept" : "body";
        if (r === "kept") { for (const e of buf) raw.push(e); lastPage = page; }
        buf = []; lines = 0; hits = 0;
        return r;
    };
    for (let k = ti + 1; k < list.length && !stop; k++) {
        const b = list[k];
        const p = pageOfB(b);
        if (p > page) {
            // Body text ends the Contents once a page of it was read; before
            // that (page numbers set apart from their titles) it counts as a
            // page without entries.
            const r = flush();
            if ((r === "body" && raw.length) || (r !== "kept" && ++misses >= 2) || p > titlePage + 20) break;
            if (r === "kept") misses = 0;
            page = p; pending = ""; pendLines = 0; head = "";
        }
        const t = String(b.text || "").trim();
        // A heading that ends the Contents (List of figures, Preface...); the
        // Contents title again is its running header on the next page (8A6JDUIL).
        if ((b.type === "heading" || b.type === "paragraph") && t.length <= 40 && !/\d\s*$/.test(t)) {
            if (TOC_END.test(wvOlNorm(t))) { if (raw.length || buf.length) break; continue; }
            if (TOC_TITLES.test(wvOlNorm(t))) continue;
        }
        for (const it of (b.items && b.items.length ? b.items : [b.text])) {
            // Soft hyphens and "Circula¬ tion" joined; "CHAPTER 4FORMATION"
            // spaced; then (after a line without a page number is joined
            // with this one) a label's numeral tied to its word, never a page.
            // OCR's "Chapter I V." / "VII I." read as one numeral when it is one;
            // its "1. 5 The Second Variation" as 1.5 (FETCAYWF).
            let s = String(it || "").replace(/(\p{L})[¬­]\s*(\p{L})/gu, "$1$2")
                .replace(/^(\s*\d{1,2})\.\s(\d{1,2})(?=\s+\p{Lu})/u, "$1.$2")
                .replace(/\b(chapter|chapitre|part|partie)\s+([IVX]{1,3})\s([IVX]{1,3})(?=\s?[.:])/gi, (m0, w, a, b) => romanValue(a + b) ? w + " " + a + b : m0)
                .replace(/^(\s*(?:chapter|chapitre|part|partie|kapitel|teil)\s*(?:\d+|[IVXLC]+))(?=\p{Lu})/iu, "$1 ")
                .replace(LEADERS, " \u0001 ").replace(/\s+/g, " ").trim();
            if (!s) continue;
            if (s.replace(/[^\p{L}]/gu, "").length >= 3) lines++;
            let joined = 0;
            if (pending && !startsLabel(s)) { s = pending + " " + s; joined = pendLines; }
            // A labeled line without a page number before the next labeled one
            // ("Chapter 3 Kinematics" / "1. Introduction 50", XUQSXZPJ; "5 Single
            // drop impingement..." / "5.1 ... 107", 8A6JDUIL): the next one's page
            // (the landing check decides).
            else if (pending && startsLabel(pending + " ") && /\p{L}{3}/u.test(pending)) head = pending;
            pending = ""; pendLines = 0;
            s = s.replace(/(^|\s)(part|partie|teil|chapter|chapitre|kapitel|chap\.?|lecture|appendix|annexe?|anhang|§)\s+(\d+|[ivxlcdm]+|[a-z])(?![\p{L}\d])/giu, "$1$2\u0002$3");
            let m: RegExpExecArray | null, end = 0, found = 0;
            ENTRY.lastIndex = 0;
            while ((m = ENTRY.exec(s))) {
                const title = m[1].replace(/[\u0001\u0002]/g, " ").replace(/\s+/g, " ").trim();
                const printed = m[2];
                end = ENTRY.lastIndex;
                const roman = !/^\d+$/.test(printed);
                if (roman && !romanValue(printed.toUpperCase())) continue;
                found++;
                if (TOC_TITLES.test(wvOlNorm(title.replace(TOC_LABEL, "")))) continue;
                if (!roman) {
                    const v = Number(printed);
                    // A list of figures or an index after the Contents starts again low.
                    if (raw.length + buf.length >= 5 && v < maxArabic - 10) {
                        if (++lows >= 2) { buf.pop(); stop = true; break; }
                    }
                    else lows = 0;
                    maxArabic = Math.max(maxArabic, v);
                }
                if (head) { if (!roman) buf.push({ title: head, printed }); head = ""; }
                buf.push({ title, printed });
                if (raw.length + buf.length >= 600) { stop = true; break; }
            }
            if (found) hits += 1 + joined;
            else head = "";
            if (stop) break;
            const rest = s.slice(end).replace(/[\u0001\u0002]/g, " ").replace(/\s+/g, " ").trim();
            // A line without a page number goes on with the next one -- a bare
            // section number too ("3.7" / "Integrable versus Separable 43").
            if (rest && (/\p{L}/u.test(rest) || /^\d+(?:\.\d+)+\.?$/.test(rest)) && rest.length <= 160) { pending = rest; pendLines = found ? 0 : joined + 1; }
        }
    }
    if (buf.length) flush();
    // Too few letters ("Line ...••••36" keeps "Line": the landing decides).
    // The Contents' running header ("8 CONTENTS", AHB28M8B) is no entry.
    const parsedAll = raw.filter((e) => e.title.replace(/[^\p{L}]/gu, "").length >= 3 && !TOC_TITLES.test(wvOlNorm(e.title.replace(TOC_LABEL, ""))));
    if (parsedAll.length < 3) return { contentsPage: titlePage, parsed: parsedAll.length, landed: 0, mapping: "", pass: false, entries: [] };

    // Labels and levels.
    const kindOf = (t: string): { kind: WvOlTocEntry["kind"]; parts: string[] } => {
        let m = /^\s*(part|partie|teil)\b/i.exec(t);
        if (m) return { kind: "part", parts: [] };
        m = /^\s*(?:chapter|chapitre|kapitel|lecture|chap\.?)(?!\p{L})\s*(\d+|[a-z]+)?/iu.exec(t);
        if (m) return { kind: "chapter", parts: [m[1] ? (romanValue(m[1].toUpperCase()) ? String(romanValue(m[1].toUpperCase())) : String(NUM_WORDS.indexOf(m[1].toLowerCase()) + 1 || m[1])) : ""] };
        if (/^\s*(?:appendix|appendices|annexes?|anhang)\b/i.test(t)) return { kind: "appendix", parts: [] };
        if (/^\s*§/.test(t)) return { kind: "sect", parts: [] };
        m = /^\s*(\d+(?:\.\d+)*|[A-Z](?:\.\d+)+)\.?(?=\s|\p{Lu}|$)/u.exec(t);
        if (m) return { kind: "num", parts: m[1].split(".") };
        m = /^\s*([IVXLC]+)((?:\.\d+)*)[.)]?(?=\s)/.exec(t);
        if (m && romanValue(m[1])) return { kind: "roman", parts: [String(romanValue(m[1]))].concat(m[2] ? m[2].slice(1).split(".") : []) };
        if (/^\s*[A-Za-z][.)]\s/.test(t)) return { kind: "letter", parts: [] };
        return { kind: "none", parts: [] };
    };
    const ks = parsedAll.map((e) => kindOf(e.title));
    // "B Comparison of..." before "B.1 ...": an appendix (8A6JDUIL, K7IKEXJK).
    for (let j = 0; j < ks.length; j++) {
        const m = /^\s*([A-Z])\s+\p{Lu}/u.exec(parsedAll[j].title);
        const nx = ks.slice(j + 1).find((k) => k.kind !== "none");
        if ((ks[j].kind === "none" || ks[j].kind === "roman") && m && nx && nx.kind === "num" && nx.parts[0] === m[1]) ks[j] = { kind: "appendix", parts: [m[1]] };
    }
    // "C." after "B." is a letter, not Roman 100 (EV2CTTQD: A. B. C. under II.).
    let lastLetter = "";
    for (let j = 0; j < ks.length; j++) {
        const lab = (/^\s*([A-Za-z])[.)]\s/.exec(parsedAll[j].title) || [])[1] || "";
        if (ks[j].kind === "roman" && lab && lastLetter && lab.charCodeAt(0) === lastLetter.charCodeAt(0) + 1) ks[j] = { kind: "letter", parts: [] };
        if (ks[j].kind === "letter") lastLetter = lab;
        else if (ks[j].kind !== "none") lastLetter = "";
    }
    const chapterWords = ks.filter((k) => k.kind === "chapter").length >= 2;
    const firstChapter = ks.findIndex((k) => k.kind === "chapter");
    // Sections numbered again in each chapter: under "Chapter N" entries, or,
    // when the Contents lacks those, still sections (1., 2. ... 1. again, at
    // least twice) -- never chapters.
    let restarts = 0, lastSingle = 0;
    for (const k of ks) if (k.kind === "num" && k.parts.length === 1) { const v = Number(k.parts[0]); if (v <= lastSingle) restarts++; lastSingle = v; }
    const numUnder = (chapterWords && ks.some((k, j) => j > firstChapter && k.kind === "num" && k.parts.length === 1)) || restarts >= 2;
    const romanUnder = chapterWords && ks.some((k, j) => j > firstChapter && k.kind === "roman" && k.parts.length === 1);
    // Roman chapters without "Chapter" (rule 9's order): Roman > letters > Arabic (EV2CTTQD: VIII. > A. > 1.).
    const romanDoc = !chapterWords && ks.filter((k) => k.kind === "roman" && k.parts.length === 1).length >= 2;
    const repeated = new Map<string, number>();
    for (let j = 0; j < parsedAll.length; j++) if (ks[j].kind === "none") { const n = wvOlNorm(parsedAll[j].title); repeated.set(n, (repeated.get(n) || 0) + 1); }
    const entries: WvOlTocEntry[] = [];
    let inPart = false, chapNum = "", chapSeen = false, prevLabeled = 0, letterSince = false;
    for (let j = 0; j < parsedAll.length; j++) {
        const { kind, parts } = ks[j];
        const roman = !/^\d+$/.test(parsedAll[j].printed);
        const base = inPart ? 1 : 0;
        let level = base, chapter = false;
        if (kind === "part") { level = 0; inPart = true; }
        else if (kind === "chapter" || kind === "appendix") { level = base; chapter = true; chapNum = parts[0] || ""; chapSeen = true; }
        else if (kind === "num" && romanDoc && chapSeen) level = base + (letterSince ? 2 : 1) + parts.length - 1;
        else if (kind === "num") {
            level = base + parts.length - 1 + (numUnder ? 1 : 0);
            if (level === base) { chapter = true; chapNum = parts[0]; chapSeen = true; }
        }
        else if (kind === "roman") {
            level = base + parts.length - 1 + (romanUnder ? 1 : 0);
            if (level === base) { chapter = true; chapNum = parts[0]; chapSeen = true; letterSince = false; }
        }
        else if (kind === "sect") level = base + (chapterWords || ks.some((k) => k.kind === "roman") ? 1 : 0);
        else if (kind === "letter") { level = romanDoc && chapSeen ? base + 1 : prevLabeled + 1; letterSince = true; }
        else {
            // Unnumbered: under the chapter when repeated in the Contents
            // ("Problems", "References") or followed by its chapter's next
            // section; else at the top.
            let inside = (repeated.get(wvOlNorm(parsedAll[j].title)) || 0) >= 2;
            if (!inside && chapSeen) {
                const nx = ks.slice(j + 1).find((k) => k.kind !== "none");
                inside = !!nx && (nx.kind === "letter" || nx.kind === "sect" || ((nx.kind === "num" || nx.kind === "roman") && nx.parts.length > 1 && nx.parts[0] === chapNum)
                    || (numUnder && nx.kind === "num" && nx.parts.length === 1));
            }
            level = inside ? base + 1 : base;
            chapter = !inside;
        }
        if (roman) { level = 0; chapter = false; }
        if (kind !== "letter" && kind !== "none") prevLabeled = level;
        entries.push({ title: parsedAll[j].title, printed: parsedAll[j].printed, roman, kind, parts, level, chapter: chapter && !roman, pageIndex: null, landed: false, position: null });
    }

    // Landing: the page labels, else the best constant offset.
    const byPage = new Map<number, WvOlBlock[]>();
    for (const b of list) { const p = pageOfB(b); if (p < titlePage || p > lastPage) { const a = byPage.get(p); if (a) a.push(b); else byPage.set(p, [b]); } }
    const found = (e: WvOlTocEntry, idx: number | null): WvOlBlock | null => {
        if (idx == null || idx < 0 || idx >= pageCount) return null;
        const n = tocNeedle(e.title);
        if (!n.nd) return null;
        const on = byPage.get(idx) || [];
        let hit: WvOlBlock | null = null;
        for (const b of on) {
            const s = wvOlNorm(String(b.text || "").replace(TOC_LABEL, ""));
            if (s === n.nd || s.startsWith(n.nd + " ")) { if (b.type === "heading") return b; if (!hit) hit = b; }
        }
        if (hit || n.sig < 3) return hit;
        for (const b of on) if ((" " + wvOlNorm(b.text) + " ").includes(" " + n.nd + " ")) return b;
        return null;
    };
    const labelIdx = new Map<string, number>();
    pages.forEach((pg: any, k: number) => { const l = String((pg && pg.label) || "").trim().toLowerCase(); if (l && !labelIdx.has(l)) labelIdx.set(l, k); });
    const viaLabel = (e: WvOlTocEntry): number | null => { const k = labelIdx.get(e.printed.toLowerCase()); return k == null ? null : k; };
    let hitL = 0;
    for (const e of entries) if (!e.roman && found(e, viaLabel(e))) hitL++;
    let best = { off: 0, hit: -1 };
    for (let off = -40; off <= 80; off++) {
        let h = 0;
        for (const e of entries) if (!e.roman && found(e, Number(e.printed) - 1 + off)) h++;
        if (h > best.hit) best = { off, hit: h };
    }
    const useLabels = hitL > 0 && hitL >= best.hit;
    let landed = 0;
    for (const e of entries) {
        const idx = e.roman ? viaLabel(e) : useLabels ? viaLabel(e) : Number(e.printed) - 1 + best.off;
        e.pageIndex = idx != null && idx >= 0 && idx < pageCount ? idx : null;
        const b = found(e, e.pageIndex);
        if (!b || e.pageIndex == null) continue;
        e.landed = true; landed++;
        // On the block that shows the title: its box when it is a heading or
        // about the title's length, else its first line, else the page top.
        const bp = wvOlPosFromPageRects(b.pageRects, pageCount);
        const vr = pages[e.pageIndex] && pages[e.pageIndex].viewRect;
        if (bp && bp.pageIndex === e.pageIndex && (b.type === "heading" || String(b.text || "").length <= e.title.length * 1.5 + 10)) e.position = bp;
        else if (b.line && b.line[0] === e.pageIndex && finiteRect(b.line.slice(1))) e.position = { pageIndex: e.pageIndex, rects: [b.line.slice(1, 5)] };
        else if (finiteRect(vr)) e.position = { pageIndex: e.pageIndex, rects: [[vr[0], vr[3], vr[0], vr[3]]] };
        else { e.landed = false; landed--; }
    }
    return { contentsPage: titlePage, parsed: entries.length, landed, mapping: useLabels ? "page labels" : "offset " + best.off,
        pass: entries.length >= 3 && landed >= 0.6 * entries.length, entries };
}

/** Rule 21: words of one or two letters that stand alone (never joined to a neighbour). */
const SHORT_WORDS = new Set(["a", "i", "o", "e", "y", "à", "an", "am", "as", "at", "be", "by", "do", "he", "if", "in", "is", "it", "me", "my", "no",
    "of", "on", "or", "so", "to", "up", "us", "we", "la", "le", "de", "du", "en", "et", "un", "au", "ce", "il", "ne", "se", "sa", "es", "el", "al",
    "im", "zu", "um", "da", "ab", "ou", "où", "ni", "ma", "mi", "tu", "va", "vs"]);

/** Rule 21 (outline2.14, MJT 2026-11-24, 9UZMEV2M: "III. R esult s and
 *  Discussion"): a space inside a word closed. Up to three pieces, one of
 *  them one or two letters long and not a word of its own (SHORT_WORDS), are
 *  one word when the document's own paragraphs write that word (`vocab`,
 *  word counts) more often than any of its longer pieces alone (a fragment:
 *  "roplet"; a word: "the" before "m") -- on such a scan the glyph gaps
 *  alone cannot tell ("the R" 2.6, "R esidence" 3) --, and each space is no
 *  wider than 1.5 times the line's median space; Latin letters only on both
 *  sides ("2R mnx'", "J. R.", CJK never), the next piece in lower case unless
 *  all are capitals with a one-letter piece ("M OTION"). */
export function wvOlCloseSpaces(title: string, gaps: Array<number | null> | null, vocab: Map<string, number>): string {
    const toks = String(title || "").split(" ");
    if (toks.length < 2 || !vocab.size) return title;
    const real = (gaps || []).filter((g): g is number => g != null && g > 0).sort((x, y) => x - y);
    const med = real.length ? real[Math.floor(real.length / 2)] : 0;
    const gapAt = (i: number): number | null => gaps && gaps.length === toks.length - 1 ? gaps[i] : null;   // the space after toks[i]
    const piece = (t: string) => t.replace(/[,.;:]$/, "").split("-")[0];
    const LATIN = /^[A-Za-zÀ-ɏ]+$/;
    const joinable = (a: string, b: string, gap: number | null): boolean => {
        const bw = piece(b);
        return LATIN.test(a) && LATIN.test(bw)
            && (/^[a-zß-ÿ]/.test(bw) || (a === a.toUpperCase() && bw === bw.toUpperCase() && (a.length === 1 || bw.length === 1)))
            && !(gap != null && med > 0 && gap > 1.5 * med);
    };
    const out: string[] = [];
    for (let i = 0; i < toks.length;) {
        // The longest run of up to three pieces that the document writes as
        // one word ("R esult s" -> Results): one piece one or two letters long
        // and not a word of its own, the pieces of three letters or more none
        // of the document's words either (fragments: "the m" stays, "case m"
        // too), one such piece at least ("F u n d" stays).
        let best = 0;
        for (let j = Math.min(toks.length - 1, i + 2); j > i; j--) {
            let ok = true;
            for (let k = i; k < j && ok; k++) ok = joinable(k === i ? toks[k] : piece(toks[k]), toks[k + 1], gapAt(k)) && !/[,.;:]$/.test(toks[k]);
            if (!ok) continue;
            const ps = toks.slice(i, j + 1).map(piece);
            const shorts = ps.filter((p) => p.length <= 2), longs = ps.filter((p) => p.length >= 3);
            const n = vocab.get(ps.join("").toLowerCase()) || 0;
            // (A long piece the text uses as often as the joined word is a word:
            // "the" against "them"; one it uses less is the OCR's own fragment:
            // "roplet" against "droplet".)
            if (!n || !shorts.length || !longs.length || shorts.some((p) => SHORT_WORDS.has(p.toLowerCase())) || longs.some((p) => (vocab.get(p.toLowerCase()) || 0) >= n)) continue;
            best = j;
            break;
        }
        if (best) { out.push(toks.slice(i, best + 1).join("")); i = best + 1; }
        else { out.push(toks[i]); i++; }
    }
    return out.join(" ");
}

/** Rule 21: OCR's garbled formula at a title's end ("... over the Residence
 *  Time rrJ'cR 2dt and rrJ'cR2dt , 0 0•", "..., 'c") is cut off when what
 *  follows its first garbled token is not words (fewer than half plain words,
 *  one token at least with a quote or a bullet in it) and what precedes is
 *  three words or more, not ending on a connector ("... in H2O" stays); kept
 *  whole otherwise. */
export function wvOlCutGarble(title: string): string {
    // A footnote marker glued to a word ("Heating15 • 16") is the word's; a
    // quote inside a word is an elision or a possessive ("d'Euler", "SHIP'S").
    const toks = String(title || "").split(" ").map((t) => t.replace(/^(\p{L}{3,})\d{1,2}$/u, "$1"));
    const word = (t: string) => /^(?:\p{Lu}?\p{Ll}[\p{Ll}'’\-]*|\p{Lu}[\p{Lu}'’\-]*)[,.;:]?$/u.test(t);
    // Garbled for sure: a bullet ("0•", "1•2"), a quote before one or two
    // letters ("'c"), a quote among mixed case ("rrJ'cR").
    // (A long OCR'd word with a quote in it, "C’imulalionIlistribution", is no formula.)
    const strong = (t: string) => /[•∙]/.test(t) || /^['`´’]\p{L}{1,2}[,.;:]?$/u.test(t) || (/['’]/.test(t) && /\p{Ll}\p{Lu}/u.test(t) && t.length <= 8);
    const weak = (t: string) => !word(t) && (/\d\p{L}|\p{L}\d/u.test(t) || /\p{Ll}\p{Lu}/u.test(t));
    const g = toks.findIndex((t) => strong(t) || weak(t));
    if (g < 3) return title;
    const rest = toks.slice(g);
    if (!rest.some(strong) || rest.filter(word).length >= 0.5 * rest.length) return title;
    const head = toks.slice(0, g).join(" ").replace(/[\s,;:]+$/, "");
    const last = head.split(" ").pop() || "";
    // Not after an open parenthesis ("Meaning of (ω • ∇)u"), nor on a connector ("... in H2O").
    if (head.split(" ").length < 3 || (head.match(/\(/g) || []).length > (head.match(/\)/g) || []).length
        || !/^\p{L}{2,}[.)]?$/u.test(last) || JOIN_START.has(last.toLowerCase()) || JOIN_END.has(last.toLowerCase())) return title;
    return head;
}

/** Rule 19: a bookmark label that is a file name ("07.0_pp_28_63_Dimensions_
 *  dimensional_analysis_and_similarity", "_Cover"): no space, an underscore. */
export function wvOlFileLabel(t: string): boolean {
    const s = String(t || "").trim();
    return !!s && !/\s/.test(s) && s.includes("_");
}

/** Rule 19: a bookmark label that is an internal anchor, not a title ("s1",
 *  "s3B1", "f2", "datalink4", "flink7", "temp:book:Section1"): one token with a
 *  digit, or of three characters at most, or colon-separated; file names aside. */
export function wvOlIdLabel(t: string): boolean {
    const s = String(t || "").trim();
    if (!s || wvOlFileLabel(s)) return false;
    if (/^\w+:\w+:/.test(s)) return true;
    return /^[A-Za-z][\w.:-]*\d[\w.:-]*$/.test(s) || /^[a-z][a-z0-9]{0,2}$/.test(s);
}

/** Rule 19: a file-name label as words -- its "NN.N_pp_a_b_" prefix and
 *  leading underscores off, underscores to spaces ("Dimensions dimensional
 *  analysis and similarity", "Cover"). */
export function wvOlCleanLabel(t: string): string {
    return String(t || "").trim().replace(/^_+/, "").replace(/^\d{1,3}(?:\.\d+)?_(?:pp_[ivxlcdm\d]+_[ivxlcdm\d]+_)?/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/** Rule 19: front and back matter a publisher's bookmark may name: Weavero's
 *  headings are never filled into their pages (QCTQJ9ZR: "Human Kinetics"
 *  under Title page). */
const NO_FILL = /^(?:cover|front ?matter|half ?title( page)?|title( page)?|copyright( page)?|imprint|dedication|epigraph|frontispiece|series( page| list)?|praise( for)?.*|contents|table of contents|brief contents|detailed contents|preface|foreword|prologue|list of (?:figures|tables|abbreviations|symbols|illustrations|contributors)|about the authors?|about this book|back ?matter|end ?matter)$/;
/** Rule 19: a reference list or an index: only appendices and back matter are filled in after it. */
const REFS_RANGE = /^(?:references.*|bibliography|bibliographie|literatur|further reading|reading list|index|subject index|author index|name index)$/;

/** Rule 19: the PDF's own bookmarks are GOOD -- usable (not all one label,
 *  web links aside, at least two with a page), in page order (90 % of
 *  neighbouring pairs), and covering the document: from its first fifth to
 *  half of its pages or more (MJT 2026-11-24, outline2.13). */
export function wvOlGoodBookmarks(items: any[], pageCount: number, pageOfRef?: (i: number) => number | null): boolean {
    if (!Array.isArray(items) || !items.length || !items.every((it: any) => it && it.source === "native") || pageCount <= 0) return false;
    const flat: any[] = [];
    const w = (l: any[]) => { for (const it of l || []) { if (it && typeof it.title === "string") { flat.push(it); w(it.children); } } };
    w(items);
    if (flat.length > 1 && flat.every((it) => wvOlNorm(it.title) === wvOlNorm(flat[0].title))) return false;
    // Labels that are the PDF's internal anchors ("s1", "d3", "s3B1", "f2":
    // YX2VNV67, E7GR9W3T, 3FGNK2WV) are no outline: not good with 20 % of them.
    if (flat.filter((it) => wvOlIdLabel(it.title)).length >= 0.2 * flat.length) return false;
    // A destination's page, else (Zotero 10.0.8 stores none, only the heading
    // block it found) that block's page.
    const pageOf = (it: any): any => {
        const p = it.target && it.target.position && it.target.position.pageIndex;
        if (Number.isInteger(p)) return p;
        return pageOfRef && Array.isArray(it.ref) && Number.isInteger(it.ref[0]) ? pageOfRef(it.ref[0]) : null;
    };
    const pages = flat.map(pageOf).filter((p) => Number.isInteger(p) && p >= 0 && p < pageCount) as number[];
    if (pages.length < 2) return false;
    let ordered = 0;
    for (let k = 1; k < pages.length; k++) if (pages[k] >= pages[k - 1]) ordered++;
    const lo = Math.min(...pages), hi = Math.max(...pages);
    return ordered >= 0.9 * (pages.length - 1) && lo <= 0.2 * pageCount && hi - lo + 1 >= 0.5 * pageCount;
}

/** Rule 18: the Contents' kept entries as an outline -- a section whose chapter
 *  was not kept, or is missing from the Contents (its sections numbered from 1
 *  again), goes up one level; a level is never skipped. */
function tocTree(toc: WvOlToc): WvOlNode[] {
    const root: WvOlNode[] = [];
    const parents: WvOlNode[][] = [root];
    let prev = -1, cur: { num: string | null; kept: boolean } | null = null, lastSec = 0, partUp = 0;
    for (const e of toc.entries) {
        const kept = e.landed && !!e.position;
        // Under a Part that was not kept, everything goes up one level (QAH788DY).
        if (e.kind === "part") { partUp = kept ? 0 : 1; cur = null; }
        // An unkept chapter-level line repeating the kept chapter's number
        // (OCR's "3. I Constants of Motion" for 3.1, FETCAYWF) is not a new chapter.
        if (e.chapter && !(!kept && cur && cur.kept && cur.num && e.parts[0] === cur.num)) { cur = { num: e.parts[0] || null, kept }; lastSec = 0; }
        else if (e.kind === "letter") lastSec = 0;
        else if ((e.kind === "num" || e.kind === "roman") && e.parts.length === 1 && e.level > 0) {
            const v = Number(e.parts[0]);
            if (v <= lastSec) cur = { num: null, kept: false };
            lastSec = v;
        }
        if (!kept) continue;
        let level = e.kind === "part" ? e.level : Math.max(0, e.level - partUp);
        if (!e.chapter && level > 0 && e.kind !== "part") {
            // (An unnumbered chapter -- an edited volume's "INTEGRATION OF ...
            // Rolf Isermann" -- takes the sections after it, W65XGWST.)
            const orphan = !cur || ((e.kind === "num" || e.kind === "roman") && e.parts.length > 1 ? !(cur.kept && (cur.num === e.parts[0] || cur.num === null)) : !cur.kept);
            if (orphan) level--;
        }
        level = Math.max(0, Math.min(level, prev + 1));
        prev = level;
        const node: WvOlNode = { title: e.title, url: null, position: e.position, href: null, items: [] };
        parents.length = level + 1;
        (parents[level] || root).push(node);
        parents[level + 1] = node.items;
    }
    return root;
}

function finiteRect(r: any): boolean {
    return Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every((v: any) => typeof v === "number" && Number.isFinite(v));
}

/** A block's `anchor.pageRects` as a panel position: the rects on its first
 *  page (a heading running onto the next page is landed and lit on the first). */
export function wvOlPosFromPageRects(pageRects: any, pageCount: number): { pageIndex: number; rects: number[][] } | null {
    if (!Array.isArray(pageRects)) return null;
    let page = -1;
    const rects: number[][] = [];
    for (const pr of pageRects) {
        if (!Array.isArray(pr) || !Number.isInteger(pr[0]) || pr[0] < 0 || pr[0] >= pageCount) continue;
        const r = pr.slice(1, 5);
        if (!finiteRect(r)) continue;
        if (page < 0) page = pr[0];
        if (pr[0] === page) rects.push(r);
    }
    return page < 0 ? null : { pageIndex: page, rects };
}

/** The plain text of a block (its text nodes, in order). */
export function wvOlBlockText(b: any): string {
    const parts: string[] = [];
    const walk = (n: any) => {
        if (!n) return;
        if (typeof n.text === "string") { parts.push(n.text); return; }
        if (Array.isArray(n.content)) for (const c of n.content) walk(c);
    };
    walk(b);
    return parts.join("").replace(/\s+/g, " ").trim();
}

/** Lower case, accents off, letters and digits only, single spaces. */
export function wvOlNorm(s: string): string {
    let t = String(s == null ? "" : s);
    try { t = t.normalize("NFKD").replace(/\p{M}+/gu, ""); } catch (_) {}
    t = t.toLowerCase();
    try { t = t.replace(/[^\p{L}\p{N}]+/gu, " "); } catch (_) { t = t.replace(/[^a-z0-9]+/g, " "); }
    return t.replace(/\s+/g, " ").trim();
}

// Unnumbered standard section words, normalized (wvOlNorm): English and the
// languages of the test base (fr, de, es, it, ru, zh, ja, ko).
const SECTION_WORDS = new Set([
    "introduction", "conclusion", "conclusions", "summary", "discussion", "references", "bibliography",
    "acknowledgment", "acknowledgments", "acknowledgement", "acknowledgements", "appendix", "appendices",
    "nomenclature", "abstract", "methods", "materials and methods", "results", "results and discussion",
    "background", "concluding remarks", "summary and conclusions", "conclusions and outlook", "conclusion and outlook",
    "resume", "references bibliographiques", "bibliographie", "remerciements", "annexe", "annexes", "resultats", "methodes",
    "einleitung", "zusammenfassung", "schluss", "schlussfolgerung", "schlussfolgerungen", "fazit", "literatur",
    "literaturverzeichnis", "danksagung", "anhang", "diskussion", "ergebnisse", "methoden",
    "introduccion", "conclusion", "conclusiones", "resumen", "referencias", "bibliografia", "agradecimientos",
    "apendice", "discusion", "resultados", "metodos",
    "introduzione", "conclusione", "conclusioni", "riassunto", "sommario", "ringraziamenti", "appendice",
    "discussione", "risultati", "metodi",
    "введение", "заключение", "литература", "список литературы", "выводы", "аннотация",
    "引言", "前言", "结论", "参考文献", "摘要", "致谢", "讨论", "结果",
    "はじめに", "序論", "結論", "謝辞", "要旨",
    "서론", "결론", "참고문헌", "초록",
]);

const CONNECTORS = new Set(["and", "et", "und", "y", "e", "with", "mit", "avec", "con"]);
/** Rule 20: words that start a heading's second line, or end its first (and articles end it). */
const JOIN_START = new Set(["of", "in", "and", "for", "to", "on", "with", "from", "by", "at", "as", "or", "&", "into", "under", "over", "between", "within", "versus", "vs",
    "de", "du", "des", "et", "en", "au", "aux", "und", "von", "im", "zur", "zum"]);
const JOIN_END = new Set(["a", "an", "the", "la", "le", "les", "der", "die", "das", "ein", "eine"]);
/** Entries that are only a connector ("or" @18, "and" @38 in YX7EPSV9: OCR fragments). */
const CONNECTOR_ONLY = /^(?:or|and|of|the|in|on|for|to|a|an|with|by|at|as|et|ou|und|oder|de|la|le|les|du|des)$/;
const ROMAN = /^[ivxlcdm]+$/i;

/** Rule 5: "part" / "Fart" before a Roman numeral reads "Part". */
export function wvOlFixOcr(title: string): string {
    return String(title).replace(/^(\s*)[pf]art(\s+)([ivxlcdm]+)(?=$|[^a-z])/i, (_m, a, sp, r) => a + "Part" + sp + String(r).toUpperCase());
}

/** The outline number a title starts with ("2.1", "IV", "A"), as its parts; [] without one. */
export function wvOlNumbering(title: string): string[] {
    const m = /^\s*((?:\d+|[A-Za-z]+)(?:[.-](?:\d+|[A-Za-z]+))*)(?=\s|[.)\-:]|$)/.exec(String(title || ""));
    if (!m) return [];
    const parts = m[1].split(/[.-]/);
    for (const p of parts) {
        if (/^\d+$/.test(p)) continue;
        if (/^[A-Za-z]$/.test(p)) continue;
        if (ROMAN.test(p) && p.length <= 4) continue;
        return [];
    }
    return parts;
}

/** Whether two outlines are the same as the panel shows them: titles (spaces
 *  collapsed), nesting, places (page and boxes) and links. Weavero's extracted
 *  outline equal to Zotero's is shown as Zotero's (MJT 2026-11-24: "amber =
 *  Weavero changed something, grey = Zotero's as is"). */
export function wvOlSameTree(a: WvOlNode[], b: WvOlNode[]): boolean {
    const key = (t: WvOlNode[]): any[] => (t || []).map((n) => [String(n.title == null ? "" : n.title).replace(/\s+/g, " ").trim(),
        n.url || null, n.position ? [n.position.pageIndex, n.position.rects] : null, key(n.items)]);
    try { return JSON.stringify(key(a)) === JSON.stringify(key(b)); } catch (_) { return false; }
}

/** Part / Chapter (top level) or Section (by its number) + a numeral. */
function partChapter(title: string): { kind: "part" | "section"; depth: number } | null {
    const m = new RegExp("^\\s*(part|chapter|chap\\.|section)\\s+([ivxlcdm]+|\\d+(?:\\.\\d+)*|" + NUM_WORDS.join("|") + ")(?=$|[^a-z0-9])", "i").exec(String(title || ""));
    if (!m) return null;
    if (!/^[ivxlcdm\d]/i.test(m[2]) && /^section$/i.test(m[1])) return null;
    if (/^section$/i.test(m[1])) return { kind: "section", depth: m[2].split(".").length - 1 };
    return { kind: "part", depth: 0 };
}

/** Whether a title, numbering aside, is a standard section word. */
export function wvOlIsSectionWord(title: string): boolean {
    const t = String(title || "").replace(/^\s*((?:\d+|[A-Za-z])(?:[.-](?:\d+|[A-Za-z]))*)[.)\s:-]+/, "");
    return SECTION_WORDS.has(wvOlNorm(t));
}

/** The fingerprint of the extraction code (as cited-by.ts fingerprints its
 *  matcher): this module's functions and word list. An edited outline keeps it
 *  with its base (bookmarks.ts _wvOutlineEnsureCurated), so a later extraction
 *  by other code can be told apart from the one the user started from. */
let buildFp = "";
export function wvOutlineBuildFp(): string {
    if (buildFp) return buildFp;
    const src = [wvOutlineBuild, wvOlFixOcr, wvOlNumbering, wvOlIsSectionWord, wvOlNorm, wvOlBlockText, wvOlPosFromPageRects, partChapter,
        romanValue, toRoman, caseOfText, labelTok, isSentence, isCitation, VERBS_EN, VERBS_FR, VERBS_DE, wvRefListIsTitle, wvOlLead, wvOlRunIns, wvOlRunningHeaders, wvOlCharBoxes, wvOlLostSpaces, glyphGaps, wvOlRefListStart, KERN_PAIRS,
        wvOlItems, wvOlContents, tocNeedle, tocTree, TOC_TITLES, TOC_END, TOC_LABEL,
        wvOlGoodBookmarks, wvOlFileLabel, wvOlCleanLabel, wvOlIdLabel, NO_FILL, REFS_RANGE, CONNECTOR_ONLY, [...JOIN_START].join(","), [...JOIN_END].join(","),
        wvOlSpaceGaps, wvOlCloseSpaces, wvOlCutGarble, [...SHORT_WORDS].join(",")]
        .map((f) => String(f)).join("|") + "|" + [...SECTION_WORDS].join(",") + "|" + [...CONNECTORS].join(",") + "|" + NUM_WORDS.join(",") + "|" + RUNIN_STOP.source + "|" + [...BACK_MATTER].join(",");
    let h = 2166136261;
    for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (buildFp = "ob:" + h.toString(36) + ":" + src.length.toString(36));
}

/** Chapter numbers written as words (rule 11). */
const NUM_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** A Roman numeral's value, upper case and written the standard way only; 0 otherwise. */
function romanValue(s: string): number {
    const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const a = v[s[i]], b = v[s[i + 1]] || 0;
        if (!a) return 0;
        n += a < b ? -a : a;
    }
    return n > 0 && toRoman(n) === s ? n : 0;
}
function toRoman(n: number): string {
    const t: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let o = "";
    for (const [v, r] of t) while (n >= v) { o += r; n -= v; }
    return o;
}

/** "caps" when >= 90 % of a text's letters are capitals, "mixed" otherwise, "" without letters. */
function caseOfText(t: string): string {
    const letters = String(t || "").replace(/[^\p{L}]/gu, "");
    if (!letters) return "";
    let up = 0;
    for (const ch of letters) if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) up++;
    return up / letters.length >= 0.9 ? "caps" : "mixed";
}

/** A Roman or letter label at a title's start ("IV. ", "A) ", OCR's "Vl. "), or
 *  a capital glued to its first word ("C.Average..."); the text after it. */
function labelTok(t: string): { raw: string; rest: string; glued: boolean } | null {
    let m = /^\s*([A-Za-z|]{1,7})\s*[.)]\s+(?=\S)/.exec(t);
    if (m) return { raw: m[1], rest: t.slice(m[0].length), glued: false };
    m = /^\s*([A-Z])\.(?=\p{Lu}\p{Ll})/u.exec(t);
    if (m) return { raw: m[1], rest: t.slice(m[0].length), glued: true };
    return null;
}

/** Rule 12: a body sentence (never a section word). */
function isSentence(t: string): boolean {
    const s = String(t || "").trim();
    if (!/[.:;,]$/.test(s)) return false;
    if (/^\d+[.,]\d+\p{Ll}/u.test(s)) return true;
    if ( /(?:\.\s*){3}$|\u2026$/.test(s) || wvOlIsSectionWord(s)) return false;
    if (/\p{L}{22,}/u.test(s)) return true;
    const words = s.split(/\s+/).filter((w) => /\p{L}/u.test(w));
    // A period after a short phrase is a heading's ("Le traitement primaire.").
    if (words.length < (/\.$/.test(s) ? 5 : 3) || !/^\p{Lu}/u.test(words[0])) return false;
    const after = words.slice(1);
    if (!(after.filter((w) => /^\p{Ll}/u.test(w)).length / after.length >= 0.75 && after.filter((w) => /^\p{Ll}{4,}/u.test(w)).length >= 2)) return false;
    // Before a colon: a sentence only with a verb in it; a noun phrase there
    // is a heading ("Mise en oeuvre de la methodologie :").
    if (/:$/.test(s)) return /\s:$/.test(s) ? VERBS_FR.test(s) || VERBS_DE.test(s) : VERBS_EN.test(s) || VERBS_DE.test(s);
    return true;
}

/** Rule 12: finite-verb cues of a sentence introducing what follows (English,
 *  French -- a space before the colon --, German). */
const VERBS_EN = /\b(?:is|are|was|were|be|been|has|have|had|do|does|did|can|could|may|might|must|shall|should|will|would|exists?|shows?|shown|includes?|follows?|following|gives?|given|see|cite[ds]?|there|reads?|becomes?|obtain(?:s|ed)?)\b/i;
const VERBS_FR = /(?:^|[\s'\u2019(])(?:est|sont|a|ont|\u00e9t\u00e9|\u00e9tait|\u00e9taient|sera|seront|peut|peuvent|doit|doivent|faut|permet|permettent|permis|indique|indiquent|suivants?|suivantes?|voici|comprend|comprennent|comporte|comportent|cit\u00e9e?s?|citer|comparons|notons|rappelons|consid\u00e9rons|supposons|posons|voyons|r\u00e9sumons|examinons|calculons|d\u00e9finissons)(?=$|[\s,.;:!?)])/iu;
const VERBS_DE = /\b(?:ist|sind|war|waren|hat|haben|wird|werden|kann|k\u00f6nnen|folgt|folgende[nr]?|gilt|sei)\b/iu;

/** Rule 13: a reference-list entry's shape -- initials with a comma, a year, and
 *  two more numbers (volume, page). */
function isCitation(t: string): boolean {
    const s = String(t || "");
    const year = /(?:^|[^\d])(1[5-9]\d\d|20\d\d)(?![\d])/.exec(s);
    if (!year) return false;
    const initials = /\p{Lu}\.(?:\s?\p{Lu}\.)*\s*,|,\s*\p{Lu}\.(?:\s?\p{Lu}\.)*|\bet al\b/u.test(s);
    const nums = (s.replace(year[1], " ").match(/(?:^|[^\d.])\d{1,4}(?![\d.]\d)/g) || []).length;
    return initials && nums >= 2;
}

interface Entry {
    title: string;
    ref: number | null;
    target: any;
    url: string | null;
    depth: number;
    restored: boolean;
    drop: boolean;
    page: number | null;
    level: number;
    /** The index of the entry Zotero nested this one under; null at the top. */
    parent: number | null;
    /** The same parent as an entry (indexes move when an entry is restored). */
    parentE: Entry | null;
    /** Rule 7: one level up from where Zotero put it. */
    up: boolean;
}

/** Weavero's extracted outline: `catOutline` (catalog.outline as stored),
 *  `blocks` (every top-level block summarized, index-aligned or with `i`),
 *  `pages` (catalog.pages), `meta` (the parent item's title and creators);
 *  `notes` collects what a rule kept on one signal alone (debug output). */
export function wvOutlineBuild(catOutline: any[], blocks: WvOlBlock[], pages: any[], meta: WvOlMeta, notes?: string[]): WvOlNode[] {
    const note = (m: string) => { try { if (notes) notes.push(m); } catch (_) {} };
    const items: any[] = Array.isArray(catOutline) ? catOutline : [];
    const pageCount = Array.isArray(pages) ? pages.length : 0;
    const byIdx = new Map<number, WvOlBlock>();
    for (const b of blocks || []) if (b && Number.isInteger(b.i)) byIdx.set(b.i, b);
    const pageOfBlock = (i: number | null): number | null => {
        const b = i == null ? null : byIdx.get(i);
        const pr = b && Array.isArray(b.pageRects) && b.pageRects[0];
        return pr && Number.isInteger(pr[0]) ? pr[0] : null;
    };

    // The base: Zotero's generated outline, flattened in document order with
    // its depths; else (the PDF's own outline, or none) the heading blocks.
    const entries: Entry[] = [];
    const own = items.length > 0 && items.every((it: any) => it && it.source === "native");
    const mk = (title: string, ref: number | null, target: any, url: string | null, depth: number, restored: boolean): Entry => {
        const page = ref != null ? pageOfBlock(ref)
            : (target && target.position && Number.isInteger(target.position.pageIndex) ? target.position.pageIndex : null);
        return { title: String(title || ""), ref, target, url, depth, restored, drop: false, page, level: 0, parent: null, parentE: null, up: false };
    };
    if (items.length && !own) {
        const walk = (list: any[], depth: number, parent: Entry | null) => {
            for (const it of list || []) {
                if (!it || typeof it.title !== "string") continue;
                const ref = Array.isArray(it.ref) && Number.isInteger(it.ref[0]) ? it.ref[0] : null;
                const url = it.target && typeof it.target.url === "string" ? it.target.url : null;
                const e = mk(it.title, ref, it.target || null, url, depth, false);
                (e as any)._p = parent;
                entries.push(e);
                walk(it.children, depth + 1, e);
            }
        };
        walk(items, 0, null);
        // Rule 3: heading blocks Zotero's generator dropped, back in document order.
        const used = new Set<number>(entries.filter((e) => e.ref != null).map((e) => e.ref as number));
        for (const b of blocks || []) {
            if (!b || b.type !== "heading" || used.has(b.i)) continue;
            const t = wvOlFixOcr(b.text);
            const pcb = partChapter(t);
            if (!pcb && !wvOlIsSectionWord(t)) continue;
            const at = entries.findIndex((e) => e.ref != null && (e.ref as number) > b.i);
            // "CHAPTER FOUR" alone, its title the next heading on the page:
            // one entry, as Zotero's own "CHAPTER ONE THE PEN CLUB ..." reads.
            let text = b.text;
            const nb = byIdx.get(b.i + 1);
            if (pcb && pcb.kind === "part" && new RegExp("^\\s*\\S+\\s+\\S+\\s*[.:]?\\s*$").test(t) && nb && nb.type === "heading"
                && !used.has(nb.i) && pageOfBlock(nb.i) === pageOfBlock(b.i) && !partChapter(nb.text)) text = b.text + " " + nb.text;
            const e = mk(text, b.i, null, null, 0, true);
            if (at < 0) entries.push(e); else entries.splice(at, 0, e);
        }
    }
    else {
        for (const b of blocks || []) if (b && b.type === "heading") entries.push(mk(b.text, b.i, null, null, 0, false));
    }
    // The PDF's own bookmarks (rules 14, 15): usable when not all labelled
    // alike; a single top entry that is the paper's title is its wrapper.
    const ownFlat: Array<{ it: any; depth: number }> = [];
    if (own) { const w = (l: any[], d: number) => { for (const it of l || []) { if (it && typeof it.title === "string") { ownFlat.push({ it, depth: d }); w(it.children, d + 1); } } }; w(items, 0); }
    const ownUsable = ownFlat.length > 0 && !(ownFlat.length > 1 && ownFlat.every((x) => wvOlNorm(x.it.title) === wvOlNorm(ownFlat[0].it.title)));
    const sameTitle = (a: string, b: string) => { const x = wvOlNorm(a), y = wvOlNorm(b); return !!x && !!y && (x === y || (x.length >= 12 && y.startsWith(x)) || (y.length >= 12 && x.startsWith(y))); };
    const wrapper = own && ownUsable && items.length === 1 && Array.isArray(items[0].children) && items[0].children.length
        && ((meta && meta.title && sameTitle(items[0].title, meta.title)) || entries.some((e) => e.page === 0 && sameTitle(e.title, items[0].title)))
        ? items[0] : null;

    for (const e of entries) e.title = wvOlFixOcr(e.title.replace(/\s+/g, " ").trim());

    // Rule 21 (outline2.14): spaces inside words closed, against the words of
    // the document's own paragraphs; the gaps of the heading's own spaces when
    // its title is still its text.
    let vocab: Map<string, number> | null = null;
    const vocabOf = (): Map<string, number> => {
        if (vocab) return vocab;
        const v = new Map<string, number>();
        for (const b of blocks || []) {
            if (!b || b.type === "heading") continue;
            for (const m of String(b.text || "").toLowerCase().matchAll(/\p{L}{3,}/gu)) v.set(m[0], (v.get(m[0]) || 0) + 1);
        }
        return (vocab = v);
    };
    for (const e of entries) {
        const b = e.ref == null ? null : byIdx.get(e.ref);
        if (!b || !/(?:^|\s)\p{L}{1,2}(?:\s|$)/u.test(e.title)) continue;
        const gaps = b.spaceGaps && wvOlFixOcr(String(b.text || "").replace(/\s+/g, " ").trim()) === e.title ? b.spaceGaps : null;
        const t = wvOlCloseSpaces(e.title, gaps, vocabOf());
        if (t !== e.title) { note("closed spaces: " + e.title + " -> " + t); e.title = t; }
    }

    // Rule 20: a heading line that goes on with the previous one (outline2.13,
    // MJT 2026-11-24, QCTQJ9ZR: "Finding Caffeine" / "in Our Diets") is joined
    // to it: the next block on the same page, just below it, the same line
    // height, unlabeled, and starting in lower case or with a connector -- or
    // the line before ending with one ("... BY DEPOSITION OF" / "DROPLETS ON A
    // SURFACE", EHBJ246M).
    const boxOf = (e: Entry): number[] | null => {
        const b = e.ref == null ? null : byIdx.get(e.ref);
        const pr = b && b.type === "heading" && Array.isArray(b.pageRects) && b.pageRects[0];
        return pr && Number.isInteger(pr[0]) && finiteRect(pr.slice(1)) ? pr : null;
    };
    for (let k = 1; k < entries.length; k++) {
        const a = entries[k - 1], c = entries[k];
        if (a.drop || c.drop || a.ref == null || c.ref !== a.ref + 1) continue;
        const pa = boxOf(a), pc = boxOf(c);
        if (!pa || !pc || pa[0] !== pc[0]) continue;
        const ha = pa[4] - pa[2], hc = pc[4] - pc[2];
        if (!(ha > 0 && hc > 0 && Math.abs(ha - hc) <= 0.15 * Math.max(ha, hc) && pc[4] <= pa[2] + 0.2 * ha && pa[2] - pc[4] <= 1.2 * ha)) continue;
        if (partChapter(c.title) || wvOlNumbering(c.title).length || labelTok(c.title) || /[.:;!?]$/.test(a.title) || isSentence(a.title + " " + c.title)) continue;
        // A credit line under a heading is no part of it (R6WPQD9Y: "6.1 Cloques
        // mouillées" / "réalisé avec Sébastien Réau et Benoît Roman").
        if (/^(?:r[ée]alis[ée]e?s?|en collaboration|in collaboration|joint work|work done)(?![\p{L}])/iu.test(c.title)) continue;
        const first = (c.title.split(/\s+/)[0] || ""), last = (a.title.split(/\s+/).pop() || "");
        if (!(/^\p{Ll}/u.test(first) || /,$/.test(a.title) || JOIN_START.has(first.toLowerCase()) || JOIN_START.has(last.toLowerCase()) || JOIN_END.has(last.toLowerCase()))) continue;
        a.title = a.title + " " + c.title;
        (a as any).joinRefs = ((a as any).joinRefs || []).concat([c.ref]);
        c.drop = true;
        (c as any).joined = true;
        note("joined heading lines: " + a.title);
    }

    // Rule 21: a garbled formula at a title's end cut off (block-derived titles).
    for (const e of entries) {
        if (e.ref == null || e.drop) continue;
        const t = wvOlCutGarble(e.title);
        if (t !== e.title) { note("cut garbled math: " + e.title + " -> " + t); e.title = t; }
    }

    // Running headers: the same text near the top or bottom of many pages;
    // and (outline2.13, YX7EPSV9's "0. Introduction" at the top of pages 28
    // and 30) a heading whose very text stands in the top or bottom 10 % of
    // two pages or more.
    const running = wvOlRunningHeaders(blocks, pages);
    const banded = new Map<string, Map<number, number>>();
    const inBand8 = (b: WvOlBlock): boolean => {
        const pr = Array.isArray(b.pageRects) && b.pageRects[0];
        const vr = pr && pages[pr[0]] && pages[pr[0]].viewRect;
        if (!pr || !finiteRect(vr) || !finiteRect(pr.slice(1))) return false;
        const h = vr[3] - vr[1];
        return h > 0 && (pr[2] >= vr[3] - 0.1 * h || pr[4] <= vr[1] + 0.1 * h);
    };
    const bandH = (b: WvOlBlock): number => { const pr = (b.pageRects as any[])[0]; return pr[4] - pr[2]; };
    for (const b of blocks || []) {
        if (!b || !inBand8(b)) continue;
        const k = wvOlNorm(b.text);
        if (k) (banded.get(k) || (banded.set(k, new Map()).get(k) as Map<number, number>)).set((b.pageRects as any[])[0][0], bandH(b));
    }
    // Repeated within two pages (a running header runs on; a chapter's own
    // "BIBLIOGRAPHICAL NOTES" recurs chapters apart), and not taller than the
    // repeats (a chapter's title at its page top, its running header after it).
    const bandRepeat = (e: Entry): boolean => {
        const b = e.ref == null ? null : byIdx.get(e.ref);
        if (!b || !inBand8(b)) return false;
        const s = banded.get(wvOlNorm(e.title));
        const p = (b.pageRects as any[])[0][0], h = bandH(b);
        if (!s) return false;
        for (const [q, hq] of s) if (q !== p && Math.abs(q - p) <= 2 && h <= 1.2 * hq) return true;
        return false;
    };

    // Rule 1: bylines (the item's creators), first two pages only.
    const names = new Set<string>(), lasts = new Set<string>();
    for (const c of (meta && meta.creators) || []) {
        for (const t of wvOlNorm(c.lastName || c.name || "").split(" ")) if (t.length > 1) { names.add(t); lasts.add(t); }
        for (const t of wvOlNorm(c.firstName || "").split(" ")) if (t.length > 1) names.add(t);
    }
    const isByline = (e: Entry) => {
        if (!lasts.size || e.page == null || e.page > 1) return false;
        const toks = wvOlNorm(e.title).split(" ").filter((t) => t.length > 1 && !CONNECTORS.has(t));
        return toks.length > 0 && toks.some((t) => lasts.has(t)) && toks.every((t) => names.has(t));
    };
    // Rule 2: the title's lines, first two pages only.
    const titleToks = new Set<string>(wvOlNorm((meta && meta.title) || "").split(" ").filter(Boolean));
    const isTitle = new Set<Entry>();
    if (titleToks.size) {
        for (const e of entries) {
            if (e.page == null || e.page > 1) continue;
            const h = wvOlNorm(e.title).split(" ").filter(Boolean);
            if (h.length >= 3 && h.filter((t) => titleToks.has(t)).length / h.length >= 0.8) isTitle.add(e);
        }
        for (let k = 0; k < entries.length; k++) {
            const e = entries[k];
            if (isTitle.has(e) || e.page == null || e.page > 1 || e.ref == null || wvOlIsSectionWord(e.title)) continue;
            const h = wvOlNorm(e.title).split(" ").filter(Boolean);
            if (!h.length || !h.every((t) => titleToks.has(t))) continue;
            const near = entries.some((o) => isTitle.has(o) && o.ref != null && Math.abs((o.ref as number) - (e.ref as number)) <= 2);
            if (near) isTitle.add(e);
        }
    }
    const labeled = (t: string) => !!(partChapter(t) || wvOlNumbering(t).length || labelTok(t));
    let afterRefs = false;
    for (const e of entries) {
        const letters = e.title.replace(/[^\p{L}\p{N}]/gu, "");
        if ((e as any).joined) e.drop = true;                                 // rule 20
        else if (letters.length <= 1 || CONNECTOR_ONLY.test(wvOlNorm(e.title)) || /^\p{Ll}{2}$/u.test(letters)) e.drop = true;   // rule 4 (and a lone connector, OCR's "kk")
        else if (bandRepeat(e)) e.drop = true;                                 // a chapter's running header
        else if (isByline(e) || isTitle.has(e)) e.drop = true;                // rules 1, 2
        else if (wrapper && e.page === 0 && sameTitle(e.title, wrapper.title)) e.drop = true;
        else if (running.has(wvOlNorm(e.title).replace(/\d+/g, "").trim())) e.drop = true;
        else if (isSentence(e.title) && (!labeled(e.title) || /^\d+[.,]\d+\p{Ll}/u.test(e.title))) e.drop = true;   // rule 12
        else if (isCitation(e.title) && !wvOlIsSectionWord(e.title) && !partChapter(e.title)) e.drop = true;          // rule 13
        else if (afterRefs && !labeled(e.title) && !wvOlIsSectionWord(e.title) && /(?:^|[^\d])(1[5-9]\d\d|20\d\d)(?!\d)/.test(e.title)
            && /\p{Lu}\.|\bet al\b|\bpp?\.\s*\d|\d+\s*[-\u2013]\s*\d+|\d+\s*,\s*\d+/u.test(e.title)) e.drop = true;
        // The references region: from a references heading to the next labeled
        // heading or section word (a book's chapters each have their own).
        if (!e.drop) afterRefs = wvRefListIsTitle(e.title) || (afterRefs && !labeled(e.title) && !wvOlIsSectionWord(e.title));
    }
    for (let k = 0; k < entries.length; k++) {
        const p = (entries[k] as any)._p as Entry | null;
        entries[k].parent = p ? entries.indexOf(p) : null;
        entries[k].parentE = p || null;
        delete (entries[k] as any)._p;
    }
    // Rule 8: no place in the document (no heading, no destination): a web
    // link, or a parent of nothing but such entries.
    const hasPlace = (e: Entry) => e.ref != null || !!(e.target && e.target.position && Number.isInteger(e.target.position.pageIndex));
    for (let k = entries.length - 1; k >= 0; k--) {
        const e = entries[k];
        if (hasPlace(e) || e.drop) continue;
        const kids = entries.filter((c) => c.parent === k);
        if (!kids.length ? !!e.url || !e.ref : kids.every((c) => c.drop)) e.drop = true;
    }
    // Rule 7: size and case, against the parent Zotero gave it.
    const height = (e: Entry): number => {
        const b = e.ref == null ? null : byIdx.get(e.ref);
        const pr = b && Array.isArray(b.pageRects) && b.pageRects[0];
        return pr && finiteRect(pr.slice(1)) ? pr[4] - pr[2] : 0;
    };
    const caseOf = caseOfText;
    // Unlabeled: no numbering, and no label-like start either -- a number run
    // into the first word ("4.1.Qualitative Description"), a section sign, a
    // bracketed label ("(a)", "(1.1)"), a digit, "1B.4", a bullet.
    const plain = (t: string) => !partChapter(t) && !wvOlNumbering(t).length
        && !/^\s*(?:(?:\d+(?:\.\d+)*|[A-Z]|[IVXLC]+)\.(?=\p{L})|[\u00a7\u2022\u00b7\u25aa\u25a0\-\u2013*]|\(\s*[0-9A-Za-z.]{1,6}\s*\)|\d|[A-Za-z0-9]{1,3}\.\d)/u.test(t);
    for (let k = 0; k < entries.length; k++) {
        const p = entries[k];
        if (p.drop || !plain(p.title)) continue;
        const kids = entries.filter((c) => c.parent === k && !c.drop);
        if (!kids.length) continue;
        const hp = height(p), cp = caseOf(p.title);
        const all = hp > 0 && !!cp && kids.every((c) => {
            const hc = height(c);
            return plain(c.title) && hc > 0 && hc >= hp * 0.95 && caseOf(c.title) === cp;
        });
        if (all) for (const c of kids) c.up = true;
    }

    // Rule 9: OCR's "1." for the first Roman section, the entry just before
    // "II." (outline2.14, 9UZMEV2M: "1. Introduction" / "II. Experimental
    // Procedures"), read "I." when no "I." exists.
    {
        const k2 = entries.findIndex((e) => !e.drop && /^\s*II\.\s/.test(e.title));
        if (k2 > 0 && !entries.some((e) => !e.drop && /^\s*I\.\s/.test(e.title))) {
            let k = k2 - 1;
            while (k >= 0 && entries[k].drop) k--;
            if (k >= 0 && /^\s*[1l|]\.\s+\p{Lu}/u.test(entries[k].title)) {
                note("Roman I read for OCR's 1: " + entries[k].title);
                entries[k].title = entries[k].title.replace(/^(\s*)[1l|]\./, "$1I.");
            }
        }
    }
    // Rule 9: Roman sections and their lettered subsections, in sequence.
    const seq = new Map<Entry, { kind: "roman" | "upper" | "lower"; level: number }>();
    let romanLast = 0, letterLast = 0, lowerLast = 0, romans = 0;
    const repairs: Array<[Entry, string]> = [];
    for (const e of entries) {
        if (e.drop) continue;
        const tok = labelTok(e.title);
        // A numbered entry: the lower-case letters under it start again.
        if (!tok) { if (/^\s*\d+(?:\.\d+)*\.?\s/.test(e.title)) lowerLast = 0; continue; }
        const raw = tok.raw;
        const want = romanLast + 1;
        if (!tok.glued && (romanValue(raw) === want || romanValue(raw.replace(/[l|]/g, "I").toUpperCase()) === want)) {
            romanLast = want; romans++; letterLast = 0; lowerLast = 0;
            seq.set(e, { kind: "roman", level: 0 });
            if (raw !== toRoman(want)) repairs.push([e, toRoman(want) + ". " + tok.rest]);
        }
        // A lower-case run (a., b. ...) goes on first; else the next capital,
        // OCR's lower case for it repaired ("c. The onset..." between B and D).
        else if (romanLast > 0 && !tok.glued && /^[a-z]$/.test(raw) && (raw.charCodeAt(0) - 96 === lowerLast + 1 || raw === "a")) {
            lowerLast = raw.charCodeAt(0) - 96;
            seq.set(e, { kind: "lower", level: -1 });     // one under the label before it (levels below)
        }
        else if (romanLast > 0 && /^[A-Za-z]$/.test(raw) && raw.toUpperCase().charCodeAt(0) - 64 === letterLast + 1) {
            letterLast++; lowerLast = 0;
            seq.set(e, { kind: "upper", level: 1 });
            if (tok.glued || raw !== raw.toUpperCase()) repairs.push([e, raw.toUpperCase() + ". " + tok.rest]);
        }
    }
    const romanScheme = romans >= 2;
    if (romanScheme) for (const [e, t] of repairs) e.title = t;
    else seq.clear();

    // Rule 10: the Arabic sequence of the other documents -- an entry out of it
    // in another letter case goes; numbers missing from it come back.
    const arabicOf = (t: string): number | null => {
        const m = /^\s*(\d{1,3})(?:\.(?!\d)|\s)\s*(?=\S)/.exec(t);
        return m ? Number(m[1]) : null;
    };
    // Papers only: a book numbers its sections again in each chapter.
    if (!romanScheme && pageCount > 0 && pageCount <= 60) {
        const arab: Array<{ e: Entry; v: number }> = [];
        for (const e of entries) { if (!e.drop) { const v = arabicOf(e.title); if (v != null) arab.push({ e, v }); } }
        // The longest increasing run of numbers, in document order.
        const len: number[] = [], prev: number[] = [];
        for (let i = 0; i < arab.length; i++) {
            len[i] = 1; prev[i] = -1;
            for (let j = 0; j < i; j++) if (arab[j].v < arab[i].v && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
        }
        let best = -1;
        for (let i = 0; i < arab.length; i++) if (best < 0 || len[i] > len[best]) best = i;
        const inSeq = new Set<number>();
        for (let i = best; i >= 0; i = prev[i]) inSeq.add(i);
        if (inSeq.size >= 3) {
            const rest = (t: string) => t.replace(/^\s*\d{1,3}\.?\s*/, "");
            const tally = new Map<string, number>();
            for (const i of inSeq) { const c = caseOfText(rest(arab[i].e.title)); tally.set(c, (tally.get(c) || 0) + 1); }
            const main = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
            for (let i = 0; i < arab.length; i++) {
                if (inSeq.has(i)) continue;
                if (caseOfText(rest(arab[i].e.title)) !== main) arab[i].e.drop = true;
                else note("kept out of its sequence: " + arab[i].e.title);
            }
        }
        // Missing numbers, from the blocks between their neighbours (a gap of
        // at most two, three in all).
        const conf = [...inSeq].sort((a, b) => a - b).map((i) => arab[i]);
        if (conf.length >= 2 && conf.every((c) => c.e.ref != null)) {
            const used = new Set<number>(entries.filter((e) => e.ref != null).map((e) => e.ref as number));
            const missing: Array<{ v: number; from: number; to: number; before: Entry }> = [];
            let last = 0, from = -1;
            for (const c of conf) {
                if (c.v - last - 1 > 2) { missing.length = 0; break; }
                for (let v = last + 1; v < c.v; v++) missing.push({ v, from, to: c.e.ref as number, before: c.e });
                last = c.v; from = c.e.ref as number;
            }
            if (missing.length <= 3) {
                for (const m of missing) {
                    const re = new RegExp("^\\s*" + m.v + "(?:\\.\\s*|\\s+)\\p{Lu}", "u");
                    const b = (blocks || []).find((x) => x && x.i > m.from && x.i < m.to && !used.has(x.i)
                        && (x.type === "heading" || x.type === "paragraph") && re.test(x.text) && x.text.length <= 90
                        && x.text.split(/\s+/).length <= 10 && !/[.:;,]$|\d$/.test(x.text.trim()) && !/[=<>()\[\]{}]/.test(x.text));
                    if (!b) continue;
                    used.add(b.i);
                    const e = mk(b.text.replace(/\s+/g, " ").trim(), b.i, null, null, m.before.depth, true);
                    entries.splice(entries.indexOf(m.before), 0, e);
                }
            }
        }
    }

    // Rule 13: a references title Zotero did not list as a heading.
    if (entries.some((e) => !e.drop) && !entries.some((e) => !e.drop && wvRefListIsTitle(e.title))) {
        const used = new Set<number>(entries.filter((e) => e.ref != null).map((e) => e.ref as number));
        let b: WvOlBlock | null = null;
        // Not a running header or footer ("114 Bibliographie"): outside the
        // page's top and bottom 7 %, and no page number before it.
        const inBand = (x: WvOlBlock): boolean => {
            const pr = Array.isArray(x.pageRects) && x.pageRects[0];
            const vr = pr && pages[pr[0]] && pages[pr[0]].viewRect;
            if (!pr || !finiteRect(vr) || !finiteRect(pr.slice(1))) return false;
            const h = vr[3] - vr[1];
            return h > 0 && (pr[4] >= vr[3] - h * 0.07 || pr[2] <= vr[1] + h * 0.07);
        };
        for (const x of blocks || []) {
            if (x && !used.has(x.i) && (x.type === "paragraph" || x.type === "heading" || x.type === "caption") && x.text.length <= 40
                && wvRefListIsTitle(x.text) && !inBand(x) && !/^\s*(?:\d{3,}|[3-9]\d)\b/.test(x.text)) b = x;
        }
        if (b) {
            const at = entries.findIndex((e) => e.ref != null && (e.ref as number) > (b as WvOlBlock).i);
            const e = mk(b.text.replace(/\s+/g, " ").trim(), b.i, null, null, 0, true);
            if (at < 0) entries.push(e); else entries.splice(at, 0, e);
        }
        // Rule 16: no title at all -- a "References" entry at the list's first entry.
        else {
            const s0 = pageCount <= 60 && !entries.some((e) => !e.drop && /^(?:references?|bibliograph|literature cited|works cited|r\u00e9f\u00e9rences|literatur|referencias|bibliografia|sources bibliograph)/.test(wvOlNorm(e.title).replace(/^\d+(?:\s\d+)*\s/, "")))
                ? wvOlRefListStart(blocks) : null;
            const pr = s0 && Array.isArray(s0.pageRects) && s0.pageRects[0];
            if (s0 && pr && Number.isInteger(pr[0]) && finiteRect(pr.slice(1))) {
                const label = (meta && meta.labels && meta.labels.references) || "References";
                const at = entries.findIndex((e) => e.ref != null && (e.ref as number) > s0.i);
                const e = mk(label, s0.i, { position: { pageIndex: pr[0], rect: [pr[1], pr[4], pr[1], pr[4]] } }, null, 0, true);
                (e as any).placeholder = true;
                if (at < 0) entries.push(e); else entries.splice(at, 0, e);
            }
        }
    }

    // Levels. An entry under dropped ones moves up by as many levels; then
    // Part / Chapter, numbering and section words decide (rule 6).
    const stack: Array<{ depth: number; drop: boolean; up: boolean }> = [];
    let inPart = false, chapterCase = "", lettered = false, labelLevel = 0;
    for (const e of entries) {
        while (stack.length && stack[stack.length - 1].depth >= e.depth) stack.pop();
        // Up by every dropped ancestor and every ancestor moved up (rule 7:
        // a heading's sub-headings go with it), and by its own move.
        const removed = stack.filter((s) => s.drop || s.up).length + (e.up ? 1 : 0);
        stack.push({ depth: e.depth, drop: e.drop, up: e.up });
        if (e.drop) continue;
        let level = Math.max(0, e.depth - removed);
        const pc = partChapter(e.title);
        const num = wvOlNumbering(e.title);
        if (pc) { level = pc.kind === "part" ? 0 : pc.depth + (inPart ? 1 : 0); if (pc.kind === "part") { inPart = true; chapterCase = caseOfText(e.title); } }
        // Rule 11: inside a chapter, under it -- unless in the chapters' case.
        else if (wvOlIsSectionWord(e.title) && num.length < 2) level = inPart && chapterCase && caseOfText(e.title) !== chapterCase ? 1 : 0;
        else if (num.length && (num.length > 1 || /^\d+$/.test(num[0]))) level = num.length - 1 + (inPart ? 1 : 0);
        // Rule 9: the Roman scheme decides in its documents.
        if (romanScheme && !pc) {
            const sq = seq.get(e);
            if (sq && sq.kind === "lower") level = labelLevel + 1;
            else if (sq) { level = labelLevel = sq.level; lettered = sq.kind === "upper"; }
            else if (num.length && num.every((p) => /^\d+$/.test(p))) level = labelLevel = (lettered ? 2 : 1) + num.length - 1;
            else {
                // Unlabeled: under the kept entry Zotero nested it under (its
                // own level when rule 7 moved it up), else at the top.
                let pe = e.parentE;
                while (pe && pe.drop) pe = pe.parentE;
                level = pe && !wvOlIsSectionWord(e.title) ? pe.level + (e.up ? 0 : 1) : 0;
                // An unlabeled top-level heading (APPENDIX F...) ends the lettered part.
                if (level === 0) { lettered = false; labelLevel = 0; }
            }
        }
        e.level = level;
    }
    // Rule 15: no section from the heading blocks, usable bookmarks: theirs.
    if (own && ownUsable && !entries.some((e) => !e.drop)) {
        const base = wrapper ? ownFlat.filter((x) => x.it !== wrapper).map((x) => ({ it: x.it, depth: x.depth - 1 })) : ownFlat;
        entries.length = 0;
        for (const { it, depth } of base) {
            const pos = it.target && it.target.position;
            if (!(pos && Number.isInteger(pos.pageIndex))) continue;        // rule 8
            const e = mk(it.title, null, it.target, null, depth, false);
            e.title = e.title.replace(/\s+/g, " ").trim();
            e.level = depth;
            entries.push(e);
        }
    }
    // Rule 14: run-in headings, where the PDF has no usable bookmarks.
    else if (!(own && ownUsable)) {
        const refsAt = entries.find((e) => !e.drop && e.ref != null && wvRefListIsTitle(e.title));
        const used = new Set<number>(entries.filter((e) => e.ref != null).map((e) => e.ref as number));
        for (const r of wvOlRunIns(blocks, running, refsAt ? (refsAt.ref as number) : undefined, pages)) {
            if (used.has(r.i)) continue;
            // The item's authors (a CRediT statement: "Simon El Ouafa:").
            const toks = wvOlNorm(r.title).split(" ").filter((t) => t.length > 1 && !CONNECTORS.has(t));
            if (lasts.size && toks.length && toks.some((t) => lasts.has(t)) && toks.every((t) => names.has(t))) continue;
            let at = entries.findIndex((e) => e.ref != null && (e.ref as number) > r.i);
            if (at < 0) at = entries.length;
            let parent: Entry | null = null;
            for (let k = at - 1; k >= 0; k--) if (!entries[k].drop && !(entries[k] as any).runIn) { parent = entries[k]; break; }
            // On the run-in's own characters (outline2.11, MJT: "Why is the
            // whole line highlighted instead of just the outline text?"), one
            // rect per line it covers; the first line's box without a text map.
            const own = r.boxes && r.boxes.length ? r.boxes.filter((x) => x[0] === r.boxes![0][0]) : null;
            const target = own ? { position: { pageIndex: own[0][0], rects: own.map((x) => x.slice(1, 5)) } }
                : r.line ? { position: { pageIndex: r.line[0], rect: r.line.slice(1, 5) } } : null;
            const e = mk(r.title, r.i, target, null, 0, true);
            (e as any).runIn = true;
            const backMatter = BACK_MATTER.has(wvOlNorm(r.title)) || wvOlIsSectionWord(r.title);
            e.level = parent && !backMatter ? parent.level + 1 : 0;
            entries.splice(at, 0, e);
        }
    }
    const kept = entries.filter((e) => !e.drop);
    let prev = -1;
    for (const e of kept) { e.level = Math.max(0, Math.min(e.level, prev + 1)); prev = e.level; }

    // Positions: Zotero's heading boxes (the P1 rules).
    const posOf = (e: Entry): { pageIndex: number; rects: number[][] } | null => {
        const b = e.ref == null ? null : byIdx.get(e.ref);
        const bp = b ? wvOlPosFromPageRects(b.pageRects, pageCount) : null;
        if (b && b.type === "heading" && bp) {
            // Rule 20: a joined heading lights both its lines.
            for (const j of ((e as any).joinRefs || []) as number[]) {
                const jp = wvOlPosFromPageRects((byIdx.get(j) || ({} as any)).pageRects, pageCount);
                if (jp && jp.pageIndex === bp.pageIndex) bp.rects.push(...jp.rects);
            }
            return bp;
        }
        const p = e.target && e.target.position;
        if (p && Number.isInteger(p.pageIndex) && p.pageIndex >= 0 && p.pageIndex < pageCount) {
            if (Array.isArray(p.rects) && p.rects.length && p.rects.every(finiteRect)) return { pageIndex: p.pageIndex, rects: p.rects.map((x: number[]) => x.slice(0, 4)) };
            if (finiteRect(p.rect)) return { pageIndex: p.pageIndex, rects: [p.rect.slice(0, 4)] };
            const vr = pages[p.pageIndex] && pages[p.pageIndex].viewRect;
            if (finiteRect(vr)) return { pageIndex: p.pageIndex, rects: [[vr[0], vr[3], vr[0], vr[3]]] };
        }
        if (bp) { const r = bp.rects[0]; return { pageIndex: bp.pageIndex, rects: [[r[0], r[3], r[0], r[3]]] }; }
        return null;
    };
    // Rule 17: the spaces the text layer lost, when the title is still its
    // heading's characters (rule 9's repairs keep their count).
    const respace = (e: Entry): string => {
        const b = e.ref == null || (e as any).placeholder ? null : byIdx.get(e.ref);
        const lost = b && Array.isArray(b.lost) ? b.lost : null;
        if (!lost || !lost.length) return e.title;
        const t = e.title;
        if (t.replace(/\s+/g, "").length !== b!.text.replace(/\s+/g, "").length) return e.title;
        let out = "", j = 0;
        for (const ch of t) {
            if (/\s/.test(ch)) { out += ch; continue; }
            if (lost.includes(j) && out && !/\s$/.test(out)) out += " ";
            out += ch; j++;
        }
        return out;
    };
    const root: WvOlNode[] = [];
    const parents: WvOlNode[][] = [root];
    for (const e of kept) {
        e.title = respace(e);
        const position = posOf(e);
        const node: WvOlNode = { title: e.title, url: position ? null : e.url, position, href: null, items: [] };
        parents.length = e.level + 1;
        (parents[e.level] || root).push(node);
        parents[e.level + 1] = node.items;
    }
    // Rule 19 (outline2.13, MJT 2026-11-24 on YX7EPSV9: "the Extracted
    // outline is worse than the Embedded one. Is it possible to prevent this
    // from happening?"): GOOD bookmarks (wvOlGoodBookmarks) are Extracted's
    // skeleton, at the publisher's own destinations. A file-name label takes
    // the heading at its destination that says the same (its bare label line
    // before it), else its words. Weavero's headings only fill in each
    // bookmark's pages, under it, their levels relative to the shallowest
    // among them; none before the first bookmark, none in front or back matter
    // (NO_FILL), none that repeats a bookmark's title -- or a piece of it -- on
    // its page.
    const good = own && ownUsable && wvOlGoodBookmarks(items, pageCount, pageOfBlock);
    if (good) {
        const base = wrapper ? ownFlat.filter((x) => x.it !== wrapper).map((x) => ({ it: x.it, depth: x.depth - 1 })) : ownFlat;
        type Sk = { node: WvOlNode; depth: number; page: number; y: number; nofill: string; flat: boolean; after: WvOlNode[]; fill: Array<{ title: string; pos: { pageIndex: number; rects: number[][] }; level: number }> };
        const sk: Sk[] = [];
        const heads = (blocks || []).filter((b) => b && b.type === "heading");
        const usedHead = new Set<number>();
        const sameish = (a: string, b: string): boolean => {
            if (!a || !b) return false;
            if (a === b) return true;
            const [s, l] = a.length <= b.length ? [a, b] : [b, a];
            if (s.length >= 6 && l.startsWith(s) && s.length >= 0.6 * l.length) return true;
            const w = (t: string) => t.split(" ").filter((x) => x.length > 2).slice(0, 3).join(" ");
            return w(a).split(" ").length >= 3 && w(a) === w(b);
        };
        for (const { it, depth } of base) {
            const ref = Array.isArray(it.ref) && Number.isInteger(it.ref[0]) ? it.ref[0] : null;
            // Its destination, else (Zotero 10.0.8) the heading block Zotero found for it.
            const dp = it.target && it.target.position && Number.isInteger(it.target.position.pageIndex) ? it.target.position.pageIndex : ref != null ? pageOfBlock(ref) : null;
            if (dp == null || dp < 0 || dp >= pageCount) continue;              // rule 8
            const pos0 = { pageIndex: dp };
            if (wvOlIdLabel(it.title)) continue;                                // an anchor's name ("datalink4")
            let title = String(it.title).replace(/\s+/g, " ").trim();
            let e = mk(title, ref, it.target, null, depth, false);
            // A bookmark without its section's number, the heading on its page
            // with it ("Governing equations..." / "2.1. Governing equations..."):
            // the number goes before the publisher's words (USVAWUW3, PI9N9C6W).
            const NUM = /^\s*((?:\d+(?:\.\d+)*\.?|[IVXLC]+\.|[A-Z]\.)(?:\s+|(?=\p{Lu})))/u;   // glued too: "1.1Motivations" (X9433XXJ)
            if (!wvOlFileLabel(title) && !NUM.test(title) && !partChapter(title)) {
                const bn = wvOlNorm(title);
                const h = kept.find((k) => k.page != null && Math.abs(k.page - pos0.pageIndex) <= 1 && NUM.test(k.title) && wvOlNorm(k.title.replace(NUM, "")) === bn);
                if (h) title = (NUM.exec(h.title) as RegExpExecArray)[1].trim() + " " + title;
            }
            if (wvOlFileLabel(title)) {
                const clean = wvOlCleanLabel(title), cn = wvOlNorm(clean);
                const h = heads.find((b) => pageOfBlock(b.i) === pos0.pageIndex && !usedHead.has(b.i) && sameish(wvOlNorm(String(b.text || "").replace(TOC_LABEL, "")), cn));
                if (h) {
                    usedHead.add(h.i);
                    const pb = byIdx.get(h.i - 1);
                    const lab = pb && pb.type === "heading" && pageOfBlock(pb.i) === pageOfBlock(h.i) && /^\s*(?:(?:chapter|part|appendix)\s+)?(?:\d+|[IVXLC]+|[A-Z])\.?\s*$/i.test(pb.text) ? pb.text.trim() + " " : "";
                    title = lab + String(h.text).replace(/\s+/g, " ").trim();
                    e = mk(title, h.i, it.target, null, depth, false);
                }
                else title = clean || title;
            }
            e.title = title;
            const p = posOf(e);
            const node: WvOlNode = { title, url: null, position: p, href: null, items: [] };
            const own = wvOlNorm(wvOlFileLabel(it.title) ? wvOlCleanLabel(it.title) : it.title);
            // After back matter (Acknowledgements, References...) what is filled
            // in goes beside it, not under it (YCHBKLJ4's appendices).
            sk.push({ node, depth, page: p ? p.pageIndex : pos0.pageIndex, y: p && p.rects[0] ? p.rects[0][3] : Infinity,
                nofill: REFS_RANGE.test(own) ? "refs" : NO_FILL.test(own) ? "front" : "", flat: REFS_RANGE.test(own) || BACK_MATTER.has(own), after: [], fill: [] });
        }
        let filled = 0;
        for (const e of kept) {
            const p = posOf(e);
            if (!p) continue;
            const y = p.rects[0] ? p.rects[0][3] : Infinity;
            let owner = -1;
            for (let k = 0; k < sk.length; k++) if (sk[k].page < p.pageIndex || (sk[k].page === p.pageIndex && sk[k].y >= y - 2)) owner = k;
            if (owner < 0 || sk[owner].nofill === "front") continue;
            // After References or in an index: an appendix and back matter
            // only, never the list's own lines (YCHBKLJ4's annexes).
            if (sk[owner].nofill === "refs" && !(labeled(e.title) || wvOlIsSectionWord(e.title) || BACK_MATTER.has(wvOlNorm(e.title)) || /^\s*(?:annex|appendi|declaration|supplement)/i.test(e.title))) continue;
            // The bookmark's own heading (its title, label aside), or an
            // unlabeled piece of it ("of Caffeine in Sport"); a numbered
            // section is never a piece ("1.1 Dimensions" under "Dimensions, ...").
            const en = wvOlNorm(e.title.replace(TOC_LABEL, ""));
            const piece = !labeled(e.title);
            if (!en || sk.some((s) => {
                if (Math.abs(s.page - p.pageIndex) > 1) return false;
                const sn = wvOlNorm(s.node.title.replace(TOC_LABEL, ""));
                return sn === en || (piece && (" " + wvOlNorm(s.node.title) + " ").includes(" " + en + " "));
            })) continue;
            sk[owner].fill.push({ title: e.title, pos: p, level: e.level });
            filled++;
        }
        for (const s of sk) {
            if (!s.fill.length) continue;
            // Relative levels; a level skipped (its parent heading missing,
            // "1.1.1" first under a chapter) shifts what follows instead of
            // nesting the siblings under the first.
            const roots: WvOlNode[] = [], par: WvOlNode[][] = [roots];
            let pv = -1, shift = Math.min(...s.fill.map((f) => f.level));
            for (const f of s.fill) {
                let lv = f.level - shift;
                if (lv < 0) { shift = f.level; lv = 0; }
                if (lv > pv + 1) { shift += lv - (pv + 1); lv = pv + 1; }
                pv = lv;
                const node: WvOlNode = { title: f.title, url: null, position: f.pos, href: null, items: [] };
                par.length = lv + 1;
                (par[lv] || roots).push(node);
                par[lv + 1] = node.items;
            }
            if (s.flat) s.after = roots; else s.node.items = roots;
        }
        const out: WvOlNode[] = [], par: WvOlNode[][] = [out];
        let pv = -1;
        for (const s of sk) {
            const lv = Math.max(0, Math.min(s.depth, pv + 1));
            pv = lv;
            par.length = lv + 1;
            (par[lv] || out).push(s.node, ...s.after);
            par[lv + 1] = s.node.items;
        }
        note("bookmarks: " + sk.length + " as the skeleton, " + filled + " headings filled in");
        return out;
    }

    // Rule 18: the book's Contents page, when it finds more of the book's
    // chapters than Extracted does, and at least 60 % of them (EZ97CKA6, Bird
    // et al.: 2 of 5 kept, the rest of the book lost). The book's chapters: the Contents'
    // chapter-level entries with an Arabic page number -- only the numbered
    // ones (Chapter N, N, Roman; appendices aside) when there are two or
    // more. The
    // Contents finds the ones it keeps; Extracted finds the ones it has at its
    // top level (or under a Part) within a page of the same place with the
    // same title (the label aside; a title cut short by 20 % at most), plus
    // its own other "Chapter N <title>" entries. Only where the PDF has no
    // GOOD bookmarks (outline2.13: those win, rule 19).
    if (!good) {
        const toc = wvOlContents(blocks, pages);
        if (toc && toc.pass) {
            const all = toc.entries.filter((c) => c.chapter && !c.roman && c.pageIndex != null);
            // (Appendices are not what makes chapters numbered: an edited volume's
            // unnumbered chapters with Appendix A and B, W65XGWST.)
            const numbered = all.filter((c) => c.kind === "chapter" || c.kind === "num" || c.kind === "roman");
            const chapters = numbered.length >= 2 ? numbered : all;
            const tops: WvOlNode[] = [];
            // (Under a Part, or under a bare "Chapter 3" whose title Zotero
            // nested under it: 8A6JDUIL, IZTMRPH2.)
            for (const n of root) {
                tops.push(n);
                if (/^\s*(?:part|partie|teil)\b/i.test(n.title) || /^\s*(?:chapter|chapitre|kapitel)\s*(?:\d+|[ivxlcdm]+|[a-z]+)\s*[.:]?\s*$/i.test(n.title)) tops.push(...n.items);
            }
            const bare = (t: string) => wvOlNorm(String(t || "").replace(TOC_LABEL, ""));
            const same = (a: string, b: string) => {
                const x = bare(a), y = bare(b);
                if (!x || !y) return false;
                if (x === y) return true;
                const [s, l] = x.length <= y.length ? [x, y] : [y, x];
                return l.startsWith(s + " ") && s.length >= 0.8 * l.length;
            };
            const byToc = chapters.filter((c) => c.landed).length;
            const matched = new Set<WvOlNode>();
            let byEx = 0;
            for (const c of chapters) {
                const n = tops.find((x) => !matched.has(x) && !!x.position && Math.abs(x.position.pageIndex - (c.pageIndex as number)) <= 1 && same(x.title, c.title));
                if (n) { matched.add(n); byEx++; }
            }
            // Extracted's own "Chapter N <title>" entries not matched above count
            // too: chapters the Contents lost or did not land (8A6JDUIL's
            // chapters 6, 7, 9; Sedov's VII, VIII, X).
            for (const n of tops) {
                if (matched.has(n) || !/^\s*(?:chapter|chapitre|kapitel)\s*(?:\d+|[ivxlcdm]+|[a-z]+)\b/i.test(n.title) || bare(n.title).replace(/[^\p{L}]/gu, "").length < 3) continue;
                byEx++;
            }
            // Its chapters must land too (>= 60 % of them, as its entries): a
            // skeleton with most chapters missing is no chapter level.
            const use = byToc > byEx && byToc >= 0.6 * chapters.length;
            note("contents page " + toc.contentsPage + ": " + toc.landed + " of " + toc.parsed + " entries kept (" + toc.mapping + "); chapters: "
                + byToc + " of " + chapters.length + " kept, " + byEx + " in Extracted -> " + (use ? "Contents" : "Extracted"));
            if (use) return tocTree(toc);
        }
        else if (toc) note("contents page " + toc.contentsPage + ": " + toc.landed + " of " + toc.parsed + " entries kept, under 60 %");
    }
    return root;
}
