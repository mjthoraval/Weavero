/* global describe, it, before, assert, Zotero */

// The per-main-window wiring table (src/modules/window-wiring.ts, survey
// 2026-10-06 §3.2). test/window-wiring.spec.js characterizes what the table
// produces on a real second window; this file guards the table itself:
//   - its shape, and the one known order constraint;
//   - onMainWindowLoad is the table and nothing else, so a new per-window
//     step cannot be added there and missed by init (the drift that left
//     the Edit > Undo hook init-only until 0.21.7);
//   - the init path is idempotent: running it again on a wired window
//     changes no mark (a wrap that stacks, or a listener stamp that is not
//     re-entrant, shows up here).

describe("Weavero — main-window wiring table", function () {
    this.timeout(60000);
    let wv, wires;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWireMainWindow");
        wires = wvT.method("_wvMainWires").call(wv);
        if (!Array.isArray(wires) || !wires.length) wvT.absent("the wiring table (_wvMainWires)");
    });

    it("every entry has a unique id, a path and a wire function", () => {
        const ids = wires.map(e => e.id);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate ids");
        for (const e of wires) {
            assert.include(["both", "load"], e.on, e.id + ".on");
            assert.isFunction(e.wire, e.id + ".wire");
        }
    });

    it("restore tracing wraps restoreState before the managed-window adoption suppresses it", () => {
        const ids = wires.map(e => e.id);
        assert.isAbove(ids.indexOf("restore-tracing"), -1);
        assert.isAbove(ids.indexOf("managed-window"), ids.indexOf("restore-tracing"));
    });

    it("onMainWindowLoad runs the table and nothing else", () => {
        const body = String(wv.onMainWindowLoad)
            .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const calls = [...body.matchAll(/\.(_\w+)\(/g)].map(m => m[1]);
        assert.deepEqual(calls, ["_wvWireMainWindow"]);
    });

    it("re-running the init path on a wired window changes no mark", async () => {
        const win = Zotero.getMainWindow();
        // Window IDENTITY marks (the anchor class, icon names) follow how
        // many windows are open: a reader window an earlier spec closed can
        // finish closing -- and refresh identity -- between the two
        // snapshots (checkpoint c8, 2026-10-13). Settle first.
        await wvT.settleSecondaryWindows();
        const before = wvT.wiringSnapshot(win);
        wv._wvWireMainWindow(win, "init");
        await wvT.sleep(1500);
        assert.deepEqual(wvT.wiringSnapshot(win), before);
    });
});

// The reader-window table (same file, wiring slice 2, 2026-10-12). What it
// produces on real windows: test/zz-reader-window-wiring.spec.js.
describe("Weavero — reader-window wiring table", function () {
    let wv, wires;

    before(function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvWireReaderWindow");
        wires = wvT.method("_wvReaderWires").call(wv);
        if (!Array.isArray(wires) || !wires.length) wvT.absent("the reader-window wiring table (_wvReaderWires)");
    });

    it("every entry has a unique id, known paths and a wire function", () => {
        const ids = wires.map(e => e.id);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "duplicate ids");
        for (const e of wires) {
            assert.isNotEmpty(e.on, e.id + ".on");
            for (const p of e.on) assert.include(["render", "init", "pref"], p, e.id + ".on");
            assert.isFunction(e.wire, e.id + ".wire");
        }
    });

    it("Edit > Undo is wired after the strip, on every path the strip runs on", () => {
        const strip = wires.find(e => e.id === "tab-strip");
        const undo = wires.find(e => e.id === "edit-undo-menu");
        assert.isOk(strip && undo, "both entries");
        assert.isAbove(wires.indexOf(undo), wires.indexOf(strip), "the strip's teardown unwires it");
        for (const p of strip.on) assert.include(undo.on, p, "edit-undo-menu runs on " + p);
    });

    it("the renderToolbar handler wires reader windows through the table", () => {
        const body = String(wv._toolbarHandlerImpl)
            .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const calls = [...body.matchAll(/\.(_\w+)\(/g)].map(m => m[1]);
        assert.include(calls, "_wvWireReaderWindow");
        for (const step of ["_ensureReaderWindowTabStrip", "_ensureReaderWindowItemPane", "_wvWireEditUndoMenu", "_wvWireReaderWindowReadersCleanup"]) {
            assert.notInclude(calls, step, step + " belongs in the table");
        }
    });
});
