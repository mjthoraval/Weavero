/* global describe, it, before, after, assert, Zotero */

// WV-TEMP-134361 (forums.zotero.org/discussion/134361, upstream register #35, 2026-10-21): Zotero's collectionTree
// canDropCheck refuses a dragged collection "onto itself" / "into its own
// children" by comparing its id with the target row's ref.id -- the LIBRARY
// id for a library row -- so the collection whose id equals its library's (My
// Library: the database's first collection) can never be dragged back to the
// library root. Weavero's wrap allows a collection drag over an editable
// library row and leaves every other answer to Zotero; the manager's trees
// carry it too. The tripwire fails when upstream fixes the comparison: then
// the wrap installs nothing and this workaround retires (pane.ts, the
// window-wiring entry "collection-drop-lib", the destroy call, this spec).

describe("Weavero — WV-TEMP-134361: a collection may be dropped on its library row whatever its id", () => {
    let wv, win, cv, lib, parent, child;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        cv = win && win.ZoteroPane && win.ZoteroPane.collectionsView;
        if (!wv || !cv) wvT.absent("!wv || !cv");
        for (const m of ["_wvCollectionDropFixApply", "_wvCollectionDropFixRemove", "_wvWireCollectionDropFix", "_wvTeardownCollectionDropFix"]) assert.isFunction(wv[m], m);
        lib = Zotero.Libraries.userLibraryID;
        parent = new Zotero.Collection(); parent.name = "WV drop-lib parent"; await parent.saveTx();
        child = new Zotero.Collection(); child.name = "WV drop-lib child"; child.parentID = parent.id; await child.saveTx();
        await cv.expandToCollection(child.id);
    });
    after(async function () {
        this.timeout(30000);
        // The erase's notifier round hung past 10 s in 4 of 11 runs paired
        // with window-wiring.spec.js (2026-10-21; never alone; 0 of 10 with
        // the debug store on, which hides the race). The rows leave the
        // database before the notifier runs, so the cleanup is done either
        // way: a bounded wait. Open: work/TODO.md, "collection-drop-lib
        // after-hook hang".
        const erase = (async () => { try { if (parent) await parent.eraseTx(); } catch (e) {} })();
        await Promise.race([erase, new Promise(r => Zotero.getMainWindow().setTimeout(r, 8000))]);
    });

    const dt = (id) => { const d = new win.DataTransfer(); d.setData("zotero/collection", String(id)); return d; };
    const libRow = () => cv.getRowIndexByID("L" + lib);

    it("tripwire: Zotero's canDropCheck still compares the dragged id with the target row's ref.id for library rows too (RETIRE the workaround when this fails)", () => {
        const native = cv._wvOrigCanDropCheck;
        assert.isOk(native, "the workaround is installed on the pane's tree (the original kept)");
        // The exact current form: any change there is upstream moving, to be looked at.
        assert.match(String(native), /Collections cannot be dropped on themselves[\s\S]{0,60}if \(id == treeRow\.ref\.id\)/, "upstream still compares against treeRow.ref.id whatever the row");
        assert.notMatch(String(native), /isCollection\(\)\s*&&\s*id\s*==/, "no upstream guard yet");
    });

    it("the wrapped check allows a collection drag over its own library's row, with the coincidence when the database carries it; everything else stays Zotero's answer", () => {
        assert.isTrue(cv.canDropCheck(libRow(), 0, dt(child.id)), "a nested collection may drop on its library row");
        // The coincidence itself, when this database still has the collection numbered like the library.
        const c = Zotero.Collections.get(lib);
        if (c && c.libraryID === lib && !c.deleted) {
            assert.isFalse(cv._wvOrigCanDropCheck(libRow(), 0, dt(c.id)), "Zotero refuses the collection whose id equals the library's");
            assert.isTrue(cv.canDropCheck(libRow(), 0, dt(c.id)), "the workaround allows it");
        }
        const pRow = cv.getRowIndexByID("C" + parent.id), cRow = cv.getRowIndexByID("C" + child.id);
        assert.notStrictEqual(pRow, false); assert.notStrictEqual(cRow, false);
        assert.isFalse(cv.canDropCheck(pRow, 0, dt(parent.id)), "onto itself: Zotero's refusal kept");
        assert.isFalse(cv.canDropCheck(cRow, 0, dt(parent.id)), "into its own child: kept");
        assert.isTrue(cv.canDropCheck(pRow, 0, dt(child.id)), "a collection onto another: Zotero's yes");
        assert.isFalse(cv.canDropCheck(libRow(), 1, dt(child.id)), "between rows: Zotero's no");
        // (An item drag cannot be checked outside a real drag: Zotero's own
        // check reads Zotero.DragDrop.currentDragSource, which a drag start sets.)
    });

    it("the wrapper's rule on a fake tree: an editable library row says yes to a collection drag, a read-only library row and a collection row defer to the original", () => {
        const calls = [];
        const rows = [
            { editable: true, isLibrary: () => true, ref: { libraryID: 1, id: 1 } },
            { editable: false, isLibrary: () => true, ref: { libraryID: 2, id: 2 } },
            { editable: true, isLibrary: () => false, isCollection: () => true, ref: { libraryID: 1, id: 1 } },
        ];
        // (The upstream form through toString: the specs are bundled, and a
        // comment or a bare string statement does not survive to the function's
        // source text -- measured 2026-10-21.)
        const nativeLike = function (row, orient, dataTransfer) { void dataTransfer; calls.push(row + ":" + orient); return false; };
        nativeLike.toString = () => "(row, orient, dataTransfer) => { if (id == treeRow.ref.id) { return false; } }";
        const fake = { getRow: (i) => rows[i], canDropCheck: nativeLike };
        assert.isTrue(wv._wvCollectionDropFixApply(fake, "t"), "installed (the fake's source carries the comparison)");
        assert.isTrue(fake.canDropCheck(0, 0, dt(child.id)), "editable library row + collection: yes");
        assert.deepEqual(calls, [], "without asking the original");
        assert.isFalse(fake.canDropCheck(1, 0, dt(child.id))); assert.isFalse(fake.canDropCheck(2, 0, dt(child.id))); assert.isFalse(fake.canDropCheck(0, 1, dt(child.id)));
        assert.deepEqual(calls, ["1:0", "2:0", "0:1"], "read-only library, collection row, between rows: the original decides");
        wv._wvCollectionDropFixRemove(fake);
        assert.isUndefined(fake._wvOrigCanDropCheck);
        const fixedLike = function (row, orient, dataTransfer) { void row; void orient; void dataTransfer; return false; };
        fixedLike.toString = () => "(row, orient, dataTransfer) => { if (treeRow.isCollection() && id == treeRow.ref.id) { return false; } }";
        const fixed = { getRow: () => rows[0], canDropCheck: fixedLike };
        assert.isFalse(wv._wvCollectionDropFixApply(fixed, "t"), "an upstream that guards the comparison gets no wrap");
        assert.isUndefined(fixed._wvOrigCanDropCheck);
    });

    it("the manager's two trees carry the check; the teardown restores Zotero's own and the wiring puts it back", async function () {
        this.timeout(30000);
        const mw = wv._wvHidOpenManager(win);
        assert.isOk(mw);
        try {
            assert.isTrue(await wvT.waitFor(() => !mw.closed && !!mw._wvHidMgrReady, 15000), "the manager started");
            await mw._wvHidMgrReady;
            for (const side of ["left", "right"]) {
                const t = mw._wvHidMgrTrees[side];
                assert.isOk(t._wvOrigCanDropCheck, side + ": installed");
                const i = t.getRowIndexByID("L" + lib);
                if (i !== false && i != null) assert.isTrue(t.canDropCheck(i, 0, dt(child.id)), side + ": a collection may drop on the library row");
            }
            wv._wvTeardownCollectionDropFix();
            assert.isUndefined(cv._wvOrigCanDropCheck, "the pane's original back");
            assert.match(String(cv.canDropCheck), /\bid\s*==\s*treeRow\.ref\.id\b/, "Zotero's own check in place");
            assert.isUndefined(mw._wvHidMgrTrees.left._wvOrigCanDropCheck, "the manager's too");
        } finally {
            const trees = mw._wvHidMgrTrees;
            try { if (!mw.closed) mw.close(); } catch (e) {}
            await wvT.waitFor(() => mw.closed, 5000);
            // The closed manager's two trees stay Zotero notifier observers
            // until the window's unload ran their unregister(). The after
            // hook's erase then hung past its timeout in 4 of 11 runs paired
            // with window-wiring.spec.js (2026-10-21) -- its 'delete' notify
            // lands on a tree whose window is gone and whose select event
            // never comes, the likely cause (the debug store that would have
            // shown it hid the race: 0 in 10 with it on). Waiting for the
            // unregister, not just the handle.
            await wvT.waitFor(() => !win._wvHidMgrWin && !!(trees && trees.left._uninitialized && trees.right._uninitialized), 5000);
            wv._wvWireCollectionDropFix(win);
        }
        assert.isOk(cv._wvOrigCanDropCheck, "wired again");
        assert.isTrue(cv.canDropCheck(libRow(), 0, dt(child.id)));
    });
});
