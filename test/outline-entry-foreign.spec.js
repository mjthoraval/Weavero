/* global describe, it, before, after, assert, Zotero, Components */

// Weavero's outline beside another plugin that takes the reader sidebar's
// Outline slot (Jasminum 1.1.48 at its defaults, measured 2026-11-24 in a
// throwaway Zotero 10.0.8, D:/tmp/coex/c-jas10): it hides Zotero's Outline button
// (`#viewOutline`, an inline `display: none`, its pref disableZoteroOutline),
// adds its own tabs to the sidebar's tab strip (`.sidebar-toolbar .start`) and
// its own panels under `#sidebarContent` (plus a toolbar in `#sidebarContainer`),
// and calls `setSidebarView("jasminum-outline")` on its tab. Two defects came of
// it: a Jasminum user had no way into Weavero's outline (its only entry was a
// click on #viewOutline), and a click on Jasminum's tab left Weavero's outline
// shown under Jasminum's (the takeover went off only for Zotero's other tabs).
// The foreign plugin is played here by hand, as Jasminum does it:
// - Zotero's Outline button hidden -> Weavero's own Outline button beside it;
// - a foreign tab hides Weavero's outline; Weavero's button hides the foreign
//   panel while its outline shows (never both);
// - Zotero's button back -> Weavero's goes; never un-hides #viewOutline.

describe("Weavero — the outline beside a plugin that hides Zotero's Outline button (Jasminum)", function () {
    this.timeout(120000);
    const Cu = Components.utils;
    let wv, att, reader, idoc;
    const foreign = [];

    const strip = () => idoc.querySelector("#sidebarContainer .sidebar-toolbar .start");
    const nat = () => idoc.getElementById("viewOutline");
    const entry = () => idoc.querySelector("#sidebarContainer .sidebar-toolbar .start .wv-outline-entry-tab");
    const container = () => idoc.getElementById("sidebarContainer");
    const shown = (el) => !!el && idoc.defaultView.getComputedStyle(el).display !== "none";
    const wvView = () => idoc.querySelector(".wv-outline-reader-view");
    const takeoverOn = () => !!(container() && container().classList.contains("wv-outline-tab-on"));
    const ir = () => reader._internalReader;

    /** A tab, a panel and a toolbar of another plugin, wired as Jasminum wires its own. */
    function addForeign() {
        const btn = idoc.createElement("button");
        btn.id = "wvtest-foreign-tab";
        btn.className = "toolbar-button";
        btn.setAttribute("role", "tab");
        btn.textContent = "F";
        strip().appendChild(btn);
        const tb = idoc.createElement("div");
        tb.id = "wvtest-foreign-toolbar";
        tb.textContent = "foreign toolbar";
        tb.style.display = "none";
        container().insertBefore(tb, idoc.getElementById("sidebarContent"));
        const panel = idoc.createElement("div");
        panel.id = "wvtest-foreign-panel";
        panel.textContent = "foreign outline";
        panel.style.display = "none";
        panel.style.height = "200px";
        idoc.getElementById("sidebarContent").appendChild(panel);
        btn.addEventListener("click", () => {
            ir().setSidebarView("wvtest-foreign");
            panel.style.display = "block";
            tb.style.display = "block";
            btn.classList.add("active");
        });
        foreign.push(btn, tb, panel);
        return { btn, tb, panel };
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvReaderActivateOutlineTakeover");
        att = await wvT.createTestPDFItem("wv-outline-entry");
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "a reader");
        try { ir().toggleSidebar(true); } catch (e) {}
        try { ir().setSidebarView("annotations"); } catch (e) {}
        idoc = reader._iframeWindow.document;
        assert.ok(await wvT.waitFor(() => strip() && nat() && wvView(), 20000), "the sidebar's tab strip, Zotero's Outline button and Weavero's panel");
    });

    after(async function () {
        for (const el of foreign) { try { el.remove(); } catch (e) {} }
        try { nat().style.display = ""; } catch (e) {}
        try { wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(att);
    });

    it("plain case: Zotero's Outline button is there, Weavero adds no button of its own", async function () {
        assert.isTrue(shown(nat()), "Zotero's Outline button shown");
        await wvT.sleep(300);
        assert.isNull(entry(), "no Weavero Outline button");
    });

    it("a click on another plugin's tab hides Weavero's outline: never both panels", async function () {
        nat().click();
        assert.ok(await wvT.waitFor(() => takeoverOn() && shown(wvView()), 5000), "Weavero's outline from Zotero's Outline button");
        const f = addForeign();
        f.btn.click();
        assert.ok(await wvT.waitFor(() => !takeoverOn(), 3000), "the takeover went off");
        assert.isFalse(shown(wvView()), "Weavero's outline hidden");
        assert.isTrue(shown(f.panel), "the other plugin's panel shown");
        for (const el of foreign) el.remove();
        foreign.length = 0;
        nat().click();
    });

    it("Zotero's Outline button hidden as Jasminum hides it: Weavero's own Outline button beside it, Zotero's icon, its own label", async function () {
        nat().style.display = "none";
        const b = await wvT.waitFor(() => entry(), 5000);
        assert.ok(b, "Weavero's Outline button appeared");
        assert.equal(nat().style.display, "none", "Zotero's button left hidden (the other plugin's choice)");
        assert.strictEqual(b.previousElementSibling, nat(), "right after where Zotero's button sits");
        assert.isTrue(shown(b), "shown");
        assert.isTrue(b.classList.contains("toolbar-button"), "a sidebar tab like the others");
        assert.equal(b.getAttribute("role"), "tab");
        const natSvg = nat().querySelector("svg"), mySvg = b.querySelector("svg");
        assert.ok(natSvg && mySvg, "an icon");
        assert.equal(mySvg.outerHTML, natSvg.outerHTML, "Zotero's own Outline icon");
        const tip = b.getAttribute("title");
        assert.include(tip, "Weavero", "its tooltip names Weavero: " + tip);
        assert.equal(b.getAttribute("aria-label"), tip);
    });

    it("its click shows Weavero's outline, selects the reader's Outline view and marks itself active", async function () {
        idoc.getElementById("viewAnnotations").click();
        assert.ok(await wvT.waitFor(() => !takeoverOn(), 3000), "start from the annotations");
        const b = entry();
        b.click();
        assert.ok(await wvT.waitFor(() => takeoverOn() && shown(wvView()), 5000), "Weavero's outline");
        assert.equal(Cu.waiveXrays(ir())._state.sidebarView, "outline", "the reader's Outline view");
        assert.ok(await wvT.waitFor(() => b.classList.contains("active"), 3000), "marked active");
        assert.equal(b.getAttribute("aria-selected"), "true");
        idoc.getElementById("viewAnnotations").click();
        assert.ok(await wvT.waitFor(() => !takeoverOn() && !b.classList.contains("active"), 3000), "another tab: off, not active");
        assert.equal(b.getAttribute("aria-selected"), "false");
    });

    it("with another plugin's tab and panel: its tab hides Weavero's outline, Weavero's button hides the other panel", async function () {
        const f = addForeign();
        entry().click();
        assert.ok(await wvT.waitFor(() => takeoverOn() && shown(wvView()), 5000), "Weavero's outline");
        f.btn.click();
        assert.ok(await wvT.waitFor(() => !takeoverOn(), 3000), "the other tab took the sidebar");
        assert.isFalse(shown(wvView()), "Weavero's outline hidden");
        assert.isTrue(shown(f.panel), "the other panel shown");
        assert.isFalse(entry().classList.contains("active"), "Weavero's button not active");
        entry().click();
        assert.ok(await wvT.waitFor(() => takeoverOn() && shown(wvView()), 5000), "Weavero's outline back");
        assert.isFalse(shown(f.panel), "the other plugin's panel not shown under it");
        assert.isFalse(shown(f.tb), "nor its toolbar");
        assert.isFalse(f.btn.classList.contains("active"), "the other tab no longer marked active");
        assert.isTrue(entry().classList.contains("active"), "Weavero's is");
    });

    it("right-click and double-click on Weavero's button act as on Zotero's", async function () {
        wvT.method("_wvOutlineShowTabMenu");
        wvT.method("_wvOutlineToggleAll");
        const b = entry();
        if (!takeoverOn()) { b.click(); await wvT.waitFor(() => takeoverOn(), 5000); }
        const calls = [];
        wv._wvOutlineShowTabMenu = function () { calls.push("menu"); };
        wv._wvOutlineToggleAll = function () { calls.push("toggle"); };
        try {
            const W = idoc.defaultView;
            b.dispatchEvent(new W.MouseEvent("auxclick", Cu.cloneInto({ bubbles: true, cancelable: true, button: 2 }, W)));
            b.dispatchEvent(new W.MouseEvent("dblclick", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, W)));
        }
        finally { delete wv._wvOutlineShowTabMenu; delete wv._wvOutlineToggleAll; }
        assert.deepEqual(calls, ["menu", "toggle"], "the tab menu, then expand/collapse all");
    });

    it("Zotero's Outline button shown again: Weavero's goes", async function () {
        for (const el of foreign) el.remove();
        foreign.length = 0;
        nat().style.display = "";
        assert.ok(await wvT.waitFor(() => !entry(), 5000), "Weavero's button removed");
        assert.isTrue(shown(nat()), "Zotero's button is the way in again");
    });

    // The same rule for Weavero's Bookmarks tab (live check with Jasminum
    // 1.1.48 on outline2.2, 2026-11-24: Weavero's Bookmarks pane and
    // #jasminum-outline both shown, and Jasminum's tab left both up -- Jasminum
    // hides its panels only on Zotero's three tabs).
    it("Weavero's Bookmarks tab beside another plugin's panel: never both, and the other tab closes the bookmarks pane", async function () {
        const bmTab = await wvT.waitFor(() => idoc.querySelector("#sidebarContainer .sidebar-toolbar .start .wv-bm-reader-tab"), 8000);
        assert.ok(bmTab, "Weavero's Bookmarks tab");
        const bmView = () => idoc.querySelector(".wv-bm-reader-view");
        const bmOn = () => !!(container() && container().classList.contains("wv-bm-tab-on"));
        const f = addForeign();
        try {
            f.btn.click();
            assert.isTrue(shown(f.panel), "the other plugin's panel shown");
            bmTab.click();
            assert.ok(await wvT.waitFor(() => bmOn() && shown(bmView()), 5000), "Weavero's bookmarks");
            assert.isFalse(shown(f.panel), "the other plugin's panel not shown under it");
            assert.isFalse(shown(f.tb), "nor its toolbar");
            assert.isFalse(f.btn.classList.contains("active"), "the other tab no longer marked active");
            assert.isTrue(bmTab.classList.contains("active"), "the Bookmarks tab is");
            f.btn.click();
            assert.ok(await wvT.waitFor(() => !bmOn(), 3000), "the other tab closed Weavero's bookmarks pane");
            assert.isFalse(shown(bmView()), "Weavero's bookmarks hidden");
            assert.isFalse(bmTab.classList.contains("active"), "the Bookmarks tab no longer active");
            assert.isTrue(shown(f.panel), "the other plugin's panel shown");
            assert.equal(Cu.waiveXrays(ir())._state.sidebarView, "wvtest-foreign", "the other plugin's view set last");
        }
        finally {
            for (const el of foreign) { try { el.remove(); } catch (e) {} }
            foreign.length = 0;
            try { idoc.getElementById("viewAnnotations").click(); } catch (e) {}
        }
    });
});
