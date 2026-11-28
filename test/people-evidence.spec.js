/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: evidence on the user's own values (the Nodus study's idea 4,
// approved by MJT 2026-11-26) -- e.g. the thesis acknowledgements naming the
// advisor. Contracts:
//  - "Evidence..." on a value the user typed (not on a source's): a zotero:// link
//    to an item (My Library or a group, a page), or one of the PDFs open in the
//    window at its current page; a quote;
//  - kept on the user's own line in people.json, with the item's title; a link
//    that is not one is refused;
//  - the user's chip then opens the item at its page; its tooltip says where and
//    the quote; Remove the evidence takes it off.

describe("Weavero — Researchers: evidence on the user's own values", function () {
    this.timeout(90000);
    let wv, lib, win, rec, item, pdf, reader;
    const launched = [];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const settle = () => new Promise((r) => win.setTimeout(r, 80));
    const row = (fact, value) => q("[data-wv-pp-fact='" + fact + "'] .wv-pp-val[data-value=\"" + value + "\"]");
    const field = (k) => q("[data-wv-pp-evf='" + k + "']");
    const type = (k, v) => { const el = field(k); el.value = v; el.dispatchEvent(new win.Event("input", { bubbles: true })); };
    const evOf = () => (wv._wvPeopleGetRec(rec.id).lines.find((l) => l.fact === "institution" && l.source === "me") || {}).ev;

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleRenderEvidenceForm", "_wvPeopleEvidenceSave"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        wv._launchURL = (u) => { launched.push(String(u)); };
        item = await wvT.createItem("thesis", { title: "WV-TEST evidence: a thesis that thanks its advisor" });
        rec = await wv._wvPeopleCreate("Thoraval", "Marie-Jean");
        rec.lines.push({ fact: "institution", value: "LadHyX", source: "me", status: "chosen" },
            { fact: "position", value: "Assistant Professor", source: "openalex", status: "suggested" });
        await wv._wvPeopleSave([rec]);
        // The sources and the values' buttons are the edit mode's (MJT 2026-11-26).
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.isOk(await wvT.waitFor(() => row("institution", "LadHyX"), 8000), "the institution row");
    });

    after(async function () {
        try { delete wv._launchURL; } catch (e) {}
        try { if (reader) wvT.closeReaderTab(reader); } catch (e) {}
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wvT.erase(item, pdf);
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("zotero:// links read as evidence: My Library or a group, a page; anything else is none", function () {
        assert.deepEqual(lib.wvPpEvidenceFromLink("zotero://open/library/items/ABCD1234?page=12"), { group: null, key: "ABCD1234", page: "12" });
        assert.deepEqual(lib.wvPpEvidenceFromLink("zotero://open-pdf/groups/12345/items/ABCD1234?page=iv"), { group: 12345, key: "ABCD1234", page: "iv" });
        assert.deepEqual(lib.wvPpEvidenceFromLink("zotero://select/library/items/ABCD1234"), { group: null, key: "ABCD1234" });
        assert.isNull(lib.wvPpEvidenceFromLink("https://example.org/items/ABCD1234"));
        assert.strictEqual(lib.wvPpEvidenceLink({ group: 12345, key: "ABCD1234", page: "iv" }), "zotero://open/groups/12345/items/ABCD1234?page=iv");
    });

    it("Evidence... on the user's own value only", function () {
        assert.isOk(row("institution", "LadHyX").querySelector("[data-wv-pp-do='evidence']"), "on the value the user typed");
        assert.isNull(row("position", "Assistant Professor").querySelector("[data-wv-pp-do='evidence']"), "not on a source's");
    });

    it("a link that is not one is refused; a good one is kept with the item's title and the quote", async function () {
        row("institution", "LadHyX").querySelector("[data-wv-pp-do='evidence']").click();
        await settle();
        assert.isOk(q("[data-wv-pp-evidence='institution']"), "the form");
        type("link", "not a link");
        q("[data-wv-pp-evact='save']").click();
        await settle();
        assert.isOk(q(".wv-pp-everr"), "refused");
        assert.isUndefined(evOf());
        type("link", "zotero://open/library/items/" + item.key + "?page=7");
        type("quote", "I thank my advisor, Sigurdur Thoroddsen.");
        q("[data-wv-pp-evact='save']").click();
        assert.isOk(await wvT.waitFor(() => (evOf() ? true : null), 4000, 30), "kept");
        assert.deepEqual(evOf(), { group: null, key: item.key, page: "7", quote: "I thank my advisor, Sigurdur Thoroddsen.", title: "WV-TEST evidence: a thesis that thanks its advisor" });
        // The write lands a moment after the memory: read the file until it has it.
        const storedEv = async () => {
            try {
                const p = JSON.parse(await IOUtils.readUTF8(storePath())).people.find((x) => x.id === rec.id);
                const l = p && p.lines.find((x) => x.fact === "institution" && x.source === "me");
                return (l && l.ev) || null;
            }
            catch (e) { return null; }
        };
        let st = null;
        for (let i = 0; i < 50 && !st; i++) { st = await storedEv(); if (!st) await settle(); }
        assert.strictEqual(st && st.key, item.key, "in people.json");
    });

    it("the user's chip opens the item at its page; its tooltip says where and the quote", async function () {
        assert.isOk(await wvT.waitFor(() => row("institution", "LadHyX"), 4000, 30));
        const chip = row("institution", "LadHyX").querySelector(".wv-pp-src[data-source='me']");
        assert.strictEqual(chip.getAttribute("data-wv-pp-ev"), "zotero://open/library/items/" + item.key + "?page=7");
        const tip = chip.getAttribute("title");
        assert.include(tip, "WV-TEST evidence");
        assert.include(tip, "7");
        assert.include(tip, "“I thank my advisor, Sigurdur Thoroddsen.”");
        launched.length = 0;
        chip.click();
        assert.deepEqual(launched, ["zotero://open/library/items/" + item.key + "?page=7"]);
    });

    it("a PDF open in the window is offered, at its current page", async function () {
        pdf = await wvT.createTestPDFItem("wv-evidence");
        reader = await wvT.openReaderTab(pdf.id);
        assert.isOk(reader, "a reader");
        wv._wvPeopleTabOpen(win, { personID: rec.id, edit: true });
        assert.isOk(await wvT.waitFor(() => row("institution", "LadHyX"), 8000, 50));
        row("institution", "LadHyX").querySelector("[data-wv-pp-do='evidence']").click();
        await settle();
        const offer = await wvT.waitFor(() => q("[data-wv-pp-evtabs] [data-wv-pp-evlink*='" + pdf.key + "']"), 4000, 30);
        assert.isOk(offer, "the open PDF offered");
        offer.click();
        assert.include(field("link").value, "/items/" + pdf.key);
        q("[data-wv-pp-evact='cancel']").click();
        await settle();
    });

    it("Remove the evidence takes it off", async function () {
        row("institution", "LadHyX").querySelector("[data-wv-pp-do='evidence']").click();
        await settle();
        q("[data-wv-pp-evact='remove']").click();
        assert.isOk(await wvT.waitFor(() => (!evOf() ? true : null), 4000, 30), "gone");
        assert.isNull(row("institution", "LadHyX").querySelector(".wv-pp-src[data-wv-pp-ev]"));
    });
});
