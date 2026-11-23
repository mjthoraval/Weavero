/* global describe, it, before, after, assert, Zotero, wvT */

// The right-click "Copy Link" menu on Weavero's link spans, per main window (2026-11-20).
// Its state was ONE plugin field (`_urlMenuState`): only the first main window ever got
// the menu, and the field kept that window after it closed -- reader-leak.spec.js's
// "a plugin field keeps the closed window" caught it on the refs branch's full run
// (plugin._urlMenuState), where another window happened to build it first. Now each
// main window has its own (pane.ts URL_MENUS), removed at its close and in destroy().
describe("Weavero — the Copy Link menu in every main window", function () {
    this.timeout(90000);
    let wv, win, w2 = null;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /** A link span in `w`'s document, right-clicked: the menu shown there? */
    async function rightClickLink(w) {
        const doc = w.document;
        const sp = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        sp.className = "wv-url-span";
        sp.setAttribute("data-href", "https://example.org/wv-url-menu");
        sp.textContent = "example.org";
        doc.documentElement.appendChild(sp);
        try {
            const r = sp.getBoundingClientRect();
            sp.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, button: 2,
                clientX: r.left + 2, clientY: r.top + 2, screenX: (w.mozInnerScreenX || 0) + r.left + 2, screenY: (w.mozInnerScreenY || 0) + r.top + 2 }));
            await sleep(200);
            const m = doc.getElementById("wv-url-menu");
            const shown = !!m && w.getComputedStyle(m).display !== "none";
            try { doc.documentElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
            return shown;
        }
        finally { sp.remove(); }
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        win = Zotero.getMainWindow();
    });

    after(async function () {
        if (w2 && !w2.closed) { try { w2.close(); } catch (e) {} await sleep(1000); }
        try { win.focus(); } catch (e) {}
    });

    it("the first window and a second one each show the menu on a link's right-click", async function () {
        assert.isTrue(await rightClickLink(win), "the menu in the first window");
        w2 = await wvT.openMainWindow();
        assert.ok(w2, "fixture: a second main window");
        try { win.focus(); } catch (e) {}
        await wvT.waitFor(() => w2._wvTreeDelegate || null, 15000, 100);
        await sleep(500);
        assert.isTrue(await rightClickLink(w2), "the menu in the second window too");
    });

    it("the second window closed, the first window's menu still works", async function () {
        if (w2 && !w2.closed) { w2.close(); await wvT.waitFor(() => w2.closed || null, 10000, 100); await sleep(800); }
        assert.isTrue(await rightClickLink(win), "the menu in the first window after the other closed");
    });
});
