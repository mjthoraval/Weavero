/* global describe, it, before, assert, Zotero */

// Outline parity on DOM views (snapshot / EPUB), 2026-08-26.
//
// The click paths never search: a DOM outline entry carries an EXACT anchor
// (selector or href), so navigation resolves it directly. Text search exists
// ONLY for the explicit "Re-detect Region from Title" action — and the
// native-outline flash interception must match a navigate's location to an
// outline entry before painting anything, with the same AMBIGUITY-DECLINES
// discipline the PDF arm learned from the Kundu degenerate-destination case.

describe("Weavero — DOM text search (_wvDomFindTextRange)", () => {
    let wv, pv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDomFindTextRange !== "function") this.skip();
        const doc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-findtext");
        doc.body.innerHTML =
            "<h2>2. The Experimental Method</h2>"
            + "<p>We measured the <i>drop</i> impact speed carefully.</p>"
            + "<p>Unrelated closing text.</p>";
        pv = { _iframeDocument: doc };
    });

    it("finds exact text and returns a Range over it", () => {
        const r = wv._wvDomFindTextRange(pv, "The Experimental Method");
        assert.ok(r, "should find the heading");
        assert.include(r.toString(), "Experimental Method");
    });

    it("folds case and punctuation (the normalized-match contract)", () => {
        const r = wv._wvDomFindTextRange(pv, "the EXPERIMENTAL, method");
        assert.ok(r, "case/punctuation differences must not break the match");
    });

    it("crosses inline element boundaries", () => {
        // "drop" sits in its own <i> text node; the phrase spans three nodes.
        const r = wv._wvDomFindTextRange(pv, "the drop impact speed");
        assert.ok(r, "must match across text-node boundaries");
        assert.include(r.toString(), "drop");
    });

    it("returns null for absent text — never a guess", () => {
        assert.isNull(wv._wvDomFindTextRange(pv, "text that is nowhere in this doc"));
    });

    it("returns null for degenerate needles (too short to be a title)", () => {
        assert.isNull(wv._wvDomFindTextRange(pv, "a"));
    });
});

describe("Weavero — native-outline flash matching declines ambiguity (DOM arm)", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDomNativeOutlineFlash !== "function") this.skip();
    });

    // A fake DOM view: seq stamp observable, timers swallowed (the flash's
    // resolve/paint is async and irrelevant here — ONLY the gate is under
    // test: does a given navigate location arm a flash at all?).
    const mkPv = () => ({ _wvDomHlSeq: 0, _iframeWindow: { setTimeout: () => 0 } });
    const mkReader = (outline) => ({ _internalReader: { _state: { outline } } });

    it("a location matching one outline entry by href arms the flash", () => {
        const pv = mkPv();
        const outline = [
            { title: "One", location: { href: "ch1.xhtml#a" }, items: [] },
            { title: "Two", location: { href: "ch2.xhtml#b" }, items: [] },
        ];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv, { href: "ch2.xhtml#b" });
        assert.equal(pv._wvDomHlSeq, 1, "unique href match must arm");
    });

    it("a location matching one entry by selector position arms the flash", () => {
        const pv = mkPv();
        const outline = [
            { title: "Intro", location: { position: { type: "CssSelector", value: "#sec1 > h2" } }, items: [] },
        ];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv,
            { position: { type: "CssSelector", value: "#sec1 > h2" } });
        assert.equal(pv._wvDomHlSeq, 1);
    });

    it("a non-outline navigate (internal link) does NOT flash", () => {
        const pv = mkPv();
        const outline = [{ title: "One", location: { href: "ch1.xhtml#a" }, items: [] }];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv, { href: "notes.xhtml#fn3" });
        assert.equal(pv._wvDomHlSeq, 0, "links that are not outline entries must not flash");
    });

    it("two entries with the SAME href -> decline (no flash), the Kundu rule", () => {
        const pv = mkPv();
        const outline = [
            { title: "A", location: { href: "ch1.xhtml" }, items: [] },
            { title: "B", location: { href: "ch1.xhtml" }, items: [] },
        ];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv, { href: "ch1.xhtml" });
        assert.equal(pv._wvDomHlSeq, 0,
            "an ambiguous match paints the wrong heading; declining still scrolls");
    });

    it("identity beats duplicates: the clicked entry's own location object wins", () => {
        const pv = mkPv();
        const shared = { href: "ch1.xhtml" };
        const outline = [
            { title: "A", location: { href: "ch1.xhtml" }, items: [] },
            { title: "B", location: shared, items: [] },
        ];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv, shared);
        assert.equal(pv._wvDomHlSeq, 1, "object identity resolves what equality cannot");
    });

    it("a PDF-shaped location (position with rects) never arms the DOM flash", () => {
        const pv = mkPv();
        const outline = [{ title: "X", location: { position: { pageIndex: 3, rects: [[0, 0, 1, 1]] } }, items: [] }];
        wv._wvDomNativeOutlineFlash(mkReader(outline), pv,
            { position: { pageIndex: 3, rects: [[0, 0, 1, 1]] } });
        assert.equal(pv._wvDomHlSeq, 0);
    });
});
