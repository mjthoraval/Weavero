/* global describe, it, before, after, assert, Zotero, wvT, IOUtils, PathUtils */

// What Weavero writes about the user's library without being asked, and what
// it fetches without a click (security review 2026-11-22):
// - the restore/quit trace file is a diagnostics file: written only with the
//   developer setting `weavero.devBootTrace` on, as the boot-groups trace is;
// - the trace, the tab-group move log and the reference cards' log name no
//   window title (an item's title), group name or PDF link text;
// - the lookup engines' icons: startup only re-points a moved icon file; a
//   download of a lost one waits for the Locate menu to be opened.

describe("Weavero — no library text in logs, no download without a click", function () {
    this.timeout(30000);
    let wv;
    const tag = "wvtest-" + Date.now();
    const file = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "trace-" + tag + ".json");

    before(() => {
        wv = wvT.plugin();
        for (const m of ["_wvTrace", "_wvTraceFlush", "_wvRepairLocateIcons"]) wvT.method(m);
    });
    after(async () => { try { await IOUtils.remove(file()); } catch (e) {} });

    it("the trace file is written only with the developer setting on", async () => {
        wv._wvTrace("WV-TEST entry");
        await wvT.withPref("weavero.devBootTrace", false, async () => {
            wv._wvTraceFlush(tag);
            await wvT.sleep(600);
            assert.isFalse(await IOUtils.exists(file()), "nothing written by default");
        });
        await wvT.withPref("weavero.devBootTrace", true, async () => {
            wv._wvTraceFlush(tag);
            // The write is queued (lib/store.ts): poll the file itself.
            let ok = false;
            for (let i = 0; i < 50 && !ok; i++) { ok = await IOUtils.exists(file()); if (!ok) await wvT.sleep(100); }
            assert.isTrue(ok, "written when asked for");
        });
    });

    it("the traces and logs name no title, group name or link text (source contracts)", () => {
        for (const m of ["_wvBgRestoreStart", "_wvFocusShepherdStart", "_wvRestoreFocusedWindow"]) {
            assert.notInclude(wvT.src(m), "document.title", m + ": no window title in the trace");
        }
        assert.notMatch(wvT.src("_wvTabGroupMoveToNewWindow"), /name=\\?"\s*\+\s*\(?g\.name/, "no group name in the move log");
        assert.notMatch(wvT.src("_wvRefsCardSwap"), /found\.text\s*\+/, "no PDF link text in the cards' log");
    });

    it("startup never downloads an engine icon; the Locate menu's first opening does", async function () {
        const LM = /** @type {any} */ (Zotero).LocateManager;
        let engines = [];
        try { engines = LM.getEngines(); } catch (e) { engines = []; }
        const e = engines.find((x) => /^file:/.test(String(x.icon || "")) && typeof x._updateIcon === "function");
        assert.isOk(e, "an engine with a cached icon file (Zotero's defaults carry them)");
        const icon = e.icon, upd = e._updateIcon, src = e._iconSourceURI;
        let downloads = 0;
        e._iconSourceURI = src || "https://example.invalid/icon.ico";
        e._updateIcon = async function () { downloads++; };
        try {
            e.icon = PathUtils.toFileURI(PathUtils.join(Zotero.DataDirectory.dir, "locate", "wv-gone-" + Date.now() + ".ico"));
            await wv._wvRepairLocateIcons(false);
            assert.strictEqual(downloads, 0, "the startup repair fetched nothing");
            wvT.method("_wvLocateIconsFirstUse");
            await wv._wvLocateIconsFirstUse(true);
            assert.strictEqual(downloads, 1, "the first use fetches the lost icon");
            await wv._wvLocateIconsFirstUse();
            assert.strictEqual(downloads, 1, "once a session");
        }
        finally {
            e._updateIcon = upd;
            e._iconSourceURI = src;
            e.icon = icon;
        }
    });
});
