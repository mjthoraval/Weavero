/* global describe, it, before, assert, Zotero, wvT */

// Every items-tree column Weavero registers with an `iconPath` draws its
// header icon from a context-fill SVG. A registered column's header gets
// `.icon-bg`, which Zotero gives no fill: without a rule of Weavero's own
// (the column sheet in modules/constants.ts) the icon paints in the SVG
// default, black -- invisible on the dark theme. The Backlinks column
// shipped that way in 0.22.3-dev.4..11 (MJT 2026-10-22, "Need a dark mode
// icon"). This renders a header cell for each Weavero column in the main
// window, the way virtualized-table builds it, and compares its fill with a
// cell no column rule names.

describe("Weavero — every Weavero column header icon has a fill of its own", function () {
    let win, doc;
    before(function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        win = Zotero.getMainWindow();
        doc = win.document;
    });

    const fillOf = (cellClass) => {
        const header = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        header.className = "virtualized-table-header";
        const cell = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        cell.setAttribute("class", "draggable cell " + cellClass);
        const icon = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        icon.className = "icon icon-bg";
        cell.appendChild(icon);
        header.appendChild(cell);
        doc.documentElement.appendChild(header);
        try { return win.getComputedStyle(icon).fill; }
        finally { header.remove(); }
    };

    it("each icon column's header icon computes a fill that differs from an unstyled cell's", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns()
            .filter((c) => /weavero/.test(String(c.dataKey)) && c.iconPath);
        assert.isAtLeast(cols.length, 4, "Weavero's icon columns are registered (Annotations, Related, Backlinks, Links are on by default)");
        assert.isOk(cols.some((c) => /weaveroBacklinks$/.test(String(c.dataKey))), "the Backlinks column is among them");
        assert.isOk(cols.some((c) => /weaveroLinks$/.test(String(c.dataKey))), "the Links column is among them (slice 2, 2026-10-27)");
        const unstyled = fillOf("weaveroNoSuchColumn");
        const bad = [];
        for (const c of cols) {
            const f = fillOf(String(c.dataKey));
            if (f === unstyled) bad.push(String(c.dataKey).replace(/^.*-/, "") + " => " + f);
        }
        assert.deepEqual(bad, [], "header icons left at the default fill (" + unstyled + ")");
    });
});
