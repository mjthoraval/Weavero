/* global describe, it, before, assert, Zotero */

// Filter-pane tile icons that have been confused with each other.
//
// "Linked File" (attachment row) and "Has Link" (top row) both showed a
// two-link chain -- one a hand-drawn data: URI, the other `_makeLinkTileSvg`
// -- and read as the same button (MJT 2026-09-09). Linked File now uses
// Zotero's own linked-file ITEM artwork -- the page outline + chain badge
// of item-type/16/dark/attachment-link.svg (transparent page; the light
// file's white slab looked wrong on the dark popup) -- recoloured through
// context-fill so it themes like the other monochrome tiles. The bare
// chain stays with Has Link alone.

// Chain badge path of Zotero's attachment-link.svg (both variants).
const ZOTERO_CHAIN_BADGE = "M9.5 11C10.3178 11 11.0439 11.3927 11.5 11.9998";
// Page outline of the DARK variant (the light one is a filled slab).
const ZOTERO_PAGE_OUTLINE = "M6 14H3V1H9V6H14V10H15V5.293L9.707 0L2 0V15H6V14Z";

describe("Weavero — filter tile icons", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || !wv._ATTACHMENT_FILE_TYPES) this.skip();
	});

	it("Linked File is Zotero's transparent page + chain badge in currentColor", () => {
		const def = wv._ATTACHMENT_FILE_TYPES.find(d => d.value === "attachmentLinkedFile");
		assert.isOk(def, "pseudo-kind present");
		assert.match(def.icon, /^data:image\/svg\+xml/);
		assert.include(def.icon, ZOTERO_PAGE_OUTLINE, "the dark variant's page outline, verbatim");
		assert.include(def.icon, ZOTERO_CHAIN_BADGE, "Zotero's chain badge, verbatim");
		assert.include(def.icon, "fill='context-fill'", "themes through .wv-filter-svg");
		assert.notInclude(def.icon, "fill='white'", "no white slab");
		assert.notInclude(def.icon, "<rect", "not the old hand-drawn chain");
	});

	it("that icon decodes in the running Zotero (a broken URI would render nothing)", async () => {
		const def = wv._ATTACHMENT_FILE_TYPES.find(d => d.value === "attachmentLinkedFile");
		const win = Zotero.getMainWindow();
		const img = new win.Image();
		img.src = def.icon;
		await img.decode();
		assert.isAbove(img.naturalWidth, 0, "SVG parsed and decoded");
	});

	it("every other attachment kind keeps its Zotero item-type artwork", () => {
		for (const def of wv._ATTACHMENT_FILE_TYPES) {
			if (def.value === "attachmentLinkedFile") continue;
			assert.match(def.icon, /^chrome:\/\/zotero\/skin\//, def.value + " points into Zotero's skin");
		}
	});
});
