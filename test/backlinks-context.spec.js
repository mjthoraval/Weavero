/* global describe, it, before, after, assert, Zotero, Services, wvT */

// Backlinks with their context (MJT 2026-10-26, part 1 of the backlinks work
// after the design report "Backlinks and related context display"; intake:
// links aimed at the paper's PDF / annotations behind a collapsed row;
// Zotero's own citations in notes and annotations quoted in notes count too,
// mixed into the list with their own icon and label; two-line excerpts with
// the full context in a hover card; plan defaults approved: groups sorted by
// title, a source with one entry as one row, "Show in Library", an empty
// section greyed like Zotero's Related, arrow keys and Enter, Add as Related
// on the link's real target). Written before the code.

describe("Weavero — Backlinks with their context", function () {
    this.timeout(90000);
    let wv, win, doc, lib, P, A, X, P2, S1, S2, S3, S4, C;
    const made = [];
    const enc = (o) => encodeURIComponent(JSON.stringify(o));
    // The main window's filter on a section's header counts (pane-scope.ts,
    // dev.113: the items list's, per window) set to `state` for `fn`, then
    // put back; `withScope` is the widen / narrow of the header button it
    // replaced: no filter, or the item's own only (Links: its notes').
    const withFilter = async (kind, state, fn) => {
        const f = wv._wvScopeFilterFor(Zotero.getMainWindow(), kind);
        const saved = JSON.stringify(f);
        Object.assign(f, { inc: [], exc: [], loop: 0 }, state);
        try { return await fn(); } finally { Object.assign(f, JSON.parse(saved)); }
    };
    const withScope = (kind, wide, fn) => withFilter(kind, wide ? {} : { inc: [kind === "links" ? "note" : "own"] }, fn);
    const note = async (title, body, parentID) => {
        const n = /** @type {any} */ (new Zotero.Item("note"));
        n.libraryID = lib;
        if (parentID) n.parentID = parentID;
        n.setNote("<h1>" + title + "</h1><p>" + body + "</p>");
        // Not selected: a selected note opens in the item pane's editor,
        // which reworks its citations and quotes and saves it again; erasing
        // such a note mid-way (the long-markup test) left the runner unable
        // to select an item or open a window in the next spec (2026-10-26,
        // bisected: window-pane-prefs' hooks timed out after this spec only).
        await n.saveTx({ skipSelect: true });
        return n;
    };
    const host = () => {
        const h = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        h.className = "wv-bl-body";
        h.style.cssText = "position:fixed;left:10px;top:10px;width:360px;";
        doc.documentElement.appendChild(h);
        made.push(h);
        return h;
    };
    const rowOf = (h, srcID) => [...h.querySelectorAll(".wv-bl-row")].find((r) => r._wvBlSrcID === srcID);
    // A section row's two lines (2026-10-29): [title, what else] of the item
    // the link is written in ("from") and of the item it lands on ("to").
    const end = (r, side) => { const e = r.querySelector(":scope > .wv-bl-" + side); return e ? [e.querySelector(".wv-bl-end-main").textContent, (e.querySelector(".wv-bl-end-chip") || { textContent: "" }).textContent] : null; };

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlEnsure", "_wvBlDirect", "_wvBlRenderBody", "_wvBlOpenMenu", "_wvBlSetHeader", "_wvBlHookRender", "_wvBlHookAsyncRender", "_wvBlIndexText", "_wvBlDropSource"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVBC paper" });
        A = await wvT.createTestPDFItem("wvbc-pdf", { parentItemID: P.id });
        X = /** @type {any} */ (new Zotero.Item("annotation"));
        X.libraryID = A.libraryID;
        X.parentID = A.id;
        X.annotationType = "highlight";
        X.annotationText = "quoted words";
        X.annotationColor = "#ff6666";
        X.annotationPageLabel = "12";
        X.annotationSortIndex = "00011|000001|00000";
        X.annotationPosition = JSON.stringify({ pageIndex: 11, rects: [[10, 10, 60, 20]] });
        await X.saveTx();
        P2 = await wvT.createItem("book", { title: "WVBC nothing links here" });
        const uriP = Zotero.URI.getItemURI(P), uriA = Zotero.URI.getItemURI(A);
        S1 = await note("B link note", "First sentence ends here. Then the link zotero://select/library/items/" + P.key + " and more words after it.");
        S2 = await note("A citing note", 'As shown <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP], locator: "7" }], properties: {} }) + '">(WVBC, 2026, p. 7)</span> in the paper.');
        S3 = await note("C quoting note", '<span class="highlight" data-annotation="' + enc({ attachmentURI: uriA, annotationKey: X.key, citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } }) + '">“quoted words”</span> made us think.');
        S4 = await note("D page link note", "See zotero://open/library/items/" + A.key + "?page=5 for the figure.");
        C = await note("own child note", 'Mine <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP] }], properties: {} }) + '">(WVBC)</span>', P.id);
        await wv._wvBlEnsure();
        await wvT.waitFor(() => wv._wvBlDirect(P).length >= 2 && wv._wvBlDirect(X).length >= 1 && wv._wvBlDirect(A).length >= 1, 10000);
    });

    after(async function () {
        for (const h of made) { try { h.remove(); } catch (e) {} }
        try { const c = doc.getElementById("wv-bl-card"); if (c) c.remove(); } catch (e) {}
        await wvT.erase(S1, S2, S3, S4, P, P2);
    });

    // A note citing its own parent is an internal link, counted as the
    // internal links typed by hand are (MJT 2026-10-30: "I want all internal
    // references to be added to the internal links" -> "(a)", counted).
    // Until dev.118 such a citation sat in an uncounted fold.
    it("Zotero's own citations and quoted annotations count, each marked; a note citing its own parent counts too, as an internal link", function () {
        const d = wv._wvBlDirect(P);
        const by = (list, id) => list.find((s) => s.srcID === id);
        assert.strictEqual(by(d, S1.id).ref, "link", "a zotero:// link");
        const cit = by(d, S2.id);
        assert.isOk(cit, "the citation counts for the cited paper");
        assert.strictEqual(cit.ref, "citation");
        assert.strictEqual(cit.locator, "7", "with its page");
        const own = by(d, C.id);
        assert.isOk(own, "a note citing its own parent: a backlink");
        assert.isTrue(!!own.internal, "an internal one");
        const q = by(wv._wvBlDirect(X), S3.id);
        assert.isOk(q, "the quoted annotation counts for the annotation");
        assert.strictEqual(q.ref, "quote");
        assert.strictEqual(by(wv._wvBlDirect(A), S4.id).page, "5", "a page link counts for the PDF");
    });

    it("the paper's section: its own rows sorted by source title; widened, those aimed at its PDF and annotation after them", async function () {
        const h = host();
        const n = wv._wvBlRenderBody(h, P, doc);
        assert.strictEqual(n, 3, "the header counts the paper's own: a citation, a link, its own note's citation");
        const outside = (el) => [...el.querySelectorAll(".wv-bl-row")].filter((r) => !r.closest(".wv-bl-more"));
        const own = outside(h);
        assert.lengthOf(own, 3, "narrow (the default): the paper's own only");
        // Each source on its own line, with only its own page: the
        // citation's page is the paper's, the other end's (MJT 2026-11-02,
        // "The page number should refer to the current line only, not the
        // other side of the link"; "p. 7" until dev.142). The item's own rows
        // alone come under "This item", the arrow up from each (MJT
        // 2026-11-03, "keep the "This item" header even when there is only
        // the parent item selected, because the links color now add another
        // information"; from 2026-10-30 to dev.171 nothing named the item and
        // no arrow pointed at it; until dev.118 the paper's title led them).
        assert.deepEqual(own.map((r) => end(r, "from")), [["A citing note", ""], ["B link note", ""], ["own child note", ""]], "sorted by source title");
        assert.deepEqual(own.map((r) => end(r, "to")), [null, null, null], "no line naming the paper: its heading does");
        assert.deepEqual([...h.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head")].map((e) => [e.querySelector(".wv-count-group-title").textContent, e.querySelector(".wv-count-group-n").textContent]), [["This item", "3"]], "under This item, its count");
        assert.isTrue(own.every((r) => r.querySelector(":scope > .wv-bl-from > .wv-bl-arrow[data-dir='up']:first-child")), "an arrow up on each row");
        assert.isOk(own[0].classList.contains("wv-bl-ref-citation"), "the citation row is marked as one");
        // What each reference is lives in the header's counts, not on the
        // rows (MJT 2026-10-30, "showing the link type icon at the end of the
        // line is too much. Put them as toggles in the header"); the internal
        // one, its own note's citation, keeps its U-turn.
        assert.isNull(h.querySelector(".wv-bl-refmark"), "no kind mark on the rows");
        // Nor the U-turn: the header's count says how many are internal and
        // filters them (MJT 2026-10-30, "Also remove the internal link icon
        // at the end of the line for now"); the row is internal all the same.
        assert.isNull(h.querySelector(".wv-bl-internal"), "no U-turn on the rows");
        assert.isTrue(!!own[2]._wvBlSrc.internal, "its own note's citation: internal");
        assert.deepEqual(wv._wvBlRefCounts(P), { link: 2, zotero: 3 }, "the header's kind counts: S1's and S4's links; S2's and C's citations, S3's quote");
        // The excerpt is the card's, not the rows' (dev.77; the count popups'
        // rows too since they draw as the section, MJT 2026-11-02): the
        // citation highlighted in it.
        assert.isNull(own[0].querySelector(".wv-bl-hit"), "the section's row carries no excerpt");
        const cit = wv._wvBlDirect(P).find((s) => s.srcID === S2.id);
        const hitText = cit.excerpt.segs.filter((s) => s.hit).map((s) => s.t).join("");
        // As the SAVED note reads it: Zotero formats a citation's text itself
        // (the runner's note came back as "(“WVBC paper”, p. 7)").
        const saved = new win.DOMParser().parseFromString(S2.getNote(), "text/html").querySelector("span.citation");
        assert.strictEqual(hitText, saved.textContent.replace(/\s+/g, " ").trim(), "as the note reads it");
        // The collapsed "N more aimed at its ..." row gave way to the
        // header's counts (pane-scope.ts, MJT 2026-10-29), the internal
        // references' fold to the internal links (2026-10-30).
        assert.isNull(h.querySelector(".wv-bl-more"), "no collapsed row");
        const hw = host();
        await withScope("backlinks", true, () => wv._wvBlRenderBody(hw, P, doc));
        // Listed with its parts' rows, each target heads its rows as the Tags
        // and Related sections head a part -- its icon, its name ("This item"
        // for the paper), its count at the right end -- each row its source's
        // line, the arrow up from it (MJT 2026-10-30, "The format for This
        // item and similar lines is not consistent" -> "Option (b)").
        const heads = [...hw.querySelectorAll(":scope > .wv-bl-hgroup > .wv-count-group-head")];
        assert.deepEqual(heads.map((e) => [e.querySelector(".wv-count-group-title").textContent, e.querySelector(".wv-count-group-n").textContent]),
            [["This item", "3"], [wv._wvCountSourceLabel(A, P), "1"], [wv._wvCountSourceLabel(X, P), "1"]], "the paper, its PDF, its annotation");
        assert.isOk(heads[0].firstElementChild, "each heading by its icon");
        assert.isNull(hw.querySelector(".wv-bl-to"), "no target line in a row: the heading names it");
        assert.isTrue(outside(hw).every((r) => r.querySelector(":scope > .wv-bl-from > .wv-bl-arrow[data-dir='up']:first-child")), "each row keeps its arrow");
        assert.deepEqual(outside(hw).map((r) => r.parentElement.querySelector(".wv-count-group-title").textContent),
            ["This item", "This item", "This item", wv._wvCountSourceLabel(A, P), wv._wvCountSourceLabel(X, P)], "each row under its target");
        const parts = outside(hw).slice(3).map((r) => end(r, "from").join(" | "));
        assert.deepEqual(parts, ["D page link note | ", "C quoting note | "], "widened: the PDF's, then its annotation's; a note's line, no page (the PDF's p. 5 until dev.142)");
        const quote = rowOf(hw, S3.id);
        assert.strictEqual(quote.parentElement.querySelector(":scope > .wv-count-group-head .wv-count-group-title").textContent, wv._wvCountSourceLabel(X, P), "under the quoted annotation's heading, as Related names a part");
        assert.isOk(quote.classList.contains("wv-bl-ref-quote"));
        // The item pane shows no highlighted text of the annotation a row is
        // aimed at (MJT 2026-10-28: "no need to show the highlighted text in
        // the item pane", after dev.87 showed it on this row). FAILED on dev.87.
        assert.isNull(quote.querySelector(".wv-bl-target-hl"), "the section's row aimed at X: no highlighted-text line");
    });

    // A child note's citations and quotes of its own paper -- Zotero's own
    // making, "Add Note from Annotations" or an annotation dragged from the
    // reader into the note -- are internal links (MJT 2026-10-30, "I want all
    // internal references to be added to the internal links so that they are
    // always displayed, and can be hidden with the internal links toggle" ->
    // "(a)", counted): in place in both sections, the U-turn on their rows,
    // shown alone or hidden by the U-turn count, counted in the titles, the
    // header counts and everything else that counts links. From dev.107 to
    // dev.118 they sat in an uncounted "internal references" fold.
    it("a note's citations and quotes of its own paper are internal links: counted, listed in place, shown or hidden by the U-turn count", async function () {
        const blBefore = wv._wvBlCount(P), lkBefore = wv._wvLkCount(P), loopsBefore = wv._wvBlLoops(P);
        const uriP = Zotero.URI.getItemURI(P), uriA = Zotero.URI.getItemURI(A);
        const cite = (it, loc) => '<span class="citation" data-citation="' + enc({ citationItems: [{ uris: [Zotero.URI.getItemURI(it)], locator: loc }], properties: {} }) + '">(cited)</span>';
        let I = null, Q = null, QN = null;
        try {
            // What dropping X into a note writes: the quote, then its
            // citation -- one reference, at X (the next test).
            I = await note("own quoting note", '<span class="highlight" data-annotation="' + enc({ attachmentURI: uriA, annotationKey: X.key, citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } }) + '">“quoted words”</span> ' + cite(P, "12"), P.id);
            Q = await wvT.createItem("book", { title: "WVBC only own" });
            QN = await note("only own note", cite(Q, "3"), Q.id);
            await wvT.waitFor(() => wv._wvLkOut(I).length === 1 && wv._wvLkOut(QN).length === 1 || null, 10000);
            const flat = (src) => wv._wvLkOut(src).map((r) => [r.entry.ref, r.target && r.target.id, !!r.entry.internal]);
            assert.deepEqual(flat(I), [["quote", X.id, true]], "one internal Link: the quote of its paper's annotation, with its citation");
            assert.deepEqual(flat(QN), [["citation", Q.id, true]], "a child note's citation of its paper: an internal Link");
            assert.isOk(wv._wvBlDirect(X).some((s) => s.srcID === I.id && s.internal), "X's backlink, internal");
            assert.strictEqual(wv._wvBlCount(P), blBefore + 1, "Backlinks: counted");
            assert.strictEqual(wv._wvLkCount(P), lkBefore + 1, "Links: counted");
            assert.strictEqual(wv._wvBlLoops(P), loopsBefore + 1, "the header's internal number too");
            assert.strictEqual(wv._wvBlCount(Q), 1, "an item cited only by its own note: 1 backlink");
            assert.strictEqual(wv._wvLkCount(Q), 1, "...and 1 link");
            const mk = (cls) => { const h = host(); h.className = cls; return h; };
            const rowsIn = (h) => [...h.querySelectorAll(".wv-bl-row")];
            // Links, the paper's section: C's citation, then I's quote, each
            // in place, each marked internal and as Zotero's.
            const hl = mk("wv-lk-body");
            assert.strictEqual(await withScope("links", true, () => wv._wvLkRenderBody(hl, P, doc)), lkBefore + 1, "listed and counted");
            assert.isNull(hl.querySelector(".wv-bl-more"), "no fold");
            assert.deepEqual(rowsIn(hl).map((r) => [r.parentElement.querySelector(".wv-count-group-title").textContent, end(r, "to"), !!r._wvLkRow.entry.internal]),
                [["own child note", ["WVBC paper", ""], true], ["own quoting note", ["“quoted words”", "p. 12"], true]],
                "each under its note's heading; the quote with its citation's page");
            // The U-turn count: only them, or none of them.
            await withFilter("links", { loop: -1 }, () => wv._wvLkRenderBody(hl, P, doc));
            assert.lengthOf(rowsIn(hl), 0, "no internal links: none");
            await withFilter("links", { loop: 1 }, () => wv._wvLkRenderBody(hl, P, doc));
            assert.lengthOf(rowsIn(hl), 2, "only internal links: both");
            // Backlinks, the paper's section widened: C's citation among its
            // own, I's quote under X; the U-turn count the same way.
            const hb = mk("wv-bl-body");
            await withScope("backlinks", true, () => wv._wvBlRenderBody(hb, P, doc));
            assert.isNull(hb.querySelector(".wv-bl-more"), "no fold");
            const bsrc = (h) => rowsIn(h).map((r) => r._wvBlSrcID);
            assert.includeMembers(bsrc(hb), [C.id, I.id]);
            await withFilter("backlinks", { loop: 1 }, () => wv._wvBlRenderBody(hb, P, doc));
            assert.sameMembers(bsrc(hb), [C.id, I.id], "only internal links: its own note's citation and quote");
            await withFilter("backlinks", { loop: -1 }, () => wv._wvBlRenderBody(hb, P, doc));
            assert.isNotOk(bsrc(hb).some((id) => id === C.id || id === I.id), "no internal links: neither");
            // The count popups list them too: they are counted.
            const hp = mk("wv-lk-body");
            wv._wvLkRenderBody(hp, P, doc, "subtree");
            assert.isOk(rowsIn(hp).some((r) => r._wvLkRow.src.id === I.id), "the Links popup lists I's");
            // An item whose only references are its note's: counted, so open.
            for (const [fn, cls] of [["_wvLkHeader", "wv-lk-body"], ["_wvBlHeader", "wv-bl-body"]]) {
                const sec = doc.createXULElement("collapsible-section");
                const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
                body.className = cls;
                sec.appendChild(body);
                doc.documentElement.appendChild(sec);
                made.push(sec);
                if (fn === "_wvLkHeader") wv._wvLkHeader(body, doc, () => {}, Q); else wv._wvBlHeader(body, doc, () => {}, Q, 0);
                assert.isFalse(sec.hasAttribute("empty"), fn + ": not empty");
            }
            // An edit that removes it drops it.
            I.setNote("<h1>own quoting note</h1><p>nothing now</p>");
            await I.saveTx({ skipSelect: true });
            await wvT.waitFor(() => wv._wvLkOut(I).length === 0 || null, 10000);
            assert.isNotOk(wv._wvBlDirect(X).some((s) => s.srcID === I.id), "gone from X's backlinks");
            assert.strictEqual(wv._wvBlCount(P), blBefore, "and from the count");
        }
        finally { await wvT.erase(I, QN, Q); }
    });

    // MJT 2026-10-30: a quote and the citation Zotero writes right after it
    // ("Add Note from Annotations", a highlight dragged into a note) are one
    // reference ("One reference"), listed under the annotation ("Under the
    // annotation"), with the citation's page. Apart -- a quote whose citation
    // was hidden, a citation alone, a citation of another paper or of
    // several, words between them -- each counts alone. Until dev.118 the
    // pair counted twice: the quote at the annotation, the citation at its
    // paper.
    it("a quote and Zotero's citation of its paper right after it are one reference, at the annotation, with the citation's page", async function () {
        const P4 = await wvT.createItem("book", { title: "WVBC other paper" });
        const uriP = Zotero.URI.getItemURI(P), uriA = Zotero.URI.getItemURI(A);
        const quote = '<span class="highlight" data-annotation="' + enc({ attachmentURI: uriA, annotationKey: X.key, citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } }) + '">“quoted words”</span>';
        const cite = (items, loc) => '<span class="citation" data-citation="' + enc({ citationItems: items.map((it) => ({ uris: [Zotero.URI.getItemURI(it)], locator: loc })), properties: {} }) + '">(cited)</span>';
        const M = {};
        try {
            M.pair = await note("M pair", quote + " " + cite([P], "12"));
            M.nbsp = await note("M pair nbsp", quote + "&nbsp;" + cite([P], "12"));
            M.other = await note("M other paper", quote + " " + cite([P4], "3"));
            M.cluster = await note("M cluster", quote + " " + cite([P, P4], "12"));
            M.words = await note("M words between", quote + " as said in " + cite([P], "12"));
            // A quote whose annotation is gone reads as aimed at its file;
            // with its citation it is still one reference, at the file (the
            // dev library, 2026-10-30: a pair in "This is a test note"
            // counted twice on dev.119's first build).
            const goneQuote = quote.replace(enc({ attachmentURI: uriA, annotationKey: X.key, citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } }),
                enc({ attachmentURI: uriA, annotationKey: "WVBCG0NE", citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } }));
            assert.notStrictEqual(goneQuote, quote, "the gone annotation's quote built");
            M.gone = await note("M gone annotation", goneQuote + " " + cite([P], "12"));
            const want = { pair: 1, nbsp: 1, other: 2, cluster: 3, words: 2, gone: 1 };
            await wvT.waitFor(() => Object.keys(want).every((k) => wv._wvLkOut(M[k]).length === want[k]) || null, 10000);
            const refs = (m) => wv._wvLkOut(m).map((r) => [r.entry.ref, r.target && r.target.id, r.entry.locator]);
            assert.deepEqual(refs(M.pair), [["quote", X.id, "12"]], "one reference, at the annotation, with the citation's page");
            assert.deepEqual(refs(M.nbsp), [["quote", X.id, "12"]], "a no-break space between: the same");
            assert.deepEqual(refs(M.other), [["quote", X.id, null], ["citation", P4.id, "3"]], "a citation of another paper: two");
            assert.deepEqual(refs(M.cluster), [["quote", X.id, null], ["citation", P.id, "12"], ["citation", P4.id, "12"]], "a citation of several papers: apart");
            assert.deepEqual(refs(M.words), [["quote", X.id, null], ["citation", P.id, "12"]], "words between: apart");
            assert.deepEqual(refs(M.gone), [["quote", A.id, "12"]], "its annotation gone: one reference, at the file");
            assert.isNotOk(wv._wvBlDirect(P).some((s) => s.srcID === M.pair.id || s.srcID === M.nbsp.id), "the paper gets no row of its own from a pair");
            assert.isFalse(!!wv._wvLkOut(M.pair)[0].entry.internal, "a standalone note quoting a paper: not internal");
            // Its place in the note spans both: what the card's context and
            // "Show in Source" are cut from.
            const e = wv._wvLkOut(M.pair)[0].entry;
            const span = M.pair.getNote().slice(e.at, e.at + e.len);
            assert.match(span, /^<span class="highlight"[\s\S]*class="citation"[\s\S]*<\/span>$/, "the quote and its citation: " + span.slice(0, 40) + " ... " + span.slice(-40));
            // X's section (an annotation: nothing below it): the pair's row
            // names the note, by Zotero's mark -- not the citation's page, the
            // other end's (MJT 2026-11-02; "p. 12" until dev.142).
            const h = host();
            wv._wvBlRenderBody(h, X, doc);
            const row = rowOf(h, M.pair.id);
            assert.deepEqual(end(row, "from"), ["M pair", ""]);
            assert.isOk(row.classList.contains("wv-bl-ref-quote"), "read as the quote");
        }
        finally {
            const ids = Object.values(M).map((m) => m.id);
            await wvT.erase(...Object.values(M), P4);
            await wvT.waitFor(() => !wv._wvBlDirect(X).some((s) => ids.indexOf(s.srcID) >= 0) || null, 10000);
        }
    });

    // A LINK whose two ends sit in one item -- typed, or copied into a note
    // with a dragged annotation's comment -- is an internal link (MJT
    // 2026-10-29, "I would like to count as internal links all the links
    // within a parent item" -> "I prefer counting all the internal links in
    // the links count. Try option 2 and also option 4 with an icon"):
    // counted as any link, its own paper and file included (until dev.108 a
    // link to the source's ancestors was dropped), its rows marked by the
    // U-turn glyph, the headers saying how many of their count it makes. A
    // link to the source itself counts too (dev.110; MJT 2026-10-29, "if it
    // is in the library, there is no reason to exclude it"), a standalone
    // note's included. FAILED on dev.108 (and its self links on dev.109).
    it("a link inside its own item, to itself included, is counted, flagged internal and marked in the rows and the header", async function () {
        const lib0 = lib;
        let Q2 = null, AQ = null, OTHER = null, AX = null, AY = null, QN = null, SN = null;
        // A key of our own before the save (links.spec.js setKey: Zotero.Item
        // has no key setter; a keyed object loads its primary data first).
        const setKey = async (it, k) => { try { it.key = k; } catch (e) {} if (it.key !== k) it._set("key", k); await it.loadPrimaryData(); };
        const ann = async (att, i, comment, key) => {
            const a = /** @type {any} */ (new Zotero.Item("annotation"));
            a.libraryID = att.libraryID;
            if (key) await setKey(a, key);
            a.parentID = att.id;
            a.annotationType = "highlight";
            a.annotationText = "loop words " + i;
            a.annotationColor = "#ffd400";
            a.annotationPageLabel = String(i);
            a.annotationSortIndex = "0000" + i + "|000001|00000";
            a.annotationPosition = JSON.stringify({ pageIndex: i - 1, rects: [[10, 10, 60, 20]] });
            a.annotationComment = comment;
            await a.saveTx();
            return a;
        };
        try {
            Q2 = await wvT.createItem("journalArticle", { title: "WVBC loop paper" });
            AQ = await wvT.createTestPDFItem("wvbc-loop-pdf", { parentItemID: Q2.id });
            OTHER = await wvT.createItem("book", { title: "WVBC loop elsewhere" });
            const kx = Zotero.Utilities.generateObjectKey();
            // AX: a page jump to its own PDF (an ancestor), then a link to itself.
            AX = await ann(AQ, 1, "jump zotero://open-pdf/library/items/" + AQ.key + "?page=2 me zotero://open-pdf/library/items/" + AQ.key + "?page=1&annotation=" + kx, kx);
            // AY: a link to its sibling annotation.
            AY = await ann(AQ, 2, "see zotero://open-pdf/library/items/" + AQ.key + "?annotation=" + AX.key);
            // QN: a child note linking its paper, itself, then another paper.
            QN = /** @type {any} */ (new Zotero.Item("note"));
            QN.libraryID = lib0;
            await setKey(QN, Zotero.Utilities.generateObjectKey());
            QN.parentID = Q2.id;
            QN.setNote("<h1>loop note</h1><p>Up zotero://select/library/items/" + Q2.key + " me zotero://select/library/items/" + QN.key + " out zotero://select/library/items/" + OTHER.key + " end.</p>");
            await QN.saveTx({ skipSelect: true });
            // SN: a standalone note linking itself (its own item).
            SN = /** @type {any} */ (new Zotero.Item("note"));
            SN.libraryID = lib0;
            await setKey(SN, Zotero.Utilities.generateObjectKey());
            SN.setNote("<h1>loop standalone</h1><p>Here zotero://select/library/items/" + SN.key + " end.</p>");
            await SN.saveTx({ skipSelect: true });
            await wvT.waitFor(() => wv._wvLkOut(AX).length === 2 && wv._wvLkOut(AY).length === 1 && wv._wvLkOut(QN).length === 3 && wv._wvLkOut(SN).length === 1 || null, 10000);
            const flat = (src) => wv._wvLkOut(src).map((r) => [r.target && r.target.id, !!r.entry.internal]);
            assert.deepEqual(flat(AX), [[AQ.id, true], [AX.id, true]], "its own PDF and itself: internal links");
            assert.deepEqual(flat(AY), [[AX.id, true]], "its sibling annotation: internal");
            assert.deepEqual(flat(QN), [[Q2.id, true], [QN.id, true], [OTHER.id, false]], "its own paper and itself: internal; another paper: a plain link");
            assert.deepEqual(flat(SN), [[SN.id, true]], "a standalone note's link to itself: internal");
            // Counted as any link, in Links and in Backlinks.
            assert.strictEqual(wv._wvLkCount(Q2), 6, "Links: all six");
            assert.strictEqual(wv._wvBlCount(Q2), 5, "Backlinks: the paper's, its PDF's, its annotation's two and its note's");
            assert.deepEqual(wv._wvBlDirect(Q2).map((s) => [s.srcID, !!s.internal]), [[QN.id, true]], "its child note's link to it is a backlink now");
            assert.deepEqual(wv._wvBlDirect(QN).map((s) => [s.srcID, !!s.internal]), [[QN.id, true]], "a note linking itself is its own backlink");
            assert.isNotOk(wv._wvBlDirect(OTHER).find((s) => s.srcID === QN.id).internal, "a link out of the item is not internal");
            assert.strictEqual(wv._wvLkSectionCounts(Q2).loops, 5, "the Links header's internal number");
            assert.strictEqual(wv._wvBlLoops(Q2), 5, "the Backlinks header's");
            const mk = (cls) => { const h = host(); h.className = cls; return h; };
            // Links, widened: six rows in place, five internal, the link out
            // not. The item pane's rows carry no U-turn any more -- the
            // header's count says how many and filters them (MJT 2026-10-30,
            // "Also remove the internal link icon at the end of the line for
            // now"); from dev.109 to dev.126 it ended each internal row.
            const hl = mk("wv-lk-body");
            assert.strictEqual(await withScope("links", true, () => wv._wvLkRenderBody(hl, Q2, doc)), 6, "all six listed and counted");
            const lrows = [...hl.querySelectorAll(".wv-bl-row")];
            assert.isNull(hl.querySelector(".wv-bl-more"), "no fold: internal links are in place");
            assert.deepEqual(lrows.map((r) => !!r._wvLkRow.entry.internal), lrows.map((r) => r._wvLkRow.target.id !== OTHER.id), "internal, the outside link not");
            assert.isNull(hl.querySelector(".wv-bl-internal"), "no U-turn on the item pane's rows");
            // Backlinks, widened: five rows, all internal, none marked.
            const hb = mk("wv-bl-body");
            await withScope("backlinks", true, () => wv._wvBlRenderBody(hb, Q2, doc));
            const brows = [...hb.querySelectorAll(".wv-bl-row")];
            assert.strictEqual(brows.length, 5);
            assert.isTrue(brows.every((r) => !!r._wvBlSrc.internal), "all five internal");
            assert.isNull(hb.querySelector(".wv-bl-internal"), "no U-turn on the item pane's rows");
            // The count popups draw as the section (MJT 2026-11-02, "Keep the
            // same format as in the item pane"): the same five, unmarked (a
            // U-turn after their chip until dev.147).
            const hp = mk("wv-lk-body");
            wv._wvLkRenderBody(hp, Q2, doc, "subtree");
            const prows = [...hp.querySelectorAll(".wv-bl-row")];
            assert.strictEqual(prows.filter((r) => r._wvLkRow.target && r._wvLkRow.entry.internal).length, 5, "the popup lists the same five");
            assert.isNull(hp.querySelector(".wv-bl-internal"), "...unmarked, as the section's");
            // The U-turn count filters as the items list's funnel does (MJT
            // 2026-10-30, "just the same filtering as in the items list"):
            // only the internal links (with the levels' filter as well), or
            // none of them -- the window's filter, as the levels'.
            const L = mk("wv-lk-body");
            const lt = () => [...L.querySelectorAll(".wv-bl-row")].map((r) => r._wvLkRow.target.id);
            await withFilter("links", { loop: 1 }, () => wv._wvLkRenderBody(L, Q2, doc));
            assert.sameMembers(lt(), [Q2.id, QN.id, AQ.id, AX.id, AX.id], "only internal: the five");
            await withFilter("links", { loop: 1, inc: ["note"] }, () => wv._wvLkRenderBody(L, Q2, doc));
            assert.sameMembers(lt(), [Q2.id, QN.id], "only internal and only its notes': the note's two");
            await withFilter("links", { loop: -1 }, () => wv._wvLkRenderBody(L, Q2, doc));
            assert.deepEqual(lt(), [OTHER.id], "no internal links: the link out alone");
            const B = mk("wv-bl-body");
            await withFilter("backlinks", { loop: -1 }, () => wv._wvBlRenderBody(B, Q2, doc));
            assert.strictEqual(B.querySelectorAll(".wv-bl-row").length, 0, "Backlinks, no internal links: none of the five");
            await withFilter("backlinks", { loop: 1, inc: ["own"] }, () => wv._wvBlRenderBody(B, Q2, doc));
            assert.deepEqual([...B.querySelectorAll(".wv-bl-row")].map((r) => r._wvBlTarget.id), [Q2.id], "only internal and only its own: the note's link to it");
            await withFilter("backlinks", { loop: 1 }, () => wv._wvBlRenderBody(B, Q2, doc));
            assert.strictEqual(B.querySelectorAll(".wv-bl-row").length, 5, "only internal: all five, its parts' too");
            assert.isNull(B.querySelector(".wv-bl-more"), "no fold while only internal links show");
            // The header: the internal number last beside the title, by the glyph.
            const head = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            const title = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
            head.appendChild(title);
            doc.documentElement.appendChild(head);
            made.push(head);
            wv._wvScopeSetCounts(title, { att: 0, note: 0, ann: 1 }, "In", { n: 3, of: 4, what: "links" });
            const cs = [...head.querySelectorAll(".wv-scope-count")];
            assert.deepEqual(cs.map((c) => [c.dataset.kind, c.querySelector(".wv-scope-count-n").textContent]), [["ann", "1"], ["internal", "3"]]);
            assert.strictEqual(cs[1].title, "Internal links: 3 of 4 (both ends in the same item)");
            assert.isOk(cs[1].querySelector("svg.wv-scope-count-icon path[d='" + wvT.lib().WV_LOOPLINK_ARROW_PATH + "']"), "the same glyph");
            wv._wvScopeSetCounts(title, null, "In", { n: 2, of: 3, what: "backlinks" });
            assert.deepEqual([...head.querySelectorAll(".wv-scope-count")].map((c) => c.dataset.kind), ["internal"], "alone when no level count");
            wv._wvScopeSetCounts(title, null, "In", null);
            assert.isNull(head.querySelector(".wv-scope-counts"), "and gone with nothing to say");
        }
        finally { await wvT.erase(SN, QN, AY, AX, Q2, OTHER); }
    });

    it("an item nothing links reads 0 and its section is greyed, like Zotero's Related", async function () {
        const h = host();
        assert.strictEqual(wv._wvBlRenderBody(h, P2, doc), 0);
        assert.isNull(h.querySelector(".wv-bl-more"), "nothing aimed at children either");
        const sec = doc.createXULElement("collapsible-section");
        const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        sec.appendChild(body);
        doc.documentElement.appendChild(sec);
        made.push(sec);
        wv._wvBlSetHeader(body, doc, () => {}, 0, 0);
        assert.isTrue(sec.hasAttribute("empty"), "empty: greyed and closed");
        wv._wvBlSetHeader(body, doc, () => {}, 0, 2);
        assert.isFalse(sec.hasAttribute("empty"), "links aimed at its children: not empty");
        // The header names the count aimed at its children (MJT 2026-10-27,
        // "Why 0 Backlinks when 2 are shown below?"). FAILED on dev.72.
        const args = [];
        wv._wvBlHookRender({ body, item: P, doc, setL10nArgs: (a) => args.push(a) });
        // The header's text counts the whole paper's (MJT 2026-10-30, "Show
        // the total number instead in the title"); beside it, the paper's
        // own and its parts', each level by its icon and counted apart
        // (pane-scope.ts _wvScopeSetCounts; MJT 2026-10-29, "I would
        // separate the children and the annotations levels" / "I would like
        // to use icons to make it more compact"): its PDF (S4's page link),
        // no note, its annotation (X: S3's quote).
        assert.deepEqual(JSON.parse(args[0]), { count: wv._wvBlCount(P) }, "the whole paper's");
        assert.strictEqual(wv._wvBlCount(P), wv._wvBlDirect(P).length + 2, "its own and its parts'");
        assert.deepEqual(wv._wvBlLevelCounts(P), { att: 1, note: 0, ann: 1 }, "the levels below it");
        assert.strictEqual(1 + 1, wv._wvBlChildCount(P), "together, what is aimed below the paper");
        const label = async (a) => { const [m] = await doc.l10n.formatMessages([{ id: "weavero-backlinks-header", args: a }]); return m.attributes.find((x) => x.name === "label").value; };
        assert.strictEqual(await label({ count: 0 }), "0 Backlinks");
        assert.strictEqual(await label({ count: 2 }), "2 Backlinks");
    });

    it("an excerpt starts at the clause before the link; the hover card, also on keyboard focus, holds the whole paragraph; Esc closes it", async function () {
        const h = host();
        wv._wvBlRenderBody(h, P, doc, "own");
        const row = rowOf(h, S1.id);
        // The excerpt the index keeps for it (rows carry none: the section's
        // since dev.77, the count popups' since they draw as it, 2026-11-02).
        const ex = wv._wvBlDirect(P).find((s) => s.srcID === S1.id).excerpt.segs.map((s) => s.t).join("");
        assert.match(ex, /^Then the link/, "the clause, not the sentence before it: " + ex);
        // An inactive window gets no focus events, and the runner's is never
        // raised: activate it first (collections-pane-toggle.spec.js; the
        // Links twin of this test failed on it in a solo run, 2026-10-27).
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) { win.focus(); await new Promise((r) => win.setTimeout(r, 100)); }
        row.focus();
        const card = await wvT.waitFor(() => { const c = doc.getElementById("wv-bl-card"); return c && !c.hidden ? c : null; }, 3000);
        assert.isOk(card, "the card opens on focus");
        // MJT 2026-10-27, "full context of the source and the target": two
        // columns, the source's lineage and reference left, the target's
        // lineage right (links.spec.js has the Links twin). FAILED on dev.65.
        const texts = (side) => [...doc.getElementById("wv-bl-card").querySelectorAll('[data-side="' + side + '"] .wv-bl-card-node-main')].map((e) => e.textContent);
        // The reference block spans the card under both lineages (MJT
        // 2026-10-28: "the link can use the full width, as it is clear from
        // the arrow where it lives and where it points to" / "So that the
        // preview can display more context"). FAILED on dev.83.
        const refOf = () => doc.getElementById("wv-bl-card").querySelector(":scope > .wv-bl-card-ref");
        assert.isOk(refOf(), "the reference block is the card's own, under the columns");
        assert.isNull(card.querySelector("[data-side] .wv-bl-card-ref"), "in neither column");
        assert.isAtLeast(refOf().getBoundingClientRect().width, card.querySelector(".wv-bl-card-cols").getBoundingClientRect().width - 1, "as wide as both columns");
        assert.deepEqual(texts("source"), ["B link note"], "a standalone note is its own lineage");
        // The reference's kind by the header toggle's icon, and what it does
        // (MJT 2026-11-02, "Can you show that information in the hover
        // card?" -> "Icon, kind and action"; "Link" alone until dev.143).
        const lab = refOf().querySelector(":scope > .wv-bl-card-ref-label");
        assert.strictEqual(lab.textContent, "Zotero link — Show in library", "the reference's kind and what it does");
        // Its icon on the arrow, as the Related card's (MJT 2026-11-02, "Move
        // the link type icon to the arrow, same as for related"; in the label
        // in dev.144).
        const markPaths = (c) => { const g = c.querySelector("svg.wv-bl-card-arrow .wv-bl-card-ref-mark"); return g ? [...g.querySelectorAll("path")].map((p) => p.getAttribute("d")) : []; };
        assert.include(markPaths(card), Zotero.Weavero.lib.WV_ZLINK_KIND_PATH, "the Zotero links' icon on the arrow");
        // ...and in front of the label too (MJT 2026-11-02, "Actually, also
        // keep the link type icon in front of the Zotero Link header in the
        // hover popup"; on the arrow only in dev.145). FAILED on dev.145.
        assert.deepEqual([...lab.querySelectorAll("svg.wv-bl-card-ref-icon > path")].map((p) => p.getAttribute("d")), [Zotero.Weavero.lib.WV_ZLINK_KIND_PATH], "and before the label");
        assert.include(refOf().textContent, "First sentence ends here.", "the whole paragraph");
        assert.isOk(refOf().querySelector(".wv-bl-hit"), "the link highlighted");
        assert.deepEqual(texts("target"), ["WVBC paper"], "the target: the paper itself");
        // A backlink reads right to left: the target first, the source after
        // it, the arrow back (MJT 2026-10-27, "When it is a backlink, the
        // target should be on the left"). FAILED on dev.67.
        const cols = card.querySelector(".wv-bl-card-cols");
        assert.deepEqual([...cols.children].map((e) => e.dataset.side), ["target", "source"], "target left, source right");
        const svg = card.querySelector("svg.wv-bl-card-arrow");
        assert.isOk(svg, "the arrow, drawn");
        // Line out of the source, an S inside the gap, line along the target
        // (the routing of dev.71: never over the other column's text).
        const pm = svg.querySelector("path").getAttribute("d").match(/^M([\d.-]+),([\d.-]+) L([\d.-]+),[\d.-]+ C[\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+)$/);
        assert.isOk(pm, "line, S, line");
        assert.isBelow(+pm[6], +pm[1], "from the source on the right back to the target on the left");
        const C = card.getBoundingClientRect();
        const colS = card.querySelector('[data-side="source"]').getBoundingClientRect(), colT = card.querySelector('[data-side="target"]').getBoundingClientRect();
        assert.isAtMost(+pm[3], colS.left - C.left + 0.5, "the S starts before the source column");
        assert.isAtLeast(+pm[4], colT.right - C.left - 0.5, "...and ends past the target column");
        const leafS = [...card.querySelectorAll('[data-side="source"] .wv-bl-card-node')].pop().getBoundingClientRect();
        const leafT = [...card.querySelectorAll('[data-side="target"] .wv-bl-card-node')].pop().getBoundingClientRect();
        assert.isAtMost(Math.abs((+pm[2]) - (leafS.top - C.top + leafS.height / 2)), leafS.height, "starts level with the source's leaf");
        assert.isAtMost(Math.abs((+pm[7]) - (leafT.top - C.top + leafT.height / 2)), leafT.height, "ends level with the target's leaf");
        row.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        assert.isTrue(doc.getElementById("wv-bl-card").hidden, "Esc closes it");
        // A quote aimed at the annotation: the target column climbs paper › file › annotation.
        const h2 = host();
        wv._wvBlRenderBody(h2, P, doc, "subtree");
        const qrow = rowOf(h2, S3.id);
        assert.isOk(qrow, "the quoting note's row (subtree scope)");
        qrow.focus();
        await wvT.waitFor(() => !doc.getElementById("wv-bl-card").hidden, 3000);
        assert.deepEqual(texts("target"), ["WVBC paper", A.getDisplayTitle(), "Page 12"]);
        assert.include(doc.getElementById("wv-bl-card").querySelector('[data-side="target"]').textContent, "quoted words");
        assert.deepEqual(texts("source"), ["C quoting note"]);
        const qlab = refOf().querySelector(":scope > .wv-bl-card-ref-label");
        assert.strictEqual(qlab.textContent, "Note citation — annotation p. 12", "an annotation added to the note (\"Quoted annotation p. 12\" until dev.143)");
        assert.include(markPaths(doc.getElementById("wv-bl-card")), Zotero.Weavero.lib.WV_CITE_KIND_PATH, "the Note citations' icon on the arrow");
        qrow.blur();
    });

    // MJT 2026-11-02, "I understand that there are different types of links.
    // Can you list them? Can you show that information in the hover card?"
    // -> "Icon, kind and action", the two kinds named with Zotero's words
    // ("Zotero links", its "Include Zotero Links" export option; "Note
    // citations": the citations and annotations its note editor writes) and
    // drawn as the header's toggles. Each of the seven forms says what it
    // does. FAILED on dev.143.
    it("each reference's kind and action, for the card's label: Zotero links by what they open, note citations by their page", function () {
        const K = (src, target) => { const k = wv._wvBlRefKind(src, target || null); return [k.mark, k.kind, k.action]; };
        const L = (url) => ({ ref: "link", url });
        const key = "ABCD2345";
        assert.deepEqual(K(L("zotero://select/library/items/" + key)), ["zotero", "Zotero link", "Show in library"]);
        assert.deepEqual(K(L("zotero://select/library/items?itemKey=" + key + ",WXYZ2345")), ["zotero", "Zotero link", "Show in library"], "several items");
        assert.deepEqual(K(L("zotero://open/library/items/" + key)), ["zotero", "Zotero link", "Open"]);
        assert.deepEqual(K(L("zotero://open/library/items/" + key + "?page=5")), ["zotero", "Zotero link", "Open at page 5"]);
        assert.deepEqual(K(L("zotero://open-pdf/library/items/" + key + "?page=2&amp;annotation=WXYZ2345")), ["zotero", "Zotero link", "Open at annotation"], "an annotation's link, as written in a note");
        assert.deepEqual(K(L("zotero://open-pdf/1_" + key + "/7")), ["zotero", "Zotero link", "Open at page 7"], "the ZotFile form");
        assert.deepEqual(K(L("zotero://note/u/" + key + "/?line=3")), ["zotero", "Zotero link", "Open note at line 3 (Better Notes)"]);
        assert.deepEqual(K(L("zotero://note/u/" + key + "/?section=Methods%20A")), ["zotero", "Zotero link", "Open note at section Methods A (Better Notes)"]);
        assert.deepEqual(K(L("zotero://note/u/" + key + "/")), ["zotero", "Zotero link", "Open note (Better Notes)"]);
        assert.deepEqual(K({ ref: "citation", url: "", locator: "7" }), ["cite", "Note citation", "p. 7"]);
        assert.deepEqual(K({ ref: "citation", url: "", locator: null }), ["cite", "Note citation", ""], "no page: the kind alone");
        assert.deepEqual(K({ ref: "quote", url: "annotation:" + X.key, locator: "12" }, X), ["cite", "Note citation", "annotation p. 12"], "an annotation added to a note, cited at its own page");
        assert.deepEqual(K({ ref: "quote", url: "annotation:" + X.key, locator: "3" }, X), ["cite", "Note citation", "annotation p. 12, cited p. 3"], "...cited at another");
        assert.deepEqual(K({ ref: "quote", url: "annotation:GONE2345", locator: "12" }, A), ["cite", "Note citation", "annotation, p. 12"], "its annotation gone: aimed at the file");
        // The popups' rows say the same kinds ("Link", "Citation p. 7",
        // "Quoted annotation p. 12" until dev.143).
        assert.strictEqual(wv._wvBlRowLabel({ ref: "link", url: "zotero://select/library/items/" + key }, P), "Zotero link");
        assert.strictEqual(wv._wvBlRowLabel({ ref: "citation", url: "", locator: "7" }, P), "Note citation p. 7");
        assert.strictEqual(wv._wvBlRowLabel({ ref: "quote", url: "annotation:" + X.key, locator: "12" }, X), "Note citation, annotation p. 12");
    });

    // MJT 2026-11-02, "Can you also display the Note Citations color same as
    // in the note?" -> "All, like the note": the card's text draws the colours
    // the note gives its text -- a highlight's background, an underline and
    // its colour, as Zotero's note editor writes them (its backgroundColor
    // and underline marks, note-editor schema/marks.js; what "Show Annotation
    // Colors" adds) -- every annotation in it, the citation after one plain
    // as in the note; the reference the card is about, annotation and
    // citation, outlined instead of the grey fill. And its kind's icon on
    // the arrow, in the gap between the columns ("Move the link type icon
    // to the arrow, same as for related"). FAILED on dev.144.
    it("the card's text shows the note's colours, the reference outlined; the reference's kind icon sits on the arrow", async function () {
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) { win.focus(); await new Promise((r) => win.setTimeout(r, 100)); }
        const uriP = Zotero.URI.getItemURI(P), uriA = Zotero.URI.getItemURI(A);
        const RED = "rgba(255, 102, 102, 0.5)", GREEN = "rgba(95, 178, 54, 0.5)", BLUE = "rgb(46, 168, 229)";
        const quote = (key, color, text) => '<span class="highlight" data-annotation="' + enc({ attachmentURI: uriA, annotationKey: key, citationItem: { uris: [uriP], locator: "12" }, position: { pageIndex: 11, rects: [[10, 10, 60, 20]] } })
            + '"><span style="background-color: ' + color + '">“' + text + "”</span></span>";
        const cite = '<span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP], locator: "12" }], properties: {} }) + '">(<span class="citation-item">WVBC, p. 12</span>)</span>';
        const M = await note("M colours", "Before " + quote("WVBCOTH1", GREEN, "other words") + " then " + quote(X.key, RED, "quoted words") + " " + cite
            + ' and <u style="text-decoration-color: #2ea8e5">underlined words</u> after.');
        try {
            await wvT.waitFor(() => wv._wvBlDirect(X).some((s) => s.srcID === M.id) || null, 10000);
            const h = host();
            wv._wvBlRenderBody(h, X, doc);
            const row = rowOf(h, M.id);
            assert.isOk(row, "M's row under X");
            row.focus();
            const c = await wvT.waitFor(() => { const x = doc.getElementById("wv-bl-card"); return x && !x.hidden ? x : null; }, 3000);
            const txt = c.querySelector(".wv-bl-card-ref .wv-bl-card-text");
            const box = txt.querySelector(".wv-bl-hit");
            assert.strictEqual(box.textContent, "“quoted words” (WVBC, p. 12)", "the reference: the annotation and its citation");
            assert.isTrue(box.classList.contains("wv-bl-hit-cite"), "a note citation's");
            const bs = win.getComputedStyle(box);
            assert.notStrictEqual(bs.borderTopStyle, "none", "outlined");
            assert.strictEqual(bs.backgroundColor, "rgba(0, 0, 0, 0)", "no grey fill");
            const marks = [...txt.querySelectorAll(".wv-bl-note-mark")];
            const bgOf = (t) => { const el = marks.find((e) => e.textContent.includes(t)); return el && win.getComputedStyle(el).backgroundColor; };
            assert.strictEqual(bgOf("quoted words"), RED, "the annotation in its note colour");
            assert.strictEqual(bgOf("other words"), GREEN, "another annotation of the text too");
            assert.isOk([...box.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes("(WVBC, p. 12)")), "its citation plain, as in the note");
            const ul = marks.find((e) => e.textContent.includes("underlined words"));
            assert.isOk(ul, "the underline");
            assert.include(win.getComputedStyle(ul).textDecorationLine, "underline");
            assert.strictEqual(win.getComputedStyle(ul).textDecorationColor, BLUE, "in its colour");
            // The kind's icon on the arrow, between the columns (a backlink's
            // card: the target left, the source right); none in the label.
            const g = c.querySelector("svg.wv-bl-card-arrow .wv-bl-card-ref-mark");
            assert.isOk(g, "the kind's icon on the arrow");
            assert.isOk([...g.querySelectorAll("path")].some((p) => p.getAttribute("d") === Zotero.Weavero.lib.WV_CITE_KIND_PATH), "a note citation's");
            assert.deepEqual([...c.querySelectorAll(".wv-bl-card-ref-label > svg.wv-bl-card-ref-icon > path")].map((p) => p.getAttribute("d")), [Zotero.Weavero.lib.WV_CITE_KIND_PATH], "and before the label (dev.146)");
            const C = c.getBoundingClientRect(), cS = c.querySelector('[data-side="source"]').getBoundingClientRect(), cT = c.querySelector('[data-side="target"]').getBoundingClientRect();
            const ib = g.getBBox(), ix = ib.x + ib.width / 2;
            assert.isAbove(ix, cT.right - C.left, "past the target's column");
            assert.isBelow(ix, cS.left - C.left, "...short of the source's");
            row.blur();
        }
        finally { await wvT.erase(M); }
    });

    // MJT 2026-10-28, "So that the preview can display more context": with
    // the reference across the card, its excerpt reaches further back -- 600
    // characters before the link instead of 400, so a 560-character
    // paragraph shows whole and the link stays within the card's 12 lines.
    // FAILED on dev.84 (cut at 400: "… filler text ...").
    it("the card's excerpt holds up to 600 characters before the reference", async function () {
        const body = "Opening words of a long paragraph. " + "filler text keeps going here ".repeat(18);
        assert.isAbove(body.length, 500, "more than the old 400 before the link");
        const S7 = await note("E long context note", body + "zotero://select/library/items/" + P2.key + " end.");
        const s7id = S7.id;
        try {
            const src = await wvT.waitFor(() => wv._wvBlDirect(P2).find((s) => s.srcID === s7id), 10000);
            assert.isOk(src, "indexed");
            const txt = wv._wvBlWideSegs(S7, src).map((s) => s.t).join("");
            assert.include(txt, "Opening words of a long paragraph.", "the paragraph's start is there");
            assert.notMatch(txt, /^…/, "nothing cut before it: " + txt.slice(0, 50));
        }
        finally {
            await S7.eraseTx();
            // P2 is the item nothing links (the greyed-section test).
            await wvT.waitFor(() => !wv._wvBlDirect(P2).some((s) => s.srcID === s7id) || null, 10000);
        }
    });

    // MJT 2026-10-26 (dev.52 screenshot, "This went out of screen"): a
    // single row's title, one line, set the item pane's minimum width -- a
    // 109-character title held the pane and its empty-selection message at
    // 721 px in a 320-px pane.
    it("a long source title never widens the item pane: one line, cut", async function () {
        const T = await wvT.createItem("book", { title: "WVBC width" });
        const S6 = await note("F " + "very long title words ".repeat(20), "See zotero://select/library/items/" + T.key + " here.");
        try {
            await wvT.waitFor(() => wv._wvBlDirect(T).some((s) => s.srcID === S6.id), 10000);
            const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            box.style.cssText = "position:fixed;left:0;top:0;width:min-content;";
            const h = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
            h.className = "wv-bl-body";
            box.appendChild(h);
            doc.documentElement.appendChild(box);
            made.push(box);
            wv._wvBlEnsureStyle(doc);
            wv._wvBlRenderBody(h, T, doc);
            assert.isOk(h.querySelector(".wv-bl-from .wv-bl-end-main"), "the source's title, on its row's first line");
            assert.isBelow(box.getBoundingClientRect().width, 250, "the title does not set the width");
        }
        finally { await wvT.erase(S6, T); }
    });

    // dev.52 on the dev instance: after a reload, a background reader tab's
    // section had no item yet, the index refresh rendered it anyway, and the
    // paper (5 backlinks) read "0 Backlinks", greyed.
    it("a render with no item leaves the section's count and greying alone", async function () {
        const sec = doc.createXULElement("collapsible-section");
        const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        sec.appendChild(body);
        doc.documentElement.appendChild(sec);
        made.push(sec);
        const args = [];
        const setL10nArgs = (a) => args.push(a);
        wv._wvBlHookRender({ body, item: null, doc, setL10nArgs });
        await wv._wvBlHookAsyncRender({ body, item: null, doc, setL10nArgs });
        assert.isFalse(sec.hasAttribute("empty"), "not greyed");
        assert.deepEqual(args, [], "the count untouched");
        wv._wvBlHookRender({ body, item: P, doc, setL10nArgs });
        assert.deepEqual(args, [JSON.stringify({ count: wv._wvBlCount(P) })], "with its item, the whole item's count (MJT 2026-10-30)");
    });

    // dev.51 on the dev library: "2013, p. 1)" read as a sentence end, and
    // an excerpt started at "1)". Indexed in memory only, then dropped.
    it("a page abbreviation is no sentence end: the excerpt keeps the citation before the link", function () {
        try {
            wv._wvBlIndexText(-901, lib, null, "standaloneNote", "<p>Words. Per (Smith, p. 1) the link zotero://select/library/items/" + P.key + " ends here.</p>");
            const e = wv._wvBlDirect(P).find((s) => s.srcID === -901);
            const t = e.excerpt.segs.map((s) => s.t).join("");
            assert.match(t, /^Per \(Smith, p\. 1\) the link/, t);
        }
        finally { wv._wvBlDropSource(-901); }
    });

    // The collapsed row's keys (Enter, Right / Left) are the Links fold's
    // now (links.spec.js "arrow keys ..."): the Backlinks one gave way to the
    // header's scope button (pane-scope.ts, 2026-10-29).
    it("arrow keys move through the rows, the widened ones too; Enter opens a source", async function () {
        const h = host();
        await withScope("backlinks", true, () => wv._wvBlRenderBody(h, P, doc));
        const stops = [...h.querySelectorAll(".wv-bl-row")];
        assert.isAtLeast(stops.length, 4);
        // Its own three (S2's, S1's, C's), then its parts'.
        stops[2].focus();
        stops[2].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        assert.strictEqual(doc.activeElement, stops[3], "down from the item's own rows into its parts'");
        const opened = [];
        wv._wvBlOpenSource = (srcItem) => { opened.push(srcItem && srcItem.id); };   // own property over the shared method
        try {
            stops[0].focus();
            stops[0].dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        finally { delete wv._wvBlOpenSource; }
        assert.deepEqual(opened, [S2.id], "Enter opens the source");
    });

    // dev.50 on the dev library: a quote's data-annotation ran to 464
    // characters, the excerpt's raw window ended inside it, and the
    // after-side read a word and a dangling "(".
    it("an excerpt reaches past a quote's long markup to the words after it", async function () {
        const P3 = await wvT.createItem("book", { title: "WVBC dense" });
        const rects = Array.from({ length: 80 }, (_, i) => [10 + i, 10, 60 + i, 20]);
        const S5 = await note("E dense note", 'Cited <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [Zotero.URI.getItemURI(P3)] }], properties: {} })
            + '">(Dense)</span> then <span class="highlight" data-annotation="' + enc({ attachmentURI: Zotero.URI.getItemURI(A), annotationKey: X.key, position: { pageIndex: 11, rects } })
            + '">“quoted again”</span> and the closing words of the sentence.');
        try {
            const src = await wvT.waitFor(() => wv._wvBlDirect(P3).find((s) => s.srcID === S5.id), 10000);
            const t = src.excerpt.segs.map((s) => s.t).join("");
            assert.include(t, "closing words", "past the quote's markup: " + t);
        }
        finally { await wvT.erase(S5, P3); }
    });

    // MJT 2026-10-26: "Backlinks section rows (Shift or middle-click = open
    // the note in a new window); Ok" -- Zotero's own Shift rule for notes
    // (zoteroPane.js viewItems), the middle click of the collections tree.
    it("Shift+click, a middle click and Shift+Enter open the source in a new window; a plain click does not", function () {
        const h = host();
        wv._wvBlRenderBody(h, P, doc);
        const row = rowOf(h, S1.id);
        const calls = [];
        wv._wvBlOpenSource = (srcItem, src, opts) => { calls.push([srcItem && srcItem.id, !!(opts && opts.newWindow)]); };   // own property over the shared method
        try {
            row.dispatchEvent(new win.MouseEvent("click", { bubbles: true, shiftKey: true }));
            row.dispatchEvent(new win.MouseEvent("auxclick", { bubbles: true, button: 1 }));
            row.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
            row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
        }
        finally { delete wv._wvBlOpenSource; }
        assert.deepEqual(calls, [[S1.id, true], [S1.id, true], [S1.id, true], [S1.id, false]]);
    });

    it("in a new window a note opens in a note window, an annotation in a reader window at itself", async function () {
        const zp = /** @type {any} */ (win.ZoteroPane), R = /** @type {any} */ (Zotero.Reader);
        const origNote = zp.openNote, origOpen = R.open;
        const notes = [], readers = [];
        zp.openNote = (id, o) => { notes.push([id, o && o.openInWindow]); return Promise.resolve(null); };
        R.open = (id, loc, o) => { readers.push([id, loc && loc.annotationID, o && o.openInWindow]); return Promise.resolve(null); };
        try {
            await wv._wvBlOpenSource(S1, wv._wvBlDirect(P).find((s) => s.srcID === S1.id), { newWindow: true });
            await wv._wvBlOpenSource(X, { ref: "link", url: "" }, { newWindow: true });
        }
        finally { zp.openNote = origNote; R.open = origOpen; }
        assert.deepEqual(notes, [[S1.id, true]], "openNote with openInWindow, never a tab");
        assert.deepEqual(readers, [[A.id, X.key, true]], "the annotation's file, at the annotation, in a window");
    });

    it("rows know the item their link is aimed at (Add as Related relates that one); the menu says Show in Library", function () {
        const h = host();
        wv._wvBlRenderBody(h, P, doc, "subtree");
        assert.strictEqual(rowOf(h, S4.id)._wvBlTargetID, A.id, "the page link is aimed at the PDF, not the paper");
        assert.strictEqual(rowOf(h, S3.id)._wvBlTargetID, X.id, "the quote at the annotation");
        assert.strictEqual(rowOf(h, S1.id)._wvBlTargetID, P.id);
        const row = rowOf(h, S4.id);
        wv._wvBlOpenMenu({ target: row, screenX: 0, screenY: 0 }, S4, S4, A);
        const menu = doc.getElementById("wv-backlinks-menu");
        try {
            const items = [...menu.querySelectorAll("menuitem")].map((m) => m.getAttribute("label"));
            assert.include(items, "Show in Library");
            assert.notInclude(items, "Reveal in Library");
        }
        finally { try { menu.hidePopup(); } catch (e) {} }
    });
});
