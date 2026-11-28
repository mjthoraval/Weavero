/* global describe, it, before, after, assert, Zotero, IOUtils, PathUtils, Services, ChromeUtils, Components */

// Backups of Weavero's own data (branch backups, MJT 2026-11-22; modules/
// backups.ts, lib/backup.ts). Contracts:
//   - the inventory: data and session state copied, caches and transient files
//     never; an unknown store is data;
//   - a backup is self-describing (manifest, settings, sizes, SHA-256) and
//     complete only with its marker, the manifest's hash, written last; a
//     damaged or unfinished one is never offered and is removed;
//   - daily: once per local day, never twice, none when automatic backups are
//     off; retention: the last 7 daily, the last 5 of every other reason;
//   - the startup gate: an update backup copies a store BEFORE the new
//     version's first write; a staged restore is written at the next start
//     before any store reads, the current state backed up first, undone by
//     restoring that copy; settings set, cleared, or kept (no default); a file
//     another process holds for a moment (Windows) delays it, never undoes it;
//   - Export -> Import gives the same data and settings back; Import refuses a
//     tampered, oversized, newer or foreign file;
//   - Settings -> Weavero -> Backups drives all of it.
// The fixtures are files named _wv-test-bk* in the runner's weavero/ folder;
// every data file of that folder, the backups folder and the prefs are put
// back after.
// FAILS before branch backups (no module, no section).

describe("Weavero — backups of Weavero's own data", function () {
    this.timeout(120000);
    /** @type {any} */ let wv;
    /** @type {any} */ let lib;
    let root = "", bk = "";
    /** @type {Map<string, Uint8Array>} */ let savedData = new Map();
    let savedState = null;
    const FIX = "_wv-test-bk.json", FIX_NEST = "_wv-test-bk/nested.json", FIX_BIN = "_wv-test-bk.bin", FIX_EXTRA = "_wv-test-bk-extra.json";
    const CACHE_FIX = ["cited-by/_wv-test-bk-cache.json", "doc-layer/_wv-test-bk-layer.jsonlz4", "trace-_wv-test-bk.json", "_wv-test-bk.json.corrupt-1", "_wv-test-bk.json.tmp", "_wv-test-bk-old.json.migrated", "drag-ring.json"];
    const enc = (s) => new TextEncoder().encode(s);
    // Fluent may wrap a placeable in bidi isolation marks.
    const plain = (s) => String(s).replace(/[⁨⁩]/g, "");
    const dec = (b) => new TextDecoder().decode(b);
    const at = (rel) => PathUtils.join(root, ...rel.split("/"));
    const write = async (rel, text) => {
        await IOUtils.makeDirectory(PathUtils.parent(at(rel)), { ignoreExisting: true, createAncestors: true });
        await IOUtils.writeUTF8(at(rel), text);
    };
    const readText = async (rel) => { try { return await IOUtils.readUTF8(at(rel)); } catch (e) { return null; } };
    const BIN = new Uint8Array([0, 255, 128, 7, 192, 193, 254, 10, 13, 0, 1]);

    /** Every data file under weavero/ now: rel -> bytes. */
    const dataFiles = async () => {
        const out = new Map();
        const walk = async (dir, prefix, depth) => {
            let kids = [];
            try { kids = await IOUtils.getChildren(dir); } catch (e) { return; }
            for (const c of kids) {
                const name = PathUtils.filename(c);
                const rel = prefix + name;
                const st = await IOUtils.stat(c);
                if (st.type === "directory") {
                    if (depth === 0 && ["backups", "cited-by", "doc-layer", "win-icons", "restart-test", "people-cache"].includes(name)) continue;
                    if (depth < 5) await walk(c, rel + "/", depth + 1);
                }
                else if (lib.wvBkClassify(rel) === "data") out.set(rel, await IOUtils.read(c));
            }
        };
        await walk(root, "", 0);
        return out;
    };
    const resetBackups = async () => { await IOUtils.remove(bk, { recursive: true, ignoreAbsent: true }); };
    const setLastVersion = async (v) => {
        const s = await wv._wvBkStateRead();
        s.lastVersion = v;
        await wv._wvBkStateWrite(s);
    };
    const keepDaily = () => Zotero.Prefs.get("weavero.backup.keepDaily");
    const setKeep = (n) => Zotero.Prefs.set("weavero.backup.keepDaily", n);
    const clearKeep = () => { try { Zotero.Prefs.clear("weavero.backup.keepDaily"); } catch (e) {} };
    const listOf = async (reason) => (await wv._wvBkList()).filter((e) => !reason || e.reason === reason);
    const fixtures = async () => {
        await write(FIX, JSON.stringify({ v: "A", list: [1, 2, 3] }));
        await write(FIX_NEST, JSON.stringify({ nested: true }));
        await IOUtils.write(at(FIX_BIN), BIN);
        for (const c of CACHE_FIX) await write(c, "{\"cache\":1}");
    };
    // The startup path, on this instance (a restart's twin): _wvBkBoot, then
    // its async part; the daily timer it arms is cancelled.
    const boot = async (reason = 1) => {
        wv._wvBkBoot(wv._version, reason);
        const p = wv._wvBkBootPromise;
        return { p, done: async () => { await p; await wv._wvBkSerial(async () => {}); wv._wvBkDestroy(); } };
    };
    // A staged restore of backup `name` applied at the last boot(): its own
    // verdict (state.lastRestore), with what it said when it is not that.
    const assertRestored = async (name, what) => {
        const r = (await wv._wvBkStateRead()).lastRestore;
        const staged = await IOUtils.exists(wv._wvBkPendingPath());
        assert.deepInclude(r || {}, { ok: true, name }, what + ": " + JSON.stringify(r) + (staged ? "; still staged, never read" : ""));
        assert.isFalse(staged, what + ": the staged restore is done");
    };
    // kernel32 (Windows), for "another process holds the file": a handle opened
    // with FILE_SHARE_READ only lets others read the file but refuses its
    // replace or removal, and the rename of the folder around it, until it is
    // closed -- as an antivirus scan or an indexer reading a file just written
    // does (lib-store.spec.js holds a store the same way).
    const kernel32 = () => {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        const k32 = ctypes.open("kernel32.dll");
        const CreateFileW = k32.declare("CreateFileW", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.char16_t.ptr,
            ctypes.uint32_t, ctypes.uint32_t, ctypes.voidptr_t, ctypes.uint32_t, ctypes.uint32_t, ctypes.voidptr_t);
        const CloseHandle = k32.declare("CloseHandle", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t);
        const MoveFileExW = k32.declare("MoveFileExW", ctypes.winapi_abi, ctypes.int32_t, ctypes.char16_t.ptr, ctypes.char16_t.ptr, ctypes.uint32_t);
        const invalid = String(ctypes.voidptr_t(-1));
        return {
            // GENERIC_READ, FILE_SHARE_READ only (no delete sharing), OPEN_EXISTING; null when it cannot be opened.
            hold: (path) => { const h = CreateFileW(path, 0x80000000, 1, null, 3, 0x80, null); return String(h) === invalid ? null : h; },
            release: (h) => { CloseHandle(h); },
            // MOVEFILE_REPLACE_EXISTING, the flag Gecko's own move passes.
            rename: (from, to) => MoveFileExW(from, to, 1) !== 0,
            close: () => k32.close(),
        };
    };
    // The .partial- folder being written in `dir` now, or null. Synchronous:
    // called from inside a synchronous method of the plugin. The listing is
    // closed on every return: Gecko's Windows enumerator keeps its find handle
    // on `dir` open until the listing reaches its end, close() or a GC
    // (nsLocalFileWin.cpp nsDirEnumerator, esr140), so the early return left
    // the backups folder open under the next test's removal and re-creation of
    // it (review, 2026-11-28).
    const partialIn = (dir) => {
        const it = /** @type {any} */ (Zotero.File.pathToFile(dir)).directoryEntries;
        try {
            while (it.hasMoreElements()) {
                const f = it.getNext().QueryInterface(Components.interfaces.nsIFile);
                if (f.leafName.startsWith(".partial-")) return f.path;
            }
            return null;
        }
        finally { it.close(); }
    };

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvBackupNow", "_wvBkBoot", "_wvBkList", "_wvBkStageRestore", "_wvBkPreview", "_wvBkExport", "_wvBkImportRead", "_wvBkDailyCheck"]) wvT.method(m);
        if (!lib || typeof lib.wvBkClassify !== "function") wvT.absent("lib.wvBkClassify");
        root = lib.wvStoreDir();
        bk = wv._wvBkDir();
        wv._wvBkDestroy();   // no daily check in the middle of a count
        await wv._wvBkSerial(async () => {});
        savedData = await dataFiles();
        try { savedState = await IOUtils.readUTF8(PathUtils.join(bk, "state.json")); } catch (e) { savedState = null; }
        await resetBackups();
    });

    after(async function () {
        try {
            await wv._wvBkSerial(async () => {});
            wv._wvBkDestroy();
            for (const rel of (await dataFiles()).keys()) if (!savedData.has(rel)) await IOUtils.remove(at(rel), { ignoreAbsent: true });
            for (const [rel, b] of savedData) { await IOUtils.makeDirectory(PathUtils.parent(at(rel)), { ignoreExisting: true, createAncestors: true }); await IOUtils.write(at(rel), b); }
            for (const c of [...CACHE_FIX, FIX_NEST]) await IOUtils.remove(at(c), { ignoreAbsent: true });
            await IOUtils.remove(at("_wv-test-bk"), { recursive: true, ignoreAbsent: true });
            await resetBackups();
            if (savedState != null) { await IOUtils.makeDirectory(bk, { ignoreExisting: true }); await IOUtils.writeUTF8(PathUtils.join(bk, "state.json"), savedState); }
            clearKeep();
            for (const w of Zotero.getMainWindows()) { const t = w.document.getElementById("wv-bk-toast"); if (t) t.remove(); }
        }
        finally { try { wv._wvBkScheduleDaily(60 * 60 * 1000); } catch (e) {} }
    });

    it("the inventory: data and session state are copied, caches and transient files never; an unknown store is data", () => {
        /** @type {Array<[string, string]>} */
        const T = [
            ["bookmarks.json", "data"], ["outlines.json", "data"], ["ann-order.json", "data"], ["note-view.json", "data"],
            ["tab-sessions.json", "data"], ["saved-windows.json", "data"], ["tab-groups.json", "data"], ["tab-groups.json.bak", "data"],
            ["outline-eval.json", "data"], ["feeds/settings.json", "data"], ["feeds/alerts.json", "data"],
            ["ref-corrections.json", "data"], ["something-new/inside.json", "data"],
            ["windows.json", "session"], ["session.json", "session"], ["colstore.json", "session"], ["hidden-collections.json", "session"],
            ["cited-by/sigs.json", "cache"], ["cited-by/entries/01/x.jsonlz4", "cache"], ["feeds/scores.json", "cache"], ["sdt-build.json", "cache"],
            ["win-icons/1-32.ico", "cache"], ["doc-layer/u/A/ABCD2345.jsonlz4", "cache"], ["doc-layer/g12345/Z/Z9H8R8HS.jsonlz4", "cache"],
            ["backups/state.json", "transient"], ["disable-closed.json", "transient"], ["reader-migration.json", "transient"],
            ["drag-ring.json", "transient"], ["trace-quit.json", "transient"], ["boot-groups-trace.json", "transient"],
            ["restart-test/report.md", "transient"], ["live-report.json", "transient"], ["filter-matrix-report.json", "transient"],
            ["bench-profile.json", "transient"], ["bookmarks.json.tmp", "transient"], ["bookmarks.json.corrupt-1795000000000", "transient"],
            ["hidden-collections.json.migrated", "transient"],
            // Found in MJT's weavero/ at the merge into citations (2026-11-22):
            // the filter's persistent trace and its previous session, a bench
            // harness's pre-run copy, the unread pre-0.14 reader-window store.
            ["filter-trace.json", "transient"], ["filter-trace.prev.json", "transient"], ["boot-groups-trace.prev.json", "transient"],
            ["pre-test/2026-10-13T14-59-21-956Z-before-bench-next34/bookmarks.json", "transient"],
            ["reader-tab-windows.json", "transient"],
            // People (people2, 2026-11-22): the records are data, the tab of each
            // window session state, the raw source records a cache a Refresh rebuilds.
            ["people.json", "data"], ["people-tabs.json", "session"],
            ["people-cache/p1abc.jsonlz4", "cache"],
        ];
        const bad = T.filter(([rel, kind]) => lib.wvBkClassify(rel) !== kind).map(([rel, kind]) => rel + ": " + lib.wvBkClassify(rel) + " (want " + kind + ")");
        assert.deepEqual(bad, []);
        assert.isTrue(lib.wvBkValidRel("feeds/settings.json"));
        for (const r of ["../x.json", "a/../b", "/abs.json", "C:/x", "a//b", "", ".", "a/.", "x.json "]) assert.isFalse(lib.wvBkValidRel(r), r);
    });

    it("folder names round-trip; retention keeps the last N daily and the last 5 of every other reason", () => {
        const d = new Date(2031, 2, 4, 7, 8, 9);
        const name = lib.wvBkFolderName(d, "pre-sync", 2);
        assert.strictEqual(name, "2031-03-04_070809-2_pre-sync");
        const p = lib.wvBkParseName(name);
        assert.deepEqual([p.day, p.n, p.reason, p.at], ["2031-03-04", 2, "pre-sync", d.getTime()]);
        assert.isNull(lib.wvBkParseName(".partial-" + name));
        assert.isNull(lib.wvBkParseName("2031-03-04_070809_../x"));
        const day = 86400000, t0 = new Date(2031, 0, 1, 12).getTime();
        const entries = [];
        for (let i = 0; i < 8; i++) entries.push({ name: lib.wvBkFolderName(new Date(t0 + i * day), "daily"), reason: "daily", created: t0 + i * day });
        for (let i = 0; i < 6; i++) entries.push({ name: lib.wvBkFolderName(new Date(t0 + i * 1000), "update"), reason: "update", created: t0 + i * 1000 });
        const gone = lib.wvBkRetention(entries, 7);
        assert.deepEqual(gone, [entries[0].name, entries[8].name].sort(), "the oldest daily, the oldest update");
        assert.deepEqual(lib.wvBkRetention(entries, 7, entries[0].name).includes(entries[0].name), false, "the one just written stays");
        assert.strictEqual(lib.wvBkRetention(entries, 3).filter((n) => n.endsWith("_daily")).length, 5, "keepDaily 3");
    });

    it("a preview counts each store's records in plain words (Bookmarks: 3 removed, 1 changed)", async () => {
        const bm = (ids, title2) => ({
            version: 2,
            bookmarks: [
                { id: "f1", type: "folder", name: "Folder", expanded: true, children: ids.filter((i) => i !== "b1").map((i) => ({ id: i, type: "item", libraryID: 1, key: "K" + i, title: i === "b2" ? title2 : i })) },
                ...(ids.includes("b1") ? [{ id: "b1", type: "collection", libraryID: 1, key: "C1" }] : []),
            ],
            readerBookmarks: { "1:ATT1": { local: [{ id: "r1", type: "page", position: { pageIndex: 3 } }], global: [] } },
        });
        const now = bm(["b1", "b2", "b3", "b4", "b5"], "two");
        const then = bm(["b2", "b5"], "TWO");
        const cur = new Map([["bookmarks.json", enc(JSON.stringify(now))], ["note-view.json", enc("{\"outline\":{}}")]]);
        const src = { files: new Map([["bookmarks.json", enc(JSON.stringify(then))], ["feeds/settings.json", enc("{\"v\":1,\"myNames\":[\"Doe, J.\"]}")]]), prefs: { tabGroups: JSON.stringify([{ id: "g1", name: "A" }]), debug: true } };
        const r = await wv._wvBkPreview(src, { current: cur, currentPrefs: { tabGroups: JSON.stringify([{ id: "g1", name: "A" }, { id: "g2", name: "B" }]) } });
        const byRel = Object.fromEntries(r.stores.map((s) => [s.rel, s]));
        assert.deepInclude(byRel["bookmarks.json"], { added: 0, removed: 3, changed: 1, whole: null }, "b1, b3, b4 removed; b2 renamed");
        assert.strictEqual(byRel["note-view.json"].whole, "removed", "not in the backup: removed");
        assert.strictEqual(byRel["feeds/settings.json"].whole, "added");
        assert.deepInclude(r.tabGroups, { added: 0, removed: 1, changed: 0 });
        assert.deepInclude(r.settings, { added: 1, removed: 0, changed: 0 }, "debug: set by the backup");
        assert.include(r.lines.map(plain), "Bookmarks: 3 removed, 1 changed");
        assert.strictEqual(r.changes, 5);
        const none = await wv._wvBkPreview({ files: new Map(cur), prefs: {} }, { current: cur, currentPrefs: {} });
        assert.deepEqual(none.stores, []);
        assert.strictEqual(none.changes, 0);
        assert.lengthOf(none.lines, 1, "one line says nothing would change");
    });

    it("Back Up Now: a self-describing, verified backup; caches and transient files stay out; this installation's state stays out of its settings", async () => {
        await resetBackups();
        await fixtures();
        setKeep(9);
        Zotero.Prefs.set("weavero._prefsCollapsed", "wv-test-bk");
        try {
            const r = await wv._wvBackupNow("manual", { quiet: true });
            assert.isTrue(r.ok, "backed up: " + r.error);
            assert.match(r.name, /^\d{4}-\d{2}-\d{2}_\d{6}_manual$/);
            const m = JSON.parse(await IOUtils.readUTF8(PathUtils.join(r.dir, "manifest.json")));
            assert.deepInclude(m, { format: "weavero-backup", schema: 1, reason: "manual", weaveroVersion: wv._version, zoteroVersion: Zotero.version });
            assert.isOk(Date.parse(m.created) && m.createdMs, "dated");
            const marker = (await IOUtils.readUTF8(PathUtils.join(r.dir, "complete.sha256"))).trim();
            assert.strictEqual(marker, await lib.wvBkSha256(await IOUtils.read(PathUtils.join(r.dir, "manifest.json"))), "the marker is the manifest's hash");
            const byPath = Object.fromEntries(m.files.map((f) => [f.path, f]));
            for (const rel of [FIX, FIX_NEST, FIX_BIN]) {
                assert.isOk(byPath[rel], rel + " is in the backup");
                const src = await IOUtils.read(at(rel));
                const copy = await IOUtils.read(PathUtils.join(r.dir, "data", ...rel.split("/")));
                assert.deepEqual([...copy], [...src], rel + ": the same bytes");
                assert.strictEqual(byPath[rel].size, src.length);
                assert.strictEqual(byPath[rel].sha256, await lib.wvBkSha256(src));
            }
            for (const c of CACHE_FIX) assert.notOk(byPath[c], c + " stays out");
            assert.notOk(m.files.some((f) => /^(backups|cited-by|doc-layer|win-icons|people-cache)\//.test(f.path)), "no backup, cache or icon folder inside");
            const s = JSON.parse(await IOUtils.readUTF8(PathUtils.join(r.dir, "settings.json")));
            assert.deepInclude(s, { format: "weavero-settings", schema: 1 });
            assert.strictEqual(s.prefs["backup.keepDaily"], 9, "a user-set pref");
            assert.notProperty(s.prefs, "_prefsCollapsed", "the pane's folds: this installation's");
            assert.notProperty(s.prefs, "nextWindowId");
            assert.strictEqual(m.settings.sha256, await lib.wvBkSha256(await IOUtils.read(PathUtils.join(r.dir, "settings.json"))));
            assert.isFalse(await IOUtils.exists(PathUtils.join(bk, ".partial-" + r.name)), "no partial folder left");
            const list = await listOf("manual");
            assert.strictEqual(list.length, 1);
            assert.isTrue(list[0].valid);
        }
        finally { try { Zotero.Prefs.clear("weavero._prefsCollapsed"); } catch (e) {} clearKeep(); }
    });

    it("the daily backup: once per local day, never twice; none while automatic backups are off", async () => {
        await resetBackups();
        await fixtures();
        const d1 = new Date(2030, 0, 10, 9, 0, 0).getTime();
        await wvT.withPref("weavero.backup.auto", true, async () => {
            const a = await wv._wvBkDailyCheck(d1);
            assert.isTrue(a.took, "the first of the day");
            const b = await wv._wvBkDailyCheck(d1 + 2 * 3600000);
            assert.isFalse(b.took, "not twice the same day");
            const c = await wv._wvBkDailyCheck(d1 + 86400000);
            assert.isTrue(c.took, "the next day");
        });
        await wvT.withPref("weavero.backup.auto", false, async () => {
            const d = await wv._wvBkDailyCheck(d1 + 2 * 86400000);
            assert.isFalse(d.took, "off: none");
        });
        assert.strictEqual((await listOf("daily")).length, 2);
    });

    it("retention: the 8th daily backup removes the oldest; the other reasons keep their last 5", async function () {
        await resetBackups();
        await fixtures();
        const day = 86400000, t0 = new Date(2030, 1, 1, 9).getTime();
        await wvT.withPref("weavero.backup.auto", true, async () => {
            for (let i = 0; i < 8; i++) assert.isTrue((await wv._wvBkDailyCheck(t0 + i * day)).took, "daily " + i);
        });
        const dailies = await listOf("daily");
        assert.strictEqual(dailies.length, 7, "seven kept");
        assert.notInclude(dailies.map((e) => e.name), lib.wvBkFolderName(new Date(t0), "daily"), "the oldest went");
        for (let i = 0; i < 6; i++) assert.isTrue((await wv._wvBackupNow("manual", { quiet: true, at: t0 + i * 1000 })).ok, "manual " + i);
        assert.strictEqual((await listOf("manual")).length, 5, "the last five manual");
        assert.strictEqual((await listOf("daily")).length, 7, "the dailies untouched");
        setKeep(3);
        try {
            await wv._wvBkPrune();
            assert.strictEqual((await listOf("daily")).length, 3, "keepDaily 3");
        }
        finally { clearKeep(); }
    });

    it("a damaged or unfinished backup is never offered and is removed; one being written is left alone", async function () {
        await resetBackups();
        await fixtures();
        const good = await wv._wvBackupNow("manual", { quiet: true });
        assert.isTrue(good.ok);
        const copy = async (i, edit) => {
            const name = lib.wvBkFolderName(new Date(2031, 5, 1, 10, 0, i), "manual");
            const dir = PathUtils.join(bk, name);
            await IOUtils.copy(good.dir, dir, { recursive: true });
            await edit(dir);
            return name;
        };
        const noMarker = await copy(1, (d) => IOUtils.remove(PathUtils.join(d, "complete.sha256")));
        const badMarker = await copy(2, (d) => IOUtils.writeUTF8(PathUtils.join(d, "complete.sha256"), "0".repeat(64)));
        const badSize = await copy(3, (d) => IOUtils.writeUTF8(PathUtils.join(d, "data", FIX), "{\"v\":\"A, longer now\"}"));
        const sameSize = await copy(4, async (d) => {
            const b = await IOUtils.read(PathUtils.join(d, "data", FIX));
            b[b.length - 2] = b[b.length - 2] === 0x31 ? 0x32 : 0x31;
            await IOUtils.write(PathUtils.join(d, "data", FIX), b);
        });
        const stale = PathUtils.join(bk, ".partial-" + lib.wvBkFolderName(new Date(2031, 5, 1, 9), "manual"));
        const fresh = PathUtils.join(bk, ".partial-" + lib.wvBkFolderName(new Date(), "manual"));
        for (const p of [stale, fresh]) { await IOUtils.makeDirectory(p); await IOUtils.writeUTF8(PathUtils.join(p, "manifest.json"), "{}"); }
        await IOUtils.setModificationTime(stale, Date.now() - 2 * 3600000);
        const list = Object.fromEntries((await wv._wvBkList()).map((e) => [e.name, e]));
        for (const n of [noMarker, badMarker, badSize]) assert.deepInclude(list[n], { valid: false, damaged: true }, n);
        assert.isTrue(list[sameSize].valid, "the quick check sees sizes only");
        const st = await wv._wvBkStageRestore(sameSize, { data: true, settings: true });
        assert.deepEqual(st, { ok: false, problem: "damaged" }, "never staged");
        assert.isFalse(await IOUtils.exists(PathUtils.join(bk, sameSize)), "and removed");
        assert.isFalse(await IOUtils.exists(wv._wvBkPendingPath()), "nothing staged");
        const src = await wv._wvBkSourceOf(badSize);
        assert.isFalse(src.ok, "no preview of a damaged backup");
        await wv._wvBkPrune();
        for (const n of [noMarker, badMarker, badSize]) assert.isFalse(await IOUtils.exists(PathUtils.join(bk, n)), n + " removed");
        assert.isFalse(await IOUtils.exists(stale), "a partial folder an hour old: removed");
        assert.isTrue(await IOUtils.exists(fresh), "one being written: left");
        assert.isTrue(await IOUtils.exists(good.dir), "the good one stays");
        await IOUtils.remove(fresh, { recursive: true });
    });

    it("the startup gate: the update backup copies a store before the new version's first write of it", async function () {
        await resetBackups();
        await fixtures();
        await write(FIX, JSON.stringify({ v: "before the update" }));
        await setLastVersion("0.0.0-wvtest");
        const path = at(FIX);
        await wvT.withPref("weavero.backup.auto", true, async () => {
            const b = await boot(7);
            // The new version's first write and read, issued during the gate.
            const w = lib.wvStoreWrite(path, { v: "after the update" });
            const r = lib.wvStoreRead(path);
            await b.done();
            await w;
            assert.deepEqual((await r).doc, { v: "after the update" }, "the store went on after the gate");
        });
        const up = await listOf("update");
        assert.strictEqual(up.length, 1, "one update backup");
        assert.strictEqual(up[0].fromVersion, "0.0.0-wvtest");
        assert.strictEqual(up[0].toVersion, wv._version);
        assert.deepEqual(JSON.parse(await IOUtils.readUTF8(PathUtils.join(up[0].dir, "data", FIX))), { v: "before the update" }, "copied before the write");
        assert.deepEqual(JSON.parse(await readText(FIX)), { v: "after the update" });
        assert.strictEqual((await wv._wvBkStateRead()).lastVersion, wv._version, "the version is recorded");
        // The same version again: no backup.
        const again = await boot(1);
        await again.done();
        assert.strictEqual((await listOf("update")).length, 1, "no update backup without a version change");
    });

    // citations.43 in MJT's profile (2026-11-22): an install, then the verify
    // cycle's reload a second later, took TWO update backups of one version
    // (2026-11-22_201849_update, _201850_update): the reload's start read
    // state.json before the install's start had recorded the version. Five
    // update copies are kept, so each dev install would have pushed out two.
    it("two starts of one version close together (an install, then a reload) take ONE update backup", async function () {
        await resetBackups();
        await fixtures();
        await setLastVersion("0.0.0-wvtest");
        await wvT.withPref("weavero.backup.auto", true, async () => {
            // The second start begins while the first is still copying.
            const b1 = await boot(7);
            const b2 = await boot(7);
            await b1.done();
            await b2.done();
            // A start that read the state before the first one recorded the version.
            await setLastVersion("0.0.0-wvtest");
            const b3 = await boot(7);
            await b3.done();
        });
        const up = await listOf("update");
        assert.strictEqual(up.length, 1, "one update backup for one version: " + up.map((e) => e.name).join(", "));
        assert.strictEqual(up[0].toVersion, wv._version);
        const st = await wv._wvBkStateRead();
        assert.strictEqual(st.lastVersion, wv._version, "the version is recorded");
        assert.strictEqual(st.lastBackup && st.lastBackup.name, up[0].name, "the last backup names the one kept");
    });

    it("a staged restore is written at the next start before any store reads it, the current state backed up first; restoring that copy undoes it", async function () {
        await resetBackups();
        await fixtures();
        const winBefore = await readText("windows.json");
        setKeep(9);
        let b1;
        try {
            b1 = await wv._wvBackupNow("manual", { quiet: true });
            assert.isTrue(b1.ok);
            // What happens after the backup: a change, a new store, a setting.
            await write(FIX, JSON.stringify({ v: "C" }));
            await write(FIX_EXTRA, JSON.stringify({ extra: 1 }));
            setKeep(11);
            const st = await wv._wvBkStageRestore(b1.name, { data: true, settings: true });
            assert.isTrue(st.ok, "staged: " + st.problem);
            assert.isTrue(await IOUtils.exists(wv._wvBkPendingPath()));
            assert.deepEqual(JSON.parse(await readText(FIX)), { v: "C" }, "nothing written before the next start");
            // The next start.
            const b = await boot(1);
            assert.strictEqual(keepDaily(), 9, "the settings are back before init reads them (synchronously)");
            const firstRead = lib.wvStoreRead(at(FIX));
            await b.done();
            assert.deepEqual((await firstRead).doc, { v: "A", list: [1, 2, 3] }, "the first store read sees the restored file");
            assert.deepEqual(JSON.parse(await readText(FIX)), { v: "A", list: [1, 2, 3] });
            assert.isNull(await readText(FIX_EXTRA), "a store the backup lacks is removed");
            assert.deepEqual([...(await IOUtils.read(at(FIX_BIN)))], [...BIN]);
            assert.strictEqual(await readText("windows.json"), winBefore, "session state left as it is");
            assert.isFalse(await IOUtils.exists(wv._wvBkPendingPath()), "the staged restore is done");
            const state = await wv._wvBkStateRead();
            assert.deepInclude(state.lastRestore, { ok: true, name: b1.name, kind: "restore" });
            const pre = await listOf("pre-restore");
            assert.strictEqual(pre.length, 1, "the current state was backed up first");
            assert.strictEqual(pre[0].name, state.lastRestore.pre);
            assert.deepEqual(JSON.parse(await IOUtils.readUTF8(PathUtils.join(pre[0].dir, "data", FIX))), { v: "C" });
            assert.isTrue(await IOUtils.exists(PathUtils.join(pre[0].dir, "data", FIX_EXTRA)));
            assert.strictEqual(JSON.parse(await IOUtils.readUTF8(PathUtils.join(pre[0].dir, "settings.json"))).prefs["backup.keepDaily"], 11);
            // Undo: restore the pre-restore copy.
            assert.isTrue((await wv._wvBkStageRestore(pre[0].name, {})).ok);
            const u = await boot(1);
            await u.done();
            // The restore's own verdict first, so a failure names its step ("backup
            // first:", "write:", "settings:") or a staged undo never read: the file
            // check alone said only "{v:'A'}, not {v:'C'}" (Zotero 11 full run,
            // 2026-11-28).
            await assertRestored(pre[0].name, "the undo");
            assert.deepEqual(JSON.parse(await readText(FIX)), { v: "C" }, "undone");
            assert.deepEqual(JSON.parse(await readText(FIX_EXTRA)), { extra: 1 });
            assert.strictEqual(keepDaily(), 11);
            // Data only: the settings stay.
            assert.isTrue((await wv._wvBkStageRestore(b1.name, { data: true, settings: false })).ok);
            const d = await boot(1);
            await d.done();
            await assertRestored(b1.name, "the data-only restore");
            assert.deepEqual(JSON.parse(await readText(FIX)), { v: "A", list: [1, 2, 3] });
            assert.strictEqual(keepDaily(), 11, "settings untouched");
        }
        finally { clearKeep(); }
    });

    it("a store write queued during the startup restore lands after it, never under it", async function () {
        await resetBackups();
        await fixtures();
        const b1 = await wv._wvBackupNow("manual", { quiet: true });
        await write(FIX, JSON.stringify({ v: "stale in memory" }));
        assert.isTrue((await wv._wvBkStageRestore(b1.name, { data: true, settings: false })).ok);
        const b = await boot(1);
        const w = lib.wvStoreWrite(at(FIX), { v: "written after the restore" });
        await b.done();
        await w;
        assert.deepEqual(JSON.parse(await readText(FIX)), { v: "written after the restore" }, "the write waited for the gate, then landed");
        const pre = await listOf("pre-restore");
        assert.deepEqual(JSON.parse(await IOUtils.readUTF8(PathUtils.join(pre[0].dir, "data", FIX))), { v: "stale in memory" });
    });

    // A file another process held for a moment -- an antivirus scan or an
    // indexer reading a file just written -- refused one file operation of a
    // startup restore, and the restore (the undo above) was undone and used up:
    // Zotero 11 full run, 2026-11-28. Three operations need delete access there:
    // the write of a store (its tmp file renamed over it), the removal of a
    // store the backup lacks, and the rename of the new undo point's .partial-
    // folder (refused while a file in it is held). Each held here for 250 ms
    // through kernel32, from the restore's first try.
    it("a staged restore lands when another process holds the store it replaces for a moment (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: the replace is refused on Windows only
        await resetBackups();
        await fixtures();
        const b1 = await wv._wvBackupNow("manual", { quiet: true });
        assert.isTrue(b1.ok, "backed up: " + b1.error);
        await write(FIX, JSON.stringify({ v: "C" }));
        assert.isTrue((await wv._wvBkStageRestore(b1.name, { data: true, settings: false })).ok);
        const k = kernel32();
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvBkWriteStore"), orig = wv._wvBkWriteStore;
        let h = null, released = null;
        try {
            // Readable meanwhile: the undo point copies the store first.
            h = k.hold(at(FIX));
            assert.isOk(h, "fixture: the store is held");
            // Released 250 ms after the restore's first write of it: that first
            // attempt always meets the hold.
            wv._wvBkWriteStore = function (rel, bytes) {
                if (rel === FIX && !released) released = new Promise((r) => setTimeout(() => { if (h) { k.release(h); h = null; } r(undefined); }, 250));
                return orig.call(this, rel, bytes);
            };
            const b = await boot(1);
            await b.done();
            assert.isOk(released, "fixture: the restore wrote the held store");
        }
        finally {
            if (own) wv._wvBkWriteStore = orig; else delete wv._wvBkWriteStore;
            if (released) await released;
            if (h) { k.release(h); h = null; }
            k.close();
        }
        await assertRestored(b1.name, "the restore");
        assert.deepEqual(JSON.parse(await readText(FIX)), { v: "A", list: [1, 2, 3] }, "the held store restored");
    });

    // The removal had no retry after the two above got theirs (review,
    // 2026-11-28): "... restoring that copy undoes it" removes FIX_EXTRA twice,
    // each time moments after it was written.
    it("a staged restore lands when another process holds a store the backup lacks, which it removes, for a moment (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: the removal is refused on Windows only
        await resetBackups();
        await fixtures();
        const b1 = await wv._wvBackupNow("manual", { quiet: true });
        assert.isTrue(b1.ok, "backed up: " + b1.error);
        await write(FIX, JSON.stringify({ v: "C" }));
        await write(FIX_EXTRA, JSON.stringify({ extra: 1 }));
        assert.isTrue((await wv._wvBkStageRestore(b1.name, { data: true, settings: false })).ok);
        const k = kernel32();
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvBkWriteStore"), orig = wv._wvBkWriteStore;
        let h = null, released = null;
        try {
            // Readable meanwhile: the undo point copies the store first.
            h = k.hold(at(FIX_EXTRA));
            assert.isOk(h, "fixture: the store is held");
            // The restore writes the stores that differ, then removes the ones
            // the backup lacks, with no I/O between the last write and the first
            // removal: released 250 ms after the write of FIX LANDED, that
            // removal's first attempt always meets the hold.
            wv._wvBkWriteStore = async function (rel, bytes) {
                await orig.call(this, rel, bytes);
                if (rel === FIX && !released) released = new Promise((r) => setTimeout(() => { if (h) { k.release(h); h = null; } r(undefined); }, 250));
            };
            const b = await boot(1);
            await b.done();
            assert.isOk(released, "fixture: the restore wrote the changed store first");
        }
        finally {
            if (own) wv._wvBkWriteStore = orig; else delete wv._wvBkWriteStore;
            if (released) await released;
            if (h) { k.release(h); h = null; }
            k.close();
        }
        await assertRestored(b1.name, "the restore");
        assert.isNull(await readText(FIX_EXTRA), "the held store the backup lacks is removed");
        assert.deepEqual(JSON.parse(await readText(FIX)), { v: "A", list: [1, 2, 3] });
    });

    it("a staged restore lands when another process holds a file of its new undo point for a moment, which refuses that folder's rename (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: a folder's rename is refused while a file in it is held on Windows only
        await resetBackups();
        await fixtures();
        const b1 = await wv._wvBackupNow("manual", { quiet: true });
        assert.isTrue(b1.ok, "backed up: " + b1.error);
        await write(FIX, JSON.stringify({ v: "C" }));
        assert.isTrue((await wv._wvBkStageRestore(b1.name, { data: true, settings: false })).ok);
        const k = kernel32();
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvBkPlatform"), orig = wv._wvBkPlatform;
        let h = null, released = null, fixture = "";
        try {
            // The .partial- folder's name is the second it is written in, so it
            // is found, not predicted: _wvBkWrite asks for the platform once the
            // copy's files are in that folder, right before the manifest, the
            // marker and the rename. A file in it is held there, released 250 ms
            // later -- and the precondition checked: the folder cannot be renamed.
            wv._wvBkPlatform = function () {
                if (!released) {
                    const partial = partialIn(bk);
                    h = partial ? k.hold(PathUtils.join(partial, "settings.json")) : null;
                    if (!h) fixture = "nothing to hold in " + partial;
                    else if (k.rename(partial, partial + "-wvprobe")) {
                        k.rename(partial + "-wvprobe", partial);
                        fixture = "Windows renamed the folder while a file in it was held";
                    }
                    released = new Promise((r) => setTimeout(() => { if (h) { k.release(h); h = null; } r(undefined); }, 250));
                }
                return orig.apply(this, arguments);
            };
            const b = await boot(1);
            await b.done();
            assert.isOk(released, "fixture: the restore wrote an undo point");
        }
        finally {
            if (own) wv._wvBkPlatform = orig; else delete wv._wvBkPlatform;
            if (released) await released;
            if (h) { k.release(h); h = null; }
            k.close();
        }
        assert.strictEqual(fixture, "", "fixture: the folder's rename is refused while the file is held");
        await assertRestored(b1.name, "the restore");
        assert.deepEqual(JSON.parse(await readText(FIX)), { v: "A", list: [1, 2, 3] });
        // One undo point, whole: a retried move onto a folder the refused one
        // left would have nested the copy inside it.
        const pre = await listOf("pre-restore");
        assert.strictEqual(pre.length, 1, "one undo point: " + pre.map((e) => e.name + (e.valid ? "" : " (damaged)")).join(", "));
        assert.isTrue(pre[0].valid, "complete");
        assert.deepEqual(JSON.parse(await IOUtils.readUTF8(PathUtils.join(pre[0].dir, "data", FIX))), { v: "C" }, "it holds what the restore replaced");
        assert.isNull(partialIn(bk), "no .partial- folder left");
    });

    it("Export -> Import: the same data and settings come back; the import is a backup of its own, with a pre-import copy", async function () {
        await resetBackups();
        await fixtures();
        setKeep(5);
        const file = PathUtils.join(PathUtils.tempDir, "wv-test-bk-export-" + Date.now() + ".json");
        try {
            const exported = await dataFiles();
            const prefsAtExport = lib.wvBkPrefsSnapshot();
            const ex = await wv._wvBkExport(file);
            assert.isTrue(ex.ok, "exported: " + ex.error);
            const doc = JSON.parse(await IOUtils.readUTF8(file));
            assert.deepInclude(doc, { format: "weavero-export", schema: 1 });
            assert.isOk(doc.files[FIX_BIN] && doc.files[FIX_BIN].base64, "a binary file travels as base64");
            assert.notOk(doc.files["windows.json"], "no session state in an export");
            // Changed since.
            await write(FIX, JSON.stringify({ v: "changed after the export" }));
            await IOUtils.remove(at(FIX_NEST));
            await write(FIX_EXTRA, "{}");
            setKeep(12);
            const r = await wv._wvBkImportRead(file);
            assert.isTrue(r.ok, "read: " + r.problem + " " + r.detail);
            assert.deepEqual([...r.source.files.keys()].sort(), [...exported.keys()].sort(), "every data file");
            const st = await wv._wvBkStageImport(r.source, { data: true, settings: true });
            assert.isTrue(st.ok, "staged: " + st.problem);
            const imp = await listOf("import");
            assert.strictEqual(imp.length, 1, "the import is a backup");
            assert.strictEqual(imp[0].note, PathUtils.filename(file));
            const b = await boot(1);
            await b.done();
            const now = await dataFiles();
            assert.deepEqual([...now.keys()].sort(), [...exported.keys()].sort(), "the same stores");
            for (const [rel, bytes] of exported) assert.deepEqual([...now.get(rel)], [...bytes], rel + ": the same bytes");
            const p = lib.wvBkPrefsSnapshot();
            assert.strictEqual(p["backup.keepDaily"], 5);
            assert.deepEqual(Object.keys(p).sort(), Object.keys(prefsAtExport).sort(), "the same settings set");
            assert.strictEqual((await listOf("pre-import")).length, 1, "the state it replaced, backed up");
        }
        finally { clearKeep(); await IOUtils.remove(file, { ignoreAbsent: true }); }
    });

    it("Import refuses a tampered, oversized, newer or foreign file -- sizes checked before anything is decoded -- and writes nothing", async function () {
        await resetBackups();
        await fixtures();
        const file = PathUtils.join(PathUtils.tempDir, "wv-test-bk-import-" + Date.now() + ".json");
        const variant = PathUtils.join(PathUtils.tempDir, "wv-test-bk-variant-" + Date.now() + ".json");
        try {
            assert.isTrue((await wv._wvBkExport(file)).ok);
            const base = JSON.parse(await IOUtils.readUTF8(file));
            const sha = async (s) => lib.wvBkSha256(lib.wvBkUtf8(s));
            const remanifest = async (doc, edit) => {
                const m = JSON.parse(doc.manifest);
                edit(m);
                doc.manifest = JSON.stringify(m);
                doc.complete = await sha(doc.manifest);
                return doc;
            };
            const tryDoc = async (doc) => { await IOUtils.writeUTF8(variant, typeof doc === "string" ? doc : JSON.stringify(doc)); return wv._wvBkImportRead(variant); };
            const clone = () => JSON.parse(JSON.stringify(base));
            const tampered = clone();
            tampered.files[FIX].utf8 = tampered.files[FIX].utf8.replace("A", "B");
            assert.deepInclude(await tryDoc(tampered), { ok: false, problem: "damaged" }, "tampered content");
            const marker = clone();
            marker.complete = "0".repeat(64);
            assert.deepInclude(await tryDoc(marker), { ok: false, problem: "damaged" }, "a manifest that is not the one hashed");
            const newer = clone();
            newer.schema = 2;
            assert.deepInclude(await tryDoc(newer), { ok: false, problem: "newer" }, "a newer export format");
            const newerM = await remanifest(clone(), (m) => { m.schema = 2; });
            assert.deepInclude(await tryDoc(newerM), { ok: false, problem: "newer" }, "a newer backup format");
            const big = await remanifest(clone(), (m) => { m.files.push({ path: "huge.json", size: lib.WV_BK_TOTAL_CAP + 1, sha256: "0".repeat(64), kind: "data" }); });
            assert.deepInclude(await tryDoc(big), { ok: false, problem: "too-large" }, "declared over the cap: refused before decoding");
            const long = clone();
            const m0 = JSON.parse(long.manifest).files.find((f) => f.path === FIX);
            long.files[FIX].utf8 = "x".repeat(m0.size + 1);
            assert.deepInclude(await tryDoc(long), { ok: false, problem: "damaged" }, "an entry longer than its size: refused before decoding");
            const escape = await remanifest(clone(), (m) => { m.files.push({ path: "../outside.json", size: 2, sha256: "0".repeat(64), kind: "data" }); });
            assert.deepInclude(await tryDoc(escape), { ok: false, problem: "damaged" }, "a path out of weavero/");
            assert.deepInclude(await tryDoc({ hello: 1 }), { ok: false, problem: "not-weavero" });
            assert.deepInclude(await tryDoc("not json at all"), { ok: false, problem: "not-weavero" });
            assert.deepEqual(await listOf(), [], "no backup written for a refused file");
            assert.isFalse(await IOUtils.exists(wv._wvBkPendingPath()), "nothing staged");
        }
        finally { await IOUtils.remove(file, { ignoreAbsent: true }); await IOUtils.remove(variant, { ignoreAbsent: true }); }
    });

    it("settings: this installation's state is never copied; a restore sets and clears, and keeps a pref Gecko could not create again", () => {
        for (const k of ["_prefsCollapsed", "_reopenOnInit", "nextWindowId", "windowsTransferred", "windowTitlesMigrated", "defaultChildMigrated", "defaultChildLegacyPending"]) {
            assert.isTrue(lib.wvBkPrefExcluded(k), k);
        }
        for (const k of ["tabGroups", "pinnedTabs", "backup.keepDaily", "enableFeeds", "defaultChildLegacyChoice"]) assert.isFalse(lib.wvBkPrefExcluded(k), k);
        const NODEF = "wvTestBkNoDefault" + Date.now();
        const B = Services.prefs.getBranch("extensions.zotero.weavero.");
        try {
            B.setStringPref(NODEF, "x");
            setKeep(13);
            const target = Object.assign({}, lib.wvBkPrefsSnapshot());
            delete target[NODEF];
            delete target["backup.keepDaily"];
            target.debug = !Zotero.Prefs.get("weavero.debug");
            const wasDebug = B.prefHasUserValue("debug") ? Zotero.Prefs.get("weavero.debug") : undefined;
            try {
                // Present at "startup": kept, not cleared.
                const r1 = lib.wvBkPrefsApply(target, lib.wvBkPrefsSnapshot());
                assert.include(r1.kept, NODEF);
                assert.strictEqual(B.getStringPref(NODEF), "x");
                assert.isFalse(B.prefHasUserValue("backup.keepDaily"), "a pref with a default goes back to it");
                assert.strictEqual(Zotero.Prefs.get("weavero.debug"), target.debug, "set");
                // Created after startup: cleared.
                const r2 = lib.wvBkPrefsApply(target, {});
                assert.notInclude(r2.kept, NODEF);
                assert.isFalse(B.prefHasUserValue(NODEF));
            }
            finally {
                if (wasDebug === undefined) { try { Zotero.Prefs.clear("weavero.debug"); } catch (e) {} } else Zotero.Prefs.set("weavero.debug", wasDebug);
            }
        }
        finally { try { B.clearUserPref(NODEF); } catch (e) {} clearKeep(); }
    });

    it("Settings -> Weavero -> Backups: Back Up Now, Restore… (list, preview, staged for later), Cancel Restore, Export…, Import…, Open Folder", async function () {
        await resetBackups();
        await fixtures();
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        assert.ok(await wvT.waitFor(() => !prefsOpen(), 8000, 50), "no Settings window left from an earlier spec");
        const file = PathUtils.join(PathUtils.tempDir, "wv-test-bk-pane-" + Date.now() + ".json");
        const stubs = {};
        const stub = (name, fn) => { stubs[name] = Object.prototype.hasOwnProperty.call(wv, name) ? wv[name] : undefined; wv[name] = fn; };
        const asked = [], opened = [];
        let restarted = 0;
        stub("_wvBkPick", async (_w, mode) => (mode === "save" ? file : file));
        stub("_wvBkAsk", (_w, text) => { asked.push(text); return 1; });
        stub("_wvBkRestartNow", () => { restarted++; });
        stub("_wvBkOpenFolder", async () => { opened.push(1); });
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        try {
            const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find((k) => /weavero@mjthoraval/.test(k));
            assert.ok(await wvT.waitFor(() => !!paneID(), 10000, 50), "Weavero's pane registered");
            await pw.Zotero_Preferences.navigateToPane(paneID());
            const doc = pw.document;
            const block = await wvT.waitFor(() => doc.getElementById("wv-bk-block"), 15000, 50);
            assert.ok(block, "the Backups block");
            assert.ok(await wvT.waitFor(() => block.getAttribute("data-wv-bound") === "true", 15000, 50), "bound");
            assert.ok(doc.getElementById("wv-sec-backups"), "its section");
            assert.ok(doc.querySelector('checkbox[preference="extensions.zotero.weavero.backup.auto"]'), "the automatic backups box");
            assert.include(doc.getElementById("wv-bk-where").textContent, bk, "where the backups live");
            const click = (id) => doc.getElementById(id).click();
            const status = () => String(doc.getElementById("wv-bk-status").textContent || "");
            // Back Up Now.
            click("wv-bk-now");
            assert.ok(await wvT.waitFor(() => /Backed up/.test(status()), 15000, 50), "status: " + status());
            assert.strictEqual((await listOf("manual")).length, 1);
            assert.ok(await wvT.waitFor(() => /Last backup/.test(doc.getElementById("wv-bk-last").textContent), 5000, 50), "the last backup shown");
            // Restore…: the list, the preview.
            await write(FIX, JSON.stringify({ v: "changed in the pane test" }));
            click("wv-bk-restore");
            const panel = doc.getElementById("wv-bk-panel");
            assert.ok(await wvT.waitFor(() => !panel.hidden && /** @type {any} */ (doc.getElementById("wv-bk-list")).options.length >= 1, 10000, 50), "the list");
            assert.ok(await wvT.waitFor(() => doc.querySelectorAll("#wv-bk-preview li").length >= 1, 10000, 50), "a preview");
            const lines = [...doc.querySelectorAll("#wv-bk-preview li")].map((li) => plain(li.textContent));
            assert.ok(lines.some((t) => t.startsWith(FIX + ":")), "the changed store is named: " + JSON.stringify(lines));
            click("wv-bk-go");
            assert.ok(await wvT.waitFor(() => asked.length === 1, 5000, 50), "asked once");
            const pending = doc.getElementById("wv-bk-pending");
            assert.ok(await wvT.waitFor(() => !pending.hidden, 5000, 50), "the waiting restore is shown");
            assert.isTrue(await IOUtils.exists(wv._wvBkPendingPath()), "staged");
            assert.strictEqual(restarted, 0, "Later: no restart");
            click("wv-bk-pending-cancel");
            assert.ok(await wvT.waitFor(() => pending.hidden, 5000, 50), "cancelled");
            assert.isFalse(await IOUtils.exists(wv._wvBkPendingPath()));
            // Export… / Import….
            click("wv-bk-export");
            assert.ok(await wvT.waitFor(() => /Written/.test(status()), 15000, 50), "exported: " + status());
            assert.isTrue(await IOUtils.exists(file));
            click("wv-bk-import");
            assert.ok(await wvT.waitFor(() => !panel.hidden && doc.getElementById("wv-bk-list").hidden && doc.querySelectorAll("#wv-bk-preview li").length >= 1, 10000, 50), "the import's preview");
            assert.include(doc.getElementById("wv-bk-panel-head").textContent, PathUtils.filename(file));
            click("wv-bk-cancel");
            assert.ok(await wvT.waitFor(() => panel.hidden, 5000, 50), "closed");
            assert.isFalse(await IOUtils.exists(wv._wvBkPendingPath()), "nothing staged by a cancelled import");
            click("wv-bk-open");
            assert.ok(await wvT.waitFor(() => opened.length === 1, 5000, 50), "Open Folder");
        }
        finally {
            try { pw.close(); } catch (e) {}
            await wvT.waitFor(() => !prefsOpen(), 8000, 50);
            for (const k of Object.keys(stubs)) { if (stubs[k] === undefined) delete wv[k]; else wv[k] = stubs[k]; }
            await IOUtils.remove(file, { ignoreAbsent: true });
            await wv._wvBkCancelPending();
        }
    });
});
