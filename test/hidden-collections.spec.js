/* global describe, it, before, after, assert, Zotero, IOUtils */

// Hidden collections / saved searches / group libraries (MJT 2026-10-05):
// per main window, display-only. "Hide ..." on the row's right-click menu,
// "Show Hidden Collections ▸" on the library row, a blue dot on the library
// row while something is hidden, and Weavero's own pickers leave hidden
// collections out. The tree filter rides Zotero's `_includedInTree`.

describe("Weavero — hidden collections (per window)", () => {
    let wv, win, cv, A, A1, B, S;
    const LIB = () => Zotero.Libraries.userLibraryID;
    // Timers on the FIRST window: once a second window opens, getMainWindow()
    // returns it, and its timers do not fire before it has loaded.
    let timerWin = null;
    const sleep = (ms) => new Promise(r => (timerWin || (timerWin = Zotero.getMainWindow())).setTimeout(r, ms));
    const inTree = (obj) => cv.getRowIndexByID((obj.objectType === "search" ? "S" : "C") + obj.id) !== false;

    before(async function () {
        this.timeout(20000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvHidApply !== "function") this.skip();
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        const mk = async (name, parentID) => { const c = new Zotero.Collection(); c.name = name; if (parentID) c.parentID = parentID; await c.saveTx(); return c; };
        A = await mk("wv-hid-A");
        A1 = await mk("wv-hid-A1", A.id);
        B = await mk("wv-hid-B");
        S = /** @type {any} */ (new Zotero.Search());
        S.name = "wv-hid-search"; S.libraryID = LIB();
        S.addCondition("title", "contains", "zzz");
        await S.saveTx();
        win._wvHid = { groups: [], hidden: {} };
        wv._wvHidApply(win);
        await cv.selectLibrary(LIB());
        await cv.expandToCollection(A1.id);
        await sleep(200);
    });

    after(async function () {
        this.timeout(20000);
        if (!wv || !win) return;
        win._wvHid = { groups: [], hidden: {} };
        try { await wv._wvHidSave(win); await wv._wvHidRefreshWin(win); } catch (_) {}
        for (const o of [S, A1, A, B]) { try { if (o) await o.eraseTx(); } catch (_) {} }
    });

    it("hiding a collection removes it and its sub-collections from this window's tree", async function () {
        this.timeout(15000);
        assert.isTrue(inTree(A) && inTree(A1) && inTree(B), "all shown at first");
        await wv._wvHidHide([A], win);
        assert.isFalse(inTree(A), "A hidden");
        assert.isFalse(inTree(A1), "its sub-collection goes with it");
        assert.isTrue(inTree(B), "B untouched");
        assert.isTrue(wv._wvHidIsHidden(A, win));
        assert.isFalse(wv._wvHidIsHidden(A1, win), "only A is recorded; A1 is out because its parent is");
        assert.isTrue(wv._wvHidCollHiddenDeep(A1, win), "the pickers see A1 as hidden through its parent");
    });

    it("the state is per window: another window object hides nothing", () => {
        const other = { _wvHid: { groups: [], hidden: {} } };
        assert.isFalse(wv._wvHidIsHidden(A, other));
    });

    it("hides several rows at once (collections and a saved search)", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B, S], win);
        assert.isFalse(inTree(B));
        assert.isFalse(inTree(S));
        const listed = wv._wvHidListLibrary(LIB(), win).map(h => h.label).sort();
        assert.deepEqual(listed, ["wv-hid-A", "wv-hid-B", "wv-hid-search"]);
    });

    it("My Library shows a blue dot with a count while something is hidden", async function () {
        await sleep(100);
        wv._wvHidDecorate(win);
        const row = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
        const dot = row && row.querySelector(".wv-hid-dot");
        assert.isOk(dot, "dot on the My Library row");
        assert.include(dot.getAttribute("title"), "3 hidden collections or saved searches");
    });

    it("the library row's menu gets \"Show Hidden Collections\" with Show All and each entry; a collection's menu gets Hide", async function () {
        this.timeout(15000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        await cv.selectLibrary(LIB());
        await win.ZoteroPane.buildCollectionContextMenu();
        wv._wvHidBuildMenu(win, menu);
        const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
        assert.isOk(sm, "submenu present");
        const labels = [...sm.querySelectorAll("menuitem")].map(m => m.getAttribute("label"));
        assert.equal(labels[0], "Show All (3)");
        assert.includeMembers(labels, ["wv-hid-A", "wv-hid-B", "wv-hid-search (saved search)"]);
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
        // A shown collection's menu offers Hide.
        await wv._wvHidShow(win, LIB(), ["C" + B.key]);
        await cv.selectByID("C" + B.id);
        await win.ZoteroPane.buildCollectionContextMenu();
        wv._wvHidBuildMenu(win, menu);
        const hide = [...menu.querySelectorAll(".wv-hid-entry")].map(m => m.getAttribute("label"));
        assert.include(hide, "Hide Collection");
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
    });

    it("hiding the selected collection moves the selection to its library row", async function () {
        this.timeout(15000);
        await cv.selectByID("C" + B.id);
        await wv._wvHidHide([B], win);
        const row = cv.getRow(cv.selection.focused);
        assert.equal(row && row.id, "L" + LIB());
    });

    it("Weavero's filter Collection tree leaves hidden collections out", () => {
        const ids = wv._wvCollTreeValues(LIB(), win).map(v => v.id);
        assert.notInclude(ids, A.id);
        assert.notInclude(ids, A1.id);
        assert.notInclude(ids, B.id);
    });

    it("Show All brings everything back and the dot goes", async function () {
        this.timeout(15000);
        await wv._wvHidShow(win, LIB(), null, []);
        assert.isTrue(inTree(A) && inTree(B) && inTree(S));
        await cv.expandToCollection(A1.id);
        assert.isTrue(inTree(A1));
        wv._wvHidDecorate(win);
        const row = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
        assert.isNull(row && row.querySelector(".wv-hid-dot"));
    });

    it("the set travels in the window's saved state (restart store, Save & Close, sessions) and comes back from it", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B], win);
        const ms = wv._wvTabSessionCaptureMainState(win);
        assert.deepEqual(ms.hiddenColl && ms.hiddenColl.hidden[String(LIB())], ["C" + B.key], "captured with the library view");
        // A session switch to a state WITHOUT a set clears it...
        await wv._wvTabSessionApplyMainState(win, { collection: "L" + LIB() });
        assert.isFalse(wv._wvHidIsHidden(B, win));
        assert.isTrue(inTree(B));
        // ...and applying the captured state brings it back.
        await wv._wvTabSessionApplyMainState(win, ms);
        assert.isTrue(wv._wvHidIsHidden(B, win));
        assert.isFalse(inTree(B));
        await wv._wvHidShow(win, LIB(), null, []);
        assert.isUndefined(wv._wvTabSessionCaptureMainState(win).hiddenColl, "nothing hidden: nothing captured");
    });

    it("the window store carries the first window's set in its own field (saved even with only the library tab)", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B], win);
        wv._wvWindowStoreSaveSync();
        await sleep(300);
        const doc = JSON.parse(await IOUtils.readUTF8(wv._wvWindowStorePath()));
        assert.deepEqual(doc.anchorHidden && doc.anchorHidden.hidden[String(LIB())], ["C" + B.key]);
        await wv._wvHidShow(win, LIB(), null, []);
    });

    // Found live 2026-10-05: onMainWindowLoad ran before the new window had a
    // collections tree, so its set was saved but never filtered.
    it("a NEW main window gets its own set, applied to its own tree only", async function () {
        this.timeout(60000);
        if (typeof wv._wvOpenEmptyMainWindow !== "function" || !wv._wvMultiMainOn()) this.skip();
        const before = new Set(Zotero.getMainWindows());
        wv._wvOpenEmptyMainWindow();
        let w2 = null;
        for (let i = 0; i < 100 && !w2; i++) { await sleep(150); w2 = Zotero.getMainWindows().find(w => !before.has(w)); }
        assert.isOk(w2, "second window opened");
        try {
            const parts = () => {
                const cv2 = w2.ZoteroPane && w2.ZoteroPane.collectionsView;
                return { cv: !!cv2, tree: !!(cv2 && cv2.tree), wrapped: !!(cv2 && Object.prototype.hasOwnProperty.call(cv2, "_includedInTree")),
                    managed: !!w2._wvManagedWindow, id: w2._wvWindowId, tries: w2._wvHidApplyTries || 0 };
            };
            const ready = () => { const p = parts(); return p.cv && p.tree && p.wrapped && p.id != null; };
            for (let i = 0; i < 160 && !ready(); i++) await sleep(150);
            assert.isTrue(!!ready(), "the new window's tree is filtered: " + JSON.stringify(parts()));
            const cv2 = w2.ZoteroPane.collectionsView;
            await wv._wvHidHide([B], w2);
            assert.isFalse(cv2.getRowIndexByID("C" + B.id) !== false, "hidden in the new window");
            assert.isTrue(inTree(B), "still shown in the first window");
            await wv._wvHidShow(w2, LIB(), null, []);
        }
        finally {
            // Wait until the window is really gone and the first one has focus
            // again: the next spec's getMainWindow() must not pick up a
            // closing window (items-header-contain measured 0-px columns).
            try { w2.close(); } catch (_) {}
            for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await sleep(100);
            try { win.focus(); } catch (_) {}
            await sleep(300);
        }
    });

});
