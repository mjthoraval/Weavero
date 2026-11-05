/* global describe, it, before, after, assert, Zotero, Services, wvT */

// Open links to a note and to a heading in it (MJT 2026-11-05, "notes get Copy
// Open Link in that zotero://note form"). Zotero's own zotero://open ignores a
// note, so the link is Better Notes' form: it opens with EITHER plugin running.
// Contracts:
//  - a note's open link is zotero://note/<u | groupID>/<key>/, Better Notes' form;
//  - a click opens it in a note tab, or goes to the tab it already has;
//  - a heading's open link adds ?wvheading=<id>: Weavero takes it even with
//    Better Notes there, which ignores the id, and lights the heading up in the
//    tab; a plain note link stays Better Notes' when that plugin is there;
//  - from OUTSIDE Zotero (ZoteroPane.loadURI, commandLineHandler.js) the link works
//    with no Better Notes at all: Zotero has no handler for it;
//  - a select link stays a select link.

describe("Weavero — open links to a note", function () {
    this.timeout(120000);
    let wv, win, ZP, note, parent, child;
    const HID = "wv-open-spec";
    const paras = (w, n) => Array.from({ length: n }, (_, i) => "<p>" + w + " " + i + "</p>").join("");
    const HTML = '<div data-schema-version="9"><h1>Top</h1>' + paras("top", 40)
        + '<h2 id="' + HID + '">Deep</h2>' + paras("deep", 40) + "</div>";
    const handler = () => /** @type {any} */ (Services.io.getProtocolHandler("zotero").wrappedJSObject);
    const tabOf = (item) => win.Zotero_Tabs.getTabIDByItemID(item.id);
    const closeTab = async (item) => {
        if (!item) return;
        const id = tabOf(item);
        if (id) win.Zotero_Tabs.close(id);
        await wvT.waitFor(() => !tabOf(item), 5000);
    };
    const toLibrary = async () => {
        win.Zotero_Tabs.select("zotero-pane");
        await wvT.waitFor(() => win.Zotero_Tabs.selectedType === "library", 3000);
    };
    const opened = (item) => wvT.waitFor(() => (tabOf(item) && win.Zotero_Tabs.selectedID === tabOf(item) ? true : null), 8000, 50);

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_buildOpenLink", "_buildNoteLink", "_wvNoteHeadingLink", "handleZoteroURI"]) wvT.method(m);
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        note = /** @type {any} */ (new Zotero.Item("note"));
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(HTML);
        await note.saveTx({ skipSelect: true });
        parent = /** @type {any} */ (new Zotero.Item("book"));
        parent.libraryID = Zotero.Libraries.userLibraryID;
        parent.setField("title", "wv-open-note-parent");
        await parent.saveTx({ skipSelect: true });
        child = /** @type {any} */ (new Zotero.Item("note"));
        child.libraryID = Zotero.Libraries.userLibraryID;
        child.parentID = parent.id;
        child.setNote("<p>wv-open-note child</p>");
        await child.saveTx({ skipSelect: true });
    });

    after(async function () {
        await closeTab(note);
        await closeTab(child);
        await toLibrary();
        await wvT.sleep(600);
        await wvT.erase(...[note, child, parent].filter(Boolean));
    });

    it("a note's open link is Better Notes' form, for a standalone note and a child note", function () {
        assert.strictEqual(wv._buildOpenLink(note), "zotero://note/u/" + note.key + "/");
        assert.strictEqual(wv._buildOpenLink(child), "zotero://note/u/" + child.key + "/");
    });

    it("a group's note carries the group's id, as Better Notes writes it", function () {
        const orig = Zotero.Groups.getGroupIDFromLibraryID;
        Zotero.Groups.getGroupIDFromLibraryID = () => 5499703;
        try { assert.strictEqual(wv._buildNoteLink({ libraryID: 987, key: "ABCD2345" }), "zotero://note/5499703/ABCD2345/"); }
        finally { Zotero.Groups.getGroupIDFromLibraryID = orig; }
    });

    it("a heading has both links: the select link is untouched", function () {
        assert.strictEqual(wv._wvNoteHeadingLink(note, HID), "zotero://select/library/items/" + note.key + "?wvheading=" + HID);
        assert.strictEqual(wv._wvNoteHeadingLink(note, HID, "open"), "zotero://note/u/" + note.key + "/?wvheading=" + HID);
    });

    it("a click opens the note in a tab, and goes to that tab the next time", async function () {
        await toLibrary();
        await wv.handleZoteroURI(wv._buildOpenLink(note));
        assert.isOk(await opened(note), "the note's tab, selected");
        const count = win.Zotero_Tabs._tabs.length;
        await toLibrary();
        await wv.handleZoteroURI(wv._buildOpenLink(note));
        assert.isOk(await opened(note), "back in it");
        assert.strictEqual(win.Zotero_Tabs._tabs.length, count, "no second tab");
    });

    it("a heading's open link opens the tab and lights the heading up there", async function () {
        await closeTab(note);
        await toLibrary();
        await wv.handleZoteroURI(wv._wvNoteHeadingLink(note, HID, "open"));
        assert.isOk(await opened(note), "the note's tab");
        const lit = await wvT.waitFor(() => {
            for (const ne of win.document.querySelectorAll("note-editor")) {
                const f = ne.querySelector("iframe");
                const d = f && f.contentDocument;
                if (!d || !ne.item || ne.item.id !== note.id || !ne.getClientRects().length) continue;
                const el = d.querySelector(".ProseMirror .wv-nn-flash");
                if (el) return (el.textContent || "").trim();
            }
            return null;
        }, 10000, 30);
        assert.strictEqual(lit, "Deep");
    });

    it("Better Notes keeps a plain note link; a link with a heading id stays Weavero's", async function () {
        const h = handler(), had = h._extensions["zotero://note"];
        let calls = 0;
        h._extensions["zotero://note"] = { noContent: true, doAction: () => { calls++; }, newChannel() {} };
        try {
            await toLibrary();
            await wv.handleZoteroURI(wv._buildOpenLink(note));
            assert.strictEqual(calls, 1, "the plain link goes to the extension");
            await wv.handleZoteroURI(wv._wvNoteHeadingLink(note, HID, "open"));
            assert.strictEqual(calls, 1, "the heading link does not");
            assert.isOk(await opened(note), "Weavero opened it");
        }
        finally {
            if (had) h._extensions["zotero://note"] = had;
            else delete h._extensions["zotero://note"];
        }
    });

    it("from outside Zotero, with no Better Notes, a note link opens the note", async function () {
        if (handler()._extensions["zotero://note"]) this.skip();
        await closeTab(note);
        await toLibrary();
        ZP.loadURI(wv._buildOpenLink(note));
        assert.isOk(await opened(note), "opened through ZoteroPane.loadURI");
    });

    it("from outside Zotero, a heading's open link reaches Weavero", async function () {
        await closeTab(note);
        await toLibrary();
        ZP.loadURI(wv._wvNoteHeadingLink(note, HID, "open"));
        assert.isOk(await opened(note), "opened through ZoteroPane.loadURI");
    });
});
