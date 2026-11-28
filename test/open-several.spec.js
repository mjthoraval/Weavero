/* global describe, it, before, after, assert, Zotero, wvT */

// Several items opened at once from the items list (MJT 2026-11-24: "When I
// select multiple items, I have the option to open in tabs, or in a new window.
// But they all open in separate windows. I think that there should be an option
// to open them all in a single new window"). Where two or more things open, the
// items list's menu says how many and where: Zotero's own "Open PDFs in New Tab /
// New Window" (locateMenu.js ViewItem, `item-menu-viewAttachment`) relabelled
// "Open 3 PDFs in New Tabs" / "Open 3 PDFs in Separate Windows", their commands
// Zotero's, and Weavero's "Open 3 PDFs in One New Window" just before the window
// one (open-where.ts _wvOpenSeveralItemsMenu). The kind follows what opens, as
// Zotero's own label does: PDFs, EPUBs, Snapshots, Notes; Attachments for
// documents of several kinds; Items when notes and documents mix. One item keeps
// Zotero's menu as it is; without Weavero's menu wiring (a disable) Zotero's
// labels come back by themselves (Zotero builds its Open entries afresh at every
// opening).
//
// FAILS on 1.3.0-dev.86 (integ 4d20deac): no such entries, no such window.

describe("Weavero — several items open in one new window", function () {
    this.timeout(180000);
    const L10N = "weavero-menu-items-open-several";
    const OURS = "wv-itemmenu-open-one-window";
    let wv, win, doc, ZP, pdf1, pdf2, pdf3, epub1, snap1, note1, note2, bare, parentA, childA, parentL;
    const sleep = (ms) => wvT.sleep(ms);
    const clean = (s) => String(s || "").replace(/[\u2068\u2069]/g, "");
    const label = (el) => clean(el && el.getAttribute("label"));

    before(async function () {
        this.timeout(60000);
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvOpenSeveralPlan", "_wvOpenSeveralItemsMenu", "_wvOpenSeveralInOneWindow", "_wvOpenSeveralNote"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
        }
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        pdf1 = await wvT.createTestPDFItem("wv-os-pdf1");
        pdf2 = await wvT.createTestPDFItem("wv-os-pdf2");
        pdf3 = await wvT.createTestPDFItem("wv-os-pdf3");
        epub1 = await wvT.createTestEPUBItem("wv-os-epub1");
        snap1 = await wvT.createTestSnapshotItem("wv-os-snap1");
        note1 = new Zotero.Item("note"); note1.setNote("<p>WV-TEST open-several note 1</p>"); await note1.saveTx();
        note2 = new Zotero.Item("note"); note2.setNote("<p>WV-TEST open-several note 2</p>"); await note2.saveTx();
        bare = await wvT.createItem("journalArticle", { title: "WV-TEST open-several: nothing to open" });
        parentA = await wvT.createItem("journalArticle", { title: "WV-TEST open-several: a parent with its PDF" });
        childA = await wvT.createTestPDFItem("wv-os-child", { parentItemID: parentA.id });
        parentL = await wvT.createItem("journalArticle", { title: "WV-TEST open-several: a web link only" });
        await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-os", parentItemID: parentL.id, title: "wv os link", contentType: "text/html" });
        try { win.Zotero_Tabs.select(win.Zotero_Tabs._tabs.find(t => String(t.type).startsWith("library")).id); } catch (e) {}
        try { await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {}
        await sleep(800);
    });

    after(async function () {
        this.timeout(30000);
        await wvT.erase(pdf1, pdf2, pdf3, epub1, snap1, note1, note2, bare, childA, parentA, parentL);
    });

    /** The items list's menu for `items`, as Zotero's right-click opens it
     *  (zoteroPane.js onItemsContextMenuOpen: built, then shown). */
    async function withItemMenu(items, fn) {
        await ZP.selectItems(items.map(i => i.id));
        await sleep(300);
        const menu = doc.getElementById("zotero-itemmenu");
        await ZP.buildItemContextMenu();
        menu.openPopupAtScreen(200, 200, true);
        await wvT.waitFor(() => menu.state === "open", 5000);
        await sleep(300);
        try { return await fn(menu); }
        finally {
            try { menu.hidePopup(); } catch (e) {}
            await sleep(300);
        }
    }
    /** The menu's Open entries for documents and notes: Zotero's, relabelled or
     *  not, and Weavero's. */
    const opens = (menu) => Array.from(menu.children).filter(x => !x.hidden
        && (x.id === OURS || x.getAttribute("data-l10n-id") === "item-menu-viewAttachment" || x.hasAttribute("data-wv-open-several")));

    it("the labels: each kind and the mixes, one and several, in en-US and in fr-FR", () => {
        const L = (loc) => new win.Localization(["weavero.ftl"], true, undefined, [loc]);
        const fmt = (l, args) => {
            const [m] = l.formatMessagesSync([{ id: L10N, args }]);
            const a = m && (m.attributes || []).find(x => x.name === "label");
            return clean(a && a.value);
        };
        const en = L("en-US");
        assert.strictEqual(fmt(en, { count: 3, kind: "pdf", where: "tabs" }), "Open 3 PDFs in New Tabs");
        assert.strictEqual(fmt(en, { count: 3, kind: "pdf", where: "window" }), "Open 3 PDFs in One New Window");
        assert.strictEqual(fmt(en, { count: 3, kind: "pdf", where: "windows" }), "Open 3 PDFs in Separate Windows");
        assert.strictEqual(fmt(en, { count: 2, kind: "epub", where: "window" }), "Open 2 EPUBs in One New Window");
        assert.strictEqual(fmt(en, { count: 2, kind: "snapshot", where: "tabs" }), "Open 2 Snapshots in New Tabs");
        assert.strictEqual(fmt(en, { count: 4, kind: "note", where: "windows" }), "Open 4 Notes in Separate Windows");
        assert.strictEqual(fmt(en, { count: 3, kind: "attachment", where: "window" }), "Open 3 Attachments in One New Window");
        assert.strictEqual(fmt(en, { count: 5, kind: "item", where: "tabs" }), "Open 5 Items in New Tabs");
        // One: the singular, for every kind and place.
        assert.strictEqual(fmt(en, { count: 1, kind: "pdf", where: "tabs" }), "Open 1 PDF in New Tab");
        assert.strictEqual(fmt(en, { count: 1, kind: "note", where: "window" }), "Open 1 Note in New Window");
        assert.strictEqual(fmt(en, { count: 1, kind: "item", where: "windows" }), "Open 1 Item in New Window");
        // fr-FR: its own plural rules and words (Zotero fr-FR's for the kinds).
        const fr = L("fr-FR");
        assert.strictEqual(fmt(fr, { count: 1, kind: "note", where: "tabs" }), "Ouvrir 1 note dans un nouvel onglet");
        assert.strictEqual(fmt(fr, { count: 3, kind: "note", where: "tabs" }), "Ouvrir 3 notes dans de nouveaux onglets");
        assert.strictEqual(fmt(fr, { count: 3, kind: "attachment", where: "window" }), "Ouvrir 3 pièces jointes dans une seule nouvelle fenêtre");
        assert.strictEqual(fmt(fr, { count: 2, kind: "item", where: "windows" }), "Ouvrir 2 documents dans des fenêtres séparées");
    });

    it("what opens: a note itself, a document the reader shows, a regular item's best one; nothing for the rest; each once", async () => {
        const ids = (p) => p.entries.map(e => e.item.id);
        let p = wv._wvOpenSeveralPlan(win, [pdf1, pdf2, pdf3]);
        assert.deepEqual(ids(p), [pdf1.id, pdf2.id, pdf3.id], "in selection order");
        assert.strictEqual(p.kind, "pdf");
        assert.isFalse(p.external);
        assert.strictEqual(wv._wvOpenSeveralPlan(win, [epub1, epub1]).kind, "epub");
        assert.strictEqual(wv._wvOpenSeveralPlan(win, [snap1]).kind, "snapshot");
        assert.strictEqual(wv._wvOpenSeveralPlan(win, [note1, note2]).kind, "note");
        assert.strictEqual(wv._wvOpenSeveralPlan(win, [pdf1, epub1, snap1]).kind, "attachment", "documents of several kinds");
        assert.strictEqual(wv._wvOpenSeveralPlan(win, [pdf1, note1]).kind, "item", "notes and documents");
        p = wv._wvOpenSeveralPlan(win, [parentA, childA, bare, parentL, pdf1]);
        assert.deepEqual(ids(p), [childA.id, pdf1.id], "the parent opens its PDF, once; no file, a web link only: skipped");
        await wvT.withPref("fileHandler.pdf", "C:\\wv-test\\viewer.exe", async () => {
            assert.isTrue(wv._wvOpenSeveralPlan(win, [pdf1, pdf2]).external, "another application opens PDFs");
        });
    });

    it("three PDFs: New Tabs, One New Window, Separate Windows, each saying how many; Zotero's commands kept", async () => {
        await wvT.withPref("openReaderInNewWindow", false, () => withItemMenu([pdf1, pdf2, pdf3], (menu) => {
            const o = opens(menu);
            assert.deepEqual(o.map(label), ["Open 3 PDFs in New Tabs", "Open 3 PDFs in One New Window", "Open 3 PDFs in Separate Windows"],
                o.map(x => x.id || x.getAttribute("data-l10n-id")).join(" | "));
            const [tabs, one, wins] = o;
            assert.strictEqual(one.id, OURS);
            for (const z of [tabs, wins]) {
                assert.isTrue(z.hasAttribute("zotero-locate"), "Zotero's own entry");
                assert.notMatch(String(z.id || ""), /^wv-/, "not one of Weavero's");
            }
            assert.strictEqual(tabs.getAttribute("data-wv-open-several"), "tabs");
            assert.strictEqual(wins.getAttribute("data-wv-open-several"), "windows");
            assert.strictEqual(tabs.getAttribute("data-l10n-id"), L10N, "Fluent keeps the label");
            assert.isTrue(one.hasAttribute("zotero-locate"), "Zotero's own clean-up takes it with its Open entries");
            assert.strictEqual(one.previousElementSibling, tabs);
        }));
        assert.isNull(doc.getElementById(OURS), "gone with the menu");
    });

    it("the kind follows what opens: Items for a note with documents, Attachments for documents of several kinds, Notes", async () => {
        await withItemMenu([pdf1, note1, epub1], (menu) => {
            assert.deepEqual(opens(menu).map(label), ["Open 3 Items in New Tabs", "Open 3 Items in One New Window", "Open 3 Items in Separate Windows"]);
        });
        await withItemMenu([pdf1, epub1, snap1], (menu) => {
            assert.deepEqual(opens(menu).map(label), ["Open 3 Attachments in New Tabs", "Open 3 Attachments in One New Window", "Open 3 Attachments in Separate Windows"]);
        });
        await withItemMenu([note1, note2], (menu) => {
            assert.deepEqual(opens(menu).map(label), ["Open 2 Notes in New Tabs", "Open 2 Notes in One New Window", "Open 2 Notes in Separate Windows"]);
        });
    });

    it("Zotero's \"Open in New Window\" setting first: the two window entries come first, One New Window before Separate Windows", async () => {
        await wvT.withPref("openReaderInNewWindow", true, () => withItemMenu([pdf1, pdf2], (menu) => {
            assert.deepEqual(opens(menu).map(label), ["Open 2 PDFs in One New Window", "Open 2 PDFs in Separate Windows", "Open 2 PDFs in New Tabs"]);
        }));
    });

    it("one item, or several of which one opens, keep Zotero's menu as it is", async () => {
        await wvT.withPref("openReaderInNewWindow", false, async () => {
            // Zotero counts a parent and its own PDF as two ("Open PDFs"); one
            // opens, so its label stays Zotero's.
            for (const [sel, words] of [[[pdf1], "PDF"], [[bare, pdf1], "PDF"], [[parentA, childA], "PDFs"]]) {
                await withItemMenu(sel, (menu) => {
                    const o = opens(menu);
                    assert.deepEqual(o.map(x => x.getAttribute("data-l10n-id")), ["item-menu-viewAttachment", "item-menu-viewAttachment"], sel.length + " selected");
                    assert.deepEqual(o.map(label), ["Open " + words + " in New Tab", "Open " + words + " in New Window"]);
                    assert.isNull(doc.getElementById(OURS));
                });
            }
        });
    });

    it("without Weavero's items-menu wiring (a disable), Zotero's entries read as Zotero writes them", async () => {
        wv._teardownItemsListContextMenu();
        try {
            await wvT.withPref("openReaderInNewWindow", false, () => withItemMenu([pdf1, pdf2, pdf3], (menu) => {
                const o = opens(menu);
                assert.deepEqual(o.map(x => x.getAttribute("data-l10n-id")), ["item-menu-viewAttachment", "item-menu-viewAttachment"]);
                assert.deepEqual(o.map(label), ["Open PDFs in New Tab", "Open PDFs in New Window"]);
                assert.isNull(doc.getElementById(OURS));
            }));
        }
        finally { wv._setupItemsListContextMenu(); }
    });

    /** One New Window for `items`, checked: exactly one new main window; its
     *  tabs, library tabs apart, are `expect` (item, kind) in that order, the
     *  first selected; the library tabs it has. Zotero 11 (zotero#6035): NONE,
     *  as Zotero's own "Open in New Window" makes none (zoteroPane.js: a window
     *  opened with readerTabState gets that tab alone; openInitialLibraryTab
     *  only in a window opened with nothing else to show). Zotero 9/10: the one
     *  fixed library tab every main window has (tabs.js 10.0.8, 'zotero-pane'),
     *  first. */
    async function oneNewWindow(items, expect) {
        const before = new Set(Zotero.getMainWindows());
        const srcDocs = win.Zotero_Tabs._tabs.length;
        let w = null;
        try {
            w = await wv._wvOpenSeveralInOneWindow(win, items);
            assert.isOk(w, "a window");
            await sleep(1500);
            const added = Zotero.getMainWindows().filter(x => !before.has(x));
            assert.strictEqual(added.length, 1, "exactly one new main window");
            assert.strictEqual(added[0], w);
            const Z = w.Zotero_Tabs;
            const types = Z._tabs.map(t => t.type).join(",");
            const libs = Z._tabs.filter(t => String(t.type).startsWith("library"));
            if (wvT.nativeWindows()) assert.lengthOf(libs, 0, "Zotero 11: no library tab, as Zotero's own Open in New Window: " + types);
            else {
                assert.lengthOf(libs, 1, "Zotero 9/10: the window's one library tab: " + types);
                assert.strictEqual(Z._tabs[0], libs[0], "first");
            }
            const docs = Z._tabs.filter(t => !String(t.type).startsWith("library"));
            assert.deepEqual(docs.map(t => t.data && t.data.itemID), expect.map(e => e[0].id), "in selection order: " + types);
            expect.forEach(([, kind], i) => assert.match(String(docs[i].type), kind === "note" ? /^note/ : /^reader/, "tab " + i + ": " + types));
            const sel = await wvT.waitFor(() => Z.selectedID === docs[0].id || w._wvDeferredSelectItemID === expect[0][0].id, 10000);
            assert.isOk(sel, "the first selected (Zotero 10, the window not in front: at its first activation): " + Z.selectedID);
            assert.strictEqual(win.Zotero_Tabs._tabs.length, srcDocs, "nothing opened in the window it came from");
        }
        finally {
            for (const x of Zotero.getMainWindows()) { if (!before.has(x)) { try { x.close(); } catch (e) {} } }
            await wvT.waitFor(() => Zotero.getMainWindows().every(x => before.has(x)), 10000);
        }
    }

    // FAILS on 1.3.0-peoplenet.7 on Zotero 11: the window opened as Ctrl+N's
    // (ZoteroPane.newWindow), with a library tab first (MJT 2026-11-25: "If I
    // open several PDF in a new window, they also get a library tab. Why?").
    it("One New Window: one new main window, a tab each in selection order, the first selected, the note a note tab, the item with nothing to open skipped", async function () {
        this.timeout(90000);
        await oneNewWindow([pdf1, bare, note1, epub1], [[pdf1, "doc"], [note1, "note"], [epub1, "doc"]]);
    });

    it("One New Window, a note first: the note stays first and selected; notes alone: no library tab either (Zotero 11)", async function () {
        this.timeout(120000);
        await oneNewWindow([note1, pdf1, pdf2], [[note1, "note"], [pdf1, "doc"], [pdf2, "doc"]]);
        await oneNewWindow([note1, note2], [[note1, "note"], [note2, "note"]]);
    });

    it("a note opens through ZoteroPane.openNote in that window, nothing else", () => {
        const s = wvT.src("_wvOpenSeveralNote");
        assert.include(s, ".openNote(");
        assert.match(s, /openInWindow:\s*false/);
        assert.notMatch(s, /Zotero_Tabs\.add\(/, "no tab of its own making");
        assert.notMatch(s, /getMainWindow\(\)/, "the window it is given, never the focused one");
    });

    it("Separate Windows stays Zotero's open: Weavero's merge into one reader window (Zotero 10) leaves it alone", async () => {
        const Z = win.ZoteroPane;
        const realOrig = Z._wvOrigViewItems;
        assert.isFunction(realOrig, "fixture: the merge wrapper is on");
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvOpenItemsInOneReaderWindow");
        const saved = wv._wvOpenItemsInOneReaderWindow;
        const calls = [];
        Z._wvOrigViewItems = function (items) { calls.push("zotero:" + items.length); return Promise.resolve(); };
        wv._wvOpenItemsInOneReaderWindow = async (o) => { calls.push("merged:" + o.length); return null; };
        try {
            wv._wvSetupMultiOpenConsolidation(win);
            await wvT.withPref("weavero.compactTitleBar", true, () => wvT.withPref("weavero.compactTitleBarReader", true, async () => {
                const marked = doc.createXULElement("menuitem");
                marked.setAttribute("data-wv-open-several", "windows");
                await Z.viewItems([pdf1, pdf2], { target: marked, shiftKey: false }, { forceAlternateWindowBehavior: true });
                assert.deepEqual(calls, ["zotero:2"], "Separate Windows: a window each, Zotero's own open");
                calls.length = 0;
                await Z.viewItems([pdf1, pdf2], { target: doc.createXULElement("menuitem"), shiftKey: false }, { forceAlternateWindowBehavior: true });
                assert.deepEqual(calls, wvT.nativeWindows() ? ["zotero:2"] : ["merged:2"], "any other open in new windows: as before");
            }));
        }
        finally {
            Z._wvOrigViewItems = realOrig;
            if (own) wv._wvOpenItemsInOneReaderWindow = saved;
            else delete wv._wvOpenItemsInOneReaderWindow;
            wv._wvSetupMultiOpenConsolidation(win);
        }
    });
});
