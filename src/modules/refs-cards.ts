// Module: R2 -- a reference card for a PDF link Zotero did not read as a
// citation (branch refscard; MJT 2026-11-20, "Yes, basically I want to
// continuously improve the native references identification in Weavero";
// public register docs/reference-identification.md, case R2).
//
// THE CASE. Zotero 11 shows a reference's TEXT (its citation popup,
// reader overlay-popup/reference/citation-popup.js) when the pointer rests on
// an in-text citation its structure data tied to an entry. Where it tied
// none, the citation is only the PDF's own link, and the hover shows Zotero's
// link preview instead: a PICTURE of the reference-list page. Measured on
// 11.0-beta.4 (PDF processor v15) in two of MJT's papers, Baggaley et al. 2012
// and Backhaus et al. 2011 (PRL): no entry flagged, no `citation` overlay on
// any page, each in-text number a PDF link (and a link of Zotero's text
// matcher over it) -- while Weavero reads their lists itself (refs.ts
// _wvRefsEntries, lib/ref-list.ts "detected": 29 and 21 entries). A third,
// Tsai et al. 2011 (Soft Matter), has no link under its superscript numbers
// at all: nothing shows there on a hover, and this rule has nothing to act on
// (2026-11-20, refscard report).
//
// WEAVERO'S RULE. When Zotero is about to show the preview of a PDF link (an
// 'internal-link' popup) and
//   - none of Zotero's citations crosses the link (where one does, Zotero's
//     card or WV-TEMP-134867 answers: nothing changes),
//   - and the link's destination lands on an entry of Weavero's list of the
//     paper (wvRefsCardEntryFor: among the entries near the destination
//     point, in a numbered list the one whose number the link's text names --
//     a link naming none, "*" or "Fig. 1", lands on no entry -- else the one
//     whose first line is the nearest at or below the point),
// (since refsfix, 2026-11-24, also a citation of a NUMBERED list whose
// destination misses its entry -- AIP's Physics of Fluids PDFs put every
// destination far above its entry, in the text over the list or on another
// entry: the link's number names the entry when the link looks like a
// citation and lands at the list; wvRefsCardResolve),
// the popup becomes a 'citation' popup with that entry as its one reference,
// in place, before Zotero shows it (_wvRefsCardSwap). Zotero's own citation
// popup draws it, so refs.ts decorates it as any other: the mark, the
// buttons, the bold number. Link by link: it steps aside by itself wherever
// Zotero recognises the citation. The click on the link is Zotero's, as
// before (pdf-view.js _handlePointerUp picks the link again and navigates to
// its destination).
//
// WHY THE POPUP, NOT THE PAGE DATA (the reader's source, mirror 2026-11-20,
// and the 11.0-beta.4 / 10.0.8 bundles):
//   - a synthesized 'citation' overlay in `_pdfPages[i].overlays` would also
//     colour the citation's text (page.js isTextColorOverlay: every
//     'citation' gets #245e91 once the page has its structure data,
//     getTextColorRegions), add a second keyboard stop on the link
//     (pdf-view.js _focusNext collects overlays), and change the click
//     (a citation navigates to references[0].position, pdf-view.js
//     _handlePointerUp);
//   - and it would have to be put back after every page publish: Zotero 11
//     replaces a page's object whenever its link annotations or its
//     structure data arrive (pdf-document-data.mjs ensurePage publish,
//     _runSemanticEntry) and drops pages out of view (releasePage); Zotero
//     10.0.8 shares one overlay array per page across page objects
//     (_processedPageOverlays). Two data flows, two hooks.
//   The popup choke point is one hook on both versions, already Weavero's
//   (reader.ts _wvWirePreviewLinkZones wraps the view's _onSetOverlayPopup;
//   WV-TEMP-134867 makes the same swap for a link over one of Zotero's
//   cards), and leaves nothing behind. Its cost: Zotero renders the
//   preview picture before it calls _onSetOverlayPopup (pdf-view.js
//   _openOverlayPopup on 11, the hover closure on 10), so the card shows
//   after that render -- 98-259 ms on MJT's papers at 200-245 % zoom
//   (11.0-beta.4, 2026-11-20), the pointer's arrival to the card 316-364 ms
//   on five hovers, with Zotero's 100-ms hover delay. The decision itself, once per popup:
//   about 5 ms for a citation link (Baggaley et al. 2012, page 1, 4,211
//   characters: median 5.2 ms, at most 7.9 ms over its 56 links -- reading the
//   link's text crosses into the reader's compartment for every character);
//   a link landing near no entry reads no character. Nothing runs at a
//   reader's open (0 calls while a paper opens and settles, measured).
//
// Only the reader's primary view (the wrapper's own scope, as
// WV-TEMP-134867). Nothing is written anywhere; nothing is kept per reader.
//
// Mixed onto WeaveroPlugin.prototype through refs.ts (refsMethods).

import { wvCloneFor } from "../lib/xray";
import { WvRefEntry } from "../lib/ref-list";

declare const Zotero: any;
declare const Components: any;

/** How far above an entry's first line a destination point may sit and
 *  still be that entry's (PDF points): LaTeX's hyperref anchors a
 *  \bibitem one \baselineskip above its baseline -- about half a line above
 *  the line's top -- and other producers at the line's top. */
const MAX_ABOVE = 30;
/** How far left of an entry's box the point may sit (the label's column). */
const MAX_LEFT = 20;
/** At most this many characters read from a link's text. */
const MAX_LINK_CHARS = 40;

const num = (v: any) => Number(v);

/** A rect as [x1, y1, x2, y2] with x1 <= x2, y1 <= y2; null when not one. */
function rect4(r: any): number[] | null {
    try {
        if (!r || r.length < 4) return null;
        const a = [num(r[0]), num(r[1]), num(r[2]), num(r[3])];
        if (!a.every(Number.isFinite)) return null;
        return [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])];
    }
    catch (e) { return null; }
}

function rectsOf(pos: any): number[][] {
    const out: number[][] = [];
    try {
        const rs = pos && pos.rects;
        const n = rs ? rs.length : 0;
        for (let i = 0; i < n; i++) { const r = rect4(rs[i]); if (r) out.push(r); }
    }
    catch (e) {}
    return out;
}

function crosses(a: number[], b: number[]): boolean {
    return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
}

/** The numbers a link's text names, in order: "12", "[12]", "12,13", and a
 *  range "12–15" spelled out (at most 30 wide). */
export function wvRefsCardNumbers(text: string): number[] {
    const t = String(text || "").replace(/\s+/g, "");
    const out: number[] = [];
    const re = /(\d{1,4})(?:[–—−-](\d{1,4}))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        if (b >= a && b - a <= 30) { for (let k = a; k <= b; k++) out.push(k); }
        else out.push(a);
    }
    return out;
}

/** An entry's number ("[12]", "12.", "(12)", "12" -> 12), or null. */
function labelNum(label: any): number | null {
    const m = /\d+/.exec(String(label || ""));
    return m ? Number(m[0]) : null;
}

/** Is the list numbered: most entries carry a label. */
function isNumbered(entries: WvRefEntry[]): boolean {
    return (entries || []).filter((e) => labelNum(e.label) !== null).length * 2 > (entries || []).length;
}

/** At most this many characters read on each side of a link for its group. */
const MAX_GROUP_SIDE = 40;

/** The entries a citation group names, `entry` (the one its link landed on) among
 *  them, in the group's order: [entry] when the group names no other. Only in a
 *  numbered list, each number its own entry's. */
export function wvRefsCardGroupEntries(entries: WvRefEntry[], entry: WvRefEntry, groupText: string): WvRefEntry[] {
    const own = labelNum(entry && entry.label);
    if (own === null || !isNumbered(entries) || !wvRefsCardNumberLike(groupText)) return [entry];
    const ns = wvRefsCardNumbers(groupText);
    if (ns.length < 2 || ns.indexOf(own) < 0) return [entry];
    const out: WvRefEntry[] = [];
    const seen = new Set<number>();
    for (const n of ns) {
        if (seen.has(n)) continue;
        seen.add(n);
        const e = n === own ? entry : (entries || []).find((x) => labelNum(x.label) === n);
        if (e && e.text) out.push(e);
    }
    return out.length ? out : [entry];
}

/** Does a link's text read as a numbered citation: numbers, brackets,
 *  commas, dashes, a "Ref." before them -- not "Fig. 4", "Eq. (4)", "1(d)"
 *  (Backhaus et al. 2011 links "1(d)" to a figure panel). */
export function wvRefsCardNumberLike(text: string): boolean {
    const t = String(text || "").trim().replace(/^(?:refs?\.?|references?)\s*/i, "");
    return /\d/.test(t) && /^[\s[\](),;.\d–—−-]+$/.test(t);
}

/** The entry of `entries` a link lands on -- its destination `dest`
 *  ({ pageIndex, rects }, PDF space; Zotero's own destinations are a point
 *  [x, y, x, y]) and its `text` -- or null. The point is a point's own, a
 *  box's top-left corner. Candidates: the entries with a box on that page
 *  whose column holds the point (from MAX_LEFT left of the box to its right
 *  edge; any column when the point sits on the page's left edge,
 *  `opts.leftEdge`: an /XYZ destination with no left, which Zotero puts
 *  there, pdf-view.js _getPositionFromDestination) and whose first line
 *  there is at most MAX_ABOVE below the point -- or whose box holds it.
 *  Then:
 *    - a numbered list (most entries carry a label): the candidate whose
 *      number is the first the link's text names, when that text reads as a
 *      numbered citation (wvRefsCardNumberLike), else none -- a footnote
 *      mark, "Fig. 4" or a number no entry near the destination carries is
 *      no citation of this list;
 *    - an unnumbered list: the candidate whose first line is the nearest at
 *      or below the point. Not the entry the point is inside: hyperref's
 *      anchor sits on the baseline of the line ABOVE the entry's first,
 *      inside the previous entry's last line;
 *    - else the one entry holding the point.
 *  A destination far from its entry (André et al. 2026: every /XYZ 74 pt
 *  above its entry, on a page cropped after the anchors were set) lands on
 *  none: the picture stays. */
export function wvRefsCardEntryFor(entries: WvRefEntry[], dest: any, linkText: string | (() => string), opts?: WvRefsCardOpts): WvRefEntry | null {
    const r = wvRefsCardResolve(entries, dest, linkText, opts);
    return r ? r.entry : null;
}

/** What wvRefsCardResolve may read besides the destination and the link's text. */
export interface WvRefsCardOpts {
    /** The destination page's left edge (see wvRefsCardEntryFor). */
    leftEdge?: number;
    /** Does the link read as a citation by its look (_wvRefsCardCiteLook: a superscript, a
     *  bracketed group, "Ref." before it; not after "Fig." or "Eq.")? Asked only for the
     *  resolution by label; without it there is none. */
    cites?: () => boolean;
}

/** How a link's destination is resolved against the paper's list:
 *  - null: the link is no citation of the list Weavero answers for (as wvRefsCardEntryFor's
 *    rule above; Zotero's picture stays, its tint as it was);
 *  - `how: "dest"`: the entry at the destination (wvRefsCardEntryFor's rule);
 *  - `how: "label"` (refsfix, 2026-11-24): a citation of a NUMBERED list whose destination is not
 *    its entry. AIP's Physics of Fluids PDFs (Skrbek & Sreenivasan 2012, MJT's library) put every
 *    destination far above its entry: "2"-"6" land in the text above the list on its first page
 *    (the PDF's /FitR at y 430-367, the entries at y 36-162; Zotero's structure ties those links to
 *    the paragraph at the page's top), "7" and "9" on entry 5. A link whose text names a number,
 *    that reads as a citation by its look (`opts.cites`), and whose destination lands at the list
 *    -- near an entry, or on a page of the list above all of its entries there -- is the entry
 *    the list prints with that number (`entry`), when exactly one does; `entry` null when none
 *    does (a citation of the list all the same: no entry of it to show or tint).
 *  A destination on the entry the link's number names is "dest", as before. */
export function wvRefsCardResolve(entries: WvRefEntry[], dest: any, linkText: string | (() => string), opts?: WvRefsCardOpts): { entry: WvRefEntry | null; how: "dest" | "label" } | null {
    const page = num(dest && dest.pageIndex);
    const r = rectsOf(dest)[0];
    if (!r || !Number.isInteger(page)) return null;
    const px = r[0], py = r[3];
    const anyColumn = px <= num((opts && opts.leftEdge) || 0) + 0.5;
    const cands: Array<{ e: WvRefEntry; d: number; inside: boolean }> = [];
    // The highest line of the list on that page (any column): a point above it is above the list.
    let listTop = -Infinity;
    for (const e of entries || []) {
        let top = -Infinity, bottom = Infinity, any = false;
        for (const b of e.rects || []) {
            if (num(b[0]) !== page) continue;
            listTop = Math.max(listTop, num(b[2]), num(b[4]));
            const x1 = Math.min(num(b[1]), num(b[3])), x2 = Math.max(num(b[1]), num(b[3]));
            if (!anyColumn && (px < x1 - MAX_LEFT || px > x2 + 2)) continue;
            any = true;
            top = Math.max(top, num(b[2]), num(b[4]));
            bottom = Math.min(bottom, num(b[2]), num(b[4]));
        }
        if (!any) continue;
        const d = py - top;
        const inside = py >= bottom - 2 && py <= top + 2;
        if (inside || (d >= -2 && d <= MAX_ABOVE)) cands.push({ e, d, inside });
    }
    // A numbered list answers a link by its number only. Without one the link
    // is no citation of it: Baggaley et al. 2012's "*" (the author's footnote,
    // printed just above [1] in APS's list) went to [1] by position alone.
    if (isNumbered(entries)) {
        const above = !cands.length && py > listTop + 2 && listTop > -Infinity;
        // A link landing near no entry, and not above the list on one of its pages, reads no
        // character.
        if (!cands.length && !above) return null;
        // Read only now: the page's characters are the costly part (a pass
        // over every one of them through the reader's wrappers).
        const text = typeof linkText === "function" ? linkText() : String(linkText || "");
        if (!wvRefsCardNumberLike(text)) return null;
        const n = wvRefsCardNumbers(text)[0];
        const hit = cands.find((c) => labelNum(c.e.label) === n);
        if (hit) return { entry: hit.e, how: "dest" };
        // refsfix: by its number, only for a link that looks like a citation (a figure's "4", an
        // equation's "(4)" or a footnote mark of the same page never does).
        if (!(opts && typeof opts.cites === "function" && opts.cites())) return null;
        const named = (entries || []).filter((e) => labelNum(e.label) === n && e.text);
        return { entry: named.length === 1 ? named[0] : null, how: "label" };
    }
    if (!cands.length) return null;
    const below = cands.filter((c) => c.d >= -2).sort((a, b) => a.d - b.d);
    if (below.length) return { entry: below[0].e, how: "dest" };
    const ins = cands.filter((c) => c.inside);
    return ins.length === 1 ? { entry: ins[0].e, how: "dest" } : null;
}

/** Words before a number that make it no citation: a figure, an equation, a table, a section, a
 *  page, a volume ("Fig. 4", "Eqs. (45) and", "Sec. 3", "p. 12"). */
const NOT_CITE_BEFORE = /(?:\bfig(?:ure)?s?|\beq(?:uation)?s?|\btab(?:le)?s?|\bsec(?:tion)?s?|§|\bchap(?:ter)?s?|\bappendi(?:x|ces)|\bpanels?|\bpp?|\bpages?|\bvols?|\bnos?|\bsteps?|\bcases?)\.?\s*(?:\(?\d{1,4}\)?\s*(?:[,–—−-]|and|&)\s*)*\(?$/i;

/** A Zotero reference's `position` for an entry's boxes, [page, x1, y1, x2, y2]:
 *  its first page's rects, and the next page's as `nextPageRects`. */
function entryPosition(e: WvRefEntry): any {
    const rs = (e.rects || []).filter((b) => b && b.length >= 5 && Number.isInteger(num(b[0])));
    if (!rs.length) return null;
    const p0 = num(rs[0][0]);
    const pos: any = { pageIndex: p0, rects: rs.filter((b) => num(b[0]) === p0).map((b) => [num(b[1]), num(b[2]), num(b[3]), num(b[4])]) };
    const next = rs.filter((b) => num(b[0]) === p0 + 1).map((b) => [num(b[1]), num(b[2]), num(b[3]), num(b[4])]);
    if (next.length) pos.nextPageRects = next;
    return pos;
}

class _RefsCardsMixin {
    [k: string]: any;

    /** wvRefsCardEntryFor as a method (the suite drives the rule through it). */
    _wvRefsCardEntryFor(entries: WvRefEntry[], dest: any, text: string | (() => string), opts?: { leftEdge?: number }): WvRefEntry | null {
        return wvRefsCardEntryFor(entries, dest, text, opts);
    }

    /** The text under a link (`rects`, PDF space) on a page of the view's
     *  data: the characters whose centre lies in one of the rects. */
    _wvRefsCardLinkText(page: any, rects: number[][]): string {
        let s = "";
        try {
            const chars = page && page.chars;
            const n = chars ? chars.length : 0;
            const boxes = rects.map((q) => [q[0] - 0.5, q[1] - 0.5, q[2] + 0.5, q[3] + 0.5]);
            const yMin = Math.min(...boxes.map((q) => q[1])), yMax = Math.max(...boxes.map((q) => q[3]));
            for (let i = 0; i < n && s.length < MAX_LINK_CHARS; i++) {
                const ch = chars[i];
                const r = ch && (ch.rect || ch.inlineRect);
                if (!r) continue;
                // Every read here crosses into the reader's compartment: the line first.
                const cy = (num(r[1]) + num(r[3])) / 2;
                if (cy < yMin || cy > yMax) continue;
                const cx = (num(r[0]) + num(r[2])) / 2;
                if (boxes.some((q) => cx >= q[0] && cx <= q[2] && cy >= q[1] && cy <= q[3])) s += String(ch.c || "") + (ch.spaceAfter ? " " : "");
            }
        }
        catch (e) {}
        return s.trim();
    }

    /** The citation group a link sits in, in the page's reading order: the link's
     *  characters with the digits, commas, semicolons and dashes on either side, up to
     *  and with a bracket -- "[4–9]" for the link on its "9". Backhaus et al. 2011
     *  (PRL) links each number of a range apart, and the card named the hovered one
     *  only (MJT 2026-11-20, "Range of citations not identified"). A number beside the
     *  link joins only when a link of the page covers it too: "Ref. 4, 10 cells" is no
     *  group of 4 and 10. "" when the link's characters are not found. */
    _wvRefsCardGroupText(page: any, rects: number[][]): string {
        try {
            const chars = page && page.chars;
            const n = chars ? chars.length : 0;
            if (!n) return "";
            const pad = (q: number[]) => [q[0] - 0.5, q[1] - 0.5, q[2] + 0.5, q[3] + 0.5];
            const boxes = rects.map(pad);
            const yMin = Math.min(...boxes.map((q) => q[1])), yMax = Math.max(...boxes.map((q) => q[3]));
            const centre = (i: number): number[] | null => {
                const ch = chars[i];
                const r = ch && (ch.rect || ch.inlineRect);
                return r ? [(num(r[0]) + num(r[2])) / 2, (num(r[1]) + num(r[3])) / 2] : null;
            };
            const inside = (p: number[] | null, qs: number[][]) => !!p && qs.some((q) => p[0] >= q[0] && p[0] <= q[2] && p[1] >= q[1] && p[1] <= q[3]);
            let i0 = -1, i1 = -1;
            for (let i = 0; i < n; i++) {
                const p = centre(i);
                if (!p || p[1] < yMin || p[1] > yMax) continue;
                if (inside(p, boxes)) { if (i0 < 0) i0 = i; i1 = i; }
                else if (i0 >= 0) break;
            }
            if (i0 < 0) return "";
            let links: number[][] | null = null;
            const linked = (i: number) => {
                if (!links) {
                    links = [];
                    const ovs = page.overlays;
                    const m = ovs ? ovs.length : 0;
                    for (let k = 0; k < m; k++) {
                        try { const o = ovs[k]; if (o && o.type === "internal-link") for (const r of rectsOf(o.position)) links.push(pad(r)); }
                        catch (e) {}
                    }
                }
                return inside(centre(i), links);
            };
            const c = (i: number) => String((chars[i] && chars[i].c) || "");
            const PUNCT = /^[,;–—−-]$/, DIGIT = /^\d$/;
            let a = i0;
            for (let k = i0 - 1; k >= 0 && i0 - k <= MAX_GROUP_SIDE; k--) {
                const ch = c(k);
                if (ch === "[" || ch === "(") { a = k; break; }
                if (DIGIT.test(ch)) { if (!linked(k)) break; a = k; continue; }
                if (PUNCT.test(ch)) { a = k; continue; }
                break;
            }
            let b = i1;
            for (let k = i1 + 1; k < n && k - i1 <= MAX_GROUP_SIDE; k++) {
                const ch = c(k);
                if (ch === "]" || ch === ")") { b = k; break; }
                if (DIGIT.test(ch)) { if (!linked(k)) break; b = k; continue; }
                if (PUNCT.test(ch)) { b = k; continue; }
                break;
            }
            let s = "";
            for (let k = a; k <= b; k++) s += c(k) + (chars[k].spaceAfter ? " " : "");
            return s.trim();
        }
        catch (e) { return ""; }
    }

    /** The entry of `reader`'s paper an internal-link popup (or overlay) of
     *  the view `v` (waived) stands for, with the link's text and the entries of
     *  the citation group it is part of (`entries`, the entry among them), or null:
     *  when the paper's list is not known (yet), when one of Zotero's citations
     *  crosses the link, or when the destination lands on no entry. */
    _wvRefsCardFind(reader: any, v: any, link: any): { entry: WvRefEntry; entries: WvRefEntry[]; text: string; how: "dest" | "label" } | null {
        try {
            const got = this._wvRefsCardResolveLink(reader, v, link);
            const entry = got && got.res && got.res.entry;
            if (!got || !entry || !entry.text) return null;
            const group = isNumbered(got.entries) ? wvRefsCardGroupEntries(got.entries, entry, this._wvRefsCardGroupText(got.page, got.mine)) : [entry];
            return { entry, entries: group, text: got.text(), how: got.res!.how };
        }
        catch (e) { Zotero.debug("[Weavero] reference card find err: " + e); return null; }
    }

    /** wvRefsCardResolve for a link of the view `v` (waived), read from the view's page data:
     *  null when the paper's list is not known (yet), when the link has no position or
     *  destination, or when one of Zotero's citations crosses the link (Zotero answers there). */
    _wvRefsCardResolveLink(reader: any, v: any, link: any): { entries: WvRefEntry[]; res: ReturnType<typeof wvRefsCardResolve>; page: any; mine: number[][]; text: () => string } | null {
        const P: any = this;
        const entries: WvRefEntry[] | null = (P._wvRefsEntriesNow && P._wvRefsEntriesNow.get(reader.itemID)) || null;
        if (!entries || !entries.length) return null;
        const own = link.position, dest = link.destinationPosition;
        if (!own || !dest) return null;
        const pageIndex = num(own.pageIndex);
        const mine = rectsOf(own);
        if (!mine.length) return null;
        const page = v._pdfPages && v._pdfPages[pageIndex];
        const ovs = page && page.overlays;
        const n = ovs ? ovs.length : 0;
        for (let i = 0; i < n; i++) {
            const o = ovs[i];
            try {
                if (!o || o.type !== "citation" || !o.position || num(o.position.pageIndex) !== pageIndex) continue;
                if (rectsOf(o.position).some((r) => mine.some((m) => crosses(r, m)))) return null;
            }
            catch (e) {}
        }
        let text: string | null = null;
        const textNow = () => (text === null ? (text = this._wvRefsCardLinkText(page, mine)) : text);
        // The destination page's left edge (its view box, Zotero's page data
        // when that page is loaded; 0 otherwise, as most PDFs have it).
        let leftEdge = 0;
        try {
            const dp = v._pdfPages && v._pdfPages[num(dest.pageIndex)];
            const vb = dp && dp.viewBox;
            if (vb && Number.isFinite(num(vb[0]))) leftEdge = Math.min(num(vb[0]), num(vb[2]));
        }
        catch (e) {}
        const res = wvRefsCardResolve(entries, { pageIndex: num(dest.pageIndex), rects: rectsOf(dest) }, textNow,
            { leftEdge, cites: () => this._wvRefsCardCiteLook(page, mine) });
        return { entries, res, page, mine, text: textNow };
    }

    /** The tint of an internal-link preview whose link is a citation of the paper's numbered
     *  list resolved BY ITS NUMBER (wvRefsCardResolve "label"; refsfix, 2026-11-24): the lines
     *  of the entry the number names, on the previewed page -- or none: never the block the
     *  destination happens to land on (the body paragraph at the top of Skrbek & Sreenivasan
     *  2012's page 45, its entry 5 for a link reading "7"). `how` says which. Null for every
     *  other link: its tint stays as preview-highlight.ts finds it. Without the card (the
     *  References feature off, an entry with no position) this is what the preview shows. */
    _wvRefsCardTint(reader: any, pv: any, popup: any): { rects: number[][]; how: string } | null {
        try {
            const Cu = (Components as any).utils;
            const got = this._wvRefsCardResolveLink(reader, Cu.waiveXrays(pv), Cu.waiveXrays(popup));
            if (!got || !got.res || got.res.how !== "label") return null;
            const e = got.res.entry;
            if (!e) return { rects: [], how: "cited: no entry of that number" };
            const p = num(popup.destinationPosition.pageIndex);
            const rects = (e.rects || []).filter((b) => num(b[0]) === p).map((b) => rect4([b[1], b[2], b[3], b[4]])).filter(Boolean) as number[][];
            return { rects, how: "cited: entry " + (e.label || "?") };
        }
        catch (e) { return null; }
    }

    /** Does the link (`rects`, PDF space) on `page` read as a citation by its look (refsfix,
     *  2026-11-24; wvRefsCardResolve's `cites`): its group in square brackets, or "Ref." / "Refs."
     *  before it, or its digits a superscript -- and no "Fig.", "Eq.", "Table", "Sec." ... before
     *  it (NOT_CITE_BEFORE). A superscript is what Zotero's page data says of the digits when it
     *  says (Zotero 11: `sup`, pdf.js structure.js classifySupSubForLine), else measured as that
     *  does: smaller than the characters beside the group (at most 85 % of their height) and
     *  raised (its foot a fifth of their height above theirs). AIP sets its citations so,
     *  "conductivity.2–4". False when the link's characters are not found. */
    _wvRefsCardCiteLook(page: any, rects: number[][]): boolean {
        try {
            const chars = page && page.chars;
            const n = chars ? chars.length : 0;
            if (!n || !rects.length) return false;
            const box = (i: number): number[] | null => {
                const ch = chars[i];
                const r = ch && (ch.rect || ch.inlineRect);
                return r ? rect4(r) : null;
            };
            const pads = rects.map((q) => [q[0] - 0.5, q[1] - 0.5, q[2] + 0.5, q[3] + 0.5]);
            const yMin = Math.min(...pads.map((q) => q[1])), yMax = Math.max(...pads.map((q) => q[3]));
            let i0 = -1, i1 = -1;
            for (let i = 0; i < n; i++) {
                const r = box(i);
                if (!r) continue;
                const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
                if (cy < yMin || cy > yMax) continue;
                if (pads.some((q) => cx >= q[0] && cx <= q[2] && cy >= q[1] && cy <= q[3])) { if (i0 < 0) i0 = i; i1 = i; }
                else if (i0 >= 0) break;
            }
            if (i0 < 0) return false;
            const c = (i: number) => String((chars[i] && chars[i].c) || "");
            // The group's start, as _wvRefsCardGroupText finds it (digits and their
            // punctuation, a bracket ends it); only its look is read here.
            let a = i0;
            for (let k = i0 - 1; k >= 0 && i0 - k <= MAX_GROUP_SIDE; k--) {
                const ch = c(k);
                if (ch === "[" || ch === "(") { a = k; break; }
                if (/^[\d,;–—−-]$/.test(ch)) { a = k; continue; }
                break;
            }
            let z = i1;
            for (let k = i1 + 1; k < n && k - i1 <= MAX_GROUP_SIDE; k++) {
                if (/^[\d,;–—−-]$/.test(c(k))) { z = k; continue; }
                break;
            }
            let before = "";
            for (let k = a - 1; k >= 0 && a - k <= 24; k--) before = c(k) + (chars[k].spaceAfter ? " " : "") + before;
            if (NOT_CITE_BEFORE.test(before)) return false;
            if (c(a) === "[" || c(i0) === "[") return true;
            if (/\brefs?\.?\s*$/i.test(before)) return true;
            const digits: number[] = [];
            for (let k = i0; k <= i1; k++) if (/\d/.test(c(k))) digits.push(k);
            if (!digits.length) return false;
            const said = digits.map((k) => chars[k].sup);
            if (said.every((v) => typeof v === "boolean")) return said.every((v) => v === true);
            // Measured: the characters beside the group on its line (three before it, else
            // three after it), against the link's digits.
            const L = digits.map(box).filter(Boolean) as number[][];
            if (!L.length) return false;
            const lTop = Math.max(...L.map((r) => r[3])), lFoot = Math.min(...L.map((r) => r[1]));
            const lH = Math.max(...L.map((r) => r[3] - r[1]));
            const side: number[][] = [];
            const near = (k: number) => {
                const r = box(k);
                if (!r || !c(k).trim()) return;
                // The same line: it shares height with the link.
                if (Math.min(r[3], lTop) - Math.max(r[1], lFoot) > 0) side.push(r);
            };
            for (let k = a - 1; k >= 0 && side.length < 3 && a - k <= 6; k--) near(k);
            for (let k = z + 1; k < n && side.length < 3 && k - z <= 6; k++) near(k);
            if (!side.length) return false;
            const hs = side.map((r) => r[3] - r[1]).sort((p, q) => p - q);
            const sH = hs[Math.floor(hs.length / 2)];
            const foots = side.map((r) => r[1]).sort((p, q) => p - q);
            const sFoot = foots[Math.floor(foots.length / 2)];
            return sH > 0 && lH <= 0.85 * sH && lFoot - sFoot >= 0.2 * sH;
        }
        catch (e) { return false; }
    }

    /** R2 at the reader's popup choke point (reader.ts _wvWirePreviewLinkZones,
     *  after WV-TEMP-134867): the internal-link `popup` Zotero is about to show
     *  becomes, in place, the citation popup of the entry its link lands on --
     *  as pdf-view.js _openOverlayPopup builds one (`{ ...overlay, rect }`),
     *  the popup object staying the reader's own, its reference shaped as
     *  Zotero's (semantic-overlays.mjs getReferenceData: position, text,
     *  chars). True when it did. */
    _wvRefsCardSwap(reader: any, pv: any, popup: any): boolean {
        try {
            if (!this._wvRefsOn() || !reader || !popup) return false;
            const Cu = (Components as any).utils;
            const w = Cu.waiveXrays(popup);
            if (w.type !== "internal-link") return false;
            const found = this._wvRefsCardFind(reader, Cu.waiveXrays(pv), w);
            if (!found) return false;
            const e = found.entry;
            // Every entry of the citation's group, as Zotero lists its own ("[14,18,19]").
            const list: any[] = [];
            for (const g of found.entries) {
                const position = entryPosition(g);
                if (!position) continue;
                const text = String(g.text);
                list.push({ position, text, chars: Array.from(text).map((c) => ({ c })) });
            }
            if (!list.length) return false;
            const rwin = reader._iframeWindow;
            const refs = wvCloneFor(list, rwin);
            // Zotero's own keys of a card: the link's position and the rect
            // Zotero placed the popup at; the picture goes.
            for (const k of Object.keys(w)) if (k !== "rect" && k !== "position") delete w[k];
            w.type = "citation";
            w.references = refs;
            w._wvRefsCard = true;
            const P: any = this;
            P._wvRefsCardLast = { at: Date.now(), itemID: reader.itemID, label: e.label || null, labels: found.entries.map((g) => g.label || null), link: found.text, how: found.how };
            // The link's text is the paper's: its length only.
            Zotero.debug("[Weavero] R2: a PDF link Zotero did not read as a citation -> the card of entry " + (e.label || "?") + " (link of " + String(found.text || "").length + " characters, " + found.entries.length + " in its group, by its " + (found.how === "label" ? "number: the destination misses the entry" : "destination") + ")");
            return true;
        }
        catch (e) { Zotero.debug("[Weavero] reference card swap err: " + e); return false; }
    }

    /** The view `pv`'s internal-link overlay (Zotero's own object) as the
     *  card it would show: `{ entry label, link text }`, or null -- for the
     *  suite and probes (no popup opened). */
    _wvRefsCardProbe(reader: any, pv: any, overlay: any): { label: string | null; labels: Array<string | null>; text: string; entryText: string } | null {
        try {
            const Cu = (Components as any).utils;
            const o = Cu.waiveXrays(overlay);
            if (!o || o.type !== "internal-link") return null;
            const f = this._wvRefsCardFind(reader, Cu.waiveXrays(pv), o);
            return f ? { label: f.entry.label || null, labels: f.entries.map((g) => g.label || null), text: f.text, entryText: f.entry.text } : null;
        }
        catch (e) { return null; }
    }
}

const _refsCardsDescriptors = Object.getOwnPropertyDescriptors(_RefsCardsMixin.prototype);
delete (_refsCardsDescriptors as any).constructor;
export const refsCardsMethods = _refsCardsDescriptors;
