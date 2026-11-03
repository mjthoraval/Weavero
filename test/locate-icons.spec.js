/* global describe, it, before, after, assert, Zotero, wvT, IOUtils, PathUtils, Services, Ci */

// WV-TEMP-134355 (upstream register #16; MJT 2026-10-26: "Can you fix the
// Google Scholar problem in Weavero, keeping in mind to check regularly if
// this was fixed in Zotero?"). Zotero stores a lookup engine's icon as an
// ABSOLUTE file: URI in <data dir>/locate/engines.json and never checks it
// again: once the data directory is renamed, moved or copied, the Locate
// menu's icon points nowhere (blank on Zotero 10, a square on Zotero 11).
// Weavero repairs such paths at startup. The first test is the tripwire:
// Zotero, reading a dead path back from engines.json, keeps it -- it fails
// once Zotero repairs or avoids the path itself; then retire the workaround.

describe("Weavero — lookup engine icons survive a moved data directory (WV-TEMP-134355)", function () {
    this.timeout(30000);
    let wv, LM, locateDir, jsonFile, origIcon, fileName;
    const extra = [];

    const pathOf = (url) => { try { return Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file.path; } catch (e) { return null; } };
    const exists = async (url) => { const p = pathOf(url); return !!p && await IOUtils.exists(p); };
    const engine = () => LM.getEngines().find((e) => /^file:/.test(String(e.icon || "")));
    /** Set the icon, wait until Zotero has written engines.json (a 0-ms
     *  timer), then make Zotero read the file back as at startup. */
    const storeAndReload = async (url) => {
        engine().icon = url;
        for (let i = 0; i < 60; i++) {
            const s = String(await Zotero.File.getContentsAsync(jsonFile));
            if (s.includes(url)) break;
            await wvT.sleep(50);
        }
        await LM.init();
    };

    before(async function () {
        wv = wvT.plugin();
        wvT.method("_wvRepairLocateIcons");
        LM = /** @type {any} */ (Zotero).LocateManager;
        locateDir = PathUtils.join(Zotero.DataDirectory.dir, "locate");
        jsonFile = PathUtils.join(locateDir, "engines.json");
        const e = engine();
        if (!e) this.skip();   // no engine with a cached icon file in this profile
        origIcon = e.icon;
        fileName = PathUtils.filename(pathOf(origIcon));
        assert.isTrue(await exists(origIcon), "the profile's own icon file is there to begin with");
    });

    after(async function () {
        if (!origIcon) return;
        await storeAndReload(origIcon);
        for (const p of extra) { try { await IOUtils.remove(p); } catch (e) {} }
    });

    it("Zotero keeps a dead icon path it reads back from engines.json (tripwire: fails once Zotero fixes it -- retire WV-TEMP-134355)", async function () {
        const dead = PathUtils.toFileURI(PathUtils.join(Zotero.DataDirectory.dir + "-moved-away", "locate", fileName));
        await storeAndReload(dead);
        assert.isFalse(await exists(dead), "the old folder is gone");
        assert.strictEqual(engine().icon, dead,
            "Zotero still keeps the dead path (if this fails, Zotero fixed it: retire the workaround)");
    });

    it("an icon left in the old folder points at the same file in the current one", async function () {
        const dead = PathUtils.toFileURI(PathUtils.join(Zotero.DataDirectory.dir + "-moved-away", "locate", fileName));
        await storeAndReload(dead);
        const n = await wv._wvRepairLocateIcons();
        assert.strictEqual(n, 1, "one engine repaired");
        const fixed = PathUtils.toFileURI(PathUtils.join(locateDir, fileName));
        assert.strictEqual(engine().icon, fixed);
        assert.isTrue(await exists(engine().icon), "the icon loads again");
        // Written back, so the repair holds without Weavero.
        await LM.init();
        assert.strictEqual(engine().icon, fixed, "engines.json carries the repaired path");
    });

    it("an icon with no copy in the current folder is downloaded again from its source", async function () {
        const e0 = engine();
        if (typeof e0._iconSourceURI !== "string" || !e0._iconSourceURI) this.skip();
        const gone = PathUtils.toFileURI(PathUtils.join(locateDir, "wv-gone-" + fileName));
        await storeAndReload(gone);
        const n = await wv._wvRepairLocateIcons();
        assert.strictEqual(n, 1, "one engine repaired");
        const now = engine().icon;
        if (now !== origIcon && pathOf(now)) extra.push(pathOf(now));
        assert.notStrictEqual(now, gone);
        assert.isTrue(await exists(now), "a fresh copy in the current folder");
        assert.strictEqual(PathUtils.parent(pathOf(now)), locateDir);
    });

    it("an engine whose icon loads is left alone", async function () {
        await storeAndReload(origIcon);
        assert.strictEqual(await wv._wvRepairLocateIcons(), 0);
        assert.strictEqual(engine().icon, origIcon);
    });
});
