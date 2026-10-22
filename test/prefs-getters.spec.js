/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils */

// Characterization of the pref getters (code survey §3.5, consolidation
// step "one declarative PREFS table", 2026-10-17). For every getter it
// records WHICH prefs it reads (a stubbed Zotero.Prefs.get notes the keys)
// and WHAT it answers for each value of each of them -- unset, booleans,
// the strings some external tools write, empties, numbers, and a read that
// throws -- plus the default each key has on the default branch. RECORDED
// on the pre-table code (0.22.2-dev.50) and embedded below; the table must
// reproduce it exactly. A deliberate change edits EXPECTED in the same
// commit, with the reason.
// prefs.4 (MJT 2026-10-17): a read that throws answers the default -- the
// 18 getters that answered false there changed in that column only.
// prefs.4, same day: a box's Settings master is its feature's master --
// the outline highlight / page numbers and the Tags auto count gained
// Extras, the reader-bookmark options reader bookmarks (6 getters).
//
// Every run also writes what it measured to
// <tempDir>/wv-prefs-characterization.json (how EXPECTED was recorded).

describe("Weavero — pref getters (characterization)", () => {
    let wv;
    const GETTERS = [
        "_getInlineLinks", "_getEnableItemsList", "_getEnableRightPane", "_getEnableAnnotationAddedBy",
        "_getEnableAddedByColors", "_getEnableNotes", "_getEnableNotesPane", "_getEnableNotesList",
        "_getCtrlClickSplit", "_getEnableReaderSidebar", "_getEnableReaderView", "_getEnableReaderViewIcons",
        "_getEnableOutlineTextHighlight", "_getEnableAnnPaneFilter", "_getHideNativeAnnSelector",
        "_getAnnSelectorHidden", "_getAnnSelectorHandle",
        ["_getAnnListShow", "highlight"], ["_getAnnListShow", "underline"], ["_getAnnListShow", "note"],
        ["_getAnnListShow", "image"], ["_getAnnListShow", "ink"], ["_getAnnListShow", "text"],
        "_getOutlinePageNumbers", "_getBookmarkPageNumbers", "_getEnableCommentMarkdown", "_getEnableInlineUrls",
        "_getEnableIconUrls", "_getEnableIconMarkdown", "_getEnableIconAppLinks", "_getTabsAndWindowsMaster",
        "_getCompactTitleBar", "_getNoteOpenInDeckWindow", "_wvMultiMainOn", "_getAdvSearchShortcutNewWindow",
        "_getAdvSearchWindowHidePanes",
        ["_getCollectionsTreeAid", "collectionsStickyParents"], ["_getCollectionsTreeAid", "collectionsPathTooltip"],
        ["_getCollectionsTreeAid", "collectionsIndentGuides"],
        "_getCollectionsPaneToggle", "_getReaderLayoutMenu", "_getTagSelectorHandle", "_getPaneDragNoCollapse",
        "_getNewMainWindow", "_getCompactTitleBarMain", "_getCompactTitleBarReader", "_getCompactTitleBarNote",
        "_getCompactTitleBarPluginsManager", "_getEnableLinksAndRelations", "_getEnableVisualExtras",
        "_getEnableBookmarks", "_getEnableLibraryBookmarks", "_getEnableReaderBookmarks",
        "_getAutoHideEmptyReaderBookmarks", "_getAutoHideEmptyLibraryBookmarks", "_getShowLibraryBookmarksInReader",
        "_getEnableUriUtilities", "_getEnableCopyItemLink", "_getEnableCopyCollectionLink", "_getEnableRelations",
        "_getEnableAddRelatedMenu", "_getEnableChainBadge", "_getEnableOpenRelatedSubmenu", "_getEnableRelatedColumn",
        "_getEnableLibrariesHighlight", "_getEnableOpenExternalViewer", "_getEnablePluginsSearch", "_getEnableFilters",
        "_getEnableItemsTreeFilter", "_getEnableAnnSort", "_getEnableReadStatusFilter", "_getEnableSelectionTarget",
        "_getEnableTabsLibraryFilter", "_getEnableTabsFileTypeFilter", "_getEnableAnnotationsCountColumn",
        "_getSelectedTabRing", "_getEnableGroupLibraryGlyph", "_getEnableTagsCountAuto", "_tagsColumnWidth",
        "_getDebug",
        // module bundles
        "_getEnableOutlineTakeover", "_getRecolorAmLinks", "_getEnableTabGroups", "_getEnableWindowTitleGlyphs",
        "_getWindowTitleNameMode", "_getEnableWindowIcons", "_getEnableSeparateTaskbarButtons",
    ];
    const THROW = "<throw>";
    const VALUES = [undefined, true, false, "true", "false", "", "x", 0, 1, THROW];
    const label = (g) => Array.isArray(g) ? g[0] + "(" + g[1] + ")" : g;
    const show = (v) => v === undefined ? "<unset>" : v === THROW ? THROW : JSON.stringify(v);

    // Zotero.Prefs.get with every weavero.* key answered from `map` (unset
    // otherwise); other keys go to the real store. Keys read are recorded.
    let realGet = null;
    const withPrefs = (map, fn) => {
        const seen = [];
        Zotero.Prefs.get = function (key, global) {
            const k = String(key);
            if (!global && k.startsWith("weavero.")) {
                if (!seen.includes(k)) seen.push(k);
                if (Object.prototype.hasOwnProperty.call(map, k)) {
                    if (map[k] === THROW) throw new Error("characterization: read refused");
                    return map[k];
                }
                return undefined;
            }
            return realGet.apply(this, arguments);
        };
        let out;
        try { out = fn(); } catch (e) { out = "<getter threw " + e + ">"; }
        finally { Zotero.Prefs.get = realGet; }
        return { out, seen };
    };
    const call = (g) => Array.isArray(g) ? wv[g[0]](g[1]) : wv[g]();

    const measure = () => {
        const res = {};
        for (const g of GETTERS) {
            const L = label(g);
            const base = withPrefs({}, () => call(g));
            const keys = base.seen.slice();
            const byKey = {};
            for (const k of keys) {
                byKey[k] = VALUES.map((v) => show(withPrefs({ [k]: v }, () => call(g)).out));
            }
            res[L] = { unset: show(base.out), keys, byKey };
        }
        const defaults = {};
        const branch = Services.prefs.getDefaultBranch("extensions.zotero.");
        const allKeys = [...new Set(Object.values(res).flatMap((r) => r.keys))].sort();
        for (const k of allKeys) {
            const t = branch.getPrefType(k);
            defaults[k] = t === branch.PREF_BOOL ? branch.getBoolPref(k)
                : t === branch.PREF_STRING ? "s:" + branch.getStringPref(k)
                : t === branch.PREF_INT ? "i:" + branch.getIntPref(k) : null;
        }
        return { values: VALUES.map(show), getters: res, defaults };
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        realGet = Zotero.Prefs.get;
    });
    after(function () { if (realGet) Zotero.Prefs.get = realGet; });

    it("every getter answers as recorded, for every value of every pref it reads, and every key keeps its registered default", async function () {
        this.timeout(30000);
        for (const g of GETTERS) {
            const n = Array.isArray(g) ? g[0] : g;
            assert.isFunction(wv[n], "getter " + n + " exists");
        }
        const got = measure();
        try { await IOUtils.writeUTF8(PathUtils.join(PathUtils.tempDir, "wv-prefs-characterization.json"), JSON.stringify(got, null, 1)); } catch (_) {}
        assert.isOk(EXPECTED, "EXPECTED is recorded (see the file the run just wrote)");
        assert.deepEqual(got.values, EXPECTED.values, "the value set");
        for (const L of Object.keys(EXPECTED.getters)) {
            assert.deepEqual(got.getters[L], EXPECTED.getters[L], L);
        }
        assert.deepEqual(Object.keys(got.getters).sort(), Object.keys(EXPECTED.getters).sort(), "the getter set");
        assert.deepEqual(got.defaults, EXPECTED.defaults, "registered defaults");
    });

    // eslint-disable-next-line no-var
    var EXPECTED = {
        values: ["<unset>", "true", "false", "\"true\"", "\"false\"", "\"\"", "\"x\"", "0", "1", "<throw>"],
        getters: {
            "_getInlineLinks": {"unset":"true","keys":["weavero.inlineLinks"],"byKey":{"weavero.inlineLinks":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableItemsList": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableItemsList"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableItemsList":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableRightPane": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRightPane"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRightPane":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAnnotationAddedBy": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableAnnotationAddedBy"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableAnnotationAddedBy":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAddedByColors": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableAddedByColors"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableAddedByColors":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableNotes": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableNotes"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableNotes":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableNotesPane": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableNotesPane"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableNotesPane":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableNotesList": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableNotesList"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableNotesList":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getCtrlClickSplit": {"unset":"\"horizontal\"","keys":["weavero.ctrlClickSplit"],"byKey":{"weavero.ctrlClickSplit":["\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\"","\"horizontal\""]}},
            "_getEnableReaderSidebar": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableReaderSidebar"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderSidebar":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableReaderView": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableReaderView"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderView":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableReaderViewIcons": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableReaderViewIcons"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderViewIcons":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableOutlineTextHighlight": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableOutlineTextHighlight"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableOutlineTextHighlight":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAnnPaneFilter": {"unset":"true","keys":["weavero.enableAnnPaneFilter"],"byKey":{"weavero.enableAnnPaneFilter":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getHideNativeAnnSelector": {"unset":"false","keys":["weavero.hideNativeAnnSelector"],"byKey":{"weavero.hideNativeAnnSelector":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getAnnSelectorHidden": {"unset":"false","keys":["weavero.annSelectorHidden"],"byKey":{"weavero.annSelectorHidden":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getAnnSelectorHandle": {"unset":"true","keys":["weavero.annSelectorHandle"],"byKey":{"weavero.annSelectorHandle":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(highlight)": {"unset":"true","keys":["weavero.annListShowHighlight"],"byKey":{"weavero.annListShowHighlight":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(underline)": {"unset":"true","keys":["weavero.annListShowUnderline"],"byKey":{"weavero.annListShowUnderline":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(note)": {"unset":"true","keys":["weavero.annListShowNote"],"byKey":{"weavero.annListShowNote":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(image)": {"unset":"true","keys":["weavero.annListShowImage"],"byKey":{"weavero.annListShowImage":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(ink)": {"unset":"true","keys":["weavero.annListShowInk"],"byKey":{"weavero.annListShowInk":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAnnListShow(text)": {"unset":"true","keys":["weavero.annListShowText"],"byKey":{"weavero.annListShowText":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getOutlinePageNumbers": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.outlinePageNumbers"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.outlinePageNumbers":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getBookmarkPageNumbers": {"unset":"true","keys":["weavero.enableBookmarks","weavero.enableReaderBookmarks","weavero.bookmarkPageNumbers"],"byKey":{"weavero.enableBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.bookmarkPageNumbers":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableCommentMarkdown": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableCommentMarkdown"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableCommentMarkdown":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableInlineUrls": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableInlineUrls"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableInlineUrls":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableIconUrls": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableInlineUrls"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableInlineUrls":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableIconMarkdown": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableCommentMarkdown"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableCommentMarkdown":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableIconAppLinks": {"unset":"false","keys":["weavero.enableLinksAndRelations","weavero.enableAppLinks"],"byKey":{"weavero.enableLinksAndRelations":["false","false","false","false","false","false","false","false","false","false"],"weavero.enableAppLinks":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getTabsAndWindowsMaster": {"unset":"true","keys":["weavero.enableTabsAndWindows"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getCompactTitleBar": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.compactTitleBar"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBar":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getNoteOpenInDeckWindow": {"unset":"true","keys":["weavero.noteOpenInDeckWindow"],"byKey":{"weavero.noteOpenInDeckWindow":["true","true","false","true","false","true","true","false","true","true"]}},
            "_wvMultiMainOn": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.newMainWindow"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.newMainWindow":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getAdvSearchShortcutNewWindow": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.newMainWindow","weavero.advSearchShortcutNewWindow"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.newMainWindow":["true","true","false","true","false","true","true","false","true","true"],"weavero.advSearchShortcutNewWindow":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAdvSearchWindowHidePanes": {"unset":"true","keys":["weavero.advSearchWindowHidePanes"],"byKey":{"weavero.advSearchWindowHidePanes":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getCollectionsTreeAid(collectionsStickyParents)": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.collectionsStickyParents"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.collectionsStickyParents":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getCollectionsTreeAid(collectionsPathTooltip)": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.collectionsPathTooltip"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.collectionsPathTooltip":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getCollectionsTreeAid(collectionsIndentGuides)": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.collectionsIndentGuides"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.collectionsIndentGuides":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getCollectionsPaneToggle": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.collectionsPaneToggle"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.collectionsPaneToggle":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getReaderLayoutMenu": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.readerLayoutMenu"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.readerLayoutMenu":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getTagSelectorHandle": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.tagSelectorHandle"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.tagSelectorHandle":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getPaneDragNoCollapse": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.paneDragNoCollapse"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.paneDragNoCollapse":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getNewMainWindow": {"unset":"true","keys":["weavero.newMainWindow"],"byKey":{"weavero.newMainWindow":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getCompactTitleBarMain": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.compactTitleBar","weavero.compactTitleBarMain"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBar":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBarMain":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getCompactTitleBarReader": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.compactTitleBar","weavero.compactTitleBarReader"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBar":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBarReader":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getCompactTitleBarNote": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.compactTitleBar","weavero.compactTitleBarNote"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBar":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBarNote":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getCompactTitleBarPluginsManager": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.compactTitleBar","weavero.compactTitleBarPluginsManager"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBar":["true","true","false","true","false","true","true","false","true","true"],"weavero.compactTitleBarPluginsManager":["true","true","false","true","false","true","true","false","true","true"]}},
            "_getEnableLinksAndRelations": {"unset":"true","keys":["weavero.enableLinksAndRelations"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableVisualExtras": {"unset":"true","keys":["weavero.enableVisualExtras"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableBookmarks": {"unset":"true","keys":["weavero.enableBookmarks"],"byKey":{"weavero.enableBookmarks":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableLibraryBookmarks": {"unset":"true","keys":["weavero.enableBookmarks","weavero.enableLibraryBookmarks"],"byKey":{"weavero.enableBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableLibraryBookmarks":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableReaderBookmarks": {"unset":"true","keys":["weavero.enableBookmarks","weavero.enableReaderBookmarks"],"byKey":{"weavero.enableBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderBookmarks":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getAutoHideEmptyReaderBookmarks": {"unset":"false","keys":["weavero.enableBookmarks","weavero.enableReaderBookmarks","weavero.autoHideEmptyReaderBookmarks"],"byKey":{"weavero.enableBookmarks":["false","false","false","false","false","false","false","false","false","false"],"weavero.enableReaderBookmarks":["false","false","false","false","false","false","false","false","false","false"],"weavero.autoHideEmptyReaderBookmarks":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getAutoHideEmptyLibraryBookmarks": {"unset":"false","keys":["weavero.enableBookmarks","weavero.enableLibraryBookmarks","weavero.autoHideEmptyLibraryBookmarks"],"byKey":{"weavero.enableBookmarks":["false","false","false","false","false","false","false","false","false","false"],"weavero.enableLibraryBookmarks":["false","false","false","false","false","false","false","false","false","false"],"weavero.autoHideEmptyLibraryBookmarks":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getShowLibraryBookmarksInReader": {"unset":"true","keys":["weavero.enableBookmarks","weavero.enableReaderBookmarks","weavero.showLibraryBookmarksInReader"],"byKey":{"weavero.enableBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReaderBookmarks":["true","true","false","true","true","false","true","false","true","true"],"weavero.showLibraryBookmarksInReader":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableUriUtilities": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableUriUtilities"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableUriUtilities":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableCopyItemLink": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableUriUtilities","weavero.enableCopyItemLink"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableUriUtilities":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableCopyItemLink":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableCopyCollectionLink": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableUriUtilities","weavero.enableCopyCollectionLink"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableUriUtilities":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableCopyCollectionLink":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableRelations": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRelations"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelations":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAddRelatedMenu": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRelations","weavero.enableAddRelatedMenu"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableAddRelatedMenu":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableChainBadge": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRelations","weavero.enableChainBadge"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableChainBadge":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableOpenRelatedSubmenu": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRelations","weavero.enableOpenRelatedSubmenu"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableOpenRelatedSubmenu":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableRelatedColumn": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableRelatedColumn"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelatedColumn":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableLibrariesHighlight": {"unset":"true","keys":["weavero.enableLinksAndRelations","weavero.enableRelations","weavero.enableLibrariesHighlight"],"byKey":{"weavero.enableLinksAndRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableRelations":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableLibrariesHighlight":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableOpenExternalViewer": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableOpenExternalViewer"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableOpenExternalViewer":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnablePluginsSearch": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enablePluginsSearch"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enablePluginsSearch":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableFilters": {"unset":"true","keys":["weavero.enableFilters"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableItemsTreeFilter": {"unset":"true","keys":["weavero.enableFilters","weavero.enableItemsTreeFilter"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableItemsTreeFilter":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAnnSort": {"unset":"true","keys":["weavero.enableFilters","weavero.enableAnnSort"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableAnnSort":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableReadStatusFilter": {"unset":"true","keys":["weavero.enableFilters","weavero.enableItemsTreeFilter","weavero.enableReadStatusFilter"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableItemsTreeFilter":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableReadStatusFilter":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableSelectionTarget": {"unset":"true","keys":["weavero.enableFilters","weavero.enableSelectionTarget"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableSelectionTarget":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableTabsLibraryFilter": {"unset":"true","keys":["weavero.enableFilters","weavero.enableTabsLibraryFilter"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableTabsLibraryFilter":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableTabsFileTypeFilter": {"unset":"true","keys":["weavero.enableFilters","weavero.enableTabsFileTypeFilter"],"byKey":{"weavero.enableFilters":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableTabsFileTypeFilter":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableAnnotationsCountColumn": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableAnnotationsCountColumn"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableAnnotationsCountColumn":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getSelectedTabRing": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.selectedTabRing"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.selectedTabRing":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableGroupLibraryGlyph": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableGroupLibraryGlyph"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableGroupLibraryGlyph":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableTagsCountAuto": {"unset":"true","keys":["weavero.enableVisualExtras","weavero.enableTagsCountAuto"],"byKey":{"weavero.enableVisualExtras":["true","true","false","true","true","false","true","false","true","true"],"weavero.enableTagsCountAuto":["true","true","false","true","true","false","true","false","true","true"]}},
            "_tagsColumnWidth": {"unset":"44","keys":["weavero.enableVisualExtras","weavero.enableTagsCountAuto"],"byKey":{"weavero.enableVisualExtras":["44","44","30","44","44","30","44","30","44","44"],"weavero.enableTagsCountAuto":["44","44","30","44","44","30","44","30","44","44"]}},
            "_getDebug": {"unset":"false","keys":["weavero.debug"],"byKey":{"weavero.debug":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getEnableOutlineTakeover": {"unset":"true","keys":["weavero.readerOutlineTakeover"],"byKey":{"weavero.readerOutlineTakeover":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getRecolorAmLinks": {"unset":"true","keys":["weavero.recolorAmLinks"],"byKey":{"weavero.recolorAmLinks":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableTabGroups": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.enableTabGroups"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.enableTabGroups":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableWindowTitleGlyphs": {"unset":"false","keys":["weavero.enableTabsAndWindows","weavero.windowTitleGlyphs"],"byKey":{"weavero.enableTabsAndWindows":["false","false","false","false","false","false","false","false","false","false"],"weavero.windowTitleGlyphs":["false","true","false","true","true","false","true","false","true","false"]}},
            "_getWindowTitleNameMode": {"unset":"\"off\"","keys":["weavero.enableTabsAndWindows","weavero.windowTitleNameMode"],"byKey":{"weavero.enableTabsAndWindows":["\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\""],"weavero.windowTitleNameMode":["\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\"","\"off\""]}},
            "_getEnableWindowIcons": {"unset":"true","keys":["weavero.enableTabsAndWindows","weavero.windowIcons"],"byKey":{"weavero.enableTabsAndWindows":["true","true","false","true","false","true","true","false","true","true"],"weavero.windowIcons":["true","true","false","true","true","false","true","false","true","true"]}},
            "_getEnableSeparateTaskbarButtons": {"unset":"false","keys":["weavero.enableTabsAndWindows","weavero.separateTaskbarButtons"],"byKey":{"weavero.enableTabsAndWindows":["false","false","false","false","false","false","false","false","false","false"],"weavero.separateTaskbarButtons":["false","true","false","true","true","false","true","false","true","false"]}},
        },
        defaults: {
            "weavero.advSearchShortcutNewWindow": true,
            "weavero.advSearchWindowHidePanes": true,
            "weavero.annListShowHighlight": true,
            "weavero.annListShowImage": true,
            "weavero.annListShowInk": true,
            "weavero.annListShowNote": true,
            "weavero.annListShowText": true,
            "weavero.annListShowUnderline": true,
            "weavero.annSelectorHandle": true,
            "weavero.annSelectorHidden": false,
            "weavero.autoHideEmptyLibraryBookmarks": false,
            "weavero.autoHideEmptyReaderBookmarks": false,
            "weavero.bookmarkPageNumbers": true,
            "weavero.collectionsIndentGuides": true,
            "weavero.collectionsPaneToggle": true,
            "weavero.collectionsPathTooltip": true,
            "weavero.collectionsStickyParents": true,
            "weavero.compactTitleBar": true,
            "weavero.compactTitleBarMain": true,
            "weavero.compactTitleBarNote": true,
            "weavero.compactTitleBarPluginsManager": true,
            "weavero.compactTitleBarReader": true,
            "weavero.ctrlClickSplit": "s:horizontal",
            "weavero.debug": false,
            "weavero.enableAddRelatedMenu": true,
            "weavero.enableAddedByColors": true,
            "weavero.enableAnnPaneFilter": true,
            "weavero.enableAnnSort": true,
            "weavero.enableAnnotationAddedBy": true,
            "weavero.enableAnnotationsCountColumn": true,
            "weavero.enableAppLinks": false,
            "weavero.enableBookmarks": true,
            "weavero.enableChainBadge": true,
            "weavero.enableCommentMarkdown": true,
            "weavero.enableCopyCollectionLink": true,
            "weavero.enableCopyItemLink": true,
            "weavero.enableFilters": true,
            "weavero.enableGroupLibraryGlyph": true,
            "weavero.enableInlineUrls": true,
            "weavero.enableItemsList": true,
            "weavero.enableItemsTreeFilter": true,
            "weavero.enableLibrariesHighlight": true,
            "weavero.enableLibraryBookmarks": true,
            "weavero.enableLinksAndRelations": true,
            "weavero.enableNotes": true,
            "weavero.enableNotesList": true,
            "weavero.enableNotesPane": true,
            "weavero.enableOpenExternalViewer": true,
            "weavero.enableOpenRelatedSubmenu": true,
            "weavero.enableOutlineTextHighlight": true,
            "weavero.enablePluginsSearch": true,
            "weavero.enableReadStatusFilter": true,
            "weavero.enableReaderBookmarks": true,
            "weavero.enableReaderSidebar": true,
            "weavero.enableReaderView": true,
            "weavero.enableReaderViewIcons": true,
            "weavero.enableRelatedColumn": true,
            "weavero.enableRelations": true,
            "weavero.enableRightPane": true,
            "weavero.enableSelectionTarget": true,
            "weavero.enableTabGroups": true,
            "weavero.enableTabsAndWindows": true,
            "weavero.enableTabsFileTypeFilter": true,
            "weavero.enableTabsLibraryFilter": true,
            "weavero.enableTagsCountAuto": true,
            "weavero.enableUriUtilities": true,
            "weavero.enableVisualExtras": true,
            "weavero.hideNativeAnnSelector": false,
            "weavero.inlineLinks": true,
            "weavero.newMainWindow": true,
            "weavero.noteOpenInDeckWindow": true,
            "weavero.outlinePageNumbers": true,
            "weavero.paneDragNoCollapse": true,
            "weavero.readerLayoutMenu": true,
            "weavero.readerOutlineTakeover": true,
            "weavero.recolorAmLinks": true,
            "weavero.selectedTabRing": true,
            "weavero.separateTaskbarButtons": false,
            "weavero.showLibraryBookmarksInReader": true,
            "weavero.tagSelectorHandle": true,
            "weavero.windowIcons": true,
            "weavero.windowTitleGlyphs": false,
            "weavero.windowTitleNameMode": "s:off",
        },
    };
});
