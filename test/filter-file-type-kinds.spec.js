/* global describe, it, before, after, assert, Zotero, wvT */

// MJT 2026-11-22 (1.2.1-citations.28, 11.0-beta.5): "Image attachments do not
// seem to be recognized by the filter" -- Attachment File Type is Image showed
// "No items in this view" in a library holding 56 stored DjVu files
// (image/vnd.djvu), 3 JPEG and 2 GIF, every one drawn with Zotero's image icon.
//
// Cause: the filter read an attachment's kind from
// `item.getItemTypeIconName(true)` (skipLinkMode). For images and videos
// Zotero tests `linkMode == (!skipLinkMode && LINK_MODE_LINKED_FILE)`, i.e.
// `linkMode == false` -- TRUE for a stored file (link mode 0) -- so every
// STORED image reported `attachmentImageLink` and matched nothing; a linked
// image (2) and an imported-URL image (1) happened to pass (item.js
// getItemTypeIconName, 11.0-beta.5). The same call gave a linked file of any
// other type the bare `attachment`, so Other File never matched one.
//
// The contract locked here: the filter's kind is the icon Zotero DRAWS for the
// attachment (getItemTypeIconName() -- what the items tree renders) with the
// link mode folded out, and the Image kind agrees with Zotero's own "Attachment
// File Type is Image" search (fileTypeMimeTypes: contentType LIKE 'image/%').
// FAILS on 1.2.1-citations.29 (every stored image and video).
describe("Weavero — Attachment File Type follows the icon Zotero draws (stored images, DjVu, videos)", function () {
    this.timeout(90000);
    const LM = () => Zotero.Attachments;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let wv, win, zp, iv, parent, standalone;
    const atts = {};   // name -> { item, want }
    // [name, link mode key, content type, path, the kind the filter must report]
    const CASES = [
        ["stored jpeg", "IMPORTED_FILE", "image/jpeg", "storage:a.jpg", "attachmentImage"],
        ["stored png", "IMPORTED_FILE", "image/png", "storage:a.png", "attachmentImage"],
        ["stored gif", "IMPORTED_FILE", "image/gif", "storage:a.gif", "attachmentImage"],
        ["stored tiff", "IMPORTED_FILE", "image/tiff", "storage:a.tif", "attachmentImage"],
        ["stored svg", "IMPORTED_FILE", "image/svg+xml", "storage:a.svg", "attachmentImage"],
        ["stored djvu", "IMPORTED_FILE", "image/vnd.djvu", "storage:a.djv", "attachmentImage"],
        ["imported-url jpeg", "IMPORTED_URL", "image/jpeg", "storage:b.jpg", "attachmentImage"],
        ["linked png", "LINKED_FILE", "image/png", "C:\\wv-test-none\\c.png", "attachmentImage"],
        ["stored octet-stream named .jpg", "IMPORTED_FILE", "application/octet-stream", "storage:d.jpg", "attachmentFile"],
        ["stored no content type named .png", "IMPORTED_FILE", "", "storage:e.png", "attachmentFile"],
        ["stored mp4", "IMPORTED_FILE", "video/mp4", "storage:f.mp4", "attachmentVideo"],
        ["linked webm", "LINKED_FILE", "video/webm", "C:\\wv-test-none\\g.webm", "attachmentVideo"],
        ["stored pdf", "IMPORTED_FILE", "application/pdf", "storage:h.pdf", "attachmentPDF"],
        ["linked pdf", "LINKED_FILE", "application/pdf", "C:\\wv-test-none\\i.pdf", "attachmentPDF"],
        ["stored epub", "IMPORTED_FILE", "application/epub+zip", "storage:j.epub", "attachmentEPUB"],
        ["snapshot", "IMPORTED_URL", "text/html", "storage:k.html", "attachmentSnapshot"],
        ["linked docx", "LINKED_FILE", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "C:\\wv-test-none\\l.docx", "attachmentFile"],
        ["stored docx", "IMPORTED_FILE", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "storage:m.docx", "attachmentFile"],
        ["web link", "LINKED_URL", "", null, "attachmentWebLink"],
        // Zotero's search counts an OpenDocument drawing as an image
        // (fileTypeMimeTypes), its icon does not (isImageAttachment wants
        // image/): the filter follows the icon -- the one divergence.
        ["stored odg", "IMPORTED_FILE", "application/vnd.oasis.opendocument.graphics", "storage:n.odg", "attachmentFile"],
    ];
    const KINDS = ["attachmentPDF", "attachmentEPUB", "attachmentSnapshot", "attachmentImage", "attachmentVideo", "attachmentWebLink", "attachmentFile"];
    // Zotero's drawn icon with the link mode folded out: the oracle.
    const FOLD = { attachmentPDFLink: "attachmentPDF", attachmentEPUBLink: "attachmentEPUB", attachmentImageLink: "attachmentImage", attachmentVideoLink: "attachmentVideo", attachmentLink: "attachmentFile" };
    const drawn = (it) => { const k = String(it.getItemTypeIconName()); return FOLD[k] || k; };

    const mkAtt = async (name, lmKey, ct, path, parentID) => {
        const lib = Zotero.Libraries.userLibraryID;
        const a = /** @type {any} */ (new Zotero.Item("attachment"));
        a.libraryID = lib;
        if (parentID) a.parentID = parentID;
        a.attachmentLinkMode = LM()["LINK_MODE_" + lmKey];
        a.attachmentContentType = ct;
        if (path) a.attachmentPath = path;
        if (lmKey === "LINKED_URL") a.setField("url", "https://example.invalid/wv-ftk");
        a.setField("title", "WV-TEST ftk " + name);
        await a.saveTx();
        return a;
    };
    const rowIDs = () => {
        const rp = iv.rowProvider || iv;
        const out = new Set();
        const n = rp.getRowCount();
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); if (r && r.ref) out.add(r.ref.id); }
        return out;
    };
    const applyWith = async (kinds) => {
        // Items created in the last 10 s are force-kept by design (the
        // "just created" carry-over); MJT's are old: drop the carry-over.
        if (wv._wvRecentlyAddedItemIDs) wv._wvRecentlyAddedItemIDs.clear();
        wv._filterState = { groups: [Object.assign(wv._emptyFilterGroup(), { attachmentFileType: kinds })] };
        await wv._applyItemsListFilter({ cascade: true, deliberate: true });
        await sleep(700);
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv || typeof wv._attachmentMatchesFileTypeList !== "function" || typeof wv._applyItemsListFilter !== "function") wvT.absent("attachment file-type matcher / filter apply");
        win = Zotero.getMainWindow(); zp = win.ZoteroPane; iv = zp.itemsView;
        await zp.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await sleep(300);
        parent = new Zotero.Item("book");
        parent.libraryID = Zotero.Libraries.userLibraryID;
        parent.setField("title", "WV-TEST ftk Free liquid jets and films");
        await parent.saveTx();
        for (const [name, lmKey, ct, path, want] of CASES) {
            atts[name] = { item: await mkAtt(name, lmKey, ct, path, parent.id), want };
        }
        standalone = await mkAtt("standalone stored djvu", "IMPORTED_FILE", "image/vnd.djvu", "storage:z.djv", null);
        await sleep(500);
    });

    after(async function () {
        try { wv._filterState = { groups: [wv._emptyFilterGroup()] }; await wv._applyItemsListFilter({ deliberate: true }); } catch (e) {}
        try { await parent.eraseTx(); } catch (e) {}
        try { await standalone.eraseTx(); } catch (e) {}
    });

    it("each attachment reports the kind of the icon Zotero draws for it", function () {
        const wrong = [];
        for (const [name, { item, want }] of Object.entries(atts)) {
            if (drawn(item) !== want) wrong.push(name + ": Zotero draws " + item.getItemTypeIconName() + ", the case expects " + want);
        }
        assert.deepEqual(wrong, [], "the test's expectations match Zotero's own icon (oracle check)");
        const bad = [];
        for (const [name, { item, want }] of Object.entries(atts)) {
            for (const k of KINDS) {
                const got = wv._attachmentMatchesFileTypeList(item, [k]);
                if (got !== (k === want)) bad.push(name + " " + (got ? "matched " : "missed ") + k);
            }
        }
        assert.deepEqual(bad, [], "every attachment matches its drawn kind and no other");
    });

    it("Image agrees with Zotero's own Attachment File Type is Image search", async function () {
        const ftID = Zotero.FileTypes.getID("image");
        assert.ok(ftID, "Zotero knows the image file type");
        const s = /** @type {any} */ (new Zotero.Search());
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition("fileTypeID", "is", ftID);
        s.addCondition("title", "contains", "WV-TEST ftk ");
        const zoteroIDs = new Set(await s.search());
        const all = [...Object.values(atts).map(a => a.item), standalone];
        const wvIDs = new Set(all.filter(it => wv._attachmentMatchesFileTypeList(it, ["attachmentImage"])).map(it => it.id));
        const name = (id) => /** @type {any} */ (Zotero.Items.get(id)).getField("title");
        const odg = atts["stored odg"].item.id;
        assert.isTrue(zoteroIDs.has(odg), "Zotero's search counts the OpenDocument drawing as an image");
        assert.isFalse(wvIDs.has(odg), "the filter follows Zotero's icon there (a file)");
        zoteroIDs.delete(odg);
        assert.deepEqual([...wvIDs].map(name).sort(), [...zoteroIDs].map(name).sort(), "otherwise the same attachments as Zotero's search");
        assert.include([...wvIDs].map(name), "WV-TEST ftk standalone stored djvu");
    });

    it("Linked File narrows a kind to linked files; Other File + Linked File finds a linked document", function () {
        assert.isTrue(wv._attachmentMatchesFileTypeList(atts["linked png"].item, ["attachmentImage", "attachmentLinkedFile"]));
        assert.isFalse(wv._attachmentMatchesFileTypeList(atts["stored djvu"].item, ["attachmentImage", "attachmentLinkedFile"]));
        assert.isTrue(wv._attachmentMatchesFileTypeList(atts["linked docx"].item, ["attachmentFile", "attachmentLinkedFile"]));
        assert.isTrue(wv._attachmentMatchesFileTypeList(atts["linked webm"].item, ["attachmentLinkedFile"]));
    });

    it("the items list under Image shows every image attachment, the same on two consecutive applies", async function () {
        const want = ["stored jpeg", "stored png", "stored gif", "stored tiff", "stored svg", "stored djvu", "imported-url jpeg", "linked png"].map(n => atts[n].item.id);
        await applyWith(["attachmentImage"]);
        const first = rowIDs();
        await wv._applyItemsListFilter({ deliberate: true });
        await sleep(700);
        const second = rowIDs();
        for (const [label, ids] of /** @type {Array<[string, Set<any>]>} */ ([["first apply", first], ["second apply", second]])) {
            const missing = want.filter(id => !ids.has(id)).map(id => /** @type {any} */ (Zotero.Items.get(id)).getField("title"));
            assert.deepEqual(missing, [], label + ": every image attachment is a row (rowProvider)");
            assert.isTrue(ids.has(parent.id), label + ": their parent is kept");
            assert.isTrue(ids.has(standalone.id), label + ": the standalone stored DjVu is a row");
            assert.isFalse(ids.has(atts["stored octet-stream named .jpg"].item.id), label + ": not an octet-stream file (Zotero draws it as a file)");
            assert.isFalse(ids.has(atts["stored pdf"].item.id), label + ": not the PDF");
        }
        assert.deepEqual([...first].sort(), [...second].sort(), "two consecutive applies agree");
    });
});
