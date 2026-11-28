/* global describe, it, before, after, assert, Zotero, wvT */

// The items-list filter in a FEED view (MJT 2026-11-22, his screenshot of the
// Filter Library popup over a feed: "The filter of feeds probably contains a
// lot of irrelevant filters. Clean-up").
//
// A feed item (Zotero.FeedItem, xpcom/data/feedItem.js) lives in a feed library
// the user cannot edit (data/feed.js: editable / filesEditable false), so it has
// no tags, notes, collections, relations, annotations or reader bookmarks; its
// fields are what FeedReader._getFeedItem (xpcom/feedReader.js) fills: title,
// abstract, URL, creators, date, publication, pages, ISSN / ISBN, DOI, publisher,
// language, volume, issue, section -- and its type is journalArticle, bookSection
// or conferencePaper (_guessItemType). In a feed view the popup offers only what
// can match such an item; every other criterion is DORMANT there (kept, ignored,
// back in a library view), the way the feed-only "Not in your library" chip is
// dormant outside the feeds.

describe("Weavero — the filter in a feed view offers only what a feed item can match", function () {
    this.timeout(180000);
    let wv, win, doc, feed = null, LIB = null, LIB_UNTAGGED = null, FD = null, FP = null, FL = null;
    const made = [];
    const TAG = "wv-ff-tag";

    async function article(fields, tagged) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = Zotero.Libraries.userLibraryID;
        for (const k of Object.keys(fields)) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: "Libauthor", firstName: "L." }]);
        if (tagged) it.addTag(TAG);
        await it.saveTx();
        made.push(it);
        return it;
    }
    async function feedItem(fields, last) {
        const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
        it.libraryID = feed.libraryID;
        it.guid = "wv-ff-" + Zotero.Utilities.randomString();
        for (const k of Object.keys(fields)) it.setField(k, fields[k]);
        it.setCreators([{ creatorType: "author", lastName: last, firstName: "F." }]);
        await it.saveTx();
        return it;
    }
    const iv = () => win.ZoteroPane.itemsView;
    async function showRow(id) {
        const cv = win.ZoteroPane.collectionsView;
        assert.ok(await wvT.waitFor(() => cv.getRowIndexByID(id) !== false, 15000, 100), "collection-tree row " + id + " present");
        await cv.selectByID(id);
        await iv().waitForLoad();
        await wvT.waitFor(() => iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].id === id, 10000, 50);
    }
    /** The rows the user sees (the row provider, through the filter's translation). */
    const rowIDs = () => {
        const rp = iv().rowProvider || iv();
        const out = [];
        const n = typeof rp.getRowCount === "function" ? rp.getRowCount() : iv().rowCount;
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); if (r && r.ref) out.push(r.ref.id); }
        return out.sort((a, b) => a - b);
    };
    const sorted = (...its) => its.map(i => i.id).sort((a, b) => a - b);
    const inWin = (fn) => wv._wvWithFilterWin(win, fn);
    /** Set this window's filter and apply it as a user's click does. */
    function setFilter(groupPatch, statePatch) {
        inWin(() => {
            wv._filterState = Object.assign({ groups: [Object.assign(wv._emptyFilterGroup(), groupPatch)], activeGroupIndex: 0 }, statePatch || {});
            wv._renderFilterBar();
            wv._applyItemsListFilter({ deliberate: true });
        });
    }
    function clearFilter() { try { inWin(() => wv._clearAllFilters()); } catch (e) {} }
    const chips = () => { const bar = inWin(() => wv._filterBar); return bar && bar.style.display !== "none" ? bar.querySelectorAll(".wv-filter-chip").length : 0; };

    // ---- the popup ----
    const popup = () => doc.getElementById("wv-filter-popup");
    const inner = () => { const p = popup(); return p && p.querySelector(".wv-filter-panel-inner"); };
    async function openPopup() {
        try { const p = popup(); if (p && p.state === "open") p.hidePopup(); } catch (e) {}
        await wvT.sleep(100);
        inWin(() => wv._openFilterPanel());
        const p = await wvT.waitFor(() => { const x = popup(); return x && x.state === "open" && x.querySelector(".wv-filter-popup-headbar") ? x : null; }, 10000, 50);
        assert.ok(p, "the filter popup opened");
        await wvT.sleep(300);   // the panel re-renders after opening: read it settled
        return p;
    }
    function closePopup() { try { const p = popup(); if (p) p.hidePopup(); } catch (e) {} }
    const dimTiles = () => [...inner().querySelectorAll("[data-wv-dim]")].map(b => b.getAttribute("data-wv-dim"));
    const headers = () => [...inner().querySelectorAll(":scope > .wv-filter-group-header")].map(h => h.getAttribute("data-section"));

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvFilterInFeedView", "_wvFeedState", "_wvFeedGroup", "_wvFdRefresh", "_wvFdRecOf", "_openFilterPanel", "_effectiveSelectionTargetKinds"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        LIB = await article({ title: "Splashing of viscous drops on thin films (library copy)", DOI: "10.9999/wv.ff.lib", publicationTitle: "WV-FF Library Journal" }, true);
        LIB_UNTAGGED = await article({ title: "Drop impact on a deep pool (untagged)", DOI: "10.9999/wv.ff.untagged", publicationTitle: "WV-FF Library Journal" }, false);
        feed = /** @type {any} */ (new Zotero.Feed());
        feed.name = "WV-TEST feed filter";
        feed.description = "";
        feed.url = "https://wv-feed-filter-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
        feed.refreshInterval = 24 * 60;
        feed.cleanupReadAfter = 60;
        feed.cleanupUnreadAfter = 90;
        await feed.saveTx();
        FD = await feedItem({ title: "Bubble rings under impacting drops", DOI: "10.9999/wv.ff.doi", abstractNote: "An abstract.", publicationTitle: "WV-FF Feed Journal", url: "https://example.invalid/fd" }, "Feedauthor");
        FP = await feedItem({ title: "Granular jets from a collapsing cavity", publicationTitle: "WV-FF Feed Journal" }, "Plainauthor");
        FL = await feedItem({ title: "Splashing of viscous drops on thin films", DOI: "10.9999/WV.FF.LIB", publicationTitle: "WV-FF Feed Journal" }, "Libauthor");
        await wv._wvFdRefresh("spec", { rebuild: true });
        // An item added less than 10 s ago is kept whatever the filter
        // (filter.ts RECENT_WINDOW_MS, the just-created item Zotero selects):
        // not what this spec is about.
        const recent = wv._wvRecentlyAddedItemIDs;
        if (recent && typeof recent.delete === "function") for (const it of [LIB, LIB_UNTAGGED, FD, FP, FL]) recent.delete(it.id);
    });

    after(async function () {
        closePopup();
        clearFilter();
        try { await showRow("L" + Zotero.Libraries.userLibraryID); } catch (e) {}
        clearFilter();
        try { if (feed) await feed.eraseTx(); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
    });

    it("a criterion a feed item cannot carry is dormant in a feed view: no chip, no filtering; a kept one still filters", async function () {
        await showRow("L" + feed.libraryID);
        assert.isTrue(inWin(() => wv._wvFilterInFeedView()), "the window shows a feed");
        // Set as in My Library (a tag, the Tag search, an item note, an attachment,
        // a colour), then Has DOI, which a feed item can carry.
        const dormant = { hasTag: true, annotationTag: [TAG], itemNote: true, hasAttachment: true, annotationColor: ["#ffd400"], hasPMID: true, inOtherLibrary: true };
        setFilter(dormant);
        assert.isFalse(inWin(() => wv._isFilterActive(wv._filterState)), "only dormant criteria: the filter is off in the feed");
        assert.deepEqual(await wvT.waitFor(() => { const r = rowIDs(); return r.length === 3 ? r : null; }, 8000, 100), sorted(FD, FP, FL), "every feed row shown");
        assert.equal(chips(), 0, "no chip for a dormant criterion");
        setFilter(Object.assign({ hasDOI: true }, dormant));
        const want = sorted(FD, FL);
        const got = await wvT.waitFor(() => { const r = rowIDs(); return JSON.stringify(r) === JSON.stringify(want) ? r : null; }, 8000, 100);
        const diag = () => {
            const rp = iv().rowProvider || iv();
            return JSON.stringify({
                active: inWin(() => wv._isFilterActive(wv._filterState)),
                prim: [FD, FP, FL].map(i => inWin(() => wv._rowIsPrimary(i, wv._filterState))),
                passes: [FD, FP, FL].map(i => inWin(() => wv._rowPassesFilters(i, wv._wvFeedGroup(wv._filterState.groups[0])))),
                own: [FD, FP, FL].map(i => inWin(() => wv._rowHasOwnKindMatch(i, wv._wvFeedGroup(wv._filterState.groups[0])))),
                join: [FD, FP, FL].map(i => inWin(() => wv._rowSatisfiesTreeJoin(i, wv._wvFeedGroup(wv._filterState.groups[0])))),
                noop: wv._wvLastApplyNoop, view: !!rp._wvFilterView, raw: rp._wvOrigGetRowCount ? rp._wvOrigGetRowCount() : null,
                trace: (/** @type {any} */ (Zotero)._wvFilterTrace || []).slice(-12),
                perf: ((/** @type {any} */ (Zotero)._wvFilterPerf) || []).slice(-2),
            });
        };
        assert.deepEqual(got || rowIDs(), want, "Has DOI filters, the dormant criteria do not " + (got ? "" : diag()));
        assert.equal(await wvT.waitFor(() => chips() === 1 ? 1 : null, 5000, 100), 1, "one chip: Has DOI");
        // The quick-search scope and the Selection Target are dormant too (only parents exist).
        const g = Object.assign(wv._emptyFilterGroup(), { quickSearchScope: { annotation: true, attachment: true, note: true, parent: false } });
        assert.isFalse(inWin(() => wv._isGroupActive(g)), "a narrowed quick-search scope is dormant in a feed");
        setFilter({ hasDOI: true }, { selectionTarget: { annotation: true }, selectionTargetExclude: {} });
        assert.deepEqual(inWin(() => wv._effectiveSelectionTargetKinds()), { parent: true, attachment: true, note: true, annotation: true }, "the Selection Target is dormant in a feed");
        // A shadow never leaks: the state the popup writes to is the real one.
        assert.isTrue(inWin(() => wv._filterState.selectionTarget.annotation === true), "the real state keeps its Selection Target");
        clearFilter();
    });

    it("the Not in your library chip still hides the feed items a library holds", async function () {
        await showRow("L" + feed.libraryID);
        assert.isTrue(!!(wv._wvFdRecOf(FL.id) || {}).inLib, "FL is held by My Library (same DOI)");
        setFilter({ feedNotInLibrary: true, hasTag: true });
        const want = sorted(FD, FP);
        const got = await wvT.waitFor(() => { const r = rowIDs(); return JSON.stringify(r) === JSON.stringify(want) ? r : null; }, 8000, 100);
        assert.deepEqual(got || rowIDs(), want, "FL hidden; the dormant Has Tag hides nothing");
        clearFilter();
    });

    it("the popup in a feed view: only what a feed item can match, no empty box, no orphan heading", async function () {
        await showRow("L" + feed.libraryID);
        clearFilter();
        const mruBefore = Zotero.Prefs.get("extensions.zotero.weavero.itemTypeFilterMRU", true);
        wv._unifiedSearchMode = "tag";
        await openPopup();
        const tiles = dimTiles();
        for (const k of ["feedNotInLibrary", "retracted", "hasDOI", "hasURL", "hasAbstract"]) assert.include(tiles, k, "kept: " + k);
        for (const k of ["hasTag", "hasRelated", "hasLink", "hasItemLinks", "hasBacklinks", "inOtherLibrary", "hasPMID", "hasPMCID", "hasAttachment"]) assert.notInclude(tiles, k, "hidden: " + k);
        assert.deepEqual(headers(), ["Cross-level", "Parent"], "two groups: the search, then the parent rows");
        const el = inner();
        for (const sel of [".wv-filter-seltarget-bar", ".wv-filter-display-opt", ".wv-filter-notes-section", "[data-wv-section='attachmentFileType']", "[data-wv-section='annotationColor']", "[data-wv-section='readStatus']"]) {
            assert.isNull(el.querySelector(sel), "absent in a feed view: " + sel);
        }
        // No empty box: every section has content; no heading without a section after it.
        const kids = [...el.children];
        kids.forEach((k, i) => {
            if (k.classList.contains("wv-filter-group-header")) {
                const next = kids[i + 1];
                assert.ok(next && !next.classList.contains("wv-filter-group-header") && !next.classList.contains("wv-filter-bottom-controls"), "a heading is followed by a section: " + k.getAttribute("data-section"));
            }
            else if (!k.classList.contains("wv-filter-bottom-controls")) {
                assert.isAbove(k.children.length, 0, "not empty: " + (k.className || k.tagName) + " at " + i);
            }
        });
        // Item Type: the three types a feed item can have, as tiles and in the list.
        const FEED_TYPES = ["bookSection", "conferencePaper", "journalArticle"];
        const mru = [...el.querySelectorAll(".wv-itype-mru-tile .icon-item-type")].map(i => i.getAttribute("data-item-type")).sort();
        assert.deepEqual(mru, FEED_TYPES, "the item-type tiles");
        const listed = await wvT.waitFor(() => { const l = [...inner().querySelectorAll(".wv-itype-overlay .icon-item-type")].map(i => i.getAttribute("data-item-type")).sort(); return l.length ? l : null; }, 5000, 100);
        assert.deepEqual(listed, FEED_TYPES, "the item-type list");
        // The search: Publication and Author only (Tag was the mode: it falls back).
        const input = inner().querySelector(".wv-filter-search-input");
        assert.equal(input.placeholder, Zotero.Weavero.lib.wvStr("weavero-menu-filter-mode-publication"), "the mode falls back to Publication");
        inner().querySelector(".wv-filter-mode-trigger").click();
        const menu = await wvT.waitFor(() => doc.querySelector("menupopup.wv-filter-mode-menupopup"), 3000, 50);
        const modes = [...menu.querySelectorAll("menuitem")].map(m => m.getAttribute("data-wv-mode"));
        try { menu.hidePopup(); } catch (e) {}
        assert.deepEqual(modes, ["publication", "author"], "the search modes");
        // The feed's own publications, not My Library's.
        const box = await wvT.waitFor(() => { const b = inner().querySelector(".wv-filter-tag-list"); return b && /WV-FF/.test(b.textContent) ? b : null; }, 5000, 100);
        assert.ok(box, "publications listed");
        assert.include(box.textContent, "WV-FF Feed Journal");
        assert.notInclude(box.textContent, "WV-FF Library Journal", "My Library's journal is not offered over a feed");
        // The quick search's Restrict-to button stays hidden over a feed.
        const qsBtn = doc.querySelector(".wv-qs-scope-btn");
        if (qsBtn) {
            inWin(() => wv._updateQuickSearchScopeButtonVisibility({ value: "drops" }, qsBtn));
            assert.equal(qsBtn.style.display, "none", "no Restrict-to button over a feed");
        }
        closePopup();
        assert.equal(Zotero.Prefs.get("extensions.zotero.weavero.itemTypeFilterMRU", true), mruBefore, "the library's item-type MRU untouched");
    });

    it("the Feeds row offers the feeds' publications too", async function () {
        await showRow("F1");
        assert.isTrue(inWin(() => wv._wvFilterInFeedView()), "the Feeds row is a feed view");
        wv._unifiedSearchMode = "publication";
        await openPopup();
        const box = await wvT.waitFor(() => { const b = inner().querySelector(".wv-filter-tag-list"); return b && /WV-FF/.test(b.textContent) ? b : null; }, 5000, 100);
        assert.ok(box, "publications listed");
        assert.include(box.textContent, "WV-FF Feed Journal");
        assert.notInclude(box.textContent, "WV-FF Library Journal");
        closePopup();
    });

    it("back in My Library: every row of the popup, every criterion and its chip as before", async function () {
        await showRow("L" + feed.libraryID);
        setFilter({ hasTag: true, hasDOI: true });
        await wvT.waitFor(() => chips() === 1 ? 1 : null, 5000, 100);
        await showRow("L" + Zotero.Libraries.userLibraryID);
        assert.isFalse(inWin(() => wv._wvFilterInFeedView()), "My Library is not a feed view");
        assert.equal(await wvT.waitFor(() => chips() === 2 ? 2 : null, 8000, 100), 2, "Has Tag's chip is back");
        const got = await wvT.waitFor(() => { const r = rowIDs(); return r.includes(LIB.id) && !r.includes(LIB_UNTAGGED.id) ? r : null; }, 8000, 100);
        assert.ok(got, "the tagged item with a DOI shown, the untagged one hidden: Has Tag filters again " + JSON.stringify(rowIDs()));
        clearFilter();
        wv._unifiedSearchMode = "tag";
        await openPopup();
        const tiles = dimTiles();
        for (const k of ["hasTag", "hasRelated", "hasLink", "inOtherLibrary", "retracted", "hasDOI", "hasPMID", "hasPMCID", "hasURL", "hasAbstract", "hasAttachment"]) assert.include(tiles, k, "back: " + k);
        assert.notInclude(tiles, "feedNotInLibrary", "the feed chip is not offered in a library");
        assert.includeMembers(headers(), ["Cross-level", "Parent", "Attachment", "Annotation"]);
        const el = inner();
        for (const sel of [".wv-filter-seltarget-bar", ".wv-filter-display-opt", ".wv-filter-notes-section", "[data-wv-section='attachmentFileType']", "[data-wv-section='annotationColor']"]) {
            assert.isNotNull(el.querySelector(sel), "back: " + sel);
        }
        assert.equal(el.querySelector(".wv-filter-search-input").placeholder, Zotero.Weavero.lib.wvStr("weavero-menu-filter-mode-tag"), "the Tag mode is offered again");
        const listed = await wvT.waitFor(() => { const l = inner().querySelectorAll(".wv-itype-overlay .icon-item-type"); return l.length > 3 ? l.length : null; }, 5000, 100);
        assert.isAbove(listed || 0, 3, "every item type in the list");
        const qsBtn = doc.querySelector(".wv-qs-scope-btn");
        if (qsBtn) {
            inWin(() => wv._updateQuickSearchScopeButtonVisibility({ value: "drops" }, qsBtn));
            assert.notEqual(qsBtn.style.display, "none", "the Restrict-to button with a search in a library");
            inWin(() => wv._updateQuickSearchScopeButtonVisibility({ value: "" }, qsBtn));
        }
        closePopup();
    });
});
