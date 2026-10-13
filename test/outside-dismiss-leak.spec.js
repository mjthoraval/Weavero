/* global describe, it, before, assert, Zotero, Components */

// `_attachOutsideClickDismiss` (reader.ts) attaches its click-outside
// listener to every reachable document one tick LATER (so the opening click
// does not dismiss). A popup closed within that tick -- or reopened at once
// -- called the returned teardown before the attach: nothing was removed,
// the timer attached anyway, and the listener stayed on every document for
// the session (found by test/zz-reload-listeners.spec.js, 2026-10-12: up to
// six stale `mousedown` listeners per document after the popup specs).

describe("Weavero — a popup's click-outside dismisser torn down at once leaves no listener", function () {
    this.timeout(15000);
    let wv, win, doc, els, Cu;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_attachOutsideClickDismiss");
        win = Zotero.getMainWindow();
        doc = win.document;
        els = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
        Cu = Components.utils;
    });

    /** Capturing mousedown listeners on `doc` whose function is Weavero's. */
    const weaveroMousedowns = () => {
        const scope = Cu.getGlobalForObject(wv._wvWireTag);
        let n = 0;
        for (const li of els.getListenerInfoFor(doc)) {
            if (li.type !== "mousedown" || !li.capturing) continue;
            let fn = null;
            try { fn = li.listenerObject; } catch (e) {}
            if (fn && Cu.getGlobalForObject(fn) === scope) n++;
        }
        return n;
    };

    it("teardown before the deferred attach: the attach is skipped", async () => {
        const panel = doc.createElement("div");
        const before = weaveroMousedowns();
        for (let i = 0; i < 3; i++) {
            const teardown = wv._attachOutsideClickDismiss(panel, doc, win, () => {});
            teardown();   // same tick: closed before the deferred attach
        }
        await wvT.sleep(100);
        assert.strictEqual(weaveroMousedowns(), before);
    });

    it("a reopen replaces the previous dismisser", async () => {
        const panel = doc.createElement("div");
        const before = weaveroMousedowns();
        for (let i = 0; i < 3; i++) {
            wv._attachOutsideClickDismiss(panel, doc, win, () => {});
            await wvT.sleep(50);
        }
        assert.strictEqual(weaveroMousedowns(), before + 1);
        panel._wvDismissOff();
        assert.strictEqual(weaveroMousedowns(), before);
    });

    it("a popup closed without an outside click drops its dismisser on the next mousedown", async () => {
        const panel = doc.createElement("div");
        doc.documentElement.appendChild(panel);
        const before = weaveroMousedowns();
        try {
            wv._attachOutsideClickDismiss(panel, doc, win, () => {});
            await wvT.sleep(100);
            assert.strictEqual(weaveroMousedowns(), before + 1, "attached");
            panel.style.display = "none";   // closed by its anchor / a link / Escape
            doc.documentElement.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
            assert.strictEqual(weaveroMousedowns(), before, "gone after the next mousedown");
        }
        finally { panel.remove(); }
    });

    it("a normal open still attaches, and its teardown removes it", async () => {
        const panel = doc.createElement("div");
        const before = weaveroMousedowns();
        const teardown = wv._attachOutsideClickDismiss(panel, doc, win, () => {});
        await wvT.sleep(100);
        assert.strictEqual(weaveroMousedowns(), before + 1, "attached after the tick");
        teardown();
        assert.strictEqual(weaveroMousedowns(), before, "removed");
    });
});
