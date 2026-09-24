/* global describe, it, before, assert, Zotero */

// Scroll-spy in a PAGINATED EPUB (MJT 2026-09-24: "the grey marker is not
// following the scrolling in paginated mode"). The page never scrolls there
// and only the current chapter is mounted, so the spy compares positions in
// BOOK order: the view's first visible position (flow.startRange, as a CFI)
// against each entry's CFI. FAILS on the pre-fix code (no such picker).

describe("Weavero — outline scroll-spy in paginated EPUB", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("orders CFIs by book position", () => {
        const k = (c) => wv._wvEpubCfiKey(c);
        const cmp = (a, b) => Math.sign(wv._wvCfiKeyCmp(k(a), k(b)));
        assert.equal(cmp("epubcfi(/6/14!/4/2/1:0)", "epubcfi(/6/68!/4/2/1:0)"), -1, "earlier chapter first");
        assert.equal(cmp("epubcfi(/6/68!/4/2[pg]/2[H]/1:41)", "epubcfi(/6/68!/4/2/2,/1:0,/1:41)"), 1,
            "offset 41 after a range starting at 0; id assertions ignored");
        assert.equal(cmp("epubcfi(/6/68!/4/2/2,/1:0,/1:41)", "epubcfi(/6/68!/4/2/2/1:0)"), 0, "range = its start");
        assert.equal(cmp("epubcfi(/6/68!/4/10/1:5)", "epubcfi(/6/68!/4/2/1:500)"), 1, "step 10 after step 2");
        assert.isNull(k("not a cfi"));
    });

    // The contents entries of a real book carry only an href: skipping
    // them let an early hand-added entry hold the marker for the whole book.
    it("an href-only entry keys at its chapter", () => {
        const doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-href");
        // In a detached tree: an unmounted chapter's node has a parent but
        // is not connected to the rendered document.
        const holder = doc.createElement("section");
        const target = doc.createElement("div");
        holder.appendChild(target);
        const pvw = {
            _getHrefTarget: () => target,
            getCFI: () => "epubcfi(/6/12!/,/4:0,/4:1)",
        };
        assert.deepEqual(wv._wvEpubHrefKey(pvw, "ch4.xhtml#x"), [6, 12], "chapter-level key");
        assert.isBelow(wv._wvCfiKeyCmp([6, 12], wv._wvEpubCfiKey("epubcfi(/6/12!/4/2/1:0)")), 0,
            "sorts before any position inside that chapter");
    });

    // Re-filing in paginated mode appended entries at the END: the live-range
    // order needs every chapter mounted. EPUB targets now order by CFI.
    it("re-files an EPUB entry by book position, contents entries at chapter level", () => {
        const holder = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-ord").createElement("section");
        const chapterEl = holder.ownerDocument.createElement("h2");
        holder.appendChild(chapterEl);
        const pv = {
            toDisplayedRange: () => null,
            _getHrefTarget: () => chapterEl,
            getCFI: () => "epubcfi(/6/14!/,/4:0,/4:1)",   // unmounted chapter: spine step only
        };
        const entries = [
            { title: "Front", position: { type: "FragmentSelector", value: "epubcfi(/6/4!/4/2/1:0)" } },
            { title: "Chapter I", href: "ch1.xhtml#top" },                        // -> [6,14]
            { title: "Later", position: { type: "FragmentSelector", value: "epubcfi(/6/92!/4/2/1:0)" } },
        ];
        const pos = { type: "FragmentSelector", value: "epubcfi(/6/14!/4/6,/1:0,/1:30)" };
        assert.equal(wv._wvOutlineEpubCfiOrderIndex(entries, pos, pv), 2, "after Chapter I, before Later");
        assert.equal(wv._wvOutlineEpubCfiOrderIndex(entries, { type: "CssSelector", value: "#x" }, pv), -1,
            "a non-CFI target (snapshot) keeps the live-range path");
    });

    it("marks the last entry at or before the first visible position", () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-paged");
        const list = d.createElement("div");
        d.body.appendChild(list);
        const mk = (title, cfi) => {
            const row = /** @type {any} */ (d.createElement("div"));
            row.className = "wv-outline-row";
            row._wvOl = { entry: { id: title, title, position: { type: "FragmentSelector", value: cfi } } };
            list.appendChild(row);
            return row;
        };
        const ch1 = mk("Chapter 1", "epubcfi(/6/14!/4/2/1:0)");
        const ch4 = mk("Part IV", "epubcfi(/6/68!/4/2/2,/1:0,/1:41)");
        mk("Later", "epubcfi(/6/70!/4/2/1:0)");
        const pv = (cfi) => ({ flow: { startRange: {} }, getCFI: () => cfi });
        assert.strictEqual(wv._wvOutlineSpyPickEpubPaged(pv("epubcfi(/6/68!/4/2[pg]/2[H]/1:41)"), list), ch4,
            "on Part IV's first page: Part IV");
        assert.strictEqual(wv._wvOutlineSpyPickEpubPaged(pv("epubcfi(/6/40!/4/8/1:10)"), list), ch1,
            "between chapters: the last one passed");
        assert.strictEqual(wv._wvOutlineSpyPickEpubPaged(pv("epubcfi(/6/2!/4/2/1:0)"), list), ch1,
            "before the first entry: the first entry");
        // A cover image has no visible text: no startRange, so the current
        // chapter number stands in (it picked nothing before).
        const cover = { flow: { startRange: null, currentSectionIndex: 33 }, getCFI: () => "" };
        assert.strictEqual(wv._wvOutlineSpyPickEpubPaged(cover, list), ch4,
            "chapter 33 = spine step 68: Part IV");
    });
});
