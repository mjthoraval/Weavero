/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// References: how soon the marks show after a PDF opens (refspeed, MJT 2026-11-21: "It
// can take some time for the references in a paper to be recognized by Weavero. Can you
// time this on different papers ... and improve"; work/refs-marks-speed-2026-11-21.md).
// Each test is one change the time-to-marks bench kept:
//   1. a reader still opening is asked every 50 ms (was 150) whether it has drawn a page;
//   2. the marks are drawn in a task of their own and painted before the References
//      section's rows are built (they used to wait for the section in the same task);
//   3. the library index is read in slices -- id ranges of 2000, one statement --
//      whose database reads run while the previous slice is put (pipelined), the same
//      index as before;
//   4. the work waits for the drawn page's text layer as well, PAINT_TEXT_MS at most: 400
//      ms from refspeed.4 (started at the page alone, it drew page 1's text layer ~94 ms
//      later), 0 since citations.6 -- MJT 2026-11-21, "marks first, the old order": the
//      marks 110-265 ms sooner on papers with a slow text layer.
// The fixture: a two-page paper whose reference list (three entries, page 2) Zotero's
// structure data flags, two of them items of the library.

describe("Weavero — references: the marks come soon after a PDF opens", function () {
    this.timeout(240000);
    const Cu = Components.utils;
    const made = [];
    let wv, win, att, reader;

    const ENTRIES = [
        ["Lund, A. 2012 Drops spreading on a cooled plate in dry air.", "J. Test Mech. 701, 31-50."],
        ["Mori, T. 2014 Bubbles rising in a column of a viscous liquid.", "Phys. Rev. Test 3, 023601."],
        ["Nash, P. 2016 A reference that is in no library of the test profile.", "Exp. Test Fluids 57, 19."],
    ];

    function fixturePDF() {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        const p1 = line(72, 740, 14, "WV-TEST the marks come soon") + line(72, 700, 10, "Drops spread [1], and bubbles rise [2]; [3] too.");
        let p2 = line(72, 740, 12, "References");
        let y = 715;
        ENTRIES.forEach(([a, c], i) => { p2 += line(72, y, 9, "[" + (i + 1) + "]"); p2 += line(90, y, 9, a); y -= 11; p2 += line(90, y, 9, c); y -= 15; });
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
    async function article(title, date, first) {
        const it = new Zotero.Item("journalArticle");
        it.setField("title", title);
        it.setField("date", date);
        it.setCreators([{ creatorType: "author", lastName: first, firstName: "A." }]);
        await it.saveTx();
        return it;
    }
    const viewOf = (r) => { try { const v = Cu.waiveXrays(r._internalReader)._primaryView; return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication ? v : null; } catch (e) { return null; } };
    const marksOf = (r) => { const v = viewOf(r); return v ? v._iframeWindow.document.querySelectorAll(".pdfViewer > .wv-refs-marks .wv-refs-bibmark").length : 0; };
    async function openFresh() {
        const r = await wvT.openReaderTab(att.id);
        assert.ok(r, "the paper opened");
        assert.ok(await wvT.waitFor(() => { const v = viewOf(r); return v && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount > 0; }, 30000, 100), "its view is up");
        return r;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvRefsAfterFirstPaint", "_wvRefsPrepare", "_wvRefsMarksDraw", "_wvRefsSecRefreshFor", "_wvRefsLoad",
            "_wvRefsIndexEnsure", "_wvRefsForget"]) wvT.method(m);
        win = Zotero.getMainWindow();
        const parent = await article("WV-TEST the marks come soon", "2026", "Tester");
        made.push(parent);
        made.push(await article("Drops spreading on a cooled plate in dry air", "2012", "Lund"));
        made.push(await article("Bubbles rising in a column of a viscous liquid", "2014", "Mori"));
        const tmp = PathUtils.join(PathUtils.tempDir, "wv-refs-speed-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(tmp, fixturePDF());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(tmp), parentItemID: parent.id });
        try { await IOUtils.remove(tmp); } catch (e) {}
        made.push(att);
        await wv._wvRefsIndexEnsure();
    });

    after(async function () {
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(500);
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
        try { await wv._wvRefsIndexEnsure(); } catch (e) {}
    });

    /** A stand-in reader: its page views (`pdfViewer`) and an idle callback that runs at once. */
    const fakeReader = (pdfViewer) => ({
        type: "pdf", itemID: -1,
        _internalReader: { _primaryView: { _iframeWindow: { PDFViewerApplication: { pdfViewer } } } },
        _iframeWindow: { requestIdleCallback: (cb) => cb() },
    });
    const XHTML = "http://www.w3.org/1999/xhtml";

    // 1. A stand-in reader whose page views the poll reads: how often it looks before a page is drawn.
    it("a reader still opening is asked every 50 ms whether it has drawn a page (150 ms until refspeed.2)", async function () {
        let looks = 0, drawn = false;
        const pages = [{ renderingState: 0 }];
        const fake = fakeReader({ get _pages() { looks++; if (drawn) pages[0].renderingState = 3; return pages; } });
        let ranAt = 0;
        const t0 = Date.now();
        wv._wvRefsAfterFirstPaint(fake, () => { ranAt = Date.now(); });
        await wvT.sleep(600);
        const before = looks;
        drawn = true;
        const ran = await wvT.waitFor(() => ranAt > 0, 3000, 10);
        assert.ok(ran, "the work ran once the page was drawn");
        // 600 ms at one look per 50 ms: 12 (a loaded runner stretches timers: at least 7);
        // at 150 ms there were 4 or 5.
        assert.isAtLeast(before, 7, "looks in the first 600 ms: " + before + " (started " + t0 + ")");
    });

    // 2. The open's own work: the marks in one task, the section in a later one, after a frame.
    it("the marks are drawn in a task of their own and painted before the References section is built", async function () {
        reader = await openFresh();
        assert.ok(await wvT.waitFor(() => marksOf(reader) === 3, 30000, 100), "three marks (" + marksOf(reader) + ")");
        const iw = reader._iframeWindow;
        let frames = 0, run = true;
        const tick = () => { frames++; if (run) iw.requestAnimationFrame(tick); };
        iw.requestAnimationFrame(tick);
        const seen = [];
        const origMarks = wv._wvRefsMarksDraw, origSec = wv._wvRefsSecRefreshFor;
        let microAfterMarks = false, framesAtMarks = -1;
        wv._wvRefsMarksDraw = function (...a) {
            if (a[0] === reader && framesAtMarks < 0) {
                framesAtMarks = frames;
                microAfterMarks = false;
                Promise.resolve().then(() => { microAfterMarks = true; });
            }
            seen.push("marks");
            return origMarks.apply(this, a);
        };
        wv._wvRefsSecRefreshFor = function (...a) {
            if (a[0] === reader && framesAtMarks >= 0) seen.push("sec " + (microAfterMarks ? "later-task" : "same-task") + " frames+" + (frames - framesAtMarks));
            return origSec.apply(this, a);
        };
        try {
            // The list forgotten: the paper's prepare reads it again, then draws.
            wv._wvRefsForget(att.id);
            await wv._wvRefsPrepare(reader);
            await wvT.sleep(300);
        }
        finally {
            run = false;
            delete wv._wvRefsMarksDraw;
            delete wv._wvRefsSecRefreshFor;
        }
        const sec = seen.find(s => s.startsWith("sec "));
        assert.ok(sec, "the section was refreshed after the marks: " + JSON.stringify(seen));
        assert.include(sec, "later-task", "not in the marks' task: " + JSON.stringify(seen));
        if (!iw.document.hidden) assert.notInclude(sec, "frames+0", "a frame painted in between: " + JSON.stringify(seen));
        assert.equal(marksOf(reader), 3, "the marks are still there");
    });

    // 3. The whole-library read, pipelined: slice k+1's database reads start before slice k is put.
    it("the index is read in slices whose database reads run while the previous slice is put -- the same index", async function () {
        for (const m of ["_wvRefsRead", "_wvRefsPut", "_wvRefsOnItems", "_wvRefsFlush"]) wvT.method(m);
        const DB = Zotero.DB;
        const origCol = DB.columnQueryAsync;
        const ownCol = Object.prototype.hasOwnProperty.call(DB, "columnQueryAsync");
        const ev = [];
        const origRead = wv._wvRefsRead, origPut = wv._wvRefsPut, origLoad = wv._wvRefsLoad;
        const mk = () => ({ items: new Map(), byDOI: new Map(), byTitle: new Map(), byHead: new Map(), byVolPage: new Map(), byYear: new Map(),
            byAltHead: new Map(), byShortYear: new Map(), byYearForm: new Map(), byYearOther: new Map(), seq: 0 });
        const ix = mk();
        // The load under test is the one into `ix`. Another load running meanwhile -- the live
        // index's re-read of changed items (_wvRefsFlush, below) -- has no slice of it: its read
        // (made in its first synchronous step, refs.ts _wvRefsLoad with ids) and its put (into
        // the live index) pass through, listed apart. Until 1.3.0-betafix.1 they were counted
        // as the load's own and failed it.
        let foreign = 0;
        const others = [];
        wv._wvRefsLoad = function (into, ...rest) {
            if (into === ix) return origLoad.call(this, into, ...rest);
            foreign++;
            try { return origLoad.call(this, into, ...rest); }
            finally { foreign--; }
        };
        let real = [];
        // The id list padded with ids no item has (empty reads), so that the test
        // profile's few items make at least three slices (2000 ids each since refspeed.7).
        DB.columnQueryAsync = async function (sql, ...rest) {
            const r = await origCol.call(this, sql, ...rest);
            if (/^SELECT itemID FROM items WHERE libraryID IN/.test(String(sql))) {
                real = (r || []).map(Number);
                const pad = [];
                for (let k = 1; real.length + pad.length < 5000; k++) pad.push(900000000 + k);
                return real.concat(pad);
            }
            return r;
        };
        let k = 0;
        const ranges = [];
        wv._wvRefsRead = function (...a) {
            if (foreign) { others.push("ids:" + (a[0] ? a[0].length : "?")); return origRead.apply(this, a); }
            const i = k++;
            ev.push("read" + i + "+");
            ranges.push(a[0] === null && Array.isArray(a[1]) ? a[1][0] + "-" + a[1][1] : "ids:" + (a[0] ? a[0].length : "?"));
            const p = origRead.apply(this, a);
            p.then(() => ev.push("read" + i + "-"), () => {});
            return p;
        };
        let j = 0, reread = null;
        wv._wvRefsPut = async function (...a) {
            if (a[0] !== ix) return origPut.apply(this, a);
            const i = j++;
            ev.push("put" + i + "+");
            if (i === 0 && !reread) {
                // Zotero saves the open reader's attachment (its lastRead: attachmentReadObserver.js,
                // on the reader's open, close and page changes) and the index re-reads it and its
                // parent 400 ms later (_wvRefsOnItems -> _wvRefsFlush). Landing inside this load,
                // that re-read ran between its slices (4 full-suite reds, integ89 to 1.3.0-beta.1:
                // "ids:2" among the ranges). Made to land here on every run.
                wv._wvRefsOnItems("modify", [made[1].id, made[2].id]);
                reread = wv._wvRefsFlush();
            }
            const n = await origPut.apply(this, a);
            ev.push("put" + i + "-");
            return n;
        };
        let n = 0;
        try {
            n = await wv._wvRefsLoad(ix, null);
            if (reread) await reread;
        }
        finally {
            if (ownCol) DB.columnQueryAsync = origCol;
            else delete DB.columnQueryAsync;
            delete wv._wvRefsRead;
            delete wv._wvRefsPut;
            delete wv._wvRefsLoad;
        }
        assert.isAtLeast(others.length, 1, "the items' re-read ran during the load, apart from its slices: " + ev.join(" "));
        assert.isAtLeast(ev.filter(e => /^read\d+\+$/.test(e)).length, 3, "three slices read at least: " + ev.join(" "));
        // Each slice an id range (refspeed.7: one statement, BETWEEN), not a list of ids.
        assert.ok(ranges.every(r => /^\d+-\d+$/.test(r)), "id ranges: " + ranges.join(" ") + " (other loads' reads: " + (others.join(" ") || "none") + ")");
        assert.isBelow(ev.indexOf("read1+"), ev.indexOf("put0+"), "slice 1's reads start before slice 0 is put: " + ev.join(" "));
        assert.isBelow(ev.indexOf("read2+"), ev.indexOf("put1+"), "slice 2's before slice 1's put: " + ev.join(" "));
        const live = wv._wvRefsIx;
        assert.ok(live, "the live index");
        assert.equal(n, ix.items.size, "the count returned is the items read");
        for (const id of [made[1].id, made[2].id]) assert.ok(ix.items.has(id), "item " + id + " in the index read");
        assert.equal(ix.items.size, real.filter(id => live.items.has(id)).length, "the same items as the live index (" + ix.items.size + ")");
    });

    // 4. Stand-in readers whose page is drawn at once: (a) its text layer comes later, (b) never.
    // The wait is refs.ts PAINT_TEXT_MS (the suite reads it: WV_REFS_PAINT_TEXT_MS): 400 ms
    // from refspeed.4, 0 since citations.6 (MJT 2026-11-21, "marks first, the old order": the
    // marks no longer wait for page 1's text layer). The case holds for either value.
    it("the work waits for the drawn page's text layer PAINT_TEXT_MS at most -- 0 since citations.6: marks first", async function () {
        const T = wvT.lib().WV_REFS_PAINT_TEXT_MS;
        if (typeof T !== "number") wvT.absent("lib.WV_REFS_PAINT_TEXT_MS");
        assert.equal(T, 0, "citations.6: no wait for the text layer (MJT: marks first)");
        const doc = win.document;
        const page = () => ({ renderingState: 3, div: doc.createElementNS(XHTML, "div") });
        const textLayer = () => {
            const layer = doc.createElementNS(XHTML, "div");
            layer.className = "textLayer";
            const end = doc.createElementNS(XHTML, "div");
            end.className = "endOfContent";
            layer.appendChild(end);
            return layer;
        };
        const pA = page();
        let ranA = 0;
        const tA = Date.now();
        wv._wvRefsAfterFirstPaint(fakeReader({ _pages: [pA] }), () => { ranA = Date.now(); });
        if (T > 0) {
            await wvT.sleep(Math.min(250, T / 2));
            assert.equal(ranA, 0, "not before the page's text layer");
            pA.div.appendChild(textLayer());
            const tText = Date.now();
            assert.ok(await wvT.waitFor(() => ranA > 0, 3000, 10), "it ran once the text layer was there");
            assert.isBelow(ranA - tText, 160, "soon after it: " + (ranA - tText) + " ms");
        }
        else {
            // The page drawn, its text layer not: the work starts at the page (an idle moment
            // after it, PAINT_IDLE_MS 300 at most), the layer never waited for.
            assert.ok(await wvT.waitFor(() => ranA > 0, 3000, 10), "it ran at the drawn page");
            assert.notOk(pA.div.querySelector(".textLayer"), "with no text layer there");
            assert.isBelow(ranA - tA, 600, "at once, the text layer not waited for: " + (ranA - tA) + " ms");
        }
        const pB = page();
        let ranB = 0;
        const tB = Date.now();
        wv._wvRefsAfterFirstPaint(fakeReader({ _pages: [pB] }), () => { ranB = Date.now(); });
        assert.ok(await wvT.waitFor(() => ranB > 0, 3000, 10), "it ran with no text layer at all");
        assert.isAtLeast(ranB - tB, Math.max(0, T - 50), "after waiting PAINT_TEXT_MS for it: " + (ranB - tB) + " ms");
        assert.isBelow(ranB - tB, T + 1100, "not for long: " + (ranB - tB) + " ms");
    });

    // 5. One prepare of a reader at a time (citations.6): right after page 1 the wiring's
    // prepare, a views change's and the item pane's section all asked at once; with no wait for
    // the text layer a second one matched the rows in the first's gap and drew the marks twice
    // (refs.spec.js's timeline case went red in the citations.6 picked run).
    it("one prepare of a reader at a time: callers at once wait for the one running, then each runs its own; another reader's is not held", async function () {
        wvT.method("_wvRefsPrepareRun");
        const proto = Object.getPrototypeOf(wv);
        let running = 0, most = 0, runs = 0;
        wv._wvRefsPrepareRun = async function (r) {
            running++; runs++;
            most = Math.max(most, running);
            try { await wvT.sleep(60); return await proto._wvRefsPrepareRun.call(this, r); }
            finally { running--; }
        };
        const a = fakeReader({ _pages: [] }), b = fakeReader({ _pages: [] });
        b.itemID = -2;
        try {
            const got = await Promise.all([wv._wvRefsPrepare(a), wv._wvRefsPrepare(a), wv._wvRefsPrepare(a)]);
            assert.equal(runs, 3, "each caller's prepare ran: " + JSON.stringify(got));
            assert.equal(most, 1, "one at a time for one reader");
            runs = 0; most = 0;
            await Promise.all([wv._wvRefsPrepare(a), wv._wvRefsPrepare(b)]);
            assert.equal(runs, 2);
            assert.equal(most, 2, "two readers' at once");
        }
        finally {
            delete wv._wvRefsPrepareRun;
            for (const id of [-1, -2]) { try { wv._wvRefsForget(id); } catch (e) {} }
        }
    });
});
