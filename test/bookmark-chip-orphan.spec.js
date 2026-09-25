/* global describe, it, before, assert, Zotero */

// The bookmark filter's kind chips count every leaf, orphans included (a
// bookmark whose target was deleted still has a kind), and the list must
// show what the count promises. The match function used to drop any
// item-bookmark whose target no longer resolves, so "Items — 2" listed one
// row (MJT, 2026-09-21). Pure-function guard: no reader needed.

describe("Weavero — bookmark filter: an orphan matches the kind chip it is counted under", () => {
    let wv;
    const blank = () => ({
        bmTypes: new Set(), bmTypesExcl: new Set(),
        colors: new Set(), colorsExcl: new Set(),
        types: new Set(), typesExcl: new Set(),
        authors: new Set(), authorsExcl: new Set(),
        tags: new Set(), tagsExcl: new Set(),
    });
    // A key no item has: the lookup returns nothing, exactly like a deleted target.
    const orphan = { id: "wv-test-orphan", type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: "gone" };
    const pin = { id: "wv-test-pin", type: "position", label: "Page 1" };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvBmNodeMatchesChips !== "function") this.skip();
    });

    it("is counted as an item", () => {
        assert.equal(wv._wvBmNodeTypeCategory(orphan), "item");
    });

    it("matches an 'item' kind include, like the count says", () => {
        const st = blank(); st.bmTypes.add("item");
        assert.isTrue(wv._wvBmNodeMatchesChips(orphan, st), "listed under Items");
        assert.isFalse(wv._wvBmNodeMatchesChips(pin, st), "a pin is not an item");
    });

    it("is removed by an 'item' kind exclude, and kept by any other exclude", () => {
        let st = blank(); st.bmTypesExcl.add("item");
        assert.isFalse(wv._wvBmNodeMatchesChips(orphan, st));
        st = blank(); st.colorsExcl.add("#ffd400");
        assert.isTrue(wv._wvBmNodeMatchesChips(orphan, st), "nothing to exclude on an orphan");
    });

    it("cannot satisfy an annotation include (colour, type, tag), like a pin", () => {
        for (const dim of ["colors", "types", "tags", "authors"]) {
            const st = blank(); st[dim].add("x");
            assert.isFalse(wv._wvBmNodeMatchesChips(orphan, st), dim);
            assert.isFalse(wv._wvBmNodeMatchesChips(pin, st), dim + " (pin)");
        }
    });

    it("with no chip at all, shows like everything else", () => {
        assert.isTrue(wv._wvBmNodeMatchesChips(orphan, blank()));
    });
});

// The kind is REMEMBERED at bookmark time so a later orphan still knows it
// (Zotero keeps nothing but the key once an item is permanently deleted);
// records from before that carry no kind and fall back to the type-name
// labels annotations get when they have no text.
describe("Weavero — bookmark kind remembered at bookmark time", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._bmStampItemKind !== "function") this.skip();
    });

    it("stamps nothing for a target that does not resolve", () => {
        const e = { type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: "gone" };
        assert.isFalse(wv._bmStampItemKind(e));
        assert.isUndefined(e.kind);
    });

    it("an orphan with a remembered kind is classified by it", () => {
        assert.equal(wv._wvBmNodeTypeCategory({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", kind: "annotation", label: "some text" }), "annotation");
        assert.equal(wv._wvBmNodeTypeCategory({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", kind: "journalArticle", label: "Ink annotation" }), "item",
            "a remembered kind beats the label heuristic");
    });

    it("an orphan without a kind falls back to the type-name labels, else item", () => {
        for (const lbl of ["Ink annotation", "Image annotation", "Text annotation", "Annotation", "Note", "Highlight", "Underline"]) {
            assert.equal(wv._wvBmNodeTypeCategory({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: lbl }), "annotation", lbl);
        }
        assert.equal(wv._wvBmNodeTypeCategory({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: "Raimbaud et al. - 2021" }), "item");
        assert.equal(wv._wvBmNodeTypeCategory({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: "renamed", originalLabel: "Ink annotation" }), "annotation",
            "the original label counts, a rename does not hide it");
    });
});

describe("Weavero — an orphan keeps its annotation type and colour", () => {
    let wv;
    const gone = (extra) => Object.assign({ type: "item", libraryID: 1, itemKey: "ZZZZZZZZ", label: "x" }, extra);
    const blank = () => ({
        bmTypes: new Set(), bmTypesExcl: new Set(), colors: new Set(), colorsExcl: new Set(),
        types: new Set(), typesExcl: new Set(), authors: new Set(), authorsExcl: new Set(),
        tags: new Set(), tagsExcl: new Set(),
    });
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvBmNodeWas !== "function") this.skip();
    });

    it("from the remembered kind", () => {
        assert.deepEqual(wv._wvBmNodeWas(gone({ kind: "annotation", annType: "ink", annColor: "#ff6666" })),
            { ann: true, type: "ink", color: "#ff6666", itemType: null });
        assert.deepEqual(wv._wvBmNodeWas(gone({ kind: "journalArticle" })),
            { ann: false, type: null, color: null, itemType: "journalArticle" });
    });

    it("from the type-name label when nothing was remembered", () => {
        assert.deepEqual(wv._wvBmNodeWas(gone({ label: "Ink annotation" })), { ann: true, type: "ink", color: null, itemType: null });
        assert.deepEqual(wv._wvBmNodeWas(gone({ label: "Annotation" })), { ann: true, type: null, color: null, itemType: null }, "annotation, type unknown");
        assert.deepEqual(wv._wvBmNodeWas(gone({ label: "Some paper" })), { ann: false, type: null, color: null, itemType: null });
    });

    it("answers the type and colour chips from memory, never the tag or author chips", () => {
        const o = gone({ kind: "annotation", annType: "ink", annColor: "#ff6666" });
        let st = blank(); st.types.add("ink");
        assert.isTrue(wv._wvBmNodeMatchesChips(o, st), "type include");
        st = blank(); st.types.add("highlight");
        assert.isFalse(wv._wvBmNodeMatchesChips(o, st), "other type");
        st = blank(); st.typesExcl.add("ink");
        assert.isFalse(wv._wvBmNodeMatchesChips(o, st), "type exclude");
        st = blank(); st.colors.add("#ff6666");
        assert.isTrue(wv._wvBmNodeMatchesChips(o, st), "colour include");
        st = blank(); st.tags.add("t");
        assert.isFalse(wv._wvBmNodeMatchesChips(o, st), "tags were never remembered");
    });

    it("draws the annotation icon in its colour, or the item type's icon", () => {
        const win = Zotero.getMainWindow();
        const ink = wv._bmIconInfo(gone({ kind: "annotation", annType: "ink", annColor: "#ff6666" }), win);
        assert.include(ink.image, "annotate-ink.svg");
        assert.equal(ink.fill, "#ff6666");
        const byLabel = wv._bmIconInfo(gone({ label: "Ink annotation" }), win);
        assert.include(byLabel.image, "annotate-ink.svg");
        const article = wv._bmIconInfo(gone({ kind: "journalArticle" }), win);
        // Zotero serves the @2x file on a high-DPI screen (the 0.20.6 release
        // run: .../16/dark/journal-article@2x.svg) -- either is right.
        assert.match(article.image, /journal-article(@2x)?\.svg$/);
    });
});
