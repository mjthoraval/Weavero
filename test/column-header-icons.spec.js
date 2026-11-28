/* global describe, it, before, assert, Zotero, wvT, atob */

// Every items-tree column Weavero registers with an `iconPath` shows its
// header icon in a colour, never in the SVG default, black -- invisible on
// the dark theme. An icon gets its colour one of two ways, and the check
// follows the icon:
//  - a CONTEXT-FILL icon (Zotero's universal icons, the links glyphs) takes
//    the header cell's `fill`. A registered column's header gets `.icon-bg`,
//    which Zotero gives no fill: without a rule of Weavero's own (the column
//    sheet in modules/constants.ts) the icon paints black. The Backlinks
//    column shipped that way in 0.22.3-dev.4..11 (MJT 2026-10-22, "Need a
//    dark mode icon"). This renders a header cell for each such column in the
//    main window, the way virtualized-table builds it, and compares its fill
//    with a cell no column rule names.
//  - a FIXED-COLOUR icon paints the colours its SVG declares, and a fill rule
//    would be inert on it: it must declare one that is not black. The In
//    Library column's header is the library icon in My Library's blue, as
//    Zotero's own library icon is in light and dark (collection-tree/16/
//    {light,dark}/library.svg, #4072E5). The spec used to hold every icon to
//    the context-fill rule and failed on that column on Zotero 10 and 11
//    (2026-11-24), though its header showed blue.

describe("Weavero — every Weavero column header icon has a colour of its own", function () {
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

    /** The icon's SVG text: a data: URI decoded, any other URL read; null when
     *  it cannot be read (the icon is then held to the context-fill rule). */
    const svgOf = (path) => {
        const p = String(path || "");
        try {
            const m = /^data:([^,]*),([\s\S]*)$/.exec(p);
            if (m) return /;base64$/i.test(m[1]) ? atob(m[2]) : decodeURIComponent(m[2]);
            return String(Zotero.File.getContentsFromURL(p) || "") || null;
        }
        catch (e) { return null; }
    };

    /** The colours an SVG paints with by itself: its fill / stroke attributes
     *  and declarations, less none, black, context-* and currentColor (black
     *  in an image: nothing sets the SVG's colour). */
    const ownColours = (svg) => {
        const out = [];
        const re = /\b(?:fill|stroke)\s*(?:=\s*["']|:\s*)([^"';>]+)/g;
        let m;
        while ((m = re.exec(svg))) {
            const v = m[1].trim().toLowerCase();
            if (!/^(none|transparent|black|#000|#000f|#000000|#000000ff|currentcolor|context-fill|context-stroke)$/.test(v)) out.push(v);
        }
        return out;
    };

    it("each icon column's header icon has a colour: a context-fill icon a fill rule, a fixed-colour icon a colour of its SVG", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns()
            .filter((c) => /weavero/.test(String(c.dataKey)) && c.iconPath);
        assert.isAtLeast(cols.length, 4, "Weavero's icon columns are registered (Annotations, Related, Backlinks, Links are on by default)");
        assert.isOk(cols.some((c) => /weaveroBacklinks$/.test(String(c.dataKey))), "the Backlinks column is among them");
        assert.isOk(cols.some((c) => /weaveroLinks$/.test(String(c.dataKey))), "the Links column is among them (slice 2, 2026-10-27)");
        assert.isOk(cols.some((c) => /weaveroInLibrary$/.test(String(c.dataKey))), "the feeds' In Library column is among them (feeds are on by default)");
        const unstyled = fillOf("weaveroNoSuchColumn");
        const bad = [], context = [], fixed = [];
        for (const c of cols) {
            const name = String(c.dataKey).replace(/^.*-/, "");
            const svg = svgOf(c.iconPath);
            if (svg === null || /context-(fill|stroke)/.test(svg)) {
                context.push(name);
                const f = fillOf(String(c.dataKey));
                if (f === unstyled) bad.push(name + " => no column rule, fill " + f + (svg === null ? " (icon unreadable)" : ""));
            }
            else {
                fixed.push(name);
                if (!ownColours(svg).length) bad.push(name + " => a fixed-colour icon that declares no colour but black");
            }
        }
        // Both branches exercised: the classification sends neither every icon
        // to the lenient side nor the In Library icon to the context-fill one.
        assert.includeMembers(context, ["weaveroBacklinks", "weaveroLinks"], "context-fill icons " + JSON.stringify(context) + ", fixed-colour " + JSON.stringify(fixed));
        assert.include(fixed, "weaveroInLibrary", "context-fill icons " + JSON.stringify(context) + ", fixed-colour " + JSON.stringify(fixed));
        assert.deepEqual(bad, [], "header icons that would paint black (unstyled fill " + unstyled + ")");
    });
});
