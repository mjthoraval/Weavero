/* global describe, it, before, assert, Zotero */

// Survey 2026-10-06, round D (branch next, 0.21.9-next.9): the remaining
// section-2 items that fit a bounded fix -- #10 (filter pipeline bound to the
// focused window), #12 (Rule 1 at the tree level), #14 (setFilter /
// changeCollectionTreeRow wraps survive teardown), #15 (glyph pref gates the
// tab-bar wiring), #23 (Reading-Mode select-text arm without a generation).

describe("Weavero — survey fixes, round D", () => {
    let wv, win;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };
    const withPref = async (key, value, fn) => {
        const had = Zotero.Prefs.get(key);
        try { Zotero.Prefs.set(key, value); return await fn(); }
        finally { try { if (had === undefined) Zotero.Prefs.clear(key); else Zotero.Prefs.set(key, had); } catch (_) {} }
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) this.skip();
    });

    it("#10 the filter pipeline binds to the TARGET window, not the focused one", () => {
        // A target window without a tree: nothing to apply to -- and the
        // focused window's tree must be left alone. Pre-fix the pipeline took
        // `Zotero.getMainWindow()` and ran on it with the target's state.
        const fake = { closed: false, ZoteroPane: { itemsView: null }, document: null };
        let calls = 0;
        const hadOwn = Object.prototype.hasOwnProperty.call(wv, "_patchRefreshForReveals");
        const orig = wv._patchRefreshForReveals;
        const prev = wv._wvFilterWinOverride;
        wv._patchRefreshForReveals = () => { calls++; };
        wv._wvFilterWinOverride = fake;
        try { wv._applyItemsListFilterInner(); }
        finally {
            wv._wvFilterWinOverride = prev || null;
            if (hadOwn) wv._patchRefreshForReveals = orig; else delete wv._patchRefreshForReveals;
        }
        assert.strictEqual(calls, 0, "the focused window's tree was touched for a target that has none");
        // The apply is phases over a context since step 4 (2026-10-07): the
        // window and the per-window library memory live in the begin phase.
        const s = src("_wvFilterApplyBegin");
        assert.notInclude(s, "const win = Zotero.getMainWindow()");
        assert.notInclude(s, "this._lastLibraryID", "the last-library memory is per window");
        assert.include(s, "win._wvLastLibraryID");
        assert.include(src("_applyItemsListFilterInner"), "this._wvFilterApplyBegin(opts)");
        // Every pipeline stage that restores the selection after an apply
        // resolves the same window as the state it reads.
        const stages = [];
        let o = wv;
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    if (String(d.value).includes("prevSelectedIDs === null")) stages.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.isNotEmpty(stages, "the selection-restore stage exists");
        for (const k of new Set(stages)) assert.include(src(k), "this._wvFilterTargetWin()", k);
    });

    it("#12 Rule 1: Item Type + Standalone Note passes a standalone note at the tree level", async () => {
        const note = new Zotero.Item("note");
        note.setNote("wv survey round D");
        const id = /** @type {number} */ (await note.saveTx());
        const it = /** @type {any} */ (Zotero.Items.get(id));
        try {
            assert.isTrue(wv._rowSatisfiesTreeJoin(it, { itemType: ["book"], standaloneNote: true }),
                "the OR pair: a standalone-note root is the other half");
            assert.isFalse(wv._rowSatisfiesTreeJoin(it, { itemType: ["book"] }),
                "Item Type alone still excludes notes");
            assert.isFalse(wv._rowSatisfiesTreeJoin(it, { itemType: ["book"], standaloneNote: false }),
                "Standalone Note = No is the exclude reading, not the OR");
        }
        finally { try { await it.eraseTx(); } catch (_) {} }
    });

    it("#14 the filter teardown peels the setFilter / changeCollectionTreeRow wraps and their stamps", () => {
        const iv = win.ZoteroPane && win.ZoteroPane.itemsView;
        assert.isOk(iv);
        wv._setupItemsListFilter(win);
        assert.strictEqual(iv._wvSetFilterWrapped, wv._wvWireTag(), "wired before the teardown");
        assert.isOk(Object.getOwnPropertyDescriptor(iv, "setFilter"), "own-prop wrap in place");
        assert.isOk(Object.getOwnPropertyDescriptor(iv, "changeCollectionTreeRow"));
        wv._teardownItemsListFilter(win);
        assert.isUndefined(Object.getOwnPropertyDescriptor(iv, "setFilter"), "the prototype method shows through again");
        assert.isUndefined(Object.getOwnPropertyDescriptor(iv, "changeCollectionTreeRow"));
        assert.isUndefined(iv._wvSetFilterWrapped, "stamp gone with the wrap");
        assert.isUndefined(iv._wvCollChangeWrapped);
        // Put the suite's window back the way the plugin left it.
        wv._setupItemsListFilter(win);
        assert.strictEqual(iv._wvSetFilterWrapped, wv._wvWireTag());
        assert.strictEqual(iv._wvCollChangeWrapped, wv._wvWireTag());
    });

    it("#15 pinned tabs / groups / drag-drop wiring does not depend on the group-library glyph", async () => {
        const doc = win.document;
        await withPref("weavero.enableGroupLibraryGlyph", false, async () => {
            wv._teardownTabsMenuLibrarySort(win);
            assert.isNotOk(win._wvTabBarDecoMo, "clean slate");
            wv._setupTabsMenuLibrarySort(win);
            assert.isOk(win._wvTabBarDecoMo, "the tab-bar observer is wired with the glyph OFF");
            assert.isOk(doc.getElementById("wv-pinned-tab-style"), "pinned-tab styles with the glyph OFF");
            assert.isNull(doc.getElementById("wv-tab-library-tooltip"), "no glyph tooltip with the glyph OFF");
            // Turning the glyph off again must not take the wiring with it.
            wv._teardownTabBarLibraryDecoration(win);
            assert.isOk(win._wvTabBarDecoMo, "the glyph teardown leaves the observer");
            assert.isOk(doc.getElementById("wv-pinned-tab-style"), "and the pin styles");
        });
        await withPref("weavero.enableGroupLibraryGlyph", true, async () => {
            if (!wv._getEnableGroupLibraryGlyph()) return;   // Visual extras master off in this profile
            wv._setupTabsMenuLibrarySort(win);
            assert.isOk(doc.getElementById("wv-tab-library-tooltip"), "glyph ON: tooltip wired");
            assert.isOk(win._wvTabBarDecoMo, "observer still there");
        });
        // Leave the window as the running pref says.
        wv._setupTabsMenuLibrarySort(win);
    });

    it("#23 the Reading-Mode select-text arm carries the per-reader generation guard", () => {
        const s = src("_wvOutlineAddWithSelectionRm");
        assert.include(s, "reader._wvSelArmGen");
        assert.include(s, "armStale()");
        // Two arms on one reader: the second supersedes the first on the
        // SAME counter the base-view arm uses, so they can never stack.
        const sdoc = win.document.implementation.createHTMLDocument("wv-rm");
        const view = { _iframeWindow: { document: sdoc }, toSelector: () => null };
        const own = (k) => Object.prototype.hasOwnProperty.call(wv, k);
        const saved = { rm: [own("_wvOutlineRmView"), wv._wvOutlineRmView], note: [own("_wvReaderPanelNote"), wv._wvReaderPanelNote] };
        wv._wvOutlineRmView = () => view;
        wv._wvReaderPanelNote = () => {};
        const fake = {};
        try {
            wv._wvOutlineAddWithSelectionRm(fake, sdoc);
            const g1 = fake._wvSelArmGen;
            assert.isNumber(g1, "the arm stamps a generation");
            wv._wvOutlineAddWithSelectionRm(fake, sdoc);
            assert.strictEqual(fake._wvSelArmGen, g1 + 1, "a second arm supersedes the first");
            wv._wvOutlineArmSelectRegion({ _internalReader: { _primaryView: { _iframeWindow: { document: sdoc } } }, _wvSelArmGen: fake._wvSelArmGen }, sdoc, () => {});
        }
        finally {
            if (saved.rm[0]) wv._wvOutlineRmView = saved.rm[1]; else delete wv._wvOutlineRmView;
            if (saved.note[0]) wv._wvReaderPanelNote = saved.note[1]; else delete wv._wvReaderPanelNote;
        }
    });
});
