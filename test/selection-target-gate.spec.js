/* global describe, it, before, after, assert, Zotero, wvT */

// Ctrl+A in the items list takes the rows of the resolved Selection Target
// only (filter.ts `_patchIsSelectable`): Zotero asks `isSelectable(i, true)`
// for every row in one loop. 2026-11-21: what no row changes (the option, the
// target, the filter state) is resolved once per Select All instead of once
// per row (Select All 352 ms vs 35 without Weavero on MJT's 17,962 rows). The
// gate's answers must not change, and a change between two Select Alls must
// be seen by the second.
describe("Weavero — Select All takes the Selection Target's rows", function () {
    this.timeout(60000);
    let wv, win, zp, iv, parent, note;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const idx = (it) => iv.getRowIndexByID(it.id);
    const gate = (it) => iv.isSelectable(idx(it), true);

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._effectiveSelectionTargetKinds !== "function" || typeof wv._patchIsSelectable !== "function") wvT.absent("Selection Target gate");
        win = Zotero.getMainWindow(); zp = win.ZoteroPane; iv = zp.itemsView;
        await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await sleep(400);
        const lib = Zotero.Libraries.userLibraryID;
        parent = new Zotero.Item("journalArticle"); parent.libraryID = lib; parent.setField("title", "WV-TEST seltarget parent"); await parent.saveTx();
        note = new Zotero.Item("note"); note.libraryID = lib; note.parentID = parent.id; note.setNote("<p>WV-TEST seltarget note</p>"); await note.saveTx();
        await sleep(400);
        const ip = idx(parent);
        assert.notStrictEqual(ip, false, "fixture: the parent is listed");
        if (!iv.isContainerOpen(ip)) iv.toggleOpenState(ip);
        await wvT.waitFor(() => idx(note) !== false || null, 3000);
        assert.notStrictEqual(idx(note), false, "fixture: its note is listed");
        wv._patchIsSelectable();
    });

    after(async function () {
        try { wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 }; } catch (e) {}
        try { await parent.eraseTx(); } catch (e) {}
    });

    it("no target and no filter: every row; a Parent target: the parent, not its note; then Note: the note, not the parent", async function () {
        wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 };
        await sleep(0);
        assert.isTrue(gate(parent), "no target: the parent");
        assert.isTrue(gate(note), "no target: the note");
        // An explicit Selection Target chip (a note is its own kind, child or
        // standalone: _rowKindOf's four types, 2026-08-19).
        wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0, selectionTarget: { parent: true } };
        await sleep(0);   // a new Select All: the next task
        assert.isTrue(gate(parent), "Parent: the parent");
        assert.isFalse(gate(note), "Parent: not the note");
        wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0, selectionTarget: { note: true } };
        await sleep(0);
        assert.isFalse(gate(parent), "Note: not the parent");
        assert.isTrue(gate(note), "Note: the note");
        // One synchronous loop answers from one resolution, as Zotero's
        // selectAll asks: the whole list in the same answer (Note target).
        const n = iv.rowCount;
        let sel = 0;
        for (let i = 0; i < n; i++) if (iv.isSelectable(i, true)) sel++;
        assert.isAtLeast(sel, 1, "the loop selects the note at least");
        assert.isBelow(sel, n, "and not every row");
        wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0, selectionTarget: { attachment: true } };
        await sleep(0);
        assert.isFalse(gate(note), "Attachment: not the note (a note is not an attachment)");
    });

    it("a filter on: the smart target's kinds, and only the filter's matches", async function () {
        // (The state is read by the gate as set; no apply: the rows stay.)
        const g = wv._emptyFilterGroup();
        g.itemType = ["journalArticle"];
        wv._filterState = { groups: [g], activeGroupIndex: 0 };
        await sleep(0);
        assert.isTrue(wv._wvUserFilterActive(wv._filterState), "fixture: the filter is on");
        assert.deepEqual(wv._effectiveSelectionTargetKinds(), { parent: true, attachment: false, note: false, annotation: false }, "fixture: an item-type filter targets parents");
        assert.isTrue(gate(parent), "the parent: a match, of the target's kind");
        assert.isFalse(gate(note), "its note: not of the target's kind");
        // Every kind targeted: the filter's matches alone (the primary gate).
        const g2 = wv._emptyFilterGroup();
        g2.itemType = ["journalArticle"];
        wv._filterState = { groups: [g2], activeGroupIndex: 0, selectionTarget: { parent: true, attachment: true, note: true, annotation: true } };
        await sleep(0);
        assert.isTrue(gate(parent), "every kind: the matching parent");
        assert.isFalse(gate(note), "every kind: not the note, which is no journal article");
        wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 };
        await sleep(0);
        assert.isTrue(gate(note), "filter off again: the note");
    });
});
