/* global describe, it, before, assert, Zotero */

// The tabs list's window headers count TABS (survey 2026-10-06, smaller
// bugs): another window's header leaves out its Library tab (listed apart,
// uncounted), but the current window's header counted its Library row, so
// the same window read one higher from inside it than from another window.

describe("Weavero — tabs list: the current window's count leaves out the Library row", function () {
    let wv;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvTabsMenuWrapCurrentWindow");
    });

    it("Library + two document rows count as 2", () => {
        const doc = Zotero.getMainWindow().document;
        const panel = doc.createElement("div");
        const list = doc.createElement("div");
        list.id = "zotero-tabs-menu-list";
        for (const id of ["zotero-pane", "wv-spec-tab-a", "wv-spec-tab-b"]) {
            const row = doc.createElement("div");
            row.className = "row";
            row.dataset.tabId = id;
            list.appendChild(row);
        }
        panel.appendChild(list);
        wv._wvTabsMenuWrapCurrentWindow(panel);
        const hdr = list.querySelector(".wv-winscope-current .wv-curwin-header");
        assert.isOk(hdr, "the current-window header was built");
        assert.strictEqual(hdr.querySelector(".wv-tabs-menu-library-count").textContent, "2");
        assert.isNull(list.querySelector('.row[data-tab-id="zotero-pane"]').getAttribute("draggable"),
            "the Library row stays structural (not draggable)");
    });
});
