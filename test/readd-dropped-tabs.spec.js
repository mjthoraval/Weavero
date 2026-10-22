/* global describe, it, before, after, assert, Zotero */

// The one copy-aware re-add of dropped tabs (tabs.ts _wvReaddDroppedTabs;
// survey 2026-10-06 §4, three copies in the restore code merged 2026-10-21):
// the anchor repair against session.json, the managed-window repair and the
// anchor rebuild against windows.json all walk a saved tab list against a
// live Zotero_Tabs through it. Driven on a Zotero_Tabs stub; two throw-away
// items (a linked-URL attachment for a reader tab, a child note).

describe("Weavero — dropped-tab re-add: one copy-aware implementation", () => {
    let wv, parent, att, note;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        for (const m of ["_wvReaddDroppedTabs", "_wvReconcileAnchorSessionTabs", "_wvReconcileManagedWindows", "_wvRestoreAnchorTabs"]) assert.isFunction(wv[m], m);
        parent = new Zotero.Item("journalArticle");
        parent.setField("title", "WV re-add parent");
        await parent.saveTx();
        att = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-readd", parentItemID: parent.id, title: "wv re-add link", contentType: "text/html" });
        note = new Zotero.Item("note");
        note.parentID = parent.id;
        note.setNote("<p>wv re-add note</p>");
        await note.saveTx();
    });
    after(async function () { try { if (parent) await parent.eraseTx(); } catch (e) {} });

    /** A Zotero_Tabs stub: `_tabs` in order, `add` splices like Zotero's and
     *  answers the new tab (its id is what the plugin looks up). */
    function rig(tabs) {
        let n = 0;
        const adds = [];
        const Z = {
            _tabs: tabs.map(t => Object.assign({ id: "t" + (++n) }, t)),
            add(opts) { adds.push(opts); const t = { id: "new" + adds.length, type: opts.type, title: opts.title, data: opts.data }; Z._tabs.splice(opts.index, 0, t); return t; },
        };
        return { Z, adds, ids: () => Z._tabs.map(t => t.id), items: () => Z._tabs.map(t => (t.data && t.data.itemID) || "lib") };
    }
    const lib = () => ({ type: "library", data: {} });
    const noteSt = (extra) => Object.assign({ type: "note", title: "N", data: { itemID: note.id } }, extra || {});
    const readerSt = (extra) => Object.assign({ type: "reader", title: "R", data: { itemID: att.id } }, extra || {});

    it("puts back the COPY the live list lacks (an item open twice comes back twice), unloaded, unselected, out of the item-key claim when unstamped; the hooks see the live entries and the add", async () => {
        const r = rig([lib(), noteSt(), readerSt()]);
        const saved = [lib(), noteSt(), readerSt(), noteSt({ title: "N2" })];
        const live = [], added = [];
        const n = await wv._wvReaddDroppedTabs(r.Z, saved, { onLive: (st, i) => live.push(i), onAdded: (st, i, at) => added.push([i, at]) });
        assert.strictEqual(n, 1, "one copy re-added");
        assert.strictEqual(r.adds.length, 1);
        assert.deepEqual(r.adds[0], { type: "note-unloaded", title: "N2", index: 3, data: { itemID: note.id }, select: false }, "unloaded, at the saved slot, never selected");
        assert.deepEqual(r.items(), ["lib", note.id, att.id, note.id]);
        assert.isTrue(r.Z._tabs[3]._wvGroupExcluded, "no stamp in the store = explicitly ungrouped");
        assert.deepEqual(live, [1, 2], "onLive for the saved entries a live copy answers (the library entry has no item)");
        assert.deepEqual(added, [[3, 3]], "onAdded with the saved index and the slot");
    });

    it("order rule: a copy goes back at the first SAVED slot of its item whose live slot does not hold it, not at its own saved index", async () => {
        // Saved [lib, N, R, N]; one N closed and the survivor slid: live [lib, R, N].
        const r = rig([lib(), readerSt(), noteSt()]);
        const survivor = r.Z._tabs[2].id;
        const n = await wv._wvReaddDroppedTabs(r.Z, [lib(), noteSt(), readerSt(), noteSt()]);
        assert.strictEqual(n, 1);
        assert.strictEqual(r.adds[0].index, 1, "slot 1 (the first saved slot of N, held by R live), not the saved index 3");
        assert.deepEqual(r.items(), ["lib", note.id, att.id, note.id], "the saved order back exactly");
        assert.strictEqual(r.Z._tabs[3].id, survivor, "the survivor kept its tab");
    });

    it("a stamped entry keeps the item-key claim open; -loading / -unloaded types come back as -unloaded; the counter is the return value", async () => {
        const r = rig([lib()]);
        const n = await wv._wvReaddDroppedTabs(r.Z, [lib(), noteSt({ data: { itemID: note.id, wvGroupId: "g1" } }), readerSt({ type: "reader-loading" }), noteSt({ type: "note-unloaded" })]);
        assert.strictEqual(n, 3);
        assert.deepEqual(r.adds.map(a => a.type), ["note-unloaded", "reader-unloaded", "note-unloaded"]);
        assert.isNotOk(r.Z._tabs[1]._wvGroupExcluded, "stamped: not excluded");
        assert.isTrue(r.Z._tabs[2]._wvGroupExcluded); assert.isTrue(r.Z._tabs[3]._wvGroupExcluded);
        assert.deepEqual(r.adds.map(a => a.index), [1, 2, 3]);
    });

    it("an item that is gone stays dropped; entries that are neither reader nor note are left alone; nothing to do answers 0 and touches nothing", async () => {
        const r = rig([lib(), noteSt()]);
        const n = await wv._wvReaddDroppedTabs(r.Z, [lib(), noteSt(), { type: "reader", data: { itemID: 987654321 } }, { type: "foo", data: { itemID: att.id } }]);
        assert.strictEqual(n, 0);
        assert.strictEqual(r.adds.length, 0);
        assert.deepEqual(r.items(), ["lib", note.id]);
        assert.strictEqual(await wv._wvReaddDroppedTabs(r.Z, [lib(), noteSt()]), 0, "all live");
        assert.strictEqual(await wv._wvReaddDroppedTabs(r.Z, []), 0, "nothing saved");
    });

    it("the three restore sites re-add through the one implementation and keep no copy of it", () => {
        for (const m of ["_wvReconcileAnchorSessionTabs", "_wvReconcileManagedWindows", "_wvRestoreAnchorTabs"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvReaddDroppedTabs(", m + " re-adds through the one implementation");
            assert.notInclude(s, "seenCopies", m + " counts no copies itself");
            assert.notInclude(s, "-unloaded\"", m + " adds no tab itself");
        }
    });
});
