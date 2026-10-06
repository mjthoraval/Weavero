/* global describe, it, before, after, assert, Zotero, Components, Services */

// One undo choice per TAB (MJT 2026-10-01, slice 2): the stacks stay per
// pane, the choice merges the stacks of the panes VISIBLE in the tab -- the
// outline's when the Outline tab is selected, the bookmark stores' when the
// Bookmarks tab is (per the pane's scope toggle), the reader's own
// annotation history always -- and the most recent action wins. Every
// entry point (keys in either pane, the page's wrapped reader undo, the Edit
// menu, the History menu) runs that choice. Fake reader objects over a real
// HTML document; the real reader's instance is a plain same-compartment
// object, so the same own-property wrap applies there.

describe("Weavero — tab-level undo choice", () => {
    let wv, origAtt, origScope, origRun, origActivate, origSetBm;
    const att = { libraryID: 1, itemKey: "WVTABCHOICE" };
    let scopeO, scopeD, scopeL, idoc, sc;
    const calls = [];
    const mkReader = (opts = {}) => {
        const undo = [], redo = [];
        const am = { _undoStack: undo, _redoStack: redo, _lastChange: 0, get canUndo() { return !!undo.length; }, get canRedo() { return !!redo.length; } };
        const ir = {
            _state: { sidebarOpen: true },
            _annotationManager: am,
            undo() { calls.push("rd-undo"); const p = undo.pop(); if (!p) return false; redo.push(p); return true; },
            redo() { calls.push("rd-redo"); const p = redo.pop(); if (!p) return false; undo.push(p); return true; },
        };
        return { _internalReader: ir, _iframeWindow: { document: opts.doc || idoc } };
    };

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvTabUndoChoice !== "function") this.skip();
        origAtt = wv._wvReaderAtt; origScope = wv._wvReaderBmScope; origRun = wv._wvUndoRun;
        origActivate = wv._wvReaderActivateOutlineTakeover; origSetBm = wv._wvReaderSetBmActive;
        wv._wvReaderAtt = () => att;
        wv._wvReaderBmScope = () => "document";
        wv._wvUndoRegisterType("spec.noop", { undo() {}, redo() {} });
        scopeO = wv._wvOutlineUndoScope(att);
        scopeD = wv._wvBmUndoScope("rb:" + att.libraryID + ":" + att.itemKey);
        scopeL = wv._wvBmUndoScope("lib");
        for (const s of [scopeO, scopeD, scopeL]) wv._wvUndoClear(s);
        idoc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-tab-choice");
        sc = idoc.createElement("div"); sc.id = "sidebarContainer"; idoc.body.appendChild(sc);
        const ov = idoc.createElement("div"); ov.className = "wv-outline-reader-view"; sc.appendChild(ov);
        const bv = idoc.createElement("div"); bv.className = "wv-bm-reader-view"; sc.appendChild(bv);
    });

    after(() => {
        if (!wv) return;
        wv._wvReaderAtt = origAtt; wv._wvReaderBmScope = origScope; wv._wvUndoRun = origRun;
        wv._wvReaderActivateOutlineTakeover = origActivate; wv._wvReaderSetBmActive = origSetBm;
        for (const s of [scopeO, scopeD, scopeL]) wv._wvUndoClear(s);
    });

    it("the scopes are ALL the tab's panes, whichever sidebar tab shows; the library bookmarks only while the pane shows them", () => {
        const reader = mkReader();
        const all = () => wv._wvTabUndoScopes(reader, idoc).map(s => s.scope);
        // MJT 2026-10-02: hidden panes' steps are in the merge too.
        for (const cls of ["", "wv-outline-tab-on", "wv-bm-tab-on"]) {
            sc.className = cls;
            assert.deepEqual(all(), [scopeO, scopeD], "document scope, sidebar tab '" + (cls || "Annotations") + "'");
        }
        wv._wvReaderBmScope = () => "library";
        assert.deepEqual(all(), [scopeO, scopeD, scopeL], "library scope adds the library's history");
        wv._wvReaderBmScope = () => "both";
        assert.deepEqual(all(), [scopeO, scopeD, scopeL], "both");
        wv._wvReaderBmScope = () => "document";
        reader._internalReader._state.sidebarOpen = false;
        assert.deepEqual(all(), [scopeO, scopeD], "a collapsed sidebar changes nothing");
        assert.deepEqual(wv._wvTabUndoScopes(reader, idoc).map(s => s.pane), ["outline", "bookmarks"], "each scope knows its pane (for the reveal)");
    });

    it("chooses by recency across all the tab's panes and the reader's history, whichever sidebar tab shows", async () => {
        const reader = mkReader(); const am = reader._internalReader._annotationManager;
        sc.className = "wv-outline-tab-on";
        assert.isNull(wv._wvTabUndoChoice(reader, "undo"), "nothing anywhere");
        wv._wvUndoPush(scopeO, { label: "Add Outline Entry", type: "spec.noop" });
        let ch = wv._wvTabUndoChoice(reader, "undo");
        assert.deepEqual([ch.kind, ch.scope, ch.label], ["weavero", scopeO, "Add Outline Entry"]);
        // A reader point made AFTER the entry wins.
        am._undoStack.push({ id: 1, revision: 0, action: "add-annotations", count: 1, _wvAt: Date.now() + 5000 });
        ch = wv._wvTabUndoChoice(reader, "undo");
        assert.deepEqual([ch.kind, ch.label], ["reader", "Add Annotation"], "the reader's change is newer, and has words");
        am._undoStack[0]._wvAt = Date.now() - 5000;
        assert.strictEqual(wv._wvTabUndoChoice(reader, "undo").kind, "weavero", "...or older");
        // An unstamped point falls back to the manager's _lastChange.
        delete am._undoStack[0]._wvAt; am._lastChange = Date.now() + 5000;
        assert.strictEqual(wv._wvTabUndoChoice(reader, "undo").kind, "reader");
        am._lastChange = 0;
        // The Bookmarks tab selected: the outline stack STAYS reachable
        // (MJT 2026-10-02 -- all panes merge).
        sc.className = "wv-bm-tab-on";
        ch = wv._wvTabUndoChoice(reader, "undo");
        assert.deepEqual([ch.kind, ch.scope], ["weavero", scopeO], "the hidden outline's step is still the newest");
        wv._wvUndoPush(scopeD, { label: "Delete Bookmark", type: "spec.noop" });
        ch = wv._wvTabUndoChoice(reader, "undo");
        assert.deepEqual([ch.kind, ch.scope, ch.label], ["weavero", scopeD, "Delete Bookmark"], "the bookmark step is the newest");
        // Redo: the undone side's stamps.
        await wv._wvUndo(scopeD);   // moves to redo, undoneAt = now
        assert.strictEqual(wv._wvTabUndoChoice(reader, "redo").scope, scopeD);
        am._undoStack.pop(); am._redoStack.push({ id: 1, revision: 0, action: "delete-annotations", count: 2, _wvUndoneAt: Date.now() + 5000 });
        ch = wv._wvTabUndoChoice(reader, "redo");
        assert.deepEqual([ch.kind, ch.label], ["reader", "Delete 2 Annotations"], "the reader undid later");
        am._redoStack.length = 0;
        for (const s of [scopeO, scopeD]) wv._wvUndoClear(s);
        assert.isNull(wv._wvTabUndoChoice(reader, "redo"));
    });

    it("an annotation edit names the one field it changed (MJT 2026-10-05: 'Edit Annotation Comment')", () => {
        const pt = (befores) => ({ id: 9, revision: 0, action: "update-annotations", count: befores.length, annotations: new Map(befores.map(b => [b.id, b])) });
        const am = (afters) => ({ _annotations: afters });
        const hl = { id: "A", type: "highlight", comment: "old", color: "#ffd400", tags: [], position: { pageIndex: 0, rects: [[1, 2, 3, 4]] }, dateModified: "t0" };
        assert.strictEqual(wv._wvReaderPointField(am([{ ...hl, comment: "new", dateModified: "t1" }]), pt([hl])), "Comment");
        assert.strictEqual(wv._wvReaderPointField(am([{ ...hl, color: "#ff6666" }]), pt([hl])), "Color");
        assert.isNull(wv._wvReaderPointField(am([{ ...hl, color: "#ff6666", comment: "new" }]), pt([hl])), "two fields: no name");
        const note = { ...hl, id: "N", type: "text" };
        assert.strictEqual(wv._wvReaderPointField(am([{ ...note, comment: "new", position: { pageIndex: 0, rects: [[1, 2, 9, 9]] } }]), pt([note])),
            "Comment", "a text box refitted by its comment edit is still a comment edit");
        const B = { ...hl, id: "B" };
        assert.strictEqual(wv._wvReaderPointField(am([{ ...hl, color: "#5fb236" }, { ...B, color: "#5fb236" }]), pt([hl, B])), "Color");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "Comment" }), "Edit Annotation Comment");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 2, _wvField: "Color" }), "Change Color of 2 Annotations");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1 }), "Edit Annotation", "unknown: as before");
        // Geometry (MJT 2026-10-06, "Undo Resize Annotation"): a resized
        // highlight changes its position AND its text -- still one gesture.
        const rz = { ...hl, text: "a b", position: { pageIndex: 0, rects: [[1, 2, 3, 4]] } };
        assert.strictEqual(wv._wvReaderPointField(am([{ ...rz, text: "a b c", position: { pageIndex: 0, rects: [[1, 2, 6, 4]] }, sortIndex: "x" }]), pt([rz])), "@Resize");
        assert.strictEqual(wv._wvReaderPointField(am([{ ...rz, position: { pageIndex: 0, rects: [[5, 6, 7, 8]] } }]), pt([rz])), "@Move", "same size elsewhere");
        // The annotations' type names the step (MJT 2026-10-06).
        assert.strictEqual(wv._wvReaderPointType(am([hl]), { annotations: new Map([["A", null]]) }), "highlight", "an add: the type from the current state");
        assert.isNull(wv._wvReaderPointType(am([]), { annotations: new Map([["A", hl], ["N", note]]) }), "mixed types: none");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "@Resize", _wvType: "highlight" }), "Resize Highlight Annotation");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "@Move", _wvType: "note" }), "Move Note Annotation");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "Comment", _wvType: "highlight" }), "Edit Highlight Annotation Comment");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "Comment", _wvType: "text" }), "Edit Text Annotation");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "update-annotations", count: 1, _wvField: "Color", _wvType: "underline" }), "Change Underline Annotation Color");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "add-annotations", count: 3, _wvType: "highlight" }), "Add 3 Highlight Annotations");
        assert.strictEqual(wv._wvReaderPointLabel({ action: "delete-annotations", count: 1, _wvType: "image" }), "Delete Image Annotation");
    });

    // Issue #53 (traced live 2026-10-06): the reader calls its undo() from
    // ITS compartment; the wrapper handed the reader's own undo a rest array
    // made in the plugin's, and `apply` reading `args.length` across the
    // boundary threw "Permission denied" -- Ctrl/Cmd+Z did nothing in the
    // page. The stand-in reader above lives in the plugin's compartment and
    // could never see it: this one is built in a less privileged sandbox and
    // calls the wrapped undo() from inside it, as the keyboard manager does.
    it("the wrapped reader undo runs when called from the reader's own (less privileged) compartment", () => {
        const Cu = Components.utils;
        const sb = Cu.Sandbox(Services.scriptSecurityManager.createContentPrincipalFromOrigin("https://reader.invalid"), { wantXrays: false });
        Cu.evalInSandbox(`
            var am = { _undoStack: [{ id: 1, action: "add-annotations", count: 1, annotations: new Map() }], _redoStack: [], _annotations: [],
                undo() { var p = this._undoStack.pop(); if (!p) return false; this._redoStack.push(p); return true; } };
            var ir = { _state: {}, _annotationManager: am,
                undo() { return this._annotationManager.undo(); }, redo() { return false; } };
            var pressCtrlZ = function () { return ir.undo(); };
        `, sb);
        const ir = Cu.waiveXrays(Cu.evalInSandbox("ir", sb));
        const reader = { _internalReader: ir, _iframeWindow: { document: idoc } };
        wv._wvReaderWrapUndo(reader);
        let r, err = null;
        try { r = Cu.evalInSandbox("pressCtrlZ()", sb); } catch (e) { err = String(e); }
        try { wv._wvReaderUnwrapUndo(reader); } catch (_) {}
        assert.isNull(err, "the call from the reader's side must not throw");
        assert.isTrue(r, "the reader's own undo ran");
        assert.strictEqual(Cu.evalInSandbox("am._redoStack.length", sb), 1);
    });

    // 2026-10-06, shipped in 0.21.7: the Edit-menu wiring's FIRST pass (a
    // fresh start or reload) unwires stale handlers -- and that removed the
    // reader's Ctrl+Y listener wired just before it, so Ctrl+Y did nothing
    // after every normal start. The state of a fresh start: menu never wired.
    it("the reader's Ctrl+Y listener survives the Edit menu's first wiring (Windows)", function () {
        if (!Zotero.isWin) this.skip();
        const w = Zotero.getMainWindow();
        const popup = /** @type {any} */ (w.document.getElementById("menu_EditPopup"));
        if (!popup) this.skip();
        wv._wvUnwireEditUndoMenu(w);              // as after a teardown: nothing wired
        assert.notOk(w._wvRedoKeyH, "precondition: no Ctrl+Y listener");
        wv._wvWireEditUndoMenu(w);                // the startup call
        assert.isOk(popup._wvUndoMenuH, "the Edit menu is wired");
        assert.isOk(w._wvRedoKeyH, "and the Ctrl+Y listener with it");
        const listed = (Services.els.getListenerInfoFor(w) || []).some(i => i.type === "keydown" && i.capturing && i.listenerObject === w._wvRedoKeyH);
        assert.isTrue(listed, "registered on the window, not just remembered");
    });

    // MJT 2026-10-06: a comment edit read "Undo Edit Annotation". The reader
    // announces a point (_historySave) BEFORE writing the new values
    // (_applyChanges), so the field must be read a microtask later.
    it("an edit's field is read after the reader has applied the change", async () => {
        const reader = mkReader(); const am = reader._internalReader._annotationManager;
        const hl = { id: "A", type: "highlight", comment: "old", color: "#ffd400", position: { pageIndex: 0, rects: [[1, 2, 3, 4]] } };
        am._annotations = [hl];
        wv._wvReaderStampHistory(reader);
        // What _applyChanges does: push + announce, THEN write the values.
        am._undoStack.push({ id: 7, revision: 0, action: "update-annotations", count: 1, annotations: new Map([["A", { ...hl }]]) });
        am._onChangeHistory({});
        am._annotations = [{ ...hl, comment: "new" }];
        await Promise.resolve(); await Promise.resolve();
        const top = am._undoStack[am._undoStack.length - 1];
        assert.strictEqual(top._wvField, "Comment");
        assert.strictEqual(wv._wvReaderPointLabel(top), "Edit Highlight Annotation Comment");
    });

    it("the reader's points are stamped as they appear, through the manager's unused onChangeHistory callback", () => {
        const reader = mkReader(); const am = reader._internalReader._annotationManager;
        am._undoStack.push({ id: 1, revision: 0, action: "add-annotations", count: 1 }, { id: 2, revision: 0, action: "update-annotations", count: 1 });
        am._lastChange = 1234;
        wv._wvReaderStampHistory(reader);
        assert.isFunction(am._onChangeHistory, "callback installed");
        assert.deepEqual(am._undoStack.map(p => p._wvAt), [0, 1234], "points already there: the top keeps _lastChange, older ones read as oldest");
        const before = Date.now();
        am._undoStack.push({ id: 3, revision: 0, action: "delete-annotations", count: 1 });
        am._onChangeHistory({});   // what the manager calls after a push
        assert.isAtLeast(am._undoStack[2]._wvAt, before, "a new point is stamped now");
        am._undoStack[2].revision = 1; const t2 = am._undoStack[2]._wvAt;
        am._onChangeHistory({});
        assert.isAtLeast(am._undoStack[2]._wvAt, t2, "a joined change re-stamps");
        am._redoStack.push(am._undoStack.pop()); am._onChangeHistory({});
        assert.isAtLeast(am._redoStack[0]._wvUndoneAt, before, "undone: stamped on the redo side");
        wv._wvReaderStampHistory(reader);
        assert.strictEqual(am._onChangeHistory._wvTag, wv._wvWireTag(), "idempotent for the same instance");
        wv._wvReaderUnstampHistory(reader);
        assert.isUndefined(am._onChangeHistory, "removed on teardown");
        // Zotero's own callback (PR #6021, _externalUndoHistory) is never replaced.
        reader._internalReader._externalUndoHistory = true;
        wv._wvReaderStampHistory(reader);
        assert.isUndefined(am._onChangeHistory, "left alone when Zotero owns the history");
    });

    it("the wrapped reader undo runs the tab's newer Weavero step, else the reader's own; the reader's own step is noted", async () => {
        const reader = mkReader(); const ir = reader._internalReader; const am = ir._annotationManager;
        sc.className = "wv-outline-tab-on";
        const ran = [];
        wv._wvUndoRun = async (scope, dir) => { ran.push(scope + ":" + dir); return "stub"; };
        const origUndo = ir.undo;
        wv._wvReaderWrapUndo(reader);
        assert.notStrictEqual(ir.undo, origUndo, "wrapped");
        wv._wvUndoPush(scopeO, { label: "Add Outline Entry", type: "spec.noop" });
        calls.length = 0;
        assert.isTrue(ir.undo(), "Weavero's step is newer: handled");
        await new Promise(r => setTimeout(r, 10));
        assert.deepEqual([ran, calls], [[scopeO + ":undo"], []], "the tab's choice ran; the reader's own did not");
        am._undoStack.push({ id: 1, revision: 0, action: "add-annotations", count: 1, _wvAt: Date.now() + 5000 });
        calls.length = 0; ran.length = 0;
        assert.isTrue(ir.undo(), "the reader's change is newer: its own undo ran");
        assert.deepEqual([ran, calls], [[], ["rd-undo"]]);
        assert.isAbove(ir._wvReaderUndoneAt || 0, 0, "stamped for redo decisions");
        const note = idoc.querySelector(".wv-readingmode-note");
        assert.ok(note && /Undone: Add Annotation/.test(note.textContent), "the reader's own step is made visible on the strip");
        // Zotero owning the history (PR #6021): the wrap is peeled.
        ir._externalUndoHistory = true;
        wv._wvReaderWrapUndo(reader);
        assert.strictEqual(ir.undo, origUndo, "unwrapped when the reader reports to Zotero");
        delete ir._externalUndoHistory;
        wv._wvUndoClear(scopeO);
    });

    it("_wvTabUndoRedo reveals the pane, runs the choice and notes it; a pick runs one independent step alone", async () => {
        const reader = mkReader();
        sc.className = "";   // no Weavero pane selected...
        wv._wvUndoRun = origRun;
        const revealed = [];
        wv._wvReaderActivateOutlineTakeover = (r, d, on) => { revealed.push("outline:" + on); d.getElementById("sidebarContainer").classList.add("wv-outline-tab-on"); };
        wv._wvReaderSetBmActive = (r, d, on) => { revealed.push("bm:" + on); };
        assert.isNull(await wv._wvTabUndoRedo(reader, idoc, "undo"), "nothing to do");
        sc.className = "wv-outline-tab-on";
        reader._internalReader._state.sidebarOpen = false;
        let toggled = 0; reader._internalReader.toggleSidebar = (on) => { toggled++; reader._internalReader._state.sidebarOpen = !!on; };
        wv._wvUndoRegisterType("spec.ids", { undo() {}, redo() {}, ids: d => d.ids });
        wv._wvUndoPush(scopeO, { label: "Add Outline Entry", type: "spec.ids", data: { ids: ["a"] } });
        wv._wvUndoPush(scopeO, { label: "Delete Outline Entry", type: "spec.ids", data: { ids: ["b"] } });
        const first = wv._wvUndoList(scopeO, "undo")[1];   // the older step, below the top
        assert.isTrue(first.independent, "touches other entries than the step above it");
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "undo", { scope: scopeO, stepId: first.id }), "Add Outline Entry", "the picked step ran alone");
        assert.strictEqual(toggled, 1, "a collapsed sidebar was reopened (visible undo)");
        assert.deepEqual(wv._wvUndoPeek(scopeO), { undo: "Delete Outline Entry", redo: "Add Outline Entry" }, "the later step stayed; the picked one is redoable");
        const note = idoc.querySelector(".wv-readingmode-note");
        assert.ok(note && note.textContent === "Undone: Add Outline Entry", "noted on the strip");
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "undo"), "Delete Outline Entry", "plain: the top");
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "redo"), "Delete Outline Entry", "redo: the most recently undone");
        wv._wvUndoClear(scopeO);
        // The reader toolbar's Undo / Redo buttons (Acrobat-style, MJT
        // 2026-10-01): after the page-number group behind a divider, greyed
        // with the plain word when nothing can be done, titled with the
        // choice, right-click = the History menu.
        {
            wv._wvUndoClear(scopeO);   // the context-menu block above left a redo step
            const tb = idoc.createElement("div"); tb.className = "toolbar"; idoc.body.appendChild(tb);
            const startSec = idoc.createElement("div"); startSec.className = "start"; tb.appendChild(startSec);
            const start = idoc.createElement("div"); start.className = "center"; tb.appendChild(start);   // the tools group hosts the arrows
            const ink = idoc.createElement("button"); ink.className = "toolbar-button ink"; start.appendChild(ink);
            wv._wvReaderEnsureUndoButtons(reader, idoc);
            const kids = () => [...start.children].map(c => c.className.replace(/\s+/g, ".") + (c.getAttribute("data-wv-undo") ? "[" + c.getAttribute("data-wv-undo") + "]" : ""));
            assert.deepEqual(kids(), ["toolbar-button.ink", "divider.wv-undo-divider[divider]", "toolbar-button.wv-undo-btn.wv-undo-off[undo]", "toolbar-button.wv-undo-btn.wv-undo-off[redo]"], "after the tools, in the centre group; greyed by class");
            assert.strictEqual(startSec.children.length, 0, "nothing in the start section (its page count overflows)");
            const ub = start.querySelector("[data-wv-undo='undo']"), rb = start.querySelector("[data-wv-undo='redo']");
            const off = (b) => b.classList.contains("wv-undo-off") && b.getAttribute("aria-disabled") === "true";
            assert.ok(off(ub) && off(rb), "nothing to do: greyed");
            assert.isFalse(ub.hasAttribute("disabled"), "never the disabled attribute: it would swallow the right-click");
            // Right-click on a greyed arrow still opens the history (MJT 2026-10-01).
            rb.dispatchEvent(new (idoc.defaultView || Zotero.getMainWindow()).Event("contextmenu", { bubbles: true, cancelable: true }));
            assert.deepEqual([...idoc.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent), ["History"], "the menu opens from a greyed arrow");
            assert.deepEqual([...idoc.querySelectorAll(".wv-ctx-item")].map(it => it.classList.contains("wv-ctx-off")), [true, true], "Undo and Redo greyed, no lists");
            // The toolbar's empty space is a window drag area that swallows
            // clicks; while the menu is open it is no-drag, so a click there
            // dismisses the menu (MJT 2026-10-01).
            assert.strictEqual(tb.style.getPropertyValue("-moz-window-dragging"), "no-drag", "toolbar not draggable while the menu is open");
            wv._wvCloseReaderBmContextMenu(idoc);
            assert.strictEqual(tb.style.getPropertyValue("-moz-window-dragging"), "", "dragging back after the close");
            assert.ok(ub.title.startsWith(wv._wvUndoPlainWord("undo") + " ("), "plain word");
            // A push fans out to the registered readers' toolbars through
            // _wvUndoAfterChange; this fake reader is not registered, so the
            // refresh is called directly.
            wv._wvUndoPush(scopeO, { label: "Add Outline Entry", type: "spec.ids", data: { ids: ["t"] } });
            wv._wvUndoButtonsRefresh(reader, idoc);
            assert.isFalse(off(ub), "enabled after a step");
            assert.ok(ub.title.startsWith(wv._wvUndoPlainWord("undo") + " Add Outline Entry (" + wv._wvNativeEditAccel("undo") + ")"), ub.title);
            wv._wvReaderEnsureUndoButtons(reader, idoc);
            assert.strictEqual(start.querySelectorAll(".wv-undo-btn").length, 2, "idempotent");
            ub.dispatchEvent(new (idoc.defaultView || Zotero.getMainWindow()).Event("click", { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 20));
            assert.deepEqual(wv._wvUndoPeek(scopeO), { undo: null, redo: "Add Outline Entry" }, "click = the tab's undo");
            wv._wvUndoButtonsRefresh(reader, idoc);
            assert.ok(off(ub) && !off(rb), "state follows the run");
            // The arrow dedups contextmenu + auxclick of one real right-click
            // within 300 ms; the greyed-arrow right-click above was on this
            // same button, so wait it out.
            await new Promise(r => setTimeout(r, 350));
            const ctx = new (idoc.defaultView || Zotero.getMainWindow()).Event("contextmenu", { bubbles: true, cancelable: true });
            rb.dispatchEvent(ctx);
            assert.deepEqual([...idoc.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent), ["History"], "right-click: the History menu");
            wv._wvCloseReaderBmContextMenu(idoc);
            // Settings → Extras → Undo (MJT 2026-10-02): the pref hides and
            // brings back the arrows.
            const prevPref = Zotero.Prefs.get("weavero.readerUndoButtons");
            try {
                Zotero.Prefs.set("weavero.readerUndoButtons", false);
                wv._wvReaderEnsureUndoButtons(reader, idoc);
                assert.strictEqual(start.querySelectorAll("[data-wv-undo]").length, 0, "pref off: no arrows, no divider");
                Zotero.Prefs.set("weavero.readerUndoButtons", true);
                wv._wvReaderEnsureUndoButtons(reader, idoc);
                assert.strictEqual(start.querySelectorAll(".wv-undo-btn").length, 2, "pref on: back");
            }
            finally { Zotero.Prefs.set("weavero.readerUndoButtons", prevPref !== false); }
            wv._wvReaderRemoveUndoButtons(idoc);
            assert.strictEqual(start.querySelectorAll(".wv-undo-btn, .wv-undo-divider").length, 0, "teardown");
            tb.remove();
            wv._wvUndoClear(scopeO);
        }
        // The merged list orders Weavero steps and reader points together, newest first.
        const am = reader._internalReader._annotationManager;
        wv._wvUndoPush(scopeO, { label: "Add Outline Entry", type: "spec.ids", data: { ids: ["a"] } });
        am._undoStack.push({ id: 1, revision: 0, action: "add-annotations", count: 1, _wvAt: Date.now() + 5000 });
        const list = wv._wvTabUndoList(reader, idoc, 12);
        assert.deepEqual(list.map(r => r.kind + ":" + r.label), ["reader:Add Annotation", "weavero:Add Outline Entry"]);
        assert.deepEqual(list.map(r => r.independent), [true, true], "the reader's top point and a scope's top step can each run alone");
        // Annotation steps depend on each other only through the annotations
        // they touched (each point maps annotation id -> state before;
        // MJT 2026-10-02: "does not need to undo all the preceding ones").
        // A deeper point on OTHER annotations runs alone: moved to the top,
        // then the reader's own undo.
        am._undoStack.length = 0;
        const pt = (id, action, ids, at) => ({ id, revision: 0, action, count: ids.length, _wvAt: at, annotations: new Map(ids.map(x => [x, { id: x }])) });
        const t0 = Date.now();
        am._undoStack.push(pt(1, "add-annotations", ["A"], t0 - 4000), pt(2, "add-annotations", ["B"], t0 - 3000), pt(3, "update-annotations", ["A"], t0 - 2000));
        wv._wvUndoClear(scopeO);
        const list2 = wv._wvTabUndoList(reader, idoc, 12);
        assert.deepEqual(list2.map(r => r.label + ":" + r.independent), ["Edit Annotation:true", "Add Annotation:true", "Add Annotation:false"], "B's add is free; A's add needs A's later edit");
        assert.deepEqual([...wv._wvTabUndoRequired(reader, idoc, list2, list2[2])], [list2[0].key], "A's add takes only A's edit, not B's add");
        calls.length = 0;
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "undo", { reader: true, pointId: 2 }), "Add Annotation", "B's add alone");
        assert.deepEqual(calls, ["rd-undo"]);
        assert.deepEqual(am._undoStack.map(p => p.id), [1, 3], "B's point left, A's two in place");
        assert.deepEqual(am._redoStack.map(p => p.id), [2], "and it is redoable");
        assert.isNull(await wv._wvTabUndoRedo(reader, idoc, "undo", { reader: true, pointId: 1 }), "A's add is refused alone: its edit is above it");
        assert.deepEqual(am._undoStack.map(p => p.id), [1, 3], "nothing moved by the refusal");
        // The pair goes together through the rows runner, newest first.
        const list3 = wv._wvTabUndoList(reader, idoc, 12);
        const pair = list3.filter(r => r.kind === "reader");
        assert.strictEqual(await wv._wvTabUndoRows(reader, idoc, pair), 2);
        assert.deepEqual(am._undoStack, [], "both undone");
        am._redoStack.length = 0;
        wv._wvUndoClear(scopeO);
    });

    it("an annotation undo / redo opens the Annotations pane, selects what came back and scrolls the view to it", async () => {
        // MJT 2026-10-02: "refocus the annotations pane and move the view to
        // the right place".
        const reader = mkReader(); const ir = reader._internalReader; const am = ir._annotationManager;
        const log = [];
        ir._state.sidebarOpen = false;
        ir.toggleSidebar = (on) => { ir._state.sidebarOpen = !!on; log.push("sidebar:" + on); };
        ir.setSidebarView = (v) => log.push("view:" + v);
        ir._updateState = (s) => log.push("select:" + JSON.stringify(s.selectedAnnotationIDs));
        ir._lastView = { navigate: (loc) => log.push("navigate:" + JSON.stringify(loc)) };
        ir.navigate = (loc) => { log.push("reader-navigate:" + JSON.stringify(loc)); return Promise.resolve(); };
        const tick = () => new Promise(r => setTimeout(r, 30));
        sc.className = "";
        const A = { id: "A", position: { pageIndex: 3 } };
        // Undo of a delete: A comes back -> selected, view on A.
        am._annotations = [];
        am._undoStack.length = 0; am._redoStack.length = 0;
        am._undoStack.push({ id: 7, revision: 0, action: "delete-annotations", count: 1, _wvAt: Date.now(), annotations: new Map([["A", A]]) });
        ir.undo = function () { const p = am._undoStack.pop(); if (!p) return false; am._annotations = [A]; am._redoStack.push({ ...p, annotations: new Map([["A", null]]) }); return true; };
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "undo", { reader: true }), "Delete Annotation");
        await tick();
        assert.deepEqual(log, ["sidebar:true", "view:annotations", 'select:["A"]', 'navigate:{"annotationID":"A"}'], "scroll one tick later, by the view (no re-selection)");
        // Redo of that delete: A goes again -> nothing to select, view on where A was.
        log.length = 0;
        ir.redo = function () { const p = am._redoStack.pop(); if (!p) return false; am._annotations = []; am._undoStack.push({ ...p, annotations: new Map([["A", A]]) }); return true; };
        assert.strictEqual(await wv._wvTabUndoRedo(reader, idoc, "redo", { reader: true }), "Delete Annotation");
        await tick();
        assert.deepEqual(log, ["view:annotations", "select:[]", 'reader-navigate:{"position":{"pageIndex":3}}'], "sidebar already open; the reader's navigate goes to A's place");
        am._undoStack.length = 0; am._redoStack.length = 0;
    });
});
