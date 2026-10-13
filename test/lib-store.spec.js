/* global describe, it, before, after, assert, Zotero, IOUtils */

// src/lib/store.ts (survey 2026-10-06 §3.4): one persistence writer/reader
// for the JSON files under <data dir>/weavero. Contracts: atomic writes on a
// per-path chain that survives a reload (last write wins, in order), a read
// that waits for pending writes, and three distinct read failures -- missing,
// corrupt (moved aside), unreadable (kept; the caller runs read-only).

describe("Weavero — lib/store: one writer, three read answers", () => {
    let lib, path;
    const cleanup = async () => {
        for (const p of [path, path + ".tmp", path + ".bak"]) {
            try { await IOUtils.remove(p, { ignoreAbsent: true }); } catch (_) {}
        }
        try {
            const dir = lib.wvStoreDir();
            for (const child of await IOUtils.getChildren(dir)) {
                if (child.indexOf("_wv-test-store.json.corrupt-") !== -1) { try { await IOUtils.remove(child); } catch (_) {} }
            }
        } catch (_) {}
    };

    before(async function () {
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        if (!lib || typeof lib.wvStoreWrite !== "function") this.skip();
        path = lib.wvStorePath("_wv-test-store.json");
        await cleanup();
    });

    after(async () => { if (lib) await cleanup(); });

    it("a missing file reads as missing, never as an error", async () => {
        const r = await lib.wvStoreRead(path);
        assert.strictEqual(r.status, "missing");
        assert.isNull(r.doc);
    });

    it("writes are atomic and serialised per path; a read waits for them", async function () {
        this.timeout(10000);
        // Three writes without awaiting: the chain keeps their order.
        lib.wvStoreWrite(path, { n: 1 });
        lib.wvStoreWrite(path, { n: 2 });
        const last = lib.wvStoreWrite(path, { n: 3, nested: { a: [1, 2] } });
        const r = await lib.wvStoreRead(path);   // waits for the chain
        assert.strictEqual(r.status, "ok");
        assert.deepEqual(r.doc, { n: 3, nested: { a: [1, 2] } }, "the last write wins, in order");
        await last;
        assert.isFalse(await IOUtils.exists(path + ".tmp"), "no temp file left (atomic rename)");
        assert.include(await IOUtils.readUTF8(path), "\n  \"n\": 3", "pretty-printed by default");
        await lib.wvStoreWrite(path, { c: 1 }, { pretty: null });
        assert.strictEqual(await IOUtils.readUTF8(path), '{"c":1}', "compact on request");
        await lib.wvStoreChain(path);
    });

    it("the snapshot is taken at the call, not when the I/O runs", async () => {
        const doc = { v: "before" };
        const p = lib.wvStoreWrite(path, doc);
        doc.v = "after";
        await p;
        assert.deepEqual((await lib.wvStoreRead(path)).doc, { v: "before" });
    });

    it("a corrupt file is moved aside and reported as parse-error; 'keep' leaves it in place", async () => {
        await lib.wvStoreChain(path);
        await IOUtils.writeUTF8(path, "{ not json", { tmpPath: path + ".tmp" });
        const kept = await lib.wvStoreRead(path, { onParseError: "keep" });
        assert.strictEqual(kept.status, "parse-error");
        assert.isTrue(await IOUtils.exists(path), "'keep' does not touch the file");
        const r = await lib.wvStoreRead(path);
        assert.strictEqual(r.status, "parse-error");
        assert.isOk(r.movedTo, "backed up");
        assert.isFalse(await IOUtils.exists(path), "the corrupt file is gone from its path");
        assert.isTrue(await IOUtils.exists(r.movedTo), "and sits at the backup path");
        try { await IOUtils.remove(r.movedTo); } catch (_) {}
    });

    it("an unreadable file is KEPT and reported as io-error (after one retry)", async function () {
        this.timeout(10000);
        await lib.wvStoreWrite(path, { keep: "me" });
        const origGet = Zotero.File.getContentsAsync;
        let calls = 0;
        Zotero.File.getContentsAsync = async function (p, ...rest) {
            if (String(p) === String(path)) { calls++; throw new Error("EBUSY (simulated transient read failure)"); }
            return origGet.call(this, p, ...rest);
        };
        let r;
        try { r = await lib.wvStoreRead(path, { retryDelay: 10 }); }
        finally { Zotero.File.getContentsAsync = origGet; }
        assert.strictEqual(r.status, "io-error");
        assert.strictEqual(calls, 2, "one retry");
        assert.isTrue(await IOUtils.exists(path), "the file was not moved");
        assert.deepEqual((await lib.wvStoreRead(path)).doc, { keep: "me" }, "and is intact");
    });

    it("rotateBak copies the previous file to .bak only when the caller says the new document loses something", async () => {
        await lib.wvStoreWrite(path, { groups: [{ id: "a" }, { id: "b" }] });
        const keeps = (ids) => (prev) => ((prev && prev.groups) || []).some(g => !ids.includes(g.id));
        await lib.wvStoreWrite(path, { groups: [{ id: "a" }, { id: "b" }, { id: "c" }] }, { rotateBak: keeps(["a", "b", "c"]) });
        assert.isFalse(await IOUtils.exists(path + ".bak"), "nothing lost: no rotation");
        await lib.wvStoreWrite(path, { groups: [{ id: "a" }] }, { rotateBak: keeps(["a"]) });
        assert.isTrue(await IOUtils.exists(path + ".bak"), "b and c vanished: the previous generation is kept");
        const bak = JSON.parse(await IOUtils.readUTF8(path + ".bak"));
        assert.deepEqual(bak.groups.map(g => g.id), ["a", "b", "c"]);
    });

    it("wvStoreRemove removes after pending writes; absent is fine", async () => {
        lib.wvStoreWrite(path, { x: 1 });
        await lib.wvStoreRemove(path);
        assert.isFalse(await IOUtils.exists(path));
        await lib.wvStoreRemove(path);
        assert.strictEqual((await lib.wvStoreRead(path)).status, "missing");
    });

    it("every store persists through the helper and no module keeps its own chain", () => {
        const wv = Zotero.Weavero.plugin;
        for (const name of ["_bmPersist", "_wvOutlinePersist", "_wvOePersist", "_wvTabSessionPersist", "_wvSavedWindowsPersist",
            "_wvWindowStoreWrite", "_wvColStoreSet", "_wvTabGroupsBackupWrite", "_wvTraceFlush"]) {
            const s = String(wv[name]);
            assert.include(s, "wvStoreWrite", name + " writes through lib/store");
            assert.notInclude(s, "IOUtils.writeUTF8", name + " has no private writer");
        }
        for (const name of ["_bmInit", "_wvOutlineInit", "_wvOeInit", "_wvTabSessionInit", "_wvSavedWindowsInit", "_wvColStoreLoad"]) {
            assert.include(String(wv[name]), "wvStoreRead", name + " reads through lib/store");
        }
    });
});
