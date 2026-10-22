/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-134330 (forums.zotero.org/discussion/134330, upstream register #31):
// when the collections tree reloads with the same row selected -- a move to
// the trash does it -- the items view keeps its rows while Zotero's
// setTagScope hands the Tag Selector the tree's new ones, which carry no quick
// search: the search filters the list but no longer narrows the Tag Selector.
// Weavero answers setTagScope's read with the items view's rows. The scope is
// read from the Tag Selector's state (its list is virtualized), and the tags
// do not contain the search word (the quick search may cover tags). The
// second test runs the same steps with the workaround torn down: it shows the
// bug, which is what the first test guards -- and it is the tripwire, failing
// once Zotero's own setTagScope is fixed: then retire the workaround.

describe("Weavero — the Tag Selector follows the quick search after the collections pane reloads (WV-TEMP-134330)", function () {
    this.timeout(90000);
    let wv, win, ZP, CV, quick, word, tagA, tagB, a, b;
    const trash = [];

    const scope = () => {
        const s = ZP.tagSelector && ZP.tagSelector.state && ZP.tagSelector.state.scope;
        return s ? [...s] : [];
    };
    const search = async (text) => {
        quick.value = text;
        quick.doCommand();
        await ZP.itemsView._refreshPromise;
        await wvT.sleep(600);
    };
    // Fresh rows on both sides, then a move to the trash: the tree reloads
    // and re-selects the same row, the items view keeps its own.
    const reloadWithSameRow = async () => {
        const lib = Zotero.Libraries.userLibraryID;
        await CV.selectByID("T" + lib);
        await CV.selectLibrary(lib);
        await wvT.sleep(400);
        const c = await wvT.createItem("journalArticle", { title: "WV tag scope trashed" });
        trash.push(c);
        await Zotero.Items.trashTx([c.id]);
        const split = await wvT.waitFor(() => CV.getRow(CV.selection.focused) !== ZP.itemsView.collectionTreeRows[0], 10000);
        assert.ok(split, "the tree has new rows, the items view kept its own (the bug's state)");
        assert.strictEqual(CV.getRow(CV.selection.focused).id, "L" + lib, "the same row is selected");
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvWireTagScopeRowsFix !== "function") wvT.absent("_wvWireTagScopeRowsFix");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        CV = ZP.collectionsView;
        quick = win.document.getElementById("zotero-tb-search-textbox");
        if (!ZP.tagSelectorShown()) wvT.absent("the Tag Selector");
        word = "wvscope" + Zotero.Utilities.randomString(6).toLowerCase();
        // Tags without the search word: the quick search may cover tags too
        const t = Zotero.Utilities.randomString(6).toLowerCase();
        tagA = "wv-scope-a-" + t;
        tagB = "wv-scope-b-" + t;
        a = await wvT.createItem("journalArticle", { title: word + " alpha" });
        a.setTags([tagA]);
        await a.saveTx();
        b = await wvT.createItem("journalArticle", { title: "WV tag scope other" });
        b.setTags([tagB]);
        await b.saveTx();
    });

    after(async function () {
        try { await search(""); } catch (e) {}
        try { wv._wvWireTagScopeRowsFix(win); } catch (e) {}
        await wvT.erase(a, b, ...trash);
    });

    it("with the workaround: after a move to the trash, the quick search still narrows the Tag Selector", async function () {
        await reloadWithSameRow();
        await search(word);
        assert.strictEqual(ZP.itemsView.rowCount, 1, "the list shows the one matching item");
        const narrowed = await wvT.waitFor(() => !scope().includes(tagB), 5000);
        assert.ok(narrowed, "the other item's tag left the Tag Selector");
        assert.include(scope(), tagA);
        await search("");
    });

    it("torn down, the same steps show Zotero's bug (tripwire: fails once Zotero fixes setTagScope -- retire WV-TEMP-134330)", async function () {
        wv._wvTeardownTagScopeRowsFix();
        try {
            await reloadWithSameRow();
            await search(word);
            assert.strictEqual(ZP.itemsView.rowCount, 1, "the list shows the one matching item");
            assert.include(scope(), tagB,
                "Zotero still scopes the Tag Selector to the tree's new row (if this fails, Zotero fixed it: retire the workaround)");
        }
        finally {
            await search("");
            wv._wvWireTagScopeRowsFix(win);
        }
    });
});
