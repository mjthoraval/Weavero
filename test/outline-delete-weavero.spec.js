/* global describe, it, before, assert, Zotero */

// "Delete Weavero Outline…" (MJT 2026-09-24): offered on the source chip's
// right-click ONLY while the Weavero outline is shown (on an Embedded /
// Extracted chip it read as deleting that outline), and on the right-click
// of the Weavero row in the opened source selector; only when a Weavero
// outline exists. The confirm can no longer be skipped by an error: any
// failure around it cancels the delete. Each case FAILS on the pre-fix code.

describe("Weavero — Delete Weavero Outline", () => {
    let wv;
    const saved = {};

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const stub = (hasCurated) => {
        for (const k of ["_wvReaderAtt", "_wvOutlineHasCurated", "_wvReaderReachableDocs"]) saved[k] = wv[k];
        wv._wvReaderAtt = () => ({ libraryID: 1, itemKey: "SPEC" });
        wv._wvOutlineHasCurated = () => hasCurated;
        wv._wvReaderReachableDocs = () => ({ docs: [], wins: [] });
    };
    const unstub = () => { for (const k of Object.keys(saved)) wv[k] = saved[k]; };
    const doc = () => Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-del");
    const labels = (d) => [...d.querySelectorAll(".wv-ctx-item")].map((i) => i.textContent.trim());
    const anchor = (d) => { const b = d.createElement("button"); d.body.appendChild(b); return b; };

    it("chip right-click offers it only while the Weavero outline is shown", () => {
        stub(true);
        try {
            const d = doc();
            wv._wvOutlineShowChipMenu({}, d, anchor(d), "extracted");
            assert.deepEqual(labels(d), [], "Extracted shown: no menu");
            wv._wvOutlineShowChipMenu({}, d, anchor(d), "weavero");
            assert.deepEqual(labels(d), ["Delete Weavero Outline…"]);
        }
        finally { unstub(); }
    });

    it("never offered when no Weavero outline exists", () => {
        stub(false);
        try {
            const d = doc();
            wv._wvOutlineShowChipMenu({}, d, anchor(d), "weavero");
            assert.deepEqual(labels(d), []);
        }
        finally { unstub(); }
    });

    it("right-click on the Weavero row of the source selector offers it", () => {
        stub(true);
        try {
            const d = doc();
            wv._wvOutlineShowSourceMenu({}, d, anchor(d), ["extracted", "weavero"], "extracted");
            const row = /** @type {any} */ (d.querySelector(".wv-ctx-item.wv-outline-src-weavero"));
            assert.isOk(row, "Weavero row present");
            const ME = Zotero.getMainWindow().MouseEvent;
            row.dispatchEvent(new ME("auxclick", { bubbles: true, cancelable: true, button: 2 }));
            // The dropdown stays open, the delete opens beside the row (MJT:
            // "should not collapse the dropdown menu").
            assert.deepEqual(labels(d), ["Extracted", "Weavero", "Delete Weavero Outline…"]);
            assert.isOk(d.querySelector(".wv-outline-src-weavero"), "Weavero row still there");
            const side = d.querySelector(".wv-ctx-sidemenu");
            assert.isOk(side, "the delete sits in its own side menu");
            assert.notInclude(side.className, "wv-ctx-submenu", "not the hover-only class, which is display:none");
        }
        finally { unstub(); }
    });

    it("an error around the confirmation cancels the delete", () => {
        for (const k of ["_wvReaderAtt", "_wvOutlineDoc", "_wvOutlineRevert"]) saved[k] = wv[k];
        let reverted = false;
        wv._wvReaderAtt = () => ({ libraryID: 1, itemKey: "SPEC" });
        wv._wvOutlineDoc = () => { throw new Error("boom"); };
        wv._wvOutlineRevert = () => { reverted = true; };
        try {
            wv._wvOutlineDoRevert({}, doc());
            assert.isFalse(reverted, "no confirmation shown -> nothing deleted");
        }
        finally { unstub(); }
    });
});
