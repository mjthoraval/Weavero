/* global describe, it, before, after, assert, Zotero, wvT */

// The pinned item-pane section and the open / collapsed state of the item
// pane's sections, per main window (MJT 2026-10-26: "The pinning should be
// window specific", then "Do the pinned window specific + Open or collapsed
// item pane sections window specific"; intake: a new window starts with no
// pin, each window's pin comes back after a restart). Zotero keeps ONE of
// each for every window: the `pinnedPane` pref and a `panes.<pane>.open`
// pref per section, each watched by every pane. The first window keeps
// Zotero's own (it works without Weavero); every other main window keeps its
// own, saved with the window. Written before the code.

describe("Weavero — pinned section and open sections per main window", function () {
    this.timeout(90000);
    let wv, win, w2, item, pin0, tagsOpen0;
    const opened = [];
    const det = (w) => w.document.querySelector("#zotero-item-pane item-details");
    const tags = (w) => det(w).querySelector('collapsible-section[data-pane="tags"]');
    const pinOf = (w) => det(w).pinnedPane || det(w)._pendingPinnedPane || "";

    async function spawn(state) {
        const s = wv._wvSpawnMainWindowStart(state);
        const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
        assert.isOk(w, "a new main window");
        opened.push(w);
        await wvT.waitFor(() => det(w) && det(w)._paneParent && tags(w), 5000);
        return w;
    }

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvWireWindowPanePrefs", "_wvTeardownWindowPanePrefs", "_wvTabSessionCaptureMainState",
            "_wvTabSessionApplyMainState", "_wvSpawnMainWindowStart", "_wvSpawnMainWindowWait"]) wvT.method(m);
        win = Zotero.getMainWindow();
        pin0 = Zotero.Prefs.get("pinnedPane");
        tagsOpen0 = Zotero.Prefs.get("panes.tags.open");
        item = await wvT.createItem("journalArticle", { title: "WV window pane prefs" });
        await win.ZoteroPane.selectItem(item.id);
        det(win).pinnedPane = "";
        tags(win).open = true;
        w2 = await spawn();
        await w2.ZoteroPane.selectItem(item.id);
        await wvT.waitFor(() => det(w2).getEnabledPane("related"), 5000);
    });

    after(async function () {
        for (const w of opened) { try { if (!w.closed) { w._wvSavedParkClose = true; w.close(); } } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
        try { det(win).pinnedPane = ""; } catch (e) {}
        if (pin0) Zotero.Prefs.set("pinnedPane", pin0); else Zotero.Prefs.clear("pinnedPane");
        if (tagsOpen0 === undefined) Zotero.Prefs.clear("panes.tags.open"); else Zotero.Prefs.set("panes.tags.open", tagsOpen0);
        await wvT.erase(item);
    });

    it("a second window pins on its own; the first keeps Zotero's shared pin", function () {
        det(w2).pinnedPane = "related";
        assert.strictEqual(det(w2).pinnedPane, "related", "pinned in the second window");
        assert.strictEqual(det(win).pinnedPane, "", "the first window is not pinned by it");
        assert.isNotOk(Zotero.Prefs.get("pinnedPane"), "Zotero's shared pin untouched");
        det(win).pinnedPane = "tags";
        assert.strictEqual(Zotero.Prefs.get("pinnedPane"), "tags", "the first window pins through Zotero's own setting");
        assert.strictEqual(det(w2).pinnedPane, "related", "the second window keeps its own");
        det(w2)._restorePinnedPane();   // what each item render does
        assert.strictEqual(det(w2).pinnedPane, "related", "showing another item keeps it");
    });

    it("a new window starts with no pin", async function () {
        assert.strictEqual(Zotero.Prefs.get("pinnedPane"), "tags", "the first window has one");
        const w3 = await spawn();
        await wvT.waitFor(() => !pinOf(w3), 3000);
        assert.strictEqual(pinOf(w3), "", "no pin in the new window");
        assert.strictEqual(Zotero.Prefs.get("pinnedPane"), "tags", "and the first window keeps its own");
    });

    it("a section opened or collapsed in one window stays so in that window only", function () {
        tags(w2).open = true;
        tags(win).open = true;
        tags(w2).open = false;
        assert.isFalse(tags(w2).open, "collapsed in the second window");
        assert.isTrue(tags(win).open, "still open in the first");
        assert.isTrue(Zotero.Prefs.get("panes.tags.open"), "Zotero's shared state untouched");
        tags(win).open = false;
        tags(w2).open = true;
        assert.isFalse(tags(win).open, "the first window's own collapse");
        assert.isTrue(tags(w2).open, "the second window's own open");
        assert.isFalse(Zotero.Prefs.get("panes.tags.open"), "the first window writes Zotero's own setting");
    });

    it("each window's pin and sections are saved with it and come back", async function () {
        tags(w2).open = false;
        const ms = wv._wvTabSessionCaptureMainState(w2);
        assert.strictEqual(ms.pinnedPane, "related", "the pin is captured");
        assert.strictEqual(ms.paneOpen && ms.paneOpen.tags, false, "the sections are captured");
        const w4 = await spawn({ tabs: [{ type: "library", title: "My Library", data: { icon: "library" }, selected: true }], wvMainState: { pinnedPane: "related", paneOpen: { tags: false } } });
        await wvT.waitFor(() => pinOf(w4) === "related", 5000);
        assert.strictEqual(pinOf(w4), "related", "the pin came back");
        assert.isFalse(tags(w4).open, "the collapsed section came back");
        assert.isFalse(Zotero.Prefs.get("panes.tags.open"), "the first window's state untouched");
    });

    it("with Weavero stopped, a second window follows Zotero's shared pin and sections again", function () {
        wv._wvTeardownWindowPanePrefs();
        try {
            Zotero.Prefs.set("panes.tags.open", true);
            assert.isTrue(tags(w2).open, "the section follows the shared state");
            Zotero.Prefs.set("pinnedPane", "libraries-collections");
            assert.strictEqual(pinOf(w2), "libraries-collections", "the pin follows the shared one");
        }
        finally { for (const w of Zotero.getMainWindows()) wv._wvWireWindowPanePrefs(w); }
    });
});
