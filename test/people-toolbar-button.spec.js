/* global describe, it, before, after, assert, Zotero, wvT */

// The Researchers button in the collections pane's toolbar (people-toolbar.ts;
// MJT 2026-11-27: "I find that accessing the Researchers tab feature is
// difficult. I propose adding an icon here" -- the collections pane's toolbar --
// then "Ok" to the proposal). Until then File -> Researchers was the only way in.
//   - right after Weavero's Bookmarks button, after New Collection when Bookmarks
//     is off; the Researchers tab's own person in Zotero's accent blue (the tab's
//     and the Info section mark's colour); the tab's name as its tooltip and its
//     accessible name; in every library tab's own collections toolbar (Zotero 11);
//   - a click opens this window's Researchers tab, or selects it; Ctrl/Cmd+click
//     opens it beside the library in a split view, a middle click without leaving
//     the library (Weavero's opening modifiers, lib/keys.ts); Shift+click is the
//     plain open -- the tab is one per window and has no window of its own;
//   - a right-click offers Hide Researchers Button: the pref goes off and the
//     button leaves every main window; the pref on again (Settings) brings it
//     back, live;
//   - Researchers off: no button, whatever the button's own pref says;
//   - the wiring entry's own undo (ADR-0001) leaves no button and no menu; a button
//     of another instance is rebuilt.
// FAILS on 1.3.0-paneorg.4 (no button).

describe("Weavero — the Researchers button in the collections toolbar", function () {
    this.timeout(180000);
    const ID = "wv-pp-tb-button";
    const MENU = "wv-pp-tb-menu";
    const PREF = "weavero.peopleToolbarButton";
    let wv, win, doc, ZT, prevSplit, prevPeople;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    // The collections toolbar of the library view on screen (each library tab has its
    // own on a Zotero with its own windows, ids suffixed past the first).
    const bar = (w) => {
        w = w || win;
        const v = w.ZoteroPane && w.ZoteroPane.libraryView;
        return (v && typeof v.getElement === "function") ? v.getElement("zotero-collections-toolbar") : w.document.getElementById("zotero-collections-toolbar");
    };
    const btnIn = (w) => { const b = bar(w); return b ? b.querySelector(":scope > #" + ID) : null; };
    const allBtns = (w) => Array.from((w || win).document.querySelectorAll("#" + ID));
    const newColl = (w) => bar(w).querySelector(":scope > #zotero-tb-collection-add, :scope > .zotero-tb-collection-add");
    const bmBtn = (w) => bar(w).querySelector(":scope > #wv-bookmarks-toolbar-button");
    const ppTab = () => ZT._tabs.find(t => String(t.type).startsWith("wvpeople")) || null;
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) { try { wv._wvTabSplitSeparate(win, s.id); } catch (e) {} } };
    const accent = () => {
        const blue = win.getComputedStyle(doc.documentElement).getPropertyValue("--accent-blue").trim();
        assert.ok(blue, "fixture: Zotero's accent blue");
        const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        probe.style.color = blue; doc.documentElement.appendChild(probe);
        const want = win.getComputedStyle(probe).color; probe.remove();
        return want;
    };
    const rightClick = (el) => {
        const ev = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, button: 2, screenX: 200, screenY: 200 });
        el.dispatchEvent(ev);
        return ev;
    };
    const openMenu = () => wvT.waitFor(() => { const m = doc.getElementById(MENU); return m && m.state === "open" ? m : null; }, 4000, 50);
    const closeMenu = async () => {
        const m = doc.getElementById(MENU);
        if (m && m.state !== "closed") { try { m.hidePopup(); } catch (e) {} await wvT.waitFor(() => m.state === "closed" || null, 2000, 50); }
    };
    const fresh = async () => {
        separateAll();
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { ZT.select(libTab().id); } catch (e) {}
        await sleep(300);
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvPpTbWire", "_wvPpTbApplyAll", "_wvPpTbCommand", "_wvPpTbRemove", "_wvPeopleTabOpen", "_wvPeopleTabClose",
            "_wvTabSplitOf", "_wvTabSplitSeparate", "_wvMainWires", "_wvUnwireMainEntry", "_wvWireMainEntry"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevPeople = Zotero.Prefs.get("weavero.enablePeople");
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enablePeople", true);
        Zotero.Prefs.set("weavero.enableSplitView", true);
        try { Zotero.Prefs.clear(PREF); } catch (e) {}
        await fresh();
        assert.ok(await wvT.waitFor(() => btnIn(), 8000, 50), "the button, Researchers on");
    });

    after(async function () {
        if (!wv || !doc) return;   // the before hook failed first: nothing to put back
        await closeMenu();
        await fresh();
        try { Zotero.Prefs.clear(PREF); } catch (e) {}
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (e) {}
        try { if (prevPeople === undefined) Zotero.Prefs.clear("weavero.enablePeople"); else Zotero.Prefs.set("weavero.enablePeople", prevPeople); } catch (e) {}
    });

    it("a wiring-table entry of its own, run per library view once the pane's views exist, with its own undo", function () {
        const e = wv._wvMainWires().find(x => x.id === "people-toolbar-button");
        assert.ok(e, "the entry");
        assert.strictEqual(e.on, "both");
        assert.isTrue(!!e.views && !!e.perView, "views + perView: " + JSON.stringify({ views: e.views, perView: e.perView }));
        assert.isFunction(e.unwire, "its undo (ADR-0001): the button and its menu go");
        const ids = wv._wvMainWires().map(x => x.id);
        assert.isAbove(ids.indexOf("people-toolbar-button"), ids.indexOf("bookmarks-toolbar-button"), "after the Bookmarks button's entry");
    });

    it("sits right after Bookmarks, after New Collection; the Researchers tab's person in Zotero's accent blue; the tab's name as its tooltip", async function () {
        const b = btnIn();
        assert.ok(b, "the button");
        assert.strictEqual(b.localName, "toolbarbutton");
        assert.include(b.className, "zotero-tb-button");
        const bm = bmBtn();
        assert.ok(bm, "fixture: Weavero's Bookmarks button (library bookmarks on, the default)");
        assert.strictEqual(bm.nextElementSibling, b, "right after Bookmarks");
        assert.strictEqual(bm.previousElementSibling, newColl(), "which follows New Collection");
        assert.strictEqual(allBtns().length, 1, "one button in the window (one library view)");
        assert.strictEqual(b.getAttribute("tooltiptext"), "Researchers", "the tab's name as the tooltip");
        assert.strictEqual(b.getAttribute("aria-label"), "Researchers", "and the accessible name");
        const cs = win.getComputedStyle(b);
        assert.match(cs.listStyleImage, /^url\("data:image\/svg\+xml,/, "a drawn icon");
        const icon = await wvT.waitFor(() => b.querySelector(".toolbarbutton-icon"), 3000, 50);
        const ics = win.getComputedStyle(icon || b);
        assert.strictEqual(ics.fill, accent(), "Zotero's accent blue, as the tab's icon and the Info section's mark");
        // Without it the picture's context-fill never sees that fill (backlinks.spec.js's
        // annotation icons drew black).
        assert.include(ics.getPropertyValue("-moz-context-properties"), "fill", "the fill reaches the picture");
        // The Researchers tab's own person, filled, drawn to 20 px for the toolbar (the
        // size of Zotero's toolbar icons) and to 16 px for the tab (MJT 2026-11-27,
        // "Larger and filled"; people.ts wvPpSolid). Until then both drew the same
        // outline, and this compared the two pictures for equality.
        const t = wv._wvPeopleTabOpen(win, { select: false });
        assert.ok(t, "the tab");
        const tabIcon = await wvT.waitFor(() => doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"] .tab-icon'), 3000, 50);
        if (tabIcon) {
            const pic = (u) => decodeURIComponent(String(u).replace(/^url\("data:image\/svg\+xml,/, "").replace(/"\)$/, ""));
            const bp = pic(cs.listStyleImage), tp = pic(win.getComputedStyle(tabIcon).backgroundImage);
            assert.include(bp, 'width="20" height="20"', "the button's person at the toolbar's 20 px: " + bp);
            assert.include(tp, 'width="16" height="16"', "the tab's at 16 px: " + tp);
            for (const p of [bp, tp]) assert.match(p, /<g fill="context-fill"><circle [^>]+\/><path [^>]+\/><\/g>/, "the filled person: " + p);
        }
        await fresh();
        if (!doc.hidden) {
            const gap = Math.round(b.getBoundingClientRect().left - bm.getBoundingClientRect().right);
            assert.strictEqual(gap, 8, "the toolbar's 8-px rhythm");
        }
    });

    // Zotero hides New Collection in a collapsed collections pane, as it "may show on
    // top of 'New Item'" (_toolbar.scss); the buttons after it must not show there either.
    it("the collections pane collapsed: the button is not drawn; open again, it is", async function () {
        if (typeof wv._wvCollectionsPaneToggle !== "function") wvT.absent("plugin._wvCollectionsPaneToggle");
        const pane = () => { const v = win.ZoteroPane.libraryView; return (v && typeof v.getElement === "function") ? v.getElement("zotero-collections-pane") : doc.getElementById("zotero-collections-pane"); };
        const drawn = (el) => { const r = el.getBoundingClientRect(); const cs = win.getComputedStyle(el); return cs.visibility === "visible" && cs.display !== "none" && r.width > 0 && r.height > 0; };
        const wasCollapsed = pane().hasAttribute("collapsed");
        try {
            if (!wasCollapsed) wv._wvCollectionsPaneToggle(win);
            assert.ok(await wvT.waitFor(() => pane().hasAttribute("collapsed"), 3000, 50), "collapsed");
            await sleep(150);
            assert.isFalse(drawn(btnIn()), "not drawn: " + JSON.stringify(btnIn().getBoundingClientRect()) + " " + win.getComputedStyle(btnIn()).visibility);
        }
        finally {
            if (pane().hasAttribute("collapsed") !== wasCollapsed) wv._wvCollectionsPaneToggle(win);
        }
        if (!wasCollapsed && !doc.hidden) {
            await sleep(150);
            assert.isTrue(drawn(btnIn()), "drawn again");
        }
    });

    it("a click opens this window's Researchers tab; again, it selects the same tab", async function () {
        await fresh();
        assert.isNull(ppTab(), "no tab to start with");
        btnIn().doCommand();
        const t = await wvT.waitFor(() => (ppTab() && ZT.selectedID === ppTab().id ? ppTab() : null), 5000, 50);
        assert.ok(t, "opened and selected");
        ZT.select(libTab().id); await sleep(300);
        btnIn().doCommand();
        assert.ok(await wvT.waitFor(() => ZT.selectedID === t.id, 5000, 50), "selected again");
        assert.strictEqual(ZT._tabs.filter(x => String(x.type).startsWith("wvpeople")).length, 1, "the same tab, one per window");
        await fresh();
    });

    it("Ctrl/Cmd+click opens it beside the library in a split view; a middle click leaves the library on screen; Shift+click is the plain open", async function () {
        await fresh();
        const mac = !!Zotero.isMac;
        const L = libTab();
        await wv._wvPpTbCommand(win, btnIn(), { button: 0, ctrlKey: !mac, metaKey: mac, shiftKey: false, altKey: false });
        const P = await wvT.waitFor(() => ppTab(), 5000, 50);
        assert.ok(P, "opened");
        const s = await wvT.waitFor(() => wv._wvTabSplitOf(win, P.id), 5000, 50);
        assert.ok(s, "in a split");
        assert.include([s.left, s.right], L.id, "beside the library");
        assert.strictEqual(ZT.selectedID, P.id, "Researchers selected");
        await fresh();
        assert.isNull(ppTab(), "closed again");
        // A middle click: Zotero's toolbar buttons get no command for it -- an auxclick.
        btnIn().dispatchEvent(new win.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
        const P2 = await wvT.waitFor(() => ppTab(), 5000, 50);
        assert.ok(P2, "a middle click opens it");
        assert.strictEqual(ZT.selectedID, L.id, "in the background: the library stays");
        const nWins = Zotero.getMainWindows().length;
        await wv._wvPpTbCommand(win, btnIn(), { button: 0, ctrlKey: false, metaKey: false, shiftKey: true, altKey: false });
        assert.ok(await wvT.waitFor(() => ZT.selectedID === P2.id, 5000, 50), "Shift+click: selected in this window");
        assert.isNotOk(wv._wvTabSplitOf(win, P2.id), "no split");
        assert.strictEqual(Zotero.getMainWindows().length, nWins, "no new window");
        await fresh();
    });

    it("Bookmarks off: right after New Collection; Bookmarks back, it comes before Researchers again", async function () {
        await wvT.withPref("weavero.enableLibraryBookmarks", false, async () => {
            assert.ok(await wvT.waitFor(() => !bmBtn(), 5000, 50), "no Bookmarks button");
            assert.strictEqual(btnIn().previousElementSibling, newColl(), "after New Collection");
            // Built where Bookmarks is absent.
            wv._wvPpTbRemove(win);
            assert.isNull(btnIn(), "gone");
            wv._wvPpTbWire(win);
            assert.ok(btnIn(), "built again");
            assert.strictEqual(btnIn().previousElementSibling, newColl(), "after New Collection");
        });
        assert.ok(await wvT.waitFor(() => bmBtn(), 5000, 50), "Bookmarks back");
        assert.strictEqual(bmBtn().previousElementSibling, newColl(), "New Collection, Bookmarks");
        assert.strictEqual(bmBtn().nextElementSibling, btnIn(), "then Researchers");
    });

    it("right-click -> Hide Researchers Button: the pref off, no button in any main window; the pref on, back in each, live", async function () {
        // Zotero's own new window on Zotero 11, Weavero's on Zotero 9/10 (000-helpers.spec.js).
        const w2 = await wvT.openMainWindow();
        assert.ok(w2, "a second main window");
        try { win.focus(); } catch (e) {}
        try {
            assert.ok(await wvT.waitFor(() => (w2.ZoteroPane && w2.ZoteroPane.itemsView && w2.ZoteroPane.collectionsView && btnIn(w2)) || null, 30000, 150), "the second window has its button");
            const ev = rightClick(btnIn());
            const menu = await openMenu();
            assert.ok(menu, "the right-click opens the button's menu");
            assert.isTrue(ev.defaultPrevented, "and claims the event");
            const items = Array.from(menu.querySelectorAll("menuitem")).filter(x => !x.hidden);
            assert.strictEqual(items.length, 1, "one entry");
            assert.strictEqual(items[0].getAttribute("label"), "Hide Researchers Button");
            items[0].doCommand();
            assert.ok(await wvT.waitFor(() => Zotero.Prefs.get(PREF) === false || null, 5000, 50), "the pref goes off");
            assert.ok(await wvT.waitFor(() => (!allBtns(win).length && !allBtns(w2).length) || null, 5000, 50), "no button in either window");
            await closeMenu();
            wv._wvPpTbWire(w2);
            assert.strictEqual(allBtns(w2).length, 0, "the wiring adds none while the pref is off");
            Zotero.Prefs.set(PREF, true);
            assert.ok(await wvT.waitFor(() => (btnIn(win) && btnIn(w2)) || null, 5000, 50), "back in both windows, without a reload");
            for (const w of [win, w2]) {
                const bm = bmBtn(w);
                assert.strictEqual(btnIn(w).previousElementSibling, bm || newColl(w), "at its place");
            }
        }
        finally {
            await closeMenu();
            try { w2.close(); } catch (e) {}
            await wvT.waitFor(() => !Zotero.getMainWindows().includes(w2) || null, 10000, 100);
            try { win.focus(); } catch (e) {}
            await wvT.settleSecondaryWindows();
        }
    });

    it("Researchers off: no button, whatever the button's own pref says; on again, it is back", async function () {
        await wvT.withPref("weavero.enablePeople", false, async () => {
            assert.ok(await wvT.waitFor(() => !allBtns().length || null, 5000, 50), "gone with Researchers");
            assert.isNull(doc.getElementById("wv-pp-tb-style"), "and its sheet");
            Zotero.Prefs.set(PREF, true);
            wv._wvPpTbWire(win);
            wv._wvPpTbApplyAll();
            assert.strictEqual(allBtns().length, 0, "the button's pref alone brings nothing");
        });
        assert.ok(await wvT.waitFor(() => btnIn(), 5000, 50), "back with Researchers");
        try { Zotero.Prefs.clear(PREF); } catch (e) {}
    });

    it("every library tab's collections toolbar has its own (Zotero 11's library tabs; Zotero 10's one pane)", async function () {
        const T = win.Zotero_Tabs;
        if (!wvT.nativeWindows() || typeof win.ZoteroPane.newLibraryTab !== "function") {
            assert.strictEqual(allBtns().length, 1, "Zotero 10: the one collections pane's");
            return;
        }
        const first = T.selectedID;
        const had = new Set(T._tabs.map(t => t.id));
        await win.ZoteroPane.newLibraryTab();
        const tab = await wvT.waitFor(() => T._tabs.find(t => !had.has(t.id) && String(t.type).startsWith("library")) || null, 10000);
        assert.ok(tab, "a second library tab");
        try {
            T.select(tab.id);
            const view = await wvT.waitFor(() => { const v = win.ZoteroPane.getLibraryView(tab.id); return v && v.loaded && v.collectionsView ? v : null; }, 15000);
            assert.ok(view, "its view");
            const b2 = await wvT.waitFor(() => { const tb = view.getElement("zotero-collections-toolbar"); return tb ? tb.querySelector(":scope > #" + ID) : null; }, 10000, 100);
            assert.ok(b2, "a button in its own toolbar");
            const tb2 = view.getElement("zotero-collections-toolbar");
            const anchor = tb2.querySelector(":scope > #wv-bookmarks-toolbar-button") || tb2.querySelector(":scope > .zotero-tb-collection-add");
            assert.strictEqual(b2.previousElementSibling, anchor, "after Bookmarks there, or New Collection");
            assert.strictEqual(allBtns().length, 2, "one per library tab");
            b2.doCommand();
            assert.ok(await wvT.waitFor(() => ppTab() && T.selectedID === ppTab().id, 5000, 50), "its click opens the window's Researchers tab");
        }
        finally {
            try { T.select(first); } catch (e) {}
            try { T.close(tab.id); } catch (e) {}
            await sleep(500);
            await fresh();
        }
    });

    it("the entry's undo leaves no button and no menu; wired again, it is back; a button of another instance is built again", async function () {
        rightClick(btnIn());
        assert.ok(await openMenu(), "the menu exists");
        await closeMenu();
        assert.isTrue(wv._wvUnwireMainEntry(win, "people-toolbar-button"), "the entry declares its undo");
        assert.strictEqual(allBtns().length, 0, "no button");
        assert.isNull(doc.getElementById(MENU), "no menu");
        assert.isNull(doc.getElementById("wv-pp-tb-style"), "no sheet");
        assert.isTrue(wv._wvWireMainEntry(win, "people-toolbar-button"), "wired again, as the table does");
        const b = btnIn();
        assert.ok(b, "the wiring brings it back");
        assert.strictEqual(b.previousElementSibling, bmBtn() || newColl(), "in its place");
        b.setAttribute("data-wv-tag", "another-instance");
        wv._wvPpTbWire(win);
        assert.notStrictEqual(btnIn(), b, "replaced");
        assert.strictEqual(allBtns().length, 1, "one button");
        // The same instance again: nothing moves.
        const same = btnIn();
        wv._wvPpTbWire(win);
        assert.strictEqual(btnIn(), same, "idempotent");
    });
});
