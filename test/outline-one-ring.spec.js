/* global describe, it, before, assert, Zotero, InspectorUtils */

// One ring for the outline's keyboard cursor (MJT 2026-11-26, "Is it normal to
// have 2 blue square boxes?"). The cursor row draws Weavero's ring around its
// words (wv-outline-active), and the same row, focused from the keyboard, drew
// the browser's focus ring around the whole row (:focus-visible): two boxes for
// one place. The cursor's own ring is the one kept -- it stays where the cursor
// is when the focus leaves the outline; a focused row that is not the cursor
// keeps the focus ring. Checked on the real stylesheet.

describe("Weavero — the outline's cursor shows one ring", () => {
    let wv;
    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvEnsureReaderPanelStyles");
    });

    const withRows = (fn) => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        try {
            const d = host.contentDocument, iw = host.contentWindow;
            wv._wvEnsureReaderPanelStyles(d);
            const mk = (cls, text) => {
                const row = d.createElement("div");
                row.className = "wv-outline-row " + cls;
                row.setAttribute("tabindex", "-1");
                const lb = d.createElement("span");
                lb.className = "wv-outline-label";
                lb.textContent = text;
                row.appendChild(lb);
                d.body.appendChild(row);
                return row;
            };
            fn(iw, mk("wv-outline-active", "Cursor"), mk("", "Other"));
        }
        finally { host.remove(); }
    };
    const lock = (el, fn) => {
        InspectorUtils.addPseudoClassLock(el, ":focus-visible");
        try { fn(); }
        finally { InspectorUtils.removePseudoClassLock(el, ":focus-visible"); }
    };

    it("the cursor row focused from the keyboard: its words' ring only", () => {
        withRows((iw, cur) => {
            lock(cur, () => {
                assert.equal(iw.getComputedStyle(cur).outlineStyle, "none", "no focus ring around the row");
                assert.equal(iw.getComputedStyle(cur.firstChild).outlineStyle, "solid", "the cursor's ring around its words");
            });
        });
    });

    it("the cursor row's context-menu cue stays when it is focused from the keyboard", () => {
        withRows((iw, cur) => {
            cur.classList.add("wv-outline-ctx");
            lock(cur, () => {
                assert.equal(iw.getComputedStyle(cur).outlineStyle, "dashed", "the dashed cue of the row a menu is open for");
            });
        });
    });

    it("a focused row that is not the cursor keeps its focus ring", () => {
        withRows((iw, cur, other) => {
            lock(other, () => {
                assert.equal(iw.getComputedStyle(other).outlineStyle, "solid", "the focus ring");
                assert.equal(iw.getComputedStyle(other.firstChild).outlineStyle, "none", "no cursor ring on its words");
            });
        });
    });
});
