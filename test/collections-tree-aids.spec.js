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
        if (!wv || typeof wv._wvCollAidsUpdate !== "function") wvT.absent('!wv || typeof wv._wvCollAidsUpdate !== "function"');
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
        const win = { document: d, ZoteroPane: { collectionsView: cv }, _wvCollAids: { sticky: true, tips: true }, setTimeout: (fn, ms) => Zotero.getMainWindow().setTimeout(fn, ms) };
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

    // MJT 2026-10-21: "When My Library is pinned by scrolling, I cannot get
    // the context menu on it by right-click" -- the pinned rows are
    // Weavero's own, so Zotero's row handler never saw them.
    // ...and MJT 2026-10-21: "a right-click on a pinned row selects it, which
    // is not wanted" -- the row is selected for the menu's sake only, with the
    // pane's collection handler held off, and the previous selection comes
    // back when the menu closes without a command.
    it("right-clicking a pinned parent opens Zotero's collection menu for it at the pointer without the items list switching, and the previous selection comes back when the menu closes with no command", async () => {
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        const opened = [], handler = [];
        const cv = f.win.ZoteroPane.collectionsView;
        // A fuller selection than the base fake's: the set, the cursor, Zotero's methods.
        let selected = new Set([5]);
        const zp = /** @type {any} */ (f.win.ZoteroPane);
        // Zotero's TreeSelection.select scrolls the row into view unless its
        // events are suppressed (virtualized-table.jsx): the fake records
        // the flag at select time, the no-scroll contract.
        const suppressedAt = [];
        const sel = /** @type {any} */ ({
            get selected() { return selected; }, focused: 5, selectEventsSuppressed: false,
            isSelected: (i) => selected.has(i),
            select: (i) => { suppressedAt.push(sel.selectEventsSuppressed); selected = new Set([i]); sel.focused = i; f.selected.push(i); if (!sel.selectEventsSuppressed) zp.onCollectionSelected(); },
            clearSelection: () => { selected = new Set(); },
            toggleSelect: (i) => { if (selected.has(i)) selected.delete(i); else selected.add(i); },
        });
        cv.selection = sel;
        zp.onCollectionSelected = () => { handler.push(sel.focused); };
        zp.onCollectionsContextMenuOpen = (e, x, y) => { opened.push([e.type, x, y]); };
        const popup = f.win.document.createElement("div"); popup.id = "zotero-collectionmenu"; f.win.document.body.appendChild(popup);
        wv._wvCollAidsUpdate(f.win);
        const rows = [...f.tree.querySelectorAll(".wv-coll-sticky .row")];
        const W = Zotero.getMainWindow();
        const ME = W.MouseEvent;
        const tick = () => new Promise(r => W.setTimeout(r, 30));
        const ev = new ME("contextmenu", { bubbles: true, cancelable: true, screenX: 123, screenY: 456 });
        rows[0].dispatchEvent(ev);
        assert.isTrue(ev.defaultPrevented, "the browser's own menu is not wanted");
        assert.deepEqual([...selected], [0], "Lib (row 0) selected for the menu");
        assert.deepEqual(handler, [], "the pane's collection handler held off: the items list stays");
        assert.deepEqual(opened, [["contextmenu", 123, 456]], "Zotero's opener, at the pointer");
        assert.deepEqual(f.scrolled, [], "no scroll for a right-click");
        assert.deepEqual(suppressedAt, [true], "selected with its events suppressed: Zotero's select would scroll the pane to the row otherwise");
        assert.isFalse(sel.selectEventsSuppressed, "released after");
        // The menu closes with no command: the previous selection is back, quietly.
        popup.dispatchEvent(new W.Event("popuphidden", { bubbles: true }));
        await tick();
        assert.deepEqual([...selected], [5], "the previous selection back"); assert.strictEqual(sel.focused, 5);
        assert.deepEqual(handler, [], "still quiet");
        // A command from the menu: the selection is Zotero's to move (not restored).
        rows[0].dispatchEvent(new ME("contextmenu", { bubbles: true, cancelable: true, screenX: 1, screenY: 2 }));
        assert.deepEqual([...selected], [0]);
        popup.dispatchEvent(new W.Event("command", { bubbles: true }));
        popup.dispatchEvent(new W.Event("popuphidden", { bubbles: true }));
        await tick();
        assert.deepEqual([...selected], [0], "a command: no restore");
        assert.lengthOf(opened, 2);
        // Already selected: nothing to hold off, the menu still opens.
        rows[0].dispatchEvent(new ME("contextmenu", { bubbles: true, cancelable: true, screenX: 3, screenY: 4 }));
        assert.lengthOf(opened, 3); assert.deepEqual([...selected], [0]);
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

    // MJT 2026-10-21: "Can you do the same pinning in the Hidden Manager?" --
    // the pinned parents render for any tree handed over as a TARGET (the
    // manager's two trees, pane.ts _wvHidBuildManager): the overlay carries
    // the target's id, a pinned row's right-click goes to the target's own
    // handler with the row's index, decorateRow marks the pinned copy (the
    // manager's grey context rows), and the unwire clears the state.
    it("renders for a target other than the pane: its overlay id, its right-click handler, its row decoration; unwired, it is gone", () => {
        Zotero.Prefs.set(PREF, 5);
        const f = fake(30);
        const cv = f.win.ZoteroPane.collectionsView;
        const ctx = [];
        const tgt = {
            win: f.win, doc: f.win.document, tree: f.tree, cv, st: { sticky: true }, overlayId: "wv-mgr-sticky-left",
            view: () => cv, refresh: () => {},
            onContext: (e, now) => ctx.push(now),
            decorateRow: (rowEl, idx) => { if (idx === 0) rowEl.classList.add("wv-hid-fixed"); },
        };
        wv._wvCollAidsRender(tgt);
        const ov = f.tree.querySelector("#wv-mgr-sticky-left");
        assert.isOk(ov, "the overlay under the target's id");
        assert.deepEqual(pinnedNames(f.tree), ["Lib", "Coll A", "Sub A1"]);
        const rows = [...ov.querySelectorAll(".row")];
        assert.isTrue(rows[0].classList.contains("wv-hid-fixed"), "decorated by the target");
        assert.isFalse(rows[1].classList.contains("wv-hid-fixed"));
        const ev = new (Zotero.getMainWindow().MouseEvent)("contextmenu", { bubbles: true, cancelable: true, screenX: 1, screenY: 2 });
        rows[1].dispatchEvent(ev);
        assert.isTrue(ev.defaultPrevented);
        assert.deepEqual(ctx, [1], "the target's handler, with the row's index");
        assert.deepEqual(f.scrolled, [], "no scroll for a right-click");
        wv._wvCollAidsUnwireTarget(tgt);
        assert.isNull(f.tree.querySelector("#wv-mgr-sticky-left"), "unwired: the overlay gone");
        assert.deepEqual(Object.keys(tgt.st), [], "the state emptied");
    });

    it("the full path reads outermost first; a top-level row has none", () => {
        const f = fake(0);
        const cv = f.win.ZoteroPane.collectionsView;
        assert.equal(wv._wvCollRowPath(cv, 5), "Lib › Coll A › Sub A1 › Leaf 5");
        assert.isNull(wv._wvCollRowPath(cv, 0));
    });
});
