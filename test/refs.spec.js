/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// References in your library: Zotero's citation popup (src/modules/refs.ts,
// plan work/refs-feature-plan-2026-11-18.md, parts A and D), the marks beside
// the reference list's entries (B2) and the reader's References section (C).
//
// The fixture is a two-page PDF written here (Helvetica): a body whose
// citations "[1]" ... "[4]" Zotero links to the four entries of a numbered
// reference list on page 2 -- Zotero 11's structure data flags them
// (`reference: true`) and its citation overlays carry them, measured
// 2026-11-18 on 11.0-beta.4 (D:/tmp/wv-scripts/refs-probe-synth.py). The
// library around it:
//   [1] an article with a PDF                       -> ● Tab Window Split ⋯
//   [2] an article without a PDF                    -> ○ Show in Library ⋯
//   [3] nothing                                     -> no mark
//   [4] two copies: My Library without a PDF, a test group (made here) with
//       one -> ●, the group's copy opened, Show in Library ▸ (group, My Library) in ⋯
// The library badges (MJT 2026-11-19: a reference whose copies are all in
// other libraries than the citing paper's shows the badge of the library its
// best copy is in) are checked with copies added for a moment -- [3] in the
// group -- and on a second citing paper, in that group, opened beside: there
// [1] and [2] are only in My Library (and [2] in a second group too), [3]
// only in the second group, [4] in the same group.
// The popup is opened through the view's own path (pdf-view.js
// _openOverlayPopup on Zotero 11; on Zotero 10.0.8, which has no such
// method, its two steps by hand with an object built in the reader's window).
// Private members this relies on, each a red test the day Zotero changes it:
// `_internalReader._state.primaryViewOverlayPopup.references`, the popup's
// `.citation-popup .reference-row`, `Zotero.SDT.getPack()` (lib/sdt.ts) ->
// `materialize()`.

describe("Weavero — references in your library: the citation popup", function () {
    this.timeout(240000);
    const Cu = Components.utils;
    const made = [];
    let wv, win, ZT, reader, ir, pv, group = null, groupB = null;
    let citing, citingAtt, a1, a1pdf, a1img, a2, a4u, a4g, a4gpdf, fresh, freshPdf;
    let fpBefore = null, prevSplit;
    const A1_ABSTRACT = "We study drops falling on a plate heated above the Leidenfrost point inside a vacuum chamber. "
        + "High-speed imaging resolves the first microseconds of the impact, and simulations reproduce the shapes measured. "
        + "The maximal spreading follows a scaling law derived from an energy balance that includes the vapour layer. "
        + "Three regimes are separated by critical impact velocities, and a model of the vapour layer under the drop explains "
        + "the transitions between them. The model agrees with the experiments within ten percent over two decades of pressure.";

    const ENTRIES = [
        ["Adams, J., Brown, K. & Clark, L. 2016 Drop impact on a heated plate in a vacuum chamber.", "J. Test Mech. 812, 101-120."],
        ["Davis, M. & Evans, P. 2019 Bubble entrapment beneath falling droplets of viscous oil.", "Phys. Rev. Test 4, 053601."],
        ["Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics.", "Annu. Rev. Test Fluid 53, 33-58."],
        ["Garcia, S., Hill, T. & Irwin, U. 2018 Splashing of ethanol drops on smooth glass surfaces.", "Exp. Test Fluids 59, 77."],
    ];

    function fixturePDF() {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        let p1 = line(72, 740, 14, "WV-TEST references fixture");
        let y = 700;
        for (const t of ["Drops were studied before [1], and bubbles were trapped [2].", "Thin films drain slowly [3], and ethanol splashes [4].",
            "All four agree [1, 2, 3, 4]."]) { p1 += line(72, y, 10, t); y -= 14; }
        let p2 = line(72, 740, 12, "References");
        y = 715;
        ENTRIES.forEach(([a, c], i) => { p2 += line(72, y, 9, "[" + (i + 1) + "]"); p2 += line(90, y, 9, a); y -= 11; p2 += line(90, y, 9, c); y -= 15; });
        const objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Length " + p1.length + " >>\nstream\n" + p1 + "endstream",
            "<< /Length " + p2.length + " >>\nstream\n" + p2 + "endstream",
        ];
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    async function importFile(name, text, opts, ext) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + (ext || ".pdf"));
        if (typeof text === "string") await IOUtils.writeUTF8(path, text);
        else await IOUtils.write(path, text);
        const att = await Zotero.Attachments.importFromFile(Object.assign({ file: Zotero.File.pathToFile(path) }, opts || {}));
        try { await IOUtils.remove(path); } catch (e) {}
        return att;
    }
    /** A PNG of w x h (a picture to stand for a graphical abstract), drawn in the main window. */
    async function pngBytes(w, h) {
        const c = /** @type {any} */ (Zotero.getMainWindow().document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"));
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        g.fillStyle = "#2c7be5"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#f5a623"; g.beginPath(); g.arc(w / 2, h / 2, h / 3, 0, Math.PI * 2); g.fill();
        const bin = atob(c.toDataURL("image/png").split(",")[1]);
        const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
    }
    async function article(fields, libraryID) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = libraryID || Zotero.Libraries.userLibraryID;
        for (const k of Object.keys(fields)) if (!k.startsWith("_")) it.setField(k, fields[k]);
        it.setCreators(fields._creators || [{ creatorType: "author", lastName: fields._first || "Nobody", firstName: "A." }]);
        await it.saveTx();
        return it;
    }
    /** Retry an ASYNC check until it holds (wvT.waitFor does not await a promise). */
    async function until(fn, ms, every) {
        const end = Date.now() + ms;
        for (;;) {
            let v = false;
            try { v = await fn(); } catch (e) { v = false; }
            if (v || Date.now() > end) return v;
            await wvT.sleep(every || 300);
        }
    }

    /** What the library holds that a view might change: every item's version
     *  and dateModified, and the counts of its data, tags, relations, notes. */
    async function fingerprint() {
        const rows = await Zotero.DB.queryAsync("SELECT itemID, version, dateModified, synced FROM items ORDER BY itemID");
        const parts = rows.map(r => r.itemID + ":" + r.version + ":" + r.dateModified + ":" + r.synced);
        for (const t of ["itemData", "itemTags", "itemRelations", "itemNotes", "itemCreators", "collectionItems"]) {
            parts.push(t + "=" + await Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM " + t));
        }
        return parts.join("|");
    }

    const popupEl = () => reader._iframeWindow.document.querySelector(".citation-popup");
    const rowsOf = () => { const p = popupEl(); return p ? Array.from(p.querySelectorAll(".reference-row")) : []; };
    const ctlOf = (row) => row && row.querySelector(":scope > .wv-refs-ctl");
    const actsOf = (row) => { const c = ctlOf(row); return c ? Array.from(c.querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act")) : []; };
    /** The row's mark: its own child, at its start, as in the References section and the PDF's margin. */
    const rowMark = (row) => row && row.querySelector(":scope > .wv-refs-row-mark");
    const kindOf = (row) => { const m = rowMark(row); return m ? m.getAttribute("data-wv-refs-kind") : null; };
    const state = () => { try { return ir._state.primaryViewOverlayPopup || null; } catch (e) { return null; } };
    /** Row i of the popup is the entry whose text starts like ENTRIES[k]: rows follow the overlay's order. */
    const rowFor = (k) => {
        const st = state();
        if (!st) return null;
        const rows = rowsOf();
        for (let i = 0; i < st.references.length; i++) if (String(st.references[i].text).includes(ENTRIES[k][0].slice(0, 20))) return rows[i];
        return null;
    };
    const tabOfItem = (id) => ZT._tabs.find(t => t && t.data && t.data.itemID === id && String(t.type).startsWith("reader"));
    /** Rest the pointer on a popup row (several references): the reference's card beside
     *  the popup once the rest is over (MJT 2026-11-20, "When multiple, the detailed one
     *  could appear on hover"). */
    async function hoverCardOf(row) {
        const iw = row.ownerDocument.defaultView;
        const p0 = row.closest(".citation-popup");
        // Another row's card stays until this row's replaces it (no flicker between rows):
        // wait for a card that was not there before.
        const before = p0 && p0.querySelector(":scope > .wv-refs-hcard > .wv-refs-card");
        row.dispatchEvent(new iw.MouseEvent("mouseenter", Cu.cloneInto({ bubbles: false }, iw)));
        return wvT.waitFor(() => { const p = row.closest(".citation-popup"); const c = p && p.querySelector(":scope > .wv-refs-hcard > .wv-refs-card"); return c && c !== before ? c : null; }, 3000, 30);
    }
    async function hoverLeave(row) {
        const iw = row.ownerDocument.defaultView;
        const p = row.closest(".citation-popup");
        row.dispatchEvent(new iw.MouseEvent("mouseleave", Cu.cloneInto({ bubbles: false }, iw)));
        return wvT.waitFor(() => !(p && p.querySelector(":scope > .wv-refs-hcard")), 3000, 30);
    }

    async function closePopup() {
        try { pv._onSetOverlayPopup(null); } catch (e) {}
        await wvT.waitFor(() => !state() && !popupEl(), 5000, 50);
    }

    let citeOverlay = null;
    /** Zotero's citation overlay of page 1 with the most references ("[1, 2, 3, 4]"). */
    async function findOverlay() {
        return wvT.waitFor(() => {
            try {
                const ovs = pv._pdfPages && pv._pdfPages[0] && pv._pdfPages[0].overlays;
                if (!ovs) return null;
                let best = null;
                for (const o of ovs) if (o && o.type === "citation" && o.references && (!best || o.references.length > best.references.length)) best = o;
                return best && best.references.length === 4 ? best : null;
            } catch (e) { return null; }
        }, 30000, 200);
    }

    /** Open the citation popup as a hover does, and wait for its rows and Weavero's marks. */
    async function openPopup(wantMarks = true) {
        await closePopup();
        if (typeof pv._openOverlayPopup === "function") await pv._openOverlayPopup(citeOverlay);
        else {
            const W = Cu.waiveXrays(reader._iframeWindow);
            const rect = pv.getClientRect(citeOverlay.position.rects[0], citeOverlay.position.pageIndex);
            const popup = W.Object.assign(new W.Object(), citeOverlay);
            popup.rect = Cu.cloneInto(Array.from(rect), W);
            pv._selectedOverlay = citeOverlay;
            pv._onSetOverlayPopup(popup);
        }
        const ok = await wvT.waitFor(() => rowsOf().length === 4 && (!wantMarks || ctlOf(rowFor(0))), 15000, 50);
        assert.ok(ok, "the popup shows its 4 rows" + (wantMarks ? " and the first is marked" : "") + " (rows " + rowsOf().length + ")");
    }

    function press(row, act) {
        const btn = ctlOf(row).querySelector('.wv-refs-btn[data-wv-refs-act="' + act + '"]');
        assert.ok(btn, "a " + act + " button");
        const iw = reader._iframeWindow;
        const PE = iw.PointerEvent || iw.MouseEvent;
        btn.dispatchEvent(new PE("pointerdown", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }, iw)));
        return btn;
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvRefsWireReader", "_wvRefsDecorate", "_wvRefsEntries", "_wvRefsIndexEnsure", "_wvRefsAct", "_wvRefsReaderTeardown",
            "_wvRefsSmartPopup", "_wvRefsMarksDraw", "_wvReadingModeActive", "_wvTabDockOf", "_wvOpenTarget", "_wvTabSplitOf", "_wvTabSplitSeparate"]) wvT.method(m);
        win = Zotero.getMainWindow();
        ZT = win.Zotero_Tabs;
        prevSplit = Zotero.Prefs.get("weavero.enableSplitView");
        Zotero.Prefs.set("weavero.enableSplitView", true);
        // A group library, as Zotero's own test support makes one.
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        group = new Zotero.Group();
        Object.assign(group, { id: Zotero.Utilities.rand(10000, 1000000), name: "wv-refs-group", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        groupB = new Zotero.Group();
        let idB = Zotero.Utilities.rand(10000, 1000000);
        while (idB === group.id) idB = Zotero.Utilities.rand(10000, 1000000);
        Object.assign(groupB, { id: idB, name: "wv-refs-group-b", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await groupB.saveTx();
        const minimal = wvT.minimalPDFBytes();
        citing = await article({ title: "WV-TEST references fixture", DOI: "10.5555/wv.refs.citing", date: "2026", _first: "Tester" });
        // [1] with what the reference card shows (1.2.1-refs.9): four authors, a
        // journal, an abstract longer than four lines, a graphical abstract.
        a1 = await article({ title: "Drop impact on a heated plate in a vacuum chamber", date: "2016", volume: "812", pages: "101-120", _first: "Adams",
            publicationTitle: "Journal of Test Mechanics", abstractNote: A1_ABSTRACT,
            _creators: [["Adams", "Jean-Marc"], ["Brown", "Karen"], ["Clark", "Lee"], ["Dunn", "Mary"]].map(([l, f]) => ({ creatorType: "author", lastName: l, firstName: f })) });
        a2 = await article({ title: "Bubble entrapment beneath falling droplets of viscous oil", date: "2019", _first: "Davis" });
        a4u = await article({ title: "Splashing of ethanol drops on smooth glass surfaces", date: "2018", _first: "Garcia" });
        a4g = await article({ title: "Splashing of ethanol drops on smooth glass surfaces", date: "2018", _first: "Garcia", abstractNote: "Ethanol drops splash on glass." }, group.libraryID);
        made.push(citing, a1, a2, a4u, a4g);
        citingAtt = await importFile("wv-refs-citing", fixturePDF(), { parentItemID: citing.id });
        a1pdf = await importFile("wv-refs-a1", minimal, { parentItemID: a1.id });
        a4gpdf = await importFile("wv-refs-a4g", minimal, { parentItemID: a4g.id });
        made.push(citingAtt, a1pdf, a4gpdf);
        a1img = await importFile("wv-refs-a1-ga", await pngBytes(480, 280), { parentItemID: a1.id }, ".png");
        a1img.setField("title", "Graphical abstract");
        await a1img.saveTx();
        made.push(a1img);
        // A paper whose PDF no reader opens (the library pane's "no cache" case).
        fresh = await article({ title: "WV-TEST a paper whose PDF was never opened", date: "2020", _first: "Fresh" });
        freshPdf = await importFile("wv-refs-fresh", minimal, { parentItemID: fresh.id });
        made.push(fresh, freshPdf);
        fpBefore = await fingerprint();
        reader = await wvT.openReaderTab(citingAtt.id);
        assert.ok(reader, "the citing paper opened");
        ir = Cu.waiveXrays(reader._internalReader);
        pv = await wvT.waitFor(() => {
            try {
                const v = ir._primaryView;
                return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount === 2 && v._pdfPages && v._pdfPages[0] ? v : null;
            } catch (e) { return null; }
        }, 30000);
        assert.ok(pv, "the PDF view is up");
        citeOverlay = await findOverlay();
        assert.ok(citeOverlay, "Zotero linked the citation [1, 2, 3, 4] to the four entries");
        await wvT.waitFor(() => reader._wvRefsMO, 15000, 100);
        assert.ok(reader._wvRefsMO, "the reader's page is wired");
    });

    after(async function () {
        try { await closePopup(); } catch (e) {}
        try { delete wv._wvRefsSmartPopup; } catch (e) {}
        try { delete wv._wvReadingModeActive; } catch (e) {}
        try { if (cpWas !== null) win.ZoteroContextPane.collapsed = cpWas; } catch (e) {}
        // Split opens a pair (no lock since 1.2.1-refs.6): separated, and the
        // recorded splits cleared, as split-view.spec.js ends.
        try { const s = wv._wvTabSplitOf(win, reader.tabID); if (s && !s.dock) wv._wvTabSplitSeparate(win, s.id); } catch (e) {}
        try { for (const r of Zotero.Reader._readers.slice()) if (r._window && r._window !== win && [a1pdf.id, a4gpdf.id].includes(r.itemID)) r._window.close(); } catch (e) {}
        for (const it of [a1pdf, a4gpdf]) { const t = it && tabOfItem(it.id); if (t) { try { ZT.close(t.id); } catch (e) {} } }
        try { wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(500);
        try { ZT.select("zotero-pane"); } catch (e) {}
        await wvT.erase(...made.slice().reverse());
        try { if (group) await group.eraseTx(); } catch (e) {}
        try { if (groupB) await groupB.eraseTx(); } catch (e) {}
        try { if (prevSplit === undefined) Zotero.Prefs.clear("weavero.enableSplitView"); else Zotero.Prefs.set("weavero.enableSplitView", prevSplit); } catch (e) {}
        try { Zotero.Prefs.clear("weavero.tabSplits"); } catch (e) {}
    });

    // The open's timeline (refs.ts tlMark; the marks bench reads it, work/refs-marks-speed-2026-11-21.md):
    // every phase of the References work for this open, in order, numbers and ids only. First in the
    // file: the next test reads the list itself, and the structure's phases (sdt, mat) are timed by
    // the read the open makes.
    it("the open's timeline: each phase of the References work, in order, on Zotero._wvRefsTimeline -- numbers and ids, never the reader", async function () {
        const rec = await wvT.waitFor(() => {
            const T = /** @type {any} */ (Zotero)._wvRefsTimeline;
            const r = T && Array.isArray(T.opens) ? T.opens.slice().reverse().find(x => x.att === citingAtt.id) : null;
            return r && r.ev && r.ev.marks != null ? r : null;
        }, 30000, 100);
        assert.ok(rec, "a record of this open with its marks drawn: " + JSON.stringify(/** @type {any} */ (Zotero)._wvRefsTimeline || null).slice(0, 400));
        const order = ["wire", "paint", "idle", "prep", "stamp", "sdt", "mat", "list", "ix", "match", "marks"];
        for (const k of order) assert.isNumber(rec.ev[k], "phase " + k + " timed: " + JSON.stringify(rec.ev));
        for (let i = 1; i < order.length; i++) assert.isAtLeast(rec.ev[order[i]], rec.ev[order[i - 1]], order[i] + " after " + order[i - 1] + ": " + JSON.stringify(rec.ev));
        assert.equal(rec.ev.wire, 0, "times from the wiring");
        assert.equal(rec.entries, 4, "the list's four entries");
        assert.equal(rec.marksN, 4, "four marks drawn");
        assert.isBoolean(rec.cache, "whether the structure was cached");
        assert.include(["ready", "building", "none"], rec.ixAt, "the index's state at the prepare");
        assert.isAtMost(/** @type {any} */ (Zotero)._wvRefsTimeline.opens.length, 50, "a ring of the last 50 opens");
        for (const [k, v] of Object.entries(rec)) {
            assert.ok(v === null || typeof v !== "object" || v === rec.ev, "only plain values on the record: " + k);
        }
        for (const v of Object.values(rec.ev)) assert.isNumber(v, "phase times are numbers");
    });

    it("the paper's reference list comes from Zotero's structure data: four entries, each with its box on page 2", async function () {
        const SDT = /** @type {any} */ (Zotero).SDT;
        // getPack (every Zotero with SDT) or getReader (removed by zotero#6012).
        assert.ok(SDT && (typeof SDT.getPack === "function" || typeof SDT.getReader === "function"), "Zotero.SDT.getPack (the structure data's bytes) is there");
        const entries = await wv._wvRefsEntries(citingAtt.id);
        assert.equal(entries.length, 4, "four entries: " + JSON.stringify(entries.map(e => e.text.slice(0, 30))));
        ENTRIES.forEach(([a], i) => assert.include(entries[i].text.replace(/\s+/g, " "), a.slice(0, 40), "entry " + (i + 1) + " in order"));
        for (const e of entries) assert.ok(e.rects.length && e.rects[0][0] === 1, "a box on page index 1: " + JSON.stringify(e.rects));
    });

    // zotero#6012 (semantic search) removes Zotero.SDT.getReader; getPack stays
    // (canary run 2026-11-22, work/canary-2026-11-21.md section 3). lib/sdt.ts
    // reads the bytes through getPack and opens them with the bundled module,
    // getReader only where there is no getPack. Stand-ins of both shapes in
    // place of Zotero.SDT, for the reader _wvRefsEntries uses: the same four entries.
    it("the list comes through getPack on a Zotero without getReader (zotero#6012), and through getReader on one without getPack", async function () {
        const Z = /** @type {any} */ (Zotero);
        const SDT = Z.SDT;
        const L = wvT.lib();
        assert.ok(L && typeof L.wvSdtReader === "function", "lib.wvSdtReader");
        wvT.method("_wvRefsWalk");
        const calls = [];
        const noReader = { getPack: function () { calls.push("getPack"); return SDT.getPack.apply(SDT, arguments); } };
        const noPack = {
            getReader: function (id) {
                calls.push("getReader");
                if (typeof SDT.getReader === "function") return SDT.getReader(id);
                return SDT.getPack(id).then(r => r && r.ok ? L.wvSdtOpen(r.bytes) : null);
            },
        };
        try {
            for (const [name, standIn, via] of [["no getReader", noReader, "getPack"], ["no getPack", noPack, "getReader"]]) {
                calls.length = 0;
                Z.SDT = standIn;
                let rd;
                try { rd = await L.wvSdtReader(citingAtt.id); }
                finally { Z.SDT = SDT; }
                assert.deepEqual(calls, [via], name + ": read through " + via);
                assert.ok(rd && typeof rd.materialize === "function", name + ": a pack reader");
                const entries = wv._wvRefsWalk(await rd.materialize(), citingAtt.id);
                assert.equal(entries.length, 4, name + ": four entries");
                ENTRIES.forEach(([a], i) => assert.include(entries[i].text.replace(/\s+/g, " "), a.slice(0, 40), name + ": entry " + (i + 1)));
            }
            // And no SDT at all (Zotero 10 before 10.0.8): nothing, no throw.
            Z.SDT = undefined;
            try { assert.equal(await L.wvSdtReader(citingAtt.id), null, "no Zotero.SDT: null"); }
            finally { Z.SDT = SDT; }
        }
        finally { Z.SDT = SDT; }
    });

    // MJT 2026-11-20: "a green circle if has the PDF file in my library, blue circle if in my
    // library without the PDF file, and empty grey circle if not in my library".
    it("marks every reference: a green dot with a PDF, a blue dot without, a grey ring for one you do not have (and the globe, Open in Browser)", async function () {
        await openPopup();
        const markOf = (row) => rowMark(row);
        const shapes = (row) => Array.from(markOf(row).querySelectorAll(":scope > svg > *")).map(n => [n.localName, n.getAttribute("fill"), n.getAttribute("stroke-width")]);
        const colour = (row) => reader._iframeWindow.getComputedStyle(markOf(row)).color;
        assert.equal(kindOf(rowFor(0)), "pdf", "[1]: an item with a PDF");
        assert.deepEqual(shapes(rowFor(0)), [["circle", "currentColor", null]], "[1]: a dot");
        assert.equal(colour(rowFor(0)), "rgb(95, 178, 54)", "[1]: Zotero's green");
        assert.equal(kindOf(rowFor(1)), "nopdf", "[2]: an item without one");
        assert.deepEqual(shapes(rowFor(1)), [["circle", "currentColor", null]], "[2]: a dot");
        assert.equal(colour(rowFor(1)), "rgb(64, 114, 229)", "[2]: the accent blue");
        // The ring is as wide as the dot, drawn bold enough to read on a dark pane
        // (MJT 2026-11-20: the ◐'s empty half could not be told apart).
        assert.equal(kindOf(rowFor(2)), "web", "[3]: not in the library");
        assert.deepEqual(shapes(rowFor(2)), [["circle", "none", "1.5"]], "[3]: one hollow ring");
        assert.equal(colour(rowFor(2)), "rgb(170, 170, 170)", "[3]: Zotero's grey");
        assert.equal(markOf(rowFor(2)).getAttribute("title"), "Not in your libraries.", "the ring's status, no click line: it does not act here");
        // The mark says where the reference is; the row's buttons act (MJT 2026-11-20).
        assert.deepEqual([0, 1, 2].map(k => markOf(rowFor(k)).getAttribute("data-wv-refs-act")), [null, null, null], "no act on a popup row's mark");
        assert.deepEqual([0, 1, 2].map(k => markOf(rowFor(k)).getAttribute("role")), [null, null, null], "not a button");
        assert.deepEqual(actsOf(rowFor(2)), ["web"], "[3]: the globe alone");
        assert.equal(kindOf(rowFor(3)), "pdf", "[4]: one of its two copies has a PDF");
        // The row's own text stays Zotero's.
        assert.include(rowFor(0).textContent, "Drop impact on a heated plate");
        assert.ok(rowFor(0).firstElementChild.classList.contains("wv-refs-ctl"), "the controls come first, React's own text after them");
        // The mark at the row's start, left of its number, on its first line, every row's in
        // one column -- as in the References section and the PDF's margin (MJT 2026-11-20,
        // "The circle should go to the left of the references").
        const xs = [];
        for (const k of [0, 1, 2, 3]) {
            const row = rowFor(k);
            const dot = markOf(row).querySelector(":scope > svg").getBoundingClientRect();
            const lab = row.querySelector(":scope > .wv-refs-rowtext .wv-refs-row-label");
            const first = (lab || row.querySelector(":scope > .wv-refs-rowtext")).getClientRects()[0];
            const r = row.getBoundingClientRect();
            assert.ok(dot.left >= r.left && dot.right <= first.left, "[" + (k + 1) + "] the dot before the number (dot " + dot.left + ".." + dot.right + ", number at " + first.left + ", row at " + r.left + ")");
            const mid = (dot.top + dot.bottom) / 2;
            assert.ok(mid > first.top && mid < first.bottom, "[" + (k + 1) + "] on the first line (dot middle " + mid + ", line " + first.top + ".." + first.bottom + ")");
            xs.push(dot.left);
        }
        assert.isAtMost(Math.max(...xs) - Math.min(...xs), 0.5, "every row's dot in one column: " + xs.join(" "));
    });

    // MJT 2026-11-20: "make the number in bold and add the space after it in the popup, same
    // as in the item pane".
    it("the popup's rows show the entry's number apart and bold, then one space; React's own text is left as it is and followed", async function () {
        await openPopup();
        const row = rowFor(0);
        const copy = row.querySelector(":scope > .wv-refs-rowtext");
        assert.ok(copy, "the row's text with its number apart: " + row.innerHTML.slice(0, 200));
        const lab = copy.querySelector(".wv-refs-row-label");
        assert.ok(lab && copy.firstChild === lab, "the number first");
        assert.equal(lab.textContent, "[1]");
        assert.match(copy.textContent, /^\[1\] Adams, J\./, "one space, then the text");
        assert.isAtLeast(parseInt(row.ownerDocument.defaultView.getComputedStyle(lab).fontWeight, 10), 600, "bold");
        const src = Array.from(row.children).find(c => c.localName === "div" && !c.hasAttribute("class"));
        assert.ok(src && /^\[1\]/.test(src.textContent.trim()), "React's text untouched");
        assert.equal(row.ownerDocument.defaultView.getComputedStyle(src).display, "none", "and hidden");
        // React writes the row again (another citation in the same popup): the copy follows.
        const tn = row.ownerDocument.createTreeWalker(src, 4).nextNode();
        const was = tn.nodeValue;
        tn.nodeValue = was.replace("Adams", "Adamz");
        try {
            assert.ok(await wvT.waitFor(() => /Adamz/.test(row.querySelector(":scope > .wv-refs-rowtext").textContent) || null, 3000, 20), "the copy follows React's text");
        }
        finally { tn.nodeValue = was; }
    });

    it("the buttons: Tab, Window, Split and ⋯ with a PDF; Show in Library and ⋯ without; the copy with a PDF is the one opened", async function () {
        await openPopup();
        // Copy As in place of a ⋯ (MJT 2026-11-20, "The Show in Library and Copy As options
        // are too many steps away now").
        // Split before Window (MJT 2026-11-20, "Open in split view should be before the open in new window").
        assert.deepEqual(actsOf(rowFor(0)), ["tab", "split", "window", "copy"]);
        assert.deepEqual(actsOf(rowFor(1)), ["library", "copy"]);
        // Show in Library: My Library's own icon, in its blue (MJT 2026-11-20).
        const libPath = ctlOf(rowFor(1)).querySelector('.wv-refs-btn[data-wv-refs-act="library"] svg path');
        assert.equal(libPath && String(libPath.getAttribute("fill")).toLowerCase(), "#4072e5", "the library button wears My Library's icon");
        assert.deepEqual(actsOf(rowFor(3)), ["tab", "split", "window", "copy"]);
        const ids4 = String(ctlOf(rowFor(3)).getAttribute("data-wv-refs-ids")).split(",").map(Number);
        assert.deepEqual(ids4, [a4g.id, a4u.id], "the group's copy (with a PDF) first, My Library's after it");
        for (const b of ctlOf(rowFor(0)).querySelectorAll(".wv-refs-btn")) assert.ok(b.getAttribute("title"), "each button says what it does");
        // Shown only while the row is under the pointer, over its end, the text using the
        // row's whole width -- the References section's rows (MJT 2026-11-20, "The buttons
        // could appear only on hover, to match the item pane design").
        const row = rowFor(0), view = row.ownerDocument.defaultView, ctl = ctlOf(row);
        assert.equal(view.getComputedStyle(ctl).display, "none", "no buttons while the pointer is elsewhere");
        const textW = row.querySelector(":scope > .wv-refs-rowtext").getBoundingClientRect().width;
        InspectorUtils.addPseudoClassLock(row, ":hover");
        try {
            assert.equal(view.getComputedStyle(ctl).display, "flex", "the buttons on hover");
            assert.equal(view.getComputedStyle(ctl).position, "absolute", "over the row's end");
            assert.approximately(row.querySelector(":scope > .wv-refs-rowtext").getBoundingClientRect().width, textW, 0.5, "the text does not move for them");
            const c = ctl.getBoundingClientRect(), r = row.getBoundingClientRect();
            assert.ok(c.right <= r.right + 0.5 && c.right > r.right - 10, "at the row's end (" + c.right + " in " + r.right + ")");
        }
        finally { InspectorUtils.removePseudoClassLock(row, ":hover"); }
    });

    it("Tab opens the cited PDF in a tab of this window, selected; a second press reuses it", async function () {
        await openPopup();
        press(rowFor(0), "tab");
        const t = await wvT.waitFor(() => { const x = tabOfItem(a1pdf.id); return x && ZT.selectedID === x.id ? x : null; }, 15000);
        assert.ok(t, "the cited PDF's tab is selected");
        assert.notOk(state(), "the popup closed");
        const n = ZT._tabs.length;
        ZT.select(reader.tabID);
        await wvT.sleep(400);
        await openPopup();
        press(rowFor(0), "tab");
        await wvT.waitFor(() => ZT.selectedID === t.id, 10000);
        assert.equal(ZT.selectedID, t.id, "the same tab again");
        assert.equal(ZT._tabs.length, n, "no second tab");
        ZT.select(reader.tabID);
        await wvT.sleep(400);
    });

    it("Window opens the cited PDF in a new window", async function () {
        await openPopup();
        press(rowFor(3), "window");
        const r = await wvT.waitFor(() => (Zotero.Reader._readers || []).find(x => {
            try { return x.itemID === a4gpdf.id && x._window && x._window !== win && x._internalReader; } catch (e) { return false; }
        }), 20000);
        assert.ok(r, "a reader of the group copy's PDF, in another window");
        await wvT.sleep(800);
        try { r._window.close(); } catch (e) {}
        await wvT.sleep(800);
        try { win.focus(); } catch (e) {}
    });

    // MJT 2026-11-19: "When using Open Beside This Paper, it should use the
    // Weavero split view instead of the locked tab" -- the split view's shared
    // "beside" open (open-where.ts), as a link's Ctrl/Cmd+click; 1.1.1-refs.1 to
    // .5 locked the citing paper (Lock Tab).
    it("Split shows the cited PDF beside the citing paper, a pair of the two (no lock); the next Split from the same paper takes the pair's other side", async function () {
        ZT.select(reader.tabID);
        await wvT.sleep(400);
        const pairWith = (itemID) => {
            const s = wv._wvTabSplitOf(win, reader.tabID);
            const t = tabOfItem(itemID);
            return s && t && !s.dock && !s.picker && [s.left, s.right].includes(reader.tabID) && [s.left, s.right].includes(t.id) ? s : null;
        };
        await openPopup();
        press(rowFor(0), "split");
        const s1 = await wvT.waitFor(() => { const s = pairWith(a1pdf.id); return s && ZT.selectedID === tabOfItem(a1pdf.id).id ? s : null; }, 15000);
        assert.ok(s1, "a pair of the citing tab and the cited PDF's, the cited one selected: " + JSON.stringify(wv._wvTabSplitOf(win, reader.tabID)));
        assert.notOk(wv._wvTabDockOf(win), "no lock");
        assert.notOk(state(), "the popup closed");
        const side = s1.left === reader.tabID ? "left" : "right";
        // From the citing side again: the other copy's PDF takes the pair's other side.
        ZT.select(reader.tabID);
        await wvT.sleep(400);
        await openPopup();
        press(rowFor(3), "split");
        const s2 = await wvT.waitFor(() => { const s = pairWith(a4gpdf.id); return s && ZT.selectedID === tabOfItem(a4gpdf.id).id ? s : null; }, 15000);
        assert.ok(s2, "the citing paper with the new PDF beside it: " + JSON.stringify(wv._wvTabSplitOf(win, reader.tabID)));
        assert.equal(s2.left === reader.tabID ? "left" : "right", side, "the citing paper kept its side");
        const t1 = tabOfItem(a1pdf.id);
        assert.ok(t1, "the first PDF's tab stays open");
        assert.notOk(wv._wvTabSplitOf(win, t1.id), "as an ordinary tab");
        assert.notOk(wv._wvTabDockOf(win), "still no lock");
        wv._wvTabSplitSeparate(win, s2.id);
        ZT.select(reader.tabID);
        await wvT.sleep(500);
    });

    // MJT 2026-11-20: "Can you show that this reference is the one that is opened in split
    // view?" -> "Do all 3. Every citation of the paper."
    it("the paper open beside: its citations boxed, its margin mark ringed, its References row barred, in the split's accent; gone when the split goes", async function () {
        ZT.select(reader.tabID);
        await wvT.sleep(400);
        assert.ok(await wvT.waitFor(() => bibMarkOf(0), 10000, 100), "the margin marks");
        await openPopup();
        press(rowFor(0), "split");
        const s = await wvT.waitFor(() => { const x = wv._wvTabSplitOf(win, reader.tabID); const t = tabOfItem(a1pdf.id); return x && t && !x.picker && [x.left, x.right].includes(t.id) ? x : null; }, 15000);
        assert.ok(s, "[1]'s PDF beside the citing paper");
        // The citing side in front, the split on screen.
        ZT.select(reader.tabID);
        try {
            assert.ok(await wvT.waitFor(() => bibMarkOf(0) && bibMarkOf(0).hasAttribute("data-wv-refs-beside"), 8000, 100), "[1]'s margin mark ringed");
            assert.deepEqual([1, 2, 3].map(k => !!(bibMarkOf(k) && bibMarkOf(k).hasAttribute("data-wv-refs-beside"))), [false, false, false], "no other mark");
            const vd = viewDoc();
            assert.equal(vd.defaultView.getComputedStyle(bibMarkOf(0)).outlineStyle, "solid", "the ring");
            const boxes = await wvT.waitFor(() => { const b = Array.from(vd.querySelectorAll(".pdfViewer > .wv-refs-beside .wv-refs-beside-box")); return b.length ? b : null; }, 8000, 100);
            assert.ok(boxes, "its in-text citation boxed");
            assert.equal(boxes[0].parentNode.getAttribute("data-wv-page"), "0", "on page 1, where the citation is");
            const br = boxes[0].getBoundingClientRect();
            assert.ok(br.width > 5 && br.height > 5, "drawn (" + br.width + " x " + br.height + ")");
            assert.equal(vd.defaultView.getComputedStyle(boxes[0]).borderTopStyle, "solid", "a frame");
            await showSection();
            assert.ok(await wvT.waitFor(() => { const r = secRows().find(x => x.getAttribute("data-wv-refs-entry") === "0"); return !!(r && r.hasAttribute("data-wv-refs-beside")); }, 8000, 100), "[1]'s References row barred");
            assert.notOk(secRows().some(x => x.getAttribute("data-wv-refs-entry") !== "0" && x.hasAttribute("data-wv-refs-beside")), "no other row");
            // The paper wired again while the split stays (a reload, a split restored at
            // startup): the marks come back with no change of the split (MJT 2026-11-20,
            // "Ref 13 is opened in split view, but not identified in the PDF").
            wv._wvRefsReaderTeardown(reader);
            assert.notOk(viewDoc().querySelector(".wv-refs-beside"), "fixture: the boxes gone with the teardown");
            wv._wvRefsWireReader(reader);
            assert.ok(await wvT.waitFor(() => viewDoc().querySelector(".pdfViewer > .wv-refs-beside .wv-refs-beside-box"), 10000, 100), "the boxes back after the wiring, the split unchanged");
            assert.ok(await wvT.waitFor(() => bibMarkOf(0) && bibMarkOf(0).hasAttribute("data-wv-refs-beside"), 8000, 100), "the ring back");
        }
        finally {
            wv._wvTabSplitSeparate(win, s.id);
            ZT.select(reader.tabID);
        }
        assert.ok(await wvT.waitFor(() => !bibMarkOf(0).hasAttribute("data-wv-refs-beside") && !viewDoc().querySelector(".wv-refs-beside"), 8000, 100), "gone when the split goes");
        await wvT.sleep(300);
    });

    // MJT 2026-11-20: "make the changes that you decide to prevent Weavero from slowing down
    // opening PDF files" -- a book's 1314 entries were matched in one 457-ms task after its page 1.
    it("a long reference list is matched in steps: the read asking for it gets none, the rows come after with the same answers", async function () {
        const id = reader.itemID;
        const now = wv._wvRefsEntriesNow.get(id);
        assert.ok(now && now.length, "the fixture's list");
        const short = wv._wvRefsDocRows(reader);
        assert.ok(short, "the fixture's rows, in one task (a short list)");
        const want = short.rows.map(r => r.hit ? r.hit.ids.join(",") : "-");
        const long = [];
        for (let k = 0; k < 150; k++) long.push(Object.assign({}, now[k % now.length]));
        try {
            wv._wvRefsEntriesNow.set(id, long);
            assert.isNull(wv._wvRefsDocRows(reader), "none in the task that asks: matched in steps");
            const rows = await wvT.waitFor(() => wv._wvRefsDocRows(reader), 8000, 20);
            assert.ok(rows && rows.rows.length === 150, "then the 150 rows");
            assert.deepEqual(rows.rows.map(r => r.hit ? r.hit.ids.join(",") : "-"), long.map((e, k) => want[k % now.length]), "the same answers as in one task");
        }
        finally {
            wv._wvRefsEntriesNow.set(id, now);
            try { wv._wvRefsRowCache.delete(id); } catch (e) {}
        }
        assert.ok(wv._wvRefsDocRows(reader), "the fixture's rows again");
    });

    // 2026-11-21 night: the 214-page book's References section (1314 rows) was one 258 ms call inside
    // a 431 ms block after its first page (the open bench's attribution run).
    it("a long list's References section is built a slice at a time: the first rows at once, the rest after", async function () {
        wvT.method("_wvRefsSecBuild");
        const short = wv._wvRefsDocRows(reader);
        assert.ok(short && short.rows.length, "the fixture's rows");
        const rows = [];
        for (let k = 0; k < 300; k++) { const r = short.rows[k % short.rows.length]; rows.push({ i: k, entry: r.entry, hit: r.hit, shown: true }); }
        const doc = win.document;
        const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        doc.documentElement.appendChild(body);
        try {
            wv._wvRefsSecBuild(body, doc, reader, { rows, have: 0, total: rows.length });
            const now = body.querySelectorAll(".wv-refs-sec-row").length;
            assert.isAbove(now, 0, "rows at once");
            assert.isBelow(now, 300, "not all 300 in the call (" + now + ")");
            assert.ok(await wvT.waitFor(() => body.querySelectorAll(".wv-refs-sec-row").length === 300, 5000, 20), "then all 300");
            assert.deepEqual(Array.from(body.querySelectorAll(".wv-refs-sec-row")).map(r => Number(r.getAttribute("data-wv-refs-entry"))), rows.map(r => r.i), "in order");
        }
        finally { body.remove(); }
    });

    // MJT 2026-11-20: "The Show in Library and Copy As options are too many steps away now".
    it("a popup row's Copy As: the items list's copies at once; Show in Library: a library's name in the card", async function () {
        await openPopup();
        const b = ctlOf(rowFor(3)).querySelector('.wv-refs-btn[data-wv-refs-act="copy"]');
        assert.equal(b.getAttribute("title"), "Copy As", "the items list's words");
        assert.match(String(b.querySelector("img").getAttribute("src")), /^data:image\/png;base64,/, "the items list's Copy As icon");
        const btn = press(rowFor(3), "copy");
        const menu = await wvT.waitFor(() => { const m = win.document.getElementById("wv-refs-menu"); return m && m.querySelector("menuitem") ? m : null; }, 5000, 50);
        assert.ok(menu, "a menu at once (" + (menu && menu.state) + ")");
        assert.equal(menu.getAttribute("data-wv-refs-copyas"), "true", "the copies themselves, no submenu to go through");
        assert.notOk(menu.querySelector(".wv-refs-card"), "no card");
        assert.isAtLeast(menu.querySelectorAll(":scope > menuitem").length, 3, "Citation, Bibliography, the links...");
        assert.ok(state(), "the popup stays while the menu is open");
        menu.hidePopup();
        await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
        assert.ok(btn);
        // Show in Library: each library's name in the card shows the copy there, one click.
        const c = await hoverCardOf(rowFor(3));
        assert.ok(c, "[4]'s card");
        const names = Array.from(c.querySelectorAll(".wv-refs-card-lib .wv-refs-card-libname[role='button']"));
        assert.deepEqual(names.map(n => n.getAttribute("data-wv-refs-copy")), [String(a4g.id), String(a4u.id)], "each library's name, its copy");
        assert.match(String(names[1].getAttribute("title")), /^Show in /, "says what a click does");
        const shown = [];
        const sil = wv._wvRefsShowInLibrary;
        wv._wvRefsShowInLibrary = async (it) => { shown.push(it.id); return true; };
        try {
            names[1].dispatchEvent(new (names[1].ownerDocument.defaultView).MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, names[1].ownerDocument.defaultView)));
            assert.ok(await wvT.waitFor(() => shown.length, 3000, 20), "shown");
            assert.deepEqual(shown, [a4u.id], "My Library's copy, in My Library");
            assert.ok(await wvT.waitFor(() => !state(), 3000, 20), "the popup closed, as a button's act closes it");
        }
        finally { wv._wvRefsShowInLibrary = sil; }
    });

    it("Show in Library selects the cited item in the library", async function () {
        await openPopup();
        press(rowFor(1), "library");
        const ok = await wvT.waitFor(() => {
            try { return win.ZoteroPane.getSelectedItems().some(i => i.id === a2.id); } catch (e) { return false; }
        }, 15000);
        assert.ok(ok, "the item selected in the library");
        ZT.select(reader.tabID);
        await wvT.sleep(500);
    });

    it("the index follows the library: an item added for [3] marks it, erased it unmarks it", async function () {
        const a3 = await article({ title: "Thin films on soft substrates and their slow drainage dynamics", date: "2021", _first: "Foster" });
        try {
            const marked = await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "nopdf"; }, 10000, 600);
            assert.ok(marked, "[3] marked once the item exists");
        }
        finally { await wvT.erase(a3); }
        const gone = await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "web"; }, 10000, 600);
        assert.ok(gone, "and back to the grey ring once it is gone");
    });

    // MJT 2026-11-20: "The dot is focused on having a PDF file. But I think that an EPUB
    // should also count the same as PDF" (refs.ts DOC_TYPES: what the reader opens).
    it("an EPUB counts as a PDF: [2] given an EPUB takes the green dot, and the blue one again without it", async function () {
        assert.equal((await (async () => { await openPopup(); return kindOf(rowFor(1)); })()), "nopdf", "fixture: [2] has no file");
        const ep = await wvT.createTestEPUBItem("wv-refs-epub", { parentItemID: a2.id });
        try {
            assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(1)) === "pdf"; }, 10000, 600), "[2] with its EPUB: the green dot");
            // Its mark's menu says what it opens, as the items list does.
            assert.ok(await wvT.waitFor(() => bibMarkOf(1) && bibMarkOf(1).getAttribute("data-wv-refs-kind") === "pdf", 8000, 100), "its mark in the PDF green too");
            const m = await bibMenu(1);
            // With its EPUB: the open buttons, the citation popup's (MJT 2026-11-26), each
            // named by its tooltip.
            assert.deepEqual(m.btns, [["tab", "Open in a new tab"], ["split", "Open in split view"], ["window", "Open in a new window"], ["copy-as", "Copy As"]], JSON.stringify(m));
            // The tooltips name the file too (MJT 2026-11-20, "Is the text of the tooltip
            // automatically adjusted in that case?").
            await openPopup();
            const ML = userLibName();
            assert.equal(plain(rowMark(rowFor(1)).getAttribute("title")), "In your library (" + ML + "), with an EPUB.");
            assert.equal(plain(bibMarkOf(1).getAttribute("title")), "In your library (" + ML + "), with an EPUB.\nClick for its details and where to open it.");
        }
        finally { await wvT.erase(ep); }
        assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(1)) === "nopdf"; }, 10000, 600), "[2] without it: the blue dot again");
    });

    // ---- B2: marks beside the entries of the reference list -----------------

    const viewDoc = () => pv._iframeWindow.document;
    const bibMarks = () => Array.from(viewDoc().querySelectorAll(".pdfViewer > .wv-refs-marks .wv-refs-bibmark"));
    /** Entry i's box on screen (client px of the view's frame), from its PDF box. */
    async function entryBox(i) {
        const e = (await wv._wvRefsEntries(reader.itemID))[i];
        const b = e.rects[0];
        const pageView = pv._iframeWindow.PDFViewerApplication.pdfViewer._pages[b[0]];
        const r = Cu.waiveXrays(pageView.viewport.convertToViewportRectangle(Cu.cloneInto([b[1], b[2], b[3], b[4]], pv._iframeWindow)));
        const pr = pageView.div.getBoundingClientRect();
        // The page's border (pdf.js draws one around each page) is inside its box.
        const bl = parseFloat(pv._iframeWindow.getComputedStyle(pageView.div).borderLeftWidth) || 0;
        const bt = parseFloat(pv._iframeWindow.getComputedStyle(pageView.div).borderTopWidth) || 0;
        return { left: pr.left + bl + Math.min(r[0], r[2]), top: pr.top + bt + Math.min(r[1], r[3]), bottom: pr.top + bt + Math.max(r[1], r[3]), heightPt: Math.abs(b[4] - b[2]) };
    }
    /** The middle of entry i's first-line letters on screen (client px): its baseline + 0.33 x
     *  its type size, from the page's own text (pdf.js). */
    async function lettersMiddle(i) {
        const e = (await wv._wvRefsEntries(reader.itemID))[i];
        const b = e.rects[0];
        const iw = pv._iframeWindow;
        const app = Cu.waiveXrays(iw.PDFViewerApplication);
        const tc = Cu.waiveXrays(await Cu.waiveXrays(await app.pdfDocument.getPage(b[0] + 1)).getTextContent());
        const left = Math.min(b[1], b[3]), right = Math.max(b[1], b[3]), top0 = Math.max(b[2], b[4]), bot0 = Math.min(b[2], b[4]);
        let first = null;
        for (const it of tc.items) {
            const t = it.transform;
            if (!t || !String(it.str).trim()) continue;
            if (t[4] >= left - 2 && t[4] <= right && t[5] >= bot0 - 1 && t[5] <= top0 + 1 && (!first || t[5] > first[1])) first = [t[4], t[5], Math.hypot(t[2], t[3])];
        }
        if (!first) return null;
        const pageView = app.pdfViewer._pages[b[0]];
        const q = pageView.viewport.convertToViewportPoint(first[0], first[1] + 0.33 * first[2]);
        const bt = parseFloat(iw.getComputedStyle(pageView.div).borderTopWidth) || 0;
        return pageView.div.getBoundingClientRect().top + bt + q[1];
    }
    async function marksBesideEntries(label) {
        // Placed from the page's text once it is read (refs.ts, data-wv-refs-text).
        await wvT.waitFor(() => { const l = viewDoc().querySelector(".pdfViewer > .wv-refs-marks"); return l && l.getAttribute("data-wv-refs-text") === "1"; }, 5000, 50);
        // The marks follow their pages in the next animation frame (refs.ts refsPlaceSoon),
        // a frame a loaded machine can be late with: the dev.67 full suite read a mark at 305
        // px against its entry's 184 after the 400 ms the callers wait, and the spec passed
        // alone twice right after (2026-11-21). Wait (up to 3 s) for every mark to be beside its
        // entry, then assert where they are; a mark never placed still fails below. A loop,
        // not wvT.waitFor: entryBox is async, and a predicate returning a promise ends a waitFor
        // at once (test rules).
        for (const t0 = Date.now(); Date.now() - t0 < 3000;) {
            let placed = true;
            for (const m of bibMarks()) {
                const box = await entryBox(Number(m.getAttribute("data-wv-refs-entry")));
                const r = m.getBoundingClientRect();
                if (r.right > box.left + 1 || r.left <= box.left - 40) { placed = false; break; }
            }
            if (placed) break;
            await wvT.sleep(50);
        }
        for (const m of bibMarks()) {
            const i = Number(m.getAttribute("data-wv-refs-entry"));
            const box = await entryBox(i);
            const r = m.getBoundingClientRect();
            const cy = (r.top + r.bottom) / 2;
            assert.isAtMost(r.right, box.left + 1, label + ": mark " + i + " left of its entry (" + r.right + " vs " + box.left + ")");
            assert.isAbove(r.left, box.left - 40, label + ": mark " + i + " close to its entry");
            assert.ok(cy >= box.top - 2 && cy <= Math.min(box.bottom, box.top + 16), label + ": mark " + i + " at the entry's first line (" + cy + " in " + box.top + ".." + box.bottom + ")");
            // On the middle of its first line's letters, whatever the box (MJT 2026-11-20, "I
            // would like to get the vertical alignment on the text"): the fixture's boxes cover
            // an entry's two lines.
            const mid = await lettersMiddle(i);
            assert.ok(mid !== null, label + ": entry " + i + "'s first line found in the page's text");
            assert.approximately(cy, mid, 1, label + ": mark " + i + " on its letters' middle");
        }
    }

    // MJT 2026-11-20: "I would like to get a circle in front of all the references, so that I
    // can distinguish the ones that have been identified and the ones that haven't" -- green
    // with a PDF, blue without, an empty grey circle for one not in the library.
    it("B2: a mark in the margin beside every entry -- a green dot, a blue dot, a grey ring", async function () {
        const marks = await wvT.waitFor(() => { const m = bibMarks(); return m.length === 4 ? m : null; }, 15000, 100);
        assert.ok(marks, "four marks (" + bibMarks().length + ")");
        assert.deepEqual(marks.map(m => m.getAttribute("data-wv-refs-kind") + "@" + m.getAttribute("data-wv-refs-entry")), ["pdf@0", "nopdf@1", "web@2", "pdf@3"]);
        const cs = (m) => pv._iframeWindow.getComputedStyle(m).color;
        assert.deepEqual(marks.map(cs), ["rgb(95, 178, 54)", "rgb(64, 114, 229)", "rgb(170, 170, 170)", "rgb(95, 178, 54)"], "green, blue, grey, green");
        for (const m of marks) assert.ok(m.getAttribute("title") || m.getAttribute("aria-label"), "its words");
        // The ring: no title (Weavero's URL tip draws its lines, the link coloured); its words as its label.
        assert.notOk(marks[2].getAttribute("title"), "no native tooltip on the ring");
        const xs = marks.map(m => { const q = m.getBoundingClientRect(); return Math.round(((q.left + q.right) / 2) * 10) / 10; });
        assert.isAtMost(Math.max(...xs) - Math.min(...xs), 0.5, "every dot in one column: " + xs.join(" "));
        assert.equal(marks[2].getAttribute("aria-label"), "Not in your libraries.\nClick to look it up online (Crossref, else a Google Scholar search).", "[3] writes no link: what a click does");
        await marksBesideEntries("at the reader's zoom");
    });

    // MJT 2026-11-20 ("How is the horizontal alignment done between the circles and the
    // text?"): an RSC list's one-line boxes, 7.1 points high, had each dot 1.4 points under
    // the line's middle (a fixed 5 points under the box's top).
    it("B2: a mark's centre: a one-line box's middle, 5 points under a taller box's top; further left with a badge", function () {
        wvT.method("_wvRefsMarkAnchor");
        const a = wv._wvRefsMarkAnchor([7, 310.5, 53, 510.6, 60.1], false);   // the RSC paper's entry 2
        assert.approximately(a[0], 310.5 - 8, 1e-9);
        assert.approximately(a[1], (53 + 60.1) / 2, 1e-9, "the one-line box's middle");
        const b = wv._wvRefsMarkAnchor([1, 90, 690, 400, 711], true);       // a box over two lines
        assert.approximately(b[0], 90 - 8, 1e-9, "the same column with a badge (MJT 2026-11-20, \"keep the horizontal alignment of the circles\")");
        assert.approximately(b[1], 711 - 5, 1e-9, "5 points under a taller box's top");
        // With the page's text (MJT 2026-11-20, "I would like to get the vertical alignment on
        // the text"): the first line's baseline + 0.33 x its size -- a 2026 paper's entry [29],
        // a 19.3-point box over two lines, baselines 561.2 and 549.7, 8.97-point type.
        const c = wv._wvRefsMarkAnchor([18, 54.8, 547.8, 449.3, 567.1], false, [[54.8, 561.2, 8.97], [73.2, 549.7, 8.97], [300, 600, 8.97]]);
        assert.approximately(c[1], 561.2 + 0.33 * 8.97, 1e-9, "the letters' middle on the first line");
        // A superscript at the line's start does not set the line.
        const e = wv._wvRefsMarkAnchor([1, 50, 700, 300, 712], false, [[50, 706, 6], [53, 702, 9.5]]);
        assert.approximately(e[1], 702 + 0.33 * 9.5, 1e-9, "the full-size text's line, not the superscript");
    });

    // MJT 2026-11-24, "The circles first appeared at a position, then shifted up. Why?": a mark
    // was drawn where its entry's box in the structure data put it, then moved onto its first
    // line's letters once pdf.js had read the page's text. Now it stays hidden (visibility) until
    // the text has placed it (refs.ts _wvRefsMarksDrawIn). A fresh copy of the fixture (its pages'
    // text not read yet) is opened with a layer around _wvRefsMarksDrawIn that records, for that
    // copy's views, each mark's place at the first moment it is visible: right after the draw
    // (what it left on screen), then at every change in the marks' layer.
    /** Open a fresh copy of the fixture, `wrap(orig, reader, view, ...rest)` standing for
     *  _wvRefsMarksDrawIn on its views; `fn(reader)`; then close and erase it. */
    async function withFreshCopy(name, wrap, fn) {
        const parent = await article({ title: "WV-TEST references fixture, " + name, date: "2026", _first: "Tester" });
        let att = null, r = null;
        const own = Object.prototype.hasOwnProperty.call(wv, "_wvRefsMarksDrawIn");
        const orig = wv._wvRefsMarksDrawIn;
        try {
            att = await importFile("wv-refs-" + name, fixturePDF(), { parentItemID: parent.id });
            const attID = att.id;
            wv._wvRefsMarksDrawIn = function (rd, v, ...rest) {
                if (!rd || rd.itemID !== attID) return orig.call(this, rd, v, ...rest);
                return wrap.call(this, orig, rd, v, ...rest);
            };
            r = await wvT.openReaderTab(att.id);
            assert.ok(r, "the fresh copy opened");
            await fn(r);
        }
        finally {
            if (own) wv._wvRefsMarksDrawIn = orig;
            else delete wv._wvRefsMarksDrawIn;
            try { if (r) wvT.closeReaderTab(r); } catch (e) {}
            await wvT.sleep(500);
            try { ZT.select(reader.tabID); } catch (e) {}
            await wvT.erase(att, parent);
            await wvT.sleep(300);
        }
    }
    /** Watch the marks layer a draw of `v` left: `seen.first` each mark's place the first time
     *  it is visible (its style, and its centre in its page box), `seen.ms` when, after the draw. */
    function watchMarks(seen, v) {
        const W = v._iframeWindow;
        const layer = W.document.querySelector(".pdfViewer > .wv-refs-marks");
        if (!layer || layer === seen.layer) return;
        Object.assign(seen, { layer, first: new Map(), drawn: performance.now() });
        const record = () => {
            for (const m of layer.querySelectorAll(".wv-refs-bibmark")) {
                const k = m.getAttribute("data-wv-refs-entry");
                if (!seen.first.has(k) && W.getComputedStyle(m).visibility === "visible") seen.first.set(k, Object.assign(markPlace(m), { ms: performance.now() - seen.drawn }));
            }
        };
        record();
        new W.MutationObserver(record).observe(layer, Cu.cloneInto({ subtree: true, attributes: true }, W));
    }
    function markPlace(m) {
        const r = m.getBoundingClientRect(), b = m.closest(".wv-refs-marks-page").getBoundingClientRect();
        return { left: m.style.left, top: m.style.top, x: (r.left + r.right) / 2 - b.left, y: (r.top + r.bottom) / 2 - b.top };
    }

    it("B2: a mark shows once, where it stays: hidden until its page's text has placed it", async function () {
        const seen = { layer: null, first: new Map(), drawn: 0 };
        await withFreshCopy("shown-once", function (orig, rd, v, ...rest) {
            const out = orig.call(this, rd, v, ...rest);
            try { watchMarks(seen, v); } catch (e) {}
            return out;
        }, async () => {
            assert.ok(await wvT.waitFor(() => seen.layer && seen.layer.isConnected && seen.layer.getAttribute("data-wv-refs-text") === "1"
                && seen.layer.querySelectorAll(".wv-refs-bibmark").length === 4, 30000, 50), "the fresh copy's four marks, its page's text read");
            await wvT.sleep(200);
            const W = seen.layer.ownerDocument.defaultView;
            for (const m of seen.layer.querySelectorAll(".wv-refs-bibmark")) {
                const k = m.getAttribute("data-wv-refs-entry");
                assert.equal(W.getComputedStyle(m).visibility, "visible", "mark " + k + " shown");
                const f = seen.first.get(k), now = markPlace(m);
                assert.ok(f, "mark " + k + ": its first visible moment recorded");
                const what = "mark " + k + " first shown where it stays (" + JSON.stringify(f) + " -> " + JSON.stringify(now) + ")";
                assert.deepEqual([f.left, f.top], [now.left, now.top], what);
                assert.approximately(f.x, now.x, 0.05, what);
                assert.approximately(f.y, now.y, 0.05, what);
            }
        });
    });

    // ... and a page whose text never comes keeps no mark hidden: its marks show where the
    // entry's box puts them after a short time-out (MARK_TEXT_WAIT_MS, 400 ms). pdf.js's getPage
    // answers nothing to the draw's own read of the page.
    it("B2: a page whose text never comes shows its marks after a short time-out, where the box puts them -- none lost", async function () {
        const seen = { layer: null, first: new Map(), drawn: 0, atDraw: new Map() };
        await withFreshCopy("no-text", function (orig, rd, v, ...rest) {
            const W = v._iframeWindow;
            let pd = null;
            try { pd = Cu.waiveXrays(W.PDFViewerApplication).pdfDocument; } catch (e) {}
            if (pd) pd.getPage = Cu.exportFunction(() => W.Promise.race(Cu.cloneInto([], W)), W);
            let out;
            try { out = orig.call(this, rd, v, ...rest); }
            finally { if (pd) delete pd.getPage; }
            try {
                const was = seen.layer;
                watchMarks(seen, v);
                if (seen.layer && seen.layer !== was) {
                    seen.atDraw = new Map();
                    for (const m of seen.layer.querySelectorAll(".wv-refs-bibmark")) seen.atDraw.set(m.getAttribute("data-wv-refs-entry"), [m.style.left, m.style.top]);
                }
            } catch (e) {}
            return out;
        }, async () => {
            assert.ok(await wvT.waitFor(() => seen.layer && seen.layer.isConnected && seen.layer.querySelectorAll(".wv-refs-bibmark").length === 4 && seen.first.size === 4, 30000, 50),
                "the fresh copy's four marks, all shown (" + (seen.first ? seen.first.size : 0) + ")");
            assert.notOk(seen.layer.getAttribute("data-wv-refs-text"), "fixture: the page's text never came");
            for (const [k, f] of seen.first) {
                assert.isAtLeast(f.ms, 300, "mark " + k + " hidden until the time-out (" + Math.round(f.ms) + " ms)");
                assert.deepEqual([f.left, f.top], seen.atDraw.get(k), "mark " + k + " shown where the entry's box put it");
            }
        });
    });

    it("B2: the marks follow a zoom", async function () {
        const viewer = pv._iframeWindow.PDFViewerApplication.pdfViewer;
        const was = viewer.currentScale;
        assert.equal(bibMarks().length, 4, "the four marks");
        try {
            viewer.currentScale = was * 1.8;
            await wvT.waitFor(() => Math.abs(viewer.currentScale - was * 1.8) < 0.01, 5000, 50);
            await wvT.sleep(500);
            await marksBesideEntries("zoomed in");
        }
        finally { viewer.currentScale = was; await wvT.sleep(400); }
        await marksBesideEntries("back");
    });

    // MJT 2026-11-19: after Open Beside This Paper the citing paper's side
    // narrowed and the ● beside an entry sat mid-line. At a fixed zoom a
    // narrower view re-centres the page by layout alone, with no style change
    // -- and a style change was all the marks' page boxes followed up to
    // 1.1.1-refs.5 (refs.ts _wvRefsMarksDrawIn). The page at half the view's
    // width, the view narrowed to three quarters: the page moves left by an
    // eighth of the view, the marks must too.
    it("B2: the marks stay beside their entries when the view narrows (the page re-centred by layout alone)", async function () {
        const iw = pv._iframeWindow;
        const viewer = iw.PDFViewerApplication.pdfViewer;
        const frame = pv._iframe || iw.frameElement;
        assert.ok(frame, "the PDF view's frame element");
        const was = viewer.currentScaleValue;
        const wasWidth = frame.style.width;
        const page = () => viewer._pages[1].div;
        const w0 = iw.innerWidth;
        assert.equal(bibMarks().length, 4, "the four marks");
        try {
            // A fixed zoom (a number: pdf.js rescales only a named one on a
            // resize), the page well inside the view, so it is centred.
            const unit = viewer._pages[1].viewport.width / viewer.currentScale;
            viewer.currentScale = Math.max(0.2, (w0 * 0.5) / unit);
            await wvT.waitFor(() => Math.abs(page().offsetWidth - w0 * 0.5) < 20, 5000, 50);
            await wvT.sleep(400);
            await marksBesideEntries("at a fixed zoom");
            const left0 = page().offsetLeft;
            frame.style.width = Math.round(w0 * 0.75) + "px";
            assert.ok(await wvT.waitFor(() => iw.innerWidth < w0 * 0.8 && page().offsetLeft < left0 - 20, 5000, 50),
                "fixture: the view narrowed and the page moved left (" + iw.innerWidth + " px wide, the page at " + page().offsetLeft + " from " + left0 + ")");
            await wvT.sleep(400);
            await marksBesideEntries("the view narrowed");
            frame.style.width = wasWidth || "100%";
            assert.ok(await wvT.waitFor(() => iw.innerWidth > w0 - 5 && page().offsetLeft > left0 - 5, 5000, 50), "fixture: the view wide again");
            await wvT.sleep(400);
            await marksBesideEntries("the view wide again");
        }
        finally {
            frame.style.width = wasWidth || "100%";
            viewer.currentScaleValue = was;
            await wvT.sleep(500);
        }
        await marksBesideEntries("back");
    });

    it("B2: none in Reading Mode, none with the setting off; back after", async function () {
        wv._wvReadingModeActive = () => true;
        try {
            wv._wvRefsMarksDraw(reader);
            assert.equal(bibMarks().length, 0, "Reading Mode: no mark on the page view under it");
            assert.notOk(viewDoc().querySelector(".wv-refs-marks"), "nor their layer");
        }
        finally { delete wv._wvReadingModeActive; }
        wv._wvRefsMarksDraw(reader);
        assert.equal(bibMarks().length, 4, "Reading Mode off: back");
        await wvT.withPref("weavero.referencesBibliographyMarks", false, async () => {
            assert.ok(await wvT.waitFor(() => bibMarks().length === 0, 5000, 50), "the setting off: gone at once");
        });
        assert.ok(await wvT.waitFor(() => bibMarks().length === 4, 5000, 50), "the setting on: back");
    });

    // ---- the menu's buttons (MJT 2026-11-26: Show in Library's submenu opened over the grid's
    // right column -- "Probably better adopt the same design as the one appearing on the
    // references in the text"; his pick, "Card + buttons, rows kept"): the card, its library
    // names showing each copy, the citation popup's icon buttons at its foot on the end side
    // (New Tab, Split View, New Window with a PDF or EPUB, Show in Library without one, then
    // Copy As), the popup's own entries in a menugroup (Firefox's context-menu navigation row);
    // then the cited item's attachments and notes. They replaced the 2 x 2 grid of words (MJT
    // 2026-11-22). Pointer moves and clicks are scripted events on the buttons (Gecko's menu
    // code takes a scripted mousemove, mousedown and mouseup as a pointer's; the trusted
    // pointer of windowUtils.sendMouseEvent is gone on Zotero 11), keys are trusted (the text
    // input processor: the popup manager takes no scripted key).

    /** The open menu's buttons, in order. */
    const btnsOf = (menu) => Array.from(menu.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *"));
    const actOf = (el) => el.getAttribute("data-wv-refs-act");
    /** The menu's children as a list of kinds: the card, the button row, separators, captions by
     *  their words, entries. */
    const shapeOf = (menu) => Array.from(menu.children).map(el => el.classList.contains("wv-refs-card") ? "card" : el.localName === "menugroup" ? (el.classList.contains("wv-refs-btn-row") ? "btns" : "row")
        : el.localName === "menuseparator" ? "-" : el.localName === "menucaption" ? "cap:" + el.getAttribute("label") : el.localName + ":" + (actOf(el) || "?"));
    /** Mark k's menu (beside entry k of the list), on screen. `rtl`: laid out right to left, as
     *  under a right-to-left locale -- set before it opens (a direction changed on an open
     *  popup closes it, measured 2026-11-22). */
    async function openMarkMenu(k, rtl) {
        const m = bibMarks().find(x => x.getAttribute("data-wv-refs-entry") === String(k));
        assert.ok(m, "a mark beside entry " + k);
        const iw = pv._iframeWindow;
        if (rtl) {
            const o = wv._wvRefsMenuOpen;
            wv._wvRefsMenuOpen = function (d, p, ...rest) { p.style.direction = "rtl"; return o.call(this, d, p, ...rest); };
        }
        try { m.dispatchEvent(new iw.MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw))); }
        finally { if (rtl) delete wv._wvRefsMenuOpen; }
        const menu = await wvT.waitFor(() => { const x = win.document.getElementById("wv-refs-menu"); return x && x.state === "open" ? x : null; }, 5000, 20);
        assert.ok(menu, "mark " + k + ": its menu on screen");
        await wvT.sleep(100);
        return menu;
    }
    const menuGone = () => wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 20);
    const activeIn = (menu) => Array.from(menu.querySelectorAll("[_moz-menuactive]")).map(el => actOf(el) || el.getAttribute("data-wv-refs-copy") || el.localName);
    function pointer(el, types) {
        const r = el.getBoundingClientRect();
        for (const type of types) el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, view: win, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }
    /** The highlight once it stops moving: Left / Right may take a few tries in the first
     *  moments after the menu opens (refs.ts refsGridKey). */
    async function settled(menu) {
        let last = "", same = 0;
        for (let i = 0; i < 25 && same < 4; i++) {
            await wvT.sleep(50);
            const now = activeIn(menu).join("+");
            same = now === last ? same + 1 : 0;
            last = now;
        }
        return last;
    }
    /** A trusted key in the main window. */
    function key(k) {
        const Cc = Components.classes, Ci = Components.interfaces;
        const t = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
        if (!t.beginInputTransactionForTests(win)) throw new Error("text input processor busy");
        const codes = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 };
        const ev = new win.KeyboardEvent("", { key: k, code: k, keyCode: codes[k] });
        t.keydown(ev);
        t.keyup(ev);
    }
    /** The buttons' geometry: icon-only, their words in a tooltip, side by side on one line, under
     *  the card, the last at the row's end side (left, right to left). */
    function rowGeometry(menu, label, rtl) {
        const btns = btnsOf(menu);
        const R = btns.map(b => b.getBoundingClientRect());
        const row = menu.querySelector(":scope > menugroup.wv-refs-btn-row").getBoundingClientRect();
        const card = menu.querySelector(":scope > .wv-refs-card");
        for (const b of btns) {
            for (const sel of [".menu-text", ".menu-accel"]) {
                const t = b.querySelector(":scope > " + sel);
                if (t) assert.equal(win.getComputedStyle(t).display, "none", label + ": " + actOf(b) + " shows no words");
            }
            const ic = b.querySelector(":scope > .menu-icon");
            assert.ok(ic && Math.abs(ic.getBoundingClientRect().width - 16) < 0.5, label + ": " + actOf(b) + " shows its 16-px icon");
            assert.ok(String(b.getAttribute("tooltiptext") || "").trim(), label + ": " + actOf(b) + "'s words in its tooltip");
        }
        for (let i = 1; i < R.length; i++) {
            assert.approximately(R[i].top, R[0].top, 0.5, label + ": on one line");
            if (rtl) assert.ok(R[i].right <= R[i - 1].left + 0.5, label + ": side by side, right to left");
            else assert.ok(R[i].left >= R[i - 1].right - 0.5, label + ": side by side");
        }
        if (card) assert.ok(R[0].top >= card.getBoundingClientRect().bottom - 0.5, label + ": under the card");
        const last = R[R.length - 1];
        const gap = rtl ? last.left - row.left : row.right - last.right;
        assert.isAtMost(gap, 8, label + ": the last button at the row's end side (" + gap + " px from it)");
        return R;
    }

    it("B2: a click on a mark opens the card with the citation popup's buttons at its foot -- New Tab, Split View, New Window, Copy As -- then the cited item's other attachments", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        const menu = await openMarkMenu(0);
        // [1]'s graphical abstract, its other attachment, a row under the buttons and its
        // caption (refs-menu-children.spec.js: the cited item's attachments and notes).
        assert.deepEqual(shapeOf(menu), ["card", "btns", "-", "cap:Attachment", "menuitem:child"], "the card and its buttons, then the picture's row under its caption");
        assert.equal(menu.querySelector(':scope > [data-wv-refs-act="child"]').getAttribute("data-wv-refs-child"), String(a1img.id), "the row is the picture's");
        const btns = btnsOf(menu);
        assert.deepEqual(btns.map(actOf), ["tab", "split", "window", "copy-as"], "the citation popup's buttons, in its order");
        assert.deepEqual(btns.map(b => b.localName), ["menuitem", "menuitem", "menuitem", "menu"], "the popup's own entries, Copy As a submenu");
        const L = new (win.Localization)(["weavero.ftl"], true);
        const titleOf = (id) => { const m = L.formatMessagesSync([id])[0]; return ((m && m.attributes) || []).find(x => x.name === "title").value; };
        for (const b of btns.slice(0, 3)) {
            assert.ok(b.classList.contains("menuitem-iconic") && /^data:image\/svg\+xml,/.test(String(b.getAttribute("image"))), actOf(b) + ": the popup button's drawing");
            assert.equal(b.getAttribute("tooltiptext"), titleOf("weavero-refs-act-" + actOf(b)), actOf(b) + ": the popup button's words");
        }
        assert.isNull(menu.querySelector('[data-wv-refs-act="library"]'), "no Show in Library entry: the card's library name shows the item, as in the popup");
        assert.ok(menu.querySelector('.wv-refs-card .wv-refs-card-libname[data-wv-refs-copy="' + a1.id + '"]'), "the card's library name acts");
        rowGeometry(menu, "the row");
        // Copy As, the items list's copies (MJT 2026-11-20, "I would like to get a Copy As,
        // same as in the items list"): Select Link copies what Copy Link did.
        const copyAs = btns[3];
        // Its words set directly: a data-l10n-id would have Fluent strip its tooltip (2026-11-27).
        assert.equal(copyAs.getAttribute("data-wv-refs-act"), "copy-as");
        assert.equal(copyAs.getAttribute("label"), "Copy As", "its words");
        assert.isNull(copyAs.getAttribute("data-l10n-id"), "no Fluent id over its tooltip");
        assert.equal(win.getComputedStyle(copyAs, "::after").display, "none", "no submenu arrow on the button, as on the popup's");
        assert.isNull(Array.from(menu.querySelectorAll("menuitem")).find(i => i.getAttribute("data-l10n-id") === "weavero-menu-ref-copy-link") || null, "no separate Copy Link");
        // Opened for real: a command on an item of an OPEN popup is delivered (tests.md).
        const sub = copyAs.querySelector("menupopup");
        copyAs.open = true;
        assert.ok(await wvT.waitFor(() => sub.state === "open" && sub.querySelector("menuitem"), 3000, 20), "the submenu opens with its entries (" + sub.state + ")");
        assert.equal(menu.state, "open", "the menu stays open under its submenu");
        const keys = Array.from(sub.querySelectorAll("menuitem")).map(i => i.getAttribute("data-wv-key"));
        for (const k of ["citation", "bibliography", "selectLink", "openLink"]) assert.include(keys, k, "Copy As has " + k + ": " + keys.join(" "));
        const U = Zotero.Utilities.Internal, copied = [], orig = U.copyTextToClipboard;
        U.copyTextToClipboard = (t) => { copied.push(String(t)); };
        try {
            sub.querySelector('menuitem[data-wv-key="selectLink"]').doCommand();
            await wvT.waitFor(() => copied.length > 0, 3000, 20);
        }
        finally { U.copyTextToClipboard = orig; }
        assert.deepEqual(copied, [wv._buildSelectLink(a1)], "Select Link: the cited item's zotero://select link");
        menu.hidePopup();
        await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
    });

    /** Run `fn(calls)` with the menu's commands recorded instead of done: [act, item id]. */
    async function withActsRecorded(fn) {
        const calls = [];
        const act0 = wv._wvRefsAct, show0 = wv._wvRefsShowInLibrary;
        wv._wvRefsAct = async (rd, act, ids) => { calls.push([act, ids[0]]); return true; };
        wv._wvRefsShowInLibrary = async (it) => { calls.push(["library", it.id]); return true; };
        try { await fn(calls); }
        finally { wv._wvRefsAct = act0; wv._wvRefsShowInLibrary = show0; }
    }

    it("the buttons: each takes the highlight alone under the pointer, in light and dark, a click runs its own command, and the card's library name shows the item", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        const P = Services.prefs, PREF = "ui.systemUsesDarkTheme";
        const had = P.prefHasUserValue(PREF) ? P.getIntPref(PREF) : null;
        try {
            for (const dark of [0, 1]) {
                P.setIntPref(PREF, dark);
                await wvT.sleep(300);
                const menu = await openMarkMenu(0);
                const btns = btnsOf(menu).filter(b => actOf(b) !== "copy-as");
                const theme = dark ? "dark" : "light";
                for (const c of btns) {
                    // A pointer's moves over the button (Gecko may not take the first ones right
                    // after the menu opens).
                    assert.ok(await wvT.waitFor(() => { if (c.hasAttribute("_moz-menuactive")) return true; pointer(c, ["mousemove"]); return null; }, 2000, 50), theme + ": " + actOf(c) + " highlighted under the pointer");
                    assert.deepEqual(activeIn(menu), [actOf(c)], theme + ": " + actOf(c) + " alone");
                    const bgs = btns.map(x => win.getComputedStyle(x).backgroundColor);
                    assert.notEqual(bgs[btns.indexOf(c)], "rgba(0, 0, 0, 0)", theme + ": its highlight drawn");
                    assert.deepEqual(bgs.filter((b, i) => i !== btns.indexOf(c)), btns.slice(1).map(() => "rgba(0, 0, 0, 0)"), theme + ": the other buttons plain");
                }
                rowGeometry(menu, theme);
                menu.hidePopup();
                assert.ok(await menuGone(), theme + ": closed");
            }
        }
        finally {
            if (had === null) P.clearUserPref(PREF);
            else P.setIntPref(PREF, had);
            await wvT.sleep(300);
        }
        await withActsRecorded(async (calls) => {
            for (const want of ["tab", "split", "window"]) {
                const menu = await openMarkMenu(0);
                const c = btnsOf(menu).find(x => actOf(x) === want);
                pointer(c, ["mousemove", "mousedown", "mouseup", "click"]);
                assert.ok(await menuGone(), want + ": the click closes the menu");
                assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), want + ": its command ran");
                // The buttons open their document, [1]'s PDF.
                assert.deepEqual(calls.splice(0), [[want, a1pdf.id]], want + ": its own command, on [1]'s PDF");
            }
            const menu = await openMarkMenu(0);
            pointer(menu.querySelector(".wv-refs-card .wv-refs-card-libname[data-wv-refs-copy]"), ["click"]);
            assert.ok(await menuGone(), "the library name closes the menu");
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "and shows the item");
            assert.deepEqual(calls.splice(0), [["library", a1.id]], "Show in Library, on [1]");
        });
    });

    it("the buttons by keyboard (trusted keys): Down and Up through them and the rows in reading order, Left and Right along the row, Enter runs a button, Escape closes", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        win.focus();
        await wvT.waitFor(() => Services.focus.activeWindow === win || null, 3000, 50);
        await withActsRecorded(async (calls) => {
            let menu = await openMarkMenu(0);
            const seen = [];
            const press = async (k) => { key(k); seen.push(k.replace("Arrow", "") + ":" + await settled(menu)); };
            for (const k of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"]) await press(k);
            for (const k of ["ArrowUp", "ArrowUp"]) await press(k);
            // The picture's caption ("Attachment") under the buttons is passed: not an entry
            // (activeIn would name it "menucaption").
            assert.deepEqual(seen.splice(0), ["Down:tab", "Down:split", "Down:window", "Down:copy-as", "Down:child", "Up:copy-as", "Up:window"],
                "Up and Down: the buttons in order, then the picture's row (its caption passed)");
            for (const k of ["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) await press(k);
            assert.deepEqual(seen.splice(0), ["Left:split", "Left:tab", "Left:tab", "Right:split", "Right:window", "Right:copy-as", "Left:window", "Left:split", "Left:tab"],
                "Left and Right: along the row, nothing past its start");
            assert.equal(calls.length, 0, "no command while moving");
            key("Enter");
            assert.ok(await menuGone(), "Enter closes the menu");
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "and runs the button");
            assert.deepEqual(calls.splice(0), [["tab", a1pdf.id]], "Open in New Tab, on [1]'s PDF");
            menu = await openMarkMenu(0);
            key("ArrowDown");
            await wvT.sleep(150);
            key("Escape");
            assert.ok(await menuGone(), "Escape closes it");
            assert.deepEqual(calls, [], "nothing run");
        });
    });

    it("a reference in two libraries ([4]): the card names both, each name shows its copy; the same buttons, no submenu over them", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        await withActsRecorded(async (calls) => {
            const menu = await openMarkMenu(3);
            assert.deepEqual(btnsOf(menu).map(actOf), ["tab", "split", "window", "copy-as"], "the same buttons");
            assert.isNull(menu.querySelector('menu[data-wv-refs-act="library"]'), "no Show in Library submenu");
            const names = Array.from(menu.querySelectorAll(".wv-refs-card .wv-refs-card-libname[data-wv-refs-copy]"));
            assert.deepEqual(names.map(n => n.getAttribute("data-wv-refs-copy")), [String(a4g.id), String(a4u.id)], "both libraries in the card, the open copy's first");
            assert.isNull(menu.querySelector(".wv-refs-card-libtoggle"), "two libraries: both named, no Other Libraries button");
            rowGeometry(menu, "two libraries");
            pointer(names[1], ["click"]);
            assert.ok(await menuGone(), "a library's name closes the menu");
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "and shows its copy");
            assert.deepEqual(calls.splice(0), [["library", a4u.id]], "My Library's copy");
        });
    });

    // MJT 2026-11-26, a reference in seven libraries over three lines of the card: "If more than 2
    // libraries, the one beyond the current library should probably be shown in a dropdown menu".
    // The card itself, in the main window: a third copy stands in for one in wv-refs-group-b (the
    // card reads only a copy's library and id), so nothing is added to any library.
    it("a reference in more than two libraries: the card names the current library, then \"2 other libraries ▾\", which drops the others down, each a click from its copy", function () {
        const doc = win.document;
        wv._wvRefsCardOf(doc, [a4g]);   // the card's sheet in this document
        const ML = userLibName();
        const third = { id: 987654321, libraryID: groupB.libraryID };
        const copyOf = { [ML]: a4u.id, "wv-refs-group": a4g.id, "wv-refs-group-b": third.id };
        const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        host.style.cssText = "position: fixed; left: 0; top: 0; width: 420px;";
        doc.documentElement.appendChild(host);
        const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        try {
            for (const [label, citingLib, first, others] of [
                // The current library named, though the copy the buttons open is the group's.
                ["from My Library", Zotero.Libraries.userLibraryID, ML, ["wv-refs-group", "wv-refs-group-b"]],
                // No citing paper (a hover card elsewhere): the copy shown.
                ["no citing paper", null, "wv-refs-group", [ML, "wv-refs-group-b"]],
            ]) {
                host.textContent = "";
                const shown = [];
                const card = wv._wvRefsCard(doc, a4g, [a4g, a4u, third], citingLib, (copy) => { shown.push(copy.id); });
                assert.ok(card, label + ": a card");
                host.appendChild(card);
                const line = card.querySelector(".wv-refs-card-lib");
                const toggle = line.querySelector(":scope > .wv-refs-card-libtoggle");
                const list = line.querySelector(":scope > .wv-refs-card-libmore");
                assert.ok(toggle && list, label + ": the button and its list");
                const sentence = plain(Array.from(line.childNodes).filter(n => n !== list).map(n => n.textContent).join(""));
                assert.equal(sentence, "In " + first + " and 2 other libraries", label + ": one library named, the others counted");
                assert.deepEqual(Array.from(line.querySelectorAll(":scope > .wv-refs-card-libname")).map(n => plain(n.textContent)), [first], label + ": one name in the line");
                assert.equal(win.getComputedStyle(list).display, "none", label + ": the others folded");
                assert.equal(toggle.getAttribute("role"), "button");
                assert.equal(toggle.getAttribute("aria-expanded"), "false");
                assert.include(win.getComputedStyle(toggle, "::after").content, "▾", label + ": its arrow down");
                click(toggle);
                assert.equal(win.getComputedStyle(list).display, "flex", label + ": a click drops them down");
                assert.equal(toggle.getAttribute("aria-expanded"), "true");
                assert.include(win.getComputedStyle(toggle, "::after").content, "▴", label + ": its arrow up");
                const items = Array.from(list.querySelectorAll(":scope > .wv-refs-card-libname"));
                assert.deepEqual(items.map(n => plain(n.textContent)), others, label + ": the others, one per line");
                assert.isAbove(items[1].getBoundingClientRect().top, items[0].getBoundingClientRect().bottom - 1, label + ": under each other");
                for (const n of items) {
                    assert.equal(n.getAttribute("role"), "button");
                    assert.equal(plain(n.getAttribute("title")), "Show in " + plain(n.textContent), label + ": each says what a click does");
                    assert.ok(n.querySelector(".wv-refs-libbadge"), label + ": each after its library's icon");
                    click(n);
                }
                assert.deepEqual(shown, /** @type {string[]} */ (others).map(n => copyOf[n]), label + ": each name shows its own copy");
                click(toggle);
                assert.equal(win.getComputedStyle(list).display, "none", label + ": a second click folds them");
                assert.equal(toggle.getAttribute("aria-expanded"), "false");
            }
        }
        finally { host.remove(); }
    });

    it("the edge cases: no PDF -- Show in Library and Copy As, as on the popup; no split view -- New Tab, New Window, Copy As", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        let menu = await openMarkMenu(1);
        assert.deepEqual(shapeOf(menu), ["card", "btns"], "[2] without a file: the card and its buttons");
        const b = btnsOf(menu);
        assert.deepEqual(b.map(actOf), ["library", "copy-as"], "Show in Library and Copy As");
        assert.match(String(b[0].getAttribute("image")), /collection-tree\/16\/(light|dark)\/library\.svg$/, "Show in Library wears the library's icon");
        rowGeometry(menu, "without a file");
        menu.hidePopup();
        assert.ok(await menuGone());
        await wvT.withPref("weavero.enableSplitView", false, async () => {
            menu = await openMarkMenu(0);
            assert.deepEqual(btnsOf(menu).map(actOf), ["tab", "window", "copy-as"], "no Split View");
            rowGeometry(menu, "without Split View");
            menu.hidePopup();
            assert.ok(await menuGone());
        });
    });

    it("the row right to left: the buttons at the card's foot on its left, in the popup's order from the right; Left and Right follow the screen", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        win.focus();
        await wvT.waitFor(() => Services.focus.activeWindow === win || null, 3000, 50);
        const menu = await openMarkMenu(0, true);
        try {
            assert.equal(win.getComputedStyle(menu).direction, "rtl", "fixture: the menu right to left");
            const R = rowGeometry(menu, "right to left", true);
            assert.isAbove(R[0].left, R[1].left, "New Tab on the right, Split View on its left");
            const seen = [];
            for (const k of ["ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowRight"]) { key(k); seen.push(k.replace("Arrow", "") + ":" + await settled(menu)); }
            assert.deepEqual(seen, ["Down:tab", "Left:split", "Left:window", "Right:split"], "Left goes to the button on the left");
        }
        finally {
            try { menu.hidePopup(); } catch (e) {}
            await menuGone();
        }
    });

    it("the menu leaves nothing behind: its key listener on the window only while the menu is up, the menu gone once closed", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        const lib = wvT.lib();
        const ours = () => lib.wvListenKeys(win).filter(k => k.key === "lazy:refs-grid-keys").length;
        const left = win.document.getElementById("wv-refs-menu");
        if (left) { left.hidePopup(); await menuGone(); }
        assert.equal(ours(), 0, "none before");
        // A menu replaced while it is up (a new one removes the old at once): one listener, the new menu's.
        await openMarkMenu(3);
        assert.ok(await wvT.waitFor(() => ours() === 1 || null, 2000, 20), "one while it is up");
        const menu = await openMarkMenu(0);
        assert.ok(await wvT.waitFor(() => ours() === 1 || null, 2000, 20), "one after a menu replaced the other");
        win.focus();
        await wvT.waitFor(() => Services.focus.activeWindow === win || null, 3000, 50);
        key("ArrowDown");
        await settled(menu);
        key("ArrowRight");
        assert.equal(await settled(menu), "split", "Right acts on the menu that is up");
        menu.hidePopup();
        assert.ok(await menuGone(), "the menu removed from the document");
        assert.equal(ours(), 0, "none once it is closed");
    });

    // ---- C: the References section of the reader's item pane -----------------

    let cpWas = null;
    const det = () => win.document.querySelector('#zotero-context-pane item-details[data-tab-id="' + reader.tabID + '"]');
    // By its suffix: the registered key carries the plugin id with a CSS escape
    // in it ("weavero\@mjthoraval-..."), which a quoted selector would read as "@".
    const secEl = () => { const d = det(); return d && wv._wvRefsSecKey ? d.querySelector('item-pane-custom-section[data-pane$="weavero-references"]') : null; };
    const secRows = () => { const s = secEl(); return s ? Array.from(s.querySelectorAll(".wv-refs-sec-row")) : []; };
    async function showSection() {
        ZT.select(reader.tabID);
        await wvT.sleep(300);
        if (cpWas === null) cpWas = !!win.ZoteroContextPane.collapsed;
        win.ZoteroContextPane.collapsed = false;
        const d = await wvT.waitFor(() => det(), 10000, 100);
        assert.ok(d, "the reader tab's item pane");
        assert.ok(await wvT.waitFor(() => secEl(), 10000, 100), "the References section is in it (" + wv._wvRefsSecKey + ")");
        try { await d.scrollToPane(wv._wvRefsSecKey, "instant"); } catch (e) {}
        assert.ok(await wvT.waitFor(() => secRows().length > 0, 10000, 100), "its rows");
    }

    it("C: the reader's References section lists the paper's references in order, with their marks and the counts in its header", async function () {
        await showSection();
        const rows = secRows();
        assert.equal(rows.length, 4, "every entry");
        assert.deepEqual(rows.map(r => r.getAttribute("data-wv-refs-entry")), ["0", "1", "2", "3"], "in document order");
        assert.deepEqual(rows.map(r => r.querySelector(".wv-refs-mark").getAttribute("data-wv-refs-kind")), ["pdf", "nopdf", "web", "pdf"]);
        ENTRIES.forEach(([a], i) => assert.include(rows[i].getAttribute("title"), a.slice(0, 30), "the whole entry in its tooltip"));
        const cs = secEl().querySelector("collapsible-section");
        // "4 References", as Zotero counts its sections; how many are in your library is
        // the chips' (MJT 2026-11-20, "only need to say 20 References").
        assert.deepEqual(JSON.parse(cs.dataset.l10nArgs), { state: "counted", total: 4 });
        assert.ok(await wvT.waitFor(() => (cs.getAttribute("label") || "") === "4 References", 5000, 100), "the header says it: " + cs.getAttribute("label"));
        assert.deepEqual(Array.from(rows[0].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act")), ["tab", "split", "window", "more"]);
        assert.deepEqual(Array.from(rows[1].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act")), ["library", "more"]);
        const libPath = rows[1].querySelector('.wv-refs-btn[data-wv-refs-act="library"] svg path');
        assert.equal(libPath && String(libPath.getAttribute("fill")).toLowerCase(), "#4072e5", "Show in Library: My Library's icon");
        assert.deepEqual(Array.from(rows[2].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act")), ["web"], "not in your library: the globe alone");
    });

    // MJT 2026-11-20: "The filters should follow the Weavero filters design: use icons (blue
    // dot, empty circle, ...), allow negative selection if relevant"; then "The focusing
    // position rule should follow the Weavero rule of 1/4th from the top".
    it("C: the filter chips -- a click shows only that kind, Alt+click hides it, the same gesture undoes it; a clicked entry lands a quarter down the PDF", async function () {
        await showSection();
        const click = (el, alt) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, altKey: !!alt }));
        const chip = (k) => secEl().querySelector('.wv-refs-chips .wv-scope-count[data-kind="' + k + '"]');
        const kinds = () => secRows().map(r => r.querySelector(".wv-refs-mark").getAttribute("data-wv-refs-kind") || "web");
        assert.deepEqual(["pdf", "nopdf", "web"].map(k => chip(k) && chip(k).querySelector(".wv-scope-count-n").textContent), ["2", "1", "1"], "the counts by kind");
        assert.ok(chip("pdf").closest(".wv-scope-or-group") === chip("web").closest(".wv-scope-or-group"), "the kinds on one grey card");
        assert.isNull(chip("away"), "no chip for a kind nothing has");
        assert.match(chip("nopdf").title, /without a PDF: 1/, "its tooltip says what it counts");
        click(chip("pdf"));
        assert.ok(await wvT.waitFor(() => secRows().length === 2 || null, 3000, 50), "the dot alone: 2 rows (" + secRows().length + ")");
        assert.deepEqual(kinds(), ["pdf", "pdf"]);
        assert.equal(chip("pdf").dataset.selected, "true");
        click(chip("nopdf"));
        assert.ok(await wvT.waitFor(() => secRows().length === 3 || null, 3000, 50), "the dot or the ring: 3 rows");
        click(chip("pdf"));
        click(chip("nopdf"));
        assert.ok(await wvT.waitFor(() => secRows().length === 4 || null, 3000, 50), "both undone: all 4");
        click(chip("web"), true);
        assert.ok(await wvT.waitFor(() => secRows().length === 3 || null, 3000, 50), "the globe hidden: 3 rows");
        assert.equal(chip("web").dataset.excluded, "true");
        assert.notInclude(kinds(), "web");
        click(chip("web"), true);
        assert.ok(await wvT.waitFor(() => secRows().length === 4 || null, 3000, 50), "Alt+click again: all 4");
        assert.ok(secEl().querySelector("collapsible-section").open, "a chip's press does not fold the section");
        // The row's buttons float over its end: no column of their own (MJT 2026-11-20,
        // "It is still a lot of empty space wasted").
        const btns = secRows()[0].querySelector(".wv-refs-sec-btns");
        assert.equal(win.getComputedStyle(btns).position, "absolute", "the buttons take no width from the text");
        // The entry clicked: its first line a quarter down the view (or as far as the end
        // of the document lets it go).
        const viewer = pv._iframeWindow.PDFViewerApplication.pdfViewer;
        viewer.currentPageNumber = 1;
        await wvT.waitFor(() => viewer.currentPageNumber === 1, 3000, 50);
        click(secRows()[3].querySelector(".wv-refs-sec-text"));
        assert.ok(await wvT.waitFor(() => viewer.currentPageNumber === 2, 5000, 50), "the PDF on the entry's page (" + viewer.currentPageNumber + ")");
        await wvT.sleep(300);
        const e3 = (await wv._wvRefsEntries(citingAtt.id))[3];
        const b = e3.rects.reduce((t, r) => (r[0] === e3.rects[0][0] && Math.max(r[2], r[4]) > Math.max(t[2], t[4]) ? r : t), e3.rects[0]);
        const page = Cu.waiveXrays(viewer)._pages[b[0]];
        const cont = pv._iframeWindow.document.getElementById("viewerContainer");
        const pt = page.viewport.convertToViewportPoint(b[1], Math.max(b[2], b[4]));
        const y = page.div.getBoundingClientRect().top - cont.getBoundingClientRect().top + pt[1];
        const quarter = cont.clientHeight / 4;
        const atEnd = cont.scrollTop >= cont.scrollHeight - cont.clientHeight - 2;
        assert.ok(Math.abs(y - quarter) <= 14 || (atEnd && y >= quarter - 14), "the entry's first line at " + Math.round(y) + " px, a quarter is " + Math.round(quarter) + " px" + (atEnd ? " (the document's end)" : ""));
    });

    // MJT 2026-11-20: "A click on the filter makes the items pane scroll down" -- the pane
    // scrolled to its end by hand (no pinned section: no spacer of Zotero's), a chip that
    // hides rows: the range shrank under the view and it jumped by what the filter took.
    it("C: a chip leaves the item pane where it is, scrolled to its end by hand", async function () {
        await showSection();
        const d = det();
        const pp = d._paneParent;
        const chip = (k) => secEl().querySelector('.wv-refs-chips .wv-scope-count[data-kind="' + k + '"]');
        const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const head = () => secEl().querySelector("collapsible-section > .head");
        try {
            // As a scroll by hand leaves it: Zotero's spacer off (showSection's
            // scrollToPane set one), the view at the range's end.
            d._minScrollHeight = 0;
            await wvT.sleep(100);
            pp.scrollTop = pp.scrollHeight;
            await wvT.sleep(200);
            assert.isAbove(pp.scrollTop, 0, "fixture: the pane scrolls (" + pp.scrollHeight + " / " + pp.clientHeight + ")");
            assert.ok(pp.scrollTop >= pp.scrollHeight - pp.clientHeight - 1, "fixture: at its end");
            const top0 = head().getBoundingClientRect().top;
            const h0 = secEl().getBoundingClientRect().height;
            click(chip("pdf"));
            assert.ok(await wvT.waitFor(() => secRows().length === 2 || null, 3000, 50), "the dot alone: 2 rows");
            await wvT.sleep(200);
            assert.isBelow(secEl().getBoundingClientRect().height, h0 - 10, "fixture: the section is shorter");
            assert.approximately(head().getBoundingClientRect().top, top0, 1, "the header stays where it was");
        }
        finally {
            if (chip("pdf") && chip("pdf").dataset.selected) click(chip("pdf"));
            await wvT.waitFor(() => secRows().length === 4 || null, 3000, 50);
        }
    });

    // MJT 2026-11-19: "Missing a space after the reference number", then "Can you put the
    // citation number in another color, and keep a space after it?"
    // MJT 2026-11-20 (dark theme): the accent blue was too faint -> "Bold, normal colour".
    it("C: a row shows the entry's number apart, bold in the text's own colour, then one space and the text", async function () {
        await showSection();
        const row = secRows()[0];
        const lab = row.querySelector(".wv-refs-sec-text > .wv-refs-sec-label");
        assert.ok(lab, "the number is an element of its own: " + row.querySelector(".wv-refs-sec-text").innerHTML.slice(0, 120));
        assert.equal(lab.textContent, "[1]");
        assert.match(lab.nextSibling && lab.nextSibling.textContent, /^ Adams, J\./, "one space, then the entry's text");
        const cs = win.getComputedStyle(lab);
        assert.equal(cs.color, win.getComputedStyle(row.querySelector(".wv-refs-sec-text")).color, "the text's own colour");
        assert.isAtLeast(parseInt(cs.fontWeight, 10), 600, "bold");
        assert.match(row.getAttribute("title"), /^\[1\] Adams/, "the tooltip too");
    });

    // refkeys.1 (2026-11-24, MJT "Also ok"; idea from Changed Reference Linker, gesongping, MIT): a
    // reference that several works of the libraries fit about equally keeps its link to the best one,
    // and its mark says so -- the dot inside a dashed ring, its tooltip naming the works.
    it("C and popup: an ambiguous reference's mark is the uncertain one, its tooltip naming the works (title, type, year); [4]'s two copies are no such case", async function () {
        wvT.method("_wvRefsSecBuild");
        wvT.method("_wvRefsRowSet");
        const data = wv._wvRefsDocRows(reader);
        assert.ok(data && data.rows.length === 4, "the fixture's rows");
        for (const r of data.rows) assert.notOk(r.hit && r.hit.amb, "not ambiguous ([4]: one work in two libraries): " + JSON.stringify(r.hit));
        const r1 = data.rows.find(r => r.hit && r.hit.ids.includes(a1.id));
        assert.ok(r1, "[1]'s row");
        // [1] as if a2 fitted it as well (the matcher's own cases: refs-match.spec.js "refkeys: ambiguous").
        const hit = Object.assign({}, r1.hit, { amb: [a1.id, a2.id] });
        const doc = win.document;
        const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        doc.documentElement.appendChild(body);
        const idoc = reader._iframeWindow.document;
        const prow = idoc.createElement("div");
        prow.className = "reference-row";
        idoc.body.appendChild(prow);
        try {
            wv._wvRefsSecBuild(body, doc, reader, { rows: [{ i: 0, entry: r1.entry, hit, shown: true }, { i: 1, entry: r1.entry, hit: r1.hit, shown: true }], have: 0, total: 2 });
            const marks = Array.from(body.querySelectorAll(".wv-refs-sec-row .wv-refs-mark"));
            assert.equal(marks.length, 2, "two rows");
            wv._wvRefsRowSet(reader, prow, hit, { view: "primary", smart: false });
            const pm = prow.querySelector(":scope > .wv-refs-row-mark");
            assert.ok(pm, "the popup row's mark");
            for (const [m, where] of [[marks[0], "References row"], [pm, "popup row"]]) {
                assert.ok(m.hasAttribute("data-wv-refs-uncertain"), where + ": the uncertain variant");
                assert.equal(m.getAttribute("data-wv-refs-kind"), "pdf", where + ": its colour still says where it is");
                const ring = m.querySelector("circle[stroke-dasharray]");
                assert.ok(ring, where + ": a dashed ring");
                const dot = Array.from(m.querySelectorAll("circle")).find(c => c !== ring);
                assert.ok(dot && Number(dot.getAttribute("r")) < 4.5, where + ": a smaller dot inside it");
                const w = m.ownerDocument.defaultView;
                assert.equal(w.getComputedStyle(ring).stroke, w.getComputedStyle(m).color, where + ": the ring in the mark's own colour");
                const tip = String(m.getAttribute("title"));
                assert.match(tip, /^In your library .*\nSeveral items in your libraries could be this reference/, where + ": " + tip);
                const lines = tip.split("\n");
                assert.include(lines[2], "Drop impact on a heated plate in a vacuum chamber", where + ": the one shown first");
                assert.include(lines[2], "2016");
                assert.include(lines[2], "Journal Article");
                assert.include(lines[3], "Bubble entrapment beneath falling droplets of viscous oil");
                assert.include(lines[3], "2019");
                assert.equal(lines.length, 4, where + ": the status, the line, two works -- the mark does not act");
            }
            assert.notOk(marks[1].hasAttribute("data-wv-refs-uncertain"), "the plain mark beside it");
            assert.notOk(marks[1].querySelector("circle[stroke-dasharray]"));
            assert.notInclude(String(marks[1].getAttribute("title")), "Several items");
            // The margin's mark (B2) says what a click does after the works.
            const full = wv._wvRefsMarkTip(reader, hit, r1.entry);
            assert.match(full, /\nSeveral items[^]*\n“⁨?Bubble entrapment[^\n]*\n.*[Cc]lick/, "the click's line last (Fluent's isolation mark before a placeable): " + full);
        }
        finally { body.remove(); prow.remove(); }
    });

    // MJT 2026-11-19: "A click in the item pane of the reader should highlight the reference in the
    // reader, same color as in the preview".
    it("C: a click on a row marks the whole entry in the PDF with the link preview's tint -- one mark, Zotero's outline taken off -- until the next press in the view", async function () {
        await showSection();
        const iw = pv._iframeWindow;
        const doc = iw.document;
        const viewer = iw.PDFViewerApplication.pdfViewer;
        viewer.currentPageNumber = 1;
        await wvT.waitFor(() => viewer.currentPageNumber === 1, 3000, 50);
        const entries = await wv._wvRefsEntries(citingAtt.id);
        const e3 = entries[3];
        secRows()[3].querySelector(".wv-refs-sec-text").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        assert.ok(await wvT.waitFor(() => viewer.currentPageNumber === 2, 5000, 50), "the PDF on the entry's page (" + viewer.currentPageNumber + ")");
        const layer = await wvT.waitFor(() => doc.querySelector(".pdfViewer > .wv-refs-entryhl"), 3000, 50);
        assert.ok(layer, "the entry's mark");
        const boxes = Array.from(layer.querySelectorAll(".wv-refs-entryhl-box"));
        assert.equal(boxes.length, e3.rects.length, "a box per line of the entry: " + JSON.stringify(e3.rects));
        assert.equal(iw.getComputedStyle(boxes[0]).backgroundColor, "rgba(245, 123, 123, 0.25)", "the link preview's tint");
        // Each box covers its line: the line's box in the page, converted as pdf.js does.
        const page = viewer._pages[e3.rects[0][0]];
        const p1 = page.viewport.convertToViewportPoint(e3.rects[0][1], e3.rects[0][2]), p2 = page.viewport.convertToViewportPoint(e3.rects[0][3], e3.rects[0][4]);
        const pr = page.div.getBoundingClientRect(), br = boxes[0].getBoundingClientRect();
        assert.approximately(br.left - pr.left, Math.min(p1[0], p2[0]), 2, "the first box's left");
        assert.approximately(br.width, Math.abs(p2[0] - p1[0]), 2, "the first box's width");
        assert.notOk(Cu.waiveXrays(pv)._highlightedPosition, "Zotero's own outline taken off: one mark");
        // A press in the view takes it away.
        iw.document.getElementById("viewerContainer").dispatchEvent(new iw.PointerEvent("pointerdown", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw)));
        assert.ok(await wvT.waitFor(() => !doc.querySelector(".wv-refs-entryhl"), 2000, 50), "gone at the next press");
        // Left alone, it goes after WV_REFS_ENTRY_HL_MS (5 s).
        wv._wvRefsShowEntry(reader, e3);
        assert.ok(await wvT.waitFor(() => doc.querySelector(".wv-refs-entryhl"), 2000, 50), "marked again");
        assert.ok(await wvT.waitFor(() => !doc.querySelector(".wv-refs-entryhl"), 8000, 100), "gone after a few seconds");
    });

    // MJT 2026-11-19: "Also in the library's item pane". Only for an item whose PDF already has
    // Zotero's structure cache, read from that cache alone: nothing generated, nothing written.
    it("C (library): the library's item pane shows the section for an item whose PDF has a structure cache, hidden for one without; nothing written", async function () {
        const cachePath = PathUtils.join(Zotero.Attachments.getStorageDirectory(citingAtt).path, ".zotero-sdt-cache");
        assert.isTrue(await IOUtils.exists(cachePath), "fixture: the reader built the citing PDF's structure cache");
        const before = await IOUtils.stat(cachePath);
        // An item whose PDF no reader ever opened ([1]'s was, by the Tab case above): made in before().
        const a1Cache = PathUtils.join(Zotero.Attachments.getStorageDirectory(freshPdf).path, ".zotero-sdt-cache");
        assert.isFalse(await IOUtils.exists(a1Cache), "fixture: a PDF never opened has no cache");
        ZT.select("zotero-pane");
        const libDet = () => Array.from(win.document.querySelectorAll("item-details")).find(d => (d.tabType === "library" || d.closest("#zotero-item-pane")) && d.getBoundingClientRect().width > 0);
        const libSec = () => { const d = libDet(); return d ? d.querySelector('item-pane-custom-section[data-pane$="weavero-references"]') : null; };
        const libRows = () => { const s = libSec(); return s ? Array.from(s.querySelectorAll(".wv-refs-sec-row")) : []; };
        await win.ZoteroPane.selectItem(citing.id);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 4, 15000, 100),
            "the citing paper: its four references (section " + !!libSec() + ", hidden " + (libSec() && libSec().hidden) + ", rows " + libRows().length + ")");
        assert.deepEqual(libRows().map(r => { const m = r.querySelector(".wv-refs-mark"); return m ? m.getAttribute("data-wv-refs-kind") : null; }), ["pdf", "nopdf", "web", "pdf"], "the same marks as in the reader");
        // Split from the library too, beside the library tab (citations.6, MJT 2026-11-21 "OK").
        assert.deepEqual(Array.from(libRows()[0].querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act")), ["tab", "split", "window", "more"], "Tab, Split, Window, ⋯ -- as beside a PDF");
        // An item whose PDF has no cache, one without a PDF: no section, and still no cache made.
        for (const it of [fresh, a2]) {
            await win.ZoteroPane.selectItem(it.id);
            await wvT.sleep(800);
            assert.ok(!libSec() || libSec().hidden, "no section for " + it.getField("title"));
        }
        assert.isFalse(await IOUtils.exists(a1Cache), "the library pane made no cache for that PDF");
        const after = await IOUtils.stat(cachePath);
        assert.equal(after.lastModified, before.lastModified, "the citing PDF's cache file untouched");
        assert.equal(after.size, before.size);
        // A click on a row opens the PDF at the entry (its tab, here already open) and marks it.
        await win.ZoteroPane.selectItem(citing.id);
        assert.ok(await wvT.waitFor(() => libRows().length === 4, 10000, 100), "the rows again");
        libRows()[3].querySelector(".wv-refs-sec-text").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        assert.ok(await wvT.waitFor(() => ZT.selectedID === reader.tabID, 10000, 100), "the citing paper's tab selected");
        assert.ok(await wvT.waitFor(() => pv._iframeWindow.document.querySelector(".wv-refs-entryhl"), 10000, 100), "the entry marked in it");
    });

    // citations.6 (MJT 2026-11-21, "OK"): Split from the LIBRARY's References rows -- the cited
    // PDF beside the library tab through the split view's shared "beside" open (Ctrl+Enter in the
    // items list's): the library on one side, the PDF on the other; the next row's Split puts its
    // PDF on that side, the first PDF's tab kept; the ⋯ menu offers it as well.
    it("C (library): rows with a PDF offer Split when the split view is on, none when off; Split puts the PDF beside the library tab, the next row's Split takes that side", async function () {
        ZT.select("zotero-pane");
        const libDet = () => Array.from(win.document.querySelectorAll("item-details")).find(d => (d.tabType === "library" || d.closest("#zotero-item-pane")) && d.getBoundingClientRect().width > 0);
        const libSec = () => { const d = libDet(); return d ? d.querySelector('item-pane-custom-section[data-pane$="weavero-references"]') : null; };
        const libRows = () => { const s = libSec(); return s ? Array.from(s.querySelectorAll(".wv-refs-sec-row")) : []; };
        const acts = (r) => Array.from(r.querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act"));
        // The rows of the library's pane, also while it is a side of a split.
        const rowAt = (i) => win.document.querySelector('#zotero-item-pane item-pane-custom-section[data-pane$="weavero-references"] .wv-refs-sec-row[data-wv-refs-entry="' + i + '"]');
        const pressAt = (i) => rowAt(i).querySelector('.wv-refs-btn[data-wv-refs-act="split"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const pairOf = (att) => { const t = tabOfItem(att.id); const s = t && wv._wvTabSplitOf(win, "zotero-pane"); return s && !s.dock && !s.picker && [s.left, s.right].includes("zotero-pane") && [s.left, s.right].includes(t.id) ? s : null; };
        await win.ZoteroPane.selectItem(citing.id);
        assert.ok(await wvT.waitFor(() => libSec() && !libSec().hidden && libRows().length === 4, 15000, 100), "the citing paper's four references");
        try {
            assert.deepEqual(libRows().map(acts), [["tab", "split", "window", "more"], ["library", "more"], ["web"], ["tab", "split", "window", "more"]], "Split on the rows with a PDF");
            await wvT.withPref("weavero.enableSplitView", false, async () => {
                wv._wvRefsSecRefreshFor(null);
                assert.ok(await wvT.waitFor(() => libRows().length === 4 && acts(libRows()[0]).join() === "tab,window,more", 5000, 50), "split view off: no Split (" + acts(libRows()[0]).join() + ")");
                // Nor in the ⋯ menu.
                libRows()[0].querySelector('.wv-refs-btn[data-wv-refs-act="more"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
                const m = await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 50);
                assert.ok(m, "the ⋯ menu");
                assert.notOk(m.querySelector('[data-wv-refs-act="split"]'), "no Open PDF in Split View there");
                assert.deepEqual(btnsOf(m).map(actOf), ["tab", "window", "copy-as"], "the buttons without Split View");
                m.hidePopup();
            });
            wv._wvRefsSecRefreshFor(null);
            assert.ok(await wvT.waitFor(() => libRows().length === 4 && acts(libRows()[0]).includes("split"), 5000, 50), "on again: Split back");
            libRows()[0].querySelector('.wv-refs-btn[data-wv-refs-act="more"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            const m2 = await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 50);
            assert.ok(m2 && m2.querySelector('[data-wv-refs-act="split"]'), "the ⋯ menu offers Open PDF in Split View");
            assert.deepEqual(btnsOf(m2).map(actOf), ["tab", "split", "window", "copy-as"], "the library pane's ⋯: the buttons");
            m2.hidePopup();
            pressAt(0);
            const s1 = await wvT.waitFor(() => pairOf(a1pdf), 15000, 100);
            assert.ok(s1, "a split of the library tab and [1]'s PDF: " + JSON.stringify(wv._wvTabSplitOf(win, "zotero-pane")));
            assert.equal(ZT.selectedID, tabOfItem(a1pdf.id).id, "the PDF's side selected");
            const t1 = tabOfItem(a1pdf.id).id;
            pressAt(3);
            const s2 = await wvT.waitFor(() => pairOf(a4gpdf), 15000, 100);
            assert.ok(s2, "[4]'s PDF (the group's copy) on the PDF side: " + JSON.stringify(wv._wvTabSplitOf(win, "zotero-pane")));
            assert.ok(ZT._tabs.some(t => t.id === t1), "[1]'s PDF keeps its tab");
            assert.notOk(pairOf(a1pdf), "no longer beside the library");
        }
        finally {
            try { const s = wv._wvTabSplitOf(win, "zotero-pane"); if (s && !s.dock) wv._wvTabSplitSeparate(win, s.id); } catch (e) {}
            await wvT.sleep(300);
            try { ZT.select("zotero-pane"); } catch (e) {}
        }
    });

    // WV-TEMP-134867 (main 0787d5b4, merged 2026-11-19): a PDF link's popup over one of Zotero's
    // reference cards becomes the card (preview-highlight.ts _wvCitCardSwap) -- and the card shown
    // that way gets Weavero's marks like any other.
    it("popup: a PDF link over a reference card shows the card, with Weavero's marks (WV-TEMP-134867)", async function () {
        if (typeof wv._wvCitCardFor !== "function") this.skip();
        await closePopup();
        const W = Cu.waiveXrays(reader._iframeWindow);
        const r0 = Array.from(citeOverlay.position.rects[0]).map(Number);
        const ref0 = citeOverlay.references[0];
        const link = { type: "internal-link", source: "annotation", wvTest: "refs-134867",
            position: { pageIndex: 0, rects: [[r0[0] - 1, r0[1] - 1, r0[2] + 1, r0[3] + 1]] },
            destinationPosition: { pageIndex: Number(ref0.position.pageIndex), rects: [Array.from(ref0.position.rects[0]).map(Number)] } };
        const cl = Cu.cloneInto(link, W);
        if (typeof pv._openOverlayPopup === "function") await pv._openOverlayPopup(cl);
        else {
            // Zotero 10.0.8: the open's two steps by hand, as openPopup does (the rect from the
            // reader's own copy: an array of this scope is out of the page's reach).
            const popup = W.Object.assign(new W.Object(), cl);
            popup.rect = Cu.cloneInto(Array.from(pv.getClientRect(cl.position.rects[0], 0)), W);
            pv._onSetOverlayPopup(popup);
        }
        const st = await wvT.waitFor(() => { const s = state(); return s && s.type ? s : null; }, 15000, 50);
        assert.equal(st && st.type, "citation", "the card, not the page picture");
        assert.ok(await wvT.waitFor(() => rowsOf().length === 4 && ctlOf(rowFor(0)), 15000, 50), "its rows, marked (rows " + rowsOf().length + ")");
        assert.equal(kindOf(rowFor(0)), "pdf");
        assert.equal(kindOf(rowFor(1)), "nopdf");
        await closePopup();
    });

    // Zotero renders a hidden section never, its refresh included
    // (itemPaneSectionElementBase.mjs _forceRenderAll): a section hidden while
    // the paper's list was not read yet stayed hidden for good on 1.1.1-refs.2
    // (live check on 11.0-beta.4: every paper, "References", 0 rows).
    it("C: a section hidden while the paper's list was not read yet comes up once it is", async function () {
        await showSection();
        const el = secEl();
        wv._wvRefsEntriesNow.delete(citingAtt.id);
        if (wv._wvRefsRowCache) wv._wvRefsRowCache.delete(citingAtt.id);
        el._handleItemChange();
        assert.isTrue(el.hidden, "fixture: hidden while the list is not known");
        assert.ok(await wvT.waitFor(() => !el.hidden && secRows().length === 4, 10000, 100),
            "shown with its rows once the list is read (hidden " + el.hidden + ", rows " + secRows().length + ")");
    });

    it("C: the section goes with its setting and comes back with it", async function () {
        await showSection();
        await wvT.withPref("weavero.referencesSection", false, async () => {
            assert.ok(await wvT.waitFor(() => !wv._wvRefsSecKey && !(det() && det().querySelector('item-pane-custom-section[data-pane$="weavero-references"]')), 8000, 100),
                "unregistered, gone from the item pane");
        });
        assert.ok(await wvT.waitFor(() => secEl(), 10000, 100), "registered again with the setting on");
        try { if (cpWas !== null) win.ZoteroContextPane.collapsed = cpWas; } catch (e) {}
    });

    // ---- the library badge: copies only in other libraries ---------------------
    // MJT 2026-11-19 ("Group badge", then "the icon of the library that holds
    // the copy"): when no copy of a reference is in the citing paper's library,
    // its mark -- the popup row's, the reference list's, the section row's --
    // carries the badge of the library its best copy is in: the tab strip's
    // teal temple for a group, My Library's blue one; the tooltips say "Only
    // in <library>", and the menus name that library.

    const plain = (s) => String(s || "").replace(/[⁨⁩]/g, "");
    const userLibName = () => String(/** @type {any} */ (Zotero.Libraries.get(Zotero.Libraries.userLibraryID)).name);
    /** A mark's library badge: "group", "user", or null; with the mark's own attribute agreeing. */
    const badgeOf = (mark) => {
        if (!mark) return "no mark";
        const b = mark.querySelector(":scope > .wv-refs-libbadge");
        const kind = b ? b.getAttribute("data-wv-lib") : null;
        assert.equal(mark.getAttribute("data-wv-refs-lib"), kind, "the mark says the same as its badge");
        return kind;
    };
    /** A mark's library badge has its corner 40 % across and 30 % down its dot -- on every
     *  surface, as in the PDF's margin (MJT 2026-11-20; refs.ts BADGE_AT). */
    const badgeBeside = (mark, label) => {
        const dot = mark.querySelector(":scope > svg").getBoundingClientRect();
        const b = mark.querySelector(":scope > .wv-refs-libbadge").getBoundingClientRect();
        assert.approximately(b.left, dot.left + 0.4 * (dot.right - dot.left), 1, label + ": the badge's corner 40 % across its dot");
        assert.approximately(b.top, dot.top + 0.3 * (dot.bottom - dot.top), 1, label + ": and 30 % down");
    };
    const popMark = (k) => rowMark(rowFor(k));
    const bibMarkOf = (k) => bibMarks().find(m => m.getAttribute("data-wv-refs-entry") === String(k)) || null;
    const secMarkOf = (k) => { const r = secRows().find(x => x.getAttribute("data-wv-refs-entry") === String(k)); return r ? r.querySelector(".wv-refs-mark") : null; };
    /** Each badge beside the reference list ends before its entry's text. */
    async function badgesClearOfText(label) {
        for (const m of bibMarks()) {
            const b = m.querySelector(".wv-refs-libbadge");
            if (!b) continue;
            const box = await entryBox(Number(m.getAttribute("data-wv-refs-entry")));
            const r = b.getBoundingClientRect();
            assert.isAbove(r.width, 0, label + ": the badge is drawn");
            assert.isAtMost(r.right, box.left + 1, label + ": the badge ends before its entry (" + r.right + " vs " + box.left + ")");
            // Its corner on its dot's centre: half the dot across, half down (MJT 2026-11-20).
            const d = m.querySelector(":scope > svg").getBoundingClientRect();
            assert.approximately(r.left, d.left + 0.4 * (d.right - d.left), 0.75, label + ": the badge's corner 40 % across its dot");
            assert.approximately(r.top, d.top + 0.3 * (d.bottom - d.top), 0.75, label + ": and 30 % down");
        }
    }
    /** Open the reference-list mark k's menu: its buttons as [act, tooltip], and the card's
     *  library names as [copy id, name, tooltip] -- the copy the buttons open first. */
    async function bibMenu(k) {
        const m = bibMarkOf(k);
        assert.ok(m, "a mark beside entry " + k);
        const iw = pv._iframeWindow;
        m.dispatchEvent(new iw.MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw)));
        const menu = await wvT.waitFor(() => { const x = win.document.getElementById("wv-refs-menu"); return x && x.querySelector("menuitem") ? x : null; }, 5000, 50);
        assert.ok(menu, "the menu");
        const out = {
            btns: Array.from(menu.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *")).map(i => [i.getAttribute("data-wv-refs-act"), plain(i.getAttribute("tooltiptext"))]),
            libs: Array.from(menu.querySelectorAll(":scope > .wv-refs-card .wv-refs-card-libname")).map(n => [n.getAttribute("data-wv-refs-copy"), plain(n.textContent), plain(n.getAttribute("title") || "")]),
        };
        menu.hidePopup();
        await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
        return out;
    }
    /** Run `fn` with the spec's helpers (popup, marks, section) on reader `r`. */
    async function onReader(r, fn) {
        const saved = [reader, ir, pv, citeOverlay];
        try {
            reader = r;
            ir = Cu.waiveXrays(r._internalReader);
            pv = await wvT.waitFor(() => {
                try {
                    const v = ir._primaryView;
                    return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount === 2 && v._pdfPages && v._pdfPages[0] ? v : null;
                } catch (e) { return null; }
            }, 30000);
            assert.ok(pv, "its PDF view is up");
            citeOverlay = await findOverlay();
            assert.ok(citeOverlay, "Zotero linked its citation [1, 2, 3, 4]");
            await wvT.waitFor(() => r._wvRefsMO, 15000, 100);
            await fn();
        }
        finally {
            try { await closePopup(); } catch (e) {}
            [reader, ir, pv, citeOverlay] = saved;
        }
    }

    it("badge: a reference only in a group gets the group's badge on its three marks, \"Only in <group>\"; the ones in this library none", async function () {
        const a3g = await article({ title: "Thin films on soft substrates and their slow drainage dynamics", date: "2021", _first: "Foster" }, group.libraryID);
        try {
            assert.ok(await until(async () => { await openPopup(); return badgeOf(popMark(2)) === "group"; }, 10000, 600), "[3] marked with the group's badge in the popup");
            assert.equal(plain(popMark(2).getAttribute("title")), "Only in wv-refs-group, without a PDF.");
            badgeBeside(popMark(2), "the popup");
            for (const k of [0, 1, 3]) assert.isNull(badgeOf(popMark(k)), "[" + (k + 1) + "] has a copy in My Library, the citing paper's: no badge");
            assert.equal(plain(popMark(0).getAttribute("title")), "In your library (" + userLibName() + "), with a PDF.", "the popup dot's status line");
            // The reference list's marks.
            assert.ok(await wvT.waitFor(() => bibMarks().length === 4 && bibMarkOf(2) && bibMarkOf(2).getAttribute("data-wv-refs-kind") === "nopdf", 8000, 100), "four marks beside the list, [3] a blue dot now (" + bibMarks().length + ")");
            assert.equal(badgeOf(bibMarkOf(2)), "group");
            assert.equal(plain(bibMarkOf(2).getAttribute("title")), "Only in wv-refs-group, without a PDF.\nClick for its details.");
            for (const k of [0, 1, 3]) assert.isNull(badgeOf(bibMarkOf(k)), "entry " + k + ": no badge");
            await marksBesideEntries("with a badge");
            await badgesClearOfText("with a badge");
            // [4]'s best copy is the group's (with a PDF), a copy is here too:
            // no badge, and the menu names where the copy it opens is.
            const m4 = await bibMenu(3);
            assert.deepEqual(m4.btns.map(x => x[0]), ["tab", "split", "window", "copy-as"], JSON.stringify(m4));
            // The card names both libraries, the copy the buttons open first; each name shows
            // its own copy (Show in Library, MJT 2026-11-26).
            assert.deepEqual(m4.libs.map(x => [x[0], x[1]]), [[String(a4g.id), "wv-refs-group"], [String(a4u.id), userLibName()]], "its libraries, the open copy's first");
            assert.equal(m4.libs[0][2], "Show in wv-refs-group", "a name says what a click does");
            const m1 = await bibMenu(0);
            assert.deepEqual(m1.btns.slice(0, 3).map(x => x[1]), ["Open in a new tab", "Open in split view", "Open in a new window"], "a copy in this library: the plain buttons");
            assert.deepEqual(m1.libs.map(x => x[1]), [userLibName()], "and its one library in the card");
            // The References section.
            await showSection();
            assert.ok(await wvT.waitFor(() => secMarkOf(2) && secMarkOf(2).getAttribute("data-wv-refs-kind") === "nopdf", 8000, 100), "the section's [3] marked");
            assert.equal(badgeOf(secMarkOf(2)), "group");
            assert.equal(plain(secMarkOf(2).getAttribute("title")), "Only in wv-refs-group, without a PDF.");
            badgeBeside(secMarkOf(2), "the References row");
            for (const k of [0, 1, 3]) assert.isNull(badgeOf(secMarkOf(k)), "section row " + k + ": no badge");
        }
        finally { await wvT.erase(a3g); }
        assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "web"; }, 10000, 600), "[3] the grey ring again once the copy is gone");
        assert.ok(await wvT.waitFor(() => bibMarks().length === 4 && bibMarkOf(2) && bibMarkOf(2).getAttribute("data-wv-refs-kind") === "web", 8000, 100), "its mark in the PDF the grey ring again");
    });

    it("badge: from a paper in a group, My Library's badge for a copy only there, the other group's for one only there, none for one in the same group", async function () {
        const citingG = await article({ title: "WV-TEST references fixture in a group", date: "2026", _first: "Tester" }, group.libraryID);
        const a2b = await article({ title: "Bubble entrapment beneath falling droplets of viscous oil", date: "2019", _first: "Davis" }, groupB.libraryID);
        const a3b = await article({ title: "Thin films on soft substrates and their slow drainage dynamics", date: "2021", _first: "Foster" }, groupB.libraryID);
        let attG = null, readerG = null;
        try {
            attG = await importFile("wv-refs-citing-g", fixturePDF(), { parentItemID: citingG.id });
            assert.equal(attG.libraryID, group.libraryID, "fixture: the citing PDF in the group");
            readerG = await wvT.openReaderTab(attG.id);
            assert.ok(readerG, "the group's citing paper opened");
            const ML = userLibName();
            await onReader(readerG, async () => {
                assert.ok(await until(async () => { await openPopup(); return badgeOf(popMark(2)) === "group"; }, 15000, 600), "[3] marked from the second group");
                assert.equal(badgeOf(popMark(0)), "user", "[1], only in My Library: My Library's badge");
                assert.equal(plain(popMark(0).getAttribute("title")), "Only in " + ML + ", with a PDF.");
                assert.equal(badgeOf(popMark(1)), "user", "[2], in My Library and the second group: My Library's copy first");
                // Every library holding a copy, named (MJT 2026-11-20: "Only in My Library is
                // wrong, because it is also in another group library").
                assert.equal(plain(popMark(1).getAttribute("title")), "Only in \u201c" + ML + "\u201d and \u201cwv-refs-group-b\u201d, without a PDF.", "several names each in quotes");
                assert.equal(plain(popMark(2).getAttribute("title")), "Only in wv-refs-group-b, without a PDF.");
                assert.isNull(badgeOf(popMark(3)), "[4] has a copy in the citing paper's group: no badge");
                assert.equal(plain(popMark(3).getAttribute("title")), "In your library (wv-refs-group), with a PDF.");
                // The card: on the row's hover now (several references in this popup).
                const hc = await hoverCardOf(rowFor(1));
                assert.ok(hc, "[2]'s card on its row's hover");
                const libLine = hc.querySelector(".wv-refs-card-lib");
                const libText = libLine ? plain(libLine.textContent) : null;
                const cw = hc.ownerDocument.defaultView;
                const libNames = libLine ? Array.from(libLine.querySelectorAll(":scope > .wv-refs-card-libname")).map(n => [plain(n.textContent), (n.querySelector(":scope > .wv-refs-libbadge") || { getAttribute: () => null }).getAttribute("data-wv-lib"), cw.getComputedStyle(n).whiteSpace]) : null;
                const libCopies = libLine ? Array.from(libLine.querySelectorAll(":scope > .wv-refs-card-libname")).map(n => n.getAttribute("data-wv-refs-copy")) : null;
                await hoverLeave(rowFor(1));
                // Two libraries hold [2]: each name in the card shows its own copy (MJT 2026-11-20).
                assert.deepEqual(libCopies, [String(a2.id), String(a2b.id)], "My Library's copy first, then the second group's");
                assert.equal(libText, "Only in " + ML + " and wv-refs-group-b", "the card names every library holding a copy");
                // Each name after its own library icon, never broken across lines.
                assert.deepEqual(libNames, [[ML, "user", "nowrap"], ["wv-refs-group-b", "group", "nowrap"]], "one icon per library name");
                // The reference list's marks.
                assert.ok(await wvT.waitFor(() => bibMarks().length === 4, 10000, 100), "four marks beside its list (" + bibMarks().length + ")");
                assert.deepEqual([0, 1, 2, 3].map(k => badgeOf(bibMarkOf(k))), ["user", "user", "group", null]);
                assert.equal(plain(bibMarkOf(0).getAttribute("title")), "Only in " + ML + ", with a PDF.\nClick for its details and where to open it.");
                await marksBesideEntries("from the group");
                await badgesClearOfText("from the group");
                const m1 = await bibMenu(0);
                // One library holds [1]: the card names it, and the name shows it there.
                assert.equal(m1.btns[0][1], "Open in a new tab", JSON.stringify(m1));
                assert.deepEqual(m1.libs.map(x => [x[1], x[2]]), [[ML, "Show in " + ML]]);
                // The References section.
                await showSection();
                assert.ok(await wvT.waitFor(() => secRows().length === 4 && secMarkOf(2) && secMarkOf(2).getAttribute("data-wv-refs-kind") === "nopdf", 10000, 100), "its section's rows");
                assert.deepEqual([0, 1, 2, 3].map(k => badgeOf(secMarkOf(k))), ["user", "user", "group", null]);
                assert.equal(plain(secMarkOf(2).getAttribute("title")), "Only in wv-refs-group-b, without a PDF.");
            });
        }
        finally {
            try { if (readerG) wvT.closeReaderTab(readerG); } catch (e) {}
            await wvT.sleep(500);
            try { ZT.select(reader.tabID); } catch (e) {}
            await wvT.erase(a3b, a2b, attG, citingG);
        }
        // The first paper's [3] is the grey ring again, its [2] and [3] badge-free.
        assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "web"; }, 10000, 600), "[3] the grey ring again from My Library's paper");
        assert.ok(await wvT.waitFor(() => bibMarks().length === 4 && bibMarkOf(2) && bibMarkOf(2).getAttribute("data-wv-refs-kind") === "web", 8000, 100), "its mark in the PDF the grey ring again");
    });

    // ---- Open in Browser (1.2.1-refs.9) ---------------------------------------
    // MJT 2026-11-20: a reference in none of your libraries gets a globe (the
    // popup's row, the section's row) and "Open in Browser" in the row's
    // right-click menu. Its own link opens as it is; else Crossref is asked --
    // on the click only -- and a confident answer opens at doi.org, anything else
    // a Google Scholar search. No real network here: Zotero.HTTP.request and
    // Zotero.launchURL are stubbed (the decision itself: test/refs-web.spec.js).

    const FOSTER_DOI = "10.5555/wv.refs.foster";
    const CONFIDENT = { message: { items: [{ DOI: FOSTER_DOI, score: 88.5, author: [{ family: "Foster", given: "R.", sequence: "first" }], issued: { "date-parts": [[2021]] }, title: ["Thin films on soft substrates"] }] } };
    const WEAK = { message: { items: [{ DOI: "10.5555/wv.refs.other", score: 31.2, author: [{ family: "Zheng", sequence: "first" }], issued: { "date-parts": [[2022]] }, title: ["Something else"] }] } };
    /** Run `fn` with Crossref answering `answer(url)` (a value, a promise, or a throw) and the
     *  browser stubbed: `net.calls` the Crossref requests, `net.opened` the URLs opened. */
    async function withNet(answer, fn) {
        const H = Zotero.HTTP;
        const origReq = H.request, origLaunch = Zotero.launchURL;
        const net = { calls: [], opened: [] };
        H.request = function (method, url, opts) {
            if (!/api\.crossref\.org/.test(String(url))) return origReq.apply(this, arguments);
            net.calls.push({ method, url: String(url), opts });
            return Promise.resolve(answer(String(url))).then((json) => ({ status: 200, response: json }));
        };
        Zotero.launchURL = (u) => { net.opened.push(String(u)); };
        wv._wvRefsWebForget();
        try { await fn(net); }
        finally { H.request = origReq; Zotero.launchURL = origLaunch; wv._wvRefsWebForget(); }
    }
    const scholarQ = (u) => decodeURIComponent(String(u).replace(/^https:\/\/scholar\.google\.com\/scholar\?q=/, ""));
    const secBtn = (k, act) => { const r = secRows().find(x => x.getAttribute("data-wv-refs-entry") === String(k)); return r ? r.querySelector('.wv-refs-btn[data-wv-refs-act="' + act + '"]') : null; };

    it("Open in Browser: the globe on a reference you do not have -- popup row and section row -- none on the others; nothing asked while they show", async function () {
        await withNet(() => CONFIDENT, async (net) => {
            await openPopup();
            assert.deepEqual(actsOf(rowFor(2)), ["web"], "[3]'s popup row: the globe");
            for (const k of [0, 1, 3]) assert.notInclude(actsOf(rowFor(k)), "web", "[" + (k + 1) + "] is in your library: no globe");
            const g = ctlOf(rowFor(2)).querySelector('.wv-refs-btn[data-wv-refs-act="web"]');
            assert.match(g.getAttribute("title"), /Crossref.*Google Scholar/, "its tooltip says what a click does: " + g.getAttribute("title"));
            await showSection();
            assert.ok(secBtn(2, "web"), "[3]'s section row: the globe");
            for (const k of [0, 1, 3]) assert.notOk(secBtn(k, "web"), "section row " + k + ": none");
            assert.equal(net.calls.length, 0, "no request until a click");
        });
    });

    it("Open in Browser: a confident Crossref answer opens doi.org; the request names the entry, two rows, nothing of the user's", async function () {
        await withNet(async () => { await wvT.sleep(400); return CONFIDENT; }, async (net) => {
            await openPopup();
            const btn = press(rowFor(2), "web");
            assert.ok(await wvT.waitFor(() => btn.hasAttribute("data-wv-refs-busy"), 2000, 20), "the globe shows the lookup");
            assert.match(btn.getAttribute("title"), /Looking up/);
            assert.ok(await wvT.waitFor(() => net.opened.length, 5000, 20), "something opened");
            assert.deepEqual(net.opened, ["https://doi.org/" + FOSTER_DOI]);
            assert.equal(net.calls.length, 1, "one request");
            const c = net.calls[0];
            assert.equal(c.method, "GET");
            assert.match(c.url, /^https:\/\/api\.crossref\.org\/works\?query\.bibliographic=[^&]+&rows=2$/);
            assert.include(decodeURIComponent(c.url), "Foster, R. 2021 Thin films on soft substrates", "the entry's text");
            assert.notMatch(c.url, /mailto|%40|@/, "no e-mail");
            assert.isAtMost(c.opts.timeout, 5000, "a timeout of 5 s at most");
            assert.isTrue(c.opts.anon, "no cookies");
            assert.notOk(c.opts.headers && Object.keys(c.opts.headers).some(h => /user-agent|from/i.test(h)), "Zotero's own User-Agent, nothing added");
            assert.ok(await wvT.waitFor(() => !state(), 3000, 50), "the popup closed");
            // Asked again: from this session's memory, nothing requested.
            await openPopup();
            press(rowFor(2), "web");
            assert.ok(await wvT.waitFor(() => net.opened.length === 2, 3000, 20));
            assert.equal(net.opened[1], net.opened[0]);
            assert.equal(net.calls.length, 1, "not asked twice");
        });
    });

    it("Open in Browser: a weak answer, an error, or no answer within 5 s opens a Google Scholar search (title, first author, year)", async function () {
        const want = "Thin films on soft substrates and their slow drainage dynamics Foster 2021";
        await showSection();
        await withNet(() => WEAK, async (net) => {
            secBtn(2, "web").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.ok(await wvT.waitFor(() => net.opened.length, 5000, 20), "opened");
            assert.equal(scholarQ(net.opened[0]), want, net.opened[0]);
            assert.match(net.opened[0], /^https:\/\/scholar\.google\.com\/scholar\?q=/);
        });
        await withNet(() => { throw new Error("offline"); }, async (net) => {
            const t = await wv._wvRefsWebOpen(reader, { text: "[3] Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics.", rects: [] });
            assert.equal(t && t.how, "scholar", "an error: Google Scholar");
            await wv._wvRefsWebOpen(reader, { text: "[3] Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics.", rects: [] });
            assert.equal(net.calls.length, 2, "a failed ask is not kept: the next click asks again");
        });
        await withNet(() => new Promise(() => {}), async (net) => {
            const t0 = Date.now();
            const t = await wv._wvRefsWebOpen(reader, { text: "Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics. Annu. Rev. Test Fluid 53, 33-58.", rects: [] });
            const ms = Date.now() - t0;
            assert.equal(t && t.how, "scholar", "no answer: Google Scholar");
            assert.equal(scholarQ(net.opened[0]), want);
            assert.ok(ms >= 4500 && ms < 9000, "after the 5-s timeout (" + ms + " ms)");
        });
    });

    it("Open in Browser: a DOI or URL written in the entry, or the PDF's own link, opens as it is, nothing asked -- never the citing paper's DOI", async function () {
        await withNet(() => CONFIDENT, async (net) => {
            const base = "Foster, R. 2021 Thin films on soft substrates. Annu. Rev. Test Fluid 53, 33-58. ";
            let t = await wv._wvRefsWebOpen(reader, { text: base + "doi:10.5555/wv.refs.written", rects: [] });
            assert.deepEqual([t.how, net.opened[0]], ["doi", "https://doi.org/10.5555/wv.refs.written"]);
            t = await wv._wvRefsWebOpen(reader, { text: base + "https://example.org/foster.html", rects: [] });
            assert.deepEqual([t.how, net.opened[1]], ["url", "https://example.org/foster.html"]);
            t = await wv._wvRefsWebOpen(reader, { text: base, rects: [], url: "https://example.org/the-pdf-link" });
            assert.deepEqual([t.how, net.opened[2]], ["pdf", "https://example.org/the-pdf-link"]);
            assert.equal(net.calls.length, 0, "nothing asked");
            t = await wv._wvRefsWebOpen(reader, { text: base + "https://doi.org/10.5555/wv.refs.citing", rects: [] });
            assert.equal(t.how, "crossref", "the citing paper's own DOI (a page footer) is not the entry's: asked");
            assert.equal(net.calls.length, 1);
            // The tooltips name the link a click opens (MJT 2026-11-20, "does it make sense to
            // show also the link that it will open?"); without one, what the click does --
            // and nothing is asked on a hover.
            // One tooltip for the globe on a row and the grey ring in the PDF, which do the
            // same (MJT: "I don't see why the message and icon should be different").
            const ring = (text) => plain(wv._wvRefsWebTip(reader, { text, rects: [] }));
            assert.equal(ring(base + "doi:10.5555/wv.refs.written"), "Not in your libraries.\nClick to open in your browser: https://doi.org/10.5555/wv.refs.written");
            assert.equal(ring(base + "https://example.org/foster.html"), "Not in your libraries.\nClick to open in your browser: https://example.org/foster.html");
            assert.equal(ring(base), "Not in your libraries.\nClick to look it up online (Crossref, else a Google Scholar search).");
            assert.equal(ring(base + "https://doi.org/10.5555/wv.refs.citing"), ring(base), "never the citing paper's own DOI");
            assert.equal(net.calls.length, 1, "no request for a tooltip");
        });
    });

    it("Open in Browser: the right-click menu of a section row -- Open in Browser for a reference you do not have, the ⋯ menu with its card for one you have", async function () {
        await showSection();
        const rowOf = (k) => secRows().find(x => x.getAttribute("data-wv-refs-entry") === String(k));
        const rclick = (el) => el.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 300, screenY: 300 }));
        const menuNow = () => wvT.waitFor(() => { const m = win.document.getElementById("wv-refs-menu"); return m && m.querySelector("menuitem") ? m : null; }, 5000, 50);
        await withNet(() => CONFIDENT, async (net) => {
            rclick(rowOf(2).querySelector(".wv-refs-sec-text"));
            const m = await menuNow();
            assert.ok(m, "a menu");
            const items = Array.from(m.querySelectorAll("menuitem"));
            assert.deepEqual(items.map(i => i.getAttribute("data-wv-refs-act")), ["web"], "Open in Browser alone");
            assert.equal(items[0].getAttribute("label"), "Open in Browser");
            assert.notOk(m.querySelector(".wv-refs-card"), "no card: nothing of yours to show");
            await wvT.waitFor(() => m.state === "open", 3000, 20);
            items[0].doCommand();
            assert.ok(await wvT.waitFor(() => net.opened.length, 5000, 20), "the entry opened");
            assert.deepEqual(net.opened, ["https://doi.org/" + FOSTER_DOI]);
            try { m.hidePopup(); } catch (e) {}
            await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
        });
        rclick(rowOf(0).querySelector(".wv-refs-sec-text"));
        const m0 = await menuNow();
        assert.ok(m0 && m0.querySelector('.wv-refs-card[data-wv-refs-card="' + a1.id + '"]'), "[1]: the ⋯ menu, its card first");
        assert.ok(m0.querySelector('.wv-refs-card .wv-refs-card-libname[role="button"]'), "its library's name shows it there");
        assert.deepEqual(btnsOf(m0).map(actOf), ["tab", "split", "window", "copy-as"], "a References row's right-click: the buttons");
        m0.hidePopup();
        await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
    });

    // MJT 2026-11-20: "I would remove the popup from the circles, in the citation popup and
    // in the item pane ... In contrast, in the PDF file itself ... everything is collapsed
    // into the click on the circle". A popup row's and a References row's mark do not act;
    // the row's buttons do (the PDF margin's marks: "a click on a dot ... the ring").
    it("a popup row's and a References row's mark do not act: no menu, nothing opened online; a References row's mark shows its entry as the row does", async function () {
        const menuNow = () => wvT.waitFor(() => { const m = win.document.getElementById("wv-refs-menu"); return m && m.querySelector("menuitem") ? m : null; }, 5000, 50);
        const actsIn = (m) => Array.from(m.querySelectorAll(":scope > menuitem")).map(i => i.getAttribute("data-wv-refs-act")).filter(Boolean);
        const closeIt = async (m) => { m.hidePopup(); await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50); };
        // The popup: [1]'s dot.
        await openPopup();
        const iw = reader._iframeWindow;
        const PE = iw.PointerEvent || iw.MouseEvent;
        const pressEl = (el) => el.dispatchEvent(new PE("pointerdown", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }, iw)));
        const noMenu = async (label) => { await wvT.sleep(400); assert.notOk(win.document.getElementById("wv-refs-menu"), label); };
        pressEl(rowMark(rowFor(0)));
        await noMenu("the popup's dot: no menu");
        void menuNow; void actsIn; void closeIt;
        // The References row: [1]'s dot, then [3]'s ring.
        await showSection();
        const secMark = (k) => secRows().find(x => x.getAttribute("data-wv-refs-entry") === String(k)).querySelector(".wv-refs-mark");
        const shown = [];
        const se = wv._wvRefsShowEntry;
        wv._wvRefsShowEntry = (rd, entry) => { shown.push(entry && entry.text); };
        try {
            secMark(0).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            await noMenu("the row's dot: no menu");
            assert.equal(shown.length, 1, "a click on the dot is the row's: its entry in the PDF");
            await withNet(() => CONFIDENT, async (net) => {
                secMark(2).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
                await noMenu("the row's ring: no menu");
                assert.deepEqual(net.opened, [], "the row's ring: nothing opened online");
            });
        }
        finally { wv._wvRefsShowEntry = se; }
        assert.equal(secMark(0).getAttribute("data-wv-refs-act"), null, "no act on a References row's mark");
        // And the popup's ring.
        await openPopup();
        await withNet(() => CONFIDENT, async (net) => {
            pressEl(rowMark(rowFor(2)));
            await wvT.sleep(400);
            assert.deepEqual(net.opened, [], "the popup's ring: nothing opened online");
        });
    });

    // MJT 2026-11-20: "Put the tooltip on different lines. Color the link in the same color as
    // the Weavero links" -- a title tooltip cannot colour a part: the ring takes Weavero's URL tip.
    it("the grey ring's tip in the PDF: Weavero's URL tip, on separate lines, a link in the Weavero link colour", async function () {
        const ring = await wvT.waitFor(() => bibMarks().find(x => x.getAttribute("data-wv-refs-entry") === "2") || null, 10000, 100);
        assert.ok(ring, "the ring beside [3]");
        assert.deepEqual(wv._wvRefsWebTipLines(reader, ring).map(l => [l.text, !!l.link]),
            [["Not in your libraries.", false], ["Click to look it up online (Crossref, else a Google Scholar search).", false]], "[3] writes no link: no link line");
        // The dwell ended over the ring: the tip in the PDF view, a line each.
        const iw = pv._iframeWindow;
        const r = ring.getBoundingClientRect();
        pv._wvExtTipEvt = { target: ring, clientX: r.left + 2, clientY: r.top + 2 };
        try {
            wv._wvExtTipShow(reader, pv);
            const tip = iw.document.getElementById("wv-exttip");
            assert.ok(tip, "the tip is up");
            assert.deepEqual(Array.from(tip.children).map(d => d.textContent), ["Not in your libraries.", "Click to look it up online (Crossref, else a Google Scholar search)."]);
        }
        finally { wv._wvExtTipHide(reader, pv); delete pv._wvExtTipEvt; }
        // A link line is drawn in the Weavero link colour.
        wv._wvExtTipRenderIn(reader, iw, [{ text: "Not in your libraries." }, { text: "Click to open in your browser: https://doi.org/10.5555/x", link: "https://doi.org/10.5555/x" }], 20, 20);
        try {
            const tip = iw.document.getElementById("wv-exttip");
            assert.equal(tip.children.length, 2, "two lines: the link on the line that names it (MJT 2026-11-20)");
            const link = tip.querySelector(".wv-exttip-link");
            assert.equal(link.textContent, "https://doi.org/10.5555/x");
            assert.equal(link.parentNode.textContent, "Click to open in your browser: https://doi.org/10.5555/x", "on the same line");
            assert.include(["rgb(26, 115, 232)", "rgb(138, 180, 248)"], iw.getComputedStyle(link).color, "the Weavero link colour, light or dark");
        }
        finally { wv._wvExtTipHide(reader, pv); }
    });

    // MJT 2026-11-20: the grey circle "also allows me to open the webpage of the article
    // directly from the PDF view, without having to open the References section".
    it("Open in Browser: a click on the grey ring beside an entry in the PDF opens it online at once, no menu", async function () {
        const ring = await wvT.waitFor(() => bibMarks().find(x => x.getAttribute("data-wv-refs-entry") === "2") || null, 10000, 100);
        assert.ok(ring, "the ring beside [3]");
        assert.equal(ring.getAttribute("data-wv-refs-kind"), "web");
        const iw = pv._iframeWindow;
        await withNet(() => CONFIDENT, async (net) => {
            ring.dispatchEvent(new iw.MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw)));
            assert.ok(await wvT.waitFor(() => net.opened.length, 5000, 20), "the entry opened");
            assert.deepEqual(net.opened, ["https://doi.org/" + FOSTER_DOI]);
            assert.notOk(win.document.getElementById("wv-refs-menu"), "no menu on the way");
            // The lookup's "Looking up..." title goes with it: the ring has none (Weavero's tip
            // draws its words), else two tooltips showed (MJT 2026-11-20, "Why 2 tooltips?").
            assert.ok(await wvT.waitFor(() => !ring.hasAttribute("data-wv-refs-busy"), 3000, 20), "the lookup is over");
            assert.isNull(ring.getAttribute("title"), "no title left on the ring");
        });
    });

    // ---- the reference card (1.2.1-refs.9) -------------------------------------
    // MJT 2026-11-20: "more information on the reference when opening that popup,
    // including the most important metadata, and eventually the abstract, even
    // graphical abstract ... More features should not be developed at the cost
    // of speed." Built when the menu opens, from the item in memory (no database
    // query, no request); the picture after the menu is up.

    /** Open mark k's menu (beside entry k of the list), with the database and the network watched. */
    async function markMenu(k) {
        const m = bibMarks().find(x => x.getAttribute("data-wv-refs-entry") === String(k));
        assert.ok(m, "a mark beside entry " + k);
        const iw = pv._iframeWindow;
        const DB = Zotero.DB, H = Zotero.HTTP;
        const q0 = DB.queryAsync, h0 = H.request;
        const seen = { db: 0, net: 0 };
        DB.queryAsync = function () { seen.db++; return q0.apply(this, arguments); };
        H.request = function () { seen.net++; return h0.apply(this, arguments); };
        let menu = null, atOnce = null;
        try {
            m.dispatchEvent(new iw.MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw)));
            menu = win.document.getElementById("wv-refs-menu");
            const ga = menu && menu.querySelector(".wv-refs-card-ga");
            atOnce = { ga: !!ga, hidden: ga ? ga.hidden : null, img: ga ? !!ga.querySelector("img") : null };
        }
        finally { DB.queryAsync = q0; H.request = h0; }
        assert.ok(menu, "the menu");
        assert.ok(await wvT.waitFor(() => menu.state === "open", 3000, 20), "on screen (" + menu.state + ")");
        return { menu, card: menu.querySelector(".wv-refs-card"), atOnce, seen };
    }
    async function closeMenu(menu) {
        try { menu.hidePopup(); } catch (e) {}
        await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50);
    }

    it("card: the mark's menu shows the cited work -- as the item pane's header renders it, its library, the abstract with More -- built from memory, nothing queried", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        ZT.select(reader.tabID);
        await wvT.sleep(300);
        assert.ok(await wvT.waitFor(() => bibMarks().length === 4, 8000, 100), "the marks");
        const { menu, card, seen } = await markMenu(0);
        try {
            assert.ok(card, "a card");
            assert.strictEqual(menu.firstElementChild, card, "above the entries");
            assert.equal(card.getAttribute("data-wv-refs-card"), String(a1.id), "of the copy the menu opens");
            // The work as the item pane's header shows it in Bibliography Entry mode:
            // Zotero's own rendering in the header's style (MJT 2026-11-20).
            const bib = card.querySelector(".wv-refs-card-bib");
            assert.ok(bib, "the entry in the header's style");
            const S = /** @type {any} */ (Zotero).Styles;
            const style = S.get(String(Zotero.Prefs.get("itemPaneHeader.bibEntry.style") || "")) || S.get("http://www.zotero.org/styles/apa");
            const html = /** @type {any} */ (Zotero).Cite.makeFormattedBibliographyOrCitationList(style.getCiteProc(String(Zotero.Prefs.get("itemPaneHeader.bibEntry.locale") || ""), "html"), [a1], "html", false);
            const ref = new win.DOMParser().parseFromString(html, "text/html").querySelector(".csl-bib-body");
            for (const z of ref.querySelectorAll(".Z3988")) z.remove();
            const norm = (t) => String(t).replace(/\s+/g, " ").trim();
            assert.equal(norm(bib.textContent), norm(ref.textContent), "as the header renders it");
            assert.include(norm(bib.textContent), "Drop impact on a heated plate in a vacuum chamber");
            assert.include(bib.textContent, "2016");
            assert.isNull(bib.querySelector(".Z3988"), "no COinS");
            // Zotero's own text size, the citation popup's (13 px by default), not the menu's 12 px.
            assert.equal(win.getComputedStyle(card).fontSize, win.getComputedStyle(win.document.documentElement).fontSize, "the card at Zotero's font size");
            // 420 px (MJT 2026-11-20, "I would make the card a bit wider").
            assert.approximately(card.getBoundingClientRect().width, 420, 0.5, "the card's width");
            // The item type in front: Zotero's icon, its name as the tooltip, left of the
            // work's first line (MJT 2026-11-20, "the item type icon should be put in front").
            const typeBox = card.querySelector(":scope > .wv-refs-card-ref > .wv-refs-card-type");
            const typeIcon = typeBox && typeBox.querySelector(".icon");
            assert.ok(typeIcon, "the item-type icon");
            assert.equal(typeIcon.getAttribute("data-item-type"), "journalArticle");
            assert.equal(typeBox.getAttribute("title"), Zotero.ItemTypes.getLocalizedString("journalArticle"), "its name as the tooltip");
            const ti = typeIcon.getBoundingClientRect(), tx = card.querySelector(".wv-refs-card-reftext").getBoundingClientRect();
            assert.ok(ti.width > 15 && ti.right <= tx.left, "16 px, before the work (" + ti.left + ".." + ti.right + ", text at " + tx.left + ")");
            assert.ok(ti.top >= tx.top - 1 && ti.top < tx.top + 6, "on its first line (" + ti.top + " / " + tx.top + ")");
            const lib = card.querySelector(".wv-refs-card-lib");
            assert.equal(plain(lib.textContent), "In " + userLibName(), "the library");
            const nm = lib.querySelectorAll(":scope > .wv-refs-card-libname");
            assert.equal(nm.length, 1, "the name in its own piece");
            assert.equal(nm[0].querySelector(":scope > .wv-refs-libbadge").getAttribute("data-wv-lib"), "user", "after My Library's icon");
            assert.equal(seen.db, 0, "no database query to build it");
            assert.equal(seen.net, 0, "no request");
            // The abstract: four lines, More where it is cut, Less to fold it back.
            const abs = card.querySelector(".wv-refs-card-abs");
            assert.equal(abs.textContent, A1_ABSTRACT);
            assert.equal(win.getComputedStyle(abs).getPropertyValue("-webkit-line-clamp"), "4", "four lines");
            const more = card.querySelector(".wv-refs-card-more");
            assert.ok(await wvT.waitFor(() => !more.hidden, 3000, 20), "More is offered: the abstract is cut");
            assert.notEqual(win.getComputedStyle(more).display, "none");
            const h0 = abs.getBoundingClientRect().height;
            more.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.isAbove(abs.getBoundingClientRect().height, h0 + 5, "More unfolds it in place");
            assert.equal(more.textContent, "Less");
            assert.equal(menu.state, "open", "the menu stays");
            more.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            assert.approximately(abs.getBoundingClientRect().height, h0, 1, "Less folds it back");
            // Theme: Zotero's own variable for the lesser lines.
            const probe = win.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
            probe.style.color = "var(--fill-secondary)";
            card.appendChild(probe);
            assert.equal(win.getComputedStyle(card.querySelector(".wv-refs-card-lib")).color, win.getComputedStyle(probe).color, "--fill-secondary");
            probe.remove();
        }
        finally { await closeMenu(menu); }
    });

    it("card: the graphical abstract (an image attachment) comes AFTER the menu is up, small, and a click opens it; none for an item without one", async function () {
        wvT.knownMacZ11(this);   // known on macOS + Zotero 11 in 1.3.0-beta.1, fixed in beta.2
        const { menu, card, atOnce } = await markMenu(0);
        const opened = [], asked = [];
        const ZP = win.ZoteroPane, va = ZP.viewAttachment;
        // The click asks before the system's viewer opens the file (security
        // review 2026-11-22, open-guard.spec.js): answered Open here.
        wv._wvAskOpenExternal = (w, name) => { asked.push(name); return true; };
        try {
            // Its room kept from the start: the menu opens once, at its final size
            // (MJT 2026-11-24, "the menu opens in two steps with a flicker";
            // refs-menu-once.spec.js).
            assert.deepEqual(atOnce, { ga: true, hidden: false, img: false }, "when the menu is built: the picture's place, empty, its room kept");
            const box = card.querySelector(".wv-refs-card-ga");
            assert.equal(box.getAttribute("data-wv-refs-att"), String(a1img.id));
            assert.ok(await wvT.waitFor(() => !box.hidden && box.querySelector("img") && box.querySelector("img").naturalWidth > 0, 5000, 20), "then loaded and shown");
            const img = box.querySelector("img");
            const r = img.getBoundingClientRect();
            assert.ok(r.width <= 240.5 && r.height <= 140.5 && r.width > 50, "at most 240 x 140 (" + r.width + " x " + r.height + ")");
            ZP.viewAttachment = (id) => { opened.push(id); };
            img.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
            await wvT.waitFor(() => opened.length, 3000, 20);
            assert.deepEqual(opened, [a1img.id], "a click opens the image");
            assert.lengthOf(asked, 1, "once the user has confirmed");
            assert.ok(await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50), "and closes the menu");
        }
        finally { ZP.viewAttachment = va; delete wv._wvAskOpenExternal; await closeMenu(menu); }
        // [4]'s best copy (the group's): a short abstract, no More, no picture.
        const m3 = await markMenu(3);
        try {
            assert.equal(m3.card.getAttribute("data-wv-refs-card"), String(a4g.id));
            // The copy shown first, then every other library holding one (MJT 2026-11-20).
            assert.equal(plain(m3.card.querySelector(".wv-refs-card-lib").textContent), "In wv-refs-group and " + userLibName(), "the libraries holding a copy");
            await wvT.sleep(300);
            assert.ok(m3.card.querySelector(".wv-refs-card-more").hidden, "a short abstract: no More");
            assert.notOk(m3.card.querySelector(".wv-refs-card-ga"), "no picture");
        }
        finally { await closeMenu(m3.menu); }
        // [2]: no abstract at all.
        const m1 = await markMenu(1);
        try { assert.notOk(m1.card.querySelector(".wv-refs-card-abs"), "no abstract block"); }
        finally { await closeMenu(m1.menu); }
    });

    // MJT 2026-11-20: "When multiple, the detailed one could appear on hover".
    it("card: several references -- a row's card beside the popup on its hover, gone when the pointer leaves; a copy only in another library says so with its badge", async function () {
        await openPopup();
        const row = rowFor(3);
        const c = await hoverCardOf(row);
        assert.ok(c, "[4]'s card on its row's hover");
        assert.equal(c.getAttribute("data-wv-refs-card"), String(a4g.id), "the copy that opens (the group's, with a PDF)");
        assert.ok(c.querySelector(".wv-refs-card-type svg"), "its type icon, inlined in the reader's page");
        assert.notOk(row.querySelector(":scope > .wv-refs-pcard"), "not in the row: the row keeps the PDF's text");
        const pr = row.closest(".citation-popup").getBoundingClientRect(), cr = c.parentNode.getBoundingClientRect();
        assert.ok(cr.left >= pr.right - 0.5 || cr.right <= pr.left + 0.5, "beside the popup, not over it (" + cr.left + ".." + cr.right + " / " + pr.left + ".." + pr.right + ")");
        // Another row: its own card in place of the first.
        const c0 = await hoverCardOf(rowFor(0));
        assert.ok(c0 && c0.getAttribute("data-wv-refs-card") === String(a1.id), "[1]'s card");
        assert.equal(row.closest(".citation-popup").querySelectorAll(":scope > .wv-refs-hcard").length, 1, "one card at a time");
        assert.ok(await hoverLeave(rowFor(0)), "gone when the pointer leaves");
        // A reference you do not have: no card.
        rowFor(2).dispatchEvent(new (rowFor(2).ownerDocument.defaultView).MouseEvent("mouseenter", Cu.cloneInto({ bubbles: false }, rowFor(2).ownerDocument.defaultView)));
        await wvT.sleep(700);
        assert.notOk(row.closest(".citation-popup").querySelector(":scope > .wv-refs-hcard"), "[3], not in your libraries: no card");
        // A reference only in the group: "Only in wv-refs-group", the group's badge.
        const a3g = await article({ title: "Thin films on soft substrates and their slow drainage dynamics", date: "2021", _first: "Foster" }, group.libraryID);
        try {
            assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "nopdf"; }, 10000, 600), "[3] in the group now");
            const c2 = await hoverCardOf(rowFor(2));
            assert.ok(c2, "its card on the row's hover");
            const lib = c2.querySelector(".wv-refs-card-lib");
            assert.equal(plain(lib.textContent), "Only in wv-refs-group");
            assert.equal(lib.querySelector(".wv-refs-libbadge").getAttribute("data-wv-lib"), "group", "the group's badge");
            await hoverLeave(rowFor(2));
        }
        finally { await wvT.erase(a3g); }
        assert.ok(await until(async () => { await openPopup(); return kindOf(rowFor(2)) === "web"; }, 10000, 600), "[3] back out of your libraries");
    });

    it("zotero#5191: with Zotero's own smart popup, only Window and Split, no mark", async function () {
        wv._wvRefsSmartPopup = () => true;
        try {
            await openPopup(false);
            await wvT.waitFor(() => ctlOf(rowFor(0)), 5000, 50);
            assert.deepEqual(actsOf(rowFor(0)), ["split", "window"]);
            assert.notOk(rowMark(rowFor(0)), "Zotero marks the row itself");
            assert.notOk(ctlOf(rowFor(1)), "without a PDF: Zotero's Show in Library alone");
        }
        finally { delete wv._wvRefsSmartPopup; }
    });

    it("TRIPWIRE zotero#5191: Zotero has no reference recognition of its own yet", function () {
        assert.isUndefined(/** @type {any} */ (Zotero).RecognizeReference,
            "Zotero.RecognizeReference exists: zotero#5191 landed. Check that Weavero's popup steps aside "
            + "(refs.ts _wvRefsSmartPopup) on its real markup, then retire this tripwire.");
    });

    it("the setting off: no mark and no button; the reader page's teardown leaves nothing", async function () {
        await wvT.withPref("weavero.enableReferences", false, async () => {
            await openPopup(false);
            await wvT.sleep(300);
            assert.notOk(popupEl().querySelector(".wv-refs-ctl"), "nothing on the rows");
        });
        await openPopup();
        wv._wvRefsReaderTeardown(reader);
        const doc = reader._iframeWindow.document;
        assert.notOk(doc.querySelector(".wv-refs-ctl"), "the controls gone");
        assert.notOk(doc.getElementById("wv-refs-style"), "the sheet gone");
        assert.notOk(reader._wvRefsMO, "the observer gone");
        assert.notOk(viewDoc().querySelector(".wv-refs-marks"), "the reference list's marks gone");
        assert.notOk(viewDoc().getElementById("wv-refs-marks-style"), "and their sheet");
        wv._wvRefsWireReader(reader);
        assert.ok(reader._wvRefsMO, "wired again");
        assert.ok(await wvT.waitFor(() => bibMarks().length === 4, 8000, 100), "the marks drawn again");
    });

    // Plan test 8, the module's own part: zzz-disable-leftovers sweeps a whole
    // disable, but its fixture opens PDFs without a reference list, so the index
    // -- and the item observer that keeps it current -- never comes up there.
    it("destroy gives everything back: the item observer, the index, the section, the menu; init brings them back", async function () {
        const g = /** @type {any} */ (Zotero);
        await wv._wvRefsIndexEnsure();
        const id = g._wvRefsObsID;
        assert.ok(id, "fixture: the item observer is registered (the index is built)");
        assert.ok(Array.isArray(g._wvRefsPrefObs) && g._wvRefsPrefObs.length, "the settings watch sits where destroy()'s _wvReleaseGlobalPrefObservers releases it");
        const N = Zotero.Notifier;
        const unreg = N.unregisterObserver;
        const gone = [];
        N.unregisterObserver = function (x) { gone.push(x); return unreg.apply(this, arguments); };
        try { wv._wvRefsDestroy(); }
        finally { N.unregisterObserver = unreg; }
        try {
            assert.include(gone, id, "the item observer unregistered");
            assert.isUndefined(g._wvRefsObsID, "and its id dropped from the Zotero global");
            assert.isUndefined(g._wvRefsObsVer);
            assert.notOk(wv._wvRefsIx, "the index dropped");
            assert.notOk(wv._wvRefsEntriesNow, "the reference lists dropped");
            assert.notOk(wv._wvRefsSecKey, "the References section unregistered");
            assert.notOk(win.document.getElementById("wv-refs-sec-style"), "its sheet gone");
            assert.notOk(win.document.getElementById("wv-refs-menu"), "no menu left");
        }
        finally {
            wv._wvRefsInit();
            await wv._wvRefsIndexEnsure();
        }
        assert.ok(g._wvRefsObsID, "init and the next reader bring the observer back");
        // A register right after an unregister waits for Zotero's removal notice (backlinks.ts _wvBlRegisterSectionFor).
        assert.ok(await wvT.waitFor(() => wv._wvRefsSecKey, 5000, 100), "and the section");
    });

    it("nothing is written to any library", async function () {
        await closePopup();
        assert.equal(await fingerprint(), fpBefore, "every item's version and dateModified, and the data counts, as before");
    });
});
