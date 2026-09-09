/* global describe, it, before, assert, Zotero */

// Plugins Manager search box (2026-09-07) and its clear button (2026-09-09):
// cards filter by id / name / description as you type, Escape clears, and
// the × sits INSIDE the field's right edge, shows only while there is text,
// and clicking it clears, re-shows every card and keeps focus in the box --
// the quick search's own contract (searchTextbox.js `_clearSearch`).

describe("Weavero — Plugins Manager search box", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvPMInject !== "function") this.skip();
	});

	// A stand-in about:addons document (#main > addon-list > addon-card…) and
	// a stand-in viewer window: the real one owns a menubar and the Ctrl+F
	// wiring, both of which are guarded and no-op against this shape.
	const fixture = () => {
		const mw = Zotero.getMainWindow();
		const d = mw.document.implementation.createHTMLDocument("wv-pm-search-test");
		const main = d.createElement("div");
		main.id = "main";
		d.body.appendChild(main);
		const list = d.createElement("addon-list");
		main.appendChild(list);
		const cards = [
			["tree@x", "Tree Style Tabs", "organize your tabs in a tree"],
			["weavero@mjthoraval", "Weavero", "filters, links, bookmarks"],
			["bbt@x", "Better BibTeX", "citation keys"],
		];
		for (const [id, name, desc] of cards) {
			const card = /** @type {any} */ (d.createElement("addon-card"));
			card.setAttribute("addon-id", id);
			const n = d.createElement("h3");
			n.className = "addon-name";
			n.textContent = name;
			card.appendChild(n);
			const ds = d.createElement("div");
			ds.className = "addon-description";
			ds.textContent = desc;
			card.appendChild(ds);
			card.addon = { version: "1.0", updateDate: new Date() };
			list.appendChild(card);
		}
		const win = {
			document: d,
			MutationObserver: mw.MutationObserver,
			location: { href: "chrome://zotero/content/standalone/basicViewer.xhtml" },
		};
		wv._wvPMInject(win, d);
		const input = /** @type {any} */ (d.querySelector("#wv-pm-searchbox input"));
		const clear = d.getElementById("wv-pm-clear");
		const type = (s) => {
			input.value = s;
			input.dispatchEvent(new mw.Event("input", { bubbles: true }));
		};
		const visible = () => /** @type {any[]} */ ([...d.querySelectorAll("addon-card")])
			.filter(c => !c.hidden).map(c => c.getAttribute("addon-id"));
		return { d, input, clear, type, visible, mw };
	};

	it("filters cards by name, description or id as you type; Escape clears", () => {
		const { input, type, visible, mw } = fixture();
		assert.isOk(input, "search box injected");
		assert.deepEqual(visible(), ["tree@x", "weavero@mjthoraval", "bbt@x"]);
		type("tree");
		assert.deepEqual(visible(), ["tree@x"], "name match");
		type("citation");
		assert.deepEqual(visible(), ["bbt@x"], "description match");
		type("mjthoraval");
		assert.deepEqual(visible(), ["weavero@mjthoraval"], "id match");
		input.dispatchEvent(new mw.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		assert.equal(input.value, "", "Escape empties the box");
		assert.lengthOf(visible(), 3, "and every card is back");
	});

	it("the × sits inside the field and shows only while there is text", () => {
		const { input, clear, type } = fixture();
		assert.isOk(clear, "clear button injected");
		assert.equal(clear.previousElementSibling, input, "same field as the input, after it");
		assert.isTrue(clear.hidden, "hidden while the box is empty");
		type("tree");
		assert.isFalse(clear.hidden, "shown once there is text");
		type("");
		assert.isTrue(clear.hidden, "hidden again when the text goes");
	});

	it("clicking the × clears the box and re-shows every card", () => {
		const { input, clear, type, visible } = fixture();
		type("bib");
		assert.lengthOf(visible(), 1);
		clear.click();
		assert.equal(input.value, "");
		assert.lengthOf(visible(), 3, "filter lifted");
		assert.isTrue(clear.hidden, "and the × goes away with the text");
	});

	it("uses the quick search's own clear icon, in currentColor, with no hover background or fade", () => {
		const { d, clear } = fixture();
		const img = clear.querySelector("img");
		assert.isOk(img);
		assert.include(img.getAttribute("src"), "close-12.svg", "search-textbox.css .textbox-search-clear");
		assert.equal(clear.getAttribute("title"), "Clear");
		// Zotero's .textbox-search-clear: opacity 1, transparent in every
		// state, 12px glyph in a 14px slot on a 28px field -- scaled to this
		// 33px field that is a 14px glyph in a 16px slot (MJT 2026-09-09).
		const css = d.getElementById("wv-pm-search-styles").textContent;
		assert.notMatch(css, /opacity/, "no fade");
		assert.notMatch(css, /color-mix/, "no hover tint");
		assert.match(css, /#wv-pm-clear:hover[^{]*\{[^}]*background:\s*none/, "hover stays transparent");
		assert.match(css, /#wv-pm-clear\s*>\s*img\s*\{[^}]*width:\s*14px/, "glyph scaled to the field");
	});

	it("re-injecting after a teardown replaces the rules instead of keeping a stale sheet", () => {
		// A hot reload injects the NEW build into a window the OLD build
		// styled. dev.21's min-size fix stayed invisible until the <style>
		// was replaced, not skipped.
		const { d } = fixture();
		const stale = d.getElementById("wv-pm-search-styles");
		stale.textContent = "#wv-pm-clear { color: red; }";
		d.getElementById("wv-pm-searchbox").remove();   // what the teardown does
		wv._wvPMInject({ document: d, MutationObserver: Zotero.getMainWindow().MutationObserver,
			location: { href: "chrome://zotero/content/standalone/basicViewer.xhtml" } }, d);
		const sheets = d.querySelectorAll("#wv-pm-search-styles");
		assert.lengthOf(sheets, 1, "one sheet, not two");
		assert.notInclude(sheets[0].textContent, "color: red", "the stale rules are gone");
		assert.include(sheets[0].textContent, "min-width: 0", "the current rules are in");
	});

	it("resets about:addons' button min-size so the × stays 20px, not a 6.3em slab", () => {
		const { d } = fixture();
		const css = d.getElementById("wv-pm-search-styles").textContent;
		assert.match(css, /#wv-pm-clear\s*\{[^}]*min-width:\s*0/, "min-width beats width; must be reset");
		assert.match(css, /#wv-pm-clear\s*\{[^}]*min-height:\s*0/);
	});
});
