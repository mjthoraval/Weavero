/* global describe, it, before, after, assert, Zotero, wvT */

// The Cited by pass waits for the main window's idle moments between slices
// (cited-by.ts _wvCbPace). Two such waits can be in flight at once: a pass,
// and the library-change check (_wvCbLibChanged), which paces through the same
// function and looks at _wvCbRunning only when it starts. Until 2026-11-27
// they shared one handle slot (`_wvCbIdle`): the first to wake took the
// other's handle, cancelled its idle callback and its backstop timer, and the
// other never woke -- a pass "running" for good: refs-fulltext.spec.js's
// before-all hook timed out at 240 s, and sdt-clean.spec.js inherited the
// pass (dev.99 triage). One handle per wait now; _wvCbReset / _wvCbStop wake
// every one. No library write, no pass: the pacing alone.

describe("Weavero — Cited by: two pacing waits at once both end", function () {
    this.timeout(60000);
    let wv, win, statsWas = null;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvCbPace");
        win = Zotero.getMainWindow();
        assert.ok(await wvT.waitFor(() => !wv._wvCbRunning, 30000, 50), "fixture: no Cited by pass under way");
        statsWas = JSON.parse(JSON.stringify(wv._wvCbStatsObj()));
    });

    // A wait that ends starts a slice (_wvCbSliceAt); a pass and the library check
    // end theirs when they finish (cited-by.ts). Left running, the next pass's
    // first pace counted the seconds since this spec as one slice --
    // cited-by.spec.js's "no slice blocked for long" read 4860 ms (devfix2.2's
    // picked run). The slice clock off, the stats as they were.
    after(function () {
        if (!wv) return;
        wv._wvCbSliceAt = 0;
        if (statsWas) Object.assign(wv._wvCbStatsObj(), statsWas);
    });

    it("two waits started together both end (each wakes on its own idle callback or its backstop)", async function () {
        // The idle-callback branch is the one where the waits could take each
        // other's handle; a hidden window takes a plain timer instead. The
        // runner's window may be hidden (another app in front): it is made to
        // read as shown for the probe -- Gecko still calls a hidden window's
        // idle callbacks, at their 1-s timeout.
        assert.isFunction(win.requestIdleCallback, "fixture: the main window has idle callbacks");
        const doc = win.document;
        const shown = !doc.hidden;
        if (!shown) Object.defineProperty(doc, "hidden", { get: () => false, configurable: true });
        let r;
        try {
            r = await Promise.race([
                Promise.all([wv._wvCbPace(true), wv._wvCbPace(true)]).then(() => "both"),
                wvT.sleep(5000).then(() => "hung"),
            ]);
        }
        finally { if (!shown) delete doc.hidden; }
        assert.strictEqual(r, "both", "both waits ended within 5 s (window " + (shown ? "shown" : "hidden, read as shown") + ")");
        const left = wv._wvCbIdles ? wv._wvCbIdles.size : null;
        assert.strictEqual(left, 0, "no wait's handle left behind");
    });

    // What _wvCbReset and _wvCbStop call: every wait goes on at once, before any
    // idle callback or timer could have run (microtasks only below).
    it("a wake of every wait ends them all at once", async function () {
        wvT.method("_wvCbWakeAll");
        let n = 0;
        const waits = [wv._wvCbPace(true), wv._wvCbPace(true), wv._wvCbPace(true)].map(p => p.then(() => { n++; }));
        assert.strictEqual(wv._wvCbIdles.size, 3, "three handles, one per wait");
        wv._wvCbWakeAll();
        for (let i = 0; i < 30 && n < 3; i++) await Promise.resolve();
        assert.strictEqual(n, 3, "the three waits ended without a turn of the event loop");
        assert.strictEqual(wv._wvCbIdles.size, 0, "no handle left");
        await Promise.all(waits);
    });
});
