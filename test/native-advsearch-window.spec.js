/* global describe, it, before, after, assert, Zotero, wvT */

// Advanced Search in New Window on a Zotero with its own windows (zotero#6035;
// MJT 2026-11-07, "Ok" to the port). Zotero's main has its own route
// (libraryView.openAdvancedSearchInNewWindow, Shift+click on the funnel), so
// Weavero's routes -- Edit > Advanced Search in New Window, Ctrl+Shift+F when
// Settings says so, middle-click and the funnel's right-click menu -- call it,
// and every window it opens gets what an older Zotero's Advanced Search window
// had: its remembered size, centred, the side panes hidden (Settings), the
// search focused. The hidden panes never reach the layout every window shares
// (pane.persist): measured on 228f132e1, a search window closed with its panes
// collapsed wrote them there, for every window opened after it.
//
// The first half stubs the switch on, so it guards every Zotero the suite runs
// on; the second opens real windows and needs a Zotero with its own windows.

describe("Weavero — Advanced Search in New Window on a Zotero with its own windows", () => {
    let wv, lib, win, doc;
    const Z = /** @type {any} */ (Zotero);
    const realNative = wvT.nativeWindows();
    const PREFS = ["enableTabsAndWindows", "newMainWindow", "advSearchShortcutNewWindow", "advSearchWindowHidePanes", "advSearchWindowSize", "advSearchWindowOuter"];
    const saved = {};

    before(function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("!wv");
        win = Zotero.getMainWindow();
        doc = win.document;
        for (const k of PREFS) saved[k] = Zotero.Prefs.get("weavero." + k);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
    });

    after(() => {
        // Every one has a default-branch value or is a plain string: `set` back,
        // never clearUserPref (a cleared pref can't be re-created until restart).
        for (const k of PREFS) if (saved[k] !== undefined) Zotero.Prefs.set("weavero." + k, saved[k]);
    });

    /** Run `fn` with the switch on, real or stubbed. */
    async function withNative(fn) {
        if (realNative) return fn();
        Z.Prefs.setForWindow = () => {};
        try { return await fn(); }
        finally { delete Z.Prefs.setForWindow; }
    }

    /** Run `fn` with `host[name]` replaced; own-property safe. */
    async function withStub(host, name, stub, fn) {
        const own = Object.prototype.hasOwnProperty.call(host, name);
        const orig = host[name];
        host[name] = stub;
        try { return await fn(); }
        finally { if (own) host[name] = orig; else delete host[name]; }
    }

    const funnel = () => doc.querySelector('[id^="zotero-tb-search-advanced-button"]');
    const fakeEvent = (o) => Object.assign({ shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, button: 0, prevented: 0, preventDefault() { this.prevented++; }, stopPropagation() {}, stopImmediatePropagation() {} }, o);

    it("the window Zotero opens for a search, and no other", () => {
        const f = lib.wvAdvSearchWindowArgs;
        const open = { libraryTabState: { collections: ["L1"], advancedSearch: { state: "open", type: "temporary", active: false } }, windowSettings: {} };
        assert.isTrue(f(open), "openAdvancedSearchInNewWindow");
        assert.isFalse(f({ libraryTabState: { collections: ["L1"], focusedCollection: "L1" } }), "New Window");
        assert.isFalse(f(Object.assign({}, open, { geometry: { screenX: 1, screenY: 1, width: 900, height: 600 } })), "a torn-off library tab");
        assert.isFalse(f(Object.assign({}, open, { sessionState: {} })), "a restored window");
        assert.isFalse(f({ libraryTabState: { advancedSearch: { state: "closed" } } }), "a closed search");
        assert.isFalse(f(null));
        assert.isFalse(f(undefined));
    });

    it("its size: the remembered content plus the frame, centred, never larger than the screen", () => {
        const g = lib.wvAdvSearchGeometry;
        const avail = { left: 0, top: 0, width: 1920, height: 1040 };
        assert.deepEqual(g("", { w: 16, h: 8 }, avail), { screenX: 402, screenY: 156, width: 1116, height: 728 }, "the default");
        assert.deepEqual(g("984x632", { w: 16, h: 8 }, avail), { screenX: 460, screenY: 200, width: 1000, height: 640 }, "a remembered size");
        assert.strictEqual(g("5000x4000", { w: 0, h: 0 }, avail).width, 1920, "capped at the screen");
        assert.strictEqual(g("garbage", { w: 999, h: -3 }, avail).width, 1100, "a garbage size and an absurd frame fall back");
        assert.strictEqual(g("1000x600", { w: 0, h: 0 }, { left: -1920, top: 0, width: 1920, height: 1080 }).screenX, -1460, "a screen left of the primary");
    });

    it("the Tabs and Windows master decides there, not Multiple main windows", async () => {
        Zotero.Prefs.set("weavero.newMainWindow", false);
        Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
        try {
            await withNative(() => {
                assert.isTrue(wv._wvAdvSearchWindowsOn(), "on with Multiple main windows off");
                assert.isTrue(wv._getAdvSearchShortcutNewWindow(), "the shortcut setting reads through");
                Zotero.Prefs.set("weavero.enableTabsAndWindows", false);
                assert.isFalse(wv._wvAdvSearchWindowsOn(), "off with the master");
                assert.isFalse(wv._getAdvSearchShortcutNewWindow(), "and the shortcut with it");
            });
            if (!realNative) assert.isFalse(wv._wvAdvSearchWindowsOn(), "an older Zotero: Multiple main windows off is off");
        }
        finally {
            Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
            Zotero.Prefs.set("weavero.newMainWindow", saved.newMainWindow === undefined ? true : saved.newMainWindow);
        }
    });

    it("Weavero's routes open it as Shift+click does: the active view, its quick search, the window's mode", async () => {
        await withNative(async () => {
            const calls = [];
            const view = {
                getElement: (id) => (id === "zotero-tb-search" ? { value: "bubble wv" } : null),
                openAdvancedSearchInNewWindow: (t, m) => { calls.push([t, m]); return null; },
            };
            const fakeWin = { closed: false, document: doc, ZoteroPane: { libraryView: view } };
            const gfw = Z.Prefs.getForWindow;
            Z.Prefs.getForWindow = (w, name) => (name === "search.quicksearch-mode" ? "titleCreatorYear" : Z.Prefs.get(name));
            try {
                wv._wvAdvSearchLastOpen = 0;
                await wv._wvAdvSearchOpenNewWindow(fakeWin);
            }
            finally {
                if (gfw) Z.Prefs.getForWindow = gfw;
                else delete Z.Prefs.getForWindow;
                wv._wvAdvSearchLastOpen = 0;
            }
            assert.deepEqual(calls, [["bubble wv", "titleCreatorYear"]]);
        });
    });

    it("Ctrl+Shift+F follows the setting there; Shift+click on the funnel stays Zotero's", async () => {
        await withNative(async () => {
            const key = doc._wvAdvSearchKeyHandler;
            assert.isFunction(key, "the window is wired on this Zotero too");
            const calls = [];
            await withStub(wv, "_wvAdvSearchOpenNewWindow", function (...a) { calls.push(a); }, async () => {
                const press = () => fakeEvent({ key: "F", shiftKey: true, ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac });
                Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
                const on = press();
                key(on);
                assert.strictEqual(calls.length, 1, "the setting on: a new window");
                assert.strictEqual(on.prevented, 1, "and Zotero's own shortcut does not run too");
                Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", false);
                const off = press();
                key(off);
                assert.strictEqual(calls.length, 1, "the setting off: Zotero's");
                assert.strictEqual(off.prevented, 0);
                Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
                const f = funnel();
                if (f && doc._wvAdvSearchWinHandler) {
                    const click = fakeEvent({ type: "click", shiftKey: true, target: f });
                    doc._wvAdvSearchWinHandler(click);
                    assert.strictEqual(click.prevented, 0, "Shift+click is left to Zotero");
                    assert.strictEqual(calls.length, 1);
                }
            });
        });
    });

    it("the funnel's right-click menu and middle-click lead there too", async function () {
        const f = funnel();
        if (!f) this.skip();
        await withNative(async () => {
            const ctx = doc._wvAdvSearchCtxHandler, mid = doc._wvAdvSearchMidHandler;
            assert.isFunction(ctx, "right-click wired");
            assert.isFunction(mid, "middle-click wired");
            const menus = [], opens = [];
            await withStub(wv, "_wvAdvSearchContextMenu", function (...a) { menus.push(a); }, async () => {
                await withStub(wv, "_wvAdvSearchOpenNewWindow", function (...a) { opens.push(a); }, async () => {
                    const r = fakeEvent({ type: "contextmenu", button: 2, target: f });
                    ctx(r);
                    assert.strictEqual(menus.length, 1, "the menu opens");
                    const m = fakeEvent({ type: "auxclick", button: 1, target: f });
                    mid(m);
                    assert.strictEqual(opens.length, 1, "middle-click opens the window");
                });
            });
        });
    });

    it("the hidden side panes never reach the layout every window shares, and a pane shown again is the user's", async () => {
        const mk = () => doc.createXULElement("box");
        const els = { "zotero-collections-pane": mk(), "zotero-collections-splitter": mk(), "zotero-item-pane": mk(), "zotero-items-splitter": mk() };
        els["zotero-items-splitter"].setAttribute("orient", "vertical");
        const view = { getElement: (id) => els[id] || null };
        const seen = [];
        const snap = () => ["zotero-collections-splitter", "zotero-collections-pane", "zotero-items-splitter", "zotero-item-pane"]
            .map((id) => els[id].getAttribute(id.endsWith("splitter") ? "state" : "collapsed"));
        const zp = {
            libraryView: view,
            updateLayoutConstraints() {},
            serializePersist(v) { seen.push(snap()); return v; },
        };
        const orig = zp.serializePersist;
        const fakeWin = { closed: false, document: doc, ZoteroPane: zp, addEventListener() {}, removeEventListener() {} };
        wv._wvAdvSearchHidePanesNative(fakeWin);
        assert.deepEqual(snap(), ["collapsed", "true", "collapsed", "true"], "both side panes hidden");
        zp.serializePersist(view);
        assert.deepEqual(seen.pop(), [null, null, null, null], "Zotero saves the layout the window had before");
        assert.deepEqual(snap(), ["collapsed", "true", "collapsed", "true"], "and the window keeps them hidden");
        assert.deepEqual(wv._wvAdvSearchPanesHidden(fakeWin), ["zotero-collections-pane", "zotero-item-pane"]);
        // The user brings the collections pane back (View > Layout): it is theirs.
        els["zotero-collections-splitter"].setAttribute("state", "open");
        els["zotero-collections-pane"].removeAttribute("collapsed");
        zp.serializePersist(view);
        assert.deepEqual(seen.pop(), ["open", null, null, null], "the pane shown again is saved as shown");
        assert.deepEqual(wv._wvAdvSearchPanesHidden(fakeWin), ["zotero-item-pane"]);
        wv._wvAdvSearchUnhidePanesNative(fakeWin);
        assert.strictEqual(zp.serializePersist, orig, "unwrapped");
        assert.deepEqual(snap(), ["open", null, null, null], "the hidden pane is shown again, the user's left alone");
        assert.strictEqual(els["zotero-items-splitter"].getAttribute("orient"), "vertical", "nothing else touched");
    });

    it("Zotero putting the shared layout back keeps the panes hidden; a save writes that shared layout; the list holds through a save", async () => {
        // zotero#6035 adoptSharedState -> unserializePersist on every tab
        // selection: a shared "open" showed the hidden collections pane again
        // (full suite, 2026-11-09). And the pane-width layer saves the
        // window's state INSIDE serializePersist, while the save shows the
        // panes: the list must still name them.
        const mk = () => doc.createXULElement("box");
        const els = { "zotero-collections-pane": mk(), "zotero-collections-splitter": mk(), "zotero-item-pane": mk(), "zotero-items-splitter": mk() };
        els["zotero-collections-splitter"].setAttribute("zotero-persist", "state");
        els["zotero-items-splitter"].setAttribute("zotero-persist", "state orient");
        for (const id of Object.keys(els)) els[id].id = id;
        const view = { getElement: (id) => els[id] || null };
        const shared = { "zotero-collections-splitter": { state: "open" } };
        const seen = [], lists = [];
        const snap = () => ["zotero-collections-splitter", "zotero-collections-pane", "zotero-items-splitter", "zotero-item-pane"]
            .map((id) => els[id].getAttribute(id.endsWith("splitter") ? "state" : "collapsed"));
        const fakeWin = { closed: false, document: doc, addEventListener() {}, removeEventListener() {} };
        const zp = {
            libraryView: view,
            updateLayoutConstraints() {},
            // as Zotero's: the attributes into the shared layout; and, as the
            // pane-width layer does, the window's own state saved inside it
            serializePersist(v) { seen.push(snap()); lists.push(wv._wvAdvSearchPanesHidden(fakeWin)); return v; },
            // as Zotero's: every persisted attribute of the shared layout put back
            unserializePersist(v) {
                for (const id of Object.keys(shared)) for (const a of Object.keys(shared[id])) els[id].setAttribute(a, shared[id][a]);
                return v;
            },
        };
        fakeWin.ZoteroPane = zp;
        await wvT.withPref("pane.persist", JSON.stringify(shared), async () => {
            wv._wvAdvSearchHidePanesNative(fakeWin);
            assert.deepEqual(snap(), ["collapsed", "true", "collapsed", "true"], "both hidden");
            zp.unserializePersist(view);
            assert.deepEqual(snap(), ["collapsed", "true", "collapsed", "true"], "still both hidden after Zotero's restore");
            zp.serializePersist(view);
            assert.deepEqual(seen.pop(), ["open", null, null, null], "the save writes the shared layout, collections open");
            assert.deepEqual(lists.pop(), ["zotero-collections-pane", "zotero-item-pane"], "the list during the save");
            assert.deepEqual(wv._wvAdvSearchPanesHidden(fakeWin), ["zotero-collections-pane", "zotero-item-pane"], "and after it");
            wv._wvAdvSearchUnhidePanesNative(fakeWin);
            assert.isNotOk(Object.prototype.hasOwnProperty.call(zp, "_wvWraps"), "both layers gone");
            assert.deepEqual(snap(), ["open", null, null, null], "shown again as the shared layout has them");
        });
    });

    describe("real windows (a Zotero with its own windows)", function () {
        const opened = [];

        before(function () {
            if (!realNative) this.skip();
        });

        after(async () => {
            for (const w of opened) { try { if (!w.closed) w.close(); } catch (e) {} }
        });

        /** The main window that appears after `fn`, once its library view is up. */
        async function newWindowAfter(fn) {
            const before = new Set(Zotero.getMainWindows());
            await fn();
            const nw = await wvT.waitFor(() => Zotero.getMainWindows().find((w) => !before.has(w) && w.ZoteroPane && w.ZoteroPane.libraryView) || null, 20000);
            opened.push(nw);
            return nw;
        }

        // The side panes' hidden-or-shown state in the shared layout: only
        // `state` (a closing window also writes its splitter's `orient`, as any
        // Zotero window does).
        const splitters = (s) => {
            try {
                const o = JSON.parse(s || "{}");
                return JSON.stringify(["zotero-collections-splitter", "zotero-items-splitter"].map((k) => (o[k] && o[k].state) || null));
            }
            catch (e) { return "unparsed " + s; }
        };

        it("Weavero's route: Zotero's search window at its size, side panes hidden, search focused; the shared layout untouched", async function () {
            this.timeout(60000);
            Zotero.Prefs.set("weavero.advSearchWindowHidePanes", true);
            // Above the main window's minimum width (943 px, measured 2026-09-22).
            Zotero.Prefs.set("weavero.advSearchWindowOuter", "1000x640");
            const p0 = Zotero.Prefs.get("pane.persist");
            wv._wvAdvSearchLastOpen = 0;
            const nw = await newWindowAfter(() => wv._wvAdvSearchOpenNewWindow(win));
            assert.ok(nw, "a window opened");
            const v = nw.ZoteroPane.libraryView;
            assert.ok(await wvT.waitFor(() => (v.getElement("zotero-collections-splitter").getAttribute("state") === "collapsed" ? true : null), 15000), "the collections pane hidden");
            assert.strictEqual(v.getElement("zotero-items-splitter").getAttribute("state"), "collapsed", "the item pane hidden too");
            const deck = v.getElement("zotero-advanced-search-pane-deck");
            assert.ok(await wvT.waitFor(() => (deck && deck.state === "open" ? true : null), 15000), "the search is open");
            assert.strictEqual(nw.windowState, nw.STATE_NORMAL, "a normal window, never maximized");
            assert.approximately(nw.outerWidth, 1000, 2, "the remembered width");
            assert.approximately(nw.outerHeight, 640, 2, "the remembered height");
            const st = JSON.parse(nw.ZoteroPane.getWindowSettings().prefs["weavero.windowState"] || "{}");
            const why = JSON.stringify({ st, hid: (nw._wvAdvHid || []).map((h) => h.id + ":" + h.state), ids: Zotero.getMainWindows().map((w) => w._wvWinStateId || null) });
            assert.deepEqual(st.advPanes, ["zotero-collections-pane", "zotero-item-pane"], "saved with the window, for a restart " + why);
            nw.close();
            await wvT.waitFor(() => (nw.closed ? true : null), 10000);
            await Zotero.Promise.delay(500);
            assert.strictEqual(splitters(Zotero.Prefs.get("pane.persist")), splitters(p0), "the shared layout is as it was");
        });

        it("Zotero's own Shift+click route gets the same window; a plain New Window gets none of it", async function () {
            this.timeout(60000);
            Zotero.Prefs.set("weavero.advSearchWindowHidePanes", true);
            const nw = await newWindowAfter(() => win.ZoteroPane.openAdvancedSearchInNewWindow("", "fields"));
            assert.ok(nw, "Zotero's route opened a window");
            const v = nw.ZoteroPane.libraryView;
            assert.ok(await wvT.waitFor(() => (v.getElement("zotero-collections-splitter").getAttribute("state") === "collapsed" ? true : null), 15000), "its collections pane hidden");
            assert.strictEqual(v.getElement("zotero-items-splitter").getAttribute("state"), "collapsed", "its item pane hidden");
            assert.ok(nw._wvAdvSearchWin, "taken for a search window");
            const p0 = Zotero.Prefs.get("pane.persist");
            nw.close();
            await wvT.waitFor(() => (nw.closed ? true : null), 10000);
            await Zotero.Promise.delay(500);
            assert.strictEqual(splitters(Zotero.Prefs.get("pane.persist")), splitters(p0), "closing it left the shared layout as it was");
            const plain = await newWindowAfter(() => win.ZoteroPane.newWindow());
            assert.ok(plain, "a plain window opened");
            await Zotero.Promise.delay(2500);
            const pv = plain.ZoteroPane.libraryView;
            const why = JSON.stringify({ args: lib.wvWindowArgs(plain), flag: !!plain._wvAdvSearchWin, persist: splitters(Zotero.Prefs.get("pane.persist")), ws: plain.ZoteroPane.getWindowSettings().prefs["weavero.windowState"] });
            assert.isNotOk(plain._wvAdvSearchWin, "not taken for a search window " + why);
            assert.notStrictEqual(pv.getElement("zotero-collections-splitter").getAttribute("state"), "collapsed", "a plain window keeps the shared layout " + why);
            plain.close();
            await wvT.waitFor(() => (plain.closed ? true : null), 10000);
        });
    });
});
