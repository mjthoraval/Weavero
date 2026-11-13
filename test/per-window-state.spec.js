/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Per-window state with two main windows (alignment review 2026-11-11, §1
// item 4; the per-main-window invariant in CLAUDE.md). Each case acts on
// window B while window A is the one `Zotero.getMainWindow()` answers -- the
// focused window. `_wvWithMainWindow(A, fn)` makes A the answer for the
// duration, which is what OS focus does but deterministic in the runner
// (whose focus no spec controls). Written before the fixes; each case of the
// first group failed on 1.0.5-dev.7 (076918c9). The quick-search mode per
// window: quicksearch-mode-per-window.spec.js.
//
// The second group (2026-11-11, 1.0.5-dev.10) covers what the first fixes
// left: the filter's timers (deliberate retry, stale-keep repair, final apply
// at quiescence), the items view's wraps (setFilter, the collection change,
// the row provider's refresh and notify, selectItems), the annotation row
// class and the attachment row's search read. Each case failed on
// 1.0.5-dev.9 (a4293943).
//
// Since 1.0.5-dev.12 the apply's flags and memos are per window and per view
// (per-window-apply-state.spec.js): the cases set and read them bound to the
// window they mean.

describe("Weavero — per-window state on two main windows", function () {
    this.timeout(120000);
    let wv, A, B, X, Y, Z, W, P, att1, att2, O, R, Q, F, N, C1;
    const rpOf = (w) => { const iv = w.ZoteroPane.itemsView; return iv.rowProvider || iv; };
    const rows = (w) => { const rp = rpOf(w); return rp.getRowCount ? rp.getRowCount() : rp._rows.length; };
    const has = (w, id) => rpOf(w)._rowMap && rpOf(w)._rowMap[id] !== undefined;
    const focused = (w, fn) => wv._wvWithMainWindow(w, fn);
    const selected = (w) => w.ZoteroPane.getSelectedItems().map((it) => it.id);
    const searchBox = (w) => wvT.lib().wvViewEl(w.document, "zotero-tb-search");
    /** The ids the window SHOWS, through the filter's row translation. */
    const shown = (w) => {
        const rp = rpOf(w), out = [];
        const n = rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); if (r && r.ref) out.push(r.ref.id); }
        return out;
    };
    const tag = (w) => (w === A ? "A" : (w === B ? "B" : "?"));

    /** Run `fn` with the filter bound to window `w`. */
    async function bound(w, fn) {
        const prev = wv._wvFilterWinOverride;
        wv._wvFilterWinOverride = w;
        try { return await fn(); }
        finally { wv._wvFilterWinOverride = prev || null; }
    }
    /** No apply running and no post-apply suppression in any window (the
     *  flags are per window since 1.0.5-dev.12): the next apply runs. */
    const quietIn = (w) => { const prev = wv._wvFilterWinOverride; wv._wvFilterWinOverride = w; try { return !wv._filterApplying && !(wv._suppressTreeObserverUntil > Date.now()); } finally { wv._wvFilterWinOverride = prev || null; } };
    const quiet = () => wvT.waitFor(() => (Zotero.getMainWindows().every((w) => w.closed || quietIn(w)) ? true : null), 5000, 50);
    /** The filter's timers have all run out. */
    const timersIdle = () => wvT.waitFor(() => (!wv._wvCascadeRetryTimer && !wv._wvStaleKeepTimer && !wv._wvFATimer) || null, 10000, 50);
    /** Every filter apply made while `fn` runs: its target window, whether it
     *  came from inside Weavero's own wraps, and whether it cascaded. */
    async function applies(fn) {
        const seen = [];
        const own = Object.prototype.hasOwnProperty.call(wv, "_applyItemsListFilter");
        const orig = wv._applyItemsListFilter;
        wv._applyItemsListFilter = function (o) {
            try { seen.push({ win: this._wvFilterTargetWin(), via: !!this._wvViaSetFilter, cascade: !!(o && o.cascade) }); } catch (e) {}
            return orig.apply(this, arguments);
        };
        try { await fn(); }
        finally { if (own) wv._applyItemsListFilter = orig; else delete wv._applyItemsListFilter; }
        return seen;
    }
    const brief = (seen) => JSON.stringify(seen.map((s) => [tag(s.win), s.via ? "via" : "", s.cascade ? "cascade" : ""]));
    const abstractFilter = () => {
        const g = wv._emptyFilterGroup();
        g.hasAbstract = true;
        return { groups: [g], activeGroupIndex: 0 };
    };
    async function applyIn(w, state) {
        await quiet();
        await bound(w, async () => {
            wv._filterState = state;
            wv._renderFilterBar();
            wv._applyItemsListFilter({ deliberate: true });
        });
        await quiet();
    }
    async function clearFilter(w) {
        if (!w || w.closed) return;
        await applyIn(w, { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 });
    }
    async function showLibrary(w) {
        await w.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const ok = await wvT.waitFor(() => (has(w, X.id) && has(w, P.id) && has(w, O.id)) || null, 15000);
        assert.isOk(ok, "the window lists the fixtures");
    }
    /** Open the rows down to the annotation N; its row, or null. */
    async function openToAnnotation(w) {
        const iv = w.ZoteroPane.itemsView;
        if (typeof iv.expandToItem === "function") await iv.expandToItem(N.id);
        else await w.ZoteroPane.selectItem(N.id);
        return wvT.waitFor(() => ((rpOf(w)._rows || []).find((r) => r && r.ref && r.ref.id === N.id) || null), 10000);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWithMainWindow", "_applyItemsListFilter", "_emptyFilterGroup", "_patchHideContextAttachments",
            "_wvPatchSelectionChangeForCapture", "_resolveRelatedRowItem", "_wvArmFinalApply", "_ensureAnnotationRowPatched",
            "_wvScheduleReapplyAfterDataChange"]) wvT.method(m);
        A = Zotero.getMainWindows()[0];
        X = await wvT.createItem("book", { title: "wvpw X", abstractNote: "an abstract" });
        Y = await wvT.createItem("book", { title: "wvpw Y", abstractNote: "an abstract" });
        Z = await wvT.createItem("book", { title: "wvpw Z" });
        W = await wvT.createItem("book", { title: "wvpw W" });
        P = await wvT.createItem("book", { title: "wvpw parent" });
        att1 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvpw/1", parentItemID: P.id, title: "wvpwalpha one" });
        att2 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvpw/2", parentItemID: P.id, title: "wvpw two" });
        O = await wvT.createItem("book", { title: "wvpw related owner" });
        R = await wvT.createItem("book", { title: "wvpw related target" });
        O.addRelatedItem(R); await O.saveTx({ skipSelect: true });
        R.addRelatedItem(O); await R.saveTx({ skipSelect: true });
        // A PDF with one annotation: the annotation row class and the file row class.
        Q = await wvT.createItem("book", { title: "wvpw pdf parent" });
        F = await wvT.createTestPDFItem("wvpw-pdf", { parentItemID: Q.id });
        N = /** @type {any} */ (new Zotero.Item("annotation"));
        N.libraryID = F.libraryID;
        N.parentID = F.id;
        N.annotationType = "highlight";
        N.annotationText = "wvpw highlighted";
        N.annotationColor = "#ffd400";
        N.annotationPageLabel = "1";
        N.annotationSortIndex = "00000|000001|00000";
        N.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await N.saveTx({ skipSelect: true });
        C1 = new Zotero.Collection({ name: "wvpw collection" });
        await C1.saveTx({ skipSelect: true });
        await Zotero.DB.executeTransaction(async () => { await C1.addItem(X.id); });
        B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await wvT.waitFor(() => (B.ZoteroPane.itemsView && B.ZoteroPane.collectionsView && B._wvFilterTreeObserver && B.document.getElementById("wv-filter-bar")) || null, 20000);
        assert.isOk(B._wvFilterTreeObserver, "the second window's filter is wired");
        await showLibrary(A);
        await showLibrary(B);
    });

    afterEach(async function () {
        this.timeout(30000);
        try { await timersIdle(); } catch (e) {}
        for (const w of [A, B]) { try { if (w && !w.closed) searchBox(w).value = ""; } catch (e) {} }
        try { await clearFilter(B); } catch (e) {}
        try { await clearFilter(A); } catch (e) {}
    });

    after(async function () {
        this.timeout(30000);
        try { if (B && !B.closed) { B._wvSavedParkClose = true; B.close(); } } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
        try { await A.ZoteroPane.itemsView.setFilter("search", ""); } catch (e) {}
        await wvT.erase(N, F, Q, att1, att2, P, X, Y, Z, W, O, R);
        try { if (C1) await C1.eraseTx(); } catch (e) {}
    });

    it("a change in a background window's tree re-applies that window's filter, not the focused one's", async function () {
        const all = rows(B);
        assert.isAbove(all, 2, "the second window lists the library");
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
        // The filter is set in B but not applied: only B's tree observer applies it.
        B._wvFilterState = abstractFilter();
        await quiet();
        const filtered = await focused(A, async () => {
            const tree = B.document.getElementById(B.ZoteroPane.itemsView.id);
            const probe = B.document.createElement("div");
            probe.hidden = true;
            tree.appendChild(probe);
            probe.remove();
            return wvT.waitFor(() => (rows(B) < all ? true : null), 5000, 50);
        });
        assert.isOk(filtered, "the second window's rows are filtered by its own observer (" + rows(B) + " of " + all + ")");
    });

    it("a background window's expanded parent is not filtered with the focused window's quick search", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await A.ZoteroPane.itemsView.setFilter("search", "wvpwalpha");
            const rpA = rpOf(A);
            const searching = await wvT.waitFor(() => {
                const ids = rpA.searchItemIDs || rpA._searchItemIDs;
                return (rpA.searchMode || rpA._searchMode) && ids && ids.has(att1.id) && !ids.has(att2.id) ? true : null;
            }, 10000);
            assert.isOk(searching, "the focused window searches for the first attachment");
            try {
                await bound(B, () => wv._patchHideContextAttachments());
                const rpB = rpOf(B);
                const row = rpB._rows[rpB._rowMap[P.id]];
                assert.isOk(row && row.ref && row.ref.id === P.id, "the parent's row in the second window");
                assert.isOk(row.getChildItems._wvWeaveroWrapper, "the second window's row class carries Weavero's child filter");
                await bound(B, () => { for (const s of [wv._userOpenedIDs, wv._userRevealedAllIDs]) { if (s) s.delete(P.id); } });
                // What Zotero's _openContainer hands the row (itemTree.jsx).
                const kids = await focused(A, () => row.getChildItems({
                    searchMode: rpB._searchMode,
                    searchItemIDs: rpB._searchItemIDs,
                    includeTrashed: rpB._includeTrashed,
                    filterChildItems: rpB.itemTree && rpB.itemTree.props ? rpB.itemTree.props.filterChildItems : undefined,
                }));
                assert.sameMembers(kids.map((it) => it.id), [att1.id, att2.id], "no search in the second window: both children");
            }
            finally { await A.ZoteroPane.itemsView.setFilter("search", ""); }
        });
    });

    it("a selection change in a background window records that window's selection", async function () {
        await A.ZoteroPane.selectItem(X.id);
        await B.ZoteroPane.selectItem(Y.id);
        assert.deepEqual(selected(B), [Y.id], "Y selected in the second window");
        await quiet();
        await bound(B, async () => {
            wv._filterState = abstractFilter();
            wv._applyItemsListFilter({ deliberate: true });
        });
        await quiet();
        assert.deepEqual(selected(B), [Y.id], "Y kept by the second window's filter");
        const ivB = B.ZoteroPane.itemsView;
        wv._wvPatchSelectionChangeForCapture(ivB);
        await focused(A, async () => {
            // What the tree calls on a selection change (its onSelectionChange).
            ivB._handleSelectionChange(ivB.selection, false);
            await bound(B, () => wv._applyItemsListFilter({ cascade: true }));
        });
        await quiet();
        assert.deepEqual(selected(B), [Y.id], "the second window keeps its own selection");
    });

    it("one window's recorded selection never answers another window's apply", async function () {
        await A.ZoteroPane.selectItem(X.id);
        await B.ZoteroPane.selectItem(Y.id);
        await quiet();
        await bound(B, async () => {
            wv._filterState = abstractFilter();
            wv._applyItemsListFilter({ deliberate: true });
        });
        await quiet();
        const ivA = A.ZoteroPane.itemsView, ivB = B.ZoteroPane.itemsView;
        wv._wvPatchSelectionChangeForCapture(ivA);
        wv._wvPatchSelectionChangeForCapture(ivB);
        // B records its own selection, then A records its own: one each.
        await focused(B, () => ivB._handleSelectionChange(ivB.selection, false));
        await focused(A, () => ivA._handleSelectionChange(ivA.selection, false));
        await bound(B, () => wv._applyItemsListFilter({ cascade: true }));
        await quiet();
        assert.deepEqual(selected(B), [Y.id], "the second window's apply re-selects its own item");
        assert.deepEqual(selected(A), [X.id], "the first window's selection untouched");
    });

    it("a Related row in a background window resolves against its own section", async function () {
        await A.ZoteroPane.selectItem(X.id);
        await B.ZoteroPane.selectItem(O.id);
        const det = B.document.querySelector("#zotero-item-pane item-details");
        const label = await wvT.waitFor(() => {
            const rb = det && det.querySelector('related-box[data-pane="related"]');
            if (!rb || !rb.item || rb.item.id !== O.id) return null;
            return [...rb.querySelectorAll(".body .row .label")].find((l) => (l.textContent || "").trim() === R.getDisplayTitle()) || null;
        }, 15000);
        assert.isOk(label, "the second window's Related section lists R");
        const row = label.closest(".row");
        const got = await focused(A, () => wv._resolveRelatedRowItem(row));
        assert.strictEqual(got && got.id, R.id, "the row's item, from its own section");
    });

    // ---- the filter's timers ----

    it("a bounced deliberate apply in a background window is retried for that window", async function () {
        await timersIdle();
        const all = rows(B);
        B._wvFilterState = abstractFilter();          // set in B, not applied yet
        await quiet();
        const filtered = await focused(A, async () => {
            // What a just-finished apply in B leaves: B's observer-suppression window.
            await bound(B, () => { wv._suppressTreeObserverUntil = Date.now() + 250; });
            await bound(B, () => wv._applyItemsListFilter({ deliberate: true }));
            assert.isOk(wv._wvCascadeRetryTimer, "the bounced apply scheduled its retry");
            return wvT.waitFor(() => (rows(B) < all ? true : null), 4000, 50);
        });
        assert.isOk(filtered, "the retry filtered the second window (" + rows(B) + " of " + all + " rows)");
    });

    it("a stale-keep repair armed in a background window repairs that window", async function () {
        await timersIdle();
        await applyIn(B, abstractFilter());
        const rpB = rpOf(B);
        const filteredN = rows(B);
        assert.strictEqual(rpB._wvKeepRowsLen, rpB._rows.length, "the second window's keep is fresh after its apply");
        const repaired = await focused(A, async () => {
            // B's rows moved behind its keep -- the watermark and the last
            // apply's row count no longer match the rows -- and the apply
            // that would have rebuilt it bounced off the in-flight guard
            // (filter.ts _applyItemsListFilter, the `_filterApplying` branch).
            rpB._wvKeepRowsLen = rpB._rows.length - 1;
            // B's memo and B's in-flight flag (per window / view since 1.0.5-dev.12).
            await bound(B, () => { wv._wvLastApplyRawRows = -1; wv._filterApplying = true; });
            try { await bound(B, () => wv._applyItemsListFilter()); }
            finally { await bound(B, () => { wv._filterApplying = false; }); }
            assert.isOk(wv._wvStaleKeepTimer, "the bounced apply armed the stale-keep repair");
            return wvT.waitFor(() => (rpB._wvKeepRowsLen === rpB._rows.length ? true : null), 4000, 50);
        });
        assert.isOk(repaired, "the repair rebuilt the second window's keep (watermark " + rpB._wvKeepRowsLen + ", rows " + rpB._rows.length + ")");
        assert.strictEqual(rows(B), filteredN, "and the second window is filtered again");
    });

    it("the final apply armed for a background window's search lands in that window", async function () {
        await timersIdle();
        await applyIn(B, abstractFilter());
        const sb = searchBox(B);
        sb.value = "wvpw";   // a live search in B: the box is what the episode watches
        const seen = await applies(() => focused(A, async () => {
            await bound(B, () => wv._wvArmFinalApply(true));
            await wvT.waitFor(() => (!wv._wvFATimer ? true : null), 8000, 100);
        }));
        assert.isOk(seen.some((s) => s.win === B && s.via), "the final apply ran for the second window: " + brief(seen));
        assert.notOk(seen.some((s) => s.win === A), "and never for the focused one: " + brief(seen));
    });

    // ---- the items view's wraps ----

    it("a quick search in a background window re-applies that window's filter, and only that window's", async function () {
        await timersIdle();
        await applyIn(B, abstractFilter());
        const sb = searchBox(B);
        try {
            const seen = await applies(() => focused(A, async () => {
                sb.value = "wvpw";
                await B.ZoteroPane.itemsView.setFilter("search", "wvpw");
                await wvT.sleep(50);   // the wrap's re-apply runs in a microtask after the refresh
                await quiet();
            }));
            assert.isOk(seen.some((s) => s.win === B && s.via && s.cascade), "the search's own re-apply ran for the second window: " + brief(seen));
            assert.notOk(seen.some((s) => s.win === A), "nothing applied to the focused window: " + brief(seen));
            await timersIdle();
            await quiet();
            const fixtures = [X.id, Y.id, Z.id, W.id];
            assert.sameMembers(shown(B).filter((id) => fixtures.includes(id)), [X.id, Y.id], "the second window shows the matches its filter passes");
        }
        finally {
            sb.value = "";
            await B.ZoteroPane.itemsView.setFilter("search", "");
            await quiet();
        }
    });

    it("a collection change in a background window re-applies that window's filter", async function () {
        await timersIdle();
        await applyIn(B, abstractFilter());
        try {
            const seen = await applies(() => focused(A, async () => {
                await B.ZoteroPane.collectionsView.selectByID("C" + C1.id);
                await wvT.waitFor(() => (has(B, X.id) && !has(B, Y.id)) || null, 10000);
                await wvT.sleep(50);
                await quiet();
            }));
            assert.isOk(seen.some((s) => s.win === B && s.cascade), "the swap's re-apply ran for the second window: " + brief(seen));
            assert.notOk(seen.some((s) => s.win === A), "nothing applied to the focused window: " + brief(seen));
        }
        finally { await showLibrary(B); }
    });

    it("selecting an item a background window's filter hides clears that window's filter only", async function () {
        await applyIn(A, abstractFilter());
        await applyIn(B, abstractFilter());
        assert.notInclude(shown(B), Z.id, "the second window's filter hides Z");
        await focused(A, () => B.ZoteroPane.itemsView.selectItems([Z.id]));
        await quiet();
        assert.isFalse(wv._isFilterActive(B._wvFilterState), "the second window's filter was cleared for the selection");
        assert.include(selected(B), Z.id, "and Z is selected there");
        assert.isTrue(wv._isFilterActive(A._wvFilterState), "the focused window's filter is untouched");
    });

    it("a data change re-applies a background window's filter, once per burst", async function () {
        await timersIdle();
        await applyIn(B, abstractFilter());
        assert.include(shown(B), Y.id, "Y passes the second window's filter");
        try {
            const seen = await applies(() => focused(A, async () => {
                Y.setField("abstractNote", "");
                await Y.saveTx({ skipSelect: true });
                await wvT.waitFor(() => (!shown(B).includes(Y.id) ? true : null), 5000, 50);
                await wvT.sleep(200);
            }));
            assert.notInclude(shown(B), Y.id, "the edit took Y out of the second window: " + brief(seen));
            assert.isOk(seen.some((s) => s.win === B && s.cascade && !s.via), "the post-edit re-apply ran for the second window: " + brief(seen));
            // (A's own tree observer may re-apply A's empty filter as Y's row
            // repaints there: not a cascade.)
            assert.notOk(seen.some((s) => s.win === A && s.cascade), "no post-edit pass applied to the focused window, which has no filter: " + brief(seen));
            await wvT.sleep(3200);   // the edit's own ladder (passes up to ~3 s) runs out
            // Debounced per window: three schedules within the delay are one pass.
            const burst = await applies(async () => {
                for (let i = 0; i < 3; i++) wv._wvScheduleReapplyAfterDataChange(B);
                await wvT.sleep(650);   // pass 0 at 350 ms; pass 1 not before 800 ms
            });
            assert.strictEqual(burst.filter((s) => s.win === B && s.cascade).length, 1, "one pass for the burst: " + brief(burst));
        }
        finally {
            Y.setField("abstractNote", "an abstract");
            await Y.saveTx({ skipSelect: true });
            await wvT.sleep(1500);
        }
    });

    // ---- the row classes ----

    it("each window's annotation rows get Weavero's row patch", async function () {
        const ra = await openToAnnotation(A), rb = await openToAnnotation(B);
        assert.isOk(ra && rb, "both windows list the annotation's row");
        const pa = Object.getPrototypeOf(ra), pb = Object.getPrototypeOf(rb);
        assert.notStrictEqual(pa, pb, "each window loads its own annotation row class");
        // What each window's tree observer runs (filter.ts _setupItemsListFilterIn), A focused.
        await focused(A, async () => {
            await bound(A, () => wv._ensureAnnotationRowPatched());
            await bound(B, () => wv._ensureAnnotationRowPatched());
        });
        assert.isOk(Object.prototype.hasOwnProperty.call(pa, "_wvRenderRowOrig"), "the first window's class is patched");
        assert.isOk(Object.prototype.hasOwnProperty.call(pb, "_wvRenderRowOrig"), "the second window's class is patched");
    });

    it("a background window's attachment row reads its own window's quick search", async function () {
        await openToAnnotation(B);
        const rowF = (rpOf(B)._rows || []).find((r) => r && r.ref && r.ref.id === F.id);
        assert.isOk(rowF, "the PDF's row in the second window");
        await bound(B, () => wv._patchHideContextAttachments());
        assert.isOk(rowF.getChildItems && rowF.getChildItems._wvFIRWrapperGCI, "the second window's file row class carries Weavero's wrapper");
        const sb = searchBox(B);
        sb.value = "wvpwbeta";
        // B's snapshot (per view since 1.0.5-dev.12).
        await bound(B, () => { wv._currentQuickSearchValue = ""; });
        try {
            await focused(A, () => rowF.getChildItems({}));
            assert.strictEqual(await bound(B, () => wv._currentQuickSearchValue), "wvpwbeta", "the row read its own window's search box");
        }
        finally { sb.value = ""; await bound(B, () => { wv._currentQuickSearchValue = ""; }); }
    });

    it("the filter's per-window reads resolve the filter's own window, never the focused one (source contract)", () => {
        // Each read a window's view, search box or popup through
        // Zotero.getMainWindow() until 1.0.5-dev.10; inside an apply bound to a
        // background window that is the wrong window.
        for (const m of ["_rowPassesFilters", "_rowIsPrimary", "_rowHasOwnKindMatch", "_clearAllFilters",
            "_refreshQuickSearchScopeButtonVisibility", "_updateFilterToolbarActiveState", "_wvCollTreeExpanded",
            "_openFilterPanel", "_ensureAnnotationRowPatched", "_patchFileItemTreeRow", "_patchRefreshForChevrons",
            "_wvScheduleReapplyAfterDataChange"]) {
            assert.notInclude(wvT.src(m), "getMainWindow", m + " reads the focused window");
        }
    });
});
