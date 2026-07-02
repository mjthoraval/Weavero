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
const snap = { t: Date.now(), focused: null, mains: [], readers: [], groups: null, sessions: null, plugins: {} };
try { snap.focused = lp._wvWindowStoreFocusDescriptor(); } catch (e) {}
for (const w of Zotero.getMainWindows()) {
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
				grp: lp._wvTabGroupStamp(t) || null,
				sel: w.Zotero_Tabs.selectedID === t.id,
				page,
			};
		}),
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
				grp: t.wvGroupId || null,
				pinned: !!t.pinned,
				sel: st.activeId === t.id,
				lazy: !t.reader,   // lazy after restart is EXPECTED (minimal reloads)
				page,
			};
		}),
	});
}
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
