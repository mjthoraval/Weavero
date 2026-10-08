/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06 step 4 (branch next): the items-list filter's
// row-provider translation is installed ONCE per instance as lib/wrap.ts
// layers ("filter"; v9's null-safe probes "v9safe") that read the per-apply
// view `rp._wvFilterView = {keep, keepRowsLen}` -- an apply publishes a new
// view and installs nothing. The manual-expand tracker is its own layer
// ("userOpenTracking") UNDER the translation, left in place by filter
// clears. One removal body (`_wvFilterPatchRemove`) serves the inactive
// apply branch, `_pauseFilterPatches` and the teardown (three copies before).
//
// Pre-step-4 wrappers closed over one apply's `keep` and were re-assigned
// as own properties on every apply; the clear deleted them together with
// the tracker, whose stamp stayed (tracking dead until a reload).

describe("Weavero — filter translation as wrap layers", () => {
    let wv, lib, win, iv, rp, tag, stateSnap, item;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };
    // The apply's phases, in driver order (survey step 4, second slice).
    const WV_APPLY_PHASES = ["_wvFilterApplyBegin", "_wvFilterApplyInactive", "_wvFilterApplySkip", "_wvFilterApplyPrepare",
        "_wvFilterApplyCascade", "_wvFilterApplyKeep", "_wvFilterApplyMaterialise", "_wvFilterApplyPublish"];
    const layers = (m) => lib.wvWrapLayers(rp, m).map(l => l.layer);
    const ACTIVE = () => ({ groups: [{ annotationColor: ["#ffd400"] }],
        collections: [], savedSearches: [], activeGroupIndex: 0 });
    const CLEAR = () => ({ groups: [], collections: [], savedSearches: [] });
    const apply = (state, opts) => { wv._filterState = state; wv._applyItemsListFilterInner(opts || {}); };

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        win = Zotero.getMainWindow();
        iv = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        rp = iv && iv.rowProvider;
        if (!wv || !lib || !rp) this.skip();   // v10 machinery only
        tag = wv._wvWireTag();
        stateSnap = wv._filterState ? JSON.parse(JSON.stringify(wv._filterState)) : null;
        const libID = Zotero.Libraries.userLibraryID;
        item = new Zotero.Item("journalArticle");
        item.libraryID = libID;
        item.setField("title", "WV-TEST patch-layers parent");
        await item.saveTx();
        await /** @type {any} */ (win.ZoteroPane.collectionsView).selectLibrary(libID);
        await iv.waitForLoad();
        apply(CLEAR());
    });

    after(async () => {
        try { apply(stateSnap || CLEAR()); } catch (e) {}
        try { if (item) await item.eraseTx(); } catch (e) {}
    });

    it("an active filter installs the translation as layers under the instance tag, over the tracker", () => {
        apply(ACTIVE(), { cascade: true });
        assert.strictEqual(rp._wvFilterPatchTag, tag);
        assert.isObject(rp._wvFilterView);
        assert.strictEqual(rp._wvFilterView.keepRowsLen, rp._rows.length, "the view is fresh");
        assert.strictEqual(rp._wvKeepRowsLen, rp._wvFilterView.keepRowsLen, "the published watermark is the view's");
        assert.isFunction(rp._wvOrigGetRow, "the native stays published for the cascade and the live suites");
        for (const m of ["getRow", "getRowCount", "getLevel", "isContainer", "isContainerOpen", "isContainerEmpty",
            "expandRows", "collapseRows", "expandAllRows", "collapseAllRows"]) {
            assert.deepEqual(layers(m), ["filter"], m);
        }
        assert.deepEqual(layers("toggleOpenState"), ["userOpenTracking", "filter"], "the tracker reads real indices: it is the inner layer");
        for (const l of lib.wvWrapLayers(rp, "toggleOpenState")) assert.strictEqual(l.tag, tag);
        assert.isTrue(Object.prototype.hasOwnProperty.call(iv, "objectRowCount"), "the item-pane count getter is on the instance");
        assert.isUndefined(rp._wvUserOpenTrackingPatched, "the legacy tracker stamp is gone");
        assert.isUndefined(rp._wvUserOpenTrackingOrig);
    });

    it("the layers read the LIVE view: a second apply publishes a new view and installs nothing", () => {
        apply(ACTIVE(), { cascade: true });
        const getRow = rp.getRow, count = rp.getRowCount, view1 = rp._wvFilterView;
        assert.strictEqual(count.call(rp), view1.keep.length, "translated count == the view's keep");
        if (view1.keep.length) {
            assert.strictEqual(rp.getRow(0), rp._wvOrigGetRow(view1.keep[0]), "translated row 0 == native row keep[0]");
        }
        // A different state: new keep, same wrappers.
        apply({ groups: [{ annotationColor: ["#ff6666"] }], collections: [], savedSearches: [], activeGroupIndex: 0 }, { cascade: true });
        assert.strictEqual(rp.getRow, getRow, "getRow was not re-installed");
        assert.strictEqual(rp.getRowCount, count, "getRowCount was not re-installed");
        assert.notStrictEqual(rp._wvFilterView, view1, "a new view object");
        assert.strictEqual(rp.getRowCount(), rp._wvFilterView.keep.length);
        // The count getter reads the view too (never a stale closure).
        let n = 0;
        for (const r of rp._wvFilterView.keep) { const row = rp._wvOrigGetRow(r); if (row && row.isObjectRow) n++; }
        assert.strictEqual(iv.objectRowCount, n, "the item-pane count follows the current view");
    });

    it("clearing the filter takes the translation off whole and leaves the tracker", () => {
        apply(ACTIVE(), { cascade: true });
        apply(CLEAR());
        for (const [m] of [["getRow"], ["getRowCount"], ["getLevel"], ["isContainer"], ["expandRows"], ["collapseAllRows"]]) {
            assert.deepEqual(layers(m), [], m + " has no layer left");
            assert.isFalse(Object.prototype.hasOwnProperty.call(rp, m), m + " is the prototype's again");
        }
        assert.deepEqual(layers("toggleOpenState"), ["userOpenTracking"], "the tracker survives the clear");
        assert.isUndefined(rp._wvFilterPatchTag);
        assert.isUndefined(rp._wvFilterView);
        assert.isUndefined(rp._wvKeepRowsLen);
        assert.isUndefined(rp._wvOrigGetRow);
        assert.isUndefined(rp._wvOrigToggleOpenState);
        assert.isUndefined(rp._wvFilterSelfCall);
        assert.isUndefined(rp._wvObjRowCountHost);
        assert.isFalse(Object.prototype.hasOwnProperty.call(iv, "objectRowCount"), "the prototype getter shows through");
        assert.strictEqual(rp.getRowCount(), rp._rows.length);
    });

    it("_pauseFilterPatches takes the same body; the next apply reinstalls", () => {
        apply(ACTIVE(), { cascade: true });
        wv._pauseFilterPatches();
        assert.deepEqual(layers("getRow"), []);
        assert.deepEqual(layers("toggleOpenState"), ["userOpenTracking"]);
        assert.isUndefined(rp._wvFilterView);
        assert.isUndefined(rp._wvOrigGetRow);
        apply(ACTIVE(), { cascade: true });
        assert.deepEqual(layers("getRow"), ["filter"]);
        assert.strictEqual(rp._wvFilterPatchTag, tag);
        apply(CLEAR());
    });

    it("a dead instance's translation is replaced, never stacked under (simulated foreign layers)", () => {
        apply(CLEAR());
        // Plant what a crashed previous instance would leave: natives, a tag
        // and layers under a foreign tag, including a throwing getRow.
        const dead = "wv@dead#0";
        lib.wvWrap(rp, "getRow", "filter", dead, () => function () { throw new Error("dead layer ran"); });
        lib.wvWrap(rp, "toggleOpenState", "userOpenTracking", dead, (o) => function (...a) { return o.apply(this, a); });
        rp._wvOrigGetRow = function () { throw new Error("dead native ran"); };
        rp._wvFilterPatchTag = dead;
        assert.throws(() => rp.getRow(0), /dead layer ran/);
        apply(ACTIVE(), { cascade: true });
        assert.doesNotThrow(() => rp.getRow(0));
        assert.doesNotThrow(() => rp._wvOrigGetRow(0), "the native was re-captured from the prototype");
        for (const m of ["getRow", "toggleOpenState"]) {
            for (const l of lib.wvWrapLayers(rp, m)) assert.strictEqual(l.tag, tag, m + "/" + l.layer);
        }
        assert.deepEqual(layers("toggleOpenState"), ["userOpenTracking", "filter"]);
        apply(CLEAR());
    });

    it("the apply is a driver over phases that hand one context on, in order", () => {
        const d = src("_applyItemsListFilterInner");
        let last = -1;
        for (const name of WV_APPLY_PHASES) {
            const at = d.indexOf("this." + name + "(");
            assert.isAbove(at, last, name + " is called by the driver, after the previous phase");
            last = at;
        }
        // The driver resolves nothing itself: every window / tree read is a phase's.
        assert.notInclude(d, "ZoteroPane");
        assert.notInclude(d, "getMainWindow");
        // The phases that read the tree bind to the target window's state, never a bare global.
        for (const name of WV_APPLY_PHASES) assert.notInclude(src(name), "Zotero.getMainWindow()", name);
        assert.include(src("_wvFilterApplyBegin"), "this._wvFilterTargetWin()");
        // A phase-published field is read by a later phase, never recomputed.
        assert.include(src("_wvFilterApplyPublish"), "keepRowsLen");
        assert.notInclude(src("_wvFilterApplyPublish"), "rp._rows.slice");
    });

    it("source contracts: one removal body, no per-apply own-property wrappers, tracker untouched by removal", () => {
        // The apply is phases over a context (step 4 split): scan them all.
        const applyS = WV_APPLY_PHASES.map(src).join("\n");
        assert.notInclude(applyS, "rp.getRow = function");
        assert.notInclude(applyS, "restoreField(");
        assert.notInclude(applyS, "delete rp.getRow");
        assert.include(src("_wvFilterApplyPrepare"), "this._wvFilterPatchInstall(rp, itemsView, isV9)");
        assert.include(src("_wvFilterApplyPublish"), "rp._wvFilterView = { keep, keepRowsLen }");
        const removeS = src("_wvFilterPatchRemove");
        assert.notInclude(removeS, "userOpenTracking");
        assert.notInclude(removeS, "_wvUserOpenTrackingPatched");
        for (const name of ["_pauseFilterPatches", "_teardownItemsListFilterIn"]) {
            assert.include(src(name), "this._wvFilterPatchRemove(rp, itemsView)", name + " uses the shared removal");
            assert.notInclude(src(name), "delete rp.getRow", name);
        }
        const installS = src("_wvFilterPatchInstall");
        assert.include(installS, 'wvWrap(rp, "getRow", "filter", tag');
        assert.include(installS, "this._wvInstallUserOpenTracking(itemsView)", "the tracker goes in first (inner layer)");
        assert.notInclude(installS, "const self = this", "long-lived wrappers resolve the live plugin");
        assert.include(installS, "wvLivePlugin()");
        assert.include(src("_wvInstallUserOpenTracking"), 'wvWrap(rp, "toggleOpenState", "userOpenTracking"');
    });
});
