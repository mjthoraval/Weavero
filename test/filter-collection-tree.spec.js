/* global describe, it, before, after, assert, Zotero */

// Filter panel: the Collection list as an indented, expandable tree
// (MJT 2026-09-28), and a picked parent covering its sub-collections when
// Zotero's "Show Items from Subcollections" (recursiveCollections) is on.
// FAILS on the pre-feature code (flat list; direct membership only).

describe("Weavero — filter Collection tree", () => {
    let wv, parent, child, grand, other, item, prevRec;

    before(async function () {
        this.timeout(20000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvCollTreeValues !== "function") this.skip();
        prevRec = Zotero.Prefs.get("recursiveCollections");
        const mk = async (name, parentID) => { const c = new Zotero.Collection(); c.name = name; if (parentID) c.parentID = parentID; await c.saveTx(); return c; };
        parent = await mk("wvct-B-parent");
        child = await mk("wvct-child", parent.id);
        grand = await mk("wvct-grand", child.id);
        other = await mk("wvct-A-other");
        item = new Zotero.Item("book"); item.setField("title", "wvct item"); await item.saveTx();
        await Zotero.DB.executeTransaction(async () => { item.addToCollection(grand.id); await item.save(); });
    });

    after(async () => {
        try { Zotero.Prefs.set("recursiveCollections", !!prevRec); } catch (e) {}
        for (const o of [item, grand, child, parent, other]) { try { if (o) await o.eraseTx(); } catch (e) {} }
    });

    const rows = () => wv._wvCollTreeValues(Zotero.Libraries.userLibraryID).filter((v) => /^wvct-/.test(v.name));

    it("rows come depth-first with depth, parent and has-children, each level sorted", () => {
        const r = rows();
        const names = r.map((v) => v.name);
        assert.isBelow(names.indexOf("wvct-A-other"), names.indexOf("wvct-B-parent"), "top level sorted");
        const p = r.find((v) => v.name === "wvct-B-parent"), c = r.find((v) => v.name === "wvct-child"), g = r.find((v) => v.name === "wvct-grand");
        assert.equal(names.indexOf("wvct-child"), names.indexOf("wvct-B-parent") + 1, "child right after its parent");
        assert.equal(c.depth, p.depth + 1); assert.equal(g.depth, p.depth + 2);
        assert.equal(c.parentId, parent.id); assert.isTrue(p.hasChildren); assert.isFalse(g.hasChildren);
    });

    it("no text: a row shows only when all its ancestors are expanded", () => {
        const all = wv._wvCollTreeValues(Zotero.Libraries.userLibraryID);
        const names = (vis) => vis.map((v) => v.name).filter((n) => /^wvct-/.test(n));
        assert.deepEqual(names(wv._wvCollTreeVisible(all, "", () => true, new Set())), ["wvct-A-other", "wvct-B-parent"]);
        assert.deepEqual(names(wv._wvCollTreeVisible(all, "", () => true, new Set([parent.id]))), ["wvct-A-other", "wvct-B-parent", "wvct-child"]);
        assert.deepEqual(names(wv._wvCollTreeVisible(all, "", () => true, new Set([parent.id, child.id]))),
            ["wvct-A-other", "wvct-B-parent", "wvct-child", "wvct-grand"]);
    });

    it("text: matches plus all their ancestors, whatever the expansion", () => {
        const all = wv._wvCollTreeValues(Zotero.Libraries.userLibraryID);
        const vis = wv._wvCollTreeVisible(all, "grand", (v) => v.name.includes("grand"), new Set());
        assert.deepEqual(vis.map((v) => v.name).filter((n) => /^wvct-/.test(n)), ["wvct-B-parent", "wvct-child", "wvct-grand"]);
    });

    it("a picked parent covers its sub-collections only with \"Show Items from Subcollections\"", () => {
        Zotero.Prefs.set("recursiveCollections", false);
        assert.isFalse(wv._rowPassesGlobalFilters(item, { collections: [parent.id] }), "setting off: direct membership only");
        assert.isTrue(wv._rowPassesGlobalFilters(item, { collectionsExclude: [parent.id] }), "exclude off: not excluded");
        wv._wvCollFilterMemo = null;
        Zotero.Prefs.set("recursiveCollections", true);
        assert.isTrue(wv._rowPassesGlobalFilters(item, { collections: [parent.id] }), "setting on: the grandchild's item counts");
        assert.isFalse(wv._rowPassesGlobalFilters(item, { collectionsExclude: [parent.id] }), "and is excluded with it");
        assert.isTrue(wv._rowPassesGlobalFilters(item, { collections: [grand.id] }), "direct pick still works");
    });
});
