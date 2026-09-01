/* global describe, it, before, after, assert, Zotero */

// Outline scroll-spy contracts (FR #33, 2026-08-20). The spy highlights
// the entry for the current reading position on Weavero's takeover
// outline. These lock the selection rules that were established (one of
// them the hard way, live on real PDFs):
//
//   1. Deepest VISIBLE entry with pageIndex <= current page wins.
//   2. Equal-page ties keep the FIRST entry (STRICT >) -- native
//      getOutlinePath's rule. The >= variant shipped briefly and made
//      "click Abstract" settle on a same-page sibling (caught live on a
//      paper whose first three entries share page 0).
//   3. URL entries never participate (no document position).
//   4. Updates are suppressed within 1.5s of outline-initiated
//      navigation (reader._wvOutlineNavTime).
//   5. No rows / no page -> no crash, no marker.
//
// The reader is a pure-object stub (the page helper only dereferences
// _internalReader...pdfViewer.currentPageNumber); rows are real DOM in
// the hidden test window, matching the takeover's structure.

describe("Weavero — outline scroll-spy", () => {
    let wv, doc, host;

    // `loc` (optional) mimics pdf.js's pdfViewer._location, which the
    // sub-page pass reads: { pageIndex, topY } in PDF coordinates.
    const stubReader = (page, loc) => ({
        _internalReader: { _primaryView: { _iframeWindow: {
            PDFViewerApplication: { pdfViewer: {
                currentPageNumber: page + 1,
                _location: loc
                    ? { pageNumber: loc.pageIndex + 1, top: loc.topY }
                    : undefined,
            } },
            document: { getElementById: (/** @type {string} */ _id) => /** @type {any} */ (null) },
        } } },
    });

    // Build a takeover-shaped list: .wv-outline-reader-view > .wv-outline-list
    // with rows carrying the _wvOl expando the spy reads.
    const buildRows = (entries) => {
        host.innerHTML = "";
        const view = doc.createElement("div");
        view.className = "wv-outline-reader-view";
        const list = doc.createElement("div");
        list.className = "wv-outline-list";
        view.appendChild(list);
        host.appendChild(view);
        for (const e of entries) {
            const row = doc.createElement("div");
            row.className = "wv-outline-row";
            const lbl = doc.createElement("span");
            lbl.className = "wv-outline-label";
            lbl.textContent = e.title;
            row.appendChild(lbl);
            row._wvOl = { entry: e, index: 0, curatedView: false };
            list.appendChild(row);
        }
        return list;
    };

    const currentLabel = () => {
        const cur = host.querySelector(".wv-outline-row.wv-outline-current");
        return cur ? cur.querySelector(".wv-outline-label").textContent : null;
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        doc = Zotero.getMainWindow().document;
        host = doc.createElement("div");
        // Kept out of layout -- the spy queries structure, not geometry.
        host.style.display = "none";
        doc.documentElement.appendChild(host);
    });

    after(() => {
        try { host.remove(); } catch (e) {}
    });

    it("marks the deepest entry at or before the current page", () => {
        buildRows([
            { title: "Ch 1", position: { pageIndex: 0 } },
            { title: "Ch 2", position: { pageIndex: 10 } },
            { title: "2.1", position: { pageIndex: 12 } },
            { title: "Ch 3", position: { pageIndex: 30 } },
        ]);
        wv._wvOutlineSpyUpdate(stubReader(20), doc);
        assert.equal(currentLabel(), "2.1");
    });

    it("equal-page tie keeps the FIRST entry (strict >, native's rule)", () => {
        buildRows([
            { title: "Abstract", position: { pageIndex: 0 } },
            { title: "Video Link", position: { pageIndex: 0 } },
            { title: "Protocol", position: { pageIndex: 0 } },
            { title: "Results", position: { pageIndex: 2 } },
        ]);
        wv._wvOutlineSpyUpdate(stubReader(0), doc);
        assert.equal(currentLabel(), "Abstract");
    });

    it("URL entries never take the marker", () => {
        buildRows([
            { title: "Ch 1", position: { pageIndex: 0 } },
            { title: "Website", url: "https://example.org",
                position: { pageIndex: 5 } },
        ]);
        wv._wvOutlineSpyUpdate(stubReader(6), doc);
        assert.equal(currentLabel(), "Ch 1");
    });

    it("resolvedPosition wins over position (established curated targets)", () => {
        buildRows([
            { title: "A", position: { pageIndex: 0 } },
            { title: "B", position: { pageIndex: 99 },
                resolvedPosition: { pageIndex: 3 } },
        ]);
        wv._wvOutlineSpyUpdate(stubReader(4), doc);
        assert.equal(currentLabel(), "B");
    });

    it("suppressed within 1.5s of outline navigation", () => {
        buildRows([
            { title: "Ch 1", position: { pageIndex: 0 } },
            { title: "Ch 2", position: { pageIndex: 10 } },
        ]);
        const r = stubReader(12);
        r._wvOutlineNavTime = Date.now();
        wv._wvOutlineSpyUpdate(r, doc);
        assert.isNull(currentLabel(), "no marker while suppressed");
        r._wvOutlineNavTime = Date.now() - 2000;
        wv._wvOutlineSpyUpdate(r, doc);
        assert.equal(currentLabel(), "Ch 2");
    });

    it("marker moves (and the old one is cleared) when the page changes", () => {
        buildRows([
            { title: "Ch 1", position: { pageIndex: 0 } },
            { title: "Ch 2", position: { pageIndex: 10 } },
        ]);
        wv._wvOutlineSpyUpdate(stubReader(2), doc);
        assert.equal(currentLabel(), "Ch 1");
        wv._wvOutlineSpyUpdate(stubReader(11), doc);
        assert.equal(currentLabel(), "Ch 2");
        assert.equal(host.querySelectorAll(".wv-outline-current").length, 1);
    });

    it("the reading line matches where a click lands its target (1/4)", () => {
        // The plugin lands navigation targets a quarter down the view
        // (innerHeight * 0.25 / clientHeight / 4 at every jump site), and
        // the spy's reading line must sit at the SAME place: then
        // clicking an entry puts its heading exactly on the line, so the
        // marker settles on what was clicked by construction rather than
        // by luck. Change one and this fails, which is the point.
        assert.equal(wv._wvOutlineSpyLine, 1 / 4);
    });

    // ---- sub-page pass (same page, distinct heights) -----------------
    // Fixture mirrors Truscott 2013 page 0: Abstract 522 / Video Link
    // 352 / Protocol 306 (PDF coords, y grows upward).
    describe("sub-page discrimination", () => {
        const PAGE0 = [
            { title: "Abstract", position: { pageIndex: 0, rects: [[36, 513, 77, 522]] } },
            { title: "Video Link", position: { pageIndex: 0, rects: [[36, 343, 86, 352]] } },
            { title: "Protocol", position: { pageIndex: 0, rects: [[36, 297, 77, 306]] } },
            { title: "Results", position: { pageIndex: 2, rects: [[36, 479, 147, 488]] } },
        ];

        it("picks the closest heading above the viewport top", () => {
            buildRows(PAGE0);
            // Viewport top at y=320: Abstract(522) and Video Link(352)
            // are above it, Protocol(306) is not.
            wv._wvOutlineSpyUpdate(stubReader(0, { pageIndex: 0, topY: 320 }), doc);
            assert.equal(currentLabel(), "Video Link");
        });

        it("advances as the page scrolls", () => {
            buildRows(PAGE0);
            wv._wvOutlineSpyUpdate(stubReader(0, { pageIndex: 0, topY: 600 }), doc);
            assert.equal(currentLabel(), "Abstract", "above every heading: first of page");
            wv._wvOutlineSpyUpdate(stubReader(0, { pageIndex: 0, topY: 500 }), doc);
            assert.equal(currentLabel(), "Abstract");
            wv._wvOutlineSpyUpdate(stubReader(0, { pageIndex: 0, topY: 300 }), doc);
            assert.equal(currentLabel(), "Protocol");
        });

        it("no _location: falls back to page-granular (first of page)", () => {
            buildRows(PAGE0);
            wv._wvOutlineSpyUpdate(stubReader(0), doc);
            assert.equal(currentLabel(), "Abstract");
        });

        it("uniform heights (embedded page-top destinations) stay page-granular", () => {
            buildRows([
                { title: "Ch 1", position: { pageIndex: 4, rects: [[0, 665.972, 0, 665.972]] } },
                { title: "Ch 2", position: { pageIndex: 4, rects: [[0, 665.972, 0, 665.972]] } },
            ]);
            wv._wvOutlineSpyUpdate(stubReader(4, { pageIndex: 4, topY: 100 }), doc);
            assert.equal(currentLabel(), "Ch 1", "no distinct heights -> first of page");
        });

        it("the viewport's top edge governs, not the dominant page", () => {
            // REGRESSION (MJT 2026-08-20): currentPageNumber names the
            // DOMINANT page, _location the FIRST VISIBLE one. Reading the
            // tail of a page while the next one fills most of the window,
            // the dominant rule jumped to the next page's entry and
            // skipped every heading below the first one -- "it still
            // jumps from Discussion to References". The top edge wins.
            buildRows(PAGE0);
            wv._wvOutlineSpyUpdate(stubReader(2, { pageIndex: 0, topY: 320 }), doc);
            assert.equal(currentLabel(), "Video Link",
                "still reading page 0 even though page 2 dominates");
        });

        it("walks every heading in a page's tail (the reported case)", () => {
            // Truscott 2013 page 7: Discussion 424, Disclosures 191,
            // Acknowledgements 146 -- the last two sit in the tail, where
            // the next page already dominates the window.
            buildRows([
                { title: "Discussion", position: { pageIndex: 7, rects: [[36, 415, 89, 424]] } },
                { title: "Disclosures", position: { pageIndex: 7, rects: [[36, 182, 93, 191]] } },
                { title: "Acknowledgements", position: { pageIndex: 7, rects: [[36, 136, 130, 146]] } },
                { title: "References", position: { pageIndex: 8, rects: [[36, 694, 90, 704]] } },
            ]);
            const seen = [];
            for (const topY of [477, 290, 177, 140]) {
                // dominant page reads 8 throughout this stretch
                wv._wvOutlineSpyUpdate(stubReader(8, { pageIndex: 7, topY }), doc);
                seen.push(currentLabel());
            }
            assert.deepEqual(seen,
                ["Discussion", "Discussion", "Disclosures", "Acknowledgements"]);
        });

        it("past the page, the marker holds its LAST heading", () => {
            // REGRESSION (MJT 2026-08-20): "Abstract -> Video Link ->
            // Protocol, before going back to Abstract". Page 1 carries no
            // entries of its own, so the reading line moving onto it fell
            // back to the coarse rule -- first entry of the winning page.
            buildRows(PAGE0);
            wv._wvOutlineSpyUpdate(stubReader(0, { pageIndex: 0, topY: 200 }), doc);
            assert.equal(currentLabel(), "Protocol", "still on page 0");
            wv._wvOutlineSpyUpdate(stubReader(1, { pageIndex: 1, topY: 700 }), doc);
            assert.equal(currentLabel(), "Protocol", "page 1 has no entries: hold the last");
            wv._wvOutlineSpyUpdate(stubReader(2, { pageIndex: 2, topY: 400 }), doc);
            assert.equal(currentLabel(), "Results", "page 2 has its own entry");
        });

        it("a heading below the line does not take the marker (its page's first entry included)", () => {
            // REGRESSION (MJT 2026-08-20): reading page 21 with section 6
            // near the page's foot, the marker jumped to 6 because it was
            // the FIRST entry on the page the reading line sat on. You
            // have not reached it: section 5, from an earlier page, is
            // still the one being read.
            buildRows([
                { title: "5. Theoretical modelling", position: { pageIndex: 16, rects: [[36, 500, 200, 510]] } },
                { title: "6. Comparison", position: { pageIndex: 20, rects: [[36, 120, 200, 130]] } },
                { title: "7. Parametric study", position: { pageIndex: 21, rects: [[36, 600, 200, 610]] } },
            ]);
            // Line a quarter down page 20, well ABOVE section 6's heading.
            wv._wvOutlineSpyUpdate(stubReader(20, { pageIndex: 20, topY: 590 }), doc);
            assert.equal(currentLabel(), "5. Theoretical modelling");
            // Once the line passes the heading, 6 takes over.
            wv._wvOutlineSpyUpdate(stubReader(20, { pageIndex: 20, topY: 100 }), doc);
            assert.equal(currentLabel(), "6. Comparison");
        });

        it("page anchors order by their anchor, not their placeholder rect", () => {
            buildRows([
                { title: "Top of page", position: { pageIndex: 3, rects: [[0, 0, 0, 0]], anchor: "top" } },
                { title: "Bottom of page", position: { pageIndex: 3, rects: [[0, 0, 0, 0]], anchor: "bottom" } },
            ]);
            wv._wvOutlineSpyUpdate(stubReader(3, { pageIndex: 3, topY: 400 }), doc);
            assert.equal(currentLabel(), "Top of page", "bottom anchor not reached yet");
        });
    });

    it("no rows / before the first entry: no marker, no crash", () => {
        buildRows([]);
        wv._wvOutlineSpyUpdate(stubReader(5), doc);
        assert.isNull(currentLabel());
        buildRows([{ title: "Ch 5", position: { pageIndex: 50 } }]);
        wv._wvOutlineSpyUpdate(stubReader(5), doc);
        assert.isNull(currentLabel(), "nothing at or before page 5");
    });
});

// DOM VIEWS: the spy must WIRE to a scroll feed there too. Snapshots and
// EPUBs have no #viewerContainer -- the content window scrolls the
// document itself -- so the pre-2026-09-01 wire found no target and never
// attached a listener: the picker computed the right section at every
// position while the marker sat frozen (MJT, live on a snapshot; five
// scroll positions, marker unmoved). Window targets stamp the READER.
describe("Weavero — outline scroll-spy wiring (DOM views)", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineSpyWire !== "function") this.skip();
    });

    const stubWin = () => {
        const listeners = [];
        return {
            _listeners: listeners,
            document: { getElementById: (/** @type {string} */ _id) => /** @type {any} */ (null) },
            addEventListener: (type, fn) => listeners.push(type),
            removeEventListener: () => {},
        };
    };

    it("wires the CONTENT WINDOW when there is no #viewerContainer (snapshot/EPUB)", () => {
        const win = stubWin();
        const reader = {
            _type: "snapshot",
            _internalReader: { _primaryView: { _iframeWindow: win } },
        };
        const idoc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-spy-wire");
        wv._wvOutlineSpyWire(reader, idoc);
        assert.include(win._listeners, "scroll", "content window got the scroll feed");
        assert.isFunction(reader._wvOlSpyHandler_win, "handler stamped on the READER");
        assert.equal(reader._wvOlSpyPlugin_win, wv, "plugin stamp for reload safety");
    });

    it("is idempotent for the same plugin instance", () => {
        const win = stubWin();
        const reader = {
            _type: "epub",
            _internalReader: { _primaryView: { _iframeWindow: win } },
        };
        const idoc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-spy-wire2");
        wv._wvOutlineSpyWire(reader, idoc);
        wv._wvOutlineSpyWire(reader, idoc);
        assert.equal(win._listeners.filter((t) => t === "scroll").length, 1,
            "one listener, not one per render pass");
    });

    it("PDF readers still wire the viewerContainer, not the window", () => {
        const win = stubWin();
        const vcListeners = [];
        const vc = {
            addEventListener: (type) => vcListeners.push(type),
            removeEventListener: () => {},
        };
        win.document.getElementById = (id) => (id === "viewerContainer" ? vc : null);
        const reader = {
            _type: "pdf",
            _internalReader: { _primaryView: { _iframeWindow: win } },
        };
        const idoc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-spy-wire3");
        wv._wvOutlineSpyWire(reader, idoc);
        assert.include(vcListeners, "scroll", "pdf keeps its container feed");
        assert.notInclude(win._listeners, "scroll", "and does not double-wire the window");
    });
});

// The DOM picker's reading line: a quarter down the view, the same line
// outline clicks land their target on. Compared against the viewport TOP
// (pre-2026-09-01) the marker lagged one section behind every click.
describe("Weavero \u2014 DOM spy reading line (1/4)", () => {
    let wv, origRange;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineSpyPickDom !== "function") this.skip();
        origRange = wv._wvDomRangeForAnchor;
    });

    after(function () {
        if (origRange) wv._wvDomRangeForAnchor = origRange;
    });

    // rows whose entries resolve to fixed viewport tops via a stubbed
    // range resolver; innerHeight 1000 -> the line sits at y=250.
    const build = (tops) => {
        const doc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-dom-spy-line");
        const list = doc.createElement("div");
        list.className = "wv-outline-list";
        doc.body.appendChild(list);
        const byId = {};
        tops.forEach(([title, top], i) => {
            const row = /** @type {any} */ (doc.createElement("div"));
            row.className = "wv-outline-row";
            row.textContent = title;
            row._wvOl = { entry: { id: "e" + i, title } };
            byId["e" + i] = top;
            list.appendChild(row);
        });
        wv._wvDomRangeForAnchor = (_pv, en) => ({
            getBoundingClientRect: () => ({ top: byId[en.id], height: 20, width: 100 }),
        });
        const reader = {
            _type: "snapshot",
            _internalReader: { _primaryView: { _iframeWindow: { innerHeight: 1000 } } },
        };
        return { list, reader };
    };

    it("counts a heading as reached at the quarter line, not the top edge", () => {
        // "Second" sits at 200 -> above the 250 line -> it is the current one.
        const { list, reader } = build([["First", -900], ["Second", 200], ["Third", 700]]);
        const picked = wv._wvOutlineSpyPickDom(reader, list);
        assert.equal(picked.textContent, "Second");
    });

    it("a heading still below the line does not take the marker", () => {
        const { list, reader } = build([["First", -900], ["Second", 400], ["Third", 900]]);
        const picked = wv._wvOutlineSpyPickDom(reader, list);
        assert.equal(picked.textContent, "First", "400 > line(250): not reached yet");
    });

    it("above every heading, the first resolvable row holds the marker", () => {
        const { list, reader } = build([["First", 600], ["Second", 900]]);
        const picked = wv._wvOutlineSpyPickDom(reader, list);
        assert.equal(picked.textContent, "First");
    });
});
