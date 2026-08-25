/* global describe, it, before, assert, Zotero */

// Draggable pins + location keys for EPUB and snapshot (2026-08-24).
//
// Two gaps closed together:
//
//  - Only the PDF pin was draggable; the DOM-view pins were `pointer-events:
//    none` markers.
//  - DOM-view position bookmarks had NO `sortIndex` at all, because the PDF
//    backfill computes keys from page data and `_wvReaderGetPageData` returns
//    null for every non-PDF view. "Sorted by Location" therefore could not
//    order them -- before any dragging entered the picture.
//
// The DRAG THRESHOLD is the load-bearing detail, inherited from the PDF pin
// which paid for it: the pin renders `translate(-50%,-100%)`, its head ABOVE
// the anchor, so without a threshold a plain CLICK on the head commits the
// cursor point and walks the bookmark upward on every click.
//
// Anchor resolution and key computation were verified live against a real
// snapshot AND a real EPUB. A REAL mouse drag cannot be scripted (synthetic
// events are isTrusted:false and pointer capture does not apply), so what is
// locked here is the threshold and the anchor/key logic, not the gesture.

describe("Weavero — DOM-view pin drag and location keys", () => {
    let wv, doc;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDomAnchorFromContentPoint !== "function") this.skip();
        doc = Zotero.getMainWindow().document;
    });

    const freshDoc = () => doc.implementation.createHTMLDocument("wv-drag-test");

    // A view stub: `getCFI` present => EPUB, absent => snapshot. That is the
    // real discriminator in the code, not a type string.
    const view = (opts = {}) => {
        const d = opts.doc || freshDoc();
        const v = {
            _iframeDocument: d,
            _iframeWindow: { scrollX: 0, scrollY: 0, setTimeout: () => 0, clearTimeout: () => {} },
            _iframe: { getBoundingClientRect: () => ({ x: 0, y: 0 }) },
            toSelector: () => ({ type: "CssSelector", value: "#p1" }),
            toDisplayedRange: () => opts.range || null,
        };
        d.caretPositionFromPoint = opts.noCaret ? () => null : () => ({ offsetNode: { nodeType: 3 }, offset: 4 });
        d.createRange = () => ({ setStart() {}, setEnd() {} });
        if (opts.epub) { v.getCFI = () => "epubcfi(/6/4!/4/2:10)"; v.getRange = () => opts.range || null; }
        if (!opts.noSortIndex) v._getSortIndex = () => (opts.epub ? "00006|00005920" : "0004933");
        return v;
    };

    describe("anchor + location key", () => {
        it("a snapshot yields a selector and a key", () => {
            const a = wv._wvDomAnchorFromContentPoint(view(), 10, 10);
            assert.ok(a);
            assert.equal(a.position.type, "CssSelector");
            assert.isNull(a.cfi, "a snapshot has no CFI");
            assert.equal(a.sortIndex, "0004933");
        });

        it("an EPUB yields a CFI and a key, never a selector", () => {
            const a = wv._wvDomAnchorFromContentPoint(view({ epub: true }), 10, 10);
            assert.ok(a);
            assert.isNull(a.position, "EPUB keeps CFI as its anchor everywhere else in Weavero");
            assert.include(a.cfi, "epubcfi(");
            assert.equal(a.sortIndex, "00006|00005920");
        });

        it("still anchors when the private _getSortIndex is gone", () => {
            // Upstream-private method: if a reader bump removes it the bookmark
            // must still work, just without a location key.
            const a = wv._wvDomAnchorFromContentPoint(view({ noSortIndex: true }), 10, 10);
            assert.ok(a, "losing the key must not lose the anchor");
            assert.ok(a.position);
            assert.isNull(a.sortIndex);
        });

        it("returns null where there is no text", () => {
            assert.isNull(wv._wvDomAnchorFromContentPoint(view({ noCaret: true }), 10, 10));
        });

        it("returns null for a view with no selector support (PDF)", () => {
            assert.isNull(wv._wvDomAnchorFromContentPoint({}, 10, 10));
        });
    });

    describe("resolving a stored anchor back to a range", () => {
        it("uses the CFI resolver when the bookmark has one", function () {
            if (typeof wv._wvDomRangeForAnchor !== "function") this.skip();
            const range = { getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) };
            const v = view({ epub: true, range });
            v.getRange = () => ({ toRange: () => range });
            assert.strictEqual(wv._wvDomRangeForAnchor(v, { location: { cfi: "epubcfi(/6/4)" } }), range);
        });

        it("uses the selector resolver for a rect-less position", function () {
            if (typeof wv._wvDomRangeForAnchor !== "function") this.skip();
            const range = { getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) };
            assert.strictEqual(
                wv._wvDomRangeForAnchor(view({ range }), { position: { type: "CssSelector", value: "#p1" } }),
                range);
        });

        it("declines a PDF geometry position", function () {
            if (typeof wv._wvDomRangeForAnchor !== "function") this.skip();
            assert.isNull(wv._wvDomRangeForAnchor(view({ range: {} }),
                { position: { pageIndex: 0, rects: [[0, 0, 1, 1]] } }));
        });
    });

    describe("the drag threshold", () => {
        // Drives the wiring directly with synthetic pointer events. They are
        // isTrusted:false, which the handler does not care about -- it reads
        // coordinates only.
        const wirePin = () => {
            const d = freshDoc();
            const pin = d.createElement("div");
            pin.style.left = "100px"; pin.style.top = "200px";
            d.body.appendChild(pin);
            let disarmed = 0, armed = 0;
            wv._wvWireDomPinDrag(
                { scrollX: 0, scrollY: 0 }, d, pin, 100, 200,
                { _internalReader: {} }, { id: "wv-test" },
                () => { disarmed++; }, () => { armed++; });
            return { d, pin, counts: () => ({ disarmed, armed }) };
        };
        const send = (target, type, x, y) => {
            // target may be the DOCUMENT itself (pointermove/up are wired on
            // it), and document.ownerDocument is null -- the live probe that
            // verified this behaviour used d.createEvent directly.
            const dd = target.ownerDocument || target;
            const ev = dd.createEvent("Event");
            ev.initEvent(type, true, true);
            ev.clientX = x; ev.clientY = y; ev.button = 0; ev.pointerId = 1;
            target.dispatchEvent(ev);
            return ev;
        };

        it("a small movement does NOT move the pin", function () {
            if (typeof wv._wvWireDomPinDrag !== "function") this.skip();
            const { d, pin } = wirePin();
            send(pin, "pointerdown", 500, 500);
            send(d, "pointermove", 502, 501);           // ~2px, under threshold
            assert.equal(pin.style.left, "100px", "a click must not reposition the bookmark");
            assert.equal(pin.style.top, "200px");
        });

        it("a real drag moves it by the pointer delta", function () {
            if (typeof wv._wvWireDomPinDrag !== "function") this.skip();
            const { d, pin } = wirePin();
            send(pin, "pointerdown", 500, 500);
            send(d, "pointermove", 540, 530);           // 40/30 => well over
            assert.equal(pin.style.left, "140px");
            assert.equal(pin.style.top, "230px");
        });

        it("disarms the fade so the pin cannot vanish mid-drag", function () {
            if (typeof wv._wvWireDomPinDrag !== "function") this.skip();
            const { pin, counts } = wirePin();
            send(pin, "pointerdown", 500, 500);
            assert.equal(counts().disarmed, 1);
        });

        it("ignores non-primary buttons", function () {
            if (typeof wv._wvWireDomPinDrag !== "function") this.skip();
            const { d, pin } = wirePin();
            const ev = d.createEvent("Event");
            ev.initEvent("pointerdown", true, true);
            ev.clientX = 500; ev.clientY = 500; ev.button = 2; ev.pointerId = 1;
            pin.dispatchEvent(ev);
            send(d, "pointermove", 560, 560);
            assert.equal(pin.style.left, "100px", "right-click must not start a drag");
        });
    });
});
