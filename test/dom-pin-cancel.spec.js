/* global describe, it, before, after, assert, Zotero */

// The EPUB / snapshot pin drag (`_wvWireDomPinDrag`) and a CANCELLED pointer
// (survey 2026-10-06, smaller bugs). There was no pointercancel handler: the
// drag stayed armed after a cancel, the pin went on following the mouse, and
// the next release anywhere committed a move. A cancel now ends the drag
// where it started.

describe("Weavero — DOM pin drag: a cancelled pointer ends the drag", function () {
    let wv, win, doc, pin;
    let armed = 0;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWireDomPinDrag");
        win = Zotero.getMainWindow();
        doc = win.document;
        pin = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        pin.style.cssText = "position: fixed; left: 10px; top: 20px; width: 12px; height: 12px;";
        doc.documentElement.appendChild(pin);
        wv._wvWireDomPinDrag(win, doc, pin, 10, 20, null, { id: "wv-spec" }, () => {}, () => { armed++; });
    });

    after(() => { try { pin.remove(); } catch (_) {} });

    const fire = (target, type, x, y) => target.dispatchEvent(new win.PointerEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1,
        pointerId: 7, clientX: x, clientY: y,
    }));

    it("the pin returns to where the drag started and stops following the mouse", () => {
        fire(pin, "pointerdown", 100, 100);
        fire(doc.documentElement, "pointermove", 160, 140);
        assert.strictEqual(pin.style.left, "70px", "the drag moved the pin");
        fire(pin, "pointercancel", 160, 140);
        assert.strictEqual(pin.style.left, "10px", "back at the start");
        assert.strictEqual(pin.style.top, "20px");
        assert.isNotOk(pin._wvDragging, "no drag in progress");
        assert.strictEqual(armed, 1, "the pin's fade timer is re-armed");
        fire(doc.documentElement, "pointermove", 300, 300);
        assert.strictEqual(pin.style.left, "10px", "later mouse moves no longer drag it");
    });
});
