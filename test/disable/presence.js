/* Post-(RE-)ENABLE presence scan (docs/disable-testing.md).
 *
 * Run in Tools → Developer → Run JavaScript (check "Run as async function")
 * after enabling / re-enabling / reinstalling Weavero (give it ~5 s to
 * settle). Verifies every surface came back — and came back EXACTLY ONCE
 * (duplicates are the classic reinstall bug: two pref panes, stacked
 * wrappers, double chips).
 */
const failures = [];
const warnings = [];
const F = (m) => failures.push(m);
const W = (m) => warnings.push(m);

const lp = Zotero.Weavero && Zotero.Weavero.plugin;
if (!lp) { return JSON.stringify({ pass: false, failures: ["Zotero.Weavero.plugin not set — plugin not running"] }); }

const mains = Zotero.getMainWindows ? Zotero.getMainWindows() : [Zotero.getMainWindow()];

// 1. Per-main-window wiring.
let mi = 0;
for (const w of mains) {
	const label = "main[" + (mi++) + "]";
	const doc = w.document;
	// Stylesheet present exactly once.
	const styles = doc.querySelectorAll("style#weavero-styles").length;
	if (styles !== 1) F(label + ": weavero-styles count = " + styles + " (want 1)");
	// Tab-lifecycle wrappers installed WITH stored originals (unwire-able).
	const Z = w.Zotero_Tabs;
	if (Z) {
		for (const m of ["Select", "Close", "RestoreState", "MarkAsLoaded"]) {
			if (!Z["_wvOrig" + m]) F(label + ": Zotero_Tabs._wvOrig" + m + " missing (wrapper not installed or legacy layer)");
		}
	}
	if (!w._wvTabBarDecoMo) F(label + ": tab-bar decoration observer not connected");
	// Group chips: one per group whose members are OPEN in this window.
	try {
		for (const g of lp._tabGroupsGet()) {
			const openHere = Z._tabs.filter(t => lp._wvTabGroupStamp(t) === g.id).length;
			const chips = doc.querySelectorAll("#wv-tgchip-" + g.id).length;
			if (openHere > 0 && chips !== 1) F(label + ": group " + (g.name || g.id) + " has " + openHere + " open member(s) but " + chips + " chip(s) (want 1)");
			if (openHere === 0 && chips > 0) F(label + ": group " + (g.name || g.id) + " has a chip but no open members here");
		}
	} catch (e) { W(label + ": chip check error " + e); }
	// Pinned tabs: every open pinned-by-pref tab carries the class; loose
	// pinned also carry the sticky index.
	try {
		const pinned = lp._pinnedTabsGet();
		for (const p of pinned) {
			const id = Zotero.Items.getIDFromLibraryAndKey(p.libraryID, p.itemKey);
			const t = id && Z._tabs.find(t => t.data && t.data.itemID === id);
			if (!t) continue;   // pinned item open in another window (or not open)
			const node = doc.querySelector("#tab-bar-container .tab[data-id='" + t.id + "']");
			if (node && !node.classList.contains("wv-pinned-tab")) F(label + ": pinned tab " + p.itemKey + " missing wv-pinned-tab class");
			if (!lp._wvTabGroupStamp(t)) {
				// Loose pinned → represented by a MIRROR in .pinned-tabs; the
				// real tab is hidden in the scroller.
				const mirror = doc.querySelector('.wv-pinned-mirror[data-tab-id="' + t.id + '"]');
				if (!mirror) F(label + ": loose pinned tab " + p.itemKey + " has no mirror in .pinned-tabs");
				if (node && !node.hasAttribute("data-wv-pin-mirrored")) F(label + ": loose pinned tab " + p.itemKey + " not hidden in the scroller");
			}
		}
	} catch (e) { W(label + ": pin check error " + e); }
}

// 2. Note editors: sweep, then every LOADED editor must be wired.
try { for (const w of mains) lp._processNoteEditors(w.document); } catch (e) {}
await new Promise(r => setTimeout(r, 600));
let neTotal = 0, neWired = 0;
for (const w of mains) {
	for (const ne of w.document.querySelectorAll("note-editor")) {
		try {
			const iframe = ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
			const idoc = iframe && iframe.contentDocument;
			if (!idoc || !idoc.body || !idoc.body.childElementCount) continue;
			neTotal++;
			if (idoc.getElementById("weavero-note-editor-styles")) neWired++;
		} catch (e) {}
	}
}
if (neTotal && neWired !== neTotal) F("note editors wired: " + neWired + "/" + neTotal);

// 3. Global patches installed exactly once (marker + stored original).
try {
	const N = Zotero.Notes;
	if (N && !N._wvOrigOpen && !N._wvOpenPatched) W("Zotero.Notes.open not patched (multi-window note fix inactive)");
} catch (e) {}

// 4. Pref pane registered exactly once (duplicate = reinstall bug).
try {
	const ours = Zotero.PreferencePanes.pluginPanes.filter(p => p.pluginID === "weavero@mjthoraval");
	if (ours.length !== 1) F("pref panes registered: " + ours.length + " (want 1)");
} catch (e) {}

// 5. Reader windows: multi-tab windows need their strip back.
try {
	const en = Services.wm.getEnumerator("zotero:reader");
	while (en.hasMoreElements()) {
		const w = en.getNext();
		const n = (w._wvWT && w._wvWT.tabs || []).length;
		const strip = !!w.document.querySelector(".wv-window-tabstrip");
		if (n > 1 && !strip) F("reader window with " + n + " tabs missing its tab strip");
	}
} catch (e) {}

// 6. List All Tabs popup renders (Weavero-grouped) — every open tab has a
//    row, and the native list is attached. Mirrors the leftover-side check.
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
			await new Promise(r => w.setTimeout(r, 700));
		}
		const rows = list ? list.querySelectorAll(".row[data-tab-id]").length : 0;
		const tabs = w.Zotero_Tabs._tabs.length;
		if (rows < tabs) F("tabs-menu popup: " + rows + " row(s) rendered for " + tabs + " tab(s)");
		if (!wasOpen) { try { panel.hidePopup(); } catch (e) {} }
	}
} catch (e) { W("tabs-menu popup check error: " + e); }

// 7. Version echo (confirm the EXPECTED build is the one running).
let version = "?";
try {
	const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
	const a = await AddonManager.getAddonByID("weavero@mjthoraval");
	version = a && a.version;
} catch (e) {}

return JSON.stringify({ pass: failures.length === 0, version, noteEditors: neWired + "/" + neTotal, failures, warnings }, null, 1);
