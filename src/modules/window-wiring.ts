// Per-main-window wiring, ONE ordered list (survey 2026-10-06, step 7, §3.2).
//
// Two paths wire a main window:
//   - onMainWindowLoad, for a window opened while the plugin runs: every
//     entry, in this order (`_wvWireMainWindow(win, "load")`);
//   - init, for the window that was already open (the boot window, or the
//     focused one on enable / reload): the entries marked `both`
//     (`_wvWireMainWindow(win, "init")`). Init's other open windows still
//     take the load path.
// Until this table, init repeated the `both` entries by hand in about fifteen
// "onMainWindowLoad only fires for new windows" loops, and the two lists
// drifted (the Edit > Undo hook and Ctrl+Y existed only in init until 0.21.7).
//
// `load` entries stay load-only on purpose: plugin-wide re-asserts that init
// performs once itself (context menus, theme classes, sidebar re-inject,
// default attachment), the window-identity system (init refreshes every
// window, readers included), the managed-window adoption (a pending spawn
// belongs to the window being loaded), the plugin-upgrade marker reset and
// style re-inject (init does both first thing), and timers aimed at a window
// restoring its tabs.
//
// ORDER MATTERS: entries run in table order. Known constraint: the restore
// tracing layer wraps `Zotero_Tabs.restoreState` BEFORE the managed-window
// adoption suppresses the native pane restore -- the un-suppress puts back
// whatever it saved, so the reverse order would drop the tracing layer.
//
// `views` entries need `ZoteroPane.itemsView` and `collectionsView`, which a
// window opened mid-session does not have yet when onMainWindowLoad runs
// (2026-10-09, see `_wvWhenPaneViewsReady`); they run in place when the views
// exist, else in order once they do.
//
// Teardown is NOT in the table: a closed window's wiring dies with it (the
// characterization finds no plugin reference to a closed window), and
// destroy()'s per-window teardowns are guarded by test/disable/leftovers.js.
//
// Guard: test/window-wiring.spec.js (parity of a second window with the
// first, plus the full recording) and test/window-wiring-table.spec.js
// (shape, order constraint, onMainWindowLoad = the table, idempotent init).

import { PANEL_ID } from "./constants";
import { wvUnlisten } from "../lib/listen";

declare const Zotero: any;

/** One wiring step for a main window. `p` is the plugin running the table
 *  (for a deferred `views` entry: the live plugin at fire time). */
export interface WvMainWire {
    id: string;
    /** "both": load and init paths; "load": load path only. */
    on: "both" | "load";
    /** Needs both pane views (itemsView, collectionsView). */
    views?: boolean;
    wire(p: any, win: any): void;
}

const live = (): any => {
    const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
    return p && !p._wvDestroyed ? p : null;
};

export const WV_MAIN_WIRES: WvMainWire[] = [
    // Issue #35 (macOS Dock reopen): a main window created MID-SESSION
    // restores its tabs outside the startup guard-lift pipeline, and nothing
    // re-applied the group visuals there -- tabs knew their group ("Remove
    // from Tab Group" showed) but chips never rendered. Idempotent re-applies
    // on a widening schedule: the claim pass re-stamps members from the
    // preserved shadow as tabs arrive.
    { id: "tab-groups-reapply", on: "load", wire: (p, win) => {
        for (const ms of [2000, 5000, 15000]) {
            win.setTimeout(() => {
                try {
                    if (p._wvDestroyed || win.closed) return;
                    p._applyTabGroups(win);
                } catch (e) {}
            }, ms);
        }
    } },
    // Ctrl+Shift+T -> reopen last closed reader window / group (falls through
    // to Zotero's native tab-undo when Weavero's stack is empty).
    { id: "reopen-closed-shortcut", on: "both", wire: (p, win) => p._wvWireReopenClosedShortcut(win) },
    // Catch `zotero://open...&wvpos=...` arriving from OUTSIDE Zotero:
    // commandLineHandler routes those to ZoteroPane.loadURI, which Weavero's
    // own link surfaces bypass entirely.
    { id: "loaduri-hook", on: "both", wire: (p, win) => p._wvWireLoadURIHook(win) },
    // Auto-default marker: the ItemTree class is per-window, so a NEW
    // window's renderer needs its own patch.
    { id: "defatt-marker", on: "both", views: true, wire: (p) => p._wvWireDefattMarker() },
    // Session-save hardening: base types for -loading tabs.
    { id: "tabs-getstate", on: "both", wire: (p, win) => p._wvPatchTabsGetState(win) },
    // Multi-main-window fix: ignore other windows' tab-select notifier events
    // in this window's <item-details> (they froze the pane).
    { id: "itemdetails-tabselect", on: "both", wire: (p, win) => p._wvPatchItemDetailsTabSelect(win) },
    // Window-type glyph in the OS title (opt-in) + per-window taskbar icon
    // (Windows; Chrome-profile-style badge). Init: _wvRefreshTitleGlyphs /
    // _wvRefreshWindowIcons over every window.
    { id: "title-glyph", on: "load", wire: (p, win) => p._wvApplyTitleGlyph(win) },
    { id: "window-icon", on: "load", wire: (p, win) => p._wvApplyWindowIcon(win) },
    // Ctrl+T -> "open a library item" picker (reader windows wire theirs at
    // strip build).
    { id: "new-tab-shortcut", on: "both", wire: (p, win) => p._wvWireMainNewTabShortcut(win) },
    { id: "new-window-shortcut", on: "both", wire: (p, win) => p._wvWireNewWindowShortcut(win) },
    { id: "advsearch-new-window", on: "both", wire: (p, win) => p._wvWireAdvSearchNewWindow(win) },
    { id: "collections-pane-toggle", on: "both", wire: (p, win) => p._wvApplyCollectionsPaneToggle(win) },
    { id: "pane-drag-no-collapse", on: "both", wire: (p, win) => p._wvApplyPaneDragNoCollapse(win) },
    { id: "collections-tree-aids", on: "both", views: true, wire: (p, win) => p._wvApplyCollectionsTreeAids(win) },
    // Hidden collections: per window (the store loads once, then refreshes
    // every window that has something hidden). Retries on its own until the
    // collections tree exists.
    { id: "hidden-collections", on: "both", wire: (p, win) => { p._wvHidApply(win); p._wvHidLoad(); } },
    // Legacy by-position window titles -> each window's own state, once,
    // after the startup restore has rebuilt the windows.
    { id: "title-migration", on: "load", wire: (p, win) => {
        if (!p._wvTitleMigrationArmed && !Zotero.Prefs.get("weavero.windowTitlesMigrated", true)) {
            p._wvTitleMigrationArmed = true;
            win.setTimeout(() => { try { const lp = live(); if (lp) lp._wvMigrateIndexTitles(); } catch (e) {} }, 20000);
        }
    } },
    { id: "collections-search-toggle", on: "both", wire: (p, win) => p._wvWireCollectionsSearchToggle(win) },
    { id: "collection-tree-gestures", on: "both", wire: (p, win) => p._wvWireCollectionTreeGestures(win) },
    { id: "menu-ghost-workaround", on: "both", wire: (p, win) => p._wvWireMenuGhostWorkaround(win) },
    { id: "reader-find-key", on: "both", wire: (p, win) => p._wvWireReaderFindKey(win) },
    { id: "column-picker-mark", on: "both", wire: (p, win) => p._wvWireColumnPickerMark(win) },
    { id: "column-picker-native-fix", on: "both", wire: (p, win) => p._wvWireColumnPickerNativeFix(win) },
    { id: "items-cross-window-drop", on: "both", wire: (p, win) => p._wvWireItemsCrossWindowDrop(win) },
    // Edit > Undo hook + the reader's Ctrl+Y (until 0.21.7 only the init loop
    // wired them: a window opened later had neither).
    { id: "edit-undo-menu", on: "both", wire: (p, win) => p._wvWireEditUndoMenu(win) },
    // Per-window taskbar identity (pref-gated, default off). Init:
    // _wvRefreshWindowTaskbarIdentities.
    { id: "taskbar-identity", on: "load", wire: (p, win) => p._wvApplyWindowTaskbarIdentity(win) },
    // Taskbar badge via the poison ledger (NEVER the raw apply: it bypasses
    // the settle gate and the leak bookkeeping -- this call was the
    // unexplained gate-bypassing set in the 2026-07-14 boot log). Init:
    // _wvRefreshTaskbarOverlays.
    { id: "overlay-badge", on: "load", wire: (p, win) => p._wvOvSetBadge(win, "main-window-load") },
    { id: "overlay-focus-follow", on: "load", wire: (p, win) => p._wvWireOverlayFocusFollow(win) },
    // Restore breadcrumbs: log restoreState inputs/outputs + early closes.
    // BEFORE managed-window (see ORDER MATTERS above).
    { id: "restore-trace-mark", on: "load", wire: (p, win) => p._wvTrace("onMainWindowLoad: " + (p._wvWindowName ? p._wvWindowName(win) : "?")) },
    { id: "restore-tracing", on: "both", wire: (p, win) => p._wvWireRestoreTracing(win) },
    { id: "managed-window", on: "load", wire: (p, win) => p._wvAdoptPendingDevWindow(win) },
    // Scope this window's context pane to its OWN tabs, so a reader-tab select
    // in another window can't show its item pane here (applies to every main
    // window -- the anchor leaks too; no-op single-window).
    { id: "context-pane-guard", on: "both", wire: (p, win) => p._wvGuardContextPaneCrossWindow(win) },
    // Stop a new collection from stealing the selection in every window (only
    // the acting window should follow it).
    { id: "collection-select-guard", on: "both", views: true, wire: (p, win) => p._wvGuardCollectionSelectCrossWindow(win) },
    // Re-evaluate the anchor dot on every window (count changed -> a newly-
    // opened 2nd window reveals the dot on the anchor).
    { id: "main-window-indicators", on: "load", wire: (p) => p._wvUpdateAllMainWindowIndicators() },
    // A previous instance's handlers on THIS window (the other main windows
    // keep theirs, #17), its URL-title restorer on the items tree (defends
    // against Zotero's overflow handler stripping our title; see
    // `_setupTreeClickDelegate`), its DOM markers (plugin-upgrade recovery:
    // `data-wv-related-rendered` / `data-wv-ctx-wired` left on related-box
    // rows made the new code skip them, their handlers tied to dead
    // closures), its leftover popup panel. Init does the same for the boot
    // window first thing.
    { id: "previous-instance-teardown", on: "load", wire: (p, win) => {
        p._teardownTreeClickDelegate(win);
        p._teardownItemsListContextMenu();
        p._teardownCollectionsContextMenu(win);
        p._teardownTabsMenuLibrarySort(win);
        p._teardownLibrariesBoxHighlight(win);
        p._teardownPaneObserver(win);
        try {
            const doc = win && win.document;
            const tree = doc && (doc.getElementById("item-tree-main")
                || doc.getElementById("item-tree-main-default"));
            if (tree) wvUnlisten(tree, "urlTitle:mouseover");
            if (tree && tree._wvUrlTitleListener) {   // builds before the keyed wiring
                tree.removeEventListener("mouseover", tree._wvUrlTitleListener);
                delete tree._wvUrlTitleListener;
            }
        } catch (e) {}
        try { p._resetStaleMarkers(win && win.document); } catch (e) {}
        try {
            const oldPanel = win && win.document && win.document.getElementById(PANEL_ID);
            if (oldPanel) oldPanel.remove();
        } catch (e) {}
    } },
    // Inject into THIS window's document -- `injectStyles()` targets
    // `Zotero.getMainWindow()` (the most-recently-focused window), which is
    // wrong for a BACKGROUND window: the focused window got the styles twice
    // and this one got none.
    { id: "styles", on: "load", wire: (p, win) => {
        try { p.injectStylesInto(win && win.document); }
        catch (e) { p.injectStyles(); }
    } },
    { id: "tree-click-delegate", on: "both", wire: (p, win) => p._setupTreeClickDelegate(win) },
    { id: "items-list-context-menu", on: "load", wire: (p) => p._setupItemsListContextMenu() },
    { id: "collections-context-menu", on: "load", wire: (p) => p._setupCollectionsContextMenu() },
    { id: "tab-external-repositioner", on: "both", wire: (p, win) => p._setupTabExternalRepositioner(win) },
    { id: "multi-open-consolidation", on: "both", wire: (p, win) => p._wvSetupMultiOpenConsolidation(win) },
    { id: "bookmarks-toolbar-button", on: "both", wire: (p, win) => {
        if (p._getEnableLibraryBookmarks()) p._setupBookmarksToolbarButton(win);
    } },
    { id: "pane-observer", on: "both", wire: (p, win) => p._setupPaneObserver(win) },
    { id: "items-list-filter", on: "both", wire: (p, win) => p._setupItemsListFilter(win) },
    // The view half again once the view exists (the panel's wv-filter-bar
    // guard stops a second _setupItemsListFilter before it).
    { id: "items-list-filter-view", on: "both", views: true, wire: (p, win) => p._wvWireItemsFilterView(win) },
    { id: "tabs-menu-library-sort", on: "both", wire: (p, win) => p._setupTabsMenuLibrarySort(win) },
    { id: "libraries-box-highlight", on: "both", wire: (p, win) => p._setupLibrariesBoxHighlight(win) },
    // Re-apply CSS-class state (these set classes on root.documentElement).
    { id: "root-classes", on: "load", wire: (p) => {
        p._applyInlineLinksPref(p._getInlineLinks());
        p._applyUIThemeClass();
    } },
    // Compact-title-bar mode if the pref is on (default off). Runs after the
    // window is fully laid out so the buttonbox move doesn't race against
    // Zotero's own titlebar init. Idempotent (early-returns on a stash).
    { id: "compact-title-bar", on: "both", wire: (p, win) => {
        if (p._getCompactTitleBarMain()) p._applyCompactTitleBar(win);
    } },
    // Refresh sidebar icons across any open readers. The
    // renderSidebarAnnotationHeader event won't re-fire for rows that were
    // already mounted before the plugin (re-)started.
    { id: "reinject-sidebars", on: "load", wire: (p) => p._reinjectAllSidebars() },
    // Deferred note-editor sweeps for THIS window: a restored managed
    // window's editors (note tab + context pane) finish loading well after
    // the boot sweeps ran, and nothing event-driven covers the context-pane
    // editor -- they sat unwired (native blue links) until some later sweep
    // happened by. Two delayed passes bracket the restore window.
    { id: "note-editor-sweeps", on: "load", wire: (p, win) => {
        for (const d of [3000, 10000]) {
            win.setTimeout(() => { try { const lp = live(); if (lp) lp._processNoteEditors(win.document); } catch (e) {} }, d);
        }
    } },
    // Default-child override: patches Zotero.Item.prototype.getBestAttachment
    // (version-stamped, so per-window calls are free and a reload re-wires
    // cleanly). See modules/attachments.ts.
    { id: "default-attachment", on: "load", wire: (p) => p._wvWireDefaultAttachment() },
    { id: "default-child-menu", on: "load", wire: (p, win) => p._wvWireDefaultChildMenu(win) },
    // A pending "we imported your picks" notice. This is the path that covers
    // a COLD start, where the import ran before any window existed. The pref
    // is only cleared once the user dismisses the toast.
    { id: "legacy-prompt", on: "load", wire: (p, win) => p._wvShowLegacyPrompt(win) },
    // Re-assert the getBestAttachment override after other plugins have had
    // time to load: PikaPei/zotero-default-attachment patches the same
    // method, and the LAST wrapper wins. A no-op when already outermost.
    { id: "default-attachment-reassert", on: "load", wire: (p, win) => {
        for (const d of [3000, 10000]) {
            win.setTimeout(() => { try { const lp = live(); if (lp) lp._wvWireDefaultAttachment(); } catch (e) {} }, d);
        }
    } },
    // Tiered item-pane count. Wraps the item pane's message setter, so it
    // must be per-window and re-hooked on reload.
    { id: "item-count-breakdown", on: "both", wire: (p, win) => p._wvWireItemCountBreakdown(win) },
    // Issue #29: only let close-automation see a document's LAST view.
    { id: "last-view-close-guard", on: "both", wire: (p, win) => p._wvWireLastViewCloseGuard(win) },
    // Quick-copy shortcuts honour the tab multi-selection.
    { id: "quick-copy-multi-tab", on: "both", wire: (p, win) => p._wvWireQuickCopyMultiTab(win) },
];

// Standalone READER windows (`zotero:reader`), the same idea (wiring slice 2,
// 2026-10-12). Three paths wire one:
//   - "render": the reader's renderToolbar event (`_toolbarHandlerImpl`),
//     fired on the window's first render and again on re-renders, so every
//     entry is idempotent;
//   - "init": a window already open when the plugin starts (enable, reload,
//     update);
//   - "pref": the "Hide title bar" toggle for reader windows.
// Each path used to call its own subset, and they disagreed (first recording
// of test/zz-reader-window-wiring.spec.js): with the title bar kept, a reload
// left the window without the Edit > Undo hook, Ctrl+Y and the Move to Tab
// button, a live toggle-off left it without the first two, and a window
// OPENED that way had no window identity (taskbar icon, overlay badge) until
// a reload gave it one.
//
// ORDER MATTERS: the strip's teardown (option off) unwires Edit > Undo and
// Ctrl+Y, so "edit-undo-menu" runs after "tab-strip".
//
// `anyReader` entries run for every reader the window renders (a re-homed
// reader carries a synthetic tabID); the others for the window's own native
// reader only.
//
// Window identity is "render" only: init refreshes identity plugin-wide for
// every window (_wvRefreshWindowIcons and co.), as for main windows.
//
// Note windows (`zotero:note`) have one wiring step, _ensureNoteWindowTabStrip,
// run by the note-window watcher (open and init) and by the same pref
// observer; the recording finds the three paths in agreement.
//
// Guard: test/zz-reader-window-wiring.spec.js (each window after open, plugin
// reload and live toggle: the paths agree, plus the full recording) and
// test/window-wiring-table.spec.js (shape, order, the render handler = the
// table).

export type WvReaderWirePath = "render" | "init" | "pref";

/** One wiring step for a standalone reader window `win`; `r` is the reader
 *  the path is wiring for. */
export interface WvReaderWire {
    id: string;
    on: WvReaderWirePath[];
    anyReader?: boolean;
    wire(p: any, win: any, r: any): void;
}

export const WV_READER_WIRES: WvReaderWire[] = [
    // Splice this window's dead readers out of Zotero.Reader._readers when it
    // closes (a dead entry wedges Reader.open and Session.save).
    { id: "readers-cleanup", on: ["render", "init"], anyReader: true, wire: (p, win) => p._wvWireReaderWindowReadersCleanup(win) },
    { id: "reopen-closed-shortcut", on: ["render", "init"], anyReader: true, wire: (p, win) => p._wvWireReopenClosedShortcut(win) },
    // Ctrl+N (new main window) whatever the title-bar option: it came only
    // with the strip (MJT 2026-10-13, survey §3.5).
    { id: "new-window-shortcut", on: ["render", "init"], anyReader: true, wire: (p, win) => p._wvWireNewWindowShortcut(win) },
    // Uninit the window's mounted (non-native) readers when it closes. Also
    // wired when a tab mounts; here so a reload re-wires it.
    { id: "wt-teardown", on: ["render", "init"], anyReader: true, wire: (p, win) => p._wvWTWireWindowTeardown(win) },
    // Title bar -> tab strip + hidden menu bar, or both torn down when the
    // option is off.
    { id: "tab-strip", on: ["render", "init", "pref"], wire: (p, _win, r) => p._ensureReaderWindowTabStrip(r) },
    // AFTER the strip (see ORDER MATTERS).
    { id: "edit-undo-menu", on: ["render", "init", "pref"], wire: (p, win) => p._wvWireEditUndoMenu(win) },
    { id: "item-pane", on: ["render", "init"], wire: (p, _win, r) => p._ensureReaderWindowItemPane(r) },
    // The render path appends the button through the event's own `append`
    // (_toolbarHandlerImpl); the other paths add or remove it in the page.
    { id: "move-to-tab-button", on: ["init", "pref"], wire: (p, _win, r) => p._wvSyncReaderMoveButton(r) },
    { id: "window-identity", on: ["render"], wire: (p, win) => p._wvWireReaderWindowIdentity(win) },
];

class _WindowWiringMixin {
    /** The table, for test/window-wiring-table.spec.js. */
    _wvMainWires(): WvMainWire[] { return WV_MAIN_WIRES; }

    /** Run the wiring table for main window `win` ("load": every entry, for
     *  a window opened while the plugin runs; "init": the `both` entries,
     *  for a window that was already open). Each entry is isolated: one
     *  throwing must not skip the rest. */
    _wvWireMainWindow(win: any, path: "load" | "init") {
        if (!win || win.closed) return;
        const p: any = this;
        // Never for a destroyed instance. Init and the window listeners
        // reach here after awaits and timers, and a reload that lands
        // in between (an install, then an immediate reload) let the dead
        // instance wire the window anyway: its keyed listeners were refused
        // (dead tag), its plain ones -- the items context menu, the Copy
        // Link menu -- stayed for the session (live audit, 2026-10-13).
        if (p._wvDestroyed) return;
        const ZP: any = win.ZoteroPane;
        const viewsNow = !!(ZP && ZP.itemsView && ZP.collectionsView
            && win.document.getElementById("collection-tree"));
        const later: WvMainWire[] = [];
        for (const e of WV_MAIN_WIRES) {
            if (p._wvDestroyed) return;
            if (path === "init" && e.on !== "both") continue;
            if (e.views && !viewsNow) { later.push(e); continue; }
            try { e.wire(p, win); }
            catch (err) { Zotero.debug("[Weavero] wire " + e.id + " err: " + err); }
        }
        if (later.length) {
            p._wvWhenPaneViewsReady(win, (lp: any) => {
                for (const e of later) {
                    try { e.wire(lp, win); }
                    catch (err) { Zotero.debug("[Weavero] wire " + e.id + " (views) err: " + err); }
                }
            });
        }
    }

    /** The reader-window table, for test/window-wiring-table.spec.js. */
    _wvReaderWires(): WvReaderWire[] { return WV_READER_WIRES; }

    /** Every open standalone reader window, with the reader the init and
     *  pref paths wire it for: its own (native) reader, or -- a deck window
     *  holding only notes, a window whose native tab was closed -- a STAND-IN
     *  carrying just the window. Every native entry reaches the window
     *  through `r._window`; the page-level ones find no `_iframeWindow` and
     *  skip. Filtering `Zotero.Reader._readers` instead missed those windows
     *  entirely: harmless while each reload left the old instance's listeners
     *  in place, but once destroy() removed them (wiring slice 3) a reload
     *  left a deck window without Ctrl+T, Ctrl+Shift+T, Ctrl+N, its window
     *  controls and its close-time cleanup (2026-10-13). */
    _wvReaderWindowTargets(): Array<{ win: any; r: any }> {
        const out: Array<{ win: any; r: any }> = [];
        try {
            const rs: any[] = (Zotero.Reader as any)._readers || [];
            const en = Services.wm.getEnumerator("zotero:reader");
            while (en.hasMoreElements()) {
                const w: any = en.getNext();
                if (!w || w.closed) continue;
                const r = rs.find((x: any) => x && !x.tabID && x._window === w);
                out.push({ win: w, r: r || { _window: w, _wvStandIn: true } });
            }
        } catch (e) { Zotero.debug("[Weavero] _wvReaderWindowTargets err: " + e); }
        return out;
    }

    /** Run the reader-window table on `path` for standalone reader window
     *  `win`, reader `r`. `native`: `r` is the window's own reader (no
     *  tabID); false runs only the `anyReader` entries. Each entry is
     *  isolated: one throwing must not skip the rest. */
    _wvWireReaderWindow(win: any, r: any, path: WvReaderWirePath, native = true) {
        if (!win || win.closed || !win.document) return;
        try {
            if (win.document.documentElement.getAttribute("windowtype") !== "zotero:reader") return;
        } catch (e) { return; }
        const p: any = this;
        if (p._wvDestroyed) return;   // as _wvWireMainWindow
        for (const e of WV_READER_WIRES) {
            if (p._wvDestroyed) return;
            if (!e.on.includes(path)) continue;
            if (!native && !e.anyReader) continue;
            try { e.wire(p, win, r); }
            catch (err) { Zotero.debug("[Weavero] reader wire " + e.id + " err: " + err); }
        }
    }

    /** Weavero managed window: a window spawned by the dev "New Main
     *  Window" command (or by session-restore) is tagged `_wvManagedWindow`
     *  -- a Weavero-managed peer, as opposed to the untagged oldest "anchor"
     *  window that Zotero restores natively. The tag (a) hides the "New Main
     *  Window" menu entry inside it and (b) marks it for capture into
     *  Weavero's own store. It then either restores its saved tab group
     *  (startup restore) or starts clean -- library tab only (manual new
     *  window). No pane relabel: Zotero already restores only the oldest
     *  pane (the anchor), so managed windows are skipped for free; Weavero
     *  recreates them itself. Load path only: a pending spawn belongs to the
     *  window being loaded. */
    _wvAdoptPendingDevWindow(this: any, _window: any) {
        try {
            if (this._wvPendingDevWindow && _window && !_window._wvManagedWindow) {
                this._wvPendingDevWindow = false;
                _window._wvManagedWindow = true;
                // Restore case: pull the next queued group. Manual case:
                // queue is empty → group is null → clean start.
                let group = null;
                if (this._wvDevSpawnQueue && this._wvDevSpawnQueue.length) {
                    group = this._wvDevSpawnQueue.shift();
                }
                // Stable per-window id: a restored window carries it in its saved
                // group; a manual new window gets a fresh one. Drives the
                // per-window items-tree column key so layouts persist across
                // restarts (keyed by this id, not a session-scoped counter).
                try {
                    _window._wvWindowId = (group && group.wvWinId != null)
                        ? group.wvWinId : this._wvNextWindowId();
                } catch (e) {}
                // ROOT FIX for fused windows (2026-07-16): swallow the
                // native session mirror before ZoteroPane.init reaches
                // it — this window gets ONLY its own tabs. finish() in
                // _wvInitDevMainWindow unwraps for Weavero's restore.
                try { (this as any)._wvSuppressNativePaneRestore(_window); } catch (e) {}
                this._wvInitDevMainWindow(_window, group);
                // Multi-monitor placement saved at quit. No geometry at
                // all (legacy session entries from before sessions
                // captured it) → maximize rather than leave the tiny
                // default window (user report 2026-07-15).
                try {
                    if (group && group.geom) (this as any)._wvApplyWindowGeom(_window, group.geom);
                    else if (_window.maximize) _window.maximize();
                } catch (e) {}
                // Closed-in-series capture (Firefox `_shouldRestore`): a managed
                // window closing may be quit-teardown running before the quit
                // notification — snapshot its store entry while Zotero_Tabs is
                // intact so the quit flush can fold it back into the open set.
                try {
                    _window.addEventListener("unload", () => {
                        try {
                            // Explicit Save-and-Close park: stay parked -- do
                            // not feed the closed-in-series buffer, or the
                            // quit flush resurrects the window as a live
                            // duplicate of its own saved entry (2026-07-27).
                            if ((_window as any)._wvSavedParkClose) return;
                            const Z = _window.Zotero_Tabs;
                            const tabs = Z && Z.getState ? Z.getState() : null;
                            if (tabs && tabs.length > 1) {
                                (this as any)._wvWindowStoreNoteClosingWindow(
                                    { kind: "main-dev", tabs, wvWinId: (_window._wvWindowId != null ? _window._wvWindowId : null) }, []);
                            }
                        } catch (e) {}
                    }, { once: true });
                } catch (e) {}
                // Give this managed window its own items-tree column layout
                // (else it shares/clobbers the primary's via treePrefs.json).
                try { this._wvScheduleApplyPerWindowColumns(_window); } catch (e) {}
                // ...and its own reader/note sidebar state (else it shares the
                // global `sidebarState` pref with every other window).
                try { this._wvApplyPerWindowSidebar(_window); } catch (e) {}
                // ...and its own pane widths (else its serializePersist clobbers
                // the global `pane.persist` with this window's widths at close).
                try { this._wvApplyPerWindowPanePersist(_window); } catch (e) {}
                // Chain the next queued dev window, if any. (We do NOT restore
                // the cleared session pane state here — that re-populated it
                // before the new window read it → the flash. It self-heals on
                // the next Session.save.)
                if (this._wvDevSpawnQueue && this._wvDevSpawnQueue.length) {
                    try { this._wvSpawnNextDevWindow(); } catch (e) {}
                }
            }
        } catch (e) {}
    }

    /** Run `fn(livePlugin)` once main window `win` has BOTH pane views.
     *  Zotero calls onMainWindowLoad at the window's `load` event
     *  (xpcom/plugins.js), while ZoteroPane.init awaits initItemsTree and
     *  then initCollectionsTree before it assigns `itemsView` /
     *  `collectionsView` (zoteroPane.js). Every view wrap in
     *  onMainWindowLoad therefore skipped a window opened mid-session:
     *  no collection-select guard, no collections-tree aids, no
     *  setFilter / changeCollectionTreeRow / selectItems wraps (found
     *  2026-10-09 by test/window-wiring.spec.js). Polls, bounded (~30 s),
     *  and resolves the live plugin at fire time so a reload in between
     *  never runs a dead instance's code. */
    _wvWhenPaneViewsReady(win: any, fn: (lp: any) => void) {
        let n = 0;
        const tick = () => {
            try {
                if (!win || win.closed) return;
                const lp = live();
                if (!lp) return;
                const ZP: any = win.ZoteroPane;
                if (ZP && ZP.itemsView && ZP.collectionsView
                    && win.document.getElementById("collection-tree")) {
                    fn(lp);
                    return;
                }
                if (++n < 120) win.setTimeout(tick, 250);
            } catch (e) { Zotero.debug("[Weavero] _wvWhenPaneViewsReady err: " + e); }
        };
        tick();
    }
}

const _windowWiringDescriptors = Object.getOwnPropertyDescriptors(_WindowWiringMixin.prototype);
delete (_windowWiringDescriptors as any).constructor;
export const windowWiringMethods = _windowWiringDescriptors;
