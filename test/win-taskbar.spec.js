/* global describe, it, before, after, assert, Zotero, Ci, wvT */

// The Windows taskbar through Gecko's own services (2026-11-27): Weavero's
// per-window AppUserModelIDs (separate taskbar buttons), the re-added button
// that moves a live window to its new group, and the overlay badges used to
// be COM calls through js-ctypes, which made the Zotero Plugins Atlas grade
// Weavero "Use with care". They now go through nsIWinTaskbar
// (setGroupIdForWindow, the window's nsITaskbarWindowPreview, its
// nsITaskbarOverlayIconController). Real calls where the runner can read the
// result back (the window's id), a stand-in service where it cannot (an
// overlay has no getter; a re-added button has none either), then the real
// call once more for its errors. Written with the code (test/native-calls.spec.js
// holds the source contract).

describe("Weavero — the Windows taskbar through Gecko's services", function () {
    this.timeout(60000);
    let wv, win, tb;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWinTaskbar", "_wvWinUIUtils", "_wvTaskbarPreview", "_wvSetWindowAUMID", "_wvRefreshTaskbarButton",
            "_wvSetTaskbarOverlay", "_wvOvApplyImageAs", "_wvWinIconImage", "_wvOvDragLive", "_wvOvNoteMove"]) wvT.method(m);
        win = Zotero.getMainWindow();
        tb = wv._wvWinTaskbar();
    });

    /** Run `fn` with a stand-in taskbar service, and give the window its own
     *  preview anchor back after (a real one is never dropped: Gecko keeps a
     *  window's preview weakly and its end removes the window's button). */
    async function withStandIn(fake, fn) {
        const had = Object.prototype.hasOwnProperty.call(win, "_wvOvTaskbar"), prev = win._wvOvTaskbar;
        wv._wvWinTaskbar = () => fake;
        try { await fn(); }
        finally {
            delete wv._wvWinTaskbar;
            if (had) win._wvOvTaskbar = prev; else delete win._wvOvTaskbar;
        }
    }

    it("Gecko's taskbar and window-icon services carry every member Weavero calls (Windows)", function () {
        if (!Zotero.isWin) this.skip();   // platform: Windows services
        assert.isOk(tb, "nsIWinTaskbar, available");
        for (const m of ["setGroupIdForWindow", "getGroupIdForWindow", "getTaskbarWindowPreview", "getOverlayIconController"]) {
            assert.isFunction(tb[m], "nsIWinTaskbar." + m);
        }
        assert.isAbove(String(tb.defaultGroupId || "").length, 0, "the app's own AppUserModelID");
        const ui = wv._wvWinUIUtils();
        assert.isOk(ui, "nsIWindowsUIUtils");
        for (const m of ["setWindowIcon", "setWindowIconFromExe", "setWindowIconNoData"]) assert.isFunction(ui[m], "nsIWindowsUIUtils." + m);
    });

    it("a window's AppUserModelID is set through setGroupIdForWindow and cleared back to the app's own (Windows)", function () {
        if (!Zotero.isWin) this.skip();   // platform: Windows taskbar ids
        const app = String(tb.defaultGroupId);
        const native = String(tb.getGroupIdForWindow(win));
        Zotero.debug("[wv-test] window AppUserModelID at start: '" + native + "', the app's: '" + app + "'");
        try {
            // Firefox 140 and later create every window with the app's id (nsWindow::Create).
            assert.strictEqual(native, app, "a Zotero window starts with the app's own id");
            assert.isTrue(wv._wvSetWindowAUMID(win, "Weavero.Spec.1"), "set");
            assert.strictEqual(String(tb.getGroupIdForWindow(win)), "Weavero.Spec.1", "the window carries Weavero's id");
            assert.isTrue(wv._wvSetWindowAUMID(win, null), "cleared");
            assert.strictEqual(String(tb.getGroupIdForWindow(win)), app, "back to the app's own id");
        }
        finally { try { tb.setGroupIdForWindow(win, native || app); } catch (e) {} }
    });

    it("a window's taskbar button is added again through its Gecko preview: hidden, then shown (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: Windows taskbar buttons
        const calls = [];
        const preview = { v: true, get visible() { return this.v; }, set visible(x) { calls.push("visible=" + x); this.v = x; } };
        await withStandIn({ getTaskbarWindowPreview: (ds) => { calls.push("preview of " + (ds ? "a docShell" : "nothing")); return preview; } }, async () => {
            assert.isTrue(wv._wvRefreshTaskbarButton(win));
            assert.deepEqual(calls, ["preview of a docShell", "visible=false", "visible=true"], "DeleteTab, then AddTab");
            assert.strictEqual(win._wvOvTaskbar, preview, "the preview is anchored on its window");
        });
        // The real one: Gecko re-applies the window's taskbar properties before
        // its AddTab, and a failure there would leave the window without a
        // button -- the call must go through.
        assert.isTrue(wv._wvRefreshTaskbarButton(win), "the real preview hid and showed the button");
        const real = tb.getTaskbarWindowPreview(win.docShell);
        assert.isTrue(real.visible, "the window's preview is visible again");
        assert.isOk(win._wvOvTaskbar, "anchored");
    });

    it("the overlay badge goes through the window's Gecko overlay controller; a clear on a window without one makes none (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: Windows taskbar overlay
        const img = await wv._wvWinIconImage("ov-main-1");
        assert.isOk(img, "the bundled badge decoded");
        img.QueryInterface(Ci.imgIContainer);
        assert.isAbove(img.width, 0, "an image with a size");
        // The controller first asks whether the image is animated, which an
        // image answers only after a full decode (NS_ERROR_NOT_AVAILABLE before):
        // every real set failed on that until _wvWinIconImage decoded it.
        assert.isFalse(img.animated, "decoded in full, not animated");
        const calls = [];
        const preview = {
            QueryInterface() { return this; },
            setOverlayIcon(i, d) { calls.push([i ? "image" : null, d]); },
        };
        await withStandIn({ getTaskbarWindowPreview: () => { calls.push("preview"); return preview; } }, async () => {
            delete win._wvOvTaskbar;
            assert.isTrue(wv._wvSetTaskbarOverlay(win, null), "nothing to clear");
            assert.deepEqual(calls, [], "no preview made for a clear");
            assert.isTrue(wv._wvSetTaskbarOverlay(win, img, "Window 1"));
            assert.deepEqual(calls, ["preview", ["image", "Window 1"]], "the image and its description");
            assert.isTrue(wv._wvSetTaskbarOverlay(win, null));
            assert.deepEqual(calls.slice(2), ["preview", [null, ""]], "cleared through the same controller");
            calls.length = 0;
            const had = win._wvOverlayName;
            try {
                assert.isTrue(await wv._wvOvApplyImageAs(win, "ov-main-2", "Window 2"), "the badge setter's last step");
                assert.deepEqual(calls, ["preview", ["image", "Window 2"]]);
                assert.strictEqual(win._wvOverlayName, "ov-main-2");
            }
            finally { if (had === undefined) delete win._wvOverlayName; else win._wvOverlayName = had; }
        });
        // The real controller takes the image and the clear.
        assert.isTrue(wv._wvSetTaskbarOverlay(win, img, "spec"), "set through Gecko");
        assert.isTrue(wv._wvSetTaskbarOverlay(win, null), "cleared through Gecko");
        assert.isOk(win._wvOvTaskbar, "the real preview stays anchored on its window");
    });

    it("a window drag is read from the window's own moves: live while its place changes, ended 300 ms after", async function () {
        wv._wvOvNoteMove(win);
        assert.isTrue(wv._wvOvDragLive(win), "just moved");
        await wvT.sleep(400);
        assert.isFalse(wv._wvOvDragLive(win), "still for 400 ms: ended");
        assert.isTrue(wv._wvOvDragLive(win, 1000), "the settle check's longer window");
        assert.isFalse(wv._wvOvDragLive({}), "a window that never moved");
    });
});
