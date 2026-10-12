/* global describe, it, before, assert, Zotero */

// Issue #54: on Zotero 11 the reader Outline tab read "No outline for this
// document" for a PDF with embedded bookmarks, while Zotero's own outline view
// (hidden by Weavero's takeover) showed them. Zotero 11's PDF.js has no
// `pdfDocument.getOutline2`; the reader resolves the outline itself into
// `state.outline` (null while loading, [] when there is none).
// `_wvReaderFetchOutline` is the one place the takeover gets its tree from, so
// it is driven here with stand-in readers of both shapes -- the Zotero 11 one
// (no getOutline2) and the Zotero 9/10 one (getOutline2) -- on any Zotero.

describe("Weavero — outline fetch without getOutline2 (Zotero 11, issue #54)", function () {
    let wv;

    before(function () {
        // Self-contained (no wvT): this spec also runs on branches cut from
        // releases older than the shared helpers (issue branches, 2026-10-12).
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReaderFetchOutline !== "function") {
            throw new Error("Weavero surface absent: plugin._wvReaderFetchOutline");
        }
    });

    const node = (title, page, items) => ({ title, location: { position: { pageIndex: page, rects: [[10, 700, 10, 700]] } }, items: items || [] });

    /** A PDF reader as the fetch sees it: the pdf.js app on the iframe window
     *  and the reader state, with or without getOutline2.
     *  @param {{ stateOutline: any, embedded: any, outline2?: any }} o */
    function pdfReader({ stateOutline, embedded, outline2 }) {
        const pdfDocument = { getOutline: async () => embedded };
        if (outline2) pdfDocument.getOutline2 = async () => outline2;
        return {
            _type: "pdf",
            _iframeWindow: { PDFViewerApplication: { pdfDocument } },
            _internalReader: { _state: { outline: stateOutline } },
        };
    }

    const tree = [node("1. Introduction", 1), node("2. Methods", 3, [node("2.1. Set-up", 3)])];

    it("Zotero 11: reads the reader's resolved outline, embedded bookmarks labelled Embedded", async () => {
        const r = await wv._wvReaderFetchOutline(pdfReader({ stateOutline: tree, embedded: [{ title: "1. Introduction" }] }));
        assert.isOk(r, "an outline, not null");
        assert.strictEqual(r.source, "embedded");
        assert.deepEqual(r.tree.map(n => n.title), ["1. Introduction", "2. Methods"]);
        assert.strictEqual(r.tree[1].items[0].title, "2.1. Set-up");
        assert.strictEqual(r.tree[0].position.pageIndex, 1, "the position survives the copy (navigation)");
    });

    it("Zotero 11: no embedded bookmarks -> the reader's own outline, labelled Extracted", async () => {
        const r = await wv._wvReaderFetchOutline(pdfReader({ stateOutline: tree, embedded: [] }));
        assert.isOk(r);
        assert.strictEqual(r.source, "extracted");
        assert.strictEqual(r.tree.length, 2);
    });

    it("Zotero 11: still loading (state.outline null) -> null, so the render retries", async () => {
        const r = await wv._wvReaderFetchOutline(pdfReader({ stateOutline: null, embedded: [{ title: "x" }] }));
        assert.isNull(r);
    });

    it("Zotero 11: resolved and empty -> an empty tree (settled: no outline)", async () => {
        const r = await wv._wvReaderFetchOutline(pdfReader({ stateOutline: [], embedded: [] }));
        assert.isOk(r);
        assert.deepEqual(r.tree, []);
    });

    it("Zotero 9/10: getOutline2 is still what the fetch reads", async () => {
        const r = await wv._wvReaderFetchOutline(pdfReader({ stateOutline: null, embedded: [{ title: "a" }], outline2: [node("From getOutline2", 0)] }));
        assert.isOk(r);
        assert.strictEqual(r.source, "embedded");
        assert.deepEqual(r.tree.map(n => n.title), ["From getOutline2"]);
    });
});
