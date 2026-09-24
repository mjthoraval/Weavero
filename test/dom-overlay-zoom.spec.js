/* global describe, it, before, assert, Zotero */

// DOM-view overlays under the reader's content zoom (MJT 2026-09-24, "I
// cannot see the highlight when I click on an outline item"). Zotero's
// snapshot / Reading Mode view zooms every direct <body> child:
//   body > :not(#annotation-overlay) { zoom: var(--scale, 1); }
// Weavero places its overlays on <body> in client-px document coordinates,
// so at a 92 % zoom the outline flash landed 100 px above its heading. The
// overlays now opt out (inline zoom:1 !important). This reproduces the rule
// at 50 % so the error is unmistakable; FAILS on the pre-fix code.

describe("Weavero — DOM overlays ignore the reader's content zoom", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    // Async tests must use mkViewLoaded: the iframe's initial about:blank load
    // can finish during an await and replace the document under the test.
    const mkViewLoaded = async () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        await Promise.race([
            new Promise((res) => host.addEventListener("load", res, { once: true })),
            new Promise((res) => setTimeout(res, 300)),
        ]);
        return mkView(host);
    };

    const mkView = (existing) => {
        const win = Zotero.getMainWindow();
        let host = existing;
        if (!host) {
            host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
            host.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;visibility:hidden;");
            win.document.documentElement.appendChild(host);
        }
        const d = host.contentDocument;
        const st = d.createElement("style");
        st.textContent = "body > :not(#annotation-overlay) { zoom: var(--scale, 1); } body { margin: 0; }";
        d.documentElement.style.setProperty("--scale", "0.5");
        d.head.appendChild(st);
        const wrap = d.createElement("div");
        wrap.innerHTML = "<div style='height:600px'></div><h2 style='margin:0;font:20px serif'>Target heading</h2>";
        d.body.appendChild(wrap);
        const h = d.querySelector("h2");
        const range = d.createRange();
        range.selectNodeContents(h);
        const pv = { _iframeWindow: host.contentWindow, _iframeDocument: d };
        return { host, d, range, pv };
    };

    it("the outline flash covers its range at 50 % zoom", () => {
        const { host, d, range, pv } = mkView();
        try {
            const rr = range.getClientRects()[0];
            if (!rr || !rr.height) return;   // no layout in this environment: vacuous
            wv._wvDomHighlightRange(pv, range);
            const box = d.querySelector(".wv-dom-heading-flash");
            assert.isOk(box, "flash drawn");
            const b = box.getBoundingClientRect();
            assert.closeTo(b.top, rr.top, 2, "flash top on the heading");
            assert.closeTo(b.left, rr.left, 2, "flash left on the heading");
            assert.closeTo(b.height, rr.height, 2, "flash as tall as the text");
        }
        finally { host.remove(); }
    });

    // Follow-up the same day: zooming WHILE the flash (or pin, or editor)
    // is up left it at the old spot. The reader changes zoom by rewriting
    // --scale on <html>; the overlays re-measure on that mutation.
    it("the flash follows a zoom change while it is shown", async () => {
        const { host, d, range, pv } = await mkViewLoaded();
        try {
            const r0 = range.getClientRects()[0];
            if (!r0 || !r0.height) return;
            wv._wvDomHighlightRange(pv, range);
            d.documentElement.style.setProperty("--scale", "0.8");
            await new Promise((res) => setTimeout(res, 0));
            const rr = range.getClientRects()[0];
            assert.isAbove(Math.abs(rr.top - r0.top), 5, "the zoom change moved the text");
            const b = d.querySelector(".wv-dom-heading-flash").getBoundingClientRect();
            assert.closeTo(b.top, rr.top, 2, "flash moved with the text");
            assert.closeTo(b.height, rr.height, 2, "and resized with it");
        }
        finally { host.remove(); }
    });

    // Paginated EPUB: a page turn moves body > .sections by its left style.
    // An overlay placed before the move stayed off-screen (the pin appeared
    // only on a second click, MJT 2026-09-24); overlays re-measure on it.
    it("an overlay follows a paginated page turn (.sections moved)", async () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        try {
            // Let the iframe's initial about:blank load finish FIRST: it can
            // complete during the await below and replace the document under
            // the test (full-suite run 2026-09-24: "rr is undefined").
            await Promise.race([
                new Promise((res) => host.addEventListener("load", res, { once: true })),
                new Promise((res) => setTimeout(res, 300)),
            ]);
            const d = host.contentDocument;
            d.body.style.margin = "0";
            const secs = d.createElement("div");
            secs.className = "sections";
            secs.setAttribute("style", "position:relative;left:0px;top:0px;");
            secs.innerHTML = "<h2 style='margin:40px 0 0 300px;font:20px serif'>Far heading</h2>";
            d.body.appendChild(secs);
            const range = d.createRange();
            range.selectNodeContents(d.querySelector("h2"));
            const r0 = range.getClientRects()[0];
            if (!r0 || !r0.height) return;
            const pv = { _iframeWindow: host.contentWindow, _iframeDocument: d };
            wv._wvDomHighlightRange(pv, range);
            secs.style.left = "-250px";
            await new Promise((res) => setTimeout(res, 0));
            const rr = range.getClientRects()[0];
            assert.isAbove(Math.abs(rr.left - r0.left), 100, "the page turn moved the text");
            const b = d.querySelector(".wv-dom-heading-flash").getBoundingClientRect();
            assert.closeTo(b.left, rr.left, 2, "the overlay moved with it");
        }
        finally { host.remove(); }
    });

    // Zoomed in, the snapshot is wider than the view: a jump to its right-
    // hand column scrolled x = 0 and the target stayed off-screen (MJT
    // 2026-09-24, "Literature Cited ... did not shift horizontally").
    it("jumps scroll sideways only when the target is out of view", () => {
        const iw = { scrollX: 100, innerWidth: 820, document: { documentElement: { clientWidth: 800 } } };
        assert.equal(wv._wvDomScrollX(iw, { left: 50, right: 300, width: 250 }), 100, "in view: keep x");
        assert.equal(wv._wvDomScrollX(iw, { left: 900, right: 1100, width: 200 }), 976, "right of the view: bring it in");
        assert.equal(wv._wvDomScrollX(iw, { left: -50, right: 100, width: 150 }), 26, "left of the view: bring it in");
        assert.equal(wv._wvDomScrollX(iw, { left: 10, right: 2000, width: 1990 }), 100, "wider than the view, starts in it: keep");
        assert.equal(wv._wvDomScrollX(iw, null), 100, "no rect: keep");
    });

    it("the region editor's highlight covers its range at 50 % zoom", () => {
        const { host, d, range, pv } = mkView();
        const orig = wv._wvReaderPanelNote;
        wv._wvReaderPanelNote = function () {};
        try {
            const rr = range.getClientRects()[0];
            if (!rr || !rr.height) return;
            const reader = { _internalReader: { _primaryView: pv }, _iframeWindow: { document: d } };
            wv._wvDomRegionEditorOpen(reader, d, range, { editorId: "zoom-spec", noteWord: "title", onCommit: () => {} });
            const hl = [...d.body.children].find((e) => /b9dbff|185, 219, 255/i.test(e.style.backgroundColor));
            assert.isOk(hl, "editor highlight drawn");
            const b = hl.getBoundingClientRect();
            const now = range.getClientRects()[0];   // the editor scrolls its region into view
            assert.closeTo(b.top, now.top, 2, "editor highlight on the text");
            pv._wvRegionEditor && pv._wvRegionEditor.destroy();
        }
        finally { wv._wvReaderPanelNote = orig; host.remove(); }
    });
});
