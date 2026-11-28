/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, wvT */

// The Group Libraries line's twisty after a HOT INSTALL over a built tree
// (src/modules/group-fold.ts _wvGfSyncProps). The virtualized tree draws
// each row's twisty, aria-expanded and the twisty's own click from its
// PROPS (isContainerEmpty, isContainerOpen, onToggleOpenState), as
// CollectionTree.render passed them at its last render; a wrap of the tree's
// own member reaches them only at the next render. citations.35, installed
// over citations.34 in MJT's profile (11.0-beta.5, 2026-11-22), drew a
// spacer: the props kept citations.34's isContainerEmpty, which knew no
// fold, and no render came. The suite's tree had re-rendered on a group
// notification, so the fold spec never saw it. With MJT's collections-pane
// options on (pinned parents, indent guides, the pane toggle). Runs late
// (zz-): it reloads the plugin.

describe("Weavero — the Group Libraries twisty after a hot install", function () {
    this.timeout(180000);
    let wv, win, cv, G1, G2;
    const B = Services.prefs.getBranch("extensions.zotero.");
    const PREFS = { "weavero.collectionsStickyParents": true, "weavero.collectionsIndentGuides": true, "weavero.enableVisualExtras": true, "weavero.collectionsPaneToggle": true };
    const saved = {};
    const made = [];
    const idx = (id) => cv.getRowIndexByID(id);
    const hIdx = () => idx("HG");
    const headEl = () => { const i = hIdx(); if (i === false) return null; try { cv.ensureRowIsVisible(i); } catch (e) {} return win.document.getElementById(cv.id + "-row-" + i); };
    const twisty = () => { const el = headEl(); return el && el.querySelector(".twisty"); };
    const shown = (g) => idx("L" + g.libraryID) !== false;
    const unfolded = () => hIdx() !== false && shown(G1) && shown(G2);
    const folded = () => hIdx() !== false && !shown(G1) && !shown(G2);
    const propsLive = () => { const p = cv.tree && cv.tree.props; return !!p && p.isContainerEmpty === cv.isContainerEmpty && p.onToggleOpenState === cv.toggleOpenState; };
    const mouse = (el, type) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, view: win }));
    const mkGroup = async (name) => {
        const g = /** @type {any} */ (new Zotero.Group());
        // A made-up id below 1,000,000: never one of the maintainer's real groups.
        g.id = Zotero.Utilities.rand(100000, 1000000); g.name = name; g.description = "";
        g.editable = true; g.filesEditable = true; g.version = Zotero.Utilities.rand(1000, 10000); g.archived = false;
        await g.saveTx();
        made.push(g);
        return g;
    };

    before(async function () {
        this.timeout(60000);
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvGfSyncProps");
        win = Zotero.getMainWindow();
        cv = win.ZoteroPane.collectionsView;
        for (const k of Object.keys(PREFS)) {
            saved[k] = B.prefHasUserValue(k) ? { v: Zotero.Prefs.get(k) } : null;
            Zotero.Prefs.set(k, PREFS[k]);
        }
        if (B.prefHasUserValue("weavero.groupLibrariesCollapsed")) B.clearUserPref("weavero.groupLibrariesCollapsed");
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        G1 = await mkGroup("wv-gfr-group-a");
        G2 = await mkGroup("wv-gfr-group-b");
        assert.isTrue(await wvT.waitFor(() => unfolded(), 10000) || false, "the line and both groups");
        const s = wv._wvGfStateOf(cv);
        if (s) s.collapsed = false;
    });

    after(async function () {
        this.timeout(60000);
        try { const p = wvT.plugin(); if (p && folded()) await p._wvGfToggle(cv, true); } catch (e) {}
        for (const g of made) { try { await g.eraseTx(); } catch (e) {} }
        try { if (B.prefHasUserValue("weavero.groupLibrariesCollapsed")) B.clearUserPref("weavero.groupLibrariesCollapsed"); } catch (e) {}
        for (const k of Object.keys(PREFS)) {
            try { if (saved[k]) Zotero.Prefs.set(k, saved[k].v); else if (B.prefHasUserValue(k)) B.clearUserPref(k); } catch (e) {}
        }
        await wvT.sleep(500);
    });

    it("props left by a build that knew no fold: wiring the tree renders it again, and the twisty is drawn", async function () {
        // The state a hot install meets: the tree's props hold an older
        // isContainerEmpty (here Zotero's own, which answers "empty" for every
        // header), the tree's own member is this build's.
        const own = cv.isContainerEmpty;
        // Zotero's own, under the hidden collections' layer (lib/wrap.ts table).
        const native = cv._wvWraps && cv._wvWraps.isContainerEmpty && cv._wvWraps.isContainerEmpty.native;
        assert.isFunction(native, "Zotero's own isContainerEmpty is kept");
        cv.isContainerEmpty = native;
        await new Promise(r => cv.forceUpdate(r));
        cv.isContainerEmpty = own;
        cv.tree.invalidate();
        await wvT.sleep(100);
        assert.isFalse(propsLive(), "the props are stale");
        assert.isNotOk(twisty(), "and the line draws a spacer: the bug as it shipped");
        // What the wiring table runs at a hot install.
        wv._wvGfWire(win);
        assert.isTrue(await wvT.waitFor(() => propsLive(), 5000) || false, "the props are the tree's own members again");
        assert.isTrue(await wvT.waitFor(() => !!twisty(), 5000) || false, "the twisty is drawn");
        assert.strictEqual(headEl().getAttribute("aria-expanded"), "true");
    });

    it("a real plugin reload over the built tree: the props are the new build's, the twisty is drawn and folds the line", async function () {
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");
        /** @type {any} */ (Zotero)._weaveroReady = false;
        await addon.reload();
        for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await wvT.sleep(100);
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back");
        wv = wvT.plugin();
        // No notification in between: what MJT's install met.
        assert.isTrue(await wvT.waitFor(() => propsLive(), 8000) || false, "the props are the live members");
        assert.strictEqual(cv.isContainerEmpty._wvTag, wv._wvWireTag(), "the new build's isContainerEmpty");
        assert.isTrue(await wvT.waitFor(() => !!twisty(), 5000) || false, "the twisty is drawn");
        assert.isTrue(twisty().classList.contains("open"), "open");
        const t = twisty();
        mouse(t, "mousedown"); mouse(t, "mouseup");
        assert.isTrue(await wvT.waitFor(() => folded(), 5000) || false, "the twisty folds the line");
        await wv._wvGfToggle(cv, true);
        assert.isTrue(await wvT.waitFor(() => unfolded(), 5000) || false, "and unfolds it");
    });

    // citations.36 over citations.35 (MJT, 11.0-beta.5, 23 groups): open
    // groups, a CLOSED twisty. The previous instance's teardown leaves a
    // refresh running (the hidden collections' plain one, index.ts destroy);
    // the new instance adopts the tree and draws the line open, then that
    // refresh lands with fresh rows -- the header's isOpen false, folded rows
    // back -- through no layer of the new instance's refresh, and its caller
    // redraws. The runner's few groups refresh before the new instance wires:
    // Zotero's saved-search lookup, which _expandRow awaits once per library,
    // is held back during the reload so the refresh lands last, as on MJT's.
    const slowReload = async () => {
        const S = /** @type {any} */ (Zotero.Searches);
        const own = Object.prototype.hasOwnProperty.call(S, "getAll");
        const orig = S.getAll;
        let pending = 0;
        S.getAll = async function () {
            if (/** @type {any} */ (Zotero)._weaveroReady !== true) {
                pending++;
                try { await new Promise(r => setTimeout(r, 2500)); } finally { pending--; }
            }
            return orig.apply(this, arguments);
        };
        try {
            const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
            const addon = await AddonManager.getAddonByID("weavero@mjthoraval");
            if (!addon) wvT.absent("the Weavero add-on in AddonManager");
            /** @type {any} */ (Zotero)._weaveroReady = false;
            await addon.reload();
            for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await wvT.sleep(100);
            assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back");
            wv = wvT.plugin();
            // Every held-back lookup done (the previous instance's refresh has landed).
            for (let i = 0; i < 300 && pending; i++) await wvT.sleep(100);
            await wvT.sleep(1500);
        }
        finally {
            if (own) S.getAll = orig; else delete S.getAll;
        }
    };

    it("a reload while the previous instance's refresh is still running: open groups draw an OPEN twisty, folded ones a closed one -- with no refresh or redraw from the spec", async function () {
        this.timeout(120000);
        assert.isTrue(unfolded(), "open before");
        await slowReload();
        assert.isTrue(unfolded(), "the groups shown");
        assert.isTrue(!!cv.getRow(hIdx()).isOpen, "the header row open");
        assert.isOk(twisty(), "a twisty");
        assert.isTrue(twisty().classList.contains("open"), "drawn open");
        assert.strictEqual(headEl().getAttribute("aria-expanded"), "true", "aria-expanded true");
        // Folded, the same way.
        await wv._wvGfToggle(cv, true);
        assert.isTrue(await wvT.waitFor(() => folded(), 5000) || false, "folded before the reload");
        await slowReload();
        assert.isTrue(folded(), "the groups folded after it");
        assert.isFalse(!!cv.getRow(hIdx()).isOpen, "the header row closed");
        assert.isOk(twisty(), "a twisty");
        assert.isFalse(twisty().classList.contains("open"), "drawn closed");
        assert.strictEqual(headEl().getAttribute("aria-expanded"), "false", "aria-expanded false");
        await wv._wvGfToggle(cv, true);
        assert.isTrue(await wvT.waitFor(() => unfolded(), 5000) || false, "open again");
    });

    it("the same race, step by step: a plain refresh started before the tree is wired lands after it, and the line is drawn as the tree's state says", async function () {
        assert.isTrue(unfolded(), "open before");
        // The previous instance: its teardown, then the hidden collections'
        // plain refresh, not awaited yet.
        await wv._wvGfTeardown();
        const landing = cv.refresh();
        // The new instance wires the tree meanwhile.
        wv._wvHidApply(win);
        wv._wvGfWire(win);
        await wvT.sleep(50);
        // The refresh lands; its caller redraws and lets selections through
        // (pane.ts _wvHidTeardown).
        await landing;
        cv.tree.invalidate();
        cv.selection.selectEventsSuppressed = false;
        await wvT.sleep(200);
        assert.isTrue(unfolded(), "the groups shown");
        assert.isTrue(!!cv.getRow(hIdx()).isOpen, "the header row open");
        assert.isTrue(!!twisty() && twisty().classList.contains("open"), "drawn open");
        assert.strictEqual(headEl().getAttribute("aria-expanded"), "true");
    });

    it("teardown hands Zotero's own members back to the props", async function () {
        const p = wv._wvGfTeardown();
        await p;
        assert.isTrue(await wvT.waitFor(() => propsLive(), 5000) || false, "props = the tree's members");
        assert.isNotOk(cv.isContainerEmpty._wvTag, "Zotero's isContainerEmpty");
        assert.notInclude(String(cv.tree.props.onToggleOpenState), "_wvGf", "Zotero's toggleOpenState");
        await wvT.sleep(100);
        assert.isNotOk(twisty(), "no twisty");
        // Wired again, as a reload would.
        wv._wvHidApply(win);
        wv._wvGfWire(win);
        assert.isTrue(await wvT.waitFor(() => propsLive() && !!twisty(), 5000) || false, "back");
    });
});
