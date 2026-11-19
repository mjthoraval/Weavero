/* global describe, it, before, after, assert, Zotero, wvT, Components, IOUtils, PathUtils */
// Split view: the side beside the library follows the item selected in it
// (tab-split-follow.ts). MJT 2026-11-14: "a preview option to follow the articles
// when switching items in the library"; forum 132980, asoler1562: "I would quite
// like to have my library open and scrollable while I open PDFs on a viewer pane
// ... this gets tiresome when I have a range of PDFs which I am continuously
// opening". MJT 2026-11-15: "The Follow Selected Item [side] should not use the full
// reader, as it is too heavy. Please make something similar to the now deprecated
// Preview plugin by windingwind." The side shows Zotero's preview reader (what the
// item pane's attachment preview uses, not in Zotero.Reader._readers), scrollable,
// in the side's own tab -- an unloaded reader tab, the same tab from one item to the
// next. Opening it (Open, a double-click) loads Zotero's reader in place; the next
// selection brings a preview back. Off unless the split is told to follow.
describe("Weavero — split view: the side beside the library previews its selected item", function () {
    this.timeout(300000);
    const Cu = Components.utils;
    let wv, lib, win, doc, ZT, prevSplit, prevFollow;
    // Three articles with one PDF each; one with two PDFs; one without a file; a
    // note of its own; an article with a snapshot; a book with an EPUB; an article
    // with an eight-page PDF.
    let p1, a1, p2, a2, p3, a3, p4, a4a, a4b, p5, note, p6, snap, p7, epub, p8, big;
    const tmp = [];
    const all = () => [a1, a2, a3, a4a, a4b, snap, epub, big, note, p1, p2, p3, p4, p5, p6, p7, p8];
    const docs = () => [a1, a2, a3, a4a, a4b, snap, epub, big];
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(50); }
        throw new Error("timeout waiting for " + (typeof what === "function" ? what() : what));
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabByID = (id) => ZT._tabs.find(t => t && t.id === id) || null;
    const tabsOfItem = (it) => ZT._tabs.filter(t => t && t.data && t.data.itemID === it.id);
    const splitOf = (id) => wv._wvTabSplitOf(win, id);
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const reader = (id) => /** @type {any} */ (Zotero.Reader.getByTabID(id));
    const readers = () => (Zotero.Reader._readers || []).length;
    /** The split's document side (the tab that is not the library). */
    const side = () => { const L = libTab(); const s = L && splitOf(L.id); return s ? tabByID(s.left === L.id ? s.right : s.left) : null; };
    const info = (id) => { if (typeof wv._wvSplitFollowPreviewInfo !== "function") wvT.absent("plugin._wvSplitFollowPreviewInfo"); return wv._wvSplitFollowPreviewInfo(win, id); };
    /** The side shows `att` as a PREVIEW: its tab unloaded and holding `att`, the
     *  preview drawn, and no reader of Zotero's for the tab. */
    const previews = (att) => {
        const t = side();
        if (!t || !t.data || t.data.itemID !== att.id || !/-unloaded$/.test(String(t.type))) return false;
        const i = info(t.id);
        return !!(i && i.ok && i.itemID === att.id && i.reader && !reader(t.id));
    };
    /** The side shows `att` in a reader of its own (loaded). */
    const readerShows = (att) => {
        const t = side();
        if (!t || !t.data || t.data.itemID !== att.id || String(t.type) !== "reader") return false;
        const r = reader(t.id);
        return !!(r && r.itemID === att.id && r._internalReader && r._iframeWindow);
    };
    const state = () => {
        const t = side(); const r = t && reader(t.id);
        let i = null;
        try { i = t && info(t.id); } catch (e) {}
        return "side " + (t ? t.id + " type " + t.type + " item " + (t.data && t.data.itemID) : "none") + ", reader " + (r ? r.itemID : "none")
            + ", preview " + (i ? JSON.stringify({ itemID: i.itemID, ok: i.ok, done: i.done, loading: i.loading, type: i.type, status: i.status }) : "none") + ", selected " + ZT.selectedID;
    };
    /** The preview reader's pdf.js viewer. */
    const viewerOf = (id) => info(id).reader._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer;
    /** Loads the follow made since `mark` (the split's ring, tab-split.ts). The ring keeps its
     *  last 300 lines, so a mark is a line of its own written into it, never an index: once the
     *  ring is full each new line pushes an old one out and its length stays 300 -- an index mark
     *  then counted nothing (night 2026-11-17: "one load: expected +0 to equal 1" whenever the
     *  split-dock spec had filled the ring first, full suites on Zotero 10 and 11). */
    const ring = () => /** @type {any} */ (Zotero)._wvSplitRing || [];
    let markSeq = 0;
    const ringMark = () => {
        const tag = "spec mark " + (++markSeq) + " " + Date.now();
        wv._wvTabSplitRing(tag);
        return tag;
    };
    const sinceMark = (mark) => { const r = ring(); const i = r.findIndex(l => l.endsWith(mark)); return r.slice(i + 1); };
    const loadsSince = (mark) => sinceMark(mark).filter(l => /follow: show /.test(l)).length;
    /** Reopen Closed Tab's last entry, as a comparable string. */
    const closedMark = () => {
        try { if (Array.isArray(ZT._history)) return "h" + ZT._history.length; } catch (e) {}
        try {
            const S = /** @type {any} */ (Zotero).Session;
            const last = S && typeof S.getLastClosed === "function" ? S.getLastClosed() : null;
            return last ? JSON.stringify(last.tabs ? last.tabs.map(t => t && t.data && t.data.itemID) : "window") : "none";
        }
        catch (e) { return "?"; }
    };
    async function select(...items) {
        const L = libTab();
        if (ZT.selectedID !== L.id) { ZT.select(L.id); await sleep(300); }
        const ZP = win.ZoteroPane;
        if (!items.length) { ZP.itemsView.selection.clearSelection(); return; }
        if (items.length === 1) await ZP.selectItem(items[0].id);
        else await ZP.selectItems(items.map(i => i.id));
    }
    /** A row selected at once, as a key press does it (no wait for the pane). */
    function selectFast(item) {
        const iv = win.ZoteroPane.itemsView;
        const i = iv.getRowIndexByID(item.id);
        assert.isNumber(i, "fixture: a row for item " + item.id);
        iv.selection.select(i);
    }
    /** A library | `att` split, `att` in a reader of its own, the library selected
     *  and nothing selected in it (turning the follow on shows the selected item at
     *  once); follow as asked. */
    async function fixture(att, follow) {
        separateAll();
        const L = libTab();
        ZT.select(L.id); await sleep(300);
        await select(); await sleep(250);
        let t = tabsOfItem(att)[0];
        if (!t) {
            await Zotero.Reader.open(att.id, null, { openInBackground: true, allowDuplicate: true });
            t = await waitFor(() => tabsOfItem(att)[0], 20000, "the PDF's tab");
        }
        const s = wv._wvTabSplitCreate(win, L.id, t.id, { select: "none" });
        assert.ok(s, "fixture: the split");
        await waitFor(() => readerShows(att), 20000, () => "the fixture's document: " + state());
        if (follow) { wv._wvSplitFollowSet(win, s.id, true); await sleep(200); }
        return s;
    }
    async function withTabMenu(tabID, fn) {
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + tabID + '"], #wv-pinned-mirrors .wv-pinned-mirror[data-tab-id="' + tabID + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), tabID);
        await sleep(700);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        const items = [];
        for (const p of pops) for (const mi of p.querySelectorAll(":scope > menuitem")) {
            if (mi.hidden || win.getComputedStyle(mi).display === "none") continue;
            items.push(mi);
        }
        try { return await fn(items); }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (er) {} } await sleep(200); }
    }
    const byKey = (items, key) => items.find(x => x.getAttribute("data-wv-key") === key) || null;
    const checked = (mi) => mi.hasAttribute("checked") && mi.getAttribute("checked") !== "false";
    async function closeDocTabs() {
        separateAll();
        for (const it of docs()) for (const t of (it ? tabsOfItem(it) : [])) { try { ZT.close(t.id); } catch (er) {} }
        await sleep(400);
    }
    /** A PDF of `n` empty Letter pages, xref offsets exact (wvT.minimalPDFBytes,
     *  more pages). */
    function pagesPDF(n) {
        const objs = ["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"];
        const kids = [];
        for (let i = 0; i < n; i++) kids.push((3 + i) + " 0 R");
        objs.push("2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>\nendobj\n");
        for (let i = 0; i < n; i++) objs.push((3 + i) + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n");
        let body = "%PDF-1.4\n";
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        return body + xref + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
    }
    /** Every `ms`, `fn()` recorded until the returned stop() is called. */
    function sampler(fn, ms) {
        const seen = [];
        const h = win.setInterval(() => { try { seen.push(fn()); } catch (e) {} }, ms || 15);
        return { seen, stop: () => win.clearInterval(h) };
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        // The preview's own methods (_wvSplitFollowPreviewInfo, _wvSplitFollowOpen)
        // are checked where a case uses them.
        for (const m of ["_wvSplitFollowOK", "_wvSplitFollowOn", "_wvSplitFollowSet", "_wvSplitFollowSync", "_wvSplitFollowTarget", "_wvSplitFollowKeep",
            "_wvSplitFollowUnwireAll", "_wvTabSplitCreate", "_wvTabSplitOf", "_wvTabSplitOpenItem", "_wvTabSplitRestore"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        prevFollow = Zotero.Prefs.get("weavero.splitViewFollow");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        Zotero.Prefs.set("weavero.splitViewFollow", false);
        const article = async (title) => wvT.createItem("journalArticle", { title });
        p1 = await article("WV follow one"); a1 = await wvT.createTestPDFItem("wv-follow-1", { parentItemID: p1.id });
        p2 = await article("WV follow two"); a2 = await wvT.createTestPDFItem("wv-follow-2", { parentItemID: p2.id });
        p3 = await article("WV follow three"); a3 = await wvT.createTestPDFItem("wv-follow-3", { parentItemID: p3.id });
        p4 = await article("WV follow four"); a4a = await wvT.createTestPDFItem("wv-follow-4a", { parentItemID: p4.id });
        a4b = await wvT.createTestPDFItem("wv-follow-4b", { parentItemID: p4.id });
        p5 = await article("WV follow five, no file");
        note = new Zotero.Item("note"); note.setNote("<p>wv follow note</p>"); await note.saveTx();
        p6 = await article("WV follow six"); snap = await wvT.createTestSnapshotItem("wv-follow-6", { parentItemID: p6.id });
        p7 = await article("WV follow seven"); epub = await wvT.createTestEPUBItem("wv-follow-7", { parentItemID: p7.id });
        p8 = await article("WV follow eight pages");
        const path = PathUtils.join(PathUtils.tempDir, "wv-follow-8-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, pagesPDF(8));
        tmp.push(path);
        big = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: p8.id });
        try { ZT.select(libTab().id); } catch (er) {}
        await sleep(500);
    });

    after(async function () {
        if (!win) return;
        try { await closeDocTabs(); } catch (er) {}
        try { ZT.select(libTab().id); } catch (er) {}
        try { await select(); } catch (er) {}
        await wvT.erase(...all());
        for (const p of tmp) { try { await IOUtils.remove(p); } catch (er) {} }
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { if (prevFollow === undefined) Zotero.Prefs.clear("weavero.splitViewFollow"); else Zotero.Prefs.set("weavero.splitViewFollow", prevFollow); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
    });

    it("1. nothing changes until it is turned on: a library | PDF split keeps its PDF while the selection moves, and the items view has no listener of Weavero's", async function () {
        const s = await fixture(a1, false);
        assert.notOk(s.follow, "a new split does not follow");
        assert.isFalse(wv._wvSplitFollowOn(win, s), "not on");
        const before = (win.ZoteroPane.itemsView._events && win.ZoteroPane.itemsView._events.select && win.ZoteroPane.itemsView._events.select.listeners.size) || 0;
        const mark = ringMark();
        await select(p2);
        await sleep(1200);
        assert.isTrue(readerShows(a1), "the PDF stays: " + state());
        assert.strictEqual(loadsSince(mark), 0, "no load");
        assert.notOk(doc.querySelector(".wv-follow-preview"), "no preview");
        const after = (win.ZoteroPane.itemsView._events && win.ZoteroPane.itemsView._events.select && win.ZoteroPane.itemsView._events.select.listeners.size) || 0;
        assert.strictEqual(after, before, "no select listener added to the items view");
    });

    it("2. Follow Selected Item is offered on the tabs of a library | document split only, as a check mark; Keep Document in New Tab only while it follows", async function () {
        const s = await fixture(a1, false);
        const L = libTab(), t = side();
        for (const id of [L.id, t.id]) {
            await withTabMenu(id, async (items) => {
                const mi = byKey(items, "splitFollow");
                assert.ok(mi, "the entry on " + id + ": " + items.map(x => x.getAttribute("data-wv-key") || x.getAttribute("label")).join(" | "));
                assert.strictEqual(mi.getAttribute("label"), "Follow Selected Item");
                assert.strictEqual(mi.getAttribute("type"), "checkbox");
                assert.isFalse(checked(mi), "not checked");
                assert.notOk(byKey(items, "splitKeep"), "no Keep entry while it does not follow");
                // With the split's own entries, in the canonical order.
                const keys = items.map(x => x.getAttribute("data-wv-key")).filter(k => /^split/.test(k || ""));
                assert.deepEqual(keys, ["splitSeparate", "splitReverse", "splitFollow"], "after Separate and Reverse");
            });
        }
        // Turned on from the menu.
        await withTabMenu(t.id, async (items) => { byKey(items, "splitFollow").dispatchEvent(new win.Event("command")); });
        await sleep(300);
        assert.isTrue(!!s.follow && wv._wvSplitFollowOn(win, s), "the split follows");
        await withTabMenu(L.id, async (items) => {
            assert.isTrue(checked(byKey(items, "splitFollow")), "checked now");
            const keep = byKey(items, "splitKeep");
            assert.ok(keep, "Keep is offered");
            assert.strictEqual(keep.getAttribute("label"), "Keep Document in New Tab");
        });
        assert.ok(doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"][data-wv-follow]'), "the followed tab is marked in the strip");
        assert.strictEqual(win.getComputedStyle(doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"] .tab-name')).fontStyle, "italic", "its title in italics");
        // Off again from the menu.
        await withTabMenu(L.id, async (items) => { byKey(items, "splitFollow").dispatchEvent(new win.Event("command")); });
        await sleep(300);
        assert.isFalse(wv._wvSplitFollowOn(win, s), "off again");
        assert.notOk(doc.querySelector("#tab-bar-container .tab[data-wv-follow]"), "no mark left");
        // Not on other splits, nor on a tab alone.
        separateAll();
        const t2 = (await (async () => { await Zotero.Reader.open(a2.id, null, { openInBackground: true, allowDuplicate: true }); return waitFor(() => tabsOfItem(a2)[0], 20000, "a second PDF tab"); })());
        const pair = wv._wvTabSplitCreate(win, t.id, t2.id, { select: "left" });
        await sleep(600);
        try {
            assert.isNull(wv._wvSplitFollowOK(win, pair), "a PDF | PDF split cannot follow");
            await withTabMenu(t.id, async (items) => { assert.notOk(byKey(items, "splitFollow"), "no entry on a PDF | PDF split"); });
        }
        finally { wv._wvTabSplitSeparate(win, pair.id); await sleep(300); }
        await withTabMenu(t.id, async (items) => { assert.notOk(byKey(items, "splitFollow"), "no entry on a tab alone"); });
        ZT.close(t2.id); await sleep(300);
    });

    it("3. with it on, another item selected shows a PREVIEW of its document in the SAME tab: no reader of Zotero's (the opened one closes), the split, the tab's place and the library's selection stay, nothing goes to Reopen Closed Tab", async function () {
        const s = await fixture(a1, true);
        const L = libTab(), id = side().id;
        const idx = ZT._tabs.findIndex(t => t.id === id), count = ZT._tabs.length, closed = closedMark();
        const r0 = readers();
        const mark = ringMark();
        await select(p2);
        // The keyboard in the items list, as after a click or an arrow key there.
        try { win.ZoteroPane.itemsView.focus(); } catch (er) {}
        await waitFor(() => previews(a2), 20000, () => "a preview of the second article's PDF: " + state());
        await sleep(300);
        const ae = doc.activeElement;
        assert.ok(ae && doc.getElementById(L.id).contains(ae) && !doc.getElementById(id).contains(ae),
            "the keyboard stays in the library side: " + (ae && (ae.id || ae.className || ae.localName)));
        assert.strictEqual(side().id, id, "the same tab");
        assert.strictEqual(String(side().type), "reader-unloaded", "an unloaded reader tab: no reader in it");
        assert.notOk(reader(id), "no reader for the tab");
        assert.strictEqual(readers(), r0 - 1, "the opened document's reader closed, none made: " + readers() + " vs " + r0);
        assert.notInclude(Zotero.Reader._readers || [], info(id).reader, "the preview reader is not one of Zotero's readers");
        assert.strictEqual(info(id).type, "pdf", "a PDF preview");
        assert.strictEqual(splitOf(L.id), s, "the same split");
        assert.isTrue(wv._wvSplitFollowOn(win, s), "still following");
        assert.strictEqual(ZT._tabs.findIndex(t => t.id === id), idx, "at the same place in the strip");
        assert.strictEqual(ZT._tabs.length, count, "no tab added");
        assert.strictEqual(ZT.selectedID, L.id, "the library stays selected");
        assert.strictEqual(loadsSince(mark), 1, "one load");
        assert.strictEqual(closedMark(), closed, "Reopen Closed Tab has no entry for it");
        assert.strictEqual(doc.querySelectorAll("#tabs-deck > [id='" + id + "']").length, 1, "one panel for the tab");
        const panel = doc.getElementById(id);
        assert.strictEqual(panel.querySelectorAll(".wv-follow-preview").length, 1, "one preview in it");
        assert.strictEqual(panel.querySelectorAll(".wv-follow-preview browser").length, 1, "one page in the preview");
        await waitFor(() => /WV follow two/.test(String(side().title)), 5000, () => "the tab's title: " + side().title);
        assert.ok(doc.getElementById("tabs-deck").hasAttribute("wv-tsplit"), "the split on screen");
        assert.ok(doc.querySelector('#tab-bar-container .tab[data-id="' + id + '"][data-wv-follow]'), "the tab still marked");
        // A press in the preview leaves it a preview, the library selected.
        panel.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, button: 0 }));
        panel.dispatchEvent(new win.FocusEvent("focusin", { bubbles: true }));
        await sleep(400);
        assert.strictEqual(ZT.selectedID, L.id, "a press in the preview does not select its tab");
        assert.isTrue(previews(a2), "and it stays a preview: " + state());
        // On to a third, then back to the first: never a reader.
        const spy = sampler(() => readers());
        try {
            await select(p3);
            await waitFor(() => previews(a3), 20000, () => "the third: " + state());
            await select(p1);
            await waitFor(() => previews(a1), 20000, () => "back to the first: " + state());
        }
        finally { spy.stop(); }
        assert.isAtMost(Math.max(...spy.seen), r0 - 1, "no reader made on the way: " + [...new Set(spy.seen)].join(","));
        assert.strictEqual(side().id, id, "still the same tab");
    });

    // The library's own item pane shows the selected item; the preview side draws no
    // second one (Zotero's context pane stays where Zotero leaves it for a library).
    it("3b. the preview side has no item pane of its own", async function () {
        await fixture(a1, true);
        const L = libTab(), id = side().id;
        await select(p2);
        await waitFor(() => previews(a2), 20000, () => "the preview: " + state());
        await sleep(600);
        const card = doc.getElementById(id);
        assert.isFalse(card.hasAttribute("wv-tsplit-paned"), "no room kept for an item pane in the preview's card");
        const pane = doc.getElementById("zotero-context-pane");
        const pr = pane.getBoundingClientRect(), cr = card.getBoundingClientRect();
        const over = pr.width > 0 && pr.height > 0 && pr.left < cr.right && pr.right > cr.left && pr.top < cr.bottom && pr.bottom > cr.top && win.getComputedStyle(pane).visibility !== "hidden";
        assert.isFalse(over, "Zotero's item pane is not drawn over the preview: " + JSON.stringify({ pr: [pr.left, pr.top, pr.width, pr.height], cr: [cr.left, cr.top, cr.width, cr.height] }));
        const ghost = doc.getElementById("wv-tsplit-ghost");
        assert.isTrue(!ghost || ghost.getBoundingClientRect().width === 0 || win.getComputedStyle(ghost).display === "none", "no second item pane drawn for it");
        assert.strictEqual(ZT.selectedID, L.id, "the library selected");
    });

    it("3c. a PDF preview scrolls through the whole document at the side's width, as the old PDF Preview plugin's column of pages did", async function () {
        await fixture(a1, true);
        const id = side().id;
        await select(p8);
        await waitFor(() => previews(big), 20000, () => "the eight-page PDF: " + state());
        const v = viewerOf(id);
        const vc = v.container;
        const vw = vc.ownerDocument.defaultView;
        await waitFor(() => String(v.currentScaleValue) === "page-width", 5000, () => "the scale: " + v.currentScaleValue);
        assert.strictEqual(v.scrollMode, 0, "pages one under the other (pdf.js ScrollMode.VERTICAL), not one at a time");
        assert.strictEqual(v.pagesCount, 8, "every page");
        assert.strictEqual(vw.getComputedStyle(vc).overflowY, "auto", "the viewer scrolls");
        assert.isAbove(vc.scrollHeight, 3 * vc.clientHeight, "a column of pages taller than the side: " + vc.scrollHeight + " / " + vc.clientHeight);
        const pw = v._pages[0].div.getBoundingClientRect().width;
        assert.isAbove(pw, 0.8 * vc.clientWidth, "a page as wide as the side: " + pw + " / " + vc.clientWidth);
        vc.scrollTop = vc.scrollHeight;
        await sleep(300);
        assert.isAbove(vc.scrollTop, vc.clientHeight, "scrolled to the end");
        assert.strictEqual(vc.ownerDocument.querySelectorAll(".textLayer").length, 0, "no text layer: Zotero's preview mode");
    });

    it("4. which document: an attachment row its own file, an item its best attachment with Weavero's default first; a snapshot and an EPUB previewed too", async function () {
        const pick = async (it) => { const t = await wv._wvSplitFollowTarget(it); return t && t.att ? t.att.id : null; };
        assert.strictEqual(await pick(p1), a1.id, "an item: its PDF");
        assert.strictEqual(await pick(a4b), a4b.id, "an attachment row: itself");
        const best = await p4.getBestAttachment();
        assert.strictEqual(await pick(p4), best.id, "an item with two PDFs: Zotero's best attachment");
        const other = best.id === a4a.id ? a4b : a4a;
        await wv._wvSetDefaultChild(other);
        try { assert.strictEqual(await pick(p4), other.id, "Weavero's default attachment first"); }
        finally { await wv._wvClearDefaultChild(other); }
        assert.strictEqual(await pick(p6), snap.id, "a snapshot");
        assert.isNull(await pick(p5), "an item without a file: none");
        assert.isNull(await pick(note), "a note: none");
        // Shown, in the same tab, never in a reader.
        await fixture(a1, true);
        const id = side().id;
        await select(a4b);
        await waitFor(() => previews(a4b), 20000, () => "the attachment row's file: " + state());
        const r0 = readers();
        await select(p6);
        await waitFor(() => previews(snap), 20000, () => "the snapshot: " + state());
        assert.strictEqual(side().id, id, "the same tab");
        assert.strictEqual(info(id).type, "snapshot", "a snapshot preview");
        await select(p7);
        await waitFor(() => previews(epub), 20000, () => "the EPUB: " + state());
        assert.strictEqual(side().id, id, "the same tab");
        assert.strictEqual(info(id).type, "epub", "an EPUB preview");
        const ed = info(id).reader._internalReader._primaryView._iframeWindow.document;
        assert.include(String(ed.body.className), "flow-mode-scrolled", "an EPUB scrolls (Zotero's preview pages it)");
        // And back to a PDF from there.
        await select(p1);
        await waitFor(() => previews(a1), 20000, () => "back to a PDF: " + state());
        assert.strictEqual(info(id).type, "pdf", "a PDF preview again");
        assert.strictEqual(readers(), r0, "no reader made for any of them");
    });

    it("5. the side keeps its document for an item without a file, a note, several items, no selection, while it is read aloud, and while the document side is the one in use", async function () {
        await fixture(a1, true);
        const mark = ringMark();
        for (const [what, sel] of [["an item without a file", [p5]], ["a note", [note]], ["two items", [p2, p3]], ["nothing selected", []]]) {
            await select(...sel);
            await sleep(900);
            assert.isTrue(readerShows(a1), what + ": the document stays: " + state());
        }
        // Read Aloud playing in the document: not replaced (Zotero never unloads such
        // a tab either, tabs.js canUnload).
        side().audioStatus = { active: true, paused: false };
        try {
            await select(p2);
            await sleep(900);
            assert.isTrue(readerShows(a1), "while it is read aloud: the document stays: " + state());
        }
        finally { delete side().audioStatus; }
        // The document side selected (reading): a selection made meanwhile waits.
        const id = side().id;
        ZT.select(id); await sleep(300);
        await win.ZoteroPane.itemsView.selectItem(p3.id);
        await sleep(900);
        assert.isTrue(readerShows(a1), "while the document side is in use: " + state());
        assert.strictEqual(loadsSince(mark), 0, "no load at all");
        ZT.select(libTab().id); await sleep(300);
    });

    it("6. fast browsing: five selections in a row draw at most two previews, end on the last, and never hold two pages", async function () {
        await fixture(a1, true);
        await select(p3);
        await waitFor(() => previews(a3), 20000, () => "start: " + state());
        const id = side().id;
        const r0 = readers();
        const mark = ringMark();
        const pages = sampler(() => doc.querySelectorAll("#tabs-deck .wv-follow-preview browser").length, 10);
        try {
            // As held arrow keys: a row every 40 ms, nothing awaited between them.
            for (const p of [p1, p2, p3, p1, p2]) { selectFast(p); await sleep(40); }
            await waitFor(() => previews(a2), 20000, () => "the last selection: " + state());
            await sleep(1500);
        }
        finally { pages.stop(); }
        assert.isTrue(previews(a2), "settled on the last: " + state());
        assert.isAtMost(loadsSince(mark), 2, "loads: " + sinceMark(mark).join(" / "));
        assert.isAtMost(Math.max(...pages.seen), 1, "one preview page at a time");
        assert.strictEqual(readers(), r0, "no reader");
        assert.notOk(reader(id), "none for the tab");
    });

    it("7. Keep Document in New Tab: the document in a tab of its own, outside the split, the split still following", async function () {
        const s = await fixture(a1, true);
        const L = libTab(), id = side().id;
        const n = ZT._tabs.length;
        await wv._wvSplitFollowKeep(win, s.id);
        await waitFor(() => tabsOfItem(a1).length === 2, 20000, "a second tab for the document");
        const kept = tabsOfItem(a1).find(t => t.id !== id);
        assert.strictEqual(ZT._tabs.length, n + 1, "one tab more");
        assert.notOk(splitOf(kept.id), "the kept tab is not in a split");
        assert.strictEqual(ZT.selectedID, L.id, "the library stays selected");
        assert.strictEqual(splitOf(L.id), s, "the split stays");
        await select(p2);
        await waitFor(() => previews(a2), 20000, () => "the split follows on: " + state());
        assert.ok(tabByID(kept.id) && tabByID(kept.id).data.itemID === a1.id, "the kept tab keeps its document");
        ZT.close(kept.id); await sleep(300);
    });

    it("8. the split's record carries it: a restart re-forms the split following, its side a preview again, no reader", async function () {
        const s = await fixture(a1, true);
        const L = libTab();
        const rec = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
        assert.ok(rec.some(r => r.l === "lib" && r.follow === true), "recorded: " + JSON.stringify(rec));
        assert.ok(wv._wvTabSplitRecords(win).some(r => r.follow === true), "in a session's records too");
        wv._wvSplitFollowSet(win, s.id, false);
        assert.notOk(JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]")).some(r => r.follow), "off: no longer recorded");
        // What a restart leaves: the tabs back, no split in memory.
        const restart = async (recs) => {
            win._wvTSplits = [];
            wv._wvTabSplitSync(win);
            Zotero.Prefs.set("weavero.tabSplits", JSON.stringify(recs));
            wv._wvTSplitPending = null;
            wv._wvTabSplitRestore(win);
            await sleep(500);
        };
        await restart(rec);
        const back = splitOf(L.id);
        assert.ok(back && back.follow === true && wv._wvSplitFollowOn(win, back), "re-formed, following: " + JSON.stringify(back));
        await select(p3);
        await waitFor(() => previews(a3), 20000, () => "it follows after the restart: " + state());
        // The record names the previewed document.
        const rec2 = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
        assert.ok(rec2.some(r => r.follow === true && (String(r.r || "").indexOf(a3.key) >= 0 || String(r.l || "").indexOf(a3.key) >= 0)), "the record holds the previewed document: " + JSON.stringify(rec2));
        // Again, now with the side unloaded as Zotero restores it, and another tab in
        // front: nothing drawn while the split is not on screen; shown, a preview, no
        // reader.
        const id = side().id;
        await Zotero.Reader.open(a2.id, null, { allowDuplicate: true });
        const front = await waitFor(() => ZT._tabs.find(t => t && t.data && t.data.itemID === a2.id && t.id !== id && ZT.selectedID === t.id), 20000, "another tab in front");
        const r0 = readers();
        await restart(rec2);
        await sleep(1500);
        const again = splitOf(L.id);
        assert.ok(again && again.follow === true, "re-formed again: " + JSON.stringify(again));
        assert.isNull(info(id), "no preview drawn while its split is not on screen");
        ZT.select(L.id);
        await waitFor(() => previews(a3), 20000, () => "shown, the restored side draws its preview: " + state());
        assert.strictEqual(readers(), r0, "the restored side loads no reader");
        ZT.close(front.id); await sleep(300);
    });

    it("9. the setting: Open PDF in Split View starts a split that follows only when asked to", async function () {
        await closeDocTabs();
        const L = libTab();
        ZT.select(L.id); await sleep(300);
        await wv._wvTabSplitOpenItem(win, p1);
        await waitFor(() => splitOf(L.id), 20000, "the split");
        assert.notOk(splitOf(L.id).follow, "the setting off: it does not follow");
        await closeDocTabs();
        ZT.select(L.id); await sleep(300);
        await wvT.withPref("weavero.splitViewFollow", true, async () => {
            await wv._wvTabSplitOpenItem(win, p1);
            await waitFor(() => splitOf(L.id), 20000, "the split");
            assert.isTrue(!!splitOf(L.id).follow, "the setting on: it follows");
            ZT.select(L.id); await sleep(400);
            await select(p2);
            await waitFor(() => previews(a2), 20000, () => "and previews the next selection: " + state());
        });
    });

    it("10. off: turning it off makes the preview the document itself, in place; the split view setting off or a teardown leaves no listener and no preview; separated, the tab is a tab like any other", async function () {
        const s = await fixture(a1, true);
        const id = side().id;
        const iv = win.ZoteroPane.itemsView;
        const size = () => (iv._events && iv._events.select && iv._events.select.listeners.size) || 0;
        const on = size();
        await select(p2);
        await waitFor(() => previews(a2), 20000, () => "a preview: " + state());
        const pr = info(id).reader;
        wv._wvSplitFollowSet(win, s.id, false);
        await waitFor(() => readerShows(a2), 20000, () => "turned off: the previewed document loads in the side: " + state());
        assert.strictEqual(size(), on - 1, "turned off: the items view's listener is gone");
        assert.notOk(doc.querySelector(".wv-follow-preview"), "no preview left");
        assert.isTrue(!!pr._isUninitialized, "its preview reader let go");
        await select(p3); await sleep(900);
        assert.isTrue(readerShows(a2), "and the document stays: " + state());
        // Nothing selected, so turning it on again shows nothing new.
        await select(); await sleep(250);
        wv._wvSplitFollowSet(win, s.id, true);
        await sleep(200);
        assert.strictEqual(size(), on, "on again: one listener, not two");
        wv._wvSplitFollowSync(win); wv._wvSplitFollowSync(win);
        assert.strictEqual(size(), on, "a second sync adds none");
        Zotero.Prefs.set("weavero.enableSplitView", false);
        await sleep(400);
        try { assert.strictEqual(size(), on - 1, "split view off: gone"); }
        finally { Zotero.Prefs.set("weavero.enableSplitView", true); await sleep(400); }
        assert.strictEqual(size(), on, "split view on again: back, the split still following");
        // A preview up, then what destroy() runs. The tab menu's entries go with it:
        // registered again after, for the rest of the run.
        await select(p3);
        await waitFor(() => previews(a3), 20000, () => "a preview before the teardown: " + state());
        const pr3 = info(id).reader;
        assert.include(wvT.src("destroy"), "_wvSplitFollowUnwireAll", "destroy() gives the follow's listeners and previews back");
        assert.include(wvT.src("_wvMainWindowTeardown"), "_wvSplitFollowReleaseWindow", "a closing window lets its previews go");
        wv._wvSplitFollowUnwireAll();
        try {
            assert.strictEqual(size(), on - 1, "teardown: gone");
            assert.notOk(doc.querySelector(".wv-follow-preview"), "no preview in the window");
            assert.isTrue(!!pr3._isUninitialized, "its reader let go");
            assert.isNull(info(id), "nothing of it kept");
            assert.notOk(doc.querySelector("#tab-bar-container .tab[data-wv-follow]"), "no mark in the strip");
            assert.notOk(doc.getElementById("wv-tsplit-follow-style"), "no style sheet");
            assert.notOk(wv._wvSplitFollowMenuID, "the tab menu's entries unregistered");
            assert.isTrue(/-unloaded$/.test(String(side().type)) && side().data.itemID === a3.id, "the side stays a tab of its document, unloaded: " + state());
        }
        finally { wv._wvSplitFollowRegisterMenus(); }
        wv._wvSplitFollowSync(win);
        assert.strictEqual(size(), on, "wired again by the next sync");
        await waitFor(() => previews(a3), 20000, () => "the preview drawn again: " + state());
        // Separated: a tab like any other.
        separateAll(); await sleep(400);
        assert.strictEqual(size(), on - 1, "no split: no listener");
        assert.notOk(doc.querySelector(".wv-follow-preview"), "no preview");
        const t = tabByID(id);
        assert.ok(t && t.data.itemID === a3.id && !splitOf(t.id), "the document's tab stays: " + JSON.stringify(t && { type: t.type, data: t.data }));
    });

    it("11. opening it: Open loads Zotero's reader in the same tab at the page shown, a double-click at the page pressed; the next selection brings a preview back (once a loading reader has loaded)", async function () {
        await fixture(a1, true);
        const L = libTab(), id = side().id;
        const closed = closedMark();
        await select(p8);
        await waitFor(() => previews(big), 20000, () => "the eight-page preview: " + state());
        const r0 = readers();
        const v = viewerOf(id);
        v.currentPageNumber = 4;
        await sleep(400);
        const btn = doc.getElementById(id).querySelector(".wv-follow-open");
        assert.ok(btn, "an Open button");
        assert.strictEqual(btn.textContent, "Open");
        assert.include(String(btn.getAttribute("title")), "annotate", "its tooltip says what it is for");
        btn.click();
        await waitFor(() => readerShows(big), 20000, () => "opened in the side: " + state());
        assert.strictEqual(side().id, id, "in the same tab");
        assert.strictEqual(ZT.selectedID, id, "the opened side selected");
        assert.notOk(doc.getElementById(id).querySelector(".wv-follow-preview"), "the preview gone from its panel");
        assert.strictEqual(readers(), r0 + 1, "one reader: the opened document's");
        assert.ok(splitOf(L.id), "still a split");
        const pdfv = () => reader(id)._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer;
        await waitFor(() => pdfv().currentPageNumber === 4, 10000, () => "at the page shown: " + pdfv().currentPageNumber);
        // Back to the library: the next item is previewed, the reader closed.
        await select(p2);
        await waitFor(() => previews(a2), 20000, () => "a preview again: " + state());
        assert.notOk(reader(id), "the reader closed");
        assert.strictEqual(readers(), r0, "none left");
        assert.strictEqual(closedMark(), closed, "Reopen Closed Tab has no entry for it");
        // A double-click on a page of the preview opens at that page.
        await select(p8);
        await waitFor(() => previews(big), 20000, () => "the eight-page preview again: " + state());
        const vdoc = viewerOf(id).container.ownerDocument;
        const vw = vdoc.defaultView;
        const page3 = await waitFor(() => vdoc.querySelector(".page[data-page-number='3']"), 5000, "page 3's box");
        page3.dispatchEvent(new vw.MouseEvent("dblclick", Cu.cloneInto({ bubbles: true, detail: 2 }, vw)));
        await waitFor(() => readerShows(big), 20000, () => "opened by a double-click: " + state());
        await waitFor(() => pdfv().currentPageNumber === 3, 10000, () => "at the page pressed: " + pdfv().currentPageNumber);
        // Opened, and a selection made while it still loads: the load ends, then
        // the preview comes back.
        await select(p3);
        await waitFor(() => previews(a3), 20000, () => "a preview: " + state());
        const types = sampler(() => String((tabByID(id) || {}).type), 10);
        try {
            wv._wvSplitFollowOpen(win, id, null);
            await waitFor(() => /-loading$/.test(String((tabByID(id) || {}).type)), 5000, () => "loading: " + state());
            ZT.select(L.id);
            selectFast(p1);
            await waitFor(() => previews(a1), 30000, () => "the selected item's preview: " + state());
        }
        finally { types.stop(); }
        const seq = types.seen.filter((x, i, a) => i === 0 || a[i - 1] !== x);
        const iLoaded = seq.indexOf("reader");
        assert.isAtLeast(iLoaded, 0, "the reader finished loading before it was put back: " + seq.join(" > "));
        assert.notOk(reader(id), "and it is gone");
        assert.strictEqual(readers(), r0, "none left");
    });

    it("12. no leak: twelve documents previewed, then the split closed -- no reader made, every preview reader let go, its page not kept", async function () {
        async function collect() { for (let i = 0; i < 6; i++) { Cu.forceGC(); Cu.forceCC(); try { Cu.forceShrinkingGC(); } catch (e) {} await sleep(250); } }
        async function settle() { await sleep(1500); await collect(); await sleep(2500); await collect(); }
        async function detached() {
            const mm = Components.classes["@mozilla.org/memory-reporter-manager;1"].getService(Components.interfaces.nsIMemoryReporterManager);
            const n = {};
            await new Promise((resolve) => {
                mm.getReports((process, path) => {
                    if (process) return;
                    if (!/^explicit\/window-objects\/.*detached\/window\(/.test(path) || !/\/dom\/element-nodes$/.test(path)) return;
                    const m = /detached\/window\(([^)]*)\)/.exec(path);
                    const k = m ? m[1].replace(/.*[\\/]/, "") : "?";
                    n[k] = (n[k] || 0) + 1;
                }, null, () => resolve(true), null, false);
            });
            return n;
        }
        const count = (d, re) => Object.keys(d).filter(k => re.test(k)).reduce((a, k) => a + d[k], 0);
        const widOf = (w) => { try { return Number(Cu.unwaiveXrays(w).windowGlobalChild.innerWindowId); } catch (e) { return 0; } };
        await closeDocTabs();
        await settle();
        const d0 = await detached();
        await fixture(a1, true);
        const id = side().id;
        // The first selection closes the fixture's own reader; from then on, none.
        await select(p2);
        await waitFor(() => previews(a2), 20000, () => "the first preview: " + state());
        const readers0 = readers();
        // The pref observers a reader registers (ReaderInstance._open: reader.* prefs)
        // and gives back in uninit: what keeps a forgotten reader alive.
        const P = /** @type {any} */ (Zotero.Prefs);
        const origReg = P.registerObserver, origUnreg = P.unregisterObserver;
        const live = new Set();
        P.registerObserver = function (name) { const sym = origReg.apply(this, arguments); if (/^reader\./.test(String(name))) live.add(sym); return sym; };
        P.unregisterObserver = function (sym) { live.delete(sym); return origUnreg.apply(this, arguments); };
        const wids = [], seenReaders = [];
        const spy = sampler(() => readers(), 20);
        try {
            const seq = [a3, a1, a2, a3, a1, a2, a3, a1, a2, a3, a1, a2];
            const parentOf = (a) => (a === a1 ? p1 : (a === a2 ? p2 : p3));
            for (const a of seq) {
                await select(parentOf(a));
                await waitFor(() => previews(a), 20000, () => "document " + a.id + ": " + state());
                const pr = info(id).reader;
                seenReaders.push(pr);
                try { wids.push(widOf(pr._iframeWindow), widOf(pr._internalReader._primaryView._iframeWindow)); } catch (e) {}
                await sleep(300);
            }
            assert.isAtMost(Math.max(...spy.seen), readers0, "no reader of Zotero's made at any moment: " + [...new Set(spy.seen)].join(","));
            assert.lengthOf(seenReaders.slice(0, -1).filter(r => !r._isUninitialized), 0, "every preview but the shown one let go");
            await closeDocTabs();
            await sleep(500);
            assert.isTrue(!!seenReaders[seenReaders.length - 1]._isUninitialized, "the shown one let go when the split's tab closed");
            assert.strictEqual(live.size, 0, "every reader.* pref observer given back: " + live.size + " left");
        }
        finally { spy.stop(); P.registerObserver = origReg; P.unregisterObserver = origUnreg; }
        await settle();
        const d1 = await detached();
        const reg = lib && lib.wvListenRegistry ? lib.wvListenRegistry() : { wids: [], hooked: [] };
        const kept = wids.filter(w => w && (reg.wids.includes(w) || reg.hooked.includes(w)));
        const grow = count(d1, /reader\.html|viewer\.html|snapshot|epub/) - count(d0, /reader\.html|viewer\.html|snapshot|epub/);
        const msg = "detached before " + JSON.stringify(d0) + ", after " + JSON.stringify(d1) + "; listen registry still names " + kept.length + " closed window(s)";
        Zotero.debug("[Weavero] split-follow leak: " + msg);
        assert.deepEqual(kept, [], "the listen registry keeps a preview's windows: " + msg);
        assert.isAtMost(grow, 0, "preview pages stay alive (detached): " + msg);
        assert.isNull(info(id), "no preview record left");
    });
});
