/* global describe, it, before, after, expect, Zotero, Components */

// Reader annotation-filter regression suite — encodes the 2026-07-26 incident:
// the reader bundled with Zotero 10.0-beta.16 (reader submodule bumps of
// July 14/20) REMOVED the `hiddenIDs` field from the annotation-manager's
// setFilter — it is still stored but never applied — so every Weavero filter
// dimension routed through it (type include/exclude, colour/tag excludes,
// has-comment/related/link, added/modified-by) silently stopped hiding
// anything, while native colour/tag/author includes kept working. Reported by
// a user on the forums (thread 122030-adjacent, comment 516063).
//
// These tests assert the USER-VISIBLE contract at the reader's own visibility
// model (annotation absent OR carrying the manager's hidden flag == will not
// render in sidebar or view), NOT any particular plumbing — so they hold
// regardless of which channel the plugin uses to hide.

describe("Weavero — reader annotation filter hides annotations", function () {
    this.timeout(120000);

    let win = null;
    let p = null;
    let att = null;          // fixture PDF attachment
    let annHl1 = null;       // highlight, yellow
    let annHl2 = null;       // highlight, red
    let annNote = null;      // note
    let reader = null;

    const sleep = ms => new Promise(r => win.setTimeout(r, ms));

    async function waitFor(cb, timeout = 15000, interval = 150) {
        const start = Date.now();
        for (;;) {
            let v = null;
            try { v = cb(); } catch (e) {}
            if (v) return v;
            if (Date.now() - start > timeout) return null;
            await sleep(interval);
        }
    }

    // Same correct-xref one-page PDF as tearoff.spec.js.
    function minimalPDFBytes() {
        const objs = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n",
        ];
        const header = "%PDF-1.4\n";
        let body = header;
        const offsets = [];
        for (const o of objs) { offsets.push(body.length); body += o; }
        const xrefPos = body.length;
        let xref = "xref\n0 4\n0000000000 65535 f \n";
        for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
        const trailer = "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
        return body + xref + trailer;
    }

    // Upstream support.js createAnnotation pattern, pinned to page 0 (the
    // fixture PDF's only page).
    async function createAnnotation(type, parent, opts) {
        opts = opts || {};
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = parent.libraryID;
        a.parentID = parent.id;
        a.annotationType = type;
        if (type === "highlight") a.annotationText = Zotero.Utilities.randomString();
        a.annotationComment = opts.comment !== undefined ? opts.comment : "";
        a.annotationColor = opts.color || "#ffd400";
        a.annotationPageLabel = "1";
        a.annotationSortIndex = "00000|000000|00000";
        a.annotationPosition = JSON.stringify({
            pageIndex: 0,
            rects: [[10, 10, 60, 20]],
        });
        await a.saveTx();
        return a;
    }

    // The reader's own visibility model: an annotation will render (sidebar
    // AND view) iff it is present in the manager's list and not flagged
    // hidden. Waive Xrays — the manager holds plain content-side objects.
    function visibleKeys() {
        const am = reader && reader._internalReader
            && reader._internalReader._annotationManager;
        if (!am) return null;
        const w = Components.utils.waiveXrays(am);
        const anns = w._annotations || [];
        return anns.filter(a => !a._hidden).map(a => String(a.id));
    }

    async function applyAndSettle(mutate) {
        const st = p._wvReaderFilterState(reader);
        mutate(st);
        await p._wvApplyReaderFilter(reader);
        await sleep(400);   // let the manager render pass settle
    }

    before(async function () {
        win = Zotero.getMainWindow();
        p = await waitFor(() => Zotero.Weavero && Zotero.Weavero.plugin, 20000);
        expect(p, "Weavero plugin not initialized").to.exist;

        const path = PathUtils.join(PathUtils.tempDir, "wv-filter-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, minimalPDFBytes());
        att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path) });
        annHl1 = await createAnnotation("highlight", att, { color: "#ffd400" });
        annHl2 = await createAnnotation("highlight", att, { color: "#ff6666" });
        annNote = await createAnnotation("note", att, { comment: "a note" });

        await Zotero.Reader.open(att.id, null, { allowDuplicate: false });
        reader = await waitFor(() => {
            const r = (Zotero.Reader._readers || []).find(x => {
                try { return x.itemID === att.id && x._internalReader && x._iframeWindow; } catch (e) { return false; }
            });
            return r || null;
        });
        expect(reader, "reader never became ready").to.exist;
        // All three fixture annotations must be in the manager before testing.
        const loaded = await waitFor(() => {
            const k = visibleKeys();
            return k && k.length === 3 ? k : null;
        });
        expect(loaded, "3 fixture annotations never appeared in the reader").to.exist;
    });

    after(async function () {
        try { win.Zotero_Tabs.close(reader && reader.tabID); } catch (e) {}
        try { if (att) await att.eraseTx(); } catch (e) {}
    });

    it("type INCLUDE hides non-matching annotations in the reader", async function () {
        await applyAndSettle(st => { st.types = ["highlight"]; st.typesExcl = []; });
        const vis = visibleKeys();
        expect(vis, "manager unreachable").to.exist;
        expect(vis.sort()).to.eql([annHl1.key, annHl2.key].sort());
    });

    it("type EXCLUDE hides matching annotations in the reader", async function () {
        await applyAndSettle(st => { st.types = []; st.typesExcl = ["highlight"]; });
        const vis = visibleKeys();
        expect(vis).to.eql([annNote.key]);
    });

    it("colour EXCLUDE (a hiddenIDs-era dimension) hides in the reader", async function () {
        await applyAndSettle(st => {
            st.types = []; st.typesExcl = [];
            st.colorsExcl = ["#ff6666"];
        });
        const vis = visibleKeys();
        expect(vis.sort()).to.eql([annHl1.key, annNote.key].sort());
    });

    it("clearing the filter restores every annotation", async function () {
        await applyAndSettle(st => {
            st.types = []; st.typesExcl = []; st.colorsExcl = [];
        });
        const vis = visibleKeys();
        expect(vis.sort()).to.eql([annHl1.key, annHl2.key, annNote.key].sort());
    });
});
