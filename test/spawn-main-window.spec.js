/* global describe, it, before, after, assert, Zotero */

// The one spawn sequence for Weavero-managed main windows (tabs.ts
// _wvSpawnMainWindowStart / _wvSpawnMainWindowWait; survey 2026-10-06, six
// copies; 2026-10-21): the queue, the pending flag, the open, the wait, the
// timeout. Zotero.openMainWindow is stubbed for the unit cases and real for
// one spawn (closed after). Two throw-away items for the tab-state builder.

describe("Weavero — new main window: one spawn sequence", () => {
    let wv, win, item, note;
    const Z = /** @type {any} */ (Zotero);

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) wvT.absent("!wv");
        for (const m of ["_wvSpawnMainWindowStart", "_wvSpawnMainWindowWait", "_wvSpawnUnqueue", "_wvNewWindowTabState", "_wvGroupItemTabsIn"]) assert.isFunction(wv[m], m);
        const parent = new Zotero.Item("journalArticle");
        parent.setField("title", "WV spawn parent");
        await parent.saveTx();
        item = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-spawn", parentItemID: parent.id, title: "wv spawn link", contentType: "text/html" });
        note = new Zotero.Item("note");
        note.parentID = parent.id;
        note.setNote("<p>wv spawn note</p>");
        await note.saveTx();
        note._wvParent = parent;
    });
    after(async function () { try { if (note && note._wvParent) await note._wvParent.eraseTx(); } catch (e) {} });

    /** Run `fn` with Zotero.openMainWindow replaced. */
    async function withOpen(stub, fn) {
        const orig = Z.openMainWindow;
        Z.openMainWindow = stub;
        try { return await fn(); } finally { Z.openMainWindow = orig; }
    }

    /** The queue and the flag exactly as found: a failed assertion must not
     *  leave a queued state for the next test's real spawn to adopt (a stale
     *  entry made the adoption chain a SECOND window, dev.102's first run). */
    function snapshot() {
        return { q: (wv._wvDevSpawnQueue || []).slice(), flag: !!wv._wvPendingDevWindow };
    }
    function restore(s) {
        wv._wvDevSpawnQueue = s.q.slice();
        wv._wvPendingDevWindow = s.flag;
    }

    it("start: the state is queued, the flag raised, Zotero's open called; a throwing open takes the state back and lowers the flag; no state queues nothing", async () => {
        const s0 = snapshot(), q0 = s0.q.length;
        try {
            let opened = 0;
            await withOpen(() => { opened++; }, async () => {
                const s = wv._wvSpawnMainWindowStart({ tabs: [{ type: "library" }] });
                assert.isOk(s, "a handle"); assert.strictEqual(opened, 1, "opened once");
                assert.strictEqual(wv._wvDevSpawnQueue.length, q0 + 1, "the state queued");
                assert.strictEqual(wv._wvDevSpawnQueue[q0].kind, "main-dev"); assert.deepEqual(wv._wvDevSpawnQueue[q0].tabs, [{ type: "library" }]);
                assert.isTrue(wv._wvPendingDevWindow, "the flag raised");
                assert.isFunction(s.before && s.before.has, "the windows before (a Set of the plugin's compartment)");
                const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 300, dropOnTimeout: true });
                assert.isNull(w, "nothing settled");
                assert.strictEqual(wv._wvDevSpawnQueue.length, q0, "dropOnTimeout: the state taken back");
                assert.isFalse(wv._wvPendingDevWindow, "and the flag lowered");
                const s2 = wv._wvSpawnMainWindowStart({ tabs: [] });
                assert.isNull(await wv._wvSpawnMainWindowWait(s2, { wait: "managed", timeoutMs: 200 }), "no window");
                assert.strictEqual(wv._wvDevSpawnQueue.length, q0 + 1, "without dropOnTimeout the state stays queued for a late window");
                wv._wvSpawnUnqueue(s2.queued);
                assert.strictEqual(wv._wvDevSpawnQueue.length, q0);
                wv._wvPendingDevWindow = s0.flag;
            });
            await withOpen(() => { throw new Error("no window for you"); }, async () => {
                const s = wv._wvSpawnMainWindowStart({ tabs: [{ type: "library" }] });
                assert.isNull(s, "a throwing open: null");
                assert.strictEqual((wv._wvDevSpawnQueue || []).length, q0, "the state taken back");
                assert.isFalse(wv._wvPendingDevWindow, "the flag lowered");
                assert.isNull(await wv._wvSpawnMainWindowWait(null, { wait: "init" }), "waiting on a failed start is null");
            });
            await withOpen(() => {}, async () => {
                const s = wv._wvSpawnMainWindowStart();
                assert.isOk(s); assert.isNull(s.queued, "no state: nothing queued");
                assert.strictEqual((wv._wvDevSpawnQueue || []).length, q0);
                assert.isTrue(wv._wvPendingDevWindow);
            });
        } finally { restore(s0); }
    });

    it("a real spawn: start with a library-only state, wait for the managed init, the window holds the library tab alone; closed after", async function () {
        this.timeout(40000);
        const s0 = snapshot();
        assert.strictEqual(s0.q.length, 0, "no queued state before the real spawn"); assert.isFalse(s0.flag, "no pending spawn before");
        const mainsBefore = new Set(Zotero.getMainWindows());
        const s = wv._wvSpawnMainWindowStart({ tabs: [{ type: "library", title: "My Library", data: { icon: "library" }, selected: true }] });
        assert.isOk(s, "opened");
        let nw = null;
        try {
            nw = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win });
            assert.isOk(nw, "the new window settled");
            assert.isTrue(nw._wvManagedWindow, "adopted as a managed window");
            assert.isTrue(nw._wvDevInitDone, "its init finished");
            assert.notStrictEqual(nw, win);
            assert.isTrue(await wvT.waitFor(() => nw.Zotero_Tabs && nw.Zotero_Tabs._tabs.length === 1, 5000), "the library tab alone: " + (nw.Zotero_Tabs && nw.Zotero_Tabs._tabs.map(t => t.type).join(",")));
            assert.isFalse(wv._wvPendingDevWindow, "the flag consumed by the adoption");
            assert.strictEqual((wv._wvDevSpawnQueue || []).length, 0, "the state consumed");
        } finally {
            // Every main window this test opened goes, the one awaited included.
            for (const w of Zotero.getMainWindows()) { if (!mainsBefore.has(w) && !w.closed) { try { w.close(); } catch (e) {} } }
            await wvT.waitFor(() => Zotero.getMainWindows().every(w => mainsBefore.has(w)), 8000);
            restore(s0);
        }
    });

    it("the tab-state builder: the library tab first, a reader tab (icon by content type) or a note tab per entry, the last one selected; the grouping tail adds the item tabs only", () => {
        const st = wv._wvNewWindowTabState([{ itemID: item.id, isNote: false }, { itemID: note.id, isNote: true }]);
        assert.strictEqual(st.length, 3);
        assert.deepEqual(st[0], { type: "library", title: "My Library", data: { icon: "library" }, selected: false });
        assert.strictEqual(st[1].type, "reader"); assert.strictEqual(st[1].data.itemID, item.id); assert.strictEqual(st[1].data.icon, "attachmentSnapshot", "a non-PDF, non-EPUB attachment");
        assert.strictEqual(st[1].title, "WV spawn parent", "the parent's title");
        assert.strictEqual(st[2].type, "note"); assert.strictEqual(st[2].data.itemID, note.id); assert.isTrue(st[2].selected, "the last one selected");
        assert.isUndefined(st[1].selected);
        assert.deepEqual(wv._wvNewWindowTabState([]), [{ type: "library", title: "My Library", data: { icon: "library" }, selected: false }]);
        const calls = [];
        const saved = { c: wv._tabGroupCreate, n: wv._wvTabGroupNextColor, a: wv._wvTabGroupAddTab };
        wv._tabGroupCreate = () => ({ id: "gNew" }); wv._wvTabGroupNextColor = () => "blue"; wv._wvTabGroupAddTab = (w, id, g) => calls.push(id + ":" + g);
        try {
            const fake = { Zotero_Tabs: { _tabs: [{ id: "zotero-pane" }, { id: "t1", data: { itemID: 5 } }, { id: "t2", data: { itemID: 6 } }, { id: "t3", data: { itemID: 7 } }] } };
            wv._wvGroupItemTabsIn(fake, [5, 7]);
            assert.deepEqual(calls, ["t1:gNew", "t3:gNew"], "the tabs of the given items, into the fresh group");
        } finally { wv._tabGroupCreate = saved.c; wv._wvTabGroupNextColor = saved.n; wv._wvTabGroupAddTab = saved.a; }
    });

    it("every spawn site starts through the one sequence; none opens a main window itself", () => {
        for (const m of ["_wvOpenEmptyMainWindow", "_wvOpenInNewMainWindow", "_wvMoveTabsToNewMainWindow", "_wvTabGroupMoveToNewMainWindow", "_wvSavedWindowReopen", "_wvSpawnNextDevWindow", "_registerDevNewWindowMenu"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvSpawnMainWindowStart(", m + " starts through the sequence");
            assert.notInclude(s, "openMainWindow(", m + " opens no window itself");
            assert.notInclude(s, "_wvPendingDevWindow = true", m + " raises no flag itself");
        }
        for (const m of ["_wvOpenInNewMainWindow", "_wvMoveTabsToNewMainWindow"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvNewWindowTabState(", m + " takes the one tab-state builder");
            assert.notInclude(s, "attachmentEPUB", m + " builds no tab state itself");
        }
    });
});
