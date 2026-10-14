/* global describe, it, before, after, assert, Zotero, wvT */

// A DELIBERATE filter apply that a guard bounces is RETRIED, not dropped
// (Ubuntu campaign 2026-10-13; first seen live 2026-10-02). Clear all and a
// chip's x apply without cascade. Clearing a quick search sets off applies for
// up to ~1 s, each opening a 300 ms observer-suppression window; a Clear all
// landing in one was dropped, and the list stayed filtered under an EMPTY
// filter state (live: 2 of 6 runs stuck at 0.3-0.7 s after the search clear).
// The tree observer's own plain apply must still be dropped (its retry loops,
// filter.ts _applyItemsListFilter).
describe("Weavero — a bounced deliberate filter apply is retried", () => {
	let wv, zp;
	const items = [];
	const rp = () => zp.itemsView.rowProvider || zp.itemsView;   // the FILTERED count (iv.rowCount bypasses the patch)
	const count = () => rp().getRowCount();

	before(async function () {
		this.timeout(30000);
		wv = wvT.plugin();
		if (!wv) wvT.absent("plugin");
		zp = wvT.win().ZoteroPane;
		items.push(await wvT.createItem("journalArticle", { title: "WV-TEST deliberate article" }));
		items.push(await wvT.createItem("book", { title: "WV-TEST deliberate book" }));
		await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
		await zp.itemsView.waitForLoad();
		// The fixture saves notify the items tree, which refreshes LATER -- and a
		// refresh re-applies the filter, which would mask the bug (on the
		// unfixed code this test passed until it waited the refreshes out).
		await wvT.sleep(3000);
	});
	after(async function () {
		this.timeout(15000);
		try { wv._clearAllFilters(); } catch (e) {}
		wv._suppressTreeObserverUntil = 0;
		await wvT.erase(...items);
	});

	it("Clear all inside the suppression window still unfilters the list", async function () {
		this.timeout(20000);
		wv._clearAllFilters();
		const total = await wvT.waitFor(() => { const n = count(); return n >= 2 ? n : null; }, 5000);
		assert.isOk(total, "the library lists the fixture items");
		wv._activeGroup().itemType = ["journalArticle"];
		wv._renderFilterBar();
		wv._applyItemsListFilter({ cascade: true });
		const filtered = await wvT.waitFor(() => { const n = count(); return n < total ? n : null; }, 5000);
		assert.isOk(filtered, "the item-type chip narrows the list (" + total + " rows before)");
		await wvT.sleep(1500);
		assert.equal(count(), filtered, "the filtered list is settled (nothing else re-applies)");
		// What the search clear leaves behind: an apply just ran, the window is open.
		wv._suppressTreeObserverUntil = Date.now() + 500;
		wv._clearAllFilters();
		assert.isFalse(wv._isFilterActive(wv._filterState), "the filter state is empty at once");
		assert.equal(count(), filtered, "the Clear all was bounced (the list is still filtered right after)");
		const back = await wvT.waitFor(() => count() === total, 4000);
		assert.isOk(back, "the list is unfiltered once the window closes (rows: " + count() + " of " + total + ")");
	});

	it("the tree observer's plain apply is still dropped, not retried", async function () {
		wv._wvRetryCascade = false;
		if (wv._wvCascadeRetryTimer) { try { Zotero.Weavero.lib.wvClearTimeout(wv._wvCascadeRetryTimer); } catch (e) {} wv._wvCascadeRetryTimer = null; }
		wv._suppressTreeObserverUntil = Date.now() + 400;
		try {
			wv._applyItemsListFilter();
			assert.notOk(wv._wvCascadeRetryTimer, "no retry scheduled for a plain (observer) apply");
			wv._applyItemsListFilter({ deliberate: true });
			assert.isOk(wv._wvCascadeRetryTimer, "a deliberate one schedules the retry");
			assert.isFalse(!!wv._wvRetryCascade, "a plain deliberate apply does not turn the retry into a cascade");
		}
		finally {
			await wvT.sleep(800);   // let the scheduled retry run against an empty filter
			wv._suppressTreeObserverUntil = 0;
		}
	});

	it("a chip's x applies deliberately (source contract: a synthetic click never reaches chrome listeners)", () => {
		const src = wvT.src("_buildFilterChip");
		assert.match(src, /onRemove\(\);[\s\S]{0,200}_applyItemsListFilter\(\{\s*deliberate:\s*true\s*\}\)/,
			"the remove handler re-applies with { deliberate: true }");
	});
});
