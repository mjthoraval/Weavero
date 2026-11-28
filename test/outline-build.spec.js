/* global describe, it, before, assert, Zotero */

// Weavero's extracted outline (outline2 P2, first cut, 1.3.0-outline2.4;
// lib/outline-build.ts through the plugin's `_wvOutlineBuild`): Zotero's stored
// outline corrected with the pack's heading blocks and the parent item's
// metadata. The main case is IH8CQQBV of MJT's library, rebuilt here as plain
// data -- Baumeister & Simon 1973, a scan: Zotero's catalog.outline puts the
// authors at the top, the title's two lines under the second author and
// "Introduction" under the title, drops "part I--Surface Temperature
// Criteria", reads "Fart III", and nests "Conclusions" under Part IV. MJT: "It
// uses author names as headers", "missing Part I", "Conclusions should be a top
// level outline item". Expected: Introduction, Part I..IV, Conclusions,
// References, all top level, no bylines, no title lines.
// Then the default source and the chip's order (MJT 2026-11-24, "Ok for the
// proposed order"), and the renamed labels.

describe("Weavero — Weavero's extracted outline (outline2.4)", function () {
    let wv;
    const PAGES = Array.from({ length: 8 }, () => ({ viewRect: [0, 0, 612, 792] }));
    const META = {
        title: "Leidenfrost Temperature—Its Correlation for Liquid Metals, Cryogens, Hydrocarbons, and Water",
        creators: [{ lastName: "Baumeister", firstName: "K. J." }, { lastName: "Simon", firstName: "F. F." }],
    };
    /** Blocks 0..169 (paragraphs), with the headings of IH8CQQBV at their indexes. */
    function blocks(extra) {
        const H = Object.assign({
            0: ["K. J. BAUMEISTER", 0, 700], 2: ["F. F. SIMON", 0, 700],
            7: ["Leidenfrost Temperature--Its Correlation for Lipid Metals, Cryogens, Hydrocarbons,", 0, 640],
            8: ["and Water", 0, 620], 10: ["Introduction", 0, 500], 11: ["L", 0, 480],
            27: ["part I--Surface Temperature Criteria", 1, 600], 83: ["Part II--Liquid Metals", 3, 650],
            98: ["Fart III--Cryogens", 3, 300], 113: ["Part IV--Correlation of the Isothermal Leidenfrost Temperature", 4, 700],
            160: ["Conclusions", 6, 600], 163: ["References", 6, 300],
        }, extra || {});
        const out = [];
        for (let i = 0; i < 170; i++) {
            const h = H[i];
            if (h) out.push({ i, type: "heading", text: h[0], pageRects: [[h[1], 72, h[2], 400, h[2] + 12]] });
            else out.push({ i, type: "paragraph", text: "Body text " + i + " of the paper, long enough to be a paragraph.", pageRects: [[Math.min(7, Math.floor(i / 22)), 72, 300, 540, 340]] });
        }
        return out;
    }
    const CATALOG = [
        { title: "K. J. BAUMEISTER", ref: [0] },
        { title: "F. F. SIMON", ref: [2], children: [
            { title: "Leidenfrost Temperature--Its Correlation for Lipid Metals, Cryogens, Hydrocarbons,", ref: [7] },
            { title: "and Water", ref: [8], children: [{ title: "Introduction", ref: [10] }] },
        ] },
        { title: "Part II--Liquid Metals", ref: [83] },
        { title: "Fart III--Cryogens", ref: [98] },
        { title: "Part IV--Correlation of the Isothermal Leidenfrost Temperature", ref: [113], children: [{ title: "Conclusions", ref: [160] }] },
        { title: "References", ref: [163] },
    ];
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d]); w(n.items, d + 1); } }; w(tree, 0); return o; };

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOutlineBuild");
    });

    it("IH8CQQBV: no bylines, no title lines, Part I restored, Part III's OCR fixed, every section at the top level", function () {
        const t = wv._wvOutlineBuild(CATALOG, blocks(), PAGES, META);
        assert.deepEqual(flat(t), [
            ["Introduction", 0],
            ["Part I--Surface Temperature Criteria", 0],
            ["Part II--Liquid Metals", 0],
            ["Part III--Cryogens", 0],
            ["Part IV--Correlation of the Isothermal Leidenfrost Temperature", 0],
            ["Conclusions", 0],
            ["References", 0],
        ]);
    });

    it("positions are Zotero's heading boxes, the restored entry's too", function () {
        const t = wv._wvOutlineBuild(CATALOG, blocks(), PAGES, META);
        const p1 = t.find(n => n.title.startsWith("Part I--"));
        assert.deepEqual(p1.position, { pageIndex: 1, rects: [[72, 600, 400, 612]] });
        assert.deepEqual(t[0].position, { pageIndex: 0, rects: [[72, 500, 400, 512]] }, "Introduction");
    });

    it("bylines come from the item's creators: without them the same lines stay", function () {
        const t = wv._wvOutlineBuild(CATALOG, blocks(), PAGES, { title: META.title, creators: [] });
        assert.deepEqual(flat(t).slice(0, 2), [["K. J. BAUMEISTER", 0], ["F. F. SIMON", 0]]);
    });

    it("title lines come from the item's title: without it they stay (sections still never under them when numbered or section words)", function () {
        const t = wv._wvOutlineBuild(CATALOG, blocks(), PAGES, { title: "", creators: META.creators });
        const f = flat(t);
        // (Its two lines one entry since outline2.13's rule 20: "... Hydrocarbons," / "and Water".)
        assert.include(f.map(e => e[0]), "Leidenfrost Temperature--Its Correlation for Lipid Metals, Cryogens, Hydrocarbons, and Water");
        assert.deepEqual(f.find(e => e[0] === "Introduction"), ["Introduction", 0], "a section word is top level whatever its nesting");
    });

    it("one-character headings are left out", function () {
        const cat = [{ title: "L", ref: [11] }].concat(CATALOG.slice(2));
        assert.notInclude(flat(wv._wvOutlineBuild(cat, blocks(), PAGES, META)).map(e => e[0]), "L");
    });

    it("a numbered section word stays a sub-section; levels never skip", function () {
        const B = [
            { i: 0, type: "heading", text: "4 Results", pageRects: [[2, 72, 600, 200, 612]] },
            { i: 1, type: "heading", text: "4.3 Conclusions", pageRects: [[2, 72, 400, 200, 412]] },
            { i: 2, type: "heading", text: "4.3.1.2 Deep", pageRects: [[2, 72, 300, 200, 312]] },
        ];
        const cat = [{ title: "4 Results", ref: [0], children: [{ title: "4.3 Conclusions", ref: [1] }, { title: "4.3.1.2 Deep", ref: [2] }] }];
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, B, PAGES, {})), [["4 Results", 0], ["4.3 Conclusions", 1], ["4.3.1.2 Deep", 2]]);
    });

    it("only Part/Chapter/Section + numeral or a section word is restored from the dropped headings", function () {
        const B = blocks({ 40: ["A stray heading", 2, 500], 41: ["Chapter 2 Results", 2, 300], 42: ["Acknowledgements", 7, 300] });
        const titles = flat(wv._wvOutlineBuild(CATALOG, B, PAGES, META)).map(e => e[0]);
        assert.notInclude(titles, "A stray heading");
        assert.include(titles, "Chapter 2 Results");
        assert.include(titles, "Acknowledgements");
        assert.isBelow(titles.indexOf("Chapter 2 Results"), titles.indexOf("Part II--Liquid Metals"), "in document order");
    });

    it("a PDF whose catalog is its own outline: built from the heading blocks -- numbering levels, running headers out", function () {
        const pages = Array.from({ length: 4 }, () => ({ viewRect: [0, 0, 612, 792] }));
        const B = [
            { i: 0, type: "heading", text: "Journal of Tests 12", pageRects: [[0, 72, 760, 300, 772]] },
            { i: 1, type: "heading", text: "1. Introduction", pageRects: [[0, 72, 600, 200, 614]] },
            { i: 2, type: "paragraph", text: "Body.", pageRects: [[0, 72, 300, 500, 590]] },
            { i: 3, type: "heading", text: "Journal of Tests 13", pageRects: [[1, 72, 760, 300, 772]] },
            { i: 4, type: "heading", text: "2. Methods", pageRects: [[1, 72, 600, 200, 614]] },
            { i: 5, type: "heading", text: "2.1 Set-up", pageRects: [[1, 72, 400, 200, 414]] },
            { i: 6, type: "heading", text: "Journal of Tests 14", pageRects: [[2, 72, 760, 300, 772]] },
            { i: 7, type: "heading", text: "References", pageRects: [[3, 72, 600, 200, 614]] },
        ];
        const own = [{ title: "Intro", source: "native", ref: [1], target: { position: { pageIndex: 0, rect: [72, 620, 72, 620] } } }];
        assert.deepEqual(flat(wv._wvOutlineBuild(own, B, pages, {})), [["1. Introduction", 0], ["2. Methods", 0], ["2.1 Set-up", 1], ["References", 0]]);
    });

    it("the default source and the chip's order: Edited > Extracted > Embedded > Zotero; the hidden pref swaps the middle two", async function () {
        wvT.method("_wvOutlineOriginalOrder");
        wvT.method("_wvOutlineAvailableSources");
        assert.deepEqual(wv._wvOutlineOriginalOrder(), ["extracted", "embedded", "zotero"]);
        const stub = { _wvOutlineCache: { source: "extracted", tree: [{ title: "x", items: [] }], order: ["extracted", "embedded", "zotero"] } };
        assert.deepEqual(wv._wvOutlineAvailableSources(stub, "extracted"), ["extracted", "embedded", "zotero"]);
        await wvT.withPref("weavero.outlineDefaultSource", "embedded", async () => {
            assert.deepEqual(wv._wvOutlineOriginalOrder(), ["embedded", "extracted", "zotero"]);
        });
        assert.deepEqual(wv._wvOutlineOriginalOrder(), ["extracted", "embedded", "zotero"], "back to the default");
        // Reading Mode on: its own outline comes right after Extracted.
        const rmStub = { _wvOutlineCache: stub._wvOutlineCache };
        wv._wvReadingModeActive = () => true;
        wv._wvOutlineRmEntries = () => [{ title: "rm", indentLevel: 0 }];
        try {
            assert.deepEqual(wv._wvOutlineAvailableSources(rmStub, "extracted"), ["extracted", "readingMode", "embedded", "zotero"]);
            const noEx = { _wvOutlineCache: { source: "embedded", tree: [{ title: "x", items: [] }], order: ["embedded", "zotero"] } };
            assert.deepEqual(wv._wvOutlineAvailableSources(noEx, "readingMode"), ["readingMode", "embedded", "zotero"], "no Extracted: Reading Mode's first");
        }
        finally { delete wv._wvReadingModeActive; delete wv._wvOutlineRmEntries; }
    });

    it("labels: Extracted (Weavero's), Embedded, Zotero, Edited (the hand-edited outline, renamed from Weavero)", function () {
        wvT.method("_wvOutlineSourceLabel");
        assert.equal(wv._wvOutlineSourceLabel("extracted"), "Extracted");
        assert.equal(wv._wvOutlineSourceLabel("embedded"), "Embedded");
        assert.equal(wv._wvOutlineSourceLabel("zotero"), "Zotero");
        assert.equal(wv._wvOutlineSourceLabel("weavero"), "Edited");
        assert.include(wv._wvOutlineSourceTip("extracted"), "Weavero");
        assert.include(wv._wvOutlineSourceTip("zotero"), "Zotero");
    });
});
