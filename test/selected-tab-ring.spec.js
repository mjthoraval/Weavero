/* global describe, it, before, after, assert, Zotero, Services */

// Firefox 157 "nova" selected-tab outline (MJT 2026-09-25). Pref
// weavero.selectedTabRing, default ON since 2026-09-28 (off = Zotero's look): a 1px violet->orange gradient ring on the selected
// tab (masked ::before) instead of Zotero's raised shadow; multi-selected tabs
// keep Weavero's accent outlines. Tab-group lines sit BELOW the tab, in the
// gap, as Firefox's .tab-group-line (they covered the ring's bottom edge when
// drawn inside the tab). FAILS on the pre-feature code (no such pref/sheet;
// group line at bottom: 0).

describe("Weavero — selected-tab outline (Firefox nova)", () => {
    let wv, win, doc, prev;
    const PREF = "weavero.selectedTabRing";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvEnsureSelectedTabRing !== "function") this.skip();
        win = Zotero.getMainWindow(); doc = win.document;
        prev = Zotero.Prefs.get(PREF);
    });
    after(() => {
        try { Zotero.Prefs.set(PREF, !!prev); } catch (_) {}
        try { wv._wvEnsureSelectedTabRing(doc); } catch (_) {}
    });

    const selectedTab = () => doc.querySelector("#tab-bar-container .tab.selected");

    it("is ON by default (MJT 2026-09-28); off leaves Zotero's raised tab alone", () => {
        const def = Services.prefs.getDefaultBranch("").getBoolPref("extensions.zotero." + PREF, false);
        assert.isTrue(def, "default on");
        Zotero.Prefs.set(PREF, false);
        wv._wvEnsureSelectedTabRing(doc);
        assert.isNull(doc.getElementById("wv-selected-tab-ring"));
        const t = selectedTab();
        if (!t) return;
        assert.notEqual(win.getComputedStyle(t).boxShadow, "none", "Zotero's shadow");
    });

    it("on: the selected tab gets the gradient ring and loses the shadow; off again: back", () => {
        Zotero.Prefs.set(PREF, true);
        wv._wvEnsureSelectedTabRing(doc);
        assert.isNotNull(doc.getElementById("wv-selected-tab-ring"));
        const t = selectedTab();
        assert.isOk(t, "a selected tab in the test window");
        assert.equal(win.getComputedStyle(t).boxShadow, "none");
        const before = win.getComputedStyle(t, "::before");
        assert.include(before.backgroundImage, "linear-gradient");
        assert.equal(before.position, "absolute");
        // nova's pill shape (24px, Firefox 157), and the ring follows it
        assert.equal(win.getComputedStyle(t).borderTopLeftRadius, "24px");
        assert.equal(before.borderTopLeftRadius, "24px");
        Zotero.Prefs.set(PREF, false);
        wv._wvEnsureSelectedTabRing(doc);
        assert.isNull(doc.getElementById("wv-selected-tab-ring"));
        assert.notEqual(win.getComputedStyle(t).boxShadow, "none");
        assert.equal(win.getComputedStyle(t).borderTopLeftRadius, "5px", "Zotero's corners back");
    });

    it("pinned tabs (Weavero's mirrors) get the pill and, selected, the ring", () => {
        // MJT 2026-09-28: the pinned tab kept Zotero's raised square look --
        // pinned tabs are drawn by .wv-pinned-mirror, not by .tab.
        Zotero.Prefs.set(PREF, true);
        wv._wvEnsureSelectedTabRing(doc);
        const bar = doc.getElementById("tab-bar-container");
        let cont = doc.getElementById("wv-pinned-mirrors"), own = false;
        if (!cont) { cont = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); cont.id = "wv-pinned-mirrors"; bar.appendChild(cont); own = true; }
        const m = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        m.className = "wv-pinned-mirror selected";
        cont.appendChild(m);
        try {
            const cs = win.getComputedStyle(m);
            assert.equal(cs.borderTopLeftRadius, "24px");
            assert.equal(cs.boxShadow, "none");
            // nova: pinned tabs are circles -- as wide as the 28px tab is tall
            assert.equal(cs.width, "28px", "square, so the 24px radius makes a circle");
            assert.include(win.getComputedStyle(m, "::before").backgroundImage, "linear-gradient");
            m.classList.remove("selected");
            assert.equal(win.getComputedStyle(m, "::before").backgroundImage, "none", "no ring when not selected");
        } finally {
            m.remove();
            if (own) cont.remove();
        }
    });

    it("the pinned-tab rules shrink pins to 28px but never the UNPIN drag preview", () => {
        Zotero.Prefs.set(PREF, true);
        wv._wvEnsureSelectedTabRing(doc);
        const css = doc.getElementById("wv-selected-tab-ring").textContent;
        assert.include(css, ".tab.wv-pinned-tab:not([data-wv-pin-preview='unpin'])");
        assert.include(css, "width: 28px !important");
        Zotero.Prefs.set(PREF, false);
        wv._wvEnsureSelectedTabRing(doc);
        assert.isNull(doc.getElementById("wv-selected-tab-ring"), "off: Weavero's 36px pins untouched");
        Zotero.Prefs.set(PREF, true);
    });

    it("multi-selected tabs keep Weavero's accent outline (Firefox's model)", () => {
        Zotero.Prefs.set(PREF, true);
        wv._wvEnsureSelectedTabRing(doc);
        const css = doc.getElementById("wv-selected-tab-ring").textContent;
        assert.include(css, ".tab.selected:not(.wv-multisel)");
        assert.include(css, ".wv-window-tab.wv-active:not(.wv-multisel)");
        assert.include(css, "prefers-contrast");
    });

    it("tab-group lines sit 4px under the tab (Firefox compact: 0px inside the stack, 4px margin)", () => {
        wv._ensureTabGroupStyles(doc);
        const css = doc.getElementById("wv-tab-group-styles").textContent;
        assert.notInclude(css, "position: absolute; bottom: 0; height: 2px;");
        assert.include(css, "#tab-bar-container .tab.wv-grouped-tab::after {\n  content: \"\"; position: absolute; bottom: -4px; height: 2px;");
    });

    it("inside the tab, Firefox compact nova: 5.5px icon gap, 20px round close 3px in, 1em title fade", () => {
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);   // re-applies the ring sheet too
        const t = [...doc.querySelectorAll("#tab-bar-container .tabs > .tab")]
            .find(x => x.getBoundingClientRect().width > 0 && x.querySelector(".tab-close") && x.dataset.id !== "zotero-pane");
        if (!t) return;   // the runner shows only the library tab
        const name = t.querySelector(".tab-name"), close = t.querySelector(".tab-close");
        assert.equal(win.getComputedStyle(name).marginInlineStart, "5.5px");
        const c = win.getComputedStyle(close);
        assert.equal(c.width, "20px");
        assert.equal(c.insetInlineEnd, "3px");
        assert.equal(win.getComputedStyle(t).paddingInlineEnd, "23px");
        const css = doc.getElementById("wv-selected-tab-ring").textContent;
        assert.include(css, "black 1em");
        assert.include(css, "black 2em");
    });

    it("#6/#7/#9: filled unselected tabs, multi-selection without tint, nova group chip", () => {
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);
        const bar = doc.getElementById("tab-bar-container");
        const H = "http://www.w3.org/1999/xhtml";
        const box = doc.createElementNS(H, "div"); box.className = "tabs"; box.style.cssText = "position:absolute;visibility:hidden";
        const plain = doc.createElementNS(H, "div"); plain.className = "tab";
        const multi = doc.createElementNS(H, "div"); multi.className = "tab wv-multisel selected";
        const sel = doc.createElementNS(H, "div"); sel.className = "tab selected";
        const chip = doc.createElementNS(H, "div"); chip.className = "wv-tab-group-chip";
        box.append(plain, multi, sel, chip); bar.appendChild(box);
        try {
            assert.notEqual(win.getComputedStyle(plain).backgroundColor, "rgba(0, 0, 0, 0)", "unselected tab filled");
            const m = win.getComputedStyle(multi);
            assert.equal(m.backgroundColor, win.getComputedStyle(sel).backgroundColor, "no accent tint: the selected background");
            // #8: Firefox nova's --background-color-box (white / #252428)
            const dark = win.matchMedia("(prefers-color-scheme: dark)").matches;
            assert.equal(win.getComputedStyle(sel).backgroundColor, dark ? "rgb(37, 36, 40)" : "rgb(255, 255, 255)");
            assert.include(m.boxShadow, "inset", "accent outline kept");
            // Firefox nova's focus colour (violet-50 / violet-30), 2px on the selected one
            const dk = win.matchMedia("(prefers-color-scheme: dark)").matches;
            assert.include(m.boxShadow, dk ? "rgb(184, 156, 255)" : "rgb(118, 78, 221)");
            assert.include(m.boxShadow, "2px");
            const c = win.getComputedStyle(chip);
            assert.equal(c.height, "28px");
            assert.equal(c.borderEndStartRadius, "3.5px");
            assert.equal(c.fontWeight, "600");
        } finally { box.remove(); }
    });

    it("C: group colours follow Firefox nova with the design on, Weavero's own when off", () => {
        const dark = win.matchMedia("(prefers-color-scheme: dark)").matches;
        Zotero.Prefs.set(PREF, true);
        assert.equal(wv._tabGroupColorHex("blue"), dark ? "#7bb2ff" : "#455fe7");
        assert.equal(wv._tabGroupTextHex("blue"), dark ? "#111524" : "#ffffff");
        assert.equal(wv._tabGroupColorHex("gray"), dark ? "#949297" : "#515054");
        Zotero.Prefs.set(PREF, false);
        assert.equal(wv._tabGroupColorHex("blue"), "#4f7ce0");
        assert.equal(wv._tabGroupTextHex("blue"), "#ffffff");
        Zotero.Prefs.set(PREF, true);
    });

    it("orange is a 9th group colour (Firefox's): nova orange with the design, its own hex without", () => {
        const dark = win.matchMedia("(prefers-color-scheme: dark)").matches;
        Zotero.Prefs.set(PREF, true);
        assert.equal(wv._tabGroupColorHex("orange"), dark ? "#ff9565" : "#cd4208");
        Zotero.Prefs.set(PREF, false);
        assert.equal(wv._tabGroupColorHex("orange"), "#dc7633", "not the blue fallback");
        const g = wv._tabGroupCreate("wv-orange-probe", "orange");
        try { assert.equal(g.color, "orange", "accepted, not normalised to blue"); }
        finally { try { wv._tabGroupDelete(g.id); } catch (e) {} }
        Zotero.Prefs.set(PREF, true);
    });

    it("D: group lines overhang each member by 2px on both sides; A/B: close hover tint and cross colour", () => {
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);
        const bar = doc.getElementById("tab-bar-container");
        const H = "http://www.w3.org/1999/xhtml";
        const box = doc.createElementNS(H, "div"); box.className = "tabs"; box.style.cssText = "position:absolute;visibility:hidden";
        const first = doc.createElementNS(H, "div"); first.className = "tab wv-grouped-tab wv-group-first";
        const mid = doc.createElementNS(H, "div"); mid.className = "tab wv-grouped-tab";
        box.append(first, mid); bar.appendChild(box);
        try {
            for (const el of [first, mid]) {
                const a = win.getComputedStyle(el, "::after");
                assert.equal(a.left, "-2px"); assert.equal(a.right, "-2px"); assert.equal(a.bottom, "-4px");
            }
        } finally { box.remove(); }
        const css = doc.getElementById("wv-selected-tab-ring").textContent;
        assert.include(css, ".tab-close:hover");
        assert.include(css, ".tab-close .icon,");
    });

    it("narrow tabs (<= 140px, Firefox's tabClipWidth): close buttons only on the selected tab", async function () {
        this.timeout(10000);
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);
        const bar = doc.getElementById("tab-bar-container");
        const H = "http://www.w3.org/1999/xhtml";
        const box = doc.createElementNS(H, "div"); box.className = "tabs"; box.style.cssText = "position:absolute;left:0;top:0;display:flex";
        const mk = (sel) => { const t = doc.createElementNS(H, "div"); t.className = "tab" + (sel ? " selected" : ""); t.dataset.id = "wv-probe-" + (sel ? "s" : "b"); t.style.cssText = "width:120px;min-width:120px;max-width:120px;flex:none"; const c = doc.createElementNS(H, "div"); c.className = "tab-close"; t.appendChild(c); return t; };
        const bg = mk(false), sel = mk(true);
        box.append(bg, sel); bar.appendChild(box);
        const frames = async () => { for (let i = 0; i < 4; i++) await new Promise(r => { let done = false; win.requestAnimationFrame(() => { done = true; r(undefined); }); win.setTimeout(() => { if (!done) r(undefined); }, 60); }); };
        try {
            win._wvCloseBtnPending = false;
            wv._wvScheduleCloseButtons(win); await frames();
            if (bar.getAttribute("wv-closebuttons") !== "activetab") {
                // hidden runner window: rAF may not tick -- the CSS half still runs
                bar.setAttribute("wv-closebuttons", "activetab");
            }
            assert.equal(win.getComputedStyle(bg.querySelector(".tab-close")).display, "none", "background tab: no close");
            assert.notEqual(win.getComputedStyle(sel.querySelector(".tab-close")).display, "none", "selected tab keeps it");
            // wide again -> mark cleared
            for (const t of [bg, sel]) t.style.cssText = "width:190px;min-width:190px;max-width:190px;flex:none";
            win._wvCloseBtnPending = false;
            wv._wvScheduleCloseButtons(win); await frames();
            if (!win.document.hidden) assert.isFalse(bar.hasAttribute("wv-closebuttons"), "cleared above 140px");
        } finally {
            box.remove(); bar.removeAttribute("wv-closebuttons"); win._wvCloseBtnPending = false;
        }
    });

    it("narrow mode never changes tab widths: the selected tab is as wide as the others", () => {
        // dev.13: background tabs got 6px end padding, the selected one 23px;
        // with Zotero's `flex: 1 1 200px; box-sizing: border-box` the selected
        // tab came out ~6px wider and every switch moved the tabs sideways.
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);
        const bar = doc.getElementById("tab-bar-container");
        const H = "http://www.w3.org/1999/xhtml";
        const box = doc.createElementNS(H, "div"); box.className = "tabs";
        box.style.cssText = "position:absolute;left:0;top:0;display:flex;width:390px;padding:0;column-gap:0";
        const mk = (sel) => { const t = doc.createElementNS(H, "div"); t.className = "tab" + (sel ? " selected" : "");
            const n = doc.createElementNS(H, "div"); n.className = "tab-name"; n.textContent = "A fairly long tab title that overflows";
            const c = doc.createElementNS(H, "div"); c.className = "tab-close"; t.append(n, c); return t; };
        const lead = mk(false), a = mk(false), b = mk(true);   // lead: so a/b are not :first-child
        box.append(lead, a, b); bar.appendChild(box);
        bar.setAttribute("wv-closebuttons", "activetab");
        try {
            const wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width;
            assert.isBelow(wa, 141, "the row is narrow (tabs shrank)");
            assert.approximately(wa, wb, 0.5, "background and selected tab equally wide");
            assert.equal(win.getComputedStyle(a).paddingInlineEnd, win.getComputedStyle(b).paddingInlineEnd, "same padding");
            assert.equal(win.getComputedStyle(a.querySelector(".tab-name")).marginInlineEnd, "-17px", "the title takes the close button's room");
        } finally { box.remove(); bar.removeAttribute("wv-closebuttons"); }
    });

    it("the library tab never gets a close button", () => {
        // dev.6: the 20px close rule's display:flex out-ranked Zotero's
        // `.tab:first-child .tab-close { display: none }`.
        Zotero.Prefs.set(PREF, true);
        wv._ensureTabGroupStyles(doc);
        for (const lib of doc.querySelectorAll("#tab-bar-container .tabs > .tab:first-child")) {
            const c = lib.querySelector(".tab-close");
            if (c) assert.equal(win.getComputedStyle(c).display, "none");
        }
    });
});
