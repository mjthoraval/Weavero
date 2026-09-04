/* global describe, it, before, after, assert, Zotero */

// PDF region-editor seeding (2026-09-04): "Edit region only selects one
// letter." A POINT-anchored outline entry (embedded destination / extraction
// point stored as a zero-area rect, e.g. [37.61,301.26,37.61,301.26]) covers
// no glyph centres, so rect→char matching nulls and the editor seeded a
// 1-char range at the nearest glyph. `_wvRegionEditorSeedRange` now consults
// the entry TITLE near the stored point first (the same recovery navigation
// uses) and only then falls back to the single glyph.

describe("Weavero — PDF region editor seeds point entries from the title", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvRegionEditorSeedRange !== "function") this.skip();
	});

	after(() => { try { delete wv._wvOutlineRecoverRect; } catch (e) {} });

	// A one-line synthetic glyph stream: 20 chars, 10 units wide each, on a
	// 700-tall page (PDF y-up; line spans y 300..312).
	const chars = Array.from({ length: 20 }, (_, i) => ({
		c: String.fromCharCode(65 + i),
		rect: [40 + i * 10, 300, 50 + i * 10, 312],
	}));
	const stubRecovery = (result) => {
		wv._wvOutlineRecoverRect = async () => result;   // instance shadow
	};

	it("real region rects seed the covered span (recovery not consulted)", async () => {
		stubRecovery(Promise.reject(new Error("must not be called")));
		let recoveryCalled = false;
		wv._wvOutlineRecoverRect = async () => { recoveryCalled = true; return null; };
		const base = { pageIndex: 11, rects: [[40, 300, 90, 312]] };   // chars 0..4
		const r = await wv._wvRegionEditorSeedRange({}, chars, 11, base, "Anything");
		assert.deepEqual(r, { start: 0, end: 4 });
		assert.isFalse(recoveryCalled, "rects that match glyphs need no recovery");
	});

	it("a zero-area point rect seeds from the TITLE's recovered rects", async () => {
		stubRecovery({ pageIndex: 11, rects: [[90, 300, 170, 312]] });   // chars 5..12
		const base = { pageIndex: 11, rects: [[37.61, 301.26, 37.61, 301.26]] };
		const r = await wv._wvRegionEditorSeedRange({}, chars, 11, base, "CRediT authorship");
		assert.deepEqual(r, { start: 5, end: 12 },
			"the heading's span, not one letter — the 2026-09-04 report");
	});

	it("recovery on a DIFFERENT page is refused (chars belong to this page)", async () => {
		stubRecovery({ pageIndex: 3, rects: [[90, 300, 170, 312]] });
		const base = { pageIndex: 11, rects: [[37.61, 301.26, 37.61, 301.26]] };
		const r = await wv._wvRegionEditorSeedRange({}, chars, 11, base, "CRediT authorship");
		assert.equal(r.start, r.end, "1-char nearest-glyph fallback");
	});

	it("no title -> the 1-char nearest-glyph fallback, near the point", async () => {
		let recoveryCalled = false;
		wv._wvOutlineRecoverRect = async () => { recoveryCalled = true; return null; };
		const base = { pageIndex: 11, rects: [[37.61, 301.26, 37.61, 301.26]] };
		const r = await wv._wvRegionEditorSeedRange({}, chars, 11, base, null);
		assert.isFalse(recoveryCalled);
		assert.equal(r.start, r.end);
		assert.equal(r.start, 0, "nearest glyph to the point (left of char 0)");
	});
});
