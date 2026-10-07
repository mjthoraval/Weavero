/* global describe, it, before, after, assert, Zotero */

// The chip's "Manage Tab Group" card follows Firefox's layout (MJT
// 2026-10-07, the Firefox 143 card side by side): colour swatches first,
// the name field right under them (placeholder, no label, no heading), the
// action rows next, and the status line (Active/Saved · N tabs · in Window)
// as a muted FOOTER -- information below the features.

describe("Weavero — tab-group editor: features first, information last", () => {
    let wv, win, g, panel;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win || typeof wv._wvShowTabGroupEditor !== "function") this.skip();
        g = wv._tabGroupCreate("WV spec group", "blue");
    });

    after(() => {
        try { if (panel) panel.hidePopup(); } catch (_) {}
        try { if (g) wv._tabGroupDelete(g.id); wv._wvTabGroupApplyEverywhere(); } catch (_) {}
    });

    it("swatches, then the name field, then the actions, then the status footer; no heading, no label", () => {
        const anchor = win.document.getElementById("zotero-tb-search") || win.document.documentElement;
        wv._wvShowTabGroupEditor(win, g.id, anchor);
        panel = win.document.getElementById("wv-tab-group-editor");
        assert.isOk(panel, "the editor panel exists");
        const body = panel.querySelector(".wv-tg-panel-body");
        const kids = [...body.children];
        const cls = (el) => String(el.className || "");
        assert.include(cls(kids[0]), "wv-tg-swatches", "colour swatches come first");
        assert.include(cls(kids[1]), "wv-tg-row", "the name field is right under the swatches");
        const input = kids[1].querySelector("input.wv-tg-name-input");
        assert.isOk(input);
        assert.strictEqual(input.value, "WV spec group");
        assert.isNotEmpty(input.getAttribute("placeholder"), "an example placeholder, Firefox-style");
        assert.isNull(body.querySelector(".wv-tg-title"), "no heading above the features");
        assert.isNull(body.querySelector(".wv-tg-label"), "no 'Name' label");
        const items = kids.filter(k => cls(k).includes("wv-tg-menuitem"));
        const labels = items.map(k => k.textContent.trim());
        assert.includeMembers(labels, ["Save and close group", "Ungroup tabs", "Delete group"]);
        assert.isAbove(kids.indexOf(items[0]), 1, "actions follow the name field");
        const footer = kids[kids.length - 1];
        assert.include(cls(footer), "wv-tg-info", "the status line is last");
        assert.include(cls(footer), "wv-tg-footer");
        assert.match(footer.textContent, /^Saved · 0 tabs/, "status, count (and window when active)");
        assert.isAbove(kids.indexOf(footer), kids.indexOf(items[items.length - 1]), "footer below the last action");
        assert.strictEqual(labels[labels.length - 1], "Delete group", "the destructive action stays last among the actions");
    });
});
