/* global describe, it, before, after, assert, Zotero, IOUtils */

// Survey 2026-10-06: ONE catch around read + parse treated a file that could
// not be READ (a transient lock, antivirus, sync) like a corrupt one: it was
// moved aside and the next persist wrote an empty store in its place. A read
// error now keeps the file and runs the session read-only; only a parse
// failure backs the file up.

describe("Weavero — an unreadable bookmarks.json is kept, never replaced", () => {
    let wv, path, origGet = null;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._bmInit, "_bmInit");
        await wv._bmInit();
        path = wv._bmFilePath();
        await wv._bmPersist();   // make sure the file exists on disk
    });

    after(async () => {
        if (!wv) return;
        if (origGet) { Zotero.File.getContentsAsync = origGet; origGet = null; }
        wv._bmReadOnly = false;
        wv._bmInitPromise = null;
        wv._bmDoc = null;
        await wv._bmInit();   // reload the real document for later specs
    });

    it("an I/O error at load leaves the file in place and makes the session read-only", async function () {
        this.timeout(10000);
        const before = await IOUtils.readUTF8(path);
        origGet = Zotero.File.getContentsAsync;
        Zotero.File.getContentsAsync = async function (p, ...rest) {
            if (String(p) === String(path)) throw new Error("EBUSY (simulated transient read failure)");
            return origGet.call(this, p, ...rest);
        };
        wv._bmInitPromise = null; wv._bmDoc = null; wv._bmReadOnly = false;
        try { await wv._bmInit(); }
        finally { Zotero.File.getContentsAsync = origGet; origGet = null; }
        assert.isTrue(await IOUtils.exists(path), "the file was not moved aside");
        assert.equal(await IOUtils.readUTF8(path), before, "and not rewritten");
        assert.isTrue(wv._bmReadOnly, "the store is read-only for the session");
        await wv._bmPersist();
        assert.equal(await IOUtils.readUTF8(path), before, "a persist in read-only mode writes nothing");
    });
});
