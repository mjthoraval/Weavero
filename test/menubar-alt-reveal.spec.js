/* global describe, it, before, assert, Zotero */

// The Alt-reveal of a compact menubar, one machine for the main, reader and
// note windows (src/lib/menubar.ts; survey 2026-10-06 §4, the three copies;
// 2026-10-21). Driven on a DETACHED host standing in for the window, so the
// synthetic keys never reach the runner window's real menubar machine nor
// Mozilla's own Alt handling: a detached subtree's event path ends at its
// root, and the machine's capture listeners on that root run at target phase.

describe("Weavero — Alt-reveal menubar: one machine for the three window types", () => {
    let wv, lib, win;
    const X = "http://www.w3.org/1999/xhtml";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        win = Zotero.getMainWindow();
        if (!wv || !lib || !win) wvT.absent("!wv || !lib");
        assert.isFunction(lib.wvAltReveal);
    });

    /** A detached host (the "window") holding the scratch menubar. */
    function rig(opts) {
        const host = /** @type {any} */ (win.document.createElementNS(X, "div"));
        const bar = /** @type {any} */ (win.document.createElementNS(X, "div"));
        bar.setAttribute("wv-compact-hidden", "true");
        host.appendChild(bar);
        const inner = /** @type {any} */ (win.document.createElementNS(X, "button"));
        bar.appendChild(inner);
        const h = lib.wvAltReveal(Object.assign({ win: host, menubar: bar, tag: "test" }, opts || {}));
        const key = (type, k, init) => host.dispatchEvent(new win.KeyboardEvent(type, Object.assign({ key: k, bubbles: true, cancelable: true }, init || {})));
        const press = (target) => (target || host).dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
        const altTap = (init) => { key("keydown", "Alt", init); key("keyup", "Alt", init); };
        const hidden = () => bar.getAttribute("wv-compact-hidden") === "true";
        return { host, bar, inner, h, key, press, altTap, hidden };
    }

    it("a bare Alt tap reveals at keyup; a second bare Alt collapses at keydown; Alt with a modifier, Alt+key, or a press while Alt is held is no toggle; an Alt auto-repeat is not a combo", () => {
        const r = rig();
        try {
            r.key("keydown", "Alt");
            assert.isTrue(r.hidden(), "nothing at keydown");
            r.key("keyup", "Alt");
            assert.isFalse(r.hidden(), "revealed at keyup");
            r.key("keydown", "Alt");
            assert.isTrue(r.hidden(), "the second Alt collapses on keydown");
            r.key("keyup", "Alt");
            assert.isTrue(r.hidden(), "and its keyup toggles nothing");
            r.altTap({ ctrlKey: true });
            assert.isTrue(r.hidden(), "Ctrl+Alt (AltGr) is no toggle");
            r.altTap({ shiftKey: true });
            assert.isTrue(r.hidden(), "Shift+Alt is no toggle");
            r.key("keydown", "Alt"); r.key("keydown", "f", { altKey: true }); r.key("keyup", "f", { altKey: true }); r.key("keyup", "Alt");
            assert.isTrue(r.hidden(), "Alt+F is no toggle");
            r.key("keydown", "Alt"); r.key("keydown", "Control", { ctrlKey: true, altKey: true }); r.key("keyup", "Control", { altKey: true }); r.key("keyup", "Alt");
            assert.isTrue(r.hidden(), "Alt then Ctrl is no toggle");
            r.key("keydown", "Alt"); r.key("keydown", "Alt", { repeat: true }); r.key("keyup", "Alt");
            assert.isFalse(r.hidden(), "an Alt auto-repeat does not void the toggle");
            r.bar.setAttribute("wv-compact-hidden", "true");
            r.key("keydown", "Alt"); r.press(); r.key("keyup", "Alt");
            assert.isTrue(r.hidden(), "a press while Alt is held voids the toggle");
        } finally { r.h.off(); }
    });

    it("Escape with no open menu collapses, a press outside collapses (inside the bar or a menupopup does not), a command inside collapses, blur only when asked, suppress makes Alt a non-event, off() unhooks everything", () => {
        let suppress = false;
        const r = rig({ suppress: () => suppress });
        try {
            r.altTap(); assert.isFalse(r.hidden());
            r.key("keydown", "Escape"); assert.isTrue(r.hidden(), "Escape collapses");
            r.altTap(); r.press(r.inner); assert.isFalse(r.hidden(), "a press inside the bar keeps it");
            const pop = /** @type {any} */ (win.document.createXULElement("menupopup"));
            r.host.appendChild(pop);
            r.press(pop); assert.isFalse(r.hidden(), "a press inside a menupopup keeps it");
            r.press(); assert.isTrue(r.hidden(), "a press outside collapses");
            r.altTap(); r.inner.dispatchEvent(new win.Event("command", { bubbles: true })); assert.isTrue(r.hidden(), "a command inside collapses");
            r.altTap(); r.host.dispatchEvent(new win.FocusEvent("blur")); assert.isFalse(r.hidden(), "blur is not wired by default");
            r.bar.setAttribute("wv-compact-hidden", "true");
            suppress = true; r.altTap(); assert.isTrue(r.hidden(), "suppressed: no reveal"); suppress = false;
            r.h.off(); r.altTap(); assert.isTrue(r.hidden(), "off: Alt does nothing");
        } finally { r.h.off(); }
        const r2 = rig({ blur: true, escape: false, outside: false, command: false });
        try {
            r2.altTap(); assert.isFalse(r2.hidden());
            r2.key("keydown", "Escape"); assert.isFalse(r2.hidden(), "escape:false");
            r2.press(); assert.isFalse(r2.hidden(), "outside:false");
            r2.inner.dispatchEvent(new win.Event("command", { bubbles: true })); assert.isFalse(r2.hidden(), "command:false");
            r2.host.dispatchEvent(new win.FocusEvent("blur")); assert.isTrue(r2.hidden(), "blur:true collapses");
            r2.altTap(); assert.isFalse(r2.hidden(), "a press that voided nothing: the machine was reset by the blur");
        } finally { r2.h.off(); }
    });

    it("the three window types wire the one machine and keep none of their own", () => {
        for (const m of ["_applyCompactTitleBar", "_applyReaderCompactMenubar", "_wvWireNoteMenubarAltReveal"]) {
            const s = String(wv[m]);
            assert.include(s, "wvAltReveal(", m + " uses the machine");
            assert.notInclude(s, "mAccessKeyDown", m + " keeps no machine of its own");
            assert.notInclude(s, 'e.key === "Alt"', m + " tests no Alt key itself");
        }
    });
});
