/* global describe, it, before, after, assert, Zotero, wvT */

// After a quick search lands, Zotero rebuilds the parents that were ALREADY
// open against the previous search's match set (collectionViewItemTree.jsx
// `_refresh`: open parents refreshed at 561-565, `_searchItemIDs` stored at
// 575), so the hide-context-attachments rule read a stale set there. The
// setFilter wrapper re-refreshes those parents; until 2026-10-22 it refreshed
// EVERY open parent (~17,500 close+open splices on an Everything search of a
// 48k-item library, 0.7-1.7 s), now only the ones whose shown children
// disagree with getChildItems' answer (`_wvRefreshStaleOpenParents`). In one
// window that is none: the collection row's getItems hook already hands
// Zotero's toggle phase the new set (`_patchOneCtrGetItems`), so the old loop
// was pure cost there; a stale parent (the shape a background window's search
// leaves) is forced by hand below and must be the only one refreshed. The
// chevron maps, computed by the chip-less apply, are computed once per input
// set: the post-search apply and the observer's reapply used to walk the rows
// twice. All of it fails on the pre-fix code: the method is absent, and the
// maps were computed at least twice.
//
// Fixture: a second search typed while parents are open from a first one.
//   P1: A1 "<w1> <w2>", A2 "<w1> beta", A6 "gamma"  -> open after <w2> with [A1];
//       <w1> wants [A1, A2]: STALE, the one refresh
//   P2: A3 "<w1> three"                              -> not in view after <w2>;
//       opened by the match-parent expansion after the new set: already right
//   P3: A4 "<w2> four", A5 "<w2> five"               -> open after <w2>; out of
//       the view after <w1>
//   P4: A7 "<w2> <w1>", A8 "zeta"                    -> open after <w2> with [A7];
//       <w1> wants [A7]: unchanged, no refresh

describe("Weavero — a quick search re-refreshes only the open parents whose children went stale, and computes the chevron maps once", function () {
    this.timeout(90000);
    let wv, win, ZP, rp, quick, w1, w2;
    const P = {}, A = {};
    let prevMode, prevShowCtx;

    const search = async (text) => {
        quick.value = text;
        quick.doCommand();
        await ZP.itemsView._refreshPromise;
        await wvT.sleep(800);
    };
    /** ids of the direct children shown under the parent's row, or null when the parent is not in the view */
    const shownUnder = (parent) => {
        const rows = rp._rows;
        const i = rows.findIndex(r => r && r.ref && r.ref.id === parent.id);
        if (i < 0) return null;
        const out = [];
        for (let j = i + 1; j < rows.length; j++) {
            const c = rows[j];
            if (!c || !(c.level > rows[i].level)) break;
            if (c.level === rows[i].level + 1 && c.ref) out.push(c.ref.id);
        }
        return out.sort((x, y) => x - y);
    };
    const ids = (...atts) => atts.map(a => a.id).sort((x, y) => x - y);

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvRefreshStaleOpenParents !== "function") wvT.absent("_wvRefreshStaleOpenParents");
        if (typeof wv._wvComputeChevronMapsForQuickSearch !== "function") wvT.absent("_wvComputeChevronMapsForQuickSearch");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        rp = ZP.itemsView.rowProvider;
        if (!rp || !rp._rows) wvT.absent("itemsView.rowProvider._rows");
        quick = win.document.getElementById("zotero-tb-search-textbox");
        prevMode = Zotero.Prefs.get("search.quicksearch-mode");
        prevShowCtx = Zotero.Prefs.get("weavero.showContextAttachmentRows");
        Zotero.Prefs.set("search.quicksearch-mode", "fields");
        Zotero.Prefs.set("weavero.showContextAttachmentRows", false);
        const rnd = Zotero.Utilities.randomString(6).toLowerCase();
        w1 = "wvsel" + rnd; w2 = "wvalp" + rnd;
        for (const k of ["P1", "P2", "P3", "P4"]) P[k] = await wvT.createItem("journalArticle", { title: "WV stale parent " + k });
        const att = async (parent, key, title) => {
            A[key] = await Zotero.Attachments.linkFromURL({ url: "https://example.org/" + rnd + "/" + key, parentItemID: parent.id, title });
        };
        await att(P.P1, "A1", w1 + " " + w2);
        await att(P.P1, "A2", w1 + " beta");
        await att(P.P1, "A6", "gamma");
        await att(P.P2, "A3", w1 + " three");
        await att(P.P3, "A4", w2 + " four");
        await att(P.P3, "A5", w2 + " five");
        await att(P.P4, "A7", w2 + " " + w1);
        await att(P.P4, "A8", "zeta");
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await wvT.sleep(400);
    });

    after(async function () {
        try { await search(""); } catch (e) {}
        Zotero.Prefs.set("search.quicksearch-mode", prevMode === undefined ? "fields" : prevMode);
        if (prevShowCtx === undefined) { try { Zotero.Prefs.clear("weavero.showContextAttachmentRows"); } catch (e) {} }
        else Zotero.Prefs.set("weavero.showContextAttachmentRows", prevShowCtx);
        await wvT.erase(...Object.values(P));
    });

    it("the second search refreshes the one stale parent, leaves the right rows, and computes the chevron maps once", async function () {
        // First search: parents open as the rule wants them.
        await search(w2);
        assert.isTrue(await wvT.waitFor(() => shownUnder(P.P1) && shownUnder(P.P1).length === 1, 8000), "P1 open after the first search: " + JSON.stringify(shownUnder(P.P1)));
        assert.deepEqual(shownUnder(P.P1), ids(A.A1), "P1 shows A1 only (A2, A6 do not match)");
        assert.deepEqual(shownUnder(P.P3), ids(A.A4, A.A5), "P3 shows both (all match)");
        assert.deepEqual(shownUnder(P.P4), ids(A.A7), "P4 shows A7 only");
        assert.isNull(shownUnder(P.P2), "P2 is not in the view");

        // Count the refreshes the selective pass makes and the chevron computations.
        let inSel = false, selRefreshes = 0, selReturned = null, chevronRuns = 0, beforeSel = null;
        const rcLog = [];
        const ownRC = Object.prototype.hasOwnProperty.call(rp, "_refreshContainer");
        const origRC = rp._refreshContainer;
        rp._refreshContainer = function (i) { if (inSel) selRefreshes++; try { const r = this._rows[i]; rcLog.push((inSel ? "sel:" : "other:") + (r && r.ref ? r.ref.id : "?")); } catch (e) {} return origRC.apply(this, arguments); };
        const origSel = wv._wvRefreshStaleOpenParents;
        wv._wvRefreshStaleOpenParents = function (rpx) {
            try { const s = rpx && (rpx.searchItemIDs || rpx._searchItemIDs); beforeSel = { p1: shownUnder(P.P1), p4: shownUnder(P.P4), setHasA2: !!(s && s.has(A.A2.id)), setHasA1: !!(s && s.has(A.A1.id)), searchMode: !!(rpx && (rpx.searchMode || rpx._searchMode)) }; } catch (e) { beforeSel = { err: String(e) }; }
            inSel = true; try { selReturned = origSel.apply(this, arguments); return selReturned; } finally { inSel = false; }
        };
        const origChev = wv._wvComputeChevronMapsForQuickSearch;
        // The compute answers true when it walked the rows, false on a memo hit (pre-fix: undefined, never counted).
        wv._wvComputeChevronMapsForQuickSearch = function () { const r = origChev.apply(this, arguments); if (r === true) chevronRuns++; return r; };
        try {
            await search(w1);
            assert.isTrue(await wvT.waitFor(() => { const s = shownUnder(P.P1); return !!s && s.length === 2; }, 8000), "P1 shows both matching children after the second search: " + JSON.stringify(shownUnder(P.P1)));
            assert.deepEqual(shownUnder(P.P1), ids(A.A1, A.A2), "P1: A2 came in, A6 stays hidden");
            assert.deepEqual(shownUnder(P.P2), ids(A.A3), "P2 opened by the expansion with its one child");
            assert.deepEqual(shownUnder(P.P4), ids(A.A7), "P4 unchanged: A8 stays hidden");
            assert.isNull(shownUnder(P.P3), "P3 left the view");
            // In one window nothing goes stale: the collection row's getItems
            // hook hands Zotero's toggle phase the new match set before it
            // runs (`_patchOneCtrGetItems`), and `_searchParentIDs` is set
            // early by Zotero itself. So the pass ran (the wrapper calls it)
            // and refreshed nothing -- the old loop refreshed P1, P2 and P4
            // here for no change at all.
            assert.strictEqual(selReturned, 0, "the pass ran inside the wrapper and found nothing stale; before the pass: " + JSON.stringify(beforeSel) + "; refreshes: " + JSON.stringify(rcLog));
            assert.strictEqual(selRefreshes, 0, "no _refreshContainer call inside the pass");
            // The observer's reapply lands after the tree repaints: give it room, then count.
            await wvT.sleep(2000);
            assert.strictEqual(chevronRuns, 1, "the chevron maps were computed once for the search (the _refresh wrap's call; the post-search apply and the observer's reapply hit the memo)");
            assert.strictEqual(wv._wvHiddenCounts && wv._wvHiddenCounts.get(P.P1.id), 1, "P1 has one hidden child (A6) in the chevron map");
            assert.strictEqual(wv._wvHiddenCounts && wv._wvHiddenCounts.get(P.P4.id), 1, "P4 has one hidden child (A8)");
            assert.isFalse(!!(wv._wvHiddenCounts && wv._wvHiddenCounts.has(P.P2.id)), "P2 has nothing hidden");

            // A stale parent, forced (the shape a background window's search
            // leaves, where the getItems hook wrote to the focused window's
            // provider): P1 shows [A1] while the rule wants [A1, A2]. The pass
            // refreshes P1 and nothing else.
            const rows = rp._rows;
            const iA2 = rows.findIndex(r => r && r.ref && r.ref.id === A.A2.id);
            assert.isAbove(iA2, 0, "A2's row is in the view");
            rp._removeRow(iA2, true);
            rp.refreshRowMap();
            assert.deepEqual(shownUnder(P.P1), ids(A.A1), "forced: P1 shows A1 only");
            rcLog.length = 0;
            const n = wv._wvRefreshStaleOpenParents(rp);
            rp.refreshRowMap();
            assert.strictEqual(n, 1, "exactly one parent refreshed: " + JSON.stringify(rcLog));
            assert.deepEqual(rcLog, ["sel:" + P.P1.id], "and it is P1");
            assert.deepEqual(shownUnder(P.P1), ids(A.A1, A.A2), "P1 shows both again, A6 still hidden");
            assert.deepEqual(shownUnder(P.P2), ids(A.A3), "P2 untouched");
            assert.deepEqual(shownUnder(P.P4), ids(A.A7), "P4 untouched");
        } finally {
            if (ownRC) rp._refreshContainer = origRC; else delete rp._refreshContainer;
            delete wv._wvRefreshStaleOpenParents;
            delete wv._wvComputeChevronMapsForQuickSearch;
        }
    });
});
