/* global describe, it, before, assert, Zotero, wvT */

// The reader sidebar's overflow link icon (a row whose clamped comment hides
// part of a URL gets the comment-popup icon). MJT 2026-10-23: "When I scroll
// down the annotations pane of a reader, the icons are not immediately
// updated. They update only after some time or after clicking on one
// annotation."
//
// Cause: the pass measured every row at once, but previews have
// `content-visibility: auto`; a preview the browser is not drawing (row off
// screen) reads scrollHeight - clientHeight = its padding (6.5 px against a
// 1 px tolerance), so off-screen rows got the icon. Scrolling changes no DOM,
// so nothing re-ran the pass when they came into view. And the pass took the
// Related button (same sidebar class) for the comment icon, so a row with
// relations never got its overflow icon.
//
// The scroll timing itself needs a drawn window -- the manual check is in
// docs/gesture-testing.md; these lock the decisions the pass makes.

describe("Weavero — sidebar overflow icons: skipped previews are not measured", function () {
	let wv, doc;
	const X = "http://www.w3.org/1999/xhtml";

	before(function () {
		wv = wvT.plugin();
		for (const m of ["_wvSidebarOverflowVerdict", "_wvSidebarCommentBtn", "_wvWatchSkippedOverflow", "_updateSidebarOverflowIcons"]) wvT.method(m);
		doc = Zotero.getMainWindow().document;
	});

	const fakePreview = (visible, sh, ch) => ({
		firstElementChild: { checkVisibility: (opts) => (opts && opts.contentVisibilityAuto ? visible : true) },
		scrollHeight: sh, clientHeight: ch,
	});

	it("a skipped preview is 'skipped', not overflowing, whatever it measures", function () {
		assert.strictEqual(wv._wvSidebarOverflowVerdict(fakePreview(false, 24, 17)), "skipped",
			"the padding-only false overflow of an off-screen row");
		assert.strictEqual(wv._wvSidebarOverflowVerdict(fakePreview(true, 24, 17)), true, "drawn and clipped");
		assert.strictEqual(wv._wvSidebarOverflowVerdict(fakePreview(true, 24, 24)), false, "drawn and whole");
		assert.isNull(wv._wvSidebarOverflowVerdict({ firstElementChild: null, scrollHeight: 50, clientHeight: 17 }),
			"plain text: nothing to probe");
	});

	it("the pass uses the verdict and watches the skipped rows", function () {
		const src = String(wv._updateSidebarOverflowIcons);
		assert.include(src, "_wvSidebarOverflowVerdict");
		assert.include(src, "_wvWatchSkippedOverflow");
		assert.include(src, "_wvSidebarCommentBtn");
	});

	it("a row's Related button is not its comment icon", function () {
		const row = /** @type {any} */ (doc.createElementNS(X, "div"));
		const rel = /** @type {any} */ (doc.createElementNS(X, "button"));
		rel.className = "wv-btn wv-btn-sidebar wv-btn-relations";
		row.appendChild(rel);
		assert.isNull(wv._wvSidebarCommentBtn(row), "relations only: no comment icon yet");
		const cmt = /** @type {any} */ (doc.createElementNS(X, "button"));
		cmt.className = "wv-btn wv-btn-sidebar";
		row.insertBefore(cmt, rel);
		assert.strictEqual(wv._wvSidebarCommentBtn(row), cmt);
	});
});
