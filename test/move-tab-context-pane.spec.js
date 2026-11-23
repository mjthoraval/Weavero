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
//
// WHERE THE READER OPENS: Zotero 10's Reader.open has no window option -- the
// tab goes to the most recently ACTIVATED main window (ReaderTab's constructor
// reads Services.wm.getMostRecentWindow, xpcom/reader.js in 10.0.8). before()'s
// focus() does not always win (2 local runs of 10 opened the reader in the
// second window and the select on the first threw "tab is undefined",
// 2026-11-19), so each case moves from the window the reader opened in
// (`home`) to the other one (`away`) and back.
describe("Weavero — a tab moved between main windows leaves no item pane behind", function () {
    this.timeout(120000);
    let wv, win, pdf, W2;
    const tabOf = (w) => w.Zotero_Tabs._tabs.find(t => t && t.data && t.data.itemID === pdf.id) || null;
    /** Item panes of the context pane whose tab id names no tab of their window. */
    const orphans = (w) => {
        const ids = new Set(w.Zotero_Tabs._tabs.map(t => t.id));
        return [...w.document.querySelectorAll("item-details[data-tab-id]")].map(el => el.dataset.tabId).filter(id => !ids.has(id));
    };
    const front = () => Services.wm.getMostRecentWindow("navigator:browser");
    const name = (w) => (w === win ? "the first window" : (w === W2 ? "the second window" : String(w)));
    /** The reader of the test PDF, in the window Zotero opened it in. */
    async function openHome() {
        const r = await wvT.openReaderTab(pdf.id);
        assert.isOk(r, "the reader");
        const home = r._window;
        assert.isOk(home === win || home === W2, "the reader opened in one of the two windows");
        return { r, home, away: home === win ? W2 : win };
    }
    /** Every reader of the test PDF lives in the window that holds its tab. */
    const readersConsistent = () => (/** @type {any} */ (Zotero.Reader)._readers || [])
        .filter(r => r && r.itemID === pdf.id && r.tabID)
        .map(r => { try { return { tab: r.tabID, inOwnWindow: !!(r._window && r._window.Zotero_Tabs._tabs.some(t => t.id === r.tabID)) }; } catch (e) { return { tab: r.tabID, inOwnWindow: false }; } })
        .filter(x => !x.inOwnWindow);
    async function closeTestTabs() {
        for (const w of [win, W2]) {
            try { const t = w && !w.closed && tabOf(w); if (t) w.Zotero_Tabs.close(t.id); } catch (e) {}
        }
        await wvT.waitFor(() => (!tabOf(win) && !(W2 && !W2.closed && tabOf(W2))) || null, 5000);
        await wvT.sleep(800);
    }

    before(async function () {
        // The donor swap is Zotero 9/10's: on a Zotero with its own windows the
        // move is Zotero's own moveToWindow.
        if (wvT.nativeWindows()) this.skip();   // version: Zotero 9/10's no-reload move
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvMoveTabToTarget");
        win = Zotero.getMainWindow();
        pdf = await wvT.createTestPDFItem("wv-move-ctx");
        W2 = await wvT.openMainWindow();
        assert.isOk(W2, "a second main window");
        await wvT.sleep(1500);
        win.focus();
    });

    after(async function () {
        this.timeout(30000);
        if (!pdf) return;
        try { await closeTestTabs(); } catch (e) {}
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
        // CI only: GitHub's macOS and Ubuntu runners never brought the target
        // window to the front (the move never landed within 20 s, two runs each,
        // 1.2.0 gate 2026-11-19). This case needs a target that comes to the
        // front; the next case covers a target that never does, on every platform.
        if (Services.env.exists("CI") && (Zotero.isMac || Zotero.isLinux)) this.skip();
        const { r, home, away } = await openHome();
        home.Zotero_Tabs.select(r.tabID);
        await wvT.sleep(1500);
        await wv._wvMoveTabToTarget(home, r.tabID, { win: away, isReader: false, groupId: null });
        // The moved tab takes its original id back a moment after it lands
        // (_wvRenameTab, on a timer): read the id once it has settled, or a
        // select may name the donor id that is gone (full suite 2026-11-13:
        // "tab is undefined" from Zotero_Tabs.select).
        assert.isOk(await wvT.waitFor(() => (!tabOf(home) && tabOf(away)) || null, 20000), "the tab is in " + name(away) + " (it opened in " + name(home) + ")");
        await wvT.sleep(1500);
        away.Zotero_Tabs.select(tabOf(away).id);
        await wvT.sleep(1500);
        await wv._wvMoveTabToTarget(away, tabOf(away).id, { win: home, isReader: false, groupId: null });
        assert.isOk(await wvT.waitFor(() => (tabOf(home) && !tabOf(away)) || null, 20000), "the tab is back in " + name(home));
        await wvT.sleep(1500);
        const t1 = tabOf(home);
        home.Zotero_Tabs.select(t1.id);
        await wvT.sleep(1500);
        const during = { home: orphans(home), away: orphans(away) };
        home.Zotero_Tabs.close(t1.id);
        await wvT.waitFor(() => !tabOf(home), 5000);
        await wvT.sleep(800);
        const after = { home: orphans(home), away: orphans(away) };
        assert.deepEqual(during, { home: [], away: [] }, "item panes under a tab id that is gone, while the tab is open");
        assert.deepEqual(after, { home: [], away: [] }, "item panes under a tab id that is gone, after the tab closed");
    });

    // The target window never comes to the front: what a foreground lock does on
    // Windows, and (by every sign) GitHub's macOS and Ubuntu runners. Zotero 10
    // opens the swap's donor in the window that IS in front -- the source -- and
    // the swap used to commit into it: the tab stayed where it was, its reader
    // re-homed on a window that did not hold it (2026-11-20). The move must land
    // in the target all the same. `focus` is stubbed on the target so nothing
    // brings it forward; the precondition is checked before and after.
    it("a move to a window that never comes to the front lands there, and the reader stays in the window holding its tab", async function () {
        await closeTestTabs();
        const { r, home, away } = await openHome();
        home.Zotero_Tabs.select(r.tabID);
        await wvT.sleep(1500);
        assert.strictEqual(name(front()), name(home), "precondition: the window holding the reader is in front");
        const ownFocus = Object.getOwnPropertyDescriptor(away, "focus");
        away.focus = function () {};
        let landed = null, frontAfter = null, inconsistent = null;
        try {
            await wv._wvMoveTabToTarget(home, r.tabID, { win: away, isReader: false, groupId: null });
            landed = await wvT.waitFor(() => (!tabOf(home) && tabOf(away)) || null, 20000);
            await wvT.sleep(1000);
            frontAfter = front();
            inconsistent = readersConsistent();
        }
        finally {
            if (ownFocus) Object.defineProperty(away, "focus", ownFocus);
            else delete away.focus;
        }
        assert.strictEqual(name(frontAfter), name(home), "precondition held: the target never came to the front");
        assert.isOk(landed, "the tab is in " + name(away) + " (home " + name(home) + "; home tab " + JSON.stringify(tabOf(home) && { id: tabOf(home).id, type: tabOf(home).type })
            + ", away tab " + JSON.stringify(tabOf(away) && { id: tabOf(away).id, type: tabOf(away).type }) + ")");
        assert.deepEqual(inconsistent, [], "every reader of the document is in the window that holds its tab");
        // Back, with the home window in front as it has been all along.
        await wv._wvMoveTabToTarget(away, tabOf(away).id, { win: home, isReader: false, groupId: null });
        assert.isOk(await wvT.waitFor(() => (tabOf(home) && !tabOf(away)) || null, 20000), "the tab is back in " + name(home));
        await wvT.sleep(1500);
        const t1 = tabOf(home);
        home.Zotero_Tabs.select(t1.id);
        await wvT.sleep(1500);
        assert.deepEqual(readersConsistent(), [], "back home: every reader is in the window that holds its tab");
        const during = { home: orphans(home), away: orphans(away) };
        home.Zotero_Tabs.close(t1.id);
        await wvT.waitFor(() => !tabOf(home), 5000);
        await wvT.sleep(800);
        assert.deepEqual(during, { home: [], away: [] }, "item panes under a tab id that is gone");
        assert.deepEqual({ home: orphans(home), away: orphans(away) }, { home: [], away: [] }, "item panes under a tab id that is gone, after the tab closed");
    });
});
