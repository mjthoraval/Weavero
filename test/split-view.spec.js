/* global describe, it, before, after, assert, Zotero, wvT, Services */
// Split view: two tabs of a main window side by side (tab-split.ts; MJT
// 2026-11-10, forum 132980). Firefox's model (two real tabs, a pair in the tab
// bar, "Open in Split View" / "Add Split View" / "Separate Split View" /
// "Reverse Tabs", Open Link in Split View: current tab left, link right and
// selected) on Zotero's deck. MJT's picks: a pinned My Library may be a side (out
// of the pins while it is one, since 2026-11-11); the split survives a restart.
describe("Weavero — split view: two tabs side by side", function () {
    this.timeout(150000);
    let wv, win, doc, ZT, pdf1, pdf2, note, prevSplit;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const deck = () => doc.getElementById("tabs-deck");
    // On screen = laid out AND hit at its centre: zotero.css hides every deck child
    // but the selected one with -moz-subtree-hidden-only-visually, which leaves its
    // visibility and its box as they were (1.0.5-dev.1: an empty right side that a
    // visibility-and-width check called shown).
    const shown = (id) => {
        const el = doc.getElementById(id);
        if (!el) return null;
        const cs = win.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 40) return null;
        const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return (hit && el.contains(hit)) ? r : null;
    };
    const splitOf = (id) => wv._wvTabSplitOf(win, id);
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    async function withTabMenu(tabID, fn) {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + tabID + '"], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + tabID + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(600);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const items = [];
        for (const p of pops) for (const mi of p.querySelectorAll(":scope > menuitem")) {
            if (mi.hidden || win.getComputedStyle(mi).display === "none") continue;
            items.push(mi);
        }
        try { return await fn(items); }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (er) {} } }
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabSplitCreate", "_wvTabSplitOf", "_wvTabSplitSync", "_wvTabSplitOpenItem", "_wvTabSplitOpenLink",
            "_wvTabSplitItemsMenu", "_wvTabSplitAddPicker", "_wvTabSplitReverse", "_wvTabSplitSeparate", "_wvTabSplitRestore", "_wvTabSplitVisible"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        pdf1 = await wvT.createTestPDFItem("wv-split-1");
        pdf2 = await wvT.createTestPDFItem("wv-split-2");
        note = new Zotero.Item("note"); note.setNote("<p>wv split note</p>"); await note.saveTx();
        try { ZT.select(libTab().id); } catch (er) {}
        await sleep(400);
    });

    after(async function () {
        if (!win) return;
        try { separateAll(); } catch (er) {}
        try { win._wvSelTabIDs = new Set(); } catch (er) {}
        try { const L = libTab(); if (L && wvT.lib().wvLibraryTabPinned(L)) wv._wvSetLibraryTabPinned(win, L.id, false); } catch (er) {}
        for (const it of [pdf1, pdf2, note]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { ZT.select(libTab().id); } catch (er) {}
        await wvT.erase(pdf1, pdf2, note);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
    });

    it("Open PDF in Split View, after Zotero's Open PDF in New Window: the library and the PDF side by side, the PDF selected", async function () {
        const L = libTab();
        ZT.select(L.id); await sleep(300);
        const popup = doc.createXULElement("menupopup");
        const z = doc.createXULElement("menuitem");
        z.setAttribute("data-l10n-id", "item-menu-viewAttachment");
        z.setAttribute("data-l10n-args", JSON.stringify({ attachmentType: "pdf", numAttachments: 1, openIn: "window" }));
        popup.appendChild(z);
        popup.appendChild(doc.createXULElement("menuseparator"));
        doc.documentElement.appendChild(popup);
        try {
            wv._wvTabSplitItemsMenu(doc, popup, [pdf1], win);
            await sleep(100);
            const mi = doc.getElementById("wv-itemmenu-split");
            assert.ok(mi, "the entry");
            assert.strictEqual(mi.getAttribute("label"), "Open PDF in Split View");
            assert.strictEqual(z.nextSibling, mi, "right after Zotero's Open PDF in New Window");
            mi.dispatchEvent(new win.Event("command"));
        }
        finally { popup.remove(); }
        const t = await waitFor(() => tabOfItem(pdf1), 20000, "the PDF tab");
        await waitFor(() => splitOf(L.id), 10000, "the split");
        const s = splitOf(L.id);
        assert.strictEqual(s.left, L.id, "the library on the left");
        assert.strictEqual(s.right, t.id, "the PDF on the right");
        assert.strictEqual(ZT.selectedID, t.id, "the PDF selected");
        await sleep(400);
        assert.ok(deck().hasAttribute("wv-tsplit"), "the deck split");
        const rl = shown(L.id), rr = shown(t.id);
        assert.ok(rl && rr, "both shown");
        assert.isBelow(rl.left, rr.left, "library left of the PDF");
        assert.approximately(rl.width / (rl.width + rr.width), 0.5, 0.15, "about half each");
        assert.ok(doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"][data-wv-tsplit="right"]'), "the PDF's tab drawn as the pair's right side");
    });

    it("the library side selected: the PDF keeps drawing, stays loaded, and the item pane stays for it", async function () {
        const L = libTab(), t = tabOfItem(pdf1);
        ZT.select(L.id);
        await sleep(800);
        assert.ok(shown(L.id) && shown(t.id), "still side by side");
        const r = Zotero.Reader.getByTabID(t.id);
        assert.ok(r && r._iframe && r._iframe.docShellIsActive, "the PDF's reader stays active (Zotero would release its pages)");
        assert.isFalse(ZT.canUnload(t.id), "Zotero won't unload the side on screen");
        const pane = doc.getElementById("zotero-context-pane");
        const sp = doc.getElementById("zotero-context-splitter");
        // The PDF side's own item pane (a reader side starts closed, item 14): opened
        // for the PDF, it stays open with the library selected; closed again after
        // (in this narrow window it covers the PDF card's centre, which `shown` hits).
        ZT.select(t.id); await sleep(500);
        const wasClosed = win.ZoteroContextPane.collapsed;
        if (wasClosed) { win.ZoteroContextPane.togglePane(); await sleep(500); }
        ZT.select(L.id); await sleep(800);
        assert.notOk(pane.hasAttribute("collapsed"), "the item pane stays open for the PDF (MJT: follows the PDF)");
        assert.notOk(sp && sp.hasAttribute("hidden"), "its splitter shown");
        if (wasClosed) {
            ZT.select(t.id); await sleep(400);
            win.ZoteroContextPane.togglePane(); await sleep(400);
            ZT.select(L.id); await sleep(500);
        }
    });

    it("a tab outside the split shows alone; back on a side, both again", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const t2 = await openPDF(pdf2);
        ZT.select(t2.id);
        await sleep(500);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "no split on screen");
        assert.ok(shown(t2.id) && !shown(L.id), "the other tab alone");
        ZT.select(t1.id);
        await sleep(500);
        assert.ok(deck().hasAttribute("wv-tsplit") && shown(L.id) && shown(t1.id), "the split again");
    });

    it("Reverse Tabs swaps the sides; Separate Split View ends the split", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = splitOf(t1.id);
        wv._wvTabSplitReverse(win, s.id);
        await sleep(400);
        assert.strictEqual(splitOf(t1.id).left, t1.id, "the PDF on the left now");
        assert.isBelow(shown(t1.id).left, shown(L.id).left, "drawn so");
        wv._wvTabSplitSeparate(win, splitOf(t1.id).id);
        await sleep(400);
        assert.notOk(splitOf(t1.id), "no split");
        assert.notOk(deck().hasAttribute("wv-tsplit"), "Zotero's deck again");
        assert.notOk(doc.querySelector("[data-wv-tsplit]"), "no pair in the tab bar");
    });

    // MJT 2026-11-12: "Can you keep the order when going to split view?" -- the tab
    // further left in the strip is the left side, whichever tab is right-clicked, and
    // the active tab stays active (Firefox moveTabsToSplitView keeps the selection; it
    // puts the selected tab first, tab-context-menu.js -- MJT's order wins).
    it("the split entries carry their words even when the window's Fluent does not give them (its observing paused)", async function () {
        // Two full runs (2026-11-12/13) showed "Open in Split View" BLANK 600 ms
        // after the menu opened: MenuManager leaves an entry's text to the
        // document's Fluent. The entry now writes its words itself at showing.
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        ZT.select(t2.id); await sleep(300);
        win._wvSelTabIDs = new Set([t1.id, t2.id]);
        doc.l10n.pauseObserving();
        try {
            await withTabMenu(t2.id, async (items) => {
                const mi = items.find(x => x.getAttribute("data-wv-key") === "splitOpen");
                assert.ok(mi, "the entry is shown: " + items.map(x => x.getAttribute("data-wv-key") || x.getAttribute("label")).join(" | "));
                assert.strictEqual(mi.getAttribute("label"), "Open in Split View", "its words, without the document's Fluent");
            });
        }
        finally {
            win._wvSelTabIDs = new Set();
            doc.l10n.resumeObserving();
            await sleep(300);
        }
    });

    it("Open in Split View on two selected tabs: the tab further left on the left, the right one right-clicked; the active tab stays active", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        assert.isBelow(ZT._tabs.findIndex(t => t.id === t1.id), ZT._tabs.findIndex(t => t.id === t2.id), "fixture: the first PDF further left");
        ZT.select(t2.id); await sleep(300);
        win._wvSelTabIDs = new Set([t1.id, t2.id]);
        const label = await withTabMenu(t2.id, async (items) => {
            const mi = items.find(x => x.getAttribute("label") === "Open in Split View");
            assert.ok(mi, "the entry: " + items.map(x => x.getAttribute("label")).join(" | "));
            assert.notOk(items.some(x => x.getAttribute("label") === "Add Split View"), "not Add Split View on two tabs");
            mi.dispatchEvent(new win.Event("command"));
            return mi.getAttribute("label");
        });
        win._wvSelTabIDs = new Set();
        await sleep(500);
        assert.strictEqual(label, "Open in Split View");
        const s = splitOf(t1.id);
        assert.ok(s && s.left === t1.id && s.right === t2.id, "the pair in the strip's order: " + JSON.stringify(s));
        assert.strictEqual(ZT.selectedID, t2.id, "the active tab still active");
        ZT.select(t1.id); await sleep(300);
        assert.ok(shown(t1.id) && shown(t2.id), "both PDFs shown");
        const r2 = Zotero.Reader.getByTabID(t2.id);
        assert.ok(r2 && r2._iframe.docShellIsActive, "the other PDF keeps drawing");
        // The tab menu of a split's side.
        await withTabMenu(t1.id, async (items) => {
            const labels = items.map(x => x.getAttribute("label"));
            assert.include(labels, "Separate Split View");
            assert.include(labels, "Reverse Tabs");
            assert.notInclude(labels, "Add Split View");
        });
    });

    it("closing a side ends the split; the other tab stays", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        ZT.close(t2.id);
        await sleep(600);
        assert.notOk(splitOf(t1.id), "no split");
        assert.ok(tabOfItem(pdf1), "the other tab stays");
        assert.notOk(deck().hasAttribute("wv-tsplit"));
    });

    it("Add Split View: a picker of the open tabs beside the tab; a pick makes the split, Escape cancels", async function () {
        const t1 = tabOfItem(pdf1);
        const t2 = await openPDF(pdf2);
        ZT.select(t1.id); await sleep(300);
        await withTabMenu(t1.id, async (items) => {
            const mi = items.find(x => x.getAttribute("label") === "Add Split View");
            assert.ok(mi, "the entry on one tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        const pk = await waitFor(() => doc.querySelector("#wv-tsplit-layer .wv-tsplit-picker"), 5000, "the picker");
        const rows = Array.from(pk.querySelectorAll(".wv-tsplit-row"));
        const ids = rows.map(r => r.getAttribute("data-tab-id"));
        assert.include(ids, t2.id, "the other PDF listed");
        assert.include(ids, libTab().id, "My Library listed");
        assert.notInclude(ids, t1.id, "not the tab itself");
        pk.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await sleep(300);
        assert.notOk(splitOf(t1.id), "cancelled");
        wv._wvTabSplitAddPicker(win, t1.id);
        const pk2 = await waitFor(() => doc.querySelector("#wv-tsplit-layer .wv-tsplit-picker"), 5000, "the picker again");
        pk2.querySelector('.wv-tsplit-row[data-tab-id="' + t2.id + '"]').click();
        await sleep(500);
        const s = splitOf(t1.id);
        assert.ok(s && s.left === t1.id && s.right === t2.id && !s.picker, "the split: " + JSON.stringify(s));
        assert.ok(shown(t1.id) && shown(t2.id));
        wv._wvTabSplitSeparate(win, s.id);
        await sleep(300);
        // A pick further left in the strip: the strip's order too (item 16); the
        // picked tab selected, as Firefox's (tabsplitview.mjs replaceTab).
        ZT.select(t2.id); await sleep(300);
        wv._wvTabSplitAddPicker(win, t2.id);
        const pk3 = await waitFor(() => doc.querySelector("#wv-tsplit-layer .wv-tsplit-picker"), 5000, "the picker on the right PDF");
        pk3.querySelector('.wv-tsplit-row[data-tab-id="' + t1.id + '"]').click();
        await sleep(500);
        const s2 = splitOf(t1.id);
        try {
            assert.ok(s2 && s2.left === t1.id && s2.right === t2.id, "a pick further left: on the left: " + JSON.stringify(s2));
            assert.strictEqual(ZT.selectedID, t1.id, "the picked tab selected");
        }
        finally { separateAll(); }
    });

    it("Open Link in Split View from a note: the linked PDF beside the note, selected", async function () {
        await win.ZoteroPane.openNote(note.id, { openInWindow: false });
        const nt = await waitFor(() => tabOfItem(note), 15000, "the note tab");
        ZT.select(nt.id); await sleep(400);
        const url = "zotero://open-pdf/library/items/" + pdf2.key;
        assert.isTrue(wv._wvTabSplitLinkOK(win, url), "offered for a zotero:// PDF link");
        assert.isFalse(wv._wvTabSplitLinkOK(win, "https://example.com/"), "not for a web link");
        // The PDF already open further left than the note: the strip's order (item 16).
        const t2 = await openPDF(pdf2);
        ZT.select(nt.id); await sleep(300);
        if (ZT._tabs.findIndex(t => t.id === t2.id) > ZT._tabs.findIndex(t => t.id === nt.id)) { ZT.move(t2.id, ZT._tabs.findIndex(t => t.id === nt.id)); await sleep(300); }
        await wv._wvTabSplitOpenLink(win, url);
        await sleep(500);
        const s = splitOf(nt.id);
        assert.ok(s && s.left === t2.id && s.right === nt.id, "the PDF further left: on the left, the note right: " + JSON.stringify(s));
        assert.strictEqual(ZT.selectedID, tabOfItem(pdf2).id, "the PDF selected");
        wv._wvTabSplitSeparate(win, s.id);
    });

    // MJT 2026-11-11 replaced his first pick ("a pinned My Library may be a side, and
    // stays pinned"): "the 2 tabs should be next to each other. So you can move the
    // pinned tab out of the pinned tabs group. It goes back to its original position
    // after separating" (split-strip.spec.js holds the rest).
    it("a pinned My Library may be a side: it leaves the pins while it is one, and is pinned again after", async function () {
        if (!wvT.nativeWindows()) this.skip();   // an older Zotero's library tab is fixed, never pinned
        const L = libTab();
        wv._wvSetLibraryTabPinned(win, L.id, true);
        await sleep(400);
        assert.ok(wvT.lib().wvLibraryTabPinned(L), "fixture: My Library pinned");
        ZT.select(L.id); await sleep(300);
        await wv._wvTabSplitOpenItem(win, pdf1);
        await sleep(600);
        const s = splitOf(L.id);
        assert.ok(s && s.right === tabOfItem(pdf1).id, "split with the pinned My Library: " + JSON.stringify(s));
        assert.notOk(wvT.lib().wvLibraryTabPinned(L), "out of the pins while a side");
        assert.ok(shown(L.id) && shown(tabOfItem(pdf1).id), "both shown");
        wv._wvTabSplitSeparate(win, s.id);
        await sleep(300);
        assert.ok(wvT.lib().wvLibraryTabPinned(L), "pinned again after the split");
        wv._wvSetLibraryTabPinned(win, L.id, false);
        await sleep(300);
    });

    it("a split comes back after a restart (its record re-forms it once both tabs are open)", async function () {
        const L = libTab();
        ZT.select(L.id); await sleep(200);
        await wv._wvTabSplitOpenItem(win, pdf1);
        await sleep(400);
        const before = splitOf(L.id);
        assert.ok(before, "fixture split");
        const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
        assert.ok(rec.some(r => r.l === "lib" && /^reader:\d+\/[A-Z0-9]+$/.test(r.r)), "recorded by what each side shows: " + JSON.stringify(rec));
        // What a restart leaves: the tabs back, no split in memory.
        win._wvTSplits = [];
        wv._wvTabSplitSync(win);
        assert.notOk(splitOf(L.id));
        Zotero.Prefs.set("weavero.tabSplits", JSON.stringify(rec));
        wv._wvTSplitPending = null;   // what a start reads: the pref
        wv._wvTabSplitRestore(win);
        await sleep(400);
        const after = splitOf(L.id);
        assert.ok(after && after.right === tabOfItem(pdf1).id, "re-formed: " + JSON.stringify(after));
    });

    // Restart protocol on 11.0-beta.4, 2026-11-11: a second window's split (its
    // library tab | a copy of an item) was re-formed in the FIRST window, which also
    // held a library tab and a copy of that item: the copy moved and left its tab
    // group, and the next restart moved the split back. A record now carries its
    // window's tabs and goes back into that window only.
    it("a recorded split goes back into its own window, not another one holding both of its sides", async function () {
        if (!tabOfItem(pdf1)) await openPDF(pdf1);
        // As on that run, the first window holds more than the two sides (there 26
        // tabs, here one more): two windows with exactly the same tabs cannot be
        // told apart, the first back takes the split.
        let extra = null;
        if (!tabOfItem(pdf2)) {
            ZT.add({ type: "reader-unloaded", title: "wv-split-2", data: { itemID: pdf2.id }, select: false });
            extra = tabOfItem(pdf2);
        }
        const W2 = await wvT.openMainWindow();
        assert.ok(W2, "fixture: a second main window");
        try {
            const Z2 = W2.Zotero_Tabs;
            Z2.add({ type: "reader-unloaded", title: "wv-split-1", data: { itemID: pdf1.id }, select: false });
            await sleep(300);
            const L2 = Z2._tabs.find(t => String(t.type).startsWith("library"));
            const P2 = Z2._tabs.find(t => t.data && t.data.itemID === pdf1.id);
            assert.ok(L2 && P2, "fixture: the second window holds a library tab and a copy of the PDF");
            assert.ok(libTab() && tabOfItem(pdf1), "fixture: so does the first");
            // Only the second window's split recorded (the restart test left one here).
            separateAll();
            wv._wvTSplitPending = [];
            assert.ok(wv._wvTabSplitCreate(W2, L2.id, P2.id, { select: "none" }), "fixture: the split, in the second window");
            const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
            assert.lengthOf(rec, 1, "one record: " + JSON.stringify(rec));
            const mine = rec[0];
            assert.ok(mine.l === "lib" && Array.isArray(mine.w) && mine.w.length === W2.Zotero_Tabs._tabs.length, "recorded with its window's tabs: " + JSON.stringify(mine));
            // What a restart leaves: the tabs back, no split in memory, the record pending.
            W2._wvTSplits = [];
            wv._wvTabSplitSync(win); wv._wvTabSplitSync(W2);
            Zotero.Prefs.set("weavero.tabSplits", JSON.stringify([mine]));
            wv._wvTSplitPending = null;
            // The first window comes back first, as Zotero reopened them on that run.
            wv._wvTabSplitRestore(win);
            assert.notOk(splitOf(libTab().id) || splitOf(tabOfItem(pdf1).id), "not formed in the first window: " + JSON.stringify(win._wvTSplits));
            // Not even when its own window is not back yet: what this window holds
            // is not the recorded window.
            const W2Tabs = W2.Zotero_Tabs._tabs;
            W2.Zotero_Tabs._tabs = [];
            try { wv._wvTabSplitRestore(win); }
            finally { W2.Zotero_Tabs._tabs = W2Tabs; }
            assert.notOk(splitOf(libTab().id) || splitOf(tabOfItem(pdf1).id), "not formed in the first window while the second holds nothing");
            wv._wvTabSplitRestore(W2);
            const s = wv._wvTabSplitOf(W2, P2.id);
            assert.ok(s && s.left === L2.id && s.right === P2.id, "formed in its own window: " + JSON.stringify(s));
            // A session saved before the fix: its window record gives the fingerprint.
            assert.deepEqual(wv._wvTabSplitFingerprintOfRecord({ tabs: [{ type: "reader", libraryID: 1, itemKey: "ABCD1234" }, { type: "note-unloaded", libraryID: 2, itemKey: "EFGH5678" }] }),
                ["lib", "note:2/EFGH5678", "reader:1/ABCD1234"]);
        }
        finally {
            try { for (const s of (W2._wvTSplits || []).slice()) wv._wvTabSplitSeparate(W2, s.id); } catch (er) {}
            try { W2.close(); } catch (er) {}
            await waitFor(() => W2.closed, 10000, "the second window closed");
            if (extra) { try { ZT.close(extra.id); } catch (er) {} }
            wv._wvTSplitPending = [];
            // The next test starts from the split the restart test left in this window.
            try { if (!splitOf(libTab().id) && tabOfItem(pdf1)) wv._wvTabSplitCreate(win, libTab().id, tabOfItem(pdf1).id, { select: "none" }); } catch (er) {}
            try { win.focus(); } catch (er) {}
        }
    });

    it("the setting off shows Zotero's deck; back on, the split again", async function () {
        const t1 = tabOfItem(pdf1);
        ZT.select(t1.id); await sleep(300);
        assert.ok(deck().hasAttribute("wv-tsplit"), "fixture: split on screen");
        Zotero.Prefs.set("weavero.enableSplitView", false);
        await sleep(400);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "off: Zotero's deck");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        await sleep(400);
        assert.ok(deck().hasAttribute("wv-tsplit"), "on again: the split");
        separateAll();
    });

    // weavero-dev 2026-11-11 (l10n.5 -> l10n.6, l10n.6 -> l10n.8): an upgrade kept the
    // window's live split, and the new instance's first read of the pref took that
    // split's own record as still waiting for its window. Nothing could re-form it (its
    // tabs are in the live split), so for 90 s every persist wrote it twice; a restart in
    // that time re-formed both records, and in a window holding a second library tab and
    // a second tab of the PDF the copy made a split nobody had made.
    it("a reload keeps one record per split on screen, and a restart after it re-forms only that split", async function () {
        separateAll();
        wv._wvTSplitPending = [];
        const L = libTab(), t1 = await ensureTab(pdf1);
        // Spare copies of both sides, as a window may hold (a second library tab on a
        // Zotero with its own windows, a second tab of the PDF).
        const L2 = secondLibTab();
        ZT.add({ type: "reader-unloaded", title: "wv-split-1 copy", data: { itemID: pdf1.id }, select: false });
        await sleep(300);
        const copy = ZT._tabs.find(t => t.data && t.data.itemID === pdf1.id && t.id !== t1.id);
        try {
            ZT.select(L.id); await sleep(300);
            const s = wv._wvTabSplitCreate(win, L.id, t1.id, { select: "none" });
            assert.ok(s, "fixture: the split");
            let rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
            assert.lengthOf(rec, 1, "fixture: one record " + JSON.stringify(rec));
            // What a reload or an upgrade leaves: the window keeps its live split, and the
            // new instance reads the pref at its first look (the wiring's restore pass).
            wv._wvTSplitPending = null;
            wv._wvTabSplitRestore(win);
            assert.lengthOf(wv._wvTabSplitPending(), 0, "nothing waits: the recorded split is on screen");
            wv._wvTabSplitPersist();
            rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
            assert.lengthOf(rec, 1, "one record per live split after the next persist: " + JSON.stringify(rec));
            assert.strictEqual(splitOf(L.id) && splitOf(L.id).id, s.id, "the live split untouched");
            // A restart now: the tabs back, no split in memory, the pref read again.
            win._wvTSplits = [];
            wv._wvTabSplitSync(win);
            wv._wvTSplitPending = null;
            wv._wvTabSplitRestore(win);
            const made = (win._wvTSplits || []).filter(x => !x.picker && x.right);
            assert.lengthOf(made, 1, "one split re-formed, not one per record: " + JSON.stringify(made));
        }
        finally {
            separateAll();
            wv._wvTSplitPending = [];
            if (copy) { try { ZT.close(copy.id); } catch (er) {} }
            if (L2) { try { ZT.close(L2.id); } catch (er) {} }
            await sleep(300);
        }
    });

    // ---- MJT 2026-11-11 on 11.0-beta.4: Firefox's cards, a library side's whole
    // view, the splitter, the tab menu's split entries ----------------------------

    /** A colour as the engine computes it (a theme variable resolved here). */
    const colorOf = (v) => { const d = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); d.style.color = v; doc.documentElement.appendChild(d); const c = win.getComputedStyle(d).color; d.remove(); return c; };
    const rectOf = (id) => doc.getElementById(id).getBoundingClientRect();
    // A Zotero with its own windows: the tab's library-view; an older one: #zotero-pane itself.
    const libView = (id) => doc.getElementById(id).querySelector("library-view") || doc.getElementById(id);
    /** The window at MJT's size (1920 wide) for a test; given back after. */
    async function atSize(w, h, fn) {
        const ow = win.outerWidth, oh = win.outerHeight;
        try { win.resizeTo(w, h); } catch (er) {}
        await sleep(700);
        try { return await fn(); }
        finally { try { win.resizeTo(ow, oh); } catch (er) {} await sleep(400); }
    }
    async function ensureTab(it) {
        if (tabOfItem(it)) return tabOfItem(it);
        if (it.isNote()) { await win.ZoteroPane.openNote(it.id, { openInWindow: false }); return waitFor(() => tabOfItem(it), 15000, "note tab"); }
        return openPDF(it);
    }
    /** A second library tab on a Zotero with its own windows, else null. */
    function secondLibTab() {
        if (!wvT.nativeWindows() || typeof ZT.addLibraryTab !== "function") return null;
        const have = ZT._tabs.filter(t => String(t.type).startsWith("library"));
        if (have.length >= 2) return have[1];
        ZT.addLibraryTab({ select: false });
        return ZT._tabs.filter(t => String(t.type).startsWith("library"))[1] || null;
    }

    it("each side is a card, as in Firefox: 4px margins, a 7px gap, a rounded border, the selected side ringed in the accent", async function () {
        separateAll();
        const L = libTab(), t1 = await ensureTab(pdf1);
        ZT.select(L.id); await sleep(300);
        const s = wv._wvTabSplitCreate(win, L.id, t1.id, { select: "right" });
        await sleep(900);
        try {
            const dr = deck().getBoundingClientRect(), lr = rectOf(L.id), rr = rectOf(t1.id);
            // content-area.css: .split-view-panel-active margin var(--space-xsmall);
            // the splitter 4px wide, margin-inline 1px, 2px on the selected side.
            assert.approximately(lr.left - dr.left, 4, 0.6, "the left card 4px from the start");
            assert.approximately(lr.top - dr.top, 4, 0.6, "4px below the tab bar");
            assert.approximately(dr.bottom - lr.bottom, 4, 0.6, "4px above the bottom");
            assert.approximately(dr.right - rr.right, 4, 0.6, "the right card 4px from the end");
            assert.approximately(rr.left - lr.right, 7, 0.6, "a 7px gap between the cards");
            const divider = colorOf("var(--color-panedivider)"), accent = colorOf("var(--color-accent)");
            const csL = win.getComputedStyle(doc.getElementById(L.id)), csR = win.getComputedStyle(doc.getElementById(t1.id));
            assert.strictEqual(csL.borderTopWidth, "1px", "a 1px border");
            assert.strictEqual(csL.borderTopLeftRadius, "8px", "rounded corners");
            assert.strictEqual(csL.borderTopColor, divider, "the side not selected: Zotero's pane divider colour");
            assert.strictEqual(csL.overflowX, "clip", "a side never scrolls (clip, not hidden)");
            assert.strictEqual(csR.borderTopColor, accent, "the selected side: the accent");
            assert.strictEqual(csR.outlineStyle + " " + csR.outlineWidth + " " + csR.outlineColor, "solid 1px " + accent, "plus a 1px ring outside the border");
            assert.isAtMost(rr.right + 1, dr.right, "the ring stays inside the content area, never cut by the window's edge");
            ZT.select(L.id); await sleep(600);
            assert.strictEqual(win.getComputedStyle(doc.getElementById(L.id)).borderTopColor, accent, "the ring follows the selected side");
            assert.strictEqual(win.getComputedStyle(doc.getElementById(t1.id)).borderTopColor, divider);
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    it("a library side keeps its whole view: both side navigations show, each collapsing its own item pane; the Tag Selector keeps its padding", async function () {
        separateAll();
        const L = libTab();
        const L2 = secondLibTab();
        const other = L2 || await ensureTab(pdf1);   // an older Zotero has one library tab
        const tagged = new Zotero.Item("book"); tagged.setField("title", "wv split tag padding"); tagged.addTag("AAA-wv-split"); await tagged.saveTx();
        try {
            await atSize(1920, 1040, async () => {
                // The Tag Selector's first tag, from the side's left edge, alone first.
                ZT.select(L.id); await sleep(900);
                const tagOff = (id) => { const p = doc.getElementById(id), t = p && p.querySelector(".tag-selector-item"); return t ? Math.round(t.getBoundingClientRect().left - p.getBoundingClientRect().left) : null; };
                const alone = tagOff(L.id);
                const s = wv._wvTabSplitCreate(win, L.id, other.id, { select: "right" });
                await sleep(1200);
                try {
                    const libs = [L.id].concat(L2 ? [L2.id] : []);
                    for (const sel of [other.id, L.id]) {
                        ZT.select(sel); await sleep(1200);
                        for (const id of libs) {
                            const pr = rectOf(id);
                            const sn = libView(id).querySelector(".zotero-view-item-sidenav");
                            const r = sn.getBoundingClientRect();
                            assert.isAbove(r.width, 30, "side " + id + " (" + sel + " selected): a side navigation");
                            assert.isAtMost(r.right, pr.right + 0.5, "side " + id + " (" + sel + " selected): its side navigation inside the card, not cut off (" + Math.round(r.right) + " > " + Math.round(pr.right) + ")");
                            const p = doc.getElementById(id);
                            p.scrollLeft = 40;
                            assert.strictEqual(p.scrollLeft, 0, "side " + id + ": a focus pass cannot scroll the card");
                        }
                        if (alone != null) assert.approximately(tagOff(L.id), alone + 1, 1, "the first tag as far in as alone, plus the card's border (" + alone + ")");
                    }
                    if (L2) {
                        // The left side's toggle collapses the left item pane, and only it.
                        const ipL = libView(L.id).querySelector("item-pane"), ipR = libView(L2.id).querySelector("item-pane");
                        const btn = libView(L.id).querySelector('.zotero-view-item-sidenav [data-action="toggle-pane"]');
                        assert.ok(btn && btn.getBoundingClientRect().width > 0, "the left side's collapse button is on screen");
                        const wasL = !!ipL.collapsed, wasR = !!ipR.collapsed;
                        btn.doCommand(); await sleep(500);
                        assert.strictEqual(!!ipL.collapsed, !wasL, "the left item pane toggled");
                        assert.strictEqual(!!ipR.collapsed, wasR, "the right one did not");
                        btn.doCommand(); await sleep(400);
                        assert.strictEqual(!!ipL.collapsed, wasL, "and back");
                    }
                }
                finally { wv._wvTabSplitSeparate(win, s.id); }
            });
        }
        finally {
            if (L2) { try { ZT.close(L2.id); } catch (er) {} }
            await wvT.erase(tagged);
            try { ZT.select(L.id); } catch (er) {}
        }
    });

    /** The splitter of the split on screen. */
    const splitter = () => doc.querySelector("#wv-tsplit-layer .wv-tsplit-splitter");
    function pointerDrag(sp, dx) {
        const r = sp.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const pe = (type, d) => sp.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
            clientX: x + d, clientY: y, screenX: Math.round(win.mozInnerScreenX + x + d), screenY: Math.round(win.mozInnerScreenY + y), isPrimary: true, pointerType: "mouse" }));
        pe("pointerdown", 0); pe("pointermove", Math.round(dx / 2)); pe("pointermove", dx); pe("pointerup", dx);
    }

    it("the splitter resizes every pairing: pointer and keyboard, Firefox's floor held, the ratio kept across a tab switch and in the restart record", async function () {
        separateAll();
        const L = libTab(), L2 = secondLibTab();
        const t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2), tn = await ensureTab(note);
        const pairs = [["library|reader", L.id, t1.id], ["reader|reader", t1.id, t2.id], ["note|reader", tn.id, t2.id]];
        if (L2) pairs.unshift(["library|library", L.id, L2.id]);
        const xulCursor = (() => { const x = doc.createXULElement("splitter"); doc.documentElement.appendChild(x); const c = win.getComputedStyle(x).cursor; x.remove(); return c; })();
        try {
            await atSize(1920, 1040, async () => {
                for (const [name, x, y] of pairs) {
                    // The sides in the strip's order (a split keeps it, item 16).
                    const at = (id) => ZT._tabs.findIndex(t => t.id === id);
                    const [a, b] = at(x) <= at(y) ? [x, y] : [y, x];
                    ZT.select(a); await sleep(400);
                    const s = wv._wvTabSplitCreate(win, a, b, { select: "left" });
                    await sleep(1000);
                    try {
                        const sp = splitter();
                        assert.ok(sp, name + ": a splitter");
                        const gap = rectOf(b).left - rectOf(a).right;
                        assert.approximately(sp.getBoundingClientRect().width, gap, 1, name + ": it takes the whole gap between the cards");
                        assert.isAtLeast(sp.getBoundingClientRect().width, 7, name + ": at least 7px to hit");
                        assert.strictEqual(win.getComputedStyle(sp).cursor, xulCursor, name + ": a XUL splitter's cursor (" + xulCursor + ")");
                        assert.strictEqual(sp.getAttribute("role"), "separator");
                        assert.strictEqual(sp.getAttribute("aria-controls"), a, name + ": it controls the left side");
                        // Firefox's 140px (+ the card's border) for every side, a library
                        // view too (MJT 2026-11-11: "Let me go to a very small width").
                        const total = wv._wvTabSplitTotal(win);
                        const [minA, minB] = wv._wvTabSplitMins(win, s, total);
                        assert.deepEqual([minA, minB].map(Math.round), [142, 142], name + ": Firefox's floor for both sides");
                        const clamp = (w) => Math.max(minA, Math.min(total - minB, w));
                        // Pointer: 120px to the left.
                        const w0 = rectOf(a).width;
                        pointerDrag(splitter(), -120); await sleep(300);
                        const want = clamp(w0 - 120);
                        if (want != null) assert.approximately(rectOf(a).width, want, 3, name + ": dragged 120px left (min " + minA + ")");
                        // Far left: the left side stops at the floor.
                        pointerDrag(splitter(), -3000); await sleep(300);
                        if (want != null) assert.approximately(rectOf(a).width, minA, 3, name + ": the left side stops at its minimum " + minA);
                        // Back to the middle, then the keyboard: 5px a press (Firefox).
                        s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(400);
                        const k0 = rectOf(a).width;
                        const kb = splitter();
                        assert.strictEqual(kb.getAttribute("tabindex"), "0", name + ": the splitter takes the focus");
                        kb.focus();
                        kb.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
                        await sleep(200);
                        const k1 = rectOf(a).width;
                        if (clamp(k0 + 5) != null && clamp(k0 + 5) !== k0) assert.approximately(k1 - k0, clamp(k0 + 5) - k0, 1.5, name + ": ArrowRight grows the left side 5px");
                        assert.strictEqual(splitter().getAttribute("aria-valuenow"), String(Math.floor(k1)), name + ": aria-valuenow is the left side's width");
                        // The ratio survives a tab switch and is in the restart record.
                        const r1 = s.ratio, wa = rectOf(a).width;
                        const outside = ZT._tabs.find(t => t.id !== a && t.id !== b && !wv._wvTabSplitOf(win, t.id));
                        if (outside) { ZT.select(outside.id); await sleep(500); ZT.select(a); await sleep(800); }
                        assert.approximately(rectOf(a).width, wa, 1.5, name + ": the width is back after a tab switch");
                        const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
                        assert.ok(rec.some(x => Math.abs(Number(x.ratio) - r1) < 0.002), name + ": the ratio " + r1.toFixed(3) + " in the restart record " + JSON.stringify(rec.map(x => x.ratio)));
                    }
                    finally { wv._wvTabSplitSeparate(win, s.id); await sleep(200); }
                }
            });
        }
        finally {
            if (L2) { try { ZT.close(L2.id); } catch (er) {} }
            try { ZT.select(L.id); } catch (er) {}
        }
    });

    /** The visible children of the open tab menu for `tabID`, with their keys in
     *  the canonical order (tabs.ts _wvTabMenuOrder / _wvTabMenuItemKey). */
    async function tabMenuKeys(tabID) {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + tabID + '"], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + tabID + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(700);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const out = [];
        for (const p of pops) for (const ch of p.children) {
            if (ch.hidden || win.getComputedStyle(ch).display === "none") continue;
            out.push({ key: wv._wvTabMenuItemKey(ch), label: ch.getAttribute("label") || ch.localName });
        }
        for (const p of pops) { try { p.hidePopup(); } catch (er) {} }
        await sleep(200);
        return out;
    }
    function assertSplitPlace(items, what, wantKeys) {
        const order = wv._wvTabMenuOrder();
        const desc = items.map(i => (i.key || "-") + ":" + i.label).join(" | ");
        const at = items.map((i, n) => (i.key && /^split/.test(i.key)) ? n : -1).filter(n => n >= 0);
        assert.deepEqual(at.map(n => items[n].key), wantKeys, what + ": the split entries " + desc);
        for (let n = 1; n < at.length; n++) assert.strictEqual(at[n], at[n - 1] + 1, what + ": kept together: " + desc);
        // In the canonical order: after the item and group entries, before Move Tab
        // and everything below it (Firefox: the split entries right after the
        // group entries, tab-context-menu.js MENU_SECTIONS).
        const keyed = items.map(i => i.key).filter(k => k && order.indexOf(k) >= 0);
        const idx = keyed.map(k => order.indexOf(k));
        for (let n = 1; n < idx.length; n++) assert.isAbove(idx[n], idx[n - 1], what + ": in the canonical order: " + desc);
        // An older Zotero's fixed library tab has none of those: the entries lead.
        const prev = items[at[0] - 1];
        if (prev) assert.include(["groupTab", "removeFromGroup", "openNotes", "externalViewer", "showFile", "viewOnline", "showInLibrary"], prev.key, what + ": right after the group / item entries: " + desc);
    }

    it("the tab menu's split entries sit together after the group entries, as Firefox's (every tab kind, one or two tabs, a split's tab)", async function () {
        separateAll();
        win._wvSelTabIDs = new Set();
        const L = libTab(), t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2), tn = await ensureTab(note);
        ZT.select(t1.id); await sleep(400);
        assertSplitPlace(await tabMenuKeys(t1.id), "one reader tab", ["splitAdd"]);
        assertSplitPlace(await tabMenuKeys(tn.id), "a note tab", ["splitAdd"]);
        ZT.select(L.id); await sleep(400);
        assertSplitPlace(await tabMenuKeys(L.id), "the library tab", ["splitAdd"]);
        ZT.select(t1.id); await sleep(300);
        win._wvSelTabIDs = new Set([t1.id, t2.id]);
        try { assertSplitPlace(await tabMenuKeys(t1.id), "two selected tabs", ["splitOpen"]); }
        finally { win._wvSelTabIDs = new Set(); }
        const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        await sleep(600);
        try { assertSplitPlace(await tabMenuKeys(t1.id), "a split's tab", ["splitSeparate", "splitReverse"]); }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    // MJT 2026-11-11: "I should not be able to apply split view multiple times for tabs
    // already in split view" (Firefox hides its entries for such a tab:
    // tab-context-menu.js `hasSplitViewTab`); "Just after opening in split view in
    // Firefox, only one tab gets selected, which is the one currently active"; "If I
    // select 2 tabs in split view, the right-click menu should give me the option to
    // separate them" (Firefox: Separate for any targeted split tab, every split among
    // them; Reverse on one tab only).
    const labelsOf = (items) => items.map(x => x.getAttribute("label"));
    it("a tab already in a split gets no split entry, from any way in, and no second split; Separate gives them back", async function () {
        separateAll();
        const t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2), tn = await ensureTab(note);
        ZT.select(t1.id); await sleep(300);
        const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        assert.ok(s, "fixture: the split");
        await sleep(500);
        const url = "zotero://select/library/items/" + note.key;
        const itemsEntry = () => {
            const popup = doc.createXULElement("menupopup");
            doc.documentElement.appendChild(popup);
            try { wv._wvTabSplitItemsMenu(doc, popup, [note], win); return !!doc.getElementById("wv-itemmenu-split"); }
            finally { const mi = doc.getElementById("wv-itemmenu-split"); if (mi) mi.remove(); popup.remove(); }
        };
        try {
            const one = labelsOf(await withTabMenu(t1.id, async (items) => items));
            assert.notInclude(one, "Add Split View", "a split tab: no Add Split View");
            win._wvSelTabIDs = new Set([t1.id, tn.id]);
            try { assert.notInclude(labelsOf(await withTabMenu(t1.id, async (items) => items)), "Open in Split View", "a split tab and another: no Open in Split View"); }
            finally { win._wvSelTabIDs = new Set(); }
            assert.isFalse(itemsEntry(), "the items list's entry, from a split tab: none");
            assert.isFalse(wv._wvTabSplitLinkOK(win, url), "Open Link in Split View, from a split tab: none");
            assert.isNull(wv._wvTabSplitCreate(win, t1.id, tn.id, { select: "none" }), "a second split for a split tab: refused");
            assert.strictEqual(splitOf(t1.id) && splitOf(t1.id).id, s.id, "the split untouched");
            assert.notOk(splitOf(tn.id), "the other tab not split");
            wv._wvTabSplitAddPicker(win, t2.id);
            assert.strictEqual(splitOf(t2.id) && splitOf(t2.id).id, s.id, "no picker for a split tab");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
        ZT.select(t1.id); await sleep(300);
        assert.include(labelsOf(await withTabMenu(t1.id, async (items) => items)), "Add Split View", "separated: Add Split View again");
        assert.isTrue(itemsEntry(), "separated: the items list's entry again");
        assert.isTrue(wv._wvTabSplitLinkOK(win, url), "separated: Open Link in Split View again");
    });

    it("after Open in Split View only the active tab stays selected", async function () {
        separateAll();
        const t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2);
        ZT.select(t1.id); await sleep(300);
        win._wvSelTabIDs = new Set([t1.id, t2.id]);
        try { wv._wvTabMultiSelSync(win); } catch (er) {}
        await withTabMenu(t1.id, async (items) => {
            const mi = items.find(x => x.getAttribute("label") === "Open in Split View");
            assert.ok(mi, "fixture: the entry");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(600);
        try {
            assert.ok(splitOf(t1.id), "fixture: the split");
            assert.strictEqual((win._wvSelTabIDs && win._wvSelTabIDs.size) || 0, 0, "no multi-selection left");
            assert.lengthOf(Array.from(doc.querySelectorAll("#tab-bar-container .tab.wv-multisel")), 0, "no tab drawn multi-selected");
            assert.strictEqual(ZT.selectedID, t1.id, "the active tab is the selected one");
        }
        finally { separateAll(); win._wvSelTabIDs = new Set(); }
    });

    it("with both tabs of a split selected the tab menu offers Separate Split View (not Reverse Tabs); a mixed selection separates every split in it", async function () {
        separateAll();
        const L = libTab(), t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2), tn = await ensureTab(note);
        ZT.select(t1.id); await sleep(300);
        let s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
        await sleep(400);
        try {
            win._wvSelTabIDs = new Set([t1.id, t2.id]);
            await withTabMenu(t1.id, async (items) => {
                const labels = labelsOf(items);
                assert.include(labels, "Separate Split View", "the pair selected: Separate Split View");
                assert.notInclude(labels, "Reverse Tabs", "not Reverse Tabs on a multiselection (Firefox)");
                assert.notInclude(labels, "Open in Split View");
                items.find(x => x.getAttribute("label") === "Separate Split View").dispatchEvent(new win.Event("command"));
            });
            await sleep(400);
            assert.notOk(splitOf(t1.id), "separated");
            // Two splits, one tab of each selected: both separated.
            win._wvSelTabIDs = new Set();
            s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
            ZT.select(L.id); await sleep(300);
            const s2 = wv._wvTabSplitCreate(win, L.id, tn.id, { select: "left" });
            assert.ok(s && s2, "fixture: two splits");
            ZT.select(t1.id); await sleep(300);
            win._wvSelTabIDs = new Set([t1.id, tn.id]);
            await withTabMenu(t1.id, async (items) => {
                items.find(x => x.getAttribute("label") === "Separate Split View").dispatchEvent(new win.Event("command"));
            });
            await sleep(400);
            assert.notOk(splitOf(t1.id) || splitOf(tn.id), "both splits separated");
        }
        finally { win._wvSelTabIDs = new Set(); separateAll(); }
    });

    // Found while guarding item 17: the split entry, left in the items list's menu
    // between two right-clicks, stopped Zotero's clean-up of its Open entries
    // (zoteroPane.js buildItemContextMenu removes them from the top only while each is
    // `zotero-locate`), and "Show File" with its separator doubled at every right-click.
    it("the items list's menu keeps one of each of Zotero's entries, right-click after right-click", async function () {
        separateAll();
        const ZP = win.ZoteroPane;
        ZT.select(libTab().id); await sleep(500);
        await ZP.selectItems([pdf1.id]); await sleep(300);
        const menu = doc.getElementById("zotero-itemmenu");
        const zoteros = () => Array.from(menu.children).filter(x => !String(x.id || "").startsWith("wv-")).map(x => x.id || x.getAttribute("data-l10n-id") || x.localName);
        let first = null;
        for (let i = 1; i <= 3; i++) {
            await ZP.buildItemContextMenu();
            menu.openPopupAtScreen(200, 200, true);
            await waitFor(() => doc.getElementById("wv-itemmenu-split"), 5000, "the split entry");
            await sleep(300);
            const now = zoteros();
            try { menu.hidePopup(); } catch (er) {}
            await sleep(300);
            if (!first) { first = now; continue; }
            assert.deepEqual(now, first, "right-click " + i + ": Zotero's entries as at the first");
        }
        assert.include(first, "item-menu-viewAttachment", "fixture: Zotero's Open entries there");
    });

    // ---- 17. Every split entry has an icon where its neighbours have one -------------
    // MJT 2026-11-12, the items list's menu: "Open PDF in New Tab" and "Open PDF in New
    // Window" with Zotero's PDF icon, then "Open PDF in Split View" with none, its label
    // out of line: "Add icons for Open in Split View". Zotero picks that icon by the
    // attachment type (locateMenu.js ViewItem.className) and only where the menu shows
    // icons; Zotero's tab menu (tabs.js _openMenu) and Firefox's split entries
    // (main-popupset.inc.xhtml: context_moveTabToSplitView, the split-view menu) have
    // none. Menu icons come from --menuitem-icon on Zotero 11, list-style-image before.
    const iconOf = (el) => {
        const cs = win.getComputedStyle(el);
        const v = String(cs.getPropertyValue("--menuitem-icon") || "").trim();
        if (v && v !== "none" && v !== "initial" && v !== "normal") return v;
        const l = cs.listStyleImage;
        return l && l !== "none" ? l : "";
    };
    it("17. every split entry has an icon where its neighbours have one: the items list's Zotero's own for the type, the tab menu and the split's menu none (light and dark)", async function () {
        separateAll();
        win._wvSelTabIDs = new Set();
        const L = libTab(), t1 = await ensureTab(pdf1), t2 = await ensureTab(pdf2);
        const ZP = win.ZoteroPane;
        try {
            for (const [theme, val] of [["light", 0], ["dark", 1]]) {
                try { Services.prefs.setIntPref("ui.systemUsesDarkTheme", Number(val)); } catch (er) {}
                await sleep(600);
                // The items list: the PDF's entry beside Zotero's "Open PDF in New Window".
                ZT.select(L.id); await sleep(500);
                await ZP.selectItems([pdf1.id]); await sleep(300);
                const menu = doc.getElementById("zotero-itemmenu");
                // As Zotero's right-click: its entries built, then the menu shown
                // (zoteroPane.js onItemsContextMenuOpen).
                await ZP.buildItemContextMenu();
                menu.openPopupAtScreen(200, 200, true);
                try {
                    const mi = await waitFor(() => doc.getElementById("wv-itemmenu-split"), 5000, "the split entry");
                    await sleep(300);
                    const nb = mi.previousElementSibling;
                    assert.ok(nb && nb.getAttribute("data-l10n-id") === "item-menu-viewAttachment", theme + ": right after Zotero's Open entries: " + Array.from(menu.children).filter(x => !x.hidden).slice(0, 6).map(x => x.id || x.getAttribute("data-l10n-id") || x.localName).join(" | "));
                    assert.ok(iconOf(nb), theme + ": fixture: Zotero's Open PDF entry has its icon");
                    assert.strictEqual(iconOf(mi), iconOf(nb), theme + ": the split entry has the same icon");
                    const lx = (el) => { const lab = el.querySelector(".menu-iconic-text, .menu-text, label"); return lab ? lab.getBoundingClientRect().left : NaN; };
                    assert.approximately(lx(mi), lx(nb), 0.5, theme + ": its label aligned with its neighbour's");
                }
                finally { try { menu.hidePopup(); } catch (er) {} await sleep(300); }
                // The tab menu: one tab, two tabs, a split's tab. It mixes Zotero's
                // iconless tab entries (tabs.js _openMenu: Show in Library, Duplicate,
                // Close...) and Weavero's tab entries (Group Tab, Pin Tab) with
                // Weavero's file entries (Show File, Open in External Viewer), which
                // carry the items list's icons. A split entry follows the entry right
                // above it, a tab entry -- none, as Firefox's split entries
                // (main-popupset.inc.xhtml).
                const noneWhereNone = (items, what) => {
                    const split = items.filter(x => /Split View|Reverse Tabs/.test(x.getAttribute("label") || ""));
                    assert.ok(split.length, theme + ": " + what + ": fixture: a split entry");
                    const shown = (el) => el.localName === "menuitem" && !el.hidden && win.getComputedStyle(el).display !== "none";
                    for (const x of split) {
                        let above = x.previousElementSibling;
                        while (above && (!shown(above) || split.includes(above)) && above.localName !== "menuseparator") above = above.previousElementSibling;
                        const want = !!(above && above.localName === "menuitem" && iconOf(above));
                        const who = above && above.localName === "menuitem" ? above.getAttribute("label") + (want ? " (icon)" : "") : "a separator";
                        assert.strictEqual(!!iconOf(x), want, theme + ": " + what + ": " + x.getAttribute("label") + (want ? " has an icon, as " : " has none, as ") + who + " above it");
                    }
                };
                ZT.select(t1.id); await sleep(300);
                await withTabMenu(t1.id, async (items) => noneWhereNone(items, "one tab"));
                win._wvSelTabIDs = new Set([t1.id, t2.id]);
                try { await withTabMenu(t1.id, async (items) => noneWhereNone(items, "two tabs")); }
                finally { win._wvSelTabIDs = new Set(); }
                const s = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "left" });
                await sleep(500);
                try {
                    await withTabMenu(t1.id, async (items) => noneWhereNone(items, "a split's tab"));
                    // The split's own menu (Firefox's split-view menu: no icons).
                    const more = doc.querySelector("#wv-tsplit-layer .wv-tsplit-footer") || doc.body;
                    wv._wvTabSplitFooterMenu(win, s, more);
                    const pop = await waitFor(() => doc.getElementById("wv-tsplit-menu"), 3000, "the split's menu");
                    await sleep(300);
                    const its = Array.from(pop.querySelectorAll(":scope > menuitem"));
                    assert.ok(its.length, theme + ": fixture: the split's menu entries");
                    for (const x of its) assert.strictEqual(iconOf(x), "", theme + ": the split's menu: " + x.getAttribute("label") + " has none, as Firefox's");
                    try { pop.hidePopup(); } catch (er) {}
                }
                finally { wv._wvTabSplitSeparate(win, s.id); await sleep(300); }
            }
        }
        finally {
            try { Services.prefs.clearUserPref("ui.systemUsesDarkTheme"); } catch (er) {}
            win._wvSelTabIDs = new Set();
            separateAll();
        }
    });
});
