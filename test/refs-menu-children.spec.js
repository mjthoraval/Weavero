/* global describe, it, before, after, afterEach, assert, Zotero, wvT, PathUtils, IOUtils, Components, Services */
// The reference menu opens the cited item's own attachments and notes (MJT 2026-11-24, on
// the menu of Carslaw & Jaeger 1959, a book whose only attachment is a DjVu file: "When the
// item cited in the reference has some attachment files or item notes, I would like to get
// options to open them"; his pick of the layout, "Listed in the menu"). Under Show in
// Library, one row per attachment and per child note, each with the icon the items list
// draws for it and its name:
//   - the PDF or EPUB the grid opens (refs.ts _wvRefsChildren: Weavero's default file when it
//     is one, else Zotero's best -- item.js getBestAttachments) keeps the grid's three
//     entries and has no row of its own; every OTHER file the reader shows (a second PDF, an
//     EPUB, an HTML snapshot -- "Should also work for snapshots", MJT 2026-11-24) is a row
//     whose submenu holds the same Open in New Tab / Split View / New Window;
//   - any other file opens as Zotero opens an attachment (ZoteroPane.viewAttachment: the
//     system's application for DjVu, Word ...) with NO question, as Zotero's double-click
//     (MJT 2026-11-24, "Open, no question"); a program is still refused with the links'
//     notice (url.ts _wvMayOpenAttachment, `askExternal: false` for these rows only);
//   - a linked URL opens through Weavero's link launcher (url.ts _launchURL);
//   - a note opens in a note tab, ZoteroPane.openNote(id, { openInWindow: false }) ONLY
//     (CLAUDE.md, hard invariant);
//   - a file missing from the disk: greyed out, "File Not Found" (Zotero's words) as its
//     tooltip, ONLY when it cannot be fetched -- a linked file, or a stored one in a library
//     without file syncing; else enabled, and Zotero downloads it first (MJT 2026-11-24,
//     "Enabled, downloads": a file row through viewAttachment, a document of the reader's
//     through Zotero.Sync.Runner.downloadFile, as viewAttachment does);
//   - more than five rows: one "Attachments and Notes" submenu holds them;
//   - a caption over the rows (MJT 2026-11-25, on the same menu: "There should be a clear
//     Attachments title for the attachments below the item. Otherwise, it appears confusing in
//     this form"): "Attachment" / "Attachments" over the attachments, "Note" / "Notes" over the
//     notes -- the toolkit's `menucaption`, the heading of a <select>'s option group, not an
//     entry: Up and Down pass it, the pointer does not highlight it, a click runs nothing,
//     nothing focuses it, and it is drawn in the entries' own colour in light and dark. The
//     submenu holds no caption: its label names what it holds, in the captions' words when
//     it holds one kind ("Attachments", "Notes").
// The menu is ONE whatever opened it (a mark, a row's ⋯, a right-click, the library pane's
// rows): _wvRefsMenu, called here with the library pane's stand-in and a reader's. Nothing is
// opened on the test machine: every opener is a recorder for the duration of a test.
describe("Weavero — references: the menu opens the cited item's attachments and notes", function () {
    this.timeout(120000);
    let wv, win, doc, zp;
    const made = [];
    const dirs = [];
    let calls = [], asked = [], refused = [], answer = false;
    let orig = /** @type {any} */ ({});
    let cj, cjDjvu, cjNote;
    let multi, mPdfA, mPdfB, mEpub, mSnap, mLink;
    let snapOnly, soSnap;
    let many, manyKids, five, fiveKids, sixAtts, sixAttsKids, sixNotes, sixNotesKids;
    let gone, gonePdf, goneDjvu, goneLinked;
    let exe, exeFile;

    async function article(title) {
        const it = new Zotero.Item("book");
        it.libraryID = Zotero.Libraries.userLibraryID;
        it.setField("title", title);
        it.setField("date", "1959");
        it.setCreators([{ creatorType: "author", lastName: "Carslaw", firstName: "H. S." }]);
        await it.saveTx();
        made.push(it);
        return it;
    }
    async function tmpFile(name, body) {
        const dir = PathUtils.join(PathUtils.tempDir, "wv-refs-children-" + Date.now() + "-" + Math.floor(Math.random() * 1e6));
        await IOUtils.makeDirectory(dir);
        dirs.push(dir);
        const path = PathUtils.join(dir, name);
        await IOUtils.writeUTF8(path, body || "WV-TEST");
        return path;
    }
    /** A stored file under `parent`, of content type `ct`, added at `added` (Zotero's best
     *  order reads dateAdded). */
    async function fileAtt(parent, name, ct, added, body) {
        const path = await tmpFile(name, body);
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: parent.id });
        if (ct) att.attachmentContentType = ct;
        if (added) att.setField("dateAdded", added);
        await att.saveTx();
        made.unshift(att);
        return att;
    }
    async function pdfAtt(parent, name, added) {
        return fileAtt(parent, name, "application/pdf", added, wvT.minimalPDFBytes());
    }
    async function snapshotAtt(parent, title, added) {
        const path = await tmpFile("snapshot.html", "<html><head><title>" + title + "</title></head><body><p>WV-TEST snapshot</p></body></html>");
        const A = /** @type {any} */ (Zotero.Attachments);
        const att = await A.importSnapshotFromFile({ file: path, url: "https://example.org/wv-snapshot", title, contentType: "text/html", charset: "utf-8", parentItemID: parent.id, singleFile: true });
        if (added) { att.setField("dateAdded", added); await att.saveTx(); }
        made.unshift(att);
        return att;
    }
    async function noteOf(parent, html) {
        const n = new Zotero.Item("note");
        n.libraryID = parent.libraryID;
        n.parentID = parent.id;
        n.setNote(html);
        await n.saveTx();
        made.unshift(n);
        return n;
    }

    /** The library pane's stand-in (cited-by.ts _wvCbSecCtx): Split applies there. */
    const libCtx = () => ({ wvLib: true, itemID: 0, _window: win, tabID: null, type: "pdf" });
    /** A reader's stand-in in the main window with no tab: no Split (_wvRefsCanSplit). */
    const readerCtx = () => ({ _window: win, itemID: null, tabID: null });

    async function openMenu(item, ctx) {
        const old = doc.getElementById("wv-refs-menu");
        if (old) await closeMenu(old);
        const btn = doc.getElementById("tab-bar-container") || doc.documentElement;
        wv._wvRefsMenu(ctx || libCtx(), [item.id], "none", btn);
        const m = await wvT.waitFor(() => { const p = doc.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 20);
        assert.ok(m, "the menu on screen");
        await wvT.sleep(100);
        return m;
    }
    async function closeMenu(m) {
        try { m.hidePopup(); } catch (e) {}
        await wvT.waitFor(() => !doc.getElementById("wv-refs-menu"), 3000, 20);
    }
    const actOf = (el) => el.getAttribute("data-wv-refs-act");
    /** The menu's children as kinds: the card, its button row, separators, captions by their
     *  words, entries by their act. */
    const shapeOf = (m) => Array.from(m.children).map(el => el.classList.contains("wv-refs-card") ? "card" : el.localName === "menugroup" ? (el.classList.contains("wv-refs-btn-row") ? "btns" : "row")
        : el.localName === "menuseparator" ? "-" : el.localName === "menucaption" ? "cap:" + el.getAttribute("label") : el.localName + ":" + (actOf(el) || "?"));
    const rowsIn = (popup) => Array.from(popup.querySelectorAll(':scope > [data-wv-refs-act="child"]'));
    const rowIds = (popup) => rowsIn(popup).map(r => Number(r.getAttribute("data-wv-refs-child")));
    const rowOf = (m, it) => m.querySelector('[data-wv-refs-act="child"][data-wv-refs-child="' + it.id + '"]');
    const btnActs = (m) => Array.from(m.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *")).map(actOf);
    /** The icon file the items list draws for `it` (item.js getItemTypeIconName; the stored
     *  other file is drawn as `document`, _item-tree.scss $-itemTypesMap). */
    const iconFileOf = (it) => {
        let f = String(it.getItemTypeIconName()).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase();
        return f === "attachment-file" ? "document" : f;
    };
    async function assertIcon(row, it, label) {
        const url = String(row.getAttribute("image"));
        assert.match(url, new RegExp("^chrome://zotero/skin/item-type/16/(light|dark)/" + iconFileOf(it) + "\\.svg$"), label + ": the items list's icon (" + url + ")");
        assert.ok(row.classList.contains(row.localName === "menu" ? "menu-iconic" : "menuitem-iconic"), label + ": drawn as an icon");
        const txt = await Zotero.File.getContentsFromURLAsync(url);
        assert.include(String(txt), "<svg", label + ": the icon's file is there");
    }
    /** Open the submenu of `row` and return its entries. */
    async function subOf(row) {
        const sub = row.querySelector(":scope > menupopup");
        assert.ok(sub, "a submenu");
        row.open = true;
        assert.ok(await wvT.waitFor(() => sub.state === "open", 3000, 20), "the submenu opens (" + sub.state + ")");
        return Array.from(sub.children);
    }

    /** File syncing on or off for every library, for the rest of the test (afterEach gives it back). */
    function setSyncing(on) {
        const L = /** @type {any} */ (Zotero.Sync.Storage.Local);
        L.getEnabledForLibrary = () => !!on;
    }

    function install() {
        calls = []; asked = []; refused = []; answer = false;
        zp.viewAttachment = async (id) => { calls.push(["viewAttachment", id]); };
        zp.openNote = async (id, opts) => { calls.push(["openNote", id, JSON.parse(JSON.stringify(opts === undefined ? null : opts))]); };
        wv._wvAskOpenExternal = (w, name) => { asked.push(name); return answer; };
        wv._wvShowLinkRefused = (msg) => { refused.push(String(msg)); };
        wv._launchURL = (url) => { calls.push(["launchURL", url]); };
        wv._wvRefsAct = async (rd, act, ids) => { calls.push([act, ids[0]]); return true; };
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvRefsMenu");
        win = Zotero.getMainWindow(); doc = win.document; zp = win.ZoteroPane;
        orig = { viewAttachment: zp.viewAttachment, openNote: zp.openNote,
            syncEnabled: /** @type {any} */ (Zotero.Sync.Storage.Local).getEnabledForLibrary,
            download: /** @type {any} */ (Zotero.Sync.Runner).downloadFile };
        // MJT's case: a book whose only attachment is a DjVu file, here with a note too.
        cj = await article("Conduction of heat in solids");
        cjDjvu = await fileAtt(cj, "Carslaw Jaeger 1959.djvu", "image/vnd.djvu");
        cjNote = await noteOf(cj, "<h1>Reading notes on chapter 2</h1><p>WV-TEST</p>");
        // Several documents the reader shows: two PDFs (the older the best), an EPUB, a
        // snapshot, and a linked URL.
        multi = await article("WV-TEST several documents");
        mPdfA = await pdfAtt(multi, "Main text.pdf", "2020-01-01 10:00:00");
        mPdfB = await pdfAtt(multi, "Supplementary material.pdf", "2021-01-01 10:00:00");
        mEpub = await fileAtt(multi, "Book edition.epub", "application/epub+zip", "2022-01-01 10:00:00");
        mSnap = await snapshotAtt(multi, "Publisher page", "2023-01-01 10:00:00");
        mLink = await /** @type {any} */ (Zotero.Attachments).linkFromURL({ url: "https://example.org/wv-data", parentItemID: multi.id, title: "Data repository" });
        made.unshift(mLink);
        // A web page saved as a snapshot, nothing else.
        snapOnly = await article("WV-TEST a snapshot alone");
        soSnap = await snapshotAtt(snapOnly, "Saved web page");
        // Six rows (four files, two notes) and five.
        many = await article("WV-TEST six children");
        manyKids = [];
        for (const n of ["Table S1.csv", "Table S2.csv", "Table S3.csv", "Table S4.csv"]) manyKids.push(await fileAtt(many, n, "text/csv"));
        for (const t of ["First note", "Second note"]) manyKids.push(await noteOf(many, "<h1>" + t + "</h1>"));
        five = await article("WV-TEST five children");
        fiveKids = [];
        for (const n of ["Table S1.csv", "Table S2.csv", "Table S3.csv"]) fiveKids.push(await fileAtt(five, n, "text/csv"));
        for (const t of ["First note", "Second note"]) fiveKids.push(await noteOf(five, "<h1>" + t + "</h1>"));
        // Six rows of one kind: six files, six notes.
        sixAtts = await article("WV-TEST six files");
        sixAttsKids = [];
        for (let i = 1; i <= 6; i++) sixAttsKids.push(await fileAtt(sixAtts, "Table S" + i + ".csv", "text/csv"));
        sixNotes = await article("WV-TEST six notes");
        sixNotesKids = [];
        for (let i = 1; i <= 6; i++) sixNotesKids.push(await noteOf(sixNotes, "<h1>Note " + i + "</h1>"));
        // Files gone from the disk: the PDF the grid opens and a DjVu (stored), and a linked
        // file (no server ever holds it).
        gone = await article("WV-TEST files missing");
        gonePdf = await pdfAtt(gone, "Gone.pdf");
        goneDjvu = await fileAtt(gone, "Gone.djvu", "image/vnd.djvu");
        const linkedPath = await tmpFile("Linked scan.djvu");
        goneLinked = await /** @type {any} */ (Zotero.Attachments).linkFromFile({ file: Zotero.File.pathToFile(linkedPath), parentItemID: gone.id });
        goneLinked.attachmentContentType = "image/vnd.djvu";
        await goneLinked.saveTx();
        made.unshift(goneLinked);
        for (const a of [gonePdf, goneDjvu, goneLinked]) { const p = await a.getFilePathAsync(); if (p) await IOUtils.remove(p); }
        // A program attached to an item.
        exe = await article("WV-TEST a program");
        exeFile = await fileAtt(exe, "Supplementary data.exe", "application/octet-stream");
    });

    afterEach(function () {
        zp.viewAttachment = orig.viewAttachment;
        zp.openNote = orig.openNote;
        /** @type {any} */ (Zotero.Sync.Storage.Local).getEnabledForLibrary = orig.syncEnabled;
        /** @type {any} */ (Zotero.Sync.Runner).downloadFile = orig.download;
        for (const k of ["_wvAskOpenExternal", "_wvShowLinkRefused", "_launchURL", "_wvRefsAct", "_wvRefsOpenTab"]) delete wv[k];
    });

    after(async function () {
        const p = doc && doc.getElementById("wv-refs-menu");
        if (p) await closeMenu(p);
        await wvT.erase(...made);
        for (const d of dirs) { try { await IOUtils.remove(d, { recursive: true }); } catch (e) {} }
    });

    it("a cited book with a DjVu file and a note: under Show in Library, a row for each, with the items list's icon and its name, each under its caption", async function () {
        const m = await openMenu(cj);
        try {
            assert.deepEqual(shapeOf(m), ["card", "btns", "-", "cap:Attachment", "menuitem:child", "cap:Note", "menuitem:child"],
                "the card and its buttons, then the file under \"Attachment\" and the note under \"Note\"");
            assert.deepEqual(btnActs(m), ["library", "copy-as"], "no PDF or EPUB: Show in Library and Copy As");
            assert.deepEqual(rowIds(m), [cjDjvu.id, cjNote.id], "the attachment, then the note");
            const f = rowOf(m, cjDjvu), n = rowOf(m, cjNote);
            assert.equal(f.getAttribute("data-wv-refs-kind"), "file");
            assert.equal(n.getAttribute("data-wv-refs-kind"), "note");
            assert.equal(f.getAttribute("label"), cjDjvu.getField("title"), "the attachment's title, as the Attachments section shows it");
            assert.equal(n.getAttribute("label"), cjNote.getNoteTitle(), "the note's title");
            assert.equal(n.getAttribute("label"), "Reading notes on chapter 2");
            await assertIcon(f, cjDjvu, "the DjVu file");
            assert.include(["attachment-image", "document"], iconFileOf(cjDjvu), "a DjVu is drawn as an image (Zotero 11) or a document");
            await assertIcon(n, cjNote, "the note");
            assert.equal(iconFileOf(cjNote), "note");
            assert.isFalse(f.hasAttribute("disabled") && f.getAttribute("disabled") !== "false", "the file is there: enabled");
        }
        finally { await closeMenu(m); }
    });

    it("the DjVu's row opens it as Zotero opens an attachment (ZoteroPane.viewAttachment), with no question (MJT, \"Open, no question\")", async function () {
        install();
        answer = false;   // a question would be answered Cancel: nothing would open
        const m = await openMenu(cj);
        rowOf(m, cjDjvu).doCommand();
        assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "opened");
        assert.deepEqual(asked, [], "nothing asked");
        assert.deepEqual(calls, [["viewAttachment", cjDjvu.id]], "Zotero's own attachment opening, on the DjVu");
        await closeMenu(m);
        // Everywhere else the question stays: the same file through the links' check.
        install();
        answer = false;
        assert.isFalse(await wv._wvMayOpenAttachment(cjDjvu, win), "the check itself still asks, and Cancel refuses");
        assert.deepEqual(asked, ["Carslaw Jaeger 1959.djvu"], "asked with the file's own name");
    });

    it("the note's row opens the note in a note tab: ZoteroPane.openNote with openInWindow false", async function () {
        install();
        const m = await openMenu(cj);
        rowOf(m, cjNote).doCommand();
        assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "opened");
        assert.deepEqual(calls, [["openNote", cjNote.id, { openInWindow: false }]]);
        await closeMenu(m);
    });

    it("several documents: the grid opens the best PDF; the other PDF, the EPUB and the snapshot are rows with Open in New Tab / Split View / New Window; the link a row", async function () {
        const best = await multi.getBestAttachment();
        assert.equal(best && best.id, mPdfA.id, "fixture: Zotero's best is the older PDF");
        install();
        const m = await openMenu(multi);
        try {
            assert.deepEqual(btnActs(m), ["tab", "split", "window", "copy-as"], "the buttons open the best PDF");
            const kids = multi.getAttachments().filter(id => id !== mPdfA.id);
            assert.deepEqual(shapeOf(m), ["card", "btns", "-", "cap:Attachments", ...kids.map(id => id === mLink.id ? "menuitem:child" : "menu:child")],
                "under the buttons, \"Attachments\", then a row per other document (a submenu each) and the link (an entry)");
            assert.deepEqual(rowIds(m), kids, "every attachment but the grid's, in Zotero's order");
            assert.notOk(rowOf(m, mPdfA), "the best PDF has no row: the grid opens it");
            for (const [it, kind] of [[mPdfB, "reader"], [mEpub, "reader"], [mSnap, "reader"], [mLink, "link"]]) {
                const r = rowOf(m, it);
                assert.equal(r.getAttribute("data-wv-refs-kind"), kind, it.getField("title") + ": " + kind);
                assert.equal(r.getAttribute("label"), it.getField("title"), it.getField("title") + ": its title");
                await assertIcon(r, it, it.getField("title"));
            }
            assert.equal(iconFileOf(mSnap), "attachment-snapshot", "the snapshot's own icon");
            assert.equal(iconFileOf(mLink), "attachment-web-link", "the link's own icon");
            // The grid opens the best PDF itself.
            m.querySelector('menugroup > menuitem[data-wv-refs-act="tab"]').doCommand();
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20));
            assert.deepEqual(calls.splice(0), [["tab", mPdfA.id]], "the grid's New Tab: the best PDF");
        }
        finally { await closeMenu(m); }
        // Each reader row's submenu: the grid's entries, in its order, on that document.
        for (const it of [mPdfB, mEpub, mSnap]) {
            const m2 = await openMenu(multi);
            try {
                const entries = await subOf(rowOf(m2, it));
                assert.deepEqual(entries.map(actOf), ["tab", "split", "window"], it.getField("title") + ": New Tab, Split View, New Window");
                assert.deepEqual(entries.map(e => e.getAttribute("label")), ["Open in New Tab", "Open in Split View", "Open in New Window"]);
                for (const e of entries) assert.match(String(e.getAttribute("image")), /^data:image\/svg\+xml,/, "the grid's icon for " + actOf(e));
                entries[2].doCommand();
                assert.ok(await wvT.waitFor(() => calls.length, 3000, 20));
                assert.deepEqual(calls.splice(0), [["window", it.id]], it.getField("title") + ": New Window opens that document");
            }
            finally { await closeMenu(m2); }
        }
        const m3 = await openMenu(multi);
        rowOf(m3, mLink).doCommand();
        assert.ok(await wvT.waitFor(() => calls.length, 3000, 20));
        assert.deepEqual(calls.splice(0), [["launchURL", "https://example.org/wv-data"]], "the link through Weavero's link launcher");
        await closeMenu(m3);
    });

    it("a snapshot alone: no grid, Show in Library, then the snapshot's row with the reader's entries; Split only where it applies", async function () {
        install();
        let m = await openMenu(snapOnly);
        try {
            assert.deepEqual(shapeOf(m), ["card", "btns", "-", "cap:Attachment", "menu:child"]);
            assert.deepEqual(btnActs(m), ["library", "copy-as"]);
            const r = rowOf(m, soSnap);
            assert.equal(r.getAttribute("data-wv-refs-kind"), "reader");
            await assertIcon(r, soSnap, "the snapshot");
            const entries = await subOf(r);
            assert.deepEqual(entries.map(actOf), ["tab", "split", "window"]);
            entries[1].doCommand();
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20));
            assert.deepEqual(calls.splice(0), [["split", soSnap.id]], "Split View opens the snapshot");
        }
        finally { await closeMenu(m); }
        // From a reader with no tab to be beside: no Split, as the grid.
        m = await openMenu(snapOnly, readerCtx());
        try {
            const entries = await subOf(rowOf(m, soSnap));
            assert.deepEqual(entries.map(actOf), ["tab", "window"], "New Tab and New Window");
        }
        finally { await closeMenu(m); }
    });

    it("more than five rows: one Attachments and Notes submenu holds them; five stay in the menu", async function () {
        let m = await openMenu(many);
        try {
            assert.deepEqual(shapeOf(m), ["card", "btns", "-", "menu:children"], "six rows: a submenu");
            const sub = m.querySelector(':scope > menu[data-wv-refs-act="children"]');
            assert.equal(sub.getAttribute("label"), "Attachments and Notes");
            assert.ok(sub.classList.contains("menu-iconic") && sub.getAttribute("image"), "with an icon");
            await subOf(sub);
            assert.deepEqual(rowIds(sub.querySelector(":scope > menupopup")), many.getAttachments().concat(many.getNotes()), "the six, attachments then notes, in Zotero's order");
            assert.isNull(m.querySelector("menucaption"), "no caption, in the menu or the submenu: the submenu's label names its rows");
            assert.sameMembers(rowIds(sub.querySelector(":scope > menupopup")), manyKids.map(k => k.id));
            install();
            answer = false;
            rowOf(m, manyKids[1]).doCommand();
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "a row in the submenu opens");
            assert.deepEqual(calls.splice(0), [["viewAttachment", manyKids[1].id]]);
            assert.deepEqual(asked, [], "with no question");
        }
        finally { await closeMenu(m); }
        m = await openMenu(five);
        try {
            assert.deepEqual(shapeOf(m), ["card", "btns", "-", "cap:Attachments", "menuitem:child", "menuitem:child", "menuitem:child", "cap:Notes", "menuitem:child", "menuitem:child"],
                "five rows: in the menu, the three files under \"Attachments\", the two notes under \"Notes\"");
            assert.deepEqual(rowIds(m), five.getAttachments().concat(five.getNotes()));
            assert.sameMembers(rowIds(m), fiveKids.map(k => k.id));
        }
        finally { await closeMenu(m); }
    });

    it("more than five rows of one kind: the submenu is named for it, \"Attachments\" or \"Notes\" (with Zotero's note icon), and holds no caption", async function () {
        for (const [item, kids, label, icon] of [[sixAtts, sixAttsKids, "Attachments", "attachment"], [sixNotes, sixNotesKids, "Notes", "note"]]) {
            const m = await openMenu(item);
            try {
                assert.deepEqual(shapeOf(m), ["card", "btns", "-", "menu:children"], label + ": six rows, a submenu");
                const sub = m.querySelector(':scope > menu[data-wv-refs-act="children"]');
                assert.equal(sub.getAttribute("label"), label, "the submenu named for what it holds");
                const img = String(sub.getAttribute("image"));
                assert.equal(img, "chrome://zotero/skin/16/universal/" + icon + ".svg", label + ": Zotero's " + icon + " icon");
                assert.include(String(await Zotero.File.getContentsFromURLAsync(img)), "<svg", label + ": the icon's file is there");
                await subOf(sub);
                assert.sameMembers(rowIds(sub.querySelector(":scope > menupopup")), kids.map(k => k.id), label + ": the six");
                assert.isNull(m.querySelector("menucaption"), label + ": no caption, in the menu or the submenu");
            }
            finally { await closeMenu(m); }
        }
    });

    // ---- the captions are not entries (MJT 2026-11-25) ----
    /** A trusted key in the main window: the popup manager takes no scripted key (the text
     *  input processor, as refs.spec.js drives the grid). */
    function key(k) {
        const Cc = Components.classes, Ci = Components.interfaces;
        const t = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
        if (!t.beginInputTransactionForTests(win)) throw new Error("text input processor busy");
        const codes = { ArrowDown: 40, ArrowUp: 38 };
        const ev = new win.KeyboardEvent("", { key: k, code: k, keyCode: codes[k] });
        t.keydown(ev);
        t.keyup(ev);
    }
    /** What the menu highlights: an entry by its act (a row by its name), a caption as "caption". */
    const activeIn = (m) => Array.from(m.querySelectorAll(":scope > [_moz-menuactive], :scope > menugroup > [_moz-menuactive]"))
        .map(el => el.localName === "menucaption" ? "caption" : actOf(el) === "child" ? el.getAttribute("label") : actOf(el) || el.localName);
    /** The highlight once it stops moving. */
    async function settled(m) {
        let last = "", same = 0;
        for (let i = 0; i < 25 && same < 4; i++) {
            await wvT.sleep(50);
            const now = activeIn(m).join("+");
            same = now === last ? same + 1 : 0;
            last = now;
        }
        return last;
    }
    /** Scripted pointer events at the middle of `el` (Gecko's menu code takes a scripted
     *  mousemove, mousedown and mouseup as a pointer's; refs.spec.js). */
    function pointer(el, types) {
        const r = el.getBoundingClientRect();
        for (const type of types) el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, view: win, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }

    it("the captions are not entries: Up and Down pass them, the pointer does not highlight them, a click runs nothing and leaves the menu open, nothing focuses them", async function () {
        install();
        answer = true;
        win.focus();
        await wvT.waitFor(() => Services.focus.activeWindow === win || null, 3000, 50);
        const m = await openMenu(five);
        try {
            const caps = Array.from(m.querySelectorAll(":scope > menucaption"));
            assert.deepEqual(caps.map(c => c.getAttribute("label")), ["Attachments", "Notes"], "a caption over the files, one over the notes");
            for (const c of caps) {
                const label = c.getAttribute("label");
                assert.isFalse(c.hasAttribute("tabindex"), label + ": no tabindex");
                assert.isNull(actOf(c), label + ": no act");
                const t = c.querySelector(".menu-text");
                assert.equal(t && t.getAttribute("value"), label, label + ": its words drawn (toolkit menu.js MozMenuCaption)");
            }
            // Up and Down: the entries, never a caption.
            const names = rowsIn(m).map(r => r.getAttribute("label"));
            assert.equal(names.length, 5, "five rows");
            const seen = [];
            for (let i = 0; i < 7; i++) { key("ArrowDown"); seen.push(await settled(m)); }
            for (let i = 0; i < 6; i++) { key("ArrowUp"); seen.push(await settled(m)); }
            assert.deepEqual(seen, ["library", "copy-as", ...names, ...names.slice(0, 4).reverse(), "copy-as", "library"], "Up and Down: the buttons (Show in Library, Copy As), the five rows and back, the captions passed");
            // The pointer: an entry takes the highlight, a caption never.
            const r0 = rowsIn(m)[0];
            assert.ok(await wvT.waitFor(() => { if (r0.hasAttribute("_moz-menuactive")) return true; pointer(r0, ["mousemove"]); return null; }, 2000, 50), "an entry is highlighted under the pointer (the check is live)");
            for (const c of caps) {
                for (let i = 0; i < 4; i++) { pointer(c, ["mousemove"]); await wvT.sleep(60); }
                assert.isFalse(c.hasAttribute("_moz-menuactive"), c.getAttribute("label") + ": not highlighted under the pointer");
                assert.equal(win.getComputedStyle(c).backgroundColor, "rgba(0, 0, 0, 0)", c.getAttribute("label") + ": no highlight drawn");
            }
            // A click: nothing runs, the menu stays.
            for (const c of caps) {
                pointer(c, ["mousemove", "mousedown", "mouseup", "click"]);
                await wvT.sleep(300);
                assert.equal(m.state, "open", c.getAttribute("label") + ": a click leaves the menu open");
            }
            assert.deepEqual(calls, [], "and runs nothing");
            // Nothing focuses it.
            for (const c of caps) {
                try { c.focus(); } catch (e) {}
                assert.notStrictEqual(doc.activeElement, c, c.getAttribute("label") + ": not focusable");
            }
        }
        finally { await closeMenu(m); }
    });

    it("the captions read in light and dark: the entries' own colour, bold, their words whole, at the rows' start", async function () {
        const P = Services.prefs, PREF = "ui.systemUsesDarkTheme";
        const had = P.prefHasUserValue(PREF) ? P.getIntPref(PREF) : null;
        try {
            for (const dark of [0, 1]) {
                P.setIntPref(PREF, dark);
                await wvT.sleep(300);
                const theme = dark ? "dark" : "light";
                assert.equal(win.matchMedia("(prefers-color-scheme: dark)").matches, !!dark, theme + ": the theme is on");
                const m = await openMenu(five);
                try {
                    const caps = Array.from(m.querySelectorAll(":scope > menucaption"));
                    assert.equal(caps.length, 2, theme + ": two captions");
                    // A row of the menu (the card + buttons design left no Show in Library entry).
                    const entry = rowsIn(m).find(r => !isOff(r) && !r.hasAttribute("_moz-menuactive"));
                    assert.ok(entry, theme + ": an enabled entry, not highlighted, to compare with");
                    const ctx = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas").getContext("2d");
                    const rowIcon = rowsIn(m)[0].querySelector(".menu-icon");
                    for (const c of caps) {
                        const label = c.getAttribute("label");
                        const cs = win.getComputedStyle(c);
                        assert.equal(cs.color, win.getComputedStyle(entry).color, theme + ": " + label + " in the entries' colour, not greyed (" + cs.color + ")");
                        assert.equal(cs.opacity, "1", theme + ": " + label + " not faded");
                        assert.isAtLeast(Number(cs.fontWeight), 600, theme + ": " + label + " bold (" + cs.fontWeight + ")");
                        const t = c.querySelector(".menu-text");
                        const tr = t.getBoundingClientRect();
                        ctx.font = win.getComputedStyle(t).font;
                        assert.isAbove(tr.height, 0, theme + ": " + label + " drawn");
                        assert.isAtLeast(tr.width + 1, ctx.measureText(label).width, theme + ": " + label + "'s words whole");
                        assert.approximately(tr.left, rowIcon.getBoundingClientRect().left, 1, theme + ": " + label + " starts where its rows' icons do");
                    }
                }
                finally { await closeMenu(m); }
            }
        }
        finally {
            if (had === null) P.clearUserPref(PREF);
            else P.setIntPref(PREF, had);
            await wvT.sleep(300);
        }
    });

    const isOff = (el) => el.hasAttribute("disabled") && el.getAttribute("disabled") !== "false";

    it("a file missing from the disk that cannot be fetched (no file syncing): its row greyed out with Zotero's words, nothing opens; the grid too when its PDF is gone", async function () {
        install();
        answer = true;
        setSyncing(false);
        const m = await openMenu(gone);
        try {
            const r = rowOf(m, goneDjvu);
            assert.ok(await wvT.waitFor(() => isOff(r), 3000, 20), "the DjVu's row disabled");
            assert.equal(r.getAttribute("tooltiptext"), "File Not Found", "Zotero's words");
            assert.ok(await wvT.waitFor(() => isOff(rowOf(m, goneLinked)), 3000, 20), "the linked file's row too");
            for (const act of ["tab", "split", "window"]) {
                const c = m.querySelector('menugroup > menuitem[data-wv-refs-act="' + act + '"]');
                assert.ok(isOff(c), act + ": disabled (the PDF is gone)");
                assert.equal(c.getAttribute("tooltiptext"), "File Not Found", act + ": the same words");
            }
            // Show in Library is the card's library name now (card + buttons, 2026-11-26).
            const show = m.querySelector(".wv-refs-card-libname[data-wv-refs-lib]");
            assert.ok(show, "Show in Library stays: the card's library name, a click from the copy");
            await wv._wvRefsOpenChild(libCtx(), goneDjvu.id, "none");
            assert.deepEqual(calls, [], "a command that gets there anyway opens nothing");
            assert.deepEqual(asked, [], "and asks nothing");
        }
        finally { await closeMenu(m); }
    });

    it("a stored file missing from the disk in a library WITH file syncing: enabled, and Zotero downloads it first; a linked one stays greyed (MJT, \"Enabled, downloads\")", async function () {
        install();
        setSyncing(true);
        const m = await openMenu(gone);
        try {
            const r = rowOf(m, goneDjvu);
            const l = rowOf(m, goneLinked);
            assert.ok(await wvT.waitFor(() => isOff(l), 3000, 20), "the linked file: greyed (no server holds it)");
            assert.equal(l.getAttribute("tooltiptext"), "File Not Found");
            await wvT.sleep(300);
            assert.isFalse(isOff(r), "the stored DjVu: enabled");
            assert.isFalse(r.hasAttribute("tooltiptext"), "no tooltip");
            for (const act of ["tab", "split", "window"]) {
                const c = m.querySelector('menugroup > menuitem[data-wv-refs-act="' + act + '"]');
                assert.isFalse(isOff(c), act + ": enabled (its stored PDF can be fetched)");
            }
            r.doCommand();
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20), "opened");
            assert.deepEqual(calls.splice(0), [["viewAttachment", goneDjvu.id]], "through Zotero's own opening, which downloads it first");
            assert.deepEqual(asked, [], "with no question");
        }
        finally { await closeMenu(m); }
    });

    it("the grid or a row on a document of the reader's whose stored file is gone: Zotero's download first, then the open; nothing when it cannot be fetched", async function () {
        delete wv._wvRefsAct;
        const opened = [], fetched = [];
        wv._wvRefsOpenTab = async (it) => { opened.push(it.id); return true; };
        const R = /** @type {any} */ (Zotero.Sync.Runner);
        R.downloadFile = async (it) => {
            fetched.push(it.id);
            const p = it.getFilePath();
            await IOUtils.writeUTF8(p, wvT.minimalPDFBytes());
            return { localChanges: true };
        };
        try {
            setSyncing(false);
            assert.isFalse(await wv._wvRefsAct(libCtx(), "tab", [gonePdf.id], "none"), "no file syncing: not opened");
            assert.deepEqual([fetched, opened], [[], []], "nothing fetched, nothing opened");
            setSyncing(true);
            assert.isTrue(await wv._wvRefsAct(libCtx(), "tab", [gonePdf.id], "none"), "file syncing: opened");
            assert.deepEqual(fetched, [gonePdf.id], "downloaded first (Zotero.Sync.Runner.downloadFile, as viewAttachment does)");
            assert.deepEqual(opened, [gonePdf.id], "then opened");
        }
        finally {
            const p = await gonePdf.getFilePathAsync();
            if (p) await IOUtils.remove(p);
        }
    });

    it("a program attached to the cited item: its row is refused with the links' notice, nothing asked, nothing opened", async function () {
        install();
        answer = true;
        const m = await openMenu(exe);
        try {
            rowOf(m, exeFile).doCommand();
            assert.ok(await wvT.waitFor(() => refused.length, 3000, 20), "refused");
            assert.include(refused[0], "Supplementary data.exe", "naming the file");
            assert.deepEqual(asked, [], "nothing asked");
            await wvT.sleep(200);
            assert.deepEqual(calls, [], "nothing opened");
        }
        finally { await closeMenu(m); }
    });

    it("the same menu from a reader's mark or row: the rows, the same commands", async function () {
        install();
        answer = true;
        const m = await openMenu(cj, readerCtx());
        try {
            assert.deepEqual(rowIds(m), [cjDjvu.id, cjNote.id]);
            rowOf(m, cjNote).doCommand();
            assert.ok(await wvT.waitFor(() => calls.length, 3000, 20));
            assert.deepEqual(calls, [["openNote", cjNote.id, { openInWindow: false }]]);
        }
        finally { await closeMenu(m); }
    });
});
