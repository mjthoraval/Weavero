/* global describe, it, before, after, assert, Zotero, PathUtils, IOUtils, wvT */
// The lineage tree of the Researchers tab (branch peoplenet, plan approved by MJT
// 2026-11-25; design work/people-genealogy-ui-survey-2026-11-25.md A1):
//   - the layout, a pure function (lib/people-tree.ts): the person in the centre,
//     mentors ABOVE as generations -- a postdoc host is a generation like a PhD
//     advisor (MJT's choice) --, trainees BELOW, 3 up and 2 down; co-advisors side
//     by side over their student; "+N" for what is not shown (the depth, a cap per
//     card, the source's counted outer ring); Back / Forward / Home;
//   - the Academic Family Tree source (lib/people-aft.ts), read from a SYNTHETIC
//     extract: invented names and ids, no row of the real export;
//   - the tab: the extract read lazily from <data dir>/weavero/aft-subset.json at
//     the first need, cards with the attribution and a link to the person's AFT
//     page, Follow on a card not in Researchers, a click re-centres, Back /
//     Forward / Home, zoom, "+N" opens one more generation, CSV / SVG / PNG export.
describe("Weavero — People: the lineage tree and the Academic Family Tree source", function () {
    this.timeout(120000);
    let wv, lib, win, doc;

    // ---- a synthetic extract (format of lib/people-aft.ts) -------------------------------
    // 901 Wilhelmina Ostrander: PhD with 902 Tobias Brackenbury (1990) and 903 Crispin
    // Halloway (1990, both PhD: co-advisors), postdoc with 904 Odile Fennimore (1995).
    // 902's advisor 905 Petronella Ashgrove (1960), hers 908 Barnaby Wexley (1930), his
    // 909 Lucan Ormsby (1900): four generations up. 905 has 2 more mentors the extract
    // only counts. Trainees of 901: 906 Saoirse Lindqvist (PhD 2005), 907 Ignatius
    // Pemberton (PhD 2008), 910 Imelda Vasquez-Thorne (postdoc 2010); 906's student 911
    // Rufus Tamsworth (2015), his 912 Ottilie Yardley (2020): three generations down.
    const P = (last, first, inst, m, t, orcid) => [last, first, "Ph.D.", inst, "fluids", orcid || "", m, t];
    const FIXTURE = {
        v: 1,
        source: { name: "Academic Family Tree", licence: "CC BY 4.0", version: "test", doi: "10.5281/zenodo.0", site: "https://academictree.org/",
            page: "https://academictree.org/{tree}/peopleinfo.php?pid={pid}", pageVerified: false },
        inst: ["Imaginary Institute of Flows", "University of Nowhere", "Fictional Polytechnic"],
        people: {
            901: P("Ostrander", "Wilhelmina", 0, 3, 3, "0000-0002-1825-0097"),
            902: P("Brackenbury", "Tobias", 1, 1, 1),
            903: P("Halloway", "Crispin", 1, 0, 1),
            904: P("Fennimore", "Odile", 2, 0, 1),
            905: P("Ashgrove", "Petronella", 1, 3, 1),
            906: P("Lindqvist", "Saoirse", 0, 1, 1),
            907: P("Pemberton", "Ignatius", 0, 1, 0),
            908: P("Wexley", "Barnaby", 2, 1, 1),
            909: P("Ormsby", "Lucan", 2, 0, 1),
            910: P("Vasquez-Thorne", "Imelda", 0, 1, 0),
            911: P("Tamsworth", "Rufus", 0, 1, 1),
            912: P("Yardley", "Ottilie", -1, 1, 0),
        },
        edges: [
            [901, 902, 1, 1990, 1, "On imaginary flows"],
            [901, 903, 1, 1990, 1, "On imaginary flows"],
            [901, 904, 2, 1995, 2, ""],
            [902, 905, 1, 1960, 1, ""],
            [905, 908, 1, 1930, 2, ""],
            [908, 909, 1, 1900, 2, ""],
            [906, 901, 1, 2005, 0, "Drops that never were"],
            [907, 901, 1, 2008, 0, ""],
            [910, 901, 2, 2010, 0, ""],
            [911, 906, 1, 2015, 0, ""],
            [912, 911, 1, 2020, 0, ""],
        ],
        grants: { 901: [["R01XX000001", 2001, 2006, 6, "1234567"]] },
        units: { "ostrander|wilhelmina": [901, "B", 5, 6], "brackenbury|tobias": [902, "A", 1, 4] },
    };
    const AFT_PATH = () => PathUtils.join(Zotero.DataDirectory.dir, "weavero", "aft-subset.json");

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        lib = wvT.lib();
        for (const f of ["wvLtLayout", "wvLtHistNew", "wvLtHistGo", "wvLtHistMove", "wvLtCsv", "wvLtRelType", "wvAftSource", "wvAftUnitKey", "wvAftFirstAgrees"]) {
            if (!lib || typeof lib[f] !== "function") wvT.absent("lib." + f);
        }
        for (const m of ["_wvAftLoad", "_wvAftReset", "_wvAftNow", "_wvLtState", "_wvLtGo", "_wvLtMove", "_wvLtHome", "_wvLtZoom", "_wvLtOpenMore", "_wvLtExportTo", "_wvPeopleTabOpen"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document;
    });

    // ---- the layout (pure) ---------------------------------------------------------------
    const W = 200, H = 80, GX = 16, GY = 56;
    const graphOf = (edges, more) => ({
        mentorsOf: (k) => edges.filter(e => e.trainee === k),
        traineesOf: (k) => edges.filter(e => e.mentor === k),
        moreMentors: (k) => (more && more.up && more.up[k]) || 0,
        moreTrainees: (k) => (more && more.down && more.down[k]) || 0,
    });
    const E = (mentor, trainee, type, years, co) => ({ mentor, trainee, type, years: years || "", co: !!co, src: "people" });
    const EDGES = [
        E("A", "F", "phd", "1990"), E("C", "F", "phd", "1990", true), E("PD", "F", "postdoc", "1995"),
        E("G", "A", "phd", "1960"), E("GG", "G", "phd", "1930"), E("GGG", "GG", "phd", "1900"),
        E("F", "S1", "phd", "2005"), E("F", "S2", "phd", "2008"), E("F", "S3", "postdoc", "2010"),
        E("S1", "SS", "phd", "2015"), E("SS", "SSS", "phd", "2020"),
    ];
    const at = (lay, k) => lay.nodes.find(n => n.key === k) || null;
    const opts = (o) => Object.assign({ up: 3, down: 2, w: W, h: H, gx: GX, gy: GY }, o || {});

    it("layout: mentors above as generations -- a postdoc host is one, like a PhD advisor --, trainees below, 3 up and 2 down", function () {
        const lay = lib.wvLtLayout(graphOf(EDGES), "F", opts());
        const gens = Object.fromEntries(lay.nodes.map(n => [n.key, n.gen]));
        assert.deepEqual(gens, { F: 0, A: -1, C: -1, PD: -1, G: -2, GG: -3, S1: 1, S2: 1, S3: 1, SS: 2 }, JSON.stringify(gens));
        assert.isNull(at(lay, "GGG"), "a fourth generation up is not shown");
        assert.isNull(at(lay, "SSS"), "nor a third one down");
        assert.strictEqual(at(lay, "PD").gen, -1, "the postdoc host: a generation up");
        assert.isBelow(at(lay, "A").y, at(lay, "F").y, "mentors above");
        assert.isAbove(at(lay, "S1").y, at(lay, "F").y, "trainees below");
        const pd = lay.edges.find(e => e.mentor === "PD");
        assert.deepEqual([pd.type, pd.years], ["postdoc", "1995"], "the edge is typed and dated");
        assert.strictEqual(lay.edges.length, 9, "one edge per pair on screen: " + lay.edges.map(e => e.mentor + ">" + e.trainee).join(" "));
    });

    it("layout: \"+N\" counts what is not shown -- past the depth, past a card's cap, and the source's counted ring", function () {
        let lay = lib.wvLtLayout(graphOf(EDGES, { up: { G: 2 } }), "F", opts());
        assert.strictEqual(at(lay, "GG").hidUp, 1, "GGG, past 3 up");
        assert.strictEqual(at(lay, "SS").hidDown, 1, "SSS, past 2 down");
        assert.strictEqual(at(lay, "G").hidUp, 2, "G's 2 mentors the source counts without listing (its GG is shown)");
        assert.strictEqual(at(lay, "F").hidUp, 0);
        lay = lib.wvLtLayout(graphOf(EDGES), "F", opts({ capDown: 2 }));
        assert.deepEqual(["S1", "S2", "S3"].map(k => !!at(lay, k)), [true, true, false], "two trainees a card, by year");
        assert.strictEqual(at(lay, "F").hidDown, 1, "the third one in F's +N");
        lay = lib.wvLtLayout(graphOf(EDGES), "F", opts({ capDown: 2, open: ["F", "GG"] }));
        assert.ok(at(lay, "S3"), "an opened card shows all its trainees");
        assert.strictEqual(at(lay, "GGG") && at(lay, "GGG").gen, -4, "and one generation past the depth");
        assert.strictEqual(at(lay, "GG").hidUp, 0);
    });

    it("layout: co-advisors side by side, centred over their student; a person reached twice is drawn once", function () {
        const edges = EDGES.concat([E("A", "S2", "phd", "2008")]);
        const lay = lib.wvLtLayout(graphOf(edges), "F", opts());
        const a = at(lay, "A"), c = at(lay, "C"), f = at(lay, "F"), pd = at(lay, "PD");
        assert.strictEqual(a.y, c.y, "same row");
        const row = [a, c, pd].sort((x, y) => x.x - y.x);
        assert.deepEqual(row.map(n => n.key), ["A", "C", "PD"], "PhD advisors first, the co-advisor beside, then the postdoc host");
        assert.strictEqual(c.x - a.x, W + GX, "adjacent");
        assert.closeTo((row[0].x + row[2].x) / 2, f.x, 0.01, "centred over F");
        assert.strictEqual(lay.nodes.filter(n => n.key === "A").length, 1, "A once");
        assert.ok(lay.edges.some(e => e.mentor === "A" && e.trainee === "S2"), "and its second edge drawn to that card");
        const xs = lay.nodes.filter(n => n.gen === 1).map(n => n.x).sort((p, q) => p - q);
        for (let i = 1; i < xs.length; i++) assert.isAtLeast(xs[i] - xs[i - 1], W + GX, "no two cards overlap in a row");
    });

    it("history: a new focus drops what was ahead; Back and Forward move along; the same focus twice is one step", function () {
        let h = lib.wvLtHistNew("F");
        h = lib.wvLtHistGo(h, "A");
        h = lib.wvLtHistGo(h, "A");
        h = lib.wvLtHistGo(h, "G");
        assert.deepEqual([h.list, h.at], [["F", "A", "G"], 2]);
        h = lib.wvLtHistMove(h, -1);
        h = lib.wvLtHistMove(h, -1);
        h = lib.wvLtHistMove(h, -1);
        assert.strictEqual(h.list[h.at], "F", "Back stops at the start");
        h = lib.wvLtHistMove(h, 1);
        h = lib.wvLtHistGo(h, "S1");
        assert.deepEqual([h.list, h.at], [["F", "A", "S1"], 2], "G dropped");
    });

    // The Nodus study's idea 8 (MJT 2026-11-26): each advisor's line in its own colour
    // with co-advisors, and the academic siblings.
    it("branches: with two or more mentors, each card above takes the branch of the mentor it was reached through; one mentor, none", function () {
        const lay = lib.wvLtLayout(graphOf(EDGES), "F", opts());
        const br = lib.wvLtBranches(lay, "F");
        const ofKey = (k) => br.get(k);
        assert.strictEqual(new Set([ofKey("A"), ofKey("C"), ofKey("PD")]).size, 3, "three mentors, three branches");
        assert.strictEqual(ofKey("G"), ofKey("A"), "the grand-advisor in A's branch");
        assert.strictEqual(ofKey("GG"), ofKey("A"));
        assert.isUndefined(ofKey("S1"), "nothing below the focus");
        const one = lib.wvLtLayout(graphOf([E("A", "F", "phd", "1990"), E("G", "A", "phd", "1960")]), "F", opts());
        assert.strictEqual(lib.wvLtBranches(one, "F").size, 0, "one mentor: no colours");
    });

    it("siblings: each PhD advisor's other PhD students (co-advisors too), not the postdoc host's; the focus left out", function () {
        const edges = EDGES.concat([E("A", "X1", "phd", "1992"), E("A", "X2", "postdoc", "1993"), E("C", "Y1", "phd", "1988"), E("PD", "Z1", "phd", "1996")]);
        const s = lib.wvLtSiblings(graphOf(edges), "F");
        assert.deepEqual(s.map((g) => [g.mentor, g.siblings, g.more]), [["A", ["X1"], 0], ["C", ["Y1"], 0]]);
        const many = [E("A", "F", "phd", "1990")];
        for (let i = 0; i < 15; i++) many.push(E("A", "K" + i, "phd", String(1991 + i)));
        const m = lib.wvLtSiblings(graphOf(many), "F", 12);
        assert.deepEqual([m[0].siblings.length, m[0].more], [12, 3], "at most 12, the rest counted");
    });

    it("CSV: one row per edge, quoted where needed, the source credited", function () {
        const lay = lib.wvLtLayout(graphOf([E("A", "F", "phd", "1990"), Object.assign(E("B", "F", "postdoc", "1995"), { src: "aft", thesis: "On \"flows\", mostly" })]), "F", opts());
        const csv = lib.wvLtCsv(lay, (k) => ({ name: "N " + k, inst: k === "A" ? "Lab, Inc." : "", aft: k === "B" ? "42" : "" }), "Academic Family Tree (CC BY 4.0)");
        const lines = csv.trim().split("\r\n");
        assert.strictEqual(lines.length, 3, csv);
        assert.match(lines[0], /^mentor,mentor_institution,/);
        assert.include(csv, "\"Lab, Inc.\"");
        assert.include(csv, "\"On \"\"flows\"\", mostly\"");
        assert.include(csv, "Academic Family Tree (CC BY 4.0)");
    });

    // ---- the Academic Family Tree source (pure) -------------------------------------------
    it("source: per person -- mentors, trainees, grants, the tree's institution --, the person of a library author and of an ORCID iD", function () {
        assert.isNull(lib.wvAftSource({ v: 2, people: {}, edges: [] }), "another version: none");
        assert.isNull(lib.wvAftSource(null));
        const s = lib.wvAftSource(JSON.parse(JSON.stringify(FIXTURE)));
        assert.ok(s);
        assert.deepEqual(s.counts(), { people: 12, edges: 11, units: 2, grants: 1 });
        const p = s.person("901");
        assert.deepEqual([p.last, p.first, p.inst, p.mentors, p.trainees, p.orcid], ["Ostrander", "Wilhelmina", "Imaginary Institute of Flows", 3, 3, "0000-0002-1825-0097"]);
        assert.deepEqual(s.mentors("901").map(l => [l.pid, l.type, l.year, l.inst]).sort(),
            [["902", "phd", 1990, "University of Nowhere"], ["903", "phd", 1990, "University of Nowhere"], ["904", "postdoc", 1995, "Fictional Polytechnic"]]);
        assert.strictEqual(s.mentors("901")[0].thesis, "On imaginary flows");
        assert.deepEqual(s.trainees("901").map(l => l.pid + ":" + l.type).sort(), ["906:phd", "907:phd", "910:postdoc"]);
        assert.deepEqual(s.grants("901"), [{ core: "R01XX000001", from: 2001, to: 2006, years: 6, appl: "1234567" }]);
        assert.deepEqual(s.grants("902"), []);
        assert.strictEqual(s.person("912").inst, "", "no institution");
        assert.strictEqual(s.pidOfOrcid("0000-0002-1825-0097"), "901");
        assert.strictEqual(s.pidOfUnit("Ostrander", "Wilhelmina"), "901", "a library author by full name");
        assert.strictEqual(s.pidOfUnit("OSTRANDER", "Wilhelmina M."), "901", "case and middle initials aside");
        assert.strictEqual(s.pidOfUnit("Brackenbury", "Tobias J."), "902");
        assert.isNull(s.pidOfUnit("Brackenbury", "T."), "an author written with an initial alone is never matched");
        assert.isNull(s.pidOfUnit("Brackenbury", "Theodora"), "nor another first name");
        assert.isNull(s.pidOfUnit("Ostrander", "W."));
        assert.strictEqual(s.pageUrl("901"), "https://academictree.org/fluids/peopleinfo.php?pid=901");
        assert.deepEqual([lib.wvLtRelType(0), lib.wvLtRelType(1), lib.wvLtRelType(2), lib.wvLtRelType(3), lib.wvLtRelType(5)], ["ra", "phd", "postdoc", "research", "other"]);
        assert.deepEqual(["Quéré|David", "Le Dizès|S.", "Vasquez-Thorne|Imelda", "Øster|Ann"].map(x => (lib.wvAftUnitKey(...x.split("|")) || {}).key),
            ["quere|david", "le dizes|s", "vasquez thorne|imelda", "ster|ann"], "the extract's own folding (its builder's norm)");
    });

    // ---- the tab -------------------------------------------------------------------------
    describe("in the Researchers tab", function () {
        let saved = null, hadFile = false;
        const q = (s) => doc.querySelector("[data-wv-pp-sec='tree'] " + s);
        const qa = (s) => Array.from(doc.querySelectorAll("[data-wv-pp-sec='tree'] " + s));
        const card = (pid) => q(".wv-pp-lt-card[data-aft-pid='" + pid + "']");
        const focusKey = () => { const v = q(".wv-pp-lt-view"); return v && v.getAttribute("data-wv-lt-focus"); };
        const rec = (id, last, first, lines) => { const r = lib.wvPpNewRecord(id, last, first); r.lines = lines || []; r.followed = true; return r; };

        before(async function () {
            // No People tab drawing a tree meanwhile: the first read is this suite's.
            try { wv._wvPeopleTabClose(win); } catch (e) {}
            await wv._wvPeopleLoad();
            saved = wv._wvPeopleDB.people.slice();
            try { hadFile = await IOUtils.exists(AFT_PATH()); } catch (e) {}
            if (hadFile) this.skip();   // a real extract in this profile: never overwritten (the runner's fresh profile has none)
            await IOUtils.makeDirectory(PathUtils.parent(AFT_PATH()), { createAncestors: true, ignoreExisting: true });
            await IOUtils.writeUTF8(AFT_PATH(), JSON.stringify(FIXTURE));
            wv._wvAftReset();
            const db = wv._wvPeopleDB;
            db.people.length = 0;
            // Ostrander by her ORCID iD; Lindqvist with no id at all (found by her exact name).
            db.people.push(rec("p-lt-1", "Ostrander", "Wilhelmina", [{ fact: "orcid", value: "0000-0002-1825-0097", source: "me", status: "chosen" }]),
                rec("p-lt-2", "Lindqvist", "Saoirse"));
        });

        after(async function () {
            try { wv._wvPeopleTabClose(win); } catch (e) {}
            if (saved) { const db = wv._wvPeopleDB; db.people.length = 0; db.people.push(...saved); }
            if (!hadFile) { try { await IOUtils.remove(AFT_PATH()); } catch (e) {} }
            try { wv._wvAftReset(); } catch (e) {}
        });

        it("reads the extract lazily, at the first need, once", async function () {
            assert.isNull(wv._wvAftNow(), "nothing read before a tree asks");
            const s = await wv._wvAftLoad();
            assert.ok(s, "read");
            assert.strictEqual(await wv._wvAftLoad(), s, "kept in memory");
            wv._wvAftReset();
            assert.isNull(wv._wvAftNow());
        });

        it("draws the tree: mentors up, trainees down, typed and dated edges, the attribution and the AFT page on each card that uses it", async function () {
            wv._wvPeopleTabOpen(win, { personID: "p-lt-1" });
            assert.ok(await wvT.waitFor(() => card("905") && card("906"), 10000, 50), "the cards, once the extract is read");
            const self = q(".wv-pp-lt-card[data-wv-pp-node='self']");
            assert.strictEqual(self.getAttribute("data-wv-pp-person"), "p-lt-1", "the page's person in the centre");
            const lvl = (pid) => Number(card(pid).getAttribute("data-level"));
            assert.deepEqual(["902", "903", "904", "905", "908", "906", "907", "910", "911"].map(lvl), [-1, -1, -1, -2, -3, 1, 1, 1, 2]);
            assert.isNull(card("909"), "4 up: not shown");
            assert.isNull(card("912"), "3 down: not shown");
            assert.strictEqual(card("906").getAttribute("data-wv-pp-person"), "p-lt-2", "Lindqvist: her record, by her exact name");
            assert.strictEqual(card("906").getAttribute("data-people"), "true");
            assert.strictEqual(card("907").getAttribute("data-people"), "false", "Pemberton: not in Researchers");
            const labels = qa(".wv-pp-lt-elabel").map(t => t.textContent);
            assert.ok(labels.some(t => /1995/.test(t)), "an edge dated 1995: " + labels.join(" | "));
            const aft = card("905").querySelector(".wv-pp-lt-aft");
            assert.ok(aft, "the attribution on a card from the tree");
            assert.strictEqual(aft.textContent, "Academic Family Tree (CC BY 4.0)");
            assert.strictEqual(aft.getAttribute("data-url"), "https://academictree.org/fluids/peopleinfo.php?pid=905");
            assert.match(aft.getAttribute("title"), /^https:\/\/academictree\.org\/fluids\/peopleinfo\.php\?pid=905\n/, "the link's address in its tooltip, first");
            assert.match(card("905").querySelector(".wv-pp-lt-inst").getAttribute("title") || "", /\S/, "the tree's institution says what it is");
            const more = card("908").querySelector(".wv-pp-lt-more[data-dir='up']");
            assert.ok(more, "Wexley's +N above");
            assert.strictEqual(more.textContent, "+1");
            const ash = card("905").querySelector(".wv-pp-lt-more[data-dir='up']");
            assert.strictEqual(ash && ash.textContent, "+2", "Ashgrove: the 2 mentors the extract only counts (Wexley is shown)");
            assert.isNull(card("901").querySelector(".wv-pp-lt-more"), "nothing hidden around Ostrander herself");
            // The badge never covers the card's text (MJT 2026-11-26 on peoplenet.15: the "+2" of
            // "Liepmann, Hans Wolfgang" sat over the name): outside the card's top edge.
            // FAILS on 1.3.0-peoplenet.15.
            for (const b of [more, ash]) {
                const c = b.closest(".wv-pp-lt-card");
                const r = b.getBoundingClientRect(), n = c.querySelector(".wv-pp-lt-name").getBoundingClientRect();
                const over = r.left < n.right && n.left < r.right && r.top < n.bottom && n.top < r.bottom;
                assert.isFalse(over, "the badge over the name: " + JSON.stringify([r.top, r.bottom, n.top, n.bottom]));
                assert.isAtMost(r.bottom, c.getBoundingClientRect().top + 0.5, "above the card, outside it");
            }
        });

        it("\"+N\" opens one more generation; a click re-centres; Back, Forward and Home", async function () {
            card("908").querySelector(".wv-pp-lt-more[data-dir='up']").click();
            assert.ok(await wvT.waitFor(() => card("909"), 5000, 50), "Ormsby, a fourth generation up");
            // MJT 2026-11-25: "Can I go back to the state before clicking +44?" -- the
            // opened card says Show fewer where its +N was; a click folds it back.
            // FAILS on 1.3.0-peoplenet.7: no way back.
            const fewer = card("908").querySelector(".wv-pp-lt-fewer[data-dir='up']");
            assert.ok(fewer, "Show fewer, where +1 was");
            fewer.click();
            assert.ok(await wvT.waitFor(() => !card("909"), 5000, 50), "folded back: Ormsby hidden again");
            assert.strictEqual(card("908").querySelector(".wv-pp-lt-more[data-dir='up']").textContent, "+1", "+1 again");
            card("908").querySelector(".wv-pp-lt-more[data-dir='up']").click();
            assert.ok(await wvT.waitFor(() => card("909"), 5000, 50), "and open again");
            const startFocus = focusKey();
            card("902").click();
            assert.ok(await wvT.waitFor(() => focusKey() && focusKey() !== startFocus, 5000, 50), "re-centred");
            assert.strictEqual(Number(card("902").getAttribute("data-level")), 0, "Brackenbury in the centre");
            assert.strictEqual(Number(card("905").getAttribute("data-level")), -1, "his advisor one up");
            assert.strictEqual(Number(card("901").getAttribute("data-level")), 1, "Ostrander one down");
            const tobias = focusKey();
            q("[data-wv-lt-act='back']").click();
            assert.ok(await wvT.waitFor(() => focusKey() === startFocus, 5000, 50), "Back");
            q("[data-wv-lt-act='forward']").click();
            assert.ok(await wvT.waitFor(() => focusKey() === tobias, 5000, 50), "Forward");
            q("[data-wv-lt-act='home']").click();
            assert.ok(await wvT.waitFor(() => focusKey() === startFocus, 5000, 50), "Home");
            // Enter on a card re-centres too.
            card("906").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            assert.ok(await wvT.waitFor(() => Number(card("906") && card("906").getAttribute("data-level")) === 0, 5000, 50), "Enter re-centres");
            q("[data-wv-lt-act='home']").click();
            assert.ok(await wvT.waitFor(() => focusKey() === startFocus, 5000, 50));
        });

        it("Follow on a card not in Researchers makes their record, followed; zoom changes the scale", async function () {
            const btn = card("907").querySelector(".wv-pp-lt-follow");
            assert.ok(btn, "Follow");
            btn.click();
            const made = await wvT.waitFor(() => wv._wvPeopleAllSync().find(r => r.last === "Pemberton"), 5000, 50);
            assert.ok(made, "a record");
            assert.deepEqual([made.first, made.followed, made.aft], ["Ignatius", true, "907"], "followed, tied to the tree person");
            assert.ok(await wvT.waitFor(() => card("907") && card("907").getAttribute("data-people") === "true", 5000, 50), "the card is theirs now");
            assert.ok(card("907").querySelector(".wv-pp-lt-open"), "with Open in place of Follow");
            const s0 = wv._wvLtState(win).scale;
            q("[data-wv-lt-act='zoomin']").click();
            assert.isAbove(wv._wvLtState(win).scale, s0, "zoomed in");
            assert.match(q(".wv-pp-lt-canvas").style.transform, /scale\(/);
            q("[data-wv-lt-act='zoomout']").click();
            q("[data-wv-lt-act='zoomout']").click();
            assert.isBelow(wv._wvLtState(win).scale, s0, "zoomed out");
        });

        it("exports CSV, SVG (with the attribution) and PNG", async function () {
            const dir = PathUtils.join(PathUtils.tempDir, "wv-lt-export-" + Date.now());
            await IOUtils.makeDirectory(dir, { createAncestors: true });
            try {
                const csvPath = PathUtils.join(dir, "t.csv"), svgPath = PathUtils.join(dir, "t.svg"), pngPath = PathUtils.join(dir, "t.png");
                assert.isTrue(await wv._wvLtExportTo(win, "csv", csvPath), "csv");
                const csv = await IOUtils.readUTF8(csvPath);
                assert.include(csv, "Brackenbury");
                assert.include(csv, "Academic Family Tree (CC BY 4.0)");
                assert.isTrue(await wv._wvLtExportTo(win, "svg", svgPath), "svg");
                const svg = await IOUtils.readUTF8(svgPath);
                assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
                assert.include(svg, "Academic Family Tree");
                assert.include(svg, "CC BY 4.0");
                assert.isTrue(await wv._wvLtExportTo(win, "png", pngPath), "png");
                const png = await IOUtils.read(pngPath);
                assert.deepEqual(Array.from(png.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47], "a PNG");
            }
            finally { try { await IOUtils.remove(dir, { recursive: true }); } catch (e) {} }
        });
    });
});
