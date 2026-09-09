/* global describe, it, before, assert, Zotero */

// DOM anchors are VERIFIED by round-trip (2026-09-09).
//
// Upstream's getUniqueSelectorContaining returns `#id` as soon as an element
// has an id, without testing uniqueness. On a page with duplicate ids
// (Annual Reviews: <div id="sec5"> and, inside its heading, <a id="sec5">)
// toSelector answers `#sec5`, querySelector resolves it to the FIRST match,
// and a heading anchor came back as the whole section -- on Reset to
// Original and on Save Region alike. `_wvDomAnchorFromRange` now resolves
// the selector back through the view and, when that is not the range it
// was asked about, rebuilds one from a verified index path plus a
// text-position refinement in upstream's own offset semantics.
//
// The stub view below reproduces exactly upstream's two halves: a lossy
// toSelector (id shortcut) and the real resolution rule (querySelector +
// textPositionToRange over every text node under the element).

describe("Weavero — DOM anchor round-trip", () => {
	let wv, doc;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvDomAnchorFromRange !== "function"
			|| typeof wv._wvDomRebuildSelector !== "function") this.skip();
		doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-anchor-test");
		doc.body.innerHTML = "<div id='intro'><p>Preamble text.</p></div>"
			+ "<div id='sec5'><div><h2><a id='sec5'>PROGRESSING TOWARD REALISM</a></h2></div>"
			+ "<p id='p1'>First <b>bold</b> paragraph.</p><p id='p2'>Second paragraph here.</p></div>";
	});

	// upstream textPositionToRange, verbatim in spirit: offsets over every
	// text node under root, NodeIterator order.
	const textPositionToRange = (sel, root) => {
		const it = doc.createNodeIterator(root, 4);
		const range = doc.createRange();
		let pos = 0;
		for (let node = it.nextNode(); node; node = it.nextNode()) {
			const len = node.nodeValue.length;
			const s = sel.start - pos, e = sel.end - pos;
			if (s >= 0 && s <= len) range.setStart(node, s);
			if (e >= 0 && e <= len) range.setEnd(node, e);
			pos += len;
		}
		return range;
	};
	const stubView = () => ({
		_iframeWindow: null,
		// the lossy half: any range inside #sec5 becomes "#sec5"
		toSelector: (range) => {
			const el = range.commonAncestorContainer.nodeType === 1
				? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
			const withId = el.closest("[id]");
			const sel = { type: "CssSelector", value: "#" + withId.id };
			if (range.toString().trim() !== withId.textContent.trim()) {
				sel.refinedBy = wv._wvTextPositionFromRange(range, withId);
			}
			return sel;
		},
		toDisplayedRange: (sel) => {
			const root = doc.querySelector(sel.value);
			if (!root) return null;
			if (sel.refinedBy) return textPositionToRange(sel.refinedBy, root);
			const r = doc.createRange();
			r.selectNodeContents(root);
			return r;
		},
	});
	const rangeOf = (node, s, e) => { const r = doc.createRange(); r.setStart(node, s); r.setEnd(node, e); return r; };

	it("the duplicate-id heading anchors to the heading, not the section", () => {
		const pv = stubView();
		const a = doc.querySelectorAll("#sec5")[1] || doc.querySelector("a#sec5");
		const t = doc.querySelector("h2 > a").firstChild;
		const rng = rangeOf(t, 0, t.length);
		assert.equal(pv.toSelector(rng).value, "#sec5", "stub reproduces upstream's lossy answer");
		const out = wv._wvDomAnchorFromRange(pv, rng);
		assert.isOk(out && out.selector);
		assert.notEqual(out.selector.value, "#sec5", "the id shortcut was not trusted");
		const back = pv.toDisplayedRange(out.selector);
		assert.equal(back.toString(), "PROGRESSING TOWARD REALISM", "resolves to the heading text");
		assert.isTrue(out.exact);
		void a;
	});

	it("a partial range inside the heading keeps character precision", () => {
		const pv = stubView();
		const t = doc.querySelector("h2 > a").firstChild;
		const out = wv._wvDomAnchorFromRange(pv, rangeOf(t, 12, 18));
		assert.equal(pv.toDisplayedRange(out.selector).toString(), "TOWARD");
		assert.isOk(out.selector.refinedBy, "refined by text position");
	});

	it("a range spanning two paragraphs anchors to their common ancestor with offsets", () => {
		const pv = stubView();
		const r = doc.createRange();
		r.setStart(doc.getElementById("p1").firstChild, 6);      // "bold paragraph." onwards
		r.setEnd(doc.getElementById("p2").firstChild, 6);        // "Second"
		const out = wv._wvDomAnchorFromRange(pv, r);
		assert.equal(pv.toDisplayedRange(out.selector).toString(), r.toString());
		assert.isTrue(out.exact);
	});

	it("a selector that already round-trips is kept as upstream produced it", () => {
		const pv = stubView();
		const t = doc.querySelector("#intro p").firstChild;
		const rng = rangeOf(t, 0, 8);   // "Preamble" inside the only #intro
		const out = wv._wvDomAnchorFromRange(pv, rng);
		assert.equal(out.selector.value, "#intro", "unique id, upstream's answer stands");
		assert.equal(pv.toDisplayedRange(out.selector).toString(), "Preamble");
	});

	it("_wvTextPositionFromRange matches upstream's offset semantics", () => {
		const root = doc.getElementById("p1");                   // "First " + "bold" + " paragraph."
		const r = doc.createRange();
		r.setStart(root.querySelector("b").firstChild, 1);       // "old"
		r.setEnd(root.lastChild, 3);                             // " pa"
		const tp = wv._wvTextPositionFromRange(r, root);
		assert.deepEqual(tp, { type: "TextPositionSelector", start: 7, end: 13 });
		assert.equal(textPositionToRange(tp, root).toString(), r.toString());
		// element-boundary ends are moved into the text nodes
		const r2 = doc.createRange();
		r2.setStart(root, 1);                                    // before <b>
		r2.setEnd(root, 2);                                      // after <b>
		assert.deepEqual(wv._wvTextPositionFromRange(r2, root), { type: "TextPositionSelector", start: 6, end: 10 });
	});
});
