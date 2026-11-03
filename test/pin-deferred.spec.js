/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-REG37 (pane.ts; upstream register #37). MJT 2026-10-26: "A double
// click on the Backlinks icon does not pin it." A pane that cannot show the
// pinned section yet -- a plugin section exists only once an item renders
// there -- sets the pin aside (`_pendingPinnedPane`) and then SAVES its
// empty pin: Zotero's `pinnedPane` setting is cleared until the section
// renders (lost if Zotero quits before). With Zotero's one pin for every
// window, a second window with no item selected un-pinned the window that
// pinned; since dev.47 the windows after the first keep their own pin
// (test/window-pane-prefs.spec.js), so what is left is the first window's
// own setting.
//
// TRIPWIRE: the first test checks that Zotero still clears it. When it
// fails, Zotero has fixed the deferred pin: retire WV-TEMP-REG37 (Weavero
// already installs nothing then).

describe("Weavero — WV-TEMP-REG37: a pin set aside does not clear Zotero's saved pin", function () {
    this.timeout(30000);
    let wv, win, pin0;
    const det = () => win.document.querySelector("#zotero-item-pane item-details");
    const NOT_SHOWN = "wv-not-shown-section";   // a pane this item pane cannot show

    before(function () {
        wv = wvT.plugin();
        for (const m of ["_wvWirePinDeferFix", "_wvTeardownPinDeferFix", "_wvPinDeferNeeded"]) wvT.method(m);
        win = Zotero.getMainWindow();
        pin0 = Zotero.Prefs.get("pinnedPane");
    });

    after(function () {
        try { det()._pendingPinnedPane = ""; det().pinnedPane = ""; } catch (e) {}
        if (pin0) Zotero.Prefs.set("pinnedPane", pin0); else Zotero.Prefs.clear("pinnedPane");
    });

    it("TRIPWIRE: without Weavero, a pin set aside clears Zotero's saved pin (the deferred pin unfixed)", function () {
        assert.isTrue(wv._wvPinDeferNeeded(det()), "Zotero's deferred pin still saves an empty pin -- if not, retire WV-TEMP-REG37");
        Zotero.Prefs.set("pinnedPane", "tags");
        wv._wvTeardownPinDeferFix();
        try {
            det().pinnedPane = NOT_SHOWN;
            assert.strictEqual(det()._pendingPinnedPane, NOT_SHOWN, "set aside");
            assert.isNotOk(Zotero.Prefs.get("pinnedPane"), "Zotero's saved pin is cleared -- if it stays, Zotero fixed it: retire WV-TEMP-REG37");
        }
        finally {
            det()._pendingPinnedPane = "";
            wv._wvWirePinDeferFix(win);
        }
    });

    it("with the fix, a pin set aside leaves Zotero's saved pin alone; a real un-pin still clears it", function () {
        Zotero.Prefs.set("pinnedPane", "tags");
        det().pinnedPane = NOT_SHOWN;
        assert.strictEqual(det()._pendingPinnedPane, NOT_SHOWN, "set aside");
        assert.strictEqual(Zotero.Prefs.get("pinnedPane"), "tags", "the saved pin is not cleared");
        det()._pendingPinnedPane = "";
        det().pinnedPane = "";
        assert.isNotOk(Zotero.Prefs.get("pinnedPane"), "an un-pin with nothing set aside clears it");
    });

    it("stands down when Zotero's pin save has changed (the fix shipped, in any form)", function () {
        const fixed = { _savePinnedPane() { if (this._pendingPinnedPane) return; } };
        assert.isFalse(wv._wvPinDeferNeeded(fixed), "a save that minds the deferred pin is Zotero's fix");
        const save = fixed._savePinnedPane;
        const fakeWin = { document: { querySelector: () => fixed } };
        wv._wvWirePinDeferFix(fakeWin);
        assert.strictEqual(fixed._savePinnedPane, save, "Zotero's own save runs");
        assert.isUndefined(fixed._wvWraps, "nothing wrapped");
    });
});
