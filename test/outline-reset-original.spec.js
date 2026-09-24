/* global describe, it, before, assert, Zotero */

// Reset to Original Name and Region on an EPUB moved a chapter title from
// page 240 to the table of contents on page viii (MJT 2026-09-24). Two
// faults: Reset re-detected the region by searching the name from the TOP
// of the book (first hit = the table of contents), and it ignored the
// exact original region the entry had stored. Both cases below FAIL on the
// pre-fix code.

describe("Weavero — Reset to Original restores the original region", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    it("the name search prefers the match at or after the entry, not the first in the book", () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-near");
        d.body.innerHTML = "<p id='toc'>A VOYAGE TO THE COUNTRY OF THE HOUYHNHNMS</p>"
            + "<p>filler text</p><h2 id='ch'>A VOYAGE TO THE COUNTRY OF THE HOUYHNHNMS</h2><p>more</p>";
        const pv = { _iframeDocument: d };
        const near = d.createRange();
        near.selectNodeContents(d.getElementById("ch"));
        const hit = wv._wvDomFindTextRange(pv, "A VOYAGE TO THE COUNTRY OF THE HOUYHNHNMS", near);
        assert.isOk(hit);
        assert.equal(hit.startContainer.parentNode.id, "ch", "the chapter heading, not the table of contents");
        const plain = wv._wvDomFindTextRange(pv, "A VOYAGE TO THE COUNTRY OF THE HOUYHNHNMS");
        assert.equal(plain.startContainer.parentNode.id, "toc", "without a reference: first match (unchanged)");
    });

    it("an exact original is restored; a PDF page-top point is not exact", () => {
        const epub = { _type: "epub" }, pdf = { _type: "pdf" };
        const sel = { type: "FragmentSelector", value: "epubcfi(/6/68!/4/2/2,/1:0,/1:41)" };
        assert.deepEqual(wv._wvOutlineExactOriginal(epub, { source: { origin: "user", position: sel } }), sel,
            "a selection-made EPUB entry keeps its region");
        const pin = { type: "FragmentSelector", value: "epubcfi(/6/10!/4/6/1:48)", anchor: "point" };
        assert.deepEqual(wv._wvOutlineExactOriginal(epub, { source: { origin: "user", position: pin } }), pin);
        assert.isNull(wv._wvOutlineExactOriginal(epub, { source: { origin: "user", position: null }, position: sel }),
            "a user entry without a stored original falls back to the name");
        assert.deepEqual(wv._wvOutlineExactOriginal(epub, { source: { origin: "embedded", position: null }, position: sel }), sel,
            "an imported EPUB entry's anchor is its original");
        const box = { pageIndex: 3, rects: [[50, 600, 300, 620]] };
        assert.deepEqual(wv._wvOutlineExactOriginal(pdf, { source: { origin: "user", position: box } }), box);
        const pageTop = { pageIndex: 3, rects: [[0, 792, 0, 792]] };
        assert.isNull(wv._wvOutlineExactOriginal(pdf, { source: { origin: "embedded", position: pageTop } }),
            "a PDF outline's page-top point is found again from the name");
    });
});
