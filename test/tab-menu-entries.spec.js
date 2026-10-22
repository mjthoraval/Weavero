/* global describe, it, before, after, assert, Zotero */

// The three Weavero tab-menu entries -- View Online, Show File, Open in
// External Viewer -- one list (tabs.ts WV_TAB_MENU_ENTRIES) for the main
// window's tab menu (MenuManager adapter) and the reader window's (XUL).
// Survey 2026-10-06 §4 main / reader twins, 2026-10-21. Throw-away items in
// the runner's library, erased after.

describe("Weavero — tab-menu entries: one list for the main window's and the reader window's tab menus", () => {
    let wv, win, parent, att, doiParent, loner;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) wvT.absent("!wv");
        for (const m of ["_wvTabMenuEntries", "_wvTabItemParts", "_wvViewOnlineURL", "_wvTabMenuManagerEntries"]) assert.isFunction(wv[m], m);
        parent = new Zotero.Item("journalArticle");
        parent.setField("title", "WV tab-menu parent");
        parent.setField("url", "https://example.org/wv-parent");
        await parent.saveTx();
        att = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-att", parentItemID: parent.id, title: "wv tab-menu link" });
        doiParent = new Zotero.Item("journalArticle");
        doiParent.setField("title", "WV tab-menu doi");
        doiParent.setField("DOI", "10.1000/wv.tab");
        await doiParent.saveTx();
        loner = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-loner", title: "wv tab-menu loner" });
    });

    after(async function () {
        for (const it of [parent, doiParent, loner]) { try { if (it) await it.eraseTx(); } catch (e) {} }
    });

    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }

    it("the list and its helpers: three entries with their markers; the parts of a tab item; View Online takes the top item's URL, then its DOI, then the attachment's own", () => {
        assert.deepEqual(wv._wvTabMenuEntries().map(e => [e.key, e.marker]), [["viewOnline", "data-wv-tab-viewonline"], ["showFile", "data-wv-tab-showfile"], ["externalViewer", "data-wv-tab-external"]]);
        const parts = wv._wvTabItemParts(att);
        assert.strictEqual(parts.att.id, att.id); assert.strictEqual(parts.top.id, parent.id, "a child attachment: itself and its parent");
        assert.strictEqual(wv._wvTabItemParts(loner).top.id, loner.id, "a standalone attachment is its own top");
        assert.isNull(wv._wvTabItemParts(doiParent).att, "a regular item without a file attachment has none");
        assert.strictEqual(wv._wvViewOnlineURL(att), "https://example.org/wv-parent", "the parent's URL");
        assert.strictEqual(wv._wvViewOnlineURL(doiParent), "https://doi.org/10.1000/wv.tab", "the DOI when there is no URL");
        assert.strictEqual(wv._wvViewOnlineURL(loner), "https://example.org/wv-loner", "the attachment's own URL when standalone");
        assert.isNull(wv._wvViewOnlineURL(null));
    });

    it("the MenuManager adapter: visibility, label, marker and icon per item in onShowing; View Online's command loads the URL in the main window; nothing for no item", async () => {
        const doc = win.document;
        const entries = wv._wvTabMenuManagerEntries();
        assert.strictEqual(entries.length, 3);
        const show = (en, item) => { const ctx = { items: item ? [item] : [], menuElem: doc.createXULElement("menuitem"), vis: null, setVisible(v) { this.vis = v; } }; en.onShowing(null, ctx); return ctx; };
        const vo = show(entries[0], att);
        assert.isTrue(vo.vis, "View Online shows for an item with a URL");
        assert.strictEqual(vo.menuElem.getAttribute("label"), "View Online");
        assert.strictEqual(vo.menuElem.getAttribute("data-wv-tab-viewonline"), "1", "the repositioner's marker");
        assert.include(vo.menuElem.style.getPropertyValue("--custom-menu-icon-light"), "globe.svg");
        assert.isFalse(show(entries[1], att).vis, "Show File hides for a linked URL (no file)");
        assert.isFalse(show(entries[2], att).vis, "External Viewer hides without a file attachment");
        assert.isTrue(entries.every(en => !show(en, null).vis), "no item: all hidden");
        const loaded = [];
        const ZP = win.ZoteroPane, orig = ZP.loadURI;
        ZP.loadURI = (u) => loaded.push(u);
        try { await entries[0].onCommand(null, { items: [att] }); }
        finally { ZP.loadURI = orig; }
        assert.deepEqual(loaded, ["https://example.org/wv-parent"], "View Online loads the parent's URL");
        const ran = [];
        withStubs({ _getEnableOpenExternalViewer: () => true, _wvGetBestAttachmentSync: (it) => (it && it.id === att.id ? att : null), _wvAttachmentIconURL: () => "chrome://x/icon.svg" }, () => {
            const ev = show(entries[2], att);
            assert.isTrue(ev.vis, "External Viewer shows with the gate on and a best attachment");
            assert.include(ev.menuElem.style.getPropertyValue("--custom-menu-icon-light"), "icon.svg", "the attachment-type glyph");
        });
        assert.strictEqual(ran.length, 0);
    });

    it("both tab menus build from the list and keep no entry of their own", () => {
        const main = String(wv._registerTabContextMenu);
        assert.include(main, "_wvTabMenuManagerEntries(", "the main tab menu takes the adapter");
        for (const own of ['"View Online"', "viewOnlineURL", "cleanDOI", "resolveTabAttachment", '"Show File"']) assert.notInclude(main, own, "no entry of its own: " + own);
        const reader = String(wv._ensureReaderWindowTabContextMenu);
        assert.include(reader, "_wvTabMenuEntries(", "the reader tab menu takes the list");
        for (const own of ['"View Online"', "targetViewOnlineURL", "cleanDOI", "targetAttachment", '"Show File"']) assert.notInclude(reader, own, "no entry of its own: " + own);
    });
});
