/* global describe, it, before, after, assert, Zotero, wvT, IOUtils, PathUtils */

// The filter's PERSISTENT trace (2026-11-22): MJT's two filter freezes ended
// in a kill, and every in-memory trace died with the process. The bugfix
// skill: "intermittent + user-reported = bake a persistent ring buffer into
// the build at FIRST report". Locked here, each FAILING on
// 1.2.1-citations.29 (no such trace):
//  - a user gesture's apply is ON DISK while the apply is still running and
//    the main thread is blocked (the write is dispatched before the apply;
//    IOUtils does the I/O on its own thread);
//  - the previous session's file is kept (filter-trace.prev.json);
//  - the ring is bounded; repeats of one event fold into one record;
//  - `extensions.zotero.weavero.filterTrace` = false turns it off.
describe("Weavero — the filter's persistent trace (filter-trace.json)", function () {
    this.timeout(60000);
    let wv, lib, path;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    /** The file's text read SYNCHRONOUSLY (works while the thread is blocked). */
    const readSync = (p) => {
        try {
            const f = Zotero.File.pathToFile(p);
            return f.exists() ? Zotero.File.getContents(f) : "";
        } catch (e) { return ""; }
    };
    const records = async () => {
        try { return JSON.parse(await IOUtils.readUTF8(path)).records || []; } catch (e) { return []; }
    };
    /** Poll an ASYNC predicate (wvT.waitFor does not await its callback). */
    const until = async (fn, ms) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = await fn(); if (v) return v; } catch (e) {}
            await sleep(50);
        }
        return null;
    };

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!lib || typeof lib.wvTraceFilePush !== "function") wvT.absent("lib.wvTraceFilePush (lib/trace-file.ts)");
        path = lib.wvTraceFilePath("filter-trace");
        Zotero.Prefs.clear("weavero.filterTrace");
        // Make the file exist (the first push prepares the directory).
        lib.wvTraceFilePush("filter-trace", { t: "spec", ev: "spec-start" }, { urgent: true });
        assert.isOk(await until(async () => (await IOUtils.exists(path)) || null, 5000), "the trace file appears");
    });

    after(async function () {
        Zotero.Prefs.clear("weavero.filterTrace");
        try { wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 }; wv._applyItemsListFilter({ deliberate: true }); } catch (e) {}
        await sleep(400);
    });

    it("a gesture's apply is on disk while it still runs on a blocked main thread", async function () {
        await sleep(1200);   // past the trace's pref cache
        const marker = "wvTraceMarker" + Date.now();
        const g = wv._emptyFilterGroup();
        g.itemType = [marker];   // an enumerated dimension: recorded by value
        let seenAtMs = -1, blockedMs = 0;
        const own = Object.prototype.hasOwnProperty.call(wv, "_applyItemsListFilterInner");
        const orig = wv._applyItemsListFilterInner;
        wv._applyItemsListFilterInner = function () {
            // Block the main thread for 1.5 s, as MJT's freeze did, and watch
            // the file the whole time.
            const t0 = Date.now();
            while (Date.now() - t0 < 1500) {
                if (seenAtMs < 0 && readSync(path).includes(marker)) seenAtMs = Date.now() - t0;
                const t1 = Date.now(); while (Date.now() - t1 < 20) { /* spin */ }
            }
            blockedMs = Date.now() - t0;
            return orig.apply(this, arguments);
        };
        try {
            wv._filterState = { groups: [g], activeGroupIndex: 0 };
            wv._applyItemsListFilter({ cascade: true, deliberate: true });
        }
        finally { if (own) wv._applyItemsListFilterInner = orig; else delete wv._applyItemsListFilterInner; }
        assert.isAtLeast(seenAtMs, 0, "the apply's record reached the disk while the thread was blocked (" + blockedMs + " ms)");
        assert.isBelow(seenAtMs, 1000, "within a second of the block's start");
        await sleep(2500);
        const recs = await records();
        const begin = recs.find(r => r.ev === "apply" && String(r.state || "").includes(marker));
        assert.isOk(begin, "the begin record names the state");
        assert.strictEqual(begin.src, "gesture");
        const end = recs.find(r => r.ev === "apply-end" && r.src === "gesture" && r.ms >= 1450);
        assert.isOk(end, "the end record carries the blocked duration: " + JSON.stringify(recs.slice(-4)));
    });

    it("free-text values are counted, never written", function () {
        const g = wv._emptyFilterGroup();
        g.annotationTag = ["wvSecretTagName"];
        wv._filterState = { groups: [g], activeGroupIndex: 0 };
        wv._applyItemsListFilter({ cascade: true, deliberate: true });
        const recs = lib.wvTraceFileRecords("filter-trace");
        const last = recs.filter(r => r.ev === "apply").pop();
        assert.include(String(last && last.state), "annotationTag#1");
        assert.notInclude(JSON.stringify(recs), "wvSecretTagName");
    });

    it("bounded, and repeats of one event fold into one record", async function () {
        const n0 = lib.wvTraceFileRecords("filter-trace").length;
        for (let i = 0; i < 50; i++) lib.wvTraceFilePush("filter-trace", { t: "x", ev: "spec-burst" }, { coalesceMs: 2000, max: 300 });
        const recs = lib.wvTraceFileRecords("filter-trace");
        const burst = recs.filter(r => r.ev === "spec-burst");
        assert.strictEqual(burst.length, 1, "one record for the burst");
        assert.strictEqual(burst[0].rep, 50);
        assert.isAtMost(recs.length, Math.max(n0 + 1, 300));
        for (let i = 0; i < 400; i++) lib.wvTraceFilePush("filter-trace", { t: "x", ev: "spec-fill" + (i % 2) }, { max: 300 });
        assert.strictEqual(lib.wvTraceFileRecords("filter-trace").length, 300, "never more than 300 records");
    });

    it("the previous session's file is kept as filter-trace.prev.json", async function () {
        const prev = PathUtils.join(PathUtils.parent(path), "filter-trace.prev.json");
        try { await IOUtils.remove(prev); } catch (e) {}
        await sleep(2500);   // the last write landed
        const before = await IOUtils.readUTF8(path);
        // A new session: the state on the Zotero global starts afresh.
        const Z = /** @type {any} */ (Zotero);
        const saved = Z._wvTraceFiles["filter-trace"];
        delete Z._wvTraceFiles["filter-trace"];
        try {
            lib.wvTraceFilePush("filter-trace", { t: "x", ev: "spec-new-session" }, { urgent: true });
            assert.isOk(await until(async () => (await IOUtils.exists(prev)) || null, 5000), "the old file moved aside");
            assert.strictEqual(await IOUtils.readUTF8(prev), before, "with its records intact");
            assert.isOk(await until(async () => ((await records()).some(r => r.ev === "spec-new-session") ? true : null), 5000), "the new session's file holds its own records");
            assert.notOk((await records()).some(r => r.ev === "spec-burst"), "and not the old session's");
        }
        finally { Z._wvTraceFiles["filter-trace"] = Object.assign(Z._wvTraceFiles["filter-trace"] || {}, { ring: saved.ring }); }
    });

    it("off with extensions.zotero.weavero.filterTrace = false", async function () {
        Zotero.Prefs.set("weavero.filterTrace", false);
        await sleep(1200);   // past the trace's pref cache
        const n0 = lib.wvTraceFileRecords("filter-trace").length;
        const g = wv._emptyFilterGroup();
        g.itemType = ["book"];
        wv._filterState = { groups: [g], activeGroupIndex: 0 };
        wv._applyItemsListFilter({ cascade: true, deliberate: true });
        assert.strictEqual(lib.wvTraceFileRecords("filter-trace").length, n0, "no record while off");
        Zotero.Prefs.clear("weavero.filterTrace");
    });
});
