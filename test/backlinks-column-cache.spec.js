/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-10-26 (screenshot): "Why 4 Backlinks in the section, but 0 in the
// column?" Zotero caches every row's column values (itemTree `_rowCache`,
// cleared only when the row's own item changes). A row drawn before the
// backlinks index was built cached the column's 0, and the build's repaint
// (`tree.invalidate()`) reused it; the same after any index change -- a link
// added or removed in a note left the target's count as it was. Written
// before the fix.

describe("Weavero — the Backlinks column never keeps a stale cached count", function () {
    this.timeout(60000);
    let wv, win, ZP, iv, P, S, S2, key;
    const lib = () => Zotero.Libraries.userLibraryID;
    const link = (it) => "<p>See zotero://select/library/items/" + it.key + "</p>";
    const cached = () => iv._getRowData(iv.getRowIndexByID(P.id))[key];

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlEnsure", "_wvBlChanged"]) wvT.method(m);
        win = Zotero.getMainWindow(); ZP = win.ZoteroPane;
        P = await wvT.createItem("journalArticle", { title: "WVBLC target" });
        S = new Zotero.Item("note");
        S.setNote(link(P));
        await S.saveTx();
        await ZP.collectionsView.selectLibrary(lib());
        iv = ZP.itemsView;
        await iv.waitForLoad();
        const col = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns().find((c) => /weaveroBacklinks$/.test(String(c.dataKey)));
        if (!col) this.skip();   // the Backlinks column is off
        key = col.dataKey;
        await wv._wvBlEnsure();
    });

    after(async function () {
        await wvT.erase(S, S2, P);
    });

    it("a row drawn before the index is built shows the count once it is", async function () {
        // A fresh, unbuilt index, as after a startup or a reload.
        wv._wvBlIndex = null;
        wv._wvBlCountCache = null;
        iv.invalidateRowCache([P.id]);
        assert.strictEqual(cached(), 0, "drawn before the build: 0, and Zotero caches it");
        await wv._wvBlEnsure();
        assert.isTrue(await wvT.waitFor(() => cached() === 1, 3000), "the row's cached value is the real count after the build: " + cached());
    });

    it("a link added in a note updates the target's row", async function () {
        assert.strictEqual(cached(), 1, "one link");
        S2 = new Zotero.Item("note");
        S2.setNote(link(P));
        await S2.saveTx();
        assert.isTrue(await wvT.waitFor(() => cached() === 2, 3000), "the second link counted: " + cached());
    });
});
