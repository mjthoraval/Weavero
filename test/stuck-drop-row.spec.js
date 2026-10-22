/* global describe, it, before, after, assert, Zotero */

// WV-TEMP-133039 (forums 133039 / 134011, upstream register #23): both trees
// remember the drop target by row INDEX (`_dropRow`) and clear it only on the
// row's dragleave, on drop and on dragend. A drag that ends without them
// reaching the tree (an external file taken out of the window fast) left a
// grey row, at the same position in every collection, until the next drag.
// Weavero backports Zotero 896a3f829 (2026-10-13): the next mousemove over
// the tree clears it, and so does any change of the items list's rows. The
// state a lost drag leaves is set directly here -- a remembered drop row,
// painted -- and then no drag event follows. FAILED on 0.22.2-dev.52.

describe("Weavero — a drop highlight left by a lost drag clears (WV-TEMP-133039)", function () {
    this.timeout(60000);
    let wv, win, ZP, item;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        item = await wvT.createItem("journalArticle", { title: "WV stuck drop row" });
        await wvT.waitFor(() => ZP.itemsView.getRowIndexByID(item.id) !== false, 10000);
    });

    after(async function () {
        try { ZP.itemsView._dropRow = null; ZP.collectionsView._dropRow = null; } catch (e) {}
        try { await wvT.erase(item); } catch (e) {}
    });

    // What a drag ending outside the tree leaves: the row index, painted grey.
    const leave = (view, row) => {
        view._dropRow = row;
        view.tree.invalidateRow(row);
    };
    const greyRows = (view) => view.domEl.querySelectorAll(".row.drop").length;
    const mousemove = (view) => view.domEl.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true }));

    it("items list: the next mousemove over the tree clears it", async function () {
        const view = ZP.itemsView;
        leave(view, view.getRowIndexByID(item.id));
        await wvT.waitFor(() => greyRows(view) === 1, 3000);
        assert.strictEqual(greyRows(view), 1, "the grey row is painted (the bug's state)");
        mousemove(view);
        assert.isNull(view._dropRow);
        await wvT.waitFor(() => greyRows(view) === 0, 3000);
        assert.strictEqual(greyRows(view), 0, "no grey row left");
    });

    it("items list: a change of rows clears it (the highlight is by index)", async function () {
        const view = ZP.itemsView;
        leave(view, view.getRowIndexByID(item.id));
        await wvT.waitFor(() => greyRows(view) === 1, 3000);
        await view.refresh();
        assert.isNull(view._dropRow, "cleared when the rows changed");
        await wvT.waitFor(() => greyRows(view) === 0, 3000);
        assert.strictEqual(greyRows(view), 0);
    });

    it("collections pane: the next mousemove over the tree clears it", async function () {
        const view = ZP.collectionsView;
        leave(view, 0);
        await wvT.waitFor(() => greyRows(view) === 1, 3000);
        assert.strictEqual(greyRows(view), 1, "the grey row is painted");
        mousemove(view);
        assert.isNull(view._dropRow);
        await wvT.waitFor(() => greyRows(view) === 0, 3000);
        assert.strictEqual(greyRows(view), 0);
    });

    // Beyond Zotero's commit (MJT 2026-10-19, "Can you make a better fix?"):
    // Gecko skips a row's dragleave when the pointer leaves it fast -- the
    // dev.54 drag ring caught it four times in one drag, the next drag event
    // landing on the item pane. The mousemove clear then waits for the pointer
    // to come back over THAT tree; a drag event elsewhere clears at once.
    // FAILED on dev.54 (both rows stayed grey).
    const drag = (type, target, rel) => target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, relatedTarget: rel || null }));
    const outside = () => win.document.getElementById("zotero-items-toolbar") || win.document.documentElement;

    it("a drag event over anything outside a tree clears its stuck row at once, in both trees", async function () {
        const iv = ZP.itemsView, cv = ZP.collectionsView;
        leave(iv, iv.getRowIndexByID(item.id));
        leave(cv, 0);
        await wvT.waitFor(() => greyRows(iv) === 1 && greyRows(cv) === 1, 3000);
        drag("dragover", outside());
        assert.isNull(iv._dropRow, "items list");
        assert.isNull(cv._dropRow, "collections pane");
        await wvT.waitFor(() => greyRows(iv) === 0 && greyRows(cv) === 0, 3000);
        assert.deepEqual([greyRows(iv), greyRows(cv)], [0, 0], "no grey row left");
    });

    it("a drag leaving the window (a dragleave without a related target) clears both trees", async function () {
        const iv = ZP.itemsView, cv = ZP.collectionsView;
        leave(iv, iv.getRowIndexByID(item.id));
        leave(cv, 0);
        drag("dragleave", outside(), null);
        assert.isNull(iv._dropRow);
        assert.isNull(cv._dropRow);
    });

    // dev.55, MJT's real drag: dragover on a row, then the drag left the
    // window with no leave at all -- only a dragexit on the tab bar. Both
    // fallbacks: that dragexit, and Gecko's drag session (no synthetic
    // event opens one, so here the session is over from the start).
    it("a dragexit leaving the window (no related target) clears both trees", async function () {
        const iv = ZP.itemsView, cv = ZP.collectionsView;
        leave(iv, iv.getRowIndexByID(item.id));
        leave(cv, 0);
        drag("dragexit", win.document.getElementById("tab-bar-container") || outside(), null);
        assert.isNull(iv._dropRow);
        assert.isNull(cv._dropRow);
    });

    it("once no drag session is on, a drop row a drag left behind is cleared within a beat", async function () {
        const iv = ZP.itemsView;
        const row = iv.getRowIndexByID(item.id);
        leave(iv, row);
        drag("dragover", iv.domEl);   // over the tree itself: the elsewhere rule keeps it
        assert.strictEqual(iv._dropRow, row);
        await wvT.waitFor(() => iv._dropRow === null, 3000);
        assert.isNull(iv._dropRow, "cleared by the drag-session watchdog");
        await wvT.waitFor(() => greyRows(iv) === 0, 3000);
        assert.strictEqual(greyRows(iv), 0);
    });

    it("a drag over the tree itself, or a leave within the window, keeps the row", async function () {
        const iv = ZP.itemsView;
        const row = iv.getRowIndexByID(item.id);
        leave(iv, row);
        drag("dragover", iv.domEl);
        assert.strictEqual(iv._dropRow, row, "a dragover inside the tree is Zotero's to handle");
        drag("dragleave", outside(), iv.domEl);
        assert.strictEqual(iv._dropRow, row, "a leave toward another element in the window decides nothing");
        iv._dropRow = null;
        iv.tree.invalidateRow(row);
    });

    // The bug, end to end, from MJT's three real drags (the dev.54 / dev.55
    // drag rings, 2026-10-19). Zotero's OWN onDragOver makes the row the drop
    // target (the call shape of Zotero's libraryTreeTest for 896a3f829: a
    // note dragged over an item); then the events Gecko actually delivered
    // are replayed -- never the row's dragleave. What cannot be replayed is
    // Gecko skipping that leave during a native drag: that needs a real drag.
    describe("replay of the recorded drags: the row stays grey without the fix, and clears with it", function () {
        let note;
        before(async function () {
            note = new Zotero.Item("note");
            note.setNote("WV stuck drop row note");
            await note.saveTx();
        });
        after(async function () {
            try { ZP.itemsView._dropRow = null; } catch (e) {}
            try { await wvT.erase(note); } catch (e) {}
            try { wv._wvWireStuckDropRowFix(win); } catch (e) {}   // whatever happened, the fix is back
        });
        // Zotero's onDragOver over the item's row, as during a real drag.
        const zoteroDragOver = (view, row) => {
            const rowEl = { classList: { contains: () => false }, getBoundingClientRect: () => ({ y: 0, height: 100 }) };
            const DD = /** @type {any} */ (Zotero).DragDrop;
            DD.currentDragSource = view.collectionTreeRows ? view.collectionTreeRows[0] : view.collectionTreeRow;
            try {
                view.onDragOver({
                    preventDefault: () => {}, stopPropagation: () => {},
                    currentTarget: rowEl, target: rowEl, clientY: 50,
                    dataTransfer: { dropEffect: "copy", effectAllowed: "copyMove", types: ["zotero/item"], getData: (t) => (t === "zotero/item" ? String(note.id) : "") },
                }, row);
            }
            finally { DD.currentDragSource = null; }
        };
        const doc = () => win.document;
        // What Gecko delivered after the row, in each recording.
        const sequences = {
            "dev.54: the next event lands on the item pane, no leave for the row": () => {
                const pane = doc().getElementById("zotero-item-pane") || outside();
                drag("dragenter", pane, null);
                drag("dragover", pane, null);
            },
            "dev.55: the drag leaves the window with only a dragexit on the tab bar": () => {
                drag("dragexit", doc().getElementById("tab-bar-container") || outside(), null);
            },
            "dev.56 watchdog: nothing at all after the last dragover on the tree (the drag ended)": () => {
                drag("dragover", ZP.itemsView.domEl);   // the last event Zotero saw, over the tree itself
            },
        };

        for (const [label, replay] of Object.entries(sequences)) {
            it(label, async function () {
                const view = ZP.itemsView;
                const row = view.getRowIndexByID(item.id);
                // Fix OFF: the bug.
                wv._wvTeardownStuckDropRowFix();
                zoteroDragOver(view, row);
                assert.strictEqual(view._dropRow, row, "Zotero's onDragOver made the row the drop target");
                await wvT.waitFor(() => greyRows(view) === 1, 3000);
                replay();
                await wvT.sleep(1000);
                assert.strictEqual(view._dropRow, row, "without the fix the row is still the drop target a second later");
                assert.strictEqual(greyRows(view), 1, "...and still grey: the bug, reproduced");
                view._dropRow = null;
                view.tree.invalidateRow(row);
                await wvT.waitFor(() => greyRows(view) === 0, 3000);
                // Fix ON: same events, the row clears.
                wv._wvWireStuckDropRowFix(win);
                zoteroDragOver(view, row);
                await wvT.waitFor(() => greyRows(view) === 1, 3000);
                replay();
                await wvT.waitFor(() => view._dropRow === null && greyRows(view) === 0, 3000);
                assert.isNull(view._dropRow, "with the fix it is cleared");
                assert.strictEqual(greyRows(view), 0, "and no longer grey");
            });
        }
    });

    it("Zotero's own fix is not in this build yet (fails once it is: retire WV-TEMP-133039)", function () {
        assert.notStrictEqual(typeof ZP.itemsView._clearDropIndicator, "function",
            "Zotero ships 896a3f829: delete _wvWireStuckDropRowFix, its wiring entry, the destroy call and this spec");
    });
});
