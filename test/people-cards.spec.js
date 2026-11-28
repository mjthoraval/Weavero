/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: the Contact card and the custom fields (MJT 2026-11-25, the Google
// Contacts design, approved). Contracts:
//  - Contact: emails, phones, addresses (several lines), websites, several of each,
//    each labelled Work / Home / Mobile (a phone only) / Other or one's own words;
//    shown by kind; an email opens mailto:, a phone tel:, a website itself, an
//    address offers a map search on OpenStreetMap whose tooltip says so;
//    Save refuses what the kind does not accept;
//  - custom fields: a label (the ones used on other researchers offered) and a
//    value; a web address is a link;
//  - Edit / Remove under the mouse and by a right-click;
//  - stored in people.json, the user's own; a stored line that is not one is
//    dropped on load.

describe("Weavero — Researchers: the Contact card and the custom fields", function () {
    this.timeout(60000);
    let wv, lib, win, rec, other;
    const launched = [];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const readStore = async () => { try { return JSON.parse(await IOUtils.readUTF8(storePath())); } catch (e) { return null; } };
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const settle = () => new Promise((r) => win.setTimeout(r, 60));
    const field = (key) => q("[data-wv-pp-cfield='" + key + "']");
    const type = (key, value) => {
        const el = field(key);
        assert.isOk(el, "the " + key + " field");
        el.value = value;
        el.dispatchEvent(new win.Event(el.tagName.toLowerCase() === "select" ? "change" : "input", { bubbles: true }));
    };
    const save = async () => { q("[data-wv-pp-cact='save']").click(); await settle(); };
    const stored = async (key) => {
        const s = await readStore();
        const r = s && s.people.find((p) => p.id === rec.id);
        return (r && r[key]) || [];
    };

    async function addContact(kind, label, value, own) {
        q("[data-wv-pp-act='contact-add']").click();
        await settle();
        if (kind !== "email") { type("kind", kind); await settle(); }
        if (label) { type("label", label); await settle(); }
        if (own) type("custom", own);
        type("value", value);
        await save();
    }

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderContact", "_wvPeopleRenderCustom", "_wvPeopleCardSave", "_wvPeopleCardRemove"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        wv._launchURL = (u) => { launched.push(String(u)); };
        other = await wv._wvPeopleCreate("Lohse", "Detlef");
        other.custom = [{ id: "f1", label: "Group", value: "Physics of Fluids" }, { id: "f2", label: "Office", value: "B-12" }];
        rec = await wv._wvPeopleCreate("Thoroddsen", "Sigurdur");
        other.custom.push({ id: "f3", label: "Group", value: "x" });
        await wv._wvPeopleSave([other]);
        // The cards' Add and row buttons are the edit mode's (MJT 2026-11-26).
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-sec='contact']"), 8000), "the Contact card");
    });

    after(async function () {
        try { delete wv._launchURL; } catch (e) {}
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("empty cards: their titles, Add, a hint", function () {
        assert.isOk(q("[data-wv-pp-sec='contact'] .wv-pp-sectitle [data-wv-pp-act='contact-add']"));
        assert.isOk(q("[data-wv-pp-sec='custom'] .wv-pp-sectitle [data-wv-pp-act='custom-add']"));
        assert.isOk(q("[data-wv-pp-sec='contact'] .wv-pp-muted"));
        assert.isOk(q("[data-wv-pp-sec='custom'] .wv-pp-muted"));
    });

    it("Save refuses what the kind does not accept: a bad email, a phone without digits", async function () {
        q("[data-wv-pp-act='contact-add']").click();
        await settle();
        type("value", "sigurdur at kaust");
        await save();
        assert.isOk(q(".wv-pp-everr"), "not an email");
        type("kind", "phone");
        await settle();
        type("value", "call me");
        await save();
        assert.isOk(q(".wv-pp-everr"), "not a phone");
        assert.lengthOf(await stored("contact"), 0);
        q("[data-wv-pp-cact='cancel']").click();
        await settle();
    });

    it("Mobile is offered for a phone only", async function () {
        q("[data-wv-pp-act='contact-add']").click();
        await settle();
        const opts = () => Array.from(field("label").options).map((o) => o.value);
        assert.notInclude(opts(), "mobile", "not for an email");
        type("kind", "phone");
        await settle();
        assert.include(opts(), "mobile");
        assert.include(opts(), "custom");
        q("[data-wv-pp-cact='cancel']").click();
        await settle();
    });

    it("an email, a mobile phone, an address on two lines, a website with a label of one's own: stored and shown by kind", async function () {
        await addContact("web", "custom", "www.kaust.edu.sa/thoroddsen", "Lab page");
        await addContact("email", "work", "sigurdur.thoroddsen@kaust.edu.sa");
        await addContact("address", "work", "KAUST, Building 4\n  Thuwal 23955, Saudi Arabia  ");
        await addContact("phone", "mobile", "+966 12 808 0000");
        const c = await stored("contact");
        assert.lengthOf(c, 4);
        assert.deepInclude(c.map((x) => ({ kind: x.kind, label: x.label, value: x.value })), { kind: "web", label: "Lab page", value: "https://www.kaust.edu.sa/thoroddsen" });
        assert.deepInclude(c.map((x) => ({ kind: x.kind, label: x.label, value: x.value })), { kind: "address", label: "work", value: "KAUST, Building 4\nThuwal 23955, Saudi Arabia" });
        assert.deepEqual(qa("[data-wv-pp-sec='contact'] .wv-pp-crow").map((r) => r.getAttribute("data-kind")), ["email", "phone", "address", "web"]);
    });

    it("each opens what it is: mailto:, tel:, the website; the address offers OpenStreetMap, the tooltip says so", function () {
        launched.length = 0;
        for (const kind of ["email", "phone", "web"]) q("[data-wv-pp-sec='contact'] .wv-pp-crow[data-kind='" + kind + "'] .wv-pp-cval").click();
        assert.deepEqual(launched, ["mailto:sigurdur.thoroddsen@kaust.edu.sa", "tel:+966128080000", "https://www.kaust.edu.sa/thoroddsen"]);
        const map = q("[data-wv-pp-sec='contact'] .wv-pp-crow[data-kind='address'] .wv-pp-cmap");
        assert.include(map.getAttribute("title"), "openstreetmap.org");
        map.click();
        assert.strictEqual(launched[3], "https://www.openstreetmap.org/search?query=" + encodeURIComponent("KAUST, Building 4, Thuwal 23955, Saudi Arabia"));
        assert.include(q("[data-wv-pp-sec='contact'] .wv-pp-crow[data-kind='web'] .wv-pp-clabel").textContent, "Lab page");
    });

    it("a right-click on a row offers Edit and Remove; Edit keeps the line's place", async function () {
        const row = q("[data-wv-pp-sec='contact'] .wv-pp-crow[data-kind='email']");
        row.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
        const pop = await wvT.waitFor(() => win.document.getElementById("wv-pp-row-menu"), 3000, 30);
        assert.isOk(pop, "the menu");
        const items = Array.from(pop.querySelectorAll("menuitem")).map((m) => m.getAttribute("data-wv-pp-cact"));
        assert.deepEqual(items, ["edit", "remove"]);
        pop.querySelector("menuitem[data-wv-pp-cact='edit']").doCommand();
        try { pop.hidePopup(); } catch (e) {}
        await settle();
        assert.strictEqual(field("value").value, "sigurdur.thoroddsen@kaust.edu.sa");
        type("label", "home");
        await save();
        const c = await stored("contact");
        assert.lengthOf(c, 4);
        assert.strictEqual(c.find((x) => x.kind === "email").label, "home");
    });

    it("custom fields: the labels used on others offered, most used first; a web address is a link", async function () {
        q("[data-wv-pp-act='custom-add']").click();
        await settle();
        const sugg = qa("[data-wv-pp-csugg='label'] button").map((b) => b.textContent);
        assert.deepEqual(sugg.slice(0, 2), ["Group", "Office"]);
        qa("[data-wv-pp-csugg='label'] button")[0].click();
        assert.strictEqual(field("label").value, "Group");
        type("value", "https://fluids.kaust.edu.sa");
        await save();
        const f = await stored("custom");
        assert.deepEqual(f.map((x) => [x.label, x.value]), [["Group", "https://fluids.kaust.edu.sa"]]);
        launched.length = 0;
        q("[data-wv-pp-sec='custom'] .wv-pp-cval").click();
        assert.deepEqual(launched, ["https://fluids.kaust.edu.sa/"]);
        q("[data-wv-pp-act='custom-add']").click();
        await settle();
        type("label", "Office");
        await save();
        assert.isOk(q(".wv-pp-everr"), "a value is needed");
        q("[data-wv-pp-cact='cancel']").click();
        await settle();
    });

    it("Remove takes a line out; the last one gone, no key is left", async function () {
        for (const c of await stored("contact")) assert.isTrue(await wv._wvPeopleCardRemove(rec.id, "contact", c.id));
        for (const c of await stored("custom")) assert.isTrue(await wv._wvPeopleCardRemove(rec.id, "custom", c.id));
        const s = await readStore();
        const r = s.people.find((p) => p.id === rec.id);
        assert.notProperty(r, "contact");
        assert.notProperty(r, "custom");
    });

    it("a stored line that is not one is dropped on load", function () {
        const r = lib.wvPpNormalizeRecord({ id: "p-x", last: "X", first: "", lines: [],
            contact: [{ kind: "email", label: "work", value: "a@b.co" }, { kind: "email", value: "nope" }, { kind: "fax", value: "123" }, { kind: "web", value: "javascript:alert(1)" }, { kind: "phone", value: "+1 (555) 010-2000" }],
            custom: [{ label: "Group", value: "PoF" }, { label: "", value: "x" }, { label: "y", value: " " }] });
        assert.deepEqual(r.contact.map((c) => [c.kind, c.label, c.value]), [["email", "work", "a@b.co"], ["phone", "other", "+1 (555) 010-2000"]]);
        assert.deepEqual(r.custom.map((c) => [c.label, c.value]), [["Group", "PoF"]]);
    });
});
