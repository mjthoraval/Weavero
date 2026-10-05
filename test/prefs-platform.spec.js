/* global describe, it, assert, Zotero */

// Windows-only settings (2026-10-01): "Per-window taskbar icons" and
// "Separate taskbar button per window" go through Win32 calls gated on
// Zotero.isWin, but stayed clickable on Linux and did nothing. They are marked
// [data-wv-platform="win"] and carry a hidden "Windows only" note; prefs.js
// (bindPlatformOnly) greys the checkbox and shows the note off Windows.
// The markup contract is checked here; the pane script's behaviour was
// verified live through the bridge (the IIFE's functions are not reachable).

describe("Weavero — Settings pane: Windows-only settings are marked", () => {
    const pane = async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const html = await (await fetch(rootURI + "prefs.html")).text();
        const frag = Zotero.getMainWindow().MozXULElement.parseXULToFragment(html);
        const ms = frag.querySelector(".main-section");
        assert.isOk(ms, "prefs.html parses");
        return ms;
    };

    for (const pref of ["windowIcons", "separateTaskbarButtons"]) {
        it(pref + ": marked Windows-only, with a hidden note", async () => {
            const ms = await pane();
            const cb = ms.querySelector('checkbox[preference="extensions.zotero.weavero.' + pref + '"]');
            assert.isOk(cb, "the checkbox exists");
            const block = cb.closest(".wv-block");
            assert.equal(block.getAttribute("data-wv-platform"), "win", "its block is marked Windows-only");
            const note = block.querySelector(".wv-platform-note");
            assert.isOk(note, "it carries the note");
            assert.equal(note.getAttribute("hidden"), "true", "the note starts hidden (shown off Windows by prefs.js)");
            assert.include(note.textContent, "Windows only");
        });
    }

    it("the pane script knows the marker", async () => {
        const rootURI = await Zotero.Plugins.getRootURI("weavero@mjthoraval");
        const js = await (await fetch(rootURI + "prefs.js")).text();
        assert.include(js, 'data-wv-platform="win"', "bindPlatformOnly reads the marker");
        assert.include(js, "wv-platform-off", "and sets the grey-out class");
    });
});
