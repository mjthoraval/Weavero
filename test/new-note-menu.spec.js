/* global describe, it, before, after, assert, Zotero, Services, wvT */

// WV-TEMP-134357 (upstream register #34): on Zotero 11, ZoteroPane.updateNewNoteMenu
// -- the popupshowing of the toolbar's New Note menu and of File > New --
// sets the child-note command's `disabled` to a stringified boolean, "false"
// for an eligible item; the linked menuitem then carries disabled="" and
// Firefox 153 treats the attribute's presence as disabled: "New Item Note"
// greyed and dead. Weavero removes a "false" after Zotero's pass. The second
// test runs the same steps with the workaround torn down: it shows the bug,
// which the first test guards -- and it is the tripwire, failing once Zotero
// sets the attribute properly: then retire the workaround.

describe("Weavero — \"New Item Note\" is enabled for an eligible item in the toolbar's New Note menu (WV-TEMP-134357)", function () {
    this.timeout(30000);
    let wv, win, ZP, doc, btn, popup, item;

    const open = async () => {
        popup.openPopup(btn, "after_start", 0, 0, false, false);
        const shown = await wvT.waitFor(() => popup.state === "open" || popup.state === "showing", 3000);
        assert.ok(shown, "the New Note popup opened");
        await wvT.sleep(100);
    };
    const close = async () => { try { popup.hidePopup(); } catch (e) {} await wvT.sleep(80); };
    const read = () => {
        const cmd = doc.getElementById("cmd_zotero_newChildNote");
        const mi = popup.querySelector("menuitem[command='cmd_zotero_newChildNote']");
        let matches = null; try { matches = mi.matches(":disabled"); } catch (e) {}
        return { cmdAttr: cmd.getAttribute("disabled"), miHas: mi.hasAttribute("disabled"), miProp: !!mi.disabled, matches };
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvWireNewNoteMenuFix !== "function") wvT.absent("_wvWireNewNoteMenuFix");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        doc = win.document;
        btn = doc.getElementById("zotero-tb-note-add");
        popup = btn && btn.querySelector("menupopup");
        if (!popup) wvT.absent("the toolbar's New Note popup");
        item = await wvT.createItem("journalArticle", { title: "WV new note menu" });
        await ZP.selectItem(item.id);
        await wvT.sleep(200);
        assert.strictEqual(ZP.getSelectedItems().length, 1, "one regular item selected");
    });

    after(async function () {
        await close();
        try { wv._wvWireNewNoteMenuFix(win); } catch (e) {}
        await wvT.erase(item);
    });

    it("with the workaround: the command carries no disabled attribute, the menuitem is enabled; with no item selected both stay disabled", async function () {
        await open();
        try {
            const r = read();
            assert.isNull(r.cmdAttr, "the stringified \"false\" is gone: " + JSON.stringify(r));
            assert.isFalse(r.miHas, "the menuitem carries no disabled attribute");
            assert.isFalse(r.miProp, "and is enabled");
            if (r.matches !== null) assert.isFalse(r.matches, "does not match :disabled");
        } finally { await close(); }
        // Not eligible (nothing selected): Zotero's "true" stays.
        ZP.itemsView.selection.clearSelection();
        await wvT.sleep(150);
        await open();
        try {
            const r = read();
            assert.strictEqual(r.cmdAttr, "true", "disabled stays for no selection");
            assert.isTrue(r.miProp, "the menuitem is disabled then");
        } finally { await close(); await ZP.selectItem(item.id); await wvT.sleep(150); }
    });

    it("torn down, the same open shows Zotero's bug (tripwire: fails once Zotero fixes updateNewNoteMenu -- retire WV-TEMP-134357)", async function () {
        wv._wvTeardownNewNoteMenuFix();
        try {
            await open();
            const r = read();
            assert.strictEqual(r.cmdAttr, "false",
                "Zotero still sets the stringified boolean (if this fails, Zotero fixed it: retire the workaround)");
            // The greyed entry is the Firefox 153 (Zotero 11) regression: on
            // Zotero 10 / Firefox 140 the same attribute leaves the item
            // enabled (MJT's 10.0.6 screenshot, 2026-10-21; the 10.0.6
            // release gate failed here the same day).
            const ff = parseInt(String(Services.appinfo.platformVersion), 10);
            if (ff >= 153) assert.isTrue(r.miProp, "and Firefox " + ff + " reads the attribute's presence as disabled (if this fails on a newer platform, retire too)");
            else assert.isFalse(r.miProp, "on Firefox " + ff + " the attribute's presence does not disable the item (the regression is Zotero 11's)");
        } finally {
            await close();
            wv._wvWireNewNoteMenuFix(win);
        }
    });
});
