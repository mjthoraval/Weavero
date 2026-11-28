/* global describe, it, before, after, assert, Zotero, wvT, Components */

// One hover and click area per in-text citation in a PDF (WV-TEMP-CITEZONES;
// MJT 2026-11-25; upstream register #76). Zotero 11 makes a citation's areas
// from the structure data, one per text node: a font change split "Thoraval
// et al. 2012" into three areas to the same reference, and a node that stops
// short left "Clerc (2004" without its ")" and "Van Dam & Le" outside. The
// geometry below is the one measured in MJT's two papers (x 241-278 "Thoraval",
// 283-306 italic "et al.", 311-331 "2012"). Contracts (lib/cite-zones.ts):
//  - merge: same references, same line, only a space between;
//  - right: the rest of a word the area stops inside, then a ")" it opened;
//  - left: author names of the reference before the area, a "(" outside,
//    never a lowercase word, never a name the reference lacks;
//  - a PDF link inside a merged or stretched area is dropped;
//  - applied twice, nothing more changes;
//  - the reader side: the page's own overlays are not changed, the new page
//    lives in the reader's compartment, and shutdown gives Zotero's back.

describe("Weavero — one area per in-text citation (WV-TEMP-CITEZONES)", function () {
    this.timeout(90000);
    let plan;
    const FS = 10, CW = 5, SP = 3, Y1 = 600, Y2 = 610;

    /** Characters of `text` from x0 (no char for a space), and the rect of each
     *  marked part: parts are [text, mark?]. */
    function line(parts, x0 = 100, y1 = Y1, y2 = Y2) {
        const chars = [];
        const marks = {};
        let x = x0;
        for (const [t, mark] of parts) {
            let a = null, b = null;
            for (const c of t) {
                if (c === " ") { x += SP; continue; }
                const r = [x, y1, x + CW, y2];
                chars.push({ c, r, fs: FS });
                if (a === null) a = r[0];
                b = r[2];
                x += CW;
            }
            if (mark) marks[mark] = [a, y1, b, y2];
        }
        return { chars, marks };
    }
    const cit = (rect, sig, refText) => ({ type: "citation", source: "sdt", sig, rects: [rect], refText });

    before(function () {
        const lib = wvT.lib();
        plan = lib && lib.wvCiteZonesPlan;
        if (typeof plan !== "function") wvT.absent("wvCiteZonesPlan");
    });

    it("three areas of one citation, split at the italic \"et al.\", become one; the PDF link on the year goes", function () {
        const L = line([["(Thoroddsen 2002; ", ""], ["Thoraval", "a"], [" ", ""], ["et al.", "b"], [" ", ""], ["2012", "c"], ["; Thoroddsen et al. 2012)", ""]]);
        const ref = "THORAVAL, M.-J. et al. 2012 Microbubble formation. Phys. Rev. Lett. 108, 264506.";
        const ovs = [cit(L.marks.a, "R44", ref), cit(L.marks.b, "R44", ref), cit(L.marks.c, "R44", ref),
            { type: "internal-link", source: "annotation", sig: "", rects: [[L.marks.c[0] - 1, Y1 - 1, L.marks.c[2] + 1, Y2 + 1]], refText: "" }];
        const p = plan(ovs, L.chars);
        assert.deepEqual(p[0], [[L.marks.a[0], Y1, L.marks.c[2], Y2]], "one area from \"Thoraval\" to \"2012\"");
        assert.isNull(p[1]);
        assert.isNull(p[2]);
        assert.isNull(p[3], "the PDF link inside it is dropped");
    });

    it("two citations next to each other stay two: other references, or text between", function () {
        const L = line([["(", ""], ["Thoroddsen 2002", "a"], ["; ", ""], ["Thoraval et al. 2012", "b"], [")", ""]]);
        const p = plan([cit(L.marks.a, "R1", "THORODDSEN, S. T. 2002 ..."), cit(L.marks.b, "R2", "THORAVAL, M.-J. et al. 2012 ...")], L.chars);
        assert.isUndefined(p[0]);
        assert.isUndefined(p[1]);
        const M = line([["Smith 2004", "a"], [", ", ""], ["see", ""], [" ", ""], ["Smith 2004", "b"]]);
        const q = plan([cit(M.marks.a, "S", "SMITH, J. 2004 ..."), cit(M.marks.b, "S", "SMITH, J. 2004 ...")], M.chars);
        assert.notStrictEqual(q[1], null, "a word between: not merged");
    });

    it("the closing parenthesis and the last digit join the area", function () {
        const L = line([["as shown by ", ""], ["Clerc (2004", "a"], [")", ""], [" and ", ""], ["Richard, Clanet & Quere 200", "b"], ["2", ""], [".", ""]]);
        const p = plan([cit(L.marks.a, "C", "CLERC, C. 2004 ..."), cit(L.marks.b, "R", "RICHARD, D., CLANET, C. & QUERE, D. 2002 Contact time ...")], L.chars);
        assert.strictEqual(p[0][0][2], L.marks.a[2] + CW, "\")\" in");
        assert.strictEqual(p[1][0][2], L.marks.b[2] + CW, "\"2\" in, the \".\" not");
    });

    it("the author names before the area join it; a lowercase word and a \"(\" stay out", function () {
        const ref = "VAN DAM, D. B. & LE CLERC, C. 2004 Experimental study of the impact of an ink-jet printed droplet. Phys. Fluids 16, 3403.";
        const L = line([["studied by ", ""], ["Van", "v"], [" Dam & Le ", ""], ["Clerc (2004", "a"], [")", ""]]);
        const p = plan([cit(L.marks.a, "V", ref)], L.chars);
        assert.deepEqual(p[0], [[L.marks.v[0], Y1, L.marks.a[2] + CW, Y2]], "\"Van Dam & Le Clerc (2004)\", not \"by\"");
        const M = line([["(", ""], ["Van", "v"], [" Dam & Le ", ""], ["Clerc 2004", "a"], [")", ""]]);
        const q = plan([cit(M.marks.a, "V", ref)], M.chars);
        assert.strictEqual(q[0][0][0], M.marks.v[0], "starts at \"Van\", after the \"(\"");
    });

    it("a name the reference lacks stops the stretch, and a connector alone is not taken", function () {
        const L = line([["Jones and ", ""], ["Smith (2004", "a"], [")", ""]]);
        const p = plan([cit(L.marks.a, "S", "SMITH, J. 2004 Drops. J. Fluid Mech. 1, 1.")], L.chars);
        assert.strictEqual(p[0][0][0], L.marks.a[0], "starts at \"Smith\"");
        assert.strictEqual(p[0][0][2], L.marks.a[2] + CW, "with its \")\"");
    });

    it("applied twice, nothing more changes", function () {
        const ref = "VAN DAM, D. B. & LE CLERC, C. 2004 ...";
        const L = line([["by ", ""], ["Van", "v"], [" Dam & Le ", ""], ["Clerc (2004", "a"], [")", ""], [" showed", ""]]);
        const once = plan([cit(L.marks.a, "V", ref)], L.chars);
        const twice = plan([cit(once[0][0], "V", ref)], L.chars);
        assert.isUndefined(twice[0]);
    });

    describe("in a reader", function () {
        let wv, att, reader, dd, g;
        const Cu = Components.utils;

        before(async function () {
            wv = wvT.plugin();
            for (const m of ["_wvWireCiteZones", "_wvCzFix", "_wvCzRecompose", "_wvReaderUnwireInternals"]) wvT.method(m);
            att = await wvT.createTestPDFItem("wv-cite-zones");
            reader = await wvT.openReaderTab(att.id);
            assert.isOk(reader, "a reader");
            const ir = Cu.waiveXrays(reader._internalReader);
            const pv = await wvT.waitFor(() => (ir._primaryView && ir._primaryView._iframeWindow ? ir._primaryView : null), 20000);
            // version: Zotero 10 has no structure-data citations (no _documentData), nothing to fix.
            if (!pv || !pv._documentData) { this.skip(); return; }
            dd = pv._documentData;
            g = Cu.getGlobalForObject(dd);
            await wvT.waitFor(() => (wvT.lib().wvWrapLayers(dd, "_composePage").some((l) => l.layer === "citeZones") ? true : null), 10000);
        });

        after(async function () {
            wvT.closeReaderTab(reader);
            await wvT.erase(att);
        });

        /** A page as the reader holds it: in its compartment. */
        function page() {
            const L = line([["Thoraval", "a"], [" ", ""], ["et al.", "b"], [" ", ""], ["2012", "c"]]);
            const ref = { text: "THORAVAL, M.-J. et al. 2012 ...", position: { pageIndex: 5, rects: [[50, 700, 300, 710]] } };
            const ov = (r) => ({ type: "citation", source: "sdt", references: [ref], position: { pageIndex: 0, rects: [r] } });
            return Cu.cloneInto({
                viewBox: [0, 0, 612, 792],
                chars: L.chars.map((c) => ({ c: c.c, rect: c.r, fontSize: c.fs })),
                overlays: [ov(L.marks.a), ov(L.marks.b), ov(L.marks.c)],
            }, g);
        }

        it("wired on the view's page data, and a composed page comes back with one area, in the reader's compartment", function () {
            const pd = page();
            // A page index with no structure data: Zotero returns the page as is, the fix then applies.
            const out = Cu.waiveXrays(dd._composePage(999, pd));
            assert.notStrictEqual(out, Cu.waiveXrays(pd), "a new page object");
            assert.strictEqual(out.overlays.length, 1, "one citation area");
            assert.strictEqual(Cu.getGlobalForObject(out.overlays), g, "built in the reader's compartment");
            assert.strictEqual(out.overlays[0].references[0].text.slice(0, 8), "THORAVAL", "its references kept");
            assert.strictEqual(Cu.waiveXrays(pd).overlays.length, 3, "the page's own overlays untouched");
            assert.strictEqual(Cu.unwaiveXrays(out.chars), Cu.unwaiveXrays(Cu.waiveXrays(pd).chars), "the characters shared, not copied");
        });

        it("a page with no citation passes through as it is", function () {
            const pd = Cu.cloneInto({ chars: [], overlays: [{ type: "external-link", source: "annotation", url: "https://example.com", position: { pageIndex: 0, rects: [[1, 1, 2, 2]] } }] }, g);
            assert.strictEqual(Cu.waiveXrays(dd._composePage(999, pd)), Cu.waiveXrays(pd));
        });

        it("the reader's teardown gives Zotero's own areas back; wiring again restores the fix", function () {
            wv._wvReaderUnwireInternals(reader);
            try {
                assert.notInclude(wvT.lib().wvWrapLayers(dd, "_composePage").map((l) => l.layer), "citeZones");
                const pd = page();
                assert.strictEqual(Cu.waiveXrays(dd._composePage(999, pd)).overlays.length, 3, "Zotero's three areas");
            }
            finally { wv._wvWireCiteZones(reader); }
            assert.strictEqual(Cu.waiveXrays(dd._composePage(999, page())).overlays.length, 1);
        });
    });
});
