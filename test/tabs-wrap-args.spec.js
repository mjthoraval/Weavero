/* global describe, it, before, assert, Zotero */

// Weavero's layers on Zotero_Tabs members (restore tracing, the issue #29
// last-view guard, getState normalization) must hand EVERY argument to the
// function below them. Zotero 11 added `close(ids, { skipHistory })`, used by
// unload(); the tracing layer called `origClose(ids)` and dropped it, so with
// Weavero an unloaded tab stayed open AND became reopenable with Undo Close
// Tab -- the duplicate upstream 92dfac8c6 fixed (2026-10-12).
//
// Version-independent: each member's installed layers are rebuilt on a SPY
// native (the same `make` functions lib/wrap.ts chains on the real one), and
// called with an extra marker argument the spy must receive. The live
// Zotero_Tabs methods are not touched, and no real tab is involved.

describe("Weavero — Zotero_Tabs wrapper layers forward every argument", function () {
    let Z;

    before(function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        Z = Zotero.getMainWindow().Zotero_Tabs;
        if (!Z || !Z._wvWraps) wvT.absent("Zotero_Tabs wrap table (restore tracing not wired)");
    });

    const NO_TAB = "wv-test-no-such-tab";
    const CALLS = {
        close: (m) => [NO_TAB, m],
        select: (m) => [NO_TAB, false, {}, m],
        markAsLoaded: (m) => [NO_TAB, m],
        getState: (m) => [m],
    };

    for (const [member, argsFor] of Object.entries(CALLS)) {
        it(member + ": every layer passes the arguments through", () => {
            const e = Z._wvWraps[member];
            assert.isOk(e && e.recs && e.recs.length, member + " carries Weavero layers");
            let got = null;
            const spy = function (...args) { got = args; return member === "getState" ? [] : undefined; };
            let fn = spy;
            for (const r of e.recs) fn = r.make(fn);
            const marker = { wvMarker: member };
            fn.apply(Z, argsFor(marker));
            assert.isOk(got, member + ": the native was reached (layers: " + e.recs.map(r => r.layer).join("+") + ")");
            assert.include(got, marker, member + ": the last argument was dropped on the way down");
        });
    }
});
