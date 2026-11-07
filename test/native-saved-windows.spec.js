/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Saved windows and group moves on a Zotero with its own windows (zotero#6035, MJT
// 2026-11-07): the same features through Zotero's own restore and tab move.

describe("Weavero — saved windows and group moves on Zotero's windows (zotero#6035)", () => {
    let wv, lib, win, att, att2, spare;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib || !lib.wvStoredFromSaved) wvT.absent("!wvStoredFromSaved");
    });

    it("a saved entry becomes a stored window, on every Zotero", () => {
        const main = lib.wvStoredFromSaved({ kind: "main", tabs: [{ type: "library" }], geom: { x: 1 }, wvMainState: { collection: "C1" }, named: true, name: "Mine" });
        assert.strictEqual(main.kind, "main-dev");
        assert.deepEqual(main.wvMainState, { collection: "C1", title: "Mine" });
        const inherited = lib.wvStoredFromSaved({ kind: "main", tabs: [], name: "Window 2" });
        assert.notProperty(inherited.wvMainState, "title", "a name only inherited stays subject to renumbering");
        const reader = lib.wvStoredFromSaved({ kind: "reader", tabs: [{ itemID: 3, isNote: false }, { itemID: null }, { itemID: 4, isNote: true }], geom: { x: 2 } });
        assert.strictEqual(reader.kind, "reader-orphan");
        assert.deepEqual(reader.tabs, [{ itemID: 3 }, { itemID: 4 }]);
    });

    describe("on a real native build", () => {
        const stamp = t => wv._wvTabGroupStamp(t);
        const tabOf = (w, id) => w.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === id);
        const openReader = async (id, w) => {
            await Zotero.Reader.open(id, null, /** @type {any} */ ({ window: w }));
            const r = await wvT.waitFor(() => Zotero.Reader._readers.find(x => x.itemID === id && x._window === w), 10000);
            await wvT.waitFor(() => r.canMoveToWindow(), 10000);
            return r;
        };

        before(async function () {
            if (!realNative) this.skip();
            this.timeout(60000);
            win = Zotero.getMainWindows()[0];
            att = await wvT.createTestPDFItem("wv-native-saved-1");
            att2 = await wvT.createTestPDFItem("wv-native-saved-2");
            spare = Zotero.getMainWindows().length;
        });

        afterEach(async function () {
            if (!realNative) return;
            this.timeout(30000);
            for (const r of (Zotero.Reader._readers || []).slice()) wvT.closeReaderTab(r);
            for (const w of Zotero.getMainWindows().slice(spare)) { try { w.close(); } catch (e) {} }
            await wvT.waitFor(() => Zotero.getMainWindows().length <= spare, 10000);
            wv._tabGroupsSet(wv._tabGroupsGet().filter(g => !/^wv-native-/.test(g.name || "")));
            await wv._wvSavedWindowsInit();
            wv._wvSavedWinDoc.windows = wv._wvSavedWindowsList().filter(e => !/^wv-native-/.test(e.name || ""));
        });

        after(async function () {
            if (!realNative) return;
            this.timeout(30000);
            for (const it of [att, att2]) { if (it) await wvT.erase(it); }
        });

        it("Save and Close parks the window, leaves nothing to reopen by Zotero, and Reopen brings it back", async function () {
            this.timeout(45000);
            const w = await wvT.openMainWindow();
            await openReader(att.id, w);
            wv._wvWindowSetCustomTitle(w, "wv-native-parked");
            const before = Z.Session.getLastClosed();
            await wv._wvSaveAndCloseWindow(w, false);
            assert.isTrue(w.closed, "closed");
            assert.strictEqual(Z.Session.getLastClosed(), before, "not in Zotero's reopen list");
            const entry = wv._wvSavedWindowsList().find(e => e.name === "wv-native-parked");
            assert.isOk(entry, "parked");
            assert.strictEqual(entry.kind, "main");
            assert.isOk(wv._wvSavedWindowsSections(entry.sessionId || null).some(s => s.savedId === entry.id), "listed in the tabs menu");
            await wv._wvSavedWindowReopen(entry.id);
            const back = Zotero.getMainWindows().find(x => x !== win && tabOf(x, att.id));
            assert.isOk(back, "its window is back, with its document");
            assert.isOk(await wvT.waitFor(() => back._wvWindowTitle === "wv-native-parked", 10000), "and its name");
            assert.notOk(wv._wvSavedWindowsList().some(e => e.id === entry.id), "no longer parked");
        });

        it("an entry saved on an older Zotero reopens: a reader window, its notes as notes", async function () {
            this.timeout(45000);
            await wv._wvSavedWindowsInit();
            const id = "swin-wv-native-old";
            wv._wvSavedWinDoc.windows.push({ id, name: "wv-native-old", named: true, kind: "reader", tabs: [{ itemID: att.id, isNote: false, title: "A" }, { itemID: att2.id, isNote: false, title: "B" }], count: 2, geom: { x: 60, y: 60, w: 700, h: 500, dpr: 1, st: 3 }, glyph: null });
            await wv._wvSavedWindowReopen(id);
            const back = Zotero.getMainWindows().find(x => tabOf(x, att.id));
            assert.isOk(back, "a window");
            assert.notOk(back.Zotero_Tabs._tabs.some(t => t.type.startsWith("library")), "with only its documents");
            assert.lengthOf(back.Zotero_Tabs._tabs, 2);
            assert.isOk(await wvT.waitFor(() => back._wvWindowTitle === "wv-native-old", 10000), "its name");
        });

        // The alert after it is a real modal: Services.prompt cannot be stubbed, and one
        // left open stops the run. Hence the step before it.
        it("a saved window whose documents are gone opens nothing", async function () {
            this.timeout(20000);
            const n = Zotero.getMainWindows().length;
            const w = await wv._wvOpenStoredWindow(lib.wvStoredFromSaved({ kind: "reader", tabs: [{ itemID: 99999999, isNote: false }] }));
            assert.isNull(w);
            assert.strictEqual(Zotero.getMainWindows().length, n);
        });

        it("a group moves to another window whole, and a loaded reader stays the same reader", async function () {
            this.timeout(45000);
            const r1 = await openReader(att.id, win);
            await openReader(att2.id, win);
            const g = wv._tabGroupCreate("wv-native-move", wv._wvTabGroupNextColor());
            wv._wvTabGroupAddTab(win, r1.tabID, g.id);
            wv._wvTabGroupAddTab(win, tabOf(win, att2.id).id, g.id);
            const w2 = await wvT.openMainWindow();
            await wv._wvMoveGroupToWindowAt(g.id, w2, false, null);
            assert.notOk(tabOf(win, att.id) || tabOf(win, att2.id), "gone from the first window");
            const a = tabOf(w2, att.id), b = tabOf(w2, att2.id);
            assert.isOk(a && b, "both in the other");
            assert.strictEqual(stamp(a), g.id);
            assert.strictEqual(stamp(b), g.id);
            // isTrue: chai cannot print a window, and a failing strictEqual says nothing.
            assert.isTrue(r1._window === w2, "the reader went with its document, not reloaded");
            assert.isOk(wv._tabGroupsGet().some(x => x.id === g.id), "the group lives");
            assert.isOk(await wvT.waitFor(() => w2.document.querySelector(".wv-tab-group-chip"), 8000), "its chip there");
            assert.isTrue(wv._wvTabGroupHomeWin(g.id) === w2, "its home is the new window");
        });

        it("a group moves to a new window, and only the group", async function () {
            this.timeout(45000);
            const r1 = await openReader(att.id, win);
            await openReader(att2.id, win);
            const g = wv._tabGroupCreate("wv-native-new", wv._wvTabGroupNextColor());
            wv._wvTabGroupAddTab(win, r1.tabID, g.id);
            const n = Zotero.getMainWindows().length;
            await wv._wvTabGroupMoveToNewWindow(win, g.id);
            assert.strictEqual(Zotero.getMainWindows().length, n + 1, "one window more");
            const w2 = Zotero.getMainWindows().find(x => tabOf(x, att.id));
            assert.isFalse(w2 === win, "not the first window");
            assert.strictEqual(stamp(tabOf(w2, att.id)), g.id, "grouped there");
            assert.isOk(tabOf(win, att2.id), "the other tab stayed");
            assert.notOk(w2.Zotero_Tabs._tabs.some(t => t.type.startsWith("library")), "a window of its own, as Zotero's tear-off");
            assert.isOk(await wvT.waitFor(() => w2.document.querySelector(".wv-tab-group-chip"), 8000), "its chip");
        });

        it("a saved group opens in a window of its own", async function () {
            this.timeout(45000);
            const g = wv._tabGroupCreate("wv-native-saved", wv._wvTabGroupNextColor());
            wv._tabGroupAddKey(g.id, { libraryID: att.libraryID, itemKey: att.key });
            const groups = wv._tabGroupsGet();
            groups.find(x => x.id === g.id).saved = true;
            wv._tabGroupsSet(groups);
            await wv._wvTabGroupMoveToNewWindow(win, g.id);
            const w2 = Zotero.getMainWindows().find(x => tabOf(x, att.id));
            assert.isOk(w2, "a window with its tab");
            assert.strictEqual(stamp(tabOf(w2, att.id)), g.id);
            assert.notOk(wv._tabGroupsGet().find(x => x.id === g.id).saved, "no longer saved");
        });

        it("the move menu lists the other windows and a New Window row", async function () {
            this.timeout(30000);
            const r1 = await openReader(att.id, win);
            const g = wv._tabGroupCreate("wv-native-menu", wv._wvTabGroupNextColor());
            wv._wvTabGroupAddTab(win, r1.tabID, g.id);
            const w2 = await wvT.openMainWindow();
            const pop = win.document.createXULElement("menupopup");
            try {
                wv._wvFillGroupMoveTargetPopup(win, pop, g.id, () => {});
                const labels = [...pop.querySelectorAll("menuitem")].map(m => m.getAttribute("label"));
                assert.include(labels, "New Window");
                assert.isAtLeast(labels.length, 3, "this window, the other, New Window: " + labels.join(" | ") + " " + (w2.closed ? "" : "open"));
            }
            finally { pop.remove(); }
        });
    });
});
