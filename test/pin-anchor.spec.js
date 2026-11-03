/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-134569 (upstream register #43 and #44, MJT's forum 134569, and
// 113626's resize case; MJT 2026-11-02: "Can you fix these 3 in Weavero?",
// plan "One anchoring mechanism" approved). Zotero pins a section by
// scrolling ONCE, in itemDetails.js render() right after the sections' sync
// renders, then never looks again (`overflow-anchor: none` on the
// scroller): a section ABOVE the pinned one that changes height afterwards
// -- the retraction banner a frame late, the attachment preview back from a
// stored zero width, the preview following the pane's width on a resize --
// pushes the pinned section down by its growth. Weavero adds every such
// change to scrollTop while the pin is "armed": from Zotero's own scroll to
// the pinned section until the user scrolls elsewhere. Written before the
// code.

describe("Weavero — WV-TEMP-134569: the pinned section stays at the top while a section above it changes height", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, P, det, pp, saved, probe;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWirePinAnchorFix", "_wvTeardownPinAnchorFix", "_wvPinAnchorNeeded", "_wvFixPinAnchor"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        P = await wvT.createItem("journalArticle", { title: "WVANCHOR paper", abstractNote: "WVANCHOR abstract." });
        await ZP.selectItems([P.id]);
        det = await wvT.waitFor(() => { const d = doc.querySelector("#zotero-item-pane item-details"); return d && d._paneParent && d._paneParent.clientHeight && d.getEnabledPane("tags") ? d : null; }, 15000);
        assert.isOk(det, "the library's item pane, with a Tags section");
        pp = det._paneParent;
        saved = { pin: det.pinnedPane || "", min: pp.style.getPropertyValue("--min-scroll-height"), top: pp.scrollTop };
    });

    after(async function () {
        try { unprobe(); } catch (e) {}
        try { wv._wvWirePinAnchorFix(win); } catch (e) {}
        try { det.pinnedPane = saved.pin; pp.style.setProperty("--min-scroll-height", saved.min); pp.scrollTop = saved.top; } catch (e) {}
        await wvT.erase(P);
    });

    const top = (id) => det.getEnabledPane(id).getBoundingClientRect().top - pp.getBoundingClientRect().top;
    const above = () => det.getEnabledPane("info");
    /** A 300-px block at the end of the Info section's body (the section
     *  element itself is a flex row: a child beside it adds no height): what
     *  a late retraction banner or a regrown preview does to the sections
     *  below it. */
    const probeIn = (px) => {
        unprobe();
        const body = above().querySelector("collapsible-section .body");
        assert.isOk(body, "the Info section's body");
        probe = doc.createElement("div");
        probe.className = "wv-anchor-probe";
        probe.style.cssText = "display:block;height:" + px + "px;";
        body.appendChild(probe);
        return probe;
    };
    const unprobe = () => { if (probe) { probe.remove(); probe = null; } };
    /** Tags pinned and Zotero's own instant scroll to it, as render() does. */
    const pinTags = async () => {
        det.pinnedPane = "tags";
        await det.scrollToPane("tags", "instant");
        await wvT.sleep(120);
        assert.approximately(top("tags"), 0, 1.5, "Tags at the top after Zotero's scroll");
    };
    const settle = () => wvT.sleep(250);

    it("Zotero's item pane still pins with one scroll (the workaround installs only while it does)", function () {
        assert.isTrue(wv._wvPinAnchorNeeded(det), "11.0's scrollToPane scrolls, and item-details watches no section's size");
    });

    it("a section above the pinned one growing by 300 px: the pinned section stays at the top; shrinking back too", async function () {
        await pinTags();
        const h0 = above().getBoundingClientRect().height;
        probeIn(300);
        const grown = await wvT.waitFor(() => above().getBoundingClientRect().height - h0 >= 290 || null, 3000);
        assert.isOk(grown, "the Info section grew by the block");
        const held = await wvT.waitFor(() => Math.abs(top("tags")) <= 1.5 || null, 3000);
        assert.isOk(held, "Tags still at the top: " + top("tags"));
        unprobe();
        await settle();
        assert.approximately(top("tags"), 0, 1.5, "and after the block is gone");
    });

    it("once the user has scrolled elsewhere, nothing is held in place", async function () {
        await pinTags();
        // Up by 200 px. Where Tags then settles is the pane's (Zotero's
        // pin padding goes with the pin): 103 px down on both 1.0.0-beta.1
        // CI runners whatever the scroll, so fixed 150- and 200-px
        // expectations failed while the behaviour held (2026-11-03). What
        // matters: Tags is off the top -- the user scrolled elsewhere.
        pp.scrollTop = Math.max(0, pp.scrollTop - 200);
        await settle();
        const t0 = top("tags");
        assert.isAtLeast(t0, 20, "Tags scrolled down the pane by the user: " + t0);
        probeIn(300);
        await settle();
        assert.isAtLeast(top("tags") - t0, 290, "the growth moved Tags, as the user's scroll position stands: " + top("tags"));
        unprobe();
        await settle();
    });

    it("the teardown leaves Zotero's single scroll (the section drifts: the bug the spec sees), the wiring takes it again", async function () {
        wv._wvTeardownPinAnchorFix();
        try {
            assert.deepEqual(wvT.lib().wvWrapLayers(det, "scrollToPane"), [], "no layer left on scrollToPane");
            assert.isNotOk(det._wvPinAnchor, "no observer left");
            await pinTags();
            probeIn(300);
            await settle();
            assert.isAtLeast(top("tags"), 290, "Zotero's own pane: Tags pushed down by the block -- the upstream behaviour");
            unprobe();
            await settle();
        }
        finally { wv._wvWirePinAnchorFix(win); }
        assert.deepEqual(wvT.lib().wvWrapLayers(det, "scrollToPane").map(l => l.layer), ["pinAnchor"]);
        await pinTags();
        probeIn(300);
        const held = await wvT.waitFor(() => Math.abs(top("tags")) <= 1.5 || null, 3000);
        assert.isOk(held, "wired again, held again: " + top("tags"));
        unprobe();
        await settle();
    });

    // The attachment preview grows INSIDE Zotero's own ResizeObserver
    // callback (attachmentPreview.js _handleResize sets --preview-width; the
    // host's `transition: height` cannot animate an auto height, so it
    // jumps), and a size change made inside a resize callback reaches an
    // observer of a SHALLOWER target only on the next tick (the loop's
    // undelivered notifications): the frame in between painted the pinned
    // section pushed down, pulled back a frame later (MJT 2026-11-03, "it
    // flickers quickly before coming back to the correct position. Please
    // fix properly"). Two fixes: a preview above the pinned section whose
    // stored width is stale is sized BEFORE Zotero's pin scroll, so nothing
    // grows after it; and a resize callback settles the anchor in the same
    // call. Zotero's own watch on the preview is paused for the probe, or it
    // would redo the width itself a tick later. FAILED on dev.160.
    it("a stale preview above the pinned section is sized before the pin scroll; a resize callback settles the anchor in the same call", async function () {
        const A = await wvT.createTestPDFItem("wvanchor-pdf", { parentItemID: P.id });
        let pv = null;
        try {
            det.pinnedPane = "";
            await det.scrollToPane("attachments", "instant");
            const box = det.getEnabledPane("attachments");
            pv = await wvT.waitFor(() => (box && box._preview && box._preview.dataset.previewStatus === "success" && box._preview._lastRenderID === A.id) ? box._preview : null, 30000);
            assert.isOk(pv, "the Attachments section's preview, rendered");
            assert.isFalse(pv.disableResize, "the section's preview follows its box's width");
            assert.isOk(pv._resizeOb, "Zotero's own watch on it");
            assert.include(wvT.lib().wvWrapLayers(pv, "_handleResize").map(l => l.layer), "pinAnchor", "its resize callback wrapped");
            const widthVar = () => win.getComputedStyle(pv).getPropertyValue("--preview-width").trim();
            const S = det._wvPinAnchor;
            assert.isOk(S && typeof S.settle === "function" && typeof S.presize === "function", "the anchor, with its settle and presize");
            pv._resizeOb.disconnect();
            // Part 1: the stored width stale (what an empty Attachments
            // section leaves: 0px), then Zotero's pin scroll to Tags, below
            // Attachments: the width set before the scroll, no growth after.
            pv.style.setProperty("--preview-width", "0px");
            await settle();
            const moves0 = S.moves;
            det.pinnedPane = "tags";
            const hBefore = det.getEnabledPane("attachments").getBoundingClientRect().height;
            await det.scrollToPane("tags", "instant");
            assert.strictEqual(widthVar(), pv.clientWidth + "px", "sized before the scroll, by Zotero's own width rule");
            const hAfter = det.getEnabledPane("attachments").getBoundingClientRect().height;
            assert.isAbove(hAfter - hBefore, 100, "the section grew by the preview's height before the scroll, not after it");
            await settle();
            assert.approximately(top("tags"), 0, 1.5, "Tags at the top");
            // (The page may still re-fit by a few pixels after the scroll --
            // the reader's ratio at the new width -- and the observer holds
            // that: `moves` is not asserted here.)
            // Part 2: shrunk outside any callback, the observer holds Tags on
            // its tick; grown back inside the resize callback, the wrap
            // holds Tags in the same call, before any tick.
            pv.style.setProperty("--preview-width", "0px");
            const held = await wvT.waitFor(() => Math.abs(top("tags")) <= 1.5 && S.moves > moves0 ? true : null, 3000);
            assert.isOk(held, "the shrink compensated by the observer: " + top("tags"));
            const moves1 = S.moves;
            pv._handleResize();
            assert.strictEqual(widthVar(), pv.clientWidth + "px");
            assert.approximately(top("tags"), 0, 1.5, "Tags at the top right after the call");
            assert.isAtLeast(S.moves, moves1 + 1, "settled by the callback's wrap");
            await settle();
            assert.approximately(top("tags"), 0, 1.5, "and still");
        }
        finally {
            try { if (pv && pv._resizeOb) pv._resizeOb.observe(pv); } catch (e) {}
            await wvT.erase(A);
        }
    });

    it("a reader tab's context pane gets it too", async function () {
        const A = await wvT.createTestPDFItem("wvanchor-pdf", { parentItemID: P.id });
        const reader = await wvT.openReaderTab(A.id);
        try {
            const cd = await wvT.waitFor(() => doc.getElementById(reader.tabID + "-context"), 15000);
            assert.isOk(cd, "the tab's item-details");
            const layers = await wvT.waitFor(() => { const l = wvT.lib().wvWrapLayers(cd, "scrollToPane"); return l.length ? l : null; }, 5000);
            assert.deepEqual((layers || []).map(l => l.layer), ["pinAnchor"]);
        }
        finally { wvT.closeReaderTab(reader); }
    });
});
