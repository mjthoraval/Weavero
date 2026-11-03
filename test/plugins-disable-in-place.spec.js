/* global describe, it, before, after, assert, Zotero, wvT, Services */

// Disabling Weavero from the Plugins Manager (MJT 2026-10-26):
// - "When I disable the Weavero plugin, it directly jumps to the disabled
//   plugins list. For other plugins, they stay still for a while" --
//   about:addons queues a card's move while the list is under the pointer or
//   holds focus (addon-list.mjs updateAddon / handleEvent, read live), and
//   Weavero's teardown took its page changes away at once: the list shrank
//   from 664 to 348 px out from under the pointer, the page saw a mouseleave
//   and moved the card. Now the page changes go when the list is let go of.
// - "When I disable Weavero, the controls do not get back to the native
//   state" -- Weavero opens the manager with minimize / maximize, Zotero as a
//   close-only dialog; an open window keeps its buttons (Windows).
// Written before the code.

describe("Weavero — disabling Weavero from the Plugins Manager", function () {
    this.timeout(60000);
    const URI = "chrome://mozapps/content/extensions/aboutaddons.html";
    const BOXES = 0x20000 | 0x10000;
    let wv, win;
    const pageDoc = (w) => {
        try {
            const br = w.document.querySelector("browser");
            const cd = br && br.contentDocument;
            return cd && String(cd.location.href).includes("aboutaddons") ? cd : null;
        } catch (e) { return null; }
    };
    const closeManagers = async () => {
        for (const w of Services.wm.getEnumerator("zotero:basicViewer")) {
            try { if (String(/** @type {any} */ (w).viewerOriginalURI || "").includes("aboutaddons")) w.close(); } catch (e) {}
        }
        await wvT.waitFor(() => ![...Services.wm.getEnumerator("zotero:basicViewer")].some((w) => String(/** @type {any} */ (w).viewerOriginalURI || "").includes("aboutaddons")), 8000);
    };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_teardownPluginsSearch", "_registerPluginsSearch", "_wvPMWhenListLetGo", "_wvWindowButtons", "_wvWindowStyle"]) wvT.method(m);
        if (!wv._getEnablePluginsSearch()) wvT.absent("Plugins Manager extras switched off in this profile");
        await closeManagers();
    });

    after(async function () {
        try { wv._registerPluginsSearch(); } catch (e) {}
        await closeManagers();
    });

    it("while the list holds focus, Weavero's page changes stay until it is let go of -- then they go", async function () {
        win = /** @type {any} */ (Zotero.openInViewer(URI));
        const cd = await wvT.waitFor(() => { const d = pageDoc(win); return d && d.getElementById("wv-pm-searchbox") && d.querySelector("addon-list addon-card") ? d : null; }, 15000);
        assert.isOk(cd, "the manager, with Weavero's search box");
        const list = cd.querySelector("addon-list");
        assert.isFalse(list.matches(":hover"), "the runner's pointer is not over the list");
        const width = Math.round(list.getBoundingClientRect().width);
        const target = list.querySelector("addon-card button, addon-card moz-toggle, addon-card [tabindex]");
        // `:focus-within` needs the manager to be the active window.
        win.focus();
        await wvT.waitFor(() => cd.hasFocus(), 3000);
        target.focus();
        assert.isTrue(list.matches(":focus-within"), "the list holds focus, as after a click on a card's toggle");
        wv._teardownPluginsSearch();
        assert.isOk(cd.getElementById("wv-pm-searchbox-leaving"), "the box stays while the list is held");
        assert.strictEqual(Math.round(list.getBoundingClientRect().width), width, "the list keeps its width under the pointer");
        assert.isNull(cd.getElementById("wv-pm-searchbox"), "under another id: a new instance would build its own");
        target.blur();
        await wvT.waitFor(() => !cd.getElementById("wv-pm-searchbox-leaving"), 3000);
        assert.isNull(cd.getElementById("wv-pm-searchbox-leaving"), "let go of: the box and Weavero's rules go");
        assert.isNull(cd.getElementById("wv-pm-search-styles-leaving"));
        wv._registerPluginsSearch();
        await wvT.waitFor(() => cd.getElementById("wv-pm-searchbox"), 5000);
        assert.isOk(cd.getElementById("wv-pm-searchbox"), "Weavero back: its box again");
    });

    it("a manager Zotero opened gets minimize and maximize while Weavero runs and loses them when it stops (Windows)", async function () {
        if (!Zotero.isWin) this.skip();
        await closeManagers();
        const Z = /** @type {any} */ (Zotero);
        win = (Z._wvOrigOpenInViewer || Z.openInViewer).call(Z, URI);   // Zotero's close-only dialog
        await wvT.waitFor(() => pageDoc(win), 15000);
        await wvT.waitFor(() => (wv._wvWindowStyle(win) & BOXES) === BOXES, 6000);
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, BOXES, "Weavero running: minimize and maximize");
        wv._teardownPluginsSearch();
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, 0, "Weavero stopped: close only, as Zotero opens it");
        wv._registerPluginsSearch();
        await wvT.waitFor(() => (wv._wvWindowStyle(win) & BOXES) === BOXES, 6000);
        assert.strictEqual(wv._wvWindowStyle(win) & BOXES, BOXES, "Weavero started again: back on the open window");
    });
});
