/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-REG39 (upstream register #39, MJT 2026-10-27): a Shift+click on a
// Backlinks / Links row opens -- or re-targets -- a reader window while the
// Shift key is still down; the reader's setSelectedAnnotations reads its
// keyboard manager's live Shift and, with a selection already in the window,
// extends it to a RANGE up to the navigated annotation ("it selects multiple
// annotations in the separate window"). Weavero's open-in-window path now
// selects exactly the one through a modifier-free event. The held Shift is
// simulated by setting the window's keyboard state, as the key's typematic
// keydown does. FAILED on 0.22.3-dev.70 (three annotations selected).

describe("Weavero — an annotation opened in a reader window is the only one selected, Shift held or not", function () {
    this.timeout(90000);
    let wv, main, P, A, a1, a2, a3;
    const made = [];
    const ann = async (att, i) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = "window select " + i;
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = "1";
        a.annotationSortIndex = "00000|00000" + i + "|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10 + 30 * i, 60, 20 + 30 * i]] });
        await a.saveTx();
        return a;
    };
    const windowFor = () => Zotero.Reader._readers.find((r) => r.itemID === A.id && r._window && r._window !== main) || null;
    const settled = async (r) => {
        try { await r._initPromise; } catch (e) {}
        await wvT.waitFor(() => r._internalReader && r._internalReader._state.annotations.length >= 3 ? true : null, 20000);
        await wvT.sleep(800);
    };

    before(async function () {
        wv = wvT.plugin();
        wvT.method("_wvOpenItemInNewWindow");
        main = Zotero.getMainWindow();
        P = await wvT.createItem("journalArticle", { title: "WVWS paper" });
        A = await wvT.createTestPDFItem("wvws-pdf", { parentItemID: P.id });
        a1 = await ann(A, 1); a2 = await ann(A, 2); a3 = await ann(A, 3);
        made.push(P);
    });

    after(async function () {
        try { const w = windowFor(); if (w) w._window.close(); } catch (e) {}
        await wvT.sleep(500);
        await wvT.erase(...made);
    });

    it("the window opens on the annotation alone; a second open with the window's Shift state on still selects only the new one", async function () {
        assert.isTrue(await wv._wvOpenItemInNewWindow(a1), "a reader window opened");
        const w = await wvT.waitFor(() => windowFor(), 20000);
        assert.isOk(w, "the window reader");
        await settled(w);
        const ir = w._internalReader;
        assert.deepEqual(ir._state.selectedAnnotationIDs.slice(), [a1.key], "the first annotation alone");
        // The held Shift, as the window's keyboard manager records it.
        ir._keyboardManager.shift = true;
        assert.isTrue(await wv._wvOpenItemInNewWindow(a3), "re-targeted the open window");
        await wvT.sleep(800);
        assert.deepEqual(ir._state.selectedAnnotationIDs.slice(), [a3.key], "the third alone, not the range from the first");
        assert.isFalse(!!ir._keyboardManager.shift, "the stale Shift state cleared for the navigation");
    });
});
