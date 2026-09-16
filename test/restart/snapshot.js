/* Workspace snapshot for restart-reliability testing (docs/restart-testing.md).
 *
 * Run in Tools → Developer → Run JavaScript (check "Run as async function"),
 * before quitting and again after the restart settles; diff the two JSON
 * results. Tabs are identified by libraryID:itemKey, so the diff is stable
 * across restarts (itemIDs are stable too, but keys read better).
 */
const lp = Zotero.Weavero && Zotero.Weavero.plugin;
if (!lp) throw new Error("Weavero not loaded");
const ikey = (iid) => {
	try { const it = iid && Zotero.Items.get(iid); return it ? (it.libraryID + ":" + it.key) : null; }
	catch (e) { return null; }
};
// Content type of the tab's item: tells EPUB / snapshot / PDF / note apart for
// the coverage summary (the outline leg of 2026-09-03 needs EPUB + snapshot).
const ctOf = (iid) => {
	try {
		const it = iid && Zotero.Items.get(iid);
		if (!it) return null;
		if (it.isNote && it.isNote()) return "note";
		return (it.isAttachment && it.isAttachment()) ? (it.attachmentContentType || null) : null;
	} catch (e) { return null; }
};
const snap = { t: Date.now(), zotero: Zotero.version, weavero: lp._version || null, focused: null, mains: [], readers: [], groups: null, sessions: null, plugins: {}, errors: [] };
try { snap.errors = (Zotero.getErrors(true) || []).map(e => String(e).slice(0, 200)); } catch (e) {}
try { snap.focused = lp._wvWindowStoreFocusDescriptor(); } catch (e) {}
// Pinned main-window tabs: the PREF is the persisted truth (`weavero.pinnedTabs`,
// {libraryID,itemKey}); the first tab of that item in bar order is the
// designated pinned one. `win._wvPinnedTabIDs` (the decorated tab ids) can lag
// a restore by a moment, so it is recorded separately as `pinDecorated`.
const pinnedKeys = (() => { try { return new Set(lp._pinnedTabsGet().map(p => p.libraryID + ":" + p.itemKey)); } catch (e) { return new Set(); } })();
for (const w of Zotero.getMainWindows()) {
	const designatedPin = new Set(), seenPin = new Set();
	for (const t of w.Zotero_Tabs._tabs) {
		const k = ikey(t.data && t.data.itemID);
		if (k && pinnedKeys.has(k) && !seenPin.has(k)) { seenPin.add(k); designatedPin.add(t.id); }
	}
	// Pinned tabs must be VISIBLE, not merely present (docs/restart-testing.md):
	// count the rendered mirrors with a non-zero box.
	let pinnedMirrors = 0;
	try { pinnedMirrors = [...w.document.querySelectorAll("#wv-pinned-mirrors .wv-pinned-mirror")].filter(m => m.getBoundingClientRect().width > 0).length; } catch (e) {}
	// Library-view state + item pane, per window.
	let libState = null, itemPane = null;
	try { const ms = lp._wvTabSessionCaptureMainState(w); libState = ms && ms.collection || null; } catch (e) {}
	try {
		const ip = w.document.querySelector("#zotero-item-pane");
		if (ip) itemPane = { width: ip.getAttribute("width") || null, collapsed: ip.getAttribute("collapsed") === "true" };
	} catch (e) {}
	snap.mains.push({
		name: lp._wvWindowName(w),
		geom: lp._wvWindowGeom(w),             // incl. dpr + windowState (st: 1 = maximized)
		collection: libState,
		itemPane,
		tabs: w.Zotero_Tabs._tabs.map(t => {
			// Reader page index for LOADED reader tabs (scroll comes back via
			// Zotero's per-item view state; this asserts it end-to-end).
			let page = null;
			try {
				if (t.type === "reader") {
					const r = Zotero.Reader.getByTabID(t.id);
					const vs = r && r._internalReader && r._internalReader._state && r._internalReader._state.primaryViewState;
					if (vs && vs.pageIndex != null) page = vs.pageIndex;
				}
			} catch (e) {}
			return {
				type: t.type,
				key: ikey(t.data && t.data.itemID),
				ct: ctOf(t.data && t.data.itemID),
				grp: lp._wvTabGroupStamp(t) || null,
				sel: w.Zotero_Tabs.selectedID === t.id,
				// Lost pins = 78ea810. `pinned` from the pref (persisted truth),
				// `pinDecorated` from the live designated-id set.
				pinned: designatedPin.has(t.id),
				pinDecorated: !!(w._wvPinnedTabIDs instanceof Set && w._wvPinnedTabIDs.has(t.id)),
				page,
			};
		}),
		managed: !!w._wvManagedWindow,
		pinnedMirrors,
		// A BACKGROUND main window defers its saved selection to its first
		// activation (the library tab shows until then); the deferred item is
		// the effective selection for the diff.
		deferredSelect: ikey(w._wvDeferredSelectItemID) || null,
	});
}
const en = Services.wm.getEnumerator("zotero:reader");
while (en.hasMoreElements()) {
	const w = en.getNext();
	const st = w._wvWT;
	snap.readers.push({
		geom: lp._wvWindowGeom(w),             // incl. dpr + windowState
		sb: lp._wvWTSidebarSnapshot(w),
		tabs: ((st && st.tabs) || []).map(t => {
			let page = null;
			try {
				const vs = t.reader && t.reader._internalReader && t.reader._internalReader._state
					&& t.reader._internalReader._state.primaryViewState;
				if (vs && vs.pageIndex != null) page = vs.pageIndex;
			} catch (e) {}
			return {
				type: t.type || "pdf",
				key: ikey(t.itemID),
				ct: ctOf(t.itemID),
				grp: t.wvGroupId || null,
				pinned: !!t.pinned,
				sel: st.activeId === t.id,
				lazy: !t.reader,   // lazy after restart is EXPECTED (minimal reloads)
				native: !!t.native,
				page,
			};
		}),
		// No native tab left = ORPHAN window (Weavero recreates it wholesale).
		orphan: !((st && st.tabs) || []).some(t => t.native),
	});
}
// Named tab-sessions: which one is ACTIVE (tracked) — a lossy restore used to
// propagate into it (b3b9faf).
try { snap.activeSession = lp._wvTabSessionGetActiveId ? lp._wvTabSessionGetActiveId() : null; } catch (e) {}
// Saved (parked) windows store — count plus a per-window digest.
try {
	const p = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "saved-windows.json");
	if (await IOUtils.exists(p)) {
		const d = JSON.parse(await IOUtils.readUTF8(p));
		const arr = Array.isArray(d) ? d : (d.windows || d.saved || []);
		snap.savedWindows = arr.length;
		snap.savedWindowsDigest = arr.map(w => (w.kind || "?") + ":" + (w.name || "") + ":" + (w.count != null ? w.count : (w.tabs || []).length)).sort();
	}
	else { snap.savedWindows = 0; snap.savedWindowsDigest = []; }
} catch (e) { snap.savedWindows = null; }
// Standalone NOTE windows (windowtype zotero:note): their items.
snap.noteWindows = [];
try {
	const en2 = Services.wm.getEnumerator("zotero:note");
	while (en2.hasMoreElements()) {
		const w = en2.getNext();
		let id = null;
		try { id = w.arguments && w.arguments[0] && (w.arguments[0].itemID || w.arguments[0].id); } catch (e) {}
		if (id == null) { try { const ne = w.document.querySelector("note-editor"); id = ne && (ne.item || ne._item) && (ne.item || ne._item).id; } catch (e) {} }
		snap.noteWindows.push(id != null ? ikey(id) : "?");
	}
	snap.noteWindows.sort();
} catch (e) {}
// Per-item READER STATE as Zotero persists it (.zotero-reader-state in the
// attachment's storage folder): page, split view. Weavero restores tabs
// lazily, so the file is what a restored tab will show when opened.
snap.readerStates = {};
try {
	const seen = new Set();
	const ids = [];
	for (const w of Zotero.getMainWindows()) for (const t of w.Zotero_Tabs._tabs) if (t.data && t.data.itemID) ids.push(t.data.itemID);
	const en3 = Services.wm.getEnumerator("zotero:reader");
	while (en3.hasMoreElements()) { const w = en3.getNext(); for (const t of ((w._wvWT && w._wvWT.tabs) || [])) if (t.itemID) ids.push(t.itemID); }
	for (const id of ids) {
		const k = ikey(id);
		if (!k || seen.has(k)) continue;
		seen.add(k);
		try {
			const it = Zotero.Items.get(id);
			if (!it || !it.isAttachment || !it.isAttachment()) continue;
			const dir = Zotero.Attachments.getStorageDirectory(it).path;
			const f = PathUtils.join(dir, ".zotero-reader-state");
			if (!(await IOUtils.exists(f))) continue;
			const st = JSON.parse(await IOUtils.readUTF8(f));
			snap.readerStates[k] = { pageIndex: st.pageIndex != null ? st.pageIndex : null, splitType: st.splitType || null, scale: st.scale != null ? st.scale : null };
		} catch (e) {}
	}
} catch (e) {}
snap.groups = lp._tabGroupsGet().map(g => ({
	id: g.id, name: g.name, color: g.color,
	saved: !!g.saved, collapsed: !!g.collapsed,
	members: (g.members || []).map(m => m.libraryID + ":" + m.itemKey),
}));
try {
	snap.sessions = lp._wvTabSessionList().map(s => ({
		id: s.id, name: s.name,
		windows: (s.windows || []).length,
		tabs: (s.windows || []).reduce((a, w2) => a + ((w2.tabs || []).length), 0),
	}));
} catch (e) {}
// Weavero note-link wiring: every LOADED note editor must carry Weavero's
// stylesheet + click handling in its CURRENT content document (the editor
// iframe reloads its document when the note loads, which once left restored
// notes with native blue links). `wired: false` on a loaded editor = bug.
snap.noteEditors = [];
for (const w of Zotero.getMainWindows()) {
	for (const ne of w.document.querySelectorAll("note-editor")) {
		try {
			// Only editors that HOLD a note: a blank editor (a hidden
			// attachment-note pane with nothing assigned) has a populated
			// default body but nothing to wire, and read as a false "not
			// wired" on 2026-09-16.
			if (!(ne.item || ne._item)) continue;
			const iframe = ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
			const idoc = iframe && iframe.contentDocument;
			if (!idoc || !idoc.body || !idoc.body.childElementCount) continue;   // not loaded
			snap.noteEditors.push({
				win: lp._wvWindowName(w),
				wired: !!(idoc._wvNoteLinksWired && idoc.getElementById("weavero-note-editor-styles")),
			});
		} catch (e) {}
	}
}
// Companion-plugin smoke check (both patch tab/note machinery Weavero touches).
try {
	const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
	for (const [label, id] of [["betterBibtex", "better-bibtex@iris-advies.com"],
		["betterNotes", "Knowledge4Zotero@windingwind.com"]]) {
		const a = await AddonManager.getAddonByID(id);
		snap.plugins[label] = !!(a && a.isActive);
	}
} catch (e) {}
return JSON.stringify(snap, null, 1);
