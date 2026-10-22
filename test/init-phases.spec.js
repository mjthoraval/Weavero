/* global describe, it, before, assert, Zotero */

// init() as a driver over named phases (index.ts; survey 2026-10-06 §4, the
// large-method splits, 2026-10-21): the bodies moved verbatim into one method
// each, called in the old order, the Settings-pane registration the only
// awaited one. The startup itself is exercised by every other spec (the
// runner waits for Zotero._weaveroReady); this locks the shape.

describe("Weavero — init() is a driver over its phases", () => {
    let wv;
    const Z = /** @type {any} */ (Zotero);
    const P = (name, awaited, marker) => ({ name, awaited, marker });
    const PHASES = [
        P("_wvInitEarly", false, "_wvWireEarlyRestoreTracing"),
        P("_wvInitPrefMigration", false, "enablePdfReader"),
        P("_wvInitStyles", false, "injectStyles"),
        P("_wvInitReaderEvents", false, "registerEventListener"),
        P("_wvInitReaderNotifier", false, "Zotero.Notifier.registerObserver"),
        P("_wvInitReaderPolling", false, "setInterval"),
        P("_wvInitOpenReaders", true, "Zotero.Reader"),
        P("_wvInitMainWindows", true, "encodeIcon"),
        P("_wvInitPrefPane", true, "_registerPrefPane"),
        P("_wvInitPrefObserver", false, "Zotero.Prefs.registerObserver"),
    ];

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
    });

    it("the phases exist, each carries its own work, and init() calls them in order with the Settings pane awaited", () => {
        const src = String(wv.init);
        let last = -1;
        for (const { name, awaited, marker } of PHASES) {
            assert.isFunction(wv[name], name);
            assert.include(String(wv[name]), marker, name + " holds its work (" + marker + ")");
            const call = (awaited ? "await " : "") + "this." + name + "();";
            const at = src.indexOf(call);
            assert.isAbove(at, last, name + " called " + (awaited ? "awaited " : "") + "after the previous phase");
            last = at;
        }
        assert.strictEqual((src.match(/\bawait\b/g) || []).length, 3, "init awaits the three phases that awaited before (open readers, main windows, the Settings pane)");
        assert.strictEqual((src.match(/if \(gone\(\)\) return;/g) || []).length, 3, "and stops after each of them when the instance was destroyed meanwhile");
        assert.notInclude(src, "try {", "init itself does nothing but call its phases");
        assert.notInclude(src, "registerEventListener");
    });

    it("the startup settled through them", () => {
        assert.isTrue(Z._weaveroReady, "ready");
        assert.isNotOk(Z._weaveroInitError, "no init error: " + Z._weaveroInitError);
        assert.isOk(wv._notifierIDs && wv._notifierIDs.length, "the reader notifiers registered");
        assert.isOk(wv._pollInterval, "the polling fallback armed");
    });
});
