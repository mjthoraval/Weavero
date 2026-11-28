/* global describe, it, before, after, assert, Zotero, wvT */
// The People tab (people.ts, branch people2; plan approved by MJT 2026-11-22):
// a tab of type "wvpeople" -- no hyphen, Zotero's parseTabType splits a type on
// "-" -- one per main window, filled by Weavero.
//   - opened from File -> People, again selects the same tab; its icon in the
//     tab bar; Zotero's context pane put away while it is selected (Zotero does
//     it for a library tab only);
//   - in Weavero's split view beside the library and beside a PDF (MJT was told
//     it can sit there): both sides on screen, the reader's item pane beside a
//     PDF side;
//   - left out of what Zotero saves (its restoreState aborts on a type it has no
//     hook for) and kept by Weavero instead: closed by a disable or reload,
//     back where it was after it;
//   - no move to another window in v1: Zotero's own has no hook for it,
//     Weavero's move targets and Group Tabs leave it out, Show in Library hides;
//   - nothing written into any library.
describe("Weavero — People tab: one per window, split view, kept by Weavero", function () {
    this.timeout(180000);
    let wv, win, doc, ZT, pdf, prevSplit;
    const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
    const libTab = () => ZT._tabs.find(t => String(t.type).startsWith("library"));
    const ppTab = () => ZT._tabs.find(t => String(t.type).startsWith("wvpeople")) || null;
    const tabOfItem = (it) => ZT._tabs.find(t => t && t.data && t.data.itemID === it.id) || null;
    const shown = (id) => {
        const el = doc.getElementById(id);
        if (!el) return null;
        const cs = win.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.visibility === "hidden" || cs.display === "none" || r.width <= 40) return null;
        const hit = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return (hit && el.contains(hit)) ? r : null;
    };
    const separateAll = () => { for (const s of (win._wvTSplits || []).slice()) wv._wvTabSplitSeparate(win, s.id); };
    const counts = async () => {
        const n = (sql) => Zotero.DB.valueQueryAsync(sql);
        return [await n("SELECT COUNT(*) FROM items"), await n("SELECT COUNT(*) FROM itemNotes"), await n("SELECT COUNT(*) FROM collections")].join("/");
    };
    let before0 = "";
    let ctxWas = null;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvPeopleTabOpen", "_wvPeopleTabOf", "_wvPeopleTabClose", "_wvPeopleTabsPersist", "_wvPeopleTabsRestoreAll", "_wvTabSplitCreate", "_wvTabSplitOf"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZT = win.Zotero_Tabs;
        // The reader's item pane as a fresh profile has it, collapsed (zoteroPane.xhtml): the
        // split view's case needs the reader side's width, and a spec that left the pane open
        // (pane-lock.spec.js until 2026-11-27) failed it (dev.99 triage). Put back in after().
        ctxWas = !!win.ZoteroContextPane.collapsed;
        win.ZoteroContextPane.collapsed = true;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        pdf = await wvT.createTestPDFItem("wv-people-tab");
        before0 = await counts();
    });

    after(async function () {
        try { separateAll(); } catch (e) {}
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        const t = pdf && tabOfItem(pdf);
        if (t) { try { ZT.close(t.id); } catch (e) {} }
        await sleep(300);
        try { ZT.select(libTab().id); } catch (e) {}
        await wvT.erase(pdf);
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (e) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (e) {}
        try { if (ctxWas !== null) win.ZoteroContextPane.collapsed = ctxWas; } catch (e) {}
    });

    it("opens as one tab of type wvpeople per window, with its icon and its view; opening again selects the same tab", async function () {
        const t = wv._wvPeopleTabOpen(win);
        assert.ok(t, "a tab");
        assert.strictEqual(t.type, "wvpeople", "no hyphen in the type (tabs.js parseTabType splits on -)");
        assert.strictEqual(ZT.parseTabType(t.type).tabContentType, "wvpeople");
        assert.strictEqual(ZT.selectedID, t.id, "selected");
        assert.ok(await wvT.waitFor(() => wv._wvPeopleRootOf(win), 5000, 50), "its view");
        assert.ok(await wvT.waitFor(() => shown(t.id), 5000, 50), "on screen");
        assert.ok(doc.querySelector("#wv-pp-root-" + t.id + " .wv-pp-main .wv-pp-search"), "the search, above the table");
        const tabEl = doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"]');
        const icon = await wvT.waitFor(() => doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"] .tab-icon'), 3000, 50);
        assert.ok(icon, "a tab icon: " + (tabEl ? tabEl.outerHTML.slice(0, 400) : "no tab element"));
        assert.match(win.getComputedStyle(icon).backgroundImage, /data:image\/svg\+xml/, "the person icon");
        ZT.select(libTab().id); await sleep(200);
        const again = wv._wvPeopleTabOpen(win);
        assert.strictEqual(again.id, t.id, "the same tab");
        assert.strictEqual(ZT._tabs.filter(x => String(x.type).startsWith("wvpeople")).length, 1, "one per window");
        assert.strictEqual(ZT.selectedID, t.id);
    });

    it("selected, it puts Zotero's context pane away -- a reader's item pane does not stay beside it", async function () {
        await Zotero.Reader.open(pdf.id, null, { openInWindow: false });
        const rt = await wvT.waitFor(() => tabOfItem(pdf), 20000, 100);
        assert.ok(rt, "a reader tab");
        ZT.select(rt.id); await sleep(800);
        const pane = doc.getElementById("zotero-context-pane");
        // Off = no room taken, whatever Zotero's attributes say: Zotero 9/10's
        // ZoteroContextPane.update() lays the pane out again for any tab but the
        // library (at every select and window resize).
        const off = () => pane.getBoundingClientRect().width === 0 && pane.getBoundingClientRect().height === 0;
        ZT.select(ppTab().id);
        assert.ok(await wvT.waitFor(() => off(), 5000, 50), "the context pane takes no room: " + JSON.stringify(pane.getBoundingClientRect()));
        win.dispatchEvent(new win.Event("resize"));
        await sleep(300);
        assert.ok(off(), "nor after a window resize (Zotero lays the pane out again)");
        ZT.select(rt.id);
        assert.ok(await wvT.waitFor(() => !doc.documentElement.hasAttribute("wv-people-paneoff") && win.getComputedStyle(pane).display !== "none", 5000, 50), "back for the reader");
    });

    it("SPLIT VIEW: beside the library, both sides on screen, each selectable; beside a PDF, the reader's item pane shows while People is selected", async function () {
        separateAll();
        const L = libTab(), P = ppTab();
        ZT.select(L.id); await sleep(300);
        let s = wv._wvTabSplitCreate(win, L.id, P.id, { select: "right" });
        assert.ok(s, "a split of the library and People");
        await sleep(900);
        try {
            assert.ok(shown(L.id), "the library side on screen");
            assert.ok(shown(P.id), "the People side on screen");
            const rl = doc.getElementById(L.id).getBoundingClientRect(), rp = doc.getElementById(P.id).getBoundingClientRect();
            assert.isBelow(rl.right, rp.left + 1, "side by side");
            const root = wv._wvPeopleRootOf(win);
            assert.isAbove(root.getBoundingClientRect().width, 100, "the People view fills its side");
            assert.isAtMost(root.getBoundingClientRect().right, rp.right + 0.5, "inside its card");
            ZT.select(L.id); await sleep(400);
            assert.ok(shown(P.id), "People stays on screen while the library is selected");
            ZT.select(P.id); await sleep(400);
            assert.ok(shown(L.id), "and the library while People is");
            assert.strictEqual(wv._wvTabSplitOf(win, P.id), s, "still one split");
            // Its record names the People side: it can come back after a restart.
            wv._wvTabSplitPersist();
            const recs = JSON.parse(String(Zotero.Prefs.get("weavero.tabSplits") || "[]"));
            assert.ok(recs.some(r => r.l === "lib" && r.r === "people"), "recorded as lib|people: " + Zotero.Prefs.get("weavero.tabSplits"));
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
        await sleep(400);
        const rt = tabOfItem(pdf);
        ZT.select(rt.id); await sleep(500);
        s = wv._wvTabSplitCreate(win, rt.id, P.id, { select: "right" });
        assert.ok(s, "a split of a PDF and People");
        await sleep(1200);
        try {
            assert.ok(shown(rt.id) && shown(P.id), "both on screen");
            ZT.select(P.id);
            const pane = doc.getElementById("zotero-context-pane");
            assert.ok(await wvT.waitFor(() => !pane.hasAttribute("collapsed") || doc.getElementById("zotero-context-splitter").getAttribute("state") === "collapsed", 5000, 50),
                "the reader's item pane stays (or is collapsed by the user's own state), not put away by People");
        }
        finally { wv._wvTabSplitSeparate(win, s.id); }
        await sleep(300);
    });

    it("left out of what Zotero saves; Weavero records it -- a reload closes it and brings it back at its place, selected", async function () {
        const P = ppTab();
        assert.ok(P);
        const all = ZT.getState();
        assert.notOk(all.some(t => String(t.type).startsWith("wvpeople")), "Zotero's session never holds a wvpeople tab");
        const state = win.ZoteroPane.getState ? win.ZoteroPane.getState() : null;
        if (state && state.tabs) assert.notOk(state.tabs.some(t => String(t.type).startsWith("wvpeople")), "nor ZoteroPane's");
        ZT.select(P.id); await sleep(200);
        const idx = ZT._tabs.indexOf(P);
        wv._wvPeopleTabsPersist(true);
        const path = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-tabs.json");
        let txt = "";
        for (let i = 0; i < 50 && !/"sel":true/.test(txt); i++) { await sleep(100); try { txt = await IOUtils.readUTF8(path); } catch (e) {} }
        assert.match(txt, /"sel":true/, "recorded, selected");
        // What a reload does: destroy closes it (a type Zotero does not know
        // must not stay in its list), the next start reads the record.
        wv._wvPeopleTabClose(win);
        await sleep(300);
        assert.isNull(ppTab(), "closed");
        delete wv._wvPpTabsPending;
        await wv._wvPeopleTabsLoad();
        wv._wvPeopleTabsRestoreAll();
        const back = await wvT.waitFor(() => ppTab(), 8000, 100);
        assert.ok(back, "back");
        assert.strictEqual(ZT._tabs.indexOf(back), idx, "at its place");
        assert.strictEqual(ZT.selectedID, back.id, "selected as it was");
    });

    // MJT 2026-11-25: installing 1.3.0-peoplenet.8 unpinned the Researchers tab he had just
    // pinned -- the record kept its place, not Zotero's pin. FAILS on 1.3.0-peoplenet.8.
    it("pinned by Zotero: a reload brings it back pinned, at its place among the pins", async function () {
        if (typeof ZT.setPinned !== "function") this.skip();
        const P = ppTab();
        assert.ok(P);
        ZT.setPinned(P.id, true);
        assert.ok(P.pinned, "pinned");
        const idx = ZT._tabs.indexOf(P);
        const path = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-tabs.json");
        wv._wvPeopleTabsPersist(true);
        let txt = "";
        for (let i = 0; i < 50 && !/"pin":true/.test(txt); i++) { await sleep(100); try { txt = await IOUtils.readUTF8(path); } catch (e) {} }
        assert.match(txt, /"pin":true/, "the record keeps the pin");
        try {
            wv._wvPeopleTabClose(win);
            await sleep(300);
            assert.isNull(ppTab(), "closed");
            delete wv._wvPpTabsPending;
            await wv._wvPeopleTabsLoad();
            wv._wvPeopleTabsRestoreAll();
            const back = await wvT.waitFor(() => ppTab(), 8000, 100);
            assert.ok(back, "back");
            assert.isTrue(!!back.pinned, "pinned again");
            assert.strictEqual(ZT._tabs.indexOf(back), idx, "at its place");
        }
        finally {
            const t = ppTab();
            if (t && t.pinned) ZT.setPinned(t.id, false);
            wv._wvPeopleTabsPersist(true);
            await sleep(300);
        }
    });

    // MJT 2026-11-23 (1.3.0-dev.76): an install, then a reload a second later. The new
    // instance had not read the record yet (the read waits for the update backup), and
    // its stop wrote "no tab" over it: the tab never came back.
    it("an instance stopped before it read the recorded tabs leaves the record alone", async function () {
        const P = ppTab();
        assert.ok(P);
        ZT.select(P.id); await sleep(200);
        const path = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-tabs.json");
        wv._wvPeopleTabsPersist(true);
        let txt = "";
        for (let i = 0; i < 50 && !/"sel":true/.test(txt); i++) { await sleep(100); try { txt = await IOUtils.readUTF8(path); } catch (e) {} }
        assert.match(txt, /"sel":true/, "recorded");
        const before = txt;
        // The state of an instance between its start and its read of the record.
        wv._wvPeopleTabClose(win);
        await sleep(300);
        const wasRead = wv._wvPpTabsRead;
        wv._wvPpTabsPending = [];
        wv._wvPpTabsRead = false;
        delete wv._wvPpTabsLast;
        try {
            wv._wvPeopleTabsPersist(true);
            await sleep(800);
            assert.strictEqual(await IOUtils.readUTF8(path), before, "the record is unchanged");
        }
        finally { wv._wvPpTabsRead = wasRead; }
        delete wv._wvPpTabsPending;
        await wv._wvPeopleTabsLoad();
        wv._wvPeopleTabsRestoreAll();
        assert.ok(await wvT.waitFor(() => ppTab(), 8000, 100), "the next start brings it back");
    });

    // MJT 2026-11-25: "The list all tabs is broken" -- Zotero's List all tabs reads every
    // non-library tab's item (tabsMenuPanel.js refreshList: getItemTypeIconName) and threw on
    // the Researchers tab, which has none: the list ended there (pinned right after My
    // Library, My Library alone). FAILS on 1.3.0-peoplenet.9.
    it("List all tabs lists every tab, the Researchers tab too (its person icon), pinned or not", async function () {
        const panel = doc.getElementById("zotero-tabs-menu-panel");
        if (!panel || typeof panel.refreshList !== "function") wvT.absent("the tabs menu panel");
        const P = ppTab();
        assert.ok(P);
        const list = () => panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
        const listed = () => Array.from(list().querySelectorAll(".row[data-tab-id]")).map(r => r.dataset.tabId);
        // Zotero builds the list only while the panel shows: say it does, for the check.
        Object.defineProperty(panel, "visible", { value: true, configurable: true });
        try {
            for (const pin of [false, true]) {
                if (pin && typeof ZT.setPinned !== "function") continue;
                if (pin) ZT.setPinned(P.id, true);
                panel.refreshList();
                const ids = listed();
                for (const t of ZT._tabs) assert.include(ids, t.id, (pin ? "pinned: " : "") + "a row for the " + t.type + " tab");
                const row = list().querySelector('.row[data-tab-id="' + P.id + '"]');
                assert.equal(row.querySelector(".icon-item-type").getAttribute("data-item-type"), "wvpeople", "the Researchers' person");
            }
        }
        finally {
            if (P.pinned) ZT.setPinned(P.id, false);
            delete panel.visible;
            try { list().replaceChildren(); } catch (e) {}
        }
    });

    it("no move to another window in v1: Zotero offers none, Weavero's move targets and Group Tabs leave it out, Show in Library is hidden", async function () {
        const P = ppTab();
        // Zotero 11 (zotero#6035) moves tabs between its windows through a transfer hook;
        // Zotero 10 has neither.
        if (typeof ZT._hasHook === "function") assert.isFalse(ZT._hasHook("wvpeople", "transfer"), "Zotero: no transfer hook, so no Move to New Window");
        if (typeof ZT.moveToWindow === "function") assert.isNull(await ZT.moveToWindow(P.id, win), "Zotero's moveToWindow refuses it");
        const el = Array.from(doc.querySelectorAll('#tab-bar-container .tab[data-id="' + P.id + '"]')).find(x => x.getBoundingClientRect().width > 0);
        const r = el.getBoundingClientRect();
        ZT._openMenu(Math.round(win.mozInnerScreenX + r.left + 10), Math.round(win.mozInnerScreenY + r.top + 10), P.id);
        await sleep(600);
        const pops = Array.from(doc.querySelectorAll("popupset > menupopup")).filter(p => p.state === "open" || p.state === "showing");
        try {
            const items = pops.flatMap(p => Array.from(p.querySelectorAll(":scope > menuitem, :scope > menu")));
            const visible = items.filter(mi => !mi.hidden && win.getComputedStyle(mi).display !== "none");
            const sil = Zotero.getString("general.showInLibrary");
            assert.notOk(visible.some(mi => mi.getAttribute("label") === sil), "no Show in Library");
            assert.notOk(visible.some(mi => mi.classList.contains("wv-grouptabs")), "no Group Tabs");
            assert.notOk(pops.some(p => p.querySelector(".wv-mv-target")), "no Weavero move target");
        }
        finally { for (const p of pops) { try { p.hidePopup(); } catch (e) {} } }
    });

    it("File -> People opens it, beside Weavero's window entries; off, the entry hides and the tab closes", async function () {
        wv._wvPeopleTabClose(win);
        await sleep(200);
        const menus = wv._wvMenubarMenus;
        assert.ok(menus && menus.file, "the File entries");
        const entry = menus.file.find(m => m.l10nID === "weavero-menu-file-people");
        assert.ok(entry, "File -> People registered");
        const popup = doc.getElementById("menu_FilePopup");
        const ev = doc.createEvent("Event"); ev.initEvent("popupshowing", true, true); popup.dispatchEvent(ev);
        try {
            const el = popup.querySelector(':scope > [data-wv-menubar="people"]');
            assert.ok(el && !el.hidden, "shown");
            const prev = el.previousElementSibling;
            assert.ok(prev && (prev.dataset.wvMenubar === "newmainwin" || prev.id === "menu_newWindow"), "right after the window entries: " + (prev && (prev.dataset.wvMenubar || prev.id)));
            entry.onCommand(null, { menuElem: el });
            assert.ok(await wvT.waitFor(() => ppTab() && ZT.selectedID === ppTab().id, 5000, 50), "opened and selected");
        }
        finally { const e2 = doc.createEvent("Event"); e2.initEvent("popuphidden", true, true); popup.dispatchEvent(e2); }
        await wvT.withPref("weavero.enablePeople", false, async () => {
            assert.ok(await wvT.waitFor(() => !ppTab(), 5000, 50), "the tab closes");
            const ev2 = doc.createEvent("Event"); ev2.initEvent("popupshowing", true, true); popup.dispatchEvent(ev2);
            try {
                const el = popup.querySelector(':scope > [data-wv-menubar="people"]');
                assert.ok(!el || el.hidden, "the entry hides");
            }
            finally { const e3 = doc.createEvent("Event"); e3.initEvent("popuphidden", true, true); popup.dispatchEvent(e3); }
            assert.isNull(wv._wvPeopleTabOpen(win), "and cannot open");
        });
    });

    it("nothing of it is ever written into a library", async function () {
        assert.strictEqual(await counts(), before0, "items / notes / collections unchanged (the PDF fixture made before)");
    });
});
