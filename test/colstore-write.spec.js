/* global describe, it, before, after, assert, Zotero, IOUtils */

// Survey 2026-10-06: each managed window read-modify-wrote colstore.json on
// its own timer (and force-wrote at close) with no serialization and no
// temp file, so two windows closing at quit read the same old file and the
// last writer dropped the other window's column layout. One in-memory
// document and one chained atomic writer now serve every window.

describe("Weavero — colstore: concurrent window writes keep every window's layout", () => {
    let wv, path, savedText = null;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvColStoreSet, "_wvColStoreSet");
        path = wv._wvColStorePath();
        try { savedText = await IOUtils.readUTF8(path); } catch (_) { savedText = null; }
    });

    after(async () => {
        if (!wv) return;
        try { await (/** @type {any} */ (Zotero).Weavero.lib.wvStoreChain(path)); } catch (_) {}
        if (savedText == null) { try { await IOUtils.remove(path, { ignoreAbsent: true }); } catch (_) {} }
        else { try { await IOUtils.writeUTF8(path, savedText); } catch (_) {} }
        wv._wvColStoreDocPromise = null;
        wv._wvColStoreDoc = null;
    });

    it("two keys written back to back both land, atomically, and survive a fresh load of the store", async function () {
        this.timeout(10000);
        const pA = wv._wvColStoreSet("win-test-a", { title: { width: 100 } });
        const pB = wv._wvColStoreSet("win-test-b", { title: { width: 200 } });
        await Promise.all([pA, pB]);
        const doc = JSON.parse(await IOUtils.readUTF8(path));
        assert.deepEqual(doc["win-test-a"], { title: { width: 100 } });
        assert.deepEqual(doc["win-test-b"], { title: { width: 200 } }, "the second write did not drop the first key");
        assert.isFalse(await IOUtils.exists(path + ".tmp"), "the temp file is gone (atomic rename)");
        // A fresh plugin instance re-reads the file after the previous
        // instance's queued writes.
        wv._wvColStoreDocPromise = null; wv._wvColStoreDoc = null;
        assert.deepEqual(await wv._wvColStoreGet("win-test-a"), { title: { width: 100 } });
        assert.deepEqual(await wv._wvColStoreGet("win-test-b"), { title: { width: 200 } });
    });
});
