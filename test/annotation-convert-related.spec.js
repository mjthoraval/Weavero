/* global describe, it, before, after, assert, Zotero, Components, wvT */
// Issue #64 (dag2108, Zotero 11): "Related links are removed when converting
// highlight to an underline." The reader never changes an annotation's type: it
// deletes the annotation and creates another under a NEW key (annotation-
// manager.js convertAnnotations), and Undo does the same, because the server
// refuses a type change on an existing item ("Cannot change existing
// annotationType", dataserver Item.inc.php), although the client's item.js
// allows it. So everything that named the old key lost it: related items,
// links, Backlinks, the manual annotation order.
// Forum 134637, reported to Zotero 2026-11-05.
describe("Weavero — converting a highlight keeps what pointed to it (#64)", function () {
    this.timeout(90000);
    let wv, att, other, linkNote, ann, plain, reader, uri1, oldKey, oldLink;
    const Cu = Components.utils;
    const TEXT = "wv-issue64 text", PLAIN = "wv-issue64 plain";
    const ir = () => Cu.waiveXrays(reader._internalReader);
    const find = (text = TEXT) => att.getAnnotations().find(x => x.annotationText === text);
    const replaced = async (key, text = TEXT) => {
        await wvT.waitFor(() => { const a = find(text); return a && a.key !== key; }, 8000);
        const a = find(text);
        assert.isOk(a, "the annotation is there");
        assert.notStrictEqual(a.key, key, "under a new key");
        return a;
    };
    const linked = async (a) => {
        await wvT.waitFor(() => a.relatedItems.includes(other.key) && other.relatedItems.includes(a.key), 4000);
        assert.include(a.relatedItems, other.key, "the annotation names the item");
        assert.include(other.relatedItems, a.key, "the item names the annotation");
        assert.lengthOf(other.relatedItems, 1, "and no relation to the deleted key is left");
    };
    const forwards = (a) => a.getRelationsByPredicate("dc:replaces");
    const selected = () => Array.from(ir()._state.selectedAnnotationIDs).join();
    const clear = async () => { ir().setSelectedAnnotations(Cu.cloneInto([], reader._iframeWindow)); await wvT.sleep(200); };
    const annotation = (text, sort, page) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = text;
        a.annotationComment = "a comment";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = String(page + 1);
        a.annotationSortIndex = sort;
        a.annotationPosition = JSON.stringify({ pageIndex: page, rects: [[100, 390, 400, 402]] });
        return a;
    };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlEnsure", "_wvBlDirect", "_wvAnnOrderWrite", "_wvAnnOrderGet", "handleZoteroURI"]) wvT.method(m);
        att = await wvT.createTestPDFItem("wv-issue64");
        other = /** @type {any} */ (new Zotero.Item("note"));
        other.setNote("<p>wv-issue64 other</p>");
        await other.saveTx();
        ann = annotation(TEXT, "00000|000400|00000", 0);
        ann.addRelatedItem(other);
        await ann.saveTx();
        other.addRelatedItem(ann);
        await other.saveTx();
        plain = annotation(PLAIN, "00000|000500|00000", 0);
        await plain.saveTx();
        oldKey = ann.key;
        uri1 = Zotero.URI.getItemURI(ann);
        oldLink = "zotero://open/library/items/" + att.key + "?annotation=" + oldKey;
        linkNote = /** @type {any} */ (new Zotero.Item("note"));
        linkNote.setNote("<p><a href=\"" + oldLink + "\">wv-issue64 link</a></p>");
        await linkNote.saveTx();
        await wv._wvBlEnsure();
        await wv._wvAnnOrderWrite(att.libraryID, att.key, { mode: "manual", dir: "asc", keys: [plain.key, oldKey] });
        reader = await wvT.openReaderTab(att.id);
        await wvT.waitFor(() => ir()._annotationManager._annotations.length === 2, 10000);
        assert.isOk(await wvT.waitFor(() => ir()._annotationManager._wvDeleteWrapTag, 15000), "the reader is wired");
        await wvT.waitFor(() => wv._wvBlDirect(ann).length === 1, 4000);
        assert.lengthOf(wv._wvBlDirect(ann), 1, "the note's link counts on the annotation");
    });

    after(async function () {
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        await wvT.sleep(300);
        const left = att.getAnnotations();
        await wvT.erase(...left, other, linkNote, att);
    });

    it("to an underline: the new annotation is related both ways, the text and comment kept", async function () {
        ir().convertAnnotations(Cu.cloneInto([oldKey], reader._iframeWindow), "underline");
        const now = await replaced(oldKey);
        assert.strictEqual(now.annotationType, "underline");
        assert.strictEqual(now.annotationComment, "a comment");
        await linked(now);
    });

    it("it records the key it replaces, as a relation that syncs", async function () {
        await wvT.waitFor(() => forwards(find()).length > 0, 4000);
        assert.deepEqual(forwards(find()), [uri1]);
    });

    it("an annotation with no related items is forwarded too", async function () {
        const key = plain.key, uri = Zotero.URI.getItemURI(plain);
        ir().convertAnnotations(Cu.cloneInto([key], reader._iframeWindow), "underline");
        const now = await replaced(key, PLAIN);
        await wvT.waitFor(() => forwards(now).length > 0, 4000);
        assert.deepEqual(forwards(now), [uri]);
    });

    it("a link to the old key still reaches the annotation", async function () {
        await clear();
        await wv.handleZoteroURI(oldLink);
        await wvT.waitFor(() => selected() === find().key, 4000);
        assert.strictEqual(selected(), find().key);
    });

    it("so does any other way in: Reader.open with the old key", async function () {
        await clear();
        await Zotero.Reader.open(att.id, /** @type {any} */ ({ annotationID: oldKey }));
        await wvT.waitFor(() => selected() === find().key, 4000);
        assert.strictEqual(selected(), find().key);
    });

    it("a note's link to the old key counts on the new annotation", async function () {
        const now = find();
        await wvT.waitFor(() => wv._wvBlDirect(now).length === 1, 4000);
        assert.lengthOf(wv._wvBlDirect(now), 1);
    });

    it("the manual annotation order keeps its place", async function () {
        const lib = att.libraryID;
        await wvT.waitFor(() => wv._wvAnnOrderGet(lib, att.key).includes(find().key), 4000);
        assert.deepEqual(wv._wvAnnOrderGet(lib, att.key), [find(PLAIN).key, find().key]);
    });

    it("Undo, which makes yet another key, keeps them too, and the first link still works", async function () {
        // The last step was the plain annotation's conversion: undo that first.
        const plainKey = find(PLAIN).key;
        ir().undo();
        await replaced(plainKey, PLAIN);
        const before = find().key, uri2 = Zotero.URI.getItemURI(find());
        ir().undo();
        const now = await replaced(before);
        assert.strictEqual(now.annotationType, "highlight");
        await linked(now);
        await wvT.waitFor(() => forwards(now).length === 2, 4000);
        assert.sameMembers(forwards(now), [uri1, uri2], "every earlier key, the erased one's forwards included");
        await clear();
        await wv.handleZoteroURI(oldLink);
        await wvT.waitFor(() => selected() === now.key, 4000);
        assert.strictEqual(selected(), now.key, "the original link, two conversions on");
    });

    it("several converted at once: each hands over to its own replacement", async function () {
        const a = find(), p = find(PLAIN), aKey = a.key, pKey = p.key;
        const aUri = Zotero.URI.getItemURI(a), pUri = Zotero.URI.getItemURI(p);
        ir().convertAnnotations(Cu.cloneInto([aKey, pKey], reader._iframeWindow), "underline");
        const now = await replaced(aKey), nowP = await replaced(pKey, PLAIN);
        assert.strictEqual(now.annotationType, "underline");
        assert.strictEqual(nowP.annotationType, "underline");
        await linked(now);
        await wvT.waitFor(() => forwards(now).includes(aUri) && forwards(nowP).includes(pUri), 4000);
        assert.include(forwards(now), aUri, "the annotation forwards from its own key");
        assert.include(forwards(nowP), pUri, "and so does the other");
        assert.notInclude(forwards(now), pUri, "not from the other's");
        assert.notInclude(forwards(nowP), aUri, "not from the other's");
    });

    it("a plain delete forwards nothing: Zotero drops the relation", async function () {
        const a = find();
        ir().deleteAnnotations(Cu.cloneInto([a.key], reader._iframeWindow));
        await wvT.waitFor(() => !find(), 8000);
        assert.isNotOk(find());
        await wvT.sleep(800);
        assert.deepEqual(other.relatedItems, [], "nothing to hand over to");
        assert.isOk(find(PLAIN), "the other annotation is untouched");
    });
});
