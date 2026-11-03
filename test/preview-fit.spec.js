/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-134490 (upstream register #42, MJT's forum 134490; MJT 2026-11-02:
// "Can you fix these 3 in Weavero?"). The attachment preview sometimes draws
// the PDF page smaller than its box, the prev / next arrows below it:
// ReaderPreview._open (xpcom/reader.js) gives pdf.js's firstPagePromise
// 100 x 10 ms, then applies 'page-height' -- ignored without a document --
// and the box takes the page's width/height ratio -- NaN without a page, so
// A4. A page that loads later keeps pdf.js's smaller "auto" scale. Weavero
// waits for it: a preview at "success" with no ratio yet is polled for its
// first page, then Zotero's own updatePDFAttr() and _updateWidthHeightRatio()
// run. Written before the code.

describe("Weavero — WV-TEMP-134490: a preview page that loads after the cutoff is fitted when it arrives", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, det, box, P, A, pv, reader;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWirePreviewFitFix", "_wvTeardownPreviewFitFix", "_wvPreviewFitNeeded", "_wvPreviewLateFit"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        P = await wvT.createItem("journalArticle", { title: "WVFIT paper" });
        A = await wvT.createTestPDFItem("wvfit-pdf", { parentItemID: P.id });
        det = doc.querySelector("#zotero-item-pane item-details");
        box = det && det.querySelector("attachments-box");
        assert.isOk(box, "the library item pane's Attachments section");
        await ZP.selectItems([P.id]);
        await wvT.waitFor(() => (box._item && box._item.id === P.id) || null, 10000);
        try { det.scrollToPane("attachments", "instant"); } catch (e) {}
        pv = await wvT.waitFor(() => (box._preview && box._preview.dataset.previewStatus === "success" && box._preview._lastRenderID === A.id) ? box._preview : null, 30000);
        assert.isOk(pv, "the PDF's preview loaded");
        reader = pv._reader;
        assert.isOk(reader, "its ReaderPreview");
    });

    after(async function () {
        try { wv._wvWirePreviewFitFix(win); } catch (e) {}
        await wvT.erase(P);
    });

    const layers = (el) => wvT.lib().wvWrapLayers(el, "setPreviewStatus").map(l => l.layer);
    /** A preview and a reader as the fix sees them, the page arriving on the
     *  `arrives`-th look (never for Infinity); every call recorded. */
    const fakes = (arrives) => {
        const calls = [];
        let looks = 0;
        const rd = Object.create(Object.getPrototypeOf(reader));
        rd.updatePDFAttr = () => calls.push("attr");
        rd.getPageWidthHeightRatio = () => (++looks >= arrives ? 0.75 : NaN);
        const fp = { previewType: "pdf", dataset: { previewStatus: "success" }, _reader: rd, _updateWidthHeightRatio: () => calls.push("ratio") };
        return { fp, rd, calls, looks: () => looks };
    };

    it("ReaderPreview still gives the page one second (the workaround installs only while it does)", function () {
        assert.isTrue(wv._wvPreviewFitNeeded(reader), "11.0's _open polls firstPagePromise 100 x 10 ms");
    });

    it("the Attachments section's preview carries the layer (created lazily: the pane observer's), the class stays Zotero's", function () {
        assert.include(layers(pv), "fit134490");
        assert.isFalse(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(pv), "_wvWraps"), "no wrap table on the element class");
    });

    it("the attachment item pane's preview, created lazily when the attachment is selected, gets it too", async function () {
        await ZP.selectItems([A.id]);
        const pv2 = await wvT.waitFor(() => { const el = doc.querySelector("#zotero-item-pane attachment-box attachment-preview"); return el && el !== pv ? el : null; }, 15000);
        assert.isOk(pv2, "the attachment pane's own preview element (attachmentBox.js _initPreview)");
        const got = await wvT.waitFor(() => layers(pv2).includes("fit134490") || null, 5000);
        assert.isOk(got, "wrapped: " + layers(pv2).join(","));
        await ZP.selectItems([P.id]);
        await wvT.waitFor(() => (box._item && box._item.id === P.id) || null, 10000);
    });

    it("the live preview's page is fitted: a page ratio and 'page-height'", async function () {
        // Read once the page has its ratio: the local Zotero 11 suite read it
        // before the first page had laid out (2026-11-03, green on all three
        // CI beta jobs the same day).
        const fit = await wvT.waitFor(() => Number.isFinite(reader.getPageWidthHeightRatio()) || null, 5000);
        assert.isOk(fit, "the first page's ratio: " + reader.getPageWidthHeightRatio());
        // The scale is set once the ratio is in (the suite's second half,
        // run alone, read "auto" a moment before, 2026-11-03).
        const viewer = reader._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer;
        await wvT.waitFor(() => viewer.currentScaleValue === "page-height" || null, 5000);
        assert.strictEqual(viewer.currentScaleValue, "page-height");
    });

    it("a page that arrives after the cutoff is fitted when it does, once", async function () {
        const f = fakes(4);
        const r = await wv._wvPreviewLateFit(f.fp, { tick: 15 });
        assert.strictEqual(r, "late");
        assert.deepEqual(f.calls, ["attr", "ratio"], "Zotero's own page-height and ratio, in that order");
        assert.strictEqual(f.looks(), 4, "fitted on the look that found the page");
    });

    it("a page already there is left alone; a new render or a lost status drops the wait", async function () {
        const f = fakes(1);
        assert.strictEqual(await wv._wvPreviewLateFit(f.fp, { tick: 15 }), "fitted");
        assert.deepEqual(f.calls, [], "nothing to do");
        const g = fakes(Infinity);
        const p = wv._wvPreviewLateFit(g.fp, { tick: 15 });
        await wvT.sleep(50);
        g.fp._reader = {};   // a new render took the element
        assert.strictEqual(await p, "dropped");
        assert.deepEqual(g.calls, []);
        const h = fakes(Infinity);
        const q = wv._wvPreviewLateFit(h.fp, { tick: 15 });
        await wvT.sleep(50);
        h.fp.dataset.previewStatus = "loading";
        assert.strictEqual(await q, "dropped");
        const k = fakes(Infinity);
        assert.strictEqual(await wv._wvPreviewLateFit(k.fp, { tick: 5, max: 4 }), "timeout", "bounded");
        assert.strictEqual(k.looks(), 5, "the first look, then four more");
    });

    it("the teardown takes the layer away (the other layers stay), the wiring puts it back", function () {
        const others = layers(pv).filter(l => l !== "fit134490");
        wv._wvTeardownPreviewFitFix();
        try {
            assert.notInclude(layers(pv), "fit134490", "no fit layer left on the preview");
            assert.deepEqual(layers(pv), others, "the other layers untouched");
        }
        finally { wv._wvWirePreviewFitFix(win); }
        assert.include(layers(pv), "fit134490");
    });
});
