/* global describe, it, before, assert, Zotero */

// Tab multi-select (Ctrl / Shift + click), one behaviour over the main
// window's tab bar and the reader window's deck strip (tab-groups.ts
// WV_TABSEL_MAIN / WV_TABSEL_READER; survey 2026-10-06 §4 main / reader
// twins; 2026-10-21). Driven on fake windows: a detached root standing in
// for the document, a Zotero_Tabs / _wvWT stub, event objects that count
// their preventDefault / stopPropagation.

describe("Weavero — tab multi-select: one behaviour for the main window and the reader window", () => {
    let wv, win;
    const X = "http://www.w3.org/1999/xhtml";

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow();
        if (!wv || !win) wvT.absent("!wv");
        for (const m of ["_wvTabSelMouseDown", "_wvTabSelClick", "_wvTabSelSync", "_wvTabSelClear", "_wvTabSelTargets",
            "_wvTabMultiSelMouseDown", "_wvTabMultiSelClick", "_wvTabMultiSelSync", "_wvTabMultiSelClear", "_wvTabMultiSelTargets",
            "_wvWTMultiSelMouseDown", "_wvWTMultiSelClick", "_wvWTMultiSelSync", "_wvWTMultiSelClear", "_wvWTMultiSelTargets"]) assert.isFunction(wv[m], m);
    });

    const el = (cls, attr, val, parent) => { const e = /** @type {any} */ (win.document.createElementNS(X, "div")); if (cls) e.className = cls; if (attr) e.setAttribute(attr, val); if (parent) parent.appendChild(e); return e; };
    const ev = (target, init) => Object.assign({ button: 0, target, pd: 0, sp: 0, preventDefault() { this.pd++; }, stopPropagation() { this.sp++; } }, init || {});
    const marked = (nodes) => Object.keys(nodes).filter(k => nodes[k].classList.contains("wv-multisel")).sort();

    function mainRig() {
        const root = el();
        const bar = el(null, "id", "tab-bar-container", root);
        const tabs = {};
        for (const id of ["zotero-pane", "t1", "t2", "t3"]) tabs[id] = el("tab", "data-id", id, bar);
        const mirrors = el(null, "id", "wv-pinned-mirrors", root);
        tabs.t4 = el("wv-pinned-mirror", "data-tab-id", "t4", mirrors);
        const w = { document: root, Zotero_Tabs: { selectedID: "t1", _tabs: ["zotero-pane", "t1", "t2", "t3", "t4"].map(id => ({ id })) }, setTimeout: () => 0 };
        return { tabs, w };
    }
    function readerRig() {
        const root = el();
        const strip = el("wv-window-tabs", null, null, root);
        const tabs = {};
        for (const id of [10, 11, 12]) tabs[id] = el("wv-window-tab", "data-wv-tab-id", String(id), strip);
        const w = { document: root, _wvWT: { activeId: 10, tabs: [{ id: 10 }, { id: 11 }, { id: 12 }] } };
        return { tabs, w };
    }

    it("main window: accel toggles with the active tab implied, a mirror selects its pin, the library tab never joins, shift takes the range from the active tab, a plain press keeps a selected tab and clears on another, a plain click clears, right button and modifier clicks are inert", () => {
        const { tabs, w } = mainRig();
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t2, { ctrlKey: true }));
        assert.deepEqual([...w._wvSelTabIDs].sort(), ["t1", "t2"], "accel adds the active tab and the clicked one");
        assert.deepEqual(marked(tabs), ["t1", "t2"], "both marked");
        const e2 = ev(tabs.t2, { ctrlKey: true });
        wv._wvTabMultiSelMouseDown(w, e2);
        assert.strictEqual(e2.pd + e2.sp, 2, "a modifier press is swallowed");
        assert.deepEqual([...w._wvSelTabIDs], ["t1"], "accel again toggles it out");
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t1, { metaKey: true }));
        assert.deepEqual([...w._wvSelTabIDs], ["t1"], "accel on the active tab keeps it");
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t4, { ctrlKey: true }));
        assert.isTrue(w._wvSelTabIDs.has("t4"), "a pinned mirror selects its tab");
        assert.deepEqual(marked(tabs), ["t1", "t4"], "the mirror is marked");
        const lib = ev(tabs["zotero-pane"], { ctrlKey: true });
        wv._wvTabMultiSelMouseDown(w, lib);
        assert.isFalse(w._wvSelTabIDs.has("zotero-pane"), "the library tab never joins");
        assert.strictEqual(lib.sp, 1, "but the press is still swallowed");
        const right = ev(tabs.t3, { button: 2, ctrlKey: true });
        wv._wvTabMultiSelMouseDown(w, right);
        assert.isFalse(w._wvSelTabIDs.has("t3"), "the right button keeps the selection for the menu");
        assert.strictEqual(right.sp, 0);
        wv._wvTabMultiSelClear(w);
        assert.strictEqual(w._wvSelTabIDs.size, 0); assert.deepEqual(marked(tabs), []);
        w.Zotero_Tabs.selectedID = "t3";
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t1, { shiftKey: true }));
        assert.deepEqual([...w._wvSelTabIDs].sort(), ["t1", "t2", "t3"], "shift selects the range from the active tab");
        const keep = ev(tabs.t2);
        wv._wvTabMultiSelMouseDown(w, keep);
        assert.strictEqual(keep.pd + keep.sp, 0, "a plain press is not swallowed");
        assert.strictEqual(w._wvSelTabIDs.size, 3, "a plain press on a selected tab keeps the selection (a drag may follow)");
        const mod = ev(tabs.t2, { ctrlKey: true });
        wv._wvTabMultiSelClick(w, mod);
        assert.strictEqual(mod.pd + mod.sp, 2, "the click paired with a modifier press is swallowed");
        assert.strictEqual(w._wvSelTabIDs.size, 3);
        wv._wvTabMultiSelClick(w, ev(tabs.t2));
        assert.strictEqual(w._wvSelTabIDs.size, 0, "a plain click clears");
        assert.deepEqual(marked(tabs), []);
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t2, { ctrlKey: true }));
        wv._wvTabMultiSelMouseDown(w, ev(tabs.t4));
        assert.strictEqual(w._wvSelTabIDs.size, 0, "a plain press on an unselected tab clears");
        w._wvSelTabIDs = new Set(["t3", "t1", "gone"]); wv._wvTabMultiSelSync(w);
        assert.deepEqual(wv._wvTabMultiSelTargets(w, "t1"), ["t1", "t3"], "targets: the selection in bar order, stale ids dropped");
        assert.deepEqual(wv._wvTabMultiSelTargets(w, "t2"), ["t2"], "a tab outside the selection is alone");
        w._wvSelTabIDs = new Set(["t2"]);
        assert.deepEqual(wv._wvTabMultiSelTargets(w, "t2"), ["t2"], "a single selection is just the tab");
    });

    it("reader window: the same over the deck strip with string ids", () => {
        const { tabs, w } = readerRig();
        wv._wvWTMultiSelMouseDown(w, ev(tabs[11], { ctrlKey: true }));
        assert.deepEqual([...w._wvSelWTabIDs].sort(), ["10", "11"], "accel: the active deck tab implied, ids as strings");
        assert.deepEqual(marked(tabs), ["10", "11"]);
        wv._wvWTMultiSelMouseDown(w, ev(tabs[11], { ctrlKey: true }));
        assert.deepEqual([...w._wvSelWTabIDs], ["10"]);
        wv._wvWTMultiSelClear(w);
        w._wvWT.activeId = 12;
        wv._wvWTMultiSelMouseDown(w, ev(tabs[10], { shiftKey: true }));
        assert.deepEqual([...w._wvSelWTabIDs].sort(), ["10", "11", "12"], "shift range from the active deck tab");
        const keep = ev(tabs[11]);
        wv._wvWTMultiSelMouseDown(w, keep);
        assert.strictEqual(keep.sp, 0); assert.strictEqual(w._wvSelWTabIDs.size, 3, "a plain press on a selected deck tab keeps the selection");
        wv._wvWTMultiSelClick(w, ev(tabs[11]));
        assert.strictEqual(w._wvSelWTabIDs.size, 0, "a plain click clears");
        w._wvSelWTabIDs = new Set(["12", "10"]);
        assert.deepEqual(wv._wvWTMultiSelTargets(w, 10), ["10", "12"], "targets in deck order, the numeric id stringified");
        assert.deepEqual(wv._wvWTMultiSelTargets(w, 11), ["11"]);
        const outside = ev(w.document);
        wv._wvWTMultiSelMouseDown(w, outside);
        assert.strictEqual(w._wvSelWTabIDs.size, 2, "a press off any tab changes nothing");
    });

    it("the ten surface methods are wrappers and the shared ones know no surface", () => {
        for (const m of ["_wvTabMultiSelMouseDown", "_wvTabMultiSelClick", "_wvTabMultiSelSync", "_wvTabMultiSelClear", "_wvTabMultiSelTargets"]) {
            const s = String(wv[m]);
            assert.include(s, "WV_TABSEL_MAIN", m + " delegates to the main model");
            assert.notInclude(s, "sel.", m + " holds no logic");
        }
        for (const m of ["_wvWTMultiSelMouseDown", "_wvWTMultiSelClick", "_wvWTMultiSelSync", "_wvWTMultiSelClear", "_wvWTMultiSelTargets"]) {
            const s = String(wv[m]);
            assert.include(s, "WV_TABSEL_READER", m + " delegates to the reader model");
            assert.notInclude(s, "sel.", m + " holds no logic");
        }
        for (const m of ["_wvTabSelMouseDown", "_wvTabSelClick", "_wvTabSelSync", "_wvTabSelClear", "_wvTabSelTargets"]) {
            const s = String(wv[m]);
            for (const leak of ["Zotero_Tabs", "_wvWT", "data-id", "data-wv-tab-id", "zotero-pane", "_wvSelTabIDs", "_wvSelWTabIDs"]) assert.notInclude(s, leak, m + " knows no surface detail: " + leak);
        }
    });
});
