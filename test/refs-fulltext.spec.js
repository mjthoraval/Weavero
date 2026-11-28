/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils, wvT */

// The References section of the LIBRARY's item pane for a PDF never opened (citations.6, MJT
// 2026-11-21, "Ok"): until then it showed only when Zotero's structure cache (`.zotero-sdt-cache`,
// written when Zotero's reader opens the PDF) was there -- 107 of MJT's 18,787 PDFs. Since M1 the
// Cited by index keeps every PDF's entries as it read them from the full text
// (cited-by/entries/NN/<att>.jsonlz4). With no structure cache, the section now shows those
// entries, matched and drawn as usual, with a muted line saying the list comes from the full text
// and that the PDF opened gives the precise one; nothing of it reaches the PDF (no positions, no
// marks). Only a file whose stamp is the PDF's full-text cache NOW is read; a stale or missing one
// is no list (hidden, as before), and the section comes up when the index writes the file again
// (a redraw on the write, no polling). Opened, the PDF gets Zotero's structure cache, and the
// section switches to the precise list.
//
// The fixture: X (with a PDF) and Y (without) in My Library; Q, a paper whose PDF lists [1] X,
// [2] Y, [3] W (a work not in the library), never opened -- its full text indexed by Zotero (its
// own cache file), its entries stored by a Cited by pass. The PDF is written here (Helvetica, two
// pages, the list on page 2), as test/cited-by.spec.js builds its fixture.

describe("Weavero — References from the full text (a PDF never opened)", function () {
    this.timeout(240000);
    const Cu = Components.utils;
    const made = [];
    let wv, win, ZT, X, Xpdf, Y, Q, Qpdf, reader = null;
    let fpBefore = null;
    const NOTE = "From the PDF’s full text. Open the PDF for the precise list.";

    const X_ENTRY = ["Adams, J., Brown, K. & Clark, L. 2016 Drop impact on a heated plate in a vacuum chamber.", "J. Test Mech. 812, 101-120."];
    const Y_ENTRY = ["Davis, M. & Evans, P. 2019 Bubble entrapment beneath falling droplets of viscous oil.", "Phys. Rev. Test 4, 053601."];
    const W_ENTRY = ["Quinn, R. 2017 Capillary waves on a stretched liquid sheet at high speed.", "J. Test Mech. 820, 1-20."];

    function fixturePDF(title, entries) {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        let p1 = line(72, 740, 14, title);
        let y = 700;
        for (const t of ["We study drops and films, as others did before us [1, 2].", "The experiments follow the methods of earlier work [3].",
            "Our results agree with the literature cited below."]) { p1 += line(72, y, 10, t); y -= 14; }
        let p2 = line(72, 740, 12, "References");
        y = 715;
        entries.forEach(([a, c], i) => { p2 += line(72, y, 9, "[" + (i + 1) + "]"); p2 += line(90, y, 9, a); y -= 11; p2 += line(90, y, 9, c); y -= 15; });
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
    async function article(fields) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = Zotero.Libraries.userLibraryID;
        for (const k of Object.keys(fields)) if (!k.startsWith("_")) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: fields._first || "Nobody", firstName: "A." }]);
        await it.saveTx();
        return it;
    }
    async function fingerprint() {
        const rows = await Zotero.DB.queryAsync("SELECT itemID, version, dateModified, synced FROM items ORDER BY itemID");
        const parts = rows.map(r => r.itemID + ":" + r.version + ":" + r.dateModified + ":" + r.synced);
        for (const t of ["itemData", "itemTags", "itemRelations", "itemNotes", "itemCreators", "collectionItems"]) {
            parts.push(t + "=" + await Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM " + t));
        }
        return parts.join("|");
    }
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
    const cacheOf = (att, name) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, name);
    const sdtThere = () => !!(/** @type {any} */ (Zotero).SDT && wv._wvCbSdtUsable());
    /** The Cited by pass's state, for a failure's message. */
    const cbState = () => { try { return JSON.stringify(Object.assign({}, wv._wvCbStatsObj(), { waits: wv._wvCbIdles ? wv._wvCbIdles.size : null })); } catch (e) { return "stats err: " + e; } };
    /** One Cited by pass for PDF `att` alone (as test/cited-by.spec.js runs its own). Every wait
     *  asserted and the pass bounded (dev.99 triage, 2026-11-27): a pass that never ended (two
     *  pacing waits shared one handle, cited-by.ts _wvCbPace) took the hook's whole 240 s with no
     *  word of why, and left _wvCbRunning true for the specs after it (sdt-clean). */
    async function passFor(att) {
        assert.ok(await wvT.waitFor(() => !wv._wvCbRunning, 120000, 50), "fixture: no Cited by pass under way before this one: " + cbState());
        const r = await Promise.race([wv._wvCbPass("spec", [att.id]).then(() => "ended"), wvT.sleep(60000).then(() => "stuck")]);
        if (r !== "ended") assert.fail("fixture: the Cited by pass for " + att.id + " did not end in 60 s: " + cbState() + " " + await diag());
        assert.ok(await wvT.waitFor(() => !wv._wvCbRunning, 60000, 50), "fixture: the pass over: " + cbState());
    }
    const libDet = () => Array.from(win.document.querySelectorAll("item-details")).find(d => (/** @type {any} */ (d).tabType === "library" || d.closest("#zotero-item-pane")) && d.getBoundingClientRect().width > 0);
    const libSec = () => { const d = libDet(); return d ? /** @type {any} */ (d.querySelector('item-pane-custom-section[data-pane$="weavero-references"]')) : null; };
    const libRows = () => { const s = libSec(); return s ? Array.from(s.querySelectorAll(".wv-refs-sec-row")) : []; };
    const note = () => { const s = libSec(); return s ? s.querySelector(".wv-refs-sec-approx") : null; };
    const kinds = () => libRows().map(r => { const m = r.querySelector(".wv-refs-mark"); return m ? m.getAttribute("data-wv-refs-kind") : null; });
    /** What the library pane and the store hold for Q, for a failure's message. */
    async function diag() {
        try {
            const L = wvT.lib();
            const s = await wv._wvCbFtStampOf(Qpdf);
            const r = await L.wvStoreRead(wv._wvCbEntPath(Qpdf.id), { decompress: true, onParseError: "keep" });
            const d = r.doc || {};
            const ent = await wv._wvCbEntRead(Qpdf.id, s);
            const p = wv._wvRefsLibProbes && wv._wvRefsLibProbes.get(Q.id);
            const now = wv._wvRefsEntriesNow && wv._wvRefsEntriesNow.get(Qpdf.id);
            const rec = wv._wvCbIx && wv._wvCbIx.recs.get(Qpdf.id);
            return JSON.stringify({ stampNow: s, file: { status: r.status, s: d.s, src: d.src, x: Array.isArray(d.x) ? d.x.length : null, x0: Array.isArray(d.x) ? String(d.x[0] || "").slice(0, 60) : null },
                usable: ent ? ent.x.length : null, rec: rec ? { s: rec.s, src: rec.src, c: rec.c } : null,
                probe: p ? { att: p.att, kind: p.kind, atts: p.atts, busy: !!p.busy } : null, known: now ? now.length : null, Qpdf: Qpdf.id });
        } catch (e) { return "diag err: " + e; }
    }
    /** The library pane's probe of Q looked at again (as a selection after its few seconds does). */
    const probeAgain = () => { const p = wv._wvRefsLibProbes && wv._wvRefsLibProbes.get(Q.id); if (p) p.at = 0; wv._wvRefsSecRefreshFor(null); };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvCbPass", "_wvCbEntPath", "_wvCbSdtUsable", "_wvRefsIndexEnsure", "_wvRefsFlush", "_wvRefsSecRefreshFor", "_wvRefsLibCtx"]) wvT.method(m);
        win = Zotero.getMainWindow();
        ZT = win.Zotero_Tabs;
        // The pass init schedules for later: the spec runs its own.
        try { wvT.lib().wvClearTimeout(wv._wvCbPassT); wv._wvCbPassT = null; } catch (e) {}
        X = await article({ title: "Drop impact on a heated plate in a vacuum chamber", date: "2016", volume: "812", pages: "101-120", _first: "Adams" });
        Y = await article({ title: "Bubble entrapment beneath falling droplets of viscous oil", date: "2019", _first: "Davis" });
        Q = await article({ title: "WV-TEST a paper whose PDF was never opened, read from its full text", date: "2024", _first: "Tester" });
        made.push(X, Y, Q);
        Xpdf = await importPDF("wv-rft-x", wvT.minimalPDFBytes(), X.id);
        Qpdf = await importPDF("wv-rft-q", fixturePDF("WV-TEST a paper whose PDF was never opened, read from its full text", [X_ENTRY, Y_ENTRY, W_ENTRY]), Q.id);
        made.push(Xpdf, Qpdf);
        // Zotero's full-text index for Q (its own cache file); no reader opens it. The import
        // indexes the file too (attachments.js _postProcessFile): the stamp is taken once the
        // cache has stopped changing, or the pass would store the entries of a cache Zotero then
        // writes again -- a stale file, rightly no list.
        await Zotero.Fulltext.indexItems([Qpdf.id], { complete: true });
        assert.isTrue(await IOUtils.exists(cacheOf(Qpdf, ".zotero-ft-cache")), "fixture: Q's full-text cache");
        let s0 = "";
        assert.ok(await until(async () => {
            const a = await wv._wvCbFtStampOf(Qpdf);
            await wvT.sleep(1500);
            const b = await wv._wvCbFtStampOf(Qpdf);
            s0 = b;
            return !!a && a === b;
        }, 30000, 100), "fixture: Q's full-text cache settled (" + s0 + ")");
        await wv._wvRefsIndexEnsure();
        await wv._wvRefsFlush();
        // Q's entries stored by the Cited by index, as its pass reads a PDF.
        await passFor(Qpdf);
        assert.ok(await until(() => IOUtils.exists(wv._wvCbEntPath(Qpdf.id)), 10000), "fixture: Q's entries stored");
        const ent = /** @type {any} */ (await until(async () => { const e = await wv._wvCbEntRead(Qpdf.id, await wv._wvCbFtStampOf(Qpdf)); return e && e.x.length ? e : null; }, 10000));
        if (!ent) assert.fail("fixture: Q's stored entries are those of its full text now: " + await diag());
        assert.equal(ent.x.length, 3, "fixture: its three entries: " + JSON.stringify(ent.x));
        fpBefore = await fingerprint();
        ZT.select("zotero-pane");
    });

    after(async function () {
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        try { ZT.select("zotero-pane"); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
        // The References index takes the erased items NOW, not on its debounce: its flush
        // redraws every open reader's marks and rows (_wvRefsRefreshAll), and landing in the
        // next spec's reader open it put a "match" before that open's own index phase
        // (refs.spec.js's timeline case, citations.6 picked run).
        await wvT.sleep(200);
        try { await wv._wvRefsFlush(); } catch (e) {}
        await wvT.waitFor(() => !wv._wvCbRunning, 60000, 50);
        // No pass left running for the specs after this one (sdt-clean's "a pass under way" case
        // inherited one, dev.99 triage): stopped, and the item observer the stop unwires wired again.
        if (wv._wvCbRunning) {
            try { wv._wvCbStop(); } catch (e) {}
            wv._wvCbRunning = false;
            try { if (wv._wvCbOn()) wv._wvCbWireNotifier(); } catch (e) {}
        }
    });

    it("a PDF never opened: the library's References from the entries the index stored, matched and marked as usual, with a muted note -- no structure cache made, no position, nothing written", async function () {
        assert.isFalse(await IOUtils.exists(cacheOf(Qpdf, ".zotero-sdt-cache")), "fixture: no structure cache");
        // Q may have been selected since it was made, before its PDF was attached: the pane's
        // first look found no PDF; the index's write of Q's entries made it look again
        // (_wvRefsLibRecheck: the PDF's parent). A fresh selection, as the user makes one.
        await win.ZoteroPane.selectItem(X.id);
        await win.ZoteroPane.selectItem(Q.id);
        if (!(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 3, 15000, 100))) {
            assert.fail("Q's three references (section " + !!libSec() + ", hidden " + (libSec() && libSec().hidden) + ", rows " + libRows().length + "): " + await diag());
        }
        assert.deepEqual(kinds(), ["pdf", "nopdf", "web"], "X with its PDF, Y without, W in none of your libraries");
        assert.match(libRows()[0].querySelector(".wv-refs-sec-text").textContent, /Adams, J\., Brown, K\./, "the entry's own text");
        const lab = libRows()[0].querySelector(".wv-refs-sec-label");
        assert.equal(lab && lab.textContent, "[1]", "its number apart, as the structure's rows show it");
        const cs = libSec().querySelector("collapsible-section");
        assert.deepEqual(JSON.parse(cs.dataset.l10nArgs), { state: "counted", total: 3 }, "the header counts them");
        const n = note();
        assert.ok(n, "the note");
        assert.equal(n.textContent, NOTE);
        assert.strictEqual(n.parentNode, libSec().querySelector(".wv-refs-sec"), "in the section's own box");
        assert.ok(n.compareDocumentPosition(libSec().querySelector(".wv-refs-sec-list")) & 4, "above the list");
        assert.include(win.getComputedStyle(n).contain, "inline-size", "never wider than the pane");
        assert.notEqual(win.getComputedStyle(n).color, win.getComputedStyle(libRows()[0].querySelector(".wv-refs-sec-text")).color, "muted");
        // No position anywhere: nothing of this list can mark a PDF.
        const ents = wv._wvRefsEntriesNow.get(Qpdf.id);
        assert.ok(ents && ents.length === 3 && ents.every(e => Array.isArray(e.rects) && !e.rects.length), "entries with no positions: " + JSON.stringify(ents && ents.map(e => e.rects)));
        assert.isFalse(await IOUtils.exists(cacheOf(Qpdf, ".zotero-sdt-cache")), "no structure cache made");
        assert.equal(await fingerprint(), fpBefore, "nothing written to the library");
    });

    it("a stale stored file (its stamp not the full text's now) is no list: hidden; the index's next read writes it again and the section comes up by itself", async function () {
        await win.ZoteroPane.selectItem(Q.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 3, 15000, 100), "fixture: the list");
        // The full text changes (Zotero indexed it again): the stored file's stamp is another file's.
        const ft = cacheOf(Qpdf, ".zotero-ft-cache");
        const text = await IOUtils.readUTF8(ft);
        await IOUtils.writeUTF8(ft, text + "\n");
        probeAgain();
        assert.ok(await wvT.waitFor(() => !libSec() || libSec().hidden, 10000, 100), "hidden: the stored entries are another full text's (rows " + libRows().length + ")");
        // The index reads the PDF again and writes its file: the section comes up, Q still selected.
        await passFor(Qpdf);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 3 && note(), 15000, 100),
            "shown again once the index wrote the file (hidden " + (libSec() && libSec().hidden) + ", rows " + libRows().length + ")");
    });

    it("the PDF opened: Zotero writes its structure cache, and the section switches to the precise list, without the note; the reader's own list has the positions", async function () {
        if (!sdtThere()) this.skip(); // version: needs Zotero's structure data (Zotero.SDT)
        await win.ZoteroPane.selectItem(Q.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 3 && note(), 15000, 100), "fixture: the full text's list");
        reader = await wvT.openReaderTab(Qpdf.id);
        assert.ok(reader, "Q's PDF opened");
        assert.ok(await until(() => IOUtils.exists(cacheOf(Qpdf, ".zotero-sdt-cache")), 30000), "Zotero wrote its structure cache");
        assert.ok(await wvT.waitFor(() => { const e = wv._wvRefsEntriesNow.get(Qpdf.id); return e && e.length === 3 && e.every(x => x.rects && x.rects.length); }, 20000, 100),
            "the reader's list: the structure's, with positions");
        ZT.select("zotero-pane");
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 3 && !note(), 15000, 100),
            "the library pane: the precise list, no note (rows " + libRows().length + ", note " + !!note() + ")");
        assert.deepEqual(kinds(), ["pdf", "nopdf", "web"], "the same answers");
        // And it stays so when the pane looks again.
        probeAgain();
        await wvT.sleep(600);
        assert.ok(libRows().length === 3 && !note(), "still the precise list");
    });
});
