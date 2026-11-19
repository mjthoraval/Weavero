/* global describe, it, before, after, assert, Zotero, wvT */
// Split view: each side laid out as a window of its width (tab-split.ts, MJT 2026-11-17,
// a split of My Library at ~926px beside a PDF at ~980px in a 1920px window, View ->
// Layout = Standard: "Can you try moving to stacked view each side view in the same way
// as if it was a full window?"). Zotero stacks a WINDOW narrower than 930px
// (zoteroPane.js updateLayoutConstraints, windowAutoStackMinWidth) and View -> Layout ->
// Stacked stacks every window; a side does the same at its own width -- a library side
// through its own view's layout, a reader or note side with its item pane under it,
// inside its card. Zotero's own layout settings are never written.
describe("Weavero — split view: each side stacked as a window of its width", function () {
    this.timeout(240000);
    let wv, win, doc, ZT, pdf1, pdf2, prevSplit, ow, oh, layout0, temp0;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const rectOf = (id) => doc.getElementById(id).getBoundingClientRect();
    const pane = () => doc.getElementById("zotero-context-pane");
    const inner = () => doc.getElementById("zotero-context-pane-inner");
    const ghost = () => doc.getElementById("wv-tsplit-ghost");
    const CP = () => win.ZoteroContextPane;
    const splitter = () => doc.querySelector("#wv-tsplit-layer .wv-tsplit-splitter");
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const libView = (id) => doc.getElementById(id).querySelector("library-view") || doc.getElementById(id);
    const viewEl = (id, base) => libView(id).querySelector("#" + base + ", [id^='" + base + "-tab-']");
    /** A library side can take a layout of its own: a Zotero whose library tabs each
     *  have their own view (zotero#6035, `applyLayout` per view). Zotero 10's one
     *  library pane follows Zotero's layout, as before. */
    const perViewLayout = (id) => typeof libView(id).applyLayout === "function" && libView(id).localName === "library-view";
    const orientOf = (id) => viewEl(id, "zotero-layout-switcher").getAttribute("orient");
    /** The side's layout as the split decided it (a missing method is a failure). */
    const sideStacked = (id) => {
        if (typeof wv._wvTabSplitSideStacked !== "function") wvT.absent("plugin._wvTabSplitSideStacked");
        return wv._wvTabSplitSideStacked(win, id);
    };
    const within = (a, b, tol = 0.5) => !!a && !!b && a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
    const fmt = (r) => r ? "[" + [r.left, r.top, r.width, r.height].map(Math.round).join(",") + "]" : "null";
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    /** @returns {any} */
    const rdoc = (id) => { const r = reader(id); return r && r._iframeWindow && r._iframeWindow.document; };
    /** Where a reader's document view ends, in the main window (the reader's own
     *  `.split-view`, which a bottom placeholder lifts). */
    const viewRect = (id) => {
        const r = reader(id), d = rdoc(id);
        const sv = d && d.querySelector(".split-view, #split-view");
        if (!sv) return null;
        const fr = r._iframe.getBoundingClientRect(), vr = sv.getBoundingClientRect();
        const k = fr.width / Math.max(1, r._iframeWindow.innerWidth);
        return { left: fr.left + vr.left * k, right: fr.left + vr.right * k, top: fr.top + vr.top * k, bottom: fr.top + vr.bottom * k, width: vr.width * k, height: vr.height * k };
    };
    const placeholderOf = (id) => { const r = reader(id); return r && r._internalReader && r._internalReader._state ? r._internalReader._state.bottomPlaceholderHeight : undefined; };
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    async function readerReady(id) {
        return waitFor(() => { const d = rdoc(id); return d && d.querySelector(".toolbar > .end") && d.querySelector(".split-view, #split-view") ? d : null; }, 20000, "reader toolbar " + id);
    }
    async function split(a, b, sel) {
        separateAll();
        ZT.select(a); await sleep(300);
        const s = wv._wvTabSplitCreate(win, a, b, { select: sel || "right" });
        assert.ok(s, "fixture: the split");
        await sleep(1200);
        return s;
    }
    /** The left side `px` wide (its card's border box). */
    async function leftAt(s, px) {
        const W = wv._wvTabSplitTotal(win);
        s.ratio = px / W;
        wv._wvTabSplitSync(win);
        await sleep(900);
    }
    async function setPaneOpen(open) {
        if (CP().collapsed === !open) return;
        CP().togglePane();
        await sleep(800);
    }
    function pointerDrag(sp, dx) {
        const r = sp.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const pe = (type, d) => sp.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
            clientX: x + d, clientY: y, screenX: Math.round(win.mozInnerScreenX + x + d), screenY: Math.round(win.mozInnerScreenY + y), isPrimary: true, pointerType: "mouse" }));
        pe("pointerdown", 0); pe("pointermove", Math.round(dx / 2)); pe("pointermove", dx); pe("pointerup", dx);
    }
    /** Zotero's own layout settings, never written by the split. */
    const zoteroLayout = () => ({ layout: Zotero.Prefs.get("layout"), temp: Zotero.Prefs.get("tempStackedMode") });
    /** A reader side whose item pane is stacked inside its card: the pane under the
     *  reader, the card's width (less the reader's sidebar), at the card's bottom, and
     *  the reader's view ending where it starts -- no empty band, nothing outside. */
    function assertStackedIn(id, what, el) {
        const card = rectOf(id);
        const ir = (el || inner()).getBoundingClientRect();
        assert.isAbove(ir.height, 100, what + ": the item pane drawn " + fmt(ir));
        assert.ok(within(ir, card, 1), what + ": inside its card " + fmt(ir) + " in " + fmt(card));
        assert.approximately(ir.bottom, card.bottom - 1, 1.5, what + ": at the card's bottom");
        assert.approximately(ir.right, card.right - 1, 1.5, what + ": to the card's end");
        assert.isAbove(ir.width, card.width * 0.5, what + ": the card's width (less the reader sidebar) " + fmt(ir));
        const vr = viewRect(id);
        assert.ok(vr, what + ": the reader's view");
        assert.isAtMost(vr.bottom, ir.top + 1, what + ": the reader's view ends above the item pane " + fmt(vr) + " / " + fmt(ir));
        assert.isAtLeast(vr.bottom, ir.top - 14, what + ": no empty band between them " + fmt(vr) + " / " + fmt(ir));
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvTabSplitCreate", "_wvTabSplitSync", "_wvTabSplitSeparate", "_wvTabSplitTotal"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(800);
        const z = zoteroLayout();
        layout0 = z.layout; temp0 = z.temp;
        pdf1 = await wvT.createTestPDFItem("wv-ss-1");
        pdf2 = await wvT.createTestPDFItem("wv-ss-2");
        for (const it of [pdf1, pdf2]) await openPDF(it);
        try { ZT.select(libTab().id); } catch (er) {}
        await sleep(500);
        Zotero.debug("[wv-test] split-stacked: window " + win.innerWidth + "x" + win.innerHeight + ", total " + Math.round(wv._wvTabSplitTotal(win)) + ", layout " + layout0);
    });

    after(async function () {
        if (!win) return;
        try { separateAll(); } catch (er) {}
        for (const it of [pdf1, pdf2]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(400);
        try { ZT.select(libTab().id); } catch (er) {}
        await wvT.erase(pdf1, pdf2);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(400);
    });

    it("a library side narrower than Zotero's 930px is stacked, the PDF beside it stays standard; Zotero's layout settings untouched", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id);
            await setPaneOpen(true);
            await leftAt(s, 700);
            assert.approximately(rectOf(L.id).width, 700, 3, "fixture: the library side at 700px");
            assert.isAbove(rectOf(t1.id).width, 930, "fixture: the PDF side wider than 930px");
            assert.deepEqual(zoteroLayout(), { layout: layout0, temp: temp0 }, "Zotero's layout and tempStackedMode as they were");
            assert.strictEqual(sideStacked(L.id), perViewLayout(L.id), "the library side stacked (where its view has a layout of its own)");
            assert.isFalse(sideStacked(t1.id), "the PDF side as standard");
            if (perViewLayout(L.id)) {
                assert.strictEqual(orientOf(L.id), "vertical", "the library view stacked: its items list above its item pane");
                assert.isTrue(viewEl(L.id, "zotero-item-pane").classList.contains("stacked"), "its item pane in Zotero's stacked look");
                const sn = libView(L.id).querySelector(".zotero-view-item-sidenav");
                assert.isTrue(sn.classList.contains("stacked"), "its side navigation stacked");
                const ip = viewEl(L.id, "zotero-item-pane").getBoundingClientRect();
                assert.ok(within(ip, rectOf(L.id), 1), "the item pane inside the card " + fmt(ip));
                const items = viewEl(L.id, "zotero-items-pane-container").getBoundingClientRect();
                assert.isAtMost(items.bottom, ip.top + 6, "the items list above the item pane");
                // Zotero shows its stacked layout's item-pane toggle in the items toolbar.
                const tg = libView(L.id).querySelector(".zotero-tb-toggle-item-pane-stacked");
                assert.ok(tg && tg.getBoundingClientRect().width > 0, "the stacked layout's item-pane toggle in the items toolbar");
                // Zotero re-applying its layout (a pane's adoptSharedState, View -> Layout)
                // keeps the side's.
                libView(L.id).applyLayout(false);
                assert.strictEqual(orientOf(L.id), "vertical", "kept against Zotero's own applyLayout(standard)");
                win.ZoteroPane.updateLayout(); await sleep(400);
                assert.strictEqual(orientOf(L.id), "vertical", "kept against ZoteroPane.updateLayout()");
            }
            else {
                assert.strictEqual(orientOf(L.id), "horizontal", "Zotero 10: the window's one library pane follows Zotero's layout");
            }
            assert.isFalse(pane().classList.contains("stacked"), "the PDF side's item pane in the standard layout");
            const pr = pane().getBoundingClientRect(), card = rectOf(t1.id);
            assert.ok(within(pr, card, 1), "at the PDF card's end " + fmt(pr) + " in " + fmt(card));
            assert.approximately(pr.right, card.right - 1, 1.5, "at the end");
            assert.isAbove(pr.height, card.height - 4, "full height");
            assert.notExists(placeholderOf(t1.id), "the PDF reader keeps no bottom room");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
    });

    it("the divider dragged so the library side passes 930px: back to standard; dragged back: stacked again; a narrower window stacks both", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id);
            await leftAt(s, 700);
            const lib = perViewLayout(L.id);
            if (lib) assert.strictEqual(orientOf(L.id), "vertical", "fixture: stacked at 700px");
            pointerDrag(splitter(), 400); await sleep(700);
            assert.isAbove(rectOf(L.id).width, 1000, "fixture: dragged past 930px");
            assert.isFalse(sideStacked(L.id), "standard past 930px");
            if (lib) assert.strictEqual(orientOf(L.id), "horizontal", "the library view back to standard");
            pointerDrag(splitter(), -400); await sleep(700);
            assert.isBelow(rectOf(L.id).width, 930, "fixture: back under 930px");
            if (lib) assert.strictEqual(orientOf(L.id), "vertical", "stacked again");
            // The window narrower (still wider than Zotero's own 930px): both sides
            // under it, both stacked; back: as before.
            s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(500);
            try { win.resizeTo(1500, 1040); } catch (er) {}
            await waitFor(() => win.innerWidth < 1600, 5000, "the window at 1500px");
            await sleep(900);
            assert.isBelow(rectOf(t1.id).width, 930, "fixture: the PDF side under 930px");
            assert.isTrue(sideStacked(t1.id), "the PDF side stacked in the narrower window");
            assert.strictEqual(sideStacked(L.id), lib, "the library side too (where its view has a layout of its own)");
            if (lib) assert.strictEqual(orientOf(L.id), "vertical", "the library view stacked");
            assert.deepEqual(zoteroLayout(), { layout: layout0, temp: temp0 }, "Zotero's own layout untouched (the window is wider than its 930px)");
            try { win.resizeTo(1920, 1040); } catch (er) {}
            await waitFor(() => win.innerWidth > 1800, 5000, "the window back at 1920px");
            await sleep(900);
            assert.isFalse(sideStacked(t1.id), "back: the PDF side standard");
            if (lib) assert.strictEqual(orientOf(L.id), "horizontal", "back: the library view standard");
        }
        finally {
            try { win.resizeTo(1920, 1040); } catch (er) {}
            wv._wvTabSplitSeparate(win, s.id); await sleep(600);
        }
    });

    it("a PDF side narrower than 930px: its item pane under the reader, inside its card, the card's width; the reader keeps the room; either side selected", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id);
            await setPaneOpen(true);
            const W = wv._wvTabSplitTotal(win);
            await leftAt(s, W - 700);
            assert.approximately(rectOf(t1.id).width, 700, 3, "fixture: the PDF side at 700px");
            for (const sel of [t1.id, L.id]) {
                ZT.select(sel); await sleep(1000);
                assert.isTrue(pane().classList.contains("stacked"), sel + " selected: Zotero's pane in its stacked layout");
                assert.isFalse(CP().collapsed, sel + " selected: open");
                assertStackedIn(t1.id, sel + " selected");
                const sn = doc.getElementById("zotero-context-pane-sidenav");
                assert.isTrue(sn.classList.contains("stacked"), sel + " selected: its side navigation stacked");
                assert.ok(within(sn.getBoundingClientRect(), rectOf(t1.id), 1), sel + " selected: inside the card");
                const sps = doc.getElementById("zotero-context-splitter-stacked");
                assert.isAbove(sps.getBoundingClientRect().width, 100, sel + " selected: the stacked splitter to resize its height");
                assert.ok(within(sps.getBoundingClientRect(), rectOf(t1.id), 1), sel + " selected: in the card");
                assert.isAbove(placeholderOf(t1.id), 100, sel + " selected: the reader's bottom room is the pane's height");
                assert.notOk(doc.querySelector("#wv-tsplit-layer .wv-tsplit-pane-handle"), sel + " selected: no side handle for a stacked pane");
                assert.isFalse(doc.getElementById(t1.id).hasAttribute("wv-tsplit-paned"), sel + " selected: no room kept at the card's end");
            }
            // Closed: the reader takes the card, the toggle left in its toolbar.
            ZT.select(t1.id); await sleep(600);
            await setPaneOpen(false);
            assert.strictEqual(placeholderOf(t1.id), 0, "closed: no bottom room, still the stacked layout");
            const vr = viewRect(t1.id), card = rectOf(t1.id);
            assert.approximately(vr.bottom, card.bottom - 1, 2, "closed: the reader's view to the card's bottom");
            assert.ok(rdoc(t1.id).querySelector(".context-pane-toggle"), "closed: the toggle in the reader's toolbar");
            await setPaneOpen(true);
            assertStackedIn(t1.id, "opened again");
            assert.deepEqual(zoteroLayout(), { layout: layout0, temp: temp0 }, "Zotero's layout untouched");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(600); }
    });

    // MJT 2026-11-18 on splitui.2 (library | PDF, the library selected): "The first click on
    // the toggle when not focused does nothing" -- the press selected the PDF side, and the
    // button could be drawn again before the release (its icon follows the side's layout),
    // so no click. The press is played as the browser does it: a click only on what was
    // under both the press and the release, none when the pressed element is gone.
    it("a PDF side not selected: one press on its toolbar's item pane toggle selects it AND opens its pane, whether or not the button was drawn again", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id);
            const W = wv._wvTabSplitTotal(win);
            await leftAt(s, W - 700);
            ZT.select(t1.id); await sleep(700);
            await setPaneOpen(false);
            ZT.select(L.id); await sleep(900);
            assert.strictEqual(ZT.selectedID, L.id, "fixture: the library selected");
            const d = rdoc(t1.id), iw = d.defaultView;
            const btn = d.querySelector(".context-pane-toggle");
            assert.ok(btn, "fixture: the toggle in the PDF side's toolbar");
            const icon = btn.querySelector("svg") || btn;
            const r = icon.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const mev = (type, el) => el.dispatchEvent(new iw.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, view: iw }));
            mev("mousedown", icon);
            await sleep(250);
            const upEl = d.elementFromPoint(x, y) || d.documentElement;
            mev("mouseup", upEl);
            // The browser's rule: the click goes to what the press and the release share;
            // a pressed element no longer in the document gets none.
            const redrawn = !icon.isConnected;
            if (!redrawn) {
                let common = icon;
                while (common && !common.contains(upEl)) common = common.parentNode;
                if (common && common.nodeType === 1) mev("click", common);
            }
            await sleep(900);
            const ring = () => " -- ring: " + JSON.stringify((/** @type {any} */ (Zotero)._wvSplitRing || []).slice(-12));
            assert.strictEqual(ZT.selectedID, t1.id, "the press selected the PDF side" + ring());
            assert.isFalse(CP().collapsed, "and opened its item pane (button drawn again: " + redrawn + ")" + ring());
        }
        finally { try { await setPaneOpen(false); } catch (er) {} wv._wvTabSplitSeparate(win, s.id); await sleep(600); }
    });

    it("View -> Layout -> Stacked: both sides stacked, the PDF's item pane in its card below the reader; Standard again: both back", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        try {
            await readerReady(t1.id);
            await setPaneOpen(true);
            s.ratio = 0.5; wv._wvTabSplitSync(win); await sleep(600);
            await wvT.withPref("layout", "stacked", async () => {
                await sleep(1200);
                assert.strictEqual(orientOf(L.id), "vertical", "the library view stacked");
                for (const sel of [t1.id, L.id]) {
                    ZT.select(sel); await sleep(1000);
                    assert.isTrue(pane().classList.contains("stacked"), sel + " selected: Zotero's pane stacked");
                    const pr = inner().getBoundingClientRect();
                    assert.isAtLeast(pr.left, rectOf(L.id).right, sel + " selected: nothing of it under the library card " + fmt(pr));
                    assertStackedIn(t1.id, "global stacked, " + sel + " selected");
                }
                assert.isTrue(sideStacked(L.id) && sideStacked(t1.id), "both sides stacked");
            });
            await sleep(1200);
            assert.strictEqual(Zotero.Prefs.get("layout"), layout0, "fixture: the layout back");
            ZT.select(t1.id); await sleep(1000);
            assert.isFalse(pane().classList.contains("stacked"), "standard again: Zotero's pane standard");
            if (perViewLayout(L.id)) assert.strictEqual(orientOf(L.id), "horizontal", "standard again: the library view");
            const pr = pane().getBoundingClientRect();
            assert.ok(within(pr, rectOf(t1.id), 1), "standard again: the pane at the PDF card's end " + fmt(pr));
            assert.notExists(placeholderOf(t1.id), "standard again: no bottom room");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(600); }
    });

    it("PDF|PDF, one side stacked and one standard: Zotero's pane takes the selected side's layout, the other side's own pane its own", async function () {
        const t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2);
        const s = await split(t1.id, t2.id, "right");
        try {
            await readerReady(t1.id); await readerReady(t2.id);
            // Each side opens its own (a reader side starts closed, item 14).
            await setPaneOpen(true);
            ZT.select(t1.id); await sleep(900);
            await setPaneOpen(true);
            await leftAt(s, 700);
            ZT.select(t2.id); await sleep(1000);
            // The right side selected (standard): Zotero's pane at its end; the left
            // side's own pane stacked under its reader.
            assert.isFalse(pane().classList.contains("stacked"), "right selected: Zotero's pane standard");
            assert.ok(within(pane().getBoundingClientRect(), rectOf(t2.id), 1), "right selected: in the right card");
            assert.ok(ghost(), "the left side's own pane");
            assert.isTrue(ghost().hasAttribute("wv-stacked"), "stacked");
            assertStackedIn(t1.id, "left side's own pane", ghost());
            assert.isAbove(placeholderOf(t1.id), 100, "the left reader keeps room for it");
            assert.notExists(placeholderOf(t2.id), "the right reader none");
            // The left side selected (stacked): Zotero's pane stacked under its reader,
            // the right side's own pane at its card's end.
            ZT.select(t1.id); await sleep(1200);
            assert.isTrue(pane().classList.contains("stacked"), "left selected: Zotero's pane stacked");
            assertStackedIn(t1.id, "left selected");
            assert.ok(ghost() && !ghost().hasAttribute("wv-stacked"), "the right side's own pane standard");
            const gr = ghost().getBoundingClientRect(), cr = rectOf(t2.id);
            assert.ok(within(gr, cr, 1), "in the right card " + fmt(gr));
            assert.approximately(gr.right, cr.right - 1, 1.5, "at its end");
            assert.isAbove(gr.height, cr.height - 4, "full height");
            assert.notExists(placeholderOf(t2.id), "the right reader keeps no bottom room");
            assert.deepEqual(zoteroLayout(), { layout: layout0, temp: temp0 }, "Zotero's layout untouched");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(600); }
    });

    it("leaving the split gives Zotero's layout back: its pane, its readers, its library view", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1);
        const s = await split(L.id, t1.id, "right");
        let view = null;
        try {
            await readerReady(t1.id);
            await setPaneOpen(true);
            const W = wv._wvTabSplitTotal(win);
            await leftAt(s, W - 700);
            ZT.select(t1.id); await sleep(900);
            assert.isTrue(pane().classList.contains("stacked"), "fixture: the PDF side stacked");
            await leftAt(s, 700);
            if (perViewLayout(L.id)) assert.strictEqual(orientOf(L.id), "vertical", "fixture: the library side stacked");
            view = libView(L.id);
            await leftAt(s, W - 700);
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
        await sleep(900);
        // The PDF still selected, now a normal tab: Zotero's standard layout.
        assert.strictEqual(ZT.selectedID, t1.id, "fixture: the PDF selected");
        assert.isFalse(pane().classList.contains("stacked"), "Zotero's pane standard again");
        assert.strictEqual(doc.getElementById("zotero-context-pane-sidenav").parentElement, pane(), "its side navigation back beside it");
        assert.isFalse(doc.getElementById("zotero-context-pane-sidenav").classList.contains("stacked"), "not stacked");
        assert.notExists(placeholderOf(t1.id), "the reader without bottom room");
        ZT.select(L.id); await sleep(900);
        assert.strictEqual(orientOf(L.id), "horizontal", "the library view in Zotero's layout");
        if (view) assert.isFalse(Object.prototype.hasOwnProperty.call(view, "applyLayout"), "nothing of the split left on the view's applyLayout");
        assert.notOk(doc.querySelector("[wv-tsplit-stacked], [wv-tsplit-stackpaned]"), "no split mark left");
        assert.deepEqual(zoteroLayout(), { layout: layout0, temp: temp0 }, "Zotero's layout untouched");
    });
});
