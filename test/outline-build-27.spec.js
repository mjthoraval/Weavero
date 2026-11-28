/* global describe, it, before, assert */

// Weavero's extracted outline, rules 9-13 (outline2.7; MJT 2026-11-24). The
// packs of MJT's library and of issue #41's corpus, rebuilt here as plain data:
// - ZHRASH52 (Medwin et al. 1992, J. Acoust. Soc. Am., a scan): Roman sections
//   with lettered subsections; OCR read "v.", "Vl." and "C.Average..."; two body
//   sentences came out as headings;
// - S426KUSL (Tsai et al. 2011, Soft Matter, born-digital): the same scheme in
//   mixed case, the PDF's own bookmarks all titled with the paper's title;
// - 5XHMXMSG (Wachters & Westerling 1966, Chem. Eng. Sci., a scan): "4.
//   Silvervessel" (a figure legend) between 2 and 3, a reference entry taken
//   for a heading;
// - issue #41: Sari & Piran 1995 (arXiv), "1. Introduction" only in a
//   paragraph; Doherty 2011 (a dissertation), chapters named in words, four of
//   them dropped by Zotero, a "Conclusion" in each.

describe("Weavero — Weavero's extracted outline, rules 9 to 13 (outline2.7)", function () {
    let wv;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    /** `n` blocks: headings {i: [page, height, text]}, paragraphs {i: [page, text]} (a box in the
     *  page's middle), the others body text spread over `pages` pages. */
    function blocks(n, pages, heads, paras) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const h = heads[i], p = paras && paras[i];
            if (h) out.push({ i, type: "heading", text: h[2], pageRects: [[h[0], 72, 500, 400, 500 + h[1]]] });
            else if (p) out.push({ i, type: "paragraph", text: p[1], pageRects: [[p[0], 72, p[2] || 400, 400, (p[2] || 400) + 10]] });
            else out.push({ i, type: "paragraph", text: "Body text " + i + " of the paper, long enough to be a paragraph of it.", pageRects: [[Math.min(pages - 1, Math.floor(i * pages / n)), 72, 300, 540, 340]] });
        }
        return out;
    }
    const g = (title, ref, children) => ({ title, ref: [ref], children: children || [] });
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d]); w(n.items, d + 1); } }; w(tree, 0); return o; };

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOutlineBuild");
    });

    it("ZHRASH52: Roman sections at the top, their lettered subsections under them, OCR'd labels repaired by the sequence, body sentences out", function () {
        const H = {
            0: [0, 16.76, "The anatomy of underwater rain noise"], 7: [0, 8.71, "INTRODUCTION"],
            31: [1, 11, "I. RAINFALLRATESAND DROPSIZE DISTRIBUTIONS"], 52: [2, 9.12, "II. EXPERIMENTAL DETAILS"],
            53: [2, 10.19, "A. Physical setup"], 57: [2, 10.45, "B. Data acquisition and signal processing"],
            74: [3, 10.19, "C. Calculation of spectrum levels due to rainfall"], 86: [4, 19.68, "III. SMALL RAINDROPS (0.8<D< 1.1 mm): IMPULSE AND BUBBLE"],
            90: [4, 20.72, "IV. MID-SIZE RAINDROPS (1.1 mm<D<2.2 mm): IMPULSE AND NO BUBBLE"], 93: [4, 8.32, "A. At normal incidence"],
            105: [5, 19.25, "v. LARGE RAINDROPS (D>2.2 mm): IMPULSE AND BUBBLES"], 106: [5, 10.06, "A. Sound production"],
            125: [6, 11.39, "B. Frequenciesof type II primarybubbles"], 131: [6, 11.8, "C.Averageenergyspectraldensitiesof drops"],
            141: [7, 10.59, "D. Effect of temperature"], 149: [7, 10.32, "E. Effect of salinity"],
            155: [8, 31.16, "Vl. PREDICTIONS OF UNDERWATER SOUND SPECTRA, AND INVERSION TO DETERMINE RAINFALL"],
            164: [8, 8.44, "VII. AIR-SEA GAS TRANSFER BY RAINFALL"], 175: [9, 12.07, "8.7and12.1m/sgive8and170cm3m- 2 s- •,respectively."],
            178: [9, 8.58, "VIII. CONCLUSIONS"], 181: [9, 11.13, "Mid-sizedropsradiateonlybroadbandimpactsound."], 187: [9, 8.44, "ACKNOWLEDGMENTS"],
        };
        const cat = Object.keys(H).map(Number).map(i => g(H[i][2], i));
        // Zotero nests C under B and VI under E (their boxes' new styles).
        const b = cat.findIndex(e => e.ref[0] === 125), e5 = cat.findIndex(e => e.ref[0] === 149);
        cat[e5].children = [cat.splice(e5 + 1, 1)[0]];
        cat[b].children = [cat.splice(b + 1, 1)[0]];
        const meta = { title: "The anatomy of underwater rain noise", creators: [{ lastName: "Medwin", firstName: "H." }, { lastName: "Nystuen", firstName: "J. A." }] };
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(195, 11, H), pagesOf(11), meta)), [
            ["INTRODUCTION", 0],
            ["I. RAINFALLRATESAND DROPSIZE DISTRIBUTIONS", 0],
            ["II. EXPERIMENTAL DETAILS", 0], ["A. Physical setup", 1], ["B. Data acquisition and signal processing", 1], ["C. Calculation of spectrum levels due to rainfall", 1],
            ["III. SMALL RAINDROPS (0.8<D< 1.1 mm): IMPULSE AND BUBBLE", 0],
            ["IV. MID-SIZE RAINDROPS (1.1 mm<D<2.2 mm): IMPULSE AND NO BUBBLE", 0], ["A. At normal incidence", 1],
            ["V. LARGE RAINDROPS (D>2.2 mm): IMPULSE AND BUBBLES", 0], ["A. Sound production", 1],
            ["B. Frequenciesof type II primarybubbles", 1], ["C. Averageenergyspectraldensitiesof drops", 1],
            ["D. Effect of temperature", 1], ["E. Effect of salinity", 1],
            ["VI. PREDICTIONS OF UNDERWATER SOUND SPECTRA, AND INVERSION TO DETERMINE RAINFALL", 0],
            ["VII. AIR-SEA GAS TRANSFER BY RAINFALL", 0], ["VIII. CONCLUSIONS", 0], ["ACKNOWLEDGMENTS", 0],
        ]);
    });

    it("S426KUSL: the same scheme in mixed case, from the heading blocks (the PDF's own bookmarks all carry the paper's title)", function () {
        const T = "Microscopic structure influencing macroscopic splash at high Weber numberElectronic supplementary information (ESI) available. See DOI: 10.1039/c1sm05801k";
        const nat = (p, children) => ({ title: T, source: "native", target: { position: { pageIndex: p, rect: [50, 700, 50, 700] } }, children: children || [] });
        const own = [nat(0, [nat(0), nat(1), nat(1, [nat(1), nat(4), nat(6)]), nat(7), nat(7)])];
        const H = {
            0: [0, 14.31, "Microscopic structure influencing macroscopic splash at high Weber number"], 5: [0, 9.84, "I. Introduction"],
            22: [1, 9.84, "II. Experimental"], 27: [1, 9.84, "III. Results and discussion"], 28: [1, 8.05, "A. Phenomenology and solid-liquid-air interfaces"],
            62: [4, 8.05, "B. The effect of microstructures"], 83: [6, 8.05, "C. The influence of air pressure"], 94: [7, 9.84, "IV. Conclusions"],
            96: [7, 9.85, "Acknowledgements"], 98: [7, 9.85, "References"],
        };
        const meta = { title: "Microscopic structure influencing macroscopic splash at high Weber number", creators: [{ lastName: "Tsai", firstName: "Peichun" }] };
        assert.deepEqual(flat(wv._wvOutlineBuild(own, blocks(109, 9, H), pagesOf(9), meta)), [
            ["I. Introduction", 0], ["II. Experimental", 0], ["III. Results and discussion", 0],
            ["A. Phenomenology and solid-liquid-air interfaces", 1], ["B. The effect of microstructures", 1], ["C. The influence of air pressure", 1],
            ["IV. Conclusions", 0], ["Acknowledgements", 0], ["References", 0],
        ]);
    });

    it("5XHMXMSG: an out-of-sequence entry in another letter case, and a reference entry, are left out", function () {
        const cat = [g("1. INTRODUCTION", 6), g("2. EXPERIMENTAL", 8), g("4. Silvervessel", 21),
            g("3. THEORY", 39, [g("Hydrodynamical behaviour of an impinging drop", 41), g("Estimation of the evaporation", 70)]),
            g("4. DISCUSSIONOF THE RESULTS", 94, [g("MARQUENIEL., Znstrum. Pratt. 1962 16 45.", 104)])];
        const H = { 6: [0, 9.6, "1. INTRODUCTION"], 8: [0, 9.6, "2. EXPERIMENTAL"], 21: [1, 9.6, "4. Silvervessel"], 39: [3, 10.08, "3. THEORY"],
            41: [3, 10.8, "Hydrodynamical behaviour of an impinging drop"], 70: [6, 10.8, "Estimation of the evaporation"],
            94: [8, 9.6, "4. DISCUSSIONOF THE RESULTS"], 104: [9, 9.9, "MARQUENIEL., Znstrum. Pratt. 1962 16 45."] };
        const meta = { title: "The heat transfer from a hot wall to impinging water drops in the spheroidal state", creators: [{ lastName: "Wachters" }, { lastName: "Westerling" }] };
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(109, 10, H), pagesOf(10), meta)), [
            ["1. INTRODUCTION", 0], ["2. EXPERIMENTAL", 0], ["3. THEORY", 0],
            ["Hydrodynamical behaviour of an impinging drop", 1], ["Estimation of the evaporation", 1], ["4. DISCUSSIONOF THE RESULTS", 0],
        ]);
    });

    it("one signal alone keeps an out-of-sequence entry, with a note", function () {
        const cat = [g("1. Introduction", 2), g("2. Methods", 10), g("4. Apparatus details", 20), g("3. Results", 30), g("4. Discussion", 40)];
        const H = {};
        for (const e of cat) H[e.ref[0]] = [Math.floor(e.ref[0] / 10), 10, e.title];
        const notes = [];
        const t = flat(wv._wvOutlineBuild(cat, blocks(50, 6, H), pagesOf(6), {}, notes));
        assert.deepEqual(t.map(e => e[0]), cat.map(e => e.title), "kept");
        assert.deepEqual(notes, ["kept out of its sequence: 4. Apparatus details"]);
    });

    it("issue #41, Sari & Piran (arXiv): a number missing from the sequence comes back from a paragraph", function () {
        const cat = [g("Abstract", 5), g("2. Planar Symmetry", 13), g("3. Spherical Considerations", 42), g("4. Observ ational Implications to GRB", 57), g("REFERENCES", 86)];
        const H = { 5: [0, 1, "Abstract"], 13: [1, 1, "2. Planar Symmetry"], 42: [5, 1, "3. Spherical Considerations"], 57: [7, 1, "4. Observ ational Implications to GRB"], 86: [11, 1, "REFERENCES"] };
        const P = { 8: [0, "1. In tro duction"], 52: [6, "1. > 1 - the Newtonian case: Rs < R < R < RN and shock reaches the inner edge"] };
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(94, 14, H, P), pagesOf(14), {})), [
            ["Abstract", 0], ["1. In tro duction", 0], ["2. Planar Symmetry", 0], ["3. Spherical Considerations", 0],
            ["4. Observ ational Implications to GRB", 0], ["REFERENCES", 0],
        ]);
    });

    it("issue #41, Doherty: chapters named in words come back (a label alone takes its title line), each chapter's Conclusion under it, the dissertation's own CONCLUSION at the top", function () {
        const cat = [g("INTRODUCTION “LITERATURE KNOWS NO FRONTIERS”", 64), g("CHAPTER ONE THE PEN CLUB 19211927", 413),
            g("CHAPTER THREE: HITLER ÉMIGRÉS 19331939", 1090), g("CHAPTER SEVEN AN INTERNATIONAL PEN 19621970", 2966),
            g("CONCLUSION “SPECIALIZED CELLS IN A SINGLE ORGANISM, MANKIND”", 3514)];
        const H = {
            64: [10, 35.08, cat[0].title], 413: [46, 56.19, cat[1].title], 768: [87, 10.76, "Conclusion"], 784: [90, 56.19, "CHAPTER TWO PEN INTERNATIONAL 19271933"],
            1080: [126, 10.76, "Conclusion"], 1090: [128, 56.19, cat[2].title], 1551: [175, 14.2, "CHAPTER FOUR"], 1552: [175, 37.24, "WAR AND THE REFUGEES 19381949"],
            1985: [213, 10.76, "Conclusion"], 2966: [308, 56.19, cat[3].title], 3470: [353, 8.82, "Conclusion"], 3514: [358, 12.23, cat[4].title], 3632: [370, 17.5, "BIBLIOGRAPHY"],
        };
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(3750, 394, H), pagesOf(394), {})), [
            ["INTRODUCTION “LITERATURE KNOWS NO FRONTIERS”", 0],
            ["CHAPTER ONE THE PEN CLUB 19211927", 0], ["Conclusion", 1],
            ["CHAPTER TWO PEN INTERNATIONAL 19271933", 0], ["Conclusion", 1],
            ["CHAPTER THREE: HITLER ÉMIGRÉS 19331939", 0],
            ["CHAPTER FOUR WAR AND THE REFUGEES 19381949", 0], ["Conclusion", 1],
            ["CHAPTER SEVEN AN INTERNATIONAL PEN 19621970", 0], ["Conclusion", 1],
            ["CONCLUSION “SPECIALIZED CELLS IN A SINGLE ORGANISM, MANKIND”", 0], ["BIBLIOGRAPHY", 0],
        ]);
    });

    it("body sentences out; headings with a final period or colon stay", function () {
        const titles = ["Introduction", "Two possibilities exist:", "Le traitement primaire.", "Trajectory Equation:",
            "Note on Nonzero Potentials:", "The velocity of sound in water containing air bubbles is very low.", "Acknowledgments.", "Conclusions."];
        const cat = titles.map((t, k) => g(t, 2 + k * 5));
        const H = {};
        cat.forEach((e, k) => { H[e.ref[0]] = [k, 10, e.title]; });
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks(50, 9, H), pagesOf(9), {})).map(e => e[0]),
            ["Introduction", "Le traitement primaire.", "Trajectory Equation:", "Note on Nonzero Potentials:", "Acknowledgments.", "Conclusions."]);
    });

    it("a references title only in a paragraph comes back -- never from a page's header band", function () {
        const cat = [g("1. Introduction", 2), g("2. Results", 20)];
        const H = { 2: [0, 10, "1. Introduction"], 20: [2, 10, "2. Results"] };
        const t = flat(wv._wvOutlineBuild(cat, blocks(40, 4, H, { 35: [3, "References", 400] }), pagesOf(4), {}));
        assert.deepEqual(t, [["1. Introduction", 0], ["2. Results", 0], ["References", 0]]);
        const band = flat(wv._wvOutlineBuild(cat, blocks(40, 4, H, { 35: [3, "References", 770] }), pagesOf(4), {}));
        assert.deepEqual(band, [["1. Introduction", 0], ["2. Results", 0]], "a running header is not the list's title");
    });
});
