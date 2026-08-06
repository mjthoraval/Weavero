/* global describe, it, before, after, expect, Zotero */

// Tests for the items-tree filter work shipped in v0.9.1:
//   - path-aware matching (a search hit at any level of a row's
//     tree-join path; a direct hit at the row's own level counts),
//   - row-kind classification used by Selection Target + dimming,
//   - the ancestor-set precompute that lets a parent match when one
//     of its descendants matched the search,
//   - icon/text dimming sharing a single verdict,
//   - selection reconcile (deselect rows that stop matching),
//   - the Zotero 9 compatibility layer (getRow never returns
//     undefined, null-safe container probes, cascade open order,
//     re-apply after Zotero's own refreshes, skip the redundant
//     hideContextAnnotationRows observer refresh).
//
// Pure/version-agnostic logic is exercised behaviourally with real
// item fixtures. The integration-heavy paths (the data-layer apply,
// the v9 wraps) are locked with source-contract checks — the same
// approach popups.spec.js uses, and safe here because the bundle is
// NOT minified (local names survive `Function.prototype.toString`).

describe("Weavero — items-tree filter", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    // ---- _rowKindOf: kind classification --------------------------

    describe("_rowKindOf()", () => {
        let regular, standaloneNote, childNote, attachment;
        before(async () => {
            const lib = Zotero.Libraries.userLibraryID;
            regular = new Zotero.Item("journalArticle");
            regular.libraryID = lib;
            regular.setField("title", "WV-TEST regular");
            await regular.saveTx();

            standaloneNote = new Zotero.Item("note");
            standaloneNote.libraryID = lib;
            standaloneNote.setNote("WV-TEST standalone note");
            await standaloneNote.saveTx();

            childNote = new Zotero.Item("note");
            childNote.libraryID = lib;
            childNote.setNote("WV-TEST child note");
            childNote.parentID = regular.id;
            await childNote.saveTx();

            try {
                attachment = await Zotero.Attachments.linkFromURL({
                    url: "https://example.com/wv-test",
                    parentItemID: regular.id,
                    title: "WV-TEST link",
                });
            } catch (e) {
                attachment = null; // linkFromURL unavailable → skip its case
            }
        });
        after(async () => {
            for (const it of [childNote, attachment, standaloneNote, regular]) {
                try { if (it) await it.eraseTx(); } catch (e) {}
            }
        });

        it("classifies a regular item as 'parent'", () => {
            expect(wv._rowKindOf(regular)).to.equal("parent");
        });
        it("classifies a STANDALONE note as 'parent' (top-level row)", () => {
            expect(wv._rowKindOf(standaloneNote)).to.equal("parent");
        });
        it("classifies a CHILD note as 'attachment' (sits at the attachment level)", () => {
            expect(wv._rowKindOf(childNote)).to.equal("attachment");
        });
        it("classifies an attachment as 'attachment'", function () {
            if (!attachment) this.skip();
            expect(wv._rowKindOf(attachment)).to.equal("attachment");
        });
        it("returns null for null / undefined", () => {
            expect(wv._rowKindOf(null)).to.equal(null);
            expect(wv._rowKindOf(undefined)).to.equal(null);
        });
    });

    // ---- _searchPathAncestorIDs: upward propagation ---------------

    describe("_searchPathAncestorIDs()", () => {
        let regular, childNote;
        before(async () => {
            const lib = Zotero.Libraries.userLibraryID;
            regular = new Zotero.Item("journalArticle");
            regular.libraryID = lib;
            regular.setField("title", "WV-TEST path parent");
            await regular.saveTx();
            childNote = new Zotero.Item("note");
            childNote.libraryID = lib;
            childNote.setNote("WV-TEST path child");
            childNote.parentID = regular.id;
            await childNote.saveTx();
        });
        after(async () => {
            wv._wvSearchPathCacheKey = null;
            wv._wvSearchPathCache = null;
            for (const it of [childNote, regular]) {
                try { if (it) await it.eraseTx(); } catch (e) {}
            }
        });

        it("adds a matched row's ANCESTORS (so a parent of a match is included)", () => {
            const set = wv._searchPathAncestorIDs(new Set([childNote.id]));
            expect(set.has(childNote.id)).to.equal(true);
            expect(set.has(regular.id)).to.equal(true);
        });
        it("leaves a top-level match alone (no phantom ancestor)", () => {
            const set = wv._searchPathAncestorIDs(new Set([regular.id]));
            expect(set.has(regular.id)).to.equal(true);
            expect(set.size).to.equal(1);
        });
        it("caches by the searchItemIDs Set identity", () => {
            const ref = new Set([childNote.id]);
            const a = wv._searchPathAncestorIDs(ref);
            const b = wv._searchPathAncestorIDs(ref);
            expect(a).to.equal(b); // same Set reference → cached object
            const c = wv._searchPathAncestorIDs(new Set([childNote.id]));
            expect(c).to.not.equal(a); // different reference → recomputed
        });
        it("returns null for a null input", () => {
            expect(wv._searchPathAncestorIDs(null)).to.equal(null);
        });
    });

    // ---- _rowIsPrimary: per-level match (item-type, no search) ----

    describe("_rowIsPrimary() — per-level match", () => {
        let journal, book, savedQS;
        before(async () => {
            const lib = Zotero.Libraries.userLibraryID;
            journal = new Zotero.Item("journalArticle");
            journal.libraryID = lib;
            journal.setField("title", "WV-TEST journal");
            await journal.saveTx();
            book = new Zotero.Item("book");
            book.libraryID = lib;
            book.setField("title", "WV-TEST book");
            await book.saveTx();
            // Neutralise the quick search so the path-search gate is a
            // no-op and we exercise the chip predicate in isolation.
            savedQS = wv._currentQuickSearchValue;
            wv._currentQuickSearchValue = "";
        });
        after(async () => {
            wv._currentQuickSearchValue = savedQS;
            for (const it of [journal, book]) {
                try { if (it) await it.eraseTx(); } catch (e) {}
            }
        });
        const itemTypeState = (types) => ({
            groups: [Object.assign(wv._emptyFilterGroup(), { itemType: types })],
            activeGroupIndex: 0,
        });

        it("treats an item-type filter as active", () => {
            expect(wv._isFilterActive(itemTypeState(["journalArticle"])))
                .to.equal(true);
        });
        it("marks a parent whose item type matches as primary", () => {
            expect(wv._rowIsPrimary(journal, itemTypeState(["journalArticle"])))
                .to.equal(true);
        });
        it("rejects a parent whose item type does not match", () => {
            expect(wv._rowIsPrimary(book, itemTypeState(["journalArticle"])))
                .to.equal(false);
        });
        it("returns false when no filter is active", () => {
            const empty = {
                groups: [wv._emptyFilterGroup()], activeGroupIndex: 0,
            };
            expect(wv._isFilterActive(empty)).to.equal(false);
            expect(wv._rowIsPrimary(journal, empty)).to.equal(false);
        });
    });

    // ---- path-aware contracts (_rowIsPrimary source) -------------

    describe("_rowIsPrimary() path-aware contracts", () => {
        it("counts a direct quick-search hit at the row's own level", () => {
            expect(wv._rowIsPrimary.toString()).to.include("directSearchMatch");
        });
        it("uses the precomputed ancestor set for descendant matches", () => {
            expect(wv._rowIsPrimary.toString())
                .to.include("_searchPathAncestorIDs");
        });
        it("reads search ids from rowProvider OR the itemsView (v9 compat)", () => {
            expect(wv._rowIsPrimary.toString()).to.match(/rowProvider\s*\|\|/);
        });
    });

    // ---- Zotero 9 compatibility contracts ------------------------

    describe("Zotero 9 compatibility", () => {
        it("getRow patch clamps to a valid row (never undefined)", () => {
            expect(wv._applyItemsListFilterInner.toString())
                .to.include("safeRaw");
        });
        it("installs null-safe container probes on v9", () => {
            const src = wv._applyItemsListFilterInner.toString();
            expect(src).to.include("isV9");
            expect(src).to.include("isContainerOpen");
        });
        it("opens cascade containers highest-index-first on the v9 fallback", () => {
            expect(wv._applyItemsListFilterInner.toString())
                .to.include("toOpen.length - 1");
        });
        it("re-applies after Zotero's refresh and peels the wrap on reload", () => {
            const src = wv._patchV9RefreshReapply.toString();
            expect(src).to.include("_wvOrigRefreshV9"); // peel-on-reload
            expect(src).to.include("_wvSkipObserverRefreshUntil"); // skip path
        });
        it("arms the observer-refresh skip only on v9 + no search + active filter", () => {
            const src = wv._armObserverRefreshSkip.toString();
            expect(src).to.include("rowProvider");   // v9-only gate
            expect(src).to.include("searchMode");    // search needs a real refresh
            expect(src).to.include("_isFilterActive");
        });
    });

    describe("_armObserverRefreshSkip() behaviour", () => {
        let savedSkip;
        before(() => { savedSkip = wv._wvSkipObserverRefreshUntil; });
        after(() => { wv._wvSkipObserverRefreshUntil = savedSkip; });
        it("does NOT arm on Zotero 10 (rowProvider present)", function () {
            const iv = Zotero.getMainWindow().ZoteroPane.itemsView;
            if (!iv || !iv.rowProvider) this.skip(); // only meaningful on v10
            wv._wvSkipObserverRefreshUntil = 0;
            wv._armObserverRefreshSkip();
            expect(wv._wvSkipObserverRefreshUntil).to.equal(0);
        });
    });

    // ---- dimming: icon and text share one verdict ----------------

    describe("dimming CSS", () => {
        let css;
        before(function () {
            const doc = Zotero.getMainWindow().document;
            const styleEl = doc.getElementById("weavero-styles");
            css = styleEl ? styleEl.textContent : "";
            if (!css) this.skip();
        });
        it("dims the text of non-target rows", () => {
            expect(css).to.include(".wv-not-target:not(.selected)");
        });
        it("dims context-row icons EXCEPT Weavero-promoted (wv-primary) matches", () => {
            // A row Weavero promoted to a real match (white text) must
            // keep a full-bright icon — so the icon rule excludes
            // wv-primary. This is the icon/text consistency fix.
            expect(css).to.match(
                /context-row:not\(\.selected\):not\(\.wv-primary\)\s*\.cell-icon/);
        });
        it("dims non-target icons in lockstep with their text", () => {
            expect(css).to.include(".row.wv-not-target:not(.selected) .cell-icon");
        });
    });

    // ---- selection reconcile contracts ---------------------------

    describe("selection reconcile", () => {
        it("captures the selected item ids before re-keying", () => {
            expect(typeof wv._captureSelectedItemIDs).to.equal("function");
            expect(wv._captureSelectedItemIDs.toString())
                .to.include("getSelectedItems");
        });
        it("keeps only still-matching items selected, clearing the rest", () => {
            const src = wv._reconcileSelectionAfterFilter.toString();
            expect(src).to.include("_rowIsPrimary");   // match test
            expect(src).to.include("clearSelection");  // drop non-matches
        });
    });

    // ---- native-search oracle parity (2026-08-06) -----------------
    //
    // User: "make advanced searches that match the behaviour of the
    // Weavero filters... a good benchmark to test against." For every
    // dimension Zotero's own search engine can express, the Weavero
    // predicate must agree with Zotero.Search over the same fixtures —
    // verified first on the real library (itemType 15317=15317 exact;
    // hasURL 16043=16043 with the isNotEmpty operator upstream added
    // 2026-07-13, commit 24fe50cfd; annotation-color and PDF exact
    // modulo descendants-of-trash, which tree rows exclude anyway).
    // The last spec pins an EXPRESSIVENESS gap (native cross-level AND
    // matches nothing) — if upstream ever makes that expressible, this
    // failing is a feature: we want to know.

    describe("native-search oracle parity", () => {
        let A, B, attPDF, attHTML, ann, junk;
        before(async function () {
            this.timeout(30000);
            const lib = Zotero.Libraries.userLibraryID;
            junk = [];
            async function mk(type, fields, parent) {
                const it = new Zotero.Item(type);
                it.libraryID = lib;
                if (parent) it.parentID = parent.id;
                for (const [k, v] of Object.entries(fields || {})) {
                    if (k === "linkMode") it.attachmentLinkMode = v;
                    else if (k === "contentType") it.attachmentContentType = v;
                    else it.setField(k, v);
                }
                await it.saveTx();
                junk.push(it);
                return it;
            }
            A = await mk("journalArticle", { title: "WV-ORACLE article",
                url: "https://example.com/wv-oracle" });
            B = await mk("book", { title: "WV-ORACLE book" });
            attPDF = await mk("attachment", { title: "WV-ORACLE pdf",
                linkMode: Zotero.Attachments.LINK_MODE_IMPORTED_URL,
                contentType: "application/pdf" }, A);
            attHTML = await mk("attachment", { title: "WV-ORACLE html",
                linkMode: Zotero.Attachments.LINK_MODE_IMPORTED_URL,
                contentType: "text/html" }, B);
            ann = new Zotero.Item("annotation");
            /** @type {any} */ (ann).libraryID = lib;
            ann.parentID = attPDF.id;
            const a = /** @type {any} */ (ann);
            a.annotationType = "highlight";
            a.annotationText = "WV-ORACLE ann";
            a.annotationColor = "#ffd400";
            // Required plumbing (upstream test/content/support.js
            // createAnnotation): save() rejects without sortIndex+position.
            a.annotationSortIndex = "00001|000001|00000";
            a.annotationPosition = JSON.stringify({
                pageIndex: 0, rects: [[0, 0, 100, 100]] });
            await ann.saveTx();
            junk.push(ann);
        });
        after(async function () {
            this.timeout(30000);
            for (const it of (junk || []).reverse()) {
                try { if (Zotero.Items.get(it.id)) await it.eraseTx(); } catch (e) {}
            }
        });
        const fixtureIDs = () => new Set(junk.map((x) => x.id));
        async function nativeHits(conds, joinMode) {
            const s = new Zotero.Search();
            /** @type {any} */ (s).libraryID = Zotero.Libraries.userLibraryID;
            if (joinMode) s.addCondition("joinMode", joinMode, null);
            for (const [c, op, v] of conds) s.addCondition(c, op, v);
            const ids = await s.search();
            const fx = fixtureIDs();
            return new Set(ids.filter((id) => fx.has(id)));
        }
        const wvPrimary = (item, group) =>
            wv._rowIsPrimary(item, { groups: [group], collections: [], savedSearches: [] });

        it("itemType: native and Weavero agree on the fixtures", async function () {
            this.timeout(20000);
            const nat = await nativeHits([["itemType", "is", "journalArticle"]]);
            expect(nat.has(A.id)).to.equal(true);
            expect(nat.has(B.id)).to.equal(false);
            const g = { itemType: ["journalArticle"] };
            expect(wvPrimary(A, g)).to.equal(true);
            expect(wvPrimary(B, g)).to.equal(false);
        });

        it("has-URL: native isNotEmpty (upstream 2026-07-13) agrees on regular items", async function () {
            this.timeout(20000);
            const nat = await nativeHits([["url", "isNotEmpty", null]]);
            expect(nat.has(A.id), "article with URL matches").to.equal(true);
            expect(nat.has(B.id), "book without URL does not").to.equal(false);
            const g = { hasURL: true };
            expect(wvPrimary(A, g)).to.equal(true);
            expect(wvPrimary(B, g)).to.equal(false);
        });

        it("attachment file type: native fileTypeID agrees", async function () {
            this.timeout(20000);
            const pdfID = Zotero.FileTypes.getID("pdf");
            const nat = await nativeHits([["fileTypeID", "is", pdfID]]);
            expect(nat.has(attPDF.id)).to.equal(true);
            expect(nat.has(attHTML.id)).to.equal(false);
            const g = { attachmentFileType: ["attachmentPDF"] };
            expect(wvPrimary(attPDF, g)).to.equal(true);
            expect(wvPrimary(attHTML, g)).to.equal(false);
        });

        it("annotation color: native annotationColor agrees", async function () {
            this.timeout(20000);
            const nat = await nativeHits([["annotationColor", "is", "#ffd400"]]);
            expect(nat.has(ann.id)).to.equal(true);
            const g = { annotationColor: ["#ffd400"] };
            expect(wvPrimary(Zotero.Items.get(ann.id), g)).to.equal(true);
        });

        it("cross-level: plain AND is same-item (0 hits); resultLevel rolls up and AGREES", async function () {
            this.timeout(20000);
            // WITHOUT resultLevel, native ANDs both conditions on the SAME
            // item — no fixture can satisfy both, so zero hits. This pins
            // the default semantics (and originally masqueraded as an
            // expressiveness gap until the user pointed at the advanced
            // search window's "Find top-level items" mode, 2026-08-06).
            const plain = await nativeHits(
                [["annotationColor", "is", "#ffd400"], ["itemType", "is", "journalArticle"]],
                "all");
            expect(plain.size, "plain AND = same-item semantics").to.equal(0);
            // WITH resultLevel=item (what the advanced-search window sets
            // by default), child conditions map up to the top-level item —
            // the cross-level combo IS expressible, and must agree with
            // Weavero (verified 318=318 on the real library first).
            const rolled = await nativeHits(
                [["resultLevel", "item", null],
                 ["annotationColor", "is", "#ffd400"],
                 ["itemType", "is", "journalArticle"]],
                "all");
            expect(rolled.has(A.id),
                "rolled-up cross-level combo finds the article").to.equal(true);
            expect(rolled.has(B.id)).to.equal(false);
            // Weavero's row-level view of the same combined group: the
            // yellow annotation under the journal article is primary.
            const g = { annotationColor: ["#ffd400"], itemType: ["journalArticle"] };
            expect(wvPrimary(Zotero.Items.get(ann.id), g),
                "Weavero cross-level group matches the annotation").to.equal(true);
        });
    });

    // ---- filter-apply perf caches (2026-08-05) --------------------
    //
    // Three fixes measured on the real library (baselines in the ring at
    // Zotero._wvFilterPerf): no-op re-applies skipped via a full-state
    // signature; per-item verdicts cached ACROSS applies keyed by that
    // signature; cascade pass-1 skipped when only parent-level
    // dimensions are active. The multi-filter constraint (user
    // 2026-08-05: "keep the filter working even when multiple filters
    // are selected") rests on the signature covering the ENTIRE state —
    // these specs pin that.

    describe("apply perf caches", () => {
        it("signature covers every dimension, quick search, and view", () => {
            const win = Zotero.getMainWindow();
            const iv = win.ZoteroPane.itemsView;
            const s0 = wv._wvFilterStateSig(win, iv);
            expect(s0).to.be.a("string");
            const g = wv._activeGroup();
            if (!g) this.skip();
            const prev = g.inOtherLibrary;
            g.inOtherLibrary = true;
            const s1 = wv._wvFilterStateSig(win, iv);
            g.inOtherLibrary = prev === undefined ? null : prev;
            expect(s1, "any dimension change must rotate the signature")
                .to.not.equal(s0);
            const qPrev = wv._currentQuickSearchValue;
            wv._currentQuickSearchValue = "wv-sig-probe";
            const s2 = wv._wvFilterStateSig(win, iv);
            wv._currentQuickSearchValue = qPrev;
            expect(s2, "quick search must rotate the signature").to.not.equal(s0);
        });

        it("parent-only detector: parent dims true, any child dim false", () => {
            const g = wv._activeGroup();
            if (!g) this.skip();
            const snap = JSON.stringify(wv._filterState);
            try {
                g.hasURL = true;
                g.inOtherLibrary = true;
                expect(wv._wvFilterParentLevelOnly(wv._filterState)).to.equal(true);
                g.annotationColor = ["#ffd400"];
                expect(wv._wvFilterParentLevelOnly(wv._filterState),
                    "a child-level dim in the MIX must keep the cascade")
                    .to.equal(false);
            }
            finally {
                const s = JSON.parse(snap);
                Object.assign(g, s.groups[Math.max(0,
                    Math.min(s.activeGroupIndex || 0, s.groups.length - 1))]);
            }
        });

        it("hasAttachment means FILES: a linked-URL-only parent does not match", async function () {
            this.timeout(20000);
            // Fixture twin of WVT-09 in the live "Weavero Filter Tests"
            // collection, which caught this on its first sweep (2026-08-06):
            // getAttachments() counts linked-URL children, but the tile's
            // tooltip promises attachment FILES.
            const lib = Zotero.Libraries.userLibraryID;
            const p = new Zotero.Item("journalArticle");
            p.libraryID = lib;
            p.setField("title", "WV-TEST linked-url-only parent");
            await p.saveTx();
            const u = new Zotero.Item("attachment");
            u.libraryID = lib;
            u.parentID = p.id;
            u.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
            u.setField("title", "WV-TEST linked url");
            u.setField("url", "https://example.com/wv-linked");
            await u.saveTx();
            try {
                const st = (g) => ({ groups: [g], collections: [], savedSearches: [] });
                await Zotero.Promise.delay(200);
                expect(wv._rowIsPrimary(Zotero.Items.get(p.id), st({ hasAttachment: true })),
                    "linked-URL child must NOT satisfy hasAttachment").to.equal(false);
                expect(wv._rowIsPrimary(Zotero.Items.get(p.id), st({ hasAttachment: false })),
                    "and MUST satisfy hasAttachment=false").to.equal(true);
                // Add a real file child — flips both.
                const f = new Zotero.Item("attachment");
                f.libraryID = lib;
                f.parentID = p.id;
                f.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
                f.attachmentContentType = "application/pdf";
                f.setField("title", "WV-TEST real file");
                await f.saveTx();
                await Zotero.Promise.delay(300);
                expect(wv._rowIsPrimary(Zotero.Items.get(p.id), st({ hasAttachment: true })),
                    "real file satisfies hasAttachment (facet evicted per-id)").to.equal(true);
            }
            finally {
                try { await p.eraseTx(); } catch (e) {}
            }
        });

        it("per-item facets (read status, PMID) stay fresh across item edits", async function () {
            this.timeout(20000);
            const lib = Zotero.Libraries.userLibraryID;
            const it0 = new Zotero.Item("journalArticle");
            it0.libraryID = lib;
            it0.setField("title", "WV-TEST facets");
            await it0.saveTx();
            try {
                expect(wv._wvReadStatusOf(it0), "unset facet").to.equal("");
                it0.setField("extra", "Read_Status: Read\nPMID: 12345");
                await it0.saveTx();
                await Zotero.Promise.delay(300);
                expect(wv._wvReadStatusOf(Zotero.Items.get(it0.id)),
                    "facet follows the Extra edit").to.equal("Read");
                expect(wv._rowIsPrimary(Zotero.Items.get(it0.id),
                    { groups: [{ hasPMID: true }], collections: [], savedSearches: [] }),
                    "PMID facet feeds the predicate").to.equal(true);
                it0.setField("extra", "");
                await it0.saveTx();
                await Zotero.Promise.delay(300);
                expect(wv._wvReadStatusOf(Zotero.Items.get(it0.id)),
                    "facet follows removal").to.equal("");
            }
            finally { try { await it0.eraseTx(); } catch (e) {} }
        });

        it("data changes null the verdict cache and the no-op signature", async () => {
            expect(/** @type {any} */ (Zotero)._wvFilterCacheObsID,
                "invalidator registered").to.exist;
            wv._wvVerdictCache = { sig: "probe", map: new Map() };
            wv._wvLastApplySig = "probe";
            const it0 = new Zotero.Item("journalArticle");
            it0.libraryID = Zotero.Libraries.userLibraryID;
            it0.setField("title", "WV-TEST cache invalidation");
            await it0.saveTx();
            try {
                await Zotero.Promise.delay(300);
                expect(wv._wvVerdictCache, "verdict cache nulled").to.equal(null);
                expect(wv._wvLastApplySig, "no-op signature nulled").to.equal(null);
            }
            finally { await it0.eraseTx(); }
        });
    });

    // ---- "Also in library" (linked-item relations) ----------------
    //
    // The dimension is Zotero's owl:sameAs linked-item relation, merged
    // across BOTH storage directions — which side holds the relation is an
    // access heuristic (personal library preferred), not provenance, so a
    // one-direction read would silently miss half the links. The collector
    // also mirrors the native Libraries-and-Collections box's rule that a
    // link whose far item is missing or trashed doesn't count. Verified
    // live on the real profile 2026-08-05 (native getLinkedItem agreed on
    // every sample, forward count == reverse count) and locked here with a
    // local group fixture.

    describe("also-in-library filter", () => {
        let group, groupLibID, junk;
        before(async function () {
            this.timeout(30000);
            if (typeof wv._wvCollectLinkedLibraries !== "function") this.skip();
            // A local group library (upstream's own createGroup pattern —
            // needs a current user in the users table).
            let uid = Zotero.Users.getCurrentUserID();
            if (!uid) {
                await Zotero.Users.setCurrentUserID(1);
                uid = 1;
            }
            if (!Zotero.Users.getName(uid)) {
                await Zotero.Users.setName(uid, "WV Test User");
            }
            group = new Zotero.Group();
            const G = /** @type {any} */ (group);
            G.id = Zotero.Utilities.rand(100000, 900000);
            G.name = "WV-TEST linked " + Zotero.Utilities.randomString(4);
            G.description = "";
            G.editable = true;
            G.filesEditable = true;
            G.version = Zotero.Utilities.rand(1000, 10000);
            await group.saveTx();
            groupLibID = group.libraryID;
            junk = [];
        });
        after(async function () {
            this.timeout(30000);
            for (const it of (junk || []).reverse()) {
                try { if (Zotero.Items.get(it.id)) await it.eraseTx(); } catch (e) {}
            }
            try { if (group) await Zotero.Groups.get(group.id).eraseTx(); } catch (e) {}
        });
        async function mkItem(libID, title) {
            const it = new Zotero.Item("journalArticle");
            it.libraryID = libID;
            it.setField("title", title);
            await it.saveTx();
            junk.push(it);
            return it;
        }

        it("parses group / user / local-user object URIs; unknown group is null", () => {
            const uid = Zotero.Libraries.userLibraryID;
            const g = wv._wvLinkedURITarget(
                "http://zotero.org/groups/" + group.id + "/items/ABCD2345");
            expect(g && g.libraryID).to.equal(groupLibID);
            expect(g && g.key).to.equal("ABCD2345");
            const u = wv._wvLinkedURITarget(
                "http://zotero.org/users/12345/items/WXYZ6789");
            expect(u && u.libraryID).to.equal(uid);
            const l = wv._wvLinkedURITarget(
                "http://zotero.org/users/local/aBc123/items/WXYZ6789");
            expect(l && l.libraryID).to.equal(uid);
            // Unknown group id -> not available locally -> null.
            expect(wv._wvLinkedURITarget(
                "http://zotero.org/groups/999999999/items/ABCD2345")).to.equal(null);
            expect(wv._wvLinkedURITarget("not a uri")).to.equal(null);
        });

        it("collects BOTH storage directions and the mirror view agrees", async function () {
            this.timeout(30000);
            const uid = Zotero.Libraries.userLibraryID;
            // FORWARD pair: relation stored on the user-library item.
            const mineF = await mkItem(uid, "WV-TEST linked fwd");
            const theirsF = await mkItem(groupLibID, "WV-TEST linked fwd (group)");
            mineF.addRelation("owl:sameAs", Zotero.URI.getItemURI(theirsF));
            await mineF.saveTx();
            // REVERSE pair: relation stored on the group-library item.
            const mineR = await mkItem(uid, "WV-TEST linked rev");
            const theirsR = await mkItem(groupLibID, "WV-TEST linked rev (group)");
            theirsR.addRelation("owl:sameAs", Zotero.URI.getItemURI(mineR));
            await theirsR.saveTx();

            const map = await wv._wvCollectLinkedLibraries(uid);
            const set = map.get(String(groupLibID));
            expect(set, "group appears in the user-library map").to.exist;
            expect(set.has(mineF.id), "forward-stored link found").to.equal(true);
            expect(set.has(mineR.id), "reverse-stored link found").to.equal(true);

            // Mirror view: collecting FOR the group finds the same pairs
            // under the user library's key.
            const gmap = await wv._wvCollectLinkedLibraries(groupLibID);
            const gset = gmap.get(String(uid));
            expect(gset && gset.has(theirsF.id)).to.equal(true);
            expect(gset && gset.has(theirsR.id)).to.equal(true);
        });

        it("a trashed far item stops counting (native-box parity)", async function () {
            this.timeout(30000);
            const uid = Zotero.Libraries.userLibraryID;
            const mine = await mkItem(uid, "WV-TEST linked trash");
            const theirs = await mkItem(groupLibID, "WV-TEST linked trash (group)");
            mine.addRelation("owl:sameAs", Zotero.URI.getItemURI(theirs));
            await mine.saveTx();
            let map = await wv._wvCollectLinkedLibraries(uid);
            expect(map.get(String(groupLibID)).has(mine.id)).to.equal(true);
            theirs.deleted = true;
            await theirs.saveTx();
            map = await wv._wvCollectLinkedLibraries(uid);
            const set = map.get(String(groupLibID));
            expect(!set || !set.has(mine.id),
                "trashed far item must not count").to.equal(true);
        });

        it("predicate helper answers from the cache, include and miss", async function () {
            this.timeout(30000);
            const uid = Zotero.Libraries.userLibraryID;
            const mine = await mkItem(uid, "WV-TEST linked pred");
            const theirs = await mkItem(groupLibID, "WV-TEST linked pred (group)");
            mine.addRelation("owl:sameAs", Zotero.URI.getItemURI(theirs));
            await mine.saveTx();
            const map = await wv._wvCollectLinkedLibraries(uid);
            wv._cachedLinkedLibraries = { libraryID: uid, map };
            try {
                expect(wv._wvLinkedLibCacheWarm()).to.equal(true);
                expect(wv._wvItemInAnyLinkedLib(mine, [String(groupLibID)]))
                    .to.equal(true);
                expect(wv._wvItemInAnyLinkedLib(mine, ["999999"])).to.equal(false);
                const other = await mkItem(uid, "WV-TEST unlinked");
                expect(wv._wvItemInAnyLinkedLib(other, [String(groupLibID)]))
                    .to.equal(false);
                // The any-library form — what the In Multiple Libraries
                // tile's predicate actually asks.
                expect(wv._wvItemInAnyOtherLib(mine)).to.equal(true);
                expect(wv._wvItemInAnyOtherLib(other)).to.equal(false);
            }
            finally { wv._cachedLinkedLibraries = null; }
        });
    });
});
