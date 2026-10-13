/* global describe, it, before, assert, Zotero */

// Outline navigation, Back history (issue #28) for EPUB entries anchored by
// `href` (survey 2026-10-06, smaller bugs): the href branch lands the target
// in place (the 1/4-from-top rule) and returned BEFORE the history push the
// other branches share, so the Back button could not return from a TOC jump.

describe("Weavero — outline: an EPUB href jump records a Back point", function () {
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvOutlineNavigate", "_wvReaderPushHistoryPoint", "_wvDomQuarterPlace"]) wvT.method(m);
    });

    /** Run `fn` with plugin methods replaced, restoring them after. */
    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }

    it("the in-place landing pushes one history point first", () => {
        const doc = Zotero.getMainWindow().document;
        const view = { wvSpec: true };
        const reader = { _internalReader: { _primaryView: view }, _iframeWindow: null, _type: "epub" };
        const pushed = [], placed = [];
        withStubs({
            _wvReadingModeActive: () => false,
            _wvClearStalePin: () => {},
            _wvDomClearHighlight: () => {},
            _getEnableOutlineTextHighlight: () => false,
            _wvReaderPushHistoryPoint: (pv) => { pushed.push(pv); },
            _wvDomQuarterPlace: (pv, anchor) => { placed.push(anchor.href); return { wvRange: true }; },
        }, () => {
            wv._wvOutlineNavigate(reader, doc, { href: "chapter1.xhtml#s2", title: "Section 2" }, null);
        });
        assert.deepEqual(placed, ["chapter1.xhtml#s2"], "landed in place");
        assert.strictEqual(pushed.length, 1, "one Back point");
        assert.strictEqual(pushed[0], view, "for the view the jump happens in");
    });
});
