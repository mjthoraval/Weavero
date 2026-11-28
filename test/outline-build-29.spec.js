/* global describe, it, before, assert */

// Weavero's extracted outline, rule 12 refined (outline2.9; from the 2.7
// test-base review): a line ending in a colon is a body sentence only when a
// verb says so -- "Two possibilities exist:" (Sari & Piran 1995), "Cette journée
// riche a permis d'aborder :" (Z9H8R8HS), "This chapter should be cited as:"
// (IPCC). A noun phrase before a colon is a heading: WT4R66P5's bold "Mise en
// œuvre de la méthodologie :" (French typography: a space before the colon,
// French verbs read), Z9H8R8HS's "Le soldat lowtech (...) :", Schlichting's
// "Boundary conditions of the first kind:". A line ending in a comma or a
// semicolon stays a fragment (an index line).

describe("Weavero — Weavero's extracted outline, colon-ended lines (outline2.9)", function () {
    let wv;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    const g = (title, ref) => ({ title, ref: [ref], children: [] });
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push(n.title); w(n.items, d + 1); } }; w(tree, 0); return o; };

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOutlineBuild");
    });

    it("a noun phrase before a colon stays; a sentence with a verb, or a comma-ended fragment, goes", function () {
        const keep = ["Introduction", "Mise en œuvre de la méthodologie :", "Expression littérale du rendement de cycle :",
            "Le soldat lowtech (Armasuisse et le collectif « le coup d’après ») :", "Boundary conditions of the first kind:",
            "Bank of observers (dedicated observers):"];
        const drop = ["Two possibilities exist:", "Cette journée riche a permis d’aborder :", "Comparons les deux procédés suivants :",
            "This chapter should be cited as:", "These investigations have shown:", "Biological carbon dioxide removal methods,"];
        const titles = [];
        for (let k = 0; k < Math.max(keep.length, drop.length); k++) { if (keep[k]) titles.push(keep[k]); if (drop[k]) titles.push(drop[k]); }
        const cat = titles.map((t, k) => g(t, 2 + k * 3));
        const blocks = [];
        for (let i = 0; i < 60; i++) {
            const e = cat.find(x => x.ref[0] === i);
            blocks.push(e ? { i, type: "heading", text: e.title, pageRects: [[Math.floor(i / 6), 72, 500, 300, 509]] }
                : { i, type: "paragraph", text: "Body text " + i + " of the document, long enough to be a paragraph of it.", pageRects: [[Math.floor(i / 6), 72, 300, 300, 340]] });
        }
        assert.deepEqual(flat(wv._wvOutlineBuild(cat, blocks, pagesOf(10), {})), titles.filter(t => keep.includes(t)));
    });
});
