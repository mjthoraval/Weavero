/* global describe, it, before, assert, Zotero */

// The DOM-view handle-drag region editor (2026-08-27). "Edit Region…" on an
// outline entry opened the PDF editor (hard-gated on PDFViewerApplication) or,
// on EPUB/snapshot, the select-text re-anchor flow -- which the user read as
// "Edit Region does not work" (report with the PDF editor as the expected
// look). `_wvDomRegionEditorOpen` is the Range-based twin: same Save Region /
// Save Region and Text / Cancel surface, anchor-agnostic (the caller derives
// CFI or selector from the LIVE committed range in onCommit). These cases
// drive it with a real document and a stubbed view; they FAIL on the pre-fix
// code (no such editor existed).

describe("Weavero — DOM-view region editor", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) this.skip();
    });

    const fixture = () => {
        const d = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-region-test");
        d.body.textContent = "The quick brown fox jumps over the lazy dog again";
        const range = d.createRange();
        const tn = d.body.firstChild;
        range.setStart(tn, 4); range.setEnd(tn, 19);   // "quick brown fox"
        const pv = {
            _iframeWindow: {
                document: d, scrollX: 0, scrollY: 0, innerHeight: 800,
                scrollTo() {},
            },
        };
        const reader = { _internalReader: { _primaryView: pv }, _iframeWindow: { document: d } };
        return { d, range, pv, reader };
    };
    // The chrome-side panel note needs a real reader panel; stub it out.
    const silenceNote = () => {
        const orig = wv._wvReaderPanelNote;
        wv._wvReaderPanelNote = function () {};
        return () => { wv._wvReaderPanelNote = orig; };
    };

    it("exists — the editor is not PDF-only any more", () => {
        assert.isFunction(wv._wvDomRegionEditorOpen);
    });

    it("opens the full editor surface and registers per-view", () => {
        const { d, range, pv, reader } = fixture();
        const restore = silenceNote();
        try {
            wv._wvDomRegionEditorOpen(reader, d, range, {
                editorId: "spec-1", noteWord: "title", onCommit: () => {},
            });
            const ed = d.querySelector(".wv-epub-region-editor");
            assert.isOk(ed, "editor container");
            assert.deepEqual(
                [...ed.querySelectorAll("button")].map((b) => b.textContent),
                ["Save Region", "Save Region and Text", "Cancel"]);
            assert.isOk(pv._wvRegionEditor && pv._wvRegionEditor._id === "spec-1");
            pv._wvRegionEditor.destroy();
            assert.isNotOk(d.querySelector(".wv-epub-region-editor"), "destroy removes it");
        }
        finally { restore(); }
    });

    it("Save hands the LIVE range and its text to onCommit, then closes", () => {
        const { d, range, reader } = fixture();
        const restore = silenceNote();
        try {
            let got = null;
            wv._wvDomRegionEditorOpen(reader, d, range, {
                editorId: "spec-2", noteWord: "title",
                onCommit: (r, text, withText) => { got = { text, withText, isRange: typeof r.cloneRange === "function" }; },
            });
            const btn = /** @type {HTMLElement} */ ([...d.querySelectorAll(".wv-epub-region-editor button")]
                .find((b) => b.textContent === "Save Region and Text"));
            btn.click();
            assert.isOk(got, "onCommit ran");
            assert.equal(got.text, "quick brown fox");
            assert.isTrue(got.withText);
            assert.isTrue(got.isRange);
            assert.isNotOk(d.querySelector(".wv-epub-region-editor"), "editor closed on save");
        }
        finally { restore(); }
    });

    it("Cancel closes without committing", () => {
        const { d, range, reader } = fixture();
        const restore = silenceNote();
        try {
            let committed = false;
            wv._wvDomRegionEditorOpen(reader, d, range, {
                editorId: "spec-3", noteWord: "title", onCommit: () => { committed = true; },
            });
            const btn = /** @type {HTMLElement} */ ([...d.querySelectorAll(".wv-epub-region-editor button")]
                .find((b) => b.textContent === "Cancel"));
            btn.click();
            assert.isFalse(committed);
            assert.isNotOk(d.querySelector(".wv-epub-region-editor"));
        }
        finally { restore(); }
    });
});
