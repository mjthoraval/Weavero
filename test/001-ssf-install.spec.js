/* global describe, it, before, assert, Zotero, Services, ChromeUtils, wvT */

// Installs the third-party plugin "Saved Search Folders" (the reviewed XPI in WV_SSF_XPI) at the
// start of a targeted run, so the specs after it run with the plugin patching the collections
// tree (test/zz-ssf-coexist.spec.js has the method; MJT 2026-11-26). It stays installed for the
// rest of the run: the runner's temp profile is thrown away afterwards. Without WV_SSF_XPI it
// stands down (allowlisted: "plugin compat").

describe("Weavero — plugin compat: Saved Search Folders installed for this run (real XPI)", function () {
    this.timeout(60000);
    const SSF_ID = "saved-search-folders@nickynoname.github.io";
    let addon = null;

    before(async function () {
        let xpi = "";
        try { xpi = Services.env.exists("WV_SSF_XPI") ? Services.env.get("WV_SSF_XPI") : ""; } catch (e) {}
        if (!xpi) this.skip();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID(SSF_ID);
        if (!addon) {
            // pathToFile refuses a forward-slash path on Windows ("Unexpected path value").
            const install = await AddonManager.getInstallForFile(Zotero.File.pathToFile(xpi.replace(/\//g, "\\")));
            await install.install();
            addon = await AddonManager.getAddonByID(SSF_ID);
        }
        // The plugin refuses this Zotero (its range is 10.*): nothing installed, a reason to stand down.
        if (!addon || !addon.isActive) this.skip();
        const win = /** @type {any} */ (Zotero.getMainWindow());
        const Z = /** @type {any} */ (Zotero);
        await wvT.waitFor(() => { const s = Z.SavedSearchFolders; const st = s && s._windows && s._windows.get(win); return !!(st && st.cv); }, 30000);
        await wvT.sleep(2000);
    });

    it("the plugin is active and has patched the window's collections tree", function () {
        const Z = /** @type {any} */ (Zotero);
        const win = Zotero.getMainWindow();
        assert.isTrue(!!addon && addon.isActive, "active");
        const st = Z.SavedSearchFolders && Z.SavedSearchFolders._windows.get(win);
        assert.isOk(st && st.cv, "patched the main window's tree");
        try { Zotero.debug("[wv-test] Saved Search Folders " + addon.version + " installed for this run"); } catch (e) {}
    });
});
