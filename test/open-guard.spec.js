/* global describe, it, before, after, afterEach, assert, Zotero, wvT, IOUtils, PathUtils */

// A link, a row or a card opens a file only when that is safe (security
// review 2026-11-22): a file Zotero's reader shows opens as before; a file the
// system would run (a program, a script, a shortcut) is never opened from a
// link; any other file Zotero cannot show opens only after the user confirms
// with its real name in front of them. A link names an item by its KEY: a
// local item number never opens a file or a note (Zotero's own handler takes
// keys only; a number is the select link's legacy form). A paper with no file
// of its own opens its web page, never another kind of URL.
//
// Nothing here opens anything on the test machine: Zotero.FileHandlers.open,
// Zotero.launchFile, Zotero.launchURL and ZoteroPane.viewAttachment are
// recorders for the duration of each test, and the confirmation is answered
// by the test.

describe("Weavero — links open files only when that is safe", function () {
    this.timeout(60000);
    let wv, zp, created = [], files = [], calls, asked, answer;
    let orig = {};

    const mkFile = async (name, body) => {
        const dir = PathUtils.join(PathUtils.tempDir, "wv-open-guard-" + Date.now() + "-" + Math.floor(Math.random() * 1e6));
        await IOUtils.makeDirectory(dir);
        const path = PathUtils.join(dir, name);
        await IOUtils.writeUTF8(path, body || "WV-TEST");
        files.push(dir);
        return path;
    };
    const mkAttachment = async (name, contentType, parentItemID) => {
        const path = await mkFile(name);
        const att = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID });
        if (contentType) { att.attachmentContentType = contentType; await att.saveTx(); }
        created.push(att);
        return att;
    };
    const mkItem = async (fields) => {
        const it = new Zotero.Item("journalArticle");
        it.setField("title", "WV-TEST open guard");
        for (const k of Object.keys(fields || {})) it.setField(k, fields[k]);
        await it.saveTx();
        created.push(it);
        return it;
    };
    const opened = (fn) => calls.filter((c) => c.fn === fn);

    before(function () {
        wv = wvT.plugin();
        if (!wv || typeof wv.handleZoteroURI !== "function") wvT.absent("plugin.handleZoteroURI");
        zp = Zotero.getMainWindow().ZoteroPane;
        orig = {
            fhOpen: Zotero.FileHandlers.open,
            launchFile: Zotero.launchFile,
            launchURL: Zotero.launchURL,
            viewAttachment: zp.viewAttachment,
        };
    });

    const install = () => {
        calls = [];
        asked = [];
        answer = false;
        Zotero.FileHandlers.open = async (item, params) => { calls.push({ fn: "FileHandlers.open", id: item && item.id, params }); return true; };
        Zotero.launchFile = (p) => { calls.push({ fn: "launchFile", path: p }); };
        Zotero.launchURL = (u) => { calls.push({ fn: "launchURL", url: u }); };
        zp.viewAttachment = async (id) => { calls.push({ fn: "viewAttachment", id }); };
        wv._wvAskOpenExternal = (win, name) => { asked.push(name); return answer; };
    };

    afterEach(() => {
        Zotero.FileHandlers.open = orig.fhOpen;
        Zotero.launchFile = orig.launchFile;
        Zotero.launchURL = orig.launchURL;
        zp.viewAttachment = orig.viewAttachment;
        delete wv._wvAskOpenExternal;
    });

    after(async () => {
        for (const it of created.reverse()) { try { await it.eraseTx(); } catch (e) {} }
        for (const d of files) { try { await IOUtils.remove(d, { recursive: true }); } catch (e) {} }
    });

    it("a program attached to an item is never opened from a link, and nothing is asked", async () => {
        const att = await mkAttachment("Supplementary data.exe", "application/octet-stream");
        assert.notOk(att.attachmentReaderType, "no reader for it");
        install();
        await wv.handleZoteroURI("zotero://open/library/items/" + att.key);
        assert.lengthOf(opened("FileHandlers.open"), 0, "not handed to Zotero's file opener");
        assert.lengthOf(opened("launchFile"), 0, "not launched");
        assert.lengthOf(asked, 0, "refused outright, no question");
        for (const name of ["Data.pdf.bat", "notes.hta", "setup.msi", "readme.js", "shortcut.url", "run.ps1"]) {
            const a2 = await mkAttachment(name, "application/octet-stream");
            install();
            await wv.handleZoteroURI("zotero://open/library/items/" + a2.key);
            assert.lengthOf(opened("FileHandlers.open"), 0, name + " not opened");
            assert.lengthOf(asked, 0, name + ": refused, not asked");
        }
        // Trailing dots and spaces are dropped by Windows: the same file to it.
        const lib = wvT.lib();
        assert.isOk(lib && typeof lib.wvIsRunnableFile === "function", "the rule is published for the suite");
        for (const name of ["link.lnk.", "run.ps1 ", "RUN.EXE", "a.b.c.vbs", "x.desktop", "x.command", "x.sh"]) {
            assert.isTrue(lib.wvIsRunnableFile(name), name);
        }
        for (const name of ["paper.pdf", "data.csv", "figure.png", "report.docx", "noext", "archive.zip"]) {
            assert.isFalse(lib.wvIsRunnableFile(name), name);
        }
    });

    it("another file Zotero cannot show opens only once the user confirms, with its real name", async () => {
        const att = await mkAttachment("Table S1.csv", "text/csv");
        install();
        answer = false;
        await wv.handleZoteroURI("zotero://open/library/items/" + att.key);
        assert.deepEqual(asked, ["Table S1.csv"], "asked once, with the file's own name");
        assert.lengthOf(opened("FileHandlers.open"), 0, "Cancel opens nothing");
        install();
        answer = true;
        await wv.handleZoteroURI("zotero://open/library/items/" + att.key);
        assert.lengthOf(asked, 1);
        assert.lengthOf(opened("FileHandlers.open"), 1, "Open hands it to Zotero's opener");
        assert.strictEqual(opened("FileHandlers.open")[0].id, att.id);
    });

    it("a modified open (a new window) goes through the same check", async () => {
        const att = await mkAttachment("macro.vbs", "application/octet-stream");
        install();
        await wv.handleZoteroURI("zotero://open/library/items/" + att.key, { where: "window" });
        assert.lengthOf(opened("FileHandlers.open"), 0);
        assert.lengthOf(opened("launchFile"), 0);
    });

    it("a PDF opens in Zotero's reader as before, without a question", async () => {
        const att = await wvT.createTestPDFItem("wv-open-guard");
        created.push(att);
        assert.strictEqual(att.attachmentReaderType, "pdf");
        install();
        await wv.handleZoteroURI("zotero://open/library/items/" + att.key);
        assert.lengthOf(asked, 0, "nothing asked");
        assert.lengthOf(opened("FileHandlers.open"), 1, "opened");
    });

    it("a paper's best file goes through the check too", async () => {
        const paper = await mkItem();
        await mkAttachment("installer.exe", "application/octet-stream", paper.id);
        install();
        await wv.handleZoteroURI("zotero://open/library/items/" + paper.key);
        assert.lengthOf(opened("FileHandlers.open"), 0);
        assert.lengthOf(opened("launchFile"), 0);
        assert.lengthOf(opened("launchURL"), 0);
    });

    it("an item NUMBER never opens a file or a note; select keeps the legacy form", async () => {
        const att = await mkAttachment("Table S2.csv", "text/csv");
        install();
        answer = true;
        await wv.handleZoteroURI("zotero://open/library/items/" + att.id + "?wvpos=x");
        await wv.handleZoteroURI("zotero://open/library/items/" + att.id);
        assert.lengthOf(opened("FileHandlers.open"), 0, "open by number: nothing");
        assert.lengthOf(asked, 0);
        const note = new Zotero.Item("note");
        note.setNote("<p>WV-TEST open guard note</p>");
        await note.saveTx();
        created.push(note);
        const openNote = zp.openNote;
        const noteCalls = [];
        zp.openNote = async (id) => { noteCalls.push(id); };
        try {
            await wv.handleZoteroURI("zotero://note/u/" + note.id + "/");
            assert.lengthOf(noteCalls, 0, "note by number: nothing");
            await wv.handleZoteroURI("zotero://note/u/" + note.key + "/");
            // Better Notes may take a note link itself; without it Weavero opens the note.
            if (!wv._wvNoteExtension("zotero://note/u/" + note.key + "/")) assert.deepEqual(noteCalls, [note.id], "note by key: opened");
        }
        finally { zp.openNote = openNote; }
        assert.strictEqual(wv._wvResolveItemByKey(Zotero.Libraries.userLibraryID, String(att.id)).id, att.id,
            "the select link's legacy number still resolves");
    });

    it("a paper with no file opens its web page, never another kind of URL", async () => {
        const local = await mkItem({ url: "file:///C:/Windows/System32/calc.exe" });
        install();
        await wv.handleZoteroURI("zotero://open/library/items/" + local.key);
        assert.lengthOf(opened("launchURL"), 0, "a file: URL field is not opened");
        const unc = await mkItem({ url: "\\\\attacker.example\\share\\x.exe" });
        await wv.handleZoteroURI("zotero://open/library/items/" + unc.key);
        assert.lengthOf(opened("launchURL"), 0, "a UNC path is not opened");
        const web = await mkItem({ url: "https://example.org/paper" });
        await wv.handleZoteroURI("zotero://open/library/items/" + web.key);
        assert.deepEqual(opened("launchURL").map((c) => c.url), ["https://example.org/paper"], "the web page opens");
        install();
        const doi = await mkItem({ url: "ms-settings:privacy", DOI: "10.1000/xyz123" });
        await wv.handleZoteroURI("zotero://open/library/items/" + doi.key);
        assert.deepEqual(opened("launchURL").map((c) => c.url), ["https://doi.org/10.1000%2Fxyz123"], "else its DOI at doi.org");
    });
    // (1.2.1: the reference card's picture case is not here -- 1.2.0 has no
    // References section or card.)
});
