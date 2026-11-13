/* global describe, it, before, after, assert, Zotero, wvT */
// Zotero pins ANY tab itself from zotero b08cc35a50 ("Allow pinning any tab",
// main 2026-11-10, the 11.0 beta after beta.4): reader and note tabs get Pin Tab
// / Unpin Tab too; a pinned tab keeps closable/movable TRUE and Zotero blocks it
// through `pinned` (the user can't close it, moveToWindow returns null, move()
// keeps pins among pins and the rest after them); setPinned puts a tab at the
// end of the pins, or right after them when unpinned.
//
// Weavero 1.0.4 there (D:/tmp/wv-itempin-probe.txt): two Pin Tab entries on a note
// tab (Zotero's and Weavero's), two pin systems side by side (Weavero's item
// pins in its own store, Zotero's on the tab), Close N Tabs closing a tab Zotero
// pinned (close() itself closes it; only the user's close is refused), Move to
// another window offered for it, and pins reordered by a drag landing at the end
// of the pins. MJT 2026-11-10 delegated the choice ("whatever solution you
// recommend"); the recommendation extends his own for My Library ("Zotero's
// own", "Same as Firefox"): every pin is Zotero's, Weavero keeps its look.
//
// Skipped where Zotero does not pin a note tab (11.0-beta.4 and Zotero 10 keep
// Weavero's own pins: test/pinned-drag.spec.js, session-pins.spec.js, ...).
describe("Weavero — any tab pinned by Zotero's own Pin Tab", function () {
    this.timeout(120000);
    let wv, win, doc, ZT, cont, a, b, c, group, prevGroups, prevTW, w2;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const node = (id) => Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(el => el.getBoundingClientRect().width > 0) || null;
    const mirror = (id) => doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + id + '"]');
    const name = (t) => (a && t.data && t.data.itemID === a.id ? "A" : (b && t.data && t.data.itemID === b.id ? "B" : (c && t.data && t.data.itemID === c.id ? "C" : "?")));
    const order = () => ZT._tabs.map(name).filter(n => n !== "?");
    const pinned = () => ZT._tabs.filter(t => t.pinned).map(name).filter(n => n !== "?");
    const rect = (el) => el.getBoundingClientRect();
    const apply = () => { wv._applyPinnedTabs(win); wv._applyTabGroups(win); };
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
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
    /** Open tab `tabID`'s menu as Zotero builds it (with Weavero's MenuManager
     *  entries), hand its visible menuitems to `fn`, then close it. */
    async function withMenu(tabID, fn) {
        const el = node(tabID) || mirror(tabID);
        const r = rect(el);
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(600);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const items = [];
        for (const p of pops) {
            for (const mi of p.querySelectorAll(":scope > menuitem")) {
                if (mi.hidden || win.getComputedStyle(mi).display === "none") continue;
                items.push(mi);
            }
        }
        let out;
        try { out = await fn(items); }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (er) {} } }
        return out;
    }
    const pinEntries = (items) => items.filter(mi => /^tabs-(un)?pin$/.test(mi.getAttribute("data-l10n-id") || "") || /^(Un)?[Pp]in\b/.test(mi.getAttribute("label") || ""));
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
    const unpinAll = () => { for (const it of [a, b, c]) { const t = it && tabOf(it); if (t && t.pinned) ZT.setPinned(t.id, false); } };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        if (!wvT.nativeWindows()) this.skip();
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        if (typeof ZT.setPinned !== "function") this.skip();
        const L = wvT.lib();
        if (!L || typeof L.wvZoteroPinsTabs !== "function") wvT.absent("lib.wvZoteroPinsTabs");
        for (const m of ["_applyPinnedTabs", "_applyTabGroups", "_pinnedTabsAdd", "_pinnedTabsHas", "_wvSetTabPinned", "_wvTabIsPinned",
            "_tabGroupCreate", "_wvTabGroupAddTab", "_wvTabGroupStamp", "_wvMakeCloseTabsMenuMulti", "_wvInjectMoveTargetsIntoNativeMoveMenu",
            "_wvTabSessionRecordFromMainTab"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        cont = doc.getElementById("tab-bar-container");
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        const made = [];
        for (const n of ["A", "B", "C"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv zotero pin any " + n + "</p>"); await it.saveTx();
            made.push(it);
            await win.ZoteroPane.openNote(it.id, { openInWindow: false });
            await waitFor(() => tabOf(it), 15000, "note tab " + n);
        }
        [a, b, c] = made;
        // Zotero pins note tabs here? (49b48f5d08 pinned library tabs only.)
        ZT.setPinned(tabOf(a).id, true);
        const pinsNotes = !!tabOf(a).pinned;
        ZT.setPinned(tabOf(a).id, false);
        if (!pinsNotes) this.skip();
        apply();
        try { ZT.select("zotero-pane"); } catch (er) {}
        await sleep(600);
        delete win._wvStabilizeBurst;
    });

    after(async function () {
        if (!ZT || typeof ZT.setPinned !== "function") return;
        try {
            win._wvSelTabIDs = new Set();
            unpinAll();
            for (const it of [a, b, c]) { if (it) try { wv._pinnedTabsRemove(it.libraryID, it.key); } catch (er) {} }
            for (const it of [a, b, c]) { const t = it && tabOf(it); if (t && t.data) delete t.data.wvGroupId; }
            if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
            apply();
        } catch (er) {}
        try { if (w2 && !w2.closed) w2.close(); } catch (er) {}
        for (const it of [a, b, c]) { const t = it && tabOf(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await wvT.erase(a, b, c);
        try {
            if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
        try { delete win._wvStabilizeBurst; } catch (er) {}
    });

    it("a note tab's menu has one Pin Tab: Zotero's", async function () {
        const pins = await withMenu(tabOf(a).id, items => pinEntries(items).map(mi => mi.getAttribute("data-l10n-id") || mi.getAttribute("label")));
        assert.deepEqual(pins, ["tabs-pin"], "Zotero's entry alone (Weavero's is hidden where Zotero pins)");
    });

    it("Zotero's Pin Tab on a note tab: Weavero sees it, draws it once as a pinned icon, asks for no refused move", async function () {
        delete win._wvStabilizeBurst;
        const s = await spyMoves(async () => { ZT.setPinned(tabOf(a).id, true); }, "Zotero's Pin Tab on A");
        assert.ok(tabOf(a).pinned, "pinned by Zotero");
        assert.ok(wv._wvTabIsPinned(win, tabOf(a)), "Weavero sees Zotero's pin");
        assert.deepEqual(screen().filter(x => /A$/.test(x)), ["pin:A"], "A once, as a pinned icon: " + screen().join(" "));
        assert.isBelow(rect(mirror(tabOf(a).id)).width, 60, "icon-sized");
        assert.strictEqual(s.refused, 0, "no refused move: " + JSON.stringify(s));
    });

    it("a Weavero pin of an item is handed to Zotero, once", async function () {
        wv._pinnedTabsAdd(b.libraryID, b.key);   // what 1.0.4, a session, a stored window or a transfer leaves
        apply(); await settle("hand over");
        assert.ok(tabOf(b).pinned, "B is Zotero's pin now");
        assert.notOk(wv._pinnedTabsHas(b.libraryID, b.key), "and no longer in Weavero's store");
        assert.deepEqual(pinned(), ["A", "B"], "at the end of the pins");
        assert.deepEqual(screen().filter(x => /^pin:/.test(x)), ["pin:A", "pin:B"]);
    });

    it("Pin N Tabs / Unpin N Tabs on a selection act through Zotero on all of it", async function () {
        unpinAll(); apply(); await settle("unpin all");
        win._wvSelTabIDs = new Set([tabOf(a).id, tabOf(b).id]);
        const label = await withMenu(tabOf(a).id, async (items) => {
            const pins = pinEntries(items);
            assert.strictEqual(pins.length, 1, "one entry: " + pins.map(mi => mi.getAttribute("label")).join(" | "));
            const l = pins[0].getAttribute("label");
            pins[0].dispatchEvent(new win.Event("command"));
            return l;
        });
        await settle("pin 2");
        assert.strictEqual(label, "Pin 2 Tabs");
        assert.deepEqual(pinned().sort(), ["A", "B"], "both pinned by Zotero");
        const label2 = await withMenu(tabOf(a).id, async (items) => {
            const pins = pinEntries(items);
            const l = pins[0] && pins[0].getAttribute("label");
            if (pins[0]) pins[0].dispatchEvent(new win.Event("command"));
            return l;
        });
        await settle("unpin 2");
        assert.strictEqual(label2, "Unpin 2 Tabs");
        assert.deepEqual(pinned(), [], "both unpinned");
        win._wvSelTabIDs = new Set();
    });

    it("Close N Tabs leaves a tab Zotero pinned and closes the others", async function () {
        ZT.setPinned(tabOf(a).id, true); apply(); await settle("pin A");
        const aID = tabOf(a).id, cID = tabOf(c).id;
        const popup = doc.createXULElement("menupopup");
        const mi = doc.createXULElement("menuitem");
        mi.setAttribute("label", Zotero.getString("general.close"));
        popup.appendChild(mi);
        doc.documentElement.appendChild(popup);
        try {
            wv._wvMakeCloseTabsMenuMulti(win, popup, [aID, cID]);
            const item = popup.querySelector("menuitem");
            assert.strictEqual(item.getAttribute("label"), "Close Tab", "counts only what the user may close");
            item.dispatchEvent(new win.Event("command"));
            await settle("close");
            assert.ok(ZT._tabs.some(t => t.id === aID), "A, pinned, still open");
            assert.notOk(ZT._tabs.some(t => t.id === cID), "C closed");
        }
        finally { popup.remove(); }
        await win.ZoteroPane.openNote(c.id, { openInWindow: false });
        await waitFor(() => tabOf(c), 15000, "C again");
        apply(); await settle("C back");
    });

    it("Move Tab to another window leaves a pinned tab out", async function () {
        const build = () => {
            const popup = doc.createXULElement("menupopup");
            const menu = doc.createXULElement("menu");
            menu.setAttribute("label", Zotero.getString("tabs.move"));
            menu.appendChild(doc.createXULElement("menupopup"));
            popup.appendChild(menu);
            doc.documentElement.appendChild(popup);
            return popup;
        };
        const p1 = build(), p2 = build();
        try {
            wv._wvInjectMoveTargetsIntoNativeMoveMenu(win, p1, [tabOf(c).id]);
            wv._wvInjectMoveTargetsIntoNativeMoveMenu(win, p2, [tabOf(a).id]);
            const n1 = p1.querySelectorAll(".wv-mv-target").length, n2 = p2.querySelectorAll(".wv-mv-target").length;
            assert.isAbove(n1, 0, "control: an unpinned tab gets the targets");
            assert.strictEqual(n2, 0, "a pinned tab gets none (Zotero keeps it in its window)");
        }
        finally { p1.remove(); p2.remove(); }
    });

    it("a drag into the pinned row pins through Zotero where it was dropped; a drag out unpins", async function () {
        // A pinned; pin B too, then drag C before B.
        ZT.setPinned(tabOf(b).id, true); apply(); await settle("pin B");
        assert.deepEqual(order().slice(0, 2), ["A", "B"]);
        const nC = node(tabOf(c).id), rB = rect(mirror(tabOf(b).id));
        const s = await spyMoves(() => gesture(nC, [Math.round(rect(nC).left - 20), Math.round(rB.left + 4), Math.round(rB.left + 2)], "C before B"), "C before B");
        assert.ok(tabOf(c).pinned, "C pinned by Zotero through the drop: " + order().join(","));
        assert.deepEqual(order(), ["A", "C", "B"], "where it was dropped");
        assert.strictEqual(s.refused, 0, "no refused move: " + JSON.stringify(s));
        const mC = mirror(tabOf(c).id);
        const farRight = Math.round(rect(cont).right - 30);
        await gesture(mC, [Math.round(rect(mC).left + 40), farRight - 40, farRight], "C out");
        assert.notOk(tabOf(c).pinned, "unpinned by the drag out: " + order().join(","));
        assert.deepEqual(pinned(), ["A", "B"]);
    });

    it("joining a group unpins (Firefox); Zotero pinning a grouped tab takes it out of the group", async function () {
        group = wv._tabGroupCreate("WV Zotero Pin Any", "green");
        wv._wvTabGroupAddTab(win, tabOf(c).id, group.id);
        const s = await spyMoves(async () => { wv._wvTabGroupAddTab(win, tabOf(b).id, group.id); apply(); }, "B joins");
        assert.notOk(tabOf(b).pinned, "B unpinned to join");
        assert.strictEqual(wv._wvTabGroupStamp(tabOf(b)), group.id, "B in the group");
        assert.strictEqual(s.refused, 0, "no refused move: " + JSON.stringify(s));
        ZT.setPinned(tabOf(c).id, true); apply(); await settle("Zotero pins grouped C");
        assert.ok(tabOf(c).pinned, "C pinned");
        assert.notOk(wv._wvTabGroupStamp(tabOf(c)), "and out of the group");
        assert.ok(mirror(tabOf(c).id), "drawn as a pin");
        ZT.setPinned(tabOf(c).id, false); apply(); await settle("unpin C");
    });

    it("a session records Zotero's pin", function () {
        const rec = wv._wvTabSessionRecordFromMainTab(tabOf(a), ZT.selectedID);
        assert.ok(rec && rec.pinned, "A recorded pinned: " + JSON.stringify(rec));
        const rec2 = wv._wvTabSessionRecordFromMainTab(tabOf(c), ZT.selectedID);
        assert.notOk(rec2 && rec2.pinned, "C not: " + JSON.stringify(rec2));
    });

    // Alignment review 2026-11-11 §1.1, reproduced on Zotero main d569d42f5
    // (D:/tmp/pin-restart-probe.txt): Weavero's hardened copy of
    // Zotero_Tabs.restoreState never re-pinned a tab saved as pinned (Zotero's own
    // loop calls setPinned, tabs.js:878-881), so a closed window reopened through
    // Zotero came back with its pins lost; without Weavero they stayed.
    it("a closed window reopened through Zotero keeps a tab Zotero pinned", async function () {
        const S = /** @type {any} */ (Zotero).Session;
        if (!S || typeof S.takeLastClosed !== "function") wvT.absent("Zotero.Session.takeLastClosed");
        const d = new Zotero.Item("note"); d.setNote("<p>wv zotero pin reopen D</p>"); await d.saveTx();
        let W = null, back = null;
        try {
            W = await wvT.openMainWindow();
            assert.ok(W, "fixture: a second window");
            await W.ZoteroPane.openNote(d.id, { openInWindow: false });
            const tD = await waitFor(() => W.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === d.id), 15000, "D's tab");
            W.Zotero_Tabs.setPinned(tD.id, true);
            assert.ok(tD.pinned, "fixture: D pinned by Zotero");
            await sleep(400);
            const before = new Set(Zotero.getMainWindows());
            W.close();
            await waitFor(() => W.closed, 10000, "the window closed");
            await sleep(500);
            const closed = S.takeLastClosed();
            assert.ok(closed, "fixture: Zotero recorded the closed window");
            /** @type {any} */ (Zotero).openMainWindow({ sessionState: closed.window || closed });
            back = await waitFor(() => Zotero.getMainWindows().find(x => !before.has(x) && x.Zotero_Tabs && x.Zotero_Tabs._tabs.some(t => t.data && t.data.itemID === d.id)), 20000, "the window back");
            await sleep(1500);
            const t = back.Zotero_Tabs._tabs.find(x => x.data && x.data.itemID === d.id);
            assert.ok(t && t.pinned, "D still pinned: " + JSON.stringify(back.Zotero_Tabs._tabs.map(x => x.type + (x.pinned ? "[pin]" : ""))));
            assert.ok(back.Zotero_Tabs._tabs.some(x => x.id === back.Zotero_Tabs.selectedID), "a tab selected");
        }
        finally {
            for (const x of [back, W]) { try { if (x && !x.closed) x.close(); } catch (er) {} }
            try { win.focus(); } catch (er) {}
            await sleep(500);
            await wvT.erase(d);
        }
    });
});
