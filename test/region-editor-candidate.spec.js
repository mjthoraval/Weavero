/* global describe, it, before, assert, Zotero */

// The DOM region editor's handle drag (2026-09-09): every pointer move used
// to take whatever `caretPositionFromPoint` returned. Over a margin or
// between blocks that is an ELEMENT boundary, and a handle set there jumped
// the region to the container's edge -- 7,518 client rects on the Rizuan
// snapshot, repainted one div per rect per mouse event: Zotero hung.
// `_wvDomRegionCandidate` now decides the next range: text carets only,
// bounded size, else keep the last good region.

describe("Weavero — region editor candidate range", () => {
	let wv, doc;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvDomRegionCandidate !== "function") this.skip();
		doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-region-test");
		doc.body.innerHTML = "<p id='a'>Alpha bravo charlie</p><p id='b'>Delta echo foxtrot</p>"
			+ "<p id='c'>Golf hotel india</p>";
	});

	const textOf = (id) => doc.getElementById(id).firstChild;
	const seed = () => {
		const r = doc.createRange();
		r.setStart(textOf("b"), 0);
		r.setEnd(textOf("b"), 5);   // "Delta"
		return r;
	};

	it("extends the region to a TEXT caret", () => {
		const cand = wv._wvDomRegionCandidate(seed(), { offsetNode: textOf("c"), offset: 4 }, "end");
		assert.isOk(cand);
		assert.equal(cand.toString(), "Delta echo foxtrotGolf");
	});

	it("ignores an ELEMENT caret -- the margin/between-blocks answer that ran away", () => {
		assert.isNull(wv._wvDomRegionCandidate(seed(), { offsetNode: doc.body, offset: 0 }, "start"));
		assert.isNull(wv._wvDomRegionCandidate(seed(), { offsetNode: doc.body, offset: doc.body.childNodes.length }, "end"));
		assert.isNull(wv._wvDomRegionCandidate(seed(), { offsetNode: doc.getElementById("a"), offset: 0 }, "start"));
	});

	it("rejects a crossed or empty region and a missing caret", () => {
		assert.isNull(wv._wvDomRegionCandidate(seed(), { offsetNode: textOf("b"), offset: 0 }, "end"), "collapsed");
		assert.isNull(wv._wvDomRegionCandidate(seed(), { offsetNode: textOf("c"), offset: 2 }, "start"), "start after end");
		assert.isNull(wv._wvDomRegionCandidate(seed(), null, "end"));
	});

	describe("_wvDomLeafRects (shared by the flash and the editor)", () => {
		const R = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
		const stub = (rects) => ({ getClientRects: () => rects });

		it("keeps line boxes, drops the element box that contains them", () => {
			const line1 = R(10, 10, 200, 16), line2 = R(10, 26, 180, 16), box = R(8, 8, 204, 36);
			const out = wv._wvDomLeafRects(stub([box, line1, line2]));
			assert.deepEqual(out, [line1, line2], "the container slab is gone, lines stay in order");
		});

		it("dedupes a line box reported twice (the snapshot heading case)", () => {
			const line = R(10, 10, 200, 16);
			assert.lengthOf(wv._wvDomLeafRects(stub([line, R(10, 10, 200, 16)])), 1);
		});

		it("ignores empty rects and survives a range that cannot be measured", () => {
			assert.lengthOf(wv._wvDomLeafRects(stub([R(0, 0, 0, 0), R(5, 5, 10, 0)])), 0);
			assert.deepEqual(wv._wvDomLeafRects({}), []);
			assert.deepEqual(wv._wvDomLeafRects(null), []);
		});
	});

	it("caps the region's size in client rects (a region is lines, not pages)", () => {
		// A range-shaped stub: the helper only needs these members.
		const big = (n) => ({
			cloneRange() { return this; }, setStart() {}, setEnd() {}, collapsed: false,
			toString: () => "text", getClientRects: () => new Array(n).fill({}),
		});
		const caret = { offsetNode: textOf("a"), offset: 1 };
		assert.isNull(wv._wvDomRegionCandidate(big(401), caret, "end"), "over the default cap");
		assert.isOk(wv._wvDomRegionCandidate(big(399), caret, "end"), "under it");
		assert.isOk(wv._wvDomRegionCandidate(big(401), caret, "end", 1000), "cap is a parameter");
	});
});
