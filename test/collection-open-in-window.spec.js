/* global describe, it, before, after, assert, Zotero */

// A collection, library or saved search opens in a NEW main window from the
// collections context menu ("Open in New Window") or with a middle-click, and
// the collection the user was in stays selected (v0.20.2, MJT 2026-09-22).
//
// Zotero's tree selects the right-clicked row on mousedown (reloading the
// items list) and its menu items act on the selection; Weavero pre-empts that
// and selects the row silently -- highlight, no select event -- so the list
// stays; a dismissed menu restores the previous selection silently, one of
// Zotero's actions commits it. Untrusted synthetic mouse events never reach
// chrome listeners, so the wired handlers are called directly with stand-in
// events; the menu entry is exercised through a real popup; the window
// landing through a real window.

describe("Weavero — open a collection in a new window; right-click keeps the selection", () => {
    let wv, win, doc, cv, coll, coll2, search;
    const waitFor = async (fn, ms, what) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await new Promise(r => win.setTimeout(r, 50)); }
        throw new Error("timeout: " + what);
    };
    const selectedID = () => { const r = cv.getRow(cv.selection.focused); return r ? r.id : null; };
    const rowElFor = (id) => {
        for (let i = 0; i < cv.rowCount; i++) if (cv.getRow(i).id === id) return doc.getElementById("collection-tree-row-" + i);
        return null;
    };
    const withStub = async (body) => {
        const name = "_wvOpenEmptyMainWindow";
        const own = Object.prototype.hasOwnProperty.call(wv, name), orig = wv[name], calls = [];
        wv[name] = function () { calls.push(wv._wvPendingDevWindowSelect); wv._wvPendingDevWindow = true; };
        try { await body(calls); }
        finally { if (own) wv[name] = orig; else delete wv[name]; wv._wvPendingDevWindowSelect = null; wv._wvPendingDevWindow = false; }
    };
    const evt = (type, extra) => Object.assign({ type, shiftKey: false, button: 0, ctrlKey: false, metaKey: false, altKey: false, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } }, extra);
    let savedPref;

    before(async function () {
        this.timeout(20000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOpenRowInNewMainWindow !== "function") this.skip();
        win = Zotero.getMainWindow(); doc = win.document; cv = win.ZoteroPane.collectionsView;
        if (!doc._wvCollTreeGestures) this.skip();
        savedPref = Zotero.Prefs.get("weavero.newMainWindow");
        Zotero.Prefs.set("weavero.newMainWindow", true);
        coll = new Zotero.Collection(); coll.name = "wv-open-in-window-" + Date.now();
        await coll.saveTx();
        coll2 = new Zotero.Collection(); coll2.name = "wv-open-in-window-2-" + Date.now();
        await coll2.saveTx();
        search = new Zotero.Search(); search.name = "wv-open-in-window-search-" + Date.now(); search.libraryID = Zotero.Libraries.userLibraryID;
        search.addCondition("title", "contains", "wv-no-such-title-" + Date.now());
        await search.saveTx();
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        await waitFor(() => rowElFor("C" + coll.id) && rowElFor("C" + coll2.id), 5000, "the collections' rows rendered");
    });

    after(async () => {
        try { await cv.selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {}
        try { if (coll) await coll.eraseTx(); } catch (e) {}
        try { if (coll2) await coll2.eraseTx(); } catch (e) {}
        try { if (search) await search.eraseTx(); } catch (e) {}
        Zotero.Prefs.set("weavero.newMainWindow", savedPref === undefined ? true : !!savedPref);
    });

    it("a right-click highlights the row without touching the items list; dismissed -> back, acted -> committed", async function () {
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const rowEl = rowElFor("C" + coll.id), LIB = "L" + Zotero.Libraries.userLibraryID, C = "C" + coll.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        await waitFor(() => listRows() === LIB, 5000, "items list on My Library");
        assert.strictEqual(selectedID(), LIB, "start on My Library");
        // right mousedown: silent context selection, Zotero's handler pre-empted
        const md = evt("mousedown", { button: 2, target: rowEl });
        g.onRightDown(md);
        assert.strictEqual(md.stopped, 1, "Zotero's mousedown selection pre-empted");
        // the tree gets focus at mousedown as with Zotero's own handler (its focus() is a setTimeout;
        // only observable while the window has focus)
        await new Promise(r => win.setTimeout(r, 30));
        if (doc.hasFocus()) assert.ok(doc.activeElement && doc.getElementById("collection-tree").contains(doc.activeElement), "the tree got focus at mousedown");
        assert.strictEqual(selectedID(), C, "context row selected (state, for Zotero's menu actions)");
        assert.strictEqual(rowEl.classList.contains("selected"), false, "but NOT repainted: the visible selection stays");
        assert.strictEqual(rowElFor(LIB).classList.contains("selected"), true, "My Library still looks selected");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), true, "dashed cue on the target row");
        await new Promise(r => win.setTimeout(r, 300));
        assert.strictEqual(listRows(), LIB, "items list untouched");
        // a re-render from the moved state (Zotero's tree does this around the menu) is painted back
        cv.tree.invalidateRow(cv.getRowIndexByID(C)); cv.tree.invalidateRow(cv.getRowIndexByID(LIB));
        await new Promise(r => win.setTimeout(r, 100));
        assert.strictEqual(rowEl.classList.contains("selected"), false, "re-rendered context row still not highlighted");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), true, "cue survives the re-render");
        assert.strictEqual(rowElFor(LIB).classList.contains("selected"), true, "My Library still highlighted after the re-render");
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        await waitFor(() => selectedID() === LIB, 2000, "previous selection restored");
        await new Promise(r => win.setTimeout(r, 300));
        assert.strictEqual(listRows(), LIB, "still no reload");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), false, "cue gone");
        assert.strictEqual(rowEl.classList.contains("selected"), false, "never highlighted");
        // one of Zotero's actions, in the REAL order (popup hidden first, the command a task later):
        // the context is KEPT for the action -- no focusing, no list change -- until the action
        // itself selects something for real (Zotero selects a collection it just created)
        const C2 = "C" + coll2.id;
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        g.onCommand({ target: doc.createXULElement("menuitem") });   // any of Zotero's items, 2 ms later
        assert.strictEqual(selectedID(), C, "the handler that runs next reads the context row");
        assert.ok(doc._wvCollPending && !doc._wvCollPending.timer, "pending with no restore timer under the action");
        await new Promise(r => win.setTimeout(r, 400));
        assert.strictEqual(listRows(), LIB, "no list change while the action runs");
        assert.strictEqual(rowElFor(LIB).classList.contains("selected"), true, "no focusing while the action runs");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), true, "cue still on");
        await cv.selectByID(C2);   // what Zotero does after creating a collection
        await waitFor(() => listRows() === C2, 5000, "the list follows the real selection");
        assert.notOk(doc._wvCollPending, "context ended by the real change");
        assert.strictEqual(rowElFor(C2).classList.contains("selected"), true, "the real selection is highlighted");
        assert.strictEqual(rowElFor(LIB).classList.contains("selected"), false, "My Library no longer");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), false, "cue gone");
        assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        await waitFor(() => listRows() === LIB, 5000, "back on My Library");
        // cancelled (no real change) -- an item wired through a <command> element (New Collection…),
        // whose event lands on that element, not on the popup: the next input restores, no focusing at all
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        g.onCommand({ target: doc.getElementById("cmd_zotero_newCollection") || doc.createXULElement("command") });
        assert.strictEqual(selectedID(), C, "context row kept for the command handler");
        await new Promise(r => win.setTimeout(r, 400));
        assert.strictEqual(selectedID(), C, "still kept: no timer");
        // a right-click on the SAME row while its cancelled action's context is still pending:
        // the settle's restore repaints the row and detaches the element under the pointer,
        // so the row must be resolved before settling (traced live 2026-09-22)
        const inner = rowEl.querySelector(".cell-text") || rowEl.firstElementChild || rowEl;
        const b = rowEl.getBoundingClientRect();
        const again = evt("mousedown", { button: 2, target: inner, clientX: b.left + 40, clientY: b.top + b.height / 2 });
        g.onRightDown(again);
        assert.strictEqual(again.stopped, 1, "pre-empted");
        assert.isTrue(inner.isConnected, "no row rebuild during the mousedown (the restore syncs classes in place)");
        assert.isTrue(rowElFor(LIB).classList.contains("selected") && rowElFor(LIB).classList.contains("first-selected") && rowElFor(LIB).classList.contains("last-selected"), "My Library carries Zotero's selection classes");
        assert.strictEqual(selectedID(), C, "new silent context on the same row");
        assert.deepEqual(doc._wvCollCtx && doc._wvCollCtx.prev.ids, [LIB], "previous = My Library");
        assert.strictEqual(listRows(), LIB, "list untouched");
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        g.onCommand({ target: doc.createXULElement("menuitem") });   // cancelled again
        assert.strictEqual(selectedID(), C, "context kept for the command handler");
        // an inline rename under way keeps it too
        cv._editing = cv.getRow(cv.getRowIndexByID(C));
        g.settle();
        assert.strictEqual(selectedID(), C, "kept while editing");
        cv._editing = null;
        g.settle();   // the user's next click or key
        assert.strictEqual(selectedID(), LIB, "restored");
        assert.notOk(doc._wvCollPending, "settled");
        await new Promise(r => win.setTimeout(r, 300));
        assert.strictEqual(listRows(), LIB, "list never moved");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), false, "cue gone");
        assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
        // a right-click on the selected row itself is Zotero's own path
        await cv.selectByID(C);
        await waitFor(() => listRows() === C, 5000, "on the collection for real");
        const md2 = evt("mousedown", { button: 2, target: rowEl });
        g.onRightDown(md2);
        assert.strictEqual(md2.stopped, 0, "not pre-empted");
        assert.notOk(doc._wvCollCtx, "nothing recorded");
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        await waitFor(() => listRows() === LIB, 5000, "back on My Library");
        // Weavero's own entry does not count as an action: restored after the grace
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        const own = doc.createXULElement("menuitem"); own.setAttribute("data-wv-collection-open", "true");
        g.onCommand({ target: own });
        assert.ok(doc._wvCollPending, "still pending");
        await waitFor(() => selectedID() === LIB, 2000, "restored after our own entry");
        assert.strictEqual(listRows(), LIB, "list never moved");
        // a right press that never opens the menu is undone after the mouseup grace
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onRightUp(evt("mouseup", { button: 2, target: rowEl }));
        assert.strictEqual(selectedID(), C, "context row selected");
        await waitFor(() => selectedID() === LIB, 3000, "undone without a menu");
        assert.strictEqual(listRows(), LIB, "list never moved");
        assert.strictEqual(rowEl.classList.contains("wv-ctx-row"), false, "cue gone");
        // dismissing a menu by right-clicking ANOTHER row: the pending verdict settles first,
        // so the new context's "previous" selection is the real one, not the old context row
        const rowEl2 = rowElFor(C2);
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });                                   // verdict pending (grace)
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl2 }));   // arrives before the tick
        assert.strictEqual(selectedID(), C2, "new context row selected");
        assert.deepEqual(doc._wvCollCtx && doc._wvCollCtx.prev.ids, [LIB], "previous = My Library, not the old context row");
        assert.strictEqual(rowEl.classList.contains("selected"), false, "old context row not highlighted");
        assert.strictEqual(rowElFor(LIB).classList.contains("selected"), true, "My Library highlighted");
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        await waitFor(() => selectedID() === LIB, 2000, "back to My Library after the second menu");
        await new Promise(r => win.setTimeout(r, 300));
        assert.strictEqual(listRows(), LIB, "list never moved");
        assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "exactly one row painted selected");
        // a left mousedown records nothing; a submenu's bubbled popuphidden is not the menu's own
        const md3 = evt("mousedown", { button: 0, target: rowEl });
        g.onRightDown(md3);
        assert.strictEqual(md3.stopped + (doc._wvCollCtx ? 1 : 0), 0, "left button ignored");
        g.onRightDown(evt("mousedown", { button: 2, target: rowEl }));
        g.onShowing({ target: doc.createXULElement("menupopup") });
        g.onHidden({ target: doc.createXULElement("menupopup") });
        await new Promise(r => win.setTimeout(r, 100));
        assert.strictEqual(selectedID(), C, "a bubbled popuphidden changes nothing");
        doc._wvCollCtx = null; doc._wvCollMenuCtx = null;
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
    });

    it("middle-click on a row opens it in a new window; Shift+click and Ctrl+click stay Zotero's selection gestures", async () => {
        const g = doc._wvCollTreeGestures, rowEl = rowElFor("C" + coll.id), LIB = "L" + Zotero.Libraries.userLibraryID;
        await withStub(async (calls) => {
            const down = evt("mousedown", { button: 1, target: rowEl });
            g.onRightDown(down);
            assert.strictEqual(down.prevented + down.stopped, 2, "Zotero's mousedown selection pre-empted");
            assert.strictEqual(selectedID(), LIB, "no selection change on the press");
            assert.strictEqual(calls.length, 0, "nothing opened on the press");
            const up = evt("mouseup", { button: 1, target: rowEl });
            g.onMiddleUp(up);
            assert.strictEqual(calls.length, 1, "opener called once on the release");
            assert.strictEqual(calls[0] && calls[0].id, "C" + coll.id, "asked for the collection's row");
            assert.strictEqual(calls[0].libraryID, coll.libraryID, "with its library");
            assert.strictEqual(up.stopped, 1, "release swallowed");
            const aux = evt("auxclick", { button: 1, target: rowEl });
            g.onMiddleUp(aux);
            assert.strictEqual(calls.length, 1, "the auxclick after the open opens nothing more");
            assert.strictEqual(aux.stopped, 1, "but is swallowed");
            // released on another row: nothing
            g.onRightDown(evt("mousedown", { button: 1, target: rowEl }));
            g.onMiddleUp(evt("mouseup", { button: 1, target: rowElFor("C" + coll2.id) }));
            assert.strictEqual(calls.length, 1, "released elsewhere: nothing opened");
            // Zotero's own gestures are untouched
            const shiftDown = evt("mousedown", { button: 0, shiftKey: true, target: rowEl });
            g.onRightDown(shiftDown);
            const shiftUp = evt("mouseup", { button: 0, shiftKey: true, target: rowEl });
            g.onMiddleUp(shiftUp);
            assert.strictEqual(calls.length + shiftDown.stopped + shiftUp.stopped, 1, "Shift+click is Zotero's range select");
            const ctrlUp = evt("mouseup", { button: 0, ctrlKey: true, target: rowEl });
            g.onMiddleUp(ctrlUp);
            assert.strictEqual(calls.length + ctrlUp.stopped, 1, "Ctrl+click is Zotero's toggle");
            const plain = evt("mouseup", { button: 0, target: rowEl });
            g.onMiddleUp(plain);
            assert.strictEqual(calls.length + plain.stopped, 1, "a plain click is Zotero's");
        });
        assert.strictEqual(selectedID(), LIB, "the selection did not move");
    });

    it("with Multiple main windows off the middle-click is Zotero's", async () => {
        const g = doc._wvCollTreeGestures, rowEl = rowElFor("C" + coll.id);
        Zotero.Prefs.set("weavero.newMainWindow", false);
        try {
            await withStub(async (calls) => {
                const down = evt("mousedown", { button: 1, target: rowEl });
                g.onRightDown(down);
                const up = evt("mouseup", { button: 1, target: rowEl });
                g.onMiddleUp(up);
                assert.strictEqual(calls.length + down.stopped + down.prevented + up.stopped, 0, "untouched");
            });
        }
        finally { Zotero.Prefs.set("weavero.newMainWindow", true); }
    });

    it("the context menu carries Open in New Window for one collection row; its command asks for that row", async function () {
        this.timeout(15000);
        assert.ok(wv._wvCollectionMenus && wv._wvCollectionMenus.length === 1, "one entry registered (a top-level separator would get the whole registration refused)");
        assert.ok(wv._wvCollectionMenuID, "MenuManager accepted it");
        const menu = doc.getElementById("zotero-collectionmenu");
        await cv.selectByID("C" + coll.id);
        await win.ZoteroPane.buildCollectionContextMenu();
        const shown = new Promise(r => menu.addEventListener("popupshown", r, { once: true }));
        menu.openPopupAtScreen(200, 200, true);
        const ok = await Promise.race([shown.then(() => true), new Promise(r => win.setTimeout(() => r(false), 3000))]);
        try {
            if (!ok) this.skip();   // popups do not open in this runner window
            const el = menu.querySelector("[data-wv-collection-open]");
            assert.ok(el, "entry in the popup");
            assert.strictEqual(el.getAttribute("label"), "Open in New Window");
            assert.strictEqual(el.getAttribute("acceltext"), "Middle-click", "acceltext survived the move");
            assert.isFalse(el.hidden, "shown for a collection row");
            // First of the plugin section, right after MenuManager's group
            // separator -- never before Zotero's own children: Zotero's
            // builder addresses them BY INDEX (dev.37 relabelled the menu).
            const grp = menu.querySelector(":scope > .zotero-custom-menu-group-separator");
            assert.ok(grp, "MenuManager's group separator");
            assert.strictEqual(el.previousElementSibling, grp, "right after the group separator");
            assert.strictEqual(menu.firstElementChild.id, "sync", "Zotero's positional block intact");
            // Zotero's new-window glyph in front (MenuManager icon data)
            assert.isTrue(el.classList.contains("menuitem-iconic"), "iconic");
            assert.include(el.style.getPropertyValue("--custom-menu-icon-light"), "universal/new-window.svg", "new-window glyph");
            // our separator right under it, shown only when a visible entry follows
            // (Weavero's own bookmark entries may follow here; other plugins in real profiles)
            const sep = el.nextElementSibling;
            assert.ok(sep && sep.localName === "menuseparator" && sep.hasAttribute("data-wv-collection-open-sep"), "our separator under the entry");
            assert.strictEqual(menu.querySelectorAll("[data-wv-collection-open-sep]").length, 1, "one separator of ours");
            const followers = () => { const out = []; let n = sep.nextElementSibling; while (n) { out.push(n); n = n.nextElementSibling; } return out; };
            const followed = () => followers().some(n => !n.hidden && n.localName !== "menuseparator");
            assert.strictEqual(sep.hidden, !followed(), "separator follows what is visible after it");
            const was = followers().map(n => n.hidden);
            try {
                followers().forEach(n => { n.hidden = true; });
                sep._wvDecide();
                assert.isTrue(sep.hidden, "hidden when nothing visible follows");
            }
            finally { followers().forEach((n, i) => { n.hidden = was[i]; }); }
            sep._wvDecide();
            assert.strictEqual(sep.hidden, !followed(), "back to the DOM's verdict");
        }
        finally { try { menu.hidePopup(); } catch (e) {} await new Promise(r => win.setTimeout(r, 200)); }
        // another plugin's entry after ours: the separator shows
        const fake = doc.createXULElement("menuitem"); fake.setAttribute("label", "wv-fake-plugin-entry"); menu.appendChild(fake);
        try {
            await win.ZoteroPane.buildCollectionContextMenu();
            const shown3 = new Promise(r => menu.addEventListener("popupshown", r, { once: true }));
            menu.openPopupAtScreen(200, 200, true);
            await Promise.race([shown3, new Promise(r => win.setTimeout(r, 3000))]);
            const el = menu.querySelector("[data-wv-collection-open]"), sep = menu.querySelector("[data-wv-collection-open-sep]");
            assert.strictEqual(el.nextElementSibling, sep, "still right under the entry");
            assert.isFalse(sep.hidden, "shown when an entry follows");
            assert.strictEqual(menu.querySelectorAll("[data-wv-collection-open-sep]").length, 1, "reused, not duplicated");
            assert.strictEqual(menu.firstElementChild.id, "sync", "Zotero's block still intact");
        }
        finally { try { menu.hidePopup(); } catch (e) {} fake.remove(); await new Promise(r => win.setTimeout(r, 200)); }
        // gate off: hidden, Zotero's block still intact after a second build
        Zotero.Prefs.set("weavero.newMainWindow", false);
        try {
            await win.ZoteroPane.buildCollectionContextMenu();
            const shown2 = new Promise(r => menu.addEventListener("popupshown", r, { once: true }));
            menu.openPopupAtScreen(200, 200, true);
            await Promise.race([shown2, new Promise(r => win.setTimeout(r, 3000))]);
            const el = menu.querySelector("[data-wv-collection-open]"), sep = menu.querySelector("[data-wv-collection-open-sep]");
            assert.ok(el && sep, "still in the popup");
            assert.isTrue(el.hidden && sep.hidden, "entry and separator hidden with the gate off");
            assert.strictEqual(menu.firstElementChild.id, "sync", "Zotero's positional block intact on the second build");
            assert.strictEqual(menu.firstElementChild.getAttribute("label"), Zotero.getString("sync.sync"), "and correctly labelled");
        }
        finally { try { menu.hidePopup(); } catch (e) {} Zotero.Prefs.set("weavero.newMainWindow", true); await new Promise(r => win.setTimeout(r, 200)); }
        await withStub(async (calls) => {
            wv._wvCollectionMenus[0].onCommand(null, { collectionTreeRows: [cv.getRow(cv.selection.focused)] });
            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0] && calls[0].id, "C" + coll.id, "asked for the right-clicked row");
            assert.strictEqual(calls[0].libraryID, coll.libraryID);
        });
        // a feed row, or several rows, get no entry
        const ctxFor = (rows) => { const c = { menuElem: doc.createXULElement("menuitem"), collectionTreeRows: rows, v: null, setVisible(v) { c.v = v; } }; return c; };
        let c = ctxFor([{ id: "F1", ref: {}, isFeed: () => true }]);
        wv._wvCollectionMenus[0].onShowing(null, c);
        assert.isFalse(c.v, "hidden for a feed");
        c = ctxFor([]);
        wv._wvCollectionMenus[0].onShowing(null, c);
        assert.isFalse(c.v, "hidden for no row");
        c = ctxFor([cv.getRow(cv.selection.focused)]);
        wv._wvCollectionMenus[0].onShowing(null, c);
        assert.isTrue(c.v, "shown for the collection row");
        // teardown unregisters and removes the separator; register brings the entry back
        wv._wvTeardownCollectionMenuEntries();
        assert.notOk(menu.querySelector("[data-wv-collection-open-sep]"), "our separator removed on teardown");
        assert.notOk(wv._wvCollectionMenuID, "unregistered");
        wv._wvRegisterCollectionMenuEntries();
        assert.ok(wv._wvCollectionMenuID, "registered again");
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
    });

    it("Edit Saved Search on a right-clicked search commits the selection before the editor opens; Rename on a collection does not", async function () {
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID, S = "S" + search.id, C = "C" + coll.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        await waitFor(() => listRows() === LIB && rowElFor(S), 5000, "on My Library, search row rendered");
        const edit = doc.createXULElement("menuitem"); edit.id = "editSelectedCollection";
        // a search: committed at command time
        g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(S) }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        g.onCommand({ target: edit });
        assert.notOk(doc._wvCollPending, "no pending context: committed");
        assert.strictEqual(selectedID(), S, "the search is the selection the editor reads");
        await waitFor(() => listRows() === S, 5000, "the list follows the search");
        await waitFor(() => rowElFor(S).classList.contains("selected") && !rowElFor(LIB).classList.contains("selected"), 2000, "highlight on the search");
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        await waitFor(() => listRows() === LIB, 5000, "back on My Library");
        // a collection (Rename, inline in the tree): the context is kept, nothing moves
        g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(C) }));
        g.onShowing({ target: menu });
        g.onHidden({ target: menu });
        g.onCommand({ target: edit });
        assert.ok(doc._wvCollPending && doc._wvCollPending.c.acted, "context kept for the inline rename");
        await new Promise(r => win.setTimeout(r, 300));
        assert.strictEqual(listRows(), LIB, "list untouched");
        g.settle();
        assert.strictEqual(selectedID(), LIB, "restored");
    });

    it("after an inline rename (Enter) Zotero re-selects the context row: restored silently, tab title put back, the renamed row outlined", async function () {
        this.timeout(30000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID, C = "C" + coll.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        const tabTitle = () => { const t = win.Zotero_Tabs._tabs.find(x => x.id === "zotero-pane"); return t && t.title; };
        // A group library with a collection: its rows are in the tree but not in the user
        // library's set of known rows -- dev.62 outlined the first of them after a rename.
        // (Zotero's own test support creates groups this way.)
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const group = new Zotero.Group();
        Object.assign(group, { id: Zotero.Utilities.rand(10000, 1000000), name: "wv-open-in-window-group", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        const gcoll = new Zotero.Collection();
        Object.assign(gcoll, { name: "wv-open-in-window-group-coll", libraryID: group.libraryID });
        await gcoll.saveTx();
        // A sibling sorted BEFORE the collection: the new name sorts before the sibling, so the
        // rename re-inserts the row at another index (dev.63 painted it selected there -- the
        // paint guard was keyed by index -- a blue flash until the restore).
        const sib = new Zotero.Collection();
        Object.assign(sib, { name: "aaa-wv-open-in-window-sibling" });
        await sib.saveTx();
        const originalName = coll.name;
        const paintLog = [];
        let mo = null, poll = null;
        try {
            await cv.expandLibrary(group.libraryID);
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            // model rows, not DOM rows: the runner's tree is short and virtualized, rows near the
            // bottom (the group's) may not be rendered
            const inTree = (id) => { const i = cv.getRowIndexByID(id); return i !== false && i >= 0; };
            await waitFor(() => listRows() === LIB && inTree("C" + gcoll.id) && inTree("C" + sib.id), 5000, "on My Library, the group and sibling collections in the tree")
                .catch((e) => { throw new Error(e.message + " ; list=" + listRows() + " gcoll=" + cv.getRowIndexByID("C" + gcoll.id) + " sib=" + cv.getRowIndexByID("C" + sib.id) + " rows=" + cv.rowCount + " rendered=" + doc.querySelectorAll("#collection-tree .row").length); });
            const libName = cv.getRow(cv.getRowIndexByID(LIB)).getName();
            const idxBefore = cv.getRowIndexByID(C);
            // right-click the collection -> Rename (inline): context kept
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(C) }));
            g.onShowing({ target: menu });
            g.onHidden({ target: menu });
            const edit = doc.createXULElement("menuitem"); edit.id = "editSelectedCollection";
            g.onCommand({ target: edit });
            assert.ok(doc._wvCollPending && doc._wvCollPending.c.acted, "context kept for the inline rename");
            // every DOM checkpoint from here: which rows other than My Library are painted selected.
            // Registered AFTER the right-click on purpose: observers run in registration order, and
            // the plugin's paint guard registers at the right-click -- registered before it, this
            // one sees Zotero's paint BEFORE the guard corrects it (three false entries, 2026-09-23).
            // The 20 ms poll is the paint-level check (a task never runs between a mutation and
            // the guard's microtask).
            const t0 = Date.now();
            const checkPaint = () => {
                for (const el of doc.querySelectorAll("#collection-tree .row.selected")) {
                    const r = cv.getRow(+el.id.replace("collection-tree-row-", "")); const id = r && r.id;
                    if (id !== LIB) paintLog.push(id + "@" + el.id.replace("collection-tree-row-", "") + " t=" + (Date.now() - t0) + " sel=" + selectedID()
                        + " pending=" + !!doc._wvCollPending + " editing=" + !!cv._editing + " cls=" + el.className);
                }
            };
            mo = new win.MutationObserver(checkPaint);
            mo.observe(doc.getElementById("collection-tree"), { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
            poll = win.setInterval(checkPaint, 20);
            // the real path: Zotero's inline editor, a new name, Enter (its keydown commits the
            // name and stops editing; the save then refreshes the row and re-selects it)
            win.ZoteroPane.editSelectedCollection();
            await waitFor(() => cv._editingInput, 3000, "inline editor open");
            const input = cv._editingInput;
            const newName = "000-" + originalName;   // sorts before the sibling: the row moves
            input.value = newName;
            input.dispatchEvent(new win.Event("input", { bubbles: true }));
            input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
            await waitFor(() => coll.name === newName && selectedID() === LIB && !doc._wvCollPending, 8000, "renamed, previous selection back silently, context over");
            await new Promise(r => win.setTimeout(r, 400));
            assert.notStrictEqual(cv.getRowIndexByID(C), idxBefore, "the rename moved the row to another index");
            assert.strictEqual(paintLog.length, 0, "no row but My Library was ever painted selected; seen: " + paintLog.join(" | "));
            assert.strictEqual(listRows(), LIB, "no list reload");
            assert.strictEqual(rowElFor(LIB).classList.contains("selected"), true, "My Library highlighted");
            assert.strictEqual(rowElFor(C).classList.contains("selected"), false, "the renamed collection not focused");
            assert.strictEqual(tabTitle(), libName, "library tab title put back");
            assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
            // the RENAMED row keeps the dashed outline until the next click or key -- not a row
            // of another library
            assert.strictEqual(doc._wvCollAfterglow, C, "afterglow on the renamed row");
            assert.strictEqual(rowElFor(C).classList.contains("wv-ctx-row"), true, "renamed row outlined");
            assert.strictEqual(doc.querySelectorAll("#collection-tree .row.wv-ctx-row").length, 1, "and no other row (the group collection in particular)");
            g.settle();
            assert.strictEqual(rowElFor(C).classList.contains("wv-ctx-row"), false, "outline gone at the next input");
        }
        finally {
            try { if (mo) mo.disconnect(); } catch (e) {}
            try { if (poll) win.clearInterval(poll); } catch (e) {}
            try { if (cv._editing) cv.stopEditing(); } catch (e) {}
            try { coll.name = originalName; await coll.saveTx(); } catch (e) {}
            try { await sib.eraseTx(); } catch (e) {}
            try { await gcoll.eraseTx(); } catch (e) {}
            try { await group.eraseTx(); } catch (e) {}
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        }
    });

    it("New Collection… follows the RIGHT-CLICKED row: greyed on a read-only group, back for My Library after", async function () {
        // MJT 2026-09-25: Zotero sets cmd_zotero_newCollection from the selection
        // only on its select event, which the silent context skips -- a read-only
        // group right-clicked from My Library offered New Collection….
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const cmd = doc.getElementById("cmd_zotero_newCollection");
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const group = new Zotero.Group();
        Object.assign(group, { id: Zotero.Utilities.rand(10000, 1000000), name: "wv-readonly-group", description: "",
            editable: false, filesEditable: false, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        try {
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            const L = "L" + group.libraryID;
            await waitFor(() => { const i = cv.getRowIndexByID(L); return i !== false && i >= 0; }, 5000, "the group row in the tree");
            await cv.ensureRowIsVisible(cv.getRowIndexByID(L));
            await waitFor(() => rowElFor(L), 5000, "the group row rendered");
            assert.isFalse(cmd.hasAttribute("disabled") && cmd.getAttribute("disabled") === "true", "enabled on My Library");
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(L) }));
            g.onShowing({ target: menu });
            assert.strictEqual(cmd.getAttribute("disabled"), "true", "greyed for the read-only group");
            g.onHidden({ target: menu });
            g.settle();   // the next click: the previous selection comes back
            assert.strictEqual(selectedID(), "L" + Zotero.Libraries.userLibraryID);
            assert.isFalse(cmd.getAttribute("disabled") === "true", "enabled again for My Library");
        }
        finally {
            try { await group.eraseTx(); } catch (e) {}
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        }
    });

    it("a subcollection created from the menu: you stay where you were, the new row is outlined", async function () {
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID, C = "C" + coll.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        // Weavero's cross-window guard (tabs.ts) adds skipSelect to a collection add in a
        // window WITHOUT OS focus, and the runner's window is never raised: pin hasFocus so
        // step 1 runs the path of a window the New Collection dialog closed onto (Zotero
        // selects the new row), step 2 the guarded path (the row appears unselected).
        const focusStub = (value) => { doc.hasFocus = () => value; };
        const create = async (name) => { const s = new Zotero.Collection(); s.name = name + Date.now(); s.parentID = coll.id; await s.saveTx(); return s; };
        const rightClickNewSub = () => {
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(C) }));
            g.onShowing({ target: menu });
            g.onHidden({ target: menu });
            const item = doc.createXULElement("menuitem"); item.id = "newSubcollection";
            g.onCommand({ target: item });
            assert.ok(doc._wvCollPending && doc._wvCollPending.c.known && doc._wvCollPending.c.known.has(C), "existing rows recorded at command time");
        };
        const state = (sub) => "sel=" + selectedID() + " pending=" + !!doc._wvCollPending + " row=" + !!rowElFor("C" + sub.id) + " list=" + listRows()
            + " parentOpen=" + cv.isContainerOpen(cv.getRowIndexByID(C)) + " afterglow=" + doc._wvCollAfterglow;
        const made = [];
        try {
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            await waitFor(() => listRows() === LIB, 5000, "on My Library");
            // 1. focused window: Zotero expands the parent and selects the new row -- undone
            //    silently, the new row outlined instead of shown
            focusStub(true);
            rightClickNewSub();
            const sub = await create("wv-open-in-window-sub-"); made.push(sub);
            await waitFor(() => selectedID() === LIB && !doc._wvCollPending && rowElFor("C" + sub.id), 8000, "stayed on My Library, context over, new row visible")
                .catch((e) => { throw new Error(e.message + " ; at timeout: " + state(sub)); });
            await new Promise(r => win.setTimeout(r, 300));
            assert.strictEqual(listRows(), LIB, "list never moved");
            assert.strictEqual(rowElFor("C" + sub.id).classList.contains("wv-ctx-row"), true, "the new subcollection is outlined");
            assert.strictEqual(rowElFor("C" + sub.id).classList.contains("selected"), false, "but not selected");
            assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
            g.settle();
            assert.strictEqual(rowElFor("C" + sub.id).classList.contains("wv-ctx-row"), false, "outline gone at the next input");
            // 2. unfocused window (guard active): the parent is open from step 1, the row is
            //    added without a select -- same outcome, the outline goes to the new row
            focusStub(false);
            rightClickNewSub();
            const sub2 = await create("wv-open-in-window-sub2-"); made.push(sub2);
            await waitFor(() => selectedID() === LIB && !doc._wvCollPending && rowElFor("C" + sub2.id), 8000, "stayed on My Library, context over, second row visible")
                .catch((e) => { throw new Error(e.message + " ; at timeout: " + state(sub2)); });
            await new Promise(r => win.setTimeout(r, 300));
            assert.strictEqual(listRows(), LIB, "list never moved (unfocused window)");
            assert.strictEqual(rowElFor("C" + sub2.id).classList.contains("wv-ctx-row"), true, "the second subcollection is outlined");
            assert.strictEqual(rowElFor(C).classList.contains("wv-ctx-row"), false, "not its parent");
            assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
            g.settle();
        }
        finally {
            delete doc.hasFocus;
            for (const s of made) { try { await s.eraseTx(); } catch (e) {} }
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        }
    });

    it("a notification while the menu is open, or while its verdict is pending, does not load the right-clicked row's list", async function () {
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID, C = "C" + coll.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        const painted = () => Array.from(doc.querySelectorAll("#collection-tree .row.selected")).map(el => { const r = cv.getRow(+el.id.replace("collection-tree-row-", "")); return r && r.id; }).join();
        // an unrelated collection whose save produces the notification (a 'modify' ends with
        // selectEventsSuppressed = false -> a select event with whatever the model holds)
        const other = new Zotero.Collection(); Object.assign(other, { name: "wv-open-in-window-other" });
        await other.saveTx();
        try {
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            await waitFor(() => listRows() === LIB, 5000, "on My Library");
            // 1. menu open
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(C) }));
            g.onShowing({ target: menu });
            assert.strictEqual(selectedID(), C, "silently selected");
            // diagnostics: every selection event during the save, with the model it saw
            const sel = cv.selection, events = [];
            const armed = Object.prototype.hasOwnProperty.call(sel, "_updateTree");
            const ownUT = armed ? sel._updateTree : null;
            if (armed) sel._updateTree = function (...a) { events.push("ut(" + a.join(",") + ") model=" + [...sel.selected].map(i => (cv.getRow(i) || {}).id).join("+") + " f=" + (cv.getRow(sel.focused) || {}).id + " sup=" + sel.selectEventsSuppressed); return ownUT.apply(this, a); };
            const diag = () => " ; armed=" + armed + " menuCtx=" + !!doc._wvCollMenuCtx + " sel=" + selectedID() + " rows=" + cv.rowCount + " idxC=" + cv.getRowIndexByID(C) + " idxOther=" + cv.getRowIndexByID("C" + other.id) + " events=" + JSON.stringify(events);
            other.name = "wv-open-in-window-other-1";
            await Promise.race([other.saveTx(), new Promise((_, rej) => win.setTimeout(() => rej(new Error("the save's notification never settled (waitForSelect hung)")), 8000))]);
            await new Promise(r => win.setTimeout(r, 300));
            if (armed && sel._updateTree !== ownUT) sel._updateTree = ownUT;
            assert.strictEqual(listRows(), LIB, "list untouched by the notification (menu open)" + diag());
            assert.strictEqual(selectedID(), C, "context kept");
            assert.strictEqual(painted(), LIB, "My Library painted, and only it");
            assert.strictEqual(rowElFor(C).classList.contains("wv-ctx-row"), true, "context row outlined");
            // 2. menu dismissed, verdict pending
            g.onHidden({ target: menu });
            assert.ok(doc._wvCollPending, "verdict pending");
            other.name = "wv-open-in-window-other-2";
            await Promise.race([other.saveTx(), new Promise((_, rej) => win.setTimeout(() => rej(new Error("the save's notification never settled (pending phase)")), 8000))]);
            assert.strictEqual(listRows(), LIB, "list untouched by the notification (pending)");
            await waitFor(() => selectedID() === LIB && !doc._wvCollPending, 3000, "dismissed: restored");
            await new Promise(r => win.setTimeout(r, 300));
            assert.strictEqual(listRows(), LIB, "still My Library");
            assert.strictEqual(painted(), LIB, "My Library painted");
        }
        finally {
            try { g.settle(); } catch (e) {}
            try { await other.eraseTx(); } catch (e) {}
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        }
    });

    it("deleting the right-clicked collection leaves you where you were; header rows get no menu and no middle-click", async function () {
        this.timeout(20000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        const gone = new Zotero.Collection(); gone.name = "wv-open-in-window-gone-" + Date.now();
        await gone.saveTx();
        try {
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            await waitFor(() => listRows() === LIB && rowElFor("C" + gone.id), 5000, "on My Library, row rendered");
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor("C" + gone.id) }));
            g.onShowing({ target: menu });
            g.onHidden({ target: menu });
            const del = doc.createXULElement("menuitem"); del.id = "deleteCollection";
            g.onCommand({ target: del });
            assert.ok(doc._wvCollPending && doc._wvCollPending.c.acted, "context kept for the delete");
            // what Zotero does: trashes the collection, removes its row, selects a neighbour
            gone.deleted = true;
            await gone.saveTx();
            await waitFor(() => selectedID() === LIB && !doc._wvCollPending, 5000, "back on My Library, context over");
            await new Promise(r => win.setTimeout(r, 300));
            assert.strictEqual(listRows(), LIB, "list never moved");
            assert.strictEqual(doc.querySelectorAll("#collection-tree .row.selected").length, 1, "one row painted");
        }
        finally { try { await gone.eraseTx(); } catch (e) {} }
        // header rows: a right-click is swallowed, a middle-click opens nothing (only observable with a header present)
        const headerIdx = (() => { for (let i = 0; i < cv.rowCount; i++) { const r = cv.getRow(i); if (r && r.isHeader && r.isHeader()) return i; } return -1; })();
        const rowEl = rowElFor("C" + coll.id);
        const cm = evt("contextmenu", { target: rowEl, clientX: 0, clientY: 0 });
        g.onContext(cm);
        assert.strictEqual(cm.stopped + cm.prevented, 0, "a collection's right-click is not swallowed");
        if (headerIdx >= 0) {
            const hEl = doc.getElementById("collection-tree-row-" + headerIdx);
            const hcm = evt("contextmenu", { target: hEl, clientX: 0, clientY: 0 });
            g.onContext(hcm);
            assert.strictEqual(hcm.stopped, 1, "header right-click swallowed");
            await withStub(async (calls) => {
                const down = evt("mousedown", { button: 1, target: hEl });
                g.onRightDown(down);
                const up = evt("mouseup", { button: 1, target: hEl });
                g.onMiddleUp(up);
                assert.strictEqual(calls.length, 0, "header middle-click opens nothing");
                assert.strictEqual(down.stopped, 1, "and the press is swallowed");
            });
        }
    });

    it("Export and Generate Report on a right-clicked saved search wait for its list, then run on it", async function () {
        this.timeout(30000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID, S = "S" + search.id;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        const FI = win.Zotero_File_Interface, RI = win.Zotero_Report_Interface;
        const origExport = FI.exportCollection, origReport = RI.loadCollectionReport;
        const seen = [];
        FI.exportCollection = function () { seen.push("export:" + listRows()); };
        RI.loadCollectionReport = function () { seen.push("report:" + listRows()); };
        try {
            for (const id of ["exportCollection", "loadReport"]) {
                await cv.selectLibrary(Zotero.Libraries.userLibraryID);
                await waitFor(() => listRows() === LIB, 5000, "on My Library");
                g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(S) }));
                g.onShowing({ target: menu });
                g.onHidden({ target: menu });
                const item = doc.createXULElement("menuitem"); item.id = id;
                const ce = { target: item, stopped: 0, prevented: 0, stopPropagation() { this.stopped++; }, preventDefault() { this.prevented++; } };
                g.onCommand(ce);
                assert.strictEqual(ce.stopped, 1, id + ": the item's own handler is pre-empted");
                assert.strictEqual(selectedID(), S, id + ": committed to the search");
                await waitFor(() => seen.length > 0, 10000, id + ": the function ran");
                assert.strictEqual(seen.pop(), (id === "exportCollection" ? "export:" : "report:") + S, id + ": ran once the list showed the search");
            }
        }
        finally { FI.exportCollection = origExport; RI.loadCollectionReport = origReport; await cv.selectLibrary(Zotero.Libraries.userLibraryID); }
    });

    it("Export / Bibliography / Report grey out from the right-clicked collection's items, not from the list on screen", async function () {
        this.timeout(30000);
        const g = doc._wvCollTreeGestures, menu = doc.getElementById("zotero-collectionmenu");
        const LIB = "L" + Zotero.Libraries.userLibraryID;
        const listRows = () => (win.ZoteroPane.itemsView.collectionTreeRows || []).map(r => r.id).join();
        const full = new Zotero.Collection(); full.name = "wv-open-in-window-full-" + Date.now(); await full.saveTx();
        const empty = new Zotero.Collection(); empty.name = "wv-open-in-window-empty-" + Date.now(); await empty.saveTx();
        const item = new Zotero.Item("book"); item.setField("title", "wv-open-in-window-item"); item.setCollections([full.id]); await item.saveTx();
        const openFor = async (id) => {
            g.onRightDown(evt("mousedown", { button: 2, target: rowElFor(id) }));
            await win.ZoteroPane.buildCollectionContextMenu();
            const shown = new Promise(r => menu.addEventListener("popupshown", r, { once: true }));
            menu.openPopupAtScreen(200, 200, true);
            const ok = await Promise.race([shown.then(() => true), new Promise(r => win.setTimeout(() => r(false), 3000))]);
            if (!ok) this.skip();
            await new Promise(r => win.setTimeout(r, 100));
            const state = ["exportCollection", "createBibCollection", "loadReport"].map(x => x + "=" + (menu.querySelector("#" + x).disabled ? "off" : "on")).join(" ");
            try { menu.hidePopup(); } catch (e) {}
            await new Promise(r => win.setTimeout(r, 400));
            return state;
        };
        try {
            // on a non-empty view, right-click the EMPTY collection: greyed although the list has items
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
            await waitFor(() => listRows() === LIB && rowElFor("C" + empty.id) && rowElFor("C" + full.id), 5000, "rows rendered");
            assert.strictEqual(await openFor("C" + empty.id), "exportCollection=off createBibCollection=off loadReport=off", "empty target: all greyed");
            // on an EMPTY view, right-click the full collection: enabled although the list is empty
            await cv.selectByID("C" + empty.id);
            await waitFor(() => listRows() === "C" + empty.id, 5000, "on the empty collection");
            assert.strictEqual(await openFor("C" + full.id), "exportCollection=on createBibCollection=on loadReport=on", "full target: all enabled");
        }
        finally {
            try { await item.eraseTx(); } catch (e) {}
            try { await full.eraseTx(); } catch (e) {}
            try { await empty.eraseTx(); } catch (e) {}
            await cv.selectLibrary(Zotero.Libraries.userLibraryID);
        }
    });

    it("middle-click on the Advanced Search funnel opens the search in a new window", async function () {
        const mid = doc._wvAdvSearchMidHandler, funnel = doc.getElementById("zotero-tb-search-advanced-button");
        if (!mid || !funnel) this.skip();   // Zotero 9: no in-main Advanced Search
        const inner = funnel.querySelector("*") || funnel;
        const orig = wv._wvAdvSearchOpenNewWindow; let calls = 0;
        wv._wvAdvSearchOpenNewWindow = async function () { calls++; };
        try {
            const down = evt("mousedown", { button: 1, target: inner });
            mid(down);
            assert.strictEqual(down.prevented + down.stopped, 2, "press swallowed");
            assert.strictEqual(calls, 0, "nothing on the press");
            const aux = evt("auxclick", { button: 1, target: inner });
            mid(aux);
            assert.strictEqual(calls, 1, "opened on the auxclick");
            assert.strictEqual(aux.stopped, 1, "auxclick swallowed");
            const left = evt("auxclick", { button: 0, target: inner });
            mid(left);
            const elsewhere = evt("auxclick", { button: 1, target: doc.getElementById("collection-tree") });
            mid(elsewhere);
            assert.strictEqual(calls + left.stopped + elsewhere.stopped, 1, "left button and other targets untouched");
            Zotero.Prefs.set("weavero.newMainWindow", false);
            try { const off = evt("auxclick", { button: 1, target: inner }); mid(off); assert.strictEqual(calls + off.stopped, 1, "gate off: native"); }
            finally { Zotero.Prefs.set("weavero.newMainWindow", true); }
        }
        finally { wv._wvAdvSearchOpenNewWindow = orig; }
    });

    it("reader tab: Ctrl+F with focus on chrome outside the reader routes to the reader's find bar", function () {
        const route = doc._wvReaderFindRoute;
        if (!route) this.skip();
        const browser = doc.createXULElement("browser"), div = doc.createElement("div"), iframe = doc.createElement("iframe");
        assert.isFalse(route("library", div, browser), "library tab: Zotero's own find");
        assert.isTrue(route("reader", div, browser), "chrome focus outside the reader (item pane...): routed");
        assert.isTrue(route("reader", null, browser), "nothing focused: routed");
        assert.isFalse(route("reader", browser, browser), "the reader itself: left to it");
        assert.isFalse(route("reader", iframe, browser), "a note editor or preview document: left to it");
        assert.ok(typeof doc._wvReaderFindKeyHandler === "function" && typeof doc._wvReaderFindUnwire === "function", "wired with an unwire");
    });

    it("Windows ghost-menu workaround: a popup command forces a refresh tick, other commands do not", function () {
        const fix = doc._wvMenuGhostFix;
        if (!fix) this.skip();
        const menu = doc.getElementById("zotero-collectionmenu");
        const item = menu.querySelector("menuitem") || menu.firstElementChild;
        const cmdEl = doc.getElementById("cmd_zotero_newCollection");
        const plain = doc.createXULElement("toolbarbutton");
        if (Zotero.isWin) {
            assert.isTrue(fix({ target: item }), "menu item: ticked");
            assert.isTrue(fix({ target: cmdEl || doc.createXULElement("command") }), "<command> element: ticked");
        }
        else {
            assert.isFalse(fix({ target: item }), "not Windows: no-op");
        }
        assert.isFalse(fix({ target: plain }), "a command from elsewhere: no-op");
        assert.isFalse(fix({ target: null }), "no target: no-op");
        assert.ok(typeof doc._wvMenuGhostUnwire === "function", "unwire exposed");
    });

    it("the new window lands on the asked-for collection", async function () {
        this.timeout(40000);
        await cv.selectLibrary(Zotero.Libraries.userLibraryID);   // whatever an earlier test left selected
        const before = new Set(Zotero.getMainWindows());
        let nw = null;
        try {
            const samples = [], t0 = Date.now();
            const sample = () => { try { samples.push((Date.now() - t0) + ":" + selectedID() + ":" + Zotero.Prefs.get("lastViewedFolder") + ":" + (win.ZoteroPane.collectionsView === cv ? "same" : "NEWCV") + ":" + (Zotero.getMainWindow() === win ? "main" : "other")); } catch (e) { samples.push("err " + e); } };
            sample();
            wv._wvOpenRowInNewMainWindow("C" + coll.id, coll.libraryID);
            // the new window's selection over time: it must land on the collection directly,
            // never show another row (the global lastViewedFolder) first
            const landed = [];
            const sampleNew = () => { try { const ncv = nw && nw.ZoteroPane && nw.ZoteroPane.collectionsView; const r = ncv && ncv.getRow(ncv.selection.focused); if (r && r.id && landed[landed.length - 1] !== r.id) landed.push(r.id); } catch (e) {} };
            for (let i = 0; i < 100 && !nw; i++) { await new Promise(r => win.setTimeout(r, 100)); sample(); nw = Zotero.getMainWindows().find(w => !before.has(w)); }
            assert.ok(nw, "a new main window");
            for (let i = 0; i < 80; i++) { await new Promise(r => win.setTimeout(r, 50)); sampleNew(); if (i % 5 === 4) sample(); }   // 4 s: the clean start's loop would re-assert within it
            const ncv = nw.ZoteroPane.collectionsView, row = ncv.getRow(ncv.selection.focused);
            assert.strictEqual(row && row.getName(), coll.name, "the collection, not My Library");
            assert.deepEqual(landed, ["C" + coll.id], "landed on the collection directly, no other row first: " + landed.join(","));
            const dedup = samples.filter((x, i, a) => i === 0 || x.split(":").slice(1).join() !== a[i - 1].split(":").slice(1).join());
            assert.strictEqual(selectedID(), "L" + Zotero.Libraries.userLibraryID, "the first window did not move; samples " + dedup.join(" | "));
            assert.notOk(wv._wvPendingDevWindowSelect, "request consumed");
        }
        finally { try { if (nw) nw.close(); } catch (e) {} await new Promise(r => win.setTimeout(r, 500)); }
    });
});
