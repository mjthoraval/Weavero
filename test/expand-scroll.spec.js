/* global describe, it, before, after, assert, Zotero, wvT */

// Expanding a row at the bottom of the items list shows its child rows (MJT
// 2026-11-25, approved as proposed: "after a twisty click or keyboard expand,
// scroll the minimum that shows the new rows, never pushing the parent off the
// top; Expand All (+) unchanged"). Zotero 11 keeps the viewport on purpose when
// a row toggles (itemTree.jsx, restoreScroll), so a row opened at the bottom edge
// opened out of sight. Contracts:
//  - a twisty click on the last row on screen: its children come into view, the
//    parent stays in view, the list moves no further than that;
//  - more children than the list holds: the parent goes to the top, not past it;
//  - the expand key does the same;
//  - code that opens a row (Weavero's, other plugins', Zotero's own selection),
//    a collapse, and Visual Extras off: no scroll from Weavero;
//  - shutdown leaves no wrap and no listener.

describe("Weavero — expanding a row at the bottom shows its children", function () {
    this.timeout(120000);
    let wv, win, ZP, coll, small, big;
    const items = [];
    const iv = () => ZP.itemsView;
    const tree = () => iv().tree;
    const jsw = () => tree()._jsWindow;
    const pos = (i) => jsw()._getItemPosition(i);
    const H = () => jsw().getWindowHeight();
    const top = () => Number(jsw().scrollOffset);
    const idxOf = (item) => iv().getRowIndexByID(item.treeViewID);
    const rowEl = (i) => win.document.querySelector("#zotero-items-tree .virtualized-table .row[id$='-row-" + i + "']");
    const frame = () => new Promise((r) => win.setTimeout(r, 80));
    const reveals = () => wv._wvXsInspect(win).reveals;

    async function closed(item) {
        const i = idxOf(item);
        if (iv().isContainerOpen(i)) await iv().toggleOpenState(i);
        await frame();
        return idxOf(item);
    }

    /** The row as the last one on screen, its first child just below the edge. */
    async function atBottom(item) {
        const i = await closed(item);
        jsw().scrollTo(Math.max(0, Math.ceil(pos(i + 1) - H())));
        await wvT.waitFor(() => (rowEl(i) ? true : null), 3000, 30);
        await frame();
        // Zotero 10 rounds the offset: a pixel of slack.
        assert.isAtMost(pos(i + 1), top() + H() + 1, "the row is on screen");
        assert.isAbove(pos(i + 1) + 1, top() + H(), "nothing under it on screen");
        return i;
    }

    function twisty(i) {
        const t = rowEl(i) && rowEl(i).querySelector(".twisty");
        assert.isOk(t, "row " + i + " has a twisty");
        t.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, button: 0 }));
        t.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0 }));
    }

    async function makeParent(title, n) {
        const p = /** @type {any} */ (new Zotero.Item("book"));
        p.setField("title", title);
        p.setCollections([coll.id]);
        await p.saveTx({ skipSelect: true });
        items.push(p);
        for (let k = 0; k < n; k++) {
            const note = /** @type {any} */ (new Zotero.Item("note"));
            note.parentID = p.id;
            note.setNote("<p>wv-xs note " + k + "</p>");
            await note.saveTx({ skipSelect: true });
        }
        return p;
    }

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvApplyExpandScroll", "_wvRemoveExpandScroll", "_wvXsInspect"]) wvT.method(m);
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        win.Zotero_Tabs.select("zotero-pane");
        coll = new Zotero.Collection();
        coll.name = "wv-expand-scroll " + Date.now();
        await coll.saveTx();
        for (let k = 0; k < 90; k++) {
            const it = /** @type {any} */ (new Zotero.Item("book"));
            it.setField("title", "wv-xs " + String(k).padStart(2, "0"));
            it.setCollections([coll.id]);
            await it.saveTx({ skipSelect: true });
            items.push(it);
        }
        small = await makeParent("wv-xs 60 parent of six", 6);
        big = await makeParent("wv-xs 70 parent of forty", 40);
        await ZP.collectionsView.selectByID("C" + coll.id);
        await wvT.waitFor(() => (iv().rowCount >= 92 && idxOf(big) !== false ? true : null), 10000);
        iv().selection.clearSelection();
        await wvT.waitFor(() => (wv._wvXsInspect(win).wired ? true : null), 5000);
        if (pos(idxOf(small)) < H()) wvT.absent("the runner's list is too tall to put the row at its bottom");
    });

    after(async function () {
        Zotero.Prefs.clear("weavero.enableVisualExtras");
        try { await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {}
        await wvT.erase(...items, coll);
    });

    it("wired on the items tree, on with Visual Extras", function () {
        const s = wv._wvXsInspect(win);
        assert.isTrue(s.wired);
        assert.isTrue(s.on);
        assert.include(wvT.lib().wvWrapLayers(tree(), "toggleOpenState").map((l) => l.layer), "expandScroll");
        for (const m of ["_getItemPosition", "getWindowHeight", "getItemCount", "scrollTo"]) assert.isFunction(jsw()[m], "_jsWindow." + m);
    });

    it("a twisty click on the last row on screen: its children come into view, the parent stays", async function () {
        const i = await atBottom(small);
        const was = top();
        twisty(i);
        assert.isOk(await wvT.waitFor(() => (pos(i + 1 + 6) <= top() + H() + 1 ? true : null), 4000, 30),
            "the sixth child on screen: its end " + pos(i + 7) + ", view " + top() + " + " + H());
        assert.isTrue(iv().isContainerOpen(i), "the row is open");
        assert.isAtLeast(pos(i), top() - 1, "the parent still on screen");
        assert.isAtMost(top() - was, pos(i + 7) - pos(i + 1) + 1.5, "the list moved no further than the children's height");
    });

    it("more children than the list holds: the parent goes to the top, not past it", async function () {
        const i = await atBottom(big);
        twisty(i);
        assert.isOk(await wvT.waitFor(() => (Math.abs(top() - pos(i)) <= 1 ? true : null), 4000, 30),
            "the parent at the top: view " + top() + ", parent " + pos(i));
        await new Promise((r) => win.setTimeout(r, 300));
        assert.isAtMost(Math.abs(top() - pos(i)), 1, "and it stays there");
    });

    it("the expand key does the same", async function () {
        const i = await closed(small);
        iv().selection.select(i);
        await frame();
        await atBottom(small);
        const r = reveals();
        tree()._topDiv.dispatchEvent(new win.KeyboardEvent("keydown", { key: /** @type {any} */ (Zotero).arrowNextKey, bubbles: true }));
        assert.isOk(await wvT.waitFor(() => (pos(i + 7) <= top() + H() + 1 ? true : null), 4000, 30), "the children on screen");
        assert.strictEqual(reveals(), r + 1, "Weavero's scroll did it");
        iv().selection.clearSelection();
    });

    it("a row opened by code keeps Zotero's viewport: no scroll from Weavero", async function () {
        const i = await atBottom(small);
        const r = reveals();
        await iv().toggleOpenState(i);
        await new Promise((res) => win.setTimeout(res, 300));
        assert.isTrue(iv().isContainerOpen(i));
        assert.strictEqual(reveals(), r, "no reveal");
    });

    it("a collapse scrolls nothing", async function () {
        const i = await atBottom(small);
        await iv().toggleOpenState(i);
        await frame();
        const r = reveals(), was = top();
        twisty(i);
        await wvT.waitFor(() => (!iv().isContainerOpen(i) ? true : null), 3000, 30);
        await new Promise((res) => win.setTimeout(res, 300));
        assert.strictEqual(reveals(), r, "no reveal");
        assert.isAtMost(top(), was + 0.5, "not scrolled down");
    });

    it("Visual Extras off: Zotero's viewport", async function () {
        Zotero.Prefs.set("weavero.enableVisualExtras", false);
        try {
            const i = await atBottom(small);
            const r = reveals();
            twisty(i);
            await wvT.waitFor(() => (iv().isContainerOpen(i) ? true : null), 3000, 30);
            await new Promise((res) => win.setTimeout(res, 300));
            assert.strictEqual(reveals(), r, "no reveal");
        }
        finally { Zotero.Prefs.clear("weavero.enableVisualExtras"); }
    });

    it("shutdown leaves no wrap and no listener; wiring again brings it back", async function () {
        wv._wvRemoveExpandScroll(win);
        try {
            assert.isFalse(wv._wvXsInspect(win).wired);
            assert.notInclude(wvT.lib().wvWrapLayers(tree(), "toggleOpenState").map((l) => l.layer), "expandScroll");
            assert.notInclude(wvT.lib().wvWrapLayers(iv(), "toggleOpenState").map((l) => l.layer), "expandScroll");
            const i = await atBottom(small);
            twisty(i);
            await wvT.waitFor(() => (iv().isContainerOpen(i) ? true : null), 3000, 30);
            await new Promise((res) => win.setTimeout(res, 300));
            assert.isAbove(pos(i + 7), top() + H(), "the children stay below the edge, as in Zotero");
        }
        finally { wv._wvApplyExpandScroll(win); }
        assert.isTrue(wv._wvXsInspect(win).wired);
    });
});
