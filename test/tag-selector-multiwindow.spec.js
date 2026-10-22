/* global describe, it, before, assert, Zotero, Components */

// Zotero bug met through Weavero's extra main windows (2026-10-17, register
// #32 in the maintainer's upstream-bugs register): zoteroPane.xhtml loads
// containers/tagSelectorContainer.js into EVERY main window, and the script
// assigns its class to the shared `Zotero.TagSelector` -- the last window
// opened wins. The class renders through ITS window's React, scheduled on
// that window's timers, so once that window closed, `initTagSelector()` in
// the first window (View -> Layout re-show, the selector handle, a drag open)
// awaited a render that never ran: the Tag Selector never came back. Found as
// selector-handle.spec.js's 120 s hang deep in the full suite (an earlier
// spec had opened and closed a second main window).

describe("Weavero — the Tag Selector survives a second main window closing", function () {
    this.timeout(90000);
    let wv, win, ZP, doc;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvOpenEmptyMainWindow");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        doc = win.document;
    });

    // Resolves to false after `ms` on an nsITimer (no window state can
    // suspend it), so a render that never runs fails the test instead of
    // hanging it.
    const within = (p, ms) => new Promise((resolve) => {
        const t = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
        t.initWithCallback(() => resolve(false), ms, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
        Promise.resolve(p).then(() => { t.cancel(); resolve(true); }, () => { t.cancel(); resolve(false); });
    });

    it("after a second main window opens and closes, the first window's Tag Selector still rebuilds", async function () {
        const owner = () => Components.utils.getGlobalForObject(/** @type {any} */ (Zotero).TagSelector);
        assert.isTrue(owner() === win, "the global class is the first window's going in");

        const existing = new Set(Zotero.getMainWindows());
        wv._wvOpenEmptyMainWindow();
        let w2 = null;
        for (let i = 0; i < 100 && !w2; i++) { await wvT.sleep(150); w2 = Zotero.getMainWindows().find(w => !existing.has(w)); }
        assert.isOk(w2, "second window opened");
        await wvT.waitFor(() => !!(w2.ZoteroPane && w2.ZoteroPane.itemsView), 20000);
        // Zotero's own script: the newest window's class is the global one.
        assert.isTrue(owner() === w2, "the second window's class took the global");
        try { win.focus(); } catch (e) {}
        w2.close();
        for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await wvT.sleep(100);
        await wvT.sleep(300);

        // Zotero's own rebuild path (View -> Layout): hide, then show.
        const ct = doc.getElementById("zotero-tag-selector-container");
        const wasCollapsed = ct.hasAttribute("collapsed");
        try {
            if (!wasCollapsed) await ZP.toggleTagSelector();
            assert.isTrue(ZP.tagSelector === null, "hidden: Zotero took the selector down");
            assert.isTrue(await within(ZP.toggleTagSelector(), 10000), "re-show resolves (it hung on the closed window's React)");
            assert.isTrue(!!ZP.tagSelector, "a selector object again");
            assert.isTrue(owner() === win, "the global is the first window's class again");
        }
        finally {
            try { if (ct.hasAttribute("collapsed") !== wasCollapsed) await within(ZP.toggleTagSelector(), 10000); } catch (e) {}
        }
    });
});
