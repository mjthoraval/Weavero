/* global describe, it, before, after, assert, Zotero */

// Undo / redo of outline entry creation and deletion (MJT 2026-09-29, the
// first slice of Weavero-wide undo). Works on the outlines.json store with a
// throw-away document key (no reader is open for it, so the re-render is a
// no-op) and on the Outline tab menu built into a detached document: the
// History section shows the labels and shortcuts, greyed when empty.

describe("Weavero — outline undo: add and delete entries", () => {
    let wv, att, scope;
    const entry = (title, i) => ({
        title, indentLevel: 0, position: { pageIndex: i, rects: [[0, 0, 10, 10]] },
        resolvedPosition: null, regionTitle: title, url: null, source: { title, origin: "user" },
    });
    const titles = () => (wv._wvOutlineDoc(att.libraryID, att.itemKey).entries || []).map(e => e.title);
    const ids = () => (wv._wvOutlineDoc(att.libraryID, att.itemKey).entries || []).map(e => e.id);

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvOutlineRecordAdd !== "function") wvT.absent('!wv || typeof wv._wvOutlineRecordAdd !== "function"');
        att = { libraryID: 1, itemKey: "WVUNDO" + Date.now().toString(36).slice(-4).toUpperCase() };
        scope = wv._wvOutlineUndoScope(att);
        await wv._wvOutlineEnsureCurated(att.libraryID, att.itemKey, "extracted", []);
        for (let i = 0; i < 3; i++) await wv._wvOutlineInsertEntry(att.libraryID, att.itemKey, entry("E" + i, i), i);
    });

    after(async () => {
        if (!wv || !att) return;
        wv._wvUndoClear(scope);
        await wv._wvOutlineRevert(att.libraryID, att.itemKey);
    });

    it("add: undo removes the entry, redo puts it back with the same id at the same index", async () => {
        const stored = await wv._wvOutlineInsertEntry(att.libraryID, att.itemKey, entry("NEW", 9), 1);
        wv._wvOutlineRecordAdd(att, [String(stored.id)]);
        assert.deepEqual(titles(), ["E0", "NEW", "E1", "E2"]);
        assert.deepEqual(wv._wvUndoPeek(scope), { undo: "Add Outline Entry", redo: null });
        assert.strictEqual(await wv._wvUndo(scope), "Add Outline Entry");
        assert.deepEqual(titles(), ["E0", "E1", "E2"]);
        assert.strictEqual(await wv._wvRedo(scope), "Add Outline Entry");
        assert.deepEqual(titles(), ["E0", "NEW", "E1", "E2"]);
        assert.strictEqual(ids()[1], stored.id, "same id after redo");
        await wv._wvUndo(scope);
        assert.deepEqual(titles(), ["E0", "E1", "E2"]);
    });

    it("delete several: undo restores them at their old indices, in one step", async () => {
        const before = ids();
        const snaps = wv._wvOutlineSnapshotIds(att, [before[2], before[0]]);
        assert.deepEqual(snaps.map(s => s.index), [0, 2], "snapshots sorted by index");
        for (const id of [before[2], before[0]]) await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, id);
        wv._wvOutlineRecordDelete(att, snaps);
        assert.deepEqual(titles(), ["E1"]);
        assert.strictEqual(wv._wvUndoPeek(scope).undo, "Delete 2 Outline Entries");
        assert.strictEqual(await wv._wvUndo(scope), "Delete 2 Outline Entries");
        assert.deepEqual(titles(), ["E0", "E1", "E2"]);
        assert.deepEqual(ids(), before, "same ids, same order");
        assert.strictEqual(await wv._wvRedo(scope), "Delete 2 Outline Entries");
        assert.deepEqual(titles(), ["E1"]);
        await wv._wvUndo(scope);
        assert.deepEqual(ids(), before);
    });

    it("a restore is anchored on the entry that preceded it, not on the old index", async () => {
        // E0, E1, E2 -> delete E1 (prev E0, index 1) -> insert X at the top ->
        // undo: E1 must come back right after E0 (index 2), not at index 1.
        const before = ids();
        const snaps = wv._wvOutlineSnapshotIds(att, [before[1]]);
        assert.strictEqual(snaps[0].prevId, before[0], "anchor = the previous entry's id");
        await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, before[1]);
        wv._wvOutlineRecordDelete(att, snaps);
        const x = await wv._wvOutlineInsertEntry(att.libraryID, att.itemKey, entry("X", 7), 0);
        assert.deepEqual(titles(), ["X", "E0", "E2"]);
        assert.strictEqual(await wv._wvUndo(scope), "Delete Outline Entry");
        assert.deepEqual(titles(), ["X", "E0", "E1", "E2"], "anchored after E0");
        // Anchor gone: falls back to the old index, clamped.
        const snaps2 = wv._wvOutlineSnapshotIds(att, [ids()[2]]);   // E1, prev E0
        await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, ids()[2]);
        await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, ids()[1]);   // E0, the anchor, gone too
        assert.deepEqual(titles(), ["X", "E2"]);
        await wv._wvOutlineRestoreSnapshots(att, snaps2);
        assert.deepEqual(titles(), ["X", "E2", "E1"], "old index 2, clamped to the end");
        // Back to the fixture for the menu test: drop X and E1, restore E0/E1 order.
        await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, x.id);
        await wv._wvOutlineDeleteEntry(att.libraryID, att.itemKey, ids()[1]);
        await wv._wvOutlineInsertEntry(att.libraryID, att.itemKey, snaps[0].entry, 0);
        await wv._wvOutlineInsertEntry(att.libraryID, att.itemKey, entry("E0", 0), 0);
        assert.deepEqual(titles(), ["E0", "E1", "E2"]);
        wv._wvUndoClear(scope);
        wv._wvUndoRegisterType("spec.noop", { undo() {}, redo() {} });
        wv._wvUndoPush(scope, { label: "Delete 2 Outline Entries", type: "spec.noop" });
        await wv._wvUndo(scope);   // the menu test below expects redo = "Delete 2 Outline Entries", undo empty
    });

    it("the History menu (toolbar arrows): labels + shortcuts, greyed when empty; the tab menu has none", async () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-undo-menu");
        // The tab's choice reads the visible panes off the sidebar container.
        const sc = d.createElement("div"); sc.id = "sidebarContainer"; sc.className = "wv-outline-tab-on"; d.body.appendChild(sc);
        const origAtt = wv._wvReaderAtt;
        wv._wvReaderAtt = () => att;
        try {
            const reader = { _type: "pdf" };
            const rows = () => [...d.querySelectorAll(".wv-ctx-item:not(.wv-ctx-hist)")].slice(0, 2).map(it => ({
                text: it.children[1].textContent, hint: (it.querySelector(".wv-ctx-hint") || {}).textContent || "",
                off: it.classList.contains("wv-ctx-off"),
            }));
            const mac = /** @type {any} */ (Zotero).isMac;
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            const heads = [...d.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent);
            assert.deepEqual(heads, ["History"], "the strip's menu is the history and nothing else");
            // The last undo above left "Delete 2 Outline Entries" on the redo stack, undo empty.
            const r1 = rows();
            assert.deepEqual(r1.map(r => r.text), ["Undo", "Redo Delete 2 Outline Entries"]);
            assert.deepEqual(r1.map(r => r.off), [true, false], "nothing to undo, something to redo");
            // The hints are Zotero's own Edit-menu shortcuts (Ctrl+Y for Redo on
            // Windows, accel+Shift+Z elsewhere), read from its <key> elements --
            // the oracle is the native items' acceltext (MJT 2026-09-30).
            const md = Zotero.getMainWindow().document;
            const nativeUndo = md.getElementById("menu_undo").getAttribute("acceltext");
            const nativeRedo = md.getElementById("menu_redo").getAttribute("acceltext");
            if (nativeUndo && nativeRedo) assert.deepEqual(r1.map(r => r.hint), [nativeUndo, nativeRedo], "same strings as Zotero's Edit menu");
            else assert.deepEqual(r1.map(r => r.hint), mac ? ["⌘Z", "⇧⌘Z"] : [ "Ctrl+Z", Zotero.isWin ? "Ctrl+Y" : "Ctrl+Shift+Z" ]);
            assert.strictEqual(wv._wvNativeEditAccel("redo"), Zotero.isWin ? "Ctrl+Y" : (mac ? "⇧⌘Z" : "Ctrl+Shift+Z"), "platformKeys.js rule");
            wv._wvCloseReaderBmContextMenu(d);
            wv._wvUndoClear(scope);
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            const r2 = rows();
            assert.deepEqual(r2.map(r => r.text + "|" + r.off), ["Undo|true", "Redo|true"], "both greyed when empty");
            wv._wvCloseReaderBmContextMenu(d);
            // Two steps: the list appears ("Undo history"), newest first; a
            // step whose type exposes no ids can never be undone alone, so its
            // "only this" control is off (MJT 2026-10-01, reach back + selective).
            wv._wvUndoPush(scope, { label: "Add Outline Entry", type: "spec.noop" });
            wv._wvUndoPush(scope, { label: "Delete Outline Entry", type: "spec.noop" });
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            assert.deepEqual([...d.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent), ["History", "Undo history"]);
            const hist = [...d.querySelectorAll(".wv-ctx-item.wv-ctx-hist[data-wv-dir='undo']")];
            assert.deepEqual(hist.map(h => h.children[2].textContent), ["Delete Outline Entry", "Add Outline Entry"], "newest first (check box, glyph, label)");
            assert.isNull(d.querySelector(".wv-ctx-hist[data-wv-dir='redo']"), "nothing undone yet: no redo list");
            // Every row says which stack it belongs to: a glyph in the icon slot
            // and the stack's name in the tooltip (MJT 2026-10-01, "see quickly
            // which stack the undo action belongs to").
            const stacks = [...d.querySelectorAll(".wv-ctx-item:not(.wv-ctx-off):not(.wv-ctx-run)")].map(h => h.getAttribute("data-wv-stack"));
            assert.deepEqual(stacks, ["outline", "outline", "outline"], "Undo row + the two list rows: the outline's stack");
            assert.ok(hist.every(h => h.querySelector(".wv-ctx-ic img, .wv-ctx-ic svg")), "a glyph on each list row");
            assert.ok(hist.every(h => /Outline/.test(/** @type {any} */ (h).title)), "the stack is named in the tooltip");
            assert.isNull(d.querySelector(".wv-ctx-only"), "no 'only this' control anywhere: the tick box is the way (MJT 2026-10-01)");
            assert.match(/** @type {any} */ (hist[1]).title, /Undo this step and the 1 that goes with it[\s\S]*touched the same entries/, "a row that cannot go alone: the tooltip counts its group and says why");
            // Hovering a row brackets its group (MJT 2026-10-01).
            hist[1].dispatchEvent(new (Zotero.getMainWindow()).MouseEvent("mouseenter"));
            assert.deepEqual(hist.map(h => h.classList.contains("wv-ctx-group")), [true, true], "the row and the step it needs");
            assert.ok(hist[1].classList.contains("wv-ctx-group-head"));
            hist[1].dispatchEvent(new (Zotero.getMainWindow()).MouseEvent("mouseleave"));
            assert.deepEqual(hist.map(h => h.classList.contains("wv-ctx-group")), [false, false]);
            hist[0].dispatchEvent(new (Zotero.getMainWindow()).MouseEvent("mouseenter"));
            assert.deepEqual(hist.map(h => h.classList.contains("wv-ctx-group")), [true, false], "the top needs nothing: a group of one");
            hist[0].dispatchEvent(new (Zotero.getMainWindow()).MouseEvent("mouseleave"));
            wv._wvCloseReaderBmContextMenu(d);
            wv._wvUndoClear(scope);
            // Capped list, expandable as often as needed (MJT 2026-10-02):
            // 12 rows, then "Show N older steps" adds up to 12 per click;
            // ticks survive the expansion.
            for (let i = 0; i < 27; i++) wv._wvUndoPush(scope, { label: "Step " + i, type: "spec.noop" });
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            const undoRows = () => d.querySelectorAll(".wv-ctx-hist[data-wv-dir='undo']").length;
            const moreRow = () => /** @type {any} */ (d.querySelector(".wv-ctx-more[data-wv-dir='undo']"));
            assert.strictEqual(undoRows(), 12, "capped at 12");
            assert.strictEqual(moreRow().children[1].textContent, "Show 12 older steps");
            assert.strictEqual(moreRow().children[2].textContent, "15 more");
            /** @type {any} */ (d.querySelector(".wv-ctx-hist[data-wv-dir='undo'] .wv-ctx-check")).click();   // tick the newest
            moreRow().click();
            assert.strictEqual(undoRows(), 24, "one expansion: 24");
            assert.ok(d.querySelector(".wv-ctx-item"), "the menu stayed open");
            assert.ok(d.querySelector(".wv-ctx-hist[data-wv-dir='undo'] .wv-ctx-check").classList.contains("on"), "the tick survived");
            assert.strictEqual(moreRow().children[1].textContent, "Show 3 older steps");
            moreRow().click();
            assert.strictEqual(undoRows(), 27, "all of them");
            assert.isNull(moreRow(), "nothing older: no row");
            wv._wvCloseReaderBmContextMenu(d);
            wv._wvUndoClear(scope);
            // Multi-select (MJT 2026-10-01): ticking a row auto-ticks the later
            // steps that touched the same entries; unticking an auto-ticked row
            // drops the pick that needed it; the footer undoes the selection,
            // newest first, leaving untouched steps in place.
            wv._wvUndoRegisterType("spec.ids", { undo() {}, redo() {}, ids: x => x.ids });
            wv._wvUndoPush(scope, { label: "Add A", type: "spec.ids", data: { ids: ["a"] } });
            wv._wvUndoPush(scope, { label: "Add B", type: "spec.ids", data: { ids: ["b"] } });
            wv._wvUndoPush(scope, { label: "Rename A", type: "spec.ids", data: { ids: ["a"] } });
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            const row = (label, dir = "undo") => /** @type {any} */ ([...d.querySelectorAll(".wv-ctx-item.wv-ctx-hist[data-wv-dir='" + dir + "']")].find(h => h.children[2].textContent === label));
            const ticks = (dir = "undo") => [...d.querySelectorAll(".wv-ctx-item.wv-ctx-hist[data-wv-dir='" + dir + "']")].map(h => h.children[2].textContent + ":" + (h.querySelector(".wv-ctx-check").classList.contains("on") ? (h.querySelector(".wv-ctx-check").classList.contains("auto") ? "auto" : "on") : "off"));
            const footer = /** @type {any} */ (d.querySelector(".wv-ctx-run[data-wv-dir='undo']"));
            assert.strictEqual(footer.style.display, "none", "no selection: no footer");
            row("Add A").querySelector(".wv-ctx-check").click();
            assert.deepEqual(ticks(), ["Rename A:auto", "Add B:off", "Add A:on"], "Rename A touched A after it: ticked with it, dimmer");
            assert.strictEqual(footer.children[1].textContent, "Undo 2 selected");
            row("Rename A").querySelector(".wv-ctx-check").click();
            assert.deepEqual(ticks(), ["Rename A:off", "Add B:off", "Add A:off"], "unticking the needed row drops the pick that needed it");
            row("Add A").querySelector(".wv-ctx-check").click();
            row("Add B").dispatchEvent(new (Zotero.getMainWindow()).MouseEvent("click", { bubbles: true, ctrlKey: true }));
            assert.deepEqual(ticks(), ["Rename A:auto", "Add B:on", "Add A:on"], "Ctrl+click ticks too");
            row("Add B").querySelector(".wv-ctx-check").click();
            assert.deepEqual(ticks(), ["Rename A:auto", "Add B:off", "Add A:on"]);
            assert.ok(d.querySelector(".wv-ctx-item"), "the menu stayed open while ticking");
            footer.click();
            await new Promise(r => setTimeout(r, 30));
            assert.isNull(d.querySelector(".wv-ctx-item"), "closed by the run");
            assert.deepEqual(wv._wvUndoStacks().get(scope).undo.map(s => s.label), ["Add B"], "A and its rename undone, B kept");
            assert.deepEqual(wv._wvUndoStacks().get(scope).redo.map(s => s.label), ["Rename A", "Add A"], "newest first, both redoable");
            // The redo list (MJT 2026-10-01): the next redo first; a deeper
            // entry can be redone alone when nothing before it in the list
            // touched the same entries, else it ticks its dependants.
            wv._wvTabShowHistoryMenu(reader, d, d.body);
            assert.deepEqual(ticks("redo"), ["Add A:off", "Rename A:off"], "redo order: the most recently undone (next to redo) first");
            assert.match(/** @type {any} */ (row("Rename A", "redo")).title, /Redo this step and the 1 that goes with it/, "Rename A needs Add A redone first: the tooltip says so");
            row("Rename A", "redo").querySelector(".wv-ctx-check").click();
            assert.deepEqual(ticks("redo"), ["Add A:auto", "Rename A:on"], "its requirement is ticked with it");
            const rfooter = /** @type {any} */ (d.querySelector(".wv-ctx-run[data-wv-dir='redo']"));
            assert.strictEqual(rfooter.children[1].textContent, "Redo 2 selected");
            rfooter.click();
            await new Promise(r => setTimeout(r, 30));
            assert.deepEqual(wv._wvUndoStacks().get(scope).undo.map(s => s.label), ["Add B", "Add A", "Rename A"], "both redone, in order");
            assert.deepEqual(wv._wvUndoStacks().get(scope).redo, []);
            wv._wvUndoClear(scope);
            // With the right-click event, the menu sits at the pointer (MJT 2026-09-30).
            wv._wvTabShowHistoryMenu(reader, d, d.body, { clientX: 40, clientY: 50 });
            const menuEl = /** @type {any} */ (d.querySelector(".wv-ctx-heading").parentNode);
            assert.deepEqual([menuEl.style.left, menuEl.style.top], ["40px", "50px"], "placed at the pointer");
            // A left-click on the strip itself (the anchor) closes the menu
            // (MJT 2026-09-30) -- the chip-style anchor exemption does not apply.
            const down = d.createEvent("Event"); down.initEvent("pointerdown", true, true);
            d.body.dispatchEvent(down);
            assert.isNull(d.querySelector(".wv-ctx-item"), "closed by a click on the strip");
            wv._wvCloseReaderBmContextMenu(d);
            // The tab button's menu no longer carries it (MJT 2026-09-30).
            wv._wvOutlineShowTabMenu(reader, d, d.body);
            const tabHeads = [...d.querySelectorAll(".wv-ctx-heading")].map(h => h.textContent);
            assert.notInclude(tabHeads, "History");
            wv._wvCloseReaderBmContextMenu(d);
        }
        finally { wv._wvReaderAtt = origAtt; }
    });
});
