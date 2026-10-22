/* global describe, it, before, after, assert, Zotero */

// The "Copy As" entry list (url.ts WV_COPY_AS): one list for the reader
// window's tab menu (XUL builder _wvBuildCopyAsSubmenu) and the main
// window's tab menu (MenuManager children _wvCopyAsMenuManagerEntries).
// Survey 2026-10-06 §4 main / reader twins, 2026-10-21. Throw-away items in
// the runner's library (a parent with a citation key, a child note, a linked
// URL attachment), erased after.

describe("Weavero — Copy As: one entry list for the main window's and the reader window's tab menus", () => {
    let wv, win, parent, note, att, standalone;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) wvT.absent("!wv");
        for (const m of ["_wvCopyAsEntries", "_wvCiteItemsOf", "_wvBuildCopyAsSubmenu", "_wvCopyAsMenuManagerEntries"]) assert.isFunction(wv[m], m);
        parent = new Zotero.Item("journalArticle");
        parent.setField("title", "WV copy-as parent");
        parent.setField("citationKey", "wvCopyAsKey");
        await parent.saveTx();
        note = new Zotero.Item("note");
        note.parentID = parent.id;
        note.setNote("<p>wv copy-as child note</p>");
        await note.saveTx();
        att = await Zotero.Attachments.linkFromURL({ url: "https://example.org/wv-copy-as", parentItemID: parent.id, title: "wv copy-as link" });
        standalone = new Zotero.Item("note");
        standalone.setNote("<p>wv copy-as standalone</p>");
        await standalone.saveTx();
    });

    after(async function () {
        for (const it of [standalone, parent]) { try { if (it) await it.eraseTx(); } catch (e) {} }
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
    /** The labels the list should produce for `items`, from the live predicates. */
    function expectedLabels(items) {
        const cites = wv._wvCiteItemsOf(items);
        const out = [];
        for (const en of wv._wvCopyAsEntries()) {
            const set = en.cite ? cites : items;
            if (!en.visible(wv, set)) continue;
            out.push(en.sep ? "-" : en.label(wv, set));
        }
        return out;
    }

    it("the list: ten entries in the canonical order; the cite-able items are the parents of child attachments and notes, duplicates collapsed, standalone items themselves", () => {
        assert.deepEqual(wv._wvCopyAsEntries().map(e => e.key), ["citation", "bibliography", "citationKey", "sep1", "selectLink", "openLink", "onlineLink", "sepBbt", "bibtex", "biblatex"]);
        assert.deepEqual(wv._wvCiteItemsOf([att, note]).map(i => i.id), [parent.id], "a child attachment and a child note cite their parent, once");
        assert.deepEqual(wv._wvCiteItemsOf([parent, att]).map(i => i.id), [parent.id]);
        assert.deepEqual(wv._wvCiteItemsOf([standalone]).map(i => i.id), [standalone.id], "a standalone note is its own cite target");
        assert.deepEqual(wv._wvCiteItemsOf([]), []);
    });

    it("the XUL builder: the visible entries in order with the live predicates (Citation Key shows for a keyed parent), commands run on the targets re-read at command time", () => {
        const doc = win.document;
        const sub = /** @type {any} */ (doc.createXULElement("menupopup"));
        let targets = [att];
        wv._wvBuildCopyAsSubmenu(doc, sub, () => targets);
        const got = [...sub.children].map(c => c.localName === "menuseparator" ? "-" : c.getAttribute("label"));
        assert.deepEqual(got, expectedLabels([att]), "the entries the predicates allow, in order");
        assert.include(got, "Citation"); assert.include(got, "Citation Key"); assert.include(got, "Select Link");
        assert.strictEqual(got.indexOf("-"), 3, "the separator after the cite entries");
        const byKey = (k) => [...sub.children].find(c => c.getAttribute("data-wv-key") === k);
        const calls = [];
        withStubs({ _copyCitationOrBibliography: (items, asCit) => calls.push(["cite", items.map(i => i.id), asCit]), _copyCombinedSelectLink: (items) => calls.push(["select", items.map(i => i.id)]) }, () => {
            byKey("citation").dispatchEvent(new win.Event("command", { bubbles: true }));
            assert.deepEqual(calls[0], ["cite", [parent.id], true], "Citation cites the attachment's parent");
            targets = [note];
            byKey("selectLink").dispatchEvent(new win.Event("command", { bubbles: true }));
            assert.deepEqual(calls[1], ["select", [note.id]], "the targets are re-read at command time; Select Link takes the items themselves");
        });
        const sub2 = /** @type {any} */ (doc.createXULElement("menupopup"));
        wv._wvBuildCopyAsSubmenu(doc, sub2, () => []);
        assert.strictEqual(sub2.children.length, 0, "nothing for no items");
    });

    it("the MenuManager adapter: one child per entry, label and visibility from the same predicates in onShowing, commands on the resolved set", () => {
        const doc = win.document;
        let items = [att];
        const entries = wv._wvCopyAsMenuManagerEntries(() => items);
        assert.strictEqual(entries.length, wv._wvCopyAsEntries().length);
        const show = (en) => { const ctx = { items, menuElem: doc.createXULElement("menuitem"), vis: null, setVisible(v) { this.vis = v; } }; en.onShowing(null, ctx); return ctx; };
        const labels = entries.map((en, i) => { const ctx = show(en); return ctx.vis ? (en.menuType === "separator" ? "-" : ctx.menuElem.getAttribute("label")) : null; }).filter(x => x !== null);
        assert.deepEqual(labels, expectedLabels([att]), "the same entries as the XUL builder");
        assert.strictEqual(entries[3].menuType, "separator"); assert.strictEqual(entries[7].menuType, "separator");
        const calls = [];
        withStubs({ _copyCitationOrBibliography: (its, asCit) => calls.push(["cite", its.map(i => i.id), asCit]), _copyCitationKeys: (its) => calls.push(["key", its.map(i => i.id)]) }, () => {
            entries[1].onCommand(null, { items });
            assert.deepEqual(calls[0], ["cite", [parent.id], false], "Bibliography on the parent");
            entries[2].onCommand(null, { items });
            assert.deepEqual(calls[1], ["key", [parent.id]], "Citation Key on the parent");
        });
        items = [];
        assert.isTrue(entries.every(en => !show(en).vis), "no items: every child hidden");
    });

    it("the two tab menus build from the list and keep no entry of their own; the reader's Copy As is gated by the URI-utilities option", () => {
        const main = String(wv._registerTabContextMenu);
        assert.include(main, "_wvCopyAsMenuManagerEntries(", "the main tab menu takes the adapter");
        for (const own of ['"Citation Key"', "bbtEntry", "citeEntry", "bibItemsOf"]) assert.notInclude(main, own, "no entry of its own: " + own);
        const xul = String(wv._wvBuildCopyAsSubmenu);
        assert.include(xul, "WV_COPY_AS");
        assert.notInclude(xul, '"Citation Key"');
        const reader = String(wv._ensureReaderWindowTabContextMenu);
        assert.include(reader, "_wvBuildCopyAsSubmenu");
        assert.include(reader, "_getEnableCopyItemLink", "the reader's Copy As is gated");
    });
});
