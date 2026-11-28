// People: what the public sources answer, read into record lines
// (lib/people-record.ts). Pure: the requests are made by modules/people.ts, on
// the user's click only (Add, Refresh, Build), with no key, no account and
// nothing of the user's -- the researcher's name or id alone (never an
// OpenAlex `mailto`: the polite pool would carry the user's address). The
// shapes read here were recorded from the live APIs on 2026-11-22 (the
// fixtures of test/people.spec.js, a public researcher of the research doc):
//   OpenAlex   api.openalex.org/authors/<A…>, /authors?search=, /works/doi:<doi>,
//              /works?filter=author.id:   (CC0; keyless calls allowed,
//              help.openalex.org/api/authentication)
//   ORCID      pub.orcid.org/v3.0/<id>/record, Accept: application/json
//              (anonymous public API; no supervisor field exists)
//   theses.fr  theses.fr/api/v1/personnes/recherche/?q=, /personnes/personne/<PPN>
//              (the person's own thesis and the theses they supervised)
//   IdRef      www.idref.fr/services/idref2id/<PPN>&format=text/json (the
//              ORCID, Wikidata… ids of a theses.fr person)
//   Wikidata   SPARQL: query.wikidata.org, or the QLever mirror (qlever.dev,
//              recorded 2026-11-22) when the first refuses -- doctoral advisor
//              P184, doctoral student P185, ORCID P496, IdRef P269, OpenAlex
//              P10283 (CC0; research doc 2: WDQS rate-limited this month)

import { WvPpLine, WvPpRef, wvPpFormLines, wvPpNameMatch, wvPpNormId, wvPpSplitName } from "./people-record";
import { wvFdIsAlertsDoc } from "./feed-score";

// The forms of a researcher's name each source gives (people4, the Other
// names row; payloads recorded 2026-11-24, test/people-names.spec.js):
//   ORCID     person.name["given-names"].value + ["family-name"].value, the
//             credit name person.name["credit-name"].value ("The full name of
//             the researcher as they prefer it to appear", personal-details-
//             3.0.xsd), and person["other-names"]["other-name"][].content
//             ("Other name(s) that the researcher is or was known by",
//             other-name-3.0.xsd) -- ORCID's "Also known as".
//   OpenAlex  display_name and display_name_alternatives ("Other name strings
//             seen for this author", help.openalex.org author object).
//   Wikidata  the item's aliases, skos:altLabel in every language, and its
//             label in English or "mul" (rdfs:label; WDQS stores labels as
//             rdfs:label only -- mediawiki.org Wikibase/Indexing/RDF Dump Format).

const enc = encodeURIComponent;

/** The requests, one place (the specs' stub matches on these). */
export const WV_PP_API = {
    /** `id`: an OpenAlex author id, or "orcid:<ORCID>" (OpenAlex looks a
     *  profile up by its ORCID; checked live 2026-11-22). */
    openalexAuthor: (id: string) => "https://api.openalex.org/authors/" + id
        + "?select=id,display_name,display_name_alternatives,orcid,works_count,last_known_institutions,affiliations,cited_by_count,summary_stats",
    openalexSearch: (name: string) => "https://api.openalex.org/authors?search=" + enc(name)
        + "&per_page=8&select=id,display_name,orcid,works_count,last_known_institutions",
    openalexWork: (doi: string) => "https://api.openalex.org/works/doi:" + doi + "?select=id,doi,authorships",
    /** A person's works, newest first, 200 a page (`page` from 1). */
    openalexWorks: (ids: string[], page?: number) => "https://api.openalex.org/works?filter=author.id:" + ids.join("|")
        + "&per_page=200" + (page && page > 1 ? "&page=" + page : "")
        + "&select=id,doi,display_name,publication_year,primary_location,authorships,type,biblio,cited_by_count&sort=publication_year:desc",
    orcidRecord: (orcid: string) => "https://pub.orcid.org/v3.0/" + orcid + "/record",
    thesesSearch: (name: string) => "https://theses.fr/api/v1/personnes/recherche/?q=" + enc(name) + "&debut=0&nombre=10",
    thesesPerson: (ppn: string) => "https://theses.fr/api/v1/personnes/personne/" + ppn,
    idref2id: (ppn: string) => "https://www.idref.fr/services/idref2id/" + ppn + "&format=text/json",
    /** Semantic Scholar, on a click only (citation counts, step 2): a paper's
     *  authors by its DOI, then the author's figures. Keyless public pool. */
    s2Paper: (doi: string) => "https://api.semanticscholar.org/graph/v1/paper/DOI:" + enc(doi) + "?fields=authors",
    s2Author: (id: string) => "https://api.semanticscholar.org/graph/v1/author/" + enc(id) + "?fields=name,url,hIndex,citationCount,paperCount",
    /** A Google Scholar public profile's first page (MJT 2026-11-25: "Yes, add the
     *  Google Scholar page"): robots.txt allows /citations?user= -- that page
     *  only, never /scholar or a cstart page. Read on a click, as HTML. */
    scholarProfile: (user: string) => "https://scholar.google.com/citations?user=" + enc(user) + "&hl=en",
    wikidata: (query: string) => "https://query.wikidata.org/sparql?format=json&query=" + enc(query),
    wikidataMirror: (query: string) => "https://qlever.dev/api/wikidata?query=" + enc(query),
};

/** The web page of a record (what a source name links to). */
export const WV_PP_WEB = {
    openalex: (id: string) => "https://openalex.org/" + id,
    orcid: (orcid: string) => "https://orcid.org/" + orcid,
    thesesfr: (ppn: string) => "https://theses.fr/" + ppn,
    idref: (ppn: string) => "https://www.idref.fr/" + ppn,
    wikidata: (q: string) => "https://www.wikidata.org/wiki/" + q,
};

const tail = (u: any) => String(u || "").replace(/\/+$/, "").split("/").pop() || "";

/** Years as the tab writes them: "2018–2026", "2025–", "2013". */
export function wvPpYears(from: number | null, to: number | null, open?: boolean): string {
    if (from && open) return from + "–";
    if (from && to && from !== to) return from + "–" + to;
    if (from || to) return String(from || to);
    return "";
}

// ---- OpenAlex -----------------------------------------------------------------

export interface WvPpCandidate {
    id: string;
    name: string;
    orcid: string;
    works: number;
    institutions: string[];
}

/** The profiles an author search returned (homonyms, split profiles): for the
 *  user to pick, never taken on the name. */
export function wvPpCandidates(json: any): WvPpCandidate[] {
    const out: WvPpCandidate[] = [];
    for (const r of (json && json.results) || []) {
        const id = wvPpNormId("openalex", tail(r && r.id));
        if (!id) continue;
        out.push({
            id,
            name: String(r.display_name || ""),
            orcid: wvPpNormId("orcid", tail(r.orcid)),
            works: Number(r.works_count) || 0,
            institutions: ((r.last_known_institutions || []) as any[]).map((i) => String(i && i.display_name || "")).filter(Boolean),
        });
    }
    return out;
}

/** The author of the work `json` (an OpenAlex work with its authorships)
 *  whose name fits the person: the profile that wrote THIS paper -- an id
 *  reached through the paper, not a name search. Null unless exactly one
 *  author fits. */
export function wvPpAuthorOfWork(json: any, last: string, first: string): { id: string; orcid: string; work: string } | null {
    const fits: any[] = [];
    for (const a of (json && json.authorships) || []) {
        const au = a && a.author;
        const name = String((au && au.display_name) || a.raw_author_name || "");
        const parts = name.trim().split(/\s+/);
        // OpenAlex writes "First Last": try every split, last words as the last name.
        let ok = false;
        for (let k = 1; k < parts.length && !ok; k++) {
            if (wvPpNameMatch(parts.slice(k).join(" "), parts.slice(0, k).join(" "), last, first)) ok = true;
        }
        if (ok && au && au.id) fits.push(au);
    }
    if (fits.length !== 1) return null;
    return { id: wvPpNormId("openalex", tail(fits[0].id)), orcid: wvPpNormId("orcid", tail(fits[0].orcid)), work: tail(json.id) };
}

/** The Semantic Scholar id of the one author of a paper (`s2Paper`'s answer)
 *  whose name fits the researcher's; "" when none or several fit. */
export function wvPpS2AuthorOf(json: any, last: string, first: string): string {
    const fits: string[] = [];
    for (const a of (json && json.authors) || []) {
        const parts = String((a && a.name) || "").trim().split(/\s+/);
        let ok = false;
        for (let k = 1; k < parts.length && !ok; k++) {
            if (wvPpNameMatch(parts.slice(k).join(" "), parts.slice(0, k).join(" "), last, first)) ok = true;
        }
        if (ok && a.authorId && !fits.includes(String(a.authorId))) fits.push(String(a.authorId));
    }
    return fits.length === 1 ? fits[0] : "";
}

/** A researcher's Semantic Scholar figures, as the cache keeps them (`date`:
 *  the day they were read); null when the answer has none. */
export interface WvPpS2 { id: string; name: string; url: string; h: number; cites: number; papers: number; date: string }

export function wvPpS2Figures(json: any, date: string): WvPpS2 | null {
    const n = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    if (!json || !json.authorId || !Number.isFinite(n(json.hIndex)) || !Number.isFinite(n(json.citationCount))) return null;
    const url = /^https:\/\/www\.semanticscholar\.org\//.test(String(json.url || "")) ? String(json.url) : "https://www.semanticscholar.org/author/" + encodeURIComponent(String(json.authorId));
    return { id: String(json.authorId), name: String(json.name || ""), url, h: n(json.hIndex), cites: n(json.citationCount), papers: Number.isFinite(n(json.paperCount)) ? n(json.paperCount) : 0, date };
}

/** A Google Scholar profile's user id, from its address as pasted
 *  (scholar.google.<any>/citations?user=XXXXXXXXXXXX...) or the bare id; "" when
 *  it is neither. */
export function wvPpScholarId(text: string): string {
    const s = String(text || "").trim();
    if (/^[\w-]{12}$/.test(s)) return s;
    const m = /^(?:https?:\/\/)?scholar\.google\.[a-z.]{2,8}\/citations\?(?:[^#\s]*&)?user=([\w-]{12})(?:[&#]|$)/i.exec(s);
    return m ? m[1] : "";
}

/** A researcher's Google Scholar figures, as the cache keeps them. */
export interface WvPpScholar { user: string; h: number; i10: number; cites: number; date: string }

/** The figures of a profile page: its table of Citations, h-index and i10-index
 *  ("All" column, the first of each row's two `gsc_rsb_std` cells). Null when the
 *  page has no such table (a refusal, a CAPTCHA, a page changed). */
export function wvPpScholarFigures(html: string, user: string, date: string): WvPpScholar | null {
    const t = String(html || "");
    const at = t.indexOf("gsc_rsb_st");
    if (at < 0) return null;
    const cells: number[] = [];
    const re = /<td[^>]*class="[^"]*\bgsc_rsb_std\b[^"]*"[^>]*>\s*([\d,.\s ]*)\s*<\/td>/g;
    re.lastIndex = at;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) && cells.length < 6) cells.push(Number(m[1].replace(/[^\d]/g, "")));
    if (cells.length < 6 || cells.some((n) => !Number.isFinite(n))) return null;
    return { user, cites: cells[0], h: cells[2], i10: cells[4], date };
}

/** An ISO 3166-1 alpha-2 code as a source wrote it, upper case; "" when it is
 *  none. */
export function wvPpCountryOf(v: any): string {
    const s = String(v == null ? "" : v).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(s) ? s : "";
}

/** An OpenAlex author profile's lines: its id, its ORCID, its current
 *  institutions (last_known_institutions, with the years its works list for
 *  each) and their countries (each institution's `country_code`, people3).
 *  All suggested (OpenAlex is not one of the confirmed sources). Also the
 *  names it knows the person by. */
export function wvPpFromOpenAlexAuthor(json: any): { lines: WvPpLine[]; names: string[] } {
    const id = wvPpNormId("openalex", tail(json && json.id));
    if (!id) return { lines: [], names: [] };
    const url = WV_PP_WEB.openalex(id);
    const out: WvPpLine[] = [{ fact: "openalex", value: id, source: "openalex", url, status: "suggested" }];
    const orcid = wvPpNormId("orcid", tail(json.orcid));
    if (orcid) out.push({ fact: "orcid", value: orcid, source: "openalex", url, status: "suggested" });
    const years = new Map<string, number[]>();
    for (const a of json.affiliations || []) {
        const iid = tail(a && a.institution && a.institution.id);
        if (iid) years.set(iid, ((a.years || []) as any[]).map(Number).filter((n) => n > 0));
    }
    for (const i of json.last_known_institutions || []) {
        const name = String(i && i.display_name || "").trim();
        if (!name) continue;
        const ys = years.get(tail(i.id)) || [];
        const line: WvPpLine = { fact: "institution", value: name, source: "openalex", url, status: "suggested" };
        const y = ys.length ? wvPpYears(Math.min(...ys), Math.max(...ys)) : "";
        if (y) line.years = y;
        out.push(line);
    }
    for (const i of json.last_known_institutions || []) {
        const c = wvPpCountryOf(i && i.country_code);
        if (c && !out.some((l) => l.fact === "country" && l.value === c)) out.push({ fact: "country", value: c, source: "openalex", url, status: "suggested" });
    }
    const names: string[] = [];
    for (const n of [json.display_name, ...((json.display_name_alternatives || []) as any[])]) {
        const s = String(n || "").replace(/\s+/g, " ").trim();
        if (s && !names.includes(s)) names.push(s);
    }
    // The same names as forms of the name (people4): one line per form.
    out.push(...wvPpFormLines(names, "openalex", url));
    return { lines: out, names };
}

/** One work of a person, as the People tab lists it (the cache keeps these). */
export interface WvPpWork {
    id: string;
    doi: string;
    title: string;
    year: number | null;
    venue: string;
    /** The first authors' names, and how many there are. */
    authors: string[];
    nAuthors: number;
    /** Zotero's item type for it (`wvPpWorkItemType`), for its icon and the
     *  Type filter; absent in a cache written before 2026-11-25. */
    type?: string;
    /** As a citation gives them (OpenAlex `biblio`): "1044", "5", "A13" or
     *  "125-140"; absent when the source has none. */
    volume?: string;
    issue?: string;
    pages?: string;
    /** Times cited, as OpenAlex counted at the Refresh (`cited_by_count`);
     *  absent in a cache written before 2026-11-26. */
    cited?: number;
}

/** A researcher's citation figures (MJT 2026-11-25, approved: citation counts
 *  and h-index, each with its source and date). `from`: "openalex" -- OpenAlex's
 *  own figures for the one profile (summary_stats, cited_by_count); "works" --
 *  computed from the works listed, when the researcher has several profiles
 *  (an h-index does not add up) or OpenAlex gave none. `works`: how many works
 *  the figures stand on (the computed ones only). */
export interface WvPpMetrics { h: number; i10: number; cites: number; from: "openalex" | "works"; profiles: number; works: number }

export function wvPpMetrics(authors: any[], works: WvPpWork[] | null): WvPpMetrics | null {
    const prof = (authors || []).filter((a) => a && typeof a === "object");
    const ss = prof.length === 1 ? prof[0].summary_stats : null;
    const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
    if (ss && Number.isFinite(num(ss.h_index)) && Number.isFinite(num(prof[0].cited_by_count))) {
        return { h: num(ss.h_index), i10: Number.isFinite(num(ss.i10_index)) ? num(ss.i10_index) : 0, cites: num(prof[0].cited_by_count), from: "openalex", profiles: 1, works: 0 };
    }
    // Once per work: a work listed under two profiles is one work.
    const seen = new Set<string>();
    const cs: number[] = [];
    for (const w of works || []) {
        if (!w || typeof w.cited !== "number" || seen.has(w.id)) continue;
        seen.add(w.id);
        cs.push(w.cited);
    }
    if (!cs.length) return null;
    cs.sort((a, b) => b - a);
    let h = 0;
    while (h < cs.length && cs[h] >= h + 1) h++;
    return { h, i10: cs.filter((n) => n >= 10).length, cites: cs.reduce((s, n) => s + n, 0), from: "works", profiles: prof.length, works: cs.length };
}

/** Zotero's item type for an OpenAlex work: its `type`, and for an article
 *  where it appeared (`primary_location.source.type`). The values recorded
 *  live on 2026-11-25 (group_by=type for one author: article,
 *  conference-abstract, book-chapter, conference-paper, report, book,
 *  editorial, preprint, book-review, erratum, other, dataset, dissertation,
 *  letter, review; source types journal, conference, repository, ebook
 *  platform, book series). Anything else: Zotero's generic "document". */
export function wvPpWorkItemType(type: string, sourceType: string): string {
    const t = String(type || "").replace(/^https:\/\/openalex\.org\/types\//, "");
    const s = String(sourceType || "").replace(/^https:\/\/openalex\.org\/source-types\//, "").replace(/%20/g, " ");
    if (t === "article") return s === "conference" ? "conferencePaper" : s === "repository" ? "preprint" : "journalArticle";
    const map: Record<string, string> = {
        "preprint": "preprint", "conference-paper": "conferencePaper", "conference-abstract": "conferencePaper",
        "book-chapter": "bookSection", "book": "book", "report": "report", "dataset": "dataset", "dissertation": "thesis",
        "editorial": "journalArticle", "letter": "journalArticle", "review": "journalArticle", "book-review": "journalArticle",
        "erratum": "journalArticle",
    };
    return map[t] || "document";
}

/** The pages of a citation from OpenAlex `biblio`: one number when the two
 *  ends are the same (an article number, "105944"), else "first–last". */
function biblioPages(b: any): string {
    const f = String((b && b.first_page) || "").trim(), l = String((b && b.last_page) || "").trim();
    if (!f) return "";
    return l && l !== f ? f + "–" + l : f;
}

/** A work whose title is nothing but a DOI -- its own, or any: a publisher's
 *  supplementary file (AIP's "10.1063/5.0129427.8": Crossref holds them as
 *  datasets titled by their DOI, OpenAlex copies them as works). Never listed,
 *  never counted (MJT 2026-11-26: "Hide them entirely"). */
export function wvPpWorkIsDoiOnly(w: { title?: string; doi?: string } | null): boolean {
    const t = String((w && w.title) || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
    if (!t) return false;
    return /^10\.\d{4,9}\/\S+$/.test(t) || t === String((w && w.doi) || "").trim().toLowerCase();
}

/** How many of a works page's works are only a DOI (wvPpWorkIsDoiOnly): taken
 *  off OpenAlex's count. */
export function wvPpWorksHidden(json: any): number {
    let n = 0;
    for (const w of (json && json.results) || []) {
        if (tail(w && w.id) && wvPpWorkIsDoiOnly({ title: String((w && (w.display_name || w.title)) || ""), doi: String((w && w.doi) || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") })) n++;
    }
    return n;
}

/** A works page's works, newest first; a work titled by its DOI alone left out. */
export function wvPpWorks(json: any): WvPpWork[] {
    const out: WvPpWork[] = [];
    for (const w of (json && json.results) || []) {
        const id = tail(w && w.id);
        if (!id) continue;
        const title = String(w.display_name || w.title || "").replace(/\s+/g, " ").trim();
        const doi = String(w.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
        if (wvPpWorkIsDoiOnly({ title, doi })) continue;
        const au = ((w.authorships || []) as any[]).map((a) => String((a && a.author && a.author.display_name) || (a && a.raw_author_name) || "").trim()).filter(Boolean);
        out.push({
            id,
            doi,
            title,
            year: Number(w.publication_year) || null,
            venue: String((w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || "").trim(),
            authors: au.slice(0, 3),
            nAuthors: au.length,
            type: w.type ? wvPpWorkItemType(w.type, (w.primary_location && w.primary_location.source && w.primary_location.source.type) || "") : undefined,
            volume: String((w.biblio && w.biblio.volume) || "").trim() || undefined,
            issue: String((w.biblio && w.biblio.issue) || "").trim() || undefined,
            pages: biblioPages(w.biblio) || undefined,
            cited: typeof w.cited_by_count === "number" && Number.isFinite(w.cited_by_count) ? w.cited_by_count : undefined,
        });
    }
    return out;
}

/** How many works the list has in all (OpenAlex's count). */
export function wvPpWorksCount(json: any): number {
    return Number(json && json.meta && json.meta.count) || 0;
}

// ---- ORCID --------------------------------------------------------------------

const PHD_RE = /\b(ph\.?\s?d|d\.?\s?phil|doctor|doctorat|doctorate|doctoral|dr\.?\s?rer|th[eè]se)\b/i;

function affs(json: any, group: string, inner: string): any[] {
    const out: any[] = [];
    const g = json && json["activities-summary"] && json["activities-summary"][group];
    for (const grp of (g && g["affiliation-group"]) || []) {
        for (const s of grp.summaries || []) if (s && s[inner]) out.push(s[inner]);
    }
    return out;
}
const yearOf = (d: any) => { const v = d && d.year && d.year.value; return v ? Number(v) || null : null; };

/** A person's ORCID record's lines (confirmed: ORCID is a confirmed source):
 *  the CURRENT position(s) and institution(s) -- employments without an end
 *  -- and the country of each (its organization.address.country, people3);
 *  the PhD (an education or qualification whose role reads as a doctorate:
 *  its institution, its country, its end year), the web pages. */
export function wvPpFromOrcid(json: any, orcid: string): WvPpLine[] {
    const url = WV_PP_WEB.orcid(orcid);
    const out: WvPpLine[] = [{ fact: "orcid", value: orcid, source: "orcid", url, status: "confirmed" }];
    const add = (fact: string, value: any, years?: string) => {
        const v = String(value || "").trim();
        if (!v) return;
        // The same value twice in one record (two current employments in one
        // country) is one line.
        if (!years && out.some((l) => l.fact === fact && l.value === v && !l.years)) return;
        const l: WvPpLine = { fact, value: v, source: "orcid", url, status: "confirmed" };
        if (years) l.years = years;
        out.push(l);
    };
    const countryOf = (e: any) => wvPpCountryOf(e && e.organization && e.organization.address && e.organization.address.country);
    for (const e of affs(json, "employments", "employment-summary")) {
        if (e["end-date"]) continue;
        const y = wvPpYears(yearOf(e["start-date"]), null, true);
        if (e["role-title"]) add("position", e["role-title"], y);
        add("institution", e.organization && e.organization.name, y);
        add("country", countryOf(e));
    }
    const phd = [...affs(json, "educations", "education-summary"), ...affs(json, "qualifications", "qualification-summary")]
        .filter((e) => PHD_RE.test(String(e["role-title"] || "")));
    for (const e of phd) {
        add("phd.institution", e.organization && e.organization.name);
        add("phd.country", countryOf(e));
        const y = yearOf(e["end-date"]);
        if (y) add("phd.year", String(y));
    }
    const urls = (json && json.person && json.person["researcher-urls"] && json.person["researcher-urls"]["researcher-url"]) || [];
    for (const u of urls) add("web", u && u.url && u.url.value);
    // The forms of the name (people4): the record's name, its credit name, its
    // other names ("Also known as").
    const nm = (json && json.person && json.person.name) || {};
    const val = (x: any) => String((x && x.value) || "").trim();
    const forms: string[] = [[val(nm["given-names"]), val(nm["family-name"])].filter(Boolean).join(" "), val(nm["credit-name"])];
    const others = (json && json.person && json.person["other-names"] && json.person["other-names"]["other-name"]) || [];
    for (const o of Array.isArray(others) ? others : []) forms.push(String((o && o.content) || ""));
    for (const l of wvPpFormLines(forms, "orcid", url)) { l.status = "confirmed"; out.push(l); }
    return out;
}

// ---- theses.fr / IdRef ----------------------------------------------------------

/** theses.fr persons (with an IdRef record) whose name fits the person:
 *  candidates only -- one is taken when its IdRef record carries the
 *  person's ORCID (wvPpIdrefIds), never on the name. */
export function wvPpThesesCandidates(json: any, last: string, first: string): string[] {
    const out: string[] = [];
    for (const p of (json && json.personnes) || []) {
        if (!p || !p.has_idref || !/^\d{8}[\dX]$/i.test(String(p.id || ""))) continue;
        if (wvPpNameMatch(String(p.nom || ""), String(p.prenom || ""), last, first)) out.push(String(p.id).toUpperCase());
    }
    return out;
}

/** The ids IdRef holds for a person (ORCID, Wikidata). */
export function wvPpIdrefIds(json: any): { orcid: string; wikidata: string } {
    let orcid = "", wikidata = "";
    for (const q of (json && json.sudoc) || []) {
        const r = q && q.query && q.query.result;
        if (!r) continue;
        const src = String(r.source || "").toUpperCase();
        if (src === "ORCID" && !orcid) orcid = wvPpNormId("orcid", String(r.identifiant || ""));
        if (src === "WIKIDATA" && !wikidata) wikidata = wvPpNormId("wikidata", String(r.identifiant || ""));
    }
    return { orcid, wikidata };
}

const nameOf = (p: any) => [p && p.prenom, p && p.nom].filter(Boolean).map((x: any) => String(x).trim()).join(" ");
const ppnRef = (p: any): WvPpRef | undefined => {
    const id = p && p.has_idref !== false ? wvPpNormId("idref", String(p.id || "")) : "";
    return id ? { idref: id } : undefined;
};

/** A theses.fr person's lines (confirmed: theses.fr is a confirmed source):
 *  their IdRef id; from their own defended thesis the institution, its
 *  country -- France: theses.fr lists the theses defended in France (people3;
 *  its records carry no country field) --, the year, the title and each
 *  advisor (directeur) as a link; and each thesis they supervised, its author
 *  as a student (in progress: no year). */
export function wvPpFromThesesPerson(json: any, ppn: string, idref?: { orcid: string; wikidata: string }): WvPpLine[] {
    const url = WV_PP_WEB.thesesfr(ppn);
    const out: WvPpLine[] = [{ fact: "idref", value: ppn, source: "idref", url: WV_PP_WEB.idref(ppn), status: "confirmed" }];
    if (idref && idref.wikidata) out.push({ fact: "wikidata", value: idref.wikidata, source: "idref", url: WV_PP_WEB.idref(ppn), status: "confirmed" });
    if (idref && idref.orcid) out.push({ fact: "orcid", value: idref.orcid, source: "idref", url: WV_PP_WEB.idref(ppn), status: "confirmed" });
    const th = (json && json.theses) || {};
    const role = (re: RegExp) => Object.keys(th).filter((k) => re.test(k)).flatMap((k) => th[k] || []);
    const line = (fact: string, v: any, more?: Partial<WvPpLine>) => {
        const s = String(v || "").replace(/\s+/g, " ").trim();
        if (s) out.push(Object.assign({ fact, value: s, source: "thesesfr", url, status: "confirmed" } as WvPpLine, more || {}));
    };
    for (const t of role(/^auteur/i)) {
        if (!t || (t.status && !/soutenue/i.test(String(t.status)))) continue;
        line("phd.institution", t.etablissement_soutenance && t.etablissement_soutenance.nom);
        if (!out.some((l) => l.fact === "phd.country")) line("phd.country", "FR");
        const y = String(t.date_soutenance || "").slice(0, 4);
        if (/^\d{4}$/.test(y)) line("phd.year", y);
        line("phd.thesis", t.titre);
        for (const d of t.directeurs || []) line("link.advisor", nameOf(d), { ref: ppnRef(d), years: /^\d{4}$/.test(y) ? y : undefined });
    }
    for (const t of role(/^directeur/i)) {
        const y = String((t && t.date_soutenance) || "").slice(0, 4);
        for (const a of (t && t.auteurs) || []) line("link.student", nameOf(a), { ref: ppnRef(a), years: /^\d{4}$/.test(y) ? y : undefined });
    }
    // Lines without the optional parts they did not get.
    for (const l of out) { if (!l.ref) delete l.ref; if (!l.years) delete l.years; }
    return out;
}

// ---- Wikidata --------------------------------------------------------------------

/** The one query per Refresh (research doc 3.7: one batched query, cached):
 *  the person -- by their Wikidata item, else their ORCID iD -- with their
 *  IdRef and OpenAlex ids and their date of birth (P569, people3), and each
 *  doctoral advisor (P184) and doctoral student (P185) with their ids.
 *  Prefixes written out: the QLever mirror has none of its own. */
export function wvPpWikidataQuery(by: { qid?: string; orcid?: string }): string | null {
    const qid = wvPpNormId("wikidata", by.qid || ""), orcid = wvPpNormId("orcid", by.orcid || "");
    if (!qid && !orcid) return null;
    const who = qid ? "VALUES ?p { wd:" + qid + " }" : "?p wdt:P496 \"" + orcid + "\" .";
    // The person's names (people4: aliases in every language, the English or
    // "mul" label) and their links are two branches of one UNION, so their rows
    // add up instead of multiplying (a name per row, a link per row; the same
    // answer shape from WDQS and QLever, both recorded 2026-11-24).
    return [
        "PREFIX wd: <http://www.wikidata.org/entity/>",
        "PREFIX wdt: <http://www.wikidata.org/prop/direct/>",
        "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
        "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>",
        "SELECT ?p ?pOrcid ?pIdref ?pOa ?pBirth ?pName ?rel ?o ?oLabel ?oOrcid ?oIdref ?oOa WHERE {",
        "  " + who,
        "  OPTIONAL { ?p wdt:P496 ?pOrcid }",
        "  OPTIONAL { ?p wdt:P269 ?pIdref }",
        "  OPTIONAL { ?p wdt:P10283 ?pOa }",
        "  OPTIONAL { ?p wdt:P569 ?pBirth }",
        "  OPTIONAL {",
        "    { ?p skos:altLabel ?pName }",
        "    UNION",
        "    { ?p rdfs:label ?pName FILTER(LANG(?pName) = \"en\" || LANG(?pName) = \"mul\") }",
        "    UNION",
        "    {",
        "      VALUES ?rel { wdt:P184 wdt:P185 }",
        "      ?p ?rel ?o .",
        "      OPTIONAL { ?o rdfs:label ?oLabel FILTER(LANG(?oLabel) = \"en\" || LANG(?oLabel) = \"mul\") }",
        "      OPTIONAL { ?o wdt:P496 ?oOrcid }",
        "      OPTIONAL { ?o wdt:P269 ?oIdref }",
        "      OPTIONAL { ?o wdt:P10283 ?oOa }",
        "    }",
        "  }",
        "} LIMIT 400",
    ].join("\n");
}

/** The SPARQL answer's lines (suggested: Wikidata is not a confirmed
 *  source): the person's item and the ids it carries, their birth year (the
 *  year of P569's xsd:dateTime, "1963-09-15T00:00:00Z" -- recorded from the
 *  QLever mirror 2026-11-24; an unknown value is a blank node, no year), each
 *  advisor and student as a link with theirs. Null when the person has no
 *  item. */
export function wvPpFromWikidata(json: any): { qid: string; lines: WvPpLine[] } | null {
    const rows: any[] = (json && json.results && json.results.bindings) || [];
    const v = (r: any, k: string) => (r && r[k] && typeof r[k].value === "string" ? r[k].value : "");
    const qid = rows.length ? wvPpNormId("wikidata", tail(v(rows[0], "p"))) : "";
    if (!qid) return null;
    const url = WV_PP_WEB.wikidata(qid);
    const out: WvPpLine[] = [{ fact: "wikidata", value: qid, source: "wikidata", url, status: "suggested" }];
    const seen = new Set<string>();
    const add = (fact: string, value: string, ref?: WvPpRef) => {
        const key = fact + "|" + value + "|" + JSON.stringify(ref || {});
        if (!value || seen.has(key)) return;
        seen.add(key);
        const l: WvPpLine = { fact, value, source: "wikidata", url, status: "suggested" };
        if (ref && Object.keys(ref).length) l.ref = ref;
        out.push(l);
    };
    const links = new Map<string, { fact: string; ref: WvPpRef; label: string }>();
    const names: string[] = [];
    for (const r of rows) {
        const nm = v(r, "pName"); if (nm) names.push(nm);
        const o = wvPpNormId("orcid", v(r, "pOrcid")); if (o) add("orcid", o);
        const i = wvPpNormId("idref", v(r, "pIdref")); if (i) add("idref", i);
        const a = wvPpNormId("openalex", v(r, "pOa")); if (a) add("openalex", a);
        const b = /^(\d{4})-\d\d-\d\d/.exec(v(r, "pBirth")); if (b) add("birth.year", b[1]);
        const rel = tail(v(r, "rel"));
        const oq = wvPpNormId("wikidata", tail(v(r, "o")));
        if (!oq || (rel !== "P184" && rel !== "P185")) continue;
        const fact = rel === "P184" ? "link.advisor" : "link.student";
        const k = fact + "|" + oq;
        const cur = links.get(k) || { fact, ref: { wikidata: oq } as WvPpRef, label: "" };
        const lo = wvPpNormId("orcid", v(r, "oOrcid")); if (lo && !cur.ref.orcid) cur.ref.orcid = lo;
        const li = wvPpNormId("idref", v(r, "oIdref")); if (li && !cur.ref.idref) cur.ref.idref = li;
        const la = wvPpNormId("openalex", v(r, "oOa")); if (la && !cur.ref.openalex) cur.ref.openalex = la;
        const lab = v(r, "oLabel");
        if (lab && (!cur.label || (r.oLabel && r.oLabel["xml:lang"] === "en"))) cur.label = lab;
        links.set(k, cur);
    }
    for (const l of links.values()) add(l.fact, l.label || (l.ref.wikidata as string), l.ref);
    // The forms of the name (people4): each once, whatever its language tag.
    out.push(...wvPpFormLines(names, "wikidata", url).slice(0, 30));
    return { qid, lines: out };
}

// ---- the followed lists ------------------------------------------------------

export interface WvPpFollowEntry { name: string; last: string; first: string; openalex: string[]; confidence: string }

/** The followed authors of an alerts file (lib/feed-score.ts wvFdIsAlertsDoc;
 *  the file feeds.ts imports and exports, weavero/feeds/alerts.json or one the
 *  user picks) -- enabled entries, each with the OpenAlex ids the file's tool
 *  resolved and its confidence in them -- plus names of Weavero's own Feeds
 *  list that the file does not hold (no id: a profile to pick). */
export function wvPpFollowEntries(alertsDoc: any, feedsNames: string[]): WvPpFollowEntry[] {
    const out: WvPpFollowEntry[] = [];
    const isAlerts = wvFdIsAlertsDoc(alertsDoc);
    for (const e of isAlerts && Array.isArray(alertsDoc.followed_authors) ? alertsDoc.followed_authors : []) {
        if (!e || typeof e !== "object" || e.enabled === false) continue;
        const name = String(e.name || "").replace(/\s+/g, " ").trim();
        if (!name) continue;
        const ids = (Array.isArray(e.openalex) ? e.openalex : []).map((x: any) => wvPpNormId("openalex", String(x || ""))).filter(Boolean);
        const n = wvPpSplitName(name);
        out.push({ name, last: n.last, first: n.first, openalex: ids, confidence: String(e.confidence || "") });
    }
    for (const raw of feedsNames || []) {
        const name = String(raw || "").replace(/\s+/g, " ").trim();
        if (!name) continue;
        const n = wvPpSplitName(name);
        if (out.some((x) => wvPpNameMatch(x.last, x.first, n.last, n.first))) continue;
        out.push({ name, last: n.last, first: n.first, openalex: [], confidence: "" });
    }
    return out;
}
