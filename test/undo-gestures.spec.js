/* global describe, it, before, after, assert, Zotero */

// Survey §3.7 (2026-10-17): a gesture that writes several times is ONE undo
// step. These gestures each wrote N times (N adds, then N moves to the drop
// slot) and left N or 2N steps -- Ctrl+Z took one row back at a time:
// annotations / selections dropped on the Bookmarks list, a bookmark row
// copied from another document, a drop on the library-scope list, the "+"
// picker with several items, "Add These N Pages to Bookmarks" (thumbnails)
// and "Add to Bookmarks (N annotations)". Each FAILED on 0.22.2-dev.51.

describe("Weavero — a multi-write gesture is one undo step", function () {
    this.timeout(90000);
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
    });

    it("every multi-write gesture runs inside one undo batch (source contract)", () => {
        // The drop handlers batch their inner body; the others wrap the
        // writing loop. A batch is never held across a dialog (the depth is
        // global): the picker's batch starts after the dialog closed.
        for (const m of ["_wvReaderDropPayload", "_wvReaderDropBmRow", "_wvReaderLibAcceptDrop",
            "_wvReaderBookmarkAnnotations", "_setupThumbnailContextMenu"]) {
            assert.include(wvT.src(m), "_wvUndoBatch(", m);
        }
        const dlg = wvT.src("_wvReaderAddViaDialog");
        assert.isAbove(dlg.indexOf("_wvUndoBatch("), dlg.indexOf("await io.deferred.promise"), "the picker's adds are batched after the dialog closed");
    });

    // The outline's gestures (recorded at the store's choke point since
    // §3.7): a multi-selection, or a position written then re-filed in
    // reading order, or a rename with its region -- each one step.
    it("every outline gesture that writes several times runs inside one undo batch (source contract)", () => {
        for (const m of ["_wvOutlineDeleteSelected", "_wvBmCopyTextToOutline", "_wvOutlineCleanSpacing",
            "_wvOutlineDismissSpacing", "_wvOutlineSetKind", "_wvOutlineDoResetName", "_wvOutlineEditPosition",
            "_wvOutlineBeginSelectRegion", "_wvOutlineEditPinPosition", "_wvOutlineShowEntryPin",
            "_wvOutlineShowDomEntryPin", "_wvOutlineEditRegion"]) {
            assert.include(wvT.src(m), "_wvUndoBatch(", m);
        }
        for (const m of ["_wvOutlineDoDelete", "_wvOutlineCreateEntry", "_wvOutlineAddFromSelection", "_wvBmCopyTextToOutline", "_wvOutlineDeleteSelected"]) {
            assert.notInclude(wvT.src(m), "_wvOutlineRecord", m + " records through the store, never by hand (a step would count twice)");
        }
    });

    describe("Add to Bookmarks (N annotations)", function () {
        let att, reader, scope;
        before(async function () {
            att = await wvT.createTestPDFItem("wv-undo-gestures");
            reader = await wvT.openReaderTab(att.id);
            if (!reader) throw new Error("reader did not open");
            scope = wv._wvBmUndoScope("rb:" + wv._bmReaderKey(att.libraryID, att.key));
            wv._wvUndoClear(scope);
        });
        after(async function () {
            try { for (const b of wv._bmReaderList(att.libraryID, att.key)) await wv._bmReaderRemove(att.libraryID, att.key, b.id); } catch (e) {}
            try { delete wv._bmReaderStore()[wv._bmReaderKey(att.libraryID, att.key)]; await wv._bmPersistSilent(); } catch (e) {}
            try { wv._wvUndoClear(scope); } catch (e) {}
            try { wvT.closeReaderTab(reader); } catch (e) {}
            try { await wvT.erase(att); } catch (e) {}
        });

        it("three annotations bookmarked at once: one step, and one undo takes all three back", async () => {
            const n0 = wv._bmReaderList(att.libraryID, att.key).length;
            await wv._wvReaderBookmarkAnnotations(reader.tabID, ["WVUNDOG1", "WVUNDOG2", "WVUNDOG3"], att.libraryID);
            assert.strictEqual(wv._bmReaderList(att.libraryID, att.key).length, n0 + 3, "three bookmarks added");
            const stack = wv._wvUndoStacks().get(scope);
            assert.strictEqual(stack.undo.length, 1, "one step, not three");
            assert.strictEqual(wv._wvUndoPeek(scope).undo, "Add 3 Bookmarks");
            assert.strictEqual(await wv._wvUndo(scope), "Add 3 Bookmarks");
            assert.strictEqual(wv._bmReaderList(att.libraryID, att.key).length, n0, "one undo, all three gone");
        });
    });
});
