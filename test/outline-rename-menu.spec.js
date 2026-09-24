/* global describe, it, before, assert, Zotero */

// Rename from the outline's RIGHT-CLICK menu (MJT 2026-09-24): after the
// rename + Enter, the blue cursor jumped to the renamed entry. It must stay
// where it was, like the collections pane, with the dashed afterglow on the
// renamed entry until the next click or key. Enter-to-rename (keyboard, on
// the cursor row) keeps selecting the renamed row. The first case FAILS on
// the pre-fix code (the cursor moved to the renamed row).

describe("Weavero — outline rename from the menu keeps the cursor", () => {
    let wv;
    const stubs = {};

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const stub = () => {
        for (const k of ["_wvReaderAtt", "_wvReaderRenderOutline", "_wvOutlineRenameEntry", "_wvReaderPanelNote"]) {
            stubs[k] = Object.prototype.hasOwnProperty.call(wv, k) ? wv[k] : undefined;
        }
        wv._wvReaderAtt = () => ({ libraryID: 1, itemKey: "SPEC" });
        wv._wvReaderRenderOutline = async () => {};
        wv._wvOutlineRenameEntry = async (_l, _k, id, v) => { stubs.renamed = { id, v }; };
        wv._wvReaderPanelNote = () => {};
    };
    const unstub = () => {
        for (const k of Object.keys(stubs)) {
            if (k === "renamed") continue;
            if (stubs[k] === undefined) delete wv[k]; else wv[k] = stubs[k];
        }
    };

    const fixture = () => {
        const d = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-rename-menu");
        const view = d.createElement("div");
        view.className = "wv-outline-reader-view";
        const list = d.createElement("div");
        list.className = "wv-outline-list";
        view.appendChild(list); d.body.appendChild(view);
        const mkRow = (id) => {
            const row = /** @type {any} */ (d.createElement("div"));
            row.className = "wv-outline-row";
            const lb = d.createElement("span");
            lb.className = "wv-outline-label"; lb.textContent = id;
            row.appendChild(lb);
            row._wvOl = { entry: { id, title: id }, index: 0, curatedView: true };
            list.appendChild(row);
            return row;
        };
        const a = mkRow("A"), b = mkRow("B");
        a.classList.add("wv-outline-active", "wv-outline-selected");
        return { d, a, b };
    };
    const reader = { _internalReader: {}, _wvOutlineSel: new Set(["A"]) };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const enter = (d) => {
        const KE = Zotero.getMainWindow().KeyboardEvent;
        d.querySelector(".wv-outline-rename-input").dispatchEvent(
            new KE("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    };

    it("from the menu: cursor + selection stay, renamed row gets the dashed afterglow", async () => {
        const { d, a, b } = fixture();
        stub();
        try {
            wv._wvOutlineStartRename(reader, d, b._wvOl.entry, b.firstChild,
                async () => ({ att: { libraryID: 1, itemKey: "SPEC" }, id: "B" }), { fromMenu: true });
            /** @type {any} */ (d.querySelector(".wv-outline-rename-input")).value = "B renamed";
            enter(d);
            for (let i = 0; i < 5; i++) await tick();
            assert.deepEqual(stubs.renamed, { id: "B", v: "B renamed" }, "the rename was saved");
            assert.isTrue(a.classList.contains("wv-outline-active"), "cursor stays on A");
            assert.isFalse(b.classList.contains("wv-outline-active"), "cursor did not move to B");
            assert.isTrue(a.classList.contains("wv-outline-selected"), "selection stays on A");
            assert.isTrue(b.classList.contains("wv-outline-ctx"), "B shows the dashed afterglow");
            d.dispatchEvent(new (Zotero.getMainWindow().PointerEvent)("pointerdown", { bubbles: true }));
            assert.isFalse(b.classList.contains("wv-outline-ctx"), "the next click clears the afterglow");
        }
        finally { unstub(); }
    });

    it("Enter-to-rename (no menu) still selects the renamed row", async () => {
        const { d, a, b } = fixture();
        stub();
        try {
            wv._wvOutlineStartRename(reader, d, b._wvOl.entry, b.firstChild,
                async () => ({ att: { libraryID: 1, itemKey: "SPEC" }, id: "B" }));
            /** @type {any} */ (d.querySelector(".wv-outline-rename-input")).value = "B again";
            enter(d);
            for (let i = 0; i < 5; i++) await tick();
            assert.isTrue(b.classList.contains("wv-outline-active"));
            assert.isFalse(a.classList.contains("wv-outline-active"));
            assert.isFalse(b.classList.contains("wv-outline-ctx"));
        }
        finally { unstub(); }
    });
});
