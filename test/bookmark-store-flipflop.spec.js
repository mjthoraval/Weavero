/* global describe, it, before, after, assert, Zotero */

// The reader-bookmark store flip-flopped at load on the dev profile
// (2026-10-13): between two loads, seven annotation bookmarks of a
// group-library PDF moved from This Document to Elsewhere (out of their
// folders), and a page bookmark read "Page 12" instead of the printed
// "Page 568"; the next load wrote both back. Two writers, each deciding from
// state that is not there yet:
//  - the section repair (`_bmMigrateSectionPlacement`) read an item lookup
//    that THROWS -- a group library's items are not loaded at Zotero startup
//    -- as "global";
//  - the label sync (`_bmReaderSyncLabels`) fell back to the stored
//    capture-time page label when no reader (or no page-label table) was
//    there, and persisted it.
// Throw-away keys in the runner's own store, removed again.

describe("Weavero — the reader-bookmark store never flip-flops on state that is not loaded yet", () => {
    let wv;
    const keys = [];
    const ownStubs = [];

    const stubPlugin = (name, fn) => {
        const own = Object.prototype.hasOwnProperty.call(wv, name);
        ownStubs.push({ name, own, orig: wv[name] });
        wv[name] = fn;
    };
    const unstubPlugin = () => {
        for (const s of ownStubs.splice(0).reverse()) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; }
    };

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        for (const m of ["_bmInit", "_bmReaderStore", "_bmMigrateSectionPlacement", "_bmReaderSyncLabels"]) wvT.method(m);
        await wv._bmInit();
    });

    after(async () => {
        unstubPlugin();
        if (!wv) return;
        const store = wv._bmReaderStore();
        for (const k of keys) delete store[k];
        await wv._bmPersistSilent();
    });

    it("the section repair leaves a bookmark whose target is not loaded where it is -- folder included", () => {
        const key = "1:WVFLIPAT";
        keys.push(key);
        const store = wv._bmReaderStore();
        store[key] = {
            local: [
                { id: "wv-flipF", type: "folder", name: "F", children: [
                    { id: "wv-flipA", type: "item", libraryID: 1, itemKey: "WVFLIPAN", label: "annotation A" },
                ] },
                { id: "wv-flipB", type: "item", libraryID: 1, itemKey: "WVFLIPAM", label: "annotation B" },
                // Decidable without a lookup: a URL bookmark is always Elsewhere.
                { id: "wv-flipU", type: "url", url: "https://example.org/", label: "url" },
            ],
            global: [],
        };
        const orig = Zotero.Items.getByLibraryAndKey;
        Zotero.Items.getByLibraryAndKey = function (lib, k) {
            if (/^WVFLIP/.test(String(k))) {
                const Z = /** @type {any} */ (Zotero);
                const E = Z.Exception && Z.Exception.UnloadedDataException;
                throw E ? new E("Item " + k + " not yet loaded") : new Error("Item " + k + " not yet loaded");
            }
            return orig.apply(this, arguments);
        };
        stubPlugin("_bmPersistSilent", () => {});
        try { wv._bmMigrateSectionPlacement(); }
        finally { Zotero.Items.getByLibraryAndKey = orig; unstubPlugin(); }
        const d = store[key];
        assert.deepEqual(d.local.map(n => n.id), ["wv-flipF", "wv-flipB"], "the undecidable records stay in This Document");
        assert.deepEqual(d.local[0].children.map(n => n.id), ["wv-flipA"], "and inside their folder");
        assert.deepEqual(d.global.map(n => n.id), ["wv-flipU"], "a record that IS decidable is still repaired");
    });

    it("the label sync writes a page label only from a live source, never the stored fallback", async () => {
        const item = await wvT.createItem("book", { title: "WV flip-flop label owner" });
        const key = item.libraryID + ":" + item.key;
        keys.push(key);
        const store = wv._bmReaderStore();
        const bm = { id: "wv-flipP", type: "page", viewType: "pdf", location: { pageIndex: 11 }, position: { pageIndex: 11 },
            pageLabel: "12", label: "Page 12", originalLabel: "Page 12", renamed: false };
        store[key] = { local: [bm], global: [] };
        stubPlugin("_bmPersistSilent", () => {});
        const readers = /** @type {any[]} */ (Zotero.Reader._readers);
        const labels = []; labels[11] = "568";
        const fake = { itemID: item.id, _internalReader: { _primaryView: { _pageLabels: labels } } };
        try {
            // A reader is open and its printed labels are there: the sync takes them.
            readers.push(fake);
            try { wv._bmReaderSyncLabels(item.libraryID, item.key); }
            finally { const i = readers.indexOf(fake); if (i >= 0) readers.splice(i, 1); }
            assert.strictEqual(store[key].local[0].label, "Page 568", "live printed label taken");
            // No reader (a restart, an unloaded tab, labels not there yet): kept.
            wv._bmReaderSyncLabels(item.libraryID, item.key);
            assert.strictEqual(store[key].local[0].label, "Page 568", "not rewritten from the stored capture-time label");
            assert.strictEqual(store[key].local[0].originalLabel, "Page 568");
        }
        finally {
            unstubPlugin();
            await wvT.erase(item);
        }
    });
});
