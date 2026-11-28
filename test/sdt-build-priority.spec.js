/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// The structure-data build gives way to the user (citations M5 priority; MJT 2026-11-22: "The
// current use of the user should always have priority."). Zotero runs every PDF-worker job on ONE
// shared Web Worker, one job at a time: a priority request (a reader's: reader.js
// _createGetSDTPack -> Zotero.SDT.getPack(id, { isPriority: true })) goes to the front of the queue
// but never interrupts the job running (pdfWorker/manager.js _processQueue / _enqueue). So
// modules/sdt-build.ts now builds in Weavero's OWN instance of Zotero's PDF worker class -- a
// second Web Worker -- and writes the pack where sdt.js writes it; a PDF starts only once the user
// has been away from the computer for a minute (nsIUserIdleService, as Zotero's own full-text
// content processor does, fulltext.js); the own worker is terminated when the run pauses, stops,
// ends, waits long, at quit and in destroy(), and the job in hand is settled, never left hanging.
// Without Zotero's worker class, Zotero.SDT.ensure as before, still behind the idle gate.
//
// Stand-in Web Worker answers (Zotero's real class and queue, `_query` -- the message to the Web
// Worker -- replaced by a delay) for the timings that must not depend on the machine; real
// Web Workers on generated text PDFs for the build itself, the reader's real request during it,
// and the teardown of a real job. The fixture: standalone PDF attachments in the runner's own user
// library (a throwaway profile); no group library is involved.

describe("Weavero — the structure-data build gives way to the user (citations M5 priority)", function () {
    this.timeout(240000);
    const PREF = "weavero.referencesBuildStructure", PAUSE = "weavero.referencesBuildStructurePaused";
    const made = [];
    const stubs = [];
    let wv, L, proto, ART, BOOK, ids;
    let idleMs = 1e9;
    const strip = (s) => String(s).replace(/[⁨⁩]/g, "");

    const stub = (name, fn) => { wv[name] = fn; if (!stubs.includes(name)) stubs.push(name); };
    const unstub = (name) => { delete wv[name]; const i = stubs.indexOf(name); if (i >= 0) stubs.splice(i, 1); };
    const Z = () => /** @type {any} */ (Zotero).PDFWorker;
    const hasSDT = () => !!(/** @type {any} */ (Zotero).SDT && typeof /** @type {any} */ (Zotero).SDT.getPack === "function" && Z());
    const cacheOf = (att) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
    const memoKey = (att) => att.libraryID + "/" + att.key;
    async function clearCaches() { for (const a of made) await IOUtils.remove(cacheOf(a), { ignoreAbsent: true }); }
    /** Zotero's own PDF worker quiet for a second (the imports' full-text indexing). */
    async function workerIdle() {
        let q = 0;
        for (let i = 0; i < 900 && q < 5; i++) {
            const W = Z();
            q = (W && ((W._queue && W._queue.length) || W._processingQueue)) ? 0 : q + 1;
            await wvT.sleep(200);
        }
    }
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
    async function runEnded(ms) { return wvT.waitFor(() => !wv._wvSbRunning, ms || 60000, 10); }
    const endOwn = () => { try { if (typeof wv._wvSbWorkerEnd === "function") wv._wvSbWorkerEnd("spec"); } catch (e) {} };

    /** A PDF of `pages` pages of `lines` lines of real text (Helvetica), correct xref offsets. */
    function textPDF(pages, lines) {
        const objs = [];
        const kids = [];
        objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
        objs[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
        let n = 4;
        for (let p = 0; p < pages; p++) {
            const pn = n++, cn = n++;
            kids.push(pn + " 0 R");
            let s = "BT /F1 9 Tf 12 TL 40 760 Td\n";
            for (let l = 0; l < lines; l++) s += "(" + (p + 1) + "." + (l + 1) + " Structured text for the build: the quick brown fox jumps over the lazy dog.) '\n";
            s += "ET\n";
            objs[pn - 1] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " + cn + " 0 R >>";
            objs[cn - 1] = "<< /Length " + s.length + " >>\nstream\n" + s + "endstream";
        }
        objs[1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages + " >>";
        let body = "%PDF-1.4\n";
        const offs = [];
        for (let i = 0; i < objs.length; i++) { offs.push(body.length); body += (i + 1) + " 0 obj\n" + objs[i] + "\nendobj\n"; }
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }
    async function importPDF(name, text, added) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, text);
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        try { await IOUtils.remove(path); } catch (e) {}
        if (added) { att.setField("dateAdded", added); await att.saveTx(); }
        made.push(att);
        return att;
    }

    // ---- stand-in Web Worker answers ------------------------------------------------------------
    // Zotero's real class, queue and job (the item read, its hash, its bytes); only the message to
    // the Web Worker is replaced: the book (over 100 kB) answers in `bigMs` or when `gate` opens,
    // the article in 40 ms; anything but structure data goes to the real Web Worker.
    let bigMs = 2500, gate = null, inQuery = [], onBig = null;
    const realQuery = () => Object.getPrototypeOf(Z())._query;
    async function fakeQuery(self, action, data, transfer, options) {
        if (action !== "getStructuredDocumentText") return realQuery().call(self, action, data, transfer, options);
        const big = !!(data && data.buf && data.buf.byteLength > 100000);
        const rec = { self, big, at: Date.now(), end: 0 };
        inQuery.push(rec);
        if (big && onBig) { try { onBig(rec); } catch (e) {} }
        if (big && gate) await gate.promise;
        else await wvT.sleep(big ? bigMs : 40);
        rec.end = Date.now();
        return { buf: new Uint8Array([83, 68, 84, 33]).buffer };
    }
    /** A stand-in for Zotero's worker class: a real instance of it whose Web Worker is a stand-in
     *  (its terminate counted) and whose answers are fakeQuery's. */
    function standIn() {
        const C = Object.getPrototypeOf(Z()).constructor;
        const m = { n: 0, terminated: 0, last: null };
        function StandIn() {
            const w = new C();
            w._init = function () { if (!this._worker) this._worker = { terminate() { m.terminated++; }, postMessage() {} }; };
            w._query = function (a, d, t, o) { return fakeQuery(this, a, d, t, o); };
            m.n++;
            m.last = w;
            return w;
        }
        StandIn.prototype = C.prototype;
        return { StandIn, m };
    }
    const openGate = () => { if (gate && gate.release) gate.release(); gate = null; };
    const shutGate = () => { let release; const promise = new Promise(r => { release = r; }); gate = { promise, release }; };

    const fixtureOnly = () => stub("_wvSbList", async (p) => {
        const all = await proto._wvSbList.call(wv, p);
        return all && all.filter(c => ids.has(c.id));
    });

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvSbRun", "_wvSbEnsure", "_wvSbList", "_wvSbStatusL10n", "_wvSbWarningText", "_wvSbDestroy"]) wvT.method(m);
        proto = Object.getPrototypeOf(wv);
        stub("_wvSbReaders", () => []);
        stub("_wvSbWorkerBusy", () => false);
        stub("_wvSbIdleMs", () => idleMs);
        stub("_wvCbOn", () => true);
        stub("_wvCbPass", async () => {});
        stub("_wvRefsLibRecheck", () => {});
        wv._wvSbTuneO = { gap: 5, poll: 20, readerQuiet: 0, pressure: 0 };
        wv._wvSbMemo = { v: 1, failed: {} };
        if (!hasSDT()) return;
        // The article (2 pages) and the book (a long text PDF, newest: the run takes it first).
        ART = await importPDF("wv-sbp-art", textPDF(2, 40), "2026-02-01 10:00:00");
        // (400 pages of 60 lines took Zotero's worker 23 s on Zotero 11.0-beta.5: 150 are plenty.)
        BOOK = await importPDF("wv-sbp-book", textPDF(150, 60), "2026-02-02 10:00:00");
        ids = new Set([ART.id, BOOK.id]);
        await workerIdle();
    });

    after(async function () {
        openGate();
        try { delete Z()._query; } catch (e) {}
        try { delete Z().getStructuredDocumentText; } catch (e) {}
        try { Zotero.Prefs.set(PREF, false); Zotero.Prefs.set(PAUSE, false); } catch (e) {}
        await quiet();
        try { wv._wvSbWakeAll(); } catch (e) {}
        await runEnded();
        endOwn();
        wv._wvSbQuit = false;
        try { Zotero.Prefs.clear(PREF); Zotero.Prefs.clear(PAUSE); } catch (e) {}
        for (const s of stubs.slice()) unstub(s);
        delete wv._wvSbTuneO;
        await wvT.erase(...made.slice().reverse());
        wv._wvSbMemo = null; wv._wvSbMemoIsDirty = false;
        try { await IOUtils.remove(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "sdt-build.json"), { ignoreAbsent: true }); } catch (e) {}
        try { L.wvClearTimeout(wv._wvSbCbT); } catch (e) {}
        wv._wvSbCbT = null; wv._wvSbCbIds = null; wv._wvSbStO = null;
    });

    // ---- a reader's request never waits for the build -------------------------------------------

    it("a reader's own structure-data request is answered while a background job runs, on Zotero's worker, without waiting for it (stand-in answers: the book 2.5 s, the article 40 ms)", async function () {
        if (!hasSDT()) this.skip(); // version: a Zotero without Zotero.SDT (no structure data at all)
        await clearCaches();
        await workerIdle();
        const { StandIn } = standIn();
        stub("_wvSbWorkerClass", () => StandIn);
        Z()._query = function (a, d, t, o) { return fakeQuery(this, a, d, t, o); };
        bigMs = 2500; inQuery = [];
        try {
            let bgDone = 0;
            const bg = Promise.resolve(wv._wvSbEnsure(BOOK.id)).finally(() => { bgDone = Date.now(); });
            assert.ok(await wvT.waitFor(() => inQuery.some(r => r.big), 15000, 5), "the background job reached its Web Worker");
            const t0 = Date.now();
            await /** @type {any} */ (Zotero).SDT.getPack(ART.id, { isPriority: true });
            const ms = Date.now() - t0;
            const bgRec = inQuery.find(r => r.big), artRec = inQuery.find(r => !r.big);
            assert.ok(artRec, "the reader's request reached a Web Worker");
            assert.strictEqual(artRec.self, Z(), "the reader's request on Zotero's own worker");
            assert.notStrictEqual(bgRec.self, Z(), "the background job on another worker");
            assert.equal(bgDone, 0, "answered while the background job is still in progress (" + ms + " ms)");
            assert.isBelow(ms, 1200, "the reader did not wait for the 2.5-s job: " + ms + " ms");
            await bg;
        }
        finally {
            try { delete Z()._query; } catch (e) {}
            unstub("_wvSbWorkerClass");
            endOwn();
        }
    });

    it("a real build runs in Weavero's own Web Worker, never Zotero's; the pack is where Zotero reads it, and Zotero takes it as current", async function () {
        if (!hasSDT()) this.skip(); // version: a Zotero without Zotero.SDT
        await clearCaches();
        await workerIdle();
        let zCalls = 0;
        const zOrig = Z().getStructuredDocumentText;
        Z().getStructuredDocumentText = function (...a) { zCalls++; return zOrig.apply(this, a); };
        try {
            const ok = await wv._wvSbEnsure(ART.id);
            assert.strictEqual(ok, true, "built");
            assert.equal(zCalls, 0, "Zotero's own worker was never asked");
            const w = wv._wvSbW;
            assert.ok(w && w !== Z(), "Weavero's own instance of Zotero's worker class");
            assert.instanceOf(w, Object.getPrototypeOf(Z()).constructor);
            assert.ok(w._worker && w._worker !== Z()._worker, "its own Web Worker, not Zotero's");
            assert.equal(Object.prototype.toString.call(w._worker), "[object Worker]");
            assert.isTrue(await IOUtils.exists(cacheOf(ART)), "the pack in the storage folder (sdt.js _getCachePath)");
            assert.isFalse(await IOUtils.exists(cacheOf(ART) + ".wv.tmp"), "no temporary file left");
            // Zotero reads it as its own: current, no build again.
            assert.isTrue(await /** @type {any} */ (Zotero).SDT.ensure(ART.id), "Zotero.SDT.ensure: current");
            const pack = await /** @type {any} */ (Zotero).SDT.getPack(ART.id);
            assert.isTrue(pack.ok, "Zotero.SDT.getPack reads it");
            assert.equal(zCalls, 0, "and builds nothing again");
        }
        finally {
            try { delete Z().getStructuredDocumentText; } catch (e) {}
            endOwn();
        }
    });

    it("the reader's real request during a real background build of a long PDF ends first", async function () {
        if (!hasSDT()) this.skip(); // version: a Zotero without Zotero.SDT
        await clearCaches();
        await workerIdle();
        // The article's hash first, as for a PDF Zotero met before (the request's own cost only).
        await /** @type {any} */ (Zotero).SDT.getPack(ART.id, { isPriority: true });
        await IOUtils.remove(cacheOf(ART), { ignoreAbsent: true });
        let bgDone = 0;
        const t0 = Date.now();
        const bg = Promise.resolve(wv._wvSbEnsure(BOOK.id)).then((v) => { bgDone = Date.now(); return v; });
        const inWorker = (w) => !!(w && w._waitingPromises && Object.keys(w._waitingPromises).length);
        assert.ok(await wvT.waitFor(() => inWorker(wv._wvSbW) || inWorker(Z()), 30000, 5), "the book in a Web Worker");
        const t1 = Date.now();
        const r = await /** @type {any} */ (Zotero).SDT.getPack(ART.id, { isPriority: true });
        const t2 = Date.now();
        const ok = await bg;
        const msg = "the reader's request " + (t2 - t1) + " ms; the book " + (bgDone - t0) + " ms, its job " + (bgDone - t1) + " ms after the request";
        Zotero.debug("[WV-SBP] " + msg);
        assert.isTrue(!!(r && r.ok), "the reader got its pack");
        assert.strictEqual(ok, true, "the book built");
        assert.isAbove(bgDone, t2, "the reader's request ended before the background job: " + msg);
        endOwn();
    });

    // ---- only while the user is away ------------------------------------------------------------

    it("a PDF starts only once the user has been away a minute (stubbed idle time); activity stops the next start; the status line says so", async function () {
        if (!hasSDT()) this.skip(); // version: the fixture needs Zotero.SDT
        await clearCaches();
        assert.equal(wv._wvSbTune().idle, 60000, "the threshold: a minute (tunable)");
        const calls = [];
        stub("_wvSbEnsure", async (id) => {
            calls.push(id);
            if (gate) await gate.promise;
            await IOUtils.writeUTF8(cacheOf(made.find(a => a.id === id)), "stand-in structure data");
            return true;
        });
        fixtureOnly();
        try {
            idleMs = 1000;
            await setPrefs(true, false);
            shutGate();
            const run = wv._wvSbRun("spec idle");
            await wvT.sleep(300);
            assert.deepEqual(calls, [], "no start while the user is active");
            const st = wv._wvSbSt();
            assert.equal(st.state, "waiting");
            assert.equal(st.wait, "active");
            const s = wv._wvSbStatusL10n();
            assert.equal(s.id, "weavero-sdt-build-status-run");
            assert.equal(s.args.wait, "active");
            assert.include(strip(L.wvStr(s.id, Object.assign({}, s.args, { left: "1 minute" }), null)), "Waiting while you use the computer", "Settings' line");
            idleMs = 59000;
            await wvT.sleep(200);
            assert.deepEqual(calls, [], "not under the minute");
            idleMs = 61000;
            assert.ok(await wvT.waitFor(() => calls.length === 1, 5000, 5), "a minute away: the first PDF starts");
            assert.equal(calls[0], BOOK.id);
            // The user comes back while that PDF is in hand: it finishes, the next does not start.
            idleMs = 500;
            openGate();
            await wvT.sleep(300);
            assert.deepEqual(calls, [BOOK.id], "the next one waits");
            assert.equal(wv._wvSbSt().wait, "active");
            idleMs = 1e9;
            await run;
            assert.deepEqual(calls, [BOOK.id, ART.id]);
            assert.equal(wv._wvSbSt().state, "done");
        }
        finally {
            openGate();
            idleMs = 1e9;
            await setPrefs(false, false);
            await runEnded();
            unstub("_wvSbEnsure"); unstub("_wvSbList");
        }
    });

    it("without Zotero's worker class: Zotero.SDT.ensure as before, still behind the idle gate", async function () {
        if (!hasSDT()) this.skip(); // version: the fixture needs Zotero.SDT
        await clearCaches();
        // The feature test.
        const bads = [null, {}, Object.create(null), { constructor: function () {} }];
        bads.forEach((bad, i) => assert.isNull(wv._wvSbWorkerClass(bad), "no class in stand-in " + i));
        assert.isFunction(wv._wvSbWorkerClass(), "Zotero's own worker class");
        const ensured = [];
        stub("_wvSbWorkerClass", () => null);
        stub("_wvSbApi", () => ({ ensure: async (id) => {
            ensured.push(id);
            await IOUtils.writeUTF8(cacheOf(made.find(a => a.id === id)), "stand-in structure data");
            return true;
        } }));
        fixtureOnly();
        try {
            assert.strictEqual(await wv._wvSbEnsure(ART.id), true);
            assert.deepEqual(ensured, [ART.id], "Zotero.SDT.ensure built it");
            assert.isNotOk(wv._wvSbW, "no own worker made");
            await clearCaches();
            ensured.length = 0;
            idleMs = 1000;
            await setPrefs(true, false);
            const run = wv._wvSbRun("spec fallback");
            await wvT.sleep(300);
            assert.deepEqual(ensured, [], "the idle gate holds on this path too");
            assert.equal(wv._wvSbSt().wait, "active");
            idleMs = 1e9;
            await run;
            assert.deepEqual(ensured, [BOOK.id, ART.id]);
        }
        finally {
            idleMs = 1e9;
            await setPrefs(false, false);
            await runEnded();
            unstub("_wvSbWorkerClass"); unstub("_wvSbApi"); unstub("_wvSbList");
        }
    });

    // ---- the own worker's life ------------------------------------------------------------------

    it("a real job in hand is settled at once when Weavero's worker ends; the dropped worker's own queue ends too; nothing is written", async function () {
        if (!hasSDT()) this.skip(); // version: a Zotero without Zotero.SDT
        await clearCaches();
        await workerIdle();
        const bg = wv._wvSbEnsure(BOOK.id);
        assert.ok(await wvT.waitFor(() => wv._wvSbW && Object.keys(wv._wvSbW._waitingPromises || {}).length > 0, 30000, 5), "the book in Weavero's Web Worker");
        const w = wv._wvSbW, ww = w._worker;
        let terms = 0;
        const realTerminate = ww.terminate;
        ww.terminate = function () { terms++; return realTerminate.call(ww); };
        const t0 = Date.now();
        wv._wvSbWorkerEnd("spec");
        const out = await bg;
        const ms = Date.now() - t0;
        assert.equal(out, "cancelled", "left for later, not a failure");
        assert.isBelow(ms, 500, "settled at once: " + ms + " ms");
        assert.equal(terms, 1, "its Web Worker terminated");
        assert.isNotOk(wv._wvSbW, "the instance dropped");
        assert.deepEqual(Object.keys(w._waitingPromises), [], "no request left waiting");
        assert.ok(await wvT.waitFor(() => w._processingQueue === false, 5000, 10), "the dropped instance's own queue ended (nothing hangs)");
        assert.deepEqual(w._queue, []);
        await wvT.sleep(200);
        assert.isFalse(await IOUtils.exists(cacheOf(BOOK)), "nothing written for it");
    });

    it("Weavero's worker ends when the run ends, at Pause with a PDF in hand, after a long wait, at a wait for memory, at quit and in destroy(); the PDF in hand is never counted as failed", async function () {
        if (!hasSDT()) this.skip(); // version: the fixture needs Zotero.SDT
        const { StandIn, m } = standIn();
        stub("_wvSbWorkerClass", () => StandIn);
        fixtureOnly();
        bigMs = 30; inQuery = [];
        try {
            // The run's end.
            await clearCaches();
            wv._wvSbMemo = { v: 1, failed: {} };
            await setPrefs(true, false);
            await wv._wvSbRun("spec end");
            assert.equal(wv._wvSbSt().state, "done");
            assert.equal(wv._wvSbSt().built, 2, "both built in the stand-in worker");
            assert.equal(m.n, 1, "one instance for the run");
            assert.equal(m.terminated, 1, "terminated at the run's end");
            assert.isNotOk(wv._wvSbW);

            // Pause with the book in hand: the job left for later, the run stopped, the worker gone.
            const midJob = async (why, act) => {
                await clearCaches();
                wv._wvSbMemo = { v: 1, failed: {} };
                inQuery = [];
                shutGate();
                await setPrefs(true, false);
                const t0 = m.terminated;
                const run = wv._wvSbRun("spec " + why);
                assert.ok(await wvT.waitFor(() => inQuery.some(r => r.big), 10000, 5), why + ": the book in hand");
                await act();
                assert.ok(await runEnded(3000), why + ": the run stopped without waiting for the PDF in hand");
                await run;
                assert.equal(m.terminated, t0 + 1, why + ": the worker terminated");
                assert.isNotOk(wv._wvSbW, why + ": dropped");
                assert.equal(wv._wvSbSt().state, "stopped");
                assert.isUndefined(wv._wvSbMemo.failed[memoKey(BOOK)], why + ": not counted as failed");
                openGate();
                await wvT.sleep(100);
                assert.isFalse(await IOUtils.exists(cacheOf(BOOK)), why + ": nothing written for it");
            };
            await midJob("pause", async () => { Zotero.Prefs.set(PAUSE, true); });
            await setPrefs(false, false);
            await midJob("quit", async () => { wv._wvSbObs.observe(null, "quit-application-granted"); });
            wv._wvSbQuit = false;
            await midJob("destroy", async () => { wv._wvSbDestroy(); });
            // destroy() unwired the run's watchers: wired again for the rest of the suite.
            wv._wvSbWirePrefWatch();
            wv._wvSbWireObs();
            assert.ok(wv._wvSbObs, "observers wired again");
            await setPrefs(false, false);

            // A wait longer than `keep`: the worker ends while the run waits, a new one later.
            await clearCaches();
            wv._wvSbMemo = { v: 1, failed: {} };
            wv._wvSbTuneO = { gap: 5, poll: 20, readerQuiet: 0, pressure: 0, keep: 150 };
            inQuery = [];
            idleMs = 1e9;
            onBig = () => { idleMs = 1000; }; // the user comes back during the first PDF
            await setPrefs(true, false);
            const n0 = m.n, t0 = m.terminated;
            const run = wv._wvSbRun("spec long wait");
            assert.ok(await wvT.waitFor(() => m.terminated === t0 + 1, 5000, 5), "terminated during the wait");
            assert.isTrue(!!wv._wvSbRunning, "the run still waits");
            assert.equal(wv._wvSbSt().wait, "active");
            assert.isNotOk(wv._wvSbW);
            onBig = null;
            idleMs = 1e9;
            await run;
            assert.equal(wv._wvSbSt().state, "done");
            assert.equal(m.n, n0 + 2, "a new worker for the next PDF");
            assert.equal(m.terminated, t0 + 2, "and terminated at the end");

            // Memory low after the first PDF: the worker ends at the wait's first turn, not `keep` later.
            await clearCaches();
            wv._wvSbMemo = { v: 1, failed: {} };
            wv._wvSbTuneO = { gap: 5, poll: 20, readerQuiet: 0, pressure: 600, keep: 60000 };
            inQuery = [];
            onBig = () => { wv._wvSbPressureAt = Date.now(); }; // as the memory-pressure observer records it
            await setPrefs(true, false);
            const n1 = m.n, t1 = m.terminated;
            const runM = wv._wvSbRun("spec memory");
            assert.ok(await wvT.waitFor(() => m.terminated === t1 + 1 && wv._wvSbSt().wait === "memory", 3000, 5), "terminated as the run waits for memory");
            assert.isTrue(!!wv._wvSbRunning, "the run still waits");
            onBig = null;
            await runM;
            assert.equal(wv._wvSbSt().state, "done");
            assert.equal(m.n, n1 + 2, "a new worker once memory is back");
            wv._wvSbPressureAt = 0;
        }
        finally {
            openGate();
            onBig = null;
            idleMs = 1e9;
            wv._wvSbTuneO = { gap: 5, poll: 20, readerQuiet: 0, pressure: 0 };
            wv._wvSbQuit = false;
            wv._wvSbPressureAt = 0;
            await setPrefs(false, false);
            await runEnded();
            endOwn();
            unstub("_wvSbWorkerClass"); unstub("_wvSbList");
        }
    });

    // ---- what the user is told ------------------------------------------------------------------

    it("the warning and Settings' description say the build runs only while you are away and that what you open never waits for it; the time figures stay", function () {
        const est = { pdfs: 18680, bytes: 60110943384, pages: 574839, secMid: 28212, secLo: 22570, secHi: 42318, diskMid: 2839765076, diskLo: 2413800315, diskHi: 3549706345 };
        const body = strip(wv._wvSbWarningText(est).body);
        assert.include(body, "about 6.5–12 hours of background work", "the work-time figures");
        assert.include(body, "only while you are not using the computer");
        assert.include(body, "spread over those times");
        assert.include(body, "What you open in Zotero never waits for it.");
        const desc = strip(L.wvStr("weavero-pref-relations-references-sdt-build-desc", null, null));
        assert.include(desc, "only while you are not using the computer");
        assert.include(desc, "what you open never waits for it");
    });
});
