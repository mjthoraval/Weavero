/* global describe, it, before, after, assert, Zotero */

// Bookmarks-tab "p. N" labels: the Outline tab's rule, applied to the reader's
// Bookmarks tab (MJT, 2026-09-18). A per-document override wins over the
// global `weavero.bookmarkPageNumbers` pref; only DEPARTURES are stored, so
// "use the global setting" leaves no record. The override shares the
// per-document reader-panel settings bag in outlines.json under its OWN key
// (`bmPageNumbers`), so the two tabs never move each other -- that
// independence is the part worth locking. The right-click menu on the tab
// itself is a manual check (docs/gesture-testing.md).

describe("Weavero — bookmark page numbers: per-document override + global pref", () => {
    let wv, savedPref, savedOutlinePref;
    const LIB = 1;
    const KEY = "WVBP" + Date.now().toString(36).toUpperCase();
    const att = { libraryID: LIB, itemKey: KEY };
    const PREF = "weavero.bookmarkPageNumbers";
    const OUTLINE_PREF = "weavero.outlinePageNumbers";

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvBmPagesShown !== "function") this.skip();
        await wv._wvOutlineInit();
        savedPref = Zotero.Prefs.get(PREF);
        savedOutlinePref = Zotero.Prefs.get(OUTLINE_PREF);
    });

    after(async () => {
        try { await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: undefined, pageNumbers: undefined }); } catch (e) {}
        // Both defaults are registered on the default branch, so `set` (never
        // `clear`) restores the pre-test state cleanly.
        try { Zotero.Prefs.set(PREF, savedPref === undefined ? true : !!savedPref); } catch (e) {}
        try { Zotero.Prefs.set(OUTLINE_PREF, savedOutlinePref === undefined ? true : !!savedOutlinePref); } catch (e) {}
    });

    it("shows page numbers by default: no override, pref at its default", () => {
        Zotero.Prefs.set(PREF, true);
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        assert.isTrue(wv._wvBmPagesShown(att));
        assert.isTrue(wv._wvBmPagesShown(null), "no attachment -> global");
    });

    it("the global pref hides them for every document without an override", () => {
        Zotero.Prefs.set(PREF, false);
        assert.isFalse(wv._wvBmPagesShown(att));
        assert.isFalse(wv._wvBmPagesShown(null));
        Zotero.Prefs.set(PREF, true);
    });

    it("a per-document override wins over the global pref, both ways", async () => {
        Zotero.Prefs.set(PREF, false);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: true });
        assert.isTrue(wv._wvBmPagesShown(att), "override ON beats global OFF");
        assert.isFalse(wv._wvBmPagesShown({ libraryID: LIB, itemKey: KEY + "X" }),
            "other documents still follow global");
        Zotero.Prefs.set(PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: false });
        assert.isFalse(wv._wvBmPagesShown(att), "override OFF beats global ON");
    });

    it("the two tabs never move each other", async () => {
        Zotero.Prefs.set(PREF, true);
        Zotero.Prefs.set(OUTLINE_PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: undefined, pageNumbers: undefined });

        // One document, one bag, two independent keys.
        await wv._wvBmSetPageNumbers(att, false);
        assert.isFalse(wv._wvBmPagesShown(att), "bookmarks hidden here");
        assert.isTrue(wv._wvOutlinePagesShown(att), "the outline is untouched");
        await wv._wvOutlineSetPageNumbers(att, false);
        assert.isFalse(wv._wvOutlinePagesShown(att));
        assert.isFalse(wv._wvBmPagesShown(att), "and the bookmarks override survived it");
        await wv._wvOutlineSetPageNumbers(att, true);
        assert.isFalse(wv._wvBmPagesShown(att), "clearing the outline's record keeps the bookmarks one");

        // The global prefs are separate too.
        Zotero.Prefs.set(OUTLINE_PREF, false);
        assert.isTrue(wv._wvBmPagesShown(null), "the outline pref does not reach the bookmarks default");
        Zotero.Prefs.set(OUTLINE_PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: undefined });
    });

    it("picking a state stores only departures from the default", async () => {
        Zotero.Prefs.set(PREF, true);
        assert.isTrue(await wv._wvBmSetPageNumbers(att, true), "the default itself");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "no record for the default");
        assert.isFalse(await wv._wvBmSetPageNumbers(att, false));
        assert.strictEqual(wv._wvOutlineFileSettings(LIB, KEY).bmPageNumbers, false);
        assert.isTrue(await wv._wvBmSetPageNumbers(att, true), "back to the default");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "record dropped");
        Zotero.Prefs.set(PREF, false);
        assert.isFalse(await wv._wvBmSetPageNumbers(att, false), "hidden is the default now");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY));
        Zotero.Prefs.set(PREF, true);
    });

    it("the toggle records a departure and drops it on the way back", async () => {
        Zotero.Prefs.set(PREF, true);
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: undefined });
        assert.isFalse(await wv._wvBmTogglePageNumbers(att), "first toggle hides");
        assert.strictEqual(wv._wvOutlineFileSettings(LIB, KEY).bmPageNumbers, false, "departure recorded");
        assert.isTrue(await wv._wvBmTogglePageNumbers(att), "second toggle shows again");
        assert.isNull(wv._wvOutlineFileSettings(LIB, KEY), "back at the default -> no record");
    });

    it("the override round-trips through outlines.json and creates no curated doc", async () => {
        Zotero.Prefs.set(PREF, true);
        await wv._wvBmSetPageNumbers(att, false);
        const text = await Zotero.File.getContentsAsync(wv._wvOutlineFilePath());
        const j = JSON.parse(String(text));
        const k = wv._bmReaderKey(LIB, KEY);
        assert.isObject(j.settings, "settings map written");
        assert.strictEqual(j.settings[k].bmPageNumbers, false);
        assert.isUndefined((j.outlines || {})[k], "no curated outline was created");
        await wv._wvOutlineSetFileSettings(LIB, KEY, { bmPageNumbers: undefined });
        const text2 = await Zotero.File.getContentsAsync(wv._wvOutlineFilePath());
        const j2 = JSON.parse(String(text2));
        assert.isUndefined(j2.settings && j2.settings[k], "record dropped from the file");
    });
});
