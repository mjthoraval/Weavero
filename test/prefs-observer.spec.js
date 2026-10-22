/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils */

// Characterization of the pref OBSERVER (code survey §3.5, consolidation
// step 4, slice 2, 2026-10-17): for every pref name the observer's source
// mentions and every registered Weavero default, the plugin methods one
// change notification calls, in order, with their arguments summarized.
// Methods are stubbed while it fires (recorded, not run -- one level deep);
// the pure getters still run, since the observer branches on them. Calls
// made after an await or a timer are not part of the record: they live
// inside the branch bodies, which the dispatch table carries over verbatim.
// RECORDED on 0.22.2-prefs.2 and embedded; the table must reproduce it.
// prefs.4 (MJT 2026-10-17): Links & Relations also re-applies Firefox's
// app-link prompt settings (skip-confirm follows that master).
//
// Every run writes what it measured to
// <tempDir>/wv-prefs-observer.json (how EXPECTED was recorded).

describe("Weavero — pref observer dispatch (characterization)", () => {
    let wv;
    const PASS = /^(_get[A-Z]\w*|_wvPref|_wvPrefsTable|_wvLive|_wvMultiMainOn|_tagsColumnWidth)$/;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        if (!wv._prefObserver || typeof wv._prefObserver.observe !== "function") wvT.absent("!wv._prefObserver");
    });

    const summarize = (a) => {
        if (a === null || a === undefined) return String(a);
        const t = typeof a;
        if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(a);
        if (t === "function") return "fn";
        try {
            if (a.document && a.document.documentElement) return "win:" + (a.document.documentElement.getAttribute("windowtype") || "?");
            if (a.documentElement) return "doc:" + (a.documentElement.getAttribute("windowtype") || "?");
            if (a.nodeType === 1) return "el:" + a.localName;
        } catch (_) {}
        if (Array.isArray(a)) return "[" + a.length + "]";
        return "obj";
    };

    // Stub every function-valued method (own and prototype) except PASS;
    // record calls while armed.
    const record = (keys) => {
        const log = [];
        let armed = false;
        const saved = [];
        const holders = [wv, Object.getPrototypeOf(wv)];
        for (const h of holders) {
            for (const name of Object.getOwnPropertyNames(h)) {
                if (PASS.test(name) || name === "constructor") continue;
                const d = Object.getOwnPropertyDescriptor(h, name);
                if (!d || typeof d.value !== "function" || !d.writable) continue;
                saved.push([h, name, d.value]);
                h[name] = function (...args) {
                    if (armed) log.push(name + "(" + args.map(summarize).join(",") + ")");
                    return undefined;
                };
            }
        }
        const out = {};
        try {
            for (const k of keys) {
                log.length = 0;
                armed = true;
                let err = null;
                try { wv._prefObserver.observe(null, "nsPref:changed", k); } catch (e) { err = String(e); }
                armed = false;
                out[k] = err ? log.concat(["<threw " + err + ">"]) : log.slice();
            }
        } finally {
            armed = false;
            for (const [h, name, fn] of saved) h[name] = fn;
        }
        return out;
    };

    const keysToFire = () => {
        const set = new Set();
        if (!EXPECTED) {
            // Recording: the pref names the observer's source spells out,
            // and every registered default.
            const src = String(wv._prefObserver.observe);
            for (const m of src.matchAll(/"((?:extensions|browser|ui|widget|intl|font|layout)\.[\w.\-]+)"/g)) set.add(m[1]);
            const b = Services.prefs.getDefaultBranch("extensions.zotero.weavero.");
            for (const k of b.getChildList("")) set.add("extensions.zotero.weavero." + k);
        }
        else {
            // Once recorded, EXPECTED's keys stand for them (the source
            // moves, and a guard's own literal must not become a new key),
            // plus the table's rows. Not the default branch's child list: it
            // also names prefs that only have a USER value, and in a long run
            // earlier specs give state prefs one (tabGroups, pinnedTabs,
            // nextWindowId... -- 7 more keys in the prefs.4 wide run).
            for (const k of Object.keys(EXPECTED)) set.add(k);
            for (const k of Object.keys(wv._wvPrefsTable())) set.add("extensions.zotero.weavero." + k);
        }
        set.add("extensions.zotero.weavero.wvNoSuchPref");
        set.add("browser.wvNoSuchPref");
        return [...set].sort();
    };

    it("every pref change calls the same plugin methods, in the same order, as recorded", async function () {
        this.timeout(60000);
        const keys = keysToFire();
        const got = record(keys);
        try { await IOUtils.writeUTF8(PathUtils.join(PathUtils.tempDir, "wv-prefs-observer.json"), JSON.stringify(got, null, 1)); } catch (_) {}
        assert.isOk(EXPECTED, "EXPECTED is recorded (see the file the run just wrote)");
        for (const k of Object.keys(EXPECTED)) assert.deepEqual(got[k], EXPECTED[k], k);
        assert.deepEqual(Object.keys(got).filter(k => got[k].length), Object.keys(EXPECTED).filter(k => EXPECTED[k].length), "the keys that do something");
    });

    it("the record is stable (a second pass gives the same calls)", function () {
        this.timeout(60000);
        const keys = keysToFire();
        assert.deepEqual(record(keys), record(keys));
    });

    // eslint-disable-next-line no-var
    var EXPECTED = {
        "browser.wvNoSuchPref": [],
        "extensions.zotero.weavero.advSearchShortcutNewWindow": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.advSearchShortcutNewWindow\")"],
        "extensions.zotero.weavero.advSearchWindowHidePanes": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.advSearchWindowHidePanes\")"],
        "extensions.zotero.weavero.annCardDateAdded": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annCardDateAdded\")"],
        "extensions.zotero.weavero.annCardDateModified": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annCardDateModified\")"],
        "extensions.zotero.weavero.annListShowHighlight": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowHighlight\")"],
        "extensions.zotero.weavero.annListShowImage": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowImage\")"],
        "extensions.zotero.weavero.annListShowInk": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowInk\")"],
        "extensions.zotero.weavero.annListShowNote": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowNote\")"],
        "extensions.zotero.weavero.annListShowText": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowText\")"],
        "extensions.zotero.weavero.annListShowUnderline": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annListShowUnderline\")"],
        "extensions.zotero.weavero.annPaneDefault": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annPaneDefault\")"],
        "extensions.zotero.weavero.annSelectorHandle": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annSelectorHandle\")"],
        "extensions.zotero.weavero.annSelectorHidden": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.annSelectorHidden\")"],
        "extensions.zotero.weavero.autoHideEmptyLibraryBookmarks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.autoHideEmptyLibraryBookmarks\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.autoHideEmptyReaderBookmarks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.autoHideEmptyReaderBookmarks\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.bookmarkCollectionScroll": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.bookmarkCollectionScroll\")"],
        "extensions.zotero.weavero.bookmarkPageNumbers": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.bookmarkPageNumbers\")"],
        "extensions.zotero.weavero.collapseAdvancedToQuickSearch": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collapseAdvancedToQuickSearch\")"],
        "extensions.zotero.weavero.collectionsIndentGuides": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collectionsIndentGuides\")", "_wvApplyCollectionsTreeAids(win:navigator:browser)"],
        "extensions.zotero.weavero.collectionsPaneToggle": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collectionsPaneToggle\")", "_wvApplyCollectionsPaneToggle(win:navigator:browser)"],
        "extensions.zotero.weavero.collectionsPathTooltip": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collectionsPathTooltip\")", "_wvApplyCollectionsTreeAids(win:navigator:browser)"],
        "extensions.zotero.weavero.collectionsStickyMax": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collectionsStickyMax\")", "_wvApplyCollectionsTreeAids(win:navigator:browser)"],
        "extensions.zotero.weavero.collectionsStickyParents": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.collectionsStickyParents\")", "_wvApplyCollectionsTreeAids(win:navigator:browser)"],
        "extensions.zotero.weavero.compactTitleBar": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.compactTitleBar\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.compactTitleBarMain": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.compactTitleBarMain\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.compactTitleBarNote": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.compactTitleBarNote\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.compactTitleBarPluginsManager": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.compactTitleBarPluginsManager\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.compactTitleBarReader": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.compactTitleBarReader\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.ctrlClickSplit": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.ctrlClickSplit\")"],
        "extensions.zotero.weavero.debug": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.debug\")"],
        "extensions.zotero.weavero.defattMarkAuto": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.defattMarkAuto\")"],
        "extensions.zotero.weavero.defattSortFirstAuto": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.defattSortFirstAuto\")"],
        "extensions.zotero.weavero.defattSortFirstDefault": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.defattSortFirstDefault\")"],
        "extensions.zotero.weavero.enableAddRelatedMenu": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAddRelatedMenu\")", "_setupItemsListContextMenu()"],
        "extensions.zotero.weavero.enableAddedByColors": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAddedByColors\")", "_markCellLinks()"],
        "extensions.zotero.weavero.enableAnnPaneFilter": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAnnPaneFilter\")"],
        "extensions.zotero.weavero.enableAnnSort": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAnnSort\")"],
        "extensions.zotero.weavero.enableAnnotationAddedBy": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAnnotationAddedBy\")", "_markCellLinks()"],
        "extensions.zotero.weavero.enableAnnotationsCountColumn": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAnnotationsCountColumn\")", "_unregisterItemTreeColumns()", "_registerItemTreeColumns()"],
        "extensions.zotero.weavero.enableAppLinks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAppLinks\")", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableAppLinksSkipConfirm": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableAppLinksSkipConfirm\")", "_applyAppLinkConfirmPref()"],
        "extensions.zotero.weavero.enableBookmarks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableBookmarks\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.enableChainBadge": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableChainBadge\")", "_markCellLinks()"],
        "extensions.zotero.weavero.enableCommentMarkdown": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableCommentMarkdown\")", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableCopyCollectionLink": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableCopyCollectionLink\")", "_setupCollectionsContextMenu()"],
        "extensions.zotero.weavero.enableCopyItemLink": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableCopyItemLink\")", "_setupItemsListContextMenu()"],
        "extensions.zotero.weavero.enableDefaultChild": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableDefaultChild\")"],
        "extensions.zotero.weavero.enableDiscordScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableDiscordScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableEvernoteScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableEvernoteScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableFigmaScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableFigmaScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableFileScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableFileScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableFilters": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableFilters\")", "_setupItemsListFilter(win:navigator:browser)", "_applySelectionTargetVisuals(win:navigator:browser)", "_teardownTabsMenuLibrarySort(win:navigator:browser)", "_setupTabsMenuLibrarySort(win:navigator:browser)"],
        "extensions.zotero.weavero.enableFtpScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableFtpScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableGroupLibraryGlyph": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableGroupLibraryGlyph\")", "_setupTabsMenuLibrarySort(win:navigator:browser)"],
        "extensions.zotero.weavero.enableInlineUrls": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableInlineUrls\")", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableItemsList": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableItemsList\")", "_applySurfacePref(\"itemsList\")"],
        "extensions.zotero.weavero.enableItemsTreeFilter": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableItemsTreeFilter\")", "_setupItemsListFilter(win:navigator:browser)"],
        "extensions.zotero.weavero.enableLibrariesHighlight": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableLibrariesHighlight\")", "_setupLibrariesBoxHighlight(win:navigator:browser)"],
        "extensions.zotero.weavero.enableLibraryBookmarks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableLibraryBookmarks\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.enableLinksAndRelations": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableLinksAndRelations\")", "_setupItemsListContextMenu()", "_setupCollectionsContextMenu()", "_setupLibrariesBoxHighlight(win:navigator:browser)", "_unregisterItemTreeColumns()", "_registerItemTreeColumns()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")", "_applySurfacePref(\"notes\")", "_refreshNoteLinkifyRegex()", "_markCellLinks()", "_applyAppLinkConfirmPref()"],
        "extensions.zotero.weavero.enableMagnetScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableMagnetScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableMailtoScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableMailtoScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableMsteamsScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableMsteamsScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableNotes": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableNotes\")", "_applySurfacePref(\"notes\")", "_refreshNoteLinkifyRegex()"],
        "extensions.zotero.weavero.enableNotesList": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableNotesList\")", "_markCellLinks()"],
        "extensions.zotero.weavero.enableNotesPane": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableNotesPane\")", "_applySurfacePref(\"notes\")"],
        "extensions.zotero.weavero.enableNotionScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableNotionScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableObsidianScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableObsidianScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableOpenExternalViewer": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableOpenExternalViewer\")", "_setupItemsListContextMenu()"],
        "extensions.zotero.weavero.enableOpenRelatedSubmenu": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableOpenRelatedSubmenu\")", "_dbg(\"[Weavero] OpenRelatedSubmenu toggle applies to newly-rendered rows.\")"],
        "extensions.zotero.weavero.enableOutlineTextHighlight": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableOutlineTextHighlight\")"],
        "extensions.zotero.weavero.enablePluginsSearch": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enablePluginsSearch\")", "_registerPluginsSearch()"],
        "extensions.zotero.weavero.enableReadStatusFilter": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableReadStatusFilter\")", "_setupItemsListFilter(win:navigator:browser)"],
        "extensions.zotero.weavero.enableReaderBookmarks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableReaderBookmarks\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.enableReaderSidebar": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableReaderSidebar\")", "_applySurfacePref(\"readerSidebar\")"],
        "extensions.zotero.weavero.enableReaderView": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableReaderView\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableReaderViewIcons": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableReaderViewIcons\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableRelatedColumn": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableRelatedColumn\")", "_unregisterItemTreeColumns()", "_registerItemTreeColumns()"],
        "extensions.zotero.weavero.enableRelations": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableRelations\")", "_setupItemsListContextMenu()", "_markCellLinks()", "_setupLibrariesBoxHighlight(win:navigator:browser)", "_unregisterItemTreeColumns()", "_registerItemTreeColumns()", "_dbg(\"[Weavero] OpenRelatedSubmenu toggle applies to newly-rendered rows.\")"],
        "extensions.zotero.weavero.enableRightPane": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableRightPane\")", "_applySurfacePref(\"rightPane\")"],
        "extensions.zotero.weavero.enableSelectionTarget": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableSelectionTarget\")", "_applySelectionTargetVisuals(win:navigator:browser)"],
        "extensions.zotero.weavero.enableSkypeScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableSkypeScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableSlackScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableSlackScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableSmsScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableSmsScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableSpotifyScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableSpotifyScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableTabGroups": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTabGroups\")", "_applyTabGroups(win:navigator:browser)"],
        "extensions.zotero.weavero.enableTabSessions": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTabSessions\")"],
        "extensions.zotero.weavero.enableTabsAndWindows": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTabsAndWindows\")", "_wvPMReapplyChrome()", "_applyCompactTitleBar(win:navigator:browser)", "_wvReaderWindowTargets()", "_applyTabGroups(win:navigator:browser)", "_wvRefreshWindowIcons(false)", "_wvRefreshTaskbarOverlays(false)", "_wvRefreshWindowTaskbarIdentities()", "_wvRefreshTitleGlyphs(false)", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.enableTabsFileTypeFilter": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTabsFileTypeFilter\")", "_teardownTabsMenuLibrarySort(win:navigator:browser)", "_setupTabsMenuLibrarySort(win:navigator:browser)"],
        "extensions.zotero.weavero.enableTabsLibraryFilter": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTabsLibraryFilter\")", "_teardownTabsMenuLibrarySort(win:navigator:browser)", "_setupTabsMenuLibrarySort(win:navigator:browser)"],
        "extensions.zotero.weavero.enableTagsCountAuto": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTagsCountAuto\")"],
        "extensions.zotero.weavero.enableTelScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableTelScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableUriUtilities": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableUriUtilities\")", "_setupItemsListContextMenu()", "_setupCollectionsContextMenu()"],
        "extensions.zotero.weavero.enableVisualExtras": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableVisualExtras\")", "_wvApplyCollectionsPaneToggle(win:navigator:browser)", "_wvApplyTagSelectorHandle(win:navigator:browser)", "_wvApplyCollectionsTreeAids(win:navigator:browser)", "_wvHidRefreshAll()", "_wvEnsureSelectedTabRing(doc:navigator:browser)", "_wvTabGroupApplyEverywhere()", "_wvApplyPaneDragNoCollapse(win:navigator:browser)", "_unregisterItemTreeColumns()", "_registerItemTreeColumns()", "_setupTabsMenuLibrarySort(win:navigator:browser)", "_markCellLinks()", "_registerPluginsSearch()", "_wvPrefsWindows(fn)"],
        "extensions.zotero.weavero.enableVscodeScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableVscodeScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableZoomScheme": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableZoomScheme\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.enableZoteroLinks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.enableZoteroLinks\")", "_applyAppLinkConfirmPref()", "_refreshAllNoteEditorStyles()", "_refreshNoteLinkifyRegex()", "_stripRightPane()", "_applySurfacePref(\"itemsList\")", "_applySurfacePref(\"rightPane\")", "_applySurfacePref(\"readerSidebar\")", "_applySurfacePref(\"readerView\")"],
        "extensions.zotero.weavero.filterBuildMode": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.filterBuildMode\")"],
        "extensions.zotero.weavero.hideNativeAnnSelector": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.hideNativeAnnSelector\")"],
        "extensions.zotero.weavero.inlineLinks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.inlineLinks\")", "_applyInlineLinksPref(true)"],
        "extensions.zotero.weavero.itemCountBreakdown": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.itemCountBreakdown\")"],
        "extensions.zotero.weavero.newMainWindow": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.newMainWindow\")"],
        "extensions.zotero.weavero.noteOpenInDeckWindow": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.noteOpenInDeckWindow\")"],
        "extensions.zotero.weavero.outlineKey.anchorBottom": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlineKey.anchorBottom\")"],
        "extensions.zotero.weavero.outlineKey.anchorTop": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlineKey.anchorTop\")"],
        "extensions.zotero.weavero.outlineKey.pin": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlineKey.pin\")"],
        "extensions.zotero.weavero.outlineKey.selection": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlineKey.selection\")"],
        "extensions.zotero.weavero.outlinePageNumbers": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlinePageNumbers\")"],
        "extensions.zotero.weavero.outlineTextSize": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.outlineTextSize\")"],
        "extensions.zotero.weavero.paneDragNoCollapse": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.paneDragNoCollapse\")", "_wvApplyPaneDragNoCollapse(win:navigator:browser)"],
        "extensions.zotero.weavero.previewLinkZones": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.previewLinkZones\")"],
        "extensions.zotero.weavero.readerItemPane": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.readerItemPane\")", "_wvReaderWindowTargets()"],
        "extensions.zotero.weavero.readerLayoutMenu": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.readerLayoutMenu\")"],
        "extensions.zotero.weavero.readerOutlineTakeover": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.readerOutlineTakeover\")"],
        "extensions.zotero.weavero.readerUndoButtons": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.readerUndoButtons\")"],
        "extensions.zotero.weavero.recolorAmLinks": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.recolorAmLinks\")"],
        "extensions.zotero.weavero.selectedTabRing": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.selectedTabRing\")", "_wvEnsureSelectedTabRing(doc:navigator:browser)", "_wvTabGroupApplyEverywhere()"],
        "extensions.zotero.weavero.separateTaskbarButtons": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.separateTaskbarButtons\")", "_wvRefreshWindowIcons(false)", "_wvRefreshTaskbarOverlays(false)", "_wvRefreshWindowTaskbarIdentities()", "_wvRefreshTitleGlyphs(false)"],
        "extensions.zotero.weavero.sessionAutoReopen": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.sessionAutoReopen\")"],
        "extensions.zotero.weavero.sessionSort": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.sessionSort\")"],
        "extensions.zotero.weavero.sessionSortReverse": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.sessionSortReverse\")"],
        "extensions.zotero.weavero.showLibraryBookmarksInReader": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.showLibraryBookmarksInReader\")", "_teardownBookmarksToolbarButton(win:navigator:browser)", "_setupBookmarksToolbarButton(win:navigator:browser)"],
        "extensions.zotero.weavero.tagSelectorHandle": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.tagSelectorHandle\")", "_wvApplyTagSelectorHandle(win:navigator:browser)"],
        "extensions.zotero.weavero.windowIcons": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.windowIcons\")", "_wvRefreshWindowIcons(false)", "_wvRefreshTaskbarOverlays(false)", "_wvRefreshWindowTaskbarIdentities()", "_wvRefreshTitleGlyphs(false)"],
        "extensions.zotero.weavero.windowTitleGlyphs": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.windowTitleGlyphs\")", "_wvRefreshTitleGlyphs()"],
        "extensions.zotero.weavero.windowTitleNameMode": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.windowTitleNameMode\")", "_wvRefreshTitleGlyphs()"],
        "extensions.zotero.weavero.wvNoSuchPref": ["_dbg(\"[Weavero] pref changed at path: extensions.zotero.weavero.wvNoSuchPref\")"],
    };
});
