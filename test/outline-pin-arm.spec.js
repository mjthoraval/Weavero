/* global describe, it, beforeEach, before, after, assert, Zotero */

// "+ → Pin a spot…" click routing on DOM views (2026-08-26).
//
// The arm worked everywhere (ghost pin replaced the cursor) but the click
// handler was pure PDF: it required `e.target.closest(".page")` and a pdf.js
// viewport, so on a snapshot/EPUB every drop silently "stayed armed" — the
// reported shape was exactly "it changes the mouse to a pin, but a click does
// not put it there". The arm now routes DOM clicks through caret-at-point
// (`_wvDomAnchorFromContentPoint`) to a separate DOM completion callback.

describe("Weavero — pin-placement arm routes DOM clicks", () => {
    let wv, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineArmPinPlacement !== "function") this.skip();
        win = Zotero.getMainWindow();
    });

    after(() => {
        // drop any stub left by a failing case
        try { delete wv._wvDomAnchorFromContentPoint; } catch (_) {}
    });

    // A fake DOM-view reader over a detached document. `toSelector` present is
    // what marks the view as DOM-family for the arm.
    const mkEnv = () => {
        const doc = win.document.implementation.createHTMLDocument("wv-arm-test");
        const fakeWin = { document: doc, setTimeout: () => 0, clearTimeout: () => {} };
        const pv = { toSelector: () => null, _iframeWindow: fakeWin, _iframeDocument: doc };
        const reader = { _type: "snapshot", _internalReader: { _primaryView: pv } };
        const idoc = win.document.implementation.createHTMLDocument("wv-arm-panel");
        return { doc, pv, reader, idoc };
    };
    const click = (doc, x, y) =>
        doc.dispatchEvent(new win.MouseEvent("click", { bubbles: true, clientX: x || 10, clientY: y || 10 }));

    it("a DOM click reaches the DOM completion with a point anchor — never the PDF one", () => {
        const { doc, reader, idoc } = mkEnv();
        wv._wvDomAnchorFromContentPoint = () =>
            ({ selector: { type: "CssSelector", value: "#h" }, position: { type: "CssSelector", value: "#h" }, cfi: null, sortIndex: "0001" });
        try {
            let dom = null, pdf = 0;
            wv._wvOutlineArmPinPlacement(reader, idoc, () => { pdf++; }, (pos, d) => { dom = { pos, d }; });
            click(doc);
            assert.ok(dom, "the DOM completion must receive the click");
            assert.equal(dom.pos.anchor, "point", "hand-placed spots carry anchor:'point' on both families");
            assert.equal(dom.pos.type, "CssSelector");
            assert.equal(pdf, 0, "the PDF callback must not fire on a DOM view");
        } finally { delete wv._wvDomAnchorFromContentPoint; }
    });

    it("an unresolvable point disarms cleanly — no callback, no zombie listeners", () => {
        const { doc, reader, idoc } = mkEnv();
        wv._wvDomAnchorFromContentPoint = () => null;   // click on empty margin
        try {
            let dom = 0, pdf = 0;
            wv._wvOutlineArmPinPlacement(reader, idoc, () => { pdf++; }, () => { dom++; });
            click(doc);
            assert.equal(dom + pdf, 0, "nothing placed");
            // the arm must have cleaned up: a second click may not re-enter
            wv._wvDomAnchorFromContentPoint = () =>
                ({ selector: { type: "CssSelector", value: "#h" }, cfi: null, sortIndex: null });
            click(doc);
            assert.equal(dom + pdf, 0, "pre-fix shape: the old handler stayed armed forever");
            assert.isNull(doc.querySelector(".wv-pin-ghost"), "ghost removed with the arm");
        } finally { delete wv._wvDomAnchorFromContentPoint; }
    });

    it("arming sweeps a stale ghost from an abandoned arm", () => {
        const { doc, reader, idoc } = mkEnv();
        const stale = doc.createElement("div");
        stale.className = "wv-reader-pin wv-pin-ghost";
        doc.body.appendChild(stale);
        wv._wvOutlineArmPinPlacement(reader, idoc, () => {}, () => {});
        assert.equal(doc.querySelectorAll(".wv-pin-ghost").length, 1,
            "exactly the new ghost — the stale one (pre-fix arms could never complete) is swept");
    });

    it("a PDF-family view still requires a .page hit (stays armed off-page)", () => {
        const { doc, reader, idoc } = mkEnv();
        delete reader._internalReader._primaryView.toSelector;   // PDF family marker gone
        reader._type = "pdf";
        let pdf = 0, dom = 0;
        wv._wvOutlineArmPinPlacement(reader, idoc, () => { pdf++; }, () => { dom++; });
        click(doc);   // no .page ancestor in this doc
        assert.equal(pdf + dom, 0, "off-page clicks keep the PDF arm armed, unchanged");
    });
});

// Intra-image precise pins (2026-08-26): an image is internally rigid — it
// scales as a unit — so a FRACTIONAL offset {rx, ry} keeps pointing at the
// same visual feature at any rendered size. Text reflows; only media anchors
// carry an offset. The placement math is shared by the pin draw and the
// post-drag snap.
describe("Weavero — media pin fractional placement", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDomPinDocPoint !== "function") this.skip();
    });

    const rect = { left: 100, top: 200, width: 400, height: 300 };

    it("no offset -> top-centre (the text-anchor contract, unchanged)", () => {
        const pt = wv._wvDomPinDocPoint(rect, 10, 20);
        assert.equal(pt.x, 100 + 200 + 10);
        assert.equal(pt.y, 200 + 20);
    });

    it("a fractional offset places the tip INSIDE the box", () => {
        const pt = wv._wvDomPinDocPoint(rect, 10, 20, { rx: 0.7, ry: 0.25 });
        assert.equal(pt.x, 100 + 0.7 * 400 + 10);
        assert.equal(pt.y, 200 + 0.25 * 300 + 20);
    });

    it("a malformed offset falls back to top-centre, never NaN", () => {
        const pt = wv._wvDomPinDocPoint(rect, 0, 0, { rx: "0.5" });
        assert.equal(pt.x, 300);
        assert.equal(pt.y, 200);
        assert.isFalse(Number.isNaN(pt.x) || Number.isNaN(pt.y));
    });
});
