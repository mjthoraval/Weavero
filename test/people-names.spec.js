/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, wvT */

// The Researchers tab: a researcher's name and its other forms (people.ts,
// branch people4; MJT 2026-11-24, reviewing 1.3.0-dev.85):
//   - "I should be able to edit the name": a click on the page title turns it
//     into two fields, Last name and First name, as Zotero edits a creator;
//     Enter saves, Escape cancels, a click outside saves; the old name is
//     REPLACED (not kept as another form); the typed name is the user's
//     (`nameBy: "me"`) and no Refresh changes it; the list, the Links rows and
//     the family tree follow at once; an empty last name is refused.
//   - "Other forms of the name should also be displayed. I think that this
//     information may be available from ORCID?": a row "Other names" in the
//     Identifiers section, each form with its sources -- ORCID (the record's
//     name, its credit name, its other names), OpenAlex (display_name,
//     display_name_alternatives), Wikidata (aliases, skos:altLabel; the label),
//     "your items" (how your libraries' creators write the researcher) -- each
//     with Reject, and Add... for the user's own. Filled at the next Refresh,
//     nothing fetched by this feature. The forms not rejected count when an
//     author is matched by name (In your libraries, Publications, the author's
//     right-click menu); a rejected one never does.
// Written before the code (people4.1): every test failed on 1.3.0-dev.85.
// Nothing goes to the network: the answers below were RECORDED from the live
// services on 2026-11-24 (public researchers only, a generic User-Agent) and
// trimmed to what is read -- except ORCID's credit name: neither recorded record
// (ORCID's demonstration record, Josiah Carberry; Alban Sauret) had one, so the
// credit-name below is written in the shape of the recorded given-names
// ({ value }), per ORCID's personal-details-3.0.xsd.

describe("Weavero — Researchers: the name, edited; its other forms", function () {
    this.timeout(180000);
    let wv, lib, win, doc, ZT;
    const made = [];
    const calls = [];
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const txt = (el) => String(el && el.textContent || "").replace(/[⁨⁩]/g, "");
    const forms = (lines) => lines.filter(l => l.fact === "name.other").map(l => l.value + "|" + l.source + "|" + l.status);

    // ---- recorded answers (2026-11-24) ---------------------------------------------
    // ORCID pub.orcid.org/v3.0/0000-0002-1825-0097/record (ORCID's public demonstration
    // record): person.name and person["other-names"] ("Also known as").
    const ORCID_CARBERRY = {"person":{"name":{"given-names":{"value":"Josiah"},"family-name":{"value":"Carberry"},"credit-name":null,"visibility":"public"},"other-names":{"other-name":[{"content":"Josiah Stinkney Carberry","visibility":"public","display-index":3},{"content":"J. Carberry","visibility":"public","display-index":2},{"content":"J. S. Carberry","visibility":"public","display-index":1}]},"researcher-urls":{"researcher-url":[]}},"activities-summary":{}};
    // ORCID pub.orcid.org/v3.0/0000-0001-7874-5983/record: the name, no other names.
    const ORCID_SAURET = {"person":{"name":{"given-names":{"value":"Alban"},"family-name":{"value":"Sauret"},"credit-name":null,"visibility":"public"},"other-names":{"other-name":[]},"researcher-urls":{"researcher-url":[]}},"activities-summary":{}};
    // OpenAlex api.openalex.org/authors/A5030022491?select=id,display_name,display_name_alternatives,orcid
    const OA_SAURET = {"id":"https://openalex.org/A5030022491","display_name":"Alban Sauret","display_name_alternatives":["A Sauret","A. SAURET","A. Sauret","Alban Sauret","Sauret, A","Sauret, Alban"],"orcid":"https://orcid.org/0000-0001-7874-5983"};
    // OpenAlex api.openalex.org/authors/orcid:0000-0003-4138-2255?select=... (Detlef Lohse)
    const OA_LOHSE = {"id":"https://openalex.org/A5066010665","display_name":"Detlef Lohse","display_name_alternatives":["D Lohse","D. LOHSE","D. Lohse","DETLEF LOHSE","Detlef Lohse","Lohse, D.","Lohse, D. (Detlef)","Lohse, D.L.","Lohse, Detlef"],"orcid":"https://orcid.org/0000-0003-4138-2255"};
    // Wikidata, WDQS's answer to the people4 query by ORCID 0000-0002-1825-0097
    // (Josiah Carberry, Q6290611): his aliases (en, es) and English label, one a row.
    const WD_CARBERRY = {"head":{"vars":["p","pOrcid","pIdref","pOa","pBirth","pName","rel","o","oLabel","oOrcid","oIdref","oOa"]},"results":{"bindings":[{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"en","type":"literal","value":"Josiah S. Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"es","type":"literal","value":"Josiah Stinkney Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"es","type":"literal","value":"Josiah Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"en","type":"literal","value":"Josiah Stinkney Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"en","type":"literal","value":"Josiah Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"en","type":"literal","value":"J. S. Carberry"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q6290611"},"pOrcid":{"type":"literal","value":"0000-0002-1825-0097"},"pName":{"xml:lang":"en","type":"literal","value":"J. Carberry"}}]}};
    // Wikidata, the QLever mirror's answer to the same query by Detlef Lohse's ORCID iD:
    // the UNION's rows -- a link a row, a name a row -- side by side.
    const WD_LOHSE = {"head":{"vars":["p","pOrcid","pIdref","pOa","pBirth","pName","rel","o","oLabel","oOrcid","oIdref","oOa"]},"results":{"bindings":[{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P184"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q121135"},"oLabel":{"type":"literal","value":"Siegfried Großmann","xml:lang":"en"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P184"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q121135"},"oLabel":{"type":"literal","value":"Siegfried Großmann","xml:lang":"mul"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P185"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q47431842"},"oLabel":{"type":"literal","value":"Devaraj van der Meer","xml:lang":"en"},"oOrcid":{"type":"literal","value":"0000-0003-4420-9714"},"oIdref":{"type":"literal","value":"200283456"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P185"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q47272469"},"oLabel":{"type":"literal","value":"Stephan Gekle","xml:lang":"mul"},"oOrcid":{"type":"literal","value":"0000-0001-5597-1160"},"oIdref":{"type":"literal","value":"203601505"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"rel":{"type":"uri","value":"http://www.wikidata.org/prop/direct/P185"},"o":{"type":"uri","value":"http://www.wikidata.org/entity/Q47272469"},"oLabel":{"type":"literal","value":"Stephan Gekle","xml:lang":"en"},"oOrcid":{"type":"literal","value":"0000-0001-5597-1160"},"oIdref":{"type":"literal","value":"203601505"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"pName":{"type":"literal","value":"Detlef Lohse","xml:lang":"mul"}},{"p":{"type":"uri","value":"http://www.wikidata.org/entity/Q1201308"},"pOrcid":{"type":"literal","value":"0000-0003-4138-2255"},"pIdref":{"type":"literal","value":"154994677"},"pBirth":{"datatype":"http://www.w3.org/2001/XMLSchema#dateTime","type":"literal","value":"1963-09-15T00:00:00Z"},"pName":{"type":"literal","value":"Detlef Lohse","xml:lang":"en"}}]}};

    // The mocked services for the Refresh of Sauret's record (A5030022491).
    const answer = (url) => {
        const err = (status) => { const e = /** @type {any} */ (new Error("HTTP " + status)); e.status = status; return e; };
        if (url.startsWith("https://api.openalex.org/authors/A5030022491")) return clone(OA_SAURET);
        if (url.startsWith("https://api.openalex.org/works?filter=author.id:")) return { meta: { count: 0 }, results: [] };
        if (url === "https://pub.orcid.org/v3.0/0000-0001-7874-5983/record") return clone(ORCID_SAURET);
        if (url.startsWith("https://theses.fr/api/v1/personnes/recherche/")) return { totalHits: 0, personnes: [] };
        if (url.startsWith("https://query.wikidata.org/sparql") || url.startsWith("https://qlever.dev/api/wikidata")) return { head: {}, results: { bindings: [] } };
        throw err(404);
    };

    // ---- the records (synthetic names, but Sauret's: the recorded answers are his) -----
    // R1 Quillfeather, Ada: ORCID iD; another form "Ada Q. Bramblewood" (ORCID);
    //    advisor of R2 (R2's link names her by her ORCID iD).
    // R2 Ziegenhals, Clara: advisor link to R1.
    // R3 Sauret, Alban: OpenAlex A5030022491, nothing else yet.
    const R1ORCID = "0000-0002-0000-0011";
    const mkRecs = () => {
        const line = (fact, value, source, more) => Object.assign({ fact, value, source, status: "suggested" }, more || {});
        const r1 = lib.wvPpNewRecord("p-ppn-r1", "Quillfeather", "Ada", new Date("2026-01-01T10:00:00Z"));
        lib.wvPpMerge(r1, [line("orcid", R1ORCID, "orcid"), line("name.other", "Ada Q. Bramblewood", "orcid")], "2026-06-01");
        const r2 = lib.wvPpNewRecord("p-ppn-r2", "Ziegenhals", "Clara", new Date("2026-02-01T10:00:00Z"));
        lib.wvPpMerge(r2, [line("link.advisor", "Ada Quillfeather", "thesesfr", { ref: { orcid: R1ORCID } })], "2026-06-01");
        const r3 = lib.wvPpNewRecord("p-ppn-r3", "Sauret", "Alban", new Date("2026-03-01T10:00:00Z"));
        lib.wvPpMerge(r3, [line("openalex", "A5030022491", "openalex")], "2026-06-01");
        return [r1, r2, r3];
    };
    let recs = null;

    const openOn = async (sel) => {
        await wv._wvPeopleLoad();
        const db = wv._wvPeopleDB;
        db.people.length = 0;
        db.people.push(...recs);
        // The page in its edit mode: the sources, Add and Reject are its (MJT 2026-11-26).
        wv._wvPeopleTabOpen(win, sel ? { personID: sel, edit: true } : {});
        assert.ok(await wvT.waitFor(() => root() && q("[data-wv-pp-record='" + (sel || "") + "']") || (!sel && root()), 5000, 50), "the tab on " + sel);
    };
    // The list is the table now (the Google Contacts design, step 2): its names in its order.
    const rowNames = () => wv._wvPeopleTableNames(win);
    const title = () => q(".wv-pp-head .wv-pp-name");
    const editor = () => q(".wv-pp-nameedit");
    const field = (k) => q(".wv-pp-nameedit input[data-wv-pp-name='" + k + "']");
    const type = (inp, v) => { inp.value = v; inp.dispatchEvent(new win.Event("input", { bubbles: true })); };
    const key = (inp, k) => inp.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const f of ["wvPpNewRecord", "wvPpMerge", "wvPpAct", "wvPpFromOrcid", "wvPpFromOpenAlexAuthor", "wvPpFromWikidata", "wvPpWikidataQuery", "wvPpNormalizeRecord", "wvPpLibIndexBuild", "wvPpLibStatOf"]) {
            if (!lib || typeof lib[f] !== "function") wvT.absent("Zotero.Weavero.lib." + f);
        }
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleLoad", "_wvPeopleRefresh", "_wvPeopleFindByName", "_wvPeopleRename", "_wvPeopleNameEditStart", "_wvPeopleLibIndexBuild", "_wvPeopleLibStats"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        for (const k of ["people.sort", "people.show", "people.filters", "people.names.list", "people.names.title", "people.names.links", "people.names.tree"]) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        wv._wvPeopleGet = async (url) => { calls.push(String(url)); return answer(String(url)); };
        recs = mkRecs();
    });

    after(async function () {
        try { delete wv._wvPeopleGet; } catch (e) {}
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        try { await IOUtils.remove(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-cache"), { recursive: true, ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wvT.erase(...made);
        try { ZT.select(ZT._tabs.find(t => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    // ---- the sources' forms of the name ---------------------------------------------

    it("each source's forms of the name, read from its recorded answer: ORCID (name, credit name, other names), OpenAlex (display_name, display_name_alternatives), Wikidata (aliases and label, through the query's UNION)", function () {
        const orc = lib.wvPpFromOrcid(clone(ORCID_CARBERRY), "0000-0002-1825-0097");
        assert.deepEqual(forms(orc), ["Josiah Carberry|orcid|confirmed", "Josiah Stinkney Carberry|orcid|confirmed", "J. Carberry|orcid|confirmed", "J. S. Carberry|orcid|confirmed"],
            "the record's name, then its other names in their order");
        const withCredit = clone(ORCID_CARBERRY);
        withCredit.person.name["credit-name"] = { value: "Josiah S. Carberry" };
        assert.include(forms(lib.wvPpFromOrcid(withCredit, "0000-0002-1825-0097")), "Josiah S. Carberry|orcid|confirmed", "the credit name");
        assert.ok(orc.filter(l => l.fact === "name.other").every(l => l.url === "https://orcid.org/0000-0002-1825-0097"), "each links to the ORCID record");
        const oa = lib.wvPpFromOpenAlexAuthor(clone(OA_SAURET));
        assert.deepEqual(forms(oa.lines), ["Alban Sauret|openalex|suggested", "A Sauret|openalex|suggested"],
            "one line per FORM: \"A Sauret\", \"A. SAURET\", \"A. Sauret\", \"Sauret, A\" are one; \"Sauret, Alban\" is the display name");
        const lo = lib.wvPpFromOpenAlexAuthor(clone(OA_LOHSE));
        assert.deepEqual(forms(lo.lines).map(s => s.split("|")[0]), ["Detlef Lohse", "D Lohse", "Lohse, D. (Detlef)", "Lohse, D.L."]);
        const q1 = lib.wvPpWikidataQuery({ orcid: "0000-0002-1825-0097" });
        assert.include(q1, "skos:altLabel ?pName", "the aliases");
        assert.include(q1, "UNION", "names and links in one query, as rows that add up");
        assert.include(q1, "PREFIX skos: <http://www.w3.org/2004/02/skos/core#>", "the prefix written out (QLever has none of its own)");
        const wc = lib.wvPpFromWikidata(clone(WD_CARBERRY));
        assert.equal(wc.qid, "Q6290611");
        assert.deepEqual(forms(wc.lines), ["Josiah S. Carberry|wikidata|suggested", "Josiah Stinkney Carberry|wikidata|suggested", "Josiah Carberry|wikidata|suggested",
            "J. S. Carberry|wikidata|suggested", "J. Carberry|wikidata|suggested"], "each alias once, whatever its language");
        const wl = lib.wvPpFromWikidata(clone(WD_LOHSE));
        assert.deepEqual(forms(wl.lines), ["Detlef Lohse|wikidata|suggested"]);
        assert.deepEqual(wl.lines.filter(l => l.fact === "link.advisor").map(l => l.value), ["Siegfried Großmann"], "the links' rows read as before");
        assert.deepEqual(wl.lines.filter(l => l.fact === "link.student").map(l => l.value).sort(), ["Devaraj van der Meer", "Stephan Gekle"]);
        assert.deepEqual(wl.lines.filter(l => l.fact === "birth.year").map(l => l.value), ["1963"]);
        // The record's own variants of people2/3 (OpenAlex's names, the only writer
        // of that list) become OpenAlex's forms; the name itself is not one.
        const old = lib.wvPpNormalizeRecord({ id: "p-old", last: "Sauret", first: "Alban", variants: ["A Sauret", "Alban Sauret", "Sauret, Alban J."], lines: [] });
        assert.deepEqual(forms(old.lines), ["A Sauret|openalex|suggested", "Sauret, Alban J.|openalex|suggested"]);
        assert.deepEqual(old.variants, [], "moved, not kept twice");
        // A form that came again later is never "new" (forms add up, no conflict).
        const r = lib.wvPpNewRecord("p-x", "Sauret", "Alban");
        lib.wvPpMerge(r, clone(oa.lines), "2026-11-01");
        lib.wvPpMerge(r, [{ fact: "name.other", value: "Sauret, Al.", source: "wikidata" }], "2026-11-02");
        assert.isTrue(r.lines.filter(l => l.fact === "name.other").every(l => !l.isNew), "no new mark on a form");
    });

    it("matching uses every form not rejected; a creator written as a rejected form never counts (In your libraries)", function () {
        const creators = [{ id: 1, last: "Quillfeather", first: "Ada" }, { id: 2, last: "Quillfeather", first: "A." }, { id: 3, last: "Bramblewood", first: "A. Q." },
            { id: 4, last: "Bramblewood", first: "Ada Q." }, { id: 5, last: "Bramblewood", first: "Bertha" }];
        const pairs = [1, 2, 3, 4, 5].map(i => ({ cid: i, item: 10 + i, authored: true, thesis: false }));
        const ix = lib.wvPpLibIndexBuild(creators, pairs);
        const r = clone(recs[0]);
        const items = () => lib.wvPpLibStatOf(r, ix).items.slice().sort();
        assert.deepEqual(items(), [11, 12, 13, 14], "her name (Ada, A.) and the form Ada Q. Bramblewood (A. Q., Ada Q.) -- not Bertha");
        lib.wvPpMerge(r, [{ fact: "name.other", value: "Quillfeather, A.", source: "items" }], "2026-11-24");
        lib.wvPpAct(r, "name.other", "Quillfeather, A.", "reject");
        assert.deepEqual(items(), [11, 13, 14], "\"Quillfeather, A.\" rejected: that creator is someone else");
        lib.wvPpAct(r, "name.other", "Ada Q. Bramblewood", "reject");
        assert.deepEqual(items(), [11], "the form rejected: it no longer counts");
        lib.wvPpAct(r, "name.other", "Ada Q. Bramblewood", "restore");
        assert.deepEqual(items(), [11, 13, 14], "restored");
    });

    // ---- the page ----------------------------------------------------------------------

    it("the Other names row, under Identifiers: each form with its sources, Reject, Add... -- and the author's menu finds the researcher by a form", async function () {
        await openOn("p-ppn-r1");
        const row = () => q("[data-wv-pp-sec='ids'] [data-wv-pp-fact='name.other']");
        assert.ok(row(), "a row in the Identifiers section");
        const labels = qa("[data-wv-pp-sec='ids'] .wv-pp-flabel").map(e => e.getAttribute("data-wv-pp-flabel"));
        assert.equal(labels[labels.length - 1], "name.other", "after the identifiers: " + labels);
        assert.equal(txt(q("[data-wv-pp-flabel='name.other']")), "Other names");
        const val = (v) => row() && row().querySelector(".wv-pp-val[data-value=\"" + v + "\"]");
        assert.ok(val("Ada Q. Bramblewood"), "the form");
        assert.deepEqual(Array.from(val("Ada Q. Bramblewood").querySelectorAll(".wv-pp-src")).map(c => c.getAttribute("data-source")), ["orcid"], "tagged with its source");
        const btns = Array.from(val("Ada Q. Bramblewood").querySelectorAll("[data-wv-pp-do]")).map(b => b.getAttribute("data-wv-pp-do"));
        assert.include(btns, "reject", "Reject");
        assert.notInclude(btns, "keep", "no Keep: every form not rejected counts already");
        // The author's right-click menu: an author written as the form is this researcher.
        const m = wv._wvPeopleFindByName("Bramblewood", "Ada Q.");
        assert.deepEqual(m.map(x => [x.rec.id, x.match]), [["p-ppn-r1", "exact"]], "found by the form");
        // Add...: the user's own form.
        const add = row().querySelector("[data-wv-pp-do='add']");
        assert.ok(add, "Add...");
        add.click();
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-editing='name.other'] input"), 3000, 30), "the field");
        const inp = q("[data-wv-pp-editing='name.other'] input");
        inp.value = "Ada Quillfeather-Byrne";
        key(inp, "Enter");
        assert.ok(await wvT.waitFor(() => val("Ada Quillfeather-Byrne"), 3000, 30), "added");
        assert.deepEqual(Array.from(val("Ada Quillfeather-Byrne").querySelectorAll(".wv-pp-src")).map(c => [c.getAttribute("data-source"), txt(c)]), [["me", "you"]], "the user's own");
        // Reject.
        val("Ada Q. Bramblewood").querySelector("[data-wv-pp-do='reject']").click();
        assert.ok(await wvT.waitFor(() => val("Ada Q. Bramblewood") && val("Ada Q. Bramblewood").getAttribute("data-status") === "rejected", 3000, 30), "rejected, still listed (struck through)");
        assert.deepEqual(wv._wvPeopleFindByName("Bramblewood", "Ada Q."), [], "a rejected form finds nobody");
        assert.equal(recs[0].lines.find(l => l.fact === "name.other" && l.value === "Ada Q. Bramblewood").status, "rejected", "written in the record");
    });

    it("Refresh fills Other names from every source and from your items (\"your items\"); opening a page fetches nothing; a rejected form stays rejected; the forms count in your libraries and in Publications", async function () {
        const it1 = await wvT.createItem("journalArticle", { title: "WV-TEST ppn Sauret A" });
        it1.setCreators([{ lastName: "Sauret", firstName: "A.", creatorType: "author" }]);
        await it1.saveTx();
        made.push(it1);
        await wv._wvPeopleLibIndexBuild();
        calls.length = 0;
        await openOn("p-ppn-r3");
        await sleep(300);
        assert.deepEqual(calls, [], "opening the page fetched nothing");
        const r3 = recs[2];
        assert.deepEqual(r3.lines.filter(l => l.fact === "name.other"), [], "no form before a Refresh");
        await wv._wvPeopleRefresh("p-ppn-r3");
        assert.isAbove(calls.length, 0, "the Refresh asked the (stubbed) services");
        const f = () => r3.lines.filter(l => l.fact === "name.other").map(l => l.value + "|" + l.source + "|" + l.status).sort();
        assert.deepEqual(f(), ["A Sauret|openalex|suggested", "Sauret, A.|items|suggested"], "OpenAlex's other form and the item's spelling; the name itself is none of them");
        const row = () => q("[data-wv-pp-fact='name.other'] .wv-pp-val[data-value='A Sauret']");
        assert.ok(await wvT.waitFor(() => row(), 3000, 30), "drawn");
        assert.deepEqual(Array.from(row().querySelectorAll(".wv-pp-src")).map(c => [c.getAttribute("data-source"), txt(c).split(" · ")[0]]),
            [["openalex", "OpenAlex"], ["items", "your items"]], "one form, its two sources");
        assert.equal(r3.last + "|" + r3.first, "Sauret|Alban", "the name itself unchanged");
        // In your libraries / Publications by the forms.
        const stat = () => { const s = wv._wvPeopleLibStats(); const x = s && s.get("p-ppn-r3"); return x ? x.n : null; };
        assert.ok(await wvT.waitFor(() => stat() === 1, 5000, 50), "the item counts: " + stat());
        // Reject the form: both its lines; the item no longer counts.
        row().querySelector("[data-wv-pp-do='reject']").click();
        assert.ok(await wvT.waitFor(() => r3.lines.filter(l => l.fact === "name.other").every(l => l.status === "rejected"), 3000, 30), "rejected, every source of it");
        assert.ok(await wvT.waitFor(() => stat() === 0, 5000, 50), "\"Sauret, A.\" is no longer him: " + stat());
        await wv._wvPeopleRefresh("p-ppn-r3");
        assert.isTrue(r3.lines.filter(l => l.fact === "name.other").every(l => l.status === "rejected"), "a Refresh never brings it back");
    });

    // ---- the name, edited ---------------------------------------------------------------

    it("a click on the title edits the name in two fields, Last name and First name; Enter saves -- replaced, the user's -- and the list, the links and the tree follow at once", async function () {
        await openOn("p-ppn-r1");
        assert.equal(txt(title()), "Quillfeather, Ada");
        assert.ok(title().getAttribute("title"), "the title says it can be edited");
        title().click();
        assert.ok(await wvT.waitFor(() => editor(), 3000, 30), "the editor");
        assert.deepEqual([field("last").value, field("first").value], ["Quillfeather", "Ada"], "the name in its two fields");
        assert.deepEqual([field("last").getAttribute("placeholder"), field("first").getAttribute("placeholder")], ["Last name", "First name"]);
        assert.ok(await wvT.waitFor(() => doc.activeElement === field("last"), 2000, 30), "the last name focused");
        type(field("last"), "Byrne");
        key(field("last"), "Enter");
        assert.ok(await wvT.waitFor(() => !editor() && txt(title()) === "Byrne, Ada", 3000, 30), "saved: " + txt(title()));
        const r1 = recs[0];
        assert.deepEqual([r1.last, r1.first, r1.nameBy], ["Byrne", "Ada", "me"], "the record, the user's name");
        assert.isFalse(r1.lines.some(l => l.fact === "name.other" && /Quillfeather, Ada|Ada Quillfeather$/.test(l.value)), "the old name REPLACED, not kept as a form");
        assert.ok(q(".wv-pp-head [data-wv-pp-namesrc='me']"), "marked as the user's");
        assert.deepEqual(rowNames(), ["Byrne, Ada", "Sauret, Alban", "Ziegenhals, Clara"], "the list, sorted again");
        wv._wvPeopleTabOpen(win, { personID: "p-ppn-r2" });
        assert.ok(await wvT.waitFor(() => q("[data-wv-pp-fact='link.advisor'] .wv-pp-vtext"), 3000, 30));
        assert.equal(txt(q("[data-wv-pp-fact='link.advisor'] .wv-pp-vtext")), "Byrne, Ada", "the Links row of the student follows");
        assert.deepEqual(qa("[data-wv-pp-sec='tree'] .wv-pp-lt-card[data-wv-pp-node='advisor'] .wv-pp-lt-name").map(e => e.textContent), ["Byrne, Ada"], "the family tree too");
        // On disk (the write lands a moment after the redraw).
        let d1 = null;
        for (let i = 0; i < 60 && !(d1 && d1.nameBy === "me"); i++) {
            try { d1 = JSON.parse(await IOUtils.readUTF8(storePath())).people.find(p => p.id === "p-ppn-r1"); } catch (e) { d1 = null; }
            if (!(d1 && d1.nameBy === "me")) await sleep(50);
        }
        assert.deepEqual(d1 && [d1.last, d1.first, d1.nameBy], ["Byrne", "Ada", "me"], "people.json");
    });

    it("Escape cancels; a click outside saves; an empty last name is refused", async function () {
        await openOn("p-ppn-r1");
        const r1 = recs[0];
        title().click();
        assert.ok(await wvT.waitFor(() => editor(), 3000, 30));
        type(field("first"), "Adalind");
        key(field("first"), "Escape");
        assert.ok(await wvT.waitFor(() => !editor(), 3000, 30), "closed");
        assert.equal(r1.first, "Ada", "Escape: nothing changed");
        // A click outside the two fields: saved.
        title().click();
        assert.ok(await wvT.waitFor(() => editor(), 3000, 30));
        type(field("first"), "Adah");
        q(".wv-pp-main").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
        assert.ok(await wvT.waitFor(() => !editor() && r1.first === "Adah", 3000, 30), "a click outside saves: " + r1.first);
        // A click inside one of the fields does not.
        title().click();
        assert.ok(await wvT.waitFor(() => editor(), 3000, 30));
        field("first").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
        await sleep(100);
        assert.ok(editor(), "a click in a field keeps editing");
        // Empty last name: Enter refuses and keeps the fields.
        type(field("last"), "   ");
        key(field("last"), "Enter");
        await sleep(150);
        assert.ok(editor(), "still editing");
        assert.ok(q(".wv-pp-nameerr") && !q(".wv-pp-nameerr").hidden, "says why");
        assert.equal(field("last").getAttribute("aria-invalid"), "true");
        assert.equal(r1.last, "Byrne", "refused");
        // ... and a click outside with an empty last name changes nothing either.
        q(".wv-pp-main").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
        assert.ok(await wvT.waitFor(() => !editor(), 3000, 30), "closed");
        assert.deepEqual([r1.last, r1.first], ["Byrne", "Adah"], "the name as it was");
        assert.match(txt(q(".wv-pp-status")), /last name/i, "the status line says why");
        // The keyboard: Enter on the title opens the editor.
        title().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        assert.ok(await wvT.waitFor(() => editor(), 3000, 30), "Enter on the title");
        key(field("last"), "Escape");
        assert.ok(await wvT.waitFor(() => !editor(), 3000, 30));
    });

    it("a Refresh never changes a name the user typed", async function () {
        const r3 = recs[2];
        assert.ok(await wv._wvPeopleRename("p-ppn-r3", "Sauret-Martin", "A."), "renamed");
        assert.deepEqual([r3.last, r3.first, r3.nameBy], ["Sauret-Martin", "A.", "me"]);
        await wv._wvPeopleRefresh("p-ppn-r3");
        assert.deepEqual([r3.last, r3.first, r3.nameBy], ["Sauret-Martin", "A.", "me"], "OpenAlex and ORCID say Alban Sauret; the typed name stays");
        assert.include(r3.lines.filter(l => l.fact === "name.other").map(l => l.value), "Alban Sauret", "the sources' name is another form now");
        assert.isFalse(await wv._wvPeopleRename("p-ppn-r3", "", "x"), "an empty last name refused");
        assert.equal(r3.last, "Sauret-Martin");
    });
});
