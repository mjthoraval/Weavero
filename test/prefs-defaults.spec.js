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
    const PANE = ["advSearchShortcutNewWindow", "advSearchWindowHidePanes", "collectionsPaneToggle", "annListShowHighlight", "annListShowImage", "annListShowInk", "annListShowNote",
        "annListShowText", "annListShowUnderline", "enableAnnPaneFilter", "hideNativeAnnSelector",
        "autoHideEmptyLibraryBookmarks", "autoHideEmptyReaderBookmarks", "bookmarkPageNumbers", "compactTitleBar",
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
        "itemCountBreakdown", "newMainWindow", "noteOpenInDeckWindow", "outlinePageNumbers",
        "readerItemPane", "separateTaskbarButtons",
        "sessionAutoReopen", "showLibraryBookmarksInReader", "windowIcons", "windowTitleGlyphs"];

    // Getters written as `v === undefined ? true : !!v`.
    const DEFAULT_TRUE = ["advSearchWindowHidePanes", "collectionsPaneToggle", "advSearchShortcutNewWindow",
        "annListShowHighlight", "annListShowImage", "annListShowInk", "annListShowNote",
        "annListShowText", "annListShowUnderline", "enableAnnPaneFilter", "hideNativeAnnSelector", "bookmarkPageNumbers",
        "enableAddRelatedMenu", "enableAddedByColors", "enableAnnSort",
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
        "outlinePageNumbers", "readerItemPane", "readerOutlineTakeover", "recolorAmLinks",
        "showLibraryBookmarksInReader", "windowIcons"];

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

    // A pref rename is carried over ONCE, then the old key is retired. Setting
    // a pref to its default clears its user value, so a migration that keyed
    // on "new pref has no user value" re-ran at every startup and flipped the
    // Hide box off on each install (MJT, 2026-09-22). One cycle per session:
    // a retired user-only pref cannot be re-created until restart.
    it("the showNativeAnnSelector carry-over runs once and retires the old key", function () {
        const wv = Zotero.Weavero.plugin;
        if (typeof wv._wvRegisterDefaultPrefs !== "function") this.skip();
        const PB = Services.prefs.getBranch("extensions.zotero.weavero.");
        if (PB.prefHasUserValue("showNativeAnnSelector")) this.skip();   // a real profile choice: leave it
        const savedHide = PB.prefHasUserValue("hideNativeAnnSelector") ? Zotero.Prefs.get("weavero.hideNativeAnnSelector") : undefined;
        try {
            try { Zotero.Prefs.set("weavero.showNativeAnnSelector", true); }   // "Keep" under 0.20.0
            catch (e) { this.skip(); }                                         // retired earlier this session
            try { PB.clearUserPref("hideNativeAnnSelector"); } catch (e) {}
            wv._wvRegisterDefaultPrefs();
            assert.strictEqual(Zotero.Prefs.get("weavero.hideNativeAnnSelector"), false, "Keep carried over as Hide = off");
            assert.isFalse(PB.prefHasUserValue("showNativeAnnSelector"), "the old key is retired");
            // The user ticks Hide back on -- its default, so the user value goes.
            Zotero.Prefs.set("weavero.hideNativeAnnSelector", true);
            assert.isFalse(PB.prefHasUserValue("hideNativeAnnSelector"), "default value = no user value (Gecko)");
            wv._wvRegisterDefaultPrefs();   // the next startup
            assert.strictEqual(Zotero.Prefs.get("weavero.hideNativeAnnSelector"), true, "stays on: the migration does not run again");
        }
        finally {
            if (savedHide === undefined) { try { PB.clearUserPref("hideNativeAnnSelector"); } catch (e) {} }
            else Zotero.Prefs.set("weavero.hideNativeAnnSelector", savedHide);
        }
    });

    // The six "Annotation types shown in the pane" boxes carry the type's
    // glyph -- the SAME chrome SVG the filter chips load (MJT, 2026-09-21:
    // "the same glyphs as in the filters pane"), via the checkbox's own
    // icon slot (`src` -> `.checkbox-icon`), so a click on it toggles the
    // box. Compared against the chip catalogue, not a copy of the URLs.
    it("the six type boxes carry the filter chips' glyphs", async () => {
        const wv = Zotero.Weavero.plugin;
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const cap = k => k.charAt(0).toUpperCase() + k.slice(1);
        const missing = [];
        for (const def of wv._ANNOTATION_TYPES) {
            const re = new RegExp('<checkbox[^>]*src="([^"]+)"[^>]*preference="extensions\\.zotero\\.weavero\\.annListShow'
                + cap(def.value) + '"');
            const m = html.match(re);
            if (!m || m[1] !== def.icon) missing.push(def.value + " => " + (m ? m[1] : "no src"));
        }
        assert.deepEqual(missing, [], "Settings box glyph must be the chip's icon");
    });
});
