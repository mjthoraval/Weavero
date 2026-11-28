/* global describe, it, before, after, assert, Zotero, wvT */
// "Show Tab Name" on a LIBRARY tab acts on that tab alone (MJT 2026-11-27, on
// Zotero 11 with three pinned My Library tabs: the entry on one showed or hid
// the name on every one of them; "It should act on only one", "it should act
// per tab, same as all the other tabs"). Until then the entry on a library tab
// switched the Settings option `pinnedLibraryTabName`, which every library tab
// follows. Now the option is the default for a library tab with no choice of
// its own, and a tab's own choice rides in its `data` (`wvPinName`, tabs.ts
// _wvLibTabPinNameSet): Zotero saves it with the window and gives it back to the
// tab it restores (a restart, a closed window reopened), and Weavero's named
// sessions record it with the window's library tabs.
//
// Before the fix (1.3.0-paneorg.4): the entry on one of two pinned library tabs
// turned the option off, and the other tab lost its name too.
//
// An item tab's own choice: test/pin-name-item-tab.spec.js. The menu entry's
// place, and a single pinned My Library's look: library-tab-zotero-pin.spec.js
// and library-tab-native.spec.js.
describe("Weavero — Show Tab Name acts on one library tab (zotero#6035)", function () {
    this.timeout(180000);
    let wv, win, ZT, L1, L2, prevTW, libWasPinned = false;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libs = (w) => w.Zotero_Tabs._tabs.filter(t => t && String(t.type).startsWith("library"));
    const tab = (w, id) => w.Zotero_Tabs._tabs.find(t => t && t.id === id) || null;
    const mirror = (w, id) => w.document.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + id + '"]');
    const node = (w, id) => Array.from(w.document.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(el => el.getBoundingClientRect().width > 0) || null;
    const named = (w, id) => { const m = mirror(w, id); return !!(m && m.hasAttribute("data-wv-named")); };
    const isPinned = (t) => !!(t && wvT.lib().wvLibraryTabPinned(t));
    const optionOn = () => Zotero.Prefs.get("weavero.pinnedLibraryTabName");
    const need = (...names) => { for (const m of names) if (typeof wv[m] !== "function") wvT.absent("plugin." + m); };
    function closeMenus(w) {
        for (const p of w.document.querySelectorAll("popupset > menupopup")) { try { if (p.state === "open" || p.state === "showing") p.hidePopup(); } catch (er) {} }
    }
    /** Tab `id`'s menu in window `w`, as Zotero builds it (with Weavero's
     *  MenuManager entries), left open: the "pinName" entry and the one before it. */
    async function entry(w, id) {
        const d = w.document;
        const el = mirror(w, id) || node(w, id);
        assert.ok(el, "fixture: tab " + id + " on screen");
        const r = el.getBoundingClientRect();
        w.Zotero_Tabs._openMenu(Math.round(w.mozInnerScreenX + r.left + 10), Math.round(w.mozInnerScreenY + r.top + 10), id);
        await waitFor(() => Array.from(d.querySelectorAll("popupset > menupopup")).some(p => p.state === "open"), 5000, "the tab menu to open");
        await sleep(300);
        for (const p of d.querySelectorAll("popupset > menupopup")) {
            if (p.state !== "open" && p.state !== "showing") continue;
            const shown = Array.from(p.children).filter(ch => !ch.hidden && w.getComputedStyle(ch).display !== "none");
            const i = shown.findIndex(ch => ch.getAttribute("data-wv-key") === "pinName");
            return { mi: i >= 0 ? shown[i] : null, prev: i > 0 ? shown[i - 1] : null, popup: p,
                desc: shown.map(ch => (wv._wvTabMenuItemKey(ch) || "-") + ":" + (ch.getAttribute("label") || ch.localName)).join(" | ") };
        }
        return { mi: null, prev: null, popup: null, desc: "no open menu" };
    }
    const checked = (mi) => !!(mi && wvT.lib().wvBoolAttrOn(mi, "checked"));
    /** Choose Show Tab Name on tab `id` of window `w`, through its menu. */
    async function toggle(w, id) {
        const e = await entry(w, id);
        assert.ok(e.mi, "the entry on " + id + "'s menu: " + e.desc);
        e.mi.doCommand();
        closeMenus(w);
    }
    /** Add a library tab to window `w` and pin it (and the ones it had). */
    async function twoPinnedLibraryTabs(w) {
        const ids0 = libs(w).map(t => t.id);
        w.ZoteroPane.newLibraryTab();
        await waitFor(() => libs(w).some(t => !ids0.includes(t.id)), 10000, "a second library tab");
        const a = libs(w)[0], b = libs(w).find(t => !ids0.includes(t.id));
        for (const t of [a, b]) { if (!isPinned(t)) wv._wvSetLibraryTabPinned(w, t.id, true); }
        await waitFor(() => isPinned(a) && isPinned(b) && mirror(w, a.id) && mirror(w, b.id), 8000, "both pinned and drawn as pins");
        return [a.id, b.id];
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (!wvT.nativeWindows()) this.skip();   // version: an older Zotero's one library tab is fixed, never pinned (the suite below)
        need("_applyPinnedTabs", "_wvSetLibraryTabPinned", "_wvTabShowsPinName", "_wvTabMenuItemKey");
        win = Zotero.getMainWindows()[0]; ZT = win.Zotero_Tabs;
        if (typeof ZT._openMenu !== "function") wvT.absent("Zotero_Tabs._openMenu");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        try { Zotero.Prefs.clear("weavero.pinnedLibraryTabName"); } catch (er) {}
        // Since 11.0-beta.5 the runner's first window starts with My Library
        // pinned (zotero 0883f08887); after() puts back what it found.
        libWasPinned = isPinned(libs(win)[0]);
        [L1, L2] = await twoPinnedLibraryTabs(win);
        try { ZT.select(L1); } catch (er) {}
        await sleep(500);
    });

    after(async function () {
        if (!win) return;
        this.timeout(60000);
        for (const w of Zotero.getMainWindows()) closeMenus(w);
        try { Zotero.Prefs.clear("weavero.pinnedLibraryTabName"); } catch (er) {}
        for (const w of Zotero.getMainWindows().slice(1)) { try { w.close(); } catch (er) {} }
        try { await waitFor(() => Zotero.getMainWindows().length === 1, 10000, "one window"); } catch (er) {}
        const w = Zotero.getMainWindows()[0], Z = /** @type {any} */ (w.Zotero_Tabs);
        // Later specs select "zotero-pane": give it back if a failure here lost it.
        if (!tab(w, "zotero-pane") && typeof Z.addLibraryTab === "function") {
            try { Z.addLibraryTab({ id: "zotero-pane", index: 0, select: true }); } catch (er) {}
        }
        const libs0 = libs(w);
        const home = libs0.find(t => t.id === "zotero-pane") || libs0[0];
        const rest = libs0.filter(t => t !== home);
        for (const t of rest) {
            try { if (isPinned(t)) wv._wvSetLibraryTabPinned(w, t.id, false); } catch (er) {}
            try { Z.close(t.id, { skipHistory: true }); } catch (er) {}
        }
        if (home) {
            try { if (home.data) delete home.data.wvPinName; } catch (er) {}
            try { if (isPinned(home) !== libWasPinned) wv._wvSetLibraryTabPinned(w, home.id, libWasPinned); } catch (er) {}
            try { if (Z._tabs.indexOf(home) > 0 && !home.pinned) Z.move(home.id, 0); } catch (er) {}
            try { Z.select(home.id); } catch (er) {}
        }
        wv._wvSessionPinsUntil = 0;
        try { wv._applyPinnedTabs(w); } catch (er) {}
        try { if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW); } catch (er) {}
        await sleep(300);
    });

    it("Show Tab Name on one of two pinned library tabs changes that tab alone, not the Settings option", async function () {
        await waitFor(() => named(win, L1) && named(win, L2), 5000, "both show their name (the option's default)");
        const e = await entry(win, L2);
        assert.ok(e.mi, "on the second library tab's menu: " + e.desc);
        assert.strictEqual(e.mi.getAttribute("type"), "checkbox", "a checkbox");
        assert.isTrue(checked(e.mi), "checked: the tab shows its name");
        assert.strictEqual(wv._wvTabMenuItemKey(e.prev), "pin", "right after the pin entry: " + e.desc);
        e.mi.doCommand();
        closeMenus(win);
        await waitFor(() => !named(win, L2), 3000, "the second tab: the icon alone");
        await sleep(400);
        assert.isTrue(named(win, L1), "the other pinned library tab keeps its name");
        assert.strictEqual(optionOn(), true, "the Settings option is not changed");
        const e2 = await entry(win, L2);
        assert.isFalse(checked(e2.mi), "unchecked on the tab it was chosen for: " + e2.desc);
        closeMenus(win);
        await sleep(200);
        const e1 = await entry(win, L1);
        assert.isTrue(checked(e1.mi), "still checked on the other: " + e1.desc);
        closeMenus(win);
        await sleep(200);
    });

    it("the Settings option is the default for a library tab without a choice of its own; a tab's own choice wins", async function () {
        try {
            Zotero.Prefs.set("weavero.pinnedLibraryTabName", false);
            await waitFor(() => !named(win, L1), 3000, "the option off: the tab with no choice of its own follows it");
            assert.isFalse(named(win, L2), "the second tab: its own choice (off)");
            await toggle(win, L2);
            await waitFor(() => named(win, L2), 3000, "the second tab's own choice on");
            await sleep(400);
            assert.isFalse(named(win, L1), "the first tab keeps following the option (off)");
            assert.strictEqual(optionOn(), false, "the option is not changed");
            Zotero.Prefs.clear("weavero.pinnedLibraryTabName");
            await waitFor(() => named(win, L1), 3000, "the option back on: the first tab follows it");
            assert.isTrue(named(win, L2), "the second: its own choice (on)");
            await toggle(win, L2);
            await waitFor(() => !named(win, L2), 3000, "the second tab's own choice off again");
            await sleep(400);
            assert.isTrue(named(win, L1), "the first unchanged");
            assert.strictEqual(optionOn(), true, "the option unchanged");
        }
        finally { try { Zotero.Prefs.clear("weavero.pinnedLibraryTabName"); } catch (er) {} }
    });

    it("on a selection of tabs, every selected pinned library tab takes the clicked tab's new state; the option stays", async function () {
        need("_wvLibTabPinNameSet", "_wvLibTabPinNameOwn");
        wv._wvLibTabPinNameSet(tab(win, L1), undefined);
        wv._wvLibTabPinNameSet(tab(win, L2), undefined);
        wv._applyPinnedTabs(win);
        await waitFor(() => named(win, L1) && named(win, L2), 3000, "fixture: no choice, both named");
        // The tab bar's Ctrl+click selection, as the command reads it.
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvTabMultiSelTargets");
        const orig = wv._wvTabMultiSelTargets;
        wv._wvTabMultiSelTargets = (w, id) => (w === win && (id === L1 || id === L2) ? [L1, L2] : [id]);
        try {
            await toggle(win, L1);
            await waitFor(() => !named(win, L1) && !named(win, L2), 3000, "both selected tabs: the icon alone");
        }
        finally { if (own) wv._wvTabMultiSelTargets = orig; else delete wv._wvTabMultiSelTargets; }
        assert.strictEqual(wv._wvLibTabPinNameOwn(tab(win, L1)), false, "the clicked tab's choice");
        assert.strictEqual(wv._wvLibTabPinNameOwn(tab(win, L2)), false, "the other selected tab's choice");
        assert.strictEqual(optionOn(), true, "the option is not changed");
        wv._wvLibTabPinNameSet(tab(win, L1), undefined);
        wv._wvLibTabPinNameSet(tab(win, L2), false);
        wv._applyPinnedTabs(win);
        await waitFor(() => named(win, L1) && !named(win, L2), 3000, "back to: the first follows the option, the second off");
    });

    // What a restart restores: Zotero saves each tab's `data` with its window
    // (tabs.js getState) and hands it back to the tab it restores (restoreState).
    // A library tab's id is new at every start but the first one's, so the id
    // could not carry the choice.
    it("the choice rides with the window's saved state: a closed window reopened from it shows it again", async function () {
        need("_wvLibTabPinNameSet", "_wvLibTabPinNameOwn");
        const st = ZT.getState().filter(t => String(t.type).startsWith("library"));
        const i2 = libs(win).findIndex(t => t.id === L2), i1 = libs(win).findIndex(t => t.id === L1);
        assert.strictEqual(st[i2] && st[i2].data && st[i2].data.wvPinName, false, "this window's state holds the second tab's choice: " + JSON.stringify(st.map(t => t.data)));
        assert.notOk(st[i1] && st[i1].data && "wvPinName" in st[i1].data, "and none for the first");
        const S = /** @type {any} */ (Zotero).Session;
        const last0 = S && S.getLastClosed ? S.getLastClosed() : null;
        let W = null, back = null;
        try {
            W = await wvT.openMainWindow();
            assert.ok(W, "fixture: a second window");
            const [a, b] = await twoPinnedLibraryTabs(W);
            wv._wvLibTabPinNameSet(tab(W, b), false);
            wv._applyPinnedTabs(W);
            await waitFor(() => named(W, a) && !named(W, b), 5000, "W: the name on its first library tab only");
            const saved = W.ZoteroPane.getState();
            const savedLibs = saved.tabs.filter(t => String(t.type).startsWith("library"));
            assert.strictEqual(savedLibs[1] && savedLibs[1].data && savedLibs[1].data.wvPinName, false, "Zotero saves the choice with the window: " + JSON.stringify(savedLibs.map(t => t.data)));
            W.close();
            await waitFor(() => W.closed, 10000, "W closed");
            await sleep(500);
            // Zotero's own record of the closed window when it has one (its Reopen
            // Closed Window), else the state read above: both are getState's.
            let state = saved;
            if (S && S.takeLastClosed && S.getLastClosed() && S.getLastClosed() !== last0) {
                const c = S.takeLastClosed();
                state = (c && (c.window || c)) || saved;
            }
            const before = new Set(Zotero.getMainWindows());
            /** @type {any} */ (Zotero).openMainWindow({ sessionState: state });
            back = await waitFor(() => Zotero.getMainWindows().find(x => !before.has(x) && x.Zotero_Tabs && libs(x).length >= 2
                && x.ZoteroPane && x.ZoteroPane.itemsView && x.ZoteroPane.collectionsView && x.document.readyState === "complete"), 20000, "the window back");
            const [ra, rb] = libs(back);
            await waitFor(() => isPinned(ra) && isPinned(rb) && mirror(back, ra.id) && mirror(back, rb.id), 8000, "both pinned again");
            assert.strictEqual(wv._wvLibTabPinNameOwn(rb), false, "the restored tab holds its choice");
            assert.strictEqual(wv._wvLibTabPinNameOwn(ra), undefined, "the other none");
            await waitFor(() => named(back, ra.id) && !named(back, rb.id), 5000, "drawn so: the name on the first only");
        }
        finally {
            for (const x of [back, W]) { try { if (x && !x.closed) x.close(); } catch (er) {} }
            try { await waitFor(() => (!back || back.closed) && (!W || W.closed), 10000, "the extra windows closed"); } catch (er) {}
            // Out of Zotero's reopen list again: only what this case closed.
            for (let n = 0; S && S.getLastClosed && S.takeLastClosed && n < 10; n++) {
                const l = S.getLastClosed();
                if (!l || l === last0) break;
                S.takeLastClosed();
            }
            try { win.focus(); } catch (er) {}
            await sleep(300);
        }
    });

    // A switch keeps one window and its first library tab, and rebuilds the rest
    // (sessions.ts _wvTabSessionReconstructNative): that tab takes the session's
    // choice, or none.
    it("a named session keeps each library tab's choice, the tab the switch keeps included", async function () {
        need("_wvLibTabPinNameSet", "_wvLibTabPinNameOwn", "_wvTabSessionSaveAs", "_wvTabSessionNewEmpty", "_wvTabSessionSwitch", "_wvTabSessionList");
        await wv._wvTabSessionInit();
        const doc0 = JSON.stringify(wv._wvTabSessionDoc), active0 = wv._wvTabSessionGetActiveId();
        try {
            wv._wvLibTabPinNameSet(tab(win, L1), false);
            wv._wvLibTabPinNameSet(tab(win, L2), undefined);
            wv._applyPinnedTabs(win);
            await waitFor(() => !named(win, L1) && named(win, L2), 3000, "fixture: the first off, the second following the option");
            const s = await wv._wvTabSessionSaveAs("wv-pinname-lib");
            const id = (s && s.id) || wv._wvTabSessionList().find(x => x.name === "wv-pinname-lib").id;
            const rec = wv._wvTabSessionList().find(x => x.id === id);
            const main = rec.windows.find(w => w.kind === "main" && !w.noLibrary);
            assert.ok(main && Array.isArray(main.libraryTabs) && main.libraryTabs.length >= 2, "the session lists the library tabs: " + JSON.stringify(main));
            assert.strictEqual(main.libraryTabs[0].data && main.libraryTabs[0].data.wvPinName, false, "with the first one's choice");
            assert.notOk(main.libraryTabs[1].data && "wvPinName" in main.libraryTabs[1].data, "and none for the second");
            const first0 = libs(win)[0].id;
            await wv._wvTabSessionNewEmpty(win);
            const w0 = Zotero.getMainWindows()[0];
            assert.lengthOf(libs(w0), 1, "the new session: one library tab");
            // The window's FIRST library tab, though the teardown's unpin puts the
            // second before it (it kept the second until 2026-11-27, and the window
            // lost "zotero-pane").
            assert.strictEqual(libs(w0)[0].id, first0, "the switch keeps the window's first library tab");
            assert.strictEqual(wv._wvLibTabPinNameOwn(libs(w0)[0]), undefined, "which keeps no choice from the session it left");
            await wv._wvTabSessionSwitch(id);
            const w1 = await waitFor(() => Zotero.getMainWindows().find(w => libs(w).length >= 2), 10000, "the session's window with its two library tabs");
            const [h, o] = libs(w1);
            assert.strictEqual(h.id, first0, "the kept tab is first again");
            assert.strictEqual(wv._wvLibTabPinNameOwn(h), false, "the tab the switch kept: its choice back");
            assert.strictEqual(wv._wvLibTabPinNameOwn(o), undefined, "the other: none");
            await waitFor(() => isPinned(h) && isPinned(o), 8000, "both pinned again");
            await waitFor(() => mirror(w1, h.id) && mirror(w1, o.id) && !named(w1, h.id) && named(w1, o.id), 8000, "drawn so: the icon alone, then the name");
            assert.strictEqual(optionOn(), true, "the option untouched");
        }
        finally {
            wv._wvTabSessionDoc = JSON.parse(doc0);
            wv._wvTabSessionDoc.activeSessionId = active0;
            await wv._wvTabSessionPersist();
        }
    });
});

// Zotero 9/10: the one library tab is fixed first and never pinned
// (lib/windows.ts wvIsFixedLibraryTab), so the entry is never offered there; the
// option still decides what a library tab's pin would show.
describe("Weavero — Show Tab Name on an older Zotero's fixed library tab", function () {
    this.timeout(60000);
    let wv, win, ZT;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (wvT.nativeWindows()) this.skip();   // version: Zotero 9/10 only (a Zotero with its own windows: the suite above)
        if (typeof wv._wvTabShowsPinName !== "function") wvT.absent("plugin._wvTabShowsPinName");
        win = Zotero.getMainWindow(); ZT = win.Zotero_Tabs;
    });

    it("follows the Settings option, and its menu offers no Show Tab Name", async function () {
        const lib = ZT._tabs.find(t => t && t.id === "zotero-pane");
        assert.ok(lib, "fixture: the library tab");
        assert.isTrue(wv._wvTabShowsPinName(lib), "the option's default: on");
        await wvT.withPref("weavero.pinnedLibraryTabName", false, async () => {
            assert.isFalse(wv._wvTabShowsPinName(lib), "the option off");
        });
        if (typeof ZT._openMenu !== "function") return;
        const el = Array.from(win.document.querySelectorAll('#tab-bar-container .tab[data-id="zotero-pane"]')).find(x => x.getBoundingClientRect().width > 0);
        if (!el) return;
        const r = el.getBoundingClientRect();
        try { ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), "zotero-pane"); } catch (er) {}
        const open = () => Array.from(win.document.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        for (let i = 0; i < 15 && !open().length; i++) await wvT.sleep(100);
        await wvT.sleep(300);
        try {
            // No menu at all on this Zotero's library tab is no entry either.
            for (const p of open()) {
                const mi = Array.from(p.children).find(ch => ch.getAttribute("data-wv-key") === "pinName" && !ch.hidden && win.getComputedStyle(ch).display !== "none");
                assert.notOk(mi, "no Show Tab Name on the fixed library tab");
            }
        }
        finally { for (const p of open()) { try { p.hidePopup(); } catch (er) {} } }
    });
});
