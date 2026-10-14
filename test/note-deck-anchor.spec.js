/* global describe, it, before, after, assert, Zotero, wvT */

// Opening a note in a deck window bootstraps a reader window on a throwaway
// ANCHOR attachment, mounts the note, then closes the anchor's tab. The anchor
// must never be a document the user has open in a reader window -- including one
// whose window is still loading (Ubuntu campaign 2026-10-13): a note window opened
// right after a reader window took that PDF (the parent's attachment is the
// PREFERRED anchor) and closed it; the user's PDF window was gone, 3 of 3 at 0 ms.
// A session restore reopening a PDF window and its child note's deck back to back
// is the real-world trigger.
describe("Weavero — a note's deck anchor is never a document open in a reader window", () => {
	let wv, parent, pdf, note, reader = null;

	before(async function () {
		this.timeout(30000);
		wv = wvT.plugin();
		if (!wv) wvT.absent("plugin");
		wvT.method("_wvPickNoteDeckAnchor");
		parent = await wvT.createItem("journalArticle", { title: "WV-TEST deck anchor parent" });
		pdf = await wvT.createTestPDFItem("wv-deck-anchor", { parentItemID: parent.id });
		note = new Zotero.Item("note");
		note.libraryID = parent.libraryID;
		note.parentID = parent.id;
		note.setNote("<p>WV-TEST deck anchor note</p>");
		await note.saveTx();
	});
	after(async function () {
		this.timeout(15000);
		try { if (reader && reader._window && !reader._window.closed) reader._window.close(); } catch (e) {}
		await wvT.sleep(500);
		await wvT.erase(note, pdf, parent);
	});

	it("with no reader open, the parent's attachment is the anchor (the preference holds)", async function () {
		const id = await wv._wvPickNoteDeckAnchor(note);
		assert.equal(id, pdf.id);
	});

	it("right after Reader.open(openInWindow) resolves, that document is not taken as the anchor", async function () {
		this.timeout(20000);
		reader = await Zotero.Reader.open(pdf.id, null, { openInWindow: true });
		const id = await wv._wvPickNoteDeckAnchor(note);   // no wait: the window is still loading
		assert.notEqual(id, pdf.id, "the anchor would close the user's freshly opened PDF window");
	});
});
