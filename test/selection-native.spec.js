/* global describe, it, before, after, assert, Zotero, wvT */

// Zotero's own selection handler survives a re-wire and a disable
// (2026-11-11, found while fixing per-window state).
//
// On Zotero 10.0.8 and 11.0-beta.4 (both runs 2026-11-11), CollectionViewItemTree declares
// `_handleSelectionChange` as a CLASS FIELD (collectionViewItemTree.jsx: in
// Duplicate Items a click selects the whole duplicate set), so the handler is
// the view's own property, not a prototype method. Weavero's capture wrap
// replaced it, and both a re-wire (reload, upgrade) and a disable `delete`d
// the wrapper: ItemTree's prototype method showed through, and Duplicate
// Items selected one item until a restart.
//
// Probe: the native field always resets `duplicateMouseSelection` to false;
// ItemTree's prototype method never touches it. A fresh second window gives
// a view no earlier spec has re-wired. Skipped on builds where the handler
// is a prototype method (there `delete` is the right give-back).

describe("Weavero — Zotero's own selection handler survives a re-wire and a disable", function () {
    this.timeout(60000);
    let wv, B, iv;
    const reachesNative = () => {
        iv.duplicateMouseSelection = true;
        try { iv._handleSelectionChange(iv.selection, false); } catch (e) {}
        return iv.duplicateMouseSelection === false;
    };
    const ownNative = () => Object.prototype.hasOwnProperty.call(iv, "_handleSelectionChange")
        && /duplicateMouseSelection/.test(String(iv._handleSelectionChange));

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvPatchSelectionChangeForCapture");
        B = await wvT.openMainWindow();
        assert.isOk(B, "a second main window");
        await wvT.waitFor(() => (B.ZoteroPane.itemsView && B.ZoteroPane.itemsView.selection) || null, 20000);
        iv = B.ZoteroPane.itemsView;
        if (!/_handleSelectionChange\s*=\s*\(/.test(String(iv.constructor))) this.skip();
        wv._wvPatchSelectionChangeForCapture(iv);
        assert.strictEqual(iv._wvSelChangeWired, wv._wvWireTag(), "the capture is wired");
        assert.isTrue(reachesNative(), "the wired chain reaches Zotero's own handler");
    });

    after(async function () {
        this.timeout(30000);
        try { if (B && !B.closed) { B._wvSavedParkClose = true; B.close(); } } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
    });

    it("a re-wire (another instance's stamp) keeps Zotero's own handler under the capture", () => {
        iv._wvSelChangeWired = "wv@" + (wv._version || "dev") + "#0ldinst";
        wv._wvPatchSelectionChangeForCapture(iv);
        assert.strictEqual(iv._wvSelChangeWired, wv._wvWireTag(), "re-wired under this instance");
        assert.isTrue(reachesNative(), "Zotero's class-field handler must still run under the new wrapper");
    });

    it("a disable gives the view Zotero's own handler back", () => {
        assert.isFunction(wv._wvUnpatchSelectionChangeForCapture, "the give-back is its own method");
        wv._wvUnpatchSelectionChangeForCapture(iv);
        assert.isUndefined(iv._wvSelChangeWired, "the stamp goes");
        assert.isTrue(ownNative(), "the view's own class-field handler is back, not ItemTree's prototype method");
        assert.isTrue(reachesNative());
        wv._wvPatchSelectionChangeForCapture(iv);
        assert.isTrue(reachesNative(), "re-wired again after the give-back");
    });
});
