/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// References in your library: the paper's reference list follows its FILE
// (1.2.1-refs.9). MJT 2026-11-20, Wang et al. 2000 (Phys. Fluids) in his
// library: "Some citations appear as in my library in the item pane, but no
// blue dot in the PDF file." A page before the references had been deleted
// (a publisher's cover page) after the list was read: refs.ts kept the list
// read from the old file -- every entry one page too far -- so the marks were
// drawn on the wrong page or on a page that no longer exists, until Zotero
// restarted. A list is valid for the file it was read from only.
//
// The fixture: a three-page PDF -- a cover page, a body citing [1] and [2],
// a reference list of three entries on the third page -- two of them items
// of the library. The cover page is deleted as the reader's own Delete Page
// does it (xpcom/reader.js onDeletePages: Zotero.PDFWorker.deletePages, then
// reader.reload()); then the file is replaced behind Zotero's back (a synced
// new version) and the paper opened again.

describe("Weavero — references: the list follows the paper's file", function () {
    this.timeout(240000);
    const Cu = Components.utils;
    const made = [];
    let wv, win, att, reader, path;

    const ENTRIES = [
        ["Ito, K. 2011 Coalescence of drops on a wet plate in a closed vessel.", "J. Test Mech. 700, 11-30."],
        ["Jung, P. 2013 Rebound of droplets from heated walls at low pressure.", "Phys. Rev. Test 2, 013601."],
        ["Kahn, S. 2015 A reference that is in no library of the test profile.", "Exp. Test Fluids 56, 9."],
    ];

    /** The paper with `covers` cover pages before its body and its list. */
    function fixturePDF(covers = 1) {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        const cover = (k) => line(72, 700, 24, "WV-TEST cover page " + (k + 1)) + line(72, 660, 10, "This page is the publisher's cover. It cites nothing.");
        const p1 = line(72, 740, 14, "WV-TEST the list follows the file") + line(72, 700, 10, "Drops coalesce [1], and they rebound [2].");
        let p2 = line(72, 740, 12, "References");
        let y = 715;
        ENTRIES.forEach(([a, c], i) => { p2 += line(72, y, 9, "[" + (i + 1) + "]"); p2 += line(90, y, 9, a); y -= 11; p2 += line(90, y, 9, c); y -= 15; });
        const pages = [];
        for (let k = 0; k < covers; k++) pages.push(cover(k));
        pages.push(p1, p2);
        const n = pages.length;
        const font = 3 + n;
        const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [" + pages.map((_, i) => (3 + i) + " 0 R").join(" ") + "] /Count " + n + " >>"];
        for (let i = 0; i < n; i++) objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 " + font + " 0 R >> >> /Contents " + (font + 1 + i) + " 0 R >>");
        objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        for (const s of pages) objs.push("<< /Length " + s.length + " >>\nstream\n" + s + "endstream");
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }
    async function article(title, date, first) {
        const it = new Zotero.Item("journalArticle");
        it.setField("title", title);
        it.setField("date", date);
        it.setCreators([{ creatorType: "author", lastName: first, firstName: "A." }]);
        await it.saveTx();
        return it;
    }
    const viewOf = (r) => { try { const v = Cu.waiveXrays(r._internalReader)._primaryView; return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication ? v : null; } catch (e) { return null; } };
    /** The marks beside the list in `r`'s view: [entry, page box] each. */
    const marksOf = (r) => {
        const v = viewOf(r);
        if (!v) return [];
        return Array.from(v._iframeWindow.document.querySelectorAll(".pdfViewer > .wv-refs-marks .wv-refs-bibmark"))
            .map((m) => m.getAttribute("data-wv-refs-entry") + "@" + m.closest(".wv-refs-marks-page").getAttribute("data-wv-page"));
    };
    const listPages = () => { const es = wv._wvRefsEntriesNow && wv._wvRefsEntriesNow.get(att.id); return es ? es.map((e) => e.rects[0][0]) : null; };
    async function open() {
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "the paper opened");
        assert.ok(await wvT.waitFor(() => { const v = viewOf(reader); return v && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount > 0; }, 30000, 100), "its view is up");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvRefsPrepare", "_wvRefsMarksDraw", "_wvRefsEntries"]) wvT.method(m);
        win = Zotero.getMainWindow();
        const parent = await article("WV-TEST the list follows the file", "2026", "Tester");
        made.push(parent);
        made.push(await article("Coalescence of drops on a wet plate in a closed vessel", "2011", "Ito"));
        made.push(await article("Rebound of droplets from heated walls at low pressure", "2013", "Jung"));
        const tmp = PathUtils.join(PathUtils.tempDir, "wv-refs-file-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(tmp, fixturePDF());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(tmp), parentItemID: parent.id });
        try { await IOUtils.remove(tmp); } catch (e) {}
        made.push(att);
        path = await att.getFilePathAsync();
        await open();
    });

    after(async function () {
        try { wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(500);
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
    });

    // Every entry its mark since 2026-11-20 (the third, not in the library: the grey ring).
    it("fixture: the list on the third page (index 2), each entry marked there", async function () {
        assert.ok(await wvT.waitFor(() => marksOf(reader).length === 3, 30000, 100), "three marks (" + JSON.stringify(marksOf(reader)) + ")");
        assert.deepEqual(listPages(), [2, 2, 2], "the entries' page");
        assert.deepEqual(marksOf(reader), ["0@2", "1@2", "2@2"]);
    });

    it("a page deleted before the list in the reader (Delete Page): the list is read again, the marks move with it", async function () {
        await Zotero.PDFWorker.deletePages(att.id, [0], true);
        await reader.reload();
        const ok = await wvT.waitFor(() => { const p = listPages(); return p && p.join() === "1,1,1" && marksOf(reader).join() === "0@1,1@1,2@1"; }, 30000, 100);
        assert.ok(ok, "the entries on index 1 now, the marks there (entries " + JSON.stringify(listPages()) + ", marks " + JSON.stringify(marksOf(reader)) + ")");
        const v = viewOf(reader);
        assert.equal(v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount, 2, "fixture: the file has two pages");
    });

    it("the file replaced behind Zotero's back (a synced new version, two cover pages): opened again, the list is the new file's", async function () {
        wvT.closeReaderTab(reader);
        await wvT.sleep(600);
        await IOUtils.writeUTF8(path, fixturePDF(2));
        await open();
        const ok = await wvT.waitFor(() => { const p = listPages(); return p && p.join() === "3,3,3" && marksOf(reader).join() === "0@3,1@3,2@3"; }, 30000, 100);
        assert.ok(ok, "on index 3 now (entries " + JSON.stringify(listPages()) + ", marks " + JSON.stringify(marksOf(reader)) + ")");
    });
});
