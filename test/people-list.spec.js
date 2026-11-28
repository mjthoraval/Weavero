/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// The Researchers tab's list (people.ts, branch people3; MJT 2026-11-24 on a
// screenshot of the tab: "I would show the names as 'LastName, FirstName', so
// that it is obvious that it is sorted by the last name, as in the creator
// column. Also put some other sorting and filtering options." -- plan approved
// "Ok for the plan"):
//   - names "Last, First" by default in the list, the page title, the Links rows
//     and the family tree, each place switched on its own in Settings; a name
//     with no first name is the last name alone;
//   - a sort menu "Sort: <current> ▾" on the chips row: last name, first name,
//     date added, last modified, items in your libraries, institution, PhD year,
//     birth year -- unknown values last;
//   - filter chips beside To check / Followed / All, a "More ▾" chip for those
//     that do not fit; they combine (AND) with the chips and the search box;
//   - three new facts: the current institution's country (ORCID
//     organization.address.country, OpenAlex last_known_institutions[].country_code),
//     the PhD's country (ORCID's PhD education, theses.fr = France), the birth
//     year (Wikidata P569) -- read from recorded answers, never fetched here;
//   - the sort, the filters and the name orders saved in prefs with registered
//     defaults;
//   - "In your libraries" counted from one creator index, cached, refreshed on
//     item changes -- never a library scan per render.
// Written before the code (people3.1): every test failed on 1.3.0-dev.83.
// Nothing here goes to the network; the items made are in the runner's own
// My Library and erased at the end.

describe("Weavero — Researchers list: names, sort, filters, new facts", function () {
    this.timeout(180000);
    let wv, lib, win, doc, ZT;
    const made = [];
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns", "people.names.list", "people.names.title", "people.names.links", "people.names.tree"];
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const ppTab = () => ZT._tabs.find(t => String(t.type).startsWith("wvpeople")) || null;
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    // The list is the table now (the Google Contacts design, step 2): its names and
    // records in its order, as the view draws them (also while a page is open).
    const rowNames = () => wv._wvPeopleTableNames(win);
    const rowIds = () => wv._wvPeopleTableIds(win);
    // Fluent isolates each placeable (U+2068 ... U+2069): compared without the marks.
    const txt = (el) => String(el && el.textContent || "").replace(/[\u2068\u2069]/g, "");
    const clearPrefs = () => { for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} } };

    // ---- recorded answers ---------------------------------------------------------
    // ORCID (pub.orcid.org/v3.0/<id>/record, recorded 2026-11-22 for Alban Sauret,
    // trimmed): a current employment (no end date) and an ended one, each with its
    // organization.address.country; the PhD education with its own.
    const ORCID = { "person": { "researcher-urls": { "researcher-url": [] } }, "activities-summary": {
        "employments": { "affiliation-group": [
            { "summaries": [{ "employment-summary": { "role-title": "Associate Professor and Clark Faculty Fellow", "start-date": { "year": { "value": "2025" } }, "end-date": null,
                "organization": { "name": "University of Maryland, College Park", "address": { "city": "College Park", "region": null, "country": "US" } } } }] },
            { "summaries": [{ "employment-summary": { "role-title": "Tenured Research Scientist", "start-date": { "year": { "value": "2014" } }, "end-date": { "year": { "value": "2018" } },
                "organization": { "name": "CNRS", "address": { "city": "Aubervilliers", "region": null, "country": "FR" } } } }] },
        ] },
        "educations": { "affiliation-group": [
            { "summaries": [{ "education-summary": { "role-title": "PhD", "start-date": { "year": { "value": "2009" } }, "end-date": { "year": { "value": "2013" } },
                "organization": { "name": "Aix-Marseille University", "address": { "city": "Marseille", "region": null, "country": "FR" } } } }] },
            { "summaries": [{ "education-summary": { "role-title": "MS", "start-date": { "year": { "value": "2007" } }, "end-date": { "year": { "value": "2009" } },
                "organization": { "name": "École Normale Supérieure de Lyon", "address": { "city": "Lyon", "region": null, "country": "FR" } } } }] },
        ] },
        "qualifications": { "affiliation-group": [] } } };
    // OpenAlex (api.openalex.org/authors/A5030022491, recorded 2026-11-22, trimmed):
    // two current institutions, each with its country_code.
    const OA = { "id": "https://openalex.org/A5030022491", "display_name": "Alban Sauret", "orcid": "https://orcid.org/0000-0001-7874-5983",
        "last_known_institutions": [
            { "id": "https://openalex.org/I154570441", "display_name": "University of California, Santa Barbara", "country_code": "US" },
            { "id": "https://openalex.org/I66946132", "display_name": "University of Maryland, College Park", "country_code": "US" }],
        "affiliations": [] };
    // theses.fr (theses.fr/api/v1/personnes/personne/151292876, recorded 2026-11-22, trimmed).
    const THESES = { "theses": { "Auteur / Autrice": [{ "status": "soutenue", "titre": "Forçage harmonique d'écoulements en rotation",
        "date_soutenance": "2013-02-01", "etablissement_soutenance": { "ppn": "15863621X", "nom": "Aix-Marseille", "type": null },
        "directeurs": [{ "id": "074002988", "nom": "Le Dizès", "prenom": "Stéphane", "has_idref": true }] }] } };
    // Wikidata, the QLever mirror's answer (recorded 2026-11-24) to the people query
    // WITH date of birth (P569), by Detlef Lohse's ORCID iD; the "mul" label rows
    // left out.
    const WD = {"head":{"vars":["p","pOrcid","pIdref","pOa","pBirth","rel","o","oLabel","oOrcid","oIdref","oOa"]},"results":{"bindings":[
        {"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P184"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q121135"},"oLabel":{"type":"literal","value":"Siegfried Großmann","xml:lang":"en"}},
        {"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P185"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q47272469"},"oLabel":{"type":"literal","value":"Stephan Gekle","xml:lang":"en"},"oOrcid":{"type":"literal","value":"0000-0001-5597-1160"},"oIdref":{"type":"literal","value":"203601505"}},
        {"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P185"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q47431842"},"oLabel":{"type":"literal","value":"Devaraj van der Meer","xml:lang":"en"},"oOrcid":{"type":"literal","value":"0000-0003-4420-9714"},"oIdref":{"type":"literal","value":"200283456"}}]}};

    // ---- four researchers (synthetic names: nothing else in the runner has them) ----
    // R1 Quillfeather, Ada: ORCID, a web page, a position, an institution in the US,
    //    PhD in France 2005, born 1975, PhD advisor R3 (by her ORCID) and an advisor
    //    not in Researchers; 3 items authored (one a thesis).
    // R2 Brindlecombe, Otto: no identifier, nothing known; an editor only.
    // R3 Ziegenhals, Clara: Wikidata only, Alpha Institute in Germany, PhD 1990 in
    //    Germany, born 1960; followed, checked; 1 item authored.
    // R4 Aaronsen (no first name): ORCID, Professor, two institutions that disagree.
    const R3ORCID = "0000-0002-0000-0003";
    const mkRecs = () => {
        const line = (fact, value, source, more) => Object.assign({ fact, value, source, status: "suggested" }, more || {});
        const r1 = lib.wvPpNewRecord("p-ppl-r1", "Quillfeather", "Ada", new Date("2026-01-01T10:00:00Z"));
        lib.wvPpMerge(r1, [line("orcid", "0000-0002-0000-0001", "orcid"), line("web", "https://example.org/ada", "orcid"),
            line("position", "Professor", "orcid"), line("institution", "University of Somewhere", "openalex"), line("country", "US", "orcid"),
            line("phd.country", "FR", "thesesfr"), line("phd.year", "2005", "thesesfr"), line("birth.year", "1975", "wikidata"),
            line("link.advisor", "Clara Ziegenhals", "thesesfr", { ref: { orcid: R3ORCID } }),
            line("link.advisor", "Michael Le Bars", "thesesfr", { ref: { idref: "071032738" } })], "2026-06-01");
        r1.modified = "2026-06-01T10:00:00.000Z";
        const r2 = lib.wvPpNewRecord("p-ppl-r2", "Brindlecombe", "Otto", new Date("2026-03-01T10:00:00Z"));
        r2.modified = "2026-03-02T10:00:00.000Z";
        const r3 = lib.wvPpNewRecord("p-ppl-r3", "Ziegenhals", "Clara", new Date("2025-12-01T10:00:00Z"));
        lib.wvPpMerge(r3, [line("wikidata", "Q99999993", "wikidata"), line("orcid", R3ORCID, "wikidata", { status: "rejected" }),
            line("institution", "Alpha Institute", "openalex"), line("country", "DE", "openalex"), line("phd.country", "DE", "orcid"),
            line("phd.year", "1990", "orcid"), line("birth.year", "1960", "wikidata")], "2026-07-01");
        // Her ORCID iD known but rejected: the advisor link still names her by it; no ORCID shown.
        lib.wvPpAct(r3, "orcid", R3ORCID, "reject");
        r3.followed = true; r3.check = false;
        r3.modified = "2026-07-01T10:00:00.000Z";
        const r4 = lib.wvPpNewRecord("p-ppl-r4", "Aaronsen", "", new Date("2026-05-01T10:00:00Z"));
        lib.wvPpMerge(r4, [line("orcid", "0000-0002-0000-0004", "orcid"), line("position", "Professor", "orcid"),
            line("institution", "Beta Lab", "orcid", { status: "confirmed" }), line("institution", "Gamma Lab", "openalex")], "2026-05-02");
        r4.modified = "2026-05-02T10:00:00.000Z";
        return [r1, r2, r3, r4];
    };
    let recs = null, R = null;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const f of ["wvPpNameAs", "wvPpNameTextAs", "wvPpInfos", "wvPpListFilter", "wvPpListSort", "wvPpMenuValues", "wvPpFiltersParse", "wvPpLibIndexBuild", "wvPpLibStatOf", "wvPpCountryName", "wvPpCountryCode"]) {
            if (!lib || typeof lib[f] !== "function") wvT.absent("Zotero.Weavero.lib." + f);
        }
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleLoad", "_wvPeopleNameOrder", "_wvPeopleSetShow", "_wvPeopleSetFilter", "_wvPeopleClearFilters",
            "_wvPeopleLibIndexBuild", "_wvPeopleLibStats", "_wvPeopleTableIds", "_wvPeopleTableNames", "_wvPeopleColSortSet"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        clearPrefs();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        recs = mkRecs();
        R = { r1: recs[0], r2: recs[1], r3: recs[2], r4: recs[3] };
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        clearPrefs();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wvT.erase(...made);
        try { ZT.select(ZT._tabs.find(t => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    // ---- the pure rules -------------------------------------------------------------

    it("a name in each order: \"Last, First\" or \"First Last\"; no first name: the last name alone; a source's one-string name split as its particles say", function () {
        assert.equal(lib.wvPpNameAs({ last: "Sauret", first: "Alban" }, "last"), "Sauret, Alban");
        assert.equal(lib.wvPpNameAs({ last: "Sauret", first: "Alban" }, "first"), "Alban Sauret");
        assert.equal(lib.wvPpNameAs({ last: "Aaronsen", first: "" }, "last"), "Aaronsen", "no dangling comma");
        assert.equal(lib.wvPpNameAs({ last: "Aaronsen", first: "  " }, "first"), "Aaronsen");
        assert.equal(lib.wvPpNameTextAs("Michael Le Bars", "last"), "Le Bars, Michael");
        assert.equal(lib.wvPpNameTextAs("Johannes Diderik van der Waals", "last"), "van der Waals, Johannes Diderik");
        assert.equal(lib.wvPpNameTextAs("Michael Le Bars", "first"), "Michael Le Bars");
        assert.equal(lib.wvPpNameTextAs("Plato", "last"), "Plato");
    });

    it("the new facts from the recorded answers: country (ORCID's current employment, OpenAlex's country_code), PhD country (ORCID's PhD, theses.fr = France), birth year (Wikidata P569)", function () {
        const orc = lib.wvPpFromOrcid(clone(ORCID), "0000-0001-7874-5983");
        const of = (ls, fact) => ls.filter(l => l.fact === fact).map(l => l.value + "|" + l.source + "|" + l.status);
        assert.deepEqual(of(orc, "country"), ["US|orcid|confirmed"], "the current employment's country only (CNRS ended in 2018)");
        assert.deepEqual(of(orc, "phd.country"), ["FR|orcid|confirmed"], "the PhD education's country (not the MS one)");
        const oa = lib.wvPpFromOpenAlexAuthor(clone(OA));
        assert.deepEqual(of(oa.lines, "country"), ["US|openalex|suggested"], "two US institutions: one line");
        const th = lib.wvPpFromThesesPerson(clone(THESES), "151292876");
        assert.deepEqual(of(th, "phd.country"), ["FR|thesesfr|confirmed"], "theses.fr: a thesis defended in France");
        assert.include(lib.wvPpWikidataQuery({ orcid: "0000-0003-4138-2255" }), "wdt:P569 ?pBirth", "the query asks for the date of birth");
        const wd = lib.wvPpFromWikidata(clone(WD));
        assert.deepEqual(of(wd.lines, "birth.year"), ["1963|wikidata|suggested"], "the year of 1963-09-15, once");
        assert.deepEqual(wd.lines.filter(l => l.fact === "link.student").map(l => l.value), ["Stephan Gekle", "Devaraj van der Meer"], "the rest of the answer read as before");
        // A record without the facts: nothing invented.
        const bare = lib.wvPpFromWikidata({ results: { bindings: [{ p: { type: "uri", value: "http://www.wikidata.org/entity/Q1" } }] } });
        assert.deepEqual(of(bare.lines, "birth.year"), [], "no P569: no birth year");
        // The facts exist, with their sources' order.
        for (const k of ["country", "phd.country", "birth.year"]) assert.ok(lib.WV_PP_FACTS.some(d => d.key === k && !d.multi), k);
        // Country codes by name and back.
        assert.equal(lib.wvPpCountryName("FR", "en-US"), "France");
        assert.equal(lib.wvPpCountryName("DE", "fr-FR"), "Allemagne");
        assert.equal(lib.wvPpCountryCode("france", "en-US"), "FR");
        assert.equal(lib.wvPpCountryCode("Allemagne", "fr-FR"), "DE");
        assert.equal(lib.wvPpCountryCode("de", "en-US"), "DE");
        assert.equal(lib.wvPpCountryCode("Atlantis", "en-US"), "");
    });

    it("each sort, unknown values last (ties by last name)", function () {
        const infos = lib.wvPpInfos(recs);
        const stats = new Map([["p-ppl-r1", { n: 3, thesis: 1 }], ["p-ppl-r2", { n: 0, thesis: 0 }], ["p-ppl-r3", { n: 1, thesis: 0 }], ["p-ppl-r4", { n: 0, thesis: 0 }]]);
        const by = (sort, st) => lib.wvPpListSort(recs.slice().reverse(), infos, sort, st === undefined ? stats : st).map(r => r.last);
        assert.deepEqual(by("last"), ["Aaronsen", "Brindlecombe", "Quillfeather", "Ziegenhals"]);
        assert.deepEqual(by("first"), ["Quillfeather", "Ziegenhals", "Brindlecombe", "Aaronsen"], "Ada, Clara, Otto; no first name last");
        assert.deepEqual(by("added"), ["Aaronsen", "Brindlecombe", "Quillfeather", "Ziegenhals"], "newest first: 05-01, 03-01, 01-01, 2025-12-01");
        assert.deepEqual(by("modified"), ["Ziegenhals", "Quillfeather", "Aaronsen", "Brindlecombe"], "newest first");
        assert.deepEqual(by("items"), ["Quillfeather", "Ziegenhals", "Aaronsen", "Brindlecombe"], "most first; 0 is known, ties by last name");
        assert.deepEqual(by("items", null), ["Aaronsen", "Brindlecombe", "Quillfeather", "Ziegenhals"], "not counted yet: all unknown, by last name");
        assert.deepEqual(by("institution"), ["Ziegenhals", "Aaronsen", "Quillfeather", "Brindlecombe"], "Alpha, Beta (the confirmed one shown), University...; none last");
        assert.deepEqual(by("phdYear"), ["Ziegenhals", "Quillfeather", "Aaronsen", "Brindlecombe"], "1990, 2005, then unknown");
        assert.deepEqual(by("birthYear"), ["Ziegenhals", "Quillfeather", "Aaronsen", "Brindlecombe"], "1960, 1975, then unknown");
        assert.deepEqual(by("nonsense"), by("last"), "an unknown sort: last name");
    });

    it("each filter keeps what it says; they combine (AND) with To check / Followed / All and the search; the menus list the values present with Unknown", function () {
        const infos = lib.wvPpInfos(recs);
        const stats = new Map([["p-ppl-r1", { n: 3, thesis: 1 }], ["p-ppl-r2", { n: 0, thesis: 0 }], ["p-ppl-r3", { n: 1, thesis: 0 }], ["p-ppl-r4", { n: 0, thesis: 0 }]]);
        const keep = (filters, opts) => lib.wvPpListFilter(recs, infos, Object.assign({ show: "all", q: "", filters }, opts || {}), stats).map(r => r.last).sort();
        assert.deepEqual(keep({}), ["Aaronsen", "Brindlecombe", "Quillfeather", "Ziegenhals"]);
        assert.deepEqual(keep({ noOrcid: true }), ["Brindlecombe", "Ziegenhals"], "no ORCID iD shown (a rejected one does not count)");
        assert.deepEqual(keep({ noIds: true }), ["Brindlecombe"], "no identifier at all");
        assert.deepEqual(keep({ inLib: true }), ["Quillfeather", "Ziegenhals"]);
        assert.deepEqual(keep({ thesis: true }), ["Quillfeather"]);
        assert.deepEqual(keep({ advisor: true }), ["Quillfeather"]);
        assert.deepEqual(keep({ student: true }), ["Ziegenhals"], "Quillfeather's advisor link names her (by her name: the ORCID iD it carries is one she rejected)");
        assert.deepEqual(keep({ web: true }), ["Quillfeather"]);
        assert.deepEqual(keep({ conflict: true }), ["Aaronsen"], "two institutions, no choice");
        assert.deepEqual(keep({ position: "professor" }), ["Aaronsen", "Quillfeather"], "case aside");
        assert.deepEqual(keep({ position: "" }), ["Brindlecombe", "Ziegenhals"], "Unknown: the ones without");
        assert.deepEqual(keep({ institution: "Alpha Institute" }), ["Ziegenhals"]);
        assert.deepEqual(keep({ country: "US" }), ["Quillfeather"]);
        assert.deepEqual(keep({ country: "DE" }), ["Ziegenhals"]);
        assert.deepEqual(keep({ country: "" }), ["Aaronsen", "Brindlecombe"], "unknown country: never kept by a country, kept by Unknown");
        assert.deepEqual(keep({ phdCountry: "FR" }), ["Quillfeather"]);
        assert.deepEqual(keep({ birth: "1960" }), ["Ziegenhals"]);
        assert.deepEqual(keep({ birth: "1970" }), ["Quillfeather"]);
        assert.deepEqual(keep({ phd: "2000" }), ["Quillfeather"]);
        // AND, with the chips and the search.
        assert.deepEqual(keep({ noOrcid: true, inLib: true }), ["Ziegenhals"]);
        assert.deepEqual(keep({ noOrcid: true }, { show: "followed" }), ["Ziegenhals"]);
        assert.deepEqual(keep({ noOrcid: true }, { show: "check" }), ["Brindlecombe"]);
        assert.deepEqual(keep({ noOrcid: true }, { q: "zieg" }), ["Ziegenhals"]);
        assert.deepEqual(keep({ noOrcid: true }, { q: "quill" }), []);
        assert.deepEqual(keep({}, { q: "ziegenhals, clara" }), ["Ziegenhals"], "a name typed as \"Last, First\" finds them");
        // "In your libraries" not counted yet: nobody is known to be in them.
        assert.deepEqual(lib.wvPpListFilter(recs, infos, { show: "all", q: "", filters: { inLib: true } }, null).map(r => r.last), []);
        // The menus: the values present, their counts, Unknown.
        const vals = (key) => lib.wvPpMenuValues(recs, infos, key, "en-US").map(v => v.value + ":" + v.label + ":" + v.count);
        assert.deepEqual(vals("country"), ["DE:Germany:1", "US:United States:1", "::2"], "by name; Unknown (value and label \"\") last");
        assert.deepEqual(vals("position"), ["Professor:Professor:2", "::2"]);
        assert.deepEqual(vals("birth"), ["1960:1960:1", "1970:1970:1", "::2"], "decades, in order");
        // The stored filters read back safely.
        // people4: a value filter holds a list of values (people3's one string read as one).
        assert.deepEqual(lib.wvPpFiltersParse("{\"noOrcid\":true,\"country\":\"DE\",\"bogus\":1,\"web\":\"yes\"}"), { noOrcid: true, country: ["DE"] });
        assert.deepEqual(lib.wvPpFiltersParse("not json"), {});
    });

    it("the library index: one pass over the creators and the item creators; a person's items by their name (initials too, variants too), authored only, thesis apart", function () {
        const creators = [{ id: 1, last: "Quillfeather", first: "Ada" }, { id: 2, last: "Quillfeather", first: "A." }, { id: 3, last: "Quillfeather", first: "Alice" },
            { id: 4, last: "Ziegenhals", first: "Clara" }, { id: 5, last: "Brindlecombe", first: "Otto" }];
        const pairs = [{ cid: 1, item: 10, authored: true, thesis: false }, { cid: 2, item: 11, authored: true, thesis: false }, { cid: 1, item: 12, authored: true, thesis: true },
            { cid: 3, item: 13, authored: true, thesis: false }, { cid: 4, item: 12, authored: false, thesis: true }, { cid: 4, item: 14, authored: true, thesis: false },
            { cid: 5, item: 15, authored: false, thesis: false }, { cid: 1, item: 10, authored: true, thesis: false }];
        const ix = lib.wvPpLibIndexBuild(creators, pairs);
        const st = (r) => { const s = lib.wvPpLibStatOf(r, ix); return [s.n, s.thesis]; };
        assert.deepEqual(st(R.r1), [3, 1], "Ada and A. (not Alice): items 10, 11, 12 -- 12 a thesis");
        assert.deepEqual(st(R.r3), [1, 0], "a contributor to a thesis has not authored it");
        assert.deepEqual(st(R.r2), [0, 0], "an editor only");
        const v = lib.wvPpNewRecord("p-v", "Q.", "");
        v.variants = ["Ada Quillfeather"];
        assert.deepEqual(st(v), [3, 1], "through a variant of the name");
        assert.deepEqual(lib.wvPpLibStatOf(R.r1, ix).items.slice().sort(), [10, 11, 12], "the items themselves");
    });

    // ---- the tab --------------------------------------------------------------------

    const openOn = async (sel) => {
        await wv._wvPeopleLoad();
        const db = wv._wvPeopleDB;
        db.people.length = 0;
        db.people.push(...recs);
        wv._wvPeopleTabOpen(win, sel ? { personID: sel } : {});
        const v = wv._wvPeopleViewOf(win);
        if (!sel) { v.sel = null; v.view = "table"; v.fix = null; wv._wvPeopleTabRender(win); }
        assert.ok(await wvT.waitFor(() => root() && (sel ? q("[data-wv-pp-record='" + sel + "']") : q(".wv-pp-table .row[data-wv-pp-person]")), 5000, 50), "the tab");
    };

    it("names \"Last, First\" by default in the list, the page title, the Links rows and the family tree; each place switched on its own", async function () {
        await openOn("p-ppl-r1");
        // The table's order: the followed first (Ziegenhals), then by last name.
        assert.deepEqual(rowNames(), ["Ziegenhals, Clara", "Aaronsen", "Brindlecombe, Otto", "Quillfeather, Ada"], "the list: Last, First, sorted by last name");
        const title = () => q(".wv-pp-name") && q(".wv-pp-name").textContent;
        assert.equal(title(), "Quillfeather, Ada", "the page title");
        const links = () => qa("[data-wv-pp-fact='link.advisor'] .wv-pp-vtext").map(e => e.textContent).sort();
        assert.deepEqual(links(), ["Le Bars, Michael", "Ziegenhals, Clara"], "the Links rows: a person of Researchers by their record, another by the source's name");
        // The lineage tree's cards (peoplenet): the name on each.
        const tree = () => qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='advisor'] .wv-pp-lt-name").map(e => e.textContent).sort();
        assert.deepEqual(tree(), ["Le Bars, Michael", "Ziegenhals, Clara"], "the family tree's boxes");
        assert.strictEqual(q("[data-wv-pp-fact='link.advisor'] .wv-pp-val[data-value='Clara Ziegenhals']") ? true : false, true, "the value itself is the source's");
        const place = async (k, check, want, others) => {
            Zotero.Prefs.set("weavero.people.names." + k, "first");
            assert.ok(await wvT.waitFor(() => JSON.stringify(check()) === JSON.stringify(want), 3000, 30), k + ": " + JSON.stringify(check()));
            for (const [name, fn, still] of others) assert.deepEqual(fn(), still, k + " leaves " + name + " alone");
            Zotero.Prefs.clear("weavero.people.names." + k);
            assert.ok(await wvT.waitFor(() => JSON.stringify(check()) !== JSON.stringify(want), 3000, 30), k + " back");
        };
        const L0 = ["Ziegenhals, Clara", "Aaronsen", "Brindlecombe, Otto", "Quillfeather, Ada"];
        await place("list", rowNames, ["Clara Ziegenhals", "Aaronsen", "Otto Brindlecombe", "Ada Quillfeather"], [["the title", title, "Quillfeather, Ada"], ["the links", links, ["Le Bars, Michael", "Ziegenhals, Clara"]]]);
        await place("title", title, "Ada Quillfeather", [["the list", rowNames, L0], ["the tree", tree, ["Le Bars, Michael", "Ziegenhals, Clara"]]]);
        await place("links", links, ["Clara Ziegenhals", "Michael Le Bars"], [["the list", rowNames, L0], ["the tree", tree, ["Le Bars, Michael", "Ziegenhals, Clara"]]]);
        await place("tree", tree, ["Clara Ziegenhals", "Michael Le Bars"], [["the title", title, "Quillfeather, Ada"], ["the links", links, ["Le Bars, Michael", "Ziegenhals, Clara"]]]);
        assert.equal(wv._wvPeopleNameOrder("list"), "last");
        assert.equal(wv._wvPeopleNameOrder("nonsense"), "last");
    });

    // The sort chip and the filter chips + More of people3 gave way to people4's sort label and
    // filter funnel, and those to the table's column titles and the left pane's Browse by
    // (the Google Contacts design, step 2): test/people-table.spec.js, test/people-browse.spec.js.

    it("the filters and the view are saved: a new view starts from them", async function () {
        await openOn(null);
        wv._wvPeopleSetFilter(win, "phdCountry", "DE");
        wv._wvPeopleSetShow(win, "followed");
        assert.deepEqual(JSON.parse(String(Zotero.Prefs.get("weavero.people.filters"))), { phdCountry: ["DE"] });
        assert.equal(Zotero.Prefs.get("weavero.people.show"), "followed");
        wv._wvPeopleTabClose(win);
        await sleep(200);
        wv._wvPeopleTabOpen(win, {});
        assert.ok(await wvT.waitFor(() => JSON.stringify(rowIds()) === JSON.stringify(["p-ppl-r3"]) && q(".wv-pp-table .row[data-wv-pp-person='p-ppl-r3']"), 5000, 50), "the same list: " + rowIds());
        assert.equal(q("[data-wv-pp-nav='followed']").getAttribute("aria-current"), "true", "the view Followed");
        wv._wvPeopleClearFilters(win);
        wv._wvPeopleSetShow(win, "all");
        assert.deepEqual(JSON.parse(String(Zotero.Prefs.get("weavero.people.filters") || "{}")), {});
    });

    it("\"In your libraries\": counted from one creator index of the runner's library (authored items, thesis apart, the trash left out), refreshed when items change, and no library query while the list redraws", async function () {
        const add = async (type, creators, trash) => {
            const it = await wvT.createItem(type, { title: "WV-TEST ppl " + type + " " + made.length });
            it.setCreators(creators);
            await it.saveTx();
            if (trash) { it.deleted = true; await it.saveTx(); }
            made.push(it);
            return it;
        };
        const au = (last, first, t) => ({ lastName: last, firstName: first, creatorType: t || "author" });
        await add("journalArticle", [au("Quillfeather", "Ada")]);
        await add("journalArticle", [au("Quillfeather", "A.")]);
        await add("thesis", [au("Quillfeather", "Ada"), au("Ziegenhals", "Clara", "contributor")]);
        await add("book", [au("Ziegenhals", "Clara")]);
        await add("book", [au("Brindlecombe", "Otto", "editor")]);
        await add("journalArticle", [au("Quillfeather", "Ada")], true);
        await wv._wvPeopleLibIndexBuild();
        await openOn(null);
        const stat = (id) => { const m = wv._wvPeopleLibStats(); const s = m && m.get(id); return s ? [s.n, s.thesis] : null; };
        assert.ok(await wvT.waitFor(() => stat("p-ppl-r1"), 5000, 50), "counted");
        assert.deepEqual([stat("p-ppl-r1"), stat("p-ppl-r2"), stat("p-ppl-r3"), stat("p-ppl-r4")], [[3, 1], [0, 0], [1, 0], [0, 0]]);
        wv._wvPeopleSetFilter(win, "thesis", true);
        assert.ok(await wvT.waitFor(() => JSON.stringify(rowIds()) === JSON.stringify(["p-ppl-r1"]), 3000, 30), "PhD thesis in your libraries");
        wv._wvPeopleClearFilters(win);
        // The table by Papers in your libraries, the most first (the followed first: Ziegenhals).
        wv._wvPeopleColSortSet(win, "papers", -1);
        assert.ok(await wvT.waitFor(() => JSON.stringify(rowIds()) === JSON.stringify(["p-ppl-r3", "p-ppl-r1", "p-ppl-r4", "p-ppl-r2"]), 3000, 30), "most first: " + rowIds());
        // Redraws read the index, never the database (the selected record has no works
        // cache: its Publications section lists the library's items by name too).
        wv._wvPeopleTabOpen(win, { personID: "p-ppl-r2" });
        await sleep(300);
        const orig = Zotero.DB.queryAsync;
        let n = 0;
        // Every query of People's library index and of the name fallback carries this mark.
        Zotero.DB.queryAsync = function (sql) { if (/wv-people-lib/.test(String(sql))) n++; return orig.apply(this, arguments); };
        try {
            for (let i = 0; i < 5; i++) { wv._wvPeopleTabRender(win); await sleep(60); }
            // Back to the table, a search typed.
            const v = wv._wvPeopleViewOf(win);
            v.sel = null;
            wv._wvPeopleTabRender(win);
            const s = q(".wv-pp-search");
            s.value = "a";
            s.dispatchEvent(new win.Event("input", { bubbles: true }));
            await sleep(300);
        }
        finally { Zotero.DB.queryAsync = orig; }
        assert.equal(n, 0, "no creator query while the list redraws");
        const s3 = q(".wv-pp-search");
        s3.value = "";
        s3.dispatchEvent(new win.Event("input", { bubbles: true }));
        // An item added: counted again, without a hand.
        await add("journalArticle", [au("Brindlecombe", "Otto")]);
        assert.ok(await wvT.waitFor(() => JSON.stringify(stat("p-ppl-r2")) === "[1,0]", 15000, 100), "the new item counts: " + JSON.stringify(stat("p-ppl-r2")));
        try { Zotero.Prefs.clear("weavero.people.columns"); } catch (e) {}
    });

    it("the new facts show in the record's Facts, a country by its name; a country typed by name is kept as its code", async function () {
        await openOn("p-ppl-r1");
        const row = (fact, v) => q("[data-wv-pp-fact='" + fact + "'] .wv-pp-val[data-value='" + v + "']");
        assert.ok(await wvT.waitFor(() => row("country", "US"), 3000, 30), "Country");
        assert.match(row("country", "US").querySelector(".wv-pp-vtext").textContent, /^United States/);
        assert.match(row("phd.country", "FR").querySelector(".wv-pp-vtext").textContent, /^France/);
        assert.ok(row("birth.year", "1975"), "Birth year");
        assert.ok(q("[data-wv-pp-flabel='country']") && q("[data-wv-pp-flabel='phd.country']") && q("[data-wv-pp-flabel='birth.year']"), "their labels");
        await wv._wvPeopleFactEdit(win, "p-ppl-r1", "country", "Canada", "US");
        const mine = R.r1.lines.find(l => l.fact === "country" && l.source === "me");
        assert.deepEqual([mine && mine.value, mine && mine.status], ["CA", "chosen"], "typed by name, kept as its code");
    });

    it("Settings: one Last, First / First Last choice per place, bound to its pref", async function () {
        Zotero.Prefs.set("weavero.people.names.tree", "first");
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        try {
            const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find((k) => /weavero@mjthoraval/.test(k));
            assert.ok(await wvT.waitFor(() => !!paneID(), 10000, 50), "Weavero's pane registered");
            await pw.Zotero_Preferences.navigateToPane(paneID());
            const d = pw.document;
            const rg = (k) => /** @type {any} */ (d.getElementById("wv-pp-names-" + k));
            assert.ok(await wvT.waitFor(() => rg("tree") && rg("tree").value === "first", 15000, 50), "bound: the tree's choice read from its pref");
            for (const k of ["list", "title", "links"]) {
                assert.equal(rg(k).value, "last", k);
                assert.deepEqual(Array.from(rg(k).querySelectorAll("radio")).map(r => /** @type {any} */ (r).value), ["last", "first"], k + "'s two choices");
                const blk = rg(k).closest(".wv-block");
                assert.equal(blk.getAttribute("data-gated-by"), "enablePeople");
                assert.include(blk.getAttribute("data-wv-in"), "people");
            }
            const r = /** @type {any} */ (Array.from(rg("list").querySelectorAll("radio")).find(x => /** @type {any} */ (x).value === "first"));
            r.click();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get("weavero.people.names.list") === "first", 3000, 30), "a click writes the pref");
        }
        finally { try { pw.close(); } catch (e) {} clearPrefs(); }
    });
});
