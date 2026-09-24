/* global describe, it, before, assert, Zotero */

// Outline context-menu target cue (MJT 2026-09-24). Right-click on an
// outline entry leaves the selection where it was, so nothing showed which
// entry the menu acts on. The row now carries wv-outline-ctx (the dashed
// outline the collections pane draws with wv-ctx-row) while the menu is
// open, and every close path clears it. FAILS on the pre-fix code (no
// class was ever set).

describe("Weavero — outline context-menu target cue", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const fixture = () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-outline-ctx");
        const mkRow = (title) => {
            const row = /** @type {any} */ (d.createElement("div"));
            row.className = "wv-outline-row";
            const lb = d.createElement("span");
            lb.className = "wv-outline-label";
            lb.textContent = title;
            row.appendChild(lb);
            row._wvOl = { entry: { id: title, title }, index: 0, curatedView: true };
            d.body.appendChild(row);
            return row;
        };
        return { d, a: mkRow("First"), b: mkRow("Second") };
    };
    const reader = { _internalReader: { _state: {} } };

    it("marks the right-clicked row (event target) and only it", () => {
        const { d, a, b } = fixture();
        const ev = { target: b.firstChild, clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} };
        wv._wvOutlineShowEntryMenu(reader, d, ev, b._wvOl.entry, 1, true);
        assert.isTrue(b.classList.contains("wv-outline-ctx"), "target row marked");
        assert.isFalse(a.classList.contains("wv-outline-ctx"), "other row untouched");
        wv._wvCloseReaderBmContextMenu(d);
        assert.isFalse(b.classList.contains("wv-outline-ctx"), "closing the menu clears the cue");
    });

    it("falls back to the entry's row when the event has no row target", () => {
        const { d, a } = fixture();
        wv._wvOutlineShowEntryMenu(reader, d, { clientX: 0, clientY: 0 }, a._wvOl.entry, 0, true);
        assert.isTrue(a.classList.contains("wv-outline-ctx"));
        wv._wvCloseReaderBmContextMenu(d);
    });

    // dev.7 shipped the cue and MJT saw nothing: a REAL right-click also
    // focuses the row, and the outline sheet's mouse-focus reset
    // (:focus:not(:focus-visible) -> outline:none) out-ranked the cue rule.
    // Scripted menus never focus the row, so only a focused row catches it.
    it("the cue survives mouse focus on the row (real stylesheet)", () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        try {
            const d = host.contentDocument;
            const iw = host.contentWindow;
            wv._wvEnsureReaderPanelStyles(d);
            const row = d.createElement("div");
            row.className = "wv-outline-row wv-outline-ctx";
            row.setAttribute("tabindex", "-1");
            row.textContent = "Entry";
            d.body.appendChild(row);
            assert.equal(iw.getComputedStyle(row).outlineStyle, "dashed", "unfocused");
            InspectorUtils.addPseudoClassLock(row, ":focus");
            try {
                assert.equal(iw.getComputedStyle(row).outlineStyle, "dashed",
                    "mouse-focused row keeps the dashed cue");
            }
            finally { InspectorUtils.removePseudoClassLock(row, ":focus"); }
        }
        finally { host.remove(); }
    });

    // A selected row that is also the scroll-spy's current section showed
    // the grey wash, not the selection tint (MJT 2026-09-24).
    it("a selected row keeps its selection tint when it is also current", () => {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:300px;height:200px;visibility:hidden;");
        win.document.documentElement.appendChild(host);
        try {
            const d = host.contentDocument;
            const iw = host.contentWindow;
            wv._wvEnsureReaderPanelStyles(d);
            const mk = (cls) => { const r = d.createElement("div"); r.className = cls; r.textContent = "x"; d.body.appendChild(r); return r; };
            const sel = mk("wv-outline-row wv-outline-selected");
            const both = mk("wv-outline-row wv-outline-selected wv-outline-current");
            const cur = mk("wv-outline-row wv-outline-current");
            const bg = (e) => iw.getComputedStyle(e).backgroundColor;
            assert.equal(bg(both), bg(sel), "selection tint wins");
            assert.notEqual(bg(both), bg(cur), "not the grey wash");
            assert.include(iw.getComputedStyle(both).boxShadow, "inset", "grey bar kept");
        }
        finally { host.remove(); }
    });

    it("a second menu moves the cue instead of stacking it", () => {
        const { d, a, b } = fixture();
        wv._wvOutlineShowEntryMenu(reader, d, { target: a }, a._wvOl.entry, 0, true);
        wv._wvOutlineShowEntryMenu(reader, d, { target: b }, b._wvOl.entry, 1, true);
        assert.isFalse(a.classList.contains("wv-outline-ctx"));
        assert.isTrue(b.classList.contains("wv-outline-ctx"));
        wv._wvCloseReaderBmContextMenu(d);
    });
});
