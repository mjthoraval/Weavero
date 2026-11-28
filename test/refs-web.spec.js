/* global describe, it, before, assert */

// Open in Browser for a reference in none of your libraries (1.2.1-refs.9,
// MJT 2026-11-20): what a click opens, decided by src/lib/ref-web.ts -- the
// entry's own link (a DOI or URL it writes, the PDF's link on it), else
// Crossref's CONFIDENT answer (score, first author, year), else a Google
// Scholar search -- and the PDF's own link read from Zotero's structure data
// (src/lib/ref-list.ts, WvRefEntry.url). Pure functions, no network: the
// Crossref answers below are the five real ones recorded on 2026-11-20
// (D:/tmp/refs9-crossref/, cut to the fields read). The reader-side wiring
// (the globe, the menu entry, the request itself) is in test/refs.spec.js.

describe("Weavero — references: Open in Browser (lib/ref-web.ts)", function () {
    let L;
    before(function () {
        L = wvT.lib();
        if (!L) wvT.absent("lib");
        for (const f of ["wvRefWebOwnLink", "wvRefWebPick", "wvRefWebTitle", "wvRefWebFirstAuthor", "wvRefWebScholarUrl", "wvRefWebCrossrefUrl", "wvRefWebBare", "wvRefFirstAuthorIs", "wvRefList"]) {
            if (typeof L[f] !== "function") wvT.absent("lib." + f);
        }
    });

    const work = (doi, score, family, years, title) => ({ DOI: doi, score, title: [title],
        author: family ? [{ family, given: "X.", sequence: "first" }] : undefined,
        issued: { "date-parts": [[years[0]]] }, "published-online": years[1] ? { "date-parts": [[years[1]]] } : undefined });
    const answer = (...items) => ({ status: "ok", "message-type": "work-list", message: { items } });
    const REC = {
        aps: ["D. Bartolo, C. Josserand, and D. Bonn, Phys. Rev. Lett. 96, 124501 (2006).",
            answer(work("10.1103/PhysRevLett.96.124501", 59.90917, "Bartolo", [2006, 2006], "Singular Jets and Bubbles in Drop Impact"),
                work("10.1103/PhysRevApplied.2.044018", 41.90089, "Laan", [2014], "Maximum Diameter of Impacting Liquid Droplets"))],
        vanc: ["Steinman L, Zamvil SS. How to successfully apply animal studies in experimental allergic encephalomyelitis to research on multiple sclerosis. Ann Neurol. 2006;60(1):12-21.",
            answer(work("10.1002/ana.20913", 107.156715, "Steinman", [2006], "How to successfully apply animal studies ..."),
                work("10.1097/00005072-195804000-00011", 48.607212, "Ferraro", [1958], "Studies on Multiple Sclerosis"))],
        short: ["J. Eggers, Rev. Mod. Phys. 69, 865 (1997).",
            answer(work("10.1103/RevModPhys.69.865", 47.96619, "Eggers", [1997], "Nonlinear dynamics and breakup of free-surface flows"),
                work("10.1103/RevModPhys.69.575", 30.153522, "Gunnarsson", [1997], "Superconductivity in fullerides"))],
        book: ["Batchelor, G. K. 1967 An Introduction to Fluid Dynamics. Cambridge University Press.",
            answer(work("10.1017/S0001924000054221", 43.312675, "Squire", [1967, 2016], "An Introduction to Fluid Dynamics.G. K. Batchelor. (a review)"),
                work("10.1002/qj.49709440128", 39.554607, null, [1968, 2006], "An introduction to fluid dynamics. (a review)"))],
        fake: ["Foster, R. 2021 Thin films on soft substrates and their slow drainage dynamics. Annu. Rev. Test Fluid 53, 33-58.",
            answer(work("10.1146/annurev-fluid-030121-025957", 36.359024, "Zheng", [2022], "The Influence of Boundaries on Gravity Currents and Thin Films"),
                work("10.1146/fluid.2020.53.issue-1", 35.355255, null, [2021], ""))],
    };

    it("Crossref's answer is taken only when confident: score >= 40, the entry's first author, a year the entry writes", function () {
        const pick = (k) => { const p = L.wvRefWebPick(REC[k][1], REC[k][0]); return p ? p.doi : null; };
        assert.equal(pick("aps"), "10.1103/physrevlett.96.124501", "an APS entry without a title (59.9)");
        assert.equal(pick("vanc"), "10.1002/ana.20913", "a Vancouver entry (107.2)");
        assert.equal(pick("short"), "10.1103/revmodphys.69.865", "a short APS entry (48.0)");
        assert.isNull(pick("book"), "a 1967 review of the cited book, same title and year: another first author (Squire)");
        assert.isNull(pick("fake"), "a made-up reference: score 36.4, another author");
        // Each check alone refuses.
        const one = (over) => L.wvRefWebPick(answer(Object.assign(work("10.5555/x", 80, "Bartolo", [2006]), over)), REC.aps[0]);
        assert.ok(one({}), "fixture: passes as it is");
        assert.isNull(one({ score: 39.9 }), "the score");
        assert.isNull(one({ author: [{ family: "Bonn", sequence: "first" }] }), "the first author (Bonn is the third)");
        assert.isNull(one({ issued: { "date-parts": [[2008]] } }), "the year");
        assert.ok(one({ issued: { "date-parts": [[2005]] }, "published-online": { "date-parts": [[2006]] } }), "the online year counts");
        // The second row is looked at when the first fails.
        const two = L.wvRefWebPick(answer(work("10.5555/review", 90, "Squire", [2006]), work("10.5555/real", 50, "Bartolo", [2006])), REC.aps[0]);
        assert.equal(two && two.doi, "10.5555/real");
        assert.isNull(L.wvRefWebPick(answer(Object.assign(work("", 90, "Bartolo", [2006]))), REC.aps[0]), "no DOI");
        assert.isNull(L.wvRefWebPick(null, REC.aps[0]), "no answer");
        assert.isNull(L.wvRefWebPick({ message: { items: [] } }, REC.aps[0]), "an empty one");
    });

    it("the entry's own link first: a DOI, a URL, the PDF's link -- never the citing paper's DOI", function () {
        const own = (t, pdf, self) => { const r = L.wvRefWebOwnLink(t, pdf, self); return r ? r.how + " " + r.url : null; };
        assert.equal(own("Smith J. A title. J. Test 1, 2 (2001). doi:10.1017/jfm.2017.424."), "doi https://doi.org/10.1017/jfm.2017.424");
        assert.equal(own("Smith J. https://doi.org/10.1103/PhysRevFluids.3.013601"), "doi https://doi.org/10.1103/physrevfluids.3.013601");
        assert.equal(own("A web page. https://example.org/page.html. Accessed 2020."), "url https://example.org/page.html");
        assert.equal(own("D. Bonn, Phys. Rev. Lett. 96, 124501 (2006).", "https://doi.org/10.1103/PhysRevLett.96.124501"), "pdf https://doi.org/10.1103/PhysRevLett.96.124501");
        assert.isNull(own("D. Bonn, Phys. Rev. Lett. 96, 124501 (2006)."), "nothing of its own");
        assert.isNull(own("Smith 2020. Published online by Cambridge University Press https://doi.org/10.1017/jfm.2023.13", null, ["10.1017/jfm.2023.13"]),
            "the citing paper's own DOI (a page footer) is not the entry's");
        assert.equal(L.wvRefWebOwnLink("x doi:10.1175/1520-0469(1991)048", null).url, "https://doi.org/10.1175/1520-0469(1991)048", "parentheses kept");
    });

    it("Google Scholar: the title, the first author and the year; the entry itself when no title is read", function () {
        const q = (t) => decodeURIComponent(L.wvRefWebScholarUrl(t).replace(/^https:\/\/scholar\.google\.com\/scholar\?q=/, ""));
        assert.equal(L.wvRefWebTitle(REC.book[0]), "An Introduction to Fluid Dynamics", "after the year (JFM)");
        assert.equal(L.wvRefWebTitle(REC.vanc[0]), "How to successfully apply animal studies in experimental allergic encephalomyelitis to research on multiple sclerosis", "after the authors (Vancouver)");
        assert.equal(L.wvRefWebTitle("D. Bartolo, C. Josserand, and D. Bonn, “Singular jets and bubbles in drop impact,” Phys. Rev. Lett. 96, 124501 (2006)."), "Singular jets and bubbles in drop impact", "in quotes (AIP)");
        assert.equal(L.wvRefWebTitle("Smith, J. (2001). Drops on soft solids. J. Test 1, 2."), "Drops on soft solids", "APA");
        assert.equal(L.wvRefWebTitle(REC.aps[0]), "", "an APS entry prints none");
        assert.equal(L.wvRefWebTitle("Smith J (1999) Nature 400:12-15."), "", "a journal and pages are no title");
        assert.equal(q(REC.book[0]), "An Introduction to Fluid Dynamics Batchelor 1967");
        assert.equal(q("[3] " + REC.aps[0]), REC.aps[0], "no title: the entry, without its number");
        assert.equal(L.wvRefWebFirstAuthor("[7] I. R. Peters, Y. Tagawa, ..."), "Peters");
        assert.equal(L.wvRefWebFirstAuthor("van der Meer, D. 2014 Impact on granular beds."), "van der Meer");
        assert.equal(L.wvRefWebFirstAuthor("PETERS, I.R. & TAGAWA, Y. 2013"), "PETERS");
    });

    it("Crossref's query: the entry without its number, two rows, nothing else (no e-mail, no name)", function () {
        const u = L.wvRefWebCrossrefUrl("[12] " + REC.aps[0]);
        assert.match(u, /^https:\/\/api\.crossref\.org\/works\?query\.bibliographic=[^&]+&rows=2$/);
        assert.equal(decodeURIComponent(u.split("query.bibliographic=")[1].split("&")[0]), REC.aps[0]);
        assert.notMatch(u, /mailto|@/);
        assert.isAtMost(decodeURIComponent(L.wvRefWebCrossrefUrl("x ".repeat(600))).length, 600, "a long entry is cut");
    });

    it("the matcher's first-author rule, for a surname from elsewhere", function () {
        assert.isTrue(L.wvRefFirstAuthorIs(REC.aps[0], "Bartolo"));
        assert.isFalse(L.wvRefFirstAuthorIs(REC.aps[0], "Bonn"), "the third author is not the first");
        assert.isTrue(L.wvRefFirstAuthorIs("van der Meer, D. 2014 ...", "van der Meer"));
        assert.isFalse(L.wvRefFirstAuthorIs(REC.book[0], "Squire"));
    });

    // The PDF's own link: Zotero's structure data puts an external link on the
    // run of text it covers (document-worker structure/apply-refs.js: a link
    // annotation's URL, or a DOI / URL Zotero read in the text) as `target.url`;
    // internal links (`refs`, back to where the paper cites the entry) do not
    // lead online.
    it("the reference list keeps the PDF's own link of each entry (a doi.org one first), and only its own", function () {
        const run = (text, extra) => Object.assign({ text }, extra || {});
        const item = (...runs) => ({ type: "listitem", content: runs, anchor: { pageRects: [[1, 50, 600, 500, 610]] } });
        const s = { content: [
            { type: "heading", content: [run("References")] },
            { type: "list", content: [
                item(run("[1] D. Bartolo, C. Josserand, and D. Bonn, "), run("Phys. Rev. Lett. 96, 124501", { target: { url: "https://doi.org/10.1103/PhysRevLett.96.124501" } }), run(" (2006).")),
                item(run("[2] Steinman L, Zamvil SS. A title of some length. Ann Neurol. 2006;60:12. PubMed: "), run("16802293", { target: { url: "http://www.ncbi.nlm.nih.gov/pubmed/16802293" } }),
                    run(" "), run("10.1002/ana.20913", { target: { url: "https://doi.org/10.1002/ana.20913" } })),
                item(run("[3] ", { refs: [[0]] }), run("J. Eggers, Rev. Mod. Phys. 69, 865 (1997).")),
                item(run("[4] A. Author, A title, J. Test 1, 2 (2001).")),
                item(run("[5] B. Author, Another title, J. Test 3, 4 (2002).")),
            ] },
        ] };
        const es = L.wvRefList(s).entries;
        assert.equal(es.length, 5, JSON.stringify(es.map((e) => e.text)));
        assert.equal(es[0].url, "https://doi.org/10.1103/PhysRevLett.96.124501", "a link annotation over the entry's journal reference");
        assert.equal(es[1].url, "https://doi.org/10.1002/ana.20913", "a doi.org link before another one");
        assert.isUndefined(es[2].url, "an internal link is no link online");
        assert.isUndefined(es[3].url, "none");
    });
});
