// The Academic Family Tree (academictree.org, Stephen V. David; data CC BY 4.0)
// as a lineage source for Researchers (branch peoplenet, plan approved by MJT
// 2026-11-25; feasibility: work/people-network-feasibility-2026-11-25.md).
//
// The AFT has no API yet. Until it has one -- or a slim export with an id
// crosswalk, which MJT is asking its author for -- the stand-in is an EXTRACT of
// its 2026-04 dump (Zenodo 10.5281/zenodo.19739198), built outside Weavero and
// placed by hand in <data dir>/weavero/aft-subset.json: the people around the
// user's library authors and Researchers, their mentor edges, their NIH
// grants, and which library author is which tree person. This file reads that
// document and answers per person, shaped like the API it stands in for --
// mentors / trainees / grants of a person, the person of a library author, of
// an ORCID iD --, so that an official export or API replaces this one file.
// Pure: no Zotero, no I/O (modules/people-lineage.ts reads the file, lazily).
//
// The document (v 1):
//   source   {name, licence, version, doi, site, page ("{tree}", "{pid}"), pageVerified}
//   inst     institution names (indexed by people and edges)
//   people   pid -> [last, first, degrees, inst index | -1, tree, orcid, mentors total, trainees total]
//            (the institution the TREE lists: often an earlier one, not the current affiliation)
//   edges    [trainee pid, mentor pid, relation, year | 0, inst index | -1, thesis title]
//   grants   pid -> [[core project number, first year, last year, budget years, application id]]
//   units    library author "last|first word" -> [pid, tier, DOIs supporting it, the author's DOIs]:
//            CONFIRMED authors only -- tier A, a human-checked paper; tier B,
//            >= 2 shared DOIs with an automatic score > 0.3, no namesake on
//            them, and >= 3 such DOIs or >= 20 % of the author's (the
//            coordinator's aft-curation-tiers, 2026-11-25). The weaker matches
//            ("possible") are left out.
// The totals count every mentor and trainee the full tree gives a person, those
// outside the extract too: "+N" = total - listed.

import { WvLtType, wvLtDate, wvLtRelType } from "./people-tree";

export interface WvAftInfo {
    name: string;
    licence: string;
    version: string;
    doi: string;
    site: string;
    page: string;
    pageVerified: boolean;
}

export interface WvAftPerson {
    pid: string;
    last: string;
    first: string;
    degrees: string;
    /** The institution the tree lists -- not necessarily the current one. */
    inst: string;
    tree: string;
    orcid: string;
    /** Every mentor / trainee the full tree counts. */
    mentors: number;
    trainees: number;
}

/** An edge seen from one side: the other person and the relation. */
export interface WvAftLink {
    pid: string;
    rel: number;
    type: WvLtType;
    /** The year the link ENDED (the dump's `stopdate`: a PhD's graduation, a
     *  postdoc's end; the dump holds no start), and that date as finely as the
     *  extract keeps it ("2005", "2013-10-24"; "" unknown). */
    year: number | null;
    date: string;
    inst: string;
    thesis: string;
}

export interface WvAftGrant {
    /** The NIH core project number ("R01EY012345"). */
    core: string;
    from: number | null;
    to: number | null;
    years: number;
    appl: string;
}

export interface WvAftSource {
    info: WvAftInfo;
    person(pid: string): WvAftPerson | null;
    mentors(pid: string): WvAftLink[];
    trainees(pid: string): WvAftLink[];
    grants(pid: string): WvAftGrant[];
    /** The tree person a library author is (confirmed by shared DOIs; a full
     *  first name needed), or null. */
    pidOfUnit(last: string, first: string): string | null;
    pidOfOrcid(orcid: string): string | null;
    /** The confirmed library authors: their key ("last|first word"), tree person and tier. */
    units(): Array<{ key: string; pid: string; tier: string }>;
    /** The people of that last name whose first name agrees (a NAME match:
     *  the caller decides what one answer is worth). */
    pidsOfName(last: string, first: string): string[];
    /** The person's page on the AFT site (`info.pageVerified`: whether the pattern was checked). */
    pageUrl(pid: string): string;
    counts(): { people: number; edges: number; units: number; grants: number };
}

/** A name's words as the extract's keys fold them (the builder's norm():
 *  NFKD, marks dropped, lower case, a hyphen or anything but a-z a space). */
export function wvAftWords(s: string): string[] {
    return String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/-/g, " ")
        .replace(/[^a-z ]+/g, " ").split(" ").filter(Boolean);
}

/** A library author's key: "last|first" when the first name's first word has
 *  two letters or more, else "last|initial" (the coordinator's check of
 *  2026-11-25: one key per initial merged several "Y. Wang"). Null without a
 *  last or a first name. */
export function wvAftUnitKey(last: string, first: string): { key: string; full: boolean; last: string; word: string } | null {
    const L = wvAftWords(last).join(" "), F = wvAftWords(first);
    if (!L || !F.length) return null;
    const w = F[0];
    return w.length > 1 ? { key: L + "|" + w, full: true, last: L, word: w } : { key: L + "|" + w[0], full: false, last: L, word: w[0] };
}

/** Two first names agree: the same first word, or the same initial where one
 *  of them gives only an initial. */
export function wvAftFirstAgrees(a: string, b: string): boolean {
    const x = wvAftWords(a)[0], y = wvAftWords(b)[0];
    if (!x || !y) return false;
    if (x.length > 1 && y.length > 1) return x === y;
    return x[0] === y[0];
}

const str = (v: any): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: any): number => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);

/** The extract `doc` as a source, or null when it is not one (another
 *  version, a damaged file). Its indexes are built at the first question. */
export function wvAftSource(doc: any): WvAftSource | null {
    if (!doc || typeof doc !== "object" || doc.v !== 1 || !doc.people || typeof doc.people !== "object" || !Array.isArray(doc.edges)) return null;
    const s = doc.source && typeof doc.source === "object" ? doc.source : {};
    const info: WvAftInfo = {
        name: str(s.name) || "Academic Family Tree",
        licence: str(s.licence) || "CC BY 4.0",
        version: str(s.version),
        doi: str(s.doi),
        site: str(s.site) || "https://academictree.org/",
        page: str(s.page),
        pageVerified: s.pageVerified === true,
    };
    const inst: string[] = Array.isArray(doc.inst) ? doc.inst.map(str) : [];
    const people: Record<string, any[]> = doc.people;
    const edges: any[][] = doc.edges.filter((e: any) => Array.isArray(e) && e.length >= 3);
    const grants: Record<string, any[]> = doc.grants && typeof doc.grants === "object" ? doc.grants : {};
    const units: Record<string, any> = doc.units && typeof doc.units === "object" ? doc.units : {};
    const instOf = (i: any) => (typeof i === "number" && i >= 0 && i < inst.length ? inst[i] : "");
    let up: Map<string, number[]> | null = null, down: Map<string, number[]> | null = null, orcids: Map<string, string> | null = null;
    let lasts: Map<string, string[]> | null = null;
    const index = () => {
        if (up) return;
        up = new Map(); down = new Map();
        edges.forEach((e, i) => {
            const t = str(e[0]), m = str(e[1]);
            if (!t || !m || t === m) return;
            if (!up!.has(t)) up!.set(t, []);
            up!.get(t)!.push(i);
            if (!down!.has(m)) down!.set(m, []);
            down!.get(m)!.push(i);
        });
    };
    // The edge's date is the dump's `stopdate`, the END of the link (a PhD's
    // graduation, a postdoc's end): the extract keeps its year (a number); a
    // full "YYYY-MM-DD" is read too, should the extract keep it.
    const link = (e: any[], other: string): WvAftLink => {
        const rel = num(e[2]);
        const d = typeof e[3] === "string" ? wvLtDate(e[3]) : "";
        return { pid: other, rel, type: wvLtRelType(rel), year: (d ? Number(d.slice(0, 4)) : num(e[3])) || null, date: d || (num(e[3]) ? String(num(e[3])) : ""),
            inst: instOf(e[4]), thesis: str(e[5]) };
    };
    const person = (pid: string): WvAftPerson | null => {
        const p = people[str(pid)];
        if (!Array.isArray(p)) return null;
        return { pid: str(pid), last: str(p[0]), first: str(p[1]), degrees: str(p[2]), inst: instOf(p[3]), tree: str(p[4]), orcid: str(p[5]).toUpperCase(),
            mentors: num(p[6]), trainees: num(p[7]) };
    };
    const unitPid = (k: string): string | null => {
        const u = units[k];
        const pid = Array.isArray(u) ? str(u[0]) : str(u);
        return pid && Array.isArray(people[pid]) ? pid : null;
    };
    return {
        info,
        person,
        mentors(pid: string): WvAftLink[] {
            index();
            return (up!.get(str(pid)) || []).map((i) => link(edges[i], str(edges[i][1])));
        },
        trainees(pid: string): WvAftLink[] {
            index();
            return (down!.get(str(pid)) || []).map((i) => link(edges[i], str(edges[i][0])));
        },
        grants(pid: string): WvAftGrant[] {
            const g = grants[str(pid)];
            if (!Array.isArray(g)) return [];
            return g.filter(Array.isArray).map((x) => ({ core: str(x[0]), from: num(x[1]) || null, to: num(x[2]) || null, years: num(x[3]), appl: str(x[4]) }));
        },
        pidOfUnit(last: string, first: string): string | null {
            // Full first names only: an author the library writes with an
            // initial alone is never matched (one "Y. Wang" key merged several
            // people; coordinator's check, 2026-11-25).
            const u = wvAftUnitKey(last, first);
            if (!u || !u.full) return null;
            const p = unitPid(u.key);
            const who = p ? person(p) : null;
            return who && wvAftFirstAgrees(who.first, first) ? p : null;
        },
        pidOfOrcid(orcid: string): string | null {
            const o = str(orcid).trim().toUpperCase();
            if (!o) return null;
            if (!orcids) {
                orcids = new Map();
                for (const pid of Object.keys(people)) { const x = str(people[pid][5]).trim().toUpperCase(); if (x && !orcids.has(x)) orcids.set(x, pid); }
            }
            return orcids.get(o) || null;
        },
        units() {
            const out: Array<{ key: string; pid: string; tier: string }> = [];
            for (const k of Object.keys(units)) {
                const pid = unitPid(k);
                if (pid) out.push({ key: k, pid, tier: Array.isArray(units[k]) ? str(units[k][1]) : "" });
            }
            return out;
        },
        pidsOfName(last: string, first: string): string[] {
            const L = wvAftWords(last).join(" ");
            if (!L) return [];
            if (!lasts) {
                lasts = new Map();
                for (const pid of Object.keys(people)) {
                    const k = wvAftWords(str(people[pid][0])).join(" ");
                    if (!k) continue;
                    if (!lasts.has(k)) lasts.set(k, []);
                    lasts.get(k)!.push(pid);
                }
            }
            return (lasts.get(L) || []).filter((pid) => wvAftFirstAgrees(str(people[pid][1]), first));
        },
        pageUrl(pid: string): string {
            const p = person(pid);
            if (!p || !info.page || !p.tree) return info.site;
            return info.page.replace("{tree}", encodeURIComponent(p.tree)).replace("{pid}", encodeURIComponent(p.pid));
        },
        counts() {
            return { people: Object.keys(people).length, edges: edges.length, units: Object.keys(units).length, grants: Object.keys(grants).length };
        },
    };
}
