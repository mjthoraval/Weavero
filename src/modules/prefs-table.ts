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
//
// Getters keep their names (call sites unchanged); each body is now
// `return this._wvPref("<key>")`. Enum / string prefs (ctrlClickSplit,
// windowTitleNameMode) and the derived answers (_wvMultiMainOn, the icon
// mode's delegates, _tagsColumnWidth) stay hand-written.

import { WV_PREF_OBSERVERS, WvPrefObserver } from "./prefs-observers";
import { URL_SCHEMES } from "./url";

declare const Zotero: any;
declare const Services: any;

export interface WvPrefRow {
    def: boolean;
    masters?: string[];
    strings?: boolean;
    win?: boolean;
    gate?: string[];
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

    // ---- Extras (Visual extras)
    enableAnnotationAddedBy: { def: true, masters: [VE] },
    enableAddedByColors: { def: true, masters: [VE] },
    enableRelatedColumn: { def: true, masters: [VE] },
    enableOpenExternalViewer: { def: true, masters: [VE] },
    enablePluginsSearch: { def: true, masters: [VE] },
    enableAnnotationsCountColumn: { def: true, masters: [VE] },
    selectedTabRing: { def: true, masters: [VE] },
    enableGroupLibraryGlyph: { def: true, masters: [VE] },
    collectionsStickyParents: { def: true, masters: [VE] },
    collectionsPathTooltip: { def: true, masters: [VE] },
    collectionsIndentGuides: { def: true, masters: [VE] },
    collectionsPaneToggle: { def: true, masters: [VE] },
    readerLayoutMenu: { def: true, masters: [VE] },
    tagSelectorHandle: { def: true, masters: [VE] },
    paneDragNoCollapse: { def: true, masters: [VE] },
    enableTagsCountAuto: { def: true, masters: [VE] },

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

    // ---- Tabs & Windows
    compactTitleBar: { def: true, masters: [TW], strings: true },
    compactTitleBarMain: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarReader: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarNote: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    compactTitleBarPluginsManager: { def: true, masters: ["_getCompactTitleBar"], strings: true },
    noteOpenInDeckWindow: { def: true, strings: true, gate: ["compactTitleBarReader"] },
    newMainWindow: { def: true, strings: true, gate: ["enableTabsAndWindows"] },
    advSearchShortcutNewWindow: { def: true, masters: ["_wvMultiMainOn"] },
    advSearchWindowHidePanes: { def: true, gate: ["newMainWindow"] },
    enableTabGroups: { def: true, masters: [TW] },
    windowTitleGlyphs: { def: false, masters: [TW] },
    windowIcons: { def: true, masters: [TW], win: true },
    separateTaskbarButtons: { def: false, masters: [TW], win: true },

    // ---- hidden
    debug: { def: false },

    // ---- registered here, read elsewhere (no `_get*` getter): the table is
    // also the one list of boolean DEFAULTS (_wvRegisterDefaultPrefs).
    enableZoteroLinks: { def: true, gate: ["enableLinksAndRelations"] },
    previewLinkZones: { def: true },
    enableAppLinksSkipConfirm: { def: false, gate: ["enableAppLinks"] },
    enableTabSessions: { def: true, gate: ["enableTabsAndWindows"] },
    sessionAutoReopen: { def: true, gate: ["newMainWindow"] },
    sessionSortReverse: { def: false },
    readerItemPane: { def: true, gate: ["enableTabsAndWindows"] },
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

/** String and number defaults, registered beside the booleans. */
export const WV_PREF_VALUES: Record<string, string | number> = {
    // Ctrl/Cmd+click split orientation when no split is open yet.
    ctrlClickSplit: "horizontal",
    // Annotations-pane default filter (issue #43), JSON; "" = show everything.
    annPaneDefault: "",
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
     *  (2026-08-24: one bad name left the string defaults unregistered). */
    _wvRegisterTableDefaults() {
        const branch = Services.prefs.getDefaultBranch("extensions.zotero.weavero.");
        const note = (k: string, e: any) => Zotero.debug("[Weavero] default pref " + k + ": " + e);
        for (const k of Object.keys(WV_PREFS)) {
            try { branch.setBoolPref(k, WV_PREFS[k].def); } catch (e) { note(k, e); }
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
            if (v === undefined) return row.def;
            if (row.strings && typeof v === "string") return v.toLowerCase() !== "false";
            return !!v;
        } catch (e) {
            return row.def;
        }
    }
}

const _prefsTableDescriptors = Object.getOwnPropertyDescriptors(_PrefsTableMixin.prototype);
delete (_prefsTableDescriptors as any).constructor;
export const prefsTableMethods = _prefsTableDescriptors;
