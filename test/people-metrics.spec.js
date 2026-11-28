/* global describe, it, before, after, assert, Zotero, wvT, PathUtils, IOUtils */

// Researchers: citation counts and h-index (MJT 2026-11-25: "Would it be easy to
// add some citation counts from different sources, for papers and also H-index for
// researchers"; approved as proposed, survey work/plugin-surveys/2026-11-25-
// citation-counts.md). OpenAlex first, on the requests a Refresh already makes:
//  - the works' `cited_by_count`, the author's `cited_by_count` and
//    `summary_stats` (h_index, i10_index) are asked for;
//  - one profile: OpenAlex's own figures; several (an h-index does not add up)
//    or none: computed from the works listed, each work once;
//  - shown with the source and the date: the figures in the Publications
//    title, "Cited N times" on each publication, a "Most cited" sort;
//  - a work with no count (a cache from before) shows none and sorts last.
// No network: the cache a Refresh writes is written here.

describe("Weavero — Researchers: citation counts and h-index", function () {
    this.timeout(60000);
    let wv, lib, win, rec;
    const storePath = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people.json");
    const root = () => wv._wvPeopleRootOf(win);
    const q = (sel) => { const r = root(); return r ? r.querySelector(sel) : null; };
    const qa = (sel) => { const r = root(); return r ? Array.from(r.querySelectorAll(sel)) : []; };
    const work = (id, cited, year) => ({ id, doi: "10.9999/wv-metrics-" + id.toLowerCase(), title: "WV-TEST metrics " + id, year, venue: "J. Test", authors: ["A. Author"], nAuthors: 1, type: "journalArticle", cited });

    before(async function () {
        wv = wvT.plugin();
        lib = wvT.lib();
        if (!lib || typeof lib.wvPpMetrics !== "function") wvT.absent("wvPpMetrics");
        for (const m of ["_wvPeopleCreate", "_wvPeopleCacheWrite", "_wvPeopleTabOpen", "_wvPeopleViewOf", "_wvPeopleTabRender"]) wvT.method(m);
        win = Zotero.getMainWindow();
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        await wv._wvPeopleLoad();
    });

    after(async function () {
        try { wv._wvPeopleTabClose(win); } catch (e) {}
        try { for (const r of wv._wvPeopleAllSync().slice()) await wv._wvPeopleRemove(r.id); } catch (e) {}
        try { await IOUtils.remove(storePath(), { ignoreAbsent: true }); } catch (e) {}
        try { await IOUtils.remove(PathUtils.join(Zotero.DataDirectory.dir, "weavero", "people-cache"), { recursive: true, ignoreAbsent: true }); } catch (e) {}
        wv._wvPeopleDB = null;
        try { const ZT = win.Zotero_Tabs; ZT.select(ZT._tabs.find((t) => String(t.type).startsWith("library")).id); } catch (e) {}
    });

    it("the Refresh asks OpenAlex for the counts: the works' and the author's", function () {
        assert.include(lib.WV_PP_API.openalexWorks(["A1"]), "cited_by_count");
        const a = lib.WV_PP_API.openalexAuthor("A1");
        assert.include(a, "cited_by_count");
        assert.include(a, "summary_stats");
    });

    it("a work's count is read; a missing or null one stays unknown, never 0", function () {
        const ws = lib.wvPpWorks({ results: [
            { id: "https://openalex.org/W1", display_name: "a", cited_by_count: 12 },
            { id: "https://openalex.org/W2", display_name: "b", cited_by_count: 0 },
            { id: "https://openalex.org/W3", display_name: "c" },
            { id: "https://openalex.org/W4", display_name: "d", cited_by_count: null },
        ] });
        assert.deepEqual(ws.map((w) => w.cited), [12, 0, undefined, undefined]);
    });

    it("one profile: OpenAlex's own figures; several: computed from the works, each once", function () {
        const one = lib.wvPpMetrics([{ id: "A1", cited_by_count: 3120, summary_stats: { h_index: 24, i10_index: 52 } }], [work("W1", 5, 2020)]);
        assert.deepEqual(one, { h: 24, i10: 52, cites: 3120, from: "openalex", profiles: 1, works: 0 });
        const ws = [work("W1", 50, 2020), work("W2", 20, 2019), work("W3", 12, 2018), work("W4", 3, 2017), work("W5", 3, 2016), work("W6", 1, 2015), work("W1", 50, 2020), work("W7", undefined, 2014)];
        const two = lib.wvPpMetrics([{ id: "A1", summary_stats: { h_index: 9 } }, { id: "A2" }], ws);
        // 50 + 20 + 12 + 3 + 3 + 1 = 89; three works with at least 3 citations, not four with 4.
        assert.deepEqual(two, { h: 3, i10: 3, cites: 89, from: "works", profiles: 2, works: 6 });
        assert.isNull(lib.wvPpMetrics([], [work("W1", undefined, 2020)]), "nothing to go by");
    });

    describe("on the researcher's page", function () {
        before(async function () {
            rec = await wv._wvPeopleCreate("Metrics", "Wv");
            rec.lines.push({ fact: "openalex", value: "A9990001", source: "openalex", status: "confirmed" });
            await wv._wvPeopleSave([rec]);
            await wv._wvPeopleCacheWrite(rec.id, {
                v: 1, date: "2026-11-26T01:00:00.000Z",
                raw: { openalex: { A9990001: { id: "https://openalex.org/A9990001", cited_by_count: 89, summary_stats: { h_index: 3, i10_index: 3 } } } },
                works: [work("W1", 50, 2020), work("W2", 20, 2023), work("W3", 12, 2018), work("W7", undefined, 2024)],
                worksCount: 4,
            });
            wv._wvPeopleTabOpen(win, { personID: rec.id });
            assert.isOk(await wvT.waitFor(() => q(".wv-pp-metrics"), 10000), "the figures");
        });

        it("the figures in the Publications title, their source and date in the tooltip", function () {
            const m = q(".wv-pp-metrics");
            assert.strictEqual(m.getAttribute("data-wv-pp-metrics"), "openalex");
            assert.strictEqual(m.getAttribute("data-h"), "3");
            assert.match(m.textContent, /3.*3.*89/);
            assert.include(m.getAttribute("title"), "OpenAlex");
            assert.include(m.getAttribute("title"), "2026-11-26");
        });

        it("each publication's count, with its date; none for a work without one", function () {
            const byId = (id) => q("[data-wv-pp-work='" + id + "'] .wv-pp-wcited");
            assert.strictEqual(byId("W1").getAttribute("data-wv-pp-cited"), "50");
            assert.match(byId("W1").textContent, /50/);
            assert.include(byId("W1").getAttribute("title"), "2026-11-26");
            assert.isNull(byId("W7"), "no count shown for an unknown one");
        });

        it("Semantic Scholar, on a click only: the author through a paper's DOI, then the figures, a link to the profile", async function () {
            const asked = [];
            const launched = [];
            wv._launchURL = (u) => { launched.push(String(u)); };
            wv._wvPeopleGet = async (url) => {
                asked.push(String(url));
                if (url.startsWith("https://api.semanticscholar.org/graph/v1/paper/DOI:")) return { paperId: "x", authors: [{ authorId: "123", name: "Wv Metrics" }, { authorId: "9", name: "A. Other" }] };
                if (url.startsWith("https://api.semanticscholar.org/graph/v1/author/123")) return { authorId: "123", name: "Wv Metrics", url: "https://www.semanticscholar.org/author/123", hIndex: 4, citationCount: 95, paperCount: 7 };
                throw new Error("unexpected " + url);
            };
            try {
                assert.lengthOf(asked, 0, "nothing asked before the click");
                q("[data-wv-pp-act='s2']").click();
                const s2 = await wvT.waitFor(() => q(".wv-pp-s2"), 6000, 40);
                assert.isOk(s2, "the figures");
                assert.strictEqual(s2.getAttribute("data-wv-pp-s2"), "4");
                assert.match(s2.textContent, /4.*95/);
                assert.include(s2.getAttribute("title"), "https://www.semanticscholar.org/author/123");
                assert.deepEqual(asked, [lib.WV_PP_API.s2Paper("10.9999/wv-metrics-w1"), lib.WV_PP_API.s2Author("123")]);
                s2.click();
                assert.deepEqual(launched, ["https://www.semanticscholar.org/author/123"]);
                // A refusal is said, and the figures read before stay.
                wv._wvPeopleGet = async () => { throw new Error("HTTP 429 Too Many Requests"); };
                q("[data-wv-pp-act='s2']").click();
                assert.isOk(await wvT.waitFor(() => q(".wv-pp-s2msg"), 6000, 40), "the failure said");
                assert.include(q(".wv-pp-s2msg").textContent, "429");
                assert.isOk(q(".wv-pp-s2"), "the last figures kept");
            }
            finally { delete wv._wvPeopleGet; delete wv._launchURL; }
            assert.strictEqual(lib.wvPpS2AuthorOf({ authors: [{ authorId: "1", name: "W. Metrics" }, { authorId: "2", name: "Wv Metrics" }] }, "Metrics", "Wv"), "", "two fit: none");
        });

        it("Google Scholar: a profile the user gives, read on a click; a refusal is said", async function () {
            const TABLE = '<div id="gsc_rsb_cit"><table id="gsc_rsb_st"><thead><tr><th></th><th class="gsc_rsb_sth">All</th><th class="gsc_rsb_sth">Since 2021</th></tr></thead><tbody>'
                + '<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">Citations</a></td><td class="gsc_rsb_std">3,120</td><td class="gsc_rsb_std">1,204</td></tr>'
                + '<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">h-index</a></td><td class="gsc_rsb_std">24</td><td class="gsc_rsb_std">18</td></tr>'
                + '<tr><td class="gsc_rsb_sc1"><a class="gsc_rsb_f">i10-index</a></td><td class="gsc_rsb_std">52</td><td class="gsc_rsb_std">40</td></tr></tbody></table></div>';
            assert.strictEqual(lib.wvPpScholarId("https://scholar.google.com/citations?user=AbCdEfGhIjKl&hl=en"), "AbCdEfGhIjKl");
            assert.strictEqual(lib.wvPpScholarId("scholar.google.fr/citations?hl=fr&user=AbCdEfGhIjKl"), "AbCdEfGhIjKl");
            assert.strictEqual(lib.wvPpScholarId("https://example.com/citations?user=AbCdEfGhIjKl"), "", "another site");
            assert.deepEqual(lib.wvPpScholarFigures(TABLE, "AbCdEfGhIjKl", "2026-11-26"), { user: "AbCdEfGhIjKl", cites: 3120, h: 24, i10: 52, date: "2026-11-26" });
            assert.isNull(lib.wvPpScholarFigures("<html><body>Please show you're not a robot</body></html>", "x", "d"));
            assert.isOk(q("[data-wv-pp-act='gs-add']"), "Add, while no profile is known");
            const asked = [];
            wv._wvPeopleGetText = async (url) => { asked.push(String(url)); return TABLE; };
            try {
                await wv._wvPeopleScholarSet(rec.id, "AbCdEfGhIjKl");
                assert.isOk(await wvT.waitFor(() => q("[data-wv-pp-act='gs-read']"), 6000, 40), "Read, once the profile is known");
                assert.lengthOf(asked, 0, "nothing read before the click");
                q("[data-wv-pp-act='gs-read']").click();
                const gs = await wvT.waitFor(() => q(".wv-pp-gs"), 6000, 40);
                assert.isOk(gs);
                assert.strictEqual(gs.getAttribute("data-wv-pp-gs"), "24");
                assert.deepEqual(asked, ["https://scholar.google.com/citations?user=AbCdEfGhIjKl&hl=en"]);
                wv._wvPeopleGetText = async () => "<html>unusual traffic</html>";
                q("[data-wv-pp-act='gs-read']").click();
                assert.isOk(await wvT.waitFor(() => q(".wv-pp-gsmsg"), 6000, 40), "the refusal said");
                assert.isOk(q(".wv-pp-gs"), "the last figures kept");
                q("[data-wv-pp-act='gs-forget']").click();
                assert.isOk(await wvT.waitFor(() => (q("[data-wv-pp-act='gs-add']") ? true : null), 6000, 40), "forgotten");
                assert.notProperty(wv._wvPeopleGetRec(rec.id), "scholar");
            }
            finally { delete wv._wvPeopleGetText; }
        });

        it("Most cited: by count, the unknown last", async function () {
            const v = wv._wvPeopleViewOf(win);
            v.wk.sort = "cited";
            wv._wvPeopleTabRender(win);
            assert.isOk(await wvT.waitFor(() => (qa(".wv-pp-work").length === 4 ? true : null), 6000, 40));
            assert.deepEqual(qa(".wv-pp-work").map((r) => r.getAttribute("data-wv-pp-work")), ["W1", "W2", "W3", "W7"]);
            v.wk.sort = "new";
            wv._wvPeopleTabRender(win);
            assert.isOk(await wvT.waitFor(() => (qa(".wv-pp-work").length === 4 ? true : null), 6000, 40));
            assert.deepEqual(qa(".wv-pp-work").map((r) => r.getAttribute("data-wv-pp-work")), ["W7", "W2", "W1", "W3"]);
        });
    });
});
