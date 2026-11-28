/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Tags on researchers (MJT 2026-11-26: "I should also be able to tag authors, same as for the Zotero
// items"; his choices: a Zotero-style tag selector at the bottom of the left pane; coloured tags with
// their position 1-9 -- first in the selector, dots on the rows, the number keys toggling them on the
// selected researchers; the researchers' own tag list, typing suggesting the items' tags too, one
// spelling across both). Zotero's own rules (xpcom/data/tags.js, containers/tagSelectorContainer.jsx):
// the selected tags combine with AND; the coloured ones come first by position; a number key toggles --
// every selected one has the tag: off for all, else on for all. Stored in people.json, never a library.
// Written before the code: every test fails on 1.3.0-peoplenet.16.

describe("Weavero — Researchers: tags", function () {
    this.timeout(90000);
    let wv, lib, win, doc;
    const R = {};
    const made = [];
    const PREFS = ["people.sort", "people.show", "people.filters", "people.columns", "people.pane"];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const ids = () => wv._wvPeopleTableIds(win);
    const rowOf = (id) => q(".wv-pp-table .row[data-wv-pp-person='" + id + "']");
    const tagEl = (name) => q(".wv-pp-tagsel .wv-pp-tag[data-wv-pp-tag='" + name + "']");
    const tagNames = () => qa(".wv-pp-tagsel .wv-pp-tag").map((t) => t.getAttribute("data-wv-pp-tag"));
    const tagsOf = (id) => (wv._wvPeopleGetRec(id).tags || []).slice().sort();
    const key = (k) => q("#wv-pp-tbl").dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const press = (el) => { for (const t of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new win.MouseEvent(t, { bubbles: true, cancelable: true, button: 0 })); };

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleViewOf", "_wvPeopleCreate", "_wvPeopleTableOf", "_wvPeopleTagColorSet", "_wvPeopleTagSel", "_wvPeopleItemTags", "_wvPeopleBulkTagAdd"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        for (const [last, first, tags] of [["Ahlers", "Guenter", ["convection", "Göttingen"]], ["Bourouiba", "Lydia", ["convection"]], ["Clanet", "Christophe", null]]) {
            const r = await wv._wvPeopleCreate(last, first);
            r.check = false;
            if (tags) r.tags = tags;
            R[last] = r;
        }
        await wv._wvPeopleSave(Object.values(R));
        // An item tag of the runner's own library (never a real one): typing offers it too.
        const it = await wvT.createItem("journalArticle", { title: "WV-TEST people tags" });
        it.addTag("Turbulence-ItemTag");
        await it.saveTx();
        made.push(it);
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.view = "table"; v.filter = "all"; v.fix = null; v.q = "";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (rowOf(R.Ahlers.id) && rowOf(R.Clanet.id) ? true : null), 8000, 40), "the table");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const it of made) { try { await it.eraseTx(); } catch (e) {} }
        for (const k of PREFS) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the rules, as functions: Zotero's order, AND, toggling, colours, one spelling, suggestions", function () {
        const recs = [{ id: "a", tags: ["x", "y"] }, { id: "b", tags: ["x"] }, { id: "c" }];
        assert.deepEqual(lib.wvPpTagFilter(recs, ["x", "y"]).map((r) => r.id), ["a"], "AND");
        assert.deepEqual(lib.wvPpTagList(recs, [{ name: "y", color: "#ff6666" }], ["x"]).map((t) => [t.name, t.position, t.selected, t.disabled]),
            [["y", 0, false, false], ["x", null, true, false]], "the coloured first, by position");
        assert.isTrue(lib.wvPpTagList([recs[2]], [{ name: "y", color: "#ff6666" }], []).find((t) => t.name === "y").disabled, "a coloured tag nobody in view has: listed, disabled");
        const two = [{ id: "a", tags: ["x"] }, { id: "b", tags: ["x"] }];
        assert.isFalse(lib.wvPpTagToggle(two, "x").on, "all have it: off for all");
        assert.deepEqual(two.map((r) => r.tags || []), [[], []]);
        const mixed = [{ id: "a", tags: ["x"] }, { id: "b" }];
        assert.isTrue(lib.wvPpTagToggle(mixed, "x").on, "some have it: on for all");
        assert.deepEqual(mixed.map((r) => r.tags), [["x"], ["x"]]);
        let colors = lib.wvPpTagColorSet([], "x", "#FF6666");
        colors = lib.wvPpTagColorSet(colors, "y", "#2ea8e5", 0);
        assert.deepEqual(colors, [{ name: "y", color: "#2ea8e5" }, { name: "x", color: "#ff6666" }]);
        assert.deepEqual(lib.wvPpTagColorSet(colors, "y", null), [{ name: "x", color: "#ff6666" }]);
        assert.strictEqual(lib.wvPpTagSpelling("GÖTTINGEN", ["Göttingen"], []), "Göttingen");
        assert.strictEqual(lib.wvPpTagSpelling("turbulence-itemtag", [], ["Turbulence-ItemTag"]), "Turbulence-ItemTag");
        assert.deepEqual(lib.wvPpTagSuggest("tur", ["Turbines"], ["Turbulence-ItemTag", "turbines"]).map((s) => [s.name, s.from]),
            [["Turbines", "people"], ["Turbulence-ItemTag", "items"]], "the researchers' first; one spelling");
    });

    it("the tag selector at the bottom of the left pane: a click filters (AND), Deselect all, its own search", async function () {
        const sel = q(".wv-pp-side > .wv-pp-tagsel");
        assert.isOk(sel, "under the left pane");
        assert.strictEqual(sel, q(".wv-pp-side").lastElementChild, "at its bottom");
        assert.deepEqual(tagNames(), ["convection", "Göttingen"]);
        press(tagEl("convection"));
        assert.isOk(await wvT.waitFor(() => (sameSet(ids(), [R.Ahlers.id, R.Bourouiba.id]) ? true : null), 4000, 30), "convection: " + ids());
        assert.strictEqual(tagEl("convection").getAttribute("aria-checked"), "true");
        press(tagEl("Göttingen"));
        assert.isOk(await wvT.waitFor(() => (sameSet(ids(), [R.Ahlers.id]) ? true : null), 4000, 30), "both: AND");
        q(".wv-pp-tagsel [data-wv-pp-act='tagsel-actions']").click();
        const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-tagsel-menu"), 4000, 30);
        pop.querySelector("[data-wv-pp-tagsel='deselect']").doCommand();
        try { pop.hidePopup(); } catch (e) {}
        assert.isOk(await wvT.waitFor(() => (ids().length === 3 ? true : null), 4000, 30), "Deselect all");
        const s = q(".wv-pp-tagsel .wv-pp-tagsel-search");
        assert.strictEqual(s.localName, "search-textbox");
        s.value = "gott";
        s.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(tagNames()) === JSON.stringify(["Göttingen"]) ? true : null), 4000, 30), "case- and accent-insensitive: " + tagNames());
        const s2 = q(".wv-pp-tagsel .wv-pp-tagsel-search");
        s2.value = "";
        s2.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isOk(await wvT.waitFor(() => (tagNames().length === 2 ? true : null), 4000, 30));
        // The table's search finds tags too.
        const v = wv._wvPeopleViewOf(win);
        v.q = "gottingen";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => (sameSet(ids(), [R.Ahlers.id]) ? true : null), 4000, 30), "searched by a tag");
        v.q = "";
        wv._wvPeopleTabRender(win);
    });

    it("coloured tags: first in the selector with their colour, dots on the rows; a number key toggles that tag on the selected researchers", async function () {
        await wv._wvPeopleTagColorSet(win, "Göttingen", "#2ea8e5");
        await wv._wvPeopleTagColorSet(win, "convection", "#ff6666", 0);
        assert.isOk(await wvT.waitFor(() => (JSON.stringify(tagNames()) === JSON.stringify(["convection", "Göttingen"]) && tagEl("convection").classList.contains("colored") ? true : null), 4000, 30), "the coloured first, by position: " + tagNames());
        assert.strictEqual(tagEl("convection").getAttribute("data-color"), "#ff6666");
        assert.deepEqual(Array.from(rowOf(R.Ahlers.id).querySelectorAll(".wv-pp-tdot")).map((d) => d.getAttribute("data-color")), ["#ff6666", "#2ea8e5"], "position order");
        assert.lengthOf(rowOf(R.Clanet.id).querySelectorAll(".wv-pp-tdot"), 0);
        // One row selected (the right pane's), key 1: Bourouiba has convection -> off.
        const tree = wv._wvPeopleTableOf(win);
        tree.selection.select(ids().indexOf(R.Bourouiba.id));
        key("1");
        assert.isOk(await wvT.waitFor(() => (tagsOf(R.Bourouiba.id).length === 0 ? true : null), 4000, 30), "off: " + tagsOf(R.Bourouiba.id));
        key("1");
        assert.isOk(await wvT.waitFor(() => (tagsOf(R.Bourouiba.id).includes("convection") ? true : null), 4000, 30), "on again");
        // Two checked (Ahlers has Göttingen, Clanet not), key 2: on for both.
        wv._wvPeopleViewOf(win).checked = new Set([R.Ahlers.id, R.Clanet.id]);
        wv._wvPeopleTabRender(win);
        key("2");
        assert.isOk(await wvT.waitFor(() => (tagsOf(R.Clanet.id).includes("Göttingen") && tagsOf(R.Ahlers.id).includes("Göttingen") ? true : null), 4000, 30), "on for both");
        key("2");
        assert.isOk(await wvT.waitFor(() => (!tagsOf(R.Clanet.id).includes("Göttingen") && !tagsOf(R.Ahlers.id).includes("Göttingen") ? true : null), 4000, 30), "every one had it: off for both");
        key("9");
        await new Promise((res) => win.setTimeout(res, 200));
        assert.deepEqual(tagsOf(R.Clanet.id), [], "no ninth colour: nothing");
        wv._wvPeopleViewOf(win).checked = new Set();
        wv._wvPeopleTabRender(win);
    });

    it("bulk: the checked researchers tagged and untagged from the bar", async function () {
        const v = wv._wvPeopleViewOf(win);
        v.checked = new Set([R.Bourouiba.id, R.Clanet.id]);
        wv._wvPeopleTabRender(win);
        const btn = await wvT.waitFor(() => q(".wv-pp-selbar [data-wv-pp-bulk='tag']"), 4000, 30);
        assert.isOk(btn, "Tag in the bar");
        btn.click();
        const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-bulktag-menu"), 4000, 30);
        const item = pop.querySelector("[data-wv-pp-bulktag='convection']");
        assert.isOk(item, "the tags listed");
        assert.notStrictEqual(item.getAttribute("checked"), "true", "not every one has it");
        item.doCommand();
        try { pop.hidePopup(); } catch (e) {}
        assert.isOk(await wvT.waitFor(() => (tagsOf(R.Clanet.id).includes("convection") ? true : null), 4000, 30), "on for both");
        await wv._wvPeopleBulkTagAdd(win, "DROPS");
        assert.deepEqual([tagsOf(R.Bourouiba.id).includes("DROPS"), tagsOf(R.Clanet.id).includes("DROPS")], [true, true], "a new tag on both");
        await wv._wvPeopleBulkTagAdd(win, "drops");
        assert.deepEqual(tagsOf(R.Clanet.id).filter((t) => t.toLowerCase() === "drops"), ["DROPS"], "one spelling");
        v.checked = new Set();
        wv._wvPeopleTabRender(win);
    });

    it("the page: the tags as chips; in the edit mode, added with suggestions -- the items' tags too, their spelling -- and removed", async function () {
        wv._wvPeopleTableOpen(win, R.Clanet.id, true);
        const inp = await wvT.waitFor(() => q("[data-wv-pp-sec='tags'] [data-wv-pp-focus='tagadd']"), 4000, 30);
        assert.isOk(inp, "the edit mode's tag field");
        await wv._wvPeopleItemTags();
        inp.focus();
        inp.value = "turb";
        inp.dispatchEvent(new win.Event("input", { bubbles: true }));
        const opt = await wvT.waitFor(() => q("[data-wv-pp-sec='tags'] [data-wv-pp-tagsugg='Turbulence-ItemTag']"), 4000, 30);
        assert.isOk(opt, "an item tag suggested");
        assert.strictEqual(opt.getAttribute("data-from"), "items");
        inp.value = "TURBULENCE-itemtag";
        inp.dispatchEvent(new win.Event("input", { bubbles: true }));
        inp.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        assert.isOk(await wvT.waitFor(() => (tagsOf(R.Clanet.id).includes("Turbulence-ItemTag") ? true : null), 4000, 30), "the item tag's spelling: " + tagsOf(R.Clanet.id));
        const x = await wvT.waitFor(() => q("[data-wv-pp-sec='tags'] .wv-pp-tagchip[data-wv-pp-tag='DROPS'] [data-wv-pp-tagdel]"), 4000, 30);
        x.click();
        assert.isOk(await wvT.waitFor(() => (!tagsOf(R.Clanet.id).includes("DROPS") ? true : null), 4000, 30), "removed");
        wv._wvPeoplePageEdit(win, false);
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-sec='tags'] .wv-pp-tagchip[data-wv-pp-tag='Turbulence-ItemTag']") && !q("[data-wv-pp-sec='tags'] [data-wv-pp-focus='tagadd']") ? true : null), 4000, 30), "the view mode: chips, no field");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (rowOf(R.Clanet.id) ? true : null), 4000, 30));
    });

    it("the Tags column: hidden by default, in the column menu, the tags when shown", async function () {
        const head = () => qa(".wv-pp-table .virtualized-table-header .cell").map((c) => c.classList.contains("tags"));
        assert.isFalse(head().includes(true), "hidden by default");
        const pop = wv._wvPeopleColMenu(win, null, 10, 10);
        const mi = await wvT.waitFor(() => doc.querySelector("#wv-pp-colmenu [data-wv-pp-colmenu='tags'], [data-wv-pp-colmenu='tags']"), 4000, 30);
        assert.isOk(mi, "in the column menu");
        mi.doCommand();
        try { (pop && pop.hidePopup) ? pop.hidePopup() : mi.parentNode.hidePopup(); } catch (e) {}
        assert.isOk(await wvT.waitFor(() => (head().includes(true) ? true : null), 4000, 30), "shown");
        assert.include(rowOf(R.Ahlers.id).querySelector("[data-wv-pp-col='tags']").textContent, "convection");
        wv._wvPeopleColToggle(win, "tags");
    });

    it("kept in people.json: the tags and the colours read back", async function () {
        const raw = JSON.parse(await IOUtils.readUTF8(storePath()));
        assert.deepEqual(raw.tagColors.map((c) => c.name), ["convection", "Göttingen"]);
        assert.include(raw.people.find((p) => p.id === R.Ahlers.id).tags, "convection");
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        assert.include(wv._wvPeopleGetRec(R.Clanet.id).tags, "Turbulence-ItemTag");
        assert.deepEqual(wv._wvPeopleTagColors().map((c) => [c.name, c.color]), [["convection", "#ff6666"], ["Göttingen", "#2ea8e5"]]);
    });
});
