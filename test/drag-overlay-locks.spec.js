/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06: a tab-drag "show" while the previous drag's scroll
// locks were still in place (its dragend missed, the watchdog not yet
// ticked) recorded "hidden" as the ORIGINAL overflow; the hide then restored
// the readers to unscrollable. A show now releases the previous locks
// first. The watchdog's tick chain also moved off the main window's timer
// (a window closing mid-drag left the "armed" flag stuck for the session).

describe("Weavero — drag overlays: a second show restores the first drag's locks", () => {
    let wv, div, fake;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvShowReaderDragOverlays, "_wvShowReaderDragOverlays");
        assert.isFunction(wv._wvHideReaderDragOverlays, "_wvHideReaderDragOverlays");
        const doc = Zotero.getMainWindow().document;
        div = doc.createElement("div");
        div.id = "wv-test-scroller";
        div.style.cssText = "position:fixed;left:0;top:0;width:60px;height:40px;overflow:auto;";
        const inner = doc.createElement("div");
        inner.style.height = "400px";
        div.appendChild(inner);
        doc.documentElement.appendChild(div);
        void div.offsetHeight;
        // A stand-in reader whose "document" is the main window's: the lock
        // pass walks it like a reader document.
        fake = { _iframeWindow: { document: doc } };
    });

    after(() => {
        if (!wv) return;
        try { const rs = Zotero.Reader._readers; const i = rs.indexOf(fake); if (i !== -1) rs.splice(i, 1); } catch (_) {}
        try { wv._wvHideReaderDragOverlays(); } catch (_) {}
        try { div.remove(); } catch (_) {}
    });

    it("show, show, hide leaves the scroller with its original overflow", () => {
        Zotero.Reader._readers.push(fake);
        try {
            wv._wvShowReaderDragOverlays();
            assert.equal(div.style.overflow, "hidden", "locked by the first show");
            wv._wvShowReaderDragOverlays();   // the first drag's dragend was missed
            wv._wvHideReaderDragOverlays();
            assert.equal(div.style.overflow, "auto", "restored to the original, not to the first show's 'hidden'");
        }
        finally {
            const rs = Zotero.Reader._readers; const i = rs.indexOf(fake); if (i !== -1) rs.splice(i, 1);
        }
    });

    it("the watchdog's tick chain is not hosted on a window", () => {
        const src = String(wv._wvArmDragOverlayWatchdog);
        assert.notInclude(src, "w0.setTimeout", "no window-bound timer");
    });
});
