/* global describe, it, before, assert, Zotero, Services, PathUtils, IOUtils */

// Characterization of Weavero's DEFAULT-branch registrations (code survey
// §3.5, consolidation step 4, slice 1b, 2026-10-17): every pref under
// extensions.zotero.weavero. that has a default once init has run, with its
// type and value. Until slice 1b two places registered them (init's step 0
// and _wvRegisterDefaultPrefs, partly overlapping); the table must leave
// the default branch exactly as they did. Recorded on 0.22.2-prefs.1.
//
// Every run writes what it measured to
// <tempDir>/wv-prefs-registry.json (how EXPECTED was recorded).

describe("Weavero — default-branch registrations (characterization)", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
    });

    const measure = () => {
        const branch = Services.prefs.getDefaultBranch("extensions.zotero.weavero.");
        const out = {};
        for (const k of branch.getChildList("").sort()) {
            const t = branch.getPrefType(k);
            try {
                out[k] = t === branch.PREF_BOOL ? branch.getBoolPref(k)
                    : t === branch.PREF_STRING ? "s:" + branch.getStringPref(k)
                    : t === branch.PREF_INT ? "i:" + branch.getIntPref(k) : "?" + t;
            } catch (e) { /* a name with a user value only has no default */ }
        }
        return out;
    };

    it("init leaves the default branch exactly as recorded", async function () {
        const got = measure();
        try { await IOUtils.writeUTF8(PathUtils.join(PathUtils.tempDir, "wv-prefs-registry.json"), JSON.stringify(got, null, 1)); } catch (_) {}
        assert.isOk(EXPECTED, "EXPECTED is recorded (see the file the run just wrote)");
        // People is in testing (peoplenet, MJT 2026-11-25): on by default in a
        // pre-release build only (test/people-gate.spec.js).
        // The Bookmarks pane is a trial (bmpane, 2026-11-27): the same rule (prefs-table.ts devOnly).
        // So are the saved-search folders (search-folders.ts, paneorg 2026-11-27) and the
        // collections funnel (coll-funnel.ts, collfunnel 2026-11-27).
        // The folders stay off in a public beta (betaOff, MJT 2026-11-28).
        const pre = String(wv._version || "").includes("-");
        const beta = /-beta\.\d+$/.test(String(wv._version || ""));
        const want = Object.assign({}, EXPECTED, { enablePeople: pre, collectionsBookmarksPane: pre, collectionsSearchFolders: pre && !beta, collectionsSearchFoldersNames: pre,
            collectionsFunnel: pre });
        assert.deepEqual(got, want);
    });

    it("a trial's default follows the build: dev on, public beta on except the folders, release off", function () {
        const d = (k, v) => wv._wvPrefDefault(k, v);
        for (const k of ["collectionsSearchFolders", "collectionsFunnel", "collectionsBookmarksPane", "enablePeople"]) {
            assert.isTrue(d(k, "1.3.0-dev.106"), k + " on a dev build");
            assert.isFalse(d(k, "1.3.0"), k + " on a release");
        }
        assert.isFalse(d("collectionsSearchFolders", "1.3.0-beta.1"), "the folders off in a public beta");
        assert.isTrue(d("collectionsFunnel", "1.3.0-beta.1"), "the funnel on in a public beta");
        assert.isTrue(d("collectionsSearchFolders", "1.3.0-collfunnel.7"), "a branch build is not a public beta");
    });

    it("registering again changes nothing (idempotent)", function () {
        const before = JSON.stringify(measure());
        wv._wvRegisterDefaultPrefs();
        assert.equal(JSON.stringify(measure()), before);
    });

    // eslint-disable-next-line no-var
    var EXPECTED = {
        "advSearchShortcutNewWindow": true,
        "advSearchWindowHidePanes": true,
        "annCardDateAdded": false,
        "annCardDateModified": false,
        "annListShowHighlight": true,
        "annListShowImage": true,
        "annListShowInk": true,
        "annListShowNote": true,
        "annListShowText": true,
        "annListShowUnderline": true,
        "annPaneDefault": "s:",
        "annSelectorHandle": true,
        "annSelectorHidden": false,
        "autoHideEmptyLibraryBookmarks": false,
        "autoHideEmptyReaderBookmarks": false,
        // Backups (backups.ts, branch backups): the automatic ones, the dailies kept.
        "backup.auto": true,
        "backup.keepDaily": "i:7",
        "bookmarkCollectionScroll": "s:top",
        "bookmarkPageNumbers": true,
        "collapseAdvancedToQuickSearch": true,
        // The collections funnel's default (coll-funnel.ts, 1.3.0-collfunnel.1): its JSON and
        // its Settings boxes, everything shown.
        "collFunnelDefault": "s:",
        "collFunnelShowBookmarks": true,
        "collFunnelShowCollections": true,
        "collFunnelShowFeeds": true,
        "collFunnelShowFolders": true,
        "collFunnelShowSearches": true,
        "collFunnelShowSpecial": true,
        // devOnly: the test above sets it from the build's version.
        "collectionsBookmarksPane": true,
        // The collections funnel (coll-funnel.ts): a devOnly trial, the same override.
        "collectionsFunnel": true,
        "collectionsIndentGuides": true,
        "collectionsPaneToggle": true,
        "collectionsPathTooltip": true,
        // Folders for saved searches (search-folders.ts, paneorg 2026-11-27): a devOnly trial,
        // on by default in a pre-release build only (the override in the test above).
        "collectionsSearchFolders": true,
        "collectionsSearchFoldersNames": true,
        "collectionsStickyMax": "i:7",
        "collectionsStickyParents": true,
        "compactTitleBar": true,
        "compactTitleBarMain": true,
        "compactTitleBarNote": true,
        "compactTitleBarPluginsManager": true,
        "compactTitleBarReader": true,
        "ctrlClickSplit": "s:horizontal",
        "debug": false,
        "defattMarkAuto": true,
        "defattSortFirstAuto": true,
        "defattSortFirstDefault": true,
        "enableAddRelatedMenu": true,
        "enableAddedByColors": true,
        "enableAnnPaneFilter": true,
        "enableAnnSort": true,
        "enableAnnotationAddedBy": true,
        "enableAnnotationsCountColumn": true,
        "enableAppLinks": false,
        "enableAppLinksSkipConfirm": false,
        "enableBacklinks": true,
        "enableBacklinksColumn": true,
        "enableBookmarks": true,
        "enableChainBadge": true,
        "enableCommentMarkdown": true,
        "enableCopyCollectionLink": true,
        "enableCopyItemLink": true,
        "enableDefaultChild": true,
        "enableDiscordScheme": false,
        "enableEvernoteScheme": false,
        "enableExtLinksColumn": true,
        "enableFigmaScheme": false,
        "enableFileScheme": false,
        "enableFilters": true,
        "enableFtpScheme": false,
        "enableGroupLibraryGlyph": true,
        "enableInlineUrls": true,
        "enableItemsList": true,
        "enableItemsTreeFilter": true,
        "enableLibrariesHighlight": true,
        "enableLibraryBookmarks": true,
        "enableLinks": true,
        "enableLinksAndRelations": true,
        "enableLinksColumn": true,
        "enableMagnetScheme": false,
        "enableMailtoScheme": false,
        "enableMsteamsScheme": false,
        "enableNotes": true,
        "enableNotesList": true,
        "enableNotesPane": true,
        "enableNotionScheme": false,
        "enableObsidianScheme": false,
        "enableOpenExternalViewer": true,
        "enableOpenRelatedSubmenu": true,
        "enableOutlineTextHighlight": true,
        // People (people.ts, 1.2.1-people.1): on by default on the branch.
        "enablePeople": true,
        "enablePluginsSearch": true,
        "enableReadStatusFilter": true,
        "enableReaderAnnFilter": true,
        "enableReaderBookmarks": true,
        "enableReaderSidebar": true,
        "enableReaderView": true,
        "enableReaderViewIcons": true,
        "enableFeeds": true,
        "enableReferences": true,
        "enableRelatedColumn": true,
        "enableRelations": true,
        "enableRightPane": true,
        "enableSelectionTarget": true,
        "enableSkypeScheme": false,
        "enableSlackScheme": false,
        "enableSmsScheme": false,
        "enableSplitView": true,
        "enableSpotifyScheme": false,
        "enableTabGroups": true,
        "enableTabSessions": true,
        "enableTabsAndWindows": true,
        "enableTabsFileTypeFilter": true,
        "enableTabsLibraryFilter": true,
        "enableTagsCountAuto": true,
        "enableTagsRelatedScope": true,
        "enableTelScheme": false,
        "enableUriUtilities": true,
        "enableVisualExtras": true,
        "enableVscodeScheme": false,
        "enableZoomScheme": false,
        "enableZoteroLinks": true,
        "filterBuildMode": true,
        // The Group Libraries line folded (group-fold.ts, 1.2.1-grpfold.1): open by default.
        "groupLibrariesCollapsed": false,
        "hideNativeAnnSelector": false,
        "inlineLinks": true,
        "itemCountBreakdown": true,
        // Pinned section headers in the item pane (2026-11-03).
        "itemPaneStickyHeaders": true,
        // The long item-pane lists' sort, per section (list-filter.ts, citations M4).
        "listSort.citedBy": "s:newest",
        "listSort.references": "s:paper",
        // The local file links opened after Weavero's question (1.2.3).
        "localFileLinksOpened": "s:",
        "newMainWindow": true,
        // Notes: the heading folds and the outline (2026-11-03).
        "noteFolding": true,
        // Notes: citations after Zotero links (2026-11-09).
        "noteLinkCitations": true,
        "noteOpenInDeckWindow": true,
        "noteOutline": true,
        "outlineKey.anchorBottom": "s:",
        "outlineKey.anchorTop": "s:",
        "outlineKey.pin": "s:",
        "outlineKey.selection": "s:",
        "outlinePageNumbers": true,
        "outlineTextSize": "s:zotero",
        "paneDragNoCollapse": true,
        // The sections locked at the bottom of the item pane, per view (a JSON
        // list since 1.2.1-panelock.2), and their heights (pane-lock.ts): the
        // feeds lock Why relevant.
        "paneLock.feed": "s:[\"weavero-feeds\"]",
        "paneLock.heights": "s:{}",
        "paneLock.library": "s:[]",
        "paneLock.reader": "s:[]",
        // The item pane sections' Settings defaults for a new window
        // (pane-scope.ts; dev.112 per level, dev.113 + the item itself).
        "paneScope.backlinks.ann": false,
        "paneScope.backlinks.att": false,
        "paneScope.backlinks.citations": true,
        "paneScope.backlinks.loop": true,
        "paneScope.backlinks.note": false,
        "paneScope.backlinks.own": true,
        // The "always shown" pins (2026-11-02), all off: the defaults' own
        // toggles are pinned by necessity, whatever these say.
        "paneScope.backlinks.pin.ann": false,
        "paneScope.backlinks.pin.att": false,
        "paneScope.backlinks.pin.citations": false,
        "paneScope.backlinks.pin.loop": false,
        "paneScope.backlinks.pin.note": false,
        "paneScope.backlinks.pin.own": false,
        "paneScope.backlinks.pin.zlinks": false,
        "paneScope.backlinks.zlinks": true,
        "paneScope.links.ann": true,
        "paneScope.links.broken": true,
        "paneScope.links.citations": true,
        "paneScope.links.loop": true,
        "paneScope.links.note": true,
        "paneScope.links.pin.ann": false,
        "paneScope.links.pin.broken": false,
        "paneScope.links.pin.citations": false,
        "paneScope.links.pin.loop": false,
        "paneScope.links.pin.note": false,
        "paneScope.links.pin.zlinks": false,
        "paneScope.links.zlinks": true,
        "paneScope.related.ann": false,
        "paneScope.related.att": false,
        "paneScope.related.note": false,
        "paneScope.related.own": true,
        "paneScope.related.pin.ann": false,
        "paneScope.related.pin.att": false,
        "paneScope.related.pin.note": false,
        "paneScope.related.pin.own": false,
        "paneScope.tags.ann": false,
        "paneScope.tags.att": false,
        "paneScope.tags.note": false,
        "paneScope.tags.own": true,
        "paneScope.tags.pin.ann": false,
        "paneScope.tags.pin.att": false,
        "paneScope.tags.pin.note": false,
        "paneScope.tags.pin.own": false,
        // The Researchers tab (people.ts, 1.3.0-people3.1): the list's sort, its
        // chip, its filters (JSON), the name order of each place; the table's
        // columns (JSON, 1.3.0-peoplenet.15); the right pane's width and state
        // (JSON, 1.3.0-peoplenet.16).
        "people.columns": "s:{}",
        "people.filters": "s:{}",
        "people.names.links": "s:last",
        "people.names.list": "s:last",
        "people.names.title": "s:last",
        "people.names.tree": "s:last",
        "people.pane": "s:{}",
        "people.show": "s:all",
        "people.sort": "s:last",
        // The Researchers button in the collections pane's toolbar (people-toolbar.ts,
        // 1.3.0-rsbtn, MJT 2026-11-27).
        "peopleToolbarButton": true,
        // A pinned library tab's name (dev.68, MJT 2026-11-21).
        "pinnedLibraryTabName": true,
        "previewEntryHighlight": true,
        "previewLinkZones": true,
        // Zotero's progress window with minimize and maximize (branch progwin, 2026-11-26).
        "progressWindowButtons": true,
        "readerItemPane": true,
        "readerLayoutMenu": true,
        "readerOutlineTakeover": true,
        "readerUndoButtons": true,
        "recolorAmLinks": true,
        "referencesBibliographyMarks": true,
        // Build Zotero's structure data for all PDFs (sdt-build.ts, citations M5): OFF.
        "referencesBuildStructure": false,
        "referencesBuildStructurePaused": false,
        "feedsJournals": true,
        "referencesCitedBy": true,
        "referencesSection": true,
        "remoteFileLinks": false,
        "remoteFileLinksOpened": "s:",
        "selectedTabRing": true,
        "separateTaskbarButtons": false,
        "sessionAutoReopen": true,
        "sessionSort": "s:created",
        "sessionSortReverse": false,
        "showLibraryBookmarksInReader": true,
        "splitViewFollow": false,
        "splitViewFooter": true,
        "tagSelectorHandle": true,
        "titleLinesCount": "i:2",
        "titleLinesMode": "s:off",
        "windowIcons": true,
        "windowTitleGlyphs": false,
        "windowTitleNameMode": "s:off",
    };
});
