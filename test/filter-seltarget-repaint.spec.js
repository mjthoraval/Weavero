/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-10-20: the same two chips gave different renderings depending on
// their order. Annotation Source first paints the attachment rows dim
// (targets = annotations only); adding Has Embedded Annotations makes them
// primary but changes no row, so the tree mutates nothing, `_markCellLinks`
// never runs again and the rows keep their old `wv-not-target`. The apply
// now repaints when the effective targets changed. FAILED on 0.22.2-dev.63.
describe("Weavero — the items-tree dimming follows a chip that changes the selection targets without changing the rows", function () {
    this.timeout(60000);
    let wv, win, zp, iv, parent, att, annExt;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const apply = async () => { await wv._applyItemsListFilter({ cascade: true }); await sleep(900); };
    const rowEl = (it) => {
        const i = iv.getRowIndexByID(it.id);
        if (i === false) return null;
        try { iv.ensureRowIsVisible(i); } catch (e) {}
        return win.document.getElementById("item-tree-main-default-row-" + i);
    };
    const classesOf = (it) => { const el = rowEl(it); return el ? [...el.classList].filter(c => /^wv-(primary|not-target)$/.test(c)).sort().join(" ") : null; };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._applyItemsListFilter !== "function" || typeof wv._applySelectionTargetVisuals !== "function") wvT.absent("filter apply / selection-target paint");
        win = Zotero.getMainWindow(); zp = win.ZoteroPane; iv = zp.itemsView;
        await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await sleep(400);
        const lib = Zotero.Libraries.userLibraryID;
        parent = new Zotero.Item("journalArticle"); parent.libraryID = lib; parent.setField("title", "WV-TEST repaint parent"); await parent.saveTx();
        att = new Zotero.Item("attachment"); att.libraryID = lib; att.parentID = parent.id;
        att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL; att.attachmentContentType = "application/pdf";
        att.setField("title", "WV-TEST repaint pdf"); await att.saveTx();
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = lib; a.parentID = att.id; a.annotationType = "highlight"; a.annotationText = "WV-TEST repaint external"; a.annotationColor = "#ffd400";
        a.annotationSortIndex = "00001|000001|00000"; a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[0, 0, 9, 9]] });
        a.annotationIsExternal = true;
        await a.saveTx(); annExt = a;
        await sleep(400);
    });

    after(async function () {
        try { wv._filterState = { groups: [wv._emptyFilterGroup()] }; await apply(); } catch (e) {}
        try { await parent.eraseTx(); } catch (e) {}
    });

    it("Annotation Source, then Has Embedded Annotations: the attachment row turns primary (white) without a row change", async function () {
        wv._filterState = { groups: [wv._emptyFilterGroup()] };
        const g = wv._filterState.groups[0];
        g.annotationSource = true; await apply();
        assert.strictEqual(classesOf(att), "wv-not-target", "Source alone: the attachment row is dimmed (targets = annotations)");
        assert.strictEqual(classesOf(annExt), "wv-primary", "the embedded annotation is primary");
        g.hasEmbeddedAnnotations = true; await apply();
        assert.deepEqual(wv._effectiveSelectionTargetKinds(), { parent: false, attachment: true, note: false, annotation: true }, "both kinds targeted now");
        assert.strictEqual(classesOf(att), "wv-primary", "the attachment row repainted primary, though no row was added or removed");
        assert.strictEqual(classesOf(annExt), "wv-primary");
    });

    it("the reverse order gives the same painting", async function () {
        wv._filterState = { groups: [wv._emptyFilterGroup()] };
        const g = wv._filterState.groups[0];
        await apply();
        g.hasEmbeddedAnnotations = true; await apply();
        assert.strictEqual(classesOf(att), "wv-primary", "Has Embedded alone: the attachment is primary");
        g.annotationSource = true; await apply();
        assert.strictEqual(classesOf(att), "wv-primary");
        assert.strictEqual(classesOf(annExt), "wv-primary");
    });
});
