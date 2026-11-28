/* global describe, it, before, assert */

// Weavero's extracted outline, rules 14 and 15 (outline2.8; MJT 2026-11-24),
// and two fixes from the 2.7 test-base review. Packs rebuilt as plain data:
// - 4C3CTP2L (Blech 1983, J. Lubrication Technology, an ASME scan): run-in
//   headings -- a bold lead-in ending in a period, then the paragraph's text --
//   one level under the section before them; the bold first runs that are not
//   headings (a running header, a copyright line, the download stamp on every
//   page, a nomenclature symbol, figure text) stay out;
// - FDAZTHDH (Dixit et al. 2026, PRL, born-digital): one heading block (the
//   title); the sections are run-in with an em dash ("Phenomenology--We
//   first..."); the PDF's own bookmarks list them under a wrapper entry that is
//   the paper's title. With the bookmarks: they are Extracted, the wrapper out
//   (rule 15). Without: the run-in rule alone finds them.
// - RT3K8ERU / MCK3RHVX / T5BHREQR (APS): OCR's "c." between B. and D. is C.;
//   an unlabeled sub-heading stays under its Roman section; a., b. start again
//   under each numbered entry.

describe("Weavero — Weavero's extracted outline, rules 14 and 15 (outline2.8)", function () {
    let wv;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    const BODY = " the text of the paragraph goes on well past forty characters, as a real paragraph does.";
    /** `n` blocks over `pages` pages: headings {i: [page, text]}, paragraphs {i: [page, text, lead, style, y, x1, x2]}. */
    function blocks(n, pages, heads, paras) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const h = heads[i], p = paras[i];
            if (h) out.push({ i, type: "heading", text: h[1], pageRects: [[h[0], 72, 500, 300, 509]] });
            else if (p) {
                const y = p[4] || 400, x1 = p[5] || 72, x2 = p[6] || 300;
                out.push({ i, type: "paragraph", text: p[1], pageRects: [[p[0], x1, y - 40, x2, y]], lead: p[2] || "", leadStyle: p[3] || "", line: [p[0], x1, y - 9, x2, y] });
            }
            else out.push({ i, type: "paragraph", text: "Body text " + i + BODY, pageRects: [[Math.min(pages - 1, Math.floor(i * pages / n)), 72, 300, 300, 340]] });
        }
        return out;
    }
    const g = (title, ref, children) => ({ title, ref: [ref], children: children || [] });
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d]); w(n.items, d + 1); } }; w(tree, 0); return o; };
    const BLECH = { title: "On Isothermal Squeeze Films", creators: [{ lastName: "Blech", firstName: "J. J." }] };
    function blech() {
        const H = { 0: [0, "J. J. Blech"], 2: [0, "On Isothermal Squeeze Films"], 4: [0, "Introduction"], 12: [0, "Analytical Formulation"],
            108: [2, "The Complete Solution"], 146: [4, "Discussion"], 156: [5, "References"], 158: [5, "APPENDIX"] };
        const run = (page, lead) => [page, lead + BODY, lead, "b"];
        const P = {
            55: run(1, "Rectangular Plates In Parallel Motion."), 82: run(2, "Circular Plates in Parallel Motion."),
            85: run(2, "Annular Plates in Parallel Motion."), 94: run(2, "Annular Plates in a Tilting Mode."),
            103: run(2, "Circular Plate Sectors in Parallel Motion."), 114: run(3, "Parallel Motion of Rectangular Plates."),
            134: run(4, "Circular Plates In Parallel Motion."),
            22: [0, "Copyright © 1983 by ASME", "Copyright © 1983 by ASME", "b"],
            64: [1, "P = = plate aspect ratio and the rest of the nomenclature entry, long enough.", "P =", "bi"],
            72: [2, "1000-", "1000-", "b"],
            95: [2, "500200100CUT OFF SQUEEZE NUMBER, <7C Griffin (Parallel and Tilting) Present paper 0-2 0-4 0 6 0 8 10 RADII", "500200100CUT OFF SQUEEZE NUMBER, <7C Griffin (Parallel and Tilting)", "b"],
        };
        // The running header and the download stamp, on every page.
        const furniture = [[21, 0], [30, 1], [60, 2], [110, 3], [140, 4], [160, 5]];
        for (const [i, p] of furniture) P[i] = [p, "Journal of Lubrication Technology OCTOBER 1983, Vol. 105/" + (615 + p), "Journal of Lubrication Technology", "b", 760];
        for (const [i, p] of [[23, 0], [67, 1], [111, 2], [127, 3], [154, 4], [169, 5]]) {
            P[i] = [p, "Downloaded From: http://tribology.asmedigitalcollection.asme.org/ on 09/19/2013 Terms of Use: http://asme.org/", "Downloaded From: http://tribology.asmedigitalcollection.asme.org/ on 09/19/2013 Terms of Use:", "b", 20];
        }
        return { H, P };
    }

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOutlineBuild");
    });

    it("4C3CTP2L: the bold run-in headings one level under their section; the other bold first runs stay out", function () {
        const { H, P } = blech();
        const cat = [g("J. J. Blech", 0), g("On Isothermal Squeeze Films", 2), g("Introduction", 4), g("Analytical Formulation", 12),
            g("The Complete Solution", 108), g("Discussion", 146), g("References", 156), g("APPENDIX", 158)];
        const t = wv._wvOutlineBuild(cat, blocks(170, 6, H, P), pagesOf(6), BLECH);
        assert.deepEqual(flat(t), [
            ["Introduction", 0], ["Analytical Formulation", 0],
            ["Rectangular Plates In Parallel Motion", 1], ["Circular Plates in Parallel Motion", 1], ["Annular Plates in Parallel Motion", 1],
            ["Annular Plates in a Tilting Mode", 1], ["Circular Plate Sectors in Parallel Motion", 1],
            ["The Complete Solution", 0], ["Parallel Motion of Rectangular Plates", 1], ["Circular Plates In Parallel Motion", 1],
            ["Discussion", 0], ["References", 0], ["APPENDIX", 0],
        ]);
        const rect = t[1].items[0].position;
        assert.deepEqual(rect, { pageIndex: 1, rects: [[72, 391, 300, 400]] }, "on the paragraph's first line");
    });

    it("run-ins never in a book, never an environment or float label, never the item's author, never a margin term, never a label repeated three times", function () {
        const lead = (page, t, y) => [page, t + BODY, t, "b", y];
        const cat = [g("Introduction", 2), g("Methods", 20)];
        const H = { 2: [0, "Introduction"], 20: [1, "Methods"] };
        const P = {
            5: lead(0, "Proof."), 6: lead(0, "Figure 4."), 7: lead(0, "Theorem 2.1 (Main result)."),
            8: lead(0, "Jane Q. Smith:"),
            9: [0, "Film drop: a drop made of a bubble film" + BODY, "Film drop:", "b", 400, 520, 600],      // a narrow side column
            22: lead(1, "Key contributions."), 24: lead(1, "Key contributions."), 26: lead(1, "Key contributions."),
            28: lead(1, "Sample preparation."),
        };
        const meta = { title: "A paper", creators: [{ lastName: "Smith", firstName: "Jane Q." }] };
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(40, 3, H, P), pagesOf(3), meta)),
            [["Introduction", 0], ["Methods", 0], ["Sample preparation", 1]]);
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(40, 3, H, P), pagesOf(80), meta)),
            [["Introduction", 0], ["Methods", 0]], "a document of more than 60 pages: none");
    });

    const DIXIT = { title: "Holes in Sheets: Double-Threshold Rupture of Draining Liquid Films", creators: [{ lastName: "Dixit", firstName: "Harish N." }] };
    function dixit() {
        const H = { 0: [0, "Holes in Sheets: Double-Threshold Rupture of Draining Liquid"] };
        const P = {
            17: [1, "Phenomenology—We first examine sheet-centered bubbles across the (Oh, Bo) space."],
            18: [1, "Relevant timescales set the healing to opening transition —After the bubble’s and sheet’s interfaces merge and"],
            24: [2, "What happens in the limiting case of no external driving (Bo = 0)?—In the absence of radial forcing the sheet"],
            27: [2, "Effect of off-center bubbles—Thus far, we considered sheet-centered bubbles with simultaneous holes."],
            42: [4, "Conclusion and outlook—We have shown that a micron-thick draining sheet pierced by a trapped bubble"],
            44: [4, "capillary-wave replenishment, viscous damping, and radial drainage—physics that awaits a predictive scaling theory"],
            45: [4, "Acknowledgments—We acknowledge the funding from the MIST Consortium with Project No. P20-35."],
            46: [4, "Data availability—The data that support the findings of this article are openly available [27]."],
        };
        return { H, P };
    }
    const RUNINS = ["Phenomenology", "Relevant timescales set the healing to opening transition",
        "What happens in the limiting case of no external driving (Bo = 0)?", "Effect of off-center bubbles",
        "Conclusion and outlook", "Acknowledgments", "Data availability"];

    it("FDAZTHDH without bookmarks: the em-dash run-ins are its sections, at the top level", function () {
        const { H, P } = dixit();
        const t = wv._wvOutlineBuild([], blocks(56, 7, H, P), pagesOf(7), DIXIT);
        assert.deepEqual(flat(t), RUNINS.map(x => [x, 0]));
    });

    it("FDAZTHDH with its bookmarks (rule 15): they are Extracted, the wrapper that is the paper's title removed -- with or without the item's metadata", function () {
        const { H, P } = dixit();
        const nat = (title, p, children) => ({ title, source: "native", target: { position: { pageIndex: p, rect: [50, 700, 50, 700] } }, children: children || [] });
        const titles = ["Phenomenology", "Relevant timescales set the healing to opening transition",
            "What happens in the limiting case of no external driving (Bo=0)?", "Effect of off-center bubbles",
            "Conclusion and outlook", "Acknowledgments", "Data availability", "References"];
        const pg = [1, 1, 2, 2, 4, 4, 4, 4];
        const own = [nat(DIXIT.title, 0, titles.map((x, k) => nat(x, pg[k])))];
        for (const meta of [DIXIT, {}]) {
            const t = wv._wvOutlineBuild(own, blocks(56, 7, H, P), pagesOf(7), meta);
            assert.deepEqual(flat(t), titles.map(x => [x, 0]), JSON.stringify(meta));
            assert.deepEqual(t[0].position, { pageIndex: 1, rects: [[50, 700, 50, 700]] }, "at the bookmark's destination");
        }
        // Bookmarks all labelled alike (S426KUSL) are not used.
        const same = [nat(DIXIT.title, 0, titles.map((x, k) => nat(DIXIT.title, pg[k])))];
        assert.deepEqual(flat(wv._wvOutlineBuild(same, blocks(56, 7, H, P), pagesOf(7), DIXIT)), RUNINS.map(x => [x, 0]),
            "unusable bookmarks: the run-in rule");
    });

    it("Roman documents: OCR's lower-case “c.” between B. and D. is C.; an unlabeled sub-heading stays under its section; a., b. start again under each numbered entry", function () {
        const titles = ["I. INTRODUCTION", "II. FORMULATION", "Numerical scheme for time-dependent simulations", "III. RESULTS",
            "A. Drop impact", "B. Birth of the vortex", "c. The onset of instability", "D. Relaminarization",
            "IV. APPENDIX", "1. Outer field", "a. Flow outside a 3D cluster", "b. Flow outside a 2D cluster", "2. Inner field", "a. Evolution of a 3D cluster"];
        const cat = titles.map((x, k) => g(x, 2 + k * 3));
        cat[1].children = [cat.splice(2, 1)[0]];
        const H = {};
        titles.forEach((x, k) => { H[2 + k * 3] = [Math.floor(k / 2), x]; });
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(50, 8, H, {}), pagesOf(8), {})), [
            ["I. INTRODUCTION", 0], ["II. FORMULATION", 0], ["Numerical scheme for time-dependent simulations", 1], ["III. RESULTS", 0],
            ["A. Drop impact", 1], ["B. Birth of the vortex", 1], ["C. The onset of instability", 1], ["D. Relaminarization", 1],
            ["IV. APPENDIX", 0], ["1. Outer field", 1], ["a. Flow outside a 3D cluster", 2], ["b. Flow outside a 2D cluster", 2],
            ["2. Inner field", 1], ["a. Evolution of a 3D cluster", 2],
        ]);
    });
});
