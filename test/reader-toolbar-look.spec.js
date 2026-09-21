/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, Components */

// The reader sidebar toolbar and the filter popups, measured (2026-09-21).
// Each block guards one appearance fix that was proven by measurement in
// the live reader and had no spec until the release audit:
//   * the Bookmarks tab's magnifier and funnel are the Annotations tab's,
//     pixel for pixel (a2eb88d);
//   * they appear instantly on a tab switch -- no fade (cc162ca) -- and
//     Zotero's own search box is hidden by the same gate class that shows
//     them, so no second magnifier stands in the slot for a frame (3473c79);
//   * the pane funnel's green line spans the 20-px icon on the button's
//     bottom edge (a32106a);
//   * faded chips sit at the Tag Selector's 60 % (067adb4).

describe("Weavero — reader sidebar toolbar and popup geometry", function () {
    this.timeout(90000);
    let wv, win, att, hl, reader, idoc, view;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(250);
        }
        throw new Error("timeout waiting for " + what);
    };
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n",
        ];
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
    }
    const end = () => idoc.querySelector("#sidebarContainer .sidebar-toolbar .end");
    const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    const rel = (el, host) => Math.round(el.getBoundingClientRect().left - host.getBoundingClientRect().left);

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAnnListEnsureButton !== "function") this.skip();
        win = Zotero.getMainWindow();
        const path = PathUtils.join(PathUtils.tempDir, "wv-look-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        hl = /** @type {any} */ (new Zotero.Item("annotation"));
        hl.libraryID = att.libraryID; hl.parentID = att.id;
        hl.annotationType = "highlight"; hl.annotationText = "a highlight"; hl.annotationComment = "";
        hl.annotationColor = "#ffd400"; hl.annotationPageLabel = "1";
        hl.annotationSortIndex = "00000|000100|00000";
        hl.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[40, 700, 300, 712]] });
        await hl.saveTx();
        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        reader = await waitFor(() => Zotero.Reader._readers.find(r => r.itemID === att.id
            && r._internalReader && r._iframeWindow), 30000, "reader");
        idoc = reader._iframeWindow.document;
        view = idoc.defaultView;
        try { reader._internalReader.toggleSidebar(true); } catch (e) {}
        try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
        await waitFor(() => idoc.querySelector("#sidebarContainer .wv-al-btn"), 30000, "pane funnel");
        await waitFor(() => idoc.querySelector(".wv-bm-reader-tab"), 30000, "bookmarks tab");
    });

    after(async function () {
        try { await wv._wvAnnPaneClearDefault(reader, idoc); } catch (e) {}
        try { if (reader && reader.tabID) win.Zotero_Tabs.close(reader.tabID); } catch (e) {}
        try { if (hl) await hl.eraseTx(); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("the Bookmarks tab's magnifier and funnel are native toolbar buttons with the Annotations tab's contents", async function () {
        const paneBtn = end().querySelector(".wv-al-btn");
        assert.include(paneBtn.className, "toolbar-button");
        const paneImg = paneBtn.querySelector("img.wv-filter-svg");
        idoc.querySelector(".wv-bm-reader-tab").click();
        await waitFor(() => view.getComputedStyle(end().querySelector(".wv-bm-sidebar-actions")).display === "flex", 5000, "bookmarks actions shown");
        const search = end().querySelector(".wv-bm-search-btn");
        const funnel = end().querySelector(".wv-bm-filter-btn");
        for (const b of [search, funnel]) {
            assert.include(b.className, "toolbar-button", "Zotero's own button");
            assert.deepEqual(box(b), { w: 28, h: 28 });
            assert.equal(view.getComputedStyle(b).padding, "0px");
        }
        // Zotero's 20-px magnifier (a 20-viewBox drawing), 20 px, at x=4.
        const mag = search.querySelector("svg");
        assert.equal(mag.getAttribute("viewBox"), "0 0 20 20");
        assert.deepEqual(box(mag), { w: 20, h: 20 });
        assert.equal(rel(mag, search), 4);
        // The same funnel image and chevron as the pane funnel.
        const fimg = funnel.querySelector("img.wv-filter-svg");
        assert.isOk(fimg, "the baked funnel image");
        assert.equal(fimg.getAttribute("src"), paneImg.getAttribute("src"), "byte-identical to the pane funnel's");
        assert.deepEqual(box(fimg), { w: 20, h: 20 });
        assert.equal(rel(fimg, funnel), 0);
        assert.deepEqual(box(funnel.querySelector(".wv-rf-chev")), { w: 8, h: 8 });
        idoc.querySelector("#viewAnnotations").click();
    });

    it("the Bookmarks actions appear instantly, and Zotero's search box leaves the slot in the same style flush", async function () {
        const sc = idoc.getElementById("sidebarContainer");
        const actions = end().querySelector(".wv-bm-sidebar-actions");
        assert.equal(view.getComputedStyle(actions).transitionDuration, "0s", "no fade");
        await waitFor(() => end().querySelector(".search-box"), 5000, "native search box on the Annotations tab");
        idoc.querySelector(".wv-bm-reader-tab").click();
        // Synchronously after the click: the gate is on, the native box is
        // still in the DOM but already hidden, ours is at full opacity.
        assert.isTrue(sc.classList.contains("wv-bm-tab-on"));
        const sb = end().querySelector(".search-box");
        if (sb) assert.equal(view.getComputedStyle(sb).display, "none", "hidden before React removes it");
        assert.equal(view.getComputedStyle(actions).opacity, "1");
        assert.equal(view.getComputedStyle(actions).display, "flex");
        idoc.querySelector("#viewAnnotations").click();
        await waitFor(() => end().querySelector(".search-box") && view.getComputedStyle(end().querySelector(".search-box")).display !== "none", 5000, "native box back");
    });

    it("the pane funnel's green line spans the icon on the button's bottom edge", async function () {
        const st = wv._wvAnnPaneState(reader);
        st.typesExcl = ["ink"];
        await wv._wvAnnPaneApply(reader);
        await wv._wvAnnListUseAsDefault(reader);
        const btn = end().querySelector(".wv-al-btn");
        wv._wvAnnListEnsureButton(reader, idoc);
        assert.isTrue(btn.classList.contains("wv-al-def-on"));
        const bar = view.getComputedStyle(btn, "::before");
        assert.equal(bar.width, "20px");
        assert.equal(bar.left, "0px");
        assert.equal(bar.bottom, "0px");
        assert.equal(bar.height, "2px");
        assert.include(bar.backgroundColor, "95, 178, 54");
        await wv._wvAnnPaneClearDefault(reader, idoc);
        await wv._wvAnnPaneBackToDefault(reader);
    });

    it("Custom's date range wraps onto two lines inside the popup, which keeps its width", async function () {
        // The width is the content's, set by the one-line rows; the Custom
        // date-range row arrives later and must neither widen the popup
        // (it ran off the reader's right edge, 2026-09-21) nor be cut: its
        // two "from/to [date] x" units go on two lines (MJT's call).
        const vw = idoc.documentElement.clientWidth;
        wv._wvToggleReaderFilterPopup(reader, idoc, idoc.querySelector(".wv-reader-filter-btn"));
        let popup = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "reader popup");
        const before = Math.round(popup.getBoundingClientRect().width);
        const custom = [...popup.querySelectorAll(".wv-filter-opt")].find(b => (b.title || "").indexOf("Custom added") === 0);
        assert.isOk(custom, "the Custom chip");
        custom.click();
        popup = await waitFor(() => { const p = idoc.getElementById("wv-reader-filter-popup-v2"); return p && p.querySelector(".wv-rf-daterange") ? p : null; }, 5000, "range row");
        const rc = popup.getBoundingClientRect();
        assert.equal(Math.round(rc.width), before, "the popup did not widen");
        assert.isAtMost(Math.round(rc.right), vw - 6, "inside the reader");
        const fields = [...popup.querySelectorAll(".wv-rf-datefield")];
        assert.lengthOf(fields, 2, "from and to");
        assert.notEqual(Math.round(fields[0].getBoundingClientRect().top), Math.round(fields[1].getBoundingClientRect().top), "on two lines");
        for (const f of fields) assert.isAtMost(f.getBoundingClientRect().right, rc.right + 1, "inside the popup");
        // The two date fields start at the same x: the labels share a fixed
        // width, right-aligned (MJT, 2026-09-21).
        const inputs = [...popup.querySelectorAll(".wv-rf-dateinput")];
        assert.lengthOf(inputs, 2);
        assert.equal(Math.round(inputs[0].getBoundingClientRect().left), Math.round(inputs[1].getBoundingClientRect().left), "date fields aligned");
        // ...and stay aligned once one of them holds a date: a filled field
        // is narrower than the placeholder, so the width is fixed.
        const st0 = wv._wvReaderFilterState(reader);
        st0.dateAddedFrom = "2026-09-04";
        await wv._wvApplyReaderFilter(reader);
        wv._wvRenderReaderFilterPopup(reader, idoc, popup);   // a chip click would do this
        assert.equal(popup.querySelector(".wv-rf-dateinput").value, "2026-09-04", "filled field");
        const fields2 = [...popup.querySelectorAll(".wv-rf-datefield")];
        const w = (f) => Math.round(f.querySelector(".wv-rf-dateinput").getBoundingClientRect().width);
        const xl = (f) => Math.round(f.querySelector(".wv-rf-dateclear").getBoundingClientRect().left);
        assert.equal(w(fields2[0]), w(fields2[1]), "same field width, filled or empty");
        assert.equal(xl(fields2[0]), xl(fields2[1]), "the clear x at the same x on both lines");
        assert.isAtMost(popup.querySelector(".wv-rf-head .wv-filter-clear-icon").getBoundingClientRect().right, rc.right + 1, "header x inside the popup");
        const st = wv._wvReaderFilterState(reader);
        st.dateAddedMode = null; st.dateAddedFrom = null; st.dateAddedTo = null;
        await wv._wvApplyReaderFilter(reader);
        wv._wvCloseReaderFilterPopup(idoc);
    });

    it("the Annotations tab stays highlighted and the pane funnel shown through Bookmarks round trips", async function () {
        // Weavero strips the native tabs' `active` by hand while its Bookmarks
        // tab is on. React only rewrites that attribute when the class string
        // it renders changes, so a sequence that left React believing the tab
        // was still marked lost the highlight for good, and with it the pane
        // funnel, whose CSS keyed on that class (runner sequence, 2026-09-21).
        const bm = () => idoc.querySelector(".wv-bm-reader-tab");
        const ann = () => idoc.querySelector("#viewAnnotations");
        const funnelShown = () => view.getComputedStyle(end().querySelector(".wv-al-actions")).display === "flex";
        for (let i = 0; i < 3; i++) {
            bm().click();
            await waitFor(() => idoc.getElementById("sidebarContainer").classList.contains("wv-bm-tab-on"), 5000, "bookmarks on");
            assert.isFalse(ann().classList.contains("active"), "round " + i + ": annotations tab not marked while Bookmarks is on");
            assert.isFalse(funnelShown(), "round " + i + ": no pane funnel on the Bookmarks tab");
            ann().click();
            await waitFor(() => !idoc.getElementById("sidebarContainer").classList.contains("wv-bm-tab-on"), 5000, "bookmarks off");
            await waitFor(() => ann().classList.contains("active"), 5000, "round " + i + ": annotations tab marked again");
            await waitFor(() => funnelShown(), 5000, "round " + i + ": pane funnel back");
        }
    });

    it("at Zotero's 180-px sidebar floor the funnel and its chevron stay inside the pane and the sort title ellipsises", async function () {
        // Zotero's toolbar needs 194 px with the Bookmarks tab and a funnel
        // beside the search box (8-px insets, an 8-px .end margin, a 2-px
        // gap); below 190 px those give way and the funnel keeps its chevron
        // (MJT, 2026-09-21). The sort bar's title keeps its left edge and
        // shortens with an ellipsis instead of overflowing.
        const Cu = Components.utils;
        const ir = Cu.waiveXrays(reader._internalReader);
        try { wv._wvReaderSetBmActive(reader, idoc, false); } catch (e) {}
        try { ir.toggleSidebar(true); } catch (e) {}
        try { ir.setSidebarView("annotations"); } catch (e) {}
        await waitFor(() => idoc.querySelector("#viewAnnotations.active"), 5000, "annotations view");
        const prev = ir._state.sidebarWidth;
        ir.setSidebarWidth(180);
        wv._wvAnnSetSort("dateModified", "desc", reader);
        const sc = idoc.getElementById("sidebarContainer");
        await waitFor(() => Math.round(sc.getBoundingClientRect().width) === 180, 5000, "sidebar at 180");
        const tb = idoc.querySelector("#sidebarContainer .sidebar-toolbar");
        await waitFor(() => view.getComputedStyle(tb).paddingLeft === "4px", 5000, "toolbar insets given up");
        const btn = end().querySelector(".wv-al-btn");
        assert.equal(Math.round(btn.getBoundingClientRect().width), 28, "funnel keeps its full width");
        const chev = btn.querySelector(".wv-rf-chev");
        assert.notEqual(view.getComputedStyle(chev).display, "none", "chevron kept");
        assert.isAtMost(chev.getBoundingClientRect().right, sc.getBoundingClientRect().right, "chevron inside the pane");
        assert.isAtMost(end().getBoundingClientRect().right, sc.getBoundingClientRect().right, "toolbar end inside the pane");
        const bar = await waitFor(() => idoc.querySelector(".wv-ann-sortbar"), 5000, "sort bar");
        const title = bar.querySelector(".wv-outline-head-title");
        assert.equal(Math.round(title.getBoundingClientRect().left - bar.getBoundingClientRect().left), 8, "title keeps its left edge");
        assert.equal(view.getComputedStyle(title).textOverflow, "ellipsis");
        assert.isAtLeast(bar.getBoundingClientRect().left, sc.getBoundingClientRect().left - 1, "bar inside the pane");
        ir.setSidebarWidth(prev || 240);
        wv._wvAnnSetSort("position", "asc", reader);
        await waitFor(() => view.getComputedStyle(tb).paddingLeft === "8px", 5000, "insets back");
    });

    it("a faded chip sits at 60 % like the Tag Selector's absent tags", async function () {
        const st = wv._wvAnnPaneState(reader);
        st.types = ["ink"];                      // nothing visible: every other chip fades
        await wv._wvAnnPaneApply(reader);
        wv._wvAnnListTogglePopup(reader, idoc, end().querySelector(".wv-al-btn"));
        const popup = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "popup");
        const faded = popup.querySelector(".wv-filter-opt[data-inactive='true']");
        assert.isOk(faded, "a faded chip");
        assert.equal(view.getComputedStyle(faded).opacity, "0.6");
        wv._wvCloseReaderFilterPopup(idoc);
        await wv._wvAnnPaneClear(reader);
    });
});
