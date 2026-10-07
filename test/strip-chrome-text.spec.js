/* global describe, it, before, assert, Zotero */

// Survey 2026-10-06: `_wvStripWindowChrome` (every disable and hot reload)
// removed WHOLE any element whose classes were all `wv-` and whose children
// were plain text -- the link / markdown spans -- taking the user's comment
// or label text with them; the focused-window restore pass in destroy()
// then found nothing to restore. The sweep now restores decorated text
// first, unwraps anything that has children, and removes only empty shells.

describe("Weavero — teardown keeps the text inside link / markdown spans", () => {
    let wv, sdoc;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvRestoreDecoratedText, "_wvRestoreDecoratedText");
        assert.isFunction(wv._wvStripWindowChrome, "_wvStripWindowChrome");
        sdoc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-strip");
    });

    it("the window sweep unwraps decorated spans and wrappers, and removes only empty wv- elements", () => {
        sdoc.body.innerHTML = '<div id="host">See '
            + '<span class="wv-url-span wv-link-http" data-href="https://x.y">https://x.y</span>'
            + ' and <span class="wv-md wv-md-bold">bold</span> text'
            + '<span class="wv-leaf"></span>'
            + '<div class="wv-shell"><span class="native-row" id="n1">row</span></div>'
            + '<span class="wv-bare">kept</span>'
            + '</div>';
        wv._wvStripWindowChrome({ document: sdoc });
        const host = sdoc.getElementById("host");
        assert.isOk(host);
        // The link keeps its text; the bold span's markers come back (tree
        // mode: no marker in the preceding text node); the empty leaf goes;
        // the shell and the bare span are unwrapped, their content stays.
        assert.equal(host.textContent, "See https://x.y and **bold** textrowkept");
        assert.isNull(sdoc.querySelector(".wv-url-span, .wv-md, .wv-leaf, .wv-shell, .wv-bare"), "no wv- element left");
        assert.isOk(sdoc.getElementById("n1"), "native content inside a wv- shell is unwrapped, not removed");
    });

    it("a markdown link in non-tree mode (brackets kept as text nodes) unwraps to its label", () => {
        sdoc.body.innerHTML = '<div id="h2">[<span class="wv-url-span wv-link-http" data-href="https://a.b">label</span>](https://a.b)</div>';
        wv._wvRestoreDecoratedText(sdoc);
        assert.equal(sdoc.getElementById("h2").textContent, "[label](https://a.b)");
    });
});
