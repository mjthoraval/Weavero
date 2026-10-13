/* global describe, it, before, assert, Zotero, Services, IOUtils */

// Per-main-window wiring (survey 2026-10-06 §3.2, step 7: the wiring table,
// src/modules/window-wiring.ts). A second main window is opened and
// everything Weavero leaves on it is recorded (wvT.wiringSnapshot: its own
// `_wv*` expandos, those of its Zotero objects and key elements with their
// wrap layers, its `wv-` ids, root classes and attributes). The FIRST window
// is recorded as the root hook found it before any spec ran (wvT.mainAtStart:
// later specs' popups and clicks leave marks of their own), plus what changes
// on it while the second window is open and after it closes. After the
// close, every reference the PLUGIN still holds to the second window (or its
// document / its elements) is listed.
//
// Two checks on one recording:
//   - PARITY: the second window gets every mark the first one had at start,
//     except the few that are legitimately the first window's alone
//     (NOT_ON_SECOND). Guard for the 2026-10-09 fix: onMainWindowLoad ran
//     before ZoteroPane had created the new window's views, so the view
//     wraps skipped it.
//   - CHARACTERIZATION: WIRING_EXPECTED, recorded in the test runner on the
//     code BEFORE the wiring table (0.21.9-wiring.1), reproduced exactly by
//     the table (wiring.2); re-recorded when the first window started
//     keeping focus, with the filter's target-window fix, and again when
//     the snapshot started leaving out runtime state (bg-restore shepherd,
//     taskbar-overlay residency: see wvT.wiringSnapshot), and when the
//     title shadow started following its options on open too (no glyphs and
//     no window-name mode: not wired; wiring slice 2, 2026-10-12), and when
//     listener stamps became keyed listeners (`listen <key>` entries in
//     place of the `_wv*Wired` / `*Ver` stamps; wiring slice 3, 2026-10-13;
//     `boot:` keys and the bg-restore choice are runtime state). Set
//     WV_WIRING_RECORD=<path> to dump a new recording instead of comparing.
//     A deliberate change edits the affected lines here, in the same commit,
//     with the reason.

describe("Weavero — per-main-window wiring, characterized", function () {
    this.timeout(90000);
    let wv, win;
    let timerWin = null;
    const sleep = (ms) => new Promise(r => (timerWin || (timerWin = Zotero.getMainWindow())).setTimeout(r, ms));
    const snapshot = (w) => wvT.wiringSnapshot(w);

    /** Per host: marks added / removed between two snapshots. */
    const delta = (a, b) => {
        const out = {};
        for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
            const sa = new Set(a[k] || []), sb = new Set(b[k] || []);
            const added = [...sb].filter(x => !sa.has(x)).sort();
            const removed = [...sa].filter(x => !sb.has(x)).sort();
            if (added.length || removed.length) out[k] = { added, removed };
        }
        return out;
    };

    /** Paths from the plugin to `w`, its document, or nodes of that document
     *  (two levels deep: own props, then entries of arrays / Maps / Sets /
     *  plain objects). */
    function refsTo(w, doc) {
        const hit = (v) => {
            try {
                if (!v || (typeof v !== "object" && typeof v !== "function")) return false;
                if (v === w || v === doc) return true;
                return v.ownerDocument === doc;
            } catch (e) { return false; }
        };
        const paths = new Set();
        const scan = (v, path, depth) => {
            if (hit(v)) { paths.add(path); return; }
            if (depth >= 2 || !v || typeof v !== "object") return;
            try {
                if (v instanceof Map || (v.constructor && v.constructor.name === "Map")) {
                    let i = 0;
                    for (const [k, x] of v) { if (hit(k)) paths.add(path + "{key}"); scan(x, path + "{}", depth + 1); if (++i > 200) break; }
                } else if (Array.isArray(v) || (v.constructor && v.constructor.name === "Set")) {
                    let i = 0;
                    for (const x of v) { scan(x, path + "[]", depth + 1); if (++i > 200) break; }
                } else if (Object.getPrototypeOf(v) === Object.prototype) {
                    for (const k of Object.keys(v).slice(0, 200)) scan(v[k], path + "." + k, depth + 1);
                }
            } catch (e) {}
        };
        // Runtime state, not wiring: the startup background-restore records
        // a window opened during its hold as the user's choice (a targeted
        // run opens the second window inside the hold; the full suite does
        // not), and keeps it until the next restore cycle.
        const RUNTIME = new Set(["_wvBgUserChosenWin"]);
        for (const k of Object.getOwnPropertyNames(wv)) {
            if (RUNTIME.has(k)) continue;
            let v;
            try { v = wv[k]; } catch (e) { continue; }
            if (typeof v === "function") continue;
            scan(v, k, 0);
        }
        return [...paths].sort();
    }

    // Marks only the FIRST window carries, by design.
    const NOT_ON_SECOND = {
        // Installed by the first filter apply; the test library's second
        // window has no rows to apply to within the wait.
        itemsView: ["_wvCacheStateWired", "_wvSelChangeWired", "_wvOrigResetColumns", "_wvResetColumnsWrapVer"],
        rowProvider: ["_wvNotifyForFilterPatched", "_wvOrigNotifyForFilter",
            "_wvOrigRefreshForChevronCompute", "_wvRefreshChevronComputePatched"],
        window: ["_wvLastLibraryID:number"],
        rootClasses: ["wv-anchor-window"],
    };

    let got = null;
    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        const lib = wvT.lib();
        if (!lib || typeof lib.wvWrapLayers !== "function") wvT.absent("Zotero.Weavero.lib.wvWrapLayers");
        wvT.method("_wvOpenEmptyMainWindow");
        if (!wvT.mainAtStart) wvT.absent("wvT.mainAtStart (the root hook's snapshot)");
        win = Zotero.getMainWindow();
        timerWin = win;

        got = { mainAtStart: wvT.mainAtStart };
        // A reader window an earlier spec closed late changes this window's
        // identity marks mid-recording (checkpoint c7, 2026-10-13).
        await wvT.settleSecondaryWindows();
        const mainBefore = snapshot(win);
        const existing = new Set(Zotero.getMainWindows());
        wv._wvOpenEmptyMainWindow();
        let w2 = null;
        for (let i = 0; i < 100 && !w2; i++) { await sleep(150); w2 = Zotero.getMainWindows().find(w => !existing.has(w)); }
        assert.isOk(w2, "second window opened");
        // The FIRST window keeps focus while the second wires itself: code
        // that patches `Zotero.getMainWindow()` (the focused window) instead
        // of the window it is wiring then misses the second one every time.
        // Whether the new window had focus used to depend on the run (alone:
        // yes; full suite: no).
        try { win.focus(); } catch (_) {}
        try {
            // Wired, and past the deferred passes (2 s, 3 s, 5 s, 10 s, 15 s).
            for (let i = 0; i < 120 && !(w2.ZoteroPane && w2.ZoteroPane.itemsView && w2._wvTreeDelegate); i++) await sleep(150);
            await sleep(16000);
            got.loaded = snapshot(w2);
            got.mainWhileOpen = delta(mainBefore, snapshot(win));
        }
        finally {
            try { win.focus(); } catch (_) {}
            await sleep(100);
            const doc2 = w2.document;
            try { w2.close(); } catch (_) {}
            for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await sleep(100);
            for (let i = 0; i < 30 && win.document.visibilityState !== "visible"; i++) {
                try { win.focus(); } catch (_) {}
                await sleep(100);
            }
            await sleep(1500);
            got.heldAfterClose = refsTo(w2, doc2);
        }
        got.mainAfterClose = delta(mainBefore, snapshot(win));
    });

    it("a second main window gets the per-window wiring the first one has", () => {
        assert.isOk(got && got.loaded && got.mainAtStart, "recorded");
        const missing = {};
        for (const [k, marks] of Object.entries(got.mainAtStart)) {
            const have = new Set(got.loaded[k] || []);
            const ok = new Set(NOT_ON_SECOND[k] || []);
            const m = marks.filter(x => !have.has(x) && !ok.has(x));
            if (m.length) missing[k] = m;
        }
        assert.deepEqual(missing, {});
    });

    it("matches the recording: wired on load, held after close", async () => {
        assert.isOk(got && got.mainAfterClose, "recorded");
        let rec = null;
        try { rec = Services.env.get("WV_WIRING_RECORD"); } catch (e) {}
        if (rec) {
            await IOUtils.writeUTF8(rec, JSON.stringify(got, null, 1));
            return;
        }
        // Platform- and theme-neutral (recorded on Windows, dark): wvT.wiringNormalize.
        assert.deepEqual(wvT.wiringNormalize(got), wvT.wiringNormalize(WIRING_EXPECTED));
    });
});

const WIRING_EXPECTED = {
    mainAtStart: {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCollAids:object",
            "_wvCollPaneObs:object", "_wvCompactTitleBar:object", "_wvFilterBar:object",
            "_wvFilterState:object", "_wvFilterTbBtn:object", "_wvFilterTreeObserver:object", "_wvHid:object",
            "_wvHidMO:object", "_wvItemDropOff:function", "_wvLastLibraryID:number",
            "_wvLibrariesBoxMo:object", "_wvMainNewTabKeyH:function", "_wvOvActivateHandler:function",
            "_wvOvBirthMon:string", "_wvOvFollowWired:number", "_wvOvMoveHandler:function",
            "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPaneObs:object",
            "_wvRedoKeyH:function", "_wvStrayObs:object", "_wvStrayObsVer:number", "_wvTabBarDecoMo:object",
            "_wvTabExtRepositioner:object", "_wvTabGroupWinDnDOff:function", "_wvTabMultiSelOff:function",
            "_wvThemeMQ:object", "_wvTreeDelegate:object", "listen newWindowKey", "listen ovFollow:unload",
            "listen reopenClosedKey", "listen tabGroupDnD:escKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen xwinDrop:dragover", "listen xwinDrop:drop",
        ],
        ZoteroPane: [
            "_wvLoadURIWired", "_wvOrigCopySelectedToClipboard", "_wvOrigLoadURI",
            "_wvOrigToggleAdvancedSearchState", "_wvOrigViewItems", "_wvQuickCopyWired",
            "_wvViewItemsWrapped",
        ],
        Zotero_Tabs: [
            "wrap close:trace+lastView", "wrap getState:normalize", "wrap markAsLoaded:trace",
            "wrap restoreState:trace", "wrap select:trace",
        ],
        itemsView: [
            "_wvCacheStateWired", "_wvCollChangeWrapped", "_wvIsSelectableOrig", "_wvOrigResetColumns",
            "_wvResetColumnsWrapVer", "_wvSelChangeWired", "_wvSetFilterWrapped",
            "wrap selectItems:filterParity",
        ],
        rowProvider: [
            "_wvExpandMatchParentsPatched", "_wvNotifyForFilterPatched", "_wvOrigNotifyForFilter",
            "_wvOrigRefreshForChevronCompute", "_wvRefreshChevronComputePatched",
            "wrap toggleOpenState:userOpenTracking",
        ],
        collectionsView: [
            "_wvOrigNotifyForSelectGuard",
        ],
        itemPane: [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
        ],
        document: [
            "_wvAdvSearchCtxHandler", "_wvAdvSearchKeyHandler", "_wvAdvSearchMidHandler",
            "_wvAdvSearchWinHandler", "_wvAdvSearchWinWire", "_wvCollSearchKeyHandler", "_wvCollSearchUnwire",
            "_wvCollSearchWired", "_wvCollTreeGestures", "_wvCollTreeUnwire", "_wvCollTreeWired",
            "_wvMenuGhostFix", "_wvMenuGhostUnwire", "_wvReaderFindKeyHandler", "_wvReaderFindRoute",
            "_wvReaderFindUnwire", "listen colPickMark:popupshowing", "listen filterPanel:keys",
            "listen xwinDrop:dragstart",
        ],
        documentElement: [],
        "#zotero-itemmenu": [
            "_wvDefChildMenuHandlers", "_wvDefChildMenuWired",
        ],
        "#zotero-collectionmenu": [
            "_wvHidH",
        ],
        "#zotero-tabs-menu-panel": [
            "_wvLibrarySortInstalled", "_wvOrigRefreshList", "listen tabsMenu:fitHeight",
        ],
        "#item-tree-main-default": [
            "listen urlTitle:mouseover",
        ],
        "#tab-bar-container": [
            "_wvTabGroupDnDOff", "listen itemDrop:dragleave", "listen itemDrop:dragover",
            "listen itemDrop:drop", "listen tabBarDrag:dragend", "listen tabBarDrag:dragend2",
            "listen tabBarDrag:dragleave", "listen tabBarDrag:dragover", "listen tabBarDrag:dragstart",
            "listen tabBarDrag:drop", "listen tabGroupDnD:dragend", "listen tabGroupDnD:dragleave",
            "listen tabGroupDnD:dragover", "listen tabGroupDnD:dragstart", "listen tabGroupDnD:drop",
            "listen tabMultiSel:click", "listen tabMultiSel:mousedown",
        ],
        "#zotero-item-pane": [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
        ],
        "#zotero-context-pane": [
            "_wvCtxNoteWatchBy", "_wvCtxNoteWatchOff",
        ],
        "#zotero-tb-search": [
            "listen qsScope:command", "listen qsScope:input",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen hamburgerPromo:menu_EditPreferencesItem:hidden",
            "listen hamburgerPromo:menu_EditPreferencesItem:showing",
        ],
        "#menu_FilePopup": [
            "listen hamburgerPromo:menu_fileQuitItemWin:hidden",
            "listen hamburgerPromo:menu_fileQuitItemWin:showing",
        ],
        ids: [
            "wv-anchor-indicator-style", "wv-bookmarks-toolbar-button", "wv-coll-aids-sheet",
            "wv-compact-titlebar-styles", "wv-early-compact-css", "wv-filter-bar", "wv-filter-popup",
            "wv-filter-tb-button", "wv-hamburger-popup", "wv-hid-sheet", "wv-pinned-tab-style",
            "wv-selected-tab-ring", "wv-tab-group-styles", "wv-tab-library-tooltip", "wv-tabs-menu-clear-btn",
            "wv-tabs-menu-filetype-btn", "wv-tabs-menu-settings-btn", "wv-tb-toggle-collections-pane",
            "wv-win-name-tooltip",
        ],
        rootClasses: [
            "wv-ui-dark",
        ],
        rootAttrs: [],
    },
    loaded: {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCollAids:object",
            "_wvCollPaneObs:object", "_wvCompactTitleBar:object", "_wvDevInitDone:boolean",
            "_wvFilterBar:object", "_wvFilterState:object", "_wvFilterTbBtn:object",
            "_wvFilterTreeObserver:object", "_wvHid:object", "_wvHidApplyTries:number", "_wvHidMO:object",
            "_wvItemDropOff:function", "_wvLibrariesBoxMo:object", "_wvMainNewTabKeyH:function",
            "_wvManagedWindow:boolean", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPaneObs:object", "_wvPrevWinIcons:object",
            "_wvRedoKeyH:function", "_wvStrayObs:object", "_wvStrayObsVer:number", "_wvTabBarDecoMo:object",
            "_wvTabExtRepositioner:object", "_wvTabGroupWinDnDOff:function", "_wvTabMultiSelOff:function",
            "_wvThemeMQ:object", "_wvTitleGlyphIdx:number", "_wvTreeDelegate:object", "_wvWinIconName:string",
            "_wvWindowId:number", "listen newWindowKey", "listen ovFollow:unload", "listen reopenClosedKey",
            "listen tabGroupDnD:escKey", "listen tabGroupWinDnD:dragover", "listen tabGroupWinDnD:drop",
            "listen xwinDrop:dragover", "listen xwinDrop:drop",
        ],
        ZoteroPane: [
            "_wvLoadURIWired", "_wvOrigCopySelectedToClipboard", "_wvOrigLoadURI",
            "_wvOrigToggleAdvancedSearchState", "_wvOrigViewItems", "_wvPanePersistIsolated",
            "_wvPanePersistKey", "_wvQuickCopyWired", "_wvViewItemsWrapped",
        ],
        Zotero_Tabs: [
            "_wvSidebarIsolated", "_wvSidebarKey", "wrap close:trace+lastView", "wrap getState:normalize",
            "wrap markAsLoaded:trace", "wrap restoreState:trace", "wrap select:trace",
        ],
        itemsView: [
            "_wvColIsolated", "_wvColKey", "_wvCollChangeWrapped", "_wvIsSelectableOrig",
            "_wvSetFilterWrapped", "wrap selectItems:filterParity",
        ],
        rowProvider: [
            "_wvExpandMatchParentsPatched", "wrap toggleOpenState:userOpenTracking",
        ],
        collectionsView: [
            "_wvOrigNotifyForSelectGuard",
        ],
        itemPane: [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
        ],
        document: [
            "_wvAdvSearchCtxHandler", "_wvAdvSearchKeyHandler", "_wvAdvSearchMidHandler",
            "_wvAdvSearchWinHandler", "_wvAdvSearchWinWire", "_wvCollSearchKeyHandler", "_wvCollSearchUnwire",
            "_wvCollSearchWired", "_wvCollTreeGestures", "_wvCollTreeUnwire", "_wvCollTreeWired",
            "_wvMenuGhostFix", "_wvMenuGhostUnwire", "_wvReaderFindKeyHandler", "_wvReaderFindRoute",
            "_wvReaderFindUnwire", "listen colPickMark:popupshowing", "listen filterPanel:keys",
            "listen xwinDrop:dragstart",
        ],
        documentElement: [],
        "#zotero-itemmenu": [
            "_wvDefChildMenuHandlers", "_wvDefChildMenuWired",
        ],
        "#zotero-collectionmenu": [
            "_wvHidH",
        ],
        "#zotero-tabs-menu-panel": [
            "_wvLibrarySortInstalled", "_wvOrigRefreshList", "listen tabsMenu:fitHeight",
        ],
        "#item-tree-main-default": [
            "listen urlTitle:mouseover",
        ],
        "#tab-bar-container": [
            "_wvTabGroupDnDOff", "listen itemDrop:dragleave", "listen itemDrop:dragover",
            "listen itemDrop:drop", "listen tabBarDrag:dragend", "listen tabBarDrag:dragend2",
            "listen tabBarDrag:dragleave", "listen tabBarDrag:dragover", "listen tabBarDrag:dragstart",
            "listen tabBarDrag:drop", "listen tabGroupDnD:dragend", "listen tabGroupDnD:dragleave",
            "listen tabGroupDnD:dragover", "listen tabGroupDnD:dragstart", "listen tabGroupDnD:drop",
            "listen tabMultiSel:click", "listen tabMultiSel:mousedown",
        ],
        "#zotero-item-pane": [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
        ],
        "#zotero-context-pane": [
            "_wvCtxNoteWatchBy", "_wvCtxNoteWatchOff",
        ],
        "#zotero-tb-search": [
            "listen qsScope:command", "listen qsScope:input",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen hamburgerPromo:menu_EditPreferencesItem:hidden",
            "listen hamburgerPromo:menu_EditPreferencesItem:showing",
        ],
        "#menu_FilePopup": [
            "listen hamburgerPromo:menu_fileQuitItemWin:hidden",
            "listen hamburgerPromo:menu_fileQuitItemWin:showing",
        ],
        ids: [
            "wv-anchor-indicator-style", "wv-bookmarks-toolbar-button", "wv-coll-aids-sheet",
            "wv-compact-titlebar-styles", "wv-early-compact-css", "wv-filter-bar", "wv-filter-popup",
            "wv-filter-tb-button", "wv-hamburger-popup", "wv-hid-sheet", "wv-pinned-tab-style",
            "wv-selected-tab-ring", "wv-tab-group-styles", "wv-tab-library-tooltip", "wv-tabs-menu-clear-btn",
            "wv-tabs-menu-filetype-btn", "wv-tabs-menu-settings-btn", "wv-tb-toggle-collections-pane",
            "wv-win-name-tooltip", "wv-window-badge-dot-style",
        ],
        rootClasses: [
            "wv-ui-dark",
        ],
        rootAttrs: [],
    },
    mainWhileOpen: {
        rootClasses: {
            added: [
                "wv-anchor-window",
            ],
            removed: [],
        },
    },
    heldAfterClose: [],
    mainAfterClose: {
    },
};
