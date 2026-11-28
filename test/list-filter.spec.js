/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// Search and sort for the long item-pane lists (src/lib/list-filter.ts, the grammar, chips and
// orders; src/modules/list-filter.ts, the header's sort and the search line; plan
// work/citations-plan-2026-11-21.md M4, the design MJT approved on 2026-11-21: "Ok for the
// design you propose").
//
// Since 1.2.1-lfsort.1 (MJT 2026-11-22, the References header in view: "Can you move the sort
// options at the same level as the funnel to filter? Try making a design similar to sorting the
// annotations in a PDF reader. The funnel is quite empty at the moment. Remove it until I have
// more clear ideas on what to put in it."), on lists of 8 rows or more, the section's header
// holds, before the twisty: the SORT -- the reader's annotation sort bar (reader-panels.ts
// _wvAnnSortBarEnsure): a dropdown chip naming the field, its menu ("Sort by", the fields, a tick
// on the current one, "(default)" on the list's own) and, for a field with a direction, the ↑ / ↓
// chip that turns it round -- then the MAGNIFIER (Zotero's own header-button slot), which opens
// the search line ("Search 12 papers…", "2 of 12"). No funnel, no line of filter chips: their
// engine stays behind list-filter.ts WV_LF_FILTERS_UI, and nothing can hide a row through it. A
// line stays open while its text narrows the list, the magnifier then pressed; a click on it
// clears the text and closes the line. The sort is no filter: remembered per section kind
// (weavero.listSort.<kind>: "paper" or "<field>:<dir>", an older one-word value read as what it
// meant). Text goes when the item changes. The whole list is searched and sorted in memory, the
// section's 50 rows and "Show N more" then apply to the result; a list of 20,000 within plan §0's
// budgets. References and Cited by alike, in the library's pane and beside a PDF; the header fits
// the pane's minimum width -- the field's label yields first, References' count chips keep the
// title's line as long as that frees enough, else take their own row, never cut.
//
// The Cited by fixture: a cited item C and twelve real papers citing it (eight journal articles,
// three theses, a book), in indexes of the spec's own swapped in for the plugin's (as
// test/cited-by.spec.js's stress case does); D is cited by seven of them, E by eight. A
// References list for C (ten entries, six in the library) is handed to the library's pane by
// overriding the two methods that find a paper's list, for the header tests.

describe("Weavero — search and sort for long lists", function () {
    this.timeout(300000);
    const BUTTON = "wv-lf-toggle";
    const FBUTTON = "wv-lf-filter";
    let wv, L, win, user;
    const made = [];
    let C, D, E, P = [];
    let was = null, rix = null, ix = null;
    const FAKE = 1700000000;

    // Twelve citing papers: [type, title, first author, year, publication, date added].
    const PAPERS = [
        ["journalArticle", "Drop impact on viscous liquid films", "Sanjay", 2023, "Journal of Fluid Mechanics", "2024-01-05 10:00:00"],
        ["journalArticle", "Viscous free-surface flows of thin sheets", "Sanjay", 2022, "Journal of Fluid Mechanics", "2021-06-01 10:00:00"],
        ["journalArticle", "When does an impacting drop stop bouncing?", "Sanjay", 2023, "Physical Review Letters", "2023-03-01 10:00:00"],
        ["journalArticle", "Non-Galilean Taylor–Culick law governs sheet dynamics", "Wang", 2023, "Journal of Fluid Mechanics", "2022-01-01 10:00:00"],
        ["journalArticle", "Splashing of drops on dry surfaces", "Lee", 2015, "Physical Review E", "2016-01-01 10:00:00"],
        ["journalArticle", "Bouncing drops on a liquid bath", "Couder", 2005, "Physical Review Letters", "2010-01-01 10:00:00"],
        ["journalArticle", "Leidenfrost drops on a heated plate", "Quéré", 2013, "Annual Review of Fluid Mechanics", "2014-01-01 10:00:00"],
        ["journalArticle", "A review of drop impact on solid surfaces", "Josserand", 2016, "Annual Review of Fluid Mechanics", "2017-05-01 10:00:00"],
        ["thesis", "Modélisation et simulation des impacts de gouttes et de sprays", "Fereka", 2025, "", "2025-02-01 10:00:00"],
        ["thesis", "Drop impact on soft solids", "Kim", 2021, "", "2022-07-01 10:00:00"],
        ["thesis", "Thin films and their slow drainage", "Ortiz", 2019, "", "2020-01-01 10:00:00"],
        ["book", "Capillarity and wetting phenomena", "de Gennes", 2004, "", "2009-01-01 10:00:00"],
    ];
    // The list's own order (newest first, then by title): 9, 1, 4, 3, 2, 10, 11, 8, 5, 7, 6, 12.
    const NATURAL = [8, 0, 3, 2, 1, 9, 10, 7, 4, 6, 5, 11];
    /** Each field both ways over the twelve, as indexes into P. Most cited: Couder's (4 papers),
     *  de Gennes's (2), Lee's (1); ties newest first, then as listed. Title and first author:
     *  letters and digits only, folded; Sanjay's three by year, then as listed, both ways. */
    const ORDERS = {
        "year:desc": NATURAL,
        "year:asc": [11, 5, 6, 4, 7, 10, 9, 1, 0, 3, 2, 8],
        "cited:desc": [5, 11, 4, 8, 0, 3, 2, 1, 9, 10, 7, 6],
        "cited:asc": [8, 0, 3, 2, 1, 9, 10, 7, 6, 4, 11, 5],
        "title:asc": [7, 5, 11, 9, 0, 6, 8, 3, 4, 10, 1, 2],
        "title:desc": [2, 1, 10, 4, 3, 8, 6, 0, 9, 11, 5, 7],
        "author:asc": [5, 11, 8, 7, 9, 4, 10, 6, 1, 0, 2, 3],
        "author:desc": [3, 1, 0, 2, 6, 10, 4, 9, 7, 8, 11, 5],
        "added:desc": [8, 0, 2, 9, 3, 1, 10, 7, 4, 6, 5, 11],
        "added:asc": [11, 5, 6, 4, 7, 10, 1, 3, 9, 2, 0, 8],
    };

    async function article(fields, type) {
        const it = new Zotero.Item(type || "journalArticle");
        it.libraryID = user;
        for (const k of Object.keys(fields)) if (!k.startsWith("_")) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: fields._first || "Nobody", firstName: "A." }]);
        await it.saveTx();
        return it;
    }

    const libDet = () => Array.from(win.document.querySelectorAll("item-details")).find(d => (/** @type {any} */ (d).tabType === "library" || d.closest("#zotero-item-pane")) && d.getBoundingClientRect().width > 0);
    const secOf = (pane) => { const d = libDet(); return d ? /** @type {any} */ (d.querySelector('item-pane-custom-section[data-pane$="' + pane + '"]')) : null; };
    const libSec = () => secOf("weavero-citedby");
    const libRows = () => { const s = libSec(); return s ? Array.from(s.querySelectorAll(".wv-cb-row")) : [] ; };
    const rowIds = () => libRows().map(r => Number(r.getAttribute("data-wv-cb-item")));
    const body = () => { const s = libSec(); return s ? s.querySelector('collapsible-section > [data-type="body"]') : null; };
    const bar = () => { const b = body(); return b ? b.querySelector(":scope > .wv-lf-bar") : null; };
    const qline = () => { const b = bar(); return b ? b.querySelector(":scope > .wv-lf-qline") : null; };
    const fline = () => { const b = bar(); return b ? b.querySelector(":scope > .wv-lf-fline") : null; };
    const input = () => { const q = qline(); return q ? q.querySelector(".wv-lf-input") : null; };
    const headOf = (s) => s ? s.querySelector("collapsible-section > .head") : null;
    const head = () => headOf(libSec());
    const btn = () => { const h = head(); return h ? h.querySelector(":scope > toolbarbutton." + BUTTON) : null; };
    const fbtn = () => { const h = head(); return h ? h.querySelector(":scope > ." + FBUTTON) : null; };
    /** The header's sort: its box, the dropdown chip, the arrow, the field's label. */
    const boxOf = (s) => { const h = headOf(s); return h ? h.querySelector(":scope > .wv-lf-sortbox") : null; };
    const sortBox = () => boxOf(libSec());
    const drop = (s) => { const b = boxOf(s || libSec()); return b ? b.querySelector(":scope > .wv-lf-sortdrop") : null; };
    const arrow = (s) => { const b = boxOf(s || libSec()); return b ? b.querySelector(":scope > .wv-lf-sortdir") : null; };
    const labelEl = (s) => { const d = drop(s); return d ? d.querySelector(".wv-lf-sortlab") : null; };
    const label = (s) => { const l = labelEl(s); return l ? l.textContent : null; };
    const drawn = (el) => !!el && win.getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
    const menu = () => win.document.getElementById("wv-lf-sort-menu");
    const stored = () => Zotero.Prefs.get("weavero.listSort.citedBy");
    /** The count a line shows ("" when it shows none). */
    const countOf = (line) => { const c = line ? line.querySelector(".wv-lf-count") : null; return c ? c.textContent : ""; };
    const pressed = (b) => !!b && b.getAttribute("aria-pressed") === "true";
    const ids = (...k) => k.map(i => P[i].id);
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const keyOn = (el, k) => el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    /** Zotero's own click on a header button: collapsibleSection.js dispatches the button's
     *  type on the section, which itemPaneCustomSection.js hands to the registration's onClick. */
    const pressMagnifier = () => { const s = libSec().querySelector("collapsible-section"); s.dispatchEvent(new win.CustomEvent(BUTTON, { detail: { button: btn() } })); };
    /** The search line closed (its text cleared) -- each test sets this first, never relying on
     *  the previous test's trailing restore (tests.md): the state is per item, kept across tests
     *  that show the same item. */
    async function closeAll() {
        if (qline()) pressMagnifier();
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "the search line closed");
    }
    async function openSearch() {
        if (!qline()) pressMagnifier();
        assert.ok(await wvT.waitFor(() => input(), 3000, 20), "the search line");
    }
    async function show(item, n) {
        await win.ZoteroPane.selectItem(item.id);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === n, 15000, 50), "the section of " + item.id + " with " + n + " rows (" + libRows().length + ")");
    }
    async function type(text, enter) {
        const i = input();
        i.value = text;
        i.dispatchEvent(new win.Event("input", { bubbles: true }));
        if (enter) i.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    }
    const key = (k) => keyOn(input(), k);
    async function rowsBecome(want, msg) {
        const ok = await wvT.waitFor(() => JSON.stringify(rowIds()) === JSON.stringify(want), 5000, 20);
        assert.ok(ok, (msg || "rows") + ": want " + JSON.stringify(want) + ", got " + JSON.stringify(rowIds()));
    }
    const order = (spec) => ORDERS[spec].map(k => P[k].id);
    /** The sort's chips read as `lab` and arrow `dir` ("↑", "↓", or null: no arrow drawn). */
    async function chipsRead(lab, dir, msg, s) {
        const ok = await wvT.waitFor(() => label(s) === lab && (dir ? drawn(arrow(s)) && arrow(s).textContent === dir : !drawn(arrow(s))), 3000, 20);
        assert.ok(ok, (msg || "the chips") + ": want " + lab + " " + dir + ", got " + label(s) + " " + (arrow(s) && drawn(arrow(s)) ? arrow(s).textContent : "(no arrow)"));
    }
    async function openMenu(s, how) {
        const d = drop(s);
        if (how) how(d);
        else click(d);
        const m = await wvT.waitFor(() => { const x = menu(); return x && x.state === "open" ? x : null; }, 5000, 20);
        assert.ok(m, "the sort menu open under the chip");
        return m;
    }
    async function closeMenu() {
        const m = menu();
        if (m) { try { m.hidePopup(); } catch (e) {} }
        assert.ok(await wvT.waitFor(() => !menu(), 3000, 20), "the menu gone");
    }
    /** A field picked in the menu, as a user does. */
    async function pick(field, s) {
        const m = await openMenu(s);
        const mi = m.querySelector('menuitem[data-wv-lf-field="' + field + '"]');
        assert.ok(mi, field + " offered");
        mi.doCommand();
        assert.ok(await wvT.waitFor(() => !menu(), 3000, 20), "the menu closes on a pick");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const f of ["wvLfFold", "wvLfParse", "wvLfPass", "wvLfChips", "wvLfChipsNone", "wvLfOrder", "wvLfOrderSteps", "wvLfMarks", "wvLfSortParse", "wvLfSortStr"]) if (typeof L[f] !== "function") wvT.absent("lib." + f);
        for (const m of ["_wvLfView", "_wvLfToggle", "_wvLfSetSort", "_wvLfSortFlip", "_wvLfSortMenu", "_wvLfStateOf", "_wvLfChipsOf", "_wvLfItemFacet", "_wvLfButtonClick", "_wvCbSecBuild", "_wvRefsSecBuild", "_wvRefsChipsPlace", "_wvCbWorksOf"]) wvT.method(m);
        win = Zotero.getMainWindow();
        user = Zotero.Libraries.userLibraryID;
        try { L.wvClearTimeout(wv._wvCbPassT); wv._wvCbPassT = null; } catch (e) {}
        await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50);
        try { Zotero.Prefs.clear("weavero.listSort.citedBy"); } catch (e) {}
        try { Zotero.Prefs.clear("weavero.listSort.references"); } catch (e) {}
        C = await article({ title: "WV-TEST a much cited work on drop impact", date: "1990", _first: "Famous" });
        D = await article({ title: "WV-TEST a work seven papers cite", date: "1991", _first: "Seven" });
        E = await article({ title: "WV-TEST a work eight papers cite", date: "1992", _first: "Eight" });
        made.push(C, D, E);
        for (const [t, title, first, year, pub, added] of PAPERS) {
            const f = { title, date: String(year), _first: first, dateAdded: added };
            if (pub) f.publicationTitle = pub;
            if (t === "thesis") f.university = "Sorbonne Université";
            const it = await article(f, t);
            P.push(it);
            made.push(it);
        }
        await wv._wvRefsFlush();
        rix = L.wvRefIndexNew();
        for (const it of [C, D, E].concat(P)) L.wvRefIndexPut(rix, { id: it.id, lib: user, title: it.getField("title"), date: it.getField("date"), first: it.getCreators()[0].lastName, pdf: true });
        ix = L.wvCbIndexNew();
        let att = FAKE;
        P.forEach((it, i) => {
            const c = [[0, C.id]];
            if (i < 7) c.push([1, D.id]);
            if (i < 8) c.push([2, E.id]);
            L.wvCbPut(ix, att++, { s: "ft:1:1", src: "ft", p: it.id, l: user, g: 1, c });
        });
        // How often the papers are cited in turn (Times cited): Couder's by four papers, de Gennes's
        // by two (one of them through two PDFs: counted once), Lee's by one.
        let paper = FAKE + 5000;
        const citedBy = (k, n, pdfs) => { for (let j = 0; j < n; j++) { paper++; for (let q = 0; q < (pdfs || 1); q++) L.wvCbPut(ix, att++, { s: "ft:1:1", src: "ft", p: paper, l: user, g: 1, c: [[0, P[k].id]] }); } };
        citedBy(5, 4);
        citedBy(11, 1, 2); citedBy(11, 1);
        citedBy(4, 1);
        was = { ix: wv._wvCbIx, rix: wv._wvRefsIx };
        wv._wvCbIx = ix;
        wv._wvRefsIx = rix;
        wv._wvCbWorksCache = null;
    });

    after(async function () {
        try { Zotero.Prefs.clear("weavero.listSort.citedBy"); } catch (e) {}
        try { Zotero.Prefs.clear("weavero.listSort.references"); } catch (e) {}
        try { Services.prefs.clearUserPref("ui.systemUsesDarkTheme"); } catch (e) {}
        try { delete wv._wvRefsSecReader; delete wv._wvRefsDocRows; } catch (e) {}
        if (was) { wv._wvCbIx = was.ix; wv._wvRefsIx = was.rix; wv._wvCbWorksCache = null; }
        try { const m = menu(); if (m) m.hidePopup(); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
    });

    /** Both kinds back to their own order, every section drawn again (a cleared pref alone
     *  redraws nothing), the prefs cleared. */
    function resetSort() {
        try { wv._wvLfSetSort("citedBy", "year:desc"); } catch (e) {}
        try { wv._wvLfSetSort("references", "paper"); } catch (e) {}
        Zotero.Prefs.clear("weavero.listSort.citedBy");
        Zotero.Prefs.clear("weavero.listSort.references");
    }

    // ---- the grammar, the chips, the orders (lib/list-filter.ts) ----

    const row = (o) => Object.assign({ year: 0, type: "", pdf: false, lib: true, added: 0, cites: 0, order: 0, title: "", first: "" }, o, { hay: L.wvLfFold(o.hay || "") });
    const pass = (r, text, chips) => L.wvLfPass(r, L.wvLfParse(text), chips || L.wvLfChipsNone());

    it("words: every one must be there, in any field, in any order, accents and case ignored; -word leaves rows out", function () {
        const r = row({ hay: "Drop impact on viscous liquid films\nVatsal Sanjay; Detlef Lohse\n2023\nJournal of Fluid Mechanics\n\nJournal Article", year: 2023 });
        assert.isTrue(pass(r, "viscous sanjay"));
        assert.isTrue(pass(r, "SANJAY   Viscous"), "case and spaces");
        assert.isTrue(pass(r, "lohse fluid"), "a second author, the journal");
        assert.isFalse(pass(r, "viscous josserand"), "every word");
        assert.isFalse(pass(r, "-viscous"), "-word leaves it out");
        assert.isTrue(pass(r, "-review sanjay"));
        assert.isTrue(pass(r, ""), "nothing typed keeps it");
        const f = row({ hay: "Modélisation et simulation des impacts\nClément Féreka\nSorbonne Université", year: 2025 });
        assert.isTrue(pass(f, "modelisation fereka"), "accents ignored in the row");
        assert.isTrue(pass(f, "Féreka université"), "and in what is typed");
        assert.isTrue(pass(row({ hay: "Die Straße" }), "strasse"), "ß as ss");
        assert.deepEqual(L.wvLfParse("drop -").words.map(w => w.text), ["drop"], "a lone dash is no word");
    });

    it("years: 2015, 2015-2020, 2020-, -1980 -- the row's year, never its text", function () {
        assert.deepEqual(L.wvLfParse("2015").years, [{ lo: 2015, hi: 2015 }]);
        assert.deepEqual(L.wvLfParse("2020-2015").years, [{ lo: 2015, hi: 2020 }], "either way round");
        assert.deepEqual(L.wvLfParse("2015–2020").years, [{ lo: 2015, hi: 2020 }], "an en dash");
        assert.deepEqual(L.wvLfParse("2020-").years, [{ lo: 2020, hi: 9999 }]);
        assert.deepEqual(L.wvLfParse("-1980").years, [{ lo: 1, hi: 1980 }]);
        assert.deepEqual(L.wvLfParse("-1980").words, [], "-1980 is a range, not a word left out");
        const r = row({ hay: "A paper of 2016 citing a 2015 work", year: 2016 });
        assert.isTrue(pass(r, "2015-2020"));
        assert.isFalse(pass(r, "2015"), "its year, not its text");
        assert.isTrue(pass(r, "2016 paper"));
        assert.isFalse(pass(r, "2020-"));
        assert.isFalse(pass(r, "-1980"));
        assert.isTrue(pass(row({ hay: "old", year: 1975 }), "-1980"));
        assert.isFalse(pass(row({ hay: "a 2015 text, no year known", year: 0 }), "2015"), "no year known: no year matches");
    });

    it("marks: where the words are in the text, accents ignored, overlaps joined", function () {
        assert.deepEqual(L.wvLfMarks("Drop impact on viscous liquid films", ["viscous"]), [[15, 22]]);
        assert.deepEqual(L.wvLfMarks("Modélisation des gouttes", ["modelisation"]), [[0, 12]], "the accented letters marked");
        assert.deepEqual(L.wvLfMarks("Viscous and viscoelastic", ["visco"]), [[0, 5], [12, 17]], "every occurrence");
        assert.deepEqual(L.wvLfMarks("viscous", ["vis", "viscous"]), [[0, 7]], "overlaps joined");
        assert.deepEqual(L.wvLfMarks("Straße", ["strasse"]), [[0, 6]], "a letter folded to two");
        assert.deepEqual(L.wvLfMarks("nothing here", ["drop"]), []);
    });

    const R4 = () => [
        row({ order: 0, year: 2010, cites: 3, title: "beta", first: "smith", added: 100 }),
        row({ order: 1, year: 2020, cites: 0, title: "alpha", first: "jones", added: 300 }),
        row({ order: 2, year: 0, cites: 5, title: "", first: "", added: 0 }),
        row({ order: 3, year: 2020, cites: 5, title: "gamma", first: "adams", added: 200 }),
    ];

    it("the orders: each field's default direction (the one-word orders until lfsort.1), unknown values last, ties in the list's own order", function () {
        const rows = R4();
        const q = L.wvLfParse(""), c = L.wvLfChipsNone();
        const by = (s, nat) => L.wvLfOrder(rows, q, c, s, nat || "paper");
        assert.deepEqual(by("paper"), [0, 1, 2, 3], "order in the paper");
        assert.deepEqual(by("newest"), [1, 3, 0, 2], "newest first, no year last, ties as listed");
        assert.deepEqual(by("oldest"), [0, 1, 3, 2], "oldest first");
        assert.deepEqual(by("cited"), [3, 2, 0, 1], "most cited, then newest");
        assert.deepEqual(by("title"), [1, 0, 3, 2], "title, A to Z, none last");
        assert.deepEqual(by("author"), [3, 1, 0, 2], "first author, A to Z");
        assert.deepEqual(by("added"), [1, 3, 0, 2], "recently added; no library item last");
        assert.deepEqual(by("newest", "newest"), [0, 1, 2, 3], "the list's own order is not sorted again");
        // The same orders named as a field and a direction.
        for (const [old, now] of [["newest", "year:desc"], ["oldest", "year:asc"], ["cited", "cited:desc"], ["title", "title:asc"], ["author", "author:asc"], ["added", "added:desc"]]) {
            assert.deepEqual(by(now), by(old), now + " is " + old);
            assert.deepEqual(by({ field: now.split(":")[0], dir: now.split(":")[1] }), by(old), now + " as a spec");
        }
        assert.deepEqual(by("year:desc", "newest"), [0, 1, 2, 3], "either form names the list's own order");
        assert.deepEqual(by("newest", { field: "year", dir: "desc" }), [0, 1, 2, 3]);
    });

    it("the orders turned round: the field's comparison reversed, unknown values still last, ties as before; the paper's order has no direction", function () {
        const rows = R4();
        const q = L.wvLfParse(""), c = L.wvLfChipsNone();
        const by = (s) => L.wvLfOrder(rows, q, c, s, "paper");
        assert.deepEqual(by("year:asc"), [0, 1, 3, 2], "oldest first, no year last");
        assert.deepEqual(by("cited:asc"), [1, 0, 3, 2], "least cited first (0 is a count); a tie newest first");
        assert.deepEqual(by("title:desc"), [3, 0, 1, 2], "Z to A, none still last");
        assert.deepEqual(by("author:desc"), [0, 1, 3, 2], "first author, Z to A");
        assert.deepEqual(by("added:asc"), [0, 3, 1, 2], "first added first, no library item last");
        assert.deepEqual(by("paper:desc"), [0, 1, 2, 3], "no reversed paper order");
        assert.deepEqual(by({ field: "paper", dir: "desc" }), [0, 1, 2, 3]);
        assert.deepEqual(by("bogus"), [0, 1, 2, 3], "a value that names nothing: the list's own order");
    });

    it("stored sorts: an older one-word value is read as what it meant, the form of lfsort.1 round-trips, anything else names nothing", function () {
        const p = (v) => L.wvLfSortParse(v);
        assert.deepEqual(p("newest"), { field: "year", dir: "desc" }, "Newest: Year ↓");
        assert.deepEqual(p("oldest"), { field: "year", dir: "asc" }, "Oldest: Year ↑");
        assert.deepEqual(p("cited"), { field: "cited", dir: "desc" }, "Most cited: Times cited ↓");
        assert.deepEqual(p("title"), { field: "title", dir: "asc" });
        assert.deepEqual(p("author"), { field: "author", dir: "asc" });
        assert.deepEqual(p("added"), { field: "added", dir: "desc" }, "Recently added: Date added ↓");
        assert.deepEqual(p("paper"), { field: "paper", dir: "asc" });
        assert.deepEqual(p("year:asc"), { field: "year", dir: "asc" });
        assert.deepEqual(p("title:desc"), { field: "title", dir: "desc" });
        assert.deepEqual(p("paper:desc"), { field: "paper", dir: "asc" }, "the paper's order has no direction");
        for (const bad of ["", "bogus", "year:up", "year", "newest:asc", null, undefined]) assert.isNull(p(bad), "names nothing: " + bad);
        assert.equal(L.wvLfSortStr({ field: "year", dir: "desc" }), "year:desc");
        assert.equal(L.wvLfSortStr({ field: "paper", dir: "asc" }), "paper");
        for (const s of ["year:asc", "year:desc", "cited:asc", "title:desc", "author:asc", "added:asc", "paper"]) assert.equal(L.wvLfSortStr(p(s)), s, "round trip: " + s);
    });

    it("the chips (engine kept behind WV_LF_FILTERS_UI): the list's most common types, a recent-years cut, Has PDF, In / Not in library -- each only when it splits the list", function () {
        const rows = [];
        const add = (n, o) => { for (let i = 0; i < n; i++) rows.push(row(Object.assign({ order: rows.length }, o))); };
        add(131, { type: "journalArticle", year: 2010, pdf: true });
        add(9, { type: "thesis", year: 2022, pdf: true });
        add(6, { type: "preprint", year: 2024, pdf: true });
        add(4, { type: "book", year: 2021, pdf: true });
        const s = L.wvLfChips(rows, false);
        assert.equal(s.total, 150);
        assert.deepEqual(s.types, [{ type: "journalArticle", count: 131 }, { type: "thesis", count: 9 }, { type: "preprint", count: 6 }], "the three most common");
        assert.equal(s.pdf, -1, "every row has a PDF: no chip");
        assert.equal(s.inLib, -1, "In library: References only");
        assert.ok(s.since && s.since.count > 0 && s.since.count < 150, "a cut that splits: " + JSON.stringify(s.since));
        const yrs = [2025, 2023, 2023, 2023, 2022, 2021, 2019, 2016, 2015, 2013, 2005, 2004].map((y, i) => row({ order: i, year: y }));
        assert.deepEqual(L.wvLfChips(yrs, false).since, { year: 2020, count: 6 });
        assert.deepEqual(L.wvLfChips(rows.slice(0, 131), false).types, [], "one type: no type chip");
        const refs = rows.slice(0, 15).map((r, i) => Object.assign({}, r, { lib: i < 10, pdf: i < 4 }));
        const rs = L.wvLfChips(refs, true);
        assert.deepEqual([rs.inLib, rs.outLib, rs.pdf], [10, 5, 4], "a list that offers them: in, not in, with a PDF");
        const rn = L.wvLfChips(refs, false, false);
        assert.deepEqual([rn.inLib, rn.outLib, rn.pdf], [-1, -1, -1], "a list that offers neither");
    });

    it("the chips filter (engine): types are alternatives, Since and Has PDF must hold, In / Not in library", function () {
        const a = row({ type: "thesis", year: 2021, pdf: true, lib: true });
        const b = row({ type: "book", year: 2018, pdf: false, lib: false });
        const on = (o) => Object.assign(L.wvLfChipsNone(), o);
        assert.isTrue(pass(a, "", on({ types: ["thesis", "book"] })));
        assert.isTrue(pass(b, "", on({ types: ["thesis", "book"] })));
        assert.isFalse(pass(b, "", on({ types: ["thesis"] })));
        assert.isTrue(pass(a, "", on({ since: 2020 })));
        assert.isFalse(pass(b, "", on({ since: 2020 })));
        assert.isFalse(pass(b, "", on({ pdf: true })));
        assert.isTrue(pass(a, "", on({ lib: "in" })));
        assert.isFalse(pass(a, "", on({ lib: "out" })));
        assert.isTrue(pass(b, "", on({ lib: "out" })));
        assert.isFalse(pass(a, "", on({ types: ["thesis"], since: 2022 })), "every chip group must hold");
    });

    it("in steps the result is the one at once, with steps between", function () {
        const rows = [];
        for (let i = 0; i < 9000; i++) rows.push(row({ order: i, hay: "paper " + i + (i % 3 ? " drop" : " film"), year: 1950 + i % 70, title: "t" + (9000 - i) }));
        const q = L.wvLfParse("drop 1990-"), c = L.wvLfChipsNone();
        const g = L.wvLfOrderSteps(rows, q, c, "title:desc", "paper");
        let steps = 0, r;
        while (!(r = g.next()).done) steps++;
        assert.isAtLeast(steps, 4, "yields between steps");
        assert.deepEqual(r.value, L.wvLfOrder(rows, q, c, "title:desc", "paper"));
        assert.isTrue(r.value.every(i => rows[i].year >= 1990 && i % 3 !== 0), "only rows that pass");
    });

    // ---- the header in the Cited by section ----

    it("the header: the sort's dropdown chip and its arrow, then the magnifier, then the twisty -- no funnel; on lists of 8 rows or more only", async function () {
        await show(C, 12);
        assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "fixture: newest first, then by title");
        const h = head();
        assert.notOk(fbtn(), "no funnel in the header (MJT 2026-11-22: \"Remove it\")");
        assert.notOk(h.querySelector(":scope > toolbarbutton.section-custom-button:not(." + BUTTON + ")"), "no other header button of the list's");
        const box = sortBox(), b = btn();
        assert.ok(box && b, "the sort (" + !!box + ") and the magnifier (" + !!b + ")");
        assert.isTrue(b.classList.contains("section-custom-button"), "the magnifier: Zotero's section button (registerSectionButton)");
        assert.strictEqual(box.nextElementSibling, b, "the sort right before the magnifier, where the funnel was");
        assert.isTrue(!!b.nextElementSibling && b.nextElementSibling.classList.contains("twisty"), "the magnifier right before the twisty, as Tags' +");
        assert.isTrue(drawn(box), "the sort drawn for 12 rows");
        assert.isFalse(L.wvBoolAttrOn(b, "hidden"), "the magnifier shown for 12 rows");
        // The reader's sort bar: a dropdown chip naming the field (a chevron), the arrow beside it.
        assert.equal(drop().localName, "button");
        assert.equal(arrow().localName, "button");
        assert.equal(label(), "Year", "Cited by: by year");
        assert.equal(drop().getAttribute("data-wv-lf-field"), "year");
        assert.ok(drop().querySelector(".wv-lf-sortcaret > svg > path"), "the reader's chevron");
        assert.equal(arrow().textContent, "↓", "newest first: ↓, as the reader draws a descending date");
        assert.equal(arrow().getAttribute("data-wv-lf-dir"), "desc");
        // Tooltips and accessible names: the reader's words.
        assert.equal(drop().getAttribute("title"), "Sort order");
        assert.equal(drop().getAttribute("aria-haspopup"), "menu");
        assert.equal(drop().getAttribute("aria-expanded"), "false");
        assert.equal(arrow().getAttribute("title"), "Newest first\nToggle sort direction", "the order shown, then the reader's tooltip");
        assert.equal(arrow().getAttribute("aria-label"), "Toggle sort direction", "a name, not the arrow's character");
        assert.equal(arrow().getAttribute("aria-description"), "Newest first");
        // Drawn as the reader's chips (.wv-outline-src-chip, .wv-ann-sortchip.wv-on), in the
        // header's secondary text like its title -- and as tall as the header's own buttons, not
        // Zotero's 28-px form button.
        const cd = win.getComputedStyle(drop()), ca = win.getComputedStyle(arrow());
        assert.deepEqual([cd.fontSize, cd.borderTopLeftRadius, cd.borderTopStyle], ["10.5px", "10px", "solid"], "the dropdown: a bordered pill, 10.5 px");
        assert.deepEqual([ca.fontSize, ca.fontWeight, ca.borderTopLeftRadius], ["11px", "600", "9px"], "the arrow: 11 px, semibold");
        assert.equal(cd.color, win.getComputedStyle(h.querySelector(".title")).color, "the header's secondary text");
        assert.equal(cd.backgroundImage, "none", "no form-button gradient");
        for (const el of [drop(), arrow()]) assert.isAtMost(el.getBoundingClientRect().height, b.getBoundingClientRect().height + 2, "about the magnifier's height, not a 28-px form button: " + el.className + " " + el.getBoundingClientRect().height);
        // Shown with the magnifier: on 8 rows or more.
        await show(D, 7);
        assert.isFalse(drawn(sortBox()), "no sort for 7 rows");
        assert.isTrue(L.wvBoolAttrOn(btn(), "hidden"), "nor a magnifier");
        await show(E, 8);
        assert.isTrue(drawn(sortBox()), "the sort for 8");
        assert.isFalse(L.wvBoolAttrOn(btn(), "hidden"), "the magnifier for 8");
        // Light and dark: the title's tone in each, the theme's own.
        try {
            const tones = [];
            for (const dark of [0, 1]) {
                Services.prefs.setIntPref("ui.systemUsesDarkTheme", dark);
                assert.ok(await wvT.waitFor(() => win.matchMedia("(prefers-color-scheme: dark)").matches === !!dark, 3000, 50), dark ? "dark" : "light");
                await sleep(200);
                const c = String(win.getComputedStyle(drop()).color);
                assert.equal(c, win.getComputedStyle(head().querySelector(".title")).color, (dark ? "dark" : "light") + ": the title's tone");
                tones.push(c);
            }
            assert.notEqual(tones[0], tones[1], "a tone per theme: " + JSON.stringify(tones));
        }
        finally {
            Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
        }
    });

    it("the sort menu: \"Sort by\", the fields Cited by offers, a tick on the current one, (default) on its own order; a pick sorts and is remembered, written in the new form", async function () {
        await show(C, 12);
        await closeAll();
        resetSort();
        try {
            const m = await openMenu();
            const items = Array.from(m.children);
            assert.equal(items[0].getAttribute("label"), "Sort by", "a heading first, as the reader's menu");
            assert.isTrue(L.wvBoolAttrOn(items[0], "disabled"), "the heading is no entry");
            const fields = items.slice(1);
            assert.deepEqual(fields.map(f => f.getAttribute("data-wv-lf-field")), ["year", "cited", "title", "author", "added"], "no paper order for Cited by");
            assert.deepEqual(fields.map(f => f.getAttribute("label")), ["Year", "Times cited in your libraries", "Title", "First author", "Date added"]);
            assert.deepEqual(fields.map(f => L.wvBoolAttrOn(f, "checked")), [true, false, false, false, false], "the current one ticked");
            assert.isTrue(fields.every(f => f.getAttribute("type") === "checkbox"), "a tick, as the reader's ✓");
            assert.deepEqual(fields.map(f => f.getAttribute("acceltext") || ""), ["(default)", "", "", "", ""], "(default) on the list's own order");
            for (const f of fields) assert.ok(f.getAttribute("data-l10n-id") === "weavero-lf-sort", "Fluent id on " + f.getAttribute("data-wv-lf-field"));
            assert.isFalse(drop().hasAttribute("title"), "the chip's tooltip set aside while its menu is open");
            assert.equal(drop().getAttribute("aria-expanded"), "true");
            assert.isTrue(drop().hasAttribute("data-wv-lf-menu"), "drawn pressed while open");
            fields[2].doCommand();
            assert.ok(await wvT.waitFor(() => !menu(), 3000, 20), "the menu gone");
            await rowsBecome(order("title:asc"), "title, A to Z: the field's own direction");
            assert.equal(stored(), "title:asc", "remembered in the form of lfsort.1");
            await chipsRead("Title", "↑", "the chip names it, the arrow up");
            assert.equal(arrow().getAttribute("title"), "A to Z\nToggle sort direction");
            assert.equal(drop().getAttribute("title"), "Sort order", "its tooltip back");
            assert.equal(drop().getAttribute("aria-expanded"), "false");
            // The menu again: the tick moved.
            const m2 = await openMenu();
            assert.deepEqual(Array.from(m2.querySelectorAll("menuitem[data-wv-lf-field]")).map(f => L.wvBoolAttrOn(f, "checked")), [false, false, true, false, false], "Title ticked");
            await closeMenu();
            // Remembered for the kind: the next item's section sorts so.
            await show(E, 8);
            assert.deepEqual(rowIds(), ids(7, 5, 0, 6, 3, 4, 1, 2), "E's eight papers, A to Z");
            await chipsRead("Title", "↑", "E's header");
            // A list too short for the sort keeps its own order.
            await show(D, 7);
            assert.deepEqual(rowIds(), ids(0, 3, 2, 1, 4, 6, 5), "D's seven: newest first, whatever the setting");
        }
        finally {
            resetSort();
        }
    });

    it("the arrow turns the order round; another field takes its own direction, the same field keeps it -- every field, both ways, on the rows themselves", async function () {
        await show(C, 12);
        await closeAll();
        try {
            wv._wvLfSetSort("citedBy", "title:asc");
            await rowsBecome(order("title:asc"), "A to Z");
            click(arrow());
            await rowsBecome(order("title:desc"), "the arrow: Z to A");
            assert.equal(stored(), "title:desc");
            await chipsRead("Title", "↓", "the arrow down");
            assert.equal(arrow().getAttribute("title"), "Z to A\nToggle sort direction");
            // Another field: its own direction (the reader's rule), whatever the last one's.
            await pick("year");
            await rowsBecome(order("year:desc"), "Year: newest first");
            assert.equal(stored(), "year:desc");
            await chipsRead("Year", "↓", "Year ↓");
            click(arrow());
            await rowsBecome(order("year:asc"), "the arrow: oldest first");
            await chipsRead("Year", "↑", "Year ↑");
            assert.equal(arrow().getAttribute("title"), "Oldest first\nToggle sort direction");
            // The same field again: its direction kept.
            await pick("year");
            await sleep(200);
            assert.deepEqual(rowIds(), order("year:asc"), "Year picked again: still oldest first");
            assert.equal(stored(), "year:asc");
            for (const { field, lab, first, second, tips } of [
                { field: "cited", lab: "Times cited", first: "cited:desc", second: "cited:asc", tips: ["Most cited first", "Least cited first"] },
                { field: "author", lab: "First author", first: "author:asc", second: "author:desc", tips: ["A to Z", "Z to A"] },
                { field: "added", lab: "Date added", first: "added:desc", second: "added:asc", tips: ["Newest first", "Oldest first"] },
            ]) {
                await pick(field);
                await rowsBecome(order(first), field + ": its own direction");
                await chipsRead(lab, first.endsWith("asc") ? "↑" : "↓", field);
                assert.equal(arrow().getAttribute("title").split("\n")[0], tips[0]);
                click(arrow());
                await rowsBecome(order(second), field + " turned round");
                assert.equal(stored(), second);
                assert.equal(arrow().getAttribute("title").split("\n")[0], tips[1]);
            }
            // Title again: A to Z, its own direction -- not the turned one of before.
            await pick("title");
            await rowsBecome(order("title:asc"), "Title: A to Z again");
        }
        finally {
            resetSort();
        }
    });

    it("keys and the header: Enter, Space or Down on the dropdown open its menu, Enter or Space on the arrow turns it; Left and Right do nothing; no press on a chip folds the section or opens its context menu", async function () {
        await show(C, 12);
        await closeAll();
        const cs = libSec().querySelector("collapsible-section");
        try {
            assert.isTrue(cs.open, "fixture: the section open");
            for (const k of ["Enter", " ", "ArrowDown"]) {
                await openMenu(null, (d) => keyOn(d, k));
                assert.isTrue(cs.open, k + ": the section still open");
                await closeMenu();
                await sleep(450);
            }
            for (const k of ["ArrowLeft", "ArrowRight"]) {
                keyOn(drop(), k);
                keyOn(arrow(), k);
                await sleep(150);
                assert.isTrue(cs.open, k + ": not folded (Zotero's header takes Left / Right as fold / unfold)");
                assert.notOk(menu(), k + ": no menu");
                assert.isFalse(Services.prefs.prefHasUserValue("extensions.zotero.weavero.listSort.citedBy"), k + ": the order untouched");
                assert.deepEqual(rowIds(), NATURAL.map(i => P[i].id), k + ": the rows as they were");
            }
            keyOn(arrow(), "Enter");
            await rowsBecome(order("year:asc"), "Enter on the arrow");
            assert.isTrue(cs.open, "Enter: not folded");
            // The button's own activation of that key, if any, comes as a click right after it:
            // one press, one turn.
            click(arrow());
            await sleep(200);
            assert.deepEqual(rowIds(), order("year:asc"), "a click right after the key: the same press");
            await sleep(450);
            keyOn(arrow(), " ");
            await rowsBecome(order("year:desc"), "Space on the arrow");
            await sleep(450);
            // Clicks: on the chips, not on the header behind them.
            click(arrow());
            await rowsBecome(order("year:asc"), "a click on the arrow");
            assert.isTrue(cs.open, "the click did not fold the section");
            await openMenu();
            assert.isTrue(cs.open, "nor the dropdown's");
            await closeMenu();
            // A right-click: no section menu (Zotero's own buttons are excepted the same way).
            for (const el of [drop(), arrow()]) {
                el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
                await sleep(150);
                const cm = cs._contextMenu;
                const open = !!cm && (cm.state === "open" || cm.state === "showing");
                if (open) { try { cm.hidePopup(); } catch (e) {} }
                assert.isFalse(open, "no section menu on " + el.className);
            }
        }
        finally {
            resetSort();
            if (!cs.open) cs.open = true;
        }
    });

    it("stored sorts from before lfsort.1 are read as they meant and left as they are until the user changes the sort; a field the list does not offer is its own order", async function () {
        await show(C, 12);
        await closeAll();
        const redraw = () => wv._wvCbSecRedraw(body());
        try {
            for (const [v, lab, dir, want] of [["oldest", "Year", "↑", "year:asc"], ["newest", "Year", "↓", "year:desc"], ["cited", "Times cited", "↓", "cited:desc"],
                ["title", "Title", "↑", "title:asc"], ["author", "First author", "↑", "author:asc"], ["added", "Date added", "↓", "added:desc"]]) {
                Zotero.Prefs.set("weavero.listSort.citedBy", v);
                redraw();
                await rowsBecome(order(want), "\"" + v + "\"");
                await chipsRead(lab, dir, "\"" + v + "\"");
                assert.equal(stored(), v, "\"" + v + "\" not written over by reading it");
            }
            for (const v of ["paper", "bogus", "paper:asc"]) {
                Zotero.Prefs.set("weavero.listSort.citedBy", v);
                redraw();
                await rowsBecome(order("year:desc"), "\"" + v + "\": Cited by's own order");
                await chipsRead("Year", "↓", "\"" + v + "\"");
            }
            // The user's change writes the new form.
            Zotero.Prefs.set("weavero.listSort.citedBy", "oldest");
            redraw();
            await rowsBecome(order("year:asc"), "oldest again");
            click(arrow());
            await rowsBecome(order("year:desc"), "turned");
            assert.equal(stored(), "year:desc", "written as field and direction");
        }
        finally {
            resetSort();
        }
    });

    it("no filter can hide a row: no funnel, the filter chips' line never opens, a chip state left in memory narrows nothing", async function () {
        await show(C, 12);
        await closeAll();
        const st = wv._wvLfStateOf(body(), { item: C.id, kind: "citedBy" });
        try {
            assert.notOk(fbtn(), "no funnel");
            wv._wvLfToggle(body(), "f", true);
            wv._wvLfFilterButtonClick({ body: body() });
            await sleep(200);
            assert.notOk(fline(), "the chips' line does not open");
            wv._wvLfChip(body(), "type:thesis");
            await sleep(200);
            assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "a chip press refused: the whole list");
            // A state holding chips (as one set by an older build): ignored by every computation.
            st.chips = { types: ["thesis"], since: 2020, pdf: true, lib: "out" };
            assert.deepEqual(wv._wvLfChipsOf(st), L.wvLfChipsNone(), "the chips a computation gets: none");
            wv._wvCbSecRedraw(body());
            await sleep(300);
            assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "still the whole list");
            assert.isFalse(pressed(btn()), "nothing narrows it");
            // The words alone narrow, the count says so; a sort keeps every row.
            await openSearch();
            await type("drop", true);
            await rowsBecome(ids(0, 2, 9, 7, 4, 6, 5), "the word alone (the theses' chip ignored)");
            assert.equal(countOf(qline()), "7 of 12");
            await type("", true);
            wv._wvLfSetSort("citedBy", "title:desc");
            await rowsBecome(order("title:desc"), "sorted, all twelve");
            pressMagnifier();
            assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "closed");
        }
        finally {
            st.chips = L.wvLfChipsNone();
            resetSort();
        }
    });

    // ---- the search line ----

    it("the magnifier opens the search line: focus in its field, \"Search 12 papers…\"", async function () {
        await show(C, 12);
        await closeAll();
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => input(), 3000, 20), "the search line");
        assert.strictEqual(body().firstElementChild, bar(), "at the top of the list");
        assert.notOk(fline(), "no chips' line");
        assert.notOk(bar().querySelector(".wv-lf-sort, .wv-lf-chip"), "no sort, no chip below the header");
        assert.ok(await wvT.waitFor(() => win.document.activeElement === input(), 3000, 20), "the field has the focus");
        assert.equal(input().getAttribute("placeholder"), "Search 12 papers…");
        assert.isTrue(L.wvBoolAttrOn(btn(), "data-wv-lf-open"), "the magnifier marked open");
        assert.isFalse(pressed(btn()), "open, but nothing typed: not pressed");
        assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "the list as it was");
        assert.equal(countOf(qline()), "", "no count while nothing narrows it");
        assert.include(win.getComputedStyle(qline()).contain, "inline-size", "never wider than the pane");
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "closed by the magnifier");
    });

    it("typing narrows the whole list a moment later, counts it and marks the words; with a sort, the rows found in that order", async function () {
        await show(C, 12);
        await closeAll();
        await openSearch();
        await type("sanjay viscous");
        assert.equal(rowIds().length, 12, "not at once: typing is debounced");
        await rowsBecome(ids(0, 1), "Sanjay's viscous papers");
        assert.equal(countOf(qline()), "2 of 12");
        assert.isTrue(pressed(btn()), "the magnifier pressed while its text narrows the list");
        const marks = Array.from(libRows()[0].querySelectorAll("mark.wv-lf-hl")).map(m => m.textContent.toLowerCase());
        assert.includeMembers(marks, ["viscous", "sanjay"], "the words marked: " + JSON.stringify(marks));
        assert.equal(libRows()[0].querySelector(".wv-cb-text").textContent, "Drop impact on viscous liquid films Sanjay · Journal of Fluid Mechanics · 2023", "the text itself unchanged");
        await type("sanjay -viscous", true);
        await rowsBecome(ids(2), "-viscous");
        await type("2020-", true);
        await rowsBecome(ids(8, 0, 3, 2, 1, 9), "2020 on");
        await type("2015-2016", true);
        await rowsBecome(ids(7, 4), "2015 to 2016");
        await type("thesis", true);
        await rowsBecome(ids(8, 9, 10), "the type's name");
        await type("quere", true);
        await rowsBecome(ids(6), "Quéré, typed without accents");
        await type("fluid mechanics -2020", true);
        await rowsBecome(ids(7, 6), "the journals' words, up to 2020");
        try {
            wv._wvLfSetSort("citedBy", "year:asc");
            await rowsBecome(ids(6, 7), "the same two, oldest first");
        }
        finally { resetSort(); }
        await rowsBecome(ids(7, 6), "back to the list's own order");
        await type("nothing like this", true);
        await rowsBecome([], "no match");
        assert.ok(body().querySelector(".wv-lf-none"), "a line says so");
        assert.equal(countOf(qline()), "0 of 12");
        await type("", true);
        await rowsBecome(NATURAL.map(k => P[k].id), "cleared: the list back");
        assert.isFalse(pressed(btn()), "nothing typed: not pressed");
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "closed");
    });

    it("Esc in the field clears its text, then closes the line; the pressed magnifier clears and closes; Down to the rows, Up back", async function () {
        await show(C, 12);
        await closeAll();
        await openSearch();
        await type("drop", true);
        await rowsBecome(ids(0, 2, 9, 7, 4, 6, 5), "the word");
        key("Escape");
        await rowsBecome(NATURAL.map(k => P[k].id), "the first Esc: the text gone");
        assert.ok(qline(), "the line still open");
        assert.equal(input().value, "");
        assert.isFalse(pressed(btn()), "the magnifier no longer pressed");
        key("Escape");
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "the second Esc: closed");
        assert.isFalse(L.wvBoolAttrOn(btn(), "data-wv-lf-open"));
        // A pressed magnifier: its text cleared and its line closed.
        await openSearch();
        await type("thesis", true);
        await rowsBecome(ids(8, 9, 10));
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "the magnifier: closed");
        await rowsBecome(NATURAL.map(k => P[k].id), "and cleared");
        // Down from the field goes to the first row.
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => input(), 3000, 20));
        key("ArrowDown");
        assert.strictEqual(win.document.activeElement, libRows()[0], "Down: the first row");
        keyOn(libRows()[0], "ArrowDown");
        assert.strictEqual(win.document.activeElement, libRows()[1], "Down again: the second");
        keyOn(libRows()[1], "ArrowUp");
        keyOn(libRows()[0], "ArrowUp");
        assert.strictEqual(win.document.activeElement, input(), "Up from the first row: the field");
        key("Escape");
    });

    it("another item: the text resets, the line closed; the sort is the kind's", async function () {
        await show(C, 12);
        await closeAll();
        await openSearch();
        await type("drop", true);
        await wvT.waitFor(() => rowIds().length < 12, 3000, 20);
        await show(E, 8);
        assert.notOk(bar(), "E: no line");
        assert.isFalse(pressed(btn()), "E: the magnifier not pressed");
        await show(C, 12);
        assert.notOk(bar(), "back to C: no line, nothing filtered");
        assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "the whole list");
        await openSearch();
        assert.equal(input().value, "", "the text gone");
        pressMagnifier();
        assert.ok(await wvT.waitFor(() => !bar(), 3000, 20), "closed");
    });

    it("beside a PDF: the reader tab's item pane has the same sort and magnifier, its own search state", async function () {
        const path = PathUtils.join(PathUtils.tempDir, "wv-lf-c-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, wvT.minimalPDFBytes());
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: C.id });
        try { await IOUtils.remove(path); } catch (e) {}
        made.push(att);
        const reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "C's PDF opened");
        const cpWas = !!win.ZoteroContextPane.collapsed;
        try {
            win.Zotero_Tabs.select(reader.tabID);
            win.ZoteroContextPane.collapsed = false;
            const det = () => win.document.querySelector('#zotero-context-pane item-details[data-tab-id="' + reader.tabID + '"]');
            const sec = () => { const d = det(); return d ? /** @type {any} */ (d.querySelector('item-pane-custom-section[data-pane$="weavero-citedby"]')) : null; };
            const rows = () => { const s = sec(); return s ? Array.from(s.querySelectorAll(".wv-cb-row")).map(r => Number(r.getAttribute("data-wv-cb-item"))) : []; };
            const d = await wvT.waitFor(() => det(), 10000, 100);
            assert.ok(d, "the reader tab's item pane");
            assert.ok(await wvT.waitFor(() => sec() && !sec().hidden, 10000, 100), "its Cited by section");
            try { await d.scrollToPane(wv._wvCbSecKey, "instant"); } catch (e) {}
            assert.ok(await wvT.waitFor(() => rows().length === 12, 10000, 100), "C's twelve (" + rows().length + ")");
            const b = sec().querySelector("collapsible-section > .head > toolbarbutton." + BUTTON);
            assert.ok(b && !L.wvBoolAttrOn(b, "hidden"), "the magnifier");
            assert.notOk(sec().querySelector("collapsible-section > .head > ." + FBUTTON), "no funnel");
            assert.ok(await wvT.waitFor(() => drawn(boxOf(sec())) && boxOf(sec()).nextElementSibling === b, 5000, 50), "the sort before it");
            await chipsRead("Year", "↓", "beside a PDF", sec());
            // The sort is the kind's: turned here, turned in the library's pane too.
            try {
                click(arrow(sec()));
                assert.ok(await wvT.waitFor(() => JSON.stringify(rows()) === JSON.stringify(order("year:asc")), 5000, 20), "oldest first here: " + JSON.stringify(rows()));
                assert.equal(stored(), "year:asc");
            }
            finally { resetSort(); wv._wvCbSecRedraw(sec().querySelector('collapsible-section > [data-type="body"]')); }
            sec().querySelector("collapsible-section").dispatchEvent(new win.CustomEvent(BUTTON, { detail: { button: b } }));
            const rbody = sec().querySelector('collapsible-section > [data-type="body"]');
            const rin = await wvT.waitFor(() => rbody.querySelector(":scope > .wv-lf-bar > .wv-lf-qline .wv-lf-input"), 3000, 20);
            assert.ok(rin, "the search line, in this pane");
            rin.value = "thesis";
            rin.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            assert.ok(await wvT.waitFor(() => JSON.stringify(rows()) === JSON.stringify(ids(8, 9, 10)), 5000, 20), "filtered here: " + JSON.stringify(rows()));
            // The library pane's section is another body: its own state, untouched.
            win.Zotero_Tabs.select("zotero-pane");
            await show(C, 12);
            assert.notOk(bar(), "the library pane: no line");
        }
        finally {
            try { win.ZoteroContextPane.collapsed = cpWas; } catch (e) {}
            wvT.closeReaderTab(reader);
            await wvT.sleep(300);
            win.Zotero_Tabs.select("zotero-pane");
        }
    });

    it("a library item's facet: its type in Zotero's words, every author, the publication, the date added, how often it is cited", function () {
        const f = wv._wvLfItemFacet(P[8].id, 3, "", 0);
        assert.equal(f.type, "thesis");
        assert.include(f.hay, L.wvLfFold(Zotero.ItemTypes.getLocalizedString("thesis")), "the type's name");
        assert.include(f.hay, "sorbonne universite", "the university, folded");
        assert.include(f.hay, "fereka");
        assert.equal(f.year, 2025);
        assert.equal(f.added, Date.UTC(2025, 1, 1, 10, 0, 0), "the date added");
        assert.equal(f.order, 3);
        assert.equal(f.title, "modelisationetsimulationdesimpactsdegouttesetdesprays", "a sort key");
        assert.equal(wv._wvLfItemFacet(P[5].id, 0, "", 0).cites, 4, "Couder's: cited by four papers");
        assert.equal(wv._wvLfItemFacet(P[11].id, 0, "", 0).cites, 2, "de Gennes's: two papers, one of them through two PDFs");
        assert.equal(wv._wvLfItemFacet(P[0].id, 0, "", 0).cites, 0);
    });

    // ---- References ----

    /** A References list for C: ten entries, six of them library items. */
    function refsData() {
        const hit = (k, pdf) => ({ ids: [P[k].id], how: "title", pdf, away: null, others: 0 });
        const ent = (i, text) => ({ text: "[" + (i + 1) + "] " + text, label: "[" + (i + 1) + "]", rects: [[0, 1, 1, 2, 2]] });
        const rows = [
            { e: "Sanjay, V. 2023 Drop impact on viscous liquid films. J. Fluid Mech.", h: hit(0, true) },
            { e: "Smith, J. 2001 Granular flows down inclined planes. J. Test 1, 2-3." },
            { e: "Couder, Y. 2005 Bouncing drops on a liquid bath. Phys. Rev. Lett.", h: hit(5, false) },
            { e: "Brown, K. 1998 Granular avalanches in rotating drums. J. Test 4, 5-6." },
            { e: "Lee, J. 2015 Splashing of drops on dry surfaces. Phys. Rev. E", h: hit(4, true) },
            { e: "Quéré, D. 2013 Leidenfrost drops on a heated plate. Annu. Rev.", h: hit(6, true) },
            { e: "Adams, R. 2019 Rain on leaves and the splash it makes. J. Test 7, 8-9." },
            { e: "Kim, S. 2021 Drop impact on soft solids. Thesis.", h: hit(9, false) },
            { e: "Zhou, Q. 2010 Ink jets and their satellite drops. J. Test 10, 11-12." },
            { e: "de Gennes, P.-G. 2004 Capillarity and wetting phenomena.", h: hit(11, true) },
        ].map((r, i) => ({ i, entry: ent(i, r.e), hit: r.h || null, shown: true }));
        return { rows, have: 6, total: 10 };
    }
    // The entries newest first (unmatched ones by their own year), and oldest first.
    const REFS_NEWEST = [0, 7, 6, 4, 5, 8, 2, 9, 1, 3];
    const REFS_OLDEST = [3, 1, 9, 2, 8, 5, 4, 6, 7, 0];

    it("References: the same search and sort on its rows -- the paper's order its own, no arrow for it; the entry's own text, its year read from it", async function () {
        const doc = win.document;
        const b = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        doc.documentElement.appendChild(b);
        const reader = { wvLib: true, itemID: C.id, _window: win, tabID: null, type: "pdf" };
        const data = refsData();
        const secRows = () => Array.from(b.querySelectorAll(".wv-refs-sec-row")).map(r => Number(r.getAttribute("data-wv-refs-entry")));
        const bbar = () => b.querySelector(":scope > .wv-lf-bar");
        const bq = () => { const x = bbar(); return x ? x.querySelector(":scope > .wv-lf-qline") : null; };
        const until = async (want, msg) => assert.ok(await wvT.waitFor(() => JSON.stringify(secRows()) === JSON.stringify(want), 5000, 20), msg + ": want " + JSON.stringify(want) + ", got " + JSON.stringify(secRows()));
        try {
            wv._wvRefsSecBuild(b, doc, reader, data);
            assert.deepEqual(secRows(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "in the paper's order");
            wv._wvLfToggle(b, "f", true);
            await sleep(150);
            assert.notOk(b.querySelector(".wv-lf-fline"), "no chips' line");
            wv._wvLfToggle(b, "q", true);
            assert.ok(await wvT.waitFor(() => bq(), 3000, 20), "the search line");
            const bi = bq().querySelector(".wv-lf-input");
            assert.equal(bi.getAttribute("placeholder"), "Search 10 references…");
            bi.value = "granular";
            bi.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            await until([1, 3], "the entry's own text");
            assert.ok(b.querySelector('.wv-refs-sec-row[data-wv-refs-entry="1"] mark.wv-lf-hl'), "marked in the entry");
            bi.value = "-2010";
            bi.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            await until([1, 2, 3, 8, 9], "up to 2010: the library item's year, else the entry's");
            bi.value = "";
            bi.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            await until([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "cleared");
            wv._wvLfSetSort("references", "year:desc");
            await until(REFS_NEWEST, "Year ↓: unmatched entries by their own year");
            assert.equal(Zotero.Prefs.get("weavero.listSort.references"), "year:desc");
            wv._wvLfSetSort("references", "year:asc");
            await until(REFS_OLDEST, "Year ↑");
            wv._wvLfSetSort("references", "newest");
            await until(REFS_NEWEST, "an older one-word order, as it meant");
            assert.equal(Zotero.Prefs.get("weavero.listSort.references"), "year:desc", "written in the new form");
            wv._wvLfSetSort("references", "author:asc");
            await until([6, 3, 2, 9, 7, 4, 5, 0, 1, 8], "by first author: the item's, else the entry's");
            wv._wvLfSetSort("references", "author:desc");
            await until([8, 1, 0, 5, 4, 7, 9, 2, 3, 6], "Z to A");
            wv._wvLfSetSort("references", "paper");
            await until([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "the paper's order");
            assert.equal(Zotero.Prefs.get("weavero.listSort.references"), "paper");
        }
        finally {
            resetSort();
            b.remove();
        }
    });

    /** The library pane's References section shows `data` for C (the two methods that find a
     *  paper's list answer for C, the plugin's own for anything else). */
    async function withRefs(fn) {
        const proto = Object.getPrototypeOf(wv);
        const fake = { wvLib: true, itemID: C.id, _window: win, tabID: null, type: "pdf" };
        const data = refsData();
        wv._wvRefsSecReader = function (b, item, d) { return item && item.id === C.id ? fake : proto._wvRefsSecReader.call(this, b, item, d); };
        wv._wvRefsDocRows = function (r) { return r === fake ? data : proto._wvRefsDocRows.call(this, r); };
        try {
            await win.ZoteroPane.selectItem(P[0].id);
            await sleep(300);
            await show(C, 12);
            const rs = () => secOf("weavero-references");
            // As when a paper's list comes in (refs.ts, the index's or a reader's end): every
            // References section looks again, whatever an earlier look at C decided (a second
            // look on Zotero 10 found no section of ten rows within 15 s once, lfsort.1).
            wv._wvRefsSecRefreshFor(null);
            const ok = await wvT.waitFor(() => rs() && !rs().hidden && rs().querySelectorAll(".wv-refs-sec-row").length === 10, 15000, 50);
            assert.ok(ok, "the References section of C, ten rows (section " + !!rs() + ", hidden " + (rs() && rs().hidden) + ", rows " + (rs() ? rs().querySelectorAll(".wv-refs-sec-row").length : -1) + ")");
            await fn(rs, fake, data);
        }
        finally {
            delete wv._wvRefsSecReader;
            delete wv._wvRefsDocRows;
            resetSort();
        }
    }

    it("References and Cited by alike in the library's pane: the same chips in each header, before the magnifier; References' menu offers the paper's order first, its own, no arrow for it", async function () {
        await withRefs(async (rs) => {
            const rows = () => Array.from(rs().querySelectorAll(".wv-refs-sec-row")).map(r => Number(r.getAttribute("data-wv-refs-entry")));
            const rh = headOf(rs());
            assert.notOk(rh.querySelector(":scope > ." + FBUTTON), "no funnel in References");
            const rb = rh.querySelector(":scope > toolbarbutton." + BUTTON);
            assert.ok(rb && boxOf(rs()) && boxOf(rs()).nextElementSibling === rb, "the sort before the magnifier");
            await chipsRead("Paper order", null, "References: the paper's order, no arrow", rs());
            assert.isTrue(L.wvBoolAttrOn(arrow(rs()), "hidden"), "the arrow hidden, not just empty");
            // The two headers alike: the same chips, the same look.
            for (const p of ["fontSize", "borderTopLeftRadius", "color", "paddingLeft", "height"]) assert.equal(win.getComputedStyle(drop(rs()))[p], win.getComputedStyle(drop())[p], p + " alike");
            const m = await openMenu(rs());
            const fields = Array.from(m.querySelectorAll("menuitem[data-wv-lf-field]"));
            assert.deepEqual(fields.map(f => f.getAttribute("data-wv-lf-field")), ["paper", "year", "cited", "title", "author", "added"]);
            assert.equal(fields[0].getAttribute("label"), "Order in the paper");
            assert.equal(fields[0].getAttribute("acceltext"), "(default)", "its own order");
            assert.isTrue(L.wvBoolAttrOn(fields[0], "checked"));
            fields[1].doCommand();
            assert.ok(await wvT.waitFor(() => JSON.stringify(rows()) === JSON.stringify(REFS_NEWEST), 5000, 20), "Year: newest first (" + JSON.stringify(rows()) + ")");
            await chipsRead("Year", "↓", "References: Year ↓", rs());
            click(arrow(rs()));
            assert.ok(await wvT.waitFor(() => JSON.stringify(rows()) === JSON.stringify(REFS_OLDEST), 5000, 20), "turned: oldest first");
            assert.equal(Zotero.Prefs.get("weavero.listSort.references"), "year:asc");
            assert.deepEqual(rowIds(), NATURAL.map(k => P[k].id), "Cited by keeps its own sort: one pref per kind");
            await pick("paper", rs());
            assert.ok(await wvT.waitFor(() => JSON.stringify(rows()) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 5000, 20), "the paper's order back");
            await chipsRead("Paper order", null, "no arrow again", rs());
        });
    });

    it("the header fits the pane's minimum width, light and dark: nothing overlaps or leaves the header; the field's label yields first, References' count chips stay whole -- on the title's line while narrowing the label frees enough, else on their own row", async function () {
        const ip = L.wvViewEl(win.document, "zotero-item-pane");
        const w0 = ip.getAttribute("width");
        const r = (el) => el.getBoundingClientRect();
        /** The header's parts in order: none overlapping the next, all inside the header. */
        function fits(s, msg) {
            const h = headOf(s);
            const hr = r(h);
            const kids = Array.from(h.children).filter(k => k.localName !== "popupset" && drawn(k));
            for (const k of kids) {
                const kr = r(k);
                assert.isAtLeast(kr.left, hr.left - 0.5, msg + ": " + (k.className || k.localName) + " inside the header (left)");
                assert.isAtMost(kr.right, hr.right + 0.5, msg + ": " + (k.className || k.localName) + " inside the header (right " + kr.right + " > " + hr.right + ")");
                assert.isAtMost(kr.height, 22, msg + ": " + (k.className || k.localName) + " one header row high");
            }
            for (let i = 1; i < kids.length; i++) assert.isAtMost(r(kids[i - 1]).right, r(kids[i]).left + 0.5, msg + ": " + kids[i - 1].className + " | " + kids[i].className + " do not overlap");
            // The section never widens the pane (src-ts-ui.md: width: min-content on the section).
            const cs = s.querySelector("collapsible-section");
            const before = cs.style.width;
            cs.style.width = "min-content";
            const minW = r(cs).width;
            cs.style.width = before;
            assert.isAtMost(minW, r(cs).width + 0.5, msg + ": the section's minimum (" + minW + ") within the pane (" + r(cs).width + ")");
            // A cut label says so.
            const lab = labelEl(s);
            if (lab && lab.scrollWidth > lab.clientWidth + 0.5) assert.equal(win.getComputedStyle(lab).textOverflow, "ellipsis", msg + ": a cut label ends in an ellipsis");
        }
        /** References' count chips: whole, in the header's title box or on their own row. */
        function chipsWhole(rs, msg) {
            const chips = rs().querySelector(".wv-refs-chips");
            assert.ok(chips, msg + ": the count chips");
            const tb = headOf(rs()).querySelector(".title-box");
            if (chips.parentNode === tb) {
                assert.isAtMost(r(chips).right, r(tb).right + 0.5, msg + ": the chips whole inside the title box");
                assert.isAtMost(tb.scrollWidth, tb.clientWidth + 0.5, msg + ": nothing cut in the title box");
                return "head";
            }
            assert.ok(chips.closest(".wv-refs-sec-bar"), msg + ": else on their own row");
            return "row";
        }
        await withRefs(async (rs) => {
            try {
                // The pane at its minimum (Zotero's min-width holds it: `width` 1), light and dark,
                // with each field's label -- the longest in the menu included.
                ip.setAttribute("width", "1");
                await sleep(500);
                for (const dark of [0, 1]) {
                    Services.prefs.setIntPref("ui.systemUsesDarkTheme", dark);
                    await sleep(300);
                    for (const spec of ["paper", "added:desc", "author:asc"]) {
                        if (spec !== "paper") { wv._wvLfSetSort("citedBy", spec); wv._wvLfSetSort("references", spec); }
                        await sleep(300);
                        for (const [pane, key] of [["weavero-references", wv._wvRefsSecKey], ["weavero-citedby", wv._wvCbSecKey]]) {
                            try { await libDet().scrollToPane(key, "instant"); } catch (e) {}
                            await sleep(250);
                            fits(secOf(pane), pane + (dark ? " dark" : " light") + " at the minimum, " + spec);
                        }
                        chipsWhole(rs, "at the minimum, " + spec);
                    }
                    resetSort();
                }
                Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
                // The priority, on the References section alone, its width set: wide, the chips
                // on the title's line; then narrowed until the label gives up all but a few
                // letters before the chips leave the title's line.
                const s = rs();
                const at = async (w, msg) => {
                    // The header's box watched (refs.ts _wvRefsChipsPlace's ResizeObserver).
                    s.style.width = w + "px";
                    await sleep(400);
                    fits(s, msg);
                    return chipsWhole(rs, msg);
                };
                const full = 560;
                assert.equal(await at(full, "wide"), "head", "a wide section: the chips on the title's line");
                const tb = headOf(s).querySelector(".title-box");
                const lab = labelEl(s);
                // What the title's line needs: from the title box's start to the chips' end.
                const slack = r(tb).width - (r(s.querySelector(".wv-refs-chips")).right - r(tb).left);
                assert.isAbove(slack, 40, "fixture: room to spare in a wide section (" + slack + ")");
                const labW = r(lab).width;
                try {
                    // Just narrower than the chips need with the whole label: the label narrowed.
                    let where = await at(Math.floor(full - slack - 8), "8 px short");
                    assert.equal(where, "head", "8 px short: the chips kept on the title's line");
                    assert.ok(lab.style.maxWidth && parseFloat(lab.style.maxWidth) < labW, "the label narrowed (" + lab.style.maxWidth + " < " + labW + ")");
                    assert.isAbove(lab.scrollWidth, lab.clientWidth, "the label cut");
                    assert.equal(win.getComputedStyle(lab).textOverflow, "ellipsis");
                    // More than the label can give: the chips on their own row, the label whole again.
                    where = await at(Math.floor(full - slack - labW), "a label's width short");
                    assert.equal(where, "row", "then the chips take their own row");
                    assert.equal(lab.style.maxWidth, "", "and the label is whole again");
                    assert.isAtMost(lab.scrollWidth, lab.clientWidth + 0.5);
                    // Wide again: back on the title's line, the label whole.
                    where = await at(Math.ceil(full), "wide again");
                    assert.equal(where, "head");
                    assert.equal(lab.style.maxWidth, "");
                }
                finally {
                    s.style.width = "";
                }
            }
            finally {
                Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
                if (w0) ip.setAttribute("width", w0);
                else ip.removeAttribute("width");
                await sleep(300);
            }
        });
    });

    // ---- plan §0's bounds: the 20,000-citer stress fixture (test/cited-by.spec.js) ----

    it("a work cited by 20,000 papers: its whole list searched within budget -- in idle slices when cold, stopped by another item -- the 50 rows of the result drawn within budget, the cap after the search, the sort of the whole list in slices", async function () {
        this.timeout(300000);
        const N = 20000, REAL = 160;
        const BUDGET = { slice: 20, filter: 20, build: 50 };
        const S = await article({ title: "WV-TEST the most cited work of the filter's stress fixture", date: "1990", _first: "Famous" });
        made.push(S);
        const reals = [];
        await Zotero.DB.executeTransaction(async () => {
            for (let i = 0; i < REAL; i++) {
                const it = new Zotero.Item("journalArticle");
                it.libraryID = user;
                it.setField("title", "WV-TEST stress citing paper " + String(i).padStart(4, "0"));
                it.setField("date", "2099");
                it.setCreators([{ creatorType: "author", lastName: "Stress", firstName: "A." }]);
                await it.save();
                reals.push(it);
            }
        });
        made.push(...reals);
        const srix = L.wvRefIndexNew();
        L.wvRefIndexPut(srix, { id: S.id, lib: user, title: S.getField("title"), date: "1990", first: "Famous" });
        for (const it of reals) L.wvRefIndexPut(srix, { id: it.id, lib: user, title: it.getField("title"), date: "2099", first: "Stress", pdf: true });
        const six = L.wvCbIndexNew();
        const F = 1800000000;
        let twins = 0;
        for (let i = 0; i < N; i++) {
            const pid = i < REAL ? reals[i].id : F + i;
            if (i >= REAL) {
                const twin = i % 10 === 0 && i - 1 >= REAL;
                if (twin) twins++;
                L.wvRefIndexPut(srix, { id: pid, lib: twin ? user + 100000 : user, title: "Synthetic citing paper number " + i, DOI: "10.9999/stress." + (twin ? i - 1 : i),
                    date: String(1950 + i % 140), first: "Synth" + (i % 500) });
            }
            L.wvCbPut(six, F + 100000 + i, { s: "ft:1:1", src: "ft", p: pid, l: user, g: 1, c: [[0, S.id]] });
        }
        const keep = { ix: wv._wvCbIx, rix: wv._wvRefsIx };
        const now = () => win.performance.now();
        const timing = {};
        try {
            wv._wvCbIx = six;
            wv._wvRefsIx = srix;
            wv._wvCbWorksCache = null;
            await win.ZoteroPane.selectItem(S.id);
            assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 50, 60000, 100), "the section, 50 rows (" + libRows().length + ")");
            const works = wv._wvCbWorksOf(S);
            assert.lengthOf(works, N - twins, "fixture: a row per work");
            // The draw without a search first, in the same run (what the search adds is read against it).
            {
                const h0 = libSec().querySelector(".wv-cb-sec");
                h0.removeAttribute("data-wv-cb-sig");
                const t0 = now();
                wv._wvCbSecBuild(h0.parentNode, win.document, S, works);
                timing.buildPlain = Math.round((now() - t0) * 10) / 10;
            }
            // Cold: every work's facet made, then the words matched -- in idle slices.
            wv._wvLfFacetsDrop();
            await openSearch();
            wv._wvLfStat = null;
            await type("synthetic", true);
            assert.ok(await wvT.waitFor(() => wv._wvLfStat && wv._wvLfStat.done, 60000, 50), "the facets made: " + JSON.stringify(wv._wvLfStat));
            const cold = Object.assign({}, wv._wvLfStat);
            assert.isTrue(cold.sliced, "cold: in slices (" + JSON.stringify(cold) + ")");
            // Warm: the words over the whole list.
            wv._wvLfStat = null;
            await type("stress", true);
            assert.ok(await wvT.waitFor(() => wv._wvLfStat && wv._wvLfStat.done, 20000, 20), "searched: " + JSON.stringify(wv._wvLfStat));
            const warm = Object.assign({}, wv._wvLfStat);
            assert.ok(await wvT.waitFor(() => libRows().length === 50, 5000, 20), "50 rows of the result first (" + libRows().length + ")");
            assert.equal(countOf(qline()), "160 of " + (N - twins).toLocaleString("en-US"), "the count");
            assert.equal(JSON.parse(libSec().querySelector("collapsible-section").dataset.l10nArgs).count, N - twins, "the header counts every work");
            assert.equal(libSec().querySelector(".wv-cb-more").textContent, "Show 100 more", "then the section's pages, over the result");
            // The 50 rows of the result drawn, timed alone (the signature cleared: all drawn again).
            const host = libSec().querySelector(".wv-cb-sec");
            let t = now();
            wv._wvLfView(host.parentNode, win.document, wv._wvCbLfList(S, works));
            timing.view = Math.round((now() - t) * 10) / 10;
            host.removeAttribute("data-wv-cb-sig");
            t = now();
            wv._wvCbSecBuild(host.parentNode, win.document, S, works);
            timing.build = now() - t;
            assert.equal(libRows().length, 50);
            libSec().querySelector(".wv-cb-more").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.equal(libRows().length, 150, "a hundred more of the result");
            assert.equal(libSec().querySelector(".wv-cb-more").textContent, "Show 10 more", "ten left");
            libSec().querySelector(".wv-cb-more").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.equal(libRows().length, 160);
            assert.notOk(libSec().querySelector(".wv-cb-more"), "the whole result");
            // A result under 50: no Show more; a new search starts the pages again.
            await type("stress 001", true);
            assert.ok(await wvT.waitFor(() => libRows().length === 11, 5000, 20), "papers 0001 and 0010-0019 (" + libRows().length + ")");
            assert.notOk(libSec().querySelector(".wv-cb-more"), "under 50: no Show more");
            // Every work by its year, the whole list sorted (the sort's own step).
            wv._wvLfStat = null;
            await type("", true);
            wv._wvLfSetSort("citedBy", "year:asc");
            assert.ok(await wvT.waitFor(() => wv._wvLfStat && wv._wvLfStat.done, 20000, 20), "sorted: " + JSON.stringify(wv._wvLfStat));
            const sorted = Object.assign({}, wv._wvLfStat);
            resetSort();
            // Another item while a cold computation runs: it stops. (The facets forgotten, and
            // made a little slower here, so the other item comes while it runs.)
            wvT.method("_wvLfFacetsDrop");
            wv._wvLfFacetsDrop();
            const proto = Object.getPrototypeOf(wv);
            let made1 = 0;
            wv._wvLfItemFacet = function (...a) {
                if (++made1 % 40 === 0) { const t0 = Date.now(); while (Date.now() - t0 < 1) { /* a slower facet */ } }
                return proto._wvLfItemFacet.apply(this, a);
            };
            let stopped;
            try {
                wv._wvLfStat = null;
                await type("synthetic", true);
                const started = await wvT.waitFor(() => wv._wvLfStat && wv._wvLfStat.sliced, 10000, 5);
                assert.ok(started, "a sliced computation running: " + JSON.stringify(wv._wvLfStat));
                await win.ZoteroPane.selectItem(C.id);
                assert.ok(await wvT.waitFor(() => wv._wvLfStat.stopped || wv._wvLfStat.done, 20000, 20), "ended: " + JSON.stringify(wv._wvLfStat));
                stopped = Object.assign({}, wv._wvLfStat, { facets: made1 });
            }
            finally { delete wv._wvLfItemFacet; }
            timing.cold = { slices: cold.slices, workMs: Math.round(cold.workMs), maxSliceMs: Math.round(cold.maxSliceMs * 10) / 10, firstMs: Math.round(cold.firstMs * 10) / 10 };
            timing.filter = { sliced: warm.sliced, slices: warm.slices, workMs: Math.round(warm.workMs * 10) / 10, maxSliceMs: Math.round(warm.maxSliceMs * 10) / 10 };
            timing.sort = { sliced: sorted.sliced, slices: sorted.slices, workMs: Math.round(sorted.workMs * 10) / 10, maxSliceMs: Math.round(sorted.maxSliceMs * 10) / 10 };
            timing.stopped = { stopped: stopped.stopped, done: stopped.done, slices: stopped.slices, facetsMade: stopped.facets, of: N - twins };
            timing.build = Math.round(timing.build * 10) / 10;
            timing.rows = N - twins;
            Zotero.debug("[wv-test] list filter stress (ms): " + JSON.stringify(timing));
            try { await IOUtils.writeUTF8(PathUtils.join("D:\\tmp", "wv-lf-stress-" + Services.appinfo.platformVersion + ".json"), JSON.stringify(timing)); } catch (e) {}
            assert.isTrue(stopped.stopped, "stopped by the other item: " + JSON.stringify(stopped));
            assert.isAtMost(cold.maxSliceMs, BUDGET.slice, "cold: the longest slice " + JSON.stringify(timing.cold));
            assert.isAtMost(warm.sliced ? warm.maxSliceMs : warm.workMs, BUDGET.filter, "one search of the whole list " + JSON.stringify(timing.filter));
            assert.isAtMost(sorted.maxSliceMs, BUDGET.slice, "the sort's longest slice " + JSON.stringify(timing.sort));
            assert.isAtMost(timing.build, BUDGET.build, "the first 50 rows of the result drawn: " + timing.build + " ms");
        }
        finally {
            resetSort();
            wv._wvCbIx = keep.ix;
            wv._wvRefsIx = keep.rix;
            wv._wvCbWorksCache = null;
        }
    });
});
