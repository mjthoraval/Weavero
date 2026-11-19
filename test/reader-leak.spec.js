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

    // Weavero closes reader windows itself: its own title-bar close button on
    // a compact reader window (Windows), a deck window, a session switch, a
    // disable -- each by `win.close()`. A script close fires no `close` event,
    // so Zotero's `onclose="reader.close()"` never ran: no uninit, and the
    // reader's BlockingObserver ("http-on-modify-request", reader.js) stayed
    // registered with the reader in its closure. Every reader window so
    // closed stayed, with its PDF (full Zotero 10 run 2026-11-13: 16 of them
    // at the end, GC/CC path observer -> shouldBlock -> the reader -> _window).
    it("reader windows closed the way Weavero closes them (window.close()): none stays", async function () {
        if (wvT.nativeWindows()) this.skip();   // version: needs a Zotero with reader windows
        await settle();
        const d0 = await detached();
        for (let i = 0; i < 2; i++) {
            let r = /** @type {any} */ (await Zotero.Reader.open(pdf.id, null, { openInWindow: true, allowDuplicate: true }));
            await waitFor(() => r && r._window && r._iframeWindow && r._iframeWindow.document.querySelector(".toolbar"), 20000, "the reader window");
            await sleep(1500);
            let w = r._window;
            r = null;
            w.close();
            await waitFor(() => w.closed, 5000, "the reader window to close");
            w = null;
            await sleep(500);
        }
        await settle();
        const d1 = await detached();
        const grow = count(d1, /reader\.xhtml|reader\.html|viewer\.html/) - count(d0, /reader\.xhtml|reader\.html|viewer\.html/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1);
        Zotero.debug("[Weavero] reader-leak reader windows by window.close(): " + msg);
        assert.isAtMost(grow, 0, "reader windows closed by window.close() stay alive (detached): " + msg);
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

    // Zotero 10.0.8's ZoteroPane.destroy() (zoteroPane.js, the window's unload)
    // removes `_reloadObserver` from "zotero-reloaded" and then destroys the
    // context pane and the tabs, records the last pane's state for the session
    // and closes every tab. Weavero's release of what a closed window leaves in
    // Zotero (lib/ui-roots.ts, WV-TEMP-UIROOTS) removed that observer FIRST --
    // Zotero tells plugins of a main window's close (its window-mediator
    // listener) before the window's unload -- so Zotero's removeObserver threw
    // NS_ERROR_ILLEGAL_VALUE and the rest of destroy() never ran, at every
    // close of a main window, the last one at quit included (leak probe
    // 2026-11-13: the error, zoteroPane.js line 790, at each close).
    it("a main window's close lets Zotero's own teardown run to the end, and the window's observers still go", async function () {
        const observersOn = (topic) => { const out = [], en = Services.obs.enumerateObservers(topic); while (en.hasMoreElements()) out.push(en.getNext()); return out; };
        // Every console message from the close on (Zotero's own error buffer
        // dedups nothing but keeps 25, and an earlier close reads alike).
        const seen = [];
        const listener = { observe(m) { try { seen.push(String(m && (m.message || m.errorMessage) || m) + " @" + String(m && m.sourceName || "") + " " + String(m && m.stack || "")); } catch (e) {} } };
        // Counted per topic (what enumerateObservers hands back of a closed
        // window's observer cannot be compared reliably).
        const TOPICS = ["zotero-reloaded", "zotero-before-reload", "addon-install-started"];
        const counts = () => TOPICS.map(t => observersOn(t).length);
        const c0 = counts();
        let B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await waitFor(() => B.ZoteroPane && B.ZoteroPane.itemsView && B.ZoteroPane.collectionsView, 20000, "the window's views");
        await sleep(2500);
        // The observers Weavero claimed for this window (lib/ui-roots.ts).
        await waitFor(() => B._wvObsReload && B._wvObsXpi, 6000, "the window's observer claims");
        const cOpen = counts();
        Services.console.registerListener(listener);
        try {
            B._wvSavedParkClose = true;
            B.close();
            await waitFor(() => B.closed && Zotero.getMainWindows().length === 1, 10000, "the second main window to close");
            B = null;
            try {
                const S = /** @type {any} */ (Zotero).Session;
                const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
                if (last && last.window) S.takeLastClosed();
            }
            catch (e) {}
            await sleep(3500);
        }
        finally { Services.console.unregisterListener(listener); }
        const fresh = seen.filter(x => /zoteroPane\.js/.test(x) && /destroy|removeObserver/.test(x));
        assert.deepEqual(fresh.map(x => x.slice(0, 240)), [], "Zotero's own teardown of the closed window threw");
        assert.deepEqual(counts(), c0, "the closed window's observers are still registered (per topic " + JSON.stringify(TOPICS)
            + ": before " + JSON.stringify(c0) + ", open " + JSON.stringify(cOpen) + ")");
    });

    /** The plugin's own properties (and Zotero's `_wv*`) that hold a closed
     *  window or a node of one -- directly or two levels into Maps, Sets,
     *  Arrays and plain objects. */
    function closedWindowHolders() {
        const out = [];
        const closedWin = (v) => {
            try {
                if (!v || (typeof v !== "object" && typeof v !== "function")) return false;
                if (Cu.isDeadWrapper(v)) return true;
                if (typeof v.closed === "boolean" && "document" in v && v.closed) return true;
                return !!(v.nodeType && v.ownerDocument && !v.ownerDocument.defaultView);
            }
            catch (e) { return false; }
        };
        const kids = (v) => {
            try {
                const tag = Object.prototype.toString.call(v);
                if (tag === "[object Map]") return [...v.keys(), ...v.values()];
                if (tag === "[object Set]" || Array.isArray(v)) return [...v];
                if (tag === "[object Object]") return Object.values(v);
            }
            catch (e) {}
            return [];
        };
        const look = (name, v) => {
            if (closedWin(v)) { out.push(name); return; }
            for (const x of kids(v)) {
                if (closedWin(x)) { out.push(name + " (in)"); return; }
                for (const y of kids(x)) if (closedWin(y)) { out.push(name + " (in, in)"); return; }
            }
        };
        const wv = wvT.plugin();
        for (const k of Object.keys(wv)) { let v; try { v = wv[k]; } catch (e) { continue; } look("plugin." + k, v); }
        for (const k of Object.keys(Zotero).filter(x => x.startsWith("_wv"))) { let v; try { v = Zotero[k]; } catch (e) { continue; } look("Zotero." + k, v); }
        return out;
    }

    // On a Zotero with its own windows a note opened in a window of its own is
    // a main window without a library view, and Zotero tells plugins neither
    // of its load nor of its close (xpcom/plugins.js: only windows that loaded
    // a library view). Weavero wires it all the same, and its teardown never
    // ran: every such window stayed after it closed, kept through the plugin's
    // items- and collections-menu handler lists (leak probe 2026-11-13,
    // 11.0-beta.4: five note windows, five kept).
    it("notes opened in windows of their own (a Zotero with its own windows) and closed: none stays", async function () {
        if (!wvT.nativeWindows()) this.skip();   // version: needs a Zotero with its own windows
        const note = new Zotero.Item("note");
        note.setNote("<p>reader-leak note window</p>");
        await note.saveTx();
        try {
            await settle();
            const d0 = await detached();
            const holders = [];
            for (let i = 0; i < 2; i++) {
                const n0 = Zotero.getMainWindows().length;
                await Zotero.Notes.open(note.id, null, { openInWindow: true });
                let w = await waitFor(() => Zotero.getMainWindows().find(x => x !== win && !x.ZoteroPane.libraryView && x.document.querySelector("note-editor")), 15000, "the note window");
                // Weavero has wired it (window-state.ts: the wiring table for a window without a library view).
                await waitFor(() => w._wvWireRoot || Object.keys(w).some(k => k.startsWith("_wv")), 8000, "Weavero's wiring of the note window");
                await sleep(2000);
                w.close();
                await waitFor(() => Zotero.getMainWindows().length <= n0, 10000, "the note window to close");
                w = null;
                await sleep(500);
                try {
                    const S = /** @type {any} */ (Zotero).Session;
                    const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
                    if (last && last.window) S.takeLastClosed();
                }
                catch (e) {}
                holders.push(...closedWindowHolders());
            }
            await settle();
            const d1 = await detached();
            const grow = count(d1, /zoteroPane\.xhtml/) - count(d0, /zoteroPane\.xhtml/);
            const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; plugin fields holding a closed window: " + JSON.stringify([...new Set(holders)]);
            Zotero.debug("[Weavero] reader-leak note windows: " + msg);
            assert.deepEqual([...new Set(holders)], [], "a plugin field keeps a closed note window: " + msg);
            if (/** @type {any} */ (Zotero)._toolkitGlobal) return;   // the toolkit's own hold (see above)
            assert.isAtMost(grow, 0, "closed note windows stay alive (detached): " + msg);
        }
        finally { await wvT.erase(note); }
    });

    // The background-restore guard (Zotero 9/10, Windows: a restart's windows
    // come back behind the one the user is in) records the window the user
    // picks while it runs -- a click, an Alt+Tab, a window they open -- in
    // `_wvBgUserChosenWin`, and nothing took it back: once that window
    // closed, the plugin kept it, its item pane and items tree for the rest
    // of the session (leak probe 2026-11-13, Zotero 10.0.8: GC path plugin ->
    // _wvBgUserChosenWin -> the closed window, two windows' worth of detached
    // DOM after a tab moved there and back). Set here as the guard's claim
    // sets it; the window's close must let it go.
    it("a closed window the background-restore guard took as the user's choice is not kept", async function () {
        const wv = wvT.plugin();
        await settle();
        const d0 = await detached();
        let B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await sleep(1500);
        wv._wvBgUserChosenWin = B;   // what the guard's claim does (modules/tabs.ts _wvBgRestoreStart)
        B._wvSavedParkClose = true;
        B.close();
        await waitFor(() => B.closed && Zotero.getMainWindows().length === 1, 10000, "the second main window to close");
        B = null;
        await sleep(500);
        try {
            const S = /** @type {any} */ (Zotero).Session;
            const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
            if (last && last.window) S.takeLastClosed();
        }
        catch (e) {}
        const holders = closedWindowHolders();
        await settle();
        const d1 = await detached();
        const grow = count(d1, /zoteroPane\.xhtml/) - count(d0, /zoteroPane\.xhtml/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; plugin fields holding a closed window: " + JSON.stringify(holders);
        assert.deepEqual(holders, [], "a plugin field keeps the closed window: " + msg);
        if (/** @type {any} */ (Zotero)._toolkitGlobal) return;   // the toolkit's own hold (see above)
        assert.isAtMost(grow, 0, "the closed window stays alive (detached): " + msg);
    });
});
