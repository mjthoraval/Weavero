/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: possible duplicates (the Nodus study's idea 3, approved by MJT
// 2026-11-26). Contracts:
//  - a pair is proposed on an identifier in common, or exactly the same name (or
//    one's name is the other's other form), or the same initials with the same
//    institution; never when their ORCID / IdRef / Wikidata ids differ;
//  - shown side by side in the review screen, with the reasons; a count button;
//  - Not the same: remembered on both, never proposed again;
//  - Merge: the kept record takes the other's values (not twice from one source),
//    its name as another form, its events, contact, custom fields and notes; the
//    other goes.

describe("Weavero — Researchers: possible duplicates", function () {
    this.timeout(60000);
    let wv, lib, win;
    const R = {};
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const line = (fact, value, source, status) => ({ fact, value, source, status });
    const pairs = () => lib.wvPpDuplicates(wv._wvPeopleAllSync()).map((d) => [d.a.first + "|" + d.a.last, d.b.first + "|" + d.b.last, d.reasons.join("+")]);

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderDupes", "_wvPeopleMerge", "_wvPeopleNotSame"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        // A and C share an ORCID iD; A and B have the same name and institution; D has the name
        // but ANOTHER ORCID iD (never A's or C's twin), and no id clash with B (B has none).
        R.A = await wv._wvPeopleCreate("Sauret", "Alban");
        R.A.lines.push(line("orcid", "0000-0001-7874-5983", "me", "chosen"), line("institution", "UC Santa Barbara", "me", "chosen"));
        R.B = await wv._wvPeopleCreate("Sauret", "Alban");
        R.B.lines.push(line("institution", "UC Santa Barbara", "openalex", "suggested"));
        R.C = await wv._wvPeopleCreate("Sauret", "A.");
        R.C.lines.push(line("orcid", "0000-0001-7874-5983", "orcid", "confirmed"), line("position", "Associate professor", "me", "chosen"));
        R.C.events = [{ id: "e-c1", date: "2026-11-25", what: "Seminar", where: "LadHyX" }];
        R.C.notes = "Met at APS DFD.";
        R.D = await wv._wvPeopleCreate("Sauret", "Alban");
        R.D.lines.push(line("orcid", "0000-0002-0000-0000", "me", "chosen"));
        await wv._wvPeopleSave(Object.values(R));
        wv._wvPeopleTabOpen(win, {});
        const v = wv._wvPeopleViewOf(win);
        v.sel = null; v.filter = "all"; v.view = "table";
        wv._wvPeopleTabRender(win);
        assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-act='dupes']"), 8000), "the duplicates button");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        for (const k of ["people.sort", "people.show", "people.filters"]) { try { Zotero.Prefs.clear("weavero." + k); } catch (e) {} }
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the pairs and their reasons; never two records whose ORCID iDs differ", function () {
        const ps = pairs();
        assert.sameDeepMembers(ps, [["Alban|Sauret", "A.|Sauret", "id-orcid+initials"], ["Alban|Sauret", "Alban|Sauret", "name+institution"], ["Alban|Sauret", "Alban|Sauret", "name"]]);
        const ids = lib.wvPpDuplicates(wv._wvPeopleAllSync()).map((d) => [d.a.id, d.b.id].sort().join("|"));
        for (const other of [R.A.id, R.C.id]) assert.notInclude(ids, [other, R.D.id].sort().join("|"), "D (another ORCID) never with " + other);
        assert.strictEqual(lib.wvPpDuplicates(wv._wvPeopleAllSync())[0].strength, 3, "an id in common first");
        assert.strictEqual(q("[data-wv-pp-act='dupes']").getAttribute("data-count"), "3");
    });

    it("side by side in the review screen, with the reasons", async function () {
        q("[data-wv-pp-act='dupes']").click();
        assert.isOk(await wvT.waitFor(() => (qa(".wv-pp-dupe").length === 3 ? true : null), 4000, 30), "three pairs");
        const first = qa(".wv-pp-dupe")[0];
        assert.lengthOf(first.querySelectorAll(".wv-pp-dupecard"), 2);
        assert.include(Array.from(first.querySelectorAll("[data-reason]")).map((e) => e.getAttribute("data-reason")), "id-orcid");
        assert.lengthOf(first.querySelectorAll("[data-wv-pp-do='merge']"), 2, "Merge into A, Merge into B");
    });

    it("Not the same: remembered on both, the pair goes", async function () {
        const row = qa(".wv-pp-dupe").find((r) => r.getAttribute("data-wv-pp-pair").split("|").sort().join("|") === [R.B.id, R.D.id].sort().join("|"));
        assert.isOk(row, "the B / D pair");
        row.querySelector("[data-wv-pp-do='notsame']").click();
        assert.isOk(await wvT.waitFor(() => (qa(".wv-pp-dupe").length === 2 ? true : null), 4000, 30), "two pairs left");
        assert.include(wv._wvPeopleGetRec(R.B.id).notSame, R.D.id);
        assert.include(wv._wvPeopleGetRec(R.D.id).notSame, R.B.id);
        const stored = JSON.parse(await IOUtils.readUTF8(storePath())).people.find((p) => p.id === R.B.id);
        assert.include(stored.notSame, R.D.id, "kept in people.json");
    });

    it("Merge: the kept record takes the other's values, name form, events and notes; the other goes", async function () {
        assert.isTrue(await wv._wvPeopleMerge(R.A.id, R.C.id));
        assert.isNull(wv._wvPeopleGetRec(R.C.id), "C removed");
        const a = wv._wvPeopleGetRec(R.A.id);
        assert.lengthOf(a.lines.filter((l) => l.fact === "orcid" && l.value === "0000-0001-7874-5983" && l.source === "orcid"), 1, "C's confirmed ORCID line");
        assert.lengthOf(a.lines.filter((l) => l.fact === "orcid" && l.source === "me"), 1, "A's own kept once");
        assert.isOk(a.lines.find((l) => l.fact === "position" && l.value === "Associate professor"), "C's position");
        assert.isOk(a.lines.find((l) => l.fact === "name.other" && l.value === "A. Sauret" && l.source === "me"), "C's name as another form");
        assert.deepEqual((a.events || []).map((e) => e.id), ["e-c1"]);
        assert.include(a.notes, "Met at APS DFD.");
        assert.lengthOf(wv._wvPeopleAllSync(), 3);
        assert.sameDeepMembers(pairs(), [["Alban|Sauret", "Alban|Sauret", "name+institution"]], "one pair left (A / B)");
    });
});
