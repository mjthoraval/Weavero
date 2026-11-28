/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// A researcher's page, compact (MJT 2026-11-26 on peoplenet.14's page of Lohse:
// "This is still taking too much space. Make it more compact. Reserve the more
// advanced sources and edit buttons to the edit mode"), Google Contacts' view /
// edit split:
//   - the VIEW mode (by default): the values shown only, one line each; no
//     source chip, no agreement or disagreement line, no Add..., no add-link
//     row, no adder of events, contact or custom fields; a card with nothing to
//     show (Contact, Custom fields, Events) hidden; the header's actions as
//     icons: the star, the pencil, ⋮ (Refresh, Mark..., Remove);
//   - the EDIT mode (the pencil): everything, and Done -- with Cancel while
//     something typed is not saved yet --; it remembers nothing after Done.
// And the family tree's dates (MJT 2026-11-26: "Postdoc and PhD links are not
// limited to a single year ... it is less clear which year it is for a postdoc:
// starting or ending"): a range when both ends are known, a PhD's single year its
// graduation, another link's single end said which, a year whose end no source
// tells marked "?"; the labels never drawn over one another.
// Written before the code: every test failed on 1.3.0-peoplenet.14.

describe("Weavero — Researchers: the page's view and edit modes; the family tree's dates", function () {
    this.timeout(90000);
    let wv, lib, win, doc, rec;
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const txt = (el) => String((el && el.textContent) || "").replace(/[⁨⁩]/g, "");
    const L = (fact, value, source, status, more) => Object.assign({ fact, value, source, status }, more || {});
    const mode = () => { const m = q(".wv-pp-main[data-wv-pp-record]"); return m ? m.getAttribute("data-wv-pp-mode") : null; };
    const EDIT_ONLY = [".wv-pp-src", "[data-wv-pp-agree]", "[data-wv-pp-conflict]", "[data-wv-pp-do='add']", ".wv-pp-vbtns",
        "[data-wv-pp-act='event-add']", "[data-wv-pp-act='contact-add']", "[data-wv-pp-act='custom-add']", ".wv-pp-linkadd"];

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        for (const m of ["_wvPeopleTabOpen", "_wvPeoplePageEdit", "_wvPeoplePageStaged", "_wvLtEdgeLabel", "_wvLtLabelSpots", "_wvPeopleCacheWrite"]) wvT.method(m);
        for (const f of ["wvLtWhen", "wvLtDate", "wvLtPlaceLabels", "wvPpWorks", "wvPpWorksHidden", "wvPpWorkIsDoiOnly"]) if (!lib || typeof lib[f] !== "function") wvT.absent("Zotero.Weavero.lib." + f);
        win = Zotero.getMainWindow(); doc = win.document;
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        // His co-advisor, a researcher of the list, whose own PhD advisor is Lohse's: two
        // links leave that advisor's card on the tree (their labels at one spot).
        const co = await wv._wvPeopleCreate("Coadv", "Carl");
        co.lines.push(L("link.advisor", "Siegfried Grossmann", "me", "chosen", { years: "1985" }));
        await wv._wvPeopleSave([co]);
        rec = await wv._wvPeopleCreate("Lohse", "Detlef");
        rec.check = false;
        rec.lines.push(L("link.coadvisor", "Carl Coadv", "me", "chosen"));
        rec.lines.push(
            L("orcid", "0000-0003-4138-2255", "me", "chosen"),
            // Two sources disagree on the institution (the confirmed one shown).
            L("institution", "University of Twente", "orcid", "confirmed"),
            L("institution", "Twente", "openalex", "suggested"),
            // Two sources agree on the PhD year.
            L("phd.year", "1992", "orcid", "confirmed"),
            L("phd.year", "1992", "thesesfr", "confirmed"),
            // A value the user rejected.
            L("position", "Dean", "openalex", "rejected"),
            // His PhD advisor, and a postdoc with the same person (two links one path), dated;
            // a postdoc with one year, no source telling which end.
            L("link.advisor", "Siegfried Grossmann", "me", "chosen", { years: "1992" }),
            L("link.postdoc", "Siegfried Grossmann", "me", "chosen", { years: "1993–1995" }),
            L("link.postdoc", "Andrea Prosperetti", "me", "chosen", { years: "1990" }));
        await wv._wvPeopleSave([rec]);
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        assert.isOk(await wvT.waitFor(() => (mode() === "view" ? true : null), 8000, 40), "the page, in the view mode");
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the view mode: the values shown only, no source, no Add..., no adder; cards with nothing hidden; the header's icons", async function () {
        for (const sel of EDIT_ONLY) assert.lengthOf(qa(sel), 0, "nothing of the edit mode: " + sel);
        assert.deepEqual(qa("[data-wv-pp-fact='institution'] .wv-pp-val").map((v) => v.getAttribute("data-value")), ["University of Twente"], "the value shown alone");
        assert.isNull(q("[data-wv-pp-fact='position']"), "a rejected value: no field");
        assert.deepEqual(qa("[data-wv-pp-fact='phd.year'] .wv-pp-val").map((v) => v.getAttribute("data-value")), ["1992"]);
        assert.isNull(q("[data-wv-pp-sec='contact']"), "no Contact card");
        assert.isNull(q("[data-wv-pp-sec='custom']"), "no Custom fields card");
        assert.isNull(q("[data-wv-pp-sec='events']"), "no Events card");
        assert.isOk(q("[data-wv-pp-sec='ids']") && q("[data-wv-pp-sec='facts']") && q("[data-wv-pp-sec='links']"), "the cards with values");
        assert.isOk(q("[data-wv-pp-sec='tree']"), "the family tree, as before");
        assert.deepEqual(qa(".wv-pp-head .wv-pp-actions [data-wv-pp-act]").map((b) => b.getAttribute("data-wv-pp-act")), ["follow", "page-edit", "more"], "three icons");
        assert.strictEqual(txt(q("[data-wv-pp-act='follow']")), "☆");
        // One line per value: no box.
        const val = q("[data-wv-pp-fact='institution'] .wv-pp-val");
        assert.strictEqual(win.getComputedStyle(val).paddingTop, "0px", "compact");
        // ⋮: Refresh, Mark as checked / to check, Remove.
        q("[data-wv-pp-act='more']").click();
        const pop = await wvT.waitFor(() => doc.getElementById("wv-pp-pagemenu"), 3000, 30);
        assert.isOk(pop, "the menu");
        assert.deepEqual(Array.from(pop.querySelectorAll("menuitem")).map((m) => m.getAttribute("data-wv-pp-rmenu")), ["refresh", "check", "remove"]);
        try { pop.hidePopup(); } catch (e) {}
    });

    it("the edit mode: the sources, agreement and disagreement, every Add..., the add-link row, the adders; Done; Cancel once something is typed", async function () {
        q("[data-wv-pp-act='page-edit']").click();
        assert.isOk(await wvT.waitFor(() => (mode() === "edit" ? true : null), 4000, 30), "the edit mode");
        for (const sel of EDIT_ONLY) assert.isAbove(qa(sel).length, 0, "the edit mode's: " + sel);
        assert.lengthOf(qa("[data-wv-pp-fact='institution'] .wv-pp-val"), 2, "both institutions, side by side");
        assert.isOk(q("[data-wv-pp-fact='position'] .wv-pp-val[data-status='rejected']"), "the rejected one, struck through");
        assert.isOk(q("[data-wv-pp-sec='contact']") && q("[data-wv-pp-sec='custom']") && q("[data-wv-pp-sec='events']"), "every card");
        assert.isOk(q("[data-wv-pp-act='page-done']"), "Done");
        assert.isNull(q("[data-wv-pp-act='page-cancel']"), "no Cancel while nothing is typed");
        assert.isNull(q("[data-wv-pp-act='page-edit']"), "Done in the pencil's place");
        // A value typed: Cancel shows; Done saves it and leaves the edit mode.
        q("[data-wv-pp-fact='position'] [data-wv-pp-do='add']") && q("[data-wv-pp-fact='position'] [data-wv-pp-do='add']").click();
        const inp = await wvT.waitFor(() => q("[data-wv-pp-editing='position'] input"), 3000, 30);
        assert.isOk(inp, "the field");
        inp.value = "Professor";
        assert.isTrue(wv._wvPeoplePageStaged(win), "something typed");
        assert.isOk(q("[data-wv-pp-act='page-cancel']"), "Cancel");
        q("[data-wv-pp-act='page-done']").click();
        assert.isOk(await wvT.waitFor(() => (mode() === "view" && rec.lines.some((l) => l.fact === "position" && l.value === "Professor" && l.source === "me") ? true : null), 4000, 30), "saved by Done, the view mode");
        assert.deepEqual(qa("[data-wv-pp-fact='position'] .wv-pp-val").map((v) => v.getAttribute("data-value")), ["Professor"]);
        // Cancel drops what was typed.
        await wv._wvPeoplePageEdit(win, true);
        q("[data-wv-pp-act='event-add']").click();
        const what = await wvT.waitFor(() => q("[data-wv-pp-evfield='what']"), 3000, 30);
        what.value = "Seminar";
        what.dispatchEvent(new win.Event("input", { bubbles: true }));
        assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-act='page-cancel']"), 3000, 30), "Cancel");
        q("[data-wv-pp-act='page-cancel']").click();
        assert.isOk(await wvT.waitFor(() => (mode() === "view" ? true : null), 3000, 30));
        assert.isUndefined(rec.events, "nothing stored");
        // It remembers nothing: no form open the next time.
        await wv._wvPeoplePageEdit(win, true);
        assert.isNull(q("[data-wv-pp-evform]"), "no event form left");
        assert.isNull(q("[data-wv-pp-editing]"), "no value editor left");
        await wv._wvPeoplePageEdit(win, false, "done");
        // Another record opens in the view mode.
        await wv._wvPeoplePageEdit(win, true);
        const other = await wv._wvPeopleCreate("Grossmann", "Siegfried");
        wv._wvPeopleTabOpen(win, { personID: other.id });
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-record='" + other.id + "']") && mode() === "view" ? true : null), 4000, 30), "another record: the view mode");
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-record='" + rec.id + "']") && mode() === "view" ? true : null), 4000, 30), "and back: the view mode");
        await wv._wvPeopleRemove(other.id);
    });

    it("the family tree's dates: a range, a PhD's year, one end said which, a year of unknown end with a ?", function () {
        const when = (type, years, end) => lib.wvLtWhen({ type, years, end });
        assert.deepEqual(when("postdoc", "1993–1995"), { kind: "range", from: "1993", to: "1995" });
        assert.deepEqual(when("postdoc", "1993-1995"), { kind: "range", from: "1993", to: "1995" }, "a hyphen between two years");
        assert.deepEqual(when("phd", "1960"), { kind: "end", from: "", to: "1960" }, "a PhD's year: its graduation");
        assert.deepEqual(when("phd", "1960", true), { kind: "end", from: "", to: "1960" });
        assert.deepEqual(when("postdoc", "1995", true), { kind: "until", from: "", to: "1995" }, "the Academic Family Tree's stopdate: the end");
        assert.deepEqual(when("postdoc", "1993–"), { kind: "from", from: "1993", to: "" });
        assert.deepEqual(when("ra", "–1995"), { kind: "until", from: "", to: "1995" });
        assert.deepEqual(when("postdoc", "1995"), { kind: "unknown", from: "1995", to: "" }, "a year no source tells the end of");
        assert.deepEqual(when("postdoc", "1995–1995"), { kind: "end", from: "", to: "1995" });
        assert.deepEqual(when("phd", "2013-10-24", true), { kind: "end", from: "", to: "2013-10-24" }, "a date, kept whole");
        assert.deepEqual(when("phd", "2005-00-00", true), { kind: "end", from: "", to: "2005" }, "the dump's year alone");
        assert.deepEqual(when("phd", ""), { kind: "none", from: "", to: "" });
        const label = (type, years, end, co) => txt({ textContent: wv._wvLtEdgeLabel({ mentor: "a", trainee: "b", type, years, end, co, src: "people" }) });
        assert.strictEqual(label("postdoc", "1993–1995"), "Postdoc 1993–1995");
        assert.strictEqual(label("phd", "1960"), "PhD 1960");
        assert.strictEqual(label("phd", "1960", false, true), "Co-advisor 1960");
        assert.strictEqual(label("postdoc", "1993–"), "Postdoc from 1993");
        assert.strictEqual(label("postdoc", "1995", true), "Postdoc until 1995");
        assert.strictEqual(label("research", "1995", true), "Research scientist until 1995");
        assert.strictEqual(label("postdoc", "1995"), "Postdoc 1995?");
        assert.strictEqual(label("postdoc", ""), "Postdoc");
        const full = label("phd", "2013-10-24", true);
        assert.match(full, /^PhD .*2013/, full);
        assert.match(full, /24/, "the day, as the source has it: " + full);
        // Two labels at one anchor: the second a line further; elsewhere, where they are.
        const at = lib.wvLtPlaceLabels([{ x: 10, y: 50, text: "PhD 1955", dir: 1 }, { x: 12, y: 50, text: "1948", dir: 1 }, { x: 300, y: 50, text: "Postdoc 1930", dir: -1 }]);
        assert.deepEqual(at[0], { x: 10, y: 50 });
        assert.strictEqual(at[1].y, 65, "moved down a line");
        assert.deepEqual(at[2], { x: 300, y: 50 }, "no overlap: left alone");
    });

    // MJT 2026-11-26, on Thoraval's Publications ("10.1063/5.0129427.8", ".6", ...): AIP's
    // supplementary files, datasets titled by their DOI in Crossref and OpenAlex. "Hide them entirely".
    it("Publications: a work titled by a DOI alone is never listed nor counted; its article stays", async function () {
        const art = { id: "https://openalex.org/W9990001", doi: "https://doi.org/10.1063/5.0129427", display_name: "Drop impact on a thin film", publication_year: 2022, type: "article", authorships: [] };
        const sup = { id: "https://openalex.org/W9990002", doi: "https://doi.org/10.1063/5.0129427.8", display_name: "10.1063/5.0129427.8", publication_year: 2022, type: "dataset", authorships: [] };
        const page = { meta: { count: 2 }, results: [art, sup] };
        assert.deepEqual(lib.wvPpWorks(page).map((w) => w.id), ["W9990001"], "the article alone");
        assert.strictEqual(lib.wvPpWorksHidden(page), 1);
        assert.isTrue(lib.wvPpWorkIsDoiOnly({ title: "10.1063/5.0086745.4", doi: "" }), "any bare DOI");
        assert.isTrue(lib.wvPpWorkIsDoiOnly({ title: "https://doi.org/10.1063/5.0086745.4" }), "as a link too");
        assert.isTrue(lib.wvPpWorkIsDoiOnly({ title: "abc", doi: "ABC" }), "its own DOI");
        assert.isFalse(lib.wvPpWorkIsDoiOnly({ title: "Drop impact on a thin film", doi: "10.1063/5.0129427" }));
        // A cache written before this build still holds the supplementary file: not shown, not counted.
        const r = await wv._wvPeopleCreate("Supplementary", "Wv");
        r.lines.push(L("openalex", "A9990009", "openalex", "confirmed"));
        await wv._wvPeopleSave([r]);
        const work = (w) => ({ id: w.id.replace(/^.*\//, ""), doi: w.doi.replace(/^https:\/\/doi\.org\//, ""), title: w.display_name, year: 2022, venue: "", authors: [], nAuthors: 0, type: w.type === "article" ? "journalArticle" : "dataset" });
        await wv._wvPeopleCacheWrite(r.id, { v: 1, date: "2026-11-26T01:00:00.000Z", raw: {}, works: [work(art), work(sup)], worksCount: 2 });
        wv._wvPeopleTabOpen(win, { personID: r.id });
        const rows = () => qa("[data-wv-pp-works='openalex'] [data-wv-pp-work]").map((e) => e.getAttribute("data-wv-pp-work"));
        assert.isOk(await wvT.waitFor(() => (rows().length && q("[data-wv-pp-inlib]") ? true : null), 10000, 50), "the list");
        assert.deepEqual(rows(), ["W9990001"], "the article row stays, the DOI-titled one is gone");
        assert.match(txt(q("[data-wv-pp-inlib]")), /0\D+1\b/, "0 in your libraries, of 1: " + txt(q("[data-wv-pp-inlib]")));
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        await wv._wvPeopleRemove(r.id);
    });

    it("in the tree: the labels as the rules say, none drawn over another; the unknown end in the tooltip", async function () {
        wv._wvPeopleTabOpen(win, { personID: rec.id });
        const labels = () => qa("[data-wv-pp-sec='tree'] .wv-pp-lt-elabel");
        assert.isOk(await wvT.waitFor(() => (labels().length >= 3 ? true : null), 8000, 40), "the tree's labels: " + labels().map(txt).join(" | "));
        // A label's own text (its tooltip, an SVG <title> inside it, left out).
        const own = (t) => Array.from(t.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").replace(/[⁨⁩]/g, "");
        const texts = labels().map(own);
        // The advisor and postdoc host the same person: one path, one label naming both.
        assert.includeMembers(texts, ["PhD 1992 · Postdoc 1993–1995", "Postdoc 1990?", "PhD 1985"], texts.join(" | "));
        const unk = labels().find((t) => own(t) === "Postdoc 1990?");
        assert.strictEqual(unk.getAttribute("data-wv-lt-when"), "unknown");
        assert.include(txt(unk.querySelector("title")), "1990");
        // Grossmann's two links (to Lohse, to his co-advisor) leave his card at one spot:
        // their labels stacked, none over another.
        const boxes = labels().map((t) => t.getBBox());
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
                assert.isFalse(overlap, "\"" + texts[i] + "\" and \"" + texts[j] + "\" overlap");
            }
        }
    });
});
