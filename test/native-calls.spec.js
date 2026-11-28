/* global describe, it, before, assert, Zotero, wvT */

// No native code of Weavero's own outside the one Windows call Gecko has no
// service for (2026-11-27). The Zotero Plugins Atlas graded Weavero "Use with
// care" for one finding, "Loads native code": index.js imported
// resource://gre/modules/ctypes.sys.mjs. The window icons, the per-window
// taskbar ids and buttons, the overlay badges and the drag test moved to
// Gecko's own services (modules/tabs.ts; test/win-taskbar.spec.js,
// test/win-icons.spec.js). Left on js-ctypes, until the maintainer decides:
//   - the startup restore's z-order and input state (tabs.ts _wvBgRestoreStart:
//     SetWindowPos, GetAsyncKeyState, GetCursorPos, GetSystemMetrics).
// Gone the same day: the minimize / maximize buttons set on an open Settings
// window or Plugins Manager when Weavero started or stopped (lib/windows.ts
// wvWin32Style: Get/SetWindowLong, SetWindowPos; MJT, "1a, drop the live
// change", then "same as Settings"). Those buttons come from how the window is
// opened, through no native call (test/prefs-window-buttons.spec.js).
// Read in the SHIPPED files, as the Atlas reads them (compat.spec.js does the
// same for its guards): a use arriving through a dependency counts too. The
// bundle keeps the source's comments (esbuild, unminified), so a comment
// outside the listed function that names js-ctypes fails here as well: say
// "native call" there. The same check on main's build (1.3.0-dev.91) found
// 134 such lines.

describe("Weavero — native code only where Gecko has no service", function () {
    this.timeout(30000);
    const FILES = ["index.js", "bootstrap.js", "prefs.js", "doc-layer-worker.js", "note-editor-inject.js"];
    let wv, texts = {};

    /** The text of the top-level `function <name>(` in `bundle`, braces matched. */
    function fnText(bundle, name) {
        const at = bundle.indexOf("function " + name + "(");
        if (at < 0) return null;
        let i = bundle.indexOf("{", bundle.indexOf(")", at)), depth = 0;
        for (; i < bundle.length; i++) {
            const c = bundle[i];
            if (c === "{") depth++;
            else if (c === "}" && --depth === 0) return bundle.slice(at, i + 1);
        }
        return null;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvBgRestoreStart");
        // Deliberately no skip: a guard that cannot read what it guards fails.
        const rootURI = await wvT.rootURI();
        for (const f of FILES) texts[f] = await (await fetch(rootURI + f)).text();
        assert.isAbove(texts["index.js"].length, 1000, "the bundle is there");
    });

    it("js-ctypes appears only in the startup restore's z-order", () => {
        const bundle = texts["index.js"];
        const allowed = {
            "_wvBgRestoreStart (startup restore: SetWindowPos and the input state)": wvT.src("_wvBgRestoreStart"),
        };
        let rest = bundle;
        for (const [what, text] of Object.entries(allowed)) {
            assert.isString(text, what + ": found in the bundle");
            // The check can see a use at all: each allowed one does load it.
            assert.include(text, "ctypes.sys.mjs", what + " still loads js-ctypes (else drop it from this list)");
            assert.include(rest, text, what + ": its text is the bundle's");
            rest = rest.split(text).join("");
        }
        const left = rest.split("\n").filter(l => /ctypes/.test(l)).map(l => l.trim().slice(0, 160));
        assert.deepEqual(left, [], "js-ctypes outside the listed use");
        for (const f of FILES.filter(f => f !== "index.js")) {
            assert.notMatch(texts[f], /ctypes/, f + " names js-ctypes");
        }
    });

    it("the window-style call is gone: no function sets a window's minimize / maximize through user32 any more", () => {
        assert.isNull(fnText(texts["index.js"], "wvWin32Style"), "wvWin32Style is still in the bundle");
        for (const m of ["_wvWindowButtons", "_wvWindowStyle"]) assert.isUndefined(wv[m], m);
    });

    it("the mouse-button read through user32 is gone (a window drag is read from the window's moves)", () => {
        assert.isUndefined(wv._wvMouseButtonDown, "_wvMouseButtonDown");
        for (const m of ["_wvOvDragLive", "_wvOvNoteMove"]) wvT.method(m);
    });
});
