/* global describe, it, before, after, assert, Zotero, wvT */

// A pinned tab in a main window comes back pinned when its session comes back.
// Transition test 2026-11-07: a session recorded every main-window tab unpinned, and
// the switch closed the pinned tab first, which dropped its pin -- lost on 11.0-beta.3
// and on zotero#6035 alike. Runs on every Zotero.

describe("Weavero — a session keeps its pinned tabs", () => {
    let wv, win, a, b, doc0, active0, pins0;
    const tabOf = (w, id) => w.Zotero_Tabs._tabs.find(t => t.data && t.data.itemID === id);
    // Where Zotero pins any tab (zotero b08cc35a50) the pin is the tab's own, Weavero's
    // store only carries a pin to Zotero (tabs.ts _wvApplyZoteroPins).
    const zpins = () => !!(wvT.lib().wvZoteroPinsTabs && wvT.lib().wvZoteroPinsTabs());
    const pinned = id => {
        if (zpins()) return Zotero.getMainWindows().some(w => { const t = tabOf(w, id); return !!(t && t.pinned); });
        return wv._pinnedTabsGet().some(p => {
            const it = Zotero.Items.get(id);
            return it && p.libraryID === it.libraryID && p.itemKey === it.key;
        });
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || !wv._wvTabSessionSwitch || !wv._pinTabByCommand) wvT.absent("_wvTabSessionSwitch / _pinTabByCommand");
        this.timeout(60000);
        win = Zotero.getMainWindows()[0];
        await wv._wvTabSessionInit();
        doc0 = JSON.stringify(wv._wvTabSessionDoc);
        active0 = wv._wvTabSessionGetActiveId();
        pins0 = JSON.stringify(wv._pinnedTabsGet());
        a = await wvT.createTestPDFItem("wv-session-pin-a");
        b = await wvT.createTestPDFItem("wv-session-pin-b");
    });

    after(async function () {
        this.timeout(30000);
        for (const w of Zotero.getMainWindows().slice(1)) { try { w.close(); } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 10000);
        const m = Zotero.getMainWindows()[0], T = m.Zotero_Tabs;
        for (const id of [a && a.id, b && b.id]) { const t = id && tabOf(m, id); if (t) T.close(t.id); }
        wv._pinnedTabsSet(JSON.parse(pins0));
        wv._wvTabSessionDoc = JSON.parse(doc0);
        wv._wvTabSessionDoc.activeSessionId = active0;
        await wv._wvTabSessionPersist();
        // Out of the protection window the switch opened, so a later apply prunes as usual.
        wv._wvSessionPinsUntil = 0;
        for (const it of [a, b]) { if (it) await wvT.erase(it); }
    });

    // Transition test 2026-11-07: a window whose library tab was in front came back with
    // no tab selected at all, blank, on zotero#6035: a record lists documents only.
    it("a window restored from a session always has a selected tab", function () {
        const recs = [{ type: "reader", title: "A", libraryID: a.libraryID, itemKey: a.key, selected: false }];
        const tabs = wv._wvTabSessionToGetStateTabs(recs, "My Library");
        assert.isTrue(!!tabs[0].selected, "the library tab, when no document was in front");
        const tabs2 = wv._wvTabSessionToGetStateTabs([Object.assign({}, recs[0], { selected: true })], "My Library");
        assert.notOk(tabs2[0].selected, "not when a document was");
        assert.isTrue(!!tabs2[1].selected);
        const reader = wv._wvTabSessionStoredWindow({ kind: "reader", tabs: recs }, false);
        assert.isTrue(reader.tabs.length === 1 && !!reader.tabs[0].selected, "a window with no library tab: its first document");
    });

    it("a switch away and back brings the pin back, and only that one", async function () {
        this.timeout(90000);
        await Zotero.Reader.open(a.id, null, /** @type {any} */ ({ openInBackground: false }));
        await Zotero.Reader.open(b.id, null, /** @type {any} */ ({ openInBackground: false }));
        await wvT.waitFor(() => tabOf(win, a.id) && tabOf(win, b.id), 10000);
        wv._pinTabByCommand(win, a);
        assert.isOk(await wvT.waitFor(() => pinned(a.id) || null, 5000), "pinned before");

        const s = await wv._wvTabSessionSaveAs("wv-session-pins");
        const id = (s && s.id) || wv._wvTabSessionList().find(x => x.name === "wv-session-pins").id;
        const rec = wv._wvTabSessionList().find(x => x.id === id);
        const main = rec.windows.find(w => w.kind === "main");
        const recA = main.tabs.find(t => t.itemKey === a.key), recB = main.tabs.find(t => t.itemKey === b.key);
        assert.isTrue(!!(recA && recA.pinned), "the session records the pin");
        assert.notOk(recB && recB.pinned, "and only that one");

        await wv._wvTabSessionNewEmpty(win);
        assert.isFalse(pinned(a.id), "the empty session has no pin");

        await wv._wvTabSessionSwitch(id);
        const w = Zotero.getMainWindows().find(x => tabOf(x, a.id));
        assert.isOk(w, "the tab is back");
        assert.isOk(await wvT.waitFor(() => pinned(a.id) || null, 8000), "and pinned");
        assert.isFalse(pinned(b.id), "the other is not");
        const t = tabOf(w, a.id);
        assert.isOk(await wvT.waitFor(() => (w._wvPinnedTabIDs && w._wvPinnedTabIDs.has(t.id)) || null, 8000), "drawn as a pin");
    });
});
