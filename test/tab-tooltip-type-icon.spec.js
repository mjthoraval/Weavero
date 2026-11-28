/* global describe, it, before, after, assert, Zotero, wvT */

// The tab tooltip names the item's TYPE by its icon, in front of the title
// (MJT 2026-11-24, on a reader tab's tooltip: "The tab header tooltip should
// show the Item Type", then "Just the icon of the item type in front"). The
// icon is the one Zotero's items list draws for the item the tab stands for:
// a reader tab's PARENT item (the Journal Article of its PDF), a standalone
// attachment's own, a note tab's note. A group-library tab keeps its card
// (library icon + name, separator) with the icon in front of the title there;
// the List-all-tabs rows go through the same code; a library tab is unchanged.
// Driven through `_populateTabTooltip`, the method the tooltip's popupshowing
// handler calls, on the real `#wv-tab-library-tooltip` (its CSS applies) with
// the trigger the hover would give it.

describe("Weavero — the tab tooltip shows the item type's icon in front of the title", function () {
    this.timeout(120000);
    let wv, win, doc, ZT;
    let parent, att, solo, note, group, gParent, gAtt, host;
    const readers = [];
    let noteTabID = null;

    const kebab = (n) => String(n).replace(/([a-z\d])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

    /** The tab element of `tabID` in the strip, and its title (the hover's trigger). */
    function tabName(tabID) {
        const el = doc.querySelector('#tab-bar-container .tab[data-id="' + tabID + '"]');
        assert.isOk(el, "the tab is in the strip: " + tabID);
        return el.querySelector(".tab-name") || el;
    }

    function tooltip() {
        const tt = doc.getElementById("wv-tab-library-tooltip");
        assert.isOk(tt, "the tab tooltip is wired (group-library glyph on)");
        return tt;
    }

    /** Build the tooltip as a hover on `trigger` would. */
    function populate(trigger) {
        const tt = tooltip();
        Object.defineProperty(tt, "triggerNode", { configurable: true, get: () => trigger });
        const ok = wv._populateTabTooltip(win, tt);
        return { tt, ok };
    }

    async function openTip(tt) {
        tt.openPopupAtScreen(win.screenX + 200, win.screenY + 200, false);
        const open = await wvT.waitFor(() => tt.state === "open", 5000, 50);
        assert.isOk(open, "the tooltip opens");
    }

    function closeTip(tt) {
        try { tt.hidePopup(); } catch (e) {}
        try { delete tt.triggerNode; } catch (e) {}
    }

    /** The text node holding `title` inside `root`. */
    function titleText(root, title) {
        const tw = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
        let n;
        while ((n = tw.nextNode())) { if (String(n.nodeValue).includes(title)) return n; }
        return null;
    }

    /** The one item-type icon of the tooltip: `iconName`, in front of the
     *  title text (document order), and -- when the tooltip is open -- drawn
     *  by Zotero's rule, 16 px, left of the title's first line and on it. */
    function checkIcon(tt, iconName, title, opened) {
        const icons = [...tt.querySelectorAll(".icon-item-type")];
        assert.lengthOf(icons, 1, "one item-type icon in the tooltip");
        const icon = icons[0];
        assert.strictEqual(icon.getAttribute("data-item-type"), iconName, "the icon the items list draws for that item");
        const text = titleText(tt, title);
        assert.isOk(text, "the title is in the tooltip: " + title);
        assert.isOk(icon.compareDocumentPosition(text) & 4 /* FOLLOWING */, "the icon comes before the title");
        if (!opened) return icon;
        const cs = win.getComputedStyle(icon);
        assert.include(String(cs.backgroundImage), kebab(iconName), "Zotero's item-type rule draws it");
        const ir = icon.getBoundingClientRect();
        assert.approximately(ir.width, 16, 0.5, "16 px wide");
        assert.approximately(ir.height, 16, 0.5, "16 px high");
        const range = doc.createRange();
        range.selectNodeContents(text);
        const line = range.getClientRects()[0];
        assert.isOk(line, "the title has a line box");
        assert.isAtMost(ir.right, line.left + 0.5, "the icon is in front of the title (left of its first line)");
        const mid = (ir.top + ir.bottom) / 2;
        assert.isOk(mid >= line.top && mid <= line.bottom, "on the same row as the title's first line: icon middle " + mid + " in [" + line.top + ", " + line.bottom + "]");
        return icon;
    }

    async function mkGroup() {
        let uid = Zotero.Users.getCurrentUserID();
        if (!uid) { await Zotero.Users.setCurrentUserID(1); uid = 1; }
        if (!Zotero.Users.getName(uid)) await Zotero.Users.setName(uid, "WV Test User");
        const g = /** @type {any} */ (new Zotero.Group());
        g.id = Zotero.Utilities.rand(100000, 900000);
        g.name = "WV-TEST tabtip " + Zotero.Utilities.randomString(4);
        g.description = "";
        g.editable = true;
        g.filesEditable = true;
        g.version = Zotero.Utilities.rand(1000, 10000);
        await g.saveTx();
        return g;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_populateTabTooltip");
        wvT.method("_populateReaderTabTooltip");
        wvT.method("_wvTabsMenuTabRow");
        win = wvT.win();
        doc = win.document;
        ZT = win.Zotero_Tabs;
        parent = await wvT.createItem("journalArticle", { title: "WV-TEST tabtip article" });
        att = await wvT.createTestPDFItem("wv-tabtip", { parentItemID: parent.id });
        solo = await wvT.createTestPDFItem("wv-tabtip-solo");
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote("<p>WV-TEST tabtip note</p>");
        await note.saveTx();
        group = await mkGroup();
        gParent = new Zotero.Item("book");
        gParent.libraryID = group.libraryID;
        gParent.setField("title", "WV-TEST tabtip group book");
        await gParent.saveTx();
        gAtt = await wvT.createTestPDFItem("wv-tabtip-grp", { libraryID: group.libraryID, parentItemID: gParent.id });
        for (const it of [att, solo, gAtt]) {
            const r = await wvT.openReaderTab(it.id);
            assert.isOk(r, "reader tab opened for " + it.id);
            readers.push(r);
        }
        host = doc.createElement("div");
        host.id = "wv-test-tabtip-host";
        host.style.display = "none";
        doc.documentElement.appendChild(host);
    });

    after(async function () {
        try { closeTip(doc.getElementById("wv-tab-library-tooltip")); } catch (e) {}
        try { if (host) host.remove(); } catch (e) {}
        for (const r of readers) wvT.closeReaderTab(r);
        try { if (noteTabID) ZT.close(noteTabID); } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(att, solo, parent, note, gAtt, gParent);
        try { if (group) await Zotero.Groups.get(group.id).eraseTx(); } catch (e) {}
    });

    it("a reader tab: the PARENT item's type (Journal Article) in front of the title, same row", async function () {
        const r = readers[0];
        const t = ZT._tabs.find(x => x.id === r.tabID);
        const { tt, ok } = populate(tabName(r.tabID));
        try {
            assert.isTrue(ok, "the tooltip shows");
            assert.strictEqual(parent.getItemTypeIconName(), "journalArticle");
            checkIcon(tt, "journalArticle", t.title, false);
            assert.isNull(tt.querySelector(".wv-tab-tooltip-header"), "My Library: no library card");
            await openTip(tt);
            checkIcon(tt, "journalArticle", t.title, true);
        }
        finally { closeTip(tt); }
    });

    it("a standalone attachment's reader tab: its own attachment icon", function () {
        const r = readers[1];
        const t = ZT._tabs.find(x => x.id === r.tabID);
        const { tt, ok } = populate(tabName(r.tabID));
        try {
            assert.isTrue(ok);
            checkIcon(tt, solo.getItemTypeIconName(), t.title, false);
            assert.strictEqual(solo.getItemTypeIconName(), "attachmentPDF");
        }
        finally { closeTip(tt); }
    });

    it("a note tab: the note icon", async function () {
        const ZP = win.ZoteroPane;
        const types = ZT._loadableTypes || [];
        if (!types.includes("note") || typeof ZP.openNote !== "function") this.skip();   // version: note tabs need note-in-tab
        // The one way note tabs open (root CLAUDE.md invariant).
        await ZP.openNote(note.id, { openInWindow: false });
        const t = await wvT.waitFor(() => ZT._tabs.find(x => x.data && x.data.itemID === note.id && /^note/.test(x.type)), 15000);
        assert.isOk(t, "a note tab");
        noteTabID = t.id;
        await wvT.waitFor(() => doc.querySelector('#tab-bar-container .tab[data-id="' + t.id + '"]'), 5000);
        const { tt, ok } = populate(tabName(t.id));
        try {
            assert.isTrue(ok);
            checkIcon(tt, "note", t.title, false);
        }
        finally { closeTip(tt); }
    });

    it("a group-library tab keeps its card (library icon + name, separator) with the icon in front of the title", async function () {
        const r = readers[2];
        const t = ZT._tabs.find(x => x.id === r.tabID);
        const { tt, ok } = populate(tabName(r.tabID));
        try {
            assert.isTrue(ok);
            const header = tt.querySelector(".wv-tab-tooltip-header");
            assert.isOk(header, "the library header");
            const libIcon = header.querySelector(".wv-tab-tooltip-icon");
            assert.isOk(libIcon, "the library icon");
            assert.include(String(libIcon.getAttribute("src")), "library-group.svg");
            assert.strictEqual(header.querySelector(".wv-tab-tooltip-libname").textContent, group.name);
            const sep = tt.querySelector(".wv-tab-tooltip-sep");
            assert.isOk(sep, "the separator");
            const icon = checkIcon(tt, "book", t.title, false);
            assert.isOk(header.compareDocumentPosition(sep) & 4, "header, then separator");
            assert.isOk(sep.compareDocumentPosition(icon) & 4, "separator, then the title row");
            assert.isNotOk(header.contains(icon), "the type icon is not in the library header");
            await openTip(tt);
            checkIcon(tt, "book", t.title, true);
        }
        finally { closeTip(tt); }
    });

    it("List-all-tabs rows: a current-window row and another window's row show the same icon", function () {
        const r = readers[0];
        const t = ZT._tabs.find(x => x.id === r.tabID);
        // A current-window row as Zotero's tabsMenuPanel.js builds it.
        const row = doc.createElement("div");
        row.className = "row";
        row.setAttribute("data-tab-id", r.tabID);
        const name = doc.createElement("div");
        name.className = "zotero-tabs-menu-entry title";
        name.setAttribute("title", t.title);
        row.appendChild(name);
        host.appendChild(row);
        let p = populate(name);
        try {
            assert.isTrue(p.ok);
            checkIcon(p.tt, "journalArticle", t.title, false);
        }
        finally { closeTip(p.tt); }
        // Another window's / a session's row (Weavero's own row builder).
        const wrow = wv._wvTabsMenuTabRow(doc, { item: att, title: "WV-TEST tabtip other window" }, null, "wv-test-tabtip-row");
        host.appendChild(wrow);
        p = populate(wrow.querySelector("label") || wrow);
        try {
            assert.isTrue(p.ok);
            checkIcon(p.tt, "journalArticle", "WV-TEST tabtip other window", false);
        }
        finally { closeTip(p.tt); }
        // A group item's row keeps the card, the icon in front of the title.
        const grow = wv._wvTabsMenuTabRow(doc, { item: gAtt, title: "WV-TEST tabtip group row" }, null, "wv-test-tabtip-row");
        host.appendChild(grow);
        p = populate(grow.querySelector("label") || grow);
        try {
            assert.isTrue(p.ok);
            assert.isOk(p.tt.querySelector(".wv-tab-tooltip-header"), "the group card");
            checkIcon(p.tt, "book", "WV-TEST tabtip group row", false);
        }
        finally { closeTip(p.tt); }
    });

    it("a library tab is unchanged: its title, no item-type icon", function () {
        const lt = ZT._tabs.find(x => x.id === "zotero-pane" || (typeof ZT.isLibraryTab === "function" && ZT.isLibraryTab(x.id)));
        assert.isOk(lt, "a library tab");
        const { tt, ok } = populate(tabName(lt.id));
        try {
            assert.isTrue(ok, "the library tab keeps its tooltip");
            assert.isNull(tt.querySelector(".icon-item-type"), "no item-type icon");
            assert.isNull(tt.querySelector(".wv-tab-tooltip-header"), "no library card");
            assert.isOk(String(tt.textContent).trim(), "its title");
        }
        finally { closeTip(tt); }
    });

    it("a reader window's tab tooltip draws the same icon", function () {
        // `_populateReaderTabTooltip` reads the hovered tab's item and title
        // from `_wvTabInfo`, stashed at hover (reader.ts).
        const tt = /** @type {any} */ (doc.createXULElement("tooltip"));
        tt.id = "wv-test-tabtip-reader-tooltip";
        host.appendChild(tt);
        try {
            tt._wvTabInfo = { itemID: att.id, title: "WV-TEST tabtip reader window" };
            assert.isTrue(wv._populateReaderTabTooltip(win, tt));
            checkIcon(tt, "journalArticle", "WV-TEST tabtip reader window", false);
            tt._wvTabInfo = { itemID: gAtt.id, title: "WV-TEST tabtip reader window group" };
            assert.isTrue(wv._populateReaderTabTooltip(win, tt));
            assert.isOk(tt.querySelector(".wv-tab-tooltip-header"), "the group card");
            checkIcon(tt, "book", "WV-TEST tabtip reader window group", false);
        }
        finally { tt.remove(); }
    });
});
