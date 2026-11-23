/* global describe, it, before, after, assert, Zotero, wvT */
// The opening modifiers, one meaning wherever Weavero opens something (MJT
// 2026-11-17, open-where.ts; the survey of that day found six meanings for
// Ctrl+click, four for Shift+click, two for the middle button, and no way for a
// link in one side of a split to reach the other side):
//   plain -> the surface's own open; Ctrl+click (Cmd on macOS), Ctrl/Cmd+Enter ->
//   beside the tab it came from (a pair's other side, the lock's active side, a
//   new split); Shift -> a new window; middle click -> a new tab in the
//   background. macOS: Control+click is the context click, never an open.
// The surface driven here is the main window's link press handler (pane.ts
// _setupTreeClickDelegate: every Weavero link in the main window -- comments in
// the items list and the item pane, link chips, Related labels, Backlinks titles)
// and the items list's Ctrl/Cmd+Enter. Synthetic events: the real click is a
// hands-on check (docs/gesture-testing.md).
describe("Weavero — opening modifiers: one meaning everywhere", function () {
    this.timeout(240000);
    let wv, lib, win, doc, ZT, pdf1, pdf2, pdf3, prevSplit, mac;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (er) {} await sleep(100); }
        throw new Error("timeout waiting for " + what);
    };
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const splitOf = (id) => wv._wvTabSplitOf(win, id);
    const pairs = () => (win._wvTSplits || []).filter(s => !s.dock);
    const dockSplit = () => (win._wvTSplits || []).find(s => s.dock) || null;
    const openLink = (it) => "zotero://open-pdf/library/items/" + it.key;
    async function openPDF(att) {
        if (tabOfItem(att)) return tabOfItem(att);
        await Zotero.Reader.open(att.id, null, { openInWindow: false });
        return waitFor(() => tabOfItem(att), 20000, "reader tab");
    }
    async function closeTab(att) {
        const t = tabOfItem(att);
        if (t) { ZT.close(t.id); await waitFor(() => !tabOfItem(att), 5000, "tab closed"); }
    }
    /** No pair, no lock, only the library tab selected. */
    async function fresh() {
        for (const s of pairs()) wv._wvTabSplitSeparate(win, s.id);
        if (win._wvTDock) wv._wvTabDockSet(win, null);
        win._wvSelTabIDs = new Set();
        for (const it of [pdf1, pdf2, pdf3]) await closeTab(it);
        ZT.select(libTab().id);
        await sleep(300);
    }
    /** A link of Weavero's in the content of tab `tabID` (what `_markTextLinks`
     *  draws: a `.wv-url-span` with its address in data-href). */
    function linkIn(tabID, url) {
        const host = doc.getElementById(tabID);
        assert.ok(host, "fixture: the tab's content");
        const sp = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        sp.className = "wv-url-span wv-link-zotero wv-test-openwhere";
        sp.setAttribute("data-href", url);
        sp.textContent = url;
        host.appendChild(sp);
        return sp;
    }
    const press = (el, o) => el.dispatchEvent(new win.MouseEvent("mousedown", Object.assign({ bubbles: true, cancelable: true, view: win, button: 0 }, o)));
    const accel = () => (mac ? { metaKey: true } : { ctrlKey: true });

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvOpenWhere", "_wvOpenTarget", "_wvTabSplitCreate", "_wvTabSplitOf", "_wvTabDockSet", "_wvTabSplitSeparate"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        lib = wvT.lib();
        if (!lib || typeof lib.wvOpenWhere !== "function") wvT.absent("lib.wvOpenWhere");
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        mac = !!Zotero.isMac;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        pdf1 = await wvT.createTestPDFItem("wv-openwhere-1");
        pdf2 = await wvT.createTestPDFItem("wv-openwhere-2");
        pdf3 = await wvT.createTestPDFItem("wv-openwhere-3");
        await fresh();
    });

    after(async function () {
        if (!win) return;
        for (const el of Array.from(doc.querySelectorAll(".wv-test-openwhere"))) el.remove();
        try { await fresh(); } catch (er) {}
        await wvT.erase(pdf1, pdf2, pdf3);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (er) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (er) {}
    });

    it("the decision: plain here, the platform's accelerator beside, Shift a new window, the middle button the background; Control+click on macOS is no open", function () {
        const W = lib.wvOpenWhere;
        const click = (o) => Object.assign({ type: "click", button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, o);
        const key = (o) => Object.assign({ type: "keydown", key: "Enter", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, o);
        for (const isMac of [false, true]) {
            const A = isMac ? { metaKey: true } : { ctrlKey: true };
            const tag = isMac ? "macOS: " : "Windows/Linux: ";
            assert.strictEqual(W(click({}), isMac), "here", tag + "a plain click");
            assert.strictEqual(W(click(A), isMac), "beside", tag + "the accelerator");
            assert.strictEqual(W(click({ shiftKey: true }), isMac), "window", tag + "Shift");
            assert.strictEqual(W(click({ button: 1 }), isMac), "background", tag + "the middle button");
            assert.strictEqual(W(click(Object.assign({ button: 1, shiftKey: true }, A)), isMac), "background", tag + "the middle button, whatever is held");
            assert.isNull(W(click({ button: 2 }), isMac), tag + "a right click is no open");
            assert.strictEqual(W(click(Object.assign({ shiftKey: true }, A)), isMac), "here", tag + "two modifiers: no gesture of ours");
            assert.strictEqual(W(click(Object.assign({ altKey: true }, A)), isMac), "here", tag + "Alt keeps its own meanings");
            assert.strictEqual(W(key(A), isMac), "beside", tag + "Ctrl/Cmd+Enter");
            assert.strictEqual(W(key({ shiftKey: true }), isMac), "window", tag + "Shift+Enter");
            assert.strictEqual(W(key({}), isMac), "here", tag + "Enter");
        }
        assert.isNull(W(click({ ctrlKey: true }), true), "macOS: Control+click is the context click");
        assert.strictEqual(W(click({ metaKey: true }), false), "here", "Windows/Linux: the Windows key is not the accelerator");
        assert.strictEqual(W(key({ ctrlKey: true }), true), "here", "macOS: Control+Return is not the accelerator");
        assert.strictEqual(W(null), "here");
        assert.strictEqual(W({}), "here", "a menu's stand-in event");
        assert.strictEqual(W({ shiftKey: true }), "window", "a menu's Shift stand-in");
        // The plugin's entry reads this platform.
        assert.strictEqual(wv._wvOpenWhere(click(accel())), "beside", "this platform's accelerator");
        assert.strictEqual(wv._wvOpenWhere(click(mac ? { ctrlKey: true } : { metaKey: true })), mac ? null : "here", "this platform's other key");
    });

    it("Ctrl/Cmd+click on a link in a side of a pair: the target takes the pair's OTHER side, the tab that was there stays open", async function () {
        await fresh();
        const L = libTab();
        const t1 = await openPDF(pdf1);
        assert.ok(wv._wvTabSplitCreate(win, L.id, t1.id, { select: "left" }), "fixture: the library beside PDF 1");
        await sleep(400);
        assert.strictEqual(ZT.selectedID, L.id, "fixture: the library side selected");
        const sp = linkIn(L.id, openLink(pdf2));
        try { press(sp, accel()); }
        finally { /* removed in after() too */ }
        const t2 = await waitFor(() => tabOfItem(pdf2), 20000, "PDF 2's tab");
        await waitFor(() => { const s = splitOf(L.id); return s && (s.left === t2.id || s.right === t2.id); }, 10000, "PDF 2 beside the library");
        const s = splitOf(L.id);
        assert.strictEqual(s.left, L.id, "the library keeps its side");
        assert.strictEqual(s.right, t2.id, "PDF 2 on the other side");
        assert.ok(tabOfItem(pdf1), "PDF 1's tab stays open");
        assert.notOk(splitOf(tabOfItem(pdf1).id), "as an ordinary tab");
        assert.strictEqual(ZT.selectedID, t2.id, "the target selected");
        sp.remove();
    });

    it("Ctrl/Cmd+Enter in the items list, the library in a pair: the selected item in the pair's other side; not from a text field", async function () {
        await fresh();
        const L = libTab();
        const t1 = await openPDF(pdf1);
        wv._wvTabSplitCreate(win, L.id, t1.id, { select: "left" });
        await sleep(400);
        await win.ZoteroPane.selectItem(pdf3.id);
        await sleep(300);
        assert.strictEqual(ZT.selectedID, L.id, "fixture: the library side selected");
        const tree = doc.getElementById(win.ZoteroPane.itemsView.id);
        assert.ok(tree, "fixture: the items tree");
        // In a text field: nothing (outside the tree: inside it, Zotero's own
        // Enter would open the item whatever Weavero does).
        const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
        input.className = "wv-test-openwhere";
        doc.documentElement.appendChild(input);
        input.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, accel())));
        await sleep(1200);
        assert.notOk(tabOfItem(pdf3), "a text field keeps its keys");
        input.remove();
        const ev = new win.KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, accel()));
        tree.dispatchEvent(ev);
        assert.isTrue(ev.defaultPrevented, "taken ahead of the tree's own Enter");
        const t3 = await waitFor(() => tabOfItem(pdf3), 20000, "PDF 3's tab");
        await waitFor(() => { const s = splitOf(L.id); return s && s.right === t3.id; }, 10000, "PDF 3 beside the library");
        assert.ok(tabOfItem(pdf1) && !splitOf(tabOfItem(pdf1).id), "PDF 1 stays open, alone");
        assert.strictEqual(ZT.selectedID, t3.id, "the target selected");
    });

    it("with the lock on: from the locked library the target goes to the active side; from the active side it replaces it; the locked tab stays", async function () {
        await fresh();
        const L = libTab();
        const t1 = await openPDF(pdf1);
        ZT.select(L.id); await sleep(200);
        assert.isTrue(wv._wvTabDockSet(win, L.id), "fixture: the lock on the library");
        ZT.select(t1.id); await sleep(300);
        ZT.select(L.id); await sleep(400);
        const sp = linkIn(L.id, openLink(pdf2));
        press(sp, accel());
        const t2 = await waitFor(() => tabOfItem(pdf2), 20000, "PDF 2's tab");
        await waitFor(() => ZT.selectedID === t2.id, 10000, "PDF 2 selected");
        await sleep(300);
        let d = dockSplit();
        assert.ok(win._wvTDock && win._wvTDock.lib === L.id, "the lock stays on the library");
        assert.ok(d && [d.left, d.right].includes(L.id) && [d.left, d.right].includes(t2.id), "the library and PDF 2 side by side: " + JSON.stringify(d));
        assert.ok(tabOfItem(pdf1), "PDF 1 stays open");
        sp.remove();
        // From the active side (PDF 2): PDF 3 replaces it.
        const ok = await wv._wvOpenTarget(win, { item: pdf3 }, "beside", t2.id);
        assert.isTrue(ok, "placed");
        const t3 = await waitFor(() => tabOfItem(pdf3), 20000, "PDF 3's tab");
        await waitFor(() => ZT.selectedID === t3.id, 10000, "PDF 3 selected");
        await sleep(300);
        d = dockSplit();
        assert.ok(d && [d.left, d.right].includes(L.id) && [d.left, d.right].includes(t3.id), "the library and PDF 3: " + JSON.stringify(d));
        assert.ok(tabOfItem(pdf2), "PDF 2 stays open");
        wv._wvTabDockSet(win, null);
        await sleep(300);
    });

    it("alone: a new split of the tab the link is in and the target, the target selected", async function () {
        await fresh();
        const t1 = await openPDF(pdf1);
        ZT.select(t1.id); await sleep(300);
        const sp = linkIn(t1.id, openLink(pdf2));
        press(sp, accel());
        const t2 = await waitFor(() => tabOfItem(pdf2), 20000, "PDF 2's tab");
        await waitFor(() => splitOf(t1.id), 10000, "a split");
        const s = splitOf(t1.id);
        assert.ok(s && [s.left, s.right].includes(t2.id), "PDF 1 and PDF 2 side by side: " + JSON.stringify(s));
        assert.strictEqual(ZT.selectedID, t2.id, "the target selected");
        sp.remove();
    });

    it("Shift+click: a new window (closed after)", async function () {
        await fresh();
        const L = libTab();
        const before = new Set(Zotero.Reader._readers);
        const sp = linkIn(L.id, openLink(pdf3));
        press(sp, { shiftKey: true });
        const r = await waitFor(() => Zotero.Reader._readers.find(x => !before.has(x) && x.itemID === pdf3.id), 25000, "PDF 3's reader");
        const w = r._window;
        assert.ok(w && w !== win, "in another window");
        assert.notOk(tabOfItem(pdf3), "no tab of it in this window");
        assert.strictEqual(ZT.selectedID, L.id, "this window's tab unchanged");
        sp.remove();
        try { w.close(); } catch (er) {}
        await waitFor(() => w.closed, 10000, "the window closed");
        win.focus();
        await sleep(400);
    });

    it("middle click: a new tab in the background -- the selection and the pair on screen unchanged", async function () {
        await fresh();
        const L = libTab();
        const t1 = await openPDF(pdf1);
        wv._wvTabSplitCreate(win, L.id, t1.id, { select: "left" });
        await sleep(400);
        const sp = linkIn(L.id, openLink(pdf3));
        const ev = new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, view: win, button: 1 });
        sp.dispatchEvent(ev);
        assert.isTrue(ev.defaultPrevented, "the press is taken (no autoscroll, no paste)");
        const t3 = await waitFor(() => tabOfItem(pdf3), 20000, "PDF 3's tab");
        await sleep(600);
        assert.strictEqual(ZT.selectedID, L.id, "the selection unchanged");
        const s = splitOf(L.id);
        assert.ok(s && s.left === L.id && s.right === t1.id, "the pair unchanged: " + JSON.stringify(s));
        assert.notOk(splitOf(t3.id), "the new tab in no split");
        sp.remove();
    });

    // CLAUDE.md hard invariant: note tabs open via ZoteroPane.openNote(id,
    // {openInWindow: false}) ONLY -- so a note's "background" opens in front.
    it("a note opened in the background or beside goes through ZoteroPane.openNote(id, {openInWindow: false}); nothing calls Notes.open", async function () {
        await fresh();
        const note = new Zotero.Item("note"); note.setNote("<p>wv openwhere note</p>"); await note.saveTx();
        const zp = /** @type {any} */ (win.ZoteroPane);
        const orig = zp.openNote;
        const calls = [];
        zp.openNote = function (id, o) { calls.push([id, o && o.openInWindow]); return orig.apply(this, arguments); };
        try {
            assert.isTrue(await wv._wvOpenTarget(win, { item: note }, "background", libTab().id), "placed");
            const t = await waitFor(() => tabOfItem(note), 15000, "the note's tab");
            assert.deepEqual(calls, [[note.id, false]], "openNote, tab, once");
            assert.strictEqual(ZT.selectedID, t.id, "in front: Zotero's note opener has no background mode");
        }
        finally {
            zp.openNote = orig;
            const t = tabOfItem(note); if (t) ZT.close(t.id);
            await wvT.erase(note);
        }
        for (const m of ["_wvOpenTarget", "_wvOpenSpecWhere", "_wvOpenTabFor", "_wvOpenInBackground", "_wvOpenBeside"]) {
            assert.notInclude(String(wv[m]), "Notes.open", m + " opens no note through Zotero.Notes.open");
        }
    });

    // Forum 128815, WV-TEMP-128815 (open-where.ts, upstream register #69): Shift+Enter or
    // Shift+double-click on a NOTE in the items list opens it the OTHER way from Settings
    // > "Open notes in new windows", as Shift does for a PDF (zoteroPane.js
    // viewAttachment inverts openReaderInNewWindow). Zotero's viewItems sets the note's
    // openInWindow from Shift alone (11.0-beta.4, 10.0.8): with the setting on, Shift
    // opened a window too. Driven through the items tree's own Enter and Shift+mouseup
    // (virtualized-table.jsx: a Shift double-click arrives as a mouseup with detail 2);
    // ZoteroPane.openNote is recorded, not run -- what the gesture asks for is the check.
    /** The openNote calls (`[id, openInWindow]`) of `gesture` ("enter" / "dblclick") on
     *  note `n` selected in the items list, Settings' note option at `inWindow`. */
    async function noteGesture(n, inWindow, gesture, shift, viewItems) {
        const zp = /** @type {any} */ (win.ZoteroPane);
        ZT.select(libTab().id); await sleep(300);
        await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await sleep(300);
        await zp.selectItem(n.id);
        await waitFor(() => { const s = zp.getSelectedItems(); return s.length === 1 && s[0].id === n.id; }, 8000, "the note selected");
        const orig = zp.openNote;
        const prevView = zp.viewItems;
        const calls = [];
        zp.openNote = function (id, o) { calls.push([id, o ? o.openInWindow : undefined]); return Promise.resolve(null); };
        if (viewItems) zp.viewItems = viewItems;
        try {
            await wvT.withPref("openNoteInNewWindow", inWindow, async () => {
                const treeId = zp.itemsView.id;
                if (gesture === "enter") {
                    const tree = doc.getElementById(treeId);
                    assert.ok(tree, "fixture: the items tree");
                    tree.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", shiftKey: shift, bubbles: true, cancelable: true }));
                }
                else {
                    const row = doc.getElementById(treeId + "-row-" + zp.itemsView.getRowIndexByID(n.id));
                    assert.ok(row, "fixture: the note's row");
                    row.dispatchEvent(new win.MouseEvent("mouseup", { button: 0, detail: 2, shiftKey: shift, bubbles: true, cancelable: true, view: win }));
                }
                await waitFor(() => calls.length, 8000, "an open of the note");
                await sleep(300);
            });
        }
        finally {
            zp.openNote = orig;
            if (viewItems) zp.viewItems = prevView;
        }
        return calls;
    }

    it("Shift+Enter / Shift+double-click on a note in the items list: the other way from Settings' \"open notes in new windows\" (WV-TEMP-128815)", async function () {
        await fresh();
        const note = new Zotero.Item("note"); note.setNote("<p>wv openwhere shift note</p>"); await note.saveTx();
        try {
            assert.deepEqual(await noteGesture(note, true, "enter", true), [[note.id, false]], "setting on, Shift+Enter: a tab");
            assert.deepEqual(await noteGesture(note, false, "enter", true), [[note.id, true]], "setting off, Shift+Enter: a window");
            assert.deepEqual(await noteGesture(note, true, "dblclick", true), [[note.id, false]], "setting on, Shift+double-click: a tab");
            assert.deepEqual(await noteGesture(note, false, "dblclick", true), [[note.id, true]], "setting off, Shift+double-click: a window");
            const plain = await noteGesture(note, true, "enter", false);
            assert.strictEqual(plain.length, 1, "Enter opens it once");
            assert.notStrictEqual(plain[0][1], false, "Enter without Shift: Zotero's own open, the setting decides");
        }
        finally { await wvT.erase(note); }
    });

    it("torn down, Zotero's own viewItems opens a window on Shift whatever the setting (tripwire: fails once Zotero fixes it -- retire WV-TEMP-128815)", async function () {
        await fresh();
        const zp = /** @type {any} */ (win.ZoteroPane);
        const native = zp._wvOrigViewItems;
        assert.isFunction(native, "fixture: Zotero's own viewItems under Weavero's");
        const note = new Zotero.Item("note"); note.setNote("<p>wv openwhere shift note native</p>"); await note.saveTx();
        try {
            const calls = await noteGesture(note, true, "enter", true, function () { return native.apply(zp, arguments); });
            assert.deepEqual(calls, [[note.id, true]],
                "setting on, Shift+Enter: Zotero asks for a window (if a tab, Zotero fixed forum 128815: retire WV-TEMP-128815)");
        }
        finally { await wvT.erase(note); }
    });

    it("a Weavero list row (Backlinks, Links): a click, Ctrl/Cmd+click, Shift+click, a middle click and Enter / Ctrl+Enter / Shift+Enter each ask for their open", async function () {
        if (typeof wv._wvBlMakeRow !== "function") wvT.absent("plugin._wvBlMakeRow");
        const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        host.className = "wv-test-openwhere";
        doc.documentElement.appendChild(host);
        const got = [];
        const icon = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        const row = wv._wvBlMakeRow(doc, host, { cls: "", icon, label: "x", segs: [], compact: true,
            open: (where) => { got.push(where); }, menu: () => {}, card: () => {}, onKey: wv._wvBlKeyHandler(host, doc) });
        const ck = (o) => row.dispatchEvent(new win.MouseEvent("click", Object.assign({ bubbles: true, cancelable: true, view: win, button: 0 }, o)));
        ck({}); ck(accel()); ck({ shiftKey: true });
        row.dispatchEvent(new win.MouseEvent("auxclick", { bubbles: true, cancelable: true, view: win, button: 1 }));
        const kd = (o) => row.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key: "Enter", bubbles: true, cancelable: true }, o)));
        kd({}); kd(accel()); kd({ shiftKey: true });
        await sleep(50);
        host.remove();
        assert.deepEqual(got, ["here", "beside", "window", "background", "here", "beside", "window"]);
    });
});
