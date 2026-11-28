/* global describe, it, before, assert, Zotero, wvT */
// The List-all-tabs panel's file-type chevron and filter-clear icons are real SVG (2026-11-25). The main window is
// an XHTML document: an innerHTML svg string there needs its xmlns -- without it the sanitizer flattens the
// elements and the icons vanish (seen in a branch build the same day) -- and with it the sanitizer logs a
// "Removed unsafe attribute" warning at every window start (CON-1). The icons are now built with createElementNS.
describe("Weavero — the tab list's chevron and clear icons are SVG", function () {
    const SVG = "http://www.w3.org/2000/svg";
    let doc;
    before(function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        doc = Zotero.getMainWindow().document;
    });

    it("the file-type chevron holds an SVG triangle", () => {
        const chev = doc.querySelector(".wv-tabs-menu-filetype-chev");
        assert.ok(chev, "the chevron is there");
        const svg = chev.firstElementChild;
        assert.ok(svg && svg.namespaceURI === SVG && svg.localName === "svg", "its child is an SVG <svg>");
        const path = svg.querySelector("path");
        assert.ok(path && path.namespaceURI === SVG && path.getAttribute("d"), "with its path");
    });

    it("the clear button holds an SVG circle and two lines", () => {
        const btn = doc.getElementById("wv-tabs-menu-clear-btn");
        assert.ok(btn, "the clear button is there");
        const svg = btn.firstElementChild;
        assert.ok(svg && svg.namespaceURI === SVG && svg.localName === "svg", "its child is an SVG <svg>");
        assert.strictEqual(svg.querySelectorAll("circle").length, 1, "one circle");
        assert.strictEqual(svg.querySelectorAll("line").length, 2, "two lines");
    });
});
