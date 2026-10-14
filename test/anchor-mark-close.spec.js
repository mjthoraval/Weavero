/* global describe, it, before, after, assert, Zotero, wvT */

// The anchor window's in-window mark (root class `wv-anchor-window`: the ⚓
// in the compact title bar's spacer, "(anchor)" in its tooltip) shows only
// while more than one main or reader window is open. Opening a window
// re-evaluated it; CLOSING one did so only for Weavero's managed windows and,
// on Windows, through the taskbar overlay's close-repair pass. On Linux the
// ⚓ stayed on a lone main window after a reader window or a natively opened
// main window closed (Ubuntu 2026-10-14). Guard for
// _wvWireWindowCloseIndicators.
//
// Each window is FULLY LOADED before the mark is read: with a stale mark the
// wait returned at once and the test closed the second main window while
// Zotero was still initializing it -- its context pane and tab observers
// stayed registered on the dead window, and the next item erase never
// finished (the after hook timed out; pre-fix A/B runs, 2026-10-14).
describe("Weavero — the anchor mark follows the window count when a window closes", () => {
	let wv, win, parent, pdf;
	const anchored = () => win.document.documentElement.classList.contains("wv-anchor-window");

	before(async function () {
		this.timeout(30000);
		wv = wvT.plugin();
		if (!wv) wvT.absent("plugin");
		wvT.method("_wvWireWindowCloseIndicators");
		win = Zotero.getMainWindow();
		await wvT.settleSecondaryWindows();
		parent = await wvT.createItem("journalArticle", { title: "WV-TEST anchor mark parent" });
		pdf = await wvT.createTestPDFItem("wv-anchor-mark", { parentItemID: parent.id });
	});
	after(async function () {
		this.timeout(15000);
		wvT.purgeDeadReaders();   // also when an assertion skipped the in-test purge
		await wvT.erase(pdf, parent);
	});

	it("one window: no anchor mark", () => {
		assert.isFalse(anchored());
	});

	it("a reader window: marked while it is open, unmarked once it closes", async function () {
		this.timeout(40000);
		const reader = await Zotero.Reader.open(pdf.id, null, { openInWindow: true });
		const rw = reader && reader._window;
		assert.isOk(rw, "reader window opened");
		try {
			await reader._initPromise;
			assert.isOk(await wvT.waitFor(anchored, 15000), "marked while the reader window is open");
		}
		finally {
			try { rw.close(); } catch (e) {}
		}
		assert.isOk(await wvT.waitFor(() => !anchored(), 3000), "unmarked after the reader window closed");
		wvT.purgeDeadReaders();
	});

	it("a second main window opened natively: marked while it is open, unmarked once it closes", async function () {
		this.timeout(40000);
		const existing = new Set(Zotero.getMainWindows());
		Zotero.openMainWindow();
		const w2 = await wvT.waitFor(() => Zotero.getMainWindows().find(w => !existing.has(w)), 15000);
		assert.isOk(w2, "second main window opened");
		// The first window keeps focus while the second one loads (tests.md).
		try { win.focus(); } catch (e) {}
		try {
			assert.isOk(await wvT.waitFor(() => w2.document.readyState === "complete"
				&& w2.ZoteroPane && w2.ZoteroPane.itemsView && w2.ZoteroPane.collectionsView, 20000),
				"second main window loaded");
			assert.isNotOk(w2._wvManagedWindow, "a native window, not a Weavero-managed one");
			assert.isOk(await wvT.waitFor(anchored, 10000), "marked while two main windows are open");
		}
		finally {
			try { win.focus(); } catch (e) {}
			try { w2.close(); } catch (e) {}
		}
		assert.isOk(await wvT.waitFor(() => !anchored(), 3000), "unmarked after the second main window closed");
	});
});
