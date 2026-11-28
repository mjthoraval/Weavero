/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, wvT */

// Feeds (src/modules/feeds.ts, src/lib/feed-score.ts; branch feeds, MJT
// 2026-11-22 "Ok for the feeds plan"): a relevance score for every feed item,
// computed locally from the library (text closeness to the user's own papers
// and to the library, authors held in the library, followed authors, keyword
// alerts, the journals read most) and from a scored feed's own first lines
// (a feed whose entries carry their own score); a Relevance column that sorts the feed views (Zotero itself does not
// sort them, zotero#1072); a "Why relevant" item-pane section; a mark and one
// filter chip for the items already in the library; the Feeds settings.
// Nothing is asked of the network and nothing is written to any library.
//
// The fixture:
//   My Library: MINE (the user's own paper, "Thoraval, Marie-Jean"), LIB1 (a DOI,
//     by Kim), LIB2, and filler papers so the text index has a corpus.
//   Feed A: F1 close to MINE; F2 = LIB1 (same DOI and title); F3 unrelated;
//     F4 by a followed author; F5 matches the alert, F6 is excluded by it.
//   Feed B (a scored feed): F7 whose abstract starts with the score lines.

describe("Weavero — Feeds: relevance, sorting, Why relevant, in-library mark", function () {
    this.timeout(300000);
    let wv, L, win, feedA = null, feedB = null, savedSettings = null, fpBefore = null;
    const made = [];
    let MINE, LIB1, LIB2, LIB3, F1, F2, F3, F4, F5, F6, F7;
    const FILLER = [
        "Rayleigh-Plateau instability of a liquid jet in air", "Capillary waves on a falling viscous film",
        "Marangoni flows in evaporating sessile drops", "Wetting transitions on superhydrophobic textured surfaces",
        "Turbulent boundary layers over rough walls", "Elastic sheets wrinkling under tension",
        "Granular avalanches on inclined planes", "Thermal convection in a rotating cylinder",
    ];

    async function article(fields, creators, libraryID) {
        const it = new Zotero.Item("journalArticle");
        it.libraryID = libraryID || Zotero.Libraries.userLibraryID;
        for (const k of Object.keys(fields)) it.setField(k, fields[k]);
        it.setCreators(creators.map(([lastName, firstName]) => ({ creatorType: "author", lastName, firstName })));
        await it.saveTx();
        made.push(it);
        return it;
    }
    async function feedItem(feed, fields, creators) {
        const it = /** @type {any} */ (new Zotero.FeedItem("journalArticle"));
        it.libraryID = feed.libraryID;
        it.guid = "wv-feeds-" + Zotero.Utilities.randomString();
        for (const k of Object.keys(fields)) it.setField(k, fields[k]);
        it.setCreators(creators.map(([lastName, firstName]) => ({ creatorType: "author", lastName, firstName })));
        await it.saveTx();
        return it;
    }
    async function makeFeed(name) {
        const f = /** @type {any} */ (new Zotero.Feed());
        f.name = name;
        f.description = "";
        f.url = "https://wv-feeds-test.invalid/" + Zotero.Utilities.randomString() + ".xml";
        f.refreshInterval = 24 * 60;
        f.cleanupReadAfter = 60;
        f.cleanupUnreadAfter = 90;
        await f.saveTx();
        return f;
    }
    /** What the user's libraries hold that the feature must never change. */
    async function fingerprint() {
        const libs = "libraryID IN (SELECT libraryID FROM libraries WHERE type IN ('user', 'group'))";
        const rows = await Zotero.DB.queryAsync("SELECT itemID, version, clientDateModified, synced FROM items WHERE " + libs + " ORDER BY itemID");
        const parts = rows.map(r => r.itemID + ":" + r.version + ":" + r.clientDateModified + ":" + r.synced);
        for (const t of ["itemData", "itemTags", "itemRelations", "itemNotes", "itemCreators", "collectionItems"]) {
            parts.push(t + "=" + await Zotero.DB.valueQueryAsync("SELECT COUNT(*) FROM " + t + " WHERE itemID IN (SELECT itemID FROM items WHERE " + libs + ")"));
        }
        return parts.join("|");
    }
    const iv = () => win.ZoteroPane.itemsView;
    const colKey = () => wv._wvFdColKey;
    /** The items view on the collection-tree row `id` ("L<feed library>", "F1"), loaded. */
    async function showRow(id) {
        const cv = win.ZoteroPane.collectionsView;
        assert.ok(await wvT.waitFor(() => cv.getRowIndexByID(id) !== false, 15000, 100), "collection-tree row " + id + " present");
        await cv.selectByID(id);
        await iv().waitForLoad();
        await wvT.waitFor(() => iv().collectionTreeRows && iv().collectionTreeRows[0] && iv().collectionTreeRows[0].id === id, 10000, 50);
    }
    /** The view's top-level item ids in row order (what the user sees: the row provider). */
    const rowIDs = () => {
        const rp = iv().rowProvider || iv();
        const out = [];
        const n = typeof rp.getRowCount === "function" ? rp.getRowCount() : iv().rowCount;
        for (let i = 0; i < n; i++) { const r = rp.getRow(i); if (r && r.ref) out.push(r.ref.id); }
        return out;
    };
    const rec = (it) => wv._wvFdRecOf(it.id);

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        L = wvT.lib();
        for (const m of ["_wvFdOn", "_wvFdSettingsGet", "_wvFdSettingsSet", "_wvFdRefresh", "_wvFdRecOf", "_wvFdCell", "_wvFdExport",
            "_wvFdImportDoc", "_wvFdCountMine", "_wvFdNotInLibrary", "_wvFdInit", "_wvFdDestroy"]) wvT.method(m);
        for (const f of ["wvFdParseRadar", "wvFdAlertParse", "wvFdAlertMatches", "wvFdNameParse", "wvFdNameMatches", "wvFdTokenize", "wvFdRelevance", "WV_FD_WEIGHTS",
            "wvFdExportDoc", "wvFdImportAlerts"]) {
            if (L[f] === undefined) wvT.absent("lib." + f);
        }
        win = Zotero.getMainWindow();
        savedSettings = JSON.parse(JSON.stringify(await wv._wvFdSettingsGet()));
        MINE = await article({ title: "Bubble entrapment during drop impact on a deep liquid pool", date: "2021", publicationTitle: "Journal of Test Fluid Mechanics",
            abstractNote: "We study the entrapment of an air bubble under a drop impacting a deep liquid pool, the thin air film and its rupture into a bubble ring." },
        [["Thoraval", "Marie-Jean"], ["Tester", "Ann"]]);
        LIB1 = await article({ title: "Splashing of viscous drops on thin liquid films", date: "2019", publicationTitle: "Journal of Test Fluid Mechanics",
            DOI: "10.9999/wv.feeds.lib1", abstractNote: "Viscous drops splash on thin liquid films above a threshold velocity." }, [["Kim", "Alice"]]);
        LIB2 = await article({ title: "Coalescence of droplets in a vortex flow", date: "2018", publicationTitle: "Physical Review Test Fluids",
            abstractNote: "Droplets coalesce in a vortex at low Weber number." }, [["Rossi", "Bruno"]]);
        // Another paper by LIB1's author: F2 (= LIB1) has an author in the library through it,
        // not through its own copy (2026-11-22: a paper's own copies count for nothing).
        LIB3 = await article({ title: "Rupture of a thin sheet in a Hele-Shaw cell", date: "2017", publicationTitle: "Soft Test Matter",
            abstractNote: "A thin liquid sheet ruptures in a narrow gap." }, [["Kim", "Alice"]]);
        for (let i = 0; i < FILLER.length; i++) {
            await article({ title: FILLER[i], date: String(2010 + i), publicationTitle: i % 2 ? "Journal of Test Fluid Mechanics" : "Soft Test Matter",
                abstractNote: FILLER[i] + ": experiments and a model." }, [["Filler" + i, "F."]]);
        }
        await wv._wvFdSettingsSet({ myNames: ["Thoraval, M.-J."], followed: ["Zed, Q."], alerts: ["leidenfrost -review"], watched: [], citedPersons: [] });
        fpBefore = await fingerprint();
        feedA = await makeFeed("WV-TEST journal feed");
        feedB = await makeFeed("WV-TEST scored feed");
        F1 = await feedItem(feedA, { title: "Air bubble entrapment beneath a drop impacting a deep liquid pool", date: "2026-11-01",
            abstractNote: "The air film under an impacting drop ruptures and entraps a bubble ring in the liquid pool." }, [["Ono", "Kei"]]);
        F2 = await feedItem(feedA, { title: "Splashing of viscous drops on thin liquid films", DOI: "10.9999/WV.FEEDS.LIB1", date: "2026-11-02" }, [["Kim", "A."]]);
        F3 = await feedItem(feedA, { title: "Quantum chromodynamics on a lattice at finite baryon density", date: "2026-11-03",
            abstractNote: "Lattice gauge theory with quarks." }, [["Nobody", "N."]]);
        F4 = await feedItem(feedA, { title: "Granular jets from a collapsing cavity", date: "2026-11-04" }, [["Zed", "Quentin"]]);
        F5 = await feedItem(feedA, { title: "Levitation of drops on a hot plate", date: "2026-11-05", abstractNote: "Leidenfrost drops bounce on a vapour cushion." }, [["Alpha", "A."]]);
        F6 = await feedItem(feedA, { title: "Leidenfrost effect: a review", date: "2026-11-06", abstractNote: "We review the Leidenfrost effect." }, [["Beta", "B."]]);
        F7 = await feedItem(feedB, { title: "Thin films under impacting drops revisited", date: "2026-11-07",
            abstractNote: "Relevance 87 · cites 3 of your papers · shares 12 references with your library\nradar: v1 score=87 kind=daily streams=cites,coupling lib=" + LIB2.key + " followed=Q.%20Zed\n\nAn abstract &amp; more." },
        [["Gamma", "G."]]);
        await wv._wvFdRefresh("spec", { rebuild: true });
    });

    after(async function () {
        try { await showRow("L" + Zotero.Libraries.userLibraryID); } catch (e) {}
        try { if (savedSettings) await wv._wvFdSettingsSet(savedSettings); } catch (e) {}
        for (const f of [feedA, feedB]) { try { if (f) await f.eraseTx(); } catch (e) {} }
        await wvT.erase(...made.slice().reverse());
    });

    // ---- the pure parts (lib/feed-score.ts) ----

    it("reads a scored feed entry's two first lines (format v1), as Zotero stores them and raw; null for any other abstract", function () {
        const r = L.wvFdParseRadar("Relevance 87 · cites 3 of your papers · followed: Q. Zed\nradar: v1 score=87 kind=daily streams=cites,followed lib=ABCD1234,EFGH5678 followed=Q.%20Zed\n\nThe abstract &amp; its &lt;b&gt;.");
        assert.ok(r, "parsed");
        assert.equal(r.score, 87);
        assert.deepEqual(r.reasons, ["cites 3 of your papers", "followed: Q. Zed"]);
        assert.deepEqual(r.fields.lib, ["ABCD1234", "EFGH5678"]);
        assert.deepEqual(r.fields.followed, ["Q. Zed"], "pct-decoded");
        assert.equal(r.abstract, "The abstract & its <b>.");
        // Line breaks lost on the way: the machine line ends at its last key=value.
        const r2 = L.wvFdParseRadar("Relevance 42 · alert: drops radar: v1 score=42 alert=drops Abstract text here.");
        assert.ok(r2, "parsed without line breaks");
        assert.equal(r2.score, 42);
        assert.equal(r2.abstract, "Abstract text here.");
        assert.isNull(L.wvFdParseRadar("A plain abstract about drops."));
        assert.isNull(L.wvFdParseRadar("Relevance of drops to splashing\nradar: no"));
    });

    // The format's documented example entry ("The feed (for Weavero)"), copied as it is.
    const README_EXAMPLE = "Relevance 80 · cites 2 of your papers · shares 36 references with your library\n"
        + "radar: v1 score=80 kind=daily rec=2026-11-22 raw=159.0 streams=cites,coupling,text,topics own=2 shared=36 lib=22DHRDYY,AB12CD34 near=EF56GH78 oa=W7225109137\n"
        + "\n"
        + "In this paper, we report the impacts of isothermal compound drops ...";

    it("reads the format's documented example and keeps to its grammar", function () {
        for (const text of [README_EXAMPLE, README_EXAMPLE.replace(/&/g, "&amp;")]) {
            const r = L.wvFdParseRadar(text);
            assert.ok(r, "the README's example parses");
            assert.equal(r.score, 80);
            assert.deepEqual(r.reasons, ["cites 2 of your papers", "shares 36 references with your library"]);
            assert.deepEqual(r.fields.score, ["80"]);
            assert.deepEqual(r.fields.kind, ["daily"]);
            assert.deepEqual(r.fields.rec, ["2026-11-22"]);
            assert.deepEqual(r.fields.raw, ["159.0"]);
            assert.deepEqual(r.fields.streams, ["cites", "coupling", "text", "topics"]);
            assert.deepEqual(r.fields.own, ["2"]);
            assert.deepEqual(r.fields.shared, ["36"]);
            assert.deepEqual(r.fields.lib, ["22DHRDYY", "AB12CD34"]);
            assert.deepEqual(r.fields.near, ["EF56GH78"]);
            assert.deepEqual(r.fields.oa, ["W7225109137"]);
            assert.equal(r.abstract, "In this paper, we report the impacts of isothermal compound drops ...");
        }
        // content = line1 LF line2 LF [ LF abstract ]: no abstract at all.
        const bare = L.wvFdParseRadar("Relevance 5\nradar: v1 score=5 kind=weekly\n");
        assert.ok(bare);
        assert.equal(bare.score, 5);
        assert.deepEqual(bare.reasons, []);
        assert.equal(bare.abstract, "");
        // score = 1*2DIGIT: three digits are not the format.
        assert.isNull(L.wvFdParseRadar("Relevance 100 · x\nradar: v1 score=100 kind=daily\n"));
        // Unknown keys kept, never in the way; a value outside the grammar drops its field only.
        const u = L.wvFdParseRadar("Relevance 12 · alert: drops\nradar: v1 score=12 kind=daily future_key=a,b alert=drop%20impact lib=AB12CD34 bad=a/b\n\nText.");
        assert.deepEqual(u.fields.future_key, ["a", "b"]);
        assert.deepEqual(u.fields.alert, ["drop impact"], "UTF-8 percent-encoding decoded");
        assert.notProperty(u.fields, "bad", "'/' is no item character");
        assert.deepEqual(u.fields.lib, ["AB12CD34"]);
        // A non-ASCII name, percent-encoded as UTF-8.
        const n = L.wvFdParseRadar("Relevance 40 · new article by José (followed)\nradar: v1 score=40 kind=daily followed=Jos%C3%A9%20Hern%C3%A1ndez\n");
        assert.deepEqual(n.fields.followed, ["José Hernández"]);
    });

    it("keyword alerts: words all present, \"quoted phrases\", -exclusion", function () {
        const a = L.wvFdAlertParse("leidenfrost -review");
        assert.isTrue(L.wvFdAlertMatches(a, "Leidenfrost drops bounce"));
        assert.isFalse(L.wvFdAlertMatches(a, "A review of the Leidenfrost effect"), "excluded word");
        const b = L.wvFdAlertParse("\"drop impact\" bubble");
        assert.isTrue(L.wvFdAlertMatches(b, "Bubbles after a drop impact on a pool"), "phrase + word (plural folded)");
        assert.isFalse(L.wvFdAlertMatches(b, "A drop and an impact make a bubble"), "the phrase must be whole");
        assert.isFalse(L.wvFdAlertMatches(L.wvFdAlertParse(""), "anything"), "an empty alert matches nothing");
    });

    it("author names: surname and initials, either order, accents and hyphens folded", function () {
        const me = L.wvFdNameParse("Thoraval, M.-J.");
        assert.isTrue(L.wvFdNameMatches(me, L.wvFdNameParse("Thoraval, Marie-Jean")));
        assert.isTrue(L.wvFdNameMatches(me, L.wvFdNameParse("Marie-Jean Thoraval")));
        assert.isTrue(L.wvFdNameMatches(me, L.wvFdNameParse("THORAVAL, M.")), "one initial is compatible");
        assert.isFalse(L.wvFdNameMatches(me, L.wvFdNameParse("Thoraval, A.")));
        assert.isTrue(L.wvFdNameMatches(L.wvFdNameParse("Hernandez-Sanchez, J. F."), L.wvFdNameParse("José Federico Hernández-Sánchez")));
    });

    // MJT 2026-11-22, the four score fixes ("Ok"), on the case that showed them: a Journal of
    // Fluid Mechanics item by Gao Tian-Yu, Sun Peng-Nan, Huang Kai-Jun scored 58, 29 of its 54
    // points from three library authors who were other people, and "close" to 5 papers whose
    // abstract was a Cambridge image link.
    it("score fixes: plain text, given names, correction notices, the weight of an ambiguous name", function () {
        // 1. Markup and links are not words.
        const jfm = "<div xmlns=\"http://www.w3.org/1999/xhtml\" class=\"abstract\"><p><img src=\"http://static.cambridge.org//content/id/urn%3Acambridge.org%3Aid%3Aarticle%3AS0022112026122174/resource/name/optimisedImage.jpg\"/></p><p>Bioinspired propulsion of an undulating hydrofoil &amp; a free surface.</p></div>";
        const toks = L.wvFdTokenize(jfm, false);
        for (const junk of ["xmlns", "div", "static", "cambridg", "cambridge", "content", "urn", "img", "http", "www"]) assert.notInclude(toks, junk, "no " + junk + " in " + JSON.stringify(toks));
        assert.include(toks, "hydrofoil", "the abstract's own words stay");
        assert.equal(L.wvFdTokenize("//static.cambridge.org/content/id/urn%3Acambridge.org/resource/name/firstPage-S0022112012002996a.jpg").length, 0, "an abstract that is only a link has no words");
        // 2. Given names written out on both sides must be the same.
        const n = (s) => L.wvFdNameParse(s);
        assert.isFalse(L.wvFdNameMatches(n("Gao, Tian-Yu"), n("Gao, Tian")), "Tian is not Tian-Yu");
        assert.isFalse(L.wvFdNameMatches(n("Gao, Tian-Yu"), n("Gao, Tong")));
        assert.isFalse(L.wvFdNameMatches(n("Huang, Kai-Jun"), n("Huang, Kai")), "Kai is not Kai-Jun");
        assert.isTrue(L.wvFdNameMatches(n("Sun, Peng-Nan"), n("Sun, Peng Nan")), "hyphen or space");
        assert.isTrue(L.wvFdNameMatches(n("Sun, Peng-Nan"), n("Sun, Peng-Nan (孙鹏楠)")), "a name in brackets after it");
        assert.isTrue(L.wvFdNameMatches(n("Gao, Tianyu"), n("Gao, Tian-Yu")), "the same letters");
        assert.isTrue(L.wvFdNameMatches(n("Lohse, Detlef"), n("Lohse, Detlef J.")), "a middle initial more");
        assert.isFalse(L.wvFdNameMatches(n("Gao, Tian-Yu"), n("Gao, T.-C.")), "initials that disagree");
        assert.isTrue(L.wvFdNameMatches(n("Gao, Tian-Yu"), n("Gao, T.")), "an initial alone stays compatible");
        // 3. Correction notices are not papers; a film's retraction is.
        for (const t of ["Lift force on a spherical droplet in a viscous linear shear flow – CORRIGENDUM", "Erratum: Drop impact on a pool [Phys. Rev. Fluids 5, 1 (2020)]",
            "Corrigendum to \"Bubble entrapment\"", "Retraction Note: Splashing", "Correction to: Thin films", "Computation of coupled convection – RETRACTION"]) assert.isTrue(L.wvFdIsNotice(t), t);
        for (const t of ["Retraction of a liquid sheet", "Corrections to scaling in thin-film flows", "Splashing of viscous drops"]) assert.isFalse(L.wvFdIsNotice(t), t);
        // 2b. A name that fits k different people of the library weighs 1/k.
        const one = L.wvFdScore({ authors: [{ name: "X", n: 8, k: 1 }] }), five = L.wvFdScore({ authors: [{ name: "X", n: 8, k: 5 }] });
        assert.closeTo(five.raw, one.raw / 5, 1e-9, "split between the 5 people the name fits");
        // 4. The closeness reason names the closest paper and how close.
        const s = L.wvFdScore({ lib: { s: 0.2, n: 9, id: 42, best: 0.4 } });
        const r = s.reasons.find(x => x.k === "lib");
        assert.equal(r.id, 42);
        assert.equal(L.wvFdNearLevel(r.s), "strong");
        assert.equal(L.wvFdNearLevel(0.18), "moderate");
        assert.equal(L.wvFdNearLevel(0.1), "weak");
    });

    // ---- the scores ----

    it("scores every feed item locally, with its reasons; the scored feed's score and reasons come first", function () {
        for (const it of [F1, F2, F3, F4, F5, F6, F7]) assert.ok(rec(it), "scored: " + it.getField("title"));
        assert.isAbove(rec(F1).score, rec(F3).score, "close to the user's own paper > unrelated");
        const kinds = (it) => rec(it).reasons.map(r => r.k);
        assert.include(kinds(F1), "own", "F1: close to your paper");
        const own = rec(F1).reasons.find(r => r.k === "own");
        assert.equal(own.id, MINE.id, "the paper it is close to");
        assert.include(kinds(F4), "followed");
        assert.include(kinds(F5), "alert");
        assert.notInclude(kinds(F6), "alert", "the alert's -review excludes F6");
        assert.include(kinds(F2), "author", "an author held in the library");
        // A paper's own library copies count for nothing in its closeness, its authors and
        // its related papers (MJT 2026-11-22: "Close to 'Holes in Sheets...'", the paper itself).
        const near2 = rec(F2).reasons.find(r => r.k === "lib");
        assert.notEqual(near2 && near2.id, LIB1.id, "not 'close to' its own copy");
        assert.notInclude(rec(F2).rel, LIB1.id, "not related to itself");
        assert.equal(rec(F7).score, 87, "the radar's score");
        assert.equal(rec(F7).reasons[0].k, "radar");
        assert.equal(rec(F7).reasons[0].t, "cites 3 of your papers");
        assert.include(rec(F7).rel, LIB2.id, "the radar line's lib= keys are related papers");
        assert.isNotOk(rec(F7).reasons.some(r => r.k === "followed"), "the radar already says followed: not twice");
        for (const it of [F1, F2, F3, F4, F5, F6, F7]) assert.isAtMost(rec(it).score, 99);
        // The column reads the cache only: a padded number, "" for an item it does not know.
        assert.match(wv._wvFdCell(F1), /^\d{3}/);
        assert.equal(wv._wvFdCell(MINE), "", "not a feed item");
        const weights = L.WV_FD_WEIGHTS;
        assert.ok(weights && typeof weights.textOwn === "number" && typeof weights.followed === "number", "one weights table");
    });

    it("items already in the library (DOI, then title) are marked, and the chip hides them", async function () {
        assert.isTrue(rec(F2).inLib, "F2 = LIB1 by DOI");
        assert.include(rec(F2).libIDs, LIB1.id);
        assert.isFalse(rec(F1).inLib);
        await showRow("L" + feedA.libraryID);
        // The mark in the Relevance cell.
        iv().tree.invalidate();
        const row = iv().getRowIndexByID(F2.id);
        assert.notStrictEqual(row, false, "F2 shown");
        // The mark in its own In Library column (MJT 2026-11-22), not in the Relevance cell.
        assert.ok(wv._wvFdLibColKey, "the In Library column registered");
        const lc = iv()._getColumns().find(c => c.dataKey === wv._wvFdLibColKey);
        assert.ok(lc && !lc.hidden, "shown by default in a feed view");
        const el = await wvT.waitFor(() => { const r = iv().tree._jsWindow.getElementByIndex(row); return r && r.querySelector(".wv-fd-libcell .wv-fd-inlib"); }, 5000, 100);
        assert.ok(el, "F2's row carries the in-library mark in the In Library column");
        assert.equal(el.getAttribute("data-wv-fd-item"), String(F2.id));
        const rr = iv().tree._jsWindow.getElementByIndex(row);
        assert.isNull(rr.querySelector(".wv-fd-cell .wv-fd-inlib"), "the Relevance cell holds the number only");
        assert.match(wv._wvFdLibCell(F2), /^2:\d+$/, "My Library holds F2");
        assert.equal(wv._wvFdLibCell(F1), "", "nothing for F1");
        // The card of the library copy (MJT 2026-11-22): on Why relevant's "Already in your
        // library" line (focus shows it; hovering does through the same handler), and on the
        // In Library column's icon. No badge in the item pane's head any more.
        await iv().selectItem(F2.id);
        const pane = win.document.getElementById("zotero-item-pane");
        try { await pane.querySelector("item-details").scrollToPane(wv._wvFdSecKey, "instant"); } catch (e) {}
        const line = await wvT.waitFor(() => { const l = pane.querySelector(".wv-fd-sec .wv-fd-inlibline"); return l && !l.hidden ? l : null; }, 10000, 100);
        assert.ok(line, "F2: the 'Already in your library' line");
        assert.equal(line.getAttribute("tabindex"), "0", "reachable by keyboard");
        // A click opens the card, as Weavero's other columns (MJT 2026-11-22); hovering only
        // says so in a tooltip naming the library.
        assert.include(String(line.getAttribute("title") || ""), Zotero.Libraries.getName(Zotero.Libraries.userLibraryID), "the tooltip names the library");
        assert.isNull(win.document.querySelector("#zotero-item-pane .custom-head .wv-fd-badge"), "no badge in the head");
        // ONE format with the references (citations.19): the line opens the reference menu
        // itself -- the card of the copy, then its icon buttons at its foot (the citation
        // popup's design, MJT 2026-11-26): the open buttons with a file, Show in Library
        // without one, then Copy As.
        line.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        const menu = await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return p && p.querySelector(".wv-refs-card[data-wv-refs-card='" + LIB1.id + "']") ? p : null; }, 5000, 100);
        assert.ok(menu, "the reference menu, with the card of the library's copy");
        assert.include(menu.textContent, "Splashing of viscous drops", "the card names it");
        // LIB1 has no file: no open buttons -- Show in Library, then Copy As, in the one row
        // of buttons under the card; no entry of its own any more.
        const btns = Array.from(menu.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *")).map(c => c.getAttribute("data-wv-refs-act"));
        assert.deepEqual(btns, ["library", "copy-as"], "Show in Library and Copy As, the card's buttons, without a file");
        assert.isNull(menu.querySelector(":scope > menuitem[data-wv-refs-act], :scope > menu[data-wv-refs-act]"), "no action outside the button row");
        wv._wvFdCardHide(win);
        assert.ok(await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return !p || p.state === "closed" || null; }, 5000, 100), "closed again");
        // The item count box in a feed view (MJT 2026-11-22, "Replace its rows with feed
        // counts"): Unread, Already in your library, Not in your library -- no levels.
        const cm = wv._wvBuildCountMessage(win);
        assert.ok(cm && cm.split === false && cm.rows.length === 3, "a feed's count box: " + JSON.stringify(cm));
        const shownIDs = rowIDs();
        const unread = shownIDs.filter(x => !(/** @type {any} */ (Zotero.Items.get(x))).isRead).length;
        assert.equal(cm.rows[0].total, unread, "Unread");
        assert.equal(cm.rows[1].total, shownIDs.filter(x => rec(Zotero.Items.get(x)) && rec(Zotero.Items.get(x)).inLib).length, "Already in your library");
        assert.isAtLeast(cm.rows[1].total, 1, "F2 among them");
        assert.equal(cm.rows[1].total + cm.rows[2].total, shownIDs.filter(x => rec(Zotero.Items.get(x))).length, "in + not in = the scored rows");
        // The related papers no longer list the paper's own copy.
        assert.isNull(pane.querySelector(".wv-fd-row[data-wv-fd-item='" + LIB1.id + "']"), "its own copy is not among the related papers");
        // The chip: a parent-level tri-state, set only in a feed view.
        const g = Object.assign(wv._emptyFilterGroup(), { feedNotInLibrary: true });
        wv._wvWithFilterWin(win, () => {
            assert.isTrue(wv._isGroupActive(g), "active in a feed view");
            assert.isFalse(wv._rowPassesFilters(F2, g, {}), "hidden: in the library");
            assert.isTrue(wv._rowPassesFilters(F1, g, {}), "kept: not in the library");
        });
        await showRow("L" + Zotero.Libraries.userLibraryID);
        wv._wvWithFilterWin(win, () => assert.isFalse(wv._isGroupActive(g), "dormant outside the feeds"));
    });

    // MJT 2026-11-22: "When I first opened the Feeds, I could not see any arrow
    // showing which column was controlling the sort." Before any header click
    // (nothing saved), the header itself must say Relevance, descending.
    it("before any header click, a feed view's header shows the arrow on Relevance, descending", async function () {
        const arrows = () => [...win.document.querySelectorAll("#zotero-items-tree .virtualized-table-header .cell")]
            .filter(c => c.querySelector(".sort-indicator"))
            .map(c => ({ key: ((c.querySelector(".label") || {}).className || "").replace(/^label\s*/, ""), desc: c.querySelector(".sort-indicator").classList.contains("descending") }));
        for (const id of ["L" + feedA.libraryID, "F1"]) {
            await showRow(id);
            const v = iv();
            const saved = Object.entries(v._getColumnPrefs ? v._getColumnPrefs() : {}).filter(([k, x]) => x && x.sortDirection).map(([k]) => k);
            const ok = await wvT.waitFor(() => { const a = arrows(); return a.length === 1 && a[0].key === colKey() && a[0].desc; }, 3000, 50);
            const dirs = (cols) => (cols || []).filter(c => c.sortDirection).map(c => c.dataKey + ":" + c.sortDirection);
            const state = { item: dirs(v._getColumns()), table: dirs(v.tree && v.tree._getColumns()), sorted: v._sortedColumn && v._sortedColumn.dataKey,
                sortedInCols: v._getColumns().includes(v._sortedColumn), sf: v.getSortField(), tableAfter: dirs(v.tree && v.tree._getColumns()) };
            assert.ok(ok, id + ": one arrow, on Relevance, descending; header " + JSON.stringify(arrows()) + ", saved sort " + JSON.stringify(saved) + ", " + JSON.stringify(state));
        }
    });

    it("the Relevance column shows and sorts a single feed and the Feeds row, most relevant first; Date sorts too", async function () {
        for (const id of ["L" + feedA.libraryID, "F1"]) {
            await showRow(id);
            const v = iv();
            assert.isTrue(!!v.isSortable, id + ": the feed view is sortable");
            assert.equal(v.getSortField(), colKey(), id + ": sorted by Relevance");
            assert.equal(v.getSortDirection(), -1, id + ": most relevant first");
            const col = v._getColumns().find(c => c.dataKey === colKey());
            assert.ok(col && !col.hidden, id + ": the column is shown by default");
            await v.sort();
            const ids = rowIDs();
            const scores = ids.map(x => (wv._wvFdRecOf(x) || { score: -1 }).score);
            for (let i = 1; i < scores.length; i++) assert.isAtLeast(scores[i - 1], scores[i], id + ": descending at " + i + " " + JSON.stringify(scores));
        }
        // Date, clicked: the feed sorts by date, newest first on a second click.
        await showRow("L" + feedA.libraryID);
        const v = iv();
        const di = v._getColumns().findIndex(c => c.dataKey === "date");
        if (di >= 0 && !v._getColumns()[di].hidden) {
            await v._handleColumnSort(di, 1);
            assert.equal(v.getSortField(), "date");
            const dates = rowIDs().map(x => /** @type {any} */ (Zotero.Items.get(x)).getField("date", true, true));
            for (let i = 1; i < dates.length; i++) assert.isTrue(String(dates[i - 1]) <= String(dates[i]), "ascending dates: " + JSON.stringify(dates));
            await v._handleColumnSort(v._getColumns().findIndex(c => c.dataKey === colKey()), -1);
        }
        assert.equal(v.getSortField(), colKey());
        // Outside the feeds the column is not offered where Zotero can say so.
        await showRow("L" + Zotero.Libraries.userLibraryID);
        const lc = iv()._getColumns().find(c => c.dataKey === colKey());
        if (typeof iv()._matchesViewType === "function") assert.ok(!lc || lc.disabled, "disabled in My Library");
        else assert.ok(!lc || lc.hidden, "hidden in My Library");
    });

    it("the Why relevant section shows the reasons and the related papers of the library for a feed item, nothing for a library item", async function () {
        await showRow("L" + feedA.libraryID);
        await iv().selectItem(F1.id);
        const pane = win.document.getElementById("zotero-item-pane");
        const sec = await wvT.waitFor(() => {
            const s = pane && pane.querySelector('item-pane-custom-section[data-pane$="weavero-feeds"]');
            return s && !s.hidden ? s : null;
        }, 10000, 100);
        assert.ok(sec, "the section is shown for a feed item");
        // Its icon shows, in the header and in the side navigation (a single quote in
        // the icon's URI ended Zotero's url('...') and left both blank, 2026-11-22).
        const nav = pane.querySelector('item-pane-sidenav [data-pane$="weavero-feeds"]');
        const navImg = nav && win.getComputedStyle(nav.querySelector(".icon, image") || nav).backgroundImage;
        assert.ok(navImg && navImg !== "none", "the side navigation's icon: " + navImg);
        try { await pane.querySelector("item-details").scrollToPane(wv._wvFdSecKey, "instant"); } catch (e) {}
        const body = await wvT.waitFor(() => { const b = sec.querySelector(".wv-fd-sec"); return b && b.querySelector(".wv-fd-reason") ? b : null; }, 10000, 100);
        assert.ok(body, "reasons drawn");
        assert.ok(body.querySelector(".wv-fd-row[data-wv-fd-item='" + MINE.id + "']"), "MINE among the related papers");
        // MJT 2026-11-22: the reason no longer names the paper; the paper's row carries a tag,
        // each related row its own closeness (0-99), the rows closest first.
        const ownRow = body.querySelector(".wv-fd-row[data-wv-fd-item='" + MINE.id + "']");
        assert.ok(ownRow.querySelector(".wv-fd-reltag[data-wv-fd-tag='own']"), "MINE tagged as the user's paper");
        const ownReason = body.querySelector(".wv-fd-reason[data-wv-fd-kind='own']");
        assert.ok(ownReason && !ownReason.textContent.includes(MINE.getField("title")), "the reason does not repeat the title");
        // Split from the library's pane as Cited by (MJT 2026-11-22): the button whenever split can apply.
        const canSplit = !!wv._wvRefsCanSplit(wv._wvCbSecCtx(sec.querySelector(".body") || sec, F1, win.document));
        assert.equal(!!body.querySelector(".wv-fd-row [data-wv-fd-act='split']"), canSplit, "a Split button exactly when split can apply (" + canSplit + ")");
        // A related row's ⋯ and its right-click open the references' one menu, with MINE's card
        // (refs.ts _wvRefsMenu) and its icon buttons at its foot (the citation popup's design,
        // MJT 2026-11-26): MINE has no file, so Show in Library, then Copy As.
        for (const open of [
            () => ownRow.querySelector(".wv-refs-btn[data-wv-fd-act='more']").dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })),
            () => ownRow.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, screenX: 300, screenY: 300 })),
        ]) {
            open();
            const m = await wvT.waitFor(() => { const p = win.document.getElementById("wv-refs-menu"); return p && p.state === "open" ? p : null; }, 5000, 50);
            assert.ok(m && m.querySelector(".wv-refs-card[data-wv-refs-card='" + MINE.id + "']"), "the menu, with MINE's card");
            const btns = Array.from(m.querySelectorAll(":scope > menugroup.wv-refs-btn-row > *")).map(c => c.getAttribute("data-wv-refs-act"));
            assert.deepEqual(btns, ["library", "copy-as"], "Show in Library and Copy As, the card's buttons, without a file");
            m.hidePopup();
            assert.ok(await wvT.waitFor(() => !win.document.getElementById("wv-refs-menu"), 3000, 50), "closed");
        }
        const nums = [...body.querySelectorAll(".wv-fd-row .wv-fd-relscore")].map(e => Number(e.textContent));
        assert.isAbove(nums.length, 0, "related rows carry a closeness");
        for (const v of nums) assert.isTrue(v >= 0 && v <= 99, "0-99: " + v);
        for (let i = 1; i < nums.length; i++) assert.isAtLeast(nums[i - 1], nums[i], "closest first " + JSON.stringify(nums));
        assert.match(body.querySelector(".wv-fd-score").textContent, /\d/, "the score");
        const cs = win.getComputedStyle(body);
        assert.include(String(cs.contain), "inline-size", "contain: inline-size");
        // Item Links and Backlinks are not offered for a feed item (MJT 2026-11-22).
        for (const p of ["weavero-links", "weavero-backlinks"]) {
            assert.ok(await wvT.waitFor(() => { const s = pane.querySelector('item-pane-custom-section[data-pane$="' + p + '"]'); return !s || s.hidden; }, 5000, 100), p + " hidden for a feed item");
        }
        await showRow("L" + Zotero.Libraries.userLibraryID);
        await iv().selectItem(MINE.id);
        assert.ok(await wvT.waitFor(() => {
            const s = pane.querySelector('item-pane-custom-section[data-pane$="weavero-feeds"]');
            return !s || s.hidden;
        }, 5000, 100), "hidden for a library item");
    });

    it("the lists are edited through the store, counted, exported as an alerts file and imported from Scholar alert lists", async function () {
        const s = await wv._wvFdSettingsGet();
        assert.deepEqual(s.myNames, ["Thoraval, M.-J."]);
        assert.equal(await wv._wvFdCountMine(["Thoraval, M.-J."]), 1, "the live count: MINE");
        assert.equal(await wv._wvFdCountMine(["Nobody, Z."]), 0);
        // The default file, made new: the run's profile holds no earlier one.
        await IOUtils.remove(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "feeds", "alerts.json"), { ignoreAbsent: true });
        const path = await wv._wvFdExport();
        const doc = JSON.parse(String(await Zotero.File.getContentsAsync(path)));
        assert.equal(doc.format, "alerts/1", "a new alerts file: the neutral stamp");
        assert.deepEqual(doc.followed_authors, [{ name: "Zed, Q.", enabled: true }]);
        assert.deepEqual(doc.keyword_alerts, [{ query: "leidenfrost -review", enabled: true }]);
        assert.deepEqual(doc.identity.names, ["Thoraval, M.-J."]);
        assert.deepEqual(doc.identity.surnames, ["Thoraval"]);
        // Written over an alerts file another tool owns: its stamp stays, what it resolved
        // stays, a disabled entry stays, an entry Weavero no longer lists goes.
        const pr = PathUtils.join(PathUtils.tempDir, "wv-fd-alerts-" + Date.now() + ".json");
        await IOUtils.writeUTF8(pr, JSON.stringify({ format: "example-tool/alerts/1", updated: "2026-11-01",
            followed_authors: [{ name: "Q. Zed", openalex: ["A123"], confidence: "high", enabled: true }, { name: "Gone Author", enabled: true }, { name: "Off Author", enabled: false }],
            cited_people: [], watched_works: [{ doi: "10.1103/physrevlett.94.184505", label: "Drop splashing", openalex: "W1", enabled: true }], keyword_alerts: [] }));
        await wv._wvFdSettingsSet({ watched: ["10.1103/PhysRevLett.94.184505  Drop splashing on a dry smooth surface"] });
        await wv._wvFdExport(pr);
        const d2 = JSON.parse(String(await Zotero.File.getContentsAsync(pr)));
        assert.equal(d2.format, "example-tool/alerts/1", "the stamp of the file written over, kept");
        assert.deepEqual(d2.followed_authors, [{ name: "Q. Zed", openalex: ["A123"], confidence: "high", enabled: true }, { name: "Off Author", enabled: false }]);
        assert.deepEqual(d2.watched_works, [{ doi: "10.1103/physrevlett.94.184505", label: "Drop splashing on a dry smooth surface", openalex: "W1", enabled: true }]);
        try { await IOUtils.remove(pr); } catch (e) {}
        await wv._wvFdSettingsSet({ watched: [] });
        const n = await wv._wvFdImportDoc({ source: "a test", alerts: [
            { account: "someone@example.org", number: 1, target: "author", name: "Ada Lovelace", type: "new articles", results: "" },
            { account: "someone@example.org", number: null, target: "author", name: "Zed, Q.", type: "unnumbered (type not given)", results: "" },
            { account: "someone@example.org", number: 2, target: "author", name: "Marie-Jean Thoraval", type: "new citations", results: "" },
            { account: "someone@example.org", number: 3, target: "paper", name: "Thin film formation during splashing of viscous liquids", type: "new citations", results: "" },
        ] });
        const s2 = await wv._wvFdSettingsGet();
        assert.deepEqual(s2.followed, ["Zed, Q.", "Ada Lovelace"], "added, no duplicate");
        assert.deepEqual(s2.citedPersons, ["Marie-Jean Thoraval"]);
        assert.deepEqual(s2.watched, ["Thin film formation during splashing of viscous liquids"]);
        assert.isAbove(n, 0);
        assert.notInclude(JSON.stringify(s2), "example.org", "no account copied");
        const raw = String(await Zotero.File.getContentsAsync(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "feeds", "settings.json")));
        assert.include(raw, "Ada Lovelace", "persisted");
        // An alerts file imports too, whatever tool stamped it: its enabled entries.
        await wv._wvFdImportDoc({ format: "example-tool/alerts/1", followed_authors: [{ name: "Grace Hopper", enabled: true }, { name: "Disabled One", enabled: false }],
            cited_people: [], watched_works: [{ doi: "10.1/wv.x", label: "A watched paper", enabled: true }], keyword_alerts: [{ query: "splash crown", enabled: true }] });
        const s3 = await wv._wvFdSettingsGet();
        assert.include(s3.followed, "Grace Hopper");
        assert.notInclude(s3.followed, "Disabled One");
        assert.include(s3.watched, "10.1/wv.x A watched paper");
        assert.include(s3.alerts, "splash crown");
        // Another stamp is no alerts file: nothing of it is read.
        const nRefused = await wv._wvFdImportDoc({ format: "something/else/2", followed_authors: [{ name: "Refused Author", enabled: true }],
            cited_people: [], watched_works: [], keyword_alerts: [{ query: "refused query", enabled: true }] });
        assert.equal(nRefused, 0, "a file of another stamp adds nothing");
        const s4 = await wv._wvFdSettingsGet();
        assert.notInclude(s4.followed, "Refused Author");
        assert.notInclude(s4.alerts, "refused query");
        await wv._wvFdSettingsSet({ followed: ["Zed, Q."], watched: [], citedPersons: [], alerts: ["leidenfrost -review"] });
    });

    // The alerts file's stamp ("format"): "alerts/1", alone or after one prefix. The
    // stamp of a file written over is kept, so the tool that owns that file still
    // reads it (a tool may refuse any stamp but its own); a new file gets "alerts/1".
    it("the alerts file's stamp: any one-prefix alerts/1 is read and kept when written over; a new file gets alerts/1; another stamp is refused", async function () {
        const lists = { myNames: [], followed: ["Zed, Q."], alerts: [], watched: [], citedPersons: [] };
        const now = new Date("2026-11-28T12:00:00Z");
        assert.equal(L.wvFdExportDoc(lists, now).format, "alerts/1", "a new file: the neutral stamp");
        assert.equal(L.wvFdExportDoc(lists, now, null).format, "alerts/1", "no file before: the same");
        const owned = { format: "example-tool/alerts/1", followed_authors: [{ name: "Q. Zed", openalex: ["A1"], enabled: true }], tool_setting: 3 };
        const over = L.wvFdExportDoc(lists, now, owned);
        assert.equal(over.format, "example-tool/alerts/1", "written over: the file's stamp kept");
        assert.deepEqual(over.followed_authors, [{ name: "Q. Zed", openalex: ["A1"], enabled: true }], "and what that tool resolved");
        assert.equal(over.tool_setting, 3, "and the tool's own fields");
        assert.equal(owned.format, "example-tool/alerts/1", "the file read is not changed");
        assert.equal(L.wvFdExportDoc(lists, now, { format: "alerts/1" }).format, "alerts/1", "a neutral file stays neutral");
        assert.equal(L.wvFdExportDoc(lists, now, { format: "Example-Tool/Alerts/1" }).format, "Example-Tool/Alerts/1", "kept as written");
        const foreign = L.wvFdExportDoc(lists, now, { format: "something/else/2", followed_authors: [{ name: "Q. Zed", openalex: ["A9"], enabled: true }], tool_setting: 3 });
        assert.equal(foreign.format, "alerts/1", "another stamp: written as a new file");
        assert.deepEqual(foreign.followed_authors, [{ name: "Zed, Q.", enabled: true }], "nothing of it merged");
        assert.notProperty(foreign, "tool_setting");
        // Reading: the same stamps, no other.
        const read = (format) => L.wvFdImportAlerts({ format, followed_authors: [{ name: "Grace Hopper", enabled: true }] }).followed;
        for (const ok of ["alerts/1", "example-tool/alerts/1", "Example-Tool/Alerts/1", "tool_2.x/alerts/1"]) assert.deepEqual(read(ok), ["Grace Hopper"], "read: " + ok);
        for (const bad of ["something/else/2", "example-tool/alerts/2", "alerts/2", "alerts/10", "a/b/alerts/1", "/alerts/1", "example tool/alerts/1", "alerts/1/", "", null, 1]) {
            assert.deepEqual(read(bad), [], "refused: " + JSON.stringify(bad));
        }
        // On disk, through the module: a new file, then one another tool owns.
        const fresh = PathUtils.join(PathUtils.tempDir, "wv-fd-fresh-" + Date.now() + ".json");
        const tool = PathUtils.join(PathUtils.tempDir, "wv-fd-tool-" + Date.now() + ".json");
        try {
            await wv._wvFdExport(fresh);
            assert.equal(JSON.parse(String(await Zotero.File.getContentsAsync(fresh))).format, "alerts/1", "a new file on disk");
            await IOUtils.writeUTF8(tool, JSON.stringify({ format: "example-tool/alerts/1", followed_authors: [], cited_people: [], watched_works: [], keyword_alerts: [] }));
            await wv._wvFdExport(tool);
            assert.equal(JSON.parse(String(await Zotero.File.getContentsAsync(tool))).format, "example-tool/alerts/1", "written over on disk: the stamp kept");
            await IOUtils.writeUTF8(tool, JSON.stringify({ format: "something/else/2", followed_authors: [] }));
            await wv._wvFdExport(tool);
            assert.equal(JSON.parse(String(await Zotero.File.getContentsAsync(tool))).format, "alerts/1", "a file of another stamp, written over as a new one");
        }
        finally {
            for (const p of [fresh, tool]) { try { await IOUtils.remove(p); } catch (e) {} }
        }
    });

    it("asks nothing of the network and writes nothing to any library", async function () {
        const calls = [];
        const H = Zotero.HTTP;
        const origReq = H.request;
        const wins = [win, globalThis];
        const origFetch = wins.map(w => w.fetch);
        H.request = function () { calls.push("HTTP " + arguments[1]); return origReq.apply(this, arguments); };
        wins.forEach((w, i) => { w.fetch = function () { calls.push("fetch " + arguments[0]); return origFetch[i].apply(this, arguments); }; });
        try {
            await wv._wvFdRefresh("spec-network", { rebuild: true });
            await showRow("L" + feedA.libraryID);
            await iv().selectItem(F7.id);
            await wvT.sleep(800);
        }
        finally {
            H.request = origReq;
            wins.forEach((w, i) => { w.fetch = origFetch[i]; });
        }
        assert.deepEqual(calls, [], "no request");
        await showRow("L" + Zotero.Libraries.userLibraryID);
        assert.equal(await fingerprint(), fpBefore, "the libraries unchanged");
    });

    it("switched off, Zotero's own feed order is back and nothing of the feature is left; on again, all of it", async function () {
        await showRow("L" + feedA.libraryID);
        await wvT.withPref("weavero.enableFeeds", false, async () => {
            assert.ok(await wvT.waitFor(() => !wv._wvFdColKey, 5000, 50), "the column unregistered");
            assert.isNotOk(wv._wvFdLibColKey, "the In Library column unregistered");
            const v = iv();
            assert.ok(await wvT.waitFor(() => v.getSortField() === "id", 5000, 50), "Zotero's own feed sort field");
            assert.isFalse(!!v.isSortable, "not sortable, as Zotero has it");
            assert.isFalse(Object.prototype.hasOwnProperty.call(v, "getSortField"), "no own getSortField left");
            const P = /** @type {any} */ (Zotero).CollectionTreeRow.prototype;
            assert.isFalse(!!(P._wvWraps && P._wvWraps.isSortable), "isSortable given back");
            assert.isNotOk(wv._wvFdSecKey, "the section unregistered");
            const IP = win.customElements.get("item-pane");
            assert.isFalse(!!(IP && IP.prototype._wvWraps && IP.prototype._wvWraps.renderFeedHead), "the item pane's feed head given back");
            assert.isNull(win.document.querySelector(".wv-fd-badge"), "no badge left");
            assert.isNull(win.document.getElementById("wv-fd-badge-card"), "no card left");
            const sorted = rowIDs();
            const byId = sorted.slice().sort((a, b) => (Zotero.Prefs.get("feeds.sortAscending") ? a - b : b - a));
            assert.deepEqual(sorted, byId, "Zotero's order: by id");
        });
        const back = await wvT.waitFor(() => !!wv._wvFdColKey && iv().getSortField() === wv._wvFdColKey, 8000, 50);
        const v2 = iv();
        assert.ok(back, "on again: the column sorts " + JSON.stringify({ key: wv._wvFdColKey, on: wv._wvFdOn(), sf: v2.getSortField(), wraps: Object.keys(v2._wvWraps || {}),
            cols: v2._getColumns().map(c => c.dataKey + (c.hidden ? "(h)" : "") + (c.sortDirection ? "(" + c.sortDirection + ")" : "")), sorted: v2._sortedColumn && v2._sortedColumn.dataKey,
            prefs: Object.keys(v2._getColumnPrefs ? v2._getColumnPrefs() : {}) }));
        await showRow("L" + Zotero.Libraries.userLibraryID);
    });
});
