/* global describe, it, before, after, assert, Zotero, Components, Services, wvT */

// Zotero changes coming in open PRs, met through stand-ins of the new shapes
// where the runner's Zotero lacks them (future-proofing plan phase 2, branch
// future; the canary runs of work/canary-2026-11-21.md section 4, zotero#6080):
//   - Reader.open / Notes.open / ZoteroPane.openNote resolve with
//     { instance, tabID, win } (lib/compat.ts wvOpenedInstance);
//   - Zotero.Keys is gone, Zotero.Shortcuts holds Zotero's own shortcuts
//     (wvZoteroAccelShiftCommand, the outline-shortcut conflict check);
//   - a plugin's scope is NUKED 10 s after its shutdown: the wrap tables live
//     in the host's compartment (lib/wrap.ts), the items view's refresh
//     listener goes at destroy (pane.ts), the window state of the dying scope
//     is copied or deleted (index.ts _wvReleaseWindowState), the undo stacks
//     cross an update as a JSON string (undo.ts).

describe("Weavero — Zotero API shapes of zotero#6080, met through stand-ins", function () {
    this.timeout(120000);
    const Cu = Components.utils;
    let wv, L, main;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const f of ["wvOpenedInstance", "wvZoteroAccelShiftCommand", "wvScopeNukedAtUnload", "wvIsPlainData", "wvWrap", "wvUnwrap"]) {
            if (!L || typeof L[f] !== "function") wvT.absent("lib." + f);
        }
        for (const m of ["_wvOutlineKeyConflict", "_wvReleaseWindowState", "_wvTeardownTagSelectorHandle", "_wvApplyTagSelectorHandle", "_wvUndoStacks", "_wvReleaseGlobalState"]) wvT.method(m);
        main = Zotero.getMainWindow();
    });

    it("an open's result is the instance, from the reader itself (Zotero 10, 11 beta.5) or from { instance, tabID, win } (zotero#6080)", function () {
        const reader = { tabID: "t1", _window: main, navigate() {} };
        assert.strictEqual(L.wvOpenedInstance(reader), reader, "a reader stays itself");
        assert.strictEqual(L.wvOpenedInstance({ instance: reader, tabID: "t1", win: main }), reader, "the #6080 shape gives its instance");
        assert.strictEqual(L.wvOpenedInstance({ instance: undefined, tabID: "t2", win: main }), undefined, "an unloaded tab selected: no instance yet");
        assert.strictEqual(L.wvOpenedInstance(undefined), undefined);
        assert.strictEqual(L.wvOpenedInstance(null), null);
        // A note editor (Zotero 10's Notes.open) has no `instance` key: itself.
        const editor = { _iframeWindow: null, saveSync() {} };
        assert.strictEqual(L.wvOpenedInstance(editor), editor);
    });

    it("Ctrl/Cmd+Shift+letter names Zotero's own command through Zotero.Shortcuts where Zotero.Keys is gone (zotero#6080)", function () {
        const Z = /** @type {any} */ (Zotero);
        const keysWas = Z.Keys, shortcutsWas = Z.Shortcuts;
        const accel = Zotero.isMac ? { m: 1 } : { c: 1 };
        const sp = (code, label, m) => ({ code, label, ctrl: !!m.c, alt: !!m.a, shift: !!m.s, meta: !!m.m });
        // The stand-in: the PR's shape (xpcom/shortcuts.js), only what the check reads.
        const standIn = {
            normalizeCombo(key, mods) { return mods.slice().sort().join("+") + "+" + String(key).toUpperCase(); },
            isRegistered(combo) { return combo === "accel+shift+Q"; },
            _registrations: new Map([["zotero-newNote", { id: "zotero-newNote", combo: "accel+shift+O", targets: new Set(["mainWindow"]) }]]),
        };
        try {
            Z.Keys = undefined;
            if (!shortcutsWas || typeof shortcutsWas.normalizeCombo !== "function") Z.Shortcuts = standIn;
            assert.equal(L.wvZoteroAccelShiftCommand("O"), "newNote", "Zotero's New note, from its registration id");
            assert.match(wv._wvOutlineKeyConflict(sp("KeyO", "O", Object.assign({ s: 1 }, accel))), /Zotero’s “New note”/, "the outline check names it");
            assert.isNull(L.wvZoteroAccelShiftCommand("J"), "a free combination");
            Z.Shortcuts = undefined;
            assert.isNull(L.wvZoteroAccelShiftCommand("O"), "neither API: no conflict claimed, no throw");
        }
        finally { Z.Keys = keysWas; Z.Shortcuts = shortcutsWas; }
        // Where Zotero.Keys exists (Zotero 10, 11 beta.5) it still answers.
        if (keysWas && typeof keysWas.getCommand === "function") {
            const k = Zotero.Prefs.get("keys.newNote");
            if (k) assert.equal(L.wvZoteroAccelShiftCommand(String(k).toUpperCase()), keysWas.getCommand(String(k).toUpperCase()));
        }
    });

    it("a wrap table is made in the HOST's compartment: a nuked wrapping scope leaves it readable, and the next instance peels back to the native", function () {
        // A host made in Zotero's own (chrome) global, as Zotero's singletons are.
        const ZG = Cu.getGlobalForObject(Zotero);
        const host = new ZG.Object();
        host.m = function native() { return 1; };
        const native = host.m;
        // The old instance: its layer's maker comes from a sandbox that is then nuked.
        const sb = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshZone: true });
        const oldMake = Cu.evalInSandbox("(function (orig) { return function () { return orig.apply(this, arguments) + 10; }; })", sb);
        assert.isTrue(L.wvWrap(host, "m", "old", "tag-old", oldMake), "the old layer went on");
        assert.equal(host.m(), 11);
        assert.strictEqual(Cu.getGlobalForObject(host._wvWraps), Cu.getGlobalForObject(host), "the table is the host's");
        assert.strictEqual(Cu.getGlobalForObject(host._wvWraps.m), Cu.getGlobalForObject(host), "its entry too");
        Cu.nukeSandbox(sb);
        // The slot holds a stub (lib/wrap.ts, 2026-11-27) that runs the chain: here the stub is
        // the live lib's, the old layer under it the nuked scope's (a real old instance's stub
        // would be dead too).
        assert.isTrue(Cu.isDeadWrapper(host._wvWraps.m.chain), "the old wrapper is dead, as #6080 leaves it");
        // The new instance wraps the same member: rebuilt from the native, the dead layer dropped.
        assert.isTrue(L.wvWrap(host, "m", "new", "tag-new", (orig) => function () { return orig.apply(this, arguments) + 1; }), "re-wrapped");
        assert.equal(host.m(), 2, "the native under the new layer only");
        assert.deepEqual(L.wvWrapLayers(host, "m").map(l => l.tag), ["tag-new"]);
        assert.isTrue(L.wvUnwrap(host, "m"), "peeled");
        assert.strictEqual(host.m, native, "the native is back");
        assert.isFalse(Object.prototype.hasOwnProperty.call(host, "_wvWraps"), "no table left");
        // A table an OLDER build made in its own scope, now dead: dropped, not thrown on.
        const sb2 = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshZone: true });
        host._wvWraps = Cu.evalInSandbox("({})", sb2);
        Cu.nukeSandbox(sb2);
        assert.isFalse(L.wvUnwrap(host, "m"), "nothing readable to peel");
        assert.isTrue(L.wvWrap(host, "m", "new", "tag-new", (orig) => function () { return orig.apply(this, arguments) + 1; }), "a fresh table");
        assert.equal(host.m(), 2);
        L.wvUnwrap(host, "m");
        assert.strictEqual(host.m, native);
    });

    it("the items view's refresh listener is Weavero's only while wired: destroy's teardown removes it (no dead function in Zotero's listener loop under zotero#6080)", function () {
        const iv = main.ZoteroPane && main.ZoteroPane.itemsView;
        if (!iv || !iv.onRefresh || typeof iv.onRefresh.removeListener !== "function") wvT.absent("itemsView.onRefresh");
        const mine = Cu.getGlobalForObject(wv);
        const ours = () => {
            let n = 0;
            for (const k of Object.keys(iv._events || {})) {
                const ls = iv._events[k] && iv._events[k].listeners;
                if (!ls || typeof ls.keys !== "function") continue;
                for (const fn of ls.keys()) { try { if (Cu.getGlobalForObject(fn) === mine) n++; } catch (e) {} }
            }
            return n;
        };
        const was = Zotero.Prefs.get("weavero.tagSelectorHandle");
        try {
            Zotero.Prefs.set("weavero.tagSelectorHandle", true);
            wv._wvApplyTagSelectorHandle(main);
            const before = ours();
            assert.isAtLeast(before, 1, "the handle's refresh listener is on");
            wv._wvApplyTagSelectorHandle(main);
            assert.equal(ours(), before, "a second wiring stacks nothing");
            wv._wvTeardownTagSelectorHandle();
            assert.equal(ours(), before - 1, "destroy's teardown took it off");
        }
        finally {
            if (was === undefined) Zotero.Prefs.clear("weavero.tagSelectorHandle"); else Zotero.Prefs.set("weavero.tagSelectorHandle", was);
            wv._wvApplyTagSelectorHandle(main);
        }
    });

    it("a chrome target's keyed-listener table and records are the target's (they survive a nuke of the instance that wired)", function () {
        const tag = "wv-test-listen-tag";
        const fn = () => {};
        assert.isTrue(L.wvListen(main, "wv-test:shape", "wv-test-shape-event", fn, false, tag), "wired");
        try {
            assert.strictEqual(Cu.getGlobalForObject(main._wvListen), main, "the table is the window's");
            assert.strictEqual(Cu.getGlobalForObject(main._wvListen["wv-test:shape"]), main, "its record too");
            assert.strictEqual(main._wvListen["wv-test:shape"].fn, fn);
        }
        finally {
            L.wvUnlisten(main, "wv-test:shape");
            // And out of the registry: wvUnlisten leaves its entry, and with it the main
            // window's unload hook, which every later reload kept (a foreign tag) -- an old
            // instance's listener on the main window, zz-reload-listeners' first and last cases
            // on Zotero 10 (dev.99 triage, 2026-11-27).
            L.wvUnlistenAll(tag);
        }
        assert.isUndefined(main._wvListen && main._wvListen["wv-test:shape"], "unwired");
        assert.deepEqual(L.wvListenRegistry().tags.filter(t => t === tag), [], "and no registry entry left under the scratch tag");
    });

    it("where the scope is nuked at unload, the window data it made is copied out (plain data); handles (functions, tables of them) are left for the next instance to peel", function () {
        const sb = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshZone: true });
        const mine = Cu.getGlobalForObject(wv);
        // Weavero's objects: made in its own scope, as its modules make them.
        const W = /** @type {any} */ (main);
        const plain = new (mine.Array)();
        plain.push(new (mine.Object)());
        plain[0].id = "split-1"; plain[0].left = "a"; plain[0].right = "b";
        W._wvTestPlain = plain;
        W._wvTestMap = new (mine.Map)([["k", 1]]);
        W._wvTestFn = wv._wvUndoStacks;   // a function of Weavero's scope
        W._wvTestPrim = 7;
        W._wvTestForeign = Cu.evalInSandbox("({ a: 1 })", sb);
        main.document._wvTestDocPlain = new (mine.Object)();
        main.document._wvTestDocPlain.x = 1;
        try {
            // Only the test's names: the live run's window state stays.
            const r = wv._wvReleaseWindowState(/^_wvTest/);
            assert.include(r.copied, "win._wvTestPlain", "plain data copied: " + JSON.stringify(r));
            assert.include(r.copied, "doc._wvTestDocPlain");
            assert.include(r.kept, "win._wvTestMap", "a Map left as it is");
            assert.include(r.kept, "win._wvTestFn", "a function (a handle) left for the next instance's peel");
            assert.notInclude(r.kept.concat(r.copied), "win._wvTestForeign", "another scope's object is not Weavero's to touch");
            assert.strictEqual(Cu.getGlobalForObject(W._wvTestPlain), main, "the copy lives in the window");
            assert.deepEqual(JSON.parse(JSON.stringify(W._wvTestPlain)), [{ id: "split-1", left: "a", right: "b" }], "same data");
            assert.strictEqual(Cu.getGlobalForObject(W._wvTestMap), mine, "the Map untouched");
            assert.strictEqual(W._wvTestFn, wv._wvUndoStacks, "the function untouched");
            assert.equal(W._wvTestPrim, 7, "a primitive stays");
        }
        finally {
            for (const k of ["_wvTestPlain", "_wvTestMap", "_wvTestFn", "_wvTestPrim", "_wvTestForeign"]) { try { delete W[k]; } catch (e) {} }
            try { delete main.document._wvTestDocPlain; } catch (e) {}
            try { Cu.nukeSandbox(sb); } catch (e) {}
        }
    });

    it("the suite finds the add-on's root without Zotero.Plugins.getRootURI (zotero#6080 removes it): wvT.rootURI, the bundle fetchable from it", async function () {
        const P = /** @type {any} */ (Zotero.Plugins);
        const had = Object.prototype.hasOwnProperty.call(P, "getRootURI");
        const was = P.getRootURI;
        const viaZotero = typeof was === "function" ? await was.call(P, "weavero@mjthoraval") : null;
        let viaAddon;
        try {
            P.getRootURI = undefined;
            viaAddon = await wvT.rootURI();
        }
        finally { if (had) P.getRootURI = was; else delete P.getRootURI; }
        assert.match(viaAddon, /\/$/, "a folder URI: " + viaAddon);
        if (viaZotero) assert.equal(viaAddon, viaZotero, "the same root as Zotero's own");
        const res = await fetch(viaAddon + "manifest.json");
        const man = JSON.parse(await res.text());
        assert.equal(man.applications.zotero.id, "weavero@mjthoraval", "Weavero's own manifest there");
    });

    it("an update under the nuke hands the undo stacks over as a JSON string, read back by the next instance", function () {
        const Z = /** @type {any} */ (Zotero);
        const P = /** @type {any} */ (Zotero.Plugins);
        const stateWas = Z._wvUndoState;
        const baseWas = Object.prototype.hasOwnProperty.call(P, "getBaseURI") ? P.getBaseURI : undefined;
        const hadBase = typeof P.getBaseURI === "function";
        try {
            if (!hadBase) P.getBaseURI = () => "moz-extension://wv-test/";
            assert.isTrue(L.wvScopeNukedAtUnload(), "the stand-in tells the #6080 plugin model");
            const m = new Map();
            m.set("wv-test-scope", { undo: [{ label: "Add Outline Entry", type: "outline.add", data: { id: "e1" }, id: "u1", at: 1 }], redo: [], busy: false });
            Z._wvUndoState = m;
            // Only the undo part of the release, as an update (reason 7) runs it:
            // the other Zotero._wv* objects are not this test's to drop.
            const keep = {};
            for (const k of Object.getOwnPropertyNames(Z)) if (/^_wv/.test(k) && k !== "_wvUndoState") keep[k] = Z[k];
            wv._wvReleaseGlobalState(7);
            for (const k of Object.keys(keep)) if (!(k in Z)) Z[k] = keep[k];
            assert.isFalse("_wvUndoState" in Z, "the Map is not left to die");
            assert.isString(Z._wvUndoStateJSON, "a string, which a nuke does not kill");
            const back = wv._wvUndoStacks();
            assert.deepEqual(back.get("wv-test-scope").undo.map(s => s.label), ["Add Outline Entry"], "read back by the next instance");
            assert.isFalse("_wvUndoStateJSON" in Z, "read once");
        }
        finally {
            if (!hadBase) delete P.getBaseURI; else if (baseWas !== undefined) P.getBaseURI = baseWas;
            Z._wvUndoState = stateWas;
            try { delete Z._wvUndoStateJSON; } catch (e) {}
        }
    });
});
