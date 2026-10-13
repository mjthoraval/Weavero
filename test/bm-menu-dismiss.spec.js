/* global describe, it, before, after, assert, Zotero, Components */

// The reader Bookmarks pane's "+" (add) and sort menus dismiss like every
// other Weavero reader menu (survey 2026-10-06, smaller bugs): they used an
// inline copy of the document collector that left out the views' WINDOWS
// (so Escape pressed with focus in the page did nothing) and the Reading
// Mode views (so a click there left the menu open). They now use
// `_wvReaderReachableDocs`, like the outline menus.

describe("Weavero — reader Bookmarks menus: Escape from the page dismisses them", function () {
    this.timeout(60000);
    let wv, att, reader, idoc, anchor, view;
    const Cu = Components.utils;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvShowReaderBmAddMenu", "_wvShowReaderBmSortMenu", "_wvCloseReaderBmContextMenu"]) wvT.method(m);
        att = await wvT.createTestPDFItem("wv-bm-menu");
        reader = await wvT.openReaderTab(att.id);
        assert.isOk(reader, "reader opened");
        idoc = reader._iframeWindow.document;
        anchor = idoc.createElementNS("http://www.w3.org/1999/xhtml", "button");
        (idoc.body || idoc.documentElement).appendChild(anchor);
        // The page view must be loaded BEFORE a menu opens: the menu collects
        // the views' windows when it opens (a view that loads later is not one
        // it listens to -- the first test failed for that alone).
        view = await wvT.waitFor(() => {
            try {
                const pv = Cu.waiveXrays(reader._internalReader)._primaryView;
                const w = pv && pv._iframeWindow;
                return w && w.document && w.document.readyState === "complete" ? w : null;
            } catch (e) { return null; }
        }, 30000);
        assert.isOk(view, "the page view loaded");
        await wvT.sleep(500);
    });

    after(async () => {
        try { wv._wvCloseReaderBmContextMenu(idoc); } catch (_) {}
        try { anchor.remove(); } catch (_) {}
        try { if (reader && reader.tabID) Zotero.getMainWindow().Zotero_Tabs.close(reader.tabID); } catch (_) {}
        try { await wvT.erase(att); } catch (_) {}
    });

    const escapeInPage = () => {
        // The init dictionary must live in the page's compartment: a chrome
        // object reaches the content constructor as an opaque wrapper and the
        // event arrives with key "" (verified live 2026-10-09).
        const init = Cu.cloneInto({ key: "Escape", bubbles: true }, view);
        view.document.documentElement.dispatchEvent(new view.KeyboardEvent("keydown", init));
    };

    /** @type {Array<[string, () => any]>} */
    const MENUS = [
        ["sort", () => wv._wvShowReaderBmSortMenu(reader, idoc, anchor, "local")],
        ["add", () => wv._wvShowReaderBmAddMenu(reader, idoc, anchor)],
    ];
    for (const [name, open] of MENUS) {
        it("the " + name + " menu closes on Escape pressed in the page", async () => {
            open();
            assert.isOk(idoc.getElementById("wv-bm-reader-ctxmenu"), name + " menu open");
            escapeInPage();
            assert.isNull(idoc.getElementById("wv-bm-reader-ctxmenu"), name + " menu dismissed");
        });
    }
});
