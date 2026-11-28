/* global describe, it, before, assert, Zotero */

// Weavero's Extracted outline IDENTICAL to Zotero's own -- same titles,
// nesting and places -- is not a source of its own (MJT 2026-11-24, outline2.6:
// "amber = Weavero changed something, grey = Zotero's as is"): the chip shows
// "Zotero" with its grey dot, the menu has no Extracted row, and the tooltip's
// Zotero line says Weavero's extraction is identical for this PDF. A pick of
// Extracted falls back to Zotero; Embedded still comes before Zotero; the Eval
// mark records "zotero" and that Extracted was identical. One changed entry
// (a title, a level or a place): Extracted, amber, as before.

describe("Weavero — Extracted identical to Zotero's is shown as Zotero (outline2.6)", function () {
    let wv;
    const saved = {};
    const EX = "Extracted: Weavero’s outline, built from Zotero’s structure data for this PDF";
    const EM = "Embedded: the outline saved inside the document file";
    const ZO = "Zotero: Zotero’s own extracted outline, unchanged";
    const ZO_SAME = "Zotero: Zotero’s own extracted outline, unchanged — Weavero’s extraction is identical for this PDF";
    const HEAD_SWITCH = "The outline’s source (click to switch):";
    const HEAD = "The outline’s source:";

    const stub = (map) => { for (const k of Object.keys(map)) { if (!(k in saved)) saved[k] = Object.prototype.hasOwnProperty.call(wv, k) ? { v: wv[k] } : null; wv[k] = map[k]; } };
    const unstub = () => { for (const k of Object.keys(saved)) { if (saved[k] === null) delete wv[k]; else wv[k] = saved[k].v; delete saved[k]; } };
    const node = (title, page, items, y) => ({ title, url: null, position: { pageIndex: page, rects: [[72, y || 500, 300, (y || 500) + 12]] }, href: null, items: items || [] });
    const tree = () => [node("1. Introduction", 0), node("2. Methods", 1, [node("2.1. Set-up", 1, [], 400)]), node("References", 2)];
    const doc = () => Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-src-same");

    /** The fetch for a stand-in PDF reader whose pack gives these outlines. */
    async function fetchWith(data, pick) {
        const reader = { _type: "pdf" };
        if (pick) reader._wvOutlinePick = pick;
        stub({ _wvOutlineSdtFor: async () => ({ stamp: "spec-stamp", data }) });
        try {
            const r = await wv._wvReaderFetchOutline(reader);
            reader._wvOutlineCache = r;
            return { r, reader };
        }
        finally { unstub(); }
    }
    /** The header rendered for that reader: its chip, label, tooltip lines. */
    function chipOf(reader) {
        const d = doc();
        const view = d.createElement("div");
        const head = d.createElement("div");
        head.className = "wv-outline-head";
        view.appendChild(head);
        d.body.appendChild(view);
        stub({ _wvReaderAtt: () => null });
        try { wv._wvOutlineRenderHeader(reader, d, view, reader._wvOutlineCache.source); }
        finally { unstub(); }
        const chip = view.querySelector(".wv-outline-src-chip");
        assert.ok(chip, "the chip");
        return { chip, label: String(chip.textContent || "").trim(), lines: String(chip.getAttribute("title") || "").split("\n") };
    }
    function menuTitles(reader, sources, current) {
        const d = doc();
        const a = d.createElement("button");
        d.body.appendChild(a);
        stub({ _wvReaderAtt: () => null, _wvReaderReachableDocs: () => ({ docs: [], wins: [] }) });
        try {
            wv._wvOutlineShowSourceMenu(reader, d, a, sources, current);
            const rows = [...d.querySelectorAll(".wv-ctx-item")].map(r => r.getAttribute("title"));
            wv._wvCloseReaderBmContextMenu(d);
            return rows;
        }
        finally { unstub(); }
    }

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvReaderFetchOutline", "_wvOutlineRenderHeader", "_wvOutlineShowSourceMenu", "_wvOutlineAvailableSources", "_wvOeMark"]) wvT.method(m);
    });

    it("identical: the chip says Zotero (grey), no Extracted in the menu, the tooltip says the extraction is identical", async function () {
        const z = tree();
        z[0].title = "1.  Introduction ";   // spaces aside, the same title
        const { r, reader } = await fetchWith({ extracted: tree(), embedded: [], zotero: z });
        assert.equal(r.source, "zotero");
        assert.deepEqual(r.order, ["zotero"]);
        assert.isTrue(r.extractedSame);
        assert.notProperty(r.alts, "extracted", "no Extracted source");
        stub({ _wvReaderAtt: () => null });
        try { assert.deepEqual(wv._wvOutlineAvailableSources(reader, "zotero"), ["zotero"], "the menu's sources"); }
        finally { unstub(); }
        const c = chipOf(reader);
        assert.equal(c.label, "Zotero");
        assert.isTrue(c.chip.classList.contains("wv-outline-src-zotero"), "the grey dot's class");
        assert.isFalse(c.chip.classList.contains("wv-outline-src-switchable"), "one source: no switch");
        assert.deepEqual(c.lines, [HEAD, "✓ " + ZO_SAME]);
    });

    it("one changed title: Extracted (amber), Zotero's one click away, as before", async function () {
        const e = tree();
        e[1].items[0].title = "2.1. Experimental set-up";
        const { r, reader } = await fetchWith({ extracted: e, embedded: [], zotero: tree() });
        assert.equal(r.source, "extracted");
        assert.deepEqual(r.order, ["extracted", "zotero"]);
        assert.isFalse(r.extractedSame);
        const c = chipOf(reader);
        assert.equal(c.label, "Extracted");
        assert.isTrue(c.chip.classList.contains("wv-outline-src-extracted"));
        assert.deepEqual(c.lines, [HEAD_SWITCH, "✓ " + EX, ZO]);
        assert.deepEqual(menuTitles(reader, ["extracted", "zotero"], "extracted"), [EX, ZO]);
    });

    it("one changed level or one changed place is a change too", async function () {
        const lvl = tree();
        lvl.push(lvl[1].items.pop());   // 2.1 at the top level
        assert.equal((await fetchWith({ extracted: lvl, embedded: [], zotero: tree() })).r.source, "extracted", "a level");
        const pos = tree();
        pos[2].position = { pageIndex: 2, rects: [[72, 480, 300, 492]] };
        assert.equal((await fetchWith({ extracted: pos, embedded: [], zotero: tree() })).r.source, "extracted", "a place");
    });

    it("a pick of Extracted falls back to Zotero when they are identical", async function () {
        const { r } = await fetchWith({ extracted: tree(), embedded: [], zotero: tree() }, "extracted");
        assert.equal(r.source, "zotero");
    });

    it("Embedded still comes before Zotero; Zotero's menu row says the extraction is identical", async function () {
        const emb = [node("Introduction", 0), node("Methods", 1)];
        const { r, reader } = await fetchWith({ extracted: tree(), embedded: emb, zotero: tree() });
        assert.deepEqual(r.order, ["embedded", "zotero"]);
        assert.equal(r.source, "embedded");
        assert.deepEqual(chipOf(reader).lines, [HEAD_SWITCH, "✓ " + EM, ZO_SAME]);
        assert.deepEqual(menuTitles(reader, ["embedded", "zotero"], "embedded"), [EM, ZO_SAME]);
    });

    it("the Eval mark records Zotero's source and that Extracted was identical", async function () {
        const { reader } = await fetchWith({ extracted: tree(), embedded: [], zotero: tree() });
        const root = { cases: {} };
        stub({
            _wvOeEnabled: () => true,
            _wvOeInit: async () => {},
            _wvOePersist: async () => {},
            _wvOeRoot: root,
            _wvReaderAtt: () => ({ libraryID: 1, itemKey: "SPEC" }),
            _wvReaderPanelNote: () => {},
        });
        try {
            await wv._wvOeMark(reader, doc(), "good");
            const c = root.cases["1:SPEC"];
            assert.ok(c, "the case");
            assert.equal(c.source, "zotero");
            assert.isTrue(c.extractedSame);
        }
        finally { unstub(); }
    });
});
