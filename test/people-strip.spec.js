/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, wvT */
// The researchers strip (branch peoplenet, plan approved by MJT 2026-11-25; design
// work/people-genealogy-ui-survey-2026-11-25.md, part B, P1): while a window's
// quick search names a researcher -- a followed or To check record of Researchers,
// or a library author the Academic Family Tree extract confirms --, a slim band
// between the items toolbar and the list, before Weavero's filter bar:
//   - the matcher (lib/people-strip.ts): a last name with or without a first name
//     or initials, any order; folded as Zotero 11's search folds (accents, and ø,
//     ł, ß); 3 letters at least; never a first name alone; a by: condition's value
//     counts, another condition's never;
//   - per main window: two windows, two searches, two strips; closing one leaves
//     the other; the close holds for that search only; Esc closes; Down from the
//     search box reaches it;
//   - each person: name, "N items here · M in these results" (a person with none
//     shown too), Only Theirs adds Weavero's Authors filter in THAT window;
//   - never in the trash or a feed.
// Synthetic data only: invented names and ids.
describe("Weavero — People: the researchers strip above a search's results", function () {
    this.timeout(180000);
    let wv, lib, A, B;
    const AFT_PATH = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "aft-subset.json");
    const FIXTURE = {
        v: 1,
        source: { name: "Academic Family Tree", licence: "CC BY 4.0", version: "test", doi: "", site: "https://academictree.org/",
            page: "https://academictree.org/{tree}/peopleinfo.php?pid={pid}", pageVerified: false },
        inst: ["Imaginary Institute of Flows"],
        people: { 905: ["Ashgrove", "Petronella", "Ph.D.", 0, "fluids", "", 1, 0], 908: ["Wexley", "Barnaby", "", -1, "fluids", "", 0, 1] },
        edges: [[905, 908, 1, 1960, 0, ""]],
        grants: {},
        units: { "ashgrove|petronella": [905, "B", 3, 3] },
    };

    // ---- the matcher (pure) -------------------------------------------------------------
    const P = [
        { key: "a", last: "Quéré", first: "David" },
        { key: "b", last: "Sørensen", first: "Anne" },
        { key: "c", last: "Ostrander", first: "Wilhelmina" },
        { key: "d", last: "Le Bars", first: "Michael" },
        { key: "e", last: "Weiß", first: "Jörg" },
        { key: "f", last: "Łukasiewicz", first: "Jan" },
        { key: "g", last: "Li", first: "Wei" },
        { key: "h", last: "Thoroughgood", first: "Ann", forms: [{ last: "Thoroughgood-Smythe", first: "A." }] },
    ];
    const keys = (q) => lib.wvPsMatch(lib.wvPsQueryWords(q), P, 3).map(h => h.key + (h.level === "likely" ? "~" : "")).join(" ");

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const f of ["wvPsFold", "wvPsQueryWords", "wvPsMatch"]) if (!lib || typeof lib[f] !== "function") wvT.absent("lib." + f);
        for (const m of ["_wvPsUpdate", "_wvPsSoon", "_wvPsState", "_wvPsDismiss", "_wvPsOnlyTheirs", "_wvPsViewAllowed", "_wvPsDestroy", "_wvAftReset"]) wvT.method(m);
    });

    it("folds as Zotero's search does: accents, and ø, ł, ß", function () {
        assert.deepEqual(["Quéré", "Søren Ørsted", "Łukasz", "Weiß", "Dvořák-Ně", "  M.-J.  "].map(lib.wvPsFold),
            ["quere", "soren orsted", "lukasz", "weiss", "dvorak ne", "m j"]);
    });

    it("a last name, with or without first names or initials, in any order; 3 letters at least; never a first name alone", function () {
        assert.strictEqual(keys("quere"), "a");
        assert.strictEqual(keys("QUÉRÉ"), "a");
        assert.strictEqual(keys("david quere"), "a");
        assert.strictEqual(keys("Quéré, D."), "a", "an initial");
        assert.strictEqual(keys("x quere"), "", "another initial names nobody");
        assert.strictEqual(keys("sorensen"), "b");
        assert.strictEqual(keys("Sørensen"), "b");
        assert.strictEqual(keys("lukasiewicz j"), "f");
        assert.strictEqual(keys("weiss"), "e");
        assert.strictEqual(keys("weiß jorg"), "e");
        assert.strictEqual(keys("bars"), "d", "one word of a particle name");
        assert.strictEqual(keys("le bars m"), "d");
        assert.strictEqual(keys("qu"), "", "two letters: nobody");
        assert.strictEqual(keys("que"), "a~", "the start of a last name, while typing: a likely match");
        assert.strictEqual(keys("david"), "", "a first name alone: nobody");
        assert.strictEqual(keys("wilhelmina"), "");
        assert.strictEqual(keys("ostrander wilhelmina extra"), "", "every word must be used");
        assert.strictEqual(keys("wei li"), "g", "a two-letter last name with its first name");
        assert.strictEqual(keys("li"), "", "but not alone");
        assert.strictEqual(keys("smythe"), "h", "another form of the name");
        assert.strictEqual(keys("by:quere tag:li"), "a", "a by: value counts; tag:li is no Li");
        assert.strictEqual(keys("tag:ostrander"), "", "another condition's value never");
        const many = Array.from({ length: 5 }, (_, i) => ({ key: "t" + i, last: "Thom" + "abcde"[i] + "son", first: "X" }));
        assert.strictEqual(lib.wvPsMatch(["thom"], many, 3).length, 0, "a half-typed word naming more than 3 people flashes nobody");
    });

    // ---- the windows ------------------------------------------------------------------
    describe("in the main windows", function () {
        let saved = null, I1, I2, I3, hadFile = false;
        const box = (w) => { const lv = w.ZoteroPane.libraryView; return lv && lv.getElement ? lv.getElement("zotero-tb-search") : w.document.getElementById("zotero-tb-search"); };
        const strip = (w) => w.document.getElementById("wv-pp-strip");
        const rowsOf = (w) => Array.from((strip(w) || { querySelectorAll: () => [] }).querySelectorAll(".wv-ps-row"));
        const search = async (w, text) => {
            box(w).value = text;
            await w.ZoteroPane.itemsView.setFilter("search", text);
        };
        const stripFor = (w, q) => wvT.waitFor(() => (strip(w) && strip(w).getAttribute("data-wv-ps-query") === q ? strip(w) : null), 10000, 50);
        const settled = async (w) => { await wvT.waitFor(() => !(wv._wvPsState(w) || {}).t, 5000, 30); await wvT.sleep(300); };
        const rec = (id, last, first, flags) => Object.assign(lib.wvPpNewRecord(id, last, first), { followed: false, check: false }, flags || {});
        const author = (first, last) => ({ creatorType: "author", firstName: first, lastName: last });
        const item = async (title, creators) => {
            const it = new Zotero.Item("journalArticle");
            it.libraryID = Zotero.Libraries.userLibraryID;
            it.setField("title", title);
            it.setCreators(creators);
            await it.saveTx({ skipSelect: true });
            return it;
        };

        before(async function () {
            try { hadFile = await IOUtils.exists(AFT_PATH()); } catch (e) {}
            if (hadFile) this.skip();   // a real extract in this profile: never overwritten (the runner's fresh profile has none)
            await IOUtils.makeDirectory(PathUtils.parent(AFT_PATH()), { createAncestors: true, ignoreExisting: true });
            await IOUtils.writeUTF8(AFT_PATH(), JSON.stringify(FIXTURE));
            wv._wvAftReset();
            await wv._wvPeopleLoad();
            saved = wv._wvPeopleDB.people.slice();
            const db = wv._wvPeopleDB;
            db.people.length = 0;
            db.people.push(rec("p-ps-1", "Ostrander", "Wilhelmina", { followed: true }), rec("p-ps-2", "Ostrander", "Bartholomew", { check: true }),
                rec("p-ps-3", "Quillsby", "Ada"));
            I1 = await item("wvps flows one", [author("Wilhelmina", "Ostrander")]);
            I2 = await item("wvps flows two", [author("Wilhelmina", "Ostrander"), author("Petronella", "Ashgrove")]);
            I3 = await item("wvps unrelated", [author("Ada", "Quillsby")]);
            await wv._wvPeopleLibIndexBuild();
            A = Zotero.getMainWindows()[0];
            B = await wvT.openMainWindow();
            assert.isOk(B, "a second main window");
            await wvT.waitFor(() => (B.ZoteroPane.itemsView && B.ZoteroPane.itemsView._wvSetFilterWrapped && B.document.getElementById("wv-filter-bar")) || null, 20000);
            for (const w of [A, B]) await w.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            A.focus();
        });

        after(async function () {
            for (const w of [A, B]) { try { if (w && !w.closed) { box(w).value = ""; await w.ZoteroPane.itemsView.setFilter("search", ""); } } catch (e) {} }
            try { if (B && !B.closed) { B._wvSavedParkClose = true; B.close(); } } catch (e) {}
            await wvT.waitFor(() => Zotero.getMainWindows().length === 1, 8000);
            try { wv._wvWithFilterWin(A, () => { wv._filterState = { groups: [wv._emptyFilterGroup()], activeGroupIndex: 0 }; wv._renderFilterBar(); wv._applyItemsListFilter({ deliberate: true }); }); } catch (e) {}
            await wvT.erase(I1, I2, I3);
            if (saved) { const db = wv._wvPeopleDB; db.people.length = 0; db.people.push(...saved); }
            if (!hadFile) { try { await IOUtils.remove(AFT_PATH()); } catch (e) {} }
            try { wv._wvAftReset(); } catch (e) {}
            try { wv._wvPsDestroy(); } catch (e) {}
        });

        it("two windows, two searches, two strips: each shows the people ITS search names, with their counts", async function () {
            await search(A, "ostrander");
            const sA = await stripFor(A, "ostrander");
            assert.ok(sA, "A's strip");
            assert.isNull(strip(B), "none in B, which searches nothing");
            const r = rowsOf(A);
            assert.deepEqual(r.map(x => x.getAttribute("data-wv-ps-key")), ["r:p-ps-1", "r:p-ps-2"], "both Ostranders (followed, To check), the one with items first");
            assert.strictEqual(r[0].querySelector(".wv-ps-counts").getAttribute("data-wv-ps-counts"), "2/2", "2 items here, 2 in these results");
            assert.match(r[0].querySelector(".wv-ps-counts").textContent, /2 items here/);
            assert.strictEqual(r[1].querySelector(".wv-ps-counts").getAttribute("data-wv-ps-counts"), "0/0", "a researcher with no item is shown too");
            const tb = A.document.getElementById("zotero-items-pane-container") || strip(A).parentNode;
            assert.strictEqual(strip(A).parentNode, tb, "in the items pane's container");
            const bar = A.document.getElementById("wv-filter-bar");
            if (bar && bar.parentNode === strip(A).parentNode) assert.strictEqual(strip(A).nextElementSibling, bar, "right before Weavero's filter bar");
            await search(B, "petronella ashgrove");
            const sB = await stripFor(B, "petronella ashgrove");
            assert.ok(sB, "B's strip");
            const rb = rowsOf(B);
            assert.deepEqual(rb.map(x => x.getAttribute("data-wv-ps-key")), ["a:905"], "a library author the extract confirms");
            assert.strictEqual(rb[0].querySelector(".wv-ps-counts").getAttribute("data-wv-ps-counts"), "1/1");
            assert.strictEqual(rb[0].querySelector(".wv-ps-aft").getAttribute("data-url"), "https://academictree.org/fluids/peopleinfo.php?pid=905", "with the attribution and the person's page");
            assert.match(rb[0].querySelector(".wv-ps-meta").textContent, /1960/, "and their PhD year");
            assert.strictEqual(strip(A).getAttribute("data-wv-ps-query"), "ostrander", "A keeps its own");
            await search(A, "quillsby");
            await settled(A);
            assert.isNull(strip(A), "a record neither followed nor To check: nobody");
            await search(A, "os");
            await settled(A);
            assert.isNull(strip(A), "two letters: nothing");
        });

        it("the close button holds for that search in that window only; Esc closes; Down from the search box reaches it", async function () {
            await search(A, "ostrander");
            await stripFor(A, "ostrander");
            await search(B, "ostrander");
            await stripFor(B, "ostrander");
            strip(A).querySelector(".wv-ps-close").click();
            assert.isNull(strip(A), "closed in A");
            assert.ok(strip(B), "B's stays");
            await search(A, "ostrander");
            await settled(A);
            assert.isNull(strip(A), "the same search again: still closed");
            await search(A, "ostrander w");
            assert.ok(await stripFor(A, "ostrander w"), "another search: back");
            assert.deepEqual(rowsOf(A).map(x => x.getAttribute("data-wv-ps-key")), ["r:p-ps-1"], "only Wilhelmina now");
            const tbx = A.ZoteroPane.libraryView && A.ZoteroPane.libraryView.getElement ? A.ZoteroPane.libraryView.getElement("zotero-tb-search-textbox")
                : A.document.getElementById("zotero-tb-search-textbox");
            assert.ok(tbx, "the search's text box");
            // Where a real key press starts: the box's input. And on the box itself, as a
            // press Zotero's toolbar key map reads as Tab (moveFocusForActionsMap) -- the
            // strip keeps the focus it took (red on peoplenet.4: the Advanced Search button).
            for (const at of [tbx.inputField || tbx, tbx]) {
                box(A).focus();
                at.dispatchEvent(new A.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true, composed: true }));
                const ae = A.document.activeElement;
                assert.ok(strip(A).contains(ae), "Down moved into the strip: " + (ae && (ae.localName + "#" + ae.id + "." + ae.className)));
            }
            A.document.activeElement.dispatchEvent(new A.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
            assert.isNull(strip(A), "Esc closed it");
            assert.strictEqual(wv._wvPsState(A).dismissed, "ostrander w");
            assert.ok(strip(B), "B's still there");
        });

        it("Only theirs adds Weavero's Authors filter in THAT window, the search kept", async function () {
            await search(A, "wilhelmina ostrander");
            await stripFor(A, "wilhelmina ostrander");
            const only = rowsOf(A)[0].querySelector(".wv-ps-only");
            assert.match(only.getAttribute("title"), /Wilhelmina Ostrander/, "the library's spelling");
            only.click();
            const authorsIn = (w) => wv._wvWithFilterWin(w, () => (wv._activeGroup() || {}).annotationAuthor || []);
            assert.deepEqual(authorsIn(A), ["Wilhelmina Ostrander"], "A's filter");
            assert.deepEqual(authorsIn(B), [], "not B's");
            assert.strictEqual(box(A).value, "wilhelmina ostrander", "the search as typed");
        });

        it("never in the trash nor a feed", async function () {
            await search(A, "");
            await settled(A);
            await A.ZoteroPane.collectionsView.selectByID("T" + Zotero.Libraries.userLibraryID);
            await wvT.waitFor(() => { try { return A.ZoteroPane.getCollectionTreeRow().isTrash(); } catch (e) { return false; } }, 10000, 50);
            assert.isFalse(wv._wvPsViewAllowed(A), "the trash");
            await search(A, "ostrander");
            await settled(A);
            assert.isNull(strip(A), "no strip in the trash");
            await A.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
            await search(A, "");
            await settled(A);
            // A feed: Zotero's own row answers isFeed (the runner has no feed to select).
            const ZP = A.ZoteroPane;
            const ownR = Object.prototype.hasOwnProperty.call(ZP, "getCollectionTreeRows"), origR = ZP.getCollectionTreeRows;
            const ownS = Object.prototype.hasOwnProperty.call(ZP, "getCollectionTreeRow"), origS = ZP.getCollectionTreeRow;
            const feedRow = { isFeed: () => true, isFeeds: () => false, isFeedsOrFeed: () => true, isTrash: () => false };
            ZP.getCollectionTreeRows = () => [feedRow];
            ZP.getCollectionTreeRow = () => feedRow;
            try {
                assert.isFalse(wv._wvPsViewAllowed(A), "a feed");
                box(A).value = "ostrander";
                await wv._wvPsUpdate(A);
                assert.isNull(strip(A), "no strip in a feed");
            }
            finally {
                if (ownR) ZP.getCollectionTreeRows = origR; else delete ZP.getCollectionTreeRows;
                if (ownS) ZP.getCollectionTreeRow = origS; else delete ZP.getCollectionTreeRow;
                box(A).value = "";
            }
            assert.isTrue(wv._wvPsViewAllowed(A), "the library again");
        });
    });
});
