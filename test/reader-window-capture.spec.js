/* global describe, it, before, assert, Zotero */

// A reader window with a SINGLE document must be captured into Weavero's
// window store (MJT, 2026-09-16). Since the restore takeover (2026-07-02)
// Zotero's quit save records no reader windows at all -- Weavero reopens them
// itself -- so the capture's old "no extras: skip, Zotero handles it alone"
// rule left such a window recorded by neither side and lost on every restart
// (found by test/restart/cycle.js; the 2026-08-05 vanished window was this).
//
// The capture is exercised on plain objects shaped like a reader window's
// `_wvWT` model; the live end-to-end guard is the restart protocol
// (docs/restart-testing.md, fixture: one single-document reader window).

describe("Weavero — reader-window store capture", () => {
    let lp;
    const fakeWin = (tabs, activeId) => ({
        _wvWT: { tabs, activeId, shared: { sidebarOpen: true, sidebarWidth: 260 } },
        screenX: 100, screenY: 50, outerWidth: 900, outerHeight: 700, devicePixelRatio: 1, windowState: 3,
    });

    before(function () {
        lp = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!lp || typeof lp._wvWindowStoreCaptureReaderWindow !== "function") this.skip();
    });

    it("a single-document window (native tab, no extras) yields a reader entry", () => {
        const e = lp._wvWindowStoreCaptureReaderWindow(fakeWin(
            [{ id: "t1", native: true, itemID: 4242, pinned: false }], "t1"));
        assert.isOk(e, "an entry, not null");
        assert.equal(e.kind, "reader");
        assert.equal(e.nativeItemID, 4242);
        assert.deepEqual(e.extras, [], "no extras to mount");
        assert.equal(e.activeIndex, 0);
        assert.deepEqual(e.order, [4242]);
        assert.isOk(e.geom && e.geom.w === 900 && e.geom.h === 700, "geometry captured: " + JSON.stringify(e.geom));
    });

    it("a window with extras still lists them, native first", () => {
        const e = lp._wvWindowStoreCaptureReaderWindow(fakeWin(
            [{ id: "t1", native: true, itemID: 1 }, { id: "t2", itemID: 2, pinned: true, wvGroupId: "g1" }], "t2"));
        assert.equal(e.kind, "reader");
        assert.equal(e.nativeItemID, 1);
        assert.deepEqual(e.extras, [{ itemID: 2, pinned: true, grp: "g1" }]);
        assert.equal(e.activeIndex, 1, "active = first extra, in restore order [native, ...extras]");
        assert.deepEqual(e.order, [1, 2]);
    });

    it("a window whose native tab is gone is an orphan entry; an empty one is nothing", () => {
        const o = lp._wvWindowStoreCaptureReaderWindow(fakeWin([{ id: "t2", itemID: 2 }], "t2"));
        assert.equal(o.kind, "reader-orphan");
        assert.deepEqual(o.tabs.map(t => t.itemID), [2]);
        assert.isNull(lp._wvWindowStoreCaptureReaderWindow(fakeWin([], null)));
        assert.isNull(lp._wvWindowStoreCaptureReaderWindow({}));
    });
});
