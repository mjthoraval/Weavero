/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Named sessions on a Zotero with its own windows (zotero#6035, MJT 2026-11-07).
// A switch replaces the whole workspace, so every test here starts and ends on one
// window with its library tab.

describe("Weavero — named sessions on Zotero's windows (zotero#6035)", () => {
    let wv, win, att, att2, note, doc0, active0;
    const realNative = wvT.nativeWindows();
    const Z = /** @type {any} */ (Zotero);
    const tabsOf = w => w.Zotero_Tabs._tabs.map(t => t.data && t.data.itemID).filter(x => x != null);
    const count = id => Zotero.getMainWindows().reduce((n, w) => n + tabsOf(w).filter(x => x === id).length, 0);
    const windowOf = id => Zotero.getMainWindows().find(w => tabsOf(w).includes(id));

    before(async function () {
        wv = wvT.plugin();
        if (!wv || !wv._wvTabSessionReconstruct) wvT.absent("_wvTabSessionReconstruct");
        if (!realNative) this.skip();
        this.timeout(60000);
        win = Zotero.getMainWindows()[0];
        await wv._wvTabSessionInit();
        doc0 = JSON.stringify(wv._wvTabSessionDoc);
        active0 = wv._wvTabSessionGetActiveId();
        att = await wvT.createTestPDFItem("wv-native-session-1");
        att2 = await wvT.createTestPDFItem("wv-native-session-2");
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote("<p>WV-TEST session</p>");
        await note.saveTx();
    });

    /** Back to one window, one library tab, no session in use. */
    async function reset() {
        for (const w of Zotero.getMainWindows().slice(1)) { try { w.close(); } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 10000);
        const m = Zotero.getMainWindows()[0], T = m.Zotero_Tabs;
        const lib = T._tabs.find(t => t.type.startsWith("library"));
        if (lib) T.select(lib.id);
        for (const t of T._tabs.slice()) { if (t !== lib) T.close(t.id); }
        wv._tabGroupsSet(wv._tabGroupsGet().filter(g => !/^wv-native-/.test(g.name || "")));
        await wvT.sleep(300);
    }

    afterEach(async function () {
        if (!realNative) return;
        this.timeout(30000);
        await reset();
        wv._wvTabSessionDoc = JSON.parse(doc0);
        wv._wvTabSessionDoc.activeSessionId = active0;
        await wv._wvTabSessionPersist();
    });

    after(async function () {
        if (!realNative) return;
        this.timeout(30000);
        for (const it of [att, att2, note]) { if (it) await wvT.erase(it); }
    });

    /** Two windows: reader tab + note here, a reader alone in a window of its own. */
    async function workspace() {
        await Zotero.Reader.open(att.id, null, /** @type {any} */ ({ window: win }));
        await Zotero.Notes.open(note.id, null, /** @type {any} */ ({ window: win }));
        await wvT.waitFor(() => tabsOf(win).length === 2, 8000);
        const w2 = await wvT.openMainWindow();
        await Zotero.Reader.open(att2.id, null, /** @type {any} */ ({ window: w2 }));
        const r2 = await wvT.waitFor(() => Zotero.Reader._readers.find(r => r.itemID === att2.id), 10000);
        await wvT.waitFor(() => r2.canMoveToWindow(), 10000);
        w2.Zotero_Tabs.close(w2.Zotero_Tabs._tabs.find(t => t.type.startsWith("library")).id);
        await wvT.waitFor(() => w2.Zotero_Tabs._tabs.length === 1, 5000);
        return w2;
    }

    it("a window with no library tab says so in the session, one with two lists them", async function () {
        this.timeout(45000);
        const w2 = await workspace();
        wv._wvWindowSetCustomTitle(win, "wv-first");
        win.ZoteroPane.newLibraryTab();
        await wvT.waitFor(() => win.Zotero_Tabs._tabs.filter(t => t.type.startsWith("library")).length === 2, 8000);
        const recs = wv._wvTabSessionCaptureWindows();
        assert.lengthOf(recs, 2);
        const lone = recs.find(r => r.noLibrary);
        assert.isOk(lone, "the reader-only window");
        assert.deepEqual(lone.tabs.map(t => t.type), ["reader"]);
        const main = recs.find(r => !r.noLibrary);
        assert.lengthOf(main.libraryTabs, 2);
        assert.strictEqual(main.title, "wv-first");
        wv._wvWindowSetCustomTitle(win, "");
        assert.isFalse(w2.closed);
    });

    it("a switch away and back gives the same windows, each document once, and nothing in Zotero's reopen list", async function () {
        this.timeout(60000);
        await workspace();
        wv._wvWindowSetCustomTitle(win, "wv-session-a");
        const before = Z.Session.getLastClosed();
        const a = await wv._wvTabSessionSaveAs("wv-native-a");
        const id = (a && a.id) || wv._wvTabSessionList().find(s => s.name === "wv-native-a").id;
        await wv._wvTabSessionNewEmpty(win);
        assert.strictEqual(Zotero.getMainWindows().length, 1, "one window for the new session");
        assert.lengthOf(tabsOf(Zotero.getMainWindows()[0]), 0, "no document");
        assert.notOk(Zotero.getMainWindows()[0]._wvWindowTitle, "and not the old window's name");
        assert.strictEqual(Z.Session.getLastClosed(), before, "a switch is no close to undo");
        await wv._wvTabSessionSwitch(id);
        assert.strictEqual(Zotero.getMainWindows().length, 2, "both windows");
        for (const x of [att.id, att2.id, note.id]) assert.strictEqual(count(x), 1, "item " + x + " once");
        const first = windowOf(att.id);
        assert.isTrue(windowOf(note.id) === first, "the note with its reader");
        assert.isOk(first.Zotero_Tabs._tabs.some(t => t.type.startsWith("library")), "the first window keeps a library tab");
        const lone = windowOf(att2.id);
        assert.isFalse(lone === first, "the other in its own");
        assert.notOk(lone.Zotero_Tabs._tabs.some(t => t.type.startsWith("library")), "with no library tab, as saved");
        assert.isOk(await wvT.waitFor(() => first._wvWindowTitle === "wv-session-a", 8000), "the name back");
        assert.strictEqual(wv._wvTabSessionGetActiveId(), id, "and it is the active session");
    });

    it("a session's tab groups come back with it", async function () {
        this.timeout(60000);
        await workspace();
        const g = wv._tabGroupCreate("wv-native-session-group", wv._wvTabGroupNextColor());
        wv._wvTabGroupAddTab(win, win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === att.id).id, g.id);
        const a = await wv._wvTabSessionSaveAs("wv-native-b");
        const id = (a && a.id) || wv._wvTabSessionList().find(s => s.name === "wv-native-b").id;
        await wv._wvTabSessionNewEmpty(win);
        assert.notOk(wv._tabGroupsGet().some(x => x.id === g.id), "the empty session has none");
        await wv._wvTabSessionSwitch(id);
        const w = windowOf(att.id);
        const t = w.Zotero_Tabs._tabs.find(x => x.data && x.data.itemID === att.id);
        assert.strictEqual(wv._wvTabGroupStamp(t), g.id, "its tab is stamped");
        assert.isOk(await wvT.waitFor(() => wv._tabGroupsGet().some(x => x.id === g.id) && w.document.querySelector(".wv-tab-group-chip"), 8000), "the group and its chip");
    });

    it("a session saved on an older Zotero opens: a reader window as a window with only its tabs", async function () {
        this.timeout(45000);
        const id = "wv-native-old-session";
        wv._wvTabSessionDoc.sessions.push({ id, name: "wv-native-old", created: 1, modified: 1, lastUsed: 1, tabGroups: [], windows: [
            { kind: "main", tabs: [{ type: "reader", title: "A", libraryID: att.libraryID, itemKey: att.key, selected: true }], collection: "L" + Zotero.Libraries.userLibraryID },
            { kind: "reader", tabs: [{ type: "reader", title: "B", libraryID: att2.libraryID, itemKey: att2.key, selected: true }], geom: { x: 70, y: 70, w: 700, h: 500, dpr: 1, st: 3 } },
        ] });
        await wv._wvTabSessionSwitch(id);
        assert.strictEqual(Zotero.getMainWindows().length, 2);
        assert.strictEqual(count(att.id), 1);
        assert.strictEqual(count(att2.id), 1);
        const w = windowOf(att2.id);
        assert.notOk(w.Zotero_Tabs._tabs.some(t => t.type.startsWith("library")), "no library tab");
    });
});
