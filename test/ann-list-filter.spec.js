/* global describe, it, before, after, assert, Zotero, Services, Components, PathUtils, IOUtils */
// Annotations-list funnel (issue #43): hide annotation TYPES from the
// reader's sidebar list while the page keeps drawing them.
//
// Contract under test:
//   * resolution — the six global `weavero.annListShow<Type>` prefs give the
//     default hidden set; a per-document DEPARTURE in ann-order.json wins;
//     storing a set equal to the default removes the departure (the outline
//     page-numbers rule); a sort write must not drop the departure;
//   * the live reader — hiding a type removes its rows from the sidebar
//     (Zotero's own `_hidden` flag, so Select All skips them too) while the
//     page view still holds the annotation; showing it again restores the
//     row; the funnel button and its accent dot follow the state.
describe("Weavero — annotations-list funnel (issue #43)", function () {
    this.timeout(90000);
    let wv, win, att, hl, ink, reader;
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
        return body + xref + "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n"
            + xrefPos + "\n%%EOF\n";
    }
    const prefsOf = (types) => Object.fromEntries(types.map(t => [t, Zotero.Prefs.get(wv._wvAnnListPrefName(t))]));
    const cards = (idoc) => [...idoc.querySelectorAll("#annotationsView .annotation[data-sidebar-annotation-id]")]
        .map(c => c.getAttribute("data-sidebar-annotation-id"));
    const pageKeys = () => {
        const Cu = Components.utils;
        const pv = Cu.waiveXrays(reader._internalReader._primaryView);
        return (pv._annotations || []).map(a => String(a.id));
    };
    const visibleKeys = () => {
        const Cu = Components.utils;
        const ir = Cu.waiveXrays(reader._internalReader);
        return (ir._state.annotations || []).filter(a => !a._hidden).map(a => String(a.id));
    };

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAnnListHidden !== "function") this.skip();
        win = Zotero.getMainWindow();
        const path = PathUtils.join(PathUtils.tempDir, "wv-al-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        const mk = async (type, text, y, extra) => {
            const a = /** @type {any} */ (new Zotero.Item("annotation"));
            a.libraryID = att.libraryID;
            a.parentID = att.id;
            a.annotationType = type;
            if (text) a.annotationText = text;
            a.annotationComment = "";
            a.annotationColor = "#ffd400";
            a.annotationPageLabel = "1";
            a.annotationSortIndex = "00000|" + String(700 - y).padStart(6, "0") + "|00000";
            a.annotationPosition = JSON.stringify(Object.assign({ pageIndex: 0 }, extra));
            await a.saveTx();
            return a;
        };
        hl = await mk("highlight", "a highlight", 700, { rects: [[40, 700, 300, 712]] });
        ink = await mk("ink", null, 600, { paths: [[40, 600, 120, 640, 200, 600]], width: 2 });
        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        reader = await waitFor(() => Zotero.Reader._readers.find(r => r.itemID === att.id
            && r._internalReader && r._iframeWindow), 30000, "reader");
        try { reader._internalReader.toggleSidebar(true); } catch (e) {}
        try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
        await waitFor(() => cards(reader._iframeWindow.document).length === 2, 30000, "two sidebar cards");
    });

    after(async function () {
        try { await wv._wvAnnListSetHidden(reader, null); } catch (e) {}
        for (const t of wv._wvAnnListTypes()) { try { Zotero.Prefs.set(wv._wvAnnListPrefName(t), true); } catch (e) {} }
        try { if (reader && reader.tabID) win.Zotero_Tabs.close(reader.tabID); } catch (e) {}
        try { if (hl) await hl.eraseTx(); } catch (e) {}
        try { if (ink) await ink.eraseTx(); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("global default: all six types shown, prefs registered TRUE", function () {
        assert.deepEqual(wv._wvAnnListGlobalHidden(), []);
        const p = prefsOf(wv._wvAnnListTypes());
        for (const t of wv._wvAnnListTypes()) assert.strictEqual(p[t], true, t);
    });

    it("a per-document set is stored only as a DEPARTURE from the default", async function () {
        assert.isFalse(wv._wvAnnListIsDeparture(reader));
        await wv._wvAnnListSetHidden(reader, ["ink"]);
        assert.isTrue(wv._wvAnnListIsDeparture(reader));
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"]);
        // Equal to the default (nothing hidden) -> the record goes away.
        await wv._wvAnnListSetHidden(reader, []);
        assert.isFalse(wv._wvAnnListIsDeparture(reader));
        assert.deepEqual(wv._wvAnnListHidden(reader), []);
    });

    it("a sort write keeps the departure", async function () {
        await wv._wvAnnListSetHidden(reader, ["ink"]);
        wv._wvAnnSetSort("dateModified", "desc", reader);
        await sleep(600);
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"], "listHide survived the sort write");
        wv._wvAnnSetSort("position", "asc", reader);
        await sleep(600);
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"]);
        await wv._wvAnnListSetHidden(reader, null);
    });

    it("the funnel sits in the sidebar toolbar beside the search box", function () {
        const idoc = reader._iframeWindow.document;
        const host = idoc.querySelector("#sidebarContainer .sidebar-toolbar .end .wv-al-actions");
        assert.isOk(host, "host in the toolbar's end slot");
        assert.isOk(host.querySelector("button.wv-al-btn"), "funnel button");
        assert.isOk(idoc.querySelector("#sidebarContainer .sidebar-toolbar .end .search-box"), "native search box still there");
        assert.isFalse(host.querySelector("button.wv-al-btn").classList.contains("wv-bm-filter-active"), "no dot while nothing is hidden");
    });

    it("hiding ink removes its row from the list, keeps it on the page, and Select All skips it", async function () {
        const idoc = reader._iframeWindow.document;
        assert.sameMembers(cards(idoc), [hl.key, ink.key], "both rows before");
        await wv._wvAnnListSetHidden(reader, ["ink"]);
        wv._wvAnnListApply(reader, true);
        await waitFor(() => cards(idoc).length === 1, 15000, "ink row gone");
        assert.deepEqual(cards(idoc), [hl.key]);
        assert.sameMembers(visibleKeys(), [hl.key], "Zotero's own visible set (Select All) excludes ink");
        await waitFor(() => pageKeys().indexOf(ink.key) >= 0, 15000, "ink still on the page view");
        assert.sameMembers(pageKeys(), [hl.key, ink.key], "page keeps both");
        const btn = idoc.querySelector("#sidebarContainer .wv-al-btn");
        assert.isTrue(btn.classList.contains("wv-bm-filter-active"), "accent dot while a type is hidden");
    });

    it("the popup marks the hidden chip and reports the document as a departure", async function () {
        const idoc = reader._iframeWindow.document;
        const btn = idoc.querySelector("#sidebarContainer .wv-al-btn");
        wv._wvAnnListTogglePopup(reader, idoc, btn);
        const popup = await waitFor(() => idoc.getElementById("wv-reader-filter-popup-v2"), 5000, "popup");
        assert.equal(popup.dataset.wvKind, "list");
        const chips = [...popup.querySelectorAll(".wv-filter-opt")];
        assert.equal(chips.length, 6, "one chip per type, present or not");
        const excluded = chips.filter(c => c.dataset.excluded === "true");
        assert.equal(excluded.length, 1);
        assert.include(popup.querySelector(".wv-al-foot").textContent, "This document only");
        assert.isOk(popup.querySelector(".wv-al-foot-btn"), "Use as default / Back to default offered");
        wv._wvCloseReaderFilterPopup(idoc);
        assert.isNull(idoc.getElementById("wv-reader-filter-popup-v2"));
    });

    it("showing ink again restores the row; the default footer returns", async function () {
        const idoc = reader._iframeWindow.document;
        await wv._wvAnnListSetHidden(reader, []);
        wv._wvAnnListApply(reader, true);
        await waitFor(() => cards(idoc).length === 2, 15000, "ink row back");
        assert.sameMembers(visibleKeys(), [hl.key, ink.key]);
        assert.isFalse(wv._wvAnnListIsDeparture(reader));
        const btn = idoc.querySelector("#sidebarContainer .wv-al-btn");
        assert.isFalse(btn.classList.contains("wv-bm-filter-active"));
    });

    it("'Use as default' writes the prefs and drops the departure; a pref flip re-applies live", async function () {
        const idoc = reader._iframeWindow.document;
        await wv._wvAnnListSetHidden(reader, ["ink"]);
        await wv._wvAnnListUseAsDefault(reader);
        assert.strictEqual(Zotero.Prefs.get(wv._wvAnnListPrefName("ink")), false);
        assert.isFalse(wv._wvAnnListIsDeparture(reader), "no departure once the default matches");
        assert.deepEqual(wv._wvAnnListHidden(reader), ["ink"]);
        wv._wvAnnListEnsure(reader, idoc);
        await waitFor(() => cards(idoc).length === 1, 15000, "ink hidden by the default");
        // Flip the pref back: the watcher re-applies to the open reader.
        Zotero.Prefs.set(wv._wvAnnListPrefName("ink"), true);
        await waitFor(() => cards(idoc).length === 2, 15000, "ink back after the pref flip");
    });

    it("no error-console entries from the feature", function () {
        const errs = (Zotero.getErrors(true) || []).map(String);
        assert.deepEqual(errs.filter(e => /_wvAnnList/.test(e)), []);
    });
});
