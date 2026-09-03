/* global describe, it, before, after, assert, Zotero */

// Context-menu handlers must ignore popup events bubbled up from descendant
// submenus (issue #8, fixed v0.11.4 for pane.ts; REGRESSED 2026-09-03 in the
// entries added since).
//
// XUL popupshowing/popuphidden BUBBLE. A handler on a parent context menu that
// strips its injected entry on popuphidden also fires when a descendant
// submenu (native Move To / Copy To, Weavero's Copy As) closes on cursor-move
// — the entry "disappears" while the menu is still open, and reappears when
// the submenu next opens. Reported on the collections menu ("Bookmark
// Collection" vanishing, issue #8 reopen); the same unguarded pattern sat on
// the items menu ("Open by Default") and, worse, on the bookmark row/folder/
// empty popups, whose {once:true} remove-the-menu listener nuked the WHOLE
// open menu on submenu hover-off.
//
// The contract: only the parent menu's OWN lifecycle counts — every handler
// early-returns unless ev.target === menu.

describe("Weavero — context-menu handlers ignore bubbled submenu events", () => {
	let wv, win, doc;

	const fire = (type, target) => {
		const ev = doc.createEvent("Event");
		ev.initEvent(type, true, true);   // bubbles, like the real popup events
		target.dispatchEvent(ev);
	};

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv) this.skip();
		win = Zotero.getMainWindow();
		doc = win.document;
	});

	describe("collections menu — Bookmark Collection/Library (the #8 reopen)", () => {
		let menu, sub;
		const ID = "wv-collectionmenu-bookmark";

		before(function () {
			menu = doc.getElementById("zotero-collectionmenu");
			if (!menu || typeof wv._setupCollectionsBookmarkMenu !== "function") this.skip();
			// A submenu stand-in: a child menupopup whose events bubble to menu.
			sub = doc.createXULElement("menupopup");
			menu.appendChild(sub);
		});

		after(() => {
			try { sub && sub.remove(); } catch (e) {}
			try { fire("popuphidden", menu); } catch (e) {}   // leave the menu clean
		});

		it("popupshowing on the menu itself injects the entry", function () {
			fire("popupshowing", menu);
			// Default harness selection is the My Library row -> "Bookmark
			// Library"; a selected collection gives "Bookmark Collection".
			// Either way the injected node carries the shared id.
			if (!doc.getElementById(ID)) this.skip();   // no bookmarkable row selected
			assert.ok(doc.getElementById(ID));
		});

		it("a SUBMENU's popuphidden must not strip the entry", function () {
			if (!doc.getElementById(ID)) this.skip();
			fire("popuphidden", sub);                    // bubbles up to menu
			assert.ok(doc.getElementById(ID),
				"entry must survive a descendant submenu closing (issue #8)");
		});

		it("a SUBMENU's popupshowing must not rebuild/duplicate the entry", function () {
			if (!doc.getElementById(ID)) this.skip();
			fire("popupshowing", sub);
			const nodes = doc.querySelectorAll("#" + ID);
			assert.equal(nodes.length, 1, "exactly one entry after a submenu open");
		});

		it("the MENU's own popuphidden still removes the entry", function () {
			if (!doc.getElementById(ID)) this.skip();
			fire("popuphidden", menu);
			assert.isNull(doc.getElementById(ID),
				"the real cleanup path must keep working");
		});
	});

	describe("items menu — Open by Default", () => {
		let menu, sub, parent, att;
		const ID = "wv-itemmenu-open-by-default";

		before(async function () {
			menu = doc.getElementById("zotero-itemmenu");
			if (!menu) this.skip();
			const lib = Zotero.Libraries.userLibraryID;
			parent = new Zotero.Item("journalArticle");
			parent.libraryID = lib;
			parent.setField("title", "WV-TEST bubble-guard parent");
			await parent.saveTx();
			att = new Zotero.Item("attachment");
			att.libraryID = lib;
			att.parentID = parent.id;
			att.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
			att.attachmentContentType = "application/pdf";
			att.setField("title", "WV-TEST bubble-guard att");
			await att.saveTx();
			// The entry appears only for a single selected openable CHILD.
			await win.ZoteroPane.selectItem(att.id);
			sub = doc.createXULElement("menupopup");
			menu.appendChild(sub);
		});

		after(async () => {
			try { sub && sub.remove(); } catch (e) {}
			try { fire("popuphidden", menu); } catch (e) {}
			try { if (parent) await parent.eraseTx(); } catch (e) {}
		});

		it("survives a submenu's bubbled popuphidden, dies on the menu's own", function () {
			fire("popupshowing", menu);
			if (!doc.getElementById(ID)) this.skip();   // feature off or wiring absent
			fire("popuphidden", sub);
			assert.ok(doc.getElementById(ID),
				"Open by Default must survive a submenu closing (issue #8 family)");
			fire("popuphidden", menu);
			assert.isNull(doc.getElementById(ID));
		});
	});
});
