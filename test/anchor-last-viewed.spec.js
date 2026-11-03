/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-10-26: "If I open a collection in a new window from the
// right-click menu while on the My Library, then restart, the position in
// the main window moves to the collection where I have done the
// right-click." Zotero keeps ONE `lastViewedFolder`, written by every
// window's selection (zoteroPane.js onCollectionSelected) and read by the
// main window's collection tree at startup (collectionTree.jsx makeVisible):
// the collection selected last in ANY window became the main window's. The
// quit flush now points it at the main window's own collection. Written
// before the code.

describe("Weavero — the main window reopens on its own collection", function () {
    this.timeout(60000);
    let wv, win, coll, lvf;
    const opened = [];

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvSpawnMainWindowStart", "_wvSpawnMainWindowWait", "_wvWindowStoreQuitFlush"]) wvT.method(m);
        win = Zotero.getMainWindow();
        lvf = Zotero.Prefs.get("lastViewedFolder");
        coll = new Zotero.Collection();   // the user library by default
        coll.name = "WV last viewed " + Date.now();
        await coll.saveTx();
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
    });

    after(async function () {
        for (const w of opened) { try { if (!w.closed) { w._wvSavedParkClose = true; w.close(); } } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
        Zotero.Prefs.set("lastViewedFolder", lvf);
        await wvT.erase(coll);
    });

    it("the quit flush points Zotero's last-viewed collection at the main window's, not another window's", async function () {
        const s = wv._wvSpawnMainWindowStart({ tabs: [{ type: "library", title: "My Library", data: { icon: "library" }, selected: true }], wvMainState: { collection: "C" + coll.id } });
        const w2 = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
        assert.isOk(w2, "a second main window");
        opened.push(w2);
        assert.isTrue(await wvT.waitFor(() => Zotero.Prefs.get("lastViewedFolder") === "C" + coll.id, 5000), "the second window's collection is the last viewed one");
        assert.isFunction(wv._wvPinAnchorLastViewed, "the quit step exists");
        assert.include(String(wv._wvWindowStoreQuitFlush), "_wvPinAnchorLastViewed(", "the quit flush runs it");
        wv._wvPinAnchorLastViewed();
        assert.strictEqual(Zotero.Prefs.get("lastViewedFolder"), "L" + Zotero.Libraries.userLibraryID, "the main window's own collection");
    });
});
