/* global describe, it, before, after, assert, Zotero */

// Bookmark undo (MJT 2026-10-01, slice 2): steps are recorded at the store's
// write choke point (`_bmPersist`) by diffing each store against its last
// persisted state -- record-level changes with anchored positions, so a step
// replays on whatever the tree looks like later and can be undone alone
// when later steps touched other ids. Automatic writes (label sync, folder
// expand / collapse) record nothing. One gesture that writes several times
// (a multi-row delete, a move between the document and the library) runs in
// a batch: one step per store, linked. Throw-away keys in the runner's own
// bookmarks.json; the library tree gets one folder that is removed again.

describe("Weavero — bookmark undo steps", () => {
    let wv, scopeD, scopeL;
    const att = { libraryID: 1, itemKey: "WVUNDOBM" };
    const key = "rb:" + att.libraryID + ":" + att.itemKey;
    const tree = () => { const d = wv._bmReaderDoc(att.libraryID, att.itemKey); return JSON.parse(JSON.stringify({ local: d.local, global: d.global })); };
    const strip = (t) => JSON.stringify(t, (k, v) => (k === "expanded" ? undefined : v));
    const labels = (nodes) => nodes.map(n => (n.type === "folder" ? "[" + n.name + "]" + labels(n.children || []).join("") : n.label));

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvBmUndoCapture !== "function") this.skip();
        await wv._bmInit();
        scopeD = wv._wvBmUndoScope(key); scopeL = wv._wvBmUndoScope("lib");
        for (const id of wv._bmReaderList(att.libraryID, att.itemKey).map(b => b.id)) await wv._bmReaderRemove(att.libraryID, att.itemKey, id);
        wv._wvUndoClear(scopeD); wv._wvUndoClear(scopeL);
    });

    after(async () => {
        if (!wv) return;
        try { const d = wv._bmReaderDoc(att.libraryID, att.itemKey); d.local.length = 0; d.global.length = 0; delete wv._bmReaderStore()[att.libraryID + ":" + att.itemKey]; } catch (e) {}
        try { for (const n of wv._bmRootArray().filter(x => x.type === "folder" && /^WV Undo Spec/.test(x.name))) await wv._bmRemove(n.id); } catch (e) {}
        await wv._bmPersistSilent();
        wv._wvUndoClear(scopeD); wv._wvUndoClear(scopeL);
    });

    const add = (label, i) => wv._bmReaderAdd(att.libraryID, att.itemKey, { type: "position", label, location: { pageIndex: i }, position: { pageIndex: i, rects: [[0, 0, 1, 1]] } });

    it("every user write records a labelled step; undo and redo restore the tree record by record", async () => {
        const a = await add("A", 0);
        assert.deepEqual(wv._wvUndoPeek(scopeD), { undo: "Add Bookmark", redo: null });
        const b = await add("B", 1);
        const c = await add("C", 2);
        const snap3 = strip(tree());
        await wv._bmReaderRename(att.libraryID, att.itemKey, b.id, "B2");
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Rename Bookmark");
        const fid = await wv._bmReaderAddFolder(att.libraryID, att.itemKey, "local", "F");
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Add Folder");
        await wv._bmReaderMove(att.libraryID, att.itemKey, c.id, fid, "into");
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Move Bookmark");
        assert.deepEqual(labels(tree().local), ["A", "B2", "[F]C"]);
        await wv._bmReaderMove(att.libraryID, att.itemKey, a.id, b.id, "after");
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Move Bookmark", "a reorder among siblings is a move");
        assert.deepEqual(labels(tree().local), ["B2", "A", "[F]C"]);
        const snapAll = strip(tree());
        // Expand / collapse is view state: no step.
        const n = wv._wvUndoStacks().get(scopeD).undo.length;
        await wv._bmReaderToggleFolder(att.libraryID, att.itemKey, fid);
        assert.strictEqual(wv._wvUndoStacks().get(scopeD).undo.length, n, "nothing recorded");
        // Walk back.
        assert.strictEqual(await wv._wvUndo(scopeD), "Move Bookmark");
        assert.deepEqual(labels(tree().local), ["A", "B2", "[F]C"], "reorder undone, anchored after its old neighbour");
        assert.strictEqual(await wv._wvUndo(scopeD), "Move Bookmark");
        assert.deepEqual(labels(tree().local), ["A", "B2", "C", "[F]"], "back out of the folder, at its old place");
        assert.strictEqual(await wv._wvUndo(scopeD), "Add Folder");
        assert.strictEqual(await wv._wvUndo(scopeD), "Rename Bookmark");
        assert.strictEqual(strip(tree()), snap3, "the tree is exactly what it was after the three adds");
        assert.strictEqual(await wv._wvUndo(scopeD), "Add Bookmark");
        assert.deepEqual(labels(tree().local), ["A", "B"]);
        // And forward again.
        for (let i = 0; i < 5; i++) assert.isString(await wv._wvRedo(scopeD));
        assert.strictEqual(strip(tree()), snapAll, "redo rebuilt the final tree");
        assert.isNull(await wv._wvRedo(scopeD));
    });

    it("deleting a folder with its contents is one step that restores parent and children; a multi-row delete is one batched step", async () => {
        const before = strip(tree());
        const f = tree().local.find(x => x.type === "folder");
        await wv._bmReaderRemove(att.libraryID, att.itemKey, f.id);
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Delete Folder", "the folder, not each descendant");
        assert.deepEqual(labels(tree().local), ["B2", "A"]);
        assert.strictEqual(await wv._wvUndo(scopeD), "Delete Folder");
        assert.strictEqual(strip(tree()), before, "folder and child back in place");
        const ids = tree().local.filter(x => x.type !== "folder").map(x => x.id);
        await wv._wvUndoBatch(async () => { for (const id of ids) await wv._bmReaderRemove(att.libraryID, att.itemKey, id); });
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Delete 2 Bookmarks", "one gesture, one step");
        assert.strictEqual(await wv._wvUndo(scopeD), "Delete 2 Bookmarks");
        assert.strictEqual(strip(tree()), before);
    });

    it("selective undo: a step below the top runs alone when nothing later touched its entries", async () => {
        wv._wvUndoClear(scopeD);
        const d = await add("D", 5);
        const a = tree().local.find(x => x.label === "A");
        await wv._bmReaderRename(att.libraryID, att.itemKey, a.id, "A-renamed");
        const list = wv._wvUndoList(scopeD, "undo");
        assert.deepEqual(list.map(r => r.label + "|" + r.independent), ["Rename Bookmark|true", "Add Bookmark|true"], "the add of D is independent of the rename of A");
        assert.strictEqual(await wv._wvUndoRunStep(scopeD, "undo", list[1].id), "Add Bookmark", "ran alone");
        assert.isUndefined(tree().local.find(x => x.id === d.id), "D is gone");
        assert.strictEqual(tree().local.find(x => x.id === a.id).label, "A-renamed", "the later rename stayed");
        assert.deepEqual(wv._wvUndoPeek(scopeD), { undo: "Rename Bookmark", redo: "Add Bookmark" });
        await wv._bmReaderRename(att.libraryID, att.itemKey, a.id, "A");   // a new action clears redo, and touches A again
        const list2 = wv._wvUndoList(scopeD, "undo");
        assert.deepEqual(list2.map(r => r.independent), [true, false], "the first rename is now covered by the second (same entry)");
        assert.isNull(await wv._wvUndoRunStep(scopeD, "undo", list2[1].id), "refused");
    });

    it("a move between the document and the library is ONE linked step across both stores", async () => {
        wv._wvUndoClear(scopeD); wv._wvUndoClear(scopeL);
        const src = tree().local.find(x => x.type !== "folder");
        const libBefore = wv._bmRootArray().length;
        await wv._wvBmTransferDocToLib({ id: src.id, libraryID: att.libraryID, itemKey: att.itemKey }, true, null, null);
        assert.strictEqual(wv._bmRootArray().length, libBefore + 1, "copied into the library");
        assert.isUndefined(tree().local.find(x => x.id === src.id), "removed from the document");
        const sd = wv._wvUndoTop(scopeD, "undo"), sl = wv._wvUndoTop(scopeL, "undo");
        assert.ok(sd && sl && sd.groupId && sd.groupId === sl.groupId, "twins share a group");
        assert.deepEqual([sd.label, sl.label], ["Delete Bookmark", "Add Bookmark"]);
        assert.strictEqual(await wv._wvUndo(scopeL), "Add Bookmark", "undo from the library side...");
        assert.strictEqual(wv._bmRootArray().length, libBefore, "...takes the library copy away");
        assert.ok(tree().local.find(x => x.id === src.id), "...and puts the document's bookmark back (the twin ran)");
        assert.deepEqual([wv._wvUndoPeek(scopeD).redo, wv._wvUndoPeek(scopeL).redo], ["Delete Bookmark", "Add Bookmark"]);
        assert.strictEqual(await wv._wvRedo(scopeD), "Delete Bookmark", "redo from the document side...");
        assert.strictEqual(wv._bmRootArray().length, libBefore + 1, "...re-copies into the library (the twin ran)");
        await wv._wvUndo(scopeD);
        wv._wvUndoClear(scopeD); wv._wvUndoClear(scopeL);
    });

    it("the automatic label sync writes silently: labels may change, no step is recorded", async () => {
        wv._wvUndoClear(scopeD);
        const n = (wv._wvUndoStacks().get(scopeD) || { undo: [] }).undo.length;
        wv._bmReaderSyncLabels(att.libraryID, att.itemKey);   // position bookmarks take their page label
        await wv._bmPersistSilent();
        assert.strictEqual((wv._wvUndoStacks().get(scopeD) || { undo: [] }).undo.length, n, "nothing recorded");
        // ...and the next user write diffs against the synced state, not the stale one.
        const x = await add("X", 7);
        assert.strictEqual(wv._wvUndoPeek(scopeD).undo, "Add Bookmark", "one step, for the add alone");
        assert.deepEqual(wv._wvUndoTop(scopeD, "undo").data.changes.map(c => c.id), [x.id], "the synced labels are not part of it");
        await wv._wvUndo(scopeD);
        wv._wvUndoClear(scopeD);
    });

    it("derived fields (the reading-order key) are never a step, and an undo keeps them", async () => {
        // MJT 2026-10-05: "Add selected text to bookmarks adds 2 entries:
        // Add and Edit" -- the second was the background sortIndex save.
        wv._wvUndoClear(scopeD);
        const y = await add("Y", 9);
        const n = wv._wvUndoStacks().get(scopeD).undo.length;
        const loc = wv._bmLocate(y.id, wv._bmReaderDoc(att.libraryID, att.itemKey).local);
        Object.assign(loc.entry, { sortIndex: "00009|000100|00050", sortIndexPos: [9, 1, 2], sortIndexAlgo: 8, _sortIndexTried: true });
        await wv._bmPersist();   // even a non-silent save of derived fields only
        assert.strictEqual(wv._wvUndoStacks().get(scopeD).undo.length, n, "no 'Edit Bookmark' step");
        await wv._bmReaderRename(att.libraryID, att.itemKey, y.id, "Y2");
        assert.strictEqual(await wv._wvUndo(scopeD), "Rename Bookmark");
        const e = wv._bmLocate(y.id, wv._bmReaderDoc(att.libraryID, att.itemKey).local).entry;
        assert.deepEqual([e.label, e.sortIndex], ["Y", "00009|000100|00050"], "the rename is undone, the derived key kept");
        await wv._wvUndo(scopeD);   // the add
        wv._wvUndoClear(scopeD);
    });

    it("the library tree records its own steps", async () => {
        const n0 = wv._bmRootArray().length;
        const fid = await wv._bmAddFolder("WV Undo Spec Folder");
        assert.strictEqual(wv._wvUndoPeek(scopeL).undo, "Add Folder");
        assert.strictEqual(await wv._wvUndo(scopeL), "Add Folder");
        assert.strictEqual(wv._bmRootArray().length, n0);
        assert.strictEqual(await wv._wvRedo(scopeL), "Add Folder");
        assert.ok(wv._bmLocate(fid), "back, with its id");
        await wv._bmRemove(fid);
        wv._wvUndoClear(scopeL);
    });
});
