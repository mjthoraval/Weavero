/* global describe, it, before, after, assert, Zotero */

// The Bookmarks pane in the collections column (bookmarks-pane.ts; MJT 2026-11-27, "All ok. You can go.",
// work/collections-organization-2026-11-27.md, recommendation 2): the bookmarks shown ABOVE the collections
// tree, a splitter between them, foldable to its header, a "Bookmarks only" switch that hides the tree; folders
// open in place; a click goes where the dropdown's click goes; items dropped on a collection's bookmark go into
// that collection; per window, saved with the window's session record. The dropdown stays.
//
// The runner's own bookmarks.json holds this spec's entries while it runs (the store is put back after);
// the collections and the item it makes are erased at the end. Nothing else in the library changes.

describe("Weavero — the Bookmarks pane in the collections column", function () {
    this.timeout(90000);
    let wv, win, doc, cv, L, lib;
    let A, B, H, item;
    let savedTree = null, paneFound = null;
    const P = "WVBMP ";
    const libName = () => String(/** @type {any} */ (Zotero.Libraries.get(L)).name);

    const colPane = () => lib.wvViewEl(doc, "zotero-collections-pane");
    const treeBox = () => lib.wvViewEl(doc, "zotero-collections-tree-container");
    const pane = () => { const c = colPane(); return c ? c.querySelector(":scope > .wv-bmpane") : null; };
    const splitter = () => { const c = colPane(); return c ? c.querySelector(":scope > .wv-bmpane-splitter") : null; };
    const rows = () => { const p = pane(); return p ? Array.from(p.querySelectorAll(".wv-bmp-row")) : []; };
    const rowOf = (id) => rows().find(r => r.getAttribute("data-wv-bm-id") === id) || null;
    const shown = (el) => !!el && win.getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    const settle = async (pred, what, ms = 8000) => {
        const ok = await wvT.waitFor(() => { try { return pred() || null; } catch (e) { return null; } }, ms, 50);
        assert.ok(ok, what + " (rows: " + JSON.stringify(rows().map(r => r.getAttribute("data-wv-bm-id"))) + ")");
    };
    const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const focusedID = () => { const r = cv.getRow(cv.selection.focused); return r ? r.id : null; };
    const fixture = () => [
        { id: "wvbmp-f", type: "folder", name: P + "Folder", expanded: true, created: new Date().toISOString(), children: [
            { id: "wvbmp-b", type: "collection", libraryID: L, collectionKey: B.key, label: P + "Beta", created: new Date().toISOString() },
        ] },
        { id: "wvbmp-a", type: "collection", libraryID: L, collectionKey: A.key, label: P + "Alpha", created: new Date().toISOString() },
        { id: "wvbmp-u", type: "treerow", rowID: "U" + L, libraryID: L, label: P + "Unfiled", originalLabel: P + "Unfiled", created: new Date().toISOString() },
        { id: "wvbmp-m", type: "collection", libraryID: L, collectionKey: "WVBMPXX1", label: P + "Gone", created: new Date().toISOString() },
        { id: "wvbmp-h", type: "collection", libraryID: L, collectionKey: H.key, label: P + "Eta", created: new Date().toISOString() },
    ];

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const m of ["_wvBmpOn", "_wvBmpWire", "_wvBmpRender", "_wvBmpCapture", "_wvBmpRestore", "_wvBmpDragOver", "_wvBmpDrop",
            "_wvBmpTeardown", "_bmActivateBookmark", "_bmIconInfo", "_bmInit", "_bmPersistSilent"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        cv = win.ZoteroPane.collectionsView;
        L = Zotero.Libraries.userLibraryID;
        assert.isTrue(wv._wvBmpOn(), "fixture: on in a pre-release build (devOnly)");
        A = new Zotero.Collection({ libraryID: L, name: P + "Alpha" }); await A.saveTx();
        B = new Zotero.Collection({ libraryID: L, name: P + "Beta" }); await B.saveTx();
        H = new Zotero.Collection({ libraryID: L, name: P + "Eta" }); await H.saveTx();
        item = await wvT.createItem("book", { title: P + "Dropped" });
        await wv._bmInit();
        savedTree = JSON.parse(JSON.stringify(wv._bmDoc.bookmarks));
        wv._bmDoc.bookmarks.splice(0, wv._bmDoc.bookmarks.length, ...fixture());
        await wv._bmPersistSilent();
        // The suite keeps the pane folded (000-helpers.spec.js root hook): put back after.
        paneFound = wv._wvBmpCapture(win) || null;
        wv._wvBmpRestore(win, null);
        wv._wvBmpRender(win);
        await cv.selectLibrary(L);
    });

    after(async function () {
        try { wv._wvBmpRestore(win, paneFound); } catch (e) {}
        try { if (savedTree) { wv._bmDoc.bookmarks.splice(0, wv._bmDoc.bookmarks.length, ...savedTree); await wv._bmPersistSilent(); } } catch (e) {}
        try { wv._wvUndoClear(wv._wvBmUndoScope("lib")); } catch (e) {}
        for (const o of [item, H, B, A]) { try { if (o) await o.eraseTx(); } catch (e) {} }
        try { await cv.selectLibrary(L); } catch (e) {}
    });

    it("the pane sits above the collections tree, a splitter between them, with its header: title, fold twisty, Bookmarks only", async () => {
        await settle(() => pane() && rows().length >= 4, "the pane and its rows");
        const p = pane(), sp = splitter(), tb = treeBox();
        assert.ok(p && sp && tb, "pane, splitter, tree container");
        assert.strictEqual(p.nextElementSibling, sp, "the splitter right under the pane");
        assert.strictEqual(sp.nextElementSibling, tb, "the tree right under the splitter");
        assert.equal(sp.localName, "splitter", "a XUL splitter, as the Tag Selector's");
        const head = p.querySelector(".wv-bmp-head");
        assert.ok(head, "a header");
        assert.equal(head.querySelector(".wv-bmp-title").textContent, lib.wvStr("weavero-bm-title"), "titled Bookmarks");
        assert.ok(head.querySelector(".wv-bmp-fold"), "a fold twisty");
        assert.ok(head.querySelector(".wv-bmp-only"), "a Bookmarks only switch");
        assert.isAbove(tb.getBoundingClientRect().top, p.getBoundingClientRect().top, "above the tree on screen");
    });

    it("its rows: the store's tree at the top level, in its order, each with the dropdown's icon; a missing target marked", () => {
        const top = rows().filter(r => r.getAttribute("data-wv-level") === "0").map(r => r.getAttribute("data-wv-bm-id"));
        assert.deepEqual(top, ["wvbmp-f", "wvbmp-a", "wvbmp-u", "wvbmp-m", "wvbmp-h"]);
        for (const bm of wv._bmDoc.bookmarks.filter(b => b.type !== "folder")) {
            const img = rowOf(bm.id).querySelector("img.wv-bmp-icon");
            assert.equal(img.getAttribute("src"), wv._bmIconInfo(bm, win).image, bm.id + ": the dropdown's icon");
        }
        assert.isTrue(rowOf("wvbmp-m").classList.contains("wv-bmp-missing"), "the orphan marked");
        assert.isFalse(rowOf("wvbmp-a").classList.contains("wv-bmp-missing"));
        assert.isTrue(rowOf("wvbmp-f").classList.contains("wv-bmp-folder"), "a folder row");
    });

    it("a folder opens in place, its bookmarks indented under it, and closes again", async () => {
        assert.isNull(rowOf("wvbmp-b"), "closed in a fresh window, whatever the store says");
        click(rowOf("wvbmp-f"));
        await settle(() => rowOf("wvbmp-b"), "open: its bookmark shown");
        const all = rows().map(r => r.getAttribute("data-wv-bm-id"));
        assert.equal(all.indexOf("wvbmp-b"), all.indexOf("wvbmp-f") + 1, "right under its folder");
        assert.equal(rowOf("wvbmp-b").getAttribute("data-wv-level"), "1");
        const ind = (id) => parseFloat(win.getComputedStyle(rowOf(id)).paddingInlineStart);
        assert.isAbove(ind("wvbmp-b"), ind("wvbmp-a"), "indented");
        assert.isTrue(rowOf("wvbmp-f").querySelector(".wv-bmp-twisty").classList.contains("open"), "its twisty open");
        click(rowOf("wvbmp-f").querySelector(".wv-bmp-twisty"));
        await settle(() => !rowOf("wvbmp-b"), "closed by its twisty");
    });

    it("a click on a collection's bookmark selects the collection, as in the dropdown; an orphan's click changes nothing", async () => {
        await cv.selectLibrary(L);
        click(rowOf("wvbmp-a"));
        await settle(() => focusedID() === "C" + A.id, "Alpha selected in the tree");
        click(rowOf("wvbmp-u"));
        await settle(() => focusedID() === "U" + L, "a tree row's bookmark: Unfiled Items selected");
        click(rowOf("wvbmp-m"));
        await wvT.sleep(400);
        assert.equal(focusedID(), "U" + L, "the orphan: nothing selected");
    });

    it("fold and unfold: folded, the header alone and no splitter; open again, the rows back", async () => {
        const fold = () => pane().querySelector(".wv-bmp-head .wv-bmp-fold");
        const list = () => pane().querySelector(".wv-bmp-list");
        assert.isTrue(shown(list()), "open at first");
        click(fold());
        await settle(() => !shown(list()), "folded: no list");
        assert.equal(colPane().getAttribute("data-wv-bmp-mode"), "folded");
        assert.isFalse(shown(splitter()), "no splitter while folded");
        const head = pane().querySelector(".wv-bmp-head");
        assert.approximately(pane().getBoundingClientRect().height, head.getBoundingClientRect().height, 2, "the header's height");
        assert.isTrue(shown(treeBox()), "the tree stays");
        click(fold());
        await settle(() => shown(list()) && shown(splitter()), "unfolded");
    });

    it("Bookmarks only hides the collections tree, the pane taking the column; off, the tree comes back", async () => {
        const only = () => pane().querySelector(".wv-bmp-head .wv-bmp-only");
        const h0 = pane().getBoundingClientRect().height;
        click(only());
        await settle(() => !shown(treeBox()), "the tree hidden");
        assert.equal(colPane().getAttribute("data-wv-bmp-mode"), "only");
        assert.isFalse(shown(splitter()), "no splitter");
        assert.isAbove(pane().getBoundingClientRect().height, h0, "the pane taller");
        assert.equal(only().getAttribute("aria-pressed"), "true");
        click(only());
        await settle(() => shown(treeBox()) && shown(splitter()), "the tree back");
        assert.equal(colPane().getAttribute("data-wv-bmp-mode"), "open");
        assert.equal(only().getAttribute("aria-pressed"), "false");
        assert.approximately(pane().getBoundingClientRect().height, h0, 2, "its height as before");
    });

    it("items dropped on a collection's bookmark go into that collection; other bookmarks refuse them", async () => {
        const fake = (types, data, rowEl) => {
            const r = rowEl.getBoundingClientRect();
            return {
                dataTransfer: { types, getData: (t) => (data[t] || ""), dropEffect: "", effectAllowed: "all", mozItemCount: 1 },
                clientY: r.top + r.height / 2, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
                currentTarget: rowEl, target: rowEl, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
            };
        };
        const ids = { "zotero/item": String(item.id) };
        // A drag from the items list: Zotero notes the collection row it comes from
        // (itemTree onDragStart), which its drop checks read.
        await cv.selectLibrary(L);
        const DD = /** @type {any} */ (Zotero).DragDrop;
        DD.currentDragSource = cv.getRow(cv.selection.focused);
        const over = fake(["zotero/item"], ids, rowOf("wvbmp-a"));
        assert.isTrue(wv._wvBmpDragOver(rowOf("wvbmp-a"), over), "over a collection's bookmark: taken");
        assert.isTrue(!!over.defaultPrevented);
        assert.notEqual(over.dataTransfer.dropEffect, "none");
        const off = fake(["zotero/item"], ids, rowOf("wvbmp-u"));
        wv._wvBmpDragOver(rowOf("wvbmp-u"), off);
        assert.isNotTrue(off.dataTransfer.dropEffect === "copy" || off.dataTransfer.dropEffect === "move", "over Unfiled's bookmark: no drop");
        try {
            const ok = await wv._wvBmpDrop(rowOf("wvbmp-a"), fake(["zotero/item"], ids, rowOf("wvbmp-a")));
            assert.isTrue(ok, "dropped");
        }
        finally { DD.currentDragSource = null; }
        await settle(() => A.hasItem(item.id), "the item in Alpha");
        assert.isFalse(B.hasItem(item.id), "and nowhere else");
    });

    it("a bookmark dragged within the pane moves as in the dropdown: before a row, into a folder", async () => {
        const fake = (rowEl, where) => {
            const r = rowEl.getBoundingClientRect();
            const y = where === "before" ? r.top + 1 : where === "after" ? r.bottom - 1 : r.top + r.height / 2;
            const data = { "weavero/bookmark": "wvbmp-u", "text/plain": "wvbmp-u" };
            return {
                dataTransfer: { types: ["weavero/bookmark", "text/plain"], getData: (t) => (data[t] || ""), dropEffect: "", effectAllowed: "move" },
                clientY: y, currentTarget: rowEl, target: rowEl, preventDefault() {}, stopPropagation() {},
            };
        };
        assert.isTrue(await wv._wvBmpDrop(rowOf("wvbmp-a"), fake(rowOf("wvbmp-a"), "before")), "dropped before Alpha");
        await settle(() => rows().filter(r => r.getAttribute("data-wv-level") === "0").map(r => r.getAttribute("data-wv-bm-id")).join() === "wvbmp-f,wvbmp-u,wvbmp-a,wvbmp-m,wvbmp-h", "Unfiled before Alpha");
        assert.deepEqual(wv._bmDoc.bookmarks.map(b => b.id), ["wvbmp-f", "wvbmp-u", "wvbmp-a", "wvbmp-m", "wvbmp-h"], "the store's order");
        assert.isTrue(await wv._wvBmpDrop(rowOf("wvbmp-f"), fake(rowOf("wvbmp-f"), "into")), "dropped into the folder");
        await settle(() => rowOf("wvbmp-u") && rowOf("wvbmp-u").getAttribute("data-wv-level") === "1", "inside the folder, the folder opened");
        assert.deepEqual(wv._bmDoc.bookmarks[0].children.map(b => b.id), ["wvbmp-b", "wvbmp-u"]);
    });

    it("a right-click offers the dropdown's menus: a bookmark's, a folder's", async () => {
        const menuAfter = async (el) => {
            el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 10, screenY: 10 }));
            const m = await wvT.waitFor(() => doc.getElementById("wv-bm-row-menu"), 4000, 50);
            assert.ok(m, "a menu");
            const ids = Array.from(m.querySelectorAll(":scope > menuitem, :scope > menu")).map(x => x.getAttribute("data-l10n-id") || x.getAttribute("label"));
            try { m.hidePopup(); } catch (e) {}
            try { m.remove(); } catch (e) {}
            return ids;
        };
        const row = await menuAfter(rowOf("wvbmp-a"));
        for (const id of ["weavero-menu-bm-edit", "weavero-menu-bm-delete", "weavero-menu-bm-new-folder"]) assert.include(row, id, "a bookmark's menu: " + id);
        const folder = await menuAfter(rowOf("wvbmp-f"));
        for (const id of ["weavero-menu-bm-rename-folder", "weavero-menu-bm-new-subfolder", "weavero-menu-bm-delete-folder"]) assert.include(folder, id, "a folder's menu: " + id);
    });

    it("the window's state goes into its session record and its saved state, and comes back on restore", async () => {
        // The folder (closed again above) and the switches at their defaults: nothing to save.
        if (rowOf("wvbmp-b")) click(rowOf("wvbmp-f"));
        await settle(() => !rowOf("wvbmp-b"), "fixture: folder closed");
        assert.isUndefined(wv._wvBmpCapture(win), "defaults: nothing captured");
        click(pane().querySelector(".wv-bmp-head .wv-bmp-only"));
        if (!rowOf("wvbmp-b")) click(rowOf("wvbmp-f"));
        await settle(() => rowOf("wvbmp-b") && !shown(treeBox()), "fixture: only on, the folder open");
        const cap = wv._wvBmpCapture(win);
        assert.deepInclude(cap, { only: true, open: ["wvbmp-f"] }, JSON.stringify(cap));
        assert.deepEqual(wv._wvTabSessionCaptureMainState(win).bmPane, cap, "in the session record");
        assert.deepEqual(wv._wvWinStateCapture(win).bmPane, cap, "in the window's saved state");
        await wv._wvTabSessionApplyMainState(win, {});
        await settle(() => shown(treeBox()) && !rowOf("wvbmp-b"), "a session without one: the defaults (tree shown, folders closed)");
        assert.isUndefined(wv._wvBmpCapture(win));
        await wv._wvTabSessionApplyMainState(win, { bmPane: cap });
        await settle(() => !shown(treeBox()) && rowOf("wvbmp-b"), "the session's state back");
        wv._wvBmpRestore(win, { folded: true, h: 140 });
        await settle(() => !shown(pane().querySelector(".wv-bmp-list")) && shown(treeBox()), "folded, the tree back");
        wv._wvBmpRestore(win, { h: 140 });
        await settle(() => Math.abs(pane().getBoundingClientRect().height - 140) < 2, "its height: " + pane().getBoundingClientRect().height);
        assert.deepEqual(wv._wvBmpCapture(win), { h: 140 });
        wv._wvBmpRestore(win, null);
    });

    it("the setting off: no pane, nothing left in the column; on again: back", async () => {
        await wvT.withPref("weavero.collectionsBookmarksPane", false, async () => {
            await settle(() => !pane() && !splitter(), "gone");
            assert.isFalse(colPane().hasAttribute("data-wv-bmp-mode"), "no mode on the column");
            assert.isNull(doc.getElementById("wv-bmpane-style"), "no sheet");
            assert.isNull(doc.getElementById("wv-bookmarks-style"), "nor the dropdown's it borrowed (the dropdown closed)");
            assert.isTrue(shown(treeBox()), "the tree shown");
        });
        await settle(() => pane() && splitter() && rows().length, "back");
    });

    it("teardown leaves no element, sheet, mode or listener; wiring again rebuilds it", async () => {
        click(pane().querySelector(".wv-bmp-head .wv-bmp-only"));
        await settle(() => !shown(treeBox()), "fixture: only on");
        wv._wvBmpTeardown();
        assert.isNull(pane(), "no pane");
        assert.isNull(splitter(), "no splitter");
        assert.lengthOf(doc.querySelectorAll(".wv-bmpane, .wv-bmpane-splitter, [id^='wv-bmpane']"), 0, "nothing of it in the document");
        assert.isFalse(colPane().hasAttribute("data-wv-bmp-mode"), "no mode");
        assert.isTrue(shown(treeBox()), "the tree shown");
        wv._wvBmpWire(win);
        await settle(() => pane() && rows().length, "rebuilt");
        assert.isFalse(shown(treeBox()), "with the window's state (only)");
        wv._wvBmpRestore(win, null);
        await settle(() => shown(treeBox()), "defaults");
    });

    // ---- The dropdown's tools in the pane (MJT 2026-11-27: "The same bookmarks button features
    // should be brought also to the in-pane bookmarks"): ONE implementation, bookmarks.ts
    // _bmRenderTools / _bmListView, called with the pane as its surface.

    const tools = () => pane().querySelector(":scope > .wv-bmp-tools");
    const toolBtns = () => Array.from(tools().querySelectorAll(".wv-bm-actions > .wv-bm-iconbtn"));
    const topIDs = () => rows().filter(r => r.getAttribute("data-wv-level") === "0").map(r => r.getAttribute("data-wv-bm-id"));
    const closeMenu = (m) => { try { m.hidePopup(); } catch (e) {} try { m.remove(); } catch (e) {} };

    it("tools: the dropdown's, same icons, tooltips and order (add, new folder, sort, search, filter)", async () => {
        await settle(() => tools() && toolBtns().length === 5, "five tools under the title");
        const sig = (btns) => btns.map(b => b.getAttribute("title") + "|" + (b.querySelector("img") ? b.querySelector("img").getAttribute("src") : ""));
        const mine = sig(toolBtns());
        const btn = doc.getElementById("wv-bookmarks-toolbar-button");
        assert.ok(btn, "fixture: the toolbar button");
        wv._openBookmarksPopup(btn);
        try {
            const theirs = sig(Array.from(doc.querySelectorAll("#wv-bookmarks-inner .wv-bm-actions > .wv-bm-iconbtn")));
            assert.deepEqual(mine, theirs, "the dropdown's buttons");
        }
        finally { wv._bmHidePopup(win); }
        assert.equal(toolBtns()[0].getAttribute("title"), lib.wvStr("weavero-bm-add-bookmarks-tip"));
        assert.equal(toolBtns()[3].getAttribute("title"), lib.wvStr("weavero-bm-search-tip"));
        assert.isTrue(shown(tools()), "shown while the pane is open");
    });

    it("tool +: the dropdown's add menu (pick an item, add a link)", async () => {
        doc.getElementById("wv-bm-row-menu")?.remove();
        click(toolBtns()[0]);
        const m = await wvT.waitFor(() => doc.getElementById("wv-bm-row-menu"), 4000, 50);
        assert.ok(m, "a menu");
        const ids = Array.from(m.querySelectorAll("menuitem")).map(x => x.getAttribute("data-l10n-id") || x.getAttribute("label"));
        closeMenu(m);
        assert.deepEqual(ids, ["weavero-menu-bm-pick-item", "weavero-menu-bm-add-link"]);
    });

    it("tool new folder: asks a name, adds the folder to the store and the pane", async () => {
        const own = Object.prototype.hasOwnProperty.call(wv, "_bmPromptName");
        const orig = wv._bmPromptName;
        wv._bmPromptName = () => P + "New";
        let made = null;
        try {
            click(toolBtns()[1]);
            await settle(() => (made = wv._bmDoc.bookmarks.find(b => b.type === "folder" && b.name === P + "New")) && rowOf(made.id), "the folder in the store and the pane");
        }
        finally {
            if (own) wv._bmPromptName = orig; else delete wv._bmPromptName;
            if (made) { await wv._bmRemove(made.id); try { wv._wvUndoClear(wv._wvBmUndoScope("lib")); } catch (e) {} }
        }
        await settle(() => !made || !rowOf(made.id), "removed again");
    });

    it("tool sort: the dropdown's menu and its shared order; a sort flattens the folders, the triangle reverses it", async () => {
        const PREF = "weavero.readerBmSort.library";
        const had = Zotero.Prefs.get(PREF);
        try {
            doc.getElementById("wv-bm-row-menu")?.remove();
            click(toolBtns()[2]);
            const m = await wvT.waitFor(() => doc.getElementById("wv-bm-row-menu"), 4000, 50);
            assert.ok(m, "a sort menu");
            const ids = Array.from(m.querySelectorAll("menuitem")).map(x => x.getAttribute("data-l10n-id"));
            closeMenu(m);
            assert.includeMembers(ids, ["weavero-menu-bm-sort-manual", "weavero-menu-bm-sort-name", "weavero-menu-bm-sort-date"]);
            // What its "Name" entry runs, with this pane as the surface.
            wv._bmApplyLibrarySort(win, "alpha", "asc", wv._wvBmpSurface(win, pane()));
            const labels = () => rows().map(r => r.querySelector(".wv-bm-label").firstChild.textContent);
            await settle(() => rows().length && !rows().some(r => r.classList.contains("wv-bmp-folder")), "flat: no folder row");
            const asc = labels();
            assert.deepEqual(asc, asc.slice().sort((a, b) => a.localeCompare(b)), "by name");
            assert.equal(wv._wvReaderBmSortMode("library"), "alpha", "the dropdown's order too");
            const sortBtn = toolBtns()[2];
            assert.isTrue(sortBtn.classList.contains("wv-active"), "the button marked");
            click(sortBtn.querySelector(".wv-bm-sortdir"));
            await settle(() => labels().join() === asc.slice().reverse().join(), "the triangle: reversed");
        }
        finally {
            wv._bmApplyLibrarySort(win, "manual", undefined, wv._wvBmpSurface(win, pane()));
            if (had === undefined) Zotero.Prefs.clear(PREF); else Zotero.Prefs.set(PREF, had);
        }
        await settle(() => rows().some(r => r.classList.contains("wv-bmp-folder")), "manual again: the folder back");
    });

    it("tool search: the dropdown's search row; typing filters the list (the field keeps its caret), Escape clears, the button closes it", async () => {
        click(toolBtns()[3]);
        const input = await wvT.waitFor(() => tools().querySelector(".wv-bm-search-input"), 4000, 50);
        assert.ok(input, "the search row");
        input.value = "alpha";
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
        await settle(() => topIDs().join() === "wvbmp-a", "only Alpha");
        assert.strictEqual(tools().querySelector(".wv-bm-search-input"), input, "the field kept (not redrawn)");
        input.value = "wvbmp-nothing-matches";
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
        await settle(() => pane().querySelector(".wv-bmp-none"), "the no-match line");
        assert.include(pane().querySelector(".wv-bmp-none").textContent, "wvbmp-nothing-matches");
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await settle(() => topIDs().length >= 4, "Escape: the whole list back");
        click(toolBtns()[3]);
        await settle(() => !tools().querySelector(".wv-bm-search-input"), "closed");
        assert.equal(wv._bmLibFilterText || "", "", "the dropdown's search untouched");
    });

    it("tool filter: the dropdown's chip popup beside the pane; chips filter the list; the funnel closes it and clears them; the dropdown's chips untouched", async () => {
        const funnel = () => tools().querySelector(".wv-bm-iconbtn:has(.wv-bm-funnel-chev)");
        click(funnel());
        const pop = await wvT.waitFor(() => doc.getElementById("wv-bookmarks-chip-popup"), 4000, 50);
        assert.ok(pop, "the chip popup");
        assert.equal(pop.getAttribute("data-wv-surface"), "pane", "the pane's");
        assert.isTrue(funnel().classList.contains("wv-active"), "the funnel marked");
        // A chip no bookmark carries: nothing left.
        wv._bmChipBagOf(wv._wvBmpFs(win)).tags.add("wvbmp-no-such-tag");
        wv._wvBmpRender(win);
        await settle(() => pane().querySelector(".wv-bmp-none"), "filtered out");
        assert.equal(pane().querySelector(".wv-bmp-none").textContent, lib.wvStr("weavero-bm-filter-no-match"));
        assert.isTrue(funnel().classList.contains("wv-bm-lib-filter-active"), "the funnel's dot");
        assert.isFalse(wv._bmLibChipsActive(), "the dropdown's chips untouched");
        click(funnel());
        await settle(() => !doc.getElementById("wv-bookmarks-chip-popup") && !pane().querySelector(".wv-bmp-none"), "closed, chips cleared, the list back");
        assert.isFalse(wv._bmChipsOnOf(wv._wvBmpFs(win)));
    });

    // ---- What the centre shows (MJT 2026-11-27, "Highlight + top line").

    const current = () => rows().filter(r => r.classList.contains("wv-bmp-current")).map(r => r.getAttribute("data-wv-bm-id"));
    const nowLine = () => pane().querySelector(":scope > .wv-bmp-now");

    it("the rows of what the items list shows take Zotero's selected-row look and follow the selection; a closed folder holding one gets a dot", async () => {
        wv._wvBmpRestore(win, null);
        await cv.selectCollection(A.id);
        await settle(() => current().join() === "wvbmp-a", "Alpha's row: " + JSON.stringify(current()));
        const a = rowOf("wvbmp-a");
        assert.notEqual(win.getComputedStyle(a).backgroundColor, win.getComputedStyle(rowOf("wvbmp-m")).backgroundColor, "drawn");
        await cv.selectLibrary(L);
        await settle(() => !current().length, "My Library (no bookmark): none");
        await cv.selectCollection(B.id);
        await settle(() => rowOf("wvbmp-f").querySelector(".wv-bmp-holds"), "Beta is in the closed folder: its dot");
        click(rowOf("wvbmp-f"));
        await settle(() => current().join() === "wvbmp-b" && !rowOf("wvbmp-f").querySelector(".wv-bmp-holds"), "open: Beta's own row");
        // The same target bookmarked twice: both rows.
        wv._bmDoc.bookmarks.push({ id: "wvbmp-b2", type: "collection", libraryID: L, collectionKey: B.key, label: P + "Beta again", created: new Date().toISOString() });
        await wv._bmPersistSilent();
        await settle(() => current().sort().join() === "wvbmp-b,wvbmp-b2", "both");
        wv._bmDoc.bookmarks.splice(wv._bmDoc.bookmarks.findIndex(b => b.id === "wvbmp-b2"), 1);
        await wv._bmPersistSilent();
        click(rowOf("wvbmp-f"));
        await cv.selectLibrary(L);
    });

    it("\"Now showing\" (Bookmarks only): the target's icon, path and library, a + that bookmarks it; a click gives the tree back; hidden with the tree", async () => {
        const N = new Zotero.Collection({ libraryID: L, name: P + "Nu", parentID: A.id });
        await N.saveTx();
        try {
            await cv.selectCollection(N.id);
            assert.isFalse(shown(nowLine()), "hidden with the tree shown");
            wv._wvBmpSetOnly(win, true);
            await settle(() => shown(nowLine()), "shown in Bookmarks only");
            const name = nowLine().querySelector(".wv-bmp-now-name");
            assert.equal(name.firstChild.textContent, P + "Alpha › " + P + "Nu", "a sub-collection's path");
            assert.equal(name.querySelector(".wv-bm-sublabel").textContent, lib.wvStr("weavero-bm-sublabel-in", { title: libName() }), "its library, as the rows' suffix");
            assert.equal(nowLine().querySelector("img").getAttribute("src"), wv._bmIconInfo({ type: "collection", libraryID: L, collectionKey: N.key }, win).image, "a collection bookmark's icon");
            const add = nowLine().querySelector(".wv-bmp-now-add");
            assert.isFalse(add.hidden, "not bookmarked: its +");
            click(add);
            await settle(() => wv._bmFlatten().some(b => b.type === "collection" && b.collectionKey === N.key), "bookmarked");
            await settle(() => nowLine().querySelector(".wv-bmp-now-add").hidden, "the + gone");
            const nb = wv._bmFlatten().find(b => b.type === "collection" && b.collectionKey === N.key);
            await settle(() => current().includes(nb.id), "its new row marked");
            click(nowLine());
            await settle(() => shown(treeBox()) && !shown(nowLine()), "the tree back, the line gone");
            assert.equal(focusedID(), "C" + N.id, "still selected in the tree");
            await wv._bmRemove(nb.id);
            try { wv._wvUndoClear(wv._wvBmUndoScope("lib")); } catch (e) {}
            // A library: its name, no "in".
            wv._wvBmpSetOnly(win, true);
            await cv.selectLibrary(L);
            await settle(() => shown(nowLine()) && nowLine().querySelector(".wv-bmp-now-name").firstChild.textContent === libName(), "My Library");
            assert.isNull(nowLine().querySelector(".wv-bm-sublabel"), "no \"in\" for a library");
        }
        finally {
            wv._wvBmpRestore(win, null);
            try { await cv.selectLibrary(L); } catch (e) {}
            try { await N.eraseTx(); } catch (e) {}
        }
    });

    it("two windows keep their own: Bookmarks only, the rows marked, the line", async function () {
        this.timeout(120000);
        const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
        // Zotero's own window where it has them (Zotero 11), Weavero's spawn on 10.
        const w2 = await wvT.openMainWindow(30000);
        assert.ok(w2, "a second window");
        try { win.focus(); } catch (e) {}
        try {
            const pane2 = () => { const c = lib.wvViewEl(w2.document, "zotero-collections-pane"); return c ? c.querySelector(":scope > .wv-bmpane") : null; };
            const ok = await wvT.waitFor(() => w2.document.readyState === "complete" && w2.ZoteroPane && w2.ZoteroPane.itemsView && w2.ZoteroPane.collectionsView && pane2() && pane2().querySelector(".wv-bmp-row"), 30000, 150);
            assert.ok(ok, "its pane");
            const cv2 = w2.ZoteroPane.collectionsView;
            await cv.selectCollection(A.id);
            await cv2.selectLibrary(L);
            wv._wvBmpSetOnly(w2, true);
            const colPane2 = lib.wvViewEl(w2.document, "zotero-collections-pane");
            await settle(() => colPane2.getAttribute("data-wv-bmp-mode") === "only", "the second window: Bookmarks only");
            assert.equal(colPane().getAttribute("data-wv-bmp-mode"), "open", "the first: its own");
            await settle(() => current().join() === "wvbmp-a", "the first window marks Alpha");
            const cur2 = Array.from(pane2().querySelectorAll(".wv-bmp-row.wv-bmp-current")).map(r => r.getAttribute("data-wv-bm-id"));
            assert.deepEqual(cur2, [], "the second shows My Library: nothing marked there");
            const line2 = pane2().querySelector(":scope > .wv-bmp-now");
            assert.equal(line2.getAttribute("data-wv-shown"), "true", "its line names what it shows");
            assert.equal(line2.querySelector(".wv-bmp-now-name").firstChild.textContent, libName());
            assert.isFalse(shown(nowLine()), "none in the first (its tree is shown)");
            assert.isUndefined(wv._wvBmpCapture(win), "the first window's state untouched");
            assert.deepEqual(wv._wvBmpCapture(w2), { only: true });
        }
        finally {
            try { w2.close(); } catch (e) {}
            for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await sleep(100);
            try { win.focus(); } catch (e) {}
            await sleep(500);
            try { await cv.selectLibrary(L); } catch (e) {}
        }
    });
});
