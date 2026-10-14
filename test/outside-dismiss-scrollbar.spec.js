/* global describe, it, before, assert, Zotero, Components, InspectorUtils */

// Issue #55: the comment popup closed when its own scrollbar was pressed.
// A real press on a scrollbar arrives with the scrollbar's native-anonymous
// XUL `thumb`/`slider`/`scrollbar` as `e.target` -- not retargeted to the
// scroller, and for a popup in the reader's iframe seen only in the main
// window's document -- and `contains()` is false for those nodes, so the
// click-outside dismissers took the press for an outside click (real
// presses on 11.0-beta.1, 2026-10-13). A SCRIPTED mousedown dispatched at
// the thumb is retargeted to the scroller and never showed the bug, so
// these specs hand the thumb to the check / the real handler directly.

describe("Weavero — a press on a popup's own scrollbar does not dismiss it (issue #55)", function () {
    this.timeout(15000);
    let wv, lib, win, doc, els, Cu;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("openCommentPopup");
        lib = wvT.lib();
        if (!lib || typeof lib.wvWithin !== "function") wvT.absent("lib.wvWithin");
        win = Zotero.getMainWindow();
        doc = win.document;
        els = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
        Cu = Components.utils;
    });

    /** The anonymous scrollbar thumb of a scrolling element. */
    const thumbOf = (scroller) => {
        const all = [];
        const walk = (n, depth) => {
            if (depth > 6) return;
            for (const c of InspectorUtils.getChildrenForNode(n, true, false)) {
                if (c.nodeType === 1) { all.push(c); walk(c, depth + 1); }
            }
        };
        walk(scroller, 0);
        return all.find(e => e.localName === "thumb") || null;
    };

    /** Capturing mousedown listeners on `doc` whose function is Weavero's. */
    const weaveroMousedowns = () => {
        const scope = Cu.getGlobalForObject(wv._wvWireTag);
        const out = [];
        for (const li of els.getListenerInfoFor(doc)) {
            if (li.type !== "mousedown" || !li.capturing) continue;
            let fn = null;
            try { fn = li.listenerObject; } catch (e) {}
            if (fn && Cu.getGlobalForObject(fn) === scope) out.push(fn);
        }
        return out;
    };

    it("wvWithin reaches a scroller from its scrollbar's anonymous thumb", () => {
        const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        box.style.cssText = "position: fixed; left: 0; top: 0; width: 120px; height: 60px; overflow: auto";
        box.textContent = "x ".repeat(600);
        doc.documentElement.appendChild(box);
        try {
            box.getBoundingClientRect();
            const thumb = thumbOf(box);
            assert.ok(thumb, "the scroller has an anonymous scrollbar thumb");
            assert.isTrue(lib.wvWithin(box, thumb), "thumb is within its scroller");
            assert.isTrue(lib.wvWithin(box, box.firstChild), "a child is within");
            assert.isTrue(lib.wvWithin(box, box), "the element itself is within");
            assert.isFalse(lib.wvWithin(box, doc.documentElement), "an ancestor is not");
            assert.isFalse(lib.wvWithin(box, null));
        }
        finally { box.remove(); }
    });

    it("the comment popup stays open on a press on its scrollbar, closes on an outside press", async () => {
        const before = new Set(weaveroMousedowns());
        const text = Array.from({ length: 60 }, (_, i) => "Line " + (i + 1)).join("\n");
        wv.openCommentPopup(text, { win });
        const panel = doc.getElementById("weavero-panel");
        try {
            assert.ok(panel, "popup created");
            assert.strictEqual(panel.style.display, "block", "popup open");
            // The dismisser attaches one tick later.
            const handler = await wvT.waitFor(() => weaveroMousedowns().find(fn => !before.has(fn)), 3000, 25);
            assert.ok(handler, "the click-outside dismisser is attached");
            const scroller = panel.querySelector(".wv-popup-container");
            assert.isAbove(scroller.scrollHeight, scroller.clientHeight, "the popup's content scrolls");
            const thumb = thumbOf(scroller);
            assert.ok(thumb, "the scroller has an anonymous scrollbar thumb");

            handler({ target: thumb });
            assert.strictEqual(panel.style.display, "block", "a press on the scrollbar keeps the popup open");

            handler({ target: doc.documentElement });
            assert.strictEqual(panel.style.display, "none", "an outside press still closes it");
        }
        finally {
            try { if (panel && panel.style.display !== "none") panel.hidePopup(); } catch (e) {}
        }
    });
});
