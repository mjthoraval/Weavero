/* global describe, it, before, after, assert, Zotero, Components, PathUtils, IOUtils */

// Weavero's DOCUMENT LAYER, Phase 1 (2026-11-24; design
// work/doc-layer-design-2026-11-24.md, approved by MJT the same day): one file
// per PDF with Zotero's structure data, `<data dir>/weavero/doc-layer/<lib>/<K>/
// <KEY>.jsonlz4`, holding Weavero's extracted outline (with Zotero's two
// outlines beside it) and the page labels Weavero's rule pl1 would repair --
// stored as EVIDENCE ONLY (MJT: nothing on screen changes because of them).
// Computed in a ChromeWorker of Weavero's own (the outline builder is one
// synchronous call: 0.9 to 5 s on the main thread for the test base's long
// books, the spike of 2026-11-24), right after Weavero's build writes a pack
// and at first need; read back while its stamp (pack, PDF, title + creators,
// the UI word) and its CHAINED fingerprints are the file's and the code's.
//
// Fixture PDFs are written here (Helvetica): a three-page paper under a parent
// item (the outline2 fixture of outline-sdt.spec.js), an eight-page paper whose
// own /PageLabels give page 1 the label "8" (a volume, as the test base's
// 46WIG9CQ) and the others 1030..1036, and a 240-page book (a title page, two
// Contents pages, twelve chapters of six sections, running headers, page
// numbers, a reference list). Zotero builds their packs as when a PDF opens.
// A group made here (a made-up id no group of the profile has: never one of the
// maintainer's real groups) stands for a group the build skips.
//
// FAILS on integ 3903ca56 (no document layer; the outline computed on the main
// thread: the book's first open paused Zotero for the whole computation).

describe("Weavero — the document layer (doc layer Phase 1)", function () {
    this.timeout(900000);
    const Cu = Components.utils;
    const Z = /** @type {any} */ (Zotero);
    const SKIP = "weavero.referencesBuildStructureSkipGroups";
    /** @type {any} */ let wv;
    /** @type {any} */ let L;
    /** @type {any} */ let gen, lab, book, grp, group;
    const made = [];
    const layerFiles = [];
    const stubs = [];
    const stub = (name, fn) => { wv[name] = fn; if (!stubs.includes(name)) stubs.push(name); };
    const unstub = (name) => { delete wv[name]; const i = stubs.indexOf(name); if (i >= 0) stubs.splice(i, 1); };

    // ---- fixture PDFs ---------------------------------------------------------------------

    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const line = (font, x, y, size, text) => "BT /" + font + " " + size + " Tf " + x + " " + y + " Td (" + esc(text) + ") Tj ET\n";
    /** A PDF of the given page contents (F1 Helvetica, F2 Helvetica-Bold); `extra` goes into the catalog. */
    function pdfOf(pages, extra) {
        const objs = [];
        const n = pages.length;
        objs[1] = "<< /Type /Catalog /Pages 2 0 R" + (extra || "") + " >>";
        objs[2] = "<< /Type /Pages /Kids [" + pages.map((_, i) => (5 + 2 * i) + " 0 R").join(" ") + "] /Count " + n + " >>";
        objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
        pages.forEach((c, i) => {
            objs[5 + 2 * i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + 2 * i) + " 0 R >>";
            objs[6 + 2 * i] = "<< /Length " + c.length + " >>\nstream\n" + c + "endstream";
        });
        let body = "%PDF-1.4\n";
        const offs = [];
        for (let i = 1; i < objs.length; i++) { offs[i] = body.length; body += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
        const xref = body.length;
        let x = "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
        for (let i = 1; i < objs.length; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
        return body + x + "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    }
    const BODY = [
        "Drops falling on soft solids spread, splash or bounce depending on the impact speed and the",
        "stiffness of the substrate. We study the first instants of the impact with high-speed imaging",
        "and compare the measured shapes with simulations that resolve the deformation of the solid.",
        "The thin air layer under the drop is also measured with interferometry at high frame rates.",
        "Three regimes are separated by critical velocities that depend on the elastic modulus only.",
    ];
    const para = (y0, n) => { let s = ""; let y = y0; for (let k = 0; k < (n || BODY.length); k++) { s += line("F1", 72, y, 10, BODY[k % BODY.length]); y -= 13; } return s; };
    /** outline-sdt.spec.js's paper: numbered bold headings over paragraphs, three pages. */
    function paperPDF() {
        /** @type {Array<[string, number, number, number]>} */
        const HEADS = [["1. Introduction", 0, 640, 14], ["2. Methods", 0, 520, 14], ["2.1. Experimental set-up", 0, 400, 12],
            ["2.2. Numerical simulations", 1, 720, 12], ["3. Results", 1, 560, 14], ["4. Conclusions", 2, 720, 14], ["References", 2, 560, 14]];
        const pages = ["", "", ""];
        pages[0] += line("F2", 72, 720, 20, "Drop impact on soft solids") + line("F1", 72, 696, 11, "A. Tester and B. Writer");
        for (const [t, p, y, size] of HEADS) {
            pages[p] += line("F2", 72, y, size, t);
            pages[p] += t === "References" ? line("F1", 72, y - 22, 9, "[1] Adams, J. 2016 Drop impact on a heated plate. J. Test Mech. 812, 101-120.") : para(y - 22 + (size === 12 ? 2 : 0));
        }
        return pdfOf(pages);
    }
    /** Eight pages, a heading each; the PDF's own labels: "8" (a volume, as 46WIG9CQ), then 1030..1036. */
    function labelsPDF() {
        const pages = [];
        for (let i = 0; i < 8; i++) pages.push(line("F2", 72, 700, 14, (i + 1) + ". Section " + ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][i]) + para(670));
        return pdfOf(pages, " /PageLabels << /Nums [0 << /P (8) >> 1 << /S /D /St 1030 >>] >>");
    }
    const CHAPTERS = ["Introduction", "Drops at rest", "Spreading on solids", "Splashing", "Bouncing drops", "Soft substrates", "Air films",
        "Heated plates", "Bubbles", "Thin films", "Numerical methods", "Conclusions and outlook"];
    const SECTIONS = ["Background", "Scaling laws", "Experiments", "Simulations", "Discussion", "Open questions"];
    /** A book of `n` pages: title, two Contents pages, 12 chapters x 6 sections, running headers, page numbers, references. */
    function bookPDF(n) {
        const pages = new Array(n).fill("");
        const first = 3, refs = n - 3, per = Math.floor((refs - first) / CHAPTERS.length);
        const toc = [];
        const heads = new Map();
        CHAPTERS.forEach((c, ci) => {
            const start = first + ci * per;
            toc.push(["Chapter " + (ci + 1) + "  " + c, start]);
            heads.set(start, [["F2", 22, "Chapter " + (ci + 1)], ["F2", 20, c]]);
            SECTIONS.forEach((s, si) => {
                const p = start + 1 + Math.floor(si * (per - 1) / SECTIONS.length);
                toc.push([(ci + 1) + "." + (si + 1) + "  " + s, p]);
                const h = heads.get(p) || [];
                h.push(["F2", 13, (ci + 1) + "." + (si + 1) + " " + s]);
                heads.set(p, h);
            });
        });
        toc.push(["References", refs]);
        pages[0] = line("F2", 72, 600, 26, "Drops, Bubbles and Films") + line("F1", 72, 560, 14, "A. Tester");
        for (let k = 0; k < 2; k++) {
            let s = k === 0 ? line("F2", 72, 720, 20, "Contents") : "";
            let y = 690;
            for (const [t, p] of toc.slice(k * 44, (k + 1) * 44)) { s += line("F1", 72, y, 10, t + " . . . . . . . . " + (p + 1)); y -= 15; }
            pages[1 + k] = s;
        }
        for (let p = first; p < n; p++) {
            let s = line("F1", 200, 760, 9, "DROPS, BUBBLES AND FILMS") + line("F1", 300, 40, 9, String(p + 1));
            let y = 720;
            if (p >= refs) {
                if (p === refs) { s += line("F2", 72, y, 16, "References"); y -= 30; }
                for (let r = 0; r < 30; r++) { s += line("F1", 72, y, 9, "[" + ((p - refs) * 30 + r + 1) + "] Author, A. B. " + (1950 + r) + " A study of drops number " + r + ". J. Fluid Mech. " + (100 + r) + ", " + (r * 7 + 1) + "-" + (r * 7 + 20) + "."); y -= 20; }
                pages[p] = s;
                continue;
            }
            for (const [f, size, t] of heads.get(p) || []) { s += line(f, 72, y, size, t); y -= size + 16; }
            while (y > 120) { s += para(y, 6); y -= 6 * 13 + 14; }
            pages[p] = s;
        }
        return pdfOf(pages);
    }

    async function importPDF(name, text, parent) {
        const path = PathUtils.join(PathUtils.tempDir, name + "-" + Date.now() + ".pdf");
        await IOUtils.writeUTF8(path, text);
        const opts = { file: Zotero.File.pathToFile(path) };
        if (parent && parent.libraryID) opts.libraryID = parent.libraryID;
        if (parent && parent.id) opts.parentItemID = parent.id;
        const att = await Zotero.Attachments.importFromFile(opts);
        try { await IOUtils.remove(path); } catch (e) {}
        made.push(att);
        return att;
    }
    async function parentOf(title, libraryID) {
        const p = new Zotero.Item("journalArticle");
        if (libraryID) p.libraryID = libraryID;
        p.setField("title", title);
        p.setCreators([{ firstName: "A.", lastName: "Tester", creatorType: "author" }, { firstName: "B.", lastName: "Writer", creatorType: "author" }]);
        await p.saveTx();
        made.push(p);
        return p;
    }
    const packOf = (att) => PathUtils.join(Zotero.Attachments.getStorageDirectory(att).path, ".zotero-sdt-cache");
    const layerDir = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "doc-layer");
    const layerOf = (att) => {
        const seg = wv._wvDlLibSeg(att.libraryID);
        const p = PathUtils.join(layerDir(), seg, att.key.charAt(0), att.key + ".jsonlz4");
        if (!layerFiles.includes(p)) layerFiles.push(p);
        return p;
    };
    const readLayer = async (att) => JSON.parse(await IOUtils.readUTF8(layerOf(att), { decompress: true }));
    const dropLayer = async (att) => { await L.wvStoreChain(layerOf(att)); await IOUtils.remove(layerOf(att), { ignoreAbsent: true, recursive: true }); };
    async function buildPack(att) {
        const r = await Z.SDT.getPack(att.id, { isPriority: true });
        assert.ok(r && r.ok, "Zotero built the pack of " + att.id);
    }
    /** `_wvDlCompute` counted: [{want}] per call. */
    function countComputes() {
        const calls = [];
        const proto = Object.getPrototypeOf(wv);
        stub("_wvDlCompute", function (packPath, input) { calls.push({ want: input.want.slice() }); return proto._wvDlCompute.apply(this, arguments); });
        return calls;
    }
    /** The direct computation, on this thread: what the outline was before the layer. */
    async function direct(att) {
        const rd = await L.wvSdtOpen(await IOUtils.read(packOf(att)));
        return L.wvOutlineFromSdt(rd, wv._wvOutlineSdtMeta(att));
    }
    /** The longest gap between two ticks of a 1-ms timer chain while `fn` runs (ms). */
    async function longestPause(fn) {
        try { Cu.forceGC(); Cu.forceCC(); } catch (e) {}
        await wvT.sleep(50);
        let last = performance.now(), max = 0, stop = false;
        const tick = () => { if (stop) return; const t = performance.now(); max = Math.max(max, t - last); last = t; setTimeout(tick, 1); };
        setTimeout(tick, 1);
        const t0 = performance.now();
        let r;
        try { r = await fn(); }
        finally { stop = true; }
        const t1 = performance.now();
        return { r, ms: Math.round(t1 - t0), max: Math.round(Math.max(max, t1 - last)) };
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvDlGet", "_wvDlCompute", "_wvDlFps", "_wvDlState", "_wvDlPath", "_wvDlLibSeg", "_wvDlSkipped", "_wvDlWorker", "_wvDlWorkerRun",
            "_wvDlAfterBuild", "_wvDlReset", "_wvDlOutline", "_wvOutlineSdtRead", "_wvOutlineSdtMeta", "_wvBmPageLabelFor"]) wvT.method(m);
        for (const f of ["wvDlFlatten", "wvDlUnflatten", "wvDlStale", "wvDlChainFps", "wvDlPageLabels", "wvDlLabelRepairs", "wvDlAssemble", "wvDlMetaSig"]) {
            if (!L || typeof L[f] !== "function") wvT.absent("lib." + f);
        }
        assert.ok(Z.SDT && typeof Z.SDT.getPack === "function", "Zotero.SDT.getPack (Zotero 11, 10.0.8)");
        assert.isNotOk(Zotero.Users.getCurrentUsername(), "the throwaway profile is linked to no Zotero account: nothing made here syncs");
        gen = await importPDF("wv-dl-gen", paperPDF(), await parentOf("Drop impact on soft solids"));
        lab = await importPDF("wv-dl-lab", labelsPDF());
        book = await importPDF("wv-dl-book", bookPDF(240), await parentOf("Drops, Bubbles and Films"));
        for (const a of [gen, lab, book]) await buildPack(a);
        // A group (a local one made here; never synced) for the skip list. Its made-up
        // id is none of the profile's groups: never one of the maintainer's real groups.
        if (!Zotero.Users.getCurrentUserID()) await Zotero.Users.setCurrentUserID(1);
        if (!Zotero.Users.getName(Zotero.Users.getCurrentUserID())) await Zotero.Users.setName(Zotero.Users.getCurrentUserID(), "Name");
        const gid = Zotero.Utilities.rand(10000, 1000000);
        assert.isNotOk(Zotero.Groups.getLibraryIDFromGroupID(gid), "no group " + gid + " in the throwaway profile");
        group = new Zotero.Group();
        Object.assign(group, { id: gid, name: "wv-doclayer-group", description: "",
            editable: true, filesEditable: true, version: Zotero.Utilities.rand(1000, 10000), archived: false });
        await group.saveTx();
        grp = await importPDF("wv-dl-grp", paperPDF(), await parentOf("Drop impact on soft solids", group.libraryID));
        await buildPack(grp);
        for (const a of [gen, lab, book, grp]) await dropLayer(a);
    });

    after(async function () {
        for (const s of stubs.slice()) unstub(s);
        try { if (Zotero.Prefs.get(SKIP) !== undefined) Zotero.Prefs.set(SKIP, ""); } catch (e) {}
        for (const p of layerFiles) { try { await L.wvStoreChain(p); await IOUtils.remove(p, { ignoreAbsent: true, recursive: true }); } catch (e) {} }
        await wvT.erase(...made.slice().reverse());
        try { if (group) await group.eraseTx(); } catch (e) {}
    });

    // ---- the file (pure) ------------------------------------------------------------------

    it("the schema: an outline flat and back is the same tree, every field kept; a file round-trips through JSON and reads fresh", function () {
        const box = (y) => ({ pageIndex: 2, rects: [[72.5, y, 301.25, y + 14.125]] });
        const tree = [
            { title: "1. Introduction", url: null, position: box(600), href: null, items: [
                { title: "1.1 Scope", url: null, position: box(500), href: null, items: [{ title: "deep", url: null, position: null, href: null, items: [] }] }] },
            { title: "Online", url: "https://example.com/x", position: null, href: null, items: [] },
            { title: "Extra", url: null, position: { pageIndex: 0, rects: [[1, 2, 3, 4]], note: "kept" }, href: "a.xhtml#b", items: [], synth: "references" },
        ];
        const flat = L.wvDlFlatten(tree);
        assert.deepEqual(flat.map(e => [e.t, e.l]), [["1. Introduction", 1], ["1.1 Scope", 2], ["deep", 3], ["Online", 1], ["Extra", 1]]);
        assert.deepEqual(L.wvDlUnflatten(JSON.parse(JSON.stringify(flat))), tree, "the same tree back, through JSON");
        const now = { pack: { size: 10, mtime: 20 }, pdf: { size: 30, mtime: 40 }, format: { pack: 1, schema: "1.2.0" }, meta: "m", lang: "References", fp: L.wvDlChainFps({ pl: "a", ol: "b" }) };
        const doc = L.wvDlAssemble(null, { pack: { packVersion: 1, schema: "1.2.0", processor: 15, hash: "h" }, pageLabels: { same: true }, outline: { entries: flat, zotero: [], embedded: [], notes: [] } },
            { doc: { lib: "u", key: "ABCD2345", att: 1 }, src: { pack: { size: 10, mtime: 20, packVersion: 1, schema: "1.2.0", processor: 15 }, pdf: { hash: "h", size: 30, mtime: 40 }, meta: "m", lang: "References" }, fp: now.fp, by: "x", trigger: "open" });
        const back = JSON.parse(JSON.stringify(doc));
        assert.deepEqual(back, doc);
        assert.equal(back.format, "weavero-doc-layer");
        assert.equal(back.v, L.WV_DL_V);
        assert.deepEqual(L.wvDlStale(back, now), [], "fresh");
        // Unknown fields are harmless.
        assert.deepEqual(L.wvDlStale(Object.assign({}, back, { future: { x: 1 } }), now), []);
        // A file of a newer Weavero (or an older one): stale, every component again (MJT: downgrades recompute too).
        assert.deepEqual(L.wvDlStale(Object.assign({}, back, { v: L.WV_DL_V + 1 }), now), ["pl", "ol"]);
        assert.deepEqual(L.wvDlStale(Object.assign({}, back, { v: L.WV_DL_V - 1 }), now), ["pl", "ol"]);
        assert.deepEqual(L.wvDlStale(null, now), ["pl", "ol"]);
        assert.deepEqual(L.wvDlStale({ format: "other" }, now), ["pl", "ol"]);
    });

    it("chained fingerprints: a page-label or spacing rule change moves the outline's; an outline rule change leaves the labels' alone", function () {
        const a = L.wvDlChainFps({ q: "", tx: "", pl: "P", ol: "O" });
        for (const c of ["q", "tx", "pl", "ol"]) assert.match(a[c], new RegExp("^" + c + ":"), c);
        const olOnly = L.wvDlChainFps({ q: "", tx: "", pl: "P", ol: "O2" });
        assert.equal(olOnly.pl, a.pl, "an outline change: the labels' fingerprint as it was");
        assert.notEqual(olOnly.ol, a.ol);
        const plCh = L.wvDlChainFps({ q: "", tx: "", pl: "P2", ol: "O" });
        assert.notEqual(plCh.pl, a.pl);
        assert.notEqual(plCh.ol, a.ol, "a labels change moves the outline (rule 18 reads labels)");
        const txCh = L.wvDlChainFps({ q: "", tx: "T", pl: "P", ol: "O" });
        assert.equal(txCh.pl, a.pl);
        assert.notEqual(txCh.ol, a.ol, "a spacing change moves the outline");
        const qCh = L.wvDlChainFps({ q: "Q", tx: "", pl: "P", ol: "O" });
        assert.notEqual(qCh.tx, a.tx, "quality feeds spacing");
        assert.notEqual(qCh.ol, a.ol, "...and so the outline");
        assert.deepEqual(L.wvDlChainFps({ q: "", tx: "", pl: "P", ol: "O" }), a, "deterministic");
    });

    it("staleness: pack or PDF changed -> everything; title, creators or the UI word -> the outline; a moved fingerprint -> its part", function () {
        const fp = L.wvDlChainFps({ pl: "P", ol: "O" });
        const now = { pack: { size: 10, mtime: 20 }, pdf: { size: 30, mtime: 40 }, format: { pack: 1, schema: "1.2.0" }, meta: "m", lang: "References", fp };
        const doc = { format: "weavero-doc-layer", v: L.WV_DL_V, src: { pack: { size: 10, mtime: 20, packVersion: 1, schema: "1.2.0" }, pdf: { size: 30, mtime: 40 }, meta: "m", lang: "References" },
            fp: { pl: fp.pl, ol: fp.ol }, pageLabels: { same: true }, outline: { entries: [], zotero: [], embedded: [] } };
        const at = (o) => L.wvDlStale(doc, Object.assign({}, now, o));
        assert.deepEqual(at({}), []);
        assert.deepEqual(at({ pack: { size: 10, mtime: 21 } }), ["pl", "ol"], "Zotero rebuilt the pack");
        assert.deepEqual(at({ pack: { size: 11, mtime: 20 } }), ["pl", "ol"]);
        assert.deepEqual(at({ pdf: { size: 30, mtime: 41 } }), ["pl", "ol"], "a synced re-download / a new file");
        assert.deepEqual(at({ format: { pack: 2, schema: "1.2.0" } }), ["pl", "ol"], "a pack format this Zotero does not write");
        assert.deepEqual(at({ format: { pack: 1, schema: "2.0.0" } }), ["pl", "ol"]);
        assert.deepEqual(at({ format: { pack: 1, schema: "1.3.0" } }), [], "a schema minor: the same pack still describes the file");
        assert.deepEqual(at({ meta: "edited" }), ["ol"], "a title or creator edit: the outline only");
        assert.deepEqual(at({ lang: "Références" }), ["ol"], "rule 16's word in another UI language");
        assert.deepEqual(at({ fp: L.wvDlChainFps({ pl: "P", ol: "O2" }) }), ["ol"], "an outline rule change: the outline only");
        assert.deepEqual(at({ fp: L.wvDlChainFps({ pl: "P2", ol: "O" }) }), ["pl", "ol"], "a labels rule change: both (chained)");
        assert.deepEqual(L.wvDlStale(Object.assign({}, doc, { outline: undefined }), now), ["ol"], "a part missing");
    });

    it("rule pl1: a volume on page 1, a year or an ISBN piece on the last page go back on the document's offset; covers, Roman front matter and too few numbers are left alone", function () {
        const R = (labels) => L.wvDlLabelRepairs(labels);
        assert.deepEqual(R(["8", "1030", "1031", "1032", "1033", "1034", "1035", "1036"]), [{ i: 0, to: "1029", was: "8", pv: "pl1" }], "46WIG9CQ: the volume");
        assert.deepEqual(R(["101", "102", "103", "104", "105", "2024"]), [{ i: 5, to: "106", was: "2024", pv: "pl1" }], "a year on the last page");
        assert.deepEqual(R(["-", "2", "3", "4", "5", "6"]), [], "a cover's '-' is not a number");
        assert.deepEqual(R(["i", "ii", "iii", "1", "2", "3", "4", "5"]), [], "Roman front matter, then 1..5 on one offset");
        assert.deepEqual(R(["5", "2", "3", "4", "5", "6"]), [{ i: 0, to: "1", was: "5", pv: "pl1" }], "page 1 back on the offset");
        assert.deepEqual(R(["9", "1", "2", "3", "4", "5"]), [], "a repair that would label a page 0 is not made");
        assert.deepEqual(R(["7", "8"]), [], "fewer than 3 numbers");
        assert.deepEqual(R(["1", "2", "9", "10", "11", "12"]), [], "no offset holds 80 % of the numbers");
        assert.deepEqual(R(["21", "1048", "1049", "1050", "1051", "1052", "1053", "1054", "1055", "1056"]), [{ i: 0, to: "1047", was: "21", pv: "pl1" }], "5XHMXMSG: page 1 labelled 21");
        assert.deepEqual(R(["1", "2", "3", "77", "5", "6", "7", "8"]), [], "a middle page is never touched");
        assert.deepEqual(L.wvDlPageLabels([{ label: "1" }, { label: "2" }, { label: "3" }]), { same: true });
        assert.deepEqual(L.wvDlPageLabels([{ label: "8" }, { label: "1030" }, { label: "1031" }, { label: "1032" }]), { same: true }, "3 of 4 on one offset: under 80 %");
        assert.deepEqual(L.wvDlPageLabels([{ label: "8" }, { label: "1030" }, { label: "1031" }, { label: "1032" }, { label: "1033" }]), { changes: [{ i: 0, to: "1029", was: "8", pv: "pl1" }] });
    });

    // ---- the layer of a PDF (in Zotero) ---------------------------------------------------

    it("first need computes the layer in the worker and saves it at doc-layer/u/<K>/<KEY>.jsonlz4; a reopen reads the file -- the pack is not computed again", async function () {
        await dropLayer(gen);
        const calls = countComputes();
        try {
            const r1 = await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.ok(r1, "a layer");
            assert.equal(r1.from, "computed");
            assert.equal(r1.how, "worker", "computed in the layer's worker, off the main thread");
            assert.isTrue(r1.saved);
            await L.wvStoreChain(layerOf(gen));
            assert.equal(layerOf(gen), PathUtils.join(Zotero.DataDirectory.dir, "weavero", "doc-layer", "u", gen.key.charAt(0), gen.key + ".jsonlz4"));
            const f = await readLayer(gen);
            assert.equal(f.format, "weavero-doc-layer");
            assert.equal(f.v, L.WV_DL_V);
            assert.deepEqual(f.doc, { lib: "u", key: gen.key, att: gen.id });
            const st = await IOUtils.stat(packOf(gen)), ps = await IOUtils.stat(await gen.getFilePathAsync());
            assert.deepInclude(f.src.pack, { size: st.size, mtime: st.lastModified });
            assert.deepInclude(f.src.pdf, { hash: await gen.attachmentHash, size: ps.size, mtime: ps.lastModified });
            assert.isNumber(f.src.pack.packVersion);
            assert.isString(f.src.pack.schema);
            assert.equal(f.src.meta, L.wvDlMetaSig(wv._wvOutlineSdtMeta(gen)), "the parent's title and creators in the stamp");
            assert.deepEqual(Object.keys(f.fp).sort(), ["ol", "pl", "q", "tx"]);
            assert.deepEqual(f.fp, Object.assign({}, wv._wvDlFps()));
            assert.equal(f.built.trigger, "open");
            assert.equal(f.built.by, wv._version);
            assert.ok(f.outline && f.outline.entries.length, "Weavero's outline");
            assert.ok(f.pageLabels, "the page labels");
            assert.equal(calls.length, 1);
            // A reopen (the reader's memory gone): read from the file.
            const r2 = await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.equal(r2.from, "file");
            assert.equal(calls.length, 1, "not computed again");
            assert.deepEqual(JSON.parse(JSON.stringify(r2.doc)), f);
        }
        finally { unstub("_wvDlCompute"); }
    });

    it("the outline read from the layer is the outline computed directly from the pack (Extracted, Zotero's, the PDF's own)", async function () {
        for (const att of [gen, lab, book]) {
            await dropLayer(att);
            const want = await direct(att);
            await wv._wvDlGet(att, { trigger: "open", allowMain: false });   // computed and saved
            const fromFile = await wv._wvDlGet(att, { trigger: "open", allowMain: false });
            assert.equal(fromFile.from, "file", att.key + ": read back");
            const got = L.wvDlOutlineSdt(fromFile.doc.outline);
            assert.isAbove(want.extracted.length, 0, att.key + ": an outline to compare");
            assert.deepEqual(got.extracted, JSON.parse(JSON.stringify(want.extracted)), att.key + ": Extracted, the same tree");
            assert.deepEqual(got.zotero, JSON.parse(JSON.stringify(want.zotero)), att.key + ": Zotero's");
            assert.deepEqual(got.embedded, JSON.parse(JSON.stringify(want.embedded)), att.key + ": the PDF's own");
            assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), att.key + ": everything the builder gives (notes, flags)");
            // And through the panel's own read (what the Outline panel shows).
            const panel = await wv._wvOutlineSdtRead(att);
            assert.deepEqual(panel.extracted, got.extracted, att.key + ": the panel's Extracted");
        }
    });

    it("a rules change recomputes the parts it touches only: the outline's -> the page labels kept byte for byte; the labels' -> both", async function () {
        await dropLayer(lab);
        await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
        await L.wvStoreChain(layerOf(lab));
        const f0 = await readLayer(lab);
        const real = Object.assign({}, wv._wvDlFps());
        const calls = countComputes();
        try {
            stub("_wvDlFps", () => Object.assign({}, real, { ol: real.ol + "-v2" }));
            let r = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.deepEqual(calls.map(c => c.want), [["ol"]], "the outline alone computed again");
            await L.wvStoreChain(layerOf(lab));
            let f1 = await readLayer(lab);
            assert.equal(JSON.stringify(f1.pageLabels), JSON.stringify(f0.pageLabels), "the labels' bytes as they were");
            assert.equal(f1.fp.pl, f0.fp.pl);
            assert.equal(f1.fp.ol, real.ol + "-v2");
            assert.equal(r.from, "computed");
            // A labels rule change: the chain moves the outline's too (what wvDlChainFps gives).
            stub("_wvDlFps", () => Object.assign({}, real, { pl: real.pl + "-v3", ol: real.ol + "-v3" }));
            calls.length = 0;
            r = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.deepEqual(calls.map(c => c.want), [["pl", "ol"]], "both computed again");
            // Back to this build's code (a downgrade): computed again, not kept.
            unstub("_wvDlFps");
            calls.length = 0;
            r = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.deepEqual(calls.map(c => c.want), [["pl", "ol"]], "a downgrade recomputes");
            calls.length = 0;
            r = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.equal(r.from, "file");
            assert.equal(calls.length, 0);
        }
        finally { unstub("_wvDlFps"); unstub("_wvDlCompute"); }
    });

    it("a title edit recomputes the outline (and only it); a rebuilt pack recomputes that PDF whole", async function () {
        await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
        const parent = gen.parentItem;
        const old = parent.getField("title");
        const calls = countComputes();
        try {
            parent.setField("title", old + " (edited)");
            await parent.saveTx();
            await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.deepEqual(calls.map(c => c.want), [["ol"]], "the outline computed again");
            await L.wvStoreChain(layerOf(gen));
            assert.equal((await readLayer(gen)).src.meta, L.wvDlMetaSig(wv._wvOutlineSdtMeta(gen)), "the new title in the stamp");
            // Zotero rewrites the pack (a rebuild: a new time).
            calls.length = 0;
            await IOUtils.setModificationTime(packOf(gen), Date.now() + 5000);
            const r = await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.deepEqual(calls.map(c => c.want), [["pl", "ol"]], "everything computed again");
            assert.isTrue(r.saved);
            await L.wvStoreChain(layerOf(gen));
            assert.equal((await readLayer(gen)).src.pack.mtime, (await IOUtils.stat(packOf(gen))).lastModified);
        }
        finally {
            unstub("_wvDlCompute");
            parent.setField("title", old);
            await parent.saveTx();
        }
    });

    it("a pack older than its PDF gives no layer; a pack of another file gives none", async function () {
        const pdf = await gen.getFilePathAsync();
        const pack = packOf(gen);
        const saved = await IOUtils.read(pack);
        try {
            await IOUtils.setModificationTime(pdf, Date.now() + 60000);
            assert.isNull(await wv._wvDlGet(gen, { trigger: "open", allowMain: false }), "older than its PDF: not this PDF's");
            await IOUtils.setModificationTime(pdf, Date.now() - 60000);
            await IOUtils.write(pack, await IOUtils.read(packOf(lab)));
            await dropLayer(gen);
            assert.isNull(await wv._wvDlGet(gen, { trigger: "open", allowMain: false }), "another PDF's pack (its hash)");
            assert.isFalse(await IOUtils.exists(layerOf(gen)), "nothing saved");
        }
        finally {
            await IOUtils.write(pack, saved);
            try { await IOUtils.setModificationTime(pdf, Date.now() - 60000); } catch (e) {}
        }
        assert.ok(await wv._wvDlGet(gen, { trigger: "open", allowMain: false }), "its own pack again: a layer");
    });

    it("a corrupt layer file is computed again and overwritten", async function () {
        await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
        await L.wvStoreChain(layerOf(gen));
        const good = await readLayer(gen);
        // Cut short: neither mozlz4 nor JSON.
        const bytes = await IOUtils.read(layerOf(gen));
        await IOUtils.write(layerOf(gen), bytes.slice(0, 20));
        const calls = countComputes();
        try {
            const r = await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.equal(r.from, "computed");
            assert.isTrue(r.saved, "overwritten");
            assert.deepEqual(calls.map(c => c.want), [["pl", "ol"]]);
            await L.wvStoreChain(layerOf(gen));
            const back = await readLayer(gen);
            assert.deepEqual(back.outline, good.outline);
            // Plain garbage too.
            await IOUtils.writeUTF8(layerOf(gen), "{ not json");
            calls.length = 0;
            const r2 = await wv._wvDlGet(gen, { trigger: "open", allowMain: false });
            assert.isTrue(r2.saved);
            assert.equal(calls.length, 1);
        }
        finally { unstub("_wvDlCompute"); }
    });

    it("a layer file that cannot be read (held by another program) is computed in memory and never written again this session: no write loop", async function () {
        await dropLayer(lab);
        // A folder where the file goes: it exists, and neither reads nor decompresses (a lock, as the store tells one).
        await IOUtils.makeDirectory(layerOf(lab), { createAncestors: true, ignoreExisting: true });
        try {
            const r1 = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.ok(r1 && r1.doc && r1.doc.outline, "the layer, in memory");
            assert.isFalse(r1.saved);
            const r2 = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
            assert.isFalse(r2.saved, "not written on the next need either");
            assert.ok(wv._wvDlNoWrite && wv._wvDlNoWrite.has(layerOf(lab)), "remembered for the session");
            assert.equal((await IOUtils.stat(layerOf(lab))).type, "directory", "nothing written over it");
        }
        finally {
            await IOUtils.remove(layerOf(lab), { recursive: true, ignoreAbsent: true });
            try { wv._wvDlNoWrite.delete(layerOf(lab)); } catch (e) {}
        }
    });

    it("two windows opening one PDF at once share one computation", async function () {
        await dropLayer(book);
        const calls = countComputes();
        try {
            const [a, b] = await Promise.all([wv._wvDlGet(book, { trigger: "open", allowMain: false }), wv._wvDlGet(book, { trigger: "open", allowMain: false })]);
            assert.strictEqual(a, b, "one answer for both");
            assert.equal(calls.length, 1, "one computation");
        }
        finally { unstub("_wvDlCompute"); }
    });

    it("Remove Built Data during a computation: it writes nothing; the folder is a cache (never backed up) that the cleaning removes", async function () {
        await dropLayer(gen);
        const p = wv._wvDlGet(gen, { trigger: "open", allowMain: false });
        wv._wvDlReset();
        const r = await p;
        assert.ok(r, "the layer still answers this need");
        assert.isFalse(r.saved, "not written after the cleaning");
        assert.isFalse(await IOUtils.exists(layerOf(gen)));
        assert.equal(L.wvBkClassify("doc-layer/u/A/ABCD2345.jsonlz4"), "cache");
        assert.isTrue(L.wvBkBackedUp ? !L.wvBkBackedUp("doc-layer/u/A/ABCD2345.jsonlz4") : true, "never in a backup");
        assert.include(wv._wvSbCleanStores().map(s => s.rel), "doc-layer", "Remove Built Data removes it (sdt-clean.spec.js runs it)");
    });

    it("a group the structure-data build skips gets no layer file; its outline is still computed (in memory, as before)", async function () {
        const seg = "g" + group.id;
        assert.equal(wv._wvDlLibSeg(grp.libraryID), seg, "a group by its group id");
        const gdir = PathUtils.join(layerDir(), seg);
        await IOUtils.remove(gdir, { recursive: true, ignoreAbsent: true });
        await wvT.withPref(SKIP, "1, " + group.id, async () => {
            assert.isTrue(wv._wvDlSkipped(grp.libraryID));
            const r = await wv._wvDlGet(grp, { trigger: "open", allowMain: false });
            assert.ok(r && r.doc.outline && r.doc.outline.entries.length, "its outline");
            assert.isFalse(r.saved);
            await wv._wvDlAfterBuild(grp.id);
            assert.isFalse(await IOUtils.exists(gdir), "nothing under doc-layer/" + seg);
        });
        await wvT.withPref(SKIP, "", async () => {
            const r = await wv._wvDlGet(grp, { trigger: "open", allowMain: false });
            assert.isTrue(r.saved, "not skipped: saved");
            await L.wvStoreChain(layerOf(grp));
            assert.isTrue(await IOUtils.exists(layerOf(grp)));
            assert.equal(PathUtils.parent(PathUtils.parent(layerOf(grp))), gdir);
        });
        await IOUtils.remove(gdir, { recursive: true, ignoreAbsent: true });
    });

    it("after Weavero's build writes a pack: the layer from the bytes in memory, in the worker (trigger 1); never on the main thread", async function () {
        await dropLayer(lab);
        const bytes = await IOUtils.read(packOf(lab));
        await wv._wvDlAfterBuild(lab.id, bytes.buffer);
        await L.wvStoreChain(layerOf(lab));
        const f = await readLayer(lab);
        assert.equal(f.built.trigger, "build");
        assert.ok(f.outline.entries.length);
        // No worker: the build leaves it for the first need (no main-thread computation).
        await dropLayer(lab);
        stub("_wvDlWorkerRun", async () => ({ ok: false, unavailable: true, error: "stand-in: no worker" }));
        try {
            await wv._wvDlAfterBuild(lab.id);
            assert.isFalse(await IOUtils.exists(layerOf(lab)), "nothing computed on the main thread for the build");
            const r = await wv._wvDlGet(lab, { trigger: "open", allowMain: true });
            assert.equal(r.how, "main", "a first need without a worker: on the main thread, as before the layer");
        }
        finally { unstub("_wvDlWorkerRun"); }
        // The run hands each PDF it built to the layer.
        assert.include(wvT.src("_wvSbRun"), "_wvDlAfterBuild");
    });

    it("page labels: stored with their rule and Zotero's value -- and never shown: the reader's and Weavero's labels stay Zotero's", async function () {
        await dropLayer(lab);
        const r = await wv._wvDlGet(lab, { trigger: "open", allowMain: false });
        assert.deepEqual(JSON.parse(JSON.stringify(r.doc.pageLabels)), { changes: [{ i: 0, to: "1029", was: "8", pv: "pl1" }] }, "the volume on page 1, repaired as evidence");
        const rd = await L.wvSdtOpen(await IOUtils.read(packOf(lab)));
        const cat = await rd.getCatalog();
        assert.deepEqual(cat.pages.map(p => p.label), ["8", "1030", "1031", "1032", "1033", "1034", "1035", "1036"], "Zotero's labels in the pack, untouched");
        const reader = await wvT.openReaderTab(lab.id);
        assert.ok(reader);
        try {
            const ir = Cu.waiveXrays(reader._internalReader);
            const pv = await wvT.waitFor(() => { try { const v = ir._primaryView; return v && Array.isArray(v._pageLabels) && v._pageLabels.length === 8 ? v : null; } catch (e) { return null; } }, 30000);
            assert.ok(pv, "the reader's labels");
            // Zotero 11's reader shows the PDF's own label ("8"); Zotero 10.0.8's
            // reader showed "1" there in the runner (its own label table). Either
            // way it is Zotero's, never the layer's repair.
            await wvT.waitFor(() => pv._pageLabels[0] === "8" || null, 10000);
            const shown = String(pv._pageLabels[0]);
            assert.notEqual(shown, "1029", "the reader never shows the layer's repair");
            if (Zotero.platformMajorVersion >= 153) assert.equal(shown, "8", "Zotero 11: the reader shows the PDF's own label");
            const named = wv._wvBmPageLabelFor({ libraryID: lab.libraryID, itemKey: lab.key }, 0);
            assert.notEqual(named, "1029", "Weavero's bookmarks never take the repair");
            assert.equal(named, shown, "Weavero names page 1 as the reader labels it");
            const ol = await wv._wvReaderFetchOutline(reader);
            assert.notInclude(JSON.stringify(ol), "1029", "nothing of the repair in what the Outline panel gets");
        }
        finally { wvT.closeReaderTab(reader); }
    });

    it("off the main thread: a book's first open never pauses Zotero over 50 ms -- the same outline computed on the main thread does", async function () {
        await wv._wvDlWorker();   // up beforehand: the first worker loads its script on its own thread
        const runs = [];
        for (let k = 0; k < 3; k++) {
            await dropLayer(book);
            const m = await longestPause(() => wv._wvOutlineSdtRead(book));
            assert.ok(m.r && m.r.extracted && m.r.extracted.length, "the book's outline");
            runs.push(m);
            if (m.max < 50) break;
        }
        const best = Math.min(...runs.map(m => m.max));
        // What the main thread would take: the outline builder on this thread.
        const rd = await L.wvSdtOpen(await IOUtils.read(packOf(book)));
        const main = await longestPause(() => L.wvOutlineFromSdt(rd, wv._wvOutlineSdtMeta(book)));
        try { wvT.trace("doc-layer: book of 240 pages: first open through the layer " + JSON.stringify(runs.map(m => [m.ms, m.max])) + " (ms, longest pause); on the main thread " + main.ms + " ms, longest pause " + main.max + " ms"); } catch (e) {}
        assert.isBelow(best, 50, "the longest pause through the layer: " + JSON.stringify(runs.map(m => m.max)) + " ms (the main thread alone: " + main.max + " ms)");
    });
});
