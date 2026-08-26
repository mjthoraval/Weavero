/* global describe, it, before, assert, Zotero */

// Outline-takeover deactivation is ONE complete strip (2026-08-26).
//
// Turning the takeover off used to have three different shapes: the ensure
// pass's pref-off branch (class + view removal), activate(false) (class and
// parked-tabstop only -- NO view removal), and nothing at all for readers
// whose mutation tick hadn't run yet. A partial strip through activate(false)
// left other open readers with the visibility class and an unmaintained view
// behind it -- the Outline tab read as broken until some later tick.
//
// Now: `_wvReaderDeactivateOutlineTakeover` is the single implementation
// (class, parked tabstop restore, VIEW REMOVAL, cache drop); activate(false)
// and the ensure pref-off branch both delegate to it; and a versioned pref
// watcher propagates `readerOutlineTakeover` flips to every open reader
// immediately instead of waiting on mutation ticks.

describe("Weavero — outline takeover deactivation strips completely", () => {
    let wv, doc;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvReaderDeactivateOutlineTakeover !== "function") this.skip();
        doc = Zotero.getMainWindow().document;
    });

    // A reader doc in the ACTIVATED state: container class on, takeover view
    // present, native outline wrapper with its tab stop parked.
    const activatedDoc = () => {
        const d = doc.implementation.createHTMLDocument("wv-takeover-test");
        const container = d.createElement("div");
        container.id = "sidebarContainer";
        container.className = "sidebarOpen wv-outline-tab-on";
        d.body.appendChild(container);
        const view = d.createElement("div");
        view.className = "viewWrapper wv-outline-reader-view";
        view.setAttribute("data-tabstop", "1");
        container.appendChild(view);
        const nat = d.createElement("div");
        nat.className = "outline-view";
        nat.setAttribute("data-wv-parked-tabstop", "1");
        container.appendChild(nat);
        return { d, container, view, nat };
    };
    const mkReader = () => ({ _title: "spec", _wvSpyRangeCache: new Map([["k", null]]) });

    it("removes the visibility class", () => {
        const { d, container } = activatedDoc();
        wv._wvReaderDeactivateOutlineTakeover(mkReader(), d);
        assert.notInclude(container.className, "wv-outline-tab-on");
    });

    it("REMOVES the takeover view — the half-state was an empty wrapper left behind", () => {
        const { d } = activatedDoc();
        wv._wvReaderDeactivateOutlineTakeover(mkReader(), d);
        assert.isNull(d.querySelector(".wv-outline-reader-view"));
    });

    it("restores the native outline's parked tab stop", () => {
        const { d, nat } = activatedDoc();
        wv._wvReaderDeactivateOutlineTakeover(mkReader(), d);
        assert.equal(nat.getAttribute("data-tabstop"), "1",
            "Shift+Tab must not land on a stripped-but-stopless native view");
        assert.isFalse(nat.hasAttribute("data-wv-parked-tabstop"));
    });

    it("drops the per-reader spy cache", () => {
        const { d } = activatedDoc();
        const r = mkReader();
        wv._wvReaderDeactivateOutlineTakeover(r, d);
        assert.equal(r._wvSpyRangeCache.size, 0);
    });

    it("activate(false) IS the full strip (delegation, not a second shape)", () => {
        const { d, container, nat } = activatedDoc();
        wv._wvReaderActivateOutlineTakeover(mkReader(), d, false);
        assert.notInclude(container.className, "wv-outline-tab-on");
        assert.isNull(d.querySelector(".wv-outline-reader-view"),
            "the 2026-08-26 incident: activate(false) left the view element");
        assert.equal(nat.getAttribute("data-tabstop"), "1");
    });

    it("deactivating an already-clean doc is a harmless no-op", () => {
        const d = doc.implementation.createHTMLDocument("wv-clean");
        assert.doesNotThrow(() => wv._wvReaderDeactivateOutlineTakeover(mkReader(), d));
    });

    it("the pref watcher is registered, build-versioned", () => {
        if (typeof wv._wvWireOutlineTakeoverPrefWatch !== "function") this.skip();
        const g = /** @type {any} */ (Zotero);
        wv._wvWireOutlineTakeoverPrefWatch();
        assert.ok(g._wvOutlineTakeoverPrefObs, "observer handle must exist");
        assert.equal(g._wvOutlineTakeoverPrefObsVer, wv._wvWireTag());
        // Same build re-wire keeps the same handle (no stacking).
        const h = g._wvOutlineTakeoverPrefObs;
        wv._wvWireOutlineTakeoverPrefWatch();
        assert.strictEqual(g._wvOutlineTakeoverPrefObs, h);
    });
});
