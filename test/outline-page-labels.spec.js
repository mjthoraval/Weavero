/* global describe, it, before, assert, Zotero */

// Page numbers in the outline (MJT 2026-09-24): EPUB entries never showed
// "p. N" (they carry a CFI or href, never a pageIndex), and a web snapshot
// -- which has no pages -- still offered the "Page numbers" menu on the
// Outline and Bookmarks tabs. Both FAIL on the pre-fix code.

describe("Weavero — outline page numbers per reader type", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("an EPUB entry is labelled from the reader's page map, and cached", () => {
        let calls = 0;
        const rng = { startContainer: { isConnected: true } };
        const pv = { pageMapping: { getPageLabel: () => { calls++; return "17"; } } };
        const reader = { _type: "epub", _internalReader: { _primaryView: pv } };
        const orig = wv._wvDomRangeForAnchor;
        wv._wvDomRangeForAnchor = () => rng;
        try {
            const entry = { id: "e1", position: { type: "FragmentSelector", value: "epubcfi(/6/14!/4/2/1:0)" } };
            assert.equal(wv._wvEpubEntryPageLabel(reader, entry), "17");
            assert.equal(wv._wvEpubEntryPageLabel(reader, entry), "17");
            assert.equal(calls, 1, "second render uses the cache");
        }
        finally { wv._wvDomRangeForAnchor = orig; }
    });

    it("an unmounted EPUB anchor gets no label yet (and is not cached)", () => {
        const pv = { pageMapping: { getPageLabel: () => "1" } };
        const reader = { _type: "epub", _internalReader: { _primaryView: pv } };
        const orig = wv._wvDomRangeForAnchor;
        wv._wvDomRangeForAnchor = () => ({ startContainer: { isConnected: false } });
        try {
            assert.isNull(wv._wvEpubEntryPageLabel(reader, { id: "e2", href: "ch2.xhtml#x" }));
            assert.isFalse(reader._wvEpubPageLabels.has("e2||ch2.xhtml#x"));
        }
        finally { wv._wvDomRangeForAnchor = orig; }
    });

    it("a snapshot offers no Page numbers menu on the Outline or Bookmarks tab", () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-snap-menu");
        const orig = wv._wvReaderAtt;
        wv._wvReaderAtt = () => ({ libraryID: 1, itemKey: "SNAP" });
        try {
            const reader = { _type: "snapshot" };
            wv._wvOutlineShowTabMenu(reader, d, d.body);
            assert.isNull(d.querySelector(".wv-ctx-heading"), "no outline page-number menu");
            wv._wvBmShowTabMenu(reader, d, d.body);
            assert.isNull(d.querySelector(".wv-ctx-heading"), "no bookmarks page-number menu");
        }
        finally { wv._wvReaderAtt = orig; }
    });
});
