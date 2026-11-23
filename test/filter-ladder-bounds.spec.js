/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-11-22 (1.2.1-citations.28/29, 11.0-beta.5, a 48k-item library):
// "Clicking a few filters seems to have made Zotero unresponsive" -- twice,
// clicking the attachment-type buttons (PDF, Image, Snapshot). Measured on a
// copy of his database (D:/tmp/freeze-probe-*.txt): each file-type click held
// the main thread 7-15 s, and two thirds of a 35-s profile was NOT the clicks
// but the data-change ladder -- every notification Zotero's items view hears
// (a feed's housekeeping "delete feedItem" in a library the window does not
// show) started four full cascade re-applies of 0.5-5 s each on 40k rows
// (one feed cleanup = six applies, 7.3 s), each pass re-judging every row
// although nothing had changed.
//
// The bounds locked here, each FAILING on 1.2.1-citations.29:
//  1. a notification that cannot move the view starts no ladder (feed traffic
//     in a library view; items of a library the view does not show);
//  2. a confirming pass that finds the rows pass 0 left re-applies nothing;
//  3. after a heavy apply the ladder waits at least twice its time (the main
//     thread stays free at least half the time).
describe("Weavero — the filter's data-change ladder is bounded (MJT's freeze, 2026-11-22)", function () {
    this.timeout(90000);
    let wv, win, book;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function applies(fn) {
        const seen = [];
        const own = Object.prototype.hasOwnProperty.call(wv, "_applyItemsListFilter");
        const orig = wv._applyItemsListFilter;
        wv._applyItemsListFilter = function (o) {
            try { seen.push({ cascade: !!(o && o.cascade), at: Date.now() }); } catch (e) {}
            return orig.apply(this, arguments);
        };
        try { await fn(); }
        finally { if (own) wv._applyItemsListFilter = orig; else delete wv._applyItemsListFilter; }
        return seen;
    }
    const cascades = (seen) => seen.filter(s => s.cascade).length;
    /** No ladder of this window is pending (each runs out within ~3 s light). */
    const laddersIdle = () => sleep(3400);

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvScheduleReapplyAfterDataChange", "_wvApplyWinStOf", "_applyItemsListFilter", "_emptyFilterGroup"]) wvT.method(m);
        win = Zotero.getMainWindow();
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        book = await wvT.createItem("book", { title: "WV-TEST ladder book", abstractNote: "an abstract" });
        const g = wv._emptyFilterGroup();
        g.hasAbstract = true;
        wv._filterState = { groups: [g], activeGroupIndex: 0 };
        wv._applyItemsListFilter({ deliberate: true });
        await laddersIdle();
    });

    after(async function () {
        try { wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 }; wv._applyItemsListFilter({ deliberate: true }); } catch (e) {}
        try { await book.eraseTx(); } catch (e) {}
        await sleep(500);
    });

    it("which notifications can move a My Library view", function () {
        wvT.method("_wvNotifyCanMoveView");
        const lib = Zotero.Libraries.userLibraryID;
        const can = (note) => wv._wvNotifyCanMoveView(win, note);
        assert.isFalse(can({ ev: "delete", type: "feedItem", ids: [987654301] }), "a feed's housekeeping");
        assert.isFalse(can({ ev: "modify", type: "feed", ids: [3] }), "a feed's own record");
        assert.isFalse(can({ ev: "delete", type: "item", ids: [987654302], extra: { 987654302: { libraryID: 987654 } } }), "a deleted item of another library");
        assert.isTrue(can({ ev: "delete", type: "item", ids: [987654303], extra: { 987654303: { libraryID: lib } } }), "a deleted item of this library");
        assert.isTrue(can({ ev: "modify", type: "item", ids: [book.id] }), "an item of this library");
        assert.isTrue(can({ ev: "add", type: "item-tag", ids: [book.id + "-77"] }), "a tag on an item of this library");
        assert.isTrue(can({ ev: "add", type: "collection-item", ids: ["5-" + book.id] }), "an item of this library added to a collection");
        assert.isTrue(can({ ev: "modify", type: "item", ids: [987654304] }), "an item it cannot place: counted as a change");
        assert.isTrue(can({ ev: "modify", type: "collection", ids: [5] }), "a collection change: counted as a change");
    });

    it("a feed's housekeeping reaching the items view re-applies nothing", async function () {
        await laddersIdle();
        const seen = await applies(async () => {
            // Zotero's own path: the items view hears feedItem events (itemTree.jsx
            // registers for them) and Weavero's notify wrap arms the ladder.
            await Zotero.Notifier.trigger("delete", "feedItem", [987654311], {}, true);
            await sleep(2000);
        });
        assert.strictEqual(cascades(seen), 0, "no re-apply for a feed item in a library view: " + JSON.stringify(seen));
    });

    it("a ladder's confirming passes re-apply nothing when the rows did not change", async function () {
        await laddersIdle();
        const seen = await applies(async () => {
            wv._wvScheduleReapplyAfterDataChange(win);   // a data change that moves no row
            await sleep(3300);   // passes at 350, 800, 1,600 and 3,000 ms
        });
        assert.strictEqual(cascades(seen), 1, "pass 0 only: " + JSON.stringify(seen));
    });

    it("after a heavy apply the ladder waits at least twice its time", async function () {
        await laddersIdle();
        const wst = wv._wvApplyWinStOf(win);
        wst.lastApplyMs = 1500;   // as a 40k-row apply measured
        const t0 = Date.now();
        const seen = await applies(async () => {
            wv._wvScheduleReapplyAfterDataChange(win);
            await sleep(3500);
        });
        const first = seen.find(s => s.cascade);
        assert.isOk(first, "pass 0 ran in the end: " + JSON.stringify(seen));
        assert.isAtLeast(first.at - t0, 2900, "pass 0 waited ~2 x 1,500 ms, not 350");
        await laddersIdle();
    });
});
