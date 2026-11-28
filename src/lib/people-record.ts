// People (plan approved by MJT 2026-11-22, branch people2: "I want that data
// only in Weavero, in a structured way, with a special interface especially
// designed to build and check the data on other researchers"): the RECORD of
// a researcher -- its facts, each with every source's value and the user's
// decision -- and the rules that merge a fetch into it and decide which value
// the People tab shows. Pure: no Zotero, no DOM. The store is
// <data dir>/weavero/people.json (modules/people.ts, lib/store.ts); nothing of
// it is ever written into a Zotero library.
//
// A record holds one LINE per (fact, value, source): the value, its years, the
// source's record (a web page), when it was fetched, its status. Identifiers
// (ORCID, OpenAlex, IdRef, Wikidata) are facts like the others: confirmed or
// not, chosen or rejected. Links between researchers are facts too ("link.*",
// several values each), whose line carries the other person's ids (`ref`).
//
// Status: chosen (the user kept it, or typed it: source "me"), confirmed
// (ORCID, theses.fr, IdRef -- confirmed automatically, MJT's answer 3 of the
// research doc), suggested (OpenAlex, Wikidata, the followed list),
// alternative (a value of a one-value fact the user did not keep), rejected
// (never shown nor suggested again). "New": a value that arrived after the
// fact had others -- a later conflict. Every choice survives every Refresh:
// a fetch never changes a status the user set, and nothing is deleted.
//
// The rules came from the first People build (lib/people-note.ts, branch
// people, 2026-11-22) without its note format.

export type WvPpStatus = "chosen" | "confirmed" | "suggested" | "alternative" | "rejected";
/** "items": a spelling of the name on your libraries' items (people4, the
 *  Other names row); "me": what the user typed. */
export type WvPpSource = "orcid" | "openalex" | "thesesfr" | "idref" | "wikidata" | "radar" | "items" | "me";
export type WvPpWhy = "chosen" | "confirmed" | "suggested";

export interface WvPpFactDef {
    key: string;
    /** Several values hold at once (co-advisors, profiles, pages, links). */
    multi: boolean;
    /** An identifier (value normalized). */
    id?: boolean;
    /** A link to another researcher: its lines carry `ref`. */
    link?: boolean;
    /** The value may come with years ("2018–2026"). */
    years?: boolean;
    /** A form of the person's name: compared as a name ("Sauret, A" is "A.
     *  Sauret"), never "new" nor a conflict -- the forms add up. */
    forms?: boolean;
    /** Sources by preference when nobody chose: the first wins. */
    prefer: WvPpSource[];
}

const P_PHD: WvPpSource[] = ["me", "thesesfr", "orcid", "idref", "wikidata", "openalex", "radar", "items"];
const P_JOB: WvPpSource[] = ["me", "orcid", "openalex", "wikidata", "thesesfr", "idref", "radar", "items"];
const P_ID: WvPpSource[] = ["me", "orcid", "idref", "thesesfr", "openalex", "wikidata", "radar", "items"];
const P_BIO: WvPpSource[] = ["me", "wikidata", "idref", "orcid", "thesesfr", "openalex", "radar", "items"];
const P_NAME: WvPpSource[] = ["me", "orcid", "wikidata", "openalex", "items", "idref", "thesesfr", "radar"];

/** The fact of the other forms of a researcher's name (people4, MJT
 *  2026-11-24: "Other forms of the name should also be displayed"): ORCID's
 *  name, credit name and other names, OpenAlex's display_name and
 *  display_name_alternatives, Wikidata's label and aliases, the spellings of
 *  your items, and the user's own. Every form not rejected counts when an
 *  author is matched to the researcher by name. */
export const WV_PP_NAME_FACT = "name.other";

/** The facts written as a country: an ISO 3166-1 alpha-2 code ("FR"), shown
 *  by its name in the interface's language (wvPpCountryName). */
export const WV_PP_COUNTRY_FACTS = ["country", "phd.country"];

export const WV_PP_FACTS: WvPpFactDef[] = [
    { key: "orcid", multi: false, id: true, prefer: P_ID },
    { key: "openalex", multi: true, id: true, prefer: P_ID },
    { key: "idref", multi: false, id: true, prefer: P_ID },
    { key: "wikidata", multi: false, id: true, prefer: P_ID },
    { key: WV_PP_NAME_FACT, multi: true, forms: true, prefer: P_NAME },
    { key: "position", multi: false, years: true, prefer: P_JOB },
    { key: "institution", multi: false, years: true, prefer: P_JOB },
    // The country of the current institution (people3, MJT 2026-11-24): ORCID's
    // current employment's organization.address.country, OpenAlex's
    // last_known_institutions[].country_code (lib/people-sources.ts).
    { key: "country", multi: false, prefer: P_JOB },
    { key: "phd.institution", multi: false, prefer: P_PHD },
    // The country of the PhD: ORCID's PhD education's organization.address.country;
    // "FR" for a thesis theses.fr lists (it lists the theses defended in France).
    { key: "phd.country", multi: false, prefer: P_PHD },
    { key: "phd.year", multi: false, prefer: P_PHD },
    { key: "phd.thesis", multi: false, prefer: P_PHD },
    // Wikidata's date of birth (P569), its year alone; only where Wikidata has it.
    { key: "birth.year", multi: false, prefer: P_BIO },
    { key: "web", multi: true, prefer: P_JOB },
    { key: "link.advisor", multi: true, link: true, years: true, prefer: P_PHD },
    { key: "link.coadvisor", multi: true, link: true, years: true, prefer: P_PHD },
    { key: "link.postdoc", multi: true, link: true, years: true, prefer: P_JOB },
    { key: "link.lab", multi: true, link: true, years: true, prefer: P_JOB },
    { key: "link.linked", multi: true, link: true, prefer: P_JOB },
    { key: "link.student", multi: true, link: true, years: true, prefer: P_PHD },
];
const FACT_BY_KEY = new Map(WV_PP_FACTS.map((d) => [d.key, d]));
export function wvPpFact(key: string): WvPpFactDef | null { return FACT_BY_KEY.get(key) || null; }
/** The facts that link a researcher to another, in the record's order. */
export const WV_PP_LINKS = WV_PP_FACTS.filter((d) => d.link).map((d) => d.key);
/** The facts of a researcher's Facts section, in the record's order: every one
 *  that is no identifier, no other form of the name and no link -- position,
 *  institution, country, the PhD's institution, country, year and thesis, the
 *  year of birth, the web pages. The page shows them (people.ts), and the
 *  Researchers tab's right pane all of them too (MJT 2026-11-27, "like the full
 *  page's view mode"; people-pane.ts). */
export const WV_PP_FACTS_SHOWN = WV_PP_FACTS.filter((d) => !d.id && !d.forms && !d.link).map((d) => d.key);
/** The identifiers a person or a link target is found by. */
export const WV_PP_ID_KEYS = ["orcid", "openalex", "idref", "wikidata"] as const;
export type WvPpIdKey = typeof WV_PP_ID_KEYS[number];

/** Each source: its proper name (never translated), and the status a value
 *  it gives gets on its own (MJT's answer 3: ORCID and theses.fr facts are
 *  confirmed automatically; IdRef is theses.fr's own authority file). */
export const WV_PP_SOURCES: Record<WvPpSource, { name: string; auto: WvPpStatus }> = {
    orcid: { name: "ORCID", auto: "confirmed" },
    thesesfr: { name: "theses.fr", auto: "confirmed" },
    idref: { name: "IdRef", auto: "confirmed" },
    openalex: { name: "OpenAlex", auto: "suggested" },
    wikidata: { name: "Wikidata", auto: "suggested" },
    // Named by the interface ("alerts file", "your items", "you"): not a proper
    // name. "radar" is the key stored in people.json: renaming it needs a
    // migration of the records.
    radar: { name: "alerts file", auto: "suggested" },
    items: { name: "items", auto: "suggested" },
    me: { name: "me", auto: "chosen" },
};
const STATUS_ORDER: WvPpStatus[] = ["chosen", "confirmed", "suggested", "alternative", "rejected"];

/** A link's other researcher, as a source identifies them. */
export type WvPpRef = Partial<Record<WvPpIdKey, string>>;

export interface WvPpLine {
    fact: string;
    value: string;
    years?: string;
    source: WvPpSource;
    /** The record the value was read from (a web page). */
    url?: string;
    /** YYYY-MM-DD, when it was fetched (or typed). */
    date?: string;
    status: WvPpStatus;
    isNew?: boolean;
    /** A link's other researcher: their ids. */
    ref?: WvPpRef;
    /** On the user's own value: where it is written (the Nodus study's idea 4,
     *  MJT 2026-11-26), an item of a library, its page and a quote. */
    ev?: WvPpEvidence;
}

/** Evidence for a value: `group` null for My Library, else the group's id; the
 *  item's key; the page as the PDF labels it; the words quoted; the item's
 *  title when it was given (shown while the item cannot be read). */
export interface WvPpEvidence { group: number | null; key: string; page?: string; quote?: string; title?: string }

/** A zotero:// link to an item (open, open-pdf or select; My Library or a
 *  group; a ?page=), as evidence; null when it is not one. */
export function wvPpEvidenceFromLink(link: string): WvPpEvidence | null {
    const m = /^zotero:\/\/(?:open|open-pdf|select)\/(library|groups\/(\d+))\/items\/([A-Z0-9]{8})(?:\?([^#\s]*))?/i.exec(String(link || "").trim());
    if (!m) return null;
    const ev: WvPpEvidence = { group: m[2] ? Number(m[2]) : null, key: m[3].toUpperCase() };
    const pm = m[4] ? /(?:^|&)page=([^&]+)/.exec(m[4]) : null;
    if (pm) { try { ev.page = decodeURIComponent(pm[1]); } catch (e) { ev.page = pm[1]; } }
    return ev;
}

/** The zotero:// link that opens the evidence (at its page). */
export function wvPpEvidenceLink(ev: WvPpEvidence): string {
    return "zotero://open/" + (ev.group != null ? "groups/" + ev.group : "library") + "/items/" + ev.key + (ev.page ? "?page=" + encodeURIComponent(ev.page) : "");
}

/** Evidence as stored, or undefined when it is not some. */
export function wvPpEvidenceNorm(e: any): WvPpEvidence | undefined {
    if (!e || typeof e !== "object" || typeof e.key !== "string" || !/^[A-Z0-9]{8}$/.test(e.key)) return undefined;
    const out: WvPpEvidence = { group: Number.isInteger(e.group) ? e.group : null, key: e.key };
    for (const k of ["page", "quote", "title"] as const) if (typeof e[k] === "string" && e[k].trim()) out[k] = e[k].trim();
    return out;
}

export interface WvPpRecord {
    /** Weavero's own id for the person ("p" + base-36), stable for good. */
    id: string;
    last: string;
    first: string;
    /** "me": the user typed the name (people4); no source ever changes it. */
    nameBy?: "me";
    /** LEGACY (people2/3): the names OpenAlex gave at a Refresh -- its
     *  display_name and display_name_alternatives, the only writer of this list
     *  until people4. Read as OpenAlex's forms of the name ("name.other"
     *  lines), into which wvPpNormalizeRecord moves them. */
    variants: string[];
    lines: WvPpLine[];
    followed: boolean;
    /** Waiting for the user's look ("To check"). */
    check: boolean;
    notes: string;
    /** The item the person was added from. */
    from?: { lib: number | null; key: string; title: string; doi?: string };
    /** The Academic Family Tree person the record was followed from (its
     *  lineage tree's card, peoplenet): that person's id there. */
    aft?: string;
    /** Dated events the user recorded (MJT 2026-11-25: "add information for
     *  researchers on some dated events, such as giving a seminar in LadHyX,
     *  with the link to the seminar announcement"): the user's own data, in
     *  people.json only. */
    events?: WvPpEvent[];
    /** How to reach them (MJT 2026-11-25: "record the address of the
     *  researcher, phone number, ... And multiple of them, with proper labels,
     *  like on Google Contacts"): the user's own data, in people.json only. */
    contact?: WvPpContact[];
    /** Fields the user names (MJT 2026-11-25: "manual custom fields, same as
     *  in Google Contacts"): a label and a value; people.json only. */
    custom?: WvPpCustom[];
    /** Their Google Scholar profile (its user id), read on a click only. */
    scholar?: string;
    /** Researchers the user said are NOT this one (Possible duplicates: Not the same). */
    notSame?: string[];
    /** The user's tags (MJT 2026-11-26: "tag authors, same as for the Zotero
     *  items"; lib/people-tags.ts): names, each once; people.json only. */
    tags?: string[];
    /** ISO dates. */
    created: string;
    modified: string;
}

/** The kinds of contact details, in the card's order. */
export const WV_PP_CONTACT_KINDS = ["email", "phone", "address", "web"] as const;
export type WvPpContactKind = typeof WV_PP_CONTACT_KINDS[number];
/** The labels offered (Google Contacts' own); any other text is a label too. */
export const WV_PP_CONTACT_LABELS = ["work", "home", "mobile", "other"] as const;

/** One contact detail: an email, a phone, a postal address (several lines)
 *  or a website, with its label ("work", "home", "mobile", "other" or the
 *  user's own words). */
export interface WvPpContact { id: string; kind: WvPpContactKind; label: string; value: string }

/** One custom field: the user's label and value. */
export interface WvPpCustom { id: string; label: string; value: string }

const newID = (p: string) => p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

/** Why a contact value is refused, or "" when it is one. Email: one @ and a
 *  dot after it; phone: digits (at least three) with + ( ) - . / and spaces;
 *  website: an http(s) address; address: anything not empty. */
export function wvPpContactCheck(kind: string, value: string): "" | "empty" | "email" | "phone" | "web" | "kind" {
    const v = String(value || "").trim();
    if (!(WV_PP_CONTACT_KINDS as readonly string[]).includes(kind)) return "kind";
    if (!v) return "empty";
    if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email";
    if (kind === "phone" && (!/^[+\d\s().\-/]+$/.test(v) || (v.match(/\d/g) || []).length < 3)) return "phone";
    if (kind === "web" && !wvPpEventLink(v)) return "web";
    return "";
}

/** A contact detail as stored, or null when it is not one. */
export function wvPpContactNorm(c: any): WvPpContact | null {
    if (!c || typeof c !== "object") return null;
    const str = (v: any) => (typeof v === "string" ? v : "");
    const kind = str(c.kind);
    let value = kind === "address" ? str(c.value).replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n") : str(c.value).trim();
    if (wvPpContactCheck(kind, value)) return null;
    if (kind === "web") value = wvPpEventLink(value);
    return { id: str(c.id).trim() || newID("c"), kind: kind as WvPpContactKind, label: str(c.label).trim() || "other", value };
}

/** A custom field as stored, or null (no label, or no value). */
export function wvPpCustomNorm(c: any): WvPpCustom | null {
    if (!c || typeof c !== "object") return null;
    const label = typeof c.label === "string" ? c.label.trim() : "";
    const value = typeof c.value === "string" ? c.value.trim() : "";
    if (!label || !value) return null;
    return { id: typeof c.id === "string" && c.id.trim() ? c.id.trim() : newID("f"), label, value };
}

/** The labels used for custom fields on any researcher, most used first. */
export function wvPpCustomLabels(all: WvPpRecord[]): string[] {
    const n = new Map<string, { v: string; n: number }>();
    for (const r of all || []) {
        for (const c of r.custom || []) {
            const k = c.label.toLowerCase();
            const e = n.get(k);
            if (e) e.n++;
            else n.set(k, { v: c.label, n: 1 });
        }
    }
    return [...n.values()].sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)).map((x) => x.v);
}

/** The contact details in the card's order: by kind, then as entered. */
export function wvPpContactSorted(list: WvPpContact[]): WvPpContact[] {
    const ord = (k: string) => (WV_PP_CONTACT_KINDS as readonly string[]).indexOf(k);
    return (list || []).map((c, i) => ({ c, i })).sort((a, b) => ord(a.c.kind) - ord(b.c.kind) || a.i - b.i).map((x) => x.c);
}

/** One dated event: a day, a month or a year; what it was (a free label);
 *  where; the link to its announcement; a note. */
export interface WvPpEvent {
    id: string;
    /** "YYYY-MM-DD", "YYYY-MM" or "YYYY". */
    date: string;
    what: string;
    where?: string;
    link?: string;
    note?: string;
}

/** A date an event may have: a day, a month or a year. */
export const WV_PP_EVENT_DATE = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;

/** An http(s) link as typed ("www.x.fr/a" gets its https://); "" when it is not one. */
export function wvPpEventLink(v: string): string {
    let s = String(v || "").trim();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    }
    catch (e) { return ""; }
}

/** An event as stored, or null when it is not one (no date of the three
 *  forms, nothing said of what it was). */
export function wvPpEventNorm(e: any): WvPpEvent | null {
    if (!e || typeof e !== "object") return null;
    const str = (v: any) => (typeof v === "string" ? v.trim() : "");
    const date = str(e.date), what = str(e.what);
    if (!WV_PP_EVENT_DATE.test(date) || !what) return null;
    const out: WvPpEvent = { id: str(e.id) || ("e" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)), date, what };
    const where = str(e.where), note = str(e.note), link = wvPpEventLink(str(e.link));
    if (where) out.where = where;
    if (link) out.link = link;
    if (note) out.note = note;
    return out;
}

/** Newest first; a month after the days in it, a year after its months (the
 *  vaguer date sorts as its start); the same date by what. */
export function wvPpEventsSorted(events: WvPpEvent[]): WvPpEvent[] {
    const key = (d: string) => (d + "-00-00").slice(0, 10);
    return (events || []).slice().sort((a, b) => key(b.date).localeCompare(key(a.date)) || a.what.localeCompare(b.what));
}

/** The labels to offer for `field`: the ones used on any researcher, most used
 *  first, then the `defaults` not used yet. Compared without case. */
export function wvPpEventSuggest(all: WvPpRecord[], field: "what" | "where", defaults: string[]): string[] {
    const n = new Map<string, { v: string; n: number }>();
    for (const r of all || []) {
        for (const e of r.events || []) {
            const v = String((e as any)[field] || "").trim();
            if (!v) continue;
            const k = v.toLowerCase();
            const c = n.get(k);
            if (c) c.n++;
            else n.set(k, { v, n: 1 });
        }
    }
    const used = [...n.values()].sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)).map((x) => x.v);
    const seen = new Set(used.map((v) => v.toLowerCase()));
    return used.concat((defaults || []).filter((d) => d && !seen.has(d.toLowerCase())));
}

/** "25 Nov 2026", "Nov 2026" or "2026" in `locale`'s words. */
export function wvPpEventDate(date: string, locale?: string): string {
    const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(date || ""));
    if (!m) return String(date || "");
    if (!m[2]) return m[1];
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
    const opts: any = m[3] ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" };
    try { return new Intl.DateTimeFormat(locale || undefined, opts).format(d); }
    catch (e) { return date; }
}

// ---- text helpers -----------------------------------------------------------

/** Lower case, no accents, punctuation as spaces, one space between words. */
export function wvPpFold(s: string): string {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** An identifier as Weavero writes it, from what a hand or a source wrote
 *  (a bare id or its URL); "" when it is not one. */
export function wvPpNormId(fact: string, v: string): string {
    const s = String(v || "").trim();
    let m: RegExpMatchArray | null = null;
    if (fact === "orcid") m = s.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i);
    else if (fact === "openalex") m = s.match(/\bA\d{4,}\b/i);
    else if (fact === "idref") m = s.match(/(?<![\d])\d{8}[\dX](?![\d])/i);
    else if (fact === "wikidata") m = s.match(/\bQ\d+\b/i);
    return m ? m[0].toUpperCase() : "";
}

/** Two link targets are the same researcher: an id both name decides (equal:
 *  the same; different: not); with none in common, the names (folded). */
export function wvPpSameRef(aName: string, a: WvPpRef | undefined, bName: string, b: WvPpRef | undefined): boolean {
    for (const k of WV_PP_ID_KEYS) {
        const x = a && a[k], y = b && b[k];
        if (x && y) return String(x).toUpperCase() === String(y).toUpperCase();
    }
    return !!wvPpFold(aName) && wvPpFold(aName) === wvPpFold(bName);
}

/** Two values of a fact are the same value (case, accents, punctuation and
 *  spacing aside; an identifier as written, case aside; a link by its ids). */
export function wvPpSame(fact: string, a: string, b: string, ra?: WvPpRef, rb?: WvPpRef): boolean {
    const d = wvPpFact(fact);
    if (d && d.id) return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
    if (d && d.link) return wvPpSameRef(a, ra, b, rb);
    if (d && d.forms) return !!wvPpFormKey(a) && wvPpFormKey(a) === wvPpFormKey(b);
    if (fact === "web") return String(a || "").trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "").toLowerCase()
        === String(b || "").trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "").toLowerCase();
    return wvPpFold(a) === wvPpFold(b);
}

const sameLine = (fact: string, l: WvPpLine, v: string, ref?: WvPpRef) => wvPpSame(fact, l.value, v, l.ref, ref);

/** "Alban", "A.", "A. B." -- the initials of a first name. */
function initials(first: string): string {
    return wvPpFold(first).split(" ").filter(Boolean).map((w) => w[0]).join("");
}

/** How a creator's name fits a person's: "exact" (same last and first
 *  names), "initials" (same last name, first names that agree as far as the
 *  shorter goes -- "A." and "Alban"), or null. Accents, case and punctuation
 *  aside. A NAME match only (homonyms, research doc 3.7): it finds a record
 *  to show, never one to fetch for. */
export function wvPpNameMatch(aLast: string, aFirst: string, bLast: string, bFirst: string): "exact" | "initials" | null {
    if (!wvPpFold(aLast) || wvPpFold(aLast) !== wvPpFold(bLast)) return null;
    const fa = wvPpFold(aFirst), fb = wvPpFold(bFirst);
    if (fa === fb) return "exact";
    if (!fa || !fb) return null;
    const ia = initials(aFirst), ib = initials(bFirst);
    const n = Math.min(ia.length, ib.length);
    if (!n || ia.slice(0, n) !== ib.slice(0, n)) return null;
    // Initials agree; a full first name on both sides must agree too ("Alban"
    // is not "Albert"), as far as the shorter written word goes.
    const wa = fa.split(" "), wb = fb.split(" ");
    for (let i = 0; i < Math.min(wa.length, wb.length); i++) {
        if (wa[i].length > 1 && wb[i].length > 1 && wa[i] !== wb[i]) return null;
    }
    return "initials";
}

/** "First Last" (one string, as OpenAlex and theses.fr write names) split
 *  into last and first names: the last word is the last name, unless a
 *  particle stands before it ("Le Dizès", "van der Waals", "de Gennes"). */
export function wvPpSplitName(name: string): { last: string; first: string } {
    const s = String(name || "").replace(/\s+/g, " ").trim();
    const c = s.indexOf(",");
    if (c > 0) return { last: s.slice(0, c).trim(), first: s.slice(c + 1).trim() };
    const parts = s.split(" ");
    if (parts.length < 2) return { last: s, first: "" };
    let k = parts.length - 1;
    const particle = /^(le|la|de|du|des|van|von|der|den|da|di|del|della|dos|ten|ter|al|el|bin|ibn|st\.?)$/i;
    while (k > 1 && particle.test(parts[k - 1])) k--;
    return { last: parts.slice(k).join(" "), first: parts.slice(0, k).join(" ") };
}

/** A form of a name as it is compared: its last and first names folded, in
 *  either written order ("Sauret, A", "A. SAURET" and "A Sauret" are one
 *  form). "" for no name. */
export function wvPpFormKey(name: string): string {
    const n = wvPpSplitName(name);
    const l = wvPpFold(n.last);
    return l ? l + "|" + wvPpFold(n.first) : "";
}

/** The other forms of a researcher's name that count (people4): every
 *  "name.other" value not rejected, and the legacy variants not rejected --
 *  never the name itself, each form once (as first written). */
export function wvPpNameForms(rec: { last: string; first: string; variants?: string[]; lines?: WvPpLine[] }): string[] {
    const own = wvPpFold(rec.last) + "|" + wvPpFold(rec.first);
    const rejected = new Set(wvPpRejectedForms(rec).map(wvPpFormKey));
    const seen = new Set<string>([own]);
    const out: string[] = [];
    const take = (v: string) => {
        const k = wvPpFormKey(v);
        if (!k || seen.has(k) || rejected.has(k)) return;
        seen.add(k);
        out.push(String(v).replace(/\s+/g, " ").trim());
    };
    for (const l of rec.lines || []) if (l.fact === WV_PP_NAME_FACT && l.status !== "rejected") take(l.value);
    for (const v of rec.variants || []) take(v);
    return out;
}

/** The forms of the name the user rejected: never theirs when matching. */
export function wvPpRejectedForms(rec: { lines?: WvPpLine[] }): string[] {
    const out: string[] = [];
    for (const l of rec.lines || []) {
        if (l.fact !== WV_PP_NAME_FACT || l.status !== "rejected") continue;
        // A value with a line still standing (another source) is not rejected.
        if ((rec.lines || []).some((x) => x.fact === WV_PP_NAME_FACT && x.status !== "rejected" && wvPpSame(WV_PP_NAME_FACT, x.value, l.value))) continue;
        if (!out.some((v) => wvPpSame(WV_PP_NAME_FACT, v, l.value))) out.push(l.value);
    }
    return out;
}

/** The forms in `names` as "name.other" lines of `source` (a source's record
 *  `url`), each form once, empty ones left out. */
export function wvPpFormLines(names: any[], source: WvPpSource, url?: string): WvPpLine[] {
    const out: WvPpLine[] = [];
    for (const n of names || []) {
        const v = String(n == null ? "" : n).replace(/\s+/g, " ").trim();
        if (!v || !wvPpFormKey(v) || out.some((l) => wvPpSame(WV_PP_NAME_FACT, l.value, v))) continue;
        const l: WvPpLine = { fact: WV_PP_NAME_FACT, value: v, source, status: WV_PP_SOURCES[source].auto };
        if (url) l.url = url;
        out.push(l);
    }
    return out;
}

/** The record's name replaced by `last` and `first` (people4, MJT
 *  2026-11-24: "I should be able to edit the name"; the old name is replaced,
 *  not kept as a form). `by` "me": the user typed it -- marked theirs, and no
 *  other `by` ever changes it again. "empty": a name without a last name,
 *  refused; "same": nothing to change; "kept": the user's name, left as it is. */
export function wvPpRename(rec: WvPpRecord, last: string, first: string, by: WvPpSource): "ok" | "empty" | "same" | "kept" {
    const l = String(last || "").replace(/\s+/g, " ").trim();
    const f = String(first || "").replace(/\s+/g, " ").trim();
    if (!l) return "empty";
    if (by !== "me" && rec.nameBy === "me") return "kept";
    // The name confirmed as it was (Enter without a change): nothing changes.
    if (l === rec.last && f === rec.first) return "same";
    rec.last = l;
    rec.first = f;
    if (by === "me") rec.nameBy = "me";
    return "ok";
}

/** The person's name as people read it: "Alban Sauret". */
export function wvPpDisplayName(rec: { last: string; first: string }): string {
    return [rec.first, rec.last].filter((x) => x && String(x).trim()).join(" ").trim();
}

/** How a place of the Researchers tab writes a name (people3, MJT 2026-11-24:
 *  "LastName, FirstName", so that the order of the list shows). */
export type WvPpNameOrder = "last" | "first";

/** A name in `order`: "Sauret, Alban" or "Alban Sauret"; a name without a
 *  first name is its last name alone (no comma left hanging). */
export function wvPpNameAs(n: { last: string; first: string }, order: WvPpNameOrder): string {
    const last = String((n && n.last) || "").replace(/\s+/g, " ").trim();
    const first = String((n && n.first) || "").replace(/\s+/g, " ").trim();
    if (!first) return last;
    if (!last) return first;
    return order === "first" ? first + " " + last : last + ", " + first;
}

/** A name a source wrote in one string ("Michael Le Bars", a link's value)
 *  in `order` -- split as wvPpSplitName splits it. */
export function wvPpNameTextAs(name: string, order: WvPpNameOrder): string {
    const s = String(name || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return wvPpNameAs(wvPpSplitName(s), order);
}

// ---- countries ---------------------------------------------------------------

const displayNames = new Map<string, any>();
function regionNames(locale: string): any {
    const k = locale || "en-US";
    if (!displayNames.has(k)) {
        let dn: any = null;
        try { dn = new (Intl as any).DisplayNames([k, "en-US"], { type: "region", fallback: "code" }); } catch (e) { dn = null; }
        displayNames.set(k, dn);
    }
    return displayNames.get(k);
}

/** A country code ("FR") by its name in `locale` ("France"); the code itself
 *  when the platform knows no name for it. */
export function wvPpCountryName(code: string, locale?: string): string {
    const c = String(code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return String(code || "").trim();
    try { const dn = regionNames(locale || "en-US"); const n = dn ? dn.of(c) : ""; return n && n !== c ? String(n) : c; } catch (e) { return c; }
}

/** What a hand or a source wrote as a country ("fr", "France", "Frankreich"
 *  in `locale`) as its code; "" when it is none the platform names. */
export function wvPpCountryCode(text: string, locale?: string): string {
    const s = String(text || "").trim();
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
    const want = wvPpFold(s);
    if (!want) return "";
    const tries = [locale || "en-US", "en-US"];
    // A deprecated code names its successor's country (ICU: "DD" is Germany,
    // measured 2026-11-24, "Allemagne" came back as DD): only a code that is its
    // own canonical form counts.
    const canonical = (c: string) => { try { return String((Intl as any).getCanonicalLocales("und-" + c)[0] || "").split("-").pop() === c; } catch (e) { return true; } };
    for (const loc of tries) {
        const dn = regionNames(loc);
        if (!dn) continue;
        for (let a = 65; a <= 90; a++) {
            for (let b = 65; b <= 90; b++) {
                const c = String.fromCharCode(a, b);
                let n = "";
                try { n = String(dn.of(c) || ""); } catch (e) { n = ""; }
                if (n && n !== c && wvPpFold(n) === want && canonical(c)) return c;
            }
        }
    }
    return "";
}

/** Local date, YYYY-MM-DD. */
export function wvPpToday(d?: Date): string {
    const t = d || new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
}

/** A fresh record. `id` comes from the caller (a clock and a counter). */
export function wvPpNewRecord(id: string, last: string, first: string, now?: Date): WvPpRecord {
    const iso = (now || new Date()).toISOString();
    return { id, last: String(last || "").trim(), first: String(first || "").trim(), variants: [], lines: [],
        followed: false, check: true, notes: "", created: iso, modified: iso };
}

/** A record read from people.json, its fields made whole (an older or hand-
 *  edited file: missing lists, a wrong type). Null when it is not one. */
export function wvPpNormalizeRecord(r: any): WvPpRecord | null {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) return null;
    const str = (v: any) => (typeof v === "string" ? v : "");
    const lines: WvPpLine[] = [];
    for (const l of Array.isArray(r.lines) ? r.lines : []) {
        if (!l || typeof l !== "object" || !wvPpFact(str(l.fact)) || !str(l.value)) continue;
        const src = str(l.source) as WvPpSource;
        if (!WV_PP_SOURCES[src]) continue;
        const st = STATUS_ORDER.includes(l.status) ? l.status as WvPpStatus : WV_PP_SOURCES[src].auto;
        const line: WvPpLine = { fact: l.fact, value: l.value, source: src, status: st };
        if (str(l.years)) line.years = l.years;
        if (str(l.url)) line.url = l.url;
        if (str(l.date)) line.date = l.date;
        if (l.isNew === true) line.isNew = true;
        const ev = wvPpEvidenceNorm(l.ev);
        if (ev) line.ev = ev;
        if (l.ref && typeof l.ref === "object") {
            const ref: WvPpRef = {};
            for (const k of WV_PP_ID_KEYS) { const v = wvPpNormId(k, str(l.ref[k])); if (v) ref[k] = v; }
            if (Object.keys(ref).length) line.ref = ref;
        }
        lines.push(line);
    }
    // The legacy variants (people2/3: OpenAlex's names, written at a Refresh)
    // become OpenAlex's forms of the name, rejectable as any other; a form a
    // line already holds, or the name itself, is not added twice.
    const own = wvPpFold(str(r.last)) + "|" + wvPpFold(str(r.first));
    for (const v of Array.isArray(r.variants) ? r.variants : []) {
        if (typeof v !== "string" || !v.trim()) continue;
        const k = wvPpFormKey(v);
        if (!k || k === own || lines.some((l) => l.fact === WV_PP_NAME_FACT && wvPpFormKey(l.value) === k)) continue;
        lines.push({ fact: WV_PP_NAME_FACT, value: v.replace(/\s+/g, " ").trim(), source: "openalex", status: "suggested" });
    }
    const out: WvPpRecord = {
        id: r.id, last: str(r.last), first: str(r.first),
        variants: [],
        lines, followed: r.followed === true, check: r.check === true, notes: str(r.notes),
        created: str(r.created), modified: str(r.modified),
    };
    if (r.nameBy === "me") out.nameBy = "me";
    const events = (Array.isArray(r.events) ? r.events : []).map(wvPpEventNorm).filter(Boolean) as WvPpEvent[];
    if (events.length) out.events = events;
    const contact = (Array.isArray(r.contact) ? r.contact : []).map(wvPpContactNorm).filter(Boolean) as WvPpContact[];
    if (contact.length) out.contact = contact;
    const custom = (Array.isArray(r.custom) ? r.custom : []).map(wvPpCustomNorm).filter(Boolean) as WvPpCustom[];
    if (custom.length) out.custom = custom;
    if (/^[\w-]{12}$/.test(str(r.scholar))) out.scholar = r.scholar;
    const notSame = (Array.isArray(r.notSame) ? r.notSame : []).filter((x: any) => typeof x === "string" && x);
    if (notSame.length) out.notSame = notSame;
    // Tags as lib/people-tags.ts wvPpTagClean makes them: trimmed, NFC, each once.
    const tags: string[] = [];
    for (const t of Array.isArray(r.tags) ? r.tags : []) {
        const c = typeof t === "string" ? t.replace(/\s+/g, " ").trim().normalize() : "";
        if (c && !tags.includes(c)) tags.push(c);
    }
    if (tags.length) out.tags = tags;
    if (/^\d+$/.test(str(r.aft))) out.aft = r.aft;
    if (r.from && typeof r.from === "object" && str(r.from.key)) {
        out.from = { lib: typeof r.from.lib === "number" ? r.from.lib : null, key: r.from.key, title: str(r.from.title) };
        if (str(r.from.doi)) out.from.doi = r.from.doi;
    }
    return out;
}

// ---- the rules --------------------------------------------------------------

/** After any change: a one-value fact with a chosen value has its other
 *  values (not rejected) as alternatives; one without a choice has none --
 *  an alternative goes back to its source's own status. */
export function wvPpNormalize(rec: WvPpRecord): void {
    for (const d of WV_PP_FACTS) {
        if (d.multi) continue;
        const ls = rec.lines.filter((l) => l.fact === d.key);
        const chosen = ls.find((l) => l.status === "chosen");
        for (const l of ls) {
            if (l.status === "rejected" || l.status === "chosen") continue;
            if (chosen && !wvPpSame(d.key, l.value, chosen.value)) l.status = "alternative";
            else if (l.status === "alternative") l.status = WV_PP_SOURCES[l.source].auto;
        }
    }
}

export interface WvPpShown {
    value: string;
    years?: string;
    /** Why the tab shows it: the user's choice, a source confirmed on its
     *  own, or a suggestion. */
    why: WvPpWhy;
    /** The source that decided it. */
    source: WvPpSource;
    url?: string;
    ref?: WvPpRef;
    /** The sources (other than "me") that give this value: 2 or more agree. */
    sources: WvPpSource[];
    /** Distinct values of the fact still standing (not rejected). */
    values: number;
    /** The user chose one of them. */
    chosen: boolean;
    /** A value of the fact arrived after the others (a later conflict). */
    isNew: boolean;
    /** The fact is marked: several values and no choice, or a value that
     *  came after the others. */
    conflict: boolean;
}

/** What the tab shows for `fact`: one value for a one-value fact, every
 *  standing value for a multi-value one -- the user's choice first, then a
 *  value confirmed by its source, then a suggestion, sources by the fact's
 *  preference. */
export function wvPpShown(rec: WvPpRecord, fact: string): WvPpShown[] {
    const d = wvPpFact(fact);
    if (!d) return [];
    const ls = rec.lines.filter((l) => l.fact === fact && l.status !== "rejected");
    if (!ls.length) return [];
    const groups = wvPpGroups(rec, fact).filter((g) => g.some((l) => l.status !== "rejected"));
    const rank = (l: WvPpLine) => {
        const s = l.status === "chosen" ? 0 : l.status === "confirmed" ? 1 : l.status === "suggested" ? 2 : 3;
        return s * 100 + Math.max(0, d.prefer.indexOf(l.source));
    };
    const anyNew = ls.some((l) => l.isNew);
    const chosen = ls.some((l) => l.status === "chosen");
    const conflict = (!d.multi && groups.length > 1 && !chosen) || anyNew;
    const entries = groups.map((g0) => {
        const g = g0.filter((l) => l.status !== "rejected");
        const b = g.slice().sort((a, x) => rank(a) - rank(x))[0];
        const why: WvPpWhy = b.status === "chosen" ? "chosen" : b.status === "confirmed" ? "confirmed" : "suggested";
        const sources: WvPpSource[] = [];
        for (const l of g) if (l.source !== "me" && !sources.includes(l.source)) sources.push(l.source);
        const out: WvPpShown = { value: b.value, why, source: b.source, sources, values: groups.length, chosen, isNew: anyNew, conflict };
        // A link's ids: every source's, merged (theses.fr gives the IdRef,
        // Wikidata the ORCID of the same advisor).
        const ref: WvPpRef = {};
        for (const l of g) for (const k of WV_PP_ID_KEYS) if (l.ref && l.ref[k] && !ref[k]) ref[k] = l.ref[k];
        if (Object.keys(ref).length) out.ref = ref;
        const yl = g.find((l) => l.years);
        if (b.years) out.years = b.years; else if (yl) out.years = yl.years;
        if (b.url) out.url = b.url;
        return { out, r: rank(b), alt: g.every((l) => l.status === "alternative") };
    }).filter((e) => !e.alt).sort((a, b) => a.r - b.r);
    if (!entries.length) return [];
    return d.multi ? entries.map((e) => e.out) : [entries[0].out];
}

/** Every line of `fact`, grouped by value (the same value from several
 *  sources is one group), rejected values included. */
export function wvPpGroups(rec: WvPpRecord, fact: string): WvPpLine[][] {
    const groups: WvPpLine[][] = [];
    for (const l of rec.lines) {
        if (l.fact !== fact) continue;
        const g = groups.find((x) => sameLine(fact, x[0], l.value, l.ref));
        if (g) g.push(l); else groups.push([l]);
    }
    return groups;
}

/** The fetched lines `incoming` (fact, value, source, url, years, ref; their
 *  status is decided here) merged into `rec` on date `date`: a value already
 *  there from the same source keeps its status (a Refresh never undoes what
 *  the user kept or rejected) and takes the new date, link, years and ids; a
 *  value rejected before stays rejected; a new value of a one-value fact the
 *  user has kept another for comes in as an alternative, marked new; a new
 *  value of a fact that had others is marked new. Returns the count of new
 *  lines. */
export function wvPpMerge(rec: WvPpRecord, incoming: WvPpLine[], date: string): number {
    let added = 0;
    // "New" is against what the record held BEFORE this fetch: values that
    // come in together are never new to each other.
    const before = rec.lines.slice();
    for (const inc of incoming) {
        const d = wvPpFact(inc.fact);
        if (!d || !inc.value) continue;
        const same = rec.lines.find((l) => l.fact === inc.fact && l.source === inc.source && sameLine(inc.fact, l, inc.value, inc.ref));
        if (same) {
            same.date = date;
            if (inc.url) same.url = inc.url;
            if (inc.years) same.years = inc.years;
            if (inc.ref) same.ref = Object.assign({}, same.ref || {}, inc.ref);
            continue;
        }
        const ofFact = before.filter((l) => l.fact === inc.fact);
        const line: WvPpLine = { fact: inc.fact, value: inc.value, source: inc.source, status: WV_PP_SOURCES[inc.source].auto, date };
        if (inc.url) line.url = inc.url;
        if (inc.years) line.years = inc.years;
        if (inc.ref && Object.keys(inc.ref).length) line.ref = Object.assign({}, inc.ref);
        if (ofFact.some((l) => l.status === "rejected" && sameLine(inc.fact, l, inc.value, inc.ref))) line.status = "rejected";
        else {
            const chosen = ofFact.find((l) => l.status === "chosen");
            const known = ofFact.some((l) => l.status !== "rejected" && sameLine(inc.fact, l, inc.value, inc.ref));
            if (!d.multi && chosen && !sameLine(inc.fact, chosen, inc.value, inc.ref)) { line.status = "alternative"; line.isNew = true; }
            else if (ofFact.length && !known && !d.forms) line.isNew = true;
        }
        rec.lines.push(line);
        added++;
    }
    wvPpNormalize(rec);
    return added;
}

/** The user's word on `value` of `fact`: "keep" (it becomes the value shown;
 *  for a one-value fact the others become alternatives, never deleted),
 *  "reject" (never shown nor suggested again), "restore" (a rejected value
 *  back to its source's status). Any of them settles the fact: its "new"
 *  marks go. */
export function wvPpAct(rec: WvPpRecord, fact: string, value: string, action: "keep" | "reject" | "restore", ref?: WvPpRef): boolean {
    const d = wvPpFact(fact);
    if (!d) return false;
    const hit = rec.lines.filter((l) => l.fact === fact && sameLine(fact, l, value, ref));
    if (!hit.length) return false;
    for (const l of rec.lines) if (l.fact === fact) delete l.isNew;
    if (action === "keep") {
        if (!d.multi) {
            for (const l of rec.lines) {
                if (l.fact === fact && l.status === "chosen" && !sameLine(fact, l, value, ref)) l.status = "alternative";
            }
        }
        for (const l of hit) l.status = "chosen";
    }
    else if (action === "reject") {
        for (const l of hit) l.status = "rejected";
    }
    else {
        for (const l of hit) if (l.status === "rejected") l.status = WV_PP_SOURCES[l.source].auto;
    }
    wvPpNormalize(rec);
    return true;
}

/** The user's own value for `fact` (source "me", kept): Edit, or a link
 *  added by hand. A one-value fact's other values become alternatives; the
 *  same value typed again changes nothing. `replace`: the value being edited
 *  (a multi-value fact's value replaced: the old one is rejected, never
 *  deleted). */
export function wvPpEdit(rec: WvPpRecord, fact: string, value: string, date: string, opts?: { years?: string; ref?: WvPpRef; replace?: string; replaceRef?: WvPpRef }): boolean {
    const d = wvPpFact(fact);
    let v = String(value || "").replace(/\s+/g, " ").trim();
    if (!d) return false;
    if (d.id) v = wvPpNormId(fact, v);
    if (!v) return false;
    const o = opts || {};
    for (const l of rec.lines) if (l.fact === fact) delete l.isNew;
    if (o.replace != null && d.multi && !wvPpSame(fact, o.replace, v, o.replaceRef, o.ref)) {
        for (const l of rec.lines) if (l.fact === fact && sameLine(fact, l, o.replace, o.replaceRef)) l.status = "rejected";
    }
    const mine = rec.lines.find((l) => l.fact === fact && l.source === "me" && sameLine(fact, l, v, o.ref));
    if (mine) { mine.status = "chosen"; if (o.years) mine.years = o.years; }
    else {
        const line: WvPpLine = { fact, value: v, source: "me", status: "chosen", date };
        if (o.years) line.years = o.years;
        if (o.ref && Object.keys(o.ref).length) line.ref = Object.assign({}, o.ref);
        rec.lines.push(line);
    }
    if (!d.multi) {
        for (const l of rec.lines) if (l.fact === fact && l.status === "chosen" && !sameLine(fact, l, v, o.ref)) l.status = "alternative";
    }
    // The same value from a source is kept with it.
    for (const l of rec.lines) if (l.fact === fact && l.status !== "rejected" && sameLine(fact, l, v, o.ref)) l.status = "chosen";
    wvPpNormalize(rec);
    return true;
}

/** The ids the fetches go by: every value not rejected nor an alternative (a
 *  suggested id counts: it came from an id or the user's pick, never from a
 *  name alone). */
export function wvPpIds(rec: WvPpRecord, fact: string): string[] {
    const out: string[] = [];
    for (const l of rec.lines) {
        if (l.fact !== fact || l.status === "rejected" || l.status === "alternative") continue;
        if (!out.some((x) => wvPpSame(fact, x, l.value))) out.push(l.value);
    }
    return out;
}

/** A record's ids, one of each kind (the shown one; OpenAlex: every one). */
export function wvPpRefOf(rec: WvPpRecord): WvPpRef & { openalexAll: string[] } {
    const out: any = { openalexAll: wvPpIds(rec, "openalex") };
    for (const k of WV_PP_ID_KEYS) { const s = wvPpShown(rec, k)[0]; if (s) out[k] = s.value; }
    return out;
}

/** `rec` is the researcher `ref` names: an id in common (any OpenAlex
 *  profile of the record counts). */
export function wvPpRecordIs(rec: WvPpRecord, ref: WvPpRef | undefined): boolean {
    if (!ref) return false;
    for (const k of WV_PP_ID_KEYS) {
        const v = ref[k];
        if (!v) continue;
        if (wvPpIds(rec, k).some((x) => x.toUpperCase() === String(v).toUpperCase())) return true;
    }
    return false;
}
