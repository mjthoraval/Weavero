/* global describe, it, before, after, assert, Zotero */
// A multi-tab drag between windows keeps the moved tabs MULTI-SELECTED in the
// destination, the dragged one active -- Firefox's drop handler selects the
// dragged tab and re-ranges the selection over the moved tabs
// (drag-and-drop.js addRangeToMultiSelectedTabs). MJT 2026-10-16: "After I
// drag 2 tabs from one window to another, only one tab is selected after
// dropping" -- the main->reader-window, reader->main and reader->reader movers
// selected the dragged tab only; main->main already restored the set.
//
// Drives the movers directly (a synthetic cross-window drag is untrusted and
// never reaches the other window). Fixtures: two NOTE tabs (the classic
// close+mount path, no live reader to swap) and one or two reader windows.
describe("Weavero — cross-window multi-tab moves keep the selection", function () {
    this.timeout(180000);
    let wv, win, parent, pdf, pdf2, pA, pB, nA, nB, rw, rw2;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const mainTab = (it) => win.Zotero_Tabs._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const stripTabs = (w) => (w && !w.closed && w._wvWT && w._wvWT.tabs) || [];
    const stripTab = (w, it) => stripTabs(w).find(t => t.itemID === it.id) || null;
    const stripMarked = (w) => w.document.querySelectorAll(".wv-window-tabs .wv-window-tab.wv-multisel").length;
    async function openReaderWindow(item) {
        const reader = await Zotero.Reader.open(item.id, null, { openInWindow: true, allowDuplicate: true });
        const w = reader && reader._window;
        assert.isOk(w, "reader window for " + item.id);
        try { await reader._initPromise; } catch (e) {}
        await wvT.waitFor(() => w._wvWT && w._wvWT.tabs && w._wvWT.tabs.length, 15000);
        if (!(w._wvWT && w._wvWT.tabs.length)) wv._wvWTEnsureNativeTab(w);
        return w;
    }
    async function notesToReaderWindow(w) {
        const tA = mainTab(nA), tB = mainTab(nB);
        assert.ok(tA && tB, "both notes open as main-window tabs");
        win._wvSelTabIDs = new Set([tA.id, tB.id]); wv._wvTabMultiSelSync(win);
        await wv._wvWTMountMainSelectionHere(w, win, [tA.id, tB.id], tA.id);
        assert.ok(await wvT.waitFor(() => stripTab(w, nA) && stripTab(w, nB), 20000), "both notes landed in the strip");
        await sleep(400);
    }

    before(async function () {
        wv = await wvT.waitFor(() => Zotero.Weavero && Zotero.Weavero.plugin, 20000);
        for (const m of ["_wvWTMountMainSelectionHere", "_wvWTMoveSelectionToMain", "_wvWTHandleCrossWindowDrop",
            "_wvWTMultiSelSync", "_wvTabMultiSelSync", "_wvWTEnsureNativeTab"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow();
        await wvT.settleSecondaryWindows();
        nA = new Zotero.Item("note"); nA.setNote("<p>wv xwin A</p>"); await nA.saveTx();
        nB = new Zotero.Item("note"); nB.setNote("<p>wv xwin B</p>"); await nB.saveTx();
        for (const it of [nA, nB]) {
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await wvT.waitFor(() => mainTab(it), 15000);
        }
        parent = await wvT.createItem("journalArticle", { title: "WV-TEST cross-window multisel" });
        pdf = await wvT.createTestPDFItem("wv-xwin-1", { parentItemID: parent.id });
        rw = await openReaderWindow(pdf);
    });

    after(async function () {
        this.timeout(30000);
        for (const w of [rw, rw2]) { try { if (w && !w.closed) w.close(); } catch (e) {} }
        await sleep(600);
        wvT.purgeDeadReaders();
        for (const it of [nA, nB, pA, pB]) { const t = it && mainTab(it); if (t) { try { win.Zotero_Tabs.close(t.id); } catch (e) {} } }
        try { win._wvSelTabIDs = new Set(); wv._wvTabMultiSelSync(win); } catch (e) {}
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        await wvT.erase(nA, nB, pdf, pdf2, pA, pB, parent);
    });

    it("main -> reader window: both moved tabs are multi-selected in the strip", async function () {
        await notesToReaderWindow(rw);
        const ids = [stripTab(rw, nA).id, stripTab(rw, nB).id];
        const sel = rw._wvSelWTabIDs;
        assert.ok(sel && ids.every(id => sel.has(id)), "both in the strip's selection: " + (sel ? Array.from(sel).join(",") : sel) + " vs " + ids.join(","));
        assert.isAtLeast(stripMarked(rw), 2, "both strip tabs carry the multi-selection mark");
        assert.notOk(mainTab(nA) || mainTab(nB), "the source tabs left the main window");
        assert.strictEqual(rw._wvWT.activeId, ids[0], "the dragged note is the strip's active tab");
    });

    it("reader window -> main: both moved tabs are multi-selected in the tab bar, the dragged one active", async function () {
        const ids = [stripTab(rw, nA).id, stripTab(rw, nB).id];
        rw._wvSelWTabIDs = new Set(ids); wv._wvWTMultiSelSync(rw);
        wv._wvWTMoveSelectionToMain(rw, ids, win, ids[1]);
        assert.ok(await wvT.waitFor(() => mainTab(nA) && mainTab(nB), 20000), "both notes back in the main window");
        await sleep(500);
        const tA = mainTab(nA), tB = mainTab(nB);
        const sel = win._wvSelTabIDs;
        assert.ok(sel && sel.has(tA.id) && sel.has(tB.id), "both in the main window's selection: " + (sel ? Array.from(sel).join(",") : sel));
        assert.strictEqual(win.Zotero_Tabs.selectedID, tB.id, "the dragged tab is the active one");
        assert.isAtLeast(win.document.querySelectorAll("#tab-bar-container .tab.wv-multisel").length, 2, "both tabs carry the multi-selection mark");
        assert.notOk(stripTab(rw, nA) || stripTab(rw, nB), "the strip no longer holds them");
    });

    it("reader window -> reader window: both moved tabs are multi-selected in the destination strip", async function () {
        await notesToReaderWindow(rw);
        pdf2 = await wvT.createTestPDFItem("wv-xwin-2", { parentItemID: parent.id });
        rw2 = await openReaderWindow(pdf2);
        const ids = [stripTab(rw, nA).id, stripTab(rw, nB).id];
        // What a drag from rw's strip leaves on the live plugin for rw2's drop.
        rw._wvSelWTabIDs = new Set(ids); wv._wvWTMultiSelSync(rw);
        wv._wvMergeDragInfo = { itemID: nA.id, sourceTabId: ids[0], title: "A", readerType: "note" };
        wv._wvMergeDragSourceWin = rw;
        wv._wvWTHandleCrossWindowDrop(rw2);
        assert.ok(await wvT.waitFor(() => stripTab(rw2, nA) && stripTab(rw2, nB), 20000), "both notes landed in the second window's strip");
        await sleep(500);
        const ids2 = [stripTab(rw2, nA).id, stripTab(rw2, nB).id];
        const sel = rw2._wvSelWTabIDs;
        assert.ok(sel && ids2.every(id => sel.has(id)), "both in the destination strip's selection: " + (sel ? Array.from(sel).join(",") : sel) + " vs " + ids2.join(","));
        assert.isAtLeast(stripMarked(rw2), 2, "both carry the multi-selection mark");
        assert.notOk(stripTab(rw, nA) || stripTab(rw, nB), "the source strip no longer holds them");
        // Back to the main window for the teardown.
        wv._wvWTMoveSelectionToMain(rw2, ids2, win, ids2[0]);
        await wvT.waitFor(() => mainTab(nA) && mainTab(nB), 20000);
    });

    it("main -> reader window with two live PDF readers (the no-reload swap path): both multi-selected, the dragged one active", async function () {
        // MJT's case (2026-10-16, dev.32): two PDF tabs dragged from the main
        // window onto a reader window's strip landed with one ring only. The
        // note tabs above take the classic close+mount path; PDFs with live
        // readers go through _wvWTSwapInReader + rename.
        pA = await wvT.createTestPDFItem("wv-xwin-pA", { parentItemID: parent.id });
        pB = await wvT.createTestPDFItem("wv-xwin-pB", { parentItemID: parent.id });
        for (const it of [pA, pB]) {
            await wvT.openReaderTab(it.id);
            await wvT.waitFor(() => mainTab(it), 15000);
            await wvT.waitFor(() => {
                const r = (Zotero.Reader._readers || []).find(x => { try { return x.itemID === it.id && x._window === win; } catch (e) { return false; } });
                return r && r._internalReader && r._iframeWindow;
            }, 20000);
        }
        const tA = mainTab(pA), tB = mainTab(pB);
        win._wvSelTabIDs = new Set([tA.id, tB.id]); wv._wvTabMultiSelSync(win);
        const stripX = (() => { try { const b = rw.document.querySelector(".wv-window-tabs"); return b ? Math.round(b.getBoundingClientRect().left + 40) : 40; } catch (e) { return 40; } })();
        await wv._wvWTMountMainSelectionHere(rw, win, [tA.id, tB.id], tA.id, stripX);
        assert.ok(await wvT.waitFor(() => stripTab(rw, pA) && stripTab(rw, pB), 25000), "both PDFs landed in the strip: " + JSON.stringify(stripTabs(rw).map(t => t.id + ":" + t.itemID)));
        await sleep(500);
        const ids = [stripTab(rw, pA).id, stripTab(rw, pB).id];
        const sel = rw._wvSelWTabIDs;
        assert.ok(sel && ids.every(id => sel.has(id)), "both in the strip's selection: " + (sel ? Array.from(sel).join(",") : sel) + " vs " + ids.join(","));
        assert.isAtLeast(stripMarked(rw), 2, "both strip tabs carry the multi-selection mark");
        assert.strictEqual(rw._wvWT.activeId, ids[0], "the dragged PDF is the strip's active tab");
        assert.notOk(mainTab(pA) || mainTab(pB), "the source tabs left the main window");
    });

    it("reader window -> main with two PDFs: both multi-selected once the dragged one has LOADED, its id unchanged", async function () {
        // The moved tabs arrive as reader-unloaded; selecting the dragged one
        // loads its reader (tabs.js select -> load hook). The selection must
        // survive that load (MJT's screenshot 2026-10-16: the dragged PDF wore
        // the plain selected ring, only the follower the multi-selection mark).
        const ids = [stripTab(rw, pA).id, stripTab(rw, pB).id];
        rw._wvSelWTabIDs = new Set(ids); wv._wvWTMultiSelSync(rw);
        wv._wvWTMoveSelectionToMain(rw, ids, win, ids[0]);
        assert.ok(await wvT.waitFor(() => mainTab(pA) && mainTab(pB), 20000), "both PDFs back in the main window");
        const tA = mainTab(pA), tB = mainTab(pB);
        const idA = tA.id, idB = tB.id;
        // Wait for the dragged tab's reader to load (reader-loading -> reader).
        assert.ok(await wvT.waitFor(() => { const t = mainTab(pA); return t && t.type === "reader" && win.Zotero_Tabs.selectedID === t.id; }, 30000),
            "the dragged PDF loaded and is active: type=" + (mainTab(pA) && mainTab(pA).type) + " selected=" + win.Zotero_Tabs.selectedID);
        await sleep(600);
        assert.strictEqual(mainTab(pA).id, idA, "the dragged tab kept its id through the load");
        const sel = win._wvSelTabIDs;
        assert.ok(sel && sel.has(idA) && sel.has(idB), "both in the main window's selection after the load: " + (sel ? Array.from(sel).join(",") : sel) + " vs " + idA + "," + idB);
        const marked = Array.from(win.document.querySelectorAll("#tab-bar-container .tab.wv-multisel")).map(t => t.dataset.id);
        assert.ok(marked.includes(idA) && marked.includes(idB), "both tabs carry the multi-selection mark: " + marked.join(","));
    });
});
