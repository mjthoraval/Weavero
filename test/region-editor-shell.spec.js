/* global describe, it, before, assert, Zotero */

// The chrome the PDF and the DOM region editors share (reader-panels.ts
// _wvRegionEditorShell; survey 2026-10-06 §4, the two editors' line-for-line
// part merged 2026-10-21): the toolbar, the handles, Escape / Enter on the
// content AND the sidebar document, the per-view registration, the drag
// plumbing. Driven on two real documents (createHTMLDocument) with the
// editor's own commit / cleanup recorded; the two editors checked to open
// through it. test/dom-region-editor.spec.js keeps covering the DOM editor
// end to end.

describe("Weavero — region editor shell: the chrome shared by the PDF and DOM editors", () => {
    let wv, win;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("!wv");
        win = Zotero.getMainWindow();
        for (const m of ["_wvRegionEditorShell", "_wvRegionEditorOpen", "_wvDomRegionEditorOpen"]) assert.isFunction(wv[m], m);
    });

    function rig(opts, p) {
        const doc = win.document.implementation.createHTMLDocument("wv-shell");
        const side = win.document.implementation.createHTMLDocument("wv-shell-side");
        const container = doc.createElement("div");
        doc.body.appendChild(container);
        const pv = {}, commits = [], notes = [];
        let cleaned = 0;
        const orig = wv._wvReaderPanelNote;
        wv._wvReaderPanelNote = (d, t) => notes.push(t);
        let shell;
        try {
            shell = wv._wvRegionEditorShell(side, pv, doc, Object.assign({ editorId: "e1", noteWord: "label" }, opts || {}),
                Object.assign({ container, commit: (w) => commits.push(w), cleanup: () => { cleaned++; } }, p || {}));
        }
        finally { wv._wvReaderPanelNote = orig; }
        return { doc, side, container, pv, commits, notes, cleaned: () => cleaned, shell };
    }
    const key = (d, k) => d.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const btn = (r, label) => [...r.container.querySelectorAll("button")].find(b => b.textContent === label);

    it("builds the bar (Save Region and Text first, Save Region, Cancel; max-content + nowrap), two edge handles with end knobs, registers per view and notes the word", () => {
        const r = rig();
        assert.deepEqual([...r.container.querySelectorAll("button")].map(b => b.textContent), ["Save Region and Text", "Save Region", "Cancel"]);
        assert.strictEqual(r.shell.bar.style.width, "max-content"); assert.strictEqual(r.shell.bar.style.whiteSpace, "nowrap");
        assert.isTrue(r.container.contains(r.shell.bar));
        const knobs = [...r.container.querySelectorAll(".wv-region-knob")];
        assert.lengthOf(knobs, 2);
        assert.strictEqual(knobs[0].parentElement, r.shell.start); assert.strictEqual(knobs[1].parentElement, r.shell.end);
        assert.strictEqual(knobs[0].style.marginTop, "-12px", "start knob ABOVE the line"); assert.strictEqual(knobs[1].style.marginBottom, "-12px", "end knob BELOW");
        for (const h of [r.shell.start, r.shell.end]) { assert.strictEqual(h.style.width, "2px"); assert.strictEqual(h.style.cursor, "ew-resize"); }
        assert.isOk(r.pv._wvRegionEditor && r.pv._wvRegionEditor._id === "e1", "registered on the view");
        assert.isTrue(r.shell.alive());
        assert.lengthOf(r.notes, 1); assert.include(r.notes[0], "reloads the label"); assert.include(r.notes[0], "Enter = Save Region and Text");
        const r2 = rig({ barCss: "" }, { barCss: "transform:translate(0,-125%);" });
        assert.include(r2.shell.bar.style.transform, "-125%", "the editor's extra bar css applies (the PDF bar above its anchor point)");
    });

    it("Enter commits with text and Escape destroys, on the content document AND the sidebar document; destroy runs the cleanup once, drops the keys and the registration", () => {
        const r = rig();
        key(r.side, "Enter"); key(r.doc, "Enter");
        assert.deepEqual(r.commits, [true, true], "Enter = Save Region and Text, from either document");
        assert.isTrue(r.shell.alive());
        key(r.doc, "Escape");
        assert.isFalse(r.shell.alive());
        assert.isFalse(r.doc.body.contains(r.container), "the overlay is gone");
        assert.strictEqual(r.cleaned(), 1, "the editor's cleanup ran");
        assert.isNull(r.pv._wvRegionEditor, "unregistered");
        key(r.side, "Enter"); key(r.doc, "Enter");
        assert.deepEqual(r.commits, [true, true], "the key listeners left with the editor");
        r.shell.destroy();
        assert.strictEqual(r.cleaned(), 1, "destroy is idempotent");
        const r2 = rig();
        key(r2.side, "Escape");
        assert.isFalse(r2.shell.alive(), "Escape typed in the sidebar closes it (2026-09-24)");
    });

    it("the buttons: Save Region commits without text, Save Region and Text with it, Cancel destroys without committing", () => {
        const r = rig();
        btn(r, "Save Region").click(); btn(r, "Save Region and Text").click();
        assert.deepEqual(r.commits, [false, true]);
        assert.isTrue(r.shell.alive(), "the shell's commit does not destroy -- the editor's commit does");
        btn(r, "Cancel").click();
        assert.isFalse(r.shell.alive()); assert.deepEqual(r.commits, [false, true]); assert.strictEqual(r.cleaned(), 1);
    });

    it("a newer editor's registration survives an older one's destroy", () => {
        const r = rig();
        const other = { _id: "e2", destroy() {} };
        r.pv._wvRegionEditor = other;
        r.shell.destroy();
        assert.strictEqual(r.pv._wvRegionEditor, other);
    });

    it("wireHandle: pointerdown is taken and arms the move, pointerup disarms; the editor's down / move / up hooks run in order", () => {
        const r = rig();
        const log = [];
        r.shell.wireHandle(r.shell.start, "start", { down: () => log.push("down"), move: (ev, which) => log.push("move:" + which + ":" + ev.clientX), up: () => log.push("up") });
        r.shell.wireHandle(r.shell.end, "end", { move: (ev, which) => log.push("move:" + which + ":" + ev.clientX) });
        const pe = (type, x) => new win.PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, clientX: x || 0 });
        // (A privileged `new PointerEvent` reports defaultPrevented false even
        // after preventDefault -- measured 2026-10-21 -- so the hooks' log is
        // the evidence, not the event's flag.)
        r.shell.start.dispatchEvent(pe("pointerdown", 5));
        assert.deepEqual(log, ["down"], "pointerdown runs the editor's down hook");
        r.shell.start.dispatchEvent(pe("pointermove", 10));
        r.shell.start.dispatchEvent(pe("pointerup", 10));
        r.shell.start.dispatchEvent(pe("pointermove", 20));
        assert.deepEqual(log, ["down", "move:start:10", "up"], "no move after the up");
        r.shell.end.dispatchEvent(pe("pointermove", 30));
        assert.deepEqual(log, ["down", "move:start:10", "up"], "a handle not pressed ignores moves");
        r.shell.end.dispatchEvent(pe("pointerdown", 30)); r.shell.end.dispatchEvent(pe("pointermove", 31));
        assert.deepEqual(log.slice(-1), ["move:end:31"], "hooks are optional");
        r.shell.destroy();
    });

    it("both editors open through the shell and keep no chrome of their own", () => {
        for (const m of ["_wvRegionEditorOpen", "_wvDomRegionEditorOpen"]) {
            const s = String(wv[m]);
            assert.include(s, "_wvRegionEditorShell(", m + " opens through the shell");
            assert.notInclude(s, "Save Region and Text", m + " builds no bar itself");
            assert.notInclude(s, 'addEventListener("keydown"', m + " wires no keys itself");
            assert.notInclude(s, "_wvRegionEditor = {", m + " registers through the shell");
        }
    });
});
