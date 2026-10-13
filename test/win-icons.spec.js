/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, ChromeUtils, Ci */

// Per-window taskbar icons (survey 2026-10-06, smaller bugs):
//   * the extracted .ico files were stamped with ONE shared VERSION file,
//     so after an upgrade only the first icon extracted was refreshed and
//     every other kept its old artwork;
//   * each recolour loaded two new HICONs and never freed the two it
//     replaced (a USER-object leak per recolour).

describe("Weavero — per-window taskbar icon files and handles", function () {
    this.timeout(30000);
    let wv, dir;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWinIconFile", "_wvSetWindowIconFromFile", "_wvRestoreWindowIcon"]) wvT.method(m);
        dir = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "win-icons");
    });

    it("an icon left from an older version is re-extracted even when another icon is already current", async () => {
        const name = "main-3";
        const path = PathUtils.join(dir, name + ".ico");
        await IOUtils.makeDirectory(dir, { ignoreExisting: true, createAncestors: true });
        // An old main-3.ico, while this version's stamp is already written
        // (by another icon extracted first after the upgrade).
        await IOUtils.write(path, new Uint8Array([1, 2, 3, 4]));
        await IOUtils.writeUTF8(PathUtils.join(dir, "VERSION"), String(wv._version));
        try { await IOUtils.remove(PathUtils.join(dir, name + ".version")); } catch (_) {}
        const got = await wv._wvWinIconFile(name);
        assert.strictEqual(got, path);
        const bundled = new Uint8Array(await (await fetch(wv._rootURI + "icons/win/" + name + ".ico")).arrayBuffer());
        const onDisk = await IOUtils.read(path);
        assert.strictEqual(onDisk.length, bundled.length, "the file is the bundled icon again");
        assert.deepEqual([...onDisk.slice(0, 16)], [...bundled.slice(0, 16)]);
    });

    it("recolouring a window frees the icons it replaces (Windows)", async function () {
        if (!Zotero.isWin) this.skip();
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        const user32 = ctypes.open("user32.dll");
        const kernel32 = ctypes.open("kernel32.dll");
        try {
            const GetCurrentProcess = kernel32.declare("GetCurrentProcess", ctypes.winapi_abi, ctypes.voidptr_t);
            const GetGuiResources = user32.declare("GetGuiResources", ctypes.winapi_abi, ctypes.uint32_t,
                ctypes.voidptr_t, ctypes.uint32_t);
            const userObjects = () => GetGuiResources(GetCurrentProcess(), 1);   // GR_USEROBJECTS
            const win = Zotero.getMainWindow();
            const a = await wv._wvWinIconFile("main-1"), b = await wv._wvWinIconFile("main-2");
            assert.isOk(wv._wvSetWindowIconFromFile(win, a), "first icon set");
            const base = userObjects();
            for (let i = 0; i < 10; i++) wv._wvSetWindowIconFromFile(win, i % 2 ? a : b);
            const grown = userObjects() - base;
            wv._wvRestoreWindowIcon(win);
            assert.isAtMost(grown, 2, "ten recolours leave no handles behind (each leaked two before)");
        } finally { user32.close(); kernel32.close(); }
    });
});
