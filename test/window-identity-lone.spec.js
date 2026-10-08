/* global describe, it, before, after, assert, Zotero */

// Window identity in a ONE-window session (MJT 2026-09-29): the anchor
// window never carries a colour -- the anchor mark with 2+ windows, nothing
// when alone -- like its taskbar icon, title glyph and badge. The Open-in /
// Move menus and the List-all-tabs header painted pool colour 0 (blue) on
// the lone window instead. The runner's Zotero has one main window.
// FAILS on the pre-fix code.

describe("Weavero — no identity colour on a lone (anchor) window", () => {
    let wv, win, doc;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvDecorateWindowTargetMenuitem !== "function") wvT.absent('!wv || typeof wv._wvDecorateWindowTargetMenuitem !== "function"');
        win = Zotero.getMainWindow(); doc = win.document;
        if (Zotero.getMainWindows().length !== 1) this.skip();   // needs the lone-window case
    });

    const menuitem = () => { const mi = doc.createXULElement("menuitem"); mi.setAttribute("label", "Window 1"); return mi; };

    it("Open-in / Move menus: no dot and no anchor mark on the lone window", () => {
        const mi = menuitem();
        wv._wvDecorateWindowTargetMenuitem(doc, mi, win, false);
        assert.isFalse(mi.classList.contains("wv-mvwin-main"), "no colour class");
        assert.isFalse(mi.classList.contains("wv-mvwin-anchor"), "no anchor mark either");
        assert.equal(mi.style.getPropertyValue("--wv-win-color"), "", "no colour");
    });

    it("with 2+ windows the anchor gets its mark, never a colour", () => {
        const orig = wv._wvAnchorDecorVisible;
        wv._wvAnchorDecorVisible = () => true;
        try {
            const mi = menuitem();
            wv._wvDecorateWindowTargetMenuitem(doc, mi, win, false);
            assert.isTrue(mi.classList.contains("wv-mvwin-anchor"));
            assert.isFalse(mi.classList.contains("wv-mvwin-main"));
        } finally { wv._wvAnchorDecorVisible = orig; }
    });

    it("a reader-kind target still gets its colour (a reader is never alone)", () => {
        const mi = menuitem();
        wv._wvDecorateWindowTargetMenuitem(doc, mi, win, true);
        assert.isTrue(mi.classList.contains("wv-mvwin-reader"));
        assert.notEqual(mi.style.getPropertyValue("--wv-win-color"), "");
    });

    it("List-all-tabs header: no colour dot on the lone window", () => {
        const h = wv._wvTabsMenuWindowHeader(doc, "Window 1", 1, "", "main", "", undefined, undefined, win);
        assert.isNull(h.querySelector(".wv-winhdr-color-dot"));
    });
});
