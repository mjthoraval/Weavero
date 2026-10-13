/* global describe, it, before, after, assert, Zotero */

// Issue #57 ("Can't add bookmarks", Zotero 11 beta): every Weavero entry in
// the reader's context menus came out GREYED. Zotero 11's reader builds each
// appended item with `menuitem.toggleAttribute('disabled', item.disabled)`
// (xpcom/reader.js `_openContextMenu`); an item without the key passes
// `undefined` -- no `force` -- and the call TOGGLES the attribute on. The
// handlers now give every item an explicit boolean (wvReaderMenuEvent). The
// items are rendered here the way Zotero 11 renders them.

describe("Weavero — reader context-menu entries are enabled on Zotero 11 (issue #57)", function () {
    this.timeout(60000);
    let wv, lib, att, reader;

    // Zotero 11's rendering of one appended item (reader.js _openContextMenu).
    const disabledAsZotero11 = (item) => {
        const mi = Zotero.getMainWindow().document.createXULElement("menuitem");
        mi.toggleAttribute("disabled", item.disabled);
        return mi.hasAttribute("disabled");
    };
    const collect = (handler, ev) => {
        const items = [];
        handler(Object.assign({ append: (...xs) => { for (const x of xs) items.push(x); } }, ev));
        return items;
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        if (!lib || typeof lib.wvReaderMenuEvent !== "function") wvT.absent("Zotero.Weavero.lib.wvReaderMenuEvent");
        att = await wvT.createTestPDFItem("wv-menu-disabled");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader opened");
    });

    after(async () => {
        wvT.closeReaderTab(reader);
        await new Promise(r => setTimeout(r, 500));
        try { wvT.purgeDeadReaders(); } catch (e) {}
        await wvT.erase(att);
    });

    it("an item without `disabled` gets an explicit false; one that asks to be disabled stays disabled; submenus too", () => {
        const got = [];
        const ev = lib.wvReaderMenuEvent({ append: (...xs) => got.push(...xs), reader: null });
        ev.append({ label: "a", onCommand() {} }, { label: "b", disabled: true, onCommand() {} },
            { label: "sub", groups: [[{ label: "c", onCommand() {} }]] });
        assert.deepEqual(got.map(x => x.label), ["a", "b", "sub"]);
        assert.isFalse(disabledAsZotero11(got[0]), "a: enabled");
        assert.isTrue(disabledAsZotero11(got[1]), "b: disabled as asked");
        assert.isFalse(disabledAsZotero11(got[2].groups[0][0]), "c (in the submenu): enabled");
    });

    it("the view context menu's entries render enabled", () => {
        const items = collect(wv._viewContextHandler, { reader, params: {} });
        assert.isAbove(items.length, 0, "Weavero appended entries");
        assert.deepEqual(items.filter(disabledAsZotero11).map(x => x.label), [], "none greyed");
    });

    it("the thumbnail context menu's entries render enabled", function () {
        if (typeof wv._thumbnailMenuHandler !== "function") this.skip();   // feature off in this profile
        const items = collect(wv._thumbnailMenuHandler, { reader, params: { pageIndexes: [0] } });
        assert.isAbove(items.length, 0, "Weavero appended entries");
        assert.deepEqual(items.filter(disabledAsZotero11).map(x => x.label), [], "none greyed");
    });

    it("the annotation context menu goes through the same wrapper (source contract)", () => {
        assert.match(String(wv._contextHandler), /wvReaderMenuEvent/);
    });
});
