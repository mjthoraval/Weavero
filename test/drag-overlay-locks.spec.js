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
        if (!wv) wvT.absent('!wv');
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

    // 2026-10-15: "Zotero froze while reordering pinned tabs" (three times).
    // The lock pass wrote `overflow: hidden` on EVERY element whose
    // scrollHeight beat its clientHeight -- in a snapshot 6,709 of 8,624
    // elements (every inline element: clientHeight 0) -- and read the next
    // element's layout right after each write, so a tab-drag start reflowed
    // the document thousands of times, synchronously. Only real scroll
    // containers may be locked, reads before writes.
    it("a large document locks only its real scroll containers, in bounded time", () => {
        const doc = Zotero.getMainWindow().document;
        const big = doc.createElement("div");
        big.id = "wv-test-bigdoc";
        big.style.cssText = "position:fixed;left:0;top:0;width:300px;height:200px;overflow:auto;";
        const frag = doc.createDocumentFragment();
        for (let i = 0; i < 3000; i++) {
            // A block that overflows VISIBLY (not a scroll container) ...
            const d = doc.createElement("div");
            d.style.cssText = "height:10px;overflow:visible;";
            const inner = doc.createElement("div");
            inner.style.height = "20px";
            d.appendChild(inner);
            frag.appendChild(d);
            // ... and an inline element (clientHeight 0).
            const s = doc.createElement("span");
            s.textContent = "x ";
            frag.appendChild(s);
        }
        big.appendChild(frag);
        doc.documentElement.appendChild(big);
        void big.offsetHeight;
        const stand = { _iframeWindow: { document: doc } };
        let locks = [];
        const t0 = Date.now();
        try {
            locks = wv._wvApplyScrollLockToReader(stand);
            const ms = Date.now() - t0;
            const ids = locks.map(l => l.el.id || l.el.localName);
            assert.include(ids, "wv-test-bigdoc", "the real scroller is locked");
            assert.isBelow(locks.length, 6, "only scroll containers, not the 6,000 overflowing/inline elements: " + ids.slice(0, 8).join(","));
            assert.isBelow(ms, 2000, "bounded: " + ms + " ms for 6,000+ elements");
        } finally {
            for (const l of locks) { try { l.el.style.overflow = l.prev || ""; } catch (_) {} }
            try { big.remove(); } catch (_) {}
        }
    });
});
