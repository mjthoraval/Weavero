/* global describe, it, before, after, assert, Zotero, wvT */

// A colour that comes from a library's data -- a tag's colour (a synced
// library setting any editor of a group can write) or an annotation's colour
// (Zotero's own check on it is unanchored: "#ffd400;anything" passes) -- is
// used as a colour and nothing else (security review 2026-11-22). It must be a
// hex colour, and it is set as a colour property (backgroundColor, fill), never
// in a `background` shorthand nor concatenated into a style string: either
// would let a crafted value load an image from anywhere.

describe("Weavero — colours from a library's data are colours only", function () {
    this.timeout(30000);
    let wv, att, ann;
    const IMG = "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==)";

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        att = await wvT.createTestPDFItem("wv-data-colors");
        ann = /** @type {any} */ (new Zotero.Item("annotation"));
        ann.libraryID = att.libraryID;
        ann.parentID = att.id;
        ann.annotationType = "highlight";
        ann.annotationText = "WV-TEST colour";
        ann.annotationColor = "#ffd400;fill:" + IMG;
        ann.annotationPageLabel = "1";
        ann.annotationSortIndex = "00000|000000|00000";
        ann.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 50, 20]] });
        await ann.saveTx();
    });

    after(async () => {
        try { await ann.eraseTx(); } catch (e) {}
        try { await att.eraseTx(); } catch (e) {}
    });

    it("wvDataColor keeps a hex colour and nothing else", () => {
        const lib = wvT.lib();
        assert.isOk(lib && typeof lib.wvDataColor === "function", "the helper is published for the suite");
        for (const c of ["#ffd400", "#FF6666", "#abc", "#ffd400cc"]) assert.strictEqual(lib.wvDataColor(c), c, c);
        for (const c of ["#ffd400;background:" + IMG, IMG, "red", "#ffd40", "#ffd400 ", " #ffd400", "", null, undefined, 42,
            "rgb(1,2,3)", "var(--x)", "#ffd400\n", "expression(1)"]) {
            assert.isNull(lib.wvDataColor(c), String(c));
        }
    });

    it("the filter's tag dot paints a colour, never an image (main window sheet)", async () => {
        const doc = wvT.win().document;
        const el = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        el.className = "wv-filter-opt wv-filter-tag-colored";
        el.textContent = "WV-TEST";
        el.style.position = "fixed";
        el.style.left = "-1000px";
        doc.documentElement.appendChild(el);
        try {
            el.style.setProperty("--wv-tag-color", "#ff0000");
            const win = doc.defaultView;
            assert.strictEqual(win.getComputedStyle(el, "::before").backgroundColor, "rgb(255, 0, 0)",
                "the rule is live in this window (a valid colour paints)");
            el.style.setProperty("--wv-tag-color", IMG);
            assert.strictEqual(win.getComputedStyle(el, "::before").backgroundImage, "none",
                "a value that is not a colour paints no image");
        }
        finally { el.remove(); }
    });

    it("a bookmark row's annotation icon gets the colour as a fill, never a style string", async () => {
        wvT.method("_bmRenderItemRow");
        const win = wvT.win();
        const doc = win.document;
        const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        const bm = { id: "wv-test-colour", type: "item", libraryID: ann.libraryID, itemKey: ann.key, label: "WV-TEST" };
        wv._bmRenderItemRow(doc, win, box, bm, 0);
        const img = box.querySelector("img");
        assert.isOk(img, "the row has its icon");
        const style = String(img.getAttribute("style") || "");
        assert.notInclude(style, "url(", "no image reaches the icon's style");
        assert.notInclude(style, "fill:#ffd400;", "the crafted value is not written as a style string");
        assert.notInclude(String(win.getComputedStyle(img).fill), "url(", "the computed fill is no paint server");
    });

    it("every sink takes the colour through the check, as a colour property (source contracts)", () => {
        const sinks = {
            _bmRenderLibChipBar: "bookmarks filter chip dot",
            _wvReaderRenderBmChipBar: "reader bookmarks chip dot",
            // The row's drawing, the dropdown's and the collections pane's (1.3.0-bmpane).
            _bmRowParts: "bookmark row icon",
            _wvReaderBuildBmIcon: "reader bookmark row icon",
            _renderUnifiedSearchSection: "items-list filter tag dot",
            _wvRenderReaderFilterPopup: "reader filter tag dot",
            _wvReaderShowBmHoverCard: "bookmark hover card bar",
        };
        for (const name of Object.keys(sinks)) {
            const src = wvT.src(name);
            assert.match(src, /wvDataColor|wvSetIconFill/, sinks[name] + ": the colour is checked");
            assert.notMatch(src, /\.style\.background\s*=\s*(info|t)\.color/, sinks[name] + ": no background shorthand");
            assert.notMatch(src, /fill:"\s*\+/, sinks[name] + ": no fill concatenated into a style string");
        }
    });
});
