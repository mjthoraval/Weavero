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

import { URL_SCHEMES } from "./url";
import {
    BTN_CLASS, BTN_TREE_CLASS, BTN_PANE_CLASS, BTN_POPUP_CLASS,
} from "./constants";

// Module-level data backing the three "constants" the filter
// methods used to expose as instance class fields. The mixin
// pattern strips field initializers (those only fire in the
// host class's constructor — see the constructor in core for
// fields like _filterState that DO get initialized per-instance),
// so these live as module-private consts and are exposed via
// getters on the mixin prototype.

const _ANNOTATION_COLORS_DATA = [
    { value: "#ffd400", label: "Yellow" },
    { value: "#ff6666", label: "Red" },
    { value: "#5fb236", label: "Green" },
    { value: "#2ea8e5", label: "Blue" },
    { value: "#a28ae5", label: "Purple" },
    { value: "#e56eee", label: "Magenta" },
    { value: "#f19837", label: "Orange" },
    { value: "#aaaaaa", label: "Gray" },
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

const _ATTACHMENT_FILE_TYPES_DATA = [
    { value: "attachmentPDF",      label: "PDF",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-pdf.svg" },
    { value: "attachmentEPUB",     label: "EPUB",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-epub.svg" },
    { value: "attachmentSnapshot", label: "Snapshot",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-snapshot.svg" },
    { value: "attachmentImage",    label: "Image",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-image.svg" },
    { value: "attachmentVideo",    label: "Video",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-video.svg" },
    { value: "attachmentWebLink",  label: "Web Link",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-web-link.svg" },
    { value: "attachmentFile",     label: "Other File",
      icon: "chrome://zotero/skin/item-type/16/light/attachment-link.svg" },
];

class _FilterMixin {
    [k: string]: any;

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
            delete rp.getRow;
            delete rp.getRowCount;
            delete rp._wvOrigGetRow;
            delete rp._wvOrigGetRowCount;
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
            Zotero.debug("[Weavero][filter] _pauseFilterPatches err: " + e);
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
                    let eff: any = null;
                    try { eff = self._effectiveSelectionTargetKinds(); } catch (e) {}
                    if (eff && !(eff.parent && eff.attachment && eff.annotation)) {
                        let row = null;
                        try { row = itemsView.getRow(index); } catch (e) {}
                        const item = row && row.ref;
                        if (item) {
                            const isAnn = !!(item.isAnnotation && item.isAnnotation());
                            const isAtt = !isAnn
                                && !!(item.isAttachment && item.isAttachment());
                            const kind = isAnn ? "annotation" : isAtt ? "attachment" : "parent";
                            if (!eff[kind]) return false;
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
            hasTagScope: { annotation: true, attachment: true, parent: true },
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
            // Parent-targeting tri-state filters (regular items
            // only; non-regulars relax through). Each is `null /
            // true / false` for off / include / exclude.
            hasAbstract: null,
            hasDOI: null,
            hasURL: null,
            hasAttachment: null,
            // Attachment-targeting tri-state — file attachments only.
            hasAnnotations: null,
            // Publication multi-select (parent items only). State
            // shape mirrors Tag / Author / Added By: parallel
            // include + exclude arrays of titles.
            publication: [],
            publicationExclude: [],
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
        if (group.annotationTag && group.annotationTag.length) return true;
        if (group.annotationTagExclude && group.annotationTagExclude.length) return true;
        if (group.annotationAuthor && group.annotationAuthor.length) return true;
        if (group.annotationAuthorExclude && group.annotationAuthorExclude.length) return true;
        if (group.itemType && group.itemType.length) return true;
        if (group.itemTypeExclude && group.itemTypeExclude.length) return true;
        if (group.attachmentFileType && group.attachmentFileType.length) return true;
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) return true;
        if (group.addedBy && group.addedBy.length) return true;
        if (group.addedByExclude && group.addedByExclude.length) return true;
        if (group.hasRelated != null) return true;
        if (group.hasLink != null) return true;
        if (group.hasTag != null) return true;
        if (group.itemNote != null) return true;
        if (group.standaloneNote != null) return true;
        if (group.hasAbstract != null) return true;
        if (group.hasDOI != null) return true;
        if (group.hasURL != null) return true;
        if (group.hasAttachment != null) return true;
        if (group.hasAnnotations != null) return true;
        if (group.publication && group.publication.length) return true;
        if (group.publicationExclude && group.publicationExclude.length) return true;
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
    _effectiveSelectionTargetKinds() {
        const ALL = { parent: true, attachment: true, annotation: true };
        const fs = this._filterState || {};
        const tgt = fs.selectionTarget || {};
        const exc = fs.selectionTargetExclude || {};
        if (tgt.parent || tgt.attachment || tgt.annotation) {
            return { parent: !!tgt.parent, attachment: !!tgt.attachment, annotation: !!tgt.annotation };
        }
        if (exc.parent || exc.attachment || exc.annotation) {
            return { parent: !exc.parent, attachment: !exc.attachment, annotation: !exc.annotation };
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
        // CAT ∪ NEUTRAL == exactly the fields _isGroupActive checks.
        const CAT: Record<string, string[]> = {
            annotation: ["annotationColor", "annotationColorExclude", "annotationType",
                "annotationTypeExclude", "annotationHasComment", "annotationTag",
                "annotationTagExclude", "annotationAuthor", "annotationAuthorExclude"],
            attachment: ["attachmentFileType", "attachmentFileTypeExclude"],
            parent: ["itemType", "itemTypeExclude", "hasAbstract", "hasDOI", "hasURL",
                "hasAttachment", "publication", "publicationExclude"],
        };
        const NEUTRAL = ["addedBy", "addedByExclude", "hasRelated", "hasLink", "hasTag",
            "itemNote", "standaloneNote", "hasAnnotations"];
        const isSet = (g, f) => {
            const v = g[f];
            if (v == null) return false;
            return Array.isArray(v) ? v.length > 0 : true;
        };
        const cats = new Set<string>();
        for (const g of (fs.groups || [])) {
            if (!g || !this._isGroupActive(g)) continue;
            if (NEUTRAL.some(f => isSet(g, f))) return { ...ALL };
            for (const cat of ["annotation", "attachment", "parent"]) {
                if (CAT[cat].some(f => isSet(g, f))) cats.add(cat);
            }
        }
        // 1 category → just that kind; 2 categories → both kinds; 3 (or 0,
        // which shouldn't happen given _isFilterActive) → all kinds.
        if (cats.size === 1 || cats.size === 2) {
            return { parent: cats.has("parent"), attachment: cats.has("attachment"), annotation: cats.has("annotation") };
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
            const noExplicit = !(ti.parent || ti.attachment || ti.annotation
                || te.parent || te.attachment || te.annotation);
            const eff = this._effectiveSelectionTargetKinds();
            const narrowed = noExplicit && !(eff.parent && eff.attachment && eff.annotation);
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
                const kind = (item.getItemTypeIconName
                    && item.getItemTypeIconName(true)) || "";
                if (!group.attachmentFileType.includes(kind)) return false;
            }
        }
        if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length) {
            const isAtt = !!(item.isAttachment && item.isAttachment());
            if (isAtt) {
                const kind = (item.getItemTypeIconName
                    && item.getItemTypeIconName(true)) || "";
                if (group.attachmentFileTypeExclude.includes(kind)) return false;
            }
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
        // Cross-level checks — apply to every row kind, strict
        // per-row matching. Each item is evaluated independently;
        // descendants of a matching parent are NOT auto-kept by
        // virtue of the parent matching (so picking Has Related
        // on a parent only shows the parent + the cascade-required
        // ancestors, not the parent's full subtree). Ancestor-keep
        // for tree shape happens via `_hasMatchingAnnotation` in
        // the apply loop, which is what brings the parent in when
        // a descendant matches.
        // Cross-level filters honour their per-kind scope: a row
        // whose kind has its scope flag OFF relaxes through (the
        // filter doesn't apply at that level). `_rowKindOf` maps
        // every row to one of {annotation, attachment, parent};
        // anything else (e.g. unknown kinds) trivially in scope.
        const inScope = (scopeObj, kind) =>
            !scopeObj || !kind || scopeObj[kind] !== false;
        if (group.hasRelated != null) {
            const k = this._rowKindOf(item);
            if (inScope(group.hasRelatedScope, k)) {
                const rels = (item.relatedItems && item.relatedItems.length) || 0;
                if ((rels > 0) !== group.hasRelated) return false;
            }
        }
        if (group.hasLink != null) {
            // Has Link's scope keys are text-source-specific
            // (annotationComment / itemNoteText / standaloneText).
            // Rows that aren't one of those text sources fall
            // outside Has Link's universe entirely → trivially pass.
            const sk = this._hasLinkScopeKeyOf(item);
            if (sk) {
                const sc = group.hasLinkScope;
                if (!sc || sc[sk] !== false) {
                    const has = this._itemHasLinks(item);
                    if (has !== group.hasLink) return false;
                }
            }
        }
        if (group.hasTag != null) {
            const k = this._rowKindOf(item);
            if (inScope(group.hasTagScope, k)) {
                const tags = (item.getTags && item.getTags()) || [];
                const has = tags.length > 0;
                if (has !== group.hasTag) return false;
            }
        }
        // Note-kind defining filters. Strict per-row check: when
        // include is set, ONLY note items of the requested sub-kind
        // pass; everything else fails. Exclude rejects the matching
        // sub-kind. The cascade still keeps ancestors of the few
        // notes that match (item notes pull in their parent regular
        // item) because `_hasMatchingAnnotation` walks `item.getNotes`
        // and returns true for any primary descendant.
        if (group.itemNote != null) {
            const isNote = !!(item.isNote && item.isNote());
            const isChild = isNote && !!item.parentItem;
            if (isChild !== group.itemNote) return false;
        }
        if (group.standaloneNote != null) {
            const isNote = !!(item.isNote && item.isNote());
            const isStandalone = isNote && !item.parentItem;
            if (isStandalone !== group.standaloneNote) return false;
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
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("DOI") || "").trim().length);
                if (v !== group.hasDOI) return false;
            }
        }
        if (group.hasURL != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const v = !!(item.getField
                    && String(item.getField("url") || "").trim().length);
                if (v !== group.hasURL) return false;
            }
        }
        if (group.hasAttachment != null) {
            const isReg = !!(item.isRegularItem && item.isRegularItem());
            if (isReg) {
                const ids = (item.getAttachments && item.getAttachments()) || [];
                const v = ids.length > 0;
                if (v !== group.hasAttachment) return false;
            }
        }
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const ids = item.getAnnotations() || [];
                const v = ids.length > 0;
                if (v !== group.hasAnnotations) return false;
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
        const wantedTags = group.annotationTag;
        const wantedTagsX = group.annotationTagExclude;
        if ((wantedTags && wantedTags.length)
            || (wantedTagsX && wantedTagsX.length)) {
            const tags = (item.getTags && item.getTags()) || [];
            const names = tags.map(t => t && t.tag).filter(Boolean);
            if (wantedTags && wantedTags.length
                && !wantedTags.some(t => names.includes(t))) return false;
            if (wantedTagsX && wantedTagsX.length
                && wantedTagsX.some(t => names.includes(t))) return false;
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
            const isTopLevel = !isAnn && !isAttach;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel);
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
            const isTopLevel = !isAnn && !isAttach;
            const inScope = (isAnn && scope.annotations)
                || (isAttach && scope.attachments)
                || (isTopLevel && scope.topLevel);
            if (inScope) {
                const addedBy = this._getItemAddedBy(item);
                if (addedBy && wantedAddedByX.includes(addedBy)) return false;
            }
        }
        return true;
    }

    /** True iff `item` should be a primary kept match. ORs across
     *  the state's groups: the row passes if it satisfies ANY active
     *  group's AND-conjoined fields. */
    _rowIsPrimary(item, state) {
        if (!this._isFilterActive(state)) return false;
        if (!this._rowPassesGlobalFilters(item, state)) return false;
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
        //      this row's kind AND matches. Without (2) every
        //      regular item would trivially pass when the only
        //      active filter is annotation-targeting (because the
        //      annotation filter relaxes for non-annotations) —
        //      we'd flood the result with unrelated parents.
        return state.groups.some(g => this._isGroupActive(g)
            && this._rowPassesFilters(item, g)
            && this._rowHasOwnKindMatch(item, g)
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
        const annActive = (group.annotationColor && group.annotationColor.length)
            || (group.annotationColorExclude && group.annotationColorExclude.length)
            || (group.annotationType && group.annotationType.length)
            || (group.annotationTypeExclude && group.annotationTypeExclude.length)
            || group.annotationHasComment != null;
        const attActive = !!(
            (group.attachmentFileType && group.attachmentFileType.length)
            || (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length));
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
            if (annActive) {
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
            if (attActive || annActive) {
                const attIds = (typeof item.getAttachments === "function")
                    ? (item.getAttachments() || []) : [];
                let hasOK = false;
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    if (!att) continue;
                    if (attActive && !this._kindOK(att, group, "attachment")) continue;
                    if (annActive) {
                        // Same `isFileAttachment` gate as the isAtt
                        // branch above — non-file attachments throw
                        // from getAnnotations.
                        const anns = (att.isFileAttachment && att.isFileAttachment())
                            ? (att.getAnnotations() || []) : [];
                        const someAnnOK = anns.some(
                            a => this._kindOK(a, group, "annotation"));
                        if (!someAnnOK) continue;
                    }
                    hasOK = true;
                    break;
                }
                if (!hasOK) return false;
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
            if (annActive || attActive) return false;
            if (regActive) {
                const reg = item.parentItem;
                if (!reg || !this._kindOK(reg, group, "regular")) return false;
            }
            return true;
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
            return item.parentItem ? "attachment" : "parent";
        }
        if (item.isRegularItem && item.isRegularItem()) return "parent";
        return null;
    }

    /** Strict kind-specific check: returns true iff `item` is
     *  actually of `kind` AND passes all filters in `group` that
     *  target that kind. Used by `_rowSatisfiesTreeJoin`. */
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
            return true;
        }
        if (kind === "attachment") {
            if (!(item.isAttachment && item.isAttachment())) return false;
            const k = (item.getItemTypeIconName
                && item.getItemTypeIconName(true)) || "";
            if (group.attachmentFileType && group.attachmentFileType.length
                && !group.attachmentFileType.includes(k)) return false;
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && group.attachmentFileTypeExclude.includes(k)) return false;
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
        }

        // Attachment-targeting filter
        if (isAtt) {
            const kind = (item.getItemTypeIconName
                && item.getItemTypeIconName(true)) || "";
            if (group.attachmentFileType && group.attachmentFileType.length
                && group.attachmentFileType.includes(kind)) {
                return true;
            }
            if (group.attachmentFileTypeExclude && group.attachmentFileTypeExclude.length
                && !group.attachmentFileTypeExclude.includes(kind)) {
                return true;
            }
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
        if ((group.annotationTag && group.annotationTag.length)
            || (group.annotationTagExclude && group.annotationTagExclude.length)) {
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
            const inScope = (isAnn && sc.annotations)
                || (isAtt && sc.attachments)
                || ((isReg || isNote) && sc.topLevel);
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
            !scopeObj || !kind || scopeObj[kind] !== false;
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
        // Parent-targeting Has-* — only regular items can be primary
        // for these. Non-regulars don't count as kind matches here.
        if (isReg) {
            if (group.hasAbstract != null) {
                const v = !!(item.getField
                    && String(item.getField("abstractNote") || "").trim().length);
                if (v === group.hasAbstract) return true;
            }
            if (group.hasDOI != null) {
                const v = !!(item.getField
                    && String(item.getField("DOI") || "").trim().length);
                if (v === group.hasDOI) return true;
            }
            if (group.hasURL != null) {
                const v = !!(item.getField
                    && String(item.getField("url") || "").trim().length);
                if (v === group.hasURL) return true;
            }
            if (group.hasAttachment != null) {
                const ids = (item.getAttachments && item.getAttachments()) || [];
                const v = ids.length > 0;
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
        }
        // Has Annotations — file attachments only.
        if (group.hasAnnotations != null) {
            const isFa = !!(item.isFileAttachment && item.isFileAttachment());
            if (isFa) {
                const ids = item.getAnnotations() || [];
                const v = ids.length > 0;
                if (v === group.hasAnnotations) return true;
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

    _setupItemsListFilter() {
        // Pref gate (Filters group → Items-tree filter pane).
        if (!this._getEnableItemsTreeFilter()) {
            try { this._teardownItemsListFilter(); } catch (e) {}
            return;
        }
        const win = Zotero.getMainWindow();
        const doc = win && win.document;
        if (!doc) return;
        const container = doc.getElementById("zotero-items-pane-container");
        const itemsPane = doc.getElementById("zotero-items-pane");
        const searchBox = doc.getElementById("zotero-tb-search");
        if (!container || !itemsPane || !searchBox) {
            // Items pane mounts asynchronously on first window open; retry.
            win.setTimeout(() => this._setupItemsListFilter(), 1000);
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
        tbBtn.appendChild(icon);
        const dropmarker = doc.createXULElement("image");
        dropmarker.className = "toolbarbutton-menu-dropmarker";
        tbBtn.appendChild(dropmarker);

        // The panel must be a CHILD of the toolbar button for
        // type="menu" toggle behaviour. We create it once here and
        // (re)build its contents on `popupshowing` so the rendered
        // selection state always reflects the current `_filterState`.
        const panel = doc.createXULElement("panel");
        panel.id = "wv-filter-popup";
        panel.setAttribute("type", "arrow");
        // Skip the default Mozilla XUL panel fade-in animation so
        // the filter window appears at full opacity in one step
        // instead of fading from 0 → 1 over ~150 ms (which reads
        // as a "faint then clear" two-step appearance because
        // content has already rendered when the fade begins).
        // Same flag Zotero's own tabs-menu / sync-error / lookup
        // panels use (zoteroPane.xhtml).
        panel.setAttribute("animate", "false");
        // `position` controls anchoring relative to the parent menu
        // button; "after_end" right-aligns the popup to the button so
        // the wide popup body extends LEFTWARD into the items-pane
        // area instead of off-screen to the right.
        panel.setAttribute("position", "after_end");
        // Delegate HTML `title` tooltips to Zotero's own page-mode
        // tooltip element (declared in `zoteroPane.xhtml` as
        // `<tooltip id="html-tooltip" page="true"/>`). Mozilla's
        // tooltip listener handles position, delay, theming, and
        // OS-native cursor offset for us — exactly matching every
        // other tooltip in the Zotero UI. No custom JS needed.
        panel.setAttribute("tooltip", "html-tooltip");
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const inner = doc.createElementNS(NS_HTML, "div");
        inner.className = "wv-filter-popup-inner wv-filter-panel-inner";
        panel.appendChild(inner);
        panel.addEventListener("popupshowing", () => {
            // Drop any in-memory caches so dynamic-list pickers
            // (tags, authors) re-fetch from SQL on each fresh open
            // and search inputs reset to empty.
            this._cachedAnnotationTags = null;
            this._cachedAnnotationAuthors = null;
            this._cachedAddedByUsers = null;
            this._cachedPublications = null;
            this._tagSearchQuery = "";
            this._authorSearchQuery = "";
            this._itemTypeSearchQuery = "";
            this._addedBySearchQuery = "";
            this._publicationSearchQuery = "";
            this._renderFilterPanelContents(panel, inner);
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
        tbBtn.appendChild(panel);
        searchBox.parentNode.insertBefore(tbBtn, searchBox.nextSibling);

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

        // Re-apply filter when scroll / data-change brings new rows into
        // the virtualized window. We watch the inner tree element for
        // childList mutations — every row append/remove fires here.
        const treeInner = doc.getElementById("item-tree-main")
            || doc.getElementById("zotero-items-tree");
        if (treeInner && win.MutationObserver) {
            this._filterTreeObserver = new win.MutationObserver(() => {
                // Skip the apply during a collection swap — the
                // `changeCollectionTreeRow` wrap will re-apply
                // exactly once after `_rows` has fully reloaded.
                if (this._collectionSwapping) return;
                this._applyItemsListFilter();
                // Patch the annotation row class as soon as the
                // first annotation row exists in `_rows`. Idempotent
                // — re-checks on every tree mutation but only
                // installs once.
                try { this._ensureAnnotationRowPatched(); } catch (e) {}
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
                                this._applyItemsListFilter({ cascade: true });
                                this._patchIsSelectable();
                            } catch (e) {
                                Zotero.debug(
                                    "[Weavero][filter] post-swap reapply err: " + e);
                            }
                        });
                    }
                    return result;
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] changeCollectionTreeRow wrap err: " + e);
        }

        // Diagnostic wrapper around selectItems so we see exactly
        // what state Zotero has when it tries to select a freshly
        // created item — what `_rowMap[id]` returns vs the wrapped
        // `getRowCount`. Idempotent.
        try {
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
            if (itemsView && typeof itemsView.selectItems === "function"
                && !itemsView._wvSelectItemsWrapped) {
                const origSelect = itemsView.selectItems.bind(itemsView);
                itemsView._wvSelectItemsWrapped = true;
                itemsView.selectItems = async (ids, noRecurse, noScroll) => {
                    try {
                        const rp = itemsView.rowProvider;
                        const info = {
                            ids: ids,
                            rowsLen: rp && rp._rows ? rp._rows.length : "?",
                            wrappedCount: itemsView.rowCount,
                            origCount: rp && rp._wvOrigGetRowCount
                                ? rp._wvOrigGetRowCount() : "n/a",
                        };
                        for (const id of ids || []) {
                            info["rowMap[" + id + "]"] =
                                itemsView._rowMap ? itemsView._rowMap[id] : "n/a";
                        }
                        Zotero.debug(
                            "[Weavero][add-debug] selectItems entry: "
                            + JSON.stringify(info));
                    } catch (e) {}
                    let result;
                    try { result = await origSelect(ids, noRecurse, noScroll); }
                    catch (e) {
                        Zotero.debug(
                            "[Weavero][add-debug] selectItems threw: " + e);
                        throw e;
                    }
                    Zotero.debug(
                        "[Weavero][add-debug] selectItems returned: " + result
                        + " selectionFocused="
                        + (itemsView.selection
                            ? itemsView.selection.focused : "n/a"));
                    return result;
                };
            }
        } catch (e) {
            Zotero.debug("[Weavero][filter] selectItems wrap err: " + e);
        }
    }

    _teardownItemsListFilter() {
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
            const win = Zotero.getMainWindow();
            const itemsView = win && win.ZoteroPane && win.ZoteroPane.itemsView;
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
            const win = Zotero.getMainWindow();
            const doc = win && win.document;
            if (doc) {
                const bar = doc.getElementById("wv-filter-bar");
                if (bar) bar.remove();
                const tbBtn = doc.getElementById("wv-filter-tb-button");
                if (tbBtn) tbBtn.remove();
                for (const row of doc.querySelectorAll(".row.wv-filter-hidden") as any) {
                    row.classList.remove("wv-filter-hidden");
                }
                const popup = doc.getElementById("wv-filter-popup");
                if (popup) popup.remove();
            }
        } catch (e) {}
        this._filterBar = null;
        this._filterTbBtn = null;
    }

    /** (Re)build the filter-bar contents from `_filterState`. Called on
     *  setup, on every chip add/remove, and after popup commit. The bar
     *  is hidden when no filters are active — the toolbar "+" button is
     *  the entry point in that state. */
    _renderFilterBar() {
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
            if (group.hasTag != null) {
                bar.appendChild(this._buildHasTagChip(doc, group, gi));
            }
            if (group.itemNote != null) {
                bar.appendChild(this._buildItemNoteChip(doc, group, gi));
            }
            if (group.standaloneNote != null) {
                bar.appendChild(this._buildStandaloneNoteChip(doc, group, gi));
            }
            if (group.hasAbstract != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasAbstract", "Has Abstract"));
            }
            if (group.hasDOI != null) {
                bar.appendChild(this._buildHasFieldChip(doc, group, gi,
                    "hasDOI", "Has DOI"));
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
            if (group.publication && group.publication.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi));
            }
            if (group.publicationExclude && group.publicationExclude.length) {
                bar.appendChild(this._buildPublicationChip(doc, group, gi, true));
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
                    const sw = doc.createElementNS(NS_HTML, "span");
                    sw.className = "wv-chip-swatch";
                    sw.style.background = c;
                    valSeg.appendChild(sw);
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
                const pRect = itemsPane.getBoundingClientRect();
                const span = Math.round(pRect.right - sRect.left) - 8;
                const w = Math.min(280, Math.max(200, span));
                inner.style.minWidth = w + "px";
                inner.style.maxWidth = w + "px";
                inner.style.setProperty("--wv-title-col", "0px");
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

        // Top bar — Alt+click hint on the left, then a text "Clear"
        // button and the red × ("Clear and Close") on the right.
        // Lives at the very top of the popup so the × ends up roughly
        // above the rightmost Annotation Color swatch instead of
        // pushing the popup wider on a separate header row.
        const topBar = doc.createElementNS(NS_HTML, "div");
        topBar.className = "wv-filter-top-bar";
        const hint = doc.createElementNS(NS_HTML, "span");
        hint.className = "wv-filter-top-hint";
        hint.textContent = "Alt+click to exclude";
        topBar.appendChild(hint);
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
        topBar.appendChild(clearTextBtn);
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
        topBar.appendChild(clearBtn);
        inner.appendChild(topBar);
        const renderHeader = () => {
            const active = this._isFilterActive(this._filterState);
            clearTextBtn.style.visibility = active ? "" : "hidden";
            clearBtn.style.visibility = active ? "" : "hidden";
        };

        // Helper: insert a labeled group header above a section
        // group. The optional `todo` text appears in italics next
        // to the title — used on "Multi scope" to flag pending work.
        // `rightSlot`, when provided, is appended on the right side
        // of the header (margin-left: auto); used by the first
        // header to host the Clear-filter × button.
        const addGroupHeader = (label, todo?, rightSlot?) => {
            const hdr = doc.createElementNS(NS_HTML, "div");
            hdr.className = "wv-filter-group-header";
            const t = doc.createElementNS(NS_HTML, "span");
            t.className = "wv-filter-group-header-title";
            t.textContent = label;
            hdr.appendChild(t);
            if (todo) {
                const td = doc.createElementNS(NS_HTML, "span");
                td.className = "wv-filter-group-header-todo";
                td.textContent = todo;
                hdr.appendChild(td);
            }
            if (rightSlot) {
                rightSlot.style.marginLeft = "auto";
                hdr.appendChild(rightSlot);
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
        const activeLibraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        const isGroupLibrary = activeLibraryID
            !== Zotero.Libraries.userLibraryID;

        // Section order, top → bottom:
        //   Annotation  — color / type / comment
        //   Attachment  — file-type / item-note / has-annotations
        //   Parent      — Item Type / standalone note / has-fields
        //   Cross-level — has-* + multi-select search
        //   Selection Target — Ctrl+A target picker (bottom bar)
        addGroupHeader("Annotation");
        inner.appendChild(colorSection);
        inner.appendChild(typeSection);
        inner.appendChild(commentSection);

        addGroupHeader("Attachment");
        // attachmentFileTypeSection now also renders the Item Note
        // tile inline (right of the file-type icons, after a thin
        // vertical separator).
        inner.appendChild(attachmentFileTypeSection);
        inner.appendChild(hasAnnotationsSection);

        addGroupHeader("Parent");
        inner.appendChild(itemTypeRowSection);
        // Item Type row already hosts the Standalone Note tile at
        // its right end (after a vertical separator), so the only
        // section to append here is the Has-fields row.
        inner.appendChild(parentHasFieldsSection);

        addGroupHeader("Cross-level");
        inner.appendChild(crossLevelSection);
        // Multi-selection search bar (Tag / Author / Added By /
        // Collection / Saved Search) — sits in the Cross-level
        // group, directly under the Has Related / Has Link icons,
        // since these searches all match across row kinds the same
        // way the icon triggers do.
        inner.appendChild(searchSection);

        // Bottom: Selection Target bar (controls Ctrl+A scope only,
        // doesn't affect filtering itself).
        const selChoices = [
            { key: "parent",     label: "Parent",
              tip: "Regular items + standalone notes will be selectable in Ctrl+A." },
            { key: "attachment", label: "Attachment",
              tip: "Attachment rows will be selectable in Ctrl+A." },
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
        const _noExplicitSelTarget = !(selTarget.parent || selTarget.attachment || selTarget.annotation
            || selTargetExc.parent || selTargetExc.attachment || selTargetExc.annotation);
        let _selTargetAuto: any = null;
        if (_noExplicitSelTarget) {
            const eff = this._effectiveSelectionTargetKinds();
            if (!(eff.parent && eff.attachment && eff.annotation)) _selTargetAuto = eff;
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

        const searchCtx = { libraryID: activeLibraryID, isGroupLibrary, panel };
        const refreshAll = () => {
            this._renderColorSection(doc, colorSection, refreshAll);
            this._renderTypeSection(doc, typeSection, refreshAll);
            this._renderHasCommentSection(doc, commentSection, refreshAll);
            this._renderAttachmentFileTypeSection(doc, attachmentFileTypeSection, refreshAll);
            this._renderHasAnnotationsSection(doc, hasAnnotationsSection, refreshAll);
            this._renderItemTypeRow(doc, itemTypeRowSection, refreshAll, searchCtx);
            this._renderParentHasFieldsSection(doc, parentHasFieldsSection, refreshAll);
            this._renderUnifiedSearchSection(doc, searchSection, refreshAll, searchCtx);
            this._renderCrossLevelSection(doc, crossLevelSection, refreshAll);
            renderHeader();
            // Filters changed → the smart Selection Target may have changed
            // too; re-sync the chip cue (the bar itself isn't re-rendered).
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Search";
        title.title = "Pick a facet from the dropdown then type to filter that facet's values. Click a suggestion to add it. Saved Search and Collection apply globally; Tag, Author and Added By apply to the current OR group.";
        section.appendChild(title);

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
            emptyAll: "No annotation tags in this library",
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
                    Zotero.debug("[Weavero][filter] collections enum err: " + e);
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
                    Zotero.debug("[Weavero][filter] saved searches enum err: " + e);
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
        const popupHost = doc.getElementById("mainPopupSet")
            || doc.documentElement;
        const STALE_MENUS = popupHost.querySelectorAll(
            "menupopup.wv-filter-mode-menupopup");
        for (const m of STALE_MENUS) m.remove();
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
            const exact = [], pre = [], sub = [];
            for (const v of all) {
                const lc = mode.valueLabel(v).toLowerCase();
                if (lc === q) exact.push(v);
                else if (lc.startsWith(q)) pre.push(v);
                else if (lc.includes(q)) sub.push(v);
            }
            return [...exact, ...pre, ...sub];
        };

        let cached = null;

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
            else list = candidates.filter(
                v => mode.valueLabel(v).toLowerCase().includes(q));
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
                Zotero.debug("[Weavero][filter] unified search load err: " + e);
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

        // Hidden title (CSS hides .wv-filter-section-title globally).
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Item Type";
        section.appendChild(title);

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

        const selectedRow = doc.createElementNS(NS_HTML, "div");
        selectedRow.className = "wv-filter-itype-selected";
        triggerRow.appendChild(selectedRow);

        // Standalone Note tile, right end of the trigger row, after
        // a thin vertical separator. The selectedRow above takes
        // all remaining flex space, so the separator + tile sit
        // flush against the right edge naturally.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        triggerRow.appendChild(sep);

        const sg0 = this._activeGroup();
        const snCur = sg0 ? sg0.standaloneNote : null;
        const snBtn = doc.createElementNS(NS_HTML, "button");
        snBtn.type = "button";
        snBtn.className = "wv-filter-opt wv-filter-opt-icon";
        snBtn.title = "Standalone Note — show only top-level "
            + "(parentless) notes. Alt+click to exclude (hide "
            + "standalone notes).";
        if (snCur === true) snBtn.dataset.selected = "true";
        else if (snCur === false) snBtn.dataset.excluded = "true";
        const snIcon = doc.createElementNS(NS_HTML, "img");
        snIcon.className = "wv-filter-svg";
        snIcon.src = "chrome://zotero/skin/16/universal/note.svg";
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
        triggerRow.appendChild(snBtn);

        // Vertical 2-col suggestion list (hidden until trigger is
        // clicked).
        const box = doc.createElementNS(NS_HTML, "div");
        box.className = "wv-filter-tag-list";
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
                const allById = new Map(all.map(v => [v.id, v]));
                const wvMru = (String(Zotero.Prefs.get(
                    "extensions.zotero.weavero.itemTypeFilterMRU", true)) || "")
                    .split(",").filter(Boolean);
                const zMru = (String(Zotero.Prefs.get(
                    "newItemTypeMRU")) || "").split(",").filter(Boolean);
                // Cap at 5 to match Zotero's "New Item" toolbar
                // button (zoteroPane.js stores 5 in `newItemTypeMRU`).
                // Higher caps were confusing — users expect the same
                // shortlist they see when creating new items.
                const seen = new Set();
                const recent = [];
                for (const name of [...wvMru, ...zMru]) {
                    if (seen.has(name)) continue;
                    const v = allById.get(name);
                    if (!v) continue;
                    seen.add(name);
                    recent.push(v);
                    if (recent.length >= 5) break;
                }
                const rest = [...all]
                    .sort((a, b) => a.name.localeCompare(b.name));
                if (recent.length && rest.length) {
                    return [...recent, { separator: true }, ...rest];
                }
                return [...recent, ...rest];
            } catch (e) {
                Zotero.debug("[Weavero][filter] item types enum err: " + e);
                return [];
            }
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
            });
            return chip;
        };

        const renderSelected = () => {
            while (selectedRow.firstChild) {
                selectedRow.removeChild(selectedRow.firstChild);
            }
            const g = this._activeGroup();
            const sel = (g && g.itemType) || [];
            const exc = (g && g.itemTypeExclude) || [];
            for (const id of sel) selectedRow.appendChild(buildSelectedChip(id, false));
            for (const id of exc) selectedRow.appendChild(buildSelectedChip(id, true));
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
                });
                box.appendChild(btn);
            }
        };

        // Toggle list visibility — outside-click closes.
        let listOpen = false;
        let onDocMouseDown = null;
        const showList = () => {
            if (listOpen) return;
            listOpen = true;
            box.style.display = "";
            if (!onDocMouseDown) {
                onDocMouseDown = (e) => {
                    // Trigger toggles the list itself.
                    if (trigger.contains(e.target)) return;
                    // Clicks inside the open list (picking a type)
                    // are handled by the menuitem listener below.
                    if (box.contains(e.target)) return;
                    // Clicks on an actual chip remove that chip —
                    // keep the list open so the user can keep
                    // pruning. Use a chip-class check rather than
                    // `selectedRow.contains` so empty space inside
                    // selectedRow (visible once it has chips and
                    // grows in height) doesn't accidentally count
                    // as a chip click and trap the dropdown open.
                    if (e.target.closest
                        && e.target.closest(".wv-filter-itype-chip")) return;
                    // Anywhere else (including empty space on the
                    // trigger row, or anywhere outside the section)
                    // collapses the list.
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
            const iwin = doc.defaultView || doc.ownerGlobal;
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
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Annotation Color";
        title.title = "Show only annotations whose color matches one of the selected swatches.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.annotationColor) || []);
        const excluded = new Set((g0 && g0.annotationColorExclude) || []);
        for (const def of this._ANNOTATION_COLORS) {
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            const inExc = excluded.has(def.value);
            btn.title = def.label;
            if (selected.has(def.value)) btn.dataset.selected = "true";
            if (inExc) btn.dataset.excluded = "true";

            const sw = doc.createElementNS(NS_HTML, "span");
            sw.className = "wv-chip-swatch";
            sw.style.background = def.value;
            btn.appendChild(sw);

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
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Annotation Type";
        title.title = "Show only annotations of the selected types (Highlight, Underline, Note, Image, Ink, Text).";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

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
            opts.appendChild(btn);
        }
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Cross-level";
        section.appendChild(title);

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
        const KINDS_ROW = [
            { key: "annotation", label: "Annotation" },
            { key: "attachment", label: "Attachment" },
            { key: "parent",     label: "Parent" },
        ];
        // Has Link's kind list — text-source-specific buckets
        // (URL detection only fires on annotation comments and
        // note bodies; attachment URL fields and regular-item URL
        // fields don't count).
        const KINDS_HAS_LINK = [
            { key: "annotationComment", label: "Annotation Comment" },
            { key: "itemNoteText",      label: "Item Note Text" },
            { key: "standaloneText",    label: "Standalone Note Text" },
        ];

        // Each cross-level filter renders as a slot containing the
        // main icon button + a small `▾` scope arrow. Click the
        // icon to toggle include/exclude (Alt+click for exclude);
        // click the arrow to choose which row kinds the filter
        // applies to.
        const buildBtn = (key, scopeKey, kindList, label, iconBuilder, tip) => {
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
            // narrowed below the all-on default.
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
        const win = doc.defaultView || doc.ownerGlobal;
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = opts.title;
        section.appendChild(title);

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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Parent Has";
        section.appendChild(title);

        const optsBox = doc.createElementNS(NS_HTML, "div");
        optsBox.className = "wv-filter-options";
        section.appendChild(optsBox);

        const g0 = this._activeGroup();
        // Optional `color` ties the icon's currentColor to one of
        // Zotero's `$item-pane-sections` palette entries so the
        // Has-* tiles read as the same surface as their right-pane
        // section header.
        const buildBtn = (key, label, iconSrc, tip, color?) => {
            const cur = g0 ? g0[key] : null;
            const btn = doc.createElementNS(NS_HTML, "button");
            btn.type = "button";
            btn.className = "wv-filter-opt wv-filter-opt-icon";
            btn.title = tip;
            if (cur === true) btn.dataset.selected = "true";
            else if (cur === false) btn.dataset.excluded = "true";
            const icon = doc.createElementNS(NS_HTML, "img");
            icon.className = "wv-filter-svg";
            icon.src = iconSrc;
            icon.alt = label;
            if (color) icon.style.color = color;
            btn.appendChild(icon);
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
        buildBtn("hasDOI", "Has DOI",
            "chrome://zotero/skin/16/universal/crossref.svg",
            "Has DOI — regular items with a DOI. Alt+click to exclude.");
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

    /** Single-tile "Has Annotations" tri-state for the Attachment
     *  group. */
    _renderHasAnnotationsSection(doc, section, refreshAll) {
        const NS_HTML = "http://www.w3.org/1999/xhtml";
        this._renderBoolKindIconSection(doc, section, refreshAll, {
            key: "hasAnnotations",
            title: "Has Annotations",
            tip: "Has Annotations — file attachments with at least "
                + "one annotation. Alt+click to exclude.",
            iconBuilder: (d) => {
                const icon = d.createElementNS(NS_HTML, "img");
                icon.className = "wv-filter-svg";
                icon.src = "chrome://zotero/skin/16/universal/attachment-annotations.svg";
                icon.alt = "Has Annotations";
                // Zotero maps `attachment-annotations` to
                // `--tag-purple` in the item-pane sections palette
                // — same icon, same colour.
                icon.style.color = "var(--tag-purple)";
                return icon;
            },
        });
    }

    _renderHasCommentSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";

        const NS_HTML = "http://www.w3.org/1999/xhtml";
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Has Comment";
        title.title = "Has Comment";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        // Single button labelled "Has Comment" with three states:
        //   null  → no filter (idle)
        //   true  → include (annotations WITH a comment) — selected
        //   false → exclude (annotations WITHOUT a comment) — slashed
        // Click toggles include; Alt+click toggles exclude. Mutually
        // exclusive: switching to one clears the other, mirroring the
        // icon-grid Alt+click idiom.
        const g0 = this._activeGroup();
        const cur = g0 ? g0.annotationHasComment : null;
        const btn = doc.createElementNS(NS_HTML, "button");
        btn.type = "button";
        btn.className = "wv-filter-opt wv-filter-opt-icon";
        if (cur === true) btn.dataset.selected = "true";
        else if (cur === false) btn.dataset.excluded = "true";
        btn.title = "Has Comment — annotations with non-empty "
            + "comment text. Alt+click to exclude.";
        // Speech-bubble + capital C, painted in `--tag-purple`
        // (Zotero's annotation-pane accent). Inline SVG rather than
        // a chrome:// URL since this is a Weavero-specific glyph
        // not shipped with Zotero.
        btn.appendChild(this._makeHasCommentSvg(doc));
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const g = this._activeGroup();
            if (!g) return;
            let next;
            if (e.altKey) {
                // Alt+click toggles exclude.
                next = (g.annotationHasComment === false) ? null : false;
            } else {
                // Plain click toggles include.
                next = (g.annotationHasComment === true) ? null : true;
            }
            g.annotationHasComment = next;
            this._renderFilterBar();
            this._applyItemsListFilter({ cascade: true });
            refreshAll();
        });
        opts.appendChild(btn);
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
        // e.g. `1.5`, `8.5`, `14.5`). Bubble body: (1.5, 1.5) →
        // (14.5, 11.5), corner radius ≈ 1.5; tail tip at (4.5, 14.5).
        path.setAttribute("d",
            "M1.5 3C1.5 2.17 2.17 1.5 3 1.5H13"
            + "C13.83 1.5 14.5 2.17 14.5 3V10"
            + "C14.5 10.83 13.83 11.5 13 11.5H6.5"
            + "L4.5 14.5V11.5H3"
            + "C2.17 11.5 1.5 10.83 1.5 10V3Z");
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
        const text = doc.createElementNS(NS, "text");
        // C is centered on the bubble body (y midpoint ≈ 6.5).
        // font-size 8 with cap-height ~5.6 → baseline at y=9 puts
        // the cap visually centered. font-weight 600 (semi-bold)
        // approximates the ~1.5-px stroke thickness of Zotero's
        // letter-glyph icons (annotate-text "T", annotate-highlight
        // "A") which draw their strokes as filled paths of that
        // width. Bold (700) was too heavy and crowded the bubble.
        text.setAttribute("x", "8");
        text.setAttribute("y", "9");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-family",
            "-apple-system, Segoe UI, sans-serif");
        text.setAttribute("font-size", "8");
        text.setAttribute("font-weight", "600");
        text.setAttribute("fill", "currentColor");
        text.textContent = "C";
        svg.appendChild(text);
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
        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Tag";
        title.title = "Filter by tag — type to search the library's tags. Multi-select.";
        section.appendChild(title);

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
            const exact = [], prefix = [], substring = [];
            for (const t of allTags) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) prefix.push(t);
                else if (lc.includes(q)) substring.push(t);
            }
            return [...exact, ...prefix, ...substring];
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
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
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
            Zotero.debug("[Weavero][filter] tag fetch err: " + e);
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
            Zotero.debug("[Weavero][filter] _collectAllTags err: " + e);
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
            Zotero.debug("[Weavero][filter] creators query err: " + e);
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
            Zotero.debug("[Weavero][filter] annotation authors query err: " + e);
        }
        return [...names].sort((a: any, b: any) => a.localeCompare(b));
    }

    _renderAuthorSection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Author";
        title.title = "Filter by author / creator. Multi-select; OR within authors.";
        section.appendChild(title);

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
            const exact = [], pre = [], sub = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
            }
            return [...exact, ...pre, ...sub];
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
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
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
            Zotero.debug("[Weavero][filter] author fetch err: " + e);
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Attachment File Type";
        title.title = "Filter attachments by file kind (PDF, EPUB, Snapshot, Image, Video, Web Link, Other File). Multi-select.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options";
        section.appendChild(opts);

        const g0 = this._activeGroup();
        const selected = new Set((g0 && g0.attachmentFileType) || []);
        const excluded = new Set((g0 && g0.attachmentFileTypeExclude) || []);
        for (const def of this._ATTACHMENT_FILE_TYPES) {
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

        // Item Note tile sits to the right of the file-type icons,
        // after a thin vertical separator. Item notes are
        // attachment-level rows (same tree depth as attachments)
        // — the file-type tiles target attachment-files, the Item
        // Note tile targets the OTHER kind of attachment-level
        // row, hence the visual grouping.
        const sep = doc.createElementNS(NS_HTML, "div");
        sep.className = "wv-filter-vertical-separator";
        opts.appendChild(sep);

        const inCur = g0 ? g0.itemNote : null;
        const inBtn = doc.createElementNS(NS_HTML, "button");
        inBtn.type = "button";
        inBtn.className = "wv-filter-opt wv-filter-opt-icon";
        inBtn.title = "Item Note — show only notes attached to a regular item. "
            + "Alt+click to exclude (hide item notes).";
        if (inCur === true) inBtn.dataset.selected = "true";
        else if (inCur === false) inBtn.dataset.excluded = "true";
        const inIcon = doc.createElementNS(NS_HTML, "img");
        inIcon.className = "wv-filter-svg";
        inIcon.src = "chrome://zotero/skin/16/universal/note.svg";
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
            Zotero.debug("[Weavero][filter] _collectPublications err: " + e);
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
            Zotero.debug("[Weavero][filter] _collectAddedByUsers err: " + e);
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Collection";
        title.title = "Narrow the items list to members of any of the selected collections in the active library. Multi-select; OR.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let cols = [];
        try {
            cols = (Zotero.Collections.getByLibrary(libraryID, true) || [])
                .map(c => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            Zotero.debug("[Weavero][filter] collections enum err: " + e);
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
            if (q) list = cols.filter(c => c.name.toLowerCase().includes(q));
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

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Saved Search";
        title.title = "Narrow the items list to matches of any of the selected saved searches in the active library. Multi-select; OR.";
        section.appendChild(title);

        const opts = doc.createElementNS(NS_HTML, "div");
        opts.className = "wv-filter-options wv-filter-options-stacked";
        section.appendChild(opts);

        const win = doc.defaultView;
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
            || (Zotero.Libraries && Zotero.Libraries.userLibraryID);
        let searches = [];
        try {
            searches = ((Zotero.Searches as any).getByLibrary(libraryID) || [])
                .map(s => ({ id: s.id, name: s.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
            Zotero.debug("[Weavero][filter] saved searches enum err: " + e);
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
            if (q) list = searches.filter(s => s.name.toLowerCase().includes(q));
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
                Zotero.debug("[Weavero][filter] saved-search "
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
            Zotero.debug("[Weavero][filter] _refreshSavedSearchResults err: " + e);
            this._savedSearchResults = null;
            this._savedSearchExcludeResults = null;
        }
    }

    _renderAddedBySection(doc, section, refreshAll) {
        while (section.firstChild) section.removeChild(section.firstChild);
        section.className = "wv-filter-section";
        const NS_HTML = "http://www.w3.org/1999/xhtml";

        const title = doc.createElementNS(NS_HTML, "div");
        title.className = "wv-filter-section-title";
        title.textContent = "Added By";
        title.title = "Filter by who created the item (group libraries). Use the scope ticks below to choose which row kinds the filter applies to.";
        section.appendChild(title);

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
            const exact = [], pre = [], sub = [];
            for (const t of all) {
                const lc = t.toLowerCase();
                if (lc === q) exact.push(t);
                else if (lc.startsWith(q)) pre.push(t);
                else if (lc.includes(q)) sub.push(t);
            }
            return [...exact, ...pre, ...sub];
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
            const items = [
                { key: "topLevel",    label: "Top-level items" },
                { key: "attachments", label: "Attachments" },
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
        const libraryID = (win && win.ZoteroPane
            && win.ZoteroPane.getSelectedLibraryID
            && win.ZoteroPane.getSelectedLibraryID())
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
            Zotero.debug("[Weavero][filter] addedBy fetch err: " + e);
        });
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
    _applyItemsListFilter(opts?) {
        // Guard — `tree.invalidate()` re-renders rows, which fires the
        // tree mutation observer that calls us back. Without this we'd
        // recurse on every filter apply.
        if (this._filterApplying) return;
        this._filterApplying = true;
        try { this._applyItemsListFilterInner(opts); }
        finally {
            const win = Zotero.getMainWindow();
            const setT = (win && win.setTimeout) || setTimeout;
            // Defer clearing so observer fires that are queued from our
            // own mutations get filtered out too.
            setT(() => { this._filterApplying = false; }, 80);
        }
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

        // Library-change detection. Collection IDs and saved-search
        // IDs are library-scoped — a filter set in library A makes
        // every row fail the global check in library B (none of the
        // items in B belong to A's collections). Detect the switch
        // and reset both filters + the saved-search results cache.
        try {
            const curLib = win.ZoteroPane && win.ZoteroPane.getSelectedLibraryID
                ? win.ZoteroPane.getSelectedLibraryID() : null;
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
            Zotero.debug("[Weavero][filter] library-change check err: " + e);
        }

        // The virtualized table reads `getRowCount` directly off
        // `itemsView.rowProvider` (see itemTree.jsx:1362) — patching the
        // wrapper on `itemsView` is bypassed. The wrapper just delegates,
        // so the rowProvider is the real source of truth. Patch both for
        // safety: the wrapper is used by `_renderItem`, the rowProvider
        // is used by `getRowCount` and many other callers.
        const rp = itemsView.rowProvider;
        if (!rp) return;

        const state = this._filterState;
        const active = this._isFilterActive(state);

        // Filter cleared: restore originals by deleting the
        // own-property patches so prototype methods show through.
        if (!active) {
            if (rp._wvOrigGetRow) {
                delete rp.getRow;
                delete rp.getRowCount;
                delete rp._wvOrigGetRow;
                delete rp._wvOrigGetRowCount;
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
                try { itemsView.tree.invalidate(); } catch (e) {}
            }
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
        const findProtoMethod = (obj, name) => {
            let p = Object.getPrototypeOf(obj);
            while (p) {
                if (Object.prototype.hasOwnProperty.call(p, name)
                    && typeof p[name] === "function") {
                    return p[name];
                }
                p = Object.getPrototypeOf(p);
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
            rp._wvOrigGetRowCount = (rpGetRowCount || rp.getRowCount).bind(rp);
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

        const origGetRow = rp._wvOrigGetRow;
        const origGetRowCount = rp._wvOrigGetRowCount;

        // ---- Per-apply hot-path caches (perf) ----
        // Hoisted here (above the cascade pass) so Pass 1's
        // `_hasMatchingAnnotation` calls share the cache with
        // Pass 2's `_rowIsPrimary` checks. Without this, cascade
        // recomputes per-item primary verdicts that pass 2 then
        // recomputes again.
        const isPrimaryCache = new Map();
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
        const hasMatchCache = new Map();
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
                Zotero.debug("[Weavero][filter] hasMatch err: " + e);
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
        const hasPrimaryDescendant = (item) => {
            if (!item) return false;
            if (item.isFileAttachment && item.isFileAttachment()) {
                const anns = (typeof item.getAnnotations === "function")
                    ? (item.getAnnotations() || []) : [];
                for (const ann of anns) {
                    if (isPrimary(ann)) return true;
                }
                return false;
            }
            if (item.isRegularItem && item.isRegularItem()) {
                const attIds = (typeof item.getAttachments === "function")
                    ? item.getAttachments() : [];
                for (const aId of attIds) {
                    const att = Zotero.Items.get(aId);
                    // `hasMatch(att)` covers both "att itself is
                    // primary" and "att has a primary annotation".
                    // Either way, the regular item must open so the
                    // attachment row becomes visible.
                    if (att && hasMatch(att)) return true;
                }
                const noteIds = (typeof item.getNotes === "function")
                    ? item.getNotes() : [];
                for (const nId of noteIds) {
                    const n = Zotero.Items.get(nId);
                    if (n && isPrimary(n)) return true;
                }
            }
            return false;
        };

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
        if (cascade) {
            const wasFlag = rp._wvFilterSelfCall;
            rp._wvFilterSelfCall = true;
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
                        const isContainer = typeof row.isContainer === "function"
                            && row.isContainer();
                        if (!isContainer) continue;
                        const isOpen = typeof row.isContainerOpen === "function"
                            && row.isContainerOpen();
                        if (isOpen) continue;
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
                            Zotero.debug("[Weavero][filter] expandRows err: " + e);
                        }
                    } else {
                        // Fallback — should never hit since we always
                        // capture expandRows during patch install.
                        for (const i of toOpen) {
                            try { itemsView.openContainer(i); } catch (e) {}
                        }
                    }
                }
            } finally {
                rp._wvFilterSelfCall = wasFlag;
            }
            Zotero.debug("[Weavero][filter] expanded; total rows now: "
                + origGetRowCount());
        }

        // Pass 2 — collect indices to keep: primary matches + every
        // ancestor row that contains them (so the tree shape is
        // preserved). For item-scope-alone matches the entire subtree
        // of the primary regular item is kept too.
        const total = origGetRowCount();
        // Build via Set to dedupe — when a regular item is primary,
        // its inner loop pushes descendant indices that the outer
        // loop will also visit, so naive push-twice produces dupes.
        const keepSet = new Set();
        const pushKeep = (i) => keepSet.add(i);
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
        // Strict per-row matching: every row is judged on its own
        // primary status. Non-primary rows are kept ONLY when they
        // happen to be ancestors of a primary descendant (so the
        // tree shape stays valid). Descendants of a primary parent
        // are NOT auto-kept — they're visited in the outer loop and
        // will be kept iff they themselves pass the filter, which is
        // the behaviour the user expects from each filter trigger
        // (e.g. picking `itemType=book` shows books, not their
        // attachments / notes / annotations as well).
        for (let j = 0; j < total; j++) {
            let row;
            try { row = origGetRow(j); } catch (e) { continue; }
            if (!row || !row.ref) continue;
            const item = row.ref;
            if (isPrimary(item)) {
                pushKeep(j);
            } else if (hasMatch(item)) {
                // Ancestor-keep — `hasMatch` is true when some
                // descendant is primary, so this row needs to stay
                // visible to preserve the path down to the match.
                pushKeep(j);
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
        const recentIDs = this._wvRecentlyAddedItemIDs;
        if (recentIDs && recentIDs.size) {
            for (let j = 0; j < total; j++) {
                let row;
                try { row = origGetRow(j); } catch (e) { continue; }
                if (!row || !row.ref) continue;
                if (!recentIDs.has(row.ref.id)) continue;
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
        // Materialise the deduped keep set as a sorted array. The
        // rest of the apply logic (`getRow` patch etc.) consumes
        // this as the row-index translation table.
        const keep = [...keepSet].sort((a: number, b: number) => a - b);

        Zotero.debug("[Weavero][filter] kept " + keep.length
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

        rp.getRow = function (idx) {
            if (this[SELF]) return rp._wvOrigGetRow(idx);
            const r = safeReal(idx);
            if (r < 0) return undefined;
            return rp._wvOrigGetRow(r);
        };
        rp.getRowCount = function () {
            if (this[SELF]) return rp._wvOrigGetRowCount();
            return keep.length;
        };
        if (rp._wvOrigGetLevel) {
            rp.getLevel = function (idx) {
                if (this[SELF]) return rp._wvOrigGetLevel(idx);
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
        const wrapToggle = function (origFn) {
            return function (filteredIdx, skipRowMapRefresh) {
                if (this[SELF]) {
                    return origFn.call(this, filteredIdx, skipRowMapRefresh);
                }
                const realIdx = keep[filteredIdx];
                if (realIdx === undefined) return;
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
                            Zotero.debug("[Weavero][filter] listener err: " + e);
                        }
                    }
                }
            };
        };
        const wrapMulti = function (origFn) {
            return function (indices) {
                if (this[SELF]) return origFn.call(this, indices);
                const real = (indices || []).map(i => keep[i])
                    .filter(x => x !== undefined);
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
                            Zotero.debug("[Weavero][filter] listener err: " + e);
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
                            Zotero.debug("[Weavero][filter] listener err: " + e);
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

        try { itemsView.tree.invalidate(); } catch (e) {}
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
            Zotero.debug("[Weavero][filter] sync reapply err: " + e);
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
        const opened = this._filterOpenedIDs;
        this._filterOpenedIDs = null;
        if (!opened || !opened.size) return;
        if (!rp || !rp._rows) return;
        // `_toggleOpenState` is the low-level mutate-only path —
        // doesn't fire `runListeners('update', ...)`, so no selection
        // restore storms during teardown. `refreshRowMap` syncs the
        // id→idx lookup once at the end.
        const toggle = rp._toggleOpenState
            && rp._toggleOpenState.bind(rp);
        if (!toggle) return;
        // Iterate from the bottom so closing one doesn't shift the
        // indices of those still to check.
        for (let i = rp._rows.length - 1; i >= 0; i--) {
            const row = rp._rows[i];
            if (!row || !row.ref) continue;
            if (!opened.has(row.ref.id)) continue;
            // Z9 keeps level-0 parents open after clear; we match that.
            if ((row.level || 0) < 1) continue;
            const isOpenContainer = row.isContainer && row.isContainer()
                && row.isContainerOpen && row.isContainerOpen();
            if (!isOpenContainer) continue;
            try { toggle(i, true); }
            catch (e) {
                Zotero.debug("[Weavero][filter] partial-collapse err: " + e);
            }
        }
        try { rp.refreshRowMap && rp.refreshRowMap(); } catch (e) {}
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
            Zotero.debug("[Weavero][filter] hasMatch err: " + e);
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
