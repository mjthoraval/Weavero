// The lineage tree of one researcher (branch peoplenet, plan approved by MJT
// 2026-11-25; design: work/people-genealogy-ui-survey-2026-11-25.md, A1): the
// person in the centre, their mentors ABOVE as generations -- PhD advisors and
// postdoc hosts alike (MJT: "A generation like PhD", not side cards) --, their
// trainees BELOW; each edge typed and dated; a "+N" handle where a card has
// mentors or trainees the tree does not show. Pure: no Zotero, no DOM; the
// graph comes from the caller (modules/people-lineage.ts: Researchers' records
// and the Academic Family Tree).
//
// Ideas, not code, from zotero-inspire's Academic Tree (fkguo/zotero-inspire,
// MPL-2.0, src/modules/inspire/academicTreeLayout.ts, read for the survey):
// generation rows, right-angled "bus" edges, co-advisors side by side over
// their student, Back / Forward, and a card per person drawn once. The layout
// here is a tidy tree in each direction from the focus (Reingold-Tilford's
// subtree widths, without its contour packing): a person reached twice is
// placed once, where the search met them first, and the other edge is drawn to
// that card.

/** An edge's kind: PhD (the Academic Family Tree's "grad student"), postdoc,
 *  research scientist, undergraduate research assistant, anything else. */
export type WvLtType = "phd" | "postdoc" | "research" | "ra" | "other";

export interface WvLtEdge {
    mentor: string;
    trainee: string;
    type: WvLtType;
    /** A co-advisor (Researchers' "Co-advisor" link). */
    co?: boolean;
    /** "2010", "2011–2013", "1993–", "–1995", a date ("2013-10-24"), "" when
     *  unknown (wvLtWhen reads it). */
    years?: string;
    /** A single date in `years` is the END of the link (the Academic Family
     *  Tree's `stopdate`; a thesis defence). Without it a single date of a link
     *  other than a PhD tells neither end. */
    end?: boolean;
    inst?: string;
    thesis?: string;
    /** Where the edge comes from: a Researchers record's link, or the Academic Family Tree. */
    src: "people" | "aft";
}

/** What an edge's dates say (MJT 2026-11-26: "Postdoc and PhD links are not
 *  limited to a single year ... PhD has a clear graduation year, so a single
 *  year fallback is still fine ... it is less clear which year it is for a
 *  postdoc: starting or ending"):
 *  - range: both ends ("Postdoc 1993–1995"); one end twice is `end`;
 *  - end: a PhD's end, its graduation ("PhD 1960"), or both ends the same year;
 *  - from / until: one end of any other link, said which ("Postdoc from 1993",
 *    "Postdoc until 1995");
 *  - unknown: a single date whose end no source tells (a year typed on a postdoc
 *    link): written with a question mark, never as if it were known;
 *  - none: no date.
 *  `from` / `to` are dates as "YYYY", "YYYY-MM" or "YYYY-MM-DD" (the finest the
 *  source gives); an unreadable text is `unknown`, as it is. */
export interface WvLtWhen { kind: "none" | "range" | "end" | "from" | "until" | "unknown"; from: string; to: string }

/** "YYYY", "YYYY-MM" or "YYYY-MM-DD" of a date ("2005-00-00", the Academic
 *  Family Tree's year alone, is "2005"); "" when it is none. */
export function wvLtDate(s: any): string {
    const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(s == null ? "" : s).trim());
    if (!m || m[1] === "0000") return "";
    if (m[2] && m[2] !== "00" && m[3] && m[3] !== "00") return m[1] + "-" + m[2] + "-" + m[3];
    if (m[2] && m[2] !== "00") return m[1] + "-" + m[2];
    return m[1];
}

export function wvLtWhen(e: { type: WvLtType; years?: string; end?: boolean }): WvLtWhen {
    const s = String((e && e.years) || "").trim();
    const none: WvLtWhen = { kind: "none", from: "", to: "" };
    if (!s) return none;
    // A range: "A–B" (an en or em dash, "A–" or "–B" for one end), "1993-1995",
    // "A - B". A date's own hyphens ("2013-10-24") are no range.
    const m = /^(\S*)\s*[–—]\s*(\S*)$/.exec(s) || /^(\d{4})-(\d{4})$/.exec(s) || /^(\S+)\s+-\s+(\S+)$/.exec(s);
    if (m) {
        const a = wvLtDate(m[1]), b = wvLtDate(m[2]);
        if (a && b) return a === b ? { kind: "end", from: "", to: b } : { kind: "range", from: a, to: b };
        if (a) return { kind: "from", from: a, to: "" };
        if (b) return { kind: e.type === "phd" ? "end" : "until", from: "", to: b };
    }
    const one = wvLtDate(s);
    if (!one) return { kind: "unknown", from: s, to: "" };
    if (e.type === "phd") return { kind: "end", from: "", to: one };
    return e.end ? { kind: "until", from: "", to: one } : { kind: "unknown", from: one, to: "" };
}

/** Edge labels placed so that none covers another (MJT 2026-11-26: labels of
 *  links that share a path were drawn on top of each other): in the order
 *  given, each at its anchor, else moved a line away from its edge's end -- down
 *  under a mentor (`dir` 1), up above a trainee (-1) -- until it overlaps no
 *  label placed before (at most 12 lines). The widths are estimated from the
 *  text (`charW` per character): no layout is read. A line is 15 px: a
 *  10.5-px label's box is about 14 px high (its ascent and descent). */
export function wvLtPlaceLabels(items: Array<{ x: number; y: number; text: string; dir: 1 | -1 }>, line = 15, charW = 5.9): Array<{ x: number; y: number }> {
    const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const hits = (b: { x0: number; x1: number; y0: number; y1: number }) => boxes.some((o) => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1);
    return items.map((it) => {
        const w = Math.max(1, String(it.text || "").length) * charW;
        let y = it.y;
        let box = { x0: it.x, x1: it.x + w, y0: y - line + 2, y1: y + 2 };
        for (let n = 0; n < 12 && hits(box); n++) {
            y += it.dir * line;
            box = { x0: it.x, x1: it.x + w, y0: y - line + 2, y1: y + 2 };
        }
        boxes.push(box);
        return { x: it.x, y };
    });
}

/** What the layout reads of the people: their mentor and trainee edges, and
 *  how many more of each the source counts without listing them (the
 *  Academic Family Tree extract's outer ring). */
export interface WvLtGraph {
    mentorsOf(key: string): WvLtEdge[];
    traineesOf(key: string): WvLtEdge[];
    moreMentors?(key: string): number;
    moreTrainees?(key: string): number;
}

export interface WvLtOpts {
    /** Generations above and below the focus (MJT 2026-11-25: 3 and 2). */
    up: number;
    down: number;
    /** Cards whose "+N" was clicked: all their mentors (above the focus) or
     *  trainees (below) shown, one generation past the depth too. */
    open?: Iterable<string>;
    /** At most this many mentors per card above, trainees per card below; the
     *  rest counts in "+N". */
    capUp?: number;
    capDown?: number;
    /** Card size and gaps (px). */
    w: number;
    h: number;
    gx: number;
    gy: number;
}

export interface WvLtNode {
    key: string;
    /** 0 the focus, -1 its mentors, 1 its trainees... */
    gen: number;
    /** Top-left corner. */
    x: number;
    y: number;
    /** The card it was reached from (null: the focus). */
    via: string | null;
    /** Mentors (above the focus) / trainees (below) this card has and the tree does not show. */
    hidUp: number;
    hidDown: number;
}

export interface WvLtPlacedEdge extends WvLtEdge {
    /** The mentor's bottom centre, the trainee's top centre, the bus's height. */
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    ym: number;
    /** Where its label goes: under the mentor (edges above the focus: several
     *  mentors meet on one trainee) or over the trainee (edges below). */
    labelAt: "mentor" | "trainee";
    /** The other links between the same two people (a PhD, then a postdoc with
     *  the same mentor): one path, one label that names them all. */
    also?: WvLtEdge[];
}

export interface WvLtLayout {
    nodes: WvLtNode[];
    edges: WvLtPlacedEdge[];
    /** Bounding box of the cards. */
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Hard bound on the generations, whatever "+N" clicks asked for. */
export const WV_LT_MAX_GEN = 10;
const TYPE_RANK: Record<WvLtType, number> = { phd: 0, postdoc: 1, research: 2, ra: 3, other: 4 };

/** The Academic Family Tree's relation code as an edge kind (its README: 0
 *  undergraduate RA, 1 grad student, 2 postdoc, 3 research scientist, 4
 *  collaboration -- not a mentor relation, never an edge here; 5-7 undocumented). */
export function wvLtRelType(rel: number): WvLtType {
    switch (Number(rel)) {
        case 0: return "ra";
        case 1: return "phd";
        case 2: return "postdoc";
        case 3: return "research";
    }
    return "other";
}

const firstYear = (y?: string): number => { const m = /\d{4}/.exec(String(y || "")); return m ? Number(m[0]) : 9999; };

/** One edge per (other person, kind): a co-advisor link and the same
 *  person's PhD edge from the tree are one; a PhD and a postdoc with the same
 *  person are two. The first keeps its place; a later one fills what it lacks. */
export function wvLtDedupe(edges: WvLtEdge[], side: "mentor" | "trainee"): WvLtEdge[] {
    const out: WvLtEdge[] = [];
    for (const e of edges || []) {
        if (!e || !e[side]) continue;
        const twin = out.find((o) => o[side] === e[side] && (o.type === e.type || o.co || e.co));
        if (!twin) { out.push(Object.assign({}, e)); continue; }
        // The dates that say more: a range over one end; one end with what it is.
        const tw = wvLtWhen(twin), ew = wvLtWhen(e);
        if (!twin.years && e.years || (tw.kind !== "range" && ew.kind === "range") || (tw.kind === "unknown" && ew.kind !== "none" && ew.kind !== "unknown")) {
            twin.years = e.years;
            twin.end = e.end;
        }
        if (!twin.inst && e.inst) twin.inst = e.inst;
        if (!twin.thesis && e.thesis) twin.thesis = e.thesis;
        if (twin.co && !e.co && e.type === "phd") twin.co = false;
    }
    return out;
}

/** The order of a card's mentors: PhD first, then postdoc..., then by year. */
const mentorOrder = (a: WvLtEdge, b: WvLtEdge) => (TYPE_RANK[a.type] - TYPE_RANK[b.type]) || ((a.co ? 1 : 0) - (b.co ? 1 : 0))
    || (firstYear(a.years) - firstYear(b.years)) || (a.mentor < b.mentor ? -1 : a.mentor > b.mentor ? 1 : 0);
/** ... of its trainees: by year, then PhD first. */
const traineeOrder = (a: WvLtEdge, b: WvLtEdge) => (firstYear(a.years) - firstYear(b.years)) || (TYPE_RANK[a.type] - TYPE_RANK[b.type])
    || (a.trainee < b.trainee ? -1 : a.trainee > b.trainee ? 1 : 0);

/** Each card above the focus by the branch it belongs to: the focus's own
 *  mentor it was reached through (0, 1, ... in the row's order), so each
 *  advisor's line can take its colour (the Nodus study's idea 8, MJT
 *  2026-11-26: "one colour per advisor's branch when there are co-advisors").
 *  Empty with fewer than two mentors: one line needs no colours. */
export function wvLtBranches(lay: WvLtLayout, focus: string): Map<string, number> {
    const out = new Map<string, number>();
    const byKey = new Map(lay.nodes.map((n) => [n.key, n]));
    const roots = lay.nodes.filter((n) => n.gen === -1).sort((a, b) => a.x - b.x);
    if (roots.length < 2) return out;
    roots.forEach((r, i) => out.set(r.key, i));
    for (const n of lay.nodes) {
        if (n.gen >= -1 || out.has(n.key)) continue;
        let k: string | null = n.key;
        const seen = new Set<string>();
        while (k && !out.has(k) && !seen.has(k)) {
            seen.add(k);
            const nn = byKey.get(k);
            k = nn ? nn.via : null;
            if (k === focus) { k = null; break; }
        }
        if (k && out.has(k)) out.set(n.key, out.get(k) as number);
    }
    return out;
}

/** The focus's academic siblings (idea 8): for each PhD advisor (co-advisors
 *  too), the advisor's other PhD students, by year then name; at most `cap`
 *  each, `more` the rest. */
export function wvLtSiblings(graph: WvLtGraph, focus: string, cap = 12): Array<{ mentor: string; siblings: string[]; more: number }> {
    const out: Array<{ mentor: string; siblings: string[]; more: number }> = [];
    const mentors = wvLtDedupe(graph.mentorsOf(focus), "mentor").filter((e) => e.type === "phd").sort(mentorOrder);
    for (const m of mentors) {
        const sibs = wvLtDedupe(graph.traineesOf(m.mentor), "trainee").filter((e) => e.type === "phd" && e.trainee !== focus).sort(traineeOrder).map((e) => e.trainee);
        if (!sibs.length) continue;
        out.push({ mentor: m.mentor, siblings: sibs.slice(0, cap), more: Math.max(0, sibs.length - cap) });
    }
    return out;
}

/** The tree around `focus`: which cards, at which generation, where; the
 *  edges between the cards shown; each card's hidden counts. */
export function wvLtLayout(graph: WvLtGraph, focus: string, opts: WvLtOpts): WvLtLayout {
    const open = new Set<string>(opts.open || []);
    const up = Math.max(0, Math.min(WV_LT_MAX_GEN, Math.floor(opts.up)));
    const down = Math.max(0, Math.min(WV_LT_MAX_GEN, Math.floor(opts.down)));
    const capUp = opts.capUp && opts.capUp > 0 ? opts.capUp : Infinity;
    const capDown = opts.capDown && opts.capDown > 0 ? opts.capDown : Infinity;
    type P = { key: string; gen: number; via: string | null; kids: string[] };
    const placed = new Map<string, P>();
    placed.set(focus, { key: focus, gen: 0, via: null, kids: [] });
    const mentorsMemo = new Map<string, WvLtEdge[]>();
    const traineesMemo = new Map<string, WvLtEdge[]>();
    const mentorsOf = (k: string) => {
        if (!mentorsMemo.has(k)) mentorsMemo.set(k, wvLtDedupe((graph.mentorsOf(k) || []).filter((e) => e.mentor !== k), "mentor").sort(mentorOrder));
        return mentorsMemo.get(k) as WvLtEdge[];
    };
    const traineesOf = (k: string) => {
        if (!traineesMemo.has(k)) traineesMemo.set(k, wvLtDedupe((graph.traineesOf(k) || []).filter((e) => e.trainee !== k), "trainee").sort(traineeOrder));
        return traineesMemo.get(k) as WvLtEdge[];
    };
    // Breadth first, one generation at a time, each direction on its own: a
    // person is placed where the search meets them first.
    const grow = (dir: -1 | 1, depth: number, cap: number) => {
        let front = [focus];
        for (let g = 1; front.length && g <= WV_LT_MAX_GEN; g++) {
            const next: string[] = [];
            for (const k of front) {
                const isOpen = open.has(k);
                if (g > depth && !isOpen) continue;
                const p = placed.get(k) as P;
                const list = dir < 0 ? mentorsOf(k) : traineesOf(k);
                let shown = 0;
                const max = isOpen ? Infinity : cap;
                for (const e of list) {
                    const other = dir < 0 ? e.mentor : e.trainee;
                    if (placed.has(other)) continue;
                    if (shown >= max) break;
                    placed.set(other, { key: other, gen: dir * g, via: k, kids: [] });
                    p.kids.push(other);
                    next.push(other);
                    shown++;
                }
            }
            front = next;
        }
    };
    grow(-1, up, capUp);
    // The trainees' side keeps its own kids lists apart from the mentors' side
    // (the focus has both).
    const upKids = (placed.get(focus) as P).kids;
    (placed.get(focus) as P).kids = [];
    grow(1, down, capDown);
    const downKids = (placed.get(focus) as P).kids;
    // Subtree widths, then each child span centred on its parent.
    const unit = opts.w + opts.gx;
    const kidsOf = (k: string, dir: -1 | 1): string[] => (k === focus ? (dir < 0 ? upKids : downKids) : (placed.get(k) as P).kids);
    const width = new Map<string, number>();
    const measure = (k: string, dir: -1 | 1): number => {
        const ks = kidsOf(k, dir);
        let s = 0;
        for (const c of ks) s += measure(c, dir);
        const w = Math.max(unit, s);
        width.set(dir + ":" + k, w);
        return w;
    };
    const cx = new Map<string, number>();
    const assign = (k: string, centre: number, dir: -1 | 1) => {
        if (k !== focus || dir < 0) cx.set(k, centre);
        const ks = kidsOf(k, dir);
        let total = 0;
        for (const c of ks) total += width.get(dir + ":" + c) as number;
        let left = centre - total / 2;
        for (const c of ks) {
            const w = width.get(dir + ":" + c) as number;
            assign(c, left + w / 2, dir);
            left += w;
        }
    };
    measure(focus, -1);
    measure(focus, 1);
    assign(focus, 0, -1);
    assign(focus, 0, 1);
    const rowH = opts.h + opts.gy;
    const nodes: WvLtNode[] = [];
    const byKey = new Map<string, WvLtNode>();
    for (const p of placed.values()) {
        const n: WvLtNode = { key: p.key, gen: p.gen, x: (cx.get(p.key) as number) - opts.w / 2, y: p.gen * rowH, via: p.via, hidUp: 0, hidDown: 0 };
        nodes.push(n);
        byKey.set(p.key, n);
    }
    // Every edge between two cards on screen, once; then what each card hides.
    const edges: WvLtPlacedEdge[] = [];
    const seen = new Map<string, WvLtPlacedEdge>();
    const addEdge = (e: WvLtEdge) => {
        const m = byKey.get(e.mentor), t = byKey.get(e.trainee);
        if (!m || !t) return;
        const id = e.mentor + "\u0001" + e.trainee;
        const was = seen.get(id);
        if (was) {
            // Another kind of link between the two (a postdoc after the PhD): the
            // same path, its label added to the first one's.
            if (was.type !== e.type && !(was.also || []).some((a) => a.type === e.type)) (was.also = was.also || []).push(Object.assign({}, e));
            return;
        }
        const x1 = m.x + opts.w / 2, y1 = m.y + opts.h, x2 = t.x + opts.w / 2, y2 = t.y;
        const pe: WvLtPlacedEdge = Object.assign({}, e, { x1, y1, x2, y2, ym: y2 - opts.gy / 2, labelAt: (t.gen <= 0 ? "mentor" : "trainee") as "mentor" | "trainee" });
        seen.set(id, pe);
        edges.push(pe);
    };
    // Both sides of every card: a cross edge (the focus's advisor who also
    // co-advised its student) is drawn too.
    for (const n of nodes) {
        for (const e of mentorsOf(n.key)) addEdge(e);
        for (const e of traineesOf(n.key)) addEdge(e);
    }
    for (const n of nodes) {
        if (n.gen <= 0) {
            const ms = mentorsOf(n.key);
            const shown = new Set(ms.filter((e) => byKey.has(e.mentor)).map((e) => e.mentor)).size;
            const all = new Set(ms.map((e) => e.mentor)).size + Math.max(0, (graph.moreMentors ? graph.moreMentors(n.key) : 0) || 0);
            n.hidUp = Math.max(0, all - shown);
        }
        if (n.gen >= 0) {
            const ts = traineesOf(n.key);
            const shown = new Set(ts.filter((e) => byKey.has(e.trainee)).map((e) => e.trainee)).size;
            const all = new Set(ts.map((e) => e.trainee)).size + Math.max(0, (graph.moreTrainees ? graph.moreTrainees(n.key) : 0) || 0);
            n.hidDown = Math.max(0, all - shown);
        }
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + opts.w); maxY = Math.max(maxY, n.y + opts.h);
    }
    return { nodes, edges, minX, minY, maxX, maxY };
}

/** A tree's history of focus cards (Back / Forward / Home). */
export interface WvLtHistory { list: string[]; at: number }

export function wvLtHistNew(home: string): WvLtHistory { return { list: [home], at: 0 }; }

/** A new focus: what was ahead of the current one is dropped, as a browser's
 *  history does. The same focus again changes nothing. */
export function wvLtHistGo(h: WvLtHistory, key: string): WvLtHistory {
    if (h.list[h.at] === key) return h;
    const list = h.list.slice(0, h.at + 1);
    list.push(key);
    return { list, at: list.length - 1 };
}

export function wvLtHistMove(h: WvLtHistory, step: -1 | 1): WvLtHistory {
    const at = Math.max(0, Math.min(h.list.length - 1, h.at + step));
    return { list: h.list, at };
}

/** The tree as CSV, one row per edge, for a spreadsheet (UTF-8, RFC 4180
 *  quoting). `who(key)`: a card's name, institution and tree id. */
export function wvLtCsv(layout: WvLtLayout, who: (key: string) => { name: string; inst: string; aft: string }, credit: string): string {
    const q = (v: any) => { const s = String(v == null ? "" : v); return /[",\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; };
    const gen = new Map(layout.nodes.map((n) => [n.key, n.gen]));
    const rows = [["mentor", "mentor_institution", "mentor_generation", "mentor_aft_pid", "trainee", "trainee_institution", "trainee_generation", "trainee_aft_pid",
        "relation", "years", "institution", "thesis", "source"]];
    // Every link, the ones that share a path with another (`also`) too.
    for (const pe of layout.edges) {
        for (const e of [pe, ...(pe.also || [])]) {
            const m = who(e.mentor), t = who(e.trainee);
            rows.push([m.name, m.inst, String(gen.get(e.mentor)), m.aft, t.name, t.inst, String(gen.get(e.trainee)), t.aft,
                e.co ? "coadvisor" : e.type, e.years || "", e.inst || "", e.thesis || "", e.src === "aft" ? credit : "researchers"]);
        }
    }
    return rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}
