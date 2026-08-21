/* global describe, it, before, after, beforeEach, afterEach, assert, Zotero */

// "Has Weavero Outline" tile (2026-08-20). Attachment-level tri-state
// over the CURATED outline store (weavero/outlines.json).
//
// The contract worth locking is the scope of the promise: this filter
// answers only for outlines the user curated, NEVER for a document's own
// embedded or extracted outline. Those can only be known by parsing each
// PDF (the dev outline-eval scan), so a tile claiming them would answer
// "no" for every unscanned file -- which is why the label says Weavero
// and the dev facets keep the scanned sources.

describe("Weavero — Has Weavero Outline filter", () => {
    let wv, savedHasCurated;
    const CURATED = new Set(["CURATED1", "CURATED2"]);

    const stub = (over) => Object.assign({
        isAnnotation: () => false,
        isAttachment: () => false,
        isFileAttachment: () => false,
        isNote: () => false,
        isRegularItem: () => false,
        parentItem: null,
        libraryID: 1,
        key: "PLAIN",
    }, over);

    const attachment = (key) => stub({
        isAttachment: () => true, isFileAttachment: () => true, key,
    });
    const regular = () => stub({ isRegularItem: () => true, key: "PARENT1" });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        // Stand in for the outline store so the spec needs no files.
        savedHasCurated = wv._wvOutlineHasCurated;
        wv._wvOutlineHasCurated = (_lib, key) => CURATED.has(key);
    });

    after(() => {
        if (wv && savedHasCurated) wv._wvOutlineHasCurated = savedHasCurated;
    });

    const groupWith = (v) => Object.assign(wv._emptyFilterGroup(), { hasOutline: v });

    it("registers as an active group dimension", () => {
        const g = wv._emptyFilterGroup();
        assert.isFalse(wv._isGroupActive(g));
        g.hasOutline = true;
        assert.isTrue(wv._isGroupActive(g));
    });

    it("include: only attachments carrying a curated outline pass", () => {
        const g = groupWith(true);
        assert.isTrue(wv._rowPassesFilters(attachment("CURATED1"), g, {}));
        assert.isFalse(wv._rowPassesFilters(attachment("PLAIN2"), g, {}));
    });

    it("exclude (Alt+click) inverts — this is the \"no outline\" case", () => {
        const g = groupWith(false);
        assert.isTrue(wv._rowPassesFilters(attachment("PLAIN2"), g, {}));
        assert.isFalse(wv._rowPassesFilters(attachment("CURATED1"), g, {}));
    });

    it("parents relax through (kept as ancestors of a matching attachment)", () => {
        assert.isTrue(wv._rowPassesFilters(regular(), groupWith(true), {}));
        assert.isTrue(wv._rowPassesFilters(regular(), groupWith(false), {}));
    });

    it("counts as an own-kind match for attachments only", () => {
        const g = groupWith(true);
        assert.isTrue(wv._rowHasOwnKindMatch(attachment("CURATED1"), g));
        assert.isFalse(wv._rowHasOwnKindMatch(attachment("PLAIN2"), g));
        assert.isFalse(wv._rowHasOwnKindMatch(regular(), g));
    });

    it("contributes the attachment kind to the Selection Target", () => {
        const saved = wv._filterState;
        try {
            wv._filterState = { groups: [groupWith(true)] };
            const eff = wv._effectiveSelectionTargetKinds();
            assert.isTrue(eff.attachment);
            assert.isFalse(eff.parent);
        }
        finally { wv._filterState = saved; }
    });

    it("a cold store matches nothing rather than throwing", () => {
        // _wvOutlineStore() returns {} and self-loads when cold; the
        // predicate must degrade to "no match", never blow up a filter
        // apply during startup.
        const saved = wv._wvOutlineHasCurated;
        try {
            wv._wvOutlineHasCurated = () => { throw new Error("cold store"); };
            assert.isFalse(wv._wvHasCuratedOutline(attachment("CURATED1")));
        }
        finally { wv._wvOutlineHasCurated = saved; }
    });
});
