/* global describe, it, before, assert, Zotero */

// Expand All / Collapse All in the Outline tab's right-click menu (MJT
// 2026-09-29): the tab's double-click toggles every entry and `+` / `-` do
// it explicitly, neither discoverable. The menu now lists both rows with
// their shortcuts as dim hints; "Double-click, " prefixes the row the
// double-click would perform in the current state (any collapsed -> expand).
// The menu is an HTML overlay in a detached document: nothing pops up.

describe("Weavero — Outline tab menu: Expand All / Collapse All", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineShowTabMenu !== "function") wvT.absent('!wv || typeof wv._wvOutlineShowTabMenu !== "function"');
    });

    const open = (parentKeys, expanded) => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-outline-menu");
        const origAtt = wv._wvReaderAtt, origKeys = wv._wvOutlineParentKeys, origSet = wv._wvOutlineSetAllExpanded;
        const calls = [];
        wv._wvReaderAtt = () => ({ libraryID: 1, itemKey: "PDF1" });
        wv._wvOutlineParentKeys = () => ({ expandedSet: new Set(expanded), parentKeys: parentKeys.slice() });
        wv._wvOutlineSetAllExpanded = (reader, idoc, expand) => { calls.push(expand); };
        try {
            const reader = { _type: "pdf" };
            wv._wvOutlineShowTabMenu(reader, d, d.body);
            const rows = [...d.querySelectorAll(".wv-ctx-item")]
                .map(it => ({ el: /** @type {any} */ (it), name: it.children[1] && it.children[1].textContent, hint: (it.querySelector(".wv-ctx-hint") || {}).textContent || "" }));
            const heads = [...d.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent);
            const expand = rows.find(r => r.name === "Expand All"), collapse = rows.find(r => r.name === "Collapse All");
            return { heads, expand, collapse, calls, d };
        }
        finally {
            wv._wvReaderAtt = origAtt; wv._wvOutlineParentKeys = origKeys; wv._wvOutlineSetAllExpanded = origSet;
        }
    };

    it("both rows lead the menu; with something collapsed the double-click hint is on Expand All", () => {
        const m = open(["a", "b"], ["a"]);
        assert.strictEqual(m.heads[0], "Entries Tree", "the Entries Tree section comes first");
        assert.ok(m.expand && m.collapse, "both rows present");
        assert.strictEqual(m.expand.hint, "Double-click, +");
        assert.strictEqual(m.collapse.hint, "−");
        wv._wvCloseReaderBmContextMenu(m.d);
    });

    it("with everything expanded the double-click hint moves to Collapse All", () => {
        const m = open(["a", "b"], ["a", "b"]);
        assert.strictEqual(m.expand.hint, "+");
        assert.strictEqual(m.collapse.hint, "Double-click, −");
        wv._wvCloseReaderBmContextMenu(m.d);
    });

    it("a click on a row performs the action and closes the menu", () => {
        const m = open([], []);
        // The row's handler calls the plugin at click time: stub while clicking.
        const origSet = wv._wvOutlineSetAllExpanded;
        const calls = [];
        wv._wvOutlineSetAllExpanded = (reader, idoc, expand) => { calls.push(expand); };
        try {
            m.expand.el.click();
            assert.deepEqual(calls, [true], "Expand All -> expand");
            assert.isNull(m.d.querySelector(".wv-ctx-item"), "menu closed");
        }
        finally { wv._wvOutlineSetAllExpanded = origSet; }
    });
});
