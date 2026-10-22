/* global describe, it, before, after, assert, Zotero, wvT */

// Three costs of the filter's apply / clear, measured on the real library on
// 2026-10-22 (work/perf-baselines.json, phase breakdown) and trimmed the same
// day; each guard fails on the pre-trim code:
//  1. A clear after a chip that opened nothing walked every row through
//     isContainer() / isContainerOpen() (83-105 ms on 17,948 rows) and
//     repainted TWICE (after the collapse, then after the chevron maps).
//     Now: one pass over the rows' own `isOpen` flag, no toggle walk when
//     nothing is open, one repaint.
//  2. The chevron tally in materialise read every kept parent's attachments,
//     notes and the predicate per child (94 ms for 15,348 closed journal
//     articles) for nothing drawn: the chevron hangs on a VISIBLE child. Now
//     only open (or revealed) containers are tallied.
//  3. The collection row's getItems hook fed the FOCUSED main window's row
//     provider (Zotero.getMainWindow()) with the new search set; the window
//     whose row it is gets it now.

describe("Weavero — filter apply and clear without the walks that drew nothing", function () {
    this.timeout(60000);
    let wv, win, ZP, iv, rp, parent, attA, attB, rnd;
    const applyChip = async (mutate, opts) => {
        const g = wv._emptyFilterGroup(); mutate(g);
        wv._filterState = { groups: [g], activeGroupIndex: 0 };
        wv._renderFilterBar();
        await wv._applyItemsListFilter(opts || {});
    };
    const rowIndexOf = (id) => { for (let i = 0; i < rp._rows.length; i++) { const r = rp._rows[i]; if (r && r.ref && r.ref.id === id) return i; } return -1; };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_partialCollapseOnFilterClear", "_wvFilterApplyMaterialise", "_patchOneCtrGetItems", "_clearAllFilters"]) if (!wv || typeof wv[m] !== "function") wvT.absent(m);
        win = Zotero.getMainWindow(); ZP = win.ZoteroPane; iv = ZP.itemsView; rp = iv.rowProvider;
        if (!rp || !rp._rows) wvT.absent("itemsView.rowProvider._rows");
        rnd = Zotero.Utilities.randomString(6).toLowerCase();
        parent = await wvT.createItem("journalArticle", { title: "WV costs parent " + rnd });
        attA = await Zotero.Attachments.linkFromURL({ url: "https://example.org/" + rnd + "/a", parentItemID: parent.id, title: "WV costs link A " + rnd });
        attB = await Zotero.Attachments.linkFromURL({ url: "https://example.org/" + rnd + "/b", parentItemID: parent.id, title: "WV costs link B " + rnd });
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await iv.waitForLoad();
        try { iv.collapseAllRows(); } catch (e) {}
        await wvT.sleep(400);
    });

    after(async function () {
        try { wv._clearAllFilters(); } catch (e) {}
        await wvT.erase(parent);
    });

    it("a clear with nothing open skips the toggle walk and repaints once", async function () {
        await applyChip(g => { g.itemType = ["journalArticle"]; });
        await wvT.sleep(600);
        assert.isTrue(wv._isFilterActive(wv._filterState), "the chip is on");
        assert.isFalse(rp._rows.some(r => r && r.isOpen === true), "nothing is open in the view (collapsed library, parent-level chip)");
        let toggles = 0, invalidates = 0;
        const ownT = Object.prototype.hasOwnProperty.call(rp, "_toggleOpenState"); const origT = rp._toggleOpenState;
        if (typeof origT === "function") rp._toggleOpenState = function () { toggles++; return origT.apply(this, arguments); };
        const ownI = Object.prototype.hasOwnProperty.call(iv.tree, "invalidate"); const origI = iv.tree.invalidate;
        iv.tree.invalidate = function () { invalidates++; return origI.apply(this, arguments); };
        try {
            wv._clearAllFilters();
            await wvT.sleep(300);
        } finally {
            if (typeof origT === "function") { if (ownT) rp._toggleOpenState = origT; else delete rp._toggleOpenState; }
            if (ownI) iv.tree.invalidate = origI; else delete iv.tree.invalidate;
        }
        assert.isFalse(wv._isFilterActive(wv._filterState), "the chip is off");
        assert.strictEqual(toggles, 0, "no container toggled on a clear that had nothing open");
        assert.strictEqual(invalidates, 1, "one repaint for the clear (collapse, then maps, then paint)");
    });

    it("the chevron tally covers open or revealed containers only; a closed parent with a non-matching child has no entry, an open one does", async function () {
        // Parent-level chip on the collapsed view: the parent matches, its
        // two links do not; closed, it draws no chevron, so no tally.
        await applyChip(g => { g.itemType = ["journalArticle"]; });
        await wvT.sleep(600);
        assert.isTrue(wv._isFilterActive(wv._filterState), "the chip is on");
        const closedTally = wv._wvHiddenCounts;
        assert.isOk(closedTally, "a tally map exists");
        assert.isFalse(closedTally.has(parent.id), "closed parent: no tally (nothing to draw it on)");
        // Open the parent by hand (the user's twisty): now its first visible
        // child carries the chevron, so the tally must be there and count
        // the non-matching children that are shown... none hidden here since
        // both links are revealed by the manual open; a revealed container
        // counts them all the same (the collapse toggle keeps its tally).
        const i = rowIndexOf(parent.id);
        assert.isAbove(i, -1, "the parent row is in the view");
        // A re-apply of the same chip is a signature no-op, and the clear's
        // inactive pass drops the reveal set: clear first, reveal, apply.
        wv._clearAllFilters();
        await wvT.sleep(500);
        if (!wv._userRevealedAllIDs) wv._userRevealedAllIDs = new Set();
        wv._userRevealedAllIDs.add(parent.id);
        try {
            await applyChip(g => { g.itemType = ["journalArticle"]; });
            await wvT.sleep(600);
            const openTally = wv._wvHiddenCounts;
            assert.strictEqual(openTally && openTally.get(parent.id), 2, "revealed parent: both non-matching links tallied");
        } finally {
            try { wv._userRevealedAllIDs.delete(parent.id); } catch (e) {}
            wv._clearAllFilters();
            await wvT.sleep(400);
        }
    });

    it("the getItems hook writes the new search set to the provider of the window it was patched for, not the focused window's", async function () {
        const target = { ZoteroPane: { itemsView: { rowProvider: {} } } };
        const items = [parent, attA, attB];
        const fakeCtr = { getItems: async () => items.slice() };
        const mainBefore = rp._searchItemIDs;
        wv._patchOneCtrGetItems(fakeCtr, target);
        assert.isTrue(!!fakeCtr._wvGetItemsRevealPatched, "patched");
        const got = await fakeCtr.getItems();
        assert.lengthOf(got, 3, "the base items pass through");
        const set = target.ZoteroPane.itemsView.rowProvider._searchItemIDs;
        assert.isOk(set && set.has && set.has(parent.id) && set.has(attA.id) && set.has(attB.id), "the target window's provider got the set");
        assert.strictEqual(rp._searchItemIDs, mainBefore, "the focused window's provider was left alone");
    });
});
