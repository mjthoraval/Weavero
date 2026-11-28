/* global describe, it, before, assert, Zotero */

// outline2.11 (MJT on 4C3CTP2L in 2.10: "Why is the whole line highlighted
// instead of just the outline text?"): a run-in entry sits on the box of its
// own text -- the bold lead-in's characters up to its period, or the
// characters before the em dash -- from the block's text map, one rect per
// line it covers; never the paragraph's whole first line.

describe("Weavero — outline2.11: run-in entries sit on their own text", function () {
    let lib;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    const flat = (tree) => { const o = []; const w = (l) => { for (const n of l || []) { o.push(n); w(n.items); } }; w(tree); return o; };
    /** A text-map line for `text` from x1 on baseline box [y, y + 9]: every non-space character 4 wide, 2 of gap after a space. */
    const line = (x1, y, text) => {
        const items = [];
        let sp = false, x = x1;
        for (const ch of text) { if (/\s/.test(ch)) { sp = true; continue; } items.push(sp ? [2, 4] : 4); x += (sp ? 2 : 0) + 4; sp = false; }
        return [0, 1, x1, y, x, y + 9].concat(items);
    };
    const run = (text, lines, style) => Object.assign({ text, anchor: { textMap: JSON.stringify(lines) } }, style ? { style } : {});
    const para = (page, y, runs) => ({ type: "paragraph", anchor: { pageRects: [[page, 266, y - 30, 504, y + 9]] }, content: runs });
    const heading = (page, y, text) => ({ type: "heading", anchor: { pageRects: [[page, 260, y, 360, y + 9]] }, content: [run(text, [line(260, y, text)])] });
    const body = (page) => ({ type: "paragraph", anchor: { pageRects: [[page, 72, 300, 540, 340]] }, content: [{ text: "Body text of the paper, long enough to be a paragraph of it, on page " + page + "." }] });
    const reader = (outline, blocks, pages) => ({ getCatalog: async () => ({ outline, pages }), getTopLevelBlockCount: () => blocks.length, getBlocks: async (a, b) => blocks.slice(a, b + 1) });
    const REST = "In this case the domain is rectangular, of dimensions axb. The squeeze number is defined by the ratio.";

    before(function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        if (!lib || typeof lib.wvOutlineFromSdt !== "function") wvT.absent("Zotero.Weavero.lib.wvOutlineFromSdt");
    });

    it("4C3CTP2L: the bold run-in's box ends at its period's right edge, not at the line's end; a wrapped one has a rect per line", async function () {
        const lead = "Rectangular Plates In Parallel Motion.";
        const wrapped = "Annular Plates in a Tilting Mode.";
        const blocks = [heading(0, 600, "Introduction"), body(0), heading(0, 400, "Analytical Formulation"), body(0),
            para(1, 400, [run(lead, [line(275, 399.5, lead)], { bold: true }), { text: " " }, run(REST, [line(421, 399.5, REST.slice(0, 20)), line(266, 387.5, REST.slice(20))])]),
            body(1),
            para(2, 100, [run(wrapped, [line(300, 99, "Annular Plates in a"), line(266, 87, "Tilting Mode.")], { bold: true }), { text: " " }, run(REST, [line(330, 87, REST)])]),
            body(2), body(3), body(4)];
        const cat = [{ title: "Introduction", ref: [0] }, { title: "Analytical Formulation", ref: [2] }];
        const d = await lib.wvOutlineFromSdt(reader(cat, blocks, pagesOf(6)), { title: "On Isothermal Squeeze Films" });
        const all = flat(d.extracted);
        const rect = all.find(n => n.title === "Rectangular Plates In Parallel Motion");
        assert.ok(rect, "the run-in: " + JSON.stringify(all.map(n => n.title)));
        // 34 characters 4 wide and 4 word gaps of 2 from x = 275: the period ends at 419; the line goes on to 504.
        assert.deepEqual(rect.position, { pageIndex: 1, rects: [[275, 399.5, 419, 408.5]] });
        const wrap = all.find(n => n.title === "Annular Plates in a Tilting Mode");
        assert.deepEqual(wrap.position, { pageIndex: 2, rects: [[300, 99, 370, 108], [266, 87, 316, 96]] }, "both parts, nothing after the period");
    });

    it("FDAZTHDH's form: the characters before the em dash", async function () {
        const p = (page, y, t) => para(page, y, [run(t, [line(72, y, t)])]);
        const blocks = [heading(0, 700, "Holes in Sheets: Double-Threshold Rupture of Draining Liquid Films"), body(0),
            p(1, 500, "Phenomenology—We first examine sheet-centered bubbles across the whole parameter space of the problem."),
            body(1),
            p(2, 400, "Effect of off-center bubbles—Thus far, we considered sheet-centered bubbles with simultaneous holes."),
            body(2), body(3)];
        const d = await lib.wvOutlineFromSdt(reader([], blocks, pagesOf(5)), { title: "Holes in Sheets: Double-Threshold Rupture of Draining Liquid Films" });
        const ph = flat(d.extracted).find(n => n.title === "Phenomenology");
        assert.deepEqual(ph.position, { pageIndex: 1, rects: [[72, 500, 124, 509]] }, "13 characters 4 wide from x = 72");
        const off = flat(d.extracted).find(n => n.title === "Effect of off-center bubbles");
        // "Effect of off-center bubbles": 25 characters, 3 word gaps.
        assert.deepEqual(off.position, { pageIndex: 2, rects: [[72, 400, 178, 409]] });
    });
});
