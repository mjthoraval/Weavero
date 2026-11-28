/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, wvT */

// The Researchers tab's filters. people4 (MJT 2026-11-24) drew them in a funnel
// beside a sort button: "with icons as much as possible, and Alt+Click to
// exclude". The Google Contacts design, step 2 (MJT 2026-11-25, approved; his
// answers 2026-11-26) moves them to the left pane: "Browse by" Institution,
// Country, Position, each opening to its values with their counts; "a click
// filters the table to that value, Alt+click EXCLUDES it, the active filters
// shown and removable"; the funnel and the sort control go. The rules stay the
// list's (lib/people-list.ts): values of one filter any-of, exclusions
// none-of, filters AND; every choice saved (weavero.people.filters).
// This file was people-funnel.spec.js; its funnel tests gave way to these
// (written before the code: they failed on 1.3.0-peoplenet.14).

describe("Weavero — Researchers: Browse by, the filters on", function () {
    this.timeout(120000);
    let wv, lib, win;
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns", "people.names.list", "people.names.title", "people.names.links", "people.names.tree"];
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const ids = () => wv._wvPeopleTableIds(win).slice().sort();
    const rowIds = () => qa(".wv-pp-table .virtualized-table-body .row[data-wv-pp-person]").map(e => e.getAttribute("data-wv-pp-person")).sort();
    const shown = (want) => JSON.stringify(ids()) === JSON.stringify(want) && JSON.stringify(rowIds()) === JSON.stringify(want);
    const txt = (el) => String(el && el.textContent || "").replace(/[⁨⁩]/g, "");
    const clearPrefs = () => { for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} } };
    const group = (k) => q(".wv-pp-side [data-wv-pp-browse='" + k + "']");
    const value = (k, v) => q(".wv-pp-side .wv-pp-bval[data-wv-pp-fkey='" + k + "'][data-wv-pp-fval='" + v + "']");
    const pill = (k, v) => q(".wv-pp-factive .wv-pp-fpill[data-wv-pp-fkey='" + k + "']" + (v == null ? ":not([data-wv-pp-fval])" : "[data-wv-pp-fval='" + v + "']"));
    const click = (el, alt) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, altKey: !!alt }));
    const prefFilters = () => JSON.parse(String(Zotero.Prefs.get("weavero.people.filters") || "{}"));
    const ALL = ["p-ppl-r1", "p-ppl-r2", "p-ppl-r3", "p-ppl-r4"];

    // The four researchers of test/people-list.spec.js (synthetic names).
    const R3ORCID = "0000-0002-0000-0003";
    const mkRecs = () => {
        const line = (fact, value, source, more) => Object.assign({ fact, value, source, status: "suggested" }, more || {});
        const r1 = lib.wvPpNewRecord("p-ppl-r1", "Quillfeather", "Ada", new Date("2026-01-01T10:00:00Z"));
        lib.wvPpMerge(r1, [line("orcid", "0000-0002-0000-0001", "orcid"), line("web", "https://example.org/ada", "orcid"),
            line("position", "Professor", "orcid"), line("institution", "University of Somewhere", "openalex"), line("country", "US", "orcid"),
            line("phd.country", "FR", "thesesfr"), line("phd.year", "2005", "thesesfr"), line("birth.year", "1975", "wikidata"),
            line("link.advisor", "Clara Ziegenhals", "thesesfr", { ref: { orcid: R3ORCID } }),
            line("link.advisor", "Michael Le Bars", "thesesfr", { ref: { idref: "071032738" } })], "2026-06-01");
        const r2 = lib.wvPpNewRecord("p-ppl-r2", "Brindlecombe", "Otto", new Date("2026-03-01T10:00:00Z"));
        const r3 = lib.wvPpNewRecord("p-ppl-r3", "Ziegenhals", "Clara", new Date("2025-12-01T10:00:00Z"));
        lib.wvPpMerge(r3, [line("wikidata", "Q99999993", "wikidata"), line("orcid", R3ORCID, "wikidata", { status: "rejected" }),
            line("institution", "Alpha Institute", "openalex"), line("country", "DE", "openalex"), line("phd.country", "DE", "orcid"),
            line("phd.year", "1990", "orcid"), line("birth.year", "1960", "wikidata")], "2026-07-01");
        lib.wvPpAct(r3, "orcid", R3ORCID, "reject");
        r3.followed = true; r3.check = false;
        const r4 = lib.wvPpNewRecord("p-ppl-r4", "Aaronsen", "", new Date("2026-05-01T10:00:00Z"));
        lib.wvPpMerge(r4, [line("orcid", "0000-0002-0000-0004", "orcid"), line("position", "Professor", "orcid"),
            line("institution", "Beta Lab", "orcid", { status: "confirmed" }), line("institution", "Gamma Lab", "openalex")], "2026-05-02");
        return [r1, r2, r3, r4];
    };
    let recs = null;

    const openOn = async () => {
        await wv._wvPeopleLoad();
        const db = wv._wvPeopleDB;
        db.people.length = 0;
        db.people.push(...recs);
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.fix = null; v.filter = "all"; v.q = "";
        wv._wvPeopleTabRender(win);
        assert.ok(await wvT.waitFor(() => root() && rowIds().length > 0, 5000, 50), "the table");
    };
    const openGroup = async (k) => {
        if (group(k).getAttribute("aria-expanded") !== "true") group(k).click();
        assert.ok(await wvT.waitFor(() => group(k) && group(k).getAttribute("aria-expanded") === "true" && q("[data-wv-pp-bvals='" + k + "']"), 3000, 30), k + " open");
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const f of ["wvPpInfos", "wvPpListFilter", "wvPpFiltersParse", "wvPpFilterKeeps", "wvPpNewRecord", "wvPpMerge"]) {
            if (!lib || typeof lib[f] !== "function") wvT.absent("Zotero.Weavero.lib." + f);
        }
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleLoad", "_wvPeopleSetFilter", "_wvPeopleClearFilters", "_wvPeopleFilterClick", "_wvPeopleBrowseToggle",
            "_wvPeopleBrowseClick", "_wvPeopleTableIds"]) wvT.method(m);
        win = Zotero.getMainWindow();
        clearPrefs();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        recs = mkRecs();
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        clearPrefs();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find(t => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    // ---- the rules ----------------------------------------------------------------------

    it("include and exclude: values of a section are any-of, exclusions none-of, toggles both ways; Unknown is a value; people3's stored filters still read", function () {
        const infos = lib.wvPpInfos(recs);
        const stats = new Map([["p-ppl-r1", { n: 3, thesis: 1 }], ["p-ppl-r2", { n: 0, thesis: 0 }], ["p-ppl-r3", { n: 1, thesis: 0 }], ["p-ppl-r4", { n: 0, thesis: 0 }]]);
        const keep = (filters) => lib.wvPpListFilter(recs, infos, { show: "all", q: "", filters }, stats).map(r => r.last).sort();
        assert.deepEqual(keep({ country: ["DE", "US"] }), ["Quillfeather", "Ziegenhals"], "two countries: either");
        assert.deepEqual(keep({ not: { country: ["US"] } }), ["Aaronsen", "Brindlecombe", "Ziegenhals"], "the US excluded");
        assert.deepEqual(keep({ not: { country: [""] } }), ["Quillfeather", "Ziegenhals"], "Unknown excluded");
        assert.deepEqual(keep({ country: [""] }), ["Aaronsen", "Brindlecombe"], "Unknown included");
        assert.deepEqual(keep({ not: { noOrcid: true } }), ["Aaronsen", "Quillfeather"], "No ORCID iD excluded: those with one");
        assert.deepEqual(keep({ not: { inLib: true } }), ["Aaronsen", "Brindlecombe"], "In your libraries excluded");
        assert.deepEqual(keep({ position: ["professor"], not: { conflict: true } }), ["Quillfeather"], "AND across filters");
        assert.deepEqual(keep({ country: "DE" }), ["Ziegenhals"], "people3's one string");
        assert.deepEqual(lib.wvPpListFilter(recs, infos, { show: "all", q: "", filters: { not: { inLib: true } } }, null).map(r => r.last), [],
            "not counted yet: In your libraries cannot be told either way");
        assert.deepEqual(lib.wvPpFiltersParse("{\"noOrcid\":true,\"country\":\"DE\",\"not\":{\"inLib\":true,\"country\":[\"US\",\"US\"],\"web\":\"x\"},\"bogus\":1}"),
            { noOrcid: true, country: ["DE"], not: { inLib: true, country: ["US"] } });
        assert.deepEqual(lib.wvPpFiltersParse({ web: true, not: { web: true } }), { web: true }, "both ways at once: included");
        assert.deepEqual(lib.wvPpFiltersParse("nope"), {});
    });

    // ---- the left pane ------------------------------------------------------------------

    it("Browse by: Institution, Country, Position, closed; a group opens to its values with their counts, Unknown last", async function () {
        await openOn();
        assert.deepEqual(qa(".wv-pp-side [data-wv-pp-browse]").map(b => b.getAttribute("data-wv-pp-browse") + ":" + b.getAttribute("aria-expanded")),
            ["institution:false", "country:false", "position:false"]);
        assert.deepEqual(qa(".wv-pp-side [data-wv-pp-browse] .wv-pp-navlab").map(txt), ["Institution", "Country", "Position"]);
        assert.lengthOf(qa(".wv-pp-side .wv-pp-bval"), 0, "no value shown while closed");
        await openGroup("country");
        const vals = (k) => qa("[data-wv-pp-bvals='" + k + "'] .wv-pp-bval").map(b => b.getAttribute("data-wv-pp-fval") + ":" + txt(b.querySelector(".wv-pp-navlab")) + ":" + txt(b.querySelector(".wv-pp-navn")));
        assert.deepEqual(vals("country"), ["DE:Germany:1", "US:United States:1", ":Unknown:2"]);
        await openGroup("position");
        assert.deepEqual(vals("position"), ["Professor:Professor:2", ":Unknown:2"]);
        await openGroup("institution");
        assert.deepEqual(vals("institution"), ["Alpha Institute:Alpha Institute:1", "Beta Lab:Beta Lab:1", "University of Somewhere:University of Somewhere:1", ":Unknown:1"]);
        assert.match(String(value("country", "DE").getAttribute("title")).replace(/[⁨⁩]/g, ""), /Germany \(1\).*Alt\+click to exclude/, "the value's tooltip");
        group("institution").click();
        assert.ok(await wvT.waitFor(() => group("institution").getAttribute("aria-expanded") === "false" && !q("[data-wv-pp-bvals='institution']"), 3000, 30), "closed again");
    });

    it("a click filters the table to the value, Alt+click excludes it -- the value marked; the filters on show above the table, each with its x; Clear; saved", async function () {
        await openOn();
        await openGroup("country");
        await openGroup("position");
        click(value("country", "DE"));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r3"]), 3000, 30), "Germany: " + ids());
        assert.equal(value("country", "DE").getAttribute("data-state"), "in", "the value marked");
        assert.deepEqual(prefFilters(), { country: ["DE"] }, "saved");
        assert.ok(pill("country", "DE"), "the filter on, above the table");
        assert.equal(txt(pill("country", "DE").querySelector(".wv-pp-fpill-lab")), "Country: Germany");
        click(value("country", "US"));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r1", "p-ppl-r3"]), 3000, 30), "either country: " + ids());
        click(value("country", "DE"));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r1"]), 3000, 30), "clicked again: off");
        assert.notOk(value("country", "DE").getAttribute("data-state"));
        // Alt+click: exclude.
        click(value("country", "US"), true);
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r2", "p-ppl-r3", "p-ppl-r4"]), 3000, 30), "the US excluded: " + ids());
        assert.equal(value("country", "US").getAttribute("data-state"), "out", "marked excluded");
        assert.equal(pill("country", "US").getAttribute("data-state"), "out");
        assert.equal(txt(pill("country", "US").querySelector(".wv-pp-fpill-lab")), "Country: not United States");
        click(value("position", "Professor"));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r4"]), 3000, 30), "and a Professor: " + ids());
        assert.deepEqual(prefFilters(), { position: ["Professor"], not: { country: ["US"] } }, "saved, exclusions included");
        // A pill's x takes its filter off.
        click(pill("country", "US").querySelector(".wv-pp-fpill-x"));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r1", "p-ppl-r4"]), 3000, 30), "the exclusion off: " + ids());
        assert.notOk(pill("country", "US"));
        // Clear: every filter off.
        click(value("country", "DE"), true);
        assert.ok(await wvT.waitFor(() => q(".wv-pp-factive [data-wv-pp-fclear]"), 3000, 30), "Clear, with two filters on");
        click(q(".wv-pp-factive [data-wv-pp-fclear]"));
        assert.ok(await wvT.waitFor(() => shown(ALL), 3000, 30), "cleared");
        assert.isNull(q(".wv-pp-factive"), "nothing on, nothing shown");
        assert.deepEqual(prefFilters(), {});
        // A value clicked from a researcher's page: the table again.
        wv._wvPeopleTabOpen(win, { personID: "p-ppl-r2" });
        assert.ok(await wvT.waitFor(() => q(".wv-pp-main[data-wv-pp-record='p-ppl-r2']"), 3000, 30));
        click(value("position", ""));
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r2", "p-ppl-r3"]), 3000, 30), "Unknown position, in the table: " + ids());
        wv._wvPeopleClearFilters(win);
    });

    it("a filter of an earlier build left on (the funnel's PhD country, its toggles) shows above the table too, and goes with its x", async function () {
        await openOn();
        wv._wvPeopleSetFilter(win, "phdCountry", "DE");
        wv._wvPeopleFilterClick(win, "advisor", null, true);
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r3"]), 3000, 30), ids());
        assert.ok(pill("phdCountry", "DE"), "PhD country, shown");
        assert.equal(txt(pill("advisor").querySelector(".wv-pp-fpill-lab")), "Not: Has advisors");
        click(pill("phdCountry", "DE").querySelector(".wv-pp-fpill-x"));
        click(pill("advisor").querySelector(".wv-pp-fpill-x"));
        assert.ok(await wvT.waitFor(() => shown(ALL), 3000, 30), "both off: " + ids());
    });

    it("the filters, exclusions included, are saved: a new view starts from them, the values marked as they were", async function () {
        await openOn();
        wv._wvPeopleFilterClick(win, "country", "DE", false);
        wv._wvPeopleFilterClick(win, "birth", "1970", true);
        wv._wvPeopleFilterClick(win, "advisor", null, true);
        assert.deepEqual(prefFilters(), { country: ["DE"], not: { advisor: true, birth: ["1970"] } });
        wv._wvPeopleTabClose(win);
        await sleep(200);
        wv._wvPeopleTabOpen(win, {});
        assert.ok(await wvT.waitFor(() => shown(["p-ppl-r3"]), 5000, 50), "the same list: " + ids());
        await openGroup("country");
        assert.equal(value("country", "DE").getAttribute("data-state"), "in");
        assert.equal(qa(".wv-pp-factive .wv-pp-fpill").length, 3, "the three filters on");
        // people3's setter still works: a value alone, a toggle on.
        wv._wvPeopleClearFilters(win);
        wv._wvPeopleSetFilter(win, "phdCountry", "DE");
        assert.deepEqual(prefFilters(), { phdCountry: ["DE"] });
        wv._wvPeopleClearFilters(win);
    });
});
