/* global describe, it, before, assert, Zotero */

// outline2.12, rule 18 (MJT 2026-11-24: "Ok to rebuild the Contents-page
// chapters with the rule above"): a book's printed Contents page gives its
// chapters -- entries "title .... page" read with their full numbers, "CHAPTER
// 2" joined with its title line, printed pages mapped through the page labels
// (else a constant offset), kept only where the page shows the title, used
// only when >= 60 % of them land -- and replaces Extracted when it finds more
// of the book's chapters than Extracted does. Fixtures after EHBJ246M (Dalili,
// thesis: chapter titles split over two heading lines), K7IKEXJK / 9SDPZZV3
// (Extracted already has every chapter: unchanged), M23V7W4X (Schlichting:
// the Contents does not land, gate failed).

describe("Weavero — outline2.12: chapters from a book's Contents page", function () {
    let lib;
    const N = 80;
    // Page labels: i-iv, then 1, 2, ... from index 4.
    const ROMAN = ["i", "ii", "iii", "iv"];
    const pagesOf = (n) => Array.from({ length: n }, (_, k) => ({ viewRect: [0, 0, 612, 792], label: k < 4 ? ROMAN[k] : String(k - 3) }));
    const flat = (tree, d = 0, o = []) => { for (const n of tree || []) { o.push({ title: n.title, level: d, position: n.position }); flat(n.items, d + 1, o); } return o; };
    const heading = (page, y, text) => ({ type: "heading", anchor: { pageRects: [[page, 72, y, 400, y + 12]] }, content: [{ text }] });
    const body = (page) => ({ type: "paragraph", anchor: { pageRects: [[page, 72, 300, 540, 340]] }, content: [{ text: "Body text of the thesis, long enough to be a paragraph of it, written on this page of the document." }] });
    const list = (page, items) => ({ type: "list", anchor: { pageRects: [[page, 72, 200, 540, 700]] },
        content: items.map((t, k) => ({ type: "listitem", anchor: { pageRects: [[page, 72, 690 - 14 * k, 540, 700 - 14 * k]] }, content: [{ text: t }] })) });
    const reader = (outline, blocks, pages) => ({ getCatalog: async () => ({ outline, pages }), getTopLevelBlockCount: () => blocks.length, getBlocks: async (a, b) => blocks.slice(a, b + 1) });
    const DOTS = " ..............................";
    const CONTENTS = ["ABSTRACT" + DOTS + " ii", "CHAPTER 1", "INTRODUCTION" + DOTS + " 1", "1.1 Automotive Paint Application" + DOTS + " 1",
        "1.2 Droplet Coalescence" + DOTS + " 4", "CHAPTER 2", "FORMATION OF LIQUID SHEETS BY DEPOSITION OF DROPLETS ON A", "SURFACE" + DOTS + " 11",
        "2.1 Introduction" + DOTS + " 11", "2.2 Experimental System" + DOTS + " 12", "REFERENCES" + DOTS + " 20"];
    /** A thesis of 80 pages: its Contents on page index 2; the chapters' headings as `ch1` / `ch2` give them. */
    const thesis = (contents, ch1, ch2) => {
        const b = [heading(1, 700, "ABSTRACT"), body(1), heading(2, 740, "TABLE OF CONTENTS"), list(2, contents), body(3)];
        b.push(...ch1.map((t, k) => heading(4, 700 - 20 * k, t)), body(4));
        b.push(heading(7, 700, "1.2 Droplet Coalescence"), body(7));
        // (Chapter 2's title lines in two sizes: rule 20, 2.13, joins same-size ones.)
        b.push(...ch2.map((t, k) => k === 2 && ch2 === SPLIT2 ? { type: "heading", anchor: { pageRects: [[14, 72, 640, 400, 658]] }, content: [{ text: t }] } : heading(14, 700 - 20 * k, t)), body(14));
        b.push(heading(15, 700, "2.2 Experimental System"), body(15), heading(23, 700, "REFERENCES"), body(23));
        for (let p = 24; p < N; p++) b.push(body(p));
        return b;
    };
    // A Contents whose page numbers are wrong (all 60: no label, no constant offset brings them home).
    const NOWHERE = CONTENTS.map((t) => t.replace(/ (\d+)$/, " 60"));
    const SPLIT1 = ["CHAPTER 1", "INTRODUCTION", "1.1 Automotive Paint Application"];
    const SPLIT2 = ["CHAPTER 2", "FORMATION OF LIQUID SHEETS BY DEPOSITION OF", "DROPLETS ON A SURFACE", "2.1 Introduction"];

    before(function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        if (!lib || typeof lib.wvOutlineFromSdt !== "function") wvT.absent("Zotero.Weavero.lib.wvOutlineFromSdt");
    });

    it("EHBJ246M's form: chapter titles split over two heading lines -- the Contents gives each chapter whole, sections under it, on the heading's box", async function () {
        const blocks = thesis(CONTENTS, SPLIT1, SPLIT2);
        const d = await lib.wvOutlineFromSdt(reader([], blocks, pagesOf(N)), { title: "Liquid film formation by spray droplet impact" });
        const f = flat(d.extracted);
        assert.deepEqual(f.map((e) => [e.level, e.title]), [
            [0, "ABSTRACT"],
            [0, "CHAPTER 1 INTRODUCTION"], [1, "1.1 Automotive Paint Application"], [1, "1.2 Droplet Coalescence"],
            [0, "CHAPTER 2 FORMATION OF LIQUID SHEETS BY DEPOSITION OF DROPLETS ON A SURFACE"], [1, "2.1 Introduction"], [1, "2.2 Experimental System"],
            [0, "REFERENCES"]], JSON.stringify(f.map((e) => [e.level, e.title])) + " " + JSON.stringify(d.notes));
        // Printed page 11 = label "11" = page index 14; the entry sits on the heading that starts its title.
        assert.deepEqual(f[4].position, { pageIndex: 14, rects: [[72, 680, 400, 692]] });
        // Front matter numbered in Roman: through the page labels ("ii" = index 1).
        assert.equal(f[0].position.pageIndex, 1);
        // 11 lines, 8 entries (two "CHAPTER N" lines joined with their titles); Extracted has chapter 1 whole
        // ("INTRODUCTION"), not chapter 2 (its title split over two headings).
        assert.ok(d.notes.some((n) => /contents page 2: 8 of 8 entries kept \(page labels\); chapters: 2 of 2 kept, 1 in Extracted -> Contents/.test(n)), JSON.stringify(d.notes));
    });

    it("K7IKEXJK / 9SDPZZV3: Extracted already has every chapter with its title -- unchanged", async function () {
        const whole1 = ["CHAPTER 1 INTRODUCTION", "1.1 Automotive Paint Application"];
        const whole2 = ["CHAPTER 2 FORMATION OF LIQUID SHEETS BY DEPOSITION OF DROPLETS ON A SURFACE", "2.1 Introduction"];
        const d = await lib.wvOutlineFromSdt(reader([], thesis(CONTENTS, whole1, whole2), pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /chapters: 2 of 2 kept, 2 in Extracted -> Extracted/.test(n)), JSON.stringify(d.notes));
        // The same book without a Contents that lands (every page number 60): the same outline.
        const e = await lib.wvOutlineFromSdt(reader([], thesis(NOWHERE, whole1, whole2), pagesOf(N)), {});
        assert.deepEqual(flat(d.extracted), flat(e.extracted));
    });

    it("M23V7W4X: a Contents whose entries do not land (< 60 %) is not used", async function () {
        const d = await lib.wvOutlineFromSdt(reader([], thesis(NOWHERE, SPLIT1, SPLIT2), pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /contents page 2: [0-4] of 8 entries kept, under 60 %/.test(n)), JSON.stringify(d.notes));
        assert.ok(flat(d.extracted).some((e) => e.title === "FORMATION OF LIQUID SHEETS BY DEPOSITION OF"), "Extracted as the headings give it");
    });

    it("EZ97CKA6's guard: entries land but most chapters do not (titles split over three heading lines) -- Extracted stays", async function () {
        const three = ["CHAPTER 2", "FORMATION OF LIQUID", "SHEETS BY DEPOSITION OF DROPLETS ON A SURFACE", "2.1 Introduction"];
        const d = await lib.wvOutlineFromSdt(reader([], thesis(CONTENTS, SPLIT1, three), pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /7 of 8 entries kept \(page labels\); chapters: 1 of 2 kept, 1 in Extracted -> Extracted/.test(n)), JSON.stringify(d.notes));
        assert.ok(flat(d.extracted).some((e) => e.title === "FORMATION OF LIQUID"), "Extracted as the headings give it");
    });

    it("the PDF's own GOOD bookmarks win (2.13): no Contents page then; nor in a document of 60 pages or fewer", async function () {
        const bm = (title, pageIndex) => ({ title, source: "native", target: { position: { pageIndex } } });
        // In page order, from page 4 to 60 of 80: good (rule 19).
        const own = [bm("Chapter one", 4), bm("Chapter two", 14), bm("References", 23), bm("Appendix", 60)];
        const d = await lib.wvOutlineFromSdt(reader(own, thesis(CONTENTS, SPLIT1, SPLIT2), pagesOf(N)), {});
        assert.ok(!(d.notes || []).some((n) => /^contents page/.test(n)), JSON.stringify(d.notes));
        // Usable but not good (pages 4-14 of 80 only): the Contents may still apply.
        const part = await lib.wvOutlineFromSdt(reader([bm("Chapter one", 4), bm("Chapter two", 14)], thesis(CONTENTS, SPLIT1, SPLIT2), pagesOf(N)), {});
        assert.ok((part.notes || []).some((n) => /^contents page 2: 8 of 8 entries kept/.test(n)), JSON.stringify(part.notes));
        const short = thesis(CONTENTS, SPLIT1, SPLIT2).filter((b) => b.anchor.pageRects[0][0] < 60);
        const s = await lib.wvOutlineFromSdt(reader([], short, pagesOf(60)), {});
        assert.ok(!(s.notes || []).some((n) => /^contents page/.test(n)), JSON.stringify(s.notes));
    });

    // Guards 5624af8d (2.12, refinements from the test base). Each case fails on the code before it.
    const shapeOf = (d) => flat(d.extracted).map((e) => [e.level, e.title]);
    /** 80 pages: the Contents (a list) on page index 2 under its title block; `at` maps a page to its headings ([y, text, height]). */
    const volume = (contents, at, title) => {
        const b = [title || heading(2, 740, "TABLE OF CONTENTS"), list(2, contents), body(3)];
        for (let p = 4; p < N; p++) {
            for (const [y, t, h] of at[p] || []) b.push({ type: "heading", anchor: { pageRects: [[p, 72, y, 400, y + (h || 12)]] }, content: [{ text: t }] });
            b.push(body(p));
        }
        return b;
    };

    // Issue #41 (Doherty's thesis): the Contents title is a caption block. Before: no Contents read.
    it("issue #41: a \"TABLE OF CONTENTS\" title set as a caption block is still read", async function () {
        const asHeading = thesis(CONTENTS, SPLIT1, SPLIT2);
        const blocks = asHeading.map((b) => (b.type === "heading" && b.content[0].text === "TABLE OF CONTENTS" ? Object.assign({}, b, { type: "caption" }) : b));
        assert.equal(blocks.filter((b) => b.type === "caption").length, 1, "fixture: the title a caption");
        const d = await lib.wvOutlineFromSdt(reader([], blocks, pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /contents page 2: 8 of 8 entries kept \(page labels\); chapters: 2 of 2 kept, 1 in Extracted -> Contents/.test(n)), JSON.stringify(d.notes));
        const h = await lib.wvOutlineFromSdt(reader([], asHeading, pagesOf(N)), {});
        assert.deepEqual(flat(d.extracted), flat(h.extracted), "the outline a heading title gives");
    });

    // W65XGWST (an edited volume): unnumbered chapters, each with its sections 1.1, 1.2 ..., then
    // Appendix A and B. Before: the two appendices alone were "the numbered chapters" (2 of 2, both
    // in Extracted: the Contents not used), and a section under an unnumbered chapter was an
    // orphan, one level up.
    it("W65XGWST: unnumbered chapters with Appendix A and B -- the appendices are not the chapters; an unnumbered chapter keeps its sections", async function () {
        const VOL = ["MODELLING OF DROPLET IMPACT ON THIN LIQUID FILMS" + DOTS + " 1", "1.1 Introduction" + DOTS + " 1", "1.2 Crown Formation" + DOTS + " 4",
            "BREAKUP OF LIQUID SHEETS IN A SPRAY PAINTING BOOTH" + DOTS + " 11", "2.1 Introduction" + DOTS + " 11", "2.2 Sheet Stability" + DOTS + " 12"];
        const APP = ["APPENDIX A DERIVATION OF THE FILM EQUATIONS" + DOTS + " 20", "APPENDIX B EXPERIMENTAL DATA" + DOTS + " 22"];
        // Each chapter's title over two heading lines of two sizes: Extracted has none of them whole.
        const at = {
            4: [[700, "MODELLING OF DROPLET IMPACT ON THIN"], [660, "LIQUID FILMS", 18], [620, "1.1 Introduction"]], 7: [[700, "1.2 Crown Formation"]],
            14: [[700, "BREAKUP OF LIQUID SHEETS IN A SPRAY"], [660, "PAINTING BOOTH", 18], [620, "2.1 Introduction"]], 15: [[700, "2.2 Sheet Stability"]],
        };
        const CHAPTERS = [[0, "MODELLING OF DROPLET IMPACT ON THIN LIQUID FILMS"], [1, "1.1 Introduction"], [1, "1.2 Crown Formation"],
            [0, "BREAKUP OF LIQUID SHEETS IN A SPRAY PAINTING BOOTH"], [1, "2.1 Introduction"], [1, "2.2 Sheet Stability"]];
        const d = await lib.wvOutlineFromSdt(reader([], volume(VOL, at), pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /contents page 2: 6 of 6 entries kept \(page labels\); chapters: 2 of 2 kept, 0 in Extracted -> Contents/.test(n)), JSON.stringify(d.notes));
        assert.deepEqual(shapeOf(d), CHAPTERS, "the sections under their unnumbered chapter: " + JSON.stringify(shapeOf(d)));
        const withApp = Object.assign({}, at, { 23: [[700, "APPENDIX A DERIVATION OF THE FILM EQUATIONS"]], 25: [[700, "APPENDIX B EXPERIMENTAL DATA"]] });
        const a = await lib.wvOutlineFromSdt(reader([], volume(VOL.concat(APP), withApp), pagesOf(N)), {});
        assert.ok(a.notes.some((n) => /contents page 2: 8 of 8 entries kept \(page labels\); chapters: 4 of 4 kept, 2 in Extracted -> Contents/.test(n)), "the chapters: the unnumbered ones and the appendices " + JSON.stringify(a.notes));
        assert.deepEqual(shapeOf(a), CHAPTERS.concat([[0, "APPENDIX A DERIVATION OF THE FILM EQUATIONS"], [0, "APPENDIX B EXPERIMENTAL DATA"]]), JSON.stringify(shapeOf(a)));
    });

    // 8A6JDUIL / IZTMRPH2: Zotero's own outline nests a chapter's title under a bare "CHAPTER 3";
    // and a "CHAPTER 3 <title>" the Contents lists at a wrong page. Before: neither was Extracted's
    // chapter, so the Contents replaced an Extracted that had every chapter (and, in the second
    // book, lost chapter 3).
    it("8A6JDUIL / IZTMRPH2: a bare \"Chapter 3\" with its title nested under it is that chapter in Extracted; so is a \"Chapter N <title>\" the Contents also lists", async function () {
        // (Chapter titles that are no section word: Extracted lifts an "INTRODUCTION" to the top level.)
        const TH = ["CHAPTER 1", "DROPLETS AND FILMS" + DOTS + " 1", "1.1 Automotive Paint Application" + DOTS + " 1",
            "CHAPTER 2", "SPRAY FORMATION" + DOTS + " 11", "2.1 Atomization" + DOTS + " 11",
            "CHAPTER 3", "FORMATION OF LIQUID SHEETS" + DOTS + " 21", "3.1 Experimental System" + DOTS + " 21", "REFERENCES" + DOTS + " 40"];
        const at = {
            4: [[700, "CHAPTER 1"], [680, "DROPLETS AND FILMS"], [640, "1.1 Automotive Paint Application"]],
            14: [[700, "CHAPTER 2"], [680, "SPRAY FORMATION"], [640, "2.1 Atomization"]],
            24: [[700, "CHAPTER 3"], [680, "FORMATION OF LIQUID SHEETS"], [640, "3.1 Experimental System"]], 43: [[700, "REFERENCES"]],
        };
        const blocks = volume(TH, at);
        const ref = (p, t) => { const i = blocks.findIndex((b) => b.type === "heading" && b.anchor.pageRects[0][0] === p && b.content[0].text === t); assert.isAtLeast(i, 0, "fixture: " + t); return [i]; };
        const chap = (p, n, title, sec) => ({ title: "CHAPTER " + n, ref: ref(p, "CHAPTER " + n), children: [{ title, ref: ref(p, title), children: [{ title: sec, ref: ref(p, sec) }] }] });
        const cat = [chap(4, 1, "DROPLETS AND FILMS", "1.1 Automotive Paint Application"), chap(14, 2, "SPRAY FORMATION", "2.1 Atomization"),
            chap(24, 3, "FORMATION OF LIQUID SHEETS", "3.1 Experimental System"), { title: "REFERENCES", ref: ref(43, "REFERENCES") }];
        const d = await lib.wvOutlineFromSdt(reader(cat, blocks, pagesOf(N)), {});
        assert.ok(d.notes.some((n) => /contents page 2: 7 of 7 entries kept \(page labels\); chapters: 3 of 3 kept, 3 in Extracted -> Extracted/.test(n)), JSON.stringify(d.notes));
        assert.deepEqual(shapeOf(d), [[0, "CHAPTER 1"], [1, "DROPLETS AND FILMS"], [2, "1.1 Automotive Paint Application"], [0, "CHAPTER 2"], [1, "SPRAY FORMATION"], [2, "2.1 Atomization"],
            [0, "CHAPTER 3"], [1, "FORMATION OF LIQUID SHEETS"], [2, "3.1 Experimental System"], [0, "REFERENCES"]], JSON.stringify(shapeOf(d)));
        // The Contents gives chapter 3 at printed page 61 (index 64): it does not land. Extracted's
        // "CHAPTER 3 FORMATION OF LIQUID SHEETS" (page index 24) counts; chapter 2 is Extracted's in
        // two lines of two sizes only.
        const TH2 = TH.map((t) => t.replace(/^(SPRAY FORMATION)\b/, "BREAKUP OF LIQUID SHEETS IN A SPRAY PAINTING BOOTH").replace(/ 21$/, " 61"));
        const at2 = Object.assign({}, at, {
            14: [[700, "CHAPTER 2"], [680, "BREAKUP OF LIQUID SHEETS IN A SPRAY"], [650, "PAINTING BOOTH", 18], [610, "2.1 Atomization"]],
            24: [[700, "CHAPTER 3 FORMATION OF LIQUID SHEETS"], [640, "3.1 Experimental System"]],
        });
        const e = await lib.wvOutlineFromSdt(reader([], volume(TH2, at2), pagesOf(N)), {});
        assert.ok(e.notes.some((n) => /contents page 2: 5 of 7 entries kept \(page labels\); chapters: 2 of 3 kept, 2 in Extracted -> Extracted/.test(n)), JSON.stringify(e.notes));
        assert.ok(flat(e.extracted).some((x) => x.level === 0 && x.title === "CHAPTER 3 FORMATION OF LIQUID SHEETS" && x.position.pageIndex === 24), "chapter 3 kept: " + JSON.stringify(shapeOf(e)));
    });
});
