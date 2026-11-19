/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils, Services */

// Link previews mark the whole reference entry, lightly (MJT 2026-11-17, on
// 11.0-beta.4 with a Physical Review Research paper: "the red line is too dark
// ... I would prefer if it could highlight the whole citation rather than just
// the first line"). Zotero's renderer (pdf-renderer.js renderPreviewPage)
// boxes only rects[0] of the destination in #f57b7b with a MULTIPLY fill;
// Weavero renders the picture again with the same geometry and lays a light
// tint (#f57b7b at 25 %, source-over) over every line of the entry
// (src/modules/preview-highlight.ts).
//
// The fixture is a two-page PDF written here (Helvetica, one content stream
// per page): a citation "[2]" on page 1 with a PDF link to page 2, and a
// reference list on page 2 whose entry [2] runs over three lines, the last
// one with a DOI under a URI link. The entries sit at one leading, so only
// the next entry's label ends [2]. The popups are driven through the view's
// own `_openOverlayPopup`, as a hover does: an AREA target (the first line of
// [2], what Zotero 11's structure data hands the preview) and Zotero's own
// POINT target of the PDF link.

describe("Weavero — a link preview tints the whole reference entry", function () {
    this.timeout(180000);
    const Cu = Components.utils;
    const made = [];
    let wv, reader, ir, pv, appearance = null;

    // Baselines of page 2's lines (PDF points), 9-pt text at an 11-pt leading.
    const Y = { e1: 715, e2a: 704, e2b: 693, e2c: 682, e3: 671, e4: 660 };
    const DOI_URL = "https://doi.org/10.1234/wv.prevhl.2";
    const AREA = [72, 702, 420, 711];   // the first line of [2], label to line end

    function fixturePDF() {
        const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        const line = (x, y, size, text) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
        const p1 = line(72, 740, 14, "WV-TEST preview highlight fixture")
            + line(72, 700, 10, "As shown in [2], the preview should tint the whole reference entry.");
        let p2 = line(72, 740, 12, "References");
        const E = [
            ["[1]", ["A. First, Journal of Tests 1, 101, 2020."]],
            ["[2]", ["B. Second, C. Third, and D. Fourth, A long reference entry that runs over",
                "three lines of the list so that every line of it must be tinted in the",
                "preview, doi:10.1234/wv.prevhl.2"]],
            ["[3]", ["E. Fifth, Another Journal of Tests 3, 303, 2022."]],
            ["[4]", ["F. Sixth, Yet Another Journal 4, 404, 2023."]],
        ];
        let y = Y.e1;
        for (const [label, lines] of E) {
            p2 += line(72, y, 9, label);
            for (const t of lines) { p2 += line(90, y, 9, t); y -= 11; }
        }
        const objs = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R /Annots [8 0 R] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R /Annots [9 0 R] >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Length " + p1.length + " >>\nstream\n" + p1 + "endstream",
            "<< /Length " + p2.length + " >>\nstream\n" + p2 + "endstream",
            // The citation's own link: an /XYZ destination, which Zotero turns
            // into a POINT ([x, y, x, y], pdf-view.js _getPositionFromDestination).
            "<< /Type /Annot /Subtype /Link /Rect [128 697 140 709] /Border [0 0 0] /Dest [4 0 R /XYZ 72 713 0] >>",
            // The DOI on [2]'s last line ("preview, " is 36 pt wide at 9 pt).
            "<< /Type /Annot /Subtype /Link /Rect [125 680 222 690] /Border [0 0 0] /A << /S /URI /URI (" + DOI_URL + ") >> >>",
        ];
        let body = "%PDF-1.4\n";
        const offs = [];
        objs.forEach((o, i) => { offs.push(body.length); body += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
        const xref = body.length;
        let x = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
        for (const o of offs) x += String(o).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }

    const state = () => { try { return ir._state.primaryViewOverlayPopup || null; } catch (e) { return null; } };
    const popupImg = () => reader._iframeWindow.document.querySelector(".preview-popup .inner img");

    async function close() {
        pv._onSetOverlayPopup(null);
        await wvT.waitFor(() => !state(), 5000, 50);
        await wvT.sleep(150);
    }

    /** What a hover does once the delayer fires: pdf-view's
     *  `_openOverlayPopup` (Zotero 11). Zotero 10.0.8 has no such method (its
     *  hover handler does it inline): the same two steps by hand, the
     *  renderer's picture handed to `_onSetOverlayPopup` with the overlay. */
    async function fire(overlay) {
        const rwin = reader._iframeWindow;
        if (typeof pv._openOverlayPopup === "function") {
            pv._openOverlayPopup(Cu.cloneInto(overlay, rwin));
            return;
        }
        const o = Cu.cloneInto(overlay, rwin);
        const pic = Cu.waiveXrays(await pv._pdfRenderer.renderPreviewPage(o.destinationPosition));
        pv._onSetOverlayPopup(Cu.cloneInto(Object.assign({}, overlay, {
            rect: [100, 100, 120, 120], image: String(pic.image), width: pic.width, height: pic.height, x: pic.x, y: pic.y,
        }), rwin));
    }

    /** Hover-open `overlay` (chrome object) and wait for the popup and its
     *  link zones. */
    async function open(overlay) {
        await close();
        await fire(overlay);
        const st = await wvT.waitFor(() => { const s = state(); return s && s.image ? s : null; }, 15000, 50);
        assert.isOk(st, "the preview popup opened");
        const img = await wvT.waitFor(() => { const i = popupImg(); return i && i.clientWidth && i.getAttribute("src") === st.image ? i : null; }, 10000, 50);
        assert.isOk(img, "the popup shows the picture");
        const zone = await wvT.waitFor(() => {
            for (const z of reader._iframeWindow.document.querySelectorAll(".preview-popup .wv-preview-linkzone")) if (z.title === DOI_URL) return z;
            return null;
        }, 5000, 50);
        return {
            image: String(st.image), width: Number(st.width), height: Number(st.height), x: Number(st.x), y: Number(st.y),
            cw: img.clientWidth,
            zone: zone ? { left: parseFloat(zone.style.left), top: parseFloat(zone.style.top), width: parseFloat(zone.style.width), height: parseFloat(zone.style.height) } : null,
        };
    }

    /** The picture's pixels (decoded in the main window). */
    async function pixels(src) {
        const win = Zotero.getMainWindow();
        const im = new win.Image();
        im.src = src;
        await im.decode();
        const c = /** @type {any} */ (win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"));
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(im, 0, 0);
        return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
    }

    /** PDF point (page 2) -> picture pixel, by renderPreviewPage's own
     *  geometry, anchored on the popup's x / y (the centre of the target). */
    async function mapper(popup, targetRect, pageNumber = 2) {
        const iwin = pv._iframeWindow;
        const app = iwin.PDFViewerApplication;
        const page = Cu.waiveXrays(await app.pdfDocument.getPage(pageNumber));
        const dpr = reader._iframeWindow.devicePixelRatio;
        const viewer = app.pdfViewer;
        const cur = viewer._currentScale;
        let scale = dpr * (cur > 1 ? 1 + (cur - 1) * 1.8 : cur);
        const vp1 = page.getViewport(Cu.cloneInto({ scale: 1 }, iwin));
        const max = Math.sqrt(viewer.maxCanvasPixels / (vp1.width * vp1.height));
        if (scale > max) scale = max;
        const vp = Cu.waiveXrays(page.getViewport(Cu.cloneInto({ scale }, iwin)));
        const pt = (x, y) => { const p = Cu.waiveXrays(vp.convertToViewportPoint(x, y)); return [p[0], p[1]]; };
        const a = pt(targetRect[0], targetRect[1]), b = pt(targetRect[2], targetRect[3]);
        const tx = (a[0] + b[0]) / 2 - popup.x * dpr, ty = (a[1] + b[1]) / 2 - popup.y * dpr;
        return { dpr, at: (x, y) => { const p = pt(x, y); return [Math.round(p[0] - tx), Math.round(p[1] - ty)]; } };
    }

    /** The background of a line, tinted or not: of the row through its middle
     *  between x0 and x1 (PDF), the brightest pixel -- the darkest on a dark
     *  page, whose text is light. */
    function lineBackground(px, map, baseline, x0, x1, dark) {
        const [ax, ay] = map.at(x0, baseline + 3);
        const [bx] = map.at(x1, baseline + 3);
        let best = null;
        for (let x = Math.max(0, ax); x <= Math.min(px.w - 1, bx); x++) {
            const i = (ay * px.w + x) * 4;
            const p = [px.data[i], px.data[i + 1], px.data[i + 2]];
            const s = p[0] + p[1] + p[2], b = best ? best[0] + best[1] + best[2] : null;
            if (!best || (dark ? s < b : s > b)) best = p;
        }
        return best;
    }
    const tinted = (p) => p && p[0] >= 238 && p[0] - p[1] >= 15 && p[1] >= 195 && Math.abs(p[1] - p[2]) <= 8;
    const white = (p) => p && p[0] >= 245 && p[1] >= 245 && p[2] >= 245;
    const show = (p) => p ? "rgb(" + p.join(",") + ")" : "none";

    let on = null, off = null;

    before(async function () {
        // CI + Linux only (1.2.0 gate, 2026-11-19, MJT: "Skip it on Linux CI, release"):
        // on GitHub's Ubuntu runner with the Zotero beta the preview popup never opened
        // (CI run 44537151777, both attempts: "the preview popup opened" null), so every
        // case here failed in turn; Windows and macOS CI and local runs pass. To fix
        // with the other CI skips (work/TODO.md).
        if (Services.env.exists("CI") && Zotero.isLinux) this.skip();
        wv = wvT.plugin();
        for (const m of ["_wvPrevHlWanted", "_wvPrevHlBuild", "_wvPrevHlEntryFromLines", "_wvPrevHlFromPageData", "_wvWirePreviewLinkZones"]) wvT.method(m);
        const path = PathUtils.join(PathUtils.tempDir, "wv-prevhl-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, fixturePDF());
        made.push(await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) }));
        try { await IOUtils.remove(path); } catch (e) {}
        reader = await wvT.openReaderTab(made[0].id);
        assert.ok(reader, "the reader opened");
        ir = Cu.waiveXrays(reader._internalReader);
        pv = await wvT.waitFor(() => {
            try {
                const v = ir._primaryView;
                return v && v._iframeWindow && v._iframeWindow.PDFViewerApplication.pdfViewer.pagesCount === 2
                    && v._pdfPages && v._pdfPages[0] && v._wvWraps && v._wvWraps._onSetOverlayPopup ? v : null;
            } catch (e) { return null; }
        }, 30000);
        assert.isOk(pv, "the PDF view is up and its popup callback wrapped");
        // A white page whatever the runner's desktop theme (the pixel checks
        // read white and tinted backgrounds).
        appearance = { forced: pv._forcedColorScheme, light: pv._lightTheme };
        pv.setLightTheme(null);
        pv.setColorScheme("light");
        await wvT.waitFor(() => !pv._iframeWindow.theme, 5000, 50);
    });

    after(async function () {
        try { await close(); } catch (e) {}
        try { if (appearance) { pv.setLightTheme(appearance.light || null); pv.setColorScheme(appearance.forced || null); } } catch (e) {}
        try { wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        await wvT.erase(...made);
    });

    it("an area target: every line of the entry under a light tint, the entries around it untouched", async function () {
        const target = { type: "internal-link", source: "sdt", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
            destinationPosition: { pageIndex: 1, rects: [AREA] } };
        off = await wvT.withPref("weavero.previewEntryHighlight", false, () => open(target));
        on = await wvT.withPref("weavero.previewEntryHighlight", true, () => open(target));
        await close();
        assert.notEqual(on.image, off.image, "Weavero's picture replaced Zotero's");
        for (const k of ["width", "height", "x", "y"]) assert.approximately(on[k], off[k], 0.01, "the popup's " + k + " is Zotero's");
        await assertEntryTinted(on, "found by " + wv._wvPrevHlLastInfo.how);
    });

    /** [2]'s three lines tinted, lightly, [1] and [3] untouched -- each row
     *  sampled within its line's own text (past its end the page is white). */
    async function assertEntryTinted(popup, why) {
        const px = await pixels(popup.image);
        const map = await mapper(popup, rectsOfPopup(popup));
        const bg = {
            e1: lineBackground(px, map, Y.e1, 90, 240),
            e2a: lineBackground(px, map, Y.e2a, 90, 370),
            e2b: lineBackground(px, map, Y.e2b, 90, 335),
            e2c: lineBackground(px, map, Y.e2c, 90, 215),
            e3: lineBackground(px, map, Y.e3, 90, 270),
        };
        const seen = why + ": " + Object.entries(bg).map(([k, p]) => k + " " + show(p)).join("; ");
        for (const k of ["e2a", "e2b", "e2c"]) assert.isTrue(tinted(bg[k]), "line " + k + " of [2] tinted, lightly; " + seen);
        for (const k of ["e1", "e3"]) assert.isTrue(white(bg[k]), "entry " + k + " untouched; " + seen);
        assert.isAbove(bg.e2a[1], 190, "light, not Zotero's #f57b7b (G 123); " + seen);
    }
    const rectsOfPopup = (popup) => popup.target || AREA;

    /** Run `fn` with the reader's page data out of the entry finder's reach
     *  (Zotero 11's structure data knows the fixture's entry and answers
     *  first), so a later source answers. */
    async function withoutPageData(fn) {
        wv._wvPrevHlFromPageData = () => null;
        try { return await fn(); }
        finally { delete wv._wvPrevHlFromPageData; }
    }

    it("no page data: the text geometry finds the entry, label to label", async function () {
        const target = { type: "internal-link", source: "sdt", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
            destinationPosition: { pageIndex: 1, rects: [AREA] } };
        const got = await withoutPageData(() => wvT.withPref("weavero.previewEntryHighlight", true, () => open(target)));
        await close();
        assert.equal(wv._wvPrevHlLastInfo.how, "text:bracket");
        await assertEntryTinted(got, "text geometry");
    });

    it("the gate off leaves Zotero's picture: the first line boxed dark, the rest of the entry unmarked", async function () {
        assert.isOk(off, "the first test opened Zotero's popup");
        const px = await pixels(off.image);
        const map = await mapper(off, AREA);
        const a = lineBackground(px, map, Y.e2a, 90, 400), b = lineBackground(px, map, Y.e2b, 90, 380);
        assert.isBelow(a[1], 160, "Zotero's multiply box on the first line: " + show(a));
        assert.isTrue(white(b), "the second line unmarked: " + show(b));
    });

    it("the link zones land on the DOI in Weavero's picture as in Zotero's", async function () {
        // CI only (1.2.0 gate, 2026-11-19, MJT: "Skip on CI, release now", then "Ok to skip
        // and fix after the release"): on GitHub's runners with the Zotero beta one of the
        // two pictures had no zone over the DOI -- Ubuntu twice, then Windows twice --
        // Weavero's in one run and Zotero's in another; local runs have both. A timing
        // flake of the zones' injection, to fix (work/TODO.md).
        if (Services.env.exists("CI")) this.skip();
        assert.isOk(on && on.zone, "a zone over the DOI in Weavero's popup");
        assert.isOk(off && off.zone, "and in Zotero's");
        for (const k of ["left", "top", "width", "height"]) assert.approximately(on.zone[k], off.zone[k], 0.5, "zone " + k);
        // The zone holds the DOI's glyphs: dark pixels inside it, on the tint.
        const px = await pixels(on.image);
        const k = on.width / on.cw * (px.w / on.width);
        let dark = 0;
        const x0 = Math.round(on.zone.left * k), x1 = Math.round((on.zone.left + on.zone.width) * k);
        const y0 = Math.round(on.zone.top * k), y1 = Math.round((on.zone.top + on.zone.height) * k);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * px.w + x) * 4;
                if (px.data[i] + px.data[i + 1] + px.data[i + 2] < 300) dark++;
            }
        }
        assert.isAbove(dark, 20, "text under the zone");
    });

    it("a point target (Zotero's own PDF link) is left as Zotero draws it", async function () {
        let link = null;
        for (const o of Array.from(pv._pdfPages[0].overlays || [])) {
            if (o.type === "internal-link" && o.source === "annotation") link = o;
        }
        // Zotero 11 makes an overlay of the citation's PDF link (pdf-page-data.mjs
        // buildAnnotationLinkOverlays). Zotero 10.0.8 keeps none in its page
        // data (its citation overlay covers the link): the overlay Zotero 11
        // makes, written out.
        const plain = link ? JSON.parse(pv._iframeWindow.JSON.stringify(link))
            : { type: "internal-link", source: "annotation", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
                destinationPosition: { pageIndex: 1, rects: [[72, 713, 72, 713]] } };
        const r = plain.destinationPosition.rects[0];
        assert.isTrue(r[0] === r[2] && r[1] === r[3], "its destination is a point: " + r);
        // Weavero must not redraw it: no build, the popup handed on as Zotero made it. (Compared by
        // what Weavero does, not by pixels: two renders of the same page by Zotero itself need not
        // be identical byte for byte -- 2026-11-17, an intermittent failure of the old
        // `b.image === a.image` on Zotero 11 with nothing of Weavero's in the path.)
        let builds = 0;
        const realBuild = wv._wvPrevHlBuild;
        wv._wvPrevHlBuild = function () { builds++; return realBuild.apply(this, arguments); };
        let b;
        try {
            b = await wvT.withPref("weavero.previewEntryHighlight", true, () => open(plain));
        }
        finally { delete wv._wvPrevHlBuild; }
        await close();
        assert.equal(builds, 0, "Weavero built no picture for a point target");
        assert.isFalse(wv._wvPrevHlWanted(Cu.cloneInto(Object.assign({}, plain, { image: b.image }), pv._iframeWindow)), "not one Weavero redraws");
        assert.match(b.image, /^data:image\/png/, "Zotero's own picture shown");
    });

    it("a close while the picture renders drops the held preview", async function () {
        const target = { type: "internal-link", source: "sdt", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
            destinationPosition: { pageIndex: 1, rects: [AREA] } };
        await close();
        let heldAtClose = null;
        let holds = 0;
        // The close comes at the very moment Weavero starts holding Zotero's popup -- in the
        // same task, not after a poll: a 2 ms poll ran ~1 s late in a runner window that was not
        // in front (Firefox throttles a background window's timers), by when the picture was
        // ready and the popup shown (2026-11-17, an intermittent failure on Zotero 11).
        const realHold = wv._wvPrevHlHold;
        wv._wvPrevHlHold = function () {
            holds++;
            const r = realHold.apply(this, arguments);
            heldAtClose = !state();
            // As the pointer leaving does: the delayer's close sets null.
            pv._onSetOverlayPopup(null);
            return r;
        };
        try {
            await wvT.withPref("weavero.previewEntryHighlight", true, async () => {
                fire(target);
                await wvT.waitFor(() => holds > 0, 15000, 20);
                await wvT.sleep(2500);
            });
        }
        finally { delete wv._wvPrevHlHold; }
        assert.equal(holds, 1, "Weavero held Zotero's popup once");
        assert.isTrue(heldAtClose, "the popup was still held when the close came");
        assert.isNull(state(), "no popup shown after the close");
    });

    // The preview is rendered by the view's own pdf.js, which paints the page
    // in the reader's appearance (canvas.js beginDrawing: `window.theme`), so
    // Weavero's picture is themed as Zotero's is. The tint stays a visible red
    // on a dark or sepia page, and light: never a multiply box (G x 123/255).
    it("on a dark and a sepia page the entry still reads under a light red tint", async function () {
        const iwin = pv._iframeWindow;
        const target = { type: "internal-link", source: "sdt", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
            destinationPosition: { pageIndex: 1, rects: [AREA] } };
        const was = { forced: pv._forcedColorScheme, light: pv._lightTheme, dark: pv._darkTheme };
        const THEMES = [
            { scheme: "dark", theme: { id: "wv-test-dark", label: "Dark", background: "#2E3440", foreground: "#D8DEE9" } },
            { scheme: "light", theme: { id: "wv-test-sepia", label: "Sepia", background: "#F4ECD8", foreground: "#5B4636" } },
        ];
        try {
            for (const { scheme, theme } of THEMES) {
                if (scheme === "dark") pv.setDarkTheme(Cu.cloneInto(theme, iwin));
                else pv.setLightTheme(Cu.cloneInto(theme, iwin));
                pv.setColorScheme(scheme);
                await wvT.waitFor(() => iwin.theme && iwin.theme.background === theme.background, 5000, 50);
                assert.equal(iwin.theme && iwin.theme.background, theme.background, theme.label + " page");
                const got = await wvT.withPref("weavero.previewEntryHighlight", true, () => open(target));
                await close();
                const dark = scheme === "dark";
                const px = await pixels(got.image);
                const map = await mapper(got, AREA);
                const ref = lineBackground(px, map, Y.e1, 90, 260, dark);
                const seen = (p) => theme.label + ": " + show(p) + " against " + show(ref);
                for (const y of [Y.e2a, Y.e2b, Y.e2c]) {
                    const p = lineBackground(px, map, y, 90, 220, dark);
                    assert.isAtLeast((p[0] - p[1]) - (ref[0] - ref[1]), 15, "line at " + y + " tinted red, " + seen(p));
                    assert.isAtLeast(p[1], 0.6 * ref[1], "line at " + y + " light, no multiply box, " + seen(p));
                }
                const p3 = lineBackground(px, map, Y.e3, 90, 260, dark);
                assert.isAtMost(Math.abs((p3[0] - p3[1]) - (ref[0] - ref[1])), 4, "[3] untouched, " + seen(p3));
            }
        }
        finally {
            try { pv.setLightTheme(was.light || null); } catch (e) {}
            try { pv.setDarkTheme(was.dark || null); } catch (e) {}
            try { pv.setColorScheme(was.forced || null); } catch (e) {}
        }
    });

    it("a 'matched' target: the entry's own rects", async function () {
        const rects = [[72, 702, 380, 711], [90, 691, 342, 700], [90, 680, 222, 689]];
        const target = { type: "internal-link", source: "matched", position: { pageIndex: 0, rects: [[128, 697, 140, 709]] },
            destinationPosition: { pageIndex: 1, rects } };
        const got = await withoutPageData(() => wvT.withPref("weavero.previewEntryHighlight", true, () => open(target)));
        await close();
        assert.equal(wv._wvPrevHlLastInfo.how, "matched");
        await assertEntryTinted(Object.assign(got, { target: rects[0] }), "matched rects");
    });

    // MJT 2026-11-17: "The link to Figure 4(b) highlights a full paragraph of
    // the main text" -- Zotero 11's matcher had sent the link to the paragraph
    // it is written in. Here: a 'matched' destination on page 1 holding the
    // citation's own link. Zotero boxes that line dark; Weavero shows the page
    // with no mark.
    it("a destination that holds the link itself: the PDF's own link on that spot previewed (WV-TEMP-134821)", async function () {
        // #65 / forum 134821 is Zotero 11's text matcher sending a link to its own
        // paragraph; Zotero 10 previewed the figure right (upstream register #65). On
        // 10.0.8 the stand-in finds no PDF link at this spot and keeps the "self-link"
        // fallback (the page with no mark, measured 2026-11-19, full run + alone): the
        // own-link half is Zotero 11's.
        if (parseInt(String(Zotero.version), 10) < 11) this.skip();
        // The fixture's page 1 has its own link annotation on these words ([128 697 140
        // 709] -> page 2): that one is previewed instead of the matched paragraph.
        const own = [128, 697, 140, 709];
        const dest = [72, 697, 430, 710];
        const target = { type: "internal-link", source: "matched", position: { pageIndex: 0, rects: [own] },
            destinationPosition: { pageIndex: 0, rects: [dest] } };
        const zot = await wvT.withPref("weavero.previewEntryHighlight", false, () => open(target)).catch(() => null);
        wv._wvPrevHlLastInfo = null;
        const got = await wvT.withPref("weavero.previewEntryHighlight", true, () => openNoZone(target));
        await close();
        assert.equal(wv._wvPrevHlLastInfo && wv._wvPrevHlLastInfo.how, "own-link (WV-TEMP-134821)", "the PDF's own link taken");
        if (zot) assert.notEqual(got.image, zot.image, "not Zotero's picture of the matched paragraph");
    });

    it("a destination that holds the link itself, no link of the PDF's there: the page with no mark", async function () {
        const own = [128, 697, 140, 709];
        const dest = [72, 697, 430, 710];   // page 1's line "As shown in [2], ..."
        const target = { type: "internal-link", source: "matched", position: { pageIndex: 0, rects: [own] },
            destinationPosition: { pageIndex: 0, rects: [dest] } };
        const zot = await wvT.withPref("weavero.previewEntryHighlight", false, () => open(target)).catch(() => null);
        // As on a page whose words have no link annotation of their own.
        wv._wvPrevHlSelfLinkAlt = () => null;
        let got;
        try { got = await wvT.withPref("weavero.previewEntryHighlight", true, () => openNoZone(target)); }
        finally { delete wv._wvPrevHlSelfLinkAlt; }
        await close();
        assert.equal(wv._wvPrevHlLastInfo.how, "self-link", "found the link inside its own destination");
        assert.lengthOf(wv._wvPrevHlLastInfo.rects, 0, "nothing marked");
        const px = await pixels(got.image);
        const map = await mapper(got, dest, 1);
        const bg = lineBackground(px, map, 700, 72, 420);
        assert.isTrue(white(bg), "the link's own line unmarked: " + show(bg));
        if (zot) assert.notEqual(got.image, zot.image, "not Zotero's boxed picture");
    });

    /** As `open`, without waiting for the DOI's link zone (page 1 has none). */
    async function openNoZone(overlay) {
        await close();
        await fire(overlay);
        const st = await wvT.waitFor(() => { const s = state(); return s && s.image ? s : null; }, 15000, 50);
        assert.isOk(st, "the preview popup opened");
        return { image: String(st.image), width: Number(st.width), height: Number(st.height), x: Number(st.x), y: Number(st.y) };
    }
});

// The entry finder alone, on synthetic text lines (PDF space, y up).
describe("Weavero — the reference entry around a preview's target", () => {
    let wv;
    before(function () {
        wv = wvT.plugin();
        wvT.method("_wvPrevHlEntryFromLines");
        wvT.method("_wvPrevHlFromPageData");
    });
    const L = (text, x0, base, x1, fs = 9) => ({ text, rect: [x0, base - 2, x1 || x0 + 300, base + 7], fs, rot: 0 });
    const tops = (res) => res.rects.map(r => r[3]);

    it("bracket labels: the entry ends at the next label", () => {
        const lines = [L("[1] A. First", 72, 715), L("[2] B. Second, a long", 72, 704), L("continued line", 90, 693), L("end doi", 90, 682), L("[3] E. Fifth", 72, 671)];
        const res = wv._wvPrevHlEntryFromLines(lines, [72, 702, 400, 711]);
        assert.deepEqual(tops(res), [711, 700, 689]);
        assert.equal(res.how, "text:bracket");
    });

    it("numbered labels ('24.') and parenthesised ones ('(24)')", () => {
        for (const [a, b] of [["23. A", "24. B"], ["(23) A", "(24) B"]]) {
            const lines = [L(a, 72, 704), L("more", 90, 693), L(b, 72, 682)];
            assert.lengthOf(wv._wvPrevHlEntryFromLines(lines, [72, 702, 400, 711]).rects, 2, a);
        }
    });

    it("author-year with a hanging indent: back at the margin is the next entry", () => {
        const lines = [L("Smith, J. 2020 A title", 72, 704), L("that goes on", 84, 693), L("and on.", 84, 682), L("Jones, K. 2021", 72, 671)];
        const res = wv._wvPrevHlEntryFromLines(lines, [72, 702, 400, 711]);
        assert.lengthOf(res.rects, 3);
        assert.equal(res.how, "text:indent");
    });

    it("neither label nor hanging indent: only the target line", () => {
        const lines = [L("Smith, J. 2020 A title", 72, 704), L("Jones, K. 2021", 72, 693)];
        const res = wv._wvPrevHlEntryFromLines(lines, [72, 702, 400, 711]);
        assert.lengthOf(res.rects, 1);
        assert.equal(res.how, "target-lines");
    });

    it("one column: a line higher up (the next column) or after a gap ends the entry", () => {
        const colJump = [L("[2] B. Second", 72, 104), L("next column top", 320, 700)];
        assert.lengthOf(wv._wvPrevHlEntryFromLines(colJump, [72, 102, 300, 111]).rects, 1, "column jump");
        const gap = [L("[2] B. Second", 72, 704), L("after a blank", 90, 680)];
        assert.lengthOf(wv._wvPrevHlEntryFromLines(gap, [72, 702, 300, 711]).rects, 1, "gap");
    });

    it("a destination holding the hovered link on the same page is the link's own block", () => {
        wvT.method("_wvPrevHlHoldsLink");
        const popup = { position: { pageIndex: 3, rects: [[471, 502, 492, 511]] } };
        // The 2026-11-17 case: "Fig. 4(b)" matched to the paragraph it sits in.
        const para = [[313, 510, 558, 520], [313, 499, 558, 509], [313, 488, 558, 498]];
        assert.isTrue(wv._wvPrevHlHoldsLink(popup, 3, para), "same page, a line crossing the link");
        assert.isFalse(wv._wvPrevHlHoldsLink(popup, 4, para), "another page");
        assert.isFalse(wv._wvPrevHlHoldsLink(popup, 3, [[50, 640, 295, 648]]), "elsewhere on the page");
        assert.isFalse(wv._wvPrevHlHoldsLink({}, 3, para), "no position");
    });

    // WV-TEMP-134821 (register #65): a 'matched' link whose target is the paragraph it
    // sits in, with the PDF's own link on the same spot -> the PDF's own link previewed.
    it("a link matched to its own text, the PDF's own link on that spot: the preview of the PDF's link (WV-TEMP-134821)", async () => {
        wvT.method("_wvPrevHlSelfLinkAlt");
        wvT.method("_wvPrevHlHold");
        const own = { type: "internal-link", source: "annotation", position: { pageIndex: 3, rects: [[471, 502, 492, 511]] }, destinationPosition: { pageIndex: 3, rects: [[0, 420, 0, 420]] } };
        const other = { type: "internal-link", source: "annotation", position: { pageIndex: 3, rects: [[50, 640, 80, 648]] }, destinationPosition: { pageIndex: 5, rects: [[0, 100, 0, 100]] } };
        const rendered = [];
        const pv = {
            _overlayRevision: 7, _destroyed: false, _wvPrevHlSeq: 1,
            _pdfPages: { 3: { overlays: [other, own] } },
            _pdfRenderer: { renderPreviewPage: (pos) => { rendered.push(pos); return Promise.resolve({ image: "data:image/png;base64,AA", width: 11, height: 12, x: 3, y: 4 }); } },
        };
        const matched = () => ({ type: "internal-link", source: "matched", image: "data:image/png;base64,ZZ",
            position: { pageIndex: 3, rects: [[471, 502, 492, 511]] },
            destinationPosition: { pageIndex: 3, rects: [[313, 510, 558, 520], [313, 499, 558, 509]] } });
        // The alternative: the PDF's own link crossing the spot, not another one.
        assert.strictEqual(wv._wvPrevHlSelfLinkAlt(pv, matched()), own, "the PDF's own link on the spot");
        const elsewhere = matched(); elsewhere.destinationPosition = { pageIndex: 4, rects: [[72, 600, 300, 610]] };
        assert.isNull(wv._wvPrevHlSelfLinkAlt(pv, elsewhere), "a matched target elsewhere: left to Zotero");
        const fromPdf = matched(); fromPdf.source = "annotation";
        assert.isNull(wv._wvPrevHlSelfLinkAlt(pv, fromPdf), "a popup of the PDF's own link: nothing to replace");
        // Through the hold: Zotero's renderer on the PDF link's destination, handed on.
        const p = matched();
        const got = await new Promise((res) => { wv._wvPrevHlHold(null, pv, p, 1, res); setTimeout(() => res(null), 2000); });
        assert.ok(got, "the popup handed on");
        assert.deepEqual(rendered, [own.destinationPosition], "rendered for the PDF's own destination");
        assert.strictEqual(got.destinationPosition, own.destinationPosition, "its destination");
        assert.strictEqual(got.image, "data:image/png;base64,AA", "its picture");
    });

    it("no line on the target: none found", () => {
        assert.isNull(wv._wvPrevHlEntryFromLines([L("[1] A", 72, 704)], [72, 400, 300, 409]));
    });

    it("page data: a citation's reference or a matched link holding the target wins, the smallest first", () => {
        const pages = {
            0: { overlays: [
                { type: "external-link", position: { pageIndex: 0, rects: [[1, 1, 2, 2]] } },
                { type: "citation", references: [{ position: { pageIndex: 1, rects: [[72, 702, 400, 711], [90, 691, 400, 700]] } }] },
                { type: "internal-link", source: "matched", destinationPosition: { pageIndex: 1, rects: [[72, 600, 400, 711]] } },
            ] },
        };
        const res = wv._wvPrevHlFromPageData(pages, 1, [[72, 702, 420, 711]]);
        assert.equal(res.how, "page-data:citation");
        assert.lengthOf(res.rects, 2);
        assert.isNull(wv._wvPrevHlFromPageData(pages, 2, [[72, 702, 420, 711]]), "another page: nothing");
    });
});
