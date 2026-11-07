/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// The items-list filter in every library tab (zotero#6035, MJT 2026-11-07: "Also filter
// in a second library tab"). One bar per window, on the tab on screen; one filter per tab.

describe("Weavero — the filter in every library tab (zotero#6035)", () => {
    let wv, lib, win, items;
    const realNative = wvT.nativeWindows();
    const rows = (w) => { const iv = w.ZoteroPane.itemsView, rp = iv.rowProvider || iv; return rp.getRowCount ? rp.getRowCount() : rp._rows.length; };
    const bar = (w) => w.document.getElementById("wv-filter-bar");
    const btn = (w) => w.document.getElementById("wv-filter-tb-button");

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("!wv");
        if (!realNative) this.skip();
        this.timeout(60000);
        win = Zotero.getMainWindows()[0];
        items = [];
        for (let i = 0; i < 4; i++) {
            const it = new Zotero.Item("book");
            it.setField("title", "wv-library-tabs " + i);
            if (i % 2) it.setField("abstractNote", "an abstract");
            await it.saveTx();
            items.push(it);
        }
    });

    /** A window of its own, with a second library tab on screen. */
    async function twoTabs() {
        const w = await wvT.openMainWindow();
        const T = w.Zotero_Tabs;
        await wvT.waitFor(() => w.ZoteroPane.itemsView && bar(w), 15000);
        const first = T.selectedID;
        await w.ZoteroPane.newLibraryTab();
        const second = await wvT.waitFor(() => T._tabs.find(t => t.id !== first && t.type.startsWith("library")), 10000);
        T.select(second.id);
        const view = await wvT.waitFor(() => {
            const v = w.ZoteroPane.getLibraryView(second.id);
            return v && v.loaded && w._wvFilterViewTab === second.id ? v : null;
        }, 15000);
        return { w, T, first, second, view };
    }

    /** Run `fn` with the filter bound to window `w`. */
    async function bound(w, fn) {
        const prev = wv._wvFilterWinOverride;
        wv._wvFilterWinOverride = w;
        try { return await fn(); }
        finally { wv._wvFilterWinOverride = prev || null; }
    }

    async function filterOn(w) {
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
        const all = rows(w);
        await bound(w, async () => {
            const g = wv._emptyFilterGroup();
            g.hasAbstract = true;
            wv._filterState = { groups: [g], activeGroupIndex: 0 };
            wv._renderFilterBar();
        });
        // An apply can bounce off a refresh, and its retry goes to the focused window,
        // which the runner does not guarantee is this one: apply again, bound to it.
        return wvT.waitFor(() => {
            if (rows(w) < all) return all;
            bound(w, () => wv._applyItemsListFilter({ cascade: true }));
            return null;
        }, 8000, 400);
    }

    afterEach(async function () {
        if (!realNative) return;
        this.timeout(20000);
        for (const w of Zotero.getMainWindows().filter(x => x !== win)) { try { w.close(); } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
    });

    after(async function () {
        if (!realNative) return;
        this.timeout(30000);
        for (const it of items || []) await wvT.erase(it);
    });

    it("the bar and its button are in the tab on screen, and follow it", async function () {
        this.timeout(45000);
        const { w, T, first, view } = await twoTabs();
        assert.isTrue(view.contains(bar(w)), "the bar in the second tab's view");
        assert.isTrue(view.contains(btn(w)), "the button in its toolbar");
        assert.isTrue(lib.wvViewEl(w.document, "zotero-tb-search") === view.getElement("zotero-tb-search"), "lookups reach that view");
        T.select(first);
        const v1 = w.ZoteroPane.getLibraryView(first);
        assert.isOk(await wvT.waitFor(() => v1.contains(bar(w)), 5000), "back with the first tab");
        assert.isTrue(v1.contains(btn(w)), "the button too");
        assert.strictEqual(w.document.querySelectorAll("#wv-filter-bar").length, 1, "one bar");
    });

    it("each tab has its own filter", async function () {
        this.timeout(45000);
        const { w, T, first, second } = await twoTabs();
        const all = await filterOn(w);
        assert.isOk(all, "the second tab filtered");
        assert.notStrictEqual(bar(w).style.display, "none", "its chips show");
        T.select(first);
        await wvT.waitFor(() => w._wvFilterViewTab === first, 5000);
        assert.isFalse(await bound(w, () => wv._wvUserFilterActive(wv._filterState)), "the first tab has no filter");
        assert.strictEqual(bar(w).style.display, "none", "and no chips");
        assert.isAtLeast(rows(w), all, "and all its rows");
        T.select(second.id);
        await wvT.waitFor(() => w._wvFilterViewTab === second.id, 5000);
        assert.isTrue(await bound(w, () => wv._wvUserFilterActive(wv._filterState)), "the second keeps its filter");
        assert.isOk(await wvT.waitFor(() => (rows(w) < all ? true : null), 5000), "and its rows");
    });

    it("with the first library tab closed the bar stays, and the filter works", async function () {
        this.timeout(45000);
        const { w, T, first, second } = await twoTabs();
        T.select(first);
        await wvT.waitFor(() => w._wvFilterViewTab === first, 5000);
        T.close(first);
        await wvT.waitFor(() => T.selectedID === second.id && w._wvFilterViewTab === second.id, 8000);
        assert.isOk(bar(w) && bar(w).isConnected, "the bar is in the tab that is left");
        assert.isOk(btn(w) && btn(w).isConnected, "and its button");
        assert.isOk(await filterOn(w), "it filters there");
    });

    it("the view wiring runs for the second tab's tree", async function () {
        this.timeout(45000);
        const { w, view } = await twoTabs();
        assert.isOk(view._wvViewWireTag, "wired");
        const iv = view.itemsView;
        assert.strictEqual(iv._wvSetFilterWrapped, wv._wvWireTag(), "its items view");
        assert.isTrue(Object.prototype.hasOwnProperty.call(view.collectionsView, "_includedInTree"), "hidden collections reach its tree");
        assert.isOk(w.ZoteroPane.itemsView === iv);
    });
});
