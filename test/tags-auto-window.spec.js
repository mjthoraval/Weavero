/* global describe, it, before, after, assert, Zotero, wvT */

// The Tags column's automatic-tag count, per main window (MJT 2026-10-26: "I
// would like to get this option also available from the right-click menu on
// the columns header. The settings option is the global default, while each
// main window has its own view setting from the right-click menu."). Intake:
// a submenu on the Tags line of the header menu; a window's choice is kept
// with the window across restarts; the Settings value is the default for
// windows that never chose and does not override them; the shared column
// width is left alone. Written before the code (feature skill, check first).

describe("Weavero — the Tags column's automatic-tag count per window", function () {
    this.timeout(60000);
    let wv, win, doc, ZP, iv, rp, P, col;

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvTagsAutoFor", "_wvTagsAutoSet", "_wvDecorateColumnPicker", "_wvTabSessionCaptureMainState",
            "_wvTabSessionApplyMainState", "_wvWindowStoreBuildDoc", "_wvCountTitle"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane; iv = ZP.itemsView; rp = iv.rowProvider;
        P = await wvT.createItem("journalArticle", { title: "WVTAW parent" });
        P.addTag("m1"); P.addTag("a1", 1); await P.saveTx();
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await iv.waitForLoad();
        col = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns().find((c) => /weaveroTags$/.test(String(c.dataKey)));
        if (!col || !wv._getEnableVisualExtras()) this.skip();
    });

    after(async function () {
        try { wv._wvTagsAutoSet(win, null); } catch (e) {}
        await wvT.erase(P);
    });

    const cellText = () => {
        const idx = rp.getRowIndexByID(P.id);
        if (iv.isContainerOpen(idx)) iv.toggleOpenState(idx);
        return col.renderCell(rp.getRowIndexByID(P.id), col.dataProvider(P), col, false, doc).textContent;
    };

    it("a window's own choice wins over the Settings default, for that window only", async function () {
        wv._wvTagsAutoSet(win, null);
        assert.strictEqual(wv._wvTagsAutoFor(win), wv._getEnableTagsCountAuto(), "no choice: the Settings default");
        wv._wvTagsAutoSet(win, false);
        assert.isFalse(wv._wvTagsAutoFor(win));
        assert.strictEqual(cellText(), "1", "this window: the manual count only");
        assert.strictEqual(wv._wvCountTitle("tags-manual", 3, win), "3 Tags", "its Tags popup: all of its one number");
        assert.strictEqual(wv._wvTagsAutoFor({}), wv._getEnableTagsCountAuto(), "another window still follows Settings");
        await wvT.withPref("weavero.enableTagsCountAuto", true, async () => {
            assert.isFalse(wv._wvTagsAutoFor(win), "a Settings change does not override the window's choice");
        });
        wv._wvTagsAutoSet(win, true);
        assert.strictEqual(cellText(), "1|1", "turned on: both counts");
        assert.strictEqual(wv._wvCountTitle("tags-manual", 3, win), "3 Manual Tags");
        await wvT.withPref("weavero.enableTagsCountAuto", false, async () => {
            assert.isTrue(wv._wvTagsAutoFor(win), "still the window's choice");
        });
        wv._wvTagsAutoSet(win, null);
        assert.strictEqual(wv._wvTagsAutoFor(win), wv._getEnableTagsCountAuto(), "cleared: the default again");
    });

    it("the header menu's Tags line is a submenu: Show Column and Automatic-Tag Count", async function () {
        const pop = /** @type {any} */ (doc.createXULElement("menupopup"));
        pop.id = "zotero-column-picker";
        iv.buildColumnPickerMenu(pop);
        doc.documentElement.appendChild(pop);
        try {
            wv._wvTagsAutoSet(win, false);
            wv._wvDecorateColumnPicker(win, pop);
            const cols = iv._getColumns();
            const tagsIdx = cols.findIndex((c) => /weaveroTags$/.test(String(c.dataKey)));
            const tagsMenu = [...pop.querySelectorAll("menu.wv-colpick-tags")][0];
            assert.isOk(tagsMenu, "the Tags line is a submenu");
            assert.isNull(pop.querySelector(`menuitem[colindex="${tagsIdx}"]:not(.wv-colpick-tags-show)`), "no second plain Tags line");
            const items = [...tagsMenu.querySelector("menupopup").children].filter((e) => e.localName === "menuitem");
            assert.deepEqual(items.map((e) => e.getAttribute("label")), ["Show Column", "Automatic-Tag Count"]);
            const [show, auto] = items;
            assert.strictEqual(show.getAttribute("colindex"), String(tagsIdx), "Show Column is Zotero's own column checkbox");
            assert.strictEqual(show.hasAttribute("checked"), !cols[tagsIdx].hidden);
            assert.strictEqual(tagsMenu.classList.contains("wv-colpick-checked"), !cols[tagsIdx].hidden, "the Tags line shows the column's check");
            assert.isFalse(auto.hasAttribute("checked"), "this window's choice: off");
            // A synthetic command / doCommand() never reaches a chrome
            // listener (memory reference_zotero_bridge_ui_tools): call the
            // handler the item keeps; the click itself is a hands-on check.
            assert.isFunction(auto._wvOnCommand, "the item keeps its command handler");
            auto._wvOnCommand();
            assert.isTrue(wv._wvTagsAutoFor(win), "the menu turns it on for this window");
        }
        finally { pop.remove(); wv._wvTagsAutoSet(win, null); }
    });

    // MJT 2026-10-26: "Empty square when disabled" -- `menu-iconic` opens the
    // icon slot, and an open slot with no image paints Zotero 11's empty
    // square (upstream register #16). Only a shown column opens it.
    it("the Tags line opens its icon slot only to draw the column's check", function () {
        for (const hidden of [false, true]) {
            const pop = /** @type {any} */ (doc.createXULElement("menupopup"));
            const mi = /** @type {any} */ (doc.createXULElement("menuitem"));
            mi.setAttribute("label", "Tags");
            pop.appendChild(mi);
            doc.documentElement.appendChild(pop);
            try {
                wv._wvColPickTagsSubmenu(win, mi, { hidden, dataKey: "weaveroTags" });
                const menu = pop.querySelector("menu.wv-colpick-tags");
                assert.strictEqual(menu.classList.contains("menu-iconic"), !hidden, hidden ? "hidden column: closed slot, no square" : "shown column: the check");
                assert.strictEqual(menu.classList.contains("wv-colpick-checked"), !hidden);
            }
            finally { pop.remove(); }
        }
    });

    // MJT 2026-10-26: "Put Weavero icon consistently next to the text, so that
    // the end of the line can be used for the arrow." Items of a closed popup
    // have no computed style (memory reference_gecko_closed_submenu_no_computed_style):
    // read the rule off clones placed in the document.
    it("Weavero's lines carry the mark right after their text, not at the end of the line", function () {
        const pop = /** @type {any} */ (doc.createXULElement("menupopup"));
        pop.id = "zotero-column-picker";
        iv.buildColumnPickerMenu(pop);
        doc.documentElement.appendChild(pop);
        const box = /** @type {any} */ (doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
        doc.documentElement.appendChild(box);
        try {
            wv._wvDecorateColumnPicker(win, pop);
            const ours = [...pop.querySelectorAll("menuitem.wv-colpick-ours, menu.wv-colpick-ours")];
            assert.isAtLeast(ours.length, 1, "Weavero's columns are in the picker");
            for (const line of ours) {
                const clone = line.cloneNode(true);
                box.appendChild(clone);
                const text = clone.querySelector(".menu-text");
                assert.isOk(text, "a text label");
                assert.match(win.getComputedStyle(text, "::after").backgroundImage, /icon-(light|dark)-16\.png/, line.getAttribute("label") + ": the mark after its text");
                assert.include(["none", "normal"], win.getComputedStyle(clone, "::after").content, line.getAttribute("label") + ": nothing at the end of the line");
            }
        }
        finally { pop.remove(); box.remove(); }
    });

    it("a window's choice is saved with the window and comes back", async function () {
        wv._wvTagsAutoSet(win, false);
        assert.strictEqual(wv._wvTabSessionCaptureMainState(win).tagsAuto, false, "captured with the window's state");
        assert.strictEqual(wv._wvWindowStoreBuildDoc().anchorTagsAuto, false, "the first window's own store field");
        wv._wvTagsAutoSet(win, null);
        assert.isUndefined(wv._wvTabSessionCaptureMainState(win).tagsAuto, "no choice: nothing saved");
        assert.isUndefined(wv._wvWindowStoreBuildDoc().anchorTagsAuto);
        await wv._wvTabSessionApplyMainState(win, { tagsAuto: false });
        assert.isFalse(wv._wvTagsAutoFor(win), "restored");
        await wv._wvTabSessionApplyMainState(win, {});
        assert.strictEqual(wv._wvTagsAutoFor(win), wv._getEnableTagsCountAuto(), "a state without one: the default");
    });
});
