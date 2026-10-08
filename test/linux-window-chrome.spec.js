/* global describe, it, before, assert, Zotero */

// Linux window chrome (survey 2026-10-01, Ubuntu 26.04, Zotero 10.0.5-beta.2).
// Three things Weavero took from Windows that Linux does not provide:
// 1. Reader/note window caption buttons drew their glyphs from
//    chrome://browser/skin/window-controls/*.svg, absent from the Linux build:
//    the buttons were there and clickable but invisible.
// 2. With customtitlebar set on reader windows, the Linux skin makes the root
//    transparent, so strips nothing paints over (item-pane splitter, note
//    outline pane, Alt menu row) were see-through to the desktop.
// 3. An extra main window (Zotero.openMainWindow) carries
//    chromehidden="menubar ...", which hides #toolbar-menubar; the Windows skin
//    forces it back, the Linux skin does not -- Alt showed an empty row.

describe("Weavero -- Linux window chrome", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv) wvT.absent('!wv');
	});

	it("reader-window caption buttons use GTK icons and the window keeps a background on Linux", function () {
		if (typeof wv._ensureReaderWindowTabStripStyles !== "function") wvT.absent('typeof wv._ensureReaderWindowTabStripStyles !== "function"');
		const mw = Zotero.getMainWindow();
		const d = mw.document.implementation.createHTMLDocument("wv-linux-chrome-test");
		wv._ensureReaderWindowTabStripStyles(d);
		const css = d.getElementById("wv-window-tabstrip-styles").textContent;
		const linux = css.slice(css.indexOf("@media (-moz-platform: linux)"));
		assert.isAbove(css.indexOf("@media (-moz-platform: linux)"), -1, "a Linux block exists");
		for (const n of ["minimize", "maximize", "restore", "close"]) {
			assert.include(linux, "-moz-symbolic-icon(window-" + n + "-symbolic)", "GTK icon for " + n);
		}
		assert.match(linux, /:root\[customtitlebar\]\[windowtype="zotero:reader"\]\s*>\s*hbox\s*\{\s*background-color:\s*var\(--material-sidepane\)/,
			"the content row under the strip gets a background (the root's own is replaced by the native decorations)");
		assert.include(linux, "-moz-gtk-csd-close-button-position", "follows the GTK button order");
		if (Zotero.isLinux) {
			// The premise: the Windows glyphs really are missing from this build.
			let resolved = false;
			try {
				const ch = Services.io.newChannelFromURI(Services.io.newURI("chrome://browser/skin/window-controls/close.svg"),
					null, Services.scriptSecurityManager.getSystemPrincipal(), null,
					Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL, Ci.nsIContentPolicy.TYPE_OTHER);
				const s = ch.open(); resolved = s.available() > 0; s.close();
			}
			catch (e) {}
			assert.isFalse(resolved, "Windows window-control glyphs are absent on Linux (why the GTK block exists)");
		}
	});

	it("an extra main window shows its menu bar on Linux", async function () {
		this.timeout(30000);
		const mw = Zotero.getMainWindow();
		const sleep = (ms) => new Promise(r => mw.setTimeout(r, ms));
		const before = new Set(Zotero.getMainWindows());
		Zotero.openMainWindow();
		let nw = null;
		try {
			for (let i = 0; i < 100 && !nw; i++) {
				await sleep(100);
				nw = Zotero.getMainWindows().find(w => !before.has(w)) || null;
			}
			assert.isOk(nw, "the extra main window opened");
			for (let i = 0; i < 80 && !nw.document.getElementById("weavero-styles"); i++) await sleep(100);
			await sleep(300);
			const mb = nw.document.getElementById("toolbar-menubar");
			assert.isOk(mb, "#toolbar-menubar exists");
			const hidden = (nw.document.documentElement.getAttribute("chromehidden") || "").split(/\s+/);
			if (!Zotero.isLinux || !hidden.includes("menubar")) return;   // nothing to correct on this platform/window
			assert.notEqual(nw.getComputedStyle(mb).display, "none",
				"chromehidden=menubar must not remove the menu bar on Linux (the Windows skin forces it back)");
		}
		finally {
			try { if (nw) nw.close(); } catch (e) {}
			await sleep(500);
		}
	});
});
