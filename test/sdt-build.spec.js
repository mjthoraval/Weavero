/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// "Build Zotero's structure data for all PDFs" (citations M5, MJT 2026-11-21: "let Zotero build the
// full index, same as if all PDF files where opened in Zotero ... The option should be off by
// default, and get a proper warning when activated regarding the costs."). modules/sdt-build.ts:
// a Settings option under References, OFF by default, offered where Zotero has Zotero.SDT.ensure;
// on, it first counts THIS library and shows the costs (lib/sdt-build.ts's measured model); the run
// builds one PDF at a time through Zotero.SDT.ensure, most recently added first, waits while a
// reader opens a PDF, while Zotero's PDF worker is busy, after a memory-pressure notice, stops at
// Pause / off / quit and starts again from what is missing; a PDF Zotero could not build is kept in
// a memo with its file's stamp and not tried again until the file changes; each PDF built is handed
// to References (it looks again) and to Cited by (it reads it again).
//
// The run's specs STUB Zotero.SDT.ensure (`_wvSbEnsure`): it records the call and writes a stand-in
// `.zotero-sdt-cache` for the fixture's PDFs, so nothing real is built and the order, the pause and
// the memo can be watched. The fixture: standalone PDF attachments in the runner's own user
// library (a throwaway profile); no group library is involved.

describe("Weavero — Build Zotero's structure data for all PDFs (citations M5)", function () {
    this.timeout(180000);
    const PREF = "weavero.referencesBuildStructure", PAUSE = "weavero.referencesBuildStructurePaused", SKIP = "weavero.referencesBuildStructureSkipGroups";
    const made = [];
    const stubs = [];
    let wv, L, proto;

    const stub = (name, fn) => { wv[name] = fn; if (!stubs.includes(name)) stubs.push(name); };
    const unstub = (name) => { delete wv[name]; const i = stubs.indexOf(name); if (i >= 0) stubs.splice(i, 1); };
    const cacheOf = (att) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
    const memoPath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "sdt-build.json");
    async function fingerprint() {
        const rows = await Zotero.DB.queryAsync("SELECT itemID, version, dateModified, synced FROM items ORDER BY itemID");
        const parts = rows.map(r => r.itemID + ":" + r.version + ":" + r.dateModified + ":" + r.synced);
        for (const t of ["itemData", "itemTags", "itemRelations", "itemNotes", "itemCreators", "collectionItems", "itemAttachments"]) {
            parts.push(t + "=" + await Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM " + t));
        }
        return parts.join("|");
    }
    async function importPDF(name, pad, added) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, wvT.minimalPDFBytes() + "%" + "x".repeat(pad) + "\n");
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        try { await IOUtils.remove(path); } catch (e) {}
        if (added) { att.setField("dateAdded", added); await att.saveTx(); }
        made.push(att);
        return att;
    }
    /** The run's settings changed by a spec: the run they would schedule is the spec's to start. */
    async function quiet() {
        await wvT.sleep(150);
        try { L.wvClearTimeout(wv._wvSbT); } catch (e) {}
        wv._wvSbT = null;
    }
    async function setPrefs(on, paused) {
        Zotero.Prefs.set(PAUSE, !!paused);
        Zotero.Prefs.set(PREF, !!on);
        await quiet();
    }
    async function idle() { await wvT.waitFor(() => !wv._wvSbRunning, 60000, 20); }

    /** The fixture: four PDFs, added in an order their ids do not follow. */
    let A, B, C, D, BAD, ids, calls, gate;
    const fixtureOnly = () => stub("_wvSbList", async (p) => {
        const all = await proto._wvSbList.call(wv, p);
        return all && all.filter(c => ids.has(c.id));
    });
    const ensureStub = () => stub("_wvSbEnsure", async (id) => {
        calls.push(id);
        if (gate && gate.id === id) await gate.promise;
        if (BAD && id === BAD.id) return false;
        const att = made.find(a => a.id === id);
        if (att) await IOUtils.writeUTF8(cacheOf(att), "stand-in structure data");
        return true;
    });

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvSbApi", "_wvSbOn", "_wvSbRun", "_wvSbList", "_wvSbCount", "_wvSbAskOn", "_wvSbWarningText", "_wvSbStatusL10n", "_wvSbEnsure", "_wvSbMemoFlush"]) wvT.method(m);
        for (const f of ["wvSbOrder", "wvSbQueue", "wvSbMemoPrune", "wvSbEstimate", "wvSbEta", "wvSbDurationRange", "wvSbBytesRange"]) if (typeof L[f] !== "function") wvT.absent("lib." + f);
        proto = Object.getPrototypeOf(wv);
        // Neither a reader nor Zotero's PDF worker (another spec's, the fixture's indexing)
        // holds the run here unless a case says so.
        stub("_wvSbReaders", () => []);
        stub("_wvSbWorkerBusy", () => false);
        // The user away (the runner's real idle time is MJT's own input): the idle gate
        // has its own spec, sdt-build-priority.spec.js.
        stub("_wvSbIdleMs", () => 1e9);
        stub("_wvCbOn", () => true);
        stub("_wvCbPass", async (why, list) => { cbPasses.push({ why, list: list ? list.slice() : null }); });
        stub("_wvRefsLibRecheck", (id) => { rechecks.push(id); });
        wv._wvSbTuneO = { gap: 5, poll: 30, readerQuiet: 0, pressure: 0 };
    });
    let cbPasses = [], rechecks = [];

    after(async function () {
        if (gate && gate.release) gate.release();
        gate = null;
        try { Zotero.Prefs.set(PREF, false); Zotero.Prefs.set(PAUSE, false); } catch (e) {}
        await quiet();
        try { wv._wvSbWakeAll(); } catch (e) {}
        await idle();
        try { Zotero.Prefs.clear(PREF); Zotero.Prefs.clear(PAUSE); } catch (e) {}
        try { if (Zotero.Prefs.get(SKIP) !== undefined) Zotero.Prefs.set(SKIP, ""); } catch (e) {}
        for (const s of stubs.slice()) unstub(s);
        delete wv._wvSbTuneO;
        await wvT.erase(...made.slice().reverse());
        wv._wvSbMemo = null; wv._wvSbMemoIsDirty = false;
        try { await IOUtils.remove(memoPath(), { ignoreAbsent: true }); } catch (e) {}
        try { L.wvClearTimeout(wv._wvSbCbT); } catch (e) {}
        wv._wvSbCbT = null; wv._wvSbCbIds = null; wv._wvSbStO = null;
    });

    // ---- pure -------------------------------------------------------------------------------

    it("the order is newest first (dateAdded, then the later id), the queue skips what has a cache, no file, a skipped library, and a failure on the SAME file", function () {
        const c = (id, added, extra) => Object.assign({ id, lib: 1, key: "K" + id, added, bytes: 100, pages: 1, has: false, stamp: "100:" + id }, extra || {});
        assert.deepEqual(L.wvSbOrder([c(1, "2026-01-01 00:00:00"), c(2, "2026-02-01 00:00:00"), c(3, "2026-02-01 00:00:00")]).map(x => x.id), [3, 2, 1]);
        const cands = [c(1, "2026-01-01 00:00:00"), c(2, "2026-03-01 00:00:00", { has: true }), c(3, "2026-05-01 00:00:00", { bytes: 0 }),
            c(4, "2026-04-01 00:00:00", { lib: 7 }), c(5, "2026-02-01 00:00:00"), c(6, "2026-06-01 00:00:00"), c(7, "2025-01-01 00:00:00")];
        const failed = { "1/K5": "100:5", "1/K7": "an older file" };
        assert.deepEqual(L.wvSbQueue(cands, failed, [7]).map(x => x.id), [6, 1, 7],
            "6 newest; 2 has its cache; 3 has no file; 4 in a skipped library; 5 failed on this file; 7 failed on another file: tried again");
        assert.deepEqual(L.wvSbMemoPrune({ "1/K5": "100:5", "1/K7": "an older file", "1/K2": "100:2", "1/K99": "x" }, cands), { "1/K5": "100:5" },
            "the memo keeps only PDFs still there, still without a cache, on the same file");
    });

    it("the costs: the measured model per PDF (pages, else bytes), the range's ends, and the words' rounding", function () {
        const M = L.WV_SB_MODEL;
        const e = L.wvSbEstimate([{ pages: 10, bytes: 1000000 }, { pages: 0, bytes: M.bytesPerPage * 3 }]);
        assert.equal(e.pdfs, 2);
        assert.equal(e.pages, 13, "10 counted by Zotero, 3 from the second's bytes");
        assert.closeTo(e.secMid, 2 * M.sec0 + 13 * M.secPerPage, 1e-9);
        assert.closeTo(e.secLo, e.secMid * M.timeLo, 1e-9);
        assert.closeTo(e.secHi, e.secMid * M.timeHi, 1e-9);
        assert.closeTo(e.diskMid, 2 * M.cache0 + 13 * M.cachePerPage, 1e-6);
        assert.closeTo(e.diskLo, e.diskMid * M.diskLo, 1e-6);
        assert.closeTo(e.diskHi, e.diskMid * M.diskHi, 1e-6);
        // MJT's library on 2026-11-22 (work/citations-log-2026-11-21.md, M5): 6.27-11.76 h, 2.25-3.31 GB.
        assert.deepEqual(L.wvSbDurationRange(22570, 42318), { lo: 6.5, hi: 12, unit: "hours" });
        assert.deepEqual(L.wvSbBytesRange(2413800315, 3549706345), { lo: 2.2, hi: 3.3, unit: "GB" });
        assert.deepEqual(L.wvSbDurationRange(3000, 5000), { lo: 50, hi: 83, unit: "minutes" });
        assert.deepEqual(L.wvSbDurationRange(20, 40), { lo: 1, hi: 1, unit: "minutes" });
        assert.deepEqual(L.wvSbDurationRange(200000, 400000), { lo: 2.5, hi: 4.5, unit: "days" });
        assert.deepEqual(L.wvSbBytesRange(5e6, 9e6), { lo: 4.8, hi: 8.6, unit: "MB" });
        // Time left: the model's middle, scaled to the run's own pace once it has enough.
        const left = { pdfs: 100, pages: 1000 };
        const mid = 100 * M.sec0 + 1000 * M.secPerPage;
        assert.closeTo(L.wvSbEta({ pdfs: 0, pages: 0, ms: 0 }, left), mid, 1e-9);
        const done = { pdfs: 50, pages: 500, ms: 0 };
        done.ms = 2 * (50 * M.sec0 + 500 * M.secPerPage) * 1000;
        assert.closeTo(L.wvSbEta(done, left), 2 * mid, 1e-6, "twice as slow as the model: twice the time left");
        assert.equal(L.wvSbEta(done, { pdfs: 0, pages: 0 }), 0);
    });

    it("the warning states the costs it is given, every point MJT asked for", function () {
        const est = { pdfs: 18680, bytes: 60110943384, pages: 574839, secMid: 28212, secLo: 22570, secHi: 42318, diskMid: 2839765076, diskLo: 2413800315, diskHi: 3549706345 };
        const t = wv._wvSbWarningText(est);
        assert.equal(t.title, "Build the structure data of all your PDFs?");
        assert.equal(t.ok, "Build");
        const body = t.body.replace(/[⁨⁩]/g, "");
        assert.include(body, "the 18,680 PDFs that have none yet", "the PDFs without a cache");
        assert.include(body, "about 6.5–12 hours of background work", "a time range");
        assert.include(body, "only while you are not using the computer", "only while the user is away (citations M5 priority)");
        assert.include(body, "one processor core is busy while it runs");
        assert.include(body, "What you open in Zotero never waits for it.");
        assert.include(body, "about 2.2–3.3 GB more", "a disk range");
        assert.include(body, "Nothing is synced or uploaded");
        assert.include(body, "Zotero’s own cache (.zotero-sdt-cache)");
        assert.include(body, "can be deleted at any time");
    });

    // ---- the option, off by default ---------------------------------------------------------

    it("the option is OFF by default: the default branch says false, nothing is scheduled at start, no status line", async function () {
        const db = Services.prefs.getDefaultBranch("extensions.zotero.");
        assert.strictEqual(db.getBoolPref(PREF), false, "registered default: off");
        assert.strictEqual(db.getBoolPref(PAUSE), false);
        assert.isFalse(Services.prefs.getBranch("extensions.zotero.").prefHasUserValue(PREF), "the runner's profile never turned it on");
        assert.isFalse(wv._wvSbOn());
        assert.isNull(wv._wvSbT || null, "no run scheduled by init");
        assert.isFalse(!!wv._wvSbRunning);
        assert.isNull(wv._wvSbStatusL10n(), "Settings shows no status line");
        // Settings: the box, with no native binding (the warning first), under References.
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        const cb = frag.querySelector("#wv-sdt-build");
        assert.ok(cb, "the checkbox");
        assert.isFalse(cb.hasAttribute("preference"), "never bound natively: on only through the warning");
        assert.equal(cb.closest("#wv-sdt-build-block").getAttribute("data-gated-by"), "enableLinksAndRelations enableRelations enableReferences");
    });

    it("offered exactly where Zotero has Zotero.SDT.ensure (feature test; Zotero 10.0.8 has it too); without it: nothing at all", async function () {
        const SDT = /** @type {any} */ (Zotero).SDT;
        assert.equal(!!wv._wvSbApi(), !!(SDT && typeof SDT.ensure === "function"));
        stub("_wvSbApi", () => null);
        let prompted = 0;
        stub("_wvSbPrompt", async () => { prompted++; return true; });
        calls = [];
        ensureStub();
        try {
            assert.isFalse(await wv._wvSbAskOn(null), "no warning, not turned on");
            assert.equal(prompted, 0);
            Zotero.Prefs.set(PREF, true);
            await quiet();
            assert.isFalse(wv._wvSbOn(), "the pref alone does not run it");
            await wv._wvSbRun("spec");
            assert.deepEqual(calls, [], "nothing built");
            assert.isNull(wv._wvSbStatusL10n(), "no status line");
        }
        finally {
            Zotero.Prefs.set(PREF, false);
            await quiet();
            unstub("_wvSbApi"); unstub("_wvSbPrompt"); unstub("_wvSbEnsure");
        }
    });

    it("steps aside while Zotero builds them itself (zotero#6012's AutoIndex on)", async function () {
        stub("_wvSbZoteroBuilds", () => true);
        calls = [];
        ensureStub();
        try {
            Zotero.Prefs.set(PREF, true);
            await quiet();
            assert.isFalse(wv._wvSbOn());
            await wv._wvSbRun("spec");
            assert.deepEqual(calls, []);
            assert.deepEqual(wv._wvSbStatusL10n(), { id: "weavero-sdt-build-status-zotero" });
            assert.isFalse(await wv._wvSbAskOn(null));
        }
        finally {
            Zotero.Prefs.set(PREF, false);
            await quiet();
            unstub("_wvSbZoteroBuilds"); unstub("_wvSbEnsure");
        }
    });

    // ---- the fixture library: the warning's figures, then the run ---------------------------

    it("the warning's figures are this library's: the PDFs without a cache, their pages and bytes; Cancel leaves it off, Build turns it on", async function () {
        if (!wv._wvSbApi()) this.skip(); // version: Zotero without Zotero.SDT.ensure (the case above covers it)
        // Added in an order their ids do not follow: D newest, then B, A, C.
        A = await importPDF("wv-sb-a", 1000, "2026-01-03 10:00:00");
        B = await importPDF("wv-sb-b", 2000, "2026-01-04 10:00:00");
        C = await importPDF("wv-sb-c", 3000, "2026-01-02 10:00:00");
        D = await importPDF("wv-sb-d", 4000, "2026-01-05 10:00:00");
        ids = new Set([A.id, B.id, C.id, D.id]);
        // C has its structure data already (Zotero's reader opened it, say).
        await IOUtils.writeUTF8(cacheOf(C), "stand-in structure data");
        const c = await wv._wvSbCount();
        const mine = c.cands.filter(x => ids.has(x.id));
        assert.equal(mine.length, 4, "the four PDFs listed");
        assert.deepEqual(mine.filter(x => x.has).map(x => x.id), [C.id], "C has its cache");
        const sizes = {};
        for (const a of [A, B, D]) sizes[a.id] = (await IOUtils.stat(await a.getFilePathAsync())).size;
        for (const x of mine.filter(y => !y.has)) assert.equal(x.bytes, sizes[x.id], "the file's own bytes");
        const q = c.queue.filter(x => ids.has(x.id)).map(x => x.id);
        assert.deepEqual(q, [D.id, B.id, A.id], "to build: newest first, C left out");
        // The estimate is the model over exactly the queue (the whole library's queue).
        const e = L.wvSbEstimate(c.queue);
        assert.deepEqual(c.est, e);
        assert.equal(c.est.pdfs, c.cands.filter(x => !x.has && x.bytes > 0).length, "every PDF of the library without a cache");
        // The warning shown is built from these figures; Cancel: off.
        const shown = [];
        stub("_wvSbPrompt", async (win, text) => { shown.push(text); return false; });
        assert.isFalse(await wv._wvSbAskOn(null));
        assert.equal(shown.length, 1);
        assert.strictEqual(Zotero.Prefs.get(PREF), false, "Cancel: still off");
        const body = shown[0].body.replace(/[⁨⁩]/g, "");
        assert.include(body, wv._wvSbDurText(c.est.secLo, c.est.secHi).replace(/[⁨⁩]/g, ""));
        assert.include(body, wv._wvSbSizeText(c.est.diskLo, c.est.diskHi).replace(/[⁨⁩]/g, ""));
        assert.match(body, new RegExp("\\b" + c.est.pdfs.toLocaleString("en-US") + " PDF"), "the count");
        // Build: on, not paused (the run's stand-in ensure first: no real work in this spec).
        calls = [];
        ensureStub();
        fixtureOnly();
        stub("_wvSbPrompt", async () => true);
        assert.isTrue(await wv._wvSbAskOn(null));
        await quiet();
        assert.strictEqual(Zotero.Prefs.get(PREF), true);
        assert.strictEqual(Zotero.Prefs.get(PAUSE), false);
        assert.isTrue(wv._wvSbOn());
        Zotero.Prefs.set(PREF, false);
        await quiet();
        unstub("_wvSbPrompt");
    });

    it("the run: one PDF at a time, newest first; what Zotero could not build is kept with its file's stamp and not tried again, a new file is; References and Cited by get each PDF built; nothing written to the library", async function () {
        if (!A) this.skip(); // version: the fixture needs Zotero.SDT.ensure (the case above)
        BAD = B;
        calls = []; cbPasses = []; rechecks = [];
        const fp0 = await fingerprint();
        let concurrent = 0, maxConcurrent = 0;
        const inner = wv._wvSbEnsure;
        stub("_wvSbEnsure", async (id) => { concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); try { await wvT.sleep(20); return await inner(id); } finally { concurrent--; } });
        await setPrefs(true, false);
        await wv._wvSbRun("spec");
        assert.deepEqual(calls, [D.id, B.id, A.id], "newest first, C (a cache already) never asked");
        assert.equal(maxConcurrent, 1, "one at a time");
        assert.equal(wv._wvSbSt().state, "done");
        assert.equal(wv._wvSbSt().built, 2);
        assert.isTrue(await IOUtils.exists(cacheOf(D)));
        assert.isFalse(await IOUtils.exists(cacheOf(B)), "B failed");
        // The memo: B's library/key with its file's stamp, on disk.
        const st = await IOUtils.stat(await B.getFilePathAsync());
        const key = B.libraryID + "/" + B.key;
        assert.equal(wv._wvSbMemo.failed[key], st.size + ":" + st.lastModified);
        await wv._wvSbMemoFlush();
        const disk = JSON.parse(await IOUtils.readUTF8(memoPath()));
        assert.equal(disk.failed[key], st.size + ":" + st.lastModified, "kept in weavero/sdt-build.json");
        // References looked again at each PDF built, at once; Cited by got them at the run's end.
        assert.deepEqual(rechecks, [D.id, A.id]);
        assert.equal(cbPasses.length, 1);
        assert.sameMembers(cbPasses[0].list, [D.id, A.id]);
        // A restart: the memo read again from disk, nothing tried again.
        wv._wvSbMemo = null;
        calls = [];
        await wv._wvSbRun("spec again");
        assert.deepEqual(calls, [], "B not retried, the others have their cache");
        assert.equal(wv._wvSbStatusL10n().id, "weavero-sdt-build-status-done");
        assert.deepEqual(wv._wvSbStatusL10n().args, { failed: 1 });
        // B's file changes: tried again.
        const p = await B.getFilePathAsync();
        await IOUtils.writeUTF8(p, wvT.minimalPDFBytes() + "%" + "y".repeat(2500) + "\n");
        BAD = null;
        calls = [];
        await wv._wvSbRun("spec new file");
        assert.deepEqual(calls, [B.id], "a new file is tried again");
        assert.isUndefined(wv._wvSbMemo.failed[key], "and leaves the memo once built");
        assert.equal(await fingerprint(), fp0, "nothing written to the library");
        await setPrefs(false, false);
    });

    it("Pause stops the run after the PDF in hand; Resume goes on from what is missing", async function () {
        if (!A) this.skip(); // version: the fixture needs Zotero.SDT.ensure
        for (const a of [A, B, D]) await IOUtils.remove(cacheOf(a), { ignoreAbsent: true });
        wv._wvSbMemo = { v: 1, failed: {} };
        calls = [];
        let release;
        gate = { id: D.id }; gate.promise = new Promise(r => { release = r; gate.release = r; });
        ensureStub();
        await setPrefs(true, false);
        const run = wv._wvSbRun("spec");
        await wvT.waitFor(() => calls.length === 1, 10000, 10);
        assert.equal(wv._wvSbSt().current, D.id, "building D");
        Zotero.Prefs.set(PAUSE, true);
        await quiet();
        release();
        gate = null;
        await run;
        assert.deepEqual(calls, [D.id], "stopped after D");
        assert.equal(wv._wvSbSt().state, "stopped");
        assert.deepEqual(wv._wvSbStatusL10n(), { id: "weavero-sdt-build-status-paused" });
        // Resume: the run (as the setting starts it) builds the rest, D not again.
        Zotero.Prefs.set(PAUSE, false);
        await quiet();
        await wv._wvSbRun("spec resume");
        assert.deepEqual(calls, [D.id, B.id, A.id]);
        await setPrefs(false, false);
    });

    it("waits while a reader opens a PDF, while Zotero's PDF worker is busy, and after a memory-pressure notice; stops when the option goes off", async function () {
        if (!A) this.skip(); // version: the fixture needs Zotero.SDT.ensure
        for (const a of [A, B, D]) await IOUtils.remove(cacheOf(a), { ignoreAbsent: true });
        wv._wvSbMemo = { v: 1, failed: {} };
        calls = [];
        ensureStub();
        const seen = [];
        const watch = setInterval(() => { const s = wv._wvSbSt(); if (s.state === "waiting") seen.push(s.wait + "@" + calls.length); }, 10);
        try {
            // A reader just opened: wait readerQuiet after it was first seen.
            const reader = {};
            wv._wvSbTuneO = { gap: 5, poll: 30, readerQuiet: 400, pressure: 400 };
            stub("_wvSbReaders", () => [reader]);
            await setPrefs(true, false);
            let release;
            gate = { id: D.id }; gate.promise = new Promise(r => { release = r; gate.release = r; });
            const t0 = Date.now();
            const run = wv._wvSbRun("spec");
            await wvT.waitFor(() => calls.length >= 1, 10000, 10);
            assert.isAtLeast(Date.now() - t0, 350, "the first PDF waited for the reader's open");
            assert.ok(seen.some(s => s === "reader@0"), "waiting (reader) before any build: " + seen.slice(0, 5));
            // Zotero's PDF worker busy with something else once D is done.
            let busy = true;
            stub("_wvSbWorkerBusy", () => busy);
            // States, not wall-clock windows (dev.99 triage, 2026-11-27): a fixed 250 ms was
            // shorter than D's after-build work under load, and a 1.5-s pressure window could be
            // over before the run's first turn (the notice's own observers -- Gecko's purge, a GC
            // -- and the run's scan of every PDF come first), so the run never waited for memory.
            release();
            gate = null;
            assert.ok(await wvT.waitFor(() => seen.includes("busy@1"), 10000, 10), "waiting (busy) once D is done: " + seen.slice(-3));
            assert.deepEqual(calls, [D.id], "nothing more while the worker is busy");
            busy = false;
            await run;
            assert.deepEqual(calls, [D.id, B.id, A.id]);
            // Memory pressure: Gecko's own notice. The run is held at a reader wait first (its
            // turn reached, nothing built), the notice turns that wait into a memory wait, and
            // both are ended by hand.
            for (const a of [A, B, D]) await IOUtils.remove(cacheOf(a), { ignoreAbsent: true });
            calls = [];
            gate = { id: D.id }; gate.promise = new Promise(r => { release = r; gate.release = r; });
            wv._wvSbTuneO = { gap: 5, poll: 30, readerQuiet: 60000, pressure: 60000 };
            wv._wvSbPressureAt = 0;
            const reader2 = {};
            stub("_wvSbReaders", () => [reader2]);
            seen.splice(0);
            const run2 = wv._wvSbRun("spec memory");
            assert.ok(await wvT.waitFor(() => seen.includes("reader@0"), 20000, 10), "held at a reader wait before any build: " + seen.slice(-3));
            Services.obs.notifyObservers(null, "memory-pressure", "low-memory");
            assert.isAbove(wv._wvSbPressureAt || 0, 0, "the run heard Gecko's notice (observer wired: " + !!wv._wvSbObs + ")");
            assert.ok(await wvT.waitFor(() => seen.includes("memory@0"), 10000, 10), "waiting (memory): " + seen.slice(-3));
            assert.deepEqual(calls, [], "nothing built while memory is low");
            wv._wvSbPressureAt = 0;
            stub("_wvSbReaders", () => []);
            assert.ok(await wvT.waitFor(() => calls.length >= 1, 10000, 10), "the build goes on once the notice is over: " + seen.slice(-3));
            // The option off while D is in hand: the run stops at its next turn.
            Zotero.Prefs.set(PREF, false);
            await quiet();
            release();
            gate = null;
            await run2;
            assert.deepEqual(calls, [D.id], "stopped after the PDF in hand");
            assert.equal(wv._wvSbSt().state, "stopped");
        }
        finally {
            clearInterval(watch);
            // A failed assertion above must not leave the run waiting on a shut gate.
            if (gate && gate.release) gate.release();
            gate = null;
            stub("_wvSbReaders", () => []);
            stub("_wvSbWorkerBusy", () => false);
            wv._wvSbTuneO = { gap: 5, poll: 30, readerQuiet: 0, pressure: 0 };
            wv._wvSbPressureAt = 0;
            await setPrefs(false, false);
        }
    });

    it("a group named in the hidden skip list is left alone; this runner has no group of the stand-in id", async function () {
        if (!A) this.skip(); // version: the fixture needs Zotero.SDT.ensure
        // A stand-in group id for the user library: the skip list's mapping, not a real
        // group, never one of the maintainer's real groups, and none of this profile's.
        const GID = 999999001;
        assert.isNotOk(Zotero.Groups.getLibraryIDFromGroupID(GID), "no such group in the throwaway profile");
        for (const a of [A, B, D]) await IOUtils.remove(cacheOf(a), { ignoreAbsent: true });
        wv._wvSbMemo = { v: 1, failed: {} };
        calls = [];
        ensureStub();
        const G = Zotero.Groups;
        const orig = G.getLibraryIDFromGroupID;
        G.getLibraryIDFromGroupID = (g) => (g === GID ? Zotero.Libraries.userLibraryID : orig.call(G, g));
        try {
            Zotero.Prefs.set(SKIP, String(GID));
            assert.deepEqual(Array.from(wv._wvSbSkipLibs()), [Zotero.Libraries.userLibraryID]);
            await setPrefs(true, false);
            await wv._wvSbRun("spec skip");
            assert.deepEqual(calls, [], "nothing in that library built");
        }
        finally {
            G.getLibraryIDFromGroupID = orig;
            Zotero.Prefs.set(SKIP, "");
            await setPrefs(false, false);
        }
        assert.deepEqual(Array.from(wv._wvSbSkipLibs()), []);
    });

    it("Settings: the box under References, unchecked; checked -> the warning (Cancel: unchecked, off); Build -> on, a status line, Pause / Resume, Stop -> off", async function () {
        if (!wv._wvSbApi()) this.skip(); // version: Zotero without Zotero.SDT.ensure (hidden: the case below)
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        assert.ok(await wvT.waitFor(() => !prefsOpen(), 8000, 50), "no Settings window left from an earlier spec");
        calls = [];
        ensureStub();
        fixtureOnly();
        let answer = false, prompted = 0;
        stub("_wvSbPrompt", async () => { prompted++; return answer; });
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        try {
            const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find(k => /weavero@mjthoraval/.test(k));
            assert.ok(await wvT.waitFor(() => !!paneID(), 10000, 50), "Weavero's pane registered");
            await pw.Zotero_Preferences.navigateToPane(paneID());
            const cb = await wvT.waitFor(() => pw.document.getElementById("wv-sdt-build"), 15000, 50);
            assert.ok(cb, "the checkbox");
            const block = pw.document.getElementById("wv-sdt-build-block");
            // The pane's script binds after the fragment is in (prefs/index.ts start()): a click
            // before that would only tick the box.
            assert.ok(await wvT.waitFor(() => block.getAttribute("data-wv-bound") === "true", 15000, 50), "the pane's script bound the box");
            assert.notEqual(pw.getComputedStyle(block).display, "none", "shown: the API is there");
            assert.isFalse(cb.checked, "unchecked");
            const status = pw.document.getElementById("wv-sdt-build-status");
            const btns = pw.document.getElementById("wv-sdt-build-btns");
            assert.isTrue(status.hidden, "no status line while off");
            assert.isTrue(btns.hidden, "no buttons while off");
            // Checked -> the warning; Cancel.
            cb.click();
            assert.ok(await wvT.waitFor(() => prompted === 1 && !wv._wvSbAsking, 15000, 50),
                "the warning was shown (prompted " + prompted + ", asking " + !!wv._wvSbAsking + ", checked " + cb.checked + ", disabled " + cb.disabled + ")");
            await wvT.sleep(100);
            assert.isFalse(cb.checked, "Cancel: unchecked");
            assert.strictEqual(Zotero.Prefs.get(PREF), false);
            // Build.
            answer = true;
            cb.click();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get(PREF) === true, 15000, 50), "Build: on");
            assert.ok(await wvT.waitFor(() => cb.checked && !status.hidden && !btns.hidden, 5000, 50), "checked, a status line, the buttons");
            const pause = pw.document.getElementById("wv-sdt-build-pause");
            assert.equal(pause.getAttribute("data-l10n-id"), "weavero-sdt-build-pause");
            pause.click();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get(PAUSE) === true, 5000, 50), "Pause");
            assert.ok(await wvT.waitFor(() => pause.getAttribute("data-l10n-id") === "weavero-sdt-build-resume" && status.getAttribute("data-l10n-id") === "weavero-sdt-build-status-paused", 5000, 50), "Resume offered, the line says paused");
            pause.click();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get(PAUSE) === false, 5000, 50), "Resume");
            const stop = pw.document.getElementById("wv-sdt-build-stop");
            stop.click();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get(PREF) === false && !cb.checked && btns.hidden, 5000, 50), "Stop: off, unchecked, no buttons");
        }
        finally {
            try { pw.close(); } catch (e) {}
            await wvT.waitFor(() => !prefsOpen(), 8000, 50);
            Zotero.Prefs.set(PREF, false);
            Zotero.Prefs.set(PAUSE, false);
            await quiet();
            await idle();
            unstub("_wvSbPrompt");
        }
    });

    it("Settings without Zotero.SDT.ensure: the option is not shown", async function () {
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        assert.ok(await wvT.waitFor(() => !prefsOpen(), 8000, 50));
        stub("_wvSbApi", () => null);
        const pw = Zotero.Utilities.Internal.openPreferences("general");
        try {
            const paneID = () => [...pw.Zotero_Preferences.panes.keys()].find(k => /weavero@mjthoraval/.test(k));
            assert.ok(await wvT.waitFor(() => !!paneID(), 10000, 50));
            await pw.Zotero_Preferences.navigateToPane(paneID());
            const block = await wvT.waitFor(() => pw.document.getElementById("wv-sdt-build-block"), 15000, 50);
            assert.ok(block);
            assert.ok(await wvT.waitFor(() => pw.getComputedStyle(block).display === "none", 5000, 50), "hidden");
        }
        finally {
            try { pw.close(); } catch (e) {}
            await wvT.waitFor(() => !prefsOpen(), 8000, 50);
            unstub("_wvSbApi");
        }
    });
});
