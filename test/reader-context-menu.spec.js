/* global describe, it, before, assert, Zotero */

// The selection context menu mirrors the sidebar tab order (2026-08-24).
//
// Right-clicking selected text offers the same two destinations the sidebar
// does: Outline and Bookmarks. The sidebar strip is
//
//     [Thumbnails (PDF only)] > Annotations > Outline > Bookmarks
//
// (upstream sidebar.js builds Annotations then Outline for every view type;
// Weavero appends its Bookmarks tab after. Verified live on PDF and snapshot.)
//
// The menu listed Bookmarks first, so the two lists disagreed about the order
// of the same two destinations. They must not.
//
// The outline entry is offered on every view that can carry an outline -- PDF,
// snapshot and EPUB -- so the order is asserted for all three.

describe("Weavero — reader selection menu order", () => {
    let wv;

    // The builder reads the selection text off the reader's own state; a stub
    // with text is enough to reach the branch under test.
    const stubReader = (type) => ({
        _type: type,
        _internalReader: {
            _state: { primaryViewSelectionPopup: { annotation: { text: "selected words" } } },
        },
    });

    const labelsFor = (type) => {
        const labels = [];
        wv._wvReaderViewContextMenu({
            append: (o) => { if (o && o.label) labels.push(o.label); },
            reader: stubReader(type),
        });
        return labels;
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReaderViewContextMenu !== "function") this.skip();
    });

    for (const type of ["pdf", "snapshot", "epub"]) {
        it("puts Outline before Bookmarks on a " + type, () => {
            const labels = labelsFor(type);
            const outline = labels.indexOf("Add Selected Text to Outline");
            const bookmarks = labels.indexOf("Add Selected Text to Bookmarks");
            assert.notEqual(outline, -1, "outline entry must be offered on " + type);
            assert.notEqual(bookmarks, -1, "bookmarks entry must be offered on " + type);
            assert.isBelow(outline, bookmarks,
                "sidebar order is Outline then Bookmarks; the menu must agree");
        });
    }

    it("offers both entries and does not duplicate either", () => {
        const labels = labelsFor("pdf");
        const count = (l) => labels.filter(x => x === l).length;
        assert.equal(count("Add Selected Text to Outline"), 1);
        assert.equal(count("Add Selected Text to Bookmarks"), 1);
    });

    it("still offers bookmarks on a view type that cannot carry an outline", () => {
        // The outline entry is gated; the bookmark entry is not. A view outside
        // the outline set must keep its bookmark action rather than lose both.
        const labels = labelsFor("video");
        assert.include(labels, "Add Selected Text to Bookmarks");
        assert.notInclude(labels, "Add Selected Text to Outline");
    });
});
