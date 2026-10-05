/* global describe, it, before, assert, Zotero */

// Desktop button side changed while windows are open (2026-10-01): Gecko
// sends `look-and-feel-changed`, but some open windows never re-evaluate their
// media rules -- the Plugins Manager kept the old side for Weavero's AND
// Zotero's own title-bar rules. _wvWireCsdRefresh nudges (full-zoom round trip
// in one task) only the windows whose `--wv-csd-rev` probe disagrees with
// matchMedia. The runner cannot change the GTK setting, so staleness is
// simulated by pinning the probe to the wrong value.

describe("Weavero -- window chrome re-evaluated after a button-side change", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv) this.skip();
		// Not a skip when the method is missing: its absence IS the regression.
		assert.isFunction(wv._wvRefreshStaleCsdWindows, "the stale-window nudge exists");
	});

	it("the look-and-feel observer is registered and stamped with this build", () => {
		const obs = /** @type {any} */ (Zotero)._wvCsdRefreshObs;
		assert.isOk(obs, "observer registered");
		assert.equal(obs._wvTag, wv._wvWireTag(), "stamped with the live instance's tag");
	});

	it("leaves windows alone when their rules match, nudges a stale one and restores its zoom", () => {
		const win = Zotero.getMainWindow(), doc = win.document;
		const H = "http://www.w3.org/1999/xhtml";
		const want = win.matchMedia("(-moz-gtk-csd-reversed-placement)").matches ? "1" : "0";
		const probe = doc.createElementNS(H, "style");
		probe.id = "wv-test-csd-probe";
		doc.documentElement.appendChild(probe);
		const zoom = win.browsingContext.fullZoom;
		try {
			// A window whose rules are current: never touched.
			probe.textContent = ":root { --wv-csd-rev: " + want + " !important; }";
			const before = wv._wvRefreshStaleCsdWindows();
			assert.equal(before, 0, "no window nudged while every probe matches");
			// The same window evaluated for the other side: nudged once.
			probe.textContent = ":root { --wv-csd-rev: " + (want === "1" ? "0" : "1") + " !important; }";
			const n = wv._wvRefreshStaleCsdWindows();
			assert.isAtLeast(n, 1, "the stale window was nudged");
			assert.strictEqual(win.browsingContext.fullZoom, zoom, "zoom restored exactly");
		}
		finally {
			probe.remove();
		}
	});
});
