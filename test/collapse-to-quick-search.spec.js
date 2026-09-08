/* global describe, it, before, expect, Zotero */

// Guards for the Advanced Search -> Quick Search inverse mapping.
//
// Weavero's collapse button returns to the quick search only when the current
// Advanced Search says something the quick search can also say. That test is
// ours, because Zotero has a text->search parser (Zotero.SearchQuery.parse /
// addToSearch) but NO serialiser going the other way.
//
// The three recognised shapes are exactly what
// ZoteroPane.openAdvancedSearchFromQuickSearch seeds; they were read out of a
// live 10.0.2-beta.7 and cross-checked against upstream main (2026-09-04).
// If upstream changes how it seeds, these fail — which is the point: a
// silently stale matcher would make collapse fall back to Zotero's behaviour
// with no signal, and the feature would look "sometimes broken".
//
// The FALSE cases matter more than the true ones. Mapping a search we cannot
// actually express would silently change the user's result set on collapse.

describe("Weavero — Advanced Search to Quick Search mapping", () => {
    let wv;

    // `any`-cast throughout: the bundled Zotero type defs mark libraryID
    // read-only and type addCondition's operator as a closed union that has
    // no "item", yet both are exactly what ZoteroPane seeds at runtime.
    function seeded(mode, words) {
        const s = /** @type {any} */ (new Zotero.Search());
        if (mode === "titleCreatorYear") s.addCondition("resultLevel", "item");
        for (const w of words) {
            if (mode === "everything") {
                s.addCondition("groupStart", "true", "");
                s.addCondition("joinMode", "any");
                s.addCondition("anyField", "contains", w);
                s.addCondition("fulltextContent", "contains", w);
                s.addCondition("groupEnd", "true", "");
            }
            else if (mode === "titleCreatorYear") {
                s.addCondition("titleCreatorYear", "contains", w);
            }
            else {
                s.addCondition("anyField", "contains", w);
            }
        }
        return s;
    }

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvQuickSearchFromAdvanced !== "function") this.skip();
    });

    it("maps each seeded mode back to its quick search", () => {
        expect(wv._wvQuickSearchFromAdvanced(seeded("fields", ["drop"])))
            .to.deep.equal({ text: "drop", mode: "fields" });
        expect(wv._wvQuickSearchFromAdvanced(seeded("fields", ["drop", "impact"])))
            .to.deep.equal({ text: "drop impact", mode: "fields" });
        expect(wv._wvQuickSearchFromAdvanced(seeded("titleCreatorYear", ["drop"])))
            .to.deep.equal({ text: "drop", mode: "titleCreatorYear" });
        expect(wv._wvQuickSearchFromAdvanced(seeded("everything", ["drop", "impact"])))
            .to.deep.equal({ text: "drop impact", mode: "everything" });
    });

    it("re-quotes phrases so the text reparses to the same search", () => {
        const r = wv._wvQuickSearchFromAdvanced(seeded("fields", ["drop impact"]));
        expect(r).to.deep.equal({ text: '"drop impact"', mode: "fields" });
        // Round-trip through Zotero's own splitter: one part, not two.
        const parts = Zotero.SearchConditions.parseSearchString(r.text);
        expect(parts.map(p => p.text)).to.deep.equal(["drop impact"]);
    });

    it("refuses a search the quick search cannot express", () => {
        // A condition with no quick-search spelling.
        const creator = /** @type {any} */ (new Zotero.Search());
        creator.addCondition("creator", "contains", "thoraval");
        expect(wv._wvQuickSearchFromAdvanced(creator)).to.equal(null);

        // Seeded shape plus one foreign condition.
        const mixed = seeded("fields", ["drop"]);
        mixed.addCondition("year", "is", "2026");
        expect(wv._wvQuickSearchFromAdvanced(mixed)).to.equal(null);

        // Top-level "any" join: the quick search always joins with "all".
        const anyJoin = /** @type {any} */ (new Zotero.Search());
        anyJoin.addCondition("joinMode", "any");
        anyJoin.addCondition("anyField", "contains", "drop");
        expect(wv._wvQuickSearchFromAdvanced(anyJoin)).to.equal(null);

        // titleCreatorYear without its resultLevel marker is not what
        // expanding produces, so it must not claim that mode.
        const noResultLevel = /** @type {any} */ (new Zotero.Search());
        noResultLevel.addCondition("titleCreatorYear", "contains", "drop");
        expect(wv._wvQuickSearchFromAdvanced(noResultLevel)).to.equal(null);

        // An "everything"-looking group whose two halves search for
        // different words is a hand-built search, not a seeded one.
        const skewed = /** @type {any} */ (new Zotero.Search());
        skewed.addCondition("groupStart", "true", "");
        skewed.addCondition("joinMode", "any");
        skewed.addCondition("anyField", "contains", "drop");
        skewed.addCondition("fulltextContent", "contains", "impact");
        skewed.addCondition("groupEnd", "true", "");
        expect(wv._wvQuickSearchFromAdvanced(skewed)).to.equal(null);

        // A value carrying a double quote cannot round-trip.
        expect(wv._wvQuickSearchFromAdvanced(seeded("fields", ['say "hi"'])))
            .to.equal(null);

        expect(wv._wvQuickSearchFromAdvanced(null)).to.equal(null);
    });

    // A search that filters nothing IS expressible -- as the empty quick
    // search. Without this, opening Advanced Search on an empty box and
    // collapsing it stranded the user on the "Advanced Search" label with no
    // way back to the search box short of the close button.
    it("maps a search that filters nothing to an empty quick search", () => {
        const empty = { text: "", mode: null };

        // What advancedSearchPane seeds from `set search(null)` -- i.e. what
        // you get by clicking the funnel with an empty quick search box.
        const paneDefault = /** @type {any} */ (new Zotero.Search());
        paneDefault.addCondition("resultLevel", "item");
        paneDefault.addCondition("title", "contains", "");
        expect(wv._wvQuickSearchFromAdvanced(paneDefault)).to.deep.equal(empty);

        // A row whose field was changed but whose value is still blank.
        const halfBuilt = /** @type {any} */ (new Zotero.Search());
        halfBuilt.addCondition("resultLevel", "item");
        halfBuilt.addCondition("creator", "contains", "");
        expect(wv._wvQuickSearchFromAdvanced(halfBuilt)).to.deep.equal(empty);

        expect(wv._wvQuickSearchFromAdvanced(new Zotero.Search()))
            .to.deep.equal(empty);
    });

    it("does not treat an empty value as blank for other operators", () => {
        // `is ""` matches items whose field IS empty, and `doesNotContain ""`
        // matches none -- both are real filters, so collapsing must not
        // silently discard them.
        const isEmpty = /** @type {any} */ (new Zotero.Search());
        isEmpty.addCondition("title", "is", "");
        expect(wv._wvQuickSearchFromAdvanced(isEmpty)).to.equal(null);

        const notContains = /** @type {any} */ (new Zotero.Search());
        notContains.addCondition("title", "doesNotContain", "");
        expect(wv._wvQuickSearchFromAdvanced(notContains)).to.equal(null);
    });
});
