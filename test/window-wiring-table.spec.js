/* global describe, it, before, assert, Zotero, wvT */

// The per-main-window wiring table (src/modules/window-wiring.ts, survey
// 2026-10-06 §3.2). test/window-wiring.spec.js characterizes what the table
// produces on a real second window; this file guards the table itself:
//   - its shape, and the one known order constraint;
//   - onMainWindowLoad is the table and nothing else, so a new per-window
//     step cannot be added there and missed by init (the drift that left
//     the Edit > Undo hook init-only until 0.21.7);
//   - the init path is idempotent: running it again on a wired window
//     changes no mark (a wrap that stacks, or a listener stamp that is not
//     re-entrant, shows up here);
//   - every entry declares its undo (ADR-0001, docs/adr/): an `unwire` ("auto"
//     or a function) or `diesWithWindow` with its reason -- or it is one of the
//     entries whose undo is still hand-written (UNDO_NOT_MIGRATED below). What
//     each migrated entry's undo does on a live window: test/window-unwire.spec.js.

// The entries whose undo is still HAND-WRITTEN in destroy(), _wvMainWindowTeardown
// or a plugin-wide teardown (ADR-0001, branch wireundo, 2026-11-26). This list only
// SHRINKS: an entry that moves its undo into the table (`unwire` or
// `diesWithWindow`) leaves it in the same commit -- the check below fails an entry
// that is both -- and a new entry never comes here: it declares its undo from the
// start. Once it is empty, destroy() undoes main windows through the table alone.
const UNDO_NOT_MIGRATED = [
    "tab-groups-reapply", "defatt-marker", "itemdetails-tabselect", "title-glyph", "window-icon",
    "advsearch-new-window", "collections-pane-toggle", "feeds-sort", "feeds-graphical", "title-lines",
    "tag-selector-handle", "tag-selector-class", "tag-scope-rows", "tag-reshow", "collection-drop-lib",
    "pane-jump", "feed-abstract", "feed-abstract-load", "feed-head", "intro-crash",
    "adv-search-seed", "adv-search-feed", "sidenav-feed", "ext-ann-delete", "page-count",
    "sidenav-place", "backlinks-ftl", "tree-scroll-anchor", "pin-defer", "item-pane-creep",
    "preview-fit", "stale-preview", "pin-anchor", "sticky-heads", "pane-lock",
    "window-pane-prefs", "stuck-drop-row", "pane-drag-no-collapse", "collections-tree-aids", "hidden-collections",
    "group-fold", "hid-mgr-titles", "title-migration", "collections-search-toggle", "collection-tree-gestures",
    "menu-ghost-workaround", "reader-find-key", "edit-undo-menu", "layout-menu", "taskbar-identity",
    "overlay-badge", "overlay-focus-follow", "restore-trace-mark", "restore-tracing", "managed-window",
    "context-pane-guard", "collection-select-guard", "main-window-indicators", "previous-instance-teardown", "styles",
    "tree-click-delegate", "count-tooltip", "items-list-context-menu", "collections-context-menu", "tab-external-repositioner",
    "tab-split", "multi-open-consolidation", "bookmarks-toolbar-button", "pane-observer", "defpane",
    "items-list-filter", "items-list-filter-view", "row-count-redraw", "tabs-menu-library-sort", "libraries-box-highlight",
    "root-classes", "compact-title-bar", "max-span", "reinject-sidebars", "note-editor-sweeps",
    "default-attachment", "default-child-menu", "legacy-prompt", "default-attachment-reassert", "item-count-breakdown",
    // Added on the dev line while wireundo was open, with a plugin-wide hand-written undo
    // (_wvRemoveExpandScroll, _wvPpCmarkDestroy, _wvSfTeardown, _wvProgressWindowTeardown):
    // listed at the devline merge (2026-11-27) until they move into the table.
    "expand-scroll", "people-cmark", "search-folders", "progress-window",
    // The same for bmpane's entry (its undo: _wvBmpTeardown), listed at the same merge.
    "bookmarks-pane",
];

describe("Weavero — main-window wiring table", function () {
    this.timeout(60000);
    let wv, wires;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWireMainWindow");
        wires = wvT.method("_wvMainWires").call(wv);
        if (!Array.isArray(wires) || !wires.length) wvT.absent("the wiring table (_wvMainWires)");
    });

    it("every entry has a unique id, a path and a wire function", () => {
        const ids = wires.map(e => e.id);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate ids");
        for (const e of wires) {
            assert.include(["both", "load"], e.on, e.id + ".on");
            assert.isFunction(e.wire, e.id + ".wire");
        }
    });

    it("restore tracing wraps restoreState before the managed-window adoption suppresses it", () => {
        const ids = wires.map(e => e.id);
        assert.isAbove(ids.indexOf("restore-tracing"), -1);
        assert.isAbove(ids.indexOf("managed-window"), ids.indexOf("restore-tracing"));
    });

    it("every entry declares its undo, or is still on the hand-written list", () => {
        const bad = [];
        const ids = wires.map(e => e.id);
        for (const e of wires) {
            const unwire = e.unwire === "auto" || typeof e.unwire === "function";
            const dies = typeof e.diesWithWindow === "string" && e.diesWithWindow.trim().length > 0;
            const listed = UNDO_NOT_MIGRATED.includes(e.id);
            if (e.unwire !== undefined && !unwire) bad.push(e.id + ": unwire is neither \"auto\" nor a function");
            if (e.diesWithWindow !== undefined && !dies) bad.push(e.id + ": diesWithWindow needs its reason");
            if (unwire && dies) bad.push(e.id + ": both an unwire and diesWithWindow");
            if (e.skipOnShutdown && !unwire) bad.push(e.id + ": skipOnShutdown without an unwire");
            if (listed && (unwire || dies)) bad.push(e.id + ": migrated -- take it off UNDO_NOT_MIGRATED");
            if (!listed && !unwire && !dies) bad.push(e.id + ": declares no undo (unwire, or diesWithWindow with its reason)");
        }
        for (const id of UNDO_NOT_MIGRATED) if (!ids.includes(id)) bad.push(id + ": on UNDO_NOT_MIGRATED but not in the table");
        assert.deepEqual(bad, []);
    });

    // Unwire runs in REVERSE table order (ADR-0001): the known order constraints
    // between undos are table order -- an entry whose undo must come first sits
    // AFTER the one it must precede.
    it("undo order: the Group Libraries fold after the hidden collections, the filter's view half after the filter", () => {
        const ids = wires.map(e => e.id);
        // destroy(): "The Group Libraries fold BEFORE the hidden collections: its folded
        // rows go back first (group-fold.ts)".
        assert.isAbove(ids.indexOf("group-fold"), ids.indexOf("hidden-collections"));
        assert.isAbove(ids.indexOf("hidden-collections"), -1);
        // The view half wires once the view exists, after the panel (window-wiring.ts).
        // NB destroy() today tears the filter down first and the view's wraps after
        // (_teardownItemsListFilter, then _wvFilterUnwireView): settle that order when
        // these two entries move their undo.
        assert.isAbove(ids.indexOf("items-list-filter-view"), ids.indexOf("items-list-filter"));
        assert.isAbove(ids.indexOf("items-list-filter"), -1);
    });

    it("destroy() unwires the windows through the table before it strips their chrome", () => {
        // The sections locked at the bottom come off before the chrome strip's class
        // sweep (destroy(): _wvPaneLockDestroy ahead of _wvStripWindowChrome): once
        // "pane-lock" declares its undo, the table's pass must still come first.
        const body = String(wv.destroy).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const at = body.indexOf("_wvUnwireMainWindow("), strip = body.indexOf("_wvStripWindowChrome(");
        assert.isAbove(at, -1, "destroy() runs _wvUnwireMainWindow");
        assert.isAbove(strip, at);
        const teardown = String(wv._wvMainWindowTeardown).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        assert.include(teardown, "_wvUnwireMainWindow(", "a closing window is unwired through the table");
    });

    it("onMainWindowLoad runs the table and nothing else", () => {
        const body = String(wv.onMainWindowLoad)
            .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const calls = [...body.matchAll(/\.(_\w+)\(/g)].map(m => m[1]);
        assert.deepEqual(calls, ["_wvWireMainWindow"]);
    });

    it("re-running the init path on a wired window changes no mark", async () => {
        const win = Zotero.getMainWindow();
        // Window IDENTITY marks (the anchor class, icon names) follow how
        // many windows are open: a reader window an earlier spec closed can
        // finish closing -- and refresh identity -- between the two
        // snapshots (checkpoint c8, 2026-10-13). Settle first.
        await wvT.settleSecondaryWindows();
        const before = wvT.wiringSnapshot(win);
        wv._wvWireMainWindow(win, "init");
        await wvT.sleep(1500);
        assert.deepEqual(wvT.wiringSnapshot(win), before);
    });
});

// The reader-window table (same file, wiring slice 2, 2026-10-12). What it
// produces on real windows: test/zz-reader-window-wiring.spec.js.
describe("Weavero — reader-window wiring table", function () {
    let wv, wires;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWireReaderWindow");
        wires = wvT.method("_wvReaderWires").call(wv);
        if (!Array.isArray(wires) || !wires.length) wvT.absent("the reader-window wiring table (_wvReaderWires)");
    });

    it("every entry has a unique id, known paths and a wire function", () => {
        const ids = wires.map(e => e.id);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate ids");
        for (const e of wires) {
            assert.isNotEmpty(e.on, e.id + ".on");
            for (const p of e.on) assert.include(["render", "init", "pref"], p, e.id + ".on");
            assert.isFunction(e.wire, e.id + ".wire");
        }
    });

    it("Edit > Undo is wired after the strip, on every path the strip runs on", () => {
        const strip = wires.find(e => e.id === "tab-strip");
        const undo = wires.find(e => e.id === "edit-undo-menu");
        assert.isOk(strip && undo, "both entries");
        assert.isAbove(wires.indexOf(undo), wires.indexOf(strip), "the strip's teardown unwires it");
        for (const p of strip.on) assert.include(undo.on, p, "edit-undo-menu runs on " + p);
    });

    it("the renderToolbar handler wires reader windows through the table", () => {
        const body = String(wv._toolbarHandlerImpl)
            .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const calls = [...body.matchAll(/\.(_\w+)\(/g)].map(m => m[1]);
        assert.include(calls, "_wvWireReaderWindow");
        for (const step of ["_ensureReaderWindowTabStrip", "_ensureReaderWindowItemPane", "_wvWireEditUndoMenu", "_wvWireReaderWindowReadersCleanup"]) {
            assert.notInclude(calls, step, step + " belongs in the table");
        }
    });
});
