/* global describe, it, before, beforeEach, after, assert, Zotero, Services, wvT */

// Lock item-pane sections at the bottom (src/modules/pane-lock.ts; MJT
// 2026-11-22: "I want to be able to lock the content of a pane at the bottom
// of the item pane, with fixed height ... In the feeds, the relevance card
// would appear locked as default"; his picks: a padlock in every section's
// header and "Lock at Bottom" / "Unlock" in the side navigation's menu, a
// divider to resize a locked section, its height remembered per section, per
// view -- library items, feed items, a reader's item pane -- and Why relevant
// locked in the feeds from the start; then "Allow multiple sections with Lock
// at Bottom": several stack at the bottom in the side navigation's order,
// shrunk in proportion when they do not fit, and Weavero's standalone reader
// window's pane is covered too, "Also cover"). Zotero's sections are not
// moved: CSS keeps the locked ones at the bottom of the scroller (order last,
// sticky, fixed heights, their bodies scrolling). Written before the code.
// Then (branch locktop, MJT 2026-11-22): "Also provide an option to lock at the
// top. Top or bottom should be distinguished by the position of the lock in the
// sidenav: top right or bottom right" -- Lock at Top in both menus, the stack at
// the top first in the column with its divider at its bottom edge, one height
// per section whatever the end, stored as "top:<id>"; Zotero's scroll and pin
// land below the stack. Its cases written before the code too.

describe("Weavero — lock item-pane sections at the bottom", function () {
    this.timeout(300000);
    let wv, win, doc, ZP, P, A, A2, feed = null, F1 = null;
    const KEYS = ["weavero.paneLock.library", "weavero.paneLock.feed", "weavero.paneLock.reader", "weavero.paneLock.heights"];
    const saved = {};
    const LONG = Array.from({ length: 80 }, (_, i) => "WVLOCK abstract line " + (i + 1) + " with enough words to wrap in a narrow item pane.").join(" ");

    const iv = () => ZP.itemsView;
    /** The library's item pane (a library tab's own on a Zotero with library tabs). */
    const libDet = () => (ZP.itemPane && ZP.itemPane.querySelector && ZP.itemPane.querySelector("item-details")) || doc.querySelector("#zotero-item-pane item-details");
    const pp = (det) => det._paneParent;
    /** The locked sections, in their order in the scroller. */
    const lockedAll = (det) => Array.from(pp(det).querySelectorAll(":scope > .wv-panelock-locked"));
    const lockedOf = (det) => lockedAll(det)[0] || null;
    const lockPref = (view) => JSON.parse(String(Zotero.Prefs.get("weavero.paneLock." + view)));
    /** A section's padlock: a LOCKED section's alone (MJT 2026-11-22: "Just put
     *  the closed padlock and no open padlock"). */
    const btnOf = (det, id) => {
        const p = det.getEnabledPane(id);
        return p && p.querySelector(":scope > collapsible-section > .head > .wv-panelock-btn");
    };
    /** A section's own right-click menu (collapsibleSection.js _buildContextMenu:
     *  Pin Section / Unpin Section, Collapse Other Sections, ...). */
    const headMenu = (det, id) => {
        const p = det.getEnabledPane(id);
        const sec = p && p.querySelector(":scope > collapsible-section");
        return (sec && (sec._contextMenu || sec.querySelector(":scope > .head menupopup"))) || null;
    };
    /** Its menu opened (popupshowing), then Lock at Bottom ("lock") or Unlock ("unlock")
     *  chosen ("The ability to pin or unpin is also in the section header. Do the
     *  same for the lock / unlock", MJT 2026-11-22). */
    const headAct = (det, id, act) => {
        const m = headMenu(det, id);
        assert.isOk(m, id + ": its header menu");
        const w = m.ownerDocument.defaultView;
        m.dispatchEvent(new w.Event("popupshowing"));
        const mi = m.querySelector(":scope > .wv-panelock-hmi-" + act);
        assert.isOk(mi, id + ": " + act + " in its header menu");
        assert.isFalse(mi.hidden, id + ": " + act + " shown");
        mi.dispatchEvent(new w.Event("command"));
    };
    const offBottom = (det, el) => el.getBoundingClientRect().bottom - pp(det).getBoundingClientRect().bottom;
    const atBottom = (det, el) => Math.abs(offBottom(det, el)) <= 1.5;
    /** Each section locked at the bottom ends where the next begins; the last at the scroller's bottom. */
    const stacked = (det) => {
        const ls = lockedAll(det).filter((p) => !p.classList.contains("wv-panelock-top"));
        for (let i = 0; i + 1 < ls.length; i++) {
            if (Math.abs(ls[i].getBoundingClientRect().bottom - ls[i + 1].getBoundingClientRect().top) > 1.5) return false;
        }
        return ls.length > 0 && atBottom(det, ls[ls.length - 1]);
    };
    /** The sections whose side-navigation button carries the padlock mark at
     *  its bottom end (locked at the bottom) / at its top end (at the top). */
    const snMarked = (det) => Array.from(det.sidenav.querySelectorAll(".pin-wrapper.wv-panelock-sn"))
        .map((w) => { const b = w.querySelector(".btn[data-pane]"); return b ? b.dataset.pane : "?"; });
    const snMarkedTop = (det) => Array.from(det.sidenav.querySelectorAll(".pin-wrapper.wv-panelock-sn-top"))
        .map((w) => { const b = w.querySelector(".btn[data-pane]"); return b ? b.dataset.pane : "?"; });
    /** What the mark's pseudo-element draws on a section's button (Zotero's pin mark's box). */
    const snMark = (det, id) => {
        const w = det.sidenav.querySelector('.btn[data-pane="' + id + '"]').parentElement;
        return w.ownerDocument.defaultView.getComputedStyle(w, "::after");
    };
    /** The sections locked at the top, in their order in the scroller. */
    const lockedTop = (det) => Array.from(pp(det).querySelectorAll(":scope > .wv-panelock-locked.wv-panelock-top"));
    const lockedBottom = (det) => lockedAll(det).filter((p) => !p.classList.contains("wv-panelock-top"));
    const offTop = (det, el) => el.getBoundingClientRect().top - pp(det).getBoundingClientRect().top;
    const atTop = (det, el) => Math.abs(offTop(det, el)) <= 1.5;
    /** The top stack's height: its bottom edge, from the scroller's top. */
    const topStackH = (det) => lockedTop(det).reduce((s, p) => s + p.getBoundingClientRect().height, 0);
    /** Each section locked at the top ends where the next begins; the first at the scroller's top. */
    const stackedTop = (det) => {
        const ls = lockedTop(det);
        for (let i = 0; i + 1 < ls.length; i++) {
            if (Math.abs(ls[i].getBoundingClientRect().bottom - ls[i + 1].getBoundingClientRect().top) > 1.5) return false;
        }
        return ls.length > 0 && atTop(det, ls[0]);
    };
    const geo = (det) => lockedAll(det).map((p) => p.dataset.pane + (p.classList.contains("wv-panelock-top") ? "^" : "v") + " "
        + Math.round(offTop(det, p)) + "+" + Math.round(p.getBoundingClientRect().height)).join(", ");
    /** A press on `el`'s divider at (x, y), a move by `dy`, a release (`w`: its window). */
    const dragBy = (w, el, x, y, dy) => {
        const d = w.document.documentElement;
        el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
        d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y + dy / 2 }));
        d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y + dy }));
        d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y + dy }));
    };
    const clearPrefs = () => { for (const k of KEYS) { try { Zotero.Prefs.clear(k); } catch (e) {} } };
    const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res(null) : win.requestAnimationFrame(f)); win.requestAnimationFrame(f); });
    async function showLibraryItem(item) {
        const cv = ZP.collectionsView;
        if (!(iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].isLibrary && iv().collectionTreeRows[0].isLibrary())) {
            await cv.selectByID("L" + Zotero.Libraries.userLibraryID);
            await iv().waitForLoad();
        }
        await ZP.selectItems([item.id]);
        const det = await wvT.waitFor(() => { const d = libDet(); return d && d.item && d.item.id === item.id && pp(d).clientHeight && d.getEnabledPane("tags") ? d : null; }, 15000);
        if (!det) assert.fail("the library's item pane shows " + item.id + ": " + showDiag(item));
        await frames(3);
        return det;
    }
    /** What the library's item pane shows instead (Zotero 10's intermittent
     *  15-s timeout here in long batteries, 2026-11-22). */
    function showDiag(item) {
        const o = {};
        try {
            const d = libDet();
            o.detItem = d && d.item ? d.item.id : null;
            o.ppH = d ? pp(d).clientHeight : null;
            o.tags = !!(d && d.getEnabledPane("tags"));
            o.selected = ZP.getSelectedItems().map((i) => i.id);
            o.row = iv().getRowIndexByID(item.id);
            o.rows = iv().rowCount;
            o.ctr = iv().collectionTreeRow && iv().collectionTreeRow.id;
            o.tab = win.Zotero_Tabs && win.Zotero_Tabs.selectedID;
            o.itemPaneCollapsed = !!(ZP.itemPane && ZP.itemPane.collapsed);
            o.itemPaneMode = ZP.itemPane && ZP.itemPane.mode;
            o.search = ZP.itemsView && ZP.itemsView._searchMode;
            o.qs = (doc.getElementById("zotero-tb-search") || {}).value;
        } catch (e) { o.err = String(e); }
        return JSON.stringify(o);
    }
    /** A locked section's state when it is not at the height it should be
     *  (Zotero 10, 2026-11-22: Attachments at 85.67 px instead of 200). Then a
     *  no-op change of its live collapsible-section's `empty` (does the lock's
     *  observer see that section?), then a whole apply. */
    async function lockDiag(det, p) {
        const o = {};
        try {
            const sec = p.querySelector(":scope > collapsible-section");
            o.cls = p.className;
            o.h = p.getBoundingClientRect().height;
            o.open = sec ? sec.open : "no section";
            o.openAttr = sec ? sec.hasAttribute("open") : null;
            o.empty = sec ? sec.hasAttribute("empty") : null;
            o.inPP = p.parentElement === pp(det);
            o.ids = wv._wvPaneLockLockedIDs(det);
            if (sec) { const e = sec.hasAttribute("empty"); sec.toggleAttribute("empty", !e); sec.toggleAttribute("empty", e); }
            await frames(3);
            o.afterPoke = p.className + " " + p.getBoundingClientRect().height;
            wv._wvPaneLockApplyAll();
            await frames(3);
            o.afterApply = p.className + " " + p.getBoundingClientRect().height;
        } catch (e) { o.err = String(e); }
        return JSON.stringify(o);
    }
    async function makeFeed() {
        const f = /** @type {any} */ (new Zotero.Feed());
        f.name = "WV-TEST pane lock feed";
        f.description = "";
        f.url = "https://wv-panelock-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
        f.refreshInterval = 24 * 60;
        f.cleanupReadAfter = 60;
        f.cleanupUnreadAfter = 90;
        await f.saveTx();
        return f;
    }
    async function showFeedItem() {
        const cv = ZP.collectionsView;
        const id = "L" + feed.libraryID;
        assert.ok(await wvT.waitFor(() => cv.getRowIndexByID(id) !== false, 15000, 100), "the feed's row");
        await cv.selectByID(id);
        await iv().waitForLoad();
        await iv().selectItem(F1.id);
        const det = await wvT.waitFor(() => {
            const d = libDet();
            const s = d && d.item && d.item.id === F1.id && wv._wvFdSecKey && d.getEnabledPane(wv._wvFdSecKey);
            return s ? d : null;
        }, 15000, 100);
        assert.isOk(det, "a feed item, its Why relevant section shown");
        await frames(3);
        return det;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvPaneLockWire", "_wvPaneLockDestroy", "_wvPaneLockApplyAll", "_wvPaneLockToggle", "_wvPaneLockMenuAct",
            "_wvPaneLockLockedIDs", "_wvPaneLockView", "_wvPaneLockMigrate", "_wvPaneLockSet", "_wvPaneLockPos"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        const B = Services.prefs.getBranch("extensions.zotero.");
        for (const k of KEYS) saved[k] = B.prefHasUserValue(k) ? Zotero.Prefs.get(k) : undefined;
        clearPrefs();
        P = await wvT.createItem("journalArticle", { title: "WVLOCK paper", abstractNote: LONG });
        A = await wvT.createTestPDFItem("wvlock-pdf", { parentItemID: P.id });
        A2 = await wvT.createTestPDFItem("wvlock-pdf-window", { parentItemID: P.id });
        feed = await makeFeed();
        F1 = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
        F1.libraryID = feed.libraryID;
        F1.guid = "wv-panelock-" + Zotero.Utilities.randomString();
        F1.setField("title", "WVLOCK feed item about drops");
        F1.setField("abstractNote", "Drops impacting a pool.");
        await F1.saveTx();
        wv._wvPaneLockApplyAll();
    });

    // Each case from no lock (a failed one would leave its sections locked for the next).
    beforeEach(function () {
        for (const v of ["library", "feed", "reader"]) { try { Zotero.Prefs.clear("weavero.paneLock." + v); } catch (e) {} }
        try { wv._wvPaneLockApplyAll(); } catch (e) {}
    });

    after(async function () {
        clearPrefs();
        for (const k of KEYS) { if (saved[k] !== undefined) { try { Zotero.Prefs.set(k, saved[k]); } catch (e) {} } }
        try { wv._wvPaneLockApplyAll(); } catch (e) {}
        try { await ZP.collectionsView.selectByID("L" + Zotero.Libraries.userLibraryID); } catch (e) {}
        try { if (feed) await feed.eraseTx(); } catch (e) {}
        await wvT.erase(A, A2, P);
    });

    it("every section's header menu has Lock at Bottom / Unlock after Pin / Unpin Section; the padlock, closed, on a locked section's header alone, before the twisty", async function () {
        const det = await showLibraryItem(P);
        const panes = det.getEnabledPanes().filter((p) => p.querySelector(":scope > collapsible-section > .head"));
        assert.isAtLeast(panes.length, 6, "the regular item's sections");
        const ids = panes.map((p) => p.dataset.pane);
        for (const id of ["info", "abstract", "attachments", "notes", "tags", "related"]) assert.include(ids, id);
        assert.isOk(ids.some((id) => /weavero/.test(id)), "a Weavero section among them: " + ids.join(", "));
        assert.strictEqual(pp(det).querySelectorAll(".wv-panelock-btn").length, 0, "nothing locked: no padlock at all");
        for (const p of panes) {
            const id = p.dataset.pane;
            const m = headMenu(det, id);
            assert.isOk(m, id + ": Zotero's header menu");
            const lockTop = m.querySelector(":scope > .wv-panelock-hmi-lock-top");
            const lock = m.querySelector(":scope > .wv-panelock-hmi-lock"), unlock = m.querySelector(":scope > .wv-panelock-hmi-unlock");
            assert.isOk(lockTop && lock && unlock, id + ": the three entries");
            assert.strictEqual(lock.getAttribute("data-wv-owned"), "panelock", "marked as Weavero's");
            assert.strictEqual(lockTop.getAttribute("data-wv-owned"), "panelock", "marked as Weavero's");
            const unpin = m.querySelector(":scope > .zotero-menuitem-unpin");
            if (unpin) assert.strictEqual(unpin.nextElementSibling, lockTop, id + ": right after Zotero's Unpin Section");
            assert.strictEqual(lockTop.nextElementSibling, lock, id + ": Lock at Top, then Lock at Bottom");
            assert.strictEqual(lock.nextElementSibling, unlock, id + ": then Unlock");
            assert.strictEqual(lockTop.getAttribute("data-l10n-id"), "weavero-panelock-menu-lock-top");
            assert.strictEqual(lock.getAttribute("data-l10n-id"), "weavero-panelock-menu-lock");
            assert.strictEqual(unlock.getAttribute("data-l10n-id"), "weavero-panelock-menu-unlock");
            assert.strictEqual(unlock.getAttribute("image"), lock.getAttribute("image"), id + ": one padlock, the closed one, for both");
            assert.strictEqual(lockTop.getAttribute("image"), lock.getAttribute("image"), id + ": and for Lock at Top");
            m.dispatchEvent(new win.Event("popupshowing"));
            assert.isFalse(lockTop.hidden, id + ": Lock at Top shown");
            assert.isFalse(lock.hidden, id + ": Lock at Bottom shown");
            assert.isTrue(unlock.hidden, id + ": Unlock hidden");
        }
        assert.strictEqual(headMenu(det, "tags").querySelector(":scope > .wv-panelock-hmi-lock").getAttribute("label"), "Lock at Bottom");
        assert.strictEqual(headMenu(det, "tags").querySelector(":scope > .wv-panelock-hmi-lock-top").getAttribute("label"), "Lock at Top");
        // Locked from its header menu: its padlock appears.
        headAct(det, "tags", "lock");
        const tags = det.getEnabledPane("tags");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === tags && btnOf(det, "tags"), 3000, 30), "Tags locked from its header menu, its padlock drawn");
        const b = btnOf(det, "tags");
        const tw = b.parentNode.querySelector(":scope > .twisty");
        if (tw) assert.strictEqual(b.nextElementSibling, tw, "right before the twisty");
        assert.strictEqual(b.getAttribute("data-wv-owned"), "panelock", "marked as Weavero's");
        assert.strictEqual(b.getAttribute("data-l10n-id"), "weavero-panelock-button-unlock", "its tooltip says Unlock");
        const img = headMenu(det, "tags").querySelector(":scope > .wv-panelock-hmi-lock").getAttribute("image");
        const lsi = win.getComputedStyle(b).listStyleImage;
        assert.ok(lsi.includes(img) || decodeURIComponent(lsi).includes(decodeURIComponent(img)), "the closed padlock: " + lsi.slice(0, 90));
        assert.strictEqual(pp(det).querySelectorAll(".wv-panelock-btn").length, 1, "the unlocked sections have none");
        const m = headMenu(det, "tags");
        m.dispatchEvent(new win.Event("popupshowing"));
        assert.isTrue(m.querySelector(":scope > .wv-panelock-hmi-lock").hidden, "Lock at Bottom hidden for the locked section");
        assert.isFalse(m.querySelector(":scope > .wv-panelock-hmi-lock-top").hidden, "Lock at Top shown: it moves the section");
        assert.isFalse(m.querySelector(":scope > .wv-panelock-hmi-unlock").hidden, "Unlock shown");
        // Unlocked from its header menu: the padlock goes.
        headAct(det, "tags", "unlock");
        assert.ok(await wvT.waitFor(() => !lockedOf(det) && !btnOf(det, "tags"), 3000, 30), "unlocked, its padlock gone");
    });

    it("Lock at Bottom locks a section at the scroller's visible bottom, at its height, while the pane scrolls; its padlock unlocks it, Zotero's layout back", async function () {
        const det = await showLibraryItem(P);
        const sc = pp(det);
        const abs = det.getEnabledPane("abstract");
        const before = { pos: win.getComputedStyle(abs).position, order: win.getComputedStyle(abs).order };
        headAct(det, "abstract", "lock");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs, 3000, 30), "Abstract locked");
        assert.deepEqual(lockPref("library"), ["abstract"], "the library view's list");
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["abstract"]);
        await frames(3);
        const cs = win.getComputedStyle(abs);
        assert.strictEqual(cs.position, "sticky");
        assert.approximately(abs.getBoundingClientRect().height, 200, 1.5, "the default height");
        assert.strictEqual(btnOf(det, "abstract").getAttribute("data-l10n-id"), "weavero-panelock-button-unlock", "its padlock now says Unlock");
        const max = sc.scrollHeight - sc.clientHeight;
        assert.isAbove(max, 100, "the pane scrolls (the long abstract): " + max);
        for (const st of [0, Math.round(max / 3), Math.round(max / 2), max]) {
            sc.scrollTop = st;
            await frames(2);
            assert.ok(atBottom(det, abs), "at the visible bottom at scrollTop " + st + ": " + offBottom(det, abs));
        }
        // Zotero's own spacer past the last section (a sidenav click on Related):
        // still at the bottom, never floating above blank space.
        await det.scrollToPane("related", "instant");
        await frames(3);
        assert.ok(atBottom(det, abs), "at the bottom with Zotero's spacer: " + offBottom(det, abs));
        // Its own content scrolls inside it.
        const body = abs.querySelector(":scope > collapsible-section > :not(.head)");
        assert.strictEqual(win.getComputedStyle(body).overflowY, "auto", "the body scrolls");
        assert.isAbove(body.scrollHeight, body.clientHeight + 20, "longer than the locked height");
        // The last section is reachable above it.
        sc.scrollTop = sc.scrollHeight;
        await frames(2);
        const last = det.getEnabledPanes().filter((p) => p !== abs && p.getBoundingClientRect().height > 0).pop();
        assert.isAtMost(last.getBoundingClientRect().bottom, abs.getBoundingClientRect().top + 1.5, "the last section ends above the locked one: " + last.dataset.pane);
        click(btnOf(det, "abstract"));
        assert.ok(await wvT.waitFor(() => !lockedOf(det) && !btnOf(det, "abstract"), 3000, 30), "unlocked, its padlock gone");
        assert.deepEqual(lockPref("library"), [], "the list emptied");
        await frames(2);
        assert.strictEqual(win.getComputedStyle(abs).position, before.pos, "Zotero's position");
        assert.strictEqual(win.getComputedStyle(abs).order, before.order, "Zotero's order");
        for (const v of ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"]) assert.strictEqual(abs.style.getPropertyValue(v), "", "no " + v + " left");
        assert.isBelow(abs.getBoundingClientRect().top, det.getEnabledPane("attachments").getBoundingClientRect().top, "Abstract back above Attachments");
    });

    it("the side navigation's menu has Lock at Bottom / Unlock next to Pin / Unpin Section", async function () {
        const det = await showLibraryItem(P);
        const sn = det.sidenav;
        assert.isOk(sn, "the item pane's side navigation");
        const popup = sn.querySelector("menupopup.context-menu");
        assert.isOk(popup, "Zotero's sidenav menu");
        const lockTop = popup.querySelector(":scope > .wv-panelock-mi-lock-top");
        const lock = popup.querySelector(":scope > .wv-panelock-mi-lock");
        const unlock = popup.querySelector(":scope > .wv-panelock-mi-unlock");
        assert.isOk(lockTop && lock && unlock, "the three entries");
        const unpin = popup.querySelector(":scope > .zotero-menuitem-unpin");
        if (unpin) assert.strictEqual(unpin.nextElementSibling, lockTop, "right after Zotero's Unpin Section");
        assert.strictEqual(lockTop.nextElementSibling, lock, "Lock at Top, then Lock at Bottom");
        assert.strictEqual(lock.nextElementSibling, unlock, "then Unlock");
        assert.strictEqual(lockTop.getAttribute("data-l10n-id"), "weavero-panelock-menu-lock-top");
        assert.strictEqual(lock.getAttribute("data-l10n-id"), "weavero-panelock-menu-lock");
        assert.strictEqual(unlock.getAttribute("data-l10n-id"), "weavero-panelock-menu-unlock");
        assert.strictEqual(lockTop.getAttribute("label"), "Lock at Top");
        assert.strictEqual(lock.getAttribute("label"), "Lock at Bottom");
        assert.strictEqual(unlock.getAttribute("label"), "Unlock");
        assert.strictEqual(unlock.getAttribute("image"), lock.getAttribute("image"), "the closed padlock for both");
        assert.strictEqual(lockTop.getAttribute("image"), lock.getAttribute("image"), "and for Lock at Top");
        const show = (id) => { sn._contextMenuTarget = id; popup.dispatchEvent(new win.Event("popupshowing")); };
        show("tags");
        assert.isFalse(lockTop.hidden, "Lock at Top shown for an unlocked section");
        assert.isFalse(lock.hidden, "Lock at Bottom shown for an unlocked section");
        assert.isTrue(unlock.hidden, "Unlock hidden");
        wv._wvPaneLockMenuAct(sn, "lock");
        const tags = det.getEnabledPane("tags");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === tags, 3000, 30), "Tags locked from the menu");
        await frames(3);
        assert.ok(atBottom(det, tags), "at the bottom: " + offBottom(det, tags));
        show("tags");
        assert.isTrue(lock.hidden, "Lock at Bottom hidden for the locked section");
        assert.isFalse(lockTop.hidden, "Lock at Top shown: it moves the section");
        assert.isFalse(unlock.hidden, "Unlock shown");
        show("related");
        assert.isFalse(lock.hidden, "another section: Lock at Bottom");
        show("tags");
        wv._wvPaneLockMenuAct(sn, "unlock");
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30), "unlocked from the menu");
    });

    it("several sections lock at once: stacked at the bottom in the side navigation's order, shrunk in proportion when they do not fit; unlocking one leaves the others", async function () {
        Zotero.Prefs.clear("weavero.paneLock.heights");
        const det = await showLibraryItem(P);
        const abs = det.getEnabledPane("abstract"), att = det.getEnabledPane("attachments");
        headAct(det, "attachments", "lock");
        headAct(det, "abstract", "lock");
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 2, 3000, 30), "two locked");
        await frames(3);
        // The scroller's order (Abstract before Attachments), whatever the order of the clicks.
        assert.deepEqual(lockedAll(det), [abs, att], "in the side navigation's order");
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["abstract", "attachments"]);
        assert.sameMembers(lockPref("library"), ["abstract", "attachments"], "both in the view's list");
        assert.ok(stacked(det), "stacked, the last at the bottom: " + lockedAll(det).map((p) => p.dataset.pane + " " + Math.round(p.getBoundingClientRect().top) + "-" + Math.round(p.getBoundingClientRect().bottom)).join(", "));
        const ch = pp(det).getBoundingClientRect().height;
        const room = ch - 40;
        if (400 <= room) {
            // (Attachments draws its rows a moment after the item: until then Zotero
            // marks the section empty, drawn as its header alone.)
            const at200 = (el) => Math.abs(el.getBoundingClientRect().height - 200) <= 1.5;
            if (!(await wvT.waitFor(() => at200(abs) && at200(att) && stacked(det), 3000, 50))) {
                assert.fail("both at their height: " + abs.getBoundingClientRect().height + ", " + att.getBoundingClientRect().height
                    + "; abstract " + (await lockDiag(det, abs)) + "; attachments " + (await lockDiag(det, att)));
            }
        }
        for (const st of [0, pp(det).scrollHeight]) {
            pp(det).scrollTop = st;
            await frames(2);
            assert.ok(stacked(det), "stacked at scrollTop " + st);
        }
        assert.strictEqual(btnOf(det, "abstract").getAttribute("data-l10n-id"), "weavero-panelock-button-unlock");
        assert.strictEqual(btnOf(det, "attachments").getAttribute("data-l10n-id"), "weavero-panelock-button-unlock");
        // The side navigation marks them as Zotero marks the pinned section, with a padlock.
        assert.sameMembers(snMarked(det), ["abstract", "attachments"], "the two buttons marked");
        // The locked tab's gold padlock ("Use the same lock as the locked tab icon"),
        // alone -- not on Zotero's blue pin round -- at the button's BOTTOM end
        // (locked at the bottom; Zotero's pin mark keeps the top end).
        const mk = snMark(det, "abstract");
        assert.include(mk.backgroundImage, "data:image/svg+xml", "the padlock drawn in the mark");
        assert.include(decodeURIComponent(mk.backgroundImage), "#f5b30f", "the locked tab's gold padlock");
        assert.strictEqual(mk.width, "12px", "Zotero's mark size");
        assert.strictEqual(mk.backgroundColor, "rgba(0, 0, 0, 0)", "no round under it");
        assert.strictEqual(mk.bottom, "1px", "at the bottom end");
        assert.isAbove(parseFloat(mk.top), 1, "not at the top end, where Zotero's pin mark sits: top " + mk.top);
        assert.strictEqual(snMark(det, "info").backgroundImage, "none", "an unlocked section's button unmarked");
        // Four at 200 px each in a pane that holds less: in proportion, the room above kept.
        wv._wvPaneLockToggle(det, "info");
        wv._wvPaneLockToggle(det, "libraries-collections");
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 4, 3000, 30), "four locked");
        await frames(3);
        // Settled: no section drawn header-only for a moment (see above).
        await wvT.waitFor(() => !lockedAll(det).some((p) => p.classList.contains("wv-panelock-closed")) && stacked(det), 3000, 50);
        const ls = lockedAll(det);
        assert.deepEqual(ls.map((p) => p.dataset.pane), ["info", "abstract", "attachments", "libraries-collections"]);
        assert.ok(stacked(det), "stacked: " + ls.map((p) => p.dataset.pane + " " + Math.round(p.getBoundingClientRect().top) + "-" + Math.round(p.getBoundingClientRect().bottom)).join(", "));
        const total = ls.reduce((s, p) => s + p.getBoundingClientRect().height, 0);
        assert.isAtMost(total, room + 2, "together within the pane less the room kept above (" + total + " of " + ch + ")");
        if (800 > room) {
            const hs = ls.map((p) => p.getBoundingClientRect().height);
            assert.isAtMost(Math.max(...hs) - Math.min(...hs), 2, "the same remembered heights shrink alike: " + hs.join(", "));
        }
        assert.isAtLeast(ls[0].getBoundingClientRect().top - pp(det).getBoundingClientRect().top, 40 - 2, "room kept above");
        // Unlocking one leaves the others, stacked again.
        click(btnOf(det, "attachments"));
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 3 && !att.classList.contains("wv-panelock-locked"), 3000, 30), "three left");
        await frames(3);
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["info", "abstract", "libraries-collections"]);
        assert.sameMembers(snMarked(det), ["info", "abstract", "libraries-collections"], "the marks follow");
        assert.ok(stacked(det), "the others stacked");
        assert.isNull(btnOf(det, "attachments"), "Attachments' padlock gone");
        for (const v of ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"]) assert.strictEqual(att.style.getPropertyValue(v), "", "Attachments: no " + v);
        for (const id of ["info", "abstract", "libraries-collections"]) wv._wvPaneLockToggle(det, id);
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30), "all unlocked");
        assert.deepEqual(lockPref("library"), []);
        assert.deepEqual(snMarked(det), [], "no mark left");
    });

    it("Pin Section unlocks that locked section only and pins it; locking a pinned section unpins it; a sidenav click on a locked one scrolls nothing", async function () {
        const det = await showLibraryItem(P);
        const pin0 = det.pinnedPane || "";
        try {
            det.pinnedPane = "";
            wv._wvPaneLockToggle(det, "tags");
            wv._wvPaneLockToggle(det, "abstract");
            assert.ok(await wvT.waitFor(() => lockedAll(det).length === 2, 3000, 30), "Abstract and Tags locked");
            // A click on its sidenav icon: Zotero's scrollToPane, which would
            // scroll a sticky section into blank space.
            pp(det).scrollTop = 0;
            await frames(2);
            const min0 = pp(det).style.getPropertyValue("--min-scroll-height");
            await det.scrollToPane("tags", "smooth");
            await wvT.sleep(300);
            assert.strictEqual(pp(det).scrollTop, 0, "nothing scrolled");
            assert.strictEqual(pp(det).style.getPropertyValue("--min-scroll-height"), min0, "no spacer added");
            // Pin Section on it (the side navigation sets its container's pin).
            det.sidenav.pinnedPane = "tags";
            assert.ok(await wvT.waitFor(() => !det.getEnabledPane("tags").classList.contains("wv-panelock-locked"), 3000, 30), "pinning unlocked Tags");
            assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["abstract"], "Abstract still locked");
            assert.deepEqual(lockPref("library"), ["abstract"], "only Tags left the list");
            assert.strictEqual(det.pinnedPane, "tags", "the pin kept");
            assert.deepEqual(snMarked(det), ["abstract"], "Tags' button carries Zotero's pin mark, not the padlock");
            assert.isTrue(det.sidenav.querySelector('.btn[data-pane="tags"]').parentElement.classList.contains("pinned"), "Zotero's pinned mark");
            const top = () => det.getEnabledPane("tags").getBoundingClientRect().top - pp(det).getBoundingClientRect().top;
            assert.ok(await wvT.waitFor(() => Math.abs(top()) <= 1.5, 5000, 50), "the pinned section scrolled to the top: " + top());
            // Zotero's spacer floor for the pin, measured again once the section is
            // back in its place: measured while it was drawn at the bottom it was
            // about a pane's height off (~1000 px here). Not to the pixel: a section
            // above may change height after the measure (Zotero's own late growth,
            // 35 px on Zotero 10, 2026-11-22).
            if (typeof det._getMinScrollHeightForPane === "function" && typeof det._pinnedPaneMinScrollHeight === "number") {
                assert.approximately(det._pinnedPaneMinScrollHeight, det._getMinScrollHeightForPane(det.getEnabledPane("tags")), 150, "the pin's spacer floor, measured where the section is");
            }
            // Locking the pinned section (its header menu) unpins it.
            headAct(det, "tags", "lock");
            assert.ok(await wvT.waitFor(() => wv._wvPaneLockLockedIDs(det).includes("tags"), 3000, 30), "locked");
            assert.strictEqual(det.pinnedPane || "", "", "and unpinned");
            // A pin and locks on other sections live together.
            det.sidenav.pinnedPane = "related";
            await wvT.sleep(300);
            assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["abstract", "tags"], "both still locked with Related pinned");
            wv._wvPaneLockToggle(det, "tags");
            wv._wvPaneLockToggle(det, "abstract");
            assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
        }
        finally {
            try { det.pinnedPane = pin0; } catch (e) {}
        }
    });

    // (Sections with content: the paper has no tag, and Zotero draws an EMPTY
    // section -- Tags, Related here -- as a collapsed one, its header alone.)
    it("each divider: a drag resizes its section, its height is kept per section and used again", async function () {
        Zotero.Prefs.set("weavero.paneLock.heights", JSON.stringify({ abstract: 150 }));
        const det = await showLibraryItem(P);
        wv._wvPaneLockToggle(det, "abstract");
        const abs = det.getEnabledPane("abstract");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs, 3000, 30), "Abstract locked");
        await frames(3);
        assert.approximately(abs.getBoundingClientRect().height, 150, 1.5, "the stored height");
        assert.ok(atBottom(det, abs), "at the bottom");
        // The divider is the section's top edge: a press there, a move up 60 px, a release.
        const r = abs.getBoundingClientRect();
        const y0 = r.top + 2, x = r.left + r.width / 2;
        abs.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y0 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y0 - 30 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y0 - 60 }));
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 210, 1.5, "follows the drag");
        assert.ok(atBottom(det, abs), "still at the bottom while dragged: " + offBottom(det, abs));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y0 - 60 }));
        await frames(2);
        assert.strictEqual(JSON.parse(String(Zotero.Prefs.get("weavero.paneLock.heights"))).abstract, 210, "remembered for Abstract");
        // A press below the divider is the section's own (no drag).
        const r2 = abs.getBoundingClientRect();
        abs.querySelector(":scope > collapsible-section > .head").dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: r2.top + 20 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: r2.top - 80 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: r2.top - 80 }));
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 210, 1.5, "a press on the header resizes nothing");
        // Never taller than the pane leaves room for.
        const r3 = abs.getBoundingClientRect();
        abs.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: r3.top + 2 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: r3.top - 5000 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: r3.top - 5000 }));
        await frames(2);
        assert.isBelow(abs.getBoundingClientRect().height, pp(det).getBoundingClientRect().height, "clamped below the pane's height");
        assert.ok(atBottom(det, abs), "and still at the bottom: " + offBottom(det, abs));
        Zotero.Prefs.set("weavero.paneLock.heights", JSON.stringify({ abstract: 150 }));
        // Unlocked and locked again: the remembered height; another section its own.
        wv._wvPaneLockToggle(det, "abstract");
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
        wv._wvPaneLockToggle(det, "abstract");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs, 3000, 30));
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 150, 1.5, "Abstract at its own height again");
        // A second locked section, above it (Info comes first): its own divider,
        // its own height; the one below does not move.
        wv._wvPaneLockToggle(det, "info");
        const info = det.getEnabledPane("info");
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 2, 3000, 30));
        await frames(2);
        const room = pp(det).getBoundingClientRect().height - 40;
        if (350 <= room) assert.approximately(info.getBoundingClientRect().height, 200, 1.5, "Info at the default height");
        assert.ok(stacked(det), "Info stacked on Abstract");
        const absTop = abs.getBoundingClientRect().top;
        const ri = info.getBoundingClientRect();
        const hi = ri.height;
        info.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: ri.top + 2 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: ri.top + 2 + 40 }));
        doc.documentElement.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: ri.top + 2 + 40 }));
        await frames(2);
        assert.approximately(info.getBoundingClientRect().height, hi - 40, 1.5, "Info 40 px shorter");
        // (Unless the two were shrunk to fit: then Abstract takes back its share.)
        if (350 <= room) assert.approximately(abs.getBoundingClientRect().top, absTop, 1.5, "Abstract did not move");
        assert.ok(stacked(det), "still stacked");
        const hs = JSON.parse(String(Zotero.Prefs.get("weavero.paneLock.heights")));
        assert.strictEqual(hs.info, Math.round(hi - 40), "remembered for Info");
        assert.strictEqual(hs.abstract, 150, "Abstract's own kept");
        wv._wvPaneLockToggle(det, "info");
        wv._wvPaneLockToggle(det, "abstract");
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
    });

    it("a collapsed locked section shows its header alone, at the bottom or at the top", async function () {
        Zotero.Prefs.clear("weavero.paneLock.heights");   // the default height (the divider's test left its own)
        const det = await showLibraryItem(P);
        wv._wvPaneLockToggle(det, "abstract");
        const abs = det.getEnabledPane("abstract");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs, 3000, 30));
        const sec = abs.querySelector(":scope > collapsible-section");
        const wasOpen = sec.open;
        try {
            sec.open = false;
            const ok = await wvT.waitFor(() => {
                const h = abs.getBoundingClientRect().height, hh = sec.querySelector(":scope > .head").getBoundingClientRect().height;
                return h < hh + 20 && atBottom(det, abs);
            }, 3000, 50);
            assert.ok(ok, "the header alone, at the bottom: " + abs.getBoundingClientRect().height + " / " + offBottom(det, abs));
            sec.open = true;
            assert.ok(await wvT.waitFor(() => Math.abs(abs.getBoundingClientRect().height - 200) <= 1.5 && atBottom(det, abs), 3000, 50),
                "open again: its height, at the bottom: " + abs.getBoundingClientRect().height + " / " + offBottom(det, abs));
            // At the top the same: its header alone there, the scroll padding its height.
            wv._wvPaneLockSet(det, "abstract", "top");
            assert.ok(await wvT.waitFor(() => abs.classList.contains("wv-panelock-top"), 3000, 30), "moved to the top");
            sec.open = false;
            const okTop = await wvT.waitFor(() => {
                const h = abs.getBoundingClientRect().height, hh = sec.querySelector(":scope > .head").getBoundingClientRect().height;
                return h < hh + 20 && atTop(det, abs) && Math.abs(parseFloat(pp(det).style.getPropertyValue("--wv-panelock-inset")) - h) <= 1.5;
            }, 3000, 50);
            assert.ok(okTop, "the header alone, at the top: " + abs.getBoundingClientRect().height + " / " + offTop(det, abs) + " / " + pp(det).style.getPropertyValue("--wv-panelock-inset"));
            sec.open = true;
            assert.ok(await wvT.waitFor(() => Math.abs(abs.getBoundingClientRect().height - 200) <= 1.5 && atTop(det, abs), 3000, 50),
                "open again: its height, at the top: " + abs.getBoundingClientRect().height + " / " + offTop(det, abs));
        }
        finally {
            sec.open = wasOpen;
            wv._wvPaneLockToggle(det, "abstract");
        }
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
    });

    // ---- Lock at Top (branch locktop, MJT 2026-11-22) ----

    it("Lock at Top locks a section at the scroller's visible top, first in its column, at its height, while the pane scrolls; its mark at the button's top end; its padlock unlocks it, Zotero's layout back", async function () {
        Zotero.Prefs.clear("weavero.paneLock.heights");
        const det = await showLibraryItem(P);
        const sc = pp(det);
        const abs = det.getEnabledPane("abstract"), info = det.getEnabledPane("info");
        const before = { pos: win.getComputedStyle(abs).position, order: win.getComputedStyle(abs).order, sp: win.getComputedStyle(sc).scrollPaddingTop };
        headAct(det, "abstract", "lock-top");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs && btnOf(det, "abstract"), 3000, 30), "Abstract locked from its header menu, its padlock drawn");
        assert.isTrue(abs.classList.contains("wv-panelock-top"), "locked at the top");
        assert.deepEqual(lockPref("library"), ["top:abstract"], "stored as a top entry");
        assert.strictEqual(wv._wvPaneLockPos(det, "abstract"), "top");
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["abstract"]);
        assert.strictEqual(btnOf(det, "abstract").getAttribute("data-l10n-id"), "weavero-panelock-button-unlock", "the same padlock, saying Unlock");
        await frames(3);
        const cs = win.getComputedStyle(abs);
        assert.strictEqual(cs.position, "sticky");
        assert.strictEqual(cs.order, "-1", "first in the scroller's column");
        assert.approximately(abs.getBoundingClientRect().height, 200, 1.5, "the default height");
        // Its divider is its bottom edge: the border and the band there.
        assert.strictEqual(cs.borderBottomWidth, "1px", "the divider's line at the bottom");
        assert.strictEqual(cs.borderTopWidth, "0px", "none at the top");
        assert.strictEqual(cs.paddingBottom, "4px", "the band at the bottom");
        assert.strictEqual(cs.paddingTop, "0px");
        assert.strictEqual(cs.cursor, "ns-resize");
        // The stack's height on the scroller: Zotero's scroll stops under it.
        assert.strictEqual(sc.style.getPropertyValue("--wv-panelock-inset"), "200px", "the stack's height on the scroller");
        assert.strictEqual(win.getComputedStyle(sc).scrollPaddingTop, "200px", "its scroll padding");
        sc.scrollTop = 0;
        await frames(2);
        assert.ok(atTop(det, abs), "at the top at scrollTop 0: " + offTop(det, abs));
        const gap = info.getBoundingClientRect().top - abs.getBoundingClientRect().bottom;
        assert.ok(gap >= -0.5 && gap <= 2, "Info, first in Zotero's order, drawn right under it: " + gap);
        const max = sc.scrollHeight - sc.clientHeight;
        assert.isAbove(max, 100, "the pane scrolls: " + max);
        for (const st of [Math.round(max / 3), Math.round(max / 2), max]) {
            sc.scrollTop = st;
            await frames(2);
            assert.ok(atTop(det, abs), "at the visible top at scrollTop " + st + ": " + offTop(det, abs));
        }
        // Zotero's own spacer past the last section (a sidenav click on Related).
        await det.scrollToPane("related", "instant");
        await frames(3);
        assert.ok(atTop(det, abs), "at the top with Zotero's spacer: " + offTop(det, abs));
        // Its own content scrolls inside it.
        const body = abs.querySelector(":scope > collapsible-section > :not(.head)");
        assert.strictEqual(win.getComputedStyle(body).overflowY, "auto", "the body scrolls");
        assert.isAbove(body.scrollHeight, body.clientHeight + 20, "longer than the locked height");
        // The side navigation: the locked tab's gold padlock at the button's TOP
        // end, Zotero's pin-mark spot ("Top or bottom should be distinguished by
        // the position of the lock in the sidenav: top right or bottom right").
        const w = det.sidenav.querySelector('.btn[data-pane="abstract"]').parentElement;
        assert.deepEqual(snMarkedTop(det), ["abstract"], "marked as locked at the top");
        assert.deepEqual(snMarked(det), [], "not as locked at the bottom");
        const mk = snMark(det, "abstract");
        assert.include(decodeURIComponent(mk.backgroundImage), "#f5b30f", "the locked tab's gold padlock");
        assert.strictEqual(mk.width, "12px", "Zotero's mark size");
        assert.strictEqual(mk.backgroundColor, "rgba(0, 0, 0, 0)", "no round under it");
        assert.strictEqual(mk.top, "1px", "at the top end, where Zotero's pin mark sits");
        assert.isAbove(parseFloat(mk.bottom), 1, "not at the bottom end: bottom " + mk.bottom);
        assert.strictEqual(snMark(det, "info").backgroundImage, "none", "an unlocked section's button unmarked");
        // The header padlock: a click unlocks.
        click(btnOf(det, "abstract"));
        assert.ok(await wvT.waitFor(() => !lockedOf(det) && !btnOf(det, "abstract"), 3000, 30), "unlocked, its padlock gone");
        assert.deepEqual(lockPref("library"), [], "the list emptied");
        await frames(2);
        assert.strictEqual(win.getComputedStyle(abs).position, before.pos, "Zotero's position");
        assert.strictEqual(win.getComputedStyle(abs).order, before.order, "Zotero's order");
        assert.isFalse(abs.classList.contains("wv-panelock-top"), "no top mark left");
        for (const v of ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"]) assert.strictEqual(abs.style.getPropertyValue(v), "", "no " + v + " left");
        assert.strictEqual(sc.style.getPropertyValue("--wv-panelock-inset"), "", "no stack height left on the scroller");
        assert.strictEqual(win.getComputedStyle(sc).scrollPaddingTop, before.sp, "Zotero's scroll padding");
        assert.isFalse(w.classList.contains("wv-panelock-sn-top"), "the mark gone");
        assert.isBelow(info.getBoundingClientRect().top, abs.getBoundingClientRect().top, "Abstract back under Info");
    });

    it("Lock at Top / Lock at Bottom move a section between the ends, in both menus as its state has them; one remembered height; the top divider is the bottom edge", async function () {
        Zotero.Prefs.set("weavero.paneLock.heights", JSON.stringify({ abstract: 150 }));
        const det = await showLibraryItem(P);
        const sn = det.sidenav;
        const popup = sn.querySelector("menupopup.context-menu");
        const mi = (c) => popup.querySelector(":scope > .wv-panelock-mi-" + c);
        const show = (id) => { sn._contextMenuTarget = id; popup.dispatchEvent(new win.Event("popupshowing")); };
        const shown = () => ["lock-top", "lock", "unlock"].filter((c) => !mi(c).hidden);
        const headShown = () => {
            const m = headMenu(det, "abstract");
            m.dispatchEvent(new win.Event("popupshowing"));
            return ["lock-top", "lock", "unlock"].filter((c) => !m.querySelector(":scope > .wv-panelock-hmi-" + c).hidden);
        };
        const abs = det.getEnabledPane("abstract");
        show("abstract");
        assert.deepEqual(shown(), ["lock-top", "lock"], "unlocked: Lock at Top and Lock at Bottom");
        assert.deepEqual(headShown(), ["lock-top", "lock"], "the header menu the same");
        wv._wvPaneLockMenuAct(sn, "bottom");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs && !abs.classList.contains("wv-panelock-top"), 3000, 30), "locked at the bottom from the side navigation");
        await frames(3);
        assert.approximately(abs.getBoundingClientRect().height, 150, 1.5, "its remembered height");
        assert.ok(atBottom(det, abs), "at the bottom: " + offBottom(det, abs));
        assert.deepEqual(lockPref("library"), ["abstract"], "a bare id");
        assert.deepEqual(snMarked(det), ["abstract"], "marked at the bottom end");
        show("abstract");
        assert.deepEqual(shown(), ["lock-top", "unlock"], "locked at the bottom: Lock at Top and Unlock");
        assert.deepEqual(headShown(), ["lock-top", "unlock"], "the header menu the same");
        // Lock at Top from the side navigation's menu: it moves, at its height.
        show("abstract");
        wv._wvPaneLockMenuAct(sn, "top");
        assert.ok(await wvT.waitFor(() => abs.classList.contains("wv-panelock-top") && lockedOf(det) === abs, 3000, 30), "moved to the top");
        await frames(3);
        assert.deepEqual(lockPref("library"), ["top:abstract"], "one entry, the top one");
        assert.approximately(abs.getBoundingClientRect().height, 150, 1.5, "the same remembered height");
        assert.ok(atTop(det, abs), "at the top: " + offTop(det, abs));
        assert.deepEqual(snMarkedTop(det), ["abstract"], "marked at the top end");
        assert.deepEqual(snMarked(det), [], "no longer at the bottom end");
        assert.strictEqual(abs.style.getPropertyValue("--wv-panelock-top"), "0px", "placed at the top of the stack");
        show("abstract");
        assert.deepEqual(shown(), ["lock", "unlock"], "locked at the top: Lock at Bottom and Unlock");
        assert.deepEqual(headShown(), ["lock", "unlock"], "the header menu the same");
        // The divider is its bottom edge: down 40 px, taller.
        const r = abs.getBoundingClientRect();
        const x = r.left + r.width / 2;
        dragBy(win, abs, x, r.bottom - 2, 40);
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 190, 1.5, "down 40 px: 40 px taller");
        assert.ok(atTop(det, abs), "still at the top");
        assert.strictEqual(JSON.parse(String(Zotero.Prefs.get("weavero.paneLock.heights"))).abstract, 190, "remembered");
        // A press on its header, or on its top edge, resizes nothing.
        const r2 = abs.getBoundingClientRect();
        dragBy(win, abs.querySelector(":scope > collapsible-section > .head"), x, r2.top + 20, 80);
        dragBy(win, abs, x, r2.top + 1, 80);
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 190, 1.5, "a press on the header or the top edge resizes nothing");
        // Up 30 px: shorter.
        const r3 = abs.getBoundingClientRect();
        dragBy(win, abs, x, r3.bottom - 2, -30);
        await frames(2);
        assert.approximately(abs.getBoundingClientRect().height, 160, 1.5, "up 30 px: shorter");
        // Back to the bottom from its header menu: the same height there.
        headAct(det, "abstract", "lock");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === abs && !abs.classList.contains("wv-panelock-top"), 3000, 30), "moved to the bottom");
        await frames(3);
        assert.deepEqual(lockPref("library"), ["abstract"]);
        assert.approximately(abs.getBoundingClientRect().height, 160, 1.5, "the height it had at the top");
        assert.ok(atBottom(det, abs), "at the bottom: " + offBottom(det, abs));
        assert.strictEqual(pp(det).style.getPropertyValue("--wv-panelock-inset"), "", "no stack at the top left");
        headAct(det, "abstract", "unlock");
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30), "unlocked from its header menu");
        Zotero.Prefs.clear("weavero.paneLock.heights");
    });

    it("several sections lock at the top: stacked in the side navigation's order; with one at the bottom, all share the pane with room kept for the part that scrolls", async function () {
        Zotero.Prefs.clear("weavero.paneLock.heights");
        const det = await showLibraryItem(P);
        const sc = pp(det);
        const info = det.getEnabledPane("info"), abs = det.getEnabledPane("abstract"), lc = det.getEnabledPane("libraries-collections");
        // Locked in the reverse of the scroller's order: stacked in its order.
        headAct(det, "libraries-collections", "lock-top");
        headAct(det, "info", "lock-top");
        assert.ok(await wvT.waitFor(() => lockedTop(det).length === 2, 3000, 30), "two locked at the top");
        await frames(3);
        assert.deepEqual(lockedTop(det), [info, lc], "in the side navigation's order");
        assert.sameMembers(lockPref("library"), ["top:info", "top:libraries-collections"]);
        assert.ok(stackedTop(det), "stacked from the top: " + geo(det));
        const ch = sc.getBoundingClientRect().height;
        const room = ch - 40;
        if (400 <= room) {
            const at200 = (el) => Math.abs(el.getBoundingClientRect().height - 200) <= 1.5;
            assert.ok(await wvT.waitFor(() => at200(info) && at200(lc) && stackedTop(det), 3000, 50), "both at their height: " + geo(det));
        }
        assert.approximately(parseFloat(sc.style.getPropertyValue("--wv-panelock-inset")), topStackH(det), 1.5, "the stack's height on the scroller");
        for (const st of [0, Math.round((sc.scrollHeight - sc.clientHeight) / 2), sc.scrollHeight]) {
            sc.scrollTop = st;
            await frames(2);
            assert.ok(stackedTop(det), "stacked at scrollTop " + st + ": " + geo(det));
        }
        assert.deepEqual(snMarkedTop(det), ["info", "libraries-collections"], "both marked at the top end");
        // One at the bottom too.
        headAct(det, "abstract", "lock");
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 3, 3000, 30), "and one at the bottom");
        await frames(3);
        await wvT.waitFor(() => !lockedAll(det).some((p) => p.classList.contains("wv-panelock-closed")) && stackedTop(det) && stacked(det), 3000, 50);
        assert.deepEqual(lockedBottom(det), [abs]);
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["info", "abstract", "libraries-collections"], "all of them, in their order");
        assert.ok(stackedTop(det) && stacked(det), "both stacks in place: " + geo(det));
        const ls = lockedAll(det);
        const total = ls.reduce((s, p) => s + p.getBoundingClientRect().height, 0);
        assert.isAtMost(total, room + 2, "together within the pane less the room kept (" + total + " of " + ch + ")");
        const middle = abs.getBoundingClientRect().top - (sc.getBoundingClientRect().top + topStackH(det));
        assert.isAtLeast(middle, 40 - 2, "the room between the stacks: " + middle);
        if (600 > room) {
            const hs = ls.map((p) => p.getBoundingClientRect().height);
            assert.isAtMost(Math.max(...hs) - Math.min(...hs), 2, "the same remembered heights shrink alike, top and bottom: " + hs.join(", "));
        }
        assert.sameMembers(snMarked(det), ["abstract"], "the bottom one at the bottom end");
        assert.sameMembers(snMarkedTop(det), ["info", "libraries-collections"], "the top ones at the top end");
        // The part that scrolls, between the stacks: from right under the top
        // one at the start to above the bottom one at the end.
        const scrolling = () => det.getEnabledPanes().filter((p) => !p.classList.contains("wv-panelock-locked") && p.getBoundingClientRect().height > 0);
        sc.scrollTop = 0;
        await frames(2);
        const first = scrolling()[0];
        const g = offTop(det, first) - topStackH(det);
        // (Zotero's 1-px flex gap after each section the stack holds: stuck
        // edge to edge, they keep their gaps in the flow.)
        assert.ok(g >= -0.5 && g <= lockedTop(det).length + 0.5, first.dataset.pane + " starts right under the top stack: " + g);
        sc.scrollTop = sc.scrollHeight;
        await frames(2);
        const last = scrolling().pop();
        assert.isAtMost(last.getBoundingClientRect().bottom, abs.getBoundingClientRect().top + 1.5, "the last one ends above the bottom stack: " + last.dataset.pane);
        assert.ok(stackedTop(det) && stacked(det), "the stacks at the end too: " + geo(det));
        // Unlocking one of the top ones: the other moves up to the top.
        click(btnOf(det, "info"));
        assert.ok(await wvT.waitFor(() => lockedTop(det).length === 1, 3000, 30), "one top lock left");
        await frames(3);
        assert.ok(stackedTop(det) && stacked(det), "restacked: " + geo(det));
        for (const id of ["abstract", "libraries-collections"]) wv._wvPaneLockToggle(det, id);
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30), "all unlocked");
        assert.deepEqual(lockPref("library"), []);
        assert.deepEqual(snMarked(det).concat(snMarkedTop(det)), [], "no mark left");
        assert.strictEqual(sc.style.getPropertyValue("--wv-panelock-inset"), "", "no stack height left");
    });

    it("Zotero's scroll to a section (a side-navigation click, a pin) lands it under the top stack, not beneath it; WV-TEMP-134569's anchor holds the pinned one there; pin and top lock exclude each other", async function () {
        Zotero.Prefs.clear("weavero.paneLock.heights");
        const det = await showLibraryItem(P);
        const sc = pp(det);
        const pin0 = det.pinnedPane || "";
        let probe = null;
        try {
            det.pinnedPane = "";
            wv._wvPaneLockSet(det, "abstract", "top");
            const abs = det.getEnabledPane("abstract");
            assert.ok(await wvT.waitFor(() => lockedTop(det)[0] === abs, 3000, 30), "Abstract locked at the top");
            await frames(3);
            /** A section's top, from the stack's bottom edge. */
            const under = (id) => offTop(det, det.getEnabledPane(id)) - topStackH(det);
            // A side-navigation click: Zotero's smooth scrollToPane.
            sc.scrollTop = 0;
            await frames(2);
            await det.scrollToPane("tags", "smooth");
            await frames(2);
            assert.approximately(under("tags"), 0, 1.5, "Tags right under the stack: " + under("tags"));
            // Already there: done at once (Zotero's own "at the top" test sees the
            // scroller's edge, and its smooth scroll would wait 3 s for nothing).
            const t0 = win.performance.now();
            await det.scrollToPane("tags", "smooth");
            assert.isBelow(win.performance.now() - t0, 1500, "no wait for a scroll that never starts");
            assert.approximately(under("tags"), 0, 1.5, "still there");
            // Instant (Zotero's render scrolls to the pinned section so).
            sc.scrollTop = 0;
            await frames(2);
            await det.scrollToPane("related", "instant");
            await frames(2);
            assert.approximately(under("related"), 0, 1.5, "Related under the stack: " + under("related"));
            // A locked section is never scrolled to: it is in view.
            sc.scrollTop = 0;
            await frames(2);
            const min0 = sc.style.getPropertyValue("--min-scroll-height");
            await det.scrollToPane("abstract", "smooth");
            await wvT.sleep(300);
            assert.strictEqual(sc.scrollTop, 0, "nothing scrolled");
            assert.strictEqual(sc.style.getPropertyValue("--min-scroll-height"), min0, "no spacer added");
            // Zotero's pin: its scroll puts the section under the stack.
            det.pinnedPane = "tags";
            await det.scrollToPane("tags", "instant");
            await wvT.sleep(120);
            assert.approximately(under("tags"), 0, 1.5, "the pinned section under the stack: " + under("tags"));
            if (typeof wv._wvPinAnchorNeeded === "function" && wv._wvPinAnchorNeeded(det)) {
                // WV-TEMP-134569: a section above it growing by 300 px -- Tags held
                // under the stack, not pulled up beneath it.
                const info = det.getEnabledPane("info");
                const h0 = info.getBoundingClientRect().height;
                const ib = info.querySelector("collapsible-section .body");
                assert.isOk(ib, "the Info section's body");
                probe = doc.createElement("div");
                probe.style.cssText = "display:block;height:300px;";
                ib.appendChild(probe);
                assert.ok(await wvT.waitFor(() => info.getBoundingClientRect().height - h0 >= 290 || null, 3000), "Info grew by the block");
                assert.ok(await wvT.waitFor(() => Math.abs(under("tags")) <= 1.5 || null, 3000), "Tags held under the stack: " + under("tags"));
                probe.remove();
                probe = null;
                await wvT.sleep(250);
                assert.approximately(under("tags"), 0, 1.5, "and after the block is gone: " + under("tags"));
                // The stack's divider dragged down: the pinned section follows its edge.
                const r = abs.getBoundingClientRect();
                dragBy(win, abs, r.left + r.width / 2, r.bottom - 2, 40);
                await wvT.sleep(250);
                assert.approximately(abs.getBoundingClientRect().height, 240, 1.5, "the stack 40 px taller");
                assert.approximately(under("tags"), 0, 1.5, "Tags still right under it: " + under("tags"));
            }
            // Locking the pinned section at the top unpins it.
            headAct(det, "tags", "lock-top");
            assert.ok(await wvT.waitFor(() => wv._wvPaneLockPos(det, "tags") === "top", 3000, 30), "Tags locked at the top");
            assert.strictEqual(det.pinnedPane || "", "", "and unpinned");
            // Pin Section on a section locked at the top: that lock goes, the pin stays,
            // scrolled under what is still locked at the top.
            det.sidenav.pinnedPane = "abstract";
            assert.ok(await wvT.waitFor(() => !abs.classList.contains("wv-panelock-locked"), 3000, 30), "pinning unlocked Abstract");
            assert.deepEqual(lockPref("library"), ["top:tags"], "only Abstract left the list");
            assert.strictEqual(det.pinnedPane, "abstract", "the pin kept");
            assert.deepEqual(snMarkedTop(det), ["tags"], "Abstract's button carries Zotero's pin mark, not the padlock");
            assert.ok(await wvT.waitFor(() => Math.abs(under("abstract")) <= 1.5, 5000, 50), "the pinned section scrolled under the stack: " + under("abstract"));
            wv._wvPaneLockSet(det, "tags", "");
            assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
        }
        finally {
            try { if (probe) probe.remove(); } catch (e) {}
            try { det.pinnedPane = pin0; } catch (e) {}
            Zotero.Prefs.clear("weavero.paneLock.heights");
        }
    });

    it("Weavero's sticky section heads stick under the top stack; the locked sections draw over the part that scrolls", async function () {
        await wvT.withPref("weavero.itemPaneStickyHeaders", true, async () => {
            if (typeof wv._wvApplyItemPaneStickyHeads === "function") wv._wvApplyItemPaneStickyHeads(win);
            const det = await showLibraryItem(P);
            const sc = pp(det);
            wv._wvPaneLockSet(det, "info", "top");
            const info = det.getEnabledPane("info"), abs = det.getEnabledPane("abstract");
            assert.ok(await wvT.waitFor(() => lockedTop(det)[0] === info, 3000, 30), "Info locked at the top");
            await frames(3);
            const ins = topStackH(det);
            const head = abs.querySelector(":scope > collapsible-section > .head");
            sc.scrollTop = 0;
            await frames(2);
            // Into the long abstract: its top 150 px above the stack's edge.
            sc.scrollTop = Math.round(offTop(det, abs) - ins + 150);
            await frames(3);
            if (typeof wv._wvStickyHeadsMark === "function") wv._wvStickyHeadsMark(sc);
            assert.isBelow(offTop(det, abs), ins - 100, "the section's top passed under the stack");
            assert.approximately(offTop(det, head), ins, 1.5, "its head stuck right under the stack");
            assert.approximately(parseFloat(win.getComputedStyle(head).top), ins, 1.5, "its sticky offset is the stack's height");
            assert.isTrue(head.hasAttribute("data-wv-stuck"), "marked stuck there");
            // The locked section's own head: at its section's top, never marked stuck.
            const ih = info.querySelector(":scope > collapsible-section > .head");
            // (Zotero draws a head 4 px inside its section.)
            assert.isAtMost(offTop(det, ih), 8, "the locked section's head at its top, not pushed under the stack: " + offTop(det, ih));
            assert.strictEqual(win.getComputedStyle(ih).top, "0px", "0 inside a locked section");
            assert.isFalse(ih.hasAttribute("data-wv-stuck"), "not marked stuck");
            // The stack is what a point in it hits: drawn over what scrolls beneath.
            assert.strictEqual(win.getComputedStyle(info).zIndex, "4");
            assert.strictEqual(win.getComputedStyle(head).zIndex, "3");
            const r = info.getBoundingClientRect();
            const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            assert.isOk(hit && info.contains(hit), "the locked section hit, not what scrolls under it: " + (hit && hit.localName));
            wv._wvPaneLockSet(det, "info", "");
            assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
            await frames(2);
            assert.strictEqual(win.getComputedStyle(head).top, "0px", "the heads back at the scroller's edge");
        });
    });

    it("\"top:\" entries round-trip: read as top locks beside bare ids, written by the menus, a Weavero section by its bare id; a section stored both ways is locked at the top", async function () {
        let det = await showLibraryItem(P);
        Zotero.Prefs.set("weavero.paneLock.library", JSON.stringify(["top:abstract", "info"]));
        wv._wvPaneLockApplyAll();
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 2, 3000, 30), "both locked");
        await frames(3);
        assert.strictEqual(wv._wvPaneLockPos(det, "abstract"), "top");
        assert.strictEqual(wv._wvPaneLockPos(det, "info"), "bottom");
        assert.ok(atTop(det, det.getEnabledPane("abstract")), "Abstract at the top");
        assert.ok(atBottom(det, det.getEnabledPane("info")), "Info at the bottom");
        // Both ways at once (never written so) and a "top:" naming nothing.
        Zotero.Prefs.set("weavero.paneLock.library", JSON.stringify(["info", "top:info", "top:"]));
        wv._wvPaneLockApplyAll();
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 1 && wv._wvPaneLockPos(det, "info") === "top", 3000, 30), "Info at the top, nothing else");
        // Writes keep one entry per section.
        wv._wvPaneLockSet(det, "info", "bottom");
        assert.deepEqual(lockPref("library"), ["info"], "to the bottom: the bare id");
        wv._wvPaneLockSet(det, "info", "top");
        assert.deepEqual(lockPref("library"), ["top:info"], "to the top: the top entry");
        // panelock.1's migration leaves a list alone.
        wv._wvPaneLockMigrate();
        assert.strictEqual(Zotero.Prefs.get("weavero.paneLock.library"), JSON.stringify(["top:info"]), "the list kept");
        wv._wvPaneLockSet(det, "info", "");
        assert.deepEqual(lockPref("library"), []);
        // A Weavero section (namespaced by Zotero): stored by its bare id.
        det = await showFeedItem();
        const why = det.getEnabledPane(wv._wvFdSecKey);
        assert.ok(await wvT.waitFor(() => lockedOf(det) === why, 3000, 30), "Why relevant at the bottom, the feeds' default");
        wv._wvPaneLockSet(det, wv._wvFdSecKey, "top");
        assert.ok(await wvT.waitFor(() => wv._wvPaneLockPos(det, wv._wvFdSecKey) === "top", 3000, 30), "moved to the top");
        assert.deepEqual(lockPref("feed"), ["top:weavero-feeds"], "its bare id after top:");
        await frames(3);
        assert.ok(atTop(det, why), "at the top: " + offTop(det, why));
        wv._wvPaneLockSet(det, wv._wvFdSecKey, "bottom");
        assert.deepEqual(lockPref("feed"), ["weavero-feeds"], "back to the feeds' default");
        assert.ok(await wvT.waitFor(() => wv._wvPaneLockPos(det, wv._wvFdSecKey) === "bottom", 3000, 30));
        Zotero.Prefs.clear("weavero.paneLock.feed");
        await showLibraryItem(P);
    });

    it("per view: library items, feed items and reader tabs keep their own lists; Feeds start with Why relevant locked; a section an item lacks locks nothing; panelock.1's single ids become lists", async function () {
        clearPrefs();
        wv._wvPaneLockApplyAll();
        assert.deepEqual(lockPref("feed"), ["weavero-feeds"], "the feeds' default: Why relevant (feeds.ts SEC_PANE_ID)");
        assert.match(String(wv._wvFdSecKey), /weavero-feeds$/, "the key Weavero registered");
        let det = await showLibraryItem(P);
        assert.strictEqual(wv._wvPaneLockView(det), "library");
        assert.isNull(lockedOf(det), "nothing locked for a library item by default");
        // Feeds: Why relevant at the bottom from the start.
        det = await showFeedItem();
        assert.strictEqual(wv._wvPaneLockView(det), "feed");
        const why = det.getEnabledPane(wv._wvFdSecKey);
        assert.ok(await wvT.waitFor(() => lockedOf(det) === why, 3000, 30), "Why relevant locked in the feeds");
        await frames(3);
        assert.ok(atBottom(det, why), "at the bottom: " + offBottom(det, why));
        assert.deepEqual(wv._wvPaneLockLockedIDs(det), [wv._wvFdSecKey]);
        assert.deepEqual(snMarked(det), [wv._wvFdSecKey], "its side-navigation button marked");
        // The library's own lock; the feeds keep theirs.
        det = await showLibraryItem(P);
        assert.isNull(lockedOf(det), "the feeds' lock is not the library's");
        headAct(det, "tags", "lock");
        assert.ok(await wvT.waitFor(() => lockedOf(det) === det.getEnabledPane("tags"), 3000, 30), "Tags locked in the library");
        det = await showFeedItem();
        assert.ok(await wvT.waitFor(() => lockedOf(det) === det.getEnabledPane(wv._wvFdSecKey), 3000, 30), "the feeds still lock Why relevant");
        assert.notInclude(lockedAll(det), det.getEnabledPane("tags"), "not Tags");
        det = await showLibraryItem(P);
        assert.ok(await wvT.waitFor(() => lockedOf(det) === det.getEnabledPane("tags"), 3000, 30), "the library's Tags again");
        assert.deepEqual(snMarked(det), ["tags"], "the marks follow the view");
        // A section the item does not have: nothing locked for it, the setting kept.
        Zotero.Prefs.set("weavero.paneLock.library", JSON.stringify(["weavero-feeds"]));
        wv._wvPaneLockApplyAll();
        await frames(2);
        assert.isNull(lockedOf(det), "Why relevant is hidden for a library item: nothing locked");
        assert.deepEqual(lockPref("library"), ["weavero-feeds"], "the view's list kept for the next item that has it");
        // panelock.1 stored ONE id as a plain string: read as a list of one,
        // rewritten as a list.
        Zotero.Prefs.set("weavero.paneLock.library", "tags");
        wv._wvPaneLockApplyAll();
        assert.ok(await wvT.waitFor(() => lockedOf(det) === det.getEnabledPane("tags"), 3000, 30), "a single id locks its section");
        wv._wvPaneLockMigrate();
        assert.strictEqual(Zotero.Prefs.get("weavero.paneLock.library"), JSON.stringify(["tags"]), "rewritten as a list");
        Zotero.Prefs.set("weavero.paneLock.reader", "");
        wv._wvPaneLockMigrate();
        assert.strictEqual(Zotero.Prefs.get("weavero.paneLock.reader"), "", "an empty one left as it is (none)");
        Zotero.Prefs.clear("weavero.paneLock.reader");
        // A reader tab: its own, nothing at first. Its item pane opened for
        // the case and put back as it was: left open, it narrowed every later
        // spec's reader -- people-tab's split view, preview-entry-highlight's
        // DOI zones and refs-cards' popup side failed after this spec (dev.99
        // triage, 2026-11-27).
        const ctxWas = !!(win.ZoteroContextPane && win.ZoteroContextPane.collapsed);
        if (win.ZoteroContextPane && win.ZoteroContextPane.collapsed) win.ZoteroContextPane.collapsed = false;
        let reader = null;
        try { reader = await wvT.openReaderTab(A.id); }
        finally { if (!reader) { try { win.ZoteroContextPane.collapsed = ctxWas; } catch (e) {} } }
        assert.isOk(reader, "a reader tab");
        try {
            const cd = await wvT.waitFor(() => { const d = doc.getElementById(reader.tabID + "-context"); return d && d._paneParent && d._paneParent.clientHeight && d.getEnabledPane("related") ? d : null; }, 20000);
            assert.isOk(cd, "the tab's item pane");
            assert.strictEqual(wv._wvPaneLockView(cd), "reader");
            await frames(3);
            assert.isNull(lockedOf(cd), "nothing locked in a reader tab by default");
            assert.isOk(headMenu(cd, "related") && headMenu(cd, "related").querySelector(":scope > .wv-panelock-hmi-lock"), "the header menu's entries there too");
            assert.isNull(btnOf(cd, "related"), "no padlock before it is locked");
            headAct(cd, "related", "lock");
            assert.ok(await wvT.waitFor(() => lockedOf(cd) === cd.getEnabledPane("related"), 3000, 30), "Related locked in the reader tab");
            await frames(3);
            assert.ok(atBottom(cd, cd.getEnabledPane("related")), "at the bottom of the tab's pane: " + offBottom(cd, cd.getEnabledPane("related")));
            assert.deepEqual(lockPref("reader"), ["related"]);
            assert.deepEqual(lockPref("library"), ["tags"], "the library's list untouched");
            assert.deepEqual(snMarked(cd), ["related"], "the context pane's side navigation marks it");
            // The context pane's side navigation offers it too.
            const sn = cd.sidenav;
            const popup = sn && sn.querySelector("menupopup.context-menu");
            assert.isOk(popup && popup.querySelector(":scope > .wv-panelock-mi-unlock") && popup.querySelector(":scope > .wv-panelock-mi-lock-top"), "the context pane's sidenav menu has the entries");
            // Entries gone (a side navigation rebuilt, another instance's teardown):
            // the next apply puts them back -- the wiring alone did not
            // (citations.30's battery, 2026-11-22).
            for (const el of Array.from(popup.querySelectorAll(":scope > [data-wv-owned='panelock']"))) el.remove();
            wv._wvPaneLockApplyAll();
            assert.ok(await wvT.waitFor(() => popup.querySelector(":scope > .wv-panelock-mi-unlock") || null, 3000, 30), "the entries back after an apply");
            // At the top there: from its header menu, the reader view's list.
            headAct(cd, "related", "lock-top");
            const rel = cd.getEnabledPane("related");
            assert.ok(await wvT.waitFor(() => rel.classList.contains("wv-panelock-top") && lockedOf(cd) === rel, 3000, 30), "Related moved to the top of the tab's pane");
            await frames(3);
            assert.ok(atTop(cd, rel), "at the top of the tab's pane: " + offTop(cd, rel));
            assert.deepEqual(lockPref("reader"), ["top:related"]);
            assert.deepEqual(snMarkedTop(cd), ["related"], "the context pane's side navigation marks it at the top end");
            assert.deepEqual(snMarked(cd), [], "not at the bottom end");
            click(btnOf(cd, "related"));
            assert.ok(await wvT.waitFor(() => !lockedOf(cd), 3000, 30), "unlocked in the reader tab");
            assert.deepEqual(snMarkedTop(cd), [], "its mark gone");
        }
        finally {
            try { if (!!win.ZoteroContextPane.collapsed !== ctxWas) win.ZoteroContextPane.collapsed = ctxWas; } catch (e) {}
            wvT.closeReaderTab(reader);
        }
        det = await showLibraryItem(P);
        assert.ok(await wvT.waitFor(() => lockedOf(det) === det.getEnabledPane("tags"), 3000, 30), "the library kept Tags");
        clearPrefs();
        wv._wvPaneLockApplyAll();
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
    });

    // Weavero's standalone reader window builds an item pane of its own
    // (reader.ts _ensureReaderWindowItemPane: #wv-reader-item-details and
    // #wv-reader-item-sidenav, outside any main window; MJT 2026-11-22, "Also
    // cover"). It takes the reader view's list, as a reader tab's pane does.
    it("a standalone reader window's item pane: padlocks, the reader view's list, its side navigation's entries, the dividers, Pin Section, the teardown", async function () {
        clearPrefs();
        wv._wvPaneLockApplyAll();
        const rwins = () => { const out = []; const en = Services.wm.getEnumerator("zotero:reader"); while (en.hasMoreElements()) out.push(en.getNext()); return out; };
        const before = new Set(rwins());
        await Zotero.Reader.open(A2.id, null, { openInWindow: true });
        const rw = await wvT.waitFor(() => rwins().find((w) => !before.has(w)) || null, 20000, 100);
        assert.isOk(rw, "a reader window opened");
        const rframes = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res(null) : rw.requestAnimationFrame(f)); rw.requestAnimationFrame(f); });
        const rclick = (el) => el.dispatchEvent(new rw.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        try {
            const rdoc = rw.document;
            const det = await wvT.waitFor(() => {
                const d = rdoc.getElementById("wv-reader-item-details");
                const hm = d && d._paneParent && d.getEnabledPane("abstract") && headMenu(d, "abstract");
                return hm && d._paneParent.clientHeight > 150 && d.item && d.item.id === P.id && hm.querySelector(":scope > .wv-panelock-hmi-lock") ? d : null;
            }, 30000, 100);
            assert.isOk(det, "Weavero's item pane in the reader window, showing the paper, its header menus wired");
            assert.strictEqual(wv._wvPaneLockView(det), "reader", "the reader view, as a reader tab's pane");
            assert.isOk(rdoc.getElementById("wv-panelock-style"), "the sheet in the reader window");
            assert.isNull(lockedOf(det), "nothing locked there by default");
            await rframes(3);
            const ch = pp(det).getBoundingClientRect().height;
            const expectH = Math.round(Math.max(Math.min(200, ch - 40), Math.min(60, ch)));
            // The section's header menu.
            const abs = det.getEnabledPane("abstract");
            headAct(det, "abstract", "lock");
            assert.ok(await wvT.waitFor(() => lockedOf(det) === abs && btnOf(det, "abstract"), 3000, 30), "Abstract locked from its header menu, its padlock drawn");
            assert.deepEqual(lockPref("reader"), ["abstract"], "the reader view's list");
            assert.deepEqual(lockPref("library"), [], "not the library's");
            await rframes(3);
            assert.approximately(abs.getBoundingClientRect().height, expectH, 1.5, "its height (pane " + ch + " px)");
            for (const st of [0, pp(det).scrollHeight]) {
                pp(det).scrollTop = st;
                await rframes(2);
                assert.ok(atBottom(det, abs), "at the bottom at scrollTop " + st + ": " + offBottom(det, abs));
            }
            // The side navigation's menu of the window's own pane.
            const sn = rdoc.getElementById("wv-reader-item-sidenav");
            const popup = sn && sn.querySelector("menupopup.context-menu");
            assert.isOk(popup, "the reader window's sidenav menu");
            const lock = popup.querySelector(":scope > .wv-panelock-mi-lock");
            const unlock = popup.querySelector(":scope > .wv-panelock-mi-unlock");
            assert.isOk(lock && unlock, "both entries");
            const show = (id) => { sn._contextMenuTarget = id; popup.dispatchEvent(new rw.Event("popupshowing")); };
            show("abstract");
            assert.isTrue(lock.hidden, "Lock at Bottom hidden for the locked section");
            assert.isFalse(unlock.hidden, "Unlock shown");
            show("info");
            assert.isFalse(lock.hidden, "Lock at Bottom shown for Info");
            wv._wvPaneLockMenuAct(sn, "lock");
            const info = det.getEnabledPane("info");
            assert.ok(await wvT.waitFor(() => lockedAll(det).length === 2, 3000, 30), "Info locked from the menu, beside Abstract");
            await rframes(3);
            assert.deepEqual(wv._wvPaneLockLockedIDs(det), ["info", "abstract"], "in the side navigation's order");
            assert.ok(stacked(det), "stacked at the bottom");
            assert.sameMembers(snMarked(det), ["info", "abstract"], "the window's side navigation marks both");
            assert.include(snMark(det, "abstract").backgroundImage, "data:image/svg+xml", "the padlock drawn in the mark");
            // Info's divider: down 40 px; Abstract stays (when the two fit unshrunk).
            const absTop = abs.getBoundingClientRect().top;
            const absFull = Math.abs(abs.getBoundingClientRect().height - 200) <= 1.5;
            const h0 = info.getBoundingClientRect().height;
            const r = info.getBoundingClientRect();
            const x = r.left + r.width / 2, y0 = r.top + 2;
            info.dispatchEvent(new rw.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y0 }));
            rdoc.documentElement.dispatchEvent(new rw.MouseEvent("mousemove", { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y0 + 40 }));
            rdoc.documentElement.dispatchEvent(new rw.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y0 + 40 }));
            await rframes(2);
            assert.approximately(info.getBoundingClientRect().height, h0 - 40, 1.5, "follows the drag");
            if (absFull) assert.approximately(abs.getBoundingClientRect().top, absTop, 1.5, "Abstract did not move");
            assert.ok(stacked(det), "still stacked");
            assert.strictEqual(JSON.parse(String(Zotero.Prefs.get("weavero.paneLock.heights"))).info, Math.round(h0 - 40), "remembered for Info");
            // Info to the top from the menu: a stack at each end.
            show("info");
            assert.isFalse(popup.querySelector(":scope > .wv-panelock-mi-lock-top").hidden, "Lock at Top shown for Info, locked at the bottom");
            wv._wvPaneLockMenuAct(sn, "top");
            assert.ok(await wvT.waitFor(() => info.classList.contains("wv-panelock-top"), 3000, 30), "Info moved to the top");
            await rframes(3);
            assert.deepEqual(lockedTop(det), [info], "Info at the top");
            assert.ok(stackedTop(det) && stacked(det), "Info at the top, Abstract at the bottom: " + geo(det));
            assert.sameMembers(lockPref("reader"), ["top:info", "abstract"]);
            assert.deepEqual(snMarkedTop(det), ["info"], "the window's side navigation marks Info at the top end");
            assert.deepEqual(snMarked(det), ["abstract"], "and Abstract at the bottom end");
            assert.approximately(parseFloat(pp(det).style.getPropertyValue("--wv-panelock-inset")), topStackH(det), 1.5, "the stack's height on the window's scroller");
            for (const st of [0, pp(det).scrollHeight]) {
                pp(det).scrollTop = st;
                await rframes(2);
                assert.ok(stackedTop(det) && stacked(det), "both in place at scrollTop " + st + ": " + geo(det));
            }
            // Unlock from the menu: the other stays.
            show("info");
            wv._wvPaneLockMenuAct(sn, "unlock");
            assert.ok(await wvT.waitFor(() => lockedAll(det).length === 1, 3000, 30), "Info unlocked from the menu");
            assert.deepEqual(lockPref("reader"), ["abstract"], "Abstract stays");
            assert.strictEqual(pp(det).style.getPropertyValue("--wv-panelock-inset"), "", "no stack at the top left");
            // Pin Section on the locked section: unlocked, pinned.
            sn.pinnedPane = "abstract";
            assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30), "pinning unlocked it");
            assert.strictEqual(det.pinnedPane, "abstract", "the pin kept");
            assert.deepEqual(lockPref("reader"), [], "the reader view's list emptied");
            // Locking the pinned section unpins it.
            headAct(det, "abstract", "lock");
            assert.ok(await wvT.waitFor(() => lockedOf(det) === abs, 3000, 30), "locked again");
            assert.strictEqual(det.pinnedPane || "", "", "and unpinned");
            // And Info at the top, for the teardown.
            show("info");
            wv._wvPaneLockMenuAct(sn, "top");
            assert.ok(await wvT.waitFor(() => lockedTop(det)[0] === info, 3000, 30), "Info at the top again");
            // The teardown: nothing left in the reader window; the wiring back.
            const L = wvT.lib();
            try {
                wv._wvPaneLockDestroy();
                await rframes(2);
                assert.strictEqual(rdoc.querySelectorAll(".wv-panelock-btn, [data-wv-owned='panelock']").length, 0, "no padlock, no menu entry");
                assert.strictEqual(rdoc.querySelectorAll("[class*='wv-panelock']").length, 0, "no class");
                assert.isNull(rdoc.getElementById("wv-panelock-style"), "no sheet");
                assert.strictEqual(pp(det).style.getPropertyValue("--wv-panelock-inset"), "", "no stack height on the scroller");
                for (const m of ["render", "scrollToPane"]) assert.deepEqual(L.wvWrapLayers(det, m).filter((l) => l.layer === "paneLock"), [], m + ": no layer");
                for (const p of det.getPanes()) {
                    for (const v of ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"]) assert.strictEqual(p.style.getPropertyValue(v), "", p.dataset.pane + ": no " + v);
                }
                assert.deepEqual(L.wvListenKeys(sn).filter((k) => /^paneLock/.test(k.key)), [], "sidenav: no listener");
                assert.deepEqual(L.wvListenKeys(popup).filter((k) => /^paneLock/.test(k.key)), [], "sidenav menu: no listener");
                for (const p of det.getPanes()) {
                    const hm = headMenu(det, p.dataset.pane);
                    if (hm) assert.deepEqual(L.wvListenKeys(hm).filter((k) => /^paneLock/.test(k.key)), [], p.dataset.pane + "'s header menu: no listener");
                }
            }
            finally {
                wv._wvPaneLockWire(win);
                wv._wvPaneLockWire(rw);
            }
            assert.ok(await wvT.waitFor(() => lockedBottom(det)[0] === abs && lockedTop(det)[0] === info && btnOf(det, "abstract")
                && headMenu(det, "related").querySelector(":scope > .wv-panelock-hmi-lock-top"), 3000, 30),
                "wired again: locked again at each end, the padlocks and the header menus' entries back");
        }
        finally {
            try { rw.close(); } catch (e) {}
            await wvT.waitFor(() => rw.closed, 5000, 100);
            wvT.purgeDeadReaders();
            clearPrefs();
            wv._wvPaneLockApplyAll();
        }
    });

    it("the teardown (disable, reload) leaves nothing of it; the wiring brings it back", async function () {
        const det = await showLibraryItem(P);
        Zotero.Prefs.set("weavero.paneLock.library", JSON.stringify(["tags", "abstract", "top:info"]));
        wv._wvPaneLockApplyAll();
        const tags = det.getEnabledPane("tags");
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 3, 3000, 30), "Abstract and Tags locked at the bottom, Info at the top");
        await frames(2);
        assert.isAbove(parseFloat(pp(det).style.getPropertyValue("--wv-panelock-inset")), 0, "the stack's height on the scroller");
        assert.deepEqual(snMarkedTop(det), ["info"], "Info marked at the top end");
        const L = wvT.lib();
        try {
            wv._wvPaneLockDestroy();
            await frames(2);
            assert.strictEqual(doc.querySelectorAll(".wv-panelock-btn, [data-wv-owned='panelock']").length, 0, "no padlock, no menu entry");
            assert.strictEqual(doc.querySelectorAll("[class*='wv-panelock']").length, 0, "no class");
            assert.isNull(doc.getElementById("wv-panelock-style"), "no stylesheet");
            for (const p of det.getPanes()) {
                for (const v of ["--wv-panelock-h", "--wv-panelock-top", "--wv-panelock-bottom"]) assert.strictEqual(p.style.getPropertyValue(v), "", p.dataset.pane + ": no " + v);
                assert.deepEqual(L.wvListenKeys(p).filter((k) => /^paneLock/.test(k.key)), [], p.dataset.pane + ": no listener");
                const hm = headMenu(det, p.dataset.pane);
                if (hm) assert.deepEqual(L.wvListenKeys(hm).filter((k) => /^paneLock/.test(k.key)), [], p.dataset.pane + "'s header menu: no listener");
            }
            for (const d of doc.querySelectorAll("item-details")) {
                for (const m of ["render", "scrollToPane"]) assert.deepEqual(L.wvWrapLayers(d, m).filter((l) => l.layer === "paneLock"), [], m + ": no layer");
            }
            for (const sn of doc.querySelectorAll("item-pane-sidenav")) {
                assert.deepEqual(L.wvListenKeys(sn).filter((k) => /^paneLock/.test(k.key)), [], "sidenav: no listener");
                const popup = sn.querySelector("menupopup.context-menu");
                if (popup) assert.deepEqual(L.wvListenKeys(popup).filter((k) => /^paneLock/.test(k.key)), [], "sidenav menu: no listener");
            }
            assert.strictEqual(win.getComputedStyle(tags).position, win.getComputedStyle(det.getEnabledPane("related")).position, "Tags laid out as Zotero has it");
            assert.strictEqual(win.getComputedStyle(det.getEnabledPane("info")).order, win.getComputedStyle(det.getEnabledPane("related")).order, "Info in Zotero's order");
            for (const sc of doc.querySelectorAll(".zotero-view-item")) assert.strictEqual(sc.style.getPropertyValue("--wv-panelock-inset"), "", "no stack height on a scroller");
            assert.deepEqual(lockPref("library"), ["tags", "abstract", "top:info"], "the setting stays for the next start");
        }
        finally {
            wv._wvPaneLockWire(win);
        }
        assert.ok(await wvT.waitFor(() => lockedAll(det).length === 3 && lockedTop(det).length === 1 && btnOf(det, "tags"), 3000, 30), "wired again: locked again at each end, the padlocks back");
        assert.deepEqual(snMarkedTop(det), ["info"], "Info's mark back at the top end");
        clearPrefs();
        wv._wvPaneLockApplyAll();
        assert.ok(await wvT.waitFor(() => !lockedOf(det), 3000, 30));
    });
});
