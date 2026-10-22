/* global describe, it, before, after, assert, Zotero */
// The tab-order stabilizer's circuit breaker (2026-10-15).
//
// _wvTabGroupStabilize enforces the canonical tab order (loose pins left,
// groups contiguous, pinned members first) with Zotero_Tabs.move(); every
// move re-renders the bar, the tab-bar MutationObserver re-runs the apply
// chain, and the chain ends in the stabilizer. An order move() cannot
// realize -- or one another handler keeps undoing -- is therefore an endless
// cycle that freezes the UI (2026-07-03 mirror sync; MJT's freeze while
// reordering pinned tabs, 2026-10-15). The breaker: more than 8 reorder
// passes within a second backs off for 3 s and logs both orders.
//
// Simulated here by making move() a no-op: the order then never settles.
describe("Weavero — tab-order stabilizer backs off from a reorder storm", function () {
    this.timeout(60000);
    let wv, win, ZT, a, b, origMove;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabGroupStabilize", "_pinnedTabsAdd", "_pinnedTabsRemove", "_applyPinnedTabs"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow();
        ZT = win.Zotero_Tabs;
        a = await wvT.createTestPDFItem("wv-burst-a");
        b = await wvT.createTestPDFItem("wv-burst-b");
        await wvT.openReaderTab(a.id);
        await wvT.openReaderTab(b.id);
        await waitFor(() => ZT._tabs.filter(t => t.data && (t.data.itemID === a.id || t.data.itemID === b.id)).length === 2, 15000, "two tabs");
    });

    after(async function () {
        try { if (origMove) ZT.move = origMove; } catch (e) {}
        try { delete win._wvStabilizeBurst; } catch (e) {}
        try { wv._pinnedTabsRemove(b.libraryID, b.key); wv._applyPinnedTabs(win); } catch (e) {}
        for (const it of [a, b]) { try { const t = ZT._tabs.find(x => x.data && x.data.itemID === it.id); if (t) ZT.close(t.id); } catch (e) {} }
        await sleep(300);
        await wvT.erase(a, b);
    });

    it("more than 8 reorder passes in a second trips the breaker; it re-arms after 3 s", async function () {
        // b pinned while a (unpinned) sits before it: the canonical order wants
        // b left of a, so stabilize has something to do.
        const ta = ZT._tabs.find(t => t.data && t.data.itemID === a.id), tb = ZT._tabs.find(t => t.data && t.data.itemID === b.id);
        assert.ok(ta && tb);
        if (ZT._tabs.indexOf(ta) > ZT._tabs.indexOf(tb)) ZT.move(ta.id, ZT._tabs.indexOf(tb));
        wv._pinnedTabsAdd(b.libraryID, b.key);
        // Publish the pin without stabilizing (the real apply would reorder).
        win._wvPinnedTabIDs = new Set([tb.id]);
        delete win._wvStabilizeBurst;
        let moves = 0;
        origMove = ZT.move;
        ZT.move = function () { moves++; };   // the order never settles
        try {
            for (let i = 0; i < 12; i++) wv._wvTabGroupStabilize(win);
            const burst = win._wvStabilizeBurst;
            assert.ok(burst, "the breaker keeps its count on the window");
            assert.isAbove(burst.tripped, 0, "tripped");
            assert.strictEqual(burst.n, 9, "8 passes ran, the 9th tripped");
            const movesAtTrip = moves;
            assert.isAtLeast(movesAtTrip, 8, "the 8 passes each tried to move");
            wv._wvTabGroupStabilize(win);
            wv._wvTabGroupStabilize(win);
            assert.strictEqual(moves, movesAtTrip, "tripped: no more moves");
            // Re-arm after 3 s.
            burst.tripped = Date.now() - 3100;
            wv._wvTabGroupStabilize(win);
            assert.isAbove(moves, movesAtTrip, "re-armed: a pass runs again");
            assert.strictEqual(burst.tripped, 0, "and the trip is cleared");
        }
        finally {
            ZT.move = origMove; origMove = null;
            delete win._wvStabilizeBurst;
        }
    });

    it("a normal apply is untouched: eight passes a second is far above anything a drop produces", async function () {
        delete win._wvStabilizeBurst;
        // The real move: one pass settles the order, the next is a no-op.
        wv._wvTabGroupStabilize(win);
        wv._wvTabGroupStabilize(win);
        const burst = win._wvStabilizeBurst;
        assert.ok(!burst || !burst.tripped, "no trip");
        const tb = ZT._tabs.find(t => t.data && t.data.itemID === b.id), ta = ZT._tabs.find(t => t.data && t.data.itemID === a.id);
        assert.isBelow(ZT._tabs.indexOf(tb), ZT._tabs.indexOf(ta), "the loose pin moved left of the unpinned tab");
    });
});
