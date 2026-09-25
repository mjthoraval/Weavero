/* global describe, it, before, after, assert, Zotero */

// Where a library bookmark leaves its collections-tree row (issue #45,
// Friedsoap 2026-09-24; design MJT 2026-09-25). Zotero's select scrolls only
// as far as needed, so a row below the view landed at the BOTTOM edge. Pref
// weavero.bookmarkCollectionScroll: "top" (default, even when visible),
// "native" (Zotero's behaviour, untouched). A "quarter from the top" choice
// was dropped after testing (MJT 2026-09-25); a leftover value counts as
// "top". FAILS on the pre-fix code (no such placement existed).

describe("Weavero — collections-tree placement after a bookmark jump", () => {
    let wv, prev;
    const PREF = "weavero.bookmarkCollectionScroll";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._bmPlaceCollectionRow !== "function") this.skip();
        prev = Zotero.Prefs.get(PREF);
    });
    after(() => { try { Zotero.Prefs.set(PREF, prev || "top"); } catch (_) {} });

    // Row 50 at 20 px per row (top 1000 px), a 400-px-high tree.
    const fakePane = () => {
        const calls = [];
        const jw = {
            _getItemPosition: (i) => i * 20,
            getWindowHeight: () => 400,
            scrollTo: (v) => { calls.push(v); },
        };
        const zp = { collectionsView: { getRowIndexByID: (id) => (id === "C7" ? 50 : false), tree: { _jsWindow: jw } } };
        return { zp, calls };
    };

    it("\"top\" (the default): the row first", () => {
        Zotero.Prefs.set(PREF, "top");
        const { zp, calls } = fakePane();
        wv._bmPlaceCollectionRow(zp, "C7");
        assert.equal(calls[0], 1000);
    });

    it("a leftover \"quarter\" value (dropped choice) counts as \"top\"", () => {
        Zotero.Prefs.set(PREF, "quarter");
        const { zp, calls } = fakePane();
        wv._bmPlaceCollectionRow(zp, "C7");
        assert.equal(calls[0], 1000);
    });

    it("\"top\" with pinned parents: the row goes just under them, not beneath", () => {
        // MJT 2026-09-25: with the collections-tree sticky parents on, "top"
        // put the row exactly where the pinned rows sit, hiding it.
        Zotero.Prefs.set(PREF, "top");
        const prevAid = Zotero.Prefs.get("weavero.collectionsStickyParents");
        Zotero.Prefs.set("weavero.collectionsStickyParents", true);
        try {
            const { zp, calls } = fakePane();
            const cv = zp.collectionsView;
            cv.tree._jsWindow.itemHeight = 20;
            cv.getParentIndex = (i) => (i === 50 ? 10 : i === 10 ? 0 : -1);   // two parents
            wv._bmPlaceCollectionRow(zp, "C7");
            assert.equal(calls[0], 1000 - 2 * 20);
        } finally {
            Zotero.Prefs.set("weavero.collectionsStickyParents", prevAid === undefined ? true : prevAid);
        }
    });

    it("\"native\": Zotero's own scroll, nothing added", () => {
        Zotero.Prefs.set(PREF, "native");
        const { zp, calls } = fakePane();
        wv._bmPlaceCollectionRow(zp, "C7");
        assert.lengthOf(calls, 0);
    });

    it("a row that is not in the tree is left alone", () => {
        Zotero.Prefs.set(PREF, "top");
        const { zp, calls } = fakePane();
        wv._bmPlaceCollectionRow(zp, "C999");
        assert.lengthOf(calls, 0);
    });
});
