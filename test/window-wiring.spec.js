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
//     `boot:` keys and the bg-restore choice are runtime state), and with
//     the pinned-tab id list every window publishes (`_wvPinnedTabIDs`,
//     0.22.2-dev.21) and the hidden-collections wrap of Zotero's collection
//     menu builder (`buildCollectionContextMenu:wv-hid`, dev.38) -- both
//     added without a re-record, red in the full suite until 2026-10-17 --
//     and with WV-TEMP-133039's stuck drop-row clear (`stuckDropRow`: the
//     tree mark and the items-view wrap since dev.53, the window's drag
//     listeners since dev.55; they go when the workaround retires), and with
//     WV-TEMP-134330's Tag Selector scope (`wrap setTagScope:tagScopeRows` on
//     ZoteroPane, dev.59; it goes when that workaround retires). And with the count
//     tooltip's hide-on-key / hide-on-blur (`countTip:keydown`, `countTip:blur`
//     on the window, 0.22.3-dev.31: Weavero's own tooltip on a cut count cell). And
//     with WV-TEMP-6023's scroll anchor (`_saveScrollPosition`,
//     `_restoreScrollPosition`, `notify` wrapped `scrollAnchor6023` on the items
//     view, 0.22.3-dev.43: zotero/zotero PR #6049 mirrored; they go when the
//     workaround retires). And with a second window's own open / collapsed
//     item-pane sections (`_wvPaneOpen` on the window, 0.22.3-dev.47: the
//     pinned section and the sections per main window). And with the pinned
//     section headers' stylesheet (`wv-sticky-heads-styles`, 0.22.3-dev.166;
//     its scroll listener sits on the item pane's scroller, not a recorded
//     host, and its per-section observers in a WeakMap). And with where a
//     window's colour came from (`_wvGlyphLazy` beside `_wvTitleGlyphIdx`,
//     1.0.1-dev.4: a colour drawn from the pool, which a window's saved colour
//     may take back on a Zotero with its own windows). And with the maximize
//     button's right-click (`maxSpan:contextmenu`, `maxSpan:rbup` on the window,
//     1.0.5-maxspan.1: maximize across monitors, max-span.ts). And with
//     WV-TEMP-132551's redraw of the item count after an expand or collapse
//     (`countRedraw` on the row provider's five toggles, outside the
//     manual-expand tracker; 1.2.1-countcard.1, upstream-fixes.ts). And with
//     WV-TEMP-134317's re-selection after View > Layout shows the Tag Selector
//     again (`wrap toggleTagSelector:tagReshow` on ZoteroPane, 1.2.1-queue2.1,
//     upstream-fixes.ts; it goes when that workaround retires). And with the
//     right-click on the item pane's Attachments / Notes rows (`defpane:
//     contextmenu` on the document, 1.2.1-defpane.1: the default attachment in
//     the item pane, attachments.ts; its Attachments-class layer sits on the
//     window's custom-element class, not a recorded host). And with the Locate
//     menu's first opening (`locateIcons:popupshown` on the window, 1.2.1-
//     security.1: a lost lookup-engine icon is downloaded then, never at
//     startup; pane.ts). And with the sheet of the section locked at the
//     bottom of the item pane (`wv-panelock-style`, 1.2.1-panelock.1,
//     pane-lock.ts; its observers, wraps and listeners sit on the item panes,
//     their sections and side navigations, none of them a recorded host). And
//     with WV-TEMP-114534's layer on the item pane's renderMessage (`wrap
//     renderMessage:feedSidenav` on itemPane and #zotero-item-pane, 1.2.1-
//     sidenavfeed.1, upstream-fixes.ts): it sits on the window's item-pane
//     class, and the pane shows it through the class's wrap table, which it
//     inherits; it goes when that workaround retires. And with the Group
//     Libraries line's fold (`wrap toggleOpenState:grpfold` on collectionsView,
//     `grpfold:down` / `grpfold:up` on #zotero-collections-tree, 1.2.1-grpfold.1,
//     group-fold.ts), with the collection select guard a layer of notify since
//     (`wrap notify:selectGuard` for `_wvOrigNotifyForSelectGuard`). And with the
//     Researchers mark in the Info section (`lazy:ppCmark:click` / `:mousedown` on the
//     document, `wv-pp-cmark-style`; 1.3.0-peoplenet) and the saved-search folders
//     trial (`srchfold` on collectionsView's toggleOpenState, `srchfold:ctx|down|up` on
//     #zotero-collections-tree, `srchfold:colmenu` on #zotero-collectionmenu,
//     `wv-sf-styles`; 1.3.0-paneorg, every main window since its tree adoption). And
//     with the Bookmarks pane above the collections tree (`wv-bmpane`, its splitter and
//     sheet, and the dropdown's sheet its tools use, `wv-bookmarks-style`; 1.3.0-bmpane,
//     bookmarks-pane.ts: on in pre-release builds; its state and watches sit in
//     WeakMaps and a window string set only off the defaults). And with the
//     Researchers button in the collections toolbar (`wv-pp-tb-button` and its
//     sheet `wv-pp-tb-style`, 1.3.0-rsbtn, people-toolbar.ts; its listeners sit on the
//     button itself), there only while the Researchers feature is on -- see
//     `researchersGate` below. And with the funnel above the collections pane
//     (`wv-cf-tb-button` and its panel `wv-cf-popup` in the collections toolbar, its
//     sheet `wv-cf-style`; 1.3.0-collfunnel, coll-funnel.ts, on in pre-release builds:
//     its row rule runs inside the hidden collections' `wv-hid` layers, no layer of its
//     own; its state is a window string set only off the default). Set
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
        // The first-apply marks (NOT_ON_SECOND) reach the SECOND window only
        // when its filter applies within the wait, i.e. when earlier specs
        // left rows in the library: absent in a targeted run, present deep in
        // the full suite (dev.50, 2026-10-17). The parity check above covers
        // them; the recording leaves them out of `loaded`.
        const firstApplyOff = (rec) => {
            const out = Object.assign({}, rec, { loaded: Object.assign({}, rec.loaded) });
            for (const [host, marks] of Object.entries(NOT_ON_SECOND)) {
                if (Array.isArray(out.loaded[host])) out.loaded[host] = out.loaded[host].filter(m => !marks.includes(m));
            }
            return out;
        };
        // Build-dependent marks, left out on both sides: WV-TEMP-133039's
        // mousemove / rows-change twin installs only where Zotero lacks its
        // own `_clearDropIndicator` (Zotero 10; gone on 11.0-beta.2+, found
        // by the first full run on beta.2, 2026-10-27). stuck-drop-row.spec.js
        // asserts their presence or absence per build. And expand-scroll.ts's
        // wrap of the items VIEW's toggleOpenState: only Zotero 10's twisty
        // calls the view's toggleOpenState, so the wrap is there on Zotero 10
        // alone (the recording is Zotero 11's; it failed on Zotero 10 even on
        // 1.3.0-peoplenet.14, 2026-11-26); expand-scroll.spec.js asserts the
        // wrap per entry point.
        const BUILD_DEPENDENT = /^(wrap handleRowModelUpdate:stuckDropRow|listen stuckDropRow:(items|collections)|wrap (_setDropRow|_clearDropIndicator):dragRing|wrap toggleOpenState:expandScroll)$/;
        // A host those marks emptied (`#zotero-collections-tree` carries only
        // the mousemove listener) goes too: a build without the mark has no
        // such host at all.
        const buildNeutral = (v) => {
            if (Array.isArray(v)) return v.filter(x => !(typeof x === "string" && BUILD_DEPENDENT.test(x))).map(buildNeutral);
            if (!v || typeof v !== "object") return v;
            const out = {};
            for (const [k, x] of Object.entries(v)) {
                const y = buildNeutral(x);
                if (Array.isArray(x) && x.length && Array.isArray(y) && !y.length) continue;
                out[k] = y;
            }
            return out;
        };
        // The Researchers button (people-toolbar.ts, 1.3.0-rsbtn) is drawn only with the
        // Researchers feature on, which is in testing: on by default in a pre-release
        // build only (prefs-table.ts `devOnly`), so a release build's CI has none.
        // people-toolbar-button.spec.js holds the button itself.
        const researchersGate = (rec) => {
            if (wv._wvPpTbOn && wv._wvPpTbOn()) return rec;
            const out = JSON.parse(JSON.stringify(rec));
            for (const k of ["mainAtStart", "loaded"]) {
                if (out[k] && Array.isArray(out[k].ids)) out[k].ids = out[k].ids.filter(x => x !== "wv-pp-tb-button" && x !== "wv-pp-tb-style");
            }
            return out;
        };
        assert.deepEqual(wvT.wiringNormalize(buildNeutral(firstApplyOff(got))), wvT.wiringNormalize(buildNeutral(firstApplyOff(researchersGate(WIRING_EXPECTED)))));
    });
});

const WIRING_EXPECTED = {
    mainAtStart: {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCollAids:object",
            "_wvCompactTitleBar:object", "_wvFilterBar:object",
            "_wvFilterState:object", "_wvFilterTbBtn:object", "_wvFilterTreeObserver:object", "_wvHid:object",
            "_wvHidMO:object", "_wvItemDropOff:function", "_wvLastLibraryID:number",
            "_wvLibrariesBoxMo:object", "_wvMainNewTabKeyH:function", "_wvObsReload:object", "_wvObsXpi:object", "_wvOvActivateHandler:function",
            "_wvOvBirthMon:string", "_wvOvFollowWired:number", "_wvOvMoveHandler:function",
            "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPaneObs:object",
            "_wvPinnedTabIDs:object", "_wvRedoKeyH:function", "_wvStrayObs:object", "_wvStrayObsVer:string",
            // Split view (tab-split.ts, 1.0.5).
            "_wvTSplitRestoreArmed:boolean", "_wvTSplitSyncing:boolean", "_wvTSplits:object", "_wvTabBarDecoMo:object",
            "_wvTabExtRepositioner:object", "_wvTabGroupWinDnDOff:function", "_wvTabMultiSelOff:function",
            "_wvThemeMQ:object", "_wvTreeDelegate:object", "_wvWinOrder:number",
            // The wrap table of the window's own members (lib/wrap.ts): openDialog below.
            "_wvWraps:object",
            "listen countTip:blur", "listen countTip:keydown",
            "listen locateIcons:popupshown",
            "listen maxSpan:contextmenu", "listen maxSpan:rbup", "listen newWindowKey", "listen openBesideKey", "listen ovFollow:unload",
            "listen reopenClosedKey", "listen stuckDropRow:dragend", "listen stuckDropRow:dragenter", "listen stuckDropRow:dragexit", "listen stuckDropRow:dragleave",
            "listen stuckDropRow:dragover", "listen stuckDropRow:drop", "listen tabGroupDnD:escKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen xwinDrop:dragover", "listen xwinDrop:drop",
            // Zotero's progress window with minimize and maximize (progress-window.ts, 2026-11-26).
            "wrap openDialog:progressWindow",
        ],
        ZoteroPane: [
            "_wvLoadURIWired", "_wvOrigCopySelectedToClipboard", "_wvOrigLoadURI",
            "_wvOrigToggleAdvancedSearchState", "_wvOrigViewItems", "_wvQuickCopyWired",
            "_wvViewItemsWrapped", "wrap buildCollectionContextMenu:wv-hid",
            // WV-TEMP-124063: external annotations kept from the items list's Delete.
            "wrap canDeleteSelectedItems:extAnnDelete",
            // Split view: a reader|reader split's own panes (tab-split.ts, 1.0.5);
            // a library side's own panes (item 15).
            "wrap serializePersist:splitPersist",
            "wrap setTagScope:tagScopeRows",
            // WV-TEMP-134317: View > Layout shows the Tag Selector again with its tags.
            "wrap toggleTagSelector:tagReshow",
            "wrap unserializePersist:splitLibPersist",
        ],
        Zotero_Tabs: [
            "_wvOrigCanUnloadTS", "wrap close:trace+lastView", "wrap getState:normalize", "wrap markAsLoaded:trace",
            "wrap restoreState:trace", "wrap select:trace", "wrap updateSidebarLayout:splitSidebar",
        ],
        itemsView: [
            "_wvCacheStateWired", "_wvCollChangeWrapped", "_wvIsSelectableOrig", "_wvOrigResetColumns",
            "_wvResetColumnsWrapVer", "_wvSelChangeWired", "_wvSetFilterWrapped",
            // Feeds (feeds.ts `feeds-sort`): the feed views' sort.
            "wrap _handleColumnSort:feeds",
            "wrap _restoreScrollPosition:scrollAnchor6023", "wrap _saveScrollPosition:scrollAnchor6023",
            "wrap getSortDirection:feeds", "wrap getSortField:feeds",
            "wrap handleRowModelUpdate:stuckDropRow", "wrap notify:scrollAnchor6023", "wrap selectItems:filterParity",
        ],
        rowProvider: [
            "_wvExpandMatchParentsPatched", "_wvNotifyForFilterPatched", "_wvOrigNotifyForFilter",
            "_wvOrigRefreshForChevronCompute", "_wvRefreshChevronComputePatched",
            // WV-TEMP-132551 (`countRedraw`): an expand / collapse redraws the item count.
            "wrap collapseAllRows:countRedraw", "wrap collapseRows:countRedraw",
            "wrap expandAllRows:countRedraw", "wrap expandRows:countRedraw",
            "wrap toggleOpenState:userOpenTracking+countRedraw",
        ],
        collectionsView: [
            // `_wvOrigCanDropCheck`: WV-TEMP-134361 (dev.108, goes when that
            // workaround retires). `_expandRow` / `_includedInTree` /
            // `isContainerEmpty:wv-hid`: the hidden collections' rules, layers since
            // 2026-11-27 (they were own properties and `_wvHidOrigContainerEmpty`:
            // another plugin's members over them were dropped, ssf F1/F2).
            // `notify:selectGuard`: the collection select guard, a layer since
            // 1.2.1-grpfold.1 (it was the hand-written `_wvOrigNotifyForSelectGuard`);
            // `toggleOpenState:grpfold`: the Group Libraries line folds (group-fold.ts;
            // its other layers sit on the window's CollectionTree class, not a
            // recorded host).
            "_wvOrigCanDropCheck",
            "wrap _expandRow:wv-hid", "wrap _includedInTree:wv-hid", "wrap isContainerEmpty:wv-hid",
            "wrap notify:selectGuard", "wrap toggleOpenState:grpfold+srchfold",
        ],
        itemPane: [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
            "wrap renderMessage:feedSidenav",
            // WV-TEMP-FEEDHEAD: on the window's item-pane prototype, seen through it.
            "wrap setReadLabel:feedHead", "wrap setTranslateButton:feedHead",
        ],
        document: [
            "_wvAdvSearchCtxHandler", "_wvAdvSearchKeyHandler", "_wvAdvSearchMidHandler",
            "_wvAdvSearchWinHandler", "_wvAdvSearchWinWire", "_wvCollSearchKeyHandler", "_wvCollSearchUnwire",
            "_wvCollSearchWired", "_wvCollTreeGestures", "_wvCollTreeUnwire", "_wvCollTreeWired",
            "_wvMenuGhostFix", "_wvMenuGhostUnwire", "_wvReaderFindKeyHandler", "_wvReaderFindRoute",
            "_wvReaderFindUnwire", "listen colPickMark:popupshowing", "listen defpane:contextmenu", "listen filterPanel:keys",
            "listen lazy:ppCmark:click", "listen lazy:ppCmark:mousedown", "listen xwinDrop:dragstart",
        ],
        documentElement: [],
        "#zotero-itemmenu": [
            "_wvDefChildMenuHandlers", "_wvDefChildMenuWired",
        ],
        "#zotero-collectionmenu": [
            "_wvHidH", "listen srchfold:colmenu",
        ],
        "#zotero-tabs-menu-panel": [
            "_wvLibrarySortInstalled", "_wvOrigRefreshList", "listen tabsMenu:fitHeight",
        ],
        "#item-tree-main-default": [
            "listen urlTitle:mouseover",
        ],
        "#zotero-collections-tree": [
            // The click on the Group Libraries line (group-fold.ts, 1.2.1-grpfold.1).
            "listen grpfold:down", "listen grpfold:up",
            // The saved-search folders trial (search-folders.ts, 1.3.0-paneorg).
            "listen srchfold:ctx", "listen srchfold:down", "listen srchfold:up",
            "listen stuckDropRow:collections",
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
            "wrap renderMessage:feedSidenav",
            "wrap setReadLabel:feedHead", "wrap setTranslateButton:feedHead",
        ],
        "#zotero-context-pane": [
            "_wvCtxNoteWatchBy", "_wvCtxNoteWatchOff",
        ],
        // On the pane since 2026-11-07, not the window: each library tab has its own
        // collections pane on a Zotero with its own windows (zotero#6035).
        "#zotero-collections-pane": [
            "_wvCollPaneObs",
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
            "wv-anchor-indicator-style",
            // The Bookmarks pane above the collections tree (bookmarks-pane.ts, 1.3.0-bmpane),
            // with the dropdown's sheet for its tools.
            "wv-bmpane", "wv-bmpane-splitter", "wv-bmpane-style", "wv-bookmarks-style",
            "wv-bookmarks-toolbar-button",
            // The collections funnel: its button, its panel and its sheet (1.3.0-collfunnel).
            "wv-cf-popup", "wv-cf-style", "wv-cf-tb-button",
            "wv-coll-aids-sheet",
            "wv-compact-titlebar-styles", "wv-early-compact-css", "wv-filter-bar", "wv-filter-popup",
            "wv-filter-tb-button", "wv-hamburger-popup", "wv-hid-sheet", "wv-panelock-style", "wv-pinned-tab-style", "wv-pp-cmark-style",
            // The Researchers button and its sheet (1.3.0-rsbtn; only with Researchers on:
            // researchersGate).
            "wv-pp-tb-button", "wv-pp-tb-style",
            "wv-selected-tab-ring", "wv-sf-styles", "wv-sticky-heads-styles", "wv-tab-group-styles", "wv-tab-library-tooltip", "wv-tabs-menu-clear-btn",
            "wv-tabs-menu-filetype-btn", "wv-tabs-menu-settings-btn", "wv-tb-toggle-collections-pane",
            "wv-tsplit-layer", "wv-tsplit-style",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip",
        ],
        rootClasses: [
            "wv-ui-dark",
        ],
        rootAttrs: ["data-wv-note-outline"],
    },
    loaded: {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCollAids:object",
            "_wvCompactTitleBar:object", "_wvDevInitDone:boolean",
            "_wvFilterBar:object", "_wvFilterState:object", "_wvFilterTbBtn:object",
            "_wvFilterTreeObserver:object", "_wvGlyphLazy:number", "_wvHid:object", "_wvHidApplyTries:number", "_wvHidMO:object",
            "_wvItemDropOff:function", "_wvLibrariesBoxMo:object", "_wvMainNewTabKeyH:function",
            "_wvManagedWindow:boolean", "_wvNotifierObsIDs:object", "_wvObsReload:object", "_wvObsXpi:object", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPQListeners:object", "_wvPaneObs:object", "_wvPaneOpen:object", "_wvPinnedTabIDs:object",
            "_wvPrefObsIDs:object",
            "_wvRedoKeyH:function", "_wvStrayObs:object", "_wvStrayObsVer:string",
            "_wvTSplitRestoreArmed:boolean", "_wvTSplitSyncing:boolean", "_wvTSplits:object", "_wvTabBarDecoMo:object",
            "_wvTabExtRepositioner:object", "_wvTabGroupWinDnDOff:function", "_wvTabMultiSelOff:function",
            "_wvThemeMQ:object", "_wvTitleGlyphIdx:number", "_wvTreeDelegate:object", "_wvWinIconName:string",
            "_wvWinOrder:number", "_wvWindowId:number", "_wvWraps:object",
            "listen countTip:blur", "listen countTip:keydown", "listen locateIcons:popupshown",
            "listen maxSpan:contextmenu", "listen maxSpan:rbup",
            "listen newWindowKey", "listen openBesideKey", "listen ovFollow:unload", "listen reopenClosedKey",
            "listen stuckDropRow:dragend", "listen stuckDropRow:dragenter", "listen stuckDropRow:dragexit", "listen stuckDropRow:dragleave", "listen stuckDropRow:dragover",
            "listen stuckDropRow:drop", "listen tabGroupDnD:escKey", "listen tabGroupWinDnD:dragover", "listen tabGroupWinDnD:drop",
            "listen xwinDrop:dragover", "listen xwinDrop:drop",
            "wrap openDialog:progressWindow",
        ],
        ZoteroPane: [
            "_wvLoadURIWired", "_wvOrigCopySelectedToClipboard", "_wvOrigLoadURI",
            "_wvOrigToggleAdvancedSearchState", "_wvOrigViewItems", "_wvPanePersistIsolated",
            "_wvPanePersistKey", "_wvQuickCopyWired", "_wvViewItemsWrapped",
            "wrap buildCollectionContextMenu:wv-hid", "wrap canDeleteSelectedItems:extAnnDelete",
            "wrap serializePersist:splitPersist", "wrap setTagScope:tagScopeRows",
            "wrap toggleTagSelector:tagReshow",
            "wrap unserializePersist:splitLibPersist",
        ],
        Zotero_Tabs: [
            "_wvOrigCanUnloadTS", "_wvSidebarIsolated", "_wvSidebarKey", "wrap close:trace+lastView", "wrap getState:normalize",
            "wrap markAsLoaded:trace", "wrap restoreState:trace", "wrap select:trace", "wrap updateSidebarLayout:splitSidebar",
        ],
        itemsView: [
            "_wvColIsolated", "_wvColKey", "_wvCollChangeWrapped", "_wvIsSelectableOrig",
            "_wvSetFilterWrapped", "wrap _handleColumnSort:feeds",
            "wrap _restoreScrollPosition:scrollAnchor6023", "wrap _saveScrollPosition:scrollAnchor6023",
            "wrap getSortDirection:feeds", "wrap getSortField:feeds",
            "wrap handleRowModelUpdate:stuckDropRow", "wrap notify:scrollAnchor6023", "wrap selectItems:filterParity",
        ],
        rowProvider: [
            "_wvExpandMatchParentsPatched",
            "wrap collapseAllRows:countRedraw", "wrap collapseRows:countRedraw",
            "wrap expandAllRows:countRedraw", "wrap expandRows:countRedraw",
            "wrap toggleOpenState:userOpenTracking+countRedraw",
        ],
        collectionsView: [
            // `_wvOrigCanDropCheck`: WV-TEMP-134361 (dev.108, goes when that workaround
            // retires); the hidden collections' layers (2026-11-27, as on the first
            // window); the select guard's layer and the Group Libraries fold's
            // (1.2.1-grpfold.1, as on the first window).
            "_wvOrigCanDropCheck",
            "wrap _expandRow:wv-hid", "wrap _includedInTree:wv-hid", "wrap isContainerEmpty:wv-hid",
            "wrap notify:selectGuard", "wrap toggleOpenState:grpfold+srchfold",
        ],
        itemPane: [
            "_wvCountWired", "_wvOrigRenderBatchPrompt", "_wvOrigSetItemPaneMessage",
            "wrap renderMessage:feedSidenav",
            // WV-TEMP-FEEDHEAD: on the window's item-pane prototype, seen through it.
            "wrap setReadLabel:feedHead", "wrap setTranslateButton:feedHead",
        ],
        document: [
            "_wvAdvSearchCtxHandler", "_wvAdvSearchKeyHandler", "_wvAdvSearchMidHandler",
            "_wvAdvSearchWinHandler", "_wvAdvSearchWinWire", "_wvCollSearchKeyHandler", "_wvCollSearchUnwire",
            "_wvCollSearchWired", "_wvCollTreeGestures", "_wvCollTreeUnwire", "_wvCollTreeWired",
            "_wvMenuGhostFix", "_wvMenuGhostUnwire", "_wvReaderFindKeyHandler", "_wvReaderFindRoute",
            "_wvReaderFindUnwire", "listen colPickMark:popupshowing", "listen defpane:contextmenu", "listen filterPanel:keys",
            "listen lazy:ppCmark:click", "listen lazy:ppCmark:mousedown", "listen xwinDrop:dragstart",
        ],
        documentElement: [],
        "#zotero-itemmenu": [
            "_wvDefChildMenuHandlers", "_wvDefChildMenuWired",
        ],
        "#zotero-collectionmenu": [
            "_wvHidH", "listen srchfold:colmenu",
        ],
        "#zotero-tabs-menu-panel": [
            "_wvLibrarySortInstalled", "_wvOrigRefreshList", "listen tabsMenu:fitHeight",
        ],
        "#item-tree-main-default": [
            "listen urlTitle:mouseover",
        ],
        "#zotero-collections-tree": [
            "listen grpfold:down", "listen grpfold:up",
            // The saved-search folders trial (search-folders.ts, 1.3.0-paneorg).
            "listen srchfold:ctx", "listen srchfold:down", "listen srchfold:up",
            "listen stuckDropRow:collections",
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
            "wrap renderMessage:feedSidenav",
            "wrap setReadLabel:feedHead", "wrap setTranslateButton:feedHead",
        ],
        "#zotero-context-pane": [
            "_wvCtxNoteWatchBy", "_wvCtxNoteWatchOff",
        ],
        // On the pane since 2026-11-07, not the window: each library tab has its own
        // collections pane on a Zotero with its own windows (zotero#6035).
        "#zotero-collections-pane": [
            "_wvCollPaneObs",
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
            "wv-anchor-indicator-style",
            "wv-bmpane", "wv-bmpane-splitter", "wv-bmpane-style", "wv-bookmarks-style",
            "wv-bookmarks-toolbar-button", "wv-cf-popup", "wv-cf-style", "wv-cf-tb-button", "wv-coll-aids-sheet",
            "wv-compact-titlebar-styles", "wv-early-compact-css", "wv-filter-bar", "wv-filter-popup",
            "wv-filter-tb-button", "wv-hamburger-popup", "wv-hid-sheet", "wv-panelock-style", "wv-pinned-tab-style", "wv-pp-cmark-style",
            "wv-pp-tb-button", "wv-pp-tb-style",
            "wv-selected-tab-ring", "wv-sf-styles", "wv-sticky-heads-styles", "wv-tab-group-styles", "wv-tab-library-tooltip", "wv-tabs-menu-clear-btn",
            "wv-tabs-menu-filetype-btn", "wv-tabs-menu-settings-btn", "wv-tb-toggle-collections-pane",
            "wv-tsplit-layer", "wv-tsplit-style",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
        ],
        rootClasses: [
            "wv-ui-dark",
        ],
        rootAttrs: ["data-wv-note-outline"],
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
