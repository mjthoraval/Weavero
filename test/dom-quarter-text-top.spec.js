/* global describe, it, before, assert, Zotero */

// DOM-view jumps put the top of the TEXT at the quarter line (MJT
// 2026-09-24, Book EPUB screenshots): a contents entry resolves to its
// heading ELEMENT, whose box starts above the glyphs, and placing the box
// landed the heading ~33 px lower than a pin on the same heading. FAILS on
// the pre-fix code (the box top was placed, the text sat 60 px lower).

describe("Weavero — DOM jumps place the text, not the element box", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("an element with space above its text lands its text at the quarter", async () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        const orig = wv._wvDomRangeForAnchor;
        try {
            await Promise.race([
                new Promise((res) => host.addEventListener("load", res, { once: true })),
                new Promise((res) => setTimeout(res, 300)),
            ]);
            const iw = host.contentWindow;
            const d = iw.document;
            d.body.style.margin = "0";
            d.body.innerHTML = "<div style='height:1500px'></div>"
                + "<h2 id='h' style='margin:0;padding-top:60px;font:20px serif'>A Biographical Note</h2>"
                + "<div style='height:3000px'></div>";
            const rng = d.createRange();
            rng.selectNode(d.getElementById("h"));
            if (!rng.getClientRects().length || !iw.innerHeight) return;   // no layout: vacuous
            wv._wvDomRangeForAnchor = () => rng;
            const pv = { _iframeWindow: iw, _iframeDocument: d };
            assert.isOk(wv._wvDomQuarterPlace(pv, {}), "placed");
            const text = d.createRange();
            text.selectNodeContents(d.getElementById("h"));
            const t = text.getClientRects()[0];
            assert.closeTo(t.top, iw.innerHeight * 0.25, 2, "the TEXT top is at the quarter line");
        }
        finally { wv._wvDomRangeForAnchor = orig; host.remove(); }
    });
});
