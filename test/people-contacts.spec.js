/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers tab as Google Contacts, step 2 (design approved by MJT 2026-11-25,
// his answers 2026-11-26). Written before the code: every test failed on
// 1.3.0-peoplenet.14 (56bbe3ce).
//   1. the LEFT PANE is "Views + Manage + Browse": + Add a researcher; the views
//      Researchers / Followed / To check with their counts, the one shown
//      highlighted; "Fix and manage": Suggested links, Duplicates, Sources
//      disagree, Without ORCID, Build from Followed Authors, Import from a file
//      (no Export: Weavero has none yet); "Browse by" (people-browse.spec.js).
//      No list of researchers, no sort control, no funnel there any more.
//   2. ONE SEARCH field across the top of the centre, above the table.
//   3. HOVER ACTIONS at a row's right end: the star (follow / unfollow, filled
//      when followed), the pencil (the page in edit mode), ⋮ (the row's menu,
//      also on a right-click).
//   4. CHECKBOXES on the avatars: a checked row stays checked, Shift+click a
//      range; a bar with the count, select all, Follow, Unfollow, Merge (exactly
//      two, the duplicates' merge); Escape clears.
//   5. COLUMNS as Zotero's items list (Zotero's VirtualizedTable): an empty
//      column hidden by default (Country here), a right-click on the titles opens
//      the column menu with a checkmark per column; the choice, the order and the
//      widths kept in weavero.people.columns.
//   6. No "to check" dot after the names.
//   7. The number columns aligned left, as their titles and the other columns.
//   8. The row's actions keep their room at the end of the header and of every
//      row (MJT 2026-11-27, "Reserve ~88 px"): a followed researcher's ★ hid
//      the PhD year whenever the last column was about 66-118 px wide ("20★3").
//      Written before the code: at 70 and 110 px the ★ sat over the year.
//   9. The PhD year never narrower than a four-digit year (MJT 2026-11-27,
//      21:50: in a 1900-px window every year read "1..." in a 33-px column --
//      his widths stored by a resize: Name 369, Institution 560, Papers 244,
//      PhD year 40). Written before the code: failed on 1.3.0-starn1.2.

describe("Weavero — Researchers as Google Contacts: left pane, search, row actions, checkboxes, columns", function () {
    this.timeout(90000);
    let wv, win, doc;
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns"];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const txt = (el) => String((el && el.textContent) || "").replace(/[⁨⁩]/g, "");
    const rowIndex = (el) => Number(String(el.id).replace(/^.*-row-/, ""));
    const rowEls = () => qa(".wv-pp-table .virtualized-table-body .row[data-wv-pp-person]").sort((a, b) => rowIndex(a) - rowIndex(b));
    const rowIds = () => rowEls().map((r) => r.getAttribute("data-wv-pp-person"));
    const rowOf = (id) => q(".wv-pp-table .row[data-wv-pp-person='" + id + "']");
    const nav = (k) => q(".wv-pp-side [data-wv-pp-nav='" + k + "']");
    const navN = (k) => { const n = nav(k) && nav(k).querySelector(".wv-pp-navn"); return n ? Number(txt(n)) : null; };
    const headKeys = () => qa(".wv-pp-table .virtualized-table-header .cell").map((c) => ["name", "institution", "country", "papers", "phd"].find((k) => c.classList.contains(k)));
    const cols = () => JSON.parse(String(Zotero.Prefs.get("weavero.people.columns") || "{}"));
    const click = (el, opts) => el.dispatchEvent(new win.MouseEvent("click", Object.assign({ bubbles: true, cancelable: true, button: 0 }, opts || {})));
    const sameIds = (want) => JSON.stringify(wv._wvPeopleTableIds(win)) === JSON.stringify(want) && JSON.stringify(rowIds()) === JSON.stringify(want);
    const R = {};
    const L = (fact, value, source, status) => ({ fact, value, source: source || "me", status: status || "chosen" });

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleViewOf", "_wvPeopleCreate", "_wvPeopleTableIds", "_wvPeopleTableOf", "_wvPeopleRowMenu",
            "_wvPeopleColMenu", "_wvPeopleColToggle", "_wvPeopleColReset", "_wvPeopleCheck", "_wvPeopleLibIndexBuild"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        // Bird: Brown, Professor, no PhD year, no ORCID, to check.
        // Lohse: Twente, Professor, PhD 1992, ORCID.
        // Sauret: two institutions from two sources (they disagree), no ORCID, to check.
        // Thoraval: LadHyX, Assistant professor, PhD 2013, ORCID, followed.
        // Nobody has a country.
        R.Bird = await wv._wvPeopleCreate("Bird", "James");
        R.Bird.lines.push(L("institution", "Brown University"), L("position", "Professor"));
        R.Bird.check = true;
        R.Lohse = await wv._wvPeopleCreate("Lohse", "Detlef");
        R.Lohse.lines.push(L("institution", "University of Twente"), L("position", "Professor"), L("phd.year", "1992"), L("orcid", "0000-0002-0000-0071"));
        R.Sauret = await wv._wvPeopleCreate("Sauret", "Alban");
        R.Sauret.lines.push(L("institution", "UC Santa Barbara", "orcid", "confirmed"), L("institution", "University of Maryland", "openalex", "suggested"));
        R.Sauret.check = true;
        R.Thoraval = await wv._wvPeopleCreate("Thoraval", "Marie-Jean");
        R.Thoraval.lines.push(L("institution", "LadHyX"), L("position", "Assistant professor"), L("phd.year", "2013"), L("orcid", "0000-0002-0000-0072"));
        R.Thoraval.followed = true;
        // A new record is To check (wvPpNewRecord): Lohse and Thoraval are not.
        R.Lohse.check = false;
        R.Thoraval.check = false;
        await wv._wvPeopleSave(Object.values(R));
        await wv._wvPeopleLibIndexBuild();
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.filter = "all"; v.view = "table"; v.fix = null; v.q = "";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 8000, 40), "the table's four rows");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        for (const id of ["wv-pp-rowmenu", "wv-pp-colmenu", "wv-pp-mergemenu"]) { const p = doc.getElementById(id); if (p) { try { p.hidePopup(); } catch (e) {} } }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("1. the left pane: + Add a researcher, the views with their counts, Fix and manage, Browse by; no list, no sort, no funnel", async function () {
        const side = q(".wv-pp-side");
        assert.isOk(side.querySelector("[data-wv-pp-act='add-researcher']"), "+ Add a researcher");
        assert.deepEqual(qa(".wv-pp-side [data-wv-pp-nav]").map((b) => b.getAttribute("data-wv-pp-nav")),
            ["all", "followed", "check", "queue", "dupes", "conflict", "noOrcid", "build", "import"], "the entries, in order; no Export");
        assert.deepEqual(["all", "followed", "check", "queue", "dupes", "conflict", "noOrcid"].map(navN), [4, 1, 2, 0, 0, 1, 2], "their counts");
        assert.deepEqual(["all", "followed", "check", "conflict", "noOrcid", "import"].map((k) => txt(nav(k).querySelector(".wv-pp-navlab"))),
            ["Researchers", "Followed", "To check", "Sources disagree", "Without ORCID", "Import from a file…"]);
        assert.deepEqual(qa(".wv-pp-side .wv-pp-navhead").map(txt), ["Fix and manage", "Browse by"]);
        assert.deepEqual(qa(".wv-pp-side [data-wv-pp-browse]").map((b) => b.getAttribute("data-wv-pp-browse")), ["institution", "country", "position"]);
        assert.strictEqual(nav("all").getAttribute("aria-current"), "true", "the view shown, highlighted");
        // Gone from the left pane: the list of researchers, the sort, the funnel, the search.
        assert.lengthOf(qa(".wv-pp-side [data-wv-pp-person]"), 0, "no list of researchers");
        assert.isNull(q("[data-wv-pp-sort]"), "no sort control");
        assert.isNull(q("[data-wv-pp-funnel]"), "no funnel");
        assert.isNull(q(".wv-pp-side .wv-pp-search"), "no search there");
        // Each view: the table follows, the entry highlighted.
        const view = async (k, want) => {
            nav(k).click();
            assert.isOk(await wvT.waitFor(() => (sameIds(want) && nav(k).getAttribute("aria-current") === "true" ? true : null), 4000, 30), k + ": " + rowIds());
            assert.lengthOf(qa(".wv-pp-side [aria-current='true']"), 1, "one entry highlighted");
        };
        await view("followed", [R.Thoraval.id]);
        await view("check", [R.Bird.id, R.Sauret.id]);
        await view("conflict", [R.Sauret.id]);
        await view("noOrcid", [R.Bird.id, R.Sauret.id]);
        await view("all", [R.Thoraval.id, R.Bird.id, R.Lohse.id, R.Sauret.id]);
        // The screens of their own: the suggested links, the duplicates.
        nav("queue").click();
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-queue]") && nav("queue").getAttribute("aria-current") === "true" ? true : null), 4000, 30), "Suggested links");
        nav("dupes").click();
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-dupesview] .wv-pp-hint") ? true : null), 4000, 30), "Duplicates: none here");
        nav("all").click();
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 4000, 30));
    });

    it("2. one search field across the top of the centre, above the table, filters it", async function () {
        const s = q(".wv-pp-main .wv-pp-search");
        assert.isOk(s, "the search in the centre");
        assert.strictEqual(s.getAttribute("placeholder"), "Search researchers");
        assert.isTrue(!!(s.compareDocumentPosition(q(".wv-pp-table")) & win.Node.DOCUMENT_POSITION_FOLLOWING), "above the table");
        s.focus();
        const focusable = doc.activeElement === s;
        s.value = "lohse";
        s.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isOk(await wvT.waitFor(() => (sameIds([R.Lohse.id]) ? true : null), 4000, 30), "one row: " + rowIds());
        const s2 = q(".wv-pp-main .wv-pp-search");
        // (The runner's window is never raised; where it takes the focus at all.)
        if (focusable) assert.strictEqual(doc.activeElement, s2, "the field keeps the focus while typing");
        s2.value = "";
        s2.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 4000, 30));
    });

    it("3. the row's actions: the star follows and unfollows (filled when followed), the pencil opens the page in edit mode, ⋮ and a right-click open the row's menu", async function () {
        const star = () => rowOf(R.Lohse.id).querySelector("[data-wv-pp-ract='follow']");
        assert.deepEqual(Array.from(rowOf(R.Lohse.id).querySelectorAll(".wv-pp-racts [data-wv-pp-ract]")).map((b) => b.getAttribute("data-wv-pp-ract")), ["follow", "edit", "more"]);
        assert.strictEqual(star().getAttribute("aria-pressed"), "false");
        assert.strictEqual(txt(star()), "☆");
        assert.strictEqual(star().getAttribute("title"), "Follow");
        click(star());
        assert.isOk(await wvT.waitFor(() => (R.Lohse.followed && star() && star().getAttribute("aria-pressed") === "true" ? true : null), 4000, 30), "followed");
        assert.strictEqual(txt(star()), "★", "filled");
        assert.strictEqual(star().getAttribute("title"), "Unfollow");
        assert.isNull(wv._wvPeopleViewOf(win).sel, "the star opens nothing");
        assert.isOk(await wvT.waitFor(() => (rowIds()[0] === R.Lohse.id ? true : null), 4000, 30), "the followed first: " + rowIds());
        click(star());
        assert.isOk(await wvT.waitFor(() => (!R.Lohse.followed && star() && star().getAttribute("aria-pressed") === "false" ? true : null), 4000, 30), "unfollowed");
        // The pencil: the page, its Edit pencil on.
        click(rowOf(R.Bird.id).querySelector("[data-wv-pp-ract='edit']"));
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + R.Bird.id + "']") ? true : null), 4000, 30), "Bird's page");
        assert.isOk(q(".wv-pp-main[data-wv-pp-mode='edit'] [data-wv-pp-act='page-done']"), "in edit mode");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 4000, 30));
        // ⋮: the row's menu.
        click(rowOf(R.Bird.id).querySelector("[data-wv-pp-ract='more']"));
        let pop = await wvT.waitFor(() => doc.getElementById("wv-pp-rowmenu"), 3000, 30);
        assert.isOk(pop, "the menu");
        assert.deepEqual(Array.from(pop.querySelectorAll("menuitem")).map((m) => m.getAttribute("data-wv-pp-rmenu")), ["open", "edit", "follow", "checked", "refresh", "remove"]);
        try { pop.hidePopup(); } catch (e) {}
        await wvT.waitFor(() => !doc.getElementById("wv-pp-rowmenu"), 3000, 30);
        // A right-click on the row: the same menu.
        rowOf(R.Lohse.id).querySelector(".wv-pp-tnametext").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 200, screenY: 200 }));
        pop = await wvT.waitFor(() => doc.getElementById("wv-pp-rowmenu"), 3000, 30);
        assert.isOk(pop, "on a right-click");
        assert.deepEqual(Array.from(pop.querySelectorAll("menuitem")).map((m) => m.getAttribute("data-wv-pp-rmenu")), ["open", "edit", "follow", "check", "refresh", "remove"]);
        try { pop.hidePopup(); } catch (e) {}
    });

    it("4. checkboxes: check, Shift+click a range, the bar (count, select all, Follow, Unfollow, Merge with two only); Escape clears", async function () {
        const v = wv._wvPeopleViewOf(win);
        const cb = (id) => rowOf(id).querySelector("input.wv-pp-rowcheck");
        const bar = () => q(".wv-pp-selbar");
        const merge = () => bar() && bar().querySelector("[data-wv-pp-bulk='merge']");
        const ids = wv._wvPeopleTableIds(win);
        assert.deepEqual(ids, [R.Thoraval.id, R.Bird.id, R.Lohse.id, R.Sauret.id]);
        assert.isNull(bar(), "no bar while nothing is checked");
        click(cb(ids[0]));
        assert.isOk(await wvT.waitFor(() => (bar() && rowOf(ids[0]).getAttribute("data-wv-pp-checked") === "true" ? true : null), 4000, 30), "checked, the bar");
        assert.strictEqual(txt(bar().querySelector(".wv-pp-selcount")), "1 selected");
        assert.isTrue(merge().disabled, "Merge needs two");
        assert.isNull(v.sel, "a checkbox opens nothing");
        assert.isOk(q(".wv-pp-table.wv-pp-checking"), "every row shows its checkbox now");
        click(cb(ids[2]), { shiftKey: true });
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 3 ? true : null), 4000, 30), "Shift+click: the range");
        assert.deepEqual(ids.filter((id) => rowOf(id).getAttribute("data-wv-pp-checked") === "true"), ids.slice(0, 3));
        assert.isTrue(merge().disabled, "three: no Merge");
        click(cb(ids[1]));
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 2 ? true : null), 4000, 30), "one unchecked");
        assert.isFalse(merge().disabled, "two: Merge");
        // Follow, Unfollow: both at once.
        click(bar().querySelector("[data-wv-pp-bulk='follow']"));
        assert.isOk(await wvT.waitFor(() => (R.Thoraval.followed && R.Lohse.followed ? true : null), 4000, 30), "followed");
        click(bar().querySelector("[data-wv-pp-bulk='unfollow']"));
        assert.isOk(await wvT.waitFor(() => (!R.Thoraval.followed && !R.Lohse.followed ? true : null), 4000, 30), "unfollowed");
        R.Thoraval.followed = true;
        await wv._wvPeopleSave([R.Thoraval]);
        // Merge: which one to keep, then the duplicates' own merge (its question).
        const asked = [];
        const orig = wv._wvPeopleMergeAsk;
        wv._wvPeopleMergeAsk = (w, keep, drop) => { asked.push([keep, drop]); };
        try {
            assert.isOk(await wvT.waitFor(() => (merge() && !merge().disabled ? true : null), 4000, 30));
            click(merge());
            const pop = await wvT.waitFor(() => { const p = doc.getElementById("wv-pp-mergemenu"); return p && p.state === "open" ? p : null; }, 3000, 30);
            assert.isOk(pop, "Merge into which one");
            const items = Array.from(pop.querySelectorAll("menuitem"));
            assert.sameMembers(items.map((m) => m.getAttribute("data-wv-pp-keep")), [R.Thoraval.id, R.Lohse.id]);
            items[0].doCommand();
            assert.isOk(await wvT.waitFor(() => (asked.length === 1 ? true : null), 3000, 30), "the merge asked");
            assert.sameMembers(asked[0], [R.Thoraval.id, R.Lohse.id]);
            try { pop.hidePopup(); } catch (e) {}
        }
        finally { wv._wvPeopleMergeAsk = orig; }
        // Select all, then none.
        click(bar().querySelector("input.wv-pp-selall"));
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 4 ? true : null), 4000, 30), "all");
        click(bar().querySelector("input.wv-pp-selall"));
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 0 && !bar() ? true : null), 4000, 30), "none");
        // Ctrl+click a row: checked, not opened.
        click(rowOf(ids[3]).querySelector(".wv-pp-tnametext"), Zotero.isMac ? { metaKey: true } : { ctrlKey: true });
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 1 && v.checked.has(ids[3]) ? true : null), 4000, 30), "Ctrl+click checks");
        assert.isNull(v.sel);
        // Escape on the table clears.
        q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (v.checked.size === 0 && !bar() ? true : null), 4000, 30), "Escape clears");
    });

    it("5. columns: an empty one hidden (Country; Papers, nobody being in the runner's library); the titles' right-click menu lists every column with a checkmark; shown and hidden by the user, kept; order and widths kept", async function () {
        assert.deepEqual(headKeys(), ["name", "institution", "phd"]);
        q(".wv-pp-table .virtualized-table-header").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 220, screenY: 220 }));
        const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-colmenu"), 3000, 30);
        assert.isOk(pop, "the column menu");
        const items = Array.from(pop.querySelectorAll("menuitem[data-wv-pp-colmenu]"));
        const checked = (m) => m.hasAttribute("checked") && m.getAttribute("checked") !== "false";
        assert.deepEqual(items.map((m) => m.getAttribute("data-wv-pp-colmenu") + ":" + checked(m)),
            // Tags (1.3.0-peoplenet.17, test/people-tags.spec.js): hidden until shown.
            ["name:true", "institution:true", "country:false", "papers:false", "phd:true", "tags:false", "reset:false"]);
        assert.strictEqual(items[0].getAttribute("label"), "Name");
        assert.isTrue(items[0].hasAttribute("disabled"), "Name always shows");
        try { pop.hidePopup(); } catch (e) {}
        // Shown by the user: kept as their choice.
        wv._wvPeopleColToggle(win, "country");
        assert.isOk(await wvT.waitFor(() => (headKeys().includes("country") ? true : null), 4000, 30), "Country shown: " + headKeys());
        assert.strictEqual(cols().country.shown, true, "kept in weavero.people.columns");
        wv._wvPeopleColToggle(win, "phd");
        assert.isOk(await wvT.waitFor(() => (!headKeys().includes("phd") ? true : null), 4000, 30), "PhD year hidden: " + headKeys());
        assert.strictEqual(cols().phd.shown, false);
        // The order and a width, as Zotero's table stores them (a title dragged, a border dragged).
        const tree = wv._wvPeopleTableOf(win);
        const at = (k) => tree._getColumns().findIndex((c) => c.dataKey === k);
        tree._columns.setOrder(at("country"), at("institution"));
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(headKeys()) === JSON.stringify(["name", "country", "institution"]) ? true : null), 4000, 30), "moved: " + headKeys());
        assert.isBelow(cols().country.ordinal, cols().institution.ordinal, "the order kept");
        tree._columns.onResize({ institution: 260, country: 140 }, true);
        const w = cols().institution.width;
        assert.isAbove(w, 100, "the width kept: " + JSON.stringify(cols()));
        // Drawn again from nothing (the tab closed and opened): all of it back.
        wv._wvPeopleTabClose(win);
        wv._wvPeopleTabOpen(win, {});
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(headKeys()) === JSON.stringify(["name", "country", "institution"]) ? true : null), 8000, 40), "after a new start: " + headKeys());
        const t2 = wv._wvPeopleTableOf(win);
        assert.strictEqual(Math.round(t2._getColumns().find((c) => c.dataKey === "institution").width), Math.round(w), "the width");
        // Restore default columns: the automatic rule again.
        wv._wvPeopleColReset(win);
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(headKeys()) === JSON.stringify(["name", "institution", "phd"]) ? true : null), 4000, 30), "reset: " + headKeys());
        assert.notProperty(cols().country || {}, "shown");
    });

    it("6. no dot after the names; 7. the number columns aligned left, as the others", async function () {
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.filter = "all"; v.fix = null;
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 4000, 30));
        assert.lengthOf(qa(".wv-pp-mark"), 0, "no mark after a name");
        for (const r of rowEls()) assert.notInclude(txt(r.querySelector(".cell.name")), "●", "no dot: " + txt(r));
        assert.isTrue(R.Bird.check, "Bird is To check, without a dot");
        // Papers shown for the check, with a value.
        wv._wvPeopleColToggle(win, "papers");
        assert.isOk(await wvT.waitFor(() => (headKeys().includes("papers") ? true : null), 4000, 30));
        const row = rowOf(R.Lohse.id);
        const align = (el) => win.getComputedStyle(el).textAlign;
        for (const k of ["phd", "papers"]) {
            const cell = row.querySelector(".cell." + k);
            assert.isOk(cell, k);
            assert.include(["start", "left"], align(cell), k + " cells: aligned left");
            assert.strictEqual(align(cell), align(row.querySelector(".cell.institution")), k + ": as the other columns");
        }
        assert.strictEqual(txt(row.querySelector(".cell.phd")), "1992");
        // The year's text starts where its title's does (Zotero's padding, no right alignment).
        const head = q(".wv-pp-table .virtualized-table-header .cell.phd .label");
        const yr = row.querySelector(".cell.phd");
        const rng = doc.createRange();
        rng.selectNodeContents(yr);
        const tx = rng.getBoundingClientRect().left, hx = head.getBoundingClientRect().left;
        assert.isBelow(Math.abs(tx - hx), 12, "the year under its title's start: " + tx + " vs " + hx);
        wv._wvPeopleColReset(win);
    });

    it("8. with the last column narrow (70 px, 110 px), the ★ covers no PhD year: no cell reaches under the row's actions, and the header's and the rows' cells still line up", async function () {
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.filter = "all"; v.fix = null; v.q = "";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 ? true : null), 4000, 30));
        const keys = headKeys();
        assert.strictEqual(keys[keys.length - 1], "phd", "the PhD year is the last column: " + keys);
        const tree = wv._wvPeopleTableOf(win);
        const head = (k) => q(".wv-pp-table .virtualized-table-header .cell." + k);
        const rect = (el) => el.getBoundingClientRect();
        const textRect = (el) => { const rg = doc.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); };
        const px = (n) => Math.round(n * 10) / 10;
        const frame = () => new Promise((r) => win.requestAnimationFrame(() => r(undefined)));
        try {
            for (const last of [70, 110]) {
                // The columns' room as drawn now (the header's cells fill it), shared so that
                // the last column gets `last` px and the widths add up to the room (nothing
                // to grow or shrink): the middle columns 40 % of the rest, Name what is left.
                // Set as Zotero's own resize sets them (VirtualizedTable's onResize takes the
                // cells' border-box widths).
                const room = keys.reduce((s, k) => s + rect(head(k)).width, 0);
                const mids = keys.slice(1, -1);
                const widths = {};
                for (const k of mids) widths[k] = Math.round((room - last) * 0.4 / mids.length);
                widths[keys[0]] = room - last - mids.reduce((s, k) => s + widths[k], 0);
                widths.phd = last;
                tree._columns.onResize(widths);
                await frame();
                const hp = rect(head("phd"));
                assert.closeTo(hp.width, last, 2, "the PhD year's column at " + last + " px");
                for (const id of [R.Thoraval.id, R.Lohse.id]) {
                    const row = rowOf(id);
                    const at = id === R.Thoraval.id ? "Thoraval (followed, PhD 2013)" : "Lohse (PhD 1992)";
                    const yr = row.querySelector(".cell.phd");
                    assert.match(txt(yr), /^\d{4}$/, at + ": a year in the cell");
                    const t = textRect(yr), s = rect(row.querySelector("[data-wv-pp-ract='follow']"));
                    assert.isTrue(t.right <= s.left + 0.5 || t.left >= s.right - 0.5,
                        at + ", last column " + last + " px: the ★ (" + px(s.left) + "-" + px(s.right) + ") over the year (" + px(t.left) + "-" + px(t.right) + ")");
                    // Nothing under the actions box at all (its start padding paints the row's colour too).
                    const acts = rect(row.querySelector(".wv-pp-racts"));
                    for (const k of keys) {
                        const c = rect(row.querySelector(".cell." + k)), h = rect(head(k));
                        assert.isAtMost(c.right, acts.left + 0.5, at + ", " + last + " px: the " + k + " cell ends before the actions (" + px(c.right) + " vs " + px(acts.left) + ")");
                        assert.closeTo(c.left, h.left, 1.5, at + ", " + last + " px: the " + k + " cell starts under its title");
                        assert.closeTo(c.right, h.right, 1.5, at + ", " + last + " px: the " + k + " cell ends under its title");
                    }
                }
            }
        }
        finally {
            wv._wvPeopleColReset(win);
        }
    });

    it("9. the PhD year is never narrower than a four-digit year: with widths like MJT's, every year reads whole, the ★ stays clear of it, the columns stay under their titles; a wider width the user gave stays theirs", async function () {
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.filter = "all"; v.fix = null; v.q = "";
        wv._wvPeopleColReset(win);
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowEls().length === 4 && JSON.stringify(headKeys()) === JSON.stringify(["name", "institution", "phd"]) ? true : null), 4000, 30));
        const tree = wv._wvPeopleTableOf(win);
        const head = (k) => q(".wv-pp-table .virtualized-table-header .cell." + k);
        const rect = (el) => el.getBoundingClientRect();
        const textRect = (el) => { const rg = doc.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); };
        const px = (n) => Math.round(n * 10) / 10;
        const frame = () => new Promise((r) => win.requestAnimationFrame(() => r(undefined)));
        const check = (what) => {
            for (const id of [R.Thoraval.id, R.Lohse.id]) {
                const row = rowOf(id);
                const yr = row.querySelector(".cell.phd");
                assert.match(txt(yr), /^\d{4}$/, what + ": a year in the cell");
                assert.isAtMost(yr.scrollWidth, yr.clientWidth, what + ": the year " + txt(yr) + " whole, not cut (" + px(rect(yr).width) + " px wide)");
                const t = textRect(yr), s = rect(row.querySelector("[data-wv-pp-ract='follow']"));
                assert.isTrue(t.right <= s.left + 0.5 || t.left >= s.right - 0.5, what + ": the ★ (" + px(s.left) + "-" + px(s.right) + ") over the year (" + px(t.left) + "-" + px(t.right) + ")");
                for (const k of headKeys()) {
                    const c = rect(row.querySelector(".cell." + k)), h = rect(head(k));
                    assert.closeTo(c.left, h.left, 1.5, what + ": the " + k + " cell starts under its title");
                    assert.closeTo(c.right, h.right, 1.5, what + ": the " + k + " cell ends under its title");
                }
            }
        };
        try {
            // The columns' room as drawn now, and the row's whole width before the
            // actions' room was taken from it.
            const room = headKeys().reduce((s, k) => s + rect(head(k)).width, 0);
            const whole = room + 88;
            // (a) The year column at 40 px (MJT's stored width), the others filling
            // the whole row: the actions' room comes out of every column.
            const name = Math.round((whole - 40) * 0.4);
            tree._columns.onResize({ name, institution: whole - 40 - name, phd: 40 });
            await frame();
            check("the year column at 40 px of a whole row");
            // (b) MJT's own stored widths, Papers shown.
            wv._wvPeopleColToggle(win, "papers");
            assert.isOk(await wvT.waitFor(() => (headKeys().includes("papers") ? true : null), 4000, 30));
            wv._wvPeopleTableOf(win)._columns.onResize({ name: 369, institution: 560, papers: 244, phd: 40 });
            await frame();
            check("MJT's widths (369, 560, 244, 40)");
            wv._wvPeopleColReset(win);
            assert.isOk(await wvT.waitFor(() => (JSON.stringify(headKeys()) === JSON.stringify(["name", "institution", "phd"]) ? true : null), 4000, 30));
            // (c) A year column made wider (121 px of a whole row): its share of the
            // room taken, the rest of it the user's -- wider than the floor.
            const name2 = Math.round((whole - 121) * 0.4);
            wv._wvPeopleTableOf(win)._columns.onResize({ name: name2, institution: whole - 121 - name2, phd: 121 });
            await frame();
            check("the year column at 121 px of a whole row");
            const floor = parseFloat(win.getComputedStyle(head("phd")).minWidth);
            // The measured floor, into the scaffold's log (as the pending tally).
            const note = "[wv-test] PhD year floor: " + floor + " px (a year: " + px(textRect(rowOf(R.Lohse.id).querySelector(".cell.phd")).width) + " px)";
            try { if (typeof globalThis.debug === "function") globalThis.debug(note); } catch (e) {}
            assert.isAbove(rect(head("phd")).width, floor + 20, "121 px of a whole row: wider than the floor (" + floor + " px)");
            for (const id of [R.Thoraval.id, R.Lohse.id]) assert.strictEqual(win.getComputedStyle(rowOf(id).querySelector(".cell.phd")).minWidth, floor + "px", "the rows' floor is the header's");
        }
        finally {
            wv._wvPeopleColReset(win);
        }
    });
});
