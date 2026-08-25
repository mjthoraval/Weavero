/* global describe, it, before, assert, Zotero */

// A snapshot position bookmark drops the 📌 marker (2026-08-24).
//
// A position bookmark is documented to mark its exact spot with a pin. PDF had
// `_wvReaderShowPin` (unscaled page units) and EPUB had `_wvReaderShowEpubPin`
// (CFI) -- a snapshot matched neither, so it navigated correctly but gave no
// confirmation it had landed. Sibling of the capture fix that gave these
// bookmarks a real anchor in the first place.
//
// The EPUB and snapshot pins now differ ONLY in how they resolve an anchor to a
// Range, so the drawing lives in `_wvReaderDrawDomPin`. These cases drive that
// with a REAL document (so the DOM work is genuine) and a stub range, plus the
// snapshot resolver's gating.

describe("Weavero — snapshot position pin", () => {
    let wv, doc;

    const stubWin = () => {
        const timers = [];
        return {
            scrollX: 0, scrollY: 0,
            setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
            _timers: timers,
        };
    };
    const stubRange = (rect) => ({ getBoundingClientRect: () => rect });
    const RECT = { left: 100, top: 200, width: 40, height: 16 };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReaderDrawDomPin !== "function") this.skip();
        doc = Zotero.getMainWindow().document;
    });

    const freshDoc = () => doc.implementation.createHTMLDocument("wv-pin-test");

    describe("drawing", () => {
        it("appends a pin element to the content document", () => {
            const d = freshDoc();
            const ok = wv._wvReaderDrawDomPin(stubWin(), d, stubRange(RECT));
            assert.isTrue(ok);
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 1);
        });

        it("positions it in DOCUMENT coordinates, so scroll cannot shift it", () => {
            const d = freshDoc();
            const w = stubWin();
            w.scrollX = 30; w.scrollY = 500;
            wv._wvReaderDrawDomPin(w, d, stubRange(RECT));
            const pin = d.querySelector(".wv-reader-pin");
            // left = rect.left + width/2 + scrollX ; top = rect.top + scrollY
            // (style properties, not cssText substrings: the serializer
            // normalizes "left:150px" to "left: 150px")
            assert.equal(pin.style.left, "150px");
            assert.equal(pin.style.top, "700px");
        });

        it("refuses an all-zero rect rather than pinning the origin", () => {
            const d = freshDoc();
            const ok = wv._wvReaderDrawDomPin(stubWin(), d,
                stubRange({ left: 0, top: 0, width: 0, height: 0 }));
            assert.isFalse(ok, "an unresolved anchor must not draw a pin at 0,0");
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 0);
        });

        it("replaces the previous pin instead of stacking them", () => {
            const d = freshDoc();
            wv._wvReaderDrawDomPin(stubWin(), d, stubRange(RECT));
            wv._wvReaderDrawDomPin(stubWin(), d, stubRange({ left: 5, top: 5, width: 2, height: 2 }));
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 1);
        });

        it("schedules its own fade and removal", () => {
            const d = freshDoc();
            const w = stubWin();
            wv._wvReaderDrawDomPin(w, d, stubRange(RECT));
            assert.equal(w._timers.length, 2, "fade then remove");
            assert.isAbove(w._timers[1], w._timers[0]);
        });

        it("returns false on a range that cannot be measured", () => {
            assert.isFalse(wv._wvReaderDrawDomPin(stubWin(), freshDoc(), null));
            assert.isFalse(wv._wvReaderDrawDomPin(stubWin(), freshDoc(), {}));
        });
    });

    describe("the snapshot resolver", () => {
        const readerWith = (view) => ({ _type: "snapshot", _internalReader: { _primaryView: view } });
        const viewFor = (d, w, range) => ({
            _iframeWindow: w, _iframeDocument: d,
            toDisplayedRange: () => range,
        });

        it("resolves a stored selector and draws the pin", function () {
            if (typeof wv._wvReaderShowSnapshotPin !== "function") this.skip();
            const d = freshDoc(), w = stubWin();
            const ok = wv._wvReaderShowSnapshotPin(
                readerWith(viewFor(d, w, stubRange(RECT))),
                { type: "CssSelector", value: "#x" });
            assert.isTrue(ok);
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 1);
        });

        it("declines a PDF geometry position, so the PDF pin still runs", function () {
            if (typeof wv._wvReaderShowSnapshotPin !== "function") this.skip();
            const d = freshDoc(), w = stubWin();
            const ok = wv._wvReaderShowSnapshotPin(
                readerWith(viewFor(d, w, stubRange(RECT))),
                { pageIndex: 0, rects: [[0, 0, 10, 10]] });
            assert.isFalse(ok, "rects mean PDF; the caller must fall through");
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 0);
        });

        it("declines a view with no selector resolver", function () {
            if (typeof wv._wvReaderShowSnapshotPin !== "function") this.skip();
            assert.isFalse(wv._wvReaderShowSnapshotPin(
                readerWith({ _iframeWindow: stubWin(), _iframeDocument: freshDoc() }),
                { type: "CssSelector", value: "#x" }));
        });

        it("declines when the selector no longer resolves", function () {
            if (typeof wv._wvReaderShowSnapshotPin !== "function") this.skip();
            const d = freshDoc();
            assert.isFalse(wv._wvReaderShowSnapshotPin(
                readerWith(viewFor(d, stubWin(), null)),
                { type: "CssSelector", value: "#gone" }));
            assert.equal(d.querySelectorAll(".wv-reader-pin").length, 0);
        });
    });
});
