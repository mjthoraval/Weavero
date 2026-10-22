/* global describe, it, before, after, assert, Zotero */
// Pinned-tab drags through the REAL tab-bar listener chain (2026-10-15).
//
// MJT's Zotero froze while reordering pinned tabs on 0.22.2-dev.8. The ring
// log of the retries on dev.9 showed why the reorder never took: the other
// pin is a MIRROR (#wv-pinned-mirrors; its real .tab is display:none), which
// the sliding-gap geometry did not see, so a drop left of it computed the
// slot right after the dragged pin ("gapDrop: -> idx 3 (from 2)", a no-op
// for Zotero_Tabs.move). Mirrors were not draggable at all, and the
// pin/unpin verdict in tabs.ts read the tab's LIVE index -- which the gap
// drag never changes -- so a drop into the pinned region no longer pinned,
// while a drag of the last pin that ended WITHOUT a drop unpinned it. The
// dragged pin was only a real tab because of a stale group stamp (a group
// that no longer exists), which also kept it out of the loose-pin cluster.
//
// Synthetic DragEvents carry a DataTransfer, so every listener runs as in a
// real drag: tabs.ts (pin verdict, move MIME), tab-groups.ts (gap, commit)
// and Zotero's React handlers. Every gesture must SETTLE -- no reorder storm
// (the stabilizer's breaker), no mutation churn; a synchronous loop would
// hang this runner, which is the point.
describe("Weavero — pinned tabs reorder by drag and every drag settles", function () {
    this.timeout(120000);
    let wv, win, ZT, doc, cont, a, b, c, d, e, group, prevGroups, prevTW;
    const names = new Map();   // item -> "A".."E"
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const tabOf = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const node = (id) => doc.querySelector('#tab-bar-container .tab[data-id="' + id + '"]');
    const mirror = (id) => doc.querySelector('#wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + id + '"]');
    const order = () => ZT._tabs.slice(1).map(t => [a, b, c, d, e].find(it => it.id === (t.data && t.data.itemID))).map(it => it ? names.get(it) : "?");
    const pinned = (it) => wv._pinnedTabsHas(it.libraryID, it.key);
    const isMirrored = (it) => { const t = tabOf(it); const n = t && node(t.id); return !!(t && mirror(t.id) && n && n.getBoundingClientRect().width < 1); };
    const rect = (el) => el.getBoundingClientRect();
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    async function openNote(it, name) {
        await win.ZoteroPane.openNote(it.id, { openInWindow: false });
        return waitFor(() => tabOf(it), 15000, "note tab " + name);
    }
    const apply = () => { wv._applyPinnedTabs(win); wv._applyTabGroups(win); };
    const dragEv = (type, x, y, dt, target) => {
        const ev = new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, dataTransfer: dt });
        target.dispatchEvent(ev);
        return ev;
    };
    /** The bar must come to rest after a gesture: past the deferred commit
     *  (80 ms) and the multi-drag settle (150 ms), a 700 ms window sees no
     *  reorder storm and (almost) no tab-bar mutations. */
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
    /** A drag of `srcEl` through the x positions `xs` (y = the element's
     *  centre), then a drop (default) or a bare dragend with `dropEffect`. */
    async function gesture(srcEl, xs, opts) {
        const o = opts || {};
        const r = rect(srcEl);
        const y = Math.round(r.top + r.height / 2);
        const x0 = Math.round(r.left + r.width / 2);
        const dt = new win.DataTransfer();
        dragEv("dragstart", x0, y, dt, srcEl);
        // The state right after dragstart, before any task runs (what the
        // drag-start handlers themselves left in the strip).
        const afterStart = typeof o.afterStart === "function" ? o.afterStart(dt) : undefined;
        let target = srcEl;
        for (const x of xs) {
            // The element under the point, but always INSIDE the tab bar: in
            // the runner's narrow window a point just past the last tab can hit
            // the title bar, and a dragover dispatched there reaches none of the
            // bar's listeners (a real pointer past the last tab is still over
            // the strip's empty area).
            target = doc.elementFromPoint(x, y);
            if (!target || !cont.contains(target)) target = cont;
            dragEv("dragover", x, y, dt, target);
            await sleep(40);
        }
        const xEnd = xs.length ? xs[xs.length - 1] : x0;
        // The state mid-drag, before the drop -- once the strip has SETTLED:
        // the neighbours slide into place over 120 ms (tab-groups.ts
        // _wvOpenGap) and the unpin preview's width converges over a few
        // layout steps, so a sample 40 ms after the last dragover reads
        // mid-slide rects (a 21px "overlap" between two sliding tabs in the
        // dev.24 and dev.26 runs, green in between). Poll until two
        // consecutive 50 ms reads agree (cap 800 ms).
        let probe;
        if (typeof o.probe === "function") {
            const snap = () => Array.from(cont.querySelectorAll(".tab, .wv-tab-group-chip, .wv-pinned-mirror"))
                .map((el) => { const q = rect(el); return Math.round(q.left * 2) + ":" + Math.round(q.width * 2); }).join(",");
            let prev = snap();
            for (let i = 0; i < 16; i++) { await sleep(50); const cur = snap(); if (cur === prev) break; prev = cur; }
            probe = o.probe();
        }
        if (o.drop !== false) { dt.dropEffect = "move"; dragEv("drop", xEnd, y, dt, target); }
        else dt.dropEffect = o.dropEffect || "none";
        dragEv("dragend", xEnd, y, dt, srcEl);
        // Right after dragend (before the deferred commit) the dragged element
        // must still be lifted where it was dropped: closing the gap here used
        // to paint the ORIGINAL order for 80 ms (snap-back, MJT 2026-10-15).
        // The COMPUTED transform: the lift is a stylesheet rule on a custom
        // property (Zotero rewrites the inline transform on every render).
        const liftedAtDragend = win.getComputedStyle(srcEl).transform;
        await settle(o.label || "gesture");
        return { liftedAtDragend, liftedAtEnd: win.getComputedStyle(srcEl).transform, probe, afterStart };
    }

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_applyPinnedTabs", "_applyTabGroups", "_pinnedTabsAdd", "_pinnedTabsRemove", "_pinnedTabsHas",
            "_tabGroupCreate", "_tabGroupAddKey", "_wvTabGroupSetStamp", "_wvTabGroupStamp", "_wvTabGroupStampLeave", "_wvTabGroupStabilize"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        cont = doc.getElementById("tab-bar-container");
        if (!cont || typeof win.DragEvent !== "function" || typeof win.DataTransfer !== "function") this.skip();
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        a = await wvT.createTestPDFItem("wv-pin-a"); names.set(a, "A");
        await wvT.openReaderTab(a.id);
        await waitFor(() => tabOf(a), 15000, "reader tab A");
        const made = {};
        for (const name of ["B", "C", "D", "E"]) {
            const it = new Zotero.Item("note"); it.setNote("<p>wv pin drag " + name + "</p>"); await it.saveTx();
            names.set(it, name); made[name] = it;
            await openNote(it, name);
        }
        b = made.B; c = made.C; d = made.D; e = made.E;
        // A and B pinned (loose), D and E in a live group; C loose in between.
        wv._pinnedTabsAdd(a.libraryID, a.key);
        wv._pinnedTabsAdd(b.libraryID, b.key);
        group = wv._tabGroupCreate("WV Pin Drag", "red");
        for (const it of [d, e]) {
            wv._tabGroupAddKey(group.id, { libraryID: it.libraryID, itemKey: it.key });
            wv._wvTabGroupSetStamp(tabOf(it), group.id);
        }
        apply();
        await sleep(300);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await sleep(300);
        delete win._wvStabilizeBurst;
    });

    after(async function () {
        // The drag ring (timings of every press / dragstart / first lift of
        // this run) to the temp dir, for reading after a run: the runner's
        // Zotero.debug output is not in the test log.
        try {
            const ring = (/** @type {any} */ (Zotero))._wvGroupDnDLog || [];
            await Zotero.File.putContentsAsync(PathUtils.join(PathUtils.tempDir, "wv-groupdnd-ring.json"), JSON.stringify(ring, null, 1));
        } catch (er) {}
        try {
            for (const it of [a, b, c, d, e]) { const t = it && tabOf(it); if (t) { try { wv._wvTabGroupSetStamp(t, null); } catch (er) {} } }
            if (group) wv._tabGroupsSet(wv._tabGroupsGet().filter(g => g.id !== group.id));
            for (const it of [a, b, c, d, e]) { if (it) try { wv._pinnedTabsRemove(it.libraryID, it.key); } catch (er) {} }
            apply();
        } catch (er) {}
        for (const it of [a, b, c, d, e]) { const t = it && tabOf(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(400);
        await wvT.erase(a, b, c, d, e);
        try {
            if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
            if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
        } catch (er) {}
        try { delete win._wvStabilizeBurst; } catch (er) {}
    });

    it("fixture: A and B are loose pins drawn as icon mirrors, D and E grouped", function () {
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
        assert.ok(pinned(a) && pinned(b), "A and B pinned");
        assert.ok(isMirrored(a) && isMirrored(b), "both pins are mirrors (real tabs hidden)");
        assert.ok(doc.getElementById("wv-tgchip-" + group.id), "group chip drawn");
    });

    it("a pin's mirror is draggable (Firefox: pinned tabs reorder among themselves)", function () {
        assert.strictEqual(mirror(tabOf(b).id).getAttribute("draggable"), "true");
    });

    it("a tab drag shows the arrow, not Windows' no-entry sign (Firefox: dt.mozCursor = \"default\")", async function () {
        // MJT 2026-10-19: over the reader page the cursor was the no-entry
        // sign, while a release there tears the tab off into its own window.
        // Firefox sets the arrow for every tab and group-label drag
        // (drag-and-drop.js); so do the tab bar and the group chip. Each drag
        // ends without a drop, inside the window: nothing moves (a drop on the
        // element's own centre is NOT a no-op for a pin: once it lifts, that
        // point lies over its neighbour).
        const still = (label) => ({ drop: false, dropEffect: "none", label, afterStart: (dt) => dt.mozCursor });
        const nC = node(tabOf(c).id), mA = mirror(tabOf(a).id), chip = doc.getElementById("wv-tgchip-" + group.id);
        assert.strictEqual((await gesture(nC, [], still("cursor: tab"))).afterStart, "default", "a normal tab");
        assert.strictEqual((await gesture(mA, [], still("cursor: pin"))).afterStart, "default", "a pin's icon");
        assert.strictEqual((await gesture(chip, [], still("cursor: group chip"))).afterStart, "default", "a group chip");
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"], "nothing moved");
        assert.ok(pinned(a) && pinned(b), "the pins stay pinned");
    });

    it("a press on a pinned icon selects its tab on mouse down, like Zotero's tabs", async function () {
        // MJT 2026-10-15: click-and-hold on a pin left the tab unfocused
        // until release, the opposite of a normal tab.
        try { ZT.select("zotero-pane"); } catch (er) {}
        await waitFor(() => ZT.selectedID === "zotero-pane", 5000, "library selected");
        const tB = tabOf(b), mB = mirror(tB.id);
        mB.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        await waitFor(() => ZT.selectedID === tB.id, 5000, "B selected on mouse down");
        assert.strictEqual(ZT.selectedID, tB.id);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await waitFor(() => ZT.selectedID === "zotero-pane", 5000, "library selected again");
    });

    it("dragging a pin's mirror left of another pin reorders the pins; both stay pinned", async function () {
        const mA = mirror(tabOf(a).id), mB = mirror(tabOf(b).id);
        const rA = rect(mA), rB = rect(mB);
        const lift = await gesture(mB, [Math.round(rB.left - 6), Math.round(rA.left + 4), Math.round(rA.left + 2)], { label: "pin reorder" });
        assert.match(lift.liftedAtDragend, /^matrix\(1, 0, 0, 1, -?[1-9]/, "the dropped icon stays lifted at its drop point until the commit (no snap-back): " + lift.liftedAtDragend);
        assert.strictEqual(lift.liftedAtEnd, "none", "and is un-lifted once the move committed");
        assert.deepEqual(order(), ["B", "A", "C", "D", "E"], "B now before A");
        assert.ok(pinned(a) && pinned(b), "both still pinned");
        assert.ok(isMirrored(a) && isMirrored(b), "both still mirrors");
        const ms = Array.from(doc.querySelectorAll("#wv-pinned-mirrors .wv-pinned-mirror")).map(m => m.getAttribute("data-tab-id"));
        assert.deepEqual(ms, [tabOf(b).id, tabOf(a).id], "mirrors follow the tab order");
        // Back to A, B for the next tests.
        ZT.move(tabOf(a).id, 1); apply(); await sleep(300);
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("dragging the SELECTED pin's mirror (a loaded PDF reader) left of the other pin reorders and settles", async function () {
        // MJT's bar on 2026-10-15: the dragged pin was the selected tab, a
        // loaded PDF reader; the same scripted gesture hung the live instance.
        ZT.select(tabOf(a).id);
        await waitFor(() => ZT.selectedID === tabOf(a).id, 10000, "A selected");
        await sleep(500);
        // A is first; move it second so there is a pin to its left to drop before.
        ZT.move(tabOf(a).id, 3); apply(); await sleep(400);
        assert.deepEqual(order(), ["B", "A", "C", "D", "E"]);
        const mA = mirror(tabOf(a).id), mB = mirror(tabOf(b).id);
        assert.ok(mA && mA.classList.contains("selected"), "A's mirror is the selected one");
        const rB = rect(mB);
        await gesture(mA, [Math.round(rB.right - 4), Math.round(rB.left + 4), Math.round(rB.left + 2)], { label: "selected pin reorder" });
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"], "A back before B");
        assert.strictEqual(ZT.selectedID, tabOf(a).id, "A still selected");
        assert.ok(pinned(a) && pinned(b) && isMirrored(a) && isMirrored(b), "both still mirrored pins");
        // And the other way: the unselected pin dropped left of the selected one.
        const rA = rect(mirror(tabOf(a).id));
        await gesture(mirror(tabOf(b).id), [Math.round(rA.right - 4), Math.round(rA.left + 4), Math.round(rA.left + 2)], { label: "pin left of the selected pin" });
        assert.deepEqual(order(), ["B", "A", "C", "D", "E"]);
        ZT.move(tabOf(a).id, 1); apply(); await sleep(300);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await sleep(300);
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("a re-render during the drag (a loading tab's title update) does not drop the lifted tab", async function () {
        // Zotero's tab bar re-applies its own drag transform to the dragged
        // tab after every render (a layout effect with no dependency list):
        // with its dragover blocked, that is translateX(0) -- the lifted tab
        // snapped back on every title update of a loading tab (MJT
        // 2026-10-15). The observer pass must re-lift it before the paint.
        const nC = node(tabOf(c).id);
        const r = rect(nC);
        const y = Math.round(r.top + r.height / 2), x0 = Math.round(r.left + r.width / 2);
        const dt = new win.DataTransfer();
        const tD = tabOf(d), oldTitle = tD.title;
        const seen = [];   // computed transform of the dragged tab at each step (diagnostics)
        const xs = [x0 + 20, x0 + 50, x0 + 70];
        const tf = () => win.getComputedStyle(nC).transform;
        let ours = "";
        try {
            dragEv("dragstart", x0, y, dt, nC);
            seen.push("start:" + tf());
            for (const x of xs) { dragEv("dragover", x, y, dt, doc.elementFromPoint(x, y) || cont); await sleep(30); seen.push("over" + x + ":" + tf()); }
            // What the gap wants for the last x (the value a re-render must not lose).
            wv._wvOpenGap(win, win._wvTabDragLastX);
            ours = tf();
            seen.push("gap:" + ours + " inline=" + nC.style.transform);
            ZT.rename(tD.id, "wv loading title " + Date.now());   // a loading tab's title update: full re-render
            await sleep(150);                                      // React's async commit
            seen.push("renamed:" + tf() + " inline=" + nC.style.transform + " dragging=" + nC.classList.contains("dragging"));
        } finally {
            // Always finish the gesture, or a stale drag flag poisons the next tests.
            try {
                dt.dropEffect = "move";
                dragEv("drop", xs[2], y, dt, doc.elementFromPoint(xs[2], y) || cont);
                dragEv("dragend", xs[2], y, dt, nC);
                await settle("re-render mid-drag");
            } catch (er) {}
            try { ZT.rename(tD.id, oldTitle); } catch (er) {}
            try { const tC = tabOf(c); const s = wv._wvTabGroupStamp(tC); if (s) wv._wvTabGroupStampLeave(tC, s); } catch (er) {}
            ZT.move(tabOf(c).id, 3); apply(); await sleep(300);
        }
        assert.match(ours, /^matrix\(1, 0, 0, 1, -?[1-9]/, "lifted by the gap: " + seen.join(" | "));
        const after = seen[seen.length - 1].slice("renamed:".length).split(" inline=")[0];
        assert.strictEqual(after, ours, "still lifted at the drop point after the re-render: " + seen.join(" | "));
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("a stale group stamp (group gone) does not pull a pin out of the loose cluster", async function () {
        // MJT's bar: the PDF pin carried the stamp of a deleted group, so it was
        // drawn as a real tab beside the mirrors and sorted as a group member.
        const tB = tabOf(b);
        wv._wvTabGroupSetStamp(tB, "wvg-phantom-" + Date.now().toString(36));
        apply(); await sleep(300);
        try {
            assert.ok(isMirrored(b), "a pin with a dead stamp is a loose pin: mirrored");
            // And the loose cluster keeps it left of everything unpinned.
            ZT.move(tB.id, 4); apply(); await sleep(300);
            assert.deepEqual(order(), ["A", "B", "C", "D", "E"], "stabilize clusters it back with the pins");
        } finally {
            wv._wvTabGroupSetStamp(tB, null); apply(); await sleep(200);
        }
        await settle("dead stamp");
    });

    it("a drag that ends without a drop changes nothing (no move, no unpin)", async function () {
        // A grouped pin is a real tab (pinned-first inside its group) -- the
        // case where the old live-index verdict read 'beyond the pins' and
        // unpinned it on a bare dragend.
        const tB = tabOf(b);
        wv._wvTabGroupSetStamp(tB, group.id); wv._tabGroupAddKey(group.id, { libraryID: b.libraryID, itemKey: b.key });
        apply(); await sleep(300);
        try {
            // The group's run is emitted at B's slot (pinned member first), so
            // D and E move up behind it and C follows.
            assert.deepEqual(order(), ["A", "B", "D", "E", "C"], "B is the group's pinned first member");
            const nB = node(tB.id);
            assert.ok(nB && rect(nB).width > 1, "B is a real (visible) pinned tab");
            const r = rect(nB);
            const lift = await gesture(nB, [Math.round(r.right + 30), Math.round(r.right + 60)], { drop: false, dropEffect: "none", label: "no-drop dragend" });
            assert.strictEqual(lift.liftedAtEnd, "none", "the gap is closed after a drag that commits nothing");
            assert.ok(pinned(b), "B still pinned");
            assert.strictEqual(wv._wvTabGroupStamp(tB), group.id, "B still in the group");
            assert.deepEqual(order(), ["A", "B", "D", "E", "C"], "order unchanged");
        } finally {
            wv._wvTabGroupStampLeave(tB, group.id); apply(); await sleep(200);
            ZT.move(tabOf(c).id, 3); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("a collapsed group hides its pinned first member too -- no blank box after the chip", async function () {
        // MJT 2026-10-19: a gap after a collapsed group's chip. Its pinned
        // member was hidden (transparent) but kept the pin's width, which the
        // pin rules hold as hard as the hide rule.
        const tB = tabOf(b);
        wv._wvTabGroupSetStamp(tB, group.id); wv._tabGroupAddKey(group.id, { libraryID: b.libraryID, itemKey: b.key });
        apply(); await sleep(300);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await waitFor(() => ZT.selectedID === "zotero-pane", 5000, "library selected");
        try {
            assert.deepEqual(order(), ["A", "B", "D", "E", "C"], "B is the group's pinned first member");
            wv._wvTabGroupToggleCollapse(win, group.id);
            await waitFor(() => node(tB.id).classList.contains("wv-group-hidden"), 5000, "B hidden with the group");
            await sleep(200);
            const chip = doc.getElementById("wv-tgchip-" + group.id), nC = node(tabOf(c).id);
            assert.isBelow(rect(node(tB.id)).width, 1, "the pinned member takes no width");
            assert.isBelow(rect(nC).left - rect(chip).right, 12, "the next tab follows the chip with the usual spacing, no blank box");
        } finally {
            const g = wv._tabGroupsGet().find(x => x.id === group.id);
            if (g && g.collapsed) wv._wvTabGroupToggleCollapse(win, group.id);
            wv._wvTabGroupStampLeave(tB, group.id); apply(); await sleep(200);
            ZT.move(tabOf(c).id, 3); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("an unpinned tab dropped inside the pinned region is pinned; a pin dropped past it is unpinned", async function () {
        const nC = node(tabOf(c).id), mA = mirror(tabOf(a).id);
        const rA = rect(mA);
        // Mid-drag, over the pinned region, the dragged tab previews as a pin:
        // icon-only (MJT 2026-10-15: "the preview should become small").
        const r1 = await gesture(nC, [Math.round(rect(nC).left - 20), Math.round(rA.left + 4), Math.round(rA.left + 2)], { label: "drop to pin",
            probe: () => ({ attr: nC.getAttribute("data-wv-pin-preview"), width: rect(nC).width }) });
        assert.strictEqual(r1.probe.attr, "pin", "pin preview on the dragged tab");
        assert.isBelow(r1.probe.width, 40, "icon-only while over the pins: " + r1.probe.width);
        assert.ok(pinned(c), "C pinned by the drop");
        assert.deepEqual(order(), ["C", "A", "B", "D", "E"], "C first among the pins");
        assert.ok(isMirrored(c), "C drawn as a mirror");
        // Now out: C's mirror dropped after the last tab. Mid-drag, past the
        // pins, the ICON grows into a tab with its title ("the preview should expand").
        const mC = mirror(tabOf(c).id);
        const last = node(tabOf(e).id);
        const rL = rect(last);
        const r2 = await gesture(mC, [Math.round(rect(mC).right + 20), Math.round(rL.right - 4), Math.round(rL.right + 6)], { label: "drop to unpin",
            probe: () => { const t = mC.querySelector(".wv-pinned-mirror-title"); const g = win._wvGapResult; const d = wv._wvTabDrag;
                // A normal tab's width right now, and whether any two visible
                // strip elements overlap while the gap is open.
                const refTab = Array.from(doc.querySelectorAll("#tab-bar-container .tabs > .tab:not(.wv-pinned-tab):not(:first-child)")).find(x => x !== mC && rect(x).width > 1);
                const els = Array.from(doc.querySelectorAll("#tab-bar-container .tabs > .tab, #tab-bar-container .tabs > .wv-tab-group-chip, #wv-pinned-mirrors .wv-pinned-mirror"))
                    .filter(x => x !== mC && rect(x).width > 1).map(x => ({ el: x, r: rect(x) })).sort((p, q) => p.r.left - q.r.left);
                let overlap = 0, pair = null;
                for (let i = 1; i < els.length; i++) { const o = els[i - 1].r.right - els[i].r.left; if (o > overlap) { overlap = o; pair = [els[i - 1], els[i]]; } }
                const desc = (p) => (p.el.className.split(" ")[0]) + "#" + (p.el.getAttribute("data-id") || p.el.getAttribute("data-tab-id") || p.el.id) + "@" + Math.round(p.r.left) + ".." + Math.round(p.r.right) + " tf=" + (p.el.style.transform || "-");
                const geom = win._wvDragGeom;
                return { attr: mC.getAttribute("data-wv-pin-preview"), width: rect(mC).width, refWidth: refTab ? rect(refTab).width : null, overlap, bg: win.getComputedStyle(mC).backgroundColor, outline: win.getComputedStyle(mC).outlineStyle,
                    fill: win.getComputedStyle(doc.documentElement).getPropertyValue("--wv-ff-tab-selected").trim(), title: t ? t.textContent : null, titleShown: !!(t && rect(t).width > 0),
                    diag: JSON.stringify({ tabDrag: !!d, tabDragID: d && d.tabID, cID: tabOf(c).id, wasPinned: d && d.wasPinned, gap: g && { slot: g.slot, fnp: g.firstNonPinnedZIdx, join: g.joinGroupId, dp: g.draggedPinned }, realW: rect(node(tabOf(c).id)).width, mirrorConnected: mC.isConnected, dragFlag: win._wvTabGroupDragTabID,
                        pair: pair && pair.map(desc), mC: "@" + Math.round(rect(mC).left) + ".." + Math.round(rect(mC).right) + " tf=" + win.getComputedStyle(mC).transform, unpinW: mC.style.getPropertyValue("--wv-unpin-w"),
                        geom: geom && { gapWidth: geom.gapWidth, originLeft: geom.originLeft, originRight: geom.originRight, n: geom.elems && geom.elems.length },
                        withAttr: Array.from(doc.querySelectorAll("[data-wv-pin-preview]")).map(el => el.className + "#" + (el.getAttribute("data-id") || el.getAttribute("data-tab-id")) + "=" + el.getAttribute("data-wv-pin-preview")),
                        mirrors: Array.from(doc.querySelectorAll("#wv-pinned-mirrors .wv-pinned-mirror")).map(m => m.getAttribute("data-tab-id") + (m === mC ? "*" : "")) }) }; } });
        try {
            assert.strictEqual(r2.probe.attr, "unpin", "unpin preview on the dragged icon: " + r2.probe.diag);
            assert.isAtLeast(r2.probe.width, 100, "grown into a tab: " + r2.probe.width);
            // The preview is as wide as a normal tab in this strip (not its
            // title's width), carries the blue tint, and the open gap leaves
            // no two strip elements overlapping (MJT 2026-10-16).
            assert.approximately(r2.probe.width, r2.probe.refWidth, 2, "the width of a normal tab here (" + r2.probe.refWidth + ")");
            // Under the Firefox-style design (the runner's default) the
            // preview carries no accent: no outline, the selected fill (MJT
            // 2026-10-16: "drop the blue in all drag cases"; Firefox marks a
            // tab leaving the pins with nothing). The blue tint is the
            // design-off look (selected-tab-ring.spec.js).
            const hexRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return "rgb(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")"; };
            assert.strictEqual(r2.probe.outline, "none", "no accent outline on the expanded icon");
            assert.strictEqual(r2.probe.bg, hexRgb(r2.probe.fill), "the selected fill on the expanded icon, not the blue tint (fill " + r2.probe.fill + ")");
            assert.isBelow(r2.probe.overlap, 3, "no overlapping strip elements mid-drag (max overlap " + r2.probe.overlap + "px): " + r2.probe.diag);
            assert.strictEqual(r2.probe.title, tabOf(c).title, "its title");
            assert.ok(r2.probe.titleShown, "title visible in the preview");
            assert.notOk(mC.hasAttribute("data-wv-pin-preview") && mC.isConnected, "preview cleared after the drop");
            assert.notOk(pinned(c), "C unpinned by the drop past the pins");
            assert.deepEqual(order(), ["A", "B", "D", "E", "C"], "C at the end, out of the group");
            assert.notOk(wv._wvTabGroupStamp(tabOf(c)), "C did not join the group");
        } finally {
            // Whatever failed above, leave the fixture as the next tests expect it.
            try { const tC = tabOf(c); const s = wv._wvTabGroupStamp(tC); if (s) wv._wvTabGroupStampLeave(tC, s); if (pinned(c)) wv._pinnedTabsRemove(c.libraryID, c.key); } catch (er) {}
            ZT.move(tabOf(c).id, 3); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
    });

    it("Ctrl-click selects pinned icons into the multi-selection; a two-pin drag out unpins both", async function () {
        // MJT 2026-10-16: "I cannot select 2 pinned tabs" -- the multi-select
        // handlers only knew .tab nodes; a loose pin's visible face is its
        // mirror.
        const tA = tabOf(a), tB = tabOf(b);
        try { ZT.select("zotero-pane"); } catch (er) {}
        await waitFor(() => ZT.selectedID === "zotero-pane", 5000, "library selected");
        win._wvSelTabIDs = new Set(); wv._wvTabMultiSelSync(win);
        const press = (el) => { el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })); el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })); };
        try {
            press(mirror(tA.id)); press(mirror(tB.id));
            await sleep(100);
            assert.ok(win._wvSelTabIDs.has(tA.id) && win._wvSelTabIDs.has(tB.id), "both pins in the selection: " + Array.from(win._wvSelTabIDs));
            assert.ok(mirror(tA.id).classList.contains("wv-multisel") && mirror(tB.id).classList.contains("wv-multisel"), "both mirrors highlighted");
            assert.strictEqual(ZT.selectedID, "zotero-pane", "a Ctrl-press does not switch tabs");
            // Drag A's mirror (B follows) past the last tab: both unpin.
            const last = node(tabOf(e).id); const rL = rect(last); const mA = mirror(tA.id);
            // The press that starts the drag is a PLAIN press on a selected pin:
            // it keeps the selection and (since dev.19) selects that pin, so the
            // dragged pin is the active tab, its reader in front.
            mA.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
            await waitFor(() => ZT.selectedID === tA.id, 5000, "A selected by the press");
            await sleep(300);
            assert.ok(win._wvSelTabIDs.has(tA.id) && win._wvSelTabIDs.has(tB.id), "the plain press on a selected pin keeps the selection");
            const r = await gesture(mA, [Math.round(rect(mA).right + 20), Math.round(rL.right - 4), Math.round(rL.right + 6)], { label: "two pins out",
                probe: () => ({ attr: mA.getAttribute("data-wv-pin-preview"), width: rect(mA).width, followerStowed: mirror(tB.id).classList.contains("wv-drag-stowed"), followerWidth: rect(mirror(tB.id)).width,
                    stack: mA.getAttribute("data-wv-stack"), shadow: win.getComputedStyle(mA).boxShadow,
                    diag: JSON.stringify({ tabDrag: !!wv._wvTabDrag, wasPinned: wv._wvTabDrag && wv._wvTabDrag.wasPinned, gap: win._wvGapResult && { s: win._wvGapResult.slot, f: win._wvGapResult.firstNonPinnedZIdx }, multi: win._wvMultiDragIDs }) }) });
            await sleep(400);   // the multi-drag settle
            // Mid-drag (MJT 2026-10-16: "no preview when I drag 2 pinned tabs"):
            // the dragged icon previews as a tab, the follower's icon is stowed.
            assert.strictEqual(r.probe.attr, "unpin", "unpin preview on the dragged icon of a two-pin drag: " + r.probe.diag);
            assert.isAtLeast(r.probe.width, 100, "grown into a tab: " + r.probe.width);
            assert.ok(r.probe.followerStowed && r.probe.followerWidth < 1, "the follower's icon is stowed during the drag");
            // ...and the held tab carries Firefox's small stack (one card
            // behind it) so the drag shows two tabs travel (MJT 2026-10-16:
            // "I would expect the preview to show that multiple tabs are
            // selected"; a row of both tabs "is not the Firefox style").
            assert.strictEqual(r.probe.stack, "small", "small stack on the held tab of a two-tab drag");
            assert.notStrictEqual(r.probe.shadow, "none", "the stack is drawn (box-shadow): " + r.probe.shadow);
            assert.notOk(mA.hasAttribute("data-wv-stack") && mA.isConnected, "stack cleared after the drop");
            assert.notOk(pinned(a) || pinned(b), "both unpinned");
            assert.deepEqual(order().slice(-2), ["A", "B"], "both at the end, follower behind the dragged tab: order " + order().join(",") + " log " + JSON.stringify(((/** @type {any} */ (Zotero))._wvGroupDnDLog || []).slice(-10)));
        } finally {
            try { win._wvSelTabIDs = new Set(); wv._wvTabMultiSelSync(win); } catch (er) {}
            for (const it of [a, b]) { try { wv._pinnedTabsAdd(it.libraryID, it.key); } catch (er) {} }
            ZT.move(tA.id, 1); ZT.move(tB.id, 2); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
        assert.ok(isMirrored(a) && isMirrored(b));
    });

    it("a two-tab drag into the pinned region pins both (the follower takes the dragged tab's pin state)", async function () {
        // MJT 2026-10-16: "Dragging 2 normal tabs to pinned only pins one".
        const tC = tabOf(c), tD = tabOf(d), tE = tabOf(e);
        // D leaves its group for this: a loose follower, like C.
        wv._wvTabGroupStampLeave(tD, group.id); apply(); await sleep(200);
        win._wvSelTabIDs = new Set([tC.id, tD.id]);
        try { wv._wvTabMultiSelSync(win); } catch (er) {}
        const nC = node(tC.id), mA = mirror(tabOf(a).id);
        const rA = rect(mA);
        try {
            const r = await gesture(nC, [Math.round(rect(nC).left - 20), Math.round(rA.left + 4), Math.round(rA.left + 2)], { label: "two tabs to pin",
                afterStart: () => ({ copies: cont.querySelectorAll('.tab[data-id="' + tC.id + '"]').length, extra: cont.querySelectorAll(":scope > div:not(.tabs-wrapper):not(.pinned-tabs)").length }),
                probe: () => ({ stack: nC.getAttribute("data-wv-stack"), followerStowed: node(tD.id).classList.contains("wv-drag-stowed") }) });
            await sleep(400);   // the multi-drag settle runs 150 ms after dragend
            // The drag-start handlers add nothing to the strip: until dev.28 a
            // multi-drag built a stack of tab CLONES inside #tab-bar-container
            // for the OS drag image (replaced by the 1px canvas a listener
            // later), so the tab-bar observer re-ran every apply over
            // duplicate .tab nodes between the two dragstart listeners -- 42
            // ms of the start delay MJT reported (2026-10-16).
            assert.strictEqual(r.afterStart.copies, 1, "one node for the dragged tab right after dragstart (no clone stack): " + JSON.stringify(r.afterStart));
            assert.strictEqual(r.probe.stack, "small", "small stack on the held tab of a two-tab drag");
            assert.ok(r.probe.followerStowed, "the follower is stowed during the drag");
            assert.ok(pinned(c), "the dragged tab is pinned");
            assert.ok(pinned(d), "the follower is pinned too");
            assert.deepEqual(order().slice(0, 4), ["C", "D", "A", "B"], "both in the pinned cluster, follower right behind");
            assert.ok(isMirrored(c) && isMirrored(d), "both drawn as mirrors");
        } finally {
            try { win._wvSelTabIDs = new Set(); wv._wvTabMultiSelSync(win); } catch (er) {}
            for (const it of [c, d]) { try { wv._pinnedTabsRemove(it.libraryID, it.key); } catch (er) {} }
            apply(); await sleep(200);
            ZT.move(tC.id, 3); ZT.move(tD.id, 4); apply(); await sleep(200);
            wv._wvTabGroupStampJoin(tD, group.id); wv._tabGroupAddKey(group.id, { libraryID: d.libraryID, itemKey: d.key }); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
        assert.strictEqual(wv._wvTabGroupStamp(tD), group.id, "D back in its group");
        void tE;
    });

    it("a pin dropped right after a group's chip joins the group as its pinned first member", async function () {
        const tB = tabOf(b), mB = mirror(tB.id);
        const chip = doc.getElementById("wv-tgchip-" + group.id);
        const rC = rect(chip);
        await gesture(mB, [Math.round(rect(mB).right + 20), Math.round(rC.right + 2), Math.round(rC.right + 3)], { label: "pin joins group" });
        try {
            assert.strictEqual(wv._wvTabGroupStamp(tB), group.id, "B stamped into the group");
            assert.ok(pinned(b), "B still pinned");
            assert.deepEqual(order(), ["A", "C", "B", "D", "E"], "B leads the group");
            assert.ok(!isMirrored(b) && rect(node(tB.id)).width > 1, "a grouped pin is a real tab, not a mirror");
        } finally {
            wv._wvTabGroupStampLeave(tB, group.id); apply(); await sleep(200);
            ZT.move(tB.id, 2); apply(); await sleep(300);
        }
        assert.deepEqual(order(), ["A", "B", "C", "D", "E"]);
        await settle("after leave");
    });
});
