/* global describe, it, before, after, assert, Zotero */

// The items-list header must not size the centre pane (MJT 2026-09-11).
//
// The header is a nowrap flex row; its intrinsic width is the sum of its
// cells' label widths plus every fixed-width column, and Weavero adds three
// fixed columns (104 px). Zotero's items-pane container is `flex: 1 1 auto`,
// so once the header's intrinsic width exceeds the pane's share of the
// window, the pane follows the header: side panes squeezed below their
// splitter positions, column drags moving the centre pane, and a
// ResizeObserver / --scrollbar-width feedback loop that made boundary
// titles blink. Weavero contains the header in the inline axis so it
// contributes no intrinsic width. Measured pre-fix: header max-content
// 878 px with 15 columns; post-fix it is padding only.

describe("Weavero — items-list header contributes no intrinsic width", () => {
    let win, hdr, prevWidth;

    before(function () {
        if (!(Zotero.Weavero && Zotero.Weavero.plugin)) this.skip();
        win = Zotero.getMainWindow();
        hdr = win && win.document.querySelector(
            "#item-tree-main-default .virtualized-table-header, #item-tree-main .virtualized-table-header");
        if (!hdr) this.skip();
        prevWidth = hdr.style.width;
    });

    after(() => {
        try { if (hdr) hdr.style.width = prevWidth; } catch (e) {}
    });

    it("the header is contained in the inline axis", () => {
        assert.equal(win.getComputedStyle(hdr).contain, "inline-size");
    });

    it("its max-content width is its padding, not the sum of its columns", () => {
        // A fresh test profile shows Zotero's three default columns and none
        // of Weavero's opt-in ones, so the bar is "a real header", not a rich
        // one (the first run of this guard asserted >3 and failed at 3).
        const cells = [...hdr.querySelectorAll(":scope > .cell")];
        assert.isAtLeast(cells.length, 2, "a populated header");
        const sum = cells.reduce((t, c) => t + c.getBoundingClientRect().width, 0);
        assert.isAbove(sum, 100, "columns actually occupy width: " + sum);
        hdr.style.width = "max-content";
        void hdr.offsetWidth;
        const w = hdr.getBoundingClientRect().width;
        hdr.style.width = prevWidth;
        // Pre-fix this was the sum above (one label width per column plus the
        // fixed columns); contained, only padding remains.
        assert.isBelow(w, 40, "intrinsic width collapsed by containment: " + w);
        assert.isBelow(w, sum / 2, "intrinsic width is not the column sum " + sum);
    });
});
