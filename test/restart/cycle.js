/* Weavero — restart-reliability cycle: ONE script, run TWICE.
 *
 *   1st run (before): backs up session.json + weavero/*.json, snapshots the
 *           workspace to <data dir>/weavero/restart-test/before.json, arms
 *           startup logging, and restarts Zotero.
 *   2nd run (after):  waits for the restored workspace to settle, snapshots
 *           it to after.json, diffs the two, writes report.md and returns the
 *           verdict (PASS / FAIL with every difference listed).
 *
 * Run it from Tools → Developer → Run JavaScript ("Run as async function"
 * checked): paste the file, run, read the returned text. Through the dev
 * bridge, evaluate the file's TEXT and await the promise it returns:
 *   const t = await IOUtils.readUTF8("<repo>\\test\\restart\\cycle.js");
 *   return await eval(t);
 * (`Services.scriptloader.loadSubScript` runs it detached and returns
 * nothing, so an error inside would be swallowed — verified 2026-09-16.)
 * The capture itself is snapshot.js in this directory (loaded by path, see
 * the `root` option); it stays runnable on its own.
 *
 * Options — set BEFORE running, e.g. in the same Run JavaScript box:
 *   Zotero._wvRestartOpts = {
 *     root: "D:\\path\\to\\Weavero\\GitHub\\test\\restart\\",  // where snapshot.js lives
 *     restarts: 1,      // 2 = the "two quick restarts" leg: the run after the
 *                       //     first restart restarts AGAIN at once; the after
 *                       //     snapshot is taken on the run after the last one
 *     noQuit: false,    // true = crash leg: write before.json, print the PID,
 *                       //     then YOU kill the process (no clean quit)
 *     phase: "auto",    // force "before" / "after" (auto = pending.json decides)
 *     settleMs: 90000,  // max wait for the restore to settle
 *     reloadFirst: false, // hot-reload the plugin, THEN capture + restart: a
 *                       //     reload once rewrote windows.json with one entry
 *                       //     (July run 2, defect 5)
 *     loadingAtQuit: false, // select an UNLOADED tab of the anchor window right
 *                       //     before quitting so it is mid-load when the session
 *                       //     is saved (`reader-loading` used to be dropped, 9f9eaa9)
 *   };
 *
 * Why one script: the July 2026 protocol was nine hand steps (backup, two
 * snapshots, a port probe, a quit, an eye-diff) and the eye-diff missed a
 * window landing on the other monitor (2026-08-21). The diff here compares
 * the whole geometry object, tolerates only what a restart legitimately
 * changes (lazy/unloaded tabs), and fails on everything else.
 */
(async function () {
	const O = Object.assign({
		root: (typeof Zotero._wvRestartRoot === "string" && Zotero._wvRestartRoot)
			|| "D:\\MyData\\Code\\Zotero\\Weavero\\GitHub\\test\\restart\\",
		restarts: 1,
		noQuit: false,
		phase: "auto",
		settleMs: 90000,
		reloadFirst: false,
		loadingAtQuit: false,
	}, Zotero._wvRestartOpts || {});

	const dataDir = Zotero.DataDirectory.dir;
	const DIR = PathUtils.join(dataDir, "weavero", "restart-test");
	const P = (f) => PathUtils.join(DIR, f);
	const win = Zotero.getMainWindows()[0];
	const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
	const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	await IOUtils.makeDirectory(DIR, { ignoreExisting: true });

	const exists = async (p) => { try { return await IOUtils.exists(p); } catch (e) { return false; } };
	const readJSON = async (p) => JSON.parse(await IOUtils.readUTF8(p));
	const writeJSON = (p, o) => IOUtils.writeUTF8(p, JSON.stringify(o, null, 1), { tmpPath: p + ".tmp" });

	// The capture: snapshot.js has a top-level `return` (Run JavaScript
	// style), so it is compiled as an async function body, not loaded as a
	// script.
	async function capture() {
		const text = await IOUtils.readUTF8(PathUtils.join(O.root, "snapshot.js"));
		const AF = Object.getPrototypeOf(async function () {}).constructor;
		const fn = new AF("Zotero", "Services", "ChromeUtils", "PathUtils", "IOUtils", text);
		const json = await fn(Zotero, Services, ChromeUtils, PathUtils, IOUtils);
		return typeof json === "string" ? JSON.parse(json) : json;
	}

	// ---------------------------------------------------------------- BEFORE
	const pendingPath = P("pending.json");
	let pending = (await exists(pendingPath)) ? await readJSON(pendingPath) : null;
	const phase = O.phase !== "auto" ? O.phase : (pending ? "after" : "before");

	if (phase === "before") {
		const bk = P("backup-" + stamp());
		await IOUtils.makeDirectory(bk, { ignoreExisting: true });
		const copied = [];
		const sess = PathUtils.join(PathUtils.profileDir, "session.json");
		if (await exists(sess)) { await IOUtils.copy(sess, PathUtils.join(bk, "session.json")); copied.push("session.json"); }
		const wvDir = PathUtils.join(dataDir, "weavero");
		for (const child of await IOUtils.getChildren(wvDir)) {
			if (child.endsWith(".json")) {
				await IOUtils.copy(child, PathUtils.join(bk, PathUtils.filename(child)));
				copied.push(PathUtils.filename(child));
			}
		}
		if (O.reloadFirst) {
			// Reload leg: the plugin's destroy() must capture + freeze the store,
			// and the fresh instance must NOT rewrite it with a partial view.
			const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
			const a = await AddonManager.getAddonByID("weavero@mjthoraval");
			await a.reload();
			await sleep(4000);
		}
		if (O.loadingAtQuit) {
			// Pick an UNLOADED reader tab of the anchor window and select it: it
			// is `reader-loading` while the quit save runs. Capture AFTER the
			// select so the before snapshot carries the new selection.
			const Z = win.Zotero_Tabs;
			const t = Z._tabs.find(x => x.type === "reader-unloaded");
			if (t) { Z.select(t.id); await sleep(30); }
		}
		const before = await capture();
		await writeJSON(P("before.json"), before);
		pending = {
			startedAt: new Date().toISOString(),
			quitAt: null,
			restartsLeft: Math.max(0, (O.restarts | 0) - 1),
			backup: bk,
			mode: O.noQuit ? "crash" : "quit",
			zotero: Zotero.version,
			weavero: (Zotero.Weavero && Zotero.Weavero.plugin && Zotero.Weavero.plugin._version) || null,
		};
		Zotero.Prefs.set("debug.store", true);          // capture the next startup's restore log
		const pid = Services.appinfo.processID;
		if (O.noQuit) {
			await writeJSON(pendingPath, pending);
			return "before.json written (" + before.mains.length + " main, " + before.readers.length
				+ " reader window(s)); backup in " + bk + ".\nCRASH LEG: kill the process now, NOT a clean quit:"
				+ "\n  PowerShell:  Stop-Process -Id " + pid + " -Force"
				+ "\nthen start Zotero again and run cycle.js once more.";
		}
		pending.quitAt = new Date().toISOString();
		pending.legs = { reloadFirst: !!O.reloadFirst, loadingAtQuit: !!O.loadingAtQuit, restarts: O.restarts | 0 };
		await writeJSON(pendingPath, pending);
		// loadingAtQuit: 400 ms leaves a PDF still loading at quit (the point of
		// the leg) without quitting inside Zotero's own tab-switch: at 150 ms
		// Zotero had not finished switching and its quit save recorded the
		// PREVIOUS tab as selected (both stores agreed, 2026-09-16) -- Zotero's
		// race, not a restore loss, so the selection check is a warning under
		// this leg (see the after phase).
		win.setTimeout(() => { try { Zotero.Utilities.Internal.quit(true); } catch (e) {} }, O.loadingAtQuit ? 400 : 600);
		return "before.json written (" + before.mains.length + " main, " + before.readers.length
			+ " reader window(s)); backup in " + bk + ". Restarting in " + (O.loadingAtQuit ? "0.4" : "0.6") + " s"
			+ (pending.restartsLeft ? " (" + pending.restartsLeft + " more quick restart(s) armed)" : "")
			+ " — run cycle.js again once Zotero is back.";
	}

	// ------------------------------------------------- QUICK-RESTART LEG
	if (pending && pending.restartsLeft > 0) {
		pending.restartsLeft -= 1;
		pending.quitAt = new Date().toISOString();
		await writeJSON(pendingPath, pending);
		win.setTimeout(() => { try { Zotero.Utilities.Internal.quit(true); } catch (e) {} }, 600);
		return "Quick-restart leg: restarting AGAIN without a snapshot (" + pending.restartsLeft
			+ " left). Run cycle.js once more when Zotero is back.";
	}

	// ----------------------------------------------------------------- AFTER
	if (!pending) return "No pending cycle (no before.json in flight). Run once to take the BEFORE snapshot.";
	const t0 = Date.now();
	const digest = () => {
		try {
			const mains = Zotero.getMainWindows().map(w => (w.Zotero_Tabs && w.Zotero_Tabs._tabs || []).length);
			let readers = 0, rtabs = 0;
			const en = Services.wm.getEnumerator("zotero:reader");
			while (en.hasMoreElements()) { const w = en.getNext(); readers++; rtabs += ((w._wvWT && w._wvWT.tabs) || []).length; }
			return mains.join(",") + "|" + readers + "|" + rtabs + "|" + (Zotero.Weavero && Zotero.Weavero.plugin ? 1 : 0);
		} catch (e) { return "err"; }
	};
	// Settle: the restore is progressive (anchor window, managed windows,
	// reader windows last, up to ~35 s). Two identical digests 3 s apart,
	// with the plugin present, count as settled.
	let last = null, same = 0, settledMs = null;
	while (Date.now() - t0 < O.settleMs) {
		const d = digest();
		if (d === last && d.endsWith("|1")) { same++; if (same >= 2) { settledMs = Date.now() - t0; break; } }
		else same = 0;
		last = d;
		await sleep(3000);
	}
	const after = await capture();
	await writeJSON(P("after.json"), after);
	const before = await readJSON(P("before.json"));

	// ------------------------------------------------------------------ DIFF
	const FAIL = [], WARN = [], OK = [];
	const J = (x) => JSON.stringify(x);
	// `reader-unloaded` / `note-loading` are the same tab as `reader` / `note`:
	// lazy restore is expected, a transient load state is not a difference.
	const tabKey = (t) => String(t.type || "").replace(/-(unloaded|loading)$/, "") + ":" + (t.key || "?");
	const sameGeom = (a, b) => a && b && ["x", "y", "w", "h", "st"].every(k => a[k] === b[k]);
	// A window MINIMIZED at capture time reports Windows' off-screen parking
	// coordinates (snapshot stores x/y as null) and a 160x28 box: nothing to
	// compare against, and the restore legitimately brings it back at its
	// pre-minimize size. Warn instead of fail (seen 2026-09-16, third cycle).
	// Multiset difference: duplicates (the same item open twice in a window)
	// must be matched copy for copy — `includes` collapsed them (July fixture
	// had same-window and cross-window duplicates that a set diff never saw).
	const multiDiff = (bk, ak) => {
		const c = new Map();
		for (const k of bk) c.set(k, (c.get(k) || 0) + 1);
		for (const k of ak) c.set(k, (c.get(k) || 0) - 1);
		const missing = [], added = [];
		for (const [k, n] of c) { for (let i = 0; i < n; i++) missing.push(k); for (let i = 0; i > n; i--) added.push(k); }
		return { missing, added };
	};
	const geomCheck = (label, bg, ag) => {
		if (bg && bg.x == null) { WARN.push(label + ": geometry not comparable, window minimized at capture -> " + J(ag)); return; }
		if (!sameGeom(bg, ag)) FAIL.push(label + ": geometry " + J(bg) + " -> " + J(ag));
	};

	// main windows: by name, then by position
	const afterMains = after.mains.slice();
	before.mains.forEach((bm, i) => {
		let j = afterMains.findIndex(am => am && am.name === bm.name);
		if (j < 0) j = afterMains.findIndex(am => am);
		const am = j >= 0 ? afterMains[j] : null;
		if (!am) { FAIL.push("main window '" + bm.name + "' missing after restart"); return; }
		afterMains[j] = null;
		const label = "main '" + bm.name + "'";
		const bk = bm.tabs.map(tabKey), ak = am.tabs.map(tabKey);
		const { missing, added } = multiDiff(bk, ak);
		if (missing.length) FAIL.push(label + ": tabs missing: " + missing.join(", "));
		if (added.length) FAIL.push(label + ": tabs ADDED (spawn mirror / stale store): " + added.join(", "));
		if (!missing.length && !added.length && J(bk) !== J(ak)) FAIL.push(label + ": tab ORDER changed");
		const bs = bm.tabs.find(t => t.sel), as = am.tabs.find(t => t.sel);
		if ((bs && tabKey(bs)) !== (as && tabKey(as))) {
			// Under loadingAtQuit the selection was changed a few hundred ms
			// before the quit; if Zotero's own quit save still carried the
			// previous tab, that is Zotero's tab-switch race, not a restore
			// loss -- report it, do not fail on it.
			((pending.legs && pending.legs.loadingAtQuit) ? WARN : FAIL).push(label + ": selected tab " + (bs && tabKey(bs)) + " -> " + (as && tabKey(as))
				+ ((pending.legs && pending.legs.loadingAtQuit) ? " (loadingAtQuit leg: selection changed right before the quit)" : ""));
		}
		// Stamps and pins compared as MULTISETS of key|value, so a duplicate
		// (one copy grouped, one not; one copy pinned) is matched copy for copy.
		const stampsB = multiDiff(bm.tabs.map(t => tabKey(t) + "|grp=" + (t.grp || "")), am.tabs.map(t => tabKey(t) + "|grp=" + (t.grp || "")));
		if (stampsB.missing.length) FAIL.push(label + ": group stamps changed: " + stampsB.missing.join(", ") + " -> " + stampsB.added.join(", "));
		const pinsB = multiDiff(bm.tabs.filter(t => t.pinned).map(tabKey), am.tabs.filter(t => t.pinned).map(tabKey));
		if (pinsB.missing.length || pinsB.added.length) FAIL.push(label + ": pinned tabs " + J(bm.tabs.filter(t => t.pinned).map(tabKey)) + " -> " + J(am.tabs.filter(t => t.pinned).map(tabKey)));
		// Visible, not merely present: the mirror count must not drop.
		if ((bm.pinnedMirrors || 0) > (am.pinnedMirrors || 0)) FAIL.push(label + ": visible pinned mirrors " + bm.pinnedMirrors + " -> " + am.pinnedMirrors + " (a pin present in the DOM but not on the bar)");
		bm.tabs.forEach(bt => {
			const at = am.tabs.find(t => tabKey(t) === tabKey(bt));
			if (!at) return;
			if (bt.page != null && at.page != null && bt.page !== at.page) WARN.push(label + ": page of " + tabKey(bt) + " " + bt.page + " -> " + at.page);
		});
		geomCheck(label, bm.geom, am.geom);
		if (J(bm.collection) !== J(am.collection)) FAIL.push(label + ": collection " + J(bm.collection) + " -> " + J(am.collection));
		if (J(bm.itemPane) !== J(am.itemPane)) WARN.push(label + ": item pane " + J(bm.itemPane) + " -> " + J(am.itemPane));
		if (!missing.length && !added.length && J(bk) === J(ak)) OK.push(label + ": " + bk.length + " tabs, order kept");
	});
	afterMains.filter(Boolean).forEach(am => FAIL.push("EXTRA main window after restart: '" + am.name + "' (" + am.tabs.length + " tabs)"));

	// reader windows: by best tab-key overlap
	const afterReaders = after.readers.slice();
	before.readers.forEach((br, i) => {
		const bk = br.tabs.map(tabKey);
		let best = -1, bestN = -1;
		afterReaders.forEach((ar, j) => {
			if (!ar) return;
			const n = ar.tabs.map(tabKey).filter(k => bk.includes(k)).length;
			if (n > bestN) { bestN = n; best = j; }
		});
		const label = "reader window #" + (i + 1) + " [" + bk.join(", ") + "]";
		if (best < 0 || bestN === 0) { FAIL.push(label + ": window MISSING after restart (" + bk.length + " tab(s))"); return; }
		const ar = afterReaders[best]; afterReaders[best] = null;
		const ak = ar.tabs.map(tabKey);
		const { missing, added } = multiDiff(bk, ak);
		if (missing.length) FAIL.push(label + ": tabs missing: " + missing.join(", "));
		if (added.length) FAIL.push(label + ": tabs ADDED: " + added.join(", "));
		if (!missing.length && !added.length && J(bk) !== J(ak)) FAIL.push(label + ": tab ORDER changed");
		// An orphan is recreated with its first tab as the NEW native tab (by
		// design): orphan -> anchored is fine; anchored -> orphan is a loss.
		if (!br.orphan && ar.orphan) FAIL.push(label + ": native tab lost, window came back as an orphan");
		else if (br.orphan && !ar.orphan) OK.push(label + ": orphan recreated with a new native tab");
		const sig = t => tabKey(t) + "|grp=" + (t.grp || "") + "|pin=" + (t.pinned ? 1 : 0) + "|sel=" + (t.sel ? 1 : 0);
		const sigs = multiDiff(br.tabs.map(sig), ar.tabs.map(sig));
		if (sigs.missing.length) FAIL.push(label + ": tab stamps/pins/selection changed: " + sigs.missing.join(", ") + " -> " + sigs.added.join(", "));
		br.tabs.forEach(bt => {
			const at = ar.tabs.find(t => tabKey(t) === tabKey(bt));
			if (at && bt.page != null && at.page != null && bt.page !== at.page) WARN.push(label + ": page of " + tabKey(bt) + " " + bt.page + " -> " + at.page);
		});
		geomCheck(label, br.geom, ar.geom);
		// The sidebar is Weavero-restored shared state (ce42d3e): a difference is a loss.
		if (br.sb && J(br.sb) !== J(ar.sb)) FAIL.push(label + ": sidebar " + J(br.sb) + " -> " + J(ar.sb));
		if (!missing.length && !added.length && J(bk) === J(ak) && !sigs.missing.length) OK.push(label + ": " + bk.length + " tabs (" + ar.tabs.filter(t => t.lazy).length + " lazy), order, pins, groups");
	});
	afterReaders.filter(Boolean).forEach(ar => FAIL.push("EXTRA reader window after restart (stale store resurrection, b3ac95d): [" + ar.tabs.map(tabKey).join(", ") + "]"));

	// groups, sessions, focus, note wiring, companions, errors
	// Members of a LIVE group are derived from its open stamped tabs (Weavero
	// prunes closed members after a grace); a group whose member list was
	// already out of step with its open tabs at capture (tabs closed just
	// before, e.g. by the fixture's reset) is reported, not failed. Saved
	// (parked) groups keep their snapshot and must match exactly.
	const openKeysOf = (snap, gid) => {
		const keys = new Set();
		for (const m of snap.mains) for (const t of m.tabs) if (t.grp === gid && t.key) keys.add(t.key);
		for (const r of snap.readers) for (const t of r.tabs) if (t.grp === gid && t.key) keys.add(t.key);
		return [...keys].sort();
	};
	const bg = new Map((before.groups || []).map(g => [g.id, g]));
	(after.groups || []).forEach(g => {
		const b = bg.get(g.id);
		if (!b) { WARN.push("group '" + g.name + "' is new after restart"); return; }
		bg.delete(g.id);
		for (const k of ["name", "color", "saved", "collapsed"]) if (J(b[k]) !== J(g[k])) FAIL.push("group '" + b.name + "': " + k + " " + J(b[k]) + " -> " + J(g[k]));
		if (J(b.members) !== J(g.members)) {
			const consistentBefore = b.saved || J((b.members || []).slice().sort()) === J(openKeysOf(before, g.id));
			(consistentBefore ? FAIL : WARN).push("group '" + b.name + "': members " + J(b.members) + " -> " + J(g.members)
				+ (consistentBefore ? "" : " (member list was already out of step with its open tabs at capture)"));
		}
	});
	bg.forEach(b => FAIL.push("group '" + b.name + "' missing after restart"));
	if (J(before.sessions) !== J(after.sessions)) FAIL.push("tab-sessions digest changed: " + J(before.sessions) + " -> " + J(after.sessions));
	else OK.push("tab-sessions store digest identical");
	if ((before.activeSession || null) !== (after.activeSession || null)) FAIL.push("active session " + before.activeSession + " -> " + after.activeSession);
	if (before.savedWindows != null && before.savedWindows !== after.savedWindows) FAIL.push("saved (parked) windows " + before.savedWindows + " -> " + after.savedWindows);
	// Focus under automation is not evidence either way (a bridge eval, the
	// IDE in front, an occluded window): report it, judge it by eye
	// (docs/gesture-testing.md, focus rules).
	if (J(before.focused) !== J(after.focused)) WARN.push("focused window " + J(before.focused) + " -> " + J(after.focused) + " (verify by eye)");
	else OK.push("focused window restored");
	(after.noteEditors || []).forEach(ne => { if (!ne.wired) FAIL.push("note editor in '" + ne.win + "' loaded WITHOUT Weavero's note-link wiring"); });
	for (const k of Object.keys(before.plugins || {})) if (before.plugins[k] && !(after.plugins || {})[k]) FAIL.push("companion plugin inactive after restart: " + k);
	if (after.errors && after.errors.length) {
		const ours = after.errors.filter(e => /weavero/i.test(String(e)));
		WARN.push(after.errors.length + " console entr(ies) after restart, " + ours.length + " mentioning Weavero"
			+ (ours.length ? "; first: " + String(ours[0]).slice(0, 160) : ""));
	}

	// timings
	let timing = {};
	try {
		const si = Services.startup.getStartupInfo();
		const q = pending.quitAt ? new Date(pending.quitAt).getTime() : null;
		timing = {
			quitToProcessStart: q && si.process ? (si.process.getTime() - q) : null,
			quitToFirstPaint: q && si.firstPaint ? (si.firstPaint.getTime() - q) : null,
			settleWaitMs: settledMs,
			settledDigest: last,
		};
	} catch (e) {}

	// COVERAGE — what the BEFORE workspace actually contained, so a green run
	// on a thin workspace says what it did NOT exercise. Each line is one
	// historical loss (docs/restart-testing.md, traceability table).
	const cov = (() => {
		const s = before, c = [];
		const mainTabs = s.mains.flatMap(m => m.tabs), readerTabs = s.readers.flatMap(r => r.tabs);
		const isNote = t => String(t.type || "").startsWith("note");
		const keyCount = arr => { const m = new Map(); for (const k of arr) m.set(k, (m.get(k) || 0) + 1); return m; };
		let sameWin = 0;
		for (const w of [...s.mains, ...s.readers]) for (const [, n] of keyCount(w.tabs.map(t => t.key))) if (n > 1) sameWin++;
		const seen = new Map();
		for (const w of [...s.mains, ...s.readers]) for (const k of new Set(w.tabs.map(t => t.key))) seen.set(k, (seen.get(k) || 0) + 1);
		let cross = 0; for (const [, n] of seen) if (n > 1) cross++;
		const push = (label, n, essential = true) => c.push({ label, n, essential });
		push("main windows", s.mains.length);
		push("managed (second) main windows", s.mains.filter(m => m.managed).length);
		push("main-window tabs", mainTabs.length);
		push("reader windows, multi-tab", s.readers.filter(r => r.tabs.length > 1 && !r.orphan).length);
		push("reader windows, single document", s.readers.filter(r => r.tabs.length === 1 && !r.orphan).length);
		push("reader windows, orphan (native closed)", s.readers.filter(r => r.orphan).length);
		push("groups live", (s.groups || []).filter(g => !g.saved).length);
		push("groups collapsed", (s.groups || []).filter(g => g.collapsed && !g.saved).length);
		push("groups saved (parked)", (s.groups || []).filter(g => g.saved).length);
		push("grouped tabs in reader windows", readerTabs.filter(t => t.grp).length);
		push("note tabs inside groups", mainTabs.filter(t => t.grp && isNote(t)).length + readerTabs.filter(t => t.grp && t.type === "note").length);
		push("pinned main-window tabs", mainTabs.filter(t => t.pinned).length);
		push("pinned reader-window tabs", readerTabs.filter(t => t.pinned).length);
		push("note tabs in main windows", mainTabs.filter(isNote).length);
		push("selected note tab", mainTabs.filter(t => t.sel && isNote(t)).length);
		push("note tabs in reader windows", readerTabs.filter(t => t.type === "note").length);
		push("same-window duplicates", sameWin);
		push("cross-window duplicates", cross);
		push("EPUB tabs", [...mainTabs, ...readerTabs].filter(t => t.ct === "application/epub+zip").length);
		push("snapshot (HTML) tabs", [...mainTabs, ...readerTabs].filter(t => t.ct === "text/html").length);
		push("reader sidebar open at a custom width", s.readers.filter(r => r.sb && r.sb.open && r.sb.width !== 240).length);
		push("windows moved (x > 0)", [...s.mains, ...s.readers].filter(w => w.geom && w.geom.x != null && w.geom.x > 0).length);
		push("maximized windows", [...s.mains, ...s.readers].filter(w => w.geom && w.geom.st === 1).length);
		push("active named session", s.activeSession ? 1 : 0);
		push("saved (parked) windows", s.savedWindows || 0, false);
		push("companion plugins active", Object.values(s.plugins || {}).filter(Boolean).length, false);
		push("loaded note editors checked for link wiring", (s.noteEditors || []).length);
		c.push({ label: "focused window at quit", n: (s.focused && s.focused.kind) || "?", essential: false });
		return c;
	})();

	const verdict = FAIL.length ? "FAIL" : "PASS";
	const lines = [
		"# Restart cycle — " + verdict + " (" + new Date().toISOString() + ")",
		"",
		"Zotero " + Zotero.version + " · Weavero " + (pending.weavero || "?") + " → "
			+ ((Zotero.Weavero && Zotero.Weavero.plugin && Zotero.Weavero.plugin._version) || "?")
			+ " · mode " + pending.mode + (O.restarts > 1 ? " · quick restarts ×" + O.restarts : ""),
		"Before: " + before.mains.length + " main + " + before.readers.length + " reader window(s), "
			+ before.mains.reduce((a, m) => a + m.tabs.length, 0) + " + " + before.readers.reduce((a, r) => a + r.tabs.length, 0) + " tabs.",
		"Timing: " + J(timing),
		"",
		"## FAIL (" + FAIL.length + ")", ...FAIL.map(s => "- " + s),
		"", "## WARN (" + WARN.length + ")", ...WARN.map(s => "- " + s),
		"", "## OK (" + OK.length + ")", ...OK.map(s => "- " + s),
		"", "## COVERAGE of the before-workspace (" + cov.filter(x => x.essential && !x.n).length + " essential element(s) MISSING)",
		...cov.map(x => "- " + x.label + ": " + x.n + (x.essential && !x.n ? "  <-- MISSING, not exercised" : "")),
		"", "Legs: " + J(pending.legs || {}),
		"", "Files: before.json, after.json in " + DIR + "; backup " + pending.backup + ".",
		"Restore trace: Debug Output filtered on [Weavero][trace]; quit-side breadcrumbs in " + PathUtils.join(dataDir, "weavero", "trace-quit.json") + ".",
	];
	await IOUtils.writeUTF8(P("report.md"), lines.join("\n") + "\n");
	try {
		// IOUtils has no append mode: read + rewrite.
		const hp = P("history.log");
		const prev = (await exists(hp)) ? await IOUtils.readUTF8(hp) : "";
		await IOUtils.writeUTF8(hp, prev + new Date().toISOString() + " " + verdict + " fail=" + FAIL.length + " warn=" + WARN.length
			+ " zotero=" + Zotero.version + " weavero=" + ((Zotero.Weavero && Zotero.Weavero.plugin && Zotero.Weavero.plugin._version) || "?") + "\n");
	} catch (e) {}
	await IOUtils.remove(pendingPath);
	Zotero._wvRestartLast = { verdict, FAIL, WARN, OK, timing };
	return lines.join("\n");
})();
