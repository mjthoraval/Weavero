/* global describe, it, before, assert, Zotero */

// DOM-view outline insertion index (2026-09-07, Rizuan snapshot session):
// "insert before the FIRST entry comparing after the target" let a single
// misplaced entry (a sidebar pin stuck mid-list) capture every later
// insertion at its slot, compounding in both directions. The contract now:
// insert after the LAST entry comparing before the target — immune to any
// single outlier — with the old edge kept: nothing resolvable ⇒ append.

describe("Weavero — DOM outline insertion order", () => {
	let wv, doc;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvOutlineDomOrderIndex !== "function") this.skip();
		doc = Zotero.getMainWindow().document.implementation
			.createHTMLDocument("wv-order-test");
	});

	// Ten paragraphs in document order; entries anchor to them by index via a
	// stubbed view whose toDisplayedRange maps {value: "#pN"}.
	const fixture = () => {
		doc.body.textContent = "";
		const els = [];
		for (let i = 0; i < 10; i++) {
			const p = doc.createElement("p");
			p.id = "p" + i;
			p.textContent = "para " + i;
			doc.body.appendChild(p);
			els.push(p);
		}
		const pv = {
			_iframeWindow: null,   // no cloneInto path
			toDisplayedRange(posArg) {
				const el = doc.querySelector(posArg && posArg.value);
				if (!el) return null;
				const r = doc.createRange();
				r.setStart(el.firstChild, 0);
				return r;
			},
		};
		const entry = (n) => ({ position: { type: "CssSelector", value: "#p" + n } });
		return { pv, entry };
	};

	it("files a target between its true document-order neighbours", () => {
		const { pv, entry } = fixture();
		const entries = [entry(0), entry(2), entry(4), entry(8)];
		const gap = wv._wvOutlineDomOrderIndex(entries, { type: "CssSelector", value: "#p5" }, pv);
		assert.equal(gap, 3, "after p4, before p8");
	});

	it("a single MISPLACED entry cannot capture the insertion (outlier immunity)", () => {
		const { pv, entry } = fixture();
		// p9 wrongly sits at list slot 1 (the historic sidebar-pin misfile).
		const entries = [entry(0), entry(9), entry(2), entry(4), entry(8)];
		const gap = wv._wvOutlineDomOrderIndex(entries, { type: "CssSelector", value: "#p5" }, pv);
		// first-after-wins would have returned 1 (right after p0, before the
		// misplaced p9) — the compounding bug. Last-before files after p4.
		assert.equal(gap, 4, "after the LAST true predecessor (p4), ignoring the outlier");
	});

	it("target before everything files at 0; after everything appends", () => {
		const { pv, entry } = fixture();
		const entries = [entry(2), entry(4)];
		assert.equal(wv._wvOutlineDomOrderIndex(entries, { value: "#p0" }, pv), 0);
		assert.equal(wv._wvOutlineDomOrderIndex(entries, { value: "#p8" }, pv), 2);
	});

	it("nothing resolvable ⇒ append, never the top", () => {
		const { pv } = fixture();
		const entries = [
			{ position: { type: "CssSelector", value: "#gone-1" } },
			{ position: { type: "CssSelector", value: "#gone-2" } },
		];
		assert.equal(wv._wvOutlineDomOrderIndex(entries, { value: "#p5" }, pv), 2);
	});
});
