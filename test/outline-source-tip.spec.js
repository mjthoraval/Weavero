/* global describe, it, before, assert, Zotero */

// The outline pane's source chip says what each label means (outline2.5; MJT
// 2026-11-24, on 2.4's chip whose tooltip read only "Click to switch source":
// "The tooltip should explain what each label means"). Its tooltip: a first
// line naming it the outline's source (and that a click switches it), then
// one line per source THIS document has, the shown one marked, each with its
// meaning; the delete hint while the edited outline is shown. The chip's menu
// rows carry the same lines. Plain `title` text with line breaks: the reader's
// browser shows titles through the main window's page tooltip
// (xpcom/reader.js _createBrowser: tooltip="html-tooltip").
// And the dev Eval button's menu (MJT: "Why repeat Eval on each line?"): no
// "Eval:" prefix on its rows; the button's own tooltip names the evaluation.

describe("Weavero — the outline source chip explains its labels (outline2.5)", function () {
    let wv;
    const saved = {};
    const EX = "Extracted: Weavero’s outline, built from Zotero’s structure data for this PDF";
    const EM = "Embedded: the outline saved inside the document file";
    const ZO = "Zotero: Zotero’s own extracted outline, unchanged";
    const ED = "Edited: your edited copy of this outline";
    const RM = "Reading Mode: the headings of Reading Mode’s text (Reading Mode only)";
    const NO = "None: no outline was found in this document";
    const HEAD_SWITCH = "The outline’s source (click to switch):";
    const HEAD = "The outline’s source:";

    const stub = (map) => { for (const k of Object.keys(map)) { saved[k] = Object.prototype.hasOwnProperty.call(wv, k) ? wv[k] : undefined; wv[k] = map[k]; } };
    const unstub = () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete wv[k]; else wv[k] = saved[k]; delete saved[k]; } };
    const doc = () => Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-src-tip");
    /** The header rendered for a stand-in reader whose last fetch found `order`, showing `current`. */
    function chipFor(order, current, tree) {
        const d = doc();
        const view = d.createElement("div");
        const head = d.createElement("div");
        head.className = "wv-outline-head";
        view.appendChild(head);
        d.body.appendChild(view);
        const reader = { _wvOutlineCache: { source: current, tree: tree || [{ title: "x", items: [] }], order } };
        wv._wvOutlineRenderHeader(reader, d, view, current);
        const chip = view.querySelector(".wv-outline-src-chip");
        assert.ok(chip, "the chip");
        return { d, view, chip, reader, lines: String(chip.getAttribute("title") || "").split("\n") };
    }

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvOutlineRenderHeader", "_wvOutlineShowSourceMenu", "_wvOeShowMenu"]) wvT.method(m);
    });

    it("the chip's tooltip: what it is, then each source this PDF has with its meaning, the shown one marked", function () {
        stub({ _wvReaderAtt: () => null });
        try {
            const { lines } = chipFor(["extracted", "embedded", "zotero"], "extracted");
            assert.deepEqual(lines, [HEAD_SWITCH, "✓ " + EX, EM, ZO]);
        }
        finally { unstub(); }
    });

    it("only the sources the document has: one source, no switch", function () {
        stub({ _wvReaderAtt: () => null });
        try {
            const { lines, chip } = chipFor(["zotero"], "zotero");
            assert.deepEqual(lines, [HEAD, "✓ " + ZO]);
            assert.isFalse(chip.classList.contains("wv-outline-src-switchable"), "not a switcher");
            const none = chipFor([], "none", []);
            assert.deepEqual(none.lines, [HEAD, "✓ " + NO]);
        }
        finally { unstub(); }
    });

    it("the edited outline first, marked, with the delete hint", function () {
        stub({
            _wvReaderAtt: () => ({ libraryID: 1, itemKey: "SPEC" }),
            _wvOutlineHasCurated: () => true,
            _wvOutlineDoc: () => ({ importedFrom: "extracted", entries: [] }),
        });
        try {
            const { lines } = chipFor(["extracted", "zotero"], "weavero");
            assert.deepEqual(lines, [HEAD_SWITCH, "✓ " + ED, EX, ZO, "Right-click to delete the edited outline."]);
        }
        finally { unstub(); }
    });

    it("Reading Mode's own outline, after Extracted, while Reading Mode is on", function () {
        stub({
            _wvReaderAtt: () => null,
            _wvReadingModeActive: () => true,
            _wvOutlineRmEntries: () => [{ title: "rm", indentLevel: 0 }],
        });
        try {
            const { lines } = chipFor(["extracted", "embedded"], "readingMode");
            assert.deepEqual(lines, [HEAD_SWITCH, EX, "✓ " + RM, EM]);
        }
        finally { unstub(); }
    });

    it("each row of the chip's menu carries its line", function () {
        stub({ _wvReaderAtt: () => null, _wvReaderReachableDocs: () => ({ docs: [], wins: [] }) });
        try {
            const d = doc();
            const a = d.createElement("button");
            d.body.appendChild(a);
            wv._wvOutlineShowSourceMenu({}, d, a, ["extracted", "embedded", "zotero"], "extracted");
            const rows = [...d.querySelectorAll(".wv-ctx-item")];
            assert.deepEqual(rows.map(r => r.getAttribute("title")), [EX, EM, ZO]);
            wv._wvCloseReaderBmContextMenu(d);
        }
        finally { unstub(); }
    });

    it("the Eval menu's rows have no Eval prefix; the Eval button's tooltip names the evaluation", async function () {
        await wvT.withPref("weavero.devOutlineEval", true, async () => {
            stub({
                _wvReaderAtt: () => ({ libraryID: 1, itemKey: "SPEC" }),
                _wvOeCase: () => null,
                _wvReaderReachableDocs: () => ({ docs: [], wins: [] }),
            });
            try {
                const d = doc();
                const a = d.createElement("button");
                d.body.appendChild(a);
                wv._wvOeShowMenu({}, d, a);
                const rows = [...d.querySelectorAll(".wv-ctx-item")].map(r => r.textContent.trim());
                assert.lengthOf(rows, 4, JSON.stringify(rows));
                for (const r of rows) assert.notInclude(r, "Eval", "no prefix: " + r);
                assert.include(rows[0], "Not Marked ✓");
                assert.include(rows[1], "Extraction Good");
                assert.include(rows[2], "Extraction Bad");
                assert.include(rows[3], "Scan (No Text Layer)");
                wv._wvCloseReaderBmContextMenu(d);
                const { view } = chipFor(["extracted"], "extracted");
                const btn = view.querySelector(".wv-outline-eval-btn");
                assert.ok(btn, "the Eval button (devOutlineEval on)");
                assert.equal(btn.getAttribute("title"), "Evaluate this outline’s extraction (developer tool): not marked");
            }
            finally { unstub(); }
        });
    });
});
