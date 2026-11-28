/* global describe, it, before, assert, Zotero, PathUtils, IOUtils, ChromeUtils, Ci, Services */

// Per-window taskbar icons. Since 2026-11-27 Weavero sets a window's icons
// through Gecko (nsIWindowsUIUtils.setWindowIcon, a decoded imgIContainer)
// and gives Zotero's own back with setWindowIconFromExe, where it used user32
// through js-ctypes (LoadImageW on .ico files extracted to the data
// directory, WM_SETICON, DestroyIcon) -- the Zotero Plugins Atlas's "Loads
// native code". Older guards kept: each recolour must free the icons it
// replaces (it leaked two HICONs per recolour before 2026-10-06), and the
// restore must give back the icon the window was created with. The spec
// reads the window's icons through user32 itself: specs do not ship.

describe("Weavero — per-window taskbar icons", function () {
    this.timeout(30000);
    let wv, dir;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWinIconImage", "_wvSetWindowIconImage", "_wvRestoreWindowIcon", "_wvRefreshWindowIcons"]) wvT.method(m);
        dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "win-icons");
    });

    it("an icon is decoded from the bundled file in memory, once per instance, with nothing extracted to disk", async () => {
        const a = await wv._wvWinIconImage("main-3");
        assert.isOk(a, "decoded");
        a.QueryInterface(Ci.imgIContainer);
        assert.isAbove(a.width, 0, "an image with a size");
        assert.strictEqual(await wv._wvWinIconImage("main-3"), a, "the same image the second time");
        assert.isNull(await wv._wvWinIconImage("no-such-icon"), "a missing icon is no image");
        assert.isFalse(await IOUtils.exists(PathUtils.join(dir, "main-3.ico")), "no extracted copy");
    });

    it("recolouring a window frees the icons it replaces, and the restore gives back Zotero's own icon (Windows)", async function () {
        if (!Zotero.isWin) this.skip();   // platform: Windows window icons
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        const user32 = ctypes.open("user32.dll");
        const kernel32 = ctypes.open("kernel32.dll");
        const win = Zotero.getMainWindow();
        try {
            const GetCurrentProcess = kernel32.declare("GetCurrentProcess", ctypes.winapi_abi, ctypes.voidptr_t);
            const GetModuleHandleW = kernel32.declare("GetModuleHandleW", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t);
            const GetGuiResources = user32.declare("GetGuiResources", ctypes.winapi_abi, ctypes.uint32_t,
                ctypes.voidptr_t, ctypes.uint32_t);
            const SendMessageW = user32.declare("SendMessageW", ctypes.winapi_abi, ctypes.intptr_t,
                ctypes.voidptr_t, ctypes.uint32_t, ctypes.uintptr_t, ctypes.intptr_t);
            const LoadIconW = user32.declare("LoadIconW", ctypes.winapi_abi, ctypes.voidptr_t, ctypes.voidptr_t, ctypes.voidptr_t);
            const userObjects = () => GetGuiResources(GetCurrentProcess(), 1);   // GR_USEROBJECTS
            const bw = win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIBaseWindow);
            const hwnd = ctypes.voidptr_t(ctypes.UInt64(bw.nativeHandle));
            const icon = (big) => String(SendMessageW(hwnd, 0x007F, big ? 1 : 0, 0));   // WM_GETICON
            // IDI_APPICON: the icon Gecko gives every window it creates (Firefox 140+).
            const appIcon = String(ctypes.cast(LoadIconW(GetModuleHandleW(null), ctypes.voidptr_t(1)), ctypes.uintptr_t).value);
            const startIcon = icon(true);
            const weaveroIcon = !!win._wvWinIconName;
            Zotero.debug("[wv-test] window icon at start " + startIcon + ", Zotero's " + appIcon + (weaveroIcon ? " (Weavero's icon on)" : ""));
            assert.notStrictEqual(appIcon, "0", "the executable's IDI_APPICON");
            const a = await wv._wvWinIconImage("main-1"), b = await wv._wvWinIconImage("main-2");
            assert.isTrue(wv._wvSetWindowIconImage(win, a), "first icon set");
            assert.notStrictEqual(icon(true), appIcon, "the window shows Weavero's icon");
            assert.notStrictEqual(icon(false), appIcon, "both sizes");
            const base = userObjects();
            for (let i = 0; i < 10; i++) wv._wvSetWindowIconImage(win, i % 2 ? a : b);
            const grown = userObjects() - base;
            assert.isAtMost(grown, 2, "ten recolours leave no handles behind (each leaked two before)");
            win._wvWinIconName = "main-2";   // what _wvApplyWindowIcon records
            wv._wvRestoreWindowIcon(win);
            assert.strictEqual(icon(true), appIcon, "Zotero's own icon, large");
            assert.strictEqual(icon(false), appIcon, "and small");
            assert.notOk(win._wvWinIconName, "no Weavero icon recorded");
            if (!weaveroIcon) assert.strictEqual(startIcon, appIcon, "the icon the window was created with");
        }
        finally {
            user32.close(); kernel32.close();
            try { wv._wvRefreshWindowIcons(); } catch (e) {}   // back to what the plugin shows
        }
    });
});
