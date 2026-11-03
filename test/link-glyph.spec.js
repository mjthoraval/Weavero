/* global describe, it, before, assert, Zotero, wvT */

// One links glyph across the plugin (MJT 2026-10-23): "The icon is not
// appropriate. You have used the related icon shape instead of the links
// shape. I also want to change the linked icon shape, as it is the same as
// Weavero, and can be misleading. The same shape as the Weavero icon
// without the needle and line would be nice." Then: "Update the Has Link
// icon in all the filters popups. Also make sure that all icons are
// consistent across all filter popups."
//
// So: the link marker, the Has Link tile of every filter popup and the
// Backlinks icon all draw the two chain links of src/icons/icon.svg --
// never the needle or thread, never Zotero's two-link chain (related.svg,
// which IS Zotero's Related icon; link.svg holds the same path).

const RELATED_PATH_HEAD = "M12.5 13H8.5";    // Zotero related.svg / link.svg
const NEEDLE_PATH_HEAD = "M0,0c4.92";        // icon.svg needle body
const THREAD_PATH_HEAD = "M12.63,18.34";     // icon.svg thread

describe("Weavero — one links glyph: the logo's chain, without needle or thread", function () {
	let wv, lib, doc;

	before(function () {
		wv = wvT.plugin();
		lib = Zotero.Weavero && Zotero.Weavero.lib;
		if (!lib || !lib.WV_LINK_CHAIN_PATHS) wvT.absent("!lib.WV_LINK_CHAIN_PATHS");
		doc = Zotero.getMainWindow().document;
	});

	const pathsOf = (svg) => [...svg.querySelectorAll("path")].map(p => p.getAttribute("d"));

	it("the link marker is the chain alone: no needle, no thread, no ellipse", function () {
		const svg = wv._makeLinkSvg(doc);
		assert.isTrue(svg.classList.contains("wv-link-svg"));
		assert.deepEqual(pathsOf(svg), lib.WV_LINK_CHAIN_PATHS);
		assert.strictEqual(svg.querySelectorAll("ellipse").length, 0, "the needle's eye");
		const all = svg.outerHTML;
		assert.notInclude(all, NEEDLE_PATH_HEAD);
		assert.notInclude(all, THREAD_PATH_HEAD);
		assert.notInclude(all, RELATED_PATH_HEAD);
	});

	// Has External Link (renamed from Has Link 2026-10-30) gets its own icon:
	// the box with an arrow out, "a link that leaves Zotero" (MJT 2026-10-30,
	// "Make a special icon for Has External Link" -> "B: box + arrow out");
	// the chain stays the link marker's and Has Item Links'. The chain until
	// dev.130.
	it("the Has External Link tile draws the box with the arrow out, every node unfilled (the tile CSS floods fill)", function () {
		const svg = wv._makeLinkTileSvg(doc);
		assert.isTrue(svg.classList.contains("wv-filter-svg"));
		assert.deepEqual(pathsOf(svg), lib.WV_EXTLINK_PATHS);
		assert.notInclude(svg.outerHTML, lib.WV_LINK_CHAIN_PATHS[0], "not the chain");
		assert.strictEqual(svg.querySelectorAll("rect").length, 0, "not the old rectangles");
		for (const n of svg.querySelectorAll("g, path")) assert.strictEqual(n.getAttribute("fill"), "none", n.tagName + " sets fill=none itself");
		for (const n of svg.querySelectorAll("g, path")) {
			if (n.tagName === "path" && n.parentNode.tagName === "g") continue;
			assert.isOk(n.getAttribute("stroke"), n.tagName + " carries its own stroke");
		}
	});

	it("the reader's annotation filter builds Has Link with the same tile builder", function () {
		const fn = wv._wvRenderReaderFilterPopup;
		if (typeof fn !== "function") this.skip();
		const src = fn.toString();
		assert.include(src, "_makeLinkTileSvg", "the library tile's builder");
		assert.notInclude(src, "_makeLinkSvg(", "not the comment marker");
	});

	it("the Backlinks icon is the links glyph plus an arrow, not Zotero's Related chain", function () {
		const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
		const col = cols.find((c) => /weaveroBacklinks$/.test(String(c.dataKey)));
		if (!col) this.skip();
		const svg = decodeURIComponent(String(col.iconPath).replace(/^data:image\/svg\+xml,/, ""));
		for (const d of lib.WV_LINK_CHAIN_PATHS) assert.include(svg, d);
		assert.include(svg, lib.WV_BACKLINK_ARROW_PATH);
		assert.notInclude(svg, RELATED_PATH_HEAD, "Zotero's related.svg path means Related");
		assert.include(svg, 'stroke="context-fill"', "themes through the header's context paint");
	});

	it("the Links column's icon is the same chain with the arrow OUT (slice 2, 2026-10-27)", function () {
		const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
		const col = cols.find((c) => /weaveroLinks$/.test(String(c.dataKey)));
		assert.isOk(col, "the Links column is registered");
		const svg = decodeURIComponent(String(col.iconPath).replace(/^data:image\/svg\+xml,/, ""));
		for (const d of lib.WV_LINK_CHAIN_PATHS) assert.include(svg, d);
		assert.include(svg, lib.WV_OUTLINK_ARROW_PATH);
		assert.notInclude(svg, lib.WV_BACKLINK_ARROW_PATH, "not the arrow in");
		assert.include(svg, 'stroke="context-fill"');
	});

	// MJT 2026-10-23, "Ok" to switching the copy-link menu entries from the
	// Weavero logo to the links icon.
	it("copy-link menu entries carry the links glyph, not the logo", function () {
		const icon = decodeURIComponent(String(lib.WV_LINK_MENU_ICON).replace(/^data:image\/svg\+xml,/, ""));
		for (const d of lib.WV_LINK_CHAIN_PATHS) assert.include(icon, d);
		assert.include(icon, 'stroke="context-fill"', "painted by Zotero's menu icon rule");
		// The reader's React context menu, decorated by label.
		const host = /** @type {any} */ (doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
		host.className = "context-menu";
		const row = /** @type {any} */ (doc.createElementNS("http://www.w3.org/1999/xhtml", "div"));
		row.className = "row basic";
		row.textContent = "Copy Select Link";
		host.appendChild(row);
		doc.documentElement.appendChild(host);
		try {
			assert.strictEqual(wv.decorateContextMenu(doc), 1);
			const svg = row.querySelector(".icon svg");
			assert.isOk(svg, "an inline glyph, not the logo's <img>");
			assert.deepEqual(pathsOf(svg), lib.WV_LINK_CHAIN_PATHS);
			assert.isNull(row.querySelector(".icon img"));
		} finally { host.remove(); }
	});

	it("the glyph's data URI decodes in the running Zotero", async function () {
		const win = Zotero.getMainWindow();
		for (const back of [false, true]) {
			const img = new win.Image();
			img.src = lib.wvLinkGlyphUri("context-fill", 16, back);
			await img.decode();
			assert.isAbove(img.naturalWidth, 0, (back ? "backlinks" : "links") + " glyph parsed");
		}
	});
});
