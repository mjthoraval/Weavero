/* global describe, it, before, after, assert, Zotero, wvT, Components, ChromeUtils */
// The theme watch is not left on a closed window (2026-11-13).
//
// At init Weavero follows theme changes through the most recent main
// window: its prefers-color-scheme MediaQueryList and a MutationObserver on
// its documentElement. Both belong to that window and keep it; nothing moved
// them when the window closed, so a plugin started (startup, enable, reload)
// while a second window was the most recent kept that window, closed, for
// the session -- and stopped hearing theme changes (end of a full
// 11.0-beta.4 run: plugin -> _uiThemeMq -> the closed window). Named zz-:
// it reloads the plugin.
describe("Weavero — the theme watch is not left on a closed window", function () {
    this.timeout(180000);
    const Cu = Components.utils;
    let A, addon;
    const sleep = (ms) => new Promise(r => A.setTimeout(r, ms));
    async function collect() {
        for (let i = 0; i < 6; i++) { Cu.forceGC(); Cu.forceCC(); try { Cu.forceShrinkingGC(); } catch (e) {} await sleep(250); }
    }
    async function settle() { await sleep(1500); await collect(); await sleep(2500); await collect(); }
    async function detachedMain() {
        const mm = Components.classes["@mozilla.org/memory-reporter-manager;1"].getService(Components.interfaces.nsIMemoryReporterManager);
        let n = 0;
        await new Promise((resolve) => {
            mm.getReports((process, path) => {
                if (process) return;
                if (/^explicit\/window-objects\/.*detached\/window\([^)]*zoteroPane\.xhtml\)/.test(path) && /\/dom\/element-nodes$/.test(path)) n++;
            }, null, () => resolve(true), null, false);
        });
        return n;
    }
    async function reload() {
        /** @type {any} */ (Zotero)._weaveroReady = false;
        await addon.reload();
        for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "Weavero is back after the reload");
        await sleep(4000);
    }

    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        A = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        addon = await AddonManager.getAddonByID("weavero@mjthoraval");
    });

    it("a plugin started while a second window was the most recent moves its theme watch off that window when it closes", async function () {
        let B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await sleep(2000);
        try { B.focus(); } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindow() === B || null, 5000);
        assert.strictEqual(Zotero.getMainWindow(), B, "precondition: the second window is the most recent one");
        await reload();
        const wv = wvT.plugin();
        /** The window the plugin's theme objects belong to: closed or not. */
        const owners = () => ["_uiThemeMq", "_uiThemeObserver"].map((k) => {
            const o = wv[k];
            if (!o) return k + ":none";
            let g = null;
            try { g = Cu.getGlobalForObject(o); } catch (e) {}
            let closed = null;
            try { closed = !!(g && g.closed); } catch (e) { closed = "dead"; }
            return k + ":" + (closed === true ? "CLOSED window" : closed === "dead" ? "dead" : "open window");
        });
        const before = owners();
        B._wvSavedParkClose = true;
        B.close();
        await wvT.waitFor(() => B.closed && Zotero.getMainWindows().length === 1, 10000);
        B = null;
        try {
            const S = /** @type {any} */ (Zotero).Session;
            const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
            if (last && last.window) S.takeLastClosed();
        }
        catch (e) {}
        await sleep(1500);
        const after = owners();
        assert.notInclude(after.join(" "), "CLOSED", "the theme watch holds the closed window (before the close: " + before.join(", ") + "; after: " + after.join(", ") + ")");
        assert.notInclude(after.join(" "), "none", "the theme watch went altogether while a main window is open: " + after.join(", "));
    });
});
