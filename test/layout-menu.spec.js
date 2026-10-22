/* global describe, it, before, after, assert, Zotero, Services, Components */
// View -> Layout follows the tab (zotero#2814, open since 2022 with the
// names agreed there -- "Sidebar", "Context Pane" -- and nothing shipped;
// #5379 closed as its duplicate; MJT 2026-10-14).
//
// Zotero's three Layout items (Collections Pane / Item Pane / Tag Selector)
// toggle the LIBRARY's panes whatever the tab (standalone.js
// onViewMenuItemClick) and read the library panes for their check marks.
//
// Contract under test:
//   * library tab: Zotero's three items, ours hidden, nothing else changed;
//   * reader tab: Sidebar / Context Pane / Colour and Tag Selector (the
//     last while the handle feature is on), check marks from the real state
//     (the reader's sidebar, ZoteroContextPane, the handle's pref); Zotero's
//     three hidden while the submenu is open, back on popuphidden;
//   * each command toggles the real thing; the next open shows the new mark;
//   * note tab: Context Pane alone;
//   * a separate reader window gets a Layout submenu of its own, its
//     Context Pane = Weavero's reader-window item pane;
//   * the switch off = Zotero's menu untouched; unwire leaves no trace.
// Commands are driven through the plugin's own entry (_wvLayoutMenuCommand):
// a synthetic `command` never reaches a chrome listener (tests.md); the real
// click is Zotero's menu path, the same for every XUL menuitem.
describe("Weavero — View → Layout follows the tab (zotero#2814)", function () {
    this.timeout(150000);
    let wv, win, doc, popup, att, reader;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
            try { const v = fn(); if (v) return v; } catch (e) {}
            await sleep(150);
        }
        throw new Error("timeout waiting for " + what);
    };
    const fireIn = (d, type, target) => { const ev = d.createEvent("Event"); ev.initEvent(type, true, true); target.dispatchEvent(ev); };
    const open = (p) => fireIn(p.ownerDocument, "popupshowing", p);
    const close = (p) => fireIn(p.ownerDocument, "popuphidden", p);
    const ZIDS = ["view-menuitem-collections-pane", "view-menuitem-item-pane", "view-menuitem-tag-selector"];
    const zoteros = () => ZIDS.map(id => doc.getElementById(id));
    const ours = (p) => [...(p || popup).querySelectorAll(":scope > .wv-layout-item")];
    const item = (key, p) => (p || popup).querySelector(':scope > [data-wv-layout="' + key + '"]');
    const marked = (el) => el.getAttribute("checked") === "true";
    const ir = (r) => Components.utils.waiveXrays((r || reader)._internalReader);
    const windowsOf = (type) => { const out = []; const en = Services.wm.getEnumerator(type); while (en.hasMoreElements()) { const w = /** @type {any} */ (en.getNext()); if (w && !w.closed) out.push(w); } return out; };
    const saved = {};
    const PREFS = ["readerLayoutMenu", "enableVisualExtras", "annSelectorHandle", "hideNativeAnnSelector", "annSelectorHidden", "enableFilters", "readerItemPane", "enableTabsAndWindows"];
    // The menu's own state for the selector: OFF = shown.
    const OFF = new Set(["annSelectorHidden"]);

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWireLayoutMenu", "_wvUnwireLayoutMenu", "_wvLayoutMenuSync", "_wvLayoutMenuRestore", "_wvLayoutMenuCommand", "_getReaderLayoutMenu"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow();
        doc = win.document;
        popup = doc.querySelector("#layout-menu > menupopup");
        assert.ok(popup, "Zotero's Layout submenu");
        for (const k of PREFS) saved[k] = Zotero.Prefs.get("weavero." + k);
        for (const k of PREFS) Zotero.Prefs.set("weavero." + k, !OFF.has(k));
        wv._wvWireLayoutMenu(win);
        att = await wvT.createTestPDFItem("wv-layoutmenu");
    });

    after(async function () {
        try { close(popup); } catch (e) {}
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await sleep(300);
        await wvT.erase(att);
        for (const k of PREFS) Zotero.Prefs.set("weavero." + k, saved[k] === undefined ? !OFF.has(k) : !!saved[k]);
        try { wv._wvWireLayoutMenu(win); } catch (e) {}
    });

    it("library tab: Zotero's three items, none of ours", async function () {
        win.Zotero_Tabs.select("zotero-pane");
        await waitFor(() => win.Zotero_Tabs.selectedType === "library", 5000, "the library tab");
        open(popup);
        assert.deepEqual(zoteros().map(el => !!el && !el.hidden), [true, true, true], "Collections Pane / Item Pane / Tag Selector shown");
        assert.lengthOf(ours(), 4, "our four items exist");
        assert.isTrue(ours().every(el => el.hidden), "and are hidden here");
        close(popup);
    });

    it("reader tab: Sidebar / Context Pane / Colour and Tag Selector, Zotero's hidden, marks from the real state", async function () {
        reader = await wvT.openReaderTab(att.id);
        if (!reader) throw new Error("reader did not open");
        await waitFor(() => win.Zotero_Tabs.selectedType === "reader" && win.Zotero_Tabs.selectedID === reader.tabID, 10000, "the reader tab selected");
        await waitFor(() => reader._iframeWindow && reader._iframeWindow.document.getElementById("sidebarToggle"), 15000, "the reader toolbar");
        open(popup);
        assert.deepEqual(ours().map(el => el.getAttribute("label")), ["Sidebar", "Outline Pane", "Context Pane", "Colour and Tag Selector"], "the four, in order");
        assert.isTrue(item("outline").hidden, "Outline Pane is a note tab's (Better Notes), not a reader's");
        // A wv- ID each: destroy's chrome sweep removes id'd elements whole
        // and UNWRAPS a class-only one whose children have other classes --
        // a rendered menuitem's img / labels -- which left twelve stray
        // nodes in the popup on every reload (2026-10-14).
        assert.deepEqual(ours().map(el => el.id), ["wv-view-menuitem-sidebar", "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector"]);
        assert.isTrue(ours().every(el => !el.id.startsWith("view-menuitem-")), "never Zotero's prefix (its handler keys on it)");
        assert.isTrue([...popup.children].every(el => el.localName === "menuitem" || el.localName === "menuseparator"), "only menu items in the popup, no stray nodes");
        assert.isTrue(["sidebar", "pane", "selector"].every(k => !item(k).hidden), "the reader's three shown");
        assert.strictEqual(ours()[0].previousElementSibling, doc.getElementById("view-menuitem-tag-selector"), "right after Zotero's items");
        assert.deepEqual(zoteros().map(el => el.hidden), [true, true, true], "Zotero's three hidden");
        assert.isTrue(zoteros().every(el => el.getAttribute("data-wv-hidden") === "1"), "marked as ours to restore");
        assert.strictEqual(marked(item("sidebar")), !!ir()._state.sidebarOpen, "Sidebar mark = the reader's sidebar");
        assert.strictEqual(marked(item("pane")), !win.ZoteroContextPane.collapsed, "Context Pane mark = the context pane");
        assert.strictEqual(marked(item("selector")), !Zotero.Prefs.get("weavero.annSelectorHidden"), "selector mark = the menu's own state (shown)");
        close(popup);
        assert.deepEqual(zoteros().map(el => el.hidden), [false, false, false], "closed: Zotero's three back");
        assert.isTrue(zoteros().every(el => !el.hasAttribute("data-wv-hidden")));
        assert.isTrue(ours().every(el => el.hidden), "ours out of the way");
    });

    it("each command toggles the real thing; the next open shows the new mark", async function () {
        // Sidebar: the reader's own toolbar path (both the UI and Zotero's
        // default for the next reader).
        const s0 = !!ir()._state.sidebarOpen;
        wv._wvLayoutMenuCommand(win, "sidebar");
        await waitFor(() => !!ir()._state.sidebarOpen === !s0, 5000, "the sidebar toggled");
        open(popup); assert.strictEqual(marked(item("sidebar")), !s0, "the mark followed"); close(popup);
        wv._wvLayoutMenuCommand(win, "sidebar");
        await waitFor(() => !!ir()._state.sidebarOpen === s0, 5000, "and back");
        // Context Pane: ZoteroContextPane.
        const cp = win.ZoteroContextPane;
        const p0 = !!cp.collapsed;
        wv._wvLayoutMenuCommand(win, "pane");
        await waitFor(() => !!cp.collapsed === !p0, 5000, "the context pane toggled");
        open(popup); assert.strictEqual(marked(item("pane")), p0, "the mark followed (checked = open)"); close(popup);
        wv._wvLayoutMenuCommand(win, "pane");
        await waitFor(() => !!cp.collapsed === p0, 5000, "and back");
        // Colour and Tag Selector: the selector GONE entirely, pill included
        // (the library's item hides its whole Tag Selector; MJT 2026-10-14),
        // one global state; the handle's fold state is untouched by it.
        // The sidebar container exists only while the sidebar is open. Opened
        // here, closed again at the end: the toggle also sets Zotero's
        // default for the next reader, and the reader-window recording
        // (zz-reader-window-wiring) expects readers that open shut.
        const openedSidebar = !ir()._state.sidebarOpen;
        if (openedSidebar) { wv._wvLayoutMenuCommand(win, "sidebar"); await waitFor(() => !!ir()._state.sidebarOpen, 5000, "the sidebar open"); }
        try {
            const sc = await waitFor(() => reader._iframeWindow.document.getElementById("sidebarContainer"), 10000, "the sidebar container");
            const fold0 = !!Zotero.Prefs.get("weavero.hideNativeAnnSelector");
            await waitFor(() => !sc.classList.contains("wv-al-nosel"), 5000, "shown going in");
            wv._wvLayoutMenuCommand(win, "selector");
            await waitFor(() => Zotero.Prefs.get("weavero.annSelectorHidden") === true, 5000, "the menu's state flipped");
            await waitFor(() => sc.classList.contains("wv-al-nosel"), 5000, "the selector hidden entirely in the reader");
            assert.strictEqual(!!Zotero.Prefs.get("weavero.hideNativeAnnSelector"), fold0, "the fold state untouched");
            open(popup); assert.isFalse(marked(item("selector")), "unchecked = hidden"); close(popup);
            wv._wvLayoutMenuCommand(win, "selector");
            await waitFor(() => Zotero.Prefs.get("weavero.annSelectorHidden") === false, 5000, "and back");
            await waitFor(() => !sc.classList.contains("wv-al-nosel"), 5000, "shown again");
            open(popup); assert.isTrue(marked(item("selector")), "checked = shown"); close(popup);
        }
        finally {
            if (openedSidebar) { wv._wvLayoutMenuCommand(win, "sidebar"); await waitFor(() => !ir()._state.sidebarOpen, 5000, "the sidebar shut again"); }
        }
    });

    it("the handle feature off: the selector item stays (it hides, the handle only folds); the switch off: Zotero's menu as it is", async function () {
        Zotero.Prefs.set("weavero.annSelectorHandle", false);
        await sleep(300);
        open(popup);
        assert.isFalse(item("selector").hidden, "the item is the menu's, not the handle's");
        assert.isFalse(item("sidebar").hidden); assert.isFalse(item("pane").hidden);
        close(popup);
        Zotero.Prefs.set("weavero.annSelectorHandle", true);
        Zotero.Prefs.set("weavero.readerLayoutMenu", false);
        open(popup);
        assert.deepEqual(zoteros().map(el => el.hidden), [false, false, false], "switch off: Zotero's three in a reader tab");
        assert.isTrue(ours().every(el => el.hidden), "none of ours");
        close(popup);
        Zotero.Prefs.set("weavero.readerLayoutMenu", true);
        open(popup);
        assert.isTrue(["sidebar", "pane", "selector"].every(k => !item(k).hidden), "switch on: ours again");
        close(popup);
    });

    it("note tab: Context Pane alone", async function () {
        const ZT = win.Zotero_Tabs, ZP = win.ZoteroPane;
        const types = ZT._loadableTypes || [];
        if (!types.includes("note") || typeof ZP.openNote !== "function") this.skip();   // version: note tabs need note-in-tab
        const note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote("<p>WV-TEST layout menu note</p>");
        await note.saveTx();
        let tabID = null;
        try {
            // The one way note tabs open (root CLAUDE.md invariant).
            await ZP.openNote(note.id, { openInWindow: false });
            await waitFor(() => ZT.selectedType === "note", 10000, "a note tab selected");
            tabID = ZT.selectedID;
            open(popup);
            assert.isTrue(item("sidebar").hidden, "no sidebar in a note tab");
            assert.isFalse(item("pane").hidden, "Context Pane shown");
            assert.isTrue(item("selector").hidden, "no selector in a note tab");
            // Better Notes' outline pane, when that plugin is in the run
            // (npm run test:compat installs companions; the plain run has
            // none): the item follows the outline container.
            const outline = doc.getElementById(tabID) && doc.getElementById(tabID).querySelector("#bn-outline-container");
            assert.strictEqual(!item("outline").hidden, !!outline, "Outline Pane iff Better Notes' outline is in the tab");
            if (outline) {
                assert.strictEqual(marked(item("outline")), !outline.hasAttribute("collapsed"), "its mark = the outline open");
                close(popup);
                const o0 = outline.hasAttribute("collapsed");
                wv._wvLayoutMenuCommand(win, "outline");
                await waitFor(() => outline.hasAttribute("collapsed") !== o0, 5000, "the outline toggled");
                wv._wvLayoutMenuCommand(win, "outline");
                await waitFor(() => outline.hasAttribute("collapsed") === o0, 5000, "and back");
                open(popup);
            }
            assert.deepEqual(zoteros().map(el => el.hidden), [true, true, true], "Zotero's three hidden");
            assert.strictEqual(marked(item("pane")), !win.ZoteroContextPane.collapsed);
            close(popup);
            assert.deepEqual(zoteros().map(el => el.hidden), [false, false, false], "closed: back");
        }
        finally {
            try { if (tabID) ZT.close(tabID); } catch (e) {}
            await sleep(300);
            await wvT.erase(note);
        }
        // Back on the reader tab for the cases after this one.
        try { ZT.select(reader.tabID); } catch (e) {}
        await waitFor(() => ZT.selectedType === "reader", 5000, "the reader tab again");
    });

    it("a separate reader window gets a Layout submenu of its own", async function () {
        const att2 = await wvT.createTestPDFItem("wv-layoutmenu-win");
        const before = new Set(windowsOf("zotero:reader"));
        let w = null, r2 = null;
        try {
            await Zotero.Reader.open(att2.id, null, { openInWindow: true });
            w = await waitFor(() => windowsOf("zotero:reader").find(x => !before.has(x)) || null, 15000, "the reader window");
            r2 = await waitFor(() => (Zotero.Reader._readers || []).find(x => x._window === w && x._internalReader && x._iframeWindow) || null, 30000, "its reader");
            const menu = await waitFor(() => w.document.getElementById("wv-layout-menu"), 15000, "the Layout submenu (render path)");
            const wdoc = w.document, view = wdoc.getElementById("menu_viewPopup"), mp = wdoc.getElementById("wv-layout-menu-popup");
            assert.strictEqual(menu.getAttribute("label"), doc.getElementById("layout-menu").getAttribute("label"), "the main window's localized label");
            assert.strictEqual(view.lastElementChild, menu, "last in the View menu");
            assert.strictEqual(menu.previousElementSibling.localName, "menuseparator", "after a separator of ours");
            assert.isTrue(menu.previousElementSibling.classList.contains("wv-layout-sep"));
            open(view);
            assert.isFalse(menu.hidden, "shown with the switch on");
            await waitFor(() => wdoc.getElementById("sidebarToggle") || (r2._iframeWindow && r2._iframeWindow.document.getElementById("sidebarToggle")), 15000, "the reader toolbar");
            open(mp);
            assert.deepEqual(ours(mp).map(el => el.getAttribute("label")), ["Sidebar", "Outline Pane", "Context Pane", "Colour and Tag Selector"]);
            assert.isFalse(item("sidebar", mp).hidden, "Sidebar");
            assert.isTrue(item("outline", mp).hidden, "no Outline Pane in a reader window");
            const details = wdoc.getElementById("wv-reader-item-details");
            assert.strictEqual(!item("pane", mp).hidden, !!details, "Context Pane iff Weavero's reader-window item pane exists");
            assert.isFalse(item("selector", mp).hidden, "the selector (Filters on)");
            assert.strictEqual(marked(item("sidebar", mp)), !!ir(r2)._state.sidebarOpen);
            if (details) assert.strictEqual(marked(item("pane", mp)), !details._collapsed);
            close(mp);
            // Commands act on THIS window's reader and pane.
            const s0 = !!ir(r2)._state.sidebarOpen;
            wv._wvLayoutMenuCommand(w, "sidebar");
            await waitFor(() => !!ir(r2)._state.sidebarOpen === !s0, 5000, "the window's sidebar toggled");
            wv._wvLayoutMenuCommand(w, "sidebar");
            await waitFor(() => !!ir(r2)._state.sidebarOpen === s0, 5000, "and back");
            if (details) {
                const c0 = !!details._collapsed;
                wv._wvLayoutMenuCommand(w, "pane");
                await waitFor(() => !!details._collapsed === !c0, 5000, "the window's pane toggled");
                open(mp); assert.strictEqual(marked(item("pane", mp)), c0, "the mark followed"); close(mp);
                wv._wvLayoutMenuCommand(w, "pane");
                await waitFor(() => !!details._collapsed === c0, 5000, "and back");
            }
            // The switch off: no submenu in the View menu.
            Zotero.Prefs.set("weavero.readerLayoutMenu", false);
            open(view);
            assert.isTrue(menu.hidden, "switch off: the submenu gone");
            assert.isTrue(menu.previousElementSibling.hidden, "and its separator");
            close(view);
            Zotero.Prefs.set("weavero.readerLayoutMenu", true);
            open(view);
            assert.isFalse(menu.hidden, "switch on: back");
            close(view);
            // Never close a window before it has finished loading (tests.md).
            await waitFor(() => w.document.readyState === "complete", 10000, "the window loaded");
        }
        finally {
            Zotero.Prefs.set("weavero.readerLayoutMenu", true);
            try { if (w && !w.closed) w.close(); } catch (e) {}
            for (let i = 0; i < 50 && w && !w.closed; i++) await sleep(100);
            wvT.purgeDeadReaders();
            await wvT.erase(att2);
        }
    });

    it("unwire restores Zotero's items and removes ours; wiring again is idempotent", function () {
        wv._wvUnwireLayoutMenu(win);
        assert.lengthOf(ours(), 0, "ours removed");
        assert.deepEqual(zoteros().map(el => el.hidden), [false, false, false]);
        assert.deepEqual(Zotero.Weavero.lib.wvListenKeys(popup).filter(k => k.key.startsWith("layoutMenu:")), [], "no listener left");
        wv._wvWireLayoutMenu(win);
        wv._wvWireLayoutMenu(win);
        assert.lengthOf(ours(), 4, "four, once");
        assert.lengthOf(Zotero.Weavero.lib.wvListenKeys(popup).filter(k => k.key.startsWith("layoutMenu:")), 2, "popupshowing + popuphidden, once");
    });
});
