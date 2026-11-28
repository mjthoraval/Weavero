/* global describe, it, before, after, beforeEach, assert, Zotero, Services, wvT */

// The "Group Libraries" line of the collections pane folds (src/modules/
// group-fold.ts; MJT 2026-11-22, "Also add an icon in front of the Group
// Libraries lines to make it collapsible"). Zotero's own twisty, a click on it
// or anywhere on the line, the group rows out of the tree while folded, a
// selection inside them going to My Library, the state remembered in a local
// pref and taken by every tree built later, the collections search, a drag
// hovering the line, groups and collections arriving by sync while folded, a
// group selected by other means, the keyboard on the rows, the Extras switch,
// the teardown. Local groups only (Zotero's own test recipe, support.js
// createGroup), in the runner's throwaway profile: the runner never syncs.

describe("Weavero — the Group Libraries line folds", function () {
    this.timeout(120000);
    let wv, win, cv, G1, G2, C1, M1, gItem;
    const LIB = () => Zotero.Libraries.userLibraryID;
    const PREF = "weavero.groupLibrariesCollapsed";
    const B = Services.prefs.getBranch("extensions.zotero.");
    let prefHadUser = false, prefWas = false;
    const made = [];
    const idx = (t, id) => t.getRowIndexByID(id);
    const hIdx = (t) => idx(t, "HG");
    const rowEl = (t, i) => (i === false || i == null) ? null : t.domEl.ownerDocument.getElementById(t.id + "-row-" + i);
    const headEl = (t) => { const i = hIdx(t); if (i === false) return null; try { t.ensureRowIsVisible(i); } catch (e) {} return rowEl(t, i); };
    const shown = (t, g) => idx(t, "L" + g.libraryID) !== false;
    const folded = (t) => hIdx(t) !== false && !shown(t, G1) && !shown(t, G2);
    const unfolded = (t) => hIdx(t) !== false && shown(t, G1) && shown(t, G2);
    const focusedID = (t) => { const r = t.getRow(t.selection.focused); return r ? r.id : null; };
    const listRowID = (w) => {
        const iv = w.ZoteroPane.itemsView;
        const rows = (iv && (iv.collectionTreeRows || (iv.collectionTreeRow ? [iv.collectionTreeRow] : []))) || [];
        return rows[0] ? rows[0].id : null;
    };
    const mouse = (el, type, button = 0) => {
        const w = el.ownerDocument.defaultView;
        el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button, view: w }));
    };
    const click = (el, button = 0) => { mouse(el, "mousedown", button); mouse(el, "mouseup", button); mouse(el, "click", button); };
    const twisty = (t) => { const el = headEl(t); return el && el.querySelector(".twisty"); };
    const st = (t) => wv._wvGfStateOf(t);
    const treeErrors = () => {
        let errs = [];
        try { errs = (Zotero.getErrors(true) || []).map(String); } catch (e) {}
        return errs.filter(s => /collectionTree|getLevel|isOpen|_addSortedRow/.test(s));
    };

    const mkGroup = async (name) => {
        const g = /** @type {any} */ (new Zotero.Group());
        // A made-up id below 1,000,000: never one of the maintainer's real groups.
        g.id = Zotero.Utilities.rand(100000, 1000000); g.name = name; g.description = "";
        g.editable = true; g.filesEditable = true; g.version = Zotero.Utilities.rand(1000, 10000); g.archived = false;
        await g.saveTx();
        made.push(g);
        return g;
    };
    const mkCollection = async (name, libraryID, parentID) => {
        const c = /** @type {any} */ (new Zotero.Collection());
        c.name = name; c.libraryID = libraryID;
        if (parentID) c.parentID = parentID;
        await c.saveTx();
        made.unshift(c);
        return c;
    };
    /** Back to the known state: unfolded, pref false, My Library selected. */
    const reset = async (t = cv) => {
        if (folded(t)) await wv._wvGfToggle(t, true);
        await wvT.waitFor(() => unfolded(t), 8000);
        try { if (B.prefHasUserValue(PREF)) B.clearUserPref(PREF); } catch (e) {}
        const s = st(t); if (s) s.collapsed = false;
        if (focusedID(t) !== "L" + LIB()) await Promise.race([t.selectLibrary(LIB()), wvT.sleep(4000)]);
    };
    const fold = async (t = cv) => {
        if (!folded(t)) await wv._wvGfToggle(t, true);
        assert.isTrue(await wvT.waitFor(() => folded(t), 8000) || false, "folded");
    };

    before(async function () {
        this.timeout(60000);
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvGfToggle", "_wvGfStateOf", "_wvGfIsFoldHeader", "_wvGfTeardown", "_wvGfWire"]) wvT.method(m);
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        prefHadUser = B.prefHasUserValue(PREF);
        prefWas = !!Zotero.Prefs.get(PREF);
        if (prefHadUser) B.clearUserPref(PREF);
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        G1 = await mkGroup("wv-gf-group-a");
        G2 = await mkGroup("wv-gf-group-b");
        C1 = await mkCollection("wv-gf-coll-in-a", G1.libraryID);
        await mkCollection("wv-gf-sub-in-a", G1.libraryID, C1.id);
        M1 = await mkCollection("wv-gf-coll-mine", LIB());
        gItem = new Zotero.Item("book");
        gItem.libraryID = G1.libraryID;
        gItem.setField("title", "WV-TEST group fold item");
        await gItem.saveTx();
        made.unshift(gItem);
        assert.isTrue(await wvT.waitFor(() => unfolded(cv), 10000) || false, "the line and both groups in the pane");
        assert.isOk(st(cv), "the pane's tree is wired");
    });

    beforeEach(async function () {
        this.timeout(30000);
        if (cv && G1) await reset();
    });

    after(async function () {
        this.timeout(60000);
        try { await reset(); } catch (e) {}
        for (const o of made) { try { await o.eraseTx(); } catch (e) {} }
        await wvT.sleep(500);
        try {
            if (prefHadUser) Zotero.Prefs.set(PREF, prefWas);
            else if (B.prefHasUserValue(PREF)) B.clearUserPref(PREF);
        } catch (e) {}
        try { await Promise.race([cv.selectLibrary(LIB()), wvT.sleep(4000)]); } catch (e) {}
    });

    it("the line draws Zotero's own twisty, open, placed and sized as My Library's, in both directions; no label", async function () {
        const doc = win.document;
        const myEl = () => { const i = idx(cv, "L" + LIB()); try { cv.ensureRowIsVisible(i); } catch (e) {} return rowEl(cv, i); };
        const treeEl = doc.getElementById(cv.id);
        const measure = () => {
            const tRect = treeEl.getBoundingClientRect();
            const my = myEl().querySelector(".twisty");
            const myR = my.getBoundingClientRect();
            const myT = win.getComputedStyle(my).transform;
            const hd = twisty(cv);
            assert.isOk(hd, "a twisty on the line");
            const hR = hd.getBoundingClientRect();
            return { my, hd, myR, hR, myT, hT: win.getComputedStyle(hd).transform, tRect };
        };
        let m = measure();
        assert.isAbove(m.tRect.width, 0, "the collections pane is shown");
        assert.sameMembers([...m.hd.classList], [...m.my.classList], "the same element as My Library's twisty (classes): " + m.hd.className);
        assert.isTrue(m.hd.classList.contains("open"), "open while the groups show");
        assert.closeTo(m.hR.width, m.myR.width, 0.5, "width");
        assert.closeTo(m.hR.height, m.myR.height, 0.5, "height");
        assert.closeTo(m.hR.left - m.tRect.left, m.myR.left - m.tRect.left, 0.5, "the same column as My Library's (both top level)");
        assert.strictEqual(m.hT, m.myT, "the same open transform");
        for (const el of [m.hd, m.my]) {
            assert.isFalse(el.hasAttribute("title") || el.hasAttribute("aria-label") || el.hasAttribute("tooltiptext"), "Zotero's twisties carry no label, nor does this one");
        }
        assert.strictEqual(headEl(cv).getAttribute("aria-expanded"), "true", "aria-expanded on the line");
        // RTL: the same rules mirror both.
        const prevDir = treeEl.style.direction;
        try {
            treeEl.style.direction = "rtl";
            cv.tree.invalidate();
            await wvT.sleep(100);
            m = measure();
            assert.closeTo(m.tRect.right - m.hR.right, m.tRect.right - m.myR.right, 0.5, "RTL: the same column, from the right");
            assert.strictEqual(m.hT, m.myT, "RTL: the same transform");
        }
        finally {
            treeEl.style.direction = prevDir;
            cv.tree.invalidate();
        }
        // Folded: closed like a closed library row.
        await fold();
        const hd = twisty(cv);
        assert.isOk(hd, "a twisty on the folded line");
        assert.isFalse(hd.classList.contains("open"), "closed");
        assert.strictEqual(headEl(cv).getAttribute("aria-expanded"), "false");
    });

    it("a click on the twisty folds and unfolds the line, once per click, and the state is written", async function () {
        click(twisty(cv));
        assert.isTrue(await wvT.waitFor(() => folded(cv), 5000) || false, "folded by the twisty");
        assert.notStrictEqual(hIdx(cv), false, "the line stays");
        assert.strictEqual(Zotero.Prefs.get(PREF), true, "remembered");
        await wvT.sleep(300);
        assert.isTrue(folded(cv), "the click that follows the twisty's mouseup toggled nothing more");
        click(twisty(cv));
        assert.isTrue(await wvT.waitFor(() => unfolded(cv), 5000) || false, "unfolded by the twisty");
        assert.strictEqual(Zotero.Prefs.get(PREF), false);
        await wvT.sleep(300);
        assert.isTrue(unfolded(cv), "still unfolded");
    });

    it("a click anywhere on the line folds and unfolds; a right-click or a press released elsewhere does not", async function () {
        const text = () => headEl(cv).querySelector(".cell-text") || headEl(cv);
        click(text());
        assert.isTrue(await wvT.waitFor(() => folded(cv), 5000) || false, "folded by a click on the label");
        click(headEl(cv));
        assert.isTrue(await wvT.waitFor(() => unfolded(cv), 5000) || false, "unfolded by a click on the line's empty part");
        // A right-click: Weavero's menu on the line, no fold (Escape closes it).
        mouse(text(), "mousedown", 2); mouse(text(), "mouseup", 2);
        await wvT.sleep(300);
        assert.isTrue(unfolded(cv), "no fold on a right-click");
        // Pressed on the line, released on My Library's row: nothing.
        mouse(text(), "mousedown");
        mouse(rowEl(cv, idx(cv, "L" + LIB())), "mouseup");
        await wvT.sleep(300);
        assert.isTrue(unfolded(cv), "a press released elsewhere is no click");
        assert.notStrictEqual(focusedID(cv), "HG", "the line is never selected");
    });

    it("folding with a group or a group's collection selected moves the selection to My Library; a selection elsewhere stays, silently", async function () {
        await cv.selectByID("C" + C1.id);
        assert.strictEqual(focusedID(cv), "C" + C1.id);
        await fold();
        assert.strictEqual(focusedID(cv), "L" + LIB(), "My Library selected");
        assert.deepEqual([...cv.selection.selected], [idx(cv, "L" + LIB())], "and only it");
        assert.isTrue(await wvT.waitFor(() => listRowID(win) === "L" + LIB(), 8000) || false, "the items list follows: " + listRowID(win));
        // A multi-selection: My Library and a group -> My Library stays.
        await reset();
        const iG = idx(cv, "L" + G1.libraryID);
        cv.selection.toggleSelect(iG);
        await wvT.sleep(200);
        await fold();
        assert.strictEqual(focusedID(cv), "L" + LIB(), "the remaining row of the selection keeps it");
        // A collection of My Library selected: it stays, the list does not move.
        await reset();
        await cv.selectByID("C" + M1.id);
        await wvT.waitFor(() => listRowID(win) === "C" + M1.id, 8000);
        await wvT.sleep(1500);   // the selection's own late events (the list's load) settle first
        let selects = 0;
        const onSel = () => { selects++; };
        cv.onSelect.addListener(onSel);
        try {
            await fold();
            await wvT.sleep(300);
        }
        finally { cv.onSelect.removeListener(onSel); }
        assert.strictEqual(focusedID(cv), "C" + M1.id, "still selected");
        assert.strictEqual(selects, 0, "no select event: nothing changed for the list");
    });

    it("with My Library hidden: no row to take the selection, no fold (no twisty); with Feeds below, the Feeds row takes it", async function () {
        this.timeout(60000);
        await cv.selectByID("L" + G1.libraryID);
        let F = null;
        try {
            await wv._wvHidHide([{ libraryID: LIB() }], win);
            assert.isTrue(await wvT.waitFor(() => idx(cv, "L" + LIB()) === false, 5000) || false, "My Library hidden");
            await wvT.waitFor(() => unfolded(cv), 5000);
            assert.isFalse(wv._wvGfIsFoldHeader(cv, hIdx(cv)), "nothing outside the groups to select: the line does not fold");
            await wvT.sleep(100);
            assert.isNotOk(twisty(cv), "no twisty then");
            await wv._wvGfToggle(cv, true);
            assert.isTrue(unfolded(cv), "a toggle does nothing");
            F = /** @type {any} */ (new Zotero.Feed());
            F.name = "wv-gf-feed"; F.description = ""; F.url = "http://wv-gf-test.invalid/feed.rss";
            F.refreshInterval = 12; F.cleanupReadAfter = 2; F.cleanupUnreadAfter = 30;
            await F.saveTx();
            assert.isTrue(await wvT.waitFor(() => idx(cv, "F1") !== false && unfolded(cv), 8000) || false, "the Feeds row below the groups");
            await cv.selectByID("L" + G1.libraryID);
            assert.isTrue(wv._wvGfIsFoldHeader(cv, hIdx(cv)), "now the line folds");
            await fold();
            assert.strictEqual(focusedID(cv), "F1", "the first selectable row below the groups: Feeds");
        }
        finally {
            try { await wv._wvHidShow(win, null, null, null, [LIB()]); } catch (e) {}
            await wvT.waitFor(() => idx(cv, "L" + LIB()) !== false, 5000);
            if (F) { try { await F.eraseTx(); } catch (e) {} }
            await wvT.waitFor(() => idx(cv, "F1") === false, 5000);
            try { await cv.selectLibrary(LIB()); } catch (e) {}
        }
    });

    it("the state is per tree, remembered in a local pref, and a tree built later takes it from its first refresh (a new window)", async function () {
        this.timeout(90000);
        await fold();
        assert.strictEqual(Zotero.Prefs.get(PREF), true);
        assert.isTrue(B.prefHasUserValue(PREF), "a local pref (extensions.zotero.weavero.groupLibrariesCollapsed)");
        const w2 = await wvT.openMainWindow();
        assert.isOk(w2, "a second main window");
        try {
            const cv2 = w2.ZoteroPane.collectionsView;
            assert.isTrue(await wvT.waitFor(() => hIdx(cv2) !== false && folded(cv2), 15000) || false, "the new window's tree is folded");
            assert.strictEqual(st(cv2).born, "refresh", "folded at its first refresh, through the window's class layer (never drawn open)");
            // Per tree: unfolding there leaves this window folded.
            await wv._wvGfToggle(cv2, true);
            assert.isTrue(await wvT.waitFor(() => unfolded(cv2), 8000) || false, "unfolded in the second window");
            await wvT.sleep(300);
            assert.isTrue(folded(cv), "the first window stays folded");
            assert.strictEqual(Zotero.Prefs.get(PREF), false, "the last toggle is what the next tree takes");
        }
        finally {
            try { w2.close(); } catch (e) {}
            await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 10000);
            await wvT.settleSecondaryWindows();
        }
    });

    it("Zotero 11: a further library tab's tree folds from its first refresh and keeps its own fold", async function () {
        if (!wvT.nativeWindows()) this.skip();
        this.timeout(90000);
        await fold();
        const T = win.Zotero_Tabs;
        const first = T.selectedID;
        const had = new Set(T._tabs.map(t => t.id));
        await win.ZoteroPane.newLibraryTab();
        const tab = await wvT.waitFor(() => T._tabs.find(t => !had.has(t.id) && String(t.type).startsWith("library")) || null, 10000);
        assert.isOk(tab, "a second library tab");
        try {
            T.select(tab.id);
            const view = await wvT.waitFor(() => { const v = win.ZoteroPane.getLibraryView(tab.id); return v && v.loaded && v.collectionsView ? v : null; }, 15000);
            assert.isOk(view, "its view");
            const cv3 = view.collectionsView;
            assert.notStrictEqual(cv3, cv, "a tree of its own");
            assert.isTrue(await wvT.waitFor(() => folded(cv3), 10000) || false, "folded");
            assert.strictEqual(st(cv3).born, "refresh", "from its first refresh");
            await wv._wvGfToggle(cv3, true);
            assert.isTrue(await wvT.waitFor(() => unfolded(cv3), 8000) || false, "unfolded in the second tab");
            assert.isTrue(folded(cv), "the first tab's tree stays folded");
        }
        finally {
            try { T.select(first); } catch (e) {}
            try { T.close(tab.id); } catch (e) {}
            await wvT.waitFor(() => win.ZoteroPane.collectionsView === cv, 8000);
        }
    });

    it("the collections search shows the matching groups whatever the fold, with no twisty, and the line folds back when it clears -- unless a group was selected meanwhile", async function () {
        await fold();
        await cv.setFilter("wv-gf-group-a");
        assert.isTrue(await wvT.waitFor(() => shown(cv, G1), 5000) || false, "the matching group shows");
        assert.isFalse(shown(cv, G2), "the other does not match");
        assert.notStrictEqual(hIdx(cv), false, "the line is there");
        assert.isFalse(wv._wvGfIsFoldHeader(cv, hIdx(cv)), "not foldable while searching");
        await wvT.sleep(100);
        assert.isNotOk(twisty(cv), "no twisty while searching (Zotero's own rule for a header)");
        await cv.setFilter("");
        assert.isTrue(await wvT.waitFor(() => folded(cv), 5000) || false, "folded again once the search clears");
        assert.isTrue(st(cv).collapsed, "the state kept");
        // A group the user selects while searching stays visible after. (The
        // user's click focuses the tree -- Zotero's recordCollectionTreeFocus;
        // without it Zotero's own clear collapses again the rows that were
        // collapsed when the search began, setFilter, and the line with them.)
        await cv.setFilter("wv-gf-group-a");
        await wvT.waitFor(() => shown(cv, G1), 5000);
        await cv.selectByID("L" + G1.libraryID);
        cv.recordCollectionTreeFocus();
        assert.strictEqual(focusedID(cv), "L" + G1.libraryID);
        await cv.setFilter("");
        assert.isTrue(await wvT.waitFor(() => unfolded(cv), 5000) || false, "unfolded: the selection shows");
        assert.strictEqual(focusedID(cv), "L" + G1.libraryID, "still selected");
        assert.strictEqual(Zotero.Prefs.get(PREF), true, "a selection is not a toggle: the pref stays");
    });

    it("a drag hovering the folded line for a second unfolds it; Zotero folds it back when the drag ends", async function () {
        this.timeout(30000);
        await fold();
        const item = await wvT.createItem("book", { title: "WV-TEST group fold drag" });
        made.unshift(item);
        const dt = new win.DataTransfer();
        dt.setData("zotero/item", String(item.id));
        const over = () => {
            const el = headEl(cv);
            if (!el) return;
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new win.DragEvent("dragover", { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + r.height / 2, dataTransfer: dt }));
        };
        try {
            const t0 = Date.now();
            let ok = false;
            while (Date.now() - t0 < 4000 && !ok) { over(); await wvT.sleep(150); ok = unfolded(cv); }
            assert.isTrue(ok, "unfolded by the hover");
            await cv.closeContainersExpandedOnDrag();
            assert.isTrue(await wvT.waitFor(() => folded(cv), 5000) || false, "folded back with the other rows the drag opened");
        }
        finally {
            try { const el = headEl(cv); if (el) el.dispatchEvent(new win.DragEvent("dragleave", { bubbles: true, dataTransfer: dt })); } catch (e) {}
            try { if (typeof cv._clearDropIndicator === "function") cv._clearDropIndicator(); } catch (e) {}
        }
    });

    it("groups and collections arriving or leaving by sync while folded: no error, the tree keeps working, the new rows show on unfold", async function () {
        this.timeout(60000);
        await cv.selectByID("C" + M1.id);
        await fold();
        const errs0 = treeErrors().length;
        const G3 = await mkGroup("wv-gf-group-c");
        assert.isTrue(await wvT.waitFor(() => folded(cv) && !shown(cv, G3), 5000) || false, "a new group: still folded");
        assert.notStrictEqual(hIdx(cv), false);
        const N = await mkCollection("wv-gf-new-in-a", G1.libraryID);
        N.name = "wv-gf-new-in-a renamed"; await N.saveTx();
        await G3.eraseTx();
        await wvT.sleep(500);
        assert.isTrue(folded(cv), "still folded");
        assert.isFalse(cv.selection.selectEventsSuppressed, "the tree hears selections");
        assert.strictEqual(focusedID(cv), "C" + M1.id, "the selection kept");
        assert.deepEqual(treeErrors().slice(errs0), [], "no error from the tree");
        // It still works: a selection loads its list.
        await cv.selectLibrary(LIB());
        assert.isTrue(await wvT.waitFor(() => listRowID(win) === "L" + LIB(), 8000) || false, "the list follows the next selection");
        await wv._wvGfToggle(cv, true);
        assert.isTrue(await wvT.waitFor(() => unfolded(cv) && idx(cv, "C" + N.id) !== false, 8000) || false, "the collection added meanwhile shows on unfold");
        assert.isFalse(shown(cv, G3), "the erased group does not");
    });

    it("a group or one of its rows selected by other means unfolds the line: selectByID, selectLibrary, expandLibrary, an item of the group (zotero://select)", async function () {
        this.timeout(60000);
        const cases = [
            ["selectByID(L)", () => cv.selectByID("L" + G1.libraryID), "L" + G1.libraryID],
            ["selectByID(C)", () => cv.selectByID("C" + C1.id), "C" + C1.id],
            ["selectLibrary", () => cv.selectLibrary(G2.libraryID), "L" + G2.libraryID],
            ["selectItem", () => win.ZoteroPane.selectItem(gItem.id), null],
        ];
        if (typeof cv.restoreSelection === "function") cases.push(["restoreSelection", () => cv.restoreSelection(["C" + C1.id]), "C" + C1.id]);
        for (const cse of cases) {
            const [name, go, want] = /** @type {any} */ (cse);
            await reset();
            await fold();
            const r = await go();
            assert.isTrue(await wvT.waitFor(() => unfolded(cv), 5000) || false, name + ": unfolded");
            if (want) assert.strictEqual(focusedID(cv), want, name + ": selected");
            else assert.isTrue(await wvT.waitFor(() => { const row = cv.getRow(cv.selection.focused); return row && row.ref && row.ref.libraryID === G1.libraryID; }, 8000) || false, name + ": the group's row");
            assert.isOk(r !== false, name + ": reported found");
            assert.strictEqual(Zotero.Prefs.get(PREF), true, name + ": not remembered (no toggle)");
        }
        await reset();
        await fold();
        await cv.expandLibrary(G1.libraryID);
        assert.isTrue(await wvT.waitFor(() => unfolded(cv), 5000) || false, "expandLibrary: unfolded");
    });

    it("the keyboard: Left / Right on a group row still close and open it; Up from a group skips the line", async function () {
        await cv.selectByID("L" + G1.libraryID);
        const tree = win.document.getElementById(cv.id);
        const key = (k) => { tree.focus(); tree.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
        const iG = () => idx(cv, "L" + G1.libraryID);
        if (!cv.isContainerOpen(iG())) { await cv.toggleOpenState(iG()); }
        assert.isTrue(cv.isContainerOpen(iG()), "the group open");
        const Z = /** @type {any} */ (Zotero);
        key(Z.arrowPreviousKey || "ArrowLeft");
        assert.isTrue(await wvT.waitFor(() => !cv.isContainerOpen(iG()), 3000) || false, "Left closed the group");
        key(Z.arrowNextKey || "ArrowRight");
        assert.isTrue(await wvT.waitFor(() => cv.isContainerOpen(iG()), 3000) || false, "Right opened it");
        assert.isTrue(unfolded(cv), "the line untouched");
        key("ArrowUp");
        await wvT.sleep(300);
        assert.notStrictEqual(focusedID(cv), "HG", "the line is not focusable");
    });

    it("the indent guide and the pinned parents treat the folding line as a parent with an arrow", function () {
        const iG = idx(cv, "L" + G1.libraryID);
        assert.strictEqual(wv._wvCollGuideSkipPx(cv, iG), 0, "a group row's guide is drawn (its parent has an arrow)");
    });

    it("Extras off: every group shows, no twisty; back on: folded again", async function () {
        this.timeout(60000);
        await fold();
        await wvT.withPref("weavero.enableVisualExtras", false, async () => {
            assert.isTrue(await wvT.waitFor(() => unfolded(cv), 10000) || false, "every group shows");
            await wvT.sleep(200);
            assert.isNotOk(twisty(cv), "no twisty");
            assert.isFalse(headEl(cv).hasAttribute("aria-expanded"), "no aria-expanded");
            assert.isTrue(st(cv).collapsed, "the tree's state kept");
        });
        assert.isTrue(await wvT.waitFor(() => folded(cv), 10000) || false, "folded again");
    });

    it("teardown gives Zotero's tree back exactly: the rows, no twisty, no layer, no listener; wired again it folds per the pref", async function () {
        this.timeout(60000);
        const lib = wvT.lib();
        const CT = win.require("zotero/collectionTree");
        await cv.selectByID("C" + M1.id);
        await fold();
        assert.isAbove(lib.wvWrapLayers(CT.prototype, "_refreshRowMap").length, 0, "the class layer is on");
        const p = wv._wvGfTeardown();
        // Synchronous: the rows are back before anything else runs.
        assert.isTrue(unfolded(cv), "the rows back at once");
        await p;
        assert.strictEqual(focusedID(cv), "C" + M1.id, "the selection kept");
        await wvT.sleep(200);
        const h = headEl(cv);
        assert.isNotOk(h.querySelector(".twisty"), "no twisty");
        assert.isOk(h.querySelector(".spacer-twisty, .spacer-header"), "Zotero's spacer");
        assert.isFalse(h.hasAttribute("aria-expanded"), "no aria-expanded");
        assert.isFalse(!!cv.getRow(hIdx(cv)).isOpen, "the header row as Zotero builds it");
        // selectItems / selectCollection / selectSearch / selectTrash: the collections funnel's
        // navigation layers, laid with the fold's (coll-funnel.ts; second review 2026-11-28).
        for (const m of ["_refreshRowMap", "refresh", "selectLibrary", "expandToCollection", "expandLibrary", "notify",
            "selectItems", "selectCollection", "selectSearch", "selectTrash"]) {
            assert.deepEqual(lib.wvWrapLayers(CT.prototype, m).filter(l => l.layer === "grpfold"), [], "class layer " + m + " off");
        }
        // Its own layer gone; another feature's (the saved-search folders') may stay.
        assert.deepEqual(lib.wvWrapLayers(cv, "toggleOpenState").filter(l => l.layer === "grpfold"), [], "no fold layer on toggleOpenState");
        assert.deepEqual(lib.wvListenKeys(cv.domEl).filter(k => /^grpfold:/.test(k.key)), [], "no listener");
        assert.isNotOk(st(cv), "no state");
        assert.isNotOk(cv.isContainerEmpty._wvTag, "isContainerEmpty is Zotero's");
        // Wired again (as a reload does): folded per the pref.
        wv._wvHidApply(win);
        wv._wvGfWire(win);
        assert.isTrue(await wvT.waitFor(() => folded(cv), 8000) || false, "folded again per the pref");
        assert.isOk(st(cv) && st(cv).collapsed, "wired");
        assert.strictEqual(focusedID(cv), "C" + M1.id, "the selection kept");
    });

    it("the last group leaving: folded, the line goes; open, Zotero's leftover line gets no twisty", async function () {
        this.timeout(60000);
        await fold();
        for (const g of [G1, G2]) { try { await g.eraseTx(); } catch (e) {} }
        assert.isTrue(await wvT.waitFor(() => hIdx(cv) === false, 8000) || false, "no line without groups");
        assert.isFalse(cv.selection.selectEventsSuppressed, "the tree hears selections");
        // Open: Zotero's notify removes the group's rows and leaves its header
        // until the next refresh -- with nothing to fold, no twisty there.
        const G9 = await mkGroup("wv-gf-group-z");
        assert.isTrue(await wvT.waitFor(() => hIdx(cv) !== false, 8000) || false, "the line back with a group");
        assert.strictEqual(idx(cv, "L" + G9.libraryID), false, "folded still: the tree's state");
        await wv._wvGfToggle(cv, true);
        assert.isTrue(await wvT.waitFor(() => idx(cv, "L" + G9.libraryID) !== false, 8000) || false, "the line with one group, open");
        await G9.eraseTx();
        await wvT.waitFor(() => idx(cv, "L" + G9.libraryID) === false, 8000);
        if (hIdx(cv) !== false) {
            assert.isFalse(wv._wvGfIsFoldHeader(cv, hIdx(cv)), "the leftover line does not fold");
            await wvT.sleep(100);
            assert.isNotOk(twisty(cv), "no twisty on it");
        }
        // Back for the after hook (it erases what it made).
        G1 = await mkGroup("wv-gf-group-a");
        G2 = await mkGroup("wv-gf-group-b");
        assert.isTrue(await wvT.waitFor(() => hIdx(cv) !== false, 8000) || false, "the line again with the groups");
    });
});
