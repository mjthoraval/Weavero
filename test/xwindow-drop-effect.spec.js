/* global describe, it, before, after, assert, Zotero */

// Cross-window items-list drop vs Zotero 10.0.4+ (upstream c59734e97, scan
// 2026-09-30): the trees' onDrop now acts on `Zotero.DragDrop.currentDropEffect`,
// recorded by their own onDragOver through setDropEffect(), instead of the
// drop event's dropEffect. Weavero's window-level dragover pre-empts the
// native items-tree dragover, so it must record its 'copy' the same way --
// the delegated `cv.onDrop` otherwise reads whatever the last native hover
// left behind. FAILS on the pre-fix code (a stale 'move' survives the
// dragover). Synthetic drag events reach Weavero's own window-level handler
// (a JS listener), so no real drag is needed; the drop itself is not fired.

describe("Weavero — cross-window drop records its effect the 10.0.4 way", () => {
    const DD = () => /** @type {any} */ (Zotero).DragDrop;
    let wv, win, doc, cv, origCanDrop, origSrcWin, origEffect;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        win = Zotero.getMainWindow(); doc = win.document;
        cv = win.ZoteroPane && win.ZoteroPane.collectionsView;
        if (!wv || !cv || !win._wvXWinDropHandlers) this.skip();
        if (!DD() || !("currentDropEffect" in DD())) this.skip();   // older Zotero: nothing to record
        if (typeof win.DataTransfer !== "function") this.skip();
        origCanDrop = cv.canDropCheck; origSrcWin = wv._wvDragSourceWin; origEffect = DD().currentDropEffect;
    });

    after(() => {
        if (!cv) return;
        cv.canDropCheck = origCanDrop;
        wv._wvDragSourceWin = origSrcWin;
        DD().currentDropEffect = origEffect;
    });

    const dragover = (target) => {
        const dt = new win.DataTransfer();
        dt.setData("zotero/item", "1");
        // What an item drag allows (Zotero.Utilities.Internal.onDragItems); a
        // script-made DataTransfer starts at "none", which setDropEffect maps
        // to no effect at all.
        dt.effectAllowed = "copyMove";
        const ev = new win.DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(ev);
        return { ev, dt };
    };

    it("a foreign-window drag over the items tree leaves currentDropEffect = 'copy'", () => {
        const tree = doc.getElementById("zotero-items-tree");
        assert.ok(tree, "items tree present");
        // Another window's drag: the source stamp is not this window, and the
        // native drop check says yes (stubbed -- the real one depends on the
        // library's content).
        wv._wvDragSourceWin = {};
        cv.canDropCheck = () => true;
        DD().currentDropEffect = "move";   // stale, from an earlier native hover
        // Diagnostics for a failure: every setDropEffect call and Weavero's trace ring.
        const calls = [], origSet = cv.setDropEffect, traceFrom = (wv._wvXDropTrace || []).length;
        cv.setDropEffect = function (e, eff) { calls.push(eff + "->" + DD().currentDropEffect); return origSet.call(this, e, eff); };
        let ev, dt;
        try { ({ ev, dt } = dragover(tree.querySelector(".virtualized-table") || tree)); }
        finally { cv.setDropEffect = origSet; }
        const diag = " calls=" + JSON.stringify(calls) + " trace=" + JSON.stringify((wv._wvXDropTrace || []).slice(traceFrom));
        assert.isTrue(ev.defaultPrevented, "Weavero accepted the drag" + diag);
        assert.strictEqual(DD().currentDropEffect, "copy", "recorded through setDropEffect" + diag);
        assert.strictEqual(dt.dropEffect, "copy", diag);
    });

    it("a same-window drag is left alone (native handling)", () => {
        const tree = doc.getElementById("zotero-items-tree");
        wv._wvDragSourceWin = win;
        cv.canDropCheck = () => true;
        DD().currentDropEffect = "move";
        dragover(tree);
        assert.strictEqual(DD().currentDropEffect, "move", "untouched by Weavero");
    });
});
