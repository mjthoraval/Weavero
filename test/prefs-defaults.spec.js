/* global describe, it, before, assert, Zotero, Services */

// Every Settings-pane pref must have a DEFAULT-BRANCH value (2026-08-24).
//
// Zotero's native `<checkbox preference="extensions.zotero.weavero.X">` binds
// two-way to the PREF. The plugin's feature getters, meanwhile, have their own
// `undefined -> true/false` fallbacks. When a pref has no default-branch value
// those two disagree: the checkbox reads the unset pref and renders UNCHECKED
// while the getter returns true and the feature runs.
//
// That bug shipped twice. `windowIcons` was reported by the maintainer on
// 2026-07-16 and fixed. `enableReadStatusFilter` had exactly the same shape but
// was missed -- invisible only because a user value happened to be masking it.
// Resetting settings on 2026-08-24 cleared that mask and exposed it.
//
// Two invariants, both cheap, both would have caught it:
//   1. every pref prefs.html exposes has a default-branch value
//   2. every getter that reads TRUE when unset has default-branch TRUE
//
// Keep PANE in sync with prefs.html and DEFAULT_TRUE with the getters
// (`grep -B3 '=== undefined ? true' src/`).

describe("Weavero — Settings prefs have registered defaults", () => {
    let db;

    // Mirrors prefs.html: grep -oE 'preference="extensions\.zotero\.weavero\.[A-Za-z.]+"'
    const PANE = ["autoHideEmptyLibraryBookmarks", "autoHideEmptyReaderBookmarks", "compactTitleBar",
        "compactTitleBarMain", "compactTitleBarNote", "compactTitleBarReader", "debug", "defattMarkAuto",
        "defattSortFirstAuto", "defattSortFirstDefault", "enableAddRelatedMenu", "enableAddedByColors",
        "enableAnnSort", "enableAnnotationAddedBy", "enableAnnotationsCountColumn", "enableAppLinks",
        "enableAppLinksSkipConfirm", "enableBookmarks", "enableChainBadge", "enableCommentMarkdown",
        "enableCopyCollectionLink", "enableCopyItemLink", "enableDefaultChild", "enableDiscordScheme",
        "enableEvernoteScheme", "enableFigmaScheme", "enableFileScheme", "enableFilters", "enableFtpScheme",
        "enableGroupLibraryGlyph", "enableInlineUrls", "enableItemsList", "enableItemsTreeFilter",
        "enableLibrariesHighlight", "enableLibraryBookmarks", "enableLinksAndRelations", "enableMagnetScheme",
        "enableMailtoScheme", "enableMsteamsScheme", "enableNotes", "enableNotesList", "enableNotesPane",
        "enableNotionScheme", "enableObsidianScheme", "enableOpenExternalViewer", "enableOpenRelatedSubmenu",
        "enableOutlineTextHighlight", "enablePluginsSearch", "enableReadStatusFilter", "enableReaderBookmarks",
        "enableReaderSidebar", "enableReaderView", "enableReaderViewIcons", "enableRelatedColumn",
        "enableRelations", "enableRightPane", "enableSelectionTarget", "enableSkypeScheme", "enableSlackScheme",
        "enableSmsScheme", "enableSpotifyScheme", "enableTabGroups", "enableTabSessions", "enableTabsAndWindows",
        "enableTabsFileTypeFilter", "enableTabsLibraryFilter", "enableTagsCountAuto", "enableTelScheme",
        "enableUriUtilities", "enableVisualExtras", "enableVscodeScheme", "enableZoomScheme", "enableZoteroLinks",
        "itemCountBreakdown", "newMainWindow", "noteOpenInDeckWindow", "readerItemPane", "separateTaskbarButtons",
        "sessionAutoReopen", "showLibraryBookmarksInReader", "windowIcons", "windowTitleGlyphs"];

    // Getters written as `v === undefined ? true : !!v`.
    const DEFAULT_TRUE = ["enableAddRelatedMenu", "enableAddedByColors", "enableAnnSort",
        "enableAnnotationAddedBy", "enableAnnotationsCountColumn", "enableBookmarks", "enableChainBadge",
        "enableCommentMarkdown", "enableCopyCollectionLink", "enableCopyItemLink", "enableDefaultChild",
        "enableFilters", "enableGroupLibraryGlyph", "enableIconAppLinks", "enableIconMarkdown", "enableIconUrls",
        "enableInlineUrls", "enableItemsList", "enableItemsTreeFilter", "enableLibrariesHighlight",
        "enableLibraryBookmarks", "enableLinksAndRelations", "enableNotes", "enableNotesList", "enableNotesPane",
        "enableOpenExternalViewer", "enableOpenRelatedSubmenu", "enableOutlineTextHighlight", "enablePluginsSearch",
        "enableReadStatusFilter", "enableReaderBookmarks", "enableReaderSidebar", "enableReaderView",
        "enableReaderViewIcons", "enableRelatedColumn", "enableRelations", "enableRightPane", "enableSelectionTarget",
        "enableTabGroups", "enableTabSessions", "enableTabsFileTypeFilter", "enableTabsLibraryFilter",
        "enableTagsCountAuto", "enableUriUtilities", "enableVisualExtras", "enableZoteroLinks", "inlineLinks",
        "readerItemPane", "readerOutlineTakeover", "recolorAmLinks", "showLibraryBookmarksInReader", "windowIcons"];

    const defaultOf = (k) => {
        try { return db.getBoolPref("weavero." + k); }
        catch (e) { return undefined; }
    };

    before(function () {
        if (!Zotero.Weavero || !Zotero.Weavero.plugin) this.skip();
        db = Services.prefs.getDefaultBranch("extensions.zotero.");
    });

    it("every Settings-pane pref has a default-branch value", () => {
        const missing = PANE.filter(k => defaultOf(k) === undefined);
        assert.deepEqual(missing, [],
            "an unset pref renders the checkbox unchecked regardless of what "
            + "the feature getter returns");
    });

    it("every getter that reads TRUE when unset has default-branch TRUE", () => {
        const bad = DEFAULT_TRUE.filter(k => defaultOf(k) !== true)
            .map(k => k + " => " + String(defaultOf(k)));
        assert.deepEqual(bad, [],
            "getter says on, checkbox would say off -- the windowIcons / "
            + "enableReadStatusFilter bug");
    });

    it("the three that regressed are specifically covered", () => {
        // enableReadStatusFilter ran while its checkbox showed unchecked.
        assert.strictEqual(defaultOf("enableReadStatusFilter"), true);
        // These two read false when unset, so false is the truthful default.
        assert.strictEqual(defaultOf("separateTaskbarButtons"), false);
        assert.strictEqual(defaultOf("windowTitleGlyphs"), false);
    });

    it("the read-status getter agrees with its checkbox once defaults exist", () => {
        const wv = Zotero.Weavero.plugin;
        if (typeof wv._getEnableReadStatusFilter !== "function") this.skip();
        // With the items-tree filter master on, the checkbox value (the pref)
        // and the feature getter must agree when the user has made no choice.
        if (!wv._getEnableItemsTreeFilter()) this.skip();
        const asCheckbox = Zotero.Prefs.get("weavero.enableReadStatusFilter");
        assert.strictEqual(!!asCheckbox, wv._getEnableReadStatusFilter());
    });
});
