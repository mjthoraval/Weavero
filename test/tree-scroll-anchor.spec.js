/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-6023 (pane.ts): expanding a row above the selection pushed the
// expanded row up, off screen when it was at the top (zotero/zotero#6023,
// upstream register #24). Weavero mirrors zotero/zotero PR #6049 while it is
// unmerged (MJT 2026-10-26: "Can you add it to Weavero while the PR gets
// accepted? Make sure to remove the fix when Zotero fixes the problem, and
// that it still works after being fixed by Zotero."). The scenarios are the
// PR's own tests.
//
// TRIPWIRE: the first test checks that Zotero still has the bug. When it
// fails, Zotero has changed its scroll save: check whether #6049 shipped,
// then retire WV-TEMP-6023 (Weavero already installs nothing then).

describe("Weavero — WV-TEMP-6023: an expanded row stays where it was", function () {
    this.timeout(90000);
    let wv, win, ZP, iv, coll, parent, items = [];

    const tb = () => iv._treebox;
    const pos = (i) => (typeof tb().getRowPosition === "function" ? tb().getRowPosition(i) : tb()._getItemPosition(i));

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvWireTreeScrollAnchorFix", "_wvTeardownTreeScrollAnchorFix", "_wvTreeScrollAnchorNeeded"]) wvT.method(m);
        win = Zotero.getMainWindow(); ZP = win.ZoteroPane;
        coll = new Zotero.Collection();
        coll.name = "WV scroll anchor " + Date.now();
        await coll.saveTx();
        iv = ZP.itemsView;
        const visible = Math.max(10, iv._treebox.getLastVisibleRow() - iv._treebox.getFirstVisibleRow());
        const num = visible + 30;
        // The container sorts first; more rows below it than fit in the view.
        parent = new Zotero.Item("book");
        parent.setField("title", "0".repeat(6));
        parent.addToCollection(coll.id);
        await parent.saveTx({ skipSelect: true });
        await wvT.createTestPDFItem("wv-scroll-anchor", { parentItemID: parent.id });
        await Zotero.DB.executeTransaction(async () => {
            for (let i = 1; i < num; i++) {
                const it = new Zotero.Item("book");
                it.setField("title", String(i).padStart(6, "0"));
                it.addToCollection(coll.id);
                await it.save({ skipSelect: true });
                items.push(it);
            }
        });
        await ZP.collectionsView.selectByID("C" + coll.id);
        iv = ZP.itemsView;
        await iv.waitForLoad();
    });

    after(async function () {
        try { wv._wvWireTreeScrollAnchorFix(win); } catch (e) {}
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await wvT.erase(parent, ...items, coll);
    });

    /** The PR's scenario: the container at the top, a row below it
     *  selected, the container opened. Returns the scroll before and after. */
    async function expandAboveSelection() {
        let row = iv.getRowIndexByID(parent.id);
        if (iv.isContainerOpen(row)) { await iv.toggleOpenState(row); await iv.waitForLoad(); }
        row = iv.getRowIndexByID(parent.id);
        assert.strictEqual(row, 0, "the container sorts first");
        tb().scrollTo(pos(row));
        const before = tb().scrollOffset;
        await iv.selectItem(iv.getRow(row + 2).ref.id);
        await iv.toggleOpenState(row);
        await iv.waitForLoad();
        assert.isTrue(iv.isContainerOpen(row), "opened");
        return { before, after: tb().scrollOffset, visible: iv.tree.rowIsVisible(row) };
    }

    it("TRIPWIRE: Zotero's own scroll save still pushes the expanded row up (#6023 unfixed)", async function () {
        assert.isTrue(wv._wvTreeScrollAnchorNeeded(iv), "Zotero's _saveScrollPosition / _restoreScrollPosition are still the ones with the bug -- if not, check zotero/zotero#6049 and retire WV-TEMP-6023");
        wv._wvTeardownTreeScrollAnchorFix();
        try {
            const r = await expandAboveSelection();
            assert.notStrictEqual(r.after, r.before, "without Weavero the list moves -- if it no longer does, Zotero fixed #6023: retire WV-TEMP-6023");
        }
        finally { wv._wvWireTreeScrollAnchorFix(win); }
    });

    it("with the fix, opening a container above the selection does not move the list", async function () {
        const r = await expandAboveSelection();
        assert.strictEqual(r.after, r.before, "the list stays put");
        assert.isTrue(r.visible, "the expanded row stays in view");
    });

    it("an edit that re-sorts the selected item keeps it at the same place on screen, to the pixel", async function () {
        let row = iv.getRowIndexByID(parent.id);
        if (iv.isContainerOpen(row)) { await iv.toggleOpenState(row); await iv.waitForLoad(); }
        const it = items[8];
        await iv.selectItem(it.id);
        tb().scrollTo(pos(4) + 7);
        const offset = pos(iv.getRowIndexByID(it.id)) - tb().scrollOffset;
        it.setField("title", "000012a");
        await it.saveTx();
        await iv.waitForLoad();
        assert.strictEqual(pos(iv.getRowIndexByID(it.id)) - tb().scrollOffset, offset);
    });

    it("stands down when Zotero's scroll save has changed (the fix shipped, in any form)", function () {
        const fixed = {
            _saveScrollPosition() { return { offset: 0 }; },
            _restoreScrollPosition(p) { return p; },
            notify() {},
        };
        assert.isFalse(wv._wvTreeScrollAnchorNeeded(fixed), "a changed scroll save is Zotero's fix");
        const save = fixed._saveScrollPosition, notify = fixed.notify;
        wv._wvWireTreeScrollAnchorFix({ ZoteroPane: { itemsView: fixed } });
        assert.strictEqual(fixed._saveScrollPosition, save, "Zotero's own save runs");
        assert.strictEqual(fixed.notify, notify, "Zotero's own notify runs");
        assert.isUndefined(fixed._wvWraps, "nothing wrapped");
    });
});
