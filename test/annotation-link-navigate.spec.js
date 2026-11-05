/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils, Services */
// Issue #60, qrkks's beta.1 report (2026-11-04, Windows 10, Zotero 10.0.7):
// "when the source PDF was already open, clicking a backlink selected the
// correct annotation in the sidebar, but the PDF sometimes stayed on the
// previous page" -- with Weavero on only. A link to an annotation in an open
// PDF ends in the reader's navigate(), which selects it and asks the VIEW to
// go there; the view looks it up in its OWN list (pdf-view.js _navigate), so
// an annotation missing from that list is selected in the sidebar and the
// page does not move. "Hide Annotations in the Reader" empties that list
// (_wvReaderSetViewAnnotationsBlocked).
// The page is read from the scroll offset, not pdfViewer.currentPageNumber:
// that one follows rAF, which an occluded runner window suspends.
describe("Weavero — a link to an annotation reaches its page in an open PDF (#60)", function () {
    this.timeout(120000);
    let wv, win, doc, att, reader, A1, A6, A10;
    const PAGES = 12;
    const made = [];
    const Cu = Components.utils;

    function pagesPDF(n) {
        const kids = [];
        for (let i = 0; i < n; i++) kids.push((3 + i) + " 0 R");
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>\nendobj\n",
        ];
        for (let i = 0; i < n; i++) objs.push((3 + i) + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n");
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
    }
    const ann = async (page, comment) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = "navigate fixture p" + page;
        a.annotationComment = comment || "";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = String(page + 1);
        a.annotationSortIndex = String(page).padStart(5, "0") + "|000400|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: page, rects: [[100, 390, 400, 402]] });
        await a.saveTx();
        return a;
    };
    const linkTo = (a) => "zotero://open/library/items/" + att.key + "?annotation=" + a.key;
    const ir = () => Cu.waiveXrays(reader._internalReader);
    const viewer = () => ir()._primaryView._iframeWindow.PDFViewerApplication.pdfViewer;
    const pageNow = () => {
        const v = viewer(), y = v.container.scrollTop + v.container.clientHeight / 2;
        let p = 0;
        for (let i = 0; i < v._pages.length; i++) { if (v._pages[i].div.offsetTop <= y) p = i; else break; }
        return p;
    };
    const landed = async (page) => {
        for (let i = 0; i < 40 && pageNow() !== page; i++) await wvT.sleep(50);
        // Long enough for a late scroll back to show.
        await wvT.sleep(500);
        return pageNow();
    };
    const selected = () => String(ir()._state.selectedAnnotationIDs[0]);
    const panel = () => /** @type {any} */ (doc.getElementById("weavero-panel"));
    const closePanel = () => { const p = panel(); if (p) { try { p.style.display = "none"; p._wvCountKey = null; } catch (e) {} } };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlOpenSource", "_wvOpenCountPopup", "_wvReaderApplyHideAnnotations", "handleZoteroURI"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        const path = PathUtils.join(PathUtils.tempDir, "wv-nav-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, pagesPDF(PAGES));
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        made.push(att);
        A1 = await ann(1);
        A6 = await ann(6, "see " + linkTo(A1));
        A10 = await ann(10, "and " + linkTo(A1));
        await wv._wvBlEnsure();
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "the reader opened");
        for (let i = 0; i < 100; i++) {
            try { if (viewer().pagesCount === PAGES && ir()._primaryView._annotations.length === 3) break; } catch (e) {}
            await wvT.sleep(100);
        }
        assert.strictEqual(viewer().pagesCount, PAGES, "the PDF's pages");
    });

    after(async function () {
        closePanel();
        try { wv._wvReaderApplyHideAnnotations(reader, false); } catch (e) {}
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(...made);
    });

    it("a click on a row of the reader's Backlinks popup goes to the source's page, the popup's own annotation having been the last place", async function () {
        reader.navigate({ annotationID: A1.key });
        assert.strictEqual(await landed(1), 1, "the target annotation in view");
        for (const [src, page] of [[A6, 6], [A10, 10], [A6, 6]]) {
            closePanel();
            wv._wvOpenCountPopup("backlinks", A1.id, { anchorNode: doc.documentElement, scope: "own", win });
            const rows = [...panel().querySelectorAll(".wv-bl-row")];
            assert.lengthOf(rows, 2, "A1's two incoming links");
            const row = rows.find((r) => r._wvBlOpen && r.textContent.includes("p" + page));
            assert.isOk(row, "the row of the annotation on page " + page);
            row.click();
            assert.strictEqual(await landed(page), page, "the PDF on the source's page");
            assert.strictEqual(selected(), src.key, "the source selected");
            reader.navigate({ annotationID: A1.key });
            assert.strictEqual(await landed(1), 1, "back on the target");
        }
    });

    it("a link clicked again after the page was scrolled away goes back to it", async function () {
        await wv.handleZoteroURI(linkTo(A10));
        assert.strictEqual(await landed(10), 10);
        viewer().container.scrollTop = viewer()._pages[3].div.offsetTop;
        await wvT.sleep(200);
        assert.strictEqual(selected(), A10.key, "still selected");
        await wv.handleZoteroURI(linkTo(A10));
        assert.strictEqual(await landed(10), 10, "a selected annotation's link still moves the page");
    });

    // qrkks 2026-11-05, with Weavero alone: a Backlinks row in the library tab,
    // the source one page away in an open reader tab. Reader.open selects the
    // tab and navigates at once, while the reader's document is still hidden,
    // and a target within a page of the view scrolls smoothly (pdf-view.js
    // navigateToPosition); a smooth scroll in a hidden document never runs.
    // Every test above jumps further than a page, so it scrolled instantly.
    // With Windows' animation effects off, as on the maintainer's machine,
    // Gecko reports prefers-reduced-motion and defaults general.smoothScroll to
    // false: "smooth" silently means instant and this could not fail.
    it("from the library tab, a link to an annotation one page away moves the PDF", async function () {
        const Z = win.Zotero_Tabs;
        const SMOOTH = "general.smoothScroll", REDUCED = "ui.prefersReducedMotion";
        const had = Services.prefs.prefHasUserValue(SMOOTH) ? Services.prefs.getBoolPref(SMOOTH) : null;
        Services.prefs.setBoolPref(SMOOTH, true);
        Services.prefs.setIntPref(REDUCED, 0);
        try {
            const motion = () => win.matchMedia("(prefers-reduced-motion: reduce)").matches;
            await wvT.waitFor(() => !motion(), 4000);   // the system setting's override lands asynchronously
            assert.isFalse(motion(), "smooth scrolling really on");
            await wv.handleZoteroURI(linkTo(A1));
            assert.strictEqual(await landed(1), 1);
            await wvT.sleep(1000);   // a smooth scroll still running would undo the next line
            viewer().container.scrollTop = viewer()._pages[2].div.offsetTop;
            await wvT.sleep(500);
            assert.strictEqual(pageNow(), 2, "the view one page past the annotation");
            Z.select("zotero-pane");
            await wvT.sleep(600);
            // Measured when the click returns, not when the view settles: an
            // instant scroll has landed by then, a smooth one is only asked for.
            // Whether that one is then lost depends on how fast the tab comes up:
            // here it usually lands, qrkks's stayed on page 2 in 4 runs of 4. A
            // wrapper around the container's scrollTo cannot record this: a call
            // through it does not scroll at all.
            const cont = viewer().container, from = Math.round(cont.scrollTop);
            await wv._wvBlOpenSource(A1, null);
            assert.notStrictEqual(Math.round(cont.scrollTop), from, "the view moved at once, hidden or not");
            assert.strictEqual(Z.selectedID, reader.tabID, "the reader came forward");
            assert.strictEqual(await landed(1), 1, "the PDF on the annotation's page");
            assert.strictEqual(selected(), A1.key, "selected in the sidebar");
        }
        finally {
            if (had === null) Services.prefs.clearUserPref(SMOOTH); else Services.prefs.setBoolPref(SMOOTH, had);
            Services.prefs.clearUserPref(REDUCED);
        }
    });

    // FAILED on 1.0.0-beta.2-dev.10: selected, the page unmoved.
    it("with Hide Annotations in the Reader on, a link still goes to the annotation's page", async function () {
        await wv.handleZoteroURI(linkTo(A1));
        assert.strictEqual(await landed(1), 1);
        wv._wvReaderApplyHideAnnotations(reader, true);
        try {
            await wvT.sleep(200);
            assert.lengthOf(ir()._primaryView._annotations, 0, "the view holds none");
            await wv._wvBlOpenSource(A10, null);
            assert.strictEqual(await landed(10), 10, "the PDF on the annotation's page");
            assert.strictEqual(selected(), A10.key, "selected in the sidebar");
        }
        finally { wv._wvReaderApplyHideAnnotations(reader, false); }
        for (let i = 0; i < 40 && ir()._primaryView._annotations.length !== 3; i++) await wvT.sleep(50);
        assert.lengthOf(ir()._primaryView._annotations, 3, "the annotations back on the page");
    });
});
