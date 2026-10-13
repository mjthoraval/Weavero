/* global describe, it, before, assert, Zotero, DOMParser */

// Reader outline text follows Zotero's View -> Font Size (issue #47): the
// reader sets its root font-size from the `fontSize` pref, so outline sizes
// must be in rem. The page number was a fixed 11px and stayed small while
// the labels grew (measured live 2026-09-29: 12.65px vs 11px at 1.15).
// Checked on the stylesheet the plugin installs into a reader document (a
// test-profile frame is never laid out, so computed sizes read "").
// FAILS on the pre-fix code (.wv-outline-page font-size:11px).

describe("Weavero — reader outline follows View → Font Size", () => {
    let wv;

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvEnsureReaderPanelStyles !== "function") wvT.absent('!wv || typeof wv._wvEnsureReaderPanelStyles !== "function"');
    });

    it("the page number is sized in rem, like the label", () => {
        const doc = new DOMParser().parseFromString("<html><head></head><body></body></html>", "text/html");
        wv._wvEnsureReaderPanelStyles(doc);
        const css = [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
        const size = (sel) => {
            const m = css.match(new RegExp("(?:^|[}\\s,])" + sel.replace(/[.-]/g, "\\$&") + "\\{[^}]*?font-size:\\s*([^;}]+)"));
            return m && m[1].trim();
        };
        const label = size(".wv-outline-label");
        const page = size(".wv-outline-page");
        // Zotero's own size (rem, follows Font Size) unless a fixed size is set.
        assert.include(label, ".6875rem", "label defaults to rem (follows Font Size)");
        assert.include(label, "--wv-outline-fs", "label takes the outline text size");
        assert.equal(page, label, "page number and label scale together");
        assert.equal(size(".wv-outline-rename-input"), label, "rename field matches the label");
        // Every other CONTENT element of the outline and bookmarks panels
        // follows Font Size too (MJT 2026-09-29); chrome stays fixed.
        const fixed = [];
        for (const sel of [".wv-outline-empty", ".wv-outline-create-btn",
            ".wv-bm-reader-row", ".wv-bm-reader-row .wv-bm-reader-page",
            ".wv-bm-reader-row .wv-bm-reader-ic.wv-bm-emoji", ".wv-bm-reader-empty",
            ".wv-bm-reader-empty-section", ".wv-bm-reader-grouphead"]) {
            const v = size(sel);
            if (!v || !/rem$/.test(v)) fixed.push(sel + ": " + v);
        }
        assert.deepEqual(fixed, [], "panel content in rem");
    });

    it("Outline text size: Zotero Outline, Zotero Item Pane (both follow Font Size) or Fixed px", () => {
        const prev = Zotero.Prefs.get("weavero.outlineTextSize");
        const doc = new DOMParser().parseFromString("<html><head></head><body></body></html>", "text/html");
        try {
            const at = (v) => {
                Zotero.Prefs.set("weavero.outlineTextSize", v);
                wv._wvApplyOutlineTextScale(doc);
                return doc.documentElement.style.getPropertyValue("--wv-outline-fs");
            };
            assert.equal(at("zotero"), "", "Zotero Outline: the rem default (follows Font Size)");
            assert.equal(at("itemPane"), ".8125rem", "Zotero Item Pane: 13px at root 16px, follows Font Size");
            assert.equal(at("13"), "13px", "Fixed");
            assert.equal(at("8"), "8px");
            assert.equal(at("24"), "24px");
            assert.equal(at("17"), "", "unknown: Zotero Outline");
            // Values from earlier dev builds.
            assert.equal(at("default"), "");
            assert.equal(at("1.38"), "15px");
        } finally {
            Zotero.Prefs.set("weavero.outlineTextSize", prev || "zotero");
        }
    });

    it("the two Zotero sizes show their current size (they follow Font Size)", () => {
        const prevFS = Zotero.Prefs.get("fontSize");
        try {
            Zotero.Prefs.set("fontSize", "1.00");
            assert.equal(wv._wvOutlineSizeLabel("zotero"), "Zotero Outline, 11 px");
            assert.equal(wv._wvOutlineSizeLabel("itemPane"), "Zotero Item Pane, 13 px");
            Zotero.Prefs.set("fontSize", "1.15");
            assert.equal(wv._wvOutlineSizeLabel("zotero"), "Zotero Outline, 12.65 px");
            assert.equal(wv._wvOutlineSizeLabel("itemPane"), "Zotero Item Pane, 14.95 px");
            assert.equal(wv._wvOutlineSizeLabel("13"), "13 px", "Fixed does not move");
        } finally {
            Zotero.Prefs.set("fontSize", prevFS == null ? "1.00" : prevFS);
        }
    });

    it("a document's own size (Outline tab menu) beats Settings; picking Settings' value removes it", async function () {
        this.timeout(10000);
        const prev = Zotero.Prefs.get("weavero.outlineTextSize");
        const att = { libraryID: Zotero.Libraries.userLibraryID, itemKey: "WVTSIZE1" };
        try {
            Zotero.Prefs.set("weavero.outlineTextSize", "zotero");
            assert.equal(wv._wvOutlineTextSizeOf(att), "zotero", "no exception: Settings");
            await wv._wvOutlineSetTextSize(att, "itemPane");
            assert.equal(wv._wvOutlineTextSizeOf(att), "itemPane", "this document only");
            assert.equal(wv._wvOutlineTextSizeOf(null), "zotero", "others follow Settings");
            Zotero.Prefs.set("weavero.outlineTextSize", "16");
            assert.equal(wv._wvOutlineTextSizeOf(att), "itemPane", "the exception survives a Settings change");
            await wv._wvOutlineSetTextSize(att, "16");
            const s = wv._wvOutlineFileSettings(att.libraryID, att.itemKey);
            assert.isFalse(!!(s && "textSize" in s), "picking the Settings value leaves no exception");
        } finally {
            try { await wv._wvOutlineSetFileSettings(att.libraryID, att.itemKey, { textSize: undefined }); } catch (e) {}
            Zotero.Prefs.set("weavero.outlineTextSize", prev || "zotero");
        }
    });
});
