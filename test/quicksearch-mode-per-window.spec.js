/* global describe, it, before, after, assert, Zotero, wvT */

// Collapsing an Advanced Search back to the quick search sets the quick-search
// mode of the search (collapse-to-quick-search.spec.js has the mapping). A
// Zotero with its own windows (zotero#6035) keeps that mode PER WINDOW
// (`Zotero.Prefs.getForWindow/setForWindow`, quickSearchTextbox.js), and a
// plain pref write there is "a change made outside of a main window" that
// every window takes (ZoteroPane.setWindowSetting). Zotero 9 and 10 keep one
// mode for every window: there the collapse writes the pref, as before.
// Alignment review 2026-11-11, §1 item 4; failed on 1.0.5-dev.7 (076918c9).

describe("Weavero — the quick-search mode of a collapse stays in its window", function () {
    this.timeout(90000);
    let wv, lib, A, B;
    const native = wvT.nativeWindows();
    const MODE = "search.quicksearch-mode";
    const Prefs = /** @type {any} */ (Zotero).Prefs;
    const getMode = (w) => (native ? Prefs.getForWindow(w, MODE) : Prefs.get(MODE));
    const setMode = (w, v) => (native ? Prefs.setForWindow(w, MODE, v) : Prefs.set(MODE, v));

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!wv || !lib) wvT.absent("plugin");
        wvT.method("_wvCollapseAdvancedToQuickSearch");
        A = Zotero.getMainWindows()[0];
        if (native) {
            B = await wvT.openMainWindow();
            assert.isOk(B, "a second main window");
        }
    });

    after(async function () {
        this.timeout(20000);
        try { if (B && !B.closed) { B._wvSavedParkClose = true; B.close(); } } catch (e) {}
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
    });

    it("a collapse to the quick search sets the mode of its own window only", async function () {
        const ZP = A.ZoteroPane;
        assert.isFunction(ZP.openAdvancedSearchFromQuickSearch, "Zotero's in-window Advanced Search");
        const P0 = Prefs.get(MODE);
        try {
            setMode(A, "fields");
            if (B) setMode(B, "fields");
            await ZP.openAdvancedSearchFromQuickSearch("wvpwmode", "titleCreatorYear");
            const deck = lib.wvViewEl(A.document, "zotero-advanced-search-pane-deck");
            assert.isOk(await wvT.waitFor(() => deck.state === "open" || null, 5000), "Advanced Search open in the first window");
            await ZP.toggleAdvancedSearchState("collapsed");
            assert.isOk(await wvT.waitFor(() => deck.state === "closed" || null, 5000), "collapsed back to the quick search");
            assert.strictEqual(lib.wvViewEl(A.document, "zotero-tb-search").value, "wvpwmode", "Weavero's collapse ran");
            assert.strictEqual(getMode(A), "titleCreatorYear", "the first window takes the search's mode");
            if (native) assert.strictEqual(getMode(B), "fields", "the second window keeps its own mode");
            else assert.strictEqual(Prefs.get(MODE), "titleCreatorYear", "Zotero 9/10: the one shared mode, as before");
        }
        finally {
            try { await ZP.clearQuicksearch(); } catch (e) {}
            try { setMode(A, P0 || "fields"); } catch (e) {}
            try { if (B && !B.closed) setMode(B, P0 || "fields"); } catch (e) {}
            try { Prefs.set(MODE, P0 || "fields"); } catch (e) {}
        }
    });
});
