/* global describe, it, before, after, assert, Zotero */

// Rule 1, 2026-09-28 (MJT): several values in one filter combine as ANY
// where a row can hold only one value (publication, added-by -- and the
// icon grids), and as ALL where it can hold many: Tag, Author, Collection,
// Saved Search. Exclusions stay "any of them". For the single-valued kinds
// an exclusion clears the picks and vice versa (_toggleIncludeExclude).
// FAILS on the pre-change code (every multi-pick was OR).

describe("Weavero — filter: multi-valued picks must ALL match", () => {
    let wv, cA, cB, sA, sB, both, onlyA, prevFilter;

    const stub = (over) => Object.assign({
        isAnnotation: () => false, isAttachment: () => false, isFileAttachment: () => false,
        isNote: () => false, isRegularItem: () => true, parentItem: null, libraryID: 1, key: "ALLOF000",
        getTags: () => [], getCreators: () => [],
    }, over);
    const withTags = (...t) => stub({ getTags: () => t.map((tag) => ({ tag })) });
    const withAuthors = (...n) => stub({ getCreators: () => n.map((lastName) => ({ firstName: "", lastName })) });
    const group = (over) => Object.assign(wv._emptyFilterGroup(), over);

    before(async function () {
        this.timeout(30000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._emptyFilterGroup !== "function") wvT.absent('!wv || typeof wv._emptyFilterGroup !== "function"');
        prevFilter = wv._filterState;
        const mkC = async (name) => { const c = new Zotero.Collection(); c.name = name; await c.saveTx(); return c; };
        cA = await mkC("wv-allof-A"); cB = await mkC("wv-allof-B");
        const mkI = async (title, cols) => { const i = new Zotero.Item("book"); i.setField("title", title); for (const c of cols) i.addToCollection(c.id); await i.saveTx(); return i; };
        both = await mkI("wv-allof-both", [cA, cB]);
        onlyA = await mkI("wv-allof-onlyA", [cA]);
        const mkS = async (name, coll) => { const s = /** @type {any} */ (new Zotero.Search()); s.name = name; s.libraryID = Zotero.Libraries.userLibraryID; s.addCondition("collection", "is", coll.key); await s.saveTx(); return s; };
        sA = await mkS("wv-allof-sA", cA); sB = await mkS("wv-allof-sB", cB);
    });

    after(async () => {
        if (wv) { wv._filterState = prevFilter; wv._savedSearchResults = null; }
        for (const o of [sA, sB, both, onlyA, cA, cB]) { try { if (o) await o.eraseTx(); } catch (e) {} }
    });

    it("Tag: the row must carry every picked tag; excluding stays any", () => {
        const g = group({ annotationTag: ["x", "y"] });
        assert.isTrue(wv._rowPassesFilters(withTags("x", "y"), g, {}));
        assert.isFalse(wv._rowPassesFilters(withTags("x"), g, {}), "one of two is not enough");
        const gx = group({ annotationTagExclude: ["x", "y"] });
        assert.isFalse(wv._rowPassesFilters(withTags("x"), gx, {}), "any excluded tag drops it");
        assert.isTrue(wv._rowPassesFilters(withTags("z"), gx, {}));
    });

    it("Author: the item must have every picked author", () => {
        const g = group({ annotationAuthor: ["Smith", "Jones"] });
        assert.isTrue(wv._rowPassesFilters(withAuthors("Smith", "Jones", "Brown"), g, {}));
        assert.isFalse(wv._rowPassesFilters(withAuthors("Smith"), g, {}));
    });

    it("Collection: the item must be in every picked collection (intersection)", () => {
        assert.isTrue(wv._rowPassesGlobalFilters(both, { collections: [cA.id, cB.id] }));
        assert.isFalse(wv._rowPassesGlobalFilters(onlyA, { collections: [cA.id, cB.id] }));
        assert.isTrue(wv._rowPassesGlobalFilters(onlyA, { collections: [cA.id] }));
        assert.isFalse(wv._rowPassesGlobalFilters(both, { collectionsExclude: [cB.id, 999999999] }), "exclude: any");
    });

    it("Saved Search: items matching every picked search (intersection)", async function () {
        this.timeout(15000);
        wv._filterState = Object.assign({ groups: [] }, prevFilter || {}, { savedSearches: [sA.id, sB.id], savedSearchesExclude: [] });
        await wv._refreshSavedSearchResults();
        const r = wv._savedSearchResults;
        assert.isOk(r);
        assert.isTrue(r.has(both.id), "in both searches");
        assert.isFalse(r.has(onlyA.id), "only in one");
    });

    it("Publication / Added By stay alternatives; an exclusion clears the picks and back", () => {
        let n = wv._toggleIncludeExclude("JFM", [], [], false);
        n = wv._toggleIncludeExclude("PRF", n.include, n.exclude, false);
        assert.deepEqual(n.include.sort(), ["JFM", "PRF"]);
        n = wv._toggleIncludeExclude("Nature", n.include, n.exclude, true);
        assert.deepEqual(n.include, [], "excluding cleared the picks");
        assert.deepEqual(n.exclude, ["Nature"]);
        const g = group({ publication: ["JFM", "PRF"] });
        const pub = (p) => stub({ getField: (f) => (f === "publicationTitle" ? p : "") });
        assert.isTrue(wv._rowPassesFilters(pub("PRF"), g, {}), "one of the alternatives is enough");
        assert.isFalse(wv._rowPassesFilters(pub("Nature"), g, {}));
    });
});
