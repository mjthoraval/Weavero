/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// Remove Built Data (MJT 2026-11-24: "If Weavero builds so much data, the user should have a way
// to clean it, as the data can be rebuilt again without loosing anything"; intake: remove ALL
// rebuildable data, in Settings beside the build option, the cleaning turns the build off).
// modules/sdt-build.ts: Settings shows what the built data takes (measured when the pane opens)
// and a Remove Built Data… button; confirmed, the cleaning
//   1. turns "Build Zotero's structure data for all PDFs" off and waits for the PDF in hand;
//   2. forgets the Cited by index in memory, the pass running ending without a write;
//   3. removes Zotero's structure-data pack (`.zotero-sdt-cache`, sdt.js _getCachePath) beside
//      every attachment of the user's libraries -- the trash too -- but in the libraries of the
//      groups the hidden skip list names (weavero.referencesBuildStructureSkipGroups);
//   4. removes Weavero's caches BUILT from the library (cited-by/, sdt-build.json: "cache" in
//      lib/backup.ts), never People's downloaded cache, the icons, the feed scores, nor any data;
//   5. reports what it removed, a file it could not remove counted and skipped.
//
// The fixture: PDFs, an EPUB, a snapshot and a trashed PDF in the runner's user library, a PDF in
// a group the spec creates (its id in the skip list), stand-in packs at Zotero's exact path (a
// real pack for one PDF where this Zotero builds them), stand-in files in cited-by/. The runner's
// profile is a throwaway, linked to no Zotero account (asserted): nothing made here syncs, and
// the group's made-up id is none of the profile's groups -- never one of the maintainer's real ones.
//
// FAILS on main 6e231303 (no such surface).

describe("Weavero — Remove Built Data (structure data and the caches built from it)", function () {
    this.timeout(240000);
    const PREF = "weavero.referencesBuildStructure", PAUSE = "weavero.referencesBuildStructurePaused", SKIP = "weavero.referencesBuildStructureSkipGroups";
    const made = [];
    const stubs = [];
    let wv, L, group, P1, P2, E, S, T, G1, U, parent;

    const stub = (name, fn) => { wv[name] = fn; if (!stubs.includes(name)) stubs.push(name); };
    const unstub = (name) => { delete wv[name]; const i = stubs.indexOf(name); if (i >= 0) stubs.splice(i, 1); };
    const packOf = (att) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
    const wvDir = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero");
    const cbDir = () => PathUtils.join(wvDir(), "cited-by");
    const memoPath = () => PathUtils.join(wvDir(), "sdt-build.json");
    const dlDir = () => PathUtils.join(wvDir(), "doc-layer");
    const dlFile = () => PathUtils.join(dlDir(), "u", "W", "WVSCSPEC.jsonlz4");
    const ownData = () => PathUtils.join(wvDir(), "wv-sc-spec-store.json");
    const peopleCache = () => PathUtils.join(wvDir(), "people-cache", "wvscspec.jsonlz4");
    const sdtThere = () => !!(/** @type {any} */ (Zotero).SDT && typeof /** @type {any} */ (Zotero).SDT.ensure === "function");
    const SIZES = () => new Map([[P2.id, 1200], [E.id, 1300], [S.id, 1400], [T.id, 1500], [G1.id, 1600]]);

    async function writeN(path, n, ch) {
        await IOUtils.makeDirectory(PathUtils.parent(path), { createAncestors: true, ignoreExisting: true });
        await IOUtils.write(path, new Uint8Array(n).fill(ch || 65));
    }
    /** Every file under `dir` (recursive): [{ rel, path, size }]. */
    async function walk(dir, rel = "", skip = []) {
        const out = [];
        let kids = [];
        try { kids = await IOUtils.getChildren(dir); } catch (e) { return out; }
        for (const k of kids) {
            const name = PathUtils.filename(k);
            const r = rel ? rel + "/" + name : name;
            let st = null;
            try { st = await IOUtils.stat(k); } catch (e) { continue; }
            if (st.type === "directory") { if (!skip.includes(r)) out.push(...await walk(k, r, skip)); }
            else out.push({ rel: r, path: k, size: st.size });
        }
        return out;
    }
    /** Weavero's own DATA files (lib/backup.ts "data"), each with its SHA-256. */
    async function dataSnapshot() {
        const out = {};
        for (const f of await walk(wvDir(), "", ["backups", "cited-by", "people-cache", "win-icons", "restart-test", "pre-test"])) {
            if (L.wvBkClassify(f.rel) !== "data") continue;
            out[f.rel] = await L.wvBkSha256(await IOUtils.read(f.path));
        }
        return out;
    }
    /** The fixture's packs: a real one for P1 where Zotero builds them, stand-ins at the exact path
     *  for the others (and for P1 elsewhere). Returns each attachment's pack size. */
    async function plantPacks() {
        const sizes = new Map();
        let real = false;
        if (sdtThere()) {
            try { real = !!(await Promise.race([/** @type {any} */ (Zotero).SDT.ensure(P1.id), wvT.sleep(30000).then(() => false)])); } catch (e) { real = false; }
        }
        real = real && await IOUtils.exists(packOf(P1));
        if (!real) await writeN(packOf(P1), 1100);
        sizes.set(P1.id, (await IOUtils.stat(packOf(P1))).size);
        try { wvT.trace("sdt-clean: P1's pack " + (real ? "built by Zotero.SDT.ensure" : "a stand-in") + ", " + sizes.get(P1.id) + " bytes"); } catch (e) {}
        for (const [id, n] of SIZES()) {
            const att = made.find(a => a.id === id);
            await writeN(packOf(att), n);
            sizes.set(id, n);
        }
        return sizes;
    }
    async function removePacks() {
        for (const a of [P1, P2, E, S, T, G1]) await IOUtils.remove(packOf(a), { ignoreAbsent: true });
    }
    /** Stand-ins in Weavero's built caches: two files in cited-by/ (one in an entries folder), a
     *  document layer's file (doc-layer/<lib>/<K>/<KEY>.jsonlz4), and the build's memo. 300 + 400 +
     *  250 + the memo's bytes. */
    async function plantStores() {
        await writeN(PathUtils.join(cbDir(), "wv-sc-spec-a.json"), 300);
        await writeN(PathUtils.join(cbDir(), "entries", "99", "wv-sc-spec.jsonlz4"), 400);
        await writeN(dlFile(), 250);
        await IOUtils.writeUTF8(memoPath(), JSON.stringify({ v: 1, failed: { "1/AAAAAAAA": "1:2" } }));
        wv._wvSbMemo = null; wv._wvSbMemoIsDirty = false;
    }
    async function cbQuiet() {
        // No Cited by pass in the background while the spec measures and cleans (it writes in
        // cited-by/); the cases that need one stub _wvCbOn on.
        stub("_wvCbOn", () => false);
        // Asserted (dev.99 triage, 2026-11-27): a pass an earlier spec left running for good
        // (refs-fulltext's, two pacing waits on one handle) made every case here wait this
        // minute out and then fail far from its cause.
        assert.ok(await wvT.waitFor(() => !wv._wvCbRunning, 60000, 50),
            "no Cited by pass left running (by an earlier spec, or a case here): " + JSON.stringify(Object.assign({}, wv._wvCbStatsObj(), { waits: wv._wvCbIdles ? wv._wvCbIdles.size : null })));
        try { await wv._wvCbFlush(); } catch (e) {}
    }
    async function buildOff() {
        Zotero.Prefs.set(PREF, false);
        Zotero.Prefs.set(PAUSE, false);
        await wvT.sleep(150);
        try { L.wvClearTimeout(wv._wvSbT); } catch (e) {}
        wv._wvSbT = null;
        await wvT.waitFor(() => !wv._wvSbRunning, 60000, 20);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvSbCleanList", "_wvSbCleanMeasure", "_wvSbCleanRun", "_wvSbCleanAsk", "_wvSbCleanText", "_wvSbCleanStores", "_wvSbCleanL10n",
            "_wvSbCleanRemove", "_wvCbReset", "_wvRefsDropCaches", "_wvSbTurnOff", "_wvCbPass", "_wvCbLoad"]) wvT.method(m);
        assert.isNotOk(Zotero.Users.getCurrentUsername(), "the throwaway profile is linked to no Zotero account: nothing made here syncs");
        await cbQuiet();
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const gid = Zotero.Utilities.rand(10000, 1000000);
        assert.isNotOk(Zotero.Groups.getLibraryIDFromGroupID(gid), "no group " + gid + " in the throwaway profile");
        group = new Zotero.Group();
        Object.assign(group, { id: gid, name: "wv-sdtclean-group", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        P1 = await wvT.createTestPDFItem("wv-sc-p1");
        P2 = await wvT.createTestPDFItem("wv-sc-p2");
        E = await wvT.createTestEPUBItem("wv-sc-e");
        S = await wvT.createTestSnapshotItem("wv-sc-s");
        T = await wvT.createTestPDFItem("wv-sc-t");
        G1 = await wvT.createTestPDFItem("wv-sc-g1", { libraryID: group.libraryID });
        made.push(P1, P2, E, S, T, G1);
        T.deleted = true;
        await T.saveTx();
        // A linked URL: no file, no storage folder of its own; Zotero never writes a pack for one.
        parent = await wvT.createItem("journalArticle", { title: "WV-TEST sdt-clean parent" });
        U = new Zotero.Item("attachment");
        U.libraryID = Zotero.Libraries.userLibraryID;
        U.parentID = parent.id;
        U.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
        U.attachmentContentType = "text/html";
        U.setField("title", "WV-TEST link");
        U.setField("url", "https://example.com/wv-sc");
        await U.saveTx();
        made.push(U, parent);
    });

    after(async function () {
        try { await buildOff(); } catch (e) {}
        try { Zotero.Prefs.clear(PREF); Zotero.Prefs.clear(PAUSE); } catch (e) {}
        try { if (Zotero.Prefs.get(SKIP) !== undefined) Zotero.Prefs.set(SKIP, ""); } catch (e) {}
        for (const s of stubs.slice()) unstub(s);
        delete wv._wvSbTuneO;
        for (const p of [ownData(), peopleCache(), PathUtils.join(cbDir(), "wv-sc-spec-a.json"), PathUtils.join(cbDir(), "entries", "99", "wv-sc-spec.jsonlz4")]) {
            try { await IOUtils.remove(p, { ignoreAbsent: true }); } catch (e) {}
        }
        try { await IOUtils.remove(PathUtils.join(cbDir(), "entries", "99"), { ignoreAbsent: true }); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
        try { if (group) await group.eraseTx(); } catch (e) {}
        wv._wvSbMemo = null; wv._wvSbMemoIsDirty = false; wv._wvSbStO = null;
    });

    // ---- what it removes ------------------------------------------------------------------------

    it("Weavero's stores it removes are lib/backup.ts's caches built from the library: cited-by/, sdt-build.json and the document layer's doc-layer/ -- never People's downloaded cache, the icons, the feed scores, nor any data", function () {
        const st = wv._wvSbCleanStores();
        assert.deepEqual(st.map(s => s.rel), ["cited-by", "sdt-build.json", "doc-layer"]);
        assert.deepEqual(st.map(s => s.dir), [true, false, true]);
        for (const s of st) {
            assert.equal(L.wvBkClassify(s.dir ? s.rel + "/x.json" : s.rel), "cache", s.rel + " is a cache in lib/backup.ts");
            assert.equal(PathUtils.parent(s.path), wvDir(), s.rel + " right under weavero/");
        }
        // What stays, and why: downloaded (a rebuild needs the network), or not built from the library.
        for (const rel of ["people-cache/x.jsonlz4", "win-icons/x.ico", "feeds/scores.json"]) assert.equal(L.wvBkClassify(rel), "cache", rel);
        // The user's own stores are data (and so never a target).
        for (const rel of ["outlines.json", "bookmarks.json", "people.json", "feeds/settings.json", "tab-groups.json", "tab-sessions.json", "wv-sc-spec-store.json"]) {
            assert.equal(L.wvBkClassify(rel), "data", rel);
        }
    });

    it("the list: every attachment with a storage folder of the user's libraries, the trash too, EPUBs and snapshots too; no linked URL; never a skipped group's library", async function () {
        Zotero.Prefs.set(SKIP, "");
        let list = await wv._wvSbCleanList();
        const byId = new Map(list.map(c => [c.id, c]));
        for (const a of [P1, P2, E, S, T, G1]) {
            assert.ok(byId.has(a.id), "listed: " + a.getField("title"));
            assert.equal(byId.get(a.id).path, packOf(a), "Zotero's own path rule (sdt.js _getCachePath)");
        }
        assert.isFalse(byId.has(U.id), "a linked URL has no pack");
        Zotero.Prefs.set(SKIP, String(group.id));
        list = await wv._wvSbCleanList();
        assert.isFalse(list.some(c => c.lib === group.libraryID), "nothing of the skipped group");
        assert.isFalse(list.some(c => c.key === G1.key), "nor a folder of its key");
        assert.ok(list.some(c => c.id === P1.id), "the user library still listed");
    });

    it("measure: the packs beside the fixture's documents and the built caches' files, counted and summed -- the skipped group's pack not -- and kept a few seconds", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await removePacks();
        for (const p of [PathUtils.join(cbDir(), "wv-sc-spec-a.json"), PathUtils.join(cbDir(), "entries", "99", "wv-sc-spec.jsonlz4"), memoPath(), dlFile()]) await IOUtils.remove(p, { ignoreAbsent: true });
        const m0 = await wv._wvSbCleanMeasure(true);
        const sizes = await plantPacks();
        await plantStores();
        const memo = (await IOUtils.stat(memoPath())).size;
        const m1 = await wv._wvSbCleanMeasure(true);
        assert.equal(m1.packs - m0.packs, 5, "P1, P2, the EPUB, the snapshot, the trashed PDF (not the skipped group's)");
        let want = 0;
        for (const a of [P1, P2, E, S, T]) want += sizes.get(a.id);
        assert.equal(m1.packBytes - m0.packBytes, want, "their bytes");
        assert.equal(m1.storeFiles - m0.storeFiles, 4, "two in cited-by/, the document layer's file and the memo");
        assert.equal(m1.storeBytes - m0.storeBytes, 300 + 400 + 250 + memo);
        assert.equal(m1.bytes, m1.packBytes + m1.storeBytes);
        assert.isTrue(m1.index, "the Cited by folder has files");
        // Kept: asked again at once, the same answer and no new walk.
        let walks = 0;
        const inner = wv._wvSbCleanList;
        stub("_wvSbCleanList", async () => { walks++; return inner.call(wv); });
        try {
            const m2 = await wv._wvSbCleanMeasure();
            assert.strictEqual(m2, m1, "the measure just made");
            assert.equal(walks, 0, "no walk");
            await wv._wvSbCleanMeasure(true);
            assert.equal(walks, 1, "forced: walked again");
        }
        finally { unstub("_wvSbCleanList"); }
    });

    it("the confirmation states the size, the count, that the data comes back, that the build goes off, and what is kept; Cancel removes nothing", async function () {
        const t = wv._wvSbCleanText({ packs: 18680, packBytes: 2000000000, storeFiles: 900, storeBytes: 411724800, bytes: 2411724800, index: true, at: Date.now() });
        const body = t.body.replace(/[⁨⁩]/g, "");
        assert.equal(t.title, "Remove the built data?");
        assert.equal(t.ok, "Remove");
        assert.include(body, "2.2 GB", "the size");
        assert.include(body, "18,680 documents", "the count");
        assert.include(body, ".zotero-sdt-cache", "Zotero's own files named");
        assert.include(body, "Cited by index");
        assert.include(body, "Nothing is lost");
        assert.include(body, "when you open it in its reader", "it comes back when a document is opened");
        assert.include(body, "is turned off", "the build goes off");
        assert.include(body, "bookmarks", "the user's own data kept");
        assert.include(body, "outlines");
        // Cancel: nothing removed, the build left as it was.
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await plantPacks();
        await plantStores();
        let prompted = 0;
        stub("_wvSbPrompt", async (win, text) => { prompted++; assert.include(text.body, "documents"); return false; });
        try {
            Zotero.Prefs.set(PREF, true);
            await wvT.sleep(150);
            try { L.wvClearTimeout(wv._wvSbT); } catch (e) {}
            wv._wvSbT = null;
            assert.isNull(await wv._wvSbCleanAsk(null), "cancelled: no report");
            assert.equal(prompted, 1);
            for (const a of [P1, P2, E, S, T]) assert.isTrue(await IOUtils.exists(packOf(a)), "kept on Cancel");
            assert.isTrue(await IOUtils.exists(PathUtils.join(cbDir(), "wv-sc-spec-a.json")));
            assert.isTrue(await IOUtils.exists(memoPath()));
            assert.strictEqual(Zotero.Prefs.get(PREF), true, "Cancel leaves the build on");
        }
        finally {
            unstub("_wvSbPrompt");
            await buildOff();
        }
    });

    // ---- the cleaning ---------------------------------------------------------------------------

    it("Remove Built Data: the build off; every pack gone but the skipped group's; cited-by/ and sdt-build.json gone; the user's data byte for byte; the report; the in-memory copies reset; a fresh Cited by pass asked for", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await plantPacks();
        await plantStores();
        await IOUtils.writeUTF8(ownData(), JSON.stringify({ v: 1, mine: "a store this table does not know: data" }));
        await writeN(peopleCache(), 500, 66);
        const ownBytes = await L.wvBkSha256(await IOUtils.read(ownData()));
        const peopleBytes = await L.wvBkSha256(await IOUtils.read(peopleCache()));
        // Cited by on, its fresh pass recorded instead of run.
        stub("_wvCbOn", () => true);
        const asked = [];
        stub("_wvCbSchedule", (ms, why) => { asked.push(why); });
        // What is in memory: an index, its signatures and dirty shards; References' library looks.
        const ix = L.wvCbIndexNew();
        L.wvCbPut(ix, 999999, { s: "ft:1:1", src: "ft", p: 0, l: 1, g: 0, c: [[0, 1]] });
        wv._wvCbIx = ix;
        wv._wvCbSigs = new Map([[1, 2]]);
        wv._wvCbDirtySet = new Set([3]);
        const probe0 = { at: Date.now(), att: P1.id, kind: "sdt" }, ctx0 = { wvLib: true, itemID: P1.id }, rows0 = { rows: [] };
        wv._wvRefsLibProbes = new Map([[P1.id, probe0]]);
        wv._wvRefsLibCtxs = new Map([[P1.id, ctx0]]);
        wv._wvRefsRowCache = new Map([[P1.id, rows0]]);
        wv._wvSbSt().built = 7;
        const m1 = await wv._wvSbCleanMeasure(true);
        assert.isAbove(m1.packs, 4);
        const before = await dataSnapshot();
        assert.ok(before["wv-sc-spec-store.json"], "the spec's own data file is in the snapshot");
        // The build on, its run scheduled (3 s after the setting): the cleaning stops it.
        Zotero.Prefs.set(PAUSE, false);
        Zotero.Prefs.set(PREF, true);
        await wvT.sleep(150);
        const rep = await wv._wvSbCleanRun();
        // 1. The build off.
        assert.strictEqual(Zotero.Prefs.get(PREF), false, "the build turned off");
        assert.isNotOk(wv._wvSbT, "no run scheduled");
        // 2.-3. Zotero's packs.
        for (const a of [P1, P2, E, S, T]) assert.isFalse(await IOUtils.exists(packOf(a)), "pack removed: " + a.getField("title"));
        assert.isTrue(await IOUtils.exists(packOf(G1)), "the skipped group's pack stays");
        assert.equal((await IOUtils.stat(packOf(G1))).size, 1600);
        for (const a of [P1, P2, E, S]) assert.isTrue(await IOUtils.exists(await a.getFilePathAsync()), "the document itself stays");
        // 4. Weavero's built caches; nothing else.
        assert.isFalse(await IOUtils.exists(cbDir()), "cited-by/ gone");
        assert.isFalse(await IOUtils.exists(memoPath()), "sdt-build.json gone");
        assert.isFalse(await IOUtils.exists(dlDir()), "doc-layer/ gone, its folders too");
        assert.deepEqual(await dataSnapshot(), before, "every data file byte for byte");
        assert.equal(await L.wvBkSha256(await IOUtils.read(ownData())), ownBytes);
        assert.equal(await L.wvBkSha256(await IOUtils.read(peopleCache())), peopleBytes, "People's downloaded cache stays");
        // 5. The report: what the measure said, nothing failed.
        assert.equal(rep.failed, 0);
        assert.equal(rep.packs, m1.packs);
        assert.equal(rep.packBytes, m1.packBytes);
        assert.equal(rep.storeFiles, m1.storeFiles);
        assert.equal(rep.storeBytes, m1.storeBytes);
        assert.equal(rep.bytes, m1.bytes);
        // In memory.
        assert.isNotOk(wv._wvCbIx, "the Cited by index forgotten");
        assert.isNotOk(wv._wvCbSigs);
        assert.isNotOk(wv._wvCbDirtySet && wv._wvCbDirtySet.size, "no shard left to write");
        // Forgotten (the panes drawn again after it may start new looks).
        assert.notStrictEqual(wv._wvRefsLibProbes && wv._wvRefsLibProbes.get(P1.id), probe0, "References' library looks forgotten");
        assert.notStrictEqual(wv._wvRefsLibCtxs && wv._wvRefsLibCtxs.get(P1.id), ctx0);
        assert.notStrictEqual(wv._wvRefsRowCache && wv._wvRefsRowCache.get(P1.id), rows0);
        assert.include(wvT.src("_wvRefsDropCaches"), "entryCache", "the lists read from the packs too");
        assert.equal(wv._wvSbSt().built, 0, "the build's counters start again");
        assert.deepEqual(asked, ["built data removed"], "a fresh Cited by pass");
        // Measured again: nothing left; a load now is empty.
        const m2 = await wv._wvSbCleanMeasure(true);
        assert.equal(m2.packs, 0);
        assert.equal(m2.storeFiles, 0);
        assert.equal(m2.bytes, 0);
        const ix2 = await wv._wvCbLoad();
        assert.equal(ix2.recs.size, 0, "nothing of the old index read back");
        wv._wvCbIx = null;
        // The Settings line's state: the report, nothing to remove.
        const s = wv._wvSbCleanL10n();
        assert.isNull(s.line, "no line: nothing built");
        assert.isTrue(s.empty);
        assert.equal(s.result && s.result.id, "weavero-sdt-clean-done");
        unstub("_wvCbSchedule");
        await cbQuiet();
    });

    it("a file it cannot remove (held by another program) is counted and skipped; the others go", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await plantPacks();
        const inner = wv._wvSbCleanRemove;
        stub("_wvSbCleanRemove", async (path) => {
            if (path === packOf(P2)) throw new Error("NotAllowedError: the file is held (spec)");
            return inner.call(wv, path);
        });
        try {
            const rep = await wv._wvSbCleanRun();
            assert.equal(rep.failed, 1, "one failure");
            assert.isTrue(await IOUtils.exists(packOf(P2)), "the held file stays");
            for (const a of [P1, E, S, T]) assert.isFalse(await IOUtils.exists(packOf(a)), "the others go");
            const s = wv._wvSbCleanL10n();
            assert.equal(s.result && s.result.id, "weavero-sdt-clean-done-failed");
            assert.equal(s.result.args.failed, 1);
        }
        finally { unstub("_wvSbCleanRemove"); }
    });

    it("a build run with a PDF in hand when the cleaning starts: the cleaning waits for it, and the pack it was writing goes too", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await plantPacks();
        await IOUtils.remove(packOf(P2), { ignoreAbsent: true });
        // The run as on a Zotero with the API (Zotero 10.0.6 has none), on P2 alone, its PDF held.
        stub("_wvSbApi", () => ({ ensure: async () => false }));
        stub("_wvSbZoteroBuilds", () => false);
        stub("_wvSbReaders", () => []);
        stub("_wvSbWorkerBusy", () => false);
        stub("_wvSbIdleMs", () => 1e9);
        stub("_wvSbBuilt", () => {});
        stub("_wvSbList", async () => [{ id: P2.id, lib: P2.libraryID, key: P2.key, added: "2026-01-01 00:00:00", pages: 1, bytes: 100, has: false, stamp: "1:1" }]);
        wv._wvSbTuneO = { gap: 5, poll: 30, readerQuiet: 0, pressure: 0, idle: 0 };
        wv._wvSbMemo = { v: 1, failed: {} };
        let release = () => {}, inHand = false;
        const gate = new Promise(r => { release = () => r(undefined); });
        stub("_wvSbEnsure", async () => { inHand = true; await gate; await IOUtils.writeUTF8(packOf(P2), "stand-in structure data"); return true; });
        try {
            Zotero.Prefs.set(PAUSE, false);
            Zotero.Prefs.set(PREF, true);
            await wvT.sleep(150);
            try { L.wvClearTimeout(wv._wvSbT); } catch (e) {}
            wv._wvSbT = null;
            assert.isTrue(wv._wvSbOn(), "the run can go here");
            const run = wv._wvSbRun("spec");
            assert.ok(await wvT.waitFor(() => inHand, 10000, 10), "P2 in hand");
            const clean = wv._wvSbCleanRun();
            await wvT.sleep(400);
            assert.isTrue(!!wv._wvSbRunning, "the run still holds P2");
            assert.isTrue(await IOUtils.exists(packOf(P1)), "nothing removed while the run holds a PDF");
            release();
            const rep = await clean;
            await run;
            assert.isFalse(!!wv._wvSbRunning);
            assert.isFalse(await IOUtils.exists(packOf(P2)), "the pack written while the cleaning waited is gone too");
            assert.isFalse(await IOUtils.exists(packOf(P1)));
            assert.equal(rep.failed, 0);
            assert.strictEqual(Zotero.Prefs.get(PREF), false);
        }
        finally {
            release();
            for (const n of ["_wvSbApi", "_wvSbZoteroBuilds", "_wvSbReaders", "_wvSbWorkerBusy", "_wvSbIdleMs", "_wvSbBuilt", "_wvSbList", "_wvSbEnsure"]) unstub(n);
            delete wv._wvSbTuneO;
            await buildOff();
        }
    });

    it("a Cited by pass under way when the cleaning starts ends without writing a file", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        // P2 has a full-text cache with a reference list: a pass that goes on reads it and writes its
        // entries under cited-by/entries/.
        const ft = PathUtils.join(Zotero.Attachments.getStorageDirectory(P2).path, ".zotero-ft-cache");
        await IOUtils.writeUTF8(ft, "Introduction. ".repeat(80) + "\nReferences\n[1] A. Smith, Some title here. J. X 1, 2 (2001).\n[2] B. Jones, Other title. J. Y 3, 4 (2002).\n");
        stub("_wvCbOn", () => true);
        stub("_wvCbSchedule", () => {});
        stub("_wvCbScheduleTargeted", () => {});
        let release = () => {}, hit = false, open = false;
        const gate = new Promise(r => { release = () => r(undefined); });
        stub("_wvCbPace", async () => { if (!open) { hit = true; await gate; } });
        try {
            wv._wvCbIx = null;
            // A pass already running would only queue this one (cited-by.ts _wvCbPass) and never
            // reach the stub: say so, rather than "the pass is under way: expected null".
            assert.isNotOk(wv._wvCbRunning, "no Cited by pass under way before this one");
            const pass = wv._wvCbPass("spec");
            assert.ok(await wvT.waitFor(() => hit, 30000, 10), "the pass is under way");
            const ep0 = wv._wvCbEpoch || 0;
            const clean = wv._wvSbCleanRun();
            assert.ok(await wvT.waitFor(() => (wv._wvCbEpoch || 0) !== ep0, 5000, 10), "the index was reset");
            open = true;
            release();
            await clean;
            await pass;
            await wvT.sleep(600);
            assert.deepEqual((await walk(cbDir())).map(f => f.rel), [], "no file under cited-by/ after the pass ended");
            assert.isNotOk(wv._wvCbIx, "and nothing published in memory");
        }
        finally {
            open = true;
            release();
            for (const n of ["_wvCbPace", "_wvCbSchedule", "_wvCbScheduleTargeted"]) unstub(n);
            try { await IOUtils.remove(ft, { ignoreAbsent: true }); } catch (e) {}
            await cbQuiet();
        }
    });

    // ---- Settings -------------------------------------------------------------------------------

    it("Settings: right after the build option, on every Zotero, a line with the built data's size (measured when the pane opens) and Remove Built Data…, which asks first", async function () {
        await cbQuiet();
        Zotero.Prefs.set(SKIP, String(group.id));
        await plantPacks();
        await plantStores();
        const m = await wv._wvSbCleanMeasure(true);
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        assert.ok(await wvT.waitFor(() => !prefsOpen(), 8000, 50), "no Settings window left from an earlier spec");
        let prompted = 0;
        stub("_wvSbPrompt", async () => { prompted++; return false; });
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        try {
            const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find(k => /weavero@mjthoraval/.test(k));
            assert.ok(await wvT.waitFor(() => !!paneID(), 10000, 50), "Weavero's pane registered");
            await pw.Zotero_Preferences.navigateToPane(paneID());
            const block = await wvT.waitFor(() => pw.document.getElementById("wv-sdt-clean-block"), 15000, 50);
            assert.ok(block, "the block");
            assert.ok(await wvT.waitFor(() => block.getAttribute("data-wv-bound") === "true", 15000, 50), "the pane's script bound it");
            assert.notEqual(pw.getComputedStyle(block).display, "none", "shown (the Cited by index is built without Zotero.SDT too)");
            assert.equal(block.previousElementSibling && block.previousElementSibling.id, "wv-sdt-build-block", "right after the build option");
            assert.equal(block.getAttribute("data-wv-in"), "links relations");
            const line = pw.document.getElementById("wv-sdt-clean-size");
            const btn = /** @type {any} */ (pw.document.getElementById("wv-sdt-clean"));
            assert.equal(btn.getAttribute("data-l10n-id"), "weavero-sdt-clean-button");
            assert.ok(await wvT.waitFor(() => !line.hidden && line.getAttribute("data-l10n-id") === "weavero-sdt-clean-size", 15000, 50),
                "the line shows the measure (" + line.getAttribute("data-l10n-id") + ")");
            const args = JSON.parse(line.getAttribute("data-l10n-args") || "{}");
            assert.equal(args.count, m.packs, "the documents counted");
            assert.equal(String(args.size).replace(/[⁨⁩]/g, ""), wv._wvSbSizeText(m.bytes, m.bytes).replace(/[⁨⁩]/g, ""), "the size");
            assert.equal(args.index, "yes");
            assert.ok(await wvT.waitFor(() => !btn.disabled, 5000, 50), "the button enabled");
            btn.click();
            assert.ok(await wvT.waitFor(() => prompted === 1, 15000, 50), "it asks first");
            await wvT.sleep(200);
            for (const a of [P1, P2, E, S, T]) assert.isTrue(await IOUtils.exists(packOf(a)), "Cancel: nothing removed");
        }
        finally {
            try { pw.close(); } catch (e) {}
            await wvT.waitFor(() => !prefsOpen(), 8000, 50);
            unstub("_wvSbPrompt");
        }
    });
});
