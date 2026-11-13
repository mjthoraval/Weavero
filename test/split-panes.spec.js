/* global describe, it, before, after, assert, Zotero, wvT */
// Split view, inside each side (tab-split.ts; MJT 2026-11-11 on 11.0-beta.4 at 1920x1040,
// a library tab beside a PDF and two PDFs side by side):
//   - "The item pane should probably stay inside the split view on each side": Zotero's ONE
//     context pane stood outside the split at the window's right edge.
//   - "Let me go to a very small width, as long as they can still be dragable": every side's
//     floor is Firefox's --panel-min-width; a library view's panes shrink inside it.
//   - "By default, the side panes for 2 PDF split view should be collapsed ... Put them back
//     as they were before when going back to normal tabs."
//   - "Toggling the panes should not make the position of the separation between split views
//     move".
describe("Weavero — split view: inside each side", function () {
    this.timeout(240000);
    let wv, win, doc, ZT, pdf1, pdf2, pdf3, note, prevSplit, ow, oh;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const deck = () => doc.getElementById("tabs-deck");
    const rectOf = (id) => doc.getElementById(id).getBoundingClientRect();
    const pane = () => doc.getElementById("zotero-context-pane");
    const ghost = () => doc.getElementById("wv-tsplit-ghost");
    const CP = () => win.ZoteroContextPane;
    const splitter = () => doc.querySelector("#wv-tsplit-layer .wv-tsplit-splitter");
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const libView = (id) => doc.getElementById(id).querySelector("library-view") || doc.getElementById(id);
    const viewEl = (id, base) => libView(id).querySelector("#" + base + ", [id^='" + base + "-tab-']");
    /** `a` lies within `b` (client rects), to half a pixel plus `tol`. */
    const within = (a, b, tol = 0.5) => a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
    const fmt = (r) => r ? "[" + [r.left, r.top, r.width, r.height].map(Math.round).join(",") + "]" : "null";
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    /** @returns {any} */
    const rdoc = (id) => { const r = reader(id); return r && r._iframeWindow && r._iframeWindow.document; };
    const frameW = (id) => reader(id)._iframe.getBoundingClientRect().width;
    /** On screen: laid out and hit at its centre (zotero.css hides unselected deck
     *  children only visually, reference_zotero_deck_hidden_only_visually). */
    const hitInside = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return !!(hit && (el === hit || el.contains(hit)));
    };
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        const t = await waitFor(() => tabOfItem(att), 20000, "reader tab");
        return t;
    }
    async function ensureTab(it) {
        if (tabOfItem(it)) return tabOfItem(it);
        if (it.isNote()) { await win.ZoteroPane.openNote(it.id, { openInWindow: false }); return waitFor(() => tabOfItem(it), 15000, "note tab"); }
        return openPDF(it);
    }
    async function readerReady(id) {
        return waitFor(() => { const d = rdoc(id); return d && d.querySelector(".toolbar > .end") ? d : null; }, 20000, "reader toolbar " + id);
    }
    function secondLibTab() {
        if (!wvT.nativeWindows() || typeof ZT.addLibraryTab !== "function") return null;
        const have = ZT._tabs.filter(t => String(t.type).startsWith("library"));
        if (have.length >= 2) return have[1];
        ZT.addLibraryTab({ select: false });
        return ZT._tabs.filter(t => String(t.type).startsWith("library"))[1] || null;
    }
    async function split(a, b, sel) {
        separateAll();
        ZT.select(a); await sleep(300);
        const s = wv._wvTabSplitCreate(win, a, b, { select: sel || "right" });
        assert.ok(s, "fixture: the split");
        await sleep(1200);
        return s;
    }
    /** Right side `px` wide (its card's border box). */
    async function rightAt(s, px) {
        const W = wv._wvTabSplitTotal(win);
        s.ratio = 1 - px / W;
        wv._wvTabSplitSync(win);
        await sleep(700);
    }
    async function setPaneOpen(open) {
        if (CP().collapsed === !open) return;
        CP().togglePane();
        await sleep(700);
    }
    function pointerDrag(sp, dx) {
        const r = sp.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const pe = (type, d) => sp.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
            clientX: x + d, clientY: y, screenX: Math.round(win.mozInnerScreenX + x + d), screenY: Math.round(win.mozInnerScreenY + y), isPrimary: true, pointerType: "mouse" }));
        pe("pointerdown", 0); pe("pointermove", Math.round(dx / 2)); pe("pointermove", dx); pe("pointerup", dx);
    }
    const ctxNormal = {};

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabSplitCreate", "_wvTabSplitSync", "_wvTabSplitSeparate", "_wvTabSplitTotal", "_wvTabSplitMins"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(800);
        // What the user had before any of this (given back in after()).
        ctxNormal.collapsed = CP().collapsed;
        ctxNormal.width = pane().getAttribute("width");
        ctxNormal.sidebar = Zotero.Prefs.get("sidebarState");
        pdf1 = await wvT.createTestPDFItem("wv-sp-1");
        pdf2 = await wvT.createTestPDFItem("wv-sp-2");
        pdf3 = await wvT.createTestPDFItem("wv-sp-3");
        note = new Zotero.Item("note"); note.setNote("<p>wv split panes note</p>"); await note.saveTx();
        for (const it of [pdf1, pdf2, pdf3]) await openPDF(it);
        await ensureTab(note);
        try { ZT.select(libTab().id); } catch (er) {}
        await sleep(500);
    });

    after(async function () {
        if (!win) return;
        try { separateAll(); } catch (er) {}
        for (const it of [pdf1, pdf2, pdf3, note]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        try { const L2 = ZT._tabs.filter(t => String(t.type).startsWith("library"))[1]; if (L2) ZT.close(L2.id); } catch (er) {}
        await sleep(400);
        try { ZT.select(libTab().id); } catch (er) {}
        try { if (CP().collapsed !== ctxNormal.collapsed) CP().collapsed = ctxNormal.collapsed; } catch (er) {}
        try { if (ctxNormal.width == null) pane().removeAttribute("width"); else pane().setAttribute("width", ctxNormal.width); } catch (er) {}
        try { if (ctxNormal.sidebar == null) Zotero.Prefs.clear("sidebarState"); else Zotero.Prefs.set("sidebarState", ctxNormal.sidebar); ZT._sidebarState = null; } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3, note);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(400);
    });

    // ---- 2. Each side keeps its item pane inside its card -------------------------

    it("2. library|PDF: Zotero's context pane is drawn inside the PDF card, at its end, with its side navigation, either side selected; the deck spans the window", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await setPaneOpen(true);
            for (const sel of [t1.id, L.id]) {
                ZT.select(sel); await sleep(900);
                const card = rectOf(t1.id), lib = rectOf(L.id), pr = pane().getBoundingClientRect();
                const hbox = deck().parentNode.getBoundingClientRect();
                assert.approximately(deck().getBoundingClientRect().width, hbox.width, 0.5, sel + " selected: the deck spans the window, no context-pane column outside it");
                assert.isAbove(pr.width, 30, sel + " selected: the pane is open " + fmt(pr));
                assert.ok(within(pr, card, 1), sel + " selected: the pane inside the PDF card " + fmt(pr) + " in " + fmt(card));
                assert.approximately(pr.right, card.right - 1, 1, sel + " selected: at the card's end, inside its border");
                assert.ok(pr.left >= lib.right, sel + " selected: nothing of it over the library card");
                const sn = doc.getElementById("zotero-context-pane-sidenav").getBoundingClientRect();
                assert.ok(sn.width > 30 && within(sn, card, 1), sel + " selected: its side navigation inside the card " + fmt(sn));
                assert.ok(hitInside(pane()), sel + " selected: the pane is on screen (hit at its centre)");
                const sp = doc.getElementById("zotero-context-splitter");
                assert.isBelow(sp.getBoundingClientRect().width, 0.5, sel + " selected: Zotero's splitter takes no column outside the cards");
                assert.isAtMost(reader(t1.id)._iframe.getBoundingClientRect().right, pr.left + 0.5, sel + " selected: the reader ends where the pane starts");
            }
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    it("2. PDF|PDF: the selected side shows Zotero's pane, the other its own item's details at the same place and width; a side switch re-lays out neither reader", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        try {
            // Each side opens its own (item 9): the right, then the left.
            await setPaneOpen(true);
            ZT.select(t1.id); await sleep(800);
            await setPaneOpen(true);
            ZT.select(t2.id); await sleep(800);
            await readerReady(t1.id); await readerReady(t2.id);
            const check = (selID, otherID, otherItem) => {
                const pr = pane().getBoundingClientRect(), g = ghost();
                assert.ok(within(pr, rectOf(selID), 1), "Zotero's pane in the selected card " + fmt(pr));
                assert.ok(g, "the other side's own item pane");
                const gr = g.getBoundingClientRect();
                assert.ok(within(gr, rectOf(otherID), 1), "in the other card " + fmt(gr) + " in " + fmt(rectOf(otherID)));
                assert.approximately(gr.width, pr.width, 0.5, "the same width");
                assert.approximately(gr.right - rectOf(otherID).right, pr.right - rectOf(selID).right, 0.5, "the same place");
                const det = g.querySelector("item-details");
                assert.strictEqual(det && det.item && det.item.id, otherItem.id, "showing that side's item");
                assert.ok(Array.from(det.querySelectorAll("[data-pane]")).some(x => x.getBoundingClientRect().height > 20), "its sections drawn");
                assert.ok(g.querySelector("item-pane-sidenav") && g.querySelector("item-pane-sidenav").getBoundingClientRect().width > 30, "with a side navigation");
                assert.ok(hitInside(g), "on screen");
            };
            check(t2.id, t1.id, pdf1);
            const w1 = frameW(t1.id), w2 = frameW(t2.id);
            ZT.select(t1.id); await sleep(1200);
            check(t1.id, t2.id, pdf2);
            assert.approximately(frameW(t1.id), w1, 0.5, "the left reader keeps its width across the switch");
            assert.approximately(frameW(t2.id), w2, 0.5, "the right reader keeps its width across the switch");
            ZT.select(t2.id); await sleep(1200);
            assert.approximately(frameW(t1.id), w1, 0.5, "and back");
            assert.approximately(frameW(t2.id), w2, 0.5, "and back");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    it("2. closing a side's pane widens that reader only and its toolbar shows the toggle; the toggle opens it again", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        try {
            // Both open, each by its own (item 9).
            await setPaneOpen(true);
            ZT.select(t1.id); await sleep(800);
            await setPaneOpen(true);
            ZT.select(t2.id); await sleep(800);
            const w1 = frameW(t1.id), w2 = frameW(t2.id);
            await setPaneOpen(false);
            assert.notOk(hitInside(pane()), "the right side's pane gone");
            assert.ok(ghost() && hitInside(ghost()), "the left side's own pane stays");
            assert.approximately(frameW(t1.id), w1, 0.5, "the left reader unchanged");
            assert.isAbove(frameW(t2.id), w2 + 30, "the right reader widened");
            await sleep(300);
            assert.ok(rdoc(t2.id).querySelector(".context-pane-toggle"), "the toggle in the right reader's toolbar");
            assert.notOk(rdoc(t1.id).querySelector(".context-pane-toggle"), "none in the left one, its pane open");
            rdoc(t2.id).querySelector(".context-pane-toggle").click();
            await sleep(900);
            assert.isFalse(CP().collapsed, "open again from its toolbar");
            assert.approximately(frameW(t1.id), w1, 0.5, "the left reader unchanged");
            assert.approximately(frameW(t2.id), w2, 0.5, "the right reader back to its width");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    it("2. the pane's width is Zotero's, in both cards: dragging its edge resizes Zotero's own width", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        const w0 = pane().getAttribute("width");
        try {
            await setPaneOpen(true);
            const pw = pane().getBoundingClientRect().width;
            const h = doc.querySelector("#wv-tsplit-layer .wv-tsplit-pane-handle");
            assert.ok(h, "a handle on the pane's edge");
            const hr = h.getBoundingClientRect(), pr = pane().getBoundingClientRect();
            assert.ok(hr.left <= pr.left + 0.5 && hr.right >= pr.left - 0.5, "on the pane's start edge " + fmt(hr) + " / " + fmt(pr));
            pointerDrag(h, -60); await sleep(500);
            const pw2 = pane().getBoundingClientRect().width;
            assert.approximately(pw2, pw + 60, 2, "60px wider");
            assert.approximately(Number(pane().getAttribute("width")), pw2, 1.5, "Zotero's own width (its persisted attribute)");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id);
            if (w0 == null) pane().removeAttribute("width"); else pane().setAttribute("width", w0);
            try { CP().update(); } catch (er) {}
        }
    });

    it("2. an unsplit tab gets Zotero's context pane back exactly", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        ZT.select(t1.id); await sleep(800);
        await setPaneOpen(true);
        const snap = () => ({ style: pane().getAttribute("style"), r: fmt(pane().getBoundingClientRect()), sp: fmt(doc.getElementById("zotero-context-splitter").getBoundingClientRect()), deck: fmt(deck().getBoundingClientRect()), frame: Math.round(frameW(t1.id)) });
        const before = snap();
        const s = await split(t1.id, t2.id, "left");
        await setPaneOpen(true);
        wv._wvTabSplitSeparate(win, s.id);
        await sleep(900);
        assert.deepEqual(snap(), before, "Zotero's pane, splitter and deck as before the split");
        assert.notOk(ghost(), "no other-side pane left");
        assert.notOk(Array.from(pane().attributes).some(a => /^wv-|^data-wv/.test(a.name)), "no Weavero attribute on Zotero's pane");
    });

    it("2. a disable while a PDF|PDF split is on screen leaves no Weavero mark on Zotero's pane or the cards", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        await setPaneOpen(true);
        try {
            wv._wvTabSplitUnwireAll();
            await sleep(500);
            assert.notOk(/--wv/.test(pane().getAttribute("style") || ""), "no Weavero property on Zotero's pane: " + pane().getAttribute("style"));
            assert.notOk(ghost(), "no other-side pane");
            for (const id of [t1.id, t2.id]) assert.notOk(/--wv/.test(doc.getElementById(id).getAttribute("style") || ""), "no Weavero property on the card " + id);
            assert.strictEqual(win.getComputedStyle(pane()).position, "static", "Zotero's pane back in its column");
        }
        finally {
            win._wvTSplits = [];
            wv._wvTabSplitRegisterMenus();
            wv._wvTabSplitWire(win);
            void s;
        }
    });

    // ---- 4. Firefox's floor for every side; a library side's panes shrink -------

    it("4. every side's floor is Firefox's 140px (plus the card's border), whatever it shows", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), tn = tabOfItem(note);
        const L2 = secondLibTab();
        const pairs = [[L.id, t1.id], [t1.id, t2.id], [tn.id, t1.id]];
        if (L2) pairs.push([L.id, L2.id]);
        try {
            for (const [a, b] of pairs) {
                const s = await split(a, b, "left");
                assert.deepEqual(wv._wvTabSplitMins(win, s).map(Math.round), [142, 142], a + "|" + b);
                wv._wvTabSplitSeparate(win, s.id);
            }
        }
        finally { if (L2) { try { ZT.close(L2.id); } catch (er) {} } }
    });

    it("4. a library side dragged to the floor: its panes shrink inside the card, its side navigation stays whole, the splitter stays grabbable, and dragging back gives each pane its exact width", async function () {
        const L = libTab(), L2 = secondLibTab();
        const other = L2 || tabOfItem(pdf1);
        ZT.select(L.id); await sleep(800);
        const alone = { coll: viewEl(L.id, "zotero-collections-pane").getBoundingClientRect().width, ip: viewEl(L.id, "zotero-item-pane").getBoundingClientRect().width };
        const s = await split(L.id, other.id, "left");
        try {
            s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(800);
            const half = { coll: viewEl(L.id, "zotero-collections-pane").getBoundingClientRect().width, ip: viewEl(L.id, "zotero-item-pane").getBoundingClientRect().width };
            pointerDrag(splitter(), -3000); await sleep(800);
            const card = rectOf(L.id);
            assert.approximately(card.width, 142, 2.5, "the left side at the floor");
            for (const base of ["zotero-collections-pane", "zotero-items-pane-container", "zotero-item-pane"]) {
                const r = viewEl(L.id, base).getBoundingClientRect();
                if (r.width > 0) assert.ok(within(r, card, 1), base + " inside the card " + fmt(r) + " in " + fmt(card));
            }
            const sn = libView(L.id).querySelector(".zotero-view-item-sidenav").getBoundingClientRect();
            assert.approximately(sn.width, 37, 1, "the side navigation whole");
            assert.ok(within(sn, card, 1), "inside the card " + fmt(sn));
            const sp = splitter(), spr = sp.getBoundingClientRect();
            const hit = doc.elementFromPoint(Math.round(spr.left + spr.width / 2), Math.round(spr.top + spr.height / 2));
            assert.strictEqual(hit, sp, "the splitter still grabbable");
            // Back: the same ratio gives each pane its width again.
            s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(800);
            assert.approximately(viewEl(L.id, "zotero-collections-pane").getBoundingClientRect().width, half.coll, 0.5, "the collections pane back to its width");
            assert.approximately(viewEl(L.id, "zotero-item-pane").getBoundingClientRect().width, half.ip, 0.5, "the item pane back to its width");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id);
            if (L2) { try { ZT.close(L2.id); } catch (er) {} }
        }
        ZT.select(L.id); await sleep(800);
        assert.approximately(viewEl(L.id, "zotero-collections-pane").getBoundingClientRect().width, alone.coll, 0.5, "unsplit: Zotero's collections pane width");
        assert.approximately(viewEl(L.id, "zotero-item-pane").getBoundingClientRect().width, alone.ip, 0.5, "unsplit: Zotero's item pane width");
    });

    it("4. a reader side at the floor: the reader yields first, then its item pane, whose side navigation stays whole in the card", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await setPaneOpen(true);
            pointerDrag(splitter(), 3000); await sleep(800);
            const card = rectOf(t1.id);
            assert.approximately(card.width, 142, 2.5, "the reader side at the floor");
            const pr = pane().getBoundingClientRect();
            assert.ok(within(pr, card, 1), "the pane inside the card " + fmt(pr) + " in " + fmt(card));
            const sn = doc.getElementById("zotero-context-pane-sidenav").getBoundingClientRect();
            assert.approximately(sn.width, 37, 1, "its side navigation whole");
            assert.ok(within(sn, card, 1), "inside the card");
            assert.isAtMost(frameW(t1.id), 1, "the reader gave way first");
            // The pane closed: the reader alone in the card, at the floor too (a
            // reader's frame held its side at ~416px while nothing gave it a
            // minimum of 0, run probe4 2026-11-11).
            await setPaneOpen(false);
            s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(500);
            pointerDrag(splitter(), 3000); await sleep(800);
            assert.approximately(rectOf(t1.id).width, 142, 2.5, "the pane closed: the reader side at the floor");
            assert.approximately(frameW(t1.id), rectOf(t1.id).width - 2, 1, "the reader fills it");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await setPaneOpen(true); }
    });

    it("4. a note side at the floor keeps its toolbar's context-pane toggle inside the card", async function () {
        // Better Notes adds its own buttons to the note toolbar: at this width
        // the toggle then sits past the card's edge (companion run 2026-11-13,
        // toggle at x 2053-2081, the card ending at 1900). Known limit, in the
        // tracking registers; the case stands for Zotero's own toolbar.
        let bnOn = false;
        try {
            const AMm = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
            const bn = await AMm.getAddonByID("Knowledge4Zotero@windingwind.com");
            bnOn = !!(bn && bn.isActive);
        }
        catch (e) {}
        if (bnOn) this.skip();
        const L = libTab(), tn = tabOfItem(note);
        const s = await split(L.id, tn.id, "left");
        try {
            await setPaneOpen(false);
            await rightAt(s, 142);
            const ne = doc.getElementById(tn.id).querySelector("note-editor");
            // Zotero's own frame: Better Notes puts its outline frame first (companion run, 2026-11-13).
            const ifr = ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
            const tg = await waitFor(() => ifr.contentDocument.querySelector(".toolbar-button-toggleContextPane"), 8000, "the note toggle");
            const card = rectOf(tn.id), fr = ifr.getBoundingClientRect(), tr = tg.getBoundingClientRect();
            const abs = { left: fr.left + tr.left, right: fr.left + tr.right, top: fr.top + tr.top, bottom: fr.top + tr.bottom };
            assert.ok(within(abs, card, 1), "the note's toggle inside its card " + JSON.stringify(abs) + " in " + fmt(card));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await setPaneOpen(true); }
    });

    // ---- 6. A reader|reader split keeps its own side panes, closed at first ------

    const sidebarOpen = (id) => { const r = reader(id); return !!(r && r._internalReader && r._internalReader._state && r._internalReader._state.sidebarOpen); };
    const sidebarWidth = (id) => { const r = reader(id); return r && r._internalReader && r._internalReader._state && r._internalReader._state.sidebarWidth; };
    const persisted = () => { win.ZoteroPane.serializePersist(); return JSON.parse(String(Zotero.Prefs.get("pane.persist") || "{}")); };
    const sbPref = () => JSON.parse(String(Zotero.Prefs.get("sidebarState") || "{}")).reader || {};

    it("6. a reader|reader split shows its readers without side panes at first, keeps its own, and gives the normal ones back outside it, widths too; Zotero's saved values stay the normal ones", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3);
        // The normal state: the item pane open at 420px, the reader sidebar open at 260px.
        ZT.select(t3.id); await sleep(900);
        await readerReady(t3.id);
        await setPaneOpen(true);
        pane().setAttribute("width", "420"); CP().update(); await sleep(300);
        ZT.updateSidebarLayout({ width: 260 });
        reader(t3.id)._updateLayout(); await sleep(500);
        assert.isTrue(sidebarOpen(t3.id), "fixture: the reader sidebar open");
        const normalPane = pane().getBoundingClientRect().width;
        const s = await split(t1.id, t2.id, "right");
        try {
            await readerReady(t1.id); await readerReady(t2.id); await sleep(500);
            assert.isTrue(CP().collapsed, "the item pane closed in the split");
            assert.isFalse(sidebarOpen(t1.id), "the left reader's sidebar closed");
            assert.isFalse(sidebarOpen(t2.id), "the right reader's sidebar closed");
            let pp = persisted();
            assert.strictEqual(pp["zotero-context-splitter"] && pp["zotero-context-splitter"].state, "open", "saved: the normal pane state " + JSON.stringify(pp));
            assert.strictEqual(pp["zotero-context-pane"] && pp["zotero-context-pane"].width, "420", "saved: the normal pane width");
            assert.strictEqual(sbPref().open, true, "saved: the normal sidebar open");
            assert.strictEqual(sbPref().width, 260, "saved: the normal sidebar width");
            // The user opens both in the split: the split's state from now on.
            await setPaneOpen(true);
            rdoc(t2.id).querySelector("#sidebarToggle").click(); await sleep(700);
            assert.isTrue(sidebarOpen(t2.id), "the sidebar opened in the split");
            assert.isFalse(sidebarOpen(t1.id), "the left reader's own sidebar stays closed (item 9)");
            assert.strictEqual(sbPref().open, true, "the normal sidebar state untouched");
            pp = persisted();
            assert.strictEqual(pp["zotero-context-pane"] && pp["zotero-context-pane"].width, "420", "saved: still the normal width");
            const w1 = frameW(t1.id), w2 = frameW(t2.id);
            ZT.select(t1.id); await sleep(1000);
            assert.isTrue(sidebarOpen(t2.id) && !sidebarOpen(t1.id) && CP().collapsed, "a side switch: each side its own (the left one's pane and sidebar closed)");
            assert.approximately(frameW(t1.id), w1, 0.5, "the left reader not re-laid out");
            assert.approximately(frameW(t2.id), w2, 0.5, "the right reader not re-laid out");
            // Leave: the normal state, widths too.
            ZT.select(t3.id); await sleep(1000);
            assert.isFalse(CP().collapsed, "outside: the pane open, as before");
            assert.strictEqual(pane().getAttribute("width"), "420", "outside: its width");
            assert.approximately(pane().getBoundingClientRect().width, normalPane, 0.5, "outside: drawn at its width");
            assert.isTrue(sidebarOpen(t3.id), "outside: the reader sidebar open");
            assert.strictEqual(sidebarWidth(t3.id), 260, "outside: at its width");
            // Close everything outside: does not leak into the split.
            ZT.updateSidebarLayout({ width: false }); reader(t3.id)._updateLayout(); await sleep(400);
            // Back: the split's own state.
            ZT.select(t2.id); await sleep(1000);
            assert.isFalse(CP().collapsed, "back in the split: the right side's pane open");
            assert.isTrue(sidebarOpen(t2.id) && !sidebarOpen(t1.id), "back in the split: each reader's own sidebar");
            assert.ok(JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).some(r => r.p), "the split's own state in its restart record");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id);
            await sleep(600);
        }
        // Separated: both readers back to the normal state (closed, from the outside change).
        assert.isFalse(sidebarOpen(t1.id), "separated: the normal (closed) sidebar on the left reader");
        assert.isFalse(sidebarOpen(t2.id), "separated: and on the right one");
        ZT.updateSidebarLayout({ width: 240 }); ZT.updateSidebarLayout({ width: false });
    });

    // (A library|reader split's reader side: closed at first too, since item 14 -- below.)

    // ---- 8. A pane toggle never moves the divider -------------------------------

    it("8. toggling any pane, through Zotero's own commands, never moves the divider (library|library, library|reader, reader|reader)", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const L2 = secondLibTab();
        const pairs = [["library|reader", L.id, t1.id], ["reader|reader", t1.id, t2.id]];
        if (L2) pairs.unshift(["library|library", L.id, L2.id]);
        const x = () => splitter().getBoundingClientRect().left;
        try {
            for (const [name, a, b] of pairs) {
                const s = await split(a, b, "right");
                const x0 = x();
                await sleep(1500);
                assert.approximately(x(), x0, 0.5, name + ": settled where it appeared (the split's own pane state applied without a move)");
                for (const side of [a, b]) {
                    ZT.select(side); await sleep(800);
                    assert.approximately(x(), x0, 0.5, name + ": selecting " + side);
                    const toggles = [];
                    const t = ZT._tabs.find(tt => tt.id === side);
                    if (String(t.type).startsWith("library")) {
                        // View -> Layout -> Collections Pane (standalone.js onViewMenuItemClick).
                        toggles.push(["collections pane", () => /** @type {any} */ (doc.getElementById("view-menuitem-collections-pane")).doCommand()]);
                        toggles.push(["tag selector", () => win.ZoteroPane.toggleTagSelector()]);
                        toggles.push(["item pane", () => win.ZoteroPane.toggleItemPane()]);
                        toggles.push(["item pane by its side navigation", () => libView(side).querySelector('.zotero-view-item-sidenav [data-action="toggle-pane"]').doCommand()]);
                    }
                    else {
                        toggles.push(["reader sidebar", () => rdoc(side).querySelector("#sidebarToggle").click()]);
                        toggles.push(["context pane", () => CP().togglePane()]);
                    }
                    for (const [what, fn] of toggles) {
                        for (let i = 0; i < 2; i++) {
                            fn(); await sleep(700);
                            assert.approximately(x(), x0, 0.5, name + ": " + what + " toggled on " + side + " (" + (i ? "back" : "once") + ")");
                        }
                    }
                }
                wv._wvTabSplitSeparate(win, s.id);
            }
        }
        finally { if (L2) { try { ZT.close(L2.id); } catch (er) {} } }
    });

    // ---- 9. Each side of a split keeps its own panes ---------------------------
    // MJT 2026-11-11 on l10n.9, a PDF|PDF split with both item panes open at once: "I
    // should be able to open the panes independantly in each side. The opening and
    // closing of panes should be independant also from the opening state in normal tabs."

    /** The item pane drawn in card `id` (Zotero's or the other side's own). */
    const paneIn = (id) => {
        const card = rectOf(id);
        for (const el of [pane(), ghost()]) {
            if (!el || !hitInside(el)) continue;
            if (within(el.getBoundingClientRect(), card, 1)) return true;
        }
        return false;
    };

    it("9. a reader|reader split: each side opens and closes its own item pane and its own sidebar; a side switch, leaving and coming back keep both; normal tabs and Zotero's saved values untouched; the divider still", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3);
        // The normal state: the item pane closed, the sidebar closed.
        ZT.select(t3.id); await sleep(800);
        await readerReady(t3.id);
        await setPaneOpen(false);
        ZT.updateSidebarLayout({ width: false }); reader(t3.id)._updateLayout(); await sleep(300);
        const normalPersist = JSON.stringify(persisted()["zotero-context-splitter"] || null);
        const normalSb = JSON.stringify(sbPref());
        const s = await split(t1.id, t2.id, "right");
        const x = () => splitter().getBoundingClientRect().left;
        try {
            await readerReady(t1.id); await readerReady(t2.id); await sleep(400);
            const x0 = x();
            assert.isFalse(paneIn(t1.id) || paneIn(t2.id), "fixture: both closed at first");
            // The right side opens its item pane: the left one stays closed.
            await setPaneOpen(true);
            assert.ok(paneIn(t2.id), "the right side's pane open");
            assert.notOk(paneIn(t1.id), "the left side's pane still closed");
            assert.ok(rdoc(t1.id).querySelector(".context-pane-toggle"), "the left reader still offers its toggle");
            // The left side's own toggle: its pane opens, the right one stays open.
            rdoc(t1.id).querySelector(".context-pane-toggle").click(); await sleep(900);
            assert.ok(paneIn(t1.id), "the left side's pane open from its own toggle");
            assert.ok(paneIn(t2.id), "the right one unchanged");
            // The right side closes its own: the left one stays open.
            ZT.select(t2.id); await sleep(800);
            assert.ok(paneIn(t1.id) && paneIn(t2.id), "a side switch keeps both open");
            await setPaneOpen(false);
            assert.notOk(paneIn(t2.id), "the right side's pane closed");
            assert.ok(paneIn(t1.id), "the left one still open");
            // The sidebar, each reader its own, both ways.
            rdoc(t2.id).querySelector("#sidebarToggle").click(); await sleep(700);
            assert.isTrue(sidebarOpen(t2.id), "the right reader's sidebar open");
            assert.isFalse(sidebarOpen(t1.id), "the left reader's sidebar still closed");
            ZT.select(t1.id); await sleep(800);
            rdoc(t1.id).querySelector("#sidebarToggle").click(); await sleep(700);
            rdoc(t2.id).querySelector("#sidebarToggle").click(); await sleep(700);
            assert.isTrue(sidebarOpen(t1.id), "the left reader's sidebar open");
            assert.isFalse(sidebarOpen(t2.id), "the right reader's sidebar closed again, the left one stays");
            const w1 = frameW(t1.id), w2 = frameW(t2.id);
            const want = { p1: paneIn(t1.id), p2: paneIn(t2.id), s1: sidebarOpen(t1.id), s2: sidebarOpen(t2.id) };
            // Saved values: the normal ones.
            assert.strictEqual(JSON.stringify(persisted()["zotero-context-splitter"] || null), normalPersist, "Zotero's saved pane state is the normal one");
            assert.strictEqual(JSON.stringify(sbPref()), normalSb, "Zotero's saved sidebar state is the normal one");
            // Side switches keep each side's own, readers not re-laid out.
            for (const sel of [t2.id, t1.id, t2.id]) {
                ZT.select(sel); await sleep(900);
                assert.deepEqual({ p1: paneIn(t1.id), p2: paneIn(t2.id), s1: sidebarOpen(t1.id), s2: sidebarOpen(t2.id) }, want, "after selecting " + (sel === t1.id ? "left" : "right"));
                assert.approximately(frameW(t1.id), w1, 0.5, "the left reader not re-laid out");
                assert.approximately(frameW(t2.id), w2, 0.5, "the right reader not re-laid out");
                assert.approximately(x(), x0, 0.5, "the divider still");
            }
            // Leave: the normal state; come back: each side's own.
            ZT.select(t3.id); await sleep(900);
            assert.isTrue(CP().collapsed, "outside: the normal pane state (closed)");
            assert.isFalse(sidebarOpen(t3.id), "outside: the normal sidebar (closed)");
            ZT.select(t1.id); await sleep(1000);
            assert.deepEqual({ p1: paneIn(t1.id), p2: paneIn(t2.id), s1: sidebarOpen(t1.id), s2: sidebarOpen(t2.id) }, want, "back in the split: each side's own");
            assert.approximately(x(), x0, 0.5, "the divider still after all of it");
            const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).find(r => r.p);
            assert.ok(rec && rec.p.left && rec.p.right && rec.p.left.ctx !== undefined, "each side's own state in the restart record: " + JSON.stringify(rec && rec.p));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(500); }
        assert.strictEqual(JSON.stringify(persisted()["zotero-context-splitter"] || null), normalPersist, "separated: Zotero's saved pane state the normal one");
    });

    it("9. a library|reader split: the reader side's item pane is its own, the library side's item pane too", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        const ip = () => libView(L.id).querySelector("item-pane");
        try {
            await setPaneOpen(true);
            const libCollapsed = !!ip().collapsed;
            await setPaneOpen(false);
            assert.notOk(paneIn(t1.id), "the reader side's pane closed");
            assert.strictEqual(!!ip().collapsed, libCollapsed, "the library side's item pane unchanged");
            ZT.select(L.id); await sleep(700);
            win.ZoteroPane.toggleItemPane(); await sleep(500);
            assert.notOk(paneIn(t1.id), "the library's toggle leaves the reader side's pane closed");
            win.ZoteroPane.toggleItemPane(); await sleep(500);
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
    });

    // MJT 2026-11-11: "Same for pinning the item pane sections. In split view, they
    // should behave independantly on each side, and separate from what they are in
    // the normal tabs." Zotero keeps a library view's pin as the window's setting
    // (itemDetails.js _savePinnedPane / _restorePinnedPane: Prefs.setForWindow
    // 'pinnedPane'), and carries the reader context pane's from tab to tab
    // (contextPane.js _selectItemContext).
    const cpInner = () => /** @type {any} */ (doc.getElementById("zotero-context-pane-inner"));
    const ctxPin = (id) => { const d = cpInner()._getItemContext(id); return d ? (d.pinnedPane || "") : null; };
    const ghostPin = () => { const g = ghost(); const d = g && g.querySelector("item-details"); return d ? (d.pinnedPane || "") : null; };
    const winPin = () => { const P = /** @type {any} */ (Zotero.Prefs); return (typeof P.getForWindow === "function" ? P.getForWindow(win, "pinnedPane") : P.get("pinnedPane")) || ""; };
    const waitPin = (fn, want, what) => waitFor(() => fn() === want, 4000, what).catch(() => { assert.strictEqual(fn(), want, what); });

    it("9b. reader|reader: each side keeps its own pinned section; normal tabs and the window's saved pin untouched", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3);
        ZT.select(t3.id); await sleep(800);
        await setPaneOpen(true);
        await waitFor(() => cpInner()._getItemContext(t3.id), 5000, "the normal tab's item pane");
        cpInner()._getItemContext(t3.id).pinnedPane = ""; await sleep(300);
        const normalWin = winPin();
        const s = await split(t1.id, t2.id, "right");
        try {
            // Both sides' panes open, each by its own.
            await setPaneOpen(true);
            ZT.select(t1.id); await sleep(800); await setPaneOpen(true);
            ZT.select(t2.id); await sleep(900);
            await waitFor(() => cpInner()._getItemContext(t2.id), 5000, "the right side's item pane");
            cpInner()._getItemContext(t2.id).pinnedPane = "tags"; await sleep(500);
            ZT.select(t1.id); await sleep(1000);
            assert.notStrictEqual(ctxPin(t1.id), "tags", "the left side does not take the right one's pin");
            cpInner()._getItemContext(t1.id).pinnedPane = "libraries-collections"; await sleep(500);
            await waitPin(ghostPin, "tags", "the right side's own pane keeps its pin");
            ZT.select(t2.id); await sleep(1000);
            await waitPin(() => ctxPin(t2.id), "tags", "back on the right: its pin");
            await waitPin(ghostPin, "libraries-collections", "the left side's own pane: its pin");
            // Leave: the normal tab's pin; come back: each side's own.
            ZT.select(t3.id); await sleep(1000);
            await waitPin(() => ctxPin(t3.id), "", "outside: the normal tab's pin (none)");
            assert.strictEqual(winPin(), normalWin, "the window's saved pin untouched");
            ZT.select(t1.id); await sleep(1000);
            await waitPin(() => ctxPin(t1.id), "libraries-collections", "back in the split: the left side's pin");
            await waitPin(ghostPin, "tags", "and the right side's");
            const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).find(r => r.p && r.p.left);
            assert.ok(rec && rec.p.left.pin === "libraries-collections" && rec.p.right.pin === "tags", "each side's pin in the restart record: " + JSON.stringify(rec && rec.p));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
        assert.strictEqual(winPin(), normalWin, "separated: the window's saved pin untouched");
    });

    it("9b. two library sides keep their own pinned sections; the window's saved pin untouched", async function () {
        if (!wvT.nativeWindows()) this.skip();   // an older Zotero has one library tab
        const L = libTab(), L2 = secondLibTab();
        const det = (id) => libView(id).querySelector("#zotero-item-pane item-details, [id^='zotero-item-pane-tab-'] item-details");
        ZT.select(L.id); await sleep(700);
        await win.ZoteroPane.selectItem(pdf1.id); await sleep(500);
        ZT.select(L2.id); await sleep(900);
        await win.ZoteroPane.selectItem(pdf2.id); await sleep(500);
        ZT.select(L.id); await sleep(500);
        const normalWin = winPin();
        const s = await split(L.id, L2.id, "left");
        try {
            det(L.id).pinnedPane = "tags"; await sleep(400);
            ZT.select(L2.id); await sleep(800);
            assert.notStrictEqual(det(L2.id).pinnedPane || "", "tags", "the right library side does not take the left one's pin");
            det(L2.id).pinnedPane = "libraries-collections"; await sleep(400);
            assert.strictEqual(det(L.id).pinnedPane || "", "tags", "the left one keeps its own");
            ZT.select(L.id); await sleep(800);
            assert.strictEqual(det(L.id).pinnedPane || "", "tags");
            assert.strictEqual(det(L2.id).pinnedPane || "", "libraries-collections");
            assert.strictEqual(winPin(), normalWin, "the window's saved pin untouched");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id); await sleep(500);
            try { ZT.close(L2.id); } catch (er) {}
        }
        assert.strictEqual(winPin(), normalWin, "separated: the window's saved pin untouched");
        assert.strictEqual(det(L.id).pinnedPane || "", normalWin, "separated: the library tab back to the window's pin");
    });

    // ---- 13. Each side its own item pane width -----------------------------------
    // MJT 2026-11-11, on "the item pane width is shared by the two sides of a split":
    // "Allow different width for each side".
    const handle = () => doc.querySelector("#wv-tsplit-layer .wv-tsplit-pane-handle");
    /** The width of the item pane drawn in card `id` (Zotero's or the other side's own). */
    const paneWIn = (id) => {
        const card = rectOf(id);
        for (const el of [pane(), ghost()]) {
            if (!el || !hitInside(el)) continue;
            const r = el.getBoundingClientRect();
            if (within(r, card, 1)) return r.width;
        }
        return 0;
    };

    it("13. a reader|reader split: each side keeps its own item pane width; side switches, leaving and coming back, and a restart keep both exactly; Zotero's saved width stays the normal one; the divider still", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3);
        // The normal state: the item pane open at 400px.
        ZT.select(t3.id); await sleep(800);
        await setPaneOpen(true);
        pane().setAttribute("width", "400"); CP().update(); await sleep(300);
        await split(t1.id, t2.id, "right");
        const x = () => splitter().getBoundingClientRect().left;
        const savedW = () => { const p = persisted()["zotero-context-pane"]; return p && p.width; };
        try {
            await readerReady(t1.id); await readerReady(t2.id);
            // Each side opens its own pane and drags its own edge: the right one wider,
            // then the left one narrower.
            await setPaneOpen(true);
            pointerDrag(handle(), -80); await sleep(600);
            ZT.select(t1.id); await sleep(900);
            await setPaneOpen(true);
            pointerDrag(handle(), 40); await sleep(600);
            const wL = paneWIn(t1.id), wR = paneWIn(t2.id);
            assert.isAbove(wL, 300, "fixture: the left side's pane open " + wL);
            assert.isAbove(Math.abs(wL - wR), 60, "different widths on the two sides: " + wL + " / " + wR);
            assert.approximately(wR, 480, 2, "the right side kept its width while the left one was dragged");
            assert.strictEqual(savedW(), "400", "Zotero's saved width: the normal one");
            const w1 = frameW(t1.id), w2 = frameW(t2.id), x0 = x();
            const same = (what) => {
                assert.approximately(paneWIn(t1.id), wL, 1, what + ": the left side's width");
                assert.approximately(paneWIn(t2.id), wR, 1, what + ": the right side's width");
            };
            // Side switches, twice each way.
            for (const sel of [t2.id, t1.id, t2.id, t1.id]) {
                ZT.select(sel); await sleep(1000);
                const what = "after selecting the " + (sel === t1.id ? "left" : "right");
                same(what);
                assert.approximately(frameW(t1.id), w1, 0.5, what + ": the left reader not re-laid out");
                assert.approximately(frameW(t2.id), w2, 0.5, what + ": the right reader not re-laid out");
                assert.approximately(x(), x0, 0.5, what + ": the divider still");
                assert.strictEqual(savedW(), "400", what + ": Zotero's saved width the normal one");
            }
            // Leave: the normal width; come back: each side's own.
            ZT.select(t3.id); await sleep(1000);
            assert.strictEqual(pane().getAttribute("width"), "400", "outside: the normal width");
            assert.approximately(pane().getBoundingClientRect().width, 400, 1, "outside: drawn at it");
            ZT.select(t2.id); await sleep(1000);
            same("back in the split");
            // A restart: the record re-forms the split with each side's width.
            const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).find(r => r.p && r.p.left);
            assert.ok(rec && Math.abs(rec.p.left.ctxW - wL) <= 1 && Math.abs(rec.p.right.ctxW - wR) <= 1, "each side's width in the restart record: " + JSON.stringify(rec && rec.p));
            win._wvTSplits = [];
            wv._wvTabSplitSync(win); await sleep(600);
            Zotero.Prefs.set("weavero.tabSplits", JSON.stringify([rec]));
            wv._wvTSplitPending = null;   // what a start reads: the pref
            wv._wvTabSplitRestore(win); await sleep(400);
            assert.ok((win._wvTSplits || []).some(r => r.left === t1.id && r.right === t2.id), "re-formed");
            ZT.select(t1.id); await sleep(1200);
            same("after a restart");
            assert.strictEqual(savedW(), "400", "after a restart: Zotero's saved width the normal one");
        }
        finally { separateAll(); await sleep(500); }
        // A record of 1.0.5-splitpane.5 (one width for the split) gives it to both sides.
        const old = wv._wvTabSplitPanesOf({ p: { ctxW: 455, left: { ctx: true, sb: false, sbW: null }, right: { ctx: false, sb: true, sbW: 250 } } });
        assert.strictEqual(old && old.left && old.left.ctxW, 455, "a splitpane.5 record: the left side's width");
        assert.strictEqual(old && old.right && old.right.ctxW, 455, "a splitpane.5 record: the right side's width");
    });

    // ---- 14. library|reader: the reader side starts with its panes closed ---------
    // MJT 2026-11-11, on "the reader side starts from the normal state when the split
    // forms, then is its own": "Start with panes closed".

    it("14. a library|reader split: the reader side starts with its panes closed and no pin, then keeps its own (width too); normal tabs keep theirs", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), t3 = tabOfItem(pdf3);
        // The normal state: the item pane open at 400px with a pinned section, the
        // reader sidebar open.
        ZT.select(t3.id); await sleep(800);
        await readerReady(t3.id);
        await setPaneOpen(true);
        pane().setAttribute("width", "400"); CP().update(); await sleep(300);
        ZT.updateSidebarLayout({ width: 250 }); reader(t3.id)._updateLayout(); await sleep(400);
        assert.isTrue(sidebarOpen(t3.id), "fixture: the normal sidebar open");
        await waitFor(() => cpInner()._getItemContext(t3.id), 5000, "the normal tab's item pane");
        cpInner()._getItemContext(t3.id).pinnedPane = "tags"; await sleep(300);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id); await sleep(500);
            assert.isTrue(CP().collapsed, "the reader side's item pane closed");
            assert.notOk(paneIn(t1.id), "nothing drawn in the reader card");
            assert.isFalse(sidebarOpen(t1.id), "the reader side's sidebar closed");
            ZT.select(L.id); await sleep(800);
            assert.notOk(paneIn(t1.id), "the library selected: still closed");
            // The reader side opens its pane: no pin of the normal tabs', its own width.
            ZT.select(t1.id); await sleep(800);
            await setPaneOpen(true);
            assert.ok(paneIn(t1.id), "opened");
            await waitPin(() => ctxPin(t1.id), "", "no pin of the normal tabs'");
            pointerDrag(handle(), -70); await sleep(600);
            const wR = paneWIn(t1.id);
            assert.approximately(wR, 470, 2, "dragged to its own width");
            // Leave: the normal state; come back: the side's own.
            ZT.select(t3.id); await sleep(1000);
            assert.isFalse(CP().collapsed, "outside: the normal pane open");
            assert.strictEqual(pane().getAttribute("width"), "400", "outside: at its normal width");
            assert.isTrue(sidebarOpen(t3.id), "outside: the normal sidebar open");
            await waitPin(() => ctxPin(t3.id), "tags", "outside: the normal pin");
            ZT.select(t1.id); await sleep(1000);
            assert.ok(paneIn(t1.id), "back: the reader side's pane still open");
            assert.approximately(paneWIn(t1.id), wR, 1, "back: at its own width");
            assert.isFalse(sidebarOpen(t1.id), "back: its sidebar still closed");
            ZT.select(L.id); await sleep(800);
            assert.approximately(paneWIn(t1.id), wR, 1, "the library selected: the reader side at its own width");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(500); }
        ZT.select(t3.id); await sleep(900);
        assert.isFalse(CP().collapsed, "separated: normal tabs still open");
        assert.strictEqual(pane().getAttribute("width"), "400", "separated: at the normal width");
        assert.isTrue(sidebarOpen(t3.id), "separated: the normal sidebar still open");
        ZT.updateSidebarLayout({ width: false }); reader(t3.id)._updateLayout();
        try { cpInner()._getItemContext(t3.id).pinnedPane = ""; } catch (er) {}
        await sleep(300);
    });

    // ---- 15. Each library side its own pane widths --------------------------------
    // MJT 2026-11-12, on "library|library is not covered: Zotero's library views share
    // one set of pane widths": "Allow different". Zotero keeps one set for every library
    // view (zotero-persist attributes in pane.persist): libraryView.js adoptSharedState
    // (unserializePersist(view)) when a library tab is selected, flushSharedState
    // (serializePersist(view)) when it is left.
    /** A library side's own width of pane `base`: its attribute, as Zotero persists it. */
    const libW = (id, base) => Number(viewEl(id, base).getAttribute("width"));
    /** A resize, as Zotero's splitter and its own restore leave it: attribute and style. */
    const setLibW = (id, base, w) => { const el = viewEl(id, base); el.setAttribute("width", String(w)); el.style.width = w + "px"; };
    const savedLib = (base) => { const p = persisted()[base]; return p && p.width; };
    const recNow = () => JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).find(r => r.p && r.p.left && r.p.left.lib);

    it("15. two library sides: each keeps its own item pane and collections pane widths across side switches, leaving, coming back and a restart; normal library tabs and Zotero's saved widths keep theirs", async function () {
        if (!wvT.nativeWindows()) this.skip();   // an older Zotero has one library tab
        const L = libTab(), L2 = secondLibTab();
        const had = new Set(ZT._tabs.map(t => t.id));
        ZT.addLibraryTab({ select: false });
        const L3 = ZT._tabs.find(t => String(t.type).startsWith("library") && !had.has(t.id));
        assert.ok(L && L2 && L3, "fixture: three library tabs");
        const x = () => splitter().getBoundingClientRect().left;
        // Every library view loaded (a view loads when its tab is first shown).
        for (const t of [L3, L2, L]) { ZT.select(t.id); await sleep(900); }
        const orig = { item: viewEl(L.id, "zotero-item-pane").getAttribute("width"), coll: viewEl(L.id, "zotero-collections-pane").getAttribute("width") };
        // The normal widths: set in L, shared by Zotero when L is left.
        setLibW(L.id, "zotero-item-pane", 380); setLibW(L.id, "zotero-collections-pane", 260);
        ZT.select(L2.id); await sleep(700);
        ZT.select(L.id); await sleep(700);
        assert.strictEqual(libW(L2.id, "zotero-item-pane"), 380, "fixture: the normal width shared");
        const winSizes = JSON.stringify(win._wvPaneSizes || null);
        const s = await split(L.id, L2.id, "left");
        try {
            // Each side resized its own way.
            setLibW(L.id, "zotero-item-pane", 450); setLibW(L.id, "zotero-collections-pane", 300);
            ZT.select(L2.id); await sleep(800);
            assert.strictEqual(libW(L2.id, "zotero-item-pane"), 380, "the right side does not take the left one's item pane width");
            assert.strictEqual(libW(L2.id, "zotero-collections-pane"), 260, "nor its collections pane width");
            setLibW(L2.id, "zotero-item-pane", 340); setLibW(L2.id, "zotero-collections-pane", 220);
            const x0 = x();
            const own = (what) => {
                assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L.id, "zotero-collections-pane")], [450, 300], what + ": the left side's own widths");
                assert.deepEqual([libW(L2.id, "zotero-item-pane"), libW(L2.id, "zotero-collections-pane")], [340, 220], what + ": the right side's own widths");
                assert.deepEqual([savedLib("zotero-item-pane"), savedLib("zotero-collections-pane")], ["380", "260"], what + ": Zotero's saved widths the normal ones");
                assert.strictEqual(JSON.stringify(win._wvPaneSizes || null), winSizes, what + ": the window's own widths the normal ones");
            };
            for (const sel of [L.id, L2.id, L.id]) {
                ZT.select(sel); await sleep(900);
                own("after selecting the " + (sel === L.id ? "left" : "right"));
                assert.approximately(x(), x0, 0.5, "the divider still");
            }
            // In the restart record, from the resize alone.
            await sleep(2000);
            let rec = recNow();
            assert.ok(rec && rec.p.left.lib["zotero-item-pane"].width === "450" && rec.p.right.lib["zotero-item-pane"].width === "340", "each side's widths in the restart record: " + JSON.stringify(rec && rec.p));
            // Leave for a normal library tab: Zotero's widths; come back: each side's own.
            ZT.select(L3.id); await sleep(900);
            assert.deepEqual([libW(L3.id, "zotero-item-pane"), libW(L3.id, "zotero-collections-pane")], [380, 260], "a normal library tab: the normal widths");
            ZT.select(L2.id); await sleep(900);
            own("back in the split");
            // A restart: the split goes, its sides show the normal widths; the record
            // re-forms it with each side's own.
            rec = recNow();
            win._wvTSplits = [];
            wv._wvTabSplitSync(win); await sleep(700);
            assert.strictEqual(libW(L.id, "zotero-item-pane"), 380, "no split: the left tab back to the normal width");
            assert.strictEqual(libW(L2.id, "zotero-item-pane"), 380, "no split: the right tab back to the normal width");
            Zotero.Prefs.set("weavero.tabSplits", JSON.stringify([rec]));
            wv._wvTSplitPending = null;   // what a start reads: the pref
            wv._wvTabSplitRestore(win); await sleep(400);
            ZT.select(L.id); await sleep(1200);
            own("after a restart");
            // A record of 1.0.5-splitpane.6 (no widths of its own): the sides start
            // from what they show.
            delete rec.p.left.lib; delete rec.p.right.lib;
            separateAll(); await sleep(600);
            Zotero.Prefs.set("weavero.tabSplits", JSON.stringify([rec]));
            wv._wvTSplitPending = null;
            wv._wvTabSplitRestore(win); await sleep(400);
            ZT.select(L.id); await sleep(1200);
            assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L2.id, "zotero-item-pane")], [380, 380], "a splitpane.6 record: both sides at what they showed");
            separateAll(); await sleep(600);
            assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L.id, "zotero-collections-pane")], [380, 260], "separated: the normal widths back");
            assert.deepEqual([savedLib("zotero-item-pane"), savedLib("zotero-collections-pane")], ["380", "260"], "separated: Zotero's saved widths the normal ones");
        }
        finally {
            // Whatever happened: no split, no extra library tab, the widths as found
            // (a failure here left two library tabs open for the specs after it).
            separateAll(); await sleep(600);
            try { ZT.close(L3.id); } catch (er) {}
            try { ZT.close(L2.id); } catch (er) {}
            await sleep(400);
            try { ZT.select(L.id); } catch (er) {}
            await sleep(500);
            try { if (orig.item) setLibW(L.id, "zotero-item-pane", Number(orig.item)); if (orig.coll) setLibW(L.id, "zotero-collections-pane", Number(orig.coll)); } catch (er) {}
        }
    });

    it("15. a library|reader split: the library side's pane widths are its own; Zotero's saved widths stay the normal ones; separated, the normal widths back", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), t3 = tabOfItem(pdf3);
        ZT.select(L.id); await sleep(800);
        const orig = { item: viewEl(L.id, "zotero-item-pane").getAttribute("width"), coll: viewEl(L.id, "zotero-collections-pane").getAttribute("width") };
        setLibW(L.id, "zotero-item-pane", 380); setLibW(L.id, "zotero-collections-pane", 260);
        assert.strictEqual(savedLib("zotero-item-pane"), "380", "fixture: the normal width saved");
        const s = await split(L.id, t1.id, "left");
        try {
            setLibW(L.id, "zotero-item-pane", 460); setLibW(L.id, "zotero-collections-pane", 290);
            ZT.select(t1.id); await sleep(800);
            ZT.select(L.id); await sleep(800);
            assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L.id, "zotero-collections-pane")], [460, 290], "the library side keeps its own widths across a side switch");
            assert.deepEqual([savedLib("zotero-item-pane"), savedLib("zotero-collections-pane")], ["380", "260"], "Zotero's saved widths the normal ones");
            ZT.select(t3.id); await sleep(800);
            assert.deepEqual([savedLib("zotero-item-pane"), savedLib("zotero-collections-pane")], ["380", "260"], "outside: Zotero's saved widths the normal ones");
            ZT.select(L.id); await sleep(900);
            assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L.id, "zotero-collections-pane")], [460, 290], "back: its own widths");
            wv._wvTabSplitSeparate(win, s.id); await sleep(600);
            assert.deepEqual([libW(L.id, "zotero-item-pane"), libW(L.id, "zotero-collections-pane")], [380, 260], "separated: the normal widths back");
            assert.deepEqual([savedLib("zotero-item-pane"), savedLib("zotero-collections-pane")], ["380", "260"], "separated: Zotero's saved widths the normal ones");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id); await sleep(400);
            try { if (orig.item) setLibW(L.id, "zotero-item-pane", Number(orig.item)); if (orig.coll) setLibW(L.id, "zotero-collections-pane", Number(orig.coll)); } catch (er) {}
        }
    });

    // ---- 19. One press on the other side selects it AND reaches its target ---------
    // MJT 2026-11-12, a PDF|PDF split, the cursor on the left side's item pane: "When I
    // click on the tab toggle on the other split view, the first click only focuses
    // that part of the split view. I need to click again to make it react. Everything
    // should be directly clickable in both sides. No delay by focus click". A click is
    // lost when the press re-creates or moves the element under the pointer before the
    // release (mousedown and mouseup on different elements: no click on either). A
    // synthetic press cannot drive XUL commands (isTrusted=false), so the guard holds
    // the mechanism: after the press, the same element at the same place.

    /** Press `el` (in `d`) as the pointer would and report what lies under the
     *  pointer ~150 ms later, as a human release finds it. */
    async function pressStays(d, el) {
        const r = el.getBoundingClientRect();
        const x = r.left + Math.min(r.width / 2, 8), y = r.top + r.height / 2;
        const v = d.defaultView;
        const o = { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y };
        el.dispatchEvent(new v.MouseEvent("mousedown", o));
        await sleep(150);
        const hit = d.elementFromPoint(x, y);
        const same = !!hit && el.isConnected && (hit === el || el.contains(hit));
        const r2 = el.isConnected ? el.getBoundingClientRect() : null;
        const moved = r2 ? Math.abs(r2.left - r.left) + Math.abs(r2.top - r.top) : -1;
        el.dispatchEvent(new v.MouseEvent("mouseup", o));
        return { same, moved, hit: hit ? (hit.id || hit.localName + "." + String(hit.className || "").split(" ")[0]) : "none" };
    }

    it("19. one press on the other side selects it and leaves its target under the pointer, unmoved: the item pane (sidenav, a field), the reader toolbar, the PDF, the sidebar", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        try {
            await readerReady(t1.id); await readerReady(t2.id);
            // The left side's own item pane and sidebar open; the right side selected.
            ZT.select(t1.id); await sleep(800);
            await setPaneOpen(true);
            rdoc(t1.id).querySelector("#sidebarToggle").click(); await sleep(700);
            ZT.select(t2.id); await sleep(1000);
            assert.ok(paneIn(t1.id) && ghost() && hitInside(ghost()), "fixture: the left side's own pane shown");
            /** @type {Array<[string, () => any, any]>} */
            const targets = [
                ["the item pane's side navigation", () => Array.from(ghost().querySelectorAll("item-pane-sidenav .btn[data-pane]")).find(e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; }), doc],
                ["a field in the item pane", () => Array.from(ghost().querySelectorAll("item-details editable-text")).find(e => e.getBoundingClientRect().height > 8), doc],
                ["the reader toolbar's sidebar button", () => rdoc(t1.id).querySelector("#sidebarToggle"), null],
                ["the reader toolbar's zoom button", () => rdoc(t1.id).querySelector("#zoomIn, .toolbar .zoom-in, button[class*='zoom']"), null],
                ["the PDF", () => { const v = /** @type {any} */ (reader(t1.id))._internalReader._primaryView._iframeWindow; return v && v.document.querySelector("#viewerContainer, .pdfViewer, #viewer"); }, "view"],
                ["the reader sidebar", () => rdoc(t1.id).querySelector("#sidebarContainer .thumbnails, #sidebarContainer, .sidebar-view"), null],
            ];
            // Every target tried; the failures listed together.
            const bad = [];
            for (const [what, find, d0] of targets) {
                ZT.select(t2.id); await sleep(900);
                const el = find();
                if (!el) { bad.push(what + ": fixture not found"); continue; }
                const d = d0 === "view" ? el.ownerDocument : (d0 || rdoc(t1.id));
                const res = await pressStays(d, el);
                await sleep(500);
                if (ZT.selectedID !== t1.id) bad.push(what + ": the press did not select the left side");
                if (!res.same) bad.push(what + ": not under the pointer at the release (found " + res.hit + ")");
                if (res.moved > 0.5) bad.push(what + ": moved " + res.moved.toFixed(1) + "px by the press");
            }
            assert.deepEqual(bad, [], "every target reached in one press");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(500); }
    });

    it("19. one press on a library side or a note side selects it and leaves its target under the pointer, unmoved", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), tn = tabOfItem(note);
        let s = await split(L.id, t1.id, "right");
        try {
            /** @type {Array<[string, () => any]>} */
            const targets = [
                ["the items list", () => libView(L.id).querySelector(".virtualized-table-body .row, [id^='item-tree'] .row")],
                ["the collections tree", () => libView(L.id).querySelector("#zotero-collections-tree .row, [id^='zotero-collections-tree'] .row")],
                ["the tag selector", () => libView(L.id).querySelector(".tag-selector-list, .tag-selector-filter-container input, [id^='zotero-tag-selector']")],
            ];
            for (const [what, find] of targets) {
                ZT.select(t1.id); await sleep(900);
                const el = find();
                if (!el) { assert.fail("fixture: " + what + " not found"); }
                const res = await pressStays(doc, el);
                await sleep(500);
                assert.strictEqual(ZT.selectedID, L.id, what + ": the press selected the library side");
                assert.isTrue(res.same, what + ": still under the pointer at the release (found " + res.hit + ")");
                assert.isAtMost(res.moved, 0.5, what + ": not moved by the press");
            }
            wv._wvTabSplitSeparate(win, s.id); await sleep(400);
            s = await split(tn.id, t1.id, "right");
            ZT.select(t1.id); await sleep(900);
            const ne = doc.getElementById(tn.id).querySelector("note-editor");
            const ifr = ne && (ne.querySelector("iframe#editor-view") || ne.querySelector("iframe"));
            const body = await waitFor(() => ifr && ifr.contentDocument && ifr.contentDocument.querySelector(".ProseMirror, body"), 8000, "the note editor");
            const res = await pressStays(ifr.contentDocument, body);
            await sleep(500);
            assert.strictEqual(ZT.selectedID, tn.id, "the note: the press selected the note side");
            assert.isTrue(res.same, "the note: still under the pointer (found " + res.hit + ")");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(500); }
    });

    // ---- 20. A pane toggle acts on the side it was pressed in -----------------------
    // MJT 2026-11-12, on l10n.12: "Sometimes, opening a right pane opens it in the
    // other side of the split view". A press on the other side selects it (mousedown,
    // the panel's capture listener) and the reader's own toggle answers the click; the
    // split moved Zotero's pane state to the newly selected side only later (the tab
    // notifier's Sync, the context pane's async handler), so a toggle landing first
    // toggled the side selected BEFORE, and the switch then filed that state under it.

    it("20. a pane toggle pressed on the other side opens THAT side's pane even when the toggle runs before the side switch, both directions, the item pane and the sidebar; the other side unchanged; each request in the split ring", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        try {
            await readerReady(t1.id); await readerReady(t2.id); await sleep(400);
            /** The tightest real order: the press, then the reader's toggle, one task. */
            const press = (id, sel) => {
                const btn = rdoc(id).querySelector(sel);
                assert.ok(btn, "fixture: " + sel + " in the " + (id === t1.id ? "left" : "right") + " reader");
                btn.dispatchEvent(new (reader(id)._iframeWindow.MouseEvent)("mousedown", { bubbles: true, cancelable: true, button: 0 }));
                btn.click();
            };
            const state = () => ({ p1: paneIn(t1.id), p2: paneIn(t2.id), s1: sidebarOpen(t1.id), s2: sidebarOpen(t2.id) });
            assert.deepEqual(state(), { p1: false, p2: false, s1: false, s2: false }, "fixture: both sides closed");
            // The right side selected; the left side's item pane toggle.
            press(t1.id, ".context-pane-toggle"); await sleep(900);
            assert.strictEqual(ZT.selectedID, t1.id, "the left side selected by the press");
            assert.deepEqual(state(), { p1: true, p2: false, s1: false, s2: false }, "the LEFT side's item pane opened, the right one still closed");
            // Back the other way: the right side's item pane toggle.
            press(t2.id, ".context-pane-toggle"); await sleep(900);
            assert.strictEqual(ZT.selectedID, t2.id, "the right side selected by the press");
            assert.deepEqual(state(), { p1: true, p2: true, s1: false, s2: false }, "the RIGHT side's item pane opened, the left one still open");
            // The sidebars, both ways.
            press(t1.id, "#sidebarToggle"); await sleep(900);
            assert.deepEqual(state(), { p1: true, p2: true, s1: true, s2: false }, "the LEFT side's sidebar opened, the right one still closed");
            press(t2.id, "#sidebarToggle"); await sleep(900);
            assert.deepEqual(state(), { p1: true, p2: true, s1: true, s2: true }, "the RIGHT side's sidebar opened, the left one still open");
            // Each request recorded for an occurrence MJT meets later.
            const ring = /** @type {any} */ (Zotero)._wvSplitRing || [];
            assert.isAtLeast(ring.filter(r => /toggle/.test(String(r))).length, 4, "the split ring holds the toggles: " + ring.slice(-6).join(" / "));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(500); }
    });

    // ---- 21. A footer on each side whose item pane is closed ----------------------
    // MJT 2026-11-12: "Show it on both sides when the item pane of that side is closed.
    // Add an option in the settings to disable the footer." (Firefox's footer names the
    // side not selected; here each side has its own toolbar, so the rule is per side.)
    it("21. a footer in the corner of each side whose item pane is closed, none where it is open; Settings turns them all off and back on", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), L = libTab();
        const PREF = "weavero.splitViewFooter";
        const prev = Zotero.Prefs.get(PREF);
        /** The visible footers, by tab id. */
        const shown = () => [...doc.querySelectorAll("#wv-tsplit-layer .wv-tsplit-footer")]
            .filter(f => !f.hidden && f.getBoundingClientRect().width > 0).map(f => f.getAttribute("data-tab-id")).sort();
        const ids = (...a) => a.slice().sort();
        const footerOf = (id) => doc.querySelector('#wv-tsplit-layer .wv-tsplit-footer[data-tab-id="' + id + '"]');
        const s = await split(t1.id, t2.id, "right");
        try {
            Zotero.Prefs.set(PREF, true);
            await readerReady(t1.id); await readerReady(t2.id); await sleep(500);
            assert.isFalse(!!(doc.getElementById(t1.id).hasAttribute("wv-tsplit-paned") || doc.getElementById(t2.id).hasAttribute("wv-tsplit-paned")), "fixture: both item panes closed");
            // Both closed: two footers, each in its own card's bottom end corner, with its tab's title.
            assert.deepEqual(shown(), ids(t1.id, t2.id), "both sides closed: a footer on each");
            for (const id of [t1.id, t2.id]) {
                const fr = footerOf(id).getBoundingClientRect(), cr = rectOf(id);
                assert.ok(within(fr, cr, 1), "the footer of " + id + " inside its card: " + fmt(fr) + " in " + fmt(cr));
                assert.closeTo(fr.right, cr.right - 1, 1.5, "at the card's end, inside the border");
                assert.closeTo(fr.bottom, cr.bottom - 1, 1.5, "at the card's bottom, inside the border");
                assert.strictEqual(footerOf(id).querySelector(".wv-tsplit-title").textContent, ZT._tabs.find(t => t.id === id).title, "its tab's title");
                assert.ok(footerOf(id).querySelector(".wv-tsplit-more"), "its menu button");
            }
            // The selected (right) side opens its item pane: its footer goes, the other stays.
            const x0 = splitter().getBoundingClientRect().left;
            await setPaneOpen(true);
            assert.deepEqual(shown(), [t1.id], "the right side's pane open: only the left footer");
            assert.closeTo(splitter().getBoundingClientRect().left, x0, 0.5, "no layout jump");
            // The left side's own toggle: no footer left.
            rdoc(t1.id).querySelector(".context-pane-toggle").click(); await sleep(900);
            assert.deepEqual(shown(), [], "both panes open: no footer");
            // Closed again, one side then the other (the left is selected now).
            await setPaneOpen(false);
            assert.deepEqual(shown(), [t1.id], "the left side's pane closed again: its footer back");
            ZT.select(t2.id); await sleep(800);
            await setPaneOpen(false);
            assert.deepEqual(shown(), ids(t1.id, t2.id), "both closed again: two footers");
            // The setting off: none, at once; on: back by the same rule.
            Zotero.Prefs.set(PREF, false); await sleep(400);
            assert.deepEqual(shown(), [], "the setting off: no footer");
            assert.strictEqual(doc.querySelectorAll("#wv-tsplit-layer .wv-tsplit-footer").length, 0, "none drawn");
            await setPaneOpen(true); await setPaneOpen(false);
            assert.deepEqual(shown(), [], "still none after a pane toggle");
            Zotero.Prefs.set(PREF, true); await sleep(400);
            assert.deepEqual(shown(), ids(t1.id, t2.id), "the setting on again: both back");
            // The menu is the split's own, from either footer.
            footerOf(t1.id).querySelector(".wv-tsplit-more").click(); await sleep(400);
            const pop = doc.getElementById("wv-tsplit-menu");
            assert.ok(pop && pop.querySelectorAll("menuitem").length === 3, "the selected-or-not side's footer opens the split's menu");
            try { pop.hidePopup(); } catch (er) {}
            await sleep(200);
        }
        finally {
            if (prev === undefined) Zotero.Prefs.clear(PREF); else Zotero.Prefs.set(PREF, prev);
            wv._wvTabSplitSeparate(win, s.id); await sleep(500);
        }
        // A library side: its footer names the library tab while its own item pane is collapsed.
        const s2 = await split(L.id, t1.id, "right");
        const ip = () => libView(L.id).querySelector("item-pane");
        const was = !!ip().collapsed;
        try {
            await sleep(500);
            ZT.select(L.id); await sleep(700);
            if (ip().collapsed) { win.ZoteroPane.toggleItemPane(); await sleep(600); }
            assert.notInclude(shown(), L.id, "a library side with its item pane open: no footer");
            win.ZoteroPane.toggleItemPane(); await sleep(600);
            assert.include(shown(), L.id, "its item pane collapsed: its footer");
            assert.strictEqual(footerOf(L.id).querySelector(".wv-tsplit-title").textContent, ZT._tabs.find(t => t.id === L.id).title, "named as its tab");
            win.ZoteroPane.toggleItemPane(); await sleep(600);
            assert.notInclude(shown(), L.id, "open again: gone");
        }
        finally {
            try { if (!!ip().collapsed !== was) win.ZoteroPane.toggleItemPane(); } catch (er) {}
            await sleep(300);
            wv._wvTabSplitSeparate(win, s2.id); await sleep(500);
        }
    });
});
