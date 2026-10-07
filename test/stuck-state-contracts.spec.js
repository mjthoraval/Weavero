/* global describe, it, before, assert, Zotero */

// Survey 2026-10-06, the fixes that need two windows or a drag to exercise
// for real. These are SOURCE contracts (the shape each fix must keep), not
// behavioural tests: the behaviour is in docs/resilience-testing.md under
// "Moves never lose tabs". Each assertion fails on the pre-fix code.

describe("Weavero — stuck-state and tab-loss contracts", () => {
    let wv;
    const src = (name) => { assert.isFunction(wv[name], name); return String(wv[name]); };
    const count = (s, needle) => s.split(needle).length - 1;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("the final-apply backstop releases the hold (filter stale-keep repair stays alive)", () => {
        const s = src("_wvArmFinalApply");
        assert.isAtLeast(count(s, "_wvFAHold = false"), 2, "the done branch AND the backstop clear the hold");
    });

    it("a saved window is forgotten only once a window exists for it", () => {
        const s = src("_wvSavedWindowReopen");
        const forgetDef = s.indexOf("forget = ");
        const firstCall = s.indexOf("forget()");
        assert.isAbove(forgetDef, -1);
        assert.isAbove(firstCall, s.indexOf("openMainWindow"), "the main entry goes after the window was asked for");
        assert.isBelow(s.indexOf("holds only notes"), s.lastIndexOf("forget()"), "a notes-only reader entry stays parked");
    });

    it("moving tabs to a new main window keeps the source tabs when the window never settles", () => {
        const s = src("_wvMoveTabsToNewMainWindow");
        const guard = s.indexOf("source tabs kept");
        assert.isAbove(guard, -1);
        assert.isBelow(guard, s.indexOf("Zotero_Tabs.close("), "the guard comes before any close");
    });

    it("moving a tab into a reader window closes the source only after the mount succeeded", () => {
        const s = src("_wvMoveTabToTarget");
        assert.include(s, "if (newId == null", "new-group branch");
        assert.include(s, "if (newRId == null", "loose-move branch");
    });

    it("the no-reload swap restores the window on every non-success exit", () => {
        const s = src("_wvWTSwapInReader");
        assert.isAtLeast(count(s, "abort("), 3, "bail paths go through one abort()");
    });

    it("a single-tab main→reader drop awaits the close notify before renaming the moved reader", () => {
        const s = src("_wvWTHandleMainTabDrop");
        assert.include(s, "_wvCloseMainTabAndAwait(owner, dragTabId)");
    });

    it("window conversions close the source only when the target can take the tabs", () => {
        assert.include(src("_wvConvertReaderWindowToMain"), "target window gone");
        assert.include(src("_wvConvertMainWindowToReader"), "source window kept");
    });
});
