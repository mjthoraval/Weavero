/* global describe, it, before, after, assert, Zotero, wvT, Components */
// A tab locked on one side of the window (tab-split-dock.ts). Forum 132980, jandavid
// 2026-11-14, on Weavero 1.1.0's split view (a pair of tabs): "what I'm hoping for is
// have the library always open in the left split, and then in the right split be able
// to cycle through different open tabs and open/close tabs individually. So it
// shouldn't be a 'preview' pane in that it always shows what's selected in the
// library. But it should be independent from a particular split", and of his
// workaround with a second window: "it doesn't seem that I can get that behavior by
// hitting enter on an entry in the library". MJT: "Study the options for his request
// in a separate branch with A" (A: a library tab stays on one side, the other side
// shows whichever other tab is selected).
//
// Then (MJT 2026-11-17, his picks), after "I have no way to see that I have locked the
// left part of the split view" -- My Library's tab is pinned, icon only, and the mark
// drawn before its title never showed:
//   - ANY tab can be locked: every tab's menu has "Lock Tab" ("Unlock Tab" on the
//     locked tab since 2026-11-18, a checkbox before), one locked
//     tab per window. The locked tab goes on the LEFT at once, beside "the last viewed
//     tab ... the active tab": the tab you are on when you lock another one, else the
//     tab you viewed before it, selected.
//   - The lock comes FIRST: "a tab in split view still appears as one single tab on
//     the side of a locked tab" -- a pair's tab selected shows alone beside the locked
//     tab, the pair stays a pair (strip, record, menus) and shows again once unlocked.
//   - The look: first "Badge + 'locked' header" (a badge on the corner of the locked
//     tab's icon, where Firefox puts its badges on pinned tabs -- tabs.css
//     .tab-icon-overlay -- and a header over the locked side); then, on trial.9, no
//     header ("This top bar is also not needed") and his pick "Accent frame + accent
//     padlock": the locked tab framed in Zotero's accent colour, the badge a white
//     padlock on an accent round -- a gold padlock alone since 2026-11-18 ("the usual
//     lock colours instead of this blue", "No white background for the lock icon").
//     Its tooltip says it is locked.
//   - A collapse: first a rail at the window's edge, then (trial.9: "The left band is not
//     needed. A click on the tab header should be sufficient") the locked side off the
//     screen; a plain click on the locked tab in the strip toggles it.
describe("Weavero — split view: a tab locked on one side", function () {
    this.timeout(240000);
    let wv, win, doc, ZT, pdf1, pdf2, pdf3, note, prevSplit, ow, oh;
    const Cu = Components.utils;
    const PREF = "weavero.tabSplits";
    const LABEL = "Lock Tab";
    // On the locked tab, as Pin Tab / Unpin Tab (MJT 2026-11-18: "The lock menu should
    // change to unlock, same as for pin tab"; a checkbox until trial.14).
    const UNLABEL = "Unlock Tab";
    // Firefox's padlock (the address bar's): its shape, and the badge's drawing in high
    // contrast.
    const LOCK_SVG = "chrome://global/skin/icons/security.svg";
    // The gold padlock (tab-split-dock.ts WV_LOCK_GOLD_ICON, a data URI), by its body's
    // gold as the URI spells it: on the badge and on the menu entry (MJT 2026-11-18:
    // "the usual lock colours instead of this blue", his pick "Gold padlock"; "Lock tab
    // in the menu should get the same icon as on the locked tab").
    const GOLD = encodeURIComponent('fill="#f5b30f"');
    // The line under the locked tab's tooltip.
    const TIP_OPEN = "Locked tab. Click to collapse it.";
    const TIP_COLLAPSED = "Locked tab, collapsed. Click to expand it.";
    const HTML_NS = "http://www.w3.org/1999/xhtml";
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTabs = (Z) => (Z || ZT)._tabs.filter(t => String(t.type).startsWith("library"));
    const libTab = () => libTabs()[0];
    const tabOfItem = (it, Z) => (Z || ZT)._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const descOfItem = (it) => "reader:" + it.libraryID + "/" + it.key;
    const deck = (w) => (w || win).document.getElementById("tabs-deck");
    const rectOf = (id) => doc.getElementById(id).getBoundingClientRect();
    // On screen = laid out AND hit at its centre (split-view.spec.js: zotero.css hides
    // every deck child but the selected one "only visually").
    const shown = (id, w) => {
        const d = (w || win).document;
        const el = d.getElementById(id);
        if (!el) return null;
        const cs = (w || win).getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 40) return null;
        const hit = d.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return (hit && el.contains(hit)) ? r : null;
    };
    const dock = (w) => (w || win)._wvTDock || null;
    const dockSplit = (w) => ((w || win)._wvTSplits || []).find(s => s.dock) || null;
    const pairs = (w) => ((w || win)._wvTSplits || []).filter(s => !s.dock);
    const recs = () => JSON.parse(String(Zotero.Prefs.get(PREF) || "[]"));
    const dockRec = () => recs().find(r => r && r.dock) || null;
    // The tabs marked locked in the strip: a tab, or the icon a pinned tab is drawn as
    // (#wv-pinned-mirrors); an older Zotero draws its library tab twice (pinned and in
    // the strip): by id, once.
    const marked = () => [...new Set(Array.from(doc.querySelectorAll("#tab-bar-container .tab[data-wv-tdock], #tab-bar-container .wv-pinned-mirror[data-wv-tdock]"))
        .map(x => x.getAttribute("data-id") || x.getAttribute("data-tab-id")))];
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    const libView = (id) => doc.getElementById(id).querySelector("library-view") || doc.getElementById(id);
    // Nothing of the header or the rail of earlier builds, nor room kept for them.
    const noHeadOrRail = (what) => {
        assert.notOk(doc.getElementById("wv-tdock-head"), what + ": no header");
        assert.notOk(doc.getElementById("wv-tdock-rail"), what + ": no rail");
        assert.notOk(doc.querySelector("[wv-tdock-head], [wv-tdock-collapsed], #tabs-deck[wv-tdock-rail]"), what + ": no room kept for either");
    };
    // Zotero's toolbars of a library view (the collections pane's and the items list's).
    const libToolbars = (id) => Array.from(libView(id).querySelectorAll("#zotero-toolbar-collection-tree, [id^='zotero-toolbar-collection-tree'], #zotero-toolbar-item-tree, [id^='zotero-toolbar-item-tree']"))
        .filter(el => el.getBoundingClientRect().width > 0);
    // The first thing the card shows (Zotero 10 puts its banners above the trees; a
    // reader card holds its <browser>).
    const firstShown = (id) => Array.from(doc.getElementById(id).children).find(el => el.localName !== "popupset" && el.getBoundingClientRect().height > 0) || null;
    // A tab in the strip, the element on screen: the tab itself, or the icon a pinned
    // tab is drawn as.
    const tabEl = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"], #tab-bar-container .wv-pinned-mirror[data-tab-id="' + id + '"]'))
        .find(x => x.getBoundingClientRect().width > 0) || null;
    // The badge on a tab's icon (a ::before of its .tab-icon).
    const badgeOf = (id) => win.getComputedStyle(tabEl(id).querySelector(".tab-icon"), "::before");
    const badgeOn = (id) => { const el = tabEl(id); if (!el) return false; const b = badgeOf(id); return b.content !== "none" && b.backgroundImage.includes(GOLD) && parseFloat(b.width) > 0; };
    // A tab's tooltip in the strip (the tab itself, or its pinned icon), and its title's.
    const tipOf = (id) => { const el = tabEl(id); return el ? (el.getAttribute("title") || "") : ""; };
    const nameTipOf = (id) => { const el = tabEl(id); const n = el && el.querySelector(".tab-name"); return n ? n.getAttribute("title") : null; };
    // Colours: an rgb() string as numbers; Zotero's accent as the window resolves it.
    const rgbOf = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const near = (a, b, tol) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
    const accentRGB = () => {
        const p = doc.createElementNS(HTML_NS, "span");
        p.style.color = "var(--color-accent)";
        doc.documentElement.appendChild(p);
        try { return rgbOf(win.getComputedStyle(p).color); }
        finally { p.remove(); }
    };
    // What the window paints at (x, y): every layer, as the screen shows it.
    const pixelAt = (x, y) => {
        const c = doc.createElementNS(HTML_NS, "canvas");
        c.width = 1; c.height = 1;
        const ctx = /** @type {any} */ (c.getContext("2d"));
        ctx.drawWindow(win, x, y, 1, 1, "rgb(255, 0, 255)");
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
    };
    const fetchOk = async (url) => { try { const r = await win.fetch(url); const t = await r.text(); return r.ok && /<svg/.test(t); } catch (e) { return false; } };
    const CP = () => win.ZoteroContextPane;
    const ctxNormal = {};
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    async function ensureTab(it) {
        if (tabOfItem(it)) return tabOfItem(it);
        if (it.isNote()) { await win.ZoteroPane.openNote(it.id, { openInWindow: false }); return waitFor(() => tabOfItem(it), 15000, "note tab"); }
        return openPDF(it);
    }
    async function readerReady(id) {
        return waitFor(() => { const r = reader(id); const d = r && r._iframeWindow && r._iframeWindow.document; return d && d.querySelector(".toolbar") ? r : null; }, 20000, "reader " + id);
    }
    async function dockOn(id) {
        assert.isTrue(wv._wvTabDockSet(win, id || libTab().id), "fixture: locked");
        await sleep(700);
    }
    async function dockOff() {
        wv._wvTabDockSet(win, null);
        await sleep(400);
    }
    const zoteroPins = () => typeof ZT.setPinned === "function";
    /** A tab pinned or unpinned as the tab menu does it (split-strip.spec.js). */
    async function pin(t, on) {
        if (String(t.type).startsWith("library") && !zoteroPins()) wv._wvSetLibraryTabPinned(win, t.id, on);
        else if (on && !zoteroPins()) wv._pinTabByCommand(win, Zotero.Items.get(t.data.itemID));
        else wv._wvSetTabPinned(win, t, on);
        try { wv._applyPinnedTabs(win); } catch (er) {}
        await sleep(500);
    }
    /** Every pair separated, no lock, no pin, the three PDFs and the note open. */
    async function fresh() {
        for (const s of pairs().slice()) wv._wvTabSplitSeparate(win, s.id);
        if (dock()) await dockOff();
        win._wvSelTabIDs = new Set();
        const out = [];
        for (const it of [pdf1, pdf2, pdf3, note]) out.push(await ensureTab(it));
        for (const t of ZT._tabs.slice()) { try { if (wv._wvTabIsPinned(win, t)) await pin(t, false); } catch (er) {} }
        await sleep(300);
        return out;
    }
    /** A plain click on tab `id` in the strip -- the tab, or the icon a pinned tab is
     *  drawn as: the tab bar calls the select Zotero bound at its init, past any wrap of
     *  Zotero_Tabs.select (split-first-frame.spec.js); on the locked tab it collapses or
     *  expands the lock instead. */
    const stripClick = (id) => {
        const el = tabEl(id);
        assert.ok(el, "fixture: tab " + id + " in the strip");
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + r.height / 2 };
        for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new win.MouseEvent(type, o));
    };
    /** Tab `id` selected as a user selects it: a click in the strip; the locked tab, which
     *  a click collapses, through Zotero's select (a key that switches tabs, or a press
     *  inside its side, does the same). */
    const clickTab = (id) => {
        if (wv._wvTabDockLib(win) === id) { ZT.select(id); return; }
        stripClick(id);
    };
    /** What a frame would paint now: the locked tab and `id` as the two cards, the
     *  locked tab on its side. */
    const frameState = (lockID, id, lockSide) => {
        const d = deck(), L = doc.getElementById(lockID), X = doc.getElementById(id);
        const split = !!(d.hasAttribute("wv-tsplit") && L && X && L.classList.contains("wv-tsplit-panel") && X.classList.contains("wv-tsplit-panel"));
        const lr = L && L.getBoundingClientRect(), xr = X && X.getBoundingClientRect();
        const both = !!(lr && xr && lr.width > 40 && xr.width > 40 && (lockSide === "right" ? xr.right <= lr.left + 1 : lr.right <= xr.left + 1));
        const others = Array.from(d.children).filter(el => el.classList.contains("wv-tsplit-panel") && el !== L && el !== X).length;
        return split && both && !others ? "split" : "not(split " + split + ", both " + both + ", other cards " + others + ")";
    };
    async function withTabMenu(tabID, fn) {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + tabID + '"], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + tabID + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        // The popup Zotero builds for THIS call, open: a fixed wait read an empty
        // menu once on Zotero 10 with two other test Zoteros up (2026-11-15,
        // wv-test-libdock2-z10-picked2.log), and passed alone on a quiet machine.
        const before = new Set(doc.querySelectorAll("popupset > menupopup"));
        const popup = ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await waitFor(() => {
            const p = popup || Array.from(doc.querySelectorAll("popupset > menupopup")).find(x => !before.has(x));
            return p && p.state === "open";
        }, 5000, "the tab menu of " + tabID + " to open");
        await sleep(300);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const items = [];
        for (const p of pops) for (const ch of p.children) {
            if (ch.hidden || win.getComputedStyle(ch).display === "none") continue;
            items.push(ch);
        }
        try { return await fn(items); }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (er) {} } await sleep(200); }
    }
    const keyOf = (el) => wv._wvTabMenuItemKey(el);
    const entryIn = (items) => items.find(x => keyOf(x) === "dockLibrary") || null;
    // The entry on the locked tab: "Unlock Tab" (a checkbox, checked, until trial.14).
    const saysUnlock = (el) => el.getAttribute("label") === UNLABEL;
    // A plain entry with the lock's gold padlock (MenuManager's icon variables).
    const lockEntryLook = (mi, what) => {
        assert.notStrictEqual(mi.getAttribute("type"), "checkbox", what + ": a plain entry, as Pin Tab, no checkbox");
        assert.notOk(wvT.lib().wvBoolAttrOn(mi, "checked"), what + ": no check mark");
        assert.ok(mi.classList.contains("menuitem-iconic"), what + ": an entry with an icon");
        const icon = win.getComputedStyle(mi).getPropertyValue("--custom-menu-icon-light") || mi.style.getPropertyValue("--custom-menu-icon-light");
        assert.include(icon, GOLD, what + ": the lock's gold padlock, as on the locked tab");
    };
    const listOf = (items) => items.map(x => (keyOf(x) || "-") + ":" + (x.getAttribute("label") || x.localName)).join(" | ");

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabDockSet", "_wvTabDockLib", "_wvTabDockReconcile", "_wvTabDockRecord", "_wvTabDockAdopt", "_wvTabDockMenu",
            "_wvTabDockReverse", "_wvTabDockUnwireAll", "_wvTabSplitCreate", "_wvTabSplitOf", "_wvTabSplitSync", "_wvTabSplitRestore"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(600);
        // What the profile had before any of this (given back in after()).
        ctxNormal.collapsed = CP().collapsed;
        ctxNormal.sidebar = Zotero.Prefs.get("sidebarState");
        pdf1 = await wvT.createTestPDFItem("wv-dock-1");
        pdf2 = await wvT.createTestPDFItem("wv-dock-2");
        pdf3 = await wvT.createTestPDFItem("wv-dock-3");
        note = new Zotero.Item("note"); note.setNote("<p>wv dock note</p>"); await note.saveTx();
        try { ZT.select(libTab().id); } catch (er) {}
        await sleep(400);
    });

    after(async function () {
        if (!win) return;
        try { for (const s of pairs().slice()) wv._wvTabSplitSeparate(win, s.id); } catch (er) {}
        try { wv._wvTabDockSet(win, null); } catch (er) {}
        try { win._wvSelTabIDs = new Set(); } catch (er) {}
        for (const t of ZT._tabs.slice()) { try { if (wv._wvTabIsPinned(win, t)) wv._wvSetTabPinned(win, t, false); } catch (er) {} }
        try { wv._applyPinnedTabs(win); } catch (er) {}
        for (const it of [pdf1, pdf2, pdf3, note]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { for (const t of libTabs().slice(1)) ZT.close(t.id); } catch (er) {}
        try { ZT.select(libTab().id); } catch (er) {}
        try { if (CP().collapsed !== ctxNormal.collapsed) CP().collapsed = ctxNormal.collapsed; } catch (er) {}
        try { if (ctxNormal.sidebar == null) Zotero.Prefs.clear("sidebarState"); else Zotero.Prefs.set("sidebarState", ctxNormal.sidebar); ZT._sidebarState = null; } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3, note);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear(PREF); } catch (er) {}
        try { wv._wvTSplitPending = []; } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(300);
    });

    it("off until a tab is locked: every tab's menu has \"Lock Tab\" with the gold padlock, right after the split entries, \"Unlock Tab\" on the locked tab; locking the library from its menu puts it on the left, the tab you are on on the right, still selected", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        ZT.select(t2.id); await sleep(500);
        assert.notOk(dock(), "no lock on a window nobody locked a tab in");
        assert.notOk(deck().hasAttribute("wv-tsplit"), "Zotero's deck");
        assert.ok(shown(t2.id) && !shown(L.id), "the selected tab alone, as Zotero shows it");
        assert.deepEqual(marked(), [], "nothing marked in the strip");
        assert.notOk(dockRec(), "nothing recorded");
        // A document tab's menu: the entry too.
        await withTabMenu(t1.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi, "a PDF tab's menu has the entry: " + listOf(items));
            assert.strictEqual(mi.getAttribute("label"), LABEL, "Lock Tab while nothing is locked");
            lockEntryLook(mi, "a PDF tab's entry");
        });
        // The library tab's menu: the entry after the split entries.
        await withTabMenu(L.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi, "the library tab's menu has the entry: " + listOf(items));
            assert.strictEqual(mi.getAttribute("label"), LABEL, "Lock Tab while off");
            lockEntryLook(mi, "the library tab's entry");
            const at = items.indexOf(mi);
            assert.match(String(keyOf(items[at - 1])), /^split/, "right after the split entries: " + items.map(x => keyOf(x) || "-").join(" "));
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "the library tab locked");
        assert.strictEqual(ZT.selectedID, t2.id, "the tab you are on stays selected");
        assert.strictEqual(frameState(L.id, t2.id), "split", "the library and the selected tab side by side, the library on the left");
        const rl = shown(L.id), rr = shown(t2.id);
        assert.ok(rl && rr, "both shown");
        assert.approximately(rl.width / (rl.width + rr.width), 0.5, 0.1, "about half each");
        assert.notOk(shown(t1.id), "the other tabs not shown");
        await withTabMenu(L.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi && saysUnlock(mi), "Unlock Tab on the locked tab: " + listOf(items));
            lockEntryLook(mi, "the locked tab's entry");
        });
        await withTabMenu(t1.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi && mi.getAttribute("label") === LABEL, "Lock Tab on another tab: " + listOf(items));
        });
    });

    it("Lock Tab on the tab you are on (a PDF): it goes on the left at once, the tab you viewed before it on the right, selected; switching tabs changes only the right side; selecting the locked tab keeps the last one beside it", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        clickTab(t2.id); await sleep(400);
        clickTab(t1.id); await sleep(400);
        await readerReady(t1.id);
        const order = ZT._tabs.map(t => t.id);
        await withTabMenu(t1.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi, "the PDF tab's menu has the entry: " + listOf(items));
            assert.strictEqual(mi.getAttribute("label"), LABEL, "Lock Tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(800);
        assert.strictEqual(wv._wvTabDockLib(win), t1.id, "the PDF locked");
        assert.strictEqual(ZT.selectedID, t2.id, "the tab viewed before it is the selected one");
        assert.strictEqual(frameState(t1.id, t2.id), "split", "the locked PDF on the left, the tab viewed before it on the right");
        assert.ok(doc.getElementById(t2.id).classList.contains("wv-tsplit-active"), "the right side is the active side");
        assert.deepEqual(marked(), [t1.id], "the locked tab is the one marked in the strip");
        const bad = [];
        for (const t of [t3, tn, L, t2]) {
            clickTab(t.id);
            assert.strictEqual(ZT.selectedID, t.id, "fixture: the click selected the tab");
            const now = frameState(t1.id, t.id);
            if (now !== "split") bad.push(t.id + " at once: " + now);
            await sleep(700);
            if (frameState(t1.id, t.id) !== "split" || !shown(t1.id) || !shown(t.id)) bad.push(t.id + " settled: " + frameState(t1.id, t.id));
            if (JSON.stringify(marked()) !== JSON.stringify([t1.id])) bad.push(t.id + ": marked " + JSON.stringify(marked()));
        }
        assert.deepEqual(bad, [], "the locked PDF beside every selected tab");
        clickTab(t1.id); await sleep(700);
        assert.strictEqual(frameState(t1.id, t2.id), "split", "the locked tab selected: beside the tab shown last");
        assert.ok(doc.getElementById(t1.id).classList.contains("wv-tsplit-active"), "the locked side active");
        assert.deepEqual(ZT._tabs.map(t => t.id), order, "no tab moved");
        assert.lengthOf(pairs(), 0, "no pair was made");
        await withTabMenu(t1.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi && saysUnlock(mi), "Unlock Tab on the locked tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(600);
        assert.notOk(dock(), "Unlock Tab: unlocked");
        assert.notOk(deck().hasAttribute("wv-tsplit"), "Zotero's deck");
    });

    it("Lock Tab on another tab: it goes on the left, the tab you are on stays selected on the right; locking a third tab moves the lock", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        clickTab(t2.id); await sleep(400);
        await withTabMenu(t1.id, async (items) => { entryIn(items).dispatchEvent(new win.Event("command")); });
        await sleep(800);
        assert.strictEqual(wv._wvTabDockLib(win), t1.id, "the other tab locked");
        assert.strictEqual(ZT.selectedID, t2.id, "the tab you are on stays selected");
        assert.strictEqual(frameState(t1.id, t2.id), "split", "the locked tab on the left, the tab you are on on the right");
        await withTabMenu(L.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi && mi.getAttribute("label") === LABEL, "another tab's entry: Lock Tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(800);
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "the lock moved to the library tab");
        assert.strictEqual(ZT.selectedID, t2.id, "still selected");
        assert.strictEqual(frameState(L.id, t2.id), "split", "the library on the left now");
        assert.notOk(shown(t1.id), "the tab locked before is an ordinary tab again");
        assert.deepEqual(marked(), [L.id], "one tab marked");
        assert.lengthOf(((win._wvTSplits) || []).filter(s => s.dock), 1, "one lock in the window");
    });

    it("Enter on an item in the library opens it on the other side and the library stays; selecting items in the library changes nothing there (not a preview)", async function () {
        const [t1, t2, t3] = await fresh();
        const L = libTab();
        ZT.close(t3.id);
        await waitFor(() => !tabOfItem(pdf3), 5000, "fixture: the third PDF closed");
        ZT.select(t2.id); await sleep(300);
        await dockOn();
        // The library side takes the press: the library is the active side.
        doc.getElementById(L.id).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await sleep(500);
        assert.strictEqual(ZT.selectedID, L.id, "a press in the library side selects the library");
        assert.strictEqual(frameState(L.id, t2.id), "split", "the tab shown last stays beside it");
        const ZP = win.ZoteroPane;
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        const n = ZT._tabs.length;
        for (const it of [pdf1, pdf3, pdf2]) {
            await ZP.selectItems([it.id]);
            await sleep(400);
            assert.strictEqual(ZT._tabs.length, n, "selecting an item opens nothing");
            assert.strictEqual(frameState(L.id, t2.id), "split", "selecting " + it.id + " leaves the other side as it was");
        }
        // Enter (zoteroPane.js onItemTreeActivate, the items tree's activate handler).
        await ZP.selectItems([pdf3.id]);
        ZP.onItemTreeActivate(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }), [pdf3]);
        const t3b = await waitFor(() => tabOfItem(pdf3), 20000, "the item's tab");
        await waitFor(() => ZT.selectedID === t3b.id, 5000, "its tab selected");
        assert.strictEqual(frameState(L.id, t3b.id), "split", "the opened item on the other side, the library still on the left");
        await sleep(700);
        assert.ok(shown(L.id) && shown(t3b.id) && !shown(t2.id) && !shown(t1.id), "the library and the opened item, nothing else");
        // An item whose tab is open already: that tab, on the other side.
        doc.getElementById(L.id).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await sleep(300);
        ZP.onItemTreeActivate(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }), [pdf1]);
        await waitFor(() => ZT.selectedID === t1.id, 8000, "the open tab selected");
        await sleep(500);
        assert.strictEqual(frameState(L.id, t1.id), "split", "an item already open: its tab on the other side");
    });

    it("the locked tab selected: it is the active side, beside the tab shown last, which keeps drawing and stays loaded; a press on either side selects it", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        ZT.select(t2.id); await sleep(300);
        await dockOn();
        clickTab(t1.id); await sleep(500);
        await readerReady(t1.id);
        clickTab(L.id);
        assert.strictEqual(frameState(L.id, t1.id), "split", "the locked tab selected: still side by side, at once");
        await sleep(700);
        assert.strictEqual(ZT.selectedID, L.id);
        assert.ok(shown(L.id) && shown(t1.id), "both shown");
        assert.ok(doc.getElementById(L.id).classList.contains("wv-tsplit-active"), "the locked tab is the active side");
        assert.deepEqual(marked(), [L.id], "the locked tab is still the one marked in the strip");
        const r = reader(t1.id);
        assert.ok(r && r._iframe && r._iframe.docShellIsActive, "the PDF beside the locked tab keeps drawing");
        assert.isFalse(ZT.canUnload(t1.id), "Zotero won't unload the tab on screen");
        doc.getElementById(t1.id).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await sleep(500);
        assert.strictEqual(ZT.selectedID, t1.id, "a press on the other side selects its tab");
        assert.isFalse(ZT.canUnload(L.id), "nor the locked tab beside the selected tab");
        doc.getElementById(L.id).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await sleep(500);
        assert.strictEqual(ZT.selectedID, L.id, "and a press in the locked side selects it");
        assert.strictEqual(frameState(L.id, t1.id), "split");
    });

    it("closing the tab on the other side: the tab used before it takes its place; with no other tab the locked tab is alone, as Zotero shows it; the next tab opened is beside it again; closing the locked tab ends the lock", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        ZT.close(tn.id);
        await waitFor(() => !tabOfItem(note), 5000, "fixture: the note closed");
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        for (const t of [t1, t2, t3]) { clickTab(t.id); await sleep(400); }
        clickTab(L.id); await sleep(500);
        assert.strictEqual(frameState(L.id, t3.id), "split", "fixture: the library selected beside the third PDF");
        // Closed from its tab while the locked tab is the active side: nothing selects.
        ZT.close(t3.id);
        await waitFor(() => !tabOfItem(pdf3), 5000, "the tab closed");
        await sleep(700);
        assert.strictEqual(ZT.selectedID, L.id, "the library still selected");
        assert.strictEqual(frameState(L.id, t2.id), "split", "the tab used before it takes the other side");
        assert.ok(shown(L.id) && shown(t2.id), "both shown");
        // Closed while it is the selected tab: Zotero selects another, the library stays.
        clickTab(t2.id); await sleep(500);
        ZT.close(t2.id);
        await waitFor(() => !tabOfItem(pdf2), 5000, "the selected tab closed");
        await sleep(700);
        assert.strictEqual(frameState(L.id, t1.id), "split", "the last tab left beside the library (selected: " + ZT.selectedID + ")");
        // The last other tab closed: the library alone, at full width.
        ZT.close(t1.id);
        await waitFor(() => !tabOfItem(pdf1), 5000, "the last tab closed");
        await sleep(700);
        assert.strictEqual(ZT.selectedID, L.id);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "nothing to show beside it: Zotero's deck");
        assert.approximately(rectOf(L.id).width, deck().getBoundingClientRect().width, 2, "the library at full width");
        noHeadOrRail("a tab shown alone");
        assert.deepEqual(marked(), [L.id], "still locked: its tab keeps the badge");
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "still locked");
        // The next tab opened is beside it.
        const t1b = await openPDF(pdf1);
        await sleep(700);
        assert.strictEqual(ZT.selectedID, t1b.id);
        assert.strictEqual(frameState(L.id, t1b.id), "split", "a new tab: beside the library again");
        // A locked PDF closed: the lock ends.
        const t2b = await openPDF(pdf2);
        await sleep(500);
        await dockOn(t1b.id);
        assert.strictEqual(wv._wvTabDockLib(win), t1b.id, "fixture: the PDF locked");
        ZT.close(t1b.id);
        await waitFor(() => !tabOfItem(pdf1), 5000, "the locked tab closed");
        await sleep(700);
        assert.notOk(dock(), "its tab closed: unlocked");
        assert.notOk(deck().hasAttribute("wv-tsplit"), "Zotero's deck");
        assert.deepEqual(marked(), [], "no badge left");
        assert.notOk(dockRec(), "nothing recorded");
        void t2b;
    });

    // MJT 2026-11-17: "a tab in split view still appears as one single tab on the side
    // of a locked tab" -- the lock comes before a pair made by hand.
    it("the lock comes first: a pair's tab selected shows ALONE beside the locked tab; the pair stays a pair (strip, record, its menus) and shows again once unlocked; locking a paired tab separates its pair", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        ZT.select(t3.id); await sleep(300);
        const p = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "none" });
        assert.ok(p && !p.dock, "fixture: a pair of two PDFs");
        // Its sides in their order in the strip (_wvTabSplitCreate keeps it).
        const pl = p.left, pr = p.right;
        assert.sameMembers([pl, pr], [t1.id, t2.id], "fixture: the pair's two tabs");
        const descOf = (id) => descOfItem(id === t1.id ? pdf1 : pdf2);
        await sleep(500);
        await dockOn(L.id);
        assert.strictEqual(frameState(L.id, t3.id), "split", "fixture: the selected tab beside the locked library");
        const pairRec = () => recs().filter(r => r && !r.dock);
        for (const [t, other] of [[t1, t2], [t2, t1]]) {
            clickTab(t.id);
            assert.strictEqual(frameState(L.id, t.id), "split", t.id + ": the pair's tab alone beside the locked tab, at once");
            await sleep(700);
            assert.strictEqual(frameState(L.id, t.id), "split", t.id + ": settled");
            assert.ok(shown(L.id) && shown(t.id) && !shown(other.id), t.id + ": its partner not on screen");
            assert.isFalse(wv._wvTabSplitVisible(win, other.id), t.id + ": the partner counts as off screen (Zotero may unload it, its reader stops drawing)");
            assert.ok(pairs().includes(p) && p.left === pl && p.right === pr, t.id + ": the pair is still a pair: " + JSON.stringify(pairs().map(x => [x.left, x.right])));
            assert.ok(doc.querySelector('#tab-bar-container .tab[data-id="' + pl + '"][data-wv-tsplit="left"]')
                && doc.querySelector('#tab-bar-container .tab[data-id="' + pr + '"][data-wv-tsplit="right"]'), t.id + ": drawn as a pair in the strip");
            assert.ok(doc.querySelector('#wv-tsplit-pills .wv-tsplit-pill[data-split="' + p.id + '"]'), t.id + ": with its pill");
            assert.strictEqual(wv._wvTabSplitOf(win, t.id), p, t.id + ": its tab menu's split is the pair (Separate, Reverse act on it)");
            assert.deepEqual(marked(), [L.id], t.id + ": the locked tab marked");
        }
        assert.lengthOf(pairRec(), 1, "the pair's record kept: " + JSON.stringify(recs()));
        assert.strictEqual(pairRec()[0].l, descOf(pl));
        assert.strictEqual(pairRec()[0].r, descOf(pr));
        // Reverse Tabs from the pair tab's menu reverses the pair, not the lock.
        wv._wvTabSplitReverse(win, wv._wvTabSplitOf(win, t2.id).id);
        await sleep(500);
        assert.strictEqual(dock().side, "left", "the lock stays on the left");
        assert.ok(p.left === pr && p.right === pl, "the pair reversed");
        assert.strictEqual(frameState(L.id, t2.id), "split", "the selected pair's tab still alone beside the lock");
        wv._wvTabSplitReverse(win, p.id);
        await sleep(500);
        // Unlocked: the pair on screen again.
        clickTab(t2.id); await sleep(500);
        await dockOff();
        await sleep(300);
        const d = deck();
        assert.ok(d.hasAttribute("wv-tsplit") && doc.getElementById(t1.id).classList.contains("wv-tsplit-panel") && doc.getElementById(t2.id).classList.contains("wv-tsplit-panel"), "unlocked: the pair's two cards again");
        assert.ok(shown(t1.id) && shown(t2.id) && !shown(L.id), "the pair on screen, the library not");
        // Locking a tab of the pair separates the pair.
        await dockOn(t1.id);
        assert.lengthOf(pairs(), 0, "the pair separated");
        assert.strictEqual(wv._wvTabDockLib(win), t1.id, "the paired tab locked");
        assert.strictEqual(frameState(t1.id, t2.id), "split", "beside the tab you are on");
        clickTab(tn.id); await sleep(600);
        assert.strictEqual(frameState(t1.id, tn.id), "split", "and beside any other tab");
    });

    it("a tab on screen beside the locked tab takes no second split; a pair made by hand while a tab is locked shows its tabs one by one beside it", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        ZT.select(t3.id); await sleep(300);
        await dockOn();
        assert.isNull(wv._wvTabSplitCreate(win, L.id, t3.id, { select: "none" }), "the locked tab takes no pair");
        assert.isNull(wv._wvTabSplitCreate(win, tn.id, t3.id, { select: "none" }), "nor the tab on screen beside it");
        const p = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "none" });
        assert.ok(p, "two other tabs make a pair as ever");
        await sleep(500);
        assert.strictEqual(frameState(L.id, t3.id), "split", "the selected tab still beside the locked one");
        clickTab(t1.id); await sleep(700);
        assert.strictEqual(frameState(L.id, t1.id), "split", "the pair's tab alone beside the locked one");
        wv._wvTabSplitSeparate(win, p.id);
        await sleep(400);
        assert.lengthOf(pairs(), 0, "Separate on the pair separates the pair");
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "and leaves the lock on");
        clickTab(t2.id); await sleep(600);
        assert.strictEqual(frameState(L.id, t2.id), "split", "separated: its tabs beside the locked one like any tab");
    });

    it("each side as in a pair: the tab beside the locked library starts with its item pane closed, the library side keeps its own panes beside a PDF and a note alike; unlocked, the normal panes are back", async function () {
        const [t1, , , tn] = await fresh();
        const L = libTab();
        const ip = () => libView(L.id).querySelector("item-pane");
        // The normal state: the PDF's item pane open, the library's item pane open.
        ZT.select(t1.id); await sleep(500);
        await readerReady(t1.id);
        const ctxWas = !!CP().collapsed;
        if (CP().collapsed) { CP().togglePane(); await sleep(500); }
        assert.isFalse(!!CP().collapsed, "fixture: the PDF's item pane open in a normal tab");
        ZT.select(L.id); await sleep(500);
        if (ip().collapsed) { win.ZoteroPane.toggleItemPane(); await sleep(500); }
        assert.isFalse(!!ip().collapsed, "fixture: the library's item pane open in a normal tab");
        ZT.select(t1.id); await sleep(400);
        await dockOn();
        assert.strictEqual(frameState(L.id, t1.id), "split", "fixture: the PDF beside the library");
        assert.isTrue(!!CP().collapsed, "the PDF beside the library starts with its item pane closed (as a pair's PDF side)");
        assert.isFalse(!!ip().collapsed, "the library side starts from what it showed");
        // The library side's own: its item pane closed here.
        clickTab(L.id); await sleep(600);
        win.ZoteroPane.toggleItemPane();
        await sleep(600);
        assert.isTrue(!!ip().collapsed, "fixture: the library side's item pane closed");
        clickTab(tn.id); await sleep(800);
        assert.strictEqual(frameState(L.id, tn.id), "split", "the note beside the library");
        assert.isTrue(!!ip().collapsed, "beside a note the library side keeps its own panes");
        clickTab(t1.id); await sleep(800);
        assert.isTrue(!!ip().collapsed, "and beside the PDF again");
        assert.isTrue(!!CP().collapsed, "the PDF's item pane still closed here");
        await dockOff();
        assert.notOk(deck().hasAttribute("wv-tsplit"));
        assert.isFalse(!!CP().collapsed, "unlocked: the PDF's item pane as in a normal tab");
        ZT.select(L.id); await sleep(600);
        assert.isFalse(!!ip().collapsed, "and the library's item pane");
        if (ctxWas) { ZT.select(t1.id); await sleep(400); CP().togglePane(); await sleep(400); }
    });

    // Found with the case above (11.0-beta.4, 2026-11-15): a library side's item pane
    // closed inside ANY split stayed closed after it. The split view keeps a library
    // view's `zotero-persist` attributes per side, and the pane's open state is not one
    // of them: it is the pane's own `collapsed` attribute (collapsiblePane.mjs
    // setPaneCollapsed). Zotero persists it as the splitter's `state`; with Weavero's
    // "stops at minimum width" setting on (the default), which sets the splitter's
    // `collapse` attribute aside, writing that state back neither closes nor opens the
    // pane (measured: D:/tmp/libdock-probe2-z11.txt).
    it("a library side's item pane closed inside a split is open again when the split ends: a pair, and the locked library (alone again: open; beside the next tab: closed again)", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        const ip = () => libView(L.id).querySelector("item-pane");
        for (const t of [t2, t3, tn]) ZT.close(t.id);
        await waitFor(() => !tabOfItem(pdf2) && !tabOfItem(pdf3) && !tabOfItem(note), 5000, "fixture: one PDF left");
        ZT.select(L.id); await sleep(500);
        if (ip().collapsed) { win.ZoteroPane.toggleItemPane(); await sleep(500); }
        const w0 = ip().getAttribute("width");
        assert.isFalse(!!ip().collapsed, "fixture: the library's item pane open in a normal tab");
        // A pair.
        ZT.select(t1.id); await sleep(400);
        const p = wv._wvTabSplitCreate(win, L.id, t1.id, { select: "none" });
        assert.ok(p, "fixture: a pair of the library and the PDF");
        await sleep(700);
        ZT.select(L.id); await sleep(600);
        win.ZoteroPane.toggleItemPane(); await sleep(600);
        assert.isTrue(!!ip().collapsed, "fixture: closed inside the pair");
        wv._wvTabSplitSeparate(win, p.id);
        await sleep(700);
        assert.isFalse(!!ip().collapsed, "the pair separated: the library's item pane open again");
        assert.strictEqual(ip().getAttribute("width"), w0, "at its width");
        // The locked library.
        ZT.select(t1.id); await sleep(400);
        await dockOn();
        clickTab(L.id); await sleep(600);
        win.ZoteroPane.toggleItemPane(); await sleep(600);
        assert.isTrue(!!ip().collapsed, "fixture: closed beside the PDF");
        ZT.close(t1.id);
        await waitFor(() => !tabOfItem(pdf1), 5000, "the PDF closed");
        await sleep(800);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "fixture: the library alone");
        assert.isFalse(!!ip().collapsed, "the library alone again: its normal item pane, open");
        assert.strictEqual(ip().getAttribute("width"), w0, "at its width");
        const t1b = await openPDF(pdf1);
        await sleep(900);
        assert.strictEqual(frameState(L.id, t1b.id), "split", "fixture: beside the next tab");
        assert.isTrue(!!ip().collapsed, "beside the next tab: the side's own item pane, closed again");
        await dockOff();
        ZT.select(L.id); await sleep(600);
        assert.isFalse(!!ip().collapsed, "unlocked: open again");
    });

    it("Reverse Tabs puts the locked tab on the other side and the bar between the two resizes them; both hold across tab switches and are recorded", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        const s = dockSplit();
        assert.ok(s, "fixture: on screen");
        wv._wvTabSplitReverse(win, s.id);
        await sleep(600);
        assert.strictEqual(frameState(L.id, t1.id, "right"), "split", "the locked tab on the right");
        assert.strictEqual(dock().side, "right");
        clickTab(t2.id); await sleep(600);
        assert.strictEqual(frameState(L.id, t2.id, "right"), "split", "still on the right beside another tab");
        // The bar between them (the split's own splitter).
        const sp = doc.querySelector("#wv-tsplit-layer .wv-tsplit-splitter");
        assert.ok(sp, "a splitter");
        const w0 = rectOf(t2.id).width;
        const r = sp.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const pe = (type, d) => sp.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
            clientX: x + d, clientY: y, screenX: Math.round(win.mozInnerScreenX + x + d), screenY: Math.round(win.mozInnerScreenY + y), isPrimary: true, pointerType: "mouse" }));
        pe("pointerdown", 0); pe("pointermove", -100); pe("pointermove", -200); pe("pointerup", -200);
        await sleep(400);
        assert.approximately(rectOf(t2.id).width, w0 - 200, 4, "dragged 200px: the left side narrower");
        const wl = rectOf(t2.id).width;
        clickTab(t1.id); await sleep(600);
        assert.approximately(rectOf(t1.id).width, wl, 2, "another tab takes the same width");
        const rec = dockRec();
        assert.ok(rec && rec.side === "right" && Math.abs(Number(rec.ratio) - dockSplit().ratio) < 0.002, "side and ratio recorded: " + JSON.stringify(rec));
        wv._wvTabSplitReverse(win, dockSplit().id);
        await sleep(500);
        assert.strictEqual(frameState(L.id, t1.id), "split", "reversed again: the locked tab on the left");
        assert.approximately(rectOf(t1.id).width, wl, 4, "each side keeps its width when the sides swap");
    });

    // No header over the locked side (MJT 2026-11-17, trial.9: "This top bar is also not
    // needed"): the lock is drawn in the strip only, and its card is a card like the other.
    const checkNoHead = (lockID, otherID, sel, lockSide) => {
        const what = "locked on the " + lockSide + ", " + (sel === lockID ? "the locked tab" : "the other tab") + " selected";
        assert.strictEqual(ZT.selectedID, sel, what + ": fixture: selected");
        assert.strictEqual(frameState(lockID, otherID, lockSide), "split", what + ": fixture: on screen");
        noHeadOrRail(what);
        const cr = rectOf(lockID);
        const first = firstShown(lockID);
        assert.ok(first, what + ": fixture: the card shows something");
        assert.approximately(first.getBoundingClientRect().top, cr.top + 1, 1, what + ": the card's content from its top, inside its border (" + first.localName + ")");
    };

    it("no header over the locked side and no room kept at its card's top, on either side, whichever side is selected; a locked PDF's reader and its item pane from its card's top", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        checkNoHead(L.id, t1.id, t1.id, "left");
        const tbs = libToolbars(L.id);
        assert.isAbove(tbs.length, 0, "fixture: the library's toolbars");
        // (Zotero 10 puts its banners above the trees: the toolbars are not always first.)
        for (const tb of tbs) assert.isAtLeast(tb.getBoundingClientRect().top, rectOf(L.id).top + 0.5, "Zotero's " + tb.id + " inside the card, nothing over it");
        clickTab(L.id); await sleep(600);
        checkNoHead(L.id, t1.id, L.id, "left");
        wv._wvTabSplitReverse(win, dockSplit().id);
        await sleep(700);
        checkNoHead(L.id, t1.id, L.id, "right");
        clickTab(t1.id); await sleep(600);
        checkNoHead(L.id, t1.id, t1.id, "right");
        wv._wvTabSplitReverse(win, dockSplit().id);
        await sleep(700);
        // A locked PDF.
        await dockOff();
        clickTab(t2.id); await sleep(300);
        await dockOn(t1.id);
        await readerReady(t1.id);
        await sleep(400);
        checkNoHead(t1.id, t2.id, t2.id, "left");
        clickTab(t1.id); await sleep(600);
        checkNoHead(t1.id, t2.id, t1.id, "left");
        const r = reader(t1.id);
        assert.approximately(r._iframe.getBoundingClientRect().top, rectOf(t1.id).top + 1, 1, "the reader from the card's top");
        // Its item pane opened: from the card's top too.
        if (CP().collapsed) { CP().togglePane(); await sleep(700); }
        const pr = doc.getElementById("zotero-context-pane").getBoundingClientRect();
        assert.ok(pr.width > 0, "fixture: the item pane drawn");
        assert.approximately(pr.top, rectOf(t1.id).top + 1, 1, "the item pane from the card's top");
        CP().togglePane(); await sleep(400);
        await dockOff();
    });

    // MJT 2026-11-17, trial.9: no Unlock button any more; the tab's menu unlocks.
    it("the locked tab's right-click menu -- a right press and a contextmenu in the strip -- unlocks it with Unlock Tab: Zotero's deck, the selection kept, no mark, no tooltip line, nothing recorded", async function () {
        const [t1] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        assert.include(tipOf(L.id), TIP_OPEN, "fixture: the tooltip line");
        const el = tabEl(L.id);
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left + Math.min(10, r.width / 2)), y = Math.round(r.top + r.height / 2);
        const o = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: x, clientY: y, screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y) };
        el.dispatchEvent(new win.MouseEvent("mousedown", o));
        assert.strictEqual(ZT.selectedID, t1.id, "a right press selects nothing");
        assert.notOk(dock().collapsed, "nor collapses the lock");
        el.dispatchEvent(new win.MouseEvent("contextmenu", o));
        const openMenu = () => Array.from(doc.querySelectorAll("popupset > menupopup"))
            .find(p => (p.state === "open" || p.state === "showing") && Array.from(p.children).some(ch => keyOf(ch) === "dockLibrary"));
        const pop = await waitFor(openMenu, 5000, "the locked tab's menu to open");
        await sleep(300);
        const mi = Array.from(pop.children).find(ch => keyOf(ch) === "dockLibrary");
        try {
            assert.ok(mi && saysUnlock(mi), "Unlock Tab");
            mi.dispatchEvent(new win.Event("command"));
        }
        finally { try { pop.hidePopup(); } catch (er) {} }
        await sleep(600);
        assert.notOk(dock(), "unlocked");
        assert.notOk(deck().hasAttribute("wv-tsplit"), "Zotero's deck");
        assert.strictEqual(ZT.selectedID, t1.id, "the selected tab stays selected");
        assert.ok(shown(t1.id) && !shown(L.id), "the selected tab alone");
        assert.deepEqual(marked(), [], "no mark in the strip");
        assert.notInclude(tipOf(L.id), "Locked tab", "no tooltip line");
        assert.notOk(dockRec(), "nothing recorded");
        noHeadOrRail("unlocked");
    });

    // MJT 2026-11-17 on trial.8, a screenshot: "there are 2 sidebars on the right side" --
    // My Library locked beside a note, the library selected, Unlock: the library filled
    // the deck and Zotero's item pane stayed open on the right with the note's item.
    // Zotero puts its context pane away for a library tab only when a tab is SELECTED
    // (contextPane.js _handleTabSelect); a split leaving the screen while the library is
    // already selected selects nothing.
    it("unlocked, or a pair separated, with the library selected: Zotero's library state is back -- the item pane of the tab beside it put away, its splitter hidden, the deck at full width", async function () {
        const [t1, , , tn] = await fresh();
        const L = libTab();
        const pane = () => doc.getElementById("zotero-context-pane");
        const splitter = () => doc.getElementById("zotero-context-splitter");
        const on = (el, a) => wvT.lib().wvBoolAttrOn(el, a);
        const libState = (what) => {
            assert.strictEqual(ZT.selectedID, L.id, what + ": fixture: the library selected");
            assert.notOk(deck().hasAttribute("wv-tsplit"), what + ": Zotero's deck");
            assert.isTrue(on(pane(), "collapsed"), what + ": the item pane of the tab beside it put away");
            assert.isTrue(on(splitter(), "hidden"), what + ": its splitter hidden");
            const dr = deck().getBoundingClientRect(), hr = deck().parentNode.getBoundingClientRect();
            assert.approximately(dr.width, hr.width, 2, what + ": the deck at full width");
        };
        const paneOpen = async () => { if (CP().collapsed) { CP().togglePane(); await sleep(500); } };
        // Locked, a note beside the library, its item pane open; the library selected.
        clickTab(tn.id); await sleep(400);
        await dockOn(L.id);
        assert.strictEqual(frameState(L.id, tn.id), "split", "fixture: the note beside the locked library");
        await paneOpen();
        clickTab(L.id); await sleep(800);
        assert.isFalse(on(pane(), "collapsed"), "fixture: the note's item pane beside the selected library");
        // (trial.8 had an Unlock button in a header: its path is Separate Split View's.)
        wv._wvTabSplitSeparate(win, dockSplit().id);
        await sleep(800);
        libState("Separate Split View on the lock");
        // Locked again, then Unlock Tab from its menu.
        clickTab(tn.id); await sleep(400);
        await dockOn(L.id);
        await paneOpen();
        clickTab(L.id); await sleep(800);
        await withTabMenu(L.id, async (items) => { entryIn(items).dispatchEvent(new win.Event("command")); });
        await sleep(800);
        libState("Unlock Tab");
        // A pair made by hand: library|note and library|PDF, Separate with the library selected.
        for (const [t, name] of [[tn, "note"], [t1, "PDF"]]) {
            clickTab(t.id); await sleep(400);
            if (t === t1) await readerReady(t1.id);
            const p = wv._wvTabSplitCreate(win, L.id, t.id, { select: "none" });
            assert.ok(p, name + ": fixture: a pair");
            await sleep(600);
            await paneOpen();
            clickTab(L.id); await sleep(800);
            wv._wvTabSplitSeparate(win, p.id);
            await sleep(800);
            libState("Separate on a library|" + name + " pair");
        }
    });

    // MJT 2026-11-17: "For the locked tab, it would be useful to have a quick way to
    // collapse it"; on trial.9, of the rail it collapsed to first: "The left band is not
    // needed. A click on the tab header should be sufficient", and of the header: "Try
    // making a click on the tab header to toggle it collapsed or expanded." A PLAIN click
    // in the strip (stripClick: the tab bar's own mousedown / mouseup / click, never
    // Zotero_Tabs.select).
    it("collapse: a plain click on the locked tab in the strip takes its side off the screen -- the tab you are on alone at the deck's full width with its own panes, still selected -- and a click again brings it back at its ratio, the selection kept; it never selects the locked tab; switching tabs while collapsed shows each alone; the menu entry and the command do the same; selecting the locked tab another way expands it; recorded; unlocking clears it", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        clickTab(t1.id); await sleep(300);
        await dockOn(L.id);
        dockSplit().ratio = 0.4;
        wv._wvTabSplitSync(win); await sleep(600);
        const ratio0 = dockSplit().ratio;
        const wl0 = rectOf(L.id).width;
        const line = () => tipOf(L.id).split("\n").pop();
        const collapsedState = (activeID, what) => {
            assert.isTrue(!!dock().collapsed, what + ": collapsed");
            assert.strictEqual(wv._wvTabDockLib(win), L.id, what + ": still locked");
            assert.strictEqual(ZT.selectedID, activeID, what + ": the tab you are on selected");
            assert.notOk(deck().hasAttribute("wv-tsplit"), what + ": Zotero's deck, as for a tab alone");
            assert.notOk(shown(L.id), what + ": the locked tab not drawn");
            const ar = shown(activeID);
            assert.ok(ar, what + ": the tab you are on shown");
            assert.approximately(ar.width, deck().getBoundingClientRect().width, 1, what + ": at the deck's full width");
            assert.notOk(doc.getElementById("zotero-context-pane").style.getPropertyValue("--wv-tsplit-pane-x"), what + ": its panes Zotero's own, where Zotero puts them");
            noHeadOrRail(what);
            assert.deepEqual(marked(), [L.id], what + ": the mark stays");
            assert.strictEqual(line(), TIP_COLLAPSED, what + ": its tooltip says a click expands it");
        };
        const expandedState = (activeID, what) => {
            assert.notOk(dock().collapsed, what + ": expanded");
            assert.strictEqual(ZT.selectedID, activeID, what + ": the selection kept");
            assert.strictEqual(frameState(L.id, activeID), "split", what + ": both sides again");
            assert.approximately(dockSplit().ratio, ratio0, 0.0005, what + ": the ratio kept");
            assert.approximately(rectOf(L.id).width, wl0, 2, what + ": at its width");
            noHeadOrRail(what);
            assert.strictEqual(line(), TIP_OPEN, what + ": its tooltip says a click collapses it");
        };
        assert.strictEqual(line(), TIP_OPEN, "fixture: the tooltip line");
        stripClick(L.id); await sleep(700);
        collapsedState(t1.id, "a click on the locked tab");
        // Switching tabs: each alone.
        clickTab(t2.id); await sleep(700);
        collapsedState(t2.id, "another tab selected");
        stripClick(L.id); await sleep(700);
        expandedState(t2.id, "a click again");
        // The locked tab selected (a press inside its side): a click on its tab collapses
        // it, the tab beside it keeps the window, selected.
        doc.getElementById(L.id).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await sleep(500);
        assert.strictEqual(ZT.selectedID, L.id, "fixture: a press in the locked side selects it");
        stripClick(L.id); await sleep(700);
        collapsedState(t2.id, "a click on the locked tab while it is selected");
        // The locked tab's menu: Expand Locked Tab; no entry on another tab.
        const colEntry = (items) => items.find(x => keyOf(x) === "dockCollapse") || null;
        await withTabMenu(L.id, async (items) => {
            const mi = colEntry(items);
            assert.ok(mi, "the locked tab's menu has the entry: " + listOf(items));
            assert.strictEqual(mi.getAttribute("label"), "Expand Locked Tab");
            assert.strictEqual(items[items.indexOf(mi) - 1], entryIn(items), "right after Lock Tab");
        });
        await withTabMenu(t2.id, async (items) => { assert.notOk(colEntry(items), "not on another tab: " + listOf(items)); });
        // The record keeps it, across a restart.
        wv._wvTabSplitPersist();
        assert.strictEqual(dockRec().col, 1, "recorded collapsed: " + JSON.stringify(dockRec()));
        const all = recs();
        delete win._wvTDock;
        win._wvTSplits = [];
        wv._wvTabSplitSync(win);
        await sleep(300);
        assert.deepEqual(marked(), [], "fixture: as after a restart");
        Zotero.Prefs.set(PREF, JSON.stringify(all));
        wv._wvTSplitPending = null;
        wv._wvTabSplitRestore(win);
        await sleep(800);
        collapsedState(t2.id, "after a restart");
        wv._wvTSplitPending = [];
        // The menu entry expands it, and collapses it.
        await withTabMenu(L.id, async (items) => {
            const mi = colEntry(items);
            assert.strictEqual(mi && mi.getAttribute("label"), "Expand Locked Tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(700);
        expandedState(t2.id, "the menu entry");
        await withTabMenu(L.id, async (items) => {
            const mi = colEntry(items);
            assert.strictEqual(mi && mi.getAttribute("label"), "Collapse Locked Tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(700);
        collapsedState(t2.id, "the menu entry");
        // The command (for a keyboard shortcut), both ways.
        assert.isTrue(wv._wvTabDockToggleCollapsed(win), "the command");
        await sleep(600);
        expandedState(t2.id, "the command");
        assert.isTrue(wv._wvTabDockToggleCollapsed(win), "the command again");
        await sleep(600);
        collapsedState(t2.id, "the command again");
        // Selecting the locked tab another way (Zotero's select, as a key that switches
        // tabs does): shown, expanded, selected.
        ZT.select(L.id); await sleep(700);
        assert.notOk(dock().collapsed, "the locked tab selected: expanded");
        assert.strictEqual(ZT.selectedID, L.id, "and selected");
        assert.strictEqual(frameState(L.id, t2.id), "split", "beside the tab shown last");
        // Locked on the right: the same.
        clickTab(t2.id); await sleep(500);
        wv._wvTabSplitReverse(win, dockSplit().id); await sleep(600);
        stripClick(L.id); await sleep(700);
        assert.isTrue(!!dock().collapsed, "locked on the right: a click collapses it");
        assert.ok(shown(t2.id) && !shown(L.id) && !deck().hasAttribute("wv-tsplit"), "locked on the right: the tab you are on alone");
        stripClick(L.id); await sleep(700);
        assert.strictEqual(frameState(L.id, t2.id, "right"), "split", "locked on the right: a click expands it again");
        wv._wvTabSplitReverse(win, dockSplit().id); await sleep(500);
        // Unlocking clears it.
        stripClick(L.id); await sleep(600);
        assert.isTrue(!!dock().collapsed, "fixture: collapsed");
        await dockOff();
        assert.notOk(dock(), "unlocked");
        assert.ok(shown(t2.id), "the selected tab shown");
        assert.deepEqual(marked(), [], "no mark");
        assert.notInclude(tipOf(L.id), "Locked tab", "no tooltip line");
        noHeadOrRail("unlocked");
        await dockOn(L.id);
        assert.notOk(dock().collapsed, "locked again: expanded");
        assert.strictEqual(frameState(L.id, t2.id), "split");
    });

    it("collapsed: a pair's tab selected shows its pair as ever; expanding from it shows that tab alone beside the locked tab, the pair kept; collapsed again, the pair again", async function () {
        const [t1, t2, t3] = await fresh();
        const L = libTab();
        clickTab(t3.id); await sleep(300);
        const p = wv._wvTabSplitCreate(win, t1.id, t2.id, { select: "none" });
        assert.ok(p, "fixture: a pair of two PDFs");
        await sleep(500);
        await dockOn(L.id);
        try {
            stripClick(L.id); await sleep(700);
            assert.isTrue(!!dock().collapsed, "fixture: collapsed");
            assert.ok(shown(t3.id) && !deck().hasAttribute("wv-tsplit"), "fixture: the tab you are on alone");
            clickTab(t1.id); await sleep(800);
            assert.strictEqual(ZT.selectedID, t1.id, "fixture: the pair's tab selected");
            assert.ok(deck().hasAttribute("wv-tsplit"), "a split on screen");
            assert.strictEqual(wv._wvTabSplitShownOf(win, t1.id), p, "the pair is the split on screen");
            assert.ok(shown(t1.id) && shown(t2.id), "the pair drawn as ever, both its tabs");
            assert.notOk(shown(L.id), "the locked tab not");
            assert.isTrue(!!dock().collapsed, "still collapsed");
            assert.deepEqual(marked(), [L.id], "still marked");
            // A click on the locked tab: that tab alone beside it.
            stripClick(L.id); await sleep(800);
            assert.notOk(dock().collapsed, "expanded");
            assert.strictEqual(ZT.selectedID, t1.id, "the selection kept");
            assert.strictEqual(frameState(L.id, t1.id), "split", "the pair's tab alone beside the locked tab");
            assert.notOk(shown(t2.id), "its partner not on screen");
            assert.ok(pairs().includes(p) && p.left && p.right, "the pair is still a pair");
            // Collapsed again: the pair again.
            stripClick(L.id); await sleep(800);
            assert.isTrue(!!dock().collapsed, "collapsed again");
            assert.ok(shown(t1.id) && shown(t2.id) && !shown(L.id), "the pair as ever");
        }
        finally {
            try { wv._wvTabSplitSeparate(win, p.id); } catch (er) {}
            await dockOff();
        }
    });

    it("a drag of the locked tab in the strip still moves it: the press selects nothing, no click collapses it", async function () {
        const [t1, t2, t3] = await fresh();
        if (typeof win.DragEvent !== "function" || typeof win.DataTransfer !== "function") this.skip();
        const cont = doc.getElementById("tab-bar-container");
        for (const t of [t1, t2, t3]) ZT.move(t.id, ZT._tabs.length);
        await sleep(400);
        const idx = (id) => ZT._tabs.findIndex(t => t.id === id);
        assert.ok(idx(t1.id) < idx(t2.id) && idx(t2.id) < idx(t3.id), "fixture: the three PDFs in order");
        clickTab(t3.id); await sleep(300);
        await dockOn(t2.id);
        assert.strictEqual(frameState(t2.id, t3.id), "split", "fixture: the second PDF locked beside the third");
        const dragEv = (type, x, y, dt, target) => target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
            screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y), dataTransfer: dt }));
        const src = tabEl(t2.id), r = src.getBoundingClientRect();
        const y = Math.round(r.top + r.height / 2), x0 = Math.round(r.left + r.width / 2);
        try {
            // The press a real drag starts with (stopped in the strip: no select).
            src.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, clientX: x0, clientY: y }));
            assert.strictEqual(ZT.selectedID, t3.id, "the press on the locked tab selected nothing");
            const dt = new win.DataTransfer();
            dragEv("dragstart", x0, y, dt, src);
            const r1 = tabEl(t1.id).getBoundingClientRect();
            let target = src;
            for (const x of [x0 - 20, Math.round(r1.left + 10), Math.round(r1.left + 6)]) {
                target = doc.elementFromPoint(x, y);
                if (!target || !cont.contains(target)) target = cont;
                dragEv("dragover", x, y, dt, target);
                await sleep(40);
            }
            dt.dropEffect = "move";
            dragEv("drop", Math.round(r1.left + 6), y, dt, target);
            dragEv("dragend", Math.round(r1.left + 6), y, dt, src);
            // (A drag ends with no click: Gecko fires none after one.)
            await sleep(900);
            assert.isBelow(idx(t2.id), idx(t1.id), "the locked tab moved before the first PDF: " + ZT._tabs.map(t => t.id).join(" "));
            assert.strictEqual(wv._wvTabDockLib(win), t2.id, "still locked");
            assert.notOk(dock().collapsed, "not collapsed");
            assert.strictEqual(ZT.selectedID, t3.id, "the selection kept");
            assert.deepEqual(marked(), [t2.id], "still marked");
            assert.strictEqual(frameState(t2.id, t3.id), "split", "still beside the tab you are on");
        }
        finally {
            await dockOff();
            ZT.move(t2.id, idx(t1.id) + 1);
            await sleep(300);
        }
    });

    // MJT 2026-11-17 on trial.11: a PDF locked on the left, its annotation sidebar and its
    // item pane closed, a PDF beside it -- "When I go to the note tab, it toggles both
    // panes in the locked tab" (both opened: the note side's panes are Zotero's, and the
    // split gave its own up for them). A locked tab keeps its own panes whatever is beside
    // it; the note side has Zotero's own.
    it("a locked PDF keeps its own sidebar and item pane beside a note and as the other side switches between a note and a PDF -- closed ones stay closed, open ones stay open; the note side has Zotero's own item pane", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const sidebarOpen = (id) => { const r = reader(id); return !!(r && r._internalReader && r._internalReader._state && r._internalReader._state.sidebarOpen); };
        const rdoc = (id) => { const r = reader(id); return r && r._iframeWindow && r._iframeWindow.document; };
        const pane = () => doc.getElementById("zotero-context-pane");
        const ghost = () => doc.getElementById("wv-tsplit-ghost");
        const hitInside = (el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
            return !!(hit && (el === hit || el.contains(hit)));
        };
        const within = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        // An item pane drawn over the card of tab `id` (Zotero's, or the side's own).
        const paneIn = (id) => [pane(), ghost()].some(el => el && hitInside(el) && within(el.getBoundingClientRect(), rectOf(id)));
        const sbWas = Zotero.Prefs.get("sidebarState");
        const ctxWas = !!CP().collapsed;
        try {
            // The normal state open, as MJT had it: the item pane and the reader sidebar.
            clickTab(t3.id); await sleep(500);
            await readerReady(t3.id);
            if (CP().collapsed) { CP().togglePane(); await sleep(500); }
            if (!sidebarOpen(t3.id)) { rdoc(t3.id).querySelector("#sidebarToggle").click(); await sleep(600); }
            assert.isTrue(!CP().collapsed && sidebarOpen(t3.id), "fixture: the normal item pane and sidebar open");
            // The first PDF locked beside the second: a reader side starts with its panes closed.
            clickTab(t2.id); await sleep(400);
            await dockOn(t1.id);
            await readerReady(t1.id); await readerReady(t2.id);
            await sleep(500);
            const state = (what, open) => {
                assert.strictEqual(sidebarOpen(t1.id), open, what + ": the locked PDF's sidebar " + (open ? "open" : "closed"));
                assert.strictEqual(paneIn(t1.id), open, what + ": its item pane " + (open ? "open" : "closed"));
            };
            state("beside a PDF", false);
            for (const [t, name] of [[tn, "a note selected beside it"], [t2, "the PDF again"], [tn, "the note again"]]) {
                clickTab(t.id); await sleep(900);
                assert.strictEqual(frameState(t1.id, t.id), "split", name + ": fixture: beside the locked PDF");
                state(name, false);
            }
            // The note side: Zotero's own item pane, open as in a normal tab.
            assert.isFalse(!!CP().collapsed, "the note side: Zotero's own item pane, open");
            assert.ok(paneIn(tn.id), "drawn over the note's card");
            // The locked PDF's own panes opened.
            ZT.select(t1.id); await sleep(800);
            CP().togglePane(); await sleep(600);
            rdoc(t1.id).querySelector("#sidebarToggle").click(); await sleep(700);
            state("opened on the locked PDF", true);
            for (const [t, name] of [[tn, "a note selected beside it"], [t2, "the PDF beside it"], [tn, "the note again"]]) {
                clickTab(t.id); await sleep(900);
                state(name + " (opened)", true);
            }
            // Unlocked: the normal state as it was.
            await dockOff();
            clickTab(t3.id); await sleep(600);
            assert.isTrue(!CP().collapsed && sidebarOpen(t3.id), "unlocked: the normal item pane and sidebar as they were");
        }
        finally {
            if (dock()) await dockOff();
            try { if (!!CP().collapsed !== ctxWas) CP().togglePane(); } catch (er) {}
            try { if (sbWas == null) Zotero.Prefs.clear("sidebarState"); else Zotero.Prefs.set("sidebarState", sbWas); ZT._sidebarState = null; } catch (er) {}
            await sleep(300);
        }
    });

    // MJT 2026-11-18 on trial.14, a PDF locked on the left and selected, a note beside it
    // with its item pane drawn: "I cannot toggle the pane while the locked tab is
    // focused" -- the button of the note's pane (the side not selected, its own copy of
    // the pane) wrote a state the note side never reads, and nothing closed. The note
    // beside a locked reader has Zotero's own pane (tab-split.ts _wvTabSplitNormalSide):
    // its button closes that one.
    it("the note beside a locked PDF that is selected: the button on the note's item pane closes it, without selecting the note; the note selected, its pane stays closed", async function () {
        const [t1, , t3, tn] = await fresh();
        const pane = () => doc.getElementById("zotero-context-pane");
        const ghost = () => doc.getElementById("wv-tsplit-ghost");
        const hitInside = (el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
            return !!(hit && (el === hit || el.contains(hit)));
        };
        const within = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        const paneIn = (id) => [pane(), ghost()].some(el => el && hitInside(el) && within(el.getBoundingClientRect(), rectOf(id)));
        const ctxWas = !!CP().collapsed;
        try {
            // Zotero's item pane open, as MJT had it.
            clickTab(t3.id); await sleep(500);
            await readerReady(t3.id);
            if (CP().collapsed) { CP().togglePane(); await sleep(500); }
            assert.isFalse(!!CP().collapsed, "fixture: Zotero's item pane open");
            // The note selected, the first PDF locked: the PDF on the left, the note on
            // the right with Zotero's own pane.
            clickTab(tn.id); await sleep(500);
            await dockOn(t1.id);
            await readerReady(t1.id);
            assert.strictEqual(frameState(t1.id, tn.id), "split", "fixture: the locked PDF beside the note");
            // The locked PDF selected: the note's pane is the side's own copy.
            ZT.select(t1.id); await sleep(900);
            assert.ok(paneIn(tn.id), "fixture: the note's item pane drawn over its card");
            const g = ghost();
            const btn = g && g.querySelector('[data-action="toggle-pane"]');
            if (!btn || btn.getBoundingClientRect().width < 1) this.skip();   // no such button on this Zotero (its sidenav has none)
            btn.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
            await sleep(800);
            assert.strictEqual(ZT.selectedID, t1.id, "the locked PDF still selected");
            assert.isFalse(paneIn(tn.id), "the note's item pane closed");
            assert.strictEqual(frameState(t1.id, tn.id), "split", "still side by side");
            // The note selected: Zotero's own pane, closed as it was left.
            clickTab(tn.id); await sleep(900);
            assert.isTrue(!!CP().collapsed, "the note selected: Zotero's item pane closed");
            assert.isFalse(paneIn(tn.id), "nothing drawn over the note's card");
        }
        finally {
            if (dock()) await dockOff();
            try { if (!!CP().collapsed !== ctxWas) CP().togglePane(); } catch (er) {}
            await sleep(300);
        }
    });

    // MJT 2026-11-17, on the trial build: "When a new tab is loaded with the locked
    // split view, both sides get hidden and shown again. Only the new loading tab
    // should refresh the view, with the locked split view stable."
    it("a NEW tab opened while a tab is locked (a PDF opened from the locked library, a note, a PDF from another tab) never shows a frame without the locked side, nor moves it: only the active side changes", async function () {
        const [t1, , t3, tn] = await fresh();
        const L = libTab();
        ZT.close(t3.id); ZT.close(tn.id);
        await waitFor(() => !tabOfItem(pdf3) && !tabOfItem(note), 5000, "fixture: the third PDF and the note closed");
        ZT.select(t1.id); await sleep(300);
        await dockOn(L.id);
        await readerReady(t1.id);
        const bad = [], log = [];
        const watch = async (name, fromID, open, itemOf) => {
            clickTab(fromID); await sleep(800);
            assert.ok(deck().hasAttribute("wv-tsplit") && shown(L.id) && doc.getElementById(L.id).classList.contains("wv-tsplit-panel"), name + ": fixture: the locked library on screen");
            const lr0 = rectOf(L.id);
            // The locked card's own content too (a library view hidden inside a card
            // that stays would pass the card's checks), and the deck itself.
            const content = () => libView(L.id);
            const cr0 = content().getBoundingClientRect();
            const state = () => {
                const d = deck(), el = doc.getElementById(L.id);
                const r = el.getBoundingClientRect();
                const ok = d.hasAttribute("wv-tsplit") && el.classList.contains("wv-tsplit-panel") && win.getComputedStyle(el).visibility !== "hidden" && r.width > 40;
                const same = Math.abs(r.left - lr0.left) < 1 && Math.abs(r.width - lr0.width) < 1;
                const c = content(), cs = win.getComputedStyle(c), cr = c.getBoundingClientRect();
                const cOK = cs.display !== "none" && cs.visibility !== "hidden" && Math.abs(cr.width - cr0.width) < 1 && Math.abs(cr.height - cr0.height) < 1;
                const dcs = win.getComputedStyle(d), dr = d.getBoundingClientRect();
                const dOK = dcs.visibility !== "hidden" && dcs.display !== "none" && dr.width > 100;
                return (ok ? "lock" : "NO-LOCK") + (same ? "" : " MOVED(" + Math.round(r.left) + "," + Math.round(r.width) + ")")
                    + (cOK ? "" : " CONTENT(" + cs.display + "," + cs.visibility + "," + Math.round(cr.width) + "x" + Math.round(cr.height) + ")")
                    + (dOK ? "" : " DECK(" + dcs.display + "," + dcs.visibility + "," + Math.round(dr.width) + ")")
                    + " sel=" + ZT.selectedID + " cards=" + Array.from(d.children).filter(x => x.classList.contains("wv-tsplit-panel")).map(x => x.id === L.id ? "L" : x.id.slice(-4)).join("|");
            };
            const muts = [];
            const mo = new win.MutationObserver((recs) => {
                for (const r of recs) {
                    const el = r.target;
                    if (el.id === "tabs-deck" && !el.hasAttribute("wv-tsplit")) muts.push("deck lost wv-tsplit");
                    if (el.id === L.id && !el.classList.contains("wv-tsplit-panel")) muts.push("the locked card lost its panel class");
                }
            });
            mo.observe(deck(), { attributes: true, attributeFilter: ["wv-tsplit"] });
            mo.observe(doc.getElementById(L.id), { attributes: true, attributeFilter: ["class"] });
            const samples = [], frames = [];
            const iv = win.setInterval(() => { const st = state(); if (samples[samples.length - 1] !== st) samples.push(st); }, 4);
            const t0 = win.performance.now();
            let stop = false;
            const raf = () => { if (stop) return; frames.push(Math.round(win.performance.now() - t0) + "ms " + state()); win.requestAnimationFrame(raf); };
            win.requestAnimationFrame(raf);
            let tab = null;
            try {
                const p = open();
                frames.push("sync " + state());
                await p;
                tab = await waitFor(() => tabOfItem(itemOf), 20000, name + ": the new tab");
                await waitFor(() => ZT.selectedID === tab.id, 10000, name + ": the new tab selected");
                await sleep(1500);
            }
            finally { stop = true; win.clearInterval(iv); mo.disconnect(); }
            log.push(name + ": frames " + frames.join(" / ") + " ; samples " + samples.join(" / ") + " ; mutations " + muts.join(" / "));
            const off = frames.concat(samples).filter(x => /NO-LOCK|MOVED|CONTENT|DECK/.test(x));
            if (off.length || muts.length) bad.push(name + ": " + off.join(" / ") + (muts.length ? " ; mutations: " + muts.join(" / ") : ""));
            if (frameState(L.id, tab.id) !== "split") bad.push(name + ": at the end " + frameState(L.id, tab.id));
            return tab;
        };
        const ZP = win.ZoteroPane;
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        // Enter on a PDF in the locked library (zoteroPane.js onItemTreeActivate).
        const t3b = await watch("a PDF from the locked library", L.id, async () => {
            await ZP.selectItems([pdf3.id]);
            ZP.onItemTreeActivate(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }), [pdf3]);
        }, pdf3);
        // A note (its tabs open as ZoteroPane.openNote does, the hard invariant).
        await watch("a note", L.id, () => ZP.openNote(note.id, { openInWindow: false }), note);
        // A PDF opened while the active side is selected.
        ZT.close(t3b.id);
        await waitFor(() => !tabOfItem(pdf3), 5000, "fixture: the third PDF closed again");
        await watch("a PDF from the active side", t1.id, () => Zotero.Reader.open(pdf3.id, null, { openInWindow: false }), pdf3);
        // A zotero:// link to a PDF not open yet (Weavero's own handler, as a link in a
        // note or a comment opens it).
        const t3c = tabOfItem(pdf3);
        ZT.close(t3c.id);
        await waitFor(() => !tabOfItem(pdf3), 5000, "fixture: the third PDF closed once more");
        await watch("a zotero:// link", L.id, () => wv.handleZoteroURI("zotero://open-pdf/library/items/" + pdf3.key), pdf3);
        // A tab Zotero unloaded (after a restart, or unused for a while), selected:
        // Zotero loads it as it selects it.
        if (typeof ZT.unload === "function") {
            ZT.unload(t1.id);
            await waitFor(() => /-unloaded$/.test(String((tabOfItem(pdf1) || {}).type)), 5000, "fixture: the first PDF unloaded");
            // Weavero's stuck-loading watchdog (tabs.ts, 6 s after a select) would take
            // a fresh load of a tab selected moments ago for a stuck one.
            await sleep(6500);
            await watch("an unloaded tab selected", L.id, async () => { clickTab(tabOfItem(pdf1).id); }, pdf1);
        }
        Zotero.debug("[Weavero] split-dock new tab frames: " + log.join(" || "));
        assert.deepEqual(bad, [], "the locked side stays on screen, untouched: " + log.join(" || "));
    });

    // The coordinator 2026-11-17, live on trial.8 (MJT's "both sides get hidden and shown
    // again" when a tab loads beside the locked library): a click on an UNLOADED tab in
    // the strip makes Zotero load it as it selects it, and show "Loading..." meanwhile
    // (tabs.js select: ZoteroContextPane.showLoadingMessage(true); #zotero-tab-cover,
    // zoteroPane.xhtml, position: fixed over the whole window) -- over the locked side
    // too, until the reader had loaded (~0.6 s). Only a hit-test sees it: its styles are
    // Zotero's own, the cards' untouched (the test above passed).
    it("a tab Zotero loads as it is selected, beside the locked tab or in a pair: its \"Loading...\" covers its own card only, never the side beside it; no split, the cover as Zotero has it", async function () {
        const [t1, , , tn] = await fresh();
        const L = libTab();
        const cover = () => doc.getElementById("zotero-tab-cover");
        assert.ok(cover(), "fixture: Zotero's loading cover");
        const coverShown = () => { const c = cover(); return !!(c && !c.classList.contains("hidden") && win.getComputedStyle(c).display !== "none"); };
        const untouched = (what) => {
            assert.strictEqual(cover().style.length, 0, what + ": no style of Weavero's left on Zotero's cover");
            assert.notOk(cover().hasAttribute("style"), what + ": no style attribute either");
        };
        // A reader tab Zotero has not loaded (as after a restart): added unloaded.
        const unloaded = async () => {
            const old = tabOfItem(pdf3);
            if (old) { ZT.close(old.id); await waitFor(() => !tabOfItem(pdf3), 5000, "fixture: the third PDF closed"); }
            ZT.add({ type: "reader-unloaded", title: "wv-dock-3", data: { itemID: pdf3.id }, select: false });
            const u = await waitFor(() => tabOfItem(pdf3), 5000, "fixture: an unloaded tab");
            assert.match(String(u.type), /-unloaded$/, "fixture: not loaded");
            return u;
        };
        // A press on the tab in the strip (Zotero's bound select), then a hit-test at the
        // centre of the side beside it every 4 ms and every frame until it has loaded.
        const watch = async (name, besideID, u) => {
            const br = rectOf(besideID);
            const cx = Math.round(br.left + br.width / 2), cy = Math.round(br.top + br.height / 2);
            const bad = [];
            let seen = 0;
            const t0 = win.performance.now();
            const at = () => Math.round(win.performance.now() - t0) + "ms";
            const sample = (when) => {
                const hit = doc.elementFromPoint(cx, cy);
                if (hit && hit.closest && hit.closest("#zotero-tab-cover")) bad.push(when + ": the side beside it under the cover");
                if (!coverShown()) return;
                seen++;
                const c = cover().getBoundingClientRect(), r = rectOf(u.id);
                if (c.left < r.left - 1 || c.right > r.right + 1 || c.top < r.top - 1 || c.bottom > r.bottom + 1 || c.width < 40 || c.height < 40) {
                    bad.push(when + ": the cover " + [c.left, c.top, c.width, c.height].map(Math.round).join(",")
                        + " outside the card loading " + [r.left, r.top, r.width, r.height].map(Math.round).join(","));
                }
            };
            const iv = win.setInterval(() => sample(at()), 4);
            let stop = false;
            const raf = () => { if (stop) return; sample("frame " + at()); win.requestAnimationFrame(raf); };
            win.requestAnimationFrame(raf);
            try {
                clickTab(u.id);
                sample("in the select's task");
                await waitFor(() => ZT.selectedID === u.id && String((tabOfItem(pdf3) || {}).type) === "reader" && !coverShown(), 20000, name + ": the tab loaded");
                await sleep(300);
            }
            finally { stop = true; win.clearInterval(iv); }
            assert.isAbove(seen, 0, name + ": fixture: Zotero's cover shown while the tab loaded");
            assert.deepEqual(bad.slice(0, 6), [], name + ": " + bad.length + " bad samples of " + seen + " with the cover shown");
        };
        // Locked: My Library on the left, a PDF beside it, then a tab not loaded yet.
        ZT.select(t1.id); await sleep(300);
        await dockOn(L.id);
        await readerReady(t1.id);
        let u = await unloaded();
        await sleep(300);
        assert.strictEqual(frameState(L.id, t1.id), "split", "fixture: the PDF beside the locked library");
        await watch("beside the locked library", L.id, u);
        assert.strictEqual(frameState(L.id, u.id), "split", "loaded beside the locked library");
        await dockOff();
        assert.notOk(deck().hasAttribute("wv-tsplit"), "fixture: unlocked, no split on screen");
        untouched("unlocked");
        // A pair, the tab loading on one side.
        u = await unloaded();
        clickTab(tn.id); await sleep(400);
        const p = wv._wvTabSplitCreate(win, L.id, u.id, { select: "none" });
        assert.ok(p, "fixture: a pair");
        await sleep(600);
        assert.match(String(tabOfItem(pdf3).type), /-unloaded$/, "fixture: still not loaded");
        await watch("a pair", L.id, u);
        wv._wvTabSplitSeparate(win, p.id);
        await sleep(500);
        untouched("separated");
        // No split on screen: Zotero's cover over the whole window, as Zotero shows it.
        u = await unloaded();
        clickTab(tn.id); await sleep(400);
        clickTab(u.id);
        const c = cover().getBoundingClientRect();
        const wasShown = coverShown();
        await waitFor(() => String((tabOfItem(pdf3) || {}).type) === "reader" && !coverShown(), 20000, "no split: the tab loaded");
        if (wasShown) assert.isAbove(c.width, deck().getBoundingClientRect().width - 2, "no split: Zotero's cover as wide as Zotero makes it");
        untouched("no split");
    });

    // The lock's data stays on the window across a teardown on purpose, and the tab
    // bar's observer (tabs.ts) runs the strip pass on every strip mutation: the mark
    // came back 400ms after the split view's teardown until the pass was tied to the
    // split view's sheet (2026-11-15).
    it("a reload's teardown takes the mark, the badge, the tooltip line and the click on the locked tab away; the next wiring gives them back", async function () {
        const [t1] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        assert.ok(badgeOn(L.id), "fixture: the badge drawn");
        assert.include(tipOf(L.id), TIP_OPEN, "fixture: the tooltip line");
        try {
            wv._wvTabSplitUnwireAll();
            await sleep(400);
            assert.notOk(doc.querySelector("[data-wv-tdock]"), "no mark in the strip");
            assert.isFalse(badgeOn(L.id), "no badge on the locked tab");
            assert.notInclude(tipOf(L.id), "Locked tab", "no tooltip line");
            if (nameTipOf(L.id) != null) assert.notInclude(nameTipOf(L.id), "Locked tab", "nor on its title");
            noHeadOrRail("teardown");
            // A plain click on it selects it again, as Zotero does.
            stripClick(L.id); await sleep(400);
            assert.strictEqual(ZT.selectedID, L.id, "a click selects the tab, as Zotero does");
            assert.approximately(firstShown(L.id).getBoundingClientRect().top, rectOf(L.id).top, 1, "the library view at the top of its tab");
        }
        finally {
            wv._wvTabSplitRegisterMenus();
            wv._wvTabSplitWire(win);
            ZT.select(t1.id);
            wv._wvTabSplitSync(win);
        }
        await sleep(700);
        assert.strictEqual(frameState(L.id, t1.id), "split", "the next wiring shows it again");
        assert.deepEqual(marked(), [L.id], "with its mark");
        assert.ok(badgeOn(L.id), "and its badge");
        assert.include(tipOf(L.id), TIP_OPEN, "and its tooltip line");
        stripClick(L.id); await sleep(600);
        assert.isTrue(!!dock().collapsed, "and a click collapses it again");
        stripClick(L.id); await sleep(600);
        assert.notOk(dock().collapsed, "and expands it");
    });

    // MJT 2026-11-17, the bug: "I have no way to see that I have locked the left part of
    // the split view" -- My Library's tab is pinned (icon only), and the mark drawn
    // before its title never showed. Firefox's badge on a pinned tab's icon:
    // .tab-icon-overlay, `padding: 2px; top: -7px; inset-inline-end: -7px` (tabs.css);
    // then, on trial.9, his pick "Accent frame + accent padlock"; on trial.14 "The lock tab
    // icon should get the usual lock colours instead of this blue" (his pick "Gold padlock");
    // on dev.7 "The blue line around the locked tab and around the focused tab suggest
    // that the focused tab is the locked tab, which is wrong": the frame in gold, the
    // accent kept for the side you are on.
    it("the locked tab is framed in gold, not the accent of the side you are on -- painted over the tab, selected or not, collapsed or not -- and its icon carries a gold padlock, alone, at Firefox's corner for badges, on an ordinary tab and on a PINNED tab (Weavero's pinned icon, or Zotero's own pinned tab); the tab's width and padding unchanged; its tooltip says it is locked", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        assert.ok(await fetchOk(LOCK_SVG), "Zotero ships " + LOCK_SVG);
        const acc = accentRGB();
        assert.lengthOf(acc, 3, "fixture: Zotero's accent color: " + acc);
        // tab-split-dock.ts WV_LOCK_FRAME_LIGHT / _DARK.
        const gold = win.matchMedia("(prefers-color-scheme: dark)").matches ? [245, 179, 15] : [181, 120, 0];
        assert.isFalse(near(gold, acc, 40), "fixture: the gold is not the accent (" + acc + ")");
        const geo = (id) => {
            const el = tabEl(id), cs = win.getComputedStyle(el);
            return { w: el.getBoundingClientRect().width, ps: cs.paddingInlineStart, pe: cs.paddingInlineEnd, bg: cs.backgroundColor };
        };
        const framed = (id) => {
            const cs = win.getComputedStyle(tabEl(id));
            return cs.outlineStyle === "solid" && cs.outlineWidth === "2px" && near(rgbOf(cs.outlineColor), gold, 1);
        };
        const checkMark = (id, what) => {
            const el = tabEl(id);
            assert.ok(el, what + ": fixture: the tab drawn in the strip");
            const cs = win.getComputedStyle(el);
            assert.strictEqual(cs.outlineStyle, "solid", what + ": a frame");
            assert.strictEqual(cs.outlineWidth, "2px", what + ": 2px wide");
            assert.strictEqual(cs.outlineOffset, "-2px", what + ": inside the tab's edge");
            assert.ok(near(rgbOf(cs.outlineColor), gold, 1), what + ": in gold, not the accent (" + cs.outlineColor + ", the gold " + gold + ", the accent " + acc + ")");
            // Painted over the tab's own fill and content: what the window shows on the
            // frame's band, its left edge and its bottom edge.
            const r = el.getBoundingClientRect();
            const at = { "its left edge": [Math.floor(r.left) + 1, Math.round(r.top + r.height / 2)], "its bottom edge": [Math.round(r.left + r.width / 2), Math.ceil(r.bottom) - 2] };
            for (const k of Object.keys(at)) {
                const px = pixelAt(at[k][0], at[k][1]);
                assert.ok(near(px, gold, 48), what + ": the gold frame painted on " + k + " (" + px + ", the gold " + gold + ")");
            }
            const b = badgeOf(id);
            assert.notStrictEqual(b.content, "none", what + ": a badge");
            assert.include(b.backgroundImage, GOLD, what + ": the gold padlock");
            // Alone: no round under it, neither the accent (trial.14) nor white (trial.15:
            // "No white background for the lock icon").
            assert.strictEqual(b.backgroundColor, "rgba(0, 0, 0, 0)", what + ": no round under the padlock (" + b.backgroundColor + ")");
            assert.strictEqual(b.boxShadow, "none", what + ": no edge drawn around it");
            // What the window shows at the padlock's body: gold, not the accent blue.
            const ir = tabEl(id).querySelector(".tab-icon").getBoundingClientRect();
            const ltrB = win.getComputedStyle(el).direction !== "rtl";
            // The badge: 16px (12 + 2 + 2) from the icon's top -7px and end -7px; the
            // body's middle row, 2.5px off the keyhole.
            const cx = (ltrB ? ir.right + 7 - 8 : ir.left - 7 + 8) + 2.5;
            const body = pixelAt(Math.round(cx), Math.round(ir.top - 7 + 10));
            assert.ok(body[0] > 200 && body[1] > 140 && body[1] < 215 && body[2] < 90, what + ": the padlock's body painted gold (" + body + ")");
            assert.strictEqual(b.position, "absolute", what + ": over the icon, out of the tab's layout");
            assert.strictEqual(b.top, "-7px", what + ": Firefox's corner (top)");
            assert.strictEqual(b.paddingTop, "2px", what + ": Firefox's padding");
            const ltr = win.getComputedStyle(el).direction !== "rtl";
            assert.strictEqual(ltr ? b.right : b.left, "-7px", what + ": Firefox's corner (end)");
            assert.strictEqual(b.transform, "none", what + ": a padlock has no side, never mirrored");
            assert.include(tipOf(id), "\n" + (dock().collapsed ? TIP_COLLAPSED : TIP_OPEN), what + ": its tooltip's lock line: " + JSON.stringify(tipOf(id)));
        };
        // An ordinary tab: a PDF, locked from another tab.
        clickTab(t2.id); await sleep(400);
        const g0 = geo(t1.id);
        const nameTip0 = nameTipOf(t1.id);
        assert.isFalse(badgeOn(t1.id), "fixture: no badge while unlocked");
        assert.isFalse(framed(t1.id), "fixture: no frame while unlocked");
        await dockOn(t1.id);
        checkMark(t1.id, "an ordinary tab, another tab selected");
        assert.strictEqual(nameTipOf(t1.id), nameTip0 + "\n" + TIP_OPEN, "its title's tooltip: Zotero's, with the line under it");
        assert.strictEqual(tipOf(t1.id), nameTip0 + "\n" + TIP_OPEN, "the tab's own, the same");
        const g1 = geo(t1.id);
        assert.approximately(g1.w, g0.w, 0.01, "the tab's width unchanged");
        assert.strictEqual(g1.ps, g0.ps, "its padding unchanged (start)");
        assert.strictEqual(g1.pe, g0.pe, "its padding unchanged (end)");
        assert.strictEqual(g1.bg, g0.bg, "no fill on it");
        for (const t of [L, t1, t2]) {
            clickTab(t.id); await sleep(500);
            assert.deepEqual(marked(), [t1.id], t.id + " selected: the locked tab marked, no other");
            checkMark(t1.id, "an ordinary tab, " + (t === t1 ? "itself" : t.id) + " selected");
        }
        stripClick(t1.id); await sleep(600);
        assert.isTrue(!!dock().collapsed, "fixture: collapsed");
        checkMark(t1.id, "an ordinary tab, collapsed");
        stripClick(t1.id); await sleep(600);
        wv._wvTabSplitReverse(win, dockSplit().id);
        await sleep(600);
        checkMark(t1.id, "an ordinary tab locked on the right");
        wv._wvTabSplitReverse(win, dockSplit().id);
        await sleep(600);
        await dockOff();
        assert.deepEqual(marked(), [], "unlocked: no mark");
        assert.isFalse(badgeOn(t1.id), "unlocked: no badge");
        assert.isFalse(framed(t1.id), "unlocked: no frame");
        assert.strictEqual(nameTipOf(t1.id), nameTip0, "unlocked: its title's tooltip Zotero's again");
        assert.notOk(tabEl(t1.id).hasAttribute("title"), "and none on the tab itself");
        assert.approximately(geo(t1.id).w, g0.w, 0.01, "unlocked: the tab's width as before");
        // A pinned tab: My Library where a Zotero with its own windows lets it be pinned
        // (MJT's case; Zotero's own pin where the build has it, else Weavero's pinned
        // icon), else a pinned PDF (an older Zotero's library tab is fixed).
        const P = wvT.nativeWindows() ? L : t2;
        clickTab(t1.id); await sleep(300);
        await pin(P, true);
        try {
            assert.isTrue(wv._wvTabIsPinned(win, P), "fixture: pinned");
            await waitFor(() => tabEl(P.id) && (tabEl(P.id).classList.contains("wv-pinned-mirror") || tabEl(P.id).classList.contains("wv-pinned-tab") || tabEl(P.id).classList.contains("pinned")), 5000, "fixture: drawn as a pinned tab");
            const kind = tabEl(P.id).classList.contains("wv-pinned-mirror") ? "Weavero's pinned icon" : "Zotero's pinned tab";
            const p0 = geo(P.id);
            await dockOn(P.id);
            assert.isTrue(wv._wvTabIsPinned(win, P), "the locked tab stays pinned");
            await waitFor(() => badgeOn(P.id), 5000, "the badge on the pinned tab (" + tabEl(P.id).className + ")");
            checkMark(P.id, "a pinned tab (" + kind + "), another tab selected");
            const p1 = geo(P.id);
            assert.approximately(p1.w, p0.w, 0.01, "the pinned tab's width unchanged");
            assert.strictEqual(p1.ps, p0.ps, "its padding unchanged (start)");
            assert.strictEqual(p1.pe, p0.pe, "its padding unchanged (end)");
            assert.strictEqual(frameState(P.id, t1.id), "split", "the pinned tab locked on the left, the tab you are on beside it");
            clickTab(P.id); await sleep(500);
            checkMark(P.id, "a pinned tab (" + kind + "), itself selected");
            // A plain click on the pinned tab collapses and expands the lock too.
            stripClick(P.id); await sleep(700);
            assert.isTrue(!!dock().collapsed, "a click on the pinned locked tab (" + kind + "): collapsed");
            assert.strictEqual(ZT.selectedID, t1.id, "the tab beside it keeps the window, selected");
            checkMark(P.id, "a pinned tab (" + kind + "), collapsed");
            stripClick(P.id); await sleep(700);
            assert.notOk(dock().collapsed, "a click again: expanded");
            assert.strictEqual(ZT.selectedID, t1.id, "the selection kept");
            assert.strictEqual(frameState(P.id, t1.id), "split", "both sides again");
        }
        finally {
            await dockOff();
            await pin(P, false);
        }
    });

    it("it comes back after a restart and with a tab session, in its own window, on its side and at its width; a session without it turns it off", async function () {
        const [t1, t2] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        dockSplit().ratio = 0.4;
        wv._wvTabSplitPersist();
        const rec = dockRec();
        assert.ok(rec, "recorded with the splits: " + JSON.stringify(recs()));
        assert.strictEqual(rec.l, "lib");
        assert.strictEqual(rec.side, "left");
        assert.approximately(Number(rec.ratio), 0.4, 0.002);
        assert.ok(Array.isArray(rec.w) && rec.w.length === ZT._tabs.length, "with its window's tabs: " + JSON.stringify(rec.w));
        // What a restart leaves: the tabs back, nothing in memory, the record read.
        const all = recs();
        delete win._wvTDock;
        win._wvTSplits = [];
        wv._wvTabSplitSync(win);
        await sleep(300);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "fixture: as after a restart");
        Zotero.Prefs.set(PREF, JSON.stringify(all));
        wv._wvTSplitPending = null;
        wv._wvTabSplitRestore(win);
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "back on, for the library tab");
        assert.strictEqual(frameState(L.id, t1.id), "split", "the library beside the selected tab");
        assert.approximately(dockSplit().ratio, 0.4, 0.002, "at its width");
        assert.lengthOf(wv._wvTabSplitPending(), 0, "its record no longer waits");
        assert.lengthOf(recs().filter(r => r.dock), 1, "one record");
        // Tab sessions (sessions.ts): the window's records carry it.
        const sess = wv._wvTabSplitRecords(win);
        assert.ok(sess.some(r => r.dock), "a session's records hold it: " + JSON.stringify(sess));
        wv._wvTabSplitSessionAdopt([]);
        await sleep(500);
        assert.notOk(dock(), "a session without it: off");
        assert.notOk(deck().hasAttribute("wv-tsplit"));
        wv._wvTabSplitSessionAdopt(sess);
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), L.id, "the session that had it: on again");
        clickTab(t2.id); await sleep(600);
        assert.strictEqual(frameState(L.id, t2.id), "split");
        wv._wvTSplitPending = [];
    });

    it("a locked PDF comes back after a restart and with a tab session: found by what it shows", async function () {
        const [t1, t2, t3] = await fresh();
        clickTab(t2.id); await sleep(300);
        await dockOn(t1.id);
        clickTab(t3.id); await sleep(500);
        dockSplit().ratio = 0.35;
        wv._wvTabSplitPersist();
        const rec = dockRec();
        assert.ok(rec, "recorded: " + JSON.stringify(recs()));
        assert.strictEqual(rec.l, descOfItem(pdf1), "the locked tab by what it shows");
        assert.notProperty(rec, "k", "no library index for a document tab");
        assert.strictEqual(rec.c, descOfItem(pdf3), "the tab beside it by what it shows");
        const all = recs();
        delete win._wvTDock;
        win._wvTSplits = [];
        wv._wvTabSplitSync(win);
        await sleep(300);
        assert.notOk(deck().hasAttribute("wv-tsplit"), "fixture: as after a restart");
        Zotero.Prefs.set(PREF, JSON.stringify(all));
        wv._wvTSplitPending = null;
        wv._wvTabSplitRestore(win);
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), t1.id, "back on, for the PDF");
        assert.strictEqual(frameState(t1.id, t3.id), "split", "the PDF on the left beside the selected tab");
        assert.approximately(dockSplit().ratio, 0.35, 0.002, "at its width");
        assert.lengthOf(wv._wvTabSplitPending(), 0, "its record no longer waits");
        clickTab(t1.id); await sleep(500);
        assert.strictEqual(frameState(t1.id, t3.id), "split", "the locked PDF selected: beside the tab recorded there");
        const sess = wv._wvTabSplitRecords(win);
        assert.ok(sess.some(r => r.dock && r.l === descOfItem(pdf1)), "a session's records hold it: " + JSON.stringify(sess));
        wv._wvTabSplitSessionAdopt([]);
        await sleep(500);
        assert.notOk(dock(), "a session without it: off");
        wv._wvTabSplitSessionAdopt(sess);
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), t1.id, "the session that had it: the PDF locked again");
        wv._wvTSplitPending = [];
    });

    it("the split view setting off shows Zotero's deck; back on, the locked tab beside the tab again", async function () {
        const [t1] = await fresh();
        const L = libTab();
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        assert.strictEqual(frameState(L.id, t1.id), "split", "fixture: on screen");
        Zotero.Prefs.set("weavero.enableSplitView", false);
        await sleep(500);
        try {
            assert.notOk(deck().hasAttribute("wv-tsplit"), "off: Zotero's deck");
            assert.ok(shown(t1.id) && !shown(L.id), "the selected tab alone");
            assert.deepEqual(marked(), [], "nothing marked");
            assert.notInclude(tipOf(L.id), "Locked tab", "no tooltip line");
            stripClick(L.id); await sleep(400);
            assert.strictEqual(ZT.selectedID, L.id, "a click on its tab selects it, as Zotero does");
            assert.notOk(dock().collapsed, "and collapses nothing");
            ZT.select(t1.id); await sleep(300);
            await withTabMenu(L.id, async (items) => { assert.notOk(entryIn(items), "no entry while split view is off"); });
        }
        finally { Zotero.Prefs.set("weavero.enableSplitView", true); }
        await sleep(600);
        assert.strictEqual(frameState(L.id, t1.id), "split", "on again: the library beside the tab");
    });

    it("unlocked -- the entry again, or Separate Split View on either tab -- nothing of it stays: Zotero's deck, no mark, no record, the window's splits untouched", async function () {
        const [t1, t2, t3] = await fresh();
        const L = libTab();
        const p = wv._wvTabSplitCreate(win, t2.id, t3.id, { select: "none" });
        assert.ok(p, "fixture: a pair beside it");
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        assert.strictEqual(frameState(L.id, t1.id), "split", "fixture: on screen");
        // The tab beside the locked one: a split's tab, with the split entries.
        await withTabMenu(t1.id, async (items) => {
            const labels = items.map(x => x.getAttribute("label"));
            assert.include(labels, "Separate Split View", "the tab on screen beside the locked one: " + labels.join(" | "));
            assert.notInclude(labels, "Add Split View");
            items.find(x => x.getAttribute("label") === "Separate Split View").dispatchEvent(new win.Event("command"));
        });
        await sleep(600);
        const clean = (what) => {
            assert.notOk(dock(), what + ": off");
            assert.notOk(dockSplit(), what + ": no split of its own left");
            assert.notOk(deck().hasAttribute("wv-tsplit"), what + ": Zotero's deck");
            assert.ok(shown(t1.id) && !shown(L.id), what + ": the selected tab alone");
            assert.deepEqual(marked(), [], what + ": nothing marked");
            assert.notInclude(tipOf(L.id), "Locked tab", what + ": no tooltip line");
            noHeadOrRail(what);
            assert.notOk(dockRec(), what + ": nothing recorded");
            assert.lengthOf(pairs(), 1, what + ": the pair untouched");
            assert.lengthOf(recs(), 1, what + ": the pair's record alone: " + JSON.stringify(recs()));
        };
        clean("Separate Split View");
        await dockOn();
        assert.strictEqual(frameState(L.id, t1.id), "split", "fixture: on again");
        await withTabMenu(L.id, async (items) => {
            const mi = entryIn(items);
            assert.ok(mi && saysUnlock(mi), "fixture: Unlock Tab: " + listOf(items));
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(600);
        clean("Unlock Tab");
        // A reload's teardown (destroy) takes its split out of the window's list and
        // its mark off the strip; the next wiring shows it again.
        await dockOn();
        assert.include(tipOf(L.id), TIP_OPEN, "fixture: the tooltip line");
        wv._wvTabDockUnwireAll();
        assert.notOk(dockSplit(), "teardown: the window's splits are its pairs");
        assert.deepEqual(marked(), [], "teardown: no mark");
        assert.notInclude(tipOf(L.id), "Locked tab", "teardown: no tooltip line");
        wv._wvTabSplitSync(win);
        await sleep(600);
        assert.strictEqual(frameState(L.id, t1.id), "split", "the next wiring's sync shows it again");
        assert.deepEqual(marked(), [L.id], "and its mark");
        assert.include(tipOf(L.id), TIP_OPEN, "and its tooltip line");
    });

    // MJT 2026-11-18 on dev.7: "if I focus the locked tab, I do not have any visual
    // information of which tab is currently on the other side". The tab on screen beside
    // the locked one gets the fill of Firefox's split-view wrapper (a pair's pill) while
    // it is not the selected tab.
    it("the locked tab selected: the tab shown beside it is shaded in the strip, and follows the other side; no shade on the tab you are on, nor while collapsed or unlocked", async function () {
        const [t1, t2, t3] = await fresh();
        const besideIDs = () => [...new Set(Array.from(doc.querySelectorAll("#tab-bar-container [data-wv-tdock-beside]"))
            .map(x => x.getAttribute("data-id") || x.getAttribute("data-tab-id")))];
        const bg = (id) => win.getComputedStyle(tabEl(id)).backgroundColor;
        clickTab(t3.id); await sleep(400);
        const plain = bg(t2.id);   // an ordinary tab, not selected
        clickTab(t2.id); await sleep(400);
        await dockOn(t1.id);
        assert.strictEqual(frameState(t1.id, t2.id), "split", "fixture: the locked PDF beside the tab you are on");
        assert.deepEqual(besideIDs(), [t2.id], "the tab on the other side marked");
        // The tab you are on is the selected one: Zotero's own look, nothing added.
        assert.ok(tabEl(t2.id).classList.contains("selected"), "fixture: the tab beside selected");
        // The locked tab selected: the tab beside it shaded.
        clickTab(t1.id); await sleep(700);
        assert.strictEqual(ZT.selectedID, t1.id, "fixture: the locked tab selected");
        assert.strictEqual(frameState(t1.id, t2.id), "split", "fixture: still beside the same tab");
        assert.deepEqual(besideIDs(), [t2.id], "the tab on the other side still marked");
        assert.notStrictEqual(bg(t2.id), plain, "shaded: not drawn as an ordinary tab (" + bg(t2.id) + " vs " + plain + ")");
        assert.notStrictEqual(bg(t3.id), bg(t2.id), "an ordinary tab is not shaded");
        assert.deepEqual(marked(), [t1.id], "the lock's own mark stays on the locked tab");
        // Another tab selected, then the locked one again: the shade follows the other side.
        clickTab(t3.id); await sleep(700);
        assert.deepEqual(besideIDs(), [t3.id], "the other side changed: the mark moved");
        clickTab(t1.id); await sleep(700);
        assert.strictEqual(frameState(t1.id, t3.id), "split", "fixture: the locked tab beside the tab shown last");
        assert.deepEqual(besideIDs(), [t3.id], "the tab shown last marked");
        assert.notStrictEqual(bg(t3.id), plain, "and shaded");
        assert.strictEqual(bg(t2.id), plain, "the tab beside it before: ordinary again");
        // Collapsed: nothing beside it.
        clickTab(t3.id); await sleep(500);
        stripClick(t1.id); await sleep(700);
        assert.isTrue(!!dock().collapsed, "fixture: collapsed");
        assert.deepEqual(besideIDs(), [], "collapsed: no tab marked beside it");
        stripClick(t1.id); await sleep(700);
        assert.deepEqual(besideIDs(), [t3.id], "expanded: marked again");
        await dockOff();
        assert.deepEqual(besideIDs(), [], "unlocked: no mark");
    });

    it("any tab can be locked, an unknown one cannot", async function () {
        const [t1, , , tn] = await fresh();
        assert.isTrue(wv._wvTabDockSet(win, t1.id), "a PDF tab");
        await sleep(400);
        assert.strictEqual(wv._wvTabDockLib(win), t1.id);
        assert.isTrue(wv._wvTabDockSet(win, tn.id), "a note tab");
        await sleep(400);
        assert.strictEqual(wv._wvTabDockLib(win), tn.id, "the lock moved to the note");
        assert.isFalse(wv._wvTabDockSet(win, "no-such-tab"), "an unknown tab: refused");
        assert.strictEqual(wv._wvTabDockLib(win), tn.id, "the lock stays where it was");
        await dockOff();
    });

    it("a Zotero with its own windows: another library tab shows beside the first like any tab; its own entry moves the lock to it; closing the locked library tab ends it; each window has its own", async function () {
        if (!wvT.nativeWindows() || typeof ZT.addLibraryTab !== "function") this.skip();   // an older Zotero has one library tab and one window of tabs
        const [t1] = await fresh();
        const L = libTab();
        ZT.addLibraryTab({ select: false });
        await sleep(600);
        const L2 = libTabs()[1];
        assert.ok(L2, "fixture: a second library tab");
        ZT.select(t1.id); await sleep(300);
        await dockOn(L.id);
        clickTab(L2.id); await sleep(900);
        assert.strictEqual(frameState(L.id, L2.id), "split", "the second library tab beside the first");
        await withTabMenu(L2.id, async (items) => {
            const mi = entryIn(items);
            // Beside the locked tab it is a split's tab; its own entry is still there.
            assert.ok(mi && mi.getAttribute("label") === LABEL, "the second library tab's entry: Lock Tab");
            mi.dispatchEvent(new win.Event("command"));
        });
        await sleep(700);
        assert.strictEqual(wv._wvTabDockLib(win), L2.id, "the lock moved to the second library tab");
        clickTab(t1.id); await sleep(700);
        assert.strictEqual(frameState(L2.id, t1.id), "split", "the second library tab beside the PDF");
        assert.notOk(shown(L.id), "the first no longer");
        assert.strictEqual(dockRec().k, 1, "recorded as the window's second library tab");
        // A second window keeps its own.
        const W2 = await wvT.openMainWindow();
        assert.ok(W2, "fixture: a second window");
        try {
            await sleep(800);
            assert.notOk(dock(W2), "a new window: off");
            const Z2 = W2.Zotero_Tabs;
            Z2.add({ type: "reader-unloaded", title: "wv-dock-1", data: { itemID: pdf1.id }, select: false });
            await sleep(300);
            const LB = libTabs(Z2)[0], PB = tabOfItem(pdf1, Z2);
            assert.isTrue(wv._wvTabDockSet(W2, LB.id), "locked there");
            await sleep(900);
            assert.ok(deck(W2).hasAttribute("wv-tsplit") && W2.document.getElementById(PB.id).classList.contains("wv-tsplit-panel"), "the second window: its library beside its tab");
            assert.strictEqual(wv._wvTabDockLib(win), L2.id, "the first window keeps its own");
            assert.lengthOf(recs().filter(r => r.dock), 2, "one record per window");
            wv._wvTabDockSet(W2, null);
            await sleep(400);
            assert.notOk(deck(W2).hasAttribute("wv-tsplit"), "off there");
            assert.strictEqual(frameState(L2.id, t1.id), "split", "the first window untouched");
        }
        finally {
            try { W2.close(); } catch (er) {}
            await waitFor(() => W2.closed, 10000, "the second window closed");
            // Out of Zotero's list of closed windows, which keeps the window
            // (reader-leak.spec.js): the next case counts windows kept.
            try {
                const S = /** @type {any} */ (Zotero).Session;
                const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
                if (last && last.window) S.takeLastClosed();
            }
            catch (e) {}
            try { win.focus(); } catch (er) {}
            await sleep(500);
        }
        // The locked library tab is closed: the lock ends.
        ZT.close(L2.id);
        await waitFor(() => libTabs().length === 1, 5000, "the second library tab closed");
        await sleep(700);
        assert.notOk(dock(), "its library tab closed: off");
        assert.notOk(deck().hasAttribute("wv-tsplit"));
        assert.notOk(dockRec(), "nothing recorded");
    });

    // ---- nothing kept alive -----------------------------------------------------------
    async function collect() {
        for (let i = 0; i < 6; i++) {
            Cu.forceGC(); Cu.forceCC();
            try { Cu.forceShrinkingGC(); } catch (e) {}
            await sleep(250);
        }
    }
    async function settle() { await sleep(1500); await collect(); await sleep(2500); await collect(); }
    /** Detached windows still alive, a count per URL (reader-leak.spec.js). */
    async function detached() {
        const mm = Components.classes["@mozilla.org/memory-reporter-manager;1"].getService(Components.interfaces.nsIMemoryReporterManager);
        const n = {};
        await new Promise((resolve) => {
            mm.getReports((process, path) => {
                if (process) return;
                if (!/^explicit\/window-objects\/.*detached\/window\(/.test(path) || !/\/dom\/element-nodes$/.test(path)) return;
                const m = /detached\/window\(([^)]*)\)/.exec(path);
                const k = m ? m[1].replace(/.*[\\/]/, "") : "?";
                n[k] = (n[k] || 0) + 1;
            }, null, () => resolve(true), null, false);
        });
        return n;
    }
    const count = (d, re) => Object.keys(d).filter(k => re.test(k)).reduce((a, k) => a + d[k], 0);
    const widOf = (w) => { try { return Number(Cu.unwaiveXrays(w).windowGlobalChild.innerWindowId); } catch (e) { return 0; } };

    it("tabs shown beside the locked tab and closed are not kept alive, nor a window closed while it shows its locked tab beside another", async function () {
        const [t1, t2, t3, tn] = await fresh();
        const L = libTab();
        for (const t of [t2, t3, tn]) ZT.close(t.id);
        await sleep(500);
        ZT.select(t1.id); await sleep(300);
        await dockOn();
        await settle();
        const d0 = await detached();
        // Three PDFs opened beside the library, each selected from the library and closed.
        const wids = [];
        for (let i = 0; i < 3; i++) {
            let r = /** @type {any} */ (await Zotero.Reader.open(pdf2.id, null, { allowDuplicate: true }));
            await waitFor(() => r && r._iframeWindow && r._iframeWindow.document.querySelector(".toolbar")
                && r._internalReader && r._internalReader._primaryView && r._internalReader._primaryView._iframeWindow, 20000, "the reader");
            await sleep(1200);
            const id = r.tabID;
            assert.strictEqual(frameState(L.id, id), "split", "fixture: beside the library");
            wids.push(widOf(r._iframeWindow), widOf(r._internalReader._primaryView._iframeWindow));
            ZT.select(L.id); await sleep(400);
            ZT.select(id); await sleep(400);
            r = null;
            ZT.close(id);
            await waitFor(() => !ZT._tabs.some(t => t.id === id), 5000, "the tab to close");
            await sleep(500);
        }
        // A second window, closed while its library is beside a loaded tab. In a
        // function of its own: nothing of the window (its Zotero_Tabs, its tabs)
        // may stay in this test's scope while the count is taken -- only a number
        // comes back (reader-leak.spec.js tabCycle).
        async function windowCycle() {
            let B = await wvT.openMainWindow();
            assert.isOk(B, "fixture: a second main window");
            await sleep(1500);
            B.Zotero_Tabs.add({ type: "reader-unloaded", title: "wv-dock-3", data: { itemID: pdf3.id }, select: false });
            await sleep(300);
            const lbID = libTabs(B.Zotero_Tabs)[0].id, pbID = tabOfItem(pdf3, B.Zotero_Tabs).id;
            assert.isTrue(wv._wvTabDockSet(B, lbID), "fixture: locked in the second window");
            await waitFor(() => deck(B).hasAttribute("wv-tsplit") && B.document.getElementById(pbID).classList.contains("wv-tsplit-panel"), 10000, "the second window's library beside its tab");
            await waitFor(() => { const r = reader(pbID); return r && r._iframeWindow && r._iframeWindow.document.querySelector(".toolbar"); }, 20000, "its PDF loaded beside the library");
            await sleep(1500);
            const wid = widOf(B);
            B._wvSavedParkClose = true;
            B.close();
            await waitFor(() => B.closed && Zotero.getMainWindows().length === 1, 10000, "the second main window to close");
            B = null;
            return wid;
        }
        wids.push(await windowCycle());
        await sleep(500);
        // Zotero's own list of closed windows keeps the window (reader-leak.spec.js).
        try {
            const S = /** @type {any} */ (Zotero).Session;
            const last = S && typeof S.getLastClosed === "function" && S.getLastClosed();
            if (last && last.window) S.takeLastClosed();
        }
        catch (e) {}
        try { win.focus(); } catch (er) {}
        await settle();
        const d1 = await detached();
        const lib = wvT.lib();
        const reg = lib && lib.wvListenRegistry ? lib.wvListenRegistry() : { wids: [], hooked: [] };
        const kept = wids.filter(w => w && (reg.wids.includes(w) || reg.hooked.includes(w)));
        const growR = count(d1, /reader\.html|viewer\.html/) - count(d0, /reader\.html|viewer\.html/);
        const growW = count(d1, /zoteroPane\.xhtml/) - count(d0, /zoteroPane\.xhtml/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; listen registry still names " + kept.length + " closed window(s)";
        Zotero.debug("[Weavero] split-dock leak: " + msg);
        assert.deepEqual(kept, [], "the listen registry keeps a closed window: " + msg);
        // A zotero-plugin-toolkit plugin keeps closed main windows itself (reader-leak.spec.js).
        if (/** @type {any} */ (Zotero)._toolkitGlobal) return;
        assert.isAtMost(growR, 0, "closed tabs stay alive (detached): " + msg);
        assert.isAtMost(growW, 0, "the closed window stays alive (detached): " + msg);
    });
});
