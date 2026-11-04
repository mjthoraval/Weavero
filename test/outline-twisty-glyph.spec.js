/* global describe, it, before, assert, Zotero */

// The Outline tab's twisty is the reader's own chevron-8 -- the glyph of its
// outline toggle and its dropdowns (reader outline-view.js, custom-select.js)
// -- not a drawn triangle (MJT 2026-11-04). Rendered into a detached
// document: nothing on screen.

describe("Weavero — Outline tab twisty glyph", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvRenderOutlineEntries !== "function") wvT.absent('!wv || typeof wv._wvRenderOutlineEntries !== "function"');
    });

    it("draws the reader's chevron-8 on a parent, turned while collapsed", () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-outline-glyph");
        const reader = { _type: "pdf", _wvOutlineExpanded: new Set() };
        const entries = [{ title: "Parent", indentLevel: 0 }, { title: "Child", indentLevel: 1 }];
        wv._wvRenderOutlineEntries(reader, d, d.body, entries, false, null);
        const tw = d.querySelector(".wv-outline-twisty:not(.wv-outline-leaf)");
        assert.ok(tw, "a twisty on the parent");
        assert.match(tw.querySelector("svg path").getAttribute("d"), /^M0 2\.70711L4 6\.70711L8 2\.70711/, "chevron-8");
        assert.strictEqual(tw.querySelector("svg").getAttribute("viewBox"), "0 0 8 8");
        assert.ok(tw.classList.contains("wv-outline-collapsed"), "collapsed = the CSS turn");
    });
});
