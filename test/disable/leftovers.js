/* Post-DISABLE leftover scan (docs/disable-testing.md).
 *
 * Run in Tools → Developer → Run JavaScript (check "Run as async function")
 * AFTER disabling (or uninstalling) Weavero. Returns a JSON verdict:
 * `pass: true` means no Weavero artifact survived — DOM, styles, wrapped
 * Zotero methods, prototype patches, note-editor wiring, observers.
 *
 * Every check here corresponds to a leftover class actually observed live
 * (2026-07-03): resurrecting group chips, note links kept brown by stale
 * editor wiring, dead right-pane skeletons in reader windows, wrapped
 * Zotero_Tabs methods firing from dead instances.
 */
const failures = [];
const warnings = [];
const F = (m) => failures.push(m);
const W = (m) => warnings.push(m);

// 0. Global handle gone.
if (Zotero.Weavero && Zotero.Weavero.plugin) F("Zotero.Weavero.plugin still set");

// Known Weavero data-* attributes (kept explicit — enumerating every
// attribute of every element is too slow on a big workspace).
const DATA_ATTRS = [
	"data-wv-pin-sticky", "data-wv-pin-preview", "data-wv-drag-join",
	"data-wv-source", "data-wv-rendered", "data-wv-raw",
	"data-wv-related-rendered", "data-wv-ctx-wired", "data-wv-last-rebuild",
];
const ROOT_CLASSES = ["wv-icons-only", "wv-ui-dark", "wv-anchor-window"];

const scanDoc = (doc, label) => {
	try {
		// Weavero UI/style elements all carry a wv-/weavero id prefix.
		const ids = [...doc.querySelectorAll("[id^='wv-'], [id^='weavero']")].map(e => e.id);
		if (ids.length) F(label + ": " + ids.length + " wv element(s): " + ids.slice(0, 6).join(", "));
		// Classes (chips, pinned, popup rows, ghosts, member indents, …).
		const cls = new Set();
		for (const el of doc.querySelectorAll("[class*='wv-']")) {
			for (const c of el.classList) if (c.startsWith("wv-")) cls.add(c);
		}
		if (cls.size) F(label + ": wv- classes present: " + [...cls].slice(0, 8).join(", "));
		for (const a of DATA_ATTRS) {
			const n = doc.querySelectorAll("[" + a + "]").length;
			if (n) F(label + ": " + n + " element(s) with " + a);
		}
		for (const c of ROOT_CLASSES) {
			if (doc.documentElement.classList.contains(c)) F(label + ": root class " + c);
		}
	} catch (e) { W(label + ": scan error " + e); }
};

// Wrapped-method detector: source markers unique to Weavero's wrappers.
const looksOurs = (fn) => {
	try { return /_wv|weavero|watchdog\[|tab-loaded\[|restoreState\[/i.test(String(fn)); }
	catch (e) { return false; }
};

// 1. Main windows.
const mains = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()];
let mi = 0;
for (const w of mains) {
	const label = "main[" + (mi++) + "]";
	scanDoc(w.document, label);
	const Z = w.Zotero_Tabs;
	if (Z) {
		for (const m of ["select", "close", "restoreState", "markAsLoaded"]) {
			if (looksOurs(Z[m])) F(label + ": Zotero_Tabs." + m + " still wrapped by Weavero");
			if (Z["_wvOrig" + m.charAt(0).toUpperCase() + m.slice(1)]) F(label + ": Zotero_Tabs._wvOrig" + m + " still stored");
		}
		if (Z._wvRestoreTraceWired) W(label + ": _wvRestoreTraceWired flag still set");
	}
	if (w._wvTabBarDecoMo) F(label + ": tab-bar decoration MutationObserver still connected");
	// Note editors: Weavero stylesheet + claim tokens must be gone.
	for (const ne of w.document.querySelectorAll("note-editor")) {
		try {
			const iframe = ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
			const idoc = iframe && iframe.contentDocument;
			if (!idoc) continue;
			if (idoc.getElementById("weavero-note-editor-styles")) F(label + ": note editor still carries weavero-note-editor-styles");
			if (idoc._wvNoteLinksWired) W(label + ": note editor doc still holds _wvNoteLinksWired token");
			if (iframe._wvLoadWired) W(label + ": note editor iframe still holds _wvLoadWired token");
		} catch (e) {}
	}
}

// 2. Reader / note / prefs windows.
for (const wtype of ["zotero:reader", "zotero:note", "zotero:pref", "zotero:basicViewer"]) {
	try {
		const en = Services.wm.getEnumerator(wtype);
		let i = 0;
		while (en.hasMoreElements()) {
			const w = en.getNext();
			if (w && w.document) scanDoc(w.document, wtype + "[" + (i++) + "]");
		}
	} catch (e) {}
}

// 3. Global monkey-patches restored.
try {
	const N = Zotero.Notes;
	if (N && N._wvOrigOpen) F("Zotero.Notes.open still patched (orig stored)");
	if (N && looksOurs(N.open)) F("Zotero.Notes.open source still looks Weavero-wrapped");
} catch (e) {}
try {
	const R = Zotero.Reader;
	if (R && R._wvOrigOpen) F("Zotero.Reader.open still patched");
	if (R && R._wvOrigGetWindowStates) F("Zotero.Reader.getWindowStates still patched");
} catch (e) {}
try {
	if (Zotero.Utilities.Internal._wvOrigOpenPreferences) F("openPreferences still patched");
} catch (e) {}

// 4. ZoteroItemTreeRow.getChildItems prototype patch.
try {
	const rp = Zotero.getMainWindow().ZoteroPane.itemsView
		&& Zotero.getMainWindow().ZoteroPane.itemsView.rowProvider;
	if (rp && rp._rows) {
		for (const r of rp._rows) {
			if (r && r.ref && r.ref.isRegularItem && r.ref.isRegularItem()) {
				const proto = Object.getPrototypeOf(r);
				if (proto._wvHideCtxAttPatched) F("getChildItems: _wvHideCtxAttPatched flag still set");
				if (proto.getChildItems && proto.getChildItems._wvWeaveroWrapper) F("getChildItems still Weavero-wrapped");
				if (proto._wvOrigGetChildItems) F("getChildItems original still stored on prototype");
				break;
			}
		}
	}
} catch (e) { W("getChildItems check error: " + e); }

// 5. Pref pane unregistered.
try {
	const ours = Zotero.PreferencePanes.pluginPanes.filter(p => p.pluginID === "weavero@mjthoraval");
	if (ours.length) F("pref pane(s) still registered: " + ours.length);
} catch (e) {}

// 6. Items-tree custom columns.
try {
	const cols = (Zotero.ItemTreeManager.getCustomColumns ? Zotero.ItemTreeManager.getCustomColumns() : [])
		.filter(c => /weavero|^wv/i.test(c.dataKey || ""));
	if (cols.length) F("custom item-tree column(s) still registered: " + cols.map(c => c.dataKey).join(", "));
} catch (e) {}

// 7. List All Tabs popup must still WORK natively: open it, count rows,
//    close. A teardown once deleted the native list inside a Weavero
//    wrapper — the popup then opened permanently EMPTY (rows rebuilt into
//    the detached node).
try {
	const w = mains[0];
	const doc = w.document;
	const panel = doc.getElementById("zotero-tabs-menu-panel");
	if (panel) {
		const list = panel._tabsList || panel.querySelector("#zotero-tabs-menu-list");
		if (list && !list.isConnected) F("tabs-menu: native list is DETACHED from the panel");
		const wasOpen = panel.state === "open";
		if (!wasOpen) {
			const anchor = doc.getElementById("zotero-tb-tabs-menu") || doc.documentElement;
			panel.openPopup(anchor, "after_start", 0, 0, false, false);
			await new Promise(r => w.setTimeout(r, 500));
		}
		const rows = list ? list.querySelectorAll(".row[data-tab-id]").length : 0;
		const tabs = w.Zotero_Tabs._tabs.length;
		if (rows < tabs) F("tabs-menu popup: " + rows + " row(s) rendered for " + tabs + " tab(s)");
		if (!wasOpen) { try { panel.hidePopup(); } catch (e) {} }
	}
} catch (e) { W("tabs-menu popup check error: " + e); }

// 8. OPTIONAL late-load leg (the nastiest regression): pass {loadNote:true}
//    conceptually — here, just report whether any unloaded note tab exists so
//    the tester can select it and re-run this scan (the tab must load with
//    NATIVE link colours; a re-run must stay clean).
try {
	let unloadedNotes = 0;
	for (const w of mains) for (const t of w.Zotero_Tabs._tabs) {
		if (t.type === "note-unloaded") unloadedNotes++;
	}
	if (unloadedNotes) W(unloadedNotes + " unloaded note tab(s) available — select one, wait 5 s, re-run this scan (late-load leg)");
} catch (e) {}

return JSON.stringify({ pass: failures.length === 0, failures, warnings }, null, 1);
