/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers tab, the Google Contacts design, step 1 (MJT 2026-11-25, approved):
// "the centre pane opens on a TABLE of researchers (Name with initials avatar,
// Institution, Country, Papers in your libraries, PhD year; click a column title
// to sort; Followed first, like Google's Favourites); a click on a row opens the
// researcher's page in the centre with a Back arrow". Step 2 (MJT 2026-11-26:
// "The column headers should work the same as the column headers in the items
// list of Zotero"): the table is Zotero's own VirtualizedTable. Contracts:
//  - no researcher open: the table, its rows the list's (view, search, filters);
//  - the followed researchers first, then by the column; a click on the same
//    title reverses it; a researcher without the value last either way;
//  - initials in a coloured circle, the same colour every time;
//  - a row's click (or Enter) opens the page; its Back arrow comes back.

describe("Weavero — Researchers: the table", function () {
    this.timeout(60000);
    let wv, lib, win;
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    // The rows on screen, in the table's order (VirtualizedTable ids them "<table>-row-<index>").
    const rowIndex = (el) => Number(String(el.id).replace(/^.*-row-/, ""));
    const rowEls = () => qa(".wv-pp-table .virtualized-table-body .row[data-wv-pp-person]").sort((a, b) => rowIndex(a) - rowIndex(b));
    const names = () => rowEls().map((tr) => tr.querySelector(".wv-pp-tnametext").textContent);
    const rowOf = (id) => q(".wv-pp-table .row[data-wv-pp-person='" + id + "']");
    const headCell = (col) => q(".wv-pp-table .virtualized-table-header .cell." + col);
    const headKeys = () => qa(".wv-pp-table .virtualized-table-header .cell").map((c) => ["name", "institution", "country", "papers", "phd"].find((k) => c.classList.contains(k)));
    // A click on a column title, as Zotero's header takes it: a press, then its release.
    const clickHead = (col) => {
        const c = headCell(col);
        c.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        c.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    };
    const sortOf = () => { const p = JSON.parse(String(Zotero.Prefs.get("weavero.people.columns") || "{}")); const k = Object.keys(p).find((x) => p[x].sortDirection); return k ? k + ":" + p[k].sortDirection : ""; };
    const line = (fact, value) => ({ fact, value, source: "me", status: "chosen" });
    const recs = {};
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns"];

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderTable", "_wvPeopleCreate", "_wvPeopleTabOpen", "_wvPeopleViewOf", "_wvPeopleTableOf", "_wvPeopleLibIndexBuild"]) wvT.method(m);
        win = Zotero.getMainWindow();
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        // Lohse (Twente, NL, PhD 1992), Bird (Brown, US, no PhD year), Thoraval (LadHyX, FR, PhD 2013, followed).
        const add = async (last, first, inst, country, phd, followed) => {
            const r = await wv._wvPeopleCreate(last, first);
            if (inst) r.lines.push(line("institution", inst));
            if (country) r.lines.push(line("country", country));
            if (phd) r.lines.push(line("phd.year", phd));
            r.followed = !!followed;
            recs[last] = r;
            return r;
        };
        await add("Lohse", "Detlef", "University of Twente", "NL", "1992");
        await add("Bird", "James", "Brown University", "US", "");
        await add("Thoraval", "Marie-Jean", "LadHyX", "FR", "2013", true);
        await wv._wvPeopleSave(Object.values(recs));
        // The runner's library counted (none of them is in it): Papers has no value.
        await wv._wvPeopleLibIndexBuild();
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.filter = "all"; v.view = "table"; v.fix = null;
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 8000), "the table's three rows");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("Zotero's own table; its columns (Papers, empty, hidden); the followed first, then by name", function () {
        assert.isOk(q(".wv-pp-table > .virtualized-table#wv-pp-tbl"), "a VirtualizedTable");
        assert.deepEqual(headKeys(), ["name", "institution", "country", "phd"]);
        assert.deepEqual(names().map((n) => n.split(/[ ,]/)[0]), ["Thoraval", "Bird", "Lohse"]);
        assert.isOk(headCell("name").querySelector(".sort-indicator.ascending"), "the sort's arrow on Name");
    });

    it("initials in a coloured circle, the same colour each time", function () {
        const av = rowOf(recs.Lohse.id).querySelector(".wv-pp-avatar");
        assert.strictEqual(av.textContent, "DL");
        assert.strictEqual(av.style.getPropertyValue("--wv-pp-hue"), String(wv._wvPeopleHue("Lohse Detlef")));
        assert.strictEqual(lib.wvPpInitials("Thoraval", "Marie-Jean"), "MT");
        assert.strictEqual(lib.wvPpInitials("", ""), "?");
    });

    it("a column title sorts; again, reversed; no value last either way; the followed stay first; the sort is kept", async function () {
        clickHead("phd");
        assert.isOk(await wvT.waitFor(() => (sortOf() === "phd:1" && headCell("phd").querySelector(".sort-indicator.ascending") ? true : null), 4000, 30), "sorted: " + sortOf());
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(names().map((n) => n.split(/[ ,]/)[0])) === JSON.stringify(["Thoraval", "Lohse", "Bird"]) ? true : null), 4000, 30), names().join(" | "));
        clickHead("phd");
        assert.isOk(await wvT.waitFor(() => (sortOf() === "phd:-1" && headCell("phd").querySelector(".sort-indicator.descending") ? true : null), 4000, 30), "reversed: " + sortOf());
        assert.deepEqual(names().map((n) => n.split(/[ ,]/)[0]), ["Thoraval", "Lohse", "Bird"], "Bird without a year: last both ways");
        clickHead("country");
        assert.isOk(await wvT.waitFor(() => (sortOf() === "country:1" ? true : null), 4000, 30));
        // By the country's name: Netherlands before United States.
        assert.deepEqual(names().map((n) => n.split(/[ ,]/)[0]), ["Thoraval", "Lohse", "Bird"]);
        clickHead("name");
        assert.isOk(await wvT.waitFor(() => (sortOf() === "name:1" ? true : null), 4000, 30));
    });

    it("the search narrows the table too", async function () {
        const v = wv._wvPeopleViewOf(win);
        v.q = "lohse";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 1 ? true : null), 4000, 30));
        v.q = "";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 4000, 30));
    });

    // Guards 11f6bffd: the search field is drawn again at each keystroke, and search-textbox's own
    // timer sends a `command` half a second after an input -- from the field the redraw replaced,
    // with the text of then. Its handler set the search back to that text and redrew the tab under
    // the user. The replaced field's command is ignored now.
    it("a search field the redraw replaced puts no old text back: its late command keeps the search typed since", async function () {
        const v = wv._wvPeopleViewOf(win);
        const field = () => q(".wv-pp-main .wv-pp-tb .wv-pp-search");
        const type = (s, text) => { s.value = text; s.dispatchEvent(new win.Event("input", { bubbles: true })); };
        try {
            const first = field();
            assert.isOk(first, "fixture: the search field");
            type(first, "lo");
            assert.isOk(await wvT.waitFor(() => (v.q === "lo" && field() && field() !== first ? true : null), 4000, 30), "fixture: the redraw replaced the field (q " + JSON.stringify(v.q) + ")");
            type(field(), "lohse");
            assert.isOk(await wvT.waitFor(() => (v.q === "lohse" && rowEls().length === 1 ? true : null), 4000, 30), "fixture: \"lohse\" typed in the new field: " + names().join(" | "));
            assert.isFalse(first.isConnected, "fixture: the first field is out of the tab");
            assert.strictEqual(first.value, "lo", "fixture: still holding the text of then");
            // search-textbox's timer, from the replaced field.
            first.dispatchEvent(new win.Event("command", { bubbles: true }));
            await wvT.sleep(150);
            assert.strictEqual(v.q, "lohse", "the search stays what was typed since");
            assert.deepEqual(names().map((n) => n.split(/[ ,]/)[0]), ["Lohse"], "the table still shows Lohse alone");
            assert.strictEqual(field().value, "lohse", "the field on screen too");
        }
        finally {
            v.q = "";
            wv._wvPeopleTabRender(win);
            await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 4000, 30);
        }
    });

    // The items list's stripes (MJT 2026-11-26 on peoplenet.15: "Apply the same alternating background color as
    // in the items list"): VirtualizedTable's odd rows in Zotero's --material-stripe, the even ones not; a
    // selected row keeps the selection's colour. Written before the code: fails on 1.3.0-peoplenet.16's c0f2bcff.
    it("the rows alternate as the items list's: odd rows in Zotero's stripe token, even rows not, a selected row its own colour", async function () {
        const probe = (val) => {
            const d = win.document.createElement("div");
            d.style.backgroundColor = val;
            q(".wv-pp-table").appendChild(d);
            const c = win.getComputedStyle(d).backgroundColor;
            d.remove();
            return c;
        };
        const stripe = probe("var(--material-stripe)");
        assert.notStrictEqual(stripe, probe("transparent"), "Zotero defines the token: " + stripe);
        const tree = wv._wvPeopleTableOf(win);
        tree.selection.clearSelection();
        assert.isOk(await wvT.waitFor(() => (!q(".wv-pp-table .row.selected") ? true : null), 4000, 30));
        const odd = q(".wv-pp-table .row.odd[data-wv-pp-person]");
        const even = q(".wv-pp-table .row.even[data-wv-pp-person]");
        assert.isOk(odd && even, "VirtualizedTable's odd and even rows");
        assert.strictEqual(win.getComputedStyle(odd).backgroundColor, stripe, "an odd row: the stripe");
        assert.notStrictEqual(win.getComputedStyle(even).backgroundColor, stripe, "an even row: not the stripe");
        const at = rowIndex(odd);
        tree.selection.select(at);
        assert.isOk(await wvT.waitFor(() => { const r = q(".wv-pp-table .row.odd.selected[data-wv-pp-person]"); return r && win.getComputedStyle(r).backgroundColor !== stripe ? true : null; }, 4000, 30), "a selected odd row: the selection's colour");
        tree.selection.clearSelection();
    });

    // The toolbars, as the library tab's (MJT 2026-11-26 on peoplenet.15: "The search bar should be at a similar
    // place as in the library tab, with a button to add researchers above the left top left"): Add a researcher an
    // icon button in the left pane's top toolbar; the search at the right end of a toolbar above the table, where
    // Zotero's quick search sits. Written before the code: fails on c0f2bcff.
    it("Add a researcher in the left pane's top toolbar; the search at the right end of the table's toolbar", function () {
        const side = q(".wv-pp-side");
        const stb = side.firstElementChild;
        assert.isTrue(stb.classList.contains("toolbar") && stb.classList.contains("wv-pp-tb"), "the left pane opens with a toolbar: " + stb.className);
        const add = stb.querySelector("[data-wv-pp-act='add-researcher']");
        assert.isOk(add, "Add a researcher in it");
        assert.strictEqual(add.localName, "toolbarbutton", "an icon button, as New Collection");
        assert.strictEqual(add.getAttribute("tooltiptext"), "Add a researcher");
        assert.strictEqual(String(add.getAttribute("label") || "").trim(), "", "no text: the icon");
        const s = q(".wv-pp-main .wv-pp-tb .wv-pp-search");
        assert.isOk(s, "the search in the table's toolbar");
        assert.strictEqual(s.localName, "search-textbox", "Zotero's generic search field");
        assert.strictEqual(s.getAttribute("placeholder"), "Search researchers");
        const tb = s.closest(".wv-pp-tb").getBoundingClientRect(), sr = s.getBoundingClientRect();
        assert.isAtMost(tb.right - sr.right, 12, "right-aligned: " + JSON.stringify([tb.right, sr.right]));
        assert.isAbove(sr.width, 100, "Zotero's quick-search width: " + sr.width);
        const count = q(".wv-pp-main .wv-pp-tb .wv-pp-tcount");
        assert.match(count.textContent, /3\D*researchers/, "the count at its left");
        assert.isBelow(count.getBoundingClientRect().left, sr.left);
        assert.isTrue(!!(s.compareDocumentPosition(q(".wv-pp-table")) & win.Node.DOCUMENT_POSITION_FOLLOWING), "above the table");
    });

    // A double-click opens the page (1.3.0-peoplenet.16: one click selects the
    // row for the right pane, as Zotero's items list; test/people-pane.spec.js).
    const dbl = (row) => row.querySelector(".wv-pp-tnametext").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }));
    it("a double-click on a row opens the page; its Back arrow returns to the table", async function () {
        dbl(rowOf(recs.Bird.id));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + recs.Bird.id + "']") ? true : null), 4000, 30), "Bird's page");
        assert.isNull(q(".wv-pp-table"));
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 4000, 30), "the table again");
        assert.isNull(wv._wvPeopleViewOf(win).sel);
        dbl(rowOf(recs.Thoraval.id));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + recs.Thoraval.id + "']") ? true : null), 4000, 30));
        // The page: initials in the header, the institution under the name, the
        // cards in two columns (Identifiers, Career, Contact, custom fields left;
        // the academic family and the events right) -- in the view mode, the cards
        // with something to show only (MJT 2026-11-26).
        assert.strictEqual(q(".wv-pp-head .wv-pp-havatar").textContent, "MT");
        assert.include(q(".wv-pp-hsub").textContent, "LadHyX");
        assert.deepEqual(qa("[data-wv-pp-col='left'] > .wv-pp-sec").map((s) => s.getAttribute("data-wv-pp-sec")), ["facts"]);
        assert.deepEqual(qa("[data-wv-pp-col='right'] > .wv-pp-sec").map((s) => s.getAttribute("data-wv-pp-sec")), []);
        // Empty fields hidden; the Edit pencil shows every field, the empty ones with their Add.
        assert.isOk(q("[data-wv-pp-flabel='institution']"), "a field with a value shows");
        assert.isNull(q("[data-wv-pp-flabel='position']"), "an empty one does not");
        q("[data-wv-pp-act='page-edit']").click();
        assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-fact='position'] [data-wv-pp-do='add']"), 4000, 30), "with the pencil: the empty field and its Add");
        // Tags last (1.3.0-peoplenet.17, test/people-tags.spec.js).
        assert.deepEqual(qa("[data-wv-pp-col='left'] > .wv-pp-sec").map((s) => s.getAttribute("data-wv-pp-sec")), ["ids", "facts", "contact", "custom", "tags"], "every card");
        assert.deepEqual(qa("[data-wv-pp-col='right'] > .wv-pp-sec").map((s) => s.getAttribute("data-wv-pp-sec")), ["links", "events"]);
        assert.isOk(q("[data-wv-pp-act='page-done']"), "Done, in the pencil's place");
        q("[data-wv-pp-act='page-done']").click();
        assert.isOk(await wvT.waitFor(() => (!q("[data-wv-pp-flabel='position']") && q("[data-wv-pp-act='page-edit']") ? true : null), 4000, 30), "off again");
        // A value's actions on a right-click too.
        const val = q("[data-wv-pp-fact='institution'] .wv-pp-val");
        val.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
        const pop = await wvT.waitFor(() => win.document.getElementById("wv-pp-row-menu"), 3000, 30);
        assert.isOk(pop, "the menu");
        assert.includeMembers(Array.from(pop.querySelectorAll("menuitem")).map((m) => m.getAttribute("data-wv-pp-do")), ["reject", "edit"]);
        try { pop.hidePopup(); } catch (e) {}
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 4000, 30));
        // Enter on the table opens the row it has (Zotero's table: its selection, onActivate).
        const tree = wv._wvPeopleTableOf(win);
        assert.isOk(tree, "the VirtualizedTable");
        tree.selection.select(wv._wvPeopleTableIds(win).indexOf(recs.Lohse.id));
        q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + recs.Lohse.id + "']") ? true : null), 4000, 30), "Enter opens it too");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 3 ? true : null), 4000, 30));
    });

    it("+ Add a researcher: a name; OpenAlex's profiles of that name to pick from; a name already there opens its page", async function () {
        const asked = [];
        wv._wvPeopleGet = async (url) => {
            asked.push(String(url));
            if (url.startsWith("https://api.openalex.org/authors?search=")) {
                return { meta: { count: 2 }, results: [
                    { id: "https://openalex.org/A9990011", display_name: "Jane Q. Doe", orcid: null, works_count: 12, last_known_institutions: [{ display_name: "MIT" }] },
                    { id: "https://openalex.org/A9990012", display_name: "Jane Doe", orcid: null, works_count: 3, last_known_institutions: [] },
                ] };
            }
            return { meta: { count: 0 }, results: [] };
        };
        try {
            assert.isOk(q(".wv-pp-side [data-wv-pp-act='add-researcher']"), "the button, at the top of the left pane");
            const rec = await wv._wvPeopleAddByName(win, "Jane Doe");
            assert.isOk(rec);
            assert.deepEqual([rec.last, rec.first, rec.check], ["Doe", "Jane", true], "marked To check");
            assert.isOk(await wvT.waitFor(() => (qa("[data-wv-pp-cand]").length === 2 ? true : null), 8000, 40), "the two profiles to pick from");
            assert.isOk(asked.some((u) => /authors\?search=Jane(%20|\+)Doe/.test(u)), "searched by the name: " + asked.join(" "));
            const n = wv._wvPeopleAllSync().length;
            const again = await wv._wvPeopleAddByName(win, "Doe, Jane");
            assert.strictEqual(again.id, rec.id, "the same researcher");
            assert.strictEqual(wv._wvPeopleAllSync().length, n, "no second record");
            assert.strictEqual(wv._wvPeopleViewOf(win).sel, rec.id, "its page");
            await wv._wvPeopleRemove(rec.id);
        }
        finally {
            // The lookup the add started ends here, on the stub: left running, it went on
            // to the network once the stub was gone and saved -- a redraw of the tab
            // under a later spec (people.spec.js's hover card, 1.3.0-peoplenet.16).
            await wvT.waitFor(() => (!wv._wvPeopleBusy || !wv._wvPeopleBusy.size ? true : null), 15000, 50);
            delete wv._wvPeopleGet;
        }
    });

    it("the order, as a function: followed first, the unknown last both ways", function () {
        const infos = new Map([["a", { institution: "B" }], ["b", { institution: "" }], ["c", { institution: "A" }], ["d", { institution: "C" }]]);
        const rs = [{ id: "a", last: "A", first: "", followed: false }, { id: "b", last: "B", first: "", followed: false }, { id: "c", last: "C", first: "", followed: false }, { id: "d", last: "D", first: "", followed: true }];
        assert.deepEqual(lib.wvPpTableSort(rs, infos, "institution", "asc", null).map((r) => r.id), ["d", "c", "a", "b"]);
        assert.deepEqual(lib.wvPpTableSort(rs, infos, "institution", "desc", null).map((r) => r.id), ["d", "a", "c", "b"]);
    });
});
