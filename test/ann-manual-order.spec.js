/* global describe, it, before, after, assert, Zotero */

// Manual annotation ordering + PER-DOCUMENT sort (forum request 132987 +
// user calls 2026-08-28). The sort mode is a document property stored with
// the order in weavero/ann-order.json ({mode, dir, keys} per "lib:key");
// the old global pref is retired. Display-only: rank map over the render
// wrapper, sortIndex untouched. A drop captures the CURRENT VISIBLE order
// and flags only that document manual.

describe("Weavero — per-document annotation sort + manual order", () => {
    let wv;
    const stubReaderFor = (key) => ({ itemID: -1, __specKey: key });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAnnManualMove !== "function") this.skip();
    });

    const withAtt = async (key, fn) => {
        const orig = wv._wvReaderAtt;
        wv._wvReaderAtt = (r) => ({ libraryID: 1, itemKey: (r && r.__specKey) || key, att: null });
        try { return await fn(); }
        finally { wv._wvReaderAtt = orig; }
    };

    it("sort mode is per document: one doc manual, another untouched", async () => {
        await withAtt("SPECDOCA", async () => {
            await wv._wvAnnOrderWrite(1, "SPECDOCA", { mode: "manual", dir: "asc", keys: ["K1", "K2"] });
            assert.equal(wv._wvAnnSort(stubReaderFor("SPECDOCA")).field, "manual");
            assert.equal(wv._wvAnnSort(stubReaderFor("SPECDOCB")).field, "position",
                "other documents stay at the default");
            assert.equal(wv._wvAnnSort().field, "position", "no reader = default");
        });
    });

    it("setting a date mode writes THIS document's entry only", async () => {
        await withAtt("SPECDOCC", async () => {
            const rd = stubReaderFor("SPECDOCC");
            wv._wvAnnSetSort("dateAdded", undefined, rd);
            await new Promise((r) => Zotero.getMainWindow().setTimeout(r, 200));
            assert.deepEqual(wv._wvAnnSort(rd), { field: "dateAdded", dir: "desc" });
            assert.equal(wv._wvAnnSort(stubReaderFor("SPECDOCD")).field, "position");
        });
    });

    it("legacy bare-array entries read as manual", () => {
        if (!wv._wvAnnOrderDoc) wv._wvAnnOrderDoc = { version: 1, orders: {} };
        wv._wvAnnOrderDoc.orders["1:SPECLEGACY"] = ["A", "B"];
        const e = wv._wvAnnOrderEntry(1, "SPECLEGACY");
        assert.equal(e.mode, "manual");
        assert.deepEqual(e.keys, ["A", "B"]);
        delete wv._wvAnnOrderDoc.orders["1:SPECLEGACY"];
    });

    it("a move captures the visible order and flags only that document", async () => {
        const doc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-ann-move");
        const list = doc.createElement("div");
        list.id = "annotationsView";
        for (const k of ["A", "B", "C", "D"]) {
            const card = doc.createElement("div");
            card.className = "annotation";
            card.setAttribute("data-sidebar-annotation-id", k);
            list.appendChild(card);
        }
        doc.body.appendChild(list);
        await withAtt("SPECMOVE", async () => {
            const rd = stubReaderFor("SPECMOVE");
            await wv._wvAnnManualMove(rd, doc, "D", "B", true);
            assert.deepEqual(wv._wvAnnOrderGet(1, "SPECMOVE"), ["A", "D", "B", "C"]);
            assert.equal(wv._wvAnnSort(rd).field, "manual", "this doc flipped");
            assert.equal(wv._wvAnnSort(stubReaderFor("SPECMOVE2")).field, "position",
                "other docs untouched");
        });
    });

    it("no-ops on self-drops and unknown keys", async () => {
        const doc = Zotero.getMainWindow().document.implementation
            .createHTMLDocument("wv-ann-noop");
        await withAtt("SPECNOOP", async () => {
            await wv._wvAnnManualMove(stubReaderFor("SPECNOOP"), doc, "X", "X", true);
            await wv._wvAnnManualMove(stubReaderFor("SPECNOOP"), doc, "X", "Y", true);
            assert.deepEqual(wv._wvAnnOrderGet(1, "SPECNOOP"), []);
        });
    });
});
