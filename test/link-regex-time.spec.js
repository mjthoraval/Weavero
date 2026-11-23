/* global describe, it, before, after, assert, Zotero, wvT */

// Finding links in a note, a comment or a reference takes time in proportion
// to its length (security review 2026-11-22). The link patterns were
// quadratic on some inputs: a note of 288 KB written to stall them cost 33.5 s
// of frozen main thread at every Backlinks index build, in every member's
// Zotero. Each case below must finish well inside BOUND_MS; a benign text of
// the same size takes a few milliseconds.

describe("Weavero — link scanning stays linear on crafted text", function () {
    this.timeout(180000);
    const BOUND_MS = 2500;
    const SRC = -987654321;   // a source id no item has
    let wv;

    before(() => {
        wv = wvT.plugin();
        for (const m of ["_wvBlIndexText", "_wvBlDropSource", "_buildCommentFragment", "_renderInlineMarkdown", "hasURI"]) wvT.method(m);
    });
    after(() => { try { wv._wvBlDropSource(SRC); } catch (e) {} });

    const timed = (label, fn) => {
        const t0 = Date.now();
        fn();
        const ms = Date.now() - t0;
        Zotero.debug("[wv-test] link scan " + label + ": " + ms + " ms");
        assert.isBelow(ms, BOUND_MS, label + " took " + ms + " ms");
        return ms;
    };

    it("the Backlinks index reads a 288 KB crafted note in bounded time", () => {
        const note = "<p>" + "https://)".repeat(32000) + "</p>";
        assert.isAtLeast(note.length, 288000);
        timed("index, web pattern", () => wv._wvBlIndexText(SRC, Zotero.Libraries.userLibraryID, null, "standaloneNote", note));
        const z = "<p>" + "zotero://)".repeat(28800) + "</p>";
        timed("index, zotero pattern", () => wv._wvBlIndexText(SRC, Zotero.Libraries.userLibraryID, null, "standaloneNote", z));
        const dots = "<p>" + ("https://a" + ".".repeat(200) + "a ").repeat(1300) + "</p>";
        timed("index, punctuation runs", () => wv._wvBlIndexText(SRC, Zotero.Libraries.userLibraryID, null, "standaloneNote", dots));
        const anchors = "<p>" + "<a>".repeat(20000) + "https://example.org</p>";
        timed("index, unclosed anchors", () => wv._wvBlIndexText(SRC, Zotero.Libraries.userLibraryID, null, "standaloneNote", anchors));
        timed("index, an annotation comment", () => wv._wvBlIndexText(SRC, Zotero.Libraries.userLibraryID, null, "annotation", "https://)".repeat(32000)));
    });

    it("a crafted comment renders in bounded time, and a normal one keeps its links", () => {
        const doc = wvT.win().document;
        const ctx = { doc, useMd: true, isTreeMode: false, stripMarkers: true, lineBreaks: true };
        timed("comment, brackets", () => wv._buildCommentFragment("[".repeat(160000), ctx));
        timed("comment, web pattern", () => wv._buildCommentFragment("https://)".repeat(16000), ctx));
        timed("comment, trailing punctuation", () => wv._buildCommentFragment(("https://a" + ".".repeat(40000) + "a "), ctx));
        timed("popup, brackets", () => wv._renderInlineMarkdown("[".repeat(160000), doc, { hidePopup() {} }, new Set()));
        timed("hasURI, web pattern", () => wv.hasURI("x".repeat(10) + "https://)".repeat(16000)));
        const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        box.appendChild(wv._buildCommentFragment("See https://example.org/a). And [x](https://example.org/b).", ctx));
        assert.deepEqual(Array.from(box.querySelectorAll("[data-href]")).map((s) => s.getAttribute("data-href")),
            ["https://example.org/a", "https://example.org/b"], "trailing punctuation still left out of a link");
    });

    it("an xmlns value is still not a link (issue #56)", () => {
        assert.isFalse(wv.hasURI('<svg xmlns="http://www.w3.org/2000/svg">'), "no link inside a namespace value");
        assert.isTrue(wv.hasURI('<svg xmlns="http://www.w3.org/2000/svg"> see https://example.org'), "a real link beside it");
    });
    // (1.2.1: the reference-entry case is not here -- 1.2.0 has no References.)
});
