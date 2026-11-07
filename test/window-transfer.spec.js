/* global describe, it, before, after, afterEach, assert, Zotero, wvT, IOUtils, PathUtils */

// The first start on a Zotero with its own windows (zotero#6035): what Weavero
// saved in windows.json opens once as Zotero's own windows (MJT 2026-11-07, "allow
// transferring the tabs when doing the update to this new Zotero"), and a window's
// title, hidden collections and Tags count ride Zotero's own saved state from then on.
//
// The plan is pure and runs on every Zotero. The real windows need the real build.

describe("Weavero — the saved windows move to Zotero's own (zotero#6035)", () => {
    let wv, lib;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();
    const STATE = "weavero.windowState";

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib || !lib.wvPlanWindowTransfer) wvT.absent("!wvPlanWindowTransfer");
    });

    const kinds = { 1: "reader", 2: "reader", 3: "reader", 4: "note" };
    const kindOf = id => kinds[id] || null;
    const plan = (doc, open, opts) => lib.wvPlanWindowTransfer(doc, new Map(open || []), kindOf, Object.assign({ newId: () => "new" }, opts));
    const reader = (id, extra) => Object.assign({ type: "reader", title: "T" + id, data: { itemID: id } }, extra);
    const library = extra => Object.assign({ type: "library", title: "My Library" }, extra);

    describe("the plan", () => {
        it("the first window: what is open answers its saved tab, and the slots stay", () => {
            const p = plan({ windows: [{ kind: "main-anchor", tabs: [library(), reader(1), reader(2, { selected: true })], geom: { x: 1 } }] }, [[1, 1]]);
            assert.deepEqual(p.first.tabs.map(t => t.data && t.data.itemID), [undefined, undefined, 2]);
            assert.strictEqual(p.first.tabs[0].type, "library");
            assert.strictEqual(p.first.selectID, 2);
            assert.deepEqual(p.first.geom, { x: 1 });
            assert.lengthOf(p.windows, 0);
        });

        it("a live tab answers one saved tab: nothing doubled, and a document open twice stays twice", () => {
            const doc = { windows: [{ kind: "main-anchor", tabs: [library(), reader(1)] }, { kind: "main-dev", tabs: [library(), reader(1)] }] };
            const saved = plan(doc, [[1, 1]]);
            assert.deepEqual(saved.first.tabs[1], {}, "Zotero's session had it");
            assert.deepEqual(saved.windows[0].tabs.map(t => t.type), ["library", "reader"], "the other copy still opens");
            const both = plan(doc, [[1, 2]]);
            assert.deepEqual(both.windows[0].tabs.map(t => t.type), ["library"], "both are open: neither opens again");
        });

        it("a window Zotero reopened itself takes a saved main window, which does not open twice", () => {
            const doc = { windows: [
                { kind: "main-dev", tabs: [library({ selected: true }), reader(1, { selected: false })], geom: { x: 5 }, wvMainState: { collection: "C5", title: "Mine", pinnedPane: "notes" } },
                { kind: "main-dev", tabs: [library()] },
                { kind: "reader", nativeItemID: 2, extras: [] },
            ] };
            const p = plan(doc, null, { spare: 1 });
            assert.lengthOf(p.fills, 1);
            assert.deepEqual(p.fills[0].tabs.map(t => t.type), ["library", "reader"]);
            assert.deepEqual(p.fills[0].geom, { x: 5 });
            assert.strictEqual(p.fills[0].collection, "C5");
            assert.deepEqual(p.fills[0].state, { title: "Mine" });
            assert.strictEqual(p.fills[0].settings.prefs.pinnedPane, "notes");
            assert.notProperty(p.fills[0].settings.prefs, STATE, "the setters write it");
            assert.lengthOf(p.windows, 2, "the other main window and the reader window still open");
            assert.lengthOf(plan(doc).fills, 0);
            assert.lengthOf(plan({ windows: [{ kind: "reader", nativeItemID: 2, extras: [] }] }, null, { spare: 3 }).windows, 1, "a reader window is no main window");
        });

        it("a gone item is left out, an emptied reader window with it, and a library window stays", () => {
            const p = plan({ windows: [
                { kind: "reader", nativeItemID: 99, extras: [] },
                { kind: "reader-orphan", tabs: [{ itemID: 99 }] },
                { kind: "main-dev", tabs: [library(), reader(99)] },
            ] });
            assert.lengthOf(p.windows, 1);
            assert.deepEqual(p.windows[0].tabs.map(t => t.type), ["library"]);
        });

        it("a saved main window: its tabs, its collection, geometry and settings in Zotero's form", () => {
            const p = plan({ windows: [{ kind: "main-dev", wvWinId: 3,
                tabs: [library({ selected: true }), reader(1, { data: { itemID: 1, wvGroupId: "g1" } }), { type: "note-unloaded", title: "N", data: { itemID: 4 } }],
                geom: { x: 10, y: 20, w: 900, h: 700, dpr: 1.5, st: 3 },
                wvMainState: { collection: "C5", columnPrefs: { title: { width: 300 } }, pinnedPane: "notes", paneOpen: { info: false, tags: true },
                    title: "Mine", hiddenColl: { groups: [7] }, tagsAuto: false } }] }, null, { columnsId: "item-tree-main-default" });
            const s = p.windows[0];
            assert.strictEqual(s.type, "pane");
            assert.deepEqual(s.geometry, { sizemode: "normal", screenX: 10, screenY: 20, width: 900, height: 700 });
            assert.deepEqual(s.tabs.map(t => t.type), ["library", "reader", "note"], "any -unloaded suffix gone");
            assert.isTrue(s.tabs[0].selected);
            assert.deepEqual(s.tabs[0].data.state, { collections: ["C5"], focusedCollection: "C5" });
            assert.strictEqual(s.tabs[1].data.wvGroupId, "g1", "the group stamp rides along");
            assert.strictEqual(s.settings.prefs.pinnedPane, "notes");
            assert.isFalse(s.settings.prefs["panes.info.open"]);
            assert.isTrue(s.settings.prefs["panes.tags.open"]);
            assert.deepEqual(s.settings.itemTreeColumns, { "item-tree-main-default": { title: { width: 300 } } });
            assert.deepEqual(JSON.parse(s.settings.prefs[STATE]), { hiddenColl: { groups: [7] }, title: "Mine", tagsAuto: false, id: "new" });
        });

        it("a library tab that knows its collection keeps it", () => {
            const state = { collections: ["L1"], focusedCollection: "L1" };
            const p = plan({ windows: [{ kind: "main-dev", tabs: [library({ data: { state } })], wvMainState: { collection: "C5" } }] });
            assert.deepEqual(p.windows[0].tabs[0].data.state, state);
        });

        it("a plain window carries no state of Weavero's", () => {
            assert.deepEqual(plan({ windows: [{ kind: "main-dev", tabs: [library()] }] }).windows[0].settings, { prefs: {}, itemTreeColumns: {} });
        });

        it("a reader window: its order, its active tab, its groups, a note as a note", () => {
            const p = plan({ windows: [{ kind: "reader", nativeItemID: 1, nativeGrp: "g1", extras: [{ itemID: 2, grp: null }, { itemID: 4, grp: "g2" }],
                activeIndex: 2, order: [4, 1, 2], geom: { x: 5, y: 6, w: 800, h: 600, st: 1 } }] });
            const s = p.windows[0];
            assert.deepEqual(s.tabs.map(t => [t.type, t.data.itemID, t.data.wvGroupId, !!t.selected]),
                [["note", 4, "g2", true], ["reader", 1, "g1", false], ["reader", 2, undefined, false]]);
            assert.strictEqual(s.tabs[0].title, "", "Zotero fills the title in");
            assert.strictEqual(s.geometry.sizemode, "maximized");
        });

        it("a reader window with no saved order, and an orphan one", () => {
            const p = plan({ windows: [
                { kind: "reader", nativeItemID: 1, extras: [{ itemID: 2 }], activeIndex: 0 },
                { kind: "reader-orphan", tabs: [{ itemID: 3, grp: "g3" }, { itemID: 4 }], activeIndex: 1 },
            ] });
            assert.deepEqual(p.windows[0].tabs.map(t => [t.data.itemID, !!t.selected]), [[1, true], [2, false]]);
            assert.deepEqual(p.windows[1].tabs.map(t => [t.type, t.data.itemID, t.data.wvGroupId, !!t.selected]),
                [["reader", 3, "g3", false], ["note", 4, undefined, true]]);
        });

        it("the focused window opens last, on top; a focused first window is raised after", () => {
            const windows = [{ kind: "main-dev", wvWinId: 1, tabs: [library()] }, { kind: "main-dev", wvWinId: 2, tabs: [library({ title: "two" })] },
                { kind: "reader", nativeItemID: 3, extras: [] }];
            const byWin = plan({ windows, focused: { kind: "main-dev", wvWinId: 1 } });
            assert.lengthOf(byWin.windows[2].tabs, 1);
            assert.strictEqual(byWin.windows[2].tabs[0].title, "My Library");
            assert.isFalse(byWin.focusFirst);
            const byReader = plan({ windows, focused: { kind: "reader", itemID: 3 } });
            assert.strictEqual(byReader.windows[2].tabs[0].type, "reader");
            assert.isTrue(plan({ windows, focused: { kind: "anchor" } }).focusFirst);
        });

        it("the first window's own state comes from the store's own fields", () => {
            const p = plan({ windows: [], anchorTitle: "First", anchorHidden: { groups: [1] }, anchorTagsAuto: true });
            assert.deepEqual(p.first.state, { hiddenColl: { groups: [1] }, title: "First", tagsAuto: true });
        });

        it("a store with nothing usable plans nothing", () => {
            for (const doc of [null, {}, { windows: "x" }, { windows: [null, {}, { kind: "main-dev" }, { kind: "other", tabs: [] }] }]) {
                const p = plan(doc);
                assert.lengthOf(p.windows, 0);
                assert.lengthOf(p.first.tabs, 0);
            }
        });

        it("the geometry: maximized, minimized, Windows' parking spot, none", () => {
            assert.deepEqual(lib.wvGeomToPane({ x: 1, y: 2, w: 300, h: 200, st: 1 }), { sizemode: "maximized", screenX: 1, screenY: 2, width: 300, height: 200 });
            assert.deepEqual(lib.wvGeomToPane({ x: null, y: null, w: null, h: null, st: 3 }), { sizemode: "normal" });
            assert.deepEqual(lib.wvGeomToPane({ x: -32000, y: -32000, w: 199, h: 34, st: 3 }), { sizemode: "normal" });
            assert.isUndefined(lib.wvGeomToPane(null));
        });

        it("every item the store names is listed for loading", () => {
            const ids = lib.wvTransferItemIDs({ windows: [{ kind: "main-anchor", tabs: [library(), reader(1)] },
                { kind: "reader", nativeItemID: 2, extras: [{ itemID: 3 }], order: [3, 2, 4] }, { kind: "reader-orphan", tabs: [{ itemID: 5 }] }] });
            assert.sameMembers(ids, [1, 2, 3, 4, 5]);
        });
    });

    describe("once", () => {
        let dir, path, calls, reason, mark;
        const PREF = "weavero.windowsTransferred";

        before(async () => {
            dir = PathUtils.join(PathUtils.tempDir, "wv-transfer-" + Date.now());
            await IOUtils.makeDirectory(dir);
            path = PathUtils.join(dir, "windows.json");
        });
        after(async () => {
            try { await IOUtils.remove(dir, { recursive: true }); } catch (e) {}
        });

        /** One start: the store at `path`, the transfer recorded, no real window. */
        async function start(startReason) {
            const own = ["_wvWindowStorePath", "_wvWindowsTransfer", "_wvWindowsSettled", "_wvWindowStoreReadText"];
            const saved = own.map(k => [k, Object.prototype.hasOwnProperty.call(wv, k), wv[k]]);
            const hadStub = typeof Z.Prefs.setForWindow === "function";
            reason = wv._wvStartupReason;
            wv._wvStartupReason = startReason;
            wv._wvWindowStorePath = () => path;
            wv._wvWindowsTransfer = async (doc) => { calls.push(doc); };
            wv._wvWindowsSettled = async () => {};
            wv._wvWindowStoreReadText = async () => IOUtils.readUTF8(path);
            if (!hadStub) Z.Prefs.setForWindow = () => {};
            try { await wv._wvWindowsTransferOnce(); }
            finally {
                wv._wvStartupReason = reason;
                if (!hadStub) delete Z.Prefs.setForWindow;
                for (const [k, had, fn] of saved) { if (had) wv[k] = fn; else delete wv[k]; }
            }
        }

        const reset = async () => {
            calls = [];
            mark = Zotero.Prefs.get(PREF);
            Zotero.Prefs.set(PREF, "");
            try { await IOUtils.remove(path); } catch (e) {}
        };
        afterEach(() => Zotero.Prefs.set(PREF, mark || ""));

        const STORE = JSON.stringify({ version: 4, windows: [{ kind: "main-dev", tabs: [{ type: "library" }] }] });

        it("a real start transfers once, and leaves the file as it was", async () => {
            await reset();
            await IOUtils.writeUTF8(path, STORE);
            await start(1);
            assert.lengthOf(calls, 1);
            await start(1);
            assert.lengthOf(calls, 1, "not at the next start");
            assert.strictEqual(await IOUtils.readUTF8(path), STORE);
        });

        it("a store written since, by an older Zotero, transfers in its turn", async () => {
            await reset();
            await IOUtils.writeUTF8(path, STORE);
            await start(1);
            await IOUtils.setModificationTime(path, Date.now() - 60000);
            await start(1);
            assert.lengthOf(calls, 2);
        });

        it("a reload or an enable leaves it to the next real start", async () => {
            await reset();
            await IOUtils.writeUTF8(path, STORE);
            await start(2);
            await start(3);
            assert.lengthOf(calls, 0);
            await start(1);
            assert.lengthOf(calls, 1);
        });

        it("no store, or a broken one: nothing opens", async () => {
            await reset();
            await start(1);
            assert.lengthOf(calls, 0, "no store");
            await IOUtils.writeUTF8(path, "{ not json");
            await start(1);
            assert.lengthOf(calls, 0, "broken");
            assert.isOk(Zotero.Prefs.get(PREF), "and it is not tried at every start");
        });
    });

    describe("on a real native build", () => {
        let att, att2, note, spare, win;

        before(async function () {
            if (!realNative) this.skip();
            this.timeout(60000);
            win = Zotero.getMainWindow();
            att = await wvT.createTestPDFItem("wv-transfer-1");
            att2 = await wvT.createTestPDFItem("wv-transfer-2");
            note = new Zotero.Item("note");
            note.libraryID = Zotero.Libraries.userLibraryID;
            note.setNote("<p>WV-TEST transfer</p>");
            await note.saveTx();
            spare = Zotero.getMainWindows().length;
        });

        const tabsOf = w => w.Zotero_Tabs._tabs.map(t => t.data && t.data.itemID).filter(x => x != null);
        const openCount = id => Zotero.getMainWindows().reduce((n, w) => n + tabsOf(w).filter(x => x === id).length, 0);

        afterEach(async function () {
            if (!realNative) return;
            this.timeout(30000);
            for (const w of Zotero.getMainWindows().slice(spare)) { try { w.close(); } catch (e) {} }
            await wvT.waitFor(() => Zotero.getMainWindows().length <= spare, 10000);
            for (const t of win.Zotero_Tabs._tabs.slice()) {
                if (t.data && t.data.itemID != null) win.Zotero_Tabs.close(t.id);
            }
        });
        after(async function () {
            if (!realNative) return;
            this.timeout(30000);
            for (const it of [att, att2, note]) { if (it) await wvT.erase(it); }
        });

        it("each saved window opens as Zotero's, each document once, tabs and groups in place", async function () {
            this.timeout(45000);
            const doc = { version: 4, focused: { kind: "anchor" }, windows: [
                { kind: "main-anchor", tabs: [{ type: "library", title: "My Library", selected: true }, { type: "reader", title: "A", data: { itemID: att.id, wvGroupId: "wv-g1" } }] },
                { kind: "reader", nativeItemID: att2.id, nativeGrp: "wv-g2", extras: [{ itemID: note.id, grp: null }], activeIndex: 1, order: [att2.id, note.id],
                    geom: { x: 60, y: 60, w: 700, h: 500, dpr: 1, st: 3 } },
                { kind: "main-dev", wvWinId: 4, tabs: [{ type: "library", title: "My Library", selected: true }],
                    geom: { x: 40, y: 40, w: 800, h: 600, dpr: 1, st: 3 }, wvMainState: { title: "Saved here", tagsAuto: true } },
            ] };
            const { added, opened } = await wv._wvWindowsTransfer(doc);
            assert.strictEqual(added, 1, "one tab into the first window");
            assert.lengthOf(opened, 2, "two windows");
            assert.strictEqual(openCount(att.id), 1, "the first window's document");
            assert.strictEqual(win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === att.id).data.wvGroupId, "wv-g1", "its group stamp");
            assert.notOk(win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === att.id).type === "reader", "not loaded until shown");
            const rw = opened.find(w => w.Zotero_Tabs._tabs.some(t => t.data && t.data.itemID === att2.id));
            assert.isOk(rw, "the reader window");
            assert.deepEqual(rw.Zotero_Tabs._tabs.map(t => t.type.split("-")[0]), ["reader", "note"], "a reader tab and a note tab, no library tab");
            assert.strictEqual(rw.Zotero_Tabs._tabs[0].data.wvGroupId, "wv-g2", "the reader window's group stamp");
            assert.strictEqual(rw.Zotero_Tabs._tabs.find(t => t.id === rw.Zotero_Tabs.selectedID).data.itemID, note.id, "its active tab");
            assert.isOk(await wvT.waitFor(() => rw.Zotero_Tabs._tabs[0].title, 8000), "Zotero filled the title in");
            const mw = opened.find(w => w !== rw);
            assert.isOk(await wvT.waitFor(() => mw._wvWindowTitle === "Saved here", 8000), "the saved window's own title");
            assert.isTrue(mw._wvTagsAuto, "and its Tags count");
        });

        it("a window Zotero reopened itself takes the saved window: no second one opens", async function () {
            this.timeout(45000);
            const w = await wvT.openMainWindow();
            const n = Zotero.getMainWindows().length;
            const doc = { windows: [{ kind: "main-dev", wvWinId: 9, tabs: [{ type: "library", title: "My Library", selected: true }, { type: "reader", title: "B", data: { itemID: att2.id } }],
                wvMainState: { title: "Poured in", tagsAuto: false } }] };
            const { added, opened } = await wv._wvWindowsTransfer(doc);
            assert.strictEqual(added, 1, "its tab");
            assert.lengthOf(opened, 0, "no window");
            assert.strictEqual(Zotero.getMainWindows().length, n);
            assert.deepEqual(tabsOf(w), [att2.id]);
            assert.strictEqual(w._wvWindowTitle, "Poured in");
            assert.isFalse(w._wvTagsAuto);
        });

        it("running it again opens no document a second time", async function () {
            this.timeout(45000);
            const doc = { windows: [{ kind: "reader", nativeItemID: att.id, extras: [] }] };
            const one = await wv._wvWindowsTransfer(doc);
            assert.lengthOf(one.opened, 1);
            const two = await wv._wvWindowsTransfer(doc);
            assert.lengthOf(two.opened, 0, "already open");
            assert.strictEqual(openCount(att.id), 1);
        });

        it("a window's title and hidden collections go with Zotero's saved state, and reopen with it", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            assert.isOk(await wvT.waitFor(() => wv._wvWinStateReady && wv._wvWinStateReady.has(w), 10000), "read");
            wv._wvWindowSetCustomTitle(w, "Kept");
            wv._wvHidState(w).sections = ["feeds"];
            wv._wvWindowStoreSaveDebounced();
            const saved = await wvT.waitFor(() => {
                const t = w.ZoteroPane.getState().settings.prefs[STATE];
                return t && JSON.parse(t).hiddenColl ? JSON.parse(t) : null;
            }, 8000);
            assert.isOk(saved, "in Zotero's own saved state");
            assert.strictEqual(saved.title, "Kept");
            assert.deepEqual(saved.hiddenColl.sections, ["feeds"]);
            const sessionState = w.ZoteroPane.getState();
            w.close();
            await wvT.waitFor(() => w.closed, 8000);
            const again = Z.openMainWindow({ sessionState });
            assert.isOk(await wvT.waitFor(() => again._wvWindowTitle === "Kept", 10000), "the title back");
            assert.deepEqual(again._wvHid.sections, ["feeds"], "the hidden section back");
        });

        it("a window opened from another starts plain: the copy Zotero hands it is dropped", async function () {
            this.timeout(60000);
            const w = await wvT.openMainWindow();
            await wvT.waitFor(() => wv._wvWinStateReady && wv._wvWinStateReady.has(w), 10000);
            wv._wvWindowSetCustomTitle(w, "Only mine");
            wv._wvWinStateSave(w);
            const copy = Z.openMainWindow({ windowSettings: w.ZoteroPane.getWindowSettings() });
            assert.isOk(await wvT.waitFor(() => wv._wvWinStateReady && wv._wvWinStateReady.has(copy), 10000), "read");
            assert.notOk(copy._wvWindowTitle, "no title");
            assert.notOk(copy.ZoteroPane.getWindowSettings().prefs[STATE], "no state of its own");
            assert.strictEqual(JSON.parse(w.ZoteroPane.getWindowSettings().prefs[STATE]).title, "Only mine", "the first keeps its own");
        });

        it("a window not read yet keeps its saved state: a save in between does not wipe it", function () {
            const text = JSON.stringify({ id: "x", title: "Saved" });
            const calls = [];
            const fake = { ZoteroPane: { getWindowSettings: () => ({ prefs: { [STATE]: text } }), setWindowSetting: (...a) => calls.push(a) } };
            wv._wvWinStateSave(fake);
            assert.lengthOf(calls, 0);
        });
    });
});
