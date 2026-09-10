/* global describe, it, before, assert, Zotero */

// Quiescence-time search-coverage repair (2026-09-10).
//
// Zotero's row set can be built against an incomplete match set and never
// corrected: a parent in `searchParentIDs` with no raw row -- typically a
// parent whose only hit is a PDF's full text, under a chip applied first.
// No keep can show a row that was never built, so the final-apply
// scheduler re-issues the search at quiescence to make Zotero rebuild.
// The budget below is what keeps a deterministic omission from looping:
// two re-issues per term within a minute, reset by a new term.

describe("Weavero — search coverage repair budget", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvCoverageRepairAllowed !== "function") this.skip();
	});

	const fresh = () => {
		const twin = Object.create(Object.getPrototypeOf(wv));
		return twin;   // own state, no shared budget with the live plugin
	};

	it("allows two repairs per term, then refuses", () => {
		const p = fresh();
		assert.isTrue(p._wvCoverageRepairAllowed("drop"), "first");
		assert.isTrue(p._wvCoverageRepairAllowed("drop"), "second");
		assert.isFalse(p._wvCoverageRepairAllowed("drop"), "third is refused");
		assert.isFalse(p._wvCoverageRepairAllowed("drop"), "and stays refused");
	});

	it("a new term resets the budget", () => {
		const p = fresh();
		p._wvCoverageRepairAllowed("drop"); p._wvCoverageRepairAllowed("drop");
		assert.isFalse(p._wvCoverageRepairAllowed("drop"));
		assert.isTrue(p._wvCoverageRepairAllowed("splash"), "different term, fresh budget");
		assert.isTrue(p._wvCoverageRepairAllowed("splash"));
		assert.isFalse(p._wvCoverageRepairAllowed("splash"));
	});

	it("the budget expires after a minute", () => {
		const p = fresh();
		p._wvCoverageRepairAllowed("drop"); p._wvCoverageRepairAllowed("drop");
		assert.isFalse(p._wvCoverageRepairAllowed("drop"));
		p._wvCovRepair.at = Date.now() - 61000;
		assert.isTrue(p._wvCoverageRepairAllowed("drop"), "an old episode does not block a new one");
	});

	it("the incompleteness detector itself is present and inert on a clean provider", () => {
		if (typeof wv._wvSearchCoverageIncomplete !== "function") return;
		assert.isFalse(wv._wvSearchCoverageIncomplete(null));
		assert.isFalse(wv._wvSearchCoverageIncomplete({ _rows: [], searchMode: false }));
		// search mode with every parent present -> complete
		const rows = [{ ref: { id: 1 }, level: 0 }, { ref: { id: 2 }, level: 1 }];
		assert.isFalse(wv._wvSearchCoverageIncomplete({ _rows: rows, searchMode: true,
			searchParentIDs: new Set([1]), searchItemIDs: new Set([2]) }));
		// a promoted parent with no raw row -> incomplete
		assert.isTrue(wv._wvSearchCoverageIncomplete({ _rows: rows, searchMode: true,
			searchParentIDs: new Set([1, 111]), searchItemIDs: new Set([2]) }));
	});
});
