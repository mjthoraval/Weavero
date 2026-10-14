/* global describe, it, before, assert, Zotero */

// Issue #56: SVG source in an annotation comment got a link badge, and its
// namespace rendered as a clickable link, from `xmlns="http://www.w3.org/2000/svg"`
// -- fenced or bare. A namespace declaration's value is not a link
// (lib/links.ts, shared by URL_REGEX and both comment renderers). These are
// the reporter's two inputs, through every surface's rule.

describe("Weavero — an xmlns namespace is not a link (#56)", function () {
    let wv, doc;
    const NS = "http://www.w3.org/1999/xhtml";
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">\n'
        + '  <rect x="10" y="10" width="80" height="80" fill="#fed7aa"/>\n</svg>';
    const fenced = "```svg\n" + svg + "\n```";
    const mixed = svg + "\nSee https://example.com/figure for the source.";

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_iconWantedFor");
        wvT.method("_buildCommentFragment");
        wvT.method("_renderInlineMarkdown");
        doc = wvT.win().document;
    });

    /** The links each renderer emits for `t`. */
    const popupLinks = (t) => {
        const panel = doc.createElementNS(NS, "div");
        const box = doc.createElementNS(NS, "div");
        box.appendChild(wv._renderInlineMarkdown(wv.normalize(t), doc, panel, new Set()));
        return Array.from(box.querySelectorAll("[href], [data-href]"), a => a.getAttribute("href") || a.getAttribute("data-href"));
    };
    const sidebarLinks = (t, useMd) => {
        const box = doc.createElementNS(NS, "div");
        box.appendChild(wv._buildCommentFragment(t, { doc, useMd, isTreeMode: false, lineBreaks: true }));
        return Array.from(box.querySelectorAll(".wv-url-span"), s => s.getAttribute("data-href"));
    };

    for (const inline of [true, false]) {
        it("no badge for bare or fenced SVG source -- " + (inline ? "Inline" : "Icon & Popup") + " mode", async () => {
            await wvT.withPref("weavero.inlineLinks", inline, () => {
                assert.isFalse(wv._iconWantedFor(svg), "bare");
                assert.isFalse(wv._iconWantedFor(fenced), "fenced");
                assert.isTrue(wv._iconWantedFor(mixed), "a real link next to it still gets the badge");
            });
        });
    }

    it("the popup renders no namespace link, and keeps the real one", () => {
        assert.deepEqual(popupLinks(svg), []);
        assert.deepEqual(popupLinks(fenced), []);
        assert.deepEqual(popupLinks(mixed), ["https://example.com/figure"]);
    });

    it("the sidebar / inline renderer, with and without Markdown, likewise", () => {
        for (const useMd of [false, true]) {
            assert.deepEqual(sidebarLinks(svg, useMd), [], "bare, useMd=" + useMd);
            assert.deepEqual(sidebarLinks(fenced, useMd), [], "fenced, useMd=" + useMd);
            assert.deepEqual(sidebarLinks(mixed, useMd), ["https://example.com/figure"], "mixed, useMd=" + useMd);
        }
    });
});
