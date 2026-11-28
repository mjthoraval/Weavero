/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, Components, wvT */

// Nothing Zotero or Gecko calls may still be a PREVIOUS Weavero instance's once its
// scope would be gone (2026-11-22, "can't access dead object" hunt). Under zotero#6080
// a plugin's scope is nuked 10 s after unload: an observer, a listener, a timer chain
// or a wrap left behind then throws "TypeError: can't access dead object" with no
// source -- 177 of them after one reload and the gestures below on the canary
// 40b5f3a1 (D:/tmp/wv-test-deadobj-probe-c6080-base.log). On a Zotero without the
// nuke the same leftover keeps running stale code.
//
// How: a Debugger (in a fresh-compartment sandbox) watches the previous instance's
// global from 10 s after a reload, then after a disable -- the nuke's delay: what runs
// before it is the instance's own wind-down -- through the gestures that reached the
// leftovers found that day, and records every frame entered there from outside. Any
// entry is a failure. Found and fixed 2026-11-22: the filter's stray-menuitem watchdog
// (a MutationObserver on the whole main window, filter.ts), the close-button
// ResizeObserver and the theme media-query listener (tab-groups.ts), the badge
// overlay's reposition observers on pdf.js pages (reader.ts), the hidden collections'
// isContainerEmpty left in the collection tree's props (pane.ts), the DOM-view
// selection tracker's retry (reader-panels.ts), the taskbar overlay's move / activate
// listeners and the Advanced Search document listeners after a disable (tabs.ts,
// pane.ts); and, after a second reload past the first one's nuke, the items list's
// ▷ renderer wrap a disable left once the default-attachment wiring had stopped on a
// dead Set (attachments.ts).
//
// A Zotero that nukes the scope (Zotero.Plugins.getBaseURI, zotero#6080): a Debugger
// cannot follow a nuked global (its frames never start), so there the spec waits past
// the nuke and counts the console's "dead object" / "nuked compartment" errors during
// the same gestures instead. A Zotero without `jsdebugger.sys.mjs` skips the tracer
// with a message. RUNS LATE (zz-): it reloads and disables the plugin.
describe("Weavero — nothing calls a previous instance after a reload or a disable (zotero#6080's nuked scope)", function () {
    this.timeout(300000);
    const Cu = Components.utils;
    const NUKE = !!(Zotero.Plugins && /** @type {any} */ (Zotero.Plugins).getBaseURI);
    const NUKE_DELAY_MS = 10000;   // xpcom/plugins/sandbox.mjs SANDBOX_NUKE_DELAY_MS
    let addon = null, main = null, pdf = null, item = null, item2 = null, coll = null, child = null;
    let tracerOK = true, tracerWhy = "";
    const results = { reload: null, reload2: null, disable: null };
    const sleep = (ms) => new Promise(r => main.setTimeout(r, ms));
    const say = (line) => { try { Zotero.debug(line); } catch (e) {} try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {} };

    /** A Debugger on global `G`: every frame entered there from outside (no older
     *  frame of G under it), in the code loaded so far -- an enable on Zotero 10 / 11
     *  beta.5 loads the next bundle into the SAME global, as a new source. */
    function makeTracer(G) {
        const sb = /** @type {any} */ (Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshCompartment: true, invisibleToDebugger: true, sandboxName: "wv-stale-instance-tracer" }));
        const { addDebuggerToGlobal } = ChromeUtils.importESModule("resource://gre/modules/jsdebugger.sys.mjs");
        addDebuggerToGlobal(sb);
        sb.G = G;
        Cu.evalInSandbox(`
            var hits = new Map();
            var dbg = new Debugger();
            dbg.addDebuggee(G);
            var oldSources = new Set(dbg.findSources());
            dbg.onEnterFrame = function (frame) {
                try {
                    if (frame.older) return;
                    try { if (!oldSources.has(frame.script.source)) return; } catch (e) { return; }
                    // The bootstrap shim's lifecycle functions are Zotero's to call on a
                    // disabled plugin (Zotero 10 / 11 beta.5 keep its scope): not Weavero.
                    try { if (/bootstrap\\.js$/.test(frame.script.url)) return; } catch (e) {}
                    var name = "?";
                    try { name = (frame.callee && (frame.callee.displayName || frame.callee.name)) || frame.type; } catch (e) {}
                    var k = name + " @" + frame.script.startLine;
                    var h = hits.get(k);
                    if (!h) {
                        var st = ""; try { st = String(new Error().stack).split("\\n").filter(function (l) { return l && !/wv-stale-instance-tracer|onEnterFrame/.test(l); }).slice(0, 4).join(" < "); } catch (e) {}
                        h = { n: 0, stack: st };
                        hits.set(k, h);
                    }
                    h.n++;
                } catch (e) {}
            };
            function dump() { var o = []; for (var e of hits) o.push(e[0] + " x" + e[1].n + " | " + e[1].stack); return JSON.stringify(o); }
            function stop() { try { dbg.onEnterFrame = undefined; dbg.removeAllDebuggees(); } catch (e) {} }
        `, sb);
        return sb;
    }

    /** The "dead object" / "nuked compartment" console errors logged while `fn`
     *  runs, through a console LISTENER: the console keeps a bounded buffer, so once
     *  it is full a slice of getMessageArray() by index is always empty (a baseline
     *  run on the canary found none that way after a probe had filled it). */
    async function deadDuring(fn) {
        const out = [];
        const listener = {
            observe(m) {
                try {
                    const s = String(m.message || /** @type {any} */ (m).errorMessage || m);
                    if (!/dead object|nuked compartment/i.test(s)) return;
                    let src = "";
                    try { src = /** @type {any} */ (m).QueryInterface(Components.interfaces.nsIScriptError).sourceName || ""; } catch (e) {}
                    out.push((src ? src + ": " : "") + s.slice(0, 160));
                } catch (e) {}
            },
            QueryInterface: ChromeUtils.generateQI(["nsIConsoleListener"]),
        };
        Services.console.registerListener(listener);
        try { await fn(); await sleep(500); }
        finally { Services.console.unregisterListener(listener); }
        return out;
    }
    // A gesture's own promise is awaited at most `ms`: on the code before the fixes a
    // dead onSelect listener stopped Zotero's listener loop and a selectItem never
    // resolved (canary, zzz-disable-leftovers' setup, 2026-11-22). The setup's current
    // step is printed if the hook does not finish.
    const bounded = (p, ms = 8000) => Promise.race([p, sleep(ms)]);
    let stepAt = "start", stepT0 = Date.now();
    const step = (s) => { stepAt = s; stepT0 = Date.now(); };
    const libTabID = () => { try { return main.Zotero_Tabs._tabs.find(t => String(t.type).startsWith("library")).id; } catch (e) { return "zotero-pane"; } };
    const readerOf = (id) => (Zotero.Reader._readers || []).find(r => { try { return r.itemID === id && r._internalReader; } catch (e) { return false; } });

    /** What reaches every leftover found on 2026-11-22: DOM changes in the main window,
     *  a row redraw of the collection tree, a theme flip, a pdf.js zoom, a window resize
     *  and activation, key presses on the main window's document. */
    async function gestures() {
        step("gestures: select items");
        for (const it of [item, item2, item]) { try { await bounded(main.ZoteroPane.selectItem(it.id)); } catch (e) {} await sleep(300); }
        step("gestures: font size");
        const fs = Zotero.Prefs.get("fontSize");
        try { Zotero.Prefs.set("fontSize", fs === "1.15" ? "1.00" : "1.15"); await sleep(600); } catch (e) {}
        try { if (fs === undefined) Zotero.Prefs.clear("fontSize"); else Zotero.Prefs.set("fontSize", fs); } catch (e) {}
        await sleep(400);
        step("gestures: collections");
        try { await bounded(main.ZoteroPane.collectionsView.selectByID("C" + coll.id)); await sleep(500); await bounded(main.ZoteroPane.collectionsView.selectByID("L" + Zotero.Libraries.userLibraryID)); } catch (e) {}
        await sleep(400);
        step("gestures: theme, zoom, resize, keys");
        const THEME = "browser.theme.toolbar-theme";
        let was = null;
        try { was = Services.prefs.prefHasUserValue(THEME) ? Services.prefs.getIntPref(THEME) : null; } catch (e) {}
        try { Services.prefs.setIntPref(THEME, main.matchMedia("(prefers-color-scheme: dark)").matches ? 1 : 0); } catch (e) {}
        await sleep(800);
        try { if (was === null) Services.prefs.clearUserPref(THEME); else Services.prefs.setIntPref(THEME, was); } catch (e) {}
        await sleep(800);
        const r = readerOf(pdf.id);
        if (r) {
            step("gestures: reader zoom");
            try { main.Zotero_Tabs.select(r.tabID); await sleep(600); } catch (e) {}
            try { r.zoomIn(); await sleep(700); r.zoomOut(); await sleep(700); } catch (e) {}
            try { main.Zotero_Tabs.select(libTabID()); } catch (e) {}
            await sleep(400);
        }
        step("gestures: resize, keys");
        try { main.resizeBy(-30, -20); await sleep(500); main.resizeBy(30, 20); } catch (e) {}
        try { main.dispatchEvent(new main.Event("resize")); main.dispatchEvent(new main.Event("activate")); } catch (e) {}
        try {
            const doc = main.document;
            for (const t of ["keydown", "keyup"]) doc.documentElement.dispatchEvent(new main.KeyboardEvent(t, { bubbles: true, key: "Shift" }));
            doc.documentElement.dispatchEvent(new main.MouseEvent("mousedown", { bubbles: true, button: 1 }));
        } catch (e) {}
        await sleep(800);
    }

    /** One lifecycle step: `lifecycle()` (a reload or a disable), the nuke's delay,
     *  the gestures, and what entered the previous instance meanwhile. */
    async function watch(lifecycle) {
        const G = Cu.getGlobalForObject(wvT.plugin());
        await lifecycle();
        if (!NUKE) {
            await sleep(NUKE_DELAY_MS);
            if (!tracerOK) return null;
            const tr = makeTracer(G);
            try { await gestures(); }
            finally { tr.stop(); }
            return JSON.parse(tr.dump());
        }
        await sleep(NUKE_DELAY_MS + 2000);
        return deadDuring(gestures);
    }

    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        main = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");
        if (!NUKE) {
            try { ChromeUtils.importESModule("resource://gre/modules/jsdebugger.sys.mjs"); }
            catch (e) { tracerOK = false; tracerWhy = "no jsdebugger.sys.mjs in this Zotero (" + e + ")"; }
        }
        item = await wvT.createItem("journalArticle", { title: "WV-TEST stale instance A" });
        item2 = await wvT.createItem("journalArticle", { title: "WV-TEST stale instance B" });
        pdf = await wvT.createTestPDFItem("wv-stale-instance", { parentItemID: item.id });
        coll = new Zotero.Collection(); coll.name = "WV-TEST stale instance"; await coll.saveTx();
        child = new Zotero.Collection(); child.name = "WV-TEST stale instance child"; child.parentID = coll.id; await child.saveTx();
        step("open the reader tab");
        await bounded(wvT.openReaderTab(pdf.id, 30000), 35000);
        await sleep(2500);
        main.Zotero_Tabs.select(libTabID());
        await bounded(main.ZoteroPane.selectItem(item.id));
        await sleep(2000);
        try {
            const reload = async (label) => {
                step(label);
                /** @type {any} */ (Zotero)._weaveroReady = false;
                await addon.reload();
                for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
                assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "fixture: the plugin is back after the " + label);
                step("after the " + label + ": the nuke's delay");
            };
            results.reload = await watch(() => reload("reload"));
            // A SECOND reload, past the first one's nuke: whatever the first
            // instance left on Zotero's objects is dead by now, and the third
            // instance wires over it. A Set the first instance kept on
            // Zotero.Item.prototype threw there, the default-attachment wiring
            // stopped half-way, and the next disable left the items list's
            // renderer wrapped (the canary battery, 2026-11-22).
            results.reload2 = await watch(() => reload("second reload"));
            results.disable = await watch(async () => {
                step("disable");
                await addon.disable();
                for (let i = 0; i < 100 && /** @type {any} */ (Zotero).Weavero; i++) await sleep(100);
                step("after the disable: the nuke's delay");
            });
        }
        finally {
            step("re-enable");
            try {
                if (!addon.isActive) {
                    /** @type {any} */ (Zotero)._weaveroReady = false;
                    await addon.enable();
                    for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
                }
            } catch (e) {}
            step("done");
            say("[wv-test] stale-instance calls: " + JSON.stringify(results));
        }
    });

    after(async function () {
        if (stepAt !== "done") say("[wv-test] stale-instance calls: setup stopped at \"" + stepAt + "\" after " + Math.round((Date.now() - stepT0) / 1000) + " s; so far " + JSON.stringify(results));
        try { const r = readerOf(pdf && pdf.id); if (r) wvT.closeReaderTab(r); } catch (e) {}
        await sleep(800);
        try { main.Zotero_Tabs.select(libTabID()); } catch (e) {}
        try { await bounded(child.eraseTx(), 15000); } catch (e) {}
        try { await bounded(coll.eraseTx(), 15000); } catch (e) {}
        await bounded(wvT.erase(pdf, item, item2), 20000);
    });

    it("the plugin is back after the reload / disable / enable round trip", function () {
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true);
    });

    it("after a reload, nothing calls the previous instance once its scope would be nuked", function () {
        if (!NUKE && !tracerOK) { say("[wv-test] stale-instance tracer skipped: " + tracerWhy); this.skip(); }
        assert.deepEqual(results.reload, [], NUKE ? "dead-object errors after the nuke" : "calls into the reloaded-away instance");
    });

    it("after a second reload past the first one's nuke, nothing calls the previous instance", function () {
        if (!NUKE && !tracerOK) { say("[wv-test] stale-instance tracer skipped: " + tracerWhy); this.skip(); }
        assert.deepEqual(results.reload2, [], NUKE ? "dead-object errors after the nuke" : "calls into the reloaded-away instance");
    });

    it("after a disable, nothing calls the disabled instance once its scope would be nuked", function () {
        if (!NUKE && !tracerOK) { say("[wv-test] stale-instance tracer skipped: " + tracerWhy); this.skip(); }
        assert.deepEqual(results.disable, [], NUKE ? "dead-object errors after the nuke" : "calls into the disabled instance");
    });
});
