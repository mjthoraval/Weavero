/* global describe, it, before, after, assert, Zotero, IOUtils */

// Custom window titles are part of the window's own saved state (MJT
// 2026-10-05): captured as `title` with the library view, applied back from
// it (absent = the default "Window N"), and the first window's title rides
// the window store's `anchorTitle`. They used to be keyed by POSITION
// (pref weavero.windowTitles): closing Window 2 handed its title to Window 3.

describe("Weavero — custom window titles live in the window's state", () => {
    let wv, win, prev;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvWindowSetCustomTitle !== "function") wvT.absent('!wv || typeof wv._wvWindowSetCustomTitle !== "function"');
        win = Zotero.getMainWindow();
        prev = win._wvWindowTitle;
    });

    after(() => {
        if (!wv) return;
        win._wvWindowTitle = prev;
    });

    it("a custom title is captured with the window's state and applied back; absent clears it", async () => {
        wv._wvWindowSetCustomTitle(win, "Drafts");
        const ms = wv._wvTabSessionCaptureMainState(win);
        assert.equal(ms.title, "Drafts");
        await wv._wvTabSessionApplyMainState(win, { collection: ms.collection });
        assert.isNull(wv._wvWindowCustomTitle(win), "a state without a title gives the default name");
        assert.match(wv._wvWindowName(win), /^Window \d+$/);
        await wv._wvTabSessionApplyMainState(win, ms);
        assert.equal(wv._wvWindowName(win), "Drafts");
    });

    it("setting a title no longer writes the by-position pref", () => {
        try { Zotero.Prefs.clear("weavero.windowTitles", true); } catch (_) {}
        wv._wvWindowSetCustomTitle(win, "Reading");
        assert.notOk(Zotero.Prefs.get("weavero.windowTitles", true), "nothing keyed by position");
        wv._wvWindowSetCustomTitle(win, "");
    });

    it("the window store carries the first window's title in its own field", async function () {
        this.timeout(10000);
        wv._wvWindowSetCustomTitle(win, "Library A");
        wv._wvWindowStoreSaveSync();
        await new Promise(r => win.setTimeout(r, 300));
        const doc = JSON.parse(await IOUtils.readUTF8(wv._wvWindowStorePath()));
        assert.equal(doc.anchorTitle, "Library A");
        wv._wvWindowSetCustomTitle(win, "");
    });

    // Survey 2026-10-06: the quit flush built its document by hand, without
    // anchorHidden / anchorTitle -- a clean quit lost both, a crash kept them.
    // Both writers must go through the one builder. (The flush itself freezes
    // the store, so the contract is checked on the builder plus the source.)
    it("the quit flush writes the same document shape as the debounced save (one builder)", () => {
        wv._wvWindowSetCustomTitle(win, "Quit Title");
        const doc = wv._wvWindowStoreBuildDoc([]);
        assert.equal(doc.version, 4);
        assert.equal(doc.anchorTitle, "Quit Title", "builder carries the anchor title");
        assert.property(doc, "anchorHidden", "builder carries the anchor's hidden set field");
        assert.property(doc, "focused");
        const src = String(wv._wvWindowStoreQuitFlush);
        assert.include(src, "_wvWindowStoreBuildDoc(", "the quit flush uses the builder");
        assert.notInclude(src, "version: 4", "and builds no document of its own");
        wv._wvWindowSetCustomTitle(win, "");
    });

    it("the one-time migration moves a legacy by-position title onto the window and clears the pref", () => {
        Zotero.Prefs.set("weavero.windowTitlesMigrated", false, true);
        const idx = Zotero.getMainWindows().indexOf(win);
        Zotero.Prefs.set("weavero.windowTitles", JSON.stringify({ [String(idx)]: "Legacy" }), true);
        delete win._wvWindowTitle;
        assert.equal(wv._wvWindowCustomTitle(win), "Legacy", "before migration: the legacy fallback still shows");
        wv._wvMigrateIndexTitles();
        assert.equal(win._wvWindowTitle, "Legacy", "copied onto the window");
        assert.notOk(Zotero.Prefs.get("weavero.windowTitles", true), "pref cleared");
        assert.isTrue(Zotero.Prefs.get("weavero.windowTitlesMigrated", true));
        win._wvWindowTitle = "";
    });
});
