/* global describe, it, before, assert, Zotero */

// Survey 2026-10-06 #17 (branch next, 0.21.9-next.10): the items-tree link
// delegate, the right-pane observer and the collections "Copy Link" menu
// were single per-plugin instances -- one window had them, and closing any
// main window (or loading another) removed them from the rest. Each is now
// per window: state on `win._wv*` expandos, setup/teardown take the window.
//
// A second main window is stood in by a FAKE window over a real document:
// what matters is that setting one window up, or tearing it down, leaves the
// other window's wiring untouched -- which the singletons could not do.

describe("Weavero — survey fixes, round E (per-window delegates)", () => {
    let wv, win;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) this.skip();
    });

    const fakeWindow = (html) => {
        const doc = win.document.implementation.createHTMLDocument("wv-e");
        doc.body.innerHTML = html;
        const fake = {
            closed: false, document: doc,
            MutationObserver: win.MutationObserver,
            setTimeout: (...a) => win.setTimeout(...a), clearTimeout: (t) => win.clearTimeout(t),
            addEventListener() {}, removeEventListener() {},
            ZoteroPane: null, Zotero_Tabs: null,
        };
        return fake;
    };

    it("the items-tree delegate is per window: another window's setup/teardown leaves this one's alone", () => {
        const mine = win._wvTreeDelegate;
        assert.isOk(mine && mine.mo, "the main window has its own delegate (wired at window load)");
        const other = fakeWindow('<div id="item-tree-main"></div>');
        wv._setupTreeClickDelegate(other);
        try {
            assert.isOk(other._wvTreeDelegate && other._wvTreeDelegate.mo, "the other window got its own delegate");
            assert.strictEqual(win._wvTreeDelegate, mine, "the main window's was not replaced");
            assert.notStrictEqual(other._wvTreeDelegate, mine);
        }
        finally { wv._teardownTreeClickDelegate(other); }
        assert.isUndefined(other._wvTreeDelegate, "torn down on request");
        assert.strictEqual(win._wvTreeDelegate, mine, "tearing the other down left this one");
        // No plugin-wide singleton remains for the delegate.
        for (const k of ["_treeClickHandler", "_treeMouseDownHandler", "_treeMouseUpHandler", "_treeMarkObserver", "_resizeHandler"]) {
            assert.isNotOk(wv[k], k + " must not be a plugin-wide field any more");
        }
    });

    it("the right-pane observer is per window, focus handlers included", () => {
        const mine = win._wvPaneObs;
        assert.isOk(mine && mine.mo && mine.focusIn && mine.focusOut, "the main window has its own observer + focus handlers");
        const other = fakeWindow("<div></div>");
        wv._setupPaneObserver(other);
        try {
            assert.isOk(other._wvPaneObs && other._wvPaneObs.mo, "the other window got its own observer");
            assert.strictEqual(win._wvPaneObs, mine, "the main window's was not replaced");
        }
        finally { wv._teardownPaneObserver(other); }
        assert.isUndefined(other._wvPaneObs);
        assert.strictEqual(win._wvPaneObs, mine);
        assert.isNotOk(wv._paneObserver, "no plugin-wide observer field");
        assert.isNotOk(wv._paneFocusInHandler, "no plugin-wide focus handler");
    });

    it("the collections Copy Link menu is bound in every window and unbound per window", function () {
        if (!wv._getEnableCopyCollectionLink()) this.skip();
        wv._setupCollectionsContextMenu();
        const menu = win.document.getElementById("zotero-collectionmenu");
        assert.isOk(menu);
        const list = () => wv._collectionMenuHandlersList || [];
        assert.strictEqual(list().filter(h => h.menu === menu).length, 1, "exactly one handler for the main window's menu");
        const other = fakeWindow('<div id="zotero-collectionmenu"></div>');
        wv._setupCollectionsMenuForWindow(other);
        const otherMenu = other.document.getElementById("zotero-collectionmenu");
        assert.strictEqual(list().filter(h => h.menu === otherMenu).length, 1, "the other window's menu is bound too");
        wv._setupCollectionsMenuForWindow(other);
        assert.strictEqual(list().filter(h => h.menu === otherMenu).length, 1, "re-binding dedups per menu");
        wv._teardownCollectionsContextMenu(other);
        assert.strictEqual(list().filter(h => h.menu === otherMenu).length, 0, "unbound for that window only");
        assert.strictEqual(list().filter(h => h.menu === menu).length, 1, "the main window keeps its entry");
        assert.isUndefined(wv._collectionMenuHandlers, "no single-instance handler field");
    });

    it("window load / unload / destroy address the window they are given", () => {
        const load = src("onMainWindowLoad"), unload = src("onMainWindowUnload"), destroy = src("destroy");
        assert.include(load, "_setupTreeClickDelegate(_window)");
        assert.include(load, "_setupPaneObserver(_window)");
        assert.include(load, "_teardownTreeClickDelegate(_window)");
        assert.include(load, "_teardownPaneObserver(_window)");
        assert.include(unload, "_teardownTreeClickDelegate(_window)");
        assert.include(unload, "_teardownCollectionsContextMenu(_window)");
        assert.include(unload, "_teardownPaneObserver(_window)");
        assert.include(unload, "_teardownTabBarWiring(_window)");
        assert.include(destroy, "_teardownPaneObserver()");
        assert.notInclude(load + unload + destroy, "_paneObserver?.disconnect");
        assert.notInclude(load + unload, "_teardownTreeClickDelegate()");
    });

    it("a window's mark observer and pane scan read THAT window's document", () => {
        assert.include(src("_setupTreeClickDelegate"), "this._markCellLinks(doc)");
        assert.include(src("_setupPaneObserver"), "this._scanPaneRows(doc)");
        assert.include(src("_markCellLinks"), "docArg || Zotero.getMainWindow().document");
        assert.include(src("_scanPaneRows"), "docArg || Zotero.getMainWindow().document");
    });
});
