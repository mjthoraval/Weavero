/* global describe, it, before, after, expect, Zotero, wvT */

// Issue #35, reopened 2026-11-19 (https://github.com/mjthoraval/Weavero/issues/35#issuecomment-7018713863):
// on macOS, after Cmd+Q and a relaunch, a tab group's chip was gone while its tabs still
// offered "Remove from Tab Group". Not reproduced with a plain quit on Windows (10.0.8,
// 11.0-beta.4), but the same symptom appears whenever the restored tabs carry an OLDER
// group id than the one in Weavero's store (Zotero's session.json alone is enough;
// D:/tmp/issue35/stale_session_only.py): the definition is still there, the tabs carry an
// id that names no live group, and every path that gives a group its tabs back skipped
// them as "already stamped". A stamp naming no live group now counts as none
// (tab-groups.ts: the boot-stamp pass and the claim pass; tabs.ts: the anchor restore;
// the "Remove from Tab Group" menu).

describe("Weavero — a tab group takes back tabs stamped with a dead group id (issue #35)", function () {
    this.timeout(60000);
    const ORPHAN = "wvg-orphan-spec";
    let win = null, p = null, noteA = null, noteB = null, group = null, prevGroups, prevTW;

    const tabFor = id => win.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === id) || null;
    const chip = gid => win.document.getElementById("wv-tgchip-" + gid);
    const keyFor = item => ({ libraryID: item.libraryID, itemKey: item.key });
    async function openNoteTab(id) {
        await win.ZoteroPane.openNote(id, { openInWindow: false });
        return await wvT.waitFor(() => tabFor(id), 15000, 100);
    }
    /** Both tabs carry the dead id, applied with neither healing path armed (the restore
     *  guard up holds the claim pass; no quit-time record): the group is drawn nowhere,
     *  as the reporter saw it. The caller sets the state the case is about afterwards. */
    function orphanBoth() {
        const guard = p._wvTabGroupRestoreGuard, bm0 = p._wvBootStampMap;
        p._wvTabGroupRestoreGuard = true; p._wvBootStampMap = null;
        try {
            for (const it of [noteA, noteB]) p._wvTabGroupSetStamp(tabFor(it.id), ORPHAN);
            p._applyTabGroups(win);
        }
        finally { p._wvTabGroupRestoreGuard = guard; p._wvBootStampMap = bm0; }
        expect(chip(group.id), "fixture: no chip while both tabs carry the dead id").to.not.exist;
    }

    before(async function () {
        win = Zotero.getMainWindow();
        p = wvT.plugin();
        for (const m of ["_tabGroupCreate", "_tabGroupAddKey", "_applyTabGroups", "_wvTabGroupSetStamp", "_wvTabGroupStamp", "_wvTabGroupLiveStamp"]) wvT.method(m);
        prevGroups = Zotero.Prefs.get("weavero.enableTabGroups");
        prevTW = Zotero.Prefs.get("weavero.enableTabsAndWindows");
        Zotero.Prefs.set("weavero.enableTabGroups", true);
        Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
        noteA = new Zotero.Item("note"); noteA.setNote("<p>wv orphan stamp A</p>"); await noteA.saveTx();
        noteB = new Zotero.Item("note"); noteB.setNote("<p>wv orphan stamp B</p>"); await noteB.saveTx();
        expect(await openNoteTab(noteA.id), "fixture: note tab A").to.exist;
        expect(await openNoteTab(noteB.id), "fixture: note tab B").to.exist;
        group = p._tabGroupCreate("WV Orphan Grp", "blue");
        p._tabGroupAddKey(group.id, keyFor(noteA));
        p._tabGroupAddKey(group.id, keyFor(noteB));
    });

    after(async function () {
        try {
            for (const it of [noteA, noteB]) { const t = it && tabFor(it.id); if (t) p._wvTabGroupSetStamp(t, null); }
            if (group) p._tabGroupsSet(p._tabGroupsGet().filter(g => g.id !== group.id));
        } catch (e) {}
        for (const it of [noteA, noteB]) { const t = it && tabFor(it.id); if (t) { try { win.Zotero_Tabs.close(t.id); } catch (e) {} } }
        await wvT.sleep(300);
        for (const it of [noteA, noteB]) { if (it) { try { await it.eraseTx(); } catch (e) {} } }
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        if (prevGroups === undefined) Zotero.Prefs.clear("weavero.enableTabGroups"); else Zotero.Prefs.set("weavero.enableTabGroups", prevGroups);
        if (prevTW === undefined) Zotero.Prefs.clear("weavero.enableTabsAndWindows"); else Zotero.Prefs.set("weavero.enableTabsAndWindows", prevTW);
    });

    it("after the restore: the group's member tabs are taken back from the dead id, and its chip is drawn", async function () {
        const guard = p._wvTabGroupRestoreGuard;
        p._wvTabGroupRestoreGuard = false;
        try {
            orphanBoth();
            expect(p._wvTabGroupLiveStamp(tabFor(noteA.id)), "a dead id is no live membership").to.equal(null);
            p._applyTabGroups(win);
            expect(p._wvTabGroupStamp(tabFor(noteA.id)), "tab A back in its group").to.equal(group.id);
            expect(p._wvTabGroupStamp(tabFor(noteB.id)), "tab B back in its group").to.equal(group.id);
            expect(await wvT.waitFor(() => chip(group.id), 3000, 50), "the group's chip drawn").to.exist;
        }
        finally { p._wvTabGroupRestoreGuard = guard; }
    });

    it("during the restore: the quit-time record re-stamps tabs that arrived with a dead id", async function () {
        const guard = p._wvTabGroupRestoreGuard, bm0 = p._wvBootStampMap, at0 = p._wvBootStampMapAt;
        // The claim pass waits for the guard to lift; the boot-stamp map is what gives
        // tabs their group while Zotero restores them.
        orphanBoth();
        p._wvTabGroupRestoreGuard = true;
        p._wvBootStampMap = new Map([[noteA.id, { grp: group.id, n: 1 }], [noteB.id, { grp: group.id, n: 1 }]]);
        p._wvBootStampMapAt = Date.now();
        try {
            p._applyTabGroups(win);
            expect(p._wvTabGroupStamp(tabFor(noteA.id)), "tab A re-stamped from the quit-time record").to.equal(group.id);
            expect(p._wvTabGroupStamp(tabFor(noteB.id)), "tab B re-stamped from the quit-time record").to.equal(group.id);
        }
        finally {
            p._wvTabGroupRestoreGuard = guard;
            p._wvBootStampMap = bm0; p._wvBootStampMapAt = at0;
            p._applyTabGroups(win);
        }
    });
});
