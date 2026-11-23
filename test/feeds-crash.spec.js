/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-FEEDHEAD (src/modules/upstream-fixes.ts; fdcrash, 2026-11-22). Zotero.crash()
// -- "An error has occurred. Please restart Zotero.", the items view locked until a
// restart -- after "can't access property "label", elem is null" in itemPane.js: MJT's
// Zotero right after a Weavero reload, and a spec run right after Feeds was switched on.
//
// Zotero's race, reproduced with Weavero DISABLED (9/24 trials, plain Zotero calls):
// each item-tree column (un)registration -- every plugin's start and shutdown -- runs
// refreshAndMaintainSelection on every items view; it captures the selection, awaits a
// serial refresh and restores it. A feed item restored after the user picked My Library
// reaches itemSelected with My Library's row: updateItemPaneButtons draws no feed buttons
// (it asks the ROW), renderItemPane labels them (it asks the ITEM), null -> TypeError ->
// Zotero.crash(). Weavero's reload (un)registers ~8 columns: 5/5 crashed before the fix.
//
// Zotero.crash is replaced by a recorder for this spec (and Zotero.logError watched), so
// a regression shows here as a failure and does NOT lock the runner's items view for the
// specs after it.

describe("Weavero -- no Zotero crash when a feed item reaches the item pane under another row (WV-TEMP-FEEDHEAD)", function () {
    this.timeout(300000);
    let wv, win, feed = null, libItem = null;
    const F = [];
    const crashes = [];
    const errs = [];
    let origCrash = null, origLogError = null;
    const sleep = (ms) => new Promise((r) => win.setTimeout(r, ms));
    const iv = () => win.ZoteroPane.itemsView;
    const cv = () => win.ZoteroPane.collectionsView;
    /** The item pane of the active library view (one per library tab on zotero#6035). */
    const pane = () => {
        const lv = /** @type {any} */ (win.ZoteroPane).libraryView;
        return /** @type {any} */ ((lv && lv.itemPane) || win.ZoteroPane.itemPane);
    };
    const libRow = () => "L" + Zotero.Libraries.userLibraryID;
    const feedRow = () => "L" + feed.libraryID;
    const rowObj = (id) => cv().getRow(cv().getRowIndexByID(id));
    const elemNull = () => errs.filter((e) => /elem is null/.test(e));

    async function feedItem(fields) {
        const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
        it.libraryID = feed.libraryID;
        it.guid = "wv-fdcrash-" + Zotero.Utilities.randomString();
        for (const k of Object.keys(fields)) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: "Crash", firstName: "Test" }]);
        await it.saveTx();
        return it;
    }
    async function showRow(id) {
        const c = cv();
        assert.ok(await wvT.waitFor(() => c.getRowIndexByID(id) !== false, 15000, 100), "collection-tree row " + id + " present");
        await c.selectByID(id);
        await iv().waitForLoad();
        await wvT.waitFor(() => iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].id === id, 10000, 50);
    }
    /** A feed item selected in the feed's view, its pane drawn (Zotero sets the pane's
     *  translation target there: the label call that crashed). */
    async function feedItemShown(it) {
        await showRow(feedRow());
        await iv().selectItem(it.id);
        assert.ok(await wvT.waitFor(() => !!pane()._translationTarget, 5000, 50), "fixture: the feed item's pane drawn");
        await sleep(300);
    }
    /** What itemSelected hands the pane while an items-view refresh lands across a switch:
     *  a feed item, a library row -- then a feed row with nothing selected, and an item
     *  change (the pane's own item observer). Returns the first error, or null. */
    async function mismatch() {
        const ip = pane();
        try {
            ip.data = [F[1]];
            ip.collectionTreeRows = [rowObj(libRow())];
            ip.updateItemPaneButtons([F[1]]);
            await ip.render();
            ip.data = [];
            ip.collectionTreeRows = [rowObj(feedRow())];
            ip.updateItemPaneButtons([]);
            ip.notify("modify", "item", [F[0].id]);
            return null;
        }
        catch (e) { return e; }
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow();
        libItem = await wvT.createItem("journalArticle", { title: "WV-TEST fdcrash library item" });
        const f = /** @type {any} */ (new Zotero.Feed());
        f.name = "WV-TEST fdcrash feed";
        f.description = "";
        f.url = "https://wv-fdcrash-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
        f.refreshInterval = 24 * 60;
        f.cleanupReadAfter = 60;
        f.cleanupUnreadAfter = 90;
        await f.saveTx();
        feed = f;
        for (let i = 0; i < 6; i++) F.push(await feedItem({ title: "Drop impact on a pool, part " + i, date: "2026-11-0" + (i + 1) }));
        origCrash = Zotero.crash;
        origLogError = Zotero.logError;
        Zotero.crash = function () { crashes.push(new Error().stack); };
        Zotero.logError = function (e) {
            try { errs.push(String(e && e.message || e) + " @ " + String(e && e.stack || "").split("\n").slice(0, 4).join(" | ")); } catch (x) {}
            return origLogError.apply(this, arguments);
        };
    });

    after(async function () {
        if (origCrash) Zotero.crash = origCrash;
        if (origLogError) Zotero.logError = origLogError;
        try { await showRow(libRow()); } catch (e) {}
        try { if (feed) await feed.eraseTx(); } catch (e) {}
        await wvT.erase(libItem);
    });

    it("the item pane given a feed item under a library row (and a feed row with nothing selected) throws nothing", async function () {
        await feedItemShown(F[0]);
        const err = await mismatch();
        assert.isNull(err, "no error: " + (err && err.message));
        // The pane drawn again from the real state.
        await showRow(libRow());
    });

    it("torn down, Zotero's item pane throws 'elem is null' there (tripwire: fails once Zotero fixes it -- retire WV-TEMP-FEEDHEAD)", async function () {
        if (typeof wv._wvTeardownFeedHeadFix !== "function" || typeof wv._wvWireFeedHeadFix !== "function") wvT.absent("plugin._wvWireFeedHeadFix / _wvTeardownFeedHeadFix");
        await feedItemShown(F[0]);
        wv._wvTeardownFeedHeadFix();
        let err = null;
        try { err = await mismatch(); }
        finally { wv._wvWireFeedHeadFix(win); }
        await showRow(libRow());
        assert.match(String(err && err.message), /elem is null/, "Zotero's own item pane still throws (if not, Zotero checks the buttons now: retire WV-TEMP-FEEDHEAD)");
    });

    it("a burst of item-tree column (un)registrations, then a switch from a feed item to My Library: no crash, no 'elem is null'", async function () {
        const M = Zotero.ItemTreeManager;
        const out = [];
        // Before the fix, with Weavero disabled, n >= 2 and d = 100 crashed 6/6 (n = 8, d = 300: 2/2).
        for (const [n, d] of [[4, 100], [8, 100], [8, 300], [4, 100], [8, 100], [2, 100]]) {
            await feedItemShown(F[0]);
            const c0 = crashes.length, e0 = elemNull().length;
            for (let i = 0; i < n; i++) {
                const k = M.registerColumn({ dataKey: "wvfdprobe" + i, label: "P" + i, pluginID: "wv-test-probe@weavero.invalid", dataProvider: () => "" });
                if (k) M.unregisterColumn(k);
            }
            await sleep(d);
            try { await cv().selectByID(libRow()); } catch (e) {}
            try { await iv().waitForLoad(); } catch (e) {}
            await sleep(2500);
            out.push({ n, d, crash: crashes.length - c0, elemNull: elemNull().length - e0 });
        }
        const bad = out.filter((r) => r.crash || r.elemNull);
        assert.deepEqual(bad, [], "trials with a crash: " + bad.length + "/" + out.length + " " + JSON.stringify(elemNull().slice(0, 2)));
        assert.isNotOk(iv()._locked, "the items view not locked");
        assert.strictEqual(iv().collectionTreeRows[0].id, libRow(), "the switch landed: My Library shown");
    });
});
