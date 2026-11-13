/* global describe, it, before, after, assert, Zotero, wvT, Services */
// Split view in the tab strip (tab-split.ts). MJT 2026-11-11, with two splits side by side
// ([My Library | Agbaglah] [Lindborg | Kundu]): "It is not clear which are the 2 tabs in
// split view. Check how it is done in Firefox", then, with a screenshot of Firefox's: "Do the
// same". Firefox (tabs.css 1483-1600, tabsplitview.mjs): the two tabs inside ONE rounded
// container as wide as one tab (`max-width: var(--tab-max-width)`), padded
// --split-view-padding-block / --split-view-tab-padding-inline (2px), separated from its
// neighbours by `margin-inline: var(--space-small)` (8px, tokens-shared.css), filled with
// --tab-background-color-hover while it holds the selected tab.
// And: "In split view, the 2 tabs should be next to each other. So you can move the pinned
// tab out of the pinned tabs group. It goes back to its original position after separating
// the split tabs" (Firefox refuses a pinned tab in a split: tabsplitview.mjs addTabs).
describe("Weavero — split view in the tab strip", function () {
    this.timeout(200000);
    let wv, win, doc, ZT, pdf1, pdf2, pdf3, note, prevSplit, ow, oh;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const tabEl = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tabs .tab[data-id="' + id + '"]')).find(x => x.getBoundingClientRect().width > 0) || null;
    const pillOf = (s) => doc.querySelector('#wv-tsplit-pills .wv-tsplit-pill[data-split="' + s.id + '"]');
    const fmt = (r) => r ? "[" + [r.left, r.top, r.width, r.height].map(Math.round).join(",") + "]" : "null";
    const colorOf = (v) => { const d = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); d.style.color = v; doc.documentElement.appendChild(d); const c = win.getComputedStyle(d).color; d.remove(); return c; };
    const zoteroPins = () => typeof ZT.setPinned === "function";
    const pinnedIDs = () => ZT._tabs.filter(t => wv._wvTabIsPinned(win, t)).map(t => t.id);
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(600);
        pdf1 = await wvT.createTestPDFItem("wv-ss-1");
        pdf2 = await wvT.createTestPDFItem("wv-ss-2");
        pdf3 = await wvT.createTestPDFItem("wv-ss-3");
        note = new Zotero.Item("note"); note.setNote("<p>wv split strip note</p>"); await note.saveTx();
        for (const it of [pdf1, pdf2, pdf3]) await openPDF(it);
        await win.ZoteroPane.openNote(note.id, { openInWindow: false });
        await waitFor(() => tabOfItem(note), 15000, "note tab");
        await sleep(500);
    });

    after(async function () {
        if (!win) return;
        try { separateAll(); } catch (er) {}
        try { Services.prefs.clearUserPref("ui.systemUsesDarkTheme"); } catch (er) {}
        try { const L = libTab(); if (L && wv._wvTabIsPinned(win, L)) wv._wvSetTabPinned(win, L, false); } catch (er) {}
        for (const it of [pdf1, pdf2, pdf3, note]) {
            const t = it && tabOfItem(it);
            if (t) { try { if (wv._wvTabIsPinned(win, t)) wv._wvSetTabPinned(win, t, false); } catch (er) {} try { ZT.close(t.id); } catch (er) {} }
        }
        try { wv._applyPinnedTabs(win); } catch (er) {}
        await sleep(300);
        try { ZT.select(libTab().id); } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3, note);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(300);
    });

    // ---- 3. One pill per split ------------------------------------------------------

    it("3. each split's two tabs read as ONE pill, one tab wide, apart from its neighbours and from an adjacent split (light and dark)", async function () {
        separateAll();
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3), tn = tabOfItem(note);
        const sA = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        const sB = wv._wvTabSplitCreate(win, t3.id, tn.id, { select: "none" });
        assert.ok(sA && sB && sB.left === t3.id, "fixture: two splits, the PDF opened first on the left (the strip's order)");
        // Adjacent: [t1|t2][t3|tn].
        const i2 = ZT._tabs.findIndex(t => t.id === t2.id);
        ZT.move(t3.id, i2 + 1); await sleep(300);
        wv._wvTabSplitAdjoin(win, sB); await sleep(600);
        assert.strictEqual(ZT._tabs.findIndex(t => t.id === t3.id), i2 + 1, "fixture: the second split right after the first");
        try {
            for (const [theme, val] of [["light", 0], ["dark", 1]]) {
                try { Services.prefs.setIntPref("ui.systemUsesDarkTheme", Number(val)); } catch (er) {}
                await sleep(900);
                const strip = colorOf("var(--material-tabbar)");
                const pA = pillOf(sA), pB = pillOf(sB);
                assert.ok(pA && pB, theme + ": a pill per split");
                const rA = pA.getBoundingClientRect(), rB = pB.getBoundingClientRect();
                // Drawn: inside the box that clips them (1.0.5-splitpane.3 drew them in a
                // 0px-tall host, every pill clipped away while its geometry was right).
                const hr = doc.getElementById("wv-tsplit-pills").getBoundingClientRect();
                for (const r of [rA, rB]) assert.ok(r.top >= hr.top - 0.5 && r.bottom <= hr.bottom + 0.5 && r.left >= hr.left - 0.5 && r.right <= hr.right + 0.5, theme + ": the pill inside its host's clip " + fmt(r) + " in " + fmt(hr));
                const r1 = tabEl(t1.id).getBoundingClientRect(), r2 = tabEl(t2.id).getBoundingClientRect();
                const rn = tabEl(tn.id).getBoundingClientRect(), r3 = tabEl(t3.id).getBoundingClientRect();
                // One pill around the pair, its tabs inset by Firefox's 2px.
                assert.approximately(rA.left, r1.left - 2, 0.6, theme + ": the pill starts 2px before its left tab " + fmt(rA) + " " + fmt(r1));
                assert.approximately(rA.right, r2.right + 2, 0.6, theme + ": and ends 2px after its right tab " + fmt(rA) + " " + fmt(r2));
                assert.approximately(rA.top, r1.top - 2, 0.6, theme + ": 2px above");
                assert.approximately(rA.bottom, r1.bottom + 2, 0.6, theme + ": 2px below");
                assert.isBelow(r1.right, r2.left + 0.5, theme + ": left tab first (the left side)");
                assert.isAtMost(r2.left - r1.right, 4.5, theme + ": the pair's own tabs 4px apart");
                // As tall as an ordinary tab, as wide as one at most.
                const ordinary = tabEl(libTab().id).getBoundingClientRect();
                assert.approximately(rA.height, ordinary.height, 0.6, theme + ": as tall as an ordinary tab");
                assert.isAtMost(rA.width, 200.5, theme + ": as wide as one tab at most (Firefox: --tab-max-width) " + fmt(rA));
                // Apart: 8px from a neighbour tab, 16px from the adjacent split.
                assert.isAtLeast(rA.left - ordinary.right, 7.5, theme + ": 8px from the tab before it " + fmt(ordinary) + " " + fmt(rA));
                assert.isAtLeast(rB.left - rA.right, 15.5, theme + ": 16px from the adjacent split " + fmt(rA) + " " + fmt(rB));
                assert.ok(rB.left <= r3.left - 1.5 && rB.right >= rn.right + 1.5, theme + ": the second pill around its own pair");
                // The pill holding the selected tab is filled; it differs from the strip.
                const bgA = win.getComputedStyle(pA).backgroundColor;
                assert.notStrictEqual(bgA, "rgba(0, 0, 0, 0)", theme + ": the selected tab's pill is filled");
                assert.notStrictEqual(bgA, strip, theme + ": in a colour of its own");
                assert.strictEqual(win.getComputedStyle(pB).backgroundColor, "rgba(0, 0, 0, 0)", theme + ": the other pill is not (Firefox: only [hasactivetab])");
                // The old per-tab tint and accent edge are gone.
                for (const el of [tabEl(t1.id), tabEl(t2.id)]) assert.notInclude(win.getComputedStyle(el).boxShadow, "inset", theme + ": no per-tab accent edge");
            }
        }
        finally {
            try { Services.prefs.clearUserPref("ui.systemUsesDarkTheme"); } catch (er) {}
            separateAll();
            await sleep(500);
        }
        assert.notOk(doc.querySelector("#wv-tsplit-pills .wv-tsplit-pill"), "separated: no pill");
        const w1 = tabEl(t1.id).getBoundingClientRect().width;
        assert.approximately(w1, tabEl(t3.id).getBoundingClientRect().width, 0.5, "separated: the tabs back to the strip's own widths");
    });

    it("3. a split's pair stays together when one of its tabs moves", async function () {
        separateAll();
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        try {
            await sleep(500);
            ZT.move(t1.id, ZT._tabs.length); await sleep(900);
            const i1 = ZT._tabs.findIndex(t => t.id === t1.id), i2 = ZT._tabs.findIndex(t => t.id === t2.id);
            assert.strictEqual(i2, i1 + 1, "the right side followed its left side: " + ZT._tabs.map(t => t.id).join(","));
            ZT.move(t2.id, 1); await sleep(900);
            const j1 = ZT._tabs.findIndex(t => t.id === t1.id), j2 = ZT._tabs.findIndex(t => t.id === t2.id);
            assert.strictEqual(j2, j1 + 1, "the left side followed its right side");
            const p = pillOf(s).getBoundingClientRect(), r1 = tabEl(t1.id).getBoundingClientRect(), r2 = tabEl(t2.id).getBoundingClientRect();
            assert.ok(p.left <= r1.left - 1.5 && p.right >= r2.right + 1.5, "the pill followed " + fmt(p));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    // ---- 7. A pinned tab leaves the pins while it is a side ---------------------------

    async function pin(t, on) {
        if (String(t.type).startsWith("library") && !zoteroPins()) wv._wvSetLibraryTabPinned(win, t.id, on);
        else if (on && !zoteroPins()) wv._pinTabByCommand(win, Zotero.Items.get(t.data.itemID));
        else wv._wvSetTabPinned(win, t, on);
        try { wv._applyPinnedTabs(win); } catch (er) {}
        await sleep(500);
    }

    it("7. a pinned tab that becomes a side leaves the pins, sits next to its partner in the pill, and goes back to its place among the pins when the split ends (Separate, closing the partner, a disable)", async function () {
        if (!wvT.nativeWindows()) this.skip();   // an older Zotero's library tab is fixed, never pinned
        separateAll();
        const L = libTab(), t3 = tabOfItem(pdf3);
        // Two pins: the PDF first, My Library second (index 1 among the pins).
        await pin(t3, true);
        await pin(L, true);
        const orig = pinnedIDs();
        assert.deepEqual(orig, [t3.id, L.id], "fixture: the pins");
        for (const how of ["separate", "close the partner", "disable"]) {
            let tn = tabOfItem(note);
            if (!tn) { await win.ZoteroPane.openNote(note.id, { openInWindow: false }); tn = await waitFor(() => tabOfItem(note), 15000, "note tab"); }
            ZT.select(L.id); await sleep(300);
            const s = wv._wvTabSplitCreate(win, L.id, tn.id, { select: "right" });
            assert.ok(s, how + ": fixture: the split");
            await sleep(900);
            assert.isFalse(wv._wvTabIsPinned(win, L), how + ": My Library left the pins while it is a side");
            assert.notOk(doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + L.id + '"]'), how + ": no pinned icon for it");
            const iL = ZT._tabs.findIndex(t => t.id === L.id), iN = ZT._tabs.findIndex(t => t.id === tn.id);
            assert.strictEqual(iN, iL + 1, how + ": the two side by side, My Library on the left: " + ZT._tabs.map(t => t.id).join(","));
            const p = pillOf(s), lr = tabEl(L.id), nr = tabEl(tn.id);
            assert.ok(p && lr && nr, how + ": both tabs in the strip, in a pill");
            const pr = p.getBoundingClientRect();
            assert.ok(pr.left <= lr.getBoundingClientRect().left && pr.right >= nr.getBoundingClientRect().right, how + ": one pill around both");
            assert.deepEqual(pinnedIDs(), [t3.id], how + ": the other pin stays");
            if (how === "separate") wv._wvTabSplitSeparate(win, s.id);
            else if (how === "close the partner") ZT.close(tn.id);
            else {
                wv._wvTabSplitUnwireAll();
                await sleep(300);
                assert.deepEqual(pinnedIDs(), orig, "disable: the pins exactly as before the split");
                win._wvTSplits = [];
                wv._wvTabSplitRegisterMenus();
                wv._wvTabSplitWire(win);
            }
            await sleep(900);
            assert.deepEqual(pinnedIDs(), orig, how + ": My Library pinned again, at its place among the pins");
        }
        await pin(L, false);
        await pin(t3, false);
    });

    // ---- 16. A split keeps its two tabs' order -------------------------------------
    // MJT 2026-11-12, the strip [pinned My Library (selected), pinned, pinned, a note,
    // ...] split into [note | My Library]: "Before: Library tab on the left. After:
    // Library tab on the right. Can you keep the order when going to split view?"
    async function withTabMenu(tabID, fn) {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + tabID + '"], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + tabID + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(600);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const items = [];
        for (const p of pops) for (const mi of p.querySelectorAll(":scope > menuitem")) { if (!mi.hidden && win.getComputedStyle(mi).display !== "none") items.push(mi); }
        try { return await fn(items); }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (er) {} } }
    }
    const menuCommand = (label) => async (items) => {
        const mi = items.find(x => x.getAttribute("label") === label);
        assert.ok(mi, "the entry " + label + ": " + items.map(x => x.getAttribute("label")).join(" | "));
        mi.dispatchEvent(new win.Event("command"));
    };

    it("16. MJT's case: a pinned My Library selected and a note after the pins split into [My Library | note], whichever tab the split is made from; it lands just before the note, nothing else moves; the active tab stays active", async function () {
        if (!wvT.nativeWindows()) this.skip();   // an older Zotero's library tab is fixed, never pinned
        separateAll();
        win._wvSelTabIDs = new Set();
        const L = libTab(), t3 = tabOfItem(pdf3);
        let tn = tabOfItem(note);
        if (!tn) { await win.ZoteroPane.openNote(note.id, { openInWindow: false }); tn = await waitFor(() => tabOfItem(note), 15000, "note tab"); }
        // Pins: My Library first, then a PDF (MJT had three pinned library tabs).
        await pin(L, true);
        await pin(t3, true);
        const orig = pinnedIDs();
        try {
            assert.deepEqual(orig.slice(0, 1), [L.id], "fixture: My Library the first pin");
            const ways = [
                ["Open in Split View, the note right-clicked", async () => {
                    ZT.select(L.id); await sleep(300);
                    win._wvSelTabIDs = new Set([L.id, tn.id]);
                    await withTabMenu(tn.id, menuCommand("Open in Split View"));
                }, L.id],
                ["Open in Split View, My Library right-clicked", async () => {
                    ZT.select(L.id); await sleep(300);
                    win._wvSelTabIDs = new Set([L.id, tn.id]);
                    await withTabMenu(L.id, menuCommand("Open in Split View"));
                }, L.id],
                ["Add Split View on the note, My Library picked", async () => {
                    ZT.select(tn.id); await sleep(300);
                    wv._wvTabSplitAddPicker(win, tn.id);
                    const pk = await waitFor(() => doc.querySelector("#wv-tsplit-layer .wv-tsplit-picker"), 5000, "the picker");
                    pk.querySelector('.wv-tsplit-row[data-tab-id="' + L.id + '"]').click();
                }, L.id],
            ];
            for (const [how, make, active] of ways) {
                const others = ZT._tabs.map(t => t.id).filter(id => id !== L.id);
                await make();
                await sleep(900);
                win._wvSelTabIDs = new Set();
                const s = wv._wvTabSplitOf(win, L.id);
                assert.ok(s && s.left === L.id && s.right === tn.id, how + ": My Library on the left, as in the strip: " + JSON.stringify(s));
                assert.strictEqual(ZT.selectedID, active, how + ": the active tab");
                assert.isFalse(wv._wvTabIsPinned(win, L), how + ": My Library left the pins while a side");
                const iL = ZT._tabs.findIndex(t => t.id === L.id), iN = ZT._tabs.findIndex(t => t.id === tn.id);
                assert.strictEqual(iN, iL + 1, how + ": just before the note: " + ZT._tabs.map(t => t.id).join(","));
                assert.deepEqual(ZT._tabs.map(t => t.id).filter(id => id !== L.id), others, how + ": nothing else moved");
                const p = pillOf(s), lr = tabEl(L.id), nr = tabEl(tn.id);
                assert.ok(p && lr && nr && lr.getBoundingClientRect().left < nr.getBoundingClientRect().left, how + ": drawn My Library first in the pill");
                wv._wvTabSplitSeparate(win, s.id); await sleep(700);
                assert.deepEqual(pinnedIDs(), orig, how + ": separated, the pins as before");
            }
        }
        finally {
            separateAll();
            win._wvSelTabIDs = new Set();
            await pin(t3, false);
            await pin(L, false);
        }
    });

    it("7. a split not re-formed after a restart gives its formerly pinned tab its pin back", async function () {
        if (!wvT.nativeWindows()) this.skip();
        separateAll();
        wv._wvTSplitPending = [];
        const L = libTab(), t3 = tabOfItem(pdf3);
        let tn = tabOfItem(note);
        if (!tn) { await win.ZoteroPane.openNote(note.id, { openInWindow: false }); tn = await waitFor(() => tabOfItem(note), 15000, "note tab"); }
        await pin(L, true);
        const orig = pinnedIDs();
        try {
            ZT.select(tn.id); await sleep(300);
            const s = wv._wvTabSplitCreate(win, tn.id, L.id, { select: "left" });
            await sleep(900);
            assert.isFalse(wv._wvTabIsPinned(win, L), "unpinned while a side");
            const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
            assert.ok(rec.some(r => r.pin), "the record keeps the pin it took: " + JSON.stringify(rec));
            // A restart where the split cannot come back (its partner gone), past the wait.
            win._wvTSplits = [];
            wv._wvTabSplitSync(win);
            ZT.close(tn.id); await sleep(400);
            wv._wvTSplitPending = null;
            wv._wvTabSplitRestore(win);
            assert.isFalse(wv._wvTabIsPinned(win, L), "still waiting for its split");
            wv._wvTSplitPendingUntil = Date.now() - 1;
            wv._wvTabSplitPending();
            await sleep(600);
            assert.deepEqual(pinnedIDs(), orig, "its pin back once its split cannot come back");
            void s;
        }
        finally {
            separateAll();
            await pin(L, false);
            void t3;
        }
    });

    it("7. Zotero's own pin (where Zotero pins tabs): left while a side, given back after", async function () {
        if (!zoteroPins()) this.skip();
        separateAll();
        const t3 = tabOfItem(pdf3), t1 = tabOfItem(pdf1);
        ZT.setPinned(t3.id, true); ZT.setPinned(t1.id, true); await sleep(400);
        const orig = ZT._tabs.filter(t => t.pinned).map(t => t.id);
        let tn = tabOfItem(note);
        if (!tn) { await win.ZoteroPane.openNote(note.id, { openInWindow: false }); tn = await waitFor(() => tabOfItem(note), 15000, "note tab"); }
        try {
            const s = wv._wvTabSplitCreate(win, t3.id, tn.id, { select: "right" });
            await sleep(900);
            assert.isFalse(!!ZT._tabs.find(t => t.id === t3.id).pinned, "Zotero's pin lifted while a side");
            assert.strictEqual(ZT._tabs.findIndex(t => t.id === tn.id), ZT._tabs.findIndex(t => t.id === t3.id) + 1, "side by side");
            wv._wvTabSplitSeparate(win, s.id); await sleep(700);
            assert.deepEqual(ZT._tabs.filter(t => t.pinned).map(t => t.id), orig, "Zotero's pins as before, in their order");
        }
        finally { try { ZT.setPinned(t3.id, false); ZT.setPinned(t1.id, false); } catch (er) {} }
    });
});
