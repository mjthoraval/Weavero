/* global describe, it, before, after, assert, Zotero, Components, Services, PathUtils, IOUtils, wvT */

// Cited by (src/modules/cited-by.ts, src/lib/ref-citedby.ts; plan
// work/citedby-plan-2026-11-20.md): for an item, the papers of the user's
// libraries whose reference lists cite it -- offline, from what Zotero keeps
// beside each PDF: its structure cache (written when Zotero's reader opens the
// PDF) or else its full-text cache. Nothing generated, nothing written to any
// library.
//
// The fixture library:
//   X "Drop impact on a heated plate in a vacuum chamber" (Adams 2016), with a PDF
//   Y "Bubble entrapment beneath falling droplets of viscous oil" (Davis 2019)
//   Z "Thin films on soft substrates and their slow drainage dynamics" (Foster
//     2021): cited by nobody at first
//   P1 (2024, My Library): a numbered list [1] X, [2] Y, [3] Z' (a work not in
//     the library); its structure cache made as Zotero's reader makes it
//   P2 (2022, My Library): an author-year list citing X, read from its full text
//   P3 (2023, a test group): a numbered list citing Y, read from its full text
// Each PDF is written here (Helvetica, two pages, the list on page 2), as
// test/refs.spec.js builds its fixture.

describe("Weavero — Cited by", function () {
    this.timeout(300000);
    const Cu = Components.utils;
    const made = [];
    let wv, L, win, group = null;
    let X, Xpdf, Y, Z, P1, P1pdf, P2, P2pdf, P3, P3pdf;
    let fpBefore = null;
    const sdtThere = () => !!(/** @type {any} */ (Zotero).SDT && wv._wvCbSdtUsable());

    const X_ENTRY = ["Adams, J., Brown, K. & Clark, L. 2016 Drop impact on a heated plate in a vacuum chamber.", "J. Test Mech. 812, 101-120."];
    const Y_ENTRY = ["Davis, M. & Evans, P. 2019 Bubble entrapment beneath falling droplets of viscous oil.", "Phys. Rev. Test 4, 053601."];
    const W_ENTRY = ["Quinn, R. 2017 Capillary waves on a stretched liquid sheet at high speed.", "J. Test Mech. 820, 1-20."];
    const Z_ENTRY = ["Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics.", "Annu. Rev. Test Fluid 53, 33-58."];
    // Cited by P2 alone: the item V, added later, concerns that PDF only.
    const V_ENTRY = ["Ueda, S. 2015 Rim instability of retracting liquid sheets at low Weber number.", "J. Test Mech. 830, 5-30."];

    /** A two-page PDF: a body, then "References" and `entries` on page 2,
     *  numbered ("[1]" before each) or not (author-year). */
    function fixturePDF(title, entries, numbered) {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        let p1 = line(72, 740, 14, title);
        let y = 700;
        for (const t of ["We study drops and films, as others did before us.", "The experiments follow the methods of earlier work.",
            "Our results agree with the literature cited below."]) { p1 += line(72, y, 10, t); y -= 14; }
        let p2 = line(72, 740, 12, "References");
        y = 715;
        entries.forEach(([a, c], i) => {
            if (numbered) p2 += line(72, y, 9, "[" + (i + 1) + "]");
            p2 += line(numbered ? 90 : 72, y, 9, a); y -= 11;
            p2 += line(numbered ? 90 : 82, y, 9, c); y -= 15;
        });
        const objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Length " + p1.length + " >>\nstream\n" + p1 + "endstream",
            "<< /Length " + p2.length + " >>\nstream\n" + p2 + "endstream",
        ];
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    async function importPDF(name, text, parentItemID) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, text);
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID });
        try { await IOUtils.remove(path); } catch (e) {}
        return att;
    }
    async function article(fields, libraryID) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = libraryID || Zotero.Libraries.userLibraryID;
        for (const k of Object.keys(fields)) if (!k.startsWith("_")) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: fields._first || "Nobody", firstName: "A." }]);
        await it.saveTx();
        return it;
    }
    const cacheOf = (att, name) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, name);
    /** What the library holds that the feature must never change. */
    async function fingerprint() {
        const rows = await Zotero.DB.queryAsync("SELECT itemID, version, dateModified, synced FROM items ORDER BY itemID");
        const parts = rows.map(r => r.itemID + ":" + r.version + ":" + r.dateModified + ":" + r.synced);
        for (const t of ["itemData", "itemTags", "itemRelations", "itemNotes", "itemCreators", "collectionItems"]) {
            parts.push(t + "=" + await Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM " + t));
        }
        return parts.join("|");
    }
    /** One whole pass, after any pass already running (the one init schedules). */
    async function runPass(only) {
        await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50);
        await wv._wvCbPass("spec", only);
        await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50);
    }
    const citers = (it) => L.wvCbCiters(wv._wvCbIx, it.id).slice().sort((a, b) => a - b);
    /** The pass a library change asks for (its own timer waits a minute): the
     *  changed items' PDFs alone. */
    async function runTargeted() {
        await wv._wvRefsFlush();
        await wv._wvCbLibChanged();
        try { L.wvClearTimeout(wv._wvCbTgtT); wv._wvCbTgtT = null; } catch (e) {}
        await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50);
        await wv._wvCbPass("spec-targeted", undefined, true);
        await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50);
    }
    /** Which of the fixture's PDFs a step read again (a record read again is a new object). */
    const recsNow = () => [P1pdf, P2pdf, P3pdf].map(a => wv._wvCbIx.recs.get(a.id));
    const reread = (before) => recsNow().map((r, i) => r !== before[i]);
    /** Run `fn`, counting the fixture's PDFs whose caches were read (_wvCbReadOne)
     *  and those matched again from their stored entries (_wvCbReMatchOne
     *  answering), by attachment id, sorted (citations.1). */
    async function counting(fn) {
        const reads = [], rematches = [];
        const proto = Object.getPrototypeOf(wv);
        wv._wvCbReadOne = function (rix, c, ...rest) { reads.push(c.id); return proto._wvCbReadOne.call(this, rix, c, ...rest); };
        wv._wvCbReMatchOne = async function (rix, c, ...rest) { const r = await proto._wvCbReMatchOne.call(this, rix, c, ...rest); if (r) rematches.push(c.id); return r; };
        try { await fn(); }
        finally { delete wv._wvCbReadOne; delete wv._wvCbReMatchOne; }
        const fx = new Set([P1pdf, P2pdf, P3pdf].filter(Boolean).map(a => a.id));
        const num = (a, b) => a - b;
        return { reads: reads.filter(id => fx.has(id)).sort(num), rematches: rematches.filter(id => fx.has(id)).sort(num) };
    }
    const ids = (...atts) => atts.map(a => a.id).sort((a, b) => a - b);
    const cbDir = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "cited-by");
    /** Every record shard's document, changed by `edit` and written back. */
    async function editShards(edit) {
        await wv._wvCbFlush();
        for (const f of (await IOUtils.getChildren(cbDir())).filter(p => /shard-\d\d\.json$/.test(p))) {
            const doc = JSON.parse(await IOUtils.readUTF8(f));
            edit(doc);
            await IOUtils.writeUTF8(f, JSON.stringify(doc));
        }
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvCbPass", "_wvCbLoad", "_wvCbSdtUsable", "_wvCbOpenAt", "_wvCbStats", "_wvCbLibChanged", "_wvCbFlush", "_wvCbDestroy", "_wvCbInit", "_wvRefsFlush",
            "_wvCbReadOne", "_wvCbSecBuild"]) wvT.method(m);
        for (const f of ["wvCbTextEntries", "wvCbSection", "wvCbChunks", "wvCbCiters", "wvCbIndexNew", "wvCbPut", "wvCbDrop", "wvCbShardDoc", "wvCbShardLoad"]) if (typeof L[f] !== "function") wvT.absent("lib." + f);
        win = Zotero.getMainWindow();
        // The pass init schedules for later: the spec runs its own.
        try { L.wvClearTimeout(wv._wvCbPassT); wv._wvCbPassT = null; } catch (e) {}
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        group = new Zotero.Group();
        Object.assign(group, { id: Zotero.Utilities.rand(10000, 1000000), name: "wv-citedby-group", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        X = await article({ title: "Drop impact on a heated plate in a vacuum chamber", date: "2016", volume: "812", pages: "101-120", _first: "Adams" });
        Y = await article({ title: "Bubble entrapment beneath falling droplets of viscous oil", date: "2019", _first: "Davis" });
        Z = await article({ title: "Thin films on soft substrates and their slow drainage dynamics", date: "2021", _first: "Foster" });
        P1 = await article({ title: "WV-TEST citing paper one on drops", date: "2024", _first: "Tester", publicationTitle: "WV-TEST Annals of Rheotaxis" });
        P2 = await article({ title: "WV-TEST citing paper two on films", date: "2022", _first: "Writer" });
        P3 = await article({ title: "WV-TEST citing paper three in a group", date: "2023", _first: "Grouper" }, group.libraryID);
        made.push(X, Y, Z, P1, P2, P3);
        Xpdf = await importPDF("wv-cb-x", wvT.minimalPDFBytes(), X.id);
        P1pdf = await importPDF("wv-cb-p1", fixturePDF("WV-TEST citing paper one on drops", [X_ENTRY, Y_ENTRY, W_ENTRY], true), P1.id);
        P2pdf = await importPDF("wv-cb-p2", fixturePDF("WV-TEST citing paper two on films", [X_ENTRY, W_ENTRY, V_ENTRY], false), P2.id);
        P3pdf = await importPDF("wv-cb-p3", fixturePDF("WV-TEST citing paper three in a group", [Y_ENTRY], true), P3.id);
        made.push(Xpdf, P1pdf, P2pdf, P3pdf);
        // Zotero's full-text index for the three papers (its own cache files).
        for (const a of [P1pdf, P2pdf, P3pdf]) await Zotero.Fulltext.indexItems([a.id], { complete: true });
        // P1 opened "in the reader": Zotero's structure cache, where this Zotero has one.
        // Through Weavero's SDT reader (getPack + the module; zotero#6012 removes getReader).
        if (sdtThere()) { const rd = await wvT.lib().wvSdtReader(P1pdf.id); assert.ok(rd, "fixture: P1's structure cache made"); }
        await wv._wvRefsIndexEnsure();
        await wv._wvRefsFlush();
        fpBefore = await fingerprint();
    });

    after(async function () {
        try { for (const r of Zotero.Reader._readers.slice()) if ([P1pdf, P2pdf, P3pdf].some(a => a && r.itemID === a.id)) wvT.closeReaderTab(r); } catch (e) {}
        await wvT.sleep(300);
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
        try { if (group) await group.eraseTx(); } catch (e) {}
    });

    // ---- the full text's reference section (lib/ref-citedby.ts) ----

    it("a full text's reference section: after its last heading, else a bracketed list; none in a paper without one", function () {
        const body = "Introduction. ".repeat(80);
        const a = L.wvCbSection(body + "\nReferences\n[1] A. Smith, Some title here. J. X 1, 2 (2001).\n[2] B. Jones, Other title. J. Y 3, 4 (2002).");
        assert.equal(a.how, "heading");
        const b = L.wvCbSection(body + " *author@x.org [1] P.-G. de Gennes, Capillarity (Springer, 2004). [2] R. D. Deegan, Nature 389, 827 (1997). [3] Y. O. Popov, Phys. Rev. E 71, 036313 (2005).");
        assert.equal(b.how, "numbered", "APS: no heading, the [1] [2] [3] run");
        assert.equal(L.wvCbSection(body + " See ref [1] and also [2].").how, "none", "a citation in the text is no list");
        // A table of contents' "References" early on is not the section.
        const c = L.wvCbSection("Contents\nReferences\n" + body + "\nREFERENCES\nAarts, D. G. A. L. 2005 Hydrodynamics of droplet coalescence. Phys. Rev. Lett. 95, 164503.");
        assert.equal(c.how, "heading");
        assert.isAbove(c.start, body.length, "the last heading, past the body");
        // The heading glued to the first entry by the text's layout.
        const d = L.wvCbSection(body + "\nReferences Aarts, D. G. A. L. 2005 Hydrodynamics of droplet coalescence. Phys. Rev. Lett. 95, 164503.");
        assert.equal(d.how, "heading");
        // A short paper whose list is most of its text: its heading before 30 % of it.
        const list = "Adams, J. 2016 Drop impact on a heated plate in a vacuum chamber. J. Test Mech. 812, 101-120.\n".repeat(8);
        const e = L.wvCbSection("A short letter\nWe study drops.\nReferences\n" + list);
        assert.equal(e.how, "heading", "found");
        assert.isBelow(e.start, 0.3 * (40 + list.length), "before 30 % of the text");
    });

    it("a reference section cut into entries: numbered, and author-year lists run together by the text's layout", function () {
        const n = L.wvCbChunks("[1] P.-G. de Gennes, Capillarity and Wetting Phenomena (Springer, 2004). [2] R. D. Deegan, Nature 389, 827 (1997). [3] Y. O. Popov, Phys. Rev. E 71, 036313 (2005).");
        assert.equal(n.length, 3, JSON.stringify(n));
        assert.match(n[1], /^\[2\] R\. D\. Deegan/);
        const ay = L.wvCbChunks("Aarts, D. G. A. L., Lekkerkerker, H. N. W. & Bonn, D. 2005\nHydrodynamics of droplet coalescence. Phys. Rev. Lett. 95, 164503. Bird, J. C., Mandre, S. & Stone, H. A. 2008 Short-time dynamics of partial wetting. Phys. Rev. Lett. 100, 234501.\nBONN, D., EGGERS, J. 2009 Wetting and spreading. Rev. Mod. Phys. 81, 739-805.");
        assert.equal(ay.length, 3, JSON.stringify(ay));
        assert.match(ay[0], /^Aarts, D\. G\. A\. L\., Lekkerkerker/, "the author list stays with its entry");
        assert.match(ay[1], /^Bird, J\. C\./);
        assert.match(ay[2], /^BONN, D\./);
        // The styles of MJT's library (plan §7, 2026-11-20): Vancouver numbered and run into one
        // line, and unnumbered; Science's "(2016). 2. D. Foresti"; AIP's superscript glued to the
        // first initial; Annual Reviews' entries ending on their pages; APS's initials-first
        // authors never cut apart.
        const v = L.wvCbChunks("3. Frary CD, Johnson RK, Wang MQ. Food sources and intakes of caffeine in the diets of persons in the United States. J Am Diet Assoc. 2005;105(1):110-3. 4. Doherty M, Smith PM. Effects of caffeine ingestion on exercise testing: a meta-analysis. Int J Sport Nutr Exerc Metab. 2004;14(6):626-46. 5. Pomportes L, Brisswalter J. Cognitive performance in athletes. J Sports Sci. 2017;35:1-9.");
        assert.deepEqual(v.map(e => e.slice(0, 12)), ["3. Frary CD,", "4. Doherty M", "5. Pomportes"], JSON.stringify(v));
        const u = L.wvCbChunks("Frary CD, Johnson RK, Wang MQ. Food sources and intakes of caffeine. J Am Diet Assoc. 2005;105(1):110-3. Doherty M, Smith PM. Effects of caffeine ingestion on exercise testing. Int J Sport Nutr. 2004;14(6):626-46. Pomportes L, Brisswalter J. Cognitive performance in athletes. J Sports Sci. 2017;35:1-9.");
        assert.deepEqual(u.map(e => e.slice(0, 10)), ["Frary CD, ", "Doherty M,", "Pomportes "], JSON.stringify(u));
        const sci = L.wvCbChunks("1. C. Josserand, S. T. Thoroddsen, Drop impact on a solid surface. Annu. Rev. Fluid Mech. 48, 365-391 (2016). 2. D. Foresti, K. T. Kroll, Acoustophoretic printing. Sci. Adv. 4, eaat1659 (2018). 3. C. W. Visser, T. Kamperman, In-air microfluidics. Sci. Adv. 4, eaao1175 (2018).");
        assert.deepEqual(sci.map(e => e.slice(0, 13)), ["1. C. Josserand".slice(0, 13), "2. D. Foresti", "3. C. W. Viss"], JSON.stringify(sci));
        const aip = L.wvCbChunks("1W. K. Melville, “The role of surface-wave breaking in air-sea interaction,” Annu. Rev. Fluid Mech. 28, 279 (1996). 2G. B. Deane and M. D. Stokes, “Scale dependence of bubble creation mechanisms in breaking waves,” Nature 418, 839 (2002). 3R. Wanninkhof, W. E. Asher, “Advances in quantifying air-sea gas exchange,” Annu. Rev. Mar. Sci. 1, 213 (2009).");
        assert.deepEqual(aip.map(e => e.slice(0, 8)), ["1W. K. M", "2G. B. D", "3R. Wann"], JSON.stringify(aip));
        const ar = L.wvCbChunks("Anna L, Bontoux N, Stone HA. 2003. Formation of dispersions using flow focusing in microchannels. Appl. Phys. Lett. 82:364-66 Bartolo D, Josserand C, Bonn D. 2006. Singular jets and bubbles in drop impact. Phys. Rev. Lett. 96:124501 Basaran OA. 2002. Small-scale free surface flows with breakup. AIChE J. 48:1843-48");
        assert.deepEqual(ar.map(e => e.slice(0, 10)), ["Anna L, Bo", "Bartolo D,", "Basaran OA"], JSON.stringify(ar));
        const aps = L.wvCbChunks("R. D. Deegan, O. Bakajin, T. F. Dupont, and T. A. Witten, Nature (London) 389, 827 (1997). Y. O. Popov, Phys. Rev. E 71, 036313 (2005).");
        assert.isTrue(aps.some(e => /R\. D\. Deegan, O\. Bakajin/.test(e)), "an APS author list stays whole: " + JSON.stringify(aps));
    });

    // 2026-11-20 night (MJT: "getting the correct references and cited by, with high
    // accuracy"): in the survey of MJT's library, 123 papers' full texts gave no section --
    // 535 of the 840 cited works the full-text path missed -- their lists printed with no
    // heading at all (AIP, APS, Nature, PNAS, ACS).
    it("a list printed with no heading: its numbering found, never a paper's numbered captions or sections", function () {
        const body = "Introduction. ".repeat(80);
        const forms = {
            aip: "\n1A. Vogel and V. Venugopalan, “Mechanisms of pulsed laser ablation,” Chem. Rev. 103, 577 (2003). 2A. Vogel, K. Lorenz, “Shock wave emission,” J. Acoust. Soc. Am. 100, 148 (1996). 3J. R. Blake and D. C. Gibson, “Cavitation bubbles near boundaries,” Annu. Rev. Fluid Mech. 19, 99 (1987).",
            nature: "\n1. Wirth, W., Storp, S. & Jacobsen, W. Mechanisms controlling leaf retention. Pest. Sci. 33, 411-422 (1991). 2. Chandra, S. & Avedisian, C. T. On the collision of a droplet with a solid surface. Proc. R. Soc. Lond. A 432, 13-41 (1991).\n3. Bergeron, V. et al. Controlling droplet deposition. Nature 405, 772 (2000).",
            aps: "\f1 C. Josserand and S. Zaleski, Phys. Fluids 15, 1650 2003 . 2 S. T. Thoroddsen, J. Fluid Mech. 451, 373 2002 . 3 D. A. Weiss and A. L. Yarin, J. Fluid Mech. 385, 229 1999 .",
            acs: "\n(1) Krol, A.; Grinfeldt, M. G. Eur. Biophys. J. 1990, 19, 93-99. (2) Rabinovich, Y. I.; Vakarelski, I. U. J. Colloid Interface Sci. 2004, 270, 29-36. (3) Butt, H.-J. Biophys. J. 1991, 60, 1438.",
        };
        for (const [k, list] of Object.entries(forms)) {
            const s = L.wvCbSection(body + list);
            assert.equal(s.how, "numbered", k);
            assert.approximately(s.start, body.length + 1, 1, k + ": at its label 1 (or the line break before it)");
            const te = L.wvCbTextEntries(body + list);
            assert.lengthOf(te.entries, 3, k + ": " + JSON.stringify(te.entries));
        }
        // Numbered and printing no year: captions, sections, a numbered procedure.
        assert.equal(L.wvCbSection(body + "\nFIG. 1. Sketch of the set-up. FIG. 2. The drop before impact. FIG. 3. Its spreading on the plate.").how, "none", "captions");
        assert.equal(L.wvCbSection(body + "\n1. Introduction\nDrops are studied.\n2. Methods\nA camera is used.\n3. Results\nThe drop spreads.").how, "none", "sections");
    });

    it("a numbered list's entries run together: each next number cuts, whatever follows it", function () {
        // AIP: most labels glued to an initial and a space ("1D. Liu"), some to a hyphenated
        // initial, a title, a bare surname (EN3LJQ96, E7GR9W3T in the survey).
        const aipEntries = ["D. Liu and T. Tran, “Emergence of two lamellas,” Appl. Phys. Lett. 112, 203702 (2018).",
            "G. Riboux and J. M. Gordillo, “Experiments of drops impacting a smooth solid surface,” Phys. Rev. Lett. 113, 024507 (2014).",
            "E. Villermaux and B. Bossa, “Drop fragmentation on impact,” J. Fluid Mech. 668, 412 (2011).",
            "H.-R. Liu, C.-Y. Zhang, and H. Ding, “On the maximal spreading of impacting compound drops,” J. Fluid Mech. 854, R6 (2018).",
            "C. Josserand and S. T. Thoroddsen, “Drop impact on a solid surface,” Annu. Rev. Fluid Mech. 48, 365 (2016).",
            "A. L. Yarin, “Drop impact dynamics,” Annu. Rev. Fluid Mech. 38, 159 (2006).",
            "Fundamentals of Inkjet Printing, edited by S. D. Hoath (Wiley-VCH, Weinheim, 2016).",
            "R. D. Deegan, P. Brunet, and J. Eggers, “Complexities of splashing,” Nonlinearity 21, C1 (2008).",
            "Lord Rayleigh, “On the instability of jets,” Proc. London Math. Soc. 10, 4 (1878)."];
        const aip = L.wvCbChunks(aipEntries.map((e, i) => (i + 1) + e).join(" "));
        assert.deepEqual(aip.map(e => e.slice(0, 6)), ["1D. Li", "2G. Ri", "3E. Vi", "4H.-R.", "5C. Jo", "6A. L.", "7Funda", "8R. D.", "9Lord "], JSON.stringify(aip));
        // Nature: no space after the number's period.
        const nat = L.wvCbChunks("1.Quéré, D. Leidenfrost dynamics. Annu. Rev. Fluid Mech. 45, 197–215 (2013). 2.Chaudhury, M. K., Chakrabarti, A. & Daniel, S. Generation of motion of drops. Langmuir 31, 9266–9281 (2015). 3.Chaudhury, M. K. & Whitesides, G. M. How to make water run uphill. Science 256, 1539–1541 (1992).");
        assert.deepEqual(nat.map(e => e.slice(0, 8)), ["1.Quéré,", "2.Chaudh", "3.Chaudh"], JSON.stringify(nat));
        // Springer: an entry ending on its pages or its DOI, the year in parentheses.
        const spr = L.wvCbChunks("Cossali GE, Marengo M, Coghe A (2004) The role of time in single drop splash. Exp Fluids 36:888–900 Fedorchenko AI, Wang AB (2004) On some common features of drop impact. Phys Fluids 16:1349–1365. https://doi. org/10.1039/C4SM00513A Sykes TC, Castrejón-Pita AA, Wilson MCT (2020) Surface jets and internal mixing. Phys Rev Fluids 5:023602");
        assert.deepEqual(spr.map(e => e.slice(0, 10)), ["Cossali GE", "Fedorchenk", "Sykes TC, "], JSON.stringify(spr));
        // IOP: initials spaced, the year bare after the authors.
        const iop = L.wvCbChunks("Bush J W M and Hu D 2006 Walking on water: biolocomotion at the interface Annu. Rev. Fluid Mech. 38 339–69 Bush J W M, Hu D L and Prakash M 2007 The integument of water-walking arthropods Adv. Insect Physiol. 34 117–92 Culick F E C 1960 Comments on a ruptured soap film J. Appl. Phys. 31 1128–9");
        assert.deepEqual(iop.map(e => e.slice(0, 10)), ["Bush J W M", "Bush J W M", "Culick F E"], JSON.stringify(iop));
        // ACS: "(n)".
        const acs = L.wvCbChunks("(1) Krol, A.; Grinfeldt, M. G. Eur. Biophys. J. 1990, 19, 93-99. (2) Rabinovich, Y. I.; Vakarelski, I. U. J. Colloid Interface Sci. 2004, 270, 29-36. (3) Butt, H.-J. Biophys. J. 1991, 60, 1438.");
        assert.deepEqual(acs.map(e => e.slice(0, 8)), ["(1) Krol", "(2) Rabi", "(3) Butt"], JSON.stringify(acs));
    });

    // The survey's next class (2026-11-20 night): entries run together at a particle ("de Gennes",
    // "van der Meer"), an accent the text put apart ("CASTREJ ́ON-PITA"), "2008b", MDPI's "[CrossRef]
    // 16.", "G.C." initials, and JFM's capitals -- never at a journal's capitals or a capital initial.
    it("author names as the lists write them: particles, apart accents, capitals; a journal's capitals are no author", function () {
        const cut = (s, n) => L.wvCbChunks(s).map(e => e.slice(0, n));
        assert.deepEqual(cut("Alben S. 2008a. Optimal flexibility of a flapping appendage. J. Fluid Mech. 614:355–80 Alben S. 2008b. The flapping-flag instability. Phys. Fluids 20:104106 Bergmann R, van der Meer D, Stijnman M. 2006. Giant bubble pinch-off. Phys. Rev. Lett. 96:154505", 12),
            ["Alben S. 200", "Alben S. 200", "Bergmann R, "], "Annual Reviews, a year with a letter");
        assert.deepEqual(cut("Brenner MP, Eggers J. 1997. Breakdown of scaling. Phys. Fluids 9:1573–90 Mart ́ınez-Baza ́n C, Monta ̃ne ́s JL, Lasheras JC. 1999. On the breakup of an air bubble. J. Fluid Mech. 401:157–82 de Gennes PG, Brochard-Wyart F. 2003. Capillarity and wetting. Springer", 12),
            ["Brenner MP, ", "Mart ́ınez-B", "de Gennes PG"], "apart accents, a particle");
        assert.deepEqual(cut("1. Yamamoto, K.; Takezawa, H. Droplet impact on textured surfaces. Colloids Surf. A 2016, 506, 363–370. [CrossRef] 2. Yarin, A.L. Drop Impact Dynamics. Annu. Rev. Fluid Mech. 2006, 38, 159–192. [CrossRef] 3. von Kann, S.; Joubaud, S. Granular jets. Phys. Rev. E 2010, 81, 041306. [CrossRef]", 12),
            ["1. Yamamoto,", "2. Yarin, A.", "3. von Kann,"], "MDPI");
        assert.deepEqual(cut("1 G.C. Stokes, Trans. Cambridge Philos. Soc., 9 (1851) 8. 2 J.C. Maxwell, Philos. Trans. R. Soc. London Ser. A, 170 (1879) 231. 3 W.J. Silliman and L.E. Scriven, J. Comput. Phys., 34 (1980) 287.", 12),
            ["1 G.C. Stoke", "2 J.C. Maxwe", "3 W.J. Silli"], "initials with no space");
        assert.deepEqual(cut("ASHMORE, J. & STONE, H. A. 2004 Instability of a rotating thread in a second immiscible liquid. Phys. Fluids 16 (1), 29–38. CASTREJ ́ON-PITA, A. A., CASTREJ ́ON-PITA, J. R. & HUTCHINGS, I. M. 2012 Experimental observation of von Kármán vortices. Phys. Rev. Lett. 108, 074506. LAMB, H. 1932 Hydrodynamics. Cambridge University Press.", 12),
            ["ASHMORE, J. ", "CASTREJ ́ON-", "LAMB, H. 193"], "JFM's capitals");
        assert.deepEqual(cut("TURNERJ,. S., HUPPERT,H. E. & SPARKS,R. S. J. 1986 Komatiites II: experimental and theoretical investigations. J. Petrol. 27, 397-437. WOODSA, . W. & HUPPERT,H. E. 1989 The cooling of a magma chamber. J. Fluid Mech. 201, 543-565.", 12),
            ["TURNERJ,. S.", "WOODSA, . W."], "an old scan's OCR'd capitals");
        assert.deepEqual(cut("REYNOLDS, O. 1886 On the theory of lubrication. Phil. Trans. R. SOC. 177 (1886) 157-234. TUCK, E. O. 1983 Thin films. J. Fluid Mech. 135 (1983) 51-69.", 12),
            ["REYNOLDS, O.", "TUCK, E. O. "], "a journal's capitals cut nothing");
        assert.deepEqual(cut("REDNIKOV, A. YE., RYAZANTSEV, Y. S. & VELARDE, M. G. 1994 Drop motion with surfactant transfer. Phys. Fluids 6, 451–468. RAYLEIGH, LORD 1879 On the capillary phenomena of jets. Proc. R. Soc. Lond. 29, 71–97.", 12),
            ["REDNIKOV, A.", "RAYLEIGH, LO"], "an initial in capitals cuts nothing");
    });

    // The survey's precision audit (2026-11-20 night): every Annual Reviews PDF ends with its volume's
    // contents, and the full text's titles there were read as references -- each article "cited" the
    // other articles of its volume.
    it("a journal volume's contents after the references are no part of them (Annual Reviews)", function () {
        const body = "Introduction. ".repeat(80);
        const list = "\nLITERATURE CITED\nBird JC, Mandre S, Stone HA. 2008. Short-time dynamics of partial wetting. Phys. Rev. Lett. 100:234501\nBonn D, Eggers J, Indekeu J. 2009. Wetting and spreading. Rev. Mod. Phys. 81:739–805\n";
        for (const contents of ["Annual Review of Fluid Mechanics\nVolume 40, 2008\nContents\nFlows of Dense Granular Media\nYoël Forterre and Olivier Pouliquen 1\nControl of Flow Over a Bluff Body\nHaecheon Choi, Woo-Pyung Jeon, and Jinsung Kim 113\n",
            "Annual Review of Fluid Mechanics\nContents Volume 47, 2015\nLiquid Transfer in Printing Processes: Liquid Bridges with Moving Contact Lines\nSatish Kumar 67\n",
            "Annual Review of Fluid Mechanics Volume 36, 2004\nCONTENTS\nCOATING FLOWS, Steven J. Weinstein and Kenneth J. Ruschak 29\n"]) {
            const te = L.wvCbTextEntries(body + list + "Downloaded from www.annualreviews.org. For personal use only.\n\f" + contents);
            assert.ok(te.entries.some(e => e.startsWith("Bird JC")), "the list read: " + JSON.stringify(te.entries.map(e => e.slice(0, 20))));
            assert.notOk(te.entries.some(e => /Bluff Body|Liquid Transfer|COATING FLOWS|Granular Media/.test(e)), "no title of the volume's contents: " + JSON.stringify(te.entries.map(e => e.slice(0, 40))));
        }
    });

    it("a chapter's numbered exercises after its author-year list do not make the list a numbered one", function () {
        const region = "Fermi, E. (1956). Thermodynamics, New York: Dover Publications, Inc. Lamb, H. (1945). Hydrodynamics, Sixth Edition, New York: Dover Publications, Inc. Probstein, R. F. (1994). Physicochemical Hydrodynamics, Second Edition, New York: John Wiley & Sons.\nExercises\n1. Using indicial notation, show that a × (b × c) = (a · c)b − (a · b)c.\n2. Show that the condition for the vectors a, b, and c to be coplanar is εijk ai bj ck = 0.\n3. Prove the following relationships: δij δij = 3.\n4. Show that C · CT = CT · C = δ.";
        const ch = L.wvCbChunks(region);
        for (const who of ["Fermi, E. (1956)", "Lamb, H. (1945)", "Probstein, R. F. (1994)"]) assert.ok(ch.some(e => e.startsWith(who)), who + " is an entry of its own: " + JSON.stringify(ch.map(e => e.slice(0, 20))));
    });

    it("a book or a thesis: the reference list of every chapter, not only the last", function () {
        const chapter = (n, title) => "Chapter " + n + ". " + "Body text of the chapter about drops and films. ".repeat(1100) + "\nReferences\n"
            + "Adams, J. 2016 " + title + ". J. Test Mech. 812, 101-120.\nBrown, K. 2017 Another work on drops in the chapter " + n + ". J. Test 1, 2.\n";
        const book = chapter(1, "A first chapter's cited work on splashing drops") + chapter(2, "A second chapter's cited work on bouncing drops") + chapter(3, "A third chapter's cited work on spreading films");
        assert.isAtLeast(book.length, 150000, "fixture: a long text");
        const te = L.wvCbTextEntries(book);
        for (const t of ["first chapter", "second chapter", "third chapter"]) assert.ok(te.entries.some(e => e.includes(t)), t + "'s list read: " + te.entries.length + " entries");
    });

    // ---- the long work in steps (citedby.4, plan §13) ----

    /** A book's text as pdf.js writes it: `front` short lines of front
     *  matter, then `chapters` chapters, each a body of `bodyLines` short lines
     *  then "References" and `n` author-year entries, every entry its own
     *  names, title words, year and pages. */
    function bookText(chapters, bodyLines, n, front = 0) {
        const name = (k) => { let s = ""; for (let x = k + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(97 + (x - 1) % 26) + s; return "Q" + s; };
        let t = "", k = 0;
        for (let l = 0; l < front; l++) t += "Preface and contents of the book, line " + l + ".\n";
        for (let c = 1; c <= chapters; c++) {
            t += "Chapter " + c + "\n";
            for (let l = 0; l < bodyLines; l++) t += "The film drains as the drop falls, line " + l + ".\n";
            t += "References\n";
            for (let i = 0; i < n; i++, k++) {
                const words = [];
                for (let j = 0; j < 10; j++) words.push(name(k * 10 + j).toLowerCase() + ["ic", "al", "ous", "ive", "ing"][j % 5]);
                t += name(k) + ", " + String.fromCharCode(65 + k % 26) + ". & " + name(k + 9) + ", B. " + (1950 + k % 70) + " " + words.join(" ") + ". J. Test Mech. " + (100 + k % 800) + ", " + (k % 900 + 1) + "-" + (k % 900 + 19) + ".\n";
            }
        }
        return t;
    }

    it("the text work in steps gives what it gives at once, whatever the window", function () {
        const book = bookText(5, 700, 60);
        assert.isAtLeast(book.length, 150000, "fixture: a long text");
        let steps = 0;
        const g = L.wvCbSectionsSteps(book);
        let r;
        while (!(r = g.next()).done) steps++;
        assert.deepEqual(r.value, L.wvCbSections(book));
        assert.isAtLeast(steps, 5, "the heading scan comes in steps");
        assert.lengthOf(r.value.regions, 5, "a list per chapter");
        const lists = [book.slice(r.value.regions[0][0], r.value.regions[0][1]),
            "[1] P.-G. de Gennes, Capillarity (Springer, 2004). [2] R. D. Deegan, Nature 389, 827 (1997). [3] Y. O. Popov, Phys. Rev. E 71, 036313 (2005).",
            "3. Frary CD, Johnson RK. Food sources of caffeine. J Am Diet Assoc. 2005;105(1):110-3. 4. Doherty M, Smith PM. Effects of caffeine ingestion. Int J Sport. 2004;14(6):626-46. 5. Pomportes L. Cognitive performance. J Sports Sci. 2017;35:1-9.",
            "Anna L, Bontoux N, Stone HA. 2003. Formation of dispersions. Appl. Phys. Lett. 82:364-66 Bartolo D, Josserand C, Bonn D. 2006. Singular jets. Phys. Rev. Lett. 96:124501 Basaran OA. 2002. Small-scale flows. AIChE J. 48:1843-48"];
        for (const s of lists) {
            const whole = L.wvCbChunks(s);
            // Windows far smaller than a list's entries: every cut still where one scan of the whole puts it.
            for (const win of [23, 64, 997]) assert.deepEqual(L.wvCbRun(L.wvCbChunksSteps(s, win)), whole, "window " + win + " on " + s.slice(0, 30));
        }
    });

    it("a filter read from its text answers as the one it was made from; a cut text is none", function () {
        const tokens = new Set();
        for (const e of bookText(1, 0, 400).split("\n")) L.wvCbEntryTokens(e, tokens);
        const f = L.wvCbFilterOf(tokens);
        const enc = L.wvCbFilterEncode(f);
        const g = L.wvCbFilterDecode(enc);
        assert.ok(g, "decoded");
        for (const t of tokens) assert.isTrue(L.wvCbFilterHas(g, t), t);
        for (let i = 0; i < 2000; i++) {
            const q = "absent" + i;
            assert.equal(L.wvCbFilterHas(g, q), L.wvCbFilterHas(f, q), q);
        }
        assert.equal(L.wvCbFilterEncode(g), enc, "written back the same");
        assert.equal(L.wvCbRun(L.wvCbFilterEncodeSteps(f)), enc);
        // The pass keeps the tokens as their hashes only: the same filter.
        const sink = new L.WvCbTokenSink();
        for (const e of bookText(1, 0, 400).split("\n")) L.wvCbEntryTokens(e, sink);
        assert.equal(sink.size, tokens.size, "as many distinct tokens");
        assert.equal(L.wvCbFilterEncode(L.wvCbFilterOf(sink)), enc, "the same filter from the hashes");
        assert.isNull(L.wvCbFilterDecode(enc.slice(0, -4)), "a cut text");
        assert.isNull(L.wvCbFilterDecode("8.5.AA"), "too few characters for its bits");
        assert.isNull(L.wvCbFilterDecode("not a filter"));
    });

    it("a library item's keys as the References index keeps them: its volume|page keys and its first author's other forms", function () {
        const rix = L.wvRefIndexNew();
        L.wvRefIndexPut(rix, { id: 1, lib: 1, title: "Drop impact on a heated plate in a vacuum chamber", date: "2016", volume: "812", pages: "101-120", first: "Adams" });
        L.wvRefIndexPut(rix, { id: 2, lib: 1, title: "Wetting transitions on textured hydrophobic surfaces", date: "2010", first: "van der Veen" });
        const k1 = L.wvCbItemKeys(rix.items.get(1));
        assert.include(k1.vps, "812|101", "the index's volume|page keys: " + JSON.stringify(k1.vps));
        const filt = (entry) => { const t = new Set(); L.wvCbEntryTokens(entry, t); return L.wvCbFilterOf(t); };
        // Named by volume and page alone (no title): the matcher's step 3.
        assert.isTrue(L.wvCbMayCite(filt("Adams, J. 2016 J. Test Mech. 812, 101-120."), k1), "its volume and page");
        assert.isFalse(L.wvCbMayCite(filt("Adams, J. 2016 J. Test Mech. 999, 1-20."), k1), "another volume and page");
        // The first author as the entry writes it: "Der Veen" for van der Veen (ref-match.ts surnameForms).
        const k2 = L.wvCbItemKeys(rix.items.get(2));
        assert.include(k2.forms, "derveen");
        assert.isTrue(L.wvCbMayCite(filt("Der Veen, A. 2010 Wetting transitions on hydrophobic surfaces with textures. Langmuir 26, 1-9."), k2), "by its other form, the year and most of the title");
    });

    // refkeys.1 (2026-11-24): the matcher names an item by its arXiv identifier (ref-match.ts, step 1b),
    // which a physics list often writes alone ("P. Lewin-Jones and J. Sprittles, arXiv:2101.12345").
    it("refkeys: an item known by its arXiv identifier passes the filter of an entry that writes it, with its first author or year", function () {
        const rix = L.wvRefIndexNew();
        L.wvRefIndexPut(rix, { id: 1, lib: 1, title: "Bouncing or merging in drop-bath impacts", archiveID: "arXiv:2101.12345", date: "2021", first: "Lewin-Jones" });
        const k = L.wvCbItemKeys(rix.items.get(1));
        assert.deepEqual(Array.from(k.axs || []), ["2101.12345"], "the index's arXiv identifier");
        const filt = (entry) => { const t = new Set(); L.wvCbEntryTokens(entry, t); return L.wvCbFilterOf(t); };
        assert.isTrue(L.wvCbMayCite(filt("[3] P. Lewin-Jones and J. Sprittles, arXiv:2101.12345 (2021)."), k), "its identifier and first author, no title");
        assert.isTrue(L.wvCbMayCite(filt("[3] P. Lewin-Jones and J. Sprittles, https://arxiv.org/abs/2101.12345v2."), k), "as a link, the version off");
        assert.isFalse(L.wvCbMayCite(filt("[3] P. Lewin-Jones and J. Sprittles, arXiv:2101.54321 (2021)."), k), "another identifier");
    });

    // citations.1 (plan work/citations-plan-2026-11-21.md M1): every entry is stored with what it
    // is known by without the matcher -- M3 groups the unmatched ones by work, M2 names one again.
    it("an entry's keys, without the matcher: first author, year, title head, DOIs, volume|page -- in the lists' styles", function () {
        if (typeof L.wvCbEntryKeys !== "function") wvT.absent("lib.wvCbEntryKeys");
        const k = (e) => L.wvCbEntryKeys(e);
        let x = k("Adams, J., Brown, K. & Clark, L. 2016 Drop impact on a heated plate in a vacuum chamber. J. Test Mech. 812, 101-120.");
        assert.deepEqual([x[0], x[1], x[3], x[4]], ["adams", "2016", "", "812|101"], "JFM's author-year: " + JSON.stringify(x));
        assert.equal(x[2], "dropimpactonaheatedplateinavacuumchamber", "its title head, the year before it left out");
        x = k("4. Doherty M, Smith PM. Effects of caffeine ingestion on exercise testing: a meta-analysis. Int J Sport Nutr Exerc Metab. 2004;14(6):626-46.");
        assert.deepEqual([x[0], x[1]], ["doherty", "2004"], "Vancouver: " + JSON.stringify(x));
        assert.match(x[2], /^effectsofcaffeineingestion/);
        x = k("1. Wirth, W., Storp, S. & Jacobsen, W. Mechanisms controlling leaf retention of agricultural spray solutions. Pest. Sci. 33, 411-422 (1991).");
        assert.deepEqual([x[0], x[1]], ["wirth", "1991"], "Nature: " + JSON.stringify(x));
        assert.match(x[2], /^mechanismscontrollingleaf/, "the title after the initials");
        x = k("[3] D. Liu and T. Tran, “Emergence of two lamellas during impact of compound droplets,” Appl. Phys. Lett. 112, 203702 (2018), doi:10.1063/1.5030389.");
        assert.equal(x[0], "liu", "AIP: " + JSON.stringify(x));
        assert.match(x[2], /^emergenceoftwolamellas/, "the quoted title");
        assert.equal(x[3], "10.1063/1.5030389");
        x = k("R. D. Deegan, O. Bakajin, T. F. Dupont, and T. A. Witten, Nature (London) 389, 827 (1997).");
        assert.deepEqual([x[0], x[1], x[2]], ["deegan", "1997", ""], "APS, no title printed: " + JSON.stringify(x));
        assert.include(x[4].split(" "), "389|827");
        x = k("van der Meer D, Bergmann R, Stijnman M. 2006. Giant bubble pinch-off. Phys. Rev. Lett. 96:154505");
        assert.deepEqual([x[0], x[1], x[2]], ["vandermeer", "2006", "giantbubblepinchoff"], "a particle joined to the name: " + JSON.stringify(x));
        x = k("[5] 张三, 李四. 液滴撞击固体表面的实验研究[J]. 力学学报, 2010, 42(3): 1-10.");
        assert.equal(x[1], "2010", JSON.stringify(x));
        assert.match(x[2], /^液滴撞击/, "a script without case: its longest piece");
    });

    it("the works citing an item: one per work -- copies folded, the best copy first as References orders them -- newest first", function () {
        if (typeof L.wvCbWorks !== "function") wvT.absent("lib.wvCbWorks");
        const items = new Map();
        const put = (id, lib, title, year, first, dois) => items.set(id, { id, lib, title, ct: L.wvRefCompact(title), dois: dois || [], first, year });
        // A paper in My Library (1) and its copy in a group (7): the same DOI.
        put(10, 7, "Splashing of drops on dry surfaces", "2020", "lee", ["10.1/a"]);
        put(11, 1, "Splashing of drops on dry surfaces", "2020", "lee", ["10.1/a"]);
        // The same title, the same first author and year, a DOI on one only: copies.
        put(20, 1, "Bouncing drops on a liquid bath", "2018", "couder", []);
        put(21, 9, "Bouncing drops on a liquid bath", "2018", "couder", ["10.1/b"]);
        // The same title by another first author: another work.
        put(30, 1, "Bouncing drops on a liquid bath", "2018", "smith", []);
        // Two DOIs that differ: two works, whatever the title.
        put(40, 1, "Wetting and spreading", "2009", "bonn", ["10.1/c"]);
        put(41, 1, "Wetting and spreading", "2009", "bonn", ["10.1/d"]);
        const ix = L.wvCbIndexNew();
        let att = 100;
        for (const id of [10, 11, 20, 21, 30, 40, 41]) L.wvCbPut(ix, att++, { s: "ft:1:1", src: "ft", p: id, l: items.get(id).lib, g: 1, c: [[0, 5]] });
        // A second PDF of paper 11, with a structure cache: the one that opens.
        L.wvCbPut(ix, 200, { s: "sdt:1:1", src: "sdt", p: 11, l: 1, g: 1, c: [[3, 5]] });
        const works = L.wvCbWorks(ix, 5, id => items.get(id), 1, 1);
        assert.deepEqual(works.map(w => w.ids), [[11, 10], [20, 21], [30], [40], [41]], JSON.stringify(works));
        assert.equal(works[0].att, 200, "the PDF with real entries");
        // From group 9's side (the cited item there): that group's copy first, then My Library's.
        assert.deepEqual(L.wvCbWorks(ix, 5, id => items.get(id), 9, 1).find(w => w.ids.includes(20)).ids, [21, 20]);
        // Gone from the library (the index holds no record): left out; the item never cites itself.
        items.delete(30);
        L.wvCbPut(ix, 300, { s: "ft:1:1", src: "ft", p: 5, l: 1, g: 1, c: [[0, 5]] });
        assert.deepEqual(L.wvCbWorks(ix, 5, id => items.get(id), 1, 1).map(w => w.ids[0]), [11, 20, 40, 41]);
        // A copy with no DOI and no first author fits two papers whose DOIs differ (review of M1,
        // 2026-11-21): the fold is a union, and it must not bridge them into one work.
        const ix2 = L.wvCbIndexNew();
        put(50, 1, "Rupture of thin liquid sheets in air", "2012", "smith", ["10.1/x"]);
        put(51, 1, "Rupture of thin liquid sheets in air", "2012", "", []);
        put(52, 1, "Rupture of thin liquid sheets in air", "2012", "jones", ["10.1/y"]);
        att = 400;
        for (const id of [50, 51, 52]) L.wvCbPut(ix2, att++, { s: "ft:1:1", src: "ft", p: id, l: 1, g: 1, c: [[0, 6]] });
        assert.deepEqual(L.wvCbWorks(ix2, 6, id => items.get(id), 1, 1).map(w => w.ids), [[50, 51], [52]], "two works: the DOIs disagree");
    });

    it("a book's full text is read a few milliseconds at a time: no slice of its reading over the budget", async function () {
        // 45,000 lines of front matter, then 14 chapters of 50 lines and 220 entries: 2.5 MB, 3,000
        // entries read, a filter of 86,000 tokens. Before citedby.4 its headings were looked for in
        // one call and its filter made in one (73 and 18 ms in Node; on MJT's books in Zotero 11,
        // up to 65 and 46 ms: plan §13).
        const book = bookText(14, 50, 220, 45000);
        const path = PathUtils.join(PathUtils.tempDir, "wv-cb-book-" + Date.now() + ".txt");
        await IOUtils.writeUTF8(path, book);
        const rix = await wv._wvRefsIndexEnsure();
        const c = { id: P2pdf.id, parent: P2.id, lib: P2pdf.libraryID, key: P2pdf.key, linkMode: 0, path: "", storageHash: "" };
        // Each step between two paces timed, I/O left out, slices made as _wvCbPace makes them.
        const now = () => win.performance.now();
        let last = null, steps = [];
        const mark = (forced) => { const n = now(); if (last != null) steps.push([n - last, !!forced]); last = n; };
        const pace = async (force) => { if (last == null) last = now(); else mark(force); };
        const once = async () => {
            steps = []; last = null;
            const r = await wv._wvCbReadOne(rix, c, { src: "ft", s: "x", path }, 1, pace);
            mark(true);
            const slices = [];
            let cur = 0;
            for (const [d, forced] of steps) { cur += d; if (forced || cur >= 8) { slices.push(cur); cur = 0; } }
            return { r, maxSlice: Math.max(...slices), maxStep: Math.max(...steps.map(x => x[0])), work: steps.reduce((a, x) => a + x[0], 0), slices: slices.length };
        };
        wv._wvCbIoWait = function () { if (last != null) steps.push([now() - last, true]); last = null; };
        wv._wvCbIoDone = function () { last = now(); };
        let a, b;
        try { a = await once(); b = await once(); }
        finally { delete wv._wvCbIoWait; delete wv._wvCbIoDone; try { await IOUtils.remove(path); } catch (e) {} }
        assert.isAtLeast(a.r.filt.length, 80000, "fixture: a book's filter (" + a.r.filt.length + " characters)");
        // The module's own measure: a slice over 8 + 7 ms is over budget (cited-by.ts _wvCbPace).
        // Read twice: a garbage collection may land in one run, not in both.
        const best = a.maxSlice <= b.maxSlice ? a : b;
        assert.isAtMost(best.maxSlice, 15, "the longest slice " + best.maxSlice.toFixed(1) + " ms (longest step " + best.maxStep.toFixed(1) + " ms; "
            + Math.round(best.work) + " ms of work in " + best.slices + " slices)");
    });

    it("the index: put, drop, citers per copy, a shard written and read back", function () {
        const ix = L.wvCbIndexNew();
        L.wvCbPut(ix, 10, { s: "ft:1:1", src: "ft", p: 1, l: 1, g: 1, c: [[0, 100, 101], [2, 200]] });
        L.wvCbPut(ix, 11, { s: "ft:2:2", src: "ft", p: 2, l: 1, g: 1, c: [[1, 100]] });
        assert.deepEqual(L.wvCbCiters(ix, 100).sort(), [10, 11]);
        assert.deepEqual(L.wvCbCiters(ix, 101), [10], "every copy the match names");
        assert.equal(L.wvCbEntryOf(ix, 10, 200), 2);
        const doc = L.wvCbShardDoc(ix, L.wvCbShardOf(10, 32), 32, 1);
        const back = L.wvCbIndexNew();
        assert.equal(L.wvCbShardLoad(back, JSON.parse(JSON.stringify(doc)), 1), 1);
        assert.deepEqual(L.wvCbCiters(back, 101), [10]);
        assert.equal(L.wvCbShardLoad(L.wvCbIndexNew(), doc, 2), 0, "another format version is not read");
        L.wvCbDrop(ix, 10);
        assert.deepEqual(L.wvCbCiters(ix, 100), [11]);
        assert.deepEqual(L.wvCbCiters(ix, 101), []);
    });

    // ---- the pass ----

    it("a pass reads every PDF: the structure cache where Zotero made one, else the full text; each cited item knows its citing papers", async function () {
        assert.isTrue(await IOUtils.exists(cacheOf(P2pdf, ".zotero-ft-cache")), "fixture: P2's full text indexed");
        await runPass();
        const ix = wv._wvCbIx;
        assert.ok(ix, "the index is there");
        const r1 = ix.recs.get(P1pdf.id), r2 = ix.recs.get(P2pdf.id), r3 = ix.recs.get(P3pdf.id);
        assert.ok(r1 && r2 && r3, "a record per citing PDF");
        assert.equal(r1.src, sdtThere() ? "sdt" : "ft", "P1: its structure cache" + (sdtThere() ? "" : " (none in this Zotero: its full text)"));
        assert.equal(r2.src, "ft", "P2: its full text");
        assert.equal(r3.src, "ft");
        assert.equal(r3.l, group.libraryID, "P3 in the group");
        assert.deepEqual(citers(X), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "X: cited by P1 and P2");
        assert.deepEqual(citers(Y), [P1pdf.id, P3pdf.id].sort((a, b) => a - b), "Y: cited by P1 and P3 (a group's paper too)");
        assert.deepEqual(citers(Z), [], "Z: cited by nobody");
        assert.deepEqual(citers(P1), [], "a paper does not cite itself");
        const st = wv._wvCbStats();
        assert.isAbove(st.slices, 0, "the work went in slices");
        // The budget is 8 ms a slice (cited-by.ts WV_CB_SLICE_MS); a loaded runner adds
        // GC pauses, so the guard is a sanity bound -- the plan's numbers come from the probe.
        assert.isAtMost(st.maxSliceMs, 100, "no slice blocked for long (" + st.maxSliceMs + " ms, " + st.over + " over budget of " + st.slices + ")");
    });

    it("nothing generated, nothing written to any library: no structure cache made for a PDF read from its full text", async function () {
        assert.isFalse(await IOUtils.exists(cacheOf(P2pdf, ".zotero-sdt-cache")), "P2 has no structure cache");
        assert.isFalse(await IOUtils.exists(cacheOf(P3pdf, ".zotero-sdt-cache")), "P3 has none");
        assert.equal(await fingerprint(), fpBefore, "the library is as it was");
    });

    it("the entries are stored: a compressed file a PDF, its entries as read -- matched or not -- with their keys", async function () {
        wvT.method("_wvCbEntPath");
        const path = wv._wvCbEntPath(P2pdf.id);
        const back = await L.wvStoreRead(path, { decompress: true });
        assert.equal(back.status, "ok", "P2's entries file: " + path);
        const magic = await IOUtils.read(path, { maxBytes: 8 });
        assert.equal(String.fromCharCode(...magic), "mozLz40\0", "mozlz4, as Firefox's session store");
        const doc = back.doc;
        const rec = wv._wvCbIx.recs.get(P2pdf.id);
        assert.equal(doc.s, rec.s, "stamped with the file it was read from");
        const text = await IOUtils.readUTF8(cacheOf(P2pdf, ".zotero-ft-cache"));
        assert.deepEqual(doc.x, L.wvCbTextEntries(text).entries, "the entries as read");
        assert.lengthOf(doc.x, 3, "X's, W's and V's entries: matched or not");
        assert.deepEqual(rec.c.map(m => m[0]), [0], "the record names X's entry alone (W and V are not in the library yet)");
        assert.lengthOf(doc.k, 3, "a key per entry");
        assert.deepEqual([doc.k[0][0], doc.k[0][1]], ["adams", "2016"]);
        assert.match(doc.k[0][2], /^dropimpactonaheatedplate/);
        // The reading code's fingerprint, the one the record shards carry.
        await wv._wvCbFlush();
        const shard = JSON.parse(await IOUtils.readUTF8(PathUtils.join(cbDir(), "shard-" + String(L.wvCbShardOf(P2pdf.id, 32)).padStart(2, "0") + ".json")));
        assert.ok(shard.lv && shard.mv && shard.lv !== shard.mv, "a shard's two fingerprints, reading and matching");
        assert.equal(doc.lf, shard.lv);
        assert.isNotNull(L.wvCbEntriesUsable(doc, doc.v, rec.s, shard.lv), "usable for that file");
        assert.isNull(L.wvCbEntriesUsable(doc, doc.v, "ft:1:2", shard.lv), "another file's stamp: not usable");
        assert.isNull(L.wvCbEntriesUsable(doc, doc.v, rec.s, "another reading code"), "another reading code's: not usable");
    });

    it("a second pass reads nothing unchanged; a changed full text is read again -- that PDF alone, its entries stored again", async function () {
        const ix = wv._wvCbIx;
        const recs0 = [P1pdf, P2pdf, P3pdf].map(a => ix.recs.get(a.id));
        let n = await counting(() => runPass());
        assert.deepEqual(n, { reads: [], rematches: [] }, "nothing read, nothing matched again");
        assert.deepEqual([P1pdf, P2pdf, P3pdf].map((a, i) => ix.recs.get(a.id) === recs0[i]), [true, true, true], "the same records");
        // P2's full text now also cites Z (as a re-index after the file changed would write it).
        const ft = cacheOf(P2pdf, ".zotero-ft-cache");
        const text = await IOUtils.readUTF8(ft);
        await IOUtils.writeUTF8(ft, text + "\n" + Z_ENTRY.join(" ") + "\n");
        n = await counting(() => runPass());
        assert.deepEqual(n, { reads: [P2pdf.id], rematches: [] }, "its stamp changed: P2 alone read again");
        assert.deepEqual([P1pdf, P2pdf, P3pdf].map((a, i) => ix.recs.get(a.id) === recs0[i]), [true, false, true]);
        assert.include(citers(Z), P2pdf.id, "Z: now cited by P2");
        wvT.method("_wvCbEntPath");
        const back = await L.wvStoreRead(wv._wvCbEntPath(P2pdf.id), { decompress: true });
        assert.equal(back.doc && back.doc.s, ix.recs.get(P2pdf.id).s, "its entries stored again, with the new stamp");
        assert.lengthOf(back.doc.x, 4);
    });

    it("an item added that two indexed PDFs cite: those two matched again from their entries -- none read -- not the third, and both list it; the generation stays", async function () {
        const gen0 = wv._wvCbIx.gen;
        const before = recsNow();
        const W = await article({ title: "Capillary waves on a stretched liquid sheet at high speed", date: "2017", _first: "Quinn" });
        made.push(W);
        const n = await counting(() => runTargeted());
        assert.equal(wv._wvCbIx.gen, gen0, "no full re-match");
        assert.deepEqual(n, { reads: [], rematches: ids(P1pdf, P2pdf) }, "P1 and P2 matched again from their stored entries, no PDF read");
        assert.deepEqual(reread(before), [true, true, false], "P1 and P2 have new records, P3 not");
        assert.deepEqual(citers(W), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "W: cited by P1 and P2");
    });

    it("an item added that one indexed PDF cites: only that PDF is matched again, from its entries, and it lists the new item", async function () {
        const before = recsNow();
        const V = await article({ title: "Rim instability of retracting liquid sheets at low Weber number", date: "2015", _first: "Ueda" });
        made.push(V);
        const n = await counting(() => runTargeted());
        assert.deepEqual(n, { reads: [], rematches: [P2pdf.id] }, "P2 alone, from its entries");
        assert.deepEqual(reread(before), [false, true, false], "P2 alone has a new record");
        assert.equal(wv._wvCbStats().lastPassReads, 0, "no PDF read in all");
        assert.equal(wv._wvCbStats().lastPassRematches, 1, "one matched again");
        assert.deepEqual(citers(V), [P2pdf.id], "V: cited by P2");
    });

    it("an item added that nothing cites: no PDF read again", async function () {
        const before = recsNow();
        const U = await article({ title: "Thermal fatigue of ceramic turbine blades in marine engines", date: "2011", _first: "Okonkwo" });
        made.push(U);
        const n = await counting(() => runTargeted());
        assert.deepEqual(n, { reads: [], rematches: [] }, "nothing read, nothing matched again");
        assert.deepEqual(reread(before), [false, false, false], "none of the fixture's PDFs read again");
        assert.equal(wv._wvCbStats().lastPassReads, 0, "no PDF read at all");
        assert.deepEqual(citers(U), []);
    });

    it("a change that does not touch what the matcher reads (a tag): nothing to do", async function () {
        Z.addTag("wv-citedby-tag");
        await Z.saveTx();
        await wv._wvRefsFlush();
        await wv._wvCbLibChanged();
        try { L.wvClearTimeout(wv._wvCbTgtT); wv._wvCbTgtT = null; } catch (e) {}
        assert.equal(wv._wvCbStats().changedPending, 0, "no item changed for the matcher");
    });

    it("a matcher change (the MATCH fingerprint in the store differs): every PDF matched again from its stored entries, none read; the same answers", async function () {
        await editShards(doc => { doc.mv = "an older matcher"; });
        wv._wvCbIx = null;
        await wv._wvCbLoad();
        const before = recsNow();
        assert.deepEqual(before.map(r => r.g), [0, 0, 0], "loaded as matched by another matcher");
        const n = await counting(() => runPass());
        assert.deepEqual(n, { reads: [], rematches: ids(P1pdf, P2pdf, P3pdf) }, "all three matched again, none read");
        assert.deepEqual(reread(before), [true, true, true], "new records");
        assert.deepEqual(citers(X), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "the same answers");
        assert.deepEqual(citers(Y), [P1pdf.id, P3pdf.id].sort((a, b) => a - b));
    });

    it("a reading-code change (the LIST fingerprint in the store differs): every PDF read again, the section answering meanwhile", async function () {
        await editShards(doc => { doc.lv = "an older reading code"; });
        wv._wvCbIx = null;
        await wv._wvCbLoad();
        const before = recsNow();
        assert.deepEqual(before.map(r => r.s), ["", "", ""], "loaded as read by other code: a stamp no file has");
        assert.deepEqual(citers(X), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "kept for the section until read again");
        const n = await counting(() => runPass());
        assert.deepEqual(n, { reads: ids(P1pdf, P2pdf, P3pdf), rematches: [] }, "all three read again");
        assert.deepEqual(citers(X), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "the same answers");
    });

    it("a week after the last full match: every PDF matched again from its entries, none read; then a week from now", async function () {
        const gen0 = wv._wvCbIx.gen;
        wv._wvCbFullAt = Date.now() - 8 * 24 * 3600 * 1000;
        const before = recsNow();
        const n = await counting(() => runPass());
        assert.isAbove(wv._wvCbIx.gen, gen0, "the generation moved");
        assert.deepEqual(n, { reads: [], rematches: ids(P1pdf, P2pdf, P3pdf) }, "all three matched again, none read");
        assert.deepEqual(reread(before), [true, true, true], "new records");
        assert.isAtLeast(wv._wvCbFullAt, Date.now() - 60000, "the last full match is now");
        const again = recsNow();
        await runPass();
        assert.deepEqual(reread(again), [false, false, false], "the next pass reads nothing");
    });

    // Review of M1 (2026-11-21): a re-match put its record in memory only -- its shard was never
    // marked for writing -- so a library change's new match was gone after a restart, and after
    // the weekly match the records kept the old generation on disk: matched again at every start.
    it("a library change's and the week's re-matches are kept on disk: a fresh load has the new match and the new generation, and the next start matches nothing again", async function () {
        const shardOf = async (att) => {
            await wv._wvCbFlush();
            const p = PathUtils.join(cbDir(), "shard-" + String(L.wvCbShardOf(att, 32)).padStart(2, "0") + ".json");
            return JSON.parse(await IOUtils.readUTF8(p)).recs[String(att)];
        };
        const vTitle = "Rim instability of retracting liquid sheets at low Weber number";
        const V = made.find(it => it.getField && it.getField("title") === vTitle);
        assert.ok(V, "fixture: V, added by an earlier case");
        assert.deepEqual(citers(V), [P2pdf.id], "fixture: V cited by P2");
        // The disk as memory first (P2's shard written now), then a change only a re-match sees.
        wv._wvCbDirty(P2pdf.id);
        assert.include(JSON.stringify((await shardOf(P2pdf.id)).c), String(V.id), "on disk: P2 cites V");
        try {
            V.setField("title", "An unrelated title about granular avalanches on inclined planes");
            await V.saveTx();
            const n = await counting(() => runTargeted());
            assert.include(n.rematches, P2pdf.id, "P2 matched again from its entries");
            assert.deepEqual(citers(V), [], "in memory: V no longer cited");
            const disk = await shardOf(P2pdf.id);
            assert.deepEqual(disk.c, wv._wvCbIx.recs.get(P2pdf.id).c, "on disk: P2's new matches, as in memory");
        }
        finally {
            V.setField("title", vTitle);
            await V.saveTx();
            await runTargeted();
        }
        assert.deepEqual(citers(V), [P2pdf.id], "V cited by P2 again");
        assert.include(JSON.stringify((await shardOf(P2pdf.id)).c), String(V.id), "and so on disk");
        // The week: every record matched again in the new generation, and written so.
        wv._wvCbFullAt = Date.now() - 8 * 24 * 3600 * 1000;
        await runPass();
        const gen = wv._wvCbIx.gen;
        for (const a of [P1pdf, P2pdf, P3pdf]) assert.equal((await shardOf(a.id)).g, gen, "on disk in generation " + gen + ": " + a.id);
        await wv._wvCbFlushSigs();
        // A fresh start: the records back from disk; the next pass matches nothing again.
        wv._wvCbIx = null;
        await wv._wvCbLoad();
        assert.equal(wv._wvCbIx.gen, gen, "the generation read back");
        assert.deepEqual(recsNow().map(r => r.g), [gen, gen, gen], "every record of it");
        assert.deepEqual(citers(V), [P2pdf.id], "V's citer read back");
        const n2 = await counting(() => runPass());
        assert.deepEqual(n2, { reads: [], rematches: [] }, "the next start matches nothing again");
    });

    // Review of M1 (2026-11-21): a record without a filter is matched again by every library
    // change (it cannot be told), but without its filter made, so it never got one back.
    it("a record whose filter is gone: the next library change matches it again and makes its filter again", async function () {
        await wv._wvCbFlush();
        const fpath = PathUtils.join(cbDir(), "filter-" + String(L.wvCbShardOf(P3pdf.id, 128)).padStart(3, "0") + ".json");
        const fdoc = JSON.parse(await IOUtils.readUTF8(fpath));
        assert.ok(fdoc.f[String(P3pdf.id)], "fixture: P3's filter");
        delete fdoc.f[String(P3pdf.id)];
        await IOUtils.writeUTF8(fpath, JSON.stringify(fdoc));
        const T = await article({ title: "Granular collapse of a column of glass beads in water", date: "2013", _first: "Ibarra" });
        made.push(T);
        const n = await counting(() => runTargeted());
        assert.include(n.rematches, P3pdf.id, "P3, with no filter, matched again");
        await wv._wvCbFlush();
        const back = JSON.parse(await IOUtils.readUTF8(fpath));
        assert.ok(back.f[String(P3pdf.id)], "its filter made again");
        assert.isTrue(L.wvCbMayCite(L.wvCbFilterDecode(back.f[String(P3pdf.id)]), L.wvCbItemKeys(wv._wvRefsIx.items.get(Y.id))), "and it lets Y through");
    });

    // Review of M1 (2026-11-21): a full text whose read threw left an empty list under its file's
    // stamp, trusted until the file changed; a structure cache's, the full text under its stamp.
    it("a cache whose read throws: no entries kept, no stamp, its matches kept meanwhile; the next pass reads it and stores its entries", async function () {
        wvT.method("_wvCbStamp");
        wvT.method("_wvCbEntPath");
        const ix = wv._wvCbIx;
        const proto = Object.getPrototypeOf(wv);
        const sdtNow = ix.recs.get(P1pdf.id).src === "sdt";
        const fails = new Set([P2pdf.id].concat(sdtNow ? [P1pdf.id] : []));
        const citedX = citers(X);
        // Each cache "moved" for this pass: a stamp that differs (so the pass reads it), a path that throws.
        wv._wvCbStamp = async function (c, ...rest) {
            const r = await proto._wvCbStamp.call(this, c, ...rest);
            return fails.has(c.id) ? Object.assign({}, r, { s: r.s + ":moved", path: r.path + ".gone" }) : r;
        };
        let n;
        try { n = await counting(() => runPass()); }
        finally { delete wv._wvCbStamp; }
        assert.includeMembers(n.reads, Array.from(fails), "tried");
        for (const id of fails) {
            const rec = ix.recs.get(id);
            assert.strictEqual(rec.s, "", "no stamp: read again next time (" + id + ", " + rec.s + ")");
            const ent = await L.wvStoreRead(wv._wvCbEntPath(id), { decompress: true });
            assert.isFalse(ent.status === "ok" && /:moved$/.test(String(ent.doc.s)), "no entries kept under the stamp that failed (" + (ent.doc && ent.doc.s) + ")");
        }
        assert.deepEqual(citers(X), citedX, "the matches kept meanwhile");
        // The next pass: read, entries stored under the real stamp.
        n = await counting(() => runPass());
        assert.includeMembers(n.reads, Array.from(fails), "read again");
        for (const id of fails) {
            const rec = ix.recs.get(id);
            assert.notEqual(rec.s, "", "stamped");
            const ent = await L.wvStoreRead(wv._wvCbEntPath(id), { decompress: true });
            assert.equal(ent.status, "ok", "its entries stored");
            assert.equal(ent.doc.s, rec.s, "under its stamp");
            assert.isAbove(ent.doc.x.length, 0, "not empty");
        }
        assert.deepEqual(citers(X), citedX, "the same answers");
    });

    it("a corrupt entries file: that PDF read again, its file written again; a record shard that does not parse: its PDFs matched again from their entries", async function () {
        wvT.method("_wvCbEntPath");
        const ep = wv._wvCbEntPath(P2pdf.id);
        await L.wvStoreChain(ep);
        await IOUtils.writeUTF8(ep, "not mozlz4 at all");
        // A full match: every record matched again, P2's from a file that does not decompress.
        wv._wvCbFullAt = Date.now() - 8 * 24 * 3600 * 1000;
        let n = await counting(() => runPass());
        assert.deepEqual(n, { reads: [P2pdf.id], rematches: ids(P1pdf, P3pdf) }, "P2 read, the others matched again");
        const back = await L.wvStoreRead(ep, { decompress: true });
        assert.equal(back.status, "ok", "P2's entries written again");
        assert.equal(back.doc.s, wv._wvCbIx.recs.get(P2pdf.id).s);
        // P3's record shard garbled: moved aside on load, its records not in memory.
        await wv._wvCbFlush();
        const sp = PathUtils.join(cbDir(), "shard-" + String(L.wvCbShardOf(P3pdf.id, 32)).padStart(2, "0") + ".json");
        await L.wvStoreChain(sp);
        await IOUtils.writeUTF8(sp, "{ not json");
        wv._wvCbIx = null;
        await wv._wvCbLoad();
        assert.notOk(wv._wvCbIx.recs.has(P3pdf.id), "P3's record lost with its shard");
        n = await counting(() => runPass());
        assert.include(n.rematches, P3pdf.id, "P3 matched again from its entries");
        assert.notInclude(n.reads, P3pdf.id, "never read");
        assert.include(citers(Y), P3pdf.id, "Y: cited by P3 again");
        for (const f of await IOUtils.getChildren(cbDir())) if (f.includes(".corrupt-")) { try { await IOUtils.remove(f); } catch (e) {} }
    });

    it("the index is kept on disk in small shards through the store; a fresh load reads it back", async function () {
        await wv._wvCbFlush();
        const dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "cited-by");
        const files = (await IOUtils.getChildren(dir)).map(p => PathUtils.filename(p)).filter(n => /^shard-\d\d\.json$/.test(n));
        assert.isAtLeast(files.length, 1, "shards written: " + files.join(", "));
        const shard = "shard-" + String(L.wvCbShardOf(P1pdf.id, 32)).padStart(2, "0") + ".json";
        const doc = JSON.parse(await IOUtils.readUTF8(PathUtils.join(dir, shard)));
        assert.ok(doc.recs[String(P1pdf.id)], "P1's record in its shard");
        // Its filter in a file of its own, never in memory: it names X's keys and not U's.
        const ff = "filter-" + String(L.wvCbShardOf(P1pdf.id, 128)).padStart(3, "0") + ".json";
        const fdoc = JSON.parse(await IOUtils.readUTF8(PathUtils.join(dir, ff)));
        const filt = L.wvCbFilterDecode(fdoc.f[String(P1pdf.id)]);
        assert.ok(filt, "P1's filter in " + ff);
        assert.isTrue(L.wvCbMayCite(filt, L.wvCbItemKeys(wv._wvRefsIx.items.get(X.id))), "it lets X through");
        assert.isFalse(L.wvCbMayCite(filt, L.wvCbItemKeys({ title: "Thermal fatigue of ceramic turbine blades in marine engines", ct: "thermalfatigueofceramicturbinebladesinmarineengines", dois: [], first: "okonkwo", year: "2011" })), "not an item it does not cite");
        const was = wv._wvCbIx;
        wv._wvCbIx = null;
        try {
            const ix = await wv._wvCbLoad();
            assert.deepEqual(L.wvCbCiters(ix, X.id).sort((a, b) => a - b), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "the same answers");
        }
        finally { if (!wv._wvCbIx) wv._wvCbIx = was; }
    });

    it("without Zotero's structure data (a Zotero that has none): every PDF is read from its full text, the answers stay", async function () {
        const orig = wv._wvCbSdtUsable;
        wv._wvCbSdtUsable = () => null;
        try {
            const ix = wv._wvCbIx;
            for (const a of [P1pdf, P2pdf, P3pdf]) { const r = ix.recs.get(a.id); if (r) r.s = "stale"; }
            await runPass();
            assert.equal(ix.recs.get(P1pdf.id).src, "ft", "P1 from its full text");
            assert.deepEqual(citers(X), [P1pdf.id, P2pdf.id].sort((a, b) => a - b));
            assert.deepEqual(citers(Y), [P1pdf.id, P3pdf.id].sort((a, b) => a - b));
        }
        finally {
            wv._wvCbSdtUsable = orig;
            for (const a of [P1pdf]) { const r = wv._wvCbIx.recs.get(a.id); if (r) r.s = "stale"; }
            await runPass();
        }
    });

    // ---- the section ----

    const libDet = () => Array.from(win.document.querySelectorAll("item-details")).find(d => (/** @type {any} */ (d).tabType === "library" || d.closest("#zotero-item-pane")) && d.getBoundingClientRect().width > 0);
    const libSec = () => { const d = libDet(); return d ? /** @type {any} */ (d.querySelector('item-pane-custom-section[data-pane$="weavero-citedby"]')) : null; };
    const libRows = () => { const s = libSec(); return s ? Array.from(s.querySelectorAll(".wv-cb-row")) : []; };

    // MJT 2026-11-20, "Implement B for the references icons": a page with the links
    // glyphs' corner arrow, INTO it for Cited by, OUT of it for References.
    it("the section's icon: a page with the arrow pointing in; References' points out", function () {
        const ARROW_IN = "M22,22L14.5,14.5M14.5,21V14.5H21", ARROW_OUT = "M14.5,14.5L22,22M22,15.5V22H15.5", PAGE = "M3,2H11.5L17,7.5V20H3Z";
        const btn = (pane) => win.document.querySelector('item-pane-sidenav .btn[data-pane$="weavero-' + pane + '"]');
        const icon = (pane) => { const b = btn(pane); return b ? decodeURIComponent(String(b.getAttribute("style") || "")) : ""; };
        const cb = icon("citedby"), refs = icon("references");
        assert.ok(cb.includes(PAGE) && cb.includes(ARROW_IN) && !cb.includes(ARROW_OUT), "Cited by: the page, the arrow in (" + cb.slice(0, 80) + ")");
        assert.ok(refs.includes(PAGE) && refs.includes(ARROW_OUT) && !refs.includes(ARROW_IN), "References: the page, the arrow out (" + refs.slice(0, 80) + ")");
    });

    // Review of M1 (2026-11-21): the fingerprints hashed a few functions' own text, so a
    // change made in one of their helpers neither read the PDFs again nor matched them
    // again. The build now hashes lib/ref-match.ts and lib/ref-list.ts whole into them.
    it("the fingerprints take the matcher's and the list reader's modules whole: the build set both source hashes", function () {
        const h = wv._wvCbSrcHashes();
        assert.match(h.match, /^[0-9a-f]{16}$/, "ref-match.ts hashed by the build: " + JSON.stringify(h.match));
        assert.match(h.list, /^[0-9a-f]{16}$/, "ref-list.ts hashed by the build: " + JSON.stringify(h.list));
        assert.notEqual(h.match, h.list);
    });

    it("where a citing paper was published, as its row names it: the journal, the book, the proceedings, the university, the repository", function () {
        // Unsaved items: getField reads them as they are, nothing is written.
        const make = (type, fields) => { const it = new Zotero.Item(type); for (const k of Object.keys(fields)) it.setField(k, fields[k]); return it; };
        assert.equal(wv._wvCbPubOf(make("journalArticle", { publicationTitle: "Journal of Fluid Mechanics", publisher: "Cambridge University Press" })), "Journal of Fluid Mechanics", "the journal, not its publisher");
        assert.equal(wv._wvCbPubOf(make("bookSection", { bookTitle: "Drops and Bubbles" })), "Drops and Bubbles", "a chapter: its book");
        assert.equal(wv._wvCbPubOf(make("conferencePaper", { proceedingsTitle: "Proc. ILASS-Europe" })), "Proc. ILASS-Europe", "a paper: its proceedings");
        assert.equal(wv._wvCbPubOf(make("thesis", { university: "Institut Polytechnique de Paris" })), "Institut Polytechnique de Paris", "a thesis: its university");
        if (Zotero.ItemTypes.getID("preprint")) assert.equal(wv._wvCbPubOf(make("preprint", { repository: "arXiv" })), "arXiv", "a preprint: its repository");
        assert.equal(wv._wvCbPubOf(make("journalArticle", {})), "", "none known: nothing");
    });

    it("the library's item pane: \"2 Citing Papers\", a row per citing paper, newest first, with Zotero's icon and title; hidden for an item nobody cites", async function () {
        await win.ZoteroPane.selectItem(Y.id);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 2, 15000, 100),
            "Y's section (section " + !!libSec() + ", hidden " + (libSec() && libSec().hidden) + ", rows " + libRows().length + ")");
        const sec = libSec();
        const cs = sec.querySelector("collapsible-section");
        assert.deepEqual(JSON.parse(cs.dataset.l10nArgs), { state: "counted", count: 2 });
        // Zotero's count style, as "20 References" (MJT 2026-11-20, one design for the references surfaces).
        assert.ok(await wvT.waitFor(() => (cs.getAttribute("label") || "") === "2 Citing Papers", 5000, 100), "the header: " + cs.getAttribute("label"));
        const rows = libRows();
        assert.deepEqual(rows.map(r => Number(r.getAttribute("data-wv-cb-item"))), [P1.id, P3.id], "P1 (2024) before P3 (2023)");
        assert.include(rows[0].textContent, "WV-TEST citing paper one on drops");
        assert.include(rows[0].querySelector(".wv-cb-meta").textContent, "2024", "the year after the title");
        // MJT 2026-11-21: "I want to see also the journal where it is published" -- between the
        // author and the year, in italics; a paper with none (P3) has no empty place for it.
        assert.equal(rows[0].querySelector(".wv-cb-meta").textContent, "Tester · WV-TEST Annals of Rheotaxis · 2024");
        assert.equal(win.getComputedStyle(rows[0].querySelector(".wv-cb-pub")).fontStyle, "italic", "the journal in italics");
        assert.isNull(rows[1].querySelector(".wv-cb-pub"), "P3: no journal, no place for one");
        assert.equal(rows[1].querySelector(".wv-cb-meta").textContent, "Grouper · 2023");
        assert.ok(rows[0].querySelector(".wv-cb-icon .icon-item-type, .wv-cb-icon [data-item-type]"), "Zotero's item-type icon");
        assert.isNull(rows[0].querySelector(".wv-cb-libbadge"), "P1: in Y's library, no badge");
        assert.ok(rows[1].querySelector(".wv-cb-libbadge"), "P3: in a group, the group's badge");
        // Its corner on the icon's centre, as the References marks carry theirs (MJT 2026-11-20).
        const icR = rows[1].querySelector(".wv-cb-icon > .icon, .wv-cb-icon > [data-item-type]").getBoundingClientRect();
        const bgR = rows[1].querySelector(".wv-cb-libbadge").getBoundingClientRect();
        assert.approximately(bgR.left, icR.left + 0.4 * (icR.right - icR.left), 1, "the badge's corner 40 % across the icon");
        assert.approximately(bgR.top, icR.top + 0.3 * (icR.bottom - icR.top), 1, "and 30 % down");
        // Split from the library too, beside the library tab (citations.6, MJT 2026-11-21 "OK"):
        // the split view is on (its default).
        assert.deepEqual(Array.from(rows[0].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-cb-act")), ["tab", "split", "window", "more"], "the References rows' buttons (Show in Library in the ⋯ menu's card), Split before Window");
        // The ⋯ menu is the references' one menu: the card, its icon buttons at its foot (the
        // citation popup's design, MJT 2026-11-26), here and on a right-click.
        for (const open of [
            () => rows[0].querySelector('.wv-refs-btn[data-wv-cb-act="more"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })),
            () => rows[0].dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 300, screenY: 300 })),
        ]) {
            open();
            const m = await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 50);
            assert.ok(m, "the menu");
            assert.ok(m.querySelector(".wv-refs-card[data-wv-refs-card='" + P1.id + "']"), "P1's card");
            const btns = Array.from(m.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *")).map(c => c.getAttribute("data-wv-refs-act"));
            assert.deepEqual(btns, ["tab", "split", "window", "copy-as"], "the buttons");
            m.hidePopup();
            assert.ok(await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50), "closed");
        }
        // Z: cited by P2 since its full text changed.
        await win.ZoteroPane.selectItem(Z.id);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 1, 8000, 100), "Z: one row");
        assert.equal(Number(libRows()[0].getAttribute("data-wv-cb-item")), P2.id, "P2");
        const W2 = await article({ title: "WV-TEST an item nobody cites at all here", date: "2020", _first: "Alone" });
        made.push(W2);
        await win.ZoteroPane.selectItem(W2.id);
        await wvT.sleep(800);
        assert.ok(!libSec() || libSec().hidden, "no section for an item nobody cites");
    });

    // citations.6 (MJT 2026-11-21, "OK"): Split from the LIBRARY's rows too -- the citing PDF
    // beside the library tab through the split view's shared "beside" open, as Ctrl+Enter in the
    // items list does: the library on one side, the PDF on the other; the next row's Split puts
    // its PDF on that side (the pair's other side), the first PDF's tab kept.
    it("the library's rows: Split when the split view is on, none when off; it puts the citing PDF beside the library tab, the next row's Split takes that side", async function () {
        for (const m of ["_wvTabSplitOf", "_wvTabSplitSeparate", "_wvCbSecRefreshAll"]) wvT.method(m);
        const ZT = win.Zotero_Tabs;
        const acts = (r) => Array.from(r.querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-cb-act"));
        const tabOf = (att) => ZT._tabs.find(t => t && t.data && t.data.itemID === att.id && String(t.type).startsWith("reader")) || null;
        // The rows of the library's pane, also while it is a side of a split.
        const rowOf = (it) => win.document.querySelector('#zotero-item-pane item-pane-custom-section[data-pane$="weavero-citedby"] .wv-cb-row[data-wv-cb-item="' + it.id + '"]');
        const press = (it) => rowOf(it).querySelector('.wv-refs-btn[data-wv-cb-act="split"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const pairOf = (att) => { const t = tabOf(att); const s = t && wv._wvTabSplitOf(win, "zotero-pane"); return s && !s.dock && !s.picker && [s.left, s.right].includes("zotero-pane") && [s.left, s.right].includes(t.id) ? s : null; };
        ZT.select("zotero-pane");
        await win.ZoteroPane.selectItem(Y.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 2, 15000, 100), "Y's two rows");
        try {
            for (const r of libRows()) assert.deepEqual(acts(r), ["tab", "split", "window", "more"], "split view on: Split before Window");
            await wvT.withPref("weavero.enableSplitView", false, async () => {
                wv._wvCbSecRefreshAll();
                assert.ok(await wvT.waitFor(() => libRows().length === 2 && libRows().every(r => acts(r).join() === "tab,window,more"), 5000, 50),
                    "split view off: no Split (" + libRows().map(r => acts(r).join()).join(" | ") + ")");
            });
            wv._wvCbSecRefreshAll();
            assert.ok(await wvT.waitFor(() => libRows().length === 2 && acts(libRows()[0]).includes("split"), 5000, 50), "on again: Split back");
            press(P1);
            const s1 = await wvT.waitFor(() => pairOf(P1pdf), 15000, 100);
            assert.ok(s1, "a split of the library tab and P1's PDF: " + JSON.stringify(wv._wvTabSplitOf(win, "zotero-pane")));
            assert.equal(ZT.selectedID, tabOf(P1pdf).id, "the PDF's side selected");
            const t1 = tabOf(P1pdf).id;
            press(P3);
            const s2 = await wvT.waitFor(() => pairOf(P3pdf), 15000, 100);
            assert.ok(s2, "P3's PDF on the PDF side: " + JSON.stringify(wv._wvTabSplitOf(win, "zotero-pane")));
            assert.ok(ZT._tabs.some(t => t.id === t1), "P1's PDF keeps its tab");
            assert.notOk(pairOf(P1pdf), "no longer beside the library");
        }
        finally {
            try { const s = wv._wvTabSplitOf(win, "zotero-pane"); if (s && !s.dock) wv._wvTabSplitSeparate(win, s.id); } catch (e) {}
            for (const a of [P1pdf, P3pdf]) { const t = tabOf(a); if (t) { try { ZT.close(t.id); } catch (e) {} } }
            await wvT.sleep(300);
            try { ZT.select("zotero-pane"); } catch (e) {}
            try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (e) {}
        }
    });

    // MJT 2026-11-21: a paper with copies in My Library and a group showed twice.
    it("a paper with a copy in another library: ONE row -- the copy in the item's library first, \"also in\" the other -- counted once", async function () {
        wvT.method("_wvCbWorksOf");
        const P1g = await article({ title: "WV-TEST citing paper one on drops", date: "2024", _first: "Tester" }, group.libraryID);
        const P1gpdf = await importPDF("wv-cb-p1g", fixturePDF("WV-TEST citing paper one on drops", [X_ENTRY], true), P1g.id);
        try {
            await Zotero.Fulltext.indexItems([P1gpdf.id], { complete: true });
            await wv._wvRefsFlush();
            await runPass([P1gpdf.id]);
            assert.include(citers(X), P1gpdf.id, "fixture: the group's copy cites X too");
            await win.ZoteroPane.selectItem(X.id);
            assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 2 && libRows().some(r => r.hasAttribute("data-wv-cb-copies")), 15000, 100),
                "X: two rows, not three (" + libRows().length + ")");
            const cs = libSec().querySelector("collapsible-section");
            assert.equal(JSON.parse(cs.dataset.l10nArgs).count, 2, "counted once");
            const row = libRows().find(r => Number(r.getAttribute("data-wv-cb-item")) === P1.id);
            assert.ok(row, "the row is P1's: the copy in X's library");
            assert.equal(row.getAttribute("data-wv-cb-copies"), String(P1g.id), "the group's copy folded into it");
            assert.isNull(row.querySelector(".wv-cb-libbadge"), "in X's library: no badge");
            // MJT 2026-11-21: "the 'also in' information should be in a distinct format from the
            // rest of the citation" -- a line of its own under it, one chip a library with its badge.
            const line = row.querySelector(".wv-cb-libs");
            assert.ok(line, "an \"also in\" line");
            assert.isNull(row.querySelector(".wv-cb-text .wv-cb-libs, .wv-cb-text .wv-cb-lib"), "not inside the citation's text (whose 3 lines may be cut)");
            assert.equal(line.querySelector(".wv-cb-libs-label").textContent, "Also in");
            const chips = Array.from(line.querySelectorAll(".wv-cb-lib"));
            assert.equal(chips.length, 1, "one chip: the group");
            assert.equal(chips[0].querySelector(".wv-cb-lib-name").textContent, Zotero.Libraries.getName(group.libraryID));
            assert.equal(chips[0].getAttribute("data-wv-cb-lib"), String(group.libraryID));
            assert.ok(chips[0].querySelector('svg[data-wv-lib="group"]'), "the group's badge in the chip");
            assert.include(chips[0].getAttribute("title"), Zotero.Libraries.getName(group.libraryID), "its tooltip names it");
            assert.notEqual(win.getComputedStyle(chips[0]).backgroundColor, win.getComputedStyle(row).backgroundColor, "a chip, set off from the row");
            const tR = row.querySelector(".wv-cb-text").getBoundingClientRect(), lR = line.getBoundingClientRect();
            assert.isAtLeast(lR.top, tR.bottom - 0.5, "under the citation, not beside it");
        }
        finally {
            await wvT.erase(P1gpdf, P1g);
            await wv._wvRefsFlush();
        }
        assert.ok(await wvT.waitFor(() => !wv._wvCbIx.recs.has(P1gpdf.id), 5000, 50), "the copy's record dropped");
    });

    // Review of M1 (2026-11-21): "Show N more" added the next page from the list as it was
    // computed again meanwhile (a pass running), after rows drawn from the old one.
    it("Show more while the list moved under it: the rows are one list's -- none twice, none left out", async function () {
        wvT.method("_wvCbWorksOf");
        const user = Zotero.Libraries.userLibraryID;
        const C2 = await article({ title: "WV-TEST a work cited by sixty papers", date: "1995", _first: "Sixty" });
        made.push(C2);
        const reals = [];
        await Zotero.DB.executeTransaction(async () => {
            for (let i = 0; i < 61; i++) {
                const it = new Zotero.Item("journalArticle");
                it.libraryID = user;
                it.setField("title", "WV-TEST paging citing paper " + String(i).padStart(3, "0"));
                it.setField("date", String(2000 + i));
                it.setCreators([{ creatorType: "author", lastName: "Pager", firstName: "A." }]);
                await it.save();
                reals.push(it);
            }
        });
        made.push(...reals);
        await wv._wvRefsFlush();
        const rix = L.wvRefIndexNew();
        L.wvRefIndexPut(rix, { id: C2.id, lib: user, title: C2.getField("title"), date: "1995", first: "Sixty" });
        for (const it of reals) L.wvRefIndexPut(rix, { id: it.id, lib: user, title: it.getField("title"), date: it.getField("date"), first: "Pager" });
        const ix = L.wvCbIndexNew();
        const ATT = 1600000000;
        // Sixty of them cite C2; the sixty-first, the newest, only once the first page is drawn.
        for (let i = 0; i < 60; i++) L.wvCbPut(ix, ATT + i, { s: "ft:1:1", src: "ft", p: reals[i].id, l: user, g: 1, c: [[0, C2.id]] });
        const was = { ix: wv._wvCbIx, rix: wv._wvRefsIx };
        try {
            wv._wvCbIx = ix;
            wv._wvRefsIx = rix;
            wv._wvCbWorksCache = null;
            await win.ZoteroPane.selectItem(C2.id);
            assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 50, 15000, 100), "50 rows first (" + libRows().length + ")");
            assert.equal(libSec().querySelector(".wv-cb-more").textContent, "Show 10 more");
            L.wvCbPut(ix, ATT + 60, { s: "ft:1:1", src: "ft", p: reals[60].id, l: user, g: 1, c: [[0, C2.id]] });
            libSec().querySelector(".wv-cb-more").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            const want = wv._wvCbWorksOf(C2).map(w => w.ids[0]);
            assert.lengthOf(want, 61, "the list now");
            assert.deepEqual(libRows().map(r => Number(r.getAttribute("data-wv-cb-item"))), want, "every row of the list now, once each, in its order");
            assert.notOk(libSec().querySelector(".wv-cb-more"), "nothing left to show");
        }
        finally {
            wv._wvCbIx = was.ix;
            wv._wvRefsIx = was.rix;
            wv._wvCbWorksCache = null;
            try { await win.ZoteroPane.selectItem(Y.id); } catch (e) {}
        }
    });

    // Plan §0's bounds (MJT 2026-11-21: "Some papers could be cited many thousands times ...
    // prevent these cases from breaking or slowing down Zotero"): his most cited work has 1,308
    // citing PDFs; the stress fixture, 20,000.
    it("a work cited by 20,000 PDFs: its works in idle slices, its first 50 rows drawn and each next page of 100 within budget; the header counts them all", async function () {
        this.timeout(240000);
        wvT.method("_wvCbWorksOf");
        wvT.method("_wvCbSecShowMore");
        const N = 20000, REAL = 160, WORST = 1308, user = Zotero.Libraries.userLibraryID;
        // Budgets (ms): a slice of the works' computation at most the plan's 20 (best of two runs: a
        // GC may land in one); the drawing, a sanity bound for a loaded runner (measured on Zotero 11:
        // 5.1 ms for 50 rows, 13.5 ms for 100 more -- the citations log, M1).
        const BUDGET = { slice: 20, worst: 20, build: 50, page: 60 };
        const C = await article({ title: "WV-TEST the most cited work of the stress fixture", date: "1990", _first: "Famous" });
        made.push(C);
        // The first rows are real papers (Zotero draws their icon and title); the others are in the indexes only.
        const reals = [];
        await Zotero.DB.executeTransaction(async () => {
            for (let i = 0; i < REAL; i++) {
                const it = new Zotero.Item("journalArticle");
                it.libraryID = user;
                it.setField("title", "WV-TEST stress citing paper " + String(i).padStart(4, "0"));
                it.setField("date", "2099");
                it.setCreators([{ creatorType: "author", lastName: "Stress", firstName: "A." }]);
                await it.save();
                reals.push(it);
            }
        });
        made.push(...reals);
        await wv._wvRefsFlush();
        const rix = L.wvRefIndexNew();
        L.wvRefIndexPut(rix, { id: C.id, lib: user, title: C.getField("title"), date: "1990", first: "Famous" });
        for (const it of reals) L.wvRefIndexPut(rix, { id: it.id, lib: user, title: it.getField("title"), date: "2099", first: "Stress" });
        const ix = L.wvCbIndexNew();
        const FAKE = 1500000000;
        let twins = 0;
        for (let i = 0; i < N; i++) {
            const pid = i < REAL ? reals[i].id : FAKE + i;
            if (i >= REAL) {
                // Every tenth paper has a copy in a group (the same DOI): one row for the two.
                const twin = i % 10 === 0 && i - 1 >= REAL;
                if (twin) twins++;
                L.wvRefIndexPut(rix, { id: pid, lib: twin ? user + 100000 : user, title: "Synthetic citing paper number " + i, DOI: "10.9999/stress." + (twin ? i - 1 : i),
                    date: String(1950 + i % 140), first: "Synth" + (i % 500) });
            }
            // MJT's most cited work (1,308 citing PDFs) among them: computed at once.
            L.wvCbPut(ix, FAKE + 100000 + i, { s: "ft:1:1", src: "ft", p: pid, l: user, g: 1, c: i < WORST ? [[0, C.id], [1, FAKE + 50000]] : [[0, C.id]] });
        }
        const was = { ix: wv._wvCbIx, rix: wv._wvRefsIx };
        const now = () => win.performance.now();
        const timing = {};
        try {
            wv._wvCbIx = ix;
            wv._wvRefsIx = rix;
            wv._wvCbWorksCache = null;
            // MJT's worst: at once, within a slice's budget.
            let t = now();
            const worst = wv._wvCbWorksOf({ id: FAKE + 50000, libraryID: user });
            timing.worst = now() - t;
            assert.lengthOf(worst, WORST - Math.floor((WORST - 1 - REAL) / 10), "1,308 citing PDFs at once");
            // 20,000: in idle slices once the item is shown; the section comes up when they are done.
            assert.isNull(wv._wvCbWorksOf(C), "not computed at once");
            await win.ZoteroPane.selectItem(C.id);
            const done = () => wv._wvCbWorksStat && wv._wvCbWorksStat.item === C.id && wv._wvCbWorksStat.done;
            assert.ok(await wvT.waitFor(done, 30000, 50), "computed in slices: " + JSON.stringify(wv._wvCbWorksStat));
            const st1 = Object.assign({}, wv._wvCbWorksStat);
            const works = wv._wvCbWorksOf(C);
            assert.lengthOf(works, N - twins, "a row per work: " + N + " PDFs, " + twins + " of them a copy's");
            assert.deepEqual(works.slice(0, REAL).map(w => w.ids[0]), reals.map(r => r.id), "newest first, then by title");
            assert.ok(works.some(w => w.ids.length === 2), "the copies folded");
            t = now();
            assert.strictEqual(wv._wvCbWorksOf(C), works, "cached for the item and the indexes' state");
            timing.cached = now() - t;
            assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 50, 20000, 100), "50 rows first (" + libRows().length + ")");
            const sec = libSec();
            assert.equal(JSON.parse(sec.querySelector("collapsible-section").dataset.l10nArgs).count, N - twins, "the header counts every work");
            assert.equal(sec.querySelector(".wv-cb-more").textContent, "Show 100 more", "then a Show more row");
            // The section's build timed alone (its signature cleared: all drawn again).
            const host = sec.querySelector(".wv-cb-sec");
            host.removeAttribute("data-wv-cb-sig");
            t = now();
            wv._wvCbSecBuild(host.parentNode, win.document, C, works);
            timing.build = now() - t;
            assert.equal(libRows().length, 50, "50 rows again");
            const proto = Object.getPrototypeOf(wv);
            wv._wvCbSecShowMore = function (...args) { const t1 = now(); const r = proto._wvCbSecShowMore.apply(this, args); timing.page = now() - t1; return r; };
            try { sec.querySelector(".wv-cb-more").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); }
            finally { delete wv._wvCbSecShowMore; }
            assert.equal(libRows().length, 150, "a hundred more");
            assert.equal(sec.querySelector(".wv-cb-more").textContent, "Show 100 more");
            // Once more from nothing, the item still shown: the longest slice of the better run.
            wv._wvCbWorksCache = null;
            wv._wvCbWorksStat = null;
            assert.isNull(wv._wvCbWorksOf(C));
            assert.ok(await wvT.waitFor(done, 30000, 50), "computed again: " + JSON.stringify(wv._wvCbWorksStat));
            const st2 = Object.assign({}, wv._wvCbWorksStat);
            // A window that never calls back (closed while the computation waits on it): it
            // still ends, on the sandbox clock -- never "running" for good.
            wv._wvCbWorksCache = null;
            wv._wvCbWorksStat = null;
            // Put back, never deleted: Window is a WebIDL [Global], its operations are the
            // window's OWN properties, so a delete took requestIdleCallback away for the rest
            // of the run -- Zotero's note editor and item pane threw, Zotero.crash() (every
            // spec after this one in a picked set, 2026-11-21).
            const ric = win.requestIdleCallback;
            win.requestIdleCallback = () => 0;
            try {
                assert.isNull(wv._wvCbWorksOf(C));
                assert.ok(await wvT.waitFor(done, 30000, 50), "computed without the window's idle callbacks: " + JSON.stringify(wv._wvCbWorksStat));
            }
            finally { win.requestIdleCallback = ric; }
            assert.strictEqual(typeof win.requestIdleCallback, "function", "the window's own requestIdleCallback back");
            timing.slices = [st1.slices, st2.slices];
            timing.workMs = [st1.workMs, st2.workMs];
            timing.slice = Math.min(st1.maxSliceMs, st2.maxSliceMs);
            timing.slicesMax = [st1.maxSliceMs, st2.maxSliceMs];
            assert.isAtLeast(Math.min(st1.slices, st2.slices), 3, "several slices");
        }
        finally {
            wv._wvCbIx = was.ix;
            wv._wvRefsIx = was.rix;
            wv._wvCbWorksCache = null;
            try { await win.ZoteroPane.selectItem(Y.id); } catch (e) {}
        }
        Zotero.debug("[wv-test] cited-by stress (ms): " + JSON.stringify(timing));
        try { await IOUtils.writeUTF8(PathUtils.join("D:\\tmp", "wv-cb-stress-" + Services.appinfo.platformVersion + ".json"), JSON.stringify(timing)); } catch (e) {}
        assert.isAtMost(timing.slice, BUDGET.slice, "the longest slice of the works of 20,000 citing PDFs: " + JSON.stringify(timing));
        assert.isAtMost(timing.worst, BUDGET.worst, "MJT's worst, 1,308 PDFs, at once: " + timing.worst.toFixed(1) + " ms");
        assert.isAtMost(timing.build, BUDGET.build, "50 rows drawn: " + timing.build.toFixed(1) + " ms");
        assert.isAtMost(timing.page, BUDGET.page, "a page of 100 more: " + timing.page.toFixed(1) + " ms");
    });

    it("a click on a row opens the citing paper at its reference to the item, the entry marked", async function () {
        if (!sdtThere()) this.skip();   // the entry is found in the reader's structure data: none in this Zotero (the PDF opens, unmarked)
        await win.ZoteroPane.selectItem(X.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 2, 15000, 100), "X's rows");
        const row = libRows().find(r => Number(r.getAttribute("data-wv-cb-item")) === P1.id);
        row.querySelector(".wv-cb-text").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const reader = await wvT.waitFor(() => Zotero.Reader._readers.find(r => r.itemID === P1pdf.id && r._window === win), 20000, 100);
        assert.ok(reader, "P1's PDF opened in a tab");
        assert.ok(await wvT.waitFor(() => win.Zotero_Tabs.selectedID === reader.tabID, 10000, 100), "and selected");
        const pv = await wvT.waitFor(() => { try { const v = Cu.waiveXrays(reader._internalReader)._primaryView; return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount === 2 ? v : null; } catch (e) { return null; } }, 30000);
        assert.ok(pv, "its view");
        const mark = await wvT.waitFor(() => pv._iframeWindow.document.querySelector(".pdfViewer > .wv-refs-entryhl"), 20000, 100);
        assert.ok(mark, "the entry marked");
        // In view: its first box inside the view's container (whether pdf.js calls page 1 or 2
        // the current one depends on the view's height -- the entry is near the top of page 2).
        const doc = pv._iframeWindow.document;
        const inView = () => {
            const b = doc.querySelector(".wv-refs-entryhl-box"), cont = doc.getElementById("viewerContainer");
            if (!b || !cont) return false;
            const r = b.getBoundingClientRect(), c = cont.getBoundingClientRect();
            return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
        };
        assert.ok(await wvT.waitFor(inView, 5000, 50), "the entry in view");
        wvT.closeReaderTab(reader);
        await wvT.sleep(300);
        win.Zotero_Tabs.select("zotero-pane");
    });

    it("the reader's item pane: the paper open in a tab shows who cites it, with Split there", async function () {
        const reader = await wvT.openReaderTab(Xpdf.id);
        assert.ok(reader, "X's PDF opened");
        const cpWas = !!win.ZoteroContextPane.collapsed;
        try {
            win.Zotero_Tabs.select(reader.tabID);
            win.ZoteroContextPane.collapsed = false;
            const det = () => win.document.querySelector('#zotero-context-pane item-details[data-tab-id="' + reader.tabID + '"]');
            const sec = () => { const d = det(); return d ? /** @type {any} */ (d.querySelector('item-pane-custom-section[data-pane$="weavero-citedby"]')) : null; };
            const rows = () => { const s = sec(); return s ? Array.from(s.querySelectorAll(".wv-cb-row")) : []; };
            const d = await wvT.waitFor(() => det(), 10000, 100);
            assert.ok(d, "the reader tab's item pane");
            assert.ok(await wvT.waitFor(() => sec() && !sec().hidden, 10000, 100), "the Cited by section in it");
            try { await d.scrollToPane(wv._wvCbSecKey, "instant"); } catch (e) {}
            assert.ok(await wvT.waitFor(() => rows().length === 2, 10000, 100), "X's two citing papers (" + rows().length + ")");
            assert.deepEqual(Array.from(rows()[0].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-cb-act")), ["tab", "split", "window", "more"], "Split beside this paper, before Window");
        }
        finally {
            try { win.ZoteroContextPane.collapsed = cpWas; } catch (e) {}
            wvT.closeReaderTab(reader);
            await wvT.sleep(300);
            win.Zotero_Tabs.select("zotero-pane");
        }
    });

    it("the setting: off, the section goes and no pass runs; on, it comes back", async function () {
        await win.ZoteroPane.selectItem(Y.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 2, 15000, 100), "fixture: Y's rows");
        await wvT.withPref("weavero.referencesCitedBy", false, async () => {
            assert.ok(await wvT.waitFor(() => !wv._wvCbSecKey && !libSec(), 8000, 100), "the section unregistered");
            assert.isFalse(wv._wvCbOn());
            const st0 = wv._wvCbStats().passes;
            await wv._wvCbPass("spec-off");
            assert.equal(wv._wvCbStats().passes, st0, "no pass while off");
        });
        assert.ok(await wvT.waitFor(() => libSec() && libRows().length === 2, 15000, 100), "back with its rows");
        try { L.wvClearTimeout(wv._wvCbPassT); wv._wvCbPassT = null; } catch (e) {}
    });

    it("a citing PDF erased leaves the index at once", async function () {
        const pdf = P3pdf;
        await pdf.eraseTx();
        assert.ok(await wvT.waitFor(() => !wv._wvCbIx.recs.has(pdf.id), 5000, 50), "P3's record dropped");
        assert.deepEqual(citers(Y), [P1pdf.id], "Y: P1 alone now");
    });

    it("destroy gives everything back: the section, the item observer, the timers, the index in memory; init brings them back", async function () {
        wv._wvCbDestroy();
        try {
            assert.notOk(wv._wvCbSecKey, "the section unregistered");
            assert.notOk(/** @type {any} */ (Zotero)._wvCbObsID, "the item observer gone");
            assert.notOk(wv._wvCbIx, "the index dropped from memory");
            assert.notOk(wv._wvCbPassT, "no pass pending");
        }
        finally {
            wv._wvCbInit();
            try { L.wvClearTimeout(wv._wvCbPassT); wv._wvCbPassT = null; } catch (e) {}
        }
        assert.ok(await wvT.waitFor(() => wv._wvCbSecKey, 5000, 100), "registered again");
        assert.ok(/** @type {any} */ (Zotero)._wvCbObsID, "observing again");
        const ix = await wv._wvCbLoad();
        assert.deepEqual(L.wvCbCiters(ix, X.id).sort((a, b) => a - b), [P1pdf.id, P2pdf.id].sort((a, b) => a - b), "the index back from disk");
    });

    it("nothing written to any library over the whole spec, the shards aside (Weavero's own folder)", async function () {
        // The items this spec made since (W, W2) and the erased P3 PDF aside: the fixture's own rows unchanged.
        const now = await fingerprint();
        const keep = (s) => s.split("|").filter(p => [X, Y, P1, P2].some(it => p.startsWith(it.id + ":"))).join("|");
        assert.equal(keep(now), keep(fpBefore));
    });
});
