/* global describe, it, before, after, assert, Zotero, Services, wvT */
// A reader tab moved to another main window and back leaves no item pane
// behind in the context pane (leak probe 2026-11-13, Zotero 10.0.8).
//
// Zotero's context pane keeps one item pane per reader tab, named by the
// tab's id (contextPane.js: `data-tab-id`), and removes it when that tab
// closes. Weavero's no-reload move between main windows (Zotero 9/10) opens
// a donor tab in the target window -- the context pane makes an item pane
// for the donor's id -- then gives the moved tab its original id back
// (_wvRenameTab). The item pane kept the donor's id: no tab ever closed
// under it, and every move left one more item pane, its attachment-note
// editor frame with it, in the window for as long as the window lived.
describe("Weavero — a tab moved between main windows leaves no item pane behind", function () {
    this.timeout(120000);
    let wv, win, ZT, pdf, W2;
    const tabOf = (w) => w.Zotero_Tabs._tabs.find(t => t && t.data && t.data.itemID === pdf.id) || null;
    /** Item panes of the context pane whose tab id names no tab of their window. */
    const orphans = (w) => {
        const ids = new Set(w.Zotero_Tabs._tabs.map(t => t.id));
        return [...w.document.querySelectorAll("item-details[data-tab-id]")].map(el => el.dataset.tabId).filter(id => !ids.has(id));
    };

    before(async function () {
        // The donor swap is Zotero 9/10's: on a Zotero with its own windows the
        // move is Zotero's own moveToWindow.
        if (wvT.nativeWindows()) this.skip();   // version: Zotero 9/10's no-reload move
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvMoveTabToTarget");
        win = Zotero.getMainWindow(); ZT = win.Zotero_Tabs;
        pdf = await wvT.createTestPDFItem("wv-move-ctx");
        W2 = await wvT.openMainWindow();
        assert.isOk(W2, "a second main window");
        await wvT.sleep(1500);
        win.focus();
    });

    after(async function () {
        this.timeout(30000);
        if (!pdf) return;
        try { const t = tabOf(win); if (t) ZT.close(t.id); } catch (e) {}
        try { const t = W2 && !W2.closed && tabOf(W2); if (t) W2.Zotero_Tabs.close(t.id); } catch (e) {}
        try { if (W2 && !W2.closed) { W2._wvSavedParkClose = true; W2.close(); } } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 10000);
        try {
            const S = /** @type {any} */ (Zotero).Session;
            const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
            if (last && last.window) S.takeLastClosed();
        }
        catch (e) {}
        await wvT.sleep(1000);
        await wvT.erase(pdf);
    });

    it("a reader tab moved to a second window and back: no item pane under a tab id that is gone, in either window", async function () {
        // CI only (1.2.0 gate, 2026-11-19, MJT: "Skip on CI, release now"): on GitHub's
        // macOS and Ubuntu runners with Zotero 10 the move never landed within 20 s (two
        // runs each); Windows CI and local runs move it (locally on 10.0.8 the test also
        // fails now and then AFTER the move, "tab is undefined": the 2026-11-16 TODO entry).
        // Unexplained: to check on Linux and macOS by hand (work/TODO.md).
        if (Services.env.exists("CI") && (Zotero.isMac || Zotero.isLinux)) this.skip();
        const r = await wvT.openReaderTab(pdf.id);
        assert.isOk(r, "the reader");
        ZT.select(r.tabID);
        await wvT.sleep(1500);
        await wv._wvMoveTabToTarget(win, r.tabID, { win: W2, isReader: false, groupId: null });
        // The moved tab takes its original id back a moment after it lands
        // (_wvRenameTab, on a timer): read the id once it has settled, or a
        // select may name the donor id that is gone (full suite 2026-11-13:
        // "tab is undefined" from Zotero_Tabs.select).
        assert.isOk(await wvT.waitFor(() => (!tabOf(win) && tabOf(W2)) || null, 20000), "the tab is in the second window");
        await wvT.sleep(1500);
        W2.Zotero_Tabs.select(tabOf(W2).id);
        await wvT.sleep(1500);
        await wv._wvMoveTabToTarget(W2, tabOf(W2).id, { win, isReader: false, groupId: null });
        assert.isOk(await wvT.waitFor(() => (tabOf(win) && !tabOf(W2)) || null, 20000), "the tab is back");
        await wvT.sleep(1500);
        const t1 = tabOf(win);
        ZT.select(t1.id);
        await wvT.sleep(1500);
        const during = { main: orphans(win), second: orphans(W2) };
        ZT.close(t1.id);
        await wvT.waitFor(() => !tabOf(win), 5000);
        await wvT.sleep(800);
        const after = { main: orphans(win), second: orphans(W2) };
        assert.deepEqual(during, { main: [], second: [] }, "item panes under a tab id that is gone, while the tab is open");
        assert.deepEqual(after, { main: [], second: [] }, "item panes under a tab id that is gone, after the tab closed");
    });
});
