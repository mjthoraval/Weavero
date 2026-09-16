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
		await writeJSON(pendingPath, pending);
		win.setTimeout(() => { try { Zotero.Utilities.Internal.quit(true); } catch (e) {} }, 600);
		return "before.json written (" + before.mains.length + " main, " + before.readers.length
			+ " reader window(s)); backup in " + bk + ". Restarting in 0.6 s"
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
		const missing = bk.filter(k => !ak.includes(k)), added = ak.filter(k => !bk.includes(k));
		if (missing.length) FAIL.push(label + ": tabs missing: " + missing.join(", "));
		if (added.length) WARN.push(label + ": tabs added: " + added.join(", "));
		if (!missing.length && !added.length && J(bk) !== J(ak)) FAIL.push(label + ": tab ORDER changed");
		const bs = bm.tabs.find(t => t.sel), as = am.tabs.find(t => t.sel);
		if ((bs && tabKey(bs)) !== (as && tabKey(as))) FAIL.push(label + ": selected tab " + (bs && tabKey(bs)) + " -> " + (as && tabKey(as)));
		bm.tabs.forEach(bt => {
			const at = am.tabs.find(t => tabKey(t) === tabKey(bt));
			if (!at) return;
			if ((bt.grp || null) !== (at.grp || null)) FAIL.push(label + ": group stamp of " + tabKey(bt) + " " + bt.grp + " -> " + at.grp);
			if (bt.page != null && at.page != null && bt.page !== at.page) WARN.push(label + ": page of " + tabKey(bt) + " " + bt.page + " -> " + at.page);
		});
		if (!sameGeom(bm.geom, am.geom)) FAIL.push(label + ": geometry " + J(bm.geom) + " -> " + J(am.geom));
		if (J(bm.collection) !== J(am.collection)) FAIL.push(label + ": collection " + J(bm.collection) + " -> " + J(am.collection));
		if (J(bm.itemPane) !== J(am.itemPane)) WARN.push(label + ": item pane " + J(bm.itemPane) + " -> " + J(am.itemPane));
		if (!missing.length && !added.length) OK.push(label + ": " + bk.length + " tabs, order, selection, geometry");
	});
	afterMains.filter(Boolean).forEach(am => WARN.push("extra main window after restart: '" + am.name + "'"));

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
		const missing = bk.filter(k => !ak.includes(k)), added = ak.filter(k => !bk.includes(k));
		if (missing.length) FAIL.push(label + ": tabs missing: " + missing.join(", "));
		if (added.length) WARN.push(label + ": tabs added: " + added.join(", "));
		if (!missing.length && !added.length && J(bk) !== J(ak)) FAIL.push(label + ": tab ORDER changed");
		br.tabs.forEach(bt => {
			const at = ar.tabs.find(t => tabKey(t) === tabKey(bt));
			if (!at) return;
			if (!!bt.pinned !== !!at.pinned) FAIL.push(label + ": pinned flag of " + tabKey(bt) + " changed");
			if ((bt.grp || null) !== (at.grp || null)) FAIL.push(label + ": group stamp of " + tabKey(bt) + " " + bt.grp + " -> " + at.grp);
			if (!!bt.sel !== !!at.sel) FAIL.push(label + ": selected flag of " + tabKey(bt) + " changed");
			if (bt.page != null && at.page != null && bt.page !== at.page) WARN.push(label + ": page of " + tabKey(bt) + " " + bt.page + " -> " + at.page);
		});
		if (!sameGeom(br.geom, ar.geom)) FAIL.push(label + ": geometry " + J(br.geom) + " -> " + J(ar.geom));
		if (J(br.sb) !== J(ar.sb)) WARN.push(label + ": sidebar " + J(br.sb) + " -> " + J(ar.sb));
		if (!missing.length && !added.length) OK.push(label + ": " + bk.length + " tabs (" + ar.tabs.filter(t => t.lazy).length + " lazy), pins, groups, geometry");
	});
	afterReaders.filter(Boolean).forEach(ar => WARN.push("extra reader window after restart: [" + ar.tabs.map(tabKey).join(", ") + "]"));

	// groups, sessions, focus, note wiring, companions, errors
	const bg = new Map((before.groups || []).map(g => [g.id, g]));
	(after.groups || []).forEach(g => {
		const b = bg.get(g.id);
		if (!b) { WARN.push("group '" + g.name + "' is new after restart"); return; }
		bg.delete(g.id);
		for (const k of ["name", "color", "saved", "collapsed"]) if (J(b[k]) !== J(g[k])) FAIL.push("group '" + b.name + "': " + k + " " + J(b[k]) + " -> " + J(g[k]));
		if (J(b.members) !== J(g.members)) FAIL.push("group '" + b.name + "': members " + J(b.members) + " -> " + J(g.members));
	});
	bg.forEach(b => FAIL.push("group '" + b.name + "' missing after restart"));
	if (J(before.sessions) !== J(after.sessions)) FAIL.push("tab-sessions digest changed: " + J(before.sessions) + " -> " + J(after.sessions));
	else OK.push("tab-sessions store digest identical");
	if (J(before.focused) !== J(after.focused)) FAIL.push("focused window " + J(before.focused) + " -> " + J(after.focused));
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
