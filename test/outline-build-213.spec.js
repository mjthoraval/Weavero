/* global describe, it, before, assert, Zotero */

// outline2.13 (MJT 2026-11-24 on YX7EPSV9, Barenblatt: "the Extracted outline
// is worse than the Embedded one. Is it possible to prevent this from
// happening?"; QCTQJ9ZR, Burke et al.: "The extracted outline looks quite bad
// on this one"). Rule 19: GOOD bookmarks (in page order, covering the
// document, not all one label) are Extracted's skeleton at their own
// destinations; a file-name label takes the heading at its destination that
// says the same, else its words; Weavero's headings fill in each bookmark's
// pages only -- none in front or back matter, none repeating the bookmark's
// title or a piece of it. Rule 20: a heading line that goes on with the one
// above is joined to it. Lone connectors ("or") and a chapter's running header
// ("0. Introduction" at the top of two pages) are no entries. The chip:
// Extracted identical to Embedded shows Embedded; the safety net's
// Embedded-first line.

describe("Weavero — outline2.13: good bookmarks are Extracted's skeleton", function () {
    let lib, wv;
    const pagesOf = (n) => Array.from({ length: n }, () => ({ viewRect: [0, 0, 612, 792] }));
    const flat = (tree, d = 0, o = []) => { for (const n of tree || []) { o.push({ title: n.title, level: d, position: n.position }); flat(n.items, d + 1, o); } return o; };
    const heading = (page, y, text) => ({ type: "heading", anchor: { pageRects: [[page, 72, y, 400, y + 12]] }, content: [{ text }] });
    const body = (page) => ({ type: "paragraph", anchor: { pageRects: [[page, 72, 300, 540, 340]] }, content: [{ text: "Body text of the book, long enough to be a paragraph of it, written on this page of the document." }] });
    const reader = (outline, blocks, pages) => ({ getCatalog: async () => ({ outline, pages }), getTopLevelBlockCount: () => blocks.length, getBlocks: async (a, b) => blocks.slice(a, b + 1) });
    const bm = (title, pageIndex) => ({ title, source: "native", target: { position: { pageIndex } } });
    const TOP = [0, 792, 0, 792];
    /** An 80-page book: `at` maps a page to its headings ([y, text]); every page a paragraph too. */
    const book = (at) => {
        const b = [];
        for (let p = 0; p < 80; p++) { for (const [y, t] of at[p] || []) b.push(heading(p, y, t)); b.push(body(p)); }
        return b;
    };

    before(function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!lib || typeof lib.wvOutlineFromSdt !== "function") wvT.absent("Zotero.Weavero.lib.wvOutlineFromSdt");
    });

    // YX7EPSV9 (Barenblatt): the publisher's file-name bookmarks and the book's headings.
    const yx7Own = () => [bm("_Cover", 0), bm("01.0_pp_i_iv_Frontmatter", 1), bm("06.0_pp_1_27_Introduction", 10),
        bm("07.0_pp_28_63_Dimensions_dimensional_analysis_and_similarity", 30), bm("21.0_pp_383_386_Index", 70)];
    const yx7Blocks = () => book({
        1: [[700, "Cambridge Texts in Applied Mathematics"], [600, "EDITORIAL BOARD"]],
        10: [[650, "Introduction"], [500, "0.1 Dimensional analysis and physical similarity"]],
        12: [[760, "0. Introduction"]], 14: [[760, "0. Introduction"]],
        16: [[400, "0.2 Assumptions underlying dimensional analysis"]], 18: [[300, "or"]],
        30: [[650, "Dimensions, Dimensional Analysis and Similarity"], [500, "1.1 Dimensions"]],
        35: [[600, "1.2 Dimensional Analysis"]], 70: [[700, "Index"]],
    });
    const YX7_META = { title: "Scaling, self-similarity, and intermediate asymptotics" };

    it("YX7EPSV9's form: file-name bookmarks titled from their headings, sections inside, no front-matter noise, no running header, no lone 'or'", async function () {
        const own = yx7Own();
        const blocks = yx7Blocks();
        const d = await lib.wvOutlineFromSdt(reader(own, blocks, pagesOf(80)), YX7_META);
        const f = flat(d.extracted);
        assert.deepEqual(f.map((e) => [e.level, e.title]), [
            [0, "Cover"], [0, "Frontmatter"],
            [0, "Introduction"], [1, "0.1 Dimensional analysis and physical similarity"], [1, "0.2 Assumptions underlying dimensional analysis"],
            [0, "Dimensions, Dimensional Analysis and Similarity"], [1, "1.1 Dimensions"], [1, "1.2 Dimensional Analysis"],
            [0, "Index"]], JSON.stringify(f.map((e) => [e.level, e.title])) + " " + JSON.stringify(d.notes));
        // The chapter sits on its heading's box; a bookmark without one on its page's top.
        assert.deepEqual(f[5].position, { pageIndex: 30, rects: [[72, 650, 400, 662]] });
        assert.deepEqual(f[0].position, { pageIndex: 0, rects: [TOP] });
        // The PDF's own outline stays exactly the file's.
        assert.deepEqual(d.embedded.map((n) => n.title), own.map((b) => b.title));
        assert.ok(!d.embeddedFirst, "Extracted agrees with the bookmarks");
    });

    // Guards 8d941760: Zotero 10.0.8's worker stores no destination with the PDF's own entries,
    // only the block it found for each (`ref`); the bookmark's page is that block's. Before the fix
    // no bookmark had a page there (wvOlGoodBookmarks: fewer than two), so good bookmarks were no
    // skeleton and Extracted came from the headings alone ("Cambridge Texts in Applied
    // Mathematics" and "EDITORIAL BOARD" for Cover and Frontmatter).
    it("Zotero 10.0.8's shape: good bookmarks without a destination, only the block Zotero found for each, give the outline the destinations give", async function () {
        const own = yx7Own();
        const blocks = yx7Blocks();
        // The block Zotero found: the first one of the bookmark's page (its heading where the page opens with one).
        const firstOf = (p) => blocks.findIndex((b) => b.anchor.pageRects[0][0] === p);
        const z10 = own.map((b) => ({ title: b.title, source: "native", ref: [firstOf(b.target.position.pageIndex)] }));
        assert.ok(z10.every((b) => b.ref[0] >= 0 && !("target" in b)), "fixture: refs only " + JSON.stringify(z10));
        const withDest = await lib.wvOutlineFromSdt(reader(own, blocks, pagesOf(80)), YX7_META);
        const d = await lib.wvOutlineFromSdt(reader(z10, blocks, pagesOf(80)), YX7_META);
        const f = flat(d.extracted);
        const shape = (l) => l.map((e) => [e.level, e.title, e.position && e.position.pageIndex]);
        assert.deepEqual(shape(f), shape(flat(withDest.extracted)), "the same entries, levels and pages as with destinations: " + JSON.stringify(shape(f)) + " " + JSON.stringify(d.notes));
        assert.ok(d.notes.some((n) => /^bookmarks: 5 as the skeleton/.test(n)), "the bookmarks are the skeleton: " + JSON.stringify(d.notes));
        // The chapter on its heading's box, as with a destination; a bookmark without a heading of
        // its own on the block Zotero found, on its page.
        assert.deepEqual(f[5].position, { pageIndex: 30, rects: [[72, 650, 400, 662]] });
        assert.deepEqual(f.slice(0, 2).map((e) => [e.title, e.position.pageIndex]), [["Cover", 0], ["Frontmatter", 1]]);
        assert.deepEqual(d.embedded.map((n) => n.title), own.map((b) => b.title), "the PDF's own outline stays the file's");
        assert.ok(!d.embeddedFirst, "Extracted agrees with the bookmarks");
    });

    it("QCTQJ9ZR's form: chapter titles split over two lines are the bookmark's own; sections nested; nothing under Title page", async function () {
        const own = [bm("Title page", 0), bm("Contents", 2), bm("Chapter 1: A Brief History of Caffeine in Sport", 10),
            bm("Chapter 2: How Caffeine Works", 20), bm("Index", 60)];
        const blocks = book({
            0: [[700, "Human Kinetics"]], 2: [[700, "Contents"]],
            10: [[650, "A Brief History"], [630, "of Caffeine in Sport"]], 11: [[600, "History of Caffeine Use"]],
            20: [[650, "How Caffeine"], [630, "Works"]], 21: [[600, "Metabolism of Caffeine"]], 60: [[700, "Index"]],
        });
        const d = await lib.wvOutlineFromSdt(reader(own, blocks, pagesOf(80)), { title: "Caffeine for sports performance" });
        const f = flat(d.extracted);
        assert.deepEqual(f.map((e) => [e.level, e.title]), [
            [0, "Title page"], [0, "Contents"],
            [0, "Chapter 1: A Brief History of Caffeine in Sport"], [1, "History of Caffeine Use"],
            [0, "Chapter 2: How Caffeine Works"], [1, "Metabolism of Caffeine"],
            [0, "Index"]], JSON.stringify(f.map((e) => [e.level, e.title])) + " " + JSON.stringify(d.notes));
        assert.ok(d.notes.includes("joined heading lines: A Brief History of Caffeine in Sport"), JSON.stringify(d.notes));
    });

    it("rule 20 without bookmarks: 'Finding Caffeine' / 'in Our Diets' joined, both lines lit; not across a size change or a label", async function () {
        const blocks = [heading(0, 700, "Caffeine and the Athlete"), body(0),
            heading(1, 650, "Finding Caffeine"), heading(1, 630, "in Our Diets"), body(1),
            heading(2, 650, "Methods for"), { type: "heading", anchor: { pageRects: [[2, 72, 620, 400, 640]] }, content: [{ text: "the Analysis" }] }, body(2),
            heading(3, 650, "Effects of"), heading(3, 630, "2.1 Noise"), body(3), body(4), body(5)];
        const d = await lib.wvOutlineFromSdt(reader([], blocks, pagesOf(6)), {});
        const f = flat(d.extracted);
        const joined = f.find((e) => e.title === "Finding Caffeine in Our Diets");
        assert.ok(joined, JSON.stringify(f.map((e) => e.title)));
        assert.deepEqual(joined.position, { pageIndex: 1, rects: [[72, 650, 400, 662], [72, 630, 400, 642]] });
        for (const t of ["Methods for", "the Analysis", "Effects of", "2.1 Noise"]) assert.ok(f.some((e) => e.title === t), t + " stays apart: " + JSON.stringify(f.map((e) => e.title)));
    });

    it("bookmarks with nothing to fill in: Extracted is the PDF's own outline (the chip then shows Embedded, not an amber copy)", async function () {
        const own = [bm("Introduction", 0), bm("Methods", 3), bm("Results", 5), bm("References", 9)];
        const d = await lib.wvOutlineFromSdt(reader(own, book({}).filter((b) => b.anchor.pageRects[0][0] < 10), pagesOf(10)), {});
        assert.ok(lib.wvOlSameTree(d.extracted, d.embedded), JSON.stringify([d.extracted, d.embedded]));
    });

    it("the chip: Embedded's line says when it is identical to Extracted, or why it is shown first", function () {
        if (!wv) wvT.absent("plugin");
        const same = wv._wvOutlineSourceTip("embedded", true, false, { embeddedSame: true });
        assert.equal(same, "✓ Embedded: the outline saved inside the document file — Weavero’s extraction is identical for this PDF");
        const first = wv._wvOutlineSourceTip("embedded", false, false, { embeddedFirst: true });
        assert.equal(first, "Embedded: the outline saved inside the document file — shown first: Weavero’s extraction disagrees with it");
        assert.equal(wv._wvOutlineSourceTip("embedded", false, false), "Embedded: the outline saved inside the document file");
    });
});
