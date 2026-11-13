/* global describe, it, before, after, assert, Zotero */

// WV-TEMP-133039 (forums 133039 / 134011, upstream register #23): both trees
// remember the drop target by row INDEX (`_dropRow`) and clear it only on the
// row's dragleave, on drop and on dragend. A drag that ends without them
// reaching the tree (an external file taken out of the window fast) left a
// grey row, at the same position in every collection, until the next drag.
// Weavero backports Zotero 896a3f829 (2026-10-13; in 11.0-beta.2): the next
// mousemove over the tree clears it, and so does any change of the items
// list's rows -- Zotero's own code on 11.0-beta.2+, Weavero's twin on 10. The
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

    // Main's full suite 2026-11-12 (1.0.5-dev.13): the "dev.54" replay below failed
    // after the split specs, which open library tabs -- each new library view wires
    // this fix again under the same instance (window-wiring.ts `views`). wvListen
    // refused its own key, so the FIRST wiring's listeners stayed live while the
    // teardown's watchdog cancel was the SECOND wiring's: a watchdog the live
    // listeners armed outlived the teardown and cleared a row 250 ms later.
    it("a second wiring (a library view wired anew) leaves the teardown in charge of the live watchdog", async function () {
        const iv = ZP.itemsView;
        const row = iv.getRowIndexByID(item.id);
        wv._wvWireStuckDropRowFix(win);
        wv._wvWireStuckDropRowFix(win);   // as for a library view wired anew
        leave(iv, row);
        drag("dragover", iv.domEl);       // arms the watchdog (no drag session in a test: it would clear in 250 ms)
        wv._wvTeardownStuckDropRowFix();
        await wvT.sleep(800);
        try { assert.strictEqual(iv._dropRow, row, "the teardown cancelled the armed watchdog: the row stays"); }
        finally {
            iv._dropRow = null;
            iv.tree.invalidateRow(row);
            wv._wvWireStuckDropRowFix(win);
        }
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

        // The drag ring (2026-10-27): on a build with Zotero's `_setDropRow`
        // every change of a drop row is recorded per drag session -- the row
        // set, the clear and its path, whether a dragleave reached the tree.
        it("the drag ring records the session: the row set, Weavero's clear on a drag event elsewhere, no dragleave reached the tree", async function () {
            if (typeof ZP.itemsView._setDropRow !== "function") this.skip();   // Zotero 10: nothing recorded
            const view = ZP.itemsView;
            const row = view.getRowIndexByID(item.id);
            wv._wvWireStuckDropRowFix(win);
            if (wv._wvDragRingSessions) wv._wvDragRingSessions.length = 0;   // the replays above recorded sessions of their own
            const before = 0;
            zoteroDragOver(view, row);
            await wvT.waitFor(() => greyRows(view) === 1, 3000);
            sequences["dev.54: the next event lands on the item pane, no leave for the row"]();
            await wvT.waitFor(() => view._dropRow === null, 3000);
            // No native drag session in a test: the session closes 1.5 s after its last event.
            await wvT.waitFor(() => (wv._wvDragRingSessions || []).length > before, 8000);
            const s = wv._wvDragRingSessions[wv._wvDragRingSessions.length - 1];
            assert.deepEqual(s.trees.items.set, [row], "the row set");
            assert.isFalse(s.trees.items.leave, "no dragleave reached the items tree");
            assert.strictEqual(s.trees.items.clears[0].via, "weavero:drag-elsewhere");
            assert.isFalse(s.trees.items.clears[0].zoteroAlso);
            assert.isFalse(s.trees.items.clears[0].leave, "no dragleave since the row was set");
            assert.isUndefined(s.trees.items.clears[0].late, "Zotero made no attempt of its own");
            assert.isUndefined(s.trees.items.stillSet);
            assert.include(wv._wvDragRingReport(), "-- 1 with no dragleave reaching the tree");
            assert.include(wv._wvDragRingLine(s), "items set " + row + ", NO leave: weavero:drag-elsewhere@");
            assert.include(wv._wvDragRingLine(s), "(NO zotero attempt)");
        });

        // Gecko's order on a target change is dragexit, dragenter on the new
        // target, THEN dragleave on the old: Weavero's clear on that dragenter
        // precedes the row's dragleave by a couple of ms. Zotero's attempt
        // on the already-cleared row is tapped and noted as `late` -- such a
        // clear is Weavero winning a race, not a skipped leave.
        it("the ring notes Zotero's late dragleave attempt on a row Weavero already cleared", async function () {
            if (typeof ZP.itemsView._setDropRow !== "function") this.skip();
            const view = ZP.itemsView;
            const row = view.getRowIndexByID(item.id);
            wv._wvWireStuckDropRowFix(win);
            if (wv._wvDragRingSessions) wv._wvDragRingSessions.length = 0;
            zoteroDragOver(view, row);
            await wvT.waitFor(() => greyRows(view) === 1, 3000);
            const pane = win.document.getElementById("zotero-item-pane") || outside();
            drag("dragenter", pane, null);                                  // Weavero clears here
            assert.isNull(view._dropRow);
            view.onDragLeave();                                              // the row's dragleave, as Gecko sends it next
            await wvT.waitFor(() => (wv._wvDragRingSessions || []).length > 0, 8000);
            const s = wv._wvDragRingSessions[wv._wvDragRingSessions.length - 1];
            assert.strictEqual(s.trees.items.clears.length, 1, "one clear: Zotero's attempt is a note on it, not a second clear");
            assert.match(s.trees.items.clears[0].late || "", /^zotero:row-dragleave@\d+ms$/);
            assert.include(wv._wvDragRingLine(s), "(zotero late zotero:row-dragleave@");
            assert.include(wv._wvDragRingReport(), "-- 0 with no dragleave reaching the tree");
        });
    });

    // Stage 1 of the retirement (register #23): 896a3f829 shipped in
    // 11.0-beta.2 (2026-10-27) -- the trees carry `_clearDropIndicator` and
    // Weavero's twin of it stays out (no rows-change wrap, no tree mousemove
    // listener). Zotero 10 has neither, so the twin is wired there. Both
    // states are asserted; the drag-event part (above) is wired on every
    // build until Zotero clears on drag events too (stage 2).
    it("Zotero's own mousemove / rows-change clear (896a3f829): Weavero's twin is wired only where it is missing", function () {
        const native = typeof ZP.itemsView._clearDropIndicator === "function";
        const layers = (host, member) => ((host && host._wvWraps && host._wvWraps[member]) || { recs: [] }).recs.map(r => r.layer);
        assert.strictEqual(layers(ZP.itemsView, "handleRowModelUpdate").includes("stuckDropRow"), !native,
            native ? "11.0-beta.2+: Zotero clears on row changes itself; the wrap must stay out" : "Zotero 10: the rows-change wrap is Weavero's");
        assert.strictEqual(typeof ZP.collectionsView._clearDropIndicator === "function", native, "both trees inherit LibraryTree's clear together");
    });
});
