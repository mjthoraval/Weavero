/* global describe, it, before, afterEach, assert, Zotero */

// When an outline PIN entry's marker appears (2026-09-09).
//
// PDF: `_wvOutlineShowEntryPin` used to wait an unconditional 200 ms "for
// the page to render", so every PDF pin click lagged the snapshot/EPUB pin,
// which draws at once. Now: draw immediately when pdf.js has the page view
// built (the usual case), otherwise poll for readiness; a later outline
// click cancels the poll so a stale pin can never land after the user has
// moved on.
//
// DOM: EPUB sections mount lazily and the native navigate that mounts one
// is asynchronous, so an anchor that does not resolve right after a jump
// may be "not there YET". EPUB retries briefly; a snapshot (one static
// document) does not, and reports the missing anchor at once.

describe("Weavero — outline pin timing", () => {
	let wv;
	const own = [];   // instance overrides to undo

	const override = (name, fn) => { wv[name] = fn; own.push(name); };
	const wait = (ms) => new Promise(r => Zotero.getMainWindow().setTimeout(r, ms));

	before(function () {
		wv = Zotero.Weavero && Zotero.Weavero.plugin;
		if (!wv || typeof wv._wvOutlineShowEntryPin !== "function"
			|| typeof wv._wvOutlineShowDomEntryPinWhenReady !== "function") this.skip();
	});

	afterEach(() => { while (own.length) delete wv[own.pop()]; });

	// A PDF reader whose page 0 view is (or is not) built.
	const pdfReader = (ready) => ({
		_type: "pdf", _wvOutlineNavTime: 1,
		_internalReader: { _primaryView: { _iframeWindow: { PDFViewerApplication: {
			pdfViewer: { _pages: [ready ? { div: {}, viewport: {} } : {}] } } } } },
	});
	const POS = { pageIndex: 0, rects: [[10, 20, 10, 20]], anchor: "point" };

	describe("PDF", () => {
		it("draws synchronously when the page view is built, with the drag wiring", () => {
			const calls = [];
			override("_wvReaderShowPin", (reader, position, bmId, opts) => { calls.push({ position, opts }); });
			wv._wvOutlineShowEntryPin(pdfReader(true), {}, 1, "KEY", "wvo-1", POS);
			assert.lengthOf(calls, 1, "no beat, no timer");
			assert.equal(calls[0].position, POS);
			assert.isFunction(calls[0].opts && calls[0].opts.onMove, "a dragged pin still rewrites the entry");
		});

		it("waits for the page view when it is not built yet, then draws", async () => {
			const calls = [];
			override("_wvReaderShowPin", (reader, position) => { calls.push(position); });
			const reader = pdfReader(false);
			wv._wvOutlineShowEntryPin(reader, {}, 1, "KEY", "wvo-1", POS);
			assert.lengthOf(calls, 0, "nothing to draw into yet");
			await wait(200);
			assert.lengthOf(calls, 0, "still waiting");
			reader._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer._pages[0] = { div: {}, viewport: {} };
			await wait(400);
			assert.lengthOf(calls, 1, "drawn once the view exists");
		});

		it("a later outline click cancels a pending wait", async () => {
			const calls = [];
			override("_wvReaderShowPin", (reader, position) => { calls.push(position); });
			const reader = pdfReader(false);
			wv._wvOutlineShowEntryPin(reader, {}, 1, "KEY", "wvo-1", POS);
			reader._wvOutlineNavTime = 2;   // what _wvOutlineNavigate stamps on the next click
			reader._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer._pages[0] = { div: {}, viewport: {} };
			await wait(400);
			assert.lengthOf(calls, 0, "the stale pin never lands");
		});
	});

	describe("DOM", () => {
		it("EPUB: retries while the anchor does not resolve, then draws, no note", async () => {
			let attempts = 0;
			const notes = [];
			override("_wvOutlineShowDomEntryPin", () => ++attempts >= 3);
			override("_wvReaderPanelNote", (idoc, text) => { notes.push(text); });
			wv._wvOutlineShowDomEntryPinWhenReady({ _type: "epub", _wvOutlineNavTime: 1 }, {}, {}, POS);
			assert.equal(attempts, 1, "first try at once");
			await wait(500);
			assert.equal(attempts, 3, "kept trying until it resolved");
			assert.lengthOf(notes, 0, "'target gone' was never claimed");
		});

		it("snapshot: no retry -- an unresolved anchor is reported at once", () => {
			let attempts = 0;
			const notes = [];
			override("_wvOutlineShowDomEntryPin", () => { attempts++; return false; });
			override("_wvReaderPanelNote", (idoc, text) => { notes.push(text); });
			wv._wvOutlineShowDomEntryPinWhenReady({ _type: "snapshot", _wvOutlineNavTime: 1 }, {}, {}, POS);
			assert.equal(attempts, 1);
			assert.lengthOf(notes, 1);
			assert.include(notes[0], "no longer in the document");
		});

		it("EPUB: a later outline click cancels the retry, silently", async () => {
			let attempts = 0;
			const notes = [];
			override("_wvOutlineShowDomEntryPin", () => { attempts++; return false; });
			override("_wvReaderPanelNote", (idoc, text) => { notes.push(text); });
			const reader = { _type: "epub", _wvOutlineNavTime: 1 };
			wv._wvOutlineShowDomEntryPinWhenReady(reader, {}, {}, POS);
			reader._wvOutlineNavTime = 2;
			await wait(400);
			assert.equal(attempts, 1, "no retry after the supersede");
			assert.lengthOf(notes, 0, "and no note for a click the user abandoned");
		});
	});
});
