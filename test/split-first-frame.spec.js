/* global describe, it, before, after, assert, Zotero, wvT */
// Split view: a split's layout from its first frame (tab-split.ts, item 18). MJT
// 2026-11-12, the left tab of an unloaded [Kundu | Lindborg] pill selected: the previous
// tab first, then Kundu alone at full width with the context pane at the window's edge,
// the split only later: "When I first switch to a split view first tab, it first appears
// only one tab before getting into split view. Is it possible to make it directly appear
// in split view correctly?" The split was laid out by the tab notifier's Sync (a later
// task: a frame could paint before it), its layer by another timer, and an unloaded
// partner was loaded by selecting it and coming back.
describe("Weavero — split view: the split from its first frame", function () {
    this.timeout(200000);
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
    const pane = () => doc.getElementById("zotero-context-pane");
    const CP = () => win.ZoteroContextPane;
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const within = (a, b, tol = 0.5) => !!a && !!b && a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    const rdoc = (id) => { const r = reader(id); return r && r._iframeWindow && r._iframeWindow.document; };
    const typeOf = (id) => String((ZT._tabs.find(t => t.id === id) || {}).type);
    async function openPDF(att) {
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    async function readerReady(id) {
        return waitFor(() => { const d = rdoc(id); return d && d.querySelector(".toolbar > .end") ? d : null; }, 20000, "reader toolbar " + id);
    }
    async function split(a, b) {
        separateAll();
        ZT.select(a); await sleep(300);
        const s = wv._wvTabSplitCreate(win, a, b, { select: "right" });
        assert.ok(s, "fixture: the split");
        await sleep(1000);
        return s;
    }

    /** The layout a frame would paint now: both cards side by side, the split's, and
     *  Zotero's pane inside a card or closed -- never at the window's edge. */
    const frameState = (s) => {
        const d = deck(), L = doc.getElementById(s.left), R = doc.getElementById(s.right);
        const split = !!(d.hasAttribute("wv-tsplit") && L && R && L.classList.contains("wv-tsplit-panel") && R.classList.contains("wv-tsplit-panel"));
        const lr = L && L.getBoundingClientRect(), rr = R && R.getBoundingClientRect();
        const both = !!(lr && rr && lr.width > 40 && rr.width > 40 && lr.right <= rr.left + 1);
        const pr = pane().getBoundingClientRect();
        const paneOK = !!CP().collapsed || pr.width < 1 || within(pr, lr, 1) || within(pr, rr, 1);
        return split && both && paneOK ? "split" : "single(split " + split + ", both " + both + ", pane " + paneOK + ")";
    };
    /** A click on tab `id` in the strip, as MJT selects it: the tab bar calls the
     *  select Zotero bound at its init, past any wrap of Zotero_Tabs.select. */
    const clickTab = (id) => {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + id + '"]')).find(x => x.getBoundingClientRect().width > 0);
        assert.ok(el, "fixture: tab " + id + " in the strip");
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, button: 0, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + r.height / 2 };
        for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new win.MouseEvent(type, o));
    };
    /** Click `id` in the strip and record what each frame would paint: at once (the
     *  click's own task, before any paint), after the microtasks, then eight frames
     *  (bounded: a hidden window draws none), with the time from the click. */
    async function framesAfterSelect(s, id) {
        const out = [];
        const t0 = win.performance.now();
        const at = () => Math.round(win.performance.now() - t0) + "ms";
        clickTab(id);
        assert.strictEqual(ZT.selectedID, id, "fixture: the click selected the tab");
        out.push("sync@" + at() + " " + frameState(s));
        await Promise.resolve();
        out.push("micro@" + at() + " " + frameState(s));
        for (let i = 0; i < 8; i++) {
            await Promise.race([new Promise(r => win.requestAnimationFrame(() => r(true))), sleep(60)]);
            out.push("f" + i + "@" + at() + " " + frameState(s));
        }
        return out;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        if (typeof ZT.unload !== "function") wvT.absent("Zotero_Tabs.unload");
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        ow = win.outerWidth; oh = win.outerHeight;
        try { win.resizeTo(1920, 1040); } catch (er) {}
        await sleep(600);
        pdf1 = await wvT.createTestPDFItem("wv-ff-1");
        pdf2 = await wvT.createTestPDFItem("wv-ff-2");
        pdf3 = await wvT.createTestPDFItem("wv-ff-3");
        note = new Zotero.Item("note"); note.setNote("<p>wv split first frame note</p>"); await note.saveTx();
        for (const it of [pdf1, pdf2, pdf3]) await openPDF(it);
        await win.ZoteroPane.openNote(note.id, { openInWindow: false });
        await waitFor(() => tabOfItem(note), 15000, "note tab");
        await sleep(500);
    });

    after(async function () {
        if (!win) return;
        try { separateAll(); } catch (er) {}
        for (const it of [pdf1, pdf2, pdf3, note]) { const t = it && tabOfItem(it); if (t) { try { ZT.close(t.id); } catch (er) {} } }
        await sleep(300);
        try { ZT.select(libTab().id); } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3, note);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
        try { win.resizeTo(ow, oh); } catch (er) {}
        await sleep(300);
    });

    it("18. selecting a split's tab shows the split from its first frame: reader|reader, library|reader, note|reader with both loaded, and both sides unloaded (a restart) -- the partner loaded without being selected", async function () {
        const L = libTab(), t1 = tabOfItem(pdf1), t2 = tabOfItem(pdf2), t3 = tabOfItem(pdf3), tn = tabOfItem(note);
        const bad = [], log = [];
        const run = async (name, a, b, selectID) => {
            const s = await split(a, b);
            try {
                ZT.select(t3.id); await sleep(900);
                const fr = await framesAfterSelect(s, selectID);
                log.push(name + ": " + fr.join(" / "));
                const off = fr.filter(x => !/ split$/.test(x));
                if (off.length) bad.push(name + ": " + off.join(" / "));
                await sleep(600);
            }
            finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
        };
        await run("reader|reader", t1.id, t2.id, t1.id);
        await run("library|reader", L.id, t1.id, L.id);
        await run("note|reader", tn.id, t1.id, t1.id);
        // Both sides unloaded, as after a restart: the left one selected.
        const s = await split(t1.id, t2.id);
        try {
            await readerReady(t1.id); await readerReady(t2.id);
            ZT.select(t3.id); await sleep(900);
            ZT.unload(t1.id); ZT.unload(t2.id);
            // Weavero's stuck-loading watchdog (tabs.ts, 6 s after a select) would
            // take this fresh load of a tab selected moments ago for a stuck one.
            await sleep(6500);
            assert.ok(/-unloaded$/.test(typeOf(t1.id)) && /-unloaded$/.test(typeOf(t2.id)), "fixture: both sides unloaded: " + typeOf(t1.id) + ", " + typeOf(t2.id));
            const sels = [], selLog = [];
            const ringAt = (/** @type {any} */ (Zotero)._wvSplitRing || []).length;
            const tw = Date.now();
            const watch = win.setInterval(() => { const id = ZT.selectedID; if (sels[sels.length - 1] !== id) selLog.push((Date.now() - tw) + "ms " + id + " " + typeOf(id)); sels.push(id); }, 10);
            // Who selects another tab on the way: the stack of each such change of
            // Zotero_Tabs._selectedID (the tab bar calls a select bound at init).
            const stacks = [];
            let selVal = ZT._selectedID;
            Object.defineProperty(ZT, "_selectedID", {
                configurable: true,
                get() { return selVal; },
                set(v) {
                    if (v !== t1.id && v !== selVal) stacks.push((Date.now() - tw) + "ms _selectedID=" + v + " from " + String(new Error().stack).split("\n").slice(1, 10).join(" < "));
                    selVal = v;
                },
            });
            const restoreSel = () => { const v = selVal; delete ZT._selectedID; ZT._selectedID = v; };
            let fr = [];
            const t0 = Date.now();
            try {
                fr = await framesAfterSelect(s, t1.id);
                await waitFor(() => !/-(unloaded|loading)$/.test(typeOf(t1.id)) && !/-(unloaded|loading)$/.test(typeOf(t2.id)), 20000, "both sides loaded");
                await readerReady(t1.id); await readerReady(t2.id);
            }
            finally { win.clearInterval(watch); restoreSel(); }
            if (stacks.length) bad.push("both unloaded: selects on the way: " + stacks.join(" || "));
            log.push("both unloaded: " + fr.join(" / ") + " / both loaded after " + (Date.now() - t0) + "ms");
            const off = fr.filter(x => !/ split$/.test(x));
            if (off.length) bad.push("both unloaded: " + off.join(" / "));
            if (sels.some(x => x !== t1.id)) bad.push("both unloaded: another tab selected on the way (left " + t1.id + ", right " + t2.id + "): " + selLog.join(" | ") + " -- ring: " + (/** @type {any} */ (Zotero)._wvSplitRing || []).slice(ringAt).join(" | "));
            await sleep(600);
            if (frameState(s) !== "split") bad.push("both unloaded, then loaded: " + frameState(s));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); await sleep(400); }
        Zotero.debug("[Weavero] split first frame: " + log.join(" || "));
        assert.deepEqual(bad, [], "the split from the first frame, every case");
    });
});
