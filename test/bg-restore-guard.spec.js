/* global describe, it, before, after, assert, Zotero, Services, wvT */

// The background-restore focus guard (tabs.ts _wvBgRestoreStart) pushes a
// window opening during a restart's restore beneath the user's window, and
// must switch itself off when its hold ends. MJT 2026-10-26: "Open in New
// Window from the context menu of a collection open the window behind the
// current window" -- the guard was still on 206 s into the session: its
// lifetime check was scheduled on the most recently focused main window (the
// restored second window), which MJT closed 18 s in, and the check died with
// it. Every later window was armed at open and pushed back. Windows only
// (the guard is WINNT-gated). Written before the fix.

describe("Weavero — the background-restore focus guard ends", function () {
    this.timeout(90000);
    let wv, win;
    const opened = [];

    before(async function () {
        if (Services.appinfo.OS !== "WINNT") this.skip();
        wv = wvT.plugin();
        for (const m of ["_wvBgRestoreStart", "_wvSpawnMainWindowStart", "_wvSpawnMainWindowWait"]) wvT.method(m);
        win = Zotero.getMainWindow();
        // The runner's own startup guard first.
        assert.isTrue(await wvT.waitFor(() => !wv._wvBgRestoreOn, 50000), "the startup guard ended");
    });

    after(async function () {
        try { wv._wvBgRestoreStop(); } catch (e) {}
        await closeOpened();
    });

    async function closeOpened() {
        for (const w of opened.splice(0)) { try { if (!w.closed) { w._wvSavedParkClose = true; w.close(); } } catch (e) {} }
        await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
    }

    async function openWindow() {
        const s = wv._wvSpawnMainWindowStart();
        const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
        assert.isOk(w, "a new main window");
        opened.push(w);
        return w;
    }

    it("ends on time although the window its check was waiting on closed", async function () {
        const w2 = await openWindow();
        // The guard's check lands on whichever main window was focused last:
        // make that the window about to close.
        const orig = Zotero.getMainWindow;
        Zotero.getMainWindow = () => w2;
        try { wv._wvBgRestoreStart({ holdMs: 1500 }); }
        finally { Zotero.getMainWindow = orig; }
        assert.isTrue(wv._wvBgRestoreOn, "the guard runs");
        await closeOpened();
        assert.isTrue(await wvT.waitFor(() => !wv._wvBgRestoreOn, 6000), "the guard ended after its hold");
    });

    it("a window opening once the hold has run out is left alone, even before the next check", async function () {
        wv._wvBgRestoreStart({ holdMs: 300 });
        assert.isTrue(wv._wvBgRestoreOn, "the guard runs");
        await new Promise((r) => win.setTimeout(r, 400));   // the hold is over; the first check is due at 700 ms
        const w = await openWindow();
        assert.isNotOk(w._wvBgArmed, "not armed to be pushed back");
        assert.isFalse(wv._wvBgRestoreOn, "the late window ended the guard");
        await closeOpened();
    });

    // MJT 2026-10-26 (dev.43, after a restart): "Window behind: Still not
    // working" -- his Open in New Window came 22.6 s into the boot, inside the
    // hold the restore keeps for late reader windows, and was taken for one
    // of the restore's windows: armed and pushed back 11 times.
    it("a window the user opens while the guard is on is theirs: left in front and focused after; a restore window is still held back", async function () {
        wv._wvBgRestoreStart({ holdMs: 20000 });
        assert.isTrue(wv._wvBgRestoreOn, "the guard runs");
        try {
            const mine = await openWindow();   // a user's command: the spawn sequence without { restore }
            assert.isNotOk(mine._wvBgArmed, "the user's window is not armed to be pushed back");
            assert.strictEqual(wv._wvBgUserChosenWin, mine, "it is the window the guard focuses");
            const s = wv._wvSpawnMainWindowStart(undefined, { restore: true });
            const restored = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
            assert.isOk(restored, "a restore window");
            opened.push(restored);
            assert.isOk(restored._wvBgArmed, "the restore's window is held back as before");
        }
        finally { wv._wvBgRestoreStop(); await closeOpened(); }
    });

    it("stopping the guard (Weavero's shutdown) leaves the next window alone", async function () {
        assert.isFunction(wv._wvBgRestoreStop, "a stop the shutdown can call");
        wv._wvBgRestoreStart({ holdMs: 20000 });
        assert.isTrue(wv._wvBgRestoreOn, "the guard runs");
        wv._wvBgRestoreStop();
        assert.isFalse(wv._wvBgRestoreOn, "stopped");
        const w = await openWindow();
        assert.isNotOk(w._wvBgArmed, "not armed to be pushed back");
        await closeOpened();
    });
});
