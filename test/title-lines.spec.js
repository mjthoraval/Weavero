/* global describe, it, before, after, afterEach, assert, Zotero, wvT */

// Multi-line titles in the items list (MJT 2026-11-05, forum 97645): "first the
// 2 lines fixed height, like in the old Mendeley Desktop. Then also fixed
// heights with a configurable number of rows." Settings only: weavero.titleLinesMode
// ("off" | "fixed" | "adaptive") and weavero.titleLinesCount (2-10). Zotero's one-line list stays
// the default. Contracts:
//  - fixed N: every top-level row the same height, N lines of text plus Zotero's
//    padding; the title clamped to N lines;
//  - every text column wraps inside the row, and the row reads from its top, as in
//    Mendeley Desktop (MJT 2026-11-06); counts and icons keep their own layout;
//  - a child row stays on Zotero's one line in both modes (MJT 2026-11-06,
//    "Child rows do not need multi-row");
//  - the rows keep their order and places: Zotero's list positions them itself.
//    Better Viewer's `position: relative` is what scrambles them on a scroll;
//  - a later font or density change keeps the lines;
//  - every main window, each its own tree;
//  - off, Visual Extras off or shutdown: Zotero's rows back, nothing left.

describe("Weavero — multi-line titles in the items list", function () {
    this.timeout(120000);
    let wv, win, ZP, tree, native, items = [];
    const P = (k) => "weavero." + k;
    const LONG = "wv-title-lines " + "a long title that needs several lines to fit in the column ".repeat(8);
    const opened = [];
    const expected = (n, t = tree) => {
        const pad = Zotero.Prefs.get("uiDensity") === "comfortable" ? 11 : 5;
        return Math.round(n * t._renderedTextHeight * Number(Zotero.Prefs.get("fontSize")) + pad);
    };
    const set = (mode, count) => {
        if (count) Zotero.Prefs.set(P("titleLinesCount"), count);
        Zotero.Prefs.set(P("titleLinesMode"), mode);
    };
    const reset = () => {
        Zotero.Prefs.clear(P("titleLinesMode"));
        Zotero.Prefs.clear(P("titleLinesCount"));
    };
    const heightIs = (h, t = tree, ms = 4000) => wvT.waitFor(() => (t._rowHeight === h ? true : null), ms, 30);
    const rowOf = (i, w = win) => w.document.querySelector("#zotero-items-tree .virtualized-table .row[id$='-row-" + i + "']");
    const titleText = (row) => row && row.querySelector(".cell.title .cell-text");
    const rows = () => [...win.document.querySelectorAll("#zotero-items-tree .virtualized-table .row")]
        .map((el) => ({ el, i: parseInt(/-row-(\d+)$/.exec(el.id)[1], 10), h: el.getBoundingClientRect().height, top: parseFloat(el.style.top) }))
        .sort((a, b) => a.i - b.i);
    const contiguous = () => {
        const rs = rows();
        for (let k = 1; k < rs.length; k++) {
            if (rs[k].i !== rs[k - 1].i + 1) continue;
            assert.closeTo(rs[k].top, rs[k - 1].top + rs[k - 1].h, 0.6, "row " + rs[k].i + " right under the one before");
        }
    };

    before(async function () {
        wv = wvT.plugin();
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        win.Zotero_Tabs.select("zotero-pane");
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        for (let i = 0; i < 40; i++) {
            const it = /** @type {any} */ (new Zotero.Item("book"));
            it.libraryID = Zotero.Libraries.userLibraryID;
            it.setField("title", i % 2 ? "wv-title-lines short " + i : LONG);
            await it.saveTx({ skipSelect: true });
            items.push(it);
        }
        await wvT.waitFor(() => ZP.itemsView.rowCount >= 40, 8000);
        // Zotero brings a selected row back into view on a refresh, and the Visual
        // Extras test here makes Weavero re-register its columns, which refreshes the
        // list a moment later. A row another spec left selected scrolled "the last row"
        // away in full runs, never alone (traced 2026-11-07: refreshAndMaintainSelection,
        // _restoreSelection, row 0).
        ZP.itemsView.selection.clearSelection();
        tree = ZP.itemsView.tree;
        native = tree._rowHeight;
    });

    afterEach(async function () {
        reset();
        await heightIs(native);
    });

    after(async function () {
        await wvT.erase(...items);
    });

    it("the private Zotero members this stands on are there", function () {
        for (const m of ["_getRowHeight", "updateFontSize", "updateCustomRowHeights", "invalidate"]) {
            assert.isFunction(tree[m], m);
        }
        assert.isNumber(tree._renderedTextHeight, "_renderedTextHeight");
        assert.isObject(tree._customRowHeightMap, "_customRowHeightMap");
        assert.isArray(tree._jsWindow._rowOffsets, "_rowOffsets");
        assert.isFunction(tree._jsWindow._getItemPosition, "_getItemPosition");
    });

    it("off is the default: Zotero's own rows, nothing installed", function () {
        assert.strictEqual(Zotero.Prefs.get(P("titleLinesMode")), "off");
        assert.strictEqual(Zotero.Prefs.get(P("titleLinesCount")), 2);
        assert.strictEqual(tree._rowHeight, native);
        assert.isNull(win.document.getElementById("wv-title-lines-style"));
        assert.isFalse(Object.prototype.hasOwnProperty.call(tree, "_getRowHeight"), "no wrap on the tree");
    });

    it("fixed 2 lines: every row two lines tall, a long title clamped to two, a short one on one", async function () {
        set("fixed", 2);
        assert.isOk(await heightIs(expected(2)), "row height " + tree._rowHeight + ", expected " + expected(2));
        const lh = parseFloat(win.getComputedStyle(titleText(rowOf(0))).lineHeight);
        const seen = [];
        for (let i = 0; i < 12; i++) {
            const t = titleText(rowOf(i));
            if (!t) continue;
            seen.push(Math.round(t.getBoundingClientRect().height / lh));
            assert.strictEqual(rowOf(i).getBoundingClientRect().height, tree._rowHeight, "row " + i);
        }
        assert.include(seen, 2, "a long title takes two lines");
        assert.notInclude(seen, 3, "never three");
    });

    it("fixed 4 lines: the height and the clamp follow the number", async function () {
        set("fixed", 4);
        assert.isOk(await heightIs(expected(4)), "row height " + tree._rowHeight);
        const lh = parseFloat(win.getComputedStyle(titleText(rowOf(0))).lineHeight);
        const lines = [];
        for (let i = 0; i < 12; i++) { const t = titleText(rowOf(i)); if (t) lines.push(Math.round(t.getBoundingClientRect().height / lh)); }
        assert.include(lines, 4);
        assert.notInclude(lines, 5);
    });

    it("the number is kept within 2 to 10", async function () {
        set("fixed", 40);
        assert.isOk(await heightIs(expected(10)), "at most 10");
        Zotero.Prefs.set(P("titleLinesCount"), 1);
        assert.isOk(await heightIs(expected(2)), "at least 2");
    });

    it("the rows keep their order and places after a scroll", async function () {
        set("fixed", 3);
        const h = expected(3);
        await heightIs(h);
        tree._jsWindow.scrollTo(12 * h);
        await wvT.sleep(150);
        const rows = [...win.document.querySelectorAll("#zotero-items-tree .virtualized-table .row")];
        assert.isAbove(rows.length, 3);
        for (const r of rows) {
            const i = parseInt(/-row-(\d+)$/.exec(r.id)[1], 10);
            assert.strictEqual(parseFloat(r.style.top), i * h, "row " + i);
            assert.strictEqual(win.getComputedStyle(r).position, "absolute", "Zotero's positioning kept");
        }
        tree._jsWindow.scrollTo(0);
    });

    it("a font or density change keeps the lines", async function () {
        set("fixed", 2);
        await heightIs(expected(2));
        const font = Zotero.Prefs.get("fontSize");
        try {
            Zotero.Prefs.set("fontSize", 1.15);
            tree.updateFontSize();
            assert.strictEqual(tree._rowHeight, expected(2));
        }
        finally {
            Zotero.Prefs.set("fontSize", font);
            tree.updateFontSize();
        }
    });

    it("every main window gets it, on a window opened before and after the setting", async function () {
        try {
            const w2 = await wvT.openMainWindow();
            assert.isOk(w2, "a second main window");
            opened.push(w2);
            await wvT.waitFor(() => w2.ZoteroPane.itemsView && w2.ZoteroPane.itemsView.tree, 15000);
            const t2 = w2.ZoteroPane.itemsView.tree;
            set("fixed", 2);
            assert.isOk(await heightIs(expected(2, t2), t2), "the window already open");
            const w3 = await wvT.openMainWindow();
            assert.isOk(w3, "a third main window");
            opened.push(w3);
            await wvT.waitFor(() => w3.ZoteroPane.itemsView && w3.ZoteroPane.itemsView.tree, 15000);
            const t3 = w3.ZoteroPane.itemsView.tree;
            const now = () => w3.ZoteroPane.itemsView.tree;
            // Up to the wiring table's own wait for the pane's views (_wvWhenPaneViewsReady).
            const ok = await wvT.waitFor(() => (now() && now()._rowHeight === expected(2, now()) ? true : null), 30000, 30);
            assert.isOk(ok, "a window opened with the setting on: " + JSON.stringify({
                h: now() && now()._rowHeight, want: now() && expected(2, now()), sameTree: now() === t3, firstTreeH: t3._rowHeight,
                ownWrap: !!now() && Object.prototype.hasOwnProperty.call(now(), "_getRowHeight"),
                mode: wv._wvTitleLinesMode(), sheet: !!w3.document.getElementById("wv-title-lines-style"),
            }));
        }
        finally {
            reset();
            for (const w of opened.splice(0)) { if (!w.closed) { w._wvSavedParkClose = true; w.close(); } }
            await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
        }
    });

    it("Visual Extras off switches it off, and on brings it back", async function () {
        const ve = Zotero.Prefs.get(P("enableVisualExtras"));
        set("fixed", 2);
        await heightIs(expected(2));
        try {
            Zotero.Prefs.set(P("enableVisualExtras"), false);
            assert.isOk(await heightIs(native), "Zotero's rows");
            assert.isNull(win.document.getElementById("wv-title-lines-style"));
            Zotero.Prefs.set(P("enableVisualExtras"), true);
            assert.isOk(await heightIs(expected(2)), "back");
        }
        finally { Zotero.Prefs.set(P("enableVisualExtras"), ve === undefined ? true : ve); }
    });

    it("back to one line leaves nothing: rows, sheet and the wrap on the tree", async function () {
        set("fixed", 3);
        await heightIs(expected(3));
        set("off");
        assert.isOk(await heightIs(native), "Zotero's rows");
        assert.isNull(win.document.getElementById("wv-title-lines-style"));
        assert.isFalse(Object.prototype.hasOwnProperty.call(tree, "_getRowHeight"), "no wrap left on the tree");
        assert.strictEqual(win.getComputedStyle(titleText(rowOf(0))).whiteSpace, "nowrap", "one line again");
    });

    // Adaptive (MJT 2026-11-05, "adaptative number of rows with a maximum"): each
    // row as tall as its title needs, up to the number. Heights are kept per title
    // and width, not per row number, so they follow the item through whatever
    // reorders the rows; every row gets one, so the list's positions stay exact.
    describe("adaptive", function () {
        let jsw;
        const itemAt = (i) => ZP.itemsView.getRow(i).ref;
        const rowCount = () => {
            const rp = ZP.itemsView.rowProvider || ZP.itemsView;
            return rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        };
        const isLong = (it) => (it.getField("title") || "").startsWith("wv-title-lines a long");
        const tall = (n) => expected(n);
        // Every long title on the screen at the maximum, every short one on one line.
        const settled = (n) => wvT.waitFor(() => {
            const rs = rows().filter((r) => items.includes(itemAt(r.i)));
            if (rs.length < 4) return null;
            return rs.every((r) => r.h === (isLong(itemAt(r.i)) ? tall(n) : native)) ? true : null;
        }, 8000, 40);

        before(function () { jsw = tree._jsWindow; });

        it("a short title keeps one line, a long one grows to the maximum, and the rows stay contiguous", async function () {
            set("adaptive", 3);
            assert.isOk(await settled(3), "heights " + rows().slice(0, 6).map((r) => r.h));
            contiguous();
        });

        it("the list's whole height is the sum of its rows, and the last row can be reached", async function () {
            set("adaptive", 3);
            await settled(3);
            let sum = 0;
            const n = rowCount();
            for (let i = 0; i < n; i++) sum += i in tree._customRowHeightMap ? tree._customRowHeightMap[i] : tree._rowHeight;
            assert.closeTo(parseFloat(jsw.innerElem.style.height), sum, 0.6, "the scroll height");
            tree.scrollToRow(n - 1);
            const atOnce = rows().some((r) => r.i === n - 1);
            await wvT.sleep(150);
            const drawn = rows().map((r) => r.i);
            assert.isOk(drawn.includes(n - 1), "the last row is drawn: " + n + " rows, drawn at once " + atOnce + ", now "
                + drawn[0] + " to " + drawn[drawn.length - 1] + ", scroll " + Math.round(jsw.scrollOffset) + " of " + jsw.innerElem.style.height);
            tree.scrollToRow(0);
        });

        it("the number caps it", async function () {
            set("adaptive", 2);
            assert.isOk(await settled(2));
        });

        it("a sort: the heights follow the items, not the row numbers", async function () {
            set("adaptive", 3);
            await settled(3);
            const before = ZP.itemsView.getRow(0).ref.id;
            // getSortDirection reads the items view's own columns. On a fresh profile
            // _columns.toggleSort never reaches them and only ever sorts ascending.
            const reverse = async () => {
                const col = ZP.itemsView._getColumns().find((c) => c.dataKey === "title");
                col.sortDirection = -(col.sortDirection || 1);
                await ZP.itemsView.sort();
            };
            await reverse();
            try {
                assert.notStrictEqual(ZP.itemsView.getRow(0).ref.id, before, "the rows moved");
                assert.isOk(await settled(3), "after the sort");
                contiguous();
            }
            finally { await reverse(); }
        });

        it("a quick search: rows gone, heights right", async function () {
            set("adaptive", 3);
            await settled(3);
            await ZP.itemsView.setFilter("search", "wv-title-lines short");
            await wvT.waitFor(() => rowCount() <= 20, 6000);
            try {
                assert.isOk(await wvT.waitFor(() => (rows().every((r) => r.h === native) ? true : null), 6000, 40), "every row on one line: " + rows().slice(0, 5).map((r) => r.h));
            }
            finally { await ZP.itemsView.setFilter("search", ""); }
            assert.isOk(await settled(3), "the long ones back");
        });

        it("expanding a row moves the rows under it and their heights with them", async function () {
            const parent = /** @type {any} */ (new Zotero.Item("book"));
            parent.libraryID = Zotero.Libraries.userLibraryID;
            // Sorts first, so there are rows under it to move.
            parent.setField("title", "0 wv-title-lines parent");
            await parent.saveTx({ skipSelect: true });
            const child = /** @type {any} */ (new Zotero.Item("note"));
            child.libraryID = Zotero.Libraries.userLibraryID;
            child.parentID = parent.id;
            child.setNote("<p>a short note</p>");
            await child.saveTx({ skipSelect: true });
            items.push(parent);
            try {
                set("adaptive", 3);
                await wvT.waitFor(() => ZP.itemsView.getRowIndexByID(parent.treeViewID) !== false, 4000);
                await settled(3);
                const idx = ZP.itemsView.getRowIndexByID(parent.treeViewID);
                const below = ZP.itemsView.getRow(idx + 1).ref;
                const tallBefore = Object.keys(tree._customRowHeightMap).length;
                await ZP.itemsView.toggleOpenState(idx);
                const next = () => ZP.itemsView.getRowIndexByID(below.treeViewID);
                assert.strictEqual(next(), idx + 2, "the child row sits between them");
                assert.isOk(await wvT.waitFor(() => (Object.keys(tree._customRowHeightMap).length === tallBefore
                    && (!isLong(below) || next() in tree._customRowHeightMap) ? true : null), 6000, 40), "the heights moved down a row");
                contiguous();
            }
            finally { await wvT.erase(child); }
        });

        // Heights go by row number, so rows that move have their neighbours' heights
        // until the new ones land. With a timer between the two the whole list jumped
        // on every filter, 44 to 67 ms of it (MJT 2026-11-06, frames in the report).
        // An observer's callback is a microtask: it runs after what the change did in
        // its task and before any paint, and unlike a requestAnimationFrame it does
        // not need the window on screen.
        describe("rows that move are never drawn at another row's height", function () {
            const rp = () => ZP.itemsView.rowProvider || ZP.itemsView;
            const wrong = () => rows().filter((r) => {
                const row = rp().getRow(r.i);
                if (!row) return false;
                if (row.level) return r.h !== native;
                if (!items.includes(row.ref)) return false;
                return r.h !== (isLong(row.ref) ? tall(3) : native);
            }).map((r) => r.i);
            const watching = async (change) => {
                const seen = [];
                const mo = new win.MutationObserver(() => {
                    const w = wrong();
                    if (w.length) seen.push("rows " + w.slice(0, 6).join(","));
                });
                mo.observe(jsw.innerElem, { childList: true, subtree: true });
                try {
                    await change();
                    await wvT.sleep(250);
                }
                finally { mo.disconnect(); }
                return seen;
            };
            const reverse = async () => {
                const col = ZP.itemsView._getColumns().find((c) => c.dataKey === "title");
                col.sortDirection = -(col.sortDirection || 1);
                await ZP.itemsView.sort();
            };

            it("a filter, on and off", async function () {
                const shorts = items.filter((x) => !isLong(x));
                for (const it of shorts) {
                    it.setField("abstractNote", "wv-title-lines abstract");
                    await it.saveTx({ skipSelect: true });
                }
                // The saves refresh the tree later, and that refresh bounces an apply.
                await wvT.sleep(1500);
                set("adaptive", 3);
                await settled(3);
                const all = rowCount();
                // The filter keeps items added in the last 10 s (filter.ts, RECENT_WINDOW_MS),
                // and whether these still are depends on how fast the run got here.
                if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
                try {
                    const on = await watching(async () => {
                        const g = wv._emptyFilterGroup();
                        g.hasAbstract = true;
                        wv._filterState = { groups: [g], activeGroupIndex: 0 };
                        wv._renderFilterBar();
                        await wv._applyItemsListFilter({ cascade: true });
                        await wvT.waitFor(() => (rowCount() < all ? true : null), 6000, 20);
                    });
                    assert.isBelow(rowCount(), all, "the filter took rows away");
                    assert.deepEqual(on, [], "filter on");
                    const off = await watching(async () => {
                        wv._clearAllFilters();
                        await wvT.waitFor(() => (rowCount() === all ? true : null), 6000, 20);
                    });
                    assert.equal(rowCount(), all, "every row back");
                    assert.deepEqual(off, [], "filter off");
                }
                finally {
                    wv._clearAllFilters();
                    await wvT.waitFor(() => (rowCount() === all ? true : null), 6000, 20);
                }
            });

            it("a sort, both ways", async function () {
                set("adaptive", 3);
                await settled(3);
                const before = rp().getRow(0).ref.id;
                let there = [];
                try {
                    there = await watching(reverse);
                    assert.notStrictEqual(rp().getRow(0).ref.id, before, "the rows moved");
                }
                finally {
                    const back = await watching(reverse);
                    assert.deepEqual(there.concat(back), []);
                }
            });

            it("a quick search, on and off", async function () {
                set("adaptive", 3);
                await settled(3);
                let on = [];
                try {
                    on = await watching(async () => {
                        await ZP.itemsView.setFilter("search", "wv-title-lines short");
                        await wvT.waitFor(() => (rowCount() <= 20 ? true : null), 6000, 20);
                    });
                }
                finally {
                    const off = await watching(() => ZP.itemsView.setFilter("search", ""));
                    assert.deepEqual(on.concat(off), []);
                }
            });

            it("an expand and a collapse", async function () {
                const parent = /** @type {any} */ (new Zotero.Item("book"));
                parent.libraryID = Zotero.Libraries.userLibraryID;
                parent.setField("title", "0 wv-title-lines moving parent");
                await parent.saveTx({ skipSelect: true });
                const child = /** @type {any} */ (new Zotero.Item("note"));
                child.libraryID = Zotero.Libraries.userLibraryID;
                child.parentID = parent.id;
                child.setNote("<p>a short note</p>");
                await child.saveTx({ skipSelect: true });
                items.push(parent);
                try {
                    set("adaptive", 3);
                    await wvT.waitFor(() => (ZP.itemsView.getRowIndexByID(parent.treeViewID) !== false ? true : null), 4000);
                    await settled(3);
                    const idx = ZP.itemsView.getRowIndexByID(parent.treeViewID);
                    if (ZP.itemsView.isContainerOpen(idx)) await ZP.itemsView.toggleOpenState(idx);
                    await wvT.sleep(200);
                    const open = await watching(() => ZP.itemsView.toggleOpenState(idx));
                    assert.isTrue(ZP.itemsView.isContainerOpen(idx), "open");
                    const shut = await watching(() => ZP.itemsView.toggleOpenState(idx));
                    assert.deepEqual(open.concat(shut), []);
                }
                finally { await wvT.erase(child); }
            });
        });

        it("a resized Title column: the lines follow, without a new setting", async function () {
            set("adaptive", 4);
            await settled(4);
            const col = tree._getColumns().find((c) => c.dataKey === "title");
            const w0 = col.width;
            const short = items.find((x) => !isLong(x) && ZP.itemsView.getRowIndexByID(x.treeViewID) !== false);
            const idx = () => ZP.itemsView.getRowIndexByID(short.treeViewID);
            assert.notProperty(tree._customRowHeightMap, String(idx()), "one line to begin with");
            tree._columns.onResize({ title: 40 });
            try {
                // By the map: the taller rows above push it off the screen.
                assert.isOk(await wvT.waitFor(() => (idx() in tree._customRowHeightMap ? true : null), 6000, 40), "the short title wraps");
                contiguous();
            }
            finally { tree._columns.onResize({ title: w0 }); }
            assert.isOk(await settled(4), "and back");
        });

        it("a font change keeps the heights, which Zotero's own update clears", async function () {
            set("adaptive", 3);
            await settled(3);
            const font = Zotero.Prefs.get("fontSize");
            try {
                Zotero.Prefs.set("fontSize", 1.15);
                tree.updateFontSize();
                assert.isOk(await wvT.waitFor(() => (Object.keys(tree._customRowHeightMap).length > 3 && jsw.customRowHeights.length > 3 ? true : null), 4000, 30), "still there");
            }
            finally {
                Zotero.Prefs.set("fontSize", font);
                tree.updateFontSize();
            }
            assert.isOk(await settled(3), "at the old font again");
        });

        it("a title edit changes that row's height", async function () {
            set("adaptive", 3);
            await settled(3);
            const it0 = items.find((x) => !isLong(x) && ZP.itemsView.getRowIndexByID(x.treeViewID) !== false);
            const keep = it0.getField("title");
            it0.setField("title", LONG + " edited");
            await it0.saveTx({ skipSelect: true });
            try {
                const idx = () => ZP.itemsView.getRowIndexByID(it0.treeViewID);
                assert.isOk(await wvT.waitFor(() => (tree._customRowHeightMap[idx()] === tall(3) ? true : null), 6000, 40), "its row grew");
            }
            finally {
                it0.setField("title", keep);
                await it0.saveTx({ skipSelect: true });
            }
        });

        it("the row at the top of the view stays there while heights arrive", async function () {
            set("adaptive", 3);
            await settled(3);
            const pos = jsw._getItemPosition(16);
            jsw.scrollTo(pos);
            await wvT.sleep(120);
            const first = jsw.getFirstVisibleRow();
            Zotero.Prefs.set(P("titleLinesCount"), 5);
            await wvT.waitFor(() => (Object.values(tree._customRowHeightMap).some((h) => h === tall(5)) ? true : null), 6000, 40);
            await wvT.sleep(200);
            assert.strictEqual(jsw.getFirstVisibleRow(), first, "the same row");
            jsw.scrollTo(0);
        });

        it("a row with less room than its level's takes the height it needs", async function () {
            set("adaptive", 4);
            await settled(4);
            const short = items.find((x) => !isLong(x) && ZP.itemsView.getRowIndexByID(x.treeViewID) !== false);
            const row = () => ZP.itemsView.getRowIndexByID(short.treeViewID);
            tree.scrollToRow(row());
            await wvT.sleep(150);
            assert.notProperty(tree._customRowHeightMap, String(row()), "one line to begin with");
            // Stands in for a tag swatch or a plugin's glyph: this row's text alone is narrower.
            // Left room, not a fixed padding: a wider title column (340 px on zotero#6035's
            // build) kept the short title on one line behind 160 px.
            const css = win.document.createElementNS("http://www.w3.org/1999/xhtml", "style");
            css.textContent = "#zotero-items-tree .row[id$='-row-" + row() + "'] .cell.title .cell-text { padding-right: calc(100% - 70px) !important; }";
            win.document.documentElement.appendChild(css);
            try {
                tree.invalidate();
                assert.isOk(await wvT.waitFor(() => (row() in tree._customRowHeightMap ? true : null), 4000, 30), "its row grew");
            }
            finally {
                css.remove();
                tree.invalidate();
            }
            assert.isOk(await wvT.waitFor(() => (row() in tree._customRowHeightMap ? null : true), 4000, 30), "and back to one line");
            tree.scrollToRow(0);
        });

        it("Page Down moves a page of the rows on screen, not of one-line rows", async function () {
            set("adaptive", 4);
            await settled(4);
            jsw.scrollTo(0);
            await wvT.sleep(80);
            // The first press goes to the edge of the view, as in Zotero.
            for (let k = 0; k < 6 && tree.selection.focused !== jsw.getLastVisibleRow(); k++) {
                tree._onJumpSelect(1, false, false);
                await wvT.sleep(200);
            }
            const from = tree.selection.focused;
            assert.strictEqual(from, jsw.getLastVisibleRow(), "at the edge of the view");
            const page = jsw.getLastVisibleRow() - jsw.getFirstVisibleRow();
            assert.isBelow(page, Math.floor(jsw.getWindowHeight() / tree._rowHeight), "rows taller than Zotero's page assumes");
            tree._onJumpSelect(1, false, false);
            const want = Math.min(from + page, rowCount() - 1);
            await wvT.waitFor(() => (tree.selection.focused !== from ? true : null), 2000, 20);
            assert.strictEqual(tree.selection.focused, want);
            tree.selection.clearSelection();
            jsw.scrollTo(0);
        });

        it("the top of the view is drawn when it cuts through a tall row", async function () {
            set("adaptive", 10);
            await settled(10);
            const k = ZP.itemsView.getRowIndexByID(items.find(isLong).treeViewID);
            jsw.scrollTo(jsw._getItemPosition(k) + tall(10) - 8);
            await wvT.sleep(120);
            try {
                assert.strictEqual(jsw.getFirstVisibleRow(), k, "the first visible row");
                assert.isOk(rows().some((r) => r.i === k), "it is drawn");
                const last = jsw.getLastVisibleRow();
                const bottom = jsw.scrollOffset + jsw.getWindowHeight();
                assert.isAtMost(jsw._getItemPosition(last), bottom, "the last row starts in the view");
                assert.isAbove(jsw._getItemPosition(last + 1), bottom, "and it is the last");
            }
            finally { jsw.scrollTo(0); }
        });

        it("back to one line: no heights left, the list as Zotero had it", async function () {
            set("adaptive", 3);
            await settled(3);
            set("off");
            assert.isOk(await wvT.waitFor(() => (!Object.keys(tree._customRowHeightMap).length ? true : null), 4000, 30), "no heights");
            assert.lengthOf(jsw.customRowHeights, 0);
            assert.closeTo(parseFloat(jsw.innerElem.style.height), rowCount() * native, 0.6, "the scroll height");
            assert.isFalse(Object.prototype.hasOwnProperty.call(jsw, "invalidate"), "no wrap left on the list");
            assert.isFalse(Object.prototype.hasOwnProperty.call(tree, "_onJumpSelect"), "no wrap left on the tree");
            assert.isFalse(Object.prototype.hasOwnProperty.call(jsw, "getFirstVisibleRow"), "nor the row lookups");
        });

        it("from fixed to adaptive and back: each undoes the other", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            set("adaptive", 3);
            assert.isOk(await heightIs(native), "the base row is one line again");
            assert.isOk(await settled(3));
            set("fixed", 3);
            assert.isOk(await heightIs(expected(3)));
            assert.isOk(await wvT.waitFor(() => (!Object.keys(tree._customRowHeightMap).length ? true : null), 4000, 30), "no custom heights under fixed");
        });
    });

    // MJT 2026-11-06, on a "Full Text" row two lines tall: "Child rows do not need
    // multi-row". Fixed makes the base row tall, so the child rows are the ones with
    // a height of their own, and a flat list has none and stays at Zotero's speed.
    describe("child rows", function () {
        let jsw, parent;
        const kids = [];
        const idx = () => ZP.itemsView.getRowIndexByID(parent.treeViewID);
        const kidRow = (k) => ZP.itemsView.getRowIndexByID(kids[k].treeViewID);
        const count = () => {
            const rp = ZP.itemsView.rowProvider || ZP.itemsView;
            return rp.getRowCount ? rp.getRowCount() : rp._rows.length;
        };
        const listHeight = () => parseFloat(jsw.innerElem.style.height);
        const isOpen = () => kidRow(0) !== false;
        const open = async () => {
            await wvT.waitFor(() => (idx() !== false ? true : null), 4000, 20);
            if (!isOpen()) await ZP.itemsView.toggleOpenState(idx());
            await wvT.waitFor(() => (kidRow(1) !== false ? true : null), 4000, 20);
            tree.scrollToRow(idx());
            await wvT.sleep(120);
        };
        const kidsAt = (h) => wvT.waitFor(() => (tree._customRowHeightMap[kidRow(0)] === h && tree._customRowHeightMap[kidRow(1)] === h ? true : null), 4000, 20);
        const reverse = async () => {
            const col = ZP.itemsView._getColumns().find((c) => c.dataKey === "title");
            col.sortDirection = -(col.sortDirection || 1);
            await ZP.itemsView.sort();
        };

        before(async function () {
            jsw = tree._jsWindow;
            parent = /** @type {any} */ (new Zotero.Item("book"));
            parent.libraryID = Zotero.Libraries.userLibraryID;
            parent.setField("title", LONG + " parent");
            await parent.saveTx({ skipSelect: true });
            for (let k = 0; k < 2; k++) {
                const n = /** @type {any} */ (new Zotero.Item("note"));
                n.libraryID = Zotero.Libraries.userLibraryID;
                n.parentID = parent.id;
                n.setNote("<p>" + LONG + "</p>");
                await n.saveTx({ skipSelect: true });
                kids.push(n);
            }
        });

        afterEach(async function () {
            if (idx() !== false && isOpen()) await ZP.itemsView.toggleOpenState(idx());
            tree.scrollToRow(0);
        });

        after(async function () { await wvT.erase(...kids, parent); });

        it("fixed: a child row keeps Zotero's one line, its long title unwrapped, the rows around it tall", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "heights " + JSON.stringify(tree._customRowHeightMap));
            // The parent can sit at the bottom edge, with the rows under it not drawn yet.
            tree.scrollToRow(kidRow(1));
            await wvT.sleep(120);
            assert.isOk(rowOf(kidRow(0)) && rowOf(idx()), "drawn: " + rows().map((r) => r.i) + ", child " + kidRow(0) + ", first " + jsw.getFirstVisibleRow() + ", last " + jsw.getLastVisibleRow());
            assert.strictEqual(rowOf(kidRow(0)).getBoundingClientRect().height, native, "the child row");
            assert.strictEqual(rowOf(idx()).getBoundingClientRect().height, expected(3), "its parent");
            assert.strictEqual(win.getComputedStyle(titleText(rowOf(kidRow(0)))).whiteSpace, "nowrap", "one line of text");
            contiguous();
        });

        it("fixed: the list's height counts them, and only them", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "the two child rows");
            assert.strictEqual(Object.keys(tree._customRowHeightMap).length, 2, "a height for the two child rows, none for the rest");
            assert.closeTo(listHeight(), count() * expected(3) - 2 * (expected(3) - native), 0.6, "the scroll height");
        });

        it("fixed: collapsing gives the list its one height back", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "open: the two child rows");
            await ZP.itemsView.toggleOpenState(idx());
            assert.isOk(await wvT.waitFor(() => (!Object.keys(tree._customRowHeightMap).length ? true : null), 4000, 20), "no heights");
            assert.closeTo(listHeight(), count() * expected(3), 0.6, "the scroll height");
        });

        it("fixed: a sort takes the one-line rows with their items", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "before the sort");
            const from = kidRow(0);
            await reverse();
            try {
                assert.notStrictEqual(kidRow(0), from, "the row moved");
                assert.isOk(await kidsAt(native), "heights " + JSON.stringify(tree._customRowHeightMap));
                assert.strictEqual(Object.keys(tree._customRowHeightMap).length, 2);
            }
            finally { await reverse(); }
        });

        it("fixed: a font change, which clears Zotero's heights, keeps them", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "before the font change");
            const font = Zotero.Prefs.get("fontSize");
            try {
                Zotero.Prefs.set("fontSize", 1.15);
                tree.updateFontSize();
                assert.isOk(await kidsAt(expected(1)), "one line at the new font: " + JSON.stringify(tree._customRowHeightMap));
                assert.lengthOf(jsw.customRowHeights, 2, "in the list as well");
            }
            finally {
                Zotero.Prefs.set("fontSize", font);
                tree.updateFontSize();
            }
        });

        it("adaptive: a child row keeps one line, however long its title", async function () {
            set("adaptive", 3);
            await open();
            assert.isOk(await wvT.waitFor(() => (tree._customRowHeightMap[idx()] === expected(3) ? true : null), 6000, 30), "the parent grows");
            await wvT.sleep(200);
            assert.notProperty(tree._customRowHeightMap, String(kidRow(0)), "no height of its own");
            assert.strictEqual(rowOf(kidRow(0)).getBoundingClientRect().height, native, "the child row");
            assert.strictEqual(win.getComputedStyle(titleText(rowOf(kidRow(0)))).whiteSpace, "nowrap", "one line of text");
            contiguous();
        });

        it("from fixed to adaptive to off with child rows open: nothing left over", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await open();
            assert.isOk(await kidsAt(native), "under fixed");
            set("adaptive", 3);
            assert.isOk(await heightIs(native), "the base row is one line again");
            assert.isOk(await wvT.waitFor(() => (tree._customRowHeightMap[idx()] === expected(3) && !(kidRow(0) in tree._customRowHeightMap) ? true : null), 6000, 30), "fixed's heights gone");
            set("off");
            assert.isOk(await wvT.waitFor(() => (!Object.keys(tree._customRowHeightMap).length ? true : null), 4000, 20), "no heights");
            assert.lengthOf(jsw.customRowHeights, 0);
            assert.closeTo(listHeight(), count() * native, 0.6, "the scroll height");
            assert.isFalse(Object.prototype.hasOwnProperty.call(jsw, "invalidate"), "no wrap left on the list");
            // An arrow function, so always the tree's own property: read the wrap table.
            assert.notOk(tree._wvWraps && tree._wvWraps.updateFontSize, "nor on the tree");
        });
    });

    // MJT 2026-11-06, on Creator and Publication cut off in rows with room to spare:
    // "The wrapping was nicely implemented in Mendeley Desktop [...] There, all the
    // columns wrap. There was top alignement."
    describe("the other columns", function () {
        let shortTitle, longTitle, withKid, kid;
        const NAME = "Wavelength ".repeat(10).trim();
        const VAR = "--wv-tl-lines";
        const make = async (title) => {
            const it = /** @type {any} */ (new Zotero.Item("book"));
            it.libraryID = Zotero.Libraries.userLibraryID;
            it.setField("title", title);
            it.setCreators([{ lastName: NAME, firstName: "", fieldMode: 1, creatorType: "author" }]);
            await it.saveTx({ skipSelect: true });
            return it;
        };
        const idx = (it) => ZP.itemsView.getRowIndexByID(it.treeViewID);
        const cell = (it, cls) => { const r = rowOf(idx(it)); return r && r.querySelector(".cell." + cls); };
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(win.getComputedStyle(el).lineHeight));
        const topIn = (el) => el.getBoundingClientRect().top - el.closest(".row").getBoundingClientRect().top;
        const pad = () => (Zotero.Prefs.get("uiDensity") === "comfortable" ? 11 : 5) / 2;
        const show = async (it) => {
            await wvT.waitFor(() => (idx(it) !== false ? true : null), 4000, 20);
            tree.scrollToRow(idx(it));
            await wvT.sleep(120);
        };

        before(async function () {
            shortTitle = await make("0 wv-title-lines wide short");
            longTitle = await make("0 wv-title-lines wide " + LONG);
            withKid = await make("0 wv-title-lines wide kid");
            kid = /** @type {any} */ (new Zotero.Item("note"));
            kid.libraryID = Zotero.Libraries.userLibraryID;
            kid.parentID = withKid.id;
            kid.setNote("<p>a child</p>");
            await kid.saveTx({ skipSelect: true });
        });

        afterEach(function () { tree.scrollToRow(0); });

        after(async function () { await wvT.erase(kid, withKid, shortTitle, longTitle); });

        // MJT 2026-11-06, on the arrow and the icon stacked up at the top of a tall
        // row: "Try putting the icon on the left and the expand arrow centered
        // vertically", then on a build with the two swapped: "You have exchanged the 2",
        // and on one with the arrow alone at the row's centre: "The icons should be
        // vertically aligned [...] vertically centered, same as the arrow". Zotero's
        // order, arrow and icon level at the row's centre, the title at its top.
        it("the arrow keeps its place before the icon, both centred in the row, and it still opens the item", async function () {
            set("fixed", 4);
            await heightIs(expected(4));
            await show(withKid);
            const row = rowOf(idx(withKid));
            const arrow = row.querySelector(".cell.title .twisty");
            assert.isOk(arrow, "the arrow");
            const r = row.getBoundingClientRect(), a = arrow.getBoundingClientRect();
            const icon = row.querySelector(".cell.title .item-icon").getBoundingClientRect();
            const text = titleText(row).getBoundingClientRect();
            assert.isBelow(a.left, icon.left, "the arrow on the left of the icon");
            assert.isBelow(icon.left, text.left, "the icon before the title");
            assert.closeTo(a.top + a.height / 2 - r.top, r.height / 2, 1, "the arrow centred in the row");
            assert.closeTo(a.top + a.height / 2, icon.top + icon.height / 2, 0.3, "the icon level with the arrow");
            assert.closeTo(text.top - r.top, pad(), 1.5, "the title stays at the top");
            arrow.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true, button: 0 }));
            try {
                assert.isOk(await wvT.waitFor(() => (ZP.itemsView.getRowIndexByID(kid.treeViewID) !== false ? true : null), 3000, 20), "opened by the arrow");
            }
            finally { if (ZP.itemsView.getRowIndexByID(kid.treeViewID) !== false) await ZP.itemsView.toggleOpenState(idx(withKid)); }
        });

        it("a row on one line reads as Zotero's, and a row with no arrow keeps its title in line", async function () {
            set("adaptive", 3);
            await show(withKid);
            await wvT.sleep(150);
            const row = rowOf(idx(withKid));
            const a = row.querySelector(".cell.title .twisty").getBoundingClientRect();
            const r = row.getBoundingClientRect();
            assert.closeTo(a.top + a.height / 2 - r.top, r.height / 2, 1, "centred");
            const plain = rowOf(idx(shortTitle));
            if (plain) assert.closeTo(titleText(plain).getBoundingClientRect().left, titleText(row).getBoundingClientRect().left, 0.6, "the titles in line");
        });

        it("fixed: a long creator wraps and stops at the number, in a row of the same height", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await show(shortTitle);
            const c = cell(shortTitle, "firstCreator");
            assert.isOk(c, "the Creator column is on");
            assert.strictEqual(win.getComputedStyle(c).whiteSpace, "normal");
            assert.strictEqual(lines(c), 3, "three lines of the name");
            assert.strictEqual(rowOf(idx(shortTitle)).getBoundingClientRect().height, expected(3), "the row");
        });

        it("the icon and count columns keep their own layout", async function () {
            set("fixed", 3);
            await heightIs(expected(3));
            await show(shortTitle);
            const icon = cell(shortTitle, "hasAttachment");
            assert.isOk(icon, "the attachment column is on");
            assert.strictEqual(win.getComputedStyle(icon).display, "flex");
            // Zotero makes this cell the row's whole height and centres its icon inside.
            // One line tall, the same centring puts the icon on the first line, whatever
            // its size: 14 px at the top of a 17 px line sat 1.67 px high (MJT 2026-11-06).
            const cs = win.getComputedStyle(icon);
            assert.strictEqual(cs.alignItems, "center");
            assert.closeTo(icon.getBoundingClientRect().height, parseFloat(cs.lineHeight), 0.6, "one line tall");
            assert.closeTo(topIn(icon), pad(), 1, "at the top of the row");
            for (const c of rowOf(idx(shortTitle)).querySelectorAll(".cell.fixed-width, .cell.wv-count-cell")) {
                assert.strictEqual(win.getComputedStyle(c).whiteSpace, "nowrap", c.className);
            }
        });

        it("a count in the narrow Notes column is not broken into digits", async function () {
            const col = tree._getColumns().find((c) => c.dataKey === "numNotes");
            const hidden = col.hidden;
            if (hidden) tree._columns.toggleHidden(tree._getColumns().indexOf(col));
            try {
                set("fixed", 3);
                await heightIs(expected(3));
                await wvT.sleep(120);
                await show(shortTitle);
                const c = cell(shortTitle, "numNotes");
                assert.isOk(c, "the Notes column is on");
                assert.strictEqual(win.getComputedStyle(c).whiteSpace, "nowrap");
            }
            finally {
                if (hidden) tree._columns.toggleHidden(tree._getColumns().indexOf(col));
            }
        });

        it("fixed: everything sits at the top of the row, a short title too", async function () {
            set("fixed", 4);
            await heightIs(expected(4));
            await show(shortTitle);
            const row = rowOf(idx(shortTitle));
            assert.closeTo(topIn(titleText(row)), pad(), 1.5, "the title");
            assert.closeTo(topIn(cell(shortTitle, "firstCreator")), pad(), 1.5, "the creator");
        });

        it("the top follows the density", async function () {
            const d = Zotero.Prefs.get("uiDensity");
            set("fixed", 3);
            await heightIs(expected(3));
            try {
                Zotero.Prefs.set("uiDensity", d === "comfortable" ? "compact" : "comfortable");
                assert.isOk(await heightIs(expected(3)), "the new row height");
                await show(shortTitle);
                assert.closeTo(topIn(cell(shortTitle, "firstCreator")), pad(), 1.5);
            }
            finally {
                Zotero.Prefs.set("uiDensity", d);
                await heightIs(expected(3));
            }
        });

        it("adaptive: they wrap inside the height the title gave the row", async function () {
            set("adaptive", 3);
            await show(longTitle);
            assert.isOk(await wvT.waitFor(() => (tree._customRowHeightMap[idx(longTitle)] === expected(3) ? true : null), 6000, 30), "the long title's row");
            await wvT.sleep(150);
            assert.strictEqual(lines(cell(longTitle, "firstCreator")), 3, "the name takes its row's three lines");
            await show(shortTitle);
            assert.strictEqual(rowOf(idx(shortTitle)).getBoundingClientRect().height, native, "a short title's row stays on one line");
            assert.strictEqual(lines(cell(shortTitle, "firstCreator")), 1, "and so does the name in it");
        });

        it("back to one line: no mark left on the rows, Zotero's alignment back", async function () {
            set("adaptive", 3);
            await show(longTitle);
            assert.isOk(await wvT.waitFor(() => (rowOf(idx(longTitle)).style.getPropertyValue(VAR) === "3" ? true : null), 6000, 30), "the row's lines");
            const el = rowOf(idx(longTitle));
            set("off");
            assert.isOk(await wvT.waitFor(() => (win.document.getElementById("wv-title-lines-style") ? null : true), 4000, 20), "the sheet");
            await wvT.waitFor(() => (Object.keys(tree._customRowHeightMap).length ? null : true), 4000, 20);
            assert.strictEqual(el.style.getPropertyValue(VAR), "", "no mark");
            assert.strictEqual(win.getComputedStyle(el).alignItems, "center", "Zotero's alignment");
            assert.strictEqual(win.getComputedStyle(cell(longTitle, "firstCreator")).whiteSpace, "nowrap", "one line");
        });
    });

    it("the plugin's teardown restores the rows with the setting still on", async function () {
        set("fixed", 2);
        await heightIs(expected(2));
        wv._wvRemoveTitleLines(win);
        assert.strictEqual(tree._rowHeight, native);
        assert.isNull(win.document.getElementById("wv-title-lines-style"));
        wv._wvApplyTitleLines(win);
        assert.strictEqual(tree._rowHeight, expected(2), "and it comes back");
    });
});
