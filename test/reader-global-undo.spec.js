/* global describe, it, before, beforeEach, afterEach, assert, Zotero */

// zotero#6021 (reader undo in Zotero's global history; canary 791a2110,
// work/canary-2026-11-21.md section 1): the reader reports its annotation
// history to Zotero.UndoHistory as a provider, and only Zotero's own undo /
// redo move Zotero's entries. Weavero's Edit > Undo takeover and its Ctrl+Y in
// the page ran the READER's undo directly, and the two histories drifted (one
// step per desync unreachable from Zotero's commands). Now, where the reader
// has `_externalUndoHistory`: a reader step runs as Zotero's undo / redo; the
// Edit menu's items stay Zotero's unless the tab's newest step is Weavero's;
// the page's Mod-Z / Mod-Shift-Z / Ctrl+Y are taken only for such a step.
//
// Stand-ins: the runner's Zotero has no provider API (Zotero 10, 11 beta.5),
// so the real Zotero.UndoHistory gets one for the length of a case -- an undo /
// redo that, like the PR's _applyProviderEntry, pops its own entry and calls
// the provider -- and a fake reader carries `_externalUndoHistory` and an
// annotation manager with two points.

describe("Weavero — the reader's undo goes through Zotero's global history (zotero#6021, stand-ins)", function () {
    let wv, win, popup, undo, redo, UH, saved, reader, am, calls, origChoice, origRoute, origRun;
    const fire = (type, target) => { const ev = new win.Event(type, { bubbles: true }); target.dispatchEvent(ev); return ev; };
    const wait = ms => new Promise(r => win.setTimeout(r, ms));
    let choice = { undo: null, redo: null };
    const choiceStub = (r, dir) => choice[dir];
    // Zotero's entries for the reader's points: what setProviderSteps would hold.
    let zUndo = [], zRedo = [];
    const mirrors = () => {
        assert.deepEqual(zUndo.map(e => e.stepID), am._undoStack.map(p => p.id), "Zotero's undo stack mirrors the reader's");
        assert.deepEqual(zRedo.map(e => e.stepID), am._redoStack.map(p => p.id), "Zotero's redo stack mirrors the reader's");
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvReaderUndoHistory", "_wvTabUndoRedo", "_wvTabUndoChoice", "_wvEditUndoMenuApply", "_wvEditUndoRoute", "_wvWireReaderRedoKey"]) wvT.method(m);
        win = Zotero.getMainWindow();
        popup = win.document.getElementById("menu_EditPopup");
        undo = win.document.getElementById("menu_undo");
        redo = win.document.getElementById("menu_redo");
        UH = /** @type {any} */ (Zotero).UndoHistory;
        if (!UH) this.skip();   // Zotero 9: no UndoHistory at all (no allowlist entry needed on 10+/11)
        origChoice = wv._wvTabUndoChoice; origRoute = wv._wvEditUndoRoute; origRun = wv._wvTabUndoRedo;
    });

    beforeEach(() => {
        calls = [];
        // The reader: two points, as two highlights leave them.
        am = { canUndo: true, canRedo: false, _undoStack: [{ id: 1, action: "add-annotations" }, { id: 2, action: "add-annotations" }], _redoStack: [], _lastChange: Date.now() };
        const sync = () => { am.canUndo = am._undoStack.length > 0; am.canRedo = am._redoStack.length > 0; };
        reader = {
            _instanceID: "wv-test-reader", _iframeWindow: null,
            _internalReader: {
                _externalUndoHistory: true, _annotationManager: am,
                undo() { calls.push("ir.undo"); const p = am._undoStack.pop(); if (!p) return false; am._redoStack.push(p); sync(); return true; },
                redo() { calls.push("ir.redo"); const p = am._redoStack.pop(); if (!p) return false; am._undoStack.push(p); sync(); return true; },
            },
        };
        zUndo = [{ providerID: "wv-test-reader", stepID: 1 }, { providerID: "wv-test-reader", stepID: 2 }];
        zRedo = [];
        saved = { registerProvider: Object.getOwnPropertyDescriptor(UH, "registerProvider"), undo: Object.getOwnPropertyDescriptor(UH, "undo"), redo: Object.getOwnPropertyDescriptor(UH, "redo") };
        // Zotero's side (undoHistory.js _apply -> _applyProviderEntry): its own
        // entry moves, the provider steps its history.
        const step = (from, to, fn) => async () => {
            calls.push("UH." + fn);
            const e = from.pop();
            if (!e) return false;
            const ok = reader._internalReader[fn]();
            calls.pop();   // the provider call is Zotero's, not Weavero's
            if (ok) to.push(e);
            return ok;
        };
        UH.registerProvider = function () {};
        UH.undo = step(zUndo, zRedo, "undo");
        UH.redo = step(zRedo, zUndo, "redo");
    });

    afterEach(async () => {
        for (const k of ["registerProvider", "undo", "redo"]) {
            if (saved[k]) Object.defineProperty(UH, k, saved[k]); else delete UH[k];
        }
        wv._wvTabUndoChoice = origChoice; wv._wvEditUndoRoute = origRoute; wv._wvTabUndoRedo = origRun;
        choice = { undo: null, redo: null };
        try { fire("popuphidden", popup); await wait(120); } catch (e) {}
    });

    it("feature test: Zotero's history only where the reader reports to it and Zotero has providers", () => {
        assert.strictEqual(wv._wvReaderUndoHistory(reader), UH);
        reader._internalReader._externalUndoHistory = false;
        assert.isNull(wv._wvReaderUndoHistory(reader), "a reader without the PR: its own undo");
        reader._internalReader._externalUndoHistory = true;
        delete UH.registerProvider;
        if (saved.registerProvider) Object.defineProperty(UH, "registerProvider", saved.registerProvider);
        if (typeof UH.registerProvider !== "function") assert.isNull(wv._wvReaderUndoHistory(reader), "Zotero without providers (10, 11 beta.5)");
    });

    it("a reader step runs as Zotero's undo / redo, never the reader's directly: the two histories stay in step", async () => {
        wv._wvTabUndoChoice = (r, dir) => ({ kind: "reader", label: "Add Annotation", at: 1 });
        assert.strictEqual(await wv._wvTabUndoRedo(reader, null, "undo"), "Add Annotation");
        assert.deepEqual(calls, ["UH.undo"], "Zotero's undo, not ir.undo");
        mirrors();
        calls = [];
        assert.strictEqual(await wv._wvTabUndoRedo(reader, null, "redo"), "Add Annotation");
        assert.deepEqual(calls, ["UH.redo"], "Zotero's redo, not ir.redo");
        mirrors();
        // Two undos, a redo: still in step (the canary's desync A needed only one).
        await wv._wvTabUndoRedo(reader, null, "undo");
        await wv._wvTabUndoRedo(reader, null, "undo");
        await wv._wvTabUndoRedo(reader, null, "redo");
        mirrors();
        assert.notInclude(calls, "ir.undo"); assert.notInclude(calls, "ir.redo");
        // A selective pick of a point below the top: refused (Zotero's entries keep the reader's order).
        assert.isNull(await wv._wvTabUndoRedo(reader, null, "undo", { reader: true, pointId: 999 }), "not the top: nothing runs");
        mirrors();
    });

    it("Edit > Undo / Redo stay Zotero's for the reader's steps, Weavero's only for its own newest step", () => {
        const idoc = {};
        wv._wvEditUndoRoute = () => ({ reader, idoc });
        wv._wvTabUndoChoice = choiceStub;
        choice = { undo: { kind: "reader", label: "Add Annotation", at: 2 }, redo: null };
        undo.setAttribute("disabled", "true"); redo.setAttribute("disabled", "true");
        try {
            wv._wvEditUndoMenuApply(win, popup);
            assert.isNull(undo.getAttribute("data-wv-undo"), "the reader's step: Zotero's item, untouched");
            assert.isNull(redo.getAttribute("data-wv-undo"), "nothing in the tab: Zotero's item, untouched");
            assert.strictEqual(undo.getAttribute("command"), "cmd_undo");
            fire("popuphidden", popup);
            choice = { undo: { kind: "weavero", scope: "outline:x", label: "Add Outline Entry", at: 3 }, redo: null };
            wv._wvEditUndoMenuApply(win, popup);
            assert.strictEqual(undo.getAttribute("data-wv-undo"), "undo", "Weavero's own newest step: taken over");
            assert.include(String(undo.getAttribute("label")), "Add Outline Entry");
        }
        finally { undo.setAttribute("disabled", "true"); redo.setAttribute("disabled", "true"); }
    });

    it("the page's Mod-Z / Mod-Shift-Z / Ctrl+Y go on to Zotero for the reader's steps, and are taken for Weavero's newest step", () => {
        // Wired here with the provider API present (the stand-in): on Windows the
        // listener is there anyway (Ctrl+Y); elsewhere it comes only with #6021.
        const had = win._wvRedoKeyH;
        wv._wvWireReaderRedoKey(win);
        const h = win._wvRedoKeyH;
        assert.isFunction(h, "the page key listener");
        const idoc = { fake: "idoc" };
        const otherDoc = { fake: "view" };
        wv._wvEditUndoRoute = () => ({ reader, idoc });
        wv._wvTabUndoChoice = choiceStub;
        const ran = [];
        wv._wvTabUndoRedo = async (r, d, dir) => { ran.push(dir); return "x"; };
        const mac = !!Zotero.isMac;
        const key = (k, shift) => {
            const ev = { key: k, ctrlKey: !mac || k === "y", metaKey: mac && k !== "y", shiftKey: !!shift, altKey: false, repeat: false,
                target: { ownerDocument: otherDoc, closest: () => null }, prevented: false,
                preventDefault() { this.prevented = true; }, stopPropagation() {} };
            h(ev);
            return ev.prevented;
        };
        try {
            choice = { undo: { kind: "reader", label: "Add Annotation", at: 2 }, redo: { kind: "reader", label: "Add Annotation", at: 2 } };
            assert.isFalse(key("z"), "Mod-Z, the reader's step: left to Zotero's cmd_undo");
            assert.isFalse(key("z", true), "Mod-Shift-Z: left to Zotero's cmd_redo");
            if (Zotero.isWin) assert.isFalse(key("y"), "Ctrl+Y: left to Zotero's key_redo");
            assert.deepEqual(ran, []);
            choice = { undo: { kind: "weavero", label: "Add Outline Entry", at: 3 }, redo: { kind: "weavero", label: "Add Outline Entry", at: 3 } };
            assert.isTrue(key("z"), "Mod-Z, Weavero's newest step: taken");
            assert.isTrue(key("z", true), "Mod-Shift-Z: taken");
            assert.deepEqual(ran, ["undo", "redo"]);
            // Without Zotero's history (Zotero 10, 11 beta.5): Mod-Z is the reader's own (wrapped) undo.
            reader._internalReader._externalUndoHistory = false;
            ran.length = 0;
            assert.isFalse(key("z"), "Mod-Z without #6021: not taken here");
            if (Zotero.isWin) { assert.isTrue(key("y"), "Ctrl+Y on Windows: Weavero's redo, as before"); assert.deepEqual(ran, ["redo"]); }
        }
        finally {
            reader._internalReader._externalUndoHistory = true;
            if (!had) { try { wv._wvUnwireReaderRedoKey(win); } catch (e) {} }
        }
    });
});
