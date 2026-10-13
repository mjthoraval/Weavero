/* global describe, it, before, after, assert, Zotero */

// A reader page's teardown (`_wvReaderPageTeardown`: destroy, a deck
// anchor's native close) ran `_wvReaderTeardownPanels` FIRST, and that ends
// with a generic pass removing every `wv-` class from the page; the
// class-targeted strips after it (`_stripReaderSidebar`, `.wv-btn`) then
// found nothing. Every reload left the old instance's sidebar "N Related"
// buttons in the annotation cards -- hidden, classless, still wired to the
// dead instance (dev profile 2026-10-13: three more per install, found by
// the live listener audit).

describe("Weavero — a reader page's teardown removes Weavero's own sidebar buttons", function () {
    this.timeout(60000);
    let wv, att, reader;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvReaderPageTeardown");
        att = await wvT.createTestPDFItem("wv-page-teardown");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader opened");
    });

    after(async () => {
        wvT.closeReaderTab(reader);
        await new Promise(r => setTimeout(r, 500));
        try { wvT.purgeDeadReaders(); } catch (e) {}
        await wvT.erase(att);
    });

    it("a sidebar button is removed, not left behind without its class", () => {
        const idoc = reader._iframeWindow.document;
        const host = idoc.getElementById("sidebarContainer") || idoc.body;
        const btn = idoc.createElement("button");
        btn.className = "wv-btn wv-btn-sidebar wv-btn-r";
        btn.setAttribute("data-spec-marker", "page-teardown");
        host.appendChild(btn);
        wv._wvReaderPageTeardown(reader);
        assert.isNull(idoc.querySelector("[data-spec-marker='page-teardown']"), "removed by the teardown");
    });
});
