/* global describe, it, before, assert, Zotero, wvT */

// A restart reopens every main window that was open, a window holding only
// its library tab included (MJT 2026-10-26: "A restart should just reopen
// what was opened before restarting", after a second main window with no
// item tab vanished at a restart). Since 2026-06-03 the window store skipped
// such a window ("library tab only -> nothing to restore") on the way out
// and on the way back in, and its own state (collection, columns, hidden
// collections, title, Tags choice) went with it. Written before the code.

describe("Weavero — a library-only main window comes back after a restart", function () {
    this.timeout(40000);
    let wv, win;
    const LIB_TAB = { type: "library", title: "My Library", data: { icon: "library" }, selected: true };

    before(function () {
        wv = wvT.plugin();
        for (const m of ["_wvSpawnMainWindowStart", "_wvSpawnMainWindowWait", "_wvWindowStoreCaptureDevWindows",
            "_wvWindowStoreRestoreDevWindows", "_wvTagsAutoFor", "_wvMultiMainOn"]) wvT.method(m);
        win = Zotero.getMainWindow();
    });

    const rowOf = (w) => {
        try {
            const zp = w.ZoteroPane;
            const rows = zp.getCollectionTreeRows ? zp.getCollectionTreeRows() : null;
            const r = (rows && rows[0]) || (!rows && zp.getCollectionTreeRow());
            return r ? r.id : null;
        } catch (e) { return null; }
    };

    it("a library-only window keeps its state on the way in and is captured on the way out", async function () {
        const s0 = { q: (wv._wvDevSpawnQueue || []).slice(), flag: !!wv._wvPendingDevWindow };
        assert.strictEqual(s0.q.length, 0, "no queued state before the spawn");
        const mainsBefore = new Set(Zotero.getMainWindows());
        const lvf = Zotero.Prefs.get("lastViewedFolder");
        const coll = new Zotero.Collection();   // the user library by default
        coll.name = "WV library-only probe collection";
        await coll.saveTx();
        // The window's collection is not the last one viewed elsewhere:
        // Zotero's tree selects that one when it mounts, after the restore.
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        // What the quit flush saves for such a window: the library tab, and
        // the window's own view state.
        const s = wv._wvSpawnMainWindowStart({ tabs: [LIB_TAB], wvMainState: { collection: "C" + coll.id, tagsAuto: false, title: "WV library-only probe" } });
        assert.isOk(s, "opened");
        let nw = null;
        try {
            nw = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win });
            assert.isOk(nw, "the window settled");
            assert.isTrue(await wvT.waitFor(() => nw._wvWindowTitle === "WV library-only probe", 5000), "its own title came back");
            assert.isFalse(wv._wvTagsAutoFor(nw), "its own Tags choice came back");
            assert.strictEqual(nw.Zotero_Tabs._tabs.length, 1, "the library tab alone");
            assert.isTrue(await wvT.waitFor(() => rowOf(nw) === "C" + coll.id, 5000), "its own collection: " + rowOf(nw));
            await new Promise((r) => win.setTimeout(r, 1500));
            assert.strictEqual(rowOf(nw), "C" + coll.id, "still its own collection once Zotero's tree settled");
            const entry = wv._wvWindowStoreCaptureDevWindows().find((e) => e.wvWinId === nw._wvWindowId);
            assert.isOk(entry, "captured although it holds only its library tab");
            assert.strictEqual(entry.tabs.length, 1);
            assert.isOk(entry.geom, "with its place on the screen");
            assert.strictEqual(entry.wvMainState && entry.wvMainState.tagsAuto, false, "and its state");
            assert.strictEqual(entry.wvMainState.title, "WV library-only probe");
        } finally {
            for (const w of Zotero.getMainWindows()) {
                if (!mainsBefore.has(w) && !w.closed) { try { w._wvSavedParkClose = true; w.close(); } catch (e) {} }
            }
            await wvT.waitFor(() => Zotero.getMainWindows().every((w) => mainsBefore.has(w)), 8000);
            wv._wvDevSpawnQueue = s0.q.slice(); wv._wvPendingDevWindow = s0.flag;
            Zotero.Prefs.set("lastViewedFolder", lvf);
            await wvT.erase(coll);
        }
    });

    it("the startup restore queues a saved library-only window like any other", async function () {
        if (!wv._wvMultiMainOn() || Zotero.Prefs.get("weavero.sessionAutoReopen") === false) this.skip();
        const saved = { restored: wv._wvWindowStoreDevRestored, q: wv._wvDevSpawnQueue };
        const entry = { kind: "main-dev", tabs: [LIB_TAB], wvWinId: 987654, wvMainState: { tagsAuto: false } };
        let spawned = 0;
        try {
            wv._wvWindowStoreDevRestored = false;
            // Own properties over the shared methods, deleted after.
            wv._wvWindowStoreLoad = async () => [entry];
            wv._wvSpawnNextDevWindow = () => { spawned++; };
            wv._wvDevSpawnQueue = [];
            await wv._wvWindowStoreRestoreDevWindows();
            assert.strictEqual(spawned, 1, "a window spawned");
            assert.deepEqual((wv._wvDevSpawnQueue || []).map((g) => g.wvWinId), [987654], "the library-only window queued");
        } finally {
            delete wv._wvWindowStoreLoad;
            delete wv._wvSpawnNextDevWindow;
            wv._wvWindowStoreDevRestored = saved.restored;
            wv._wvDevSpawnQueue = saved.q;
        }
    });
});
