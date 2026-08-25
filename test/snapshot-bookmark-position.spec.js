/* global describe, it, before, assert, Zotero */

// "Add Bookmark to This Position" must anchor a SNAPSHOT to the clicked point
// (2026-08-24).
//
// The command had exactly two anchor branches and a snapshot matched neither:
// `getCFI` is an EPUB method, `_wvCaptureReaderPosition` is PDF page geometry.
// So the record silently fell back to `_wvCaptureReaderLocation`'s viewport
// scroll percentage. The stored bookmark read
//
//     { type: "position", location: { scrollYPercent: 0.1 }, position: null }
//
// which returns to wherever the page happens to be scrolled rather than the
// clicked spot, and draws no pin -- so from the user's side the menu entry did
// nothing.
//
// The fix resolves the point the way the outline does: caret -> collapsed
// Range -> `toSelector`. These cases drive `_wvSnapshotPointToSelector` with a
// stubbed view, because the branch being absent was the whole bug -- a guard
// has to assert the branch is taken, and taken only for the right view.
//
// (`caretPositionFromPoint` needs real layout, so the caret itself is stubbed;
// the live round trip -- click -> selector -> back to the same text -- was
// verified against a real snapshot when the fix landed.)

describe("Weavero — snapshot position bookmarks anchor to the click", () => {
    let wv;

    const SELECTOR = {
        type: "CssSelector",
        value: "#main > div:nth-child(3) > p",
        refinedBy: { type: "TextPositionSelector", start: 16, end: 16 },
    };

    // A snapshot view: has toSelector, has NO getCFI.
    const snapshotView = (opts = {}) => ({
        _iframe: { getBoundingClientRect: () => ({ x: 100, y: 40 }) },
        _iframeDocument: {
            caretPositionFromPoint: opts.caretFails
                ? () => null
                : (x, y) => { lastPoint = { x, y }; return { offsetNode: { nodeType: 3 }, offset: 16 }; },
            createRange: () => ({ setStart() {}, setEnd() {} }),
        },
        toSelector: () => (opts.selectorFails ? null : SELECTOR),
    });

    let lastPoint = null;

    const readerWith = (type, view) => ({
        _type: type,
        _internalReader: { _primaryView: view },
    });

    const click = { x: 300, y: 250 };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvSnapshotPointToSelector !== "function") this.skip();
    });

    it("resolves a snapshot click to a stored-position selector", () => {
        const out = wv._wvSnapshotPointToSelector(readerWith("snapshot", snapshotView()), click);
        assert.deepEqual(out, SELECTOR,
            "without this the record keeps position:null and falls back to scrollYPercent");
    });

    it("converts the click into the content document's own coordinates", () => {
        lastPoint = null;
        wv._wvSnapshotPointToSelector(readerWith("snapshot", snapshotView()), click);
        // Click is in chrome coords; the iframe sits at (100, 40).
        assert.deepEqual(lastPoint, { x: 200, y: 210 });
    });

    it("returns a PLAIN object, safe to persist", () => {
        const out = wv._wvSnapshotPointToSelector(readerWith("snapshot", snapshotView()), click);
        assert.doesNotThrow(() => JSON.stringify(out));
        assert.notStrictEqual(out, SELECTOR, "must be a copy, not the view's own object");
    });

    describe("leaves the other two anchor paths alone", () => {
        it("never runs for a PDF, which has real page geometry", () => {
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("pdf", snapshotView()), click));
        });

        it("never diverts an EPUB, whose CFI path is established", () => {
            const epub = snapshotView();
            epub.getCFI = () => "epubcfi(/6/4!/4/2)";
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("epub", epub), click),
                "the presence of getCFI must hand the view back to the CFI branch");
        });
    });

    describe("degrades quietly", () => {
        it("returns null when the point resolves to no caret", () => {
            // A click on empty margin, or outside the visible viewport.
            const v = snapshotView({ caretFails: true });
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("snapshot", v), click));
        });

        it("returns null when the view cannot build a selector", () => {
            const v = snapshotView({ selectorFails: true });
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("snapshot", v), click));
        });

        it("returns null with no click point at all", () => {
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("snapshot", snapshotView()), null));
        });

        it("returns null on a view with no toSelector", () => {
            assert.isNull(wv._wvSnapshotPointToSelector(readerWith("snapshot", {}), click));
        });
    });
});
