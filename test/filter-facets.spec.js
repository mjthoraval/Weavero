/* global describe, it, before, assert */

// The filter's dimensions are declared once, in src/modules/filter-facets.ts
// (survey 2026-10-06 step 7, slice 1). Six methods used to keep their own
// hand-written dimension lists and had drifted apart: _emptyFilterGroup,
// _isGroupActive, _wvDimLevels, _wvFilterParentLevelOnly,
// _wvFilterTargetsChildren and the level part of
// _effectiveSelectionTargetKinds.
//
// CHARACTERIZATION: EXPECTED below was recorded from the code BEFORE the
// table existed (0.21.9-next.26, live, 2026-10-08) -- every dimension set
// alone (include and exclude, or on and off), the scope variants, the
// quick-search scopes and the state-level filters. The table must reproduce
// it exactly. A deliberate behaviour change edits the affected lines here,
// in the same commit, with the reason.

describe("Weavero — filter dimensions come from one table", () => {
    let wv, F;
    const CASES = // Shared by the snapshot probe (bridge eval) and test/filter-facets.spec.js:
// every filter dimension set alone, plus scopes, quick-search scopes and the
// state-level filters. `run(wv)` returns { caseName: outputs }.
(function () {
    const LISTS = ["annotationColor", "annotationType", "annotationTag", "annotationAuthor", "itemType",
        "attachmentFileType", "outlineClass", "outlineFlags", "outlineVerdict", "addedBy", "publication", "readStatus"];
    const TRIS = ["annotationHasComment", "annotationSource", "hasRelated", "hasLink", "hasTag", "hasBookmarks",
        "itemNote", "standaloneNote", "standaloneAttachment", "hasAbstract", "hasDOI", "hasPMID", "hasPMCID",
        "retracted", "hasURL", "hasAttachment", "hasAnnotations", "hasEmbeddedAnnotations", "hasOutline", "inOtherLibrary"];
    const KINDS3 = ["annotation", "attachment", "parent"];
    function cases(wv) {
        const out = [];
        const g = (patch) => Object.assign(wv._emptyFilterGroup(), patch);
        out.push({ name: "empty", group: g({}) });
        for (const k of LISTS) {
            out.push({ name: k, group: g({ [k]: ["x"] }) });
            out.push({ name: k + "Exclude", group: g({ [k + "Exclude"]: ["x"] }) });
        }
        for (const k of TRIS) {
            out.push({ name: k + "=true", group: g({ [k]: true }) });
            out.push({ name: k + "=false", group: g({ [k]: false }) });
        }
        // Scoped cross-level dimensions, each scope narrowed to one kind.
        for (const kind of KINDS3) {
            const sc = { annotation: false, attachment: false, parent: false, [kind]: true };
            out.push({ name: "hasTag+scope:" + kind, group: g({ hasTag: true, hasTagScope: sc }) });
            out.push({ name: "hasRelated+scope:" + kind, group: g({ hasRelated: true, hasRelatedScope: sc }) });
            out.push({ name: "annotationTag+scope:" + kind, group: g({ annotationTag: ["x"], hasTagScope: sc }) });
        }
        for (const src of ["annotationComment", "itemNoteText", "standaloneText"]) {
            const sc = { annotationComment: false, itemNoteText: false, standaloneText: false, [src]: true };
            out.push({ name: "hasLink+scope:" + src, group: g({ hasLink: true, hasLinkScope: sc }) });
        }
        for (const k of ["topLevel", "attachments", "annotations", "notes"]) {
            const sc = { topLevel: false, attachments: false, annotations: false, notes: false, [k]: true };
            out.push({ name: "addedBy+scope:" + k, group: g({ addedBy: ["x"], addedByScope: sc }) });
        }
        // Quick-search scope with one kind off (alone it activates the group).
        for (const kind of ["annotation", "attachment", "note", "parent"]) {
            const sc = { annotation: true, attachment: true, note: true, parent: true, [kind]: false };
            out.push({ name: "qsScope-" + kind, group: g({ quickSearchScope: sc }) });
        }
        // Two dimensions on different levels.
        out.push({ name: "annotationColor+itemType", group: g({ annotationColor: ["x"], itemType: ["x"] }) });
        out.push({ name: "attachmentFileType+hasDOI", group: g({ attachmentFileType: ["x"], hasDOI: true }) });
        return out;
    }
    function run(wv) {
        const res = {};
        const savedState = wv._filterState, savedQS = wv._currentQuickSearchValue;
        try {
            const one = (state, qs) => {
                wv._filterState = state;
                wv._currentQuickSearchValue = qs;
                const grp = state.groups && state.groups[0];
                return {
                    active: grp ? !!wv._isGroupActive(grp) : null,
                    userActive: !!wv._wvUserFilterActive(state),
                    parentOnly: !!wv._wvFilterParentLevelOnly(state),
                    targetsChildren: !!wv._wvFilterTargetsChildren(),
                    selTarget: wv._effectiveSelectionTargetKinds(),
                };
            };
            for (const c of cases(wv)) {
                const state = { groups: [c.group], activeGroupIndex: 0, collections: [], savedSearches: [] };
                res[c.name] = one(state, "");
                if (c.name.startsWith("qsScope-")) res[c.name + "@search"] = one(state, "x");
            }
            /** @type {Array<[string, string[]]>} */
            const GLOBALS = [["collections", ["C1"]], ["collectionsExclude", ["C1"]], ["savedSearches", ["S1"]], ["savedSearchesExclude", ["S1"]]];
            for (const [k, v] of GLOBALS) {
                const state = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0, collections: [], savedSearches: [], [k]: v };
                res["state:" + k] = one(state, "");
            }
            res["@emptyGroup"] = JSON.parse(JSON.stringify(wv._emptyFilterGroup()));
            res["@dimLevels"] = wv._wvDimLevels();
        }
        finally {
            wv._filterState = savedState;
            wv._currentQuickSearchValue = savedQS;
        }
        return res;
    }
    return { cases, run };
})();

    // Recorded before the table (see the header).
    const EXPECTED = {
        "empty": {"active": false, "userActive": false, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "annotationColor": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationColorExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationType": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationTypeExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationTag": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "annotationTagExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "annotationAuthor": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationAuthorExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "itemType": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "itemTypeExclude": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "attachmentFileType": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "attachmentFileTypeExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineClass": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineClassExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineFlags": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineFlagsExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineVerdict": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "outlineVerdictExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "addedBy": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "addedByExclude": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "publication": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "publicationExclude": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "readStatus": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "readStatusExclude": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "annotationHasComment=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationHasComment=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationSource=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationSource=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "hasRelated=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "hasRelated=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "hasLink=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": true}},
        "hasLink=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": true}},
        "hasTag=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "hasTag=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "hasBookmarks=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "hasBookmarks=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "itemNote=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "itemNote=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "standaloneNote=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "standaloneNote=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "standaloneAttachment=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "standaloneAttachment=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasAbstract=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasAbstract=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasDOI=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasDOI=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasPMID=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasPMID=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasPMCID=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasPMCID=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "retracted=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "retracted=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasURL=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasURL=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasAttachment=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasAttachment=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasAnnotations=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasAnnotations=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasEmbeddedAnnotations=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasEmbeddedAnnotations=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasOutline=true": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "hasOutline=false": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "inOtherLibrary=true": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "inOtherLibrary=false": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "hasTag+scope:annotation": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "hasRelated+scope:annotation": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "annotationTag+scope:annotation": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "hasTag+scope:attachment": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": true, "annotation": false}},
        "hasRelated+scope:attachment": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": true, "annotation": false}},
        "annotationTag+scope:attachment": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": true, "annotation": false}},
        "hasTag+scope:parent": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": false, "note": true, "annotation": false}},
        "hasRelated+scope:parent": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": false, "note": true, "annotation": false}},
        "annotationTag+scope:parent": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": true, "annotation": false}},
        "hasLink+scope:annotationComment": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "hasLink+scope:itemNoteText": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "hasLink+scope:standaloneText": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "addedBy+scope:topLevel": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": false}},
        "addedBy+scope:attachments": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": true, "note": false, "annotation": false}},
        "addedBy+scope:annotations": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": false, "annotation": true}},
        "addedBy+scope:notes": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": false, "attachment": false, "note": true, "annotation": false}},
        "qsScope-annotation": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "qsScope-annotation@search": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": false}},
        "qsScope-attachment": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "qsScope-attachment@search": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": false, "note": true, "annotation": true}},
        "qsScope-note": {"active": true, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "qsScope-note@search": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": false, "annotation": true}},
        "qsScope-parent": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "qsScope-parent@search": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": false, "attachment": true, "note": true, "annotation": true}},
        "annotationColor+itemType": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": false, "note": false, "annotation": true}},
        "attachmentFileType+hasDOI": {"active": true, "userActive": true, "parentOnly": false, "targetsChildren": true, "selTarget": {"parent": true, "attachment": true, "note": false, "annotation": false}},
        "state:collections": {"active": false, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "state:collectionsExclude": {"active": false, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "state:savedSearches": {"active": false, "userActive": true, "parentOnly": false, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "state:savedSearchesExclude": {"active": false, "userActive": true, "parentOnly": true, "targetsChildren": false, "selTarget": {"parent": true, "attachment": true, "note": true, "annotation": true}},
        "@emptyGroup": {"annotationColor": [], "annotationColorExclude": [], "annotationType": [], "annotationTypeExclude": [], "annotationHasComment": null, "annotationSource": null, "annotationTag": [], "annotationTagExclude": [], "annotationAuthor": [], "annotationAuthorExclude": [], "itemType": [], "itemTypeExclude": [], "attachmentFileType": [], "attachmentFileTypeExclude": [], "outlineClass": [], "outlineClassExclude": [], "outlineFlags": [], "outlineFlagsExclude": [], "outlineVerdict": [], "outlineVerdictExclude": [], "addedBy": [], "addedByExclude": [], "addedByScope": {"topLevel": true, "attachments": true, "annotations": true}, "hasRelated": null, "hasLink": null, "hasTag": null, "hasBookmarks": null, "hasRelatedScope": {"annotation": true, "attachment": true, "parent": true}, "hasLinkScope": {"annotationComment": true, "itemNoteText": true, "standaloneText": true}, "hasTagScope": {"annotation": true, "attachment": true, "parent": true}, "quickSearchScope": {"annotation": true, "attachment": true, "parent": true}, "itemNote": null, "standaloneNote": null, "standaloneAttachment": null, "hasAbstract": null, "hasDOI": null, "hasPMID": null, "hasPMCID": null, "retracted": null, "hasURL": null, "hasAttachment": null, "hasAnnotations": null, "hasEmbeddedAnnotations": null, "hasOutline": null, "publication": [], "publicationExclude": [], "readStatus": [], "readStatusExclude": [], "inOtherLibrary": null},
        "@dimLevels": {"annotation": ["annotationColor", "annotationColorExclude", "annotationType", "annotationTypeExclude", "annotationHasComment", "annotationSource", "annotationAuthor", "annotationAuthorExclude"], "attachment": ["attachmentFileType", "attachmentFileTypeExclude", "outlineClass", "outlineClassExclude", "outlineFlags", "outlineFlagsExclude", "outlineVerdict", "outlineVerdictExclude"], "parent": ["itemType", "itemTypeExclude", "hasAbstract", "hasDOI", "hasPMID", "hasPMCID", "retracted", "hasURL", "hasAttachment", "publication", "publicationExclude", "readStatus", "readStatusExclude", "inOtherLibrary"]},
    };

    let rlOff = null;
    before(() => {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvFilterDims");
        F = CASES;
        rlOff = wvT.readingListOn();   // Read Status is classified as available
    });
    after(() => { if (rlOff) rlOff(); });

    it("every dimension, alone and in scope variants, classifies as before the table", () => {
        const got = F.run(wv);
        const names = Object.keys(EXPECTED);
        assert.sameMembers(Object.keys(got), names, "the case list itself");
        const diffs = [];
        for (const n of names) {
            if (JSON.stringify(sortKeys(got[n])) !== JSON.stringify(sortKeys(EXPECTED[n]))) {
                diffs.push(n + ": got " + JSON.stringify(got[n]) + " expected " + JSON.stringify(EXPECTED[n]));
            }
        }
        assert.deepEqual(diffs, [], "classification changed");
    });

    it("every field of an empty group is a table dimension or a scope, and every dimension has its fields", () => {
        const facets = wv._wvFilterDims();
        const fields = new Set();
        for (const f of facets) {
            fields.add(f.id);
            if (f.shape === "list") fields.add(f.id + "Exclude");
        }
        const SCOPES = new Set(["addedByScope", "hasRelatedScope", "hasLinkScope", "hasTagScope", "quickSearchScope"]);
        const g = wv._emptyFilterGroup();
        const unknown = Object.keys(g).filter(k => !fields.has(k) && !SCOPES.has(k));
        assert.deepEqual(unknown, [], "group fields with no table entry");
        const missing = [...fields].filter(k => !(k in g));
        assert.deepEqual(missing, [], "table dimensions missing from the empty group");
        assert.equal(new Set(facets.map(f => f.id)).size, facets.length, "dimension ids are unique");
    });

    it("every dimension with per-row `rows` has a row test, and every test a dimension", () => {
        const withRows = wv._wvFilterDims().filter(f => f.rows).map(f => f.id).sort();
        assert.deepEqual(wvT.method("_wvFilterDimTestIds").call(wv).slice().sort(), withRows);
    });

    it("the quick search's own-kind match counts every parent-level chip (Has PMID / PMCID were missing)", () => {
        const g = (patch) => Object.assign(wv._emptyFilterGroup(), patch);
        const kinds = (patch) => wv._wvQsChipKinds(g(patch));
        for (const k of ["hasPMID", "hasPMCID", "hasDOI", "hasAbstract", "retracted", "inOtherLibrary"]) {
            assert.deepEqual(kinds({ [k]: true }), { annotation: false, attachment: false, parent: true }, k);
        }
        assert.deepEqual(kinds({ itemType: ["book"] }), { annotation: false, attachment: false, parent: true });
        assert.deepEqual(kinds({ annotationColor: ["#ffd400"] }), { annotation: true, attachment: false, parent: false });
        assert.deepEqual(kinds({ attachmentFileType: ["attachmentPDF"] }), { annotation: false, attachment: true, parent: false });
        // Author and Tag are not kind-specific chips here (as before).
        assert.deepEqual(kinds({ annotationAuthor: ["x"], annotationTag: ["t"] }), { annotation: false, attachment: false, parent: false });
    });

    it("the six methods read the table, not a list of their own", () => {
        for (const name of ["_isGroupActive", "_wvDimLevels", "_wvFilterParentLevelOnly", "_wvFilterTargetsChildren", "_effectiveSelectionTargetKinds"]) {
            const s = wvT.src(name);
            assert.notMatch(s, /"hasAbstract"|"inOtherLibrary"|group\.hasDOI|"annotationColor"/, name + " still names a dimension");
        }
    });
});

function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
        const o = {};
        for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
        return o;
    }
    return v;
}
