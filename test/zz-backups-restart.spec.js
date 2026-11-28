/* global describe, it, before, after, assert, Zotero, IOUtils, PathUtils, ChromeUtils */

// Backups across a REAL start of the plugin (modules/backups.ts; a plugin
// reload runs the same startup as a Zotero restart: bootstrap startup ->
// onStartup -> _wvBkBoot first, then init). Two contracts only a real start
// shows:
//   - the update backup is taken before the new version's first migration of
//     a store: bookmarks.json holds a reader bookmark the load migrates
//     ("position" without rects -> "page", bookmarks.ts _bmMigratePageTypes,
//     persisted during _bmInit at init); the backup must hold "position";
//   - a staged restore is written before the new instance reads its stores:
//     the previous instance's newer data in memory does not come back, the new
//     instance loads the restored document, and its own writes land on it.
// RUNS LATE (zz-): a reload re-initializes the plugin for every spec after.
// FAILS before branch backups (no _wvBkBoot, no restore at startup).

describe("Weavero — backups across a real plugin start", function () {
    this.timeout(240000);
    /** @type {any} */ let addon = null;
    let root = "", bk = "";
    /** @type {Uint8Array|null} */ let savedBm = null;
    let savedState = null;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const plugin = () => /** @type {any} */ (wvT.plugin());
    const bmPath = () => PathUtils.join(root, "bookmarks.json");
    const readBm = async () => JSON.parse(await IOUtils.readUTF8(bmPath()));

    /** A plugin reload; resolves once the new instance's init and startup copy settled. */
    const reload = async () => {
        /** @type {any} */ (Zotero)._weaveroReady = false;
        await addon.reload();
        for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back after the reload");
        const p = plugin();
        await p._wvBkBootPromise;
        await p._wvBkSerial(async () => {});
        p._wvBkDestroy();   // no daily check in the middle of the spec
        return p;
    };
    /** The live instance's bookmarks, in memory and on disk. */
    const setBookmarks = async (doc) => {
        const p = plugin();
        await p._bmInit();
        p._bmDoc = JSON.parse(JSON.stringify(doc));
        await p._bmPersistSilent();
    };

    before(async function () {
        if (!plugin()) wvT.absent("plugin");
        wvT.method("_wvBkBoot");
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");
        root = wvT.lib().wvStoreDir();
        bk = plugin()._wvBkDir();
        try { savedBm = await IOUtils.read(bmPath()); } catch (e) { savedBm = null; }
        try { savedState = await IOUtils.readUTF8(PathUtils.join(bk, "state.json")); } catch (e) { savedState = null; }
        await plugin()._wvBkSerial(async () => {});
        await IOUtils.remove(bk, { recursive: true, ignoreAbsent: true });
    });

    after(async function () {
        // The bookmarks as they were, read by a fresh instance.
        try {
            if (savedBm) await IOUtils.write(bmPath(), savedBm);
            else await IOUtils.remove(bmPath(), { ignoreAbsent: true });
            await IOUtils.remove(bk, { recursive: true, ignoreAbsent: true });
            if (savedState != null) { await IOUtils.makeDirectory(bk, { ignoreExisting: true }); await IOUtils.writeUTF8(PathUtils.join(bk, "state.json"), savedState); }
            await reload();
            for (const w of Zotero.getMainWindows()) { const t = w.document.getElementById("wv-bk-toast"); if (t) t.remove(); }
        }
        finally { try { plugin()._wvBkScheduleDaily(60 * 60 * 1000); } catch (e) {} }
    });

    it("a new Weavero version: the update backup holds a store as it was before the new version's startup migration rewrote it", async function () {
        const legacy = {
            version: 2, bookmarks: [],
            readerBookmarks: { "1:WVTESTBK": { local: [{ id: "wvtestbk-page", type: "position", viewType: "pdf", position: { pageIndex: 2, rects: [] }, label: "WV-TEST page" }], global: [] } },
        };
        await setBookmarks(legacy);
        assert.strictEqual((await readBm()).readerBookmarks["1:WVTESTBK"].local[0].type, "position", "fixture on disk");
        const s = await plugin()._wvBkStateRead();
        s.lastVersion = "0.0.0-wvtest";
        await plugin()._wvBkStateWrite(s);
        const p = await reload();
        await p._bmInit();
        let onDisk = null;
        for (let i = 0; i < 50; i++) {
            onDisk = await readBm();
            if (onDisk.readerBookmarks["1:WVTESTBK"].local[0].type === "page") break;
            await sleep(100);
        }
        assert.strictEqual(onDisk.readerBookmarks["1:WVTESTBK"].local[0].type, "page", "the new version migrated the store at its start");
        const up = (await p._wvBkList()).filter((e) => e.reason === "update");
        assert.strictEqual(up.length, 1, "one update backup");
        assert.deepInclude(up[0], { valid: true, fromVersion: "0.0.0-wvtest", toVersion: p._version });
        const copy = JSON.parse(await IOUtils.readUTF8(PathUtils.join(up[0].dir, "data", "bookmarks.json")));
        assert.strictEqual(copy.readerBookmarks["1:WVTESTBK"].local[0].type, "position", "the backup holds the store before the migration");
        assert.strictEqual((await p._wvBkStateRead()).lastVersion, p._version);
    });

    it("a staged restore is written before the new instance reads its stores: the old instance's newer data does not come back, and the new instance writes on top of the restored data", async function () {
        const X = { version: 2, bookmarks: [{ id: "wvtestbk-x", type: "collection", libraryID: 1, key: "WVTESTX1" }], readerBookmarks: {} };
        const Y = { version: 2, bookmarks: [{ id: "wvtestbk-y", type: "collection", libraryID: 1, key: "WVTESTY1" }], readerBookmarks: {} };
        await setBookmarks(X);
        const b = await plugin()._wvBackupNow("manual", { quiet: true });
        assert.isTrue(b.ok, "backed up: " + b.error);
        // After the backup the running instance has newer data, in memory and on disk.
        await setBookmarks(Y);
        const st = await plugin()._wvBkStageRestore(b.name, { data: true, settings: false });
        assert.isTrue(st.ok, "staged: " + st.problem);
        const p = await reload();
        const ids = (doc) => (doc.bookmarks || []).map((n) => n.id).sort();
        assert.deepEqual(ids(await readBm()), ["wvtestbk-x"], "the file is the backup's");
        await p._bmInit();
        assert.deepEqual(ids(p._bmDoc), ["wvtestbk-x"], "the new instance loaded the restored bookmarks");
        p._bmDoc.bookmarks.push({ id: "wvtestbk-z", type: "collection", libraryID: 1, key: "WVTESTZ1" });
        await p._bmPersistSilent();
        assert.deepEqual(ids(await readBm()), ["wvtestbk-x", "wvtestbk-z"], "its own write lands on the restored data");
        const state = await p._wvBkStateRead();
        assert.deepInclude(state.lastRestore, { ok: true, name: b.name });
        const pre = (await p._wvBkList()).filter((e) => e.reason === "pre-restore");
        assert.strictEqual(pre.length, 1);
        assert.deepEqual(ids(JSON.parse(await IOUtils.readUTF8(PathUtils.join(pre[0].dir, "data", "bookmarks.json")))), ["wvtestbk-y"], "the replaced data is kept for an undo");
        assert.isFalse(await IOUtils.exists(p._wvBkPendingPath()), "done once");
    });
});
