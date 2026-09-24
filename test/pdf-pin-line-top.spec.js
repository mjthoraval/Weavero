/* global describe, it, before, assert, Zotero */

// PDF pin jumps land the pin's TEXT LINE at the quarter line, like every
// text target (MJT 2026-09-24: "the position of the pin should follow the
// same as the position of the text"). A PDF pin is a zero-area point in the
// MIDDLE of its line (5-7 pt below the top, measured), and the jump used to
// put that point at the quarter -- half a line higher than a text entry.
// FAILS on the pre-fix code (the view stayed at the point's position).

describe("Weavero — PDF pin jumps place the pin's text line", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const fixture = async () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        await Promise.race([
            new Promise((res) => host.addEventListener("load", res, { once: true })),
            new Promise((res) => setTimeout(res, 300)),
        ]);
        const iw = host.contentWindow;
        const d = iw.document;
        const vc = d.createElement("div");
        vc.id = "viewerContainer";
        vc.setAttribute("style", "height:400px;overflow:auto;");
        vc.innerHTML = "<div style='height:5000px'></div>";
        d.body.appendChild(vc);
        let pageDataCalls = 0;
        // Page 0: offsetTop 1000, 800 pt tall at scale 1; one text line
        // whose char boxes span y 495..506 (PDF y grows upward).
        iw.PDFViewerApplication = {
            pdfViewer: { currentScale: 1, _pages: [{ div: { offsetTop: 1000 }, viewport: { scale: 1, viewBox: [0, 0, 600, 800] } }] },
            pdfDocument: {
                getPageData: () => { pageDataCalls++; return Promise.resolve({ chars: [{ rect: [90, 495, 200, 506] }] }); },
            },
        };
        const pv = { _iframeWindow: iw };
        return { host, vc, pv, calls: () => pageDataCalls };
    };
    const tick = () => new Promise((r) => setTimeout(r, 20));

    it("refines to the line top after the jump, then caches it", async () => {
        const { host, vc, pv, calls } = await fixture();
        try {
            const clientH = vc.clientHeight;
            if (!clientH) return;   // no layout here: vacuous
            const pin = [100, 500, 100, 500];   // mid-line point
            assert.isTrue(wv._wvOutlineScrollToRect(pv, 0, pin));
            assert.closeTo(vc.scrollTop, 1000 + (800 - 500) - clientH / 4, 1, "first: the point");
            await tick();
            assert.closeTo(vc.scrollTop, 1000 + (800 - 506) - clientH / 4, 1, "then: the LINE top at the quarter");
            vc.scrollTop = 0;
            wv._wvOutlineScrollToRect(pv, 0, pin);
            assert.closeTo(vc.scrollTop, 1000 + (800 - 506) - clientH / 4, 1, "a repeat jump uses the cached line top at once");
            assert.equal(calls(), 1, "page data fetched once");
        }
        finally { host.remove(); }
    });

    it("a text rect is placed by its own top, no lookup", async () => {
        const { host, vc, pv, calls } = await fixture();
        try {
            const clientH = vc.clientHeight;
            if (!clientH) return;
            wv._wvOutlineScrollToRect(pv, 0, [90, 495, 200, 506]);
            await tick();
            assert.closeTo(vc.scrollTop, 1000 + (800 - 506) - clientH / 4, 1);
            assert.equal(calls(), 0);
        }
        finally { host.remove(); }
    });

    it("a pin away from any text keeps its own point", async () => {
        const { host, vc, pv } = await fixture();
        try {
            const clientH = vc.clientHeight;
            if (!clientH) return;
            wv._wvOutlineScrollToRect(pv, 0, [500, 100, 500, 100]);   // far from the line
            await tick();
            assert.closeTo(vc.scrollTop, 1000 + (800 - 100) - clientH / 4, 1);
        }
        finally { host.remove(); }
    });
});
