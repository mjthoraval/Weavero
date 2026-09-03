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

	it("a successful range is cached and reused", () => {
		const f = mkFixture();
		f.setLoaded(true);
		assert.strictEqual(wv._wvOutlineSpyPickDom(f.reader, f.list), f.row);
		f.setLoaded(false);                             // content 'unloads'...
		assert.strictEqual(wv._wvOutlineSpyPickDom(f.reader, f.list), f.row,
			"...but the cached RANGE keeps serving until a re-render clears it");
	});
});
