/* global describe, it, before, after, assert, Zotero, wvT */

// Pinned section headers in the item pane (MJT 2026-11-03, "When a section
// becomes too long, I cannot see the header anymore. Can you pin it in the
// same way as in the collections pane?"; intake: every section's header,
// and the part heading under it, stacked; plan "Go"). Each section's head
// sticks to the top of its scroller while its section passes (CSS sticky,
// the section its containing block), over the pane's background, a
// hairline under it while rows pass beneath; a part's heading sticks under
// it at the head's height. Extras option `itemPaneStickyHeaders`. Written
// before the code: every `it` fails on 0.22.3-dev.165.

describe("Weavero — pinned section headers in the item pane", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, P, det, pp, sec, head, probe, group, saved;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvApplyItemPaneStickyHeads", "_wvApplyItemPaneStickyHeadsAll", "_wvTeardownItemPaneStickyHeads", "_wvStickyHeadsMark"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        P = await wvT.createItem("journalArticle", { title: "WVSTICKY paper", abstractNote: "WVSTICKY abstract." });
        await ZP.selectItems([P.id]);
        det = await wvT.waitFor(() => { const d = doc.querySelector("#zotero-item-pane item-details"); return d && d._paneParent && d._paneParent.clientHeight && d.getEnabledPane("info") ? d : null; }, 15000);
        assert.isOk(det, "the library's item pane");
        pp = det._paneParent;
        sec = det.getEnabledPane("info").querySelector("collapsible-section");
        head = sec && sec.querySelector(":scope > .head");
        assert.isOk(head, "the Info section's head");
        saved = { top: pp.scrollTop, open: sec.open };
        sec.open = true;
        // A long Info section: a tall block, then a part group as Item Links
        // draws one (a heading over rows), so a scroll leaves the head and
        // then the heading pinned.
        const body = sec.querySelector(":scope > .body");
        probe = doc.createElement("div");
        probe.className = "wv-sticky-probe";
        probe.style.cssText = "display:block;height:900px;";
        body.appendChild(probe);
        group = doc.createElement("div");
        group.className = "wv-bl-hgroup";
        const h = doc.createElement("div");
        h.className = "wv-count-group-head";
        h.textContent = "WVSTICKY part";
        const row = doc.createElement("div");
        row.className = "wv-bl-row";
        row.style.cssText = "display:block;height:700px;";
        group.appendChild(h);
        group.appendChild(row);
        body.appendChild(group);
    });

    after(async function () {
        try { probe.remove(); group.remove(); } catch (e) {}
        try { wv._wvApplyItemPaneStickyHeads(win); } catch (e) {}
        try { pp.scrollTop = saved.top; sec.open = saved.open; } catch (e) {}
        await wvT.erase(P);
    });

    const cs = (el) => win.getComputedStyle(el);
    const paneTop = () => pp.getBoundingClientRect().top;
    const style = () => doc.getElementById("wv-sticky-heads-styles");
    const scrollTo = async (y) => { pp.scrollTop = y; await wvT.waitFor(() => Math.abs(pp.scrollTop - y) < 2 || null, 2000); await wvT.sleep(60); };
    const headH = () => head.getBoundingClientRect().height;

    it("on by default: the style in the window, every section's head sticky over an opaque background, its height kept on the section", function () {
        assert.isOk(style(), "the stylesheet");
        assert.strictEqual(cs(head).position, "sticky");
        assert.strictEqual(cs(head).top, "0px");
        assert.notInclude(["transparent", "rgba(0, 0, 0, 0)"], cs(head).backgroundColor, "opaque: " + cs(head).backgroundColor);
        assert.closeTo(parseFloat(sec.style.getPropertyValue("--wv-head-h")), headH(), 1, "the head's height on its section");
        for (const s of det.querySelectorAll("collapsible-section")) {
            const hd = s.querySelector(":scope > .head");
            if (hd) assert.strictEqual(cs(hd).position, "sticky", s.dataset.pane + ": sticky");
        }
    });

    it("scrolled into a long section, its head stays at the pane's top, marked; back up, it is not", async function () {
        await scrollTo(300);
        assert.isBelow(sec.getBoundingClientRect().top, paneTop() - 100, "the section's top is above the pane");
        assert.closeTo(head.getBoundingClientRect().top, paneTop(), 1, "its head at the pane's top");
        assert.isOk(await wvT.waitFor(() => head.getAttribute("data-wv-stuck") === "true" || null, 2000), "marked stuck (the hairline)");
        await scrollTo(0);
        assert.isOk(await wvT.waitFor(() => !head.hasAttribute("data-wv-stuck") || null, 2000), "unmarked at the top");
        assert.closeTo(head.getBoundingClientRect().top - paneTop(), sec.getBoundingClientRect().top - paneTop() + 4, 3, "in its place");
    });

    it("a part heading sticks under the section head, at the head's height", async function () {
        const h = group.querySelector(".wv-count-group-head");
        assert.strictEqual(cs(h).position, "sticky");
        assert.closeTo(parseFloat(cs(h).top), headH(), 1, "its top is the head's height");
        // Scrolled so the group's rows pass: the heading under the head.
        const want = group.getBoundingClientRect().top - paneTop() + pp.scrollTop + 300;
        await scrollTo(want);
        assert.isOk(await wvT.waitFor(() => Math.abs(h.getBoundingClientRect().top - (paneTop() + headH())) <= 1.5 || null, 2000), "the heading right under the pinned head: " + (h.getBoundingClientRect().top - paneTop()));
        assert.closeTo(head.getBoundingClientRect().top, paneTop(), 1, "the head still at the top");
        await scrollTo(0);
    });

    it("the option off takes it all away; on again, back; the teardown and the wiring the same", async function () {
        await scrollTo(300);
        await wvT.withPref("weavero.itemPaneStickyHeaders", false, async () => {
            wv._wvApplyItemPaneStickyHeads(win);
            assert.isNull(style(), "no stylesheet");
            assert.strictEqual(cs(head).position, "static");
            assert.strictEqual(sec.style.getPropertyValue("--wv-head-h"), "", "no height kept");
            assert.isFalse(head.hasAttribute("data-wv-stuck"), "no mark");
            assert.isBelow(head.getBoundingClientRect().top, paneTop() - 100, "the head scrolled away with its section -- Zotero's own pane");
        });
        wv._wvApplyItemPaneStickyHeads(win);
        assert.isOk(style(), "the stylesheet back");
        assert.strictEqual(cs(head).position, "sticky");
        assert.closeTo(head.getBoundingClientRect().top, paneTop(), 1, "pinned again");
        wv._wvTeardownItemPaneStickyHeads();
        assert.isNull(style(), "teardown: no stylesheet");
        assert.strictEqual(cs(head).position, "static");
        wv._wvApplyItemPaneStickyHeads(win);
        assert.strictEqual(cs(head).position, "sticky", "wired again");
        await scrollTo(0);
    });

    it("a reader tab's context pane gets it too", async function () {
        const A = await wvT.createTestPDFItem("wvsticky-pdf", { parentItemID: P.id });
        const reader = await wvT.openReaderTab(A.id);
        try {
            const cd = await wvT.waitFor(() => doc.getElementById(reader.tabID + "-context"), 15000);
            assert.isOk(cd, "the tab's item-details");
            const csec = await wvT.waitFor(() => { const s = cd.querySelector("collapsible-section"); return s && s.style.getPropertyValue("--wv-head-h") ? s : null; }, 5000);
            assert.isOk(csec, "its sections carry their head's height");
            const sc = cd.querySelector(".zotero-view-item") || cd._paneParent;
            assert.include(wvT.lib().wvListenKeys(sc).map((k) => k.key), "stickyHeads:scroll", "its scroller watched");
        }
        finally { wvT.closeReaderTab(reader); }
    });
});
