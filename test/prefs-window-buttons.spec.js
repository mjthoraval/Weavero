/* global describe, it, before, after, assert, Zotero, wvT, Services, Ci, ChromeUtils */

// The minimize / maximize buttons of the Settings window and of the Plugins
// Manager. Weavero's openers create them with both (dialog=no: index.ts, the
// openPreferences patch; pane.ts _wvPMOpenViewerNonDialog); Zotero's own make a
// close-only dialog; a window keeps the buttons it was created with (Gecko's
// chromeFlags never reach the native frame).
// - 2026-10-26 (MJT, "Option 3"; "the controls do not get back to the native
//   state"): Weavero also set them on an OPEN window when it was enabled or
//   disabled, through native code (user32 Get/SetWindowLong and SetWindowPos,
//   through js-ctypes; Windows only).
// - 2026-11-27 (MJT, "1a, drop the live change" for Settings; "Yes, same as
//   Settings" for the Plugins Manager): no longer. The buttons follow Weavero
//   the next time the window opens, and no native code runs for them (the
//   Zotero Plugins Atlas grades a plugin that loads native code "Use with
//   care"; test/native-calls.spec.js). A window open across an enable or a
//   disable keeps the buttons it has until it is closed.
// Written before the code: the Settings part failed on 1.3.0-dev.99 (9271dc32),
// the Plugins Manager part on 1.3.0-starn1.1 (d3452887) -- the live restyle took
// the buttons off the open window, and the teardown and the setup called
// _wvWindowButtons.
// The spec reads the native style itself (its own user32 call, test code, never
// shipped), so that it does not lean on Weavero code.

describe("Weavero — window buttons given when the window opens, never changed live", function () {
    this.timeout(60000);
    const BOXES = 0x20000 | 0x10000;   // WS_MINIMIZEBOX | WS_MAXIMIZEBOX
    const VISIBLE = 0x10000000;        // WS_VISIBLE
    /** Weavero's former ways into a window's native style (index.ts, until 1.3.0-starn1.2). */
    const NATIVE = ["_wvWindowButtons", "_wvWindowStyle"];
    /** What a function of Weavero's on these paths must not name. */
    const NATIVE_NAMES = [...NATIVE, "wvWin32Style", "ctypes"];
    let wv;

    const appWin = (w) => w.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow);
    const isDialog = (w) => !!(appWin(w).chromeFlags & Ci.nsIWebBrowserChrome.CHROME_OPENAS_DIALOG);
    /** Windows: a window's native style (GWL_STYLE). GetWindowLongW: the style is 32 bits, and 32-bit user32 has it too. */
    const nativeStyle = (w) => {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        const lib = ctypes.open("user32.dll");
        try {
            const get = lib.declare("GetWindowLongW", ctypes.winapi_abi, ctypes.int32_t, ctypes.voidptr_t, ctypes.int);
            const h = w.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow).nativeHandle;
            return get(ctypes.voidptr_t(ctypes.UInt64(h)), -16) | 0;
        }
        finally { lib.close(); }
    };
    /** Every call into Weavero's former native path while `fn` runs (the methods
     *  wrapped on the instance; none are left from 1.3.0-starn1.2 on). */
    const nativeCalls = async (fn) => {
        const calls = [], own = {};
        for (const m of NATIVE) {
            own[m] = Object.prototype.hasOwnProperty.call(wv, m) ? wv[m] : undefined;
            const orig = wv[m];
            if (typeof orig !== "function") continue;
            wv[m] = function (...args) { calls.push(m); return orig.apply(this, args); };
        }
        try { await fn(); }
        finally {
            for (const m of NATIVE) { if (own[m] === undefined) delete wv[m]; else wv[m] = own[m]; }
        }
        return calls;
    };
    /** The text of each method names no native path. */
    const noNativeNames = (names) => {
        for (const m of names) {
            const src = wvT.src(m);
            for (const n of NATIVE_NAMES) assert.notInclude(src, n, m + " names " + n);
        }
    };

    before(function () {
        wv = wvT.plugin();
    });

    describe("the Settings window", function () {
        let win;
        const WATCHER = ["_setupPrefsWindowWatcher", "_teardownPrefsWindowWatcher"];
        const loaded = (w) => /** @type {Promise<void>} */ (new Promise((r) => {
            if (w.document && w.document.readyState === "complete") r(undefined); else w.addEventListener("load", () => r(undefined), { once: true });
        }));
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        // A Settings window an earlier spec closed can still be listed while it
        // closes, and the opener REUSES a listed one (utilities_internal.js
        // openPreferences): wait until none is left (2026-10-26).
        const noPrefs = async () => {
            await wvT.waitFor(() => !prefsOpen(), 8000);
            assert.isFalse(prefsOpen(), "no Settings window left from an earlier spec");
        };
        /** Settings as Edit -> Settings opens it (no pane named): Weavero's opener while it runs. */
        const openSettings = () => /** @type {any} */ (Zotero.Utilities.Internal).openPreferences();

        before(function () {
            for (const m of WATCHER) wvT.method(m);
        });

        after(function () {
            try { if (win && !win.closed) win.close(); } catch (e) {}
            try { wv._setupPrefsWindowWatcher(); } catch (e) {}
        });

        it("Weavero turned off and on with Settings open: no call into the native path, and the open window keeps the buttons it has", async function () {
            await noPrefs();
            win = openSettings();   // Weavero's opener: Edit -> Settings, Ctrl+,
            await loaded(win);
            if (Zotero.isWin) await wvT.waitFor(() => (nativeStyle(win) & VISIBLE) !== 0, 6000);
            const had = Zotero.isWin ? nativeStyle(win) & BOXES : null;
            const calls = await nativeCalls(async () => {
                wv._teardownPrefsWindowWatcher();   // what destroy() runs
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, had, "Weavero off: the open window keeps its buttons until it is closed");
                wv._setupPrefsWindowWatcher();      // what init() runs
                // The Settings document reloaded, as Zotero does when a plugin's
                // pane comes or goes (PreferencePanes._refreshPreferences): the
                // watcher's per-document path runs on it.
                win.document.documentElement.setAttribute("data-wv-test-old-doc", "1");
                win.location.reload();
                assert.isOk(await wvT.waitFor(() => { try { return !win.document.documentElement.hasAttribute("data-wv-test-old-doc") && win.document.readyState === "complete"; } catch (e) { return false; } }, 10000), "the document reloaded");
                await wvT.sleep(400);   // the watcher applies a tick after the load
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, had, "Weavero on again: the same buttons, untouched");
            });
            assert.deepEqual(calls, [], "no call into the native path while Weavero goes off and on");
            // Nor in the watcher's code at all.
            noNativeNames(WATCHER);
        });

        it("a Settings window opened afterwards has the buttons: Weavero's opener creates it with them", async function () {
            try { if (win && !win.closed) win.close(); } catch (e) {}
            await noPrefs();
            win = openSettings();
            await loaded(win);
            // dialog=no is what gives a Windows title bar its minimize and
            // maximize (the chrome flags carry no "minimizable" for a window that
            // is no dialog: CHROME_WINDOW_MIN read unset, Zotero 11, 2026-11-27).
            assert.isFalse(isDialog(win), "not a dialog (dialog=no)");
            if (!Zotero.isWin) return;
            // What the title bar really carries, once the window is shown.
            await wvT.waitFor(() => (nativeStyle(win) & VISIBLE) !== 0, 6000);
            assert.strictEqual(nativeStyle(win) & BOXES, BOXES, "minimize and maximize on the title bar");
        });
    });

    describe("the Plugins Manager", function () {
        const URI = "chrome://mozapps/content/extensions/aboutaddons.html";
        let win;
        const PM = ["_registerPluginsSearch", "_teardownPluginsSearch", "_wvPMInject", "_wvPMMaybeInject", "_wvPMOpenViewerNonDialog"];
        const isManager = (w) => String(/** @type {any} */ (w).viewerOriginalURI || "").includes("aboutaddons");
        const managers = () => [...Services.wm.getEnumerator("zotero:basicViewer")].filter(isManager);
        const closeManagers = async () => {
            for (const w of managers()) { try { w.close(); } catch (e) {} }
            await wvT.waitFor(() => !managers().length, 8000);
            assert.lengthOf(managers(), 0, "no Plugins Manager left open");
        };
        const pageDoc = (w) => {
            try {
                const br = w.document.querySelector("browser");
                const cd = br && br.contentDocument;
                return cd && String(cd.location.href).includes("aboutaddons") && cd.readyState === "complete" ? cd : null;
            } catch (e) { return null; }
        };
        /** The manager as Tools -> Plugins opens it (Zotero.openInViewer: Weavero's opener while it runs). */
        const openManager = async () => {
            const w = /** @type {any} */ (Zotero).openInViewer(URI);
            assert.isOk(await wvT.waitFor(() => pageDoc(w), 15000), "the manager's page loaded");
            if (Zotero.isWin) await wvT.waitFor(() => (nativeStyle(w) & VISIBLE) !== 0, 6000);
            return w;
        };
        const searchBox = (w) => { const d = pageDoc(w); return d && d.getElementById("wv-pm-searchbox"); };

        before(async function () {
            for (const m of PM) wvT.method(m);
            if (!wv._getEnablePluginsSearch()) wvT.absent("Plugins Manager extras switched off in this profile");
            await closeManagers();
        });

        after(async function () {
            try { wv._registerPluginsSearch(); } catch (e) {}
            await closeManagers();
        });

        it("Weavero turned off and on with the Plugins Manager open: no call into the native path, and the open manager keeps the buttons it has", async function () {
            win = await openManager();
            assert.isOk(await wvT.waitFor(() => searchBox(win), 8000), "Weavero's search box: Weavero's manager");
            const had = Zotero.isWin ? nativeStyle(win) & BOXES : null;
            if (Zotero.isWin) assert.strictEqual(had, BOXES, "Weavero's opener: minimize and maximize");
            const calls = await nativeCalls(async () => {
                wv._teardownPluginsSearch();   // what destroy() runs for the manager
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, had, "Weavero off: the open manager keeps its buttons until it is closed");
                wv._registerPluginsSearch();   // what init() runs: the page wired again
                assert.isOk(await wvT.waitFor(() => searchBox(win), 8000), "Weavero on again: its search box back");
                await wvT.sleep(300);
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, had, "Weavero on again: the same buttons, untouched");
            });
            assert.deepEqual(calls, [], "no call into the native path while Weavero goes off and on");
            noNativeNames(PM);
        });

        it("the buttons change only when the manager is next opened: Zotero's close-only dialog once Weavero is off, minimize and maximize once it is on", async function () {
            await closeManagers();
            try {
                wv._teardownPluginsSearch();   // Weavero off: Zotero's own opener is back
                win = await openManager();
                assert.isTrue(isDialog(win), "Weavero off: Zotero's dialog");
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, 0, "Weavero off: close only");
                // Weavero on with that manager open: it stays as it is.
                const calls = await nativeCalls(async () => {
                    wv._registerPluginsSearch();
                    assert.isOk(await wvT.waitFor(() => searchBox(win), 8000), "Weavero's search box injected into Zotero's manager");
                    await wvT.sleep(300);
                });
                assert.deepEqual(calls, [], "no call into the native path on Weavero's start");
                if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, 0, "Weavero on, the manager still open: still close only");
            }
            finally { try { wv._registerPluginsSearch(); } catch (e) {} }
            await closeManagers();
            win = await openManager();   // Weavero's opener again
            assert.isFalse(isDialog(win), "Weavero on, the manager reopened: not a dialog (dialog=no)");
            if (Zotero.isWin) assert.strictEqual(nativeStyle(win) & BOXES, BOXES, "Weavero on, the manager reopened: minimize and maximize");
        });
    });
});
