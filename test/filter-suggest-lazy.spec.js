/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-11-22: his filter panel held 19,424 buttons -- the Tag search's
// suggestion list, 19,309 tags, built as hidden buttons at every panel open
// (2.3 s on a copy of his database) and rebuilt at EVERY filter click, since
// a click re-renders the whole panel. A long list is now built when it is
// shown (the search box takes focus); a short one as before. FAILS on
// 1.2.1-filtimg.1 (the hidden list holds every tag).
describe("Weavero — the filter panel builds a long suggestion list only when it is shown", function () {
    this.timeout(90000);
    let wv, win, doc, item;
    const N = 600;
    const inWin = (fn) => wv._wvWithFilterWin(win, fn);
    const popup = () => doc.getElementById("wv-filter-popup");
    const inner = () => { const p = popup(); return p && p.querySelector(".wv-filter-panel-inner"); };
    const box = () => inner() && inner().querySelector(".wv-filter-tag-list");
    const input = () => inner() && inner().querySelector(".wv-filter-search-input");
    const options = () => (box() ? box().querySelectorAll("button.wv-filter-opt").length : -1);
    async function openPopup() {
        try { const p = popup(); if (p && p.state === "open") p.hidePopup(); } catch (e) {}
        await wvT.sleep(100);
        inWin(() => wv._openFilterPanel());
        const p = await wvT.waitFor(() => { const x = popup(); return x && x.state === "open" && x.querySelector(".wv-filter-popup-headbar") ? x : null; }, 10000, 50);
        assert.ok(p, "the filter popup opened");
        await wvT.sleep(400);   // the tag values load (async), then render
        return p;
    }

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_openFilterPanel", "_wvWithFilterWin"]) wvT.method(m);
        win = /** @type {any} */ (Zotero.getMainWindow()); doc = win.document;
        await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        item = await wvT.createItem("book", { title: "WV-TEST lazy tags" });
        for (let i = 0; i < N; i++) item.addTag("wvlazy-" + String(i).padStart(4, "0"));
        await item.saveTx({ skipSelect: true });
        wv._cachedAnnotationTags = null;
        wv._unifiedSearchMode = "tag";
        inWin(() => { wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 }; });
    });

    after(async function () {
        try { const p = popup(); if (p) p.hidePopup(); } catch (e) {}
        try { inWin(() => wv._clearAllFilters()); } catch (e) {}
        try { await item.eraseTx(); } catch (e) {}
        wv._cachedAnnotationTags = null;
    });

    it("a hidden list of more than 500 tags holds no buttons; shown, it lists them all", async function () {
        await openPopup();
        assert.isOk(box(), "the Tag search's suggestion box");
        assert.strictEqual(box().style.display, "none", "hidden until the search box takes focus");
        assert.strictEqual(options(), 0, "no button built for a hidden list of " + N + "+ tags");
        input().dispatchEvent(new win.FocusEvent("focus"));
        assert.notStrictEqual(box().style.display, "none", "shown on focus");
        assert.isAtLeast(options(), N, "every tag listed once shown");
        assert.include(box().textContent, "wvlazy-0599");
    });

    it("a filter click re-renders the panel without building the hidden list", async function () {
        await openPopup();
        const pdf = inner().querySelector("button.wv-filter-opt-icon > span[data-item-type='attachmentPDF']");
        assert.isOk(pdf, "the PDF file-type button");
        pdf.parentElement.click();
        await wvT.sleep(400);
        assert.strictEqual(options(), 0, "the re-rendered hidden list holds no buttons");
        input().dispatchEvent(new win.FocusEvent("focus"));
        assert.isAtLeast(options(), N, "and builds them when shown");
    });
});
