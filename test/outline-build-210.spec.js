/* global describe, it, before, assert, Zotero */

// outline2.10 (MJT's decisions, 2026-11-24 ~13:10), on plain-data packs:
// - rule 16: a reference list with no title before it gets a top-level
//   "References" entry (the UI's language) at its first entry -- 5XHMXMSG,
//   whose scan lost the REFERENCES heading: the list's first entry is the tail
//   of [2] taken for a heading, then a list block [3]...[6];
// - rule 17: the spaces the text layer lost come back in Extracted titles,
//   from the glyph gaps -- ZHRASH52's "RAINFALLRATESAND DROPSIZE", 5XHMXMSG's
//   "DISCUSSIONOF"; a kerned born-digital line ("observ|-1ation") stays whole;
// - "Name from headings": the PDF's own bookmarks all labelled alike take the
//   headings at their destinations (S426KUSL: every destination the page's
//   top, so each page's headings in reading order); when that is not possible
//   for the whole outline, Embedded is not offered.

describe("Weavero — outline2.10: References placeholder, lost spaces, bookmarks named from headings", function () {
    let wv, lib;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 595.276, 779.528] }));
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d]); w(n.items, d + 1); } }; w(tree, 0); return o; };
    /** A raw pack block: one run with a text map (one line: [0, 1, box, then the items]). */
    const raw = (type, page, y, runs) => ({ type, anchor: { pageRects: [[page, 44, y, 400, y + 10]] },
        content: runs.map(([text, items]) => items ? { text, anchor: { textMap: JSON.stringify([[0, 1, 44, y, 400, y + 10].concat(items)]) } } : { text }) });
    /** A stand-in pack reader over raw blocks. */
    const reader = (outline, blocks, pages) => ({
        getCatalog: async () => ({ outline, pages }),
        getTopLevelBlockCount: () => blocks.length,
        getBlocks: async (a, b) => blocks.slice(a, b + 1),
    });
    const body = (page) => raw("paragraph", page, 300, [["Body text of the paper, long enough to be a paragraph of it, on page " + page + "."]]);
    // "4. DISCUSSIONOF THE RESULTS": items per non-space character, a gap before O of -4.6, words spaced 4-6.
    const W = 6;
    const discussion = raw("heading", 8, 500, [["4. DISCUSSIONOF THE RESULTS", [W, W, [6, W], W, W, W, W, W, W, W, W, W, [-4.6, W], W, [4, W], W, W, [4, W], W, W, W, W, [-0.3, W], [-0.3, W]]]]);

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        assert.ok(lib && typeof lib.wvOutlineFromSdt === "function" && typeof lib.wvOlLostSpaces === "function", "the outline functions on Zotero.Weavero.lib");
    });

    it("rule 17: ZHRASH52's and 5XHMXMSG's lost spaces come back; a kerned word stays whole", function () {
        const zh = raw("heading", 1, 500, [["I. RAINFALLRATESAND DROPSIZE DISTRIBUTIONS",
            [3, 1.6, [3, 7], 7.3, 3, 7, 6, 7, 6, 6, [1, 7], 7, 6, 6.6, 6.6, [0.7, 7], 7, 5, [4, 7.3], 7, 8, 6.3, [0.6, 6.6], 2.7, 6, 4.4, [4, 7.3], 3, 6.3, 6, 7, 3, 7, 7, 6, 3, 7.5, 7, 6.7]]]);
        assert.deepEqual(lib.wvOlLostSpaces(zh).lost, [10, 15, 22], "before RATES, AND, SIZE");
        assert.deepEqual(lib.wvOlLostSpaces(discussion).lost, [12], "before OF; RESUL|T|S is noise");
        // "9. First steps in wildlife observation": born-digital, a kerning pair v|a at -1, word spaces 6-7.5.
        const kern = raw("heading", 3, 500, [["9. First steps in wildlife observation",
            [5, 2, [7.5, 5], 5, 5, 5, 5, [6, 5], 5, 5, 5, 5, [6, 5], 5, [6.5, 5], 5, 5, 5, 5, 5, 5, 5, [6, 5], 5, 5, 5, 5, 5, [-1, 5], 5, 5, 5, 5]]]);
        assert.deepEqual(lib.wvOlLostSpaces(kern).lost, [], "observation stays one word");
    });

    it("rules 16 and 17 on 5XHMXMSG's shape: “4. DISCUSSION OF THE RESULTS”, then a References entry at the list's first entry", async function () {
        const blocks = [];
        for (let p = 0; p < 9; p++) { blocks.push(body(p)); blocks.push(body(p)); }
        const at = blocks.length;
        blocks.push(discussion);
        blocks.push(body(8));
        blocks.push(raw("heading", 9, 536, [["MARQUENIEL., Znstrum. Pratt. 1962 16 45."]]));
        blocks.push({ type: "list", anchor: { pageRects: [[9, 52, 480, 492, 536]] }, content: [
            { type: "listitem", content: [{ text: "[3] WACHTERS L. H. J., De warmteoverdracht van een hete wand. Doctoral thesis, Delft, 1965." }] },
            { type: "listitem", content: [{ text: "[4] SAVIC P. and BOULT G. J., The fluid flow associated with the impact of liquid drops, 1957." }] },
            { type: "listitem", content: [{ text: "[5] SAVIC P., The cooling of a hot surface by drops boiling in contact with it, 1958." }] },
            { type: "listitem", content: [{ text: "[6] Lord RAYLEIGH, Proc. R. Soc. 1879 29 71." }] }] });
        const cat = [{ title: "1. INTRODUCTION", ref: [0] }, { title: "2. EXPERIMENTAL", ref: [2] }, { title: "3. THEORY", ref: [6] },
            { title: "4. DISCUSSIONOF THE RESULTS", ref: [at], children: [{ title: "MARQUENIEL., Znstrum. Pratt. 1962 16 45.", ref: [at + 2] }] }];
        for (const e of cat.slice(0, 3)) blocks[e.ref[0]] = raw("heading", Math.floor(e.ref[0] / 2), 500, [[e.title]]);
        const meta = { title: "The heat transfer from a hot wall to impinging water drops in the spheroidal state", creators: [{ lastName: "Wachters" }], labels: { references: "Références" } };
        const d = await lib.wvOutlineFromSdt(reader(cat, blocks, pagesOf(10)), meta);
        assert.deepEqual(flat(d.extracted), [["1. INTRODUCTION", 0], ["2. EXPERIMENTAL", 0], ["3. THEORY", 0], ["4. DISCUSSION OF THE RESULTS", 0], ["Références", 0]]);
        assert.equal(d.extracted[4].position.pageIndex, 9, "at the list's first entry");
        // A list already titled ("References and links") gets no second one; nor a book.
        const titled = cat.concat([{ title: "References and links", ref: [at + 1] }]);
        assert.notInclude(flat((await lib.wvOutlineFromSdt(reader(titled, blocks, pagesOf(10)), meta)).extracted).map(e => e[0]), "Références");
        assert.notInclude(flat((await lib.wvOutlineFromSdt(reader(cat, blocks, pagesOf(200)), meta)).extracted).map(e => e[0]), "Références");
    });

    it("a list that does not start at its first entry (footnotes “60.”, a column's “(23)”) gets no References entry", async function () {
        const blocks = [];
        for (let p = 0; p < 9; p++) { blocks.push(raw("heading", p, 500, [["Section " + (p + 1)]])); blocks.push(body(p)); }
        blocks.push({ type: "list", anchor: { pageRects: [[9, 52, 480, 492, 536]] }, content: [{ type: "listitem", content: [{ text:
            "(23) Kern, N.; Weaire, D. Philos. Mag. 2003, 83, 2973.(24) Hutzler, S. Phil. Mag. 2004, 84, 1.(25) Princen, H. M. J. Colloid 1983, 91, 160.(26) Mason, T. G. Phys. Rev. 1995, 75, 2051." }] }] });
        const cat = blocks.map((b, i) => b.type === "heading" ? { title: b.content[0].text, ref: [i] } : null).filter(Boolean);
        assert.notInclude(flat((await lib.wvOutlineFromSdt(reader(cat, blocks, pagesOf(10)), {})).extracted).map(e => e[0]), "References");
    });

    // S426KUSL: nine bookmarks, each titled with the paper, every destination the page's top-left corner.
    const T = "Microscopic structure influencing macroscopic splash at high Weber number";
    const nat = (p, children) => ({ title: T, source: "native", target: { position: { pageIndex: p, rect: [0, 779.528, 0, 779.528] } }, children: children || [] });
    const S426 = [nat(0, [nat(0), nat(1), nat(1, [nat(1), nat(4), nat(6)]), nat(7), nat(7)])];
    const headsOf = (list) => {
        const blocks = [];
        for (const [p, y, x, t] of list) { blocks.push(body(p)); const h = raw("heading", p, y, [[t]]); h.anchor.pageRects[0][1] = x; blocks.push(h); }
        return blocks;
    };

    it("Name from headings: S426KUSL's bookmarks take the headings of their pages in reading order", async function () {
        const blocks = headsOf([[0, 646, 44, T], [0, 342, 44, "I. Introduction"], [1, 425, 44, "II. Experimental"], [1, 535, 307, "III. Results and discussion"],
            [1, 518, 307, "A. Phenomenology and solid-liquid-air interfaces"], [4, 208, 307, "B. The effect of microstructures"],
            [6, 402, 307, "C. The influence of air pressure"], [7, 496, 307, "IV. Conclusions"], [7, 155, 307, "Acknowledgements"], [7, 77, 307, "References"]]);
        const d = await lib.wvOutlineFromSdt(reader(S426, blocks, pagesOf(9)), { title: T });
        assert.deepEqual(flat(d.embedded), [[T, 0], ["I. Introduction", 1], ["II. Experimental", 1], ["III. Results and discussion", 1],
            ["A. Phenomenology and solid-liquid-air interfaces", 2], ["B. The effect of microstructures", 2], ["C. The influence of air pressure", 2],
            ["IV. Conclusions", 1], ["Acknowledgements", 1]]);
        assert.equal(d.embedded[0].items[2].position.pageIndex, 1, "on the heading's page");
    });

    it("Name from headings: not possible for the whole outline -> Embedded is not offered; a file's own labels stay exactly as they are", async function () {
        // Seven bookmarks on one page that has two headings (HZ5ZRXZW's shape).
        const seven = [0, 1, 2, 3, 4, 5, 6].map(() => nat(4));
        const blocks = headsOf([[0, 600, 44, "1. Introduction"], [4, 500, 44, "3. Results"], [4, 300, 44, "4. Conclusions"]]);
        assert.deepEqual((await lib.wvOutlineFromSdt(reader(seven, blocks, pagesOf(8)), {})).embedded, []);
        const own = [{ title: "Introduction", source: "native", target: { position: { pageIndex: 0, rect: [0, 779.528, 0, 779.528] } }, children: [] },
            { title: "Results", source: "native", target: { position: { pageIndex: 4, rect: [0, 779.528, 0, 779.528] } }, children: [] }];
        assert.deepEqual(flat((await lib.wvOutlineFromSdt(reader(own, blocks, pagesOf(8)), {})).embedded), [["Introduction", 0], ["Results", 0]]);
    });
});
