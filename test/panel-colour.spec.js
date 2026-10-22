/* global describe, it, before, assert, Zotero, wvT */

// The tab surfaces are ARROW panels -- Zotero's "List all tabs" and Weavero's
// tab-group preview / editor, window editor and rename panel. On Zotero 11
// (Firefox 153) they were painted with Firefox's arrowpanel colour (#42414D
// in dark, a bluish grey) instead of Zotero's panel colour, so they did not
// match Weavero's other popups (MJT 2026-10-19; upstream register #13 for
// the plain panels). They now paint the same material as the plain panels:
// --material-sidepane.

describe("Weavero — the tab surfaces' arrow panels use Zotero's panel colour", function () {
    this.timeout(30000);
    let win, doc, wv;

    // The material as a computed rgb() string, for comparison.
    const material = () => {
        const v = win.getComputedStyle(doc.documentElement).getPropertyValue("--material-sidepane").trim();
        const el = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        el.style.color = v;
        doc.documentElement.appendChild(el);
        const c = win.getComputedStyle(el).color;
        el.remove();
        return c;
    };
    const painted = async (panel) => {
        panel.openPopup(doc.getElementById("tab-bar-container"), "after_start", 0, 0, false, false);
        await wvT.waitFor(() => panel.state === "open", 5000);
        const part = panel.shadowRoot && panel.shadowRoot.querySelector("[part~='content']");
        const bg = part ? win.getComputedStyle(part).backgroundColor : null;
        panel.hidePopup();
        await wvT.waitFor(() => panel.state === "closed", 5000);
        return bg;
    };

    before(function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._wvTabGroupEnsurePanel !== "function") wvT.absent("_wvTabGroupEnsurePanel");
        win = Zotero.getMainWindow();
        doc = win.document;
    });

    it("List all tabs (Zotero's own) and a Weavero arrow panel paint --material-sidepane", async function () {
        const want = material();
        assert.ok(want && want !== "rgba(0, 0, 0, 0)", "the material resolves: " + want);
        const list = doc.getElementById("zotero-tabs-menu-panel");
        if (!list) wvT.absent("#zotero-tabs-menu-panel");
        assert.strictEqual(await painted(list), want, "List all tabs");
        const preview = wv._wvTabGroupEnsurePanel(win, "wv-tab-group-preview");
        assert.strictEqual(preview.getAttribute("type"), "arrow");
        assert.strictEqual(await painted(preview), want, "the tab-group preview");
    });
});
