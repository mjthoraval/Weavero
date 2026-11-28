/* global describe, it, before, after, assert, Zotero, wvT */
// The split view's corner menu (each side's footer "⋯", tab-split.ts
// _wvTabSplitFooterMenu): "Close Tab", between Reverse Tabs and Close Both Tabs, closes
// only THAT side's tab; the other side's tab then shows alone, in the normal view,
// selected (MJT 2026-11-19, plan approved: "I also want to have an option at the bottom
// right to close only this tab in the split view, thus going back to the other tab in
// the split view to normal view"). Not on a side whose tab cannot be closed (a library
// tab Zotero keeps open, a pinned tab -- also one the split took off the pins). With a
// locked tab (tab-split-dock.ts), as Close Both Tabs and Separate Tabs treat the lock:
// closing the locked side ends the lock and the other tab shows alone; closing the
// other side leaves the lock with the locked tab, selected.
describe("Weavero — split view: Close Tab in a side's menu", function () {
    this.timeout(180000);
    let wv, win, doc, ZT, pdf1, pdf2, pdf3, prevSplit, prevFooter;
    const LABELS = ["Separate Tabs", "Reverse Tabs", "Close Tab", "Close Both Tabs"];
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const deck = () => doc.getElementById("tabs-deck");
    // On screen = laid out AND hit at its centre (split-view.spec.js: zotero.css hides
    // every deck child but the selected one "only visually").
    const shown = (id) => {
        const el = doc.getElementById(id);
        if (!el) return null;
        const cs = win.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 40) return null;
        const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return (hit && el.contains(hit)) ? r : null;
    };
    const pairs = () => (win._wvTSplits || []).filter(s => !s.dock);
    const dock = () => win._wvTDock || null;
    const dockSplit = () => (win._wvTSplits || []).find(s => s.dock) || null;
    async function openPDF(att) {
        if (tabOfItem(att)) return tabOfItem(att);
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    /** A tab pinned or unpinned as the tab menu does it (split-dock.spec.js). */
    async function pin(t, on) {
        const zoteroPins = typeof ZT.setPinned === "function";
        if (String(t.type).startsWith("library") && !zoteroPins) wv._wvSetLibraryTabPinned(win, t.id, on);
        else if (on && !zoteroPins) wv._pinTabByCommand(win, Zotero.Items.get(t.data.itemID));
        else wv._wvSetTabPinned(win, t, on);
        try { wv._applyPinnedTabs(win); } catch (er) {}
        await sleep(500);
    }
    /** No pair, no lock, the three PDFs open, the library selected. */
    async function fresh() {
        for (const s of pairs()) wv._wvTabSplitSeparate(win, s.id);
        if (dock()) wv._wvTabDockSet(win, null);
        win._wvSelTabIDs = new Set();
        const out = [];
        for (const it of [pdf1, pdf2, pdf3]) out.push(await openPDF(it));
        ZT.select(libTab().id);
        await sleep(500);
        return out;
    }
    /** The corner menu of side `tabID` of the split on screen, opened by that side's own
     *  "⋯" button: `fn(labels, items)` with its entries, then closed. */
    async function withSideMenu(tabID, fn) {
        const more = await waitFor(() => doc.querySelector('#wv-tsplit-layer .wv-tsplit-footer[data-tab-id="' + tabID + '"] .wv-tsplit-more'), 5000, "the side's menu button");
        more.click();
        const pop = await waitFor(() => { const p = doc.getElementById("wv-tsplit-menu"); return p && (p.state === "open" || p.state === "showing") ? p : null; }, 5000, "the side's menu");
        await sleep(300);
        const items = Array.from(pop.children).filter(x => x.localName === "menuitem" && !x.hidden && win.getComputedStyle(x).display !== "none");
        const labels = items.map(x => x.getAttribute("label") || "");
        try { return await fn(labels, items); }
        finally { try { pop.hidePopup(); } catch (er) {} await sleep(200); }
    }
    /** "Close Tab" from side `tabID`'s menu. An item of an OPEN menu: doCommand()
     *  delivers its command, trusted, once the popup manager has closed the menu
     *  (tests.md, menu entries) -- waited for inside, before the menu is let go. */
    async function closeFromMenu(tabID) {
        await withSideMenu(tabID, async (labels, items) => {
            const mi = items.find(x => x.getAttribute("label") === "Close Tab");
            assert.ok(mi, "Close Tab in the menu of " + tabID + ": " + JSON.stringify(labels));
            mi.doCommand();
            await waitFor(() => !ZT._tabs.some(t => t && t.id === tabID), 5000, "the tab closed");
        });
        await sleep(700);
    }
    /** Tab `id` alone in the window, selected: Zotero's deck, no split. */
    function alone(id, what) {
        assert.strictEqual(ZT.selectedID, id, what + ": selected");
        assert.notOk(deck().hasAttribute("wv-tsplit"), what + ": Zotero's deck, no split");
        assert.ok(shown(id), what + ": shown");
        assert.approximately(doc.getElementById(id).getBoundingClientRect().width, deck().getBoundingClientRect().width, 2, what + ": at the deck's full width");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabSplitCreate", "_wvTabSplitOf", "_wvTabSplitFooterMenu", "_wvTabSplitSeparate", "_wvTabDockSet", "_wvTabDockLib"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        prevFooter = Zotero.Prefs.get("weavero.splitViewFooter");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        Zotero.Prefs.set("weavero.splitViewFooter", true);
        pdf1 = await wvT.createTestPDFItem("wv-closetab-1");
        pdf2 = await wvT.createTestPDFItem("wv-closetab-2");
        pdf3 = await wvT.createTestPDFItem("wv-closetab-3");
        await fresh();
    });

    after(async function () {
        if (!win) return;
        try { for (const s of pairs()) wv._wvTabSplitSeparate(win, s.id); } catch (er) {}
        try { wv._wvTabDockSet(win, null); } catch (er) {}
        for (const it of [pdf1, pdf2, pdf3]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { ZT.select(libTab().id); } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3);
        for (const [k, v] of [["weavero.enableSplitView", prevSplit], ["weavero.splitViewFooter", prevFooter]]) {
            try { if (v === undefined) Zotero.Prefs.clear(k); else Zotero.Prefs.set(k, v); } catch (er) {}
        }
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
    });

    it("two PDFs: each side's menu has Close Tab between Reverse Tabs and Close Both Tabs; it closes that side only, the other shows alone, selected -- from the left side and from the right, selected or not", async function () {
        // The left side's menu, the right side selected.
        let [t1, t2] = await fresh();
        let s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "right" });
        assert.ok(s, "fixture: a pair");
        await sleep(700);
        await withSideMenu(t1.id, async (labels) => {
            assert.deepEqual(labels.filter(l => LABELS.includes(l)), LABELS, "the order: " + JSON.stringify(labels));
        });
        await withSideMenu(t2.id, async (labels) => {
            assert.include(labels, "Close Tab", "the other side's menu too");
        });
        await closeFromMenu(t1.id);
        assert.notOk(tabOfItem(pdf1), "the left side's tab closed");
        assert.ok(tabOfItem(pdf2), "the right side's tab open");
        assert.deepEqual(pairs(), [], "the split gone");
        alone(t2.id, "the right side");
        // The right side's menu, the left side selected.
        [t1, t2] = await fresh();
        s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        await sleep(700);
        assert.strictEqual(ZT.selectedID, t1.id, "fixture: the left side selected");
        await closeFromMenu(t2.id);
        assert.notOk(tabOfItem(pdf2), "the right side's tab closed");
        assert.ok(tabOfItem(pdf1), "the left side's tab open");
        assert.deepEqual(pairs(), [], "the split gone");
        alone(t1.id, "the left side");
        assert.ok(tabOfItem(pdf3), "a tab outside the split untouched");
    });

    it("the library beside a PDF: no Close Tab on the library's side when Zotero keeps it open (pinned, as MJT has it; Zotero 10's fixed one); the PDF's side has it, and the library then shows alone", async function () {
        const L = libTab();
        const libNow = () => ZT._tabs.find(t => t.id === L.id);
        const pinnedAtStart = !!wv._wvTabIsPinned(win, libNow());
        try {
            // Pinned only on a Zotero with its own windows: Zotero 10 has one library tab,
            // fixed first, never pinned and never closed (lib/windows.ts
            // wvIsFixedLibraryTab).
            for (const pinned of (wvT.nativeWindows() ? [true, false] : [false])) {
                const [t1] = await fresh();
                if (!!wv._wvTabIsPinned(win, libNow()) !== pinned) await pin(libNow(), pinned);
                if (pinned) assert.isTrue(!!wv._wvTabIsPinned(win, libNow()), "fixture: the library pinned");
                // Read BEFORE the split: a split takes a pinned side off the pins.
                const keeps = !!wv._wvTabIsPinned(win, libNow())
                    || (typeof ZT.canClose === "function" ? !ZT.canClose(L.id) : true);
                const s = wv._wvTabSplitCreate(win, L.id, t1.id, { select: "right" });
                assert.ok(s, "fixture: the library beside a PDF");
                await sleep(700);
                try {
                    await withSideMenu(L.id, async (labels) => {
                        // A library tab Zotero lets the user close (an unpinned one of a Zotero
                        // with its own windows) is a tab like any other.
                        if (keeps) assert.notInclude(labels, "Close Tab", (pinned ? "pinned" : "unpinned") + ", a library Zotero keeps open: " + JSON.stringify(labels));
                        else assert.include(labels, "Close Tab", "unpinned, a library Zotero lets the user close: " + JSON.stringify(labels));
                        assert.include(labels, "Reverse Tabs", "its other entries stay");
                    });
                    await withSideMenu(t1.id, async (labels) => {
                        assert.include(labels, "Close Tab", "the PDF's side");
                    });
                    await closeFromMenu(t1.id);
                    assert.ok(ZT._tabs.some(t => t && t.id === L.id), "the library tab stays");
                    alone(L.id, "the library" + (pinned ? " (pinned)" : ""));
                    if (pinned) assert.isTrue(!!wv._wvTabIsPinned(win, libNow()), "back among the pins");
                }
                finally {
                    for (const x of pairs()) wv._wvTabSplitSeparate(win, x.id);
                    await sleep(300);
                }
            }
        }
        finally {
            // The library's pin as this spec found it (Zotero 11 may pin it itself).
            const t = libNow();
            if (t && !!wv._wvTabIsPinned(win, t) !== pinnedAtStart) await pin(t, pinnedAtStart);
        }
    });

    it("a pinned PDF as a side (taken off the pins by the split): no Close Tab on its side, as Close Both Tabs leaves it", async function () {
        const [t1, t2] = await fresh();
        await pin(t1, true);
        assert.isTrue(!!wv._wvTabIsPinned(win, ZT._tabs.find(t => t.id === t1.id)), "fixture: PDF 1 pinned");
        const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "right" });
        assert.ok(s, "fixture: a pair with the pinned tab");
        await sleep(700);
        try {
            await withSideMenu(t1.id, async (labels) => {
                assert.notInclude(labels, "Close Tab", "the pinned side: " + JSON.stringify(labels));
            });
            await withSideMenu(t2.id, async (labels) => {
                assert.include(labels, "Close Tab", "the other side");
            });
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id);
            await sleep(300);
            const t = ZT._tabs.find(x => x.id === t1.id);
            if (t && wv._wvTabIsPinned(win, t)) await pin(t, false);
        }
    });

    it("a locked PDF: Close Tab on the locked side ends the lock and the other tab shows alone, selected; on the other side the lock stays, the locked tab selected, beside the tab used before", async function () {
        // The locked side.
        let [t1, t2, t3] = await fresh();
        ZT.select(t2.id); await sleep(300);
        assert.isTrue(wv._wvTabDockSet(win, t1.id), "fixture: PDF 1 locked");
        await sleep(800);
        assert.ok(dockSplit() && [dockSplit().left, dockSplit().right].includes(t2.id), "fixture: PDF 2 beside the locked PDF 1");
        await withSideMenu(t1.id, async (labels) => {
            assert.include(labels, "Close Tab", "the locked side");
            assert.notInclude(labels, "Close Both Tabs", "Close Both Tabs is not on a lock's split (the locked tab stays)");
        });
        await closeFromMenu(t1.id);
        assert.notOk(tabOfItem(pdf1), "the locked tab closed");
        assert.notOk(dock(), "the lock ended");
        alone(t2.id, "the other side");
        // The other side: PDF 3 used, then PDF 2 beside the locked PDF 1.
        [t1, t2, t3] = await fresh();
        ZT.select(t3.id); await sleep(300);
        ZT.select(t2.id); await sleep(300);
        assert.isTrue(wv._wvTabDockSet(win, t1.id), "fixture: PDF 1 locked");
        await sleep(800);
        assert.strictEqual(ZT.selectedID, t2.id, "fixture: PDF 2 selected beside it");
        await closeFromMenu(t2.id);
        assert.notOk(tabOfItem(pdf2), "the other side's tab closed");
        assert.ok(dock() && dock().lib === t1.id, "still locked on PDF 1");
        assert.strictEqual(ZT.selectedID, t1.id, "the locked tab selected");
        await waitFor(() => { const d = dockSplit(); return d && [d.left, d.right].includes(t3.id) && shown(t1.id) && shown(t3.id); }, 5000, "PDF 3, used before, beside the locked tab");
        wv._wvTabDockSet(win, null);
        await sleep(400);
    });

    it("an unknown tab or split: nothing closes", async function () {
        const [t1, t2] = await fresh();
        const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "right" });
        await sleep(700);
        assert.isFalse(!!wv._wvTabSplitCloseSide(win, s.id, "no-such-tab"), "an unknown tab: nothing");
        assert.isFalse(!!wv._wvTabSplitCloseSide(win, "no-such-split", t1.id), "an unknown split: nothing");
        assert.ok(tabOfItem(pdf1) && tabOfItem(pdf2), "both tabs still open");
        wv._wvTabSplitSeparate(win, s.id);
        await sleep(300);
    });
});
