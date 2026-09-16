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
 * What it builds (each line is one historical loss, see the traceability
 * table in docs/restart-testing.md):
 *   W1 anchor main window : 6 PDF tabs + EPUB + snapshot + 2 note tabs;
 *                           group RTF-A (2 PDFs + a note), group RTF-B
 *                           COLLAPSED, group RTF-E PARKED (saved), a PINNED
 *                           tab, a SAME-WINDOW DUPLICATE, the SELECTED tab is
 *                           a note (loaded → note-link wiring checked)
 *   W2 managed main window: 3 PDFs + note (background) + a CROSS-WINDOW
 *                           DUPLICATE of an RTF-A member (ungrouped here);
 *                           group RTF-C; moved geometry
 *   R1 reader window      : native PDF + PDF + snapshot + NOTE tab, note
 *                           moved FIRST (order), group RTF-D on two tabs,
 *                           one PINNED extra, sidebar open at 320 px, moved
 *   R2 reader window      : PDF + the SAME PDF again (same-window duplicate)
 *   R3 reader window      : ONE document (the 0.19.9 fix)
 *   R4 reader window      : ORPHAN (native tab closed, one extra left)
 *   session "RTF session" : saved from this workspace and ACTIVE (tracked)
 *   focus                 : R1 focused at the end (focused-window restore)
 * Through the bridge: `const t = await IOUtils.readUTF8(path); return await eval(t);`
 */
(async function () {
	const O = Object.assign({ reset: false, prefix: "RTF" }, Zotero._wvFixtureOpts || {});
	const lp = Zotero.Weavero && Zotero.Weavero.plugin;
	if (!lp) throw new Error("Weavero not loaded");
	const W1 = Zotero.getMainWindows()[0];
	const Z1 = W1.Zotero_Tabs;
	const sleep = (ms) => new Promise(r => W1.setTimeout(r, ms));
	const log = [];
	const say = (s) => { log.push(s); try { Zotero.debug("[Weavero][fixture] " + s); } catch (e) {} };
	const lib = Zotero.Libraries.userLibraryID;
	const key = (id) => { const it = Zotero.Items.get(id); return it ? it.libraryID + ":" + it.key : String(id); };

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
	const P = await pickAttachments("application/pdf", 16);
	const E = await pickAttachments("application/epub+zip", 1);
	const S = await pickAttachments("text/html", 2);
	const N = await pickNotes(4);
	if (P.length < 16) throw new Error("need 16 PDF attachments with files not already open, found " + P.length);
	if (N.length < 4) throw new Error("need 4 notes, found " + N.length);
	say("items: " + P.length + " PDFs, " + E.length + " EPUB, " + S.length + " snapshots, " + N.length + " notes");

	// ---------------------------------------------------------- helpers
	const tabOf = (Z, itemID, type) => { const ts = Z._tabs.filter(t => t.data && t.data.itemID === itemID && (!type || String(t.type).startsWith(type))); return ts.length ? ts[ts.length - 1] : null; };
	async function openReaderTab(itemID) {
		await Zotero.Reader.open(itemID, null, { openInWindow: false, allowDuplicate: true });
		await sleep(350);
		const t = tabOf(Z1, itemID, "reader");
		if (!t) throw new Error("reader tab not found for " + itemID);
		return t.id;
	}
	async function openNoteTab(itemID) {
		await W1.ZoteroPane.openNote(itemID, { openInWindow: false });
		await sleep(400);
		const t = tabOf(Z1, itemID, "note");
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
	lp._pinTabByCommand(W1, Zotero.Items.get(P[4]));   // pinned main tab
	await openReaderTab(P[0]);                          // same-window duplicate of an RTF-A member, ungrouped
	await sleep(300);
	try { lp._applyTabGroups(W1); } catch (e) {}
	say("W1: " + Z1._tabs.length + " tabs");

	// -------------------------------------------------------- W2 managed
	const before = new Set(Zotero.getMainWindows());
	lp._wvDevSpawnQueue = lp._wvDevSpawnQueue || [];
	const title = (id) => { try { const it = Zotero.Items.get(id); return it.getDisplayTitle ? it.getDisplayTitle() : (it.getField("title") || ""); } catch (e) { return ""; } };
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
	let W2 = null;
	for (let i = 0; i < 200 && !W2; i++) {
		W2 = Zotero.getMainWindows().find(x => !before.has(x) && x.Zotero_Tabs && x.Zotero_Tabs._tabs && x._wvDevInitDone) || null;
		if (!W2) await sleep(50);
	}
	if (!W2) throw new Error("managed main window did not initialise");
	await sleep(1200);
	const Z2 = W2.Zotero_Tabs;
	const gC = group("C", "yellow");
	for (const id of [P[7], P[8]]) { const t = tabOf(Z2, id); if (t) lp._wvTabGroupAddTab(W2, t.id, gC.id); }
	try { W2.moveTo(200, 120); W2.resizeTo(1100, 750); } catch (e) {}
	await sleep(300);
	say("W2 (managed): " + Z2._tabs.length + " tabs");

	// ------------------------------------------------------ reader windows
	const R1 = await openReaderWindow(P[9]);
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
	const R2 = await openReaderWindow(P[11]);
	await lp._wvWTMountTab(R2, P[11], { select: false, await: true, allowDuplicate: true });   // same-window duplicate
	try { R2.moveTo(300, 200); R2.resizeTo(900, 650); } catch (e) {}
	const R3 = await openReaderWindow(P[12]);                                                  // single document
	try { R3.moveTo(520, 300); R3.resizeTo(800, 600); } catch (e) {}
	const R4 = await openReaderWindow(P[13]);
	await lp._wvWTMountTab(R4, P[14], { select: false, await: true });
	await sleep(300);
	lp._wvWTCloseTab(R4, "wvwt-native");                                                       // orphan
	try { R4.moveTo(100, 420); R4.resizeTo(900, 600); } catch (e) {}
	await sleep(500);
	say("reader windows: " + readerWins().map(w => ((w._wvWT && w._wvWT.tabs) || []).length + " tab(s)").join(", "));

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

	const summary = {
		items: { pdfs: P.map(key), epub: E.map(key), snapshots: S.map(key), notes: N.map(key) },
		mains: Zotero.getMainWindows().map(w => ({ name: lp._wvWindowName(w), tabs: w.Zotero_Tabs._tabs.length, managed: !!w._wvManagedWindow })),
		readers: readerWins().map(w => ({ tabs: ((w._wvWT && w._wvWT.tabs) || []).map(t => (t.native ? "N:" : "") + key(t.itemID) + (t.pinned ? "[pin]" : "") + (t.wvGroupId ? "[grp]" : "")), orphan: !((w._wvWT && w._wvWT.tabs) || []).some(t => t.native) })),
		groups: lp._tabGroupsGet().filter(g => String(g.name || "").startsWith(O.prefix + "-")).map(g => ({ name: g.name, color: g.color, collapsed: !!g.collapsed, saved: !!g.saved, members: (g.members || []).length })),
		pinnedMain: lp._pinnedTabsGet(),
		session: sess && sess.name,
		log,
	};
	Zotero._wvFixtureLast = summary;
	return JSON.stringify(summary, null, 1);
})();
