/* global describe, it, before, after, assert, Zotero, wvT */

// WV-TEMP-REG41 (upstream register #41; verified in Troubleshooting Mode
// 2026-10-28; MJT: "Ok for the stale mark fix"). With the Attachments
// section out of view, a newly selected item gets only the section's sync
// `render()` (attachmentsBox.js), which updates the count alone: the rows
// and the preview stay the PREVIOUS item's -- the preview at status
// "success" -- until the section scrolls into view, so they show for a
// moment then. Weavero hides them while they belong to another item, and
// leaves the preview's status alone so that going back to that item shows
// it at once. Written before the code. Second path (MJT 2026-10-28, "Ok to
// extend the fix"): back from a note, Zotero shows the item view again --
// still the old item's -- and waits for an idle callback before rendering
// the new item; the switch itself is checked, against the item about to be
// shown, and A -> note -> A must stay instant.

describe("Weavero — WV-TEMP-REG41: the Attachments section never shows the previous item's preview", function () {
    this.timeout(150000);
    let wv, win, doc, ZP, det, box, PA, PB, A, B, N;

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvWireStalePreviewFix", "_wvTeardownStalePreviewFix", "_wvStalePreviewNeeded"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane;
        PA = await wvT.createItem("journalArticle", { title: "WVSTALE A" });
        // B's long abstract keeps its Attachments section out of view.
        PB = await wvT.createItem("journalArticle", { title: "WVSTALE B", abstractNote: Array.from({ length: 150 }, (_, i) => "WVSTALE line " + i + ".").join("\n") });
        A = await wvT.createTestPDFItem("wvstale-a", { parentItemID: PA.id });
        B = await wvT.createTestPDFItem("wvstale-b", { parentItemID: PB.id });
        N = new Zotero.Item("note");
        N.libraryID = Zotero.Libraries.userLibraryID;
        N.setNote("<p>WVSTALE standalone note</p>");
        await N.saveTx();
        det = doc.querySelector("#zotero-item-pane item-details");
        box = det && det.querySelector("attachments-box");
        assert.isOk(box, "the library item pane's Attachments section");
    });

    after(async function () {
        try { wv._wvWireStalePreviewFix(win); } catch (e) {}
        await wvT.erase(PA, PB, N);
    });

    const select = async (P) => {
        await ZP.selectItems([P.id]);
        return wvT.waitFor(() => (box._item && box._item.id === P.id) || null, 10000);
    };
    const showAttachments = () => { try { det.scrollToPane("attachments", "instant"); } catch (e) {} };
    const pv = () => box._preview;
    const shows = (att) => { const p = pv(); return !!p && p.dataset.previewStatus === "success" && p._lastRenderID === att.id; };
    const opacity = (el) => win.getComputedStyle(el).opacity;
    const rows = () => [...box.querySelectorAll("attachment-row")];
    const stale = (el) => el.hasAttribute("wv-stale");

    /** A selected with its preview loaded, then B with its section out of
     *  view: the state Zotero leaves (A's preview and row in B's section). */
    const toStaleState = async () => {
        assert.isOk(await select(PA), "A selected");
        showAttachments();
        assert.isOk(await wvT.waitFor(() => (shows(A) && opacity(pv()) === "1") || null, 20000), "A's preview loaded and shown");
        assert.isOk(await select(PB), "B selected");
        assert.isFalse(det.isPaneVisible("attachments"), "B's section is out of view (its long abstract)");
        assert.isTrue(shows(A), "Zotero kept A's preview, status success, in B's section (the upstream state)");
        assert.isOk(rows().length && rows().every(r => r.attachment && r.attachment.id === A.id), "and A's row");
    };

    const ip = () => doc.getElementById("zotero-item-pane");
    /** A with its preview shown, the note, then `P`: the state the moment
     *  the item pane is back on the item view (before Zotero renders `P` --
     *  coming from a note it waits for an idle callback first), and every
     *  preview status change on the way. */
    const viaNote = async (P) => {
        assert.isOk(await select(PA), "A selected");
        showAttachments();
        assert.isOk(await wvT.waitFor(() => (shows(A) && opacity(pv()) === "1") || null, 20000), "A's preview shown");
        await ZP.selectItems([N.id]);
        assert.isOk(await wvT.waitFor(() => ip().mode === "note" || null, 5000), "the note editor");
        const p = pv();
        let at = null;
        const statuses = [];
        // Registered after the plugin's observer: it sees what that leaves.
        const mo = new win.MutationObserver(() => {
            if (at || ip().getAttribute("view-type") !== "item") return;
            at = { next: ip().data[0].id, boxItem: box.item.id, shown: p._lastRenderID, status: p.dataset.previewStatus, stale: stale(p), opacity: opacity(p) };
        });
        mo.observe(ip(), { attributes: true, attributeFilter: ["view-type"] });
        const mo2 = new win.MutationObserver(() => statuses.push(p.dataset.previewStatus));
        mo2.observe(p, { attributes: true, attributeFilter: ["data-preview-status"] });
        try {
            assert.isOk(await select(P), "then the item");
            await wvT.sleep(400);
        }
        finally { mo.disconnect(); mo2.disconnect(); }
        assert.isOk(at, "the item pane went back to the item view");
        return { at, statuses };
    };

    it("Zotero's sync render still leaves the preview alone (the workaround installs only while it does)", function () {
        assert.isTrue(wv._wvStalePreviewNeeded(box), "11.0's AttachmentsBox.render() only sets _renderStage and the count");
    });

    it("out of view, the previous item's preview and rows are hidden at once; back on that item they show at once, unreloaded", async function () {
        await toStaleState();
        assert.isOk(await wvT.waitFor(() => stale(pv()) || null, 3000), "A's preview is marked stale in B's section");
        assert.strictEqual(opacity(pv()), "0", "and not drawn");
        assert.strictEqual(pv().dataset.previewStatus, "success", "its status left alone");
        assert.isTrue(rows().every(r => stale(r) && win.getComputedStyle(r).visibility === "hidden"), "A's row hidden too");
        assert.isOk(await select(PA), "back to A");
        assert.isFalse(stale(pv()), "A's preview is A's again");
        assert.isTrue(shows(A), "still loaded: no reload");
        assert.isTrue(rows().every(r => !stale(r)), "A's row shown again");
        // B for real: its own preview replaces A's, unmarked.
        assert.isOk(await select(PB), "B again");
        showAttachments();
        assert.isOk(await wvT.waitFor(() => (shows(B) && opacity(pv()) === "1") || null, 20000), "B's preview loads and shows");
        assert.isFalse(stale(pv()), "unmarked");
        assert.isOk(rows().length && rows().every(r => r.attachment.id === B.id && !stale(r)), "B's row, shown");
    });

    it("back from a note, the previous item's preview is hidden from the first frame, before Zotero renders the next item", async function () {
        const r = await viaNote(PB);
        assert.strictEqual(r.at.next, PB.id, "Zotero already holds B as the item to show");
        assert.strictEqual(r.at.boxItem, PA.id, "while the pane still holds A");
        assert.isTrue(r.at.shown === A.id && r.at.status === "success", "and A's loaded preview");
        assert.isTrue(r.at.stale, "which is hidden at once");
        assert.strictEqual(r.at.opacity, "0");
    });

    it("back from a note to the same item, its preview shows at once, unreloaded", async function () {
        const r = await viaNote(PA);
        assert.strictEqual(r.at.next, PA.id);
        assert.isFalse(r.at.stale, "nothing hidden at the switch");
        assert.strictEqual(r.at.opacity, "1");
        assert.deepEqual(r.statuses, [], "no status change: not reloaded");
        assert.isTrue(shows(A) && !stale(pv()), "A's preview, shown");
    });

    it("the teardown takes every mark and layer away (the old preview shows again), the wiring puts them back", async function () {
        await toStaleState();
        assert.isOk(await wvT.waitFor(() => stale(pv()) || null, 3000), "marked");
        wv._wvTeardownStalePreviewFix();
        try {
            assert.deepEqual(wvT.lib().wvWrapLayers(box, "render"), [], "no layer left on render()");
            // The preview's status setter keeps its other layers (the late
            // fit's, WV-TEMP-134490 since dev.158): only REG41's goes.
            assert.notInclude(wvT.lib().wvWrapLayers(pv(), "setPreviewStatus").map(l => l.layer), "stale41", "nor on the preview");
            const apv = det.querySelector("attachment-box")._preview;
            if (apv) assert.notInclude(wvT.lib().wvWrapLayers(apv, "setPreviewStatus").map(l => l.layer), "stale41", "nor on the attachment pane's preview");
            assert.isFalse(stale(pv()), "the mark is gone");
            assert.isOk(await wvT.waitFor(() => opacity(pv()) === "1" || null, 3000), "A's preview is drawn in B's section again -- Zotero's own state, the bug the spec sees");
            const r = await viaNote(PB);
            assert.isFalse(r.at.stale, "back from a note too: A's preview is drawn at the switch -- the view observer is gone");
            assert.strictEqual(r.at.opacity, "1");
        }
        finally { wv._wvWireStalePreviewFix(win); }
        assert.isOk(await wvT.waitFor(() => stale(pv()) || null, 3000), "wired again, marked again");
        assert.strictEqual(opacity(pv()), "0");
    });

    // Third path (MJT 2026-11-03, "If I go from an image attachment to a
    // note and then a PDF attachment, the image preview flickers before
    // showing the PDF attachment preview. Can you fix?"): the attachment
    // pane -- the Attachment Info pane an attachment item is shown in, with
    // a preview of its own -- back from a note still shows the previous
    // attachment's page until Zotero's idle callback renders the next one.
    // The same view-switch check, against the attachment about to be
    // shown; back to the same attachment nothing is hidden. FAILED on dev.163.
    it("the attachment pane: from one attachment through a note to another, the first's preview is hidden from the first frame; back to the same one, shown at once", async function () {
        const abox = det.querySelector("attachment-box");
        assert.isOk(abox, "the library item pane's attachment pane");
        const apv = () => abox._preview;
        const ashows = (att) => { const p = apv(); return !!p && p.dataset.previewStatus === "success" && p._lastRenderID === att.id; };
        const selectAtt = async (att) => { await ZP.selectItems([att.id]); return wvT.waitFor(() => (abox._item && abox._item.id === att.id) || null, 10000); };
        const via = async (to) => {
            assert.isOk(await selectAtt(A), "A, the attachment itself, selected");
            assert.isOk(await wvT.waitFor(() => (ashows(A) && opacity(apv()) === "1") || null, 20000), "A's preview shown in the attachment pane");
            await ZP.selectItems([N.id]);
            assert.isOk(await wvT.waitFor(() => ip().mode === "note" || null, 5000), "the note editor");
            const p = apv();
            let at = null;
            const mo = new win.MutationObserver(() => {
                if (at || ip().getAttribute("view-type") !== "item") return;
                at = { next: ip().data[0].id, shown: p._lastRenderID, status: p.dataset.previewStatus, stale: stale(p), opacity: opacity(p) };
            });
            mo.observe(ip(), { attributes: true, attributeFilter: ["view-type"] });
            try {
                assert.isOk(await selectAtt(to), "then the attachment");
                await wvT.sleep(400);
            }
            finally { mo.disconnect(); }
            assert.isOk(at, "the item pane went back to the item view");
            return at;
        };
        assert.isTrue(wv._wvStalePaneNeeded(win), "11.0's renderItemPane still waits on an idle callback after a note");
        const at = await via(B);
        assert.include(wvT.lib().wvWrapLayers(apv(), "setPreviewStatus").map(l => l.layer), "stale41", "the pane's preview status setter wrapped at the switch");
        assert.strictEqual(at.next, B.id, "Zotero already holds B as the item to show");
        assert.isTrue(at.shown === A.id && at.status === "success", "while the pane's preview is still A's, loaded");
        assert.isTrue(at.stale, "which is hidden at once");
        assert.strictEqual(at.opacity, "0");
        assert.isOk(await wvT.waitFor(() => (ashows(B) && !stale(apv()) && opacity(apv()) === "1") || null, 20000), "B's preview loads and shows, unmarked");
        const back = await via(A);
        assert.strictEqual(back.next, A.id);
        assert.isFalse(back.stale, "back to A: nothing hidden at the switch");
        assert.strictEqual(back.opacity, "1");
    });

    it("a reader tab's context pane gets it too", async function () {
        const reader = await wvT.openReaderTab(A.id);
        try {
            const cd = await wvT.waitFor(() => doc.getElementById(reader.tabID + "-context"), 15000);
            const cbox = cd && cd.querySelector("attachments-box");
            assert.isOk(cbox, "the tab's Attachments section");
            const layers = await wvT.waitFor(() => { const l = wvT.lib().wvWrapLayers(cbox, "render"); return l.length ? l : null; }, 5000);
            assert.deepEqual((layers || []).map(l => l.layer), ["stale41"]);
        }
        finally { wvT.closeReaderTab(reader); }
    });
});
