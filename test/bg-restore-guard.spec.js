/* global describe, it, before, after, beforeEach, afterEach, assert, Zotero, Services, wvT */

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

    // Measured 2026-11-05 on a real 2 main + 2 reader workspace, the Windows
    // foreground window sampled every 25 ms: the target window was kept 5 times
    // in 15. Zotero's Reader.open calls reader.focus() without waiting, and that
    // raises the window once the reader has loaded, however long that takes; a
    // raise after the fixed open grace was taken for the user switching. All 10
    // lost restarts carry that claim, none of the 5 good ones does.
    it("a reader opening under the guard marks its window as raising itself", async function () {
        const att = await wvT.createTestPDFItem("wv-bg-load");
        wv._wvBgRestoreStart({ holdMs: 20000, targetWin: win });
        let w = null;
        try {
            const r = /** @type {any} */ (await Zotero.Reader.open(att.id, null, { openInWindow: true, allowDuplicate: true }));
            w = r._window;
            assert.isAbove(w._wvBgExpectStealUntil || 0, Date.now(), "marked while its reader loads");
            await wvT.waitFor(() => w.document.readyState === "complete", 10000);   // never close a loading window
            await r._initPromise;
        }
        finally {
            wv._wvBgRestoreStop();
            try { if (w && !w.closed) w.close(); } catch (e) {}
            await wvT.waitFor(() => !w || w.closed, 8000);
            wvT.purgeDeadReaders();
            await wvT.erase(att);
        }
    });

    // The last false claim on 10 windows, 2026-11-05: all four lost restarts ended
    // on a note. A note tab comes up through _wvWTSwitch, not Reader.open, and
    // note-editor's focus() also waits for the editor, then raises the window.
    it("a note tab coming up under the guard marks its window as raising itself", async function () {
        const att = await wvT.createTestPDFItem("wv-bg-note");
        const note = /** @type {any} */ (new Zotero.Item("note"));
        note.setNote("<p>wv-bg-note</p>");
        await note.saveTx();
        let w = null;
        try {
            const r = /** @type {any} */ (await Zotero.Reader.open(att.id, null, { openInWindow: true, allowDuplicate: true }));
            w = r._window;
            await wvT.waitFor(() => w.document.readyState === "complete", 10000);
            await r._initPromise;
            wv._wvBgRestoreStart({ holdMs: 20000, targetWin: win });
            w._wvBgExpectStealUntil = 0;
            await wv._wvWTMountTab(w, note.id, { select: true });
            assert.isAbove(w._wvBgExpectStealUntil || 0, Date.now(), "marked while the editor loads");
        }
        finally {
            wv._wvBgRestoreStop();
            await wvT.sleep(800);
            try { if (w && !w.closed) w.close(); } catch (e) {}
            await wvT.waitFor(() => !w || w.closed, 8000);
            await wvT.sleep(1500);   // the closing editor saves: never erase under it
            wvT.purgeDeadReaders();
            await wvT.erase(note, att);
        }
    });

    it("a raise is the window's own while its reader loads, whatever the wait; once loaded an activation is the user's again", async function () {
        wv._wvBgRestoreStart({ holdMs: 20000, targetWin: win });
        try {
            const s = wv._wvSpawnMainWindowStart(undefined, { restore: true });
            const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
            assert.isOk(w, "a restore window");
            opened.push(w);
            w._wvBgOpenGrace = 0;   // the fixed grace has run out
            let loaded = /** @type {(v?: any) => void} */ (() => {});
            wv._wvBgMarkReaderLoad({ _window: w, _initPromise: new Promise((r) => { loaded = r; }) });
            const raise = () => w.dispatchEvent(new w.Event("activate"));
            // A label, not the window: chai cannot print a window object.
            const chosen = () => { const c = wv._wvBgUserChosenWin; return !c ? "nobody" : c === w ? "this window" : c === win ? "the target" : "another window"; };
            raise();
            assert.strictEqual(chosen(), "nobody", "still loading: its own raise");
            await new Promise((r) => win.setTimeout(r, 300));
            raise();
            assert.strictEqual(chosen(), "nobody", "still loading, later: still its own");
            loaded();
            await new Promise((r) => win.setTimeout(r, 50));
            raise();
            assert.strictEqual(chosen(), "nobody", "just loaded: the focus call lands now");
            await new Promise((r) => win.setTimeout(r, 1700));
            raise();
            assert.strictEqual(chosen(), "this window", "past the tail, an unmarked activation is the user's");
        }
        finally { wv._wvBgRestoreStop(); await closeOpened(); }
    });

    // The 10-window restart, clean legs 2026-11-05. Both lost clicks read
    //   user claimed 'LoC Class PR...' (mousedown)
    //   user claimed '' (mouse-button-held idle=16ms)    about 20 ms later
    // a loading window activated under the button of a click in another window
    // and took the claim. The stand-in holds the button: a spec cannot press one.
    describe("a click in progress", function () {
        let clicked, loading, held;
        const restoreWindow = async () => {
            const s = wv._wvSpawnMainWindowStart(undefined, { restore: true });
            const w = await wv._wvSpawnMainWindowWait(s, { wait: "init", timeoutMs: 25000, timerWin: win, dropOnTimeout: true });
            assert.isOk(w, "a restore window");
            opened.push(w);
            return w;
        };
        const mouse = (w, type) => w.dispatchEvent(new w.MouseEvent(type, { bubbles: true }));
        const raise = (w) => w.dispatchEvent(new w.Event("activate"));
        // A label, not the window: chai cannot print a window object.
        const chosen = () => { const c = wv._wvBgUserChosenWin; return !c ? "nobody" : c === clicked ? "clicked" : c === loading ? "loading" : "another window"; };
        const hold = () => { wv._wvBgSwitchEvidence = () => "mouse-button-held"; };

        beforeEach(async function () {
            wv._wvBgRestoreStart({ holdMs: 20000, targetWin: win });
            held = wv._wvBgSwitchEvidence;
            clicked = await restoreWindow();
            loading = await restoreWindow();
        });

        afterEach(async function () {
            wv._wvBgSwitchEvidence = held;
            wv._wvBgRestoreStop();
            await closeOpened();
        });

        it("keeps the claim while its button is down: a window activating under it is not the user's", async function () {
            hold();
            mouse(clicked, "mousedown");
            assert.strictEqual(chosen(), "clicked", "the click claims");
            raise(loading);
            assert.strictEqual(chosen(), "clicked", "still the clicked window");
        });

        it("holds for an unmarked window too: no mark, but the press is elsewhere", async function () {
            hold();
            mouse(clicked, "mousedown");
            loading._wvBgOpenGrace = 0;
            loading._wvBgExpectStealUntil = 0;
            raise(loading);
            assert.strictEqual(chosen(), "clicked");
        });

        it("a press on a title bar reaches no mousedown: its held-button claim is kept the same way", async function () {
            hold();
            raise(clicked);
            assert.strictEqual(chosen(), "clicked", "the window under the press claims");
            raise(loading);
            assert.strictEqual(chosen(), "clicked", "and keeps it");
        });

        it("ends with the release: a later press outside Zotero, the taskbar's, still claims", async function () {
            hold();
            mouse(clicked, "mousedown");
            mouse(clicked, "mouseup");
            raise(loading);
            assert.strictEqual(chosen(), "loading", "held evidence with no press in a Zotero window");
        });

        it("ends on its own when the release never arrives", async function () {
            hold();
            mouse(clicked, "mousedown");
            await new Promise((r) => win.setTimeout(r, 1200));
            raise(loading);
            assert.strictEqual(chosen(), "loading", "a lost release does not hold the claim");
        });
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
