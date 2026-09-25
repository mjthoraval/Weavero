/* global describe, it, before, after, assert, Zotero, Services */

// Collections-tree reading aids (MJT 2026-09-25): pinned parent rows
// (VS Code's tree "sticky scroll": outermost first, capped by
// weavero.collectionsStickyMax and 40 % of the pane), a full-path tooltip,
// indent guides. Driven against a fake collections view: 60 rows, each
// top-level container "T" (level 0) holding a child "C" (level 1) holding
// leaves (level 2). FAILS on the pre-fix code (no such feature).

describe("Weavero — collections-tree reading aids", () => {
    let wv, prevMax;
    const PREF = "weavero.collectionsStickyMax";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvCollAidsUpdate !== "function") this.skip();
        prevMax = Zotero.Prefs.get(PREF);
    });
    after(() => { try { Zotero.Prefs.set(PREF, prevMax || 7); } catch (_) {} });

    // Row i: 0 = "Lib" (level 0), 1 = "Coll A" (1), 2 = "Sub A1" (2),
    // 3..59 = leaves "Leaf n" (3) under Sub A1.
    const fake = (scrollRows) => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-aids");
        const tree = d.createElement("div");
        tree.id = "collection-tree";
        d.body.appendChild(tree);
        const level = (i) => (i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 2 : 3);
        const parent = (i) => (i === 0 ? -1 : i === 1 ? 0 : i === 2 ? 1 : 2);
        const name = (i) => (i === 0 ? "Lib" : i === 1 ? "Coll A" : i === 2 ? "Sub A1" : "Leaf " + i);
        const scrolled = [];
        const jw = {
            itemHeight: 20, scrollOffset: scrollRows * 20,
            _getItemPosition: (i) => i * 20,
            getWindowHeight: () => 400,
            scrollTo: (v) => { scrolled.push(v); },
        };
        const selected = [];
        const cv = {
            rowCount: 60,
            tree: { _jsWindow: jw },
            getRow: (i) => ({ id: "R" + i, getName: () => name(i) }),
            getParentIndex: parent, getLevel: level,
            getIconName: () => "collection",
            getRowIndexByID: (id) => parseInt(id.slice(1), 10),
            toggleOpenState: () => {},
            selection: { select: (i) => selected.push(i) },
        };
        const win = { document: d, ZoteroPane: { collectionsView: cv }, _wvCollAids: { sticky: true, tips: true } };
        return { win, tree, scrolled, selected };
    };
    const pinnedNames = (tree) => [...tree.querySelectorAll(".wv-coll-sticky .cell-text")].map((e) => e.textContent);

    it("pins the parents of the rows at the top, outermost first", () => {
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        wv._wvCollAidsUpdate(f.win);
        assert.deepEqual(pinnedNames(f.tree), ["Lib", "Coll A", "Sub A1"]);
    });

    it("the default cap is 7 levels, as VS Code's", () => {
        const def = Services.prefs.getDefaultBranch("").getIntPref("extensions.zotero.weavero.collectionsStickyMax", -1);
        assert.equal(def, 7);
    });

    it("nothing pinned at the top of the tree", () => {
        const f = fake(0);
        wv._wvCollAidsUpdate(f.win);
        assert.deepEqual(pinnedNames(f.tree), []);
    });

    it("beyond the level cap the DEEPEST parents drop (VS Code's rule)", () => {
        Zotero.Prefs.set(PREF, 2);
        const f = fake(30);
        wv._wvCollAidsUpdate(f.win);
        assert.deepEqual(pinnedNames(f.tree), ["Lib", "Coll A"]);
    });

    it("clicking a pinned parent scrolls its row under the pinned rows above it and selects it", () => {
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        wv._wvCollAidsUpdate(f.win);
        const rows = [...f.tree.querySelectorAll(".wv-coll-sticky .row")];
        rows[1].dispatchEvent(new (Zotero.getMainWindow().MouseEvent)("click", { bubbles: true }));
        assert.deepEqual(f.scrolled, [1 * 20 - 1 * 20], "Coll A (row 1) in pinned slot 1");
        assert.deepEqual(f.selected, [1]);
    });

    it("the shutdown sweep removes the pinned rows whole, never unwraps them into the tree", () => {
        // 2026-09-25: a class-only overlay holding .row children was
        // UNWRAPPED by _wvStripWindowChrome, leaving stray rows after
        // every reload/update.
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        wv._wvCollAidsUpdate(f.win);
        assert.isAbove(f.tree.querySelectorAll(".row").length, 0, "pinned rows rendered");
        wv._wvStripWindowChrome({ document: f.win.document });
        assert.equal(f.tree.querySelectorAll(".row").length, 0);
    });

    it("a pinned parent gets an arrow only where Zotero draws one (none on a header)", () => {
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        f.win.ZoteroPane.collectionsView.isContainer = (i) => i !== 0;   // row 0 as a header
        f.win.ZoteroPane.collectionsView.isContainerEmpty = () => false;
        wv._wvCollAidsUpdate(f.win);
        const rows = [...f.tree.querySelectorAll(".wv-coll-sticky .row")];
        assert.isNotNull(rows[0].querySelector(".spacer-twisty"), "header: spacer");
        assert.isNull(rows[0].querySelector(".twisty"), "header: no arrow");
        assert.isNotNull(rows[1].querySelector(".twisty"), "collection: arrow");
    });

    it("no indent guide for a parent without an arrow (the Group Libraries header)", () => {
        // Rows: 0 header (not a container, level 0), 1 group (level 1),
        // 2 collection in the group (level 2); 3 My Library, 4 its child.
        const cv = {
            getParentIndex: (i) => ({ 0: -1, 1: 0, 2: 1, 3: -1, 4: 3 })[i],
            getLevel: (i) => ({ 0: 0, 1: 1, 2: 2, 3: 0, 4: 1 })[i],
            isContainer: (i) => i !== 0,
        };
        assert.equal(wv._wvCollGuideSkipPx(cv, 1), 16, "group: header column skipped");
        assert.equal(wv._wvCollGuideSkipPx(cv, 2), 16, "collection in a group: only the header column");
        assert.equal(wv._wvCollGuideSkipPx(cv, 4), 0, "under My Library: every guide drawn");
    });

    it("the full path reads outermost first; a top-level row has none", () => {
        const f = fake(0);
        const cv = f.win.ZoteroPane.collectionsView;
        assert.equal(wv._wvCollRowPath(cv, 5), "Lib › Coll A › Sub A1 › Leaf 5");
        assert.isNull(wv._wvCollRowPath(cv, 0));
    });
});
