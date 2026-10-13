/* global describe, it, before, assert, Zotero, Services */

// Windows Weavero decorates as they open -- the Software Update dialog (its
// "Currently installed: Zotero <version>" line) and pop-out note windows --
// are caught by window-mediator listeners. On Firefox 153 (Zotero 11) the
// listener gets a new window while it still holds its initial about:blank,
// which already reads "complete": the listeners' own `readyState` check
// looked at that blank page, found no windowtype / no note.xhtml, and never
// waited for the real document (measured 2026-10-12; the version line had
// vanished from MJT's update dialog). lib/dom.ts `wvWhenWindowLoaded` waits
// for the REAL document. Opening the real update dialog here would start an
// update check, so the helper is driven through a harmless window (About)
// and the two listeners are held to it by a source contract.

describe("Weavero — windows caught as they open get their real document", function () {
    this.timeout(30000);
    let wv, lib;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        if (!lib || typeof lib.wvWhenWindowLoaded !== "function") wvT.absent("Zotero.Weavero.lib.wvWhenWindowLoaded");
    });

    it("a window-mediator listener using the helper sees the loaded document, not about:blank", async () => {
        const seen = [];
        const listener = {
            onOpenWindow(xw) {
                try {
                    const w = xw.docShell.domWindow;
                    lib.wvWhenWindowLoaded(w, (lw) => {
                        seen.push({ href: String(lw.location.href), rs: lw.document.readyState });
                    });
                } catch (e) { seen.push({ err: String(e) }); }
            },
            onCloseWindow() {},
            onWindowTitleChange() {},
        };
        Services.wm.addListener(listener);
        let w = null;
        try {
            w = /** @type {any} */ (Services.ww.openWindow(null, "chrome://zotero/content/about.xhtml", "", "chrome,dialog=no", null));
            for (let i = 0; i < 50 && !seen.length; i++) await wvT.sleep(100);
        }
        finally {
            Services.wm.removeListener(listener);
            try { if (w) w.close(); } catch (e) {}
        }
        assert.deepEqual(seen, [{ href: "chrome://zotero/content/about.xhtml", rs: "complete" }]);
    });

    it("the update-dialog and note-window listeners wait through the helper", () => {
        for (const m of ["_setupUpdateWindowListener", "_setupNoteWindowListener"]) {
            if (typeof wv[m] !== "function") wvT.absent("plugin." + m);
            const src = String(wv[m]);
            assert.include(src, "wvWhenWindowLoaded", m + " uses the helper");
            assert.notMatch(src, /readyState\s*===\s*"complete"/, m + " has no readyState check of its own");
        }
    });
});
