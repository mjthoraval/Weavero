/* global describe, it, before, assert, Zotero */

// Preview link zones (2026-08-27): the reader's citation-preview popup is a
// BITMAP of the destination page, so Weavero overlays clickable zones where
// the page's Link annotations sit. The mapping from PDF space (origin
// bottom-left, viewBox offsets) to the on-screen <img> pixels is the part
// that silently breaks with an off-by-flip — locked here.

describe("Weavero — preview link-zone rect mapping", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvPreviewMapRect !== "function") this.skip();
    });

    // Viewport-space in, image CSS px out: subtract the trim origin, divide
    // by dpr, apply per-axis css ratios.
    it("subtracts the trim origin and divides by dpr", () => {
        const r = wv._wvPreviewMapRect([130, 260, 330, 300], 30, 60, 2, 1, 1);
        assert.equal(r.left, 50);
        assert.equal(r.top, 100);
        assert.equal(r.width, 100);
        assert.equal(r.height, 20);
    });

    it("applies per-axis css ratios after the dpr divide", () => {
        const r = wv._wvPreviewMapRect([0, 0, 200, 100], 0, 0, 1, 0.5, 2);
        assert.equal(r.width, 100);
        assert.equal(r.height, 200);
    });

    it("normalizes inverted rect corners", () => {
        const a = wv._wvPreviewMapRect([330, 300, 130, 260], 30, 60, 2, 1, 1);
        const b = wv._wvPreviewMapRect([130, 260, 330, 300], 30, 60, 2, 1, 1);
        assert.deepEqual(a, b);
    });
});
