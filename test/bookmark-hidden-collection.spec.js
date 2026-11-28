/* global describe, it, before, after, assert, Zotero */

// A bookmark reaches a collection hidden in its window (work/collections-organization-2026-11-27.md,
// recommendation 4, MJT 2026-11-27): hiding (the Collections and Libraries Manager, per window) and
// bookmarks are the two halves of curating the column, and a bookmark must reach what is hidden -- as
// Gmail's hidden labels stay reachable. A click on its bookmark shows the collection for as long as it
// is selected; once another row is, it is hidden again. The window's hidden set never changes.
// FAILED on 1.3.0-paneorg.3: the click found no row (Zotero's expandToCollection answers false for an
// object `_includedInTree` leaves out) and did nothing -- the selection stayed on My Library.

describe("Weavero — the bookmark of a collection hidden in its window", function () {
    this.timeout(60000);
    let wv, win, cv, L, H, S;
    const focusedID = () => { const r = cv.getRow(cv.selection.focused); return r ? r.id : null; };
    const settle = async (pred, what, ms = 8000) => {
        const ok = await wvT.waitFor(() => { try { return pred() || null; } catch (e) { return null; } }, ms, 50);
        assert.ok(ok, what + " (focused " + focusedID() + ")");
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_bmActivateBookmark", "_wvHidHide", "_wvHidShow", "_wvHidIsHidden"]) wvT.method(m);
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        L = Zotero.Libraries.userLibraryID;
        H = new Zotero.Collection({ libraryID: L, name: "WVBMH Hidden" }); await H.saveTx();
        S = new Zotero.Collection({ libraryID: L, name: "WVBMH Sub", parentID: H.id }); await S.saveTx();
        await cv.selectLibrary(L);
    });

    after(async function () {
        try { await wv._wvHidShow(win, L, ["C" + H.key, "C" + S.key]); } catch (e) {}
        for (const o of [S, H]) { try { if (o) await o.eraseTx(); } catch (e) {} }
        try { await cv.selectLibrary(L); } catch (e) {}
    });

    for (const which of ["the collection itself", "a sub-collection of a hidden collection"]) {
        it("a click on its bookmark shows " + which + " while it is selected, then it is hidden again", async () => {
            const col = which === "the collection itself" ? H : S;
            await cv.selectLibrary(L);
            await wv._wvHidHide([H], win);
            await settle(() => cv.getRowIndexByID("C" + col.id) === false, "fixture: not in the tree");
            // A bookmark as the store holds one; the click's own path (the dropdown's and the pane's).
            const bm = { id: "wvbmh-" + col.key, type: "collection", libraryID: L, collectionKey: col.key, label: col.name };
            await wv._bmActivateBookmark(bm, {}, win);
            await settle(() => focusedID() === "C" + col.id, "shown and selected");
            assert.isTrue(wv._wvHidIsHidden(H, win), "still in the window's hidden set");
            assert.isUndefined(wv._wvHidCapture(win) && wv._wvHidCapture(win).revealed, "nothing of the reveal in the saved set");
            await cv.selectLibrary(L);
            await settle(() => cv.getRowIndexByID("C" + col.id) === false && cv.getRowIndexByID("C" + H.id) === false, "hidden again once another row is selected");
            assert.equal(focusedID(), "L" + L, "the row the user went to stays selected");
            await wv._wvHidShow(win, L, ["C" + H.key]);
        });
    }

    it("a collection shown in the tree: the click selects it as before, nothing revealed", async () => {
        await wv._wvHidShow(win, L, ["C" + H.key, "C" + S.key]);
        await cv.selectLibrary(L);
        await settle(() => cv.getRowIndexByID("C" + H.id) !== false, "fixture: shown in the tree");
        const bm = { id: "wvbmh-plain", type: "collection", libraryID: L, collectionKey: H.key, label: H.name };
        await wv._bmActivateBookmark(bm, {}, win);
        await settle(() => focusedID() === "C" + H.id, "selected");
        assert.notOk(wv._wvHidRevealed && wv._wvHidRevealed(H, win), "no reveal for a shown collection");
    });
});
