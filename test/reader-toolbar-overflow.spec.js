/* global describe, it, before, after, assert, Zotero, wvT */
// The reader toolbar collapses what does not fit into a "more" button at its end
// (reader-toolbar-overflow.ts, WV-TEMP-4185). MJT 2026-11-11, a narrow reader whose
// tools ran over its page count: "I remember that dstillman suggested that the icons
// in the toolbar go into a dropdown menu at the end when there is not enough space";
// dstillman, forums.zotero.org/discussion/118746: "In a future update the icons will
// collapse into a submenu automatically"; the plan in zotero/zotero#4185 (plugin items
// and annotation tools first, then zoom, then back / page / view buttons; the page
// number always visible). In every reader, only when the toolbar does not fit.
describe("Weavero — the reader toolbar's overflow menu", function () {
    this.timeout(200000);
    let wv, win, doc, ZT, pdf, prevSplit, ow, oh, ctxWasCollapsed;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    /** @returns {any} */
    const rdoc = (id) => { const r = reader(id); return r && r._iframeWindow && r._iframeWindow.document; };
    const HIDE = "data-wv-tbo-hidden";
    const fmt = (r) => "[" + [r.left, r.top, r.width, r.height].map(Math.round).join(",") + "]";
    /** The toolbar's controls drawn now (dividers apart). */
    function drawn(d) {
        const tb = d.querySelector(".toolbar");
        const out = [];
        for (const g of tb.querySelectorAll(":scope > .start, :scope > .center, :scope > .end")) {
            const walk = (el) => {
                for (const c of el.children) {
                    if (c.classList.contains("custom-sections")) { walk(c); continue; }
                    // The page count's span holds its absolutely placed "/ N" (below).
                    if (c.classList.contains("divider") || c.id === "numPages") continue;
                    const r = c.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) out.push({ el: c, r });
                }
            };
            walk(g);
        }
        // The page count "/ N": Zotero positions it past the start group.
        const np = d.querySelector("#numPages div");
        if (np && np.getBoundingClientRect().width > 0) out.push({ el: np, r: np.getBoundingClientRect() });
        return out;
    }
    const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(700);
        ctxWasCollapsed = win.ZoteroContextPane.collapsed;
        pdf = await wvT.createTestPDFItem("wv-tbo-1");
        await Zotero.Reader.open(pdf.id, null, { openInWindow: false });
        await waitFor(() => tabOfItem(pdf), 20000, "reader tab");
        await waitFor(() => { const d = rdoc(tabOfItem(pdf).id); return d && d.querySelector(".toolbar > .end"); }, 20000, "the toolbar");
        await sleep(800);
    });

    after(async function () {
        if (!win) return;
        try { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); } catch (er) {}
        try { const t = tabOfItem(pdf); if (t) ZT.close(t.id); } catch (er) {}
        await sleep(300);
        try { ZT.select(libTab().id); } catch (er) {}
        try { if (win.ZoteroContextPane.collapsed !== ctxWasCollapsed) win.ZoteroContextPane.collapsed = ctxWasCollapsed; } catch (er) {}
        await wvT.erase(pdf);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(300);
    });

    it("a toolbar that fits is left as it is", async function () {
        const t = tabOfItem(pdf);
        ZT.select(t.id); await sleep(1200);
        const d = rdoc(t.id);
        assert.notOk(d.querySelector("[" + HIDE + "]"), "nothing collapsed at full width");
        const more = d.getElementById("wv-tbo-more");
        assert.ok(!more || win.getComputedStyle(more).display === "none", "no More button shown");
        const items = drawn(d);
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
            assert.notOk(overlaps(items[i].r, items[j].r), "no overlap: " + (items[i].el.id || items[i].el.className) + " / " + (items[j].el.id || items[j].el.className));
        }
    });

    it("at 1200, 800, 600 and 400px: no control over another or cut off, the page field and the pane toggles always shown, the More menu lists exactly the collapsed controls", async function () {
        const L = libTab(), t = tabOfItem(pdf);
        ZT.select(L.id); await sleep(300);
        const s = wv._wvTabSplitCreate(win, L.id, t.id, { select: "right" });
        assert.ok(s, "fixture: a split to size the reader");
        try {
            // Closed: the reader gets its whole card and shows the pane toggle.
            if (!win.ZoteroContextPane.collapsed) win.ZoteroContextPane.togglePane();
            await sleep(800);
            for (const px of [1200, 800, 600, 400]) {
                // The reader `px` wide: the ratio, measured and corrected (the cards'
                // borders and margins take part in the flex share).
                const W = wv._wvTabSplitTotal(win);
                s.ratio = 1 - (px + 2) / W;
                for (let k = 0; k < 4; k++) {
                    wv._wvTabSplitSync(win);
                    await sleep(500);
                    const cur = reader(t.id)._iframe.getBoundingClientRect().width;
                    if (Math.abs(cur - px) < 1) break;
                    s.ratio += (cur - px) / W;
                }
                await sleep(500);
                const fw = reader(t.id)._iframe.getBoundingClientRect().width;
                assert.approximately(fw, px, 3, "fixture: the reader " + px + "px wide");
                const d = rdoc(t.id);
                const items = drawn(d);
                for (const it of items) {
                    assert.isAtLeast(it.r.left, -0.5, px + "px: " + (it.el.id || it.el.className) + " not cut at the start " + fmt(it.r));
                    assert.isAtMost(it.r.right, fw + 0.5, px + "px: " + (it.el.id || it.el.className) + " not cut at the end " + fmt(it.r));
                }
                for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
                    assert.notOk(overlaps(items[i].r, items[j].r), px + "px: " + (items[i].el.id || items[i].el.className) + " " + fmt(items[i].r) + " over " + (items[j].el.id || items[j].el.className) + " " + fmt(items[j].r));
                }
                const shownEl = (sel) => { const e = d.querySelector(sel); return e && e.getBoundingClientRect().width > 0; };
                assert.ok(shownEl("#pageNumber"), px + "px: the page field shown");
                assert.ok(shownEl("#sidebarToggle"), px + "px: the sidebar toggle shown");
                assert.ok(shownEl(".context-pane-toggle"), px + "px: the context-pane toggle shown");
                const hidden = Array.from(d.querySelectorAll(".toolbar [" + HIDE + "]")).filter(e => !e.classList.contains("divider") && !e.classList.contains("custom-sections"));
                const more = d.getElementById("wv-tbo-more");
                if (!hidden.length) { assert.ok(!more || more.getBoundingClientRect().width === 0, px + "px: no More button when nothing is collapsed"); continue; }
                assert.ok(more && more.getBoundingClientRect().width > 0, px + "px: the More button shown");
                const tg = d.querySelector(".context-pane-toggle");
                assert.isBelow(more.getBoundingClientRect().left, tg.getBoundingClientRect().left, px + "px: More before the pane toggle");
                // Its menu: exactly the collapsed controls, in toolbar order.
                more.click(); await sleep(500);
                const pop = await waitFor(() => { const p = doc.getElementById("wv-tbo-menu"); return p && p.state === "open" ? p : null; }, 3000, "the More menu");
                try {
                    const labels = Array.from(pop.querySelectorAll("menuitem")).map(m => m.getAttribute("label"));
                    const want = hidden.map(e => (e.getAttribute("title") || e.getAttribute("aria-label") || (e.textContent || "").trim() || e.id).trim());
                    assert.deepEqual(labels, want, px + "px: the menu lists the collapsed controls");
                }
                finally { pop.hidePopup(); await sleep(200); }
                if (px === 400) {
                    assert.ok(d.querySelector(".toolbar .highlight").hasAttribute(HIDE), "400px: the annotation tools collapsed");
                    assert.ok(d.querySelector("#zoomIn").hasAttribute(HIDE), "400px: zoom collapsed");
                }
            }
            // An entry does what its control does: a tool becomes active, the colour menu opens at the More button.
            const d = rdoc(t.id);
            const ir = reader(t.id)._internalReader;
            const toolBefore = ir._state.tool && ir._state.tool.type;
            d.getElementById("wv-tbo-more").click(); await sleep(500);
            let pop = doc.getElementById("wv-tbo-menu");
            const hl = Array.from(pop.querySelectorAll("menuitem")).find(m => m.getAttribute("label") === d.querySelector(".toolbar .highlight").getAttribute("title"));
            assert.ok(hl, "the highlight tool in the menu");
            hl.doCommand(); pop.hidePopup(); await sleep(500);
            assert.strictEqual(ir._state.tool && ir._state.tool.type, toolBefore === "highlight" ? "pointer" : "highlight", "the menu entry switched the tool");
            d.getElementById("wv-tbo-more").click(); await sleep(500);
            pop = doc.getElementById("wv-tbo-menu");
            const colour = d.querySelector(".toolbar .toolbar-dropdown-button");
            const ce = Array.from(pop.querySelectorAll("menuitem")).find(m => m.getAttribute("label") === colour.getAttribute("title"));
            assert.ok(ce, "the colour picker in the menu");
            // The colour picker opens its menu from its own box (toolbar.js
            // handleToolColorClick reads currentTarget's rect): pressed from the menu,
            // that box is at the More button, not nowhere. (The menu itself does not
            // open for a scripted click in the runner, even on the visible button
            // without Weavero's menu: probe 2026-11-11; MJT's hands check it.)
            let atClick = null;
            const onClick = () => { atClick = colour.getBoundingClientRect(); };
            colour.addEventListener("click", onClick, true);
            try { ce.doCommand(); pop.hidePopup(); await sleep(700); }
            finally { colour.removeEventListener("click", onClick, true); }
            const mr = d.getElementById("wv-tbo-more").getBoundingClientRect();
            assert.ok(atClick && atClick.width > 0, "the colour picker pressed with a box");
            assert.approximately(atClick.left, mr.left, 1, "at the More button");
            assert.approximately(atClick.top, mr.top, 1, "at the More button");
            assert.ok(colour.hasAttribute(HIDE) && !colour.hasAttribute("data-wv-tbo-proxy"), "and hidden again after");
            for (const p of doc.querySelectorAll("menupopup")) { if (p.state === "open" && p.id !== "wv-tbo-menu") { try { p.hidePopup(); } catch (er) {} } }
            if (toolBefore !== "highlight") { try { d.querySelector(".toolbar .highlight").click(); } catch (er) {} }
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
    });

    it("a disable gives the toolbar back whole", async function () {
        const t = tabOfItem(pdf);
        const L = libTab();
        ZT.select(L.id); await sleep(300);
        const s = wv._wvTabSplitCreate(win, L.id, t.id, { select: "right" });
        try {
            if (!win.ZoteroContextPane.collapsed) win.ZoteroContextPane.togglePane();
            const W = wv._wvTabSplitTotal(win);
            s.ratio = 1 - 402 / W; wv._wvTabSplitSync(win); await sleep(1000);
            const d = rdoc(t.id);
            assert.ok(d.querySelector("[" + HIDE + "]"), "fixture: something collapsed at 400px");
            wv._wvTbOverflowTeardown(d);
            assert.notOk(d.querySelector("[" + HIDE + "]"), "no control left hidden");
            assert.notOk(d.getElementById("wv-tbo-more"), "no More button");
            assert.notOk(d.getElementById("wv-tbo-style"), "no stylesheet");
            wv._wvTbOverflowEnsure(reader(t.id), d);
            await sleep(600);
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(300); }
    });
});
