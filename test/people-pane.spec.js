/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// The Researchers tab's right pane (MJT 2026-11-26, on peoplenet.14's Lohse page:
// "Try making a right pane, similar to the right pane of the library, but in a
// compact way, to get a bit more details on researcher than what can be seen from
// the items list"), Zotero's library model:
//   - left pane | the table | a right pane of details, resizable by its splitter,
//     collapsible as Zotero's item pane, its width and state kept (a pref);
//   - one click (or the arrow keys) selects a row and shows it in the pane, the
//     table stays; a double-click, Enter or the pane's Open opens the full page;
//   - several rows checked: "N researchers selected" and the bulk actions;
//     nothing selected: a short hint, as Zotero's "No item selected";
//   - the pane is the page's view mode, narrow: no source chip, no Add...
// Written before the code: every test failed on 1.3.0-peoplenet.15.
//   - ALL the facts of the page's Facts section, in the record's order, each
//     only with a value (MJT 2026-11-27, 21:52, "like the full page's view
//     mode"). Written before the code: failed on 1.3.0-starn1.2 (position and
//     institution only).

describe("Weavero — Researchers: the right pane", function () {
    this.timeout(90000);
    let wv, win, doc;
    const R = {};
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns", "people.pane"];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const txt = (el) => String((el && el.textContent) || "").replace(/[⁨⁩]/g, "");
    const L = (fact, value, source, status, more) => Object.assign({ fact, value, source: source || "me", status: status || "chosen" }, more || {});
    const rowOf = (id) => q(".wv-pp-table .row[data-wv-pp-person='" + id + "']");
    const pane = () => q(".wv-pp-pane");
    const press = (el, opts) => {
        for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new win.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0 }, opts || {})));
    };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleViewOf", "_wvPeopleCreate", "_wvPeopleTableOf", "_wvPeoplePaneToggle", "_wvPeopleLibIndexBuild"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        R.Lohse = await wv._wvPeopleCreate("Lohse", "Detlef");
        R.Lohse.check = false;
        R.Lohse.lines.push(L("orcid", "0000-0003-4138-2255"), L("openalex", "A5066010665", "openalex", "confirmed"),
            L("institution", "University of Twente", "orcid", "confirmed"), L("institution", "Twente", "openalex", "suggested"),
            L("position", "Professor"),
            L("link.student", "Ann One"), L("link.student", "Bob Two"), L("link.student", "Cy Three"), L("link.student", "Dee Four"),
            L("link.advisor", "Siegfried Grossmann", "me", "chosen", { years: "1992" }));
        R.Lohse.from = { key: "ABCD1234", title: "Rayleigh-Bénard convection" };
        R.Bird = await wv._wvPeopleCreate("Bird", "James");
        R.Bird.lines.push(L("institution", "Brown University"));
        await wv._wvPeopleSave(Object.values(R));
        await wv._wvPeopleLibIndexBuild();
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.filter = "all"; v.fix = null; v.q = "";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowOf(R.Lohse.id) && rowOf(R.Bird.id) ? true : null), 8000, 40), "the table");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the layout: the left pane, the table, the splitter, the right pane; nothing selected: a hint", function () {
        const r = root();
        const kids = Array.from(r.children).map((c) => c.classList[0]);
        assert.deepEqual(kids.filter((k) => /^wv-pp-(side|main|splitter|pane)$/.test(k)), ["wv-pp-side", "wv-pp-main", "wv-pp-splitter", "wv-pp-pane"]);
        assert.strictEqual(pane().getAttribute("data-wv-pp-pane"), "none");
        assert.strictEqual(txt(pane().querySelector(".wv-pp-pane-hint")), "No researcher selected");
    });

    it("a click selects the row and shows it in the pane; the table stays; the arrow keys move it", async function () {
        press(rowOf(R.Lohse.id).querySelector(".wv-pp-tnametext"));
        assert.isOk(await wvT.waitFor(() => (pane() && pane().getAttribute("data-wv-pp-person") === R.Lohse.id ? true : null), 4000, 30), "Lohse in the pane");
        assert.isNull(wv._wvPeopleViewOf(win).sel, "no page opened");
        assert.isOk(q(".wv-pp-table"), "the table stays");
        // The pane: the header, the identifiers on one line, the position and institution shown, the links, the library.
        assert.strictEqual(txt(pane().querySelector(".wv-pp-avatar")), "DL");
        assert.include(txt(pane().querySelector(".wv-pp-name")), "Lohse");
        assert.include(txt(pane().querySelector(".wv-pp-hsub")), "University of Twente");
        assert.deepEqual(Array.from(pane().querySelectorAll("[data-wv-pp-ids] [data-wv-url]")).map((a) => a.getAttribute("data-wv-pp-id")), ["orcid", "openalex"]);
        assert.deepEqual(Array.from(pane().querySelectorAll("[data-wv-pp-fact='institution'] .wv-pp-val")).map((e) => e.getAttribute("data-value")), ["University of Twente"], "the institution shown only");
        const students = pane().querySelector("[data-wv-pp-fact='link.student']");
        assert.lengthOf(students.querySelectorAll(".wv-pp-val"), 3, "three names");
        assert.match(txt(students.querySelector(".wv-pp-more")), /1 more/);
        assert.include(txt(pane().querySelector("[data-wv-pp-from]")), "Rayleigh-Bénard convection");
        assert.isOk(pane().querySelector("[data-wv-pp-libitems]"), "the library's line");
        // No source chip, no Add..., no family tree.
        for (const sel of [".wv-pp-src", "[data-wv-pp-do='add']", ".wv-pp-vbtns", "[data-wv-pp-sec='tree']", ".wv-pp-linkadd"]) assert.isNull(pane().querySelector(sel), "none in the pane: " + sel);
        assert.deepEqual(Array.from(pane().querySelectorAll(".wv-pp-actions [data-wv-pp-act]")).map((b) => b.getAttribute("data-wv-pp-act")), ["follow", "page-edit", "more", "pane-open"]);
        // The arrow keys move the selection; the pane follows.
        const tree = wv._wvPeopleTableOf(win);
        const ids = wv._wvPeopleTableIds(win);
        q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: ids.indexOf(R.Bird.id) < ids.indexOf(R.Lohse.id) ? "ArrowUp" : "ArrowDown", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (pane().getAttribute("data-wv-pp-person") === R.Bird.id ? true : null), 4000, 30), "Bird in the pane");
        assert.strictEqual(ids[tree.selection.focused], R.Bird.id);
    });

    it("a double-click, Enter or Open opens the full page", async function () {
        const back = async () => {
            q("[data-wv-pp-act='back']").click();
            assert.isOk(await wvT.waitFor(() => (rowOf(R.Lohse.id) ? true : null), 4000, 30));
        };
        rowOf(R.Lohse.id).querySelector(".wv-pp-tnametext").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + R.Lohse.id + "']") ? true : null), 4000, 30), "double-click: the page");
        assert.isNull(pane(), "no pane beside the page");
        await back();
        const tree = wv._wvPeopleTableOf(win);
        tree.selection.select(wv._wvPeopleTableIds(win).indexOf(R.Bird.id));
        q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + R.Bird.id + "']") ? true : null), 4000, 30), "Enter: the page");
        await back();
        press(rowOf(R.Lohse.id).querySelector(".wv-pp-tnametext"));
        const open = await wvT.waitFor(() => pane().querySelector("[data-wv-pp-act='pane-open']"), 4000, 30);
        open.click();
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + R.Lohse.id + "']") ? true : null), 4000, 30), "Open: the page");
        await back();
    });

    it("several rows checked: the count and the bulk actions in the pane", async function () {
        const cb = (id) => rowOf(id).querySelector("input.wv-pp-rowcheck");
        press(cb(R.Lohse.id));
        press(cb(R.Bird.id));
        assert.isOk(await wvT.waitFor(() => (pane().getAttribute("data-wv-pp-pane") === "many" ? true : null), 4000, 30), "the count");
        assert.strictEqual(txt(pane().querySelector(".wv-pp-pane-count")), "2 researchers selected");
        assert.includeMembers(Array.from(pane().querySelectorAll("[data-wv-pp-bulk]")).map((b) => b.getAttribute("data-wv-pp-bulk")), ["follow", "unfollow", "merge"]);
        q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (pane().getAttribute("data-wv-pp-pane") !== "many" ? true : null), 4000, 30), "back to one");
    });

    it("the pane collapses and opens again; its state and width survive the tab's reopening", async function () {
        const w0 = pane().getBoundingClientRect().width;
        assert.isAbove(w0, 150, "a pane with a width");
        wv._wvPeoplePaneToggle(win, true);
        assert.isOk(await wvT.waitFor(() => (root().getAttribute("data-wv-pp-pane-collapsed") === "true" ? true : null), 4000, 30), "collapsed");
        assert.strictEqual(win.getComputedStyle(pane()).display, "none", "out of the way");
        assert.isTrue(JSON.parse(String(Zotero.Prefs.get("weavero.people.pane") || "{}")).c, "kept");
        wv._wvPeopleTabClose(win);
        wv._wvPeopleTabOpen(win, {});
        assert.isOk(await wvT.waitFor(() => (root() && root().getAttribute("data-wv-pp-pane-collapsed") === "true" ? true : null), 8000, 40), "still collapsed after a reopening");
        // The splitter's button opens it again.
        q(".wv-pp-splitter [data-wv-pp-act='pane-toggle']").click();
        assert.isOk(await wvT.waitFor(() => (root().getAttribute("data-wv-pp-pane-collapsed") !== "true" && pane() && win.getComputedStyle(pane()).display !== "none" ? true : null), 4000, 30), "open again");
        assert.isFalse(!!JSON.parse(String(Zotero.Prefs.get("weavero.people.pane") || "{}")).c);
        // A width set by the splitter is kept too.
        Zotero.Prefs.set("weavero.people.pane", JSON.stringify({ w: 333 }));
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (Math.round(pane().getBoundingClientRect().width) === 333 ? true : null), 4000, 30), "333 px: " + pane().getBoundingClientRect().width);
    });

    it("the pane shows every fact of the page's Facts section, in the record's order, each with its value; none that has no value", async function () {
        const FACTS = ["position", "institution", "country", "phd.institution", "phd.country", "phd.year", "phd.thesis", "birth.year", "web"];
        R.Gross = await wv._wvPeopleCreate("Grossmann", "Siegfried");
        R.Gross.check = false;
        R.Gross.lines.push(L("position", "Professor emeritus"), L("institution", "Philipps-Universität Marburg"), L("country", "DE"),
            L("phd.institution", "Universität Marburg"), L("phd.country", "DE"), L("phd.year", "1965"),
            L("phd.thesis", "Zur Theorie der Transportprozesse"), L("birth.year", "1930"), L("web", "https://example.org/grossmann"));
        await wv._wvPeopleSave([R.Gross]);
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowOf(R.Gross.id) ? true : null), 4000, 30), "Grossmann in the table");
        const show = async (id) => {
            const v = wv._wvPeopleViewOf(win);
            v.checked = new Set();
            v.paneSel = id;
            wv._wvPeoplePaneFill(win);
            assert.isOk(await wvT.waitFor(() => (pane() && pane().getAttribute("data-wv-pp-person") === id ? true : null), 4000, 30), "in the pane: " + id);
        };
        const factsShown = () => Array.from(pane().querySelectorAll("[data-wv-pp-sec='facts'] [data-wv-pp-fact]")).map((e) => e.getAttribute("data-wv-pp-fact"));
        const valueOf = (f) => txt(pane().querySelector("[data-wv-pp-sec='facts'] [data-wv-pp-fact='" + f + "'] .wv-pp-vtext"));
        await show(R.Gross.id);
        assert.deepEqual(factsShown(), FACTS, "every fact, in the record's order");
        assert.deepEqual(Array.from(pane().querySelectorAll("[data-wv-pp-sec='facts'] [data-wv-pp-flabel]")).map((e) => e.getAttribute("data-wv-pp-flabel")), FACTS, "each with its label");
        for (const e of pane().querySelectorAll("[data-wv-pp-sec='facts'] [data-wv-pp-flabel]")) assert.isAbove(txt(e).length, 0, "a label's text: " + e.getAttribute("data-wv-pp-flabel"));
        assert.strictEqual(valueOf("position"), "Professor emeritus");
        assert.strictEqual(valueOf("country"), "Germany", "a country by its name");
        assert.strictEqual(valueOf("phd.country"), "Germany");
        assert.strictEqual(valueOf("phd.institution"), "Universität Marburg");
        assert.strictEqual(valueOf("phd.year"), "1965");
        assert.strictEqual(valueOf("phd.thesis"), "Zur Theorie der Transportprozesse");
        assert.strictEqual(valueOf("birth.year"), "1930");
        assert.strictEqual(pane().querySelector("[data-wv-pp-sec='facts'] [data-wv-pp-fact='web'] .wv-pp-vtext").getAttribute("data-wv-url"), "https://example.org/grossmann", "the web page a link");
        // The view mode: no source, no button.
        for (const sel of [".wv-pp-src", ".wv-pp-vbtns", "[data-wv-pp-do='add']"]) assert.isNull(pane().querySelector("[data-wv-pp-sec='facts'] " + sel), "none in the pane: " + sel);
        // The pane's narrow layout: the labels' column at most 40 % of it.
        const fg = pane().querySelector("[data-wv-pp-sec='facts'] .wv-pp-facts");
        const lw = Math.max(...Array.from(fg.querySelectorAll(".wv-pp-flabel")).map((e) => e.getBoundingClientRect().width));
        assert.isAtMost(lw, fg.getBoundingClientRect().width * 0.4 + 0.5, "the labels' column");
        // A researcher with the institution alone: that fact alone, no empty field.
        await show(R.Bird.id);
        assert.deepEqual(factsShown(), ["institution"], "no field without a value");
        // And the page's view mode shows the same facts as the pane.
        wv._wvPeopleTableOpen(win, R.Gross.id, false);
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + R.Gross.id + "']") ? true : null), 4000, 30), "the page");
        assert.deepEqual(Array.from(q(".wv-pp-main [data-wv-pp-sec='facts']").querySelectorAll("[data-wv-pp-fact]")).map((e) => e.getAttribute("data-wv-pp-fact")), FACTS, "the page's own Facts");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowOf(R.Lohse.id) ? true : null), 4000, 30));
    });
});
