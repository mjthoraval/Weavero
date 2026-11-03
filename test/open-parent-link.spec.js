/* global describe, it, before, after, assert, Zotero, wvT */

// Open links to a paper carry the PAPER's key (MJT 2026-10-26: "Copying the
// open link from an item should just use the item key of the parent item.
// Make sure this is implemented consistently."; intake: "Parent key,
// Weavero-only"). Zotero's own `zotero://open` ignores a regular item's key
// (ZoteroProtocolHandler.mjs OpenExtension: "is not a file attachment"; MJT's
// zotero-dev proposal KqL6Tx88SRw of 2026-08-04 has no reply), so Weavero
// opens what a double-click opens -- a deliberate exception to "links work
// without Weavero". Links into one file (a page, an annotation) and links
// copied from an attachment keep the attachment's key. Written before the
// code.

describe("Weavero — open links to a paper carry the paper's key", function () {
    this.timeout(30000);
    let wv, win, P, A, N, X;
    const lib = "library";

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_buildOpenLink", "handleZoteroURI"]) wvT.method(m);
        win = Zotero.getMainWindow();
        P = await wvT.createItem("journalArticle", { title: "WV open parent link" });
        A = await wvT.createTestPDFItem("wv-open-parent", { parentItemID: P.id });
        N = await wvT.createItem("book", { title: "WV open parent link, no file" });
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = A.libraryID;
        X.parentID = A.id;
        X.annotationType = "highlight";
        X.annotationText = "open parent link";
        X.annotationColor = "#ffd400";
        X.annotationSortIndex = "00000|000001|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10, 60, 20]] });
        await X.saveTx();
    });

    after(async function () {
        await wvT.erase(P, N);
    });

    it("Copy Open Link from a paper writes the paper's key; from its file, an annotation or a page, the file's", function () {
        assert.strictEqual(wv._buildOpenLink(P), "zotero://open/" + lib + "/items/" + P.key, "the paper's own key");
        assert.strictEqual(wv._buildOpenLink(A), "zotero://open/" + lib + "/items/" + A.key, "the attachment's key");
        assert.strictEqual(wv._buildOpenLink(X), "zotero://open/" + lib + "/items/" + A.key + "?annotation=" + X.key, "an annotation: its file and itself");
        assert.isNull(wv._buildOpenLink(N), "a paper with nothing to open: no open link");
    });

    it("clicking an open link with the paper's key opens its best attachment, as a double-click does", async function () {
        const FH = /** @type {any} */ (Zotero.FileHandlers);
        const orig = FH.open;
        const opened = [];
        FH.open = async (item) => { opened.push(item && item.id); return true; };
        try {
            await wv.handleZoteroURI("zotero://open/" + lib + "/items/" + P.key);
        }
        finally { FH.open = orig; }
        assert.deepEqual(opened, [A.id], "the paper's PDF opened");
    });

    it("a paper with no file falls back to what a double-click does (its URL / DOI)", async function () {
        const zp = win.ZoteroPane;
        const orig = zp.viewItems;
        const viewed = [];
        zp.viewItems = async (items) => { viewed.push(...items.map((i) => i.id)); };
        try {
            await wv.handleZoteroURI("zotero://open/" + lib + "/items/" + N.key);
        }
        finally { zp.viewItems = orig; }
        assert.deepEqual(viewed, [N.id], "handed to the double-click action");
    });

    it("an open link with the paper's key arriving from outside Zotero is taken by Weavero, not dropped", function () {
        const seen = [];
        wv.handleZoteroURI = (u) => { seen.push(u); return Promise.resolve(); };   // own property over the shared method
        try {
            win.ZoteroPane.loadURI("zotero://open/" + lib + "/items/" + P.key);
        }
        finally { delete wv.handleZoteroURI; }
        assert.deepEqual(seen, ["zotero://open/" + lib + "/items/" + P.key], "Weavero handles it (Zotero's own handler ignores a paper's key)");
    });
});
