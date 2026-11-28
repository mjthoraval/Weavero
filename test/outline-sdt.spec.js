/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// The reader's Outline panel reads Zotero's structure data (outline2 P1,
// 2026-11-24; plan work/outline-extraction-plan-notes-2026-11-23.md):
// `catalog.outline` of the PDF's pack (Zotero.SDT, `.zotero-sdt-cache`) and the
// heading blocks its entries point to (lib/outline-sdt.ts, reader-panels.ts
// `_wvOutlineSdtFor`). Sources in the chip: the PDF's own outline first, Zotero's
// extracted one when it has none, the Weavero (edited) one as before. An entry
// with a heading block goes to that block's box, not through the title search.
//
// Two fixture PDFs written here (Helvetica, three pages, numbered bold headings
// over plain paragraphs): one with an outline of its own (/Outlines, its
// destinations 20 pt ABOVE each heading, as publishers' often are), one without.
// What Zotero stores for them, read 2026-11-24 on 11.0-beta.5 and 10.0.8 alike:
// eight heading blocks ("Drop impact on soft solids" ... "References", 2.1 and
// 2.2 nested under "2. Methods"); a native outline with `source: 'native'` and
// a `ref` per entry (11.0-beta.5 adds each destination as `target`, 10.0.8 does
// not). The heading boxes are in PDF user space -- the reader's own glyph boxes
// and positions -- checked below against the reader's characters.
//
// MJT's rules for anything kept from Zotero's data (2026-11-24): read again when
// its stamp moves, never shown stale, a pack older than its PDF is not the
// PDF's; the user's edited outline is never replaced when a pack appears or is
// rebuilt.

describe("Weavero — the Outline panel reads Zotero's structure data (outline2)", function () {
    this.timeout(300000);
    const Cu = Components.utils;
    const Z = /** @type {any} */ (Zotero);
    let wv, genAtt, natAtt, genReader, natReader;
    const made = [];

    const BODY = [
        "Drops falling on soft solids spread, splash or bounce depending on the impact speed and the",
        "stiffness of the substrate. We study the first instants of the impact with high-speed imaging",
        "and compare the measured shapes with simulations that resolve the deformation of the solid.",
        "The thin air layer under the drop is also measured with interferometry at high frame rates.",
        "Three regimes are separated by critical velocities that depend on the elastic modulus only.",
    ];
    // Where each heading's baseline is: [title, pageIndex, y, size].
    /** @type {Array<[string, number, number, number]>} */
    const HEADS = [
        ["1. Introduction", 0, 640, 14], ["2. Methods", 0, 520, 14], ["2.1. Experimental set-up", 0, 400, 12],
        ["2.2. Numerical simulations", 1, 720, 12], ["3. Results", 1, 560, 14], ["4. Conclusions", 2, 720, 14], ["References", 2, 560, 14],
    ];
    const NUMBERED = HEADS.map(h => h[0]);

    function fixturePDF(native) {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (font, x, y, size, text) => "BT /" + font + " " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        const para = (y0) => { let s = ""; let y = y0; for (const t of BODY) { s += line("F1", 72, y, 10, t); y -= 13; } return s; };
        const pages = ["", "", ""];
        pages[0] += line("F2", 72, 720, 20, "Drop impact on soft solids") + line("F1", 72, 696, 11, "A. Tester and B. Writer");
        for (const [t, p, y, size] of HEADS) {
            pages[p] += line("F2", 72, y, size, t);
            pages[p] += t === "References" ? line("F1", 72, y - 22, 9, "[1] Adams, J. 2016 Drop impact on a heated plate. J. Test Mech. 812, 101-120.") : para(y - 22 + (size === 12 ? 2 : 0));
        }
        const objs = [];
        objs[1] = "<< /Type /Catalog /Pages 2 0 R" + (native ? " /Outlines 11 0 R /PageMode /UseOutlines" : "") + " >>";
        objs[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>";
        for (let i = 0; i < 3; i++) objs[3 + i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R /F2 7 0 R >> >> /Contents " + (8 + i) + " 0 R >>";
        objs[6] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        objs[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
        for (let i = 0; i < 3; i++) objs[8 + i] = "<< /Length " + pages[i].length + " >>\nstream\n" + pages[i] + "endstream";
        if (native) {
            // 11 root; 12 Intro, 13 Methods (14 Set-up, 15 Numerical), 16 Results, 17 Conclusions, 18 References.
            // Each destination 20 pt above its heading's baseline.
            const dest = (i) => "/Dest [" + (3 + HEADS[i][1]) + " 0 R /XYZ 72 " + (HEADS[i][2] + 20) + " 0]";
            objs[11] = "<< /Type /Outlines /First 12 0 R /Last 18 0 R /Count 7 >>";
            objs[12] = "<< /Title (" + HEADS[0][0] + ") /Parent 11 0 R /Next 13 0 R " + dest(0) + " >>";
            objs[13] = "<< /Title (" + HEADS[1][0] + ") /Parent 11 0 R /Prev 12 0 R /Next 16 0 R /First 14 0 R /Last 15 0 R /Count 2 " + dest(1) + " >>";
            objs[14] = "<< /Title (" + HEADS[2][0] + ") /Parent 13 0 R /Next 15 0 R " + dest(2) + " >>";
            objs[15] = "<< /Title (" + HEADS[3][0] + ") /Parent 13 0 R /Prev 14 0 R " + dest(3) + " >>";
            objs[16] = "<< /Title (" + HEADS[4][0] + ") /Parent 11 0 R /Prev 13 0 R /Next 17 0 R " + dest(4) + " >>";
            objs[17] = "<< /Title (" + HEADS[5][0] + ") /Parent 11 0 R /Prev 16 0 R /Next 18 0 R " + dest(5) + " >>";
            objs[18] = "<< /Title (" + HEADS[6][0] + ") /Parent 11 0 R /Prev 17 0 R " + dest(6) + " >>";
        }
        let body = "%PDF-1.4\n";
        const offs = [];
        for (let i = 1; i < objs.length; i++) { offs[i] = body.length; body += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
        const xref = body.length;
        let x = "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
        for (let i = 1; i < objs.length; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    /** The PDF as an attachment; with `parentTitle`, under a journal article of
     *  that title by the fixture's two authors (the metadata Weavero's rules
     *  read: a title line and bylines are left out of Extracted). */
    async function importFile(name, text, parentTitle) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, text);
        let parentItemID;
        if (parentTitle) {
            const parent = new Zotero.Item("journalArticle");
            parent.setField("title", parentTitle);
            parent.setCreators([{ firstName: "A.", lastName: "Tester", creatorType: "author" }, { firstName: "B.", lastName: "Writer", creatorType: "author" }]);
            await parent.saveTx();
            made.push(parent);
            parentItemID = parent.id;
        }
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID });
        try { await IOUtils.remove(path); } catch (e) {}
        return att;
    }
    const packOf = (att) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
    /** Retry an ASYNC check until it holds (wvT.waitFor does not await a promise). */
    async function until(fn, ms, every) {
        const end = Date.now() + ms;
        for (;;) {
            let v = false;
            try { v = await fn(); } catch (e) { v = false; }
            if (v || Date.now() > end) return v;
            await wvT.sleep(every || 200);
        }
    }
    /** Forget what the panel kept for a reader (a fresh open, as far as the outline goes). */
    function fresh(reader) {
        for (const k of ["_wvOutlineSdt", "_wvOutlineCache", "_wvOutlineSdtAsked", "_wvOutlinePick", "_wvOutlineViewSource"]) {
            try { delete reader[k]; } catch (e) {}
        }
    }
    const flat = (tree) => { const o = []; const w = (l, d) => { for (const n of l || []) { o.push([n.title, d, n]); w(n.items, d + 1); } }; w(tree, 0); return o; };
    const nodeOf = (tree, title) => { const f = flat(tree).find(e => e[0] === title); return f ? f[2] : null; };
    /** The heading block an outline entry of the pack points to. */
    async function packBlocks(att) {
        const r = await Z.SDT.getPack(att.id, {});
        assert.ok(r && r.ok, "the pack of " + att.id);
        const rd = await Z.Weavero.lib.wvSdtOpen(r.bytes);
        const cat = await rd.getCatalog();
        const n = rd.getTopLevelBlockCount();
        const blocks = await rd.getBlocks(0, n - 1);
        const byTitle = {};
        const walk = (l) => { for (const it of l || []) { if (it.ref) byTitle[it.title] = blocks[it.ref[0]]; walk(it.children); } };
        walk(cat.outline);
        return { cat, blocks, byTitle };
    }
    async function openPdf(att) {
        const reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader of " + att.id);
        const ir = Cu.waiveXrays(reader._internalReader);
        const pv = await wvT.waitFor(() => { try { const v = ir._primaryView; return v && v._pdfPages && v._pdfPages[0] && v._pdfPages[0].chars && v._pdfPages[0].chars.length ? v : null; } catch (e) { return null; } }, 30000);
        assert.ok(pv, "the PDF view with its characters");
        return reader;
    }
    /** The Outline tab shown, Weavero's panel in it. */
    async function showOutline(reader) {
        const ir = reader._internalReader;
        try { ir.toggleSidebar(true); } catch (e) {}
        try { ir.setSidebarView("outline"); } catch (e) {}
        const idoc = reader._iframeWindow.document;
        const on = () => { const c = idoc.getElementById("sidebarContainer"); return c && c.classList.contains("wv-outline-tab-on") && idoc.querySelector(".wv-outline-reader-view .wv-outline-list"); };
        let v = await wvT.waitFor(on, 8000);
        if (!v) {
            wv._wvReaderEnsureOutlinePanel(reader, idoc);
            wv._wvReaderActivateOutlineTakeover(reader, idoc, true);
            v = await wvT.waitFor(on, 8000);
        }
        assert.ok(v, "Weavero's outline panel is up");
        return idoc;
    }
    const chipText = (idoc) => { const c = idoc.querySelector(".wv-outline-src-chip"); return c ? String(c.textContent || "").trim() : ""; };
    const rowTitles = (idoc) => Array.from(idoc.querySelectorAll(".wv-outline-reader-view .wv-outline-row")).map(r => String(r.textContent || ""));

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvReaderFetchOutline");
        assert.ok(Z.SDT && typeof Z.SDT.getPack === "function", "Zotero.SDT.getPack (Zotero 11, 10.0.8)");
        // Under its parent item (outline2.6): Weavero leaves the title line out,
        // so its Extracted differs from Zotero's (which lists it) and is the
        // default. A standalone copy would come out identical to Zotero's and
        // show as Zotero (test/outline-extracted-same.spec.js).
        genAtt = await importFile("wv-ol2-gen", fixturePDF(false), "Drop impact on soft solids");
        natAtt = await importFile("wv-ol2-nat", fixturePDF(true));
        made.push(genAtt, natAtt);
        // The packs, as Zotero builds them when a PDF opens.
        for (const a of [genAtt, natAtt]) assert.ok((await Z.SDT.getPack(a.id, { isPriority: true })).ok, "Zotero built the pack of " + a.id);
        genReader = await openPdf(genAtt);
        natReader = await openPdf(natAtt);
    });

    after(async function () {
        for (const r of [genReader, natReader]) { try { fresh(r); } catch (e) {} try { wvT.closeReaderTab(r); } catch (e) {} }
        await wvT.sleep(500);
        for (const a of made) {
            try { if (wv._wvOutlineHasCurated(a.libraryID, a.key)) await wv._wvOutlineRevert(a.libraryID, a.key); } catch (e) {}
        }
        await wvT.erase(...made);
    });

    it("a PDF without an outline of its own: Weavero's extracted outline first, Zotero's own one click away, nested as Zotero nests it", async function () {
        fresh(genReader);
        const r = await wv._wvReaderFetchOutline(genReader);
        assert.ok(r, "an outline");
        assert.equal(r.source, "extracted", "Weavero's extraction is the default (outline2.4)");
        assert.deepEqual(r.order, ["extracted", "zotero"], "Weavero's, then Zotero's as stored (" + JSON.stringify(r.order) + ")");
        assert.deepEqual(flat(r.alts.zotero).map(e => e[0]).filter(t => NUMBERED.includes(t)), NUMBERED, "Zotero's own outline kept as Zotero made it");
        assert.isString(r.sdtStamp);
        assert.isAbove(r.sdtStamp.length, 0, "read at the pack's stamp");
        const titles = flat(r.tree).map(e => e[0]);
        let at = -1;
        for (const t of NUMBERED) {
            const i = titles.indexOf(t);
            assert.isAbove(i, at, t + " in order: " + JSON.stringify(titles));
            at = i;
        }
        const methods = nodeOf(r.tree, "2. Methods");
        assert.deepEqual(methods.items.map(n => n.title), ["2.1. Experimental set-up", "2.2. Numerical simulations"], "2.1 and 2.2 under 2. Methods");
    });

    it("each entry is on its heading block's box -- PDF user space, the reader's own glyph boxes", async function () {
        fresh(genReader);
        const r = await wv._wvReaderFetchOutline(genReader);
        const { byTitle } = await packBlocks(genAtt);
        for (const [t, page, base, size] of HEADS) {
            const n = nodeOf(r.tree, t);
            const b = byTitle[t];
            assert.ok(n && b, t + ": an entry and its block");
            assert.equal(b.type, "heading", t + " is a heading block");
            const pr = b.anchor.pageRects[0];
            assert.deepEqual(n.position, { pageIndex: pr[0], rects: [pr.slice(1, 5)] }, t + ": the block's box");
            assert.equal(n.position.pageIndex, page, t + ": page " + (page + 1));
            const [x1, y1, x2, y2] = n.position.rects[0];
            // y up from the page's bottom: the baseline inside the box, the box one line tall.
            // (A top-left origin would put this heading near y = 792 - base.)
            assert.isBelow(y1, base, t + ": box bottom under the baseline " + JSON.stringify(n.position.rects[0]));
            assert.isAbove(y2, base + size * 0.6, t + ": box top above the baseline");
            assert.isBelow(y2 - y1, size * 1.6, t + ": one line tall");
            assert.approximately(x1, 72, 1, t + ": starts at x = 72");
            assert.isAbove(x2, x1 + size, t + ": as wide as its text");
        }
        // The reader's glyph boxes for "1. Introduction" (page 1): the block's box is theirs.
        const ir = Cu.waiveXrays(genReader._internalReader);
        const chars = Array.from(ir._primaryView._pdfPages[0].chars);
        const s = chars.map(c => c.c).join("");
        const i = s.indexOf("1.Introduction");
        assert.isAtLeast(i, 0, "the heading's characters on page 1: " + s.slice(0, 80));
        const g = chars.slice(i, i + "1.Introduction".length).map(c => Array.from(c.rect));
        const glyph = [Math.min(...g.map(q => q[0])), Math.min(...g.map(q => q[1])), Math.max(...g.map(q => q[2])), Math.max(...g.map(q => q[3]))];
        const box = nodeOf(r.tree, "1. Introduction").position.rects[0];
        assert.approximately(box[0], glyph[0], 1, "left edge: block " + JSON.stringify(box) + " glyphs " + JSON.stringify(glyph));
        assert.approximately(box[1], glyph[1], 1, "bottom edge");
        assert.approximately(box[2], glyph[2], 1, "right edge");
        assert.isAtLeast(box[3], glyph[3] - 0.5, "top edge at or above the glyphs'");
        assert.isBelow(box[3] - glyph[3], 4, "top edge within the font's ascent");
    });

    it("a PDF with its own outline: its good bookmarks are Weavero's skeleton -- identical here, so the PDF's own is shown (its titles and nesting, each entry on its heading's box, not on the destination)", async function () {
        fresh(natReader);
        const r = await wv._wvReaderFetchOutline(natReader);
        assert.ok(r, "an outline");
        // outline2.13 (rule 19): good bookmarks are Extracted's skeleton; with every
        // heading already a bookmark nothing is filled in, Extracted is identical to
        // the PDF's own, and the chip shows that one alone (amber = Weavero changed something).
        assert.isTrue(r.embeddedSame, "Extracted identical to the PDF's own outline");
        assert.equal(r.source, "embedded");
        assert.deepEqual(r.order, ["embedded"], "no Zotero entry (Zotero's catalog IS the PDF's outline), no identical Extracted");
        const emb = r.alts.embedded;
        assert.deepEqual(flat(emb).map(e => [e[0], e[1]]),
            [["1. Introduction", 0], ["2. Methods", 0], ["2.1. Experimental set-up", 1], ["2.2. Numerical simulations", 1], ["3. Results", 0], ["4. Conclusions", 0], ["References", 0]],
            "the PDF's titles and nesting, verbatim");
        const { byTitle } = await packBlocks(natAtt);
        for (const [t, page, base] of HEADS) {
            const n = nodeOf(emb, t);
            assert.isFalse(wv._wvOutlineIsPointRect(n.position), t + ": a box, not a destination point " + JSON.stringify(n.position));
            assert.equal(n.position.pageIndex, page, t + ": page " + (page + 1));
            const pr = byTitle[t].anchor.pageRects[0];
            assert.deepEqual(n.position.rects[0], pr.slice(1, 5), t + ": the heading block's box");
            assert.isBelow(n.position.rects[0][3], base + 20, t + ": below the destination, on the heading");
        }
    });

    it("the source chip: the PDF's own alone when Extracted is identical to it; a pick between originals is kept", async function () {
        fresh(natReader);
        const r = await wv._wvReaderFetchOutline(natReader);
        natReader._wvOutlineCache = r;
        assert.deepEqual(wv._wvOutlineAvailableSources(natReader, r.source), ["embedded"], "Embedded alone (outline2.13: Extracted identical to it)");
        // A pick of "extracted" falls back to the PDF's own.
        natReader._wvOutlinePick = "extracted";
        assert.equal((await wv._wvReaderFetchOutline(natReader)).source, "embedded");
        delete natReader._wvOutlinePick;
        // The order a cache carries is the chip's (here the hidden pref's other order).
        const two = { source: "embedded", tree: r.tree, alts: { embedded: r.tree, extracted: [{ title: "X", url: null, position: null, href: null, items: [] }] }, order: ["embedded", "extracted"], sdtStamp: r.sdtStamp };
        natReader._wvOutlineCache = two;
        assert.deepEqual(wv._wvOutlineAvailableSources(natReader, "embedded"), ["embedded", "extracted"]);
        const idoc = natReader._iframeWindow.document;
        wv._wvReaderRenderOutline = () => {};   // instance spy over the prototype method: no panel needed here
        try {
            wv._wvOutlineSwitchSource(natReader, idoc, "extracted");
            assert.equal(natReader._wvOutlinePick, "extracted");
            assert.equal(two.source, "extracted");
            assert.deepEqual(two.tree.map(n => n.title), ["X"], "the picked original is shown");
            assert.notStrictEqual(two.tree, two.alts.extracted, "a copy is shown, the kept data untouched");
        }
        finally { delete wv._wvReaderRenderOutline; fresh(natReader); }
    });

    it("a click on an entry goes straight to its heading's box: no title search", async function () {
        for (const m of ["_wvOutlineNavigate", "_wvOutlineFlattenTree", "_wvJumpToRect", "_wvOutlineRecoverRect"]) wvT.method(m);
        fresh(natReader);
        const r = await wv._wvReaderFetchOutline(natReader);
        natReader._wvOutlineCache = r;
        const entry = wv._wvOutlineFlattenTree(r.tree).find(e => e.title === "2.1. Experimental set-up");
        const jumps = [], searches = [];
        const proto = Object.getPrototypeOf(wv);
        wv._wvJumpToRect = function (pv, pageIndex, rects) { jumps.push({ pageIndex, rects: JSON.parse(JSON.stringify(rects)) }); return proto._wvJumpToRect.apply(this, arguments); };
        wv._wvOutlineRecoverRect = function () { searches.push(Array.from(arguments).slice(1)); return proto._wvOutlineRecoverRect.apply(this, arguments); };
        try {
            wv._wvOutlineNavigate(natReader, natReader._iframeWindow.document, entry, null);
            await wvT.sleep(600);
        }
        finally { delete wv._wvJumpToRect; delete wv._wvOutlineRecoverRect; }
        assert.deepEqual(searches, [], "no title search");
        assert.equal(jumps.length, 1, "one jump: " + JSON.stringify(jumps));
        assert.deepEqual(jumps[0], { pageIndex: 0, rects: entry.position.rects }, "to the heading's box");
    });

    it("no structure data (Zotero before 10.0.8): the reader's own outline, exactly as before", async function () {
        wvT.method("_wvReaderFetchOutlineOwn");
        // Zotero 11 resolves its own outline only while the Outline view is open.
        for (const rd of [natReader, genReader]) {
            await showOutline(rd);
            assert.ok(await wvT.waitFor(() => { const st = rd._internalReader._state; return st && st.outline; }, 20000), "the reader's own outline resolved");
        }
        const SDT = Z.SDT;
        try {
            Z.SDT = undefined;
            for (const rd of [natReader, genReader]) {
                fresh(rd);
                const r = await wv._wvReaderFetchOutline(rd);
                const own = await wv._wvReaderFetchOutlineOwn(rd);
                assert.ok(r && own, "an outline");
                assert.isUndefined(r.alts, "nothing from a pack");
                assert.equal(r.sdtStamp, "");
                assert.equal(r.source, own.source);
                assert.deepEqual(r.tree, own.tree, "the reader's own tree");
                assert.isNotOk(rd._wvOutlineSdtAsked, "no pack asked for");
            }
        }
        finally { Z.SDT = SDT; fresh(natReader); fresh(genReader); }
    });

    it("the same pack is read once; a rebuilt pack (new stamp) is read again", async function () {
        wvT.method("_wvOutlineSdtRead");
        fresh(genReader);
        let reads = 0;
        const proto = Object.getPrototypeOf(wv);
        wv._wvOutlineSdtRead = function () { reads++; return proto._wvOutlineSdtRead.apply(this, arguments); };
        try {
            const a = await wv._wvReaderFetchOutline(genReader);
            const b = await wv._wvReaderFetchOutline(genReader);
            assert.equal(reads, 1, "one read for one stamp");
            assert.equal(a.sdtStamp, b.sdtStamp);
            const kept = await wv._wvOutlineSdtFor(genReader);
            assert.isNumber(kept.ms, "the read's time is kept with it");
            assert.equal(reads, 1, "...and not read again for it");
            // Zotero rewrites the pack (a rebuild: a new file time).
            await IOUtils.setModificationTime(packOf(genAtt), Date.now() + 5000);
            const c = await wv._wvReaderFetchOutline(genReader);
            assert.equal(reads, 2, "the rebuilt pack is read again");
            assert.notEqual(c.sdtStamp, a.sdtStamp, "a new stamp");
            assert.ok(c.alts && c.alts.extracted, "its outline");
        }
        finally { delete wv._wvOutlineSdtRead; fresh(genReader); }
    });

    it("a pack older than its PDF, or one that is not this PDF's, is never shown: the reader's own outline", async function () {
        const pack = packOf(genAtt);
        const pdf = await genAtt.getFilePathAsync();
        const saved = await IOUtils.read(pack);
        try {
            // Older than the PDF: made from an earlier file.
            await IOUtils.setModificationTime(pdf, Date.now() + 60000);
            fresh(genReader);
            let r = await wv._wvReaderFetchOutline(genReader);
            assert.ok(r, "an outline");
            assert.isUndefined(r.alts, "not read from the old pack");
            assert.equal(r.sdtStamp, "", "no stamp: the pack is not the PDF's");
            await IOUtils.setModificationTime(pdf, Date.now() - 60000);
            // Another PDF's pack (its hash is not this PDF's).
            await IOUtils.write(pack, await IOUtils.read(packOf(natAtt)));
            fresh(genReader);
            r = await wv._wvReaderFetchOutline(genReader);
            assert.isUndefined(r.alts, "another file's pack is not read");
            assert.isAbove(r.sdtStamp.length, 0, "a stamp (a pack is there) but no outline from it");
            // A broken pack.
            await IOUtils.write(pack, new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]));
            fresh(genReader);
            r = await wv._wvReaderFetchOutline(genReader);
            assert.isUndefined(r.alts, "a broken pack is not read");
        }
        finally {
            await IOUtils.write(pack, saved);
            try { await IOUtils.setModificationTime(pdf, Date.now() - 60000); } catch (e) {}
            fresh(genReader);
        }
        const back = await wv._wvReaderFetchOutline(genReader);
        assert.ok(back.alts && back.alts.extracted, "the PDF's own pack again: its outline");
    });

    it("no pack yet: the reader's own outline, then Zotero's once it has built the pack -- asked for once, the panel switching by itself", async function () {
        wvT.method("_wvOutlineSdtRequest");
        const idoc = await showOutline(genReader);
        const SDT = Z.SDT;
        const asks = [];
        try {
            await IOUtils.remove(packOf(genAtt));
            fresh(genReader);
            // Zotero.SDT with getPack counted (its other members inherited).
            const stand = Object.create(SDT);
            stand.getPack = function (id, o) { asks.push([id, o && o.isPriority]); return SDT.getPack.apply(SDT, arguments); };
            Z.SDT = stand;
            const r = await wv._wvReaderFetchOutline(genReader);
            assert.ok(r, "an outline");
            assert.isUndefined(r.alts, "no pack: the reader's own outline");
            assert.equal(r.sdtStamp, "");
            await wv._wvReaderFetchOutline(genReader);
            assert.deepEqual(asks, [[genAtt.id, true]], "Zotero asked for the open PDF's pack once, as the reader asks");
            genReader._wvOutlineCache = r;
            wv._wvReaderRenderOutline(genReader, idoc);
            assert.ok(await until(() => IOUtils.exists(packOf(genAtt)), 60000), "Zotero built the pack");
            const sw = await wvT.waitFor(() => genReader._wvOutlineCache && genReader._wvOutlineCache.alts ? genReader._wvOutlineCache : null, 20000);
            assert.ok(sw, "the panel switched to the pack's outline by itself");
            assert.equal(chipText(idoc), wv._wvOutlineSourceLabel("extracted"));
            assert.ok(await wvT.waitFor(() => rowTitles(idoc).some(t => t.includes("1. Introduction")), 8000), "its rows: " + JSON.stringify(rowTitles(idoc)));
        }
        finally { Z.SDT = SDT; }
        // The panel's kept outline follows a rebuilt pack at the next render.
        const before = genReader._wvOutlineCache;
        await IOUtils.setModificationTime(packOf(genAtt), Date.now() + 10000);
        await wv._wvReaderRenderOutline(genReader, idoc);
        assert.notStrictEqual(genReader._wvOutlineCache, before, "read again");
        assert.notEqual(genReader._wvOutlineCache.sdtStamp, before.sdtStamp, "at the new stamp");
    });

    it("the user's edited outline is never replaced when the pack is rebuilt or appears", async function () {
        for (const m of ["_wvOutlineEnsureCurated", "_wvOutlineRenameEntry", "_wvOutlineDoc", "_wvOutlineRevert"]) wvT.method(m);
        const idoc = await showOutline(genReader);
        fresh(genReader);
        const r = await wv._wvReaderFetchOutline(genReader);
        const L = genAtt.libraryID, K = genAtt.key;
        try {
            genReader._wvOutlineCache = r;
            const doc = await wv._wvOutlineEnsureCurated(L, K, r.source, r.tree);
            // The base the edits start from (outline2.4, MJT 2026-11-24): the source,
            // the extraction code's fingerprint + the pack's stamp, the entries copied.
            assert.ok(doc.base, "a base kept with the edited outline");
            assert.equal(doc.base.source, r.source);
            assert.match(doc.base.version, /^ob:[0-9a-z]+:[0-9a-z]+\|sdt:/, "fingerprint + pack stamp: " + doc.base.version);
            assert.notInclude(doc.base.version, "|code:", "no instance tag in the base");
            assert.deepEqual(doc.base.tree.map(e => [e.title, e.level]), doc.entries.map(e => [e.title, e.indentLevel]), "the entries as copied");
            assert.equal(doc.base.tree.find(e => e.title === "1. Introduction").page, 0, "with their page");
            const intro = doc.entries.find(e => e.title === "1. Introduction");
            await wv._wvOutlineRenameEntry(L, K, intro.id, "Introduction (my words)");
            const edited = JSON.stringify(wv._wvOutlineDoc(L, K));
            assert.notInclude(edited, "\"ref\"", "no block index kept in an edited entry");
            // Zotero rebuilds the pack (Weavero on), then removes and builds it again
            // while Weavero takes no part (as with Weavero disabled).
            await IOUtils.setModificationTime(packOf(genAtt), Date.now() + 15000);
            await wv._wvReaderRenderOutline(genReader, idoc);
            await IOUtils.remove(packOf(genAtt));
            assert.ok((await Z.SDT.getPack(genAtt.id, {})).ok, "Zotero built it again");
            fresh(genReader);
            await wv._wvReaderRenderOutline(genReader, idoc);
            await wv._wvReaderFetchOutline(genReader);
            assert.equal(JSON.stringify(wv._wvOutlineDoc(L, K)), edited, "the edited outline, byte for byte");
            assert.equal(chipText(idoc), wv._wvOutlineSourceLabel("weavero"), "still shown");
            assert.ok(rowTitles(idoc).some(t => t.includes("Introduction (my words)")), "with the user's title: " + JSON.stringify(rowTitles(idoc)));
        }
        finally {
            try { await wv._wvOutlineRevert(L, K); } catch (e) {}
            fresh(genReader);
        }
    });

    // The dev Eval button (weavero.devOutlineEval) judges what is SHOWN: Weavero's
    // extraction by default, with Zotero's own stored outline kept beside it
    // (outline2.4, MJT 2026-11-24). Writes weavero/outline-eval.json only.
    it("an Eval mark records the shown source, its tree, and Zotero's own outline beside it", async function () {
        for (const m of ["_wvOeMark", "_wvOeUnmark", "_wvOeCase"]) wvT.method(m);
        const idoc = await showOutline(genReader);
        fresh(genReader);
        await wv._wvReaderRenderOutline(genReader, idoc);
        assert.ok(await wvT.waitFor(() => genReader._wvOutlineCache && genReader._wvOutlineCache.alts, 10000), "the pack's outlines");
        await wv._wvReaderRenderOutline(genReader, idoc);
        assert.equal(chipText(idoc), wv._wvOutlineSourceLabel("extracted"), "Weavero's extraction shown");
        await wvT.withPref("weavero.devOutlineEval", true, async () => {
            await wv._wvOeMark(genReader, idoc, "good");
            try {
                const c = wv._wvOeCase(genAtt.libraryID, genAtt.key);
                assert.ok(c, "a case");
                assert.equal(c.verdict, "good");
                assert.equal(c.shown, "extracted", "what was on screen");
                assert.equal(c.source, "extracted");
                assert.deepEqual(flat(c.snapshot).map(e => e[0]), flat(genReader._wvOutlineCache.alts.extracted).map(e => e[0]), "Weavero's tree");
                assert.ok(Array.isArray(c.zotero) && c.zotero.length, "Zotero's own outline beside it");
                assert.deepEqual(flat(c.zotero).map(e => e[0]), flat(genReader._wvOutlineCache.alts.zotero).map(e => e[0]));
            }
            finally { await wv._wvOeUnmark(genReader, idoc); }
        });
    });

    it("an entry of the PDF's outline whose heading Zotero did not find keeps the reader's destination", function () {
        wvT.method("_wvOutlineSdtBorrowPos");
        const pos = (p, y) => ({ pageIndex: p, rects: [[72, y, 72, y]] });
        const box = { pageIndex: 0, rects: [[72, 637, 169, 652.7]] };
        const mine = [{ title: "1. Introduction", url: null, position: box, href: null, items: [] },
            { title: "2.  Methods", url: null, position: null, href: null, items: [{ title: "2.1 Set-up", url: null, position: null, href: null, items: [] }] }];
        // The reader's tree: same entries, whitespace as in the file, plus one Zotero dropped.
        const own = [{ title: "1. Introduction", position: pos(0, 660), items: [] }, { title: "Cover", position: pos(0, 792), items: [] },
            { title: "2. Methods", position: pos(0, 540), items: [{ title: "2.1 Set-up", position: pos(1, 420), items: [] }] }];
        wv._wvOutlineSdtBorrowPos(mine, own);
        assert.deepEqual(mine[0].position, box, "a found heading keeps its box");
        assert.deepEqual(mine[1].position, pos(0, 540), "paired by title in sequence");
        assert.deepEqual(mine[1].items[0].position, pos(1, 420));
    });
});
