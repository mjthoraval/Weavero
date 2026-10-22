// Weavero's reactions to its own preference changes, ONE ordered table
// (code survey 2026-10-06 §3.5; consolidation plan step 4, slice 2,
// 2026-10-17). It was a ~680-line chain of `if (data === ...)` statements
// inside the root-branch pref observer in index.ts.
//
// Each entry is one of those statements, moved VERBATIM -- its own
// condition included -- with `this` now `p`, the plugin. `keys` lists the
// pref names the condition compares with, as a fast filter (null: the
// statement runs for every Weavero pref and checks for itself). ORDER
// MATTERS: entries run in table order for a change, as the statements did,
// and several react to the same pref (a section master re-runs its
// children's appliers).
//
// Guard: test/prefs-observer.spec.js (for every pref name, the plugin
// methods one change calls, in order, recorded on 0.22.2-prefs.2).

import { wvMainWins, wvWinType } from "../lib/windows";
/* eslint-disable */
declare const Zotero: any;
declare const Services: any;

export interface WvPrefObserver {
    keys: string[] | null;
    run(p: any, data: string): void;
}

export const WV_PREF_OBSERVERS: WvPrefObserver[] = [
    {
        keys: null,
        run(p: any, data: string) {
            if (data.includes("weavero")) {
                p._dbg("[Weavero] pref changed at path: " + data);
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.inlineLinks"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.inlineLinks") {
                p._applyInlineLinksPref(p._getInlineLinks());
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.collectionsPaneToggle", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.collectionsPaneToggle"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const wins = wvMainWins();
                    for (const w of wins) p._wvApplyCollectionsPaneToggle(w);
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.tagSelectorHandle", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.tagSelectorHandle"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const wins = wvMainWins();
                    for (const w of wins) p._wvApplyTagSelectorHandle(w);
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.collectionsStickyParents", "extensions.zotero.weavero.collectionsStickyMax", "extensions.zotero.weavero.collectionsPathTooltip", "extensions.zotero.weavero.collectionsIndentGuides", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.collectionsStickyParents"
                || data === "extensions.zotero.weavero.collectionsStickyMax"
                || data === "extensions.zotero.weavero.collectionsPathTooltip"
                || data === "extensions.zotero.weavero.collectionsIndentGuides"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const wins = wvMainWins();
                    for (const w of wins) p._wvApplyCollectionsTreeAids(w);
                } catch (e) {}
                if (data === "extensions.zotero.weavero.enableVisualExtras") {
                    try { p._wvHidRefreshAll(); } catch (e) {}
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.selectedTabRing", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.selectedTabRing"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    for (const t of ["navigator:browser", "zotero:reader", "zotero:note"]) {
                        const en = Services.wm.getEnumerator(t);
                        while (en.hasMoreElements()) {
                            try { p._wvEnsureSelectedTabRing((en.getNext() as any).document); } catch (e) {}
                        }
                    }
                    // Group chips/lines take nova's colours with the design on.
                    p._wvTabGroupApplyEverywhere();
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.paneDragNoCollapse", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.paneDragNoCollapse"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const wins = wvMainWins();
                    for (const w of wins) p._wvApplyPaneDragNoCollapse(w);
                    const en = Services.wm.getEnumerator("zotero:reader");
                    while (en.hasMoreElements()) { try { p._wvApplyReaderPaneSnap(en.getNext()); } catch (e) {} }
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableItemsList"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableItemsList") {
                p._applySurfacePref("itemsList");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableAnnSort", "extensions.zotero.weavero.enableFilters"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableAnnSort"
                || data === "extensions.zotero.weavero.enableFilters") {
                // Annotation sort follows its own toggle AND the
                // section master; the ensure pass self-gates (tears
                // down when disabled, rewires when re-enabled).
                try {
                    for (const r of (Zotero.Reader._readers || [])) {
                        const d = r._iframeWindow && r._iframeWindow.document;
                        if (d) p._wvAnnSortEnsure(r, d);
                    }
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableRightPane"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableRightPane") {
                p._applySurfacePref("rightPane");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableNotes"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableNotes") {
                // Toggling Notes off → strip decorated content
                // back to plain text BEFORE the rescan (which
                // would no-op since `_processNote*` early-return
                // when the toggle is off). Toggling on → rescan
                // re-decorates everything.
                try {
                    if (!p._getEnableNotes()) p._stripNotes();
                } catch(e) { Zotero.debug("[Weavero] strip-notes err: " + e); }
                p._applySurfacePref("notes");
                // Editor bare-URL decoration: flip the enable flag +
                // re-decorate in every open editor so it clears/returns
                // live (no reload) -- closes the toggle-off residue.
                try { p._refreshNoteLinkifyRegex(); }
                catch(e) { Zotero.debug("[Weavero] note linkify toggle err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableNotesPane"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableNotesPane") {
                // Context-notes pane (note-row titles/bodies + notes-box).
                try {
                    if (!p._getEnableNotesPane()) p._stripNotes();
                } catch(e) { Zotero.debug("[Weavero] strip-notes-pane err: " + e); }
                p._applySurfacePref("notes");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableNotesList"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableNotesList") {
                // Note-item titles in the items list.
                try {
                    if (!p._getEnableNotesList()) {
                        for (const w of (Zotero.getMainWindows() || [])) {
                            try { p._stripItemsList(w.document); } catch (e2) {}
                        }
                    }
                } catch(e) { Zotero.debug("[Weavero] strip-notes-list err: " + e); }
                try { p._markCellLinks(); } catch(e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableReaderSidebar"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableReaderSidebar") {
                p._applySurfacePref("readerSidebar");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableReaderView"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableReaderView") {
                p._applySurfacePref("readerView");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableReaderViewIcons"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableReaderViewIcons") {
                p._applySurfacePref("readerView");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.compactTitleBar", "extensions.zotero.weavero.compactTitleBarMain", "extensions.zotero.weavero.compactTitleBarReader", "extensions.zotero.weavero.compactTitleBarNote", "extensions.zotero.weavero.compactTitleBarPluginsManager", "extensions.zotero.weavero.enableTabsAndWindows"],
        run(p: any, data: string) {
            // Hide title bar (Firefox-style) — master + the two child
            // scopes. Any of them changing re-evaluates BOTH window
            // types so the change shows without a restart:
            //  • main windows  → _getCompactTitleBarMain()
            //  • reader windows → _ensureReaderWindowTabStrip (self-gates
            //    on _getCompactTitleBarReader(); does the strip + menu
            //    hide, or tears both down).
            if (data === "extensions.zotero.weavero.compactTitleBar"
                    || data === "extensions.zotero.weavero.compactTitleBarMain"
                    || data === "extensions.zotero.weavero.compactTitleBarReader"
                    || data === "extensions.zotero.weavero.compactTitleBarNote"
                    || data === "extensions.zotero.weavero.compactTitleBarPluginsManager"
                    || data === "extensions.zotero.weavero.enableTabsAndWindows") {
                // An open Plugins Manager follows at once (issue #50).
                try { p._wvPMReapplyChrome(); } catch (e) {}
                try {
                    // Reader-strip ON↔OFF transition: extra reader-window
                    // tabs only exist under the strip, so losing it would
                    // hide them. Mirror the plugin disable→enable round-trip:
                    // ON→OFF rescues the extras into main-window tabs (and
                    // writes the hand-off file) BEFORE the strip teardown
                    // below; OFF→ON pulls them back into reader windows.
                    try {
                        const stripOn = p._getCompactTitleBarReader();
                        const prev = p._wvPrevReaderStripOn;
                        p._wvPrevReaderStripOn = stripOn;
                        if (prev === true && !stripOn) {
                            try { p._wvDisableMigrateReaderTabs(); } catch (e) {}
                        } else if (prev === false && stripOn) {
                            try { p._wvEnablePullBackReaderTabs(); } catch (e) {}
                        }
                    } catch (e) {}
                    const onMain = p._getCompactTitleBarMain();
                    const wins = wvMainWins();
                    for (const w of wins) {
                        if (onMain) p._applyCompactTitleBar(w);
                        else p._revertCompactTitleBar(w);
                    }
                    // Reader windows: the wiring table's pref path --
                    // strip, Edit > Undo (the strip's teardown unwires
                    // it), and the Move to Tab button (only useful with
                    // the native title bar: removed when the strip
                    // turns on, re-added when it turns off).
                    for (const t of p._wvReaderWindowTargets()) p._wvWireReaderWindow(t.win, t.r, "pref");
                    // Standalone note windows.
                    try {
                        const en = (Services as any).wm.getEnumerator(null);
                        while (en.hasMoreElements()) {
                            const w: any = en.getNext();
                            if (!w || !w.document || !w.document.documentElement) continue;
                            if (wvWinType(w) !== "zotero:note") continue;
                            try { p._ensureNoteWindowTabStrip(w); } catch (e) {}
                        }
                    } catch (e) {}
                } catch (e) { Zotero.debug("[Weavero] compactTitleBar toggle err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableTabGroups", "extensions.zotero.weavero.enableTabsAndWindows"],
        run(p: any, data: string) {
            // Tab groups — re-apply (self-gates; strips when off).
            if (data === "extensions.zotero.weavero.enableTabGroups"
                    || data === "extensions.zotero.weavero.enableTabsAndWindows") {
                try {
                    for (const w of Zotero.getMainWindows()) p._applyTabGroups(w);
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.windowIcons", "extensions.zotero.weavero.separateTaskbarButtons", "extensions.zotero.weavero.enableTabsAndWindows"],
        run(p: any, data: string) {
            // Window identity -- per-window icons, taskbar overlay
            // badges, taskbar identities and title glyphs. `windowIcons`
            // had no live watcher at all and the section master refreshed
            // none of these, so the Settings checkbox needed a restart
            // and icons / badges stayed up after the master went off
            // (survey 2026-10-06). Each refresher self-gates on its pref;
            // the forceOff / clear flag covers the master going off.
            if (data === "extensions.zotero.weavero.windowIcons"
                    || data === "extensions.zotero.weavero.separateTaskbarButtons"
                    || data === "extensions.zotero.weavero.enableTabsAndWindows") {
                try {
                    const off = !p._getTabsAndWindowsMaster();
                    try { p._wvRefreshWindowIcons(off); } catch (e) {}
                    try { p._wvRefreshTaskbarOverlays(off); } catch (e) {}
                    try { p._wvRefreshWindowTaskbarIdentities(); } catch (e) {}
                    try { p._wvRefreshTitleGlyphs(off); } catch (e) {}
                } catch (e) { Zotero.debug("[Weavero] window-identity toggle err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.readerItemPane", "extensions.zotero.weavero.enableTabsAndWindows"],
        run(p: any, data: string) {
            // Reader item pane (Tabs and Windows section) — apply to the
            // open standalone reader windows immediately: the ensure
            // function self-gates on the pref (and the section master),
            // creating the pane when on and tearing it down when off.
            if (data === "extensions.zotero.weavero.readerItemPane"
                    || data === "extensions.zotero.weavero.enableTabsAndWindows") {
                try {
                    for (const t of p._wvReaderWindowTargets()) {
                        try { p._ensureReaderWindowItemPane(t.r); } catch (e) {}
                    }
                } catch (e) { Zotero.debug("[Weavero] readerItemPane toggle err: " + e); }
            }
        },
    },
    {
        // Extras too: the auto count is an Extras option (prefs.4).
        keys: ["extensions.zotero.weavero.enableTagsCountAuto", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            // Tags column auto-count toggle — (1) resize the
            // column to fit one or two numbers, (2) re-render
            // the items view so already-painted Tags cells pick
            // up the new pref. Without (2) the change only
            // shows after scrolling or selection moves.
            if (data === "extensions.zotero.weavero.enableTagsCountAuto"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const w = Zotero.getMainWindow();
                    const iv = w && w.ZoteroPane && w.ZoteroPane.itemsView;
                    // Adjust the live column width. Plugin column
                    // dataKeys are auto-prefixed with the plugin
                    // ID, so match on the `weaveroTags` suffix.
                    // onResize(..., true) also persists the new
                    // width so it survives a restart.
                    try {
                        const want = p._tagsColumnWidth();
                        const colMgr: any = iv && iv.tree && (iv.tree as any)._columns;
                        const arr: any[] = colMgr
                            ? (colMgr.getAsArray ? colMgr.getAsArray() : colMgr._columns)
                            : null;
                        const col = arr && arr.find((c: any) =>
                            c && typeof c.dataKey === "string"
                            && /(^|[-_])weaveroTags$/.test(c.dataKey));
                        if (col && colMgr) {
                            col.width = want;
                            col.minWidth = p._getEnableTagsCountAuto() ? 30 : 26;
                            if (typeof colMgr.onResize === "function") {
                                colMgr.onResize({ [col.dataKey]: want }, true);
                            }
                        }
                    } catch(e) {
                        Zotero.debug("[Weavero] tags-col width err: " + e);
                    }
                    if (iv && iv.tree && iv.tree.invalidate) {
                        iv.tree.invalidate();
                    }
                } catch(e) {
                    Zotero.debug("[Weavero] tags-pref invalidate err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableAnnotationAddedBy", "extensions.zotero.weavero.enableAddedByColors"],
        run(p: any, data: string) {
            // Added By prefs — invalidate so annotation-row badges
            // and addedBy-column tints rebuild with the new state.
            if (data === "extensions.zotero.weavero.enableAnnotationAddedBy"
                || data === "extensions.zotero.weavero.enableAddedByColors") {
                try {
                    const w = Zotero.getMainWindow();
                    const iv = w && w.ZoteroPane && w.ZoteroPane.itemsView;
                    if (iv && iv.tree && iv.tree.invalidate) {
                        iv.tree.invalidate();
                    }
                    // The badge gating is in renderRow, the tint
                    // is in `_paintAddedByCells` (called from
                    // `_markCellLinks`). Invalidation triggers
                    // both.
                    try { p._markCellLinks(); } catch(e) {}
                } catch(e) {
                    Zotero.debug("[Weavero] addedBy-pref invalidate err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableInlineUrls", "extensions.zotero.weavero.enableCommentMarkdown", "extensions.zotero.weavero.enableAppLinks"],
        run(p: any, data: string) {
            // Content-type sub-prefs — Inline mode (enableInlineUrls /
            // enableCommentMarkdown) and Icon & Popup mode (enableIcon*).
            // Toggling any of these changes how comments render or
            // whether the chain icon attaches on every surface, so
            // rescan all four. The comment-md pref also drives
            // :root.wv-md-disabled (gates M-icon visibility in the
            // items list).
            //
            // Strip the right-pane and reader-sidebar spans /
            // previews BEFORE re-scanning so any stale state
            // (e.g. URL spans from a previous "URLs on" render)
            // is cleared. The re-scan then rebuilds whatever the
            // new prefs call for. Without this, URL-only comments
            // retain their old spans because the early-return
            // case in _renderPaneCommentInline can't safely strip
            // (running on every observer fire risks an infinite
            // loop during sidebar tear-down).
            if (data === "extensions.zotero.weavero.enableInlineUrls"
                || data === "extensions.zotero.weavero.enableCommentMarkdown"
                || data === "extensions.zotero.weavero.enableAppLinks") {
                try { p._stripRightPane(); } catch(e) {}
                for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                    try {
                        const iwin = reader._iframeWindow
                            || (reader._iframe && reader._iframe.contentWindow);
                        const idoc = iwin && iwin.document;
                        if (idoc) p._stripReaderSidebar(idoc);
                    } catch(e) {}
                }
                p._applySurfacePref("itemsList");
                p._applySurfacePref("rightPane");
                p._applySurfacePref("readerSidebar");
                p._applySurfacePref("readerView");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableAppLinksSkipConfirm"],
        run(p: any, data: string) {
            // Skip-confirm toggle — sync warn-external prefs.
            if (data === "extensions.zotero.weavero.enableAppLinksSkipConfirm") {
                try { p._applyAppLinkConfirmPref(); }
                catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableLinksAndRelations"],
        run(p: any, data: string) {
            const winRA = Zotero.getMainWindow();
            // Extra-scheme toggles — invalidate the cached
            // URL_REGEX / URL_SCHEME_ALT, then strip and rescan
            // every surface so newly-enabled schemes start
            // rendering and newly-disabled ones flatten back to
            // plain text. Same teardown sequence as the
            // inline-toggle branch above.
            // Also fires for the master `enableAppLinks` toggle
            // since flipping it changes which schemes the regex
            // includes.
            // ============================================================
            // v0.8.1 per-feature toggles (URI utilities, Relations,
            // Filters, Visual extras). When a toggle changes, run
            // the matching setup/teardown so the change takes
            // effect without restart.
            // Master toggles fall through to their children's
            // re-apply (same code path), so flipping a master
            // off cleans up everything its children installed.
            // ============================================================
            // Tab masters (v0.8.1-dev.3): when toggled, re-run
            // EVERY setup/teardown in the affected tab, since the
            // master cascades down to all sub-getters.
            if (data === "extensions.zotero.weavero.enableLinksAndRelations") {
                try {
                    p._setupItemsListContextMenu();
                    p._setupCollectionsContextMenu();
                    if (p._getEnableLibrariesHighlight() && winRA) {
                        p._setupLibrariesBoxHighlight(winRA);
                    } else if (winRA) {
                        p._teardownLibrariesBoxHighlight(winRA);
                    }
                    p._unregisterItemTreeColumns();
                    p._registerItemTreeColumns();
                    // Surfaces — re-apply each so the cascade
                    // takes effect (rebuild or strip).
                    p._applySurfacePref("itemsList");
                    p._applySurfacePref("rightPane");
                    p._applySurfacePref("readerSidebar");
                    p._applySurfacePref("readerView");
                    p._applySurfacePref("notes");
                    // The notes child strips its decoration when turned
                    // off; the MASTER went through _applySurfacePref,
                    // a no-op once the getters read false, and left the
                    // notes decorated (survey 2026-10-06).
                    if (!p._getEnableLinksAndRelations()) { try { p._stripNotes(); } catch (e) {} }
                    try { p._refreshNoteLinkifyRegex && p._refreshNoteLinkifyRegex(); } catch (e) {}
                    try { p._markCellLinks(); } catch (e) {}
                } catch (e) {
                    Zotero.debug("[Weavero] tab-1 master toggle err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            const winRA = Zotero.getMainWindow();
            if (data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    p._unregisterItemTreeColumns();
                    p._registerItemTreeColumns();
                    // Tabs-strip group-library glyph + per-row Added By tints
                    // — re-apply by re-running the tabs setup and the
                    // items-tree paint pass.
                    if (winRA) p._setupTabsMenuLibrarySort(winRA);
                    try {
                        const w = winRA;
                        const iv = w && w.ZoteroPane && w.ZoteroPane.itemsView;
                        if (iv && iv.tree && iv.tree.invalidate) {
                            iv.tree.invalidate();
                        }
                    } catch (e) {}
                    try { p._markCellLinks(); } catch (e) {}
                } catch (e) {
                    Zotero.debug("[Weavero] tab-3 master toggle err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableBookmarks", "extensions.zotero.weavero.enableLibraryBookmarks", "extensions.zotero.weavero.enableReaderBookmarks", "extensions.zotero.weavero.showLibraryBookmarksInReader", "extensions.zotero.weavero.autoHideEmptyLibraryBookmarks", "extensions.zotero.weavero.autoHideEmptyReaderBookmarks"],
        run(p: any, data: string) {
            // Bookmarks — master + the two sub-toggles + the
            // auto-hide-when-empty opt-in. Re-evaluate both
            // surfaces on every change since the master cascades.
            if (data === "extensions.zotero.weavero.enableBookmarks"
                || data === "extensions.zotero.weavero.enableLibraryBookmarks"
                || data === "extensions.zotero.weavero.enableReaderBookmarks"
                || data === "extensions.zotero.weavero.showLibraryBookmarksInReader"
                || data === "extensions.zotero.weavero.autoHideEmptyLibraryBookmarks"
                || data === "extensions.zotero.weavero.autoHideEmptyReaderBookmarks") {
                try {
                    // Library bookmarks: per-window toolbar button +
                    // collections-pane menu. Tear down everywhere
                    // and rebuild only when the effective gate is on
                    // — the setup early-returns when off, but we still
                    // need the explicit teardown so a flip-to-off
                    // strips the existing button.
                    const wantLib = p._getEnableLibraryBookmarks();
                    const wins = Zotero.getMainWindows
                        ? Zotero.getMainWindows()
                        : [Zotero.getMainWindow()].filter(Boolean);
                    for (const w of wins) {
                        try { p._teardownBookmarksToolbarButton(w); } catch (e) {}
                        if (wantLib) {
                            try { p._setupBookmarksToolbarButton(w); } catch (e) {}
                        }
                    }
                    // Reader bookmarks: tab in the reader sidebar.
                    // Walk all open readers and either rebuild or
                    // strip the tab — `_wvProcessReaderPanels`'s
                    // gate stops new tabs from appearing in
                    // subsequent renders.
                    // Some prefs need only the inner panel rebuilt
                    // (scope buttons, list); others toggle the tab
                    // itself. Stripping the tab triggers a sidebar
                    // tab-switch back to Annotations (the active
                    // pane gets re-selected when the current one
                    // disappears), so for panel-internal prefs we
                    // remove ONLY the inner `view` element and
                    // re-run the ensure path — `_wvReaderEnsureBookmarksTab`
                    // rebuilds the view in place without touching
                    // the tab strip's active selection.
                    const panelInternalPref =
                        data === "extensions.zotero.weavero.showLibraryBookmarksInReader"
                        || data === "extensions.zotero.weavero.autoHideEmptyLibraryBookmarks"
                        || data === "extensions.zotero.weavero.autoHideEmptyReaderBookmarks";
                    const wantReader = p._getEnableReaderBookmarks();
                    for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                        try {
                            const iwin = r._iframeWindow
                                || (r._iframe && r._iframe.contentWindow);
                            const idoc = iwin && iwin.document;
                            if (!idoc) continue;
                            if (wantReader) {
                                if (panelInternalPref) {
                                    // Surgical: drop the inner view
                                    // so the next ensure() rebuilds
                                    // it (with the new scope-button
                                    // visibility) — tab stays active.
                                    try {
                                        const view = idoc.querySelector(".wv-bm-reader-view");
                                        if (view && view.parentNode) view.parentNode.removeChild(view);
                                    } catch (_) {}
                                    p._wvReaderEnsureBookmarksTab(r, idoc);
                                } else {
                                    // Master toggle / enable-reader: full
                                    // teardown + rebuild (will switch
                                    // away from the tab, which is the
                                    // expected behaviour when the tab
                                    // is being disabled and re-enabled).
                                    try { p._wvRemoveReaderBookmarksTab(r, idoc); } catch (_) {}
                                    p._wvReaderEnsureBookmarksTab(r, idoc);
                                }
                            } else {
                                p._wvRemoveReaderBookmarksTab(r, idoc);
                            }
                        } catch (e) {}
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] bookmarks toggle err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableUriUtilities", "extensions.zotero.weavero.enableCopyItemLink", "extensions.zotero.weavero.enableAddRelatedMenu", "extensions.zotero.weavero.enableRelations", "extensions.zotero.weavero.enableOpenExternalViewer"],
        run(p: any, data: string) {
            // URI utilities — re-bind the items-list / collections
            // context menus. The popupshowing handler already
            // re-evaluates the gates each time, so a re-bind also
            // re-checks whether to install the listener at all.
            // The Open in External Viewer gate is evaluated inside
            // the same popupshowing handler, so its toggle is
            // covered by re-binding too.
            if (data === "extensions.zotero.weavero.enableUriUtilities"
                || data === "extensions.zotero.weavero.enableCopyItemLink"
                || data === "extensions.zotero.weavero.enableAddRelatedMenu"
                || data === "extensions.zotero.weavero.enableRelations"
                || data === "extensions.zotero.weavero.enableOpenExternalViewer") {
                try { p._setupItemsListContextMenu(); }
                catch (e) { Zotero.debug("[Weavero] re-bind itemmenu err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableUriUtilities", "extensions.zotero.weavero.enableCopyCollectionLink"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableUriUtilities"
                || data === "extensions.zotero.weavero.enableCopyCollectionLink") {
                try { p._setupCollectionsContextMenu(); }
                catch (e) { Zotero.debug("[Weavero] re-bind colmenu err: " + e); }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enablePluginsSearch", "extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            // Plugins Manager search box — live attach/detach.
            if (data === "extensions.zotero.weavero.enablePluginsSearch"
                || data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    if (p._getEnablePluginsSearch()) p._registerPluginsSearch();
                    else p._teardownPluginsSearch();
                } catch (e) {}
            }
            // Settings search-box alignment -- the master alone, live on open windows.
            if (data === "extensions.zotero.weavero.enableVisualExtras") {
                try {
                    const on = p._getEnableVisualExtras();
                    p._wvPrefsWindows((w: any) => { if (on) p._wvPrefsAlignSearch(w); else p._wvPrefsUnalignSearch(w); });
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableChainBadge", "extensions.zotero.weavero.enableRelations"],
        run(p: any, data: string) {
            // Relations — chain badge + libraries highlight + columns.
            if (data === "extensions.zotero.weavero.enableChainBadge"
                || data === "extensions.zotero.weavero.enableRelations") {
                try { p._markCellLinks(); } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableLibrariesHighlight", "extensions.zotero.weavero.enableRelations"],
        run(p: any, data: string) {
            const winRA = Zotero.getMainWindow();
            if (data === "extensions.zotero.weavero.enableLibrariesHighlight"
                || data === "extensions.zotero.weavero.enableRelations") {
                try {
                    if (p._getEnableLibrariesHighlight()) {
                        if (winRA) p._setupLibrariesBoxHighlight(winRA);
                    } else {
                        if (winRA) p._teardownLibrariesBoxHighlight(winRA);
                    }
                } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableAnnotationsCountColumn", "extensions.zotero.weavero.enableRelatedColumn", "extensions.zotero.weavero.enableRelations"],
        run(p: any, data: string) {
            // Items-tree column toggles (Annotations / Related):
            // unregister all and re-register with the new gates.
            if (data === "extensions.zotero.weavero.enableAnnotationsCountColumn"
                || data === "extensions.zotero.weavero.enableRelatedColumn"
                || data === "extensions.zotero.weavero.enableRelations") {
                try {
                    p._unregisterItemTreeColumns();
                    p._registerItemTreeColumns();
                } catch (e) {
                    Zotero.debug("[Weavero] re-register cols err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableOpenRelatedSubmenu", "extensions.zotero.weavero.enableRelations"],
        run(p: any, data: string) {
            // Open Related Item submenu — already-bound rows keep
            // their old handler; new rows pick up the new gate at
            // re-render time. Force a re-scan so existing rows
            // re-wire (the wired flag is on the row dataset, so
            // we'd need to clear it for true re-binding).
            // For now, just log; effect appears on next row paint.
            if (data === "extensions.zotero.weavero.enableOpenRelatedSubmenu"
                || data === "extensions.zotero.weavero.enableRelations") {
                p._dbg("[Weavero] OpenRelatedSubmenu toggle "
                    + "applies to newly-rendered rows.");
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableItemsTreeFilter", "extensions.zotero.weavero.enableReadStatusFilter", "extensions.zotero.weavero.enableFilters"],
        run(p: any, data: string) {
            // Filters — items-tree filter pane + Selection Target
            // + tabs-menu sub-filters.
            // Read Status: a selection is DORMANT while its option is
            // off (filter-facets.ts) -- re-apply so it stops / starts
            // filtering at once.
            if (data === "extensions.zotero.weavero.enableItemsTreeFilter"
                || data === "extensions.zotero.weavero.enableReadStatusFilter"
                || data === "extensions.zotero.weavero.enableFilters") {
                try {
                    if (p._getEnableItemsTreeFilter()) {
                        for (const w of (Zotero.getMainWindows() || [])) {
                            try { p._setupItemsListFilter(w); } catch (e) {}
                        }
                    } else {
                        p._teardownItemsListFilter();
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] filter pane toggle err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableSelectionTarget", "extensions.zotero.weavero.enableFilters"],
        run(p: any, data: string) {
            if (data === "extensions.zotero.weavero.enableSelectionTarget"
                || data === "extensions.zotero.weavero.enableFilters") {
                for (const w of (Zotero.getMainWindows() || [])) {
                    try { p._applySelectionTargetVisuals(w); } catch (e) {}
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableTabsLibraryFilter", "extensions.zotero.weavero.enableTabsFileTypeFilter", "extensions.zotero.weavero.enableFilters"],
        run(p: any, data: string) {
            const winRA = Zotero.getMainWindow();
            if (data === "extensions.zotero.weavero.enableTabsLibraryFilter"
                || data === "extensions.zotero.weavero.enableTabsFileTypeFilter"
                || data === "extensions.zotero.weavero.enableFilters") {
                try {
                    // Tear down first so flipping a gate from on -> off
                    // strips the existing tabs-menu chrome (file-type
                    // button, library sort patch, wider-panel class).
                    // Setup then re-adds whatever is still enabled.
                    if (winRA) {
                        p._teardownTabsMenuLibrarySort(winRA);
                        p._setupTabsMenuLibrarySort(winRA);
                    }
                } catch (e) {
                    Zotero.debug("[Weavero] tabs filter toggle err: " + e);
                }
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.windowTitleGlyphs", "extensions.zotero.weavero.windowTitleNameMode"],
        run(p: any, data: string) {
            // OS window titles: glyph toggle + name-in-title mode
            // both re-compose every open window's title live.
            if (data === "extensions.zotero.weavero.windowTitleGlyphs"
                || data === "extensions.zotero.weavero.windowTitleNameMode") {
                try { p._wvRefreshTitleGlyphs(); } catch (e) {}
            }
        },
    },
    {
        keys: ["extensions.zotero.weavero.enableGroupLibraryGlyph"],
        run(p: any, data: string) {
            const winRA = Zotero.getMainWindow();
            // Visual extras — group-library glyph (re-setup the
            // tab-bar decoration which the gate inside
            // _setupTabsMenuLibrarySort short-circuits when off).
            if (data === "extensions.zotero.weavero.enableGroupLibraryGlyph") {
                try {
                    if (winRA) p._setupTabsMenuLibrarySort(winRA);
                } catch (e) {}
            }
        },
    },
    {
        keys: null,
        run(p: any, data: string) {
            if (/^extensions\.zotero\.weavero\.enable\w+Scheme$/.test(data)
                || data === "extensions.zotero.weavero.enableAppLinks"
                || data === "extensions.zotero.weavero.enableZoteroLinks"
                || data === "extensions.zotero.weavero.enableInlineUrls") {
                // Re-apply warn-external prefs too, since the
                // set of "enabled schemes that should skip
                // confirmation" depends on this pref.
                try { p._applyAppLinkConfirmPref(); }
                catch(e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
                // Refresh note-editor stylesheets too — the
                // app-link colour rules depend on enabled schemes.
                try { p._refreshAllNoteEditorStyles(); }
                catch(e) { Zotero.debug("[Weavero] note-css refresh err: " + e); }
                p._urlRegexCache     = null;
                p._urlSchemeAltCache = null;
                // Re-scope the note-editor bare-URL decoration to the
                // new toggle state (AFTER the cache reset so URL_REGEX
                // rebuilds first). Pushes the fresh source into each
                // open editor + forces a re-decorate.
                try { p._refreshNoteLinkifyRegex(); }
                catch(e) { Zotero.debug("[Weavero] note linkify refresh err: " + e); }
                // Hard-reset every items-tree comment cell so
                // the next _markCellLinks pass rebuilds from
                // scratch with the new URL_SCHEME_ALT.
                //
                // Two reasons cache invalidation isn't enough:
                // 1. data-wv-last-rebuild rate-limit: cells
                //    rebuilt within 300 ms hit the cache HIT
                //    path on the observer's re-paint and keep
                //    their stale wrap. (Reset the timestamp.)
                // 2. data-render-mode encodes only "url"/
                //    "md"/"url+md"/"plain" — NOT which
                //    schemes were active. Mixed-content cells
                //    (e.g. "see https://... and zotero://...")
                //    keep cachedMode="url" before AND after
                //    a Zotero-Links toggle, so cacheValid
                //    stays true and only the http span is
                //    re-rendered while the zotero one stays
                //    stale. (Force a full rebuild by
                //    flattening the cell here.)
                try {
                    const tdoc = Zotero.getMainWindow()?.document;
                    if (tdoc) {
                        for (const c of tdoc.querySelectorAll(
                                ".annotation-row.tight .cell.annotation-comment"
                                + "[data-has-rich]") as any) {
                            const stash = c.getAttribute("data-comment-text")
                                || (c.textContent || "")
                                    .replace(/[\s ]*🔗\s*$/, "").trim();
                            c.textContent = stash;
                            c.setAttribute("data-comment-text", stash);
                            c.removeAttribute("data-wv-last-rebuild");
                            c.removeAttribute("data-has-rich");
                            c.removeAttribute("data-icon-wanted");
                            c.removeAttribute("data-has-url");
                            c.removeAttribute("data-truncated");
                        }
                        // Note / text annotation rows: text lives in
                        // `.annotation-row .cell-text` and goes
                        // through `_markTextLinks(.., {mode:"tree"})`.
                        // Strip its cache attrs so the next pass
                        // rebuilds with the new URL_SCHEME_ALT.
                        for (const s of tdoc.querySelectorAll(
                                ".annotation-row .cell-text"
                                + "[data-wv-source]") as any) {
                            s.removeAttribute("data-wv-source");
                            s.removeAttribute("data-wv-rendered");
                            s.removeAttribute("data-wv-last-rebuild");
                        }
                    }
                } catch (e) {}
                try { p._stripRightPane(); } catch(e) {}
                for (const reader of (Zotero.Reader && Zotero.Reader._readers) || []) {
                    try {
                        const iwin = reader._iframeWindow
                            || (reader._iframe && reader._iframe.contentWindow);
                        const idoc = iwin && iwin.document;
                        if (idoc) p._stripReaderSidebar(idoc);
                    } catch(e) {}
                }
                p._applySurfacePref("itemsList");
                p._applySurfacePref("rightPane");
                p._applySurfacePref("readerSidebar");
                p._applySurfacePref("readerView");
            }
        },
    },
    // The reader's Extras options (prefs.4, MJT 2026-10-17: a box's section
    // master is its feature's master): the outline's page numbers and text
    // size, and the toolbar undo arrows, follow Extras in every open reader
    // at once (each has its own watch for its own pref).
    {
        keys: ["extensions.zotero.weavero.enableVisualExtras"],
        run(p: any, data: string) {
            for (const r of (Zotero.Reader && Zotero.Reader._readers) || []) {
                try {
                    const idoc = r._iframeWindow && r._iframeWindow.document;
                    if (!idoc) continue;
                    try { p._wvApplyOutlineTextScale(idoc, r); } catch (e) {}
                    try {
                        const sc = idoc.getElementById("sidebarContainer");
                        if (sc && sc.classList.contains("wv-outline-tab-on")) p._wvReaderRenderOutline(r, idoc);
                    } catch (e) {}
                    try { p._wvReaderEnsureUndoButtons(r, idoc); } catch (e) {}
                } catch (e) {}
            }
        },
    },
    // Firefox's app-link prompt settings follow Links & Relations too: the
    // skip-confirm option is greyed with it (prefs.4, MJT 2026-10-17).
    {
        keys: ["extensions.zotero.weavero.enableLinksAndRelations"],
        run(p: any, data: string) {
            try { p._applyAppLinkConfirmPref(); }
            catch (e) { Zotero.debug("[Weavero] confirm sync err: " + e); }
        },
    },
];
