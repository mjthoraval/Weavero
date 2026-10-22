/* global describe, it, before, after, assert, Zotero */

// Tab-group operations over the two tab surfaces (tab-groups.ts
// WV_SURFACE_MAIN / WV_SURFACE_READER): move a group to a slot, a new group
// from tabs, add a tab to a group -- one implementation each, driven on fake
// windows (a Zotero_Tabs stub with Zotero's move semantics, a reader deck),
// the group store and the surfaces' side effects stubbed. Survey 2026-10-06
// §4 main / reader twins, 2026-10-21. One throw-away item (for the item key).

describe("Weavero — tab-group operations: one implementation per pair over the two tab surfaces", () => {
    let wv, item;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        for (const m of ["_wvTabGroupMoveGroupToOn", "_wvTabGroupNewFromTabsOn", "_wvTabGroupAddTabOn",
            "_wvTabGroupMoveGroupTo", "_wvTabGroupReaderMoveGroupTo", "_wvGroupTabsIntoNewGroup", "_wvTabGroupNewFromDeckTabs", "_wvTabGroupAddTab", "_wvTabGroupAddDeckTab"]) assert.isFunction(wv[m], m);
        item = new Zotero.Item("journalArticle");
        item.setField("title", "WV tab-group surfaces");
        await item.saveTx();
    });
    after(async function () { try { if (item) await item.eraseTx(); } catch (e) {} });

    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }
    /** Fake strip nodes 100px wide in order, each with its id attribute. */
    const nodes = (ids, attr) => ids.map((id, i) => ({ getAttribute: (a) => (a === attr ? id : null), getBoundingClientRect: () => ({ left: i * 100, width: 100 }) }));
    /** A main window: Zotero_Tabs with Zotero's move semantics (tabs.js: the target index steps back when moving right). */
    function mainRig(order, stamps) {
        const _tabs = order.map(id => ({ id, data: { itemID: item.id, wvGroupId: stamps[id] } }));
        const closed = [];
        const Z = { _tabs, closed, move(id, newIndex) { const ti = _tabs.findIndex(t => t.id === id); if (ti < 0) return; if (newIndex > ti) newIndex--; const [t] = _tabs.splice(ti, 1); _tabs.splice(newIndex, 0, t); }, close(id) { closed.push(id); } };
        const timers = [];
        const win = { Zotero_Tabs: Z, document: { querySelectorAll: () => nodes(_tabs.map(t => t.id), "data-id"), getElementById: (id) => ({ id }) }, setTimeout: (fn) => { timers.push(fn); return 1; } };
        return { win, Z, timers, ids: () => _tabs.map(t => t.id) };
    }
    function readerRig(order, stamps) {
        const tabs = order.map(id => ({ id, itemID: item.id, wvGroupId: stamps[id] }));
        const st = { tabs, activeId: order[0] };
        const timers = [];
        const win = { _wvWT: st, document: { querySelectorAll: () => nodes(st.tabs.map(t => String(t.id)), "data-wv-tab-id"), getElementById: (id) => ({ id }) }, setTimeout: (fn) => { timers.push(fn); return 1; } };
        return { win, st, timers, ids: () => st.tabs.map(t => t.id) };
    }
    function store(groups) {
        const calls = [];
        const stubs = {
            _tabGroupsGet: () => groups,
            _tabGroupsSet: (g) => { groups = g; },
            _tabGroupCreate: (name, color) => { const g = { id: "gN", name, color, members: [] }; groups.push(g); return g; },
            _wvTabGroupApplyEverywhere: () => calls.push("apply"),
            _wvTabGroupHomeWin: () => null,
            _pinnedTabsHas: () => false,
            _wvShowTabGroupEditor: (w, gid, chip) => calls.push("editor:" + gid + ":" + chip.id),
            _wvWTRenderStrip: () => calls.push("render"),
            _wvWTPersistSaveDebounced: () => calls.push("persist"),
            _wvWTMultiSelClear: () => calls.push("clearSel"),
            _wvWTCloseTab: (w, id) => calls.push("closeDeck:" + id),
            _wvTabGroupDeckPlaceNearGroup: (w, itemID, gid) => calls.push("placeDeck:" + gid),
            _wvTabGroupSendTabToWin: (w, id, home, gid) => calls.push("send:" + id + ":" + gid),
            _wvTabGroupSendDeckTabToWin: (w, tab, home, gid) => calls.push("sendDeck:" + tab.id + ":" + gid),
        };
        return { stubs, calls, groups: () => groups };
    }

    it("move a group to the slot under x: the main bar settles through Zotero_Tabs.move after the library tab and outside other groups; the reader deck is reordered, re-rendered and persisted", () => {
        const s = store([{ id: "g1", members: [] }, { id: "g2", members: [] }]);
        withStubs(s.stubs, () => {
            const m = mainRig(["zotero-pane", "a", "b", "c", "d", "e"], { b: "g1", c: "g1", d: "g2", e: "g2" });
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "g1", 120), 1, "x in the first half of 'a': slot 1");
            assert.deepEqual(m.ids(), ["zotero-pane", "b", "c", "a", "d", "e"], "the member block moved before 'a', the library tab stays first");
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "g1", 20), 1, "x before the library tab: clamped after it");
            assert.deepEqual(m.ids(), ["zotero-pane", "b", "c", "a", "d", "e"]);
            // The current order: zotero-pane(0-100) b c a(300-400) d(400-500) e(500-600); x=440 is left of 'd''s midpoint (450, a strict test) -> slot of 'd' among non-members [zotero-pane, a, d, e] = 2 -> between a and d: fine (not inside g2).
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "g1", 440), 2);
            assert.deepEqual(m.ids(), ["zotero-pane", "a", "b", "c", "d", "e"]);
            // Order zotero-pane a b c d(400-500) e(500-600); x=560 (past 'e''s midpoint): default = end (4), no snap needed.
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "g1", 560), 4, "past every midpoint: the end");
            assert.deepEqual(m.ids(), ["zotero-pane", "a", "d", "e", "b", "c"], "after g2's run");
            // Order zotero-pane a d(200-300) e(300-400) b c; x=340 is left of 'e''s midpoint -> slot 3, inside g2's run -> snapped to the end of it (4).
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "g1", 340), 4, "inside another group's run: pushed to its end");
            assert.deepEqual(m.ids(), ["zotero-pane", "a", "d", "e", "b", "c"]);
            assert.strictEqual(wv._wvTabGroupMoveGroupTo(m.win, "gX", 100), -1, "an unknown group");
            assert.strictEqual(wv._wvTabGroupMoveGroupTo({}, "g1", 100), -1, "no tab bar");
            assert.include(s.calls, "apply");
            s.calls.length = 0;
            const r = readerRig([1, 2, 3, 4], { 2: "g1", 3: "g1" });
            assert.strictEqual(wv._wvTabGroupReaderMoveGroupTo(r.win, "g1", 20), 0, "x in the first half of the first deck tab: slot 0 (no library tab on a deck)");
            assert.deepEqual(r.ids(), [2, 3, 1, 4]);
            assert.deepEqual(s.calls, ["render", "persist", "apply"], "the deck re-renders and persists, then the apply");
            // Order 2 3 1(200-300) 4(300-400); x=380 = the second half of '4' -> the end (2).
            assert.strictEqual(wv._wvTabGroupReaderMoveGroupTo(r.win, "g1", 380), 2);
            assert.deepEqual(r.ids(), [1, 4, 2, 3]);
        });
    });

    it("a new group from tabs: created with the next colour, the tabs joined (the library tab never), the editor opened on its chip after a tick; the reader deck also clusters the members at the first one's slot and drops the strip selection", () => {
        const s = store([]);
        withStubs(s.stubs, () => {
            const m = mainRig(["zotero-pane", "a", "b", "c"], {});
            wv._wvGroupTabsIntoNewGroup(m.win, ["zotero-pane", "a", "c"]);
            const g = s.groups().find(x => x.id === "gN");
            assert.isOk(g, "a group was created");
            assert.strictEqual(m.Z._tabs[1].data.wvGroupId, "gN"); assert.strictEqual(m.Z._tabs[3].data.wvGroupId, "gN");
            assert.isUndefined(m.Z._tabs[0].data.wvGroupId, "the library tab never joins");
            assert.isUndefined(m.Z._tabs[2].data.wvGroupId);
            assert.deepEqual(m.ids(), ["zotero-pane", "a", "b", "c"], "the main bar is not reordered here (the apply / stabilize pass owns contiguity)");
            assert.strictEqual(g.members.length, 1, "the item-key shadow holds the one item once");
            assert.deepEqual(s.calls, ["apply"]);
            assert.strictEqual(m.timers.length, 1); m.timers[0]();
            assert.deepEqual(s.calls, ["apply", "editor:gN:wv-tgchip-gN"], "the editor opens on the chip");
            s.calls.length = 0; s.groups().length = 0;
            const r = readerRig([1, 2, 3, 4], {});
            wv._wvTabGroupNewFromDeckTabs(r.win, [4, 2]);
            assert.strictEqual(r.st.tabs.find(t => t.id === 4).wvGroupId, "gN"); assert.strictEqual(r.st.tabs.find(t => t.id === 2).wvGroupId, "gN");
            assert.deepEqual(r.ids(), [1, 3, 4, 2], "members clustered, in the given order, at the first given member's slot (clamped to the rest's length)");
            assert.deepEqual(s.calls, ["clearSel", "render", "persist", "apply"]);
            r.timers[0]();
            assert.strictEqual(s.calls[4], "editor:gN:wv-tgchip-gN");
            wv._wvTabGroupNewFromDeckTabs(r.win, []);
            assert.strictEqual(s.calls.length, 5, "no tabs: nothing");
        });
    });

    it("add a tab to a group: a saved group files the key and closes the tab; a group living elsewhere sends the tab there; otherwise the tab is stamped, shadowed and placed after the group's last member (the main bar through move, the deck through its placer)", () => {
        const s = store([{ id: "g1", members: [] }, { id: "gS", members: [], saved: true }]);
        withStubs(s.stubs, () => {
            const m = mainRig(["zotero-pane", "a", "b", "c", "d"], { b: "g1", c: "g1" });
            wv._wvTabGroupAddTab(m.win, "a", "g1");
            assert.strictEqual(m.Z._tabs.find(t => t.id === "a").data.wvGroupId, "g1", "stamped");
            assert.strictEqual(s.groups()[0].members.length, 1, "the item key shadowed");
            assert.deepEqual(m.ids(), ["zotero-pane", "b", "c", "a", "d"], "placed right after the group's last member");
            assert.deepEqual(s.calls, ["apply"]);
            wv._wvTabGroupAddTab(m.win, "d", "g1", 1);
            assert.deepEqual(m.ids(), ["zotero-pane", "d", "b", "c", "a"], "a desired index before the run is clamped to its first member (the run stays one block)");
            wv._wvTabGroupAddTab(m.win, "d", "g1", 3);
            assert.deepEqual(m.ids(), ["zotero-pane", "b", "d", "c", "a"], "a desired index inside the run lands there");
            wv._wvTabGroupAddTab(m.win, "a", "gS");
            assert.deepEqual(m.Z.closed, ["a"], "a saved group: the tab closes");
            assert.strictEqual(s.groups()[1].members.length, 1, "and its key is filed");
            s.calls.length = 0;
            const other = {};
            withStubs({ _wvTabGroupHomeWin: () => other }, () => {
                wv._wvTabGroupAddTab(m.win, "d", "g1");
                assert.deepEqual(s.calls, ["send:d:g1"], "the group lives elsewhere: the tab is sent there");
            });
            s.calls.length = 0;
            const r = readerRig([1, 2, 3], { 2: "g1" });
            wv._wvTabGroupAddDeckTab(r.win, 3, "g1");
            assert.strictEqual(r.st.tabs[2].wvGroupId, "g1");
            assert.deepEqual(s.calls, ["placeDeck:g1", "apply"], "the deck's placer, then the apply");
            s.calls.length = 0;
            wv._wvTabGroupAddDeckTab(r.win, 1, "gS");
            assert.deepEqual(s.calls, ["closeDeck:1", "apply"], "a saved group closes the deck tab");
            s.calls.length = 0;
            withStubs({ _wvTabGroupHomeWin: () => other }, () => {
                wv._wvTabGroupAddDeckTab(r.win, 1, "g1");
                assert.deepEqual(s.calls, ["sendDeck:1:g1"]);
            });
        });
    });

    it("the six surface methods are wrappers and the shared ones know no surface", () => {
        for (const m of ["_wvTabGroupMoveGroupTo", "_wvGroupTabsIntoNewGroup", "_wvTabGroupAddTab"]) assert.include(String(wv[m]), "WV_SURFACE_MAIN", m);
        for (const m of ["_wvTabGroupReaderMoveGroupTo", "_wvTabGroupNewFromDeckTabs", "_wvTabGroupAddDeckTab"]) assert.include(String(wv[m]), "WV_SURFACE_READER", m);
        for (const m of ["_wvTabGroupMoveGroupToOn", "_wvTabGroupNewFromTabsOn", "_wvTabGroupAddTabOn"]) {
            const src = String(wv[m]);
            for (const leak of ["Zotero_Tabs", "_wvWT", "zotero-pane", "data-id", "_wvWTRenderStrip", "_tabPinKey"]) assert.notInclude(src, leak, m + " knows no surface detail: " + leak);
        }
    });
});
