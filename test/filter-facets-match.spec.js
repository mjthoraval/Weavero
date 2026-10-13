/* global describe, it, before, after, assert, Zotero, Services */

// The filter's per-row checks against a fixed set of fixture items
// (survey 2026-10-06 step 7, facets slice 2). For every group below and every
// fixture item, five checks are recorded as one 7-character code:
//   pass  _rowPassesFilters(item, g)
//   own   _rowHasOwnKindMatch(item, g)
//   join  _rowSatisfiesTreeJoin(item, g)
//   prim  _rowIsPrimary(item, { groups: [g] })
//   kA kB kR  _kindOK(item, g, "annotation" | "attachment" | "regular")
//
// CHARACTERIZATION: EXPECTED was recorded in the test runner from the code
// BEFORE slice 2 moved the per-dimension tests into the table
// (0.21.9-facets.1). Set WV_FACETS_RECORD=<path> to dump a new recording
// instead of comparing. A deliberate behaviour change edits the affected
// lines here, in the same commit, with the reason.

describe("Weavero — filter row checks, characterized over fixture items", function () {
    this.timeout(60000);
    let wv;
    const F = {};
    const made = [];

    const mkAnn = async (att, i, patch, tags) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = patch.type || "highlight";
        if (a.annotationType === "highlight" || a.annotationType === "underline") a.annotationText = "fixture text " + i;
        a.annotationColor = patch.color || "#ffd400";
        a.annotationComment = patch.comment || "";
        a.annotationSortIndex = "00000|00000" + i + "|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10 + i * 20, 60, 20 + i * 20]] });
        for (const t of tags || []) a.addTag(t);
        await a.saveTx();
        return a;
    };

    let rlOff = null;
    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_rowPassesFilters", "_rowHasOwnKindMatch", "_rowSatisfiesTreeJoin", "_rowIsPrimary", "_kindOK"]) wvT.method(m);
        rlOff = wvT.readingListOn();   // Read Status is characterized as available
        const P1 = await wvT.createItem("journalArticle", {
            title: "WVM P1", abstractNote: "an abstract", DOI: "10.1234/wvm", url: "https://example.org/p1",
            publicationTitle: "Pub A", extra: "PMID: 123\nPMCID: PMC9\nRead_Status: Read",
        });
        P1.setCreators([{ firstName: "Ann", lastName: "Smith", creatorType: "author" }]);
        P1.addTag("t1");
        await P1.saveTx();
        const P2 = await wvT.createItem("book", { title: "WVM P2" });
        P1.addRelatedItem(P2); await P1.saveTx();
        P2.addRelatedItem(P1); await P2.saveTx();
        const A1 = await wvT.createTestPDFItem("wvm-a1", { parentItemID: P1.id });
        const N1 = await mkAnn(A1, 1, { color: "#ffd400", comment: "see https://example.org/n1" }, ["t2"]);
        const N2 = await mkAnn(A1, 2, { type: "underline", color: "#ff6666" });
        const N3 = await mkAnn(A1, 3, { type: "note", color: "#2ea8e5", comment: "a note" });
        const A3 = await wvT.createTestPDFItem("wvm-a3", { parentItemID: P2.id });
        const C1 = new Zotero.Item("note"); C1.libraryID = P1.libraryID; C1.parentID = P1.id;
        C1.setNote("<p>child note https://example.org/c1</p>"); await C1.saveTx();
        const S1 = new Zotero.Item("note"); S1.libraryID = P1.libraryID; S1.setNote("<p>plain standalone note</p>"); await S1.saveTx();
        const SA1 = await wvT.createTestPDFItem("wvm-sa1");
        Object.assign(F, { P1, P2, A1, N1, N2, N3, A3, C1, S1, SA1 });
        made.push(P1, P2, S1, SA1);
    });

    after(async () => { if (rlOff) rlOff(); await wvT.erase(...made); });

    function groups() {
        const g = (patch) => Object.assign(wv._emptyFilterGroup(), patch);
        const author = wv._getItemAuthors(F.N1)[0] || "x";
        const out = [["empty", g({})]];
        const LISTV = {
            annotationColor: ["#ffd400"], annotationType: ["underline"], annotationTag: ["t2"],
            annotationAuthor: [author], itemType: ["journalArticle"], attachmentFileType: ["attachmentPDF"],
            outlineClass: ["embedded"], outlineFlags: ["x"], outlineVerdict: ["good"], addedBy: ["x"],
            publication: ["Pub A"], readStatus: ["Read"],
        };
        for (const [k, v] of Object.entries(LISTV)) {
            out.push([k, g({ [k]: v })]);
            out.push([k + "Exclude", g({ [k + "Exclude"]: v })]);
        }
        out.push(["annotationTag t1", g({ annotationTag: ["t1"] })]);
        for (const k of ["annotationHasComment", "annotationSource", "hasRelated", "hasLink", "hasTag", "hasBookmarks",
            "itemNote", "standaloneNote", "standaloneAttachment", "hasAbstract", "hasDOI", "hasPMID", "hasPMCID",
            "retracted", "hasURL", "hasAttachment", "hasAnnotations", "hasEmbeddedAnnotations", "hasOutline", "inOtherLibrary"]) {
            out.push([k + "=true", g({ [k]: true })]);
            out.push([k + "=false", g({ [k]: false })]);
        }
        for (const kind of ["annotation", "attachment", "parent"]) {
            const sc = { annotation: false, attachment: false, parent: false, [kind]: true };
            out.push(["hasTag scope " + kind, g({ hasTag: true, hasTagScope: sc })]);
            out.push(["hasRelated scope " + kind, g({ hasRelated: true, hasRelatedScope: sc })]);
            out.push(["annotationTag scope " + kind, g({ annotationTag: ["t2"], hasTagScope: sc })]);
        }
        for (const src of ["annotationComment", "itemNoteText", "standaloneText"]) {
            const sc = { annotationComment: false, itemNoteText: false, standaloneText: false, [src]: true };
            out.push(["hasLink scope " + src, g({ hasLink: true, hasLinkScope: sc })]);
        }
        // Combinations the tree join and the same-level OR pairs decide.
        out.push(["color + fileType", g({ annotationColor: ["#ffd400"], attachmentFileType: ["attachmentPDF"] })]);
        out.push(["color + itemType", g({ annotationColor: ["#ffd400"], itemType: ["journalArticle"] })]);
        out.push(["color + hasDOI", g({ annotationColor: ["#ffd400"], hasDOI: true })]);
        out.push(["itemNote + fileType", g({ itemNote: true, attachmentFileType: ["attachmentPDF"] })]);
        out.push(["standaloneNote + itemType", g({ standaloneNote: true, itemType: ["book"] })]);
        out.push(["standaloneNote + itemNote", g({ standaloneNote: true, itemNote: true })]);
        out.push(["hasAnnotations=false + source", g({ hasAnnotations: false, annotationSource: false })]);
        out.push(["standaloneAttachment + fileType", g({ standaloneAttachment: true, attachmentFileType: ["attachmentPDF"] })]);
        out.push(["hasComment + type", g({ annotationHasComment: true, annotationType: ["note"] })]);
        return out;
    }

    function codes() {
        const savedQS = wv._currentQuickSearchValue;
        wv._currentQuickSearchValue = "";
        // In Multiple Libraries passes every row through while the linked-
        // library cache is cold, and the recording was made cold. Pinned, so
        // a spec that warms the cache first cannot change the result (the
        // warm path: test/live/filter-matrix.js, inOtherLibrary cases).
        const ownWarm = Object.prototype.hasOwnProperty.call(wv, "_wvLinkedLibCacheWarm");
        const origWarm = wv._wvLinkedLibCacheWarm;
        wv._wvLinkedLibCacheWarm = () => false;
        const res = {};
        try {
            const b = (v) => (v ? "1" : "0");
            for (const [name, g] of groups()) {
                const parts = [];
                for (const key of Object.keys(F)) {
                    const it = F[key];
                    parts.push(key + ":"
                        + b(wv._rowPassesFilters(it, g)) + b(wv._rowHasOwnKindMatch(it, g))
                        + b(wv._rowSatisfiesTreeJoin(it, g)) + b(wv._rowIsPrimary(it, { groups: [g] }))
                        + b(wv._kindOK(it, g, "annotation")) + b(wv._kindOK(it, g, "attachment")) + b(wv._kindOK(it, g, "regular")));
                }
                res[name] = parts.join(" ");
            }
        }
        finally {
            wv._currentQuickSearchValue = savedQS;
            if (ownWarm) wv._wvLinkedLibCacheWarm = origWarm; else delete wv._wvLinkedLibCacheWarm;
        }
        return res;
    }

    it("every dimension's row checks give the recorded result on every fixture item", async () => {
        const got = codes();
        let rec = null;
        try { rec = Services.env.get("WV_FACETS_RECORD"); } catch (e) {}
        if (rec) {
            await IOUtils.writeUTF8(rec, JSON.stringify(got, null, 1));
            return;
        }
        const diffs = [];
        for (const n of Object.keys(EXPECTED)) {
            if (got[n] !== EXPECTED[n]) diffs.push(n + "\n   got " + got[n] + "\n   exp " + EXPECTED[n]);
        }
        assert.sameMembers(Object.keys(got), Object.keys(EXPECTED), "the group list itself");
        assert.deepEqual(diffs, [], "row checks changed");
    });
});

// Recorded before slice 2 (see the header).
const EXPECTED = {
    "empty":
        "P1:1010001 P2:1010001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1010000 SA1:1010010",
    "annotationColor":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:0010000 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationColorExclude":
        "P1:1010001 P2:1000001 A1:1010010 N1:0010000 N2:1111100 N3:1111100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationType":
        "P1:1010001 P2:1000001 A1:1010010 N1:0010000 N2:1111100 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationTypeExclude":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:0010000 N3:1111100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationTag":
        "P1:0010001 P2:0010001 A1:0010010 N1:1111100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "annotationTagExclude":
        "P1:1111001 P2:1111001 A1:1111010 N1:0010100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "annotationAuthor":
        "P1:0010001 P2:0010001 A1:0010010 N1:1111100 N2:1111100 N3:1111100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "annotationAuthorExclude":
        "P1:1111001 P2:1111001 A1:1111010 N1:0010100 N2:0010100 N3:0010100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "itemType":
        "P1:1111001 P2:0000000 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "itemTypeExclude":
        "P1:0000000 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1000000 SA1:1000010",
    "attachmentFileType":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1000000 S1:1000000 SA1:1111010",
    "attachmentFileTypeExclude":
        "P1:1000001 P2:1000001 A1:0010000 N1:1000100 N2:1000100 N3:1000100 A3:0010000 C1:1000000 S1:1000000 SA1:0010000",
    "outlineClass":
        "P1:1000001 P2:1000001 A1:0010000 N1:1000100 N2:1000100 N3:1000100 A3:0010000 C1:1000000 S1:1000000 SA1:0010000",
    "outlineClassExclude":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1000000 S1:1000000 SA1:1111010",
    "outlineFlags":
        "P1:1000001 P2:1000001 A1:0010000 N1:1000100 N2:1000100 N3:1000100 A3:0010000 C1:1000000 S1:1000000 SA1:0010000",
    "outlineFlagsExclude":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1000000 S1:1000000 SA1:1111010",
    "outlineVerdict":
        "P1:1000001 P2:1000001 A1:0010000 N1:1000100 N2:1000100 N3:1000100 A3:0010000 C1:1000000 S1:1000000 SA1:0010000",
    "outlineVerdictExclude":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1000000 S1:1000000 SA1:1111010",
    "addedBy":
        "P1:0010001 P2:0010001 A1:0010010 N1:0010100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "addedByExclude":
        "P1:1111001 P2:1111001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "publication":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "publicationExclude":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "readStatus":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "readStatusExclude":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "annotationTag t1":
        "P1:1111001 P2:0010001 A1:0010010 N1:0010100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "annotationHasComment=true":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:0010000 N3:1111100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationHasComment=false":
        "P1:1010001 P2:1000001 A1:1010010 N1:0010000 N2:1111100 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationSource=true":
        "P1:1000001 P2:1000001 A1:1000010 N1:0010000 N2:0010000 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationSource=false":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:1111100 N3:1111100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "hasRelated=true":
        "P1:1111001 P2:1111001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1000000 SA1:1000010",
    "hasRelated=false":
        "P1:1010001 P2:1010001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "hasLink=true":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:1000100 N3:1000100 A3:1000010 C1:1111000 S1:1000000 SA1:1000010",
    "hasLink=false":
        "P1:1010001 P2:1000001 A1:1010010 N1:1000100 N2:1111100 N3:1111100 A3:1000010 C1:1000000 S1:1111000 SA1:1000010",
    "hasTag=true":
        "P1:1111001 P2:1000001 A1:1010010 N1:1111100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasTag=false":
        "P1:1010001 P2:1111001 A1:1111010 N1:1010100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "hasBookmarks=true":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "hasBookmarks=false":
        "P1:1111001 P2:1111001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:1111010",
    "itemNote=true":
        "P1:1010001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1111000 S1:0000000 SA1:1000010",
    "itemNote=false":
        "P1:1100001 P2:1100001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:0010000 S1:1111000 SA1:1111010",
    "standaloneNote=true":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:0000000 S1:1111000 SA1:1000010",
    "standaloneNote=false":
        "P1:1111001 P2:1111001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:0010000 SA1:1111010",
    "standaloneAttachment=true":
        "P1:1000001 P2:1000001 A1:0000010 N1:1000100 N2:1000100 N3:1000100 A3:0000010 C1:1000000 S1:1000000 SA1:1111010",
    "standaloneAttachment=false":
        "P1:1111001 P2:1111001 A1:1111010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1111000 S1:1111000 SA1:0010010",
    "hasAbstract=true":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasAbstract=false":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "hasDOI=true":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasDOI=false":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "hasPMID=true":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasPMID=false":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "hasPMCID=true":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasPMCID=false":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "retracted=true":
        "P1:0000001 P2:0000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "retracted=false":
        "P1:1111001 P2:1111001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1010000 SA1:1010010",
    "hasURL=true":
        "P1:1111001 P2:0000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasURL=false":
        "P1:0000001 P2:1111001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1010010 C1:1000000 S1:1010000 SA1:1010010",
    "hasAttachment=true":
        "P1:1111001 P2:1111001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1000000 SA1:1000010",
    "hasAttachment=false":
        "P1:0000001 P2:0000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1010000 SA1:1010010",
    "hasAnnotations=true":
        "P1:1010001 P2:1000001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:0000010 C1:1000000 S1:1000000 SA1:0000010",
    "hasAnnotations=false":
        "P1:1010001 P2:1010001 A1:0010010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1010000 S1:1010000 SA1:1111010",
    "hasEmbeddedAnnotations=true":
        "P1:1000001 P2:1000001 A1:0000010 N1:1000100 N2:1000100 N3:1000100 A3:0000010 C1:1000000 S1:1000000 SA1:0000010",
    "hasEmbeddedAnnotations=false":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1010000 S1:1010000 SA1:1111010",
    "hasOutline=true":
        "P1:1000001 P2:1000001 A1:0000010 N1:1000100 N2:1000100 N3:1000100 A3:0000010 C1:1000000 S1:1000000 SA1:0000010",
    "hasOutline=false":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1010000 S1:1010000 SA1:1111010",
    "inOtherLibrary=true":
        "P1:1010001 P2:1010001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1010000 SA1:1010010",
    "inOtherLibrary=false":
        "P1:1010001 P2:1010001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1010000 SA1:1010010",
    "hasTag scope annotation":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "hasRelated scope annotation":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationTag scope annotation":
        "P1:0010001 P2:0010001 A1:0010010 N1:1111100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "hasTag scope attachment":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "hasRelated scope attachment":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "annotationTag scope attachment":
        "P1:0010001 P2:0010001 A1:0010010 N1:0010100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "hasTag scope parent":
        "P1:1111001 P2:1000001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1000010 C1:1010000 S1:1000000 SA1:1000010",
    "hasRelated scope parent":
        "P1:1111001 P2:1111001 A1:1010010 N1:1010100 N2:1010100 N3:1010100 A3:1010010 C1:1010000 S1:1000000 SA1:1000010",
    "annotationTag scope parent":
        "P1:0010001 P2:0010001 A1:0010010 N1:0010100 N2:0010100 N3:0010100 A3:0010010 C1:0010000 S1:0010000 SA1:0010010",
    "hasLink scope annotationComment":
        "P1:1010001 P2:1000001 A1:1010010 N1:1111100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "hasLink scope itemNoteText":
        "P1:1010001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1111000 S1:1000000 SA1:1000010",
    "hasLink scope standaloneText":
        "P1:1000001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "color + fileType":
        "P1:1010001 P2:1000001 A1:1111010 N1:1111100 N2:0010000 N3:0010000 A3:1100010 C1:1000000 S1:1000000 SA1:1100010",
    "color + itemType":
        "P1:1111001 P2:0000000 A1:1010010 N1:1111100 N2:0010000 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "color + hasDOI":
        "P1:1111001 P2:0000001 A1:1010010 N1:1111100 N2:0010000 N3:0010000 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
    "itemNote + fileType":
        "P1:1010001 P2:1010001 A1:1111010 N1:1010100 N2:1010100 N3:1010100 A3:1111010 C1:1111000 S1:0000000 SA1:1111010",
    "standaloneNote + itemType":
        "P1:0000000 P2:1100001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:0000000 S1:1111000 SA1:1000010",
    "standaloneNote + itemNote":
        "P1:1010001 P2:1000001 A1:1000010 N1:1000100 N2:1000100 N3:1000100 A3:1000010 C1:1111000 S1:1111000 SA1:1000010",
    "hasAnnotations=false + source":
        "P1:1010001 P2:1010001 A1:0010010 N1:1111100 N2:1111100 N3:1111100 A3:1111010 C1:1010000 S1:1010000 SA1:1111010",
    "standaloneAttachment + fileType":
        "P1:1000001 P2:1000001 A1:0100010 N1:1000100 N2:1000100 N3:1000100 A3:0100010 C1:1000000 S1:1000000 SA1:1111010",
    "hasComment + type":
        "P1:1010001 P2:1000001 A1:1010010 N1:0110000 N2:0010000 N3:1111100 A3:1000010 C1:1000000 S1:1000000 SA1:1000010",
};
