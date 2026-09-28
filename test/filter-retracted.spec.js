/* global describe, it, before, after, assert, Zotero */

// "Retracted" filter tile (2026-09-28, forum request 133954): filter the
// retracted items WITHIN a collection or search -- Zotero's own `retracted`
// search condition exists but is hidden from the Advanced Search menu, and
// its Retracted Items view is library-wide.
//
// The contract: the tile follows Zotero.Retractions.isRetracted(), the verdict
// that marks the row and shows the item pane's red box. So a dismissed "Retract
// and Replace" item (FLAG_HIDDEN) is NOT retracted, and one whose citation
// warning was switched off (FLAG_NO_CITATION_WARNING) still IS -- even though
// Zotero's Retracted Items view drops the latter. FAILS on the pre-feature
// code (no `retracted` dimension).

describe("Weavero — Retracted filter", () => {
    let wv, R;
    const IDS = { normal: 990000001, hidden: 990000002, noCite: 990000003, clean: 990000004 };

    const stub = (over) => Object.assign({
        isAnnotation: () => false,
        isAttachment: () => false,
        isFileAttachment: () => false,
        isNote: () => false,
        isRegularItem: () => true,
        parentItem: null,
        libraryID: 1,
        key: "RETRACT0",
    }, over);
    const item = (k) => stub({ id: IDS[k], key: "RET" + k.toUpperCase().slice(0, 5) });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        R = /** @type {any} */ (Zotero).Retractions;
        if (!wv || typeof wv._emptyFilterGroup !== "function" || !R || !R._retractedItems) this.skip();
        // In-memory entries only (what isRetracted() reads); removed in after().
        R._retractedItems.set(IDS.normal, R.FLAG_NORMAL);
        R._retractedItems.set(IDS.hidden, R.FLAG_HIDDEN);
        R._retractedItems.set(IDS.noCite, R.FLAG_NO_CITATION_WARNING);
    });

    after(() => {
        if (R && R._retractedItems) for (const id of Object.values(IDS)) R._retractedItems.delete(id);
    });

    const groupWith = (v) => Object.assign(wv._emptyFilterGroup(), { retracted: v });

    it("registers as an active group dimension", () => {
        const g = wv._emptyFilterGroup();
        assert.isFalse(wv._isGroupActive(g));
        g.retracted = true;
        assert.isTrue(wv._isGroupActive(g));
    });

    it("include: only items Zotero marks as retracted", () => {
        const g = groupWith(true);
        assert.isTrue(wv._rowPassesFilters(item("normal"), g, {}));
        assert.isFalse(wv._rowPassesFilters(item("clean"), g, {}));
    });

    it("a dismissed Retract-and-Replace item is not retracted; a citation-warning-off item still is", () => {
        const g = groupWith(true);
        assert.isFalse(wv._rowPassesFilters(item("hidden"), g, {}), "FLAG_HIDDEN: user confirmed the replacement");
        assert.isTrue(wv._rowPassesFilters(item("noCite"), g, {}), "FLAG_NO_CITATION_WARNING: still retracted");
    });

    it("exclude (Alt+click) hides the retracted ones", () => {
        const g = groupWith(false);
        assert.isFalse(wv._rowPassesFilters(item("normal"), g, {}));
        assert.isTrue(wv._rowPassesFilters(item("clean"), g, {}));
        assert.isTrue(wv._rowPassesFilters(item("hidden"), g, {}));
    });

    it("counts as a parent-level condition (no cascade scan needed)", () => {
        const state = { groups: [groupWith(true)] };
        assert.isTrue(wv._wvFilterParentLevelOnly(state));
    });
});
