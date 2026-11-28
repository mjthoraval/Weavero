/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: dated events (MJT 2026-11-25: "add information for researchers on
// some dated events, such as giving a seminar in LadHyX, with the link to the
// seminar announcement"; approved as proposed). Contracts:
//  - an Events card on the researcher's page, "Add an event" in its title;
//  - an event = a date (day, month or year), what, where, a link, a note;
//    Save refuses a bad date, an empty What and a link that is no web address;
//  - newest first; a month or a year after the days in it;
//  - What offers the kinds used before, most used first, then Seminar, Visit,
//    Conference talk, Jury; Where the places used before;
//  - the link opens on a click, its address in the tooltip;
//  - Edit keeps the event's id; Escape cancels; Remove takes it out;
//  - stored in people.json, the user's own data; a stored event that is not
//    one is dropped on load, a link that is no web address too.

describe("Weavero — Researchers: dated events", function () {
    this.timeout(60000);
    let wv, lib, win, rec;
    const launched = [];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const readStore = async () => { try { return JSON.parse(await IOUtils.readUTF8(storePath())); } catch (e) { return null; } };
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const sec = () => q("[data-wv-pp-sec='events']");
    const rows = () => qa("[data-wv-pp-sec='events'] .wv-pp-ev");
    const type = (key, value) => {
        const el = q("[data-wv-pp-evfield='" + key + "']");
        assert.isOk(el, "the " + key + " field");
        el.value = value;
        el.dispatchEvent(new win.Event("input", { bubbles: true }));
    };
    const click = (el) => { assert.isOk(el); el.click(); };
    const settle = () => new Promise((r) => win.setTimeout(r, 60));
    const stored = async () => {
        const s = await readStore();
        const r = s && s.people.find((p) => p.id === rec.id);
        return (r && r.events) || [];
    };

    async function add(fields) {
        click(q("[data-wv-pp-act='event-add']"));
        await settle();
        for (const k of Object.keys(fields)) type(k, fields[k]);
        click(q("[data-wv-pp-evact='save']"));
        await wvT.waitFor(() => (!q("[data-wv-pp-evform]") ? true : null), 4000, 30);
        await settle();
    }

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderEvents", "_wvPeopleEventSave", "_wvPeopleEventRemove", "_wvPeopleCreate", "_wvPeopleTabOpen", "_wvPeopleRootOf"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        wv._launchURL = (u) => { launched.push(String(u)); };
        rec = await wv._wvPeopleCreate("Thoroddsen", "Sigurdur");
        // Add an event and the rows' buttons are the edit mode's (MJT 2026-11-26).
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.isOk(await wvT.waitFor(() => sec(), 8000), "the Events card");
    });

    after(async function () {
        try { delete wv._launchURL; } catch (e) {}
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("an empty card: its title, Add an event, a hint", function () {
        assert.isOk(q("[data-wv-pp-sec='events'] .wv-pp-sectitle [data-wv-pp-act='event-add']"), "Add in the card's title");
        assert.isOk(q("[data-wv-pp-sec='events'] .wv-pp-muted"), "the empty hint");
        assert.lengthOf(rows(), 0);
    });

    it("Save refuses a bad date, an empty What and a link that is no web address; then saves", async function () {
        click(q("[data-wv-pp-act='event-add']"));
        await settle();
        type("date", "25/11/2026");
        type("what", "Seminar");
        click(q("[data-wv-pp-evact='save']"));
        await settle();
        assert.isOk(q(".wv-pp-everr"), "the date refused");
        assert.lengthOf(await stored(), 0, "nothing stored");
        type("date", "2026-11-25");
        type("what", "  ");
        click(q("[data-wv-pp-evact='save']"));
        await settle();
        assert.isOk(q(".wv-pp-everr"), "What needed");
        type("what", "Seminar");
        type("link", "javascript:alert(1)");
        click(q("[data-wv-pp-evact='save']"));
        await settle();
        assert.isOk(q(".wv-pp-everr"), "not a web address");
        type("where", "LadHyX");
        type("link", "www.ladhyx.polytechnique.fr/seminar/2026-11-25");
        type("note", "Drop impact on thin films");
        click(q("[data-wv-pp-evact='save']"));
        await wvT.waitFor(() => (rows().length === 1 ? true : null), 4000, 30);
        const ev = await stored();
        assert.lengthOf(ev, 1);
        assert.include(ev[0], { date: "2026-11-25", what: "Seminar", where: "LadHyX", link: "https://www.ladhyx.polytechnique.fr/seminar/2026-11-25", note: "Drop impact on thin films" });
        assert.match(ev[0].id, /^e/);
    });

    it("the link opens on a click, its address in the tooltip", function () {
        const a = q("[data-wv-pp-sec='events'] .wv-pp-evlink");
        assert.strictEqual(a.getAttribute("title"), "https://www.ladhyx.polytechnique.fr/seminar/2026-11-25");
        launched.length = 0;
        a.click();
        assert.deepEqual(launched, ["https://www.ladhyx.polytechnique.fr/seminar/2026-11-25"]);
    });

    it("newest first; a month or a year after the days in it", async function () {
        await add({ date: "2025-03", what: "Visit", where: "KAUST" });
        await add({ date: "2026-11", what: "Jury" });
        await add({ date: "2026-12-02", what: "Conference talk" });
        const order = rows().map((r) => r.querySelector(".wv-pp-evdate").getAttribute("title"));
        assert.deepEqual(order, ["2026-12-02", "2026-11-25", "2026-11", "2025-03"]);
    });

    it("What offers the kinds used before, most used first, then the usual ones; a click fills the field", async function () {
        await add({ date: "2024-06-10", what: "Seminar" });
        click(q("[data-wv-pp-act='event-add']"));
        await settle();
        const sugg = qa("[data-wv-pp-evsugg='what'] button").map((b) => b.textContent);
        assert.strictEqual(sugg[0], "Seminar", "used twice: first");
        for (const k of ["Visit", "Jury", "Conference talk"]) assert.include(sugg, k);
        assert.lengthOf(sugg.filter((s) => s.toLowerCase() === "seminar"), 1, "once");
        const where = qa("[data-wv-pp-evsugg='where'] button").map((b) => b.textContent);
        assert.includeMembers(where, ["LadHyX", "KAUST"]);
        qa("[data-wv-pp-evsugg='what'] button").find((b) => b.textContent === "Jury").click();
        assert.strictEqual(q("[data-wv-pp-evfield='what']").value, "Jury");
    });

    it("Escape cancels: the form goes, nothing is stored", async function () {
        const before = (await stored()).length;
        const f = q("[data-wv-pp-evfield='date']");
        f.value = "2020";
        f.dispatchEvent(new win.Event("input", { bubbles: true }));
        f.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();
        assert.isNull(q("[data-wv-pp-evform]"));
        assert.lengthOf(await stored(), before);
    });

    it("Edit keeps the event's id and changes it in place", async function () {
        const row = rows().find((r) => r.querySelector(".wv-pp-evdate").getAttribute("title") === "2025-03");
        const id = row.getAttribute("data-wv-pp-event");
        click(row.querySelector("[data-wv-pp-evact='edit']"));
        await settle();
        assert.strictEqual(q("[data-wv-pp-evform]").getAttribute("data-wv-pp-evform"), id);
        assert.strictEqual(q("[data-wv-pp-evfield='where']").value, "KAUST");
        type("where", "KAUST, Thuwal");
        click(q("[data-wv-pp-evact='save']"));
        await wvT.waitFor(() => (!q("[data-wv-pp-evform]") ? true : null), 4000, 30);
        const ev = await stored();
        assert.lengthOf(ev, 5);
        assert.strictEqual(ev.find((e) => e.id === id).where, "KAUST, Thuwal");
    });

    it("Remove takes it out; the last one gone, no events key is left", async function () {
        for (const e of await stored()) assert.isTrue(await wv._wvPeopleEventRemove(rec.id, e.id));
        await settle();
        assert.lengthOf(rows(), 0);
        const s = await readStore();
        assert.notProperty(s.people.find((p) => p.id === rec.id), "events");
    });

    it("a stored event that is not one is dropped on load; a link that is no web address too", function () {
        const r = lib.wvPpNormalizeRecord({ id: "p-x", last: "X", first: "", lines: [], events: [
            { id: "e1", date: "2026-11-25", what: "Seminar", link: "javascript:alert(1)" },
            { id: "e2", date: "2026-13", what: "Seminar" },
            { id: "e3", date: "2026", what: "" },
            { id: "e4", date: "2026-02-30x", what: "Visit" },
        ] });
        assert.lengthOf(r.events, 1);
        assert.deepEqual(r.events[0], { id: "e1", date: "2026-11-25", what: "Seminar" });
        assert.strictEqual(lib.wvPpEventDate("2026"), "2026");
        assert.match(lib.wvPpEventDate("2026-11-25", "en-US"), /Nov.*25.*2026/);
        assert.match(lib.wvPpEventDate("2026-11", "fr-FR"), /nov.*2026/i);
    });
});
