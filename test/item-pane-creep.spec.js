/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-131000 (upstream register #40; MJT's forums 131000, 2026-04-17;
// MJT 2026-10-28: "I have reproduced with Weavero disabled. Now fix in
// Weavero."). Zotero's item pane, scrolled to its bottom, keeps going down
// 1 px per scroll event: itemDetails.js `_handleContainerScroll` sets the
// spacer (`--min-scroll-height`) to `scrollTop + clientHeight`, and
// `clientHeight` is an integer while the scroller can be x.5 px tall (the
// Bibliography Entry header at an odd number of 19.5-px lines) -- half a
// pixel past the real bottom each time. Weavero writes the real bottom back
// right after Zotero's handler. Written before the code.

describe("Weavero — WV-TEMP-131000: the item pane stops at its bottom", function () {
    this.timeout(90000);
    let wv, win, doc, P, det, pp, saved;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWireItemPaneCreepFix", "_wvTeardownItemPaneCreepFix", "_wvItemPaneCreepNeeded"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        P = await wvT.createItem("journalArticle", { title: "WVCREEP paper" });
        await win.ZoteroPane.selectItems([P.id]);
        det = await wvT.waitFor(() => { const d = doc.querySelector("#zotero-item-pane item-details"); return d && d._paneParent && d._paneParent.clientHeight ? d : null; }, 15000);
        assert.isOk(det, "the library's item pane");
        pp = det._paneParent;
        saved = { hh: det._header.style.height, min: pp.style.getPropertyValue("--min-scroll-height"), top: pp.scrollTop };
    });

    after(async function () {
        try { det._header.style.height = saved.hh; pp.style.setProperty("--min-scroll-height", saved.min); pp.scrollTop = saved.top; } catch (e) {}
        try { wv._wvWireItemPaneCreepFix(win); } catch (e) {}
        await wvT.erase(P);
    });

    /** Give the item pane's header an x.5 px height -- the real cause: the
     *  Bibliography Entry header at an odd number of 19.5-px lines -- so the
     *  scroller starts on a half pixel and is x.5 px tall (a fractional
     *  height alone, with the top on a whole pixel, does not creep: measured
     *  on the dev instance 2026-10-28). Then a spacer past its content (what
     *  a pinned section or a sidenav click leaves), and `n` scrolls to the
     *  bottom through real scroll events; the scroll heights seen. */
    const creep = (n) => {
        // Grown just enough to put the scroller's top on a half pixel, from
        // wherever the pane starts: after a reader tab has been open the
        // window lays the pane out at a fractional top (2026-10-28, a run
        // after attachments-stale-preview.spec.js: the old floor + 0.5
        // landed the top on .2).
        det._header.style.height = "";
        const hh = det._header.getBoundingClientRect().height;
        const t0 = pp.getBoundingClientRect().top;
        det._header.style.height = (hh + (((0.5 - t0) % 1) + 1) % 1) + "px";
        const r = pp.getBoundingClientRect();
        assert.approximately(Math.abs(r.top % 1), 0.5, 0.01, "the scroller starts on a half pixel, as under an odd-line header");
        assert.approximately(r.height % 1, 0.5, 0.01, "and is x.5 px tall");
        pp.style.setProperty("--min-scroll-height", (pp.scrollHeight + 400) + "px");
        const seen = [];
        for (let i = 0; i < n; i++) {
            pp.scrollTop = pp.scrollHeight;
            pp.dispatchEvent(new win.Event("scroll"));
            seen.push(pp.scrollHeight);
        }
        return seen;
    };

    it("Zotero's handler still rounds here (the workaround installs only while it does)", function () {
        assert.isTrue(wv._wvItemPaneCreepNeeded(det), "11.0's _handleContainerScroll uses scrollTop + clientHeight against scrollHeight");
    });

    it("scrolled to the bottom twelve times, the pane does not grow", function () {
        const seen = creep(12);
        assert.isAtMost(seen[seen.length - 1] - seen[0], 1, "scroll heights: " + seen.join(","));
    });

    it("the teardown gives Zotero its own listener back (the creep returns), the wiring takes it again", function () {
        wv._wvTeardownItemPaneCreepFix();
        try {
            const layers = wvT.lib().wvWrapLayers(det, "_handleContainerScroll");
            assert.deepEqual(layers, [], "no layer left on the handler");
            const seen = creep(12);
            assert.isAtLeast(seen[seen.length - 1] - seen[0], 5, "Zotero's own handler is the listener again: " + seen.join(","));
        }
        finally { wv._wvWireItemPaneCreepFix(win); }
        const seen = creep(12);
        assert.isAtMost(seen[seen.length - 1] - seen[0], 1, "fixed again: " + seen.join(","));
    });

    it("a reader tab's context pane gets it too", async function () {
        const A = await wvT.createTestPDFItem("wvcreep-pdf", { parentItemID: P.id });
        const reader = await wvT.openReaderTab(A.id);
        try {
            const cd = await wvT.waitFor(() => doc.getElementById(reader.tabID + "-context"), 15000);
            assert.isOk(cd, "the tab's item-details");
            const layers = await wvT.waitFor(() => { const l = wvT.lib().wvWrapLayers(cd, "_handleContainerScroll"); return l.length ? l : null; }, 5000);
            assert.deepEqual((layers || []).map(l => l.layer), ["creep131000"]);
        }
        finally { wvT.closeReaderTab(reader); }
    });
});
