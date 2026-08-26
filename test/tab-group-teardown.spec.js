/* global describe, it, before, after, assert, Zotero */

// Issue #35 (macOS Cmd+W, confirmed 2026-08-26): closing a main window while
// the app lives fires the same tab-close storm as a quit, but none of the
// shutdown flags are set — so _applyTabGroups pruned members and
// empty-deleted the group mid-teardown. The Dock reopen then had nothing to
// re-claim, and even a later FULL restart could not restore (persisted state
// already destroyed). The fix: onMainWindowUnload arms a 20s latch
// (_wvMainWindowClosingAt) that joins the tearingDown guard.

describe("Weavero — window teardown never destroys tab groups (issue #35)", () => {
    let wv, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._applyTabGroups !== "function"
            || typeof wv._tabGroupCreate !== "function") this.skip();
        win = Zotero.getMainWindow();
    });

    after(() => {
        try { wv._wvMainWindowClosingAt = 0; } catch (e) {}
    });

    // A group with NO stamped tab anywhere, marked seen-open (the arming
    // condition for empty-deletion), reproduces the mid-teardown state.
    const mkEmptySeenGroup = () => {
        const g = wv._tabGroupCreate("WV35-SPEC", "blue");
        (wv._wvGroupSeenOpen || (wv._wvGroupSeenOpen = new Set())).add(g.id);
        return g;
    };
    const groupExists = (id) => {
        try { return !!(wv._tabGroupsGet ? wv._tabGroupsGet() : []).find(x => x.id === id); }
        catch (e) { return null; }
    };

    it("with the window-closing latch fresh, an 'empty' group SURVIVES the apply", async () => {
        const g = mkEmptySeenGroup();
        wv._wvMainWindowClosingAt = Date.now();          // Cmd+W just fired
        wv._applyTabGroups(win);
        await new Promise(r => win.setTimeout(r, 300));  // empty-delete is applied in-pass
        assert.isTrue(groupExists(g.id),
            "pre-fix shape: the teardown apply destroyed the group's persisted state");
        // cleanup
        wv._wvMainWindowClosingAt = 0;
        try { if (wv._tabGroupDelete) wv._tabGroupDelete(g.id); } catch (e) {}
    });

    it("with the latch expired, the empty-delete works as before (no behaviour freeze)", async () => {
        const g = mkEmptySeenGroup();
        wv._wvMainWindowClosingAt = Date.now() - 60000;  // long past the 20s window
        wv._applyTabGroups(win);
        await new Promise(r => win.setTimeout(r, 300));
        assert.isFalse(groupExists(g.id),
            "an empty seen-open group must still be cleaned up in the steady state");
    });

    it("onMainWindowUnload arms the latch before teardown work", () => {
        wv._wvMainWindowClosingAt = 0;
        const fake = { setTimeout: () => 0, closed: true };   // unload body tolerates a dead window
        try { wv.onMainWindowUnload(fake); } catch (e) {}
        assert.isAbove(wv._wvMainWindowClosingAt || 0, Date.now() - 5000,
            "the latch must be set no matter what the rest of the unload body does");
    });
});
