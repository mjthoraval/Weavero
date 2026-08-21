/* global describe, it, before, assert, Zotero */

// Where the takeover panel's outline COMES FROM (issue #34, 2026-08-21).
//
// The Outline-tab takeover hides Zotero's native outline view wholesale and
// renders Weavero's panel in its place. That is only safe if the panel can
// show what the native view would have shown. Until this fix the outline
// source was pdf.js-only -- `_wvReaderFetchOutline` opened with
// `if (reader._type !== "pdf") return null` -- so on a snapshot or an EPUB
// the panel said "No outline for this document" while the view it had just
// hidden held a full tree. Weavero REMOVED a working Zotero feature.
//
// Zotero builds outlines for DOM views too and delivers them via
// onSetOutline into the reader state: epub-view from the book's TOC,
// snapshot-view from the document's heading tree (H1-H6 / aria-level).
//
// The two producers anchor differently, which is the other half of the bug:
//   snapshot -> location.position (a DOM selector)
//   epub     -> location.href     (into the book)
// The copy step must keep BOTH, or EPUB entries render and then do nothing
// when clicked.
//
// Reader stubs are pure objects: the fetch path only dereferences
// _type and _internalReader._state.outline for non-PDF views.

describe("Weavero — outline source (non-PDF views)", () => {
    let wv;

    const stubReader = (type, outline) => ({
        _type: type,
        _internalReader: { _state: { outline } },
        _iframeWindow: null,
    });

    const SNAPSHOT_TREE = [{
        title: "Abstract",
        location: { position: { type: "FragmentSelector", value: "sel-abstract" } },
        items: [{ title: "Introduction", location: { position: { value: "sel-intro" } }, items: [] }],
    }];

    const EPUB_TREE = [{
        title: "CHAPITRE I",
        location: { href: "text/chapter1.xhtml" },
        items: [],
    }];

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReaderFetchOutline !== "function") this.skip();
    });

    describe("snapshot", () => {
        it("returns the native outline instead of null", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("snapshot", SNAPSHOT_TREE));
            assert.isNotNull(res, "snapshot outline must not be dropped");
            assert.equal(res.tree.length, 1);
            assert.equal(res.tree[0].title, "Abstract");
        });

        it("keeps the selector anchor, so entries can navigate", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("snapshot", SNAPSHOT_TREE));
            assert.ok(res.tree[0].position, "position must survive the copy");
            assert.equal(res.tree[0].position.value, "sel-abstract");
        });

        it("preserves nesting", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("snapshot", SNAPSHOT_TREE));
            assert.equal(res.tree[0].items.length, 1);
            assert.equal(res.tree[0].items[0].title, "Introduction");
        });

        it("labels the source as extracted (headings, not an authored TOC)", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("snapshot", SNAPSHOT_TREE));
            assert.equal(res.source, "extracted");
        });
    });

    describe("EPUB", () => {
        it("returns the book's TOC instead of null", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("epub", EPUB_TREE));
            assert.isNotNull(res, "EPUB outline must not be dropped");
            assert.equal(res.tree[0].title, "CHAPITRE I");
        });

        it("keeps the href anchor — without it the entry renders but cannot navigate", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("epub", EPUB_TREE));
            assert.equal(res.tree[0].href, "text/chapter1.xhtml");
        });

        it("labels the source as embedded (an authored TOC)", async () => {
            const res = await wv._wvReaderFetchOutline(stubReader("epub", EPUB_TREE));
            assert.equal(res.source, "embedded");
        });
    });

    describe("genuinely outline-less documents", () => {
        it("still reports nothing, so the empty state is honest", async () => {
            assert.isNull(await wv._wvReaderFetchOutline(stubReader("snapshot", [])));
            assert.isNull(await wv._wvReaderFetchOutline(stubReader("epub", null)));
        });
    });

    describe("the copy step", () => {
        it("carries position AND href, since the producers differ", () => {
            if (typeof wv._wvOutlineCopyTree !== "function") this.skip();
            const out = wv._wvOutlineCopyTree([
                { title: "A", location: { position: { value: "p" } }, items: [] },
                { title: "B", location: { href: "h.xhtml" }, items: [] },
            ]);
            assert.equal(out[0].position.value, "p");
            assert.isNull(out[0].href);
            assert.equal(out[1].href, "h.xhtml");
            assert.isNull(out[1].position);
        });

        it("returns plain JS — no Xray refs leak into the store", () => {
            if (typeof wv._wvOutlineCopyTree !== "function") this.skip();
            const out = wv._wvOutlineCopyTree(SNAPSHOT_TREE);
            assert.doesNotThrow(() => JSON.stringify(out));
        });
    });
});
