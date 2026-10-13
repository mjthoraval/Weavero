/* global describe, it, before, assert, Zotero */

// A reload can land while the previous instance is still initializing (an
// install, then an immediate reload), and its window timers keep firing after
// destroy(). That instance then wired windows anyway: keyed listeners were
// refused (lib/listen.ts dead tag), plain ones -- the items / collections
// context menus, the Copy Link menu with its pointerdown on every frame --
// stayed for the session (live audit on the dev profile, 2026-10-13: 14
// listeners from one dead instance). A destroyed instance wires nothing.

describe("Weavero — a destroyed instance wires nothing", () => {
    let wv, win;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWireMainWindow", "_wvWireReaderWindow", "_setupTreeClickDelegate"]) wvT.method(m);
        win = Zotero.getMainWindow();
    });

    /** Run `fn` with the live instance flagged destroyed and `names`
     *  replaced by recorders; restores both, synchronously. */
    function asDestroyed(names, fn) {
        const saved = names.map((n) => ({ n, own: Object.prototype.hasOwnProperty.call(wv, n), orig: wv[n] }));
        const calls = [];
        for (const n of names) wv[n] = function () { calls.push(n); };
        const was = wv._wvDestroyed;
        wv._wvDestroyed = true;
        try { fn(); }
        finally {
            wv._wvDestroyed = was;
            for (const s of saved) { if (s.own) wv[s.n] = s.orig; else delete wv[s.n]; }
        }
        return calls;
    }

    it("the main-window table runs no entry", () => {
        const calls = asDestroyed(["_setupItemsListContextMenu", "_setupCollectionsContextMenu"],
            () => wv._wvWireMainWindow(win, "load"));
        assert.deepEqual(calls, []);
    });

    it("the reader-window table runs no entry", () => {
        // A stand-in reader window: the runner checks only its type.
        const rw = { closed: false, document: { documentElement: { getAttribute: (a) => (a === "windowtype" ? "zotero:reader" : null) } } };
        const calls = asDestroyed(["_wvWireReopenClosedShortcut", "_wvWireNewWindowShortcut"],
            () => wv._wvWireReaderWindow(rw, { _window: rw, _wvStandIn: true }, "init", false));
        assert.deepEqual(calls, []);
    });

    it("the Copy Link menu's retry does not set up again", () => {
        const before = win._wvTreeDelegate;
        asDestroyed([], () => wv._setupTreeClickDelegate(win));
        assert.strictEqual(win._wvTreeDelegate, before, "the window's delegate is untouched");
    });

    it("init stops after each await once destroyed (source contract)", () => {
        const n = (wvT.src("init").match(/_wvDestroyed\) return/g) || []).length;
        assert.isAtLeast(n, 3, "after the readers loop, the icon encoding and the pref pane");
    });
});
