/* global describe, it, before, assert, Zotero */

// The tabs-menu file-type and settings popups, one builder each for the main
// window's tabs menu and the reader window's tab list (survey 2026-10-06 §4,
// main-window / reader-window twins; 2026-10-21). Driven on scratch hosts in
// the main window with the surfaces' refresh hooks stubbed; the plugin-global
// filter state is saved and restored.

describe("Weavero — tabs-menu popups: one builder for the main window and the reader window", () => {
    let wv, lib, win;
    const X = "http://www.w3.org/1999/xhtml";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        win = Zotero.getMainWindow();
        if (!wv || !lib || !win) wvT.absent("!wv || !lib");
        for (const m of ["_toggleTabsMenuFileTypePopup", "_toggleTabsMenuSettingsPopup", "_wvWTToggleFileTypePopup", "_wvWTToggleSettingsPopup",
            "_wvTabsFilterPopupToggle", "_wvTabsSettingsPopupToggle"]) assert.isFunction(wv[m], m);
    });

    /** Run `fn` with plugin methods replaced, restoring them after. */
    function withStubs(stubs, fn) {
        const saved = Object.keys(stubs).map((name) => {
            const own = Object.prototype.hasOwnProperty.call(wv, name);
            const orig = wv[name];
            wv[name] = stubs[name];
            return { name, own, orig };
        });
        try { return fn(); }
        finally { for (const s of saved) { if (s.own) wv[s.name] = s.orig; else delete wv[s.name]; } }
    }
    const el = (tag, id) => { const e = /** @type {any} */ (win.document.createElementNS(X, tag)); if (id) e.id = id; return e; };
    const click = (node, alt) => node.dispatchEvent(new win.MouseEvent("click", { bubbles: true, altKey: !!alt }));
    const types = () => wv._ATTACHMENT_FILE_TYPES;

    it("the file-type popup: a tile per file type and Note, the clear bar hidden while nothing filters, click includes, Alt+click excludes, the surface refreshed; the reader entry builds the same popup on the same state; both close through their stash", () => {
        const doc = win.document;
        const host = el("div"), anchor = el("button"), wrapper = el("div"), list = el("div", "wv-wtl-list");
        host.appendChild(anchor);
        for (const n of [host, wrapper, list]) doc.documentElement.appendChild(n);
        const saved = { ft: wv._tabsMenuFileTypeFilter, lf: wv._tabsMenuLibraryFilter };
        wv._tabsMenuFileTypeFilter = { include: new Set(), exclude: new Set() };
        wv._tabsMenuLibraryFilter = new Map();
        const calls = [];
        try {
            withStubs({ _refreshFileTypeFilterButtonState: () => calls.push("btn"), _wvRegroupTabsMenu: () => calls.push("regroup") }, () => {
                wv._toggleTabsMenuFileTypePopup(win, host, anchor);
                const pop = host.querySelector("#wv-tabs-menu-filetype-popup");
                assert.isOk(pop, "the main popup");
                const tiles = pop.querySelectorAll(".wv-filter-opt-icon");
                assert.strictEqual(tiles.length, types().length + 1, "every file type and Note");
                assert.strictEqual(pop.querySelector(".wv-filter-clear-btn").style.visibility, "hidden", "nothing filters: the clear bar is hidden");
                click(tiles[0]);
                assert.isTrue(wv._tabsMenuFileTypeFilter.include.has(types()[0].value), "click includes");
                assert.deepEqual(calls, ["btn", "regroup"], "the main surface refreshed");
                assert.strictEqual(host.querySelector("#wv-tabs-menu-filetype-popup"), pop, "re-rendered in place");
                assert.notStrictEqual(pop.querySelector(".wv-filter-clear-btn").style.visibility, "hidden", "something filters: the clear bar shows");
                click(pop.querySelectorAll(".wv-filter-opt-icon")[1], true);
                assert.isTrue(wv._tabsMenuFileTypeFilter.exclude.has(types()[1].value), "Alt+click excludes");
                assert.isFunction(wv._wvFileTypeOutsideClose, "the dismisser's teardown is stashed");
                wv._toggleTabsMenuFileTypePopup(win, host, anchor);
                assert.isNull(host.querySelector("#wv-tabs-menu-filetype-popup"), "toggled closed");
                assert.isUndefined(wv._wvFileTypeOutsideClose, "the stash is dropped");
            });
            calls.length = 0;
            withStubs({ _wvWTPanelState: () => ({}), _wvWTRefreshFunnelState: () => calls.push("funnel"), _wvWTRenderTabListPanel: () => calls.push("render") }, () => {
                wv._wvWTToggleFileTypePopup(win, wrapper, anchor);
                const pop = wrapper.querySelector("#wv-wtl-filetype-popup");
                assert.isOk(pop, "the reader popup");
                const tiles = pop.querySelectorAll(".wv-filter-opt-icon");
                assert.strictEqual(tiles.length, types().length + 1);
                assert.strictEqual(tiles[0].dataset.selected, "true", "the main popup's include shows: one plugin-global state");
                assert.strictEqual(tiles[1].dataset.excluded, "true");
                click(pop.querySelector(".wv-filter-clear-icon"));
                assert.strictEqual(wv._tabsMenuFileTypeFilter.include.size + wv._tabsMenuFileTypeFilter.exclude.size, 0, "Clear and Close clears");
                assert.deepEqual(calls, ["funnel", "render"], "the reader surface refreshed");
                assert.isNull(wrapper.querySelector("#wv-wtl-filetype-popup"), "and closed");
                assert.isUndefined(win._wvWTFileTypeOutsideClose, "the window stash is dropped");
            });
        } finally {
            lib.wvDismissOff(wv, "_wvFileTypeOutsideClose");
            lib.wvDismissOff(win, "_wvWTFileTypeOutsideClose");
            for (const n of [host, wrapper, list]) n.remove();
            wv._tabsMenuFileTypeFilter = saved.ft;
            wv._tabsMenuLibraryFilter = saved.lf;
        }
    });

    it("the settings popup: two checkbox rows bound to the plugin-global toggles and their prefs, the surface refreshed on change; the reader entry builds the same rows", () => {
        const doc = win.document;
        const host = el("div"), anchor = el("button"), wrapper = el("div");
        host.appendChild(anchor);
        for (const n of [host, wrapper]) doc.documentElement.appendChild(n);
        const P = /** @type {any} */ (Zotero.Prefs);
        const prefs = ["weavero.tabsMenuGroupByLibrary", "weavero.tabsMenuShowAnnotationCount"];
        const savedPrefs = prefs.map(k => P.get(k));
        const savedFields = [wv._tabsMenuGroupByLibrary, wv._tabsMenuShowAnnotationCount];
        const calls = [];
        try {
            wv._tabsMenuGroupByLibrary = false; wv._tabsMenuShowAnnotationCount = false;
            host.refreshList = () => calls.push("refreshList");
            wv._toggleTabsMenuSettingsPopup(win, host, anchor);
            const pop = host.querySelector("#wv-tabs-menu-settings-popup");
            assert.isOk(pop, "the main popup");
            const boxes = pop.querySelectorAll(".wv-tabs-menu-settings-cb");
            assert.strictEqual(boxes.length, 2, "two rows");
            assert.deepEqual([...pop.querySelectorAll(".wv-tabs-menu-settings-label")].map(l => l.textContent), ["Sort Tabs by Library", "Show Annotations Count"]);
            boxes[0].checked = true; boxes[0].dispatchEvent(new win.Event("change", { bubbles: true }));
            assert.isTrue(wv._tabsMenuGroupByLibrary, "the field follows the box");
            assert.isTrue(P.get("weavero.tabsMenuGroupByLibrary"), "and the pref");
            assert.deepEqual(calls, ["refreshList"], "upstream refreshList re-runs");
            wv._toggleTabsMenuSettingsPopup(win, host, anchor);
            assert.isNull(host.querySelector("#wv-tabs-menu-settings-popup"));
            assert.isUndefined(wv._wvSettingsOutsideClose);
            calls.length = 0;
            withStubs({ _wvWTPanelState: () => ({}), _wvWTRenderTabListPanel: () => calls.push("render") }, () => {
                wv._wvWTToggleSettingsPopup(win, wrapper, anchor);
                const pop2 = wrapper.querySelector("#wv-wtl-settings-popup");
                assert.isOk(pop2, "the reader popup");
                const boxes2 = pop2.querySelectorAll(".wv-tabs-menu-settings-cb");
                assert.isTrue(boxes2[0].checked, "the shared toggle shows");
                boxes2[1].checked = true; boxes2[1].dispatchEvent(new win.Event("change", { bubbles: true }));
                assert.isTrue(wv._tabsMenuShowAnnotationCount);
                assert.deepEqual(calls, ["render"], "the reader surface re-rendered");
                wv._wvWTToggleSettingsPopup(win, wrapper, anchor);
                assert.isNull(wrapper.querySelector("#wv-wtl-settings-popup"));
                assert.isUndefined(win._wvWTSettingsOutsideClose);
            });
        } finally {
            lib.wvDismissOff(wv, "_wvSettingsOutsideClose");
            lib.wvDismissOff(win, "_wvWTSettingsOutsideClose");
            for (const n of [host, wrapper]) n.remove();
            prefs.forEach((k, i) => { if (savedPrefs[i] === undefined) { try { P.clear(k); } catch (_) {} } else P.set(k, savedPrefs[i]); });
            [wv._tabsMenuGroupByLibrary, wv._tabsMenuShowAnnotationCount] = savedFields;
        }
        // The four surface methods are wrappers of the two builders.
        for (const m of ["_toggleTabsMenuFileTypePopup", "_wvWTToggleFileTypePopup"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvTabsFilterPopupToggle", m + " delegates");
            assert.notInclude(s, "makeOpt", m + " builds no tile itself");
        }
        for (const m of ["_toggleTabsMenuSettingsPopup", "_wvWTToggleSettingsPopup"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvTabsSettingsPopupToggle", m + " delegates");
            assert.notInclude(s, "makeRow", m + " builds no row itself");
        }
    });
});
