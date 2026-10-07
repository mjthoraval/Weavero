/* global describe, it, before, assert, Zotero */

// Survey 2026-10-06: `_wvStripWindowChrome` (every disable and hot reload)
// removed WHOLE any element whose classes were all `wv-` and whose children
// were plain text -- the link / markdown spans -- taking the user's comment
// or label text with them; the focused-window restore pass in destroy()
// then found nothing to restore. The sweep now restores decorated text
// first; then an all-wv element is UNWRAPPED only when it wraps NATIVE
// content and REMOVED whole otherwise -- "unwrap anything with children"
// (the first fix) leaked the scope button's "▾" into the native search box
// and twisties into the tabs-menu list on every reload (thirteen chevrons
// in the search field, MJT 2026-10-07).

describe("Weavero — teardown keeps the text inside link / markdown spans", () => {
    let wv, sdoc;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvRestoreDecoratedText, "_wvRestoreDecoratedText");
        assert.isFunction(wv._wvStripWindowChrome, "_wvStripWindowChrome");
        sdoc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-strip");
    });

    it("the window sweep restores decorated spans, unwraps wrappers of native content, and removes Weavero's own UI whole", () => {
        sdoc.body.innerHTML = '<div id="host">See '
            + '<span class="wv-url-span wv-link-http" data-href="https://x.y">https://x.y</span>'
            + ' and <span class="wv-md wv-md-bold">bold</span> text'
            + '<span class="wv-leaf"></span>'
            + '<div class="wv-shell"><span class="native-row" id="n1">row</span></div>'
            + '<span class="wv-bare">UI label</span>'
            + '</div>';
        wv._wvStripWindowChrome({ document: sdoc });
        const host = sdoc.getElementById("host");
        assert.isOk(host);
        // The link keeps its text; the bold span's markers come back (tree
        // mode: no marker in the preceding text node); the empty leaf goes;
        // the shell is unwrapped (native row stays); the bare UI label --
        // Weavero's own, not the user's -- goes with its text.
        assert.equal(host.textContent, "See https://x.y and **bold** textrow");
        assert.isNull(sdoc.querySelector(".wv-url-span, .wv-md, .wv-leaf, .wv-shell, .wv-bare"), "no wv- element left");
        assert.isOk(sdoc.getElementById("n1"), "native content inside a wv- shell is unwrapped, not removed");
    });

    it("a reload never leaks UI glyphs into native containers (the scope button's chevron, the tabs-menu twisties)", () => {
        // Form elements are built with createElement: the chrome-document
        // innerHTML sanitizer silently drops <input> / <button>.
        sdoc.body.innerHTML = '<div id="search-wrapper"></div>'
            + '<div id="zotero-tabs-menu-list"><div class="row" id="r1">A tab</div></div>';
        const inp = sdoc.createElement("input"); inp.id = "native-input";
        sdoc.getElementById("search-wrapper").appendChild(inp);
        // Three reload cycles: inject, strip, re-inject, strip, re-inject, strip.
        const inject = () => {
            const b = sdoc.createElement("button"); b.className = "wv-qs-scope-btn";
            const a = sdoc.createElement("span"); a.className = "wv-qs-scope-btn-arrow"; a.textContent = "▾";
            b.appendChild(a); sdoc.getElementById("search-wrapper").appendChild(b);
            const h = sdoc.createElement("div"); h.className = "wv-tgrow-header";
            const tw = sdoc.createElement("span"); tw.className = "wv-tgrow-twisty"; tw.textContent = "▸";
            h.appendChild(tw); h.appendChild(sdoc.createTextNode("Group"));
            sdoc.getElementById("zotero-tabs-menu-list").appendChild(h);
        };
        inject();
        assert.include(sdoc.getElementById("search-wrapper").textContent, "▾", "fixture: the chevron is in place before the first strip");
        for (let i = 0; i < 3; i++) { wv._wvStripWindowChrome({ document: sdoc }); if (i < 2) inject(); }
        assert.equal(sdoc.getElementById("search-wrapper").textContent, "", "no chevron left behind in the native search box");
        assert.isOk(sdoc.getElementById("native-input"), "the native input stays");
        assert.equal(sdoc.getElementById("zotero-tabs-menu-list").textContent, "A tab", "no twisty or group label left in the native list");
        assert.isOk(sdoc.getElementById("r1"));
    });

    it("a markdown link in non-tree mode (brackets kept as text nodes) unwraps to its label", () => {
        sdoc.body.innerHTML = '<div id="h2">[<span class="wv-url-span wv-link-http" data-href="https://a.b">label</span>](https://a.b)</div>';
        wv._wvRestoreDecoratedText(sdoc);
        assert.equal(sdoc.getElementById("h2").textContent, "[label](https://a.b)");
    });
});
