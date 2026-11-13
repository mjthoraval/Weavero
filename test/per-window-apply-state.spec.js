/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// The items-list filter's APPLY state per window and per view (alignment review
// 2026-11-11, item 3; MJT approved the full fix the same day). Until
// 1.0.5-dev.11 the flags and memos of an apply were ONE plugin-wide set, so with
// two main windows (Zotero 10 through Weavero, Zotero 11 natively) or two
// library tabs in one window (zotero#6035) one window's apply decided for the
// other: its observer-suppression window and in-flight flag bounced the other
// window's applies, its last signature let the other window's apply be skipped
// onto stale rows, its reveal / user-opened sets were cleared by the other
// window's apply or search, its chevron maps and quick-search text were the
// other window's. Measured first by a scratch spec (D:/tmp/wv-scripts/
// zz-pws-item3-measure.spec.js, 2026-11-11). Written before the fix; each case
// failed on 1.0.5-dev.11 (0813bf2b) where its window or Zotero has the gap.
//
// Also here, approved the same day: the Show Non-Matching toggle refreshes every
// window and library view, not the focused one; a collection switch takes the
// filter's translation off before Zotero rebuilds the rows on Zotero 10 and 11
// too (the pane calls `changeCollectionTreeRows`, which the singular wrap never
// saw).
//
// Each timing case drives the apply and the tree change itself: the other
// window's state is held (a stretched suppression window, a set flag) instead of
// raced against the 80 / 300 ms windows. A window's state is read and written
// bound to it (`_wvFilterWinOverride`), which reads the plugin-wide field on a
// build that has only that.

describe("Weavero — the filter's apply state per window and per view", function () {
    this.timeout(150000);
    let wv, A, B, X, Y, Z, P, att1, att2, Q, L, NC, C1;
    const rpOf = (w) => { const iv = w.ZoteroPane.itemsView; return iv.rowProvider || iv; };
    const rows = (w) => { const rp = rpOf(w); return rp.getRowCount ? rp.getRowCount() : rp._rows.length; };
    const has = (w, id) => rpOf(w)._rowMap && rpOf(w)._rowMap[id] !== undefined;
    /** The ids the window SHOWS, through the filter's row translation. */
    const shown = (w) => {
        const rp = rpOf(w), out = [];
        const n = rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); if (r && r.ref) out.push(r.ref.id); }
        return out;
    };
    const focused = (w, fn) => wv._wvWithMainWindow(w, fn);
    const searchBox = (w) => wvT.lib().wvViewEl(w.document, "zotero-tb-search");
    const tag = (w) => (w === A ? "A" : (w === B ? "B" : "?"));
    /** Run `fn` with the filter bound to window `w` (synchronous). */
    const boundSync = (w, fn) => {
        const prev = wv._wvFilterWinOverride;
        wv._wvFilterWinOverride = w;
        try { return fn(); }
        finally { wv._wvFilterWinOverride = prev || null; }
    };
    async function bound(w, fn) {
        const prev = wv._wvFilterWinOverride;
        wv._wvFilterWinOverride = w;
        try { return await fn(); }
        finally { wv._wvFilterWinOverride = prev || null; }
    }
    const isQuiet = (w) => boundSync(w, () => !wv._filterApplying
        && !(wv._suppressTreeObserverUntil > Date.now()) && !wv._collectionSwapping);
    /** No apply running and no suppression window open, in every window. */
    const quiet = () => wvT.waitFor(() => (Zotero.getMainWindows().every((w) => w.closed || isQuiet(w)) ? true : null), 8000, 50);
    const timersIdle = () => wvT.waitFor(() => (!wv._wvCascadeRetryTimer && !wv._wvStaleKeepTimer && !wv._wvFATimer) || null, 15000, 50);
    /** Items created in the last 10 s are force-kept by every apply. */
    const freshOff = () => { if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear(); };
    const group = (f) => { const g = wv._emptyFilterGroup(); f(g); return { groups: [g], activeGroupIndex: 0 }; };
    const abstractFilter = () => group((g) => { g.hasAbstract = true; });
    const bookFilter = () => group((g) => { g.itemType = ["book"]; });
    const linkFilter = () => group((g) => { g.attachmentFileType = ["attachmentWebLink"]; });
    const empty = () => ({ groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 });
    async function applyIn(w, state, opts) {
        await quiet();
        await bound(w, async () => {
            wv._filterState = state;
            wv._renderFilterBar();
            wv._applyItemsListFilter(opts || { deliberate: true });
        });
        await quiet();
    }
    /** Every filter apply made while `fn` runs: its window and whether it cascaded. */
    async function applies(fn) {
        const seen = [];
        const own = Object.prototype.hasOwnProperty.call(wv, "_applyItemsListFilter");
        const orig = wv._applyItemsListFilter;
        wv._applyItemsListFilter = function (o) {
            try { seen.push({ win: this._wvFilterTargetWin(), cascade: !!(o && o.cascade) }); } catch (e) {}
            return orig.apply(this, arguments);
        };
        try { await fn(); }
        finally { if (own) wv._applyItemsListFilter = orig; else delete wv._applyItemsListFilter; }
        return seen;
    }
    const brief = (seen) => JSON.stringify(seen.map((s) => [tag(s.win), s.cascade ? "cascade" : ""]));
    /** A row change in `w`'s items tree: what its filter observer reacts to. */
    const touchTree = (w) => {
        const tree = w.document.getElementById(w.ZoteroPane.itemsView.id);
        const probe = w.document.createElement("div");
        probe.hidden = true;
        tree.appendChild(probe);
        probe.remove();
    };
    /** The user's twisty on `item`'s row: the filter's own toggle path. */
    async function openByUser(w, item) {
        const idx = shown(w).indexOf(item.id);
        assert.isAtLeast(idx, 0, "fixture: " + item.id + " is shown in " + tag(w));
        await rpOf(w).toggleOpenState(idx);
        await quiet();
    }
    async function showLibrary(w) {
        await w.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const ok = await wvT.waitFor(() => (has(w, X.id) && has(w, P.id) && has(w, Q.id)) || null, 15000);
        assert.isOk(ok, "the window lists the fixtures");
    }
    /** Both windows on the library, unfiltered and collapsed. */
    async function reset() {
        await timersIdle();
        for (const w of [A, B]) { try { if (w && !w.closed && searchBox(w).value) { searchBox(w).value = ""; await w.ZoteroPane.itemsView.setFilter("search", ""); } } catch (e) {} }
        await quiet();
        // A clear after an active filter collapses what it opened (_partialCollapseOnFilterClear).
        for (const w of [A, B]) { if (w && !w.closed) { await applyIn(w, abstractFilter(), { cascade: true }); await applyIn(w, empty()); } }
        await timersIdle();
        await quiet();
        freshOff();
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWithMainWindow", "_applyItemsListFilter", "_emptyFilterGroup", "_rowIsPrimary",
            "_refreshForDisplayToggle", "_patchHideContextAttachments"]) wvT.method(m);
        A = Zotero.getMainWindows()[0];
        X = await wvT.createItem("book", { title: "wvpa X", abstractNote: "an abstract" });
        Y = await wvT.createItem("journalArticle", { title: "wvpa Y", abstractNote: "an abstract" });
        Z = await wvT.createItem("book", { title: "wvpa Z" });
        P = await wvT.createItem("book", { title: "wvpa parent" });
        att1 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvpa/1", parentItemID: P.id, title: "wvpa one" });
        att2 = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvpa/2", parentItemID: P.id, title: "wvpa two" });
        // A parent with a matching link and a non-matching child note: the chevron
        // map's tally, and the row the Show Non-Matching Attachments toggle shows.
        Q = await wvT.createItem("book", { title: "wvpa mixed parent", abstractNote: "an abstract" });
        L = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wvpa/3", parentItemID: Q.id, title: "wvpa link" });
        NC = new Zotero.Item("note");
        NC.parentID = Q.id;
        NC.setNote("<p>wvpa child note</p>");
        await NC.saveTx({ skipSelect: true });
        C1 = new Zotero.Collection({ name: "wvpa collection" });
        await C1.saveTx({ skipSelect: true });
        await Zotero.DB.executeTransaction(async () => { await C1.addItem(X.id); await C1.addItem(Z.id); });
        B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await wvT.waitFor(() => (B.ZoteroPane.itemsView && B._wvFilterTreeObserver && B.document.getElementById("wv-filter-bar")) || null, 20000);
        assert.isOk(B._wvFilterTreeObserver, "the second window's filter is wired");
        await showLibrary(A);
        await showLibrary(B);
    });

    afterEach(async function () {
        this.timeout(40000);
        try { boundSync(A, () => { wv._suppressTreeObserverUntil = 0; wv._filterApplying = false; wv._collectionSwapping = false; }); } catch (e) {}
        try { boundSync(B, () => { wv._suppressTreeObserverUntil = 0; wv._filterApplying = false; wv._collectionSwapping = false; }); } catch (e) {}
        try { await reset(); } catch (e) {}
    });

    after(async function () {
        this.timeout(30000);
        try { if (B && !B.closed) { B._wvSavedParkClose = true; B.close(); } } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
        try { await applyIn(A, empty()); } catch (e) {}
        await wvT.erase(NC, L, Q, att1, att2, P, X, Y, Z);
        try { if (C1) await C1.eraseTx(); } catch (e) {}
    });

    // ---- per window: the apply's flags ----

    it("a window's tree change is applied while another window's apply holds its observer-suppression window", async function () {
        await reset();
        const all = rows(B);
        B._wvFilterState = abstractFilter();          // set in B, not applied: only B's observer applies it
        const filtered = await focused(A, async () => {
            // An apply in A, and A's post-apply suppression held open (300 ms in the code).
            boundSync(A, () => {
                wv._applyItemsListFilter({ deliberate: true });
                wv._suppressTreeObserverUntil = Date.now() + 10000;
            });
            touchTree(B);
            return wvT.waitFor(() => (rows(B) < all ? true : null), 3000, 50);
        });
        boundSync(A, () => { wv._suppressTreeObserverUntil = 0; });
        assert.isOk(filtered, "B's own observer applied B's filter (" + rows(B) + " of " + all + " rows)");
    });

    it("an apply bounces only off its own window's apply in flight", async function () {
        await reset();
        const all = rows(B);
        const filteredNow = await focused(A, () => {
            boundSync(A, () => { wv._filterApplying = true; });   // A's apply is running
            try {
                return boundSync(B, () => {
                    wv._filterState = abstractFilter();
                    wv._applyItemsListFilter();                    // what B's observer runs
                    return rows(B) < all;
                });
            }
            finally { boundSync(A, () => { wv._filterApplying = false; }); }
        });
        assert.isTrue(filteredNow, "B's apply ran at once (" + rows(B) + " of " + all + " rows)");
    });

    it("a window's tree change is applied while another window's quick search rebuilds its rows", async function () {
        await reset();
        const all = rows(A);
        A._wvFilterState = abstractFilter();          // set in A, not applied
        const filtered = await focused(A, async () => {
            // What B's setFilter / collection-change wrap holds while Zotero rebuilds B's rows.
            boundSync(B, () => { wv._collectionSwapping = true; });
            try {
                touchTree(A);
                return await wvT.waitFor(() => (rows(A) < all ? true : null), 3000, 50);
            }
            finally { boundSync(B, () => { wv._collectionSwapping = false; }); }
        });
        assert.isOk(filtered, "A's own observer applied A's filter (" + rows(A) + " of " + all + " rows)");
    });

    // ---- per view: the apply memo, the reveal sets, the maps, the search text ----

    it("an apply is never skipped on another window's last signature", async function () {
        await reset();
        assert.strictEqual(rpOf(A)._rows.length, rpOf(B)._rows.length, "precondition: both windows hold the same raw rows");
        await applyIn(A, abstractFilter(), { cascade: true });
        await applyIn(B, bookFilter(), { cascade: true });
        assert.include(shown(B), Z.id, "precondition: B shows the books");
        assert.notInclude(shown(B), Y.id, "precondition: and not the article");
        B._wvFilterState = abstractFilter();          // B's state changes, its apply not yet run
        await focused(A, async () => {
            // A applies the same state: the last apply, and its signature, are A's.
            await bound(A, () => wv._applyItemsListFilter({ cascade: true }));
            await quiet();
            await bound(B, () => wv._applyItemsListFilter());   // what B's tree observer runs
        });
        await quiet();
        const now = shown(B);
        assert.include(now, Y.id, "B shows its new filter's article");
        assert.notInclude(now, Z.id, "and no longer the book without an abstract");
    });

    it("what the user opened in one window survives another window's apply of another filter", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await reset();
            await applyIn(A, bookFilter(), { cascade: true });
            await focused(A, () => openByUser(A, P));
            assert.include(shown(A), att1.id, "precondition: P's children show in A once the user opened it");
            await focused(A, () => applyIn(B, abstractFilter(), { cascade: true }));
            // A's next apply: cascade, so no no-op skip hides what it decides.
            await focused(A, () => bound(A, () => wv._applyItemsListFilter({ cascade: true })));
            await quiet();
            assert.include(shown(A), att1.id, "A still shows what the user opened there");
        });
    });

    it("what the user opened in one window survives a quick search in another", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await reset();
            await applyIn(A, bookFilter(), { cascade: true });
            await applyIn(B, bookFilter(), { cascade: true });
            await focused(A, () => openByUser(A, P));
            assert.include(shown(A), att1.id, "precondition: P's children show in A once the user opened it");
            const sb = searchBox(B);
            try {
                await focused(A, async () => {
                    sb.value = "wvpa";
                    await B.ZoteroPane.itemsView.setFilter("search", "wvpa");
                    await wvT.sleep(50);
                    await quiet();
                    await timersIdle();
                });
                await focused(A, () => bound(A, () => wv._applyItemsListFilter({ cascade: true })));
                await quiet();
                assert.include(shown(A), att1.id, "A still shows what the user opened there");
            }
            finally {
                sb.value = "";
                await B.ZoteroPane.itemsView.setFilter("search", "");
                await quiet();
            }
        });
    });

    it("a window's chevron maps are its own after another window's apply", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await reset();
            await applyIn(A, linkFilter(), { cascade: true });
            assert.include(shown(A), L.id, "precondition: A shows Q's link");
            assert.notInclude(shown(A), NC.id, "precondition: and hides Q's note");
            const tally = () => boundSync(A, () => (wv._wvHiddenCounts && wv._wvHiddenCounts.get(Q.id)) || 0);
            const first = () => boundSync(A, () => (wv._wvFirstVisibleAnnUnderAtt && wv._wvFirstVisibleAnnUnderAtt.get(Q.id)) || null);
            assert.strictEqual(tally(), 1, "precondition: A's map counts Q's hidden note");
            await focused(A, () => applyIn(B, abstractFilter(), { cascade: true }));
            assert.strictEqual(tally(), 1, "A's rows render with A's tally");
            assert.strictEqual(first(), L.id, "and A's chevron row");
        });
    });

    it("a window's rows are judged with its own quick search, not the last apply's", async function () {
        await reset();
        await applyIn(B, bookFilter(), { cascade: true });
        const verdict = () => boundSync(B, () => !!wv._rowIsPrimary(Zotero.Items.get(att1.id), B._wvFilterState));
        const own = verdict();
        const sb = searchBox(A);
        try {
            await focused(A, async () => {
                sb.value = "wvpa one";
                await A.ZoteroPane.itemsView.setFilter("search", "wvpa one");
                await applyIn(A, bookFilter(), { cascade: true });
                await timersIdle();
                await quiet();
            });
            assert.strictEqual(await focused(A, () => verdict()), own, "B's row check reads B's (empty) search, as B's own apply did");
        }
        finally {
            sb.value = "";
            await A.ZoteroPane.itemsView.setFilter("search", "");
            await quiet();
        }
    });

    // ---- approved with it: the display toggle, the collection switch ----

    it("the Show Non-Matching Attachments toggle refreshes every window", async function () {
        await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
            await reset();
            await applyIn(A, linkFilter(), { cascade: true });
            await applyIn(B, linkFilter(), { cascade: true });
            for (const w of [A, B]) {
                assert.include(shown(w), L.id, "precondition: " + tag(w) + " shows Q's link");
                assert.notInclude(shown(w), NC.id, "precondition: " + tag(w) + " hides Q's note");
            }
            // What the panel's checkbox does (filter.ts, the display-option toggles), A focused.
            const toggle = (on) => focused(A, async () => {
                Zotero.Prefs.set("weavero.showContextAttachmentRows", on);
                wv._patchHideContextAttachments();
                await wv._refreshForDisplayToggle();
                await wvT.sleep(50);
                await quiet();
            });
            await toggle(true);
            const showsAll = await wvT.waitFor(() => (shown(A).includes(NC.id) && shown(B).includes(NC.id) ? true : null), 5000, 100);
            assert.isOk(showsAll, "both windows show Q's note (A " + shown(A).includes(NC.id) + ", B " + shown(B).includes(NC.id) + ")");
            await toggle(false);
            const hidesAll = await wvT.waitFor(() => (!shown(A).includes(NC.id) && !shown(B).includes(NC.id) ? true : null), 5000, 100);
            assert.isOk(hidesAll, "both windows hide it again (A " + shown(A).includes(NC.id) + ", B " + shown(B).includes(NC.id) + ")");
        });
    });

    it("a collection switch takes the filter's translation off before Zotero rebuilds the rows, and re-applies once", async function () {
        await reset();
        await applyIn(B, abstractFilter(), { cascade: true });
        const iv = B.ZoteroPane.itemsView, rp = rpOf(B);
        // The rebuild: the row provider's `_refresh` (Zotero 10 and later), the
        // items view's `refresh` (Zotero 9). Spied as one more own layer.
        const key = (rp !== iv && typeof rp._refresh === "function") ? "_refresh" : "refresh";
        const host = rp !== iv && key === "_refresh" ? rp : iv;
        const own = Object.prototype.hasOwnProperty.call(host, key);
        const orig = host[key];
        const at = [];
        host[key] = function () {
            at.push({ translated: !!(rp._wvFilterView || rp._wvFilterPatchTag), swapping: boundSync(B, () => !!wv._collectionSwapping) });
            return orig.apply(this, arguments);
        };
        let seen;
        try {
            seen = await applies(() => focused(A, async () => {
                await B.ZoteroPane.collectionsView.selectByID("C" + C1.id);
                await wvT.waitFor(() => (has(B, X.id) && !has(B, Y.id)) || null, 10000);
                await wvT.sleep(100);
                await quiet();
            }));
        }
        finally { if (own) host[key] = orig; else delete host[key]; }
        assert.isAbove(at.length, 0, "Zotero rebuilt B's rows");
        assert.deepEqual(at.filter((s) => s.translated), [], "the translation was off for every rebuild: " + JSON.stringify(at));
        assert.deepEqual(at.filter((s) => !s.swapping), [], "B's observer stood down for every rebuild: " + JSON.stringify(at));
        const fixtures = [X.id, Y.id, Z.id];
        assert.sameMembers(shown(B).filter((id) => fixtures.includes(id)), [X.id], "B shows the collection's item that passes its filter");
        if (rp !== iv) {
            // Zotero 10 and later: the rebuild's own re-apply is the one (Zotero 9 also
            // re-applies after the swap, as before).
            assert.strictEqual(seen.filter((s) => s.win === B && s.cascade).length, 1, "one re-apply for the switch: " + brief(seen));
        }
        await focused(A, () => showLibrary(B));
        await quiet();
        assert.sameMembers(shown(B).filter((id) => fixtures.includes(id)), [X.id, Y.id], "back in the library, B's filter holds");
    });

    // ---- two library tabs in one window (a Zotero with its own windows) ----

    describe("two library tabs in one window", function () {
        let w, T, first, second;
        before(async function () {
            if (!wvT.nativeWindows()) this.skip();
            this.timeout(60000);
            w = await wvT.openMainWindow();
            T = w.Zotero_Tabs;
            await wvT.waitFor(() => (w.ZoteroPane.itemsView && w.document.getElementById("wv-filter-bar")) || null, 15000);
            first = T.selectedID;
            await w.ZoteroPane.newLibraryTab();
            second = await wvT.waitFor(() => T._tabs.find((t) => t.id !== first && t.type.startsWith("library")), 10000);
            assert.isOk(second, "a second library tab");
            second = second.id;
        });
        after(async function () {
            if (!w) return;
            this.timeout(20000);
            try { w.close(); } catch (e) {}
            await wvT.waitFor(() => !Zotero.getMainWindows().includes(w) || null, 8000);
        });
        async function show(tabID) {
            T.select(tabID);
            const v = await wvT.waitFor(() => {
                const v = w.ZoteroPane.getLibraryView(tabID);
                return v && v.loaded && w._wvFilterViewTab === tabID ? v : null;
            }, 15000);
            assert.isOk(v, "tab " + tabID + " on screen (filter on " + w._wvFilterViewTab + ")");
            // A new tab opens on the configured new-tab target: put it on the library.
            if (!(has(w, X.id) && has(w, Q.id))) {
                await w.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            }
            const ok = await wvT.waitFor(() => (has(w, X.id) && has(w, Q.id)) || null, 15000);
            assert.isOk(ok, "tab " + tabID + " lists the fixtures (" + rpOf(w)._rows.length + " rows, view "
                + (w.ZoteroPane.itemsView.collectionTreeRows || []).map((r) => r.id).join(",") + ")");
            await quiet();
        }
        /** Both tabs unfiltered and collapsed, the first one on screen. */
        async function resetTabs() {
            for (const id of [second, first]) {
                await show(id);
                await applyIn(w, abstractFilter(), { cascade: true });
                await applyIn(w, empty());
            }
            await timersIdle();
            freshOff();
        }

        it("a tab keeps what the user opened while another tab of the window is on screen", async function () {
            await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
                await resetTabs();
                await show(second);
                await applyIn(w, bookFilter(), { cascade: true });
                await focused(w, () => openByUser(w, P));
                assert.include(shown(w), att1.id, "precondition: P's children show once the user opened it");
                await show(first);                    // its own (empty) filter applies there
                await show(second);
                await focused(w, () => bound(w, () => wv._applyItemsListFilter({ cascade: true })));
                await quiet();
                assert.include(shown(w), att1.id, "the second tab still shows what the user opened there");
            });
        });

        it("a tab's apply is never skipped on another tab's last signature", async function () {
            await resetTabs();
            await show(second);
            assert.strictEqual(rpOf(w)._rows.length, w.ZoteroPane.getLibraryView(first).itemsView.rowProvider._rows.length,
                "precondition: both tabs hold the same raw rows");
            await applyIn(w, bookFilter(), { cascade: true });
            assert.include(shown(w), Z.id, "precondition: the second tab shows the books");
            await show(first);
            await applyIn(w, abstractFilter(), { cascade: true });   // the last apply, and its signature, are the first tab's
            // The second tab's filter changes while it is off screen.
            w._wvFilterViewStates.set(second, { state: abstractFilter(), pills: [] });
            await show(second);                      // its own apply runs as it comes on screen
            const now = shown(w);
            assert.include(now, Y.id, "the second tab shows its filter's article");
            assert.notInclude(now, Z.id, "and no longer the book without an abstract");
        });

        it("the Show Non-Matching Attachments toggle reaches a tab that is off screen", async function () {
            await wvT.withPref("weavero.showContextAttachmentRows", false, async () => {
                await resetTabs();
                await show(second);
                await applyIn(w, linkFilter(), { cascade: true });
                assert.include(shown(w), L.id, "precondition: the second tab shows Q's link");
                assert.notInclude(shown(w), NC.id, "precondition: and hides Q's note");
                await show(first);
                await focused(w, async () => {
                    Zotero.Prefs.set("weavero.showContextAttachmentRows", true);
                    wv._patchHideContextAttachments();
                    await wv._refreshForDisplayToggle();
                    await wvT.sleep(50);
                    await quiet();
                });
                await show(second);
                const ok = await wvT.waitFor(() => (shown(w).includes(NC.id) ? true : null), 4000, 100);
                assert.isOk(ok, "the second tab shows Q's note once it is back on screen");
            });
        });
    });

    // ---- source contracts: per-row paths resolve once, callbacks bind their window ----

    it("the callbacks that belong to one window bind it (source contract)", () => {
        // The row renderer, the chevron click, the twisty record, the display
        // toggle: each acted for the FOCUSED window's state until 1.0.5-dev.11.
        for (const m of ["_patchRenderPrimaryCell", "_installHiddenBadgeClickHandler", "_wvRefreshForDisplayToggleIn"]) {
            assert.include(wvT.src(m), "_wvWithFilterWin", m + " binds its window");
        }
        assert.notInclude(wvT.src("_refreshForDisplayToggle"), "getMainWindow", "the toggle refreshes every window");
    });
});
