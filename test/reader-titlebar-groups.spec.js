/* global describe, it, before, after, assert, Zotero, Services */

// Issue #70 (2026-11-26): with a reader window's tabs in tab groups, unchecking
// Hide title bar -> Reader window ungrouped them. A reader window without the
// strip has no tab bar, so its extra tabs move into the main window (prefs-
// observers.ts: _wvDisableMigrateReaderTabs) and come back when the option is
// on again (_wvEnablePullBackReaderTabs). The move recorded no group, so the
// tabs reached the main window ungrouped and came back ungrouped, kept out of
// their groups for good (`_wvGroupExcluded`).
// What holds now: in the main window each moved tab is in its group; back in
// the reader window every tab -- the window's own document included -- is in
// the group it had, and the main window keeps no copy.
// Reader windows exist only on a Zotero without its own windows (on zotero#6035
// a document opened in a window is a main window): NATIVE_RETIRED there.

describe("Weavero — a reader window's tab groups survive the Hide title bar toggle (issue #70)", function () {
    this.timeout(180000);
    let main = null, lp = null, win = null;
    const sleep = (ms) => new Promise(r => (main || Zotero.getMainWindow()).setTimeout(r, ms));
    const PREFS = ["weavero.enableTabsAndWindows", "weavero.enableTabGroups", "weavero.compactTitleBar", "weavero.compactTitleBarReader"];
    const saved = {};
    const items = {};
    const groups = [];
    const got = {};

    const readerWins = () => {
        const out = [];
        const en = Services.wm.getEnumerator("zotero:reader");
        while (en.hasMoreElements()) out.push(en.getNext());
        return out;
    };
    /** itemID -> group id (or null) of the reader window's tabs: the group the strip
     *  draws it in (_applyTabGroupsReader), so a tab kept out of groups is in none. */
    const readerGroups = (w) => {
        const out = {};
        for (const t of ((w && w._wvWT && w._wvWT.tabs) || [])) {
            if (t.itemID == null) continue;
            out[t.itemID] = t._wvGroupExcluded ? null : (t.wvGroupId || null);
        }
        return out;
    };
    /** itemID -> group id (or null) of the main window's tabs for `ids`. */
    const mainGroups = (ids) => {
        const out = {};
        for (const t of (main.Zotero_Tabs._tabs || [])) {
            const id = t && t.data && t.data.itemID;
            if (id == null || !ids.includes(id)) continue;
            out[id] = (t.data.wvGroupId) || null;
        }
        return out;
    };
    const setPref = (p, v) => { Zotero.Prefs.set(p, v); };

    before(async function () {
        if (wvT.nativeWindows()) this.skip();   // version: needs a Zotero with reader windows
        lp = wvT.plugin();
        if (!lp) wvT.absent("plugin");
        for (const m of ["_wvWTMountTab", "_tabGroupCreate", "_wvReaderStampTabGroup", "_wvWTRenderStrip", "_tabGroupDelete"]) wvT.method(m);
        main = Zotero.getMainWindow();
        for (const p of PREFS) saved[p] = Zotero.Prefs.get(p);
        try {
            setPref("weavero.enableTabsAndWindows", true);
            setPref("weavero.enableTabGroups", true);
            setPref("weavero.compactTitleBar", true);
            setPref("weavero.compactTitleBarReader", true);
            await sleep(1500);
            for (const k of ["A", "B", "C", "D"]) items[k] = await wvT.createTestPDFItem("wv-i70-" + k);
            const before = new Set(readerWins());
            await Zotero.Reader.open(items.A.id, null, { openInWindow: true });
            win = await wvT.waitFor(() => {
                const w = readerWins().find(x => !before.has(x));
                return (w && w._wvWT && w._wvWT.tabs && w._wvWT.tabs.length) ? w : null;
            }, 20000);
            assert.isOk(win, "the reader window opened");
            for (const k of ["B", "C", "D"]) await lp._wvWTMountTab(win, items[k].id, { select: false, await: true });
            await sleep(500);
            const st = win._wvWT;
            const tabOf = (k) => st.tabs.find(t => t.itemID === items[k].id);
            assert.isOk(tabOf("A") && tabOf("A").native, "A is the window's own document");
            const g1 = lp._tabGroupCreate("WV-TEST i70 one", "blue");
            const g2 = lp._tabGroupCreate("WV-TEST i70 two", "green");
            groups.push(g1, g2);
            lp._wvReaderStampTabGroup(win, tabOf("A").id, g1.id);
            lp._wvReaderStampTabGroup(win, tabOf("B").id, g1.id);
            lp._wvReaderStampTabGroup(win, tabOf("C").id, g2.id);
            lp._wvWTRenderStrip(win);
            await sleep(500);
            got.expected = { [items.A.id]: g1.id, [items.B.id]: g1.id, [items.C.id]: g2.id, [items.D.id]: null };
            got.start = readerGroups(win);

            // The option off: the extras go to the main window.
            setPref("weavero.compactTitleBarReader", false);
            const moved = [items.B.id, items.C.id, items.D.id];
            await wvT.waitFor(() => Object.keys(mainGroups(moved)).length === 3, 15000);
            await sleep(2000);
            got.offMain = mainGroups(moved);
            got.offReader = readerGroups(win);
            got.offStrip = !!win.document.querySelector(".wv-window-tabstrip");

            // The option on again: they come back.
            setPref("weavero.compactTitleBarReader", true);
            await wvT.waitFor(() => Object.keys(readerGroups(win)).length === 4, 20000);
            await sleep(2500);
            got.onReader = readerGroups(win);
            got.onMain = mainGroups(moved);
            got.onChips = [...win.document.querySelectorAll(".wv-window-tabstrip .wv-tab-group-chip")].length;
        }
        finally {
            try { if (win && !win.closed) win.close(); } catch (e) {}
            await sleep(800);
            try {
                const ids = Object.values(items).map(i => i.id);
                for (const t of [...(main.Zotero_Tabs._tabs || [])]) {
                    if (t && t.data && ids.includes(t.data.itemID)) { try { main.Zotero_Tabs.close(t.id); } catch (e) {} }
                }
            } catch (e) {}
            for (const g of groups) { try { lp._tabGroupDelete(g.id); } catch (e) {} }
            for (const p of PREFS) {
                if (saved[p] === undefined) { try { Zotero.Prefs.clear(p); } catch (e) {} }
                else Zotero.Prefs.set(p, saved[p]);
            }
            await sleep(1000);
            try { wvT.purgeDeadReaders(); } catch (e) {}
            await wvT.erase(...Object.values(items));
        }
    });

    it("the window starts with its groups", () => {
        assert.deepEqual(got.start, got.expected);
    });

    it("with the title bar shown, the moved tabs are in their groups in the main window", () => {
        assert.isFalse(got.offStrip, "the strip is gone");
        const want = {};
        for (const k of ["B", "C", "D"]) want[items[k].id] = got.expected[items[k].id];
        assert.deepEqual(got.offMain, want);
    });

    it("with the title bar hidden again, every tab is back in its group and the main window keeps no copy", () => {
        assert.deepEqual(got.onReader, got.expected);
        assert.deepEqual(got.onMain, {});
        assert.strictEqual(got.onChips, 2, "one chip per group in the strip");
    });
});
