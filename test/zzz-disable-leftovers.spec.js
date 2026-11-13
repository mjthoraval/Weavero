/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, Components, wvT */
// A disable leaves no Weavero code in Zotero (alignment review 2026-11-11, work/align-reviews/
// 2026-11-11.md §1.3; Xiangyu, zotero#6080: "any changes should be reversible and the core
// functionality is not affected"). Under #6080 a plugin's scope is nuked 10 s after unload, so a
// Weavero function left in a slot Zotero calls (a wrapped method, a prototype patch, an observer)
// becomes a dead callback inside Zotero. test/disable/leftovers.js checks named methods live; this
// sweeps every object Weavero touches, in the runner, last (it disables and re-enables the plugin).
//
// How: spies on Zotero.Prefs / Zotero.Notifier register + unregister, a plugin RELOAD (so every
// observer of the instance goes through the spies), a fixture that wires everything (a reader tab,
// a note tab, an item selected, a second window where Zotero has its own), then DISABLE and sweep:
//  - HARD: a function whose source is Weavero's in a slot Zotero calls (own property not named _wv*)
//    of Zotero's singletons, windows, panes, views, row classes, readers and their views, note
//    editors; a pref or Notifier observer the instance registered and never unregistered; a live
//    flag left on in a page (`__wvLinkifyEnabled`); Weavero objects kept on the Zotero global.
//  - SOFT (listed, not failed): `_wv*` data left on Zotero objects.
describe("Weavero — a disable leaves no Weavero code in Zotero", function () {
    this.timeout(240000);
    const Cu = Components.utils;
    let hard = null, soft = null, addon = null, main = null;
    const sleep = (ms) => new Promise(r => main.setTimeout(r, ms));
    const OURS = /\bWeavero\b|_wv[A-Za-z_]|__wv|wvLivePlugin/;
    // Weavero's bundle runs in its own bootstrap global (bootstrap.js loads it as a sub-script
    // there): a function created in that global is Weavero's whatever its source says -- a
    // wrapper like `function (action, type, ids, extraData) { ... orig(...) }` names nothing of
    // Weavero's. Captured after the fixture's reload (a new instance, a new global).
    let wvGlobal = null;
    const looksOurs = (fn) => {
        try { if (wvGlobal && Cu.getGlobalForObject(fn) === wvGlobal) return true; } catch (e) {}
        try { return OURS.test(Function.prototype.toString.call(fn)); } catch (e) { return false; }
    };

    function sweep() {
        const H = [], S = [];
        const seen = new Set();
        const scan = (o, label) => {
            if (!o || (typeof o !== "object" && typeof o !== "function") || seen.has(o)) return;
            seen.add(o);
            let names = [];
            try { names = Object.getOwnPropertyNames(o); } catch (e) { return; }
            for (const n of names) {
                let d = null;
                try { d = Object.getOwnPropertyDescriptor(o, n); } catch (e) { continue; }
                if (!d || d.get || d.set) continue;
                const v = d.value;
                const ourName = /^_?_wv/.test(n);
                if (typeof v === "function" && !ourName && looksOurs(v)) H.push(label + "." + n + " is Weavero's function");
                else if (ourName && v !== null && (typeof v === "object" || typeof v === "function")) S.push(label + "." + n);
            }
        };
        const protoChain = (o, label) => {
            let p = o && Object.getPrototypeOf(o), i = 0;
            while (p && p !== Object.prototype && i++ < 6) { scan(p, label + ".proto" + i); p = Object.getPrototypeOf(p); }
        };
        const Z = /** @type {any} */ (Zotero);
        for (const [o, l] of [[Z.Reader, "Zotero.Reader"], [Z.Notes, "Zotero.Notes"], [Z.Utilities && Z.Utilities.Internal, "Zotero.Utilities.Internal"],
            [Z.Item && Z.Item.prototype, "Zotero.Item.prototype"], [Z.Session, "Zotero.Session"], [Z.Prefs, "Zotero.Prefs"], [Z.Notifier, "Zotero.Notifier"],
            [Z.ItemTreeManager, "Zotero.ItemTreeManager"], [Z.ItemPaneManager, "Zotero.ItemPaneManager"], [Z.MenuManager, "Zotero.MenuManager"]]) scan(o, l);
        // The Zotero global itself: Weavero objects kept there die with a nuked scope.
        for (const n of Object.getOwnPropertyNames(Z)) {
            if (!/^_?_wv|^_weavero/.test(n)) continue;
            const v = Z[n];
            if (v !== null && (typeof v === "object" || typeof v === "function")) H.push("Zotero." + n + " keeps a Weavero object");
        }
        let wi = 0;
        for (const w of Z.getMainWindows()) {
            const L = "win" + (wi++);
            scan(w, L);
            scan(w.ZoteroPane, L + ".ZoteroPane");
            scan(w.Zotero_Tabs, L + ".Zotero_Tabs");
            try { scan(w.Zotero_Tabs.tabHooks, L + ".Zotero_Tabs.tabHooks"); for (const k of Object.keys(w.Zotero_Tabs.tabHooks || {})) scan(w.Zotero_Tabs.tabHooks[k], L + ".tabHooks." + k); } catch (e) {}
            scan(w.ZoteroContextPane, L + ".ZoteroContextPane");
            scan(w.document.getElementById("zotero-context-pane-inner"), L + "#zotero-context-pane-inner");
            const views = (w.ZoteroPane && w.ZoteroPane.libraryViews) ? [...w.ZoteroPane.libraryViews] : [w.ZoteroPane];
            let vi = 0;
            for (const v of views) {
                const V = L + ".view" + (vi++);
                const iv = v && v.itemsView, cv = v && v.collectionsView;
                scan(iv, V + ".itemsView");
                scan(cv, V + ".collectionsView");
                try { scan(iv && iv.tree && iv.tree.props, V + ".itemsView.tree.props"); } catch (e) {}
                const rp = iv && (iv.rowProvider || iv._rowProvider);
                scan(rp, V + ".rowProvider");
                try { for (const r of ((rp && rp._rows) || (iv && iv._rows) || []).slice(0, 300)) protoChain(r, V + ".row(" + (r.constructor && r.constructor.name) + ")"); } catch (e) {}
                try { for (const r of ((cv && cv._rows) || []).slice(0, 50)) protoChain(r, V + ".collectionRow"); } catch (e) {}
            }
            // Note editors in this window: the page's own globals.
            for (const ne of w.document.querySelectorAll("note-editor")) {
                try {
                    const f = ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
                    const pw = f && f.contentWindow && Cu.waiveXrays(f.contentWindow);
                    if (!pw) continue;
                    if (pw.__wvLinkifyEnabled === true) H.push(L + " note editor: __wvLinkifyEnabled still true (links still decorated)");
                    for (const n of Object.getOwnPropertyNames(pw)) if (/^__wv/.test(n) && typeof pw[n] === "function") S.push(L + " note editor page." + n);
                } catch (e) {}
            }
        }
        let ri = 0;
        for (const r of (Z.Reader._readers || [])) {
            const R = "reader" + (ri++);
            scan(r, R);
            protoChain(r, R);
            try {
                const ir = Cu.waiveXrays(r._internalReader);
                scan(ir, R + "._internalReader");
                for (const k of ["_primaryView", "_secondaryView", "_annotationManager"]) { if (ir && ir[k]) { scan(ir[k], R + "." + k); protoChain(ir[k], R + "." + k); } }
            } catch (e) {}
            try {
                const iw = Cu.waiveXrays(r._iframeWindow);
                for (const n of Object.getOwnPropertyNames(iw)) {
                    if (/^_?_wv/.test(n) && typeof iw[n] === "function") H.push(R + " page." + n + " is Weavero's function");
                }
            } catch (e) {}
        }
        return { H, S };
    }

    const spies = { prefs: new Map(), notifier: new Map() };
    let restoreSpies = null;
    function installSpies() {
        const P = Zotero.Prefs, N = Zotero.Notifier;
        const pReg = P.registerObserver, pUnreg = P.unregisterObserver, nReg = N.registerObserver, nUnreg = N.unregisterObserver;
        P.registerObserver = function (name, handler, global) {
            const sym = pReg.apply(this, arguments);
            if (looksOurs(handler)) spies.prefs.set(sym, name);
            return sym;
        };
        P.unregisterObserver = function (sym) { spies.prefs.delete(sym); return pUnreg.apply(this, arguments); };
        N.registerObserver = function (ref, types, id) {
            const r = nReg.apply(this, arguments);
            if (/weavero|^wv/i.test(String(id || "")) || (ref && looksOurs(ref.notify))) spies.notifier.set(r, String(id || r));
            return r;
        };
        N.unregisterObserver = function (id) { spies.notifier.delete(id); return nUnreg.apply(this, arguments); };
        restoreSpies = () => { P.registerObserver = pReg; P.unregisterObserver = pUnreg; N.registerObserver = nReg; N.unregisterObserver = nUnreg; };
    }

    let pdf, pdf2, note, item;
    // Zotero 9/10 (no windows of Zotero's own): a reader window holding only Zotero's own
    // document must survive the disable, and a Weavero deck window (a tab Weavero mounted)
    // closes and comes back on enable (MJT 2026-11-11: until then every reader window closed,
    // Zotero's own included). `rw` = whether each window was open after the disable.
    let pdf3 = null, zoteroWin = null, deckWin = null, rw = null, zoteroWinsAfterEnable = null;
    const readerWindowsFor = (id) => {
        const out = new Set();
        for (const r of (/** @type {any} */ (Zotero.Reader)._readers || [])) {
            try {
                const w = r._window;
                if (r.itemID === id && w && !w.closed && w.document.documentElement.getAttribute("windowtype") === "zotero:reader") out.add(w);
            } catch (e) {}
        }
        return [...out];
    };
    const openReaderWindow = async (id) => {
        const r = /** @type {any} */ (await Zotero.Reader.open(id, null, { openInWindow: true, allowDuplicate: true }));
        const w = r._window;
        await wvT.waitFor(() => w.document.readyState === "complete" || null, 10000);
        await r._initPromise;
        return w;
    };
    // The setup's current step, printed to the run's log if it never finishes (a timeout names
    // no step otherwise).
    let stepAt = "start", stepT0 = Date.now();
    const step = (s) => { stepAt = s; stepT0 = Date.now(); };
    after(function () {
        if (hard !== null) return;
        const line = "[wv-test] disable-leftovers: setup stopped at \"" + stepAt + "\" after " + Math.round((Date.now() - stepT0) / 1000) + " s";
        try { Zotero.debug(line); } catch (e) {}
        try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (e) {}
    });
    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        main = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");
        pdf = await wvT.createTestPDFItem("wv-disable-leftovers");
        pdf2 = await wvT.createTestPDFItem("wv-disable-leftovers-2");
        item = await wvT.createItem("journalArticle", { title: "WV-TEST disable leftovers" });
        note = new Zotero.Item("note"); note.setNote("<p>WV-TEST disable leftovers https://www.zotero.org</p>"); await note.saveTx();
        installSpies();
        try {
            step("reload");
            /** @type {any} */ (Zotero)._weaveroReady = false;
            await addon.reload();
            for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
            assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "fixture: the plugin is back after the reload");
            wvGlobal = Cu.getGlobalForObject(wvT.plugin());
            assert.notStrictEqual(wvGlobal, Cu.getGlobalForObject(Zotero), "fixture: Weavero's global is its own");
            step("open the reader tab");
            await wvT.openReaderTab(pdf.id);
            step("open the note tab");
            await main.ZoteroPane.openNote(note.id, { openInWindow: false });
            if (wvT.nativeWindows()) {
                step("open a second window");
                const w2 = await wvT.openMainWindow();
                step("open a reader in the second window");
                if (w2) await Zotero.Reader.open(pdf2.id, null, /** @type {any} */ ({ window: w2 }));
            }
            else {
                step("open Zotero's own reader window");
                zoteroWin = await openReaderWindow(pdf2.id);
                step("open a Weavero deck window");
                pdf3 = await wvT.createTestPDFItem("wv-disable-leftovers-3");
                deckWin = await openReaderWindow(pdf3.id);
                await wvT.plugin()._wvWTMountTab(deckWin, note.id, { select: false, await: true, allowDuplicate: true });
                assert.isAbove(((deckWin._wvWT && deckWin._wvWT.tabs) || []).length, 1, "fixture: the deck window holds a Weavero tab");
            }
            step("select the item");
            main.focus();
            main.Zotero_Tabs.select(main.Zotero_Tabs._tabs.find(t => String(t.type).startsWith("library")).id);
            await main.ZoteroPane.selectItem(item.id);
            await sleep(6000);
            step("disable");
            await addon.disable();
            for (let i = 0; i < 100 && /** @type {any} */ (Zotero).Weavero; i++) await sleep(100);
            await sleep(2500);
            if (zoteroWin) rw = { zotero: !zoteroWin.closed, deck: !deckWin.closed };
            step("sweep");
            const r = sweep();
            for (const [sym, name] of spies.prefs) r.H.push("pref observer on " + name + " never unregistered (" + String(sym) + ")");
            for (const [id, name] of spies.notifier) r.H.push("Notifier observer " + name + " never unregistered (" + id + ")");
            hard = r.H; soft = r.S;
        }
        finally {
            if (restoreSpies) restoreSpies();
            step((hard === null ? "(failed) " : "") + "re-enable");
            try {
                if (addon && !addon.isActive) {
                    /** @type {any} */ (Zotero)._weaveroReady = false;
                    await addon.enable();
                    for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
                }
            } catch (e) {}
            if (pdf3) {
                // The enable's restore runs its unclaimed-window check after the reader
                // windows settle (index.ts restore chain): give it the time it takes.
                step("after the enable");
                await sleep(9000);
                zoteroWinsAfterEnable = readerWindowsFor(pdf2.id).length;
            }
            step((hard === null ? "(failed) " : "") + "clean up");
            for (const w of Zotero.getMainWindows()) { if (w !== main) { try { w.close(); } catch (e) {} } }
            try {
                const en = Services.wm.getEnumerator("zotero:reader");
                const rws = [];
                while (en.hasMoreElements()) rws.push(en.getNext());
                for (const w of rws) { try { w.close(); } catch (e) {} }
                await wvT.waitFor(() => !Services.wm.getMostRecentWindow("zotero:reader") || null, 8000);
            } catch (e) {}
            try {
                const Z = main.Zotero_Tabs;
                const ids = Z._tabs.filter(t => t.data && [pdf.id, note.id].includes(t.data.itemID)).map(t => t.id);
                if (ids.length) Z.close(ids);
            } catch (e) {}
            await sleep(1500);
            wvT.purgeDeadReaders();
            await wvT.erase(...[note, item, pdf, pdf2, pdf3].filter(Boolean));
        }
    });

    it("Zotero 9/10: the disable keeps Zotero's own reader window and closes Weavero's deck window", function () {
        if (!pdf3) this.skip();   // Zotero with its own windows: no reader windows (zotero#6035)
        assert.deepEqual(rw, { zotero: true, deck: false });
    });

    it("Zotero 9/10: the enable opens no second window for the one the disable kept", function () {
        if (!pdf3) this.skip();
        assert.strictEqual(zoteroWinsAfterEnable, 1);
    });

    it("the plugin is back after the disable / enable round trip", () => {
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true);
    });

    it("no Weavero function is left in a slot Zotero calls, and every observer is gone", () => {
        if (soft && soft.length) Zotero.debug("[Weavero][disable-leftovers] soft: " + soft.join(" | "));
        assert.deepEqual(hard, [], "left after disable:\n" + (hard || []).join("\n"));
    });
});
