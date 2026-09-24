/* global describe, it, before, after, assert, Zotero */

// Scroll-spy range cache: a MISS must be retryable, never permanent
// (2026-09-03, found by the outline restart protocol).
//
// _wvOutlineSpyPickDom caches each entry's resolved Range per reader. The old
// code cached `null` for an entry that failed to resolve and NEVER retried:
// a spy pass firing before the view's content loaded (a restored tab right
// after a Zotero restart, an EPUB section not yet streamed in) poisoned the
// cache for every entry, and the current-section highlight stayed dead until
// an outline re-render. The contract: misses are cached with a timestamp and
// retried after a cool-down; successes stay cached until the render-time
// clear.

describe("Weavero — outline scroll-spy cache retries misses", () => {
	let wv, doc;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvOutlineSpyPickDom !== "function") this.skip();
		doc = Zotero.getMainWindow().document;
	});

	after(() => { try { delete wv._wvSpyMissRetryMs; } catch (e) {} });

	const mkFixture = () => {
		// A detached list with one CFI-anchored row; the pv stub's getRange is
		// the "is the content loaded yet?" dial.
		const list = doc.createElement("div");
		list.className = "wv-outline-list";
		const row = doc.createElement("div");
		row.className = "wv-outline-row";
		row._wvOl = { entry: { id: "e1", title: "Ch 1", location: { cfi: "epubcfi(/6/2!/4)" } } };
		list.appendChild(row);
		let loaded = false;
		const pv = {
			_iframeWindow: { innerHeight: 800 },
			getRange: () => (loaded ? { getBoundingClientRect: () => ({ top: 100 }) } : null),
		};
		const reader = { _internalReader: { _primaryView: pv } };
		return { list, row, reader, setLoaded: v => { loaded = v; } };
	};

	it("returns nothing while the content cannot resolve", () => {
		const f = mkFixture();
		assert.isNull(wv._wvOutlineSpyPickDom(f.reader, f.list));
	});

	it("within the cool-down a miss stays cached (no re-resolution)", () => {
		const f = mkFixture();
		wv._wvOutlineSpyPickDom(f.reader, f.list);     // caches the miss
		f.setLoaded(true);                              // content now ready...
		assert.isNull(wv._wvOutlineSpyPickDom(f.reader, f.list),
			"...but the cool-down still holds — cheap, by design");
	});

	it("after the cool-down the miss is retried and the row resolves", async () => {
		const f = mkFixture();
		wv._wvSpyMissRetryMs = 1;                       // shrink the cool-down for the test
		wv._wvOutlineSpyPickDom(f.reader, f.list);     // caches the miss
		f.setLoaded(true);
		await new Promise(r => setTimeout(r, 20));
		const pick = wv._wvOutlineSpyPickDom(f.reader, f.list);
		assert.strictEqual(pick, f.row,
			"a resolvable entry must come back after the cool-down — permanent "
			+ "null poisoning is the 2026-09-03 restart bug");
	});

	it("a cached range that stops yielding a rect degrades to a retryable miss", async () => {
		const f = mkFixture();
		wv._wvSpyMissRetryMs = 1;
		// Seed the cache the way a plugin reload leaves it: a range-like
		// object whose rect read throws (dead cross-compartment object).
		f.reader._wvSpyRangeCache = new Map([["e1", { getBoundingClientRect() { throw new Error("dead object"); } }]]);
		f.setLoaded(true);
		assert.isNull(wv._wvOutlineSpyPickDom(f.reader, f.list),
			"first pass converts the dead range to a miss");
		await new Promise(r => setTimeout(r, 20));
		assert.strictEqual(wv._wvOutlineSpyPickDom(f.reader, f.list), f.row,
			"after the cool-down the entry re-resolves — dead ranges must not stick");
	});

	// 2026-09-24 (MJT, Book EPUB after paginated -> scrolled): the reader
	// rebuilds every section on a flow switch; cached ranges into the old
	// content are DETACHED and measure 0x0 at the top, so every entry counted
	// as passed and the FIRST row held the marker. Detached ranges re-resolve.
	it("a cached range into rebuilt (detached) content is re-resolved", () => {
		const list = doc.createElement("div");
		list.className = "wv-outline-list";
		const mkRow = (id, cfi) => {
			const row = doc.createElement("div");
			row.className = "wv-outline-row";
			row._wvOl = { entry: { id, title: id, location: { cfi } } };
			list.appendChild(row);
			return row;
		};
		mkRow("a", "epubcfi(/6/2!/4)");
		const b = mkRow("b", "epubcfi(/6/4!/4)");
		const live = { "epubcfi(/6/2!/4)": 50, "epubcfi(/6/4!/4)": 150 };
		const pv = {
			_iframeWindow: { innerHeight: 800 },
			getRange: (cfi) => ({ startContainer: { isConnected: true }, getBoundingClientRect: () => ({ top: live[cfi] }) }),
		};
		const dead = { startContainer: { isConnected: false }, getBoundingClientRect: () => ({ top: 0 }) };
		const reader = { _internalReader: { _primaryView: pv }, _wvSpyRangeCache: new Map([["a", dead], ["b", dead]]) };
		assert.strictEqual(wv._wvOutlineSpyPickDom(reader, list), b,
			"both entries passed; the later one (b) is current -- not the first row");
	});

	// Same day: an entry in an UNMOUNTED chapter resolves into detached
	// content and measured as top 0 -- it beat the entries really scrolled
	// past, and the marker jumped to the end of the book at 10 %.
	it("an entry in an unmounted chapter never wins by its fake 0 rect", () => {
		const list = doc.createElement("div");
		list.className = "wv-outline-list";
		const mkRow = (id, cfi) => {
			const row = doc.createElement("div");
			row.className = "wv-outline-row";
			row._wvOl = { entry: { id, title: id, location: { cfi } } };
			list.appendChild(row);
			return row;
		};
		const passed = mkRow("passed", "epubcfi(/6/10!/4)");
		mkRow("endOfBook", "epubcfi(/6/92!/4)");
		const pv = {
			_iframeWindow: { innerHeight: 800 },
			getRange: (cfi) => cfi === "epubcfi(/6/10!/4)"
				? { startContainer: { isConnected: true }, getBoundingClientRect: () => ({ top: -300 }) }
				: { startContainer: { isConnected: false }, getBoundingClientRect: () => ({ top: 0 }) },
		};
		const reader = { _internalReader: { _primaryView: pv } };
		assert.strictEqual(wv._wvOutlineSpyPickDom(reader, list), passed);
	});

	// ...and ranges cached while the reader was still rebuilding stay
	// CONNECTED but collapse to an empty 0x0 box: same fake-top-0 effect.
	it("a cached range that collapsed to an empty box is re-resolved", () => {
		const list = doc.createElement("div");
		list.className = "wv-outline-list";
		const mkRow = (id, cfi) => {
			const row = doc.createElement("div");
			row.className = "wv-outline-row";
			row._wvOl = { entry: { id, title: id, location: { cfi } } };
			list.appendChild(row);
			return row;
		};
		mkRow("a", "epubcfi(/6/2!/4)");
		const b = mkRow("b", "epubcfi(/6/4!/4)");
		const live = { "epubcfi(/6/2!/4)": -900, "epubcfi(/6/4!/4)": -100 };
		const pv = {
			_iframeWindow: { innerHeight: 800 },
			getRange: (cfi) => ({ startContainer: { isConnected: true },
				getBoundingClientRect: () => ({ top: live[cfi], left: 10, width: 50, height: 20 }) }),
		};
		const empty = { startContainer: { isConnected: true },
			getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }) };
		const reader = { _internalReader: { _primaryView: pv }, _wvSpyRangeCache: new Map([["a", empty], ["b", empty]]) };
		assert.strictEqual(wv._wvOutlineSpyPickDom(reader, list), b);
	});

	// An entry whose region was EDITED keeps the original in `position` and
	// the edit in `resolvedPosition`; navigation uses the edit, and so must
	// the spy ("UTENBERG" moved to the end of the book, marked in ch. II).
	it("resolves the edited region (resolvedPosition), like navigation", () => {
		const list = doc.createElement("div");
		list.className = "wv-outline-list";
		const row = doc.createElement("div");
		row.className = "wv-outline-row";
		row._wvOl = { entry: { id: "u", title: "u",
			position: { type: "CssSelector", value: "#original" },
			resolvedPosition: { type: "CssSelector", value: "#edited" } } };
		list.appendChild(row);
		let asked = null;
		const pv = {
			_iframeWindow: { innerHeight: 800 },
			toDisplayedRange: (p) => { asked = p.value; return { startContainer: { isConnected: true },
				getBoundingClientRect: () => ({ top: 10, left: 1, width: 5, height: 5 }) }; },
		};
		wv._wvOutlineSpyPickDom({ _internalReader: { _primaryView: pv } }, list);
		assert.equal(asked, "#edited");
	});

	it("a successful range is cached and reused", () => {
		const f = mkFixture();
		f.setLoaded(true);
		assert.strictEqual(wv._wvOutlineSpyPickDom(f.reader, f.list), f.row);
		f.setLoaded(false);                             // content 'unloads'...
		assert.strictEqual(wv._wvOutlineSpyPickDom(f.reader, f.list), f.row,
			"...but the cached RANGE keeps serving until a re-render clears it");
	});
});
