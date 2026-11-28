// The Researchers tab's list (people3; MJT 2026-11-24 on a screenshot of the
// tab: "I would show the names as 'LastName, FirstName', so that it is obvious
// that it is sorted by the last name [...]. Also put some other sorting and
// filtering options."): what the list reads of each researcher (wvPpInfos),
// the sorts, the filters and their menus' values, and the library index that
// counts the items each one authored in your libraries. Pure: no Zotero, no
// DOM -- modules/people.ts reads the database and draws.
//
// Unknown values (a fact no source gave yet: nothing is fetched for these
// options, MJT's plan point 4) sort LAST, are never kept by a value filter, and
// are a menu entry of their own ("Unknown"); ties go by last name.

import {
    WvPpLine, WvPpRecord, WvPpRef, WV_PP_FACTS, WV_PP_ID_KEYS, wvPpCountryName, wvPpFold, wvPpFormKey, wvPpNameForms, wvPpNameMatch, wvPpRecordIs,
    wvPpRefOf, wvPpRejectedForms, wvPpShown, wvPpSplitName, WV_PP_LINKS, wvPpGroups, wvPpIds, wvPpSame, WV_PP_NAME_FACT,
} from "./people-record";

/** Two records that may be one researcher (the Nodus study's idea 3, MJT
 *  2026-11-26), with the reasons: "id-orcid" / "id-openalex" / "id-idref" /
 *  "id-wikidata" (an identifier in common), "name" (exactly the same name),
 *  "form" (one's name is one of the other's other forms), "initials" (the same
 *  last name and initials), "institution" (the same institution shown). */
export interface WvPpDupe { a: WvPpRecord; b: WvPpRecord; reasons: string[]; strength: number }

/** The possible duplicates among `all`, strongest first. Never two records
 *  whose ORCID, IdRef or Wikidata ids differ (two people), nor a pair the user
 *  said is not the same (`notSame`). An id in common is enough; a name needs
 *  to be exact (or initials with the same institution). */
export function wvPpDuplicates(all: WvPpRecord[]): WvPpDupe[] {
    const out: WvPpDupe[] = [];
    const ids = (r: WvPpRecord, k: string) => wvPpIds(r, k).map((x) => String(x).toUpperCase());
    const inst = (r: WvPpRecord) => { const s = wvPpShown(r, "institution")[0]; return s ? wvPpFold(String(s.value)) : ""; };
    const formKeys = (r: WvPpRecord) => new Set(wvPpNameForms(r).map((f) => wvPpFormKey(f)).filter(Boolean));
    const ownKey = (r: WvPpRecord) => wvPpFormKey(r.first ? r.first + " " + r.last : r.last);
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            const a = all[i], b = all[j];
            if ((a.notSame || []).includes(b.id) || (b.notSame || []).includes(a.id)) continue;
            let clash = false;
            const reasons: string[] = [];
            let strength = 0;
            for (const k of WV_PP_ID_KEYS) {
                const x = ids(a, k), y = ids(b, k);
                if (!x.length || !y.length) continue;
                if (x.some((v) => y.includes(v))) { reasons.push("id-" + k); strength = Math.max(strength, 3); }
                else if (k !== "openalex") clash = true;
            }
            if (clash) continue;
            const nm = wvPpNameMatch(a.last, a.first, b.last, b.first);
            if (nm === "exact") { reasons.push("name"); strength = Math.max(strength, 2); }
            else {
                const ka = ownKey(a), kb = ownKey(b);
                if ((kb && formKeys(a).has(kb)) || (ka && formKeys(b).has(ka))) { reasons.push("form"); strength = Math.max(strength, 2); }
                else if (nm === "initials") { reasons.push("initials"); strength = Math.max(strength, 1); }
            }
            const ia = inst(a), ib = inst(b);
            if (ia && ia === ib) { reasons.push("institution"); if (strength === 1) strength = 2; }
            if (strength < 2) continue;
            out.push({ a, b, reasons, strength });
        }
    }
    return out.sort((x, y) => y.strength - x.strength || wvPpFold(x.a.last + " " + x.a.first).localeCompare(wvPpFold(y.a.last + " " + y.a.first)));
}

/** `drop` merged into `keep` (changed in place, returned): every line of
 *  drop's that keep has not from the same source; drop's own name as one of
 *  keep's other forms (the user's); drop's events, contact details and custom
 *  fields; the notes one after the other; Followed or To check if either was;
 *  keep's own fields first, drop's where keep has none. The caller removes drop. */
export function wvPpMergeInto(keep: WvPpRecord, drop: WvPpRecord): WvPpRecord {
    for (const l of drop.lines) {
        const dup = keep.lines.some((x) => x.fact === l.fact && x.source === l.source && wvPpSame(l.fact, x.value, l.value, x.ref, l.ref));
        if (!dup) keep.lines.push(JSON.parse(JSON.stringify(l)));
    }
    const dropName = drop.first ? drop.first + " " + drop.last : drop.last;
    const k = wvPpFormKey(dropName);
    if (k && k !== wvPpFormKey(keep.first ? keep.first + " " + keep.last : keep.last)
            && !keep.lines.some((x) => x.fact === WV_PP_NAME_FACT && wvPpFormKey(x.value) === k)) {
        keep.lines.push({ fact: WV_PP_NAME_FACT, value: dropName, source: "me", status: "chosen" });
    }
    const joinById = <T extends { id: string }>(a?: T[], b?: T[]): T[] | undefined => {
        const out = (a || []).slice();
        for (const x of b || []) if (!out.some((y) => y.id === x.id)) out.push(x);
        return out.length ? out : undefined;
    };
    const ev = joinById(keep.events, drop.events); if (ev) keep.events = ev;
    const co = joinById(keep.contact, drop.contact); if (co) keep.contact = co;
    const cu = joinById(keep.custom, drop.custom); if (cu) keep.custom = cu;
    if (drop.notes && drop.notes.trim()) keep.notes = keep.notes && keep.notes.trim() ? keep.notes + "\n\n" + drop.notes : drop.notes;
    keep.followed = keep.followed || drop.followed;
    keep.check = keep.check || drop.check;
    if (!keep.from && drop.from) keep.from = drop.from;
    if (!keep.aft && drop.aft) keep.aft = drop.aft;
    if (!keep.scholar && drop.scholar) keep.scholar = drop.scholar;
    const tg = [...new Set([...(keep.tags || []), ...(drop.tags || [])])];
    if (tg.length) keep.tags = tg;
    const ns = [...new Set([...(keep.notSame || []), ...(drop.notSame || [])])].filter((x) => x !== keep.id && x !== drop.id);
    if (ns.length) keep.notSame = ns; else delete keep.notSame;
    if (drop.created && (!keep.created || drop.created < keep.created)) keep.created = drop.created;
    return keep;
}

/** The researcher a link names: an id in common first, else exactly that name
 *  (or one of a record's other forms) with no id that contradicts the link's.
 *  The pure twin of people.ts _wvPeopleFindByRef. */
export function wvPpFindLinked(all: WvPpRecord[], name: string, ref?: WvPpRef): WvPpRecord | null {
    const byId = all.find((r) => wvPpRecordIs(r, ref));
    if (byId) return byId;
    const n = wvPpSplitName(name);
    const clashes = (r: WvPpRecord) => {
        const ids = wvPpRefOf(r) as any;
        return !!ref && WV_PP_ID_KEYS.some((k) => ref[k] && ids[k] && String(ids[k]).toUpperCase() !== String(ref[k]).toUpperCase());
    };
    for (const r of all) if (wvPpNameMatch(r.last, r.first, n.last, n.first) === "exact" && !clashes(r)) return r;
    for (const r of all) {
        const hit = wvPpNameForms(r).some((f) => { const s = wvPpSplitName(f); return wvPpNameMatch(s.last, s.first, n.last, n.first) === "exact"; });
        if (hit && !clashes(r)) return r;
    }
    return null;
}

/** A date that does not fit in the academic family (the Nodus study's idea 2,
 *  MJT 2026-11-26). `kind`: "advisor" -- an advisor's (or co-advisor's) PhD is not
 *  before the student's; "years" -- an advisor link's years do not hold the
 *  student's PhD year. `rec` holds the link, `other` is its researcher when
 *  recorded; the years are those the records show. */
export interface WvPpDateIssue { kind: "advisor" | "years"; rec: WvPpRecord; fact: string; value: string; other: WvPpRecord | null; year: number; otherYear: number | null; years: string }

const phdYearOf = (r: WvPpRecord): number | null => {
    const s = wvPpShown(r, "phd.year")[0];
    const m = s ? /\b(\d{4})\b/.exec(String(s.value)) : null;
    return m ? Number(m[1]) : null;
};

/** Every date issue among `all`. An advisor link (on the student's record) and
 *  a student link (on the advisor's) naming the same pair are one issue. A
 *  link's years "a-b" hold the PhD year from a to b + 1 (a thesis defended the
 *  year after the advising ended). Rejected links are not checked. */
export function wvPpDateChecks(all: WvPpRecord[]): WvPpDateIssue[] {
    const out: WvPpDateIssue[] = [];
    const seen = new Set<string>();
    for (const rec of all) {
        const y = phdYearOf(rec);
        for (const fact of ["link.advisor", "link.coadvisor", "link.student"]) {
            for (const s of wvPpShown(rec, fact)) {
                const ref = (s as any).ref as WvPpRef | undefined;
                const other = wvPpFindLinked(all.filter((r) => r.id !== rec.id), s.value, ref);
                const oy = other ? phdYearOf(other) : null;
                // The student and the advisor of the pair, whichever record holds the link.
                const student = fact === "link.student" ? other : rec, advisor = fact === "link.student" ? rec : other;
                const sy = fact === "link.student" ? oy : y, ay = fact === "link.student" ? y : oy;
                if (student && advisor && sy != null && ay != null && ay >= sy) {
                    const key = "advisor:" + advisor.id + ">" + student.id;
                    if (!seen.has(key)) {
                        seen.add(key);
                        out.push({ kind: "advisor", rec, fact, value: s.value, other, year: y as number, otherYear: oy, years: "" });
                    }
                }
                const years = String((s as any).years || "");
                const m = /(\d{4})\D+(\d{4})/.exec(years) || /^(\d{4})$/.exec(years.trim());
                if (fact !== "link.student" && y != null && m) {
                    const a = Number(m[1]), b = Number(m[2] || m[1]);
                    if (y < a || y > b + 1) out.push({ kind: "years", rec, fact, value: s.value, other, year: y, otherYear: oy, years });
                }
            }
        }
    }
    return out;
}

/** One link waiting for the user's word in the "Suggested links" queue. */
export interface WvPpQueueItem { rec: WvPpRecord; fact: string; value: string; ref?: WvPpRef; years: string; lines: WvPpLine[] }

/** Every link a source SUGGESTED (OpenAlex, Wikidata, an alerts file, your items)
 *  that the user has neither kept nor rejected, across all researchers (the
 *  Nodus study's idea 1, approved by MJT 2026-11-26): by researcher, A to Z,
 *  then in the record's order of links. A link a source confirmed (ORCID,
 *  theses.fr, IdRef) or the user chose or rejected is not asked about. */
export function wvPpLinkQueue(records: WvPpRecord[]): WvPpQueueItem[] {
    const out: WvPpQueueItem[] = [];
    const recs = records.slice().sort((a, b) => {
        const x = wvPpFold(a.last + " " + a.first), y = wvPpFold(b.last + " " + b.first);
        return x < y ? -1 : x > y ? 1 : 0;
    });
    for (const rec of recs) {
        for (const fact of WV_PP_LINKS) {
            for (const g of wvPpGroups(rec, fact)) {
                if (!g.some((l) => l.status === "suggested")) continue;
                if (g.some((l) => l.status === "chosen" || l.status === "confirmed" || l.status === "rejected")) continue;
                const withRef = g.find((l) => l.ref);
                const withYears = g.find((l) => l.years);
                out.push({ rec, fact, value: g[0].value, ref: withRef ? withRef.ref : undefined, years: withYears ? String(withYears.years) : "", lines: g });
            }
        }
    }
    return out;
}

/** The sorts, in the menu's order. */
export const WV_PP_SORTS = ["last", "first", "added", "modified", "items", "institution", "phdYear", "birthYear"] as const;
export type WvPpSort = typeof WV_PP_SORTS[number];

/** The filters that are on or off, in the funnel's order (its first row). */
export const WV_PP_TOGGLES = ["noOrcid", "noIds", "inLib", "thesis", "advisor", "student", "web", "conflict"] as const;
/** The filters that take values, each a section of the funnel, in its order. */
export const WV_PP_MENUS = ["position", "institution", "country", "phdCountry", "birth", "phd"] as const;
export type WvPpToggle = typeof WV_PP_TOGGLES[number];
export type WvPpMenu = typeof WV_PP_MENUS[number];

/** One side of the filters: a toggle `true`; a value filter its values (any
 *  of them; "" is Unknown, the researchers whose value is not known). */
export type WvPpFilterSet = Partial<Record<WvPpToggle, boolean> & Record<WvPpMenu, string[]>>;
/** The filters (people4, the funnel; MJT 2026-11-24 "Alt+Click to exclude"):
 *  what is included at the top level -- a researcher passes every toggle and,
 *  per value filter, has one of its values -- and under `not` what is
 *  excluded -- no excluded toggle holds for them, none of the excluded values
 *  is theirs. A value filter written as one string (people3's) is read as
 *  that value alone. Absent: off. */
export type WvPpFilters = WvPpFilterSet & { not?: WvPpFilterSet };

/** What the list reads of a researcher, once per change of the records. */
export interface WvPpInfo {
    orcid: boolean;
    anyId: boolean;
    advisor: boolean;
    student: boolean;
    web: boolean;
    conflict: boolean;
    position: string;
    institution: string;
    country: string;
    phdCountry: string;
    phdYear: number | null;
    birthYear: number | null;
}

/** A researcher's items in your libraries: the items they authored, how
 *  many, how many of them are theses. */
export interface WvPpLibStat { n: number; thesis: number; items?: number[] }

const yearOf = (v: string): number | null => { const m = /^\s*(\d{4})\b/.exec(String(v || "")); return m ? Number(m[1]) : null; };
const one = (rec: WvPpRecord, fact: string): string => { const s = wvPpShown(rec, fact)[0]; return s ? String(s.value || "").trim() : ""; };
const nameKey = (last: string, first: string) => wvPpFold(last) + "|" + wvPpFold(first);

/** Every researcher's list facts. A student link is seen from both sides: a
 *  researcher's own student links, and any other researcher's advisor or
 *  co-advisor link that names them -- by an id they hold, else by their exact
 *  name when no id contradicts it (as people.ts _wvPeopleFindByRef). One pass:
 *  the ids and names are looked up in maps. */
export function wvPpInfos(records: WvPpRecord[]): Map<string, WvPpInfo> {
    const out = new Map<string, WvPpInfo>();
    const byId = new Map<string, WvPpRecord>();
    const byName = new Map<string, WvPpRecord[]>();
    const refs = new Map<string, any>();
    for (const r of records) {
        const ref = wvPpRefOf(r);
        refs.set(r.id, ref);
        for (const k of WV_PP_ID_KEYS) {
            const vals = k === "openalex" ? ref.openalexAll : (ref[k] ? [ref[k] as string] : []);
            for (const v of vals) { const key = k + ":" + String(v).toUpperCase(); if (!byId.has(key)) byId.set(key, r); }
        }
        const nk = nameKey(r.last, r.first);
        if (!byName.has(nk)) byName.set(nk, []);
        (byName.get(nk) as WvPpRecord[]).push(r);
    }
    // Then each one's other forms of the name (people4), after every own name.
    for (const r of records) {
        for (const f of wvPpNameForms(r)) {
            const n = wvPpSplitName(f);
            const nk = nameKey(n.last, n.first);
            if (!byName.has(nk)) byName.set(nk, []);
            const a = byName.get(nk) as WvPpRecord[];
            if (!a.includes(r)) a.push(r);
        }
    }
    const resolve = (value: string, ref?: WvPpRef): WvPpRecord | null => {
        if (ref) {
            for (const k of WV_PP_ID_KEYS) {
                const v = ref[k];
                if (!v) continue;
                const hit = byId.get(k + ":" + String(v).toUpperCase());
                if (hit && wvPpRecordIs(hit, ref)) return hit;
            }
        }
        const n = wvPpSplitName(value);
        for (const r of byName.get(nameKey(n.last, n.first)) || []) {
            const ids = refs.get(r.id) || {};
            const clash = ref && WV_PP_ID_KEYS.some((k) => ref[k] && ids[k] && String(ids[k]).toUpperCase() !== String(ref[k]).toUpperCase());
            if (!clash) return r;
        }
        return null;
    };
    const students = new Set<string>();
    for (const r of records) {
        for (const f of ["link.advisor", "link.coadvisor"]) {
            for (const s of wvPpShown(r, f)) {
                const t = resolve(s.value, s.ref);
                if (t && t.id !== r.id) students.add(t.id);
            }
        }
    }
    for (const r of records) {
        const ids = WV_PP_ID_KEYS.filter((k) => wvPpShown(r, k).length > 0);
        let conflict = false;
        for (const d of WV_PP_FACTS) {
            if (d.forms) continue;
            const s = wvPpShown(r, d.key)[0];
            if (s && s.conflict) { conflict = true; break; }
        }
        out.set(r.id, {
            orcid: ids.includes("orcid"),
            anyId: ids.length > 0,
            advisor: wvPpShown(r, "link.advisor").length > 0 || wvPpShown(r, "link.coadvisor").length > 0,
            student: wvPpShown(r, "link.student").length > 0 || students.has(r.id),
            web: wvPpShown(r, "web").length > 0,
            conflict,
            position: one(r, "position"),
            institution: one(r, "institution"),
            country: one(r, "country").toUpperCase(),
            phdCountry: one(r, "phd.country").toUpperCase(),
            phdYear: yearOf(one(r, "phd.year")),
            birthYear: yearOf(one(r, "birth.year")),
        });
    }
    return out;
}

/** The decade of a year, as "1960"; "" when there is no year. */
export function wvPpDecade(y: number | null): string {
    return y ? String(Math.floor(y / 10) * 10) : "";
}

/** A menu filter's value for a researcher ("" when unknown), folded for the
 *  free-text ones (position, institution: "Professor" is "professor"). */
function menuValue(info: WvPpInfo, key: WvPpMenu): string {
    switch (key) {
        case "position": return info.position;
        case "institution": return info.institution;
        case "country": return info.country;
        case "phdCountry": return info.phdCountry;
        case "birth": return wvPpDecade(info.birthYear);
        case "phd": return wvPpDecade(info.phdYear);
    }
    return "";
}
const isText = (key: WvPpMenu) => key === "position" || key === "institution";

/** Whether a toggle holds for a researcher: true, false, or null when it
 *  cannot be told yet (In your libraries before the library is counted). */
export function wvPpToggleHolds(info: WvPpInfo, key: WvPpToggle, stat: WvPpLibStat | null | undefined): boolean | null {
    switch (key) {
        case "noOrcid": return !info.orcid;
        case "noIds": return !info.anyId;
        case "inLib": return stat ? stat.n > 0 : null;
        case "thesis": return stat ? stat.thesis > 0 : null;
        case "advisor": return info.advisor;
        case "student": return info.student;
        case "web": return info.web;
        case "conflict": return info.conflict;
    }
    return null;
}

/** A value filter's values as a list (people3 stored one string). */
const valuesOf = (v: any): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x: any) => typeof x === "string") : []);

/** Whether a value filter's `want` ("" = Unknown) is the researcher's `have`. */
function valueIs(key: WvPpMenu, want: string, have: string): boolean {
    if (want === "") return !have;
    if (!have) return false;
    return isText(key) ? wvPpFold(have) === wvPpFold(want) : have.toUpperCase() === want.toUpperCase();
}

/** Whether `info` (with `stat`, null while the library is not counted yet)
 *  passes every filter of `filters`: each included toggle holds, each value
 *  filter's value is one of its included values, no excluded toggle holds and
 *  no excluded value is theirs. A toggle that cannot be told yet passes
 *  neither way. */
export function wvPpFilterKeeps(info: WvPpInfo, filters: WvPpFilters, stat: WvPpLibStat | null | undefined): boolean {
    const f: any = filters || {};
    const n: any = (f.not && typeof f.not === "object") ? f.not : {};
    for (const k of WV_PP_TOGGLES) {
        if (f[k] === true && wvPpToggleHolds(info, k, stat) !== true) return false;
        if (n[k] === true && wvPpToggleHolds(info, k, stat) !== false) return false;
    }
    for (const k of WV_PP_MENUS) {
        const have = menuValue(info, k);
        const inc = valuesOf(f[k]);
        if (inc.length && !inc.some((w) => valueIs(k, w, have))) return false;
        if (valuesOf(n[k]).some((w) => valueIs(k, w, have))) return false;
    }
    return true;
}

/** How many filters are on, included and excluded (a value filter counts
 *  each of its values): the funnel is marked active when there is one. */
export function wvPpFiltersCount(filters: WvPpFilters): number {
    const f: any = filters || {};
    let c = 0;
    for (const side of [f, f.not || {}]) {
        for (const k of WV_PP_TOGGLES) if (side[k] === true) c++;
        for (const k of WV_PP_MENUS) c += valuesOf(side[k]).length;
    }
    return c;
}

/** A value filter's state for `value` ("" = Unknown): "in", "out" or null. */
export function wvPpFilterValueState(filters: WvPpFilters, key: WvPpMenu, value: string): "in" | "out" | null {
    const f: any = filters || {};
    const same = (w: string) => (value === "" ? w === "" : w !== "" && valueIs(key, w, value));
    if (valuesOf(f[key]).some(same)) return "in";
    if (valuesOf(f.not && f.not[key]).some(same)) return "out";
    return null;
}

/** The filters after a click on a chip of the funnel (as every Weavero
 *  filter: lib/style.ts wvFilterTileRules' tri-state tiles): a click includes
 *  -- or, on an included chip, clears --; Alt+click excludes -- or, on an
 *  excluded chip, clears. A toggle: `value` null. A copy; `filters` is left as
 *  it is. */
export function wvPpFilterClick(filters: WvPpFilters, key: string, value: string | null, alt: boolean): WvPpFilters {
    const f: any = wvPpFiltersParse(filters);
    const n: any = f.not || {};
    if ((WV_PP_TOGGLES as readonly string[]).includes(key)) {
        const was = f[key] === true ? "in" : n[key] === true ? "out" : null;
        delete f[key]; delete n[key];
        if (alt) { if (was !== "out") n[key] = true; }
        else if (was !== "in") f[key] = true;
    }
    else if ((WV_PP_MENUS as readonly string[]).includes(key) && typeof value === "string") {
        const k = key as WvPpMenu;
        const was = wvPpFilterValueState(f, k, value);
        const drop = (list: any) => valuesOf(list).filter((w) => !(value === "" ? w === "" : w !== "" && valueIs(k, w, value)));
        f[k] = drop(f[k]); n[k] = drop(n[k]);
        if (alt) { if (was !== "out") n[k].push(value); }
        else if (was !== "in") f[k].push(value);
        if (!f[k].length) delete f[k];
        if (!n[k].length) delete n[k];
    }
    if (Object.keys(n).length) f.not = n; else delete f.not;
    return f;
}

/** The researchers the list shows: the chip (To check / Followed / All), the
 *  search (any order of the name's words, the variants too), every filter --
 *  all of them at once. `lib`: each researcher's items in your libraries, null
 *  while not counted (then nobody passes In your libraries). */
export function wvPpListFilter(records: WvPpRecord[], infos: Map<string, WvPpInfo>, opts: { show: string; q: string; filters: WvPpFilters },
    lib: Map<string, WvPpLibStat> | null): WvPpRecord[] {
    const fq = wvPpFold(opts.q || "");
    return records.filter((r) => {
        if (opts.show === "check" && !r.check) return false;
        if (opts.show === "followed" && !r.followed) return false;
        if (fq) {
            // The tags too (1.3.0-peoplenet.17): the search finds a researcher by a tag.
            const hay = wvPpFold([r.first, r.last, r.last, r.first, ...wvPpNameForms(r), ...(r.tags || [])].join(" "));
            if (!hay.includes(fq) && !fq.split(" ").every((t) => hay.split(" ").some((w) => w.startsWith(t)))) return false;
        }
        const info = infos.get(r.id);
        return !info || wvPpFilterKeeps(info, opts.filters, lib ? lib.get(r.id) : null);
    });
}

/** The list in `sort`'s order (a copy). Unknown values last; ties, and an
 *  unknown sort, by last name then first name. */
export function wvPpListSort(records: WvPpRecord[], infos: Map<string, WvPpInfo>, sort: string, lib: Map<string, WvPpLibStat> | null): WvPpRecord[] {
    const byLast = (a: WvPpRecord, b: WvPpRecord) => {
        const x = wvPpFold(a.last + " " + a.first), y = wvPpFold(b.last + " " + b.first);
        return x < y ? -1 : x > y ? 1 : 0;
    };
    // A key per record: null = unknown; numbers or strings compared as they come.
    type K = string | number | null;
    let key: ((r: WvPpRecord) => K) | null = null;
    let desc = false;
    const info = (r: WvPpRecord) => infos.get(r.id);
    switch (sort) {
        case "first": key = (r) => (wvPpFold(r.first) ? wvPpFold(r.first + " " + r.last) : null); break;
        case "added": key = (r) => r.created || null; desc = true; break;
        case "modified": key = (r) => r.modified || null; desc = true; break;
        case "items": key = (r) => { const s = lib && lib.get(r.id); return s ? s.n : null; }; desc = true; break;
        case "institution": key = (r) => { const i = info(r); return i && i.institution ? wvPpFold(i.institution) : null; }; break;
        case "phdYear": key = (r) => { const i = info(r); return i ? i.phdYear : null; }; break;
        case "birthYear": key = (r) => { const i = info(r); return i ? i.birthYear : null; }; break;
    }
    const list = records.slice();
    if (!key) return list.sort(byLast);
    const keys = new Map<string, K>(list.map((r) => [r.id, (key as (r: WvPpRecord) => K)(r)]));
    return list.sort((a, b) => {
        const x = keys.get(a.id) as K, y = keys.get(b.id) as K;
        if (x == null && y == null) return byLast(a, b);
        if (x == null) return 1;
        if (y == null) return -1;
        if (x === y) return byLast(a, b);
        const c = x < y ? -1 : 1;
        return desc ? -c : c;
    });
}

/** The researchers table's columns (MJT 2026-11-25, the Google Contacts design:
 *  "Name with initials avatar, Institution, Country, Papers in your libraries,
 *  PhD year; click a column title to sort; Followed first, like Google's
 *  Favourites"). */
export const WV_PP_TABLE_COLS = ["name", "institution", "country", "papers", "phd", "tags"] as const;
export type WvPpTableCol = typeof WV_PP_TABLE_COLS[number];

/** The table's order: the followed researchers first, then by `col` -- up or
 *  down, a researcher without the value last either way, ties by name.
 *  `countryName` gives a country code's name (sorted by name, not code). */
export function wvPpTableSort(records: WvPpRecord[], infos: Map<string, WvPpInfo>, col: string, dir: "asc" | "desc",
    lib: Map<string, WvPpLibStat> | null, countryName?: (code: string) => string): WvPpRecord[] {
    const name = (r: WvPpRecord) => wvPpFold(r.last + " " + r.first);
    type K = string | number | null;
    const info = (r: WvPpRecord) => infos.get(r.id);
    const keyOf = (r: WvPpRecord): K => {
        const i = info(r);
        switch (col) {
            case "institution": return i && i.institution ? wvPpFold(i.institution) : null;
            case "country": return i && i.country ? wvPpFold(countryName ? countryName(i.country) || i.country : i.country) : null;
            case "papers": { const s = lib && lib.get(r.id); return s && s.n ? s.n : null; }
            case "phd": return i && i.phdYear ? i.phdYear : null;
            // The Tags column (hidden by default): by the tags, A to Z.
            case "tags": return r.tags && r.tags.length ? r.tags.map((t) => t.toLowerCase()).sort().join(", ") : null;
            default: return name(r) || null;
        }
    };
    const keys = new Map<string, K>(records.map((r) => [r.id, keyOf(r)]));
    const sign = dir === "desc" ? -1 : 1;
    return records.slice().sort((a, b) => {
        if (!!a.followed !== !!b.followed) return a.followed ? -1 : 1;
        const x = keys.get(a.id) as K, y = keys.get(b.id) as K;
        if (x == null || y == null) {
            if (x != null) return -1;
            if (y != null) return 1;
        }
        else if (x !== y) return (x < y ? -1 : 1) * sign;
        const n = name(a), m = name(b);
        return n < m ? -1 : n > m ? 1 : 0;
    });
}

/** Up to two initials for the avatar: the first name's and the last name's. */
export function wvPpInitials(last: string, first: string): string {
    const ch = (s: string) => { const m = /\p{L}/u.exec(String(s || "")); return m ? m[0].toUpperCase() : ""; };
    return (ch(first) + ch(last)) || "?";
}

/** A menu chip's entries: each value present (a country by its name in
 *  `locale`, a decade as "1960"), how many researchers have it, then the
 *  unknown ones (value and label ""). Values by label, decades in order. */
export function wvPpMenuValues(records: WvPpRecord[], infos: Map<string, WvPpInfo>, key: WvPpMenu, locale?: string): Array<{ value: string; label: string; count: number }> {
    const got = new Map<string, { value: string; label: string; count: number }>();
    let unknown = 0;
    for (const r of records) {
        const i = infos.get(r.id);
        const v = i ? menuValue(i, key) : "";
        if (!v) { unknown++; continue; }
        const k = isText(key) ? wvPpFold(v) : v.toUpperCase();
        const e = got.get(k);
        if (e) e.count++;
        else got.set(k, { value: v, label: key === "country" || key === "phdCountry" ? wvPpCountryName(v, locale) : v, count: 1 });
    }
    const list = [...got.values()];
    if (key === "birth" || key === "phd") list.sort((a, b) => Number(a.value) - Number(b.value));
    else list.sort((a, b) => a.label.localeCompare(b.label, locale || undefined, { sensitivity: "base" }));
    if (unknown) list.push({ value: "", label: "", count: unknown });
    return list;
}

/** The filters stored in `weavero.people.filters` (JSON), what is valid of
 *  them: a toggle `true`; a value filter its values, each once (people3's one
 *  string read as one value); the same under `not`, for what is excluded. A
 *  value both included and excluded stays included. */
export function wvPpFiltersParse(json: any): WvPpFilters {
    let o: any = null;
    try { o = typeof json === "string" ? JSON.parse(json || "{}") : json; } catch (e) { o = null; }
    const side = (s: any): WvPpFilterSet => {
        const out: WvPpFilterSet = {};
        if (!s || typeof s !== "object" || Array.isArray(s)) return out;
        for (const k of WV_PP_TOGGLES) if (s[k] === true) out[k] = true;
        for (const k of WV_PP_MENUS) {
            const vals: string[] = [];
            for (const v of valuesOf(s[k])) if (!vals.some((w) => (v === "" ? w === "" : w !== "" && valueIs(k, w, v)))) vals.push(v);
            if (vals.length) out[k] = vals;
        }
        return out;
    };
    const out: WvPpFilters = side(o);
    const not: any = side(o && o.not);
    for (const k of WV_PP_TOGGLES) if (not[k] && (out as any)[k]) delete not[k];
    for (const k of WV_PP_MENUS) {
        if (!not[k] || !(out as any)[k]) continue;
        not[k] = not[k].filter((v: string) => wvPpFilterValueState(out, k, v) !== "in");
        if (!not[k].length) delete not[k];
    }
    if (Object.keys(not).length) out.not = not;
    return out;
}

// ---- the library index ----------------------------------------------------------

/** The creators of your libraries by folded last name, and the items each
 *  creator is on: (item, authored, thesis). Built from one read of the
 *  creators and one of the item creators (people.ts _wvPeopleLibIndexBuild). */
export interface WvPpLibIndex {
    byLast: Map<string, Array<{ cid: number; last: string; first: string }>>;
    items: Map<number, Array<[number, boolean, boolean]>>;
}

export function wvPpLibIndexNew(): WvPpLibIndex { return { byLast: new Map(), items: new Map() }; }

/** One creator into the index. */
export function wvPpLibIndexCreator(ix: WvPpLibIndex, cid: number, last: string, first: string): void {
    const k = wvPpFold(last);
    if (!k) return;
    let a = ix.byLast.get(k);
    if (!a) { a = []; ix.byLast.set(k, a); }
    a.push({ cid, last: String(last || ""), first: String(first || "") });
}

/** One item creator into the index (a creator's role on an item:
 *  `authored` -- the item type's primary creator, or author --, and whether the
 *  item is a thesis). */
export function wvPpLibIndexPair(ix: WvPpLibIndex, cid: number, item: number, authored: boolean, thesis: boolean): void {
    let a = ix.items.get(cid);
    if (!a) { a = []; ix.items.set(cid, a); }
    a.push([item, authored, thesis]);
}

/** The index of `creators` and `pairs` at once (the specs; the module adds
 *  row by row while it reads). */
export function wvPpLibIndexBuild(creators: Array<{ id: number; last: string; first: string }>, pairs: Array<{ cid: number; item: number; authored: boolean; thesis: boolean }>): WvPpLibIndex {
    const ix = wvPpLibIndexNew();
    for (const c of creators || []) wvPpLibIndexCreator(ix, c.id, c.last, c.first);
    for (const p of pairs || []) wvPpLibIndexPair(ix, p.cid, p.item, !!p.authored, !!p.thesis);
    return ix;
}

/** The creators of the index whose name fits the researcher's -- their own
 *  name and every other form of it not rejected (people4), exactly or by
 *  initials (wvPpNameMatch: a NAME match, as the Publications section's "items
 *  of your libraries with an author of this name") -- but never a creator
 *  written exactly as a form the user rejected ("Thoraval, M." may be someone
 *  else). */
export function wvPpLibCreatorsOf(rec: { last: string; first: string; variants?: string[]; lines?: WvPpLine[] }, ix: WvPpLibIndex): number[] {
    const names: Array<{ last: string; first: string }> = [{ last: rec.last, first: rec.first }];
    for (const v of wvPpNameForms(rec)) names.push(wvPpSplitName(v));
    const refused = new Set(wvPpRejectedForms(rec).map(wvPpFormKey));
    const cids = new Set<number>();
    for (const n of names) {
        for (const c of ix.byLast.get(wvPpFold(n.last)) || []) {
            if (cids.has(c.cid)) continue;
            if (refused.size && refused.has(wvPpFold(c.last) + "|" + wvPpFold(c.first))) continue;
            if (wvPpNameMatch(c.last, c.first, n.last, n.first)) cids.add(c.cid);
        }
    }
    return [...cids];
}

/** How the creators of your libraries that are the researcher write the name
 *  (people4, the Other names row's "your items"): "Last, First" of each
 *  creator wvPpLibCreatorsOf finds, each form once, at most `max`. */
export function wvPpLibFormsOf(rec: { last: string; first: string; variants?: string[]; lines?: WvPpLine[] }, ix: WvPpLibIndex, max?: number): string[] {
    const want = new Set(wvPpLibCreatorsOf(rec, ix));
    const out: string[] = [];
    const seen = new Set<string>();
    // Only the last names the researcher goes by: never a scan of the index.
    const lasts = new Set([wvPpFold(rec.last), ...wvPpNameForms(rec).map((f) => wvPpFold(wvPpSplitName(f).last))]);
    for (const lk of lasts) {
        for (const c of ix.byLast.get(lk) || []) {
            // A creator on no item (left in the table after its items went) writes nothing.
            if (!want.has(c.cid) || !(ix.items.get(c.cid) || []).length) continue;
            const v = [String(c.last || "").trim(), String(c.first || "").trim()].filter(Boolean).join(", ");
            const k = wvPpFormKey(v);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            out.push(v);
            if (max && out.length >= max) return out;
        }
    }
    return out;
}

/** A researcher's items in your libraries: the items whose creator by their
 *  name AUTHORED them, and how many of those are theses. `all`: every item
 *  with such a creator, any role (the Publications section's fallback). */
export function wvPpLibStatOf(rec: { last: string; first: string; variants?: string[]; lines?: WvPpLine[] }, ix: WvPpLibIndex, all?: boolean): WvPpLibStat {
    const items = new Set<number>(), theses = new Set<number>();
    for (const cid of wvPpLibCreatorsOf(rec, ix)) {
        for (const [item, authored, thesis] of ix.items.get(cid) || []) {
            if (!authored && !all) continue;
            items.add(item);
            if (thesis && authored) theses.add(item);
        }
    }
    return { n: items.size, thesis: theses.size, items: [...items] };
}
