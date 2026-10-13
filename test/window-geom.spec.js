/* global describe, it, before, assert */

// A MINIMIZED window's geometry is not the window's: Windows parks it at
// (-32000, -32000) and reports the iconic size, 199x34. The capture dropped
// the coordinates but kept that size as a NORMAL window, losing "maximized"
// -- the dev profile's store held the maximized main window as 199x34
// (2026-10-13), and a saved window reopened from such a record was moved to
// a null position and resized to it. Stand-in windows; the capture keeps the
// last real geometry per window.

describe("Weavero — a minimized window's geometry is never its iconic size", () => {
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWindowGeom");
    });

    const win = (o) => Object.assign({ devicePixelRatio: 1, windowState: 3, screenX: 100, screenY: 50, outerWidth: 1200, outerHeight: 800 }, o);
    const minimize = (w) => Object.assign(w, { windowState: 2, screenX: -32000, screenY: -32000, outerWidth: 199, outerHeight: 34 });

    it("a window minimized after a capture keeps its last real geometry, maximized included", () => {
        const w = win({ windowState: 1, screenX: -8, screenY: -8, outerWidth: 1936, outerHeight: 1176 });
        const before = wv._wvWindowGeom(w);
        assert.deepInclude(before, { x: -8, y: -8, w: 1936, h: 1176, st: 1 });
        minimize(w);
        assert.deepInclude(wv._wvWindowGeom(w), { x: -8, y: -8, w: 1936, h: 1176, st: 1 }, "not 199x34, not normal");
    });

    it("a window minimized before any capture gives no coordinates and no size", () => {
        const g = wv._wvWindowGeom(minimize(win({})));
        assert.deepInclude(g, { x: null, y: null, w: null, h: null });
    });

    it("the saved-window reopen never moves to a null position or resizes to an iconic size (source contract)", () => {
        const s = wvT.src("_wvSavedWindowReopen");
        assert.include(s, "g.x != null");
        assert.include(s, "g.w > 200 && g.h > 150");
    });
});
