// Module: items-tree filter pane — the largest module by line
// count and by method count.
//
// Provides:
// - Filter constants (_ANNOTATION_COLORS, _ANNOTATION_TYPES,
//   _ATTACHMENT_FILE_TYPES) declared as instance fields.
// - Filter group state machine (_emptyFilterGroup, _isGroupActive,
//   _isFilterActive, _activeGroup) and per-row predicates
//   (_rowPassesFilters, _rowPassesGlobalFilters, _rowIsPrimary,
//   _rowSatisfiesTreeJoin, _rowKindOf, _kindOK,
//   _rowHasOwnKindMatch).
// - Items-tree integration: filter-aware patching of the row
//   provider (_pauseFilterPatches, _patchIsSelectable,
//   _setupItemsListFilter, _teardownItemsListFilter,
//   _applyItemsListFilter / _applyItemsListFilterInner,
//   _reapplyFilterSync, _partialCollapseOnFilterClear).
// - Filter bar + popup UI (_renderFilterBar, _clearAllFilters,
//   _buildFilterChip, _buildColorChip, _buildTypeChip,
//   _buildHasCommentChip, _buildHasRelatedChip, _buildHasLinkChip,
//   _buildHasTagChip, _buildItemNoteChip, _buildStandaloneNoteChip,
//   _buildHasFieldChip, _buildPublicationChip, _buildTagChip,
//   _buildAuthorChip, _buildItemTypeChip,
//   _buildAttachmentFileTypeChip, _buildAddedByChip,
//   _toggleIncludeExclude, _wireFilterBoxFocus,
//   _renderFilterPanelContents, _openFilterPanel,
//   _renderUnifiedSearchSection, _renderItemTypeRow,
//   _renderColorSection, _renderTypeSection,
//   _renderCrossLevelSection, _openCrossLevelScopePopup,
//   _renderBoolKindIconSection, _renderItemNoteSection,
//   _renderStandaloneNoteSection, _renderParentHasFieldsSection,
//   _renderHasAnnotationsSection, _renderHasCommentSection,
//   _makeHasCommentSvg, _renderTagSection, _renderAuthorSection,
//   _renderAttachmentFileTypeSection, _renderCollectionSection,
//   _renderSavedSearchSection, _renderAddedBySection,
//   _hasMatchingAnnotation).
// - Per-user added-by helpers (_getAnnotationAuthor,
//   _getItemAddedBy, _appendAddedByBadge*, _colorForUser,
//   _withAlpha, _ensureAnnotationRowPatched,
//   _unpatchAnnotationRow, _getItemAuthors).
// - Cross-level scope helpers (_itemHasLinks, _hasLinkScopeKeyOf).
// - Group/scope utility (_getEnclosingRegularItem,
//   _pruneEmptyGroups, _openFilterPanelForGroup).
//
// Mixed onto WeaveroPlugin.prototype from src/index.ts via
// defineProperties.

import { winOf, wvPopupHost } from "../lib/dom";
import { URL_SCHEMES } from "./url";
import {
    BTN_CLASS, BTN_TREE_CLASS, BTN_PANE_CLASS, BTN_POPUP_CLASS,
    BOOKMARK_PATH, WV_FUNNEL_PATH,
} from "./constants";

// Module-level data backing the three "constants" the filter
// methods used to expose as instance class fields. The mixin
// pattern strips field initializers (those only fire in the
// host class's constructor — see the constructor in core for
// fields like _filterState that DO get initialized per-instance),
// so these live as module-private consts and are exposed via
// getters on the mixin prototype.

// The same 8 highlight-and-friends colours Zotero ships in
// `ANNOTATION_COLORS` (reader/src/common/defines.js), plus
// Black from `EXTRA_INK_AND_TEXT_COLORS` — upstream restricts
// Black to ink/text annotations, but those exist in the wild,
// so we need to be able to filter on it.
// Routine verbose log — only emitted when the `weavero.debug` pref is on
// (the prefs "Debug" toggle). Module-scoped (not `this`-bound) so it works
// inside patched row-provider methods / callbacks where `this` is not the
// plugin. Error / `catch` paths keep Zotero.debug() so they always surface.
function dbg(...args: any[]) {
    try { if (Zotero.Prefs.get("weavero.debug")) (Zotero.debug as any)(...args); } catch (_) {}
}

// PubMed identifiers live in the Extra field by Zotero convention
// ("PMID: 123456" / "PMCID: PMC123456" — the PubMed translator's
// format). Shared by the Has PMID / Has PMCID filters.
const WV_PMID_RE = /^\s*PMID:\s*\d+/mi;
const WV_PMCID_RE = /^\s*PMCID:\s*PMC\d+/mi;
function wvExtraHasId(item: any, re: RegExp): boolean {
    try {
        const extra = item && item.getField ? String(item.getField("extra") || "") : "";
        return re.test(extra);
    } catch (e) { return false; }
}
// PMID/PMCID are dedicated fields since Zotero 9 (see the acknowledgment
// in pane.ts's identifier columns; forum 132715 + zotero/zotero#5831):
// check the field first, then the legacy Extra line.
// Derived-fields layer, filter side (2026-08-06): per-item facets that
// are pure functions of the item's fields (read status, PMID/PMCID
// presence) reside in this module-level map instead of being re-derived
// per row per apply (regex over Extra each time). Evicted PER-ID by
// _wvWireFilterCacheInvalidator (same module closure); the map dies with
// the module on plugin reload, so no cross-instance staleness.
// Per-apply resolved context for the getChildItems wrapper's hot path
// (phase 2 of the filter perf work, 2026-08-06). That wrapper runs ONCE
// PER OPENED CONTAINER — 7 024 calls in one measured attPDF apply — and
// was re-reading a pref and calling Zotero.getMainWindow() (a window-
// mediator lookup) on every call, twice when no quick search is active,
// only to conclude "nothing to filter". Measured: 990ms of a 1598ms
// build-mode pass1. An expansion pass resolves the state once, parks it
// here, and clears it in its finally; outside an expansion the wrapper
// keeps its original self-resolving path.
let WV_GCI_CTX: { showCtxAtt: boolean, liveSM: boolean,
    liveSIDs: any, liveParents: any } | null = null;
const WV_FACETS: Map<number, { rs?: string, pmid?: boolean, pmcid?: boolean }> = new Map();
function wvFacetEntry(id: number) {
    let e = WV_FACETS.get(id);
    if (!e) { e = {}; WV_FACETS.set(id, e); }
    return e;
}
function wvEvictFacets(ids: any[]) {
    try {
        for (const raw of (ids || [])) {
            const iid = typeof raw === "number"
                ? raw
                : parseInt(String(raw).split("-")[0], 10);
            if (!isNaN(iid)) WV_FACETS.delete(iid);
        }
    } catch (e) { WV_FACETS.clear(); }
}
// "Has Attachment File" means FILES, as the tile's tooltip says — a
// linked-URL child is an attachment item but not a file. The old
// `getAttachments().length > 0` counted it (caught 2026-08-06 by fixture
// WVT-09 on the first sweep of the test collection). Facet-cached like
// the other per-item derivations.
// hasURL / hasDOI measured as the heaviest parent predicates in the
// 2026-08-06 case-list sweep (~1s of pass2 = raw getField per row over
// 42k items). Facet-cached like the rest; per-id evicted on item events.
function wvItemFieldNonEmpty(item: any, field: string, key: string): boolean {
    try {
        const id = item && item.id;
        if (id != null) {
            const e: any = wvFacetEntry(id);
            if (e[key] !== undefined) return e[key];
        }
        const out = !!(item.getField
            && String(item.getField(field) || "").trim().length);
        if (id != null) (wvFacetEntry(id) as any)[key] = out;
        return out;
    } catch (e) { return false; }
}
function wvItemHasFileAttachment(item: any): boolean {
    try {
        const id = item && item.id;
        if (id != null) {
            const e: any = wvFacetEntry(id);
            if (e.hasFile !== undefined) return e.hasFile;
        }
        let out = false;
        const ids = (item.getAttachments && item.getAttachments()) || [];
        for (const aid of ids) {
            const a: any = Zotero.Items.get(aid);
            if (a && a.isFileAttachment && a.isFileAttachment()) { out = true; break; }
        }
        if (id != null) (wvFacetEntry(id) as any).hasFile = out;
        return out;
    } catch (e) { return false; }
}
function wvItemHasPubmedId(item: any, field: string, re: RegExp): boolean {
    try {
        const key = field === "PMID" ? "pmid" : "pmcid";
        const id = item && item.id;
        if (id != null) {
            const e: any = wvFacetEntry(id);
            if (e[key] !== undefined) return e[key];
        }
        let v = "";
        try { v = String(item.getField(field) || ""); } catch (e) {}
        const out = !!v.trim().length || wvExtraHasId(item, re);
        if (id != null) (wvFacetEntry(id) as any)[key] = out;
        return out;
    } catch (e) { return false; }
}

const _ANNOTATION_COLORS_DATA = [
    { value: "#ffd400", label: "Yellow" },
    { value: "#ff6666", label: "Red" },
    { value: "#5fb236", label: "Green" },
    { value: "#2ea8e5", label: "Blue" },
    { value: "#a28ae5", label: "Purple" },
    { value: "#e56eee", label: "Magenta" },
    { value: "#f19837", label: "Orange" },
    { value: "#aaaaaa", label: "Gray" },
    { value: "#000000", label: "Black" },
];

const _ANNOTATION_TYPES_DATA = [
    { value: "highlight", label: "Highlight",
      icon: "chrome://zotero/skin/16/universal/annotate-highlight.svg" },
    { value: "underline", label: "Underline",
      icon: "chrome://zotero/skin/16/universal/annotate-underline.svg" },
    { value: "note",      label: "Note",
      icon: "chrome://zotero/skin/16/universal/annotate-note.svg" },
    { value: "image",     label: "Image",
      icon: "chrome://zotero/skin/16/universal/annotate-area.svg" },
    { value: "ink",       label: "Ink",
      icon: "chrome://zotero/skin/16/universal/annotate-ink.svg" },
    { value: "text",      label: "Text",
      icon: "chrome://zotero/skin/16/universal/annotate-text.svg" },
];

// `attachmentLinkedFile` is a pseudo-kind: it doesn't come from
// `getItemTypeIconName(true)` (which collapses link-mode); it's
// matched by `_attachmentMatchesFileTypeList` via
// `attachmentLinkMode === LINK_MODE_LINKED_FILE`. Orthogonal to
// the content-type entries — picking it shows linked files of
// any content type (linked PDF, linked EPUB, linked generic, …).
const _ATTACHMENT_FILE_TYPES_DATA = [
    { value: "attachmentPDF",        label: "PDF",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-pdf.svg" },
    { value: "attachmentEPUB",       label: "EPUB",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-epub.svg" },
    { value: "attachmentSnapshot",   label: "Snapshot",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-snapshot.svg" },
    { value: "attachmentImage",      label: "Image",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-image.svg" },
    { value: "attachmentVideo",      label: "Video",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-video.svg" },
    { value: "attachmentWebLink",    label: "Web Link",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-web-link.svg" },
    // Inline SVG (two overlapping horizontal rounded-rect "chain"
    // links) so the icon reads as a horizontal chain and visually
    // distinguishes "Linked File" from "Web Link" and the content-
    // type entries. `stroke="context-stroke"` resolves through
    // `.wv-filter-svg`'s `-moz-context-properties` rule to
    // currentColor, so the icon themes with the surrounding text.
    { value: "attachmentLinkedFile", label: "Linked File",
      icon: "data:image/svg+xml;utf8,"
        + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'"
        + " fill='none' stroke='context-stroke' stroke-width='1.3'>"
        + "<rect x='0.85' y='5.65' width='7.3' height='4.7' rx='2.35'/>"
        + "<rect x='7.85' y='5.65' width='7.3' height='4.7' rx='2.35'/>"
        + "</svg>" },
    { value: "attachmentFile",       label: "Other File",
      icon: "chrome://zotero/skin/16/universal/attachment.svg" },
];

class _FilterMixin {
    [k: string]: any;

    // ---- Per-window filter state (Pattern C: de-singleton) -----------------
    // These four hold window-DOM-tied filter state: the filter definition
    // (`_filterState`), the chip-bar element (`_filterBar`), the toolbar `+`
    // button (`_filterTbBtn`), and the items-tree MutationObserver
    // (`_filterTreeObserver`). They used to be plain plugin-instance fields —
    // ONE set shared by every main window — so opening a second main window
    // re-pointed them at the new window and orphaned/clobbered the first
    // window's bar + observer + filter (the long-standing multi-window gap).
    //
    // The whole module already resolves its target window via
    // `Zotero.getMainWindow()` (the focused window) at every site, so we key
    // these on that SAME window and stash the value in a per-window expando
    // (`win._wvFilter*`). With a single main window — the case every shipping
    // user is in — `getMainWindow()` always returns that one window, so this is
    // semantically identical to the old singleton (zero behaviour change). With
    // several main windows each gets its own slot, so they no longer collide.
    // Mixed onto WeaveroPlugin.prototype as accessors by the index.ts mixin
    // (defineProperties preserves get/set; see the comment there).
    /** The window the `_filter*` accessors bind to: the explicit
     *  override while a targeted setup/teardown pass is running,
     *  otherwise the focused main window. The override exists so
     *  set-up of a BACKGROUND main window (init loops over all mains;
     *  hot-reloads happen with arbitrary focus) writes that window's
     *  slots instead of whichever main happens to be focused. */
    _wvFilterTargetWin(): any {
        const o: any = (this as any)._wvFilterWinOverride;
        if (o && !o.closed) return o;
        return Zotero.getMainWindow();
    }

    get _filterState() { const w: any = this._wvFilterTargetWin(); return w ? w._wvFilterState : this._wvFilterStateNoWin; }
    set _filterState(v) { const w: any = this._wvFilterTargetWin(); if (w) w._wvFilterState = v; else this._wvFilterStateNoWin = v; }
    get _filterBar() { const w: any = this._wvFilterTargetWin(); return w ? w._wvFilterBar : this._wvFilterBarNoWin; }
    set _filterBar(v) { const w: any = this._wvFilterTargetWin(); if (w) w._wvFilterBar = v; else this._wvFilterBarNoWin = v; }
    get _filterTbBtn() { const w: any = this._wvFilterTargetWin(); return w ? w._wvFilterTbBtn : this._wvFilterTbBtnNoWin; }
    set _filterTbBtn(v) { const w: any = this._wvFilterTargetWin(); if (w) w._wvFilterTbBtn = v; else this._wvFilterTbBtnNoWin = v; }
    get _filterTreeObserver() { const w: any = this._wvFilterTargetWin(); return w ? w._wvFilterTreeObserver : this._wvFilterTreeObserverNoWin; }
    set _filterTreeObserver(v) { const w: any = this._wvFilterTargetWin(); if (w) w._wvFilterTreeObserver = v; else this._wvFilterTreeObserverNoWin = v; }
    get _filterSpaceFix() { const w: any = this._wvFilterTargetWin(); return w ? w._wvFilterSpaceFix : this._wvFilterSpaceFixNoWin; }
    set _filterSpaceFix(v) { const w: any = this._wvFilterTargetWin(); if (w) w._wvFilterSpaceFix = v; else this._wvFilterSpaceFixNoWin = v; }

    /** Does `item` (assumed to be an attachment) match the given
     *  attachment-file-type list?
     *
     *  Two axes of selection coexist in this one list:
     *   - Content-type entries (`attachmentPDF`, `attachmentEPUB`,
     *     …) — OR'd among themselves; multiselect on this axis
     *     widens the result.
     *   - The pseudo-kind `attachmentLinkedFile` — AND'd against
     *     the content-type axis; toggling it narrows whatever
     *     content types are selected to *linked* files only.
     *
     *  So "PDF + Linked File" returns only linked PDFs, "PDF +
     *  EPUB" returns PDFs and EPUBs of any link mode, "PDF + EPUB
     *  + Linked File" returns linked PDFs and linked EPUBs. The
     *  pseudo-kind is pseudo because Zotero's
     *  `getItemTypeIconName(skipLinkMode=true)` collapses link-
     *  mode (a linked PDF still reports `attachmentPDF`); we
     *  check `attachmentLinkMode === LINK_MODE_LINKED_FILE`
     *  directly. With nothing on the content-type axis but
     *  `attachmentLinkedFile` selected, the list matches every
     *  linked file regardless of content type. */
    _attachmentMatchesFileTypeList(item, list) {
        if (!item || !list || !list.length) return false;
        const wantsLinked = list.includes("attachmentLinkedFile");
        const contentList = wantsLinked
            ? list.filter(v => v !== "attachmentLinkedFile")
            : list;
        const kind = (item.getItemTypeIconName
            && item.getItemTypeIconName(true)) || "";
        // Content-type axis: pass if either no content type is
        // selected (only the linked-file constraint matters) or
        // the item's kind is among the selected ones.
        const contentOK = !contentList.length || contentList.includes(kind);
        if (!contentOK) return false;
        // Link-mode axis: only enforced when the pseudo-kind is
        // selected. AND'd with the content-type axis above.
        if (wantsLinked) {
            try {
                const LINKED_FILE = Zotero.Attachments
                    && Zotero.Attachments.LINK_MODE_LINKED_FILE;
                if (LINKED_FILE == null) return false;
                if (item.attachmentLinkMode !== LINKED_FILE) return false;
            } catch (e) { return false; }
        }
        return true;
    }

    /** DEV outline-eval facets. The set of filter tokens an ATTACHMENT
     *  satisfies, drawn from its recorded classification (source + flags)
     *  and its eval verdict. Two facet namespaces share ONE set so
     *  `_outlineMatchesList` (set intersection) naturally scopes each facet
     *  by whatever tokens its own list holds:
     *   - `outlineClass`:  the classification source ("embedded" /
     *     "extracted" / "scan" / "empty" / "unknown") and "flag:<name>"
     *     for each classification flag.
     *   - `outlineVerdict`: "verdict:<good|bad|scan>", or "verdict:unmarked"
     *     when no case is recorded.
     *  Reads ONLY the in-memory eval store (loaded lazily by the dev filter
     *  UI, which calls `_wvOeInit`); an unloaded/empty store yields just the
     *  "verdict:unmarked" token rather than throwing. Keyed by `item.key`
     *  to match `_wvOeScanLibrary` / `_wvOeMark` (both store under
     *  `libraryID:<item.key>` — see `_wvReaderAtt`). */
    _wvOutlineTokens(libraryID, itemKey) {
        const out = new Set();
        try {
            const cls = this._wvOeGetClassification(libraryID, itemKey);
            if (cls) {
                if (cls.source) out.add(String(cls.source));
                for (const f of (cls.flags || [])) out.add("flag:" + f);
            }
            const cse = this._wvOeCase(libraryID, itemKey);
            out.add("verdict:" + ((cse && cse.verdict) || "unmarked"));
        } catch (e) {}
        return out;
    }

    /** "att's outline token set INTERSECTS `list`" (OR) — used by the Source and
     *  Verdict facets (an item has exactly one of each, so any-of is the sensible
     *  combine) and by every EXCLUDE list (has-any-excluded -> reject). */
    _outlineMatchesList(item, list) {
        if (!item || !list || !list.length) return false;
        const toks = this._wvOutlineTokens(item.libraryID, item.key);
        if (!toks.size) return false;
        for (const v of list) if (toks.has(v)) return true;
        return false;
    }

    /** "att's outline token set CONTAINS ALL of `list`" (AND) — used by the Flags
     *  facet: an item can carry several independent flags, so selecting two means
     *  "has both". 2026-07-24. */
    _outlineMatchesAll(item, list) {
        if (!item || !list || !list.length) return false;
        const toks = this._wvOutlineTokens(item.libraryID, item.key);
        for (const v of list) if (!toks.has(v)) return false;
        return true;
    }

    /** Temporarily un-patch the items-tree rowProvider so Zotero's
     *  internal load / refresh logic sees the live `_rows` instead
     *  of our stale `getRow` / `getRowCount`. Mirrors the inactive
     *  branch of `_applyItemsListFilterInner` (line ~11934). The
     *  next `_applyItemsListFilter()` call re-installs the patches
     *  with a fresh `keep` array. */
    _pauseFilterPatches() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            const rp = itemsView && itemsView.rowProvider;
            if (!rp || !rp._wvOrigGetRow) return;
            // Same reasoning as the deactivation branch: the watermark
            // only means something while the translation is installed.
            delete rp._wvKeepRowsLen;
            delete rp.getRow;
            delete rp.getRowCount;
            delete rp._wvOrigGetRow;
            delete rp._wvOrigGetRowCount;
            // Restore the item pane's count getter (own property on the
            // itemsView; deleting it re-exposes the prototype getter).
            // The host is stored on `rp` because these teardown sites
            // only have `rp` in scope.
            if (rp._wvObjRowCountHost) {
                try { delete rp._wvObjRowCountHost.objectRowCount; }
                catch (e) {}
                delete rp._wvObjRowCountHost;
            }
            if (rp._wvOrigGetLevel) {
                delete rp.getLevel;
                delete rp._wvOrigGetLevel;
            }
            if (rp._wvOrigIsContainer) {
                delete rp.isContainer;
                delete rp._wvOrigIsContainer;
            }
            if (rp._wvOrigIsContainerOpen) {
                delete rp.isContainerOpen;
                delete rp._wvOrigIsContainerOpen;
            }
            if (rp._wvOrigIsContainerEmpty) {
                delete rp.isContainerEmpty;
                delete rp._wvOrigIsContainerEmpty;
            }
            if (rp._wvOrigToggleOpenState) {
                delete rp.toggleOpenState;
                delete rp._wvOrigToggleOpenState;
            }
            if (rp._wvOrigExpandRows) {
                delete rp.expandRows;
                delete rp._wvOrigExpandRows;
            }
            if (rp._wvOrigCollapseRows) {
                delete rp.collapseRows;
                delete rp._wvOrigCollapseRows;
            }
            if (rp._wvOrigExpandAllRows) {
                delete rp.expandAllRows;
                delete rp._wvOrigExpandAllRows;
            }
            if (rp._wvOrigCollapseAllRows) {
                delete rp.collapseAllRows;
                delete rp._wvOrigCollapseAllRows;
            }
            delete rp._wvFilterSelfCall;
        } catch (e) {
            dbg("[Weavero][filter] _pauseFilterPatches err: " + e);
        }
    }

    /** Patch `isSelectable(idx, selectAll)` so the bottom Selection
     *  Target ticks gate Ctrl+A. Two patch sites:
     *
     *    1. `itemsView.isSelectable` — overrides the instance
     *       method so any FUTURE `this.isSelectable.bind(this)` in
     *       upstream's `itemTree.jsx::render()` (line 1383) captures
     *       our wrapper and the bound prop honours the gate after
     *       the next render.
     *    2. `itemsView.tree.props.isSelectable` — replaces the
     *       LIVE bound prop on the already-rendered
     *       virtualized-table so Ctrl+A works immediately, before
     *       any re-render happens.
     *
     *  The virtualized-table reads `this._tree.props.isSelectable`
     *  on every select-all (`virtualized-table.jsx:182, 570, …`),
     *  so the prop replacement is what makes Ctrl+A actually skip
     *  rows. The instance-method patch is the durable fallback
     *  that keeps things working across React re-renders.
     *
     *  Returns `false` from the wrapper only when `selectAll` is true
     *  AND the row's kind is out of the *resolved* Selection Target
     *  (`_effectiveSelectionTargetKinds` — explicit chips, or the smart
     *  default inferred from the active filters). When that resolves to
     *  all three kinds the wrapper is a no-op. Same source the items
     *  tree dims rows from (`_applySelectionTargetVisuals`), so Ctrl+A
     *  and the dimmed rows agree. Individual clicks always go through
     *  `orig`. Idempotent. */
    /** Monkey-patch upstream Zotero's
     *  `CollectionViewItemTreeRowProvider._expandMatchParents` to
     *  apply the fix from zotero/zotero@8d59331 — quick search not
     *  expanding attachments containing matched annotations after
     *  the item-tree refactor (5ca1fbb16). The broken version
     *  builds a `rowsToOpen` array and calls `_expandRows()` once
     *  at the end; we replace it with a per-row
     *  `_toggleOpenState(i, true)` loop + a single `refreshRowMap`
     *  at the end. Self-disables once Zotero ships the upstream
     *  fix — detected by checking that the live function's source
     *  no longer references `rowsToOpen`.
     *
     *  REMOVAL: delete this method, its two call sites
     *  (`_patchIsSelectable` neighbours in init + post-swap +
     *  post-setFilter), and the `_wvExpandMatchParentsPatched`
     *  marker once 10.0-beta.5 or later is the minimum supported
     *  Zotero version (manifest's `strict_min_version`). */
    _patchExpandMatchParents() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (!itemsView) return;
            // V9-COMPAT: Zotero 10 has `rowProvider._expandMatchParents`;
            // Zotero 9 has `itemsView.expandMatchParents` (no underscore,
            // no rowProvider). Find whichever exists.
            const rp: any = itemsView.rowProvider || itemsView;
            const methodName = (typeof rp._expandMatchParents === "function")
                ? "_expandMatchParents"
                : (typeof rp.expandMatchParents === "function"
                    ? "expandMatchParents"
                    : null);
            if (!methodName) return;
            if (rp._wvExpandMatchParentsPatched) return;
            const orig = rp[methodName];
            const src = String(orig);
            // V9-COMPAT: Zotero 9's expandMatchParents takes
            // searchParentIDs as an argument (no `rowsToOpen` bug);
            // bail without patching — the user-closed-respect feature
            // is a v10 nicety scoped out of basic v9 filter support.
            if (methodName === "expandMatchParents"
                || !src.includes("rowsToOpen")) {
                rp._wvExpandMatchParentsPatched = "upstream-fixed";
                return;
            }
            const self = this;
            rp[methodName] = function _wvFixedExpandMatchParents() {
                const searchParentIDs = this.searchParentIDs;
                if (!this._searchMode || this.itemTree.props.regularOnly) return;
                const userClosed: Set<number> = (self as any)._userClosedIDs;
                for (let i = 0; i < this.rowCount; i++) {
                    if (!this.isContainer(i) || this.isContainerOpen(i)) continue;
                    const item = this.getRow(i).ref;
                    // Respect a user's explicit collapse — don't
                    // re-open a container the user just closed,
                    // even if it sits on a match path. They can
                    // re-open it manually if they want.
                    if (userClosed && item && userClosed.has(item.id)) {
                        continue;
                    }
                    const attachments = item.isRegularItem()
                        ? item.getAttachments() : [];
                    const shouldBeOpened = searchParentIDs.has(item.id)
                        || attachments.some(id => searchParentIDs.has(id));
                    if (shouldBeOpened) {
                        this._toggleOpenState(i, true);
                    }
                }
                this.refreshRowMap();
            };
            rp._wvExpandMatchParentsPatched = "weavero-patched";
            Zotero.debug("[Weavero] Patched broken _expandMatchParents (zotero forum #131294, fixed upstream in 8d59331)");
        } catch (e) {
            Zotero.debug("[Weavero] _patchExpandMatchParents err: " + e);
        }
    }

    /** Permanent wrap on the rowProvider's `toggleOpenState` that
     *  keeps `_userOpenedIDs` / `_userClosedIDs` updated regardless
     *  of whether the Weavero filter is active. Without this, the
     *  filter-aware `wrapToggle` (installed only when a filter
     *  chip is set) is the only path that maintains the sets, so
     *  manually expanding an attachment when no chip is set fails
     *  to register — and the `FileItemTreeRow.getChildItems` patch
     *  doesn't unmask the non-matching annotations. */
    /** Event-delegate handler for clicks on `.wv-hidden-chevron`.
     *  Toggles the badged container's id in `_userRevealedAllIDs`
     *  and re-applies the filter. Idempotent install — bails if
     *  the handler is already wired to the items-tree element. */
    _installHiddenBadgeClickHandler() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            // Strip handlers from BOTH possible host elements before
            // re-attaching anywhere. Earlier load orders could have
            // landed the handler on the wrapper (`#zotero-items-tree`)
            // when `#item-tree-main` didn't exist yet; the wrapper's
            // capture-phase `stopPropagation` would then block events
            // from ever reaching a freshly-attached handler on
            // `#item-tree-main`, silently no-op'ing every click.
            // Use the Firefox listener enumerator to find ALL stale
            // Weavero capture-phase mouse listeners — including ones
            // attached by builds that pre-dated the function-tracking
            // markers and so left no removable reference behind. Match
            // by source-substring (`wv-hidden-chevron` only appears in
            // our handlers' bodies, never in Zotero or platform code).
            const stripHost = (host: any) => {
                if (!host) return;
                try {
                    const els: any = (Services as any).els;
                    const infos = els && els.getListenerInfoFor
                        ? els.getListenerInfoFor(host) : null;
                    if (infos) {
                        for (const li of infos) {
                            if (!li || !li.capturing) continue;
                            if (li.type !== "mousedown"
                                && li.type !== "mouseup") continue;
                            try {
                                const fn = li.listenerObject;
                                if (typeof fn !== "function") continue;
                                if (!fn.toString().includes(
                                    "wv-hidden-chevron")) continue;
                                host.removeEventListener(li.type, fn, true);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
                delete host._wvHiddenBadgeHandlerDown;
                delete host._wvHiddenBadgeHandlerUp;
                delete host._wvHiddenBadgeHandlerInstalled;
            };
            const innerHost = doc && doc.getElementById("item-tree-main");
            const wrapHost = doc && doc.getElementById("zotero-items-tree");
            stripHost(innerHost);
            stripHost(wrapHost);
            const treeInner: any = innerHost || wrapHost;
            if (!treeInner) return;
            // Don't capture `self = this` — the plugin instance can
            // be replaced on reload, leaving a closure bound to a
            // dead instance. Look up `Zotero.Weavero.plugin` at click
            // time so the handler always operates on the live plugin.
            // Use `mousedown` in the capture phase, not `click` —
            // Zotero's virtualized-table row handler calls
            // `preventDefault()` on mousedown (to avoid text
            // selection while handling row selection), which
            // suppresses the synthesised `click` event entirely.
            // mousedown still fires; we own it before the row
            // handler runs, stop propagation, and skip selection.
            const onBadgeDown = (e: any) => {
                const t: any = e.target;
                const badge = t && t.closest
                    && t.closest(".wv-hidden-chevron");
                if (!badge) return;
                e.stopPropagation();
                e.preventDefault();
                const id = parseInt(
                    badge.getAttribute("data-wv-item-id") || "0", 10);
                if (!id) return;
                const plugin: any = (Zotero as any).Weavero
                    && (Zotero as any).Weavero.plugin;
                if (!plugin) {
                    return;
                }
                if (!plugin._userRevealedAllIDs) {
                    plugin._userRevealedAllIDs = new Set();
                }
                const wasIn = plugin._userRevealedAllIDs.has(id);
                if (wasIn) {
                    plugin._userRevealedAllIDs.delete(id);
                    // Also clear any "user manually expanded" bypass
                    // on this id. Both `_userOpenedIDs` and
                    // `_userRevealedAllIDs` make `getChildItems` skip
                    // the search filter, so leaving the former intact
                    // would defeat the un-reveal: the wrap would still
                    // return every child of this container and the
                    // non-matching rows would re-appear after the
                    // refresh. The chev click is the user's clearest
                    // "go back to the filtered view" signal we have.
                    if (plugin._userOpenedIDs) {
                        plugin._userOpenedIDs.delete(id);
                    }
                } else {
                    plugin._userRevealedAllIDs.add(id);
                }
                // Flip the visual state of every chevron tagged with
                // this id immediately. `iv.refresh()` rebuilds `_rows`
                // but reuses existing primary-cell DOM where it can,
                // so without this the chevron keeps the stale arrow
                // direction and tooltip until the cell is recycled
                // for a different row.
                try {
                    const isRevealed = plugin._userRevealedAllIDs.has(id);
                    const counts = plugin._wvHiddenCounts;
                    const n = (counts && counts.get(id)) || 0;
                    const revealedPaths = "M7 20l5-5 5 5 M7 4l5 5 5-5";
                    const collapsedPaths = "M7 15l5 5 5-5 M7 9l5-5 5 5";
                    const matches = doc.querySelectorAll(
                        '.wv-hidden-chevron[data-wv-item-id="'
                        + id + '"]');
                    matches.forEach((m: any) => {
                        m.classList.toggle("wv-revealed", isRevealed);
                        m.title = isRevealed
                            ? "Showing all children of this container."
                            + " Click to re-apply the filter."
                            : `${n} more item${n === 1 ? "" : "s"}`
                                + " hidden by the filter."
                                + " Click to reveal them.";
                        const path = m.querySelector("path");
                        if (path) {
                            path.setAttribute("d", isRevealed
                                ? revealedPaths : collapsedPaths);
                        }
                    });
                } catch (err) {}
                const wvActive = plugin._isFilterActive
                    && plugin._isFilterActive(plugin._filterState);
                const iv: any = win.ZoteroPane.itemsView;
                // Always trigger `iv.refresh()` — even with the
                // Weavero filter active. Without the refresh,
                // `_rows` only contains items that Zotero's own
                // quick-search included; the apply pass can't
                // surface DB children that never entered `_rows`
                // in the first place. So a reveal under combined
                // search+filter would only re-expose annotations
                // matching the quick search and miss the rest.
                // The refresh runs our patched `getItems`, which
                // injects every revealed container's DB children,
                // and Zotero's own `_refresh` rebuilds `_rows`
                // from there. The apply pass below then narrows
                // visibility back to whatever the active Weavero
                // filter + force-keeps allow.
                try {
                    plugin._patchRefreshForReveals();
                } catch (err) {}

                // FAST PATH (no quick search): re-render the revealed
                // container's children IN-PLACE (collapse + reopen) and
                // re-apply, instead of a full `iv.refresh()`. A full
                // refresh rebuilds `_rows` from scratch and — with a
                // reveal active — drops SIBLING top-level cascade-matched
                // items (e.g. a regular item whose attachment has
                // bookmarks) from `_rows` entirely, making them vanish
                // (the disappearing-Ebook bug). An in-place toggle only
                // re-renders THIS container's children (getChildItems
                // re-runs with the new reveal state) and leaves every
                // sibling row untouched. The full-refresh path below is
                // kept for the quick-search case, where revealed children
                // may be absent from the search set and only the
                // `getItems` injection can surface them.
                if (!plugin._currentQuickSearchValue) {
                    try {
                        const rpIp: any = iv && iv.rowProvider;
                        const rawToggle = rpIp
                            && (rpIp._wvOrigToggleOpenState
                                || rpIp.toggleOpenState);
                        const findRaw = (wantId) => {
                            const rr = (rpIp && rpIp._rows) || [];
                            for (let i = 0; i < rr.length; i++) {
                                if (rr[i] && rr[i].ref
                                    && rr[i].ref.id === wantId) return i;
                            }
                            return -1;
                        };
                        let i1 = findRaw(id);
                        if (i1 >= 0 && typeof rawToggle === "function") {
                            // `toggleOpenState(idx, skipRowMapRefresh)`
                            // FLIPS the open state. Collapse (if open)
                            // then reopen so getChildItems re-runs with
                            // the just-updated reveal set.
                            if (rpIp._rows[i1] && rpIp._rows[i1].isOpen) {
                                rawToggle.call(rpIp, i1, true);
                            }
                            i1 = findRaw(id);
                            if (i1 >= 0 && rpIp._rows[i1]
                                && !rpIp._rows[i1].isOpen) {
                                rawToggle.call(rpIp, i1, true);
                            }
                        }
                    } catch (err) {
                    }
                    // The in-place reopen records the container in
                    // `_userOpenedIDs` (the user-open-tracking wrap), a
                    // manual-open bypass that force-keeps ALL children.
                    // That would defeat an UN-reveal (non-matching
                    // children stay visible) and suppress the chevron
                    // (hiddenCount → 0). Reveal state is governed solely
                    // by `_userRevealedAllIDs`, so drop the manual-open
                    // flag for this container.
                    try {
                        plugin._userOpenedIDs
                            && plugin._userOpenedIDs.delete(id);
                    } catch (err) {}
                    plugin._filterApplying = false;
                    plugin._suppressTreeObserverUntil = 0;
                    try { plugin._applyItemsListFilter({ cascade: true }); }
                    catch (err) {
                    }
                    try { iv && iv.tree && iv.tree.invalidate(); }
                    catch (err) {}
                    return;
                }

                // Mark that the imminent refresh is driven by us
                // so the `_refresh` wrap doesn't treat it as an
                // external search/filter change and clear the
                // reveal we just toggled.
                plugin._wvChevRefreshInFlight = true;
                const rpBefore = iv && iv.rowProvider;
                // Capture the container row's open state BEFORE the
                // refresh so we can restore it after — Zotero's
                // `_refresh` rebuilds `_rows` from scratch and the
                // auto-expand-on-search-match doesn't always reach
                // the just-toggled container (it depends on whether
                // the container had passing descendants in the post-
                // refresh search set). Without this capture, the
                // un-reveal click visibly collapses the row and the
                // chevron disappears with it, leaving the user with
                // no way to re-reveal short of clicking the twisty.
                let wasOpenBeforeRefresh = false;
                try {
                    const row = rpBefore && rpBefore._rows
                        ? rpBefore._rows.find((r: any) =>
                            r && r.ref && r.ref.id === id)
                        : null;
                    wasOpenBeforeRefresh = !!(row && row.isOpen);
                } catch (err) {}
                // Reset `_searchItemIDs` to the base snapshot
                // BEFORE the refresh runs. Zotero's `_refresh`
                // assigns the new `_searchItemIDs` only at the
                // END of its body, after the `_refreshContainer`
                // loop that calls our `getChildItems` wrap. So
                // without this reset, the wrap would read the
                // PREVIOUS (revealed-augmented) set and let every
                // revealed child pass through, defeating the un-
                // reveal. The base is whatever the genuine search
                // result was — getItems will rebuild from it.
                try {
                    if (rpBefore && plugin._wvBaseSearchIDs) {
                        rpBefore._searchItemIDs = new Set(
                            plugin._wvBaseSearchIDs);
                    }
                } catch (err) {}
                const p = (() => {
                    try { return iv && iv.refresh && iv.refresh(); }
                    catch (err) {
                        return null;
                    }
                })();
                if (p && typeof p.then === "function") {
                    p.then(() => {
                        // Run the apply pass FIRST so the Weavero-filter
                        // keep[] honours the reveal AND the cascade
                        // re-opens the revealed container itself. Doing
                        // the manual toggleOpenState re-open BEFORE the
                        // apply corrupted `_rows`: it dropped sibling
                        // top-level items that match only via the cascade
                        // (e.g. a regular item whose attachment carries
                        // the Has-Bookmarks match), making them vanish
                        // entirely. The cascade apply opens the container
                        // without that corruption.
                        // Force apply to run even if the reentrancy guard
                        // OR the observer-suppression window is still set
                        // from the mid-refresh observer-driven pass —
                        // otherwise the chev's own apply silently bails
                        // and keep[] is left stale.
                        plugin._filterApplying = false;
                        plugin._suppressTreeObserverUntil = 0;
                        // `cascade: true` re-runs the expand-match-parents
                        // pass so the revealed container (and any matching
                        // descendants) auto-open.
                        try { plugin._applyItemsListFilter(
                            { cascade: true }); }
                        catch (e) {
                        }
                        // Fallback re-open: ONLY if the cascade apply left
                        // the revealed container closed (it normally opens
                        // it). Skipping when already open avoids the
                        // `_rows`-corrupting toggle in the common case.
                        try {
                            if (wasOpenBeforeRefresh) {
                                const rpAfter = iv && iv.rowProvider;
                                let rowAfter: any = null;
                                let rowIdx = -1;
                                if (rpAfter && rpAfter._rows) {
                                    for (let i = 0;
                                        i < rpAfter._rows.length;
                                        i++) {
                                        const rr = rpAfter._rows[i];
                                        if (rr && rr.ref
                                            && rr.ref.id === id) {
                                            rowAfter = rr;
                                            rowIdx = i;
                                            break;
                                        }
                                    }
                                }
                                // Use the ORIGINAL (raw-index) toggle,
                                // NOT the keep[]-translating patched one:
                                // `rowIdx` is a raw `_rows` index, so the
                                // patched toggle would translate it
                                // (keep[rowIdx]) and open the WRONG row,
                                // corrupting `_rows` and dropping sibling
                                // cascade-matched items (the disappearing
                                // Ebook bug). This is how the apply's own
                                // auto-expand calls it (see line ~9877).
                                const rawToggle =
                                    rpAfter._wvOrigToggleOpenState
                                    || rpAfter.toggleOpenState;
                                if (rowAfter && !rowAfter.isOpen
                                    && rowIdx >= 0
                                    && typeof rawToggle === "function") {
                                    rawToggle.call(rpAfter, rowIdx, true);
                                }
                            }
                        } catch (e) {}
                        // Only recompute the QS-only chevron maps when
                        // the Weavero filter is inactive. The active
                        // apply we just ran above populated the maps
                        // by walking `keep[]` (visible rows). Calling
                        // the QS-compute right after would walk raw
                        // `_rows` instead and overwrite `firstMap`
                        // with non-visible row ids — leaving the chev
                        // anchored to a row that never renders.
                        if (!wvActive) {
                            try {
                                plugin._wvComputeChevronMapsForQuickSearch(
                                    iv.rowProvider || iv);
                            } catch (e) {}
                        }
                        try { iv.tree && iv.tree.invalidate(); }
                        catch (e) {}
                    }).catch((err: any) => {
                    });
                }
                try {
                    iv && iv.tree && iv.tree.invalidate();
                } catch (err) {}
            };
            const onBadgeUp = (e: any) => {
                const t: any = e.target;
                const badge = t && t.closest
                    && t.closest(".wv-hidden-chevron");
                if (!badge) return;
                e.stopPropagation();
                e.preventDefault();
            };
            treeInner.addEventListener("mousedown", onBadgeDown, true);
            // Also swallow the mouseup so it doesn't trigger any
            // row-level handler waiting for it.
            treeInner.addEventListener("mouseup", onBadgeUp, true);
            treeInner._wvHiddenBadgeHandlerDown = onBadgeDown;
            treeInner._wvHiddenBadgeHandlerUp = onBadgeUp;
        } catch (e) {
            Zotero.debug(
                "[Weavero] _installHiddenBadgeClickHandler err: " + e);
        }
    }

    /** Inject the DB children of every revealed container into the
     *  set that drives row inclusion in `rowProvider._refresh`.
     *  `_refresh` builds the row list from a LOCAL Set computed from
     *  `collectionTreeRow.getItems()` — so the only hook that gets
     *  ahead of the filter step is to make `getItems()` return the
     *  hidden children too. Without this, the patched `getChildItems`
     *  could return everything in the world and the rows still
     *  wouldn't surface, because `_refresh` cross-checks each row
     *  against the search-result set computed pre-build. Idempotent. */
    /** True for a NON-item row in the items tree — a library header, a spacer,
     *  or anything else structural that grouped views interleave into `_rows`.
     *
     *  Zotero 10.0-beta.22 added `itemTreeRow.isObjectRow` (upstream
     *  `85a33e158`, "Don't treat library header and spacer rows as items") as
     *  the supported test, and it covers structural row types added later —
     *  which the hard-coded `type` strings never will. Those strings still
     *  exist, so they stay as the Zotero 9 / pre-beta.22 fallback. */
    _wvIsStructuralRow(row: any): boolean {
        try {
            if (!row) return false;
            if (typeof row.isObjectRow === "boolean") return !row.isObjectRow;
            return row.type === "library-header" || row.type === "spacer";
        } catch (e) { return false; }
    }

    _patchRefreshForReveals() {
        try {
            const win = Zotero.getMainWindow();
            const iv: any = win && win.ZoteroPane
                && win.ZoteroPane.itemsView;
            const rp: any = iv && iv.rowProvider;
            // Zotero 10.0-beta.21 removed `ItemTree#collectionTreeRow` in
            // favour of `collectionTreeRows[]` + `viewMode` (upstream
            // 1d97f6448, "Replace ItemTree#collectionTreeRow with a validated
            // view mode" -- multi-collection selection had left the singular
            // getter returning only the FIRST row). Reading the old name
            // returned undefined, so this whole hook early-returned and the
            // reveal patch silently stopped installing on beta.21+
            // (caught 2026-07-31). Keep the singular as the Zotero 9 /
            // pre-beta.21 fallback.
            const ctrs: any[] = (rp && Array.isArray(rp.collectionTreeRows))
                ? rp.collectionTreeRows
                : (rp && rp.collectionTreeRow ? [rp.collectionTreeRow] : []);
            for (const ctr of ctrs) this._patchOneCtrGetItems(ctr);
            this._patchRefreshForChevrons(rp);
        } catch (e) { dbg("[Weavero] _patchRefreshForReveals err: " + e); }
    }

    /** Install the reveal-aware `getItems` wrap on ONE collection-tree row.
     *  Split out of `_patchRefreshForReveals` when beta.21 turned the single
     *  row into a list (a multi-collection selection has one per collection,
     *  and every one of them feeds `_refresh`). */
    _patchOneCtrGetItems(ctr: any) {
        try {
            if (!ctr || typeof ctr.getItems !== "function") return;
            // Peel any prior-version wrap before installing the
            // current one. Old wraps may lack the `_wvBaseSearchIDs`
            // snapshot path and silently mis-count hidden children
            // for revealed containers — peeling guarantees the live
            // wrap takes effect on plugin upgrade without a restart.
            if (ctr._wvOrigGetItemsForReveals) {
                ctr.getItems = ctr._wvOrigGetItemsForReveals;
                delete ctr._wvOrigGetItemsForReveals;
                delete ctr._wvGetItemsRevealPatched;
            }
            const orig = ctr.getItems;
            ctr._wvOrigGetItemsForReveals = orig;
            ctr.getItems = async function (...args) {
                const baseItems = await orig.apply(this, args);
                try {
                    const plugin: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    if (plugin) {
                        plugin._wvBaseSearchIDs = new Set(
                            baseItems.map((it: any) => it && it.id));
                        // Proactively replace `rp._searchItemIDs` with
                        // the fresh base set right here, BEFORE the
                        // `_refresh` body that called us continues
                        // through its row-build and container-toggle
                        // phases. Zotero only assigns the new ids at
                        // the very END of `_refresh`, so without this
                        // the toggle phase reads a stale `_searchItemIDs`
                        // from the previous search — every formerly-
                        // revealed child would slip through our
                        // `getChildItems` filter again and the X-in-
                        // search-box clear would leave stale rows in
                        // place until the next refresh. With this in
                        // place, the toggle phase filters against the
                        // genuine current search set immediately.
                        const win = Zotero.getMainWindow();
                        const ivLocal: any = win && win.ZoteroPane
                            && win.ZoteroPane.itemsView;
                        const rpLocal: any = ivLocal && ivLocal.rowProvider;
                        if (rpLocal) {
                            rpLocal._searchItemIDs = new Set(
                                plugin._wvBaseSearchIDs);
                        }
                    }
                    const revealed = plugin
                        && plugin._userRevealedAllIDs;
                    dbg("[Weavero][getItems] baseLen="
                        + baseItems.length
                        + " revealed=" + JSON.stringify(
                            revealed ? [...revealed] : []));
                    if (!revealed || !revealed.size) return baseItems;
                    const seen = new Set(baseItems.map((it: any) =>
                        it && it.treeViewID));
                    const extra: any[] = [];
                    for (const containerID of revealed) {
                        const item = Zotero.Items.get(containerID);
                        if (!item) continue;
                        let childItems: any[] = [];
                        if (item.isFileAttachment
                            && item.isFileAttachment()) {
                            childItems = (item.getAnnotations
                                && item.getAnnotations()) || [];
                        } else if (item.isRegularItem
                            && item.isRegularItem()) {
                            const attIds = (item.getAttachments
                                && item.getAttachments()) || [];
                            const noteIds = (item.getNotes
                                && item.getNotes()) || [];
                            for (const cid of [...attIds, ...noteIds]) {
                                const ci = Zotero.Items.get(cid);
                                if (ci) childItems.push(ci);
                            }
                        }
                        for (const ci of childItems) {
                            const tvId = ci && ci.treeViewID;
                            if (tvId == null) continue;
                            if (seen.has(tvId)) continue;
                            seen.add(tvId);
                            extra.push(ci);
                        }
                    }
                    dbg("[Weavero][getItems] extraLen="
                        + extra.length
                        + " → returning " + (extra.length
                            ? baseItems.length + extra.length
                            : baseItems.length));
                    if (extra.length) return baseItems.concat(extra);
                } catch (e) {
                    Zotero.debug(
                        "[Weavero] getItems reveal-inject err: " + e);
                }
                return baseItems;
            };
            ctr._wvGetItemsRevealPatched = true;
        } catch (e) { dbg("[Weavero] _patchOneCtrGetItems err: " + e); }
    }

    /** Wrap `rp._refresh` so chevron maps get recomputed and the tree
     *  re-painted whenever Zotero rebuilds `_rows`. The MutationObserver on
     *  the tree DOM doesn't fire for virtualized-table cell-content swaps, so
     *  without this hook a fresh quick search lands a populated `_rows` but
     *  empty chevron maps — no chevrons appear at all.
     *
     *  Per ROW PROVIDER, not per collection-tree row — kept separate from
     *  `_patchOneCtrGetItems` when beta.21 turned the single row into a list. */
    _patchRefreshForChevrons(rp: any) {
        try {
            if (rp && typeof rp._refresh === "function") {
                // Peel a prior wrap before re-installing (same pattern as
                // the getItems / renderPrimaryCell patches above) — the
                // old boolean-only guard survived plugin reloads and kept
                // a STALE wrap running, which is how the library-header
                // dedupe fix below failed to take effect on first install
                // (2026-07-16).
                if (rp._wvOrigRefreshForChevronCompute) {
                    rp._refresh = rp._wvOrigRefreshForChevronCompute;
                    delete rp._wvOrigRefreshForChevronCompute;
                    delete rp._wvRefreshChevronComputePatched;
                }
                const origRefresh = rp._refresh;
                rp._wvOrigRefreshForChevronCompute = origRefresh;
                rp._refresh = async function (...args) {
                    // Capture caller stack so we can see who fired
                    // this refresh — useful when chasing why _rows
                    // changes when we didn't expect it.
                    let callerHint = "?";
                    try {
                        const stk = new Error().stack || "";
                        // Skip our own wrap frame; grab the next
                        // non-internal frame as the caller.
                        const lines = stk.split("\n").slice(1, 6);
                        callerHint = lines.join(" | ").substring(0, 200);
                    } catch (e) {}
                    // Drop reveal AND manual-expand state on any
                    // refresh that wasn't triggered by a chev click
                    // — search/filter change, collection switch,
                    // etc. Both `_userRevealedAllIDs` (chev) and
                    // `_userOpenedIDs` (manual twisty expand) bypass
                    // the search filter in our `getChildItems` wrap,
                    // so a stale entry in either set would re-surface
                    // hidden children on the next search.
                    try {
                        const plugin: any = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        if (plugin && !plugin._wvChevRefreshInFlight) {
                            if (plugin._userRevealedAllIDs
                                && plugin._userRevealedAllIDs.size) {
                                dbg(
                                    "[Weavero][_refresh] external"
                                    + " — clearing reveals "
                                    + JSON.stringify(
                                        [...plugin._userRevealedAllIDs]));
                                plugin._userRevealedAllIDs.clear();
                            }
                            if (plugin._userOpenedIDs
                                && plugin._userOpenedIDs.size) {
                                dbg(
                                    "[Weavero][_refresh] external"
                                    + " — clearing opened "
                                    + JSON.stringify(
                                        [...plugin._userOpenedIDs]));
                                plugin._userOpenedIDs.clear();
                            }
                        }
                    } catch (e) {}
                    dbg("[Weavero][_refresh] start, rows="
                        + (this._rows ? this._rows.length : "?"));
                    const result = await origRefresh.apply(this, args);
                    dbg("[Weavero][_refresh] orig done, rows="
                        + (this._rows ? this._rows.length : "?"));
                    // Defensive: Zotero's `_refresh` sometimes leaves
                    // `_rows` with rows whose tree position doesn't
                    // match their actual parent — typically after a
                    // chev-injection refresh, where the container-
                    // toggle phase ends up placing one container's
                    // children under a different container's row.
                    // We walk `_rows` maintaining a parent stack and
                    // drop any row whose `parentItemID` doesn't match
                    // the row currently above it at the expected
                    // level. Same pass also dedupes by item id.
                    try {
                        if (this._rows && this._rows.length) {
                            const seenIds = new Set();
                            const stack: any[] = [];
                            const kept: any[] = [];
                            const droppedDetails: any[] = [];
                            const beforeLen = this._rows.length;
                            for (let rowIdx = 0;
                                rowIdx < this._rows.length;
                                rowIdx++) {
                                const row = this._rows[rowIdx];
                                if (!row || !row.ref) {
                                    kept.push(row);
                                    continue;
                                }
                                // Structural rows (Zotero's grouped multi-
                                // library view): a SPACER and its LIBRARY-
                                // HEADER share the same Library ref, so the
                                // id-dedupe below ate every header that
                                // followed its spacer — i.e. every library
                                // section except the first (user report
                                // 2026-07-16). They're not items; keep them
                                // verbatim and out of seenIds (whose ids are
                                // itemIDs — a Library id could also collide
                                // with a real item's id).
                                if (this._wvIsStructuralRow(row)
                                    || typeof row.ref.isRegularItem !== "function") {
                                    kept.push(row);
                                    continue;
                                }
                                const id = row.ref.id;
                                if (id == null) {
                                    kept.push(row);
                                    continue;
                                }
                                if (seenIds.has(id)) {
                                    droppedDetails.push({
                                        i: rowIdx, id,
                                        reason: "duplicate",
                                    });
                                    continue;
                                }
                                const lvl = row.level || 0;
                                while (stack.length
                                    && (stack[stack.length - 1].level
                                        || 0) >= lvl) {
                                    stack.pop();
                                }
                                const pid = row.ref.parentItemID;
                                let ok = false;
                                if (lvl === 0) {
                                    ok = !pid;
                                } else {
                                    const expectedParent
                                        = stack.length
                                            ? stack[stack.length - 1].id
                                            : null;
                                    ok = expectedParent === pid;
                                }
                                if (!ok) {
                                    droppedDetails.push({
                                        i: rowIdx, id, lvl,
                                        pid,
                                        expected: stack.length
                                            ? stack[stack.length - 1].id
                                            : null,
                                        reason: "misplaced",
                                    });
                                    continue;
                                }
                                seenIds.add(id);
                                kept.push(row);
                                stack.push({id, level: lvl});
                            }
                            if (droppedDetails.length) {
                                // Log each dropped row so we can see
                                // exactly which got dropped and why.
                                // First 20 only; if there are more
                                // it's probably the same pattern and
                                // logs get noisy.
                                const cap = Math.min(
                                    droppedDetails.length, 20);
                                for (let k = 0; k < cap; k++) {
                                    const d = droppedDetails[k];
                                }
                                if (droppedDetails.length > cap) {
                                }
                                this._rows = kept;
                                if (typeof this.refreshRowMap === "function") {
                                    try { this.refreshRowMap(); }
                                    catch (e) {}
                                }
                            }
                        }
                    } catch (e) {
                        Zotero.debug("[Weavero] cleanup err: " + e);
                    }
                    try {
                        const plugin: any = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        // Reset `_searchItemIDs` to the genuine base
                        // again here — Zotero's `_refresh` ends with
                        // `this._searchItemIDs = newSearchItemIDs`,
                        // which contains the revealed-augmented set
                        // we returned from `getItems`. Leaving it
                        // augmented would let the NEXT refresh's
                        // toggle phase (which reads the stale value
                        // before Zotero's own reassignment) pass
                        // every revealed-child through the filter
                        // unconditionally.
                        if (plugin && plugin._wvBaseSearchIDs) {
                            this._searchItemIDs = new Set(
                                plugin._wvBaseSearchIDs);
                        }
                        // Same gate as in the chev handler — never
                        // run the QS-only compute when the Weavero
                        // filter is active. The active apply will
                        // populate the maps from `keep[]` and any
                        // overwrite from raw `_rows` would strand the
                        // chev on a row that's outside `keep[]`.
                        if (plugin
                            && plugin._wvComputeChevronMapsForQuickSearch
                            && !(plugin._isFilterActive
                                && plugin._isFilterActive(
                                    plugin._filterState))) {
                            plugin._wvComputeChevronMapsForQuickSearch(this);
                        }
                        // Reset the in-flight flag after the refresh
                        // it gated has consumed it.
                        const wasChevRefresh = plugin
                            && plugin._wvChevRefreshInFlight;
                        if (plugin) plugin._wvChevRefreshInFlight = false;
                        // For external refreshes (search/filter change,
                        // not chev-triggered), run apply with cascade so
                        // the Weavero filter is enforced and primary
                        // ancestors auto-expand. The chev-triggered
                        // refreshes handle their own apply in the chev
                        // handler's then() — skip here to avoid a
                        // duplicate apply.
                        if (plugin && !wasChevRefresh) {
                            try {
                                plugin._filterApplying = false;
                                plugin._suppressTreeObserverUntil = 0;
                                plugin._applyItemsListFilter(
                                    { cascade: true });
                            } catch (e) {
                                Zotero.debug(
                                    "[Weavero] post-refresh apply err: "
                                    + e);
                            }
                        }
                        // Resolve the items view at CALL time: this wrap moved
                        // out of `_patchRefreshForReveals` (which closed over
                        // `iv`) when beta.21 split the collection-tree row into
                        // a list, and a stale closure would be wrong here
                        // anyway once the view is rebuilt.
                        const winT: any = Zotero.getMainWindow();
                        const ivT: any = winT && winT.ZoteroPane
                            && winT.ZoteroPane.itemsView;
                        const tree = ivT && ivT.tree;
                        if (tree && tree.invalidate) tree.invalidate();
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero] post-refresh compute err: " + e);
                    }
                    return result;
                };
                rp._wvRefreshChevronComputePatched = true;
            }
        } catch (e) {
            Zotero.debug(
                "[Weavero] _patchRefreshForReveals err: " + e);
        }
    }

    /** Populate `_wvHiddenCounts` and `_wvFirstVisibleAnnUnderAtt`
     *  based on Zotero's quick-search state alone (no Weavero filter).
     *  Lets the chevron indicator render and react when only quick
     *  search is hiding children. Mirrors the logic in the
     *  `_applyItemsListFilter` apply pass, but reads `rp.searchItemIDs`
     *  / `searchParentIDs` instead of Weavero's `hasMatch` cache. */
    _wvComputeChevronMapsForQuickSearch(rp: any) {
        const hiddenCounts = new Map<number, number>();
        const firstVisibleChild = new Map<number, number>();
        try {
            const sm = !!(rp && (rp.searchMode || rp._searchMode));
            const liveIDs = rp && (rp.searchItemIDs || rp._searchItemIDs);
            const sParents = rp && (rp.searchParentIDs
                || rp._searchParentIDs);
            // Prefer the snapshot of the genuine search match set
            // captured by `_patchRefreshForReveals` before our reveal-
            // injection. Falling back to the live set is fine when no
            // reveal is active (the two are identical), but a stale
            // baseline beats no baseline when something edge-cased the
            // hook order.
            const sIDs = this._wvBaseSearchIDs || liveIDs;
            if (!sm || !sIDs) {
                this._wvHiddenCounts = hiddenCounts;
                this._wvFirstVisibleAnnUnderAtt = firstVisibleChild;
                return;
            }
            const rows = (rp && rp._rows) || [];
            // First pass: hidden-DB-child counts per container in _rows.
            for (const row of rows) {
                if (!row || !row.ref) continue;
                const it = row.ref;
                let childIds: number[] = [];
                if (it.isRegularItem && it.isRegularItem()) {
                    childIds = [
                        ...((it.getAttachments && it.getAttachments()) || []),
                        ...((it.getNotes && it.getNotes()) || []),
                    ];
                } else if (it.isFileAttachment && it.isFileAttachment()) {
                    childIds = ((it.getAnnotations
                        && it.getAnnotations()) || []).map(a => a.id);
                } else {
                    continue;
                }
                if (!childIds.length) continue;
                let hidden = 0, visible = 0;
                for (const cid of childIds) {
                    if (sIDs.has(cid)) { visible++; continue; }
                    if (sParents && sParents.has(cid)) { visible++; continue; }
                    hidden++;
                }
                // Chevron only for MIXED containers — at least one child that
                // matches the search (shown) AND at least one hidden. When every
                // child is non-matching the container is in the view only because
                // an ancestor matched; getChildItems now shows all its children on
                // expand, so no chevron is needed.
                if (hidden > 0 && visible > 0) hiddenCounts.set(it.id, hidden);
            }
            // Second pass: first visible direct child per such container.
            for (const row of rows) {
                if (!row || !row.ref) continue;
                const it = row.ref;
                const parentID = it.parentItemID;
                if (!parentID) continue;
                if (!hiddenCounts.has(parentID)) continue;
                if (firstVisibleChild.has(parentID)) continue;
                firstVisibleChild.set(parentID, it.id);
            }
        } catch (e) {
            Zotero.debug(
                "[Weavero] _wvComputeChevronMapsForQuickSearch err: " + e);
        }
        this._wvHiddenCounts = hiddenCounts;
        this._wvFirstVisibleAnnUnderAtt = firstVisibleChild;
    }

    _patchUserOpenTracking() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane
                && win.ZoteroPane.itemsView;
            if (!itemsView) return;
            // V9-COMPAT: Zotero 10 puts `toggleOpenState` on
            // `rowProvider`; Zotero 9 keeps it on the itemsView
            // itself (as an async arrow-function class field).
            const rp: any = itemsView.rowProvider || itemsView;
            if (!rp || typeof rp.toggleOpenState !== "function") return;
            // Version-aware marker — bump when the wrapper logic
            // changes so a plugin reload picks up the new behaviour
            // instead of keeping the old wrapper stuck on the
            // persistent `itemsView` object.
            const WRAPPER_VERSION = "v2-splice";
            if (rp._wvUserOpenTrackingPatched === WRAPPER_VERSION) return;
            // Peel off any previous wrappers we installed (older
            // version markers, no marker, or plain "true" from
            // pre-versioned builds) so we wrap the TRUE Zotero
            // original instead of stacking wrappers.
            if (rp._wvUserOpenTrackingPatched && rp._wvUserOpenTrackingOrig) {
                rp.toggleOpenState = rp._wvUserOpenTrackingOrig;
                delete rp._wvUserOpenTrackingOrig;
            }
            const orig = rp.toggleOpenState.bind(rp);
            rp._wvUserOpenTrackingOrig = rp.toggleOpenState;
            const self = this;
            // V9-COMPAT: detect whether this is an itemsView (v9, no
            // rowProvider) so the post-toggle splice below only runs
            // there. On v10 the equivalent filtering is done upstream
            // via `_patchHideContextAttachments` on row classes.
            const isV9Toggle = !itemsView.rowProvider;
            rp.toggleOpenState = function (idx, skipRowMapRefresh) {
                let wasOpenBeforeOrig = false;
                let parentLevel = 0;
                try {
                    // V9-COMPAT: skip tracking when the toggle is
                    // invoked from Zotero's own auto-expand-on-search
                    // path. On v9, `expandMatchParents` calls
                    // `this.toggleOpenState(i, true)` for each parent
                    // of a search match — that lands in our wrapper
                    // and would otherwise be recorded as a "user open",
                    // accumulating forever across search cycles and
                    // turning the manual-expand-reveals-children rule
                    // into "every search-touched parent reveals
                    // everything." Heuristic: track only calls with
                    // `skipRowMapRefresh=false` (== arity 1, manual
                    // twisty/keyboard) and skip internal `(i, true)`.
                    if (!skipRowMapRefresh) {
                        const row = rp._rows[idx];
                        const wasOpen = row && row.isOpen;
                        const id = row && row.ref && row.ref.id;
                        if (id != null) {
                            if (!self._userOpenedIDs) {
                                self._userOpenedIDs = new Set();
                            }
                            if (!self._userClosedIDs) {
                                self._userClosedIDs = new Set();
                            }
                            if (wasOpen) {
                                self._userOpenedIDs.delete(id);
                                self._userClosedIDs.add(id);
                            } else {
                                self._userOpenedIDs.add(id);
                                self._userClosedIDs.delete(id);
                            }
                        }
                    }
                    if (isV9Toggle) {
                        const r = rp._rows[idx];
                        wasOpenBeforeOrig = !!(r && r.isOpen);
                        parentLevel = (r && r.level) || 0;
                    }
                } catch (e) {}
                const result = orig(idx, skipRowMapRefresh);
                // V9-COMPAT: replicate v10's `_patchHideContextAttachments`
                // by post-splicing non-matching attachment/note rows
                // out of `_rows`. Only when:
                // - we're on v9 (the patch on row classes doesn't apply)
                // - the toggle was an OPEN (added rows)
                // - the call came from Zotero's internal search-expand
                //   (`skipRowMapRefresh=true`) OR our cascade
                // - the user has the pref off
                // - Zotero's quick-search is active
                try {
                    if (isV9Toggle && skipRowMapRefresh && !wasOpenBeforeOrig
                        && !Zotero.Prefs.get(
                            "weavero.showContextAttachmentRows")
                        && rp._searchMode && rp._searchItemIDs) {
                        const sIDs = rp._searchItemIDs;
                        const sParents = rp._searchParentIDs;
                        const toSplice: number[] = [];
                        for (let k = idx + 1; k < rp._rows.length; k++) {
                            const kr = rp._rows[k];
                            if (!kr) break;
                            const kLvl = kr.level || 0;
                            if (kLvl <= parentLevel) break;
                            if (kLvl !== parentLevel + 1) continue;
                            const cItem = kr.ref;
                            if (!cItem) continue;
                            // Only target attachments + notes — leave
                            // annotations alone (Zotero already
                            // handles those via its own pref).
                            const isAtt = cItem.isAttachment
                                && cItem.isAttachment();
                            const isNote = cItem.isNote
                                && cItem.isNote();
                            if (!isAtt && !isNote) continue;
                            // Keep if it's a direct match or has a
                            // match in its subtree (annotation under
                            // a file attachment, for instance).
                            if (sIDs.has(cItem.id)) continue;
                            if (sParents && sParents.has(cItem.id)) {
                                continue;
                            }
                            toSplice.push(k);
                        }
                        // Splice in reverse to keep earlier indices valid.
                        for (let i = toSplice.length - 1; i >= 0; i--) {
                            rp._rows.splice(toSplice[i], 1);
                        }
                    }
                } catch (e) {
                    Zotero.debug(
                        "[Weavero] post-toggle context-hide err: " + e);
                }
                return result;
            };
            rp._wvUserOpenTrackingPatched = "v2-splice";
        } catch (e) {
            Zotero.debug("[Weavero] _patchUserOpenTracking err: " + e);
        }
    }

    _patchIsSelectable() {
        try {
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (!itemsView) return;
            const self = this;
            const gateFn = (orig) => function (index, selectAll) {
                // Use the resolved Selection Target (explicit chips, or the
                // smart default derived from the active filters — see
                // `_effectiveSelectionTargetKinds`). Same source the items
                // tree uses for dimming (`_applySelectionTargetVisuals`),
                // so Ctrl+A and the dimmed rows always agree.
                if (selectAll && (self._getEnableSelectionTarget
                        ? self._getEnableSelectionTarget() : true)) {
                    let row = null;
                    try { row = itemsView.getRow(index); } catch (e) {}
                    const item = row && row.ref;
                    if (item) {
                        // Canonical kind mapping (`_rowKindOf` —
                        // child notes → attachment, standalone
                        // notes → parent). Re-deriving here would
                        // mis-classify item notes as parent and
                        // wrongly let Ctrl+A pick them when
                        // Selection Target is restricted to Parent.
                        const kind = self._rowKindOf(item) || "parent";
                        // Kind gate — only selectable if the row's
                        // kind is in the resolved target.
                        let eff: any = null;
                        try { eff = self._effectiveSelectionTargetKinds(); } catch (e) {}
                        if (eff && !(eff.parent && eff.attachment && eff.note && eff.annotation)) {
                            if (!eff[kind]) return false;
                        }
                        // Primary gate — when the filter is active,
                        // only ACTUAL primary matches are selectable.
                        // Ancestor rows (kept for tree shape) are
                        // excluded so Ctrl+A picks exactly what the
                        // filter targets, not their containers.
                        const state = self._filterState;
                        if (state && self._isFilterActive(state)) {
                            try {
                                if (!self._rowIsPrimary(item, state)) return false;
                            } catch (e) {}
                        }
                    }
                }
                return orig.call(this, index, selectAll);
            };
            // Patch 1 — instance method (durable across re-renders).
            if (!itemsView._wvIsSelectableOrig) {
                const orig = itemsView.isSelectable.bind(itemsView);
                itemsView._wvIsSelectableOrig = orig;
                itemsView.isSelectable = gateFn(orig);
            }
            // Patch 2 — live prop on the already-rendered table.
            // React replaces `props` on every re-render, so we tag
            // the WRAPPED FUNCTION (not the props object) and skip
            // re-patching only if the current prop already IS our
            // wrapper. This way fresh-prop renders get re-patched.
            const vTable = itemsView.tree;
            if (vTable && vTable.props) {
                const propOrig = vTable.props.isSelectable as any;
                if (typeof propOrig === "function" && !propOrig._wvWrapped) {
                    try {
                        const wrapped: any = gateFn(propOrig);
                        wrapped._wvWrapped = true;
                        vTable.props.isSelectable = wrapped;
                    } catch (e) {
                        Zotero.debug(
                            "[Weavero] _patchIsSelectable: prop write blocked: " + e);
                    }
                }
            }
        } catch (e) {
            Zotero.debug("[Weavero] _patchIsSelectable err: " + e);
        }
    }

    /** Mirror Zotero's built-in `hideContextAnnotationRows` behaviour
     *  for ATTACHMENTS — Zotero only filters non-matching annotations
     *  inside matched files at search time (`FileItemTreeRow.
     *  getChildItems`), leaving non-matching attachments visible
     *  under matched parents as "context". This patch extends the
     *  same filtering to attachment children of regular items when
     *  the Weavero pref `weavero.showContextAttachmentRows` is off
     *  (default). Notes are NOT filtered — only file attachments —
     *  because notes are a deliberately separate content stream and
     *  the user-facing toggle is scoped to attachments. */
    _patchHideContextAttachments() {
        if ((this as any)._wvDestroyed) return;   // torn down — never re-patch
        try {
            // We want `ZoteroItemTreeRow.prototype` — but the
            // bundled IIFE can't reach `globalThis.require` (esbuild
            // / Firefox interaction: the symbol exists at the
            // top-level console but resolves to undefined in the
            // bundle's lexical scope). Pull the prototype out of a
            // live regular-item row instead. Any item the items
            // view has built a row for will do; walk `_rows` and
            // take the prototype of the first row whose class is
            // NOT FileItemTreeRow or AnnotationItemTreeRow (those
            // both extend ZoteroItemTreeRow but already override
            // getChildItems or aren't containers).
            const win = Zotero.getMainWindow();
            const rp: any = win && win.ZoteroPane
                && win.ZoteroPane.itemsView
                && win.ZoteroPane.itemsView.rowProvider;
            if (!rp || !rp._rows || !rp._rows.length) return;
            let ZIRProto: any = null;
            for (const r of rp._rows) {
                const it = r && r.ref;
                if (!it) continue;
                // A regular item is the canonical ZoteroItemTreeRow.
                if (it.isRegularItem && it.isRegularItem()) {
                    ZIRProto = Object.getPrototypeOf(r);
                    break;
                }
            }
            if (!ZIRProto
                || typeof ZIRProto.getChildItems !== "function") {
                return;
            }
            // Recognise our own wrapper to avoid double-wrapping
            // across plugin reloads. The flag may have been cleared
            // (manual reset, dev iteration) but our wrapper is
            // still on the prototype — re-saving it as "the
            // original" would chain N wrappers and the saved
            // "original" would already filter, hiding the bug.
            // Two-tier detection: explicit marker property (set
            // by new builds), plus a source-string fallback for
            // wrappers from earlier dev iterations that didn't
            // carry the marker. If we find one of ours, unwrap it
            // back to the true original instead of wrapping again.
            // Peel off any of our own previously-installed wrappers
            // (one or more, stacked across dev reloads) so the
            // wrapper we install below wraps Zotero's TRUE original
            // and not a chain of our older versions. Iterate until
            // the current `getChildItems` no longer looks like ours
            // — explicit marker or source-string check (the regex
            // catches old wrappers from before the marker existed).
            let guard = 0;
            while (guard++ < 8) {
                const cur: any = ZIRProto.getChildItems;
                const isOurs = cur && (cur._wvWeaveroWrapper
                    || /weavero\.showContextAttachmentRows/.test(
                        String(cur)));
                if (!isOurs) break;
                if (!ZIRProto._wvOrigGetChildItems) {
                    // Marker says it's ours but we have no stored
                    // original — we're stuck. Bail without
                    // wrapping; restart Zotero to clear.
                    ZIRProto._wvHideCtxAttPatched = true;
                    return;
                }
                ZIRProto.getChildItems = ZIRProto._wvOrigGetChildItems;
                delete ZIRProto._wvOrigGetChildItems;
            }
            delete ZIRProto._wvHideCtxAttPatched;
            const ZIR: any = { prototype: ZIRProto };
            const orig = ZIR.prototype.getChildItems;
            ZIR.prototype._wvOrigGetChildItems = orig;
            const wrapper: any = function (opts: any) {
                const items = orig.call(this, opts);
                try {
                    // Hot path: an expansion pass parked the resolved
                    // state in WV_GCI_CTX, so skip the pref read and the
                    // window-mediator lookups entirely (2026-08-06).
                    const ctx = WV_GCI_CTX;
                    if (ctx) {
                        if (ctx.showCtxAtt) return items;
                        if (!ctx.liveSM || !ctx.liveSIDs) return items;
                    }
                    const showCtxAtt = ctx ? ctx.showCtxAtt : !!Zotero.Prefs.get(
                        "weavero.showContextAttachmentRows");
                    if (showCtxAtt) return items;
                    // Read the live search state from the items
                    // view's rowProvider rather than `opts`. Zotero
                    // calls `getChildItems` during `_refreshContainer`
                    // BEFORE updating `_searchMode/_searchItemIDs`
                    // on the rowProvider — so `opts` here can be
                    // stale (`searchMode: false`) on the very call
                    // we most need to filter. The rowProvider's
                    // live `searchMode/searchItemIDs/searchParentIDs`
                    // are always the canonical truth, regardless of
                    // who triggered the call.
                    let liveSM = ctx ? ctx.liveSM : false;
                    let liveSIDs: any = ctx ? ctx.liveSIDs : null;
                    let liveParents: any = ctx ? ctx.liveParents : null;
                    if (!ctx) try {
                        const w = Zotero.getMainWindow();
                        const ivRp = w && w.ZoteroPane
                            && w.ZoteroPane.itemsView
                            && w.ZoteroPane.itemsView.rowProvider;
                        if (ivRp) {
                            liveSM = !!ivRp.searchMode;
                            // V9-COMPAT: Zotero 10 exposes these as
                            // public on the rowProvider; Zotero 9
                            // keeps them private (`_searchItemIDs`)
                            // on itemsView. Fall back when the public
                            // name is undefined.
                            liveSIDs = ivRp.searchItemIDs
                                || ivRp._searchItemIDs;
                            liveParents = ivRp.searchParentIDs
                                || ivRp._searchParentIDs;
                        }
                    } catch (e) {}
                    // Fall back to a search-box check so we still
                    // filter when the user types but the rowProvider
                    // hasn't yet been told (transient state during
                    // an in-flight setFilter).
                    if (!liveSM && !ctx) {
                        try {
                            const w = Zotero.getMainWindow();
                            const sb: any = w
                                && w.document.getElementById("zotero-tb-search");
                            if (sb && sb.value
                                && String(sb.value).trim()) {
                                liveSM = true;
                            }
                        } catch (e) {}
                    }
                    if (!liveSM || !liveSIDs) return items;
                    // User-override: if THIS container was just
                    // opened manually (in `_userOpenedIDs`), return
                    // every child untouched. Manual expand has
                    // priority over the hide-context rule — the user
                    // explicitly asked to see this subtree.
                    try {
                        const wvPlugin = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        const opened = wvPlugin && wvPlugin._userOpenedIDs;
                        const revealed = wvPlugin
                            && wvPlugin._userRevealedAllIDs;
                        if (this.ref && opened && opened.has(this.ref.id)) {
                            return items;
                        }
                        // Chevron-reveal opt-in: bypass the hide-context
                        // filter so the user can surface attachments /
                        // notes that the active search would otherwise
                        // hide. Same intent as `_userOpenedIDs` but
                        // triggered by the chevron, not by manual expand.
                        if (this.ref && revealed
                            && revealed.has(this.ref.id)) {
                            return items;
                        }
                    } catch (e) {}
                    // Treat child notes the same as attachments —
                    // the user's mental model puts both under
                    // "Non-Matching Attachments" (anything sitting
                    // as a child of a regular item that doesn't
                    // itself match should hide when the toggle is
                    // off). Standalone notes never go through this
                    // path; they're top-level rows handled by
                    // Zotero's own `_refresh` row-pruning loop.
                    // Also let through any attachment that the
                    // active Weavero filter would mark as primary —
                    // otherwise an attachment-level chip like
                    // `attachmentFileType = Web Link` would still
                    // drop matching attachments here just because
                    // they didn't directly match the quick search.
                    // The filter's per-row check is the source of
                    // truth for what should be visible at the
                    // attachment level.
                    const self = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    const fs = self && self._filterState;
                    const filteredOut: any = items.filter((it: any) => {
                        if (!it) return false;
                        if (liveSIDs.has(it.id)) return true;
                        if (liveParents && liveParents.has(it.id)) return true;
                        if (fs && self._isFilterActive(fs)) {
                            try {
                                if (self._rowIsPrimary(it, fs)) return true;
                            } catch (e) {}
                        }
                        return false;
                    });
                    dbg("[Weavero][ZIR.getChildItems] this.ref.id="
                        + (this.ref && this.ref.id)
                        + " orig=" + items.length
                        + " filtered=" + filteredOut.length);
                    // All-non-matching: if NONE of this item's children match, the
                    // item is in the view only because IT matched — so it acts as
                    // a plain expandable container (show all children; no chevron,
                    // since the chevron map gates on a matching child). A MIXED
                    // item keeps the filter + chevron path above.
                    if (filteredOut.length === 0 && items.length) {
                        return items;
                    }
                    return filteredOut;
                } catch (e) {
                    Zotero.debug(
                        "[Weavero] hide-ctx-att filter err: " + e);
                    return items;
                }
            };
            // Marker so future patch passes recognise this wrapper
            // and refuse to double-wrap.
            wrapper._wvWeaveroWrapper = true;
            ZIR.prototype.getChildItems = wrapper;
            ZIR.prototype._wvHideCtxAttPatched = true;
            Zotero.debug(
                "[Weavero] Patched ZoteroItemTreeRow.getChildItems "
                + "for showContextAttachmentRows");

            // Prepend the up/down chevron indicator on first visible
            // annotation under any file attachment that has hidden
            // sibling annotations. Click reveals all of them.
            this._patchRenderPrimaryCell(ZIRProto);

            // Pair patches on FileItemTreeRow.prototype — same
            // bundle-can't-call-`require` workaround: pull the
            // prototype out of a live file-attachment row.
            let FIRProto: any = null;
            for (const r of rp._rows) {
                const it = r && r.ref;
                if (!it) continue;
                if (it.isFileAttachment && it.isFileAttachment()) {
                    FIRProto = Object.getPrototypeOf(r);
                    break;
                }
            }
            if (FIRProto) {
                this._patchFileItemTreeRow(FIRProto);
            }
            // Patch the rowProvider's `_refresh` to honour reveals
            // when surfacing children otherwise filtered out by the
            // quick search. Idempotent — re-runs are bail-outs.
            this._patchRefreshForReveals();
        } catch (e) {
            Zotero.debug("[Weavero] _patchHideContextAttachments err: " + e);
        }
    }

    /** Prepend a vertical up/down chevron glyph to the first visible
     *  annotation under any file attachment that has hidden annotation
     *  siblings. Reads `_wvFirstVisibleAnnUnderAtt` (populated by the
     *  apply pass) and `_userRevealedAllIDs`. Click handling is wired
     *  separately via event delegation on the items-tree DOM. */
    _patchRenderPrimaryCell(ZIRProto) {
        if (!ZIRProto || typeof ZIRProto.renderPrimaryCell !== "function") return;
        // Peel a prior wrap before re-installing — see the matching
        // note in `_patchRefreshForReveals`.
        if (ZIRProto._wvOrig_renderPrimaryCell) {
            ZIRProto.renderPrimaryCell = ZIRProto._wvOrig_renderPrimaryCell;
            delete ZIRProto._wvOrig_renderPrimaryCell;
            delete ZIRProto._wvRenderPrimaryWrapped;
        }
        const orig = ZIRProto.renderPrimaryCell;
        ZIRProto._wvOrig_renderPrimaryCell = orig;
        ZIRProto.renderPrimaryCell = function (index, data, column) {
            const span = orig.call(this, index, data, column);
            try {
                if (!this.ref) return span;
                // Read state from the live plugin each call — see the
                // matching note in `_patchFileItemTreeRow`.
                const plugin: any = (Zotero as any).Weavero
                    && (Zotero as any).Weavero.plugin;
                if (!plugin) return span;
                const parentID = this.ref.parentItemID;
                // Dim rows that are only visible because their parent
                // is in `_userRevealedAllIDs` and they themselves
                // don't satisfy the active filters (Weavero filter
                // chips OR quick search). Without this, after the
                // user reveals an attachment's hidden annotations
                // the matching and non-matching ones render
                // identically and the search/filter hit becomes
                // hard to spot. The CSS selector
                // `.row:has(.wv-nonmatch-revealed)` carries the
                // dimming up to the whole row.
                //
                // "Doesn't satisfy the active filters" = NOT primary
                // under Weavero's per-row check (which combines all
                // active chips + the live quick-search match). A row
                // is primary only when it would naturally be visible
                // in the current view; non-primary rows are showing
                // purely because we revealed their parent.
                const revealedSet = plugin._userRevealedAllIDs;
                if (parentID && revealedSet
                    && revealedSet.has(parentID)) {
                    let nonMatch = false;
                    try {
                        const fs = plugin._filterState;
                        const fsActive = fs
                            && plugin._isFilterActive
                            && plugin._isFilterActive(fs);
                        if (fsActive && plugin._rowIsPrimary) {
                            nonMatch = !plugin._rowIsPrimary(
                                this.ref, fs);
                        } else {
                            // No Weavero filter active → fall back to
                            // the quick-search base set.
                            const baseIDs = plugin._wvBaseSearchIDs;
                            nonMatch = !!(baseIDs
                                && !baseIDs.has(this.ref.id));
                        }
                    } catch (e) {}
                    if (nonMatch) {
                        span.classList.add("wv-nonmatch-revealed");
                    }
                }
                const firstMap = plugin._wvFirstVisibleAnnUnderAtt;
                if (!firstMap) return span;
                if (!parentID) return span;
                if (firstMap.get(parentID) !== this.ref.id) return span;
                const revealed = !!(plugin._userRevealedAllIDs
                    && plugin._userRevealedAllIDs.has(parentID));
                const counts = plugin._wvHiddenCounts;
                const n = (counts && counts.get(parentID)) || 0;
                const chev = span.ownerDocument.createElement("span");
                chev.className = "wv-hidden-chevron"
                    + (revealed ? " wv-revealed" : "");
                // Lucide `chevrons-up-down` / `chevrons-down-up` paths
                // (24×24 viewBox, 1px stroke). Default = outward
                // chevrons ("expand all" — points-away pair); revealed
                // = inward chevrons ("collapse all" — points-toward
                // pair). Same icon system Obsidian uses, so the look
                // matches what the user wanted.
                const PATHS = revealed
                    ? 'M7 20l5-5 5 5 M7 4l5 5 5-5'
                    : 'M7 15l5 5 5-5 M7 9l5-5 5 5';
                // stroke-width=2 in a 24-unit viewBox rendered at
                // 14px → 2×14/24 ≈ 1.17px effective stroke. At
                // width=1 the line is ~0.58px effective and reads
                // grey because the entire stroke ends up
                // anti-aliased into sub-pixels. Matches Lucide /
                // Obsidian defaults.
                // createElementNS, NOT innerHTML: the main window is an XML
                // document, so innerHTML XML-parses the fragment through the
                // chrome sanitizer — with an xmlns attr it warned per render
                // (20-line floods), without one it FLATTENED the svg (wrong
                // namespace; both seen 2026-08-04). Direct DOM construction
                // involves no parser and no sanitizer.
                const SVG_NS = "http://www.w3.org/2000/svg";
                const svg = span.ownerDocument.createElementNS(SVG_NS, "svg");
                svg.setAttribute("viewBox", "0 0 24 24");
                svg.setAttribute("fill", "none");
                svg.setAttribute("stroke", "currentColor");
                svg.setAttribute("stroke-width", "2");
                svg.setAttribute("stroke-linecap", "round");
                svg.setAttribute("stroke-linejoin", "round");
                const path = span.ownerDocument.createElementNS(SVG_NS, "path");
                path.setAttribute("d", PATHS);
                svg.appendChild(path);
                chev.appendChild(svg);
                chev.setAttribute("data-wv-item-id", String(parentID));
                chev.title = revealed
                    ? "Showing all children of this container. Click to re-apply the filter."
                    : `${n} more item${n === 1 ? "" : "s"} hidden by the filter. Click to reveal them.`;
                // Insert immediately BEFORE the row's icon — so the
                // chevron sits to the left of the annotation icon and
                // right of the indent/twisty spacers. The icon isn't
                // there yet at this point in the render cycle (the
                // virtualized table adds `.cell-indent` /
                // `.spacer-twisty` / `.cell-icon` AFTER renderPrimaryCell
                // returns), so we defer one task to land after the row
                // is fully assembled. Without this defer the chevron
                // ends up at index 3 (after the icon).
                // Vertical alignment: chevron sits at the COLUMN of
                // the PARENT row's twisty — visually, just below the
                // parent's twisty, in the indent area of this row.
                // Level 1 (e.g. attachment under regular item):
                //   parent at level 0, twisty at column 0 → chevron
                //   at column 0.
                // Level 2 (e.g. annotation under attachment):
                //   parent at level 1, twisty at column ~16 →
                //   chevron at column ~16.
                // Zotero's per-level indent is 16px, matching the
                // twisty width. Use absolute positioning relative to
                // the cell (cells are already `position: relative`)
                // so siblings — twisty, icon, text — aren't shifted.
                const level = (this.level || 0);
                const parentTwistyCol = Math.max(0, (level - 1) * 16);
                chev.style.left = parentTwistyCol + "px";
                // Append synchronously — by the time we run, `orig.call`
                // has already populated the span with cell-indent /
                // twisty / icon / text. An earlier setTimeout-based
                // path was needed when the table appended those nodes
                // AFTER renderPrimaryCell returned, but that's no longer
                // the case here; deferring just risks the deferred
                // callback running after the virtualized table has
                // recycled the span into a different row (which would
                // either be a no-op via `span.isConnected` or paint the
                // chevron onto the wrong row).
                span.appendChild(chev);
            } catch (e) {}
            return span;
        };
        ZIRProto._wvRenderPrimaryWrapped = true;
    }

    /** Two patches on FileItemTreeRow.prototype:
     *
     *  1. `isContainerEmpty` — return false whenever the attachment
     *     has annotations in the database, regardless of how many
     *     match the current search. Without this, Zotero's default
     *     hides the twisty on attachments whose annotations all fail
     *     the search → the row reads as a leaf, and the user has no
     *     way to discover that there's content behind it.
     *
     *  2. `getChildItems` — when the attachment is in
     *     `_userOpenedIDs` (manually expanded by the user), return
     *     EVERY annotation (bypass `hideContextAnnotationRows`). The
     *     manual expand is the user's explicit "show me everything
     *     here" signal — the global toggle stays as a separate way
     *     to turn this on for all attachments at once. */
    _patchFileItemTreeRow(FIRProto) {
        const self = this;
        // (1) isContainerEmpty
        const peelOurs = (key, marker) => {
            let guard = 0;
            while (guard++ < 8) {
                const cur: any = FIRProto[key];
                if (!cur || !cur[marker]) break;
                if (!FIRProto["_wvOrig_" + key]) break;
                FIRProto[key] = FIRProto["_wvOrig_" + key];
                delete FIRProto["_wvOrig_" + key];
            }
        };
        if (typeof FIRProto.isContainerEmpty === "function") {
            peelOurs("isContainerEmpty", "_wvFIRWrapperEmpty");
            const origIsEmpty = FIRProto.isContainerEmpty;
            FIRProto._wvOrig_isContainerEmpty = origIsEmpty;
            const wEmpty: any = function () {
                try {
                    const anns = (this.ref && this.ref.getAnnotations)
                        ? (this.ref.getAnnotations() || []) : [];
                    return anns.length === 0;
                } catch (e) {
                    return origIsEmpty.apply(this, arguments);
                }
            };
            wEmpty._wvFIRWrapperEmpty = true;
            FIRProto.isContainerEmpty = wEmpty;
        }
        // (2) getChildItems
        if (typeof FIRProto.getChildItems === "function") {
            peelOurs("getChildItems", "_wvFIRWrapperGCI");
            const origGCI = FIRProto.getChildItems;
            FIRProto._wvOrig_getChildItems = origGCI;
            const wGCI: any = function (opts) {
                try {
                    // Look up the plugin via `Zotero.Weavero` instead
                    // of a captured `self` — peelOurs may have re-
                    // wrapped, but the `wGCI` already attached to row
                    // instances by Zotero's tree creation closes over
                    // the OLD `self`. Reading the live plugin each
                    // call keeps reveal/open state coherent across
                    // hot-reloads.
                    const plugin: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    const opened = plugin && plugin._userOpenedIDs;
                    const revealed = plugin && plugin._userRevealedAllIDs;
                    const id = this.ref && this.ref.id;
                    if (id != null
                        && ((opened && opened.has(id))
                            || (revealed && revealed.has(id)))) {
                        return (this.ref.getAnnotations
                            && this.ref.getAnnotations()) || [];
                    }
                    // Path-aware semantics: when Weavero's filter is
                    // active alongside a quick search, the upstream
                    // `getChildItems` filters annotations to those
                    // directly in `searchItemIDs` — but the user
                    // expects strict-per-LEVEL AND with the search
                    // matching ANY level of the path. So a green
                    // annotation under a PDF attachment whose title
                    // matches the search must still be returned,
                    // even though the annotation itself isn't in
                    // `searchItemIDs`. Augment the upstream result
                    // with primaries that aren't already in it.
                    const fs = plugin && plugin._filterState;
                    // getChildItems runs during Zotero's native _rows
                    // rebuild — BEFORE _applyItemsListFilterInner
                    // refreshes _currentQuickSearchValue — so the cached
                    // value is stale (empty) here, which silently
                    // disabled the augment below: primary annotations
                    // that don't themselves match the search were never
                    // re-added, so a chip-matching annotation under a
                    // search-matching item vanished. Read the LIVE
                    // search box and sync the cached value so the augment
                    // AND the _rowIsPrimary spine check it drives see the
                    // current query.
                    try {
                        const sbq: any = Zotero.getMainWindow()
                            && Zotero.getMainWindow().document
                                .getElementById("zotero-tb-search");
                        if (plugin && sbq) {
                            plugin._currentQuickSearchValue = sbq.value
                                ? String(sbq.value).trim() : "";
                        }
                    } catch (e) {}
                    if (fs && plugin._isFilterActive
                        && plugin._isFilterActive(fs)
                        && plugin._currentQuickSearchValue) {
                        const orig = origGCI.apply(this, arguments) || [];
                        const all = (this.ref && this.ref.getAnnotations)
                            ? (this.ref.getAnnotations() || []) : [];
                        const have = new Set(
                            orig.map((a: any) => a && a.id));
                        const extra: any[] = [];
                        for (const ann of all) {
                            if (!ann || have.has(ann.id)) continue;
                            try {
                                if (plugin._rowIsPrimary(ann, fs)) {
                                    extra.push(ann);
                                }
                            } catch (e) {}
                        }
                        return extra.length
                            ? orig.concat(extra) : orig;
                    }
                    // All-non-matching: if a quick search is active and NONE of
                    // this attachment's annotations match, the upstream
                    // getChildItems (under hideContextAnnotationRows) returns the
                    // filtered/empty set, so the twisty would expand to nothing.
                    // Show ALL annotations instead — the attachment is in the view
                    // only because its PARENT matched, so it acts as a plain
                    // expandable container (no chevron; the chevron map gates on a
                    // matching child). A MIXED attachment keeps the upstream
                    // filter + chevron path above.
                    if (opts && opts.searchMode && opts.searchItemIDs
                        && this.ref && this.ref.getAnnotations) {
                        const anns = this.ref.getAnnotations() || [];
                        if (anns.length && !anns.some((a: any) =>
                            a && opts.searchItemIDs.has(a.id))) {
                            return anns;
                        }
                    }
                } catch (e) {}
                return origGCI.apply(this, arguments);
            };
            wGCI._wvFIRWrapperGCI = true;
            FIRProto.getChildItems = wGCI;
        }
        Zotero.debug(
            "[Weavero] Patched FileItemTreeRow.isContainerEmpty + "
            + "getChildItems (show twisty + per-item expand)");
    }

    // =====================================================================
    // (pane.ts methods _applySelectionTargetVisuals through
    //  _teardownTreeClickDelegate physically lived between this and the
    //  next filter block — see modules/pane.ts.)
    // =====================================================================


    // ---- Items-list filter dropdown -------------------------------------
    //
    // Linear-style filter chips above the items tree. v0 covers annotation
    // colour only; the structure is set up to extend with tag / has-comment
    // / etc. without rewriting.
    //
    // Filtering is post-render: we hide non-matching `.row` elements via a
    // CSS class. Zotero's virtualized table positions every row absolutely
    // (`top: <index>*<rowHeight>px`), so display:none drops the row from
    // layout without disturbing siblings — we get visual gaps instead of
    // a re-flowed list, but no integration with the data layer is needed.

    /** Zotero's eight standard annotation colours, in the same order
     *  the colour picker shows them. Sourced from upstream
     *  `chrome/content/zotero/xpcom/data/item.js`'s Annotation.colors.
     *  (Class field syntax wouldn't survive the prototype-mixin lift —
     *  field initializers don't appear on the prototype's descriptor
     *  set. Getter binds to a module-level constant, same identity
     *  every access.) */
    get _ANNOTATION_COLORS() { return _ANNOTATION_COLORS_DATA; }

    /** Zotero-native colour swatch: the reader's `IconColor16` rounded
     *  square, copied verbatim (zotero/reader
     *  src/common/components/common/icons.js, AGPL-3.0) — a 14×14
     *  rounded square (r≈2) filled with the colour plus a 10%-black
     *  inner stroke so near-white swatches stay legible. Matches the
     *  annotation-popup colour picker exactly. */
    _wvNativeColorSwatch(doc: any, color: string, size?: number) {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(SVG_NS, "svg");
        svg.setAttribute("width", String(size || 16));
        svg.setAttribute("height", String(size || 16));
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "none");
        svg.classList.add("wv-swatch-native");
        const fill = doc.createElementNS(SVG_NS, "path");
        fill.setAttribute("d", "M1 3C1 1.89543 1.89543 1 3 1H13C14.1046 1 15 1.89543 15 3V13C15 14.1046 14.1046 15 13 15H3C1.89543 15 1 14.1046 1 13V3Z");
        fill.setAttribute("fill", color);
        const ring = doc.createElementNS(SVG_NS, "path");
        ring.setAttribute("d", "M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H13C13.8284 1.5 14.5 2.17157 14.5 3V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z");
        ring.setAttribute("stroke", "black");
        ring.setAttribute("stroke-opacity", "0.1");
        svg.appendChild(fill);
        svg.appendChild(ring);
        return svg;
    }

    // Standard Zotero annotation types (see upstream
    // chrome/content/zotero/xpcom/data/item.js — `_annotationTypes`).
    // Glyph is a small marker shown in the chip / picker; label is what
    // the user sees.
    // Same SVGs the reader toolbar imports (see upstream
    // reader/src/common/components/toolbar.js — `annotate-*.svg`).
    // The `image` annotation type uses `annotate-area.svg` upstream;
    // we mirror that mapping. Icons are themed at render time via
    // CSS mask-image + currentColor so they follow text colour in
    // both dark and light themes.
    get _ANNOTATION_TYPES() { return _ANNOTATION_TYPES_DATA; }

    // Attachment file kinds — values match `item.getItemTypeIconName(true)`
    // (camelCase, skipLinkMode=true). Notes are intentionally excluded
    // since Zotero handles them as their own row kind.
    get _ATTACHMENT_FILE_TYPES() { return _ATTACHMENT_FILE_TYPES_DATA; }

    /** Empty filter group — one AND-combination of fields. The
     *  top-level `_filterState` is `{ groups: [...] }` where each
     *  group has this shape. Groups are OR'd at the top level. */
    _emptyFilterGroup() {
        return {
            // Annotation-scope (kept on annotation rows directly).
            // For the icon-grid facets (`annotationColor`, `annotationType`,
            // `attachmentFileType`), a parallel `*Exclude` array carries
            // the Alt+click negative-selection set. The two arrays are
            // mutually exclusive per value: setting one state clears the
            // other.
            annotationColor: [],
            annotationColorExclude: [],
            annotationType: [],
            annotationTypeExclude: [],
            annotationHasComment: null,
            // Annotation source tri-state (`annotationIsExternal`):
            //   null  → any source
            //   true  → embedded in the PDF by an outside reader
            //           (isExternal true; imported read-only items)
            //   false → made in Zotero Reader (isExternal false).
            // Embedded-first encoding since 2026-08-18 (MJT: plain click
            // should select the external annotations) — true carries the
            // tile's data-selected styling, so the primary gesture keeps
            // the include look shared by every other tile.
            // Native Advanced Search cannot express this at all —
            // `isExternal` appears nowhere in searchConditions.js.
            annotationSource: null,
            annotationTag: [],
            annotationTagExclude: [],
            annotationAuthor: [],
            annotationAuthorExclude: [],
            // Parent metadata type (book / journalArticle / webpage /
            // …) — applies to regular items only.
            itemType: [],
            itemTypeExclude: [],
            // `attachmentFileType` narrows attachments by file kind
            // (PDF / EPUB / Snapshot / Image / Video / Web Link /
            // Other File). Notes are excluded — Zotero handles those
            // separately. Multi-select.
            attachmentFileType: [],
            attachmentFileTypeExclude: [],
            // DEV outline-eval facets (shown only when `weavero.devOutlineEval`
            // is on). Attachment-resolving like `attachmentFileType`:
            //   `outlineClass`   — classification source + flags.
            //   `outlineVerdict` — recorded eval verdict (or unmarked).
            // Matched via `_outlineMatchesList` (token-set intersection).
            outlineClass: [],
            outlineClassExclude: [],
            outlineFlags: [],
            outlineFlagsExclude: [],
            outlineVerdict: [],
            outlineVerdictExclude: [],
            addedBy: [],
            addedByExclude: [],
            // Per-row-kind scope for the addedBy filter — checked
            // only when `addedBy` is non-empty. Defaults to all-on
            // so a freshly added Added By filter behaves the same
            // as before this scope option existed.
            addedByScope: {
                topLevel: true,
                attachments: true,
                annotations: true,
            },
            // Cross-level filters — applied to every row kind
            // (parent / attachment / annotation) the same way.
            // Tri-state like `annotationHasComment`:
            //   null  → off
            //   true  → must have the property
            //   false → must NOT have the property (alt+click)
            hasRelated: null,
            hasLink: null,
            hasTag: null,
            // "Has Bookmarks" — item whose attachment(s) carry reader bookmarks
            // (Weavero's per-attachment store). Tri-state, no scope.
            hasBookmarks: null,
            // Per-filter row-kind scope for the three cross-level
            // tri-states. Default all-on = current behavior (filter
            // applies to every kind). Each key maps to a row kind:
            //   annotation = annotation rows
            //   attachment = attachment rows + item notes (notes
            //                 attached to a regular item — same
            //                 tree level)
            //   parent     = regular items + standalone notes
            //                 (top-level rows)
            // Unchecking a kind makes the filter relax through for
            // that kind (the row passes regardless of the property).
            hasRelatedScope: { annotation: true, attachment: true, parent: true },
            // Has Link's scope keys are text-source-specific rather
            // than row-kind-generic, since URL detection only makes
            // sense in three text fields:
            //   annotationComment → annotation.annotationComment
            //   itemNoteText      → note body, child notes
            //   standaloneText    → note body, top-level notes
            // Other row kinds (attachment, regular item) never
            // satisfy Has Link and aren't surfaced in the scope.
            hasLinkScope: {
                annotationComment: true,
                itemNoteText: true,
                standaloneText: true,
            },
            // Shared scope for BOTH the Has Tag (presence) filter
            // and the Tag (specific value) filter. They're two
            // facets of the same concept — splitting their scope
            // confuses users (setting "no parent" on one would not
            // affect the other). One field, one picker, applied to
            // both filters in `_rowIsPrimary`, `_rowHasOwnKindMatch`,
            // and `_treeSatisfiesCrossLevelScoped`.
            hasTagScope: { annotation: true, attachment: true, parent: true },
            // Quick-search scope: restricts which row kinds the
            // popup-integrated quick search may surface. Default is
            // all-on (no restriction → Zotero's native whole-tree
            // match + cascade survives). Toggling a kind off drops
            // rows of that kind from the result set after Zotero's
            // search produces it; ancestors of kept rows are
            // preserved by the existing cascade. The actual search
            // query lives in Zotero's `#zotero-tb-search` box (the
            // popup input synchronises with it bidirectionally) —
            // we don't duplicate it into group state to avoid two
            // sources of truth.
            quickSearchScope: { annotation: true, attachment: true, parent: true },
            // Note-kind defining tri-states. Strict per-row.
            // (Zotero's UI calls notes attached to a regular item
            // "Item Notes" — `itemNote=true` matches those.)
            //   itemNote=true        → row must be a note attached
            //                          to a regular item
            //   standaloneNote=true  → row must be a top-level
            //                          (parentless) note
            // exclude variants reject those rows.
            itemNote: null,
            standaloneNote: null,
            // Standalone Attachment tile (2026-08-19): tri-state like its
            // note sibling; true = only parentless attachments, false =
            // exclude them. Restriction (ANDs with file type), not a pair.
            standaloneAttachment: null,
            // Parent-targeting tri-state filters (regular items
            // only; non-regulars relax through). Each is `null /
            // true / false` for off / include / exclude.
            hasAbstract: null,
            hasDOI: null,
            hasPMID: null,
            hasPMCID: null,
            hasURL: null,
            hasAttachment: null,
            // Attachment-targeting tri-state — file attachments only.
            hasAnnotations: null,
            // "Has Embedded Annotations" (2026-08-19, MJT) — attachment-
            // level tri-state: true = the file attachment carries at
            // least one PDF-embedded annotation (annotationIsExternal),
            // false = none. Unlike the annotation-level Source chip it
            // does NOT filter annotation rows — an attachment with both
            // kinds still shows all of them.
            hasEmbeddedAnnotations: null,
            // Publication multi-select (parent items only). State
            // shape mirrors Tag / Author / Added By: parallel
            // include + exclude arrays of titles.
            publication: [],
            publicationExclude: [],
            // Read Status multi-select (Zotero Reading List plugin's
            // `Read_Status:` extra-field property; parent items only).
            // Same include/exclude shape as `publication`. Rendered only
            // while that plugin is active; stale saved state is harmless.
            readStatus: [],
            readStatusExclude: [],
            // "In Multiple Libraries" tri-state (parent items only): items
            // with a linked copy (owl:sameAs relation) in ANY other library
            // — the same data the item pane's "Libraries and Collections"
            // box shows. Deliberately a single toggle, not a per-library
            // picker (user 2026-08-05: "I just want a simple toggle…
            // the item pane of those items will tell the full story").
            inOtherLibrary: null,
        };
    }

    /** Returns true iff at least one field in the group is set. */
    _isGroupActive(group) {
        if (!group) return false;
        if (group.annotationColor && group.annotationColor.length) return true;
        if (group.annotationColorExclude && group.annotationColorExclude.length) return true;
        if (group.annotationType && group.annotationType.length) return true;
        if (group.annotationTypeExclude && group.annotationTypeExclude.length) return true;
        if (group.annotationHasComment != null) return true;
        if (group.annotationSource != null) return true;
        if (group.annotationTag && group.annotationTag.length) return true;
        if (group.annotationTagExclude && group.annotationTagExclude.length) return true;
        if (group.annotationAuthor && group.annotationAuthor.length) return true;
        if (group.annotationAuthorExclude && group.annotationAuthorExclude.length) return true;
        if (group.itemType && group.itemType.length) return true;
        if (group.itemTypeExclude && group.itemTypeExclude.length) return true;
        if (group.attachmentFileType && group.attachmentFileType.length) return true;
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) return true;
        if (group.outlineClass && group.outlineClass.length) return true;
        if (group.outlineClassExclude && group.outlineClassExclude.length) return true;
        if (group.outlineFlags && group.outlineFlags.length) return true;
        if (group.outlineFlagsExclude && group.outlineFlagsExclude.length) return true;
        if (group.outlineVerdict && group.outlineVerdict.length) return true;
        if (group.outlineVerdictExclude && group.outlineVerdictExclude.length) return true;
        if (group.addedBy && group.addedBy.length) return true;
        if (group.addedByExclude && group.addedByExclude.length) return true;
        if (group.hasRelated != null) return true;
        if (group.hasLink != null) return true;
        if (group.hasBookmarks != null) return true;
        if (group.hasTag != null) return true;
        if (group.itemNote != null) return true;
        if (group.standaloneNote != null) return true;
        if (group.standaloneAttachment != null) return true;
        if (group.hasAbstract != null) return true;
        if (group.hasDOI != null) return true;
        if (group.hasPMID != null) return true;
        if (group.hasPMCID != null) return true;
        if (group.hasURL != null) return true;
        if (group.hasAttachment != null) return true;
        if (group.hasAnnotations != null) return true;
        if (group.hasEmbeddedAnnotations != null) return true;
        if (group.publication && group.publication.length) return true;
        if (group.publicationExclude && group.publicationExclude.length) return true;
        if (group.readStatus && group.readStatus.length) return true;
        if (group.readStatusExclude && group.readStatusExclude.length) return true;
        if (group.inOtherLibrary != null) return true;
        // Quick-search scope only counts as active when at least
        // one kind is excluded — an all-on scope is the default
        // no-op and wouldn't justify installing our patches by
        // itself.
        if (group.quickSearchScope
            && (group.quickSearchScope.annotation === false
                || group.quickSearchScope.attachment === false
                || group.quickSearchScope.parent === false)) return true;
        return false;
    }

    /** Returns true iff any group has any active condition or any
     *  global filter (Collection / Saved Search) is set. */
    _isFilterActive(state) {
        if (!state) return false;
        if (state.collections && state.collections.length) return true;
        if (state.collectionsExclude && state.collectionsExclude.length) return true;
        if (state.savedSearches && state.savedSearches.length) return true;
        if (state.savedSearchesExclude && state.savedSearchesExclude.length) return true;
        if (!state.groups) return false;
        return state.groups.some(g => this._isGroupActive(g));
    }

    /** Resolve which row kinds Ctrl+A should select (and which the
     *  items tree should dim). Returns `{parent, attachment, annotation}`
     *  booleans.
     *
     *  Precedence:
     *   1. If the user has explicitly set the Selection Target chips
     *      (some kind included or excluded) → honour that (included
     *      kinds, or all-but-excluded when only excludes are set).
     *   2. Otherwise — the *smart default* — collect which level each
     *      active *category-specific* filter pins:
     *        - annotation ← annotation colour / type / has-comment /
     *          annotation-tag / annotation-author
     *        - attachment ← the attachment file-type filter
     *        - parent     ← item-type / has-abstract / has-DOI /
     *          has-URL / has-attachment / publication
     *      Target = the union of those levels (one filter category → one
     *      level; two categories → both; three → all). With no
     *      category-specific filters, or any *cross-level* filter active
     *      (added-by, has-related, has-links, has-tag, item-note,
     *      standalone-note, has-annotations, collection, saved-search)
     *      → all kinds.
     *
     *  This is what most people want: filter by annotation colour →
     *  Ctrl+A grabs the annotations, not the ancestor rows the tree
     *  keeps around for shape; filter by annotation colour AND item type
     *  → it grabs both. The chips still override it. */
    /** Does the active filter target CHILD rows (attachments/annotations)?
     *
     *  Gates the Order-B re-route. That re-route re-runs Zotero's search
     *  refresh so a chip-matching CHILD the search alone dropped gets
     *  re-added — necessary for annotation/attachment chips, and pure
     *  damage for parent-level ones.
     *
     *  Measured 9 Aug 2026, mode `fields`, chip = itemType journalArticle:
     *  with the re-route the view is 6 165 top-level items against a
     *  ground truth of 6 166 (it drops items that match the search
     *  DIRECTLY — they disappear from Zotero's raw `_rows` during the
     *  rebuild); with it suppressed the view is exactly 6 166, missing 0,
     *  extra 0. Suppressing it unconditionally is NOT an option: it
     *  regresses annotationColor badly, which is the case it was written
     *  for.
     *
     *  Reuses `_effectiveSelectionTargetKinds` rather than a second
     *  dimension list, so a new dimension cannot be classified one way
     *  here and another way there. Defaults to TRUE on any doubt — the
     *  old behaviour — so an unclassified filter keeps the re-route. */
    _wvFilterTargetsChildren(): boolean {
        try {
            // Judge the CHIPS ONLY. `_effectiveSelectionTargetKinds` is the
            // wrong oracle here: it also folds in cross-level scopes and
            // the QUICK SEARCH's own scope, which defaults to all three row
            // kinds. With a search live it therefore answered "targets
            // children" for a pure itemType chip and the re-route fired
            // anyway — measured 9 Aug 2026: kinds
            // {parent,attachment,annotation} all true with only itemType
            // set, and item 3772 lost as a result. The same probe with no
            // search live returned parent-only, which is what made the gate
            // look correct when it was first written.
            const g: any = this._activeGroup();
            if (!g) return true;
            const levels = this._wvDimLevels();
            const isSet = (f: string) => {
                const v = g[f];
                if (v == null) return false;
                return Array.isArray(v) ? v.length > 0 : v !== false;
            };
            for (const f of levels.annotation) if (isSet(f)) return true;
            for (const f of levels.attachment) if (isSet(f)) return true;
            // Cross-level dimensions (Has Tag / Has Related / Has Link /
            // Added By) CAN match children, so they keep the re-route.
            for (const f of ["hasTag", "hasRelated", "hasLink",
                "addedBy", "addedByExclude"]) {
                if (isSet(f)) return true;
            }
            return false;
        }
        catch (e) { return true; }
    }

    /** Which row LEVEL each filter dimension targets. Single source of
     *  truth, shared by `_effectiveSelectionTargetKinds` (which also folds
     *  in cross-level scopes and the quick search) and by
     *  `_wvFilterTargetsChildren` (which must NOT). */
    _wvDimLevels(): Record<string, string[]> {
        return {
            annotation: ["annotationColor", "annotationColorExclude", "annotationType",
                "annotationTypeExclude", "annotationHasComment",
                "annotationSource",
                "annotationAuthor", "annotationAuthorExclude"],
            attachment: ["attachmentFileType", "attachmentFileTypeExclude",
                "outlineClass", "outlineClassExclude",
                "outlineFlags", "outlineFlagsExclude",
                "outlineVerdict", "outlineVerdictExclude"],
            parent: ["itemType", "itemTypeExclude", "hasAbstract", "hasDOI",
                "hasPMID", "hasPMCID", "hasURL",
                "hasAttachment", "publication", "publicationExclude",
                "readStatus", "readStatusExclude", "inOtherLibrary"],
        };
    }

    _effectiveSelectionTargetKinds() {
        const ALL = { parent: true, attachment: true, note: true, annotation: true };
        const fs = this._filterState || {};
        const tgt = fs.selectionTarget || {};
        const exc = fs.selectionTargetExclude || {};
        if (tgt.parent || tgt.attachment || tgt.note || tgt.annotation) {
            return { parent: !!tgt.parent, attachment: !!tgt.attachment, note: !!tgt.note, annotation: !!tgt.annotation };
        }
        if (exc.parent || exc.attachment || exc.note || exc.annotation) {
            return { parent: !exc.parent, attachment: !exc.attachment, note: !exc.note, annotation: !exc.annotation };
        }
        // --- smart default ---
        if (!this._isFilterActive(fs)) return { ...ALL };
        // Global (state-level) filters are cross-level → don't narrow.
        if ((fs.collections && fs.collections.length)
            || (fs.collectionsExclude && fs.collectionsExclude.length)
            || (fs.savedSearches && fs.savedSearches.length)
            || (fs.savedSearchesExclude && fs.savedSearchesExclude.length)) {
            return { ...ALL };
        }
        // Per-group filter fields, grouped by which row kind they pin.
        // `annotationTag` is NOT in here — despite the name (historical;
        // the field was introduced for annotations), its check in
        // `_rowIsPrimary` runs against `item.getTags()` which works for
        // every item kind. Treat it as cross-level so the Selection
        // Target smart-default picks all three kinds (parent +
        // attachment + annotation), matching the user's expectation
        // when filtering by a tag that may sit on any row.
        const CAT: Record<string, string[]> = this._wvDimLevels();
        const isSet = (g, f) => {
            const v = g[f];
            if (v == null) return false;
            return Array.isArray(v) ? v.length > 0 : true;
        };
        // Mapping from a multi-scope (cross-level) filter's scope
        // object to the row-kind categories it actually targets.
        // Multi-scope filters used to be uniformly NEUTRAL and
        // forced the selection target back to ALL — but the user
        // wants the target narrowed to the row kinds the filter's
        // scope actually allows (e.g. Has Tag scoped to "Annotation"
        // only should leave Ctrl+A selecting annotations only).
        const addScopedKinds = (g) => {
            // Generic row-kind scope (Has Related / Has Tag).
            const rowScopedFields = [
                { f: "hasRelated", s: "hasRelatedScope" },
                { f: "hasTag",     s: "hasTagScope" },
            ];
            for (const { f, s } of rowScopedFields) {
                if (!isSet(g, f)) continue;
                const sc = g[s] || { annotation: true, attachment: true, parent: true };
                for (const k of ["annotation", "attachment", "note", "parent"]) {
                    if (this._wvScopeAllows(sc, k)) cats.add(k);
                }
            }
            // Has Link — text-source-specific scope keys mapped to
            // their natural row-kind buckets.
            if (isSet(g, "hasLink")) {
                const sc = g.hasLinkScope || { annotationComment: true, itemNoteText: true, standaloneText: true };
                if (sc.annotationComment !== false) cats.add("annotation");
                // Both note-text sources live on note-kind rows now.
                if (sc.itemNoteText !== false) cats.add("note");
                if (sc.standaloneText !== false) cats.add("note");
            }
            // Added By — topLevel→parent, attachments→attachment,
            // annotations→annotation.
            if (isSet(g, "addedBy") || isSet(g, "addedByExclude")) {
                const sc = g.addedByScope || { topLevel: true, attachments: true, annotations: true };
                if (sc.topLevel !== false) cats.add("parent");
                if (sc.attachments !== false) cats.add("attachment");
                if (sc.annotations !== false) cats.add("annotation");
                if (sc.notes !== undefined
                    ? sc.notes !== false : sc.topLevel !== false) cats.add("note");
            }
            // Single-kind neutrals — they only apply to one row
            // kind, so they contribute exactly that kind.
            if (isSet(g, "itemNote")) cats.add("note");
            if (isSet(g, "standaloneNote")) cats.add("note");
            if (isSet(g, "standaloneAttachment")) cats.add("attachment");
            if (isSet(g, "hasAnnotations")) cats.add("attachment");
            if (isSet(g, "hasEmbeddedAnnotations")) cats.add("attachment");
            // Tag filter (annotationTag) — cross-level: matches any
            // row whose own tags contain the chosen tag. Shares the
            // `hasTagScope` with Has Tag (both are tag concepts;
            // their scopes are unified for simpler UX).
            if (isSet(g, "annotationTag") || isSet(g, "annotationTagExclude")) {
                const sc = g.hasTagScope
                    || { annotation: true, attachment: true, parent: true };
                for (const k of ["annotation", "attachment", "note", "parent"]) {
                    if (this._wvScopeAllows(sc, k)) cats.add(k);
                }
            }
            // Quick-search scope is also row-kind-scoped — include
            // its allowed kinds when an actual search is typed.
            if (this._currentQuickSearchValue && g.quickSearchScope) {
                const sc = g.quickSearchScope;
                for (const k of ["annotation", "attachment", "note", "parent"]) {
                    if (this._wvScopeAllows(sc, k)) cats.add(k);
                }
            }
        };
        const cats = new Set<string>();
        for (const g of (fs.groups || [])) {
            if (!g || !this._isGroupActive(g)) continue;
            for (const cat of ["annotation", "attachment", "parent"]) {
                if (CAT[cat].some(f => isSet(g, f))) cats.add(cat);
            }
            addScopedKinds(g);
        }
        // 1 category → just that kind; 2 categories → those kinds;
        // 3 (or 0, which shouldn't happen given _isFilterActive) →
        // all kinds.
        if (cats.size >= 1 && cats.size <= 3) {
            return { parent: cats.has("parent"), attachment: cats.has("attachment"), note: cats.has("note"), annotation: cats.has("annotation") };
        }
        return { ...ALL };
    }

    /** Re-sync the `data-auto` cue on the Selection Target chips of an
     *  open filter popup to whatever `_effectiveSelectionTargetKinds`
     *  currently resolves to (when no chip is explicitly set and the
     *  active filters pin one kind). Cheap; safe to call on every items-
     *  tree paint and after any filter change. No-op if `panel` doesn't
     *  contain a Selection Target bar. */
    _updateSelectionTargetAutoCues(panel) {
        try {
            const bar = panel && panel.querySelector
                && panel.querySelector(".wv-filter-seltarget-bar");
            if (!bar) return;
            const fs = this._filterState || {};
            const ti = fs.selectionTarget || {}, te = fs.selectionTargetExclude || {};
            const noExplicit = !(ti.parent || ti.attachment || ti.note || ti.annotation
                || te.parent || te.attachment || te.note || te.annotation);
            const eff = this._effectiveSelectionTargetKinds();
            const narrowed = noExplicit && !(eff.parent && eff.attachment && eff.note && eff.annotation);
            for (const btn of bar.querySelectorAll(".wv-filter-scope-toggle") as any) {
                const key = btn.dataset && btn.dataset.key;
                if (!key) continue;
                const explicit = !!(ti[key] || te[key]);
                if (!explicit && narrowed && eff[key]) {
                    if (btn.dataset.auto !== "true") {
                        btn.dataset.auto = "true";
                        const baseTip = btn.title.split("  •  Auto:")[0];
                        btn.title = baseTip
                            + "  •  Auto: your active filters only target this kind, so that's what Ctrl+A selects. Click any kind to set it manually.";
                    }
                } else if (btn.dataset.auto) {
                    delete btn.dataset.auto;
                    btn.title = btn.title.split("  •  Auto:")[0];
                }
            }
        } catch (e) {}
    }

    /** True iff the row passes the GLOBAL filters at the bottom of
     *  the panel: Collection membership and Saved Search match.
     *  Both are OR within (any of the selected collections /
     *  searches matches), AND across the two filters. Empty filter
     *  → trivially passes. Annotations/attachments inherit their
     *  enclosing regular item's collection membership for the
     *  purpose of this check (so collection-filtering keeps
     *  whole subtrees together). */
    _rowPassesGlobalFilters(item, state) {
        if (!item || !state) return true;
        const owner = (item.isRegularItem && item.isRegularItem())
            ? item
            : this._getEnclosingRegularItem(item);
        const itemCols = owner && owner.getCollections
            ? owner.getCollections()
            : [];
        if (state.collections && state.collections.length) {
            const has = itemCols.some(id => state.collections.includes(id));
            if (!has) return false;
        }
        if (state.collectionsExclude && state.collectionsExclude.length) {
            const inExc = itemCols.some(
                id => state.collectionsExclude.includes(id));
            if (inExc) return false;
        }
        if ((state.savedSearches && state.savedSearches.length)
            || (state.savedSearchesExclude && state.savedSearchesExclude.length)) {
            const candidate = owner ? owner.id : item.id;
            if (state.savedSearches && state.savedSearches.length) {
                const idSet = this._savedSearchResults;
                if (!idSet) return false; // not yet computed
                if (!idSet.has(candidate)) return false;
            }
            if (state.savedSearchesExclude && state.savedSearchesExclude.length) {
                const exSet = this._savedSearchExcludeResults;
                if (!exSet) return false; // not yet computed
                if (exSet.has(candidate)) return false;
            }
        }
        return true;
    }

    /** Convenience: the group new chips / section toggles target. */
    _activeGroup() {
        const s = this._filterState;
        if (!s || !s.groups || !s.groups.length) return null;
        const i = Math.max(0,
            Math.min(s.activeGroupIndex || 0, s.groups.length - 1));
        return s.groups[i];
    }

    /** Walk parents until we find a regular item (book, article, …).
     *  Annotations live under attachments, attachments under regular
     *  items — the regular item is what carries author/type/etc. */
    _getEnclosingRegularItem(item) {
        if (!item) return null;
        if (item.isRegularItem && item.isRegularItem()) return item;
        if (item.parentItemID) {
            const p = Zotero.Items.get(item.parentItemID);
            if (p) return this._getEnclosingRegularItem(p);
        }
        return null;
    }

    /** Annotation author name — uses `annotationAuthorName` for users
     *  without a registered Zotero account, falling back to
     *  `Zotero.Users.getName(createdByUserID)` for users with an
     *  account, and "(local)" for the local user (no createdByUserID). */
    _getAnnotationAuthor(ann) {
        try {
            if (ann.annotationAuthorName) return ann.annotationAuthorName;
            const uid = ann.createdByUserID;
            if (uid != null && Zotero.Users && Zotero.Users.getName) {
                const n = Zotero.Users.getName(uid);
                if (n) return n;
            }
        } catch (e) {}
        return "(local)";
    }

    /** User name for the group-library member who added this item.
     *  Annotations carry the same `createdByUserID` field — for
     *  group annotations this is who drew the highlight. Returns
     *  empty string when the field isn't set (typical for items in
     *  the user's own library). */
    _getItemAddedBy(item) {
        if (!item) return "";
        try {
            const uid = item.createdByUserID;
            if (uid != null && uid !== false && Zotero.Users
                && Zotero.Users.getName) {
                const n = Zotero.Users.getName(uid);
                if (n) return n;
            }
        } catch (e) {}
        return "";
    }

    /** Read `data-wv-added-by` / `data-wv-added-by-color` from the
     *  comment cell and append a fresh badge as the cell's last
     *  child. Called both from the renderRow patch (initial) and
     *  from `_markCellLinks` after the cell is wiped + rebuilt with
     *  `.wv-text-wrap` and `.wv-tree-icon`. The badge ends up after
     *  `.wv-text-wrap` and before any later-inserted right-edge
     *  icons (related icon etc.). Idempotent — removes any prior
     *  `.wv-annotation-added-by` first. */
    _appendAddedByBadgeFromCell(cell) {
        if (!cell) return;
        const name = cell.getAttribute("data-wv-added-by");
        if (!name) return;
        const old = cell.querySelector(":scope > .wv-annotation-added-by");
        if (old) old.remove();
        const colour = cell.getAttribute("data-wv-added-by-color");
        const doc = cell.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const badge = doc.createElementNS(NS_HTML, "span");
        badge.className = "wv-annotation-added-by";
        badge.textContent = name;
        badge.title = "Added by " + name;
        if (colour && this._getEnableAddedByColors()) {
            badge.style.color = colour;
            badge.style.backgroundColor = this._withAlpha(colour, 0.18);
        }
        // Insert before any link-icon (.wv-tree-icon for the URL
        // chain) or related-icon (.wv-tree-rel-icon for the
        // relations badge) so the order ends as
        // [text] [badge] [link icon] [relations icon]. Otherwise
        // append at the end of the cell — any later-arriving icon
        // (added by _markCellLinks / _decorateAnnotationRowRelations)
        // appends after the badge naturally.
        const icon = cell.querySelector(
            ":scope > .wv-tree-icon, :scope > .wv-tree-rel-icon");
        if (icon) icon.before(badge);
        else cell.appendChild(badge);
    }

    /** Fallback for annotation types with no `.annotation-comment`
     *  cell (image / ink / type-name placeholder). Insert the badge
     *  as a sibling right after the title cell. */
    _appendAddedByBadgeAfterTitle(rowDiv, name) {
        if (!rowDiv || !name) return;
        const old = rowDiv.querySelector(":scope > .wv-annotation-added-by");
        if (old) old.remove();
        const doc = rowDiv.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const badge = doc.createElementNS(NS_HTML, "span");
        badge.className = "wv-annotation-added-by";
        badge.textContent = name;
        badge.title = "Added by " + name;
        if (this._getEnableAddedByColors()) {
            const colour = this._colorForUser(name);
            badge.style.color = colour;
            badge.style.backgroundColor = this._withAlpha(colour, 0.18);
        }
        const title = rowDiv.querySelector(":scope > .cell.title");
        if (title) title.after(badge);
        else rowDiv.appendChild(badge);
    }

    /** Stable per-user accent colour. Hashes the user name to an
     *  index into a small palette so each user always gets the same
     *  colour (and different users get visually distinct ones).
     *  Palette mirrors Zotero's annotation/tag colours so the
     *  badges feel native. */
    _colorForUser(name) {
        const palette = [
            "#5e6ad2", // indigo
            "#2ea8e5", // azure
            "#5fb236", // green
            "#a28ae5", // purple
            "#e56eee", // magenta
            "#f19837", // orange
            "#ff6666", // red
            "#aaaaaa", // gray
        ];
        if (!name) return palette[0];
        let h = 0;
        for (let i = 0; i < name.length; i++) {
            h = ((h * 31) + name.charCodeAt(i)) | 0;
        }
        return palette[Math.abs(h) % palette.length];
    }

    /** Convert a #rrggbb hex colour + 0..1 alpha into an `rgba(...)`
     *  string. Used to derive a tinted badge background from the
     *  text colour without hand-defining a separate per-user
     *  background palette. */
    _withAlpha(hex, alpha) {
        if (!hex || hex[0] !== "#" || hex.length !== 7) return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }

    /** Patch `AnnotationItemTreeRow.renderRow` (upstream
     *  itemTreeRow.js:510) so an "added-by" badge appears at the
     *  end of the annotation's row content. Annotation rows are
     *  rendered as a single line (icon + text + comment), not split
     *  into per-column cells, so a column-based approach doesn't
     *  surface this info. The class isn't on Zotero global — find
     *  its prototype via the first existing annotation row in the
     *  active items view, then monkey-patch. Idempotent. */
    _ensureAnnotationRowPatched() {
        if (this._annotationRowPatched) return;
        const win = Zotero.getMainWindow();
        const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        const rp = itemsView && itemsView.rowProvider;
        if (!rp || !rp._rows) return;
        let annRow = null;
        for (const r of rp._rows) {
            if (r && r.type === "annotation") { annRow = r; break; }
        }
        if (!annRow) return;
        const proto = Object.getPrototypeOf(annRow);
        if (!proto || typeof proto.renderRow !== "function") return;
        if (proto._wvRenderRowOrig) {
            this._annotationRowPatched = proto;
            return;
        }
        const origRender = proto.renderRow;
        proto._wvRenderRowOrig = origRender;
        const self = this;
        proto.renderRow = function (div, index, columns, rowData, renderCtx) {
            origRender.call(this, div, index, columns, rowData, renderCtx);
            try {
                if (!self._getEnableAnnotationAddedBy()) return;
                const ann = this.ref;
                const addedBy = self._getItemAddedBy(ann);
                if (!addedBy) return;
                // Three layouts:
                //   1. highlight / underline WITH comment — separate
                //      `.cell.annotation-comment` exists; badge goes
                //      inside the comment cell.
                //   2. highlight / underline WITHOUT comment — only
                //      `.cell.title` exists, holding the highlighted
                //      text wrapped in quotation marks via CSS
                //      pseudo-elements (`q-mark-close` on the title
                //      renders the closing quote ::after the cell).
                //      Badge must sit OUTSIDE the title cell as a
                //      row sibling, otherwise it lands BEFORE the
                //      closing quote and reads as "inside the
                //      highlighted text".
                //   3. note / text / image / ink — title cell holds
                //      the comment / type-name. Badge goes inside
                //      the title cell, before any link / rel icon.
                const commentCell = div.querySelector(".cell.annotation-comment");
                if (commentCell) {
                    commentCell.setAttribute("data-wv-added-by", addedBy);
                    commentCell.setAttribute("data-wv-added-by-color",
                        self._colorForUser(addedBy));
                    self._appendAddedByBadgeFromCell(commentCell);
                    return;
                }
                const isQuoted = ["highlight", "underline"]
                    .includes(ann.annotationType);
                if (isQuoted) {
                    self._appendAddedByBadgeAfterTitle(div, addedBy);
                    return;
                }
                const titleCell = div.querySelector(".cell.title");
                if (!titleCell) return;
                titleCell.setAttribute("data-wv-added-by", addedBy);
                titleCell.setAttribute("data-wv-added-by-color",
                    self._colorForUser(addedBy));
                self._appendAddedByBadgeFromCell(titleCell);
            } catch (e) {
                Zotero.debug("[Weavero] annotation row badge err: " + e);
            }
        };
        this._annotationRowPatched = proto;
        // Force a re-render of currently visible annotation rows so
        // the badge appears immediately rather than waiting for the
        // next data event.
        try { itemsView.tree && itemsView.tree.invalidate(); } catch (e) {}
    }

    /** Restore `ZoteroItemTreeRow.prototype.getChildItems` — peel every one
     *  of our wrappers back to Zotero's true original. Called from destroy();
     *  without it the prototype patch outlives plugin disable and keeps
     *  filtering context-attachment rows from dead code. Mirrors the peel
     *  loop in `_patchHideContextAttachments`. */
    _unpatchHideContextAttachments() {
        try {
            // EVERY main window has its OWN ZoteroItemTreeRow prototype (the
            // itemTree module loads per window scope) — peel each of them, not
            // just the focused window's (the anchor's prototype stayed wrapped
            // after a disable when a managed window happened to be focused).
            const wins = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()].filter(Boolean);
            for (const win of wins) {
                try {
                    const rp: any = win && win.ZoteroPane
                        && win.ZoteroPane.itemsView
                        && win.ZoteroPane.itemsView.rowProvider;
                    if (!rp || !rp._rows || !rp._rows.length) continue;
                    let ZIRProto: any = null;
                    for (const r of rp._rows) {
                        const it = r && r.ref;
                        if (!it) continue;
                        if (it.isRegularItem && it.isRegularItem()) {
                            ZIRProto = Object.getPrototypeOf(r);
                            break;
                        }
                    }
                    if (!ZIRProto) continue;
                    let guard = 0;
                    while (guard++ < 8) {
                        const cur: any = ZIRProto.getChildItems;
                        const isOurs = cur && (cur._wvWeaveroWrapper
                            || /weavero\.showContextAttachmentRows/.test(String(cur)));
                        if (!isOurs) break;
                        if (!ZIRProto._wvOrigGetChildItems) break;   // legacy layer, no stored original — restart clears
                        ZIRProto.getChildItems = ZIRProto._wvOrigGetChildItems;
                        delete ZIRProto._wvOrigGetChildItems;
                    }
                    delete ZIRProto._wvHideCtxAttPatched;
                } catch (e) {}
            }
        } catch (e) {}
    }

    _unpatchAnnotationRow() {
        const proto = this._annotationRowPatched;
        if (proto && proto._wvRenderRowOrig) {
            try { proto.renderRow = proto._wvRenderRowOrig; } catch (e) {}
            try { delete proto._wvRenderRowOrig; } catch (e) {}
        }
        this._annotationRowPatched = null;
    }

    /** All author names associated with `item`. For annotations: the
     *  annotation author (group-library user). For other items: the
     *  item's creators (authors), formatted as "First Last". */
    _getItemAuthors(item) {
        const out = [];
        if (!item) return out;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                // Annotations don't have item creators — fall back to
                // the annotation author (the group-library user who
                // drew the highlight).
                out.push(this._getAnnotationAuthor(item));
                return out;
            }
            const creators = (item.getCreators && item.getCreators()) || [];
            for (const c of creators) {
                const name = c.name
                    || ((c.firstName || "") + " " + (c.lastName || "")).trim();
                if (name) out.push(name);
            }
        } catch (e) {}
        return out;
    }

    /** Per-row filter check against a single group. Filters that
     *  target a specific kind (annotationColor, attachmentFileType,
     *  itemType) DON'T fail rows of other kinds — they simply skip.
     *  Cross-kind JOIN constraints are enforced by
     *  `_rowSatisfiesTreeJoin`; "did this row hit on its own kind?"
     *  is handled by `_rowHasOwnKindMatch`. Universal filters (tag,
     *  author, addedBy with the row in scope) apply to every row. */
    _rowPassesFilters(item, group, opts?) {
        if (!item || !group) return false;
        opts = opts || {};

        // Kind-specific filters now use a TREE-JOIN model: filters
        // that target a kind don't fail rows of OTHER kinds — they
        // simply don't apply. This lets `annotationColor=yellow`
        // and `attachmentFileType=PDF` co-exist (the yellow
        // annotation passes the relaxed attachmentFileType, and
        // the PDF attachment passes the relaxed annotationColor).
        // The cross-kind JOIN constraint is then enforced separately
        // by `_rowSatisfiesTreeJoin` (the tree must contain a
        // matching row at every kind a filter targets).
        if (group.itemType && group.itemType.length) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && !group.itemType.includes(item.itemType)) {
                return false;
            }
        }
        if (group.itemTypeExclude && group.itemTypeExclude.length) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && group.itemTypeExclude.includes(item.itemType)) {
                return false;
            }
        }
        if (group.attachmentFileType && group.attachmentFileType.length) {
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                if (!this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileType)) return false;
            }
        }
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) {
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                if (this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileTypeExclude)) return false;
            }
        }
        // DEV outline-eval facets — attachment-resolving. Source + Verdict use OR
        // (any-of); Flags use AND (must have all selected). Excludes are always
        // has-any -> reject.
        if (item.isAttachment && item.isAttachment()) {
            if (group.outlineClass && group.outlineClass.length
                && !this._outlineMatchesList(item, group.outlineClass)) return false;
            if (group.outlineClassExclude && group.outlineClassExclude.length
                && this._outlineMatchesList(item, group.outlineClassExclude)) return false;
            if (group.outlineFlags && group.outlineFlags.length
                && !this._outlineMatchesAll(item, group.outlineFlags)) return false;
            if (group.outlineFlagsExclude && group.outlineFlagsExclude.length
                && this._outlineMatchesList(item, group.outlineFlagsExclude)) return false;
            if (group.outlineVerdict && group.outlineVerdict.length
                && !this._outlineMatchesList(item, group.outlineVerdict)) return false;
            if (group.outlineVerdictExclude && group.outlineVerdictExclude.length
                && this._outlineMatchesList(item, group.outlineVerdictExclude)) return false;
        }
        if (group.annotationColor && group.annotationColor.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && !group.annotationColor.includes(item.annotationColor)) {
                return false;
            }
        }
        if (group.annotationColorExclude && group.annotationColorExclude.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && group.annotationColorExclude.includes(item.annotationColor)) {
                return false;
            }
        }
        if (group.annotationType && group.annotationType.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && !group.annotationType.includes(item.annotationType)) {
                return false;
            }
        }
        if (group.annotationTypeExclude && group.annotationTypeExclude.length) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && group.annotationTypeExclude.includes(item.annotationType)) {
                return false;
            }
        }
        if (group.annotationHasComment != null) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn) {
                const txt = item.annotationComment;
                const hasComment = !!(txt && String(txt).trim().length);
                if (hasComment !== group.annotationHasComment) return false;
            }
        }
        if (group.annotationSource != null) {
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            if (isAnn && !this._annSourceMatches(item, group.annotationSource)) {
                return false;
            }
        }
        // Cross-level checks — apply to every row kind, strict
        // per-row matching. Each item is evaluated independently;
        // descendants of a matching parent are NOT auto-kept by
        // virtue of the parent matching (so picking Has Related
        // on a parent only shows the parent + the cascade-required
        // ancestors, not the parent's full subtree). Ancestor-keep
        // for tree shape happens via `_hasMatchingAnnotation` in
        // the apply loop, which is what brings the parent in when
        // a descendant matches.
        // Cross-level scoped chips (Has Related, Has Link, Has
        // Tag) are TREE-LEVEL constraints per Rule 4 — handled
        // by `_treeSatisfiesCrossLevelScoped` in
        // `_rowSatisfiesTreeJoin`, not per-row here. If we
        // rejected per-row, a Web Link with no tag would fail
        // when the parent IS tagged, even though the tree
        // satisfies the chip. The row may still become primary
        // VIA the chip (see `_rowHasOwnKindMatch`) when it
        // carries the property itself; if it doesn't, it can
        // still be primary via OTHER chips (e.g.
        // attachmentFileType), and the tree-level check ensures
        // the chip is satisfied somewhere in its scoped kinds.
        // Note-kind defining filters. Strict per-row check: when
        // include is set, ONLY note items of the requested sub-kind
        // pass; everything else fails. Exclude rejects the matching
        // sub-kind. The cascade still keeps ancestors of the few
        // notes that match (item notes pull in their parent regular
        // item) because `_hasMatchingAnnotation` walks `item.getNotes`
        // and returns true for any primary descendant.
        // Note-kind filters — RELAX on non-notes (they're a
        // different row kind, so the chip doesn't apply to them).
        // This gives OR semantics with other kind-targeting chips
        // in the same group: itemType=book + itemNote=true keeps
        // both books AND item notes, because a row is never
        // simultaneously a regular item AND a note; AND'ing the
        // two makes the group empty by definition.
        // Standalone Note <-> Item Note are the NOTE kind's Rule 1 OR
        // pair (2026-08-19, MJT): mutually exclusive positions, so both
        // INCLUDES together mean "either kind of note" -- the AND
        // reading was a guaranteed contradiction (zero rows). Mixed or
        // exclude directions keep independent per-row semantics.
        if (group.itemNote === true && group.standaloneNote === true) {
            // any note passes; non-notes unaffected here
        }
        else {
            if (group.itemNote != null) {
                const isNote = !!(item.isNote && item.isNote());
                if (isNote) {
                    const isChild = !!item.parentItem;
                    if (isChild !== group.itemNote) return false;
                }
            }
            if (group.standaloneNote != null) {
                const isNote = !!(item.isNote && item.isNote());
                if (isNote) {
                    const isStandalone = !item.parentItem;
                    if (isStandalone !== group.standaloneNote) return false;
                }
            }
        }
        if (group.standaloneAttachment != null) {
            // Standalone Attachment tile (2026-08-19): a RESTRICTION on
            // attachment rows, intersecting with Attachment File Type
            // (standalone + PDF = standalone PDFs). Deliberately NOT an
            // OR pair -- unlike Standalone Note <-> Item Type.
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                const isStandalone = !item.parentItem;
                if (isStandalone !== group.standaloneAttachment) return false;
            }
        }
        // Parent-targeting "Has *" tri-states. Each one only fails
        // when the item IS a regular item and doesn't satisfy the
        // chosen direction. Non-regulars relax through (matches the
        // pattern used by `annotationHasComment` for non-annotations).
        if (group.hasAbstract != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("abstractNote") || "").trim().length);
                if (v !== group.hasAbstract) return false;
            }
        }
        if (group.hasDOI != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && wvItemFieldNonEmpty(item, "DOI", "doi") !== group.hasDOI) return false;
        }
        if (group.hasPMID != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && wvItemHasPubmedId(item, "PMID", WV_PMID_RE) !== group.hasPMID) return false;
        }
        if (group.hasPMCID != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && wvItemHasPubmedId(item, "PMCID", WV_PMCID_RE) !== group.hasPMCID) return false;
        }
        if (group.hasURL != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg && wvItemFieldNonEmpty(item, "url", "url") !== group.hasURL) return false;
        }
        if (group.hasAttachment != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = wvItemHasFileAttachment(item);
                if (v !== group.hasAttachment) return false;
            }
        }
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                // Source-aware: while the Source chip is set, only
                // annotations of that source count — so Source=Zotero
                // + Has Annotations=No means "no annotations I made
                // in Zotero" even when embedded ones exist.
                const anns = item.getAnnotations() || [];
                const v = anns.some(
                    a => this._annSourceMatches(a, group.annotationSource));
                if (v !== group.hasAnnotations) return false;
            }
        }
        if (group.hasEmbeddedAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                // Attachment-level only — deliberately NOT source-
                // scoped and never filters annotation rows.
                const anns = item.getAnnotations() || [];
                const v = anns.some(a => !!(a as any).annotationIsExternal);
                if (v !== group.hasEmbeddedAnnotations) return false;
            }
        }
        // Publication — regular items only.
        const wantedPub = group.publication;
        const wantedPubX = group.publicationExclude;
        if ((wantedPub && wantedPub.length)
            || (wantedPubX && wantedPubX.length)) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const pub = (item.getField
                    && item.getField("publicationTitle")) || "";
                if (wantedPub && wantedPub.length
                    && !wantedPub.includes(pub)) return false;
                if (wantedPubX && wantedPubX.length
                    && wantedPubX.includes(pub)) return false;
            }
        }
        // Read Status (Zotero Reading List) — regular items only.
        const wantedRS = group.readStatus;
        const wantedRSX = group.readStatusExclude;
        if ((wantedRS && wantedRS.length)
            || (wantedRSX && wantedRSX.length)) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const rs = this._wvReadStatusOf(item);
                if (wantedRS && wantedRS.length
                    && !wantedRS.includes(rs)) return false;
                if (wantedRSX && wantedRSX.length
                    && wantedRSX.includes(rs)) return false;
            }
        }
        // In Multiple Libraries — regular items only, via the precomputed
        // linked-relations cache. A COLD cache passes rows through
        // (degraded, never wrong-way filtering); the tile click kicks
        // the async build + re-apply.
        if (group.inOtherLibrary != null && this._wvLinkedLibCacheWarm()) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = this._wvItemInAnyOtherLib(item);
                if (v !== group.inOtherLibrary) return false;
            }
        }
        const wantedTags = group.annotationTag;
        const wantedTagsX = group.annotationTagExclude;
        if ((wantedTags && wantedTags.length)
            || (wantedTagsX && wantedTagsX.length)) {
            // Per-kind scope. Out-of-scope rows fail by default
            // (mirrors `addedBy` — only in-scope rows can be primary
            // by tag alone; ancestors of matches are still kept by
            // the cascade). Subtree-keep walks set
            // `opts.relaxOutOfScopeAddedBy` so out-of-scope rows
            // auto-pass during those probes. Shares `hasTagScope`
            // with the Has Tag filter — one scope, both filters.
            const tagSc = group.hasTagScope
                || { annotation: true, attachment: true, parent: true };
            const inScope = this._wvScopeAllows(
                tagSc, this._rowKindOf(item));
            if (!inScope) {
                if (!opts.relaxOutOfScopeAddedBy) return false;
                // else: skip the tag check entirely (subtree-keep).
            } else {
                const tags = (item.getTags && item.getTags()) || [];
                const names = tags.map(t => t && t.tag).filter(Boolean);
                if (wantedTags && wantedTags.length
                    && !wantedTags.some(t => names.includes(t))) return false;
                if (wantedTagsX && wantedTagsX.length
                    && wantedTagsX.some(t => names.includes(t))) return false;
            }
        }
        const wantedAuthors = group.annotationAuthor;
        const wantedAuthorsX = group.annotationAuthorExclude;
        if ((wantedAuthors && wantedAuthors.length)
            || (wantedAuthorsX && wantedAuthorsX.length)) {
            const authors = this._getItemAuthors(item);
            if (wantedAuthors && wantedAuthors.length
                && !wantedAuthors.some(a => authors.includes(a))) return false;
            if (wantedAuthorsX && wantedAuthorsX.length
                && wantedAuthorsX.some(a => authors.includes(a))) return false;
        }
        const wantedAddedBy = group.addedBy;
        if (wantedAddedBy && wantedAddedBy.length) {
            // Row-kind scope: addedBy applies only to row kinds the
            // user opted into.
            //
            // Default mode (primary check, opts.relaxOutOfScopeAddedBy
            // is false): out-of-scope rows FAIL — they're never
            // primary by addedBy alone. They can still be kept by
            // ancestor-keep (`_hasMatchingAnnotation`) or by the
            // filtered subtree-keep below.
            //
            // Relaxed mode (opts.relaxOutOfScopeAddedBy is true):
            // out-of-scope rows AUTO-PASS — used during subtree-keep
            // so e.g. attachments under a primary top-level item
            // come along when the user said "addedBy applies to
            // top-level only".
            const scope = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            const isAttach = !isAnn
                && !!(item.isAttachment && item.isAttachment());
            const isNt = !isAnn && !isAttach
                && !!(item.isNote && item.isNote());
            const isTopLevel = !isAnn && !isAttach && !isNt;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel)
                || (isNt && (scope.notes !== undefined
                    ? scope.notes !== false : scope.topLevel !== false));
            if (!inScope) {
                if (!opts.relaxOutOfScopeAddedBy) return false;
                // else: skip the addedBy check entirely.
            } else {
                const addedBy = this._getItemAddedBy(item);
                if (!addedBy || !wantedAddedBy.includes(addedBy)) return false;
            }
        }
        const wantedAddedByX = group.addedByExclude;
        if (wantedAddedByX && wantedAddedByX.length) {
            const scope = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            const isAnn = !!(item.isAnnotation && item.isAnnotation());
            const isAttach = !isAnn
                && !!(item.isAttachment && item.isAttachment());
            const isNt = !isAnn && !isAttach
                && !!(item.isNote && item.isNote());
            const isTopLevel = !isAnn && !isAttach && !isNt;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel)
                || (isNt && (scope.notes !== undefined
                    ? scope.notes !== false : scope.topLevel !== false));
            if (inScope) {
                const addedBy = this._getItemAddedBy(item);
                if (addedBy && wantedAddedByX.includes(addedBy)) return false;
            }
        }
        // Quick-search scope: only takes effect when the native
        // quick-search box has a non-empty value (the search itself
        // is owned by Zotero — Zotero produces the parent-promoted
        // `_rows` set, we just drop result rows whose kind is opted
        // out of this group's scope). Out-of-scope rows fail their
        // primary check; ancestors of in-scope matches are still
        // kept by the existing cascade. Bypassed by
        // `relaxOutOfScopeAddedBy` so the subtree-keep walks aren't
        // blocked by the same rule.
        if (this._currentQuickSearchValue
            && group.quickSearchScope
            && !opts.relaxOutOfScopeAddedBy) {
            const k = this._rowKindOf(item);
            if (k) {
                // Out-of-scope kinds: drop entirely.
                if (!this._wvScopeAllows(group.quickSearchScope, k)) return false;
                // Vertical-spine search check — same logic as
                // cross-level chips (Rule 3): the row, or any of its
                // ancestors / descendants whose kind is also in
                // scope, must be in Zotero's strict match set
                // (`searchItemIDs`). Siblings don't count. So a web
                // link under a search-matched parent passes when
                // parent scope is on (parent in spine, parent in
                // scope, parent matched), but fails when parent
                // scope is off (parent in spine, but parent
                // out-of-scope, so doesn't count).
                try {
                    const win = Zotero.getMainWindow();
                    const ivRp = win && win.ZoteroPane
                        && win.ZoteroPane.itemsView
                        && win.ZoteroPane.itemsView.rowProvider;
                    // V9-COMPAT: private fallback.
                    const sids = ivRp
                        && (ivRp.searchItemIDs || ivRp._searchItemIDs);
                    if (sids) {
                        const scope = group.quickSearchScope;
                        const matchesInScope = (it) => {
                            if (!it) return false;
                            const ik = this._rowKindOf(it);
                            if (!ik) return false;
                            if (scope[ik] === false) return false;
                            return sids.has(it.id);
                        };
                        let found = matchesInScope(item);
                        // Ancestors.
                        if (!found) {
                            for (let p = item.parentItem;
                                p && !found; p = p.parentItem) {
                                if (matchesInScope(p)) found = true;
                            }
                        }
                        // Descendants.
                        if (!found) {
                            try {
                                const walkDesc = (it) => {
                                    if (it && it.isRegularItem
                                        && it.isRegularItem()) {
                                        const attIds = (it.getAttachments
                                            && it.getAttachments()) || [];
                                        for (const aid of attIds) {
                                            const a = Zotero.Items.get(aid);
                                            if (matchesInScope(a)) {
                                                found = true; return;
                                            }
                                            if (a && a.isFileAttachment
                                                && a.isFileAttachment()) {
                                                for (const ann of (a.getAnnotations() || [])) {
                                                    if (matchesInScope(ann)) {
                                                        found = true; return;
                                                    }
                                                }
                                            }
                                        }
                                        const noteIds = (it.getNotes
                                            && it.getNotes()) || [];
                                        for (const nid of noteIds) {
                                            if (matchesInScope(
                                                Zotero.Items.get(nid))) {
                                                found = true; return;
                                            }
                                        }
                                    } else if (it && it.isFileAttachment
                                        && it.isFileAttachment()) {
                                        for (const ann of (it.getAnnotations() || [])) {
                                            if (matchesInScope(ann)) {
                                                found = true; return;
                                            }
                                        }
                                    }
                                };
                                walkDesc(item);
                            } catch (e) {}
                        }
                        if (!found) return false;
                    }
                } catch (e) {}
            }
        }
        return true;
    }

    /** Build (and cache) the set of item IDs whose tree-join PATH
     *  contains a quick-search match in the UPWARD direction — that
     *  is, `searchItemIDs` plus every ANCESTOR of a matched item.
     *  A parent/attachment lands in this set when one of its
     *  descendants matched the search, so `_rowIsPrimary` can test
     *  "does my path have a search match below me?" with a single
     *  set lookup instead of walking the row's subtree. The per-row
     *  subtree walk is exactly what made v0.9.1-dev.62 hang
     *  (`items × atts × anns` on the main thread); this propagates
     *  upward from `searchItemIDs` ONCE per search instead
     *  (`|matches| × depth`). The downward direction (a row whose
     *  ANCESTOR matched) stays a bounded upward walk in
     *  `_rowIsPrimary`. Cached by the `sIDs` Set identity — Weavero
     *  replaces that Set on every refresh, so the cache self-
     *  invalidates whenever the search changes. */
    _searchPathAncestorIDs(sIDs) {
        if (!sIDs) return null;
        if (this._wvSearchPathCacheKey === sIDs
            && this._wvSearchPathCache) {
            return this._wvSearchPathCache;
        }
        const set = new Set(sIDs);
        for (const id of sIDs) {
            try {
                const it: any = Zotero.Items.get(id as any);
                let pid: any = it && it.parentItemID;
                let guard = 0;
                // `parentItemID` is `false` (not null) for a top-level
                // item, and `false != null` is true — so guard on
                // truthiness, not `!= null`, or a top-level row adds a
                // spurious `false` to the set. Real item ids are
                // positive integers, so a truthy check is exact.
                while (pid && guard++ < 8) {
                    set.add(pid);
                    const p: any = Zotero.Items.get(pid);
                    pid = p && p.parentItemID;
                }
            } catch (e) {}
        }
        this._wvSearchPathCacheKey = sIDs;
        this._wvSearchPathCache = set;
        return set;
    }

    /** True iff `item` should be a primary kept match. ORs across
     *  the state's groups: the row passes if it satisfies ANY active
     *  group's AND-conjoined fields. */
    _rowIsPrimary(item, state) {
        if (!this._isFilterActive(state)) return false;
        if (!this._rowPassesGlobalFilters(item, state)) return false;
        // Strict per-LEVEL AND, but allow the quick search to match
        // at SELF or any ANCESTOR: a green annotation under a PDF
        // attachment whose TITLE matches the search is primary
        // because its parent satisfies the search at its own level
        // (parent kind-AND) and the annotation satisfies the green
        // chip at hers.
        //
        // Do NOT walk descendants here. The downward direction —
        // parent kept because a child matches — is already handled
        // by the ancestor-of-match keep pass in `apply`, which adds
        // non-primary parents to the kept set when any descendant
        // is primary. Walking descendants in this function caused
        // a hang/crash in v0.9.1-dev.62: it's called many times per
        // row (incl. from `_hasMatchingAnnotation`, which itself
        // iterates children), making the cost effectively
        // `items × atts × anns` on the main thread.
        // `directSearchMatch` = the quick search hit THIS row at its
        // OWN level (the row's id is in Zotero's `_searchItemIDs`).
        // It both gates the path-match requirement below AND counts
        // as an own-kind match in the final predicate — a row whose
        // own level satisfies the cross-level search is a genuine
        // match even when no chip targets its kind. Example: search
        // "Test" + green-annotation + PDF-attachment chips. The
        // parent regular item "Weavero Test Fixtures" has no chip
        // targeting parents, so `_rowHasOwnKindMatch` is false — but
        // its title matches the search at the parent level, so it IS
        // a match and must read white / be Ctrl+A-selectable.
        let directSearchMatch = false;
        if (this._currentQuickSearchValue && item && item.id != null) {
            try {
                const win = Zotero.getMainWindow();
                const iv: any = win && win.ZoteroPane
                    && win.ZoteroPane.itemsView;
                // V9-COMPAT: Zotero 10 exposes the search ids on
                // `rowProvider`; Zotero 9 has no rowProvider and keeps
                // them (private) on the itemsView itself.
                const rp: any = iv && (iv.rowProvider || iv);
                const sIDs = rp && (rp.searchItemIDs
                    || rp._searchItemIDs);
                if (sIDs) {
                    directSearchMatch = sIDs.has(item.id);
                    // Path-wide search match in all three directions:
                    //   - SELF or any DESCENDANT — one set lookup
                    //     against the precomputed ancestor set
                    //     (`searchItemIDs` ∪ ancestors-of-matches).
                    //     This is what lets a parent that matches its
                    //     own-level chip (e.g. Item Type) read white
                    //     when the search hit one of its annotations.
                    //   - any ANCESTOR — a bounded upward walk (e.g.
                    //     a green annotation under a PDF whose title
                    //     matched the search).
                    const pathIDs = this._searchPathAncestorIDs(sIDs);
                    let pathHasSearchMatch = !!(pathIDs
                        && pathIDs.has(item.id));
                    if (!pathHasSearchMatch) {
                        let pid = item.parentItemID;
                        let guard = 0;
                        // Truthy guard, not `!= null`: `parentItemID`
                        // is `false` at the top level (and `false !=
                        // null` is true). Real ids are positive ints.
                        while (pid && guard++ < 8) {
                            if (sIDs.has(pid)) {
                                pathHasSearchMatch = true;
                                break;
                            }
                            const p = Zotero.Items.get(pid);
                            pid = p && p.parentItemID;
                        }
                    }
                    if (!pathHasSearchMatch) return false;
                }
            } catch (e) {}
        }
        // Global-only mode: when no per-section filter is set but
        // the global filters (Collection / Saved Search) are
        // restricted, every row that passes the global filters is
        // primary by virtue of those alone.
        const anyGroupActive = state.groups
            && state.groups.some(g => this._isGroupActive(g));
        if (!anyGroupActive) return true;
        // A row is primary iff:
        //   1. It satisfies the group's filters (kind-specific
        //      filters are RELAXED for non-target rows — see
        //      `_rowPassesFilters`).
        //   2. AT LEAST ONE filter in the group actually targets
        //      this row's kind AND matches, OR the cross-level quick
        //      search matched this row directly. Without (2) every
        //      regular item would trivially pass when the only
        //      active filter is annotation-targeting (because the
        //      annotation filter relaxes for non-annotations) —
        //      we'd flood the result with unrelated parents. The
        //      `|| directSearchMatch` admits the row whose own level
        //      satisfies the search even though no chip pins its kind.
        return state.groups.some(g => this._isGroupActive(g)
            && this._rowPassesFilters(item, g)
            && (this._rowHasOwnKindMatch(item, g) || directSearchMatch)
            && this._rowSatisfiesTreeJoin(item, g));
    }

    /** Tree-JOIN check: when filters in `group` target multiple
     *  kinds (e.g., annotationColor=yellow + attachmentFileType=PDF),
     *  only the path (parent ⊃ attachment ⊃ annotation) where each
     *  level matches its targeting filter is kept.
     *
     *  Concrete behaviours per active filter combination:
     *
     *  - Yellow only      → annotation: passes annOK; ancestor (att, reg)
     *                       trivially OK (no filter targets them).
     *  - PDF only         → attachment: passes attOK; reg trivially OK;
     *                       child annotations not constrained.
     *  - Yellow + PDF     → annotation: passes annOK AND parent
     *                       attachment passes attOK; PDF passes attOK
     *                       AND has a yellow ann child; reg has a PDF
     *                       child with a yellow ann child.
     *  - +itemType=book   → adds reg's filter to every level's check. */
    _rowSatisfiesTreeJoin(item, group) {
        if (!item || !group) return false;
        // Cross-level scoped chips (Has Related, Has Link, Has Tag)
        // contribute a TREE-LEVEL constraint: the item-tree must
        // contain at least one row of the chip's scoped kinds that
        // satisfies the chip's predicate. Without this, e.g.
        // `attachmentFileType=WebLink + Has Related (annotation only)`
        // would wrongly keep Web Link attachments — Web Links have
        // no annotations, so no annotation in the tree could have
        // related items.
        if (!this._treeSatisfiesCrossLevelScoped(item, group)) return false;
        const annActiveOther = (group.annotationColor && group.annotationColor.length)
            || (group.annotationColorExclude && group.annotationColorExclude.length)
            || (group.annotationType && group.annotationType.length)
            || (group.annotationTypeExclude && group.annotationTypeExclude.length)
            || group.annotationHasComment != null;
        const annActive = annActiveOther || group.annotationSource != null;
        // Has Annotations=No + Source (and no other annotation chip)
        // legitimately selects trees with ZERO matching annotations
        // ("attachments I haven't annotated in Zotero") — the usual
        // "annotation-targeting chip needs a matching annotation in
        // the tree" rule would contradict the No and empty the view.
        // Waive it for exactly that combination; when colour/type/
        // comment chips are also set, No stays contradictory (empty),
        // same as before the Source chip existed.
        const annWaived = group.hasAnnotations === false && !annActiveOther;
        const attActive = !!(
            (group.attachmentFileType && group.attachmentFileType.length)
            || (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length)
            || (group.outlineClass && group.outlineClass.length)
            || (group.outlineClassExclude && group.outlineClassExclude.length)
            || (group.outlineFlags && group.outlineFlags.length)
            || (group.outlineFlagsExclude && group.outlineFlagsExclude.length)
            || (group.outlineVerdict && group.outlineVerdict.length)
            || (group.outlineVerdictExclude && group.outlineVerdictExclude.length));
        const regActive = !!(
            (group.itemType && group.itemType.length)
            || (group.itemTypeExclude && group.itemTypeExclude.length));

        const isAnn = !!(item.isAnnotation && item.isAnnotation());
        const isAtt = !isAnn && !!(item.isAttachment && item.isAttachment());
        const isReg = !isAnn && !isAtt
            && !!(item.isRegularItem && item.isRegularItem());

        if (isAnn) {
            if (attActive) {
                const att = item.parentItem;
                if (!att || !this._kindOK(att, group, "attachment")) return false;
            }
            if (regActive) {
                const att = item.parentItem;
                const reg = att && att.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        if (isAtt) {
            if (annActive && !annWaived) {
                // `item.getAnnotations` exists on every Item (it's on
                // the prototype) but THROWS unless the item is a file
                // attachment. Web-link / standalone-link attachments
                // hit this path with attachmentFileType + Has Related
                // active. Gate by `isFileAttachment` instead.
                const anns = (item.isFileAttachment && item.isFileAttachment())
                    ? (item.getAnnotations() || []) : [];
                let hasOK = false;
                for (const a of anns) {
                    if (this._kindOK(a, group, "annotation")) { hasOK = true; break; }
                }
                if (!hasOK) return false;
            }
            if (regActive) {
                const reg = item.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        if (isReg) {
            const noteActive = group.itemNote != null;
            // Attachment-LEVEL constraint: same-level OR between
            // `attachmentFileType` and `itemNote` (Rule 1, both at
            // the attachment tree level). The reg's tree satisfies
            // this level if it has EITHER a matching attachment
            // OR a matching item note.
            const attLevelActive = attActive || noteActive;
            if (attLevelActive) {
                let attLevelOK = false;
                if (attActive) {
                    const attIds = (typeof item.getAttachments === "function")
                        ? (item.getAttachments() || []) : [];
                    for (const aId of attIds) {
                        const att = Zotero.Items.get(aId);
                        if (att && this._kindOK(att, group, "attachment")) {
                            attLevelOK = true;
                            break;
                        }
                    }
                }
                if (!attLevelOK && noteActive) {
                    // itemNote is set — look for a matching note
                    // child (item note = child note of a regular).
                    const noteIds = (typeof item.getNotes === "function")
                        ? (item.getNotes() || []) : [];
                    for (const nId of noteIds) {
                        const n = Zotero.Items.get(nId);
                        if (!n) continue;
                        const isChild = !!n.parentItem;
                        if (isChild === group.itemNote) {
                            attLevelOK = true;
                            break;
                        }
                    }
                }
                if (!attLevelOK) return false;
            }
            // Annotation-LEVEL constraint: AND with attachment-
            // level (Rule 2, cross-level). Annotations only exist
            // under file attachments, so the check walks the same
            // attachment children; item notes are irrelevant here.
            // When `attActive` is set, the annotation must be
            // under an attachment that also satisfies
            // `attachmentFileType`.
            if (annActive && !annWaived) {
                const attIds = (typeof item.getAttachments === "function")
                    ? (item.getAttachments() || []) : [];
                let annLevelOK = false;
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    if (!att) continue;
                    if (attActive && !this._kindOK(att, group, "attachment")) continue;
                    const anns = (att.isFileAttachment && att.isFileAttachment())
                        ? (att.getAnnotations() || []) : [];
                    if (anns.some(a => this._kindOK(a, group, "annotation"))) {
                        annLevelOK = true;
                        break;
                    }
                }
                if (!annLevelOK) return false;
            }
            return true;
        }
        // Notes — only kind left. Notes have no attachments and no
        // annotations of their own, so a group with annActive or
        // attActive set can never be satisfied by a note as
        // "primary at its kind". Without this, a note carrying a
        // matching cross-level filter (e.g. Has Related) AND a
        // kind-active filter (e.g. annotationType=Underline) would
        // wrongly pass tree-join because the fall-through `return
        // true` ignored the unsatisfiable kind constraint.
        const isNote = !!(item.isNote && item.isNote());
        if (isNote) {
            const isChild = !!item.parentItem;
            const isStandalone = !isChild;
            // Per-level OR: a note-kind chip ORs with other chips
            // at the SAME tree level. Item notes sit at the
            // attachment level → an `itemNote`-self-matched note
            // skips `attActive` (e.g. attachmentFileType=PDF +
            // itemNote=true → both PDFs and item notes show). It
            // does NOT skip cross-level constraints (parent-level
            // regActive, annotation-level annActive) — those still
            // AND via tree-join per the rules.
            const itemNoteSelfMatched = group.itemNote != null
                && (isChild === group.itemNote);
            // Standalone notes sit at the parent level → a
            // `standaloneNote`-self-matched note skips `regActive`
            // (e.g. itemType=Book + standaloneNote=true → both
            // books and standalone notes show). It does not skip
            // attActive / annActive (cross-level).
            const standaloneNoteSelfMatched = group.standaloneNote != null
                && (isStandalone === group.standaloneNote);

            // Notes have no annotations of their own → annotation-
            // targeting filters can never be satisfied at the note
            // row; reject. (Same waiver as attachments: under
            // Has Annotations=No + Source, "zero matching
            // annotations" is the SATISFIED state.)
            if (annActive && !annWaived) return false;
            // Same-level OR: skip attActive only when this row is
            // an item note AND itemNote chip matches it.
            if (attActive && !itemNoteSelfMatched) return false;
            // Same-level OR: skip regActive only when this row is
            // a standalone note AND standaloneNote chip matches it.
            if (regActive && !standaloneNoteSelfMatched) {
                const reg = item.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
        }
        return true;
    }

    /** Tree-level enforcement of cross-level scoped chips
     *  (Has Related, Has Link, Has Tag, Item Note, Standalone
     *  Note, Has Annotations, Quick Search scope). For each chip
     *  that's set, walk the item's tree (root regular item +
     *  attachments + their annotations + notes) and verify that
     *  at least one row in the chip's scoped kinds satisfies the
     *  predicate. Returns false on the first chip that fails. */
    _treeSatisfiesCrossLevelScoped(item, group) {
        if (!item || !group) return true;
        // Helpers for predicate-per-kind checks.
        const checkRelated = (it) => {
            if (group.hasRelated == null) return true;
            const rels = (it.relatedItems && it.relatedItems.length) || 0;
            return (rels > 0) === group.hasRelated;
        };
        const checkLink = (it, sk) => {
            if (group.hasLink == null) return true;
            if (!sk) return true; // not a text-source kind
            const sc = group.hasLinkScope;
            if (sc && sc[sk] === false) return true; // out of scope
            const has = this._itemHasLinks(it);
            return has === group.hasLink;
        };
        const checkTag = (it) => {
            if (group.hasTag == null) return true;
            const tags = (it.getTags && it.getTags()) || [];
            return (tags.length > 0) === group.hasTag;
        };
        // True iff `row` of kind `k` satisfies ALL scoped chips
        // whose scope INCLUDES `k`. Chips whose scope EXCLUDES
        // `k` are no-ops for this row.
        const rowSatisfiesAt = (row, kindStr) => {
            if (group.hasRelated != null) {
                const sc = group.hasRelatedScope
                    || { annotation: true, attachment: true, parent: true };
                if (sc[kindStr] !== false && !checkRelated(row)) return false;
            }
            if (group.hasTag != null) {
                const sc = group.hasTagScope
                    || { annotation: true, attachment: true, parent: true };
                if (sc[kindStr] !== false && !checkTag(row)) return false;
            }
            return true;
        };

        // Find the root regular item / standalone note of the
        // tree this row belongs to. Kept for the kind-specific
        // checks lower down (standaloneNote, itemNote,
        // hasAnnotations, hasAbstract, hasDOI, …) which all
        // evaluate the root, not the cross-level candidates set.
        let root = item;
        while (root.parentItem) root = root.parentItem;
        const isReg = !!(root.isRegularItem && root.isRegularItem());

        // Cross-level chips look only along the VERTICAL spine of
        // the queried row — its own ancestors + descendants, plus
        // the row itself. Siblings (same-level rows under a common
        // ancestor) DO NOT contribute. A PDF attachment with a
        // related-item link doesn't make its sibling Web Link
        // "pass" Has Related; an annotation only sees its parent
        // attachment and grandparent regular item, not the other
        // attachments under the same root or their annotations.
        // `note` bucket added 2026-08-19: the four-type classifier made
        // _rowKindOf return "note", so without it notes fell out of every
        // tree-level check (itemNote requirement, Has Link note text,
        // Has Tag/Related over notes) -- caught by the note-pair OR work.
        const candidates = { parent: [] as any[], attachment: [] as any[], note: [] as any[], annotation: [] as any[] };
        const pushByKind = (it) => {
            if (!it) return;
            const k = this._rowKindOf(it);
            if (k && candidates[k]) candidates[k].push(it);
        };
        pushByKind(item);
        // Ancestors (strict — excludes item itself).
        for (let p = item.parentItem; p; p = p.parentItem) {
            pushByKind(p);
        }
        // Descendants (strict — excludes item itself).
        const collectDesc = (it) => {
            try {
                if (it.isRegularItem && it.isRegularItem()) {
                    const attIds = (it.getAttachments
                        && it.getAttachments()) || [];
                    for (const aId of attIds) {
                        const a = Zotero.Items.get(aId);
                        if (!a) continue;
                        pushByKind(a);
                        collectDesc(a);
                    }
                    const noteIds = (it.getNotes && it.getNotes()) || [];
                    for (const nId of noteIds) {
                        const n = Zotero.Items.get(nId);
                        if (n) pushByKind(n);
                    }
                } else if (it.isFileAttachment && it.isFileAttachment()) {
                    const anns = it.getAnnotations() || [];
                    for (const ann of anns) pushByKind(ann);
                }
            } catch (e) {}
        };
        collectDesc(item);

        // For each cross-level scoped chip, require at least one
        // row in the scoped kinds to satisfy the predicate (with
        // proper handling of exclude/include).
        const checkChipAcrossTree = (predicate, scope, kindKeys) => {
            for (const k of kindKeys) {
                if (!this._wvScopeAllows(scope, k)) continue;
                for (const row of candidates[k]) {
                    if (predicate(row)) return true;
                }
            }
            return false;
        };

        if (group.hasRelated != null) {
            const sc = group.hasRelatedScope
                || { annotation: true, attachment: true, parent: true };
            if (!checkChipAcrossTree(
                checkRelated, sc,
                ["annotation", "attachment", "note", "parent"])) return false;
        }
        if (group.hasTag != null) {
            const sc = group.hasTagScope
                || { annotation: true, attachment: true, parent: true };
            if (!checkChipAcrossTree(
                checkTag, sc,
                ["annotation", "attachment", "note", "parent"])) return false;
        }
        if (group.hasLink != null) {
            // Has Link scope keys are text-source-specific
            // (annotationComment / itemNoteText / standaloneText).
            // Map them onto the same candidate buckets.
            const sc = group.hasLinkScope || { annotationComment: true, itemNoteText: true, standaloneText: true };
            let found = false;
            if (sc.annotationComment !== false) {
                for (const ann of candidates.annotation) {
                    if (this._itemHasLinks(ann) === group.hasLink) { found = true; break; }
                }
            }
            if (!found && sc.itemNoteText !== false) {
                for (const n of candidates.note) {
                    if (!n.parentItem) continue; // standalone — not item note
                    if (this._itemHasLinks(n) === group.hasLink) { found = true; break; }
                }
            }
            if (!found && sc.standaloneText !== false) {
                // Standalone notes are roots themselves.
                if (root.isNote && root.isNote() && !root.parentItem) {
                    if (this._itemHasLinks(root) === group.hasLink) found = true;
                }
            }
            if (!found) return false;
        }
        if (group.hasBookmarks != null) {
            // The tree "has bookmarks" if any attachment in it carries reader
            // bookmarks (they belong to file attachments). No scope.
            let anyHas = false;
            for (const att of candidates.attachment) {
                if (att && this._bmAttachmentHasReaderBookmarks(att.libraryID, att.key)) { anyHas = true; break; }
            }
            if (anyHas !== group.hasBookmarks) return false;
        }
        // ── Kind-specific tri-state chips also enforce tree-level
        // constraints per Rule 2. We only enforce the INCLUDE
        // direction here ("=true"); EXCLUDE ("=false") behaves as
        // a per-row filter in `_rowPassesFilters` (just drop the
        // matching rows from results — no tree-level requirement).
        if (group.standaloneNote === true && group.itemNote === true) {
            // OR pair, both sides on: the tree satisfies the Notes
            // requirement if its root is a standalone note OR its spine
            // holds an item note.
            const rootIsStandalone = !!(root.isNote
                && root.isNote() && !root.parentItem);
            if (!rootIsStandalone) {
                let hasItemNote = false;
                for (const cand of candidates.note) {
                    if (cand && !!cand.parentItem) {
                        hasItemNote = true; break;
                    }
                }
                if (!hasItemNote) return false;
            }
        }
        else if (group.standaloneNote === true) {
            // Tree's root must itself be a standalone note. For any
            // non-standalone tree (regular item / its descendants),
            // this fails — e.g. Web Link + standaloneNote=true
            // yields no matches because Web Link trees aren't
            // rooted at standalone notes.
            const rootIsStandalone = !!(root.isNote
                && root.isNote() && !root.parentItem);
            if (!rootIsStandalone) return false;
        }
        if (group.standaloneAttachment === true) {
            // Tree's root must itself be a parentless attachment; file-
            // type chips then apply to that same row (intersection).
            const rootIsSA = !!(root.isAttachment
                && root.isAttachment() && !root.parentItem);
            if (!rootIsSA) return false;
        }
        if (group.itemNote === true && group.standaloneNote !== true) {
            // (When BOTH note tiles are on, the combined OR block above
            // already enforced the Notes requirement.)
            // OR-pair with `attachmentFileType` (Rule 1): when both
            // are set, the attachment level is satisfied by EITHER
            // a matching attachment OR an item note. Don't enforce
            // the structural item-note requirement here — the
            // regular-item branch of `_rowSatisfiesTreeJoin` already
            // runs the OR check, and enforcing again would drop
            // PDFs whose spine has no item note even though they
            // satisfy the file-type half of the OR.
            const attFTActive = !!(
                (group.attachmentFileType && group.attachmentFileType.length)
                || (group.attachmentFileTypeExclude
                    && group.attachmentFileTypeExclude.length)
                || (group.outlineClass && group.outlineClass.length)
                || (group.outlineClassExclude && group.outlineClassExclude.length)
                || (group.outlineFlags && group.outlineFlags.length)
                || (group.outlineFlagsExclude && group.outlineFlagsExclude.length)
                || (group.outlineVerdict && group.outlineVerdict.length)
                || (group.outlineVerdictExclude && group.outlineVerdictExclude.length));
            if (!attFTActive) {
                // Vertical-only: the row's spine must contain an
                // item note (the `note` candidates bucket, four-type).
                let hasItemNote = false;
                for (const cand of candidates.note) {
                    if (cand && !!cand.parentItem) {
                        hasItemNote = true; break;
                    }
                }
                if (!hasItemNote) return false;
            }
        }
        if (group.hasAnnotations === true) {
            // Vertical-only: spine must include an annotated file
            // attachment. A web-link sibling of an annotated PDF
            // doesn't get to pass via the PDF; only its own spine
            // (link → parent) is consulted.
            let hasAnnotated = false;
            for (const cand of candidates.attachment) {
                if (!cand || !cand.isFileAttachment
                    || !cand.isFileAttachment()) continue;
                const anns = cand.getAnnotations() || [];
                if (anns.some(a => this._annSourceMatches(
                    a, group.annotationSource))) {
                    hasAnnotated = true; break;
                }
            }
            if (!hasAnnotated) return false;
        }
        if (group.hasEmbeddedAnnotations === true) {
            // Vertical-only, same shape as Has Annotations above:
            // spine must include a file attachment carrying at least
            // one PDF-embedded annotation.
            let hasEmb = false;
            for (const cand of candidates.attachment) {
                if (!cand || !cand.isFileAttachment
                    || !cand.isFileAttachment()) continue;
                const anns = cand.getAnnotations() || [];
                if (anns.some(a => !!(a as any).annotationIsExternal)) {
                    hasEmb = true; break;
                }
            }
            if (!hasEmb) return false;
        }
        // ── Parent-LEVEL chips also enforce tree-level
        // constraints per Rule 2. Without this, an attachment
        // (Web Link) under a parent without an abstract would
        // wrongly pass when `hasAbstract=true` is also set —
        // the per-row check rejects the parent but not the
        // attachment, so the attachment leaked through.
        // Each check evaluates the root regular item; non-regular
        // roots (standalone notes) trivially fail include
        // directions on parent-only chips, which matches per-row
        // semantics.
        if (group.hasAbstract != null) {
            const v = isReg && !!(root.getField
                && String(root.getField("abstractNote") || "").trim().length);
            if (v !== group.hasAbstract) return false;
        }
        if (group.hasDOI != null) {
            const v = isReg && wvItemFieldNonEmpty(root, "DOI", "doi");
            if (v !== group.hasDOI) return false;
        }
        if (group.hasPMID != null) {
            if ((isReg && wvItemHasPubmedId(root, "PMID", WV_PMID_RE)) !== group.hasPMID) return false;
        }
        if (group.hasPMCID != null) {
            if ((isReg && wvItemHasPubmedId(root, "PMCID", WV_PMCID_RE)) !== group.hasPMCID) return false;
        }
        if (group.hasURL != null) {
            const v = isReg && wvItemFieldNonEmpty(root, "url", "url");
            if (v !== group.hasURL) return false;
        }
        if (group.hasAttachment != null) {
            const v = isReg && wvItemHasFileAttachment(root);
            if (v !== group.hasAttachment) return false;
        }
        if ((group.publication && group.publication.length)
            || (group.publicationExclude && group.publicationExclude.length)) {
            const pub = isReg && root.getField
                && root.getField("publicationTitle") || "";
            if (group.publication && group.publication.length
                && !group.publication.includes(pub)) return false;
            if (group.publicationExclude && group.publicationExclude.length
                && group.publicationExclude.includes(pub)) return false;
        }
        if ((group.readStatus && group.readStatus.length)
            || (group.readStatusExclude && group.readStatusExclude.length)) {
            const rs = isReg ? this._wvReadStatusOf(root) : "";
            if (group.readStatus && group.readStatus.length
                && !group.readStatus.includes(rs)) return false;
            if (group.readStatusExclude && group.readStatusExclude.length
                && group.readStatusExclude.includes(rs)) return false;
        }
        if (group.inOtherLibrary != null && this._wvLinkedLibCacheWarm()) {
            const v = isReg && this._wvItemInAnyOtherLib(root);
            if (v !== group.inOtherLibrary) return false;
        }
        if (group.itemType && group.itemType.length) {
            if (!isReg) return false;
            if (!group.itemType.includes(root.itemType)) return false;
        }
        if (group.itemTypeExclude && group.itemTypeExclude.length) {
            if (isReg && group.itemTypeExclude.includes(root.itemType)) return false;
        }
        return true;
    }

    /** Map an item to one of three "row kinds" used by the
     *  cross-level filter scope sub-filters.
     *  - "annotation" — annotation rows
     *  - "attachment" — attachment rows AND item notes (notes
     *                    attached to a regular item), since they
     *                    sit at the same tree level
     *  - "parent"     — regular items AND standalone notes
     *                    (top-level rows in the items tree)
     *  Returns `null` for anything else. */
    _rowKindOf(item) {
        if (!item) return null;
        if (item.isAnnotation && item.isAnnotation()) return "annotation";
        if (item.isAttachment && item.isAttachment()) return "attachment";
        if (item.isNote && item.isNote()) {
            // FOUR-TYPE CLASSIFICATION (2026-08-19, MJT-approved): notes
            // are their own kind. Before this, a note's kind came from its
            // POSITION (standalone -> "parent", child -> "attachment"),
            // which made scopes and Selection Target lie about notes.
            return "note";
        }
        if (item.isRegularItem && item.isRegularItem()) return "parent";
        return null;
    }

    /** Kind-scope consult with the pre-four-type MIGRATION built in
     *  (2026-08-19): saved scopes from before the "note" kind have no
     *  `note` key -- notes then rode `parent` (standalone) and
     *  `attachment` (child). Preserve behaviour: an unset `note` key is
     *  in scope iff either of those covering toggles is. Never write
     *  the derived value back here -- the UI materialises it when a
     *  scope dropdown opens. */
    _wvScopeAllows(sc, kind) {
        if (!sc || !kind) return true;
        if (kind === "note" && sc.note === undefined) {
            return sc.parent !== false || sc.attachment !== false;
        }
        return sc[kind] !== false;
    }

    /** Strict kind-specific check: returns true iff `item` is
     *  actually of `kind` AND passes all filters in `group` that
     *  target that kind. Used by `_rowSatisfiesTreeJoin`. */
    /** Does annotation `ann` satisfy the tri-state Source value?
     *  `src` true = embedded in the PDF (`annotationIsExternal`),
     *  false = made in Zotero Reader, null/undefined = any
     *  (embedded-first encoding, 2026-08-18). Embedded annotations
     *  become items only once Zotero has OPENED the file (reader.js
     *  runs PDFWorker.import on open) — a PDF annotated elsewhere
     *  but never opened here has no annotation rows at all, which no
     *  item-level filter can see. */
    _annSourceMatches(ann, src) {
        if (src == null) return true;
        return !!ann.annotationIsExternal === src;
    }

    _kindOK(item, group, kind) {
        if (!item || !group) return false;
        if (kind === "annotation") {
            if (!(item.isAnnotation && item.isAnnotation())) return false;
            if (group.annotationColor && group.annotationColor.length
                && !group.annotationColor.includes(item.annotationColor)) return false;
            if (group.annotationColorExclude && group.annotationColorExclude.length
                && group.annotationColorExclude.includes(item.annotationColor)) return false;
            if (group.annotationType && group.annotationType.length
                && !group.annotationType.includes(item.annotationType)) return false;
            if (group.annotationTypeExclude && group.annotationTypeExclude.length
                && group.annotationTypeExclude.includes(item.annotationType)) return false;
            if (group.annotationHasComment != null) {
                const txt = item.annotationComment;
                const has = !!(txt && String(txt).trim().length);
                if (has !== group.annotationHasComment) return false;
            }
            if (!this._annSourceMatches(item, group.annotationSource)) {
                return false;
            }
            return true;
        }
        if (kind === "attachment") {
            if (!(item.isAttachment && item.isAttachment())) return false;
            if (group.attachmentFileType && group.attachmentFileType.length
                && !this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileType)) return false;
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileTypeExclude)) return false;
            if (group.outlineClass && group.outlineClass.length
                && !this._outlineMatchesList(item, group.outlineClass)) return false;
            if (group.outlineClassExclude && group.outlineClassExclude.length
                && this._outlineMatchesList(item, group.outlineClassExclude)) return false;
            if (group.outlineFlags && group.outlineFlags.length
                && !this._outlineMatchesAll(item, group.outlineFlags)) return false;
            if (group.outlineFlagsExclude && group.outlineFlagsExclude.length
                && this._outlineMatchesList(item, group.outlineFlagsExclude)) return false;
            if (group.outlineVerdict && group.outlineVerdict.length
                && !this._outlineMatchesList(item, group.outlineVerdict)) return false;
            if (group.outlineVerdictExclude && group.outlineVerdictExclude.length
                && this._outlineMatchesList(item, group.outlineVerdictExclude)) return false;
            return true;
        }
        if (kind === "regular") {
            if (!(item.isRegularItem && item.isRegularItem())) return false;
            if (group.itemType && group.itemType.length
                && !group.itemType.includes(item.itemType)) return false;
            if (group.itemTypeExclude && group.itemTypeExclude.length
                && group.itemTypeExclude.includes(item.itemType)) return false;
            return true;
        }
        return false;
    }

    /** True iff at least one filter in `group` targets `item`'s
     *  kind AND matches. This is the "primary at its kind" check
     *  that distinguishes a row directly satisfying a kind-specific
     *  filter (→ primary) from one trivially passing because every
     *  applicable filter relaxed for its kind (→ ancestor only).
     *  Universal filters (Tag, Author, Added By with the row in
     *  scope) also count — picking a tag should make tagged rows
     *  primary regardless of kind. */
    _rowHasOwnKindMatch(item, group) {
        if (!item || !group) return false;
        const isAnn = !!(item.isAnnotation && item.isAnnotation());
        const isAtt = !isAnn
            && !!(item.isAttachment && item.isAttachment());
        const isNote = !isAnn && !isAtt
            && !!(item.isNote && item.isNote());
        const isReg = !isAnn && !isAtt && !isNote;

        // Annotation-targeting filters. Pure-exclude on a kind also
        // counts as a "kind match" — e.g. "exclude yellow" alone
        // should make every NON-yellow annotation primary.
        if (isAnn) {
            if (group.annotationColor && group.annotationColor.length
                && group.annotationColor.includes(item.annotationColor)) {
                return true;
            }
            if (group.annotationColorExclude && group.annotationColorExclude.length
                && !group.annotationColorExclude.includes(item.annotationColor)) {
                return true;
            }
            if (group.annotationType && group.annotationType.length
                && group.annotationType.includes(item.annotationType)) {
                return true;
            }
            if (group.annotationTypeExclude && group.annotationTypeExclude.length
                && !group.annotationTypeExclude.includes(item.annotationType)) {
                return true;
            }
            if (group.annotationHasComment != null) {
                const txt = item.annotationComment;
                const has = !!(txt && String(txt).trim().length);
                if (has === group.annotationHasComment) return true;
            }
            if (group.annotationSource != null
                && this._annSourceMatches(item, group.annotationSource)) {
                return true;
            }
        }

        // Attachment-targeting filter
        if (isAtt) {
            if (group.attachmentFileType && group.attachmentFileType.length
                && this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileType)) {
                return true;
            }
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && !this._attachmentMatchesFileTypeList(
                    item, group.attachmentFileTypeExclude)) {
                return true;
            }
            if (group.outlineClass && group.outlineClass.length
                && this._outlineMatchesList(item, group.outlineClass)) return true;
            if (group.outlineClassExclude && group.outlineClassExclude.length
                && !this._outlineMatchesList(item, group.outlineClassExclude)) return true;
            if (group.outlineFlags && group.outlineFlags.length
                && this._outlineMatchesAll(item, group.outlineFlags)) return true;
            if (group.outlineFlagsExclude && group.outlineFlagsExclude.length
                && !this._outlineMatchesList(item, group.outlineFlagsExclude)) return true;
            if (group.outlineVerdict && group.outlineVerdict.length
                && this._outlineMatchesList(item, group.outlineVerdict)) return true;
            if (group.outlineVerdictExclude && group.outlineVerdictExclude.length
                && !this._outlineMatchesList(item, group.outlineVerdictExclude)) return true;
        }

        // Regular-targeting filters
        if (isReg) {
            if (group.itemType && group.itemType.length
                && group.itemType.includes(item.itemType)) {
                return true;
            }
            if (group.itemTypeExclude && group.itemTypeExclude.length
                && !group.itemTypeExclude.includes(item.itemType)) {
                return true;
            }
        }

        // Universal filters — apply to any row, count as
        // "kind match" when they pass. Both include AND exclude can
        // satisfy: "exclude tag X" alone makes every non-X-tagged row
        // primary, mirroring the icon-grid Alt+click behaviour.
        // `hasTagScope` narrows which row kinds can be primary by tag
        // — out-of-scope rows skip this kind-match entirely (mirrors
        // the `_rowIsPrimary` check above). The scope is shared with
        // the Has Tag filter.
        if ((group.annotationTag && group.annotationTag.length)
            || (group.annotationTagExclude && group.annotationTagExclude.length)) {
            const k = this._rowKindOf(item);
            const tagSc = group.hasTagScope
                || { annotation: true, attachment: true, parent: true };
            if (k && this._wvScopeAllows(tagSc, k)) {
                const tags = (item.getTags && item.getTags()) || [];
                const names = tags.map(t => t && t.tag).filter(Boolean);
                if (group.annotationTag && group.annotationTag.length
                    && group.annotationTag.some(t => names.includes(t))) {
                    return true;
                }
                if (group.annotationTagExclude && group.annotationTagExclude.length
                    && !group.annotationTagExclude.some(t => names.includes(t))) {
                    return true;
                }
            }
        }
        if ((group.annotationAuthor && group.annotationAuthor.length)
            || (group.annotationAuthorExclude && group.annotationAuthorExclude.length)) {
            const authors = this._getItemAuthors(item);
            if (group.annotationAuthor && group.annotationAuthor.length
                && group.annotationAuthor.some(a => authors.includes(a))) {
                return true;
            }
            if (group.annotationAuthorExclude && group.annotationAuthorExclude.length
                && !group.annotationAuthorExclude.some(a => authors.includes(a))) {
                return true;
            }
        }
        if ((group.addedBy && group.addedBy.length)
            || (group.addedByExclude && group.addedByExclude.length)) {
            const sc = group.addedByScope || {
                topLevel: true, attachments: true, annotations: true,
            };
            // Notes: dedicated `notes` toggle; unset = migrate from
            // topLevel (ALL notes rode topLevel here pre-four-type).
            const inScope = (isAnn && sc.annotations)
                || (isAtt && sc.attachments)
                || (isReg && sc.topLevel)
                || (isNote && (sc.notes !== undefined
                    ? sc.notes !== false : sc.topLevel !== false));
            if (inScope) {
                const addedBy = this._getItemAddedBy(item);
                if (addedBy && group.addedBy
                    && group.addedBy.length
                    && group.addedBy.includes(addedBy)) return true;
                if (group.addedByExclude && group.addedByExclude.length
                    && (!addedBy || !group.addedByExclude.includes(addedBy))) {
                    return true;
                }
            }
        }
        // Cross-level filters — universal, count as kind-match for
        // any row that satisfies them. This makes annotations whose
        // comments contain a URL primary, attachments with a `url`
        // field primary, parents with `relatedItems` primary, etc.,
        // so the cascade pulls in their ancestors and (for parents)
        // walks their subtree on the keep pass.
        // Cross-level scope check (mirrors _rowPassesFilters).
        const cInScope = (scopeObj, kind) =>
            this._wvScopeAllows(scopeObj, kind);
        if (group.hasRelated != null) {
            const k = this._rowKindOf(item);
            if (cInScope(group.hasRelatedScope, k)) {
                const rels = (item.relatedItems && item.relatedItems.length) || 0;
                if ((rels > 0) === group.hasRelated) return true;
            }
        }
        if (group.hasLink != null) {
            const sk = this._hasLinkScopeKeyOf(item);
            if (sk) {
                const sc = group.hasLinkScope;
                if (!sc || sc[sk] !== false) {
                    const has = this._itemHasLinks(item);
                    if (has === group.hasLink) return true;
                }
            }
        }
        if (group.hasBookmarks != null) {
            // Attachment rows that carry reader bookmarks are primary (so the
            // cascade keeps them + their parent item). No scope.
            const has = this._bmAttachmentHasReaderBookmarks(item.libraryID, item.key);
            if (has === group.hasBookmarks) return true;
        }
        if (group.hasTag != null) {
            const k = this._rowKindOf(item);
            if (cInScope(group.hasTagScope, k)) {
                const tags = (item.getTags && item.getTags()) || [];
                const has = tags.length > 0;
                if (has === group.hasTag) return true;
            }
        }
        // Note-kind defining filters count as a kind-match for the
        // matching row, so child / standalone notes become primary
        // and the cascade pulls in their ancestors.
        if (group.itemNote != null) {
            const isCN = !!(item.isNote && item.isNote() && !!item.parentItem);
            if (isCN === group.itemNote) return true;
        }
        if (group.standaloneNote != null) {
            const isSN = !!(item.isNote && item.isNote() && !item.parentItem);
            if (isSN === group.standaloneNote) return true;
        }
        if (group.standaloneAttachment != null) {
            const isSA = !!(item.isAttachment && item.isAttachment()
                && !item.parentItem);
            if (isSA === group.standaloneAttachment) return true;
        }
        // Parent-targeting Has-* — only regular items can be primary
        // for these. Non-regulars don't count as kind matches here.
        if (isReg) {
            if (group.hasAbstract != null) {
                const v = !!(item.getField
                    && String(item.getField("abstractNote") || "").trim().length);
                if (v === group.hasAbstract) return true;
            }
            if (group.hasDOI != null) {
                if (wvItemFieldNonEmpty(item, "DOI", "doi") === group.hasDOI) return true;
            }
            if (group.hasPMID != null) {
                if (wvItemHasPubmedId(item, "PMID", WV_PMID_RE) === group.hasPMID) return true;
            }
            if (group.hasPMCID != null) {
                if (wvItemHasPubmedId(item, "PMCID", WV_PMCID_RE) === group.hasPMCID) return true;
            }
            if (group.hasURL != null) {
                if (wvItemFieldNonEmpty(item, "url", "url") === group.hasURL) return true;
            }
            if (group.hasAttachment != null) {
                const v = wvItemHasFileAttachment(item);
                if (v === group.hasAttachment) return true;
            }
            if ((group.publication && group.publication.length)
                || (group.publicationExclude && group.publicationExclude.length)) {
                const pub = (item.getField
                    && item.getField("publicationTitle")) || "";
                if (group.publication && group.publication.length
                    && group.publication.includes(pub)) return true;
                if (group.publicationExclude && group.publicationExclude.length
                    && !group.publicationExclude.includes(pub)) return true;
            }
            if ((group.readStatus && group.readStatus.length)
                || (group.readStatusExclude && group.readStatusExclude.length)) {
                const rs = this._wvReadStatusOf(item);
                if (group.readStatus && group.readStatus.length
                    && group.readStatus.includes(rs)) return true;
                if (group.readStatusExclude && group.readStatusExclude.length
                    && !group.readStatusExclude.includes(rs)) return true;
            }
            if (group.inOtherLibrary != null && this._wvLinkedLibCacheWarm()) {
                const v = this._wvItemInAnyOtherLib(item);
                if (v === group.inOtherLibrary) return true;
            }
        }
        // Has Annotations — file attachments only. Source-aware,
        // same as the per-row check.
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const anns = item.getAnnotations() || [];
                const v = anns.some(
                    a => this._annSourceMatches(a, group.annotationSource));
                if (v === group.hasAnnotations) return true;
            }
        }
        // Has Embedded Annotations — file attachments only.
        if (group.hasEmbeddedAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const anns = item.getAnnotations() || [];
                const v = anns.some(a => !!(a as any).annotationIsExternal);
                if (v === group.hasEmbeddedAnnotations) return true;
            }
        }
        // Quick search — only count as a kind-match when THIS
        // specific item is in Zotero's `_searchItemIDs` set (i.e.
        // it actually matched the query). Without that membership
        // check, the old code marked every row of a scoped kind
        // primary as long as ANY search was active, which led to
        // context-rows being treated as matches (e.g. an annotation
        // whose attachment-parent's title matched the query — the
        // annotation itself contained no match, but was promoted).
        // Additionally restrict to chip-targeted kinds when a kind-
        // specific chip is active, so chips and search AND together.
        if (this._currentQuickSearchValue && group.quickSearchScope) {
            const k = this._rowKindOf(item);
            if (k && group.quickSearchScope[k] !== false) {
                let isQsMatch = false;
                try {
                    const win = Zotero.getMainWindow();
                    const rp = win && win.ZoteroPane
                        && win.ZoteroPane.itemsView
                        && win.ZoteroPane.itemsView.rowProvider;
                    const sIDs = rp && (rp.searchItemIDs
                        || rp._searchItemIDs);
                    isQsMatch = !!(sIDs && item && sIDs.has(item.id));
                } catch (e) {}
                if (isQsMatch) {
                    const annChipActive = !!(
                        (group.annotationColor
                            && group.annotationColor.length)
                        || (group.annotationColorExclude
                            && group.annotationColorExclude.length)
                        || (group.annotationType
                            && group.annotationType.length)
                        || (group.annotationTypeExclude
                            && group.annotationTypeExclude.length)
                        || group.annotationHasComment != null
                        || group.annotationSource != null);
                    const attChipActive = !!(
                        (group.attachmentFileType
                            && group.attachmentFileType.length)
                        || (group.attachmentFileTypeExclude
                            && group.attachmentFileTypeExclude.length)
                        || (group.outlineClass && group.outlineClass.length)
                        || (group.outlineClassExclude && group.outlineClassExclude.length)
                        || (group.outlineFlags && group.outlineFlags.length)
                        || (group.outlineFlagsExclude && group.outlineFlagsExclude.length)
                        || (group.outlineVerdict && group.outlineVerdict.length)
                        || (group.outlineVerdictExclude && group.outlineVerdictExclude.length));
                    const parChipActive = !!(
                        (group.itemType && group.itemType.length)
                        || (group.itemTypeExclude
                            && group.itemTypeExclude.length)
                        || group.hasAbstract != null
                        || group.hasDOI != null
                        || group.hasURL != null
                        || group.hasAttachment != null
                        || (group.publication && group.publication.length)
                        || (group.publicationExclude
                            && group.publicationExclude.length)
                        || (group.readStatus && group.readStatus.length)
                        || (group.readStatusExclude
                            && group.readStatusExclude.length)
                        || group.inOtherLibrary != null);
                    const anyKindSpecific = annChipActive
                        || attChipActive || parChipActive;
                    if (!anyKindSpecific) return true;
                    if (k === "annotation" && annChipActive) return true;
                    if (k === "attachment" && attChipActive) return true;
                    if (k === "parent" && parChipActive) return true;
                }
            }
        }
        return false;
    }


    /** Highlight the row in each `<libraries-collections-box>` whose
     *  library owns the currently-displayed item, but ONLY when the
     *  item also exists in other libraries (linked items). Upstream
     *  marks the row matching the active collection-tree branch
     *  (`.box.current` -> bold), but in a reader tab there's no
     *  active collection, and even in My Library the bold-only cue is
     *  easy to miss when the user wants to know *which library this
     *  item came from*. Adds a coloured background to the
     *  library-row of `box._item` whenever `box._linkedItems` is
     *  non-empty. */

    // =====================================================================
    // (pane.ts: _setupLibrariesBoxHighlight + 3 sibling methods physically
    //  lived between this and the next filter block — see modules/pane.ts.)
    // =====================================================================

    /** Install the filter pane into `targetWin` (default: the focused
     *  main window). EVERY main window gets its own filter — state is
     *  per-window via the `_filter*` accessors above; callers loop
     *  over Zotero.getMainWindows() at init and pass each window in.
     *  The override makes the accessors bind to `targetWin` for the
     *  duration of the synchronous setup pass, so installing into a
     *  background window doesn't write the focused window's slots. */
    _setupItemsListFilter(targetWin?: any) {
        // Pref gate (Filters group → Items-tree filter pane).
        if (!this._getEnableItemsTreeFilter()) {
            try { this._teardownItemsListFilter(); } catch (e) {}
            return;
        }
        const win = (targetWin && !targetWin.closed) ? targetWin : Zotero.getMainWindow();
        if (!win || !win.document) return;
        const prev = (this as any)._wvFilterWinOverride;
        (this as any)._wvFilterWinOverride = win;
        try { this._setupItemsListFilterIn(win); }
        finally { (this as any)._wvFilterWinOverride = prev || null; }
    }

    _setupItemsListFilterIn(win: any) {
        const doc = win.document;
        const container = doc.getElementById("zotero-items-pane-container");
        const itemsPane = doc.getElementById("zotero-items-pane");
        const searchBox = doc.getElementById("zotero-tb-search");
        if (!container || !itemsPane || !searchBox) {
            // Items pane mounts asynchronously on first window open; retry.
            win.setTimeout(() => this._setupItemsListFilter(win), 1000);
            return;
        }
        if (doc.getElementById("wv-filter-bar")) return;

        // Toolbar button — XUL <toolbarbutton type="menu"> next to the
        // quick-search box. The `type="menu"` attribute is what gives
        // it native toggle behaviour: when its child popup is open
        // and the user clicks the button again, XUL closes it AND
        // suppresses the would-be re-open. This is the same trick
        // the quick-search dropmarker uses (chrome://zotero/content/
        // elements/quickSearchTextbox.js — `dropmarker.setAttribute(
        // "type", "menu")` + `dropmarker.append(this.searchModePopup)`).
        // Inherits `.zotero-tb-button` styling and the universal
        // filter.svg icon (themed via context-fill).
        const tbBtn: any = doc.createXULElement("toolbarbutton");
        tbBtn.id = "wv-filter-tb-button";
        tbBtn.className = "zotero-tb-button";
        tbBtn.setAttribute("type", "menu");
        tbBtn.setAttribute("tabindex", "-1");
        tbBtn.setAttribute("tooltiptext", "Filter items");
        tbBtn.style.setProperty("-moz-context-properties",
            "fill, fill-opacity, stroke, stroke-opacity");
        tbBtn.style.fill = "currentColor";
        // The XUL <toolbarbutton> normally auto-renders an icon child
        // from its `image` attribute — but only when it has NO real
        // children. Once we add our own children (popup panel +
        // dropmarker chevron) the auto-content insertion stops, so
        // we have to render the icon as a real child too. Both
        // `.toolbarbutton-icon` and `.toolbarbutton-menu-dropmarker`
        // already have CSS in `_toolbarbutton.scss` that themes them
        // via `currentColor` / context-fill.
        const icon = doc.createXULElement("image");
        icon.className = "toolbarbutton-icon";
        icon.setAttribute("src",
            "chrome://zotero/skin/16/universal/filter.svg");
        // Force 20×20 so the filter funnel matches the size of its
        // toolbar siblings (zotero-tb-add / -attachment-add / -note-add).
        // Without these attrs the icon adopts the SVG's intrinsic 16×16
        // size — same chrome SVG, but Zotero's own buttons override it
        // (or use a different source path) to render at 20.
        icon.setAttribute("width", "20");
        icon.setAttribute("height", "20");
        tbBtn.appendChild(icon);
        // Weavero identity (user pick 2026-07-15, amber after teal /
        // red / violet trials — canonical colour notes in constants.ts
        // next to WV_FUNNEL_STEM_COLOR): a SECOND copy of the same
        // chrome funnel, pulled exactly over the base icon by a
        // negative start margin (net 0 width → the dropmarker is
        // unaffected), clipped to the STEM and tinted amber via
        // context-fill — the one funnel site that can consult
        // light-dark(), so it gets per-theme ambers instead of the
        // baked mid amber. The artwork stays Zotero's own (pixel-sharp
        // rule) with a two-tone finish that tells Weavero's filter
        // apart from the native Advanced Search funnel. Amber, NOT
        // accent blue: accent means active/selected, and the
        // active-filter dot already uses it. Both images render at
        // 16px regardless of the width attrs (measured), hence -16px.
        const stem = doc.createXULElement("image");
        stem.className = "wv-filter-stem";
        stem.setAttribute("src", "chrome://zotero/skin/16/universal/filter.svg");
        stem.setAttribute("width", "16");
        stem.setAttribute("height", "16");
        stem.style.setProperty("-moz-context-properties", "fill");
        stem.style.marginInlineStart = "-16px";
        // 44% ≈ just below the cone/stem junction (y 6.7 of 16).
        stem.style.clipPath = "inset(44% 0 0 0)";
        stem.style.fill = "light-dark(#b45309, #fbbf24)";   // per-theme ambers (user-approved)
        stem.style.pointerEvents = "none";
        tbBtn.appendChild(stem);
        const dropmarker = doc.createXULElement("image");
        dropmarker.className = "toolbarbutton-menu-dropmarker";
        tbBtn.appendChild(dropmarker);
        // Active-filter indicator — a small accent dot in the icon's
        // top-right corner, mirroring the reader filter button's
        // `.wv-rf-active` dot. Always present; shown only when the
        // button carries `.wv-filter-tb-active` (toggled by
        // `_updateFilterToolbarActiveState` on every filter change).
        const activeDot = doc.createElementNS(
            "http://www.w3.org/1999/xhtml", "span");
        activeDot.className = "wv-filter-tb-dot";
        tbBtn.appendChild(activeDot);

        // The panel must be a CHILD of the toolbar button for
        // type="menu" toggle behaviour. We create it once here and
        // (re)build its contents on `popupshowing` so the rendered
        // selection state always reflects the current `_filterState`.
        const panel = doc.createXULElement("panel");
        panel.id = "wv-filter-popup";
        // No arrow — the popup is positioned to overlap the toolbar
        // (so the quick-search box reads as the popup's first row)
        // and an arrow pointing at the filter button would look
        // weird above the visually-included search.
        // Skip the default Mozilla XUL panel fade-in animation so
        // the filter window appears at full opacity in one step
        // instead of fading from 0 → 1 over ~150 ms (which reads
        // as a "faint then clear" two-step appearance because
        // content has already rendered when the fade begins).
        // Same flag Zotero's own tabs-menu / sync-error / lookup
        // panels use (zoteroPane.xhtml).
        panel.setAttribute("animate", "false");
        // `noautohide="true"` keeps the popup open when the user
        // clicks the quick-search box (now visually integrated as
        // the popup's top row). We provide our own dismissal via:
        //   • the toolbar filter button (re-toggle to close)
        //   • the × ("Clear and Close") in the popup
        //   • Esc keypress while popup is focused
        //   • outside-click handler below (whitelisted to allow
        //     clicks on the toolbar search area)
        panel.setAttribute("noautohide", "true");
        // `consumeoutsideclicks="false"` lets clicks outside the
        // popup hit the target normally rather than being swallowed
        // by the popup's dismiss handler.
        panel.setAttribute("consumeoutsideclicks", "false");
        // `position` controls anchoring relative to the parent menu
        // button. We use openPopup with explicit coordinates at
        // open time (see toolbar-button click handler) so this is
        // a fallback. `before_start` aligns the popup's bottom-left
        // with the trigger's top-left, but we'll override.
        panel.setAttribute("position", "after_end");
        // Delegate HTML `title` tooltips to Zotero's own page-mode
        // tooltip element (declared in `zoteroPane.xhtml` as
        // `<tooltip id="html-tooltip" page="true"/>`). Mozilla's
        // tooltip listener handles position, delay, theming, and
        // OS-native cursor offset for us — exactly matching every
        // FF153 (register #14): the page-tooltip engine is broken for
        // fast target changes inside panels — stale labels, stale
        // anchors, and after any interference an unrecoverable dead
        // state (ring-proven, 2026-08-19). Weavero now OWNS tooltips
        // in this popup: no `tooltip="html-tooltip"` routing; the
        // title attrs stay (they are the text source) and
        // `_wvArmTooltipRing` shows/hides a dedicated tooltip
        // element deterministically. Retire when Gecko's page
        // tooltips recover (restore the attribute, drop the arm).
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.className = "wv-filter-popup-inner wv-filter-panel-inner";
        panel.appendChild(inner);
        panel.addEventListener("popupshowing", () => {
            // Tooltip-miss forensics (2026-08-19): tile tooltips
            // intermittently fail to show on the FF153 source build
            // while the title attrs are verifiably correct — suspect
            // the html-tooltip page-mode engine inside panels. Ring
            // is persistent (Zotero-global, survives plugin reloads)
            // per the intermittent-bug rule; read Zotero._wvTtRing.
            try {
                const liveWv = (Zotero as any).Weavero
                    && (Zotero as any).Weavero.plugin;
                if (liveWv) liveWv._wvArmTooltipRing(doc);
            } catch (e) {}
            // Frame the toolbar quick-search BEFORE width is
            // measured below — adding the 1-px left border shifts
            // its `getBoundingClientRect().left` 1 px outward, and
            // the popup-width calculation (in
            // `_renderFilterPanelContents`) needs the framed
            // measurement so the popup's left edge lines up with
            // the framed search's left edge.
            try {
                const sbEl: any = doc.getElementById("zotero-tb-search");
                if (sbEl) sbEl.classList.add("wv-filter-search-framed");
            } catch (e) {}
            // Inject the "Restrict Quick Search to:" dropdown into
            // the toolbar search box (right of the × clear icon).
            // Visibility is bound to whether the search has text.
            try {
                const refreshAllProxy = () => {
                    const btn = doc.querySelector(".wv-qs-scope-btn");
                    if (btn) this._refreshQuickSearchScopeButtonState(btn);
                    try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
                    try { this._renderFilterBar(); } catch (e) {}
                };
                this._installQuickSearchScopeButton(doc, refreshAllProxy);
            } catch (e) {}
            // Drop any in-memory caches so dynamic-list pickers
            // (tags, authors) re-fetch from SQL on each fresh open
            // and search inputs reset to empty.
            this._cachedAnnotationTags = null;
            this._cachedAnnotationAuthors = null;
            this._cachedAddedByUsers = null;
            this._cachedPublications = null;
            // Linked-libraries cache: refreshed in the BACKGROUND rather
            // than nulled like the lists above. Nulling it made the In
            // Multiple Libraries tile's first click apply a pass-through
            // filter (no visible change) and pay a SECOND full apply once
            // the rebuild landed — twice the ~1.5s big-library apply cost,
            // felt as "very slow to react" (user report 2026-08-05).
            // Stale-while-refresh keeps clicks instant; the swap re-applies
            // only if membership actually changed.
            try { this._wvRefreshLinkedLibCache(winOf(doc.documentElement)); } catch (e) {}
            this._tagSearchQuery = "";
            this._authorSearchQuery = "";
            this._itemTypeSearchQuery = "";
            this._addedBySearchQuery = "";
            this._publicationSearchQuery = "";
            this._renderFilterPanelContents(panel, inner);
        });
        // Manual outside-click dismissal — `noautohide="true"` on
        // the panel turns off Mozilla's own auto-hide so a click in
        // the quick-search box doesn't close the popup (the search
        // is now visually part of the filter window). We install a
        // doc-level capture handler on popupshown that hides the
        // popup only when the click lands outside both the popup
        // AND the whitelisted "extended" areas (the toolbar quick
        // search and the filter button itself).
        let dismissHandler = null;
        panel.addEventListener("popupshown", () => {
            const docTop = panel.ownerDocument;
            const panelAny = panel as any;
            // Visual integration: dress the toolbar quick-search box
            // with the popup's frame (top + sides) so it reads as the
            // popup's top row. Combined with the panel's missing top
            // edge (CSS in constants.ts targets `#wv-filter-popup`),
            // the user perceives one continuous frame.
            try {
                const sb: any = docTop.getElementById("zotero-tb-search");
                if (sb) sb.classList.add("wv-filter-search-framed");
            } catch (e) {}
            // Pixel-perfect left alignment: Mozilla's panel chrome
            // adds asymmetric padding so anchoring `after_end` of
            // the filter button doesn't put the popup's outer-left
            // exactly at the search-box outer-left. Measure both
            // and apply the residual delta via `transform`. Same
            // transform carries the +3 px vertical offset that
            // exposes the search's focus underline.
            //
            // Defer via setTimeout — when `popupshown` fires,
            // Mozilla's panel positioning isn't always settled yet
            // and `getBoundingClientRect()` can return the pre-
            // layout placement. A 0-ms timeout pushes the
            // measurement to after layout completes.
            const win = panel.ownerDocument.defaultView;
            // Left-edge alignment via transform-X. Width is already
            // tuned in `_renderFilterPanelContents` via the fixed
            // chrome-delta, so the right edge lands on the filter-
            // button right automatically. Deferred via setTimeout
            // so Mozilla's panel positioning is settled before
            // we measure.
            const alignPanel = () => {
                try {
                    const sb: any = docTop.getElementById("zotero-tb-search");
                    if (!sb) return;
                    const panelAny2 = panel as any;
                    // With Advanced Search active there is no visible
                    // search box to align with -- and, decisively, a
                    // CSS transform moves the PAINTED content but not
                    // the native popup widget, so any large shift gets
                    // CLIPPED at the widget's edge (2026-08-20: the
                    // popup was wider than the collapsed span, the
                    // +~106px shift pushed a third of it outside the
                    // widget, and the user saw a ~250px popup while
                    // every rect measured 362 -- rects include
                    // transforms). Skip the horizontal shift entirely;
                    // the popup hangs left of the button natively.
                    if (sb.hasAttribute("advanced-search-open")) {
                        panelAny2.style.transform = "translateY(3px)";
                        return;
                    }
                    // Reset transform so we measure the natural
                    // unshifted position.
                    panelAny2.style.transform = "translateY(3px)";
                    void panel.getBoundingClientRect();
                    const pRect = panel.getBoundingClientRect();
                    const sRect = sb.getBoundingClientRect();
                    // Shift 3 px LEFT of the search box's outer
                    // edge — paired with the +6 px width bump in
                    // `_renderFilterPanelContents` so the popup
                    // extends 3 px past each side of the search /
                    // filter-button row. Kept small by construction:
                    // in normal mode the width derives from the same
                    // span this aligns against, so dx stays within
                    // the widget's slack and nothing clips.
                    const dx = Math.round(sRect.left - pRect.left - 3);
                    panelAny2.style.transform =
                        "translate(" + dx + "px, 3px)";
                } catch (er) {}
            };
            if (win && win.setTimeout) win.setTimeout(alignPanel, 0);
            else alignPanel();
            dismissHandler = (e) => {
                try {
                    if (panelAny.state !== "open" && panelAny.state !== "showing") return;
                    const t = e.target;
                    if (!t) return;
                    if (panel.contains(t)) return;
                    if (tbBtn && tbBtn.contains(t)) return;
                    const sb = docTop.getElementById("zotero-tb-search");
                    if (sb && sb.contains(t)) return;
                    // Also let clicks on Zotero's quick-search popups
                    // (mode selector dropdown) pass through.
                    if (t.closest && t.closest("menupopup")) return;
                    panelAny.hidePopup();
                } catch (er) {}
            };
            docTop.addEventListener("mousedown", dismissHandler, true);
        });
        panel.addEventListener("popuphidden", () => {
            try {
                const docTop = panel.ownerDocument;
                const sb = docTop.getElementById("zotero-tb-search");
                if (sb) sb.classList.remove("wv-filter-search-framed");
                // Don't remove the QS scope button — it should
                // persist whenever a filter is active so the user
                // can still adjust the search scope after closing
                // the popup. Visibility is re-checked here in
                // case the filter went inactive while the popup
                // was open.
                this._refreshQuickSearchScopeButtonVisibility();
            } catch (e) {}
            if (dismissHandler) {
                try { panel.ownerDocument.removeEventListener("mousedown", dismissHandler, true); } catch (e) {}
                dismissHandler = null;
            }
        });

        // Swallow lone-Alt key events. On Windows, tapping Alt
        // activates the menubar (or the system menu) and Mozilla
        // hides any open popup as a side effect — including this
        // filter panel, which is annoying since users hold Alt to
        // alt-click for exclude. Stopping the keydown/keyup chain
        // when the Alt key is the only modifier prevents the
        // menubar activation while still letting Alt+click reach
        // its target buttons inside the panel.
        const swallowLoneAlt = (e) => {
            if (e.key !== "Alt") return;
            if (e.ctrlKey || e.shiftKey || e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
        };
        panel.addEventListener("keydown", swallowLoneAlt, true);
        panel.addEventListener("keyup", swallowLoneAlt, true);

        // Spacebar fix for the panel's HTML search inputs (publication / tag /
        // author / …). They live inside a XUL popup, where the native layer
        // EATS the spacebar before it reaches the input — the keydown isn't even
        // defaultPrevented and no keypress/beforeinput fires, so typed spaces
        // silently vanish (a publication search for "Journal of Fluid Mechanics"
        // came out "JournalofFluidMechanics"). Intercept space at document-
        // capture and insert it ourselves when a filter search input is focused.
        // Scoped by the `.wv-filter-search-input` class, so the spacebar is never
        // touched anywhere else. (XUL doc ⇒ HTML tagName is lowercase, so we key
        // on the class + a text caret, not tagName.)
        const spaceFix = (e) => {
            try {
                // Escape: close the open suggestion list first. The XUL popup
                // eats Escape before the input (same as the spacebar), so handle
                // it here at document-capture. Consume it only while a suggestion
                // box is open — otherwise let Escape bubble so it closes the
                // panel (two-stage: 1st Escape suggestions, 2nd Escape panel).
                if (e.key === "Escape") {
                    // Only act while our filter popup is actually open.
                    const p: any = panel;
                    if (!p || (p.state !== "open" && p.state !== "showing")) return;
                    const sug = this._wvActiveSuggest;
                    if (sug && sug.box && sug.box.style.display !== "none") {
                        // First Escape: close the open suggestion list, keep panel.
                        e.preventDefault();
                        e.stopPropagation();
                        try { sug.hide(); } catch (er) {}
                    } else {
                        // No suggestions open → close the whole filter popup.
                        e.preventDefault();
                        e.stopPropagation();
                        try { p.hidePopup(); } catch (er) {}
                    }
                    return;
                }
                if (e.key !== " " && e.key !== "Spacebar") return;
                const el: any = doc.activeElement;
                if (!el || typeof el.selectionStart !== "number") return;
                if ((el.className || "").toString()
                    .indexOf("wv-filter-search-input") === -1) return;
                e.preventDefault();
                e.stopPropagation();
                const s = el.selectionStart, en = el.selectionEnd;
                el.value = el.value.slice(0, s) + " " + el.value.slice(en);
                el.selectionStart = el.selectionEnd = s + 1;
                el.dispatchEvent(new win.Event("input", { bubbles: true }));
            } catch (err) {
                Zotero.debug("[Weavero] filter key-fix err: " + err);
            }
        };
        doc.addEventListener("keydown", spaceFix, true);
        this._filterSpaceFix = { doc, fn: spaceFix };

        tbBtn.appendChild(panel);
        searchBox.parentNode.insertBefore(tbBtn, searchBox.nextSibling);

        // Install the "Restrict Quick Search to:" scope dropdown
        // inside the toolbar search box, persistent across popup
        // open/close. Visibility is decided by
        // `_updateQuickSearchScopeButtonVisibility`: shown only
        // when the search has text AND (a filter is active OR the
        // filter popup is open). Click → opens the kind-scope
        // checkbox popup; modifying scope re-applies filter +
        // refreshes the chip bar.
        try {
            this._installQuickSearchScopeButton(doc, () => {
                try { this._renderFilterBar(); } catch (e) {}
                try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
                try {
                    const btn = doc.querySelector(".wv-qs-scope-btn");
                    if (btn) this._refreshQuickSearchScopeButtonState(btn);
                } catch (e) {}
            });
        } catch (e) {}

        // Chips bar — sits between the toolbar and the items tree.
        // Hidden when no filters are active so the items tree gets its
        // full vertical space back; appears only when at least one chip
        // exists.
        const bar = doc.createElementNS(NS_HTML, "div");
        bar.id = "wv-filter-bar";
        bar.className = "wv-filter-bar";
        bar.style.display = "none";
        container.insertBefore(bar, itemsPane);

        // Filter state: a list of GROUPS. Each group is an
        // AND-combination of fields (same shape as the pre-groups
        // flat state); groups are OR'd together at the top level.
        // The active group index tracks which group new chips /
        // section toggles target — set by the entry point that
        // opens the panel (toolbar `+`, chip click, `+ Group`).
        //
        // Migration: a pre-groups session may have left a flat state
        // sitting on `this._filterState`. Detect by absence of the
        // `groups` key and wrap it as the first (and only) group.
        if (!this._filterState) {
            this._filterState = {
                groups: [this._emptyFilterGroup()],
                activeGroupIndex: 0,
            };
        } else if (!this._filterState.groups) {
            const flat = this._filterState;
            this._filterState = {
                groups: [Object.assign(this._emptyFilterGroup(), flat)],
                activeGroupIndex: 0,
            };
        }
        this._filterBar = bar;
        this._filterTbBtn = tbBtn;
        this._renderFilterBar();
        this._patchIsSelectable();
        this._patchExpandMatchParents();
        this._patchHideContextAttachments();
        this._patchUserOpenTracking();
        this._installHiddenBadgeClickHandler();

        // Re-apply filter when scroll / data-change brings new rows into
        // the virtualized window. We watch the inner tree element for
        // childList mutations — every row append/remove fires here.
        const treeInner = doc.getElementById("item-tree-main")
            || doc.getElementById("zotero-items-tree");
        if (treeInner && win.MutationObserver) {
            // Disconnect any previous observer FIRST — re-setup (plugin reload,
            // pref toggles) otherwise stacks a dead instance's observer that
            // keeps re-applying the filter from stale code on every mutation.
            try { if (this._filterTreeObserver) this._filterTreeObserver.disconnect(); } catch (e) {}
            this._filterTreeObserver = new win.MutationObserver(() => {
                // Skip the apply during a collection swap — the
                // `changeCollectionTreeRow` wrap will re-apply
                // exactly once after `_rows` has fully reloaded.
                if (this._collectionSwapping) return;
                // Skip when an explicit caller (the Show Non-Matching
                // Attachments toggle handler is the load-bearing case)
                // has set a suppression window — its own `tree.invalidate()`
                // plus the `_refreshContainer` loop produce a storm of
                // DOM mutations which, without this guard, each trigger
                // a fresh `_applyItemsListFilter`, producing visible
                // flicker (~80 reapplies observed in dev.20 logs).
                if ((this as any)._suppressTreeObserverUntil
                    && Date.now() < (this as any)._suppressTreeObserverUntil) {
                    return;
                }
                this._applyItemsListFilter();
                // Patch the annotation row class as soon as the
                // first annotation row exists in `_rows`. Idempotent
                // — re-checks on every tree mutation but only
                // installs once.
                try { this._ensureAnnotationRowPatched(); } catch (e) {}
                // Same story for the regular-item row class: the
                // initial init call may run before any rows exist,
                // so retry on every tree mutation. Self-bails once
                // the prototype is patched.
                try { this._patchHideContextAttachments(); } catch (e) {}
                try { this._patchUserOpenTracking(); } catch (e) {}
                try { this._installHiddenBadgeClickHandler(); } catch (e) {}
            });
            this._filterTreeObserver.observe(treeInner,
                { childList: true, subtree: true });
        }

        // Collection-switch hook. The mutation observer above isn't
        // reliable across collection swaps: Zotero's
        // `CollectionViewItemTree.changeCollectionTreeRow` swaps
        // rows on the same `rowProvider` instance, so our patched
        // `getRow` survives but its `keep` array still maps to the
        // OLD `_rows`. Without an explicit re-apply tied to the
        // swap, the items view shows stale (previous-collection)
        // rows after returning to a previously visited collection.
        //
        // Patch the method to re-apply the filter once the swap
        // resolves. Idempotent — a flag on the instance prevents
        // double-wrapping across plugin reloads.
        // Wrap `setFilter` (quick-search / tag-selector entry point —
        // see collectionViewItemTree.jsx:setFilter). When the search
        // changes — most importantly when it's CLEARED — Zotero
        // tears down `_rows` and rebuilds it from scratch via the
        // collection-tree-row's `getItems()`. The new `_rows` has
        // every container closed (Zotero's default rebuild state),
        // so our MutationObserver-driven reapply lands on a tree
        // where the filter's "cascade open parents of deeper
        // matches" pass never runs (the observer reapply is non-
        // cascading by design — it must NOT undo user-driven
        // twisty toggles). Without an explicit cascade hook, the
        // user sees: results appear, but every parent stays
        // collapsed, hiding the actual filter matches one level
        // down. Treat the search swap like the collection swap:
        // pause patches, await the refresh, then cascade.
        try {
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.setFilter === "function"
                && !itemsView._wvSetFilterWrapped) {
                const origSetFilter = itemsView.setFilter.bind(itemsView);
                itemsView._wvSetFilterWrapped = true;
                itemsView.setFilter = async (type, data) => {
                    this._collectionSwapping = true;
                    this._pauseFilterPatches();
                    let result;
                    try { result = await origSetFilter(type, data); }
                    finally {
                        Promise.resolve().then(() => {
                            try {
                                this._collectionSwapping = false;
                                this._filterApplying = false;
                                this._wvViaSetFilter = true;
                                try { this._applyItemsListFilter({ cascade: true }); }
                                finally { this._wvViaSetFilter = false; }
                                this._patchIsSelectable();
                                this._patchExpandMatchParents();
                                this._patchHideContextAttachments();
                                // Zotero's `_refresh` refreshes every
                                // open container BEFORE updating
                                // `_searchMode` / `_searchItemIDs`, so
                                // any container that survived the
                                // setFilter is rebuilt against the
                                // PREVIOUS search state — which means
                                // our `getChildItems` patch sees stale
                                // (or unset) `searchItemIDs` and waves
                                // every attachment through. Re-refresh
                                // those containers now that the new
                                // search state is in place.
                                try {
                                    const rp2: any = itemsView
                                        && itemsView.rowProvider;
                                    if (rp2 && rp2._rows
                                        && typeof rp2._refreshContainer === "function") {
                                        for (let i = rp2._rows.length - 1; i >= 0; i--) {
                                            const r = rp2._rows[i];
                                            if (r && r.isOpen
                                                && r.ref
                                                && r.ref.isRegularItem
                                                && r.ref.isRegularItem()) {
                                                try { rp2._refreshContainer(i, true); }
                                                catch (e) {}
                                            }
                                        }
                                        try { rp2.refreshRowMap(); } catch (e) {}
                                        // Refreshing a parent collapses every
                                        // descendant — so any attachment that
                                        // Zotero's `_expandMatchParents` had
                                        // opened (to reveal matching annotation
                                        // children) is now closed again. Re-run
                                        // the expansion now to restore them.
                                        // V9-COMPAT: method name and
                                        // public-prop both differ.
                                        try {
                                            const empFn = rp2._expandMatchParents
                                                || rp2.expandMatchParents;
                                            const pids = rp2.searchParentIDs
                                                || rp2._searchParentIDs;
                                            if (typeof empFn === "function"
                                                && pids) {
                                                empFn.call(rp2, pids);
                                            }
                                        } catch (e) {}
                                        try { rp2.refreshRowMap(); } catch (e) {}
                                    }
                                } catch (e) {}
                                // KEEP IS NOW STALE. Everything above —
                                // _refreshContainer on every open parent,
                                // then _expandMatchParents — MUTATES
                                // `_rows` AFTER the apply computed `keep`
                                // against the pre-mutation array. The
                                // watermark then disagrees with
                                // `_rows.length` and `getRow` falls back to
                                // passing indices through UNTRANSLATED, so
                                // the view renders UNFILTERED while the
                                // chip still shows as active. Measured
                                // 2026-08-07 on clearing a quick search
                                // with a chip on: 18 782 rows shown where
                                // the chip alone gives 15 326, watermark
                                // 18 780 vs 18 782 rows, and any later
                                // apply restored it. Re-apply once the row
                                // mutations above are done.
                                //
                                // 2026-08-08: instrumenting the apply path
                                // showed this block is NOT on the failing
                                // path at all -- a helper called from here
                                // never fired during a reproduction. The
                                // apply that would have refreshed the
                                // watermark is instead DROPPED by the
                                // `_filterApplying` guard (traced:
                                // `cascade=false applying=true wm 18780
                                // rows 18782`), so the repair lives at that
                                // bounce site now. Kept as a belt-and-braces
                                // arm: it is a no-op unless the watermark
                                // genuinely disagrees.
                                try { this._wvScheduleStaleKeepRetry(); }
                                catch (e) {}
                                // Authoritative final pass once the search
                                // fully settles — see _wvArmFinalApply.
                                // `true` = search event: always re-apply,
                                // even onto an identical signature.
                                try { this._wvArmFinalApply(true); } catch (e) {}
                            } catch (e) {
                                dbg(
                                    "[Weavero][filter] post-setFilter reapply err: " + e);
                            }
                        });
                    }
                    return result;
                };
            }
        } catch (e) {
            dbg("[Weavero][filter] setFilter wrap err: " + e);
        }
        try {
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.changeCollectionTreeRow === "function"
                && !itemsView._wvCollChangeWrapped) {
                const origChange = itemsView.changeCollectionTreeRow.bind(itemsView);
                itemsView._wvCollChangeWrapped = true;
                itemsView.changeCollectionTreeRow = async (treeRow) => {
                    // Critical: un-patch the rowProvider BEFORE
                    // Zotero's collection-load logic runs. Otherwise
                    // the load reads our stale `getRowCount` (the
                    // OLD collection's `keep` length) and works on
                    // ghost rows past the new `_rows` end, leaving
                    // `_rows` partially populated. This was the
                    // observed bug where switching from L1 → C16 →
                    // L1 left My Library showing 7 rows / 151
                    // visible instead of the full set.
                    //
                    // Also: SUPPRESS the mutation-observer re-apply
                    // during the swap. The observer fires on DOM
                    // changes mid-load; if we let it apply, it
                    // reinstalls stale patches against partially-
                    // loaded `_rows`, then Zotero's load completes
                    // with mismatched `keep` ↔ `_rows` (root cause
                    // of "row 4 already found for item 81" warnings
                    // and "Attempting to get row data for a non-
                    // existant tree row 4" errors).
                    this._collectionSwapping = true;
                    this._pauseFilterPatches();
                    let result;
                    try { result = await origChange(treeRow); }
                    finally {
                        // Microtask defer — runs as soon as the
                        // current event loop tick yields, which is
                        // BEFORE any 80ms `_filterApplying` guard
                        // would normally bounce a sync call. This
                        // collapses the visible "unfiltered rows
                        // flash" between origChange resolving and
                        // our re-apply finishing.
                        Promise.resolve().then(() => {
                            try {
                                this._collectionSwapping = false;
                                this._filterApplying = false;
                                this._wvViaSetFilter = true;
                                try { this._applyItemsListFilter({ cascade: true }); }
                                finally { this._wvViaSetFilter = false; }
                                this._patchIsSelectable();
                                this._patchExpandMatchParents();
                            } catch (e) {
                                dbg(
                                    "[Weavero][filter] post-swap reapply err: " + e);
                            }
                        });
                    }
                    return result;
                };
            }
        } catch (e) {
            dbg("[Weavero][filter] changeCollectionTreeRow wrap err: " + e);
        }

        // Wrapper around selectItems: parity with Zotero's clear-on-miss
        // behaviour. Upstream ItemTree#selectItems clears the quick
        // search, tag selection — and, since zotero/zotero@64165ea, the
        // in-window advanced search — when the target row can't be
        // found, then retries once. Zotero knows nothing about the
        // Weavero filter, so a note link / zotero://select targeting an
        // item OUR filter hides would still miss. Mirror the same
        // courtesy: when the original call ends with some requested
        // item unselected while a Weavero filter is active, clear the
        // filter and retry once. Detection is by selection outcome (not
        // `_rowMap` internals) so it holds on both v9 and v10 row
        // plumbing. Idempotent.
        try {
            const WRAP_VER = 3;
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.selectItems === "function"
                && (itemsView._wvSelectItemsWrapVer || 0) < WRAP_VER) {
                // Versioned re-wrap: assigning over any previous wrapper
                // orphans its (possibly stale-instance) closure instead
                // of stacking on it. `selectItems` is a prototype
                // method, so teardown restores by deleting the own
                // property. Bind the PROTOTYPE method, not
                // `itemsView.selectItems` — the latter could be a
                // leftover own-property wrapper from a predecessor
                // instance, and binding it would stack us on a stale
                // closure.
                const proto = Object.getPrototypeOf(itemsView);
                const origSelect = itemsView._wvOrigSelectItems
                    || ((proto && typeof proto.selectItems === "function")
                        ? proto.selectItems.bind(itemsView)
                        : itemsView.selectItems.bind(itemsView));
                itemsView._wvOrigSelectItems = origSelect;
                itemsView._wvSelectItemsWrapVer = WRAP_VER;
                itemsView.selectItems = async (ids, noRecurse, noScroll) => {
                    let result = await origSelect(ids, noRecurse, noScroll);
                    try {
                        // Resolve the LIVE plugin instance at call time —
                        // this closure survives plugin reloads, so a
                        // captured `this` could be a torn-down
                        // predecessor whose clear would fight the
                        // current instance's patches.
                        const live: any = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        // `noRecurse` is Zotero's own retry marker — its
                        // recursive call must not re-trigger us. The
                        // getMainWindow guard scopes the clear to the
                        // window the filter accessors implicitly target
                        // (state is per-window; clearing another
                        // window's filter would be a cross-window
                        // clobber).
                        if (live && !live._wvDestroyed
                            && !noRecurse && ids && ids.length
                            && win === Zotero.getMainWindow()
                            && live._isFilterActive(live._filterState)) {
                            // A miss is "not VISIBLE through the
                            // filtered view", not "not selected":
                            // Zotero's selection model works on the
                            // unfiltered `_rows`, so a hidden target
                            // can be "selected" while the user stares
                            // at an empty list. Scan the wrapped
                            // provider (what's actually displayed);
                            // v9 has no rowProvider — fall back to
                            // the itemsView accessors its patches
                            // live on.
                            const missed = (() => {
                                try {
                                    const rp = itemsView.rowProvider;
                                    const getN = (rp && typeof rp.getRowCount === "function")
                                        ? () => rp.getRowCount()
                                        : () => itemsView.rowCount;
                                    const getR = (rp && typeof rp.getRow === "function")
                                        ? (i: number) => rp.getRow(i)
                                        : (i: number) => itemsView.getRow(i);
                                    const want = new Set(ids);
                                    const seen = new Set();
                                    const n = getN();
                                    for (let i = 0; i < n; i++) {
                                        const r = getR(i);
                                        const rid = r && r.ref && r.ref.id;
                                        if (rid != null && want.has(rid)) {
                                            seen.add(rid);
                                            if (seen.size === want.size) break;
                                        }
                                    }
                                    return seen.size < want.size;
                                } catch (e) { return false; }
                            })();
                            if (missed) {
                                dbg("[Weavero][filter] selectItems missed "
                                    + "under active filter — clearing the "
                                    + "Weavero filter and retrying once "
                                    + "(parity with Zotero's clear-on-miss)");
                                live._clearAllFilters();
                                result = await origSelect(ids, true, noScroll);
                            }
                        }
                    } catch (e) {
                        dbg("[Weavero][filter] selectItems filter-parity err: " + e);
                    }
                    return result;
                };
            }
        } catch (e) {
            dbg("[Weavero][filter] selectItems wrap err: " + e);
        }
    }

    /** Tear the filter pane out of `targetWin`; with no argument,
     *  out of EVERY main window (plugin disable / pref off). */
    _teardownItemsListFilter(targetWin?: any) {
        if (!targetWin) {
            for (const w of (Zotero.getMainWindows() || [])) {
                try { this._teardownItemsListFilter(w); } catch (e) {}
            }
            return;
        }
        if (targetWin.closed) return;
        const prev = (this as any)._wvFilterWinOverride;
        (this as any)._wvFilterWinOverride = targetWin;
        try { this._teardownItemsListFilterIn(targetWin); }
        finally { (this as any)._wvFilterWinOverride = prev || null; }
    }

    _teardownItemsListFilterIn(targetWin: any) {
        try {
            if (this._filterTreeObserver) {
                this._filterTreeObserver.disconnect();
                this._filterTreeObserver = null;
            }
        } catch (e) {}
        // Restore the rowProvider methods we monkey-patched. Without
        // this, plugin disable would leave the items list still
        // filtering through our state.
        try {
            const win = targetWin;
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            // Restore the selectItems wrap (an own property shadowing
            // the prototype method — delete lets it show through).
            if (itemsView && itemsView._wvSelectItemsWrapVer) {
                delete itemsView.selectItems;
                delete itemsView._wvOrigSelectItems;
                delete itemsView._wvSelectItemsWrapVer;
            }
            const rp = itemsView && itemsView.rowProvider;
            if (rp && rp._wvOrigGetRow) {
                // Delete the own-property monkey-patches so the
                // prototype methods show through. Reassigning to
                // `rp._wvOrigGetRow` would just reinstall a bound
                // copy (which still works, but `delete` is cleaner
                // and avoids re-stacking on next reload).
                delete rp.getRow;
                delete rp.getRowCount;
                delete rp._wvOrigGetRow;
                delete rp._wvOrigGetRowCount;
                // Restore the item pane's count getter (own property on the
                // itemsView; deleting it re-exposes the prototype getter).
                // The host is stored on `rp` because these teardown sites
                // only have `rp` in scope.
                if (rp._wvObjRowCountHost) {
                    try { delete rp._wvObjRowCountHost.objectRowCount; }
                    catch (e) {}
                    delete rp._wvObjRowCountHost;
                }
                if (rp._wvOrigGetLevel) {
                    delete rp.getLevel;
                    delete rp._wvOrigGetLevel;
                }
                if (rp._wvOrigIsContainer) {
                    delete rp.isContainer;
                    delete rp._wvOrigIsContainer;
                }
                if (rp._wvOrigIsContainerOpen) {
                    delete rp.isContainerOpen;
                    delete rp._wvOrigIsContainerOpen;
                }
                if (rp._wvOrigIsContainerEmpty) {
                    delete rp.isContainerEmpty;
                    delete rp._wvOrigIsContainerEmpty;
                }
                if (rp._wvOrigToggleOpenState) {
                    delete rp.toggleOpenState;
                    delete rp._wvOrigToggleOpenState;
                }
                if (rp._wvOrigExpandRows) {
                    delete rp.expandRows;
                    delete rp._wvOrigExpandRows;
                }
                if (rp._wvOrigCollapseRows) {
                    delete rp.collapseRows;
                    delete rp._wvOrigCollapseRows;
                }
                if (rp._wvOrigExpandAllRows) {
                    delete rp.expandAllRows;
                    delete rp._wvOrigExpandAllRows;
                }
                if (rp._wvOrigCollapseAllRows) {
                    delete rp.collapseAllRows;
                    delete rp._wvOrigCollapseAllRows;
                }
                delete rp._wvFilterSelfCall;
                this._partialCollapseOnFilterClear(rp, itemsView);
                try { itemsView.tree && itemsView.tree.invalidate(); } catch (e) {}
            }
        } catch (e) {}
        try {
            const doc = targetWin && targetWin.document;
            if (doc) {
                const bar = doc.getElementById("wv-filter-bar");
                if (bar) bar.remove();
                const tbBtn = doc.getElementById("wv-filter-tb-button");
                if (tbBtn) tbBtn.remove();
                // Remove the quick-search "Apply to" scope button and any
                // stale scope popup, so disabling the plugin (or turning the
                // filter off) reverts the toolbar search to native. It was
                // previously only torn down on `popuphidden`, so the button
                // lingered in the search wrapper after the plugin was disabled.
                try { this._uninstallQuickSearchScopeButton(doc); } catch (e) {}
                for (const p of doc.querySelectorAll("panel.wv-qs-scope-panel") as any) {
                    try { p.remove(); } catch (e) {}
                }
                for (const row of doc.querySelectorAll(".row.wv-filter-hidden") as any) {
                    row.classList.remove("wv-filter-hidden");
                }
                const popup = doc.getElementById("wv-filter-popup");
                if (popup) popup.remove();
            }
        } catch (e) {}
        if (this._filterSpaceFix) {
            try {
                this._filterSpaceFix.doc.removeEventListener(
                    "keydown", this._filterSpaceFix.fn, true);
            } catch (e) {}
            this._filterSpaceFix = null;
        }
        this._filterBar = null;
        this._filterTbBtn = null;
    }

    /** Significant-word initials of a label — the acronym, skipping connector
     *  words. "Journal of Fluid Mechanics" → "jfm"; "Journal of Applied Fluid
     *  Mechanics" → "jafm"; "J. Fluid Mech" → "jfm". Lowercased. */
    _wvSignificantInitials(label) {
        try {
            const STOP = this._wvAcronymStopwords
                || (this._wvAcronymStopwords = new Set(["of", "the", "and",
                    "for", "in", "on", "a", "an", "to", "at", "by", "with",
                    "from", "de", "la", "le", "des", "du", "et"]));
            const words: string[] = String(label).match(/[A-Za-z0-9]+/g) || [];
            return words
                .filter((w) => !STOP.has(w.toLowerCase()))
                .map((w) => w[0].toLowerCase()).join("");
        } catch (e) { return ""; }
    }

    /** Acronym match: `q` (already lowercased) is a PREFIX of `label`'s
     *  significant-word initials. "jfm" / "jf" → "Journal of Fluid Mechanics"
     *  (JFM); "jfm" does NOT match "Journal of Applied Fluid Mechanics" (JAFM).
     *  Lets every filter search box surface a multi-word value by its acronym —
     *  the launcher / Spotlight pattern. Needs q.length >= 2 so a single letter
     *  stays a plain prefix, not an acronym. */
    _wvAcronymMatch(label, q) {
        if (!label || !q || q.length < 2) return false;
        return this._wvSignificantInitials(label).startsWith(q);
    }

    /** Length of the significant-word acronym — ranks acronym matches tightest
     *  (shortest, closest to the query) first: "J. Fluid Mech"/"Journal of
     *  Fluid Mechanics" (3) above "Journal of Fluid Mechanics and Heat
     *  Transfer" (5). */
    _wvInitialsLen(label) {
        return this._wvSignificantInitials(label).length || 999;
    }

    /** (Re)build the filter-bar contents from `_filterState`. Called on
     *  setup, on every chip add/remove, and after popup commit. The bar
     *  is hidden when no filters are active — the toolbar "+" button is
     *  the entry point in that state. */
    /** Toggle the accent dot on the filter toolbar button so an active
     *  filter is visible at a glance even with the chip bar scrolled
     *  off — mirrors the reader filter button's `.wv-rf-active` dot. */
    _updateFilterToolbarActiveState() {
        try {
            const bar: any = this._filterBar;
            const win = (Zotero as any).getMainWindow
                && (Zotero as any).getMainWindow();
            const doc = (bar && bar.ownerDocument) || (win && win.document);
            if (!doc) return;
            const btn = doc.getElementById("wv-filter-tb-button");
            if (!btn) return;
            const active = this._isFilterActive(this._filterState);
            btn.classList.toggle("wv-filter-tb-active", !!active);
            // Pin the dot to the funnel ICON's top-right corner (same
            // spot as the reader filter button). The button also hosts a
            // dropmarker to the icon's right, so the static CSS `left`
            // is only a fallback — refine from the live icon box so the
            // dot lands on the funnel regardless of toolbar padding/DPI.
            if (active) {
                const dot: any = btn.querySelector(".wv-filter-tb-dot");
                const icon: any = btn.querySelector(".toolbarbutton-icon");
                if (dot && icon) {
                    const br = btn.getBoundingClientRect();
                    const ir = icon.getBoundingClientRect();
                    if (br.width && ir.width) {
                        dot.style.left =
                            Math.round(ir.right - br.left - 4) + "px";
                        dot.style.top =
                            Math.round(ir.top - br.top - 1) + "px";
                    }
                }
            }
        } catch (e) {}
    }

    _renderFilterBar() {
        // Reflect active/inactive on the toolbar button (accent dot).
        this._updateFilterToolbarActiveState();
        // Chip-bar state changed → re-evaluate whether the QS
        // scope dropdown should be visible (active filter is a
        // visibility precondition).
        try { this._refreshQuickSearchScopeButtonVisibility(); } catch (e) {}
        const bar = this._filterBar;
        if (!bar) return;
        const doc = bar.ownerDocument;
        while (bar.firstChild) bar.removeChild(bar.firstChild);

        const state = this._filterState;
        if (!this._isFilterActive(state)) {
            bar.style.display = "none";
            return;
        }
        bar.style.display = "";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const groups = state.groups || [];

        // Render each ACTIVE group inline. Groups are visually
        // separated by an "OR" badge; chips inside a group are
        // implicitly AND'd.
        let firstActive = true;
        for (let gi = 0; gi < groups.length; gi++) {
            const group = groups[gi];
            if (!this._isGroupActive(group)) continue;
            if (!firstActive) {
                const orSep = doc.createElementNS(NS_HTML, "span");
                orSep.className = "wv-filter-or";
                orSep.textContent = "OR";
                bar.appendChild(orSep);
            }
            firstActive = false;

            if (group.annotationColor && group.annotationColor.length) {
                bar.appendChild(this._buildColorChip(doc, group, gi));
            }
            if (group.annotationColorExclude && group.annotationColorExclude.length) {
                bar.appendChild(this._buildColorChip(doc, group, gi, true));
            }
            if (group.annotationType && group.annotationType.length) {
                bar.appendChild(this._buildTypeChip(doc, group, gi));
            }
            if (group.annotationTypeExclude && group.annotationTypeExclude.length) {
                bar.appendChild(this._buildTypeChip(doc, group, gi, true));
            }
            if (group.annotationHasComment != null) {
                bar.appendChild(this._buildHasCommentChip(doc, group, gi));
            }
            if (group.annotationSource != null) {
                bar.appendChild(this._buildAnnotationSourceChip(doc, group, gi));
            }
            if (group.annotationTag && group.annotationTag.length) {
                bar.appendChild(this._buildTagChip(doc, group, gi));
            }
            if (group.annotationTagExclude && group.annotationTagExclude.length) {
                bar.appendChild(this._buildTagChip(doc, group, gi, true));
            }
            if (group.annotationAuthor && group.annotationAuthor.length) {
                bar.appendChild(this._buildAuthorChip(doc, group, gi));
            }
            if (group.annotationAuthorExclude && group.annotationAuthorExclude.length) {
                bar.appendChild(this._buildAuthorChip(doc, group, gi, true));
            }
            if (group.itemType && group.itemType.length) {
                bar.appendChild(this._buildItemTypeChip(doc, group, gi));
            }
            if (group.itemTypeExclude && group.itemTypeExclude.length) {
                bar.appendChild(this._buildItemTypeChip(doc, group, gi, true));
            }
            if (group.attachmentFileType && group.attachmentFileType.length) {
                bar.appendChild(this._buildAttachmentFileTypeChip(doc, group, gi));
            }
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) {
                bar.appendChild(this._buildAttachmentFileTypeChip(doc, group, gi, true));
            }
            // DEV outline-eval chips -- gated on the pref (belt-and-suspenders on
            // top of the toggle-time scrub in _wvOeOnPrefToggle), so a disabled
            // pref never surfaces a dev chip even if a group somehow still held
            // dev tokens. This is per-group (not per-row), so the pref read is cheap.
            if (this._wvOeEnabled()) {
                if (group.outlineClass && group.outlineClass.length) {
                    bar.appendChild(this._buildOutlineClassChip(doc, group, gi));
                }
                if (group.outlineClassExclude && group.outlineClassExclude.length) {
                    bar.appendChild(this._buildOutlineClassChip(doc, group, gi, true));
                }
                if (group.outlineFlags && group.outlineFlags.length) {
                    bar.appendChild(this._buildOutlineFlagsChip(doc, group, gi));
                }
                if (group.outlineFlagsExclude && group.outlineFlagsExclude.length) {
                    bar.appendChild(this._buildOutlineFlagsChip(doc, group, gi, true));
                }
                if (group.outlineVerdict && group.outlineVerdict.length) {
                    bar.appendChild(this._buildOutlineVerdictChip(doc, group, gi));
                }
                if (group.outlineVerdictExclude && group.outlineVerdictExclude.length) {
                    bar.appendChild(this._buildOutlineVerdictChip(doc, group, gi, true));
                }
            }
            if (group.addedBy && group.addedBy.length) {
                bar.appendChild(this._buildAddedByChip(doc, group, gi));
            }
            if (group.addedByExclude && group.addedByExclude.length) {
                bar.appendChild(this._buildAddedByChip(doc, group, gi, true));
            }
            if (group.hasRelated != null) {
                bar.appendChild(this._buildHasRelatedChip(doc, group, gi));
            }
            if (group.hasLink != null) {
                bar.appendChild(this._buildHasLinkChip(doc, group, gi));
            }
            if (group.hasBookmarks != null) {
                bar.appendChild(this._buildHasBookmarksChip(doc, group, gi));
            }
            if (group.hasTag != null) {
                bar.appendChild(this._buildHasTagChip(doc, group, gi));
            }
            if (group.itemNote != null) {
                bar.appendChild(this._buildItemNoteChip(doc, group, gi));
            }
            if (group.standaloneNote != null) {
                bar.appendChild(this._buildStandaloneNoteChip(doc, group, gi));
            }
            if (group.standaloneAttachment != null) {
                bar.appendChild(this._buildStandaloneAttachmentChip(doc, group, gi));
            }
            if (group.hasAbstract != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAbstract", "Has Abstract"));
            }
            if (group.hasDOI != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasDOI", "Has DOI"));
            }
            if (group.hasPMID != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasPMID", "Has PMID"));
            }
            if (group.hasPMCID != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasPMCID", "Has PMCID"));
            }
            if (group.hasURL != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasURL", "Has URL"));
            }
            if (group.hasAttachment != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAttachment", "Has Attachment File"));
            }
            if (group.hasAnnotations != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAnnotations", "Has Annotations"));
            }
            if (group.hasEmbeddedAnnotations != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasEmbeddedAnnotations", "Has Embedded Annotations"));
            }
            if (group.publication && group.publication.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi));
            }
            if (group.publicationExclude && group.publicationExclude.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi, true));
            }
            if (group.readStatus && group.readStatus.length) {
                bar.appendChild(this._buildReadStatusChip(doc, group, gi));
            }
            if (group.readStatusExclude && group.readStatusExclude.length) {
                bar.appendChild(this._buildReadStatusChip(doc, group, gi, true));
            }
            if (group.inOtherLibrary != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "inOtherLibrary", "In Multiple Libraries"));
                // An active condition with a COLD cache (e.g. right after a
                // window re-wire) filters nothing; warm it and re-apply.
                if (!this._wvLinkedLibCacheWarm()) {
                    try { this._wvEnsureLinkedLibCache(winOf(bar), true); } catch (e) {}
                }
            }
        }

        // Trailing "+ Filter" — adds a chip to the LAST active group.
        const addBtn = doc.createElementNS(NS_HTML, "button");
        addBtn.type = "button";
        addBtn.className = "wv-filter-add";
        addBtn.textContent = "+ Filter";
        addBtn.title = "Add a filter to the current group (AND with the existing chips in this group).";
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Target last-active group when opening from the bar.
            for (let i = groups.length - 1; i >= 0; i--) {
                if (this._isGroupActive(groups[i])) {
                    state.activeGroupIndex = i;
                    break;
                }
            }
            // _openFilterPanel resolves the toolbar button itself —
            // no anchor argument needed.
            this._openFilterPanel();
        });
        bar.appendChild(addBtn);

        // "+ Group" — append a brand-new empty group and open the
        // panel scoped to it. The user can pick filters in the panel
        // and they go into the new group, OR'd with the existing
        // ones.
        const addGroupBtn = doc.createElementNS(NS_HTML, "button");
        addGroupBtn.type = "button";
        addGroupBtn.className = "wv-filter-add wv-filter-add-group";
        addGroupBtn.textContent = "+ OR Group";
        addGroupBtn.title = "Start a new OR group — its filters are AND'd internally and the group's results are unioned with the others.";
        addGroupBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.groups.push(this._emptyFilterGroup());
            state.activeGroupIndex = state.groups.length - 1;
            this._openFilterPanel();
        });
        bar.appendChild(addGroupBtn);

        // "Clear all" — wipes every group and resets to a single
        // empty group. Pushed to the right via `margin-left: auto`
        // in `.wv-filter-bar .wv-filter-clear`.
        const clearBtn = doc.createElementNS(NS_HTML, "button");
        clearBtn.type = "button";
        clearBtn.className = "wv-filter-clear";
        clearBtn.textContent = "Clear all";
        clearBtn.title = "Remove every active filter and reset to a single empty group.";
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
        });
        bar.appendChild(clearBtn);
    }

    /** Reset every filter back to its empty default and re-apply.
     *  Re-renders the chip bar (which then hides itself, no chips)
     *  and the open panel (so the section visuals deselect). */
    _clearAllFilters() {
        this._filterState = {
            groups: [this._emptyFilterGroup()],
            activeGroupIndex: 0,
        };
        this._savedSearchResults = null;
        this._savedSearchExcludeResults = null;
        // Drop the session "recently added" carry-over too — with
        // no filter active, every item is visible anyway.
        if (this._wvRecentlyAddedItemIDs) {
            this._wvRecentlyAddedItemIDs.clear();
        }
        this._pillOrder = [];
        this._renderFilterBar();
        this._applyItemsListFilter();
        // Clear any leftover Selection Target dimming from the old
        // state — _applyItemsListFilter doesn't touch wv-not-target.
        try { this._applySelectionTargetVisuals(); } catch (e) {}
        const win = Zotero.getMainWindow();
        const doc = win && win.document;
        const popup: any = doc && doc.getElementById("wv-filter-popup");
        if (popup
            && (popup.state === "open" || popup.state === "showing")) {
            const inner = popup.querySelector(".wv-filter-panel-inner");
            if (inner) this._renderFilterPanelContents(popup, inner);
        }
        // The quick-search "Apply to" scope button lives on the toolbar
        // search box, OUTSIDE the filter popup — clearing the filter
        // state above resets its scope to all-on, so refresh its
        // "modified" colour cue too (otherwise the dropdown stays tinted
        // as if a scope were still active).
        try {
            const qsBtn: any = doc && doc.querySelector(".wv-qs-scope-btn");
            if (qsBtn) this._refreshQuickSearchScopeButtonState(qsBtn);
        } catch (e) {}
    }

    /** Generic chip builder. Each chip is `Field | op | value(s) | ×`,
     *  with click-on-non-× re-opening the value picker. */
    _buildFilterChip(doc, opts) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const chip = doc.createElementNS(NS_HTML, "div");
        chip.className = "wv-filter-chip";
        chip.title = "Click to edit — opens the filter popup focused on this group.";

        const fieldSeg = doc.createElementNS(NS_HTML, "span");
        fieldSeg.className = "wv-chip-seg wv-chip-field";
        fieldSeg.textContent = opts.field;
        chip.appendChild(fieldSeg);

        const opSeg = doc.createElementNS(NS_HTML, "span");
        opSeg.className = "wv-chip-seg wv-chip-op";
        opSeg.textContent = opts.op;
        chip.appendChild(opSeg);

        const valSeg = doc.createElementNS(NS_HTML, "span");
        valSeg.className = "wv-chip-seg wv-chip-value";
        opts.fillValue(valSeg);
        chip.appendChild(valSeg);

        const removeSeg = doc.createElementNS(NS_HTML, "span");
        removeSeg.className = "wv-chip-seg wv-chip-remove";
        removeSeg.textContent = "×";
        removeSeg.title = "Remove filter";
        removeSeg.addEventListener("click", (e) => {
            e.stopPropagation();
            opts.onRemove();
            this._renderFilterBar();
            this._applyItemsListFilter();
        });
        chip.appendChild(removeSeg);

        chip.addEventListener("click", (e) => {
            if (e.target === removeSeg) return;
            opts.onEdit(chip);
        });
        return chip;
    }

    /** Helper: when a chip's `×` removes the LAST active filter from
     *  a non-first group, drop the empty group entirely so it doesn't
     *  linger as an "OR with nothing". The first group stays even
     *  when empty (so the bar can collapse cleanly). */
    _pruneEmptyGroups() {
        const s = this._filterState;
        if (!s || !s.groups) return;
        for (let i = s.groups.length - 1; i > 0; i--) {
            if (!this._isGroupActive(s.groups[i])) s.groups.splice(i, 1);
        }
        if (s.activeGroupIndex >= s.groups.length) {
            s.activeGroupIndex = s.groups.length - 1;
        }
    }

    /** Open the filter panel scoped to the given group index. The
     *  `anchor` arg is accepted for callsite compatibility (some
     *  callers wire this onto a button-click handler) but is unused
     *  — `_openFilterPanel` always anchors to the toolbar button. */
    _openFilterPanelForGroup(anchor, groupIdx) {
        this._filterState.activeGroupIndex = groupIdx;
        this._openFilterPanel();
    }

    _buildColorChip(doc, group, gi, exclude?) {
        const colors = exclude ? group.annotationColorExclude : group.annotationColor;
        return this._buildFilterChip(doc, {
            field: "Annotation Color",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                const NS_HTML = "http://www.w3.org/1999/xhtml";
                for (const c of colors) {
                    // Native rounded-square swatch, chip-sized (12px).
                    valSeg.appendChild(this._wvNativeColorSwatch(doc, c, 12));
                }
                const labelText = colors.map(c => {
                    const def = this._ANNOTATION_COLORS.find(x => x.value === c);
                    return def ? def.label : c;
                }).join(", ");
                const labelSpan = doc.createElementNS(NS_HTML, "span");
                labelSpan.textContent = labelText;
                valSeg.appendChild(labelSpan);
            },
            onRemove: () => {
                if (exclude) group.annotationColorExclude = [];
                else group.annotationColor = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildTypeChip(doc, group, gi, exclude?) {
        const types = exclude ? group.annotationTypeExclude : group.annotationType;
        return this._buildFilterChip(doc, {
            field: "Annotation Type",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                const labelText = types.map(t => {
                    const def = this._ANNOTATION_TYPES.find(x => x.value === t);
                    return def ? def.label : t;
                }).join(", ");
                valSeg.textContent = labelText;
            },
            onRemove: () => {
                if (exclude) group.annotationTypeExclude = [];
                else group.annotationType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasCommentChip(doc, group, gi) {
        // value=true  → include (annotations WITH comment)
        // value=false → exclude (annotations WITHOUT comment)
        const value = group.annotationHasComment;
        return this._buildFilterChip(doc, {
            field: "Has Comment",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.annotationHasComment = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAnnotationSourceChip(doc, group, gi) {
        // value=true  → embedded in the PDF (external)
        // value=false → made in Zotero Reader
        const value = group.annotationSource;
        return this._buildFilterChip(doc, {
            field: "Annotation Source",
            op: "is",
            fillValue: (valSeg) => {
                valSeg.textContent = value
                    ? "Embedded in PDF" : "Made in Zotero";
            },
            onRemove: () => {
                group.annotationSource = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasRelatedChip(doc, group, gi) {
        const value = group.hasRelated;
        return this._buildFilterChip(doc, {
            field: "Has Related",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasRelated = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasLinkChip(doc, group, gi) {
        const value = group.hasLink;
        return this._buildFilterChip(doc, {
            field: "Has Link",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasLink = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasBookmarksChip(doc, group, gi) {
        const value = group.hasBookmarks;
        return this._buildFilterChip(doc, {
            field: "Has Bookmarks",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasBookmarks = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    /** Inline bookmark-ribbon glyph for the "Has Bookmarks" filter tile.
     *  Drawn with the exact technique Zotero's `annotate-highlight.svg`
     *  uses: NO stroke, a filled shape under `fill-rule: evenodd`. Two
     *  concentric ribbon contours sit 1 px apart on the *integer* pixel
     *  grid; the even-odd rule fills only the 1-px band between them, so
     *  every straight edge lands exactly on a pixel row and renders
     *  razor-sharp. (A 1-px *stroke* is centred on its path, so it must
     *  sit on the `.5` grid and still softens slightly at miter joins;
     *  an integer-edge fill avoids that entirely.) Outer ribbon spans
     *  x 3→13, y 1→15 with the bottom V-notch apex centred at x=8. */
    _makeBookmarkSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-filter-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("fill", "currentColor");
        const path = doc.createElementNS(NS, "path");
        path.setAttribute("fill-rule", "evenodd");
        path.setAttribute("clip-rule", "evenodd");
        // Outer contour (M3 1…) + inner contour inset 1 px (M4 2…),
        // single-sourced from constants so every bookmark icon matches.
        path.setAttribute("d", BOOKMARK_PATH);
        // `.wv-filter-svg` also sets `stroke: currentColor` (default
        // stroke-width 1), which would paint an extra outline around
        // the filled frame. Suppress it — fill alone draws the glyph.
        path.style.stroke = "none";
        svg.appendChild(path);
        return svg;
    }

    _buildHasTagChip(doc, group, gi) {
        const value = group.hasTag;
        return this._buildFilterChip(doc, {
            field: "Has Tag",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.hasTag = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildItemNoteChip(doc, group, gi) {
        const value = group.itemNote;
        return this._buildFilterChip(doc, {
            field: "Item Note",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.itemNote = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildStandaloneNoteChip(doc, group, gi) {
        const value = group.standaloneNote;
        return this._buildFilterChip(doc, {
            field: "Standalone Note",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.standaloneNote = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildStandaloneAttachmentChip(doc, group, gi) {
        const value = group.standaloneAttachment;
        return this._buildFilterChip(doc, {
            field: "Standalone Attachment",
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group.standaloneAttachment = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildHasFieldChip(doc, group, gi, key, fieldLabel) {
        const value = group[key];
        return this._buildFilterChip(doc, {
            field: fieldLabel,
            op: value ? "is" : "is not",
            fillValue: () => {},
            onRemove: () => {
                group[key] = null;
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildPublicationChip(doc, group, gi, exclude?) {
        const list = exclude ? group.publicationExclude : group.publication;
        return this._buildFilterChip(doc, {
            field: "Publication",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = list.join(", "); },
            onRemove: () => {
                if (exclude) group.publicationExclude = [];
                else group.publication = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }



    _buildReadStatusChip(doc, group, gi, exclude?) {
        const list = exclude ? group.readStatusExclude : group.readStatus;
        const icons = {};
        try { for (const st of this._wvReadStatuses()) icons[st.name] = st.icon; } catch (e) {}
        return this._buildFilterChip(doc, {
            field: "Read Status",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => {
                valSeg.textContent = list
                    .map((n) => (icons[n] ? icons[n] + " " : "") + (n || "No Status"))
                    .join(", ");
            },
            onRemove: () => {
                if (exclude) group.readStatusExclude = [];
                else group.readStatus = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    // ---- Zotero Reading List integration (Read Status filter) -----------
    // The plugin (reading-list@hotmail.com) stores a per-item status in the
    // EXTRA field as `Read_Status: <name>`; names + emoji icons are user-
    // configurable via its `statuses-and-icons-list` pref ("a;b|i1;i2").
    // The filter section renders only while the plugin is active.

    /** True while the Zotero Reading List plugin is loaded. */
    _wvReadingListActive() {
        try { return !!(Zotero as any).ZoteroReadingList; } catch (e) { return false; }
    }

    /** Status descriptors `[{name, icon}]` from the plugin's pref, falling
     *  back to its shipped defaults. */
    _wvReadStatuses() {
        try {
            const raw = Zotero.Prefs.get(
                "extensions.zotero.zotero-reading-list.statuses-and-icons-list", true);
            if (typeof raw === "string" && raw.indexOf("|") >= 0) {
                const parts = raw.split("|");
                const names = parts[0].split(";");
                const icons = (parts[1] || "").split(";");
                const out = names
                    .map((n, i) => ({ name: n.trim(), icon: (icons[i] || "").trim() }))
                    .filter((x) => x.name);
                if (out.length) return out;
            }
        } catch (e) {}
        return [
            { name: "New", icon: "\u2B50" },
            { name: "To Read", icon: "\ud83d\udcd9" },
            { name: "In Progress", icon: "\ud83d\udcd6" },
            { name: "Read", icon: "\ud83d\udcd7" },
            { name: "Not Reading", icon: "\ud83d\udcd5" },
        ];
    }

    /** An item's read status (the `Read_Status:` line of its extra field),
     *  "" when unset. Cached in the module-level facet map (derived-fields
     *  layer 2026-08-06) — was a regex over Extra per row per apply. */
    _wvReadStatusOf(item) {
        try {
            const id = item && item.id;
            if (id != null) {
                const e = wvFacetEntry(id);
                if (e.rs !== undefined) return e.rs;
            }
            const extra = String((item.getField && item.getField("extra")) || "");
            const m = extra.match(/^Read_Status:\s*(.+)$/m);
            const out = m ? m[1].trim() : "";
            if (id != null) wvFacetEntry(id).rs = out;
            return out;
        } catch (e) { return ""; }
    }

    /** Read Status toggle row (below Tag, above Item Type). One toggle per
     *  status (icon + name) plus "No Status"; click includes, Alt+click
     *  excludes — the standard include/exclude vocabulary. Hidden entirely
     *  when the Reading List plugin isn't active. */
    _renderReadStatusSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        const rsEnabled = (this as any)._getEnableReadStatusFilter
            ? (this as any)._getEnableReadStatusFilter() : true;
        if (!rsEnabled || !this._wvReadingListActive()) {
            section.style.display = "none";
            section.className = "";
            return;
        }
        section.style.display = "";
        section.className = "wv-filter-section wv-filter-or-group";
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);
        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.readStatus) || []);
        const excluded = new Set((g0 && g0.readStatusExclude) || []);
        const entries = [...this._wvReadStatuses(), { name: "", icon: "\u2205" }];
        for (const st of entries) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt";
            btn.title = (st.name || "No Status") + " \u2014 Alt+click to exclude";
            if (selected.has(st.name)) btn.dataset.selected = "true";
            if (excluded.has(st.name)) btn.dataset.excluded = "true";
            const glyph = doc.createElementNS(NS_HTML, "span");
            glyph.className = "wv-filter-opt-glyph";
            glyph.textContent = st.icon || "";
            btn.appendChild(glyph);
            const lbl = doc.createElementNS(NS_HTML, "span");
            lbl.textContent = st.name || "No Status";
            btn.appendChild(lbl);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    st.name, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.readStatus = next.include;
                    g.readStatusExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }
    }

    // ---- "Also in library" (linked-item relations) -----------------------
    // "Belongs to multiple libraries" = Zotero's linked-item relation
    // (owl:sameAs) — the same data the item pane's "Libraries and
    // Collections" box renders via getLinkedItem(). Zotero has no search
    // over it (forums/129609, dstillman: "There isn't, sorry"), so the
    // filter precomputes one Map<libraryID-string, Set<itemID>> per library
    // view. The relation's storage side is an ACCESS heuristic, not
    // provenance (dataObject.js _addLinkedObject prefers the personal
    // library) — both directions are merged here, and the UI must say
    // "also in", never "imported from". 2026-08-05.

    /** zotero.org object URI -> { libraryID, key }, or null when the URI
     *  doesn't parse or its library isn't available locally. */
    _wvLinkedURITarget(uri) {
        try {
            const s = String(uri || "");
            let m = /\/groups\/(\d+)\/(?:publications\/)?items\/([A-Z0-9]{8})/.exec(s);
            if (m) {
                const libID = Zotero.Groups.getLibraryIDFromGroupID(parseInt(m[1], 10));
                return libID ? { libraryID: libID, key: m[2] } : null;
            }
            m = /\/users\/(?:\d+|local\/[^/]+)\/(?:publications\/)?items\/([A-Z0-9]{8})/.exec(s);
            if (m) return { libraryID: Zotero.Libraries.userLibraryID, key: m[1] };
        } catch (e) {}
        return null;
    }

    /** Map<libraryID-string, Set<itemID>> of items in `libraryID` that have
     *  a linked copy in each OTHER library. Both storage directions; a link
     *  whose far item is missing or trashed doesn't count (matches the
     *  native Libraries-and-Collections box). */
    async _wvCollectLinkedLibraries(libraryID) {
        const map = new Map();
        if (libraryID == null) return map;
        try {
            const deleted = new Set<number>((await Zotero.DB.columnQueryAsync(
                "SELECT itemID FROM deletedItems")) as any[]);
            const add = (libKey, itemID) => {
                let set = map.get(libKey);
                if (!set) { set = new Set(); map.set(libKey, set); }
                set.add(itemID);
            };
            const base = "SELECT ir.itemID, ir.object, i.libraryID AS lib "
                + "FROM itemRelations ir "
                + "JOIN relationPredicates rp ON rp.predicateID = ir.predicateID "
                + "JOIN items i ON i.itemID = ir.itemID "
                + "WHERE rp.predicate = 'owl:sameAs' AND i.libraryID ";
            // Forward: relations stored ON this library's items.
            const fwd = await Zotero.DB.queryAsync(base + "= ?", [libraryID]);
            for (const row of (fwd || [])) {
                if (deleted.has(row.itemID)) continue;
                const t = this._wvLinkedURITarget(row.object);
                if (!t || t.libraryID === libraryID) continue;
                const farID = Zotero.Items.getIDFromLibraryAndKey(t.libraryID, t.key);
                if (!farID || deleted.has(farID)) continue;
                add(String(t.libraryID), row.itemID);
            }
            // Reverse: other libraries' items pointing INTO this library.
            const rev = await Zotero.DB.queryAsync(base + "!= ?", [libraryID]);
            for (const row of (rev || [])) {
                if (deleted.has(row.itemID)) continue;
                const t = this._wvLinkedURITarget(row.object);
                if (!t || t.libraryID !== libraryID) continue;
                const mineID = Zotero.Items.getIDFromLibraryAndKey(libraryID, t.key);
                if (!mineID || deleted.has(mineID)) continue;
                add(String(row.lib), mineID);
            }
        } catch (e) {
            dbg("[Weavero][filter] _wvCollectLinkedLibraries err: " + e);
        }
        return map;
    }

    /** True when `_cachedLinkedLibraries` is usable as-is. Row predicates
     *  are synchronous, so a cold cache means "don't filter on this
     *  dimension yet" — never a half-answer. */
    _wvLinkedLibCacheWarm() {
        return !!(this._cachedLinkedLibraries && this._cachedLinkedLibraries.map);
    }

    _wvItemInAnyLinkedLib(item, libIDs) {
        try {
            const c = this._cachedLinkedLibraries;
            if (!c || !c.map || !item) return false;
            for (const id of libIDs) {
                const set = c.map.get(String(id));
                if (set && set.has(item.id)) return true;
            }
        } catch (e) {}
        return false;
    }

    /** True when the cached map shows a linked copy in ANY other library —
     *  the whole question the In Multiple Libraries tile asks. */
    _wvItemInAnyOtherLib(item) {
        try {
            const c = this._cachedLinkedLibraries;
            if (!c || !c.map || !item) return false;
            for (const set of c.map.values()) {
                if (set.has(item.id)) return true;
            }
        } catch (e) {}
        return false;
    }

    /** Background refresh (popup open): rebuild the cache for the current
     *  library while the STALE one keeps answering, then swap. Re-applies
     *  the filter only when an In Multiple Libraries condition is active
     *  AND membership actually changed — anything more eager re-pays the
     *  full items-list apply (~1.5s on a large library) for nothing. */
    async _wvRefreshLinkedLibCache(win) {
        try {
            const libraryID = this._wvSelectedLibraryID(win);
            if (libraryID == null) return;
            if (this._linkedLibBuildBusy) return;
            this._linkedLibBuildBusy = true;
            let map;
            try { map = await this._wvCollectLinkedLibraries(libraryID); }
            finally { this._linkedLibBuildBusy = false; }
            const prev = this._cachedLinkedLibraries;
            // Membership signature — set SIZES per library. A same-size
            // swap of members slips through until the next refresh; fine
            // for a UI cache.
            const sig = (m) => [...m.entries()]
                .map(([k, s]) => k + ":" + s.size).sort().join("|");
            const changed = !(prev && prev.libraryID === libraryID
                && prev.map && sig(prev.map) === sig(map));
            this._cachedLinkedLibraries = { libraryID, map };
            if (!changed) return;
            const s = this._filterState;
            const live = !!(s && s.groups
                && s.groups.some((g) => g && g.inOtherLibrary != null));
            if (live) {
                try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
            }
        } catch (e) {
            dbg("[Weavero][filter] _wvRefreshLinkedLibCache err: " + e);
        }
    }

    /** Build (or reuse) the cache for the window's selected library;
     *  optionally re-apply the filter once fresh data lands. */
    async _wvEnsureLinkedLibCache(win, reapply) {
        try {
            const libraryID = this._wvSelectedLibraryID(win);
            if (libraryID == null) return null;
            const c = this._cachedLinkedLibraries;
            if (c && c.libraryID === libraryID && c.map) return c.map;
            if (this._linkedLibBuildBusy) return null;
            this._linkedLibBuildBusy = true;
            try {
                const map = await this._wvCollectLinkedLibraries(libraryID);
                this._cachedLinkedLibraries = { libraryID, map };
                if (reapply) {
                    try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
                    try { this._renderFilterBar(); } catch (e) {}
                }
                return map;
            }
            finally { this._linkedLibBuildBusy = false; }
        } catch (e) {
            dbg("[Weavero][filter] _wvEnsureLinkedLibCache err: " + e);
            return null;
        }
    }

    _buildTagChip(doc, group, gi, exclude?) {
        const tags = exclude ? group.annotationTagExclude : group.annotationTag;
        return this._buildFilterChip(doc, {
            field: "Tag",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = tags.join(", "); },
            onRemove: () => {
                if (exclude) group.annotationTagExclude = [];
                else group.annotationTag = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAuthorChip(doc, group, gi, exclude?) {
        const authors = exclude ? group.annotationAuthorExclude : group.annotationAuthor;
        return this._buildFilterChip(doc, {
            field: "Author",
            op: exclude ? "excludes any" : "includes any",
            fillValue: (valSeg) => { valSeg.textContent = authors.join(", "); },
            onRemove: () => {
                if (exclude) group.annotationAuthorExclude = [];
                else group.annotationAuthor = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildItemTypeChip(doc, group, gi, exclude?) {
        const types = exclude ? group.itemTypeExclude : group.itemType;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        return this._buildFilterChip(doc, {
            field: "Item Type",
            op: exclude ? "is not" : "is",
            // Render the value segment as a row of item-type icons
            // (no localised name) — the icon already conveys the
            // type and saves chip width when several types are
            // selected.
            fillValue: (valSeg) => {
                while (valSeg.firstChild) valSeg.removeChild(valSeg.firstChild);
                for (const t of types) {
                    const icon = doc.createElementNS(NS_HTML, "span");
                    icon.className = "icon icon-css icon-item-type";
                    icon.dataset.itemType = t;
                    let label = t;
                    try { label = Zotero.ItemTypes.getLocalizedString(t); }
                    catch (e) {}
                    icon.title = label;
                    valSeg.appendChild(icon);
                }
            },
            onRemove: () => {
                if (exclude) group.itemTypeExclude = [];
                else group.itemType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildAttachmentFileTypeChip(doc, group, gi, exclude?) {
        const kinds = exclude ? group.attachmentFileTypeExclude : group.attachmentFileType;
        const labelOf = (k) => {
            const def = this._ATTACHMENT_FILE_TYPES.find(x => x.value === k);
            return def ? def.label : k;
        };
        return this._buildFilterChip(doc, {
            field: "Attachment File Type",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                valSeg.textContent = kinds.map(labelOf).join(", ");
            },
            onRemove: () => {
                if (exclude) group.attachmentFileTypeExclude = [];
                else group.attachmentFileType = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    /** DEV outline-eval: the outlineClass facet's token catalogue
     *  ({value,label}), shared by its chip + panel section. Source tokens
     *  first, then the `flag:*` quality flags. Kept in sync with
     *  `_wvOutlineTokens` / `_wvOeClassifyTree`. */
    _wvOutlineClassCatalogue() {
        return [
            { value: "embedded", label: "Embedded" },
            { value: "extracted", label: "Extracted" },
            { value: "scan", label: "Scanned (no text)" },
            { value: "empty", label: "Empty" },
            { value: "unknown", label: "Unknown" },
            { value: "flag:content-empty", label: "Content-empty" },
            { value: "flag:entity-leak", label: "Entity leak" },
            { value: "flag:ws-junk", label: "Whitespace junk" },
            { value: "flag:fig-table", label: "Fig/Table headings" },
            { value: "flag:spacing", label: "Spacing suspect" },
        ];
    }

    /** DEV outline-eval: the outlineVerdict facet's token catalogue. */
    _wvOutlineVerdictCatalogue() {
        return [
            { value: "verdict:good", label: "Good" },
            { value: "verdict:bad", label: "Bad" },
            { value: "verdict:scan", label: "Scan" },
            { value: "verdict:unmarked", label: "Unmarked" },
        ];
    }

    _buildOutlineClassChip(doc, group, gi, exclude?) {
        const vals = exclude ? group.outlineClassExclude : group.outlineClass;
        const cat = this._wvOutlineClassCatalogue();
        const labelOf = (k) => { const d = cat.find(x => x.value === k); return d ? d.label : k; };
        return this._buildFilterChip(doc, {
            field: "Outline Source",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => { valSeg.textContent = vals.map(labelOf).join(", "); },
            onRemove: () => {
                if (exclude) group.outlineClassExclude = [];
                else group.outlineClass = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildOutlineFlagsChip(doc, group, gi, exclude?) {
        const vals = exclude ? group.outlineFlagsExclude : group.outlineFlags;
        const cat = this._wvOutlineClassCatalogue();
        const labelOf = (k) => { const d = cat.find(x => x.value === k); return d ? d.label : k; };
        return this._buildFilterChip(doc, {
            field: "Outline Flags",
            // Include is AND ("has all"); exclude is has-any -> hide.
            op: exclude ? "has none of" : "has",
            fillValue: (valSeg) => { valSeg.textContent = vals.map(labelOf).join(exclude ? ", " : " + "); },
            onRemove: () => {
                if (exclude) group.outlineFlagsExclude = [];
                else group.outlineFlags = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    _buildOutlineVerdictChip(doc, group, gi, exclude?) {
        const vals = exclude ? group.outlineVerdictExclude : group.outlineVerdict;
        const cat = this._wvOutlineVerdictCatalogue();
        const labelOf = (k) => { const d = cat.find(x => x.value === k); return d ? d.label : k; };
        return this._buildFilterChip(doc, {
            field: "Outline Verdict",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => { valSeg.textContent = vals.map(labelOf).join(", "); },
            onRemove: () => {
                if (exclude) group.outlineVerdictExclude = [];
                else group.outlineVerdict = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    /** DEV outline-eval: token → count over the in-memory eval store, for the
     *  facet tiles. "verdict:unmarked" is intentionally absent (it means "no
     *  case recorded", which the store doesn't enumerate). Cheap — iterates
     *  the store maps, not the library. */
    _wvOutlineTokenCounts() {
        const counts = new Map();
        const bump = (t) => counts.set(t, (counts.get(t) || 0) + 1);
        const r = this._wvOeRoot;
        if (r) {
            const cls = r.classifications || {};
            for (const k of Object.keys(cls)) {
                const c = cls[k];
                if (c && c.source) bump(String(c.source));
                for (const f of ((c && c.flags) || [])) bump("flag:" + f);
            }
            const cases = r.cases || {};
            for (const k of Object.keys(cases)) bump("verdict:" + ((cases[k] && cases[k].verdict) || "unmarked"));
        }
        return counts;
    }

    /** DEV: "Scan library" control + a "N classified · M marked" status. The
     *  scan opens/closes a background reader per PDF (heavy, dev-only); while
     *  running it polls to update the label, then re-applies the filter. Also
     *  lazily loads the eval store so token matching + counts work. */
    _renderOutlineScanSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        // Load the store once so `_outlineMatchesList` and the counts have data.
        if (!this._wvOeRoot) { this._wvOeInit().then(() => { try { refreshAll(); } catch (e) {} }); }
        const row = doc.createElementNS(NS_HTML, "div");
        row.className = "wv-filter-options";
        section.appendChild(row);
        const st = this._wvOeScanState;
        const running = !!(st && st.running);
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt";
        let btnText = "Scan library";
        if (running) {
            btnText = st.phase === "quick"
                ? ("Quick scan… " + Math.min(st.quickIdx + 1, st.quickTotal) + "/" + st.quickTotal)
                : ("Scanning… " + Math.min(st.idx + 1, st.total) + "/" + st.total);
        }
        btn.textContent = btnText;
        (btn as any).disabled = running;
        btn.title = "Classify every PDF's outline in this library (opens each in the background). Writes nothing to the library.";
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            Promise.resolve(this._wvOeScanLibrary()).then(() => {
                const poll = () => {
                    if (!section.isConnected) return;   // panel closed → stop polling
                    try { refreshAll(); } catch (e2) {}
                    const s = this._wvOeScanState;
                    if (s && s.running) { try { doc.defaultView.setTimeout(poll, 800); } catch (e3) {} }
                    else { try { this._applyItemsListFilter({ cascade: true }); } catch (e4) {} }
                };
                try { doc.defaultView.setTimeout(poll, 400); } catch (e5) {}
            });
        });
        row.appendChild(btn);
        const r = this._wvOeRoot;
        const nClass = r && r.classifications ? Object.keys(r.classifications).length : 0;
        const nCase = r && r.cases ? Object.keys(r.cases).length : 0;
        const lbl = doc.createElementNS(NS_HTML, "span");
        lbl.style.opacity = "0.6";
        lbl.style.fontSize = "12px";
        lbl.style.alignSelf = "center";
        lbl.style.marginLeft = "6px";
        lbl.textContent = nClass + " classified · " + nCase + " marked";
        row.appendChild(lbl);
    }

    /** DEV: outlineClass facet — rendered as TWO titled rows, "Source" (how the
     *  outline was obtained) and "Flags" (quality issues), both filtering the
     *  same `outlineClass` field. Icon tiles: click = include, Alt+click =
     *  exclude; the tooltip carries the label + store count. */
    _renderOutlineClassSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        // All THREE facet rows (Source / Flags / Verdict) live here in a single
        // flex-column with ONE gap, so the vertical spacing between them is
        // uniform. (Splitting Verdict into its own panel section made the
        // Flags->Verdict gap the panel's inter-section gap, wider than the
        // Source->Flags one -- 2026-07-24.) The Verdict field is still separate;
        // `_renderOutlineVerdictSection` just stays empty.
        section.className = "";
        section.style.display = "flex";
        section.style.flexDirection = "column";
        section.style.gap = "4px";
        const cat = this._wvOutlineClassCatalogue();
        const source = cat.filter(d => d.value.indexOf("flag:") !== 0);
        const flags = cat.filter(d => d.value.indexOf("flag:") === 0);
        this._renderOutlineFacetGrid(doc, section, refreshAll, "Source", source, "outlineClass", "outlineClassExclude", true);
        this._renderOutlineFacetGrid(doc, section, refreshAll, "Flags", flags, "outlineFlags", "outlineFlagsExclude", false);
        this._renderOutlineFacetGrid(doc, section, refreshAll, "Verdict",
            this._wvOutlineVerdictCatalogue(), "outlineVerdict", "outlineVerdictExclude", true);
    }

    /** DEV: the Verdict row is rendered inside `_renderOutlineClassSection` (so
     *  all three rows share one uniform gap); this section stays empty. */
    _renderOutlineVerdictSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "";
        section.style.display = "none";
    }

    /** Inline SVG glyph (inner markup, 16×16 viewBox) for a dev outline
     *  token — theme-aware via `wv-filter-svg`'s `-moz-context-properties`
     *  (`context-stroke`/`context-fill` resolve to currentColor). Kept simple
     *  and monochrome to match the panel's other icon tiles. */
    _wvOutlineTokenIcon(value) {
        const S = "stroke='context-stroke' fill='none' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'";
        const DOT = "fill='context-fill' stroke='none'";
        const doc0 = "<rect x='3.5' y='2.5' width='9' height='11' rx='1' " + S + "/>";
        const pic = "<rect x='2.5' y='3.5' width='11' height='9' rx='1' " + S + "/><circle cx='6' cy='6.5' r='1' " + S + "/><path d='M3 12l3.5-3.5 2.5 2.5 2-2 3 3' " + S + "/>";
        const M = {
            // verdicts
            "verdict:good": "<path d='M3.5 8.6l3 3 6-7' " + S + "/>",
            "verdict:bad": "<path d='M4.5 4.5l7 7M11.5 4.5l-7 7' " + S + "/>",
            "verdict:scan": pic,
            "verdict:unmarked": "<circle cx='8' cy='8' r='5.3' stroke-dasharray='2 2' " + S + "/>",
            // classification source
            "embedded": doc0 + "<path d='M5.5 6h5M5.5 8h5M5.5 10h3' " + S + "/>",
            "extracted": doc0 + "<path d='M8 5v4.4M6 8l2 2 2-2' " + S + "/>",
            "scan": pic,
            "empty": doc0,
            "unknown": "<path d='M6 6.2a2 2 0 1 1 2.6 1.9c-.6.25-.85.6-.85 1.15V10' " + S + "/><circle cx='7.75' cy='12' r='.7' " + DOT + "/>",
            // quality flags
            "flag:content-empty": doc0 + "<path d='M5 12.5l6-8.5' " + S + "/>",
            "flag:entity-leak": "<path d='M6.8 9.2a1.8 1.8 0 0 1 0-2.4l.7-.7M9.2 6.8a1.8 1.8 0 0 1 0 2.4l-.7.7' " + S + "/><path d='M5.6 10.4l4.8-4.8' " + S + "/>",
            "flag:ws-junk": "<path d='M3.5 8h9' " + S + "/><circle cx='6' cy='8' r='.7' " + DOT + "/><circle cx='8' cy='8' r='.7' " + DOT + "/><circle cx='10' cy='8' r='.7' " + DOT + "/>",
            "flag:fig-table": "<rect x='3' y='4' width='10' height='8' rx='.5' " + S + "/><path d='M3 7h10M3 9.5h10M6.5 4v8M9.5 4v8' " + S + "/>",
            "flag:spacing": "<path d='M5 5v6M11 5v6' " + S + "/><path d='M6.5 8h3M8.7 6.6L10 8 8.7 9.4' " + S + "/>",
        };
        return M[value] || ("<circle cx='8' cy='8' r='5' " + S + "/>");
    }

    /** Shared icon-tile facet ROW for the dev outline facets — a "Title: [icons]"
     *  row APPENDED to `container` (the caller clears + may add several). Mirrors
     *  `_renderAttachmentFileTypeSection` (icon tiles + tooltip), with the label +
     *  store count in the tooltip and include/exclude via `_toggleIncludeExclude`. */
    _renderOutlineFacetGrid(doc, container, refreshAll, title, catalogue, incField, excField, grouped) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const section = doc.createElementNS(NS_HTML, "div");
        // `wv-filter-or-group` = the grouped-category tint the OR facets use
        // (Source / Verdict, "pick any of these"). The Flags facet is AND
        // (independent conditions, "has all"), so it is NOT grouped -- pass
        // grouped === false to drop the tint. 2026-07-24.
        section.className = "wv-filter-section" + (grouped === false ? "" : " wv-filter-or-group");
        section.style.display = "flex";
        section.style.alignItems = "center";
        section.style.gap = "6px";
        // Match `wv-filter-or-group`'s padding on EVERY row (tinted or not) so the
        // label + icon columns line up horizontally across Source / Flags / Verdict.
        // The ungrouped Flags row otherwise has no padding and its icons shift 6px
        // left of the tinted rows. 2026-07-24.
        section.style.padding = "5px 6px";
        container.appendChild(section);
        const lbl = doc.createElementNS(NS_HTML, "span");
        lbl.textContent = title;
        lbl.style.cssText = "font-size:11px;opacity:.6;min-width:52px;flex:0 0 auto;text-align:right;";
        section.appendChild(lbl);
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);
        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0[incField]) || []);
        const excluded = new Set((g0 && g0[excField]) || []);
        const counts = this._wvOutlineTokenCounts();
        for (const def of catalogue) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const n = counts.get(def.value) || 0;
            btn.title = def.label + (n ? " (" + n + ")" : "") + " — click to include, Alt+click to exclude";
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (excluded.has(def.value)) btn.dataset.excluded = "true";
            const icon = doc.createElementNS(NS_HTML, "img");
            icon.className = "wv-filter-svg";
            icon.src = "data:image/svg+xml;utf8,"
                + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>"
                + this._wvOutlineTokenIcon(def.value) + "</svg>";
            btn.appendChild(icon);
            // Count badge, bottom-right of the tile (dev filters only). Shown when
            // the store has entries for this token; the tooltip still carries it too.
            btn.style.position = "relative";
            if (n) {
                const badge = doc.createElementNS(NS_HTML, "span");
                badge.textContent = String(n);
                badge.setAttribute("style", "position:absolute;right:0;bottom:-2px;font:600 8px/1 sans-serif;"
                    + "opacity:.85;pointer-events:none;padding:0 1px;border-radius:2px;"
                    + "background:color-mix(in srgb, Canvas 65%, transparent);");
                btn.appendChild(badge);
            }
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) { g[incField] = next.include; g[excField] = next.exclude; }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }
    }

    _buildAddedByChip(doc, group, gi, exclude?) {
        const users = exclude ? group.addedByExclude : group.addedBy;
        const colorOn = this._getEnableAddedByColors();
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        return this._buildFilterChip(doc, {
            field: "Added By",
            op: exclude ? "is not" : "is",
            fillValue: (valSeg) => {
                if (!colorOn) {
                    valSeg.textContent = users.join(", ");
                    return;
                }
                // Per-user colored pills inside the chip's value
                // segment — reuses the same per-user palette as the
                // annotation badge and the addedBy column pill.
                while (valSeg.firstChild) valSeg.removeChild(valSeg.firstChild);
                users.forEach((u, k) => {
                    if (k > 0) {
                        const sep = doc.createElementNS(NS_HTML, "span");
                        sep.className = "wv-chip-value-sep";
                        sep.textContent = ", ";
                        valSeg.appendChild(sep);
                    }
                    const pill = doc.createElementNS(NS_HTML, "span");
                    pill.className = "wv-chip-value-user";
                    pill.textContent = u;
                    const colour = this._colorForUser(u);
                    pill.style.color = colour;
                    pill.style.backgroundColor = this._withAlpha(colour, 0.18);
                    valSeg.appendChild(pill);
                });
            },
            onRemove: () => {
                if (exclude) group.addedByExclude = [];
                else group.addedBy = [];
                this._pruneEmptyGroups();
            },
            onEdit: (anchor) => this._openFilterPanelForGroup(anchor, gi),
        });
    }

    /** Build the XUL <panel> shell used by every filter popover, plus
     *  return an HTML inner div for callers to fill in. The panel hosts
     *  an HTML subtree so it gets native arrow-popup positioning and
     *  outside-click dismissal for free. */
    /** Populate the persistent panel with all three filter sections.
     *  Called from `popupshowing` (XUL fires this every time the
     *  type="menu" toolbar button opens its child popup) so the
     *  visible state always tracks `_filterState`.
     *
     *  Section toggles re-render IN PLACE on every click so the
     *  selection visuals stay in sync without rebuilding the whole
     *  panel (which would dismiss the popover). */

    /** Tri-state toggle for icon-grid (single-value) filters: plain
     *  click → toggle in the include set; Alt+click → toggle in the
     *  exclude set.
     *
     *  Single-value semantics: an annotation has ONE color, an
     *  attachment has ONE file type, etc. Mixing include and exclude
     *  on the same facet is therefore always degenerate — including
     *  yellow already implies "not red, not blue, ...", so adding
     *  "exclude red" is no-op (or contradiction if values overlap).
     *  To make the UI represent intent cleanly, switching mode (i.e.
     *  adding to the OTHER set when at least one value is currently
     *  set) CLEARS the prior set entirely. The two sets therefore
     *  never coexist non-empty for these facets.
     *
     *  Returns the new {include, exclude} arrays. */
    _toggleIncludeExclude(value, includeArr, excludeArr, altKey) {
        const inc = new Set(includeArr || []);
        const exc = new Set(excludeArr || []);
        if (altKey) {
            if (exc.has(value)) {
                exc.delete(value);
            } else {
                // Switching into / staying in exclude mode: drop
                // every value from the include set so the facet
                // never has both directions active at once.
                exc.add(value);
                inc.clear();
            }
        } else {
            if (inc.has(value)) {
                inc.delete(value);
            } else {
                inc.add(value);
                exc.clear();
            }
        }
        return { include: [...inc], exclude: [...exc] };
    }

    /** Wire a search-input + suggestion-box pair to show on focus
     *  and hide on focus moving away OR a mousedown outside `opts`.
     *  The document-level mousedown handler covers clicks on inert
     *  popup regions (group headers, padding, section titles) that
     *  never take focus and therefore wouldn't fire a focusout.
     *  Outside-clicks also blur the search input so the caret leaves
     *  the popup along with the suggestions collapsing. */
    _wireFilterBoxFocus(doc, search, box, opts) {
        let onDocMouseDown = null;
        const hideBox = () => {
            box.style.display = "none";
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        const showBox = () => {
            if (box.style.display !== "none") return;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    if (opts.contains(e.target)) return;
                    try { search.blur(); } catch (err) {}
                    hideBox();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        opts.addEventListener("focusin", showBox);
        opts.addEventListener("focusout", (e) => {
            if (e.relatedTarget && opts.contains(e.relatedTarget)) return;
            hideBox();
        });
    }

    _renderFilterPanelContents(panel, inner) {
        // The panel is a child of the toolbar button (for native
        // type="menu" toggle), so positioning is handled by XUL via
        // the panel's `position="after_end"` attribute. We size the
        // inner contents to span from the search-box-left to the
        // items-pane-right; XUL slides the popup leftward as needed
        // because we right-align it to the (right-of-search) button.
        const doc = panel.ownerDocument;
        // Section titles are hidden, so we no longer pad the popup
        // with the legacy 150 px title column. Width is just enough
        // to span the items-pane area, capped at 320 px so the
        // popup stays compact even on wide screens.
        const tbSearch = doc.getElementById("zotero-tb-search");
        const itemsPane = doc.getElementById("zotero-items-pane");
        if (tbSearch && itemsPane) {
            try {
                const sRect = tbSearch.getBoundingClientRect();
                const tbBtnEl = doc.getElementById("wv-filter-tb-button");
                const fbRect = tbBtnEl
                    ? tbBtnEl.getBoundingClientRect()
                    : itemsPane.getBoundingClientRect();
                // Span the popup the full distance from the search-
                // box left edge to the filter-button right edge so
                // the popup's left edge stays aligned with the
                // (framed) search-box left edge.
                //
                // The panel's OUTER width is `inner.contentWidth +
                // inner.padding(12) + panel.chrome(10)` ≈ inner +
                // 22 px. To make panel.outerRight land exactly at
                // filter-button.right after the alignment shift,
                // subtract 22 from the span target. Measured
                // empirically with content-box inner + 6 px each
                // horizontal padding + Mozilla's 5 px each panel
                // chrome.
                //
                // Then add 6 px (3 each side) so the popup extends
                // slightly past the search-box and filter-button
                // outer edges — gives a small visual breathing
                // margin so the framed search reads as nested
                // inside the popup rather than flush at its edge.
                const span = Math.round(fbRect.right - sRect.left);
                const POPUP_CHROME_DELTA = 22;
                const POPUP_EXTEND_EACH_SIDE = 3;
                // BY DESIGN the width sticks to the Quick Search span
                // (the framed search reads as nested inside the popup).
                // With Advanced Search active (#5658) the Quick Search
                // isn't visible -- the widget swaps its #search-deck to
                // the #advanced-search-indicator and shrinks -- so the
                // span means nothing there and AS mode is handled
                // separately (MJT 2026-08-20): reuse the remembered
                // normal-state width (cached per window each time the
                // popup renders with the plain search showing), falling
                // back to the designed width for a window that has never
                // rendered outside AS mode. Quick search maxes at 300px
                // upstream, so the designed fallback (340) is what the
                // stick-to-search rule yields on a normal layout anyway.
                const MIN_INNER = 220;
                const AS_FALLBACK_INNER = 340;
                const win = doc.defaultView as any;
                // Detect AS mode via the `advanced-search-open`
                // ATTRIBUTE on the search box -- it's what upstream's
                // CSS keys the shrink on, so it's in sync by
                // construction. The first attempt keyed on the
                // indicator's `.deck-selected` class, which missed on
                // the user's real opens (2026-08-20, post-restart) --
                // the miss made this code trust the collapsed span AND
                // cache it as the "normal" width.
                const asMode = tbSearch.hasAttribute("advanced-search-open");
                let w = Math.max(MIN_INNER,
                    span - POPUP_CHROME_DELTA + POPUP_EXTEND_EACH_SIDE * 2);
                if (!asMode) {
                    win._wvFilterPopupNormalW = w;
                }
                else {
                    w = win._wvFilterPopupNormalW > 0
                        ? win._wvFilterPopupNormalW
                        : AS_FALLBACK_INNER;
                }
                inner.style.minWidth = w + "px";
                inner.style.maxWidth = w + "px";
            } catch (e) {}
        }

        // Clear any prior content (this fires every popupshowing).
        while (inner.firstChild) inner.removeChild(inner.firstChild);

        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const colorSection = doc.createElementNS(NS_HTML, "div");
        const typeSection = doc.createElementNS(NS_HTML, "div");
        const commentSection = doc.createElementNS(NS_HTML, "div");
        // The Attachment File Type section also hosts the Item Note
        // tile (right of the file-type icons, after a vertical bar).
        const attachmentFileTypeSection = doc.createElementNS(NS_HTML, "div");
        const notesSection = doc.createElementNS(NS_HTML, "div");
        // Has Annotations tri-state — Attachment group, below the
        // file-type / item-note row.
        const hasAnnotationsSection = doc.createElementNS(NS_HTML, "div");
        // Item Type row — sits ABOVE the unified search section.
        // Has its own trigger + selected-icon chips. The Standalone
        // Note tile is also rendered inline at the right end of
        // this row (after a vertical separator).
        const itemTypeRowSection = doc.createElementNS(NS_HTML, "div");
        // Parent-targeting Has-* row (Has DOI / Has URL / Has
        // Abstract / Has Attachment File) — Parent group.
        const parentHasFieldsSection = doc.createElementNS(NS_HTML, "div");
        // Unified search section — one search input + suggestion box
        // with a mode dropdown that switches between Tag, Author,
        // Added By, Collection, Saved Search.
        const searchSection = doc.createElementNS(NS_HTML, "div");
        // Cross-level icon-trigger group (Has Related, Has Link).
        const crossLevelSection = doc.createElementNS(NS_HTML, "div");

        // DEV outline-eval group (shown only when `weavero.devOutlineEval` is
        // on): a "Scan library" control plus the outlineClass / outlineVerdict
        // label grids. Attachment-resolving facets over the eval store.
        const outlineScanSection = doc.createElementNS(NS_HTML, "div");
        const outlineClassSection = doc.createElementNS(NS_HTML, "div");
        const outlineVerdictSection = doc.createElementNS(NS_HTML, "div");

        // Selection Target uses include/exclude semantics like every
        // other filter group: empty include + empty exclude means
        // "show all". Picking a kind narrows to just that kind;
        // alt+clicking excludes the kind. The previous "all on"
        // default was inconsistent with the rest of the panel.
        if (!this._filterState.selectionTarget) {
            this._filterState.selectionTarget = {};
        }
        if (!this._filterState.selectionTargetExclude) {
            this._filterState.selectionTargetExclude = {};
        }
        const selTarget = this._filterState.selectionTarget;
        const selTargetExc = this._filterState.selectionTargetExclude;
        if (!this._filterState.collections) this._filterState.collections = [];
        if (!this._filterState.collectionsExclude) this._filterState.collectionsExclude = [];
        if (!this._filterState.savedSearches) this._filterState.savedSearches = [];
        if (!this._filterState.savedSearchesExclude) this._filterState.savedSearchesExclude = [];

        // Clear / Clear-and-Close actions live in the BOTTOM bar
        // now (alongside the Alt+Click hint) — we don't put them
        // at the top of the popup any more. This keeps the popup's
        // top edge flush against the (visually-framed) quick-search
        // box, so the "Restrict to:" row reads as the search's own
        // settings rather than as a second section below a header.
        // "Clear" — text button, clears all filters but keeps the
        // popup open so the user can rebuild from scratch without
        // re-opening the panel.
        const clearTextBtn = doc.createElementNS(NS_HTML, "button");
        clearTextBtn.type = "button";
        clearTextBtn.className = "wv-filter-clear-btn";
        clearTextBtn.textContent = "Clear";
        clearTextBtn.title = "Clear all filters (keep this window open)";
        clearTextBtn.setAttribute("aria-label", "Clear all filters");
        clearTextBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
        });
        const clearBtn = doc.createElementNS(NS_HTML, "button");
        clearBtn.type = "button";
        clearBtn.className = "wv-filter-clear-icon";
        // The × glyph is drawn via CSS pseudo-elements (two rotated
        // bars) for pixel-perfect centering. `aria-label` carries the
        // semantics for screen readers; tooltip is set via `title`.
        clearBtn.setAttribute("aria-label", "Clear and Close");
        clearBtn.title = "Clear and Close";
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._clearAllFilters();
            // Also dismiss the popup — there's nothing left to
            // interact with once every filter is cleared.
            try { panel.hidePopup(); } catch (err) {}
        });
        // Both buttons appended to the bottom bar later (after
        // Selection Target). `renderHeader` (called by refreshAll)
        // toggles their visibility based on whether any filter is
        // actually set.
        const renderHeader = () => {
            const active = this._isFilterActive(this._filterState);
            clearTextBtn.style.visibility = active ? "" : "hidden";
            clearBtn.style.visibility = active ? "" : "hidden";
        };

        // Helper: insert a section-group divider into the panel. The
        // dashed top border on `.wv-filter-group-header` is the only
        // visual marker — there's no longer a textual label (every
        // section is identified by its icons + tooltips). `label` is
        // kept solely as a `data-section` attribute for DevTools, so
        // each divider is still discoverable when inspecting the DOM.
        //
        // The four groups (Cross-level / Parent / Attachment / Annotation)
        // mirror the row-kind hierarchy of the items tree: Cross-level
        // filters apply at every kind, Parent only to top-level items,
        // Attachment only to attachments, Annotation only to annotations.
        // The grouping carries SEMANTIC information about which row kind
        // each filter targets — knowing whether a chip is in the Parent
        // group vs the Attachment group tells the user what gets matched.
        // The reader filter popup has no analogous grouping because the
        // reader filters annotations only — no hierarchy, so a flat row
        // stack suffices there. This asymmetry between the two popups is
        // intentional, not a consistency bug. See reader-panels.ts's
        // `_wvRenderReaderFilterPopup` / `addRow` for the flat-row pattern.
        let _wvFirstGroupHeader = true;
        const addGroupHeader = (label: string) => {
            const hdr = doc.createElementNS(NS_HTML, "div");
            hdr.className = "wv-filter-group-header";
            hdr.setAttribute("data-section", label);
            // The first header sits at the top of the panel — drop its
            // divider line (an empty quick-search anchor div precedes
            // it, so the CSS `:first-child` rule can't catch it).
            if (_wvFirstGroupHeader) {
                hdr.classList.add("wv-filter-group-header-top");
                _wvFirstGroupHeader = false;
            }
            inner.appendChild(hdr);
        };

        // "Added By" is meaningful only in group libraries (where
        // multiple users can contribute) — hide it in the user's
        // personal library since `createdByUserID` is never set
        // there. Library is sampled at panel-open time so switching
        // libraries while the panel is closed picks up automatically
        // on next open.
        const win = doc.defaultView;
        const activeLibraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        const isGroupLibrary = activeLibraryID
            !== Zotero.Libraries.userLibraryID;

        // Section order, top → bottom:
        //   Quick Search — re-parented native `#zotero-tb-search`
        //                  + Restrict-scope toggle bar. Sits at
        //                  the top because it's *the* search input
        //                  for the whole library — once the popup
        //                  is open, the toolbar input is moved here
        //                  so there's only one search field visible.
        //   Cross-level  — has-* + multi-select search (apply across
        //                  all row kinds; second-broadest after the
        //                  quick search).
        //   Parent       — Item Type / standalone note / has-fields
        //   Attachment   — file-type / item-note / has-annotations
        //   Annotation   — color / type / comment
        //   Selection Target — Ctrl+A target picker (bottom bar)
        const quickSearchSection = doc.createElementNS(NS_HTML, "div");
        inner.appendChild(quickSearchSection);

        // Header row — title + Clear + × button (mirrors the reader
        // sidebar's filter popup, where this same row sits at the very
        // top). Clear / × move out of the cross-level row's right end
        // so the new home is unambiguous. `renderHeader` (defined above)
        // toggles their visibility in lockstep with `_isFilterActive`.
        const headBar = doc.createElementNS(NS_HTML, "div");
        headBar.className = "wv-filter-popup-headbar";
        const headTitle = doc.createElementNS(NS_HTML, "div");
        headTitle.className = "wv-filter-popup-headtitle";
        headTitle.textContent = "Filter Library";
        headBar.appendChild(headTitle);
        headBar.appendChild(clearTextBtn);
        headBar.appendChild(clearBtn);
        inner.appendChild(headBar);

        addGroupHeader("Cross-level");
        inner.appendChild(crossLevelSection);
        // Multi-selection search bar (Tag / Author / Added By /
        // Collection / Saved Search) — sits in the Cross-level
        // group, directly under the Has Related / Has Link icons,
        // since these searches all match across row kinds the same
        // way the icon triggers do.
        inner.appendChild(searchSection);

        addGroupHeader("Parent");
        // Read Status (Zotero Reading List) — renders only while that
        // plugin is active; sits below the Tag search, above Item Type.
        const readStatusSection = doc.createElementNS(NS_HTML, "div");
        inner.appendChild(readStatusSection);
        inner.appendChild(itemTypeRowSection);
        // Item Type row already hosts the Standalone Note tile at
        // its right end (after a vertical separator), so the only
        // section to append here is the Has-fields row.
        inner.appendChild(parentHasFieldsSection);

        addGroupHeader("Attachment");
        // attachmentFileTypeSection now also renders the Item Note
        // tile inline (right of the file-type icons, after a thin
        // vertical separator).
        inner.appendChild(attachmentFileTypeSection);
        inner.appendChild(hasAnnotationsSection);
        inner.appendChild(notesSection);

        addGroupHeader("Annotation");
        inner.appendChild(colorSection);
        inner.appendChild(typeSection);
        inner.appendChild(commentSection);

        // DEV outline-eval group — only when the pref is on. The whole header
        // + sections are omitted otherwise, so normal users never see them.
        if (this._wvOeEnabled()) {
            addGroupHeader("Outline (dev)");
            inner.appendChild(outlineScanSection);
            inner.appendChild(outlineClassSection);
            inner.appendChild(outlineVerdictSection);
        }

        // Bottom: Selection Target bar (controls Ctrl+A scope only,
        // doesn't affect filtering itself).
        const selChoices = [
            { key: "parent",     label: "Parent",
              tip: "Regular items will be selectable in Ctrl+A." },
            { key: "attachment", label: "Attachment",
              tip: "Attachment rows (standalone included) will be selectable in Ctrl+A." },
            { key: "note",       label: "Note",
              tip: "Notes (standalone and item notes) will be selectable in Ctrl+A." },
            { key: "annotation", label: "Annotation",
              tip: "Annotation rows will be selectable in Ctrl+A." },
        ];
        const buildToggleBar = (label, labelTip, stateInc, stateExc, choices, onToggle, extraClass, autoState?) => {
            const bar = doc.createElementNS(NS_HTML, "div");
            bar.className = "wv-filter-scope-bar"
                + (extraClass ? " " + extraClass : "");
            const lbl = doc.createElementNS(NS_HTML, "span");
            lbl.className = "wv-filter-scope-bar-label";
            lbl.textContent = label;
            if (labelTip) lbl.title = labelTip;
            bar.appendChild(lbl);
            for (const t of choices) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt wv-filter-scope-toggle";
                btn.textContent = t.label;
                btn.title = t.tip || t.label;
                btn.dataset.key = t.key;   // so _updateSelectionTargetAutoCues can find chips later
                const isInc = !!stateInc[t.key], isExc = !!stateExc[t.key];
                if (isInc) btn.dataset.selected = "true";
                if (isExc) btn.dataset.excluded = "true";
                // Inferred-default cue: no explicit chip, but the active
                // filters pin this kind (autoState[key] truthy).
                if (!isInc && !isExc && autoState && autoState[t.key]) {
                    btn.dataset.auto = "true";
                    btn.title = (t.tip || t.label)
                        + "  •  Auto: your active filters only target this kind, so that's what Ctrl+A selects. Click any kind to set it manually.";
                }
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onToggle(t.key, !!e.altKey);
                });
                bar.appendChild(btn);
            }
            return bar;
        };
        // Tri-state toggle for object-shaped state (key → bool).
        // Mirrors `_toggleIncludeExclude`'s semantics:
        //   plain click   : neutral → include → neutral
        //   alt+click     : neutral → exclude → neutral
        //   crossing modes: clears the other flag.
        const toggleObjTriState = (inc, exc, key, altKey) => {
            const wasInc = !!inc[key];
            const wasExc = !!exc[key];
            delete inc[key];
            delete exc[key];
            if (altKey) {
                if (!wasExc) exc[key] = true;
            }
            else {
                if (!wasInc) inc[key] = true;
            }
        };
        // The inferred-default cue (`data-auto` on a chip): only when no
        // chip is explicitly set AND `_effectiveSelectionTargetKinds`
        // narrows to one kind. Pass that narrowed set to buildToggleBar.
        const _noExplicitSelTarget = !(selTarget.parent || selTarget.attachment || selTarget.note || selTarget.annotation
            || selTargetExc.parent || selTargetExc.attachment || selTargetExc.note || selTargetExc.annotation);
        let _selTargetAuto: any = null;
        if (_noExplicitSelTarget) {
            const eff = this._effectiveSelectionTargetKinds();
            if (!(eff.parent && eff.attachment && eff.note && eff.annotation)) _selTargetAuto = eff;
        }
        const selBar = buildToggleBar(
            "Selection Target:",
            "Which row kinds Ctrl+A selects (out-of-scope rows are dimmed). Leave empty for the smart default: all kinds — or just the kind(s) your active filters target (annotation filters → annotations; item-type filters → items; both → both). Click a kind to override that, Alt+click to exclude.",
            selTarget, selTargetExc, selChoices,
            (key, altKey) => {
                toggleObjTriState(selTarget, selTargetExc, key, altKey);
                this._renderFilterPanelContents(panel, inner);
                this._applySelectionTargetVisuals();
            },
            "wv-filter-seltarget-bar wv-filter-bottom-bar",
            _selTargetAuto
        );
        inner.appendChild(selBar);

        // Bottom row — just the Alt+Click hint, centered. Clear /
        // × moved up to the right end of the cross-level row (see
        // refreshAll below) so they don't push the hint off-center.
        const bottomBar = doc.createElementNS(NS_HTML, "div");
        bottomBar.className = "wv-filter-bottom-controls";
        const hint = doc.createElementNS(NS_HTML, "span");
        hint.className = "wv-filter-bottom-hint";
        hint.textContent = "Alt+Click to Exclude";
        bottomBar.appendChild(hint);
        inner.appendChild(bottomBar);

        // Display-option toggles — sit just below the Alt+Click
        // hint. Both default OFF (= hide). The annotation toggle
        // mirrors Zotero's `hideContextAnnotationRows` pref so it
        // can also be flipped from the View menu; the attachment
        // toggle is a Weavero pref enforced by the apply pass
        // below (Zotero has no built-in equivalent).
        const annOpt = doc.createElementNS(NS_HTML, "label");
        annOpt.className = "wv-filter-display-opt";
        const annCb: any = doc.createElementNS(NS_HTML, "input");
        annCb.type = "checkbox";
        try {
            annCb.checked = !Zotero.Prefs.get("hideContextAnnotationRows");
        } catch (e) { annCb.checked = false; }
        annCb.addEventListener("change", () => {
            // Arm the v9 skip BEFORE the pref change:
            // `hideContextAnnotationRows` has a Zotero observer that
            // fires SYNCHRONOUSLY inside `Prefs.set` and calls
            // `itemsView.refresh()` — a full rebuild that would
            // collapse the tree. Arming first lets the v9 refresh-wrap
            // bypass that rebuild (the rows are already loaded) and
            // just re-key, so the toggle is instant with no flicker.
            this._armObserverRefreshSkip();
            try {
                Zotero.Prefs.set(
                    "hideContextAnnotationRows", !annCb.checked);
            } catch (e) {}
            this._refreshForDisplayToggle();
        });
        annOpt.appendChild(annCb);
        const annLbl = doc.createElementNS(NS_HTML, "span");
        annLbl.textContent = " Show Non-Matching Annotations";
        annOpt.appendChild(annLbl);
        annOpt.title = "Mirrors Zotero's 'Hide Non-Matching Annotations' (View menu). When off, only annotations matching the current search/filter appear under matched files.";

        const attOpt = doc.createElementNS(NS_HTML, "label");
        attOpt.className = "wv-filter-display-opt";
        const attCb: any = doc.createElementNS(NS_HTML, "input");
        attCb.type = "checkbox";
        try {
            // Weavero pref — default false (= hide). The apply
            // pass keeps non-primary attachment rows only when
            // this is true.
            attCb.checked = !!Zotero.Prefs.get(
                "weavero.showContextAttachmentRows");
        } catch (e) { attCb.checked = false; }
        attCb.addEventListener("change", () => {
            try {
                Zotero.Prefs.set(
                    "weavero.showContextAttachmentRows", attCb.checked);
            } catch (e) {}
            try { this._patchHideContextAttachments(); } catch (e) {}
            this._refreshForDisplayToggle();
        });
        attOpt.appendChild(attCb);
        const attLbl = doc.createElementNS(NS_HTML, "span");
        attLbl.textContent = " Show Non-Matching Attachments";
        attOpt.appendChild(attLbl);
        attOpt.title = "When off, only attachments matching the current search/filter appear under matched parents. Hidden attachments take their annotation children with them.";
        // Attachment first (higher in the tree), annotation second
        // — matches the convention used by the Selection Target row
        // and other higher-level-on-top groupings in this popup.
        inner.appendChild(attOpt);
        inner.appendChild(annOpt);

        const searchCtx = { libraryID: activeLibraryID, isGroupLibrary, panel };
        const refreshAll = () => {
            this._renderColorSection(doc, colorSection, refreshAll);
            this._renderTypeSection(doc, typeSection, refreshAll);
            this._renderHasCommentSection(doc, commentSection, refreshAll);
            this._renderAttachmentFileTypeSection(doc, attachmentFileTypeSection, refreshAll);
            this._renderNotesSection(doc, notesSection, refreshAll);
            this._renderHasAnnotationsSection(doc, hasAnnotationsSection, refreshAll);
            this._renderReadStatusSection(doc, readStatusSection, refreshAll);
            this._renderItemTypeRow(doc, itemTypeRowSection, refreshAll, searchCtx);
            // Tint the Rule 1 same-level OR groups so "pick any of
            // these" reads at a glance. Item Type, Attachment File Type
            // and Colour tint the whole row (their right-edge tile —
            // Standalone Note / Item Note — is the OR partner, so it
            // belongs inside). The Annotation Type row is handled inside
            // `_renderTypeSection` instead: its right-edge Has Comment
            // tile is NOT part of the OR set, so only the type icons get
            // a tinted pill there. These render fns reset className, so
            // the class is re-added on every refresh.
            for (const s of [itemTypeRowSection, attachmentFileTypeSection,
                             colorSection]) {
                s.classList.add("wv-filter-or-group");
            }
            this._renderParentHasFieldsSection(doc, parentHasFieldsSection, refreshAll);
            this._renderUnifiedSearchSection(doc, searchSection, refreshAll, searchCtx);
            this._renderCrossLevelSection(doc, crossLevelSection, refreshAll);
            this._renderQuickSearchSection(doc, quickSearchSection, refreshAll);
            if (this._wvOeEnabled()) {
                this._renderOutlineScanSection(doc, outlineScanSection, refreshAll);
                this._renderOutlineClassSection(doc, outlineClassSection, refreshAll);
                this._renderOutlineVerdictSection(doc, outlineVerdictSection, refreshAll);
            }
            renderHeader();
            // Filters changed → the smart Selection Target may have changed
            // too; re-sync the chip cue (the bar itself isn't re-rendered).
            try { this._updateSelectionTargetAutoCues(panel); } catch (e) {}
        };
        // Narrow refresher for handlers that must NOT run refreshAll
        // (the MRU tile click would reorder tiles mid-session): sync
        // just the header's Clear buttons + the Selection Target cue.
        // Instance-level so item-type row handlers reach it; replaced
        // on every panel build (stale-closure safe: resolved at call).
        (this as any)._wvPanelRefreshHeader = () => {
            try { renderHeader(); } catch (e) {}
            try { this._updateSelectionTargetAutoCues(panel); } catch (e) {}
        };
        refreshAll();
    }

    /** Re-edit a chip → open the same panel by triggering the toolbar
     *  button. Routing through the button keeps every "show panel"
     *  path on the same native type="menu" toggle, which means the
     *  open/close behaviour stays consistent regardless of entry. */
    _openFilterPanel() {
        const win = Zotero.getMainWindow();
        if (!win) return;
        const doc = win.document;
        const tbBtn: any = doc.getElementById("wv-filter-tb-button");
        if (!tbBtn) return;
        // `open` is the XUL menubutton API for programmatically
        // showing the child popup; mirrors a click on the button.
        try { tbBtn.open = true; } catch (e) {}
    }

    /** Unified search section — one search input with a mode dropdown
     *  on the left that switches between Tag, Author, Added By,
     *  Collection, and Saved Search. Suggestions appear in the same
     *  box; clicking a suggestion adds it to the appropriate state
     *  field (per-group for Tag/Author/Added By, global for
     *  Collection/Saved Search).
     *
     *  Each mode keeps its own search query and visual selection
     *  state, so switching modes preserves what the user typed and
     *  picked previously. */
    _renderUnifiedSearchSection(doc, section, refreshAll, ctx) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const libraryID = ctx.libraryID;
        const isGroupLibrary = ctx.isGroupLibrary;
        const panel = ctx.panel;

        // Mode definitions. Each mode supplies async value-loading +
        // selection accessors. `ranked` enables the exact / prefix /
        // substring tiering used by Tag / Author / Added By.
        const modes = [];
        modes.push({
            key: "tag",
            label: "Tag",
            placeholder: "Search tags…",
            queryField: "_tagSearchQuery",
            emptyAll: "No tags in this library",
            emptyFiltered: "No matching tags",
            ranked: true,
            getValues: async () => {
                if (this._cachedAnnotationTags) return this._cachedAnnotationTags;
                const t = await this._collectAnnotationTags(libraryID);
                this._cachedAnnotationTags = t;
                return t;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationTag) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationTagExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            // Tag icon shows ONLY on selected pills, not in the
            // suggestion list — the list rows are labelled by name
            // and the icon would just add visual weight.
            iconInList: false,
            // Tag icon, themed via Mozilla `-moz-context-properties`
            // so its `context-fill` paths take currentColor. Coloured
            // tags (per `Zotero.Tags.getColor`) override the default
            // with the tag's user-assigned hue. Default falls back to
            // `--accent-orange` — the same variable Zotero uses for
            // the Tags section in the item pane sidenav (see
            // scss/abstracts/_variables.scss → `$item-pane-sections:
            // ("tags": var(--accent-orange))`), so the chip reads as
            // visually consistent with that section.
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/tag.svg";
                let color = "var(--accent-orange)";
                try {
                    const c: any = Zotero.Tags.getColor(libraryID, id);
                    if (c && c.color) color = c.color;
                } catch (e) {}
                icon.style.color = color;
                parent.insertBefore(icon, parent.firstChild);
            },
            // Decorate suggestion-list rows so coloured / emoji tags
            // render the same way the tag selector does:
            // coloured non-emoji → bold name with a small coloured
            // dot before it; emoji tags → bold (the emoji glyph is
            // already in the name); plain → no special styling.
            // The dot itself is drawn by the `.wv-filter-tag-colored`
            // CSS rule via a `::before` pseudo, painted with the
            // `--wv-tag-color` CSS variable we set inline.
            styleButton: (btn, id /*, selected */) => {
                let color = null;
                try {
                    const c: any = Zotero.Tags.getColor(libraryID, id);
                    if (c && c.color) color = c.color;
                } catch (e) {}
                let isEmoji = false;
                try {
                    const internal: any = Zotero.Utilities.Internal;
                    isEmoji = !!(internal && internal.containsEmoji
                        && internal.containsEmoji(id));
                } catch (e) {}
                if (color) {
                    btn.classList.add("wv-filter-tag-colored");
                    btn.style.setProperty("--wv-tag-color", color);
                }
                if (isEmoji) btn.classList.add("wv-filter-tag-emoji");
            },
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.annotationTagExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.annotationTag = [...sel];
                g.annotationTagExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "publication",
            label: "Publication",
            placeholder: "Search publications…",
            queryField: "_publicationSearchQuery",
            emptyAll: "No publications in this library",
            emptyFiltered: "No matching publications",
            ranked: true,
            getValues: async () => {
                if (this._cachedPublications) return this._cachedPublications;
                const t = await this._collectPublications(libraryID);
                this._cachedPublications = t;
                return t;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().publication) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().publicationExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.publicationExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.publication = [...sel];
                g.publicationExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "author",
            label: "Author",
            placeholder: "Search authors…",
            queryField: "_authorSearchQuery",
            emptyAll: "No annotation authors in this library",
            emptyFiltered: "No matching authors",
            ranked: true,
            getValues: async () => {
                if (this._cachedAnnotationAuthors) return this._cachedAnnotationAuthors;
                const a = await this._collectAnnotationAuthors(libraryID);
                this._cachedAnnotationAuthors = a;
                return a;
            },
            getSelectedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthor) || []),
            getExcludedSet: () => new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthorExclude) || []),
            valueId: (v) => v,
            valueLabel: (v) => v,
            getLabelById: (id) => id,
            onToggle: (id, sel, altKey) => {
                const g = this._activeGroup();
                if (!g) return;
                const exc = new Set(g.annotationAuthorExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                g.annotationAuthor = [...sel];
                g.annotationAuthorExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        if (isGroupLibrary) {
            modes.push({
                key: "addedBy",
                label: "Added By",
                placeholder: "Search users…",
                queryField: "_addedBySearchQuery",
                emptyAll: "No tracked creators in this library",
                emptyFiltered: "No matching users",
                ranked: true,
                getValues: async () => {
                    if (this._cachedAddedByUsers) return this._cachedAddedByUsers;
                    const u = await this._collectAddedByUsers(libraryID);
                    this._cachedAddedByUsers = u;
                    return u;
                },
                getSelectedSet: () => new Set(
                    (this._activeGroup() && this._activeGroup().addedBy) || []),
                getExcludedSet: () => new Set(
                    (this._activeGroup() && this._activeGroup().addedByExclude) || []),
                valueId: (v) => v,
                valueLabel: (v) => v,
                getLabelById: (id) => id,
                onToggle: (id, sel, altKey) => {
                    const g = this._activeGroup();
                    if (!g) return;
                    const exc = new Set(g.addedByExclude || []);
                    if (altKey) {
                        if (exc.has(id)) exc.delete(id);
                        else { exc.add(id); sel.delete(id); }
                    } else {
                        if (sel.has(id)) sel.delete(id);
                        else { sel.add(id); exc.delete(id); }
                    }
                    g.addedBy = [...sel];
                    g.addedByExclude = [...exc];
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                },
                styleButton: (btn, val, sel) => {
                    if (!this._getEnableAddedByColors()) return;
                    const colour = this._colorForUser(val);
                    btn.style.color = colour;
                    btn.style.borderColor = this._withAlpha(colour, 0.4);
                    btn.style.backgroundColor = this._withAlpha(
                        colour, sel.has(val) ? 0.28 : 0.12);
                },
            });
        }
        // (Item Type now lives in its own dedicated row above the
        // search box — see `_renderItemTypeRow`.)
        modes.push({
            key: "collection",
            label: "Collection",
            placeholder: "Search collections…",
            queryField: "_collectionSearchQuery",
            emptyAll: "No collections in this library",
            emptyFiltered: "No matching collections",
            ranked: false,
            verticalList: true,
            getValues: async () => {
                try {
                    return (Zotero.Collections.getByLibrary(libraryID, true) || [])
                        .map(c => ({ id: c.id, name: c.name }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                } catch (e) {
                    dbg("[Weavero][filter] collections enum err: " + e);
                    return [];
                }
            },
            getSelectedSet: () => new Set(this._filterState.collections || []),
            getExcludedSet: () => new Set(
                this._filterState.collectionsExclude || []),
            valueId: (v) => v.id,
            valueLabel: (v) => v.name,
            getLabelById: (id) => {
                try {
                    const c = Zotero.Collections.get(id);
                    return c ? c.name : String(id);
                } catch (e) { return String(id); }
            },
            // Use Zotero's `.icon icon-css icon-collection` class
            // chain so the icon picks up the themed blue folder
            // shipped under chrome://zotero/skin/collection-tree/...
            // (same image as the collections pane, theme-aware).
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "span");
                icon.className = "icon icon-css icon-collection";
                parent.insertBefore(icon, parent.firstChild);
            },
            onToggle: (id, sel, altKey) => {
                const exc = new Set(
                    this._filterState.collectionsExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                this._filterState.collections = [...sel];
                this._filterState.collectionsExclude = [...exc];
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });
        modes.push({
            key: "savedSearch",
            label: "Saved Search",
            placeholder: "Search saved searches…",
            queryField: "_savedSearchSearchQuery",
            emptyAll: "No saved searches in this library",
            emptyFiltered: "No matching saved searches",
            ranked: false,
            verticalList: true,
            getValues: async () => {
                try {
                    return ((Zotero.Searches as any).getByLibrary(libraryID) || [])
                        .map(s => ({ id: s.id, name: s.name }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                } catch (e) {
                    dbg("[Weavero][filter] saved searches enum err: " + e);
                    return [];
                }
            },
            getSelectedSet: () => new Set(this._filterState.savedSearches || []),
            getExcludedSet: () => new Set(
                this._filterState.savedSearchesExclude || []),
            valueId: (v) => v.id,
            valueLabel: (v) => v.name,
            getLabelById: (id) => {
                try {
                    const s = Zotero.Searches.get(id);
                    return s ? s.name : String(id);
                } catch (e) { return String(id); }
            },
            // Use Zotero's `.icon icon-css icon-search` so the
            // saved-search icon picks up the themed colour from
            // chrome://zotero/skin/collection-tree/... — same as
            // the collections pane.
            renderIcon: (parent, id) => {
                const NS = "http://www.w3.org/1999/xhtml";
                const icon = parent.ownerDocument.createElementNS(NS, "span");
                icon.className = "icon icon-css icon-search";
                parent.insertBefore(icon, parent.firstChild);
            },
            onToggle: async (id, sel, altKey) => {
                const exc = new Set(
                    this._filterState.savedSearchesExclude || []);
                if (altKey) {
                    if (exc.has(id)) exc.delete(id);
                    else { exc.add(id); sel.delete(id); }
                } else {
                    if (sel.has(id)) sel.delete(id);
                    else { sel.add(id); exc.delete(id); }
                }
                this._filterState.savedSearches = [...sel];
                this._filterState.savedSearchesExclude = [...exc];
                await this._refreshSavedSearchResults();
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
            },
        });

        // Resolve the active mode (default → first in list / "tag").
        if (!this._unifiedSearchMode
            || !modes.find(m => m.key === this._unifiedSearchMode)) {
            this._unifiedSearchMode = modes[0].key;
        }
        let mode = modes.find(m => m.key === this._unifiedSearchMode);

        // Top row — dropdown trigger (▾) + search input on one line.
        // The trigger shows ONLY a chevron (no label), matching
        // Zotero's quick-search dropmarker. Selected mode is read
        // off the search input's placeholder; tooltip on hover gives
        // the affordance.
        const topRow = doc.createElementNS(NS_HTML, "div");
        topRow.className = "wv-filter-search-row";
        opts.appendChild(topRow);

        // Search wrap — a single rounded box that holds BOTH the
        // ▾ trigger and the text input, mirroring Zotero's quick
        // search field (where the dropmarker is embedded inside
        // the search field rather than sitting beside it).
        const searchWrap = doc.createElementNS(NS_HTML, "div");
        searchWrap.className = "wv-filter-search-wrap";
        topRow.appendChild(searchWrap);

        const trigger = doc.createElementNS(NS_HTML, "button");
        trigger.type = "button";
        trigger.className = "wv-filter-mode-trigger";
        trigger.textContent = "▾"; // ▾
        trigger.title = "Choose what to filter";
        searchWrap.appendChild(trigger);

        // XUL menupopup — renders as its own toplevel widget so it
        // can extend BEYOND the parent <panel>'s clipping bounds.
        // An HTML popover here would be clipped at the panel's edge,
        // hiding any items that fall below it (the Search section
        // sits low in the panel).
        //
        // Park it in `mainPopupSet`, the standard XUL container for
        // toplevel popups in the main window. Nesting it inside the
        // wv-filter-popup <panel> leaves openPopup() as a no-op
        // (popups inside popups don't initialize correctly here).
        // Zotero 10's main window has NO #mainPopupSet -- the real
        // container is the anonymous top-level <popupset> under
        // <window> (verified live 2026-08-19; the old documentElement
        // fallback parked the menu on the window root, where it once
        // rendered as an inline text list at the bottom-left).
        const popupHost = wvPopupHost(doc);
        // Sweep DOCUMENT-WIDE, not just the current host (2026-08-19):
        // a mode menu once parked on the documentElement fallback
        // renders INLINE (bottom-left text list, MJT's screenshot) and
        // a host-scoped sweep never finds it again. Also catch bare
        // menuitems orphaned at window level by the same failure.
        const STALE_MENUS = doc.querySelectorAll(
            "menupopup.wv-filter-mode-menupopup");
        for (const m of STALE_MENUS) m.remove();
        for (const el of [...doc.documentElement.children]) {
            if (el.tagName === "menuitem") el.remove();
        }
        const menuPopup = doc.createXULElement("menupopup");
        menuPopup.className = "wv-filter-mode-menupopup";
        popupHost.appendChild(menuPopup);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = mode.label;
        search.value = this[mode.queryField] || "";
        searchWrap.appendChild(search);

        // Suggestion box — appears directly under the search row
        // (only when the input has focus). Stacked above the
        // selected-pills list so picks fall down into the chip
        // area, mirroring the visual flow.
        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        // Selected-pills list — sits below the suggestion box,
        // always visible when there's at least one selection.
        const selectedList = doc.createElementNS(NS_HTML, "div");
        selectedList.className = "wv-filter-selected-list";
        opts.appendChild(selectedList);

        // Inline focus wiring — wired on the SEARCH INPUT only so
        // clicking the mode trigger doesn't pop the suggestion box.
        // Outside-clicks (anywhere not in topRow / box) collapse the
        // box and blur the input.
        let onDocMouseDown = null;
        const hideBox = () => {
            box.style.display = "none";
            // Drop the global "active suggestion" reference (used by the
            // document-capture Escape handler — see _setupItemsListFilter).
            if (this._wvActiveSuggest && this._wvActiveSuggest.box === box) {
                this._wvActiveSuggest = null;
            }
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        const showBox = () => {
            // Register this box as the active suggestion list so a document-
            // capture Escape can close it (the XUL popup eats Escape before the
            // input, like it does the spacebar).
            this._wvActiveSuggest = { box, hide: hideBox };
            if (box.style.display !== "none") return;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    if (box.contains(e.target)) return;
                    if (topRow.contains(e.target)) return;
                    try { search.blur(); } catch (err) {}
                    hideBox();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        search.addEventListener("focus", showBox);
        search.addEventListener("blur", (e) => {
            if (e.relatedTarget && box.contains(e.relatedTarget)) return;
            hideBox();
        });

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rankFn = (all, q) => {
            const exact = [], pre = [], sub = [], acr = [];
            for (const v of all) {
                const label = mode.valueLabel(v);
                const lc = label.toLowerCase();
                if (lc === q) exact.push(v);
                else if (lc.startsWith(q)) pre.push(v);
                else if (lc.includes(q)) sub.push(v);
                // Acronym tier (last): "jfm" → "Journal of Fluid Mechanics".
                else if (this._wvAcronymMatch(label, q)) acr.push(v);
            }
            acr.sort((a, b) => this._wvInitialsLen(mode.valueLabel(a))
                - this._wvInitialsLen(mode.valueLabel(b)));
            return [...exact, ...pre, ...sub, ...acr];
        };

        let cached = null;
        // Keyboard navigation of the suggestion list (ArrowUp/Down + Enter).
        // `kbActive` is the highlighted index among the live option buttons;
        // it resets on every re-render (the box is rebuilt) — see renderButtons.
        let kbActive = -1;
        const kbButtons = () => Array.from(
            box.querySelectorAll("button.wv-filter-opt")) as any[];
        const kbSetActive = (i) => {
            const btns = kbButtons();
            btns.forEach((b) => b.classList.remove("wv-filter-opt-active"));
            if (!btns.length || i < 0) { kbActive = -1; return; }
            if (i > btns.length - 1) i = btns.length - 1;
            btns[i].classList.add("wv-filter-opt-active");
            kbActive = i;
            try { btns[i].scrollIntoView({ block: "nearest" }); } catch (e) {}
        };

        // Render chips below the search box for values picked across
        // ALL modes — both include AND exclude. Switching modes
        // doesn't drop pills picked under previous modes. Excluded
        // pills get the red border + diagonal slash, matching the
        // icon-grid Alt+click visual.
        //
        // Insertion-order preservation: `this._pillOrder` is a
        // session list of stable pill keys ("modeKey:i:id" or
        // "modeKey:e:id"). Each render prunes stale keys (values
        // no longer selected/excluded) and appends any new ones —
        // so existing pills stay where they were and additions land
        // at the end of the row, regardless of mode-iteration order.
        const renderSelectedList = () => {
            while (selectedList.firstChild) {
                selectedList.removeChild(selectedList.firstChild);
            }
            if (!this._pillOrder) this._pillOrder = [];
            const buildPill = (m, id, isExclude) => {
                const label = m.getLabelById
                    ? m.getLabelById(id) : String(id);
                const pill = doc.createElementNS(NS_HTML, "span");
                pill.className = "wv-filter-selected-pill";
                if (isExclude) pill.dataset.exclude = "true";
                if (m.pillIconOnly) pill.dataset.iconOnly = "true";
                pill.title = (isExclude ? "Not " : "")
                    + m.label + ": " + label;
                if (m.renderIcon) {
                    m.renderIcon(pill, id);
                } else {
                    const modeLbl = doc.createElementNS(
                        NS_HTML, "span");
                    modeLbl.className = "wv-filter-selected-pill-mode";
                    modeLbl.textContent = (isExclude ? "Not " : "")
                        + m.label + ":";
                    pill.appendChild(modeLbl);
                }
                if (!m.pillIconOnly) {
                    const lbl = doc.createElementNS(NS_HTML, "span");
                    lbl.className = "wv-filter-selected-pill-label";
                    lbl.textContent = label;
                    pill.appendChild(lbl);
                }
                // Tag pills get an "Apply to" scope arrow — the Tag
                // filter is cross-level. Shares `hasTagScope` with
                // the Has Tag chip, so adjusting one place affects
                // both filters (and the modified-state cue stays in
                // sync). Clicking any pill's arrow opens the same
                // group-scoped picker.
                if (m.key === "tag") {
                    const g = this._activeGroup();
                    const tagScope = (g && g.hasTagScope)
                        || { annotation: true, attachment: true, parent: true };
                    const KINDS_ROW_TAG = [
                        { key: "parent",     label: "Parent" },
                        { key: "attachment", label: "Attachment" },
                        { key: "note",       label: "Note" },
                        { key: "annotation", label: "Annotation" },
                    ];
                    const arrow = doc.createElementNS(NS_HTML, "button");
                    arrow.type = "button";
                    arrow.className = "wv-filter-selected-pill-scope";
                    arrow.textContent = "▾";
                    arrow.title = "Choose which row kinds the Tag filter applies to (shared with Has Tag).";
                    const allOn = KINDS_ROW_TAG.every(
                        k => tagScope[k.key] !== false);
                    if (!allOn) arrow.dataset.modified = "true";
                    arrow.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this._openCrossLevelScopePopup(
                            arrow, "hasTagScope", KINDS_ROW_TAG,
                            () => { renderSelectedList(); refreshAll(); });
                    });
                    pill.appendChild(arrow);
                }

                const x = doc.createElementNS(NS_HTML, "button");
                x.type = "button";
                x.className = "wv-filter-selected-pill-x";
                x.textContent = "×";
                x.title = "Remove";
                x.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    // Always pass the INCLUDE set as `sel` — onToggle's
                    // first arg is treated internally as the include
                    // side; passing the exclude set there used to
                    // overwrite the include array with the exclude
                    // contents when both directions were active.
                    // `altKey=isExclude` tells onToggle to operate on
                    // the exclude side when the pill came from there.
                    await m.onToggle(id, m.getSelectedSet(), isExclude);
                    renderSelectedList();
                    renderButtons();
                    refreshAll();   // keep the header's Clear buttons in sync
                });
                // Alt+click on the pill body (not the ×) switches
                // the pill from include → exclude or back, the same
                // way Alt+click in the suggestion list does on a
                // fresh value. The ×'s own handler stops propagation
                // so this only fires for clicks on the pill itself.
                pill.addEventListener("click", async (e) => {
                    if (!e.altKey) return;
                    e.stopPropagation();
                    await m.onToggle(id, m.getSelectedSet(), !isExclude);
                    renderSelectedList();
                    renderButtons();
                    refreshAll();   // keep the header's Clear buttons in sync
                });
                pill.appendChild(x);
                selectedList.appendChild(pill);
            };
            // Build the set of currently-active pills + a lookup
            // from stable key → {mode, id, isExclude}.
            const activeMap = new Map();
            for (const m of modes) {
                let sel = null, exc = null;
                try { sel = m.getSelectedSet(); } catch (e) {}
                try {
                    if (m.getExcludedSet) exc = m.getExcludedSet();
                } catch (e) {}
                if (sel && sel.size) {
                    for (const id of sel) {
                        const k = m.key + ":i:" + id;
                        activeMap.set(k, { m, id, isExclude: false });
                    }
                }
                if (exc && exc.size) {
                    for (const id of exc) {
                        const k = m.key + ":e:" + id;
                        activeMap.set(k, { m, id, isExclude: true });
                    }
                }
            }
            // Drop stale keys (values that are no longer selected
            // or excluded) and append any newly-active keys.
            this._pillOrder = this._pillOrder.filter(k => activeMap.has(k));
            const inOrder = new Set(this._pillOrder);
            for (const k of activeMap.keys()) {
                if (!inOrder.has(k)) this._pillOrder.push(k);
            }
            // Render in the preserved order.
            for (const k of this._pillOrder) {
                const entry = activeMap.get(k);
                if (entry) buildPill(entry.m, entry.id, entry.isExclude);
            }
        };

        const renderButtons = () => {
            if (!cached) return;
            kbActive = -1;   // box is rebuilt below — drop any keyboard highlight
            while (box.firstChild) box.removeChild(box.firstChild);
            // Vertical mode (Item Type / Collection / Saved Search):
            // one row per value, icon + label. `columns` (default 1)
            // turns the box into a grid for facets with many short
            // labels (Item Type → 2-col).
            if (mode.verticalList) {
                box.dataset.vertical = "true";
                box.dataset.columns = String(mode.columns || 1);
            } else {
                box.removeAttribute("data-vertical");
                box.removeAttribute("data-columns");
            }
            const q = (this[mode.queryField] || "").trim().toLowerCase();
            const selected = mode.getSelectedSet();
            const excluded = mode.getExcludedSet
                ? mode.getExcludedSet() : new Set();
            // Real (non-separator) candidates with already-included AND
            // already-excluded values dropped — both states show as
            // pills below, so neither needs to appear in the suggestions.
            const isPicked = (id) => selected.has(id) || excluded.has(id);
            const candidates = cached.filter(
                v => !v.separator && !isPicked(mode.valueId(v)));
            let list;
            if (!q) {
                // Empty query → show full cache, preserving group
                // separators only between two surviving groups.
                list = [];
                let lastWasItem = false;
                let pendingSep = null;
                for (const v of cached) {
                    if (v.separator) { pendingSep = v; continue; }
                    if (isPicked(mode.valueId(v))) continue;
                    if (pendingSep && lastWasItem) list.push(pendingSep);
                    pendingSep = null;
                    list.push(v);
                    lastWasItem = true;
                }
            }
            else if (mode.ranked) list = rankFn(candidates, q);
            else list = candidates.filter((v) => {
                const label = mode.valueLabel(v);
                return label.toLowerCase().includes(q)
                    || this._wvAcronymMatch(label, q);
            });
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            if (!list.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q ? mode.emptyFiltered : mode.emptyAll;
                box.appendChild(empty);
                return;
            }
            for (const v of list) {
                if (v.separator) {
                    const sep = doc.createElementNS(NS_HTML, "div");
                    sep.className = "wv-filter-list-separator";
                    box.appendChild(sep);
                    continue;
                }
                const id = mode.valueId(v);
                const label = mode.valueLabel(v);
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = label;
                if (mode.renderIcon && mode.iconInList !== false) {
                    mode.renderIcon(btn, mode.valueId(v));
                }
                // Label in a span so ellipsis works inside flex-row
                // (vertical-list) layout. The default pill layout
                // already handles ellipsis via `display: inline-block`
                // on the button, but the span is harmless there.
                const lblSpan = doc.createElementNS(NS_HTML, "span");
                lblSpan.className = "wv-filter-opt-label";
                lblSpan.textContent = label;
                btn.appendChild(lblSpan);
                if (mode.styleButton) mode.styleButton(btn, id, selected);
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const altKey = !!e.altKey;
                    const wasSelected = selected.has(id);
                    await mode.onToggle(id, selected, altKey);
                    // Mode hook for ADDS only — used by Item Type
                    // to bump its own filter-MRU. Exclude-toggles
                    // also count as a "use" for MRU purposes.
                    if (!wasSelected && mode.onAdd) {
                        try { mode.onAdd(id); } catch (err) {}
                    }
                    // Pick → clear search, close suggestions, blur,
                    // and surface the choice as a chip below.
                    this[mode.queryField] = "";
                    search.value = "";
                    hideBox();
                    try { search.blur(); } catch (err) {}
                    renderSelectedList();
                    renderButtons();
                    // Refresh the whole popup so the header's Clear /
                    // Clear-and-Close buttons (shown only by renderHeader,
                    // which runs only inside refreshAll) reflect the now-
                    // active filter. Without this, adding a tag / author /
                    // collection left those buttons hidden until the popup
                    // was closed and reopened.
                    refreshAll();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };

        const loadAndRender = async () => {
            try {
                cached = await mode.getValues();
                if (!section.isConnected) return;
                renderSelectedList();
                renderButtons();
            } catch (e) {
                dbg("[Weavero][filter] unified search load err: " + e);
            }
        };

        const switchMode = (newKey) => {
            const next = modes.find(m => m.key === newKey);
            if (!next) return;
            mode = next;
            this._unifiedSearchMode = next.key;
            search.placeholder = mode.label;
            search.value = this[mode.queryField] || "";
            cached = null;
            // Clear any chips from the prior mode while we load.
            while (selectedList.firstChild) {
                selectedList.removeChild(selectedList.firstChild);
            }
            while (box.firstChild) box.removeChild(box.firstChild);
            const ph = doc.createElementNS(NS_HTML, "span");
            ph.style.opacity = "0.5";
            ph.style.fontSize = "12px";
            ph.textContent = "Loading…";
            box.appendChild(ph);
            loadAndRender();
        };

        // Populate the menupopup. Mark the active mode with
        // `checked="true"` so it shows a check mark; rebuilt on each
        // open so the indicator tracks the current mode.
        const buildMenu = () => {
            while (menuPopup.firstChild) {
                menuPopup.removeChild(menuPopup.firstChild);
            }
            for (const m of modes) {
                const item = doc.createXULElement("menuitem");
                item.setAttribute("label", m.label);
                item.setAttribute("type", "radio");
                item.setAttribute("name", "wv-filter-mode");
                if (m.key === mode.key) item.setAttribute("checked", "true");
                item.addEventListener("command", () => {
                    switchMode(m.key);
                    try { search.focus(); } catch (err) {}
                });
                menuPopup.appendChild(item);
            }
        };

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (menuPopup.state === "open" || menuPopup.state === "showing") {
                menuPopup.hidePopup();
                return;
            }
            buildMenu();
            // `after_start` = below the trigger, left-aligned.
            // Native XUL popup escapes the parent panel's clipping.
            menuPopup.openPopup(trigger, "after_start", 0, 2,
                false, false);
        });

        search.addEventListener("input", () => {
            this[mode.queryField] = search.value || "";
            renderButtons();
        });

        // Keyboard navigation of the suggestion list: ArrowDown/Up move the
        // highlight, Enter picks (the highlighted option, or the top one if none
        // is highlighted), Escape closes the suggestions first. preventDefault on
        // the arrows/Enter stops the XUL popup's own key handling.
        search.addEventListener("keydown", (e) => {
            const btns = kbButtons();
            if (e.key === "ArrowDown") {
                if (!btns.length) return;
                e.preventDefault();
                kbSetActive(kbActive < 0 ? 0 : kbActive + 1);
            }
            else if (e.key === "ArrowUp") {
                if (!btns.length) return;
                e.preventDefault();
                kbSetActive(kbActive <= 0 ? -1 : kbActive - 1);
            }
            else if (e.key === "Enter") {
                const target = kbActive >= 0 ? btns[kbActive] : btns[0];
                if (target) { e.preventDefault(); target.click(); }
            }
            else if (e.key === "Escape") {
                if (box.style.display !== "none") {
                    e.preventDefault();
                    e.stopPropagation();
                    kbSetActive(-1);
                    hideBox();
                    try { search.blur(); } catch (er) {}
                }
            }
        });

        loadAndRender();
    }

    /** Item Type row — sits above the unified Search box. Layout:
     *
     *    [▾]  [icon] [icon] [icon] …
     *
     *  The ▾ trigger toggles a vertical 2-column list of types
     *  (icon + localised name) below the row. Picking a type adds
     *  its bare icon as a chip to the right of the trigger;
     *  clicking the chip removes it. Alt+click on a list row
     *  excludes (red border + slash). Recently-used types come
     *  first in the list, identical to the previous Item Type
     *  picker in the unified search. */
    _renderItemTypeRow(doc, section, refreshAll, ctx) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section wv-filter-itype-row";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        // Trigger row — native XUL menulist (matches the "Search in
        // library" trigger in advanced search) + selected-icon chips
        // inline. Using `<menulist native="true">` gives us the exact
        // platform-native chrome (border, background, dropmarker)
        // that advanced search uses, without any CSS approximation.
        // The native popup it would normally open is suppressed via
        // `popupshowing.preventDefault()` — we keep the custom 2-col
        // HTML grid below so picked types still appear with icons,
        // and so Alt+click-to-exclude works the way it does on every
        // other facet in the panel.
        const triggerRow = doc.createElementNS(NS_HTML, "div");
        triggerRow.className = "wv-filter-itype-trigger-row";
        opts.appendChild(triggerRow);

        const trigger = doc.createXULElement("menulist");
        // XUL menulists size the CLOSED control to the widest menu
        // item by default -- that rendered as dead space inside the
        // "Item Type" button (MJT 2026-08-19). The popup sizes itself
        // independently, so the closed control can hug its label.
        trigger.setAttribute("sizetopopup", "none");
        trigger.setAttribute("native", "true");
        trigger.setAttribute("label", "Item Type");
        trigger.className = "wv-filter-itype-trigger";
        trigger.setAttribute("tooltiptext", "Item Type — click to choose");
        // Empty popup — required for the menulist to render its
        // dropmarker. The popupshowing handler cancels the native
        // open and instead toggles our custom 2-col HTML grid.
        // Using `popupshowing` (rather than `click`) catches every
        // way the menulist tries to open (mouse, keyboard).
        const triggerPopup = doc.createXULElement("menupopup");
        trigger.appendChild(triggerPopup);
        triggerRow.appendChild(trigger);

        // Last-used item types, ALWAYS visible as one-click tiles
        // (requested 15 Aug 2026): the MRU used to live at the top of
        // the dropdown, which still cost a click to reach. It now sits
        // inline next to the trigger and is REMOVED from the dropdown
        // (no duplication). Selection state renders on the tiles
        // themselves; the selected-chips row keeps only types that are
        // NOT in the MRU.
        const mruRow = doc.createElementNS(NS_HTML, "div");
        mruRow.className = "wv-filter-itype-mru";
        mruRow.style.display = "flex";
        mruRow.style.alignItems = "center";
        mruRow.style.gap = "2px";
        mruRow.style.marginLeft = "4px";
        triggerRow.appendChild(mruRow);

        // Selected chips share the trigger row's own flex flow
        // (`display: contents`, MJT 2026-08-19 v2): inline after the
        // MRU while they fit, overflow WRAPS to a full-width next line.
        // (v1 gave them a separate always-below line; MJT: inline
        // first, wrap only on overflow. The original wrapper-with-
        // flex:1 stacked chips vertically in the leftover column.)
        const selectedRow = doc.createElementNS(NS_HTML, "div");
        selectedRow.className = "wv-filter-itype-selected";
        triggerRow.appendChild(selectedRow);


        // Vertical 2-col suggestion list (hidden until trigger is
        // clicked).
        const box = doc.createElementNS(NS_HTML, "div");
        // `wv-itype-overlay`: the list floats OVER the later sections
        // (absolute, anchored under the trigger row) instead of expanding
        // inline. Inline expansion pushed the rest of the popup down, and
        // hide-on-mousedown reflowed everything mid-click, so a click on a
        // lower filter closed the list but never landed (2026-08-04).
        box.className = "wv-filter-tag-list wv-itype-overlay";
        box.dataset.vertical = "true";
        box.dataset.columns = "2";
        box.style.display = "none";
        opts.appendChild(box);

        let cached = null;

        const loadValues = async () => {
            try {
                const SPECIAL = new Set([
                    "attachment", "note", "annotation",
                ]);
                const raw = Zotero.ItemTypes.getTypes() || [];
                const all = raw
                    .filter(t => !SPECIAL.has(t.name))
                    .map(t => {
                        let label = t.name;
                        try {
                            label = Zotero.ItemTypes.getLocalizedString(t.name);
                        } catch (e) {}
                        return { id: t.name, name: label };
                    });
                // The MRU renders INLINE in the trigger row; the dropdown
                // stays the COMPLETE alphabetical list (MJT, 15 Aug 2026:
                // holes in the menu were more confusing than the
                // duplication they avoided). The old recent-block at the
                // top is gone -- the tiles replace it -- so each type
                // appears exactly once here.
                return [...all].sort((a, b) => a.name.localeCompare(b.name));
            } catch (e) {
                dbg("[Weavero][filter] item types enum err: " + e);
                return [];
            }
        };

        /** MRU ids, validated against the live type list. Cap 5 to match
         *  the "New Item" button (`newItemTypeMRU`, also the seed when
         *  Weavero has no history of its own yet). */
        const computeMruIds = () => {
            try {
                const valid = new Set((Zotero.ItemTypes.getTypes() || [])
                    .map(t => t.name));
                const wvMru = (String(Zotero.Prefs.get(
                    "extensions.zotero.weavero.itemTypeFilterMRU", true)) || "")
                    .split(",").filter(Boolean);
                const zMru = (String(Zotero.Prefs.get(
                    "newItemTypeMRU")) || "").split(",").filter(Boolean);
                const seen = new Set();
                const out = [];
                for (const name of [...wvMru, ...zMru]) {
                    if (seen.has(name) || !valid.has(name)) continue;
                    seen.add(name);
                    out.push(name);
                    // Cap 6 (MJT 2026-08-19): fills the freed line
                    // without an overflow affordance; the boundary trim
                    // below stays as a safety net.
                    if (out.length >= 6) break;
                }
                return out;
            } catch (e) { return []; }
        };

        const bumpMRU = (id) => {
            try {
                const KEY = "extensions.zotero.weavero.itemTypeFilterMRU";
                const cur = (String(Zotero.Prefs.get(KEY, true)) || "")
                    .split(",").filter(Boolean);
                const i = cur.indexOf(id);
                if (i !== -1) cur.splice(i, 1);
                cur.unshift(id);
                Zotero.Prefs.set(KEY, cur.slice(0, 5).join(","), true);
            } catch (e) {}
        };

        const buildSelectedChip = (id, isExclude) => {
            const chip = doc.createElementNS(NS_HTML, "span");
            chip.className = "wv-filter-itype-chip";
            if (isExclude) chip.dataset.exclude = "true";
            const icon = doc.createElementNS(NS_HTML, "span");
            icon.className = "icon icon-css icon-item-type";
            icon.dataset.itemType = id;
            let label = id;
            try { label = Zotero.ItemTypes.getLocalizedString(id); }
            catch (e) {}
            chip.title = (isExclude ? "Not " : "") + label;
            chip.appendChild(icon);
            chip.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                if (e.altKey) {
                    // Alt+click switches the chip's side (include ↔
                    // exclude) — _toggleIncludeExclude with altKey
                    // matching the TARGET side does exactly that
                    // under Item Type's single-value semantics.
                    const next = this._toggleIncludeExclude(id,
                        g.itemType || [], g.itemTypeExclude || [],
                        !isExclude);
                    g.itemType = next.include;
                    g.itemTypeExclude = next.exclude;
                } else {
                    if (isExclude) {
                        g.itemTypeExclude = (g.itemTypeExclude || [])
                            .filter(x => x !== id);
                    } else {
                        g.itemType = (g.itemType || []).filter(x => x !== id);
                    }
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                renderSelected();
                renderList();
                try { (this as any)._wvPanelRefreshHeader?.(); } catch (err) {}
            });
            chip.dataset.wvType = id;
            return chip;
        };

        const renderSelected = () => {
            while (selectedRow.firstChild) {
                selectedRow.removeChild(selectedRow.firstChild);
            }
            const g = this._activeGroup();
            const sel = (g && g.itemType) || [];
            const exc = (g && g.itemTypeExclude) || [];
            // Types in the MRU row show their state ON the tile — a chip
            // here too would render the same icon twice side by side.
            // RENDERED tiles only (2026-08-19): the fit pass trims
            // tiles, and a selected type whose tile was trimmed must
            // fall back to a chip or its state becomes invisible.
            const inMru = new Set([...mruRow.querySelectorAll(
                ".icon-item-type")].map((i: any) => i.dataset.itemType));
            for (const id of sel) {
                if (!inMru.has(id)) selectedRow.appendChild(buildSelectedChip(id, false));
            }
            for (const id of exc) {
                if (!inMru.has(id)) selectedRow.appendChild(buildSelectedChip(id, true));
            }
        };

        const renderList = () => {
            if (!cached) return;
            while (box.firstChild) box.removeChild(box.firstChild);
            const g = this._activeGroup();
            const sel = new Set((g && g.itemType) || []);
            const exc = new Set((g && g.itemTypeExclude) || []);
            const isPicked = (id) => sel.has(id) || exc.has(id);
            const list = [];
            let lastWasItem = false;
            let pendingSep = null;
            for (const v of cached) {
                if (v.separator) { pendingSep = v; continue; }
                if (isPicked(v.id)) continue;
                if (pendingSep && lastWasItem) list.push(pendingSep);
                pendingSep = null;
                list.push(v);
                lastWasItem = true;
            }
            if (!list.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = "No item types available";
                box.appendChild(empty);
                return;
            }
            for (const v of list) {
                if (v.separator) {
                    const sep = doc.createElementNS(NS_HTML, "div");
                    sep.className = "wv-filter-list-separator";
                    box.appendChild(sep);
                    continue;
                }
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = v.name;
                const icon = doc.createElementNS(NS_HTML, "span");
                icon.className = "icon icon-css icon-item-type";
                icon.dataset.itemType = v.id;
                btn.appendChild(icon);
                const lbl = doc.createElementNS(NS_HTML, "span");
                lbl.className = "wv-filter-opt-label";
                lbl.textContent = v.name;
                btn.appendChild(lbl);
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const g2 = this._activeGroup();
                    if (!g2) return;
                    const next = this._toggleIncludeExclude(
                        v.id,
                        g2.itemType || [],
                        g2.itemTypeExclude || [],
                        !!e.altKey);
                    g2.itemType = next.include;
                    g2.itemTypeExclude = next.exclude;
                    if (!e.altKey && next.include.includes(v.id)) {
                        bumpMRU(v.id);
                    }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderSelected();
                    renderList();
                    renderMru();
                });
                box.appendChild(btn);
            }
        };

        /** Update tile selected/excluded state IN PLACE, without
         *  reordering. A tile click must not move the tile (MJT, 15 Aug
         *  2026): the immediate reorder meant select-then-unselect could
         *  not be two clicks on the same position — the tile jumped to
         *  the front under the cursor. */
        const refreshMruStates = () => {
            const g = this._activeGroup();
            const sel = new Set((g && g.itemType) || []);
            const exc = new Set((g && g.itemTypeExclude) || []);
            for (const btn of mruRow.querySelectorAll(".wv-itype-mru-tile")) {
                const ic = btn.querySelector(".icon-item-type");
                const id = ic && ic.dataset.itemType;
                if (!id) continue;
                if (sel.has(id)) {
                    btn.dataset.selected = "true";
                    delete btn.dataset.excluded;
                }
                else if (exc.has(id)) {
                    btn.dataset.excluded = "true";
                    delete btn.dataset.selected;
                }
                else {
                    delete btn.dataset.selected;
                    delete btn.dataset.excluded;
                }
            }
        };

        /** The always-visible last-used tiles. Order = MRU (most recent
         *  first). Clicking toggles include, Alt+click toggles exclude —
         *  identical semantics and identical calls to the dropdown grid.
         *  REORDER RULES (MJT, 15 Aug 2026): a tile click bumps the MRU
         *  pref but does NOT reorder the row — the new order appears the
         *  next time the popup opens. Only a pick from the DROPDOWN
         *  reorders live (that type may not be in the row yet at all). */
        const renderMru = () => {
            while (mruRow.firstChild) mruRow.removeChild(mruRow.firstChild);
            const g = this._activeGroup();
            const sel = new Set((g && g.itemType) || []);
            const exc = new Set((g && g.itemTypeExclude) || []);
            for (const id of computeMruIds()) {
                let label = id;
                try { label = Zotero.ItemTypes.getLocalizedString(id); }
                catch (e) {}
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt wv-filter-opt-icon wv-itype-mru-tile";
                btn.title = label + " — recently used. Click to filter; "
                    + "Alt+click to exclude.";
                if (sel.has(id)) btn.dataset.selected = "true";
                else if (exc.has(id)) btn.dataset.excluded = "true";
                const icon = doc.createElementNS(NS_HTML, "span");
                icon.className = "icon icon-css icon-item-type";
                icon.dataset.itemType = id;
                btn.appendChild(icon);
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const g2 = this._activeGroup();
                    if (!g2) return;
                    const next = this._toggleIncludeExclude(
                        id,
                        g2.itemType || [],
                        g2.itemTypeExclude || [],
                        !!e.altKey);
                    g2.itemType = next.include;
                    g2.itemTypeExclude = next.exclude;
                    if (!e.altKey && next.include.includes(id)) bumpMRU(id);
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderSelected();
                    renderList();
                    refreshMruStates();   // state only — position stays put
                    // Clear buttons live in the header -- sync them
                    // (MJT 2026-08-19: they didn't appear on tile select).
                    try { (this as any)._wvPanelRefreshHeader?.(); } catch (err) {}
                });
                mruRow.appendChild(btn);
            }
            // FIT-TO-LINE (MJT 2026-08-19): the row must stay a single
            // line -- trim trailing tiles that overflow the popup width
            // instead of wrapping. Measured on the row's parent (the
            // trigger row), which has the bounded width. Skipped when
            // the popup renders hidden (zero widths) -- the next open
            // re-renders and trims for real.
            const fitToLine = () => {
                try {
                    // Boundary = the GROUP's tinted box, not the popup
                    // edge (MJT 2026-08-19: tiles must not cross the
                    // background). Overflow renders as an ellipsis that
                    // opens the full list, never as a crossing tile.
                    const box = mruRow.closest(".wv-filter-or-group")
                        || mruRow.parentElement;
                    if (!box || box.clientWidth <= 0) return false;
                    // Layout-timing hole (2026-08-19): the box can
                    // report a width while the tiles' rects are still
                    // zero -- "no overflow" would be concluded from
                    // stale geometry. Not laid out until the last tile
                    // measures nonzero.
                    if (mruRow.lastChild
                        && mruRow.lastChild.getBoundingClientRect
                        && mruRow.lastChild.getBoundingClientRect().width === 0) {
                        return false;
                    }
                    const bcs = doc.defaultView.getComputedStyle(box);
                    const limit = box.getBoundingClientRect().right
                        - (parseFloat(bcs.paddingRight) || 0);
                    const rowTop = mruRow.getBoundingClientRect().top;
                    const overflows = (el) => {
                        const r = el.getBoundingClientRect();
                        // crossed the box edge, or WRAPPED below the
                        // first line (the row flex-wraps for chips)
                        return r.right > limit + 0.5 || r.top > rowTop + 4;
                    };
                    // No overflow affordance (MJT 2026-08-19): tiles
                    // that don't fit are simply not shown -- the full
                    // list is one click away on the trigger.
                    let guard = 0;
                    while (mruRow.lastChild && guard++ < 12
                        && overflows(mruRow.lastChild)) {
                        mruRow.removeChild(mruRow.lastChild);
                    }
                    // Tiles YIELD to selected chips (MJT 2026-08-19 v2:
                    // chips stay inline first): while any chip wrapped
                    // below line 1 and MRU tiles remain, drop tiles to
                    // make room. Once tiles are exhausted, remaining
                    // chips legitimately wrap to the next line.
                    const host2 = mruRow.parentElement;
                    const anyChipWrapped = () => [...host2.querySelectorAll(
                        ".wv-filter-itype-chip")].some(c =>
                        c.getBoundingClientRect().top > rowTop + 4);
                    let g3 = 0;
                    while (mruRow.lastChild && g3++ < 12 && anyChipWrapped()) {
                        mruRow.removeChild(mruRow.lastChild);
                    }
                    // Trimmed tiles may have carried selected/excluded
                    // state -- resync the chips so that state falls back
                    // to chips instead of vanishing (single resync per
                    // fit; renderSelected reads RENDERED tiles).
                    try {
                        const g = this._activeGroup();
                        const stateIds = new Set([
                            ...((g && g.itemType) || []),
                            ...((g && g.itemTypeExclude) || [])]);
                        const rendered = new Set([...mruRow.querySelectorAll(
                            ".icon-item-type")].map((i: any) => i.dataset.itemType));
                        const chipIds = new Set([...host2.querySelectorAll(
                            ".wv-filter-itype-chip")].map((c: any) => c.dataset.wvType || ""));
                        const missing = [...stateIds].some(id =>
                            !rendered.has(id) && !chipIds.has(id));
                        if (missing) renderSelected();
                    } catch (e) {}
                    return true;
                } catch (e) { return true; }
            };
            // Render can run BEFORE the popup lays out (user-opened
            // panel: widths are 0 at render time, and the clipped-tile
            // screenshot proved it, 2026-08-19). Try now, then retry on
            // the next tick(s) until layout gives real widths.
            {
                // Always run at least one deferred pass too -- a first
                // pass that succeeded on half-laid-out geometry must be
                // re-checked once the panel has settled.
                let tries = 0;
                const later = () => {
                    if (fitToLine() && tries > 0) return;
                    if (++tries > 12) return;
                    doc.defaultView.setTimeout(later, 60);
                };
                fitToLine();
                doc.defaultView.setTimeout(later, 60);
            }
        };
        renderMru();

        // Toggle list visibility — outside-click closes.
        let listOpen = false;
        let onDocMouseDown = null;
        const showList = () => {
            if (listOpen) return;
            listOpen = true;
            // Anchor the overlay just under the trigger row (offsets are
            // relative to `opts`, which the overlay CSS makes positioned).
            box.style.top = (triggerRow.offsetTop + triggerRow.offsetHeight + 3) + "px";
            box.style.display = "";
            // Fresh open = top of the list. Remembering the previous scroll
            // position made the MRU shortlist (the whole point of the top
            // rows) invisible on reopen (user request 2026-08-04).
            box.scrollTop = 0;
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    const t = e.target;
                    // SHADOW-DOM-SAFE membership checks. Mozilla's
                    // `Element.contains()` returns FALSE for the
                    // trigger menulist itself when its shadow host
                    // sits inside an HTML <slot> — verified by
                    // instrumentation showing `target === trigger`
                    // and `composedPath().includes(trigger)` both
                    // true while `trigger.contains(target)` was
                    // false. Result was a double-toggle: doc-level
                    // capture mistakenly saw "outside", ran
                    // `hideList`, then `popupshowing` re-fired
                    // `showList`. `composedPath().includes()`
                    // correctly walks across shadow boundaries.
                    const path = (e.composedPath && e.composedPath()) || [];
                    const inTrigger = t === trigger
                        || path.indexOf(trigger) >= 0;
                    const inBox = t === box
                        || path.indexOf(box) >= 0;
                    const onChip = path.some((n: any) =>
                        n && n.classList
                        && n.classList.contains("wv-filter-itype-chip"));
                    if (inTrigger) return;
                    if (inBox) return;
                    if (onChip) return;
                    hideList();
                };
                doc.addEventListener("mousedown", onDocMouseDown, true);
            }
        };
        const hideList = () => {
            if (!listOpen) return;
            listOpen = false;
            box.style.display = "none";
            if (onDocMouseDown) {
                doc.removeEventListener("mousedown", onDocMouseDown, true);
                onDocMouseDown = null;
            }
        };
        // The menulist's empty popup is suppressed; toggling happens
        // here, in the popup-show sequence's earliest hook so the
        // native popup never visually opens. setTimeout(…, 0) yields
        // back to the platform so any in-flight popup-state cleanup
        // finishes before we run our show/hide.
        triggerPopup.addEventListener("popupshowing", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const iwin = winOf(doc);
            iwin.setTimeout(() => {
                if (listOpen) hideList();
                else showList();
            }, 0);
        });

        // Initial render.
        renderSelected();
        loadValues().then((v) => {
            cached = v;
            if (!section.isConnected) return;
            renderList();
        });
    }

    /** Replace `section`'s contents with the Annotation Color picker.
     *  `refreshAll` is invoked after a click so the other sections in
     *  the same panel can also re-render (handy if a filter type ever
     *  cross-affects another). */
    _renderColorSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.annotationColor) || []);
        const excluded = new Set((g0 && g0.annotationColorExclude) || []);
        for (const def of this._ANNOTATION_COLORS) {
            // Black sits apart from the standard 8-colour palette
            // (upstream Zotero treats it as `EXTRA_INK_AND_TEXT_COLORS`
            // — only valid for ink/text annotations). Push it to
            // the right edge after a thin vertical separator so its
            // distinct status reads visually. Same `margin-left: auto`
            // pattern Item Note / Has Comment / Has Annotations use.
            if (def.value === "#000000") {
                const sep = doc.createElementNS(NS_HTML, "div");
                sep.className = "wv-filter-vertical-separator";
                sep.style.marginLeft = "auto";
                opts.appendChild(sep);
            }
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";

            // Native rounded-square swatch (the reader colour picker's
            // IconColor16) instead of the old 12px circle.
            btn.appendChild(this._wvNativeColorSwatch(doc, def.value));

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.annotationColor = next.include;
                    g.annotationColorExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }
    }

    _renderTypeSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        // The type icons are the Rule 1 OR set — wrap them in a tinted
        // pill. Has Comment (appended after, outside this pill) is a
        // separate filter, so it stays untinted.
        const grp = doc.createElementNS(NS_HTML, "div");
        grp.className = "wv-filter-or-inline";
        opts.appendChild(grp);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.annotationType) || []);
        const excluded = new Set((g0 && g0.annotationTypeExclude) || []);
        for (const def of this._ANNOTATION_TYPES) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";

            // Use <img> with -moz-context-properties (instead of CSS
            // mask-image) so the icon picks up `currentColor` for BOTH
            // `fill="context-fill"` AND `stroke="context-fill"` paths.
            // mask-image only renders filled regions, which makes the
            // stroke-only `annotate-note.svg` come out blank.
            const icon = doc.createElementNS(NS_HTML, "img");
            icon.className = "wv-filter-svg";
            icon.src = def.icon;
            btn.appendChild(icon);

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.annotationType = next.include;
                    g.annotationTypeExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            grp.appendChild(btn);
        }

        // Has Comment tile sits at the FAR RIGHT of this row —
        // mirrors the Item Note / Standalone Note right-aligned
        // placement in their respective rows. Thin vertical
        // separator with `margin-left: auto` pushes the tile to
        // the right edge of the flex container.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        sep.style.marginLeft = "auto";
        opts.appendChild(sep);
        opts.appendChild(this._makeHasCommentTile(doc, refreshAll));
        opts.appendChild(this._makeAnnotationSourceTile(doc, refreshAll));
    }

    /** True iff `item` is one of the three text sources Has Link
     *  scans AND that text contains a URL. The three sources are:
     *    - annotation.annotationComment
     *    - item-note body (note with a regular-item parent)
     *    - standalone-note body (top-level note)
     *  Attachment URL fields and regular-item URL fields are
     *  intentionally NOT checked — Has Link is about URLs the user
     *  embedded in their own text, not metadata fields. */
    _itemHasLinks(item) {
        if (!item) return false;
        try {
            if (item.isAnnotation && item.isAnnotation()) {
                return this.hasURI(item.annotationComment || "");
            }
            if (item.isNote && item.isNote()) {
                const note = (item.getNote && item.getNote()) || "";
                return this.hasURI(note);
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /** Map an item to one of Has Link's three scope keys, or
     *  `null` if Has Link doesn't apply to this kind at all. */
    _hasLinkScopeKeyOf(item) {
        if (!item) return null;
        if (item.isAnnotation && item.isAnnotation()) return "annotationComment";
        if (item.isNote && item.isNote()) {
            return item.parentItem ? "itemNoteText" : "standaloneText";
        }
        return null;
    }

    /** Quick Search section — placeholder. The actual "Restrict
     *  Quick Search to:" dropdown is now injected INSIDE the
     *  toolbar's `#zotero-tb-search` element (see
     *  `_installQuickSearchScopeButton`) so it sits on the right
     *  side of the search box, visible only when the search has
     *  text. The popup section itself stays in the layout as a
     *  named anchor but renders nothing. */
    _renderQuickSearchSection(_doc, section, _refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "";
    }

    /** Inject the "Restrict Quick Search to: ▾" dropdown as a
     *  child of `#zotero-tb-search`, positioned to the right of
     *  the search-textbox's × clear button (visually inside the
     *  framed search box). Visibility is bound to whether the
     *  search has text. Called from `popupshowing`; the inverse
     *  `_uninstallQuickSearchScopeButton` runs on `popuphidden`. */
    _installQuickSearchScopeButton(doc, refreshAll) {
        const sb: any = doc.getElementById("zotero-tb-search");
        if (!sb) return;
        const wrapper = sb.querySelector("#search-wrapper") || sb;
        // Idempotent — re-call during refreshAll is safe.
        let btn: any = wrapper.querySelector(".wv-qs-scope-btn");
        if (btn) {
            this._refreshQuickSearchScopeButtonState(btn);
            this._updateQuickSearchScopeButtonVisibility(sb, btn);
            return;
        }

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-qs-scope-btn";
        // Label moved entirely to tooltip — the button now shows
        // only the ▾ glyph to keep it compact inside the search
        // box (the visible "Restrict Quick Search to:" text was
        // wrapping and crowding the input).
        btn.title = "Restrict Quick Search to: — choose which row kinds the toolbar quick-search may surface in the results. All-on (default) means no restriction.";
        btn.setAttribute("aria-label", "Restrict Quick Search to");
        const arrow = doc.createElementNS(NS_HTML, "span");
        arrow.className = "wv-qs-scope-btn-arrow";
        arrow.textContent = "▾";
        btn.appendChild(arrow);

        const KINDS_QS = [
            { key: "parent",     label: "Parent" },
            { key: "attachment", label: "Attachment" },
            { key: "note",       label: "Note" },
            { key: "annotation", label: "Annotation" },
        ];
        btn.__wvKinds = KINDS_QS;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Open a real XUL menupopup (top-level overlay) rather
            // than the cross-level filters' inline HTML popup —
            // the anchor here is the toolbar search box, OUTSIDE
            // the filter popup's container, so an inline absolute-
            // positioned popup would land inside the filter popup
            // and get clipped by its bounds.
            this._openQuickSearchScopeMenupopup(btn, KINDS_QS, refreshAll);
        });
        wrapper.appendChild(btn);

        this._refreshQuickSearchScopeButtonState(btn);
        this._updateQuickSearchScopeButtonVisibility(sb, btn);

        // Live-update visibility as the user types.
        const onSearchInput = () => {
            this._updateQuickSearchScopeButtonVisibility(sb, btn);
        };
        btn.__wvInputHandler = onSearchInput;
        sb.addEventListener("input", onSearchInput, true);
        sb.addEventListener("command", onSearchInput);
    }

    /** Refresh the scope-button's "modified" marker — set when any
     *  scope key is `false` so the user knows the dropdown is
     *  currently narrowing results. */
    _refreshQuickSearchScopeButtonState(btn) {
        try {
            const g = this._activeGroup();
            const scope = (g && g.quickSearchScope) || {};
            const kinds = btn.__wvKinds || [];
            const allOn = kinds.every(k => scope[k.key] !== false);
            if (allOn) btn.removeAttribute("data-modified");
            else btn.setAttribute("data-modified", "true");
        } catch (e) {}
    }

    /** Show the button whenever the quick-search has text — same
     *  persistence as the × clear button. The scope dropdown only
     *  takes effect when a Weavero filter is also active (Zotero's
     *  native search has no per-kind scope), but keeping it visible
     *  lets the user prepare the scope before opening the filter
     *  popup and matches the × button's lifecycle. */
    _updateQuickSearchScopeButtonVisibility(sb, btn) {
        try {
            const v = (sb.value || "").trim();
            btn.style.display = v ? "" : "none";
        } catch (e) {}
    }

    /** Re-evaluate the QS scope button's visibility. Cheap; safe
     *  to call after any filter-state mutation. */
    _refreshQuickSearchScopeButtonVisibility() {
        try {
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (!doc) return;
            const sb = doc.getElementById("zotero-tb-search");
            const btn = doc.querySelector(".wv-qs-scope-btn");
            if (sb && btn) this._updateQuickSearchScopeButtonVisibility(sb, btn);
        } catch (e) {}
    }

    /** Open a XUL `<panel>` hosting the same HTML content
     *  (`APPLY TO` header + per-kind HTML checkboxes) the inline
     *  cross-level scope popup uses, so both dropdowns render
     *  identically. A `<panel>` (rather than a `<menupopup>`) is
     *  used because (a) it floats as a top-level overlay — the
     *  anchor here is the toolbar search box, outside the filter
     *  popup's container — and (b) it accepts arbitrary HTML
     *  content, so the same styling rules
     *  (`.wv-filter-scope-popup`, `.wv-filter-scope-popup-head`,
     *  `.wv-filter-scope-popup-row`) apply unchanged. */
    _openQuickSearchScopeMenupopup(anchor, kinds, refreshAll) {
        const doc = anchor.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        // Drop any stale popup from a previous click before opening
        // a new one.
        const stale = doc.querySelectorAll("panel.wv-qs-scope-panel");
        for (const s of stale) {
            try { (s as any).hidePopup(); } catch (e) {}
            try { s.remove(); } catch (e) {}
        }
        const g = this._activeGroup();
        if (!g) return;
        if (!g.quickSearchScope) {
            g.quickSearchScope = {};
            for (const k of kinds) g.quickSearchScope[k.key] = true;
        }
        const scope = g.quickSearchScope;

        const pop: any = doc.createXULElement("panel");
        pop.className = "wv-qs-scope-panel";
        // No platform-default fade — match the filter popup's
        // instant-open behaviour.
        pop.setAttribute("animate", "false");
        // `level="top"` raises the panel above every other XUL
        // panel in the same window. Without this, the QS scope
        // dropdown rendered BEHIND the filter popup (which has
        // `noautohide="true"`), making the checkboxes nearly
        // invisible — the filter popup covered them.
        pop.setAttribute("level", "top");

        // HTML content — identical structure to the inline cross-
        // level scope popup so the shared CSS rules apply.
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.className = "wv-filter-scope-popup wv-qs-scope-popup-inner";
        try {
            const gq = this._activeGroup();
            const sq = gq && gq.quickSearchScope;
            if (sq && sq.note === undefined) {
                sq.note = sq.parent !== false || sq.attachment !== false;
            }
        } catch (e) {}
        // Override the `position: absolute` from .wv-filter-scope-popup
        // since here we're inside a XUL panel that positions itself.
        inner.style.position = "static";

        const heading = doc.createElementNS(NS_HTML, "div");
        heading.className = "wv-filter-scope-popup-head";
        heading.textContent = "Apply to";
        inner.appendChild(heading);

        for (const k of kinds) {
            const lbl = doc.createElementNS(NS_HTML, "label");
            lbl.className = "wv-filter-scope-popup-row";
            const cb: any = doc.createElementNS(NS_HTML, "input");
            cb.type = "checkbox";
            cb.checked = scope[k.key] !== false;
            cb.addEventListener("change", () => {
                scope[k.key] = !!cb.checked;
                try {
                    // Sync the modified-state cue on the search-box button.
                    const btn = doc.querySelector(".wv-qs-scope-btn");
                    if (btn) this._refreshQuickSearchScopeButtonState(btn);
                } catch (e) {}
                try { this._renderFilterBar(); } catch (e) {}
                try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
                try { refreshAll(); } catch (e) {}
            });
            lbl.appendChild(cb);
            const txt = doc.createElementNS(NS_HTML, "span");
            txt.textContent = k.label;
            lbl.appendChild(txt);
            inner.appendChild(lbl);
        }

        pop.appendChild(inner);
        // XUL panels must be in the document tree.
        doc.documentElement.appendChild(pop);
        try {
            pop.openPopup(anchor, "after_start", 0, 0, false, false);
        } catch (e) {
            Zotero.debug("[Weavero] QS scope panel open err: " + e);
        }
        // Self-remove on hide so the document doesn't accumulate
        // stale popup nodes.
        pop.addEventListener("popuphidden", () => {
            try { pop.remove(); } catch (e) {}
        });
    }

    /** Remove the injected scope button from the toolbar search.
     *  Called from `_teardownItemsListFilter` (plugin disable / filter
     *  off). Safe to call when not installed. */
    _uninstallQuickSearchScopeButton(doc) {
        try {
            const sb: any = doc.getElementById("zotero-tb-search");
            if (!sb) return;
            const btn: any = sb.querySelector(".wv-qs-scope-btn");
            if (!btn) return;
            if (btn.__wvInputHandler) {
                sb.removeEventListener("input", btn.__wvInputHandler, true);
                sb.removeEventListener("command", btn.__wvInputHandler);
            }
            btn.remove();
        } catch (e) {}
    }


    /** Cross-level section — three icon-only tri-state buttons that
     *  apply to every row kind:
     *    - Has Related: item has at least one related-item link
     *    - Has Link:    item has a URL in annotation comment or note text (per `_itemHasLinks`)
     *    - Has Tag:     item carries at least one tag (manual or auto)
     *  Click toggles include, Alt+click toggles exclude. */
    _renderCrossLevelSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        // Default kind list (Has Tag / Has Related) — three row-
        // kind buckets following `_rowKindOf`. Item notes are
        // attachments (same tree level) so the "Attachment" bucket
        // covers both attachment files AND item notes; non-note
        // attachments are referred to as "Attachment Files"
        // elsewhere in the UI.
        // Ordered Parent → Attachment → Annotation (higher tree
        // level first) so every "Apply to" dropdown in the popup
        // reads consistently.
        const KINDS_ROW = [
            { key: "parent",     label: "Parent" },
            { key: "attachment", label: "Attachment" },
            { key: "note",       label: "Note" },
            { key: "annotation", label: "Annotation" },
        ];
        // Has Link's kind list — text-source-specific buckets
        // (URL detection only fires on annotation comments and
        // note bodies; attachment URL fields and regular-item URL
        // fields don't count). Ordered high → low: standalone
        // notes are top-level (parent tier), item notes sit at the
        // attachment tier, annotation comments at the annotation
        // tier.
        const KINDS_HAS_LINK = [
            { key: "standaloneText",    label: "Standalone Note Text" },
            { key: "itemNoteText",      label: "Item Note Text" },
            { key: "annotationComment", label: "Annotation Comment" },
        ];

        // Each cross-level filter renders as a slot containing the
        // main icon button + a small `▾` scope arrow. Click the
        // icon to toggle include/exclude (Alt+click for exclude);
        // click the arrow to choose which row kinds the filter
        // applies to.
        const buildBtn = (key, scopeKey, kindList, label, iconBuilder, tip, noScope?) => {
            const slot = doc.createElementNS(NS_HTML, "div");
            slot.className = "wv-filter-cross-slot";

            const cur = g0 ? g0[key] : null;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon wv-filter-cross-main";
            btn.title = tip;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            const icon = iconBuilder(doc);
            if (icon) btn.appendChild(icon);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                let next;
                if (e.altKey) next = (g[key] === false) ? null : false;
                else next = (g[key] === true) ? null : true;
                g[key] = next;
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            slot.appendChild(btn);

            // Scope arrow. `data-modified` flags non-default scopes
            // so the user sees at a glance which filters are
            // narrowed below the all-on default. Skipped for scope-less
            // filters (e.g. Has Bookmarks), which apply to the whole item.
            if (!noScope) {
                const arrow = doc.createElementNS(NS_HTML, "button");
                arrow.type = "button";
                arrow.className = "wv-filter-cross-scope-arrow";
                arrow.title = "Choose which row kinds this filter applies to";
                arrow.textContent = "▾";
                const scope = (g0 && g0[scopeKey]) || {};
                const allOn = kindList.every(k => scope[k.key] !== false);
                if (!allOn) arrow.dataset.modified = "true";
                arrow.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this._openCrossLevelScopePopup(
                        arrow, scopeKey, kindList, refreshAll);
                });
                slot.appendChild(arrow);
            }

            opts.appendChild(slot);
        };

        // Order: Has Tag (leftmost) → Has Related → Has Link.
        buildBtn(
            "hasTag", "hasTagScope", KINDS_ROW,
            "Has Tag",
            (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/tag.svg";
                icon.alt = "Has Tag";
                icon.style.color = "var(--accent-orange)";
                return icon;
            },
            "Has Tag — items carrying at least one tag. "
            + "Alt+click to exclude. ▾ to scope by row kind.");
        buildBtn(
            "hasRelated", "hasRelatedScope", KINDS_ROW,
            "Has Related",
            (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/related.svg";
                icon.alt = "Has Related";
                icon.style.color = "var(--accent-wood)";
                return icon;
            },
            "Has Related — items with at least one related-item link. "
            + "Alt+click to exclude. ▾ to scope by row kind.");
        buildBtn(
            "hasLink", "hasLinkScope", KINDS_HAS_LINK,
            "Has Link",
            (d) => this._makeLinkSvg(d),
            "Has Link — items whose annotation comment or note text "
            + "contains a URL. Alt+click to exclude. ▾ to choose "
            + "which text source(s) to scan.");
    }

    /** Open a small dropdown anchored under `anchor` with checkboxes
     *  toggling the per-kind scope of a cross-level filter.
     *  `scopeKey` is the group field name (`hasRelatedScope`,
     *  `hasLinkScope`, `hasTagScope`). `kinds` is the list of
     *  scope checkboxes to render: `[{key, label}]`. */
    _openCrossLevelScopePopup(anchor, scopeKey, kinds, refreshAll) {
        const doc = anchor.ownerDocument;
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        // Drop any existing popup before opening a new one — the
        // user just clicked an arrow, treat the previous popup as
        // dismissed regardless of which arrow it belonged to.
        const inner = anchor.closest(".wv-filter-popup-inner")
            || doc.querySelector(".wv-filter-popup-inner");
        if (!inner) return;
        const stale = inner.querySelectorAll(".wv-filter-scope-popup");
        for (const s of stale) s.remove();

        const g = this._activeGroup();
        if (!g) return;
        if (!g[scopeKey]) {
            // Lazy default: every key in the kinds list set true.
            g[scopeKey] = {};
            for (const k of kinds) g[scopeKey][k.key] = true;
        }
        const scope = g[scopeKey];
        // MIGRATION (2026-08-19): pre-four-type scopes have no `note`
        // key; materialise it from the covering toggles (see
        // _wvScopeAllows) so the checkbox shows what the verdict does.
        if (kinds.some(k => k.key === "note") && scope.note === undefined) {
            scope.note = scope.parent !== false || scope.attachment !== false;
        }

        const pop = doc.createElementNS(NS_HTML, "div");
        pop.className = "wv-filter-scope-popup";

        const heading = doc.createElementNS(NS_HTML, "div");
        heading.className = "wv-filter-scope-popup-head";
        heading.textContent = "Apply to";
        pop.appendChild(heading);

        for (const k of kinds) {
            const lbl = doc.createElementNS(NS_HTML, "label");
            lbl.className = "wv-filter-scope-popup-row";
            const cb = doc.createElementNS(NS_HTML, "input");
            cb.type = "checkbox";
            cb.checked = scope[k.key] !== false;
            cb.addEventListener("change", () => {
                scope[k.key] = !!cb.checked;
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            lbl.appendChild(cb);
            const txt = doc.createElementNS(NS_HTML, "span");
            txt.textContent = k.label;
            lbl.appendChild(txt);
            pop.appendChild(lbl);
        }

        // Position relative to the panel's inner box. The arrow's
        // bounding rect is in viewport coords; subtract the inner's
        // own viewport position to get a coordinate the popup can
        // use as `position: absolute` inside `inner`.
        inner.appendChild(pop);
        try {
            const r = anchor.getBoundingClientRect();
            const ir = inner.getBoundingClientRect();
            pop.style.left = Math.max(0, (r.left - ir.left) - 4) + "px";
            pop.style.top = (r.bottom - ir.top + 2) + "px";
        } catch (e) {}

        // Close on outside-click. setTimeout so the click that
        // opened the popup doesn't immediately re-close it.
        let onDoc = null;
        const close = () => {
            try { pop.remove(); } catch (e) {}
            if (onDoc) {
                doc.removeEventListener("mousedown", onDoc, true);
                onDoc = null;
            }
        };
        onDoc = (e) => {
            if (pop.contains(e.target)) return;
            if (anchor.contains(e.target)) return;
            close();
        };
        const win = winOf(doc);
        win.setTimeout(() => doc.addEventListener("mousedown", onDoc, true), 0);
    }

    /** Single-button tri-state section (matches `_renderHasCommentSection`'s
     *  shape) for boolean kind filters that target a row sub-kind.
     *  `key` is the group field name; `iconBuilder(doc)` returns an
     *  icon element. The button cycles include / exclude via plain
     *  click and Alt+click respectively, with `data-selected` /
     *  `data-excluded` for the standard CSS treatment. */
    _renderBoolKindIconSection(doc, section, refreshAll, opts) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();
        const cur = g0 ? g0[opts.key] : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        btn.title = opts.tip;
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        const icon = opts.iconBuilder(doc);
        if (icon) btn.appendChild(icon);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                next = (g[opts.key] === false) ? null : false;
            }
            else {
                next = (g[opts.key] === true) ? null : true;
            }
            g[opts.key] = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        optsBox.appendChild(btn);
    }

    /** Item Note tile is now rendered inline by
     *  `_renderAttachmentFileTypeSection` (right of the file-type
     *  icons, after a vertical separator). This shim is kept as a
     *  no-op placeholder in case external code references the
     *  method name. */
    _renderItemNoteSection(_doc, _section, _refreshAll) {
        // Intentionally empty.
    }

    /** Standalone Note tile is now rendered inline by
     *  `_renderItemTypeRow` (right end of the Item Type row, after
     *  a vertical separator). No-op shim for back-compat. */
    _renderStandaloneNoteSection(_doc, _section, _refreshAll) {
        // Intentionally empty.
    }

    /** Render a row of parent-targeting "Has *" tri-state icon
     *  buttons (Has DOI, Has URL, Has Abstract, Has Attachment File).
     *  All four sit on the same line in the Parent group. */
    _renderParentHasFieldsSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();
        // Optional `color` ties the icon's currentColor to one of
        // Zotero's `$item-pane-sections` palette entries so the
        // Has-* tiles read as the same surface as their right-pane
        // section header.
        const buildBtn = (key, label, iconSrc, tip, color?, afterChange?) => {
            const cur = g0 ? g0[key] : null;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            btn.title = tip;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            if (iconSrc) {
                const icon = doc.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = iconSrc;
                icon.alt = label;
                if (color) icon.style.color = color;
                btn.appendChild(icon);
            } else {
                // No distinct icon exists (PMID/PMCID) — the NAME is the chip.
                btn.classList.add("wv-filter-opt-text");
                btn.textContent = label;
            }
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const g = this._activeGroup();
                if (!g) return;
                let next;
                if (e.altKey) {
                    next = (g[key] === false) ? null : false;
                } else {
                    next = (g[key] === true) ? null : true;
                }
                g[key] = next;
                if (afterChange) { try { afterChange(next); } catch (err) {} }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            optsBox.appendChild(btn);
        };
        // Order matches Zotero's right-pane sidenav for a regular
        // item: Info fields (DOI, URL) → Abstract → Attachments.
        // Colors come from `$item-pane-sections` (`scss/abstracts/
        // _variables.scss`): Abstract → `--accent-azure`,
        // Attachments → `--accent-green`. DOI / URL don't have
        // dedicated section entries so they stay neutral
        // (currentColor).
        // In Multiple Libraries leads the row on the LEFT — it's a
        // membership property, not a Has-* tile (MJT 2026-08-20). The
        // Has-* tiles follow, pushed to the right edge by the same
        // auto-margin separator the attachment/annotation sections use
        // (popup grammar: left = what it IS, right = what it HAS).
        // Two OVERLAPPING library buildings, back one dimmed (50%) with a
        // hairline gap along the front's block outline — custom artwork,
        // no upstream glyph exists for "in multiple libraries". NO chain
        // link: at 16px a chain reads as Zotero's own Related glyph (user
        // caught the confusion). User-picked design D3 of eight rendered
        // candidates, 2026-08-05.
        buildBtn("inOtherLibrary", "In Multiple Libraries",
            "data:image/svg+xml;utf8,"
            + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>"
            + "<defs><mask id='wvml'><rect width='16' height='16' fill='white'/>"
            + "<path d='M5.5 8.1 L10.75 5.4 L16 8.1 V16 H5.5 Z'"
            + " fill='black' stroke='black' stroke-width='1.4'/></mask></defs>"
            + "<g fill='context-fill' fill-opacity='0.5' mask='url(%23wvml)'>"
            + "<path d='M0 3.6 L4.75 1 L9.5 3.6 V4.5 H0 Z'/>"
            + "<rect x='0.8' y='5.3' width='1.3' height='4.4'/>"
            + "<rect x='4.1' y='5.3' width='1.3' height='4.4'/>"
            + "<rect x='7.4' y='5.3' width='1.3' height='4.4'/>"
            + "<rect x='0' y='10.5' width='9.5' height='1.2'/></g>"
            + "<g fill='context-fill'>"
            + "<path d='M5.5 8.1 L10.75 5.4 L16 8.1 V9 H5.5 Z'/>"
            + "<rect x='6.4' y='9.8' width='1.4' height='4.9'/>"
            + "<rect x='10.05' y='9.8' width='1.4' height='4.9'/>"
            + "<rect x='13.7' y='9.8' width='1.4' height='4.9'/>"
            + "<rect x='5.5' y='14.8' width='10.5' height='1.2'/></g></svg>",
            "In Multiple Libraries — regular items that also belong to "
            + "another library (a linked copy exists, e.g. dragged to or "
            + "from a group). The item pane's Libraries and Collections "
            + "section shows which ones. Alt+click to exclude.",
            undefined,
            // The predicate answers from an async-built cache; make sure
            // it's warm (or being warmed) the moment the tile activates.
            (next) => {
                if (next != null && !this._wvLinkedLibCacheWarm()) {
                    try { this._wvEnsureLinkedLibCache(winOf(section), true); } catch (e) {}
                }
            });
        const hasSep = doc.createElementNS(NS_HTML, "div");
        hasSep.className = "wv-filter-vertical-separator";
        hasSep.style.marginLeft = "auto";
        optsBox.appendChild(hasSep);
        buildBtn("hasDOI", "Has DOI",
            "chrome://zotero/skin/16/universal/crossref.svg",
            "Has DOI — regular items with a DOI. Alt+click to exclude.");
        buildBtn("hasPMID", "PMID", null,
            "Has PMID — regular items with a PMID (field or Extra). "
            + "Alt+click to exclude.");
        buildBtn("hasPMCID", "PMCID", null,
            "Has PMCID — regular items with a PMCID (field or Extra). "
            + "Alt+click to exclude.");
        buildBtn("hasURL", "Has URL",
            "chrome://zotero/skin/16/universal/globe.svg",
            "Has URL — regular items with a URL field. "
            + "Alt+click to exclude.");
        buildBtn("hasAbstract", "Has Abstract",
            "chrome://zotero/skin/16/universal/abstract.svg",
            "Has Abstract — regular items with a non-empty abstract. "
            + "Alt+click to exclude.",
            "var(--accent-azure)");
        buildBtn("hasAttachment", "Has Attachment File",
            "chrome://zotero/skin/16/universal/attachment.svg",
            "Has Attachment File — regular items with at least "
            + "one attachment file (PDF, EPUB, snapshot, etc.). "
            + "Distinct from Item Note — item notes are also "
            + "attachment-level rows but have their own tile in "
            + "the Attachment group. Alt+click to exclude.",
            "var(--accent-green)");
    }

    /** Row hosting two tiles in the Attachment group:
     *  - Linked File (leftmost) — multi-select chip alongside the
     *    other attachment file kinds; matched via the pseudo-kind
     *    `attachmentLinkedFile` (any attachment with
     *    `attachmentLinkMode === LINK_MODE_LINKED_FILE`).
     *  - Has Annotations — tri-state; the original sole tile here.
     *  Section title stays "Has Annotations" — labels the second
     *  tile, the first is identified by its tooltip. */
    _renderHasAnnotationsSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();

        // ── Linked File tile (leftmost) ─────────────────────────
        // Multi-select alongside the other attachment file-type
        // tiles — toggles inclusion / exclusion of the pseudo-kind
        // `attachmentLinkedFile` in `attachmentFileType` /
        // `attachmentFileTypeExclude`. Uses the same icon as the
        // file-type strip would (looked up from
        // `_ATTACHMENT_FILE_TYPES_DATA` so the icon stays defined
        // in one place).
        const linkedDef = this._ATTACHMENT_FILE_TYPES.find(
            x => x.value === "attachmentLinkedFile");
        if (linkedDef) {
            const selected = new Set((g0 && g0.attachmentFileType) || []);
            const excluded = new Set((g0 && g0.attachmentFileTypeExclude) || []);
            const lfBtn = doc.createElementNS(NS_HTML, "button");
            lfBtn.type = "button";
            lfBtn.className = "wv-filter-opt wv-filter-opt-icon";
            lfBtn.title = "Linked File — attachments stored as links to "
                + "external files (any content type). Alt+click to exclude.";
            if (selected.has("attachmentLinkedFile")) lfBtn.dataset.selected = "true";
            if (excluded.has("attachmentLinkedFile")) lfBtn.dataset.excluded = "true";
            const lfIcon = doc.createElementNS(NS_HTML, "img");
            lfIcon.className = "wv-filter-svg";
            lfIcon.src = linkedDef.icon;
            lfIcon.alt = "Linked File";
            lfBtn.appendChild(lfIcon);
            lfBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    "attachmentLinkedFile",
                    [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.attachmentFileType = next.include;
                    g.attachmentFileTypeExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            optsBox.appendChild(lfBtn);
        }

        // Separator pushes the Has Bookmarks + Has Annotations pair
        // to the right edge — same `margin-left: auto` trick the
        // Item Note row uses.
        const haSep = doc.createElementNS(NS_HTML, "div");
        haSep.className = "wv-filter-vertical-separator";
        haSep.style.marginLeft = "auto";
        optsBox.appendChild(haSep);

        // ── Has Bookmarks tile (tri-state) ──────────────────────
        // An attachment property — items whose attachment(s) carry
        // reader bookmarks (in-document or elsewhere). Sits just
        // left of Has Annotations.
        const hbCur = g0 ? g0.hasBookmarks : null;
        const hbBtn = doc.createElementNS(NS_HTML, "button");
        hbBtn.type = "button";
        hbBtn.className = "wv-filter-opt wv-filter-opt-icon";
        hbBtn.title = "Has Bookmarks — items whose attachment(s) have "
            + "reader bookmarks saved. Alt+click to exclude.";
        if (hbCur === true) hbBtn.dataset.selected = "true";
        else if (hbCur === false) hbBtn.dataset.excluded = "true";
        hbBtn.appendChild(this._makeBookmarkSvg(doc));
        hbBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.hasBookmarks === false) ? null : false;
            else          next = (g.hasBookmarks === true) ? null : true;
            g.hasBookmarks = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        optsBox.appendChild(hbBtn);

        // ── Has Annotations tile (tri-state) ────────────────────
        const cur = g0 ? g0.hasAnnotations : null;
        const haBtn = doc.createElementNS(NS_HTML, "button");
        haBtn.type = "button";
        haBtn.className = "wv-filter-opt wv-filter-opt-icon";
        haBtn.title = "Has Annotations — file attachments with at least "
            + "one annotation. Alt+click to exclude.";
        if (cur === true) haBtn.dataset.selected = "true";
        else if (cur === false) haBtn.dataset.excluded = "true";
        const haIcon = doc.createElementNS(NS_HTML, "img");
        haIcon.className = "wv-filter-svg";
        haIcon.src = "chrome://zotero/skin/16/universal/attachment-annotations.svg";
        haIcon.alt = "Has Annotations";
        // Zotero maps `attachment-annotations` to `--tag-purple`
        // in the item-pane sections palette — same icon, same colour.
        haIcon.style.color = "var(--tag-purple)";
        haBtn.appendChild(haIcon);
        haBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.hasAnnotations === false) ? null : false;
            else          next = (g.hasAnnotations === true) ? null : true;
            g.hasAnnotations = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        optsBox.appendChild(haBtn);

        // ── Has Embedded Annotations tile (tri-state, 2026-08-19) ──
        // Attachment-level: the file carries at least one PDF-embedded
        // annotation. Unlike the annotation-level Source chip, it never
        // filters annotation ROWS.
        const curEmb = g0 ? g0.hasEmbeddedAnnotations : null;
        const heBtn = doc.createElementNS(NS_HTML, "button");
        heBtn.type = "button";
        heBtn.className = "wv-filter-opt wv-filter-opt-icon";
        heBtn.title = "Has Embedded Annotations — file attachments "
            + "carrying at least one annotation embedded in the PDF by "
            + "an outside reader. Shows ALL their annotations (use the "
            + "Source tile to filter the rows). Alt+click to exclude.";
        if (curEmb === true) heBtn.dataset.selected = "true";
        else if (curEmb === false) heBtn.dataset.excluded = "true";
        heBtn.appendChild(this._makeHasEmbeddedAnnotationsSvg(doc));
        heBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.hasEmbeddedAnnotations === false) ? null : false;
            else          next = (g.hasEmbeddedAnnotations === true) ? null : true;
            g.hasEmbeddedAnnotations = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        optsBox.appendChild(heBtn);
    }

    /** Has Embedded Annotations glyph — the same `attachment-
     *  annotations.svg` stacked-notes artwork the Has Annotations tile
     *  uses (path verbatim, fill-based), with the reader's lock badged
     *  TOP-RIGHT exactly like the Source tile's, so the two lock-
     *  carrying tiles read as one family: lock on a single note =
     *  filter the annotation rows by source; lock on the attachment
     *  glyph = filter the attachments. Same mask-knockout + full-
     *  opacity-lock construction as `_makeAnnotationSourceSvg`. */
    _makeHasEmbeddedAnnotationsSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-filter-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "none");
        svg.style.color = "var(--tag-purple)";
        const defs = doc.createElementNS(NS, "defs");
        const mask = doc.createElementNS(NS, "mask");
        mask.setAttribute("id", "wv-hasemb-lock-knockout");
        const keep = doc.createElementNS(NS, "rect");
        keep.setAttribute("x", "0"); keep.setAttribute("y", "0");
        keep.setAttribute("width", "16"); keep.setAttribute("height", "16");
        keep.setAttribute("fill", "white");
        mask.appendChild(keep);
        const cut = doc.createElementNS(NS, "rect");
        cut.setAttribute("x", "7.4"); cut.setAttribute("y", "-0.4");
        cut.setAttribute("width", "8.6"); cut.setAttribute("height", "9.6");
        cut.setAttribute("rx", "2");
        cut.setAttribute("fill", "black");
        mask.appendChild(cut);
        defs.appendChild(mask);
        svg.appendChild(defs);
        const notes = doc.createElementNS(NS, "path");
        notes.setAttribute("fill-rule", "evenodd");
        notes.setAttribute("clip-rule", "evenodd");
        notes.setAttribute("d", "M3 3V0H16V13H13V15.5V16H12.5H6.5H6.29289L6.14645 15.8536L0.146447 9.85355L0 9.70711V9.5V3.5V3H0.5H3ZM4 3H12.5H13V3.5V12H15V1H4V3ZM1 9V4H12V15H7V9.5V9H6.5H1ZM1.70711 10L6 14.2929V10H1.70711Z");
        notes.setAttribute("fill", "currentColor");
        notes.setAttribute("mask", "url(#wv-hasemb-lock-knockout)");
        svg.appendChild(notes);
        const g = doc.createElementNS(NS, "g");
        g.setAttribute("transform", "translate(6.6 -0.3) scale(0.58)");
        const lock = doc.createElementNS(NS, "path");
        lock.setAttribute("fill-rule", "evenodd");
        lock.setAttribute("clip-rule", "evenodd");
        lock.setAttribute("d", "M6 4C6 2.89543 6.89543 2 8 2C9.10457 2 10 2.89543 10 4V6H6V4ZM5 6V4C5 2.34315 6.34315 1 8 1C9.65685 1 11 2.34315 11 4V6H12C12.5523 6 13 6.44772 13 7V14C13 14.5523 12.5523 15 12 15H4C3.44772 15 3 14.5523 3 14V7C3 6.44771 3.44772 6 4 6H5ZM4 14V7H12V14H4Z");
        lock.setAttribute("fill", "currentColor");
        g.appendChild(lock);
        svg.appendChild(g);
        return svg;
    }

    /** Build the Has Comment tile as a standalone button element so
     *  it can be appended inline at the right end of the Annotation
     *  Type row (see `_renderTypeSection`). The standalone-section
     *  renderer below is now a no-op — the tile lives on the type
     *  row instead of its own row. */
    _makeHasCommentTile(doc, refreshAll) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const g0 = this._activeGroup();
        const cur = g0 ? g0.annotationHasComment : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        // Has Comment sits in `.wv-filter-options` next to a
        // `.wv-filter-or-inline` group that's TALLER than this button
        // (group: 34 px = 28 px icon + 3 px×2 padding; button: 28 px).
        // The options container defaults to `align-items: stretch`, but
        // this button's explicit `height: 28 px` wins — so without an
        // override the button hugs the top of the row and ends up 3 px
        // above the icons inside the group. `align-self: center` pulls
        // it back to the same Y as the centered type icons.
        (btn as any).style.alignSelf = "center";
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        btn.title = "Has Comment — annotations with non-empty "
            + "comment text. Alt+click to exclude.";
        btn.appendChild(this._makeHasCommentSvg(doc));
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                next = (g.annotationHasComment === false) ? null : false;
            } else {
                next = (g.annotationHasComment === true) ? null : true;
            }
            g.annotationHasComment = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        return btn;
    }

    /** Annotation Source tile — tri-state on `annotationIsExternal`,
     *  inline at the right end of the Annotation Type row next to
     *  Has Comment. Click → made in Zotero Reader; Alt+click →
     *  embedded in the PDF (source is binary, so excluding one kind
     *  IS selecting the other — the standard tile gesture covers
     *  every state). */
    _makeAnnotationSourceTile(doc, refreshAll) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const g0 = this._activeGroup();
        const cur = g0 ? g0.annotationSource : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        // Same row-alignment constraint as the Has Comment tile it
        // sits beside (see `_makeHasCommentTile`).
        (btn as any).style.alignSelf = "center";
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        btn.title = "Annotation Source — embedded in the PDF by an "
            + "outside reader (imported when Zotero first opens the "
            + "file). Alt+click: made in Zotero Reader.";
        btn.appendChild(this._makeAnnotationSourceSvg(doc));
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                next = (g.annotationSource === false) ? null : false;
            } else {
                next = (g.annotationSource === true) ? null : true;
            }
            g.annotationSource = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        return btn;
    }

    /** Annotation Source glyph — Zotero's own icon language, per MJT
     *  2026-08-18: the native annotation-note glyph with the reader's
     *  external-annotation LOCK superposed bottom-right. Both paths
     *  copied verbatim from upstream artwork: the note from
     *  `16/universal/annotate-note.svg` (stroke-only, .5 grid), the
     *  padlock from the reader's `res/icons/16/lock.svg` (the exact
     *  badge shown on read-only external annotations in the sidebar),
     *  scaled 0.58 into the corner. A mask knocks the note's strokes
     *  out around the badge, Zotero-badge style. Lock at full opacity
     *  (upstream's 0.5 is illegible at badge size). `--tag-purple`
     *  matches the annotation-section accent. */
    _makeAnnotationSourceSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-filter-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "none");
        svg.style.color = "var(--tag-purple)";
        const defs = doc.createElementNS(NS, "defs");
        const mask = doc.createElementNS(NS, "mask");
        mask.setAttribute("id", "wv-annsrc-lock-knockout");
        const keep = doc.createElementNS(NS, "rect");
        keep.setAttribute("x", "0"); keep.setAttribute("y", "0");
        keep.setAttribute("width", "16"); keep.setAttribute("height", "16");
        keep.setAttribute("fill", "white");
        mask.appendChild(keep);
        const cut = doc.createElementNS(NS, "rect");
        cut.setAttribute("x", "7.4"); cut.setAttribute("y", "-0.4");
        cut.setAttribute("width", "8.6"); cut.setAttribute("height", "9.6");
        cut.setAttribute("rx", "2");
        cut.setAttribute("fill", "black");
        mask.appendChild(cut);
        defs.appendChild(mask);
        svg.appendChild(defs);
        // Base: annotate-note.svg path verbatim (fold bottom-left, so
        // the badge corner is clean).
        const note = doc.createElementNS(NS, "path");
        note.setAttribute("d", "M7.5 14.5H14.5V1.5H1.5V8.5M7.5 14.5L1.5 8.5M7.5 14.5V8.5H1.5");
        note.setAttribute("stroke", "currentColor");
        note.setAttribute("stroke-width", "1");
        note.setAttribute("fill", "none");
        note.setAttribute("mask", "url(#wv-annsrc-lock-knockout)");
        svg.appendChild(note);
        // Badge: reader lock.svg path verbatim, scaled into the
        // TOP-RIGHT corner (MJT 2026-08-18; the note's fold is
        // bottom-left, so both right corners are clean — top-right
        // keeps the fold visible).
        const g = doc.createElementNS(NS, "g");
        g.setAttribute("transform", "translate(6.6 -0.3) scale(0.58)");
        const lock = doc.createElementNS(NS, "path");
        lock.setAttribute("fill-rule", "evenodd");
        lock.setAttribute("clip-rule", "evenodd");
        lock.setAttribute("d", "M6 4C6 2.89543 6.89543 2 8 2C9.10457 2 10 2.89543 10 4V6H6V4ZM5 6V4C5 2.34315 6.34315 1 8 1C9.65685 1 11 2.34315 11 4V6H12C12.5523 6 13 6.44772 13 7V14C13 14.5523 12.5523 15 12 15H4C3.44772 15 3 14.5523 3 14V7C3 6.44771 3.44772 6 4 6H5ZM4 14V7H12V14H4Z");
        lock.setAttribute("fill", "currentColor");
        g.appendChild(lock);
        svg.appendChild(g);
        return svg;
    }

    /** Weavero-owned tooltips for the filter popup (2026-08-19,
     *  register #14). The FF153 page-tooltip engine is broken for
     *  fast target changes inside panels — ring-proven progression:
     *  stale labels, then stale anchors (SHOW→hide within ~10ms),
     *  then an unrecoverable dead state once interfered with. Two
     *  shim rounds fighting the engine both failed, so the engine is
     *  disabled for this popup (no `tooltip` attribute on the panel)
     *  and this method provides tooltips deterministically: delegated
     *  hover on the panel, 350ms delay, a dedicated `wv-filter-
     *  tooltip` element, dismiss on leaving the [title] holder or on
     *  panel close. `title` attributes remain the single text source.
     *  The capped Zotero-global ring `Zotero._wvTtRing` keeps
     *  recording (k:"wvshow"/"wvhide") for the upstream report.
     *  Survival rules: numeric per-window version stamp + stored
     *  handler refs, unhook before re-hook (VER 3 cleanup also
     *  removes the retired engine-shim listeners). */
    _wvArmTooltipRing(doc) {
        const win: any = doc.defaultView;
        if (!win) return;
        // The stamp lives on the PANEL, not the window: a plugin
        // reload recreates the panel (listeners gone with it) while
        // the window persists — a window-level stamp then skips the
        // re-arm and the fresh panel has NO tooltips (bit on
        // annsrc.12, 2026-08-19). Stamp scope must match the wired
        // object's lifetime.
        const panel: any = doc.getElementById("wv-filter-popup");
        if (!panel) return;
        const VER = 5;
        if (panel._wvTtVer === VER) return;
        const Z: any = Zotero;
        Z._wvTtRing = Z._wvTtRing || [];
        const push = (e) => {
            try {
                e.t = Date.now();
                Z._wvTtRing.push(e);
                if (Z._wvTtRing.length > 200) Z._wvTtRing.shift();
            } catch (err) {}
        };
        // One-time cleanup of legacy window-level handlers (VER ≤ 4
        // stored refs on the window; incl. the retired html-tooltip
        // engine shims).
        const engineTip = doc.getElementById("html-tooltip");
        const old = win._wvTtRingHandlers;
        if (old) {
            if (engineTip) {
                try { engineTip.removeEventListener("popupshowing", old.show, true); } catch (e) {}
                try { engineTip.removeEventListener("popuphidden", old.hide, true); } catch (e) {}
            }
            try { win.removeEventListener("mouseover", old.over, true); } catch (e) {}
            if (old.overP) {
                try { panel.removeEventListener("mouseover", old.overP, true); } catch (e) {}
                try { panel.removeEventListener("mouseout", old.outP, true); } catch (e) {}
                try { panel.removeEventListener("popuphiding", old.hideAll, true); } catch (e) {}
            }
            delete win._wvTtRingHandlers;
        }
        // The engine must never race us in this popup.
        try { panel.removeAttribute("tooltip"); } catch (e) {}
        // Dedicated tooltip element, created once per document.
        let tipW: any = doc.getElementById("wv-filter-tooltip");
        if (!tipW) {
            tipW = doc.createXULElement("tooltip");
            tipW.id = "wv-filter-tooltip";
            const host = wvPopupHost(doc);
            host.appendChild(tipW);
        }
        let pending = 0;
        let curHolder: any = null;
        const cancel = () => {
            if (pending) { try { win.clearTimeout(pending); } catch (e) {} pending = 0; }
        };
        const hideAll = () => {
            cancel();
            curHolder = null;
            try { tipW.hidePopup(); } catch (e) {}
            push({ k: "wvhide" });
        };
        const overP = (ev) => {
            try {
                const h = ev.target && ev.target.closest && ev.target.closest("[title]");
                if (!h || h === curHolder) return;
                cancel();
                try { tipW.hidePopup(); } catch (e) {}
                curHolder = h;
                pending = win.setTimeout(() => {
                    pending = 0;
                    try {
                        if (curHolder !== h) return;
                        const txt = String(h.getAttribute("title") || "");
                        if (!txt) return;
                        tipW.setAttribute("label", txt);
                        tipW.openPopup(h, "after_start", 0, 2, false, false, null);
                        push({ k: "wvshow", title: txt.slice(0, 40) });
                    } catch (e) {}
                }, 350);
            } catch (e) {}
        };
        const outP = (ev) => {
            try {
                const h = ev.target && ev.target.closest && ev.target.closest("[title]");
                if (!h || h !== curHolder) return;
                const to = ev.relatedTarget;
                if (to && h.contains(to)) return;
                hideAll();
            } catch (e) {}
        };
        panel.addEventListener("mouseover", overP, true);
        panel.addEventListener("mouseout", outP, true);
        panel.addEventListener("popuphiding", hideAll, true);
        panel._wvTtHandlers = { overP, outP, hideAll };
        panel._wvTtVer = VER;
    }

    /** Has Comment now sits inline at the right end of the
     *  Annotation Type row (see `_renderTypeSection`). This
     *  renderer is kept as a no-op shim so the standalone section
     *  div stays empty and collapses out of the layout — keeps the
     *  outer panel `appendChild(commentSection)` call working
     *  without it producing a visible row. */
    _renderHasCommentSection(_doc, section, _refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "";
    }

    /** Build the Has Comment glyph — a rounded speech bubble with a
     *  capital "C" inside, painted in `--tag-purple` to match the
     *  annotation-pane accent. Inline SVG so we don't need to ship
     *  a separate file in `src/icons/`. */
    _makeHasCommentSvg(doc) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = doc.createElementNS(NS, "svg");
        svg.setAttribute("class", "wv-filter-svg");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "none");
        svg.style.color = "var(--tag-purple)";
        const path = doc.createElementNS(NS, "path");
        // Coordinates aligned to the `.5` grid so the 1-px stroke
        // covers integer pixel rows (otherwise the stroke center
        // straddles two rows and anti-aliases to a blurry line —
        // exactly the trick Zotero's `annotate-note.svg` uses,
        // e.g. `0.5`, `8.5`, `15.5`). Bubble body now: (0.5, 0.5) →
        // (15.5, 11.5) — 15×11 vs the old 13×10, so the icon fills
        // the 16-px box closer to its siblings. Tail tip at
        // (4.5, 15.5), drawing down to the bottom edge of the
        // viewBox.
        path.setAttribute("d",
            "M0.5 2C0.5 1.17 1.17 0.5 2 0.5H14"
            + "C14.83 0.5 15.5 1.17 15.5 2V10"
            + "C15.5 10.83 14.83 11.5 14 11.5H6.5"
            + "L4.5 15.5V11.5H2"
            + "C1.17 11.5 0.5 10.83 0.5 10V2Z");
        path.setAttribute("stroke", "currentColor");
        // Match Zotero's stroke-only icons — `annotate-note.svg`
        // and friends omit `stroke-width` so it defaults to 1.
        path.setAttribute("stroke-width", "1");
        path.setAttribute("stroke-linejoin", "round");
        // `.wv-filter-svg { fill: currentColor }` would otherwise
        // fill the bubble with the same purple as the C text,
        // hiding the letter. Inline style beats the class rule.
        path.style.fill = "none";
        svg.appendChild(path);
        // C drawn as a stroked arc — text rendering at 16-px doesn't
        // hit pixel boundaries cleanly and ends up soft. An SVG arc
        // with coords on the .5 grid + the same 1-px stroke as the
        // bubble produces a crisp letter. Center (8, 6), radius 2.5,
        // endpoints at (9.5, 4) and (9.5, 8) — the long arc going
        // counter-clockwise leaves the opening on the right.
        const c = doc.createElementNS(NS, "path");
        c.setAttribute("d", "M9.5 4A2.5 2.5 0 1 0 9.5 8");
        c.setAttribute("stroke", "currentColor");
        c.setAttribute("stroke-width", "1");
        c.setAttribute("stroke-linecap", "round");
        c.setAttribute("fill", "none");
        svg.appendChild(c);
        return svg;
    }

    /** Annotation Tag picker — dynamic-list section with a GitHub-
     *  style filter input above the tag chips. Tags are scoped to
     *  the active library; we collect all tags actually attached to
     *  annotation items there (via SQL — fast through
     *  `Zotero.DB.columnQueryAsync`). The fetch runs once per popup
     *  open (cached on `_cachedAnnotationTags`); typing in the
     *  filter input only re-renders the chip list, so input focus
     *  is preserved across keystrokes.
     *
     *  Multi-select with ANY-of semantics. */
    _renderTagSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        // Stacked layout: input on top, tag list below. Both sit
        // inside the standard `.wv-filter-options` flex column for
        // alignment with the section title.
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter tags…";
        search.value = this._tagSearchQuery || "";
        opts.appendChild(search);

        // The tag list is collapsed by default — only the search
        // input is visible until the user focuses it. Mirrors
        // GitHub's tag picker: clean section by default, suggestions
        // appear on demand. We re-expand on focus-in to anywhere
        // inside the section (so clicking a chip keeps the list
        // open) and re-collapse when focus leaves entirely.
        const tagBox = doc.createElementNS(NS_HTML, "div");
        tagBox.className = "wv-filter-tag-list";
        tagBox.style.display = "none";
        opts.appendChild(tagBox);

        this._wireFilterBoxFocus(doc, search, tagBox, opts);

        // Initial placeholder while we fetch tags (replaced on
        // success / error / cache hit).
        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        tagBox.appendChild(placeholder);

        // GitHub-style ranking — when the user is typing a query,
        // show a small set of suggestions ordered by relevance:
        //   1. exact match (case-insensitive)
        //   2. prefix match
        //   3. substring match
        // Within each tier, alphabetical. Capped at SUGGEST_LIMIT
        // so a long tag library doesn't drown out the picker; if
        // matches were truncated we surface "+N more" so the user
        // knows to refine. With an empty query we show every tag
        // (still chip-style multi-select).
        const SUGGEST_LIMIT = 10;
        const rankMatches = (allTags, q) => {
            const exact = [], prefix = [], substring = [], acr = [];
            for (const t of allTags) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) prefix.push(t);
                else if (lc.includes(q)) substring.push(t);
                else if (this._wvAcronymMatch(t, q)) acr.push(t);
            }
            acr.sort((a, b) => this._wvInitialsLen(a) - this._wvInitialsLen(b));
            return [...exact, ...prefix, ...substring, ...acr];
        };

        // (Re-)render only the chip list — keeps the search input
        // intact so typing doesn't drop focus.
        const renderButtons = (allTags) => {
            while (tagBox.firstChild) tagBox.removeChild(tagBox.firstChild);
            const q = (this._tagSearchQuery || "").trim().toLowerCase();
            let ranked;
            if (q) ranked = rankMatches(allTags, q);
            else ranked = allTags;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching tags"
                    : "No annotation tags in this library";
                tagBox.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().annotationTag) || []);
            for (const tag of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = tag;
                if (selected.has(tag)) btn.dataset.selected = "true";
                btn.textContent = tag;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(tag)) selected.delete(tag);
                    else selected.add(tag);
                    { const g = this._activeGroup(); if (g) g.annotationTag = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    // Re-render only this section's buttons (NOT
                    // `refreshAll`) so the search input keeps focus.
                    renderButtons(allTags);
                });
                tagBox.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                tagBox.appendChild(more);
            }
        };

        // Type-to-filter wiring. We rebuild the chip list on every
        // keystroke; `tagBox` rebuild is local so the input element
        // is preserved and keeps focus.
        search.addEventListener("input", () => {
            this._tagSearchQuery = search.value || "";
            const cached = this._cachedAnnotationTags;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        // Use cached tags if we already fetched during this popup
        // open (cache cleared on `popupshowing`). Otherwise fetch.
        if (this._cachedAnnotationTags) {
            renderButtons(this._cachedAnnotationTags);
            return;
        }
        this._collectAnnotationTags(libraryID).then((tags) => {
            this._cachedAnnotationTags = tags;
            // Bail if the section was rebuilt mid-fetch — the new
            // render kicked off its own pass already.
            if (!section.isConnected) return;
            renderButtons(tags);
        }).catch((e) => {
            dbg("[Weavero][filter] tag fetch err: " + e);
            if (!section.isConnected) return;
            while (tagBox.firstChild) tagBox.removeChild(tagBox.firstChild);
            const err = doc.createElementNS(NS_HTML, "span");
            err.style.opacity = "0.5";
            err.style.fontSize = "12px";
            err.textContent = "(failed to load tags)";
            tagBox.appendChild(err);
        });
    }

    /** Distinct tag names attached to annotation items in the given
     *  library. SQL does the heavy lifting — much faster than
     *  iterating all items and calling `getTags()` on each one. */
    async _collectAnnotationTags(libraryID) {
        // (Misnamed for history) Library-wide distinct tag names —
        // covers tags on any item type, not just annotations, since
        // the Tag filter is now generic.
        //
        // Sort order matches Zotero's tag selector / tags box:
        // coloured tags first (by their assigned position), then
        // emoji-leading tags alphabetically, then everything else
        // alphabetically. We delegate to `Zotero.Tags.compareTagsOrder`
        // (xpcom/data/tags.js) so the filter list stays in sync if
        // upstream tweaks the rule. After sorting, a `{separator:true}`
        // marker is inserted after the last coloured tag — the
        // unified-search renderer already knows how to draw it as a
        // group divider, mirroring tagSelectorList.jsx's separator
        // between coloured and non-coloured rows.
        if (libraryID == null) return [];
        const sql = "SELECT DISTINCT t.name "
            + "FROM tags t "
            + "JOIN itemTags it ON it.tagID = t.tagID "
            + "JOIN items i ON i.itemID = it.itemID "
            + "WHERE i.libraryID = ? "
            + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
        try {
            const names = await Zotero.DB.columnQueryAsync(sql, [libraryID]);
            let tagColors = null;
            try { tagColors = Zotero.Tags.getColors(libraryID); }
            catch (e) {}
            try {
                names.sort((a, b) => Zotero.Tags.compareTagsOrder(libraryID, a, b));
            } catch (e) {
                names.sort((a, b) => String(a).localeCompare(String(b)));
            }
            if (tagColors && tagColors.size) {
                const firstUncoloredIdx = names.findIndex(
                    n => !tagColors.get(n));
                if (firstUncoloredIdx > 0) {
                    return [
                        ...names.slice(0, firstUncoloredIdx),
                        { separator: true },
                        ...names.slice(firstUncoloredIdx),
                    ];
                }
            }
            return names;
        } catch (e) {
            dbg("[Weavero][filter] _collectAllTags err: " + e);
            return [];
        }
    }

    /** Distinct annotation authors in the library, returned as
     *  display names. Looks at `createdByUserID` on each annotation
     *  and resolves to `Zotero.Users.getName(userID)` (or the literal
     *  `annotationAuthorName` string for unauthenticated users). */
    async _collectAnnotationAuthors(libraryID) {
        // (Misnamed for history) Library-wide distinct author names —
        // unions item creators (any item type) with annotation
        // authors (group-library users / annotationAuthorName).
        if (libraryID == null) return [];
        const names = new Set();
        try {
            const creatorSql = "SELECT DISTINCT c.firstName, c.lastName "
                + "FROM creators c "
                + "JOIN itemCreators ic ON ic.creatorID = c.creatorID "
                + "JOIN items i ON i.itemID = ic.itemID "
                + "WHERE i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const creators = await Zotero.DB.queryAsync(creatorSql, [libraryID]);
            for (const r of creators) {
                const n = ((r.firstName || "") + " " + (r.lastName || "")).trim();
                if (n) names.add(n);
            }
        } catch (e) {
            dbg("[Weavero][filter] creators query err: " + e);
        }
        try {
            const annSql = "SELECT DISTINCT IFNULL(ia.authorName, '') AS authorName, "
                + "IFNULL(i.createdByUserID, -1) AS createdByUserID "
                + "FROM items i "
                + "LEFT JOIN itemAnnotations ia ON ia.itemID = i.itemID "
                + "WHERE i.itemTypeID = ("
                + "  SELECT itemTypeID FROM itemTypes WHERE typeName = 'annotation'"
                + ") "
                + "AND i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const rows = await Zotero.DB.queryAsync(annSql, [libraryID]);
            for (const r of rows) {
                if (r.authorName) {
                    names.add(r.authorName);
                    continue;
                }
                if (r.createdByUserID != null && r.createdByUserID >= 0
                    && Zotero.Users && Zotero.Users.getName) {
                    const n = Zotero.Users.getName(r.createdByUserID);
                    if (n) names.add(n);
                }
            }
        } catch (e) {
            dbg("[Weavero][filter] annotation authors query err: " + e);
        }
        return [...names].sort((a: any, b: any) => a.localeCompare(b));
    }

    _renderAuthorSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter authors…";
        search.value = this._authorSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rank = (all, q) => {
            const exact = [], pre = [], sub = [], acr = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
                else if (this._wvAcronymMatch(t, q)) acr.push(t);
            }
            acr.sort((a, b) => this._wvInitialsLen(a) - this._wvInitialsLen(b));
            return [...exact, ...pre, ...sub, ...acr];
        };
        const renderButtons = (all) => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._authorSearchQuery || "").trim().toLowerCase();
            const ranked = q ? rank(all, q) : all;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching authors"
                    : "No annotation authors in this library";
                box.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().annotationAuthor) || []);
            for (const a of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = a;
                if (selected.has(a)) btn.dataset.selected = "true";
                btn.textContent = a;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(a)) selected.delete(a);
                    else selected.add(a);
                    { const g = this._activeGroup(); if (g) g.annotationAuthor = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons(all);
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };

        search.addEventListener("input", () => {
            this._authorSearchQuery = search.value || "";
            const cached = this._cachedAnnotationAuthors;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        if (this._cachedAnnotationAuthors) {
            renderButtons(this._cachedAnnotationAuthors);
            return;
        }
        this._collectAnnotationAuthors(libraryID).then((authors) => {
            this._cachedAnnotationAuthors = authors;
            if (!section.isConnected) return;
            renderButtons(authors);
        }).catch((e) => {
            dbg("[Weavero][filter] author fetch err: " + e);
        });
    }

    /** Attachment File Type — multi-select buttons with icons,
     *  one per attachment file kind (PDF, EPUB, Snapshot, Image,
     *  Video, Web Link, Other File). Notes are excluded — Zotero
     *  treats them as their own row kind, handled via Item Category
     *  / Note Type. */
    _renderAttachmentFileTypeSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.attachmentFileType) || []);
        const excluded = new Set((g0 && g0.attachmentFileTypeExclude) || []);
        for (const def of this._ATTACHMENT_FILE_TYPES) {
            // `attachmentLinkedFile` is a pseudo-kind rendered as
            // its own tile in the Has Annotations row (see
            // `_renderHasAnnotationsSection`), not in this file-type
            // strip — keeps the file-type strip aligned on content-
            // type kinds only.
            if (def.value === "attachmentLinkedFile") continue;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";
            // Theme-aware: Zotero's `.icon-item-type[data-item-type]`
            // rules (defined in `_item-tree.scss`) ship separate
            // light/dark SVG paths and resolve at runtime to the
            // correct one for the active theme. `def.value` is
            // already the camelCase form (attachmentPDF, …).
            const icon = doc.createElementNS(NS_HTML, "span");
            icon.className = "icon icon-css icon-item-type";
            icon.setAttribute("data-item-type", def.value);
            btn.appendChild(icon);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const next = this._toggleIncludeExclude(
                    def.value, [...selected], [...excluded], e.altKey);
                const g = this._activeGroup();
                if (g) {
                    g.attachmentFileType = next.include;
                    g.attachmentFileTypeExclude = next.exclude;
                }
                this._renderFilterBar();
                this._applyItemsListFilter({ cascade: true });
                refreshAll();
            });
            opts.appendChild(btn);
        }

        // Standalone Attachment tile sits at the FAR RIGHT of the
        // file-type row (2026-08-19) -- the attachment type's position
        // scope lives beside its file-type facets, in the spot the
        // Item Note tile occupied before notes got their own row.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        sep.style.marginLeft = "auto";
        opts.appendChild(sep);

        // Standalone Attachment tile (2026-08-19) — the attachment
        // type's missing position scope, symmetric to Standalone Note.
        // A RESTRICTION: intersects with Attachment File Type
        // (standalone + PDF = standalone PDFs), no OR pair.
        const saCur = g0 ? g0.standaloneAttachment : null;
        const saBtn = doc.createElementNS(NS_HTML, "button");
        saBtn.type = "button";
        saBtn.className = "wv-filter-opt wv-filter-opt-icon";
        saBtn.title = "Standalone Attachment — show only top-level "
            + "(parentless) attachments. Alt+click to exclude.";
        if (saCur === true) saBtn.dataset.selected = "true";
        else if (saCur === false) saBtn.dataset.excluded = "true";
        const saIcon = doc.createElementNS(NS_HTML, "img");
        saIcon.className = "wv-filter-svg";
        // Standalone motif "E" (user pick 2026-08-20): left-margin bar
        // + paperclip, matching the Standalone Note tile — one shared
        // "standalone" language across both kinds. Stroke-drawn clip
        // (not the stock filled attachment.svg) so its line weight
        // matches the bar and the note pair.
        saIcon.src = "data:image/svg+xml;utf8,"
            + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'"
            + " fill='none' stroke='context-stroke' stroke-width='1'"
            + " shape-rendering='geometricPrecision'>"
            + "<path d='M1.5 0.5 V15.5'/>"
            + "<g transform='translate(2,0)'>"
            + "<path d='M5 9.5 L10.2 4.3 a2.05 2.05 0 0 1 2.9 2.9"
            + " L7.4 12.9 a3.4 3.4 0 0 1 -4.8 -4.8 L8.3 2.4'/>"
            + "</g>"
            + "</svg>";
        saIcon.alt = "Standalone Attachment";
        saIcon.style.color = "var(--accent-blue)";
        saBtn.appendChild(saIcon);
        saBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.standaloneAttachment === false) ? null : false;
            else next = (g.standaloneAttachment === true) ? null : true;
            g.standaloneAttachment = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(saBtn);
    }


    /** Notes row (2026-08-19, four-type classification): the Notes
     *  type's two position tiles side by side -- Standalone Note and
     *  Item Note -- in their own section between the attachment block
     *  and the annotation block, matching the published taxonomy order
     *  (parent items, attachments, notes, annotations). The tiles kept
     *  their exact semantics (including the Rule 1 OR pairs with Item
     *  Type / Attachment File Type); only their home moved. */
    _renderNotesSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section wv-filter-notes-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-or-group";
        section.appendChild(opts);
        const sg0 = this._activeGroup();
        const snCur = sg0 ? sg0.standaloneNote : null;
        const snBtn = doc.createElementNS(NS_HTML, "button");
        snBtn.type = "button";
        snBtn.className = "wv-filter-opt wv-filter-opt-icon";
        snBtn.title = "Standalone Note — show only top-level "
            + "(parentless) notes. Together with Item Note: either "
            + "kind of note (OR). Alt+click to exclude.";
        if (snCur === true) snBtn.dataset.selected = "true";
        else if (snCur === false) snBtn.dataset.excluded = "true";
        const snIcon = doc.createElementNS(NS_HTML, "img");
        snIcon.className = "wv-filter-svg";
        // Standalone motif (user pick "E" of five rendered candidates,
        // 2026-08-20): a bare vertical bar at the LEFT MARGIN — "flush
        // at the tree's root level". Pairs with the Item Note icon,
        // which grows a branch off the same left spine into the note;
        // standalone = the spine with nothing hanging above. The note
        // body below is copied from the Item Note icon verbatim so the
        // pair differs ONLY in bar-vs-branch. Same motif on the
        // Standalone Attachment tile.
        snIcon.src = "data:image/svg+xml;utf8,"
            + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'"
            + " fill='none' stroke='context-stroke' stroke-width='1'"
            + " shape-rendering='geometricPrecision'>"
            + "<path d='M1.5 0.5 V15.5'/>"
            + "<path d='M4.5 1.5 H14.5 V10.5 L10.5 14.5 H4.5 Z'/>"
            + "<path d='M5.5 3.5 H13.5'/>"
            + "<path d='M14.5 10.5 H10.5 V14.5'/>"
            + "</svg>";
        snIcon.alt = "Standalone Note";
        snIcon.style.color = "var(--accent-yellow)";
        snBtn.appendChild(snIcon);
        snBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.standaloneNote === false) ? null : false;
            else next = (g.standaloneNote === true) ? null : true;
            g.standaloneNote = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(snBtn);

        const inCur = sg0 ? sg0.itemNote : null;
        const inBtn = doc.createElementNS(NS_HTML, "button");
        inBtn.type = "button";
        inBtn.className = "wv-filter-opt wv-filter-opt-icon";
        inBtn.title = "Item Note — show only notes attached to a regular item. "
            + "Together with Standalone Note: either kind of note (OR). "
            + "Alt+click to exclude.";
        if (inCur === true) inBtn.dataset.selected = "true";
        else if (inCur === false) inBtn.dataset.excluded = "true";
        const inIcon = doc.createElementNS(NS_HTML, "img");
        inIcon.className = "wv-filter-svg";
        // Custom Item Note icon — Zotero's note glyph (rectangle
        // with a folded bottom-right corner) plus a small L-shaped
        // tree-branch on the left signalling "child of a parent
        // item". Distinguishes visually from Standalone Note,
        // which uses the plain note glyph. `stroke="context-stroke"`
        // resolves through `.wv-filter-svg`'s
        // `-moz-context-properties` rule to currentColor, which is
        // overridden below to `--accent-yellow` for parity with
        // Zotero's note-section colour.
        inIcon.src = "data:image/svg+xml;utf8,"
            + "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'"
            // stroke-width=1 matches Zotero's 1-pixel outline
            // weight (their stock icons are filled paths simulating
            // a 1-px border — see note.svg's outer/inner rect
            // pattern). Paths are anchored on .5-pixel offsets so a
            // 1-px stroke centered there paints exactly one pixel
            // row/column for every horizontal and vertical segment.
            + " fill='none' stroke='context-stroke' stroke-width='1'"
            + " shape-rendering='geometricPrecision'>"
            // L-branch: vertical at column 1 from row 0 to row 7,
            // then horizontal across row 7 to the note's left edge.
            + "<path d='M1.5 0.5 V7.5 H4.5'/>"
            // Note outline: cols 4..14, rows 1..14, with a 4-px
            // folded-corner diagonal at bottom-right.
            + "<path d='M4.5 1.5 H14.5 V10.5 L10.5 14.5 H4.5 Z'/>"
            // Inner horizontal line just below the top edge —
            // mirrors the "title bar" hairline in Zotero's stock
            // note.svg (the small `M3 1 H14 V2 H3 V1` subpath).
            // Sits in the inner area (1-px inset from the outline)
            // at row y=3, with a 1-px gap to the top outline at
            // row y=1.
            + "<path d='M5.5 3.5 H13.5'/>"
            // Folded bottom-right corner (inner L of the cut).
            + "<path d='M14.5 10.5 H10.5 V14.5'/>"
            + "</svg>";
        inIcon.alt = "Item Note";
        // Same `--accent-yellow` Zotero uses for the notes section.
        inIcon.style.color = "var(--accent-yellow)";
        inBtn.appendChild(inIcon);
        inBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) next = (g.itemNote === false) ? null : false;
            else next = (g.itemNote === true) ? null : true;
            g.itemNote = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(inBtn);
    }

    /** Distinct user names who created (added) items in `libraryID`.
     *  Most useful for group libraries where multiple members
     *  contribute. In a personal library this typically returns
     *  zero or one entry. */
    /** Distinct non-empty `publicationTitle` values across all
     *  regular items in the library. Used by the Publication mode
     *  in the unified search. */
    async _collectPublications(libraryID) {
        if (libraryID == null) return [];
        try {
            const fieldSql = "SELECT fieldID FROM fields WHERE fieldName = 'publicationTitle'";
            const fieldRow = await Zotero.DB.valueQueryAsync(fieldSql);
            if (!fieldRow) return [];
            const sql = "SELECT DISTINCT idv.value AS title "
                + "FROM itemDataValues idv "
                + "JOIN itemData id ON id.valueID = idv.valueID "
                + "JOIN items i ON i.itemID = id.itemID "
                + "WHERE id.fieldID = ? "
                + "AND i.libraryID = ? "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems) "
                + "AND idv.value <> ''";
            const rows = await Zotero.DB.columnQueryAsync(sql, [fieldRow, libraryID]);
            return (rows || []).sort((a, b) => String(a).localeCompare(String(b)));
        } catch (e) {
            dbg("[Weavero][filter] _collectPublications err: " + e);
            return [];
        }
    }

    async _collectAddedByUsers(libraryID) {
        if (libraryID == null) return [];
        try {
            // `createdByUserID` lives on the `groupItems` table, not
            // on `items`. Join through itemID, scope to the active
            // library via `items.libraryID`, exclude trashed.
            const sql = "SELECT DISTINCT gi.createdByUserID "
                + "FROM groupItems gi "
                + "JOIN items i ON i.itemID = gi.itemID "
                + "WHERE i.libraryID = ? "
                + "AND gi.createdByUserID IS NOT NULL "
                + "AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
            const ids = await Zotero.DB.columnQueryAsync(sql, [libraryID]);
            const names = new Set();
            for (const uid of ids) {
                if (uid != null && Zotero.Users && Zotero.Users.getName) {
                    const n = Zotero.Users.getName(uid as any);
                    if (n) names.add(n);
                }
            }
            return [...names].sort((a: any, b: any) => a.localeCompare(b));
        } catch (e) {
            dbg("[Weavero][filter] _collectAddedByUsers err: " + e);
            return [];
        }
    }

    /** Multi-select Collection picker — narrows the items list to
     *  members of any selected collection in the active library.
     *  Stored in `_filterState.collections` (array of collection
     *  IDs). */
    _renderCollectionSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let cols = [];
        try {
            cols = (Zotero.Collections.getByLibrary(libraryID, true) || [])
                .map(c => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            dbg("[Weavero][filter] collections enum err: " + e);
        }
        if (!cols.length) {
            const empty = doc.createElementNS(NS_HTML, "span");
            empty.style.opacity = "0.5";
            empty.style.fontSize = "12px";
            empty.textContent = "No collections in this library.";
            opts.appendChild(empty);
            return;
        }

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter collections…";
        search.value = this._collectionSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const SUGGEST_LIMIT = 12;
        const renderButtons = () => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._collectionSearchQuery || "").trim().toLowerCase();
            let list = cols;
            if (q) list = cols.filter(c => c.name.toLowerCase().includes(q)
                || this._wvAcronymMatch(c.name, q));
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            const selected = new Set(this._filterState.collections || []);
            for (const c of list) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = c.name;
                if (selected.has(c.id)) btn.dataset.selected = "true";
                btn.textContent = c.name;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(c.id)) selected.delete(c.id);
                    else selected.add(c.id);
                    this._filterState.collections = [...selected];
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };
        search.addEventListener("input", () => {
            this._collectionSearchQuery = search.value || "";
            renderButtons();
        });
        renderButtons();
    }

    /** Multi-select Saved Search picker — narrows the items list to
     *  matches of any selected saved search. Each saved search runs
     *  asynchronously and yields a set of item IDs; results are
     *  cached per-search via `_savedSearchResults` and consulted
     *  synchronously in the filter pass.
     *
     *  Mirrors `_renderCollectionSection`: a search input on top, the
     *  suggestions box below revealed only when the input has focus. */
    _renderSavedSearchSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let searches = [];
        try {
            searches = ((Zotero.Searches as any).getByLibrary(libraryID) || [])
                .map(s => ({ id: s.id, name: s.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            dbg("[Weavero][filter] saved searches enum err: " + e);
        }
        if (!searches.length) {
            const empty = doc.createElementNS(NS_HTML, "span");
            empty.style.opacity = "0.5";
            empty.style.fontSize = "12px";
            empty.textContent = "No saved searches in this library.";
            opts.appendChild(empty);
            return;
        }

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter saved searches…";
        search.value = this._savedSearchSearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const SUGGEST_LIMIT = 12;
        const renderButtons = () => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._savedSearchSearchQuery || "").trim().toLowerCase();
            let list = searches;
            if (q) list = searches.filter(s => s.name.toLowerCase().includes(q)
                || this._wvAcronymMatch(s.name, q));
            const overflow = q ? Math.max(0, list.length - SUGGEST_LIMIT) : 0;
            list = q ? list.slice(0, SUGGEST_LIMIT) : list;
            const selected = new Set(this._filterState.savedSearches || []);
            for (const s of list) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = s.name;
                if (selected.has(s.id)) btn.dataset.selected = "true";
                btn.textContent = s.name;
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    if (selected.has(s.id)) selected.delete(s.id);
                    else selected.add(s.id);
                    this._filterState.savedSearches = [...selected];
                    // Recompute the saved-search ID cache before
                    // applying so the filter has fresh data.
                    await this._refreshSavedSearchResults();
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons();
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
        };
        search.addEventListener("input", () => {
            this._savedSearchSearchQuery = search.value || "";
            renderButtons();
        });
        renderButtons();
    }

    /** Run every saved search referenced in `_filterState.savedSearches`,
     *  union the matching item IDs into a Set on `_savedSearchResults`.
     *  Called from the saved-search button click and from the filter
     *  apply path (`_applyItemsListFilter`) so the per-row check can
     *  read it synchronously. */
    async _refreshSavedSearchResults() {
        const runOne = async (sid) => {
            try {
                const search = Zotero.Searches.get(sid);
                if (!search) return [];
                return (await search.search()) || [];
            } catch (e) {
                dbg("[Weavero][filter] saved-search "
                    + sid + " run err: " + e);
                return [];
            }
        };
        try {
            const incIds = (this._filterState && this._filterState.savedSearches)
                || [];
            const excIds = (this._filterState && this._filterState.savedSearchesExclude)
                || [];
            if (!incIds.length) {
                this._savedSearchResults = null;
            } else {
                const all = new Set();
                for (const sid of incIds) {
                    const matched = await runOne(sid);
                    for (const itemID of matched) all.add(itemID);
                }
                this._savedSearchResults = all;
            }
            if (!excIds.length) {
                this._savedSearchExcludeResults = null;
            } else {
                const all = new Set();
                for (const sid of excIds) {
                    const matched = await runOne(sid);
                    for (const itemID of matched) all.add(itemID);
                }
                this._savedSearchExcludeResults = all;
            }
        } catch (e) {
            dbg("[Weavero][filter] _refreshSavedSearchResults err: " + e);
            this._savedSearchResults = null;
            this._savedSearchExcludeResults = null;
        }
    }

    _renderAddedBySection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        // Row-kind scope checkboxes — control which row kinds the
        // `addedBy` filter applies to. Hidden until the user has
        // selected at least one user; the choice would have no
        // observable effect before that.
        const scopeRow = doc.createElementNS(NS_HTML, "div");
        scopeRow.className = "wv-filter-scope-row";
        section.appendChild(scopeRow);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const search = doc.createElementNS(NS_HTML, "input");
        search.type = "search";
        search.className = "wv-filter-search-input";
        search.placeholder = "Filter users…";
        search.value = this._addedBySearchQuery || "";
        opts.appendChild(search);

        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
        box.style.display = "none";
        opts.appendChild(box);

        this._wireFilterBoxFocus(doc, search, box, opts);

        const placeholder = doc.createElementNS(NS_HTML, "span");
        placeholder.style.opacity = "0.5";
        placeholder.style.fontSize = "12px";
        placeholder.textContent = "Loading…";
        box.appendChild(placeholder);

        const SUGGEST_LIMIT = 10;
        const rank = (all, q) => {
            const exact = [], pre = [], sub = [], acr = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
                else if (this._wvAcronymMatch(t, q)) acr.push(t);
            }
            acr.sort((a, b) => this._wvInitialsLen(a) - this._wvInitialsLen(b));
            return [...exact, ...pre, ...sub, ...acr];
        };
        const renderScope = () => {
            while (scopeRow.firstChild) scopeRow.removeChild(scopeRow.firstChild);
            const group = this._activeGroup();
            const hasUsers = !!(group && group.addedBy
                && group.addedBy.length);
            if (!hasUsers) {
                scopeRow.style.display = "none";
                return;
            }
            scopeRow.style.display = "";
            if (!group.addedByScope) {
                group.addedByScope = {
                    topLevel: true, attachments: true, annotations: true,
                };
            }
            const scope = group.addedByScope;
            // MIGRATION (2026-08-19): unset `notes` follows topLevel
            // (all notes rode the top-level toggle pre-four-type).
            if (scope.notes === undefined) {
                scope.notes = scope.topLevel !== false;
            }
            const items = [
                { key: "topLevel",    label: "Top-level items" },
                { key: "attachments", label: "Attachments" },
                { key: "notes",       label: "Notes" },
                { key: "annotations", label: "Annotations" },
            ];
            for (const it of items) {
                const lbl = doc.createElementNS(NS_HTML, "label");
                lbl.className = "wv-filter-scope-cb";
                const cb = doc.createElementNS(NS_HTML, "input");
                cb.type = "checkbox";
                cb.checked = !!scope[it.key];
                cb.addEventListener("change", (e) => {
                    e.stopPropagation();
                    scope[it.key] = cb.checked;
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                });
                const txt = doc.createElementNS(NS_HTML, "span");
                txt.textContent = it.label;
                lbl.appendChild(cb);
                lbl.appendChild(txt);
                scopeRow.appendChild(lbl);
            }
        };
        const renderButtons = (all) => {
            while (box.firstChild) box.removeChild(box.firstChild);
            const q = (this._addedBySearchQuery || "").trim().toLowerCase();
            const ranked = q ? rank(all, q) : all;
            const overflow = q ? Math.max(0, ranked.length - SUGGEST_LIMIT) : 0;
            const filtered = q ? ranked.slice(0, SUGGEST_LIMIT) : ranked;
            if (!filtered.length) {
                const empty = doc.createElementNS(NS_HTML, "span");
                empty.style.opacity = "0.5";
                empty.style.fontSize = "12px";
                empty.textContent = q
                    ? "No matching users"
                    : "No tracked creators in this library";
                box.appendChild(empty);
                return;
            }
            const selected = new Set(
                (this._activeGroup() && this._activeGroup().addedBy) || []);
            const colorOn = this._getEnableAddedByColors();
            for (const u of filtered) {
                const btn = doc.createElementNS(NS_HTML, "button");
                btn.type = "button";
                btn.className = "wv-filter-opt";
                btn.title = u;
                if (selected.has(u)) btn.dataset.selected = "true";
                btn.textContent = u;
                if (colorOn) {
                    const colour = this._colorForUser(u);
                    btn.style.color = colour;
                    btn.style.borderColor = this._withAlpha(colour, 0.4);
                    // Selected → stronger fill so the user-color tint
                    // still reads as "active". Idle → subtle 0.12-alpha
                    // wash so the per-user hue is visible without
                    // looking selected.
                    btn.style.backgroundColor = this._withAlpha(
                        colour, selected.has(u) ? 0.28 : 0.12);
                }
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (selected.has(u)) selected.delete(u);
                    else selected.add(u);
                    { const g = this._activeGroup(); if (g) g.addedBy = [...selected]; }
                    this._renderFilterBar();
                    this._applyItemsListFilter({ cascade: true });
                    renderButtons(all);
                });
                box.appendChild(btn);
            }
            if (overflow > 0) {
                const more = doc.createElementNS(NS_HTML, "span");
                more.style.opacity = "0.5";
                more.style.fontSize = "12px";
                more.style.alignSelf = "center";
                more.textContent = "+" + overflow + " more";
                box.appendChild(more);
            }
            renderScope();
        };

        search.addEventListener("input", () => {
            this._addedBySearchQuery = search.value || "";
            const cached = this._cachedAddedByUsers;
            if (cached) renderButtons(cached);
        });

        const win = doc.defaultView;
        const libraryID = this._wvSelectedLibraryID(win)
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);

        // Render the scope row immediately even while user list is
        // loading — so the ticks appear without waiting on the SQL
        // round-trip when the popup re-opens with users already
        // selected.
        renderScope();

        if (this._cachedAddedByUsers) {
            renderButtons(this._cachedAddedByUsers);
            return;
        }
        this._collectAddedByUsers(libraryID).then((users) => {
            this._cachedAddedByUsers = users;
            if (!section.isConnected) return;
            renderButtons(users);
        }).catch((e) => {
            dbg("[Weavero][filter] addedBy fetch err: " + e);
        });
    }

    /** V9-COMPAT: re-apply the Weavero filter after Zotero rebuilds
     *  the item rows. Zotero registers an observer on
     *  `hideContextAnnotationRows` (itemTree.js) that runs
     *  `await this.refresh(); this.tree.invalidate()` whenever that
     *  pref changes — and a bare `refresh()` rebuilds `_rows` with
     *  every container COLLAPSED, wiping the filter's auto-expanded
     *  view. On v10 our `rowProvider._refresh` wrap re-applies after
     *  such refreshes; v9 has no rowProvider, so without this the
     *  "Show Non-Matching Annotations" toggle expands the rows for a
     *  frame and then Zotero's observer collapses them again with
     *  nothing to restore the expansion. Wrap the itemsView's own
     *  `refresh` so OUR cascade apply always runs once Zotero's
     *  refresh resolves. Idempotent; only the active-filter case
     *  re-applies, so it's a no-op when no Weavero filter is set
     *  (and harmless for unrelated refreshes like collection
     *  changes — same behaviour the v10 wrap already has). */
    _patchV9RefreshReapply(itemsView) {
        if (!itemsView || itemsView.rowProvider) return; // v9 only
        if (typeof itemsView.refresh !== "function") return;
        // Peel a prior wrap before re-installing. `itemsView` persists
        // across plugin reloads/upgrades, so a stale `_wvV9RefreshWrapped`
        // flag would keep an OLD wrapper live and new builds wouldn't
        // take effect without a Zotero restart. Restore the saved true
        // original, then wrap fresh.
        if (itemsView._wvV9RefreshWrapped && itemsView._wvOrigRefreshV9) {
            try { itemsView.refresh = itemsView._wvOrigRefreshV9; }
            catch (e) {}
            delete itemsView._wvOrigRefreshV9;
            delete itemsView._wvV9RefreshWrapped;
        }
        const orig = itemsView.refresh.bind(itemsView);
        itemsView._wvOrigRefreshV9 = orig;
        const self = this;
        itemsView.refresh = async function (...args) {
            // SKIP the redundant observer refresh during a display
            // toggle. The `hideContextAnnotationRows` pref observer
            // fires a full `refresh()` (250-550ms row rebuild) on
            // every change — but with no quick search the rows are
            // already all in `_rows`, so the rebuild is pure waste
            // that just collapses then re-expands the tree. When the
            // toggle armed the skip window, bypass the rebuild and
            // re-key the existing rows instead (instant, no collapse).
            // One-shot: cleared on first use so a real refresh right
            // after (e.g. a collection change) still runs.
            if (self._wvSkipObserverRefreshUntil
                && Date.now() < self._wvSkipObserverRefreshUntil) {
                self._wvSkipObserverRefreshUntil = 0;
                try {
                    if (self._isFilterActive(self._filterState)) {
                        self._suppressTreeObserverUntil = 0;
                        self._filterApplying = false;
                        self._applyItemsListFilter({ cascade: true });
                    }
                } catch (e) {
                    Zotero.debug(
                        "[Weavero] v9 skip-refresh reapply err: " + e);
                }
                return undefined;
            }
            const result = await orig(...args);
            try {
                if (self._isFilterActive(self._filterState)) {
                    self._suppressTreeObserverUntil = 0;
                    self._filterApplying = false;
                    self._applyItemsListFilter({ cascade: true });
                }
            } catch (e) {
                Zotero.debug(
                    "[Weavero] v9 refresh-reapply err: " + e);
            }
            return result;
        };
        itemsView._wvV9RefreshWrapped = true;
    }

    /** Arm the v9 "skip the next observer refresh" window. MUST be
     *  called BEFORE `Zotero.Prefs.set("hideContextAnnotationRows", …)`:
     *  that pref's observer fires SYNCHRONOUSLY inside `set()` and
     *  calls `itemsView.refresh()`, so the window has to already be
     *  open for the v9 refresh-wrap to bypass the (redundant,
     *  250-550ms) rebuild and re-key the existing rows instead.
     *  v9 + no quick search only — with a search the rows really were
     *  pruned and a real refresh IS needed; v10 has its own
     *  rowProvider._refresh wrap and doesn't use this. */
    _armObserverRefreshSkip() {
        try {
            const win = Zotero.getMainWindow();
            const iv: any = win && win.ZoteroPane
                && win.ZoteroPane.itemsView;
            if (!iv || iv.rowProvider) return; // v9 only
            const rp: any = iv.rowProvider || iv;
            if (rp && (rp.searchMode || rp._searchMode)) return;
            if (!this._isFilterActive(this._filterState)) return;
            this._wvSkipObserverRefreshUntil = Date.now() + 800;
        } catch (e) {}
    }

    /** Re-render the items tree after a "Show Non-Matching
     *  Annotations / Attachments" display toggle.
     *
     *  Fast path (no quick search active): every child row —
     *  attachments under regular items, annotations under
     *  attachments — is ALREADY present in `_rows`. Zotero's
     *  `getChildItems` (and our wrap) only prunes children while a
     *  search is running; with just a Weavero filter the non-matching
     *  children sit in `_rows`, hidden purely by the keep pass. So
     *  re-running `_applyItemsListFilter` (which rebuilds the keep set
     *  against the new pref) is enough — and it skips the 240-550ms
     *  full `rp.refresh()` row rebuild that the toggle used to do.
     *
     *  Slow path (quick search active): the non-matching children
     *  WERE pruned from `_rows` at expansion time, so they must be
     *  reloaded with a real refresh before the keep pass can surface
     *  them; the tree is hidden across the refresh to avoid showing
     *  the brief unfiltered intermediate state.
     *
     *  V9-COMPAT: `itemsView.rowProvider || itemsView` — v9 has no
     *  rowProvider; search state and `refresh()` live on the
     *  itemsView. */
    async _refreshForDisplayToggle() {
        const win = Zotero.getMainWindow();
        const iv: any = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        if (!iv) return;
        const rp: any = iv.rowProvider || iv;
        const searchMode = !!(rp && (rp.searchMode || rp._searchMode));
        if (!searchMode) {
            // Fast path — re-key the existing rows; no rebuild.
            this._suppressTreeObserverUntil = 0;
            this._filterApplying = false;
            try { this._applyItemsListFilter({ cascade: true }); }
            catch (e) {}
            return;
        }
        // Slow path — search pruned the children from `_rows`, so a
        // full refresh is required to reload them.
        this._suppressTreeObserverUntil = Date.now() + 1500;
        // V9-COMPAT element id (see note above) — `iv.id` resolves on
        // both versions; `item-tree-main` is the v10 fallback.
        const treeEl = win.document.getElementById(iv.id)
            || win.document.getElementById("item-tree-main");
        let prevVis = "";
        if (treeEl) {
            prevVis = treeEl.style.visibility;
            treeEl.style.visibility = "hidden";
        }
        try {
            if (iv.rowProvider
                && typeof iv.rowProvider.refresh === "function") {
                await iv.rowProvider.refresh({ restoreSelection: true });
            } else if (typeof iv.refresh === "function") {
                await iv.refresh({ restoreSelection: true });
            }
            this._suppressTreeObserverUntil = 0;
            this._filterApplying = false;
            try { this._applyItemsListFilter({ cascade: true }); }
            catch (e) {}
        } catch (e) {
            Zotero.debug(
                "[Weavero] display-toggle refresh err: " + e);
        } finally {
            if (treeEl) treeEl.style.visibility = prevVis;
        }
    }

    /** Apply the active filter at the data layer by monkey-patching
     *  `itemsView.getRow` and `itemsView.getRowCount`. The virtualized
     *  table reads row count + row data through these — patching them
     *  yields a real filtered view (no gaps, scroll geometry intact),
     *  the same approach Zotero's quick search uses underneath.
     *
     *  Steps on filter activation:
     *    1. Save the original methods on the items view.
     *    2. Auto-expand every container whose subtree contains a
     *       matching annotation, so the matching annotations actually
     *       exist as rows in `_rows`.
     *    3. Build a filtered-index array: matching annotations + their
     *       ancestors (so the tree structure stays valid).
     *    4. Replace `getRow(filteredIdx)` with a lookup through that
     *       array, and `getRowCount()` with its length.
     *    5. Invalidate the tree so it re-renders against the new
     *       count + row data.
     *
     *  On filter clear, restore the saved originals and re-invalidate. */
    /** Retry a cascade-carrying apply that a guard bounced. Coalesced (one
     *  pending timer), bounded (gives up ~3s after the LAST bounce), and
     *  reload-proof: the callback resolves the live plugin and re-checks the
     *  guards, re-arming while they still block. */
    _wvScheduleCascadeRetry() {
        try {
            (this as any)._wvCascadeRetryUntil = Date.now() + 3000;
            if ((this as any)._wvCascadeRetryTimer) return;   // already pending
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            (this as any)._wvCascadeRetryTimer = setT(() => {
                const P: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                if (!P || P !== this) return;                  // stale instance
                (this as any)._wvCascadeRetryTimer = null;
                if (Date.now() > (this as any)._wvCascadeRetryUntil) return;
                if (this._filterApplying
                    || ((this as any)._suppressTreeObserverUntil
                        && Date.now() < (this as any)._suppressTreeObserverUntil)) {
                    this._wvScheduleCascadeRetry();            // still blocked
                    return;
                }
                try { this._applyItemsListFilter({ cascade: true }); } catch (e) {}
            }, 150);
        } catch (e) {}
    }

    _applyItemsListFilter(opts?) {
        // Any EXTERNAL apply while a quick search is live also deserves a
        // final pass at quiescence (a chip applied mid-settle races the
        // same rebuild). Internal applies set `_wvViaSetFilter` — among
        // them the final apply itself — and must NOT re-arm, or the
        // observer cycle described in _wvArmFinalApply would loop.
        try {
            if (!(this as any)._wvViaSetFilter) {
                const _w0 = Zotero.getMainWindow();
                const _sb0: any = _w0 && _w0.document
                    && _w0.document.getElementById("zotero-tb-search");
                if (_sb0 && _sb0.value && String(_sb0.value).trim()) {
                    this._wvArmFinalApply();
                }
            }
        } catch (e) {}
        // Toggle-in-progress: when the Show Non-Matching * toggle
        // handler is running its async `rp.refresh()`, Zotero's own
        // pref-observer + refresh path triggers multiple setFilter
        // callbacks, each of which would normally call us with
        // `cascade: true` via the setFilter wrap. Those redundant
        // applies produce the visible flicker even though their
        // result is identical (same keep[]). Skip the apply while
        // the toggle is in flight; the toggle's own trailing
        // `_applyItemsListFilter()` is what rebuilds keep[] once.
        if ((this as any)._suppressTreeObserverUntil
            && Date.now() < (this as any)._suppressTreeObserverUntil) {
            // A DELIBERATE apply (cascade) bounced here must not lose its
            // cascade intent: dropping it leaves the filter itself correct
            // (the observer reapply catches up, sans cascade) but the
            // matching children stay collapsed -- two chips clicked in quick
            // succession showed 2 closed book rows instead of the expanded
            // annotations (2026-08-04). Park the intent and retry shortly.
            if (opts && opts.cascade) this._wvScheduleCascadeRetry();
            return;
        }
        // Guard — `tree.invalidate()` re-renders rows, which fires the
        // tree mutation observer that calls us back. Without this we'd
        // recurse on every filter apply.
        //
        // Catch the missed reapply: when search is active the cascade
        // can take ~600ms, and observer fires during that window all
        // bail. If the LAST mutation arrived while we were still
        // running, the keep[] we just built may already be stale —
        // _rows kept growing after our Pass 2 snapshot. Mark "dirty"
        // when a reapply is requested but bounced by the guard, and
        // run one more after the timeout if so.
        if (this._filterApplying) {
            // Don't mark dirty while our own apply is running. The
            // dirty mechanism was originally intended to catch
            // "Zotero added rows during our apply" — but in practice
            // our own `tree.invalidate()` produces DOM mutations
            // that the MutationObserver picks up as childList
            // changes, and those would mark dirty and trigger a
            // retry, whose `tree.invalidate()` produces more
            // mutations, etc. — a runaway loop (122 reapplies
            // observed in dev.24 logs). If Zotero genuinely adds
            // rows during apply, the next observer fire (after
            // _filterApplying clears + the 80ms quiet) will catch
            // them.
            //
            // But a deliberate CASCADE apply must not be silently
            // swallowed — same reasoning as the suppression guard above.
            if (opts && opts.cascade) this._wvScheduleCascadeRetry();
            // A NON-cascade bounce is usually safe to drop (the comment
            // above), but not when it was the only apply that would have
            // seen the settled row count: `keep` then keeps a watermark
            // that no longer matches `_rows.length`, and the filter shows
            // as active while displaying an unfiltered list. Arm the
            // stale-keep check — a no-op unless that actually happened.
            else this._wvScheduleStaleKeepRetry();
            return;
        }
        // ---- Order-B fix (approach a, flickery — see work/TODO.md) ----
        // A deliberate filter change (cascade) while BOTH a quick search
        // and a Weavero filter are active must re-run getChildItems so a
        // chip-matching annotation the search alone dropped gets re-added
        // (e.g. a starred annotation under a "Test"-matching item, when
        // the tag chip is applied AFTER the search). A chip-apply doesn't
        // rebuild the rows, so re-route through the wrapped setFilter,
        // which collapses + re-expands the containers and re-invokes
        // getChildItems with the chip active. Narrowly gated (search AND
        // filter active); the _wvViaSetFilter guard (set around the wrap's
        // own re-apply) keeps it from looping. Cost: a visible tree
        // re-render on such chip changes. TODO: a non-flickery re-invoke.
        try {
            const _win = Zotero.getMainWindow();
            const _sb: any = _win && _win.document
                .getElementById("zotero-tb-search");
            const _live = (_sb && _sb.value) ? String(_sb.value).trim() : "";
            const _iv: any = _win && _win.ZoteroPane && _win.ZoteroPane.itemsView;
            if (opts && opts.cascade && _live
                && !this._wvViaSetFilter && !this._collectionSwapping
                && _iv && typeof _iv.setFilter === "function"
                && this._isFilterActive(this._filterState)
                // Parent-level chips must NOT re-route: the rebuild drops
                // items that match the search directly. See
                // _wvFilterTargetsChildren for the measurements.
                && this._wvFilterTargetsChildren()) {
                _iv.setFilter("search", _live);
                return;
            }
        } catch (e) {}
        this._filterApplying = true;
        this._filterApplyDirty = false;
        this._filterApplyDirtyCascade = !!(opts && opts.cascade);
        // Capture the selected items BEFORE the inner apply rebuilds
        // `keep` — at this point `getRow` still translates through the
        // OLD keep, so `getSelectedItems()` resolves to the genuine
        // current selection. After the rebuild those filtered indices
        // would point at different items (or past the new tail).
        // Make sure Zotero's own pre-mutation capture point is mirrored before
        // we read the selection (idempotent; cheap when already wired).
        try {
            const _w = Zotero.getMainWindow();
            const _iv2 = _w && _w.ZoteroPane && _w.ZoteroPane.itemsView;
            this._wvPatchCacheStateForSelection(_iv2);
            // Same idea one level earlier: capture on every genuine
            // selection change, so the snapshot is fresh even when no
            // row mutation has run since the last apply.
            this._wvPatchSelectionChangeForCapture(_iv2);
        } catch (e) {}
        const prevSelectedIDs = this._captureSelectedItemIDs();
        try {
            this._applyItemsListFilterInner(opts);
            // Reconcile selection against the freshly-filtered view:
            // re-select the items that still match (at their new
            // indices) and drop the ones the filter excluded. Mirrors
            // Zotero's quick-search behaviour — a selected item that
            // no longer matches leaves nothing selected.
            try { this._reconcileSelectionAfterFilter(prevSelectedIDs); }
            catch (e) {}
        }
        finally {
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) || setTimeout;
            // Set a post-apply observer-suppression window. The
            // `tree.invalidate()` call inside the inner apply produces
            // DOM mutations that arrive ASYNCHRONOUSLY over the next
            // ~100-200ms. Without this window each batch of mutations
            // would trigger another apply, whose own invalidate would
            // produce more mutations, etc. — a runaway loop. The
            // window covers the tail-end mutations so the observer
            // ignores them; the next genuine user-initiated mutation
            // (a click, a search) lands after the window and fires
            // a fresh apply normally.
            //
            // Skipped if a toggle handler set a longer window (we
            // preserve whichever is later).
            const post = Date.now() + 300;
            if (!(this as any)._suppressTreeObserverUntil
                || (this as any)._suppressTreeObserverUntil < post) {
                (this as any)._suppressTreeObserverUntil = post;
            }
            setT(() => {
                this._filterApplying = false;
            }, 80);
        }
    }

    /** Snapshot the IDs of the items currently selected in the items
     *  tree. Read THROUGH the live (pre-rebuild) `getRow` translation,
     *  so it returns the genuine selected items rather than whatever
     *  the raw indices map to. */
    /** Item ids of the current selection, or `null` when they cannot be
     *  resolved trustworthily — the caller must then leave the selection
     *  alone rather than reconcile against a bogus list.
     *
     *  `getSelectedItems()` resolves selection INDICES (filtered space)
     *  through `getRow`. While `keep` is stale -- `rp._rows.length` no
     *  longer matches the watermark taken when it was built -- `getRow`
     *  deliberately passes indices through untranslated, so those same
     *  indices resolve against the RAW rows and hand back entirely
     *  different items. Reconciling against that list finds none of the
     *  "previous" ids in the new view and clears the selection outright.
     *  Seen 2026-08-04: three journal articles selected, colored tag
     *  applied (correctly, to those three), and the selection vanished --
     *  the capture had returned three unrelated ids because Zotero's own
     *  row-model update had just changed `_rows.length` mid-flight.
     *  Zotero itself never has this problem: its `_cachedSelection` is a
     *  list of OBJECTS and `_restoreSelection` maps them back through
     *  `_rowMap` by id, never by index. */
    _captureSelectedItemIDs() {
        try {
            const win = Zotero.getMainWindow();
            const ZP = win && win.ZoteroPane;
            if (!ZP || typeof ZP.getSelectedItems !== "function") return [];
            const iv: any = ZP.itemsView;
            const rp: any = iv && (iv.rowProvider || iv);
            // TIMING DISCIPLINE (2026-08-04). Prefer the identity snapshot
            // taken at Zotero's own safe points over deriving ids here.
            // `_wvNoteSafeSelection` records it from `itemTree._cacheState()`,
            // which Zotero calls synchronously at the top of every
            // row-mutating operation -- before `_rows` is touched, so the
            // index->item mapping is coherent by construction. Deriving at
            // reapply time is not safe: a reapply is often triggered BY a
            // mutation already in flight.
            const safe = this._wvSafeSelIDs;
            if (safe && safe.ids && safe.ids.length
                    && safe.selCount === (iv && iv.selection && iv.selection.count)) {
                // Same number of rows selected as when the snapshot was taken
                // => it still describes this selection.
                //
                // NOT consumed since 2026-08-07. It used to be nulled here,
                // on the reasoning that a later user selection of the same
                // SIZE could otherwise be answered with these older ids.
                // `_wvPatchSelectionChangeForCapture` now re-records on every
                // genuine selection change, so a same-size later selection
                // overwrites the snapshot instead of inheriting it — and
                // keeping it closes the window where two applies in a row
                // left the second with nothing, forcing the lossy
                // clear-the-selection path.
                return safe.ids.slice();
            }
            this._wvSafeSelIDs = null;
            if (rp && rp._wvKeepRowsLen != null && rp._rows
                    && rp._rows.length !== rp._wvKeepRowsLen) {
                return null;   // stale mapping — any id we read would be a lie
            }
            return ZP.getSelectedItems().map((it: any) => it.id);
        } catch (e) {
            return [];
        }
    }

    /** Record the selection by identity at a moment the mapping is known
     *  coherent. Called from the `_cacheState` wrap (Zotero's own pre-mutation
     *  capture point) and after a completed reconcile, where the view was just
     *  rebuilt. `selCount` stamps how many rows were selected then, so a later
     *  capture can tell whether the snapshot still describes the selection. */
    /** Rebuild `keep` when the watermark no longer describes the live rows.
     *
     *  The keep array maps FILTERED indices onto a snapshot of `_rows`, and
     *  `getRow` deliberately degrades to pass-through (i.e. shows the
     *  UNFILTERED view) whenever `_rows.length` has moved since. That guard
     *  prevents wrong-row lookups, but nothing rebuilt `keep` afterwards, so
     *  the degraded state persisted until the user happened to trigger
     *  another apply — the filter looked active and did nothing (2026-08-07:
     *  clearing a quick search with a chip on; write-up in
     *  work/bug-filter-lost-after-search-clear.md).
     *
     *  WHERE IT COMES FROM (traced 2026-08-08, after two fixes aimed at the
     *  wrong place): the apply that WOULD have refreshed the watermark is
     *  dropped by the `_filterApplying` re-entrancy guard. The trace reads
     *  `apply cascade=false applying=true wm 18780 rows 18782` — a
     *  non-cascade bounce, so it does not even get `_wvScheduleCascadeRetry`,
     *  and the bounce site's promise that "the next observer fire will catch
     *  them" does not hold, because by then the only remaining mutations are
     *  Weavero's own suppressed ones.
     *
     *  WHY THIS CANNOT RUN AWAY (the 122-reapply loop of dev.24 is the
     *  cautionary tale): the trigger is `watermark !== _rows.length`, which
     *  is SELF-CLEARING — one successful rebuild makes it false and the
     *  retry becomes a no-op. The 4s episode deadline is only a backstop for
     *  a pathological never-settling view, and it degrades to exactly
     *  today's behaviour.
     *
     *  `cascade: false` deliberately: expansion is already in place from the
     *  apply that did run, only `keep` needs rebuilding — and a cascade
     *  would re-enter the Order-B setFilter re-route while a search is
     *  live. */
    /** Is Zotero's row set INCOMPLETE for the live search?
     *
     *  Invariant: while a quick search is active, every id in
     *  `searchParentIDs` must have a raw row — those are precisely the
     *  parents Zotero itself decided to show because a descendant
     *  matched. A missing one means the row set was built against an
     *  incomplete match set and never corrected.
     *
     *  Safe against build mode: `filterBuildMode` constructs `_rows`
     *  itself, which would make this fire constantly — but build mode
     *  DEliberately falls back to the cascade path whenever a live quick
     *  search is present, so during a search `_rows` is always Zotero's
     *  own array and contains search rows regardless of the chip.
     *
     *  Uses `searchParentIDs` and NOT `searchItemIDs`: the latter also
     *  holds child items, which legitimately have no row while their
     *  parent is collapsed, so checking it would false-positive on
     *  almost every collapsed view. */
    _wvSearchCoverageIncomplete(rp: any): boolean {
        try {
            if (!rp || !rp._rows) return false;
            const sm = rp.searchMode || rp._searchMode;
            if (!sm) return false;
            const pIDs = rp.searchParentIDs || rp._searchParentIDs;
            if (!pIDs || typeof pIDs.has !== "function" || !pIDs.size) return false;
            const have = new Set();
            for (const row of rp._rows) {
                if (row && row.ref && row.ref.id != null) have.add(row.ref.id);
            }
            // (a) MISSING: a parent Zotero said to show has no row.
            for (const id of pIDs) {
                if (!have.has(id)) return true;
            }
            // (b) STALE: a TOP-LEVEL row that the live search does not
            //     justify at all. Measured 9 Aug 2026 on the `prewetting`
            //     repro: chip-then-search produced 10 such rows —
            //     leftovers from the chip-only state that the search
            //     rebuild never cleared — alongside one missing item.
            //     Checking (a) alone missed this entirely, and also missed
            //     a missing SELF-match, which lives in `searchItemIDs`
            //     rather than `searchParentIDs`.
            //
            //     Top-level only: child rows can legitimately be shown
            //     unmatched (the Show Non-Matching Attachments /
            //     Annotations toggles), whereas a top-level row always
            //     needs a justification while a search is active.
            const sIDs = rp.searchItemIDs || rp._searchItemIDs;
            if (sIDs && typeof sIDs.has === "function") {
                const rows = rp._rows;
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || !row.ref || row.ref.id == null) continue;
                    if ((row.level || 0) !== 0) continue;
                    const id = row.ref.id;
                    if (!sIDs.has(id) && !pIDs.has(id)) return true;
                }
            }
            return false;
        }
        catch (e) { return false; }
    }

    /** LAST-WRITER-AT-QUIESCENCE: one authoritative re-apply after a live
     *  quick search has fully settled.
     *
     *  Why this shape (11 Aug 2026, after five failed point-fixes): the
     *  filter has several independent reapply triggers (MutationObserver,
     *  cascade retry, stale-keep retry, the setFilter microtask apply) and
     *  they race Zotero's async multi-stage search rebuild. Gating any ONE
     *  of them just changes which one loses the race — a gated build still
     *  produced a poisoned keep from an UNgated trigger. But correctness
     *  only requires the LAST apply to run on settled state: an apply at
     *  true quiescence overwrites any earlier poison (proven by the manual
     *  probe — a plain re-apply on quiet rows always yields the correct
     *  view). So nothing is rerouted or removed; this adds a guaranteed
     *  final pass per search event.
     *
     *  Quiescence = `_rows.length` AND both search-set sizes unchanged for
     *  4 consecutive 200ms ticks. The sets are part of the signature
     *  because one poisoned run had FRESH keep over WRONG verdicts — the
     *  apply had raced the sets, not the rows.
     *
     *  Loop safety: `_wvFALastSig` persists on the plugin ACROSS episodes.
     *  The final apply's own invalidate fires the MutationObserver, whose
     *  reapply re-arms this scheduler; with the signature unchanged the
     *  new episode ends without applying, so there is no apply/observe
     *  cycle. Bounded further by a 30s deadline and 3 applies/episode. */
    _wvArmFinalApply(isSearchEvent?: boolean) {
        try {
            // A genuine SEARCH EVENT must always get a final apply, even
            // when the resulting state SIGNATURE matches the previous
            // search's. Found via MJT's repro (15 Aug 2026): chip ->
            // search -> clear -> SAME search again. The second search
            // rebuilt rows and the intermediate applies computed verdicts
            // against half-built search sets — but the settled signature
            // (rows/setsizes) was identical to the first search's, so the
            // persisted `_wvFALastSig` made the scheduler skip its
            // authoritative pass and the poisoned verdicts became
            // permanent (identical lastSig across both cycles, view stuck
            // one item short with a fresh watermark). Same signature is
            // NOT the same state: verdicts are not in the signature.
            //
            // External applies (site 2 — observer reapplies etc.) keep
            // the persistence: that is what terminates the apply ->
            // invalidate -> observer -> re-arm cycle.
            if (isSearchEvent) delete (this as any)._wvFALastSig;
            (this as any)._wvFA = { until: Date.now() + 30000, sig: "", stable: 0, applies: 0 };
            // HOLD: while this episode is watching, intermediate repairs
            // are pointless — the final apply overwrites them — and each
            // one repaints the tree. Measured 15 Aug 2026 on the
            // prewetting repro: 10 applies / 9 invalidates in the settle
            // window, one every ~450ms (the user reported it as
            // flickering). The stale-keep retry defers while this is set.
            (this as any)._wvFAHold = true;
            if ((this as any)._wvFATimer) return;          // tick loop already running
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) ? win.setTimeout.bind(win) : setTimeout;
            const tick = () => {
                (this as any)._wvFATimer = null;
                try {
                    const P: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    if (!P || P !== this) return;                       // stale instance
                    const st: any = (this as any)._wvFA;
                    if (!st || Date.now() > st.until) {
                        (this as any)._wvFAHold = false;                // episode over
                        return;
                    }
                    const w2 = Zotero.getMainWindow();
                    const iv: any = w2 && w2.ZoteroPane && w2.ZoteroPane.itemsView;
                    const rp: any = iv && (iv.rowProvider || iv);
                    if (!rp) { (this as any)._wvFAHold = false; return; }
                    if (!this._isFilterActive(this._filterState)) {
                        (this as any)._wvFAHold = false;
                        return;
                    }
                    const sb: any = w2 && w2.document
                        && w2.document.getElementById("zotero-tb-search");
                    if (!(sb && sb.value && String(sb.value).trim())) {
                        (this as any)._wvFAHold = false;                // search gone
                        return;
                    }
                    if (this._filterApplying
                        || ((this as any)._suppressTreeObserverUntil
                            && Date.now() < (this as any)._suppressTreeObserverUntil)) {
                        (this as any)._wvFATimer = setT(tick, 200);     // blocked — wait
                        return;
                    }
                    const sIDs: any = rp.searchItemIDs || rp._searchItemIDs;
                    const pIDs: any = rp.searchParentIDs || rp._searchParentIDs;
                    const sig = ((rp._rows && rp._rows.length) || 0)
                        + "/" + ((sIDs && sIDs.size) || 0)
                        + "/" + ((pIDs && pIDs.size) || 0);
                    if (sig !== st.sig) {
                        st.sig = sig; st.stable = 0;
                        (this as any)._wvFATimer = setT(tick, 200);
                        return;
                    }
                    st.stable++;
                    if (st.stable < 4) {
                        (this as any)._wvFATimer = setT(tick, 200);
                        return;
                    }
                    // QUIESCENT. Apply exactly once per distinct state.
                    if ((this as any)._wvFALastSig === sig) {
                        (this as any)._wvFAHold = false;                // done
                        return;
                    }
                    if (st.applies >= 3) return;                        // backstop
                    st.applies++; st.stable = 0;
                    (this as any)._wvFALastSig = sig;
                    dbg("[Weavero][filter] final apply at quiescence (" + sig + ")");
                    const wasVia = (this as any)._wvViaSetFilter;
                    (this as any)._wvViaSetFilter = true;   // internal — no Order-B, no self-arm
                    try { this._applyItemsListFilter({ cascade: true }); }
                    finally { (this as any)._wvViaSetFilter = wasVia; }
                    (this as any)._wvFATimer = setT(tick, 200);         // confirm round
                } catch (e) { dbg("[Weavero][filter] finalApply err: " + e); }
            };
            (this as any)._wvFATimer = setT(tick, 200);
        } catch (e) {}
    }

    _wvScheduleStaleKeepRetry() {
        try {
            const now = Date.now();
            // Do NOT extend an episode already in flight — otherwise each
            // re-arm pushes the deadline out and the bound is meaningless.
            if (!(this as any)._wvStaleKeepUntil
                || now > (this as any)._wvStaleKeepUntil) {
                (this as any)._wvStaleKeepUntil = now + 4000;
            }
            if ((this as any)._wvStaleKeepTimer) return;       // already pending
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout)
                ? win.setTimeout.bind(win) : setTimeout;
            (this as any)._wvStaleKeepTimer = setT(() => {
                (this as any)._wvStaleKeepTimer = null;
                try {
                    const P: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    if (!P || P !== this) return;              // stale instance
                    if (Date.now() > (this as any)._wvStaleKeepUntil) return;
                    if (this._filterApplying
                        || ((this as any)._suppressTreeObserverUntil
                            && Date.now()
                                < (this as any)._suppressTreeObserverUntil)) {
                        this._wvScheduleStaleKeepRetry();      // still blocked
                        return;
                    }
                    // Defer to the final-apply scheduler: while its episode
                    // is watching, acting here only adds repaints that the
                    // final apply overwrites (the ~450ms flicker storm).
                    // Re-arm rather than act; when the hold clears — final
                    // apply landed, search gone, or 30s deadline — this
                    // retry resumes its normal duties (the dev.29 clear
                    // path does not raise the hold at all).
                    if ((this as any)._wvFAHold) {
                        this._wvScheduleStaleKeepRetry();
                        return;
                    }
                    const w2 = Zotero.getMainWindow();
                    const iv: any = w2 && w2.ZoteroPane && w2.ZoteroPane.itemsView;
                    const rp: any = iv && (iv.rowProvider || iv);
                    if (!rp) return;
                    // Nothing to restore if no filter is meant to be on.
                    if (!this._isFilterActive(this._filterState)) return;
                    // PATCH MISSING is a REPAIR trigger, not a reason to
                    // bail. A search refresh legitimately removes the
                    // accessors and the follow-up apply re-installs them
                    // (observed: patched false -> true ~3.6s into a
                    // search). Intermittently that re-install never
                    // happens and the view is left completely unfiltered
                    // while the chip still reads as active — reproduced
                    // 4/8 on 9 Aug 2026. The original guard here returned
                    // early in exactly that state, so the one helper able
                    // to repair it opted out.
                    const missing = !rp._wvOrigGetRow;
                    const live = (rp._rows && rp._rows.length) || 0;
                    // THIRD trigger: Zotero's own row set is incomplete for
                    // the live search. Distinct from the two above — the
                    // patch can be installed and `keep` perfectly fresh
                    // while `_rows` itself is missing a parent Zotero said
                    // to show. Repairing that needs a ROW rebuild, which
                    // only re-issuing the search filter can produce; a
                    // plain re-apply would faithfully re-translate the
                    // same incomplete rows.
                    const coverage = this._wvSearchCoverageIncomplete(rp);
                    const staleKeep = rp._wvKeepRowsLen !== live;
                    if (!missing && !coverage && !staleKeep) return;  // fresh — done
                    // ORDER MATTERS. A stale keep or a missing patch means
                    // the CHIP is not being applied at all — `getRow` falls
                    // through untranslated and the view shows Zotero's raw
                    // search rows. Repair that FIRST with a re-apply.
                    //
                    // Measured 9 Aug 2026 on the `prewetting` repro: 78 raw
                    // top-level rows shown where the chip should leave 69,
                    // with `keepFresh: false` and every row legitimately
                    // justified by the search (`unjustifiedTopRaw: 0`). The
                    // first version of this branch re-issued the SEARCH on
                    // any coverage complaint and returned, which rebuilt
                    // the rows, re-staled the keep, and never re-applied —
                    // so the chip stayed off. Re-issuing the search is only
                    // right when the keep is already fresh and Zotero's own
                    // row set is genuinely short.
                    if (coverage && !missing && !staleKeep) {
                        const sb2: any = w2 && w2.document
                            && w2.document.getElementById("zotero-tb-search");
                        const term = (sb2 && sb2.value) ? String(sb2.value) : "";
                        if (term && iv && typeof iv.setFilter === "function") {
                            dbg("[Weavero][filter] search coverage incomplete"
                                + " — forcing a row rebuild");
                            const wasVia = this._wvViaSetFilter;
                            this._wvViaSetFilter = true;   // don't re-enter Order-B
                            try { iv.setFilter("search", term); }
                            catch (e) {}
                            finally { this._wvViaSetFilter = wasVia; }
                            this._wvScheduleStaleKeepRetry();
                            return;
                        }
                    }
                    dbg("[Weavero][filter] " + (missing ? "PATCH MISSING" : "stale keep")
                        + " after bounced apply"
                        + " (watermark " + rp._wvKeepRowsLen + " vs rows "
                        + live + ") — rebuilding");
                    try { this._applyItemsListFilter({ cascade: false }); }
                    catch (e) {}
                    // Rows can drift again while THAT apply runs; re-arming
                    // is safe because the condition is self-clearing.
                    this._wvScheduleStaleKeepRetry();
                } catch (e) {
                    dbg("[Weavero][filter] staleKeepRetry err: " + e);
                }
            }, 200);
        } catch (e) {}
    }

    _wvNoteSafeSelection(ids: any[], selCount: number) {
        try {
            this._wvSafeSelIDs = { ids: (ids || []).slice(), selCount };
        } catch (e) {}
    }

    /** Wrap `itemsView._handleSelectionChange` so the safe snapshot is
     *  refreshed on EVERY genuine selection change, not only at Zotero's
     *  row-mutation capture points (2026-08-07).
     *
     *  Why: `_captureSelectedItemIDs` returns null when the keep mapping
     *  is stale, and the reconcile then CLEARS the selection rather than
     *  leave it pointing at the wrong items. That is safe but lossy, and
     *  it was reachable whenever no `_cacheState()` had run since the
     *  snapshot was last consumed — e.g. two applies in a row. Recording
     *  here closes that window: the change arrives from the rendered
     *  view, so the index->item mapping is coherent by construction,
     *  which is exactly the condition the null path exists to detect.
     *
     *  Only fires for changes Zotero actually reports: our own reconcile
     *  runs under `selectEventsSuppressed`, so it cannot feed itself.
     *  Skipped above a size cap — resolving ids costs a getRow per row,
     *  and a select-all would pay it on every keystroke; huge selections
     *  keep the previous (derive-or-clear) behaviour. */
    _wvPatchSelectionChangeForCapture(itemsView: any) {
        try {
            if (!itemsView
                || typeof itemsView._handleSelectionChange !== "function") return;
            if (itemsView._wvSelChangeWired === 1) return;
            const orig = itemsView._handleSelectionChange.bind(itemsView);
            const CAP = 500;
            itemsView._handleSelectionChange = function (selection: any, debounce: any) {
                try {
                    const P: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    const rp: any = itemsView.rowProvider || itemsView;
                    // Same coherence test the null path uses.
                    const coherent = !(rp && rp._wvKeepRowsLen != null && rp._rows
                        && rp._rows.length !== rp._wvKeepRowsLen);
                    const count = itemsView.selection ? itemsView.selection.count : 0;
                    if (P && coherent && count > 0 && count <= CAP) {
                        const w = Zotero.getMainWindow();
                        const ids = w && w.ZoteroPane
                            ? w.ZoteroPane.getSelectedItems().map((it: any) => it.id)
                            : [];
                        if (ids.length) P._wvNoteSafeSelection(ids, count);
                    }
                } catch (e) {}
                return orig(selection, debounce);
            };
            itemsView._wvSelChangeWired = 1;
        } catch (e) {
            Zotero.debug("[Weavero] _wvPatchSelectionChangeForCapture err: " + e);
        }
    }

    /** Wrap `itemTree._cacheState()` so every safe capture Zotero takes is
     *  mirrored into `_wvSafeSelIDs`. Zotero's `_cachedSelection` holds row
     *  OBJECTS and is consumed (emptied) by `_restoreSelection`, so we keep
     *  our own copy of the ids. Versioned + idempotent per itemsView. */
    _wvPatchCacheStateForSelection(itemsView: any) {
        try {
            if (!itemsView || typeof itemsView._cacheState !== "function") return;
            if (itemsView._wvCacheStateWired === 1) return;
            const orig = itemsView._cacheState.bind(itemsView);
            itemsView._cacheState = function () {
                const r = orig();
                try {
                    const P: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
                    const cached = itemsView._cachedSelection || [];
                    if (P && cached.length) {
                        P._wvNoteSafeSelection(
                            cached.map((o: any) => (o && (o.id != null ? o.id : o.treeViewID))),
                            itemsView.selection ? itemsView.selection.count : cached.length);
                    }
                } catch (e) {}
                return r;
            };
            itemsView._wvCacheStateWired = 1;
        } catch (e) {
            Zotero.debug("[Weavero] _wvPatchCacheStateForSelection err: " + e);
        }
    }

    /** After a filter apply rebuilds the filtered view, re-establish
     *  the selection by item identity: keep the previously-selected
     *  items that still MATCH the filter (re-pointed at their new
     *  filtered indices) and drop the ones the filter excluded. When
     *  none survive, the selection is left empty — mirroring Zotero's
     *  quick search, where filtering out the selected item leaves
     *  nothing selected. Only runs while a Weavero filter is active;
     *  with no filter the keep array is identity so indices don't
     *  shift and the native selection stays correct on its own.
     *
     *  "Matches" = `_rowIsPrimary` (a white/selectable row). A row
     *  kept only as a dimmed ancestor/context container is NOT a
     *  match, so selecting one and then filtering deselects it. */
    _reconcileSelectionAfterFilter(prevSelectedIDs) {
        // `null` = the capture could not be trusted (stale keep mapping).
        // We used to `return` here, reasoning that leaving the live
        // selection untouched is "always safer". IT IS NOT (measured
        // 2026-08-07, Zotero 10.0-beta.23): selection is held as ROW
        // INDICES and this filter REMAPS what each index shows, so
        // leaving them alone means they silently resolve to DIFFERENT
        // items — indices [0,1,5] meant 60867/60862/60781 before the
        // apply and 60867/60862/60773 after it, i.e. the user ends up
        // with an item selected that they never picked, and the item
        // pane shows the wrong thing. "Do nothing" is only neutral when
        // indices keep their meaning.
        //
        // So when there is no trustworthy "before" snapshot we CLEAR the
        // selection instead of leaving it.
        //
        // Re-resolving from the post-apply view was tried first and does
        // NOT work (measured): a stale index often lands on a row that
        // legitimately matches the filter — index 5 held the dropped book
        // before the apply and a journal article after it — so "keep the
        // indices whose row is a primary match" happily keeps an item the
        // user never picked. Without a trusted before-state there is no
        // way to tell "was selected" from "is merely sitting there now",
        // so the only honest options are to clear or to fabricate. We
        // clear: losing a selection is recoverable and visible; silently
        // selecting the wrong items is neither.
        const untrusted = prevSelectedIDs === null;
        const state = this._filterState;
        if (!state || !this._isFilterActive(state)) return;
        const win = Zotero.getMainWindow();
        const iv: any = win && win.ZoteroPane && win.ZoteroPane.itemsView;
        if (!iv || !iv.selection || typeof iv.getRowCount !== "function") {
            return;
        }
        const count = iv.getRowCount();
        // Map each visible PRIMARY (matching) item → its new filtered
        // index. Non-primary rows (dimmed context) are intentionally
        // excluded so they can't hold the selection.
        // Prefer the primary set pass 2 just published (2026-08-07): it
        // computed exactly these verdicts moments ago, and recomputing
        // them here cost a `_rowIsPrimary` per filtered row — 400-600ms
        // on large parent filters, more than the apply itself. Falls back
        // to deriving when the stamp does not match this view/state (a
        // different apply, or none yet), so behaviour is unchanged.
        const published = this._wvLastPrimaryIDs;
        let primarySet: Set<number> | null = null;
        try {
            const sigNow = this._wvFilterStateSig(win, iv);
            if (published && published.sig === sigNow && published.ids) {
                primarySet = published.ids;
            }
        } catch (e) {}
        const idxById = new Map<any, number>();
        for (let i = 0; i < count; i++) {
            let row: any;
            try { row = iv.getRow(i); } catch (e) { continue; }
            if (!row || !row.ref || row.ref.id == null) continue;
            let primary = false;
            if (primarySet) {
                primary = primarySet.has(row.ref.id);
            }
            else {
                try { primary = this._rowIsPrimary(row.ref, state); }
                catch (e) {}
            }
            if (primary) idxById.set(row.ref.id, i);
        }
        // `untrusted` => targetIdx stays empty => the selection is cleared
        // below (see the reasoning at the top of this method).
        const targetIdx: number[] = [];
        if (!untrusted) {
            for (const id of (prevSelectedIDs || [])) {
                if (idxById.has(id)) targetIdx.push(idxById.get(id) as number);
            }
        }
        targetIdx.sort((a, b) => a - b);
        // No-op guard: if the current selection already equals the
        // surviving target set, don't churn (avoids needless select
        // events / item-pane reloads on every chip toggle).
        const cur = Array.from(iv.selection.selected || [])
            .map((n: any) => n as number)
            .sort((a: number, b: number) => a - b);
        if (cur.length === targetIdx.length
            && cur.every((v, i) => v === targetIdx[i])) {
            return;
        }
        const sel: any = iv.selection;
        const wasSuppressed = sel.selectEventsSuppressed;
        if (!wasSuppressed) sel.selectEventsSuppressed = true;
        try {
            sel.clearSelection();
            let first = true;
            for (const idx of targetIdx) {
                if (first) { sel.select(idx); first = false; }
                else { sel.toggleSelect(idx); }
            }
        } finally {
            // Unsuppressing fires the pending select event, so the
            // item pane updates to the new selection (or clears when
            // nothing survived).
            if (!wasSuppressed) sel.selectEventsSuppressed = false;
        }
    }

    /** Serialized FULL filter context: every group and dimension, the
     *  global collection/saved-search filters, quick-search value,
     *  library, and view row. Signature-keyed caches (no-op skip +
     *  verdict cache) stay correct with multiple simultaneous filters
     *  precisely because ANY change anywhere rotates this string
     *  (user constraint 2026-08-05). */
    _wvFilterStateSig(win, itemsView) {
        try {
            const qs = this._currentQuickSearchValue || "";
            const lib = this._wvSelectedLibraryID(win);
            // V10 removed ItemTree#collectionTreeRow, so this read was
            // permanently undefined and view collapsed to "?" for every
            // state — two collections with the same library + search text
            // shared a signature, letting the no-op-skip wrongly skip a
            // needed reapply (audited 15 Aug 2026). Plural first (also
            // fixes multi-collection selections, which now get distinct
            // signatures per combination); singular = v9 path.
            const ctrs: any[] = (itemsView && Array.isArray(itemsView.collectionTreeRows))
                ? itemsView.collectionTreeRows
                : ((itemsView && itemsView.collectionTreeRow)
                    ? [itemsView.collectionTreeRow] : []);
            const view = ctrs.length
                ? ctrs.map((c: any) => (c && c.id != null) ? c.id : (c && c.type))
                    .join(",")
                : "?";
            // QUICK-SEARCH INPUT THAT THE TEXT ALONE DOES NOT CAPTURE
            // (root cause of the 2026-08-07 non-determinism):
            // `_rowIsPrimary` consults the LIVE `rp.searchItemIDs` when a
            // search is active, so a verdict is a function of the search
            // RESULT SET, not just the typed text. Zotero rebuilds that
            // Set asynchronously and REPLACES the object on each refresh,
            // so verdicts cached against one refresh state were being
            // reused against another: the same user action settled at
            // 1281 rows cold and 8692 with a warm cache (measured on the
            // real library with all other plugins disabled; native search
            // alone is deterministic at 8290, so this was ours).
            // Tagging the signature with the Set's IDENTITY (a lazily
            // stamped id, not its contents — cheap) makes a rebuilt search
            // set rotate the signature and drop the stale verdicts.
            let qsTag = "";
            if (qs) {
                const rp: any = (itemsView && (itemsView.rowProvider || itemsView)) || null;
                const sIDs: any = rp && (rp.searchItemIDs || rp._searchItemIDs);
                if (sIDs) {
                    if (!sIDs._wvSigId) {
                        sIDs._wvSigId = ((Zotero as any)._wvSearchSetSeq
                            = ((Zotero as any)._wvSearchSetSeq || 0) + 1);
                    }
                    qsTag = "|s" + sIDs._wvSigId + ":" + (sIDs.size || 0);
                }
                else {
                    // Search text present but no result set yet — never
                    // cache across that transient.
                    qsTag = "|s?" + Math.random();
                }
            }
            return lib + "|" + view + "|" + qs + qsTag + "|"
                + JSON.stringify(this._filterState);
        } catch (e) {
            // Unique => never matches => caches disabled, never wrong.
            return "err|" + Math.random();
        }
    }

    /** True when every ACTIVE condition can only match at PARENT level —
     *  then the cascade auto-expand scan is pointless (no strictly-deeper
     *  primary match can exist). Conservative by construction: any
     *  child-level or cross-level condition, tri-state set to false, an
     *  excluding quick-search scope, global collection/saved-search
     *  filters, or a live quick search all return false. */
    _wvFilterParentLevelOnly(state) {
        try {
            if (!state) return false;
            if (this._currentQuickSearchValue) return false;
            if (state.collections && state.collections.length) return false;
            if (state.savedSearches && state.savedSearches.length) return false;
            const PARENT = new Set(["itemType", "itemTypeExclude",
                "hasAbstract", "hasDOI", "hasPMID", "hasPMCID", "hasURL",
                "hasAttachment", "publication", "publicationExclude",
                "readStatus", "readStatusExclude", "inOtherLibrary"]);
            for (const g of (state.groups || [])) {
                if (!g || !this._isGroupActive(g)) continue;
                for (const [k, v] of Object.entries(g)) {
                    if (v == null) continue;
                    if (Array.isArray(v) && !v.length) continue;
                    if (k === "quickSearchScope") {
                        const q = v as any;
                        if (q && (q.annotation === false
                            || q.attachment === false
                            || q.parent === false)) return false;
                        continue;
                    }
                    // Scope objects (hasTagScope etc.) only matter when
                    // their owning condition is set — which itself fails
                    // the PARENT test below.
                    if (typeof v === "object" && !Array.isArray(v)) continue;
                    if (!PARENT.has(k)) return false;
                }
            }
            return true;
        } catch (e) { return false; }
    }

    /** Null the signature-keyed caches on any data change that can move
     *  a verdict: items, tags, collection membership, saved-search
     *  definitions. Persistent-observer rules apply (live plugin resolved
     *  at event time; survives reloads via the Zotero-global id). */
    _wvWireFilterCacheInvalidator() {
        try {
            const g: any = Zotero;
            if (g._wvFilterCacheObsID) return;
            const obs = {
                notify: (_ev: string, type: string, ids: any[]) => {
                    try {
                        const lp: any = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        if (lp) {
                            lp._wvVerdictCache = null;
                            lp._wvLastApplySig = null;
                        }
                        // Per-item facets (read status, PMID/PMCID): evict
                        // per id — same module closure owns the map.
                        if (type === "item" || type === "item-tag") {
                            wvEvictFacets(ids);
                        }
                    } catch (e) { try { WV_FACETS.clear(); } catch (e2) {} }
                },
            };
            g._wvFilterCacheObsID = Zotero.Notifier.registerObserver(obs,
                ["item", "item-tag", "tag", "collection", "collection-item", "search"],
                "weavero-filter-cache", 90);
        } catch (e) {}
    }

    _wvUnwireFilterCacheInvalidator() {
        try {
            const g: any = Zotero;
            if (g._wvFilterCacheObsID) {
                try { Zotero.Notifier.unregisterObserver(g._wvFilterCacheObsID); } catch (e) {}
            }
            delete g._wvFilterCacheObsID;
        } catch (e) {}
    }

    /** Is the tiered item-pane count enabled? Default ON; the pref only
     *  exists so a user who prefers Zotero's single number can have it. */
    _wvCountBreakdownEnabled(): boolean {
        try { return Zotero.Prefs.get("weavero.itemCountBreakdown") !== false; }
        catch (e) { return true; }
    }

    /** Build the replacement for the item pane's "N items in this view".
     *
     *  Two things the single number cannot say (MJT, 2026-08-08):
     *
     *   A. WHAT is being counted. `objectRowCount` sums top-level items,
     *      attachments, notes and annotations into one figure, which is
     *      why it moves when you expand a row — the behaviour reported as
     *      a bug in forum thread 132551. Splitting the tiers makes that
     *      legible instead of surprising. Notes are their own tier rather
     *      than lumped with attachments: they are user-authored content,
     *      not a file or a derived mark.
     *
     *   B. How much of the view is a HIT. With a filter active, some rows
     *      match and others are only present to hold a matching child.
     *      Weavero already knows which is which (pass 2 publishes the
     *      primary ids), and no native surface offers this.
     *
     *  Counted through the PATCHED accessors, so the figures describe the
     *  filtered view for free. Returns null when it cannot build a
     *  trustworthy string, and the caller falls back to Zotero's own. */
    _wvBuildCountMessage(win: any, onlySelected?: boolean): any | null {
        try {
            const zp: any = win && win.ZoteroPane;
            const iv: any = zp && zp.itemsView;
            const rp: any = iv && (iv.rowProvider || iv);
            if (!rp || typeof rp.getRowCount !== "function") return null;
            const n = rp.getRowCount();
            if (!n) return null;                    // let Zotero say "No items"
            // Same box, two scopes (MJT, 9 Aug 2026): the whole view, or
            // just the SELECTION. `selection.selected` is a Set of row
            // indices (verified live), so the only difference is which
            // indices are walked -- every count, level and match rule
            // below is shared, which is the point of routing both through
            // one builder rather than writing a second one.
            let indices: any = null;
            if (onlySelected) {
                const sel: any = iv && iv.selection;
                if (!sel || !sel.selected || !sel.selected.size) return null;
                indices = [];
                for (const i of sel.selected) {
                    if (i >= 0 && i < n) indices.push(i);
                }
                if (!indices.length) return null;
            }
            // Only trust a primary set published for THIS view/state —
            // an unstamped read would report a previous filter's match
            // count against the current rows.
            let primary: any = null;
            try {
                const pub: any = this._wvLastPrimaryIDs;
                if (pub && pub.ids && this._isFilterActive(this._filterState)
                    && pub.sig === this._wvFilterStateSig(win, iv)) {
                    primary = pub.ids;
                }
            } catch (e) {}
            // POSITION, not kind (MJT, 2026-08-08). Classifying by
            // isNote()/isAttachment() conflated two independent axes and
            // drew STANDALONE notes — which are top-level rows — indented
            // as children (28 of them in the real library). Depth comes
            // from the row's actual tree level, so every tier is true by
            // construction and standalone notes/attachments land at 0.
            // MATCH SOURCES. "matching vs context" is a property of ANY
            // narrowing mechanism, not of Weavero's chips — MJT, 8 Aug
            // 2026. A row is a MATCH when it satisfies every active
            // narrowing; anything else visible is an ancestor carried
            // along to hold a match, i.e. context.
            //
            // Gate on `_searchMode`, NOT on the presence of
            // `_searchItemIDs`: measured 9 Aug 2026, that set is
            // populated with the WHOLE library (42 223 ids) when no
            // search is active, so presence proves nothing.
            //   baseline  searchMode=false  itemIDs 42223  parentIDs 18422
            //   quick     searchMode=true   itemIDs  7776  parentIDs   480
            //   advanced  searchMode=true   itemIDs 15329  parentIDs     0
            // (advanced reports 0 parents because resultLevel=item needs
            // no child context.)
            const sources: any[] = [];
            if (primary) sources.push({ label: "filter", set: primary });
            try {
                if (rp._searchMode) {
                    const sIDs = rp._searchItemIDs || rp.searchItemIDs;
                    if (sIDs && typeof sIDs.has === "function") {
                        // Quick search owns the toolbar box; anything else
                        // in search mode is the advanced-search channel.
                        const sb: any = win.document
                            && win.document.getElementById("zotero-tb-search");
                        const live = (sb && sb.value)
                            ? String(sb.value).trim() : "";
                        sources.push({
                            label: live ? "quick search" : "advanced search",
                            set: sIDs,
                        });
                    }
                }
            } catch (e) {}

            // Per level: [matching, context]. Depth from the row's own
            // tree level, so standalone notes/attachments land at 0.
            const lv = [[0, 0], [0, 0], [0, 0]];
            const walk = indices || null;
            const count = walk ? walk.length : n;
            for (let k = 0; k < count; k++) {
                const i = walk ? walk[k] : k;
                let row;
                try { row = rp.getRow(i); } catch (e) { continue; }
                const ref: any = row && row.ref;
                if (!ref || (row.isObjectRow === false)) continue;
                let d = 0;
                try {
                    d = (typeof rp.getLevel === "function")
                        ? rp.getLevel(i) : (row.level || 0);
                }
                catch (e) { d = row.level || 0; }
                if (d < 0) d = 0;
                if (d > 2) d = 2;
                let isMatch = sources.length > 0;
                for (const src of sources) {
                    if (!src.set.has(ref.id)) { isMatch = false; break; }
                }
                lv[d][isMatch ? 0 : 1]++;
            }

            const LABELS = ["Top-level", "Children", "Annotations"];
            const rowsOut: any[] = [];
            for (let d = 0; d < 3; d++) {
                // All three levels ALWAYS, including zeros: a missing
                // tier is ambiguous, and a block that changes height as
                // rows expand is twitchy to read.
                rowsOut.push({
                    depth: d, label: LABELS[d],
                    match: lv[d][0], context: lv[d][1],
                    total: lv[d][0] + lv[d][1],
                });
            }
            return {
                rows: rowsOut,
                // No sources => nothing is narrowing, so the match/context
                // split is meaningless and only the totals are shown.
                split: sources.length > 0,
                sourceLabel: sources.map(x => x.label).join(" + "),
            };
        }
        catch (e) {
            dbg("[Weavero][filter] buildCountMessage err: " + e);
            return null;
        }
    }

    /** Build the count box element. Shared by BOTH render paths — the
     *  unselected/selected message box and the batch-edit prompt — so the
     *  two can never drift apart. Returns the holder; the caller decides
     *  where it goes. */
    _wvRenderCountBox(win: any, lines: any): any {
        const doc = win.document;
    // Centred as a BLOCK, left-aligned inside: centring
    // each cell would destroy the indentation that
    // carries the hierarchy.
    const holder = doc.createXULElement("vbox");
    holder.className = "wv-count-tree";
    holder.style.width = "max-content";
    holder.style.marginInline = "auto";
    holder.style.textAlign = "left";
    holder.style.border =
        "1px solid color-mix(in srgb, currentColor 22%, transparent)";
    holder.style.background =
        "color-mix(in srgb, currentColor 6%, transparent)";
    holder.style.borderRadius = "5px";
    holder.style.padding = "6px 10px";
    holder.style.marginBlockStart = "0.8em";

    const grid = doc.createElementNS(
        "http://www.w3.org/1999/xhtml", "div");
    grid.style.display = "grid";
    // label | match | context — numbers right-aligned so
    // digits line up column-wise and can be compared by
    // eye without reading the labels.
    grid.style.gridTemplateColumns = lines.split
        ? "auto auto auto" : "auto auto";
    grid.style.columnGap = "12px";
    grid.style.rowGap = "2px";
    grid.style.opacity = "0.85";
    const cell = (text, opts?: any) => {
        const c = doc.createElementNS(
            "http://www.w3.org/1999/xhtml", "div");
        c.textContent = text;
        if (opts && opts.indent) {
            c.style.paddingInlineStart = opts.indent + "px";
        }
        if (opts && opts.num) c.style.textAlign = "right";
        if (opts && opts.head) {
            c.style.opacity = "0.7";
            c.style.fontSize = "0.9em";
        }
        grid.appendChild(c);
        return c;
    };
    if (lines.split) {
        // The funnel sits in the grid's top-left header
        // cell — that IS the box's top-left corner, so it
        // needs no absolute positioning and cannot overlap
        // the numbers (MJT, 9 Aug 2026, replacing the
        // "narrowed by ..." text line).
        //
        // A GENERAL funnel: plain currentColor, NOT the
        // amber-stemmed Weavero mark. The narrowing may be
        // Zotero's own quick or advanced search, so
        // branding it would misattribute the numbers. The
        // source is named in the tooltip instead.
        const head0 = cell("");
        const fSvg =
            '<svg xmlns="http://www.w3.org/2000/svg"'
            + ' viewBox="0 0 16 16" fill="none">'
            + '<path fill="context-fill" fill-rule="evenodd"'
            + ' clip-rule="evenodd" d="' + WV_FUNNEL_PATH + '"/>'
            + '</svg>';
        const fImg: any = doc.createElementNS(
            "http://www.w3.org/1999/xhtml", "img");
        fImg.setAttribute("src",
            "data:image/svg+xml;charset=utf-8,"
            + encodeURIComponent(fSvg));
        fImg.setAttribute("width", "12");
        fImg.setAttribute("height", "12");
        fImg.setAttribute("title",
            "narrowed by " + lines.sourceLabel);
        fImg.style.setProperty(
            "-moz-context-properties", "fill, stroke");
        fImg.style.fill = "currentColor";
        fImg.style.opacity = "0.8";
        fImg.style.display = "block";
        head0.appendChild(fImg);
        cell("Match", { num: true, head: true });
        cell("Context", { num: true, head: true });
    }
    else {
        cell("");
        cell("Rows", { num: true, head: true });
    }
    for (const r of lines.rows) {
        cell(r.label, { indent: r.depth * 14 });
        if (lines.split) {
            cell(String(r.match.toLocaleString()), { num: true });
            cell(String(r.context.toLocaleString()), { num: true });
        }
        else {
            cell(String(r.total.toLocaleString()), { num: true });
        }
    }
    holder.appendChild(grid);
        return holder;
    }

    /** Wrap the item pane's message setter so the unselected count is
     *  replaced by the tiered version. `setItemPaneMessage` is the single
     *  seam every path funnels through (itemPane.js `renderMessage`), so
     *  one wrap covers selection changes, refreshes and our own applies.
     *  Versioned + stored-original so a plugin reload re-hooks cleanly. */
    _wvWireItemCountBreakdown(win: any) {
        try {
            const pane: any = win && win.document
                && win.document.getElementById("zotero-item-pane");
            if (!pane || typeof pane.setItemPaneMessage !== "function") return;
            if (pane._wvCountWired === 1) return;
            // Re-wire cleanly across reloads rather than stacking wraps.
            if (pane._wvOrigSetItemPaneMessage) {
                pane.setItemPaneMessage = pane._wvOrigSetItemPaneMessage;
            }
            const orig = pane.setItemPaneMessage;
            pane._wvOrigSetItemPaneMessage = orig;
            pane.setItemPaneMessage = function (msg) {
                // Let Zotero render its own message FIRST and untouched --
                // the native "N items in this view" stays the headline and
                // Weavero's breakdown is appended beneath it, so the tiers
                // read as perspective on that number rather than replacing
                // it. Appending after `orig` is also required, not merely
                // tidy: `itemMessagePane.render()` calls replaceChildren(),
                // so anything added first would be wiped.
                const ret = orig.call(this, msg);
                try {
                    // Resolve the LIVE plugin at call time — a closure over
                    // `this` goes stale across reloads.
                    const lp: any = (Zotero as any).Weavero
                        && (Zotero as any).Weavero.plugin;
                    const doc = win.document;
                    const box = doc.getElementById(
                        "zotero-item-pane-message-box");
                    // CENTERING: the native line is `text-align: start`
                    // and full-width — it only LOOKS centered because the
                    // box shrinks to fit it and the groupbox centers the
                    // box. Appending a longer line widens the box, so the
                    // native text jumps to the left edge. Centring the box
                    // text keeps Zotero's line looking exactly as it did
                    // (MJT, 2026-08-08). Cleared again whenever we add
                    // nothing, so the pane is untouched with the pref off.
                    const clear = () => {
                        try { if (box) box.style.textAlign = ""; } catch (e) {}
                    };
                    // Two messages carry a count worth breaking down:
                    // the unselected view total, and a multi-item
                    // SELECTION. (A single selected item renders the item
                    // pane itself, not a message, so it never arrives
                    // here.) Same box, same rules, different scope.
                    const l10n = msg && msg.l10nId;
                    const forSelection = l10n === "item-pane-message-items-selected";
                    if (!lp || !msg
                        || (l10n !== "item-pane-message-unselected" && !forSelection)
                        || !lp._wvCountBreakdownEnabled()) { clear(); return ret; }
                    const lines = lp._wvBuildCountMessage(win, forSelection);
                    // `lines` is an OBJECT now ({rows, split, sourceLabel}),
                    // so probe `.rows` — `.length` on the object is
                    // undefined and would silently suppress the whole
                    // breakdown.
                    if (!lines || !lines.rows || !lines.rows.length || !box) {
                        clear(); return ret;
                    }
                    box.style.textAlign = "center";
                    const holder = lp._wvRenderCountBox(win, lines);
                    box.appendChild(holder);
                } catch (e) {}
                return ret;
            };
            // A multi-item selection does NOT come through
            // setItemPaneMessage. Zotero 10 switches the pane to
            // `batch-edit-prompt` mode and localizes
            // #batch-edit-prompt-message directly
            // (itemPane.js::renderBatchEditorPrompt), leaving the message
            // box holding stale unselected content that is merely hidden.
            //
            // Verified the hard way on 9 Aug 2026: driving the check with
            // ZoteroPane.itemSelected() DID produce the message path and
            // the box appeared, so the feature looked verified while the
            // real UI showed nothing. Same class of harness lie as
            // dispatching `input` instead of `command` at the search box.
            if (typeof pane.renderBatchEditorPrompt === "function") {
                if (pane._wvOrigRenderBatchPrompt) {
                    pane.renderBatchEditorPrompt = pane._wvOrigRenderBatchPrompt;
                }
                const origBatch = pane.renderBatchEditorPrompt;
                pane._wvOrigRenderBatchPrompt = origBatch;
                pane.renderBatchEditorPrompt = function () {
                    const ret = origBatch.apply(this, arguments);
                    try {
                        const lp: any = (Zotero as any).Weavero
                            && (Zotero as any).Weavero.plugin;
                        const gb = win.document.getElementById("batch-edit-prompt");
                        if (!gb) return ret;
                        // This branch re-renders in place rather than
                        // replacing children, so drop any previous box or
                        // they would stack up.
                        const prev = gb.querySelector(".wv-count-tree");
                        if (prev) prev.remove();
                        if (!lp || !lp._wvCountBreakdownEnabled()) return ret;
                        const lines = lp._wvBuildCountMessage(win, true);
                        if (!lines || !lines.rows || !lines.rows.length) return ret;
                        const holder = lp._wvRenderCountBox(win, lines);
                        // Breathing room before the Edit Multiple Items
                        // button — without it the box reads as part of the
                        // button's own grouping rather than as information
                        // about the selection (MJT, 9 Aug 2026).
                        holder.style.marginBlockEnd = "1.1em";
                        const msgEl = win.document.getElementById(
                            "batch-edit-prompt-message");
                        if (msgEl && msgEl.nextSibling) {
                            gb.insertBefore(holder, msgEl.nextSibling);
                        }
                        else { gb.appendChild(holder); }
                    } catch (e) {}
                    return ret;
                };
            }
            pane._wvCountWired = 1;
        } catch (e) {}
    }

    _wvUnwireItemCountBreakdown(win: any) {
        try {
            const pane: any = win && win.document
                && win.document.getElementById("zotero-item-pane");
            if (!pane || !pane._wvOrigSetItemPaneMessage) return;
            // Drop the centring we applied to Zotero's own message box.
            try {
                const box: any = win.document.getElementById(
                    "zotero-item-pane-message-box");
                if (box) box.style.textAlign = "";
            } catch (e) {}
            pane.setItemPaneMessage = pane._wvOrigSetItemPaneMessage;
            delete pane._wvOrigSetItemPaneMessage;
            if (pane._wvOrigRenderBatchPrompt) {
                pane.renderBatchEditorPrompt = pane._wvOrigRenderBatchPrompt;
                delete pane._wvOrigRenderBatchPrompt;
            }
            try {
                const gb = win.document.getElementById("batch-edit-prompt");
                const prev = gb && gb.querySelector(".wv-count-tree");
                if (prev) prev.remove();
            } catch (e) {}
            delete pane._wvCountWired;
        } catch (e) {}
    }

    _applyItemsListFilterInner(opts?) {
        // Auto-expand cascade is opt-IN. The MutationObserver-fired
        // reapply must NOT cascade (it would re-open every parent the
        // user just collapsed via the twisty/`-` key). Only the
        // explicit color-picker click passes `cascade: true`.
        const cascade = !!(opts && opts.cascade);
        const win = Zotero.getMainWindow();
        if (!win) return;
        const itemsView = win.ZoteroPane && win.ZoteroPane.itemsView;
        if (!itemsView || !itemsView.tree) return;

        // Re-arm the reveal hook on the CURRENT collection-tree rows.
        // Selecting another collection swaps `rowProvider.collectionTreeRows`
        // for fresh objects, and nothing re-ran the patch afterwards, so the
        // newly-selected collection's `getItems` stayed unwrapped and reveals
        // under a filter didn't surface its hidden children. Invisible before
        // beta.21, when the singular getter exposed only the first row anyway
        // (caught 2026-07-31). Idempotent: peels a prior wrap before
        // re-installing.
        try { this._patchRefreshForReveals(); } catch (e) {}

        // Snapshot the native quick-search value once per apply so
        // `_rowPassesFilters` can cheaply consult it inside the
        // per-row loop without repeatedly touching the DOM. Used
        // exclusively by the quickSearchScope check — when empty,
        // scope is a no-op regardless of how it's set.
        try {
            const sb = win.document.getElementById("zotero-tb-search") as any;
            this._currentQuickSearchValue = (sb && sb.value
                ? String(sb.value).trim() : "");
        } catch (e) { this._currentQuickSearchValue = ""; }

        // Library-change detection. Collection IDs and saved-search
        // IDs are library-scoped — a filter set in library A makes
        // every row fail the global check in library B (none of the
        // items in B belong to A's collections). Detect the switch
        // and reset both filters + the saved-search results cache.
        try {
            const curLib = this._wvSelectedLibraryID(win);
            if (this._lastLibraryID !== undefined
                && this._lastLibraryID !== curLib
                && this._filterState) {
                if (this._filterState.collections
                    && this._filterState.collections.length) {
                    this._filterState.collections = [];
                }
                if (this._filterState.savedSearches
                    && this._filterState.savedSearches.length) {
                    this._filterState.savedSearches = [];
                }
                this._savedSearchResults = null;
                try { this._renderFilterBar(); } catch (e) {}
            }
            this._lastLibraryID = curLib;
        } catch (e) {
            dbg("[Weavero][filter] library-change check err: " + e);
        }

        // V9-COMPAT: Zotero 10 beta added a `rowProvider`
        // abstraction; Zotero 9 keeps the row methods directly on
        // `itemsView`. Resolve once so the patch code below is
        // version-agnostic. `rp` means "row source".
        //
        // Other v9 differences (each tagged at its callsite):
        // - `_rows.length` instead of `getRowCount()`.
        // - `_searchItemIDs` / `_searchParentIDs` (underscored,
        //   private) instead of public `searchItemIDs` /
        //   `searchParentIDs`.
        // - `toggleOpenState` is async (no `_toggleOpenState`).
        // - No `expandRows` / `collapseRows` / `_refreshContainer`
        //   / `_openContainer` — single-row async operations only.
        const rp: any = itemsView.rowProvider || itemsView;
        if (!rp) return;
        const isV9 = !itemsView.rowProvider;

        // ---- Filter-apply phase timing (always on, ~µs overhead) ----
        // Per-phase ms recorded at each boundary and pushed to the
        // `Zotero._wvFilterPerf` ring (last 20 applies) on the ACTIVE
        // path. Added chasing the 2026-08-05 "filters feel slow" report:
        // the cost is O(raw rows) passes — 42k rows ≈ 1.5s on the real
        // library — and this keeps the breakdown observable there
        // without a debugger. Phases: setup (caches/helpers), pass1
        // (cascade auto-expand), pass2 (keep[] build), gatePatch (scope
        // gate + method patches), invalidate (re-render).
        // `performance` is NOT a global in the plugin's privileged scope
        // (dev.5 threw ReferenceError on every apply) — use the main
        // window's clock, falling back to Date.now().
        const _perfNow = () => {
            try { return win.performance.now(); } catch (e) { return Date.now(); }
        };
        const _perfT0 = _perfNow();
        let _perfLast = _perfT0;
        const _perf: any = { at: new Date().toISOString().slice(11, 19) };
        const _mark = (k: string) => {
            const n = _perfNow();
            _perf[k] = Math.round(n - _perfLast);
            _perfLast = n;
        };

        const state = this._filterState;
        const active = this._isFilterActive(state);

        // Filter cleared: restore originals by deleting the
        // own-property patches so prototype methods show through.
        // V9-COMPAT: for methods that were originally OWN-property
        // arrow-function fields on the itemsView (not prototype
        // methods), `delete` would remove the original too. Reassign
        // from the saved `_wvOrig*` instead.
        if (!active) {
            // Drop transient per-row reveal state ONLY on the
            // active→inactive transition (Weavero filter just got
            // cleared). The user-revealed set must survive subsequent
            // inactive applies — otherwise a chevron click during
            // quick-search-only mode would re-enter this branch on
            // the click's own apply call and immediately undo itself.
            if (this._wvFilterWasActive) {
                if (this._userRevealedAllIDs
                    && this._userRevealedAllIDs.size) {
                    this._userRevealedAllIDs.clear();
                }
                // Also drop the manual expand/collapse state so clearing
                // the filter returns the tree to its default expansion.
                // The user's per-row collapse/expand was relative to the
                // filtered view, so it must NOT be remembered once the
                // filter is gone (re-applying should start fresh).
                if (this._userOpenedIDs && this._userOpenedIDs.size) {
                    this._userOpenedIDs.clear();
                }
                if (this._userClosedIDs && this._userClosedIDs.size) {
                    this._userClosedIDs.clear();
                }
            }
            this._wvFilterWasActive = false;
            // Even with no Weavero filter, populate the chevron maps
            // from Zotero's quick-search state so the indicator
            // renders on first visible children of quick-search-
            // hiding containers. Empty maps if no search either.
            this._wvComputeChevronMapsForQuickSearch(rp);
            // The keep watermark describes a TRANSLATED view. With the
            // patches gone `getRow` is Zotero's own again and indices
            // mean what they say, so a leftover watermark would keep
            // reporting a stale mapping forever (it is only ever
            // compared against the LIVE `_rows.length`, which changes on
            // every collapse/expand). That made `_captureSelectedItemIDs`
            // return null permanently after the first filter of a
            // session — harmless while the reconcile merely bailed, but
            // since 2026-08-07 the untrusted path CLEARS the selection,
            // so it became a visible "my selection keeps vanishing" bug.
            delete rp._wvKeepRowsLen;
            if (rp._wvOrigGetRow) {
                // getRow / getLevel / getRowCount / *expand* /
                // *collapse* live on the prototype on v10 and on
                // v9's LibraryTree prototype too — safe to delete.
                delete rp.getRow;
                delete rp.getRowCount;
                delete rp._wvOrigGetRow;
                delete rp._wvOrigGetRowCount;
                // Restore the item pane's count getter (own property on the
                // itemsView; deleting it re-exposes the prototype getter).
                // The host is stored on `rp` because these teardown sites
                // only have `rp` in scope.
                if (rp._wvObjRowCountHost) {
                    try { delete rp._wvObjRowCountHost.objectRowCount; }
                    catch (e) {}
                    delete rp._wvObjRowCountHost;
                }
                if (rp._wvOrigGetLevel) {
                    delete rp.getLevel;
                    delete rp._wvOrigGetLevel;
                }
                // The container probes + toggleOpenState are
                // OWN-property arrow fields on v9 — restore via
                // assignment so the original is preserved.
                const restoreField = (name, origKey) => {
                    if (rp[origKey]) {
                        if (isV9) rp[name] = rp[origKey];
                        else delete rp[name];
                        delete rp[origKey];
                    }
                };
                restoreField("isContainer", "_wvOrigIsContainer");
                restoreField("isContainerOpen", "_wvOrigIsContainerOpen");
                restoreField("isContainerEmpty", "_wvOrigIsContainerEmpty");
                restoreField("toggleOpenState", "_wvOrigToggleOpenState");
                // expandRows / collapseRows don't exist on v9 — we
                // only patched them on v10 (prototype methods).
                if (rp._wvOrigExpandRows) {
                    delete rp.expandRows;
                    delete rp._wvOrigExpandRows;
                }
                if (rp._wvOrigCollapseRows) {
                    delete rp.collapseRows;
                    delete rp._wvOrigCollapseRows;
                }
                if (rp._wvOrigExpandAllRows) {
                    delete rp.expandAllRows;
                    delete rp._wvOrigExpandAllRows;
                }
                if (rp._wvOrigCollapseAllRows) {
                    delete rp.collapseAllRows;
                    delete rp._wvOrigCollapseAllRows;
                }
                // V9-COMPAT: restore the React props we rebound
                // to live patches on v9.
                if (isV9 && itemsView.tree && itemsView.tree.props
                    && itemsView.tree.props._wvV9PropsPatched) {
                    const tp: any = itemsView.tree.props;
                    if (tp._wvOrigGetRowCount) tp.getRowCount = tp._wvOrigGetRowCount;
                    if (tp._wvOrigIsContainer) tp.isContainer = tp._wvOrigIsContainer;
                    if (tp._wvOrigIsContainerOpen) tp.isContainerOpen = tp._wvOrigIsContainerOpen;
                    if (tp._wvOrigIsContainerEmpty) tp.isContainerEmpty = tp._wvOrigIsContainerEmpty;
                    if (tp._wvOrigToggleOpenState) tp.toggleOpenState = tp._wvOrigToggleOpenState;
                    delete tp._wvOrigGetRowCount;
                    delete tp._wvOrigIsContainer;
                    delete tp._wvOrigIsContainerOpen;
                    delete tp._wvOrigIsContainerEmpty;
                    delete tp._wvOrigToggleOpenState;
                    delete tp._wvV9PropsPatched;
                    // Restore WindowedList's captured getItemCount too.
                    const jsWin: any = itemsView.tree._jsWindow;
                    if (jsWin && jsWin._wvOrigGetItemCount) {
                        jsWin.getItemCount = jsWin._wvOrigGetItemCount;
                        delete jsWin._wvOrigGetItemCount;
                        if (typeof jsWin._getItemCount === "function") {
                            try { jsWin._getItemCount(); } catch (e) {}
                        }
                    }
                }
                delete rp._wvFilterSelfCall;
                this._partialCollapseOnFilterClear(rp, itemsView);
                try { itemsView.tree.invalidate(); } catch (e) {}
            }
            // Repaint so chevrons (just computed by the helper above
            // for quick-search-only mode) actually appear on the rows
            // the tree painted BEFORE the MutationObserver ran the
            // apply pass. Without this, the first paint after a quick
            // search has empty maps and skips the chevron path; the
            // user sees no indicator until something else mutates the
            // tree. Pure paint invalidate — doesn't add/remove rows —
            // so it can't loop through the MutationObserver.
            try { itemsView.tree.invalidate(); } catch (e) {}
            // Re-render the item pane count on the CLEAR path too. The
            // count getter has just been unpatched, but the message
            // itself is only refreshed from `itemsView.onRefresh`
            // upstream, so without this it keeps showing the FILTERED
            // number after the filter is gone (measured 2026-08-08:
            // message stuck at 15,329 with 17,928 rows restored).
            // Same empty-selection gate as the apply path.
            try {
                const _zp: any = win && win.ZoteroPane;
                const _sel: any = itemsView && itemsView.selection;
                if (_zp && typeof _zp.itemSelected === "function"
                    && _sel && _sel.count === 0) {
                    Promise.resolve(_zp.itemSelected()).catch(() => {});
                }
            } catch (e) {}
            return;
        }

        // ---- No-op skip (perf fix #1, 2026-08-05) ----
        // Observer-triggered re-applies frequently arrive with NOTHING
        // changed — measured as ~650ms x4 bursts after a single click.
        // Skip them outright. NEVER skips: explicit cascade applies, any
        // signature change (the sig serializes the ENTIRE multi-group
        // state plus view/library/quick-search — multi-filter safe), a
        // raw-row-count change (keep[] would be stale), or a missing
        // getRow patch (an external itemsView rebuild dropped our
        // translation). Data changes null the sig via the notifier
        // invalidator (_wvWireFilterCacheInvalidator).
        const _sig = this._wvFilterStateSig(win, itemsView);
        // OPTION 1 (MJT, 16 Aug 2026): with a chip and a search combined,
        // FILTER logic governs — every shown tree must satisfy all
        // criteria. The user-revealed / user-opened force-keeps are a
        // WITHIN-STATE affordance (keep open what the user opened despite
        // reapplies); carried across STATE changes they resurrect trees
        // the new criteria reject — traced 16 Aug: a book force-kept under
        // a journalArticle chip because it had been revealed under an
        // earlier search-only state. Clear them whenever the reveal SCOPE
        // changes: library/view/search TEXT/group config — i.e. the sig
        // MINUS the search-set identity tag, which changes on every
        // rebuild of the same search and would wrongly clear a chevron
        // click's own state (that click's apply keeps an unchanged scope).
        try {
            const scopeKey = String(_sig).replace(/\|s\d+:\d+/, "|s");
            if ((this as any)._wvRevealScopeKey !== undefined
                && (this as any)._wvRevealScopeKey !== scopeKey) {
                if (this._userRevealedAllIDs && this._userRevealedAllIDs.size) {
                    this._userRevealedAllIDs.clear();
                }
                if (this._userOpenedIDs && this._userOpenedIDs.size) {
                    this._userOpenedIDs.clear();
                }
                if (this._userClosedIDs && this._userClosedIDs.size) {
                    this._userClosedIDs.clear();
                }
            }
            (this as any)._wvRevealScopeKey = scopeKey;
        } catch (e) {}
        // Whether our getRow patch was ALREADY installed when this apply
        // began — used by the identical-keep invalidate skip below (a
        // first activation must always re-render).
        const _wasPatchedAtEntry = !!rp._wvOrigGetRow
            && Object.prototype.hasOwnProperty.call(rp, "getRow");
        if (!cascade
            && this._wvLastApplySig === _sig
            && this._wvLastApplyRawRows === rp._rows.length
            && rp._wvOrigGetRow
            && Object.prototype.hasOwnProperty.call(rp, "getRow")) {
            (Zotero as any)._wvFilterPerfSkips
                = ((Zotero as any)._wvFilterPerfSkips || 0) + 1;
            return;
        }

        // Save originals on first activation. Cover `getLevel` too:
        // virtualized-table.jsx's `_getDepth(index)` (used for indent
        // and parent twisty arrows) walks the shared `_rows` array
        // through `getLevel(idx)` / `getParentIndex(idx)`, so without
        // mapping `idx` back to the original space the visual depth
        // is computed for the wrong row.
        //
        // Always walk to the PROTOTYPE-defined method, not whatever's
        // currently on the instance. Plugin disable+enable leaves
        // monkey-patched versions on the instance (via own properties)
        // whose closures hold stale `keep` arrays from the previous
        // plugin module — saving those as "the original" and then
        // re-patching produces a chain with mismatched indices.
        //
        // V9-COMPAT: Zotero 9 defines `isContainer` / `getRow` / etc.
        // as arrow-function class fields, which live as OWN properties
        // on the instance rather than the prototype. We accept those
        // (and trust our own marker checks below to detect our own
        // installed wrappers) so v9 has originals to wrap.
        const findProtoMethod = (obj, name) => {
            // Skip own props that ARE our wrappers — checking the
            // chain below still finds the real prototype original.
            // For v9 (no proto method), accept the own prop.
            let p = Object.getPrototypeOf(obj);
            while (p) {
                if (Object.prototype.hasOwnProperty.call(p, name)
                    && typeof p[name] === "function") {
                    return p[name];
                }
                p = Object.getPrototypeOf(p);
            }
            // V9-COMPAT: fall back to the instance's own property
            // when no prototype method exists.
            if (Object.prototype.hasOwnProperty.call(obj, name)
                && typeof obj[name] === "function") {
                return obj[name];
            }
            return null;
        };
        // Patch the rowProvider only. `itemsView.getLevel` etc. are
        // arrow-function fields on the LibraryTree base that simply
        // delegate to `this.rowProvider.<same>(idx)` — so patching at
        // the rp level is reached by every public consumer (the
        // virtualized table's bound props all dispatch through to rp).
        // Patching itemsView in addition would double-stack mapping
        // (keep[keep[idx]]).
        if (!rp._wvOrigGetRow) {
            const rpGetRow = findProtoMethod(rp, "getRow");
            const rpGetRowCount = findProtoMethod(rp, "getRowCount");
            const rpGetLevel = findProtoMethod(rp, "getLevel");
            const rpIsContainer = findProtoMethod(rp, "isContainer");
            const rpIsContainerOpen = findProtoMethod(rp, "isContainerOpen");
            const rpIsContainerEmpty = findProtoMethod(rp, "isContainerEmpty");
            const rpToggle = findProtoMethod(rp, "toggleOpenState");
            const rpExpand = findProtoMethod(rp, "expandRows");
            const rpCollapse = findProtoMethod(rp, "collapseRows");
            const rpExpandAll = findProtoMethod(rp, "expandAllRows");
            const rpCollapseAll = findProtoMethod(rp, "collapseAllRows");
            rp._wvOrigGetRow = (rpGetRow || rp.getRow).bind(rp);
            // Zotero 9 has no `getRowCount` method — the count comes
            // from `_rows.length`. Synthesise one so the rest of the
            // patch code is uniform.
            if (rpGetRowCount) {
                rp._wvOrigGetRowCount = rpGetRowCount.bind(rp);
            } else if (typeof rp.getRowCount === "function") {
                rp._wvOrigGetRowCount = rp.getRowCount.bind(rp);
            } else {
                rp._wvOrigGetRowCount = function () {
                    return (rp._rows && rp._rows.length) || 0;
                };
            }
            if (rpGetLevel) rp._wvOrigGetLevel = rpGetLevel.bind(rp);
            if (rpIsContainer) rp._wvOrigIsContainer = rpIsContainer.bind(rp);
            if (rpIsContainerOpen) rp._wvOrigIsContainerOpen = rpIsContainerOpen.bind(rp);
            if (rpIsContainerEmpty) rp._wvOrigIsContainerEmpty = rpIsContainerEmpty.bind(rp);
            if (rpToggle) rp._wvOrigToggleOpenState = rpToggle.bind(rp);
            if (rpExpand) rp._wvOrigExpandRows = rpExpand.bind(rp);
            if (rpCollapse) rp._wvOrigCollapseRows = rpCollapse.bind(rp);
            if (rpExpandAll) rp._wvOrigExpandAllRows = rpExpandAll.bind(rp);
            if (rpCollapseAll) rp._wvOrigCollapseAllRows = rpCollapseAll.bind(rp);
        }

        // V9-COMPAT: Zotero 9's `isContainer` / `isContainerOpen` are
        // instance-field arrow functions that do `getRow(i).ref` /
        // `getRow(i).isOpen` UNCONDITIONALLY. The cascade pass below
        // opens containers (on v9, single `toggleOpenState` calls),
        // each of which mutates `_rows` and fires a re-render that
        // calls these probes — and at that point our translating
        // `getRow` patch isn't installed yet (it goes in AFTER the
        // cascade), so a transient out-of-range index hands back
        // `undefined` and `.ref`/`.isOpen` crashes the whole window
        // via `Zotero.crash()` (itemTree.js:2290 / :2295). The
        // `wrapProbe` install later only guards the post-cascade
        // window. Make the live probes null-safe NOW, before the
        // cascade, so any transient bad index returns false instead
        // of throwing. v10's probes already tolerate undefined, so
        // this is gated to v9. They delegate to whatever `getRow` is
        // current (native during the cascade, the patched translating
        // version afterwards) — null-safe either way.
        if (isV9) {
            rp.isContainer = function (index) {
                const r = rp.getRow(index);
                if (!r || !r.ref) return false;
                try {
                    return !!(r.ref.isRegularItem
                        && (r.ref.isRegularItem()
                            || r.ref.isFileAttachment()));
                } catch (e) { return false; }
            };
            if (typeof rp.isContainerOpen === "function") {
                rp.isContainerOpen = function (index) {
                    const r = rp.getRow(index);
                    return !!(r && r.isOpen);
                };
            }
            // Re-apply after Zotero's own refreshes (e.g. the
            // hideContextAnnotationRows pref observer) so the toggle's
            // expanded view isn't left collapsed. v10 gets this from
            // the rowProvider._refresh wrap; v9 needs it on the
            // itemsView. Idempotent.
            try { this._patchV9RefreshReapply(itemsView); } catch (e) {}
        }

        const origGetRow = rp._wvOrigGetRow;
        const origGetRowCount = rp._wvOrigGetRowCount;

        // ---- Per-apply hot-path caches (perf) ----
        // Hoisted here (above the cascade pass) so Pass 1's
        // `_hasMatchingAnnotation` calls share the cache with
        // Pass 2's `_rowIsPrimary` checks. Without this, cascade
        // recomputes per-item primary verdicts that pass 2 then
        // recomputes again.
        // Perf fix #2 (2026-08-05): the verdict cache PERSISTS across
        // applies, keyed by the full state signature. Twisty
        // expand/collapse re-syncs and post-click observer applies reuse
        // per-ITEM verdicts (rows change, items don't) instead of
        // re-deriving all ~18k (~500-650ms/apply measured). Any state
        // change rotates the sig; any item/tag/collection/search
        // notifier event nulls the cache outright.
        let _vc = this._wvVerdictCache;
        if (!_vc || _vc.sig !== _sig) {
            // `match` and `desc` ride the same signature: subtree verdicts
            // (hasMatch / hasPrimaryDescendant) are pure functions of
            // (state, data), so they share the cache's invalidation
            // exactly — any state change rotates the sig, any data change
            // nulls the whole object via the notifier invalidator.
            _vc = this._wvVerdictCache
                = { sig: _sig, map: new Map(), match: new Map(), desc: new Map() };
        }
        const isPrimaryCache = _vc.map;
        const isPrimary = (item) => {
            if (!item) return false;
            const id = item.id;
            if (id != null && isPrimaryCache.has(id)) {
                return isPrimaryCache.get(id);
            }
            const v = this._rowIsPrimary(item, state);
            if (id != null) isPrimaryCache.set(id, v);
            return v;
        };
        // Persistent (sig-keyed) — see the _wvVerdictCache comment above.
        // Cross-apply reuse matters most for the cascade: depth scans 2..8
        // and back-to-back applies re-ask the same subtree questions.
        const hasMatchCache = _vc.match;
        const hasMatch = (item) => {
            if (!item) return false;
            const id = item.id;
            if (id != null && hasMatchCache.has(id)) {
                return hasMatchCache.get(id);
            }
            // Inline a cache-aware version of `_hasMatchingAnnotation`
            // so its recursive descents into attachments / notes /
            // annotations also hit the cache. The original method
            // calls `this._rowIsPrimary` directly without caching.
            let v = false;
            try {
                if (isPrimary(item)) {
                    v = true;
                } else if (item.isFileAttachment && item.isFileAttachment()) {
                    const anns = (typeof item.getAnnotations === "function")
                        ? (item.getAnnotations() || []) : [];
                    for (const ann of anns) {
                        if (isPrimary(ann)) { v = true; break; }
                    }
                } else if (item.isRegularItem && item.isRegularItem()) {
                    const attIds = (typeof item.getAttachments === "function")
                        ? item.getAttachments() : [];
                    for (const aId of attIds) {
                        const att = Zotero.Items.get(aId);
                        if (att && hasMatch(att)) { v = true; break; }
                    }
                    if (!v) {
                        const noteIds = (typeof item.getNotes === "function")
                            ? item.getNotes() : [];
                        for (const nId of noteIds) {
                            const n = Zotero.Items.get(nId);
                            if (n && isPrimary(n)) { v = true; break; }
                        }
                    }
                }
            } catch (e) {
                dbg("[Weavero][filter] hasMatch err: " + e);
            }
            if (id != null) hasMatchCache.set(id, v);
            return v;
        };

        // True iff `item` has at least one STRICT descendant that is
        // primary. Used by Pass 1 to decide whether to auto-expand a
        // container — we don't want to expand a container just
        // because IT is primary (e.g., picking
        // `attachmentFileType=PDF` shouldn't auto-expand each PDF
        // attachment to reveal its annotations; the user only asked
        // about the attachment level). Only when a deeper-level row
        // is primary should the container open.
        // Cached in the sig-keyed store (2026-08-05): pass 1 asks this for
        // every closed container on EVERY depth scan (up to 8), and it was
        // the only subtree verdict recomputed each time.
        const descCache = _vc.desc;
        const hasPrimaryDescendant = (item) => {
            if (!item) return false;
            const dId = item.id;
            if (dId != null && descCache.has(dId)) return descCache.get(dId);
            let dv = false;
            if (item.isFileAttachment && item.isFileAttachment()) {
                const anns = (typeof item.getAnnotations === "function")
                    ? (item.getAnnotations() || []) : [];
                for (const ann of anns) {
                    if (isPrimary(ann)) { dv = true; break; }
                }
            }
            else if (item.isRegularItem && item.isRegularItem()) {
                const attIds = (typeof item.getAttachments === "function")
                    ? item.getAttachments() : [];
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    // `hasMatch(att)` covers both "att itself is
                    // primary" and "att has a primary annotation".
                    // Either way, the regular item must open so the
                    // attachment row becomes visible.
                    if (att && hasMatch(att)) { dv = true; break; }
                }
                if (!dv) {
                    const noteIds = (typeof item.getNotes === "function")
                        ? item.getNotes() : [];
                    for (const nId of noteIds) {
                        const n = Zotero.Items.get(nId);
                        if (n && isPrimary(n)) { dv = true; break; }
                    }
                }
            }
            if (dId != null) descCache.set(dId, dv);
            return dv;
        };

        _mark("setup");
        // Pass 1 — auto-expand containers whose subtree contains a
        // STRICTLY DEEPER primary match (an attachment under a parent,
        // an annotation under an attachment, etc.). Walk FORWARDS so
        // the new child rows inserted by an open get visited next
        // iteration — otherwise the cascade stops one level deep
        // (we'd open the top-level item but never recurse into its
        // newly-visible attachments, leaving the matching annotations
        // themselves collapsed).
        //
        // The check uses `hasPrimaryDescendant`, NOT `hasMatch`. The
        // distinction matters: a container that is itself primary
        // (e.g., a PDF attachment under `attachmentFileType=PDF`)
        // should be SHOWN at its own depth but NOT auto-opened to
        // reveal its annotations — those would only be visible if
        // another filter targeted them. Only filters that actually
        // hit a deeper level cause the container to open.
        //
        // BATCH STRATEGY: collect every closed-container index that
        // needs opening in one pass, then open them all via
        // `rp.expandRows(indices)` (single `refreshRowMap` + single
        // `runListeners('update')` instead of N). Repeat until a
        // pass identifies nothing new. This collapses N invalidate
        // events into ~2-3 (one per depth level), which is what was
        // making the cascade feel slower than `expandAllRows`.
        //
        // Only runs when `cascade` is explicitly opted in (initial
        // activation or color-set change). The MutationObserver and
        // toggle-triggered reapplies skip the cascade — otherwise it
        // would re-open every parent the user just collapsed.
        // V9-COMPAT: Zotero 10's row objects (`ZoteroItemTreeRow`)
        // expose `isContainer()` / `isContainerOpen()` as methods.
        // Zotero 9's row objects are plain `ItemTreeRow` instances
        // (`{ref, level, isOpen}`) with no such methods — those checks
        // live on the itemsView itself, indexed by row position. Use a
        // helper so both shapes work.
        const rowIsContainer = (idx, row) => {
            if (row && typeof row.isContainer === "function") {
                return !!row.isContainer();
            }
            if (typeof rp._wvOrigIsContainer === "function") {
                return !!rp._wvOrigIsContainer(idx);
            }
            return false;
        };
        const rowIsContainerOpen = (idx, row) => {
            if (row && typeof row.isContainerOpen === "function") {
                return !!row.isContainerOpen();
            }
            // V9-COMPAT: ItemTreeRow exposes `isOpen` directly.
            if (row && typeof row.isOpen === "boolean") {
                return row.isOpen;
            }
            if (typeof rp._wvOrigIsContainerOpen === "function") {
                return !!rp._wvOrigIsContainerOpen(idx);
            }
            return false;
        };
        // Perf fix #3 (2026-08-05): when every active condition can only
        // match at PARENT level, there is no strictly-deeper primary
        // match anywhere, so the cascade scan (measured ~350-400ms even
        // when it opens nothing) is skipped wholesale. Any child-level or
        // cross-level condition, global filter, or live quick search
        // keeps the cascade — multi-filter mixes stay correct.
        // BUILD MODE (phase 1 of build-from-matches, 2026-08-06; spike GO
        // at 219ms construction vs 3114ms cascade scan+splice for the same
        // expansion state). Replaces ONLY the cascade's mechanism: instead
        // of depth-scans + expandRows (per-row middle-of-array splices,
        // O(n²) element movement), rebuild `_rows` append-only in ONE pass
        // — same rows, same open flags, same order as the cascade would
        // produce, so every downstream stage (keep pass, patches, toggles,
        // chevrons, clear-restore) is untouched. Child rows are created
        // with upstream's own recipe (_toggleOpenState's open branch:
        // getChildItems opts + createRow + conditional child sort).
        // Scope gates per the recorded strategy: pref, v10 rowProvider,
        // no live quick search; everything else falls back to the cascade.
        const _buildEligible = cascade
            && !this._wvFilterParentLevelOnly(state)
            && !!itemsView.rowProvider
            && !this._currentQuickSearchValue
            && (() => {
                try { return Zotero.Prefs.get("weavero.filterBuildMode") === true; }
                catch (e) { return false; }
            })();
        // Resolve the getChildItems hot-path state ONCE for whichever
        // expansion pass runs below (see WV_GCI_CTX).
        const _gciCtx = {
            showCtxAtt: (() => {
                try { return !!Zotero.Prefs.get("weavero.showContextAttachmentRows"); }
                catch (e) { return false; }
            })(),
            liveSM: !!(rp.searchMode || rp._searchMode
                || this._currentQuickSearchValue),
            liveSIDs: rp.searchItemIDs || rp._searchItemIDs || null,
            liveParents: rp.searchParentIDs || rp._searchParentIDs || null,
        };
        if (_buildEligible) {
            const wasFlag = rp._wvFilterSelfCall;
            rp._wvFilterSelfCall = true;
            WV_GCI_CTX = _gciCtx;
            try {
                if (!this._filterOpenedIDs) this._filterOpenedIDs = new Set();
                const newRows: any[] = [];
                const openDeep = (row: any) => {
                    newRows.push(row);
                    const item = row.ref;
                    if (!item) return;
                    let isC = false;
                    try { isC = typeof row.isContainer === "function" && row.isContainer(); } catch (e) {}
                    if (!isC) return;
                    // Already-open containers keep their EXISTING child rows
                    // (they follow in the original array and re-enter this
                    // walk on their own iteration) — creating children here
                    // would duplicate them.
                    if (row.isOpen) return;
                    if (this._userClosedIDs && this._userClosedIDs.has(item.id)) return;
                    if (!hasPrimaryDescendant(item)) return;
                    let childRefs: any[] = [];
                    try {
                        childRefs = row.getChildItems({
                            searchMode: rp._searchMode,
                            searchItemIDs: rp._searchItemIDs,
                            includeTrashed: rp._includeTrashed,
                            filterChildItems: rp.itemTree && rp.itemTree.props
                                && rp.itemTree.props.filterChildItems,
                        }) || [];
                    } catch (e) { childRefs = []; }
                    let childRows: any[] = [];
                    try {
                        childRows = childRefs.map((ref: any) =>
                            rp.createRow(ref, (row.level || 0) + 1, false));
                    } catch (e) { childRows = []; }
                    try {
                        if (rp._sortFields && rp.shouldSortChildren
                            && rp.shouldSortChildren(row)) {
                            childRows.sort((a: any, b: any) => rp._compareRows(a, b));
                        }
                    } catch (e) {}
                    row.isOpen = true;
                    if (item.id != null) this._filterOpenedIDs.add(item.id);
                    for (const cr of childRows) openDeep(cr);
                };
                const base = rp._rows.slice();
                for (const r of base) openDeep(r);
                rp._rows = newRows;
                try { rp.refreshRowMap(); } catch (e) {}
                (_perf as any).buildMode = true;
                dbg("[Weavero][filter] cascade-by-construction: "
                    + base.length + " -> " + newRows.length + " rows");
            } catch (e) {
                Zotero.debug("[Weavero][filter] build-mode err (falling back next apply): " + e);
            }
            finally { rp._wvFilterSelfCall = wasFlag; WV_GCI_CTX = null; }
        }
        else if (cascade && !this._wvFilterParentLevelOnly(state)) {
            const wasFlag = rp._wvFilterSelfCall;
            rp._wvFilterSelfCall = true;
            WV_GCI_CTX = _gciCtx;
            try {
                let depth = 0;
                const MAX_DEPTH = 8;
                while (depth++ < MAX_DEPTH) {
                    const toOpen = [];
                    const total = origGetRowCount();
                    for (let i = 0; i < total; i++) {
                        let row;
                        try { row = origGetRow(i); } catch (e) { row = null; }
                        if (!row || !row.ref) continue;
                        const item = row.ref;
                        if (!rowIsContainer(i, row)) continue;
                        if (rowIsContainerOpen(i, row)) continue;
                        // Skip containers the user explicitly
                        // collapsed — they take priority over the
                        // cascade-open's "always reveal a primary
                        // descendant" rule.
                        if (this._userClosedIDs
                            && this._userClosedIDs.has(item.id)) {
                            continue;
                        }
                        if (!hasPrimaryDescendant(item)) continue;
                        toOpen.push(i);
                        if (item.id != null) {
                            if (!this._filterOpenedIDs) {
                                this._filterOpenedIDs = new Set();
                            }
                            this._filterOpenedIDs.add(item.id);
                        }
                    }
                    if (!toOpen.length) break;
                    if (typeof rp._wvOrigExpandRows === "function") {
                        try { rp._wvOrigExpandRows(toOpen); }
                        catch (e) {
                            dbg("[Weavero][filter] expandRows err: " + e);
                        }
                    } else if (typeof rp._wvOrigToggleOpenState === "function") {
                        // V9-COMPAT: Zotero 9 has no batched
                        // `expandRows` — fall back to single
                        // `toggleOpenState` calls. CRITICAL: open
                        // HIGHEST index first. Each open inserts the
                        // container's child rows immediately AFTER its
                        // index, shifting every later row down — so
                        // opening `toOpen` ascending invalidates all
                        // the still-pending indices (they now point at
                        // the wrong rows), leaving most matching
                        // containers collapsed and their annotations
                        // hidden. Iterating from the bottom up means
                        // each open only shifts rows BELOW indices
                        // we've already processed, so the remaining
                        // indices stay valid.
                        for (let k = toOpen.length - 1; k >= 0; k--) {
                            try {
                                rp._wvOrigToggleOpenState(toOpen[k], true);
                            } catch (e) {}
                        }
                    } else {
                        // Last resort — should never hit since we
                        // always capture some open method.
                        for (const i of toOpen) {
                            try { itemsView.openContainer(i); } catch (e) {}
                        }
                    }
                }
            } finally {
                rp._wvFilterSelfCall = wasFlag;
                WV_GCI_CTX = null;
            }
            dbg("[Weavero][filter] expanded; total rows now: "
                + origGetRowCount());
        }

        _mark("pass1");
        // Pass 2 — collect indices to keep: primary matches + every
        // ancestor row that contains them (so the tree shape is
        // preserved). For item-scope-alone matches the entire subtree
        // of the primary regular item is kept too.
        const total = origGetRowCount();
        // Build via Set to dedupe — when a regular item is primary,
        // its inner loop pushes descendant indices that the outer
        // loop will also visit, so naive push-twice produces dupes.
        const keepSet = new Set();
        // Item ids this pass judged PRIMARY, handed to the selection
        // reconcile so it need not recompute the same verdicts.
        const _primaryIDs = new Set<number>();
        const pushKeep = (i) => {
            if (!keepSet.has(i)) {
                // Trace WHICH rule first added each row. Helps
                // diagnose why a non-matching row slipped past the
                // filter — the next debug line in the apply pass is
                // the one that added it.
                try {
                    const r = origGetRow(i);
                    const rid = r && r.ref && r.ref.id;
                    const rlvl = r && r.level;
                    if (rid != null && (rlvl == null || rlvl >= 0)) {
                        dbg("[Weavero][keep+] id=" + rid
                            + " lvl=" + rlvl);
                    }
                } catch (e) {}
            }
            keepSet.add(i);
        };
        // (Per-apply caches `isPrimary` / `hasMatch` are defined
        // earlier — above the cascade pass — so both passes share
        // the memoised verdicts.)
        // Hoist the "any per-section filter active?" check — it's
        // an invariant of the apply pass but was being recomputed
        // for every descendant inside `subtreeIncludes`.
        const anyGroupActive = state.groups
            && state.groups.some(g => this._isGroupActive(g));
        const activeGroups = anyGroupActive
            ? state.groups.filter(g => this._isGroupActive(g))
            : [];
        // Quick-search scope helper, consumed by the final scope
        // enforcement pass below. A row-kind counts as suppressed only
        // when a quick search is active AND every scoped active group
        // excludes it (mirrors `_rowIsPrimary`'s "passes some group"
        // semantics).
        const qsScopedGroups = this._currentQuickSearchValue
            ? activeGroups.filter(g => g.quickSearchScope)
            : [];
        const kindSuppressed = (k) => qsScopedGroups.length > 0
            && qsScopedGroups.every(g => g.quickSearchScope[k] === false);
        // Strict per-row matching: every row is judged on its own
        // primary status. Non-primary rows are kept ONLY when they
        // happen to be ancestors of a primary descendant (so the
        // tree shape stays valid). Descendants of a primary parent
        // are NOT auto-kept — they're visited in the outer loop and
        // will be kept iff they themselves pass the filter, which is
        // the behaviour the user expects from each filter trigger
        // (e.g. picking `itemType=book` shows books, not their
        // attachments / notes / annotations as well).
        // Keep a row if it's primary OR if any DESCENDANT (anywhere
        // in the database subtree, not just currently in `_rows`)
        // is primary. The latter case — DB-based ancestor-keep — is
        // what makes closing a container leave it visible (closed,
        // ready to be re-opened) instead of dropping it entirely
        // once Zotero removes the children from `_rows`.
        // Orphan-row guard: under certain conditions (corrupt
        // saved state, prior `_refreshContainer` bugs leaving stale
        // entries) `_rows` contains rows whose parent item isn't
        // actually present at level-1 above them. Example: an
        // annotation row at lvl=2 with `parent=7` (Ebook), but no
        // Ebook row at lvl=1 directly above it — the annotation is
        // an "orphan" and will render visually nested under whatever
        // lvl=1 row happens to sit above it, producing the visible
        // duplicate-annotation bug.
        const isOrphanRow = (j) => {
            let row;
            try { row = origGetRow(j); } catch (e) { return false; }
            if (!row || !row.ref) return false;
            const parentID = row.ref.parentItemID;
            if (!parentID) return false;
            const lvl = row.level || 0;
            if (lvl <= 0) return false;
            for (let k = j - 1; k >= 0; k--) {
                let kr;
                try { kr = origGetRow(k); } catch (e) { continue; }
                if (!kr || !kr.ref) continue;
                const kLvl = kr.level || 0;
                if (kLvl >= lvl) continue;
                if (kLvl === lvl - 1) {
                    return kr.ref.id !== parentID;
                }
                return true;
            }
            return true;
        };
        dbg("[Weavero][keep-pass] === PRIMARIES + HAS-MATCH ===");
        for (let j = 0; j < total; j++) {
            let row;
            try { row = origGetRow(j); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            // Structural section-header rows (Zotero's group-by-library
            // multi-selection view, zotero#5954) carry a Library ref, not an
            // item. Always keep them so the grouped layout survives the filter,
            // and skip the item-match logic below (which would drop them and
            // misalign keep[]). No-op on builds without such rows — every
            // current item-tree row's ref has `isRegularItem`.
            const sref = row.ref;
            // Note this site never tested "spacer" explicitly -- spacers were
            // kept only because their ref lacks `isRegularItem`. The
            // `isObjectRow` test now covers them directly.
            if (this._wvIsStructuralRow(row)
                || typeof sref.isRegularItem !== "function") {
                pushKeep(j);
                continue;
            }
            if (isOrphanRow(j)) continue;
            const item = row.ref;
            if (isPrimary(item)) {
                // Publish it for the selection reconcile (2026-08-07).
                // That pass used to re-derive primary status by calling
                // `_rowIsPrimary` on EVERY filtered row — 16k predicate
                // calls on a large parent filter, measured as 400-600ms
                // of the `sync - ring` gap, i.e. often more than the
                // filter apply itself. This loop has the answer already.
                if (item && item.id != null) _primaryIDs.add(item.id);
                pushKeep(j);
            } else if (hasMatch(item)) {
                pushKeep(j);
            }
        }
        dbg("[Weavero][keep-pass] === NON-MATCH ATTACHMENTS ===");
        // "Show Non-Matching Attachments" (pref ON): keep the
        // attachment / note children of any kept regular-item parent
        // even when those children don't themselves match the filter.
        // Without this the toggle has no visible effect — Zotero
        // loads the children into _rows (our getChildItems patch
        // returns all of them when the pref is on), but Pass 2 above
        // drops the non-matching siblings of the matched attachment.
        // The user's WV-DEMO-B test case: parent has one matched PDF
        // and one non-matching Web Link; the Web Link should appear
        // under the parent when the toggle is on.
        if (Zotero.Prefs.get("weavero.showContextAttachmentRows")) {
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!keepSet.has(j)) continue;
                const item = row.ref;
                if (!(item.isRegularItem && item.isRegularItem())) continue;
                const lvl = row.level || 0;
                for (let k = j + 1; k < total; k++) {
                    let kr;
                    try { kr = origGetRow(k); } catch (e) { break; }
                    if (!kr || !kr.ref) break;
                    const kLvl = kr.level || 0;
                    if (kLvl <= lvl) break;
                    if (kLvl !== lvl + 1) continue;
                    const cItem = kr.ref;
                    const isAtt = cItem.isAttachment
                        && cItem.isAttachment();
                    const isNote = cItem.isNote
                        && cItem.isNote();
                    if (isAtt || isNote) pushKeep(k);
                }
            }
        }
        // "Show Non-Matching Annotations" (pref ON, i.e.
        // `hideContextAnnotationRows = false`): keep the annotation
        // children of any kept file-attachment parent even when those
        // annotations don't themselves match the chip. Same shape
        // as the attachment rule above, just one level deeper. Test
        // case: file attachment with a matched-color annotation and
        // a different-color annotation as a sibling — the sibling
        // annotation should appear when the toggle is on.
        dbg("[Weavero][keep-pass] === NON-MATCH ANNOTATIONS (gated on pref) ===");
        if (!Zotero.Prefs.get("hideContextAnnotationRows")) {
            dbg("[Weavero][keep-pass] PREF ALLOWS non-match annotations");
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!keepSet.has(j)) continue;
                const item = row.ref;
                if (!(item.isFileAttachment
                    && item.isFileAttachment())) continue;
                const lvl = row.level || 0;
                for (let k = j + 1; k < total; k++) {
                    let kr;
                    try { kr = origGetRow(k); } catch (e) { break; }
                    if (!kr || !kr.ref) break;
                    const kLvl = kr.level || 0;
                    if (kLvl <= lvl) break;
                    if (kLvl !== lvl + 1) continue;
                    const cItem = kr.ref;
                    const isAnn = cItem.isAnnotation
                        && cItem.isAnnotation();
                    if (isAnn) pushKeep(k);
                }
            }
        }
        // User-revealed containers (badge clicked): force-keep ALL
        // direct children regardless of whether they pass the
        // filter. This is the explicit "show me what's hidden here"
        // opt-in, separate from the dimmer "manual expand reveals
        // filter-passing children" rule below.
        dbg("[Weavero][keep-pass] === USER-REVEALED FORCE-KEEP ===");
        if (this._userRevealedAllIDs && this._userRevealedAllIDs.size) {
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!this._userRevealedAllIDs.has(row.ref.id)) continue;
                const lvl = row.level || 0;
                dbg("[Weavero][keep-pass] revealed root id="
                    + row.ref.id + " lvl=" + lvl);
                for (let k = j + 1; k < total; k++) {
                    let kr;
                    try { kr = origGetRow(k); } catch (e) { break; }
                    if (!kr) break;
                    const kLvl = kr.level || 0;
                    if (kLvl <= lvl) break;
                    if (kLvl === lvl + 1) pushKeep(k);
                }
            }
        }
        // User-opened containers: keep the direct children that
        // PASS the filter's per-row check (`_rowPassesFilters`).
        // Two distinct outcomes here:
        //
        //   - Neutral children — kinds that no chip in the group
        //     actively targets (e.g. annotations under a File Type
        //     = PDF filter). The chip relaxes for them so they pass
        //     `_rowPassesFilters`, but they don't get a kind-match
        //     so they're never primary. Manual expand should still
        //     reveal them, so we force-keep here.
        //
        //   - Actively-failing children — a row that violates a
        //     chip (e.g. a Snapshot under File Type = PDF, kind is
        //     targeted by File Type but value mismatches). These
        //     fail `_rowPassesFilters` and stay hidden even when
        //     the parent is manually expanded.
        dbg("[Weavero][keep-pass] === USER-OPENED FORCE-KEEP === opened="
            + JSON.stringify(this._userOpenedIDs
                ? [...this._userOpenedIDs] : [])
            + " anyGroupActive=" + anyGroupActive);
        if (this._userOpenedIDs && this._userOpenedIDs.size) {
            const activeGroups = (state.groups || [])
                .filter(g => this._isGroupActive(g));
            // V9-COMPAT: on v10, non-matching attachments / notes are
            // hidden upstream by our `_patchHideContextAttachments`
            // patch on FileItemTreeRow/ZoteroItemTreeRow. On v9 those
            // row classes don't exist, so neutral attachment children
            // pass through and become visible — defeating the user's
            // "Show Non-Matching Attachments" toggle. Mirror the
            // behaviour here: when the pref is off and we're on v9,
            // require the child to actively match (`hasMatch`), not
            // just be neutral under `_rowPassesFilters`.
            const hideContext = isV9
                && !Zotero.Prefs.get("weavero.showContextAttachmentRows");
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!this._userOpenedIDs.has(row.ref.id)) continue;
                // The container's OWN row must survive the filter first.
                // Force-keeping children of a container that was itself
                // filtered out strands them: they render at their original
                // depth with no parent above, so a child attachment/note
                // appears among the top-level rows (reported 2026-08-04 --
                // "random child items displayed at the top level" under an
                // Annotation Color + Item Type filter). `keepSet` grows as
                // this loop runs, so a legitimately kept container that is
                // itself a force-kept child still passes on the next
                // iteration (rows are visited parent-before-child).
                if (!keepSet.has(j)) continue;
                const lvl = row.level || 0;
                // User's rule for manual twisty-expand under an active
                // Weavero filter: if the container HAS a matching child,
                // show ONLY the matching child(ren) (filter wins, chevron
                // offers to reveal the rest). Only when the container has
                // NO matching child does manual-expand fall back to
                // showing ALL children (otherwise expanding would reveal
                // nothing — e.g. an attachment whose annotations don't
                // match Has Bookmarks). So skip the force-keep for this
                // container when it has any matching child.
                if (anyGroupActive) {
                    let hasMatchingChild = false;
                    for (let k = j + 1; k < total; k++) {
                        let kr;
                        try { kr = origGetRow(k); } catch (e) { break; }
                        if (!kr) break;
                        const kLvl = kr.level || 0;
                        if (kLvl <= lvl) break;
                        if (kLvl !== lvl + 1) continue;
                        if (kr.ref && hasMatch(kr.ref)) {
                            hasMatchingChild = true;
                            break;
                        }
                    }
                    if (hasMatchingChild) continue;
                }
                for (let k = j + 1; k < total; k++) {
                    let kr;
                    try { kr = origGetRow(k); } catch (e) { break; }
                    if (!kr) break;
                    const kLvl = kr.level || 0;
                    if (kLvl <= lvl) break;
                    // Direct children only — deeper descendants get
                    // visited on a separate iteration of this outer
                    // loop if their parent is also user-opened.
                    if (kLvl !== lvl + 1) continue;
                    const cItem = kr.ref;
                    if (!cItem) continue;
                    // OR across active groups: keep if it passes
                    // ANY group's per-row check.
                    const ok = activeGroups.some(g =>
                        this._rowPassesFilters(cItem, g));
                    if (!ok) continue;
                    // V9-COMPAT context-hide gate — scoped to
                    // ATTACHMENTS / NOTES only. The "Show Non-
                    // Matching Attachments" toggle must not affect
                    // annotations (those are governed by Zotero's
                    // own `hideContextAnnotationRows` pref via the
                    // separate "Show Non-Matching Annotations"
                    // toggle). Without this kind-gate, an annotation
                    // that passes the per-row check but doesn't have
                    // hasMatch=true would be dropped just because
                    // the attachment toggle is off.
                    if (hideContext) {
                        const isAtt = cItem.isAttachment
                            && cItem.isAttachment();
                        const isNote = cItem.isNote
                            && cItem.isNote();
                        if ((isAtt || isNote)
                            && !hasMatch(cItem)) continue;
                    }
                    pushKeep(k);
                }
            }
        }
        // Force-include rows whose underlying item the user just
        // CREATED in this session (tracked via the item-add notifier).
        // Without this, a freshly created item that doesn't yet match
        // the active filter (e.g. a new Journal Article with no
        // annotations under an annotation-color filter) gets hidden
        // immediately and the items pane lands in an inconsistent
        // state — Zotero selects the new item but our filter has
        // dropped its row, so itemBox can't find it. We also walk up
        // and keep ancestor rows so the tree path stays valid.
        // Force-include items added in the last RECENT_WINDOW_MS.
        // Was a session-lifetime `Set` — items the user created at
        // any point during the session stayed visible regardless of
        // filter match, which confused testing of newly-built items
        // (e.g. a "Has Related" filter showing items with zero
        // related items, because the items had been created earlier
        // in the same session). A short timestamped window covers
        // the original "itemBox can't find a just-created item"
        // race without lingering past the user's attention.
        const recentIDs: any = this._wvRecentlyAddedItemIDs;
        const RECENT_WINDOW_MS = 10000;
        const isRecentMap = recentIDs && typeof recentIDs.get === "function";
        if (recentIDs && recentIDs.size) {
            const cutoff = Date.now() - RECENT_WINDOW_MS;
            // Drop expired entries up-front so the set doesn't grow
            // unboundedly across long sessions.
            if (isRecentMap) {
                for (const [id, ts] of recentIDs) {
                    if (ts < cutoff) recentIDs.delete(id);
                }
            }
            const isFresh = (id) => {
                if (!isRecentMap) return recentIDs.has(id);
                const ts = recentIDs.get(id);
                return ts !== undefined && ts >= cutoff;
            };
            if (recentIDs.size) {
                for (let j = 0; j < total; j++) {
                    let row;
                    try { row = origGetRow(j); } catch (e) { continue; }
                    if (!row || !row.ref) continue;
                    if (!isFresh(row.ref.id)) continue;
                    pushKeep(j);
                    let lvl = row.level || 0;
                    for (let k = j - 1; k >= 0 && lvl > 0; k--) {
                        let kr;
                        try { kr = origGetRow(k); } catch (e) { continue; }
                        if (!kr) continue;
                        const kLvl = kr.level || 0;
                        if (kLvl < lvl) {
                            pushKeep(k);
                            lvl = kLvl;
                        }
                    }
                }
            }
        }
        _mark("pass2");
        // ---- Quick-search scope enforcement (final gate) ----
        // Whatever keep-rule above admitted a row, an active quick-
        // search scope must win: drop every kept row whose KIND the
        // scope excludes, EXCEPT genuine ancestors of a kept in-scope
        // row (so in-scope descendants can still nest in the tree).
        // One tree-order pass with an ancestor stack — an in-scope (or
        // kept-as-ancestor) row marks its parent "needed", so a
        // suppressed parent holding a kept in-scope attachment survives
        // while a leaf annotation or a standalone suppressed parent
        // does not. Without this the scope is a no-op: the context /
        // search-match keep rules silently re-add out-of-scope rows
        // (the "Apply to" dropdown appeared to do nothing).
        if (qsScopedGroups.length && keepSet.size) {
            const keptArr = [...keepSet].sort((a: number, b: number) => a - b);
            const stack: any[] = [];
            const toDrop: number[] = [];
            const settle = (node: any) => {
                const survives = !node.suppressed || node.keepForDesc;
                if (!survives) toDrop.push(node.idx);
                else if (stack.length) stack[stack.length - 1].keepForDesc = true;
            };
            for (const j of keptArr) {
                let row: any;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                const lvl = row.level || 0;
                while (stack.length
                    && stack[stack.length - 1].lvl >= lvl) {
                    settle(stack.pop());
                }
                const kind = this._rowKindOf(row.ref);
                stack.push({
                    idx: j, lvl,
                    suppressed: !!(kind && kindSuppressed(kind)),
                    keepForDesc: false,
                });
            }
            while (stack.length) settle(stack.pop());
            for (const idx of toDrop) keepSet.delete(idx);
            if (toDrop.length) {
                dbg("[Weavero][filter] QS-scope dropped "
                    + toDrop.length + " out-of-scope row(s)");
            }
        }
        // Materialise the deduped keep set as a sorted array. The
        // rest of the apply logic (`getRow` patch etc.) consumes
        // this as the row-index translation table.
        const keep = [...keepSet].sort((a: number, b: number) => a - b);
        // Cheap FNV-1a over the kept indices (plus lengths) — when the
        // rebuild lands on an IDENTICAL answer, the final
        // tree.invalidate() (~100-200ms of pure re-render) is skipped.
        // Content changes without keep changes (rename etc.) repaint via
        // Zotero's own notifier-driven invalidates, not ours.
        let _keepHash = 0x811c9dc5 ^ keep.length ^ (rp._rows.length << 8);
        for (let hi = 0; hi < keep.length; hi++) {
            _keepHash = (_keepHash ^ (keep[hi] as number)) >>> 0;
            _keepHash = Math.imul(_keepHash, 0x01000193) >>> 0;
        }
        // IDs of every row that survives into the filtered view — used
        // below so the chevron's hidden tally counts only children that
        // are genuinely off-screen, not ones the cascade already shows.
        const visibleIDs = new Set<number>();
        for (const vj of keep) {
            let vrow;
            try { vrow = origGetRow(vj); } catch (e) { continue; }
            if (vrow && vrow.ref) visibleIDs.add(vrow.ref.id);
        }
        // Per-container hidden-children count. For each container row
        // in keep, count the DB direct children that WOULDN'T survive
        // the current filter — i.e. wouldn't be primary themselves
        // and wouldn't have a primary descendant. Stored for the
        // (future) badge renderer to consume. Only containers with
        // hidden > 0 are recorded.
        const hiddenCounts = new Map<number, number>();
        for (const j of keep) {
            let row;
            try { row = origGetRow(j); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            const it = row.ref;
            let childIds: number[] = [];
            if (it.isRegularItem && it.isRegularItem()) {
                childIds = [
                    ...((it.getAttachments && it.getAttachments()) || []),
                    ...((it.getNotes && it.getNotes()) || []),
                ];
            } else if (it.isFileAttachment && it.isFileAttachment()) {
                childIds = ((it.getAnnotations && it.getAnnotations()) || [])
                    .map(a => a.id);
            } else {
                continue;
            }
            if (!childIds.length) continue;
            // Revealed containers keep counting non-matching children
            // (on screen only because the chevron revealed them) so the
            // collapse toggle keeps its tally; otherwise a child counts
            // as hidden only when it's actually off-screen.
            const parentRevealed = !!(this._userRevealedAllIDs
                && this._userRevealedAllIDs.has(it.id));
            let hidden = 0;
            for (const cid of childIds) {
                const cit = Zotero.Items.get(cid);
                if (!cit) continue;
                // A child that satisfies the filter is never hidden.
                if (hasMatch(cit)) continue;
                // A non-matching child only counts as hidden when it
                // isn't already displayed. When a container matched on
                // its OWN property (e.g. Has Bookmarks on an attachment)
                // the cascade shows its children even though none of
                // them match — tallying those produced a phantom chevron
                // on a fully-expanded container.
                if (parentRevealed || !visibleIDs.has(cid)) hidden++;
            }
            if (hidden > 0) hiddenCounts.set(it.id, hidden);
        }
        this._wvHiddenCounts = hiddenCounts;
        // For the per-row chevron indicator: record, per CONTAINER
        // with at least one hidden direct child, the ID of the FIRST
        // VISIBLE child sibling. The render hook prepends a chevron
        // only on that one row so the indicator appears once per
        // affected container instead of cluttering every visible
        // sibling. Covers both layers:
        //  - file attachment parent + annotation children
        //  - regular item parent + attachment / note children
        const firstVisibleChild = new Map<number, number>();
        for (const j of keep) {
            let row;
            try { row = origGetRow(j); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            const it = row.ref;
            const parentID = it.parentItemID;
            if (!parentID) continue;
            if (!hiddenCounts.has(parentID)) continue;
            if (firstVisibleChild.has(parentID)) continue;
            firstVisibleChild.set(parentID, it.id);
        }
        this._wvFirstVisibleAnnUnderAtt = firstVisibleChild;
        // Mark active so the next inactive apply knows it's an
        // active→inactive transition (and can clear reveal state).
        this._wvFilterWasActive = true;
        // Snapshot of `_rows.length` at the moment we built keep.
        // Used by the patched accessors to detect "Zotero rebuilt
        // _rows behind our back" — typically a quick-search refresh
        // (Zotero's `setFilter` empties + re-fills `_rows` via the
        // collection-tree-row's `getItems()`). When that happens our
        // keep[] is stale: its indices point into the OLD `_rows`,
        // so `keep[i]` may either be past the new tail (→ getRow
        // returns undefined → upstream `_sort` does `.ref` → crash,
        // surfaced as "Error loading items list") or land on a
        // DIFFERENT row than before (→ duplicate-looking results in
        // the items pane). Falling through to the original methods
        // until the next reapply rebuilds keep is the safe move —
        // the MutationObserver fires on the tree DOM repaint that
        // follows and re-installs a fresh translation.
        const keepRowsLen = rp._rows.length;
        // Published for `_captureSelectedItemIDs`: the same watermark the
        // `stale()` guard below uses. While it disagrees with
        // `rp._rows.length`, `getRow` passes indices through UNTRANSLATED,
        // so resolving a (filtered-space) selection index yields the wrong
        // item -- see the capture helper for what that cost.
        rp._wvKeepRowsLen = keepRowsLen;

        dbg("[Weavero][filter] kept " + keep.length
            + " of " + total + " rows");

        // Patch the data layer on the rowProvider — the virtualized
        // table reads through it directly (see itemTree.jsx:1362).
        // Patching `itemsView.getRow` alone would only catch the
        // ItemTree wrapper, not the prop the virtualized table calls.
        //
        // SELF flag: rp's own internals (e.g. _toggleOpenState) call
        // `this.getRow(idx)` / `this.getLevel(idx)` etc. with REAL
        // indices into `_rows`. Without a bypass our translating
        // patches double-translate (keep[realIdx]) and the toggle
        // operates on the wrong row — twisty/+ key would no-op or
        // open the wrong subtree. The flag is set during calls into
        // the original toggleOpenState / expandRows / collapseRows,
        // so any nested data-access falls through to the raw method.
        const SELF = "_wvFilterSelfCall";
        const self = this;

        // Defensive bounds-check: between an original toggle's
        // `runListeners('update', ..., {restoreSelection: true})` and
        // our reapply, `_rows` may have shrunk while `keep` still
        // holds an index past the new tail. Returning `undefined`
        // (rather than letting the original throw "non-existent tree
        // row N") lets the caller no-op cleanly. The pre-crash
        // path `_restoreSelection -> selection.select(realIdx) ->
        // itemSelected -> getRow(...).ref` would still throw on
        // `.ref`, but the fix below (sync reapply before listeners
        // fire) prevents that path from being reached.
        const safeReal = function (idx): number {
            const r = keep[idx] as number;
            if (r === undefined) return -1;
            if (r >= rp._rows.length) return -1;
            return r;
        };

        // Helper: keep is stale whenever `_rows.length` no longer
        // matches what we measured at apply time. Translating through
        // a stale keep is what produced the search-clear crash AND
        // the duplicate-row glitch. We fall through to the unfiltered
        // original until the MutationObserver-driven reapply runs.
        const stale = () => rp._rows.length !== keepRowsLen;

        // V9-COMPAT: Zotero 9 calls `getRow(index).ref` /
        // `.isOpen` UNCONDITIONALLY in several places — most notably
        // `isContainer` / `isContainerOpen`, which on v9 are
        // instance-field arrow functions (NOT prototype methods), so
        // our `wrapProbe` never replaces them and they hit this
        // patched `getRow` directly. If we ever return `undefined`
        // (out-of-range index, or a stale window where a cached
        // larger row count is still being iterated) the `.ref`
        // access throws and crashes the whole window via
        // `Zotero.crash()`. v10 callers tolerated `undefined`, but v9
        // does not — so this patched getRow must NEVER return
        // undefined. `safeRaw` clamps every lookup to a valid row.
        const safeRaw = function (i) {
            const len = rp._rows.length;
            if (!len) return rp._wvOrigGetRow(0);
            let j = i;
            if (j == null || j < 0 || j >= len) j = 0;
            const row = rp._wvOrigGetRow(j);
            return row === undefined ? rp._wvOrigGetRow(0) : row;
        };
        rp.getRow = function (idx) {
            // The SELF / stale branches differ between versions ONLY
            // for out-of-range indices: v9 must never see `undefined`
            // (its `isContainer`/`isContainerOpen` deref it and crash
            // the window), so it clamps via `safeRaw`; v10 tolerated
            // `undefined` and is left byte-identical to pre-dev.70 to
            // avoid any phantom-row flash in a stale window.
            if (this[SELF]) {
                return isV9 ? safeRaw(idx) : rp._wvOrigGetRow(idx);
            }
            if (stale()) {
                return isV9 ? safeRaw(idx) : rp._wvOrigGetRow(idx);
            }
            // These branches already returned a valid (clamped) row on
            // both versions pre-dev.70 — `safeRaw` is equivalent here,
            // with a harmless extra undefined-guard.
            const r = safeReal(idx);
            if (r < 0) return safeRaw(idx);
            return safeRaw(r);
        };
        rp.getRowCount = function () {
            if (this[SELF]) return rp._wvOrigGetRowCount();
            if (stale()) return rp._wvOrigGetRowCount();
            return keep.length;
        };
        // The item pane's "N items in this view" message reads
        // `itemsView.objectRowCount` (itemPane.js), which reduces over
        // `this._rows` DIRECTLY -- it never goes through getRow /
        // getRowCount, so our translation does not reach it and the pane
        // reports the UNFILTERED library count while a chip is active.
        // Measured 2026-08-08 on the real library: pane said "17,928
        // items in this view" with 15,329 rows actually shown.
        //
        // This is Weavero's discrepancy to fix, and is deliberately
        // scoped to it. The related upstream bug -- expanding a row does
        // not refresh the message at all, because zoteroPane.js only
        // updates it from `itemsView.onRefresh` (added for
        // zotero/zotero#5913, whose own comment lists only refresh-driven
        // causes) -- is NOT patched here: it affects every Zotero user,
        // and two mechanisms racing on the same message once upstream
        // fixes it would be worse than the bug.
        //
        // Patched on the itemsView INSTANCE (the getter lives on the
        // prototype), so teardown is a plain `delete`. The host is
        // remembered on `rp` because the teardown sites only have `rp`.
        try {
            const findProtoGetter = (obj, name) => {
                let o = obj;
                while (o) {
                    const d = Object.getOwnPropertyDescriptor(o, name);
                    if (d && typeof d.get === "function") return d.get;
                    o = Object.getPrototypeOf(o);
                }
                return null;
            };
            // Capture the REAL prototype getter exactly once. After the
            // first install the own property IS our getter, so re-reading
            // it here would capture ourselves and recurse. Cached on the
            // itemsView and cleared on teardown.
            const host: any = itemsView;
            if (!host._wvOrigObjCountGetter) {
                const g = findProtoGetter(
                    Object.getPrototypeOf(itemsView), "objectRowCount");
                if (g) host._wvOrigObjCountGetter = g;
            }
            const origObjCount = host._wvOrigObjCountGetter;
            // REDEFINE ON EVERY APPLY. The previous version installed once
            // and skipped thereafter if the own property existed, so the
            // getter kept closing over the FIRST apply's `keep` and
            // watermark. Every later apply then tripped its own stale()
            // check and fell through to the UNFILTERED count -- the item
            // pane read "20,508 items in this view" over a 2,190-row
            // filtered view, while the tiers (which go through the
            // per-apply getRow/getRowCount patches) stayed correct.
            // Reported 2026-08-08.
            if (origObjCount) {
                Object.defineProperty(itemsView, "objectRowCount", {
                    configurable: true,
                    get: function () {
                        try {
                            // Same contract as the other patched
                            // accessors: a stale keep means fall through
                            // to the unfiltered original.
                            if (stale()) return origObjCount.call(this);
                            let n = 0;
                            for (let i = 0; i < keep.length; i++) {
                                const row = rp._wvOrigGetRow(keep[i] as number);
                                if (row && row.isObjectRow) n++;
                            }
                            return n;
                        }
                        catch (e) {
                            try { return origObjCount.call(this); }
                            catch (e2) { return 0; }
                        }
                    },
                });
                rp._wvObjRowCountHost = itemsView;
            }
        } catch (e) {}
        if (rp._wvOrigGetLevel) {
            rp.getLevel = function (idx) {
                if (this[SELF]) return rp._wvOrigGetLevel(idx);
                if (stale()) return rp._wvOrigGetLevel(idx);
                const r = safeReal(idx);
                if (r < 0) return 0;
                return rp._wvOrigGetLevel(r);
            };
        }
        // The Container probes call `this.getRow(idx)` internally —
        // method-dispatch on `rp.getRow` (our patched translating
        // version). Set SELF for the duration of the original call so
        // the inner getRow sees the raw real index instead of doing a
        // second `keep[idx]` translation. Same for getLevel-using
        // probes (only isContainerEmpty in some impls), but
        // getLevel/getRow themselves are field-accesses with no
        // dispatch, so they don't need the flag.
        const wrapProbe = function (origFn, fallback) {
            return function (idx) {
                if (this[SELF]) return origFn.call(this, idx);
                if (stale()) return origFn.call(this, idx);
                const realIdx = safeReal(idx);
                if (realIdx < 0) return fallback;
                const wasFlag = this[SELF];
                this[SELF] = true;
                try { return origFn.call(this, realIdx); }
                finally { this[SELF] = wasFlag; }
            };
        };
        if (rp._wvOrigIsContainer) {
            rp.isContainer = wrapProbe(rp._wvOrigIsContainer, false);
        }
        if (rp._wvOrigIsContainerOpen) {
            rp.isContainerOpen = wrapProbe(rp._wvOrigIsContainerOpen, false);
        }
        if (rp._wvOrigIsContainerEmpty) {
            rp.isContainerEmpty = wrapProbe(rp._wvOrigIsContainerEmpty, true);
        }

        // Twisty clicks (toggleOpenState) and `+`/`-` keyboard
        // shortcuts (expandRows / collapseRows) hand FILTERED indices
        // to the rowProvider. Translate through `keep`, set the SELF
        // flag so internal `this.getRow`/`this.getLevel` calls inside
        // the original see the raw real index. The original then
        // mutates `_rows` AND fires `runListeners('update', ...,
        // {restoreSelection: true})`, which dispatches a selection
        // restore that reads `rowMap[id]` (REAL idx after the toggle)
        // and calls `selection.select(realIdx)` — but `selection` is
        // in FILTERED space, so the table looks up `getRow(realIdx)`
        // which lands past the end of `keep` and crashes.
        //
        // Defer the listeners until AFTER we rebuild `keep`, so
        // selection restoration sees a fresh filtered view. We swap
        // `runListeners` for a queue while the original runs, rebuild
        // keep synchronously, then flush.
        // Track manual user opens / closes so the next keep rebuild
        // force-keeps the children of containers the user just expanded.
        // Without this, opening a non-matching container reveals its
        // children for one frame and the reapply immediately drops them
        // again because they don't satisfy the filter.
        //
        // Call BEFORE the original runs — the direction is inferred from
        // the row's CURRENT state, which the original is about to flip.
        // The same inference serves both the toggle and the multi-row
        // paths: upstream `_expandRows` only toggles rows that are closed
        // and `collapseRows` only rows that are open, so "was open" ==
        // "this call is a collapse" in every case.
        const noteUserToggle = function (realIdx) {
            try {
                const row = rp._rows[realIdx as number];
                const wasOpen = row && row.isOpen;
                const id = row && row.ref && row.ref.id;
                if (id == null) return;
                if (!self._userOpenedIDs) self._userOpenedIDs = new Set();
                if (!self._userClosedIDs) self._userClosedIDs = new Set();
                if (wasOpen) {
                    // Collapsing → record so the cascade and
                    // `_expandMatchParents` skip it on later reapplies.
                    self._userOpenedIDs.delete(id);
                    self._userClosedIDs.add(id);
                } else {
                    // Expanding → record so reapply force-keeps the
                    // children even if they don't satisfy the filter.
                    self._userOpenedIDs.add(id);
                    self._userClosedIDs.delete(id);
                }
            } catch (e) {}
        };
        const wrapToggle = function (origFn) {
            return function (filteredIdx, skipRowMapRefresh) {
                if (this[SELF]) {
                    return origFn.call(this, filteredIdx, skipRowMapRefresh);
                }
                if (stale()) {
                    return origFn.call(this, filteredIdx, skipRowMapRefresh);
                }
                const realIdx = keep[filteredIdx];
                if (realIdx === undefined) return;
                noteUserToggle(realIdx);
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...args) { queued.push(args); };
                try {
                    return origFn.call(this, realIdx, skipRowMapRefresh);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const args of queued) {
                        try { rp.runListeners.apply(rp, args); }
                        catch (e) {
                            dbg("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        const wrapMulti = function (origFn) {
            return function (indices) {
                if (this[SELF]) return origFn.call(this, indices);
                if (stale()) return origFn.call(this, indices);
                const real = (indices || []).map(i => keep[i])
                    .filter(x => x !== undefined);
                // Same user-open bookkeeping as the single-row toggle.
                // Without it the keyboard paths (multi-select ArrowRight /
                // ArrowLeft -> itemTree.expandSelectedRows ->
                // rowProvider.expandRows) opened the container but the
                // immediate reapply dropped its non-matching children
                // again -- an open twisty with nothing under it, while
                // clicking the same twisty by hand worked (2026-08-04).
                for (const realIdx of real) noteUserToggle(realIdx);
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...args) { queued.push(args); };
                try {
                    return origFn.call(this, real);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const args of queued) {
                        try { rp.runListeners.apply(rp, args); }
                        catch (e) {
                            dbg("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        if (rp._wvOrigToggleOpenState) {
            rp.toggleOpenState = wrapToggle(rp._wvOrigToggleOpenState);
        }
        if (rp._wvOrigExpandRows) {
            rp.expandRows = wrapMulti(rp._wvOrigExpandRows);
        }
        if (rp._wvOrigCollapseRows) {
            rp.collapseRows = wrapMulti(rp._wvOrigCollapseRows);
        }

        // `+` (expandAllRows) and `-` (collapseAllRows) keys take no
        // indices — they iterate `this.rowCount` (= `_rows.length`,
        // raw real count) and call `this.isContainer(i)` etc. with
        // real indices. Run them with SELF set so our patched probes
        // pass-through to the originals (real-space). Same listener
        // queue + sync reapply pattern as wrapToggle, since the
        // original fires `runListeners('update', ..., {restoreSelection})`
        // at the end.
        const wrapAll = function (origFn) {
            return function (...args) {
                if (this[SELF]) return origFn.apply(this, args);
                const wasFlag = this[SELF];
                this[SELF] = true;
                const queued = [];
                const origListeners = rp.runListeners;
                rp.runListeners = function (...lArgs) { queued.push(lArgs); };
                try {
                    return origFn.apply(this, args);
                } finally {
                    rp.runListeners = origListeners;
                    this[SELF] = wasFlag;
                    self._reapplyFilterSync();
                    for (const lArgs of queued) {
                        try { rp.runListeners.apply(rp, lArgs); }
                        catch (e) {
                            dbg("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        if (rp._wvOrigExpandAllRows) {
            rp.expandAllRows = wrapAll(rp._wvOrigExpandAllRows);
        }
        if (rp._wvOrigCollapseAllRows) {
            rp.collapseAllRows = wrapAll(rp._wvOrigCollapseAllRows);
        }

        // V9-COMPAT: Zotero 9's virtualized-table React props are
        // captured at render time as bound closures. `getRowCount` is
        // hardwired to `() => this._rows.length` and bypasses our
        // `iv.getRowCount` patch entirely. Rebind the live prop so the
        // table reads our filtered count. We do the same for the
        // toggle / probe props — they were captured by VALUE so the
        // table still calls the original arrow-function fields, not
        // our wrapped own-property versions on the itemsView.
        //
        // CRITICAL: the underlying WindowedList ALSO captures
        // `getItemCount` at its construction time (virtualized-table
        // line 1114). That capture happens at Zotero startup before
        // our plugin loads, so `_jsWindow.getItemCount` always points
        // at the original `() => this._rows.length`. Patching the
        // React prop alone is insufficient — the windowed list never
        // re-reads the prop. We also overwrite `_jsWindow.getItemCount`.
        if (isV9 && itemsView.tree && itemsView.tree.props) {
            const tp: any = itemsView.tree.props;
            if (!tp._wvV9PropsPatched) {
                tp._wvOrigGetRowCount = tp.getRowCount;
                tp.getRowCount = () => (rp.getRowCount
                    ? rp.getRowCount()
                    : rp._rows.length);
                // Re-bind data-layer probes to whatever's currently on
                // the itemsView (= our wrapped versions). These need to
                // stay live — Zotero's setFilter may rebuild props, in
                // which case we re-patch on the next apply pass.
                tp._wvOrigIsContainer = tp.isContainer;
                tp.isContainer = (idx) => rp.isContainer(idx);
                tp._wvOrigIsContainerOpen = tp.isContainerOpen;
                tp.isContainerOpen = (idx) => rp.isContainerOpen(idx);
                tp._wvOrigIsContainerEmpty = tp.isContainerEmpty;
                tp.isContainerEmpty = (idx) => rp.isContainerEmpty(idx);
                tp._wvOrigToggleOpenState = tp.toggleOpenState;
                tp.toggleOpenState = (idx, skip) => rp.toggleOpenState(idx, skip);
                tp._wvV9PropsPatched = true;
            }
            // Always update the WindowedList's captured reference —
            // it's the actual source-of-truth for row-count rendering.
            // Doing this on every apply (not just first install) keeps
            // us robust to WindowedList re-construction.
            const jsWin: any = itemsView.tree._jsWindow;
            if (jsWin && jsWin.getItemCount !== tp.getRowCount) {
                jsWin._wvOrigGetItemCount = jsWin._wvOrigGetItemCount
                    || jsWin.getItemCount;
                jsWin.getItemCount = tp.getRowCount;
                // Force a re-read so `_lastItemCount` updates against
                // the fresh count and the table re-renders to the new
                // size on the next paint.
                if (typeof jsWin._getItemCount === "function") {
                    try { jsWin._getItemCount(); } catch (e) {}
                }
            }
        }

        _mark("gatePatch");
        // Identical keep + already-patched view => nothing visible can
        // change; skip the re-render (perf, 2026-08-05). First
        // activation always invalidates (the patch install itself
        // changes what renders).
        if (this._wvLastKeepHash === _keepHash && _wasPatchedAtEntry) {
            _perf.invSkipped = true;
        }
        else {
            try { itemsView.tree.invalidate(); } catch (e) {}
        }
        this._wvLastKeepHash = _keepHash;
        // (The item-pane count refresh lives at the END of this method —
        // it must run AFTER `_wvLastPrimaryIDs` is published.)
        _mark("invalidate");
        try {
            _perf.rows = (rp._rows && rp._rows.length) || 0;
            _perf.total = Math.round(_perfNow() - _perfT0);
            const ring = ((Zotero as any)._wvFilterPerf
                = (Zotero as any)._wvFilterPerf || []);
            ring.push(_perf);
            if (ring.length > 20) ring.shift();
        } catch (e) {}
        // No-op-skip watermark: what a future non-cascade apply compares
        // against (END-of-apply row count — that's what it will observe).
        this._wvLastApplySig = _sig;
        this._wvLastApplyRawRows = (rp._rows && rp._rows.length) || 0;
        // Hand pass 2's primary verdicts to the reconcile, stamped with
        // the signature so it can only be used for THIS view/state.
        this._wvLastPrimaryIDs = { sig: _sig, ids: _primaryIDs };
        // Re-render the item pane's count message. MUST be after the
        // publish above: the tiered message reports how many rows are
        // matches vs context, and it reads exactly this stamped set. An
        // earlier version of this call sat next to the invalidate, which
        // runs BEFORE the publish, so the matching/context half silently
        // never appeared (2026-08-08).
        //
        // Upstream refreshes this message only from `itemsView.onRefresh`
        // (zoteroPane.js, zotero/zotero#5913) which a Weavero apply does
        // not fire. Gated on an empty selection: the only state where the
        // message is shown, and `itemSelected()` is otherwise a full
        // item-pane render.
        try {
            const _zp: any = win && win.ZoteroPane;
            const _sel: any = itemsView && itemsView.selection;
            if (_zp && typeof _zp.itemSelected === "function"
                && _sel && _sel.count === 0) {
                Promise.resolve(_zp.itemSelected()).catch(() => {});
            }
        } catch (e) {}
    }

    /** Debounce a re-apply of the items-list filter after the
     *  user toggles a container's open state. The toggle changes
     *  `_rows` (rows added/removed), so our `keep` array goes stale —
     *  newly-visible matching annotations need to be folded in,
     *  newly-hidden non-matching rows need to drop out. The debounce
     *  collapses bursts (e.g. multi-row keyboard expand) into a single
     *  pass. */
    /** Synchronous reapply — called from the toggle/expand/collapse
     *  wrappers AFTER the original has mutated `_rows` but BEFORE
     *  upstream's queued `runListeners('update', ...)` fires. The
     *  listener dispatches selection restore via `rowMap[id]` (real
     *  idx), then `selection.select(realIdx)` — which the table
     *  treats as a FILTERED idx and looks up `getRow(realIdx)`. If
     *  `keep` is stale at that point, the lookup crashes. Rebuild
     *  `keep` first so the restore lands on a valid filtered row. */
    _reapplyFilterSync() {
        try { this._applyItemsListFilterInner(); }
        catch (e) {
            dbg("[Weavero][filter] sync reapply err: " + e);
        }
    }

    /** Mimic Zotero 9's quick-search clear behaviour: when the filter
     *  goes away, leave the level-0 parents we cascade-opened in their
     *  expanded state but collapse the deeper attachment-level
     *  containers we opened, so the tree settles into a "halfway"
     *  state instead of staying fanned out down to every annotation.
     *  Only touches containers whose item id was recorded during our
     *  cascade — a parent the user had manually expanded before
     *  applying the filter is left alone. */
    _partialCollapseOnFilterClear(rp, itemsView) {
        // Drop the filter-opened tracker (no longer needed).
        this._filterOpenedIDs = null;
        if (!rp || !rp._rows) return;
        // Skip the collapse pass entirely when Zotero's native
        // quick-search is still active: a query like "NewTest"
        // populated `_rows` with matches that the user wants to
        // SEE, and collapsing their parents would hide them. The
        // collapse should only fire when the tree is truly going
        // back to its default unfiltered/unsearched view.
        try {
            const win = Zotero.getMainWindow();
            const sb: any = win && win.document.getElementById("zotero-tb-search");
            const qs = (sb && sb.value ? String(sb.value).trim() : "");
            if (qs) return;
        } catch (e) {}
        // V9-COMPAT: Zotero 10 names the unbatched toggle
        // `_toggleOpenState`; Zotero 9 exposes it as `toggleOpenState`
        // (no underscore, async arrow field on itemsView). Prefer
        // whichever exists.
        const toggle = (rp._toggleOpenState
                ? rp._toggleOpenState.bind(rp)
                : (rp.toggleOpenState
                    ? rp.toggleOpenState.bind(rp)
                    : null));
        if (!toggle) return;
        // V9-COMPAT: row.isContainer() / isContainerOpen() are
        // v10-only methods on row instances; v9 rows are plain
        // {ref, level, isOpen} objects. Use rp.isContainer(i) and
        // row.isOpen as fallbacks.
        const isContainerAt = (i, row) => {
            if (row && typeof row.isContainer === "function") {
                return !!row.isContainer();
            }
            if (typeof rp.isContainer === "function") {
                return !!rp.isContainer(i);
            }
            return false;
        };
        const isOpenAt = (i, row) => {
            if (row && typeof row.isContainerOpen === "function") {
                return !!row.isContainerOpen();
            }
            if (row && typeof row.isOpen === "boolean") return row.isOpen;
            if (typeof rp.isContainerOpen === "function") {
                return !!rp.isContainerOpen(i);
            }
            return false;
        };
        // Fully collapse: close every open container regardless of
        // who opened it (filter or user) or which level it sits
        // at. Iterating from the bottom keeps indices stable as
        // containers close.
        for (let i = rp._rows.length - 1; i >= 0; i--) {
            const row = rp._rows[i];
            if (!row) continue;
            if (!isContainerAt(i, row) || !isOpenAt(i, row)) continue;
            try { toggle(i, true); }
            catch (e) {
                dbg("[Weavero][filter] collapse-on-clear err: " + e);
            }
        }
        // V9-COMPAT: Zotero 10 renamed `_refreshRowMap` → `refreshRowMap`.
        try {
            if (typeof rp.refreshRowMap === "function") {
                rp.refreshRowMap();
            } else if (typeof rp._refreshRowMap === "function") {
                rp._refreshRowMap();
            }
        } catch (e) {}
        try { rp.runListeners && rp.runListeners("update", true, {
            restoreSelection: true,
        }); } catch (e) {}
    }

    /** Recursively check whether `item` contains an annotation whose
     *  color is in the `allowed` set. Walks attachments for regular
     *  items so a parent regular-item is included whenever any of its
     *  file-attachments hold a matching annotation.
     *
     *  IMPORTANT: `getAnnotations()` throws ("can only be called on file
     *  attachments") for anything that isn't a file attachment, so the
     *  branches must gate on the item type — a generic try/catch would
     *  silently return false for every regular item and drop their
     *  parent rows from the keep set. */
    /** True iff `item` is itself a primary match OR has any
     *  descendant that is. Used to decide whether a row should be
     *  kept as an ancestor-of-match (so the tree shape is preserved). */
    _hasMatchingAnnotation(item, state) {
        if (!item) return false;
        try {
            if (this._rowIsPrimary(item, state)) return true;
            if (item.isFileAttachment && item.isFileAttachment()) {
                const anns = (typeof item.getAnnotations === "function")
                    ? (item.getAnnotations() || []) : [];
                for (const ann of anns) {
                    if (this._rowIsPrimary(ann, state)) return true;
                }
                return false;
            }
            if (item.isRegularItem && item.isRegularItem()) {
                const attIds = (typeof item.getAttachments === "function")
                    ? item.getAttachments() : [];
                for (const id of attIds) {
                    const att = Zotero.Items.get(id);
                    if (att && this._hasMatchingAnnotation(att, state)) {
                        return true;
                    }
                }
                const noteIds = (typeof item.getNotes === "function")
                    ? item.getNotes() : [];
                for (const id of noteIds) {
                    const n = Zotero.Items.get(id);
                    if (n && this._rowIsPrimary(n, state)) return true;
                }
            }
        } catch (e) {
            dbg("[Weavero][filter] hasMatch err: " + e);
        }
        return false;
    }

    /** Decorate the iframe-rendered annotation context menu so our
     *  contributed entries ("Open comment popup", "Add related item…")
     *  show the plugin icon next to their label.
     *
     *  In Zotero 10 every annotation context menu is `internal: true`
     *  (see upstream reader/src/common/context-menu.js), which means
     *  it's rendered inside the reader iframe by React
     *  (reader/src/common/components/context-menu.js — `BasicRow`
     *  emits `<button class="row basic">…label…</button>`), not as
     *  chrome XUL. The chrome `_openContextMenu` is never called for
     *  this menu, so chrome-side decoration is impossible.
     *
     *  Instead we watch the iframe DOM for `.context-menu` to mount
     *  (handled in `_setupReaderObserver`'s observer) and from this
     *  helper insert a `<div class="icon"><img src=icon-16.png/></div>`
     *  as the first child of every matching `.row.basic`. Wrapping in
     *  `<div class="icon">` reuses the existing upstream
     *  `.context-menu .icon` rules so spacing matches built-in items
     *  that already use icons (eraser/highlight/etc.) — only the
     *  `<img>` itself needs sizing CSS, which `_injectReaderStyles`
     *  adds to the iframe. */
}

const _filterDescriptors = Object.getOwnPropertyDescriptors(_FilterMixin.prototype);
delete (_filterDescriptors as any).constructor;
export const filterMethods = _filterDescriptors;
