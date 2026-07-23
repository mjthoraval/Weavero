/* global describe, it, before, after, beforeEach, afterEach, expect, Zotero */

// Regression suite for the tab-GROUP chip renderer's resilience to a leaked
// "drag in flight" flag. Drives the REAL app in the scaffold's temp-profile
// Zotero (same approach as tearoff.spec.js); helpers are self-contained
// because the scaffold loads spec files in unspecified order.
//
// Incident (2026-07-23): a LIVE tab group's chip silently STOPPED rendering.
// The group data was fully intact (pref + on-disk backup + live store, all
// members open) -- only the visual chip was gone. Root cause: a cancelled
// drag-gesture on the library ("zotero-pane") tab set win._wvTabGroupDragTabID
// and never cleared it (dragend never fired), so _applyTabGroups kept hitting
// its "a native drag is in flight -- hands off" guard and never redrew the
// chip. No test covered it. These do, from both ends of the bug:
//
//   * DRAGSTART on the zotero-pane tab must NOT arm the drag flag (root cause,
//     fix in _wvTabGroupDnDDragStart).
//   * _applyTabGroups must still render a live group's chip when a STALE drag
//     flag is present (renderer self-heal), WHILE still honouring a genuinely
//     FRESH drag (hands-off preserved) -- fix in _applyTabGroups.
//
// See docs/resilience-testing.md and src/modules/tab-groups.ts.

describe("Weavero — tab-group chip resilience", function () {
    this.timeout(60000);

    let win = null;        // main window
    let p = null;          // live plugin
    let noteA = null;      // group member items (real note tabs)
    let noteB = null;
    let group = null;      // the live test group
    let prevEnableGroups;  // saved prefs to restore
    let prevEnableTW;

    // ---- helpers ---------------------------------------------------------

    const sleep = ms => new Promise(r => win.setTimeout(r, ms));

    async function waitFor(cb, timeout = 15000, interval = 100) {
        const start = Date.now();
        for (;;) {
            let v = null;
            try { v = cb(); } catch (e) {}
            if (v) return v;
            if (Date.now() - start > timeout) return null;
            await sleep(interval);
        }
    }

    const tabForItem = id =>
        win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === id) || null;
    const chipEl = gid => win.document.getElementById("wv-tgchip-" + gid);
    const keyFor = item => ({ libraryID: item.libraryID, itemKey: item.key });

    // Open an item as a note tab (the ONLY supported path -- a bare
    // Zotero_Tabs.add({type:"note"}) makes an editor-less shell) and wait
    // until the tab is present.
    async function openNoteTab(noteID) {
        await win.ZoteroPane.openNote(noteID, { openInWindow: false });
        return await waitFor(() => tabForItem(noteID));
    }

    // ---- fixtures --------------------------------------------------------

    before(async function () {
        win = Zotero.getMainWindow();
        p = await waitFor(() => Zotero.Weavero && Zotero.Weavero.plugin, 20000);
        if (!p
            || typeof p._tabGroupCreate !== "function"
            || typeof p._applyTabGroups !== "function"
            || typeof p._wvTabGroupSetStamp !== "function") {
            this.skip();
            return;
        }
        // Force both feature toggles ON for the run (they default ON, but a
        // prior spec / profile could have flipped them); restore in after().
        prevEnableGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevEnableTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);

        // Two real note tabs, stamped into one LIVE group.
        noteA = new Zotero.Item("note"); noteA.setNote("<p>wv group test A</p>"); await noteA.saveTx();
        noteB = new Zotero.Item("note"); noteB.setNote("<p>wv group test B</p>"); await noteB.saveTx();
        const tA = await openNoteTab(noteA.id);
        const tB = await openNoteTab(noteB.id);
        expect(tA, "note tab A did not open").to.exist;
        expect(tB, "note tab B did not open").to.exist;

        group = p._tabGroupCreate("WV Test Grp", "red");
        p._tabGroupAddKey(group.id, keyFor(noteA));
        p._tabGroupAddKey(group.id, keyFor(noteB));
        p._wvTabGroupSetStamp(tA, group.id);
        p._wvTabGroupSetStamp(tB, group.id);
    });

    // Every test starts from a clean, un-dragging baseline with the chip drawn.
    beforeEach(function () {
        if (!group) return;
        win._wvTabGroupDragTabID = null;
        win._wvMultiDragIDs = null;
        win._wvGroupCreateTarget = null;
        delete win._wvTabGroupDragStartAt;
        p._applyTabGroups(win);
    });

    // Sweep any drag artifacts a test left behind.
    afterEach(function () {
        if (!win) return;
        win._wvTabGroupDragTabID = null;
        win._wvMultiDragIDs = null;
        win._wvGroupCreateTarget = null;
        try { p._wvClearGap(win); } catch (e) {}
        const gh = win.document.getElementById("wv-tg-drop-ghost");
        if (gh) gh.remove();
    });

    after(async function () {
        try {
            if (group) {
                for (const it of [noteA, noteB]) {
                    const t = it && tabForItem(it.id);
                    if (t) { try { p._wvTabGroupSetStamp(t, null); } catch (e) {} }
                }
                p._tabGroupsSet(p._tabGroupsGet().filter(g => g.id !== group.id));
            }
        } catch (e) {}
        for (const it of [noteA, noteB]) {
            const t = it && tabForItem(it.id);
            if (t) { try { win.Zotero_Tabs.close(t.id); } catch (e) {} }
        }
        await sleep(200);
        for (const it of [noteA, noteB]) {
            if (it) { try { await it.eraseTx(); } catch (e) {} }
        }
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        try {
            if (prevEnableGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups");
            else Zotero.Prefs.set("weavero.enableTabGroups", prevEnableGroups);
            if (prevEnableTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows");
            else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevEnableTW);
        } catch (e) {}
    });

    // ---- tests -----------------------------------------------------------

    it("renders a chip for a live group whose members are open", function () {
        if (!group) this.skip();
        expect(chipEl(group.id), "baseline group chip missing").to.exist;
    });

    // THE incident, reproduced exactly: a stuck flag with no start timestamp
    // (pre-fix leaks carried none) must NOT keep the renderer frozen.
    it("still renders the chip when a leaked 'drag in flight' flag is stuck (self-heal)", function () {
        if (!group) this.skip();
        const c0 = chipEl(group.id);
        if (c0) c0.remove();
        win._wvTabGroupDragTabID = "zotero-pane";   // the exact value that leaked
        delete win._wvTabGroupDragStartAt;          // a leaked flag had no timestamp
        p._applyTabGroups(win);
        expect(chipEl(group.id), "renderer stayed frozen by a stale drag flag").to.exist;
        expect(win._wvTabGroupDragTabID, "stale drag flag was not cleared").to.equal(null);
    });

    // The self-heal must not be over-eager: a genuine in-progress drag (fresh
    // timestamp) still suppresses re-chipping, and the chip returns once it ends.
    it("honours a genuine in-progress drag, then restores the chip when it ends", function () {
        if (!group) this.skip();
        const c0 = chipEl(group.id);
        if (c0) c0.remove();
        const tA = tabForItem(noteA.id);
        win._wvTabGroupDragTabID = tA.id;
        win._wvTabGroupDragStartAt = Date.now();     // just started -> hands off
        p._applyTabGroups(win);
        expect(chipEl(group.id), "renderer re-chipped during a live drag").to.not.exist;
        // Drag ends -> next apply redraws.
        win._wvTabGroupDragTabID = null;
        p._applyTabGroups(win);
        expect(chipEl(group.id), "chip not restored after the drag ended").to.exist;
    });

    // Root-cause fix: the library tab is not groupable, and a cancelled gesture
    // on it can skip dragend -- so dragstart must never arm the drag flag for it.
    it("never arms drag-state for the library ('zotero-pane') tab", function () {
        if (!group || typeof p._wvTabGroupDnDDragStart !== "function") this.skip();
        win._wvTabGroupDragTabID = null;
        const zp = win.document.querySelector('#tab-bar-container .tab[data-id="zotero-pane"]');
        expect(zp, "zotero-pane tab node not found").to.exist;
        const ev = { target: zp, clientX: 0, dataTransfer: { setData() {}, setDragImage() {} } };
        p._wvTabGroupDnDDragStart(win, ev);
        expect(win._wvTabGroupDragTabID, "a library-tab drag armed the group drag flag").to.equal(null);
    });

    // Vacuity guard for the test above: a real member tab MUST arm the flag
    // (and record a start timestamp for the self-heal), else the previous test
    // would pass trivially even if arming were broken for everything.
    it("does arm drag-state (with a timestamp) for a real member tab", function () {
        if (!group || typeof p._wvTabGroupDnDDragStart !== "function") this.skip();
        win._wvTabGroupDragTabID = null;
        const tA = tabForItem(noteA.id);
        const node = win.document.querySelector('#tab-bar-container .tab[data-id="' + tA.id + '"]');
        expect(node, "member tab node not found").to.exist;
        const ev = { target: node, clientX: 5, dataTransfer: { setData() {}, setDragImage() {} } };
        p._wvTabGroupDnDDragStart(win, ev);
        expect(win._wvTabGroupDragTabID, "member-tab drag failed to arm the flag").to.equal(tA.id);
        expect(win._wvTabGroupDragStartAt, "drag start timestamp not recorded").to.be.a("number");
    });
});
