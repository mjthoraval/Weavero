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

    // 2026-09-04 (MJT, snapshot): the button bar rendered ON TOP of the text
    // being edited. Two joined causes, each guarded below: the bar's
    // containing block is the 0-width editor container, so shrink-to-fit
    // resolved to MIN-content and every button wrapped to word-width (a
    // ~2x-tall bar); and the fixed `top = first.top - 34` placed that tall
    // bar overflowing straight onto the region.
    it("the bar declares max-content width + nowrap (anti-wrap contract)", () => {
        const { d, range, pv, reader } = fixture();
        const restore = silenceNote();
        try {
            wv._wvDomRegionEditorOpen(reader, d, range, {
                editorId: "spec-4", noteWord: "title", onCommit: () => {},
            });
            const bar = /** @type {any} */ ([...d.querySelectorAll(".wv-epub-region-editor div")]
                .find((el) => el.querySelector("button")));
            assert.isOk(bar, "button bar found");
            assert.equal(bar.style.width, "max-content",
                "width:max-content defeats the 0-width containing block");
            assert.equal(bar.style.whiteSpace, "nowrap");
            pv._wvRegionEditor.destroy();
        }
        finally { restore(); }
    });

    it("in a RENDERED doc the bar never overlaps the region", async function () {
        const win = Zotero.getMainWindow();
        const host = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe"));
        host.setAttribute("style", "position:fixed;left:0;top:0;width:600px;height:400px;visibility:hidden;");
        host.setAttribute("srcdoc",
            "<body><p style='margin-top:120px;font:16px serif'>"
            + "The quick brown fox jumps over the lazy dog and keeps running for a while.</p></body>");
        win.document.documentElement.appendChild(host);
        const restore = silenceNote();
        try {
            await new Promise((r) => { host.addEventListener("load", r, { once: true }); });
            const d = host.contentDocument;
            const iw = host.contentWindow;
            const tn = d.querySelector("p").firstChild;
            const range = d.createRange();
            range.setStart(tn, 4); range.setEnd(tn, 19);
            const rects = [...range.getClientRects()];
            if (!rects.length || !rects[0].height) this.skip();   // no layout here
            const pv = { _iframeWindow: iw };
            const reader = { _internalReader: { _primaryView: pv }, _iframeWindow: { document: d } };
            wv._wvDomRegionEditorOpen(reader, d, range, {
                editorId: "spec-5", noteWord: "title", onCommit: () => {},
            });
            const bar = [...d.querySelectorAll(".wv-epub-region-editor div")]
                .find((el) => el.querySelector("button"));
            const barR = bar.getBoundingClientRect();
            assert.isOk(barR.height, "bar laid out");
            for (const b of bar.querySelectorAll("button")) {
                assert.isBelow(b.getBoundingClientRect().height, 30,
                    "buttons stay single-line — '" + b.textContent + "' wrapped");
            }
            const region = [...range.getClientRects()];
            const above = barR.bottom <= region[0].top + 1;
            const below = barR.top >= region[region.length - 1].bottom - 1;
            assert.isTrue(above || below,
                "the bar must sit fully above or fully below the region, never on it");
            pv._wvRegionEditor.destroy();
        }
        finally { restore(); try { host.remove(); } catch (e) {} }
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
