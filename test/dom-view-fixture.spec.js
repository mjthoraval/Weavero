/* global describe, it, before, after, assert, Zotero, Components */

// Real DOM-view readers in the runner (survey 2026-10-06 §6, step 5): no
// spec opened an EPUB or a snapshot before, so the Xray / cloneInto boundary
// between Weavero's chrome code and the content-side view was invisible --
// every DOM-view spec drove a stub `{ _iframeDocument, toSelector, ... }`.
// These cases open the fixtures wvT builds (an HTML page; a two-chapter
// EPUB 3 written with nsIZipWriter) and run Weavero's DOM anchor and pin on
// the REAL view and document: a point in a paragraph yields a selector on
// the snapshot and a CFI on the EPUB, the selector round-trips to a Range,
// and the pin is drawn in the content document.

describe("Weavero — DOM-view readers (snapshot, EPUB) open in the runner", function () {
    this.timeout(120000);
    let wv, snap, epub, rSnap, rEpub;

    before(() => {
        wv = wvT.plugin();
        wvT.method("_wvDomAnchorFromContentPoint");
        wvT.method("_wvDomSelectorRoundTrips");
        wvT.method("_wvReaderShowSnapshotPin");
    });

    after(async () => {
        wvT.closeReaderTab(rSnap);
        wvT.closeReaderTab(rEpub);
        await wvT.sleep(300);
        await wvT.erase(snap, epub);
    });

    it("a snapshot attachment opens as a snapshot reader with a DOM view", async () => {
        snap = await wvT.createTestSnapshotItem("wv-dom-snap");
        assert.equal(snap.attachmentContentType, "text/html");
        assert.equal(/** @type {any} */ (snap).attachmentReaderType, "snapshot");
        rSnap = await wvT.openReaderTab(snap.id);
        assert.ok(rSnap, "the reader opened");
        assert.equal(rSnap._type, "snapshot");
        const pv = await wvT.domViewOf(rSnap, "WV-TEST first paragraph");
        assert.ok(pv, "the DOM view rendered the fixture page");
        assert.isFunction(pv.toDisplayedRange, "a DOM view: toDisplayedRange is the DOM-view test");
        assert.isFunction(pv.toSelector);
        assert.notOk(pv.getCFI, "a snapshot view has no CFI");
    });

    it("Weavero's DOM anchor and pin work on the REAL snapshot view, not a stub", async () => {
        const pv = await wvT.domViewOf(rSnap, "WV-TEST first paragraph");
        const doc = pv._iframeDocument;
        const p = doc.getElementById("p1");
        assert.ok(p, "the fixture paragraph is in the content document");
        const r = p.getBoundingClientRect();
        assert.isAbove(r.width, 0, "laid out (the tab is visible)");
        const a = wv._wvDomAnchorFromContentPoint(pv, r.left + 8, r.top + r.height / 2);
        assert.ok(a, "a point in the paragraph anchors");
        assert.equal(a.position.type, "CssSelector");
        assert.isNull(a.cfi, "a snapshot anchor is a selector, never a CFI");
        // THE BOUNDARY this fixture exists for: the anchor is a chrome-side
        // object; the view resolves it only once it is cloned into the content
        // compartment (what every production caller does before
        // toDisplayedRange). A chrome object handed over as-is resolves to
        // nothing -- the first run of this case proved it.
        const arg = Components.utils.cloneInto(a.position, pv._iframeWindow);
        const range = pv.toDisplayedRange(arg);
        assert.ok(range, "the selector resolves to a Range once cloned into the content compartment");
        const rr = range.getBoundingClientRect();
        assert.isAbove(rr.width + rr.height, 0, "a visible range");
        assert.isTrue(wv._wvDomSelectorRoundTrips(pv, a.position, range), "the anchor round-trips: same text, same box");
        // The production pin path (cloneInto + toDisplayedRange + draw).
        const ok = wv._wvReaderShowSnapshotPin(rSnap, a.position);
        assert.isTrue(ok, "the snapshot pin was drawn through the production path");
        assert.equal(doc.querySelectorAll(".wv-reader-pin").length, 1, "one pin in the content document");
    });

    it("an EPUB attachment opens as an EPUB reader whose view yields CFIs", async () => {
        epub = await wvT.createTestEPUBItem("wv-dom-epub");
        assert.equal(epub.attachmentContentType, "application/epub+zip");
        assert.equal(/** @type {any} */ (epub).attachmentReaderType, "epub");
        rEpub = await wvT.openReaderTab(epub.id);
        assert.ok(rEpub, "the reader opened");
        assert.equal(rEpub._type, "epub");
        const pv = await wvT.domViewOf(rEpub, "WV-TEST chapter one");
        assert.ok(pv, "the EPUB view mounted chapter one");
        assert.isFunction(pv.getCFI, "an EPUB view has getCFI");
        const doc = pv._iframeDocument;
        const p = doc.getElementById("c1p1");
        assert.ok(p, "the chapter paragraph is in the content document");
        const r = p.getBoundingClientRect();
        assert.isAbove(r.width, 0, "laid out");
        const a = wv._wvDomAnchorFromContentPoint(pv, r.left + 8, r.top + r.height / 2);
        assert.ok(a, "a point in the chapter anchors");
        assert.isNull(a.position, "an EPUB anchor is a CFI, never a selector");
        assert.include(String(a.cfi), "epubcfi(");
        assert.isOk(a.sortIndex, "a location key for 'Sorted by Location'");
    });
});
