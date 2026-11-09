/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// zotero#6035 (native multiple windows and library tabs): a Zotero with
// `Zotero.Prefs.setForWindow` brings its own windows, and Weavero's stand down
// (MJT 2026-11-06, the measured breaks in the upstream-collision checklist):
// a tear-off closed the reader, a saved windows.json opened documents twice,
// Weavero's spawn left a tabless window on "Loading".
//
// The first half stubs the switch on, so it guards every Zotero the suite runs
// on. The second needs a real build of that work and is pending elsewhere.

describe("Weavero — native windows (zotero#6035)", () => {
    let wv, lib, win;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        win = Zotero.getMainWindow();
        if (!wv || !lib) wvT.absent("!wv");
    });

    /** Run `fn` with the switch on, real or stubbed. */
    async function withNative(fn) {
        if (realNative) return fn();
        Z.Prefs.setForWindow = () => {};
        try { return await fn(); }
        finally { delete Z.Prefs.setForWindow; }
    }

    /** Run `fn` with plugin method `name` replaced; own-property safe. */
    async function withStub(host, name, stub, fn) {
        const own = Object.prototype.hasOwnProperty.call(host, name);
        const orig = host[name];
        host[name] = stub;
        try { return await fn(); }
        finally { if (own) host[name] = orig; else delete host[name]; }
    }

    it("the switch reads either of its two signs, nothing else", async () => {
        if (!realNative) {
            assert.isFalse(lib.wvNativeWindows(), "off on a Zotero without them");
            Z.Session.addClosedWindow = () => {};
            try { assert.isTrue(lib.wvNativeWindows(), "the session's sign alone"); }
            finally { delete Z.Session.addClosedWindow; }
        }
        await withNative(() => assert.isTrue(lib.wvNativeWindows(), "the prefs' sign"));
    });

    // The switch once read one name, which the merge removed: on the real commits
    // it stayed off, with no error, and every break was back. Whatever Zotero
    // renames next, a window with a library view and the switch off fails here.
    it("TRIPWIRE: the switch agrees with the library-view element", () => {
        const hasViews = !!(win.ZoteroPane.libraryView || win.document.querySelector("library-view"));
        assert.strictEqual(lib.wvNativeWindows(), hasViews, "Zotero's windows and the switch disagree: read lib/windows.ts");
    });

    it("a load whose window closed never leaves Zotero.getMainWindow() on that window", async () => {
        const real = Zotero.getMainWindow();
        let end;
        const gone = { closed: true };
        const load = wv._wvWithMainWindow(gone, () => new Promise((resolve) => { end = resolve; }));
        try { assert.notStrictEqual(Zotero.getMainWindow(), gone, "the closed window is not answered"); }
        finally {
            end();
            await load;
        }
        assert.strictEqual(Zotero.getMainWindow(), real, "and it is put back");
    });

    it("Multiple main windows is off, whatever the setting says", async () => {
        const before = wv._wvMultiMainOn();
        await withNative(() => assert.isFalse(wv._wvMultiMainOn()));
        assert.strictEqual(wv._wvMultiMainOn(), before, "back as it was");
    });

    it("the spawn opens nothing: no window, no flag, nothing queued", async () => {
        const q = (wv._wvDevSpawnQueue || []).length;
        const flag = !!wv._wvPendingDevWindow;
        let opened = 0;
        try {
            await withNative(() => withStub(Z, "openMainWindow", () => { opened++; }, () => {
                assert.isNull(wv._wvSpawnMainWindowStart({ tabs: [{ type: "library" }] }));
            }));
            assert.strictEqual(opened, 0, "Zotero's open not called");
            assert.strictEqual(!!wv._wvPendingDevWindow, flag, "the flag as it was");
            assert.strictEqual((wv._wvDevSpawnQueue || []).length, q, "the queue as it was");
        }
        finally {
            wv._wvPendingDevWindow = flag;
            if (wv._wvDevSpawnQueue) wv._wvDevSpawnQueue.length = q;
        }
    });

    it("windows.json stays as it is on disk: no save writes it", async () => {
        let writes = 0;
        const frozen = wv._wvWindowStoreFrozen, quitting = wv._wvQuitting;
        try {
            await withNative(() => withStub(wv, "_wvWindowStoreWrite", () => { writes++; }, async () => {
                wv._wvWindowStoreFrozen = false;
                wv._wvQuitting = false;
                wv._wvWindowStoreSaveSync();
                wv._wvWindowStoreQuitFlush();
            }));
            assert.strictEqual(writes, 0);
        }
        finally {
            wv._wvWindowStoreFrozen = frozen;
            wv._wvQuitting = quitting;
        }
    });

    it("every step of the startup restore stands down first thing", () => {
        for (const m of ["_wvWTLoadRestoreMap", "_wvRestoreAnchorTabs", "_wvBgRestoreStart", "_wvFocusShepherdStart",
            "_wvPreemptReaderWindowReopen", "_wvWindowStoreRestoreOrphanReaderWindows", "_wvWindowStoreRestoreUnclaimedReaderWindows",
            "_wvReconcileAnchorSessionTabs", "_wvEnablePullBackReaderTabs"]) {
            const head = wvT.src(m).slice(0, 400);
            assert.match(head, /wvNativeWindows\d*\(\)/, m);
        }
        assert.match(wvT.src("_wvWindowStoreRestoreDevWindows"), /_wvMultiMainOn\(\)/, "the extra windows, through the one switch");
    });

    it("the wiring table: Zotero's twins stay out, the rest is wired", async () => {
        const off = wv._wvMainWires().filter(e => e.nativeOff).map(e => e.id).sort();
        // advsearch-new-window is wired there too since 1.0.1-dev.2 (the port,
        // test/native-advsearch-window.spec.js): Shift+click is Zotero's, the
        // rest of its routes Weavero's.
        assert.deepEqual(off, ["context-pane-guard", "itemdetails-tabselect", "items-cross-window-drop",
            "managed-window", "new-tab-shortcut", "new-window-shortcut", "tag-selector-class", "window-pane-prefs"]);
        const wires = wv._wvMainWires();
        const saved = wires.map(e => e.wire);
        const ran = new Set();
        try {
            for (const e of wires) e.wire = () => { ran.add(e.id); };
            await withNative(() => wv._wvWireMainWindow(win, "init"));
        }
        finally { wires.forEach((e, i) => { e.wire = saved[i]; }); }
        for (const id of off) assert.isFalse(ran.has(id), id + " wired");
        for (const id of ["loaduri-hook", "items-list-filter", "tree-click-delegate"]) assert.isTrue(ran.has(id), id + " not wired");
    });

    it("Zotero's reader-move hook stays Zotero's, and the old swap refuses", async () => {
        const hooks = { reader: async () => {} };
        const fake = { Zotero_Tabs: { tabHooks: { moveToNewWindow: hooks } } };
        const orig = hooks.reader;
        await withNative(async () => {
            wv._wvWrapMoveToNewWindowHook(fake);
            assert.strictEqual(hooks.reader, orig, "not wrapped");
            assert.isFalse(await wv._wvSwapTearOffToWindow(win, {}, 1), "nothing touched: the caller falls back");
        });
    });

    it("a tab moved to another window goes through Zotero's move", async () => {
        let moved = null;
        const src = { Zotero_Tabs: { _tabs: [], moveToWindow: async (id, w) => { moved = [id, w]; return "new-id"; } } };
        const tgt = { Zotero_Tabs: { _tabs: [] } };
        await withNative(() => wv._wvMoveTabToTarget(src, "tab-a", { win: tgt, isReader: false, groupId: null }));
        assert.deepEqual(moved, ["tab-a", tgt]);
    });

    it("no new-window buttons in the move rows", async () => {
        const doc = win.document;
        await withNative(() => {
            const row = wv._wvNewWindowIconRow(doc, false, [
                { main: false, grp: false, tip: "New Reader Window", fn: () => {} },
                { main: true, grp: false, tip: "New Main Window", fn: () => {} },
            ]);
            assert.strictEqual(row.children.length, 0);
        });
    });

    it("a reader move and a move of no group open nothing", async () => {
        await withNative(async () => {
            await withStub(Z, "openMainWindow", () => { throw new Error("opened a window"); }, async () => {
                await wv._wvMoveTabsToNewReaderWindow(win, ["no-such-tab"]);
                await wv._wvTabGroupMoveToNewWindow(win, "no-such-group");
                await wv._wvMoveGroupToWindowAt("no-such-group", win, false, null);
            });
        });
    });

    // File: Zotero has New Tab and New Window there. Edit: Advanced Search in
    // New Window stays (the port, MJT 2026-11-07), shown where Zotero has the
    // route, and the shortcut sits on whichever line Settings gives it.
    it("File: Weavero's entries stay hidden; Edit: Advanced Search in New Window shows, the shortcut follows the setting", async () => {
        if (!wv._wvMenubarMenus) wvT.absent("_wvMenubarMenus");
        const doc = win.document;
        const anchor = doc.getElementById("menu_advancedSearch");
        const popup = doc.createXULElement("menupopup");
        doc.documentElement.appendChild(popup);
        const show = (menu) => {
            const el = doc.createXULElement(menu.menuType === "separator" ? "menuseparator" : "menuitem");
            popup.appendChild(el);
            let vis = null;
            menu.onShowing(null, { menuElem: el, setVisible: (v) => { vis = v; } });
            return vis;
        };
        const key = anchor ? anchor.getAttribute("key") : null;
        const remap = Zotero.Prefs.get("weavero.advSearchShortcutNewWindow");
        try {
            await withNative(async () => {
                for (const m of wv._wvMenubarMenus.file) assert.isFalse(show(m), "File entry shown");
                if (!anchor) return;
                const zp = win.ZoteroPane;
                const run = async () => {
                    Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", false);
                    assert.isTrue(show(wv._wvMenubarMenus.edit[0]), "Edit entry hidden");
                    assert.strictEqual(anchor.getAttribute("key"), "key_advancedSearch", "the setting off: the key on Zotero's line");
                    Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
                    assert.isTrue(show(wv._wvMenubarMenus.edit[0]));
                    assert.isNull(anchor.getAttribute("key"), "the setting on: the shortcut is the entry's");
                };
                if (typeof zp.openAdvancedSearchInNewWindow === "function") await run();
                else await withStub(zp, "openAdvancedSearchInNewWindow", () => null, run);
            });
        }
        finally {
            if (remap !== undefined) Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", remap);
            if (anchor) { if (key == null) anchor.removeAttribute("key"); else anchor.setAttribute("key", key); }
            popup.remove();
            for (const el of doc.querySelectorAll("[data-wv-menubar='advsearchwin']")) { if (!el.closest("#main-menubar, menubar")) el.remove(); }
        }
    });

    it("the collection menu's Hide reads the rows Zotero built it for, not the selection", () => {
        assert.match(wvT.src("_wvHidBuildMenu"), /_wvHidMenuRows/);
    });

    it("a tab drag leaves the tear-off and the move between windows to Zotero", () => {
        const s = wvT.src("_wireTabBarDrag");
        assert.match(s, /!wvNativeWindows\d*\(\)[^;]*\(offWindow \|\| outsideStrip\)|\(offWindow \|\| outsideStrip\)[^;{]*!wvNativeWindows\d*\(\)/, "the tear-off gated");
        assert.match(s, /setData\("application\/x-weavero-tab-move"/, "still there for older Zotero");
    });

    describe("on a real native build", () => {
        let att, spare;

        before(async function () {
            if (!realNative) this.skip();
            this.timeout(60000);
            att = await wvT.createTestPDFItem("wv-native-windows");
            spare = Zotero.getMainWindows().length;
        });

        /** Close every window a test opened, the first stays. */
        async function closeExtras() {
            for (const w of Zotero.getMainWindows().slice(spare)) { try { w.close(); } catch (e) {} }
            await wvT.waitFor(() => Zotero.getMainWindows().length <= spare, 8000);
        }
        afterEach(async function () {
            if (!realNative) return;
            this.timeout(20000);
            for (const r of (Zotero.Reader._readers || []).slice()) wvT.closeReaderTab(r);
            await closeExtras();
        });
        after(async function () {
            if (att) await wvT.erase(att);
        });

        it("Ctrl+N's command: a window with its own library tab, wired by Weavero", async function () {
            this.timeout(30000);
            const opened = await Promise.resolve(win.ZoteroPane.newWindow());
            const w = opened || await wvT.waitFor(() => Zotero.getMainWindows().find(x => x !== win), 15000);
            assert.isOk(w, "a window");
            assert.isOk(await wvT.waitFor(() => w.ZoteroPane && w.ZoteroPane.libraryView && w.Zotero_Tabs._tabs.length === 1, 15000), "one library tab");
            assert.isNotOk(w._wvManagedWindow, "not one of Weavero's");
        });

        it("a torn-off reader lands in a window of its own, the same reader, once", async function () {
            this.timeout(45000);
            const r = await wvT.openReaderTab(att.id);
            assert.isOk(r, "the reader");
            const src = r._window;
            const tabID = r.tabID;
            src.Zotero_Tabs._onTabTearOff(tabID, 120, 120);
            const w = await wvT.waitFor(() => (r._window !== src ? r._window : null), 15000);
            assert.isOk(w, "the reader moved to another window");
            assert.notOk(src.Zotero_Tabs._tabs.some(t => t.id === tabID), "gone from the first");
            assert.strictEqual(Zotero.Reader._readers.filter(x => x.itemID === att.id).length, 1, "one reader");
            await wvT.sleep(1500);
            assert.isFalse(w.closed, "the window stays");
            assert.strictEqual(r._window, w, "and keeps it");
            // No library view, and Weavero's wiring all the same: the compact title bar
            // whole, its window buttons clear of the tab bar's (MJT 2026-11-07, they
            // overlapped), and the styles a window gets at load.
            const d = w.document;
            // macOS has no compact title bar (_applyCompactTitleBar returns
            // there: the system draws the window buttons and the menu bar).
            assert.strictEqual(!!w._wvCompactTitleBar, !!wv._getCompactTitleBarMain() && !Zotero.isMac, "the full setup, not the early hide alone");
            assert.isOk(await wvT.waitFor(() => d.querySelector("#wv-styles, style[id^='wv-'], link[href*='weavero']"), 5000), "Weavero's styles");
            const box = d.querySelector(".titlebar-buttonbox").getBoundingClientRect();
            for (const id of ["zotero-tb-tabs-menu", "zotero-tb-sync"]) {
                const b = d.getElementById(id).getBoundingClientRect();
                const apart = b.right <= box.left || b.left >= box.right || b.bottom <= box.top || b.top >= box.bottom;
                assert.isTrue(apart, id + " clear of the window buttons");
            }
        });

        it("a second library tab is a library tab, and the library is still reached with the first one closed", async function () {
            this.timeout(45000);
            const w = await wvT.openMainWindow();
            const T = w.Zotero_Tabs;
            w.ZoteroPane.newLibraryTab();
            const second = await wvT.waitFor(() => T._tabs.find(t => t.id !== "zotero-pane" && t.type.startsWith("library")), 10000);
            assert.isOk(second, "a second library tab");
            assert.isTrue(lib.wvIsLibraryTabID(second.id));
            assert.isFalse(lib.wvIsLibraryTabID("no-such-tab"));
            T.close("zotero-pane");
            await wvT.waitFor(() => !T._tabs.some(t => t.id === "zotero-pane"), 5000);
            await Zotero.Reader.open(att.id, null, /** @type {any} */ ({ window: w }));
            const r = await wvT.waitFor(() => Zotero.Reader._readers.find(x => x.itemID === att.id), 10000);
            assert.strictEqual(r._window, w, "a reader to come back from, in that window");
            await wvT.waitFor(() => T.selectedID === r.tabID, 8000);
            lib.wvSelectLibraryTab(w);
            assert.isOk(await wvT.waitFor(() => T.isLibraryTab(T.selectedID), 8000), "on a library tab");
            assert.strictEqual(T.selectedID, second.id, "the one it has");
        });

        it("Show in Library from a window whose first library tab is closed", async function () {
            this.timeout(45000);
            const w = await wvT.openMainWindow();
            const T = w.Zotero_Tabs;
            w.ZoteroPane.newLibraryTab();
            const second = await wvT.waitFor(() => T._tabs.find(t => t.id !== "zotero-pane" && t.type.startsWith("library")), 10000);
            T.close("zotero-pane");
            await Zotero.Reader.open(att.id, null, /** @type {any} */ ({ window: w }));
            const r = await wvT.waitFor(() => Zotero.Reader._readers.find(x => x.itemID === att.id), 10000);
            await wvT.waitFor(() => T.selectedID === r.tabID, 8000);
            w.focus();
            await wvT.waitFor(() => Zotero.getMainWindow() === w, 5000);
            const shown = /** @type {any} */ (Zotero.getMainWindow());
            wv._navigateToItem(att);
            assert.isOk(await wvT.waitFor(() => shown.Zotero_Tabs.isLibraryTab(shown.Zotero_Tabs.selectedID), 8000), "on the library");
            if (shown === w) assert.strictEqual(T.selectedID, second.id);
        });

        it("a library tab not shown yet: the jump waits for its view", async function () {
            this.timeout(45000);
            const w = await wvT.openMainWindow();
            const T = w.Zotero_Tabs;
            await Zotero.Reader.open(att.id, null, /** @type {any} */ ({ window: w }));
            await wvT.waitFor(() => Zotero.Reader._readers.find(x => x.itemID === att.id && x._window === w), 10000);
            w.ZoteroPane.newLibraryTab();
            const fresh = await wvT.waitFor(() => T._tabs.find(t => t.id !== "zotero-pane" && t.type.startsWith("library")), 10000);
            T.select(T._tabs.find(t => t.type.startsWith("reader")).id);
            await lib.wvOpenLibraryView(w);
            assert.isTrue(T.isLibraryTab(T.selectedID), "on a library tab");
            assert.isOk(w.ZoteroPane.collectionsView, "its view is there, " + (fresh && fresh.id));
        });

        it("a window with no library tab: the jump to the library opens one, and does not throw", async function () {
            this.timeout(45000);
            const r = await wvT.openReaderTab(att.id);
            const src = r._window;
            src.Zotero_Tabs._onTabTearOff(r.tabID, 120, 120);
            const w = await wvT.waitFor(() => (r._window !== src ? r._window : null), 15000);
            assert.isOk(w, "a window with the reader alone");
            lib.wvSelectLibraryTab(w);
            assert.isOk(await wvT.waitFor(() => w.Zotero_Tabs.isLibraryTab(w.Zotero_Tabs.selectedID), 8000), "a library tab there");
        });

        it("a tab group in a window with no library tab shows its chip", async function () {
            this.timeout(45000);
            const r = await wvT.openReaderTab(att.id);
            const src = r._window;
            src.Zotero_Tabs._onTabTearOff(r.tabID, 140, 140);
            const w = await wvT.waitFor(() => (r._window !== src ? r._window : null), 15000);
            assert.isOk(w, "a window with the reader alone");
            assert.strictEqual(lib.wvFirstDocTab(w.Zotero_Tabs._tabs), 0, "its first tab is the document");
            assert.strictEqual(lib.wvFirstDocTab(src.Zotero_Tabs._tabs), 1, "past the library tab");
            const g = wv._tabGroupCreate("wv-native-window-group", wv._wvTabGroupNextColor());
            try {
                wv._wvTabGroupAddTab(w, r.tabID, g.id);
                assert.isOk(await wvT.waitFor(() => w.document.querySelector(".wv-tab-group-chip"), 8000), "the chip");
            }
            finally {
                wv._tabGroupsSet(wv._tabGroupsGet().filter(x => x.id !== g.id));
            }
        });

        it("what Zotero moved into the library view stays wired there", () => {
            const v = win.ZoteroPane.libraryView;
            assert.isOk(v && v._wvWraps && v._wvWraps.setTagScope, "WV-TEMP-134330, the Tag Selector's scope");
            assert.isTrue(Object.prototype.hasOwnProperty.call(v, "toggleAdvancedSearchState"), "the collapse to the quick search");
            assert.isOk(win.ZoteroPane.collectionsView._wvOrigCanDropCheck, "WV-TEMP-134361, the drop on a library row");
            assert.isTrue(wv._wvPinDeferNeeded(win.document.querySelector("#zotero-item-pane item-details")), "WV-TEMP-REG37, the pin set aside");
        });

        it("a window holding only a note is reached by the note sweeps", async function () {
            this.timeout(30000);
            const note = new Zotero.Item("note");
            note.libraryID = Zotero.Libraries.userLibraryID;
            note.setNote("<p>WV-TEST note-only window</p>");
            await note.saveTx();
            try {
                await Zotero.Notes.open(note.id, null, { openInWindow: true });
                const w = await wvT.waitFor(() => Zotero.getMainWindows().find(x => !x.ZoteroPane.libraryView && x.document.querySelector("note-editor")), 15000);
                assert.isOk(w, "a window with a note and no library view");
                // includes(), not assert.include: chai inspects the value it is given,
                // and printing a window or an element fails with no message.
                const ne = w.document.querySelector("note-editor");
                assert.isTrue(wv._wvNnAllEditors().includes(ne), "the note sweeps see its editor");
            }
            finally {
                await closeExtras();
                await wvT.erase(note);
            }
        });

        it("no deck window: a note opens in Zotero's own", () => {
            assert.isFalse(!!wv._getNoteOpenInDeckWindow());
        });

        it("Weavero's own window path is closed: nothing tabless opens", async function () {
            this.timeout(20000);
            const before = Zotero.getMainWindows().length;
            wv._wvOpenEmptyMainWindow();
            await wvT.sleep(1500);
            assert.strictEqual(Zotero.getMainWindows().length, before);
        });
    });
});
