/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06: `_wvApplyLegacyChoice("import")` meant to keep the
// run-once offer when an import FOUND picks but WROTE none (read-only
// library, DB error) -- but `res.found` was never copied from the import
// result, so the guard could never fire and the offer was spent anyway.

describe("Weavero — default attachment: a failed legacy import keeps the offer", () => {
    let wv;
    const KEYS = ["weavero.defaultChildMigrated", "weavero.defaultChildLegacyChoice", "weavero.defaultChildLegacyPending"];
    const saved = {};
    let ownImport, origImport;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvApplyLegacyChoice);
        for (const k of KEYS) saved[k] = Zotero.Prefs.get(k);
        ownImport = Object.prototype.hasOwnProperty.call(wv, "_wvImportLegacyMappings");
        origImport = wv._wvImportLegacyMappings;
    });

    after(() => {
        if (!wv) return;
        if (ownImport) wv._wvImportLegacyMappings = origImport; else delete wv._wvImportLegacyMappings;
        for (const k of KEYS) {
            try { if (saved[k] === undefined) Zotero.Prefs.clear(k); else Zotero.Prefs.set(k, saved[k]); } catch (_) {}
        }
    });

    it("picks found but none written: the run-once guard is NOT spent", async () => {
        wv._wvImportLegacyMappings = async () => ({ found: 3, migrated: 0, superseded: 0, unresolved: 3 });
        Zotero.Prefs.set("weavero.defaultChildMigrated", false);
        const res = await wv._wvApplyLegacyChoice("import");
        assert.equal(res.found, 3, "the result carries what the import found");
        assert.notEqual(Zotero.Prefs.get("weavero.defaultChildMigrated"), true, "the offer comes back next time");
    });

    it("picks found and written: the guard is spent", async () => {
        wv._wvImportLegacyMappings = async () => ({ found: 3, migrated: 3, superseded: 0, unresolved: 0 });
        Zotero.Prefs.set("weavero.defaultChildMigrated", false);
        await wv._wvApplyLegacyChoice("import");
        assert.isTrue(Zotero.Prefs.get("weavero.defaultChildMigrated"));
    });
});
