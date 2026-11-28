/* global describe, it, before, after, assert, Zotero, Services, wvT */

// The funnel above the collections pane (src/modules/coll-funnel.ts; MJT 2026-11-27, "a filter
// funnel above the collections pane, to be able to filter faster the normal collections, saved
// searches, Feeds, ..." and "the ability to use the filter as default in the collections pane,
// same as for the annotations pane of the reader"; plan work/collfunnel-plan-2026-11-27.md).
// A funnel in the collections toolbar, three chip rows -- kinds, libraries, Weavero's sections --,
// a click shows only, Alt+click hides, the rows AND together and with Zotero's own search box; per
// window, kept with the window's session; Use as Default / Reset to Default as in the annotations
// pane. Every check reads the pane's own collection tree. Local fixtures only (a group made the way
// Zotero's own tests make one, support.js createGroup; the runner never syncs), erased at the end.

describe("Weavero — the funnel above the collections pane", function () {
    this.timeout(240000);
    let wv, win, doc, cv, L, G, F, colA, colB, colBkid, colG, srch, trashWas, focusWas, bmpWas = null;
    const made = [];
    const P = "WVCF ";
    const DEF = "weavero.collFunnelDefault";
    const SHOW = ["collFunnelShowCollections", "collFunnelShowSearches", "collFunnelShowFeeds", "collFunnelShowSpecial", "collFunnelShowBookmarks", "collFunnelShowFolders"];
    const VIRTUAL = ["recentlyRead", "publications", "duplicates", "unfiled", "retracted", "trash"];
    const B = Services.prefs.getBranch("extensions.zotero.");

    const rowsOf = (t = cv) => { const out = []; for (let i = 0; i < t.rowCount; i++) { const r = t.getRow(i); if (r && r !== t._hiddenFocusedRow) out.push(r); } return out; };
    const typesOf = (t = cv) => rowsOf(t).map(r => r.type);
    const has = (id, t = cv) => rowsOf(t).some(r => r.id === id);
    const shape = (t = cv) => rowsOf(t).map(r => r.id).join(" ");
    const settle = async (pred, what, ms = 10000) => {
        const ok = await wvT.waitFor(() => { try { return pred() || null; } catch (e) { return null; } }, ms, 60);
        let f = null;
        try { f = focusedID(); } catch (e) {}
        assert.ok(ok, what + " (rows: " + shape() + "; focused: " + f + ")");
    };
    const focusedID = (t = cv) => { const r = t.getRow(t.selection.focused); return r ? r.id : null; };
    const gKey = () => "g" + G.groupID;
    const set = (st, w = win) => wv._wvCfSetState(w, st);
    const kinds = (inc, exc) => ({ kinds: { inc: inc || [], exc: exc || [] } });
    // The boxes first: each one cleared rewrites the default from the boxes (the Settings
    // direction of the sync); the default last, so nothing of this spec stays.
    const clearPrefs = () => {
        for (const k of [...SHOW.map(s => "weavero." + s), DEF]) { try { if (B.prefHasUserValue(k)) B.clearUserPref(k); } catch (e) {} }
    };
    /** What the funnel holds for this window, for a failure's message. */
    const diag = () => {
        try {
            return JSON.stringify({ own: win._wvCf, wired: wv._wvCfWired(win), on: wv._wvCfOn(), st: wv._wvCfState(win),
                trees: wv._wvCfTreesOf(win).length, excl: wv._wvCfExcludes(colA, cv, win), inc: cv._includedInTree(colA),
                gen: wv._wvCfGen, watching: wv._wvCfWatching });
        } catch (e) { return "diag err " + e; }
    };
    /** Back to everything shown. Strict (the fixture's, the `after`'s): a failure is the
     *  test's. From a test's `finally` (`strict` false): never thrown, so the test's own
     *  failure is the one reported -- a `finally` that throws replaces it (2026-11-27: the
     *  teardown test showed this reset's message for an earlier "every row back"). */
    const reset = async (strict = true) => {
        clearPrefs();
        // The Bookmarks pane as the spec found it -- the suite keeps it folded (000-helpers.spec.js
        // root hook) -- with Bookmarks only off. Never its defaults: open, it takes 180 px from the
        // collections tree, and the specs after this one (collection-open-in-window,
        // group-libraries-fold, hidden-collections) found their rows out of the virtualized list
        // (tree 142 px on Zotero 11, 108 px on Zotero 10, runner window 600 px; 1.3.0-collfunnel.4).
        try { if (wv._wvBmpOn()) wv._wvBmpRestore(win, bmpWas ? Object.assign({}, bmpWas, { only: false }) : null); } catch (e) {}
        await set(null);
        const ok = await wvT.waitFor(() => { try { return (has("C" + colA.id) && has("S" + srch.id)) || null; } catch (e) { return null; } }, 10000, 60);
        const msg = "back to everything (rows: " + shape() + ") [" + diag() + "]";
        if (strict) assert.ok(ok, msg);
        else if (!ok) Zotero.debug("[wv-test] coll-funnel reset: " + msg);
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

    before(async function () {
        this.timeout(90000);
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvCfOn", "_wvCfState", "_wvCfSetState", "_wvCfChip", "_wvCfCapture", "_wvCfRestore", "_wvCfUseAsDefault",
            "_wvCfResetToDefault", "_wvCfClear", "_wvCfRefreshWin", "_wvCfRenderPanel", "_wvCfWire", "_wvCfTeardown", "_wvCfDefaultLibsText",
            "_wvCfDefaultResetLibs", "_wvCfFoldersOff"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        cv = win.ZoteroPane.collectionsView;
        L = Zotero.Libraries.userLibraryID;
        assert.isTrue(wv._wvCfOn(), "fixture: the trial is on in a pre-release build (devOnly)");
        try { if (wv._wvBmpOn()) bmpWas = wv._wvBmpCapture(win) || null; } catch (e) {}
        clearPrefs();
        try { focusWas = Services.focus.activeWindow; } catch (e) {}
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        G = await mkGroup(P + "group");
        colA = await mkCollection(P + "Alpha", L);
        colB = await mkCollection(P + "Beta", L);
        colBkid = await mkCollection(P + "Beta kid zqk", L, colB.id);
        colG = await mkCollection(P + "In group", G.libraryID);
        srch = /** @type {any} */ (new Zotero.Search());
        srch.libraryID = L; srch.name = P + "Search zqs";
        srch.addCondition("title", "contains", "wv-cf-nothing-matches-this");
        await srch.saveTx();
        made.unshift(srch);
        F = /** @type {any} */ (new Zotero.Feed());
        F.name = P + "feed"; F.description = ""; F.url = "http://wv-cf-test.invalid/feed.rss";
        F.refreshInterval = 12; F.cleanupReadAfter = 2; F.cleanupUnreadAfter = 30;
        await F.saveTx();
        made.unshift(F);
        // The Trash row through Zotero's own setting, never an item in it: an item saved or
        // erased starts Zotero's sync reminder 5 s later in a profile without sync
        // (zoteroPane.js initSyncReminders -> showSetUpSyncReminder), a 35-px banner above the
        // panes that stays and shrank the next spec's tree (seen 2026-11-27).
        trashWas = B.prefHasUserValue("showTrashWhenEmpty") ? B.getBoolPref("showTrashWhenEmpty") : null;
        B.setBoolPref("showTrashWhenEmpty", true);
        await wv._wvCfSetState(win, null);
        await settle(() => has("C" + colA.id) && has("S" + srch.id) && has("L" + G.libraryID) && has("F1") && has("T" + L), "fixture: every kind in the tree");
        await cv.selectLibrary(L);
    });

    after(async function () {
        this.timeout(60000);
        try { await reset(); } catch (e) {}
        // Whatever happened above, nothing of the funnel stays for the specs after this one.
        clearPrefs();
        try { if (win._wvCf !== undefined) delete win._wvCf; } catch (e) {}
        try { if (wv._wvBmpOn()) wv._wvBmpRestore(win, bmpWas ? Object.assign({}, bmpWas, { only: false }) : null); } catch (e) {}
        try { wv._wvCfWire(win); await wv._wvCfRefreshWin(win); } catch (e) {}
        for (const o of made) { try { await o.eraseTx(); } catch (e) {} }
        try {
            if (trashWas === null) { if (B.prefHasUserValue("showTrashWhenEmpty")) B.clearUserPref("showTrashWhenEmpty"); }
            else if (trashWas !== undefined) B.setBoolPref("showTrashWhenEmpty", trashWas);
        } catch (e) {}
        // A tree without this spec's group: Zotero leaves the Group Libraries heading of an
        // erased last group until its next refresh.
        try { await wv._wvCfRefreshWin(win); } catch (e) {}
        try { await cv.selectLibrary(L); } catch (e) {}
        // The focus back where it was (the runner's own window): the two-window tests focus the
        // main window, and Zotero then lets that window's tree follow every collection added
        // or removed elsewhere -- hidden-collections.spec.js's manager tests moved its
        // selection to the Duplicates row, scrolled its rows out of sight and failed after
        // this spec only (probed test by test, 2026-11-27).
        try {
            if (focusWas && !focusWas.closed && Services.focus.activeWindow !== focusWas) {
                focusWas.focus();
                await wvT.waitFor(() => Services.focus.activeWindow === focusWas || null, 3000, 50);
            }
        } catch (e) {}
    });

    it("the funnel sits in the collections toolbar after the spacer, before Zotero's search toggle; off, it goes", async function () {
        const lib = wvT.lib();
        const bar = lib.wvViewEl(doc, "zotero-collections-toolbar");
        const btn = bar.querySelector(".wv-cf-tb-button");
        assert.ok(btn, "a funnel button in the toolbar");
        assert.equal(btn.getAttribute("type"), "menu", "a menu button: its panel toggles natively");
        const panel = btn.querySelector(":scope > panel");
        assert.ok(panel, "its panel is its child");
        const sbtn = bar.querySelector("[id^='zotero-tb-collections-search']");
        const box = sbtn.parentNode === bar ? sbtn : sbtn.parentNode;
        assert.strictEqual(btn.nextElementSibling, box, "right before Zotero's search toggle");
        assert.equal(btn.previousElementSibling && btn.previousElementSibling.localName, "spacer", "after the spacer");
        // After Weavero's other buttons there (Bookmarks, then Researchers: people-toolbar.ts).
        const kids = [...bar.children];
        for (const id of ["wv-bookmarks-toolbar-button", "wv-pp-tb-button"]) {
            const other = bar.querySelector(":scope > #" + id);
            if (other) assert.isBelow(kids.indexOf(other), kids.indexOf(btn), id + " comes before the funnel");
        }
        // Its width (coll-funnel.ts CF_CSS, 1.3.0-beta.1 gates 2026-11-28): Zotero's 40 px for a
        // menu button in a pane of usual width, as before; in the narrowest pane it gives way
        // first, down to its glyph's 20 px, and Zotero's magnifier stays inside the toolbar
        // (test/collections-pane-toggle.spec.js checks the row there, closed and open).
        const colPane = lib.wvViewEl(doc, "zotero-collections-pane");
        const widthWas = colPane.style.width;
        try {
            for (const [w, lo, hi] of [[300, 40, 40], [parseFloat(win.getComputedStyle(colPane).minWidth), 20, 40]]) {
                colPane.style.width = w + "px";
                await new Promise(res => win.requestAnimationFrame(() => win.setTimeout(res, 60)));
                const bw = btn.getBoundingClientRect().width, sr = sbtn.getBoundingClientRect().right, br = bar.getBoundingClientRect().right;
                const at = "a " + w + "-px pane: the funnel " + bw + " px, the magnifier ends at " + sr + ", the toolbar at " + br;
                assert.isAtLeast(bw, lo - 0.5, at);
                assert.isAtMost(bw, hi + 0.5, at);
                assert.isAtMost(sr, br + 0.5, at);
            }
        }
        finally { colPane.style.width = widthWas; }
        await wvT.withPref("weavero.collectionsFunnel", false, async () => {
            await settle(() => !doc.querySelector(".wv-cf-tb-button"), "off: no button");
        });
        await settle(() => !!lib.wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button"), "on again: the button is back");
    });

    it("kinds: show only and hide, each kind (row counts through the tree)", async () => {
        try {
            await set(kinds([], ["collections"]));
            await settle(() => !typesOf().includes("collection") && has("S" + srch.id) && has("F1") && has("T" + L), "Collections hidden, the rest there");
            await set(kinds(["searches"], []));
            await settle(() => has("S" + srch.id) && !typesOf().some(t => t === "collection" || t === "feeds" || t === "feed" || VIRTUAL.includes(t)), "only saved searches (and their library)");
            assert.isFalse(has("L" + G.libraryID), "a library holding no saved search goes");
            assert.isTrue(has("L" + L), "My Library holds one: it stays as their header");
            await set(kinds([], ["feeds"]));
            await settle(() => !has("F1") && !typesOf().includes("feed") && has("C" + colA.id), "Feeds hidden");
            await set(kinds([], ["special"]));
            await settle(() => !typesOf().some(t => VIRTUAL.includes(t)) && has("C" + colA.id), "special rows hidden, the Trash too");
            await set(kinds(["special"], []));
            await settle(() => has("T" + L) && typesOf().some(t => t === "duplicates" || t === "unfiled") && !typesOf().some(t => t === "collection" || t === "search" || t === "feeds"), "only the special rows");
            // The items filter's rule: switching direction clears the other set.
            await set(null);
            await wv._wvCfChip(win, "kinds", "collections", false);
            await wv._wvCfChip(win, "kinds", "searches", true);
            assert.deepEqual(wv._wvCfState(win).kinds, { inc: [], exc: ["searches"] }, "an Alt+click after a click: the include set cleared");
        }
        finally { await reset(false); }
    });

    it("libraries: show only and hide; the Group Libraries heading goes with its last group", async () => {
        try {
            await set({ libs: { inc: [], exc: [gKey()] } });
            await settle(() => !has("L" + G.libraryID) && !has("HG") && has("L" + L), "the group hidden, its heading with it");
            await set({ libs: { inc: [gKey()], exc: [] } });
            await settle(() => has("L" + G.libraryID) && has("C" + colG.id) && !has("L" + L), "only the group");
            assert.isTrue(has("F1"), "Feeds are a kind, not a library: still there");
            await set({ libs: { inc: ["u"], exc: [] }, kinds: { inc: ["feeds"], exc: [] } });
            await settle(() => has("F1") && !rowsOf().some(r => r.type === "library" || r.type === "group"), "rows AND: no library holds a feed");
        }
        finally { await reset(false); }
    });

    it("Weavero's sections: the Bookmarks pane chip is its Bookmarks only, Alt+click hides it here; the folders chip's hide lists the saved searches flat here", async function () {
        assert.isTrue(wv._wvBmpOn() && wv._wvSfOn(), "fixture: both trials on in a pre-release build (devOnly)");
        const colPane = () => wvT.lib().wvViewEl(doc, "zotero-collections-pane");
        let fid = null;
        try {
            await wv._wvCfChip(win, "secs", "bookmarks", false);
            assert.isTrue(wv._wvBmpState(win).only, "the pane's own Bookmarks only");
            await settle(() => colPane().getAttribute("data-wv-bmp-mode") === "only", "the tree gives the column to the bookmarks");
            assert.deepEqual(wv._wvCfState(win).secs.inc, ["bookmarks"], "the chip reads the pane's state");
            wv._wvBmpSetOnly(win, false);
            assert.deepEqual(wv._wvCfState(win).secs.inc, [], "the pane's own switch: the chip follows");
            await wv._wvCfChip(win, "secs", "bookmarks", true);
            const bp = colPane().querySelector(":scope > .wv-bmpane");
            await settle(() => colPane().hasAttribute("data-wv-cf-nobmp") && (!bp || win.getComputedStyle(bp).display === "none"), "Alt+click: the pane hidden in this window");
            await wv._wvCfChip(win, "secs", "bookmarks", true);
            await settle(() => !colPane().hasAttribute("data-wv-cf-nobmp"), "and back");
            await wv._wvSfLoad();
            fid = wv._wvSfNewFolder(L, P + "Folder", null);
            wv._wvSfAssign([srch], fid);
            await settle(() => rowsOf().some(r => r.ref && r.ref.wvSf), "a folder of saved searches");
            await wv._wvCfChip(win, "secs", "folders", true);
            assert.isTrue(wv._wvCfFoldersOff(win), "the folders stand down in this window");
            await settle(() => !rowsOf().some(r => r.ref && r.ref.wvSf) && rowsOf().some(r => r.id === "S" + srch.id && r.level === 1), "flat: the search at its library's level");
        }
        finally {
            try { if (fid) wv._wvSfDeleteFolder(L, fid); } catch (e) {}
            await reset(false);
        }
    });

    it("AND with the collections search: a container stays only when a row the funnel shows matches", async () => {
        try {
            await cv.setFilter("zqs");
            await settle(() => has("S" + srch.id) && has("L" + L), "Zotero: the matching search under My Library");
            await set(kinds([], ["searches"]));
            await settle(() => !has("S" + srch.id) && !has("L" + L), "the match is a hidden kind: My Library does not stay as an empty container");
            await set(null);
            await cv.setFilter("zqk");
            await settle(() => has("C" + colB.id) && has("C" + colBkid.id), "Zotero: the parent stays as the child's context");
            await set(kinds(["searches"], []));
            await settle(() => !has("L" + L) && !has("C" + colB.id), "only saved searches: no search matches, nothing of My Library");
        }
        finally {
            try { await cv.setFilter(""); } catch (e) {}
            await reset(false);
        }
    });

    it("a funnel that leaves nothing shows its message with a Clear link; a filtered-out selection moves to its library, else the first library shown", async () => {
        try {
            await cv.selectByID("C" + colA.id);
            await set(kinds([], ["collections"]));
            await settle(() => focusedID() === "L" + L, "the collection's library is selected");
            await set(null);
            await cv.selectByID("C" + colG.id);
            await settle(() => focusedID() === "C" + colG.id, "fixture: the group's collection selected");
            await set({ libs: { inc: [], exc: [gKey()] } });
            await settle(() => focusedID() === "L" + L, "its library gone: the first library shown");
            await set(kinds([], ["collections", "searches", "feeds", "special"]));
            // Never an empty tree: Zotero's own code reads the focused row (collectionTree.jsx
            // `editable`) and stopped at "Please restart Zotero" on 1.3.0-collfunnel.1.
            await settle(() => shape() === "L" + L && focusedID() === "L" + L, "nothing the funnel shows: My Library alone, selected, the row the tree stands on");
            assert.isNotOk(/** @type {any} */ (Zotero).crashed, "Zotero did not crash");
            const msg = doc.querySelector(".wv-cf-empty");
            await settle(() => msg && !msg.hidden && win.getComputedStyle(msg).display !== "none", "the message shows");
            const link = msg.querySelector(".wv-cf-empty-clear");
            assert.ok(link, "a Clear link");
            link.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            await settle(() => has("C" + colA.id) && has("F1"), "Clear: everything back");
            await settle(() => msg.hidden || win.getComputedStyle(msg).display === "none", "the message gone");
        }
        finally { await reset(false); }
    });

    it("two windows keep their own funnels", async function () {
        const w2 = await wvT.openMainWindow();
        assert.ok(w2, "a second main window");
        try { win.focus(); } catch (e) {}
        const cv2 = w2.ZoteroPane.collectionsView;
        try {
            await settle(() => has("C" + colA.id, cv2), "fixture: the second window's tree");
            await set(kinds([], ["collections"]));
            await settle(() => !has("C" + colA.id), "hidden here");
            await wvT.sleep(300);
            assert.isTrue(has("C" + colA.id, cv2), "still there in the other window");
            await set(kinds([], ["searches"]), w2);
            await settle(() => !has("S" + srch.id, cv2), "the other window hides its searches");
            assert.isTrue(has("S" + srch.id) && !has("C" + colA.id), "this window keeps its own");
        }
        finally {
            try { await set(null, w2); } catch (e) {}
            try { w2.close(); } catch (e) {}
            await wvT.waitFor(() => !Zotero.getMainWindows().includes(w2), 10000);
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });

    it("the window's funnel goes into its session record and saved state, and comes back from them", async () => {
        try {
            await set({ kinds: { inc: [], exc: ["special"] }, libs: { inc: [], exc: [gKey()] } });
            const cap = wv._wvCfCapture(win);
            assert.deepEqual(cap, { kinds: { exc: ["special"] }, libs: { exc: [gKey()] } }, "the window's own departure, compact");
            assert.deepEqual(wv._wvTabSessionCaptureMainState(win).collFunnel, cap, "in the session record");
            assert.deepEqual(wv._wvWinStateCapture(win).collFunnel, cap, "in the window's saved state");
            await wv._wvCfRestore(win, null);
            await settle(() => has("T" + L) && has("L" + G.libraryID), "a session without one: the default (everything)");
            assert.isUndefined(wv._wvCfCapture(win), "following the default: nothing saved");
            await wv._wvTabSessionApplyMainState(win, { collFunnel: cap });
            await settle(() => !has("T" + L) && !has("L" + G.libraryID), "a session's own funnel back");
            // Zotero 11's own windows: the window's state they take (lib/windows.ts), with the
            // saved-search folders and the Bookmarks pane beside it.
            const plan = wvT.lib().wvPlanWindowTransfer({ windows: [{ kind: "main-dev", tabs: [{ type: "library", data: {} }],
                wvMainState: { collFunnel: cap, sfOpen: ["u|x"], bmPane: { only: true } } }] }, new Map(), () => null, { columnsId: "x", newId: () => "id1" });
            const text = plan.windows[0].settings.prefs["weavero.windowState"];
            const st = JSON.parse(text);
            assert.deepEqual([st.collFunnel, st.sfOpen, st.bmPane], [cap, ["u|x"], { only: true }], "carried to a Zotero 11 window: " + text);
        }
        finally { await reset(false); }
    });

    it("Use as Default writes Settings and every window following the default takes it; Reset to Default comes back to it", async function () {
        let w2 = null;
        try {
            await set({ kinds: { inc: [], exc: ["special"] }, libs: { inc: [], exc: [gKey()] } });
            await wv._wvCfUseAsDefault(win);
            const def = JSON.parse(String(Zotero.Prefs.get(DEF)));
            assert.deepEqual(def, { kinds: { exc: ["special"] }, libs: { exc: [gKey()] } }, "the default, as the panel stood");
            assert.strictEqual(Zotero.Prefs.get("weavero.collFunnelShowSpecial"), false, "Settings' box: special rows not shown by default");
            assert.strictEqual(Zotero.Prefs.get("weavero.collFunnelShowCollections"), true, "the others still shown");
            assert.include(wv._wvCfDefaultLibsText(), P + "group", "the libraries line names the hidden group");
            assert.isUndefined(wv._wvCfCapture(win), "the window now follows the default");
            w2 = await wvT.openMainWindow();
            assert.ok(w2, "a second main window");
            try { win.focus(); } catch (e) {}
            const cv2 = w2.ZoteroPane.collectionsView;
            await settle(() => has("C" + colA.id, cv2) && !has("T" + L, cv2) && !has("L" + G.libraryID, cv2), "a new window starts from the default");
            await set({ kinds: { inc: [], exc: [] }, libs: { inc: [], exc: [] }, secs: { inc: [], exc: [] } });
            await settle(() => has("T" + L) && has("L" + G.libraryID), "this window departs: everything");
            assert.deepEqual(wv._wvCfCapture(win), {}, "its own: everything shown");
            await wv._wvCfResetToDefault(win);
            await settle(() => !has("T" + L) && !has("L" + G.libraryID), "Reset to Default: the default again");
            // The Settings line's Reset: no library left out of the default.
            wv._wvCfDefaultResetLibs();
            await settle(() => has("L" + G.libraryID) && has("L" + G.libraryID, cv2), "the libraries line's Reset: every library again, in both windows");
            assert.deepEqual(JSON.parse(String(Zotero.Prefs.get(DEF))).libs || {}, {}, "no library left in the default");
            assert.notInclude(wv._wvCfDefaultLibsText(), P + "group", "the line names no library");
            // A Settings box writes the default; every window following it takes it.
            Zotero.Prefs.set("weavero.collFunnelShowCollections", false);
            await settle(() => !typesOf().includes("collection") && !typesOf(cv2).includes("collection"), "Collections unchecked in Settings: gone in both windows");
            assert.deepEqual(JSON.parse(String(Zotero.Prefs.get(DEF))).kinds.exc.sort(), ["collections", "special"], "the default's kinds from the boxes");
        }
        finally {
            if (w2) { try { w2.close(); } catch (e) {} await wvT.waitFor(() => !Zotero.getMainWindows().includes(w2), 10000); }
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });

    it("beside the hidden collections, the Group Libraries fold and the saved-search folders: both rules apply", async () => {
        try {
            await wv._wvHidHide([colA], win);
            await set(kinds([], ["searches"]));
            await settle(() => !has("C" + colA.id) && !has("S" + srch.id) && has("C" + colB.id), "hidden here AND filtered by the funnel");
            await set(null);
            await settle(() => has("S" + srch.id) && !has("C" + colA.id), "the funnel cleared: the hidden collection stays hidden");
            await wv._wvHidShow(win, L, null);
            await settle(() => has("C" + colA.id), "shown again");
            if (typeof wv._wvGfToggle === "function") {
                await wv._wvGfToggle(cv, true);
                await settle(() => has("HG") && !has("L" + G.libraryID), "the groups folded");
                await set({ libs: { inc: [], exc: [gKey()] } });
                await settle(() => !has("HG"), "the funnel hides the last group: no heading");
                await set(null);
                await settle(() => has("HG"), "the heading back");
                await wv._wvGfToggle(cv, true);
                await settle(() => has("L" + G.libraryID), "unfolded");
            }
        }
        finally {
            try { await wv._wvHidShow(win, L, null); } catch (e) {}
            try { if (B.prefHasUserValue("weavero.groupLibrariesCollapsed")) B.clearUserPref("weavero.groupLibrariesCollapsed"); } catch (e) {}
            await reset(false);
        }
    });

    it("the panel draws the window's state; a chip's click shows only, Alt+click hides; its footer: Use as Default, Reset to Default", async () => {
        const lib = wvT.lib();
        const btn = lib.wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button");
        const panel = btn.querySelector(":scope > panel");
        const chip = (row, v) => panel.querySelector(".wv-cf-chip[data-cf-row='" + row + "'][data-cf-value='" + v + "']");
        const click = (el, alt) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, altKey: !!alt }));
        try {
            wv._wvCfRenderPanel(win, panel);
            assert.ok(chip("kinds", "collections") && chip("kinds", "searches") && chip("kinds", "feeds") && chip("kinds", "special"), "the four kinds");
            assert.ok(chip("libs", "u") && chip("libs", gKey()), "My Library and the group");
            assert.isFalse(btn.classList.contains("wv-cf-active"), "nothing filtered: the funnel not lit");
            click(chip("kinds", "feeds"), true);
            await settle(() => !has("F1"), "Alt+click: Feeds hidden");
            assert.equal(chip("kinds", "feeds").getAttribute("data-excluded"), "true", "the chip redrawn as hidden");
            assert.isTrue(btn.classList.contains("wv-cf-active"), "lit");
            assert.match(btn.getAttribute("tooltiptext") || "", /Feeds/, "its tooltip names what is active");
            click(chip("kinds", "collections"), false);
            await settle(() => has("C" + colA.id) && !has("S" + srch.id) && !has("F1"), "a click: only collections (Feeds is a kind: gone too), the hide cleared");
            assert.isUndefined(chip("kinds", "feeds").getAttribute("data-excluded") || undefined, "the Alt+click's hide cleared");
            assert.equal(chip("kinds", "collections").getAttribute("data-selected"), "true");
            const use = panel.querySelector(".wv-cf-use-default"), back = panel.querySelector(".wv-cf-reset-default");
            assert.ok(use && back, "the footer's two buttons");
            click(use);
            await settle(() => !!Zotero.Prefs.get(DEF), "Use as Default wrote the default");
            assert.deepEqual(JSON.parse(String(Zotero.Prefs.get(DEF))).kinds, { inc: ["collections"] });
        }
        finally {
            try { panel.hidePopup(); } catch (e) {}
            await reset(false);
        }
    });

    it("teardown leaves no layer and every row back; wiring again brings the funnel back", async () => {
        try {
            await set(kinds([], ["collections"]));
            await settle(() => !has("C" + colA.id), "fixture: filtered");
            await wv._wvCfTeardown();
            await settle(() => has("C" + colA.id), "every row back");
            // No layer of its own, ever: the rule runs in the hidden collections' `wv-hid` layers
            // (one AND rule; their teardown is theirs), the marks in the fold's class layer.
            const proto = Object.getPrototypeOf(cv);
            const layers = (host, m) => wvT.lib().wvWrapLayers(host, m).map(l => l.layer);
            for (const m of ["_includedInTree", "_expandRow", "_refreshRowMap", "isContainerEmpty"]) {
                for (const host of [cv, proto]) assert.notInclude(layers(host, m).join(" "), "collfunnel", "no funnel layer on " + m);
            }
            assert.include(layers(cv, "_includedInTree"), "wv-hid", "the hidden collections' layer stays");
            assert.isNull(doc.querySelector(".wv-cf-tb-button, .wv-cf-empty, #wv-cf-style"), "no button, message or sheet");
            wv._wvCfWire(win);
            await wv._wvCfRefreshWin(win);
            await settle(() => !has("C" + colA.id) && !!doc.querySelector(".wv-cf-tb-button"), "wired again: the window's funnel applies");
        }
        finally { await reset(false); }
    });

    // Review 2026-11-28 (A): the pane's Bookmarks only, read in as "show only the Bookmarks pane",
    // turned the saved-search folders off: the tree behind it was rebuilt flat, and Reset to
    // Default, the pane's own switch or its "Now showing" line never rebuilt it; the funnel's dot
    // stayed lit after the pane's own switch; a stored "hide folders" was dropped by the next chip.
    it("the pane's Bookmarks only leaves the saved-search folders alone; its own switch redraws the funnel; a stored folders hide survives it", async function () {
        assert.isTrue(wv._wvBmpOn() && wv._wvSfOn(), "fixture: both trials on in a pre-release build (devOnly)");
        const btn = () => wvT.lib().wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button");
        const folderRow = () => rowsOf().some(r => r.ref && r.ref.wvSf);
        let fid = null;
        try {
            await wv._wvSfLoad();
            fid = wv._wvSfNewFolder(L, P + "Folder A", null);
            wv._wvSfAssign([srch], fid);
            await settle(folderRow, "fixture: a folder of saved searches");
            await wv._wvCfChip(win, "secs", "bookmarks", false);
            assert.isTrue(wv._wvBmpState(win).only, "the chip: the pane's Bookmarks only");
            assert.isFalse(wv._wvCfFoldersOff(win), "Bookmarks only is the pane's: the folders stay in the tree behind it");
            await wv._wvCfResetToDefault(win);
            await settle(folderRow, "Reset to Default: the folder row there");
            await wv._wvCfChip(win, "secs", "bookmarks", false);
            await settle(() => btn().classList.contains("wv-cf-active"), "fixture: Bookmarks only lights the funnel");
            wv._wvBmpSetOnly(win, false);
            await settle(() => !btn().classList.contains("wv-cf-active"), "the pane's own switch: the funnel no longer lit");
            assert.isTrue(folderRow(), "and the folder row there");
            // A window that hides the folders, then Bookmarks only from the pane, then a chip of
            // another row: the folders hide stays the window's.
            await set({ secs: { inc: [], exc: ["folders"] } });
            wv._wvBmpSetOnly(win, true);
            await wv._wvCfChip(win, "kinds", "feeds", true);
            assert.deepEqual((wv._wvCfCapture(win) || {}).secs, { exc: ["folders"] }, "the folders hide kept: " + JSON.stringify(wv._wvCfCapture(win)));
        }
        finally {
            try { wv._wvBmpSetOnly(win, false); } catch (e) {}
            try { if (fid) wv._wvSfDeleteFolder(L, fid); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (H, and the plan's creation limit): a collection added while the funnel
    // hides collections is not in the tree, but Zotero's notify still got its insertion index
    // and moved the selection one row down per added collection (collectionTree.jsx notify
    // 'add', `addedIndex <= focused`) -- a sync batch of N moved it N rows.
    it("a collection added while the funnel hides collections: not in the tree, the selection stays; shown once the funnel shows them", async function () {
        let late = null;
        try {
            await set(kinds([], ["collections"]));
            await settle(() => !typesOf().includes("collection") && has("S" + srch.id), "fixture: collections hidden");
            await cv.selectByID("S" + srch.id);
            await settle(() => focusedID() === "S" + srch.id, "fixture: the saved search selected");
            // As sync and undo save (syncLocal.js, undoHistory.js): no auto-select.
            late = /** @type {any} */ (new Zotero.Collection());
            late.name = P + "Added late"; late.libraryID = L;
            await late.saveTx({ skipSelect: true });
            made.unshift(late);
            await wvT.waitFor(() => focusedID() !== "S" + srch.id || null, 1500, 50);
            assert.equal(focusedID(), "S" + srch.id, "the selection stays on the saved search");
            assert.isFalse(has("C" + late.id), "the new collection is not in the tree (collections hidden)");
            assert.isTrue(wvT.lib().wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button").classList.contains("wv-cf-active"), "the funnel lit says why");
            await set(null);
            await settle(() => has("C" + late.id), "the funnel shows collections: the new one there");
        }
        finally { await reset(false); }
    });

    // Review 2026-11-28 (B): the funnel drops a library holding no row it shows; a collection
    // later added to it (sync, another window) never brought it back -- the Group Libraries
    // fold's notify layer drops an id whose library row is missing, and nothing re-asked the
    // funnel -- and a library losing its last shown row kept its bare row.
    it("a library the funnel left out comes back when a row it shows arrives, and goes again when that row goes", async function () {
        let g2 = null, late = null;
        try {
            g2 = await mkGroup(P + "group two");
            await set(kinds(["collections"], []));
            await settle(() => has("C" + colA.id) && !has("L" + g2.libraryID), "fixture: only collections, the empty group out");
            late = await mkCollection(P + "In group two", g2.libraryID);
            await settle(() => has("L" + g2.libraryID) && has("C" + late.id), "the group holds a collection now: back with it");
            await late.eraseTx();
            made.splice(made.indexOf(late), 1);
            await settle(() => !has("L" + g2.libraryID), "its last collection gone: the group goes again");
        }
        finally { await reset(false); }
    });

    // Second review 2026-11-28 (2): a row added or modified in a library whose row was out of the
    // tree rebuilt every tree of the window a moment later (_wvCfNotifyIds -> _wvCfRefreshSoon),
    // whoever had taken the library out -- also the Group Libraries line folding the groups away
    // and the hidden collections hiding the library whole. Under any kinds filter every sync
    // batch, a collaborator's rename or a New Collection in another window rebuilt the trees and
    // scrolled them back to the selected row, for no row changed (the fold rebuilds its groups at
    // its unfold).
    it("a row added to a library the fold or the hidden collections took out rebuilds nothing", async function () {
        wvT.method("_wvGfToggle");
        const calls = [];
        let hid = false, folded = false;
        try {
            await set(kinds([], ["feeds"]));
            await settle(() => !has("F1") && has("L" + G.libraryID), "fixture: Feeds hidden, the group shown");
            await cv.selectLibrary(L);
            await settle(() => focusedID() === "L" + L, "fixture: My Library selected");
            await wv._wvGfToggle(cv, true);
            folded = true;
            await settle(() => has("HG") && !has("L" + G.libraryID), "fixture: the groups folded");
            wv._wvCfRefreshSoon = function () { calls.push("rebuild"); };
            const a = await mkCollection(P + "Added folded", G.libraryID);
            a.name = P + "Added folded renamed";
            await a.saveTx();
            await wvT.sleep(300);
            assert.deepEqual(calls, [], "the fold took the group out: nothing for the funnel to rebuild");
            await wv._wvGfToggle(cv, true);
            folded = false;
            await settle(() => has("L" + G.libraryID), "the line unfolded: the group back");
            await wv._wvHidHide([G], win);
            hid = true;
            await settle(() => !has("L" + G.libraryID), "fixture: the group hidden by the hidden collections");
            await mkCollection(P + "Added hidden", G.libraryID);
            await wvT.sleep(300);
            assert.deepEqual(calls, [], "the hidden collections took the group out: nothing for the funnel to rebuild");
        }
        finally {
            try { delete wv._wvCfRefreshSoon; } catch (e) {}
            if (hid) { try { await wv._wvHidShow(win, null, null, [G.libraryID]); } catch (e) {} }
            if (folded) { try { await wv._wvGfToggle(cv, true); } catch (e) {} }
            try { if (B.prefHasUserValue("weavero.groupLibrariesCollapsed")) B.clearUserPref("weavero.groupLibrariesCollapsed"); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (C): a library, collection or saved search the funnel left out could not
    // be reached -- a zotero://select link, Show Item in Library (collectionTree.jsx selectItems
    // selects the item's library first) and a bookmark's click did nothing. As the hidden
    // collections' bookmark reveal (pane.ts _wvHidReveal): shown while selected. Second review
    // (2026-11-28, 1): for a navigation only -- a bare selectLibrary is the fallbacks' probe
    // ("a fallback's selectLibrary never shows ..." below), so the library is reached here by a
    // library bookmark's click.
    it("a library or collection the funnel left out is reached: shown while it is selected, gone again after", async function () {
        try {
            await set(kinds(["searches"], []));
            await settle(() => has("S" + srch.id) && !has("L" + G.libraryID) && !has("C" + colA.id), "fixture: only saved searches, the group out");
            await wv._bmShowInLibrary({ type: "library", libraryID: G.libraryID }, win);
            await settle(() => focusedID() === "L" + G.libraryID, "a library bookmark: the group selected");
            await cv.selectLibrary(L);
            await settle(() => focusedID() === "L" + L && !has("L" + G.libraryID), "another row selected: the group out again");
            await wv._bmShowInLibrary({ type: "collection", libraryID: L, collectionKey: colA.key }, win);
            await settle(() => focusedID() === "C" + colA.id, "a collection bookmark: the collection selected");
            await cv.selectLibrary(L);
            await settle(() => !has("C" + colA.id), "hidden again once another row is selected");
        }
        finally {
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });

    // Second review 2026-11-28 (1): the C reveal ran on EVERY selectLibrary that found no row, and
    // Weavero's fallbacks ask selectLibrary(My Library) as a probe, going on to the next row when
    // it answers false -- the hidden collections' refresh (pane.ts _wvHidRefreshWin), the Group
    // Libraries fold's reload (group-fold.ts _wvGfReloadKeep), Zotero 11's library tab restore
    // (libraryView.js _restoreLibraryTabState). With My Library left out by the funnel, hiding the
    // selected group through the hidden collections showed and selected My Library.
    it("a fallback's selectLibrary never shows a library the funnel left out: only a navigation does", async function () {
        let hid = false;
        try {
            await set({ libs: { inc: [], exc: ["u"] } });
            await settle(() => !has("L" + L) && has("L" + G.libraryID), "fixture: My Library left out");
            assert.isFalse(!!(await cv.selectLibrary(L)), "a bare selectLibrary answers false, as Zotero does for a row not in the tree");
            assert.isFalse(has("L" + L), "My Library still out");
            await cv.selectLibrary(G.libraryID);
            await settle(() => focusedID() === "L" + G.libraryID, "fixture: the group selected");
            await wv._wvHidHide([G], win);
            hid = true;
            await settle(() => !has("L" + G.libraryID), "the group hidden by the hidden collections");
            await wvT.sleep(200);
            assert.isFalse(has("L" + L), "My Library not shown by their fallback");
            assert.notEqual(focusedID(), "L" + L, "nor selected");
        }
        finally {
            if (hid) { try { await wv._wvHidShow(win, null, null, [G.libraryID]); } catch (e) {} }
            await reset(false);
        }
    });

    // Second review 2026-11-28 (3, 6, 7): a zotero://select link to a collection or saved search
    // the funnel left out did nothing -- Weavero's link handler (index.ts) and Zotero's
    // (ZoteroProtocolHandler.mjs) call selectCollection / selectSearch, whose
    // expandToCollection / _expandToID finds no row (collectionTree.jsx asks _includedInTree
    // first); the C fix reached libraries only.
    it("a link to a collection or saved search the funnel left out reaches it, with its library row", async function () {
        try {
            await set(kinds(["searches"], []));
            await settle(() => has("S" + srch.id) && !has("C" + colA.id), "fixture: only saved searches");
            assert.isTrue(!!(await cv.selectCollection(colA.id)), "selectCollection reaches the collection");
            await settle(() => focusedID() === "C" + colA.id, "the collection selected");
            await cv.selectLibrary(L);
            await settle(() => !has("C" + colA.id), "hidden again once another row is selected");
            await set(kinds(["collections"], []));
            await settle(() => has("C" + colA.id) && !has("S" + srch.id), "fixture: only collections");
            assert.isTrue(!!(await cv.selectSearch(srch.id)), "selectSearch reaches the saved search");
            await settle(() => focusedID() === "S" + srch.id, "the saved search selected");
            await cv.selectLibrary(L);
            await settle(() => !has("S" + srch.id), "hidden again once another row is selected");
            // A collection of a library the funnel hides: its library row comes with it.
            await set({ libs: { inc: [], exc: [gKey()] } });
            await settle(() => !has("L" + G.libraryID) && has("C" + colA.id), "fixture: the group hidden by the funnel");
            assert.isTrue(!!(await cv.selectCollection(colG.id)), "selectCollection reaches a collection of that library");
            await settle(() => focusedID() === "C" + colG.id && has("L" + G.libraryID), "the collection selected, under its library row");
            await cv.selectLibrary(L);
            await settle(() => !has("L" + G.libraryID) && !has("C" + colG.id), "both gone again");
        }
        finally {
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });

    // Second review 2026-11-28 (4): the Trash and the special rows the funnel left out were not
    // reached either -- Weavero's link to trashed items (index.ts selectTrash), a bookmark of a
    // special row (bookmarks.ts treerow: it revealed saved searches only).
    it("the Trash the funnel left out is reached by selectTrash and by a bookmark of it", async function () {
        try {
            await set(kinds([], ["special"]));
            await settle(() => !has("T" + L) && has("C" + colA.id), "fixture: the special rows hidden");
            assert.isTrue(!!(await cv.selectTrash(L)), "selectTrash reaches the Trash");
            await settle(() => focusedID() === "T" + L, "the Trash selected");
            await cv.selectLibrary(L);
            await settle(() => focusedID() === "L" + L && !has("T" + L), "hidden again once another row is selected");
            await wv._bmShowInLibrary({ type: "treerow", rowID: "T" + L }, win);
            await settle(() => focusedID() === "T" + L, "a bookmark of the Trash: selected");
            await cv.selectLibrary(L);
            await settle(() => !has("T" + L), "hidden again");
            // A library the funnel hides: its Trash under its library row.
            await set({ libs: { inc: [], exc: [gKey()] } });
            await settle(() => !has("L" + G.libraryID) && has("T" + L), "fixture: the group hidden by the funnel");
            assert.isTrue(!!(await cv.selectTrash(G.libraryID)), "selectTrash reaches that library's Trash");
            await settle(() => focusedID() === "T" + G.libraryID && has("L" + G.libraryID), "its Trash selected, under its library row");
            await cv.selectLibrary(L);
            await settle(() => !has("L" + G.libraryID) && !has("T" + G.libraryID), "both gone again");
        }
        finally {
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });

    // The navigation that does reach a library the funnel left out: Zotero's selectItems (a
    // zotero://select link to an item, Show Item in Library). An item of the spec's own, made with
    // the sync reminder held off: Zotero shows its banner 5 s after an item event in a profile
    // without sync (zoteroPane.js showSetUpSyncReminder) unless it was shown within 7 days -- the
    // banner stays and shrinks the next spec's tree (see the fixture).
    it("Show Item in Library reaches an item of a library the funnel left out", async function () {
        this.timeout(60000);
        const LD = "sync.reminder.setUp.lastDisplayed";
        const had = B.prefHasUserValue(LD) ? Zotero.Prefs.get(LD) : null;
        /** @type {any} */ let item = null;
        let t0 = 0;
        try {
            Zotero.Prefs.set(LD, Math.round(Date.now() / 1000));
            assert.isFunction(cv.selectItems, "fixture: CollectionTree.selectItems");
            item = new Zotero.Item("book");
            item.libraryID = G.libraryID;
            item.setField("title", P + "item");
            t0 = Date.now();
            await item.saveTx({ skipSelect: true });
            await set(kinds(["searches"], []));
            await settle(() => has("S" + srch.id) && !has("L" + G.libraryID), "fixture: only saved searches, the group out");
            await cv.selectLibrary(L);
            await settle(() => focusedID() === "L" + L, "fixture: My Library selected");
            const n = await cv.selectItems([item.id]);
            await settle(() => focusedID() === "L" + G.libraryID, "the item's library shown and selected");
            assert.equal(n, 1, "the item selected in it");
            await cv.selectLibrary(L);
            await settle(() => !has("L" + G.libraryID), "gone again once another row is selected");
            // Second review (4): a trashed item -- Zotero's selectItems selects its library, finds
            // no item there and goes to the Trash (selectTrash), which the funnel also left out
            // (only Saved searches: no special row). Its Trash shown, its library row kept.
            item.deleted = true;
            t0 = Date.now();
            await item.saveTx({ skipSelect: true });
            await settle(() => focusedID() === "L" + L && !has("L" + G.libraryID), "fixture: the item trashed, the group out");
            // The trashed item's Trash reveal replaces the library's: on Zotero 10 the library
            // reveal's select listener, removed, still ran once and ended it (pane.ts
            // _wvHidRevealCheck; found 2026-11-28).
            const m = await cv.selectItems([item.id]);
            await settle(() => focusedID() === "T" + G.libraryID && has("L" + G.libraryID), "the group's Trash shown and selected, under its library row (selectItems answered " + m + ")");
            assert.equal(m, 1, "the trashed item selected there");
            await cv.selectLibrary(L);
            await settle(() => !has("T" + G.libraryID) && !has("L" + G.libraryID), "both gone again");
        }
        finally {
            try { win.focus(); } catch (e) {}
            await reset(false);
            if (item) { try { t0 = Date.now(); await item.eraseTx(); } catch (e) {} }
            // The reminder's timer reads the pref 5 s after the last item event.
            if (t0) await wvT.sleep(Math.max(0, 5500 - (Date.now() - t0)));
            try { if (had === null) Zotero.Prefs.clear(LD); else Zotero.Prefs.set(LD, had); } catch (e) {}
        }
    });

    // Guards 54bd11f2 (second review 2026-11-28, 4): _wvHidReveal took a special row's type from its
    // table (pane.ts WV_HID_SPECIAL_ROW) with a plain property read, which also answers for a name
    // every object inherits -- {type: "constructor"} passed as a special row, was asked of Zotero's
    // virtual-collection setting, and, its library left out by the funnel, ended the reveal in place
    // to select a row id made of Object's function. The callers' own inputs carry Zotero's six types
    // only (_wvHidRevealTargetOf), so these hand it the inherited names directly.
    const INHERITED = ["constructor", "toString"];
    it("an inherited name is no special row: no reveal, and Zotero's virtual-collection setting is never asked about it", async function () {
        const ZP = /** @type {any} */ (Zotero.Prefs);
        const orig = ZP.getVirtualCollectionStateForLibrary;
        /** @type {string[]} */ const asked = [];
        try {
            await set(kinds([], ["special"]));
            await settle(() => !has("T" + L) && has("C" + colA.id), "fixture: the special rows hidden");
            assert.isTrue(!!(await cv.selectTrash(L)), "fixture: selectTrash reaches the Trash");
            await settle(() => focusedID() === "T" + L, "fixture: the Trash selected, a reveal in place");
            // Zotero's own tree asks it for its row types (collectionTree.jsx): only another name counts.
            ZP.getVirtualCollectionStateForLibrary = function (libraryID, type) { asked.push(String(type)); return orig.apply(this, arguments); };
            for (const type of INHERITED) assert.isFalse(await wv._wvHidReveal(win, { type, libraryID: L }), type + ": no reveal");
            const other = asked.filter((t) => !VIRTUAL.includes(t));
            assert.deepEqual(other, [], "never asked for an inherited name (asked: " + asked.join(", ") + ")");
            assert.equal(focusedID(), "T" + L, "the Trash still selected");
            assert.isTrue(has("T" + L), "its reveal still in place");
        }
        finally {
            ZP.getVirtualCollectionStateForLibrary = orig;
            try { win.focus(); } catch (e) {}
            try { await cv.selectLibrary(L); } catch (e) {}
            await reset(false);
        }
    });

    it("an inherited name is no special row: a reveal in place stays, also of a library the funnel left out", async function () {
        try {
            await set({ libs: { inc: [], exc: [gKey()] } });
            await settle(() => !has("L" + G.libraryID) && has("L" + L), "fixture: the group left out by the funnel");
            await wv._bmShowInLibrary({ type: "library", libraryID: G.libraryID }, win);
            await settle(() => focusedID() === "L" + G.libraryID, "fixture: a library bookmark's click shows and selects the group");
            for (const type of INHERITED) assert.isFalse(await wv._wvHidReveal(win, { type, libraryID: G.libraryID }), type + ": no reveal");
            await wvT.sleep(200);
            assert.equal(focusedID(), "L" + G.libraryID, "the group still selected (rows: " + shape() + ")");
            assert.isTrue(has("L" + G.libraryID), "its reveal still in place");
        }
        finally {
            try { win.focus(); } catch (e) {}
            try { await cv.selectLibrary(L); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (D): "Nothing matches the funnel" with its Clear showed when Zotero's
    // collections search text alone matched nothing (the funnel took nothing the text matched),
    // and Clear threw the funnel away for no row back.
    it("the message blames the funnel only when the funnel took the matches; a search text matching nothing is Zotero's", async function () {
        const shown = () => { const m = doc.querySelector(".wv-cf-empty"); return !!(m && !m.hidden); };
        try {
            await set(kinds([], ["feeds"]));
            await settle(() => !has("F1"), "fixture: Feeds hidden");
            await cv.setFilter("wvcf-no-name-has-this");
            await settle(() => rowsOf().length === 0, "Zotero: nothing matches the text");
            await wvT.waitFor(() => shown() || null, 1500, 50);
            assert.isFalse(shown(), "no funnel message: the text alone left nothing");
            await set(kinds([], ["searches"]));
            await cv.setFilter("zqs");
            await settle(() => !has("S" + srch.id) && shown(), "the text matches a saved search the funnel hides: the message");
        }
        finally {
            try { await cv.setFilter(""); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (E): a library key that names no library of this profile (a group left
    // or deleted, a state from another machine) in a "show only" set hid every library, with no
    // chip to undo it and a Settings line reading "only" with no name.
    it("a library key naming no library filters nothing while it names none; the Settings line names none", async function () {
        const dead = "g3";
        assert.isNotOk(Zotero.Groups.get(3), "fixture: no group 3 in this profile");
        const btn = () => wvT.lib().wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button");
        try {
            await set({ libs: { inc: [dead], exc: [] } });
            await settle(() => has("L" + L) && has("L" + G.libraryID) && has("C" + colA.id), "every library still there");
            assert.isFalse(btn().classList.contains("wv-cf-active"), "nothing filtered: the funnel not lit");
            await set({ libs: { inc: [dead, gKey()], exc: [] } });
            await settle(() => has("L" + G.libraryID) && !has("L" + L), "a live key beside it: only that group");
            await set(null);
            Zotero.Prefs.set(DEF, JSON.stringify({ libs: { inc: [dead] } }));
            assert.equal(wv._wvCfDefaultLibs().mode, "none", "the Settings line: no library left out");
            await settle(() => has("L" + L) && has("L" + G.libraryID), "a window following that default: every library");
        }
        finally { await reset(false); }
    });

    // Review 2026-11-28 (F): Settings' libraries line is redrawn by an observer of the default's
    // pref (prefs/index.ts bindCollFunnelLibs), which runs inside the write; the panel's Use as
    // Default wrote before it dropped its cached read of the default, so the line showed the
    // previous default until Settings was reopened.
    it("Use as Default: an observer of the default reads the new one during the write (Settings' libraries line)", async function () {
        const seen = [];
        let obs = null;
        try {
            wv._wvCfDefaultLibsText();
            await wv._wvCfChip(win, "libs", gKey(), true);
            obs = Zotero.Prefs.registerObserver(DEF, () => { seen.push(wv._wvCfDefaultLibsText()); });
            await wv._wvCfUseAsDefault(win);
            assert.isAbove(seen.length, 0, "fixture: the observer ran");
            assert.include(seen[seen.length - 1], P + "group", "read during the write: the group left out, by name");
        }
        finally {
            try { if (obs) Zotero.Prefs.unregisterObserver(obs); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (G): the trees the funnel rebuilds were picked by an own
    // `_includedInTree` property, whatever sits there -- after a disable on a Zotero that
    // nukes a stopped plugin's scope (zotero#6080), a previous instance's dead stub on a library
    // view behind the one on screen, whose refresh throws into Zotero's error message. Picked
    // now by the hidden collections' `wv-hid` layer, a live one.
    it("the trees the funnel rebuilds are the ones its layer is on, not any own _includedInTree", async function () {
        const lib = wvT.lib();
        try {
            assert.include(wv._wvCfTreesOf(win), cv, "fixture: the pane's tree, with its wv-hid layer");
            lib.wvUnwrap(cv, "_includedInTree", "wv-hid");
            // Another code's own member there, no layer of the hidden collections under it.
            cv._includedInTree = function (o, ...rest) { return Object.getPrototypeOf(this)._includedInTree.call(this, o, ...rest); };
            assert.notInclude(wv._wvCfTreesOf(win), cv, "a tree without the wv-hid layer is not the funnel's");
        }
        finally {
            try { delete cv._includedInTree; } catch (e) {}
            try { wv._wvHidApply(win); } catch (e) {}
            await settle(() => lib.wvWrapLayers(cv, "_includedInTree").some(l => l.layer === "wv-hid"), "the wv-hid layer back");
            await reset(false);
        }
    });

    // Review 2026-11-28 (I): with the saved searches hidden by the funnel (Alt+click, or only
    // Collections / only Special rows), Weavero's saved-search folders were still drawn, empty.
    it("saved searches hidden by the funnel: no saved-search folder rows either", async function () {
        assert.isTrue(wv._wvSfOn(), "fixture: the folders trial on in a pre-release build (devOnly)");
        const folderRow = () => rowsOf().some(r => r.ref && r.ref.wvSf);
        let fid = null;
        try {
            await wv._wvSfLoad();
            fid = wv._wvSfNewFolder(L, P + "Folder I", null);
            wv._wvSfAssign([srch], fid);
            await settle(folderRow, "fixture: a folder of saved searches");
            await set(kinds([], ["searches"]));
            await settle(() => !has("S" + srch.id) && !folderRow() && has("C" + colA.id), "Saved searches hidden: their folders too");
            await set(kinds(["collections"], []));
            await settle(() => has("C" + colA.id) && !folderRow(), "only Collections: no folder row");
            await set(null);
            await settle(folderRow, "everything shown: the folder back");
        }
        finally {
            try { if (fid) wv._wvSfDeleteFolder(L, fid); } catch (e) {}
            await reset(false);
        }
    });

    // Review 2026-11-28 (K): a section whose trial is off kept the funnel lit, its tooltip naming
    // a filter, with no chip to clear it (the panel offers a section's chip only while its trial
    // is on; the Settings box is greyed by the same trial).
    it("a section whose trial is off neither lights the funnel nor names a filter", async function () {
        const btn = () => wvT.lib().wvViewEl(doc, "zotero-collections-toolbar").querySelector(".wv-cf-tb-button");
        try {
            await set({ secs: { inc: [], exc: ["folders"] } });
            await settle(() => btn().classList.contains("wv-cf-active"), "fixture: the folders hidden here, the funnel lit");
            await wvT.withPref("weavero.collectionsSearchFolders", false, async () => {
                await wvT.waitFor(() => !btn().classList.contains("wv-cf-active") || null, 3000, 50);
                assert.isFalse(btn().classList.contains("wv-cf-active"), "the folders trial off: not lit");
                assert.notMatch(btn().getAttribute("tooltiptext") || "", /folders/i, "the tooltip names no folders filter");
            });
        }
        finally { await reset(false); }
    });

    // Review 2026-11-28 (J): with the Group Libraries line folded and a feed present, "show
    // only <group>" while My Library was selected selected a feed (the rows' first
    // isLibrary(true) row) and left the group the user asked for folded away. The plan: its
    // library, else the first library shown -- a feed is a kind, not a library, in the funnel.
    it("the selected library hidden under a folded Group Libraries line: the group shown is selected, not a feed", async function () {
        if (typeof wv._wvGfToggle !== "function") this.skip();
        try {
            await cv.selectLibrary(L);
            await wv._wvGfToggle(cv, true);
            await settle(() => has("HG") && !has("L" + G.libraryID) && has("F1"), "fixture: the groups folded, a feed there");
            await settle(() => focusedID() === "L" + L, "fixture: My Library selected");
            await set({ libs: { inc: [gKey()], exc: [] } });
            await settle(() => focusedID() === "L" + G.libraryID, "the group the funnel shows is selected");
        }
        finally {
            try { if (B.prefHasUserValue("weavero.groupLibrariesCollapsed")) B.clearUserPref("weavero.groupLibrariesCollapsed"); } catch (e) {}
            await reset(false);
            try { if (has("HG") && !has("L" + G.libraryID)) await wv._wvGfToggle(cv, true); } catch (e) {}
        }
    });

    // Review 2026-11-28 (M): the plan's "Spec together: yes" interactions had no spec.
    // Zotero's per-library show/hide of its special rows (collectionTree.jsx, Zotero.Prefs
    // getVirtualCollectionStateForLibrary) is every window's: the funnel never writes it.
    it("hiding the special rows never writes Zotero's own per-library setting for them", async () => {
        const read = () => ["unfiled", "duplicates", "recentlyRead", "retracted"].map(t => t + "=" + /** @type {any} */ (Zotero.Prefs).getVirtualCollectionStateForLibrary(L, t)).join(" ");
        const was = read();
        try {
            await set(kinds([], ["special"]));
            await settle(() => !typesOf().some(t => VIRTUAL.includes(t)), "fixture: special rows hidden here");
            assert.equal(read(), was, "Zotero's setting unchanged while hidden");
            await set(kinds(["special"], []));
            await settle(() => has("T" + L), "only the special rows");
            assert.equal(read(), was, "and while shown only");
        }
        finally { await reset(false); }
    });

    // The Collections and Libraries Manager's own trees (pane.ts, excluded by the plan): the
    // funnel takes nothing out of them, the Trash and the special rows included.
    it("the Collections and Libraries Manager's trees are not the funnel's", async function () {
        this.timeout(60000);
        // A separator row has no id of its own: Zotero numbers it from a counter when the row is
        // made (collectionTreeRow.js, 'I' + IDCounter++), so every redraw renames it -- compared
        // by kind only.
        const ids = (t) => { const o = []; for (let i = 0; i < t.rowCount; i++) { const r = t.getRow(i); if (r && r !== t._hiddenFocusedRow) o.push(/^I\d+$/.test(r.id) ? "I" : r.id); } return o.join(" "); };
        let mw = null;
        try {
            mw = wv._wvHidOpenManager(win);
            assert.ok(mw, "a manager window");
            assert.isTrue(await wvT.waitFor(() => !mw.closed && !!mw._wvHidMgrReady, 15000), "the manager started");
            await mw._wvHidMgrReady;
            const left = mw._wvHidMgrTrees.left;
            const before = ids(left);
            assert.include(before, "C" + colA.id, "fixture: the manager lists the collections");
            await set(kinds([], ["special", "collections"]));
            await settle(() => !has("C" + colA.id) && !has("T" + L), "fixture: the pane's tree filtered");
            await mw._wvHidMgrRender();
            await wvT.sleep(300);
            assert.equal(ids(mw._wvHidMgrTrees.left), before, "the manager's tree unchanged");
        }
        finally {
            try { if (mw && !mw.closed) mw.close(); } catch (e) {}
            await wvT.waitFor(() => !mw || mw.closed, 5000);
            try { win.focus(); } catch (e) {}
            await reset(false);
        }
    });
});
