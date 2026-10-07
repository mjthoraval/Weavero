/* global describe, it, before, assert, Zotero */

// Shared helpers in src/lib (survey 2026-10-06 §3.2–3.3, step 3 of §9):
// wvLivePlugin, wvWrap / wvUnwrap (layered, tag-stamped wraps), wvInjectStyle,
// wvTimeout / wvSleep. Published as `Zotero.Weavero.lib` for this suite. The
// last cases lock the migrations: no `|| self` / `|| this` plugin fallback
// anywhere, Zotero_Tabs and itemsView wraps layered under the instance tag.

describe("Weavero — shared helpers (src/lib)", () => {
    let wv, lib, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        lib = Zotero.Weavero && Zotero.Weavero.lib;
        win = Zotero.getMainWindow();
        if (!wv || !lib || !win) this.skip();
    });

    it("wvLivePlugin: the live instance; null once torn down or absent", () => {
        assert.strictEqual(lib.wvLivePlugin(), wv);
        const had = wv._wvDestroyed;
        wv._wvDestroyed = true;
        try { assert.isNull(lib.wvLivePlugin(), "a torn-down instance is not live"); }
        finally { wv._wvDestroyed = had; }
        assert.strictEqual(lib.wvLivePlugin(), wv);
    });

    it("wvWrap: layers rebuild from the native, a foreign instance's layer drops, unwrap restores exactly", () => {
        const proto = { m(x) { return "n" + x; } };
        const host = Object.create(proto);
        host.own = function (x) { return "o" + x; };
        const T1 = "wv@t#one", T2 = "wv@t#two";
        const layer = (L) => (orig) => function (x) { return L + "(" + orig.call(this, x) + ")"; };
        assert.isTrue(lib.wvWrap(host, "m", "a", T1, layer("A")));
        assert.isFalse(lib.wvWrap(host, "m", "a", T1, layer("never")), "same layer under the same tag: no-op");
        assert.isTrue(lib.wvWrap(host, "m", "b", T1, layer("B")));
        assert.strictEqual(host.m(1), "B(A(n1))", "install order: innermost first");
        assert.deepEqual(lib.wvWrapLayers(host, "m").map(l => l.layer), ["a", "b"]);
        // Another INSTANCE wraps (new tag): the dead instance's layers are
        // gone, not stacked under -- the hot-upgrade rule.
        assert.isTrue(lib.wvWrap(host, "m", "c", T2, layer("C")));
        assert.strictEqual(host.m(1), "C(n1)");
        assert.deepEqual(lib.wvWrapLayers(host, "m").map(l => l.layer + "@" + l.tag), ["c@" + T2]);
        lib.wvWrap(host, "m", "d", T2, layer("D"));
        assert.strictEqual(host.m(1), "D(C(n1))");
        assert.isTrue(lib.wvUnwrap(host, "m", "c"));
        assert.strictEqual(host.m(1), "D(n1)", "removing an inner layer re-applies the outer on the native");
        assert.isTrue(lib.wvUnwrap(host, "m"));
        assert.isFalse(Object.prototype.hasOwnProperty.call(host, "m"), "a prototype method shows through again");
        assert.strictEqual(host.m(1), "n1");
        assert.isUndefined(host._wvWraps, "the table goes with the last wrap");
        // An own-property member is put back, not deleted.
        const ownFn = host.own;
        lib.wvWrap(host, "own", "a", T1, layer("A"));
        assert.strictEqual(host.own(2), "A(o2)");
        lib.wvUnwrap(host, "own");
        assert.strictEqual(host.own, ownFn);
        assert.isFalse(lib.wvUnwrap(host, "own"), "nothing wrapped: false");
        assert.isFalse(lib.wvWrap(host, "nope", "a", T1, (o) => o), "no such function: false");
    });

    it("wvInjectStyle: one element per id, text refreshed when it changes; wvRemoveStyle", () => {
        const doc = win.document.implementation.createHTMLDocument("wv-lib");
        const a = lib.wvInjectStyle(doc, "wv-lib-test-style", "a{}");
        assert.strictEqual(a.localName, "style");
        assert.strictEqual(a.parentNode, doc.head);
        const b = lib.wvInjectStyle(doc, "wv-lib-test-style", "b{}");
        assert.strictEqual(b, a, "the same element is refreshed");
        assert.strictEqual(a.textContent, "b{}");
        assert.strictEqual(doc.querySelectorAll("#wv-lib-test-style").length, 1);
        const host = doc.createElement("div");
        doc.body.appendChild(host);
        const c = lib.wvInjectStyle(doc, "wv-lib-test-style-2", "c{}", host);
        assert.strictEqual(c.parentNode, host, "an explicit host wins");
        lib.wvRemoveStyle(doc, "wv-lib-test-style");
        assert.isNull(doc.getElementById("wv-lib-test-style"));
        lib.wvRemoveStyle(doc, "wv-lib-test-style");   // absent: no throw
        assert.isNull(lib.wvInjectStyle(null, "x", ""));
    });

    it("wvTimeout / wvSleep / wvClearTimeout run on the sandbox clock", async () => {
        let fired = false;
        const t = lib.wvTimeout(() => { fired = true; }, 5);
        assert.isOk(t != null);
        await lib.wvSleep(40);
        assert.isTrue(fired);
        const t2 = lib.wvTimeout(() => { throw new Error("a cleared timer ran"); }, 5);
        lib.wvClearTimeout(t2);
        lib.wvClearTimeout(null);
        await lib.wvSleep(20);
    });

    it("no method resolves the plugin with a `|| self` / `|| this` fallback any more", () => {
        const offenders = [];
        let o = Object.getPrototypeOf(wv);
        while (o && o !== Object.prototype) {
            for (const k of Object.getOwnPropertyNames(o)) {
                try {
                    const d = Object.getOwnPropertyDescriptor(o, k);
                    if (!d || typeof d.value !== "function") continue;
                    const s = String(d.value);
                    if (/plugin\)?\s*\|\|\s*(self|this)\b/.test(s)) offenders.push(k);
                } catch (_) {}
            }
            o = Object.getPrototypeOf(o);
        }
        assert.deepEqual(offenders, [], "a captured instance must never stand in for a missing live plugin");
    });

    it("Zotero_Tabs and itemsView wraps are layered under the instance tag; legacy keys are gone", () => {
        const Z = win.Zotero_Tabs, tag = wv._wvWireTag();
        const layers = (host, m) => lib.wvWrapLayers(host, m);
        assert.deepEqual(layers(Z, "getState").map(l => l.layer), ["normalize"]);
        assert.includeMembers(layers(Z, "close").map(l => l.layer), ["trace", "lastView"]);
        assert.deepEqual(layers(Z, "restoreState").map(l => l.layer), ["trace"]);
        for (const m of ["getState", "close", "restoreState", "markAsLoaded", "select"]) {
            for (const l of layers(Z, m)) assert.strictEqual(l.tag, tag, m + "/" + l.layer + " carries this instance's tag");
        }
        for (const k of ["_wvGetStatePatchVer", "_wvGetStateOrig", "_wvGetStateFull", "_wvLastViewWired", "_wvOrigTabsClose",
            "_wvRestoreTraceWired", "_wvOrigClose", "_wvOrigRestoreState", "_wvOrigMarkAsLoaded", "_wvOrigSelect"]) {
            assert.isUndefined(Z[k], k + " (legacy key) must be gone");
        }
        // The normalize layer still does its job: a transient type reads as its base type.
        const saved = Z._tabs;
        try {
            Z._tabs = [{ id: "zotero-pane", type: "library", title: "", data: {} }, { id: "wv-x", type: "reader-loading", title: "t", data: { itemID: 1 } }];
            const st = Z.getState();
            assert.strictEqual(st[1].type, "reader", "-loading serialized as the base type");
            assert.notStrictEqual(st[1].data, Z._tabs[1].data, "data is cloned, never aliased");
        }
        finally { Z._tabs = saved; }
        const iv = win.ZoteroPane.itemsView;
        assert.deepEqual(layers(iv, "selectItems").map(l => l.layer), ["filterParity"]);
        assert.isUndefined(iv._wvSelectItemsWrapVer);
        const rp = iv.rowProvider || iv;
        if (rp._wvUserOpenTrackingPatched !== undefined) assert.strictEqual(rp._wvUserOpenTrackingPatched, tag);
    });

    it("a reload leaves nothing of the previous instance on Zotero_Tabs (simulated foreign layer)", () => {
        const Z = win.Zotero_Tabs, tag = wv._wvWireTag();
        const before = Z.getState;
        // Plant a dead instance's layer, then let the live instance re-wire.
        lib.wvWrap(Z, "getState", "normalize", "wv@dead#0", () => function () { throw new Error("dead layer ran"); });
        assert.throws(() => Z.getState(), /dead layer ran/);
        wv._wvPatchTabsGetState(win);
        assert.doesNotThrow(() => Z.getState());
        assert.deepEqual(lib.wvWrapLayers(Z, "getState").map(l => l.tag), [tag]);
        assert.notStrictEqual(Z.getState, before, "re-wrapped (a new wrapper closure)");
    });
});
