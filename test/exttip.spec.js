/* global describe, it, before, after, assert, Zotero */

// External-link URL tip (2026-08-27). Upstream shows NO popup for external
// links -- it writes the URL into the whole PAGE DIV's `title`, and Gecko
// re-shows a title tooltip only after the pointer leaves the element (the
// entire page), so the "popup" appeared once per page visit and never again.
// Weavero owns the dwell timing (hide on move, show on every stop) and
// renders an IN-CONTENT div inside the reader iframe, styled live from a
// chrome <tooltip> donor. OS popup widgets are banned for this tip: a manual
// <tooltip> stops painting after native-engine interference, and even a
// panel's OS window went visible-but-blank under dwell churn (both proven
// 2026-08-27 -- EnumWindows/CopyFromScreen evidence in the tooltip register).

describe("Weavero — external-link URL tip", () => {
    let wv, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvExtTipRender !== "function") this.skip();
        win = Zotero.getMainWindow();
    });

    after(function () {
        try {
            const donor = win && win.document.getElementById("wv-exttip-style-donor");
            if (donor) donor.remove();
        } catch (e) {}
    });

    const stubPv = () => {
        const d = win.document.implementation.createHTMLDocument("wv-exttip-test");
        return { _iframeWindow: { document: d, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 } };
    };
    const stubReader = (pv) => ({ _window: win, _internalReader: { _primaryView: pv } });
    const tipIn = (pv) => pv._iframeWindow.document.getElementById("wv-exttip");

    it("renders an IN-CONTENT div (no OS popup) with the URL and donor styling", () => {
        const pv = stubPv();
        wv._wvExtTipRender(stubReader(pv), pv, "https://doi.org/10.1000/a", 200, 200);
        const tip = tipIn(pv);
        assert.isOk(tip, "div rendered inside the reader document");
        assert.equal(tip.textContent, "https://doi.org/10.1000/a");
        assert.equal(tip.style.position, "fixed");
        assert.equal(tip.style.pointerEvents, "none");
        assert.notEqual(tip.style.whiteSpace, "nowrap", "wraps like the native tooltip");
        assert.isOk(tip.style.maxWidth, "native wrap width applied");
        assert.isOk(tip.style.background, "donor background applied");
        assert.isOk(win.document.getElementById("wv-exttip-style-donor"), "chrome donor exists");
        assert.isNotOk(win._wvExtTipEl, "no chrome popup element is created");
        assert.isTrue(wv._wvExtTipDivVisible(pv));
    });

    it("positions below the cursor by the native 21px gap", () => {
        const pv = stubPv();
        wv._wvExtTipRender(stubReader(pv), pv, "https://doi.org/10.1000/b", 100, 100);
        assert.equal(tipIn(pv).style.top, "121px");
        assert.equal(tipIn(pv).style.left, "100px");
    });

    it("a move hides the div and re-arms the dwell timer", () => {
        const pv = stubPv();
        const timers = [];
        // NOT Object.create(win): Window accessors (document,
        // getComputedStyle) throw when invoked through a derived object --
        // both dwell cases failed that way on the v0.19.3 gate run.
        const reader = {
            _internalReader: { _primaryView: pv },
            _window: {
                document: win.document,
                getComputedStyle: win.getComputedStyle.bind(win),
                setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
                clearTimeout: () => {},
            },
        };
        wv._wvExtTipRender(reader, pv, "https://doi.org/10.1000/c", 100, 100);
        assert.isTrue(wv._wvExtTipDivVisible(pv));
        wv._wvExtTipOnMove(reader, { clientX: 500, clientY: 500 });
        assert.isFalse(wv._wvExtTipDivVisible(pv), "hidden on move");
        assert.equal(timers.length, 1, "dwell timer armed");
        assert.isAtLeast(timers[0], 200, "a real dwell, not instant");
    });

    it("jitter within the native 7px tolerance keeps a visible tip", () => {
        const pv = stubPv();
        const timers = [];
        const reader = {
            _internalReader: { _primaryView: pv },
            _window: {
                document: win.document,
                getComputedStyle: win.getComputedStyle.bind(win),
                setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
                clearTimeout: () => {},
            },
        };
        wv._wvExtTipRender(reader, pv, "https://doi.org/10.1000/j", 300, 300);
        pv._wvExtTipShownAt = { x: 300, y: 300 };
        wv._wvExtTipOnMove(reader, { clientX: 305, clientY: 296 });   // within 7px
        assert.isTrue(wv._wvExtTipDivVisible(pv), "tip survives jitter");
        assert.equal(timers.length, 0, "no countdown restarted for jitter");
        wv._wvExtTipOnMove(reader, { clientX: 330, clientY: 300 });   // beyond 7px
        assert.isFalse(wv._wvExtTipDivVisible(pv), "real movement hides");
        assert.equal(timers.length, 1, "movement re-arms the dwell");
    });
});
