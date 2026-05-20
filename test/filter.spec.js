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
});
