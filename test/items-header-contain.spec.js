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
    let win, hdr, prevWidth, item;
    const HDR_SEL = "#item-tree-main-default .virtualized-table-header, #item-tree-main .virtualized-table-header";
    const header = () => win.document.querySelector(HDR_SEL);
    const tree = () => win.ZoteroPane.itemsView.tree;
    const cols = () => tree()._columns.getAsArray();
    const visible = () => cols().filter(c => !c.hidden).sort((a, b) => a.ordinal - b.ordinal);
    const tick = ms => new Promise(r => win.setTimeout(r, ms));

    before(async function () {
        if (!(Zotero.Weavero && Zotero.Weavero.plugin)) wvT.absent('!(Zotero.Weavero && Zotero.Weavero.plugin)');
        win = Zotero.getMainWindow();
        // A populated view: itemTree.jsx passes `hide: showMessage` to the
        // virtualized table (rendered `display: none` then), and the empty
        // view shows a message -- the header measures 0 x 0. In the full
        // suite this guard ran right after a spec that left the library
        // empty (every full run since 2026-10-05 read 0 px). One fixture
        // item keeps the measurement meaningful whatever ran before.
        const libID = Zotero.Libraries.userLibraryID;
        item = new Zotero.Item("journalArticle");
        item.libraryID = libID;
        item.setField("title", "WV-TEST header-contain fixture");
        await item.saveTx();
        try {
            await /** @type {any} */ (win.ZoteroPane.collectionsView).selectLibrary(libID);
            await win.ZoteroPane.itemsView.waitForLoad();
        } catch (e) {}
        await tick(150);
        hdr = win && header();
        if (!hdr) this.skip();
        prevWidth = hdr.style.width;
    });

    after(async () => {
        try { if (hdr) hdr.style.width = prevWidth; } catch (e) {}
        try { if (item) await item.eraseTx(); } catch (e) {}
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

    // Named diagnostics: this guard read 0 px in three full runs after the
    // hidden-collections spec opened and closed a second main window
    // (2026-10-05..07): the first window's document was "hidden" (occluded
    // on the desktop once the second window closed), and a hidden window
    // suspends the table's rendering. Say which window and what state.
    const diag = () => {
        try {
            const all = Zotero.getMainWindows();
            const r = hdr.getBoundingClientRect();
            const pane = win.document.getElementById("zotero-items-pane") || win.document.getElementById("zotero-items-pane-container");
            const pr = pane && pane.getBoundingClientRect();
            // The header's ancestors: which box is collapsed to 0.
            const chain = [];
            let el = hdr;
            for (let i = 0; el && i < 8; i++) {
                const cr = el.getBoundingClientRect();
                const cs = win.getComputedStyle(el);
                chain.push((el.localName || "?") + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "")
                    + " " + Math.round(cr.width) + "x" + Math.round(cr.height) + " " + cs.display + (el.hidden ? " hidden" : "") + (el.getAttribute && el.getAttribute("collapsed") ? " collapsed" : ""));
                el = el.parentElement;
            }
            return JSON.stringify({ wins: all.length, index: all.indexOf(win), closed: win.closed, vis: win.document.visibilityState,
                state: win.windowState, connected: hdr.isConnected, same: header() === hdr, headers: win.document.querySelectorAll(HDR_SEL).length,
                inner: [win.innerWidth, win.innerHeight], hdr: [r.width, r.height], pane: pr && [pr.width, pr.height],
                tab: win.Zotero_Tabs && win.Zotero_Tabs.selectedType, rows: win.ZoteroPane.itemsView && win.ZoteroPane.itemsView.rowCount, chain });
        } catch (e) { return String(e); }
    };

    it("its max-content width is its padding, not the sum of its columns", async function () {
        // A layout measurement needs a visible window. Bring it back --
        // bounded -- and when the desktop keeps it hidden (another app in
        // front; a process without foreground rights cannot raise itself),
        // skip and say so: a 0-px reading is not a result. CI (xvfb) never
        // occludes, so the guard measures there.
        for (let i = 0; i < 30 && win.document.visibilityState !== "visible"; i++) {
            try { if (win.windowState === win.STATE_MINIMIZED) win.restore(); } catch (e) {}
            try { win.focus(); } catch (e) {}
            await tick(100);
        }
        if (win.document.visibilityState !== "visible") {
            Zotero.debug("[Weavero][test] header max-content: window hidden, not measured " + diag());
            this.skip();
        }
        // And a loaded tree: an earlier spec's trailing collection change
        // can leave the items list mid-reload here.
        try { await win.ZoteroPane.itemsView.waitForLoad(); } catch (e) {}
        await tick(100);
        // The LIVE header: the tree re-renders its header on a column
        // reorder (the case above) and on the collection changes an earlier
        // spec's trailing async work can land here, so the element captured
        // in `before` may be detached by now (0-px rects on a visible window,
        // full run 2026-10-07).
        const h = header() || hdr;
        if (h !== hdr) { hdr = h; prevWidth = h.style.width; }
        // A fresh test profile shows Zotero's three default columns and none
        // of Weavero's opt-in ones, so the bar is "a real header", not a rich
        // one (the first run of this guard asserted >3 and failed at 3).
        const cells = [...h.querySelectorAll(":scope > .cell")];
        assert.isAtLeast(cells.length, 2, "a populated header");
        const sum = cells.reduce((t, c) => t + c.getBoundingClientRect().width, 0);
        assert.isAbove(sum, 100, "columns actually occupy width: " + sum + " " + diag());
        h.style.width = "max-content";
        void h.offsetWidth;
        const w = h.getBoundingClientRect().width;
        h.style.width = prevWidth;
        // Pre-fix this was the sum above (one label width per column plus the
        // fixed columns); contained, only padding remains.
        assert.isBelow(w, 40, "intrinsic width collapsed by containment: " + w);
        assert.isBelow(w, sum / 2, "intrinsic width is not the column sum " + sum);
    });
});
