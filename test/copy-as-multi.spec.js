/* global describe, it, before, after, assert, Zotero */

// Tab-menu copies honour the tab MULTI-selection (2026-09-03).
//
// Move/Close/Pin/Duplicate acted on the whole Weavero tab selection, but every
// "Copy As" entry (Citation / Bibliography / links / BBT) acted on the clicked
// tab only — "Quick copy only copies the citation of one tab when several tabs
// are selected". Two halves, both guarded here:
//
//   1. `_wvTabCtxTargetItems(win, tabID)` — the main-window resolution: the
//      items of ALL selected tabs when the clicked tab is part of a >1-tab
//      selection (tab-bar order, duplicates collapsed), else null so the
//      caller falls back to the single native ctx item.
//   2. `_wvBuildCopyAsSubmenu` (shared with the reader-window strip menu)
//      accepts an ARRAY getter and routes every item into the copy action,
//      citing attachments through their parents.

describe("Weavero — tab-menu Copy As is multi-select aware", () => {
	let wv, itemA, itemB, attA, attB;

	before(async function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvTabCtxTargetItems !== "function") this.skip();
		const lib = Zotero.Libraries.userLibraryID;

		itemA = new Zotero.Item("journalArticle");
		itemA.libraryID = lib;
		itemA.setField("title", "WV-TEST copyas parent A");
		await itemA.saveTx();

		itemB = new Zotero.Item("journalArticle");
		itemB.libraryID = lib;
		itemB.setField("title", "WV-TEST copyas parent B");
		await itemB.saveTx();

		// Reader tabs hold ATTACHMENTS — the citation must route to parents.
		attA = new Zotero.Item("attachment");
		attA.libraryID = lib;
		attA.parentID = itemA.id;
		attA.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
		attA.attachmentContentType = "application/pdf";
		attA.setField("title", "WV-TEST copyas att A");
		await attA.saveTx();

		attB = new Zotero.Item("attachment");
		attB.libraryID = lib;
		attB.parentID = itemB.id;
		attB.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
		attB.attachmentContentType = "application/pdf";
		attB.setField("title", "WV-TEST copyas att B");
		await attB.saveTx();
	});

	after(async () => {
		for (const it of [itemA, itemB]) {
			try { if (it) await it.eraseTx(); } catch (e) {}
		}
	});

	// A plain object is enough: the resolver only reads _wvSelTabIDs and
	// Zotero_Tabs._tabs — the same shape the real main window exposes.
	const stubWin = (selIds, tabs) => ({
		_wvSelTabIDs: new Set(selIds),
		Zotero_Tabs: { _tabs: tabs },
	});
	const libTab = { id: "zotero-pane", type: "library", data: {} };
	const tabOf = (id, itemID) => ({ id, type: "reader", data: { itemID } });

	describe("_wvTabCtxTargetItems (main-window resolution)", () => {
		it("resolves the WHOLE selection when the clicked tab is in it", () => {
			const win = stubWin(["t1", "t2"],
				[libTab, tabOf("t1", attA.id), tabOf("t2", attB.id)]);
			const items = wv._wvTabCtxTargetItems(win, "t1");
			assert.ok(items, "a 2-tab selection must resolve");
			assert.deepEqual(items.map(i => i.id), [attA.id, attB.id]);
		});

		it("keeps tab-bar order regardless of selection-click order", () => {
			const win = stubWin(["t2", "t1"],   // selected right-to-left
				[libTab, tabOf("t1", attA.id), tabOf("t2", attB.id)]);
			const items = wv._wvTabCtxTargetItems(win, "t2");
			assert.deepEqual(items.map(i => i.id), [attA.id, attB.id],
				"tab-bar order, not Set insertion order");
		});

		it("returns null when the clicked tab is OUTSIDE the selection", () => {
			const win = stubWin(["t1", "t2"],
				[libTab, tabOf("t1", attA.id), tabOf("t2", attB.id), tabOf("t3", attB.id)]);
			assert.isNull(wv._wvTabCtxTargetItems(win, "t3"),
				"right-clicking an unselected tab acts on that tab alone");
		});

		it("returns null for a single-tab selection (native ctx fallback)", () => {
			const win = stubWin(["t1"], [libTab, tabOf("t1", attA.id)]);
			assert.isNull(wv._wvTabCtxTargetItems(win, "t1"));
		});

		it("collapses duplicate tabs of the same item", () => {
			const win = stubWin(["t1", "t2"],
				[libTab, tabOf("t1", attA.id), tabOf("t2", attA.id)]);
			const items = wv._wvTabCtxTargetItems(win, "t1");
			assert.deepEqual(items.map(i => i.id), [attA.id],
				"one copy per item, not per tab");
		});
	});

	describe("_wvBuildCopyAsSubmenu (shared reader/note builder)", () => {
		const buildAndFire = (getItems, label) => {
			const doc = Zotero.getMainWindow().document;
			const popup = doc.createXULElement("menupopup");
			const captured = [];
			// Shadow the copy action on the instance; delete restores the
			// prototype method.
			wv._copyCitationOrBibliography = (arr) => { captured.push(arr.map(i => i.id)); };
			try {
				wv._wvBuildCopyAsSubmenu(doc, popup, getItems);
				const entry = [...popup.children].find(
					el => el.getAttribute && el.getAttribute("label") === label);
				assert.ok(entry, label + " entry must be built");
				const ev = doc.createEvent("Event");
				ev.initEvent("command", true, true);
				entry.dispatchEvent(ev);
			}
			finally {
				delete wv._copyCitationOrBibliography;
			}
			return captured;
		};

		it("routes ALL items of an array getter into Citation, via parents", () => {
			const captured = buildAndFire(() => [attA, attB], "Citation");
			assert.lengthOf(captured, 1, "one copy call");
			assert.deepEqual(captured[0], [itemA.id, itemB.id],
				"both attachments cited through their PARENTS");
		});

		it("dedupes two attachments of the same parent", () => {
			const captured = buildAndFire(() => [attA, attA], "Bibliography");
			assert.deepEqual(captured[0], [itemA.id]);
		});

		it("still accepts a single-item getter (reader fallback path)", () => {
			const captured = buildAndFire(() => attA, "Citation");
			assert.deepEqual(captured[0], [itemA.id]);
		});
	});

	// The Ctrl+Shift+A/C quick-copy shortcuts route through
	// ZoteroPane.copySelectedItemsToClipboard, whose native getSelectedItems
	// returns ONLY the active tab's item. The wrap feeds the whole tab
	// multi-selection through the ORIGINAL logic by shadowing the two getters
	// it reads — saved-and-restored, never deleted (own props, no prototype
	// fallback). Everything it touches lives on the window, so a stub window
	// exercises the real wrap end to end.
	describe("_wvWireQuickCopyMultiTab (Ctrl+Shift+A/C shortcut path)", () => {
		const SENTINEL = [999];
		const mkStubWin = (selIds, tabs, activeTabID) => {
			const calls = [];
			const rawCopy = function (asCitations) {
				// What upstream reads, at call top, through `this`.
				calls.push({
					sel: this.getSelectedItems(true),
					sort: this.getSortedItems(true),
					asCitations,
				});
			};
			const win = {
				_wvSelTabIDs: new Set(selIds),
				Zotero_Tabs: { selectedID: activeTabID, _tabs: tabs },
				ZoteroPane: {
					getSelectedItems: asIDs => (asIDs ? SENTINEL.slice() : []),
					getSortedItems: asIDs => (asIDs ? SENTINEL.slice() : []),
					copySelectedItemsToClipboard: rawCopy,
				},
			};
			return { win, calls, rawCopy };
		};
		const libTab2 = { id: "zotero-pane", type: "library", data: {} };
		const rTab = (id, itemID) => ({ id, type: "reader", data: { itemID } });

		it("copies ALL selected tabs' items, routed through parents", function () {
			if (typeof wv._wvWireQuickCopyMultiTab !== "function") this.skip();
			const { win, calls } = mkStubWin(["t1", "t2"],
				[libTab2, rTab("t1", attA.id), rTab("t2", attB.id)], "t1");
			wv._wvWireQuickCopyMultiTab(win);
			win.ZoteroPane.copySelectedItemsToClipboard(true);
			assert.lengthOf(calls, 1, "original logic must still run");
			assert.deepEqual(calls[0].sel, [itemA.id, itemB.id],
				"getSelectedItems shadowed to the selection, attachment→parent");
			assert.deepEqual(calls[0].sort, [itemA.id, itemB.id]);
			assert.isTrue(calls[0].asCitations, "asCitations passed through");
		});

		it("restores the shadowed getters after the call", function () {
			if (typeof wv._wvWireQuickCopyMultiTab !== "function") this.skip();
			const { win } = mkStubWin(["t1", "t2"],
				[libTab2, rTab("t1", attA.id), rTab("t2", attB.id)], "t1");
			wv._wvWireQuickCopyMultiTab(win);
			win.ZoteroPane.copySelectedItemsToClipboard(false);
			assert.deepEqual(win.ZoteroPane.getSelectedItems(true), SENTINEL,
				"getSelectedItems must be the ORIGINAL again after the copy");
			assert.deepEqual(win.ZoteroPane.getSortedItems(true), SENTINEL);
		});

		it("leaves the native path untouched without a multi-selection", function () {
			if (typeof wv._wvWireQuickCopyMultiTab !== "function") this.skip();
			const { win, calls } = mkStubWin(["t1"],
				[libTab2, rTab("t1", attA.id)], "t1");
			wv._wvWireQuickCopyMultiTab(win);
			win.ZoteroPane.copySelectedItemsToClipboard(true);
			assert.deepEqual(calls[0].sel, SENTINEL,
				"single selection → native getSelectedItems governs");
		});

		it("leaves the library tab untouched even with tabs selected", function () {
			if (typeof wv._wvWireQuickCopyMultiTab !== "function") this.skip();
			const { win, calls } = mkStubWin(["t1", "t2"],
				[libTab2, rTab("t1", attA.id), rTab("t2", attB.id)], "zotero-pane");
			wv._wvWireQuickCopyMultiTab(win);
			win.ZoteroPane.copySelectedItemsToClipboard(true);
			assert.deepEqual(calls[0].sel, SENTINEL,
				"library tab active → items-tree selection governs");
		});

		it("wires once per build and unwires back to the raw function", function () {
			if (typeof wv._wvWireQuickCopyMultiTab !== "function") this.skip();
			const { win, rawCopy } = mkStubWin(["t1", "t2"],
				[libTab2, rTab("t1", attA.id), rTab("t2", attB.id)], "t1");
			wv._wvWireQuickCopyMultiTab(win);
			wv._wvWireQuickCopyMultiTab(win);   // second wire must be a no-op
			assert.strictEqual(win.ZoteroPane._wvOrigCopySelectedToClipboard, rawCopy,
				"saved original must be the RAW function, not a wrapper");
			wv._wvUnwireQuickCopyMultiTab(win);
			assert.strictEqual(win.ZoteroPane.copySelectedItemsToClipboard, rawCopy,
				"unwire must restore the raw function");
		});
	});
});
