/* global describe, it, before, after, assert, Zotero */

// Survey 2026-10-06: session tracking checked its guards (switching, quitting,
// restore in flight) only when the 700 ms capture was SCHEDULED, never when
// it fired -- a capture queued just before a session switch ran mid-teardown
// and wrote the half-torn-down workspace into the session being LEFT. Now
// the guards are re-checked at fire time, the destructive paths cancel the
// pending capture, and only their own explicit flush is forced.

describe("Weavero — session tracking never captures mid-switch or while quitting", () => {
    let wv;
    const saved = {};
    const stub = (name, impl) => {
        saved[name] = Object.prototype.hasOwnProperty.call(wv, name) ? wv[name] : undefined;
        wv[name] = impl;
    };
    const unstub = () => {
        for (const n of Object.keys(saved)) {
            if (saved[n] === undefined) delete wv[n]; else wv[n] = saved[n];
            delete saved[n];
        }
    };
    let flags;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
        assert.isFunction(wv._wvTabSessionTrackingAllowed, "_wvTabSessionTrackingAllowed");
        assert.isFunction(wv._wvTabSessionTrackingCancel, "_wvTabSessionTrackingCancel");
        flags = {
            switching: wv._wvTabSessionSwitching, quitting: wv._wvQuitting,
            guard: wv._wvTabGroupRestoreGuard, wt: wv._wvWTRestoreActive,
        };
    });

    after(() => {
        if (!wv) return;
        unstub();
        wv._wvTabSessionSwitching = flags.switching;
        wv._wvQuitting = flags.quitting;
        wv._wvTabGroupRestoreGuard = flags.guard;
        wv._wvWTRestoreActive = flags.wt;
        try { wv._wvTabSessionTrackingCancel(); } catch (_) {}
    });

    it("a scheduled flush re-checks the guards when it fires; the switch path's explicit flush is forced", async () => {
        let captures = 0;
        stub("_wvTabSessionInit", async () => {});
        stub("_wvGetEnableTabSessions", () => true);
        stub("_wvTabSessionGetActiveId", () => "wv-test-sess");
        stub("_wvTabSessionList", () => [{ id: "wv-test-sess", name: "t", windows: [] }]);
        stub("_wvTabSessionCaptureWindows", () => { captures++; return []; });
        stub("_wvTabSessionCaptureGroups", () => []);
        stub("_wvTabSessionPersist", async () => {});
        wv._wvTabGroupRestoreGuard = false;
        wv._wvWTRestoreActive = false;
        wv._wvQuitting = false;
        try {
            wv._wvTabSessionSwitching = true;
            await wv._wvTabSessionTrackingFlush();
            assert.equal(captures, 0, "mid-switch: a scheduled flush captures nothing");
            await wv._wvTabSessionTrackingFlush({ force: true });
            assert.equal(captures, 1, "the switch's own flush of the outgoing workspace still runs");
            wv._wvTabSessionSwitching = false;
            wv._wvQuitting = true;
            await wv._wvTabSessionTrackingFlush();
            assert.equal(captures, 1, "quitting: a scheduled flush captures nothing");
            wv._wvQuitting = false;
            await wv._wvTabSessionTrackingFlush();
            assert.equal(captures, 2, "a normal scheduled flush captures");
        }
        finally {
            wv._wvTabSessionSwitching = false;
            wv._wvQuitting = false;
            unstub();
        }
    });

    it("the destructive paths cancel a pending capture before tearing the workspace down", () => {
        wv._wvTabSessionTrackTimer = 123456789;   // a stale handle: cancel must drop it
        wv._wvTabSessionTrackingCancel();
        assert.isNull(wv._wvTabSessionTrackTimer);
        for (const name of ["_wvTabSessionSwitch", "_wvTabSessionNewEmpty"]) {
            const src = String(wv[name]);
            const cancelAt = src.indexOf("_wvTabSessionTrackingCancel");
            assert.isAbove(cancelAt, -1, name + " cancels the pending capture");
            assert.isBelow(cancelAt, src.indexOf("_wvTabSessionTrackingFlush"), name + ": cancels before its own flush");
            assert.include(src, "{ force: true }", name + " forces its own flush");
        }
    });
});
