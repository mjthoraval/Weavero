/* global describe, it, before, assert, Zotero */

// Outline right-click menu = the collections pane's behaviour (MJT
// 2026-09-24, after a survey against Zotero's buildCollectionContextMenu):
//  - right-click INSIDE a multi-selection acts on the whole selection:
//    Delete counts the entries, single-entry actions (Rename, Edit Region,
//    Reset, Re-detect) are hidden -- Zotero hides Rename / New Subcollection
//    above one selected collection;
//  - deleting an entry the user was not on keeps the selection and cursor;
//  - Open behaves like a left-click (cursor + sole selection);
//  - the afterglow can mark several renamed rows (Fix Spacing).
// Each case FAILS on the pre-fix code.

describe("Weavero — outline menu matches the collections pane", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const fixture = (selectedIds) => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-menu-parity");
        const view = d.createElement("div");
        view.className = "wv-outline-reader-view";
        const list = d.createElement("div");
        list.className = "wv-outline-list";
        view.appendChild(list); d.body.appendChild(view);
        const rows = {};
        for (const id of ["A", "B", "C"]) {
            const row = /** @type {any} */ (d.createElement("div"));
            row.className = "wv-outline-row";
            const lb = d.createElement("span");
            lb.className = "wv-outline-label"; lb.textContent = id;
            row.appendChild(lb);
            row._wvOl = { entry: { id, title: id, position: {} }, index: ["A", "B", "C"].indexOf(id), curatedView: true };
            list.appendChild(row);
            rows[id] = row;
        }
        const reader = { _type: "snapshot", _internalReader: { _state: {} }, _wvOutlineSel: new Set(selectedIds) };
        for (const id of selectedIds) rows[id].classList.add("wv-outline-selected");
        return { d, rows, reader };
    };
    const labels = (d) => [...d.querySelectorAll(".wv-ctx-item")].map((i) => i.textContent.trim());
    const openMenu = (d, reader, row) =>
        wv._wvOutlineShowEntryMenu(reader, d, { target: row }, row._wvOl.entry, row._wvOl.index, true);

    it("inside a multi-selection: Delete counts, single-entry actions are hidden", () => {
        const { d, rows, reader } = fixture(["A", "B"]);
        openMenu(d, reader, rows.B);
        const l = labels(d);
        assert.include(l, "Delete 2 Entries");
        assert.notInclude(l, "Rename…");
        assert.notInclude(l, "Edit Region…");
        const menuEl = /** @type {any} */ (d.querySelector(".wv-ctx-item")).parentNode;
        const seps = [...menuEl.children].map((e) => e.classList.contains("wv-ctx-sep"));
        for (let i = 1; i < seps.length; i++) assert.isFalse(seps[i] && seps[i - 1], "no doubled separator");
        wv._wvCloseReaderBmContextMenu(d);
    });

    it("outside the selection: the single-entry menu", () => {
        const { d, rows, reader } = fixture(["A", "B"]);
        openMenu(d, reader, rows.C);
        const l = labels(d);
        assert.include(l, "Delete");
        assert.include(l, "Rename…");
        wv._wvCloseReaderBmContextMenu(d);
    });

    it("deleting an entry the user was not on keeps the selection (no landing)", async () => {
        const { d, rows, reader } = fixture(["A"]);
        const saved = {};
        for (const k of ["_wvOutlineResolveId", "_wvOutlineDeleteEntry", "_wvReaderRenderOutline", "_wvOutlineLandAfterDelete"]) saved[k] = wv[k];
        let landed = 0;
        wv._wvOutlineResolveId = async (_r, e) => ({ att: { libraryID: 1, itemKey: "SPEC" }, id: e.id });
        wv._wvOutlineDeleteEntry = async () => {};
        wv._wvReaderRenderOutline = async () => {};
        wv._wvOutlineLandAfterDelete = () => { landed++; };
        try {
            await wv._wvOutlineDoDelete(reader, d, rows.C._wvOl.entry, 2, true);
            assert.equal(landed, 0, "not on C: selection and cursor stay");
            await wv._wvOutlineDoDelete(reader, d, rows.A._wvOl.entry, 0, true);
            assert.equal(landed, 1, "deleting the selected entry lands on its neighbour");
        }
        finally { for (const k of Object.keys(saved)) wv[k] = saved[k]; }
    });

    it("Open acts like a left-click: cursor + sole selection", () => {
        const { d, rows, reader } = fixture(["A"]);
        openMenu(d, reader, rows.C);
        const open = /** @type {any} */ ([...d.querySelectorAll(".wv-ctx-item")].find((i) => i.textContent.trim() === "Open"));
        open.click();
        assert.isTrue(rows.C.classList.contains("wv-outline-active"), "cursor on C");
        assert.isTrue(rows.C.classList.contains("wv-outline-selected"));
        assert.isFalse(rows.A.classList.contains("wv-outline-selected"), "A deselected");
        assert.deepEqual([...reader._wvOutlineSel], ["C"]);
    });

    it("the afterglow marks several rows and clears them together", () => {
        const { d, rows } = fixture([]);
        wv._wvOutlineAfterglow(d, ["A", "C"]);
        assert.isTrue(rows.A.classList.contains("wv-outline-ctx"));
        assert.isTrue(rows.C.classList.contains("wv-outline-ctx"));
        assert.isFalse(rows.B.classList.contains("wv-outline-ctx"));
        d.dispatchEvent(new (Zotero.getMainWindow().PointerEvent)("pointerdown", { bubbles: true }));
        assert.isFalse(rows.A.classList.contains("wv-outline-ctx"));
        assert.isFalse(rows.C.classList.contains("wv-outline-ctx"));
    });
});
