// Shift+click on a link inside a document sends the target to a coupled
// SECOND reader window (README "Where a link opens"; reader.ts
// _wvOpenInDupWindow). On Zotero 11 (zotero#6035)
// `Reader.open(id, loc, { openInWindow: true, allowDuplicate: true })` hands
// back any open tab of the item instead of opening a window ("a tab for the
// item in any window stands in for a window of its own", xpcom/reader.js), so
// up to 1.2.1-dev.40 the "duplicate" was the source reader itself: Weavero
// coupled it to itself and drove the pane clicked from -- the target and its
// red dot in the same reader, on every later Shift+click too (MJT 2026-11-20,
// 11.0-beta.4). These cases hold the pair to two DIFFERENT readers in two
// windows, the source never navigated, on every Zotero the suite runs on.
//
// The second half is the dot: the reader picks the SMALLEST overlay under
// the pointer, and the PDF's own link on "[13]" (108.9 pt2, a bare XYZ point
// 5.3 pt above entry 13) beat Zotero 11's citation overlay (145.7 pt2, entry
// 13's lines) -- so even a right window got a red dot beside the entry. The
// numbers below are the ones measured on that paper (Liu et al. 2021, Sensors
// 21, 2687), page 2, in 11.0-beta.4 (reader.ts _wvLinkClickTarget).

describe("Weavero — Shift+click on a link: a second reader window", function () {
    this.timeout(120000);
    /** @type {any} */
    let wv;
    /** @type {any} */
    let att;
    /** @type {any} */
    let main;
    let spare = 1;
    const native = wvT.nativeWindows();
    const LOC = { position: { pageIndex: 0, rects: [[20, 20, 120, 60]] } };
    /** @type {any[]} */
    let navigated = [];
    /** @type {any} */
    let spied = null;

    before(async function () {
        wv = wvT.plugin();
        wvT.method("_wvOpenInDupWindow");
        wvT.method("_wvNavigateReaderPrimary");
        main = Zotero.getMainWindow();
        spare = Zotero.getMainWindows().length;
        att = await wvT.createTestPDFItem("wv-shift-dup");
    });

    beforeEach(function () {
        // Record every reader the pair navigates (the source must never be one).
        navigated = [];
        const orig = wv._wvNavigateReaderPrimary;
        spied = { orig, own: Object.prototype.hasOwnProperty.call(wv, "_wvNavigateReaderPrimary") };
        wv._wvNavigateReaderPrimary = function (/** @type {any} */ rd, /** @type {any} */ loc) {
            navigated.push(rd);
            return orig.call(this, rd, loc);
        };
    });

    /** Every reader of the fixture closed, every window this spec opened
     *  closed once it has loaded (tests.md), dead readers dropped. */
    async function closeAll() {
        for (const r of (Zotero.Reader._readers || []).slice()) {
            let w = null;
            try { if (r.itemID !== att.id) continue; w = r._window; } catch (e) { continue; }
            if (w && w !== main && !w.closed) {
                await wvT.waitFor(() => w.closed || w.document.readyState === "complete", 10000);
                try { if (!w.closed) w.close(); } catch (e) {}
            }
            else wvT.closeReaderTab(r);
        }
        for (const w of Zotero.getMainWindows().slice(spare)) {
            await wvT.waitFor(() => w.closed || w.document.readyState === "complete", 10000);
            try { if (!w.closed) w.close(); } catch (e) {}
        }
        await wvT.waitFor(() => Zotero.getMainWindows().length <= spare, 10000);
        await wvT.settleSecondaryWindows();
        wvT.purgeDeadReaders();
    }

    afterEach(async function () {
        this.timeout(30000);
        if (spied) {
            if (spied.own) wv._wvNavigateReaderPrimary = spied.orig;
            else delete wv._wvNavigateReaderPrimary;
            spied = null;
        }
        await closeAll();
    });

    after(async function () {
        await wvT.erase(att);
    });

    /** The fixture in a reader of its own: a tab of the main window, or (`inWindow`)
     *  a reader window -- on Zotero 11 a main window whose one tab it is. */
    async function openSource(inWindow) {
        if (!inWindow) return wvT.openReaderTab(att.id);
        const before = new Set((Zotero.Reader._readers || []).slice());
        await Zotero.Reader.open(att.id, null, { openInWindow: true, allowDuplicate: true });
        return wvT.waitFor(() => (Zotero.Reader._readers || []).find((/** @type {any} */ r) => {
            try { return !before.has(r) && r.itemID === att.id && r._internalReader && r._iframeWindow; } catch (e) { return false; }
        }) || null, 30000);
    }

    /** A Shift+click's pair: `reader` itself is never its partner nor
     *  navigated; the partner is a live reader of the same document in
     *  another window, and got the target. */
    function assertPair(/** @type {any} */ reader, /** @type {string} */ what) {
        const dup = reader._wvDupReader;
        assert.isOk(dup, what + ": a second reader is coupled");
        assert.isFalse(dup === reader, what + ": the reader is never its own duplicate");
        assert.isTrue(wv._wvReaderAlive(dup), what + ": the duplicate is open");
        assert.strictEqual(dup.itemID, att.id, what + ": the same document");
        assert.isFalse(dup._window === reader._window, what + ": in another window");
        assert.isTrue(dup._wvDupSource === reader, what + ": coupled back to the source");
        assert.isFalse(navigated.includes(reader), what + ": the source pane is never driven");
        assert.isTrue(navigated.includes(dup), what + ": the duplicate got the target");
        return dup;
    }

    it("from a reader tab: a new window gets the target, the source stays; the pair works both ways", async function () {
        const reader = await openSource(false);
        assert.isOk(reader, "the source tab opened");
        await wv._wvOpenInDupWindow(reader, LOC);
        const dup = assertPair(reader, "first Shift+click");
        const windows = Zotero.getMainWindows().length;
        if (native) assert.strictEqual(windows, spare + 1, "Zotero 11: one more main window, the duplicate's");
        // The reverse: a Shift+click in the duplicate drives the source.
        navigated = [];
        await wv._wvOpenInDupWindow(dup, LOC);
        assert.isTrue(navigated.includes(reader), "reverse: the source got the target");
        assert.isFalse(navigated.includes(dup), "reverse: the duplicate's own pane stays");
        // A second Shift+click from the source reuses the window.
        navigated = [];
        await wv._wvOpenInDupWindow(reader, LOC);
        assert.isTrue(reader._wvDupReader === dup, "second Shift+click: the same duplicate");
        assert.strictEqual(Zotero.getMainWindows().length, windows, "second Shift+click: no further window");
        assert.isFalse(navigated.includes(reader), "second Shift+click: the source pane is never driven");
    });

    it("a reader left coupled to itself (builds up to 1.2.1-dev.40) is never its own partner", async function () {
        const reader = await openSource(false);
        assert.isOk(reader, "the source tab opened");
        reader._wvDupReader = reader;
        reader._wvDupSource = reader;
        await wv._wvOpenInDupWindow(reader, LOC);
        assertPair(reader, "Shift+click after a self-link");
    });

    it("from a reader window: never coupled to itself, the source never driven", async function () {
        const reader = await openSource(true);
        assert.isOk(reader, "the source reader window opened");
        await wv._wvOpenInDupWindow(reader, LOC);
        assert.isFalse(reader._wvDupReader === reader, "the reader is never its own duplicate");
        assert.isFalse(navigated.includes(reader), "the source pane is never driven");
        // Zotero 11 opens a window of its own for it. Zotero 9/10 open no second
        // ReaderWindow of a document already in one (Reader.open hands that one
        // back), so there the Shift+click does nothing rather than move the source.
        if (native) assertPair(reader, "Zotero 11");
    });
});

describe("Weavero — a modified click on a PDF link over a citation: the entry, not a dot", function () {
    /** @type {any} */
    let wv;
    // Page 2 of the paper ("[13]"), the overlays as Zotero 11 builds them.
    const ENTRY13 = { pageIndex: 14, rects: [[36, 512.3, 560.2, 521], [57, 501, 179.8, 509.5]] };
    const ENTRY12 = { pageIndex: 14, rects: [[36, 535, 560.2, 543.7], [57, 523.7, 200, 532.4]] };
    const ENTRY14 = { pageIndex: 14, rects: [[36, 489, 560.2, 497.7]] };
    const LINK_RECTS = [[209.3, 724.5, 221.2, 733.6]];
    const point = (/** @type {number} */ x, /** @type {number} */ y) => ({ pageIndex: 14, rects: [[x, y, x, y]] });
    const link = (/** @type {any} */ dest) => ({ type: "internal-link", source: "annotation", position: { pageIndex: 1, rects: LINK_RECTS }, destinationPosition: dest });
    const citation = (/** @type {any[]} */ refs) => ({ type: "citation", source: "sdt", position: { pageIndex: 1, rects: [[206.8, 723, 222.3, 732.4]] }, references: refs.map(p => ({ position: p })) });
    const viewWith = (/** @type {any[]} */ overlays) => ({ _pdfPages: { 1: { overlays } } });

    before(function () {
        wv = wvT.plugin();
        wvT.method("_wvLinkClickTarget");
    });

    it("the click handler resolves its target through _wvLinkClickTarget", function () {
        assert.match(wvT.src("_wvWireReaderLinkClicks"), /_wvLinkClickTarget\(sourceView, overlay\)/);
    });

    it("\"[13]\": the PDF's link to a point above entry 13 lands on entry 13", function () {
        const l = link(point(36, 526.3));
        const t = wv._wvLinkClickTarget(viewWith([citation([ENTRY13]), l]), l);
        assert.deepEqual(t && t.position, ENTRY13);
    });

    it("a range \"[12-14]\": the link of 13 lands on entry 13, not on the citation's first entry", function () {
        const l = link(point(36, 526.3));
        const t = wv._wvLinkClickTarget(viewWith([citation([ENTRY12, ENTRY13, ENTRY14]), l]), l);
        assert.deepEqual(t && t.position, ENTRY13);
    });

    it("a link going elsewhere, or with no citation across it, keeps its point (the dot)", function () {
        const far = link(point(36, 700));
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([citation([ENTRY13]), far]), far).position, far.destinationPosition, "no entry near the point");
        const otherCol = link(point(400, 526.3));
        const narrow = { pageIndex: 14, rects: [[36, 512.3, 280, 521]] };
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([citation([narrow]), otherCol]), otherCol).position, otherCol.destinationPosition, "an entry in another column");
        const l = link(point(36, 526.3));
        const elsewhere = Object.assign(citation([ENTRY13]), { position: { pageIndex: 1, rects: [[300, 600, 320, 610]] } });
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([elsewhere, l]), l).position, l.destinationPosition, "a citation that does not cross the link");
        const onPage3 = Object.assign({}, ENTRY13, { pageIndex: 3 });
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([citation([onPage3]), l]), l).position, l.destinationPosition, "an entry on another page than the link's");
    });

    it("a link to a region, and a citation, are taken as they are", function () {
        const region = { pageIndex: 6, rects: [[50, 300, 400, 420]] };
        const l = link(region);
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([citation([ENTRY13]), l]), l).position, region, "a region destination");
        const c = citation([ENTRY12, ENTRY13]);
        assert.deepEqual(wv._wvLinkClickTarget(viewWith([c]), c).position, ENTRY12, "a citation: its first reference");
        assert.isNull(wv._wvLinkClickTarget(viewWith([]), { type: "external-link", position: { pageIndex: 1, rects: LINK_RECTS } }), "anything else: no target");
    });
});
