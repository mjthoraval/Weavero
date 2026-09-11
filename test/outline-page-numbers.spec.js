/* global describe, it, before, after, assert, Zotero */

// Outline "p. N" labels (issue #42): a per-document override, persisted in
// outlines.json under `settings` (NOT inside a curated doc), wins over the
// global `weavero.outlinePageNumbers` pref; clearing the override leaves no
// record. The renderer's single gate reads `_wvOutlinePagesShown(att)`, so
// locking that resolution locks what the tab shows. The right-click menu on
// the Outline tab itself is a manual check (docs/gesture-testing.md).

describe("Weavero — outline page numbers: per-document override + global pref", () => {
    let wv, savedPref;
    const LIB = 1;
    const KEY = "WVPG" + Date.now().toString(36).toUpperCase();
    const att = { libraryID: LIB, itemKey: KEY };
    const PREF = "weavero.outlinePageNumbers";

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlinePagesShown !== "function") this.skip();
        await wv._wvOutlineInit();
        savedPref = Zotero.Prefs.get(PREF);
    });

    after(async () => {
        try { await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: undefined }); } catch (e) {}
        // The default is registered on the default branch, so `set` (never
        // `clear`) restores the pre-test state cleanly.
        try { Zotero.Prefs.set(PREF, savedPref === undefined ? true : !!savedPref); } catch (e) {}
    });

    it("shows page numbers by default: no override, pref at its default", () => {
        Zotero.Prefs.set(PREF, true);
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        assert.isTrue(wv._wvOutlinePagesShown(att));
        assert.isTrue(wv._wvOutlinePagesShown(null), "no attachment -> global");
    });

    it("the global pref hides them for every document without an override", () => {
        Zotero.Prefs.set(PREF, false);
        assert.isFalse(wv._wvOutlinePagesShown(att));
        assert.isFalse(wv._wvOutlinePagesShown(null));
        Zotero.Prefs.set(PREF, true);
    });

    it("a per-document override wins over the global pref, both ways", async () => {
        Zotero.Prefs.set(PREF, false);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: true });
        assert.isTrue(wv._wvOutlinePagesShown(att), "override ON beats global OFF");
        assert.isFalse(wv._wvOutlinePagesShown({ libraryID: LIB, itemKey: KEY + "X" }), "other documents still follow global");
        Zotero.Prefs.set(PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: false });
        assert.isFalse(wv._wvOutlinePagesShown(att), "override OFF beats global ON");
    });

    it("the override round-trips through outlines.json and never creates a curated doc", async () => {
        await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: false });
        const text = await Zotero.File.getContentsAsync(wv._wvOutlineFilePath());
        const j = JSON.parse(String(text));
        const k = wv._bmReaderKey(LIB, KEY);
        assert.isObject(j.settings, "settings map written");
        assert.strictEqual(j.settings[k].pageNumbers, false);
        assert.isUndefined((j.outlines || {})[k], "no curated doc was created");
        assert.isFalse(wv._wvOutlineHasCurated(LIB, KEY));
    });

    it("picking a state from the menu stores only departures from the default", async () => {
        Zotero.Prefs.set(PREF, true);
        assert.isTrue(await wv._wvOutlineSetPageNumbers(att, true), "the default itself");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "no record for the default");
        assert.isFalse(await wv._wvOutlineSetPageNumbers(att, false));
        assert.strictEqual(wv._wvOutlineFileSettings(LIB, KEY).pageNumbers, false);
        assert.isTrue(await wv._wvOutlineSetPageNumbers(att, true), "back to the default");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "record dropped");
        Zotero.Prefs.set(PREF, false);
        assert.isFalse(await wv._wvOutlineSetPageNumbers(att, false), "hidden is the default now");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        Zotero.Prefs.set(PREF, true);
    });

    it("the menu toggle stores only departures from the default and drops them on the way back", async () => {
        Zotero.Prefs.set(PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: undefined });
        assert.isFalse(await wv._wvOutlineTogglePageNumbers(att), "first toggle hides");
        assert.strictEqual(wv._wvOutlineFileSettings(LIB, KEY).pageNumbers, false, "departure recorded");
        assert.isTrue(await wv._wvOutlineTogglePageNumbers(att), "second toggle shows again");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "back at the default -> no record");
        Zotero.Prefs.set(PREF, false);
        assert.isTrue(await wv._wvOutlineTogglePageNumbers(att), "with the default off, the first toggle shows");
        assert.strictEqual(wv._wvOutlineFileSettings(LIB, KEY).pageNumbers, true);
        assert.isFalse(await wv._wvOutlineTogglePageNumbers(att));
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        Zotero.Prefs.set(PREF, true);
    });

    it("clearing the override falls back to the global pref and leaves no record", async () => {
        Zotero.Prefs.set(PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { pageNumbers: undefined });
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        assert.isTrue(wv._wvOutlinePagesShown(att));
        const text = await Zotero.File.getContentsAsync(wv._wvOutlineFilePath());
        const j = JSON.parse(String(text));
        const k = wv._bmReaderKey(LIB, KEY);
        assert.isUndefined(j.settings && j.settings[k], "record dropped from the file");
    });
});
