/* global describe, it, before, after, assert, Zotero, Services */

// The Plugins Manager sidebar on Zotero 11 (pane.ts `_wvPMEnsureSidebar`,
// MJT 2026-10-12). Zotero 11 hides about:addons' whole sidebar and centres a
// shrink-to-fit content column (zotero/zotero 78d21617a; upstream-bugs #26):
// Recent Updates had no way back, and the cards were squeezed. Weavero shows
// the sidebar again the way Zotero 10 had it -- Plugins and Recent Updates
// (Available Updates only while updates are pending), no heading, no footer
// links -- and the content column fills the space beside it. On Zotero 10
// (Firefox 140's sidebar, no <moz-page-nav>) the page is left native; each
// test checks that instead of skipping. A real manager is opened: the
// sidebar is Firefox's own component.

describe("Weavero — Plugins Manager sidebar on Zotero 11", function () {
    this.timeout(60000);
    const LAST = "extensions.ui.lastCategory";
    let prevLast = "", win = null, doc = null;
    const sleep = (ms) => new Promise(r => Zotero.getMainWindow().setTimeout(r, ms));
    const page = () => {
        try {
            const b = win.document.querySelector("browser");
            const cd = b && b.contentDocument;
            return cd && String(cd.location.href).includes("aboutaddons") ? cd : null;
        } catch (e) { return null; }
    };
    const nav = () => doc.querySelector("categories-box moz-page-nav");
    const box = () => doc.querySelector("categories-box");
    /** The category buttons a user can see, by view name. */
    const shown = () => [...doc.querySelectorAll("categories-box moz-page-nav-button[view]")]
        .filter(b => !b.hidden && doc.defaultView.getComputedStyle(b).display !== "none")
        .map(b => b.getAttribute("view"));
    const clickCategory = (view) => {
        const b = doc.getElementById("category-" + view);
        const inner = b && b.shadowRoot && (b.shadowRoot.querySelector("button") || b.shadowRoot.querySelector("a"));
        (inner || b).click();
    };

    before(async function () {
        prevLast = Services.prefs.getStringPref(LAST, "");
        win = /** @type {any} */ (Zotero.openInViewer("chrome://mozapps/content/extensions/aboutaddons.html"));
        for (let i = 0; i < 150 && !(page() && page()._wvPMMo); i++) await sleep(100);
        doc = page();
        if (!doc || !doc._wvPMMo) wvT.absent("the Plugins Manager with Weavero's injection (_wvPMMo)");
        await sleep(800);
    });
    after(() => {
        try { if (win) win.close(); } catch (e) {}
        // Set, never clear: a cleared pref with no default can refuse
        // re-creation until restart (the cleared-pref trap).
        if (prevLast) { try { Services.prefs.setStringPref(LAST, prevLast); } catch (e) {} }
    });

    it("shows Plugins and Recent Updates, without the heading or the footer links", async () => {
        if (!nav()) {   // Zotero 10: native sidebar, nothing of Weavero's
            assert.isNull(doc.getElementById("wv-pm-sidebar-styles"));
            return;
        }
        const sidebar = doc.getElementById("sidebar");
        assert.notEqual(doc.defaultView.getComputedStyle(sidebar).display, "none", "#sidebar displayed");
        const views = shown();
        assert.includeMembers(views, ["extension", "recent-updates"]);
        assert.deepEqual(views.filter(v => !["extension", "recent-updates", "available-updates"].includes(v)), [], "no other category");
        const sr = nav().shadowRoot;
        const css = (sel) => { const e = sr.querySelector(sel); return e ? doc.defaultView.getComputedStyle(e).display : "absent"; };
        assert.equal(css(".page-nav-heading-wrapper"), "none", "no 'Add-ons' heading");
        assert.equal(css("#secondary-nav-group"), "none", "no footer links");
        // The label goes through Fluent: wait for it.
        const ext = doc.getElementById("category-extension");
        for (let i = 0; i < 30 && ext.textContent.trim() !== "Plugins"; i++) await sleep(100);
        assert.equal(ext.textContent.trim(), "Plugins", "Firefox's 'Extensions' relabelled");
    });

    // MJT 2026-10-12, "needs padding at the top": the first entry lines up with
    // the page heading, and the offset must not make the sidebar scroll (the
    // first try padded #sidebar, whose 100%-tall child then overflowed).
    it("the first entry lines up with the heading, and the sidebar does not scroll", () => {
        if (!nav()) return;
        const mid = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
        const h1 = doc.querySelector("addon-page-header h1");
        assert.isOk(h1, "the page heading");
        assert.closeTo(mid(doc.getElementById("category-extension")), mid(h1), 3, "Plugins centred on 'Manage Your Plugins'");
        const sb = doc.getElementById("sidebar");
        assert.isAtMost(sb.scrollHeight, sb.clientHeight, "no scrollbar in the sidebar");
    });

    it("the plugin column fills the space beside the sidebar", () => {
        const content = doc.getElementById("content");
        if (!nav()) { assert.isOk(content); return; }
        const sidebarW = doc.getElementById("sidebar").getBoundingClientRect().width;
        const w = content.getBoundingClientRect().width;
        assert.closeTo(w, doc.defaultView.innerWidth - sidebarW, 2,
            "#content " + w + "px in a " + doc.defaultView.innerWidth + "px page with a " + sidebarW + "px sidebar");
    });

    it("one click to Recent Updates and one back; Recent Updates stays listed", async () => {
        if (!nav()) return;
        clickCategory("recent-updates");
        for (let i = 0; i < 40 && box().currentViewId !== "addons://updates/recent"; i++) await sleep(100);
        assert.equal(box().currentViewId, "addons://updates/recent");
        clickCategory("extension");
        for (let i = 0; i < 40 && box().currentViewId !== "addons://list/extension"; i++) await sleep(100);
        assert.equal(box().currentViewId, "addons://list/extension");
        await sleep(300);
        assert.include(shown(), "recent-updates", "still listed on the Plugins view (Firefox 153 hides it there)");
    });
});
