/* global describe, it, before, assert, Zotero */

// Weavero's extracted outline, rules 7 and 8 (outline2.6; MJT 2026-11-24, from
// YUM6RVCJ of his library: Prosperetti & Oguz 1993, "The Impact of Drops on
// Liquid Surfaces and the Underwater Noise of Rain", Annu. Rev. Fluid Mech., a
// scan). Its pack, rebuilt here as plain data: eleven heading blocks, all
// capitals at one size (6.74 pt boxes) except "ACOUSTICS OF IMPACT" (8.08,
// OCR'd taller), which Zotero's generator therefore nests under "THEORETICAL
// ASPECTS" (a new style on its stack); and the PDF's own bookmarks, which are
// only web links ("Annual Reviews Online"...), appended by Zotero to the outline
// it generates. Expected: every section at the top level, ACOUSTICS OF IMPACT
// between THEORETICAL ASPECTS and ALLIED PHENOMENA, no web link in Extracted --
// while Zotero's source keeps the links. The guards around rule 7: a smaller
// box, another letter case, a label, or one sibling that does not qualify keep
// Zotero's nesting.

describe("Weavero — Weavero's extracted outline, rules 7 and 8 (outline2.6)", function () {
    let wv, lib;
    const PAGES = Array.from({ length: 26 }, () => ({ viewRect: [0, 0, 612, 792] }));
    const META = {
        title: "The Impact of Drops on Liquid Surfaces and the Underwater Noise of Rain",
        creators: [{ lastName: "Prosperetti", firstName: "A." }, { lastName: "Oguz", firstName: "H. N." }],
    };
    // [block index, page, box height, text]: YUM6RVCJ's heading blocks as Zotero stores them.
    const HEADS = [
        [2, 0, 62.27, "THE IMPACT OF DROPS ON LIQUID SURFACES AND THE UNDERWATER NOISE OF RAIN"],
        [6, 0, 6.74, "INTRODUCTION"], [37, 4, 6.74, "THE RAIN NOISE PARADOX ..."], [46, 5, 6.74, ". . . AND ITS RESOLUTION"],
        [64, 8, 6.74, "HIGHER-ENERGY IMPACTS"], [94, 12, 6.74, "NUMERICAL SIMULATIONS"], [119, 15, 6.74, "THEORETICAL ASPECTS"],
        [148, 18, 8.08, "ACOUSTICS OF IMPACT"], [172, 20, 6.74, "ALLIED PHENOMENA"], [189, 22, 6.74, "CONCLUSIONS"],
        [196, 23, 5.36, "ACKNOWLEDGMENTS"], [199, 23, 7.54, "Literature Cited"],
    ];
    /** 211 blocks, the headings at their indexes; `over` replaces [page, height, text] by index;
     *  `only`: the heading blocks kept (the others are paragraphs). */
    function blocks(over, only) {
        const H = {};
        for (const [i, p, h, t] of HEADS) if (!only || only.has(i)) H[i] = [p, h, t];
        Object.assign(H, over || {});
        const out = [];
        for (let i = 0; i < 211; i++) {
            const h = H[i];
            if (h) out.push({ i, type: "heading", text: h[2], pageRects: [[h[0], 90, 500, 380, 500 + h[1]]] });
            else out.push({ i, type: "paragraph", text: "Body text " + i + " of the review, long enough to be a paragraph of it.", pageRects: [[Math.min(25, Math.floor(i / 8)), 90, 300, 520, 360]] });
        }
        return out;
    }
    const web = (title, url, children) => ({ title, source: "native", target: { url }, children: children || [] });
    const LINKS = [
        web("Annual Reviews Online", "http://arjournals.annualreviews.org/action/showJournals"),
        web("Search Annual Reviews", "http://arjournals.annualreviews.org/search/advanced"),
        web("Annual Review of Fluid Mechanics Online", "http://arjournals.annualreviews.org/loi/fluid", [
            web("Most Downloaded Fluid Mechanics Reviews", "http://arjournals.annualreviews.org/action/showMostReadArticles"),
            web("Most Cited Fluid Mechanics Reviews", "http://arjournals.annualreviews.org/action/showMostCitedArticles"),
            web("Annual Review of Fluid Mechanics Errata", "http://arjournals.annualreviews.org/errata/fluid"),
            web("View Current Editorial Committee", "http://www.annualreviews.org/people/peopleedcom.aspx?series=fluid"),
        ]),
    ];
    const g = (title, ref, children) => ({ title, ref: [ref], children: children || [] });
    /** @type {any[]} */
    const CATALOG = [
        g("INTRODUCTION", 6), g("THE RAIN NOISE PARADOX ...", 37), g(". . . AND ITS RESOLUTION", 46), g("HIGHER-ENERGY IMPACTS", 64),
        g("NUMERICAL SIMULATIONS", 94), g("THEORETICAL ASPECTS", 119, [g("ACOUSTICS OF IMPACT", 148)]), g("ALLIED PHENOMENA", 172),
        g("CONCLUSIONS", 189), g("ACKNOWLEDGMENTS", 196), g("Literature Cited", 199),
        ...LINKS,
    ];
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d]); w(n.items, d + 1); } }; w(tree, 0); return o; };
    const refsOf = (cat, out = new Set()) => { for (const e of cat) { if (e.ref) out.add(e.ref[0]); refsOf(e.children || [], out); } return out; };
    /** The full pack for YUM6RVCJ's catalog; for a smaller one, only its own heading blocks. */
    const build = (cat, over) => wv._wvOutlineBuild(cat, blocks(over, cat === CATALOG ? null : refsOf(cat)), PAGES, META);

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOutlineBuild");
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        assert.ok(lib && typeof lib.wvOutlineFromSdt === "function", "Zotero.Weavero.lib.wvOutlineFromSdt");
    });

    it("YUM6RVCJ: ACOUSTICS OF IMPACT at the top level between THEORETICAL ASPECTS and ALLIED PHENOMENA; no web links", function () {
        assert.deepEqual(flat(build(CATALOG)), [
            ["INTRODUCTION", 0], ["THE RAIN NOISE PARADOX ...", 0], [". . . AND ITS RESOLUTION", 0], ["HIGHER-ENERGY IMPACTS", 0],
            ["NUMERICAL SIMULATIONS", 0], ["THEORETICAL ASPECTS", 0], ["ACOUSTICS OF IMPACT", 0], ["ALLIED PHENOMENA", 0],
            ["CONCLUSIONS", 0], ["ACKNOWLEDGMENTS", 0], ["Literature Cited", 0],
        ]);
        const t = build(CATALOG);
        assert.equal(t[6].title, "ACOUSTICS OF IMPACT");
        assert.equal(t[6].position.pageIndex, 18, "on its heading's page");
        assert.deepEqual(t[6].position.rects[0].slice(0, 3), [90, 500, 380], "on its heading's box");
    });

    it("rule 8 at any depth: a web link under a section goes, the section stays", function () {
        const cat = [g("INTRODUCTION", 6, [web("Supplemental Material", "http://example.org/sm")]), g("CONCLUSIONS", 189)];
        assert.deepEqual(flat(build(cat)), [["INTRODUCTION", 0], ["CONCLUSIONS", 0]]);
    });

    it("rule 8 leaves Zotero's source alone: the links are still there, where Zotero put them", async function () {
        const rd = {
            getCatalog: async () => ({ outline: CATALOG, pages: PAGES }),
            getTopLevelBlockCount: () => 211,
            getBlocks: async (a, b) => blocks().slice(a, b + 1).map(x => ({ type: x.type, anchor: { pageRects: x.pageRects }, content: [{ text: x.text }] })),
        };
        const d = await lib.wvOutlineFromSdt(rd, META);
        const z = flat(d.zotero);
        for (const l of ["Annual Reviews Online", "Search Annual Reviews", "Annual Review of Fluid Mechanics Online", "Most Cited Fluid Mechanics Reviews"]) {
            assert.isTrue(z.some(e => e[0] === l), l + " in Zotero's source");
        }
        assert.deepEqual(z.find(e => e[0] === "ACOUSTICS OF IMPACT"), ["ACOUSTICS OF IMPACT", 1], "nested, as Zotero nests it");
        assert.isFalse(flat(d.extracted).some(e => /Annual Review/.test(e[0])), "none in Extracted");
        assert.deepEqual(flat(d.extracted).find(e => e[0] === "ACOUSTICS OF IMPACT"), ["ACOUSTICS OF IMPACT", 0]);
    });

    it("rule 7 keeps a real sub-heading: a smaller box", function () {
        const t = build(CATALOG, { 148: [18, 5.4, "ACOUSTICS OF IMPACT"] });
        assert.deepEqual(flat(t).find(e => e[0] === "ACOUSTICS OF IMPACT"), ["ACOUSTICS OF IMPACT", 1]);
    });

    it("rule 7 keeps a real sub-heading: another letter case", function () {
        const cat = CATALOG.map(e => e.title === "THEORETICAL ASPECTS" ? g("THEORETICAL ASPECTS", 119, [g("Acoustics of impact", 148)]) : e);
        const t = build(cat, { 148: [18, 8.08, "Acoustics of impact"] });
        assert.deepEqual(flat(t).find(e => e[0] === "Acoustics of impact"), ["Acoustics of impact", 1]);
    });

    it("rule 7 moves all the children or none: one that does not qualify keeps its siblings where they are", function () {
        const cat = [g("THEORETICAL ASPECTS", 119, [g("ACOUSTICS OF IMPACT", 148), g("BUBBLE ENTRAINMENT", 150)]), g("ALLIED PHENOMENA", 172)];
        const both = build(cat, { 150: [18, 8.08, "BUBBLE ENTRAINMENT"] });
        assert.deepEqual(flat(both), [["THEORETICAL ASPECTS", 0], ["ACOUSTICS OF IMPACT", 0], ["BUBBLE ENTRAINMENT", 0], ["ALLIED PHENOMENA", 0]], "both qualify: both up");
        const one = build(cat, { 150: [18, 5.0, "BUBBLE ENTRAINMENT"] });
        assert.deepEqual(flat(one), [["THEORETICAL ASPECTS", 0], ["ACOUSTICS OF IMPACT", 1], ["BUBBLE ENTRAINMENT", 1], ["ALLIED PHENOMENA", 0]], "one smaller: neither moves (no sibling turned child)");
    });

    it("rule 7 keeps the nesting under a label: a number run into its word, a bracketed letter", function () {
        const cat = [g("4. Results", 119, [g("4.1.Qualitative Description", 120, [g("Passive Dye Visualisations", 121)])]), g("5. Discussion", 172)];
        const t = build(cat, { 119: [15, 8, "4. Results"], 120: [15, 7, "4.1.Qualitative Description"], 121: [15, 7, "Passive Dye Visualisations"] });
        assert.deepEqual(flat(t).find(e => e[0] === "Passive Dye Visualisations")[1], flat(t).find(e => e[0] === "4.1.Qualitative Description")[1] + 1,
            "under 4.1: " + JSON.stringify(flat(t)));
        const cat2 = [g("(iv) Rigid surfaces", 119, [g("(a) The case b = c = 1", 120)]), g("ALLIED PHENOMENA", 172)];
        const t2 = build(cat2, { 119: [15, 7, "(iv) Rigid surfaces"], 120: [15, 7, "(a) The case b = c = 1"] });
        assert.deepEqual(flat(t2).slice(0, 2), [["(iv) Rigid surfaces", 0], ["(a) The case b = c = 1", 1]]);
    });
});
