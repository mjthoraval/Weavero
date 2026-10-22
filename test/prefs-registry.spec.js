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
        assert.deepEqual(got, EXPECTED);
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
        "bookmarkCollectionScroll": "s:top",
        "bookmarkPageNumbers": true,
        "collapseAdvancedToQuickSearch": true,
        "collectionsIndentGuides": true,
        "collectionsPaneToggle": true,
        "collectionsPathTooltip": true,
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
        "enableBookmarks": true,
        "enableChainBadge": true,
        "enableCommentMarkdown": true,
        "enableCopyCollectionLink": true,
        "enableCopyItemLink": true,
        "enableDefaultChild": true,
        "enableDiscordScheme": false,
        "enableEvernoteScheme": false,
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
        "enableLinksAndRelations": true,
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
        "enablePluginsSearch": true,
        "enableReadStatusFilter": true,
        "enableReaderBookmarks": true,
        "enableReaderSidebar": true,
        "enableReaderView": true,
        "enableReaderViewIcons": true,
        "enableRelatedColumn": true,
        "enableRelations": true,
        "enableRightPane": true,
        "enableSelectionTarget": true,
        "enableSkypeScheme": false,
        "enableSlackScheme": false,
        "enableSmsScheme": false,
        "enableSpotifyScheme": false,
        "enableTabGroups": true,
        "enableTabSessions": true,
        "enableTabsAndWindows": true,
        "enableTabsFileTypeFilter": true,
        "enableTabsLibraryFilter": true,
        "enableTagsCountAuto": true,
        "enableTelScheme": false,
        "enableUriUtilities": true,
        "enableVisualExtras": true,
        "enableVscodeScheme": false,
        "enableZoomScheme": false,
        "enableZoteroLinks": true,
        "filterBuildMode": true,
        "hideNativeAnnSelector": false,
        "inlineLinks": true,
        "itemCountBreakdown": true,
        "newMainWindow": true,
        "noteOpenInDeckWindow": true,
        "outlineKey.anchorBottom": "s:",
        "outlineKey.anchorTop": "s:",
        "outlineKey.pin": "s:",
        "outlineKey.selection": "s:",
        "outlinePageNumbers": true,
        "outlineTextSize": "s:zotero",
        "paneDragNoCollapse": true,
        "previewLinkZones": true,
        "readerItemPane": true,
        "readerLayoutMenu": true,
        "readerOutlineTakeover": true,
        "readerUndoButtons": true,
        "recolorAmLinks": true,
        "selectedTabRing": true,
        "separateTaskbarButtons": false,
        "sessionAutoReopen": true,
        "sessionSort": "s:created",
        "sessionSortReverse": false,
        "showLibraryBookmarksInReader": true,
        "tagSelectorHandle": true,
        "windowIcons": true,
        "windowTitleGlyphs": false,
        "windowTitleNameMode": "s:off",
    };
});
