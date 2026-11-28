/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// R2: a PDF link Zotero did not read as a citation shows the reference's TEXT
// (src/modules/refs-cards.ts; MJT 2026-11-20). Zotero 11 shows its citation
// popup over a citation it tied to an entry; where it tied none the citation is
// the PDF's own link, and the hover showed Zotero's link preview -- a picture of
// the reference page. Weavero reads the paper's list itself (refs.ts
// _wvRefsEntries), and a link landing on one of its entries now shows that entry
// as Zotero's citation popup, decorated by refs.ts as any other.
//
// The fixture is a two-page PDF written here (Helvetica): page 1 cites a
// numbered reference list on page 2 through PDF links (/Link, /Dest /XYZ) as
// REVTeX + hyperref writes them -- each destination above its entry's first
// line, the one of "2" on the baseline of [1]'s last line. The entries are
// APS-style ("J. Adams, ..., J. Test Mech. 812, 101 (2016)."): Zotero 11 keeps
// no list of those (lib/ref-list.ts) and its citations stay plain links -- the
// case of MJT's PRL papers. Zotero 10.0.8 reads numbered citations itself (its
// pdf-worker, one group per paper); the fixture gives it an unlinked "[1-5]"
// to take instead, so on both versions the linked numbers stay plain links --
// the first case checks it. Weavero reads the numbered list after
// "References". The popups open through the view's own path, as a hover does
// (pdf-view.js _openOverlayPopup on Zotero 11; Zotero 10.0.8's hover does the
// same two steps inline).

describe("Weavero — references: a PDF link Zotero did not read as a citation shows the reference (R2)", function () {
    this.timeout(180000);
    const Cu = Components.utils;
    const made = [];
    let wv, reader, ir, pv;

    const ENTRIES = [
        ["J. Adams, K. Brown, and L. Clark, Drop impact on a heated plate,", "J. Test Mech. 812, 101 (2016)."],
        ["M. Davis and P. Evans, Bubble entrapment beneath viscous drops,", "Phys. Rev. Test 4, 053601 (2019)."],
        ["R. Foster, Thin films on soft substrates and their drainage,", "Annu. Rev. Test Fluid 53, 33 (2021)."],
        ["S. Garcia, T. Hill, and U. Irwin, Splashing of ethanol drops,", "Exp. Test Fluids 59, 77 (2018)."],
        ["V. Jones and W. King, Rebound of drops from superhydrophobic plates,", "Phys. Test Fluids 6, 023602 (2021)."],
    ];
    /** Page 2: entry k's first baseline (9-pt text, 11-pt leading, 4 pt between entries). */
    const base = (k) => 715 - k * 26;
    /** Page 1's links: the text each covers, its box, where it goes. */
    const LINKS = [];

    function fixturePDF() {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        let p2 = line(72, 745, 12, "References");
        ENTRIES.forEach(([a, c], k) => { p2 += line(72, base(k), 9, "[" + (k + 1) + "]"); p2 += line(90, base(k), 9, a); p2 += line(90, base(k) - 11, 9, c); });
        // Each cited part is a text object of its own, so its box is known (Helvetica 10 pt).
        let p1 = line(72, 745, 14, "WV-TEST R2 fixture: plain PDF links to a reference list");
        LINKS.length = 0;
        const put = (x, y, text, dest) => {
            p1 += line(x, y, 10, text);
            if (dest) LINKS.push({ text, key: dest.key || text, rect: [x - 1, y - 3, x + (dest.w || 7), y + 9], dest });
        };
        // Zotero 10.0.8's pdf-worker keeps ONE group of numbered citations per paper -- the
        // one naming the most entries, the first on a tie (pdf.worker matchByNumber: grouped
        // by kind, font, size and whether a link carries them) -- and its card replaces the
        // link it covers. This unlinked "[1-5]" comes first and names all five: Zotero 10
        // takes it (a card of its own, crossing no link), and leaves the linked numbers
        // below as the plain links this case is about. Zotero 11 takes neither.
        put(72, 714, "Earlier studies [1-5] covered drops on plates.");
        // The cited numbers bare, each destination 16 pt above its entry's baseline (APS's
        // are 8.3 pt above the line's top, Baggaley et al. 2012): [2]'s lands on the
        // baseline of [1]'s last line.
        put(72, 700, "Drops were studied before (ref."); put(213, 700, "1", { page: 2, y: base(0) + 16 });
        put(220, 700, ") and bubbles trapped (ref."); put(340, 700, "2", { page: 2, y: base(1) + 16 }); put(347, 700, ").");
        put(72, 686, "Thin films drain slowly (ref."); put(200, 686, "3", { page: 2, y: base(2) + 16 });
        put(207, 686, ") and drops splash (refs."); put(320, 686, "4-5", { page: 2, y: base(3) + 16, w: 17 }); put(338, 686, ").");
        put(72, 672, "Drops rebound, as"); put(160, 672, "Jones and King", { page: 2, y: base(4) + 16, w: 72 }); put(235, 672, "found.");
        put(72, 658, "See"); put(95, 658, "Figure 1", { page: 1, y: 760, w: 38 }); put(136, 658, "and the");
        put(175, 658, "appendix", { page: 2, y: 300, w: 40 });
        // [1] cited again near the page's foot, to scroll where the popup fits under it
        // without the card and not with it (the placement case, MJT 2026-11-20).
        put(72, 120, "As said before (ref."); put(170, 120, "1", { page: 2, y: base(0) + 16, key: "1-low" }); put(177, 120, ").");
        // A group whose numbers are linked one by one, as Backhaus et al. 2011 (PRL) links
        // "[4–9]" (MJT 2026-11-20, "Range of citations not identified"); then a linked number
        // with an unlinked one after it, which is no part of its group.
        put(72, 644, "Several works ["); put(150, 644, "1", { page: 2, y: base(0) + 16, key: "1-g" }); put(157, 644, "-");
        put(162, 644, "3", { page: 2, y: base(2) + 16, key: "3-g" }); put(170, 644, "] agree, as in ref.");
        put(262, 644, "2", { page: 2, y: base(1) + 16, key: "2-n" }); put(269, 644, ", 4 cells were used.");
        const objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R /Annots ["
                + LINKS.map((l, i) => (8 + i) + " 0 R").join(" ") + "] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Length " + p1.length + " >>\nstream\n" + p1 + "endstream",
            "<< /Length " + p2.length + " >>\nstream\n" + p2 + "endstream",
        ].concat(LINKS.map(l => "<< /Type /Annot /Subtype /Link /Rect [" + l.rect.join(" ") + "] /Border [0 0 0] /Dest ["
            + (l.dest.page === 1 ? 3 : 4) + " 0 R /XYZ 72 " + l.dest.y + " 0] >>"));
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    const state = () => { try { return ir._state.primaryViewOverlayPopup || null; } catch (e) { return null; } };
    const doc = () => reader._iframeWindow.document;
    const crosses = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;

    /** Zotero's own overlay for the fixture link whose key (its text, unless given) is
     *  `text`: the PDF's link annotation (source 'annotation'; on Zotero 11 its text
     *  matcher may lay a link of its own over the same number, 'matched'). */
    function linkOverlay(text) {
        const l = LINKS.find(x => x.key === text);
        const ovs = Array.from(pv._pdfPages[0].overlays || []);
        return ovs.find(o => o.type === "internal-link" && (o.source === "annotation" || !o.source)
            && Array.from(o.position.rects).some(r => crosses(Array.from(r).map(Number), l.rect))) || null;
    }

    async function close() {
        try { pv._onSetOverlayPopup(null); } catch (e) {}
        await wvT.waitFor(() => !state(), 5000, 50);
        await wvT.sleep(100);
    }

    /** What a hover does once the delayer fires, for Zotero's own overlay `o`:
     *  pdf-view.js _openOverlayPopup (Zotero 11); on Zotero 10.0.8, which does it
     *  inline in its hover handler, the same two steps -- the preview rendered,
     *  then the popup handed to _onSetOverlayPopup. */
    async function hover(o, keep) {
        // `keep`: the popup up stays up, as when the pointer goes from one citation
        // straight to the next; the wait is for the popup of `o`, not the one up.
        const was = keep ? refText(state()) : null;
        if (!keep) await close();
        if (typeof pv._openOverlayPopup === "function") {
            pv._openOverlayPopup(o);
        }
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
        return wvT.waitFor(() => { const s = state(); return s && (s.type !== "internal-link" || s.image) && (!keep || refText(s) !== was) ? s : null; }, 15000, 50);
    }
    const refText = (s) => { try { return s && s.references ? String(s.references[0].text) : null; } catch (e) { return null; } };

    let a1 = null;
    let ctxWas = null;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvRefsDecorate", "_wvRefsEntries", "_wvRefsPrepare", "_wvWirePreviewLinkZones"]) wvT.method(m);
        // The reader's item pane as a fresh profile has it, collapsed (zoteroPane.xhtml): where
        // Zotero's popup opens depends on the reader's width, and a spec that left the pane open
        // (pane-lock.spec.js until 2026-11-27) sent the tall popup to the side (dev.99 triage;
        // the 2026-11-22 A/B, harness + pane-lock + refs-cards). Put back in after().
        const mw = Zotero.getMainWindow();
        ctxWas = !!mw.ZoteroContextPane.collapsed;
        mw.ZoteroContextPane.collapsed = true;
        // [1] in the library, without a PDF: its row gets the blue mark.
        a1 = await wvT.createItem("journalArticle", { title: "Drop impact on a heated plate", date: "2016", publicationTitle: "J. Test Mech.", volume: "812", pages: "101" });
        a1.setCreators([{ creatorType: "author", lastName: "Adams", firstName: "J." }]);
        await a1.saveTx();
        made.push(a1);
        const citing = await wvT.createItem("journalArticle", { title: "WV-TEST R2 fixture: plain PDF links to a reference list", date: "2026" });
        made.push(citing);
        const path = PathUtils.join(PathUtils.tempDir, "wv-refscard-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, fixturePDF());
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: citing.id });
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
        // Zotero 11's structure data for both pages first: when it lands it resets
        // the page's overlay state and drops or closes a popup
        // (preview-entry-highlight.spec.js). Bounded: Zotero 10.0.8 has none.
        await wvT.waitFor(() => {
            const dd = pv._documentData;
            if (!dd || !dd._semanticPages) return "no structure data here";
            const busy = dd._semanticEntries ? dd._semanticEntries.size : 0;
            return dd._semanticDocument && dd._semanticPages[0] && dd._semanticPages[1] && !busy ? "settled" : null;
        }, 60000, 50);
        // Zotero 10.0.8's processed data (its citations and references) lands after
        // the page's own and replaces the page's overlays (pdf-view.js
        // _initProcessedData): page 1 has its card for "[1-5]" then.
        if (pv._processedPageOverlays) {
            assert.ok(await wvT.waitFor(() => pv._processedPageOverlays[0] && pv._processedPageOverlays[1]
                && Array.from(pv._pdfPages[0].overlays || []).some(o => o.type === "citation"), 30000, 100), "Zotero 10's processed data is in");
        }
        // The PDF's link annotations on page 1 (published apart from its text).
        assert.ok(await wvT.waitFor(() => LINKS.every(l => linkOverlay(l.text)), 20000, 100), "Zotero made an overlay for each of the PDF's links");
        // Weavero's reading of the list, as the reader's wiring asks for it.
        assert.ok(await wvT.waitFor(() => wv._wvRefsEntriesNow && (wv._wvRefsEntriesNow.get(att.id) || []).length === 5, 30000, 100),
            "Weavero read the five entries");
        // The index, so the rows get their marks.
        await wv._wvRefsIndexEnsure();
    });

    after(async function () {
        try { await close(); } catch (e) {}
        try { wvT.closeReaderTab(reader); } catch (e) {}
        try { if (ctxWas !== null) Zotero.getMainWindow().ZoteroContextPane.collapsed = ctxWas; } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(...made.slice().reverse());
    });

    it("the fixture: Zotero ties none of the PDF's citations to an entry -- no citation of its own crosses a link", function () {
        const cits = Array.from(pv._pdfPages[0].overlays || []).filter(o => o.type === "citation");
        for (const l of LINKS) {
            const over = cits.filter(c => Array.from(c.position.rects).some(r => crosses(Array.from(r).map(Number), l.rect)));
            assert.equal(over.length, 0, "no citation of Zotero's over \"" + l.text + "\"");
        }
    });

    it("Zotero's own card is Zotero's: no card of Weavero's where Zotero read the citation", async function () {
        // Zotero 10.0.8 reads "[1-5]" (see the fixture); Zotero 11 reads none of it.
        const cit = Array.from(pv._pdfPages[0].overlays || []).find(o => o.type === "citation");
        if (!pv._processedPageOverlays) {
            assert.notOk(cit, "Zotero 11 made no card in the fixture");
            return;
        }
        assert.ok(cit, "Zotero 10 made its card for \"[1-5]\"");
        await close();
        if (typeof pv._openOverlayPopup === "function") pv._openOverlayPopup(cit);
        else {
            const rwin = reader._iframeWindow;
            const W = Cu.waiveXrays(rwin);
            const popup = W.Object.assign(new W.Object(), cit);
            popup.rect = Cu.cloneInto(Array.from(pv.getClientRect(cit.position.rects[0], cit.position.pageIndex)), rwin);
            pv._selectedOverlay = cit;
            pv._onSetOverlayPopup(popup);
        }
        const st = await wvT.waitFor(() => state(), 10000, 50);
        assert.equal(st && st.type, "citation");
        assert.equal(st.references.length, 5, "Zotero's five references");
        assert.isNotOk(st._wvRefsCard, "Zotero's card, not Weavero's");
        await close();
    });

    it("a hover on a numbered citation shows its entry as Zotero's citation popup, not the page picture", async function () {
        const st = await hover(linkOverlay("1"));
        assert.ok(st, "a popup opened");
        assert.equal(st.type, "citation", "the card, not the picture");
        assert.isNotOk(st.image, "no picture");
        assert.equal(st.references.length, 1, "one reference");
        assert.match(String(st.references[0].text), /^\[1\] J\. Adams, K\. Brown, and L\. Clark, Drop impact/, "the entry's text");
        assert.equal(Number(st.references[0].position.pageIndex), 1, "its position: the entry on page 2");
        const pop = await wvT.waitFor(() => doc().querySelector(".citation-popup"), 10000, 50);
        assert.ok(pop, "Zotero's citation popup drew it");
        const rows = pop.querySelectorAll(".reference-row");
        assert.equal(rows.length, 1, "one row");
        assert.include(rows[0].textContent.replace(/\s+/g, " "), "Drop impact on a heated plate", "the row shows the entry");
    });

    it("Weavero's decoration applies as on Zotero's own cards: the bold number, the mark, the buttons", async function () {
        if (!state() || state().type !== "citation") await hover(linkOverlay("1"));
        const row = await wvT.waitFor(() => {
            const r = doc().querySelector(".citation-popup .reference-row");
            // The mark is the row's own child, at its start (main 1.2.1-dev.29, merged with R2).
            return r && r.querySelector(":scope > .wv-refs-row-mark") && r.querySelector(".wv-refs-row-label") ? r : null;
        }, 15000, 50);
        assert.ok(row, "the row decorated");
        const lab = row.querySelector(".wv-refs-row-label");
        assert.equal(lab.textContent, "[1]", "the entry's number apart");
        assert.isAtLeast(Number(reader._iframeWindow.getComputedStyle(lab).fontWeight), 600, "in bold");
        const mark = row.querySelector(":scope > .wv-refs-row-mark");
        assert.equal(mark.getAttribute("data-wv-refs-kind"), "nopdf", "[1] is in the library, without a PDF: the blue mark");
        const acts = Array.from(row.querySelectorAll(".wv-refs-btn")).map(b => b.getAttribute("data-wv-refs-act"));
        assert.include(acts, "library", "Show in Library");
        await close();
    });

    // MJT 2026-11-20: "For a single citation, I would still merge these 2 popups into one",
    // then "I would still keep the Zotero popup at the top: it contains the exact format of
    // the citation in the text of the PDF file".
    it("one reference: its card in the popup, under Zotero's own text, the buttons under it and shown without hover", async function () {
        if (!state() || state().type !== "citation") await hover(linkOverlay("1"));
        const row = await wvT.waitFor(() => {
            const r = doc().querySelector(".citation-popup .reference-row");
            return r && r.querySelector(":scope > .wv-refs-pcard .wv-refs-card") ? r : null;
        }, 15000, 50);
        assert.ok(row, "the card in the row");
        const iw = reader._iframeWindow;
        const pcard = row.querySelector(":scope > .wv-refs-pcard");
        const card = pcard.querySelector(".wv-refs-card");
        assert.equal(card.getAttribute("data-wv-refs-card"), String(a1.id), "[1]'s item");
        assert.ok(card.querySelector(".wv-refs-card-lib"), "where it is");
        assert.ok(await wvT.waitFor(() => card.querySelector(".wv-refs-card-type svg"), 3000, 30), "its type icon, inlined");
        // Zotero's text first, as the PDF prints it.
        const text = row.querySelector(":scope > .wv-refs-rowtext") || Array.from(row.children).find(c => c.localName === "div" && !c.hasAttribute("class"));
        assert.notEqual(iw.getComputedStyle(text).display, "none", "Zotero's text kept");
        assert.include(String(text.textContent), "Drop impact on a heated plate", "the PDF's own words");
        assert.ok(text.getBoundingClientRect().bottom <= pcard.getBoundingClientRect().top + 0.5, "above the card");
        // The text's indent is Zotero's part's alone: the card from the row's left edge,
        // where the mark starts (MJT 2026-11-20, "The rest of the card can be left aligned").
        const mk = row.querySelector(":scope > .wv-refs-row-mark");
        assert.approximately(pcard.getBoundingClientRect().left, mk.getBoundingClientRect().left, 1, "the card at the mark's left");
        assert.isBelow(pcard.getBoundingClientRect().left, text.getBoundingClientRect().left - 10, "left of Zotero's text");
        // The buttons under the card, without a hover.
        const ctl = row.querySelector(":scope > .wv-refs-ctl");
        assert.equal(iw.getComputedStyle(ctl).display, "flex", "shown without hover");
        assert.ok(ctl.getBoundingClientRect().top >= card.getBoundingClientRect().bottom - 0.5, "under the card");
        // Weavero's part framed, on its own background (MJT 2026-11-20, "The Weavero part of
        // the popup should get a different background color or line around").
        const popEl = row.closest(".citation-popup");
        const pcs = iw.getComputedStyle(pcard), ccs = iw.getComputedStyle(ctl);
        assert.equal(pcs.borderTopStyle, "solid", "a frame round the card");
        assert.equal(ccs.borderBottomStyle, "solid", "closed under the buttons");
        assert.notEqual(pcs.backgroundColor, iw.getComputedStyle(popEl).backgroundColor, "a background of its own");
        assert.equal(ccs.backgroundColor, pcs.backgroundColor, "the buttons on the same background, one box");
        assert.approximately(ctl.getBoundingClientRect().left, pcard.getBoundingClientRect().left, 0.5, "the same left edge");
        assert.approximately(ctl.getBoundingClientRect().top, pcard.getBoundingClientRect().bottom, 0.5, "no gap between them");
        await close();
    });

    // MJT 2026-11-20: "The position of the popup first appears too low, then moves up. It should
    // directly appear at the right position." Zotero places its popup for its own height, then
    // again on a timer; the card added in between is now accounted for before the paint.
    it("one reference: the popup is where it stays from the moment the card is in it (no move after)", async function () {
        await close();
        const iw = reader._iframeWindow;
        let early = null, side = null;
        // Registered after the plugin's observer: it runs in the same microtask checkpoint,
        // after the decoration, before Zotero's timer and before the paint.
        const mo = new iw.MutationObserver(() => {
            try {
                if (early) return;
                const p = doc().querySelector(".citation-popup");
                if (p && p.querySelector(".wv-refs-pcard")) { early = String(p.style.transform); side = String(p.className); }
            } catch (e) {}
        });
        mo.observe(doc(), Cu.cloneInto({ childList: true, subtree: true }, iw));
        try {
            await hover(linkOverlay("1"));
            assert.ok(await wvT.waitFor(() => early, 15000, 20), "the card came in");
            await wvT.sleep(400);
            const p = doc().querySelector(".citation-popup");
            assert.equal(String(p.style.transform), early, "no move after the card came in (" + side + ")");
        }
        finally { mo.disconnect(); await close(); }
    });

    // MJT 2026-11-20, again: "The popup first opens below, then jumps above. It should open at
    // the right place directly." Zotero placed the popup under the citation for its height
    // without the card; with the card it no longer fits there, and Zotero's second pass (a
    // timer, after a paint) moved it above. The decoration now places it as Zotero will.
    it("one reference: a popup the card makes too tall for the room under the citation opens above it at once", async function () {
        await close();
        const iw = reader._iframeWindow;
        const cont = pv._iframeWindow.PDFViewerApplication.pdfViewer.container;
        const top0 = cont.scrollTop;
        let early = null, side = null;
        const mo = new iw.MutationObserver(() => {
            try {
                if (early) return;
                const p = doc().querySelector(".citation-popup");
                if (p && p.querySelector(".wv-refs-pcard")) { early = String(p.style.transform); side = String(p.className); }
            } catch (e) {}
        });
        try {
            // The popup's height with the card and without it.
            const st0 = await hover(linkOverlay("1-low"));
            assert.equal(st0 && st0.type, "citation", "the low [1] shows its card");
            const p0 = await wvT.waitFor(() => { const x = doc().querySelector(".citation-popup"); return x && x.querySelector(".wv-refs-pcard .wv-refs-card") ? x : null; }, 15000, 50);
            assert.ok(p0, "the card came in");
            await wvT.sleep(300);
            const hBig = p0.offsetHeight;
            const pc = p0.querySelector(".wv-refs-pcard"), ctl = p0.querySelector(".reference-row > .wv-refs-ctl");
            pc.style.display = "none";
            if (ctl) ctl.style.display = "none";
            const hSmall = p0.offsetHeight;
            pc.style.display = "";
            if (ctl) ctl.style.display = "";
            const vh = p0.parentNode.getBoundingClientRect().height;
            const r0 = Array.from(st0.rect).map(Number);
            await close();
            // The citation's foot where the popup fits under it without the card, not with it.
            const target = vh - 10 - (hSmall + hBig) / 2;
            assert.isAbove(hBig - hSmall, 40, "the card adds height (" + hSmall + " -> " + hBig + ")");
            assert.isAbove(target - (r0[3] - r0[1]) - 10 - hBig, 0, "fixture: room above for the popup with its card (view " + vh + ")");
            cont.scrollTop = top0 + (r0[3] - target);
            await wvT.sleep(400);
            mo.observe(doc(), Cu.cloneInto({ childList: true, subtree: true }, iw));
            const st = await hover(linkOverlay("1-low"));
            const r = Array.from(st.rect).map(Number);
            assert.isBelow(r[3] + hSmall + 10, vh, "fixture: without the card it fits under the citation");
            assert.isAtLeast(r[3] + hBig + 10, vh, "fixture: with the card it does not");
            assert.ok(await wvT.waitFor(() => early, 15000, 20), "the card came in");
            await wvT.sleep(400);
            const p = doc().querySelector(".citation-popup");
            assert.include(String(p.className), "page-popup-top-center", "above the citation");
            assert.include(side, "page-popup-top-center", "above from the moment the card is in it");
            assert.equal(String(p.style.transform), early, "no move after the card came in");
        }
        finally { mo.disconnect(); await close(); cont.scrollTop = top0; await wvT.sleep(200); }
    });

    // MJT 2026-11-20: "Why do I get this without the Weavero part below?" -- [13]'s popup with
    // a mark and no card, right after [14,18,19]'s. React keeps the popup up and its rows when
    // the pointer goes on to the next citation; only their contents change, and the decoration
    // ran only for a popup or a row added: the row kept the citation before's mark and card.
    it("a popup kept up for the next citation is decorated for it: no mark or card of the citation before", async function () {
        await hover(linkOverlay("1"));
        const pop = await wvT.waitFor(() => { const p = doc().querySelector(".citation-popup"); return p && p.querySelector(".reference-row > .wv-refs-pcard .wv-refs-card") ? p : null; }, 15000, 50);
        assert.ok(pop, "[1]'s card");
        try {
            const st3 = await hover(linkOverlay("3"), true);
            assert.match(refText(st3), /^\[3\] R\. Foster/, "[3]'s popup");
            assert.strictEqual(doc().querySelector(".citation-popup"), pop, "fixture: Zotero kept its popup up for [3]");
            const row3 = await wvT.waitFor(() => {
                const r = pop.querySelector(".reference-row");
                const m = r && r.querySelector(":scope > .wv-refs-row-mark");
                return r && (!m || m.getAttribute("data-wv-refs-kind") !== "nopdf") && !r.querySelector(".wv-refs-pcard") ? r : null;
            }, 5000, 50);
            assert.ok(row3, "[3] is in no library: its own mark, and no card of [1]'s ("
                + (pop.querySelector(".wv-refs-row-mark") || { getAttribute: () => "none" }).getAttribute("data-wv-refs-kind") + ")");
            const st1 = await hover(linkOverlay("1"), true);
            assert.match(refText(st1), /^\[1\] J\. Adams/, "[1]'s popup again");
            const card = await wvT.waitFor(() => pop.querySelector(".reference-row > .wv-refs-pcard .wv-refs-card"), 5000, 50);
            assert.ok(card, "[1]'s card back in the kept popup");
            assert.equal(card.getAttribute("data-wv-refs-card"), String(a1.id), "[1]'s item");
            assert.equal(pop.querySelector(".wv-refs-row-mark").getAttribute("data-wv-refs-kind"), "nopdf", "[1]'s mark");
        }
        finally { await close(); }
    });

    it("the number decides where the anchor is ambiguous: the destination of \"2\" sits on [1]'s last line", async function () {
        const st = await hover(linkOverlay("2"));
        assert.equal(st && st.type, "citation");
        assert.match(String(st.references[0].text), /^\[2\] M\. Davis/, "[2], not [1]");
        await close();
    });

    it("a range link names every entry of its range: \"4-5\" shows [4] and [5]", async function () {
        const st = await hover(linkOverlay("4-5"));
        assert.equal(st && st.type, "citation");
        assert.equal(st.references.length, 2, "two references");
        assert.match(String(st.references[0].text), /^\[4\] S\. Garcia/);
        assert.match(String(st.references[1].text), /^\[5\] V\. Jones/);
        await close();
    });

    it("a group whose numbers are linked one by one: either link lists every entry it names (\"[1-3]\")", async function () {
        for (const k of ["3-g", "1-g"]) {
            const st = await hover(linkOverlay(k));
            assert.equal(st && st.type, "citation", k + ": the card");
            assert.deepEqual(Array.from(st.references).map(r => String(r.text).slice(0, 3)), ["[1]", "[2]", "[3]"], k + ": [1] to [3]");
        }
        // The popup's rows are decorated as any group's: several rows, no card in one.
        const pop = await wvT.waitFor(() => { const p = doc().querySelector(".citation-popup"); return p && p.querySelectorAll(".reference-row > .wv-refs-row-mark").length === 3 ? p : null; }, 10000, 50);
        assert.ok(pop, "three rows, each with its mark");
        assert.notOk(pop.querySelector(".wv-refs-pcard"), "no card in a row of a group");
        await close();
    });

    it("a number beside the link that no link covers is no part of its group (\"ref. 2, 4 cells\")", async function () {
        const st = await hover(linkOverlay("2-n"));
        assert.equal(st && st.type, "citation");
        assert.equal(st.references.length, 1, "[2] alone");
        assert.match(String(st.references[0].text), /^\[2\] M\. Davis/);
        await close();
    });

    // MJT 2026-11-20: "Hyperlink should be clickable in Weavero color" (Backhaus et al. 2011,
    // [10]: "... http:// dow-answer.custhelp.com/." -- the list's line ends after "://").
    it("a URL in a reference's text is a link in Weavero's colours, opened by Weavero", function () {
        wvT.method("_wvRefsRowText");
        const d = doc(), iw = reader._iframeWindow;
        const pop = d.createElement("div");
        pop.className = "citation-popup";
        const row = d.createElement("div");
        row.className = "reference-row";
        const src = d.createElement("div");
        src.textContent = "[10] Density and dynamic viscosity data for propylene glycol are taken from manufacturer data, http:// dow-answer.custhelp.com/.";
        row.appendChild(src);
        pop.appendChild(row);
        d.body.appendChild(pop);
        let got = null;
        wv._launchURL = (u) => { got = u; };
        try {
            wv._wvRefsRowText(row, "[10]");
            const a = row.querySelector(":scope > .wv-refs-rowtext a.wv-refs-url");
            assert.ok(a, "the URL is a link");
            assert.equal(a.getAttribute("data-wv-url"), "http://dow-answer.custhelp.com/", "the URL whole, the full stop after it out");
            assert.equal(a.textContent, "http:// dow-answer.custhelp.com/", "its text as printed");
            assert.ok(a.classList.contains("wv-link-http"), "a web link");
            const probe = d.createElement("span");
            probe.style.color = "var(--wv-link-http, #1a73e8)";
            d.body.appendChild(probe);
            try { assert.equal(iw.getComputedStyle(a).color, iw.getComputedStyle(probe).color, "Weavero's web-link colour"); }
            finally { probe.remove(); }
            assert.equal(row.querySelector(".wv-refs-row-label").textContent, "[10]", "the number still apart");
            a.dispatchEvent(new iw.MouseEvent("click", Cu.cloneInto({ bubbles: true, cancelable: true, button: 0 }, iw)));
            assert.equal(got, "http://dow-answer.custhelp.com/", "Weavero opened it");
        }
        finally {
            delete wv._launchURL;
            wv._wvRefsRowText(row, null);
            pop.remove();
        }
    });

    it("links that are no citation of the list keep their picture: words, a figure, a point of the page with no entry", async function () {
        for (const t of ["Jones and King", "Figure 1", "appendix"]) {
            const st = await hover(linkOverlay(t));
            assert.ok(st, "a popup for \"" + t + "\"");
            assert.equal(st.type, "internal-link", "\"" + t + "\": Zotero's preview");
            assert.ok(st.image, "\"" + t + "\": its picture");
        }
        await close();
    });

    it("the click is the link's own: Zotero navigates to the link's destination", async function () {
        // A hover first, so the card is what the link shows when it is clicked.
        const st = await hover(linkOverlay("3"));
        assert.equal(st && st.type, "citation", "the card is up");
        await close();
        const o = linkOverlay("3");
        const iw = pv._iframeWindow, idoc = iw.document;
        const app = iw.PDFViewerApplication;
        const r = Array.from(o.position.rects[0]).map(Number);
        pv.navigateToPosition(Cu.cloneInto({ pageIndex: 0, rects: [r] }, iw));
        await wvT.sleep(600);
        assert.equal(app.pdfViewer.currentPageNumber, 1, "fixture: page 1 in view");
        // The page's data is Zotero's: R2 adds nothing a click would pick.
        assert.isFalse(Array.from(pv._pdfPages[0].overlays).some(x => x && x._wvRefsCard), "no card in the page's data");
        // A mouse click on the link: a press reaches the view as `mousedown` (pdf-view.js
        // _handlePointerDown returns for a mouse's pointerdown), the release as `pointerup`,
        // which picks the overlay under the pointer again and navigates.
        const cr = Array.from(pv.getClientRect(Cu.cloneInto(r, iw), 0)).map(Number);
        const x = (cr[0] + cr[2]) / 2, y = (cr[1] + cr[3]) / 2;
        // The overlay the click will pick there: Zotero's link (on 11 its text matcher's
        // own link may be the smaller one over the same number).
        const picked = pv._getSelectableOverlay(pv.pointerEventToPosition(Cu.cloneInto({ clientX: x, clientY: y }, iw)));
        assert.ok(picked && picked.type === "internal-link", "a link under the pointer: " + (picked && picked.type));
        const el = idoc.elementFromPoint(x, y) || idoc.body;
        el.dispatchEvent(new iw.MouseEvent("mousedown", Cu.cloneInto({ clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1 }, iw)));
        await wvT.sleep(50);
        el.dispatchEvent(new iw.PointerEvent("pointerup", Cu.cloneInto({ clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 0, pointerType: "mouse", isPrimary: true, pointerId: 1 }, iw)));
        assert.ok(await wvT.waitFor(() => app.pdfViewer.currentPageNumber === 2, 5000, 50), "the click went to page 2 (page " + app.pdfViewer.currentPageNumber + ")");
        // Where it went: the link's own destination (Zotero marks it), not the entry's box
        // a citation would navigate to (references[0].position).
        const hp = pv._highlightedPosition;
        if (hp) {
            assert.equal(Number(hp.pageIndex), 1);
            assert.deepEqual(Array.from(hp.rects[0]).map(v => Math.round(Number(v))), Array.from(picked.destinationPosition.rects[0]).map(v => Math.round(Number(v))),
                "the link's destination");
        }
    });

    it("steps aside where Zotero has its own card over the link", async function () {
        // A citation of Zotero's crossing [3], with a reference elsewhere than the
        // link's destination: R2 leaves the link alone (and WV-TEMP-134867, which
        // takes a card only for a reference on the destination page, too).
        const W = Cu.waiveXrays(reader._iframeWindow);
        const l = LINKS.find(x => x.text === "3");
        const fake = Cu.cloneInto({ type: "citation", source: "sdt", wvTest: "refs-cards",
            position: { pageIndex: 0, rects: [[l.rect[0] + 1, l.rect[1] + 1, l.rect[2] - 1, l.rect[3] - 1]] },
            references: [{ position: { pageIndex: 0, rects: [[72, 740, 300, 750]] }, text: "Zotero's own reference", chars: [{ c: "Z" }] }] }, W);
        const ovs = pv._pdfPages[0].overlays;
        ovs.push(fake);
        try {
            const st = await hover(linkOverlay("3"));
            assert.equal(st && st.type, "internal-link", "the link's picture: Zotero has a citation there");
            assert.isNotOk(st && st._wvRefsCard, "no card of Weavero's");
        }
        finally {
            const i = Array.from(ovs).findIndex(x => x && x.wvTest === "refs-cards");
            if (i >= 0) ovs.splice(i, 1);
            await close();
        }
    });

    it("off with the References feature", async function () {
        await wvT.withPref("weavero.enableReferences", false, async () => {
            const st = await hover(linkOverlay("1"));
            assert.equal(st && st.type, "internal-link", "Zotero's picture");
        });
        await close();
    });

    it("the rule, case by case (_wvRefsCardEntryFor)", function () {
        wvT.method("_wvRefsCardEntryFor");
        const E = (label, page, x1, y1, x2, y2) => ({ text: (label ? label + " " : "") + "Entry " + y2, label: label || undefined, rects: [[page, x1, y1, x2, y2]] });
        const numbered = [E("[1]", 3, 322, 468, 560, 487.6), E("[2]", 3, 322, 446.3, 560, 465.7), E("[3]", 3, 322, 435.3, 560, 443.8)];
        const pt = (page, x, y) => ({ pageIndex: page, rects: [[x, y, x, y]] });
        const f = (es, d, t, o) => { const e = wv._wvRefsCardEntryFor(es, d, t, o); return e ? e.label || e.text : null; };
        // Baggaley et al. 2012 (PRL), measured: hyperref's points 8.3 pt above each entry.
        assert.equal(f(numbered, pt(3, 315, 474), "2"), "[2]", "a superscript number");
        assert.equal(f(numbered, pt(3, 315, 474), "[2]"), "[2]", "in brackets");
        assert.equal(f(numbered, pt(3, 315, 508), "*"), null, "the author's footnote mark, just above [1]");
        assert.equal(f(numbered, pt(3, 315, 474), "Fig. 2"), null, "a figure's number");
        assert.equal(f(numbered, pt(3, 315, 474), "1(d)"), null, "a figure panel");
        assert.equal(f(numbered, pt(3, 315, 474), "3"), null, "a number no entry near the point carries");
        assert.equal(f(numbered, pt(3, 52, 474), "2"), null, "the other column");
        assert.equal(f(numbered, pt(3, 0, 474), "2"), "[2]", "no left given: any column");
        assert.equal(f(numbered, pt(2, 315, 474), "2"), null, "another page");
        // Zotero 11's matched destination: the entry's first line as a box.
        assert.equal(f(numbered, { pageIndex: 3, rects: [[322, 457, 560, 465.7]] }, "2"), "[2]", "a box: its top-left corner");
        // An unnumbered list: the nearest first line at or below the point.
        const plain = [E(null, 1, 72, 690, 400, 720), E(null, 1, 72, 650, 400, 680), E(null, 1, 72, 610, 400, 640)];
        assert.equal(f(plain, pt(1, 72, 688), "Smith et al."), "Entry 680", "the anchor inside the entry above is the next entry's");
        assert.equal(f(plain, pt(1, 72, 685), ""), "Entry 680");
        assert.equal(f(plain, pt(1, 72, 770), ""), null, "too far above any entry");
        assert.equal(f(plain, pt(1, 72, 500), ""), null, "below the list");
    });

    it("costs a hover next to nothing, and nothing at all elsewhere", function () {
        const o = linkOverlay("1");
        const t0 = Date.now();
        let hits = 0;
        for (let i = 0; i < 200; i++) if (wv._wvRefsCardProbe(reader, pv, o)) hits++;
        const ms = (Date.now() - t0) / 200;
        assert.equal(hits, 200);
        assert.isBelow(ms, 5, "one decision in under 5 ms (" + ms.toFixed(3) + " ms)");
        // R2 wraps nothing of its own: it runs inside the popup wrapper reader.ts
        // already has, and only for a link's popup.
        for (const k of Object.keys(pv._wvWraps || {})) {
            for (const rec of pv._wvWraps[k].recs) assert.notMatch(String(rec.layer), /card|R2/i, "no layer of R2's on " + k);
        }
    });
});
