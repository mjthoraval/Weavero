/* global describe, it, before, after, assert, Zotero */

// Native File / Edit menubar entries for Weavero's window commands (v0.20.2).
//
// Forum comment 518424 (dclunie, macOS): the hamburger -- until then the only
// menu home of New Tab / New Reader Window / New Main Window, and of nothing
// at all for Advanced Search in New Window -- lives in the compact title bar's
// tab strip, which is never built on macOS. A Mac user had the shortcuts and
// no menu. The entries now go through Zotero.MenuManager on the main-window
// File and Edit menus.
//
// The contract under test comes from how that API works: MenuManager has no
// `label` option and RE-APPENDS every custom entry at the BOTTOM of the popup
// on each popupshowing, then runs onShowing. So each entry must label itself,
// move itself into place, re-read its prefs on every open (no reload), and
// never duplicate across opens. Popups are driven with a synthetic
// popupshowing on the popup element itself, which is what Zotero's own
// onUpdateCustomMenus keys on (`event.target !== popup` -> return). The
// entries' commands are driven through the plugin's own menu data
// (`_wvMenubarMenus`): a synthetic `command` never reaches MenuManager's
// listener (chrome listeners ignore untrusted events) and `doCommand()`
// reaches no JS listener either (measured 2026-09-22), while a real click
// is Zotero's path, shared with every MenuManager entry.

describe("Weavero — File / Edit menubar entries for the window commands", () => {
	let wv, win, doc, filePopup, editPopup;
	const saved = {};
	const PREFS = ["enableTabsAndWindows", "newMainWindow"];

	const fire = (type, target) => {
		const ev = doc.createEvent("Event");
		ev.initEvent(type, true, true);
		target.dispatchEvent(ev);
	};
	const open = popup => fire("popupshowing", popup);
	const close = popup => fire("popuphidden", popup);
	const mine = popup => Array.from(popup.querySelectorAll(":scope > [data-wv-menubar]"));
	const visible = popup => mine(popup).filter(el => !el.hidden).map(el => el.dataset.wvMenubar);
	const byKey = (popup, key) => popup.querySelector(':scope > [data-wv-menubar="' + key + '"]');
	const accel = Zotero.isMac ? "⌘" : "Ctrl+";
	const z10 = () => !!doc.getElementById("cmd_zotero_advancedSearch");

	// Swap a plugin method for a recorder, run `body`, restore -- whether the
	// original lived on the instance or came through Object.assign.
	const withStub = async (name, body) => {
		const own = Object.prototype.hasOwnProperty.call(wv, name);
		const orig = wv[name];
		const calls = [];
		wv[name] = function (...args) { calls.push(args); };
		try { await body(calls); }
		finally { if (own) wv[name] = orig; else delete wv[name]; }
	};

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv) this.skip();
		if (!(Zotero.MenuManager && typeof Zotero.MenuManager.registerMenu === "function")) this.skip();
		win = Zotero.getMainWindow();
		doc = win.document;
		filePopup = doc.getElementById("menu_FilePopup");
		editPopup = doc.getElementById("menu_EditPopup");
		assert.ok(filePopup && editPopup, "main-window File / Edit popups");
		for (const k of PREFS) saved[k] = Zotero.Prefs.get("weavero." + k);
		Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
		Zotero.Prefs.set("weavero.newMainWindow", true);
	});

	after(() => {
		// Both prefs have default-branch values, so `set` back is enough (never
		// clearUserPref: a cleared pref can't be re-created until restart).
		for (const k of PREFS) if (saved[k] !== undefined) Zotero.Prefs.set("weavero." + k, saved[k]);
		try { close(filePopup); close(editPopup); } catch (e) {}
	});

	it("File: New Tab / New Reader Window / New Main Window lead the menu, hamburger order, then a separator", () => {
		open(filePopup);
		try {
			const kids = Array.from(filePopup.children);
			assert.deepEqual(kids.slice(0, 4).map(el => el.dataset.wvMenubar),
				["newtab", "newreaderwin", "newmainwin", "sep"], "first four children");
			assert.strictEqual(kids[0].getAttribute("label"), "New Tab…");
			assert.strictEqual(kids[0].getAttribute("acceltext"), accel + "T");
			assert.strictEqual(kids[1].getAttribute("label"), "New Reader Window…");
			assert.strictEqual(kids[1].getAttribute("acceltext"), null, "no shortcut for the picker");
			assert.strictEqual(kids[2].getAttribute("label"), "New Main Window");
			assert.strictEqual(kids[2].getAttribute("acceltext"), accel + "N");
			assert.strictEqual(kids[3].localName, "menuseparator");
			assert.strictEqual(kids[4].id, "menu_newItem", "Zotero's own New Item follows");
			assert.deepEqual(visible(filePopup), ["newtab", "newreaderwin", "newmainwin", "sep"]);
		}
		finally { close(filePopup); }
	});

	it("Edit: Advanced Search in New Window sits right under Zotero's Advanced Search (Zotero 10 only)", () => {
		open(editPopup);
		try {
			const el = byKey(editPopup, "advsearchwin");
			assert.ok(el, "entry registered on the Edit menu");
			if (!z10()) {
				assert.ok(el.hidden, "no in-main Advanced Search command: the entry stays hidden");
				return;
			}
			const anchor = doc.getElementById("menu_advancedSearch");
			assert.strictEqual(anchor.nextElementSibling, el, "directly after menu_advancedSearch");
			assert.strictEqual(el.getAttribute("label"), "Advanced Search in New Window");
			// The remapped shortcut is on by default, so the entry carries it;
			// with the remap off it says "Shift+Click" (the remap test covers both).
			const remap = Zotero.Prefs.get("weavero.advSearchShortcutNewWindow") !== false;
			assert.strictEqual(el.getAttribute("acceltext"), remap ? (Zotero.isMac ? "⇧⌘F" : "Ctrl+Shift+F") : "Shift+Click");
			assert.ok(!el.hidden);
		}
		finally { close(editPopup); }
	});

	it("reopening never duplicates an entry and keeps the order", () => {
		for (let i = 0; i < 3; i++) { open(filePopup); close(filePopup); open(editPopup); close(editPopup); }
		open(filePopup); open(editPopup);
		try {
			assert.strictEqual(mine(filePopup).length, 4, "File: three entries + separator, once");
			assert.deepEqual(Array.from(filePopup.children).slice(0, 4).map(el => el.dataset.wvMenubar),
				["newtab", "newreaderwin", "newmainwin", "sep"]);
			assert.strictEqual(mine(editPopup).length, 1, "Edit: one entry, once");
		}
		finally { close(filePopup); close(editPopup); }
	});

	it("Multiple main windows off hides the two entries that open one -- and closes every other route", async () => {
		Zotero.Prefs.set("weavero.newMainWindow", false);
		try {
			open(filePopup); open(editPopup);
			assert.deepEqual(visible(filePopup), ["newtab", "newreaderwin", "sep"]);
			assert.ok(byKey(editPopup, "advsearchwin").hidden, "Advanced Search in New Window hidden");
			close(filePopup); close(editPopup);
			// The one switch for a second main window (v0.20.2): the openers
			// themselves refuse, so Ctrl+N, the hamburger and the item menus
			// are covered at the source, whatever built them.
			const origOpen = Zotero.openMainWindow; let opened = 0;
			Zotero.openMainWindow = () => { opened++; };
			try {
				wv._wvOpenEmptyMainWindow();
				assert.strictEqual(opened, 0, "New Main Window refused");
				assert.isFalse(wv._wvMultiMainOn());
				Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
				await withStub("_wvAdvSearchOpenNewWindow", async (calls) => {
					if (doc._wvAdvSearchKeyHandler) doc._wvAdvSearchKeyHandler({ key: "F", shiftKey: true, altKey: false, ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac, preventDefault() {}, stopPropagation() {} });
					assert.strictEqual(calls.length, 0, "the remapped shortcut is off with the switch");
				});
			}
			finally { Zotero.openMainWindow = origOpen; Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true); }
		}
		finally { Zotero.Prefs.set("weavero.newMainWindow", true); }
		open(filePopup); open(editPopup);
		try {
			assert.deepEqual(visible(filePopup), ["newtab", "newreaderwin", "newmainwin", "sep"]);
			assert.strictEqual(byKey(editPopup, "advsearchwin").hidden, !z10());
		}
		finally { close(filePopup); close(editPopup); }
	});

	it("the Tabs and Windows master off hides all of them, separator included", () => {
		Zotero.Prefs.set("weavero.enableTabsAndWindows", false);
		try {
			open(filePopup); open(editPopup);
			assert.deepEqual(visible(filePopup), []);
			assert.ok(byKey(editPopup, "advsearchwin").hidden);
			assert.strictEqual(Array.from(filePopup.children).filter(el => !el.hidden)[0].id, "menu_newItem",
				"nothing of Weavero's shows above New Item");
		}
		finally {
			close(filePopup); close(editPopup);
			Zotero.Prefs.set("weavero.enableTabsAndWindows", true);
		}
	});

	it("each entry's command reaches the live plugin's handler with this window", async () => {
		const menus = wv._wvMenubarMenus;
		assert.ok(menus && menus.file && menus.edit, "menu data exposed by the registration");
		const cases = [
			["newtab", menus.file[0], "_wvMainNewTabPicker", filePopup, true],
			["newreaderwin", menus.file[1], "_wvNewReaderWindowPicker", filePopup, true],
			["newmainwin", menus.file[2], "_wvOpenEmptyMainWindow", filePopup, false],
		];
		if (z10()) cases.push(["advsearchwin", menus.edit[0], "_wvAdvSearchOpenNewWindow", editPopup, false]);
		for (const [key, data, method, popup, takesWin] of cases) {
			await withStub(method, async (calls) => {
				open(popup);
				try {
					const el = byKey(popup, key);
					assert.ok(el && !el.hidden, key + " shown");
					data.onCommand(null, { menuElem: el });
					assert.strictEqual(calls.length, 1, key + " -> " + method + " once");
					if (takesWin) assert.strictEqual(calls[0][0], win, key + " gets the main window");
				}
				finally { close(popup); }
			});
		}
	});

	// The hamburger (Windows/Linux compact title bar) mirrors the live File
	// popup and already leads with its own New Tab / New Reader Window / New
	// Main Window -- opened from there, the three File entries hide (the Edit
	// entry has no twin and stays). The discriminator is the popup's
	// anchorNode: a menu inside #wv-hamburger-popup, vs #fileMenu from the
	// menubar. A real openPopup is needed for anchorNode; no hamburger in
	// this window (macOS, or the compact title bar off) skips the case.
	it("opened from the hamburger, the three File entries and their separator hide", async function () {
		const hp = doc.getElementById("wv-hamburger-popup");
		if (!hp) this.skip();
		const anchor = doc.createXULElement("menu");
		anchor.setAttribute("label", "wv-spec-anchor");
		hp.appendChild(anchor);
		const shown = new Promise(r => filePopup.addEventListener("popupshowing", r, { once: true }));
		try {
			filePopup.openPopup(anchor, "after_start", 0, 0, false, false);
			const ok = await Promise.race([shown.then(() => true), new Promise(r => win.setTimeout(() => r(false), 3000))]);
			if (!ok) this.skip();   // popups do not open in this runner window
			assert.deepEqual(visible(filePopup), [], "nothing of Weavero's in the mirrored File");
			assert.strictEqual(mine(filePopup).length, 4, "entries exist, hidden -- not removed");
		}
		finally {
			try { filePopup.hidePopup(); } catch (e) {}
			anchor.remove();
			await new Promise(r => win.setTimeout(r, 100));
		}
		// From the menubar (a synthetic showing has no anchor, like the real one
		// on macOS has #fileMenu): all back.
		open(filePopup);
		try { assert.deepEqual(visible(filePopup), ["newtab", "newreaderwin", "newmainwin", "sep"]); }
		finally { close(filePopup); }
	});

	// Settings → "Ctrl+Shift+F / ⇧⌘F opens Advanced Search in a new window":
	// the shortcut becomes ours (a capture keydown in the default group runs
	// before Zotero's <key>, which sits in the system group and returns once
	// the event is default-prevented -- Gecko GlobalKeyListener.cpp), the Edit
	// entry shows it, and Zotero's own Advanced Search line loses it (its
	// acceltext is rebuilt from `key`, so the attribute moves). Trusted key
	// events cannot be made here: the handler is called with a stand-in.
	it("the remapped shortcut: handler logic, and the acceltext moves between the two Edit lines", async function () {
		if (!doc.getElementById("cmd_zotero_advancedSearch")) this.skip();   // Zotero 9
		const savedPref = Zotero.Prefs.get("weavero.advSearchShortcutNewWindow");
		const anchor = doc.getElementById("menu_advancedSearch");
		const handler = doc._wvAdvSearchKeyHandler;
		assert.isFunction(handler, "keydown handler wired on the main document");
		const ev = (o) => Object.assign({
			key: "F", shiftKey: true, altKey: false, ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac,
			prevented: 0, stopped: 0,
			preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; },
		}, o);
		const shortcut = Zotero.isMac ? "⇧⌘F" : "Ctrl+Shift+F";
		try {
			await withStub("_wvAdvSearchOpenNewWindow", async (calls) => {
				Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", false);
				let e = ev({}); handler(e);
				assert.strictEqual(calls.length, 0, "off: Zotero keeps its key");
				assert.strictEqual(e.prevented, 0);
				Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
				e = ev({}); handler(e);
				assert.strictEqual(calls.length, 1, "on: the shortcut opens the new window");
				assert.strictEqual(e.prevented, 1, "and Zotero's <key> is pre-empted");
				const others = [{ shiftKey: false }, { altKey: true }, { key: "g" },
					Zotero.isMac ? { metaKey: false } : { ctrlKey: false }];
				for (const o of others) { e = ev(o); handler(e); }
				assert.strictEqual(calls.length, 1, "every other chord untouched");
			});
			Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", true);
			open(editPopup);
			try {
				assert.strictEqual(byKey(editPopup, "advsearchwin").getAttribute("acceltext"), shortcut, "our entry shows the shortcut");
				assert.isFalse(anchor.hasAttribute("key"), "Zotero's line no longer claims it");
			}
			finally { close(editPopup); }
			Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", false);
			open(editPopup);
			try {
				assert.strictEqual(byKey(editPopup, "advsearchwin").getAttribute("acceltext"), "Shift+Click");
				assert.strictEqual(anchor.getAttribute("key"), "key_advancedSearch", "and gets it back");
			}
			finally { close(editPopup); }
		}
		finally { Zotero.Prefs.set("weavero.advSearchShortcutNewWindow", savedPref === undefined ? true : !!savedPref); }
	});

	// The Advanced Search window opens at a modest size, centred, and
	// remembers a resize -- never the primary's maximized state (a new main
	// window without explicit width/height inherits `sizemode=maximized`).
	it("the Advanced Search window: explicit size features, remembered on resize, never maximized", () => {
		const saved = Zotero.Prefs.get("weavero.advSearchWindowSize");
		try {
			Zotero.Prefs.set("weavero.advSearchWindowSize", "");
			let f = wv._wvAdvSearchWindowFeatures();
			assert.include(f, "width=1100,height=720", "default");
			assert.include(f, "centerscreen");
			assert.include(f, "resizable=yes");
			Zotero.Prefs.set("weavero.advSearchWindowSize", "1100x720");
			assert.include(wv._wvAdvSearchWindowFeatures(), "width=1100,height=720", "remembered size");
			Zotero.Prefs.set("weavero.advSearchWindowSize", "huge");
			assert.include(wv._wvAdvSearchWindowFeatures(), "width=1100,height=720", "garbage falls back");
			// The remember hook: a stand-in window with a synchronous timer.
			Zotero.Prefs.set("weavero.advSearchWindowSize", "");
			const listeners = {};
			const fake = {
				closed: false, windowState: 3, STATE_NORMAL: 3, STATE_MAXIMIZED: 1,
				innerWidth: 1000, innerHeight: 700, outerWidth: 1016, outerHeight: 708,
				addEventListener(t, fn) { listeners[t] = fn; },
				setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
			};
			wv._wvAdvSearchRememberSize(fake);
			assert.isFunction(listeners.resize, "resize listener wired");
			listeners.resize();
			assert.strictEqual(Zotero.Prefs.get("weavero.advSearchWindowSize"), "1000x700", "the INNER size is stored (features set the content area)");
			fake.windowState = 1; fake.innerWidth = 1920; fake.innerHeight = 1160;
			listeners.resize();
			assert.strictEqual(Zotero.Prefs.get("weavero.advSearchWindowSize"), "1000x700", "a maximized size is not stored");
			fake.windowState = 3; fake.innerWidth = 1180; fake.innerHeight = 760;
			fake.closed = true;   // Gecko reports closed === true during unload
			assert.isFunction(listeners.unload, "unload listener wired");
			listeners.unload();
			assert.strictEqual(Zotero.Prefs.get("weavero.advSearchWindowSize"), "1180x760", "the final size at unload");
			wv._wvAdvSearchRememberSize(fake);
			assert.ok(fake._wvAdvSearchSizeWired, "wired once");
		}
		finally { Zotero.Prefs.set("weavero.advSearchWindowSize", saved === undefined ? "" : saved); }
	});

	// The Advanced Search window opens on the WHOLE library, whatever the
	// source window shows: its collections pane is hidden by default, so a
	// window scoped to an invisible sub-collection would search less than it
	// appears to (MJT, 2026-09-22 -- a source-collection landing was built
	// and reverted the same day). The list loads once at open; every search
	// then runs against the full library.
	it("the Advanced Search window opens on the whole library, not the source window's collection", async function () {
		this.timeout(40000);
		if (!doc.getElementById("cmd_zotero_advancedSearch")) this.skip();   // Zotero 9
		const saved = Zotero.Prefs.get("weavero.newMainWindow");
		Zotero.Prefs.set("weavero.newMainWindow", true);
		const coll = new Zotero.Collection(); coll.name = "wv-advsearch-source-" + Date.now();
		await coll.saveTx();
		const cv = win.ZoteroPane.collectionsView;
		let nw = null;
		try {
			await cv.selectByID("C" + coll.id);
			await new Promise(r => win.setTimeout(r, 300));
			const before = new Set(Zotero.getMainWindows());
			wv._wvAdvSearchOpenNewWindow();
			for (let i = 0; i < 100 && !nw; i++) { await new Promise(r => win.setTimeout(r, 100)); nw = Zotero.getMainWindows().find(w => !before.has(w)); }
			assert.ok(nw, "a new main window");
			const selectedRow = () => { try { const ncv = nw.ZoteroPane.collectionsView; return ncv.getRow(ncv.selection.focused); } catch (e) { return null; } };
			await new Promise(r => win.setTimeout(r, 4000));   // the clean start re-asserts for ~2.5 s
			const row = selectedRow();
			assert.ok(row && row.isLibrary && row.isLibrary(), "My Library, not " + (row && row.getName()));
			assert.strictEqual(nw.document.getElementById("zotero-advanced-search-pane-deck").state, "open", "with the search open");
		}
		finally {
			try { if (nw) nw.close(); } catch (e) {}
			await new Promise(r => win.setTimeout(r, 500));
			try { await cv.selectLibrary(Zotero.Libraries.userLibraryID); } catch (e) {}
			try { await coll.eraseTx(); } catch (e) {}
			Zotero.Prefs.set("weavero.newMainWindow", saved === undefined ? true : !!saved);
		}
	});

	// Settings → "Hide the side panes in the Advanced Search window": the
	// collections pane and the item pane collapse the way View → Layout does
	// it (pane `collapsed` + splitter `state`, then updateLayoutConstraints).
	// Driven on a stand-in window; the real one is measured live.
	it("the Advanced Search window hides its side panes when the setting says so", () => {
		const saved = Zotero.Prefs.get("weavero.advSearchWindowHidePanes");
		const mk = () => { const a = {}; return { attrs: a, setAttribute(k, v) { a[k] = String(v); }, hasAttribute(k) { return k in a; }, getAttribute(k) { return a[k]; } }; };
		const els = { "zotero-collections-pane": mk(), "zotero-collections-splitter": mk(), "zotero-item-pane": mk(), "zotero-items-splitter": mk() };
		let constraints = 0;
		const fake = { document: { getElementById: id => els[id] || null }, ZoteroPane: { updateLayoutConstraints() { constraints++; } } };
		try {
			Zotero.Prefs.set("weavero.advSearchWindowHidePanes", false);
			wv._wvAdvSearchApplyPaneLayout(fake);
			assert.deepEqual(Object.values(els).map(e => Object.keys(e.attrs).length), [0, 0, 0, 0], "off: untouched");
			assert.strictEqual(constraints, 0);
			Zotero.Prefs.set("weavero.advSearchWindowHidePanes", true);
			wv._wvAdvSearchApplyPaneLayout(fake);
			assert.strictEqual(els["zotero-collections-pane"].attrs.collapsed, "true");
			assert.strictEqual(els["zotero-collections-splitter"].attrs.state, "collapsed");
			assert.strictEqual(els["zotero-item-pane"].attrs.collapsed, "true");
			assert.strictEqual(els["zotero-items-splitter"].attrs.state, "collapsed");
			assert.strictEqual(constraints, 1, "layout constraints recomputed once");
		}
		finally { Zotero.Prefs.set("weavero.advSearchWindowHidePanes", !!saved); }
	});

	// A new main window is raised: Zotero.openMainWindow() never calls
	// focus(), and on Windows the window came up behind its opener. The
	// raise loop is driven on a stand-in window: focus() until the document
	// reports OS focus, bounded.
	it("a new main window is brought to the front, bounded", async () => {
		const origGet = Zotero.getMainWindows;
		let focusCalls = 0;
		const fake = { closed: false, focus() { focusCalls++; }, document: { hasFocus: () => focusCalls >= 3 } };
		Zotero.getMainWindows = () => [win, fake];
		try {
			wv._wvRaiseNewMainWindow(new Set([win]));
			await new Promise(r => win.setTimeout(r, 900));
			assert.strictEqual(focusCalls, 3, "focus() until the window has OS focus, then stop");
			focusCalls = 0;
			const stubborn = { closed: false, focus() { focusCalls++; }, document: { hasFocus: () => false } };
			Zotero.getMainWindows = () => [win, stubborn];
			wv._wvRaiseNewMainWindow(new Set([win]));
			await new Promise(r => win.setTimeout(r, 1600));
			assert.strictEqual(focusCalls, 10, "a window that never gets focus is left alone after ten tries");
		}
		finally { Zotero.getMainWindows = origGet; }
	});

	// Reader windows (`reader/menubar/file`): the same three lead their File
	// menu, but New Tab only when the window has Weavero's tab strip
	// (`win._wvWT`, the multi-tab reader window) -- a single-document window
	// has no tab to add. Driven through the plugin's menu data on a scratch
	// menuitem in THIS document, whose window stands in for the reader's.
	it("reader windows: the File three register; New Tab only with a tab strip", () => {
		assert.strictEqual(wv._wvMenubarMenuIDs.length, 3, "main File, main Edit, reader File");
		const menus = wv._wvMenubarMenus.readerFile;
		assert.strictEqual(menus.length, 4);
		const show = (data) => {
			const popup = doc.createXULElement("menupopup");
			const el = doc.createXULElement("menuitem");
			popup.appendChild(el);
			let vis = null;
			data.onShowing(null, { menuElem: el, setVisible: v => { vis = v; } });
			return { vis, label: el.getAttribute("label"), accel: el.getAttribute("acceltext") };
		};
		assert.strictEqual(Object.prototype.hasOwnProperty.call(win, "_wvWT"), false, "a main window has no reader strip");
		assert.deepEqual(show(menus[0]), { vis: false, label: "New Tab…", accel: accel + "T" }, "no strip: New Tab hidden");
		assert.deepEqual(show(menus[1]), { vis: true, label: "New Reader Window…", accel: null });
		assert.deepEqual(show(menus[2]), { vis: true, label: "New Main Window", accel: accel + "N" });
		// Stand in for a multi-tab reader window for one synchronous call.
		win._wvWT = { tabs: [], activeId: null, seq: 0 };
		try { assert.strictEqual(show(menus[0]).vis, true, "with a strip: New Tab shown"); }
		finally { delete win._wvWT; }
	});

	it("teardown unregisters all three menus; register brings them back", () => {
		wv._wvTeardownMenubarWindowEntries();
		try {
			assert.strictEqual(wv._wvMenubarMenuIDs.length, 0);
			open(filePopup); open(editPopup);
			assert.strictEqual(mine(filePopup).length, 0, "File entries gone");
			assert.strictEqual(mine(editPopup).length, 0, "Edit entry gone");
			close(filePopup); close(editPopup);
		}
		finally { wv._wvRegisterMenubarWindowEntries(); }
		open(filePopup); open(editPopup);
		try {
			assert.strictEqual(wv._wvMenubarMenuIDs.length, 3);
			assert.strictEqual(mine(filePopup).length, 4);
			assert.strictEqual(mine(editPopup).length, 1);
		}
		finally { close(filePopup); close(editPopup); }
	});
});
