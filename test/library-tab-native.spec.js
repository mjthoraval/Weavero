/* global describe, it, before, after, assert, Zotero, wvT */
// On a Zotero with its own windows (zotero#6035) a library tab is a tab like
// any other (MJT 2026-11-10: "the My Library tab should behave the same as the
// other tabs. No need for special treatment", "Make sure that these changes only
// apply to the new Zotero"): it moves anywhere, joins tab groups, and pins and
// unpins -- by its menu or by a drag into or out of the pinned area, which now
// starts at the far left. A pinned library tab leads the pinned tabs and draws as
// an icon like them ("The pinned library tab does not have the same size as the
// others"). The pins sit in Zotero's pinned row, left of the scroll-back arrow
// ("The arrow should be on the right side of the pinned tabs. See Firefox").
//
// Before: Weavero kept every library tab at index 0 in its own model. Once My
// Library had moved (Zotero allows it), its pinned icons stayed in front of it
// even after Move to Start, a drag could not bring it back, and the tab-order
// pass redrew the bar in a loop (24 moves in 3 s, D:/tmp/wv-libtab-probe.txt).
//
// An older Zotero keeps its fixed first library tab: the whole file is skipped.
// So is a Zotero that pins library tabs itself (zotero 49b48f5d08, the beta after
// beta.4): there My Library's pin is Zotero's (test/library-tab-zotero-pin.spec.js).
describe("Weavero — a library tab is a tab like any other on a Zotero with its own windows", function () {
    this.timeout(120000);
    let wv, win, doc, ZT, cont, a, b, group, prevGroups, prevTW;
    const LIB = "zotero-pane";
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const lib = () => ZT._tabs.find(t => t.id === LIB);
    const node = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(el => el.getBoundingClientRect().width > 0) || null;
    const mirror = (id) => doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + id + '"]');
    const name = (t) => t.id === LIB ? "LIB" : (a && t.data && t.data.itemID === a.id ? "A" : (b && t.data && t.data.itemID === b.id ? "B" : "?"));
    const order = () => ZT._tabs.map(name).filter(n => n !== "?");
    const libPinned = () => !!(lib() && lib().data && lib().data.wvPinned);
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
    /** The tab menu's item labelled `label`, built as Zotero builds it (with
     *  Weavero's MenuManager entries), or null. Leaves the popup open. */
    async function menuItem(tabID, label) {
        const r = rect(node(tabID) || mirror(tabID));
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(400);
        for (const p of doc.querySelectorAll("popupset > menupopup")) {
            if (p.state !== "open" && p.state !== "showing") continue;
            for (const mi of p.querySelectorAll("menuitem")) {
                if (mi.getAttribute("label") === label && !mi.hidden) return mi;
            }
        }
        return null;
    }
    function closeMenus() {
        for (const p of doc.querySelectorAll("popupset > menupopup")) { try { if (p.state === "open") p.hidePopup(); } catch (er) {} }
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
    const dragEv = (type, x, y, dt, target) => {
        const ev = new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: Math.round(win.mozInnerScreenX + x), screenY: Math.round(win.mozInnerScreenY + y), dataTransfer: dt });
        target.dispatchEvent(ev);
    };
    /** A drag of `srcEl` through the x positions `xs`, then a drop. Synthetic
     *  DragEvents carry a DataTransfer, so every listener runs as in a real drag. */
    async function gesture(srcEl, xs, label, onOver) {
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
            if (onOver) onOver(x);
        }
        const xEnd = xs[xs.length - 1];
        dt.dropEffect = "move";
        dragEv("drop", xEnd, y, dt, target);
        dragEv("dragend", xEnd, y, dt, srcEl);
        await settle(label);
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (!wvT.nativeWindows()) this.skip();
        if (wvT.lib() && wvT.lib().wvZoteroPinsLibraryTabs && wvT.lib().wvZoteroPinsLibraryTabs()) this.skip();
        for (const m of ["_applyPinnedTabs", "_applyTabGroups", "_pinnedTabsAdd", "_pinnedTabsRemove", "_tabGroupCreate",
            "_wvTabGroupAddTab", "_wvTabGroupStamp", "_wvTabGroupStampLeave", "_wvTabGroupSaveAndClose"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        cont = doc.getElementById("tab-bar-container");
        if (!lib()) this.skip();
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        const made = [];
        for (const n of ["A", "B"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv library tab " + n + "</p>"); await it.saveTx();
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
        if (!ZT) return;
        closeMenus();
        try {
            const t = lib();
            if (t && t.data) { delete t.data.wvPinned; delete t.data.wvGroupId; }
            if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
            for (const it of [a, b]) { if (it) try { wv._pinnedTabsRemove(it.libraryID, it.key); } catch (er) {} }
            apply();
        } catch (er) {}
        for (const it of [a, b]) { const t = it && tabOf(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        // Later specs expect the window as they found it: the library tab first.
        try { if (lib() && ZT._tabs.indexOf(lib()) > 0) ZT.move(LIB, 0); } catch (er) {}
        try { ZT.select(LIB); } catch (er) {}
        await sleep(300);
        await wvT.erase(a, b);
        try {
            if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
        try { delete win._wvStabilizeBurst; } catch (er) {}
    });

    it("the pinned area starts at the far left: a pin sits before an unpinned My Library", async function () {
        assert.deepEqual(order(), ["A", "LIB", "B"], "pins first, My Library a tab like B");
        assert.deepEqual(screen(), ["pin:A", "LIB", "B"]);
        await settle("fixture");
    });

    it("the pins sit in Zotero's pinned row, left of the scroll-back arrow (Firefox)", function () {
        const mc = doc.getElementById("wv-pinned-mirrors");
        const row = mc && mc.closest(".pinned-tabs");
        assert.ok(row, "the pins live in .pinned-tabs, not in the scrolling strip");
        assert.notStrictEqual(win.getComputedStyle(row).display, "none", "and that row is shown");
        const arrow = doc.querySelector("#tab-bar-container .scroll-start-arrow");
        assert.ok(arrow && (row.compareDocumentPosition(arrow) & win.Node.DOCUMENT_POSITION_FOLLOWING), "the scroll-back arrow comes after the pins");
        const strip = doc.querySelector("#tab-bar-container .tabs-wrapper .tabs");
        const rp = rect(mirror(tabOf(a).id)), rt = rect(node(LIB));
        assert.isAtMost(rp.right, rect(strip).left + 1, "the pins end before the scrolling strip starts");
        // Level with the tabs (1.0.3-dev.3's pins were 16px tall, 6px high).
        assert.approximately(rp.top, rt.top, 1, "pin top " + rp.top + " vs tab top " + rt.top);
        assert.approximately(rp.height, rt.height, 1, "pin height " + rp.height + " vs tab height " + rt.height);
    });

    it("My Library away from the first place: one apply settles, no reorder loop", async function () {
        ZT.move(LIB, ZT._tabs.length);
        delete win._wvStabilizeBurst;
        let moves = 0;
        const orig = ZT.move;
        ZT.move = function (...args) { moves++; return orig.apply(this, args); };
        try {
            apply();
            await sleep(2000);
        } finally { ZT.move = orig; }
        assert.deepEqual(order(), ["A", "B", "LIB"]);
        assert.isAtMost(moves, 1, "the tab order settles at once (" + moves + " moves in 2 s)");
        await settle("My Library at the end");
    });

    it("Pin Tab on My Library puts it first, an icon like the other pins", async function () {
        const mi = await menuItem(LIB, "Pin Tab");
        assert.ok(mi, "a Pin Tab entry on the library tab");
        mi.doCommand();
        closeMenus();
        await settle("pin My Library");
        assert.ok(libPinned(), "pinned");
        assert.deepEqual(order(), ["LIB", "A", "B"], "first, then the other pins");
        assert.deepEqual(screen(), ["pin:LIB", "pin:A", "B"], "on screen too");
        const wl = rect(mirror(LIB)).width, wa = rect(mirror(tabOf(a).id)).width;
        assert.approximately(wl, wa, 1, "as wide as the other pin (" + wl + " vs " + wa + ")");
        const ic = mirror(LIB).querySelector(".tab-icon");
        assert.ok(ic && ic.classList.contains("icon-library"), "with the library's icon: " + (ic && ic.className));
        assert.isAtLeast(rect(ic).width, 15, "and the icon is drawn (it measured 0x0 in 1.0.3-dev.2)");
        assert.strictEqual(mirror(LIB).getAttribute("title"), lib().title, "and its title as the tooltip");
    });

    it("the pin rides in the tab's saved data, which Zotero restores", function () {
        const st = ZT.getState().find(s => s.type === "library");
        assert.ok(st && st.data && st.data.wvPinned, "saved with the session: " + JSON.stringify(st && st.data));
        // A pinned library tab found outside the pins joins them, at their end:
        // the pins keep their own order (it led them up to dev.7, which undid
        // every reorder, MJT 2026-11-10: "I cannot reorder pinned tabs").
        ZT.move(LIB, ZT._tabs.length);
        apply();
        assert.deepEqual(order(), ["A", "LIB", "B"]);
        ZT.move(LIB, 0);
        apply();
        assert.deepEqual(order(), ["LIB", "A", "B"]);
    });

    it("the pins reorder by drag, My Library among them", async function () {
        const mA = mirror(tabOf(a).id);
        await gesture(mA, [Math.round(rect(mA).left - 4), Math.round(rect(mirror(LIB)).left + 6), Math.round(rect(mirror(LIB)).left + 4)], "A before My Library");
        assert.deepEqual(order(), ["A", "LIB", "B"], "A first now");
        assert.ok(libPinned() && mirror(tabOf(a).id), "both still pinned");
        assert.deepEqual(screen(), ["pin:A", "pin:LIB", "B"]);
        const mL = mirror(LIB);
        await gesture(mL, [Math.round(rect(mL).left - 4), Math.round(rect(mirror(tabOf(a).id)).left + 6), Math.round(rect(mirror(tabOf(a).id)).left + 4)], "My Library back first");
        assert.deepEqual(order(), ["LIB", "A", "B"]);
        assert.deepEqual(screen(), ["pin:LIB", "pin:A", "B"]);
    });

    it("a tab dropped before a pinned My Library pins there, first", async function () {
        const mA = mirror(tabOf(a).id);
        assert.ok(mA, "A drawn as a pinned icon");
        const nB = node(tabOf(b).id), rL = rect(mirror(LIB));
        // Over the pinned row, B is out of the scrolling strip, which clips:
        // a floating copy must carry it there.
        let seen = null;
        await gesture(nB, [Math.round(rect(nB).left - 20), Math.round(rL.left + 4), Math.round(rL.left + 2)], "B to the far left", (x) => {
            if (x !== Math.round(rL.left + 4)) return;
            const fl = doc.querySelector("#tab-bar-container .wv-drag-float");
            seen = fl ? { left: Math.round(rect(fl).left), w: Math.round(rect(fl).width), hidden: win.getComputedStyle(nB).visibility } : null;
        });
        assert.ok(seen, "a floating copy of B over the pins");
        assert.isAtMost(seen.left, Math.round(rL.right), "drawn over the pinned row: " + JSON.stringify(seen));
        assert.strictEqual(seen.hidden, "hidden", "the real B hidden behind it");
        assert.notOk(doc.querySelector("#tab-bar-container .wv-drag-float, #tab-bar-container [data-wv-floated]"), "nothing left after the drop");
        // Dropped into the pinned area, B pins (Weavero's drop-to-pin) where it
        // was dropped: before My Library, a pin like the others.
        assert.deepEqual(order(), ["B", "LIB", "A"], "B pinned first: " + order().join(","));
        assert.ok(mirror(tabOf(b).id), "B drawn as a pin");
        try { wv._pinnedTabsRemove(b.libraryID, b.key); } catch (er) {}
        ZT.move(tabOf(b).id, ZT._tabs.length); apply(); await settle("B back");
        assert.deepEqual(order(), ["LIB", "A", "B"]);
    });

    it("a tab dropped just after the last pin pins at the last place; dropped on the tabs it unpins", async function () {
        // "After the last pin" and "before the first tab" are one slot; with the
        // pins in their own row the row decides (MJT 2026-11-10: "It does not
        // seem possible to pin a tab at the last pinned position").
        const mA = mirror(tabOf(a).id), nB = node(tabOf(b).id);
        const strip = doc.querySelector("#tab-bar-container .tabs-wrapper .tabs");
        const xEnd = Math.round(rect(mA).right + 3);
        assert.isBelow(xEnd, rect(strip).left, "the drop point lies in the pinned row");
        await gesture(nB, [Math.round(rect(nB).left - 10), xEnd + 2, xEnd], "B after the last pin");
        assert.ok(mirror(tabOf(b).id), "B pinned by the drop: " + order().join(","));
        assert.deepEqual(order(), ["LIB", "A", "B"], "at the last pinned place");
        assert.deepEqual(screen(), ["pin:LIB", "pin:A", "pin:B"]);
        const mB = mirror(tabOf(b).id);
        await gesture(mB, [Math.round(rect(mB).right + 10), Math.round(rect(strip).left + 6), Math.round(rect(strip).left + 3)], "B onto the tabs");
        assert.notOk(mirror(tabOf(b).id), "B unpinned by a drop on the tabs");
        assert.deepEqual(order(), ["LIB", "A", "B"]);
        assert.deepEqual(screen(), ["pin:LIB", "pin:A", "B"]);
    });

    it("Unpin Tab frees My Library; it moves to the right of the remaining pins", async function () {
        const mi = await menuItem(LIB, "Unpin Tab");
        assert.ok(mi, "an Unpin Tab entry on the pinned library tab");
        mi.doCommand();
        closeMenus();
        await settle("unpin My Library");
        assert.notOk(libPinned(), "unpinned");
        assert.deepEqual(order(), ["A", "LIB", "B"]);
    });

    it("a drag of My Library into the pinned area pins it; a drag out of it unpins it", async function () {
        const mA = mirror(tabOf(a).id), nL = node(LIB);
        await gesture(nL, [Math.round(rect(nL).left - 10), Math.round(rect(mA).left + 4), Math.round(rect(mA).left + 2)], "My Library into the pins");
        assert.ok(libPinned(), "pinned by the drop: " + order().join(","));
        assert.deepEqual(order(), ["LIB", "A", "B"]);
        const nL2 = mirror(LIB), rB = rect(node(tabOf(b).id));
        assert.ok(nL2, "My Library now drawn as a pinned icon");
        await gesture(nL2, [Math.round(rect(nL2).right + 20), Math.round(rB.right - 4), Math.round(rB.right + 6)], "My Library out of the pins");
        assert.notOk(libPinned(), "unpinned by the drop past the pins: " + order().join(","));
        assert.deepEqual(order(), ["A", "B", "LIB"]);
    });

    it("My Library joins a tab group like any tab, and leaves it", async function () {
        group = wv._tabGroupCreate("WV Library Tab", "blue");
        wv._wvTabGroupAddTab(win, tabOf(b).id, group.id);
        wv._wvTabGroupAddTab(win, LIB, group.id);
        apply(); await settle("join");
        assert.strictEqual(wv._wvTabGroupStamp(lib()), group.id, "stamped into the group");
        assert.deepEqual(order(), ["A", "B", "LIB"], "contiguous with B");
        assert.ok(doc.getElementById("wv-tgchip-" + group.id), "the group's chip is drawn");
        wv._wvTabGroupStampLeave(lib(), group.id);
        apply(); await settle("leave");
        assert.notOk(wv._wvTabGroupStamp(lib()), "out again");
    });

    // MJT 2026-11-10: "Moving a library pinned tab to a group does not work"
    // (Move Tab > the group: the command returned on a tab without an item).
    it("Move Tab > a group puts My Library into it, a pinned one too", async function () {
        wv._wvSetLibraryTabPinned(win, LIB, true);
        apply(); await settle("pin for the move");
        assert.ok(libPinned(), "pinned");
        await wv._wvMoveTabToTarget(win, LIB, { win, isReader: false, groupId: group.id });
        apply(); await settle("Move Tab > group");
        assert.strictEqual(wv._wvTabGroupStamp(lib()), group.id, "in the group");
        assert.ok(libPinned(), "still pinned: the group's pinned first member");
        wv._wvTabGroupStampLeave(lib(), group.id);
        wv._wvSetLibraryTabPinned(win, LIB, false);
        apply(); await settle("back out");
        assert.notOk(wv._wvTabGroupStamp(lib()), "out of the group again");
        assert.notOk(libPinned(), "unpinned again");
    });

    it("Save and Close Group closes the members but leaves My Library open, out of the group", async function () {
        wv._wvTabGroupAddTab(win, LIB, group.id);
        apply(); await settle("rejoin");
        assert.strictEqual(wv._wvTabGroupStamp(lib()), group.id);
        const bID = tabOf(b).id;
        wv._wvTabGroupSaveAndClose(win, group.id);
        await settle("save and close");
        assert.ok(lib(), "My Library still open");
        assert.notOk(wv._wvTabGroupStamp(lib()), "and no longer in the parked group");
        assert.notOk(ZT._tabs.some(t => t.id === bID), "B closed with its group");
    });
});
