/* global describe, it, before, after, assert, Zotero, wvT */

// A twisty, `+` or `-` in the items list while a Weavero filter hides rows above
// the selection keeps the same items selected (filter.ts runQueued). The tree's
// selection holds FILTERED indices; Zotero's own toggle runs with the filter's
// SELF flag set, where getRow answers raw rows, so it reads and moves the
// selection in the wrong index space. Found by the 11.0-beta.5 upstream check
// (2026-11-22), and not new there: on 1.2.1-dev.71 (df1b4378) the three filter
// cases below failed on Zotero 10.0.8, 11.0-beta.4 and 11.0-beta.5 alike. An
// open above the selected row emptied the selection or moved it to the parent's
// first attachment (both seen on beta.4; beta.5's batched toggles, zotero
// 0cd866f79d `_batchRowChanges`, remap it by row ID, same outcome); a pair
// {parent, target} became {parent, that attachment}; collapsing a parent whose
// child was selected selected the target instead of the parent.
describe("Weavero — a twisty under the items-list filter keeps the selection", function () {
    this.timeout(120000);
    let wv, win, zp, iv, rp, N1, N2, N3, P, T, a1, a2;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    /** The ids the list shows, through the filter's translation. */
    const shown = () => {
        const out = [];
        const n = rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); out.push(r && r.ref ? r.ref.id : null); }
        return out;
    };
    const quiet = () => wvT.waitFor(() => (!wv._filterApplying && !(wv._suppressTreeObserverUntil > Date.now())) || null, 8000, 50);
    const group = (f) => { const g = wv._emptyFilterGroup(); f(g); return { groups: [g], activeGroupIndex: 0 }; };
    const abstractFilter = () => group((g) => { g.hasAbstract = true; });
    const none = () => ({ groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 });
    async function apply(state) {
        await quiet();
        wv._filterState = state;
        wv._renderFilterBar();
        wv._applyItemsListFilter({ deliberate: true, cascade: true });
        await quiet();
        await sleep(300);
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
    }
    /** What the tree has selected, by identity, through the translation. */
    const selectedIDs = () => Array.from(iv.selection.selected).map(i => { const r = rp.getRow(i); return r && r.ref ? r.ref.id : null; }).sort((x, y) => x - y);
    const paneIDs = () => zp.getSelectedItems().map(x => x.id).sort((x, y) => x - y);
    const ids = (...items) => items.map(x => x.id).sort((x, y) => x - y);
    async function selectShown(items) {
        const s = shown();
        const idx = items.map(it => s.indexOf(it.id));
        assert.notInclude(idx, -1, "fixture: every row to select is shown");
        iv.selection.clearSelection();
        for (const i of idx) iv.selection.toggleSelect(i);
        iv.selection.focused = idx[idx.length - 1];
        await sleep(400);
        assert.deepEqual(selectedIDs(), ids(...items), "fixture: selected");
    }
    /** The user's twisty on `item`'s row: the filter's own toggle path. */
    async function twisty(item) {
        const i = shown().indexOf(item.id);
        assert.isAtLeast(i, 0, "fixture: the container is shown");
        await rp.toggleOpenState(i);
        await quiet();
        await sleep(500);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_applyItemsListFilter", "_emptyFilterGroup", "_renderFilterBar"]) wvT.method(m);
        win = Zotero.getMainWindow(); zp = win.ZoteroPane; iv = zp.itemsView;
        rp = iv.rowProvider;
        if (!rp) this.skip();   // Zotero 9: the toggles are the items view's own, async
        // Sorted by title: books with no abstract (hidden by the filter) above the parent and the target.
        N1 = await wvT.createItem("book", { title: "wvtw a hidden one" });
        N2 = await wvT.createItem("book", { title: "wvtw b hidden two" });
        P = await wvT.createItem("book", { title: "wvtw c parent", abstractNote: "an abstract" });
        a1 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvtw/1", parentItemID: P.id, title: "wvtw link one" });
        a2 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvtw/2", parentItemID: P.id, title: "wvtw link two" });
        N3 = await wvT.createItem("book", { title: "wvtw c2 hidden three" });
        T = await wvT.createItem("book", { title: "wvtw d target", abstractNote: "an abstract" });
        await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await wvT.waitFor(() => (rp._rowMap && rp._rowMap[T.id] !== undefined) || null, 15000);
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
    });

    after(async function () {
        this.timeout(30000);
        try { await apply(none()); } catch (e) {}
        await wvT.erase(a1, a2, P, T, N1, N2, N3);
    });

    it("an open and a close ABOVE the selected row: the same item stays selected, in the list and the pane", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await apply(abstractFilter());
            const s = shown();
            assert.notInclude(s, N1.id, "fixture: the filter hides the books without an abstract");
            assert.notStrictEqual(rp._rowMap[T.id], s.indexOf(T.id), "fixture: the target's filtered index is not its row index");
            await selectShown([T]);
            await twisty(P);
            assert.include(shown(), a1.id, "fixture: the parent the user opened shows its children");
            assert.deepEqual(selectedIDs(), ids(T), "after the open: the target selected");
            assert.deepEqual(paneIDs(), ids(T), "after the open: the pane's selection is the target");
            await twisty(P);
            assert.deepEqual(selectedIDs(), ids(T), "after the close: the target selected");
            assert.deepEqual(paneIDs(), ids(T), "after the close: the pane's selection is the target");
        });
    });

    it("two rows selected, the upper one opened and closed: both stay selected", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await apply(abstractFilter());
            await selectShown([P, T]);
            await twisty(P);
            assert.deepEqual(selectedIDs(), ids(P, T), "after the open");
            await twisty(P);
            assert.deepEqual(selectedIDs(), ids(P, T), "after the close");
        });
    });

    it("collapsing a parent whose child is selected selects the parent (Zotero's rule)", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await apply(abstractFilter());
            if (!shown().includes(a1.id)) await twisty(P);
            assert.include(shown(), a1.id, "fixture: the child shown");
            await selectShown([a1]);
            await twisty(P);
            assert.deepEqual(selectedIDs(), ids(P), "the parent takes the selection");
            assert.deepEqual(paneIDs(), ids(P), "and the pane shows it");
        });
    });

    it("+ and - (expand all, collapse all) keep the selected item", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await apply(abstractFilter());
            await selectShown([T]);
            rp.expandAllRows();
            await quiet(); await sleep(500);
            assert.deepEqual(selectedIDs(), ids(T), "after +");
            rp.collapseAllRows();
            await quiet(); await sleep(500);
            assert.deepEqual(selectedIDs(), ids(T), "after -");
        });
    });

    it("with no filter the same gestures keep the selection (Zotero's own behaviour, the control)", async function () {
        await apply(none());
        await selectShown([T]);
        await twisty(P);
        assert.deepEqual(selectedIDs(), ids(T), "after the open");
        await twisty(P);
        assert.deepEqual(selectedIDs(), ids(T), "after the close");
    });
});
