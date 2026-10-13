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
        // Firefox's picker (tabs.css, verified 2026-10-07): circles; the
        // current colour ringed with a gap in the FOCUS colour -- the same
        // ring whatever the swatch, never the swatch's own colour.
        const sws = [...kids[0].querySelectorAll(".wv-tg-swatch")];
        assert.isAbove(sws.length, 3);
        // Firefox's order (tabgroup-menu.js COLORS) and nova's 20px discs
        // with Firefox-style tabs on, 16px otherwise.
        assert.deepEqual(sws.map(s => s.getAttribute("title")),
            ["blue", "purple", "cyan", "orange", "yellow", "pink", "green", "gray", "red"]);
        const want = wv._getSelectedTabRing() ? "20px" : "16px";
        assert.strictEqual(win.getComputedStyle(sws[0]).width, want, "disc size follows the Firefox-style pref");
        const current = () => sws.filter(s => s.classList.contains("wv-selected"));
        assert.strictEqual(current().length, 1, "exactly one swatch is marked current");
        const csSel = win.getComputedStyle(current()[0]);
        assert.match(csSel.borderRadius, /^(50%|8px)/, "a circle");
        assert.strictEqual(csSel.outlineStyle, "solid", "the current one carries the ring");
        assert.strictEqual(csSel.outlineOffset, "2px", "with a gap");
        const ringA = csSel.outlineColor;
        assert.notStrictEqual(ringA, csSel.backgroundColor, "the ring is not the swatch's colour");
        const csOther = win.getComputedStyle(sws.find(s => !s.classList.contains("wv-selected")));
        assert.strictEqual(csOther.outlineStyle, "none", "the others carry none");
        // Pick another colour: the ring moves, its colour does not.
        const other = sws.find(s => !s.classList.contains("wv-selected"));
        other.click();
        assert.strictEqual(current()[0], other, "the clicked swatch is current");
        const csB = win.getComputedStyle(other);
        assert.strictEqual(csB.outlineColor, ringA, "one ring colour for every swatch");
        assert.notStrictEqual(csB.outlineColor, csB.backgroundColor);
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

    it("the chip colours are Firefox's in both looks: nova tokens with Firefox-style tabs, the classic pair without", () => {
        // Own-prop stubs for the two inputs; deleted afterwards so the
        // prototype methods show through again.
        const stub = (ring, dark) => { wv._getSelectedTabRing = () => ring; wv._wvUiIsDark = () => dark; };
        try {
            stub(true, false);
            assert.strictEqual(wv._tabGroupColorHex("blue"), "#455fe7", "nova blue-50 (light)");
            assert.strictEqual(wv._tabGroupTextHex("blue"), "#ffffff");
            stub(true, true);
            assert.strictEqual(wv._tabGroupColorHex("blue"), "#7bb2ff", "nova blue-30 (dark)");
            assert.strictEqual(wv._tabGroupTextHex("blue"), "#111524", "nova blue-90 text (dark)");
            stub(false, false);
            assert.strictEqual(wv._tabGroupColorHex("blue"), "#0053cb", "classic blue-70 (light)");
            assert.strictEqual(wv._tabGroupTextHex("blue"), "#e2f7ff", "classic blue-0 text (light)");
            assert.strictEqual(wv._tabGroupColorHex("gray"), "#5e6a77", "classic gray is Firefox's hard-coded pair");
            stub(false, true);
            assert.strictEqual(wv._tabGroupColorHex("blue"), "#84c6ff", "classic blue-20 (dark)");
            assert.strictEqual(wv._tabGroupTextHex("blue"), "#0053cb", "classic blue-70 text (dark)");
            assert.strictEqual(wv._tabGroupColorHex("gray"), "#99a6b4");
            assert.strictEqual(wv._tabGroupColorHex("no-such-colour"), wv._tabGroupColorHex("blue"), "an unknown name shows as blue");
        }
        finally { delete wv._getSelectedTabRing; delete wv._wvUiIsDark; }
    });
});
