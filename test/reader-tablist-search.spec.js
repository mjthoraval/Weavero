/* global describe, it, before, assert, Zotero */

// The reader window's tab list (the clone of the main tabs menu) has a
// "Search Tabs" box (survey 2026-10-06, smaller bugs). Since the list is
// built by the shared main-window code, nothing read the stored query: the
// box filtered nothing. The render now applies it after the shared filters.

describe("Weavero — reader window tab list: the search box filters rows", function () {
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWTRenderTabListPanel");
        wvT.method("_wvWTApplySearch");
    });

    it("the render applies the stored query after the shared filters", () => {
        const src = wvT.src("_wvWTRenderTabListPanel");
        const shared = src.indexOf("_wvApplyTabsMenuRowFilters(panel)");
        const search = src.indexOf("_wvWTApplySearch(list, ps.search)");
        assert.isAbove(search, -1, "the query is applied");
        assert.isAbove(search, shared, "after the file-type / library pass");
    });

    it("rows without the query are hidden, case-insensitively; an empty query hides nothing", () => {
        const doc = Zotero.getMainWindow().document;
        const mk = () => {
            const list = doc.createElement("div");
            for (const [attr, val, text] of [["data-tab-id", "zotero-pane", "My Library"],
                ["data-tab-id", "t1", "Alpha Paper"], ["data-wv-library", "1", "Beta Book"]]) {
                const row = doc.createElement("div");
                row.className = "row";
                row.setAttribute(attr, val);
                row.textContent = text;
                list.appendChild(row);
            }
            return list;
        };
        const hidden = (list) => [...list.children].filter(r => r.classList.contains("wv-tabs-menu-row-hidden")).map(r => r.textContent);
        const a = mk();
        wv._wvWTApplySearch(a, "aLPh");
        assert.deepEqual(hidden(a), ["My Library", "Beta Book"]);
        const b = mk();
        wv._wvWTApplySearch(b, "  ");
        assert.deepEqual(hidden(b), []);
    });
});
