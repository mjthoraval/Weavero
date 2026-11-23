/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-11-22 (citations.33, 11.0-beta.5, a 48k-item library), caught by
// the persistent filter trace: after PDF, Image and Snapshot, the panel's
// Clear began an apply that never ended -- one core at 100 % for over 1.5
// minutes, memory flat. The clear collapses every container the filter had
// opened (~20,000 parents over 40,186 rows) with one `_toggleOpenState` per
// container. On Zotero 11 each of those runs in `_batchRowChanges`, which
// rebuilds the whole row map (and the selection) per call outside a batch,
// and ignores the `skipRowMapRefresh` flag Zotero 10 honoured: O(rows x
// containers). The collapse is now one pass with one map refresh.
// FAILS on 1.2.1-filtimg.2 on Zotero 11 (a map refresh per opened parent).
describe("Weavero — clearing a filter that opened thousands of parents collapses in one pass", function () {
    this.timeout(400000);
    const N = 2000;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let wv, win, iv, rp;
    const made = [];

    /** Count `rp.refreshRowMap` calls while `fn` runs. */
    async function countRefreshes(fn) {
        let n = 0;
        const own = Object.prototype.hasOwnProperty.call(rp, "refreshRowMap");
        const orig = rp.refreshRowMap;
        rp.refreshRowMap = function () { n++; return orig.apply(this, arguments); };
        try { await fn(); }
        finally { if (own) rp.refreshRowMap = orig; else delete rp.refreshRowMap; }
        return n;
    }

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_applyItemsListFilter", "_clearAllFilters", "_emptyFilterGroup", "_partialCollapseOnFilterClear"]) wvT.method(m);
        win = Zotero.getMainWindow();
        iv = win.ZoteroPane.itemsView;
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await iv.waitForLoad();
        rp = iv.rowProvider;
        if (!rp) wvT.absent("itemsView.rowProvider (Zotero 9 keeps the one-container-at-a-time path)");
        const lib = Zotero.Libraries.userLibraryID;
        await Zotero.DB.executeTransaction(async () => {
            for (let i = 0; i < N; i++) {
                const p = new Zotero.Item("book");
                p.libraryID = lib;
                p.setField("title", "WV-TEST clear " + String(i).padStart(4, "0"));
                await p.save({ skipNotifier: true });
                const a = /** @type {any} */ (new Zotero.Item("attachment"));
                a.libraryID = lib;
                a.parentID = p.id;
                a.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
                a.attachmentContentType = "application/pdf";
                a.setField("title", "WV-TEST clear pdf " + i);
                await a.save({ skipNotifier: true });
                made.push(p.id, a.id);
            }
        });
        await iv.refresh();
        await iv.waitForLoad();
        iv.collapseAllRows();
        await sleep(500);
    });

    after(async function () {
        try { wv._clearAllFilters(); } catch (e) {}
        try { await Zotero.Items.erase(made); } catch (e) {}
        await sleep(500);
    });

    /** The view's live objects (a collection change can replace them). */
    const bind = () => { iv = win.ZoteroPane.itemsView; rp = iv.rowProvider; };

    it("Clear collapses with one row-map refresh, within a bound, to closed top-level rows", async function () {
        bind();
        // Bound to this window, from a clean state: an earlier spec in a run
        // may leave a quick search, a filter or another window focused.
        const inWin = (fn) => wv._wvWithFilterWin(win, fn);
        const sb = wvT.lib().wvViewEl(win.document, "zotero-tb-search");
        if (sb && sb.value) { sb.value = ""; await win.ZoteroPane.search(); await iv.waitForLoad(); }
        inWin(() => wv._clearAllFilters());
        await sleep(600);
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
        inWin(() => {
            wv._filterState = { groups: [Object.assign(wv._emptyFilterGroup(), { attachmentFileType: ["attachmentPDF"] })], activeGroupIndex: 0 };
            wv._applyItemsListFilter({ cascade: true, deliberate: true });
        });
        const openNow = () => rp._rows.filter(r => r && r.level === 0 && r.isOpen).length;
        await wvT.waitFor(() => (openNow() >= N ? true : null), 15000, 100);
        const opened = openNow();
        assert.isAtLeast(opened, N, "the PDF filter opened every parent with a PDF");
        await sleep(600);   // past the post-apply window: Clear is applied at once
        // Through Zotero's PUBLIC collapseAllRows(true) (MJT 2026-11-22, "the proper
        // fix"), Zotero's own function under Weavero's layers: a counting layer in
        // its place (the wrap table's native, else the filter's saved original),
        // keeping the argument's name, which the code reads.
        const T = Object.prototype.hasOwnProperty.call(rp, "_wvWraps") ? rp._wvWraps : null;
        const slot = T && T.collapseAllRows ? { obj: T.collapseAllRows, key: "native" }
            : (rp._wvOrigCollapseAllRows ? { obj: rp, key: "_wvOrigCollapseAllRows" } : { obj: rp, key: "collapseAllRows" });
        const hadOwn = Object.prototype.hasOwnProperty.call(slot.obj, slot.key);
        const origCAR = slot.obj[slot.key];
        const carCalls = [];
        slot.obj[slot.key] = function (acrossAllLevels) { carCalls.push(acrossAllLevels); return origCAR.call(this, acrossAllLevels); };
        let ms = 0;
        let refreshes = 0;
        try {
            refreshes = await countRefreshes(async () => {
                const t0 = Date.now();
                inWin(() => wv._clearAllFilters());
                ms = Date.now() - t0;
            });
        }
        finally { if (hadOwn) slot.obj[slot.key] = origCAR; else delete slot.obj[slot.key]; }
        assert.deepEqual(carCalls, [true], "Clear closes everything through Zotero's public collapseAllRows(true)");
        assert.isAtMost(refreshes, 3, "one map refresh for the collapse, not one per parent (" + opened + " open; Clear took " + ms + " ms)");
        assert.isBelow(ms, 1500, "Clear took " + ms + " ms for " + rp._rows.length + " rows");
        assert.strictEqual(rp._rows.filter(r => r && r.level > 0).length, 0, "no child row is left");
        assert.strictEqual(rp._rows.filter(r => r && r.isOpen).length, 0, "every top-level row is closed");
        assert.strictEqual(Object.keys(rp._rowMap).length, rp._rows.length, "the row map describes the rows");
        const anyParent = made[0];
        assert.isNumber(rp._rowMap[anyParent], "a parent is still a row");
    });

    it("refreshing stale open parents (a quick search under a chip) rebuilds the row map once", async function () {
        // Same cause on the setFilter path: _wvRefreshStaleOpenParents
        // refreshes each parent whose shown children disagree with
        // getChildItems, through Zotero 11's batching _refreshContainer.
        const K = 200;
        bind();
        try { iv.collapseAllRows(); } catch (e) {}
        await sleep(300);
        const parents = made.filter((id, i) => i % 2 === 0).slice(0, K);
        const idx = parents.map(id => rp._rowMap[id]).filter(i => typeof i === "number");
        assert.strictEqual(idx.length, K, "the parents are rows");
        rp.expandRows(idx);
        await sleep(300);
        const rowsOf = parents.map(id => rp._rows[rp._rowMap[id]]);
        assert.isTrue(rowsOf.every(r => r && r.isOpen), "opened");
        // Make each look stale: its row now answers no children.
        for (const r of rowsOf) r.getChildItems = () => [];
        let n = -1, refreshed = -1;
        try {
            n = await countRefreshes(async () => { refreshed = wv._wvRefreshStaleOpenParents(rp); });
        }
        finally { for (const r of rowsOf) delete r.getChildItems; }
        assert.strictEqual(refreshed, K, "every stale parent was refreshed");
        assert.isAtMost(n, 2, "one map refresh for the " + K + " refreshes, not one each");
        try { rp.refreshRowMap(); iv.collapseAllRows(); } catch (e) {}
        await sleep(300);
    });

    // The collapse's own selection moves (the "update" that follows restores
    // Zotero's cached selection, before and after this fix alike: stubbed
    // here). Zotero 11's path, then the Zotero 10 path forced on the same build.
    for (const variant of ["native", "zotero10"]) {
        it("a selected child row's selection goes to its top-level parent (" + variant + " path)", async function () {
            bind();
            // "native": whatever this Zotero has (11: its batch; 10: the
            // by-id moves); "zotero10": the Zotero 10 path, forced on 11 too.
            const parentID = made[2 + (variant === "native" ? 0 : 2)], childID = made[3 + (variant === "native" ? 0 : 2)];
            const pIdx = rp._rowMap[parentID];
            assert.isNumber(pIdx);
            if (!rp.isContainerOpen(pIdx)) rp.toggleOpenState(pIdx);
            await sleep(300);
            const cIdx = rp._rowMap[childID];
            assert.isNumber(cIdx, "the child row is shown");
            iv.selection.select(cIdx);
            await sleep(200);
            const hadRL = Object.prototype.hasOwnProperty.call(rp, "runListeners");
            const origRL = rp.runListeners;
            rp.runListeners = function () {};
            const shadow = variant === "zotero10" && typeof rp._batchRowChanges === "function";
            if (shadow) rp._batchRowChanges = undefined;
            try { wv._partialCollapseOnFilterClear(rp, iv); }
            finally {
                if (shadow) delete rp._batchRowChanges;
                if (hadRL) rp.runListeners = origRL; else delete rp.runListeners;
            }
            assert.isUndefined(rp._rowMap[childID], "the child row is gone");
            const sel = Array.from(iv.selection.selected);
            assert.deepEqual(sel.map(i => rp._rows[i] && rp._rows[i].id), [parentID], "the parent is selected");
            assert.strictEqual(rp._rows[iv.selection.focused] && rp._rows[iv.selection.focused].id, parentID, "and focused");
            try { iv.tree.invalidate(); } catch (e) {}
        });
    }
});
