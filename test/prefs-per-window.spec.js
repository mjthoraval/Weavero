/* global describe, it, before, after, assert, Zotero, wvT */

// Settings whose change reached only ONE main window (found 2026-11-26 while mapping the window
// wiring for the "each wiring entry owns its undo" refactor; work/TODO.md): the libraries
// highlight, the tabs menu's file-type filter and the group-library glyph. Their pref observers
// (prefs-observers.ts) took Zotero.getMainWindow() and set up / tore down that window alone; any
// other open main window kept the old state until a reload. The observers around them already
// looped over every main window.
describe("Weavero — a setting changed while two main windows are open reaches both", function () {
    this.timeout(180000);
    let wv, win, w2 = null;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const wins = () => [win, w2];
    /** @param {(w: any) => boolean} on */
    const state = (on) => wins().map((w, i) => (i ? "second window " : "first window ") + (on(w) ? "on" : "off")).join(", ");
    const CASES = [
        { pref: "weavero.enableLibrariesHighlight", what: "the libraries highlight",
            on: (/** @type {any} */ w) => !!w._wvLibrariesBoxMo },
        { pref: "weavero.enableTabsFileTypeFilter", what: "the tabs menu's file-type filter button",
            on: (/** @type {any} */ w) => !!w.document.getElementById("wv-tabs-menu-filetype-btn") },
        { pref: "weavero.enableGroupLibraryGlyph", what: "the group-library glyph's tab tooltip",
            on: (/** @type {any} */ w) => !!w.document.getElementById("wv-tab-library-tooltip") },
    ];

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow();
        w2 = await wvT.openMainWindow();
        assert.ok(w2, "fixture: a second main window");
        await sleep(3000);   // its wiring: the tabs menu panel's setup retries once a second until upgraded
        try { win.focus(); } catch (e) {}
        await sleep(500);
    });

    after(async function () {
        if (w2 && !w2.closed) {
            try { w2.close(); } catch (e) {}
            await wvT.waitFor(() => w2.closed || null, 10000, 100);
            await sleep(800);
        }
        try { win.focus(); } catch (e) {}
    });

    for (const c of CASES) {
        it(c.what + ": switched and switched back, both windows follow", async function () {
            const initial = !!Zotero.Prefs.get(c.pref);
            assert.ok(await wvT.waitFor(() => wins().every(w => c.on(w) === initial) || null, 15000, 100),
                "fixture: both windows show " + c.what + " " + (initial ? "on" : "off") + " -- " + state(c.on));
            await wvT.withPref(c.pref, !initial, async () => {
                assert.ok(await wvT.waitFor(() => wins().every(w => c.on(w) === !initial) || null, 8000, 100),
                    c.pref + " set to " + !initial + ": both windows follow -- " + state(c.on));
            });
            assert.ok(await wvT.waitFor(() => wins().every(w => c.on(w) === initial) || null, 8000, 100),
                c.pref + " back to " + initial + ": both windows follow -- " + state(c.on));
        });
    }
});
