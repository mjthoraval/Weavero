// The items-list filter's dimensions, declared once (survey 2026-10-06,
// step 7 slice 1). Six methods used to keep their own hand-written lists of
// these and had drifted apart; they now read this table:
//   _emptyFilterGroup        -- the defaults (`wvDimDefaults`)
//   _isGroupActive           -- "is anything set" (`wvDimSet`)
//   _wvDimLevels             -- the row level each dimension pins (`level`)
//   _wvFilterParentLevelOnly -- the parent-level set (`level: "parent"`)
//   _wvFilterTargetsChildren -- `level` annotation/attachment, or `kids`
//   _effectiveSelectionTargetKinds -- `level`, then `sel`
// Guard: test/filter-facets.spec.js (a characterization of all six,
// recorded before the table, plus a field <-> table check).
//
// Order matters for `wvDimLevels()`, whose field lists keep the order the
// hand-written lists had, and is the chip bar's chip order (slice 3).

import { wvStr } from "../lib/l10n";

/** A row LEVEL a dimension pins (Selection Target, the cascade skip, the
 *  quick-search re-route gate). */
export type WvDimLevel = "annotation" | "attachment" | "parent";

/** How a dimension WITHOUT a level contributes to the Selection Target's
 *  smart default: fixed row kinds, or the kinds its scope object allows. */
export type WvDimSel =
    | { kinds: string[] }
    | { rowScope: string }          // a { annotation, attachment, parent } scope
    | { linkScope: true }           // Has Link's text-source scope
    | { addedByScope: true };       // Added By's topLevel/attachments/... scope

export interface WvDim {
    /** The group field. A list dimension also has `<id>Exclude`. */
    id: string;
    /** list: include + exclude arrays (Alt+click = exclude); the two are
     *  mutually exclusive per value. tri: null = off, true = must have,
     *  false = must not have (Alt+click). */
    shape: "list" | "tri";
    level?: WvDimLevel;
    /** Without a level, still makes the filter target CHILD rows (the
     *  quick-search re-route gate): the cross-level dimensions. */
    kids?: boolean;
    sel?: WvDimSel;
    /** The row kind the dimension's own per-row test applies to (slice 2).
     *  Rows of other kinds relax through `_rowPassesFilters` and never count
     *  as an own-kind match. The test itself (how to read an item) lives in
     *  filter.ts's WV_DIM_TESTS, next to the item helpers it uses.
     *  Dimensions without `rows` keep bespoke code: scopes (Tag, Added By,
     *  Has Related / Link / Tag), the note pair, Standalone Attachment, Has
     *  Bookmarks. */
    rows?: WvDimRows;
    /** Part of the strict per-kind test the tree join uses (`_kindOK`). */
    kindCheck?: boolean;
    /** Also enforced on the tree's ROOT regular item (tree-level, Rule 2):
     *  an attachment under a parent without an abstract fails Has Abstract. */
    root?: boolean;
    /** The chip bar's field label (slice 3; `_renderFilterBar`), in the UI's
     *  language: a getter over `chipL10n`, defined below the table (never
     *  resolved at import time). How the chip reads its operator and values
     *  lives in filter.ts's WV_CHIPS. */
    readonly chip?: string;
    /** The weavero.ftl message of `chip`. */
    chipL10n: string;
    /** A DEV outline-eval dimension: its chip shows only while
     *  `weavero.devOutlineEval` is on (on top of the toggle-time scrub in
     *  `_wvOeOnPrefToggle`, so a stale group can never surface one). */
    dev?: boolean;
    /** DORMANT while this returns true: a selection made earlier is kept
     *  but counts as unset everywhere (no chip, no filtering, no Selection
     *  Target effect) and applies again when it returns false. Evaluated
     *  only while the dimension is set. */
    dormant?: () => boolean;
    /** A FEED ITEM can never match it (MJT 2026-11-22, "The filter of feeds
     *  probably contains a lot of irrelevant filters. Clean-up"): in a feed
     *  view its control is not in the popup and a selection made in a library
     *  is dormant there -- filter.ts `_wvFeedGroup`, which hands every check a
     *  group with these fields at their defaults. What a feed item can carry
     *  (Zotero source, 11.0-beta.5): it lives in a feed library the user cannot
     *  edit (xpcom/data/feed.js: editable / filesEditable false), so no tags,
     *  notes, collections, relations or annotations; FeedReader._getFeedItem
     *  (xpcom/feedReader.js) fills title, abstract, URL, creators, date,
     *  publication, pages, ISSN / ISBN, DOI, publisher, language, volume,
     *  issue, section -- no Extra, no PMID / PMCID; its only possible child is a
     *  linked-URL PDF enclosure (feed.js _updateFeed: Attachments.linkFromURL),
     *  never a file. */
    noFeed?: boolean;
    /** `<id>Exclude`, computed once at load (hot path: no string building
     *  per row). Set for list dimensions only. */
    idX?: string;
    /** Filled by filter.ts at load for dimensions with `rows`: the row test
     *  (WV_DIM_TESTS entry) and the row-kind bit of `rows`, so the per-row
     *  checks do no lookups by name. */
    test?: any;
    rowsBit?: number;
}

export type WvDimRows = "annotation" | "attachment" | "fileAttachment" | "regular" | "any";

/** Read Status takes part only while the "Read Status" filter option is on
 *  and Zotero Reading List is active (resolved through the live plugin). */
function wvReadStatusDormant(): boolean {
    try {
        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        if (!p) return true;
        const on = (typeof p._getEnableReadStatusFilter === "function" ? p._getEnableReadStatusFilter() : true)
            && typeof p._wvReadingListActive === "function" && p._wvReadingListActive();
        return !on;
    }
    catch (e) { return true; }
}

/** Has Backlinks takes part only while the Backlinks section switch is on. */
function wvBacklinksDormant(): boolean {
    try {
        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        if (!p || typeof p._getEnableBacklinks !== "function") return true;
        return !p._getEnableBacklinks();
    }
    catch (e) { return true; }
}

/** Has Item Links takes part only while the Links section switch is on. */
function wvItemLinksDormant(): boolean {
    try {
        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        if (!p || typeof p._getEnableLinks !== "function") return true;
        return !p._getEnableLinks();
    }
    catch (e) { return true; }
}

/** Not In Your Library takes part only in a feed view of the window being
 *  filtered, while the Feeds feature is on: a selection made there is kept
 *  and left aside in the libraries' views. */
function wvFeedsDormant(): boolean {
    try {
        const p: any = (Zotero as any).Weavero && (Zotero as any).Weavero.plugin;
        if (!p || typeof p._wvFdOn !== "function" || !p._wvFdOn()) return true;
        // The window being filtered (filter.ts; pinned during an apply).
        return !(typeof p._wvFilterInFeedView === "function" && p._wvFilterInFeedView());
    }
    catch (e) { return true; }
}

// `noFeed` (see WvDim): what a feed item cannot carry, per dimension -- an
// annotation, a file attachment or a note needs a child a feed item never has
// (feed.js); a tag, a relation, a collection or an Extra line needs an edit
// the feed library refuses; PMID / PMCID and Added By are never filled
// (feedReader.js; groupItems is a group library's table). Kept in a feed view:
// Author (creators), Item Type, Abstract, DOI, URL, Publication, Retracted
// (Zotero's retraction scan reads every item's DOI, retractions.js
// _cacheKeyMappings) and Not In Your Library.
export const WV_FILTER_DIMS: WvDim[] = [
    // ---- annotation rows ----
    { id: "annotationColor", shape: "list", level: "annotation", rows: "annotation", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-annotation-color" },
    { id: "annotationType", shape: "list", level: "annotation", rows: "annotation", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-annotation-type" },
    { id: "annotationHasComment", shape: "tri", level: "annotation", rows: "annotation", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-has-comment" },
    // Source (`annotationIsExternal`): true = embedded in the PDF by an outside
    // reader, false = made in Zotero Reader. Embedded-first since 2026-08-18
    // (MJT: plain click selects the external ones). Native Advanced Search
    // cannot express it -- `isExternal` is not a search condition.
    { id: "annotationSource", shape: "tri", level: "annotation", rows: "annotation", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-annotation-source" },
    // Tag (specific value): despite the name it matches ANY row's own tags,
    // so it is cross-level. Shares `hasTagScope` with Has Tag -- one scope,
    // both filters.
    { id: "annotationTag", shape: "list", sel: { rowScope: "hasTagScope" }, noFeed: true, chipL10n: "weavero-filter-dim-tag" },
    // Author: the annotation author, and an item's creators -- so any row.
    // Annotation-level for the Selection Target (the panel only offers
    // annotation authors); not part of the strict annotation kind check.
    { id: "annotationAuthor", shape: "list", level: "annotation", rows: "any", chipL10n: "weavero-filter-dim-author" },
    // ---- parent metadata ----
    // Item type (book / journalArticle / ...): regular items only.
    { id: "itemType", shape: "list", level: "parent", rows: "regular", kindCheck: true, chipL10n: "weavero-filter-dim-item-type" },
    // ---- attachments ----
    // File kind (PDF / EPUB / Snapshot / Image / Video / Web Link / Other).
    // A feed's PDF enclosure (a linked URL) would read PDF, but none was seen
    // in 2,331 feed items (MJT's Zotero, 2026-11-22): the whole Attachment
    // group goes in a feed view.
    { id: "attachmentFileType", shape: "list", level: "attachment", rows: "attachment", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-attachment-file-type" },
    // DEV outline-eval facets (shown only with `weavero.devOutlineEval`):
    // classification source + flags, and the recorded verdict. Matched by
    // token-set intersection (`_outlineMatchesList`).
    { id: "outlineClass", shape: "list", level: "attachment", rows: "attachment", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-outline-source", dev: true },
    { id: "outlineFlags", shape: "list", level: "attachment", rows: "attachment", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-outline-flags", dev: true },
    { id: "outlineVerdict", shape: "list", level: "attachment", rows: "attachment", kindCheck: true, noFeed: true, chipL10n: "weavero-filter-dim-outline-verdict", dev: true },
    // ---- cross-level ----
    // Added By, narrowed per row kind by `addedByScope`.
    { id: "addedBy", shape: "list", kids: true, sel: { addedByScope: true }, noFeed: true, chipL10n: "weavero-filter-dim-added-by" },
    // Has Related / Has Link / Has Tag: applied to every row kind the same
    // way, each narrowed by its own scope object.
    { id: "hasRelated", shape: "tri", kids: true, sel: { rowScope: "hasRelatedScope" }, noFeed: true, chipL10n: "weavero-filter-dim-has-related" },
    // The chip reads "Has External Link" since 2026-10-30: only a link that
    // leaves Zotero (a zotero:// one is Has Item Links'; MJT, "so that there
    // is not overlap anymore"). Its id and stored state keep "hasLink".
    { id: "hasLink", shape: "tri", kids: true, sel: { linkScope: true }, noFeed: true, chipL10n: "weavero-filter-dim-has-external-link" },
    // Has Item Links (Links plan slice 3, MJT 2026-10-28): a note or an
    // annotation comment in the tree links another Zotero item -- what the
    // Links column counts (zotero:// links, citations, quotes; resolved;
    // not into the source's own paper). A web URL alone is Has External Link's. No
    // scope; dormant while the Links switch is off. Has Backlinks' mirror.
    { id: "hasItemLinks", shape: "tri", noFeed: true, chipL10n: "weavero-filter-dim-has-item-links", dormant: wvItemLinksDormant },
    // Has Bookmarks: an attachment carrying reader bookmarks (Weavero's
    // per-attachment store). No scope.
    { id: "hasBookmarks", shape: "tri", noFeed: true, chipL10n: "weavero-filter-dim-has-bookmarks" },
    // Has Backlinks (issue #60, 2026-10-22): an item, a child or one of its
    // annotations is linked from another annotation comment or note
    // (modules/backlinks.ts). No scope. Dormant while the Backlinks switch
    // (Links & Relations -> Relations) is off, like Read Status.
    { id: "hasBacklinks", shape: "tri", noFeed: true, chipL10n: "weavero-filter-dim-has-backlinks", dormant: wvBacklinksDormant },
    { id: "hasTag", shape: "tri", kids: true, sel: { rowScope: "hasTagScope" }, noFeed: true, chipL10n: "weavero-filter-dim-has-tag" },
    // ---- note / standalone rows (strict per row) ----
    // Item Note = a note attached to a regular item (Zotero's own wording).
    { id: "itemNote", shape: "tri", sel: { kinds: ["note"] }, noFeed: true, chipL10n: "weavero-filter-dim-item-note" },
    { id: "standaloneNote", shape: "tri", sel: { kinds: ["note"] }, noFeed: true, chipL10n: "weavero-filter-dim-standalone-note" },
    // Standalone Attachment (2026-08-19): parentless attachments. A
    // restriction, ANDs with the file type.
    { id: "standaloneAttachment", shape: "tri", sel: { kinds: ["attachment"] }, noFeed: true, chipL10n: "weavero-filter-dim-standalone-attachment" },
    // ---- parent-targeting tri-states (regular items; others relax) ----
    { id: "hasAbstract", shape: "tri", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-has-abstract" },
    { id: "hasDOI", shape: "tri", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-has-doi" },
    { id: "hasPMID", shape: "tri", level: "parent", rows: "regular", root: true, noFeed: true, chipL10n: "weavero-filter-dim-has-pmid" },
    { id: "hasPMCID", shape: "tri", level: "parent", rows: "regular", root: true, noFeed: true, chipL10n: "weavero-filter-dim-has-pmcid" },
    // Retracted (2026-09-28, forum 133954): Zotero.Retractions.isRetracted(),
    // what the items list marks. Dismissed "Retract and Replace" items do
    // not count; items whose citation warning was switched off still do.
    { id: "retracted", shape: "tri", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-retracted" },
    { id: "hasURL", shape: "tri", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-has-url" },
    // FILES only (filter.ts wvItemHasFileAttachment): a feed enclosure is a
    // linked URL.
    { id: "hasAttachment", shape: "tri", level: "parent", rows: "regular", root: true, noFeed: true, chipL10n: "weavero-filter-dim-has-attachment" },
    // ---- attachment-targeting tri-states (file attachments only) ----
    { id: "hasAnnotations", shape: "tri", sel: { kinds: ["attachment"] }, rows: "fileAttachment", noFeed: true, chipL10n: "weavero-filter-dim-has-annotations" },
    // Has Weavero Outline (2026-08-20): a CURATED outline
    // (weavero/outlines.json). Deliberately not "has an outline": embedded
    // and extracted outlines are only known by parsing each file.
    { id: "hasOutline", shape: "tri", sel: { kinds: ["attachment"] }, rows: "fileAttachment", noFeed: true, chipL10n: "weavero-filter-dim-has-outline" },
    // Has Embedded Annotations (2026-08-19): at least one PDF-embedded
    // annotation. Unlike the Source chip it does not filter annotation rows.
    { id: "hasEmbeddedAnnotations", shape: "tri", sel: { kinds: ["attachment"] }, rows: "fileAttachment", noFeed: true, chipL10n: "weavero-filter-dim-has-embedded-annotations" },
    // ---- parent multi-selects ----
    // Publication title (case-sensitive by design -- CLAUDE.md invariant).
    { id: "publication", shape: "list", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-publication" },
    // Read Status: Zotero Reading List's `Read_Status:` Extra property.
    // Dormant while its option is off or that plugin is inactive (the
    // section is hidden then, so a selection could not be cleared, and it
    // kept filtering -- MJT 2026-10-13, survey §3.5: ignore it while off).
    // Not a feed item's read state (Zotero's own `isRead`): Weavero has no
    // filter for that.
    { id: "readStatus", shape: "list", level: "parent", rows: "regular", root: true, noFeed: true, chipL10n: "weavero-filter-dim-read-status", dormant: wvReadStatusDormant },
    // In Multiple Libraries: a linked copy (owl:sameAs) in ANY other
    // library. One toggle, not a per-library picker (user, 2026-08-05).
    { id: "inOtherLibrary", shape: "tri", level: "parent", rows: "regular", root: true, noFeed: true, chipL10n: "weavero-filter-dim-in-other-library" },
    // Not In Your Library (feeds.ts, MJT 2026-11-22: ONE chip, the feed items
    // already held by a library hidden): click = hide them, Alt+click = only
    // them. Dormant outside the feed views.
    { id: "feedNotInLibrary", shape: "tri", level: "parent", rows: "regular", root: true, chipL10n: "weavero-filter-dim-feed-not-in-library", dormant: wvFeedsDormant },
];

// The exclude field names, once (the filter checks run per row per apply);
// the chip label as a getter, read where the chip is drawn.
for (const f of WV_FILTER_DIMS) {
    if (f.shape === "list") f.idX = f.id + "Exclude";
    Object.defineProperty(f, "chip", { get: () => wvStr(f.chipL10n), enumerable: true, configurable: true });
}

/** The group fields a dimension owns. */
export function wvDimFields(f: WvDim): string[] {
    return f.shape === "list" ? [f.id, f.idX] : [f.id];
}

/** Is the dimension set in `group` (any include/exclude value, or a
 *  non-null tri-state)? */
export function wvDimSet(group: any, f: WvDim): boolean {
    if (!group) return false;
    let set: boolean;
    if (f.shape === "tri") set = group[f.id] != null;
    else {
        const a = group[f.id], x = group[f.idX];
        set = !!((a && a.length) || (x && x.length));
    }
    return set && !(f.dormant && f.dormant());
}

const WV_DIMS_NO_FEED = new Set(WV_FILTER_DIMS.filter(f => f.noFeed).map(f => f.id));

/** Can a feed item never match dimension `id` (its `noFeed`)? */
export function wvDimNoFeed(id: string): boolean {
    return WV_DIMS_NO_FEED.has(id);
}

/** The `noFeed` dimensions' fields at their defaults (fresh arrays). */
export function wvDimNoFeedDefaults(): Record<string, any> {
    const o: Record<string, any> = {};
    for (const f of WV_FILTER_DIMS) {
        if (!f.noFeed) continue;
        if (f.shape === "list") { o[f.id] = []; o[f.id + "Exclude"] = []; }
        else o[f.id] = null;
    }
    return o;
}

/** Default (unset) values of every dimension. */
export function wvDimDefaults(): Record<string, any> {
    const o: Record<string, any> = {};
    for (const f of WV_FILTER_DIMS) {
        if (f.shape === "list") { o[f.id] = []; o[f.id + "Exclude"] = []; }
        else o[f.id] = null;
    }
    return o;
}

/** The fields of every dimension that pins a row level, per level. */
export function wvDimLevels(): Record<WvDimLevel, string[]> {
    const out: Record<WvDimLevel, string[]> = { annotation: [], attachment: [], parent: [] };
    for (const f of WV_FILTER_DIMS) if (f.level) out[f.level].push(...wvDimFields(f));
    return out;
}

/** The fields whose dimensions make the filter target CHILD rows: the
 *  annotation and attachment levels, plus the cross-level dimensions. */
export function wvDimChildFields(): string[] {
    const out: string[] = [];
    for (const f of WV_FILTER_DIMS) {
        if (f.level === "annotation" || f.level === "attachment" || f.kids) out.push(...wvDimFields(f));
    }
    return out;
}
