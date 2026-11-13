/* global describe, it, before, after, assert, Zotero, wvT, Components, Services */
// A reader or a window opened and closed is freed (main's full suite on Zotero
// 10.0.8, 2026-11-12: the test Zotero died at ~4.5 GB, memory climbing with
// every reader- and window-opening spec; it used to peak near 2-3 GB). Every
// closed reader tab stayed: its reader.html and pdf.js viewer.html windows,
// detached, never freed. GC and CC logs gave the one path to each: lib/listen's
// registry -> a WeakRef -> the reader's document. Gecko's cycle collector
// follows a WeakRef to its target like a strong edge, so the "weak" registry
// kept every window it had wired. Counted here the way about:memory counts
// them: detached windows still alive after collection, per URL.
describe("Weavero — a closed reader or window is not kept alive", function () {
    this.timeout(300000);
    let win, ZT, pdf, lib;
    const Cu = Components.utils;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    async function collect() {
        for (let i = 0; i < 6; i++) {
            Cu.forceGC(); Cu.forceCC();
            try { Cu.forceShrinkingGC(); } catch (e) {}
            await sleep(250);
        }
    }
    async function settle() { await sleep(1500); await collect(); await sleep(2500); await collect(); }
    /** Detached windows still alive, from the memory reports: a count per URL
     *  (one dom/element-nodes report per window). */
    async function detached() {
        const mm = Components.classes["@mozilla.org/memory-reporter-manager;1"].getService(Components.interfaces.nsIMemoryReporterManager);
        const n = {};
        await new Promise((resolve) => {
            mm.getReports((process, path) => {
                if (process) return;   // the parent's own
                if (!/^explicit\/window-objects\/.*detached\/window\(/.test(path) || !/\/dom\/element-nodes$/.test(path)) return;
                const m = /detached\/window\(([^)]*)\)/.exec(path);
                const k = m ? m[1].replace(/.*[\\/]/, "") : "?";
                n[k] = (n[k] || 0) + 1;
            }, null, () => resolve(true), null, false);
        });
        return n;
    }
    /** On a failure: Gecko's GC and CC logs, for D:/tmp/wv-scripts/ccroots.py
     *  (which root keeps the window). The paths go into the message; the
     *  failure seen once in three full runs on 10.0.8 (2026-11-13, one of four
     *  closed readers kept) passes alone, so only the failing run can tell. */
    async function dumpLogs(tag) {
        const files = [];
        try {
            await new Promise((resolve) => {
                const dumper = Components.classes["@mozilla.org/memory-info-dumper;1"].getService(Components.interfaces.nsIMemoryInfoDumper);
                dumper.dumpGCAndCCLogsToFile(tag, true, false, {
                    onDump(gcLog, ccLog) { files.push(gcLog.path + " ; " + ccLog.path); },
                    onFinish() { resolve(true); },
                });
            });
        }
        catch (e) { files.push("dump failed: " + e); }
        return " logs " + files.join(" | ");
    }
    const count = (d, re) => Object.keys(d).filter(k => re.test(k)).reduce((a, k) => a + d[k], 0);
    const widOf = (w) => { try { return Number(Cu.unwaiveXrays(w).windowGlobalChild.innerWindowId); } catch (e) { return 0; } };
    const same = (a, b) => { try { return a === b || Cu.unwaiveXrays(a) === Cu.unwaiveXrays(b); } catch (e) { return a === b; } };
    /** Which of the plugin's own properties, and Zotero's `_wv*` ones, still
     *  hold one of `objs` -- directly, or one level into a Map, Set, Array or
     *  plain object. */
    function heldBy(objs) {
        const out = [];
        const hit = (v) => (v && (typeof v === "object" || typeof v === "function")) ? objs.some(o => same(o, v)) : false;
        const look = (name, v) => {
            try {
                if (hit(v)) { out.push(name); return; }
                // Duck-typed: the plugin's Maps and Sets are another scope's
                // (instanceof fails across scopes); WeakMaps and WeakSets
                // cannot be listed, and cannot keep a closed reader either.
                const tag = Object.prototype.toString.call(v);
                if (tag === "[object Map]") {
                    for (const [k, x] of v) if (hit(k) || hit(x)) { out.push(name + " (Map)"); return; }
                }
                else if (tag === "[object Set]") { for (const x of v) if (hit(x)) { out.push(name + " (Set)"); return; } }
                else if (Array.isArray(v)) { for (const x of v) if (hit(x)) { out.push(name + " (Array)"); return; } }
                else if (tag === "[object Object]") {
                    for (const x of Object.values(v)) if (hit(x)) { out.push(name + " (Object)"); return; }
                }
            }
            catch (e) {}
        };
        const wv = wvT.plugin();
        for (const k of Object.keys(wv)) { let v; try { v = wv[k]; } catch (e) { continue; } look("plugin." + k, v); }
        for (const k of Object.keys(Zotero).filter(x => x.startsWith("_wv"))) { let v; try { v = Zotero[k]; } catch (e) { continue; } look("Zotero." + k, v); }
        return out;
    }
    /** Open `pdf` in a tab, wait until Weavero has wired it, close it; only
     *  numbers and names come back (nothing that holds the reader). */
    async function tabCycle() {
        let r = /** @type {any} */ (await Zotero.Reader.open(pdf.id, null, { allowDuplicate: true }));
        await waitFor(() => r && r._iframeWindow && r._iframeWindow.document.querySelector(".toolbar")
            && r._internalReader && r._internalReader._primaryView && r._internalReader._primaryView._iframeWindow, 20000, "the reader");
        await sleep(1500);
        const pv = r._internalReader._primaryView;
        const objs = [r, r._iframe, r._iframeWindow, r._iframeWindow.document, r._internalReader, pv, pv._iframeWindow];
        const wids = [widOf(r._iframeWindow), widOf(pv._iframeWindow)];
        const id = r.tabID;
        ZT.close(id);
        await waitFor(() => !ZT._tabs.some(t => t.id === id), 5000, "the tab to close");
        await sleep(500);
        const held = heldBy(objs);
        objs.length = 0;
        r = null;
        return { wids, held };
    }

    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        lib = wvT.lib();
        win = Zotero.getMainWindow(); ZT = win.Zotero_Tabs;
        pdf = await wvT.createTestPDFItem("wv-leak");
    });

    after(async function () {
        await wvT.erase(pdf);
    });

    it("four reader tabs opened and closed: none stays (no detached reader window, nothing of it in Weavero)", async function () {
        await settle();
        const d0 = await detached();
        const wids = [], held = [];
        for (let i = 0; i < 4; i++) {
            const c = await tabCycle();
            wids.push(...c.wids);
            held.push(...c.held);
        }
        await settle();
        const d1 = await detached();
        const reg = lib && lib.wvListenRegistry ? lib.wvListenRegistry() : { wids: [], hooked: [] };
        const kept = wids.filter(w => w && (reg.wids.includes(w) || reg.hooked.includes(w)));
        const grow = count(d1, /reader\.html|viewer\.html/) - count(d0, /reader\.html|viewer\.html/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1)
            + "; listen registry still names " + kept.length + " closed window(s); held by " + JSON.stringify([...new Set(held)]);
        Zotero.debug("[Weavero] reader-leak tabs: " + msg);
        assert.deepEqual([...new Set(held)], [], "Weavero's own maps keep a closed reader: " + msg);
        assert.deepEqual(kept, [], "the listen registry keeps a closed reader's windows: " + msg);
        assert.isAtMost(grow, 0, "closed readers stay alive (detached): " + msg + (grow > 0 ? await dumpLogs("wvleaktabs") : ""));
    });

    it("three reader windows opened and closed (a Zotero with reader windows): none stays", async function () {
        // Zotero with its own windows: a reader opens as a main window there
        // (zotero#6035; NATIVE_RETIRED in 000-helpers).
        if (wvT.nativeWindows()) this.skip();
        await settle();
        const d0 = await detached();
        const wids = [];
        for (let i = 0; i < 3; i++) {
            let r = /** @type {any} */ (await Zotero.Reader.open(pdf.id, null, { openInWindow: true, allowDuplicate: true }));
            await waitFor(() => r && r._window && r._iframeWindow && r._iframeWindow.document.querySelector(".toolbar"), 20000, "the reader window");
            await sleep(1500);
            let w = r._window;
            wids.push(widOf(w), widOf(r._iframeWindow));
            // As the window's close button does (reader.xhtml onclose): a bare
            // window.close() skips Zotero's uninit, and its prefs observers keep it.
            r.close();
            r = null;
            await waitFor(() => w.closed, 5000, "the reader window to close");
            w = null;
            await sleep(500);
        }
        await settle();
        const d1 = await detached();
        const reg = lib && lib.wvListenRegistry ? lib.wvListenRegistry() : { wids: [], hooked: [] };
        const kept = wids.filter(x => x && (reg.wids.includes(x) || reg.hooked.includes(x)));
        const grow = count(d1, /reader\.xhtml|reader\.html|viewer\.html/) - count(d0, /reader\.xhtml|reader\.html|viewer\.html/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; listen registry still names " + kept.length + " closed window(s)";
        Zotero.debug("[Weavero] reader-leak windows: " + msg);
        assert.deepEqual(kept, [], "the listen registry keeps a closed reader window: " + msg);
        assert.isAtMost(grow, 0, "closed reader windows stay alive (detached): " + msg);
    });

    it("two further main windows opened and closed: neither stays", async function () {
        await settle();
        const d0 = await detached();
        const wids = [];
        for (let i = 0; i < 2; i++) {
            let B = await wvT.openMainWindow();
            assert.isOk(B, "a second main window");
            await sleep(1500);
            wids.push(widOf(B));
            B._wvSavedParkClose = true;
            B.close();
            await waitFor(() => B.closed && Zotero.getMainWindows().length === 1, 10000, "the second main window to close");
            B = null;
            await sleep(500);
            // Zotero with its own windows keeps a closed window's state -- an
            // object of the window's own scope -- for Reopen Closed Window
            // (Zotero.Session.addClosedWindow), which keeps the window. That
            // one is Zotero's: taken back out, so what stays is Weavero's.
            try {
                const S = /** @type {any} */ (Zotero).Session;
                const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
                if (last && last.window) S.takeLastClosed();
            }
            catch (e) {}
        }
        await settle();
        const d1 = await detached();
        const reg = lib && lib.wvListenRegistry ? lib.wvListenRegistry() : { wids: [], hooked: [] };
        const kept = wids.filter(x => x && (reg.wids.includes(x) || reg.hooked.includes(x)));
        const grow = count(d1, /zoteroPane\.xhtml/) - count(d0, /zoteroPane\.xhtml/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; listen registry still names " + kept.length + " closed window(s)";
        Zotero.debug("[Weavero] reader-leak main windows: " + msg);
        assert.deepEqual(kept, [], "the listen registry keeps a closed main window: " + msg);
        // With a zotero-plugin-toolkit plugin running (Better Notes and others,
        // the companion run), the toolkit's shared global keeps closed main
        // windows itself: GC log 2026-11-13, Zotero._toolkitGlobal.currentWindow
        // -> the closed window, 74 detached before this case began. Not
        // Weavero's to free, and not countable there: Weavero's own registry
        // is still checked above, and the count is checked in the core run.
        if (/** @type {any} */ (Zotero)._toolkitGlobal) return;
        assert.isAtMost(grow, 0, "closed main windows stay alive (detached): " + msg);
    });
});
