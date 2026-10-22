/* global describe, it, before, after, assert, Zotero, IOUtils */

// Hidden collections / saved searches / group libraries (MJT 2026-10-05):
// per main window, display-only. "Hide ..." on the row's right-click menu,
// "Show Hidden Collections ▸" on the library row, a blue dot on the library
// row while something is hidden, and Weavero's own pickers leave hidden
// collections out. The tree filter rides Zotero's `_includedInTree`.

describe("Weavero — hidden collections (per window)", () => {
    let wv, win, cv, A, A1, B, S;
    const LIB = () => Zotero.Libraries.userLibraryID;
    // Zotero's per-library setting for the special collections (untyped).
    const VPref = /** @type {any} */ (Zotero.Prefs);
    // Timers on the FIRST window: once a second window opens, getMainWindow()
    // returns it, and its timers do not fire before it has loaded.
    let timerWin = null;
    const sleep = (ms) => new Promise(r => (timerWin || (timerWin = Zotero.getMainWindow())).setTimeout(r, ms));
    const inTree = (obj) => cv.getRowIndexByID((obj.objectType === "search" ? "S" : "C") + obj.id) !== false;

    // Both hooks have timed out together in 4 runs out of many (dev38,
    // dev44, dev46, coll-oiw-fix2b), no orphan runner holding the profile,
    // the next run green. The step marker named it on dev46: selectLibrary
    // (Zotero's selectWait waits for onCollectionSelected), no DB
    // transaction open. Every hung run overlapped windows being opened or
    // raised on the desktop -- the runner's window occluded is the guess.
    let setupStep = "start", setupDone = false;
    before(async function () {
        this.timeout(20000);
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvHidApply !== "function") wvT.absent('!wv || typeof wv._wvHidApply !== "function"');
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        const mk = async (name, parentID) => { setupStep = "save " + name; const c = new Zotero.Collection(); c.name = name; if (parentID) c.parentID = parentID; await c.saveTx(); return c; };
        A = await mk("wv-hid-A");
        A1 = await mk("wv-hid-A1", A.id);
        B = await mk("wv-hid-B");
        S = /** @type {any} */ (new Zotero.Search());
        S.name = "wv-hid-search"; S.libraryID = LIB();
        S.addCondition("title", "contains", "zzz");
        setupStep = "save search";
        await S.saveTx();
        win._wvHid = { groups: [], hidden: {} };
        wv._wvHidApply(win);
        setupStep = "selectLibrary";
        // Bounded: Zotero's selectWait waits for the items list behind the
        // selection, which an occluded runner window can leave pending
        // (5 hung runs, all with the window out of sight); the tests here
        // need the collection rows only.
        await Promise.race([cv.selectLibrary(LIB()), sleep(4000)]);
        setupStep = "expandToCollection";
        await cv.expandToCollection(A1.id);
        setupStep = "sleep";
        await sleep(200);
        setupDone = true;
    });

    after(async function () {
        this.timeout(20000);
        if (!setupDone) {
            let tx = "?";
            try { tx = String(Zotero.DB.inTransaction()); } catch (_) {}
            const line = "[wv-test] hidden-collections setup stuck at: " + setupStep + " (DB in transaction: " + tx + ")";
            try { Zotero.debug(line); } catch (_) {}
            try { if (typeof globalThis.debug === "function") globalThis.debug(line); } catch (_) {}
        }
        if (!wv || !win) return;
        win._wvHid = { groups: [], hidden: {} };
        try { await wv._wvHidSave(win); await wv._wvHidRefreshWin(win); } catch (_) {}
        for (const o of [S, A1, A, B]) { try { if (o) await o.eraseTx(); } catch (_) {} }
    });

    it("hiding a collection removes it and its sub-collections from this window's tree", async function () {
        this.timeout(15000);
        assert.isTrue(inTree(A) && inTree(A1) && inTree(B), "all shown at first");
        await wv._wvHidHide([A], win);
        assert.isFalse(inTree(A), "A hidden");
        assert.isFalse(inTree(A1), "its sub-collection goes with it");
        assert.isTrue(inTree(B), "B untouched");
        assert.isTrue(wv._wvHidIsHidden(A, win));
        assert.isFalse(wv._wvHidIsHidden(A1, win), "only A is recorded; A1 is out because its parent is");
        assert.isTrue(wv._wvHidCollHiddenDeep(A1, win), "the pickers see A1 as hidden through its parent");
    });

    it("the state is per window: another window object hides nothing", () => {
        const other = { _wvHid: { groups: [], hidden: {} } };
        assert.isFalse(wv._wvHidIsHidden(A, other));
    });

    // Zotero 11 (Firefox 153) paints a menu icon only from `--menuitem-icon`
    // (menu.css resets list-style-image to none on every menu): the Show
    // submenus' eye icon, drawn with list-style-image alone, was gone on 11
    // (audit against "Zotero 11 for Developers", 2026-10-13).
    it("the Show submenus carry their eye icon in --menuitem-icon (Zotero 11)", () => {
        const doc = win.document;
        assert.isOk(doc.getElementById("wv-hid-sheet"), "the hidden-collections sheet is installed");
        const m = doc.createXULElement("menu");
        m.classList.add("menu-iconic", "wv-hid-show");
        (doc.querySelector("popupset") || doc.documentElement).appendChild(m);
        try {
            const icon = win.getComputedStyle(m).getPropertyValue("--menuitem-icon");
            assert.include(icon, "view.svg");
        }
        finally { m.remove(); }
    });

    it("hides several rows at once (collections and a saved search)", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B, S], win);
        assert.isFalse(inTree(B));
        assert.isFalse(inTree(S));
        const listed = wv._wvHidListLibrary(LIB(), win).map(h => h.label).sort();
        assert.deepEqual(listed, ["wv-hid-A", "wv-hid-B", "wv-hid-search"]);
    });

    it("My Library shows a blue dot with a count while something is hidden", async function () {
        await sleep(100);
        wv._wvHidDecorate(win);
        const row = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
        const dot = row && row.querySelector(".wv-hid-dot");
        assert.isOk(dot, "dot on the My Library row");
        assert.include(dot.getAttribute("title"), "3 hidden collections or saved searches");
        // On the SELECTED row the dot takes the row's text colour (white on
        // the focused blue selection); accent blue elsewhere (MJT 2026-10-16:
        // "the blue dot is not visible when My Library is selected").
        const hexRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return "rgb(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")"; };
        const cs = (el) => win.getComputedStyle(el);
        assert.isTrue(row.classList.contains("selected"), "My Library is the selected row here");
        assert.equal(cs(dot).backgroundColor, cs(row).color, "selected: the dot is the row's text colour");
        await wv._wvHidShow(win, LIB(), ["C" + B.key]);
        try {
            await cv.selectByID("C" + B.id);
            await sleep(100);
            wv._wvHidDecorate(win);
            const row2 = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
            const dot2 = row2 && row2.querySelector(".wv-hid-dot");
            assert.isOk(dot2 && !row2.classList.contains("selected"), "My Library no longer selected, still dotted");
            const accent = cs(win.document.documentElement).getPropertyValue("--accent-blue").trim();
            assert.equal(cs(dot2).backgroundColor, accent ? hexRgb(accent) : "rgb(64, 114, 229)", "unselected: accent blue");
        } finally {
            await wv._wvHidHide([B], win);
            await cv.selectLibrary(LIB());
        }
        // The dot is back the moment the row re-renders (Zotero's renderItem
        // clears the row's innerHTML on every render; the observer decorates
        // in its microtask, before the paint) -- no sleep, no explicit
        // decorate: a timeout-deferred re-add lagged the selection colour by a
        // paint (MJT 2026-10-16: "Can the change of color be faster").
        const rowBack = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
        assert.isOk(rowBack && rowBack.classList.contains("selected"), "My Library selected again");
        assert.isOk(rowBack.querySelector(".wv-hid-dot"), "the dot is already there right after the render");
    });

    it("the library row's menu gets \"Show Hidden Collections\" with Show All and each entry; a collection's menu gets Hide", async function () {
        this.timeout(15000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        await cv.selectLibrary(LIB());
        await win.ZoteroPane.buildCollectionContextMenu();
        wv._wvHidBuildMenu(win, menu);
        const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
        assert.isOk(sm, "submenu present");
        assert.equal(sm.getAttribute("label"), "Show Hidden Collections", "only collections and searches hidden");
        const labels = [...sm.querySelectorAll("menuitem")].map(m => m.getAttribute("label"));
        assert.equal(labels[0], "Manage Hidden…", "the checklist panel first");
        assert.equal(labels[1], "Show All (3)");
        assert.includeMembers(labels, ["wv-hid-A", "wv-hid-B", "wv-hid-search (saved search)"]);
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
        // Hidden group libraries belong to the Group Libraries line's own menu
        // (MJT 2026-10-16: "not necessary to put the hidden libraries in the
        // right-click menu on My Library"); My Library lists them only while
        // that line is gone (every group hidden). The runner has no group
        // library: stub the hidden-groups listing and the header check.
        const origGroups = wv._wvHidListGroups, origLib = wv._wvHidListLibrary, origHdr = wv._wvHidGroupsHeaderShown;
        try {
            wv._wvHidListGroups = () => [{ libraryID: 999999, label: "wv-hid-group" }];
            wv._wvHidGroupsHeaderShown = () => true;   // the line is there: its own menu
            wv._wvHidBuildMenu(win, menu);
            let sm2 = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            assert.equal(sm2 && sm2.getAttribute("label"), "Show Hidden Collections", "a hidden group is NOT My Library's business while the Group Libraries line shows");
            let labels2 = [...sm2.querySelectorAll("menuitem")].map(m => m.getAttribute("label"));
            assert.equal(labels2[1], "Show All (3)", "the count leaves the group out");
            assert.notInclude(labels2, "wv-hid-group");
            for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
            wv._wvHidGroupsHeaderShown = () => false;  // every group hidden: the line is gone, My Library is the way back
            wv._wvHidBuildMenu(win, menu);
            sm2 = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            assert.equal(sm2 && sm2.getAttribute("label"), "Show Hidden Collections and Libraries", "both kinds, the line gone");
            labels2 = [...sm2.querySelectorAll("menuitem")].map(m => m.getAttribute("label"));
            assert.equal(labels2[1], "Show All (4)");
            assert.include(labels2, "wv-hid-group", "the group listed as the fallback");
            for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
            wv._wvHidListLibrary = () => [];
            wv._wvHidBuildMenu(win, menu);
            sm2 = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            assert.equal(sm2 && sm2.getAttribute("label"), "Show Hidden Group Libraries", "only groups hidden, the line gone");
            assert.equal([...sm2.querySelectorAll("menuitem")][1].getAttribute("label"), "Show All (1)");
        } finally {
            wv._wvHidListGroups = origGroups; wv._wvHidListLibrary = origLib; wv._wvHidGroupsHeaderShown = origHdr;
            for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
        }
        // A shown collection's menu offers Hide.
        await wv._wvHidShow(win, LIB(), ["C" + B.key]);
        await cv.selectByID("C" + B.id);
        await win.ZoteroPane.buildCollectionContextMenu();
        wv._wvHidBuildMenu(win, menu);
        // Zotero's own Hide design (MJT 2026-10-05): its localized label and
        // its crossed-eye icon class, as on Unfiled / Duplicates.
        const hi = menu.querySelector(".wv-hid-entry.zotero-menuitem-hide-collection");
        assert.isOk(hi, "the Hide item carries Zotero's hide-collection icon class");
        assert.equal(hi.getAttribute("label"), Zotero.getString("general.hide"));
        assert.isTrue(hi.classList.contains("menuitem-iconic"));
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
    });

    // MJT 2026-10-20: "put the icons in the Show Hidden context menu" -- each
    // entry carries its row's icon from Zotero's collection-tree set, in
    // --menuitem-icon as the eye above (Zotero 11 reads only that).
    it("each Show entry carries its row's icon: collection, saved search, special collection, group, My Library", async function () {
        this.timeout(15000);
        const doc = win.document, menu = doc.getElementById("zotero-collectionmenu");
        const icon = (el) => win.getComputedStyle(el).getPropertyValue("--menuitem-icon");
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        // Inside a closed menupopup Gecko resolves no computed style for the
        // items (the custom property reads empty, dev.63 run): the rule is
        // read off a clone of the entry at the popupset, as the eye test does.
        const host = doc.querySelector("popupset") || doc.documentElement;
        const probe = (el) => { const c = el.cloneNode(false); host.appendChild(c); try { return icon(c); } finally { c.remove(); } };
        const U = cv.getRow(cv.getRowIndexByID("U" + LIB()));
        await wv._wvHidHide([U], win);   // A, S hidden here already; B shown
        try {
            await cv.selectLibrary(LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            const byLabel = (l) => [...sm.querySelectorAll("menuitem")].find(m => m.getAttribute("label") === l);
            const a = byLabel("wv-hid-A"), s = byLabel("wv-hid-search (saved search)"), u = byLabel(Zotero.getString("pane.collections.unfiled"));
            assert.isOk(a && s && u, "the three entries");
            for (const el of [a, s, u]) assert.isTrue(el.classList.contains("menuitem-iconic"), "iconic: " + el.getAttribute("label"));
            assert.include(probe(a), "collection-tree/16/");
            assert.include(probe(a), "/collection.svg");
            assert.include(probe(s), "/search.svg");
            assert.include(probe(u), "/unfiled.svg");
            assert.notInclude(probe(byLabel("Manage Hidden…")), "collection-tree", "Manage Hidden… keeps no row icon");
        } finally {
            clean();
            await wv._wvHidShow(win, LIB(), ["Vunfiled"]);
        }
        // The group and My Library entries (the Group Libraries line's menu):
        // the sheet's rules, read off detached items the same way.
        for (const [cls, file] of [["group", "library-group.svg"], ["library", "library.svg"], ["duplicates", "duplicates.svg"], ["recentlyRead", "recent.svg"]]) {
            const mi = doc.createXULElement("menuitem");
            mi.classList.add("menuitem-iconic", "wv-hid-icon-" + cls);
            host.appendChild(mi);
            try {
                assert.include(icon(mi), "/" + file, cls);
                if (cls === "recentlyRead") {
                    // Firefox paints the icon part from --menuitem-icon-fill
                    // (currentColor by default): the clock takes the tree's
                    // purple through it (MJT 2026-10-20: it came out grey).
                    const fill = win.getComputedStyle(mi).getPropertyValue("--menuitem-icon-fill").trim();
                    assert.isAbove(fill.length, 0, "an icon fill of its own");
                    assert.notEqual(fill, "currentColor", "not the menu's default");
                }
            }
            finally { mi.remove(); }
        }
    });

    // MJT 2026-10-20 (screenshot): the clock stayed grey in the REAL submenu
    // while the item computed purple -- Firefox 153 paints the icon as an
    // `img.menu-icon` child and Zotero's menu rule sets that child's fill
    // (--fill-secondary); no custom property on the item reaches it. The
    // detached-item probe above cannot see this: the child exists only in an
    // open popup, so this one opens the real menu and submenu.
    it("in the open submenu the Recently Read entry's icon is painted the tree's purple", async function () {
        this.timeout(15000);
        const doc = win.document, menu = doc.getElementById("zotero-collectionmenu");
        let rrIdx = -1;
        for (let i = 0; i < cv.rowCount; i++) { const r = cv.getRow(i); if (r.isRecentlyRead && r.isRecentlyRead() && r.ref.libraryID === LIB()) { rrIdx = i; break; } }
        if (rrIdx < 0) this.skip();   // no Recently Read row on this Zotero
        const treeIcon = doc.getElementById("collection-tree-row-" + rrIdx).querySelector(".icon");
        assert.isOk(treeIcon, "the tree's clock");
        const treeFill = win.getComputedStyle(treeIcon).fill;
        await wv._wvHidHide([cv.getRow(rrIdx)], win);
        let sm = null;
        try {
            await cv.selectLibrary(LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            menu.openPopupAtScreen(win.mozInnerScreenX + 120, win.mozInnerScreenY + 160, true);
            assert.isTrue(await wvT.waitFor(() => menu.state === "open", 3000), "the menu opened");
            sm = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(e => e.localName === "menu");
            assert.isOk(sm, "the Show submenu");
            sm.open = true;
            await sleep(400);
            const items = [...sm.querySelectorAll("menuitem")];
            const rr = items.find(m => m.classList.contains("wv-hid-icon-recentlyRead"));
            assert.isOk(rr, "the Recently Read entry");
            const iconOf = (m) => m.querySelector("img.menu-icon, image.menu-iconic-icon, .menu-icon");
            assert.isOk(iconOf(rr), "the icon element Firefox renders");
            const fill = win.getComputedStyle(iconOf(rr)).fill;
            assert.equal(fill, treeFill, "the submenu's clock takes the tree's purple");
            // The other entries keep Zotero's menu-icon fill (their files carry their colours).
            const other = items.find(m => m !== rr && m.classList.contains("menuitem-iconic") && iconOf(m));
            if (other) assert.notEqual(win.getComputedStyle(iconOf(other)).fill, fill, "only the clock is recoloured");
        } finally {
            try { if (sm) sm.open = false; } catch (_) {}
            try { menu.hidePopup(); } catch (_) {}
            for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
            await wv._wvHidShow(win, LIB(), ["VrecentlyRead"]);
        }
    });

    // MJT 2026-10-20: "The order of the collections in the context menu should
    // be the same as in the collections pane" -- not alphabetical: Recently
    // Read, the collections (nested, each level by name), the saved searches,
    // My Publications, Duplicate Items, Unfiled Items, Retracted Items.
    it("the Show submenu lists the hidden entries in the collections pane's order", async function () {
        this.timeout(15000);
        const doc = win.document, menu = doc.getElementById("zotero-collectionmenu");
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        // A, S hidden already; add B, A1 (under A), Unfiled, Recently Read when present.
        const U = cv.getRow(cv.getRowIndexByID("U" + LIB()));
        let RR = null;
        for (let i = 0; i < cv.rowCount; i++) { const r = cv.getRow(i); if (r.isRecentlyRead && r.isRecentlyRead() && r.ref.libraryID === LIB()) { RR = r; break; } }
        await wv._wvHidHide([B, A1, U].concat(RR ? [RR] : []), win);
        try {
            const listed = wv._wvHidListLibrary(LIB(), win);
            const order = listed.map(h => h.key[0] === "V" ? h.key : h.label);
            const expected = (RR ? ["VrecentlyRead"] : []).concat(["wv-hid-A", "wv-hid-A › wv-hid-A1", "wv-hid-B", "wv-hid-search", "Vunfiled"]);
            assert.deepEqual(order, expected, "pane order: Recently Read, collections by path, searches, special collections");
            await cv.selectLibrary(LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const sm = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(e => e.localName === "menu");
            const labels = [...sm.querySelectorAll("menuitem")].map(m => m.getAttribute("label")).slice(2);   // after Manage Hidden…, Show All
            const want = listed.map(h => h.key[0] === "S" ? h.label + " (saved search)" : h.label);
            assert.deepEqual(labels.filter(l => want.includes(l)), want, "the submenu in the same order");
        } finally {
            clean();
            await wv._wvHidShow(win, LIB(), ["C" + B.key, "C" + A1.key, "Vunfiled", "VrecentlyRead"]);
        }
    });

    it("a right-click on the Group Libraries header opens the Show Hidden Group Libraries menu past the pane's header guard", async function () {
        this.timeout(15000);
        // MJT 2026-10-16: the dot showed on the line but the right-click did
        // nothing -- the collections-pane gesture listener (capture, on the
        // pane) swallows header right-clicks and ran before the tree's menu
        // listener. The runner has no group library, hence no header row:
        // fake one (a .row node the tree resolves through cv.getRow) and stub
        // the hidden-groups listing.
        const tree = win.document.getElementById("collection-tree");
        assert.isOk(tree, "collection tree");
        const FAKE = 987654;
        const origGetRow = cv.getRow, origGroups = wv._wvHidListGroups;
        const fakeRow = { id: "HG", type: "header", ref: { id: "group-libraries-header", label: "Group Libraries", libraryID: -1 },
            isHeader: () => true, isSeparator: () => false, isLibrary: () => false, isCollection: () => false, isSearch: () => false, isGroup: () => false, isFeed: () => false };
        const rowEl = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        rowEl.className = "row"; rowEl.id = "collection-tree-row-" + FAKE;
        const cell = win.document.createElementNS("http://www.w3.org/1999/xhtml", "span"); cell.className = "cell-text"; cell.textContent = "Group Libraries";
        rowEl.appendChild(cell); tree.appendChild(rowEl);
        // Diagnostics for the failure message: each call of the opener, an
        // error it threw, and the popup's state right after it.
        const origOpen = wv._wvHidOpenGroupsMenu, calls = [];
        const popState = () => { const p = win.document.getElementById("wv-hid-groups-menu"); return p ? p.state : "none"; };
        try {
            cv.getRow = function (i) { return i === FAKE ? fakeRow : origGetRow.call(this, i); };
            wv._wvHidListGroups = () => [{ libraryID: 999999, label: "wv-hid-group" }];
            wv._wvHidOpenGroupsMenu = function (...a) {
                calls.push("call(" + a.slice(1).join(",") + ")");
                try { return origOpen.apply(this, a); }
                catch (e) { calls.push("threw " + e); throw e; }
                finally { calls.push("after:" + popState()); }
            };
            const ev = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40, screenX: win.mozInnerScreenX + 40, screenY: win.mozInnerScreenY + 40 });
            cell.dispatchEvent(ev);
            assert.isTrue(ev.defaultPrevented, "the header right-click is ours (no Zotero menu)");
            const pop = await wvT.waitFor(() => { const p = win.document.getElementById("wv-hid-groups-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            assert.isOk(pop, "Weavero's groups menu opened from the header right-click: " + JSON.stringify({ calls, now: popState() }));
            const labels = [...pop.querySelectorAll("menu, menuitem")].map(m => m.getAttribute("label"));
            assert.include(labels, "Show Hidden Group Libraries");
            assert.include(labels, "wv-hid-group");
            try { pop.hidePopup(); } catch (_) {}
            await wvT.waitFor(() => pop.state === "closed", 3000);
            // Nothing hidden there: the right-click is still ours, with a plain
            // Manage Hidden… item, as on a library row (MJT 2026-10-20).
            wv._wvHidListGroups = () => [];
            const origLibs = wv._wvHidListLibraries; wv._wvHidListLibraries = () => [];
            try {
                const ev2 = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40, screenX: win.mozInnerScreenX + 40, screenY: win.mozInnerScreenY + 40 });
                cell.dispatchEvent(ev2);
                assert.isTrue(ev2.defaultPrevented, "still ours with nothing hidden");
                const pop2 = await wvT.waitFor(() => { const p = win.document.getElementById("wv-hid-groups-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
                assert.isOk(pop2, "the menu opened");
                // Hide (the whole section, 2026-10-20) comes first; then the plain item alone.
                assert.deepEqual([...pop2.querySelectorAll("menu, menuitem")].map(m => m.getAttribute("label")), [Zotero.getString("general.hide"), "Manage Hidden…"], "Hide, then the plain item alone");
                try { pop2.hidePopup(); } catch (_) {}
            } finally { wv._wvHidListLibraries = origLibs; }
        } finally {
            cv.getRow = origGetRow; wv._wvHidListGroups = origGroups; wv._wvHidOpenGroupsMenu = origOpen;
            try { rowEl.remove(); } catch (_) {}
            const p2 = win.document.getElementById("wv-hid-groups-menu"); if (p2) { try { p2.hidePopup(); } catch (_) {} try { p2.remove(); } catch (_) {} }
        }
    });

    // MJT's screenshot 2026-10-05: Zotero's own "Delete Saved Search…" came out
    // as "Hide". buildCollectionContextMenu configures the menu BY POSITION and
    // runs a second time while it is open -- an entry inserted among Zotero's
    // shifted every later definition. The build wrap makes Weavero's entries
    // step out before Zotero's pass and come back after it, so Hide can sit in
    // Zotero's own Hide slot (MJT 2026-10-16: "On the context menu of My
    // Publications, the Hide option is above Export. It should be the same also
    // for other collections and libraries").
    it("Hide sits right above Zotero's Delete item; Zotero's second build pass keeps its own labels", async function () {
        this.timeout(15000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        const savedSet = JSON.parse(JSON.stringify(win._wvHid || {}));
        await wv._wvHidShow(win, LIB(), null, []);   // S was hidden by an earlier test
        const hideLabel = Zotero.getString("general.hide");
        try {
            for (const [what, id] of [["saved search", "S" + S.id], ["collection", "C" + B.id]]) {
                await cv.selectByID(id);
                await win.ZoteroPane.buildCollectionContextMenu();
                const delLabel = menu.querySelector("#deleteCollection").getAttribute("label");
                wv._wvHidBuildMenu(win, menu);
                await win.ZoteroPane.buildCollectionContextMenu();   // the delayed second pass
                assert.equal(menu.querySelector("#deleteCollection").getAttribute("label"), delLabel, what + ": Delete keeps its label");
                // The wrap rebuilds into an OPEN menu only (2026-10-20); the
                // menu is closed here, so the rebuild is called as it would.
                wv._wvHidBuildMenu(win, menu);
                const hi = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(k => k.getAttribute("label") === hideLabel);
                assert.isOk(hi, what + ": a Hide item");
                const del = menu.querySelector(":scope > #deleteCollection");
                assert.isFalse(del.hidden, what + ": Zotero shows its Delete item");
                assert.strictEqual(hi.nextElementSibling, del, what + ": Hide right above Delete (MJT 2026-10-20)");
                assert.isFalse(hi.previousElementSibling.classList.contains("wv-hid-entry") && hi.previousElementSibling.localName === "menuseparator",
                    what + ": no separator of ours above it");
                for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
            }
        } finally {
            await wv._wvHidRestore(win, savedSet);   // later tests expect the earlier set
        }
    });

    it("the Show submenu sits in Zotero's Show group on the library row, and survives Zotero's second build pass", async function () {
        this.timeout(15000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        await cv.selectLibrary(LIB());
        await win.ZoteroPane.buildCollectionContextMenu();
        const labelsBefore = [...menu.children].map(k => k.id + "=" + (k.getAttribute("label") || ""));
        wv._wvHidBuildMenu(win, menu);
        const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
        assert.isOk(sm, "submenu present (entries are hidden)");
        const showPub = menu.querySelector("#showPublications");
        assert.isOk(showPub, "Zotero's Show My Publications item");
        assert.strictEqual(sm.previousSibling, showPub, "right after Zotero's last Show item");
        // Zotero's pass again while our entries are in place (the menu is
        // closed here, so the wrap only steps them out; labels must hold).
        await win.ZoteroPane.buildCollectionContextMenu();
        const labelsAfter = [...menu.children].filter(k => !k.classList.contains("wv-hid-entry")).map(k => k.id + "=" + (k.getAttribute("label") || ""));
        assert.deepEqual(labelsAfter, labelsBefore, "Zotero's ids and labels unchanged by our entry");
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
    });

    // 2026-10-20: MJT's My Library and Feeds menus came up scrambled -- two
    // stripped generations of Weavero's Hide + Show Hidden sat among
    // Zotero's nodes (35 for 28), every id shifted ("Rename" on a Hide,
    // emptyTrash / removeLibrary three times). Two causes: entries put back
    // into a CLOSED menu by the build wrap, then stripped of their classes
    // by a reload's window sweep; and a popupshowing while a build of
    // Zotero's still awaited the items list, whose positional pass then
    // stamped our nodes.
    it("nothing of ours goes into a closed menu after Zotero's pass, nor into the menu while a pass is in flight; the ids stay Zotero's", async function () {
        this.timeout(15000);
        const ZP = win.ZoteroPane, menu = win.document.getElementById("zotero-collectionmenu"), iv = ZP.itemsView;
        await cv.selectByID("C" + B.id);
        await ZP.buildCollectionContextMenu();
        const shape = () => [...menu.children].map(k => k.localName + "#" + k.id);
        const before = shape();
        assert.isAbove(before.length, 10, "Zotero's menu built");
        // Closed: a pass with our entries in place steps them out and puts
        // nothing back (dev.77's "whatever was there comes back" did).
        wv._wvHidBuildMenu(win, menu);
        assert.isOk(menu.querySelector(":scope > .wv-hid-entry"), "entries in (the popupshowing step)");
        assert.isOk(menu.querySelector(":scope > [data-wv-owned='hid']"), "every entry carries the ownership marker");
        await ZP.buildCollectionContextMenu();
        assert.isNull(menu.querySelector(":scope > .wv-hid-entry, :scope > [data-wv-owned]"), "a closed menu holds nothing of ours after Zotero's pass");
        assert.deepEqual(shape(), before, "Zotero's ids by position unchanged");
        // In flight: Zotero awaits the items list; popupshowing meanwhile
        // adds nothing; the pass lands on Zotero's nodes alone.
        let release; const gate = new Promise(r => { release = r; });
        const hadOwn = Object.prototype.hasOwnProperty.call(iv, "initialized"), was = iv.initialized;
        Object.defineProperty(iv, "initialized", { value: false, configurable: true, writable: true });
        iv.waitForLoad = () => gate;
        let p;
        try {
            p = ZP.buildCollectionContextMenu();
            assert.isTrue(wv._wvHidMenuBuilding(menu), "a pass in flight is known");
            menu._wvHidH.onShow({ target: menu });                       // the popupshowing handler
            assert.isNull(menu.querySelector(":scope > .wv-hid-entry, :scope > [data-wv-owned]"), "nothing of ours while the pass is in flight");
            release();
            await p;
        } finally {
            if (hadOwn) iv.initialized = was; else delete iv.initialized;
            delete iv.waitForLoad;
        }
        assert.isFalse(wv._wvHidMenuBuilding(menu), "the count is back at zero");
        assert.deepEqual(shape(), before, "Zotero's ids by position unchanged after the in-flight pass");
        const ids = [...menu.children].map(k => k.id).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length, "no duplicate id");
    });

    it("a stray of ours without its classes (a reload's strip) goes before Zotero's pass and at wiring; a menu out of step is logged", async function () {
        this.timeout(15000);
        const ZP = win.ZoteroPane, doc = win.document, menu = doc.getElementById("zotero-collectionmenu");
        const item = () => { const s = doc.createXULElement("menuitem"); s.setAttribute("label", "wv-stray"); s.setAttribute("data-wv-owned", "hid"); s.classList.add("menuitem-iconic"); return s; };
        menu.insertBefore(item(), menu.children[3]);
        const sm = doc.createXULElement("menu"); sm.setAttribute("label", "wv-stray-menu");
        const pp = doc.createXULElement("menupopup"); pp.appendChild(item()); sm.appendChild(pp);
        menu.insertBefore(sm, menu.children[6]);
        await cv.selectLibrary(LIB());
        await ZP.buildCollectionContextMenu();
        assert.isNull(menu.querySelector("[data-wv-owned]"), "the marked nodes are gone before Zotero's pass");
        assert.notOk([...menu.children].find(k => k.getAttribute("label") === "wv-stray-menu"), "a stripped submenu goes with the marked node inside it");
        let ids = [...menu.children].map(k => k.id).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length, "ids unique after the pass");
        menu.appendChild(item());
        wv._wvHidApply(win);
        assert.isNull(menu.querySelector("[data-wv-owned]"), "gone at wiring too");
        // The tripwire: a duplicate id after a pass names the shape once.
        const alien = doc.createXULElement("menuitem"); alien.id = menu.children[0].id || "sync";
        menu.appendChild(alien);
        try {
            wv._wvHidMenuCheck(menu);
            assert.include(String(menu._wvHidMenuWarned), alien.id, "the duplicate is on record");
        } finally { alien.remove(); }
        wv._wvHidMenuCheck(menu);
        assert.equal(menu._wvHidMenuWarned, "", "clean again");
        ids = [...menu.children].map(k => k.id).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length, "ids unique at the end");
    });

    // MJT 2026-10-19: Zotero's own Hide on Unfiled / Duplicates / My
    // Publications / Retracted / Recently Read is a per-library SETTING, for
    // every window; Weavero's hidden set is per window. The special
    // collections join that set as "V<type>" keys. Zotero's setting is never
    // written by a Weavero hide; what it hides is listed too, marked, and
    // shown again through Zotero's own switch.
    it("a special collection hides per window: Unfiled Items leaves this window's tree; Zotero's setting and another window stay untouched", async function () {
        this.timeout(15000);
        const U = () => { const i = cv.getRowIndexByID("U" + LIB()); return i === false ? null : cv.getRow(i); };
        assert.isOk(U(), "Unfiled Items shown at first");
        assert.strictEqual(wv._wvHidKey(U()), "Vunfiled", "a special row's key is its type");
        await wv._wvHidHide([U()], win);
        assert.isNull(U(), "Unfiled Items gone from this window's tree");
        assert.isTrue(VPref.getVirtualCollectionStateForLibrary(LIB(), "unfiled"), "Zotero's own setting untouched");
        assert.isTrue(wv._wvHidIsHidden({ type: "unfiled", libraryID: LIB() }, win), "hidden here");
        assert.isFalse(wv._wvHidIsHidden({ type: "unfiled", libraryID: LIB() }, { _wvHid: { groups: [], hidden: {} } }), "another window hides nothing");
        const listed = wv._wvHidListLibrary(LIB(), win).find(h => h.key === "Vunfiled");
        assert.isOk(listed, "listed with the hidden collections");
        assert.equal(listed.label, Zotero.getString("pane.collections.unfiled"), "under Zotero's own name");
        assert.strictEqual(cv.getRowIndexByID("T" + LIB()) === false, false, "the Bin is still there: it is never hidden");
        await wv._wvHidShow(win, LIB(), ["Vunfiled"]);
        assert.isOk(U(), "back");
    });

    // MJT 2026-10-20: "make that My Library can be selected and hidden". Like
    // a group library -- while another library is shown: the last library
    // shown cannot be hidden, so the pane keeps a row to come back from; a
    // hidden My Library is listed on the Group Libraries line.
    it("My Library can be hidden while another library is shown; the last library shown cannot be; hidden, it reads hidden and is listed for the Group Libraries line", async function () {
        this.timeout(15000);
        const libRef = Zotero.Libraries.userLibrary;
        const menu = win.document.getElementById("zotero-collectionmenu");
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        assert.isFalse(wv._wvHidCanHideLibrary(win, LIB()), "the last library shown cannot be hidden");
        await wv._wvHidHide([libRef], win);
        assert.notStrictEqual(cv.getRowIndexByID("L" + LIB()), false, "refused: My Library still there");
        await cv.selectLibrary(LIB());
        await win.ZoteroPane.buildCollectionContextMenu();
        wv._wvHidBuildMenu(win, menu);
        assert.isNull(menu.querySelector(".wv-hid-entry.zotero-menuitem-hide-collection"), "no Hide on the last library's menu");
        clean();
        const origVisible = wv._wvHidVisibleLibraries;
        try {
            wv._wvHidVisibleLibraries = () => [LIB(), 999999];   // another library shown
            assert.isTrue(wv._wvHidCanHideLibrary(win, LIB()));
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const hi = menu.querySelector(".wv-hid-entry.zotero-menuitem-hide-collection");
            assert.isOk(hi, "Hide offered on My Library");
            assert.equal(hi.getAttribute("label"), Zotero.getString("general.hide"));
            // Right above Show Hidden Collections (MJT 2026-10-20), both in
            // Zotero's Show group -- A and S are hidden here, so the submenu is up.
            const smLib = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            assert.isOk(smLib, "the Show submenu");
            assert.strictEqual(hi.nextElementSibling, smLib, "Hide right above Show Hidden");
            clean();
            // With nothing hidden: right above the plain Manage Hidden… item.
            await wv._wvHidShow(win, LIB(), null, []);
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const hi2 = menu.querySelector(".wv-hid-entry.zotero-menuitem-hide-collection");
            const manage = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(e => e.localName === "menuitem" && e.getAttribute("label") === "Manage Hidden…");
            assert.isOk(hi2 && manage, "Hide and the plain Manage Hidden… item");
            assert.strictEqual(hi2.nextElementSibling, manage, "Hide right above Manage Hidden…");
            clean();
            await wv._wvHidHide([A, S], win);   // the running state back
            // Hidden (the set alone, no refresh: the runner's pane keeps its row)
            win._wvHid.libs = [LIB()];
            assert.isTrue(wv._wvHidIsHidden({ libraryID: LIB() }, win), "the library object the tree asks about reads hidden");
            assert.isTrue(wv._wvHidIsHidden(cv.getRow(cv.getRowIndexByID("L" + LIB())), win), "its row too");
            assert.deepEqual(wv._wvHidListLibraries(win).map(l => l.label), [libRef.name], "listed for the Group Libraries line");
            assert.isTrue(wv._wvHidHasAny(win._wvHid), "counts as something hidden");
        } finally {
            wv._wvHidVisibleLibraries = origVisible;
            win._wvHid.libs = [];
            clean();
        }
    });

    it("on a special collection's menu Weavero's Hide replaces Zotero's; the library menu folds Zotero's Show items into the submenu, both kinds, and Show All restores both", async function () {
        this.timeout(20000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        const savedSet = JSON.parse(JSON.stringify(win._wvHid || {}));
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        const fire = (el) => el.dispatchEvent(new win.Event("command", { bubbles: true }));
        try {
            await cv.selectByID("U" + LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            const dc = menu.querySelector("#deleteCollection");
            assert.isFalse(dc.hidden, "Zotero offers its own Hide (every window) on Unfiled Items");
            wv._wvHidBuildMenu(win, menu);
            assert.isTrue(dc.hidden, "Zotero's Hide steps aside");
            const hi = menu.querySelector(".wv-hid-entry.zotero-menuitem-hide-collection");
            assert.isOk(hi, "Weavero's Hide (this window) in its place");
            assert.equal(hi.getAttribute("label"), Zotero.getString("general.hide"));
            fire(hi);
            clean();
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("U" + LIB()) === false, 8000), "Unfiled Items hidden in this window");
            assert.isTrue(VPref.getVirtualCollectionStateForLibrary(LIB(), "unfiled"), "by Weavero, not by Zotero's setting");
            // Duplicate Items hidden by Zotero's own setting (its menu, any window)
            await win.ZoteroPane.setVirtual(LIB(), "duplicates", false);
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("D" + LIB()) === false, 8000), "Duplicate Items gone, Zotero's way");
            // The special collections never light the dot, hidden by this
            // window or by Zotero's setting (MJT 2026-10-20: "My Library only
            // has Unfiled Items, but the blue dot is not removed"): with this
            // window's set empty, none; with Unfiled Items hidden here, none.
            await wv._wvHidRestore(win, null);
            wv._wvHidDecorate(win);
            const libRow = () => win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
            assert.isNull(libRow().querySelector(".wv-hid-dot"), "no dot for Zotero's own hiding");
            await wv._wvHidHide([cv.getRow(cv.getRowIndexByID("U" + LIB()))], win);
            await sleep(300);
            assert.isNull(libRow().querySelector(".wv-hid-dot"), "no dot for a special collection hidden here either");
            // A collection hidden here: the dot, and its tooltip names Zotero's one.
            await wv._wvHidHide([B], win);
            assert.isTrue(await wvT.waitFor(() => !!libRow().querySelector(".wv-hid-dot"), 3000), "a hidden collection: a dot");
            assert.include(libRow().querySelector(".wv-hid-dot").getAttribute("title"), "1 hidden collection", "counts the collection alone");
            assert.include(libRow().querySelector(".wv-hid-dot").getAttribute("title"), "hidden in every window", "the tooltip names Zotero's");
            await cv.selectLibrary(LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            const showDup = menu.querySelector("#showDuplicates");
            assert.isFalse(showDup.hidden, "Zotero offers Show Duplicate Items");
            wv._wvHidBuildMenu(win, menu);
            assert.isTrue(showDup.hidden, "folded into Weavero's submenu");
            const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
            assert.isOk(sm, "the submenu");
            const items = [...sm.querySelectorAll("menuitem")];
            const labels = items.map(m => m.getAttribute("label"));
            assert.include(labels, Zotero.getString("pane.collections.unfiled"), "hidden in this window");
            assert.include(labels, Zotero.getString("pane.collections.duplicate") + " (all windows)", "hidden by Zotero's setting, marked");
            assert.equal(labels[1], "Show All (" + (wv._wvHidListLibrary(LIB(), win).length + 1) + ")", "both kinds counted");
            fire(items[1]);
            clean();
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("U" + LIB()) !== false && cv.getRowIndexByID("D" + LIB()) !== false, 8000), "both back");
            assert.isTrue(VPref.getVirtualCollectionStateForLibrary(LIB(), "duplicates"), "Zotero's setting switched back on");
        } finally {
            clean();
            try { VPref.setVirtualCollectionStateForLibrary(LIB(), "duplicates", true); } catch (_) {}
            await wv._wvHidRestore(win, savedSet);   // the running state the later tests expect
        }
    });

    // MJT 2026-10-16: "a more advanced selection window for the check list,
    // with the current libraries and collections on the left, and the ones
    // hidden on the right" (intake: live moves with Close, a tree like the
    // collections pane, from the Show submenus only; it replaces the dev.39
    // checklist panel).
    // The manager holds TWO NATIVE collection trees (Zotero's CollectionTree,
    // mounted as its Select Items dialog mounts one; MJT 2026-10-16: "the
    // whole design of the collections pane should be reproduced").
    const openMgr = async () => {
        const mw = wv._wvHidOpenManager(win);
        assert.isOk(mw, "a manager window");
        const diag = () => { try { return JSON.stringify({ closed: mw.closed, ready: mw.document && mw.document.readyState, href: String(mw.location && mw.location.href), hidden: mw.document && mw.document.hidden, err: mw._wvHidMgrErr || null, trees: !!mw._wvHidMgrTrees, search: !!(mw.document && mw.document.getElementById("wv-hid-mgr-search")) }); } catch (e) { return "diag err " + e; } };
        // A boolean: waitFor awaits what the predicate returns, and the ready
        // promise itself resolves to undefined.
        assert.isTrue(await wvT.waitFor(() => !mw.closed && !!mw._wvHidMgrReady, 15000), "the manager started: " + diag());
        try { await mw._wvHidMgrReady; } catch (e) { assert.fail("the manager's build threw: " + e + " " + diag()); }
        assert.isOk(mw._wvHidMgrTrees && mw._wvHidMgrTrees.left && mw._wvHidMgrTrees.right, "two native trees");
        return mw;
    };
    const closeMgr = async (mw) => {
        try { if (mw && !mw.closed) mw.close(); } catch (_) {}
        await wvT.waitFor(() => !mw || mw.closed, 5000);
        await wvT.waitFor(() => !win._wvHidMgrWin, 3000);
    };
    const idxOf = (t, obj) => t.getRowIndexByID((obj.objectType === "search" ? "S" : "C") + obj.id);
    const rowEl = (mw, side, i) => mw.document.querySelector(".wv-hid-mgr-" + side + " #collection-tree-row-" + i);
    const matching = (t) => { const o = []; for (let i = 0; i < t.rowCount; i++) { const r = t.getRow(i); if (r && t._matchesFilter(r).matchesFilter && !(t._hiddenFocusedRow && t._hiddenFocusedRow.id === r.id)) o.push(r.getName()); } return o; };

    it("Manage Hidden… opens a resizable window of two native collection trees: Zotero's rows and icons, unmovable rows marked, Hide and Show move the selection, Escape closes", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        assert.isTrue(inTree(A) && inTree(A1) && inTree(B) && inTree(S), "all shown");
        // The viewer's persisted size belongs to the Plugins Manager too
        // (one key per document URL): the manager must leave it untouched.
        const BV = "chrome://zotero/content/standalone/basicViewer.xhtml";
        const xul = () => ["width", "height", "screenX", "screenY", "sizemode"]
            .map(a => a + "=" + (Services.xulStore.hasValue(BV, "main-window", a) ? Services.xulStore.getValue(BV, "main-window", a) : "-")).join(" ");
        const xul0 = xul();
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide"), showBtn = d.querySelector(".wv-hid-mgr-show");
            // dev.43: the unload hook caught the initial about:blank unload and
            // dropped the handle, so a second call opened a second window.
            assert.strictEqual(win._wvHidMgrWin, mw, "the main window keeps its manager");
            assert.strictEqual(wv._wvHidOpenManager(win), mw, "a second call focuses the same window");
            // "Collections and Libraries Manager" (MJT 2026-10-21), naming its window only when several are open.
            const expectTitle = () => Zotero.getMainWindows().length > 1 ? "Collections and Libraries Manager — " + wv._wvWindowName(win) : "Collections and Libraries Manager";
            assert.equal(d.title, expectTitle());
            await sleep(600);
            assert.equal(d.title, expectTitle(), "the title holds after the viewer's own load");
            // With several main windows the title names this one.
            const origMains = Zotero.getMainWindows;
            /** @type {any} */ (Zotero).getMainWindows = () => [win, /** @type {any} */ ({})];
            try { assert.equal(mw._wvHidMgrTitle(), "Collections and Libraries Manager — " + wv._wvWindowName(win), "named for its window when several are open"); }
            finally { /** @type {any} */ (Zotero).getMainWindows = origMains; }
            // ...and follows the windows as they open and close (MJT 2026-10-21:
            // "the title bar does not directly update when opening a new window").
            const mainsBefore = new Set(Zotero.getMainWindows());
            wv._wvOpenEmptyMainWindow();
            let w2 = null;
            try {
                assert.isTrue(await wvT.waitFor(() => { w2 = Zotero.getMainWindows().find(x => !mainsBefore.has(x)) || null; return !!w2; }, 15000), "a second main window");
                assert.isTrue(await wvT.waitFor(() => d.title === "Collections and Libraries Manager — " + wv._wvWindowName(win), 15000), "the title names the window once two are open: " + d.title);
            } finally {
                for (const x of Zotero.getMainWindows()) { if (!mainsBefore.has(x) && !x.closed) { try { x.close(); } catch (e) {} } }
                await wvT.waitFor(() => Zotero.getMainWindows().every(x => mainsBefore.has(x)), 8000);
            }
            assert.isTrue(await wvT.waitFor(() => d.title === "Collections and Libraries Manager", 5000), "back to the bare title with one window: " + d.title);
            assert.equal(d.querySelector(".wv-hid-mgr-right .wv-hid-mgr-cap").textContent, "Hidden", "the right pane's caption (MJT 2026-10-21: not \"in this window\")");
            assert.notOk(d.getElementById("browser"), "the viewer's browser is gone");
            // Its own size, not the viewer's sizeToContent (dev.43: 8441px tall).
            assert.approximately(mw.outerHeight, 560, 4, "560px tall: " + mw.outerHeight);
            assert.approximately(mw.outerWidth, 760, 4, "760px wide: " + mw.outerWidth);
            const w0 = mw.outerWidth;
            mw.resizeTo(w0 + 60, mw.outerHeight);
            assert.isTrue(await wvT.waitFor(() => mw.outerWidth === w0 + 60, 3000), "resizable: " + mw.outerWidth + " vs " + (w0 + 60));
            // Zotero's own tree, icons and search box.
            assert.equal(d.querySelectorAll("#zotero-collections-tree .virtualized-table").length, 2, "two Zotero trees");
            const iA = idxOf(L, A);
            assert.notStrictEqual(iA, false, "A on the left");
            assert.notStrictEqual(idxOf(L, A1), false, "A1 under A, open as in the pane");
            const ic = rowEl(mw, "left", iA).querySelector(".icon-css.icon-collection");
            assert.isOk(ic, "the collection icon element");
            assert.include(mw.getComputedStyle(ic).backgroundImage, "collection-tree/16/", "Zotero's collection icon is drawn");
            assert.equal(d.getElementById("wv-hid-mgr-search").localName, "search-textbox", "Zotero's own search box");
            // The special collections are offered (2026-10-19), the Feeds row
            // as a whole section (2026-10-20); the Bin never is.
            let specials = 0;
            for (let i = 0; i < L.rowCount; i++) {
                const r = L.getRow(i);
                assert.isFalse(r.isTrash(), "no Bin: " + r.getName());
                if (r.isUnfiled() || r.isDuplicates() || r.isPublications()) specials++;
            }
            assert.isAtLeast(specials, 2, "Unfiled Items, Duplicate Items, My Publications under My Library");
            // My Library: marked, and it cannot arm Hide.
            const iLib = L.getRowIndexByID("L" + LIB());
            const libEl = rowEl(mw, "left", iLib);
            assert.isTrue(libEl.classList.contains("wv-hid-fixed"), "My Library marked as unmovable");
            assert.include(libEl.getAttribute("title"), "cannot be hidden");
            L.selection.select(iLib);
            await sleep(50);
            assert.isTrue(hideBtn.disabled, "My Library selected: Hide stays off");
            assert.isFalse(d.querySelector(".wv-hid-mgr-empty").hidden, "nothing hidden: the right says so");
            // Hide A with the button; its subtree goes with it.
            L.selection.select(idxOf(L, A));
            await sleep(50);
            assert.isFalse(hideBtn.disabled, "A selected: Hide on");
            hideBtn.click();
            assert.isTrue(await wvT.waitFor(() => !inTree(A), 8000), "A hidden in the pane");
            assert.isTrue(await wvT.waitFor(() => idxOf(R, A) !== false, 5000), "A on the right");
            assert.strictEqual(idxOf(L, A), false, "A left the left tree");
            assert.strictEqual(idxOf(L, A1), false, "A1 with it");
            assert.isTrue(d.querySelector(".wv-hid-mgr-empty").hidden, "the empty note goes");
            // On the right: A can come back; A1 only with it; My Library is a place.
            await R.expandToCollection(A1.id);
            const iA1r = idxOf(R, A1);
            assert.notStrictEqual(iA1r, false, "A1 under A on the right");
            // A1 is hidden through A: selectable, its tooltip says Show brings
            // the parent back, and Show does (MJT 2026-10-21, design "A": a
            // collection dropped onto a hidden one was grey with no way back).
            assert.isTrue(await wvT.waitFor(() => rowEl(mw, "right", iA1r) && /with its parent collection: Show brings the parent back/.test(rowEl(mw, "right", iA1r).getAttribute("title") || ""), 3000), "A1 carries the hint");
            assert.isFalse(rowEl(mw, "right", iA1r).classList.contains("wv-hid-fixed"), "A1 is not fixed");
            assert.isFalse(rowEl(mw, "right", idxOf(R, A)).classList.contains("wv-hid-fixed"), "A itself is not marked");
            assert.isTrue(rowEl(mw, "right", R.getRowIndexByID("L" + LIB())).classList.contains("wv-hid-fixed"), "My Library on the right is marked");
            assert.isTrue(R.isSelectable(iA1r), "A1 can be selected");
            R.selection.select(iA1r);
            await sleep(50);
            assert.isFalse(showBtn.disabled, "A1 alone arms Show");
            showBtn.click();
            assert.isTrue(await wvT.waitFor(() => inTree(A) && inTree(A1), 8000), "Show on A1 brings A back, A1 with it");
            assert.isTrue(await wvT.waitFor(() => R.rowCount === 0, 5000), "the right is empty again");
            assert.isTrue(await wvT.waitFor(() => !d.querySelector(".wv-hid-mgr-empty").hidden, 3000), "and says so");
            // Escape closes the window.
            d.documentElement.dispatchEvent(new mw.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            assert.isTrue(await wvT.waitFor(() => mw.closed, 5000), "Escape closed the window");
            await sleep(300);
            assert.isNotOk(win._wvHidMgrWin, "the handle went with the window");
            assert.equal(xul(), xul0, "the Plugins Manager's persisted size is untouched");
        } finally {
            await closeMgr(mw);
            await wv._wvHidHide([A, S], win);   // the running state the later tests expect: A and S hidden, B shown
        }
    });

    it("a double-click acts only on a row in the selection: one on a row outside it (a heading) moves nothing", async function () {
        // MJT 2026-10-19: a double-click on the Group Libraries heading hid
        // the collection selected before -- a heading cannot be selected, and
        // the manager moved the selection whatever row was activated. A
        // dblclick alone (no click selecting the row first) on another row is
        // that case; this runner has no group libraries, so My Library's row
        // stands in for the heading.
        this.timeout(30000);
        const mw = await openMgr();
        try {
            const L = mw._wvHidMgrTrees.left;
            const iB = idxOf(L, B);
            assert.notStrictEqual(iB, false, "B on the left");
            L.selection.select(iB);
            await sleep(50);
            const iLib = L.getRowIndexByID("L" + LIB());
            rowEl(mw, "left", iLib).dispatchEvent(new mw.MouseEvent("dblclick", { bubbles: true, button: 0 }));
            await sleep(800);
            assert.isTrue(inTree(B), "B still shown in the pane");
            assert.notStrictEqual(idxOf(L, B), false, "B still on the left");
            // A double-click on the selected row itself still moves it.
            rowEl(mw, "left", idxOf(L, B)).dispatchEvent(new mw.MouseEvent("dblclick", { bubbles: true, button: 0 }));
            assert.isTrue(await wvT.waitFor(() => !inTree(B), 8000), "B hidden by a double-click on its own row");
        } finally {
            await closeMgr(mw);
            await wv._wvHidShow(win, LIB(), null, []);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-20: "I should also be able to do a right click on one or
    // multiple collections to Hide or Show them" and "When moving collections
    // between Shown and Hidden, the expansion state should stay the same" --
    // a moved collection always arrived closed: Zotero's _saveOpenStates
    // rebuilds a tree's open state from its visible rows only.
    it("a right-click in the manager offers Hide → / ← Show for the selection, and a moved collection keeps its expansion state", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const ctx = async (side, i) => {
                rowEl(mw, side, i).dispatchEvent(new mw.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: mw.mozInnerScreenX + 80, screenY: mw.mozInnerScreenY + 80 }));
                return wvT.waitFor(() => { const p = d.getElementById("wv-hid-mgr-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            };
            const fire = (mi) => mi.dispatchEvent(new mw.Event("command", { bubbles: true }));
            const iA = idxOf(L, A);
            assert.isTrue(L.isContainerOpen(iA), "A open on the left, as in the pane");
            // Right-click A, outside the selection: it becomes the selection; Hide →.
            const pop = await ctx("left", iA);
            assert.isOk(pop, "the menu opened on the left");
            assert.isTrue(L.selection.isSelected(iA), "the right-clicked row is selected");
            const mi = pop.querySelector(".wv-hid-mgr-hideshow");
            assert.equal(mi.getAttribute("label"), "Hide →");
            assert.notEqual(mi.getAttribute("disabled"), "true", "a movable selection: enabled");
            fire(mi);
            try { pop.hidePopup(); } catch (_) {}
            assert.isTrue(await wvT.waitFor(() => !inTree(A), 8000), "A hidden from the menu");
            assert.isTrue(await wvT.waitFor(() => idxOf(R, A) !== false, 5000), "A on the right");
            assert.isTrue(R.isContainerOpen(idxOf(R, A)), "A arrives OPEN on the right, as it was on the left");
            assert.notStrictEqual(idxOf(R, A1), false, "A1 visible under it");
            // Close A on the right; ← Show from the menu: it arrives closed on the left.
            await R.toggleOpenState(idxOf(R, A));
            assert.isFalse(R.isContainerOpen(idxOf(R, A)), "closed on the right");
            const pop2 = await ctx("right", idxOf(R, A));
            assert.isOk(pop2, "the menu opened on the right");
            const mi2 = pop2.querySelector(".wv-hid-mgr-hideshow");
            assert.equal(mi2.getAttribute("label"), "← Show");
            fire(mi2);
            try { pop2.hidePopup(); } catch (_) {}
            assert.isTrue(await wvT.waitFor(() => inTree(A), 8000), "A back in the pane");
            assert.isTrue(await wvT.waitFor(() => idxOf(L, A) !== false, 5000), "A on the left");
            assert.isFalse(L.isContainerOpen(idxOf(L, A)), "A arrives CLOSED on the left, as it was on the right");
            assert.strictEqual(idxOf(L, A1), false, "A1 not shown under it");
            // Several at once: Ctrl-select B too, right-click inside the selection -> "Hide 2 →".
            L.selection.clearSelection();
            L.selection.toggleSelect(idxOf(L, A));
            L.selection.toggleSelect(idxOf(L, B));
            const pop3 = await ctx("left", idxOf(L, B));
            assert.isOk(pop3, "the menu opened on a multi-selection");
            assert.equal(L.selection.selected.size, 2, "a right-click inside the selection keeps it");
            assert.equal(pop3.querySelector(".wv-hid-mgr-hideshow").getAttribute("label"), "Hide 2 →");
            try { pop3.hidePopup(); } catch (_) {}
            // A fixed row: nothing movable selected, the item is disabled.
            L.selection.clearSelection();
            const pop4 = await ctx("left", L.getRowIndexByID("L" + LIB()));
            assert.isOk(pop4, "the menu opened on My Library");
            assert.equal(pop4.querySelector(".wv-hid-mgr-hideshow").getAttribute("disabled"), "true", "nothing movable: disabled");
            try { pop4.hidePopup(); } catch (_) {}
        } finally {
            await closeMgr(mw);
            await wv._wvHidShow(win, LIB(), null, []);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-20: "There should be a way also to recover all hidden at the
    // same time. So a Show All button would be nice."
    it("the manager's ← Show All brings back everything hidden in this window at once", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        const U = cv.getRow(cv.getRowIndexByID("U" + LIB()));
        await wv._wvHidHide([A, B, S, U], win);
        assert.isFalse(inTree(A) || inTree(B) || inTree(S), "four hidden");
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const btn = d.querySelector(".wv-hid-mgr-showall");
            assert.isOk(btn, "the Show All button");
            assert.equal(btn.textContent, "← Show All");
            assert.isFalse(btn.disabled, "something hidden: enabled");
            assert.notStrictEqual(idxOf(R, A), false, "A on the right");
            // The right tree's menu carries it as well.
            rowEl(mw, "right", idxOf(R, A)).dispatchEvent(new mw.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: mw.mozInnerScreenX + 80, screenY: mw.mozInnerScreenY + 80 }));
            const pop = await wvT.waitFor(() => { const p = d.getElementById("wv-hid-mgr-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            assert.isOk(pop, "the right tree's menu");
            assert.isNull(pop.querySelector(".wv-hid-mgr-showall"), "the menu has no Show All (MJT: no need there)");
            assert.equal(pop.querySelector(".wv-hid-mgr-hideshow").getAttribute("label"), "← Show");
            try { pop.hidePopup(); } catch (_) {}
            btn.click();
            assert.isTrue(await wvT.waitFor(() => inTree(A) && inTree(B) && inTree(S) && cv.getRowIndexByID("U" + LIB()) !== false, 8000), "all four back in the pane");
            assert.isTrue(await wvT.waitFor(() => R.rowCount === 0, 5000), "the right is empty");
            assert.isTrue(await wvT.waitFor(() => btn.disabled, 3000), "nothing left: disabled");
            assert.notStrictEqual(idxOf(L, A), false, "A on the left again");
            assert.isFalse(wv._wvHidHasAny(win._wvHid), "the window's set is empty");
        } finally {
            await closeMgr(mw);
            await wv._wvHidShow(win, LIB(), null, []);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-20: "The following options in the context menu of a
    // collection should be available in the manager: New
    // Subcollection, Rename, Move To, Copy To, Hide / Show, Delete
    // Collection, Export." ZoteroPane's versions act on the main window's
    // selection; the manager does the same things on its own rows.
    it("the manager's menu carries Zotero's collection actions on its own rows: New Subcollection, Rename (inline), Move To, Copy To, Delete, Export; F2 and Delete keys", async function () {
        this.timeout(60000);
        await wv._wvHidShow(win, LIB(), null, []);
        const D = new Zotero.Collection(); D.name = "wv-hid-D"; await D.saveTx();
        const D1 = new Zotero.Collection(); D1.name = "wv-hid-D1"; D1.parentID = D.id; await D1.saveTx();
        await sleep(300);
        const mw = await openMgr();
        let copy = null, untitled = null;
        try {
            const d = mw.document;
            const { left: L } = mw._wvHidMgrTrees;
            const ctx = async (side, i) => {
                rowEl(mw, side, i).dispatchEvent(new mw.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: mw.mozInnerScreenX + 80, screenY: mw.mozInnerScreenY + 80 }));
                return wvT.waitFor(() => { const p = d.getElementById("wv-hid-mgr-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            };
            const fire = (el) => el.dispatchEvent(new mw.Event("command", { bubbles: true }));
            // The popup leaves the document on popuphidden, asynchronously: a
            // close is complete when it is gone, or the next right-click can
            // find the old menu still there.
            const close = async (p) => { try { p.hidePopup(); } catch (_) {} await wvT.waitFor(() => !p.isConnected, 2000); };
            await L.expandToCollection(D1.id);
            const pop = await ctx("left", idxOf(L, D));
            assert.isOk(pop, "the menu on D");
            assert.deepEqual([...pop.querySelectorAll(":scope > menuitem, :scope > menu")].map(e => e.className),
                ["wv-hid-mgr-new", "wv-hid-mgr-rename", "wv-hid-mgr-move", "wv-hid-mgr-copy", "wv-hid-mgr-hideshow", "wv-hid-mgr-delete", "wv-hid-mgr-delete-items", "wv-hid-mgr-export"],
                "Zotero's order, Hide above Delete");
            // New Subcollection: Zotero's dialog, stood in for (accepts the proposed name).
            let dialog = null;
            mw.openDialog = (url, _name, _features, io) => { dialog = { url, name: io.name, parent: io.parentCollectionID }; io.dataOut = { name: io.name, libraryID: io.libraryID, parentCollectionID: io.parentCollectionID }; };
            fire(pop.querySelector(".wv-hid-mgr-new")); close(pop);
            assert.isTrue(await wvT.waitFor(() => Zotero.Collections.getByParent(D.id).length === 2, 8000), "a new subcollection under D");
            assert.include(dialog.url, "newCollectionDialog");
            assert.equal(dialog.parent, D.id);
            untitled = Zotero.Collections.getByParent(D.id).find(c => c.id !== D1.id);
            assert.equal(untitled.name, Zotero.getString("pane.collections.untitled"), "Zotero's Untitled name");
            // Rename: the tree's inline editor, committed through the manager's own path.
            const pop2 = await ctx("left", idxOf(L, D));
            fire(pop2.querySelector(".wv-hid-mgr-rename")); await close(pop2);
            assert.isTrue(await wvT.waitFor(() => !!(L._editing && L._editing.ref.id === D.id), 3000), "editing D inline");
            L._editing.editingName = "wv-hid-D-renamed";
            await L.commitEditingName();
            L.stopEditing();
            const col = (id) => /** @type {any} */ (Zotero.Collections.get(id));
            assert.isTrue(await wvT.waitFor(() => col(D.id).name === "wv-hid-D-renamed", 5000), "renamed");
            // Move To: D1 to the library root through the submenu's library item.
            assert.isTrue(await wvT.waitFor(() => idxOf(L, D1) !== false, 5000), "D1 on the left");
            const pop3 = await ctx("left", idxOf(L, D1));
            const mvp = pop3.querySelector(".wv-hid-mgr-move > menupopup");
            mvp.dispatchEvent(new mw.Event("popupshowing", { bubbles: true }));
            const libItem = mvp.querySelector("menuitem");
            assert.equal(libItem.getAttribute("value"), "L" + LIB(), "the library first");
            assert.isFalse(libItem.disabled, "D1 has a parent: the root is a target");
            fire(libItem); await close(pop3);
            assert.isTrue(await wvT.waitFor(() => !col(D1.id).parentID, 5000), "D1 moved to the root");
            // Copy To: D into the library root -> a copy with D's name.
            const before = Zotero.Collections.getByLibrary(LIB()).length;
            const pop4 = await ctx("left", idxOf(L, D));
            const cpp = pop4.querySelector(".wv-hid-mgr-copy > menupopup");
            cpp.dispatchEvent(new mw.Event("popupshowing", { bubbles: true }));
            const target = [...cpp.querySelectorAll("menuitem")].find(m => m.getAttribute("value") === "L" + LIB());
            assert.isOk(target, "the library as a copy target");
            fire(target); await close(pop4);
            assert.isTrue(await wvT.waitFor(() => Zotero.Collections.getByLibrary(LIB()).length === before + 1, 8000), "a copy at the root");
            copy = Zotero.Collections.getByLibrary(LIB()).find(c => c.name === "wv-hid-D-renamed" && c.id !== D.id);
            assert.isOk(copy, "the copy carries D's name");
            // Delete, with Zotero's confirmation answered yes: D1 goes to the trash.
            mw._wvHidMgrConfirm = async () => true;
            const pop5 = await ctx("left", idxOf(L, D1));
            fire(pop5.querySelector(".wv-hid-mgr-delete")); await close(pop5);
            assert.isTrue(await wvT.waitFor(() => { const c = Zotero.Collections.get(D1.id); return !c || c.deleted; }, 8000), "D1 deleted");
            // The Delete key does the same: the untitled subcollection.
            assert.isTrue(await wvT.waitFor(() => idxOf(L, untitled) !== false, 5000), "the subcollection on the left");
            L.selection.select(idxOf(L, untitled));
            await sleep(50);
            rowEl(mw, "left", idxOf(L, untitled)).dispatchEvent(new mw.KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
            assert.isTrue(await wvT.waitFor(() => { const c = Zotero.Collections.get(untitled.id); return !c || c.deleted; }, 8000), "Delete key: deleted");
            // Export… is offered for a collection (the exporter opens a file picker: not driven here).
            const pop6 = await ctx("left", idxOf(L, D));
            assert.isOk(pop6.querySelector(".wv-hid-mgr-export"), "Export… offered");
            assert.notEqual(pop6.querySelector(".wv-hid-mgr-export").getAttribute("disabled"), "true");
            await close(pop6);
            // A special row: Hide / Show alone. The deletions above reload the
            // manager's trees through the notifier: wait for the row to be
            // back (getRowIndexByID sees rendered rows only; a false index
            // left D selected and the full menu came up -- Zotero 11 release
            // gate, 2026-10-21, one run in three).
            assert.isTrue(await wvT.waitFor(() => L.getRowIndexByID("U" + LIB()) !== false, 5000), "Unfiled Items on the left after the reloads");
            const iU = L.getRowIndexByID("U" + LIB());
            const pop7 = await ctx("left", iU);
            assert.isTrue(L.selection.isSelected(iU), "the Unfiled row is the selection the menu is for");
            assert.deepEqual([...pop7.querySelectorAll(":scope > menuitem, :scope > menu")].map(e => e.className), ["wv-hid-mgr-hideshow"], "Unfiled Items: Hide alone");
            await close(pop7);
        } finally {
            await closeMgr(mw);
            for (const c of [copy, untitled, D1, D]) { try { if (c) { const o = Zotero.Collections.get(c.id); if (o) await o.eraseTx(); } } catch (_) {} }
            await wv._wvHidShow(win, LIB(), null, []);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-20: "drag and drop collections and libraries from Shown to
    // Hidden and also within a pane to move collections to become a
    // subcollection of another collection, or back to the root of the
    // library". Decisions: a drop on a row = Zotero's own move; the pane's
    // free area / caption = hide (right) / show (left). Synthetic DragEvents
    // through the real listeners (as pinned-drag.spec.js).
    it("drag and drop in the manager: a drop on a row is Zotero's move (under a collection, back to the root), a drop on a pane's free area hides / shows, a library row drags to the zones", async function () {
        this.timeout(60000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        // A local group for the library drag (Zotero's own test recipe).
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const G = /** @type {any} */ (new Zotero.Group());
        G.id = Zotero.Utilities.rand(100000, 1000000); G.name = "wv-hid-group-dnd"; G.description = "";
        G.editable = true; G.filesEditable = true; G.version = Zotero.Utilities.rand(1000, 10000); G.archived = false;
        await G.saveTx();
        await sleep(400);
        const mw = await openMgr();
        const col = (id) => /** @type {any} */ (Zotero.Collections.get(id));
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const mid = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
            const ev = (type, el, dt) => {
                const [x, y] = mid(el);
                const e = new mw.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: mw.mozInnerScreenX + x, screenY: mw.mozInnerScreenY + y, dataTransfer: dt });
                el.dispatchEvent(e);
                return e;
            };
            const dragRow = (side, t, i) => { t.selection.select(i); const dt = new mw.DataTransfer(); ev("dragstart", rowEl(mw, side, i), dt); return dt; };
            const dropOnRow = async (side, i, dt) => { const el = rowEl(mw, side, i); ev("dragover", el, dt); await sleep(50); ev("drop", el, dt); };
            const dropOnZone = (side, dt) => { const cap = d.querySelector(".wv-hid-mgr-" + side + " .wv-hid-mgr-cap"); ev("dragover", cap, dt); ev("drop", cap, dt); };
            // (1) B onto A's row: Zotero's move -- B becomes A's child.
            let dt = dragRow("left", L, idxOf(L, B));
            assert.include([...dt.types], "zotero/collection", "Zotero's tree drags the collection");
            await dropOnRow("left", idxOf(L, A), dt);
            assert.isTrue(await wvT.waitFor(() => col(B.id).parentID === A.id, 8000), "B under A (a row drop is Zotero's move)");
            // (2) B onto My Library's row: back to the root.
            assert.isTrue(await wvT.waitFor(() => idxOf(L, B) !== false, 5000), "B shown under A on the left");
            dt = dragRow("left", L, idxOf(L, B));
            await dropOnRow("left", L.getRowIndexByID("L" + LIB()), dt);
            assert.isTrue(await wvT.waitFor(() => !col(B.id).parentID, 8000), "B back at the root");
            // (3) B onto the right pane's caption: hidden.
            assert.isTrue(await wvT.waitFor(() => idxOf(L, B) !== false, 5000), "B at the root on the left");
            dt = dragRow("left", L, idxOf(L, B));
            dropOnZone("right", dt);
            assert.isTrue(await wvT.waitFor(() => !inTree(B), 8000), "B hidden by the drop on the zone");
            assert.isTrue(await wvT.waitFor(() => idxOf(R, B) !== false, 5000), "B on the right");
            // (4) B from the right onto the left pane's caption: shown.
            dt = dragRow("right", R, idxOf(R, B));
            dropOnZone("left", dt);
            assert.isTrue(await wvT.waitFor(() => inTree(B), 8000), "B shown by the drop on the zone");
            // (4b) A lit zone unlights itself when the drag ends elsewhere (no
            // dragleave, no drop: Escape, a drop outside; MJT 2026-10-21, "what
            // is the blue line around SHOWN?").
            dt = dragRow("left", L, idxOf(L, B));
            const leftPane = d.querySelector(".wv-hid-mgr-left");
            ev("dragover", d.querySelector(".wv-hid-mgr-left .wv-hid-mgr-cap"), dt);
            assert.isTrue(leftPane.classList.contains("wv-hid-mgr-dropzone"), "lit while dragged over");
            assert.isTrue(await wvT.waitFor(() => !leftPane.classList.contains("wv-hid-mgr-dropzone"), 2000), "unlit on its own after the drag went elsewhere");
            // (5) The group's row: Weavero's own drag (Zotero's tree drags no library), to the right zone -> hidden; back from the right.
            assert.isTrue(await wvT.waitFor(() => L.getRowIndexByID("L" + G.libraryID) !== false, 5000), "the group on the left");
            dt = dragRow("left", L, L.getRowIndexByID("L" + G.libraryID));
            assert.notInclude([...dt.types], "zotero/collection");
            assert.include([...dt.types], "application/x-weavero-hid-rows", "Weavero's type for a library row");
            dropOnZone("right", dt);
            assert.isTrue(await wvT.waitFor(() => wv._wvHidState(win).groups.includes(G.libraryID), 8000), "the group hidden by the drop");
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("L" + G.libraryID) !== false, 5000), "the group on the right");
            dt = dragRow("right", R, R.getRowIndexByID("L" + G.libraryID));
            dropOnZone("left", dt);
            assert.isTrue(await wvT.waitFor(() => !wv._wvHidState(win).groups.includes(G.libraryID), 8000), "the group shown by the drop");
        } finally {
            await closeMgr(mw);
            try { const b = col(B.id); if (b && b.parentID) { b.parentID = null; await b.saveTx(); } } catch (_) {}
            try { await G.eraseTx(); } catch (_) {}
            await sleep(300);
            await wv._wvHidShow(win, LIB(), null, []);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-21: "I should be able to reorganize hidden collections in
    // the Hidden part. So a drag to a grey line should still work, just
    // making it hidden in that library or collection" and "when I drag a
    // collection to make it a child of another collection, it should
    // automatically expand, as in the collections pane". A grey row is a
    // shown ancestor kept as context on the right: a drop on it was Zotero's
    // move alone, the collection stayed shown and never appeared on the
    // right. Now the pane a row drop lands in decides the hidden state, the
    // target opens and the moved collection is selected in that tree.
    it("a row drop in the manager: onto a grey context row of the Hidden pane re-parents AND hides; onto a Shown-pane row re-parents and shows; the target expands and the moved collection is selected there, as in the collections pane", async function () {
        this.timeout(60000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        await wv._wvHidHide([A1], win);   // A shown with a hidden child: a grey context row on the right
        const mw = await openMgr();
        const col = (id) => /** @type {any} */ (Zotero.Collections.get(id));
        try {
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const mid = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
            const ev = (type, el, dt) => {
                const [x, y] = mid(el);
                const e = new mw.DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: mw.mozInnerScreenX + x, screenY: mw.mozInnerScreenY + y, dataTransfer: dt });
                el.dispatchEvent(e);
                return e;
            };
            const dragRow = (side, t, i) => { t.selection.select(i); const dt = new mw.DataTransfer(); ev("dragstart", rowEl(mw, side, i), dt); return dt; };
            const dropOnRow = async (side, i, dt) => { const el = rowEl(mw, side, i); ev("dragover", el, dt); await sleep(50); ev("drop", el, dt); };
            const selectedIDs = (t) => { const o = []; for (let i = 0; i < t.rowCount; i++) if (t.selection.isSelected(i)) o.push(t.getRow(i).id); return o; };
            assert.isTrue(await wvT.waitFor(() => idxOf(R, A) !== false && idxOf(R, A1) !== false, 5000), "A (context) and A1 (hidden) on the right");
            assert.isTrue(rowEl(mw, "right", idxOf(R, A)).classList.contains("wv-hid-fixed"), "A is a grey context row");
            // (1) B (shown, left) onto grey A (right): under A AND hidden; A open on the right, B selected there.
            let dt = dragRow("left", L, idxOf(L, B));
            await dropOnRow("right", idxOf(R, A), dt);
            assert.isTrue(await wvT.waitFor(() => col(B.id).parentID === A.id, 8000), "B under A (Zotero's move)");
            assert.isTrue(await wvT.waitFor(() => wv._wvHidIsHidden(B, win), 8000), "B hidden by the drop into the Hidden pane");
            assert.isTrue(await wvT.waitFor(() => idxOf(R, B) !== false, 8000), "B on the right under A");
            assert.isTrue(R.isContainerOpen(idxOf(R, A)), "A expanded on the right");
            assert.isTrue(await wvT.waitFor(() => selectedIDs(R).join() === "C" + B.id, 5000), "B selected on the right: " + selectedIDs(R).join());
            assert.isFalse(inTree(B), "B gone from the pane");
            // (2) B (hidden, right) onto My Library's row on the LEFT: back to the root AND shown; selected on the left.
            dt = dragRow("right", R, idxOf(R, B));
            await dropOnRow("left", L.getRowIndexByID("L" + LIB()), dt);
            assert.isTrue(await wvT.waitFor(() => !col(B.id).parentID, 8000), "B back at the root");
            assert.isTrue(await wvT.waitFor(() => !wv._wvHidIsHidden(B, win) && inTree(B), 8000), "B shown by the drop into the Shown pane");
            assert.isTrue(await wvT.waitFor(() => idxOf(L, B) !== false, 5000), "B on the left");
            assert.isTrue(await wvT.waitFor(() => selectedIDs(L).join() === "C" + B.id, 5000), "B selected on the left: " + selectedIDs(L).join());
            // (3) B onto A within the Shown pane: under A, A expanded, B selected -- the pane's behaviour.
            // A1 shown again first: with its only child hidden A reads EMPTY on
            // the Shown side (no arrow, dev.107) and cannot be closed at all.
            await wv._wvHidShow(win, LIB(), [wv._wvHidKey(A1)]);
            assert.isTrue(await wvT.waitFor(() => { const i = idxOf(L, A); return i !== false && !L.isContainerEmpty(i); }, 8000), "A holds a shown child again");
            const iA = idxOf(L, A);
            if (L.isContainerOpen(iA)) await L.toggleOpenState(iA);
            assert.isFalse(L.isContainerOpen(idxOf(L, A)), "A closed before the drop");
            dt = dragRow("left", L, idxOf(L, B));
            await dropOnRow("left", idxOf(L, A), dt);
            assert.isTrue(await wvT.waitFor(() => col(B.id).parentID === A.id, 8000), "B under A");
            assert.isTrue(await wvT.waitFor(() => idxOf(L, B) !== false && L.isContainerOpen(idxOf(L, A)), 8000), "A expanded on the left, B visible");
            assert.isTrue(await wvT.waitFor(() => selectedIDs(L).join() === "C" + B.id, 5000), "B selected on the left: " + selectedIDs(L).join());
            assert.isFalse(wv._wvHidIsHidden(B, win), "still shown");
        } finally {
            await closeMgr(mw);
            try { const b = col(B.id); if (b && b.parentID) { b.parentID = null; await b.saveTx(); } } catch (_) {}
            await sleep(300);
            await wv._wvHidShow(win, LIB(), null, []);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-21 (screenshot): "I find it confusing that Hide is still
    // enabled even though I am working in the right pane" -- each pane kept
    // its own selection and armed its own button. One selection across the
    // two panes now: selecting in one clears the other.
    it("one selection across the manager's two panes: selecting on one side clears the other side, and only that side's button is on", async function () {
        this.timeout(40000);
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide"), showBtn = d.querySelector(".wv-hid-mgr-show");
            assert.notStrictEqual(idxOf(L, B), false, "B shown"); assert.notStrictEqual(idxOf(R, A), false, "A hidden");
            L.selection.select(idxOf(L, B));
            assert.isTrue(await wvT.waitFor(() => !hideBtn.disabled, 3000), "B selected on the left: Hide on");
            R.selection.select(idxOf(R, A));
            assert.isTrue(await wvT.waitFor(() => L.selection.count === 0 && hideBtn.disabled && !showBtn.disabled, 3000),
                "A selected on the right: the left's selection gone, Hide off, Show on (" + L.selection.count + "/" + hideBtn.disabled + "/" + showBtn.disabled + ")");
            L.selection.select(idxOf(L, B));
            assert.isTrue(await wvT.waitFor(() => R.selection.count === 0 && !hideBtn.disabled && showBtn.disabled, 3000),
                "back on the left: the right's selection gone, Hide on, Show off");
            // A refresh keeps the one selection where it is.
            await mw._wvHidMgrRender();
            assert.strictEqual(R.selection.count, 0, "the right stays empty through a refresh");
            assert.isTrue(await wvT.waitFor(() => !hideBtn.disabled && showBtn.disabled, 3000), "the buttons as before the refresh");
        } finally {
            await closeMgr(mw);
        }
    });

    // MJT 2026-10-21: "Can you do the same pinning in the Hidden Manager?" --
    // the collections pane's pinned parents (sticky scroll) in the manager's
    // two trees, under the same settings; a pinned row's right-click opens
    // the manager's own menu for it, the row selected as from its own row.
    it("the manager's trees pin the parents of the rows scrolled to the top, as the collections pane does and under its setting; a pinned row's right-click opens the manager's menu for it", async function () {
        this.timeout(60000);
        const VE = "weavero.enableVisualExtras", SP = "weavero.collectionsStickyParents", SM = "weavero.collectionsStickyMax";
        const prev = { ve: Zotero.Prefs.get(VE), sp: Zotero.Prefs.get(SP), sm: Zotero.Prefs.get(SM) };
        const back = (k, v, def) => { try { Zotero.Prefs.set(k, v === undefined ? def : v); } catch (e) {} };
        Zotero.Prefs.set(VE, true); Zotero.Prefs.set(SP, true); Zotero.Prefs.set(SM, 3);
        await wv._wvHidShow(win, LIB(), null, []);
        // A chain deep enough to scroll the manager's tree: D0 > D1 > ... under A1.
        const chain = [];
        let pid = A1.id;
        for (let k = 0; k < 24; k++) { const c = new Zotero.Collection(); c.name = "wv-hid-D" + k; c.parentID = pid; await c.saveTx(); chain.push(c); pid = c.id; }
        let mw = null;
        try {
            mw = await openMgr();
            const d = mw.document;
            const { left: L } = mw._wvHidMgrTrees;
            const last = chain[chain.length - 1];
            await L.expandToCollection(last.id);
            const iLast = idxOf(L, last);
            assert.notStrictEqual(iLast, false, "the deepest row in the Shown tree");
            L.tree._jsWindow.scrollToRow(iLast, true);   // forced: as far down as the tree goes
            const names = () => [...d.querySelectorAll(".wv-hid-mgr-left #wv-hid-mgr-sticky-left .cell-text")].map(e => e.textContent);
            assert.isTrue(await wvT.waitFor(() => names().length === 3, 5000), "three pinned parents (the cap): " + JSON.stringify(names()));
            assert.deepEqual(names(), [/** @type {any} */ (Zotero.Libraries.get(LIB())).name, A.name, A1.name], "outermost first, capped at 3");
            assert.lengthOf(d.querySelectorAll(".wv-hid-mgr-right #wv-hid-mgr-sticky-right"), 0, "nothing pinned on the Hidden side, which is at its top");
            // A pinned row's right-click: the manager's own menu, the row selected as from its own row.
            const rows = [...d.querySelectorAll("#wv-hid-mgr-sticky-left .row")];
            const offBefore = L.tree._jsWindow.scrollOffset;
            const ev = new mw.MouseEvent("contextmenu", { bubbles: true, cancelable: true, screenX: mw.screenX + 100, screenY: mw.screenY + 100 });
            rows[1].dispatchEvent(ev);
            assert.isTrue(ev.defaultPrevented, "the browser's own menu is not wanted");
            assert.strictEqual(L.tree._jsWindow.scrollOffset, offBefore, "no scroll to the row: the pinned copy stands for it (Zotero's select scrolls otherwise)");
            const pop = await wvT.waitFor(() => { const p = d.getElementById("wv-hid-mgr-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            assert.isOk(pop, "the manager's menu");
            assert.isTrue(L.selection.isSelected(idxOf(L, A)), "A (the pinned row) selected for the menu");
            assert.isOk(pop.querySelector(".wv-hid-mgr-hideshow"), "with Hide for the row");
            try { pop.hidePopup(); } catch (e) {}
            // The setting off: the pinned rows go from the open manager; on again: back.
            Zotero.Prefs.set(SP, false);
            assert.isTrue(await wvT.waitFor(() => !d.getElementById("wv-hid-mgr-sticky-left"), 5000), "off: no pinned rows");
            Zotero.Prefs.set(SP, true);
            assert.isTrue(await wvT.waitFor(() => names().length === 3, 5000), "on again: pinned");
        } finally {
            const trees = mw && mw._wvHidMgrTrees;
            await closeMgr(mw);
            // The closed trees unregistered before the erase (see collection-drop-lib.spec.js).
            try { await wvT.waitFor(() => !!(trees && trees.left._uninitialized && trees.right._uninitialized), 5000); } catch (e) {}
            back(VE, prev.ve, true); back(SP, prev.sp, true); back(SM, prev.sm, 7);
            try { if (chain[0]) await chain[0].eraseTx(); } catch (e) {}
        }
    });

    // MJT 2026-10-21 (screenshot): "Test collection1 still has an expand
    // arrow, even though it does not have a child collection anymore" -- its
    // only child was hidden. Zotero's isContainerEmpty reads the database
    // (hasChildCollections), not the tree, so the arrow stayed over nothing;
    // now a collection is empty when no child collection makes it into the
    // tree, in the pane and in the manager alike.
    it("a collection whose every child collection is hidden shows no arrow, in the pane and in the manager's Shown pane; the arrow returns with the child", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        const iA = () => cv.getRowIndexByID("C" + A.id);
        const paneArrow = () => { const el = win.document.getElementById("collection-tree-row-" + iA()); return el ? (el.querySelector(".twisty") ? "arrow" : (el.querySelector(".spacer-twisty") ? "spacer" : "none")) : "no row"; };
        assert.isFalse(cv.isContainerEmpty(iA()), "A holds A1");
        assert.strictEqual(paneArrow(), "arrow");
        await wv._wvHidHide([A1], win);
        assert.isTrue(await wvT.waitFor(() => !inTree(A1), 8000), "A1 hidden");
        assert.isTrue(cv.isContainerEmpty(iA()), "A reads empty with its only child hidden");
        assert.isTrue(await wvT.waitFor(() => paneArrow() === "spacer", 5000), "no arrow on A's row: " + paneArrow());
        const mw = await openMgr();
        try {
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const iLA = idxOf(L, A);
            assert.isTrue(L.isContainerEmpty(iLA), "empty on the manager's Shown side too");
            // The rule itself, through the tree's own renderItem (its twisty
            // branch reads isContainerEmpty): deterministic, paint or no paint.
            const rendered = L.renderItem(iLA, L.selection, null, L.tree && L.tree.props ? L.tree.props.columns : undefined);
            assert.isOk(rendered && rendered.querySelector(".spacer-twisty") && !rendered.querySelector(".twisty"), "the manager renders no arrow for A: " + (rendered ? rendered.className : "no div"));
            // The live row: after an explicit repaint request (what the manager's
            // build does after its wraps), the rows the table has rendered are
            // rebuilt synchronously (windowed-list.js invalidate ->
            // rerenderItem). Both CI runners had left the arrow on that row for
            // 5 s with the window reporting visible (2026-10-22, test.yml on
            // feb95875 and 9432ee07) while this machine, Zotero 10.0.6 and one
            // xvfb run repainted it -- the repaint is asked for here, and the
            // message carries what the row holds if it still disagrees.
            const mgrArrow = () => { const el = rowEl(mw, "left", iLA); return el ? (el.querySelector(".twisty") ? "arrow" : (el.querySelector(".spacer-twisty") ? "spacer" : "none")) : "no row"; };
            const mgrDiag = () => { try { const el = rowEl(mw, "left", iLA); const t = L.tree; return JSON.stringify({ row: el ? (el.querySelector(".cell-text") || {}).textContent : null, cls: el ? el.className : null, rows: L.rowCount, mounted: !!t, jsWindow: !!(t && t._jsWindow), rendered: t && t._jsWindow && t._jsWindow._renderedRows ? t._jsWindow._renderedRows.size : null, hidden: mw.document.hidden, w: mw.outerWidth, h: mw.outerHeight }); } catch (e) { return "diag err " + e; } };
            try { if (L.tree) L.tree.invalidate(); } catch (e) {}
            assert.isTrue(await wvT.waitFor(() => mgrArrow() === "spacer", 5000), "no arrow there: " + mgrArrow() + " " + mgrDiag());
            assert.isFalse(R.isContainerEmpty(idxOf(R, A)), "on the Hidden side A is the context row holding A1: an arrow");
            await wv._wvHidShow(win, LIB(), [wv._wvHidKey(A1)]);
            await cv.expandToCollection(A1.id);
            assert.isTrue(await wvT.waitFor(() => inTree(A1), 8000), "A1 back");
            assert.isFalse(cv.isContainerEmpty(iA()), "A holds a shown child again");
            assert.isTrue(await wvT.waitFor(() => paneArrow() === "arrow", 5000), "the arrow is back: " + paneArrow());
            assert.isTrue(await wvT.waitFor(() => { const i = idxOf(L, A); return i !== false && !L.isContainerEmpty(i); }, 8000), "the manager's Shown side too");
        } finally {
            await closeMgr(mw);
            await wv._wvHidShow(win, LIB(), null, []);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-20: "I should also be able to hide Group Libraries (all group
    // libraries at once), and also the Feeds for someone who never uses them."
    // A local group and a feed, Zotero's own test recipe (test/content/
    // support.js createGroup / createFeed); the runner never syncs.
    it("the Group Libraries and Feeds sections hide as one each: every group and feed leaves the tree (a group joined later too), My Library's dot and Show submenu bring them back, and the heading / the Feeds row move across in the manager", async function () {
        this.timeout(60000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        const rowIdx = (id) => cv.getRowIndexByID(id);
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const mkGroup = async (name) => {
            const g = /** @type {any} */ (new Zotero.Group());
            g.id = Zotero.Utilities.rand(100000, 1000000); g.name = name; g.description = "";
            g.editable = true; g.filesEditable = true; g.version = Zotero.Utilities.rand(1000, 10000); g.archived = false;
            await g.saveTx();
            return g;
        };
        const G1 = await mkGroup("wv-hid-group-1");
        const F = /** @type {any} */ (new Zotero.Feed());
        F.name = "wv-hid-feed"; F.description = ""; F.url = "http://wv-hid-test.invalid/feed.rss";
        F.refreshInterval = 12; F.cleanupReadAfter = 2; F.cleanupUnreadAfter = 30;
        await F.saveTx();
        let G2 = null, mw = null;
        try {
            assert.isTrue(await wvT.waitFor(() => wv._wvHidGroupsHeaderShown(win) && rowIdx("F1") !== false, 5000), "the heading and the Feeds row are in the pane");
            assert.notStrictEqual(rowIdx("L" + G1.libraryID), false, "the group's row");
            // The Group Libraries section, as the heading's menu hides it (its ref).
            assert.isTrue(wv._wvHidCanHideSection(win, "groups"));
            await wv._wvHidHide([{ id: "group-libraries-header", libraryID: -1 }], win);
            assert.deepEqual(wv._wvHidState(win).sections, ["groups"]);
            assert.isFalse(wv._wvHidGroupsHeaderShown(win), "the heading is gone");
            assert.strictEqual(rowIdx("L" + G1.libraryID), false, "and the group with it");
            assert.isTrue(wv._wvHidIsHidden(G1, win), "the group reads hidden");
            assert.isFalse(wv._wvHidCanHideSection(win, "groups"), "not twice");
            assert.isFalse(wv._wvHidCanHideLibrary(win, LIB()), "My Library is the last library shown now");
            // A group joined later stays out.
            G2 = await mkGroup("wv-hid-group-2");
            await sleep(500);
            assert.strictEqual(rowIdx("L" + G2.libraryID), false, "a new group is hidden too");
            assert.isFalse(wv._wvHidGroupsHeaderShown(win), "no heading for it");
            // The Feeds row: Hide on its own menu, the whole section.
            await cv.selectByID("F1");
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const hi = menu.querySelector(":scope > .wv-hid-entry.zotero-menuitem-hide-collection");
            assert.isOk(hi, "Hide on the Feeds row");
            assert.equal(hi.getAttribute("label"), Zotero.getString("general.hide"));
            clean();
            await wv._wvHidHide([cv.getRow(rowIdx("F1")).ref], win);
            assert.deepEqual(wv._wvHidState(win).sections, ["groups", "feeds"]);
            assert.strictEqual(rowIdx("F1"), false, "the Feeds row is gone");
            assert.isTrue(wv._wvHidIsHidden(F, win), "the feed reads hidden");
            // My Library's dot names both; its Show submenu lists both with the rows' icons.
            await cv.selectLibrary(LIB());
            const dotTitle = () => { const el = win.document.getElementById("collection-tree-row-" + rowIdx("L" + LIB())); const d = el && el.querySelector(".wv-hid-dot"); return d ? d.getAttribute("title") || "" : ""; };
            // The rows' labels are Zotero's (the runner follows the OS locale: "Bibliothèques de groupe", "Flux").
            const gl = Zotero.getString("pane.collections.groupLibraries"), fl = Zotero.getString("pane.collections.feedLibraries");
            assert.isTrue(await wvT.waitFor(() => dotTitle().includes("the " + gl + " section") && dotTitle().includes("the " + fl + " section"), 3000), "the dot names both sections: " + dotTitle());
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const sm = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(e => e.localName === "menu");
            assert.isOk(sm, "the Show submenu");
            assert.equal(sm.getAttribute("label"), "Show Hidden Collections and Libraries", "A and S hidden here too, plus the two sections");
            const items = [...sm.querySelectorAll("menuitem")];
            const gEntry = items.find(m => m.getAttribute("label") === Zotero.getString("pane.collections.groupLibraries"));
            const fEntry = items.find(m => m.getAttribute("label") === Zotero.getString("pane.collections.feedLibraries"));
            assert.isOk(gEntry && fEntry, "Group Libraries and Feeds entries: " + items.map(m => m.getAttribute("label")).join(" | "));
            assert.isTrue(gEntry.classList.contains("wv-hid-icon-groups") && fEntry.classList.contains("wv-hid-icon-feeds"), "with the rows' icons");
            // Show All counts the sections with My Library's own hidden entries (A and S here).
            assert.equal(items.find(m => /^Show All/.test(m.getAttribute("label"))).getAttribute("label"), "Show All (" + (wv._wvHidListLibrary(LIB(), win).length + 2) + ")");
            clean();
            // Back: the Feeds entry's own call, then the groups through Show All's.
            await wv._wvHidShow(win, null, null, null, null, ["feeds"]);
            assert.notStrictEqual(rowIdx("F1"), false, "the Feeds row is back");
            assert.deepEqual(wv._wvHidState(win).sections, ["groups"]);
            await wv._wvHidShow(win, LIB(), null, [], null, ["groups"]);
            assert.isTrue(wv._wvHidGroupsHeaderShown(win), "the heading is back");
            assert.notStrictEqual(rowIdx("L" + G1.libraryID), false, "G1 back");
            assert.notStrictEqual(rowIdx("L" + G2.libraryID), false, "G2 back");
            assert.deepEqual(wv._wvHidState(win).sections, []);
            // The manager: the heading and the Feeds row can be selected on the
            // left and hide their section; a single feed cannot; on the right
            // they show it back, and a group under the hidden section is fixed.
            mw = await openMgr();
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide"), showBtn = d.querySelector(".wv-hid-mgr-show");
            assert.notStrictEqual(L.getRowIndexByID("HG"), false, "the heading on the left");
            assert.notStrictEqual(L.getRowIndexByID("F1"), false, "the Feeds row on the left");
            assert.isTrue(L.isSelectable(L.getRowIndexByID("HG")), "the heading can be selected");
            assert.isTrue(L.isSelectable(L.getRowIndexByID("F1")), "the Feeds row can be selected");
            const iFeed = L.getRowIndexByID("L" + F.libraryID);
            if (iFeed !== false) assert.isTrue(L.isSelectable(iFeed), "a single feed can be selected on its own too (2026-10-21)");
            L.selection.select(L.getRowIndexByID("HG"));
            await sleep(50);
            assert.isFalse(hideBtn.disabled, "the heading selected: Hide on");
            hideBtn.click();
            assert.isTrue(await wvT.waitFor(() => !wv._wvHidGroupsHeaderShown(win), 8000), "the section hidden from the manager");
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("HG") !== false && R.getRowIndexByID("L" + G1.libraryID) !== false, 5000), "the heading and the groups on the right");
            const iG1r = R.getRowIndexByID("L" + G1.libraryID);
            // A group under the hidden section can be selected too; its tooltip
            // says Show brings the section back (MJT 2026-10-21, design "A").
            assert.isTrue(await wvT.waitFor(() => { const el = rowEl(mw, "right", iG1r); return !!el && /with the Group Libraries section: Show brings the section back/.test(el.getAttribute("title") || ""); }, 3000), "a group under the hidden section carries the hint");
            assert.isFalse(rowEl(mw, "right", iG1r).classList.contains("wv-hid-fixed"), "and is not fixed");
            assert.isTrue(R.isSelectable(iG1r), "it can be selected");
            assert.isTrue(R.isSelectable(R.getRowIndexByID("HG")), "the heading can");
            L.selection.select(L.getRowIndexByID("F1"));
            await sleep(50);
            assert.isFalse(hideBtn.disabled, "the Feeds row selected: Hide on");
            hideBtn.click();
            assert.isTrue(await wvT.waitFor(() => rowIdx("F1") === false, 8000), "the Feeds section hidden from the manager");
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("F1") !== false, 5000), "the Feeds row on the right");
            // Both back at once.
            R.selection.clearSelection();
            R.selection.toggleSelect(R.getRowIndexByID("HG"));
            R.selection.toggleSelect(R.getRowIndexByID("F1"));
            await sleep(50);
            assert.equal(R.selection.selected.size, 2, "both selected");
            assert.isFalse(showBtn.disabled, "Show on");
            showBtn.click();
            assert.isTrue(await wvT.waitFor(() => wv._wvHidGroupsHeaderShown(win) && rowIdx("F1") !== false, 8000), "both sections back in the pane");
            assert.deepEqual(wv._wvHidState(win).sections, []);
        } finally {
            clean();
            if (mw) await closeMgr(mw);
            try { await wv._wvHidShow(win, null, null, null, null, ["groups", "feeds"]); } catch (_) {}
            // Erase errors are kept for the next test's message (a surviving group would make My Library hideable there).
            const Zt = /** @type {any} */ (Zotero);
            Zt._wvHidTestCleanup = [];
            for (const o of [G2, G1, F]) { try { if (o) await o.eraseTx(); } catch (e) { Zt._wvHidTestCleanup.push(String(o && o.name) + ": " + e); } }
            await sleep(400);
            try { await wv._wvHidShow(win, LIB(), null, []); await wv._wvHidHide([A, S], win); } catch (_) {}   // the running state: A and S hidden, B shown
        }
    });

    // MJT 2026-10-21: "I should also be able to hide individual feeds, with the
    // blue dot on the Feeds lines, same as My Library".
    it("a feed hides on its own: its row leaves the tree while the Feeds row stays with a blue dot and a Show Hidden Feeds submenu under its Hide; a feed's menu gets Hide above Unsubscribe; the manager moves a feed both ways", async function () {
        this.timeout(60000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        const clean = () => { for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove(); };
        const rowIdx = (id) => cv.getRowIndexByID(id);
        const mkFeed = async (name) => {
            const F = /** @type {any} */ (new Zotero.Feed());
            F.name = name; F.description = ""; F.url = "http://wv-hid-test.invalid/" + name + ".rss";
            F.refreshInterval = 12; F.cleanupReadAfter = 2; F.cleanupUnreadAfter = 30;
            await F.saveTx();
            return F;
        };
        const F1 = await mkFeed("wv-hid-feed-a"), F2 = await mkFeed("wv-hid-feed-b");
        let mw = null;
        try {
            assert.isTrue(await wvT.waitFor(() => rowIdx("F1") !== false && rowIdx("L" + F1.libraryID) !== false && rowIdx("L" + F2.libraryID) !== false, 5000), "the Feeds row and both feeds are in the pane");
            // A feed's menu: Hide, right above Zotero's Unsubscribe (its Delete slot).
            await cv.selectByID("L" + F1.libraryID);
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const hi = menu.querySelector(":scope > .wv-hid-entry.zotero-menuitem-hide-collection");
            assert.isOk(hi, "Hide on a feed's menu");
            assert.equal(hi.getAttribute("label"), Zotero.getString("general.hide"));
            assert.strictEqual(hi.nextElementSibling && hi.nextElementSibling.id, "deleteCollectionAndItems", "right above Unsubscribe");
            clean();
            await wv._wvHidHide([cv.getRow(rowIdx("L" + F1.libraryID)).ref], win);
            assert.deepEqual(wv._wvHidState(win).feeds, [F1.libraryID]);
            assert.strictEqual(rowIdx("L" + F1.libraryID), false, "the feed's row is gone");
            assert.notStrictEqual(rowIdx("L" + F2.libraryID), false, "the other feed stays");
            assert.notStrictEqual(rowIdx("F1"), false, "the Feeds row stays");
            assert.isTrue(wv._wvHidIsHidden(F1, win), "the feed reads hidden");
            assert.isFalse(wv._wvHidIsHidden(F2, win), "the other does not");
            // The Feeds row: the dot, and Show Hidden Feeds right under its Hide.
            const dotTitle = () => { const el = win.document.getElementById("collection-tree-row-" + rowIdx("F1")); const d = el && el.querySelector(".wv-hid-dot"); return d ? d.getAttribute("title") || "" : ""; };
            assert.isTrue(await wvT.waitFor(() => dotTitle().includes("1 hidden feed"), 3000), "the Feeds row's dot: " + dotTitle());
            await cv.selectByID("F1");
            await win.ZoteroPane.buildCollectionContextMenu();
            wv._wvHidBuildMenu(win, menu);
            const sm = [...menu.querySelectorAll(":scope > .wv-hid-entry")].find(e => e.localName === "menu");
            assert.isOk(sm, "the Show submenu on the Feeds row");
            assert.equal(sm.getAttribute("label"), "Show Hidden Feeds");
            const items = [...sm.querySelectorAll("menuitem")];
            const labels = items.map(m => m.getAttribute("label"));
            assert.strictEqual(labels[0], "Manage Hidden…"); assert.include(labels, "Show All (1)"); assert.include(labels, "wv-hid-feed-a");
            assert.isTrue(items.find(m => m.getAttribute("label") === "wv-hid-feed-a").classList.contains("wv-hid-icon-feed"), "with the feed icon");
            const hi2 = menu.querySelector(":scope > .wv-hid-entry.zotero-menuitem-hide-collection");
            assert.isOk(hi2, "the section's Hide stays on the Feeds row");
            assert.strictEqual(hi2.nextElementSibling, sm, "right above Show Hidden Feeds");
            clean();
            // The set round-trips through normalize (the window store).
            assert.deepEqual(wv._wvHidNormalize(JSON.parse(JSON.stringify(wv._wvHidState(win)))).feeds, [F1.libraryID]);
            // Back from the submenu's call.
            await wv._wvHidShow(win, null, null, null, null, null, [F1.libraryID]);
            assert.notStrictEqual(rowIdx("L" + F1.libraryID), false, "the feed is back");
            assert.deepEqual(wv._wvHidState(win).feeds, []);
            // The manager: a feed moves both ways; the Feeds row on the right is context only.
            mw = await openMgr();
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide"), showBtn = d.querySelector(".wv-hid-mgr-show");
            assert.isTrue(await wvT.waitFor(() => L.getRowIndexByID("L" + F1.libraryID) !== false, 5000), "the feed on the left");
            const iL = L.getRowIndexByID("L" + F1.libraryID);
            assert.isTrue(L.isSelectable(iL), "a single feed can be selected");
            L.selection.select(iL);
            await sleep(50);
            assert.isFalse(hideBtn.disabled, "Hide on");
            hideBtn.click();
            assert.isTrue(await wvT.waitFor(() => rowIdx("L" + F1.libraryID) === false, 8000), "hidden from the manager");
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("L" + F1.libraryID) !== false && R.getRowIndexByID("F1") !== false, 5000), "the feed on the right, under the Feeds row");
            const iR = R.getRowIndexByID("L" + F1.libraryID);
            assert.isTrue(R.isSelectable(iR), "and can be selected there");
            assert.isFalse(R.isSelectable(R.getRowIndexByID("F1")), "the Feeds row itself is context (not hidden)");
            R.selection.select(iR);
            await sleep(50);
            assert.isFalse(showBtn.disabled, "Show on");
            showBtn.click();
            assert.isTrue(await wvT.waitFor(() => rowIdx("L" + F1.libraryID) !== false, 8000), "back in the pane");
            assert.deepEqual(wv._wvHidState(win).feeds, []);
        } finally {
            clean();
            if (mw) await closeMgr(mw);
            try { await wv._wvHidShow(win, null, null, null, null, null, [F1.libraryID, F2.libraryID]); } catch (_) {}
            for (const o of [F2, F1]) { try { if (o) await o.eraseTx(); } catch (_) {} }
            // Let the pane's own refresh for the erased feeds land before the
            // next test opens the manager (its setVirtual refresh raced with
            // it: "Duplicate Items back in the pane" timed out, dev.97).
            await wvT.waitFor(() => rowIdx("L" + F1.libraryID) === false && rowIdx("L" + F2.libraryID) === false, 5000);
            // The Feeds row was selected and went with its last feed: leave the
            // pane with a focused row (Zotero's setVirtual reads it before its
            // refresh; the next test's "Duplicate Items back in the pane"
            // timed out without one, dev.97).
            try { await cv.selectLibrary(LIB()); } catch (_) {}
            await sleep(300);
        }
    });

    // MJT 2026-10-19: "I should not be able to select My Library, as it cannot
    // be hidden"; "When doing a Ctrl+A, Saved searches and other special
    // collections should be selected also"; "Merge the native 'Show
    // collection' on special collections also in the Hidden Collections and
    // Libraries".
    it("the manager lists the special collections; the rows that cannot move cannot be selected; Ctrl+A takes every movable row; a row hidden by Zotero's setting shows back everywhere", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide"), showBtn = d.querySelector(".wv-hid-mgr-show");
            const iU = L.getRowIndexByID("U" + LIB());
            assert.notStrictEqual(iU, false, "Unfiled Items on the left");
            assert.notStrictEqual(L.getRowIndexByID("D" + LIB()), false, "Duplicate Items on the left");
            assert.strictEqual(L.getRowIndexByID("T" + LIB()), false, "the Bin is not offered");
            // My Library can be hidden too (MJT 2026-10-20) -- unless it is the
            // last library shown: the pane keeps a row to come back from. The
            // runner has no group library, so here it is the last one.
            const iLib = L.getRowIndexByID("L" + LIB());
            const wasSelected = L.selection.isSelected(iLib);   // Zotero's initialFolder lands on My Library; configure clears it
            L.selection.select(iLib);
            assert.isFalse(L.selection.isSelected(iLib), "the last library shown refuses the selection; " + JSON.stringify({
                wasSelected, isSelectable: L.isSelectable(iLib), propIsOurs: L._tree && L._tree.props && L._tree.props.isSelectable === L.isSelectable,
                visible: wv._wvHidVisibleLibraries(win), canHide: wv._wvHidCanHideLibrary(win, LIB()), title: rowEl(mw, "left", iLib) && rowEl(mw, "left", iLib).getAttribute("title"),
                groups: Zotero.Groups.getAll().map(g => g.name), cleanup: /** @type {any} */ (Zotero)._wvHidTestCleanup || null }));
            assert.include(rowEl(mw, "left", iLib).getAttribute("title"), "last library", "and says why");
            assert.isTrue(hideBtn.disabled);
            const origVisible = wv._wvHidVisibleLibraries;
            try {
                wv._wvHidVisibleLibraries = () => [LIB(), 999999];   // another library shown
                assert.isTrue(L.isSelectable(iLib), "with another library shown, My Library can be selected");
                L.selection.select(iLib);
                await sleep(50);
                assert.isTrue(L.selection.isSelected(iLib), "selected");
                assert.isFalse(hideBtn.disabled, "and Hide is on");
                // Ctrl/Cmd+A works as in the collections pane (Zotero's own
                // scopes): from a library, the library roots ...
                await L._handleSelectAll();
                let sel = [...L.selection.selected].map(i => L.getRow(i));
                assert.isTrue(sel.length >= 1 && sel.every(r => r.isLibrary(true)), "from a library: library roots only");
                // ... from a collection, every movable row of its level: the
                // other collections, the saved search AND the special
                // collections (MJT 2026-10-20: "no reason to exclude the
                // special collections" here) -- not the library, nothing deeper
                L.selection.select(idxOf(L, B));
                await L._handleSelectAll();
                sel = [...L.selection.selected].map(i => L.getRow(i));
                assert.isTrue([A, B].every(c => sel.some(r => r.isCollection() && r.ref.id === c.id)), "the sibling collections");
                assert.isTrue(sel.some(r => r.isSearch()) && sel.some(r => r.isUnfiled()), "the saved search and Unfiled Items too");
                assert.isFalse(sel.some(r => r.isLibrary(true)), "not the library");
                const pB = L.getParentIndex(idxOf(L, B));
                assert.isTrue([...L.selection.selected].every(i => L.getParentIndex(i) === pB), "all at B's level");
                // ... and from a special collection, the same rows
                L.selection.select(iU);
                await L._handleSelectAll();
                assert.equal(L.selection.selected.size, sel.length, "from Unfiled Items: the same level");
            } finally { wv._wvHidVisibleLibraries = origVisible; }
            // Hide Unfiled Items from here: this window only
            L.selection.select(iU);
            await sleep(50);
            assert.isFalse(hideBtn.disabled, "Unfiled Items selected: Hide on");
            hideBtn.click();
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("U" + LIB()) === false, 8000), "Unfiled Items hidden in the pane");
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("U" + LIB()) !== false, 5000), "and on the right");
            assert.isTrue(VPref.getVirtualCollectionStateForLibrary(LIB(), "unfiled"), "Zotero's setting untouched");
            // Hidden by Zotero's own setting: on the right too, marked; Show brings it back everywhere
            await win.ZoteroPane.setVirtual(LIB(), "duplicates", false);
            assert.isTrue(await wvT.waitFor(() => R.getRowIndexByID("D" + LIB()) !== false, 8000), "Duplicate Items on the right once Zotero hid it");
            const iD = R.getRowIndexByID("D" + LIB());
            assert.isTrue(await wvT.waitFor(() => { const el = rowEl(mw, "right", iD); return !!(el && el.classList.contains("wv-hid-global")); }, 3000), "marked as hidden in every window");
            R.selection.select(iD);
            await sleep(50);
            assert.isFalse(showBtn.disabled, "Show on");
            showBtn.click();
            assert.isTrue(await wvT.waitFor(() => VPref.getVirtualCollectionStateForLibrary(LIB(), "duplicates"), 8000), "Zotero's setting switched back on");
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("D" + LIB()) !== false, 8000), "Duplicate Items back in the pane");
            // Unfiled Items, hidden here, comes back with Show as a collection does
            const iU2 = R.getRowIndexByID("U" + LIB());
            assert.notStrictEqual(iU2, false, "Unfiled Items still on the right");
            R.selection.select(iU2);
            await sleep(50);
            showBtn.click();
            assert.isTrue(await wvT.waitFor(() => cv.getRowIndexByID("U" + LIB()) !== false, 8000), "Unfiled Items back in the pane");
        } finally {
            await closeMgr(mw);
            try { VPref.setVirtualCollectionStateForLibrary(LIB(), "duplicates", true); } catch (_) {}
            await wv._wvHidShow(win, LIB(), null, []);
            await wv._wvHidHide([A, S], win);   // the running state: A and S hidden, B shown
        }
    });

    it("the manager's trees start as the collections pane shows them, and never write the pane's remembered expansion", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        const idx = (id) => cv.getRowIndexByID(id);
        if (cv.isContainerOpen(idx("C" + A.id))) await cv.toggleOpenState(idx("C" + A.id));
        assert.isFalse(cv.isContainerOpen(idx("C" + A.id)), "A closed in the pane");
        await sleep(2000);   // past the pane's debounced store of its own toggle
        const pref0 = Zotero.Prefs.get("sourceList.persist");
        const mw = await openMgr();
        try {
            const L = mw._wvHidMgrTrees.left;
            const iA = L.getRowIndexByID("C" + A.id);
            assert.notStrictEqual(iA, false, "A on the left");
            assert.isFalse(L.isContainerOpen(iA), "A closed in the manager, as in the pane");
            await L.toggleOpenState(iA);
            assert.isTrue(L.isContainerOpen(L.getRowIndexByID("C" + A.id)), "opened in the manager");
            await sleep(2000);   // past Zotero's debounced store
            assert.equal(Zotero.Prefs.get("sourceList.persist"), pref0, "the pane's remembered expansion is untouched");
            assert.isFalse(cv.isContainerOpen(idx("C" + A.id)), "the pane's A is still closed");
        } finally {
            await closeMgr(mw);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state the later tests expect
        }
    });

    it("the manager remembers its expansion for its main window: a hidden collection closed there stays closed on the next opening; a shown row follows the pane", async function () {
        this.timeout(60000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        const idx = (id) => cv.getRowIndexByID(id);
        assert.isTrue(cv.isContainerOpen(idx("C" + A.id)), "A open in the pane");
        // Shown side: closed in the manager, the pane still open -> the next
        // opening follows the pane (what it shows wins).
        let mw = await openMgr();
        try {
            const L = mw._wvHidMgrTrees.left;
            await L.toggleOpenState(L.getRowIndexByID("C" + A.id));
            assert.isFalse(L.isContainerOpen(L.getRowIndexByID("C" + A.id)), "closed on the left");
        } finally { await closeMgr(mw); }
        assert.isTrue(cv.isContainerOpen(idx("C" + A.id)), "the pane's A still open");
        mw = await openMgr();
        try {
            const L = mw._wvHidMgrTrees.left;
            assert.isTrue(L.isContainerOpen(L.getRowIndexByID("C" + A.id)), "a shown row starts as the pane shows it");
        } finally { await closeMgr(mw); }
        // Hidden side: out of the pane's sight, its entry in the pane's
        // remembered state goes stale (open); the manager's own memory
        // holds (MJT 2026-10-20: "WV 8-level L1" came back expanded).
        await wv._wvHidHide([A], win);
        cv._containerState["C" + A.id] = true;                               // the stale entry of the report
        mw = await openMgr();
        try {
            const R = mw._wvHidMgrTrees.right;
            const iA = R.getRowIndexByID("C" + A.id);
            assert.notStrictEqual(iA, false, "A on the right");
            assert.isTrue(R.isContainerOpen(iA), "open on the right, as the pane remembered it");
            await R.toggleOpenState(iA);
            assert.isFalse(R.isContainerOpen(R.getRowIndexByID("C" + A.id)), "closed on the right");
        } finally { await closeMgr(mw); }
        cv._containerState["C" + A.id] = true;                               // still stale in the pane
        mw = await openMgr();
        try {
            const R = mw._wvHidMgrTrees.right;
            assert.isFalse(R.isContainerOpen(R.getRowIndexByID("C" + A.id)), "still closed on the next opening");
        } finally {
            await closeMgr(mw);
            delete win._wvHidMgrOpenState;
            await wv._wvHidShow(win, LIB(), null, []);
            await cv.expandToCollection(A1.id);
            await wv._wvHidHide([A, S], win);   // the running state the later tests expect
        }
    });

    it("the manager keeps Zotero's keys and filter: F2 renames inline, Delete asks first, the filter spans both trees, an out-of-sight selection never arms a button, Enter moves", async function () {
        this.timeout(40000);
        await wv._wvHidShow(win, LIB(), null, []);
        await cv.expandToCollection(A1.id);
        await wv._wvHidHide([S], win);   // something on the right
        const mw = await openMgr();
        try {
            const d = mw.document;
            const { left: L, right: R } = mw._wvHidMgrTrees;
            const hideBtn = d.querySelector(".wv-hid-mgr-hide");
            const table = d.querySelector(".wv-hid-mgr-left .virtualized-table");
            const key = (k, mods = {}) => table.dispatchEvent(new mw.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, mods)));
            // Delete asks Zotero's confirmation (stood in for, refused): nothing
            // deleted; F2 starts the tree's inline editor (2026-10-20, the
            // manager's own actions -- Zotero's handlers reach for ZoteroPane).
            mw._wvHidMgrConfirm = async () => false;
            L.selection.select(idxOf(L, B));
            key("Delete");
            await sleep(300);
            const b2 = /** @type {any} */ (Zotero.Collections.get(B.id));
            assert.isOk(b2 && !b2.deleted, "B is not deleted when the confirmation is refused");
            key("F2");
            assert.isTrue(await wvT.waitFor(() => !!(L._editing && L._editing.ref.id === B.id), 3000), "F2: renaming B inline");
            L.stopEditing();
            // One filter, both trees; Zotero keeps the focused row that stopped
            // matching out of sight -- it must not arm Hide.
            assert.isFalse(hideBtn.disabled, "B selected: Hide on");
            const s = d.getElementById("wv-hid-mgr-search");
            s.value = "wv-hid-a1";
            s.doCommand();
            // setFilter lands asynchronously, and with no filter every row
            // "matches" (collectionTree _matchesFilter): wait for the filtered
            // shape itself -- A1 in, B out -- not for A1 alone (10.0.6 release
            // gate 2026-10-21: the B check ran before the filter landed).
            assert.isTrue(await wvT.waitFor(() => matching(L).includes("wv-hid-A1") && !matching(L).includes("wv-hid-B"), 5000), "A1 matches on the left, B filtered out: " + matching(L).join("|"));
            assert.notStrictEqual(L.getRowIndexByID("C" + A.id), false, "A stays as A1's context row");
            // None of the hidden entries matches on the right. (Not "no row at
            // all": Zotero 10.0.6 reports the library context row as matching
            // whatever the filter, Zotero 11 does not -- 10.0.6 release gate,
            // 2026-10-21 night.)
            assert.isTrue(await wvT.waitFor(() => !matching(R).some(n => n.startsWith("wv-hid")), 5000), "no hidden entry matches on the right: " + matching(R).join("|"));
            assert.isTrue(await wvT.waitFor(() => hideBtn.disabled, 3000), "the out-of-sight B does not arm Hide");
            s.value = "wv-hid-sea";
            s.doCommand();
            assert.isTrue(await wvT.waitFor(() => matching(R).includes("wv-hid-search"), 5000), "the right finds the hidden search: " + matching(R).join("|"));
            s.value = "";
            s.doCommand();
            assert.isTrue(await wvT.waitFor(() => idxOf(L, B) !== false && L._isFilterEmpty(), 5000), "cleared: B back");
            // Enter moves the selection across (Zotero's activate).
            L.selection.select(idxOf(L, B));
            await sleep(50);
            key("Enter");
            assert.isTrue(await wvT.waitFor(() => !inTree(B), 8000), "Enter hid B");
            assert.isTrue(await wvT.waitFor(() => idxOf(R, B) !== false, 5000), "B on the right");
        } finally {
            await closeMgr(mw);
            await wv._wvHidShow(win, LIB(), null, []);
            await wv._wvHidHide([A, S], win);   // the running state the later tests expect
        }
    });

    it("Manage Hidden… is the first entry of both Show menus", async function () {
        this.timeout(15000);
        const doc = win.document;
        await cv.selectLibrary(LIB());
        await win.ZoteroPane.buildCollectionContextMenu();
        const menu = doc.getElementById("zotero-collectionmenu");
        wv._wvHidBuildMenu(win, menu);
        const sm = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu");
        assert.isOk(sm, "Show submenu (A and S hidden)");
        assert.equal(sm.querySelector("menuitem").getAttribute("label"), "Manage Hidden…");
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
        const origGroups = wv._wvHidListGroups;
        try {
            wv._wvHidListGroups = () => [{ libraryID: 999999, label: "wv-hid-group" }];
            wv._wvHidOpenGroupsMenu(win, win.mozInnerScreenX + 50, win.mozInnerScreenY + 50);
            const pop = await wvT.waitFor(() => { const p = doc.getElementById("wv-hid-groups-menu"); return p && p.state !== "closed" ? p : null; }, 3000);
            // The heading's own Hide (the whole section, 2026-10-20) comes
            // first, then its separator; the Show submenu starts with Manage Hidden….
            const top = [...pop.children].map(e => e.localName + ":" + (e.getAttribute("label") || ""));
            assert.equal(top[0], "menuitem:" + Zotero.getString("general.hide"), "Hide first: " + top.join(" | "));
            assert.equal(top[1], "menuseparator:");
            assert.equal(pop.querySelector("menu > menupopup > menuitem").getAttribute("label"), "Manage Hidden…");
            try { pop.hidePopup(); } catch (_) {}
        } finally {
            wv._wvHidListGroups = origGroups;
            const p = doc.getElementById("wv-hid-groups-menu"); if (p) { try { p.hidePopup(); } catch (_) {} }
        }
    });

    it("with nothing hidden, Manage Hidden… is a plain item in Zotero's Show group on the library row", async function () {
        this.timeout(15000);
        const doc = win.document;
        await wv._wvHidShow(win, LIB(), null, []);
        try {
            await cv.selectLibrary(LIB());
            await win.ZoteroPane.buildCollectionContextMenu();
            const menu = doc.getElementById("zotero-collectionmenu");
            wv._wvHidBuildMenu(win, menu);
            assert.isNotOk([...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menu"), "no Show submenu");
            const mi = [...menu.querySelectorAll(".wv-hid-entry")].find(e => e.localName === "menuitem" && e.getAttribute("label") === "Manage Hidden…");
            assert.isOk(mi, "the plain Manage Hidden… item (MJT 2026-10-16: still available with nothing hidden)");
            assert.strictEqual(mi.previousSibling, menu.querySelector("#showPublications"), "right after Zotero's last Show item");
            for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
        } finally {
            await wv._wvHidHide([A, S], win);
        }
    });

    // Zotero bug (upstream register #25), MJT's screenshot 2026-10-05: after a
    // right-click on Recently Read / Unfiled, Zotero's Delete item kept the
    // label "Hide" on the next collection -- it writes "Hide" as a plain label
    // there but labels Delete through Fluent, which skips an unchanged id.
    it("Zotero's Delete item never keeps a stale \"Hide\" label in delete mode", async function () {
        this.timeout(15000);
        const menu = win.document.getElementById("zotero-collectionmenu");
        await cv.selectByID("C" + B.id);
        await win.ZoteroPane.buildCollectionContextMenu();
        const dc = menu.querySelector("#deleteCollection");
        await win.document.l10n.translateElements([dc]);
        const good = dc.getAttribute("label");
        assert.notEqual(good, Zotero.getString("general.hide"));
        dc.setAttribute("label", Zotero.getString("general.hide"));   // what Recently Read leaves behind
        await win.ZoteroPane.buildCollectionContextMenu();            // same id + args: Fluent skips it
        wv._wvHidBuildMenu(win, menu);                                 // Weavero's popupshowing
        await new Promise(r => win.setTimeout(r, 300));
        assert.equal(dc.getAttribute("label"), good, "retranslated back to Zotero's Delete label");
        for (const e of [...menu.querySelectorAll(".wv-hid-entry")]) e.remove();
    });

    it("hiding the selected collection moves the selection to its library row", async function () {
        this.timeout(15000);
        await cv.selectByID("C" + B.id);
        await wv._wvHidHide([B], win);
        const row = cv.getRow(cv.selection.focused);
        assert.equal(row && row.id, "L" + LIB());
    });

    it("Weavero's filter Collection tree leaves hidden collections out", () => {
        const ids = wv._wvCollTreeValues(LIB(), win).map(v => v.id);
        assert.notInclude(ids, A.id);
        assert.notInclude(ids, A1.id);
        assert.notInclude(ids, B.id);
    });

    it("Show All brings everything back and the dot goes", async function () {
        this.timeout(15000);
        await wv._wvHidShow(win, LIB(), null, []);
        assert.isTrue(inTree(A) && inTree(B) && inTree(S));
        await cv.expandToCollection(A1.id);
        assert.isTrue(inTree(A1));
        wv._wvHidDecorate(win);
        const row = win.document.getElementById("collection-tree-row-" + cv.getRowIndexByID("L" + LIB()));
        assert.isNull(row && row.querySelector(".wv-hid-dot"));
    });

    it("the set travels in the window's saved state (restart store, Save & Close, sessions) and comes back from it", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B], win);
        const ms = wv._wvTabSessionCaptureMainState(win);
        assert.deepEqual(ms.hiddenColl && ms.hiddenColl.hidden[String(LIB())], ["C" + B.key], "captured with the library view");
        // A session switch to a state WITHOUT a set clears it...
        await wv._wvTabSessionApplyMainState(win, { collection: "L" + LIB() });
        assert.isFalse(wv._wvHidIsHidden(B, win));
        assert.isTrue(inTree(B));
        // ...and applying the captured state brings it back.
        await wv._wvTabSessionApplyMainState(win, ms);
        assert.isTrue(wv._wvHidIsHidden(B, win));
        assert.isFalse(inTree(B));
        await wv._wvHidShow(win, LIB(), null, []);
        assert.isUndefined(wv._wvTabSessionCaptureMainState(win).hiddenColl, "nothing hidden: nothing captured");
    });

    it("the window store carries the first window's set in its own field (saved even with only the library tab)", async function () {
        this.timeout(15000);
        await wv._wvHidHide([B], win);
        wv._wvWindowStoreSaveSync();
        await sleep(300);
        const doc = JSON.parse(await IOUtils.readUTF8(wv._wvWindowStorePath()));
        assert.deepEqual(doc.anchorHidden && doc.anchorHidden.hidden[String(LIB())], ["C" + B.key]);
        await wv._wvHidShow(win, LIB(), null, []);
    });

    // Found live 2026-10-05: onMainWindowLoad ran before the new window had a
    // collections tree, so its set was saved but never filtered.
    it("a NEW main window gets its own set, applied to its own tree only", async function () {
        this.timeout(60000);
        if (typeof wv._wvOpenEmptyMainWindow !== "function" || !wv._wvMultiMainOn()) this.skip();
        const before = new Set(Zotero.getMainWindows());
        wv._wvOpenEmptyMainWindow();
        let w2 = null;
        for (let i = 0; i < 100 && !w2; i++) { await sleep(150); w2 = Zotero.getMainWindows().find(w => !before.has(w)); }
        assert.isOk(w2, "second window opened");
        try {
            const parts = () => {
                const cv2 = w2.ZoteroPane && w2.ZoteroPane.collectionsView;
                return { cv: !!cv2, tree: !!(cv2 && cv2.tree), wrapped: !!(cv2 && Object.prototype.hasOwnProperty.call(cv2, "_includedInTree")),
                    managed: !!w2._wvManagedWindow, id: w2._wvWindowId, tries: w2._wvHidApplyTries || 0 };
            };
            const ready = () => { const p = parts(); return p.cv && p.tree && p.wrapped && p.id != null; };
            for (let i = 0; i < 160 && !ready(); i++) await sleep(150);
            assert.isTrue(!!ready(), "the new window's tree is filtered: " + JSON.stringify(parts()));
            const cv2 = w2.ZoteroPane.collectionsView;
            await wv._wvHidHide([B], w2);
            assert.isFalse(cv2.getRowIndexByID("C" + B.id) !== false, "hidden in the new window");
            assert.isTrue(inTree(B), "still shown in the first window");
            await wv._wvHidShow(w2, LIB(), null, []);
        }
        finally {
            // Hand focus back to the first window BEFORE closing the second:
            // closing the active window let the OS activate another app's
            // window on top, the first window's document went "hidden"
            // (occluded) and the next spec measured a 0-px header there
            // (items-header-contain, three full runs 2026-10-05..07). Then
            // wait until the second window is really gone and the first one
            // is visible again.
            try { win.focus(); } catch (_) {}
            await sleep(100);
            try { w2.close(); } catch (_) {}
            for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await sleep(100);
            for (let i = 0; i < 30 && win.document.visibilityState !== "visible"; i++) {
                try { if (win.windowState === win.STATE_MINIMIZED) win.restore(); } catch (_) {}
                try { win.focus(); } catch (_) {}
                await sleep(100);
            }
            await sleep(300);
        }
    });

});
