/* global describe, it, before, assert, Zotero */

// Plugins Manager drawn title bar on every non-Mac platform (issue #50,
// 2026-09-30). `_wvPMSetupChrome` sets `customtitlebar` on the basicViewer
// window by hand and composes the bar inside `.menubar-container`. The row
// and the absolute caption-button box came from scss/win/_titleBar.scss
// only; the Linux skin has no `.menubar-container` rule and keeps the
// buttonbox in flow, so on Ubuntu the attribute stripped the GTK title bar
// and the pieces stacked into a 128px column (measured 2026-10-01, Zotero
// 10.0.5, Wayland): title y=0, hamburger y=36, buttons y=104 at x=10.
// Weavero now ships the Linux rules itself. This spec opens the REAL manager
// window -- the other plugins-*.spec.js files use stand-in documents -- and
// locks the layout contract on whichever platform runs it: ONE row, the
// stock menubar collapsed, the hamburger left of the caption buttons, the
// buttons at the right edge. macOS draws its own controls: no chrome there.

describe("Weavero -- Plugins Manager title bar is one row on every platform", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvPMSetupChrome !== "function") wvT.absent('!wv || typeof wv._wvPMSetupChrome !== "function"');
		if (!wv._getEnablePluginsSearch || !wv._getEnablePluginsSearch()) this.skip();
	});

	it("name, hamburger and caption buttons share a single row (Windows, Linux); stock chrome on macOS", async function () {
		this.timeout(45000);
		const mw = Zotero.getMainWindow();
		const sleep = (ms) => new Promise(r => mw.setTimeout(r, ms));
		const win = /** @type {any} */ (Zotero.openInViewer("chrome://mozapps/content/extensions/aboutaddons.html"));
		assert.isOk(win, "the manager window opened");
		// The bar must exist BEFORE the window is first shown (a chrome window
		// is shown after its load event). Applied later -- 0.21.1 waited for
		// about:addons to load, ~270ms after the show -- GTK re-maps the
		// window on Linux and the manager opens, closes and reopens
		// (measured 2026-10-01). Sampled at `load`, the last point before show.
		/** @type {any} */
		let atLoad = null;
		win.addEventListener("load", () => {
			try {
				const name = win.document.querySelector(".wv-pm-title");
				atLoad = { chrome: !!win._wvPMChrome,
					customtitlebar: win.document.documentElement.getAttribute("customtitlebar"),
					name: name ? name.textContent : null };
			}
			catch (e) {}
		}, { once: true });
		// The search box must arrive WITH the plugin list, not after it: the
		// injection used to poll every 250ms for readyState "complete", so the
		// box landed after the cards and pushed them down. Every time the page
		// mutates, look again on the NEXT TASK (a paint can only happen
		// between tasks, and by then every observer of that mutation has run):
		// a list without its box there is a frame the user can see.
		let listTasks = 0, listWithoutBox = 0, watched = null;
		const watchPage = (cd) => {
			if (watched === cd) return;
			watched = cd;
			const mo = new mw.MutationObserver(() => {
				mw.setTimeout(() => {
					try {
						if (!cd.querySelector("addon-list")) return;
						listTasks++;
						if (!cd.getElementById("wv-pm-searchbox")) listWithoutBox++;
					}
					catch (e) {}
				}, 0);
			});
			mo.observe(cd.documentElement, { childList: true, subtree: true });
		};
		try {
			// Wait for Weavero's injection to have run: the search box is the
			// platform-independent marker (same pass as the chrome setup).
			let cd = null, waited = 0;
			while (waited < 30000) {
				try {
					const br = win.document.querySelector("browser");
					cd = br && br.contentDocument;
					if (cd && cd.documentElement && String(cd.location.href).includes("aboutaddons")) watchPage(cd);
					if (cd && cd.getElementById("wv-pm-searchbox")) break;
				}
				catch (e) {}
				await sleep(10);
				waited += 10;
			}
			assert.isOk(cd && cd.getElementById("wv-pm-searchbox"), "search box injected within " + waited + "ms");
			await sleep(500);   // let layout settle -- rAF is unreliable in an unraised window
			assert.isAbove(listTasks, 0, "the page was watched while its list appeared");
			assert.equal(listWithoutBox, 0, "the list is never on screen without the search box");
			const doc = win.document;
			const root = doc.documentElement;
			const toolbox = doc.querySelector(".menubar-container");
			assert.isOk(toolbox, "basicViewer's .menubar-container toolbox");
			const rect = (el) => el.getBoundingClientRect();
			if (Zotero.isMac) {
				assert.isNotOk(win._wvPMChrome, "no drawn chrome on macOS");
				assert.isNull(doc.getElementById("wv-pm-buttonbox"), "no caption buttons injected");
				assert.isNull(doc.getElementById("wv-pm-chrome-styles"), "no chrome stylesheet injected");
				return;
			}
			const os = Zotero.isWin ? "Windows" : "Linux";
			assert.isOk(win._wvPMChrome, "chrome applied on " + os);
			assert.equal(root.getAttribute("customtitlebar"), "true", "window draws its title bar");
			assert.isOk(atLoad, "the window's load event was observed");
			assert.isTrue(atLoad.chrome, "the bar is built by the time the window loads (before first show)");
			assert.equal(atLoad.customtitlebar, "true", "customtitlebar is set before first show, not after");
			assert.notEqual(atLoad.name, "Zotero", "the bar does not open on the pre-load window title");
			assert.equal(win.getComputedStyle(toolbox).flexDirection, "row", "the toolbox is a row, not a column");
			const tb = rect(toolbox);
			// The bug stacked the pieces 128px tall; the bar is --tab-min-height
			// (36px) plus at most a divider.
			assert.isAtMost(tb.height, 44, "the bar is one row tall (was a 128px stack on Linux)");
			const title = doc.querySelector(".wv-pm-title");
			const burger = doc.querySelector(".wv-hamburger-btn");
			const bb = doc.getElementById("wv-pm-buttonbox");
			for (const [name, el] of [["title", title], ["hamburger", burger], ["caption buttons", bb]]) {
				assert.isOk(el, "piece present: " + name);
				const r = rect(el);
				assert.isAbove(r.width, 0, name + " is laid out");
				assert.isAtLeast(r.top, tb.top - 1, name + " starts inside the row");
				assert.isAtMost(r.bottom, tb.bottom + 1, name + " ends inside the row");
			}
			// Built that early, the name starts as "Zotero" and must follow the
			// window title once the page names it.
			assert.equal(title.textContent, doc.title, "the drawn name follows the window title");
			assert.notEqual(title.textContent, "Zotero", "not stuck on the pre-load title");
			// Order along the row: name ... hamburger ... caption buttons.
			assert.isBelow(rect(title).left, rect(burger).left, "the name sits left of the hamburger");
			assert.isAtMost(rect(burger).right, rect(bb).left, "the hamburger sits left of the caption buttons");
			// The 40px drag spacer meets the buttons -- the reservation is the
			// measured box, not the Windows 138px (a 38px band on Linux before).
			const dragSpacer = doc.querySelector(".wv-pm-drag-spacer");
			assert.closeTo(rect(bb).left - rect(dragSpacer).right, 0, 1, "no empty band between the drag spacer and the buttons");
			// Windows: flush right (the skin's inset-inline-end: 0). Linux: the
			// skin's 10px buttonbox margin -- the main window's own offset.
			const gap = win.innerWidth - rect(bb).right;
			assert.isAtLeast(gap, -1, "caption buttons inside the window");
			assert.isAtMost(gap, 12, "caption buttons at the right edge (were at x=10 on Linux)");
			const shown = [...bb.children].filter(b => win.getComputedStyle(b).display !== "none");
			assert.isAbove(shown.length, 0, "at least one caption button is visible");
			// The stock menubar gave up its row; its menus live in the hamburger.
			assert.isAtMost(rect(doc.getElementById("toolbar-menubar")).width, 1, "stock menubar collapsed");
			assert.equal(doc.getElementById("menubar-items").getAttribute("wv-pm-hidden"), "true", "menus collapsed, not removed");
			assert.isOk(doc.getElementById("wv-hamburger-popup"), "the hamburger popup exists");
			// One of each: a reload with the manager open must replace, not add.
			assert.equal(doc.querySelectorAll(".titlebar-buttonbox").length, 1, "exactly one caption-button box");
			assert.equal(doc.querySelectorAll("#wv-pm-chrome-styles").length, 1, "exactly one chrome stylesheet");
		}
		finally {
			try { win.close(); } catch (e) {}
		}
	});
	// Maximize -> restore gives back the size the manager had (Weavero adds
	// the maximize button: Zotero opens the manager as a dialog without one).
	// On Linux the window came back 52x52px larger every time (1000x700 ->
	// 1052x752, measured 2026-10-01); _wvPMKeepRestoreSize puts it back.
	it("maximize then restore returns the manager to its previous size", async function () {
		if (Zotero.isMac) this.skip();
		this.timeout(30000);
		const mw = Zotero.getMainWindow();
		const sleep = (ms) => new Promise(r => mw.setTimeout(r, ms));
		const win = /** @type {any} */ (Zotero.openInViewer("chrome://mozapps/content/extensions/aboutaddons.html"));
		try {
			for (let i = 0; i < 120 && !win._wvPMChrome; i++) await sleep(100);
			assert.isOk(win._wvPMChrome, "drawn bar applied");
			await sleep(800);   // let the opening size settle (recorded after 300ms stable)
			const w0 = win.innerWidth, h0 = win.innerHeight;
			win.maximize();
			for (let i = 0; i < 30 && win.windowState !== win.STATE_MAXIMIZED; i++) await sleep(100);
			if (win.windowState !== win.STATE_MAXIMIZED) this.skip();   // the test display refuses to maximize
			await sleep(600);
			// Every size the window takes after the restore, while NORMAL: the
			// first fix corrected after the fact and the window visibly went
			// 1920 -> 1052 -> 1000 (MJT: "flickers", 2026-10-01). It must land
			// on the old size in one step.
			const seen = [];
			const rec = () => { if (win.windowState === win.STATE_NORMAL) seen.push(win.innerWidth + "x" + win.innerHeight); };
			win.addEventListener("resize", rec);
			win.restore();
			for (let i = 0; i < 30 && win.windowState !== win.STATE_NORMAL; i++) await sleep(100);
			await sleep(1200);   // past the fallback correction and the minimum's return
			win.removeEventListener("resize", rec);
			assert.closeTo(win.innerWidth, w0, 1, "width back to " + w0);
			assert.closeTo(win.innerHeight, h0, 1, "height back to " + h0);
			const detours = seen.filter((sz) => { const [w, h] = sz.split("x").map(Number); return Math.abs(w - w0) > 1 || Math.abs(h - h0) > 1; });
			assert.deepEqual(detours, [], "no intermediate size after the restore (sizes seen: " + seen.join(", ") + ")");
			assert.equal(win.document.documentElement.style.minWidth, "1000px", "the declared minimum is back");
		}
		finally {
			try { win.close(); } catch (e) {}
		}
	});

	// The drawn bar follows Hide title bar -> Plugins Manager (issue #50, MJT
	// 2026-10-05): off, the manager keeps the native title bar and menu bar;
	// toggling it while the manager is open applies at once.
	it("follows Hide title bar: off keeps the native bar, toggling applies to an open manager", async function () {
		if (Zotero.isMac) this.skip();
		this.timeout(30000);
		const P = "weavero.compactTitleBarPluginsManager";
		const prev = Zotero.Prefs.get(P);
		const mw = Zotero.getMainWindow();
		const sleep = (ms) => new Promise(r => mw.setTimeout(r, ms));
		Zotero.Prefs.set(P, false);
		const win = /** @type {any} */ (Zotero.openInViewer("chrome://mozapps/content/extensions/aboutaddons.html"));
		try {
			for (let i = 0; i < 60 && !win.document.getElementById("wv-pm-searchbox") && !(win.document.querySelector("browser") && win.document.querySelector("browser").contentDocument && win.document.querySelector("browser").contentDocument.getElementById("wv-pm-searchbox")); i++) await sleep(100);
			await sleep(300);
			assert.isNotOk(win._wvPMChrome, "no drawn bar while the option is off");
			assert.isNull(win.document.documentElement.getAttribute("customtitlebar"), "native decorations");
			assert.isNull(win.document.getElementById("wv-pm-chrome-styles"), "the stock menu bar is left alone");
			Zotero.Prefs.set(P, true);
			for (let i = 0; i < 30 && !win._wvPMChrome; i++) await sleep(100);
			assert.isOk(win._wvPMChrome, "turned on: the bar is drawn in the open manager");
			Zotero.Prefs.set(P, false);
			for (let i = 0; i < 30 && win._wvPMChrome; i++) await sleep(100);
			assert.isNotOk(win._wvPMChrome, "turned off again: the bar is gone");
			assert.isNull(win.document.documentElement.getAttribute("customtitlebar"));
		}
		finally {
			Zotero.Prefs.set(P, prev !== false);
			try { win.close(); } catch (e) {}
		}
	});
});
