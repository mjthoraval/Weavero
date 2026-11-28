/* global describe, it, before, assert, Zotero */

// outline2.14, rule 21 (MJT 2026-11-24, case 28: 9UZMEV2M, Akao et al. 1980,
// an OCR'd scan: "III. R esult s and Discussion", "2. H eat-transmitting
// Surface Areas Integrated over the R esidence T ime rrJ'cR 2dt and
// rrJ'cR2dt , 0 0•"): a space inside a word is closed when the document's own
// text writes the pieces as one word (a one- or two-letter piece, never a word
// of its own; the space no wider than 1.5 times the line's median space); a
// garbled formula at a title's end is cut off when what follows is not words.
// OCR's "1." for the first Roman section reads "I.".

describe("Weavero — outline2.14: spaces inside words, garbled formulas", function () {
    let lib;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    const flat = (tree, d = 0, o = []) => { for (const n of tree || []) { o.push([d, n.title]); flat(n.items, d + 1, o); } return o; };
    /** A text-map line for `text` at x1: each character 4 wide; the gap before the character after each space from `gaps` (in order). */
    const line = (x1, y, text, gaps) => {
        const items = [];
        let sp = false, k = 0, x = x1;
        for (const ch of text) { if (/\s/.test(ch)) { sp = true; continue; } const g = sp ? gaps[k++] : 0; items.push(sp ? [g, 4] : 4); x += g + 4; sp = false; }
        return [0, 1, x1, y, x, y + 10].concat(items);
    };
    const heading = (page, y, text, gaps) => ({ type: "heading", anchor: { pageRects: [[page, 72, y, 500, y + 10]] },
        content: [gaps ? { text, anchor: { textMap: JSON.stringify([line(72, y, text, gaps)]) } } : { text }] });
    const para = (page, text) => ({ type: "paragraph", anchor: { pageRects: [[page, 72, 300, 540, 340]] }, content: [{ text }] });
    const BODY = "The results show the heat transfer over the residence time of a droplet on a hot surface; the surface tension and the thin films matter.";
    const reader = (blocks, n) => ({ getCatalog: async () => ({ outline: [], pages: pagesOf(n) }), getTopLevelBlockCount: () => blocks.length, getBlocks: async (a, b) => blocks.slice(a, b + 1) });

    before(function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        if (!lib || typeof lib.wvOutlineFromSdt !== "function") wvT.absent("Zotero.Weavero.lib.wvOutlineFromSdt");
    });

    it("9UZMEV2M's form: 'R esult s' -> Results, 'H eat' -> Heat, the formula cut off, 'I.' for OCR's '1.', the sections under III", async function () {
        const blocks = [heading(0, 700, "1. Introduction"), para(0, BODY), heading(0, 400, "II. Experimental Procedures"), para(0, BODY),
            heading(1, 700, "III. R esult s and Discussion"), para(1, BODY),
            heading(1, 400, "2. H eat-transmitting Surface Areas Integrated over the R esidence T ime rrJ'cR 2dt and rrJ'cR2dt , 0 0•"), para(1, BODY),
            heading(2, 600, "3. Residence Time of Droplet upon Impingement onto Hot Metal Surface, 'c"), para(2, BODY),
            heading(3, 600, "IV. Conclusions"), para(3, BODY), para(4, BODY), para(5, BODY)];
        const d = await lib.wvOutlineFromSdt(reader(blocks, 6), { title: "Deformation behaviors of a liquid droplet impinging onto hot metal surface" });
        assert.deepEqual(flat(d.extracted), [[0, "I. Introduction"], [0, "II. Experimental Procedures"], [0, "III. Results and Discussion"],
            [1, "2. Heat-transmitting Surface Areas Integrated over the Residence Time"],
            [1, "3. Residence Time of Droplet upon Impingement onto Hot Metal Surface"], [0, "IV. Conclusions"]], JSON.stringify(flat(d.extracted)));
    });

    it("never joined: a word of its own, pieces the text never writes as one, initials, a gap far wider than the line's spaces; formulas that read as words stay", async function () {
        const T = ["Vitamin D in Children", "Type B Cells and T Lymphocytes", "Initials J. R. Smith Revisited", "Flow at Re = 1000 and Beyond",
            "Effects of CO2 in H2O Solutions"];
        const blocks = [];
        T.forEach((t, k) => { blocks.push(heading(k, 600, t), para(k, BODY)); });
        // "S urface" with a gap three times the line's other spaces: not joined, though "surface" is a word of the text.
        blocks.push(heading(5, 600, "Effects of S urface Tension on Thin Films", [3, 3, 9, 3, 3, 3, 3]), para(5, BODY));
        // The same with a narrow gap: joined.
        blocks.push(heading(6, 600, "Effects of the R esidence Time", [3, 3, 2, 3]), para(6, BODY));
        const d = await lib.wvOutlineFromSdt(reader(blocks, 8), {});
        const titles = flat(d.extracted).map((e) => e[1]);
        assert.deepEqual(titles, T.concat(["Effects of S urface Tension on Thin Films", "Effects of the Residence Time"]), JSON.stringify(titles));
    });
});
