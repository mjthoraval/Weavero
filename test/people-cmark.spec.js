/* global describe, it, before, after, assert, Zotero, IOUtils, PathUtils, InspectorUtils */

// Researchers' authors marked in the item pane's Info section (MJT 2026-11-26,
// "Authors who have a profile in Researchers should be identified"; an
// initials-only match lighter; "make sure it does not interfere with the hover
// icons"; then "Try moving the author icon to the left side", and "make the icon
// blue ... same color in the tab header and in the author icon"). The icon sits
// in the row's label cell right before "Author", clear of Zotero's drag handle;
// the name keeps its whole width and Zotero's switch / minus / plus / options
// buttons on the right meet nothing of Weavero. A click on the icon opens the
// person's page. Nothing is written to any library.

describe("Weavero — Researchers' authors marked in the Info section", function () {
    this.timeout(60000);
    let wv, win, doc, X = null;
    const made = [];
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    let prefWas;
    const opened = [];
    let origOpen = null;

    const box = () => [...doc.querySelectorAll("info-box")].find(b => b.item && X && b.item.id === X.id && b.getBoundingClientRect().width > 0) || null;
    const rows = () => { const b = box(); return b ? [...b.querySelectorAll(".creator-name-box")] : []; };
    const markOf = (nb) => { const row = nb && nb.closest(".meta-row"); return row ? row.querySelector(":scope > .meta-label > .wv-pp-cmark") : null; };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvPeopleCreate", "_wvPeopleRemove", "_wvPeopleTabOpen", "_wvPpCmarkBox", "_wvPpCmarkAll"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
        prefWas = Zotero.Prefs.get("weavero.enablePeople");
        Zotero.Prefs.set("weavero.enablePeople", true);
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
        made.push(await wv._wvPeopleCreate("Thoroddsen", "Sigurdur T."));
        made.push(await wv._wvPeopleCreate("Lohse", "Detlef"));
        X = await wvT.createItem("journalArticle", { title: "WV-TEST Researchers marks: an impacting drop" });
        X.setCreators([
            { firstName: "E. Q.", lastName: "Li", creatorType: "author" },
            { firstName: "Sigurdur T.", lastName: "Thoroddsen", creatorType: "author" },
            { firstName: "D.", lastName: "Lohse", creatorType: "author" },
        ]);
        await X.saveTx();
        origOpen = wv._wvPeopleTabOpen;
        wv._wvPeopleTabOpen = function (w, opts) { opened.push(opts && opts.personID); };
        await win.ZoteroPane.selectItem(X.id);
        assert.ok(await wvT.waitFor(() => rows().length === 3 && rows().filter(markOf).length === 2, 10000, 50), "the Info section with its three authors, two marked");
    });

    after(async function () {
        if (origOpen) wv._wvPeopleTabOpen = origOpen;
        try { for (const r of made) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        if (prefWas === undefined) { try { Zotero.Prefs.clear("weavero.enablePeople"); } catch (e) {} }
        else Zotero.Prefs.set("weavero.enablePeople", prefWas);
        if (X) await wvT.erase(X);
    });

    it("an exact name gets the icon, an initials-only one a lighter icon, an author without a profile none", () => {
        const [li, th, lo] = rows();
        assert.isNull(markOf(li), "Li: no profile, no icon");
        assert.equal(markOf(th).getAttribute("data-wv-match"), "exact", "Thoroddsen: the same name");
        assert.equal(markOf(th).getAttribute("data-wv-person"), made[0].id, "his record");
        assert.equal(markOf(lo).getAttribute("data-wv-match"), "initials", "Lohse, D.: initials only");
        assert.isBelow(parseFloat(win.getComputedStyle(markOf(lo)).opacity), 1, "lighter");
        assert.equal(win.getComputedStyle(markOf(th)).opacity, "1", "the exact one in full");
        assert.match(String(markOf(th).getAttribute("title")), /Thoroddsen/, "its tooltip names the person");
    });

    it("the icon sits in the label cell right before the creator type, clear of the drag handle, blue", () => {
        const th = rows()[1];
        const cell = th.closest(".meta-row").querySelector(":scope > .meta-label");
        const label = cell.querySelector(":scope > .creator-type-label").getBoundingClientRect();
        const grip = cell.querySelector(":scope > .zotero-clicky-grippy").getBoundingClientRect();
        const m = markOf(th).getBoundingClientRect();
        assert.approximately(m.width, 18, 0.5, "the 16-px icon and its 1-px padding");
        assert.ok(m.right <= label.left + 0.5 && label.left - m.right < 8, "right before the label (" + m.right + " -> " + label.left + ")");
        assert.ok(m.left >= grip.right - 0.5, "clear of the drag handle (" + grip.right + " -> " + m.left + ")");
        assert.isNull(th.querySelector(".wv-pp-cmark"), "nothing in the name box");
        const blue = win.getComputedStyle(doc.documentElement).getPropertyValue("--accent-blue").trim();
        assert.ok(blue, "fixture: Zotero's accent blue");
        const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        probe.style.color = blue; doc.documentElement.appendChild(probe);
        const want = win.getComputedStyle(probe).color; probe.remove();
        assert.equal(win.getComputedStyle(markOf(th)).fill, want, "Zotero's accent blue, as the Researchers tab's icon");
    });

    it("on hover the name keeps its width and Zotero's buttons stay at the row's end, the icon on the other side", () => {
        const li = rows()[0];
        const widthOf = (nb) => nb.getBoundingClientRect().width;
        for (const nb of rows().slice(1)) {
            const row = nb.closest(".meta-row");
            InspectorUtils.addPseudoClassLock(row, ":hover");
            InspectorUtils.addPseudoClassLock(li.closest(".meta-row"), ":hover");
            try {
                const btns = [...nb.parentElement.querySelectorAll(":scope > toolbarbutton")].filter(b => b.getBoundingClientRect().width > 0);
                assert.isAtLeast(btns.length, 3, "the hover buttons are shown");
                const m = markOf(nb).getBoundingClientRect(), box2 = nb.getBoundingClientRect();
                for (const b of btns) assert.ok(b.getBoundingClientRect().left >= box2.right - 0.5, "a button after the name box");
                assert.ok(m.right <= box2.left, "the icon on the label's side, left of the name");
                assert.approximately(widthOf(nb), widthOf(li), 0.5, "the name box as wide as an unmarked author's");
                const grip = row.querySelector(".zotero-clicky-grippy").getBoundingClientRect();
                assert.ok(m.left >= grip.right - 0.5, "clear of the drag handle shown on hover");
            }
            finally {
                InspectorUtils.removePseudoClassLock(row, ":hover");
                InspectorUtils.removePseudoClassLock(li.closest(".meta-row"), ":hover");
            }
        }
    });

    it("a click on the icon opens the person's page and edits nothing", () => {
        opened.length = 0;
        const th = rows()[1], m = markOf(th);
        const r = m.getBoundingClientRect();
        for (const type of ["mousedown", "mouseup", "click"]) {
            m.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, view: win, button: 0, clientX: r.left + 8, clientY: r.top + 8 }));
        }
        assert.deepEqual(opened, [made[0].id], "Thoroddsen's page");
        assert.isFalse(!!(doc.activeElement && th.contains(doc.activeElement)), "no name field took the focus");
    });

    it("an author renamed away from the profile loses the icon; Researchers off removes them all", async () => {
        X.setCreator(2, { firstName: "D.", lastName: "Smith", creatorType: "author" });
        await X.saveTx();
        assert.ok(await wvT.waitFor(() => (rows().length === 3 && !markOf(rows()[2])) || null, 5000, 50), "Smith: no icon");
        assert.ok(markOf(rows()[1]), "Thoroddsen keeps his");
        Zotero.Prefs.set("weavero.enablePeople", false);
        try {
            assert.ok(await wvT.waitFor(() => !rows().some(markOf) || null, 5000, 50), "no icon with Researchers off");
        }
        finally { Zotero.Prefs.set("weavero.enablePeople", true); }
        assert.ok(await wvT.waitFor(() => (markOf(rows()[1]) && true) || null, 5000, 50), "back with Researchers on");
    });
});
