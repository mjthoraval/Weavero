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
    const HDR_SEL = "#item-tree-main-default .virtualized-table-header, #item-tree-main .virtualized-table-header";
    const header = () => win.document.querySelector(HDR_SEL);
    const tree = () => win.ZoteroPane.itemsView.tree;
    const cols = () => tree()._columns.getAsArray();
    const visible = () => cols().filter(c => !c.hidden).sort((a, b) => a.ordinal - b.ordinal);
    const tick = ms => new Promise(r => win.setTimeout(r, ms));

    before(function () {
        if (!(Zotero.Weavero && Zotero.Weavero.plugin)) this.skip();
        win = Zotero.getMainWindow();
        hdr = win && header();
        if (!hdr) this.skip();
        prevWidth = hdr.style.width;
    });

    after(() => {
        try { if (hdr) hdr.style.width = prevWidth; } catch (e) {}
    });

    it("the header is contained in the inline axis", () => {
        assert.equal(win.getComputedStyle(hdr).contain, "inline-size");
    });

    // The FIRST column's minimum is Zotero's 30 px PLUS the 36 px its text
    // sits behind (twisty slot + type icon, rendered in whichever column has
    // the lowest ordinal -- not a Title rule: with Creator moved first it is
    // Creator that shrank to its icon; MJT, 2026-09-16). The CSS floor and
    // the model minimum must agree (50 + COLUMN_PADDING 16 = 66): Zotero's
    // resizer clamps at the model value and never reads CSS, and a floor
    // without its model twin let a drag squeeze every other column
    // (real-drag trace, same day).
    it("the first column's minimum is Zotero's plus its icon area, in CSS and in the model", () => {
        const hf = hdr.firstElementChild;
        assert.isOk(hf && hf.classList.contains("cell"), "header first cell");
        assert.equal(win.getComputedStyle(hf).minWidth, "66px");
        const rf = win.document.querySelector(
            "#item-tree-main-default .row > .cell.first-column, #item-tree-main .row > .cell.first-column");
        if (rf) assert.equal(win.getComputedStyle(rf).minWidth, "66px", "rows agree with the header");
        const others = [...hdr.querySelectorAll(":scope > .cell")].filter(c => c !== hf
            && !c.classList.contains("fixed-width")
            && win.getComputedStyle(c).maxWidth === "none");
        for (const o of others) {
            assert.equal(win.getComputedStyle(o).minWidth, "30px", "other flexible columns untouched: " + o.className);
        }
        const first = visible()[0];
        assert.isOk(first, "a first visible column");
        assert.equal(first.minWidth, 50, "model minimum of the first column: 50 + 16 = the 66px floor");
        assert.equal(cols().filter(c => c._wvMinWidthPatched).length, 1, "exactly one column carries it");
    });

    // The floor must FOLLOW a reorder: the previous first column is released
    // (its absent minWidth deleted again, not set to undefined) and the new
    // one gets the pair. Driven through Zotero's own `Columns#setOrder`, the
    // tail of a header drag and of the "Move Column" menu.
    it("the minimum follows a reorder, there and back", async function () {
        const [a, b] = visible();
        if (!b) this.skip();
        const t = tree();
        t._columns.setOrder(cols().indexOf(b), a.ordinal);
        try {
            await tick(60);
            assert.equal(visible()[0].dataKey, b.dataKey, "the second column is now first");
            assert.equal(b.minWidth, 50, "the new first column got the model minimum");
            assert.isNotOk(a._wvMinWidthPatched, "the previous first column is released");
            assert.notEqual(a.minWidth, 50, "and no longer carries the minimum");
            assert.equal(win.getComputedStyle(header().firstElementChild).minWidth, "66px", "the CSS floor sits on the new first cell");
        }
        finally {
            t._columns.setOrder(cols().indexOf(a), visible()[0].ordinal);
            await tick(60);
        }
        assert.equal(visible()[0].dataKey, a.dataKey, "order restored");
        assert.equal(a.minWidth, 50, "the minimum came back with it");
        assert.isNotOk(b._wvMinWidthPatched, "and left the other column");
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
