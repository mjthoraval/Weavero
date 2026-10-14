/* global describe, it, before, after, assert, Zotero */

// Issue #59: in the reader's in-PDF annotation popup (sidebar closed),
// Weavero's formatted comment preview stayed clamped to 3 lines and could
// not scroll -- the popup's two-class unclamp rule lost to the sidebar's
// three-class clamp. The preview must grow, then scroll, like the comment
// box it replaces (reader _view-popup.scss: `.annotation-popup .content
// { max-height: 10 * 16px + 8px; overflow-y: auto }`). Built on a real
// reader page carrying Weavero's own reader stylesheet.

describe("Weavero — the annotation popup's comment preview scrolls (#59)", function () {
    this.timeout(60000);
    let wv, att, reader, idoc, root;
    const LONG = "A long annotation comment line that wraps. ".repeat(80);

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_ensureReaderOuterStyles");
        att = await wvT.createTestPDFItem("wv-popup-preview");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "reader opened");
        idoc = reader._iframeWindow.document;
        wv._ensureReaderOuterStyles(idoc);
        assert.ok(idoc.getElementById("weavero-reader-outer-styles"), "Weavero's reader stylesheet is in the page");
        root = idoc.createElement("div");
        root.style.cssText = "position: fixed; left: 0; top: 0; width: 240px; z-index: 99999";
        idoc.body.appendChild(root);
    });

    after(async function () {
        try { if (root) root.remove(); } catch (e) {}
        wvT.closeReaderTab(reader);
        await wvT.erase(att);
    });

    /** `.comment.wv-comment-preview` holding a hidden editor and the preview,
     *  inside `wrapperClass` (the popup, or a sidebar row). */
    const build = (wrapperClass) => {
        const wrap = idoc.createElement("div");
        wrap.className = wrapperClass;
        const comment = idoc.createElement("div");
        comment.className = "comment wv-comment-preview";
        const content = idoc.createElement("div");
        content.className = "content";
        content.textContent = LONG;
        const preview = idoc.createElement("div");
        preview.className = "wv-md-preview";
        preview.textContent = LONG;
        comment.append(content, preview);
        wrap.appendChild(comment);
        root.replaceChildren(wrap);
        preview.getBoundingClientRect();
        return { comment, preview, cs: idoc.defaultView.getComputedStyle(preview) };
    };

    it("in the popup: unclamped, capped at Zotero's 168 px, scrollable", () => {
        const { preview, cs } = build("view-popup annotation-popup");
        assert.strictEqual(cs.webkitLineClamp, "none");
        assert.strictEqual(cs.overflowY, "auto");
        assert.strictEqual(cs.maxHeight, "168px");
        assert.isAtMost(preview.clientHeight, 168);
        assert.isAbove(preview.scrollHeight, preview.clientHeight, "the long comment scrolls");
    });

    it("in a sidebar row the 3-line clamp stays", () => {
        const { cs } = build("annotation");
        assert.strictEqual(cs.webkitLineClamp, "3");
        assert.strictEqual(cs.overflowY, "hidden");
    });

    it("editing in the popup still hides the preview", () => {
        const { comment, preview } = build("view-popup annotation-popup");
        comment.classList.add("wv-editing");
        assert.strictEqual(idoc.defaultView.getComputedStyle(preview).display, "none");
    });
});
