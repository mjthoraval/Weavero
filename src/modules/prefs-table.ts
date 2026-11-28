// Weavero's boolean preferences, ONE declarative table (code survey
// 2026-10-06 §3.5; consolidation plan step 4, slice 1, 2026-10-17).
//
// Until this table every pref had a hand-written `_get*` getter -- about
// seventy copies of `v === undefined ? true : !!v` with the master check
// in front -- and the copies drifted: some tolerate the strings external
// tools write ("true" / "false"), most do not; a read that throws falls
// back to the default in some and to `false` in others. The table kept
// each of those answers exactly (test/prefs-getters.spec.js recorded every
// getter for every value of every pref it reads on 0.22.2-dev.50); since
// prefs.4 a read that throws answers the row's DEFAULT everywhere (MJT
// 2026-10-17, "Ok to fix as you suggest": 18 rows answered false).
//
// A row:
//   def      the answer while the pref is unset (and the value Weavero
//            registers on Zotero's default branch, where it does);
//   masters  getters that must all answer true first (the section master,
//            a sub-master, a parent feature) -- checked in order, before
//            the pref is read, exactly as the getters did;
//   strings  a stored STRING reads as "anything but 'false'" (the
//            title-bar family: tools write "true" / "false"), otherwise
//            `!!value`;
//   win      Windows only (false elsewhere, before anything is read);
//   gate     pref KEYS that switch the FEATURE off where it runs, beyond
//            the getter's own masters (the getter answers the stored
//            choice; the code using it checks these first). Settings
//            greys a box under exactly masters + gate, closed
//            transitively: test/prefs-gates.spec.js holds them together.
//   devOnly  a feature still in testing: its default is ON on a build whose
//            version has a pre-release suffix ("1.3.0-dev.91",
//            "1.3.0-peoplenet.1") and OFF on a release ("1.3.0"); `def`
//            is not read. The user's own setting wins either way.
//   betaOff  with devOnly: OFF on a public beta too ("1.3.0-beta.1"), ON on
//            the other pre-releases (MJT 2026-11-28, the 1.3.0-beta.1 showcase:
//            the saved-search folders trial stays off in it).
//
// Getters keep their names (call sites unchanged); each body is now
// `return this._wvPref("<key>")`. Enum / string prefs (ctrlClickSplit,
// windowTitleNameMode) and the derived answers (_wvMultiMainOn, the icon
// mode's delegates, _tagsColumnWidth) stay hand-written.

import { WV_PREF_OBSERVERS, WvPrefObserver } from "./prefs-observers";
import { URL_SCHEMES } from "./url";
import { wvScopePinPrefKeys } from "../lib/pane-scope-defaults";

declare const Zotero: any;
declare const Services: any;

export interface WvPrefRow {
    def: boolean;
    masters?: string[];
    strings?: boolean;
    win?: boolean;
    gate?: string[];
    devOnly?: boolean;
    betaOff?: boolean;
}

/** A pre-release build: its version carries a suffix after a "-"
 *  ("1.3.0-dev.91", "1.3.0-peoplenet.1"). An unknown version is a release. */
export function wvIsPrerelease(version: any): boolean {
    return typeof version === "string" && version.trim().includes("-");
}

/** A public beta ("1.3.0-beta.1"): the pre-release testers install. */
export function wvIsBeta(version: any): boolean {
    return typeof version === "string" && /-beta\.\d+$/.test(version.trim());
}

const LR = "_getEnableLinksAndRelations";
const VE = "_getEnableVisualExtras";
const BM = "_getEnableBookmarks";
const FI = "_getEnableFilters";
const TW = "_getTabsAndWindowsMaster";
const REL = "_getEnableRelations";
const URI = "_getEnableUriUtilities";

/** The pref keys each master getter stands for (for the Settings parity
 *  spec): a row's masters, translated, plus its `gate`, closed through the
 *  rows of those keys. */
export const WV_MASTER_KEYS: Record<string, string[]> = {
    _getEnableLinksAndRelations: ["enableLinksAndRelations"],
    _getEnableVisualExtras: ["enableVisualExtras"],
    _getEnableBookmarks: ["enableBookmarks"],
    _getEnableFilters: ["enableFilters"],
    _getTabsAndWindowsMaster: ["enableTabsAndWindows"],
    _getEnableRelations: ["enableRelations"],
    _getEnableUriUtilities: ["enableUriUtilities"],
    _getEnableReaderBookmarks: ["enableReaderBookmarks"],
    _getEnableLibraryBookmarks: ["enableLibraryBookmarks"],
    _getEnableItemsTreeFilter: ["enableItemsTreeFilter"],
    _getCompactTitleBar: ["compactTitleBar"],
    _wvMultiMainOn: ["enableTabsAndWindows", "newMainWindow"],
    // An older Zotero's answer, which prefs.html states; on a Zotero with its
    // own windows Settings re-gates the two rows under the master alone
    // (data-wv-native-gate, prefs/index.ts bindNativeWindows).
    _wvAdvSearchWindowsOn: ["enableTabsAndWindows", "newMainWindow"],
};

/** Keyed by the pref name under `extensions.zotero.weavero.`. */
export const WV_PREFS: Record<string, WvPrefRow> = {
    // ---- section masters
    enableLinksAndRelations: { def: true },
    enableVisualExtras: { def: true },
    enableBookmarks: { def: true },
    enableFilters: { def: true },
    enableTabsAndWindows: { def: true, strings: true },

    // ---- Links & Relations: display mode and surfaces
    inlineLinks: { def: true },
    enableItemsList: { def: true, masters: [LR] },
    enableRightPane: { def: true, masters: [LR] },
    enableNotes: { def: true, masters: [LR] },
    enableNotesPane: { def: true, masters: [LR] },
    enableNotesList: { def: true, masters: [LR] },
    enableReaderSidebar: { def: true, masters: [LR] },
    enableReaderView: { def: true, masters: [LR] },
    enableReaderViewIcons: { def: true, masters: [LR] },
    enableCommentMarkdown: { def: true, masters: [LR] },
    enableInlineUrls: { def: true, masters: [LR] },
    enableAppLinks: { def: false, masters: [LR] },
    // URI utilities, relations
    enableUriUtilities: { def: true, masters: [LR] },
    enableCopyItemLink: { def: true, masters: [URI] },
    enableCopyCollectionLink: { def: true, masters: [URI] },
    enableRelations: { def: true, masters: [LR] },
    enableAddRelatedMenu: { def: true, masters: [REL] },
    enableChainBadge: { def: true, masters: [REL] },
    enableOpenRelatedSubmenu: { def: true, masters: [REL] },
    enableLibrariesHighlight: { def: true, masters: [REL] },
    // Backlinks (issue #60): the item-pane section + the Has Backlinks chip.
    enableBacklinks: { def: true, masters: [REL] },
    // Links (2026-10-27): the item-pane section of outgoing references.
    enableLinks: { def: true, masters: [REL] },
    // The counts, filters and children's lists Weavero adds to Zotero's own
    // Tags and Related sections (pane-scope.ts _wvScopeOn; MJT 2026-11-03,
    // "users who don't like it can disable it"). Item Links and Backlinks
    // keep theirs: their sections' own switches.
    enableTagsRelatedScope: { def: true, masters: [REL] },
    // References in your library (refs.ts, branch refs, 2026-11-18): Zotero's
    // citation popup marks the references you have and opens them; on by
    // default on the branch (the release default is MJT's call). Its two
    // parts under it: marks beside the reference list's entries, and a
    // References section in the reader's item pane.
    enableReferences: { def: true, masters: [REL] },
    referencesBibliographyMarks: { def: true, masters: [REL], gate: ["enableReferences"] },
    referencesSection: { def: true, masters: [REL], gate: ["enableReferences"] },
    // Cited by (cited-by.ts, branch citedby, 2026-11-20): the item pane's
    // "Cited by" section -- the papers of your libraries whose reference lists
    // cite the item -- and the background index behind it. Part of References
    // (the same matcher and library index).
    referencesCitedBy: { def: true, masters: [REL], gate: ["enableReferences"] },
    // Build Zotero's structure data for all PDFs (sdt-build.ts, citations M5; MJT
    // 2026-11-21: "The option should be off by default"). Settings turns it on only
    // after its warning (no native binding); Pause / Resume is the second pref.
    referencesBuildStructure: { def: false, masters: [REL], gate: ["enableReferences"] },
    referencesBuildStructurePaused: { def: false, masters: [REL], gate: ["enableReferences"] },
    // What the item pane's Tags, Related, Links and Backlinks sections show
    // in a new window and after a restart (pane-scope.ts _wvScopeFilterFor):
    // per level -- the item itself, its attachments, notes, annotations, and
    // Links' / Backlinks' internal links -- checked = shown. The header's
    // counts filter each window from there, as the items list's funnel does
    // (MJT 2026-10-30: "I should be able to decide in the settings what is
    // the default for new windows and after restart"). The defaults are the
    // header button's before dev.112: Tags, Related and Backlinks the item
    // itself only; Links its notes' and annotations'.
    "paneScope.tags.own": { def: true, masters: [REL] },
    "paneScope.tags.att": { def: false, masters: [REL] },
    "paneScope.tags.note": { def: false, masters: [REL] },
    "paneScope.tags.ann": { def: false, masters: [REL] },
    "paneScope.related.own": { def: true, masters: [REL] },
    "paneScope.related.att": { def: false, masters: [REL] },
    "paneScope.related.note": { def: false, masters: [REL] },
    "paneScope.related.ann": { def: false, masters: [REL] },
    "paneScope.links.note": { def: true, masters: [REL] },
    "paneScope.links.ann": { def: true, masters: [REL] },
    "paneScope.links.loop": { def: true, masters: [REL] },
    // Shown by default (MJT 2026-10-30, "Always show broken links. The square
    // barred is too flashy to be the default"; hidden in dev.121-127).
    "paneScope.links.broken": { def: true, masters: [REL] },
    "paneScope.backlinks.own": { def: true, masters: [REL] },
    "paneScope.backlinks.att": { def: false, masters: [REL] },
    "paneScope.backlinks.note": { def: false, masters: [REL] },
    "paneScope.backlinks.ann": { def: false, masters: [REL] },
    "paneScope.backlinks.loop": { def: true, masters: [REL] },
    // Item Links' and Backlinks' two kinds of reference, Zotero links and
    // note citations: both checked or none, no filter; one alone, only those
    // (MJT 2026-11-02, "The new additions are missing from here").
    "paneScope.links.zlinks": { def: true, masters: [REL] },
    "paneScope.links.citations": { def: true, masters: [REL] },
    "paneScope.backlinks.zlinks": { def: true, masters: [REL] },
    "paneScope.backlinks.citations": { def: true, masters: [REL] },

    // ---- Extras (Visual extras)
    enableAnnotationAddedBy: { def: true, masters: [VE] },
    enableAddedByColors: { def: true, masters: [VE] },
    enableRelatedColumn: { def: true, masters: [VE] },
    enableBacklinksColumn: { def: true, masters: [VE] },
    enableLinksColumn: { def: true, masters: [VE] },
    enableExtLinksColumn: { def: true, masters: [VE] },
    enableOpenExternalViewer: { def: true, masters: [VE] },
    enablePluginsSearch: { def: true, masters: [VE] },
    enableAnnotationsCountColumn: { def: true, masters: [VE] },
    selectedTabRing: { def: true, masters: [VE] },
    enableGroupLibraryGlyph: { def: true, masters: [VE] },
    collectionsStickyParents: { def: true, masters: [VE] },
    // Folders for saved searches, kept by Weavero (search-folders.ts, 2026-11-27): a
    // trial (MJT, "As a test to see if I will keep this solution later"), on in
    // pre-release builds only -- not in a public beta (betaOff, MJT 2026-11-28).
    collectionsSearchFolders: { def: true, devOnly: true, betaOff: true, masters: [VE] },
    collectionsSearchFoldersNames: { def: true, devOnly: true, masters: [VE], gate: ["collectionsSearchFolders"] },
    // The Bookmarks pane above the collections tree (bookmarks-pane.ts, MJT 2026-11-27): a
    // trial beside the saved-search folders, on in pre-release builds only. It shows the
    // library bookmarks, so their switch gates it too.
    collectionsBookmarksPane: { def: true, devOnly: true, masters: [VE], gate: ["enableLibraryBookmarks"] },
    // The funnel above the collections pane (coll-funnel.ts, MJT 2026-11-27): a trial beside
    // the folders and the Bookmarks pane, on in pre-release builds only.
    collectionsFunnel: { def: true, devOnly: true, masters: [VE] },
    // Its default's Settings boxes, "Shown by default" (kept in step with the JSON
    // `collFunnelDefault` both ways, coll-funnel.ts _wvCfSetDefault / _wvCfSyncDefaultFromPrefs):
    // a section's box is greyed with its own trial too.
    collFunnelShowCollections: { def: true, gate: ["collectionsFunnel"] },
    collFunnelShowSearches: { def: true, gate: ["collectionsFunnel"] },
    collFunnelShowFeeds: { def: true, gate: ["collectionsFunnel"] },
    collFunnelShowSpecial: { def: true, gate: ["collectionsFunnel"] },
    collFunnelShowBookmarks: { def: true, gate: ["collectionsFunnel", "collectionsBookmarksPane"] },
    collFunnelShowFolders: { def: true, gate: ["collectionsFunnel", "collectionsSearchFolders"] },
    collectionsPathTooltip: { def: true, masters: [VE] },
    collectionsIndentGuides: { def: true, masters: [VE] },
    collectionsPaneToggle: { def: true, masters: [VE] },
    readerLayoutMenu: { def: true, masters: [VE] },
    tagSelectorHandle: { def: true, masters: [VE] },
    paneDragNoCollapse: { def: true, masters: [VE] },
    enableTagsCountAuto: { def: true, masters: [VE] },
    // Pinned section headers in the item pane (pane.ts, 2026-11-03).
    itemPaneStickyHeaders: { def: true, masters: [VE] },
    // The Group Libraries line folded in the collections pane (group-fold.ts,
    // MJT 2026-11-22): what a tree takes when it is built -- a new window, a
    // new library tab, a restart --, as Zotero's own open rows
    // (`sourceList.persist`, one pref for every window). Not a setting: the
    // twisty writes it; Extras switches the fold off.
    groupLibrariesCollapsed: { def: false, gate: ["enableVisualExtras"] },

    // ---- Bookmarks
    enableLibraryBookmarks: { def: true, masters: [BM] },
    enableReaderBookmarks: { def: true, masters: [BM] },
    autoHideEmptyReaderBookmarks: { def: false, masters: ["_getEnableReaderBookmarks"] },
    autoHideEmptyLibraryBookmarks: { def: false, masters: ["_getEnableLibraryBookmarks"] },
    // The Library scope tab lives in the reader Bookmarks tab (prefs.4).
    showLibraryBookmarksInReader: { def: true, masters: ["_getEnableReaderBookmarks"] },

    // ---- Filters (and the reader annotations pane they cascade into)
    enableItemsTreeFilter: { def: true, masters: [FI] },
    enableAnnSort: { def: true, masters: [FI] },
    enableReadStatusFilter: { def: true, masters: ["_getEnableItemsTreeFilter"] },
    enableSelectionTarget: { def: true, masters: [FI] },
    enableTabsLibraryFilter: { def: true, masters: [FI] },
    enableTabsFileTypeFilter: { def: true, masters: [FI] },
    // The reader annotations pane: one switch for all of it,
    // _wvAnnPaneEnabled -> Extras (prefs.4; Sort & Filters before).
    // The funnel above the reader has its own box beside the pane's
    // (MJT 2026-11-24, "separate settings options for each funnel").
    enableReaderAnnFilter: { def: true, gate: ["enableVisualExtras"] },
    enableAnnPaneFilter: { def: true, gate: ["enableVisualExtras"] },
    hideNativeAnnSelector: { def: false },
    annSelectorHidden: { def: false },
    annSelectorHandle: { def: true, gate: ["enableVisualExtras"] },
    annListShowHighlight: { def: true, gate: ["enableVisualExtras"] },
    annListShowUnderline: { def: true, gate: ["enableVisualExtras"] },
    annListShowNote: { def: true, gate: ["enableVisualExtras"] },
    annListShowImage: { def: true, gate: ["enableVisualExtras"] },
    annListShowInk: { def: true, gate: ["enableVisualExtras"] },
    annListShowText: { def: true, gate: ["enableVisualExtras"] },

    // ---- Reader. The outline options and the undo arrows sit under
    // Settings -> Extras and are greyed with it, so Extras switches them
    // off too (prefs.4, MJT 2026-10-17; they ignored it before).
    enableOutlineTextHighlight: { def: true, masters: [VE] },
    outlinePageNumbers: { def: true, masters: [VE] },
    // Labels in the reader Bookmarks tab (prefs.4: greyed with it).
    bookmarkPageNumbers: { def: true, masters: ["_getEnableReaderBookmarks"] },
    readerOutlineTakeover: { def: true },
    recolorAmLinks: { def: true },
    // A link preview tints the whole reference entry, lightly, in place of
    // Zotero's dark box on its first line (preview-highlight.ts; MJT
    // 2026-11-17). Off: Zotero's picture as it is.
    previewEntryHighlight: { def: true, masters: [VE] },

    // ---- Notes (2026-11-03): the outline beside every note editor and
    // the heading fold arrows. Settings -> Extras greys them; they live in
    // the editors Weavero wires only under Links & Relations -> Notes:
    // Editor, so that switch gates them too.
    noteOutline: { def: true, masters: [VE], gate: ["enableNotes"] },
    noteFolding: { def: true, masters: [VE], gate: ["enableNotes"] },
    // The citation entries of a note's menu (note-cite.ts, 2026-11-09).
    noteLinkCitations: { def: true, masters: [VE], gate: ["enableNotes"] },

    // ---- Tabs & Windows
    compactTitleBar: { def: true, masters: [TW], strings: true },
    compactTitleBarMain: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarReader: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarNote: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarPluginsManager: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    noteOpenInDeckWindow: { def: true, strings: true, gate: ["compactTitleBarReader"] },
    newMainWindow: { def: true, strings: true, gate: ["enableTabsAndWindows"] },
    advSearchShortcutNewWindow: { def: true, masters: ["_wvAdvSearchWindowsOn"] },
    advSearchWindowHidePanes: { def: true, gate: ["newMainWindow"] },
    enableTabGroups: { def: true, masters: [TW] },
    // Split view: two tabs side by side (tab-split.ts; MJT 2026-11-10).
    enableSplitView: { def: true, masters: [TW] },
    windowTitleGlyphs: { def: false, masters: [TW] },
    windowIcons: { def: true, masters: [TW], win: true },
    separateTaskbarButtons: { def: false, masters: [TW], win: true },
    // Zotero's progress window (Find Full Text, Retrieve Metadata) as a normal window with
    // minimize and maximize, its Minimize button minimizing (progress-window.ts; MJT
    // 2026-11-26). Read at each open and each click: no observer.
    progressWindowButtons: { def: true, masters: [TW] },

    // ---- Feeds (feeds.ts, branch feeds, MJT 2026-11-22): relevance in Zotero's
    // Feeds -- the Relevance column and its sort, Why relevant, the in-library
    // mark and chip; the journals signal under it.
    enableFeeds: { def: true },
    feedsJournals: { def: true, gate: ["enableFeeds"] },

    // ---- People (people.ts, branch people, MJT 2026-11-22: "Start, cards
    // first"): the person button on the item pane's author rows, their
    // right-click entries, the card, Add as Person, Refresh. In testing (MJT
    // 2026-11-25: "keep that people part in testing for a while before
    // releasing"): on by default in pre-release builds only.
    // Guard: test/people-gate.spec.js.
    enablePeople: { def: true, devOnly: true },
    // The Researchers button in the collections pane's toolbar (people-toolbar.ts;
    // MJT 2026-11-27). Off from the button's own right-click (Hide Researchers
    // Button); Settings brings it back. Guard: test/people-toolbar-button.spec.js.
    peopleToolbarButton: { def: true, gate: ["enablePeople"] },
    // ---- Backups (backups.ts, branch backups, MJT 2026-11-22): the daily backup
    // and the one before each Weavero update. Back Up Now, Restore, Export and
    // Import work whatever it says.
    "backup.auto": { def: true },

    // ---- hidden
    debug: { def: false },

    // ---- registered here, read elsewhere (no `_get*` getter): the table is
    // also the one list of boolean DEFAULTS (_wvRegisterDefaultPrefs).
    enableZoteroLinks: { def: true, gate: ["enableLinksAndRelations"] },
    previewLinkZones: { def: true },
    enableAppLinksSkipConfirm: { def: false, gate: ["enableAppLinks"] },
    // file:// links to another computer: off = refused; on = each link asks
    // once (url.ts _wvOpenRemoteFileLink; MJT 2026-11-23). Under the file
    // scheme's own switch.
    remoteFileLinks: { def: false, gate: ["enableFileScheme"] },
    enableTabSessions: { def: true, gate: ["enableTabsAndWindows"] },
    sessionAutoReopen: { def: true, gate: ["newMainWindow"] },
    sessionSortReverse: { def: false },
    readerItemPane: { def: true, gate: ["enableTabsAndWindows"] },
    // A pinned library tab shows its name beside its icon, as wide as the
    // name needs (tabs.ts `_wvSyncPinnedMirrors`; MJT 2026-11-21: Zotero 11's
    // icon-only pinned My Library tab was harder to find). Off: icon only.
    pinnedLibraryTabName: { def: true, gate: ["enableTabsAndWindows"] },
    // The split view's corner label on a side whose item pane is closed
    // (tab-split.ts; MJT 2026-11-12).
    splitViewFooter: { def: true, gate: ["enableSplitView"] },
    // A split made by "Open PDF in Split View" follows the library's selected
    // item from the start (tab-split-follow.ts; MJT 2026-11-14). Off: a split
    // follows only once its own menu says so.
    splitViewFollow: { def: false, gate: ["enableSplitView"] },
    readerUndoButtons: { def: true, gate: ["enableVisualExtras"] },
    enableDefaultChild: { def: true },
    defattSortFirstDefault: { def: true },
    defattSortFirstAuto: { def: true },
    defattMarkAuto: { def: true },
    filterBuildMode: { def: true },
    itemCountBreakdown: { def: true, gate: ["enableFilters"] },
    collapseAdvancedToQuickSearch: { def: true, gate: ["enableFilters"] },
    annCardDateAdded: { def: false, gate: ["enableAnnSort"] },
    annCardDateModified: { def: false, gate: ["enableAnnSort"] },
};

// The optional URL schemes (url.ts's URL_SCHEMES): off by default, read by
// the link pattern only while App links is on (url.ts), so App links -- and
// through it Links & Relations -- gate them, as Settings greys them.
for (const d of URL_SCHEMES as any[]) WV_PREFS[d.pref] = { def: false, gate: ["enableAppLinks"] };

// The item pane sections' pinned toggles, a `paneScope.<kind>.pin.<cell>`
// under each default box (MJT 2026-11-02, "the settings could decide which
// toggle is pinned, as well as what is the default"): a cell checked here
// is drawn in its section's header on every item, at 0 too (pane-scope.ts
// _wvScopePinned); the cells the default row puts in a non-neutral state
// are pinned whatever these say. All off by default.
for (const k of wvScopePinPrefKeys()) WV_PREFS["paneScope." + k] = { def: false, masters: [REL] };

/** String and number defaults, registered beside the booleans. */
export const WV_PREF_VALUES: Record<string, string | number> = {
    // Ctrl/Cmd+click split orientation when no split is open yet.
    ctrlClickSplit: "horizontal",
    // Annotations-pane default filter (issue #43), JSON; "" = show everything.
    annPaneDefault: "",
    // The collections funnel's default (coll-funnel.ts), JSON as the panel's chips stood
    // ({kinds, libs, secs}: {inc, exc}); "" = the Settings boxes alone (everything shown).
    collFunnelDefault: "",
    // Window name in the title: "off" | "prefix" | "replace".
    windowTitleNameMode: "off",
    // Where a library bookmark leaves its collections-tree row (issue #45).
    bookmarkCollectionScroll: "top",
    // Reader outline text size (issue #47): "zotero" or a px size.
    outlineTextSize: "zotero",
    // Outline keyboard shortcuts (issue #51): none bound by default.
    "outlineKey.selection": "",
    "outlineKey.pin": "",
    "outlineKey.anchorTop": "",
    "outlineKey.anchorBottom": "",
    // Saved-session list order: "created" | "name" | "lastUsed".
    sessionSort: "created",
    // Pinned parents in the collections tree: at most this many levels.
    collectionsStickyMax: 7,
    // Titles in the items list: "off" (Zotero's one line) | "fixed" | "adaptive".
    titleLinesMode: "off",
    // Lines of a title: 2 to 10 (title-lines.ts clamps a stored value).
    titleLinesCount: 2,
    // The long item-pane lists' sort, the one chosen last per section (list-filter.ts,
    // citations M4): "paper" or "<field>:<dir>" -- year, cited, title, author, added;
    // asc / desc -- as written since 1.2.1-lfsort.1; an older one-word value
    // ("newest", "oldest", "cited", "title", "author", "added") is read as what it
    // meant (lib/list-filter.ts wvLfSortParse). The defaults stay in that form.
    "listSort.references": "paper",
    "listSort.citedBy": "newest",
    // The item-pane sections locked at the bottom, per view (pane-lock.ts; MJT
    // 2026-11-22, several since 1.2.1-panelock.2): a JSON list of pane ids --
    // Weavero's own sections by their bare id. The feeds start with Why
    // relevant (feeds.ts SEC_PANE_ID), the library and the readers with none.
    "paneLock.library": "[]",
    "paneLock.feed": "[\"weavero-feeds\"]",
    "paneLock.reader": "[]",
    // The locked sections' heights, by pane id (px), JSON; a section without
    // one takes pane-lock.ts PL_DEF_H.
    "paneLock.heights": "{}",
    // The daily backups kept, 1 to 60 (lib/backup.ts wvBkKeepDaily clamps a
    // stored value).
    "backup.keepDaily": 7,
    // The file:// links to another computer the user opened (remoteFileLinks
    // on), a JSON list of their keys, oldest first; "" = none.
    remoteFileLinksOpened: "",
    // The file:// links to a file on this computer the user opened after
    // Weavero's question (no system handler for file links, url.ts
    // _wvOpenLocalFileLink; 1.2.3), a JSON list of their paths; "" = none.
    localFileLinksOpened: "",
    // The Researchers tab (people.ts, branch people3, MJT 2026-11-24): the list's
    // sort (lib/people-list.ts WV_PP_SORTS; unused since the table, people-table.ts,
    // sorts by its column titles), its view ("all" | "check" | "followed"), its
    // filters that are on (JSON, wvPpFiltersParse) -- the ones chosen last, a new
    // view starts from them --, the table's columns (JSON per column: width,
    // ordinal, sortDirection, and shown once the user showed or hid it;
    // people-table.ts wvPpColsParse; "{}" = the automatic rule, Name A to Z), and
    // how each place writes a name: "last" ("Last, First") or "first" ("First Last").
    "people.sort": "last",
    "people.show": "all",
    "people.filters": "{}",
    "people.columns": "{}",
    // The right pane's width and whether it is collapsed (JSON {w, c};
    // people-pane.ts wvPpPaneParse; "{}" = 320 px, open).
    "people.pane": "{}",
    "people.names.list": "last",
    "people.names.title": "last",
    "people.names.links": "last",
    "people.names.tree": "last",
};

class _PrefsTableMixin {
    /** The table, for the specs. */
    _wvPrefsTable(): Record<string, WvPrefRow> { return WV_PREFS; }

    /** Every master pref KEY that switches `key`'s feature off: its row's
     *  masters (translated) and gate, closed through their own rows. For
     *  test/prefs-gates.spec.js; [] for a key without a row. */
    _wvPrefGateKeys(key: string): string[] {
        const out = new Set<string>();
        const walk = (k: string) => {
            const row = WV_PREFS[k];
            if (!row) return;
            const direct: string[] = [];
            for (const m of row.masters || []) direct.push(...(WV_MASTER_KEYS[m] || ["?" + m]));
            direct.push(...(row.gate || []));
            for (const d of direct) {
                if (out.has(d)) continue;
                out.add(d);
                walk(d);
            }
        };
        walk(key);
        return [...out].sort();
    }

    /** The pref observer's dispatch table, for the specs. */
    _wvPrefObservers(): WvPrefObserver[] { return WV_PREF_OBSERVERS; }

    /** Register every default the tables declare on Zotero's default
     *  branch. Per-pref guards: setBoolPref can throw NS_ERROR_UNEXPECTED (a
     *  name cleared earlier in the same session cannot be re-created until
     *  the pref service reloads), and one throw must not skip the rest
     *  (2026-08-24: one bad name left the string defaults unregistered).
     *  `version`: the defaults another build would register (the specs; see
     *  _wvPrefDefault). */
    _wvRegisterTableDefaults(version?: any) {
        const branch = Services.prefs.getDefaultBranch("extensions.zotero.weavero.");
        const note = (k: string, e: any) => Zotero.debug("[Weavero] default pref " + k + ": " + e);
        for (const k of Object.keys(WV_PREFS)) {
            try { branch.setBoolPref(k, this._wvPrefDefault(k, version)); } catch (e) { note(k, e); }
        }
        for (const k of Object.keys(WV_PREF_VALUES)) {
            const v = WV_PREF_VALUES[k];
            try {
                if (typeof v === "number") branch.setIntPref(k, v);
                else branch.setCharPref(k, v);
            } catch (e) { note(k, e); }
        }
    }

    /** A boolean pref's answer by its table row: platform, masters in
     *  order, then the stored value (unset = the row's default). An
     *  unknown key is a programming error and answers false. */
    _wvPref(key: string): boolean {
        const row = WV_PREFS[key];
        if (!row) { Zotero.debug("[Weavero] _wvPref: no table row for " + key); return false; }
        if (row.win && !Zotero.isWin) return false;
        for (const m of row.masters || []) {
            if (!(this as any)[m]()) return false;
        }
        try {
            const v = Zotero.Prefs.get("weavero." + key);
            if (v === undefined) return this._wvPrefDefault(key);
            if (row.strings && typeof v === "string") return v.toLowerCase() !== "false";
            return !!v;
        } catch (e) {
            return this._wvPrefDefault(key);
        }
    }

    /** A boolean pref's default: the row's, or -- a `devOnly` row -- whether
     *  this build is a pre-release (the version onStartup gave). `version`
     *  stands in for another build's (test/people-gate.spec.js): the specs
     *  must not change `_version` itself, which is part of the wire tag
     *  (_wvWireTag). A spec that did, for a moment, let a collections-tree
     *  refresh in that moment re-wrap under another tag, and the search
     *  folders' twisty layer was dropped for good (dev.99 triage, 2026-11-27). */
    _wvPrefDefault(key: string, version?: any): boolean {
        const row = WV_PREFS[key];
        if (!row) return false;
        if (!row.devOnly) return row.def;
        const v = version !== undefined ? version : (this as any)._version;
        return wvIsPrerelease(v) && !(row.betaOff && wvIsBeta(v));
    }

    /** wvIsPrerelease, for the specs. */
    _wvIsPrerelease(version: any): boolean { return wvIsPrerelease(version); }
}

const _prefsTableDescriptors = Object.getOwnPropertyDescriptors(_PrefsTableMixin.prototype);
delete (_prefsTableDescriptors as any).constructor;
export const prefsTableMethods = _prefsTableDescriptors;
