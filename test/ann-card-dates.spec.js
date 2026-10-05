/* global describe, it, before, after, assert, Zotero */

// Card dates in the reader's Annotations pane (issue #49, MJT 2026-10-05):
// Date Added / Date Modified lines on every card whatever the sort, from
// two Settings defaults plus a per-document departure in ann-order.json
// `dates`; a date sort shows both, the sorted one first; each line's
// tooltip carries both full dates.

describe("Weavero — annotation card dates (#49)", () => {
    let wv, prevA, prevM;
    const P_A = "weavero.annCardDateAdded", P_M = "weavero.annCardDateModified";
    const rd = (key) => ({ itemID: -1, __specKey: key });

    before(function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv || typeof wv._wvAnnDatesShown !== "function") this.skip();
        prevA = Zotero.Prefs.get(P_A); prevM = Zotero.Prefs.get(P_M);
        Zotero.Prefs.set(P_A, false); Zotero.Prefs.set(P_M, false);
    });

    after(() => {
        if (!wv) return;
        Zotero.Prefs.set(P_A, prevA === true); Zotero.Prefs.set(P_M, prevM === true);
        for (const k of ["SPECDATES1", "SPECDATES2", "SPECDATES3"]) { try { delete wv._wvAnnOrderDoc.orders["1:" + k]; } catch (_) {} }
    });

    const withAtt = async (fn) => {
        const orig = wv._wvReaderAtt;
        wv._wvReaderAtt = (r) => ({ libraryID: 1, itemKey: r && r.__specKey, att: null });
        try { return await fn(); }
        finally { wv._wvReaderAtt = orig; }
    };

    it("the document's choice is a departure from Settings, dropped when it matches again", async () => {
        await withAtt(async () => {
            const r = rd("SPECDATES1");
            assert.deepEqual(wv._wvAnnDatesShown(r), { added: false, modified: false }, "Settings default: off");
            await wv._wvAnnSetDateShown(r, "added", true);
            assert.deepEqual(wv._wvAnnDatesShown(r), { added: true, modified: false });
            assert.deepEqual(wv._wvAnnOrderEntry(1, "SPECDATES1").dates, { added: true }, "only the departure is stored");
            assert.deepEqual(wv._wvAnnDatesShown(rd("SPECDATES2")), { added: false, modified: false }, "other documents follow Settings");
            Zotero.Prefs.set(P_A, true);
            await wv._wvAnnSetDateShown(r, "added", true);
            assert.isUndefined(wv._wvAnnOrderEntry(1, "SPECDATES1").dates, "matches Settings now: record dropped");
            Zotero.Prefs.set(P_A, false);
        });
    });

    it("a sort write keeps the dates choice; null clears it", async () => {
        await withAtt(async () => {
            await wv._wvAnnOrderWrite(1, "SPECDATES2", { mode: "position", dir: "asc", keys: [], dates: { modified: true } });
            await wv._wvAnnOrderWrite(1, "SPECDATES2", { mode: "dateAdded", dir: "desc", keys: [] });
            assert.deepEqual(wv._wvAnnOrderEntry(1, "SPECDATES2").dates, { modified: true });
            await wv._wvAnnOrderWrite(1, "SPECDATES2", { mode: "position", dir: "asc", keys: [], dates: null });
            assert.isUndefined(wv._wvAnnOrderEntry(1, "SPECDATES2").dates);
        });
    });

    it("cards show the ticked dates; a date sort shows both, sorted first; tooltips carry both", async () => {
        const doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-ann-dates");
        const list = doc.createElement("div");
        list.id = "annotationsView";
        const card = doc.createElement("div");
        card.className = "annotation";
        card.setAttribute("data-sidebar-annotation-id", "K1");
        list.appendChild(card);
        doc.body.appendChild(list);
        /** @type {any} */ (doc)._wvAnnDates = { K1: { a: { s: "A-short", f: "A-full" }, m: { s: "M-short", f: "M-full" } } };
        const lines = () => [...card.querySelectorAll(".wv-ann-date-line")].map(x => x.textContent);
        await withAtt(async () => {
            const r = rd("SPECDATES3");
            wv._wvAnnStampDates(r, doc);
            assert.deepEqual(lines(), [], "position sort, nothing ticked: no dates");
            await wv._wvAnnSetDateShown(r, "modified", true);
            wv._wvAnnStampDates(r, doc);
            assert.deepEqual(lines(), ["Modified: M-short"]);
            assert.equal(card.querySelector(".wv-ann-date").getAttribute("title"), "Date Added: A-full\nDate Modified: M-full");
            await wv._wvAnnSetDateShown(r, "added", true);
            wv._wvAnnStampDates(r, doc);
            assert.deepEqual(lines(), ["Added: A-short", "Modified: M-short"], "both ticked: Added first");
            await wv._wvAnnSetDateShown(r, "added", false);
            await wv._wvAnnSetDateShown(r, "modified", false);
            await wv._wvAnnOrderWrite(1, "SPECDATES3", { mode: "dateModified", dir: "desc", keys: [] });
            wv._wvAnnStampDates(r, doc);
            assert.deepEqual(lines(), ["Modified: M-short", "Added: A-short"], "date sort: both, the sorted one first");
        });
    });

    it("the card header's own tooltip carries both dates, keeps Zotero's '(user)', and teardown restores it", async () => {
        const doc = Zotero.getMainWindow().document.implementation.createHTMLDocument("wv-ann-head");
        const list = doc.createElement("div");
        list.id = "annotationsView";
        const card = doc.createElement("div");
        card.className = "annotation";
        card.setAttribute("data-sidebar-annotation-id", "K2");
        const prevw = doc.createElement("div");
        prevw.className = "preview";
        const hd = doc.createElement("header");
        hd.setAttribute("title", "01/01/2026 10:00:00 (Bob)");   // Zotero's: Date Modified + who
        prevw.appendChild(hd);
        card.appendChild(prevw);
        list.appendChild(card);
        doc.body.appendChild(list);
        /** @type {any} */ (doc)._wvAnnDates = { K2: { a: { s: "a", f: "A-full" }, m: { s: "m", f: "M-full" } } };
        await withAtt(async () => {
            wv._wvAnnStampDates(rd("SPECDATES1"), doc);   // nothing ticked, position sort: no lines, header still enriched
            assert.equal(hd.getAttribute("title"), "Date Added: A-full\nDate Modified: M-full (Bob)");
            assert.isNull(card.querySelector(".wv-ann-date"), "no date lines without a tick or a date sort");
            wv._wvAnnStampDates(rd("SPECDATES1"), doc);
            assert.equal(hd.getAttribute("data-wv-native-title"), "01/01/2026 10:00:00 (Bob)", "a second pass keeps Zotero's text");
            wv._wvAnnSortTeardown({}, doc);
            assert.equal(hd.getAttribute("title"), "01/01/2026 10:00:00 (Bob)", "teardown puts Zotero's tooltip back");
        });
    });
});
