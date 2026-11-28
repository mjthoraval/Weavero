/* global describe, it, before, after, assert, Zotero, wvT */
// Zotero pins library tabs itself from the beta after 11.0-beta.4 (zotero
// 49b48f5d08, forum 134703: `Zotero_Tabs.setPinned`, a "Pin Tab" / "Unpin Tab" in
// the library tab's menu; a pinned library tab keeps the start of the bar and
// can't be closed or moved until unpinned; saved with the session). MJT
// 2026-11-10: "Whose pin for My Library? Zotero's own"; "A pinned My Library
// added to a group: Same as Firefox" (it unpins, tabgroup.mjs addTabs).
//
// Before (1.0.3 on Zotero main 49b48f5d0, D:/tmp/wv-nativepin-probe.txt): two Pin
// Tab entries on My Library, My Library drawn twice after Zotero's Pin Tab,
// Weavero's item pin drawn before it, two moves refused per order pass, and
// Weavero blind to the pin.
//
// Skipped where Zotero has no Pin Tab of its own (11.0-beta.4 keeps Weavero's
// own library pin, test/library-tab-native.spec.js; an older Zotero, no
// movable library tab at all).
//
// Since zotero b08cc35a50 ("Allow pinning any tab", the same day, before any
// build carried 49b48f5d08) Zotero pins every tab, and a pinned tab reorders
// among the pins: setPinned puts it at the END of the pins, a drop puts it
// where it was dropped. Weavero hands its own item pins to Zotero, so the
// fixture's A is a Zotero pin too (test/zotero-pin-any-tab.spec.js).
describe("Weavero — My Library pinned by Zotero's own Pin Tab", function () {
    this.timeout(120000);
    let wv, win, doc, ZT, cont, a, b, group, prevGroups, prevTW, libWasPinned = false;
    const LIB = "zotero-pane";
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const lib = () => ZT._tabs.find(t => t.id === LIB);
    const node = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(el => el.getBoundingClientRect().width > 0) || null;
    const mirror = (id) => doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + id + '"]');
    const name = (t) => t.id === LIB ? "LIB" : (a && t.data && t.data.itemID === a.id ? "A" : (b && t.data && t.data.itemID === b.id ? "B" : "?"));
    const order = () => ZT._tabs.map(name).filter(n => n !== "?");
    const zPinned = () => !!(lib() && lib().pinned);
    const rect = (el) => el.getBoundingClientRect();
    const apply = () => { wv._applyPinnedTabs(win); wv._applyTabGroups(win); };
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    /** Left-to-right order of what is ON SCREEN: tabs and pinned icons. */
    const screen = () => {
        const out = [];
        for (const el of doc.querySelectorAll("#tab-bar-container .tab[data-id], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id]")) {
            const r = rect(el);
            if (r.width < 1) continue;
            const id = el.getAttribute("data-id") || el.getAttribute("data-tab-id");
            const t = ZT._tabs.find(x => x.id === id);
            if (!t) continue;
            const n = name(t);
            if (n !== "?") out.push([r.left, (el.classList.contains("wv-pinned-mirror") ? "pin:" : "") + n]);
        }
        return out.sort((p, q) => p[0] - q[0]).map(p => p[1]);
    };
    /** The library tab's menu as Zotero builds it (with Weavero's MenuManager
     *  entries): every visible menuitem as its label or l10n id. Closes it. */
    async function menuOf(tabID) {
        const r = rect(node(tabID) || mirror(tabID));
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(500);
        const out = [];
        for (const p of doc.querySelectorAll("popupset > menupopup")) {
            if (p.state !== "open" && p.state !== "showing") continue;
            for (const mi of p.querySelectorAll(":scope > menuitem")) {
                if (mi.hidden || win.getComputedStyle(mi).display === "none") continue;
                out.push({ label: mi.getAttribute("label") || "", l10n: mi.getAttribute("data-l10n-id") || "" });
            }
            try { p.hidePopup(); } catch (er) {}
        }
        return out;
    }
    /** The bar must come to rest: no reorder storm, no churn. */
    async function settle(label) {
        await sleep(450);
        let n = 0;
        const mo = new win.MutationObserver(rs => { n += rs.length; });
        mo.observe(cont, { childList: true, subtree: true, attributes: true });
        await sleep(700);
        mo.disconnect();
        const bst = win._wvStabilizeBurst;
        assert.ok(!bst || !bst.tripped, label + ": reorder storm (breaker tripped) " + JSON.stringify(bst));
        assert.isBelow(n, 30, label + ": tab bar still churning (" + n + " mutations in 700 ms)");
    }
    /** Count Zotero_Tabs.move calls and refusals (throws) while `fn` runs and settles. */
    async function spyMoves(fn, label) {
        const s = { calls: 0, refused: 0, msgs: [] };
        const orig = ZT.move;
        ZT.move = function (...args) { s.calls++; try { return orig.apply(this, args); } catch (e) { s.refused++; if (s.msgs.length < 3) s.msgs.push(String(e)); throw e; } };
        try { await fn(); await settle(label); }
        finally { ZT.move = orig; }
        return s;
    }
    const dragEv = (type, x, y, dt, target) => {
        target.dispatchEvent(new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y,
            screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y), dataTransfer: dt }));
    };
    async function gesture(srcEl, xs, label) {
        const r = rect(srcEl);
        const y = Math.round(r.top + r.height / 2);
        const dt = new win.DataTransfer();
        dragEv("dragstart", Math.round(r.left + r.width / 2), y, dt, srcEl);
        let target = srcEl;
        for (const x of xs) {
            target = doc.elementFromPoint(x, y);
            if (!target || !cont.contains(target)) target = cont;
            dragEv("dragover", x, y, dt, target);
            await sleep(40);
        }
        const xEnd = xs[xs.length - 1];
        dt.dropEffect = "move";
        dragEv("drop", xEnd, y, dt, target);
        dragEv("dragend", xEnd, y, dt, srcEl);
        await settle(label);
    }
    /** The pinned My Library's name (pinnedLibraryTabName, tabs.ts
     *  _wvSyncPinnedMirrors): on by default, icon + title as wide as the title
     *  needs (a tab's 200px at most); off, an icon as wide as the other pin. The
     *  same checks as test/library-tab-native.spec.js (Weavero's own pin). */
    async function checkPinnedName() {
        const m = mirror(LIB), mA = mirror(tabOf(a).id);
        assert.ok(m && mA, "fixture: My Library and A pinned");
        await waitFor(() => m.hasAttribute("data-wv-named"), 3000, "the name shown");
        const ttl = m.querySelector(".wv-pinned-mirror-title"), ic = m.querySelector(".tab-icon");
        assert.notStrictEqual(win.getComputedStyle(ttl).display, "none", "the title is drawn");
        assert.strictEqual(ttl.textContent, lib().title, "the tab's own title");
        assert.isAbove(rect(ttl).width, 10, "with room for it");
        assert.isAbove(rect(ttl).left, rect(ic).right - 0.5, "after the icon");
        assert.isAbove(rect(m).width, rect(mA).width + 10, "wider than an icon pin (" + rect(m).width + " vs " + rect(mA).width + ")");
        assert.isAtMost(rect(m).width, 200.5, "a tab's width at most");
        assert.isAtLeast(rect(m).height, rect(mA).height - 0.5, "as tall as the other pin");
        assert.notOk(mA.hasAttribute("data-wv-named"), "an item tab's pin stays an icon");
        await wvT.withPref("weavero.pinnedLibraryTabName", false, async () => {
            await waitFor(() => !m.hasAttribute("data-wv-named"), 3000, "the setting off: the icon alone");
            assert.strictEqual(win.getComputedStyle(ttl).display, "none", "off: no title");
            assert.approximately(rect(m).width, rect(mA).width, 1, "off: as wide as the other pin");
        });
        await waitFor(() => m.hasAttribute("data-wv-named"), 3000, "the default back: the name shown");
    }
    /** "Show Tab Name" on a pinned tab's menu, its place and its command:
     *  the tab's own choice, on a library tab as on an item tab (MJT 2026-11-27:
     *  "it should act per tab, same as all the other tabs"; until then it was
     *  the Settings option on a library tab, so every library tab at once:
     *  pin-name-library-tabs.spec.js); none on an unpinned tab. */
    async function checkPinNameMenu() {
        const entry = async (tabID) => {
            const r = rect(node(tabID) || mirror(tabID));
            ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
            await sleep(500);
            for (const p of doc.querySelectorAll("popupset > menupopup")) {
                if (p.state !== "open" && p.state !== "showing") continue;
                const shown = Array.from(p.children).filter(ch => !ch.hidden && win.getComputedStyle(ch).display !== "none");
                const i = shown.findIndex(ch => ch.getAttribute("data-wv-key") === "pinName");
                return { mi: i >= 0 ? shown[i] : null, prev: i > 0 ? shown[i - 1] : null, popup: p,
                    desc: shown.map(ch => (wv._wvTabMenuItemKey(ch) || "-") + ":" + (ch.getAttribute("label") || ch.localName)).join(" | ") };
            }
            return { mi: null, popup: null, desc: "no open menu" };
        };
        const close = () => { for (const p of doc.querySelectorAll("popupset > menupopup")) { try { if (p.state === "open") p.hidePopup(); } catch (er) {} } };
        try {
            const e = await entry(LIB);
            assert.ok(e.mi, "on My Library's menu: " + e.desc);
            assert.strictEqual(e.mi.getAttribute("type"), "checkbox", "a checkbox");
            assert.ok(wvT.lib().wvBoolAttrOn(e.mi, "checked"), "checked: the option's default is on");
            assert.strictEqual(wv._wvTabMenuItemKey(e.prev), "pin", "right after the pin entry: " + e.desc);
            assert.ok(e.mi.getAttribute("label"), "labelled: " + e.desc);
            e.mi.doCommand();
            close();
            await waitFor(() => !mirror(LIB).hasAttribute("data-wv-named"), 3000, "the pin becomes the icon alone");
            assert.strictEqual(wv._wvLibTabPinNameOwn(lib()), false, "My Library's own choice");
            assert.strictEqual(Zotero.Prefs.get("weavero.pinnedLibraryTabName"), true, "the Settings option unchanged");
            const e2 = await entry(LIB);
            assert.ok(e2.mi && !wvT.lib().wvBoolAttrOn(e2.mi, "checked"), "unchecked once off: " + e2.desc);
            close();
            await sleep(200);
            // Any PINNED tab has it, an item tab for itself alone (MJT 2026-11-21:
            // "Also add a show name when pinned to any tab"; "Show the option to
            // display the name when pinned only on pinned tabs").
            const mA = () => mirror(tabOf(a).id);
            const eA = await entry(tabOf(a).id);
            assert.ok(eA.mi, "on a pinned item tab's menu: " + eA.desc);
            assert.notOk(wvT.lib().wvBoolAttrOn(eA.mi, "checked"), "unchecked: an item tab's pin is an icon by default");
            assert.strictEqual(wv._wvTabMenuItemKey(eA.prev), "pin", "right after the pin entry: " + eA.desc);
            eA.mi.doCommand();
            close();
            await waitFor(() => mA() && mA().hasAttribute("data-wv-named"), 3000, "A's pin shows its name");
            assert.isAbove(rect(mA()).width, rect(mirror(LIB)).width + 10, "wider than an icon pin");
            assert.include(String(Zotero.Prefs.get("weavero.pinnedTabNames")), a.key, "the choice kept by item");
            assert.notOk(mirror(LIB).hasAttribute("data-wv-named"), "My Library keeps its own choice (off)");
            const eA2 = await entry(tabOf(a).id);
            assert.ok(eA2.mi && wvT.lib().wvBoolAttrOn(eA2.mi, "checked"), "checked once on: " + eA2.desc);
            eA2.mi.doCommand();
            close();
            await waitFor(() => !mA().hasAttribute("data-wv-named"), 3000, "off again: the icon alone");
            await sleep(200);
            const eB = await entry(tabOf(b).id);
            assert.ok(eB.popup, "fixture: B's menu opened");
            assert.notOk(eB.mi, "not on an unpinned tab's menu: " + eB.desc);
        }
        finally {
            close();
            try { Zotero.Prefs.clear("weavero.pinnedLibraryTabName"); } catch (er) {}
            try { Zotero.Prefs.clear("weavero.pinnedTabNames"); } catch (er) {}
            try { wv._wvLibTabPinNameSet(lib(), undefined); apply(); } catch (er) {}
            await sleep(300);
        }
        await waitFor(() => mirror(LIB) && mirror(LIB).hasAttribute("data-wv-named"), 3000, "the default back");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (!wvT.nativeWindows()) this.skip();
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        if (typeof ZT.setPinned !== "function") this.skip();
        const L = wvT.lib();
        if (!L || typeof L.wvZoteroPinsLibraryTabs !== "function") wvT.absent("lib.wvZoteroPinsLibraryTabs");
        for (const m of ["_applyPinnedTabs", "_applyTabGroups", "_pinnedTabsAdd", "_pinnedTabsRemove", "_tabGroupCreate",
            "_wvTabGroupAddTab", "_wvTabGroupStamp", "_wvTabGroupStampLeave", "_wvMakeCloseTabsMenuMulti", "_wvLibTabPinNameOwn", "_wvLibTabPinNameSet"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        cont = doc.getElementById("tab-bar-container");
        if (!lib()) this.skip();
        // Since 11.0-beta.5 the first main window starts with its library tab
        // pinned (zotero 0883f08887, "Pin the library tab of the first window by
        // default"), the runner's too. These cases start from an unpinned My
        // Library, as Zotero's own tabsTest.js does (`tabs.setPinned('zotero-pane',
        // false)` in its before()); after() puts the pin back. Without it every
        // case found My Library first: 4 of 9 failed on the beta.5 full run
        // (2026-11-21), ["LIB", "A", "B"] for ["A", "LIB", "B"].
        libWasPinned = zPinned();
        if (libWasPinned) { ZT.setPinned(LIB, false); await sleep(300); }
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        const made = [];
        for (const n of ["A", "B"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv zotero pin " + n + "</p>"); await it.saveTx();
            made.push(it);
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await waitFor(() => tabOf(it), 15000, "note tab " + n);
        }
        [a, b] = made;
        wv._pinnedTabsAdd(a.libraryID, a.key);
        apply();
        try { ZT.select(LIB); } catch (er) {}
        await sleep(600);
        delete win._wvStabilizeBurst;
    });

    after(async function () {
        if (!ZT || typeof ZT.setPinned !== "function") return;
        try {
            const t = lib();
            if (t && t.pinned) ZT.setPinned(LIB, false);
            for (const it of [a, b]) { const tt = it && tabOf(it); if (tt && tt.pinned) ZT.setPinned(tt.id, false); }
            if (t && t.data) { delete t.data.wvPinned; delete t.data.wvGroupId; }
            if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
            for (const it of [a, b]) { if (it) try { wv._pinnedTabsRemove(it.libraryID, it.key); } catch (er) {} }
            apply();
        } catch (er) {}
        for (const it of [a, b]) { const t = it && tabOf(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { if (lib() && ZT._tabs.indexOf(lib()) > 0) ZT.move(LIB, 0); } catch (er) {}
        // The pin the run started with (beta.5's first-window default), back for
        // the specs after this one.
        if (libWasPinned) { try { ZT.setPinned(LIB, true); apply(); } catch (er) {} }
        try { ZT.select(LIB); } catch (er) {}
        await sleep(300);
        await wvT.erase(a, b);
        try {
            if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
        try { delete win._wvStabilizeBurst; } catch (er) {}
    });

    it("My Library's menu has one Pin Tab: Zotero's", async function () {
        assert.deepEqual(order(), ["A", "LIB", "B"], "fixture: A a Weavero pin, My Library a tab");
        const items = await menuOf(LIB);
        const pins = items.filter(x => x.l10n === "tabs-pin" || /^Pin\b/.test(x.label));
        assert.strictEqual(pins.length, 1, "one entry: " + JSON.stringify(items));
        assert.strictEqual(pins[0].l10n, "tabs-pin", "Zotero's own (Weavero's is hidden for a library tab alone)");
    });

    it("Zotero's Pin Tab: My Library at the end of the pins, drawn once, as an icon like the other pins, no refused moves", async function () {
        delete win._wvStabilizeBurst;
        assert.ok(tabOf(a).pinned, "fixture: A's Weavero pin was handed to Zotero");
        const s = await spyMoves(async () => { ZT.setPinned(LIB, true); }, "Zotero's Pin Tab");
        assert.ok(zPinned(), "pinned by Zotero");
        assert.ok(wvT.lib().wvLibraryTabPinned(lib()), "Weavero sees Zotero's pin");
        assert.deepEqual(order(), ["A", "LIB", "B"], "Zotero puts a new pin at the end of the pins");
        assert.deepEqual(screen(), ["pin:A", "pin:LIB", "B"], "My Library once, as a pinned icon");
        assert.strictEqual(s.refused, 0, "Weavero asked Zotero for no move it refuses: " + JSON.stringify(s));
        const m = mirror(LIB);
        // An icon like the other pins with Show Tab Name off; on (the
        // default) the next case checks its name.
        await wvT.withPref("weavero.pinnedLibraryTabName", false, async () => {
            await waitFor(() => !mirror(LIB).hasAttribute("data-wv-named"), 3000, "the icon alone");
            assert.approximately(rect(mirror(LIB)).width, rect(mirror(tabOf(a).id)).width, 1, "as wide as the other pin");
        });
        assert.strictEqual(m.getAttribute("draggable"), lib().movable === false ? "false" : "true", "draggable as Zotero allows (pins reorder among themselves)");
    });

    // MJT 2026-11-21 (screenshot of the icon-only pinned My Library): "Consider an
    // option to make the library tab pinned in a wider tab header, same as before,
    // so that it remains more easily accessible" -- icon + name, its own width; a
    // Settings checkbox, on by default, and the library tab's right-click menu.
    it("a pinned My Library shows its name (Show Tab Name, on by default); off, the icon alone", async function () {
        await checkPinnedName();
    });

    it("Show Tab Name on a pinned tab's menu, right after the pin entry: the tab's own choice, on My Library as on an item tab; none on an unpinned tab", async function () {
        await checkPinNameMenu();
    });

    it("the pin is Zotero's: saved as `pinned`, no Weavero flag", function () {
        const st = ZT.getState().find(x => String(x.type).startsWith("library"));
        assert.ok(st && st.pinned, "Zotero saves it: " + JSON.stringify(st));
        assert.notOk(st.data && st.data.wvPinned, "and Weavero's own flag is not used");
    });

    it("a tab dropped before Zotero's pinned My Library pins where it was dropped", async function () {
        const nB = node(tabOf(b).id), rL = rect(mirror(LIB));
        const s = await spyMoves(() => gesture(nB, [Math.round(rect(nB).left - 20), Math.round(rL.left + 4), Math.round(rL.left + 2)], "B before My Library"), "B before My Library");
        assert.ok(tabOf(b).pinned && mirror(tabOf(b).id), "B pinned by Zotero through the drop: " + order().join(","));
        assert.deepEqual(order(), ["A", "B", "LIB"], "B where it was dropped, among the pins (they reorder, b08cc35a50)");
        assert.strictEqual(s.refused, 0, "no refused move: " + JSON.stringify(s));
        wv._wvSetTabPinned(win, tabOf(b), false); apply(); await settle("B back");
        assert.deepEqual(order(), ["A", "LIB", "B"], "unpinned: right after the pins");
    });

    it("a 1.0.3 pin flag becomes Zotero's pin", async function () {
        ZT.setPinned(LIB, false); apply(); await settle("unpin");
        assert.notOk(zPinned());
        lib().data.wvPinned = true;   // what 1.0.3 left on beta.4
        apply(); await settle("carry over");
        assert.ok(zPinned(), "pinned by Zotero now");
        assert.notOk(lib().data && lib().data.wvPinned, "the old flag is gone");
        assert.deepEqual(order(), ["A", "LIB", "B"]);
    });

    it("joining a group unpins My Library, as in Firefox", async function () {
        group = wv._tabGroupCreate("WV Zotero Pin", "blue");
        wv._wvTabGroupAddTab(win, tabOf(b).id, group.id);
        const s = await spyMoves(async () => { wv._wvTabGroupAddTab(win, LIB, group.id); apply(); }, "join");
        assert.notOk(zPinned(), "unpinned to join (MJT: Same as Firefox)");
        assert.strictEqual(wv._wvTabGroupStamp(lib()), group.id, "in the group");
        assert.deepEqual(order(), ["A", "B", "LIB"], "with B, after the pins");
        assert.strictEqual(s.refused, 0, "no refused move: " + JSON.stringify(s));
        wv._wvTabGroupStampLeave(lib(), group.id);
        apply(); await settle("leave");
        assert.notOk(wv._wvTabGroupStamp(lib()));
    });

    it("Close N Tabs leaves Zotero's pinned My Library and closes the others", async function () {
        ZT.setPinned(LIB, true); apply(); await settle("pin again");
        const bID = tabOf(b).id;
        const popup = doc.createXULElement("menupopup");
        const mi = doc.createXULElement("menuitem");
        mi.setAttribute("label", Zotero.getString("general.close"));
        popup.appendChild(mi);
        doc.documentElement.appendChild(popup);
        try {
            wv._wvMakeCloseTabsMenuMulti(win, popup, [LIB, bID]);
            const item = popup.querySelector("menuitem");
            assert.strictEqual(item.getAttribute("label"), "Close Tab", "counts only what it can close");
            item.dispatchEvent(new win.Event("command"));
            await settle("close");
            assert.ok(lib(), "My Library still open");
            assert.notOk(ZT._tabs.some(t => t.id === bID), "B closed (Zotero refused the whole batch before)");
        }
        finally { popup.remove(); }
    });
});
