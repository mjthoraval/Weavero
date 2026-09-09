/* global describe, it, before, assert, Zotero */

// Filter-pane tile icons that have been confused with each other.
//
// "Linked File" (attachment row) and "Has Link" (top row) both showed a
// two-link chain -- one a hand-drawn data: URI, the other `_makeLinkTileSvg`
// -- and read as the same button (MJT 2026-09-09). Linked File now uses
// Zotero's own linked-file ITEM icon (page + chain badge), the sibling of
// the row's PDF/EPUB icons; the chain stays with Has Link alone.

describe("Weavero — filter tile icons", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || !wv._ATTACHMENT_FILE_TYPES) this.skip();
	});

	it("Linked File uses Zotero's linked-file item icon, not a chain", () => {
		const def = wv._ATTACHMENT_FILE_TYPES.find(d => d.value === "attachmentLinkedFile");
		assert.isOk(def, "pseudo-kind present");
		assert.include(def.icon, "item-type/16/light/attachment-link.svg");
		assert.notMatch(def.icon, /^data:/, "no hand-drawn glyph -- Zotero artwork verbatim");
	});

	it("that icon actually exists in the running Zotero (a typo would render nothing)", async () => {
		const def = wv._ATTACHMENT_FILE_TYPES.find(d => d.value === "attachmentLinkedFile");
		const win = Zotero.getMainWindow();
		const img = new win.Image();
		img.src = def.icon;
		await img.decode();
		assert.isAbove(img.naturalWidth, 0, "chrome:// resource resolved and decoded");
	});

	it("every other attachment kind keeps its Zotero item-type artwork", () => {
		for (const def of wv._ATTACHMENT_FILE_TYPES) {
			assert.match(def.icon, /^chrome:\/\/zotero\/skin\//, def.value + " points into Zotero's skin");
		}
	});
});
