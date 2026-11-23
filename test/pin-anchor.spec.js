/* global describe, it, before, after, assert, Zotero, wvT */
// (A second block at the end: the pane's WIDTH, WV-TEMP-134569 / 113626.)

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
        // The Attachments section brought up to date for P first. Out of view,
        // Zotero's attachments-box keeps the PREVIOUS item's rows and preview
        // until it is scrolled into view (only its sync render() runs: see
        // WV-TEMP-REG41 in pane.ts, which hides them but leaves their room);
        // a spec before this one that showed a paper with a PDF left 588 px
        // there, and the user-scroll case below then saw Tags jump up by them
        // when Attachments came into view (1.2.1-hotfix runs, 2026-11-23).
        // P has no attachment: in view, the section renders empty.
        try {
            await det.scrollToPane("attachments", "instant");
            const box = det.getEnabledPane("attachments");
            await wvT.waitFor(() => (box && !box.querySelector("attachment-row") && box.getBoundingClientRect().height < 100) || null, 5000);
            await wvT.sleep(150);
        } catch (e) {}
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
        // Missed the shrink by 430 px once in the suite's second half run
        // alone, passed on its rerun (2026-11-03): retried on CI, logged, the
        // anchor's state in the message for the next miss.
        wvT.ciRetries(this, 2);
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
            // How close Tags is held: 1.5 px on Zotero 11; 3 on Zotero 10,
            // whose preview re-fits its page by 1.7-2.5 px after the
            // anchor's move (10.0.6 here, 10.0.7 on both CI runners,
            // 2026-11-03) -- without the anchor the drift is the preview's
            // whole height, 100+ px.
            const TOL = parseInt(Zotero.version, 10) >= 11 ? 1.5 : 3;
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
            assert.approximately(top("tags"), 0, TOL, "Tags at the top");
            // (The page may still re-fit by a few pixels after the scroll --
            // the reader's ratio at the new width -- and the observer holds
            // that: `moves` is not asserted here.)
            // Part 2: shrunk outside any callback, the observer holds Tags on
            // its tick; grown back inside the resize callback, the wrap
            // holds Tags in the same call, before any tick.
            pv.style.setProperty("--preview-width", "0px");
            const held = await wvT.waitFor(() => Math.abs(top("tags")) <= TOL && S.moves > moves0 ? true : null, 3000);
            // The anchor's state with the miss (the suite's second half, run
            // alone, missed by 430 px, 2026-11-03: armed? scroll vs what it
            // expected, the range, Zotero's spacer, the pin).
            const st = () => JSON.stringify({ top: top("tags"), armed: S.armed, busy: S.busy, moves: S.moves, moves0, scrollTop: pp.scrollTop, expected: S.expected,
                scrollHeight: pp.scrollHeight, clientHeight: pp.clientHeight, minScroll: det._minScrollHeight, pin: det.pinnedPane, pinnedId: S.pinnedId });
            assert.isOk(held, "the shrink compensated by the observer: " + st());
            const moves1 = S.moves;
            pv._handleResize();
            assert.strictEqual(widthVar(), pv.clientWidth + "px");
            assert.approximately(top("tags"), 0, TOL, "Tags at the top right after the call");
            assert.isAtLeast(S.moves, moves1 + 1, "settled by the callback's wrap");
            await settle();
            assert.approximately(top("tags"), 0, TOL, "and still");
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

// The pane's WIDTH (MJT 2026-11-19, "Can you fix the bug that the item pane
// scrolls when resizing?" -- the library pane with a section pinned, and
// reader tabs' item pane). Driven as a splitter drag is: nsSplitterFrame
// writes the pane's `width` attribute and inline width, then the
// onmousemove handler runs -- in a TASK between frames, and it flushes
// layout (updateLayoutConstraints reads scrollHeight) -- one write per
// frame; what each frame painted is read in a task after it (a rAF runs
// before the frame's observers). Measured on 1.2.1-dev.3 (11.0-beta.4, the
// runner): a reader tab with Related pinned was DISARMED at the first step
// that took a line off the header -- the taller scroller clamps scrollTop
// at the range's end, which the pinned section's spacer puts exactly at it,
// and the clamp's scroll event came before the observer -- then Related
// ended 95-191 px off the top; the library the same in the runner's
// 1000 x 600 window (47.8 px), plus one painted frame off by the preview's
// whole change (56 px: Zotero's preview observer calls a bound
// `_handleResize`, the wrap never runs from it). With no pin (WV-TEMP-113626)
// the box at the top edge moved with every re-wrap above it.
describe("Weavero — WV-TEMP-134569 / 113626: a change of the item pane's width (a splitter drag) moves neither the pinned section nor what is at the top", function () {
    this.timeout(300000);
    let wv, win, doc, ZP, P, Q, A, det, reader, cd, saved;
    const R = (v) => Math.round(v * 10) / 10;
    const frame = () => new Promise(r => win.requestAnimationFrame(() => r(undefined)));
    const task = () => new Promise(r => win.setTimeout(r, 0));
    const settle = async () => { for (let i = 0; i < 3; i++) await frame(); await wvT.sleep(150); await frame(); await task(); };
    // As above: 1.5 px on Zotero 11, 3 on Zotero 10 (its preview re-fits).
    const TOL = () => (parseInt(Zotero.version, 10) >= 11 ? 1.5 : 3);
    const LONG = "WVWIDTH A rather long article title about drops impacting thin liquid films, bubble entrapment and the way a text wraps when its pane changes width";
    const ABS = "WVWIDTH abstract. " + "We study how a falling drop entraps a bubble when it meets a liquid surface, and how the entrapped bubble rises, splits and finally escapes through the film. ".repeat(6);
    /** The library's item pane and the reader tabs' context pane: what a
     *  drag of their splitter writes, then its onmousemove handler. */
    const LIB = {
        el: () => doc.querySelector("#zotero-item-pane"),
        set(w) { const e = LIB.el(); e.setAttribute("width", String(Math.round(w))); e.style.width = Math.round(w) + "px"; ZP.updateLayoutConstraints(); },
        get: () => LIB.el().getBoundingClientRect().width,
    };
    const CTX = {
        el: () => doc.getElementById("zotero-context-pane"),
        set(w) { const e = CTX.el(); e.setAttribute("width", String(Math.round(w))); e.style.width = Math.round(w) + "px"; win.ZoteroContextPane.update(); },
        get: () => CTX.el().getBoundingClientRect().width,
    };
    const topIn = (d, el) => el.getBoundingClientRect().top - d._paneParent.getBoundingClientRect().top;
    /** The deepest box crossing (or first below) the scroller's top edge:
     *  what is read there (the test's own copy of the rule). */
    const atEdge = (d) => {
        const pp = d._paneParent, edge = pp.getBoundingClientRect().top;
        const walk = (root, depth) => {
            for (const c of Array.from(root.children || [])) {
                const r = c.getBoundingClientRect();
                if (!r.height) { const a = depth < 12 && c.firstElementChild ? walk(c, depth + 1) : null; if (a) return a; continue; }
                if (r.bottom <= edge + 0.5 || win.getComputedStyle(c).position === "sticky") continue;
                if (r.top >= edge - 0.5 || depth >= 12 || !c.firstElementChild) return c;
                return walk(c, depth + 1) || c;
            }
            return null;
        };
        return walk(pp, 0);
    };
    // Big steps, then a slow drag each way: one write per frame.
    const STEPS = [-120, 60, 180, -120, ...new Array(12).fill(-10), ...new Array(12).fill(10)];
    /** `pane` dragged through STEPS from `base`; `el`'s painted offset read
     *  after every frame. The worst frame and the end, from the start. */
    const drag = async (pane, d, el, base) => {
        pane.set(base);
        await settle();
        const ref = topIn(d, el);
        let worst = 0;
        const widths = [];
        // CI DIAGNOSTICS (ci-macdiag): "worst 20.6, expected at most 1.5" once on
        // macOS + beta (reader tab). Each step's offset and the time between
        // frames: one long gap at the worst step = a frame the runner skipped.
        const offs = [], gaps = [];
        let tPrev = performance.now();
        for (const step of STEPS) {
            await frame();
            await task();
            const tNow = performance.now();
            gaps.push(Math.round(tNow - tPrev)); tPrev = tNow;
            const off = topIn(d, el) - ref;
            offs.push(R(off));
            if (Math.abs(off) > Math.abs(worst)) worst = off;
            pane.set(pane.get() + step);
            widths.push(Math.round(pane.get()));
        }
        await frame();
        await task();
        if (Math.abs(topIn(d, el) - ref) > Math.abs(worst)) worst = topIn(d, el) - ref;
        await settle();
        const res = { worst: R(worst), end: R(topIn(d, el) - ref), widths: widths.join(",") };
        let armed = null;
        try { armed = !!(d._wvPinAnchor && d._wvPinAnchor.armed); } catch (e) {}
        wvT.diag("pinanchor:drag", { res, offs: offs.join(","), gaps: gaps.join(","), armed, pinned: d.pinnedPane, el: el.tagName + (el.dataset && el.dataset.pane ? ":" + el.dataset.pane : ""),
            pane: { w: Math.round(pane.get()), ppH: d._paneParent.clientHeight, sh: d._paneParent.scrollHeight, st: d._paneParent.scrollTop }, env: wvT.diagEnv(win) });
        return res;
    };
    const reselect = async () => { await ZP.selectItems([Q.id]); await wvT.sleep(300); await ZP.selectItems([P.id]); await wvT.sleep(1200); await settle(); };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvFixPinAnchor", "_wvWirePinAnchorFix"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        saved = { size: [win.outerWidth, win.outerHeight], libW: LIB.el().getAttribute("width"), ctxW: CTX.el().getAttribute("width"), ctxCollapsed: !!win.ZoteroContextPane.collapsed };
        // Room for the panes to change width (the runner opens at 1000 px);
        // the height kept, so the preview stays below its height cap.
        win.resizeTo(Math.min(1600, win.screen.availWidth), win.outerHeight);
        await wvT.sleep(800);
        P = await wvT.createItem("journalArticle", { title: LONG, abstractNote: ABS, publicationTitle: "Journal of Fluid Mechanics", volume: "973", pages: "A9", date: "2023" });
        P.setCreators([1, 2, 3, 4, 5].map(i => ({ firstName: "Author" + i, lastName: "Longname-Surname" + i, creatorType: "author" })));
        for (const t of ["bubble entrapment", "drop impact", "thin films", "surface tension", "high-speed imaging"]) P.addTag(t);
        await P.saveTx();
        A = await wvT.createTestPDFItem("wvwidth-pdf", { parentItemID: P.id });
        Q = await wvT.createItem("book", { title: "WVWIDTH other item" });
        await ZP.selectItems([P.id]);
        det = await wvT.waitFor(() => { const d = doc.querySelector("#zotero-item-pane item-details"); return d && d._paneParent && d._paneParent.clientHeight && d.getEnabledPane("related") ? d : null; }, 15000);
        assert.isOk(det, "the library's item pane, with a Related section");
        saved.pin = det.pinnedPane || "";
        // The preview shown once (it is created lazily: #44's precondition).
        det.pinnedPane = "";
        await det.scrollToPane("attachments", "instant");
        const box = det.getEnabledPane("attachments");
        const pv = await wvT.waitFor(() => (box && box._preview && box._preview.dataset.previewStatus === "success" && box._preview._lastRenderID === A.id) ? box._preview : null, 30000);
        assert.isOk(pv, "the Attachments section's preview, rendered");
    });

    after(async function () {
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        try { if (det) det.pinnedPane = saved.pin; } catch (e) {}
        try { if (saved.libW) { LIB.el().setAttribute("width", saved.libW); LIB.el().style.width = saved.libW + "px"; } } catch (e) {}
        try { if (saved.ctxW) CTX.el().setAttribute("width", saved.ctxW); else CTX.el().removeAttribute("width"); } catch (e) {}
        try { if (saved.ctxCollapsed) win.ZoteroContextPane.collapsed = true; } catch (e) {}
        try { win.resizeTo(saved.size[0], saved.size[1]); } catch (e) {}
        await wvT.erase(A, P, Q);
    });

    it("the library pane, Related pinned: held in every painted frame of a drag, still armed", async function () {
        assert.isFalse(doc.hidden, "the runner window is visible (frames and observers run)");
        det.pinnedPane = "related";
        LIB.set(480);
        await reselect();
        const S = det._wvPinAnchor, rel = det.getEnabledPane("related");
        assert.isOk(S && S.armed, "armed by the render's pin scroll");
        assert.approximately(topIn(det, rel), 0, TOL(), "Related at the top");
        const r = await drag(LIB, det, rel, 480);
        assert.isTrue(S.armed, "still armed: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.end), TOL(), "Related at the top after the drag: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.worst), TOL(), "and in every painted frame: " + JSON.stringify(r));
    });

    it("the scroller growing at the end of its range (the header losing a line) clamps scrollTop: held, not taken for the user's scroll", async function () {
        det.pinnedPane = "related";
        await reselect();
        const S = det._wvPinAnchor, pp = det._paneParent, rel = det.getEnabledPane("related"), hdr = det._header;
        assert.isTrue(S.armed, "armed");
        // The spacer as Zotero's own rule sizes it for the pinned section
        // (_getMinScrollHeightForPane; its scroll handler trims it to that):
        // the range ends at the pinned section, the content below being short.
        det._minScrollHeight = topIn(det, rel) + pp.scrollTop + pp.getBoundingClientRect().height;
        await settle();
        assert.isAtLeast(pp.scrollTop, pp.scrollHeight - pp.clientHeight - 1, "scrollTop at the range's end: " + JSON.stringify({ st: pp.scrollTop, sh: pp.scrollHeight, ch: pp.clientHeight }));
        const h = hdr.getBoundingClientRect().height, cut = Math.min(30, Math.floor(h - 10));
        assert.isAtLeast(cut, 10, "a header to take a line off: " + h);
        const ref = topIn(det, rel);
        try {
            await frame();
            await task();
            const st0 = pp.scrollTop;
            hdr.style.setProperty("max-height", (h - cut) + "px");
            hdr.style.setProperty("overflow", "hidden");
            void pp.scrollHeight;   // the mousemove handler's flush: the clamp now, its scroll event before the observer
            assert.isBelow(pp.scrollTop, st0 - 1, "the taller scroller clamped scrollTop (the case under test)");
            await settle();
            assert.isTrue(S.armed, "still armed: the clamp is layout's");
            assert.approximately(topIn(det, rel) - ref, 0, TOL(), "Related back at the top");
        }
        finally {
            hdr.style.removeProperty("max-height");
            hdr.style.removeProperty("overflow");
            await settle();
        }
        assert.approximately(topIn(det, rel) - ref, 0, TOL(), "and when the header takes its line back");
    });

    it("no pin: the box at the top edge stays put across a drag (library)", async function () {
        det.pinnedPane = "";
        await reselect();
        const pp = det._paneParent;
        pp.scrollTop = Math.round((pp.scrollHeight - pp.clientHeight) / 2);   // the user's scroll
        await settle();
        const el = atEdge(det);
        assert.isOk(el, "a box at the top edge");
        const r = await drag(LIB, det, el, 480);
        assert.isAtMost(Math.abs(r.end), TOL(), el.tagName + " where it was after the drag: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.worst), TOL(), "and in every painted frame: " + JSON.stringify(r));
    });

    it("a reader tab's item pane, Related pinned: held across a drag of its splitter, still armed", async function () {
        reader = await wvT.openReaderTab(A.id);
        assert.isOk(reader, "a reader tab");
        if (win.ZoteroContextPane.collapsed) win.ZoteroContextPane.collapsed = false;
        cd = await wvT.waitFor(() => { const d = doc.getElementById(reader.tabID + "-context"); return d && d._paneParent && d._paneParent.clientHeight && d.getEnabledPane("related") ? d : null; }, 20000);
        assert.isOk(cd, "the tab's item pane");
        cd.pinnedPane = "related";
        CTX.set(480);
        await settle();
        await cd.render();
        await settle();
        const S = cd._wvPinAnchor, rel = cd.getEnabledPane("related");
        assert.isOk(S && S.armed, "armed by the render's pin scroll");
        const r = await drag(CTX, cd, rel, 480);
        assert.isTrue(S.armed, "still armed: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.end), TOL(), "Related at the top after the drag: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.worst), TOL(), "and in every painted frame: " + JSON.stringify(r));
    });

    it("a reader tab, the user scrolled away from the pin: their view stays, the pin is not taken back", async function () {
        assert.isOk(cd, "the previous test's reader tab");
        cd.pinnedPane = "related";
        await cd.render();
        await settle();
        const S = cd._wvPinAnchor, pp = cd._paneParent, rel = cd.getEnabledPane("related");
        pp.scrollTop -= 300;   // the user's scroll
        await settle();
        assert.isFalse(S.armed, "the user's scroll disarmed the pin");
        const el = atEdge(cd);
        assert.isOk(el, "a box at the top edge");
        const r = await drag(CTX, cd, el, 480);
        assert.isFalse(S.armed, "still disarmed");
        assert.isAtLeast(topIn(cd, rel), 100, "Related not taken back to the top: " + R(topIn(cd, rel)));
        assert.isAtMost(Math.abs(r.end), TOL(), el.tagName + " where the user left it: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.worst), TOL(), "and in every painted frame: " + JSON.stringify(r));
    });

    it("no pin in a reader tab: the box at the top edge stays put across a drag", async function () {
        assert.isOk(cd, "the reader tab");
        cd.pinnedPane = "";
        await cd.render();
        await settle();
        const pp = cd._paneParent;
        pp.scrollTop = Math.round((pp.scrollHeight - pp.clientHeight) / 2);
        await settle();
        const el = atEdge(cd);
        assert.isOk(el, "a box at the top edge");
        const r = await drag(CTX, cd, el, 480);
        assert.isAtMost(Math.abs(r.end), TOL(), el.tagName + " where it was after the drag: " + JSON.stringify(r));
        assert.isAtMost(Math.abs(r.worst), TOL(), "and in every painted frame: " + JSON.stringify(r));
    });

    it("Zotero's own pin scroll: a scroll the user makes before it settles is not undone; a late growth above is held", async function () {
        det.pinnedPane = "related";
        await reselect();
        const S = det._wvPinAnchor, pp = det._paneParent, rel = det.getEnabledPane("related");
        // The user's wheel and scroll while the pin scroll runs (busy).
        pp.scrollTop -= 200;
        await settle();
        const t0 = win.performance.now();
        const p = det.scrollToPane("related", "instant");
        pp.dispatchEvent(new win.WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
        pp.scrollTop -= 150;
        await p;
        await settle();
        assert.isAtLeast(S.inputAt, t0, "the wheel reached the anchor's input listener");
        assert.isFalse(S.armed, "the user's scroll: nothing held");
        assert.isAtLeast(topIn(det, rel), 100, "Related where the user's scroll put it: " + R(topIn(det, rel)));
        // No input: a section above growing before the pin scroll settles
        // (#43's banner, in the idle gap before scrollToPane resolves) is held.
        pp.scrollTop -= 200;
        await settle();
        const body = det.getEnabledPane("info").querySelector("collapsible-section .body");
        const block = doc.createElement("div");
        block.style.cssText = "display:block;height:300px;";
        const p2 = det.scrollToPane("related", "instant");
        body.appendChild(block);
        try {
            await p2;
            await settle();
            assert.isTrue(S.armed, "armed: no input reached the pane");
            assert.isAtMost(Math.abs(topIn(det, rel)), TOL() + 1, "Related at the top after the late growth: " + R(topIn(det, rel)));
        }
        finally { block.remove(); await settle(); }
        assert.isAtMost(Math.abs(topIn(det, rel)), TOL() + 1, "and after it went: " + R(topIn(det, rel)));
    });
});
