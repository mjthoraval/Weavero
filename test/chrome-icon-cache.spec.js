/* global describe, it, before, assert, Zotero */

// `_wvChromeIconSvg` inlines a chrome:// icon's SVG into reader documents
// (which cannot load chrome:// images) and caches it. It cached FAILURES too
// (survey 2026-10-06, smaller bugs): one fetch made before a main window
// existed, or that errored, left that icon blank for the whole session.

describe("Weavero — chrome icon cache keeps successes only", function () {
    let wv;
    const SRC = "chrome://zotero/skin/16/universal/tag.svg";

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvChromeIconSvg");
    });

    it("a failed fetch is retried on the next call, a success is reused", async () => {
        if (wv._wvChromeIconCache) delete wv._wvChromeIconCache[SRC];
        // Fail the first fetch: no main window (the fetch host) at that moment.
        const orig = Zotero.getMainWindow;
        let first;
        Zotero.getMainWindow = () => null;
        try { first = wv._wvChromeIconSvg(SRC); }
        finally { Zotero.getMainWindow = orig; }
        assert.strictEqual(await first, "", "the failed fetch returns nothing");
        const second = await wv._wvChromeIconSvg(SRC);
        assert.include(second, "<svg", "the next call fetches again and gets the icon");
        assert.strictEqual(wv._wvChromeIconCache[SRC], second, "the success is cached");
    });
});
