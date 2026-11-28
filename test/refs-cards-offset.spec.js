/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// refsfix (2026-11-24): a citation of a NUMBERED list whose PDF destination misses its entry shows the
// entry its number names (src/modules/refs-cards.ts wvRefsCardResolve), and a preview tints that entry
// or nothing -- never the block the destination lands on (preview-highlight.ts + _wvRefsCardTint).
//
// MJT's case, measured on the real PDF (read-only): Skrbek & Sreenivasan 2012, Phys. Fluids 24, 011301
// (AIP). Its superscript citations are PDF links whose /FitR destinations sit far above their entries:
// "2"-"6" in the text over the list on its first page (the entries at the page's foot), "7" and "9" on
// entry 5. Hovering "2–4" showed Zotero's picture of the page's top with Weavero's tint on a body
// paragraph ("Wrong reference identification"); "7" showed entry 5 tinted.
//
// The fixture reproduces that layout in a two-page PDF written here (Helvetica): page 1 cites with
// superscript numbers (7 pt, raised 4 pt over 10-pt text), each a PDF link; page 2 has body text at
// its top and an eight-entry numbered list at its foot ("[n]" entries in APS's form: Zotero 11 keeps no
// list of them, so its citations stay plain links -- refs-cards.spec.js). Destinations: "2", "4" and
// "9" (no entry 9) in the text above the list, "7" on entry [5], "1" right above [1] (a correct one).
// Links that are no citation: "4" after "Fig." and a plain-size "3", both into the text above the list.
// Zotero 10.0.8 reads one group of numbered citations per paper: the unlinked "[1-8]" first is it.

describe("Weavero — references: a citation whose PDF destination misses its entry (AIP's offset destinations)", function () {
    this.timeout(180000);
    const Cu = Components.utils;
    const made = [];
    let wv, reader, ir, pv, att;

    const ENTRIES = [
        ["J. Adams, K. Brown, and L. Clark, Drop impact on a heated plate,", "J. Test Mech. 812, 101 (2016)."],
        ["M. Davis and P. Evans, Bubble entrapment beneath viscous drops,", "Phys. Rev. Test 4, 053601 (2019)."],
        ["R. Foster, Thin films on soft substrates and their drainage,", "Annu. Rev. Test Fluid 53, 33 (2021)."],
        ["S. Garcia, T. Hill, and U. Irwin, Splashing of ethanol drops,", "Exp. Test Fluids 59, 77 (2018)."],
        ["V. Jones and W. King, Rebound of drops from superhydrophobic plates,", "Phys. Test Fluids 6, 023602 (2021)."],
        ["X. Lopez, Leidenfrost drops on ratchets,", "J. Test Phys. 21, 1047 (2016)."],
        ["Y. Moore and Z. Nash, Grid turbulence in a towed channel,", "Phys. Rev. Test 82, 4831 (1999)."],
        ["A. Owens, Decay of vorticity behind a grid,", "Phys. Rev. Test 86, 4831 (2001)."],
    ];
    /** Page 2: entry k's first baseline (9-pt text, 11-pt leading, 4 pt between entries), from y 380 down. */
    const base = (k) => 380 - k * 26;
    /** Above the list: body text at the top of page 2. */
    const ABOVE = (y) => ({ page: 2, fitr: y });
    const LINKS = [];
    /** Helvetica's advance widths (AFM, per 1000 em) for the characters page 1 uses. */
    const HW = Object.assign({ " ": 278, ".": 278, ",": 278, "-": 333, "[": 278, "]": 278, "(": 333, ")": 333 },
        ...Array.from("0123456789", (d) => ({ [d]: 556 })),
        ...Array.from("abcdefghijklmnopqrstuvwxyz", (c, i) => ({ [c]: [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500][i] })),
        ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (c, i) => ({ [c]: [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611][i] })));
    const width = (text, size) => Array.from(text).reduce((s, c) => s + (HW[c] || 556), 0) * size / 1000;

    function fixturePDF() {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        let p2 = line(72, 745, 12, "CONCLUSIONS");
        for (let i = 0; i < 6; i++) p2 += line(72, 720 - i * 14, 10, "This review sums up what is known of the flows above; line " + (i + 1) + " of its closing text.");
        p2 += line(72, 410, 12, "References");
        ENTRIES.forEach(([a, c], k) => { p2 += line(72, base(k), 9, "[" + (k + 1) + "]"); p2 += line(90, base(k), 9, a); p2 += line(90, base(k) - 11, 9, c); });
        let p1 = line(72, 745, 14, "WV-TEST offset destinations: superscript citations of a numbered list");
        LINKS.length = 0;
        // One line of parts laid end to end, each a text object of its own so that each cited part's
        // box is known (Helvetica's widths): [text, size, rise, destination, key]. A superscript is
        // 7 pt raised 4 pt, glued to the word before it, as AIP sets "conductivity.2–4".
        const seq = (y, parts) => {
            let x = 72;
            for (const [text, size, rise, dest, key] of parts) {
                p1 += line(x, y + (rise || 0), size, text);
                const w = width(text, size);
                if (dest) LINKS.push({ key: key || text, text, rect: [x - 0.5, y + (rise || 0) - 1.5, x + w + 0.5, y + (rise || 0) + 0.75 * size], dest });
                x += w;
            }
        };
        seq(714, [["Earlier studies [1-8] covered drops and grids.", 10]]);
        seq(700, [["Superfluids conduct heat finitely.", 10], ["2", 7, 4, ABOVE(700)], ["-", 7, 4], ["4", 7, 4, ABOVE(686)], [" This is the state of the art.", 10]]);
        seq(686, [["Grids were towed in channels.", 10], ["7", 7, 4, { page: 2, xyz: base(4) + 4 }], [" Long ago.", 10]]);
        seq(672, [["As drawn in Fig. ", 10], ["4", 10, 0, ABOVE(720), "fig4"], [" of the review.", 10]]);
        seq(658, [["As said by others ", 10], ["3", 10, 0, ABOVE(706), "plain3"], [" before us.", 10]]);
        seq(644, [["Feynman said so first.", 10], ["1", 7, 4, { page: 2, xyz: base(0) + 16 }], [" Then more.", 10]]);
        seq(630, [["A further claim is made.", 10], ["9", 7, 4, ABOVE(692)], [" Here.", 10]]);
        const dest = (d) => d.xyz !== undefined ? "/XYZ 72 " + d.xyz + " 0" : "/FitR 0 " + d.fitr + " 612 " + d.fitr;
        const objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R /Annots ["
                + LINKS.map((l, i) => (8 + i) + " 0 R").join(" ") + "] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Length " + p1.length + " >>\nstream\n" + p1 + "endstream",
            "<< /Length " + p2.length + " >>\nstream\n" + p2 + "endstream",
        ].concat(LINKS.map(l => "<< /Type /Annot /Subtype /Link /Rect [" + l.rect.join(" ") + "] /Border [0 0 0] /Dest [4 0 R " + dest(l.dest) + "] >>"));
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    const state = () => { try { return ir._state.primaryViewOverlayPopup || null; } catch (e) { return null; } };
    const crosses = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;
    const L = (key) => LINKS.find(x => x.key === key);

    /** Zotero's overlay for the PDF's own link `key` (source 'annotation'). */
    function linkOverlay(key) {
        const l = L(key);
        const ovs = Array.from(pv._pdfPages[0].overlays || []);
        return ovs.find(o => o.type === "internal-link" && (o.source === "annotation" || !o.source)
            && Array.from(o.position.rects).some(r => crosses(Array.from(r).map(Number), l.rect))) || null;
    }

    async function close() {
        try { pv._onSetOverlayPopup(null); } catch (e) {}
        await wvT.waitFor(() => !state(), 5000, 50);
        await wvT.sleep(100);
    }

    /** A hover once the delayer fires (refs-cards.spec.js): Zotero 11's _openOverlayPopup, or Zotero
     *  10.0.8's two steps by hand. */
    async function hover(o) {
        await close();
        if (typeof pv._openOverlayPopup === "function") pv._openOverlayPopup(o);
        else {
            const rwin = reader._iframeWindow;
            const W = Cu.waiveXrays(rwin);
            const popup = W.Object.assign(new W.Object(), o);
            popup.rect = Cu.cloneInto(Array.from(pv.getClientRect(o.position.rects[0], o.position.pageIndex)), rwin);
            const pic = Cu.waiveXrays(await pv._pdfRenderer.renderPreviewPage(o.destinationPosition));
            for (const k of ["image", "width", "height", "x", "y"]) popup[k] = pic[k];
            pv._selectedOverlay = o;
            pv._onSetOverlayPopup(popup);
        }
        return wvT.waitFor(() => { const s = state(); return s && (s.type !== "internal-link" || s.image) ? s : null; }, 15000, 50);
    }
    const labels = (st) => Array.from(st.references).map(r => String(r.text).slice(0, 3));

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvRefsCardEntryFor", "_wvRefsCardProbe", "_wvPrevHlBuild", "_wvWirePreviewLinkZones"]) wvT.method(m);
        const citing = await wvT.createItem("journalArticle", { title: "WV-TEST offset destinations: superscript citations of a numbered list", date: "2026" });
        made.push(citing);
        const path = PathUtils.join(PathUtils.tempDir, "wv-refsoffset-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, fixturePDF());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: citing.id });
        try { await IOUtils.remove(path); } catch (e) {}
        made.push(att);
        reader = await wvT.openReaderTab(att.id);
        assert.ok(reader, "the reader opened");
        ir = Cu.waiveXrays(reader._internalReader);
        pv = await wvT.waitFor(() => {
            try {
                const v = ir._primaryView;
                return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount === 2
                    && v._pdfPages && v._pdfPages[0] && v._wvWraps && v._wvWraps._onSetOverlayPopup ? v : null;
            } catch (e) { return null; }
        }, 30000);
        assert.ok(pv, "the PDF view is up and its popup callback wrapped");
        // Zotero 11's structure data first (it resets a page's overlays when it lands); bounded.
        await wvT.waitFor(() => {
            const dd = pv._documentData;
            if (!dd || !dd._semanticPages) return "no structure data here";
            const busy = dd._semanticEntries ? dd._semanticEntries.size : 0;
            return dd._semanticDocument && dd._semanticPages[0] && dd._semanticPages[1] && !busy ? "settled" : null;
        }, 60000, 50);
        if (pv._processedPageOverlays) {
            assert.ok(await wvT.waitFor(() => pv._processedPageOverlays[0] && pv._processedPageOverlays[1]
                && Array.from(pv._pdfPages[0].overlays || []).some(o => o.type === "citation"), 30000, 100), "Zotero 10's processed data is in");
        }
        assert.ok(await wvT.waitFor(() => LINKS.every(l => linkOverlay(l.key)), 20000, 100), "Zotero made an overlay for each of the PDF's links");
        assert.ok(await wvT.waitFor(() => pv._pdfPages[0].chars && pv._pdfPages[0].chars.length, 20000, 100), "page 1's characters");
        assert.ok(await wvT.waitFor(() => wv._wvRefsEntriesNow && (wv._wvRefsEntriesNow.get(att.id) || []).length === 8, 30000, 100),
            "Weavero read the eight entries (" + ((wv._wvRefsEntriesNow && wv._wvRefsEntriesNow.get(att.id)) || []).length + ")");
    });

    after(async function () {
        try { await close(); } catch (e) {}
        try { wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(...made.slice().reverse());
    });

    it("the fixture: no citation of Zotero's crosses a superscript link, and the destinations land as on the real PDF", function () {
        const cits = Array.from(pv._pdfPages[0].overlays || []).filter(o => o.type === "citation");
        for (const l of LINKS) assert.isFalse(cits.some(c => Array.from(c.position.rects).some(r => crosses(Array.from(r).map(Number), l.rect))), "no card of Zotero's over \"" + l.key + "\"");
        const es = wv._wvRefsEntriesNow.get(att.id);
        const top = Math.max(...es[0].rects.filter(b => b[0] === 1).map(b => Math.max(b[2], b[4])));
        for (const k of ["2", "4", "9", "fig4", "plain3"]) {
            const d = linkOverlay(k).destinationPosition;
            assert.equal(Number(d.pageIndex), 1, k + ": page 2");
            assert.isAbove(Number(d.rects[0][3]), top + 50, k + ": in the text above the list (" + Number(d.rects[0][3]) + " over " + top + ")");
        }
        const d7 = linkOverlay("7").destinationPosition;
        const e5 = es[4].rects.filter(b => b[0] === 1);
        assert.isTrue(e5.some(b => Number(d7.rects[0][3]) >= Math.min(b[2], b[4]) - 2 && Number(d7.rects[0][3]) <= Math.max(b[2], b[4]) + 2), "\"7\" lands on [5]");
    });

    it("a superscript citation whose destination is the text above the list shows the entries its numbers name (\"2-4\")", async function () {
        for (const k of ["2", "4"]) {
            const st = await hover(linkOverlay(k));
            assert.equal(st && st.type, "citation", k + ": the card, not the picture");
            assert.isNotOk(st.image, k + ": no picture");
            assert.deepEqual(labels(st), ["[2]", "[3]", "[4]"], k + ": the group's three entries");
            assert.equal(wv._wvRefsCardLast.how, "label", k + ": by its number");
        }
        await close();
    });

    it("a destination on another entry: the link's number decides (\"7\" landing on [5] shows [7])", async function () {
        const st = await hover(linkOverlay("7"));
        assert.equal(st && st.type, "citation", "the card");
        assert.deepEqual(labels(st), ["[7]"], "entry [7], not [5]");
        await close();
    });

    it("a destination on its own entry is as before (\"1\" right above [1])", async function () {
        const st = await hover(linkOverlay("1"));
        assert.equal(st && st.type, "citation");
        assert.deepEqual(labels(st), ["[1]"]);
        assert.notEqual(wv._wvRefsCardLast.how, "label", "by its destination, as before (" + wv._wvRefsCardLast.how + ")");
        await close();
    });

    it("links that are no citation of the list keep their picture: a figure's number, a plain-size number, a number no entry carries", async function () {
        for (const k of ["fig4", "plain3", "9"]) {
            const st = await hover(linkOverlay(k));
            assert.equal(st && st.type, "internal-link", k + ": Zotero's preview");
            assert.ok(st.image, k + ": its picture");
        }
        await close();
    });

    /** The preview Weavero draws for the PDF link `key` sent to `rects` on page 2 (an area, as Zotero
     *  11's structure ties a link to a block: a 'matched' destination). */
    async function tintOf(key, rects) {
        const rwin = reader._iframeWindow;
        const popup = Cu.cloneInto({ type: "internal-link", source: "matched", position: { pageIndex: 0, rects: [L(key).rect] },
            destinationPosition: { pageIndex: 1, rects } }, rwin);
        wv._wvPrevHlLastInfo = null;
        const pic = await wv._wvPrevHlBuild(reader, pv, popup);
        assert.ok(pic, key + ": a picture");
        return wv._wvPrevHlLastInfo;
    }
    const BODY = [[72, 716, 520, 728], [72, 702, 520, 714]];
    const inEntry = (k, rs) => {
        const es = wv._wvRefsEntriesNow.get(att.id);
        const own = es[k - 1].rects.filter(b => b[0] === 1).map(b => [b[1], Math.min(b[2], b[4]), b[3], Math.max(b[2], b[4])]);
        return rs.length > 0 && rs.every(r => own.some(o => crosses(r.map(Number), o)));
    };

    it("the preview's tint: the entry the citation's number names, or nothing -- never the block the destination lands on", async function () {
        let info = await tintOf("4", BODY);
        assert.equal(info.how, "cited: entry [4]", "\"4\" sent to the body text");
        assert.isTrue(inEntry(4, info.rects), "[4]'s lines tinted: " + JSON.stringify(info.rects));
        const es = wv._wvRefsEntriesNow.get(att.id);
        const e5 = es[4].rects.filter(b => b[0] === 1).map(b => [b[1], Math.min(b[2], b[4]), b[3], Math.max(b[2], b[4])]);
        info = await tintOf("7", e5);
        assert.equal(info.how, "cited: entry [7]", "\"7\" sent to [5]");
        assert.isTrue(inEntry(7, info.rects), "[7]'s lines, not [5]'s");
        info = await tintOf("9", BODY);
        assert.lengthOf(info.rects, 0, "\"9\": no entry of that number, no tint (" + info.how + ")");
    });

    it("the preview's tint is as before for links that are no citation, and for a destination on the cited entry", async function () {
        let info = await tintOf("fig4", BODY);
        assert.notMatch(String(info.how), /^cited/, "a figure's number: " + info.how);
        assert.isAbove(info.rects.length, 0, "its target tinted as before");
        const es = wv._wvRefsEntriesNow.get(att.id);
        const e1 = es[0].rects.filter(b => b[0] === 1).map(b => [b[1], Math.min(b[2], b[4]), b[3], Math.max(b[2], b[4])]);
        info = await tintOf("1", e1);
        assert.notMatch(String(info.how), /^cited/, "\"1\" sent to [1]: " + info.how);
        assert.isTrue(inEntry(1, info.rects), "[1] tinted");
    });

    it("the rule, case by case: by number only for a citation's look that lands at the list (wvRefsCardResolve)", function () {
        const E = (label, page, y2, x1 = 72) => ({ text: label + " Entry " + label, label, rects: [[page, x1, y2 - 18, 540, y2]] });
        // An AIP list's first page: entries 1-9 at its foot (y 36-162), 10-12 at the next page's top.
        const es = [E("1", 44, 162), E("2", 44, 144), E("3", 44, 126), E("4", 44, 117), E("5", 44, 108), E("6", 44, 81), E("7", 44, 72), E("8", 44, 54), E("9", 44, 45),
            E("10", 45, 695), E("11", 45, 677), E("12", 45, 659)];
        const pt = (page, y) => ({ pageIndex: page, rects: [[0, y, 0, y]] });
        let asked = 0;
        const yes = { cites: () => { asked++; return true; } }, no = { cites: () => false };
        const f = (d, t, o) => { const e = wv._wvRefsCardEntryFor(es, d, t, o); return e ? e.label : null; };
        assert.equal(f(pt(44, 430), "4", yes), "4", "the text above the list on its first page");
        assert.equal(f(pt(44, 430), "4", no), null, "...not without a citation's look");
        assert.equal(f(pt(44, 430), "4"), null, "...nor when the look is not asked");
        assert.equal(f({ pageIndex: 44, rects: [[87, 81.5, 477, 108.4]] }, "7", yes), "7", "on entry 5, reading 7");
        assert.equal(f(pt(45, 774), "11", yes), "11", "the next page's top, above its entries");
        assert.equal(f(pt(44, 20), "4", yes), null, "below the list: no");
        assert.equal(f(pt(30, 430), "4", yes), null, "a page without entries: no");
        assert.equal(f(pt(44, 430), "15", yes), null, "a number no entry carries");
        assert.equal(f(pt(44, 430), "Fig. 4", yes), null, "words: no citation");
        asked = 0;
        assert.equal(f(pt(44, 180), "1", yes), "1", "a destination on the entry it names");
        assert.equal(asked, 0, "...decided by the destination: the look is never asked");
        const dup = es.concat([E("4", 45, 641)]);
        assert.isNull(wv._wvRefsCardEntryFor(dup, pt(44, 430), "4", yes), "two entries numbered 4: neither");
        // An unnumbered list is as before.
        const plain = [{ text: "Adams 2016", rects: [[1, 72, 690, 400, 720]] }, { text: "Brown 2019", rects: [[1, 72, 650, 400, 680]] }];
        assert.equal((wv._wvRefsCardEntryFor(plain, pt(1, 685), "", yes) || {}).text, "Brown 2019");
        assert.isNull(wv._wvRefsCardEntryFor(plain, pt(1, 770), "4", yes), "too far above any entry");
    });

    it("a citation's look, read from the page's characters (_wvRefsCardCiteLook)", function () {
        wvT.method("_wvRefsCardCiteLook");
        // A line of 10-pt characters (boxes 7 high from y 100) and a group after "conductivity.".
        const C = (c, x, y1, h, extra) => Object.assign({ c, rect: [x, y1, x + 5, y1 + h] }, extra || {});
        const line = (word, group, opts) => {
            const out = [];
            let x = 50;
            for (const ch of word) { out.push(C(ch, x, 100, 7)); x += 5; }
            for (const ch of group) { out.push(C(ch, x, opts.raise ? 104 : 100, opts.raise ? 5 : 7, opts.sup === undefined ? undefined : { sup: opts.sup })); x += 4; }
            for (const ch of " and more") { out.push(C(ch, x, 100, 7)); x += 5; }
            return out;
        };
        const at = (chars, k) => { const r = chars[k].rect; return [[r[0], r[1], r[2], r[3]]]; };
        const look = (word, group, opts, k) => { const chars = line(word, group, opts); return wv._wvRefsCardCiteLook({ chars }, at(chars, word.length + (k || 0))); };
        assert.isTrue(look("conductivity.", "2-4", { raise: true }), "a superscript, measured");
        assert.isTrue(look("conductivity.", "2-4", { raise: true }, 2), "its last number too");
        assert.isFalse(look("conductivity ", "2", {}), "a number of the text's own size");
        assert.isTrue(look("conductivity ", "2", { sup: true }), "Zotero's page data says superscript");
        assert.isFalse(look("conductivity.", "2", { raise: true, sup: false }), "...or says it is not");
        assert.isTrue(look("as in ", "[12]", {}, 1), "a bracketed group");
        assert.isTrue(look("see Ref. ", "12", {}), "\"Ref.\" before it");
        assert.isFalse(look("see Fig. ", "4", { raise: true }), "\"Fig.\" before it");
        assert.isFalse(look("Eqs. (45) and ", "(46)", {}, 1), "an equation");
    });
});
