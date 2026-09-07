/* global afterEach, Zotero, Services */

// Root-level failure recorder (2026-09-07). The scaffold's injected reporter
// posts failures as JSON — and `JSON.stringify(new Error(...))` is `{}`
// (message/stack are non-enumerable), so every non-chai failure reaches the
// terminal as ", undefined" with an Expected/Received of undefined. Until
// that's fixed upstream (zotero-plugin-scaffold mocha-setup `send({... error
// ...})`), this root afterEach writes the REAL message + stack of every
// failed test to a repo-local file (compat runs export the repo path) and to
// Zotero.debug.
//
// Named 000-* so the bundler stages it first; the top-level hook attaches to
// mocha's root suite and covers every spec file.

afterEach(function () {
	try {
		const t = this.currentTest;
		if (!t || t.state !== "failed") return;
		const err = /** @type {any} */ (t.err || {});
		const line = new Date().toISOString() + " FAILED: " + t.fullTitle()
			+ "\n  message: " + String(err.message)
			+ "\n  stack:   " + String(err.stack || "(none)").split("\n").slice(0, 6).join("\n           ")
			+ "\n";
		try { Zotero.debug("[wv-test-diag] " + line); } catch (e) {}
		let xdir = null;
		try { xdir = Services.env.get("WV_COMPAT_XPI_DIR"); } catch (e) {}
		if (xdir) {
			const dest = PathUtils.join(PathUtils.parent(xdir), "last-errors.log");
			IOUtils.writeUTF8(dest, line, { mode: "appendOrCreate" }).catch(() => {});
		}
	} catch (e) {}
});
