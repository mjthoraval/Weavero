/* global describe, it, before, after, assert, Zotero, wvT, Services */

// The Settings window's minimize / maximize buttons follow Weavero (MJT
// 2026-10-26, two screenshots: "Enabling or disabling Weavero does not
// properly update the Settings window controls" -> "Option 3"). Weavero's
// opener creates the window with them (minimizable=yes, dialog=no); Zotero's
// makes a close-only dialog; a window keeps the buttons it was created with
// (Gecko's chromeFlags never reach the native frame), so enabling or
// disabling Weavero has to set the native style itself. Windows only.
// Written before the code.

describe("Weavero — Settings window buttons follow Weavero", function () {
    this.timeout(60000);
    let wv, win;
    const BOXES = 0x20000 | 0x10000;   // WS_MINIMIZEBOX | WS_MAXIMIZEBOX
    const loaded = (w) => /** @type {Promise<void>} */ (new Promise((r) => {
        if (w.document && w.document.readyState === "complete") r(undefined); else w.addEventListener("load", () => r(undefined), { once: true });
    }));

    before(function () {
        wv = wvT.plugin();
        for (const m of ["_wvWindowButtons", "_wvWindowStyle", "_setupPrefsWindowWatcher", "_teardownPrefsWindowWatcher"]) wvT.method(m);
    });

    after(function () {
        try { if (win && !win.closed) win.close(); } catch (e) {}
        try { wv._setupPrefsWindowWatcher(); } catch (e) {}
    });

    it("a Settings window Zotero itself opened gets both buttons while Weavero runs, and loses them when it stops (Windows)", async function () {
        if (!Zotero.isWin) this.skip();
        // A Settings window an earlier spec closed can still be listed while
        // it closes, and Zotero's opener REUSES a listed one
        // (utilities_internal.js openPreferences): wait until none is left,
        // or this test reads a window that is going away (2026-10-26).
        const prefsOpen = () => Services.wm.getEnumerator("zotero:pref").hasMoreElements();
        await wvT.waitFor(() => !prefsOpen(), 8000);
        assert.isFalse(prefsOpen(), "no Settings window left from an earlier spec");
        const I = /** @type {any} */ (Zotero.Utilities.Internal);
        win = (I._wvOrigOpenPreferences || I.openPreferences).call(I);   // Zotero's close-only dialog
        await loaded(win);
        // Set once the window is shown (a style written before that is lost).
        await wvT.waitFor(() => (wv._wvWindowStyle(win) & BOXES) === BOXES, 6000);
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, BOXES, "Weavero running: minimize and maximize");
        wv._teardownPrefsWindowWatcher();   // what destroy() runs
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, 0, "Weavero stopped: close only, as Zotero opened it");
        wv._setupPrefsWindowWatcher();      // what init() runs
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, BOXES, "Weavero started again: back, on the open window");
    });

    it("setting the buttons is idempotent and keeps the window's other style bits (Windows)", async function () {
        if (!Zotero.isWin) this.skip();
        if (!win || win.closed) this.skip();
        const base = wv._wvWindowStyle(win) & ~BOXES;
        assert.isTrue(wv._wvWindowButtons(win, true));
        assert.isTrue(wv._wvWindowButtons(win, true));
        assert.strictEqual(wv._wvWindowStyle(win), base | BOXES);
        assert.isTrue(wv._wvWindowButtons(win, false));
        assert.strictEqual(wv._wvWindowStyle(win), base, "only the two boxes change");
        assert.isTrue(wv._wvWindowButtons(win, true));
    });

    // The 32-bit user32.dll exports no GetWindowLongPtrW / SetWindowLongPtrW
    // (SysWOW64's has neither, 2026-11-05) and declaring a missing symbol
    // throws, so a 32-bit Zotero could not read or write a style at all. This
    // stand-in fails the same way on a 64-bit Windows.
    const user32Without64bitNames = (ctypes) => {
        const lib = ctypes.open("user32.dll");
        return {
            declare(name, ...rest) {
                if (/WindowLongPtrW$/.test(name)) throw new Error("couldn't find function symbol in library");
                return lib.declare(name, ...rest);
            },
            close() { lib.close(); },
        };
    };

    it("reads and writes the style on a user32 without the *WindowLongPtrW names, as on 32-bit Windows (Windows)", async function () {
        if (!Zotero.isWin) this.skip();
        if (!win || win.closed) this.skip();
        const real = wv._wvWindowStyle(win);
        assert.isNumber(real);
        assert.strictEqual(wv._wvWindowStyle(win, undefined, user32Without64bitNames), real, "the same style read");
        assert.strictEqual(wv._wvWindowStyle(win, (s) => s & ~BOXES, user32Without64bitNames), real & ~BOXES, "written, and read back");
        assert.strictEqual(wv._wvWindowStyle(win), real & ~BOXES, "the window really changed");
        assert.strictEqual(wv._wvWindowStyle(win, (s) => s | BOXES, user32Without64bitNames), real | BOXES);
        assert.strictEqual(wv._wvWindowStyle(win), real | BOXES, "and back");
    });
});
