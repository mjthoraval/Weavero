/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: the "Suggested links" queue (the Nodus study's idea 1, approved by
// MJT 2026-11-26). Contracts:
//  - every link a source SUGGESTED that the user has neither kept nor rejected, for
//    all researchers; a link a source confirmed (ORCID, theses.fr, IdRef), or one
//    the user chose or rejected, is not asked about;
//  - a count on the side's button; the queue in the centre pane, each link a
//    question with its years and its sources (their dates in the tooltips);
//  - Keep and Reject act at once and the row goes; the name opens the page, whose
//    Back arrow comes back to the queue.

describe("Weavero — Researchers: the Suggested links queue", function () {
    this.timeout(60000);
    let wv, lib, win;
    const recs = {};
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const rows = () => qa(".wv-pp-qrow");
    const line = (fact, value, source, status, extra) => Object.assign({ fact, value, source, status }, extra || {});

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderQueue", "_wvPeopleFactAct", "_wvPeopleCreate"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        recs.A = await wv._wvPeopleCreate("Sauret", "Alban");
        recs.A.lines.push(
            line("link.advisor", "Jacco Snoeijer", "openalex", "suggested", { years: "2008–2011", date: "2026-11-20" }),
            line("link.advisor", "Jacco Snoeijer", "wikidata", "suggested", { date: "2026-11-21" }),
            line("link.student", "Virgile Thiévenaz", "wikidata", "suggested"));
        recs.B = await wv._wvPeopleCreate("Lohse", "Detlef");
        recs.B.lines.push(line("link.advisor", "Siegfried Grossmann", "thesesfr", "confirmed"));
        recs.C = await wv._wvPeopleCreate("Bird", "James");
        recs.C.lines.push(line("link.advisor", "Howard Stone", "openalex", "rejected"));
        recs.D = await wv._wvPeopleCreate("Thoraval", "Marie-Jean");
        recs.D.lines.push(line("link.lab", "Christophe Josserand", "me", "chosen"));
        // Dates (idea 2): Sauret's PhD 2005, his advisor's (Snoeijer) 2008 -- not before; the
        // advisor link's years 2008-2011 do not hold 2005. Snoeijer's own record names Sauret
        // as a student (confirmed, so not in the queue): the same pair, one issue.
        recs.A.lines.push(line("phd.year", "2005", "me", "chosen"));
        recs.E = await wv._wvPeopleCreate("Snoeijer", "Jacco");
        recs.E.lines.push(line("phd.year", "2008", "me", "chosen"), line("link.student", "Alban Sauret", "thesesfr", "confirmed"));
        // A rejected link is not checked: Bird (2010) and Stone (2020) would clash.
        recs.C.lines.push(line("phd.year", "2010", "me", "chosen"));
        recs.F = await wv._wvPeopleCreate("Stone", "Howard");
        recs.F.lines.push(line("phd.year", "2020", "me", "chosen"));
        await wv._wvPeopleSave(Object.values(recs));
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.filter = "all"; v.view = "table";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-act='queue']"), 8000), "the button");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const k of ["people.sort", "people.show", "people.filters"]) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the queue holds the suggested links only: not the confirmed, the chosen or the rejected", function () {
        const items = lib.wvPpLinkQueue(wv._wvPeopleAllSync());
        assert.deepEqual(items.map((i) => [i.rec.last, i.fact, i.value]), [["Sauret", "link.advisor", "Jacco Snoeijer"], ["Sauret", "link.student", "Virgile Thiévenaz"]]);
        assert.lengthOf(items[0].lines, 2, "both sources of the advisor link");
        assert.strictEqual(items[0].years, "2008–2011");
        assert.strictEqual(q("[data-wv-pp-act='queue']").getAttribute("data-count"), "2", "the count on the button");
    });

    it("date checks: an advisor's PhD not before the student's, a link's years without the PhD; a pair once; a rejected link not checked", function () {
        const issues = lib.wvPpDateChecks(wv._wvPeopleAllSync());
        assert.deepEqual(issues.map((i) => [i.kind, i.rec.last, i.value]).sort(), [["advisor", "Sauret", "Jacco Snoeijer"], ["years", "Sauret", "Jacco Snoeijer"]]);
        const adv = issues.find((i) => i.kind === "advisor");
        assert.strictEqual(adv.other.id, recs.E.id, "the advisor's record found");
        assert.deepEqual([adv.year, adv.otherYear], [2005, 2008]);
    });

    it("the queue in the centre pane: each link a question, its years, its sources with their dates", async function () {
        q("[data-wv-pp-act='queue']").click();
        assert.isOk(await wvT.waitFor(() => (rows().length === 2 ? true : null), 4000, 30), "two rows");
        const r0 = rows()[0];
        assert.strictEqual(r0.getAttribute("data-wv-pp-fact"), "link.advisor");
        const text = r0.querySelector(".wv-pp-qq").textContent;
        assert.include(text, "Jacco Snoeijer");
        assert.include(text, "Alban Sauret");
        assert.include(r0.textContent, "2008–2011");
        const chips = Array.from(r0.querySelectorAll(".wv-pp-src"));
        assert.deepEqual(chips.map((c) => c.getAttribute("data-source")), ["openalex", "wikidata"]);
        assert.include(chips[0].getAttribute("title"), "2026-11-20");
        // The dates to check, above the links, each with both years in its words.
        const box = q("[data-wv-pp-queue] .wv-pp-dateissues");
        assert.isOk(box, "the dates box");
        assert.strictEqual(box.getAttribute("data-wv-pp-dates"), "2");
        const adv = box.querySelector(".wv-pp-dateissue[data-kind='advisor']").textContent;
        assert.include(adv, "2008");
        assert.include(adv, "2005");
        assert.notInclude(adv, "2,008", "years not grouped as numbers");
    });

    it("a date issue opens the record; the record's Links card says it too", async function () {
        q("[data-wv-pp-queue] .wv-pp-dateissue[data-kind='advisor']").click();
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + recs.A.id + "']") ? true : null), 4000, 30), "Sauret's page");
        assert.isOk(q("[data-wv-pp-sec='links'] .wv-pp-dateissues"), "in his Links card");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-queue]") ? true : null), 4000, 30), "back to the queue");
    });

    it("Keep: the link is the user's, its row goes, the count follows", async function () {
        rows()[0].querySelector("[data-wv-pp-do='keep']").click();
        assert.isOk(await wvT.waitFor(() => (rows().length === 1 ? true : null), 4000, 30), "one row left");
        const st = wv._wvPeopleGetRec(recs.A.id).lines.filter((l) => l.fact === "link.advisor").map((l) => l.status);
        assert.deepEqual(st, ["chosen", "chosen"]);
        assert.strictEqual(q("[data-wv-pp-act='queue']").getAttribute("data-count"), "1");
    });

    it("the name opens the page; its Back arrow comes back to the queue", async function () {
        rows()[0].querySelector(".wv-pp-qwho").click();
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-main[data-wv-pp-record='" + recs.A.id + "']") ? true : null), 4000, 30), "Sauret's page");
        q("[data-wv-pp-act='back']").click();
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-queue]") && rows().length === 1 ? true : null), 4000, 30), "the queue again");
    });

    it("Reject: the row goes; none left says so", async function () {
        rows()[0].querySelector("[data-wv-pp-do='reject']").click();
        assert.isOk(await wvT.waitFor(() => (rows().length === 0 && q("[data-wv-pp-queue] .wv-pp-hint") ? true : null), 4000, 30), "the empty queue");
        assert.deepEqual(wv._wvPeopleGetRec(recs.A.id).lines.filter((l) => l.fact === "link.student").map((l) => l.status), ["rejected"]);
        assert.strictEqual(q("[data-wv-pp-act='queue']").getAttribute("data-count"), "0");
        q("[data-wv-pp-act='queue-back']").click();
        assert.isOk(await wvT.waitFor(() => (q(".wv-pp-table") ? true : null), 4000, 30), "back to the table");
    });
});
