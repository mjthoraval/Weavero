/* global describe, it, before, assert, Zotero */

// Hide Title Bar: the 40px drag spacer ends where the caption buttons begin,
// on every platform -- as on Windows and in Firefox on Linux
// (browser-shared.css: the 40px .titlebar-spacer followed by the in-flow
// button box). The tab strip used to reserve a fixed 138px (the Windows box,
// 3 x 46); the GTK box is 90px + Zotero's 10px margins, which left a 38px empty
// band before the buttons on Linux (measured 2026-10-01). The reservation is
// now measured from the real box (_wvTrackCaptionReserve).
//
// The main window is NOT toggled here: applying/reverting Hide Title Bar on
// the runner's window changes its visibility state, and
// selected-tab-ring.spec.js asserts only on a visible window (it then failed
// on stale rAF-driven state -- seen 2026-10-01). The real-window end-to-end
// check is the Plugins Manager case in plugins-chrome-platform.spec.js.

describe("Weavero -- caption-button reservation", () => {
	let wv;

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._ensureCompactTitleBarStyles !== "function") this.skip();
	});

	it("the tab strip reserves the measured button box, not a fixed 138px", () => {
		const mw = Zotero.getMainWindow();
		const d = mw.document.implementation.createHTMLDocument("wv-caption-reserve-test");
		wv._ensureCompactTitleBarStyles(d);
		const css = d.getElementById("wv-compact-titlebar-styles").textContent;
		assert.match(css, /#zotero-title-bar:has\(> \.titlebar-buttonbox\)\s*\{\s*padding-right:\s*var\(--wv-ctl-reserve,\s*138px\)/,
			"the reservation reads the measured value");
		assert.notMatch(css, /padding-right:\s*138px;/, "no hard-coded Windows width");
		assert.match(css, /@media \(-moz-platform: linux\)\s*\{\s*#zotero-title-bar > \.titlebar-buttonbox\s*\{\s*margin-inline-start:\s*0/,
			"on Linux the button box loses Zotero's left margin, so the spacer meets it");
	});

	it("_wvTrackCaptionReserve sets the box's width + right margin and follows resizes", async function () {
		if (typeof wv._wvTrackCaptionReserve !== "function") this.skip();
		const win = Zotero.getMainWindow(), doc = win.document;
		const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
		const H = "http://www.w3.org/1999/xhtml";
		const row = doc.createElementNS(H, "div");
		row.style.cssText = "position:absolute;left:0;top:-200px;width:600px;height:36px;display:flex";
		const box = doc.createElementNS(H, "div");
		box.style.cssText = "width:90px;height:36px;margin:0 10px 0 0;flex:none";
		row.appendChild(box);
		doc.documentElement.appendChild(row);
		let ro = null;
		try {
			ro = wv._wvTrackCaptionReserve(win, row, box);
			assert.equal(row.style.getPropertyValue("--wv-ctl-reserve"), "100px", "90px box + 10px right margin (the GTK case)");
			box.style.width = "138px"; box.style.marginRight = "0px";
			for (let i = 0; i < 20 && row.style.getPropertyValue("--wv-ctl-reserve") !== "138px"; i++) await sleep(50);
			if (ro) assert.equal(row.style.getPropertyValue("--wv-ctl-reserve"), "138px", "follows a resized box (the Windows case)");
		}
		finally {
			try { if (ro) ro.disconnect(); } catch (e) {}
			row.remove();
		}
	});
});
