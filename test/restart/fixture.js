/* Weavero — restart-test FIXTURE BUILDER: builds, in the running Zotero, a
 * workspace that exercises every tab-related Weavero feature the restart
 * protocol must see survive (docs/restart-testing.md, "What the fixture
 * covers"). Run it BEFORE cycle.js. Adds on top of the current workspace;
 * `Zotero._wvFixtureOpts = { reset: true }` closes everything first.
 *
 * Items come from the library of the running profile (a DEV profile, never a
 * real one): PDFs, one EPUB, snapshots and notes are picked by query. Every
 * group / session it creates is prefixed "RTF-" and a previous fixture's
 * leftovers with that prefix are removed first, so the script is re-runnable.
 *
 * Two builds, chosen by the running Zotero:
 *
 * A Zotero WITHOUT its own windows (Zotero 9, 10, 11.0 up to beta.3):
 *   W1 anchor main window : 6 PDF tabs + EPUB + snapshot + 2 note tabs;
 *                           group RTF-A (2 PDFs + a note), group RTF-B
 *                           COLLAPSED, group RTF-E PARKED (saved), a PINNED
 *                           tab, a SAME-WINDOW DUPLICATE, the SELECTED tab is
 *                           a note (loaded → note-link wiring checked);
 *                           a CUSTOM TITLE ("RTF anchor"), a HIDDEN
 *                           collection ("RTF hidden") and a SPLIT VIEW
 *   W2 managed main window: 3 PDFs + note (background) + a CROSS-WINDOW
 *                           DUPLICATE of an RTF-A member (ungrouped here);
 *                           group RTF-C; moved geometry
 *   W3 managed main window: the LIBRARY TAB ONLY, a custom title ("RTF
 *                           library-only"), moved geometry, its own
 *                           collection ("RTF W3") selected after W1's, its
 *                           own pinned section ("related") and a collapsed
 *                           Tags section
 *   R1 reader window      : native PDF + PDF + snapshot + NOTE tab, note
 *                           moved FIRST (order), group RTF-D on two tabs,
 *                           one PINNED extra, sidebar open at 320 px, moved
 *   R2 reader window      : PDF + the SAME PDF again (same-window duplicate)
 *   R3 reader window      : ONE document (the 0.19.9 fix)
 *   R4 reader window      : ORPHAN (native tab closed, one extra left)
 *
 * A Zotero WITH its own windows (zotero#6035: 11.0-beta.4 and later; it has no
 * reader or note windows, "Open in New Window" gives a main window whose only
 * tab is the document):
 *   W1, W3                : as above; W1 also has a SECOND LIBRARY TAB
 *   W2                    : Zotero's own New Window, the same tabs as above,
 *                           its LIBRARY TAB PINNED and in a SPLIT VIEW with
 *                           the cross-window duplicate (selected)
 *   R1, R2, R3            : main windows WITHOUT a library tab, opened the
 *                           way Zotero opens a document in a new window, in
 *                           the reader windows' roles (no sidebar, no orphan:
 *                           neither exists there); R1: PDF + PDF + snapshot
 *                           (PINNED) + NOTE moved first after the pins, group
 *                           RTF-D on the two PDFs
 *
 * Both:
 *   duplicates matrix     : the same item twice / three times in every
 *                           configuration Weavero distinguishes
 *   R5, R6                : an EPUB and a snapshot as a window's own document
 *   parked window         : a two-tab document window filed away with Save
 *                           and Close
 *   note window           : a note opened in its own window
 *   session "RTF session" : saved from this workspace and ACTIVE (tracked)
 *   focus                 : R1 focused at the end (focused-window restore)
 * Pins are Zotero's own where Zotero pins any tab (`Zotero_Tabs.setPinned`,
 * the 11.0 beta after beta.4), Weavero's elsewhere.
 * Through the bridge: `const t = await IOUtils.readUTF8(path); return await eval(t);`
 */
(async function () {
	const O = Object.assign({ reset: false, prefix: "RTF" }, Zotero._wvFixtureOpts || {});
	const lp = Zotero.Weavero && Zotero.Weavero.plugin;
	if (!lp) throw new Error("Weavero not loaded");
	const W1 = Zotero.getMainWindows()[0];
	const Z1 = W1.Zotero_Tabs;
	const sleep = (ms) => new Promise(r => W1.setTimeout(r, ms));
	// Readable while the build runs (`Zotero._wvFixtureProgress`): a run that
	// stalls says at which step (2026-11-11, the first native build ran past
	// the runner's 5-minute limit with nothing to show where).
	const T0 = Date.now();
	const log = [];
	Zotero._wvFixtureProgress = log;
	const say = (s) => { log.push(((Date.now() - T0) / 1000).toFixed(1) + " s  " + s); try { Zotero.debug("[Weavero][fixture] " + s); } catch (e) {} };
	const lib = Zotero.Libraries.userLibraryID;
	const key = (id) => { const it = Zotero.Items.get(id); return it ? it.libraryID + ":" + it.key : String(id); };
	// The two signs Weavero reads (lib/windows.ts wvNativeWindows).
	const NATIVE = typeof Zotero.Prefs.setForWindow === "function"
		|| typeof (Zotero.Session && Zotero.Session.addClosedWindow) === "function";
	const zPins = typeof Z1.setPinned === "function";
	say("build: " + (NATIVE ? "Zotero's own windows" : "Weavero's windows") + ", pins " + (zPins ? "Zotero's" : "Weavero's"));

	// -------------------------------------------------------------- prefs
	for (const k of ["enableTabsAndWindows", "enableTabGroups", "enableTabSessions", "newMainWindow", "compactTitleBar", "compactTitleBarReader"]) {
		if (!Zotero.Prefs.get("weavero." + k)) { Zotero.Prefs.set("weavero." + k, true); say("pref turned on: weavero." + k + " (restart may be needed for the reader strip)"); }
	}
	await lp._wvTabSessionInit();

	// ------------------------------------------------ previous fixture
	for (const g of lp._tabGroupsGet()) if (String(g.name || "").startsWith(O.prefix + "-")) { lp._tabGroupDelete(g.id); say("removed old group " + g.name); }
	for (const s of lp._wvTabSessionList()) if (s.name === O.prefix + " session") { await lp._wvTabSessionDelete(s.id); say("removed old session"); }
	const readerWins = () => { const a = []; const en = Services.wm.getEnumerator("zotero:reader"); while (en.hasMoreElements()) a.push(en.getNext()); return a; };
	if (O.reset) {
		for (const w of readerWins()) { try { w.close(); } catch (e) {} }
		for (const w of Zotero.getMainWindows()) if (w !== W1) { try { w.close(); } catch (e) {} }
		try { Z1.closeAll(); } catch (e) {}
		await sleep(800);
		say("reset: closed every window and tab");
	}

	// -------------------------------------------------------------- items
	const openIDs = new Set();
	for (const w of Zotero.getMainWindows()) for (const t of w.Zotero_Tabs._tabs) if (t.data && t.data.itemID) openIDs.add(t.data.itemID);
	for (const w of readerWins()) for (const t of ((w._wvWT && w._wvWT.tabs) || [])) if (t.itemID) openIDs.add(t.itemID);
	const notDeleted = " AND i.itemID NOT IN (SELECT itemID FROM deletedItems)";
	async function pickAttachments(contentType, n) {
		const ids = await Zotero.DB.columnQueryAsync(
			"SELECT ia.itemID FROM itemAttachments ia JOIN items i ON i.itemID = ia.itemID WHERE ia.contentType = ? AND i.libraryID = ?" + notDeleted + " ORDER BY ia.itemID LIMIT 200", [contentType, lib]);
		const out = [];
		for (const id of ids) {
			if (openIDs.has(id)) continue;
			const it = Zotero.Items.get(id);
			if (!it) continue;
			try { if (!(await it.fileExists())) continue; } catch (e) { continue; }
			out.push(id); openIDs.add(id);
			if (out.length >= n) break;
		}
		return out;
	}
	async function pickNotes(n) {
		const ids = await Zotero.DB.columnQueryAsync(
			"SELECT i.itemID FROM items i WHERE i.itemTypeID = (SELECT itemTypeID FROM itemTypes WHERE typeName = 'note') AND i.libraryID = ?" + notDeleted + " ORDER BY i.itemID LIMIT 100", [lib]);
		const out = [];
		for (const id of ids) { if (openIDs.has(id)) continue; if (!Zotero.Items.get(id)) continue; out.push(id); openIDs.add(id); if (out.length >= n) break; }
		return out;
	}
	const P = await pickAttachments("application/pdf", 21);
	const E = await pickAttachments("application/epub+zip", 2);
	const S = await pickAttachments("text/html", 3);
	const N = await pickNotes(5);
	if (P.length < 21) throw new Error("need 21 PDF attachments with files not already open, found " + P.length);
	if (N.length < 5) throw new Error("need 5 notes, found " + N.length);
	const D = P.slice(16);   // five PDFs reserved for the duplicates matrix
	say("items: " + P.length + " PDFs, " + E.length + " EPUB, " + S.length + " snapshots, " + N.length + " notes");

	// ---------------------------------------------------------- helpers
	const title = (id) => { try { const it = Zotero.Items.get(id); return it.getDisplayTitle ? it.getDisplayTitle() : (it.getField("title") || ""); } catch (e) { return ""; } };
	const tabOf = (Z, itemID, type) => { const ts = Z._tabs.filter(t => t.data && t.data.itemID === itemID && (!type || String(t.type).startsWith(type))); return ts.length ? ts[ts.length - 1] : null; };
	const nTabs = (w) => ((w._wvWT && w._wvWT.tabs) || (w.Zotero_Tabs && w.Zotero_Tabs._tabs) || []).length;
	const unloadedTab = (Z, itemID, type) => { try { Z.add({ type: type + "-unloaded", title: title(itemID), data: { itemID }, select: false }); } catch (e) { say("unloaded add failed " + itemID + ": " + e); } };
	// Without its own windows `Zotero.Reader.open` has no window parameter: it
	// lands in the most recently focused main window (after the managed window
	// spawns, that is W2). Focus the target first; if the tab still lands
	// elsewhere, close the stray and add an unloaded copy to the intended
	// window instead. With its own windows Zotero takes the window.
	async function openReaderTab(itemID, win) {
		win = win || W1;
		const Z = win.Zotero_Tabs;
		try { win.focus(); } catch (e) {}
		await sleep(150);
		const before = new Set(Z._tabs.map(t => t.id));
		await Zotero.Reader.open(itemID, null, NATIVE
			? { openInWindow: false, allowDuplicate: true, window: win }
			: { openInWindow: false, allowDuplicate: true });
		await sleep(350);
		let t = Z._tabs.find(x => !before.has(x.id) && x.data && x.data.itemID === itemID);
		if (!t) {
			for (const w of Zotero.getMainWindows()) {
				if (w === win) continue;
				const stray = w.Zotero_Tabs._tabs.filter(x => x.data && x.data.itemID === itemID && String(x.type).startsWith("reader"));
				const s = stray[stray.length - 1];
				if (s && s._wvFixtureSeen !== true) { try { w.Zotero_Tabs.close(s.id); } catch (e) {} say("stray reader tab for " + itemID + " landed in another window; closed it"); }
			}
			Z.add({ type: "reader-unloaded", title: title(itemID), data: { itemID }, select: false });
			await sleep(150);
			t = Z._tabs[Z._tabs.length - 1];
		}
		if (!t) throw new Error("reader tab not found for " + itemID);
		t._wvFixtureSeen = true;
		return t.id;
	}
	// The pane's own window: Zotero.Notes.open gets `window` from ZoteroPane.
	async function openNoteTab(itemID, win) {
		win = win || W1;
		const Z = win.Zotero_Tabs;
		await win.ZoteroPane.openNote(itemID, { openInWindow: false });
		await sleep(400);
		let t = tabOf(Z, itemID, "note");
		if (!t && win !== W1) { unloadedTab(Z, itemID, "note"); await sleep(150); t = tabOf(Z, itemID, "note"); say("note " + itemID + " added unloaded"); }
		if (!t) throw new Error("note tab not found for " + itemID);
		return t.id;
	}
	async function openReaderWindow(itemID) {
		const r = await Zotero.Reader.open(itemID, null, { openInWindow: true, allowDuplicate: true });
		for (let i = 0; i < 60; i++) {
			const w = r && r._window;
			if (w && w._wvWT && w._wvWT.tabs && w._wvWT.tabs.length) return w;
			await sleep(100);
		}
		throw new Error("reader window for " + itemID + " did not get its tab strip (compactTitleBarReader on?)");
	}
	// Zotero's own windows: File > New Window, and the window a document opened
	// "in a new window" gets (Reader._openInNewWindow: its only tab is the
	// document). Called directly, because Reader.open with openInWindow selects
	// a tab of the item open anywhere instead of opening a window.
	async function nativeNewWindow() {
		const before = new Set(Zotero.getMainWindows());
		W1.ZoteroPane.newWindow();
		for (let i = 0; i < 300; i++) {
			const w = Zotero.getMainWindows().find(x => !before.has(x) && x.ZoteroPane && x.ZoteroPane.itemsView && x.Zotero_Tabs && x.Zotero_Tabs._tabs);
			if (w) { await sleep(1000); return w; }
			await sleep(50);
		}
		throw new Error("Zotero's New Window did not open");
	}
	async function nativeDocWindow(itemID) {
		const before = new Set(Zotero.getMainWindows());
		Zotero.openMainWindow({ readerTabState: { itemID, title: title(itemID) } });
		for (let i = 0; i < 200; i++) {
			const w = Zotero.getMainWindows().find(x => !before.has(x) && x.Zotero_Tabs && x.Zotero_Tabs._tabs && x.Zotero_Tabs._tabs.some(t => t.data && t.data.itemID === itemID));
			if (w) { await sleep(1200); return w; }
			await sleep(100);
		}
		throw new Error("no window of its own for " + itemID);
	}
	// A pin the way the running Zotero has them: Zotero's own, per tab, where it
	// pins any tab; else Weavero's, per item (the first copy in each window is
	// the pinned one), placed at the end of the pins as the Pin Tab command does.
	function pinItem(win, itemID) {
		const t = win.Zotero_Tabs._tabs.find(x => x.data && x.data.itemID === itemID);
		if (!t) { say("pin: no tab for " + itemID); return; }
		if (zPins) lp._wvSetTabPinned(win, t, true);
		else lp._pinTabByCommand(win, Zotero.Items.get(itemID));
	}
	const group = (name, color) => { const g = lp._tabGroupCreate(O.prefix + "-" + name, color); say("group " + g.name + " " + g.id); return g; };

	// ----------------------------------------------------------- W1 anchor
	const tP = {};
	for (let i = 0; i < 6; i++) tP[i] = await openReaderTab(P[i]);
	if (E[0]) await openReaderTab(E[0]);
	if (S[0]) await openReaderTab(S[0]);
	const tN1 = await openNoteTab(N[0]);
	const tN2 = await openNoteTab(N[1]);
	const gA = group("A", "blue");
	for (const tid of [tP[0], tP[1], tN2]) lp._wvTabGroupAddTab(W1, tid, gA.id);
	const gB = group("B", "green");
	for (const tid of [tP[2], tP[3]]) lp._wvTabGroupAddTab(W1, tid, gB.id);
	lp._tabGroupUpdate(gB.id, { collapsed: true });
	const gE = group("E", "red");
	lp._wvTabGroupAddTab(W1, tP[5], gE.id);
	await sleep(300);
	lp._wvTabGroupSaveAndClose(W1, gE.id);            // parked: saved:true, tab closed
	await sleep(400);
	pinItem(W1, P[4]);                                  // pinned main tab
	await openReaderTab(P[0]);                          // same-window duplicate of an RTF-A member, ungrouped
	await sleep(300);
	try { lp._applyTabGroups(W1); } catch (e) {}
	// A second library tab (Zotero's own windows only: library tabs are tabs there).
	if (NATIVE && typeof W1.ZoteroPane.newLibraryTab === "function") {
		try { W1.ZoteroPane.newLibraryTab(); await sleep(1200); say("W1: a second library tab"); }
		catch (e) { say("second library tab failed: " + e); }
	}
	say("W1: " + Z1._tabs.length + " tabs");

	// ------------------------------------------------------------- W2
	let W2, Z2;
	if (NATIVE) {
		W2 = await nativeNewWindow();
		Z2 = W2.Zotero_Tabs;
		for (const id of [P[6], P[7], P[8], P[1]]) unloadedTab(Z2, id, "reader");   // P1: cross-window duplicate of an RTF-A member
		unloadedTab(Z2, N[2], "note");
		await sleep(500);
	}
	else {
		const before = new Set(Zotero.getMainWindows());
		lp._wvDevSpawnQueue = lp._wvDevSpawnQueue || [];
		lp._wvDevSpawnQueue.push({
			kind: "main-dev",
			tabs: [
				{ type: "library", title: "My Library", data: { icon: "library" }, selected: true },
				{ type: "reader-unloaded", title: title(P[6]), data: { itemID: P[6] } },
				{ type: "reader-unloaded", title: title(P[7]), data: { itemID: P[7] } },
				{ type: "reader-unloaded", title: title(P[8]), data: { itemID: P[8] } },
				{ type: "reader-unloaded", title: title(P[1]), data: { itemID: P[1] } },   // cross-window duplicate of an RTF-A member
				{ type: "note-unloaded", title: title(N[2]), data: { itemID: N[2] } },
			],
			geom: { x: 200, y: 120, w: 1100, h: 750, dpr: W1.devicePixelRatio || 1, st: 3 },
		});
		lp._wvPendingDevWindow = true;
		try { lp._wvClearSessionPaneState(); } catch (e) {}
		Zotero.openMainWindow();
		W2 = null;
		for (let i = 0; i < 200 && !W2; i++) {
			W2 = Zotero.getMainWindows().find(x => !before.has(x) && x.Zotero_Tabs && x.Zotero_Tabs._tabs && x._wvDevInitDone) || null;
			if (!W2) await sleep(50);
		}
		if (!W2) throw new Error("managed main window did not initialise");
		await sleep(1200);
		Z2 = W2.Zotero_Tabs;
	}
	const gC = group("C", "yellow");
	for (const id of [P[7], P[8]]) { const t = tabOf(Z2, id); if (t) lp._wvTabGroupAddTab(W2, t.id, gC.id); }
	try { W2.moveTo(200, 120); W2.resizeTo(1100, 750); } catch (e) {}
	await sleep(300);
	say("W2 (" + (NATIVE ? "Zotero's New Window" : "managed") + "): " + Z2._tabs.length + " tabs");

	// -------------------------------------- W3, library tab only
	// A restart reopens every main window that was open, one holding only
	// its library tab included (MJT 2026-10-26; the store skipped it as
	// "nothing to restore" before 0.22.3-dev.40, and W2 always had tabs).
	let W3 = null;
	if (NATIVE) {
		try { W3 = await nativeNewWindow(); } catch (e) { say("W3: " + e); }
	}
	else {
		const s3 = lp._wvSpawnMainWindowStart({ tabs: [{ type: "library", title: "My Library", data: { icon: "library" }, selected: true }] });
		W3 = await lp._wvSpawnMainWindowWait(s3, { wait: "init", timeoutMs: 15000, timerWin: W1 });
	}
	if (W3) {
		try { lp._wvWindowSetCustomTitle(W3, O.prefix + " library-only"); } catch (e) { say("W3 custom title failed: " + e); }
		try { W3.moveTo(320, 200); W3.resizeTo(900, 650); } catch (e) {}
		// W3 views a collection of its own, selected AFTER W1's view: Zotero's
		// single lastViewedFolder then names W3's, and W1 must still reopen
		// on its own (MJT 2026-10-26, fixed in 0.22.3-dev.45).
		try {
			let c3 = Zotero.Collections.getByLibrary(lib).find(c => c.name === O.prefix + " W3");
			if (!c3) { c3 = new Zotero.Collection(); c3.libraryID = lib; c3.name = O.prefix + " W3"; await c3.saveTx(); }
			await W3.ZoteroPane.collectionsView.selectByID("C" + c3.id);
		} catch (e) { say("W3 collection failed: " + e); }
		// W3's own pinned section (set aside: no item shown) and a collapsed
		// Tags section, while W1 keeps its own (0.22.3-dev.47).
		try {
			const d3 = W3.document.querySelector("#zotero-item-pane item-details");
			d3.pinnedPane = "related";
			const t3 = W3.document.querySelector('#zotero-item-pane collapsible-section[data-pane="tags"]');
			if (t3) t3.open = false;
		} catch (e) { say("W3 pin / sections failed: " + e); }
		say("W3 (library tab only): " + O.prefix + " library-only, on " + O.prefix + " W3");
	}
	else say("W3 did not initialise");

	// --------------------------------- anchor title + hidden collection (W1)
	// Both ride the quit flush's anchor record (anchorTitle / anchorHidden).
	// The fixture set neither, so the flush that dropped them (survey
	// 2026-10-06 §2 #1, fixed in 0.21.9-next.2) escaped this protocol.
	try { lp._wvWindowSetCustomTitle(W1, O.prefix + " anchor"); say("W1 custom title: " + O.prefix + " anchor"); }
	catch (e) { say("custom title failed: " + e); }
	try {
		let coll = Zotero.Collections.getByLibrary(lib).find(c => c.name === O.prefix + " hidden");
		if (!coll) { coll = new Zotero.Collection(); coll.libraryID = lib; coll.name = O.prefix + " hidden"; await coll.saveTx(); }
		await lp._wvHidHide([coll], W1);
		say("collection hidden in W1: " + coll.name);
	}
	catch (e) { say("hidden collection failed: " + e); }

	// ------------------------------------------------- document windows
	let R1, R2, R3, R4 = null;
	if (NATIVE) {
		// R1: four tabs, a note moved first, a group on two of them, a pinned one.
		R1 = await nativeDocWindow(P[9]);
		await openReaderTab(P[10], R1);
		if (S[1]) await openReaderTab(S[1], R1);
		const tN3 = await openNoteTab(N[3], R1);
		const ZR = R1.Zotero_Tabs;
		const gD = group("D", "purple");
		for (const id of [P[9], P[10]]) { const t = tabOf(ZR, id); if (t) lp._wvTabGroupAddTab(R1, t.id, gD.id); }
		try { lp._applyTabGroups(R1); } catch (e) {}
		// Pinned: the snapshot, open nowhere else (Weavero's pins are per item, so
		// a pin on P11 would pin its copy in W1 too).
		if (S[1]) pinItem(R1, S[1]);
		await sleep(300);
		const firstFree = ZR._tabs.filter(t => lp._wvTabIsPinned(R1, t)).length;
		try { ZR.move(tN3, firstFree); } catch (e) { say("note move failed: " + e); }   // note FIRST after the pins (order)
		try { R1.moveTo(60, 60); R1.resizeTo(1000, 700); } catch (e) {}
		R2 = await nativeDocWindow(P[11]);
		await openReaderTab(P[11], R2);                                     // same-window duplicate
		try { R2.moveTo(300, 200); R2.resizeTo(900, 650); } catch (e) {}
		R3 = await nativeDocWindow(P[12]);                                  // single document
		try { R3.moveTo(520, 300); R3.resizeTo(800, 600); } catch (e) {}
		await sleep(500);
		say("windows without a library tab: " + [R1, R2, R3].map(w => nTabs(w) + " tab(s)").join(", "));
	}
	else {
		R1 = await openReaderWindow(P[9]);
		await lp._wvWTMountTab(R1, P[10], { select: false, await: true });
		if (S[1]) await lp._wvWTMountTab(R1, S[1], { select: false, await: true });
		await lp._wvWTMountTab(R1, N[3], { select: false, await: true });
		await sleep(300);
		{
			const st = R1._wvWT;
			const gD = group("D", "purple");
			const nat = st.tabs.find(t => t.native);
			const t11 = st.tabs.find(t => t.itemID === P[10]);
			lp._wvReaderStampTabGroup(R1, nat.id, gD.id);
			lp._wvReaderStampTabGroup(R1, t11.id, gD.id);
			t11.pinned = true;                                                  // pinned reader-window tab
			const note = st.tabs.find(t => t.itemID === N[3]);
			if (note) { st.tabs.splice(st.tabs.indexOf(note), 1); st.tabs.unshift(note); }   // note FIRST (order)
			try { if (nat.reader) { nat.reader.toggleSidebar(true); nat.reader.setSidebarWidth(320); } } catch (e) {}
			await sleep(300);
			try { lp._wvWTCaptureSharedDisplay(R1); } catch (e) {}
			lp._wvWTRenderStrip(R1); lp._wvWTPersistSaveDebounced();
			try { R1.moveTo(60, 60); R1.resizeTo(1000, 700); } catch (e) {}
		}
		R2 = await openReaderWindow(P[11]);
		await lp._wvWTMountTab(R2, P[11], { select: false, await: true, allowDuplicate: true });   // same-window duplicate
		try { R2.moveTo(300, 200); R2.resizeTo(900, 650); } catch (e) {}
		R3 = await openReaderWindow(P[12]);                                                  // single document
		try { R3.moveTo(520, 300); R3.resizeTo(800, 600); } catch (e) {}
		R4 = await openReaderWindow(P[13]);
		await lp._wvWTMountTab(R4, P[14], { select: false, await: true });
		await sleep(300);
		lp._wvWTCloseTab(R4, "wvwt-native");                                                       // orphan
		try { R4.moveTo(100, 420); R4.resizeTo(900, 600); } catch (e) {}
		await sleep(500);
		say("reader windows: " + readerWins().map(w => ((w._wvWT && w._wvWT.tabs) || []).length + " tab(s)").join(", "));
	}

	// ------------------------------------------------- duplicates matrix
	// The same item open twice (or three times) in every configuration Weavero
	// distinguishes -- each has bitten once (docs/restart-testing.md, the
	// "duplicate" rows): copies are independent per-tab members, only the
	// DESIGNATED copy of a pinned item is pinned, the claim pass must not grab
	// a copy, the restore must not re-stamp the ungrouped copy, the main
	// window may hold a copy of a document window's own document.
	const gF = group("F", "cyan");
	const gG = group("G", "gray");
	// (a) same window, BOTH copies in one group, plus a third copy in W2 ungrouped
	{ const t1 = await openReaderTab(D[0]); const t2 = await openReaderTab(D[0]);
	  lp._wvTabGroupAddTab(W1, t1, gF.id); lp._wvTabGroupAddTab(W1, t2, gF.id);
	  unloadedTab(Z2, D[0], "reader"); }
	// (b) same window, copies in DIFFERENT groups
	{ const t1 = await openReaderTab(D[1]); const t2 = await openReaderTab(D[1]);
	  lp._wvTabGroupAddTab(W1, t1, gF.id); lp._wvTabGroupAddTab(W1, t2, gG.id); }
	// (c) same window, both ungrouped: one loaded, one unloaded
	await openReaderTab(D[2]); unloadedTab(Z1, D[2], "reader");
	// (d) pinned copy + plain copy (only the designated copy is pinned)
	await openReaderTab(D[3]); pinItem(W1, D[3]); await openReaderTab(D[3]);
	// (e) a member of the PARKED group RTF-E open again, ungrouped
	await openReaderTab(P[5]);
	// (f) the SELECTED note (N1) open a second time in W1, and in R1
	unloadedTab(Z1, N[0], "note");
	if (NATIVE) unloadedTab(R1.Zotero_Tabs, N[0], "note");
	else await lp._wvWTMountTab(R1, N[0], { select: false, await: true, allowDuplicate: true });
	// (g) main window + a tab of R1 (a reader-window EXTRA without Zotero's own windows)
	const tSplitL = await openReaderTab(P[10]);
	// (h) main window + R3's own document
	const tSplitR = await openReaderTab(P[12]);
	// (i) across document windows: the same tab in R1 and R2
	if (NATIVE) { await openReaderTab(D[4], R1); await openReaderTab(D[4], R2); }
	else {
		await lp._wvWTMountTab(R1, D[4], { select: false, await: true });
		await lp._wvWTMountTab(R2, D[4], { select: false, await: true, allowDuplicate: true });
	}
	// (j) the orphan window's only tab also open in W2 (no orphan with Zotero's own windows)
	if (!NATIVE) unloadedTab(Z2, P[14], "reader");
	// (k) EPUB and snapshot duplicates in W1
	if (E[0]) unloadedTab(Z1, E[0], "reader");
	if (S[0]) unloadedTab(Z1, S[0], "reader");
	// (l) W2's SELECTED tab is the cross-window duplicate copy of an RTF-A member
	// (with Zotero's own windows: below, as the right side of W2's split)
	if (!NATIVE) { const t = tabOf(Z2, P[1]); if (t) { try { Z2.select(t.id); } catch (e) {} } }
	await sleep(700);
	for (const w of [W1, W2, R1, R2]) { try { lp._applyTabGroups(w); } catch (e) {} }
	if (!NATIVE) { try { lp._wvWTRenderStrip(R1); lp._wvWTRenderStrip(R2); lp._wvWTPersistSaveDebounced(); } catch (e) {} }
	say("duplicates matrix: W1 " + Z1._tabs.length + " tabs, W2 " + Z2._tabs.length + " tabs, R1 " + nTabs(R1) + ", R2 " + nTabs(R2));

	// ------------------------------------------ the remaining window kinds
	// R5: an EPUB as a window's OWN document; R6: a snapshot as one.
	const docWindow = NATIVE ? nativeDocWindow : openReaderWindow;
	const R5 = await docWindow(E[1] || E[0]);
	try { R5.moveTo(700, 80); R5.resizeTo(760, 640); } catch (e) {}
	const R6 = await docWindow(S[2] || S[0]);
	try { R6.moveTo(760, 380); R6.resizeTo(760, 560); } catch (e) {}
	// A pinned tab in the second main window (Weavero's pins are per item, designated per window).
	try { pinItem(W2, P[6]); } catch (e) { say("pin in W2 failed: " + e); }
	// A saved-and-closed (parked) window: a two-tab document window filed away.
	try {
		const R7 = await docWindow(P[15]);
		if (NATIVE) await openReaderTab(S[0], R7);
		else await lp._wvWTMountTab(R7, S[0], { select: false, await: true, allowDuplicate: true });
		await sleep(400);
		// `isReader` only for Weavero's reader windows: with Zotero's own windows
		// R7 is a main window, and `true` found no reader tabs and stopped the
		// build on a modal "no tabs to save" alert (2026-11-11, run 3).
		await lp._wvSaveAndCloseWindow(R7, !NATIVE);
		await sleep(600);
		say("saved-and-closed a 2-tab document window");
	} catch (e) { say("save-and-close failed: " + e); }
	// A NOTE opened in its own window (not a tab): a note window, or with
	// Zotero's own windows a main window whose only tab is the note.
	try { await W1.ZoteroPane.openNote(N[4], { openInWindow: true }); await sleep(900); say("note window opened"); } catch (e) { say("note window failed: " + e); }

	// --------------------------------------------------------- split views
	// Two tabs side by side (1.0.5; "survives a restart, as Firefox", MJT
	// 2026-11-10): W1 splits (g) and (h), not selected; with Zotero's own
	// windows W2's library tab is PINNED and split with the cross-window
	// duplicate, the split on screen (MJT: a pinned My Library may be a side
	// and stays pinned).
	if (typeof lp._wvTabSplitCreate === "function") {
		if (!lp._wvTabSplitCreate(W1, tSplitL, tSplitR, { select: "none" })) say("split in W1 refused");
		if (NATIVE) {
			const libTab = Z2._tabs.find(t => typeof Z2.isLibraryTab === "function" && Z2.isLibraryTab(t.id));
			const dup = tabOf(Z2, P[1]);
			if (libTab && dup) {
				try { lp._wvSetLibraryTabPinned(W2, libTab.id, true); } catch (e) { say("library tab pin failed: " + e); }
				await sleep(300);
				if (!lp._wvTabSplitCreate(W2, libTab.id, dup.id, { select: "right" })) say("split in W2 refused");
			}
			else say("W2: no library tab or no duplicate to split");
		}
		await sleep(800);
		say("splits: W1 " + lp._wvTabSplits(W1).length + ", W2 " + lp._wvTabSplits(W2).length);
	}
	else say("no split view in this Weavero");

	// Reading position and Zotero's own split view: navigate two loaded PDFs
	// and split one, so the per-item reader state (Zotero's
	// .zotero-reader-state) is non-default.
	try {
		const loaded = (id) => (Zotero.Reader._readers || []).find(r => r.itemID === id && r._internalReader);
		const r9 = loaded(P[9]);
		if (r9) r9.navigate({ pageIndex: 3 });
		const rw1 = loaded(P[0]);
		if (rw1) rw1.navigate({ pageIndex: 2 });
		const rw2 = loaded(P[2]);
		if (rw2 && rw2._internalReader && !rw2._internalReader.splitType) rw2._internalReader.toggleVerticalSplit();
		await sleep(2500);   // let the reader persist its state
		say("reading positions set (R1's P10 p4, P1 p3), vertical split on P3");
	} catch (e) { say("reading position / split failed: " + e); }

	// A MAXIMIZED anchor window (the traceability table's "W1 maximized": the
	// anchor once came back at the geometry of the main window closed last).
	try { if (W1.windowState !== W1.STATE_MAXIMIZED) { W1.maximize(); await sleep(600); say("W1 maximized"); } } catch (e) { say("maximize failed: " + e); }

	// ----------------------------------------------------------- session
	const sess = await lp._wvTabSessionSaveAs(O.prefix + " session");
	await lp._wvTabSessionTrackingFlush();
	say("session '" + (sess && sess.name) + "' active: " + (lp._wvTabSessionGetActiveId() === (sess && sess.id)));

	// ----------------------------------------------- selection + focus
	try { Z1.select(tN1); } catch (e) {}
	await sleep(600);
	try { R1.focus(); } catch (e) {}
	await sleep(300);
	try { lp._wvWindowStoreSaveSync(); } catch (e) {}
	await sleep(700);

	const splitsOf = (w) => { try { return lp._wvTabSplits ? lp._wvTabSplits(w).filter(s => s.right).length : 0; } catch (e) { return 0; } };
	const summary = {
		build: NATIVE ? "native windows" : "Weavero windows",
		pins: zPins ? "Zotero's" : "Weavero's",
		items: { pdfs: P.map(key), epub: E.map(key), snapshots: S.map(key), notes: N.map(key) },
		mains: Zotero.getMainWindows().map(w => ({
			name: lp._wvWindowName(w), tabs: w.Zotero_Tabs._tabs.length, managed: !!w._wvManagedWindow,
			libraryTabs: w.Zotero_Tabs._tabs.filter(t => String(t.type).startsWith("library")).length, splits: splitsOf(w),
		})),
		readers: readerWins().map(w => ({ tabs: ((w._wvWT && w._wvWT.tabs) || []).map(t => (t.native ? "N:" : "") + key(t.itemID) + (t.pinned ? "[pin]" : "") + (t.wvGroupId ? "[grp]" : "")), orphan: !((w._wvWT && w._wvWT.tabs) || []).some(t => t.native) })),
		groups: lp._tabGroupsGet().filter(g => String(g.name || "").startsWith(O.prefix + "-")).map(g => ({ name: g.name, color: g.color, collapsed: !!g.collapsed, saved: !!g.saved, members: (g.members || []).length })),
		pinnedMain: lp._pinnedTabsGet(),
		session: sess && sess.name,
		log,
	};
	Zotero._wvFixtureLast = summary;
	return JSON.stringify(summary, null, 1);
})();
