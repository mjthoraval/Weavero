/* global describe, it, before, beforeEach, after, assert, Zotero */

// Edit > Undo / Redo for the tab's history (MJT 2026-09-30: "I do not see
// the Undo option active from the Edit menu after deleting an outline
// item"; 2026-10-01: one merged choice per tab). Zotero 10's UndoHistory
// controller leaves the items disabled while focus is in a reader iframe;
// Weavero owns them for the length of the popup when the selected reader's
// tab has history, and puts them back on popuphidden. Synthetic popupshowing
// / popuphidden reach the JS listeners without opening the menu; the route
// and the choice are stubbed.

describe("Weavero — Edit menu Undo/Redo for the tab's history", () => {
    let wv, win, doc, popup, undo, redo, origRoute, origChoice, origRun;
    const fire = (type, target) => { const ev = new win.Event(type, { bubbles: true }); target.dispatchEvent(ev); return ev; };
    const state = (mi) => ({
        label: mi.getAttribute("label"), disabled: mi.getAttribute("disabled"), command: mi.getAttribute("command"),
        l10n: mi.getAttribute("data-l10n-id"), wv: mi.getAttribute("data-wv-undo"),
    });
    const plain = dir => { try { return String(/** @type {any} */ (Zotero).ftl.formatValueSync("menu-edit-" + dir + "-action", { action: "" })).trim(); } catch (e) { return dir === "undo" ? "Undo" : "Redo"; } };
    const reader = { fake: true }, idoc = {};
    const tabRoute = () => ({ reader, idoc });
    // The choice stub: {undo, redo} -> a label (Weavero step), "" (the reader's own, no words), or null.
    let choice = { undo: null, redo: null };
    const choiceStub = (r, dir) => (choice[dir] === null ? null : { kind: choice[dir] === "" ? "reader" : "weavero", label: choice[dir] || null, at: 1 });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow(); doc = win.document;
        popup = doc.getElementById("menu_EditPopup"); undo = doc.getElementById("menu_undo"); redo = doc.getElementById("menu_redo");
        if (!wv || !popup || !undo || !redo || !popup._wvUndoMenuH) this.skip();
        origRoute = wv._wvEditUndoRoute; origChoice = wv._wvTabUndoChoice; origRun = wv._wvTabUndoRedo;
    });

    // The restore is DEFERRED past popuphidden (XUL delivers the clicked
    // item's command after the hide), so tests wait for it.
    const wait = ms => new Promise(r => win.setTimeout(r, ms));
    const hide = async () => { fire("popuphidden", popup); await wait(120); };
    // Every case starts from a restored menu and the real functions: a failed
    // assertion must not leave the next case with an owned item or a stub.
    // Zotero's OWN undo history must start empty: earlier specs in a full run
    // save items, and with an entry there Zotero's Edit-menu handler drops
    // the item's Fluent id and enables it (standalone.js
    // _updateUndoRedoLabels), which made these cases fail only in the full
    // suite (2026-10-01, the issue-48 merge run). The runner's temp profile
    // owns that history, so clearing it is safe.
    beforeEach(async () => {
        try { const UH = /** @type {any} */ (Zotero).UndoHistory; if (UH && typeof UH.clear === "function") UH.clear(); } catch (e) {}
        await hide(); wv._wvEditUndoRoute = origRoute; wv._wvTabUndoChoice = origChoice; wv._wvTabUndoRedo = origRun; choice = { undo: null, redo: null };
    });

    after(async () => {
        if (!wv) return;
        wv._wvEditUndoRoute = origRoute; wv._wvTabUndoChoice = origChoice; wv._wvTabUndoRedo = origRun;
        await hide();
    });

    it("with tab history and Zotero's items disabled: relabelled, enabled, routed to the tab's undo; restored on hide", async () => {
        const ran = [];
        wv._wvEditUndoRoute = tabRoute;
        wv._wvTabUndoChoice = choiceStub;
        wv._wvTabUndoRedo = async (r, d, dir) => { ran.push(dir); return "x"; };
        choice = { undo: "Add Outline Entry", redo: null };
        const redoLabelBefore = redo.getAttribute("label");   // whatever the locale says ("Redo", "Rétablir"...)
        undo.setAttribute("disabled", "true"); redo.setAttribute("disabled", "true");
        fire("popupshowing", popup);   // Zotero's own handler runs first and re-disables both; then Weavero
        const u = state(undo), r = state(redo);
        assert.strictEqual(u.label, plain("undo") + " Add Outline Entry"); assert.isNull(u.disabled); assert.isNull(u.command); assert.isNull(u.l10n); assert.strictEqual(u.wv, "undo");
        // Nothing to redo in the TAB: the item is still ours -- the plain word,
        // greyed, never the library's own redo (MJT 2026-09-30).
        assert.strictEqual(r.label, plain("redo"), "plain word"); assert.strictEqual(r.disabled, "true"); assert.isNull(r.command); assert.strictEqual(r.wv, "redo");
        // A synthetic "command" event reaches no listener on a XUL menuitem
        // (measured 2026-09-30, enabled or not), so the activation is the
        // stored handler itself -- what the real command event would call.
        assert.isFunction(undo._wvUndoCmdH, "activation handler installed");
        undo._wvUndoCmdH({ stopPropagation() {} });
        assert.deepEqual(ran, ["undo"], "the activation reached the tab's undo, not cmd_undo");
        const labelBefore = undo._wvUndoSaved && undo._wvUndoSaved.label;
        fire("popuphidden", popup);
        assert.isFunction(undo._wvUndoCmdH, "right after the hide the handler is STILL there (the command arrives after the hide)");
        await wait(120);
        const u2 = state(undo), r2 = state(redo);
        assert.strictEqual(u2.command, "cmd_undo"); assert.strictEqual(u2.disabled, "true"); assert.isNull(u2.wv);
        assert.strictEqual(u2.l10n, "text-action-undo", "Fluent id back");
        assert.strictEqual(u2.label, labelBefore, "Zotero's label back at once, not only after a re-translation");
        assert.isUndefined(undo._wvUndoCmdH, "after restore the item no longer reaches Weavero");
        assert.strictEqual(r2.command, "cmd_redo"); assert.strictEqual(r2.label, redoLabelBefore); assert.isNull(r2.wv);
    });

    it("an item Zotero enabled (a text controller) is never touched; no reader behind the tab = nothing", async () => {
        wv._wvEditUndoRoute = tabRoute;
        wv._wvTabUndoChoice = choiceStub;
        choice = { undo: "Add Outline Entry", redo: null };
        // A real popupshowing lets Zotero's handler re-disable the item first
        // (no text controller has focus here), so call Weavero's step directly
        // with the item as a text controller would leave it: enabled.
        undo.removeAttribute("disabled");
        try {
            wv._wvEditUndoMenuApply(win, popup);
            assert.isNull(undo.getAttribute("data-wv-undo"), "enabled by Zotero: left alone");
            assert.strictEqual(undo.getAttribute("command"), "cmd_undo");
        }
        finally { undo.setAttribute("disabled", "true"); }
        wv._wvEditUndoRoute = () => null;
        fire("popupshowing", popup);
        assert.isNull(undo.getAttribute("data-wv-undo"), "no reader: left alone");
        assert.strictEqual(undo.getAttribute("disabled"), "true");
        await hide();
    });

    it("the reader's own history shows in words when its point has them, the plain word otherwise; the activation runs the tab's choice", async () => {
        const ran = [];
        wv._wvEditUndoRoute = tabRoute;
        wv._wvTabUndoChoice = choiceStub;
        wv._wvTabUndoRedo = async (r, d, dir) => { ran.push(dir); return "x"; };
        choice = { undo: "Add Annotation", redo: "" };
        undo.setAttribute("disabled", "true"); redo.setAttribute("disabled", "true");
        fire("popupshowing", popup);
        assert.strictEqual(undo.getAttribute("label"), plain("undo") + " Add Annotation", "the reader's point in words");
        assert.isNull(undo.getAttribute("disabled")); assert.strictEqual(undo.getAttribute("data-wv-undo"), "undo");
        assert.strictEqual(redo.getAttribute("label"), plain("redo"), "a point without words: the plain word, enabled");
        assert.isNull(redo.getAttribute("disabled")); assert.strictEqual(redo.getAttribute("data-wv-undo"), "redo");
        redo._wvUndoCmdH({ stopPropagation() {} });
        assert.deepEqual(ran, ["redo"], "the tab's redo ran");
        await hide();
    });

    it("the route is the window's current reader and its document; no reader = null", () => {
        const idocR = { fake: "idoc" };
        const rd = { _iframeWindow: { document: idocR } };
        assert.deepEqual(wv._wvEditUndoRoute(win, rd), { reader: rd, idoc: idocR });
        assert.isNull(wv._wvEditUndoRoute(win, { _iframeWindow: null }), "a reader without a document");
        assert.isNull(wv._wvEditUndoRoute({ Zotero_Tabs: { selectedID: "tab-none-such" } }), "no reader: Zotero keeps the items");
    });

    it("the reader a window's Edit menu refers to: selected tab in a main window, active strip tab in a reader window", () => {
        const main = { Zotero_Tabs: { selectedID: "tab-none-such" } };
        assert.isNull(wv._wvUndoCurrentReader(main), "no reader behind the selected tab");
        const r1 = { a: 1 }, r2 = { b: 2 };
        const rw = { _wvWT: { activeId: "t2", tabs: [{ id: "t1", reader: r1 }, { id: "t2", reader: r2 }] } };
        assert.strictEqual(wv._wvUndoCurrentReader(rw), r2, "the active strip tab's reader");
        assert.isNull(wv._wvUndoCurrentReader({ _wvWT: { activeId: "t9", tabs: [] } }), "unknown active tab, no reader of this window");
    });

    it("a submenu's popupshowing bubbling through the Edit popup is ignored", () => {
        wv._wvEditUndoRoute = tabRoute;
        wv._wvTabUndoChoice = choiceStub;
        choice = { undo: "Add Outline Entry", redo: null };
        undo.setAttribute("disabled", "true");
        const sub = doc.createXULElement("menupopup");
        popup.appendChild(sub);
        try {
            fire("popupshowing", sub);
            assert.isNull(undo.getAttribute("data-wv-undo"), "not our popup's own showing");
        }
        finally { sub.remove(); }
    });
});
