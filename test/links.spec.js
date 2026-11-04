/* global describe, it, before, after, assert, Zotero, Services, PathUtils, IOUtils, wvT */

// Links (outgoing references), the mirror of Backlinks (MJT 2026-10-27,
// "Ok for the proposed plan" -- the four defaults of the plan: a paper's
// section lists the references written in its notes and its annotations'
// comments, grouped by the note or annotation that carries them; only
// references to Zotero items count (a web URL is Has Link's business); the
// hover card shows the TARGET; a broken reference -- its item gone, or its
// group library not in this profile -- is listed greyed and never counted,
// and heals by itself when such an item lands). Every resolved Link is the
// very entry Backlinks lists for its target. Written before the code (the
// feature skill's check-first rule): every `it` fails on 0.22.3-dev.58.

describe("Weavero — Links (outgoing references)", function () {
    this.timeout(90000);
    let wv, win, doc, lib, P, A, X, N, P2, P3, A3, Y, S, T;
    const made = [];
    const XHTML = "http://www.w3.org/1999/xhtml";
    const GONE = "WVLKG2NE";      // a well-formed key no item has
    const GROUP = 999999999;      // a group not in this profile
    const enc = (o) => encodeURIComponent(JSON.stringify(o));
    // The main window's filter on a section's header counts set for `fn`
    // (pane-scope.ts, dev.113), then put back: the widen / narrow of the
    // header button it replaced -- no filter, or the item's own only.
    const withScope = async (kind, wide, fn) => {
        const f = wv._wvScopeFilterFor(Zotero.getMainWindow(), kind);
        const saved = JSON.stringify(f);
        Object.assign(f, { inc: wide ? [] : [kind === "links" ? "note" : "own"], exc: [], loop: 0 });
        try { return await fn(); } finally { Object.assign(f, JSON.parse(saved)); }
    };
    // The Links filter's broken-links state for `fn` (1 only them, -1 none,
    // 0 with the others; the default hides them, MJT 2026-10-30), then back.
    const withBroken = async (broken, fn) => {
        const f = wv._wvScopeFilterFor(Zotero.getMainWindow(), "links");
        const saved = JSON.stringify(f);
        Object.assign(f, { inc: [], exc: [], loop: 0, broken });
        try { return await fn(); } finally { Object.assign(f, JSON.parse(saved)); }
    };
    const note = async (title, body, parentID) => {
        const n = /** @type {any} */ (new Zotero.Item("note"));
        n.libraryID = lib;
        if (parentID) n.parentID = parentID;
        n.setNote("<h1>" + title + "</h1><p>" + body + "</p>");
        // Not selected: the item pane's editor reworks a selected note's
        // citations and saves it again (backlinks-context.spec.js).
        await n.saveTx({ skipSelect: true });
        return n;
    };
    const ann = async (att, text, page, comment) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = "highlight";
        a.annotationText = text;
        a.annotationComment = comment || "";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = page;
        a.annotationSortIndex = "0000" + page + "|000001|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: Number(page) - 1, rects: [[10, 10, 60, 20]] });
        await a.saveTx();
        return a;
    };
    // A new item under a key of our choosing (what a sync or a restore
    // does): Zotero.Item exposes no key setter of its own, DataObject's
    // accessor reads only, so the identifier path is called directly. A
    // keyed object is "identified" and must load its (absent) primary data
    // before any field is set -- server_localAPI.js does the same.
    const setKey = async (it, k) => { try { it.key = k; } catch (e) {} if (it.key !== k) it._set("key", k); await it.loadPrimaryData(); };
    const host = () => {
        const h = doc.createElementNS(XHTML, "div");
        h.className = "wv-lk-body";
        h.style.cssText = "position:fixed;left:10px;top:10px;width:360px;";
        doc.documentElement.appendChild(h);
        made.push(h);
        return h;
    };
    const rows = (h) => [...h.querySelectorAll(".wv-bl-row")];
    // A section row's two lines (2026-10-29): [title, what else] of the item
    // the link is written in ("from") and of the item it points at ("to").
    const end = (r, side) => {
        const e = r.querySelector(":scope > .wv-bl-" + side);
        return e ? [e.querySelector(".wv-bl-end-main").textContent, (e.querySelector(".wv-bl-end-chip") || { textContent: "" }).textContent] : null;
    };
    const card = () => doc.getElementById("wv-bl-card");

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvLkOut", "_wvLkCount", "_wvLkRenderBody", "_wvLkOpen", "_wvLkOpenMenu", "_wvLkHookRender", "_wvLkHookAsyncRender",
            "_wvLkInit", "_wvLkDestroy", "_wvLkApplySectionPref", "_wvBlEnsure", "_wvBlDirect", "_wvBlCount"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVLK paper" });
        A = await wvT.createTestPDFItem("wvlk-pdf", { parentItemID: P.id });
        P2 = await wvT.createItem("book", { title: "WVLK target two" });
        P3 = await wvT.createItem("book", { title: "WVLK cited three" });
        A3 = await wvT.createTestPDFItem("wvlk-pdf3", { parentItemID: P3.id });
        Y = await ann(A3, "quoted words", "4");
        X = await ann(A, "linking words", "2", "See zotero://select/library/items/" + P2.key + " and the gone zotero://select/library/items/" + GONE + " too.");
        T = await note("WVLK target note", "nothing here");
        const uriP = Zotero.URI.getItemURI(P), uriP3 = Zotero.URI.getItemURI(P3), uriA3 = Zotero.URI.getItemURI(A3);
        // N, under P: a link, a citation and a quote aimed elsewhere (in that
        // order), then a citation of its own paper -- an internal Link,
        // counted (2026-10-30; an uncounted "internal reference" from dev.107
        // to dev.118) -- and a web URL, no Link. (Until dev.108 N also linked
        // P, a self link then; a link inside its own item, to itself
        // included, is an internal Link now: backlinks-context.spec.js.)
        N = await note("WVLK child note", "First zotero://select/library/items/" + P2.key
            + ' then <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP3], locator: "7" }], properties: {} }) + '">(Three, p. 7)</span>'
            + ' then <span class="highlight" data-annotation="' + enc({ attachmentURI: uriA3, annotationKey: Y.key, citationItem: { uris: [uriP3], locator: "4" }, position: { pageIndex: 3, rects: [[10, 10, 60, 20]] } }) + '">“quoted words”</span>'
            + ' and own <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP] }], properties: {} }) + '">(Own)</span>'
            + " and web https://example.org/page here.", P.id);
        S = await note("WVLK standalone", "To the note zotero://select/library/items/" + T.key + " and into zotero://select/groups/" + GROUP + "/items/" + GONE + " elsewhere.");
        await wv._wvBlEnsure();
        await wvT.waitFor(() => wv._wvLkOut(N).length >= 4 && wv._wvLkOut(X).length >= 2 && wv._wvLkOut(S).length >= 2, 10000);
    });

    after(async function () {
        for (const h of made) { try { h.remove(); } catch (e) {} }
        try { const c = card(); if (c) c.remove(); } catch (e) {}
        await wvT.erase(S, T, P, P2, P3);
    });

    it("Links are the source's references in text order, each the very entry Backlinks lists", function () {
        const out = wv._wvLkOut(N);
        assert.deepEqual(out.map((r) => r.entry.ref), ["link", "citation", "quote", "citation"], "text order");
        assert.strictEqual(out[0].target.id, P2.id);
        assert.strictEqual(out[1].target.id, P3.id);
        assert.strictEqual(out[2].target.id, Y.id, "a quote is aimed at the annotation");
        assert.strictEqual(out[3].target.id, P.id, "its own paper's citation");
        assert.deepEqual(out.map((r) => !!r.entry.internal), [false, false, false, true], "...the internal one");
        assert.strictEqual(out[0].entry, wv._wvBlDirect(P2).find((s) => s.srcID === N.id), "the same object Backlinks holds");
        assert.strictEqual(out[1].entry, wv._wvBlDirect(P3).find((s) => s.srcID === N.id));
        assert.strictEqual(out[2].entry, wv._wvBlDirect(Y).find((s) => s.srcID === N.id));
        assert.strictEqual(out[3].entry, wv._wvBlDirect(P).find((s) => s.srcID === N.id));
        assert.strictEqual(out[1].entry.locator, "7");
        assert.strictEqual(wv._wvLkCount(N), 4);
    });

    // Slice 2 (MJT 2026-10-27, "A Links similar to Backlinks column should be
    // added"): the column next to Backlinks, same conventions -- collapsed,
    // the subtree's resolved references; expanded, the item's own (a paper's
    // own is nothing: its notes and annotations carry theirs). FAILED on
    // 0.22.3-dev.62 (no such column).
    it("the Links column counts the subtree's resolved references; a target with none reads 0", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        const col = cols.find((c) => /weaveroLinks$/.test(String(c.dataKey)));
        assert.isOk(col, "the Links column is registered (pref on by default)");
        assert.strictEqual(col.label, "Item Links");
        assert.strictEqual(col.dataProvider(P), 5, "N's link, citation, quote and own citation + X's link; X's gone key is not counted, S is not P's");
        assert.strictEqual(col.dataProvider(N), 4);
        assert.strictEqual(col.dataProvider(S), 1, "the group link is broken: listed, never counted");
        assert.strictEqual(col.dataProvider(P2), 0, "a target with no references of its own");
        assert.strictEqual(wv._wvLkCountForColumn(P), 5);
        assert.strictEqual(wv._wvLkOwnCount(P), 0, "expanded, a paper's own count is nothing");
        assert.strictEqual(wv._wvLkOwnCount(N), 4, "a note's own count is its count");
        const svg = decodeURIComponent(String(col.iconPath).replace(/^data:image\/svg\+xml,/, ""));
        assert.include(svg, wvT.lib().WV_OUTLINK_ARROW_PATH, "the links glyph with the arrow OUT");
    });

    it("the Links number's popup lists the rows the section would, broken greyed, under the Links title and glyph", function () {
        const anchor = doc.documentElement;
        const p = () => /** @type {any} */ (doc.getElementById("weavero-panel"));
        try {
            wv._wvOpenCountPopup("links", P.id, { anchorNode: anchor, scope: "subtree", win });
            assert.isOk(p() && p().style.display === "block", "the popup opened for the Links kind");
            assert.match(p().querySelector(".wv-relations-header-title").textContent, /^5 Item Links$/);
            assert.strictEqual(p().querySelectorAll(".wv-lk-row").length, 6, "5 resolved + X's gone key, listed greyed");
            assert.strictEqual(p().querySelectorAll(".wv-lk-row.wv-lk-broken").length, 1);
            const icon = p().querySelector(".wv-relations-header-icon");
            assert.isOk(icon, "a header icon");
            assert.include(decodeURIComponent(String(icon.getAttribute("src"))), wvT.lib().WV_OUTLINK_ARROW_PATH, "the Links glyph heads the popup");
            wv._wvOpenCountPopup("links", N.id, { anchorNode: anchor, scope: "own", win });
            assert.match(p().querySelector(".wv-relations-header-title").textContent, /^4 Item Links$/, "a note's own number lists its own");
            assert.strictEqual(p().querySelectorAll(".wv-lk-row").length, 4);
            assert.isNull(p().querySelector(".wv-bl-refmark"), "no kind mark: the label says it");
        }
        finally { if (p()) p().style.display = "none"; }
    });

    // A web URL is Has External Link's, a zotero:// link Has Item Links' and
    // the Links section's -- never both (MJT 2026-10-30, "Make the Has Link
    // become Has External Link, so that there is not overlap anymore"; until
    // then "Has Link" matched any URL, zotero:// included).
    it("an own-paper citation is an internal Link; a web URL is not a Link but Has External Link's, a zotero:// link not", function () {
        const out = wv._wvLkOut(N);
        const own = out.filter((r) => r.target && r.target.id === P.id);
        assert.deepEqual(own.map((r) => [r.entry.ref, !!r.entry.internal]), [["citation", true]], "its own paper's citation: internal, counted");
        assert.isNotOk(out.some((r) => /example\.org/.test(r.url)), "a web URL is Has External Link's business");
        assert.isTrue(wv._itemHasLinks(N), "N, with its web URL: Has External Link");
        assert.isFalse(wv._itemHasLinks(S), "S, zotero:// links only: not Has External Link");
        assert.isFalse(wv._itemHasLinks(X), "X's comment, zotero:// links only: not either");
        // (An app link -- mailto:, obsidian:// -- counts when its scheme is on
        // in Settings, as for Has Link before; the runner's are off.)
        assert.isTrue(wv.hasExternalURI("see zotero://select/library/items/ABCD2345 and https://example.org/x"), "a web link after a zotero:// one");
        assert.isFalse(wv.hasExternalURI("only zotero://select/library/items/ABCD2345 here"));
        assert.strictEqual(out.length, 4);
        assert.isUndefined(wv._wvLkInternal, "no internal-references list any more");
    });

    it("a broken link is listed and marked, never counted; Backlinks counts do not move", async function () {
        const x = wv._wvLkOut(X);
        assert.deepEqual(x.map((r) => r.broken), [null, "missing"], "the annotation's second link names no item");
        assert.strictEqual(x[0].target.id, P2.id);
        assert.strictEqual(x[1].key, GONE);
        assert.strictEqual(wv._wvLkCount(X), 1);
        const s = wv._wvLkOut(S);
        assert.deepEqual(s.map((r) => r.broken), [null, "library"], "the standalone note's second link names a group not here");
        assert.strictEqual(s[1].group, GROUP);
        assert.strictEqual(wv._wvLkCount(S), 1);
        const by = (list) => list.map((e) => e.srcID).sort((a, b) => a - b);
        assert.deepEqual(by(wv._wvBlDirect(P2)), [N.id, X.id].sort((a, b) => a - b), "Backlinks: the resolved references only");
        // Shown by default, in place in reading order, greyed (MJT
        // 2026-10-30, "Always show broken links"; hidden by default from
        // dev.121 to dev.127); the header's broken count shows them alone
        // (click) or hides them (Alt+click, "1a").
        const h = host();
        assert.strictEqual(wv._wvLkRenderBody(h, S, doc), 1, "the header counts the resolved one");
        assert.deepEqual(rows(h).map((r) => r.classList.contains("wv-lk-broken")), [false, true], "by default: both, in the text's order");
        assert.isNull(h.querySelector(".wv-bl-more"), "no fold any more");
        const br = h.querySelector(".wv-bl-row.wv-lk-broken");
        assert.match(br.textContent, /library not in this profile/i);
        await withBroken(-1, () => wv._wvLkRenderBody(h, S, doc));
        assert.deepEqual(rows(h).map((r) => r.classList.contains("wv-lk-broken")), [false], "hidden: the resolved one only");
        await withBroken(1, () => wv._wvLkRenderBody(h, S, doc));
        assert.deepEqual(rows(h).map((r) => r.classList.contains("wv-lk-broken")), [true], "only them: the broken one");
        const hx = host();
        await withBroken(0, () => wv._wvLkRenderBody(hx, X, doc));
        assert.match(hx.querySelector(".wv-lk-broken").textContent, /item not found/i);
    });

    // The broken links' count, at the end of the header's counts by the
    // links chain with a corner x (MJT 2026-10-30, "Can you put a broken
    // link icon and make it a toggle at the end?" -> "1a, 2a", "Icon A"): the
    // title counts the resolved links alone ("16 Item Links", no "· 1 broken").
    it("the broken links' count closes the header's counts, a filter toggle: shown by default, click only them, Alt+click hide", async function () {
        const head = doc.createElementNS(XHTML, "div");
        const title = doc.createElementNS(XHTML, "span");
        head.appendChild(title);
        doc.documentElement.appendChild(head);
        made.push(head);
        const f = { inc: [], exc: [], loop: 0, broken: 0, ref: 0 };
        const ctl = { kind: "links", sec: head, f, item: P };
        const counts = () => [...head.querySelectorAll(".wv-scope-count")].map((c) => [c.dataset.kind, c.querySelector(".wv-scope-count-n").textContent, c.dataset.selected ? "only" : c.dataset.excluded ? "hidden" : ""]);
        const endKinds = () => [...head.querySelectorAll(".wv-scope-counts-end .wv-scope-count")].map((c) => c.dataset.kind);
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { broken: 1 });
        // Shown by default: the plain count, no barred square (MJT 2026-10-30,
        // "The square barred is too flashy to be the default").
        assert.deepEqual(counts(), [["note", "4", ""], ["ann", "1", ""], ["internal", "1", ""], ["broken", "1", ""]], "last, shown by default");
        f.broken = -1;
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { broken: 1 });
        assert.deepEqual(counts().pop(), ["broken", "1", "hidden"], "Alt+clicked: barred");
        f.broken = 0;
        // The levels add up to the title's count; the internal and the
        // broken links do not: they sit at the end of the line (MJT
        // 2026-10-30, "So place it at the end of the line").
        assert.deepEqual(endKinds(), ["internal", "broken"], "at the end of the line");
        assert.strictEqual(head.lastElementChild.className, "wv-scope-counts wv-scope-counts-end");
        const b = head.querySelector('.wv-scope-count[data-kind="broken"]');
        assert.isOk(b.querySelector("svg.wv-scope-count-icon path[d='" + wvT.lib().WV_BROKENLINK_MARK_PATH + "']"), "the chain with the corner x");
        // In red, the convention for a broken thing (MJT 2026-10-30): Zotero's
        // own, its missing file's cross. The icon, and the number too ("Also
        // make the count for broken links in red"; the icon alone dev.121-129),
        // also while the count shows them alone.
        const red = doc.createElementNS(XHTML, "span");
        red.style.color = "var(--accent-red, #db2c3a)";
        doc.documentElement.appendChild(red);
        made.push(red);
        const isRed = (state) => {
            for (const sel of ["svg.wv-scope-count-icon", ".wv-scope-count-n"]) {
                const el = head.querySelector('.wv-scope-count[data-kind="broken"] ' + sel);
                assert.strictEqual(win.getComputedStyle(el).color, win.getComputedStyle(red).color, state + ": " + sel + " in Zotero's red");
            }
        };
        isRed("shown");
        assert.match(b.title, /^Broken links: 1/);
        f.broken = 1;
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { broken: 1 });
        assert.deepEqual(counts().pop(), ["broken", "1", "only"]);
        isRed("only them");
        f.broken = -1;
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { broken: 0 });
        // None broken, hidden: drawn at 0 in the hidden state, the way back
        // (dev.159: an active toggle stays until it is cleared, pane-scope.ts
        // _wvScopeSetCounts; drawn only while shown alone until dev.158).
        assert.deepEqual(counts().pop(), ["broken", "0", "hidden"], "none broken, hidden: the count at 0, barred");
        f.broken = 0;
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { broken: 0 });
        assert.notInclude(counts().map((c) => c[0]), "broken", "none broken, shown: no count");
        f.broken = -1;
        // An item with no level counts (a note) still shows it.
        wv._wvScopeSetCounts(title, null, "In", null, ctl, { broken: 2 });
        assert.deepEqual(counts(), [["broken", "2", "hidden"]], "alone");
        // "This item" stays, at 0 too, whenever the header has counts: its
        // toggle is the way back to the item's own (MJT 2026-11-02, "If I
        // unselect the current item level with 0, it disappears, and I cannot
        // get it back. It should stay pinned so that I can go back, even with
        // 0 matches."; shown at 0 only while selected until dev.148). FAILED
        // on dev.148. Since dev.159 by the one pin rule: Related's default is
        // the item's own alone, so its toggle is pinned (pane-scope.spec.js).
        const ctl0 = { kind: "related", sec: head, f: { inc: [], exc: [], loop: 0, broken: 0, ref: 0 }, item: P };
        wv._wvScopeSetCounts(title, { own: 0, att: 0, note: 0, ann: 2 }, "On", null, ctl0);
        assert.deepEqual(counts(), [["own", "0", ""], ["ann", "2", ""]], "this item's 0 kept, unselected");
        // The kinds (MJT 2026-10-30, "Put them as toggles in the header for
        // now"), first at the line's end, shown when both are there. Named
        // with Zotero's own words (MJT 2026-11-02: "Zotero links" -- its
        // "Include Zotero Links" export option --, "Note citations"), each by
        // its own mark alone: a lowercase z for the zotero:// links, a
        // closing quote mark (Zotero's cite.svg) for the citations and
        // annotations its note editor writes ("For the link types icons, it
        // is actually difficult to distinguish the 2. Drop the chain icon,
        // and keep only "z" (lowercase) and """; the chain with a corner Z or
        // quote mark in dev.144-152, the plain chain and Zotero's cite icon
        // until dev.143). FAILED on dev.152.
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { refs: { link: 3, zotero: 2 }, broken: 1 });
        assert.deepEqual(endKinds(), ["link", "zotero", "internal", "broken"]);
        const glib = Zotero.Weavero.lib;
        const lk = head.querySelector('.wv-scope-count[data-kind="link"]'), zc = head.querySelector('.wv-scope-count[data-kind="zotero"]');
        const marks = (el) => [...el.querySelectorAll("svg.wv-scope-count-icon > path")].map((p) => p.getAttribute("d"));
        assert.deepEqual(marks(lk), [glib.WV_ZLINK_KIND_PATH], "Zotero links: a lowercase z");
        assert.deepEqual(marks(zc), [glib.WV_CITE_KIND_PATH], "Note citations: a closing quote mark");
        for (const el of [lk, zc]) assert.isNull(el.querySelector("svg.wv-scope-count-icon g"), "no chain");
        assert.match(lk.title, /^Zotero links: 3\n/, "named Zotero links");
        assert.match(zc.title, /^Note citations: 2\n/, "named Note citations");
        // Each set a row or a reference holds only one of -- the levels, the
        // two kinds -- on the funnel filter's grey card, as its "pick any of
        // these" groups (MJT 2026-11-02, "When the icons are exclusive in the
        // Weavero funnel filter, they get a grey background. Same rule should
        // apply in the filters of the item pane sections"; constants.ts
        // .wv-filter-or-group). The internal and the broken links cut across
        // both: no card. FAILED on dev.146.
        const orCard = doc.createElementNS(XHTML, "div");
        orCard.className = "wv-filter-or-group";
        doc.documentElement.appendChild(orCard);
        made.push(orCard);
        const tint = win.getComputedStyle(orCard).backgroundColor;
        const cardOf = (kind) => head.querySelector('.wv-scope-count[data-kind="' + kind + '"]').parentElement;
        assert.strictEqual(cardOf("note"), cardOf("ann"), "one card for the levels");
        assert.strictEqual(win.getComputedStyle(cardOf("note")).backgroundColor, tint, "the levels on the funnel's grey card");
        assert.strictEqual(cardOf("link"), cardOf("zotero"), "one card for the two kinds");
        assert.strictEqual(win.getComputedStyle(cardOf("link")).backgroundColor, tint, "the kinds on theirs");
        for (const k of ["internal", "broken"]) assert.strictEqual(win.getComputedStyle(cardOf(k)).backgroundColor, "rgba(0, 0, 0, 0)", k + ": no card");
        wv._wvScopeSetCounts(title, { att: 0, note: 4, ann: 1 }, "In", { n: 1, of: 5, what: "links" }, ctl, { refs: { link: 5, zotero: 0 } });
        assert.notInclude(counts().map((c) => c[0]), "link", "one kind only: no kind counts");
        // The press: click only them, again all; Alt+click hide them.
        const win2 = Zotero.getMainWindow();
        const wf = wv._wvScopeFilterFor(win2, "links");
        const saved = JSON.stringify(wf);
        const sec = doc.createXULElement("collapsible-section");
        doc.documentElement.appendChild(sec);
        made.push(sec);
        try {
            wf.broken = -1;
            wv._wvScopeFilterToggle(sec, "links", "broken", false);
            assert.strictEqual(wf.broken, 1, "click: only them");
            wv._wvScopeFilterToggle(sec, "links", "broken", false);
            assert.strictEqual(wf.broken, 0, "click again: all");
            wv._wvScopeFilterToggle(sec, "links", "broken", true);
            assert.strictEqual(wf.broken, -1, "Alt+click: hidden");
            // The kinds are one state: only the links hides Zotero's.
            wf.ref = 0;
            wv._wvScopeFilterToggle(sec, "links", "link", false);
            assert.strictEqual(wf.ref, 1, "click the links: only them");
            wv._wvScopeFilterToggle(sec, "links", "zotero", false);
            assert.strictEqual(wf.ref, -1, "click Zotero's: only them");
            wv._wvScopeFilterToggle(sec, "links", "zotero", false);
            assert.strictEqual(wf.ref, 0, "again: both");
            wv._wvScopeFilterToggle(sec, "links", "link", true);
            assert.strictEqual(wf.ref, -1, "Alt+click the links: Zotero's only");
        }
        finally { Object.assign(wf, JSON.parse(saved)); }
        // The rows follow: P's links alone, or Zotero's alone.
        const h = host();
        const refsOf = () => rows(h).map((r) => r._wvLkRow.entry.ref);
        const withRef = async (ref, fn) => { const s = JSON.stringify(wf); Object.assign(wf, { inc: [], exc: [], loop: 0, broken: -1, ref }); try { return await fn(); } finally { Object.assign(wf, JSON.parse(s)); } };
        await withRef(1, () => wv._wvLkRenderBody(h, P, doc));
        assert.deepEqual(refsOf(), ["link", "link"], "the links: N's and X's");
        await withRef(-1, () => wv._wvLkRenderBody(h, P, doc));
        assert.deepEqual(refsOf(), ["citation", "quote", "citation"], "Zotero's: N's citation, quote and own citation");
        // The title: the resolved links alone.
        const label = async (a) => { const [m] = await doc.l10n.formatMessages([{ id: "weavero-links-header", args: a }]); return m.attributes.find((x) => x.name === "label").value; };
        assert.strictEqual(await label({ count: 16 }), "16 Item Links");
    });

    it("an erased target's Links turn broken; an item landing with that key heals them without a rebuild", async function () {
        const P4 = await wvT.createItem("book", { title: "WVLK four" });
        const key = P4.key;
        const S4 = await note("WVLK links four", "Go zotero://select/library/items/" + key + " now.");
        let P5 = null, G = null;
        try {
            await wvT.waitFor(() => { const r = wv._wvLkOut(S4)[0]; return !!(r && r.target && r.target.id === P4.id); }, 10000);
            assert.strictEqual(wv._wvLkCount(S4), 1);
            await P4.eraseTx();
            await wvT.waitFor(() => wv._wvLkOut(S4)[0].broken === "missing" && wv._wvLkCount(S4) === 0, 10000);
            P5 = /** @type {any} */ (new Zotero.Item("book"));
            P5.libraryID = lib;
            await setKey(P5, key);
            P5.setField("title", "WVLK four again");
            await P5.saveTx({ skipSelect: true });
            assert.strictEqual(P5.key, key, "the key is re-created");
            await wvT.waitFor(() => { const r = wv._wvLkOut(S4)[0]; return !r.broken && r.target && r.target.id === P5.id && wv._wvLkCount(S4) === 1; }, 10000);
            assert.isOk(wv._wvBlDirect(P5).some((e) => e.srcID === S4.id), "and Backlinks sees the link again");
            // A reference broken from the start (X's) heals the same way:
            // its source is re-indexed when the item lands.
            G = /** @type {any} */ (new Zotero.Item("book"));
            G.libraryID = lib;
            await setKey(G, GONE);
            G.setField("title", "WVLK gone no more");
            await G.saveTx({ skipSelect: true });
            await wvT.waitFor(() => { const r = wv._wvLkOut(X)[1]; return !!(r && !r.broken && r.target && r.target.id === G.id); }, 10000);
            assert.strictEqual(wv._wvLkCount(X), 2);
            assert.strictEqual(wv._wvLkOut(X)[1].entry, wv._wvBlDirect(G).find((e) => e.srcID === X.id), "now a Backlink of the new item");
            const g = G; G = null;
            await g.eraseTx();
            await wvT.waitFor(() => wv._wvLkOut(X)[1].broken === "missing" && wv._wvLkCount(X) === 1, 10000);
        }
        finally { await wvT.erase(S4, P5, G, P4); }
    });

    it("a paper's section lists its links by source, notes then annotations in reading order; a note's names itself", async function () {
        const h = host();
        // Each source heads its links as the Tags and Related sections head a
        // part -- its icon, its name, its count at the right end (MJT
        // 2026-10-30, "Option (b)"; until dev.120 its name was the first
        // row's first line): the note's four, then the annotation's resolved
        // one -- its broken one hidden here (Alt+click on the broken count,
        // "1a"; folded from 2026-10-27 to dev.120).
        assert.strictEqual(await withBroken(-1, () => wv._wvLkRenderBody(h, P, doc)), 5, "N's four and X's one resolved");
        const own = rows(h);
        const nt = N.getDisplayTitle(), xt = X.getDisplayTitle();
        assert.strictEqual(nt, "WVLK child note");
        const heads = (el) => [...el.querySelectorAll(":scope > .wv-bl-hgroup > .wv-count-group-head")].map((e) => [e.querySelector(".wv-count-group-title").textContent, e.querySelector(".wv-count-group-n").textContent]);
        const xl = wv._wvCountSourceLabel(X, P);
        assert.deepEqual(heads(h), [[nt, "4"], [xl, "1"]], "the note's heading, then the annotation's");
        assert.deepEqual(own.map((r) => end(r, "from")), [null, null, null, null, null], "no source line in a row");
        assert.deepEqual(own.map((r) => r._wvLkRow.src.id), [N.id, N.id, N.id, N.id, X.id], "each row still the link of its source");
        assert.isNull(h.querySelector(".wv-bl-more, .wv-lk-broken"), "no fold, no broken row");
        // Shown, the default (MJT 2026-10-30, "Always show broken links"):
        // in place, after X's resolved one (the comment's order), greyed,
        // under X's heading.
        assert.strictEqual(wv._wvLkRenderBody(h, P, doc), 5, "the broken one never counted");
        const all = rows(h);
        assert.deepEqual(all.map((r) => r.classList.contains("wv-lk-broken")), [false, false, false, false, false, true], "the broken one last, X's second");
        assert.deepEqual(heads(h), [[nt, "4"], [xl, "2"]], "X's heading counts both");
        assert.strictEqual(all[5].parentElement, all[4].parentElement, "under X's heading");
        assert.match(end(all[5], "to")[0], /item not found/i);
        assert.strictEqual(win.getComputedStyle(all[5]).opacity, "0.65", "greyed");
        // The section's rows carry no preview -- no annotated text, no
        // excerpt: at the pane's width the two-line clamp shows little but
        // the address (MJT 2026-10-27, "showing the link or backlink preview
        // directly in the item pane is not useful, as it is too small");
        // the card keeps both. FAILED on dev.76.
        assert.isNull(h.querySelector(".wv-bl-excerpt"), "section rows: no excerpt");
        assert.isNull(h.querySelector(".wv-bl-ann-text"), "section rows: no annotated text");
        // Nor the highlighted text of an annotation a row is aimed at: "no
        // need to show the highlighted text in the item pane" (MJT 2026-10-28,
        // after dev.87 showed it there); the popups and the card keep it.
        // FAILED on dev.87.
        assert.isNull(h.querySelector(".wv-bl-target-hl"), "section rows: no highlighted-text line");
        // The count popups draw as the section (MJT 2026-11-02, "Keep the
        // same format as in the item pane"): no annotated text, no
        // highlighted text of the annotation a row is aimed at, no excerpt --
        // the card shows all three. (A popup's row carried them from dev.68
        // and dev.86 to dev.147.)
        const hp = host();
        assert.strictEqual(wv._wvLkRenderBody(hp, P, doc, "subtree"), 5);
        assert.isNull(hp.querySelector(".wv-bl-target-hl, .wv-bl-ann-text, .wv-bl-excerpt"), "a popup's rows: none, as the section's");
        const hb = host();
        wv._wvBlRenderBody(hb, P2, doc, "section");
        const xRow = [...hb.querySelectorAll(".wv-bl-row")].find((r) => r._wvBlSrcID === X.id);
        assert.isOk(xRow, "P2's Backlinks list X's row");
        assert.isNull(xRow.querySelector(".wv-bl-ann-text"), "the Backlinks section's row: none either");
        const hbp = host();
        wv._wvBlRenderBody(hbp, P2, doc, "own");
        const xPop = [...hbp.querySelectorAll(".wv-bl-row")].find((r) => r._wvBlSrcID === X.id);
        assert.isOk(xPop, "the Backlinks popup lists X's row");
        assert.isNull(xPop.querySelector(".wv-bl-ann-text"), "...without its text, as the section's (dev.147 had it)");
        // An annotation's line shows its own page when the link names none
        // (MJT 2026-10-30, "Annotation's page"; "" until dev.129).
        assert.deepEqual(own.slice(0, 3).map((r) => end(r, "to")), [["WVLK target two", ""], ["WVLK cited three", "p. 7"], [Y.getDisplayTitle(), "p. 4"]],
            "each row names the item it points at -- the quoted annotation itself, with its page -- and a citation's page");
        const hn = host();
        assert.strictEqual(wv._wvLkRenderBody(hn, N, doc), 4);
        assert.isNull(hn.querySelector(".wv-bl-owner"), "no headings");
        const hnOwn = rows(hn).filter((r) => !r.closest(".wv-bl-more"));
        // A note's own section: every row is written in the note, under "This
        // item", the arrow down from it (MJT 2026-11-03, "keep the "This item"
        // header ... because the links color now add another information";
        // from 2026-10-30 to dev.171 nothing named it and no arrow left it).
        assert.deepEqual(hnOwn.map((r) => end(r, "from")), [null, null, null, null], "no line naming the note: its heading does");
        assert.lengthOf(hn.querySelectorAll(".wv-bl-arrow[data-dir='down']"), 4, "an arrow down on each row");
        assert.deepEqual(hnOwn.map((r) => end(r, "to")), [["WVLK target two", ""], ["WVLK cited three", "p. 7"], [Y.getDisplayTitle(), "p. 4"], ["WVLK paper", ""]]);
        assert.isOk(hnOwn[1].classList.contains("wv-bl-ref-citation"));
        assert.isNull(hnOwn[0].querySelector(".wv-bl-excerpt"), "the section's rows carry no excerpt");
        // Its citation of its own paper: in place, counted, marked internal
        // and as Zotero's (backlinks-context.spec.js); no fold.
        assert.isNull(hn.querySelector(".wv-bl-more"), "no fold");
        assert.deepEqual([...hn.querySelectorAll(".wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "a note's own section: under This item");
        assert.isTrue(!!hnOwn[3]._wvLkRow.entry.internal, "internal");
        assert.isNull(hn.querySelector(".wv-bl-internal"), "no U-turn on the row (MJT 2026-10-30, \"for now\")");
        const hnp = host();
        wv._wvLkRenderBody(hnp, N, doc, "own");
        assert.isNull(rows(hnp)[0].querySelector(".wv-bl-excerpt"), "a popup's row: no excerpt either, the card holds it (2026-11-02)");
    });

    // MJT 2026-10-27, on a paper with a PDF, an EPUB and an image: "I do not
    // see the information on which attachment the annotation belongs to".
    // An annotation named out of its tree -- a Links group head, a Backlinks
    // row label, a chip aimed at it -- carries its file's title once its
    // paper has more than one file attachment and the file is not the
    // paper's default one (2026-11-02); with one file nothing changes (the
    // tests above). FAILED on dev.64.
    // MJT 2026-10-28 (screenshot: a green note annotation's head, then
    // "1 broken link" under it; "Is the green the broken link?" ... "I would
    // expect the full information of the broken link to be hidden within the
    // folded row"). FAILED on dev.77.
    // Broken links hidden (Alt+click on their count), a source whose links
    // are all broken is named nowhere (MJT 2026-10-28, "I would expect the
    // full information of the broken link to be hidden"); shown (the default
    // since 2026-10-30), it heads its rows in reading order with the others.
    it("a source whose links are all broken is named only while the broken links show, in reading order with the others", async function () {
        const Q = await ann(A, "only gone words", "3", "Gone zotero://select/library/items/WVLKG3NE here.");
        try {
            await wvT.waitFor(() => wv._wvLkOut(Q).length === 1, 10000);
            const h = host();
            const titles = () => [...h.querySelectorAll(":scope > .wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent);
            assert.strictEqual(await withBroken(-1, () => wv._wvLkRenderBody(h, P, doc)), 5, "nothing counted for it");
            assert.notInclude(titles(), wv._wvCountSourceLabel(Q, P), "hidden: not named");
            wv._wvLkRenderBody(h, P, doc);
            assert.deepEqual(titles(), [N.getDisplayTitle(), wv._wvCountSourceLabel(X, P), wv._wvCountSourceLabel(Q, P)], "shown: X, then Q, in reading order");
            await withBroken(1, () => wv._wvLkRenderBody(h, P, doc));
            assert.deepEqual(titles(), [wv._wvCountSourceLabel(X, P), wv._wvCountSourceLabel(Q, P)], "only the broken: X's and Q's");
        }
        finally { await wvT.erase(Q); }
    });

    // MJT 2026-11-02: "For backlinks, it does not make sense to show the
    // child item the annotation belongs to, as the row does not even
    // mention any information on the parent item. So remove from the source
    // of backlinks. Same for the target of links. For the source of links
    // and the target of backlinks, it makes more sense, because we already
    // know the parent item it belongs to. But as the annotation usually
    // lives in the main attachment, I would put the name of the attachment
    // only when it is not the default attachment." FAILED on dev.159 (every
    // end named its file once the paper had several).
    it("an annotation names its file on this item's end only, and only out of the paper's default attachment", async function () {
        const A2 = await wvT.createTestPDFItem("wvlk-pdf2", { parentItemID: P.id });
        let Z = null, picked = false;
        try {
            Z = await ann(A2, "second file words", "6", "Also zotero://select/library/items/" + P2.key + " here.");
            await wvT.waitFor(() => wv._wvLkOut(Z).length === 1 && wv._wvBlDirect(P2).some((s) => s.srcID === Z.id), 10000);
            const a2 = " (" + A2.getDisplayTitle() + ")";
            assert.strictEqual(wv._wvGetBestAttachmentSync(P).id, A.id, "A, the older PDF, is P's default attachment");
            const h = host();
            wv._wvLkRenderBody(h, P, doc);
            // The section's source headings, this item's end: the annotation
            // as a row's line names it, Zotero's title for it, then in grey
            // its file and its page (MJT 2026-10-30, "For the origin of
            // links, why not use the same format as the targets in that
            // section?"; "Annotation p. 2 (file): “text”" until dev.129, the
            // text cut away) -- Z's file, the second PDF; not X's, the default.
            const heads = (hh) => [...hh.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head")].map((e) => [e.querySelector(".wv-count-group-title").textContent, (e.querySelector(".wv-count-group-chip") || { textContent: "" }).textContent]);
            assert.deepInclude(heads(h), [X.getDisplayTitle(), "p. 2"], "X's heading: in the default file, its page alone");
            assert.deepInclude(heads(h), [Z.getDisplayTitle(), A2.getDisplayTitle() + " · p. 6"], "Z's heading: its file, then its page");
            // Backlinks on P2: the source lines, the other end, name no
            // file -- the annotation's own page only (MJT 2026-10-30, "(a)
            // Show both, page last" + "File · p. 1" until dev.159).
            const hb = host();
            wv._wvBlRenderBody(hb, P2, doc, "section");
            const bfroms = rows(hb).map((r) => end(r, "from"));
            assert.deepInclude(bfroms, [X.getDisplayTitle(), "p. 2"], "X's line: its page, no file");
            assert.deepInclude(bfroms, [Z.getDisplayTitle(), "p. 6"], "Z's line: its page, no file either");
            assert.isNull(hb.querySelector(".wv-bl-end-file"), "no source line names a file");
            // Short of room, a heading's file name is cut, never the page.
            h.style.width = "200px";
            const zHead = (hh) => [...hh.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head")].find((e) => e.querySelector(".wv-count-group-title").textContent === Z.getDisplayTitle());
            const zChip = zHead(h).querySelector(".wv-count-group-chip");
            const zFile = zChip.querySelector(".wv-count-group-file"), zPage = zChip.querySelector(".wv-count-group-place");
            assert.isOk(zFile && zPage, "the file and the page, each its own part");
            assert.strictEqual(zFile.nextElementSibling, zPage, "the page last");
            assert.isAbove(zFile.scrollWidth, zFile.clientWidth, "the file name cut");
            assert.isAtMost(zPage.scrollWidth, zPage.clientWidth, "the page whole");
            // A chip aimed at an annotation of such a paper names the file
            // the same way: Z's, not X's.
            assert.strictEqual(wv._wvBlChip({ ref: "link" }, Z, P), "→ annotation p. 6" + a2);
            assert.strictEqual(wv._wvBlChip({ ref: "link" }, X, P), "→ annotation p. 2", "X, in the default file: bare");
            // P3 has one file: its quoted annotation stays bare.
            assert.strictEqual(wv._wvBlChip({ ref: "quote" }, Y, P3), "→ annotation p. 4");
            // A long file name stops at ~6 em whatever the room (MJT
            // 2026-11-02, "For long file names, use a smaller part of the
            // horizontal space" -> "Fixed, ~6 em"; file and page shared 60%
            // of the line until dev.135).
            A2.setField("title", "Full Text PDF ".repeat(9).trim());
            await A2.saveTx();
            const lw = host();
            lw.style.width = "700px";
            wv._wvLkRenderBody(lw, P, doc);
            const f = zHead(lw).querySelector(".wv-count-group-file");
            const em = parseFloat(win.getComputedStyle(f).fontSize);
            assert.isAtMost(f.getBoundingClientRect().width, 6 * em + 0.5, "a heading's file: at most ~6 em");
            assert.isAbove(f.scrollWidth, f.clientWidth, "...cut");
            // Weavero's chosen default child decides too: A2 made the
            // default, X names its file and Z no longer does.
            picked = await wv._wvSetDefaultChild(A2);
            assert.isTrue(picked, "A2 picked as the default child");
            assert.strictEqual(wv._wvGetBestAttachmentSync(P).id, A2.id, "A2 is P's default attachment now");
            wv._wvLkRenderBody(lw, P, doc);
            assert.deepInclude(heads(lw), [X.getDisplayTitle(), A.getDisplayTitle() + " · p. 2"], "X names its file now");
            assert.deepEqual(heads(lw).filter((e) => e[0] === Z.getDisplayTitle()).map((e) => e[1]), ["p. 6"], "Z, in the default file, bare");
            assert.strictEqual(wv._wvBlChip({ ref: "link" }, X, P), "→ annotation p. 2 (" + A.getDisplayTitle() + ")", "the chip follows");
        }
        finally {
            if (picked) { try { await wv._wvClearDefaultChild(A2); } catch (e) {} }
            if (Z) await wvT.erase(Z);
            await wvT.erase(A2);
            await wvT.waitFor(() => !wv._wvBlDirect(P2).some((s) => Z && s.srcID === Z.id), 10000);
        }
    });

    // MJT 2026-11-03, after three tries at a kind mark in the row ("Can you
    // try adding the z or " to the arrows for links and backlinks?",
    // dev.162-167): "The arrows are still not clear. Go back to the old
    // design, except that you will use the zotero links color on the arrows
    // for Zotero links and backlinks, while keeping white for the Note
    // Citations" -- the full arrow again, a Zotero link's in the Zotero
    // links' colour, a note citation's in the arrow's grey; and "Try
    // removing the vertical line so that the arrows get shifted left" -- a
    // heading's rows start under its icon, no guide line. FAILED on dev.161
    // (the guide, every arrow grey) and on dev.169 (the marks).
    it("a row's arrow is the full arrow, coloured by the reference's kind; a heading's rows start under its icon, with no guide line", async function () {
        const h = host();
        wv._wvLkRenderBody(h, P, doc);
        const nHead = [...h.querySelectorAll(".wv-bl-hgroup")].find((g) => g.querySelector(".wv-count-group-title").textContent === N.getDisplayTitle());
        assert.isOk(nHead, "N's group");
        const nRows = [...nHead.querySelectorAll(":scope > .wv-bl-row")];
        assert.deepEqual(nRows.map((r) => r.querySelector(".wv-bl-arrow").dataset.mark), ["zotero", "cite", "cite", "cite"], "N's rows: a Zotero link, a citation, a quote, a citation");
        assert.isNull(h.querySelector(".wv-bl-arrow-mark"), "no mark glyph in the cell");
        const arrow = nRows[0].querySelector(".wv-bl-arrow");
        assert.deepEqual([...arrow.querySelectorAll("svg > path")].map((p) => p.getAttribute("d")), ["M7.5 1V9.5H12", "M15 9.5L12 7V12Z"], "the full arrow, stem and head");
        assert.closeTo(arrow.getBoundingClientRect().width, 16, 0.5, "its 16-px cell");
        // The colours, against probes: the Zotero links' (the colour the
        // address is written in, `.wv-url-span.wv-link-zotero`) and Zotero's
        // primary text colour for a note citation's -- the "white" MJT asked
        // for, full strength (MJT 2026-11-03, "The white and colored links
        // seem to be gray and full color" -> "Ok for your suggestion": until
        // 1.0.0-beta.2-dev.1 --fill-tertiary, white at 30%, read as grey).
        const probe = doc.createElementNS(XHTML, "span");
        probe.className = "wv-url-span wv-link-zotero";
        doc.documentElement.appendChild(probe);
        made.push(probe);
        const grey = doc.createElementNS(XHTML, "span");
        grey.style.color = "var(--fill-primary, #222)";
        doc.documentElement.appendChild(grey);
        made.push(grey);
        const colour = (el) => win.getComputedStyle(el).color;
        assert.notStrictEqual(colour(probe), colour(grey), "the two probes differ");
        assert.strictEqual(colour(arrow), colour(probe), "a Zotero link's arrow in the Zotero links' colour");
        assert.strictEqual(colour(nRows[1].querySelector(".wv-bl-arrow")), colour(grey), "a citation's arrow in the primary text colour");
        assert.strictEqual(colour(nRows[2].querySelector(".wv-bl-arrow")), colour(grey), "a quote's too");
        const icon = nHead.querySelector(".wv-count-group-head").firstElementChild;
        assert.closeTo(arrow.getBoundingClientRect().left, icon.getBoundingClientRect().left, 1, "the arrow starts under the heading's icon");
        assert.strictEqual(win.getComputedStyle(nRows[0], "::before").content, "none", "no guide line");
        // Backlinks too, on their up arrows: P3's, the window's level filter
        // widened so its own (N's citation) and its annotation Y's (N's
        // quote) are listed under their headings, each row hung by an arrow
        // (its own rows alone stood without an arrow until dev.171).
        const hb = host();
        const bf = wv._wvScopeFilterFor(win, "backlinks");
        const savedInc = bf.inc.slice();
        bf.inc = [];
        try { wv._wvBlRenderBody(hb, P3, doc, "section"); }
        finally { bf.inc = savedInc; }
        const arrows = [...hb.querySelectorAll(".wv-bl-arrow")];
        assert.isAbove(arrows.length, 0, "Backlinks rows with an arrow");
        assert.deepEqual(arrows.map((a) => a.dataset.dir), arrows.map(() => "up"), "...all up");
        assert.isTrue(arrows.every((a) => a.dataset.mark === "zotero" || a.dataset.mark === "cite"), "...a Zotero link or a note citation each");
        // The Links arrow traced backwards, the head on top of the stem, on
        // the target's side (MJT 2026-11-04; backlinks.spec.js holds the
        // red-on-dev.4 check).
        assert.deepEqual([...arrows[0].querySelectorAll("svg > path")].map((p) => p.getAttribute("d")), ["M15 9.5H7.5V4", "M7.5 1L5 4H10Z"], "the full up arrow: the Links line backwards, the head on top");
        for (const a of arrows) assert.strictEqual(colour(a), colour(a.dataset.mark === "zotero" ? probe : grey), "a Backlinks arrow coloured by its kind: " + a.dataset.mark);
    });

    // MJT 2026-11-03, once the arrows took the reference's colour: "I think
    // that it is better to keep the "This item" header even when there is
    // only the parent item selected, because the links color now add another
    // information. It is not needed for Tags and Related, so that it stays
    // closer to the native design." The item's own rows alone -- a paper's
    // Backlinks with nothing aimed at its parts, a note's or an annotation's
    // Links -- come under "This item", each row keeping its arrow in its
    // kind's colour; the count popups draw as the section. (From dev.119 to
    // dev.171 those rows stood alone, no heading, no arrow, where Zotero's
    // Related rows sit; Tags and Related keep that: pane-scope.spec.js.)
    // FAILED on dev.171.
    it("the item's own rows alone keep the This item heading and their coloured arrows, in the section and its popups", function () {
        const probe = doc.createElementNS(XHTML, "span");
        probe.className = "wv-url-span wv-link-zotero";
        doc.documentElement.appendChild(probe);
        made.push(probe);
        const zc = win.getComputedStyle(probe).color;
        const look = (h, what, dir) => {
            const groups = [...h.querySelectorAll(".wv-bl-hgroup")];
            assert.deepEqual(groups.map((g) => g.querySelector(":scope > .wv-count-group-head .wv-count-group-title").textContent), ["This item"], what + ": one heading, This item");
            const rs = rows(h);
            assert.isAbove(rs.length, 0, what + ": rows");
            assert.isTrue(rs.every((r) => r.parentElement === groups[0]), what + ": every row under it");
            const arrows = rs.map((r) => r.querySelector(".wv-bl-arrow"));
            assert.isTrue(arrows.every((a) => a && a.dataset.dir === dir), what + ": each row its " + dir + " arrow");
            return arrows.map((a) => [a.dataset.mark, win.getComputedStyle(a).color === zc]);
        };
        // Backlinks: P2 is linked by N and X, both Zotero links.
        const hb = host();
        assert.strictEqual(wv._wvBlRenderBody(hb, P2, doc), 2);
        assert.deepEqual(look(hb, "P2's Backlinks", "up"), [["zotero", true], ["zotero", true]], "in the Zotero links' colour");
        const hbp = host();
        wv._wvBlRenderBody(hbp, P2, doc, "own");
        look(hbp, "P2's Backlinks popup, an open row's", "up");
        // Links: N writes a Zotero link, a citation, a quote, a citation of
        // its own paper.
        const hn = host();
        assert.strictEqual(wv._wvLkRenderBody(hn, N, doc), 4);
        assert.deepEqual(look(hn, "N's Links", "down"), [["zotero", true], ["cite", false], ["cite", false], ["cite", false]], "the Zotero link's arrow coloured, the citations' not");
        for (const scope of ["own", "subtree"]) look((() => { const h = host(); wv._wvLkRenderBody(h, N, doc, scope); return h; })(), "N's Links popup, " + scope, "down");
        // An annotation's Links: X's (its gone link greyed or hidden, as the
        // broken count says).
        const hx = host();
        wv._wvLkRenderBody(hx, X, doc);
        look(hx, "X's Links", "down");
    });

    // MJT 2026-10-30 ("I propose: Ok"): a file the reader cannot open -- a
    // Word file, a spreadsheet, a text file -- holds no annotation, so it
    // leaves no doubt which file an annotation is in. Only the files Zotero
    // annotates (PDF, EPUB, HTML: item.js attachmentReaderType) make a paper
    // "have several". Until dev.128 any file counted. FAILED on dev.128.
    it("only the files the reader annotates make an annotation name its file", async function () {
        const path = PathUtils.join(PathUtils.tempDir, "wvlk-supp-" + Date.now() + ".txt");
        await IOUtils.writeUTF8(path, "WV-TEST supplementary material");
        let F = null, H = null, W = null;
        try {
            F = await Zotero.Attachments.importFromFile({ file: Zotero.File.pathToFile(path), parentItemID: P3.id });
            assert.isTrue(F.isFileAttachment(), "a second file under P3");
            assert.strictEqual(wv._wvBlChip({ ref: "quote" }, Y, P3), "→ annotation p. 4", "a text file beside the PDF: the chip stays bare");
            const line = (a, withFile) => { const e = wv._wvBlEnd(doc, a, "", withFile); return [e.file || "", e.chip || ""]; };
            assert.deepEqual(line(Y), ["", "p. 4"], "...and so does the row's line: its page only");
            H = await wvT.createTestSnapshotItem("wvlk-snap", { parentItemID: P3.id });
            // A snapshot beside the PDF: Y, in the PDF -- the default
            // attachment -- stays bare (2026-11-02); an annotation in the
            // snapshot names it.
            assert.strictEqual(wv._wvGetBestAttachmentSync(P3).id, A3.id, "the PDF is P3's default attachment");
            assert.strictEqual(wv._wvBlChip({ ref: "quote" }, Y, P3), "→ annotation p. 4", "a snapshot beside it: Y, in the default file, still bare");
            assert.deepEqual(line(Y), ["", "p. 4"]);
            // A snapshot annotation: Zotero validates its sort index (8
            // digits) and position (a CSS selector) per attachment type
            // (item.js 'sortIndex'), so not the PDF helper's shape.
            W = /** @type {any} */ (new Zotero.Item("annotation"));
            W.libraryID = H.libraryID;
            W.parentID = H.id;
            W.annotationType = "highlight";
            W.annotationText = "snapshot words";
            W.annotationColor = "#ffd400";
            W.annotationPageLabel = "1";
            W.annotationSortIndex = "00000001";
            W.annotationPosition = JSON.stringify({ type: "CssSelector", value: "body", refinedBy: { type: "TextPositionSelector", start: 0, end: 14 } });
            await W.saveTx();
            assert.strictEqual(wv._wvBlChip({ ref: "quote" }, W, P3), "→ annotation p. 1 (" + H.getDisplayTitle() + ")", "an annotation in the snapshot names it");
            assert.deepEqual(line(W), [H.getDisplayTitle(), "p. 1"], "...on this item's line too, before the page");
            assert.deepEqual(line(W, false), ["", "p. 1"], "the other end's line: never the file");
        }
        finally {
            await wvT.erase(W, F, H);
            try { await IOUtils.remove(path); } catch (e) {}
        }
    });

    it("the header reads 0 when only broken rows remain, and the section stays open for them", async function () {
        const Sb = await note("WVLK only broken", "Into zotero://select/groups/" + GROUP + "/items/" + GONE + " only.");
        try {
            await wvT.waitFor(() => wv._wvLkOut(Sb).length === 1, 10000);
            const sec = doc.createXULElement("collapsible-section");
            const body = doc.createElementNS(XHTML, "div");
            body.className = "wv-lk-body";
            sec.appendChild(body);
            doc.documentElement.appendChild(sec);
            made.push(sec);
            const args = [];
            const setL10nArgs = (a) => args.push(a);
            wv._wvLkHookRender({ body, item: Sb, doc, setL10nArgs });
            // The title counts the resolved links; the broken one has its own
            // count beside it (the links spec's header test; MJT 2026-10-30
            // -- from dev.72 to dev.120 the title read "0 Links · 1 broken").
            assert.deepEqual(args, [JSON.stringify({ count: 0 })], "nothing counted");
            assert.isFalse(sec.hasAttribute("empty"), "not greyed: the broken row is there to show");
            assert.strictEqual(body.querySelectorAll(".wv-lk-broken").length, 1, "shown by default");
            await withBroken(-1, () => wv._wvLkRenderBody(body, Sb, doc));
            assert.strictEqual(body.querySelectorAll(".wv-lk-broken").length, 0, "hidden on demand");
            wv._wvLkHookRender({ body, item: T, doc, setL10nArgs });
            assert.deepEqual(args[1], JSON.stringify({ count: 0 }));
            assert.isTrue(sec.hasAttribute("empty"), "a note with no reference: greyed and closed");
            await wv._wvLkHookAsyncRender({ body, item: null, doc, setL10nArgs });
            assert.deepEqual(args.length, 2, "a render with no item leaves the count alone");
            // What Fluent makes of it in this window (weavero.ftl is linked).
            const label = async (a) => { const [m] = await doc.l10n.formatMessages([{ id: "weavero-links-header", args: a }]); return m.attributes.find((x) => x.name === "label").value; };
            assert.strictEqual(await label({ count: 3 }), "3 Item Links");
            assert.strictEqual(await label({ count: 1 }), "1 Item Link");
        }
        finally { await wvT.erase(Sb); }
    });

    // MJT 2026-10-27, "I need full context of the source and the target":
    // the card shows both lineages side by side -- SOURCE on the left, climbed
    // from its paper (paper › file › annotation, paper › note, or a standalone
    // item alone) down to the reference itself with its excerpt; TARGET on the
    // right, climbed the same way, or why it is broken. FAILED on dev.65.
    it("the hover card shows the source's and the target's whole lineage side by side, also on keyboard focus; Esc closes it", async function () {
        // An inactive window gets no focus events, and the runner's is never
        // raised: activate it first (collections-pane-toggle.spec.js). The
        // test passed or failed with whatever the previous spec left active.
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) { win.focus(); await new Promise((r) => win.setTimeout(r, 100)); }
        const texts = (side) => [...card().querySelectorAll('[data-side="' + side + '"] .wv-bl-card-node-main')].map((e) => e.textContent);
        // Under both columns, the card's full width (MJT 2026-10-28; the
        // Backlinks twin in backlinks-context.spec.js checks the width).
        const refOf = () => card().querySelector(":scope > .wv-bl-card-ref");
        const h = host();
        wv._wvLkRenderBody(h, N, doc);
        const [lnk, , quo] = rows(h);
        quo.focus();
        const c = await wvT.waitFor(() => { const x = card(); return x && !x.hidden ? x : null; }, 3000);
        // Opaque: Zotero's --material-menu is translucent on the dark theme
        // and the rows showed through (MJT 2026-10-27, "The hover card is
        // transparent. I cannot read it."). FAILED on dev.62.
        const bg = win.getComputedStyle(c).backgroundColor;
        const m = bg.match(/^rgba?\(([^)]+)\)$/);
        const alpha = m && m[1].split(",").length === 4 ? parseFloat(m[1].split(",")[3]) : 1;
        assert.strictEqual(alpha, 1, "the card's background is opaque: " + bg);
        assert.isOk(c, "the card opens on focus");
        // The arrow runs from the note the reference is written in (the
        // source's leaf) to the quoted annotation (the target's leaf), not
        // between the two papers (MJT 2026-10-27, "The arrow should go from
        // the place where the link is to its target"). FAILED on dev.66.
        const svg = c.querySelector("svg.wv-bl-card-arrow");
        assert.isOk(svg, "source → target, drawn");
        const d = svg.querySelector("path").getAttribute("d");
        // Out of the source's line, an S inside the gap, along the target's
        // line: never over the other column's text (MJT 2026-10-27, "avoid
        // that the arrow overlaps with the text"). FAILED on dev.70 (a plain
        // curve between the two points).
        const pm = d.match(/^M([\d.-]+),([\d.-]+) L([\d.-]+),[\d.-]+ C[\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+) L([\d.-]+),([\d.-]+)$/);
        assert.isOk(pm, "line, S, line: " + d);
        const C = c.getBoundingClientRect();
        const colS = c.querySelector('[data-side="source"]').getBoundingClientRect(), colT = c.querySelector('[data-side="target"]').getBoundingClientRect();
        const leafS = [...c.querySelectorAll('[data-side="source"] .wv-bl-card-node')].pop().querySelector(".wv-bl-card-node-main").getBoundingClientRect();
        const leafT = [...c.querySelectorAll('[data-side="target"] .wv-bl-card-node')].pop().querySelector(".wv-bl-kind").getBoundingClientRect();
        assert.closeTo(+pm[2], leafS.top - C.top + leafS.height / 2, 2, "starts level with the source's note");
        assert.closeTo(+pm[7], leafT.top - C.top + leafT.height / 2, 2, "ends level with the target's annotation");
        assert.isAbove(+pm[6], +pm[1], "left to right");
        assert.isAtLeast(+pm[3], colS.right - C.left - 0.5, "the S starts past the source column");
        assert.isAtMost(+pm[4], colT.left - C.left + 0.5, "...and ends before the target column");
        assert.deepEqual(texts("target"), ["WVLK cited three", A3.getDisplayTitle(), "Page 4"], "the target climbed: paper › file › annotation");
        assert.include(c.querySelector('[data-side="target"]').textContent, "quoted words", "the quoted annotation's text");
        // Drawn as Zotero draws a highlight -- a bar in the annotation's
        // colour, the text in the normal colour, no quotes (reader
        // preview.js `.blockquote-border`; MJT 2026-10-28). FAILED on dev.86.
        const hlT = c.querySelector('[data-side="target"] .wv-bl-card-node-hl');
        assert.strictEqual(hlT && hlT.textContent, "quoted words", "the target annotation's text, as a highlight");
        assert.strictEqual(win.getComputedStyle(hlT).borderInlineStartColor, "rgb(255, 212, 0)");
        assert.deepEqual(texts("source"), ["WVLK paper", "WVLK child note"], "the source climbed: paper › note");
        assert.match(refOf().textContent, /^Note citation — annotation p\. 4/, "the reference closes the source column");
        assert.isOk(refOf().querySelector(".wv-bl-hit"), "the reference highlighted in its excerpt");
        quo.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        assert.isTrue(card().hidden, "Esc closes it");
        lnk.focus();
        await wvT.waitFor(() => !card().hidden, 3000);
        assert.deepEqual(texts("target"), ["WVLK target two"], "a paper alone");
        assert.match(refOf().textContent, /^Zotero link — Show in library/);
        assert.isNull(card().querySelector(".wv-bl-card-broken-x"), "a resolved link's arrow: no cross");
        assert.isNull(card().querySelector(".wv-bl-card-rel-icon"), "...nor the Related icon: a link goes one way");
        lnk.blur();
        // A broken reference: the target column says why; the source is still climbed.
        const hx = host();
        // The broken row, shown (the default).
        await withBroken(0, () => wv._wvLkRenderBody(hx, X, doc));
        const broken = hx.querySelector(".wv-bl-row.wv-lk-broken");
        broken.focus();
        await wvT.waitFor(() => !card().hidden, 3000);
        const tcol = card().querySelector('[data-side="target"]');
        assert.include(tcol.textContent, "Item not found");
        // A red cross on the broken link's arrow (MJT 2026-10-30, "Make a red
        // cross on the broken link line in the popup"), halfway along it, in
        // Zotero's red (the header's broken count's).
        const x = card().querySelector("svg.wv-bl-card-arrow .wv-bl-card-broken-x");
        assert.isOk(x, "the cross on the arrow");
        assert.isNull(card().querySelector(".wv-bl-card-ref-mark"), "the cross alone there, not the kind's icon (2026-11-02)");
        const red = doc.createElementNS(XHTML, "span");
        red.style.color = "var(--accent-red, #db2c3a)";
        card().appendChild(red);
        assert.strictEqual(win.getComputedStyle(x).color, win.getComputedStyle(red).color, "in Zotero's red");
        red.remove();
        // On the S across the columns' gap: inside the arrow's span, clear of
        // both its start and its head.
        const arrowBox = card().querySelector("svg.wv-bl-card-arrow > path").getBBox(), xBox = x.getBBox();
        const xc = xBox.x + xBox.width / 2, yc = xBox.y + xBox.height / 2;
        assert.isAbove(xc, arrowBox.x + 8, "clear of the arrow's start");
        assert.isBelow(xc, arrowBox.x + arrowBox.width - 8, "clear of its head");
        assert.isAtLeast(yc, arrowBox.y - 0.5, "on the arrow's height");
        assert.isAtMost(yc, arrowBox.y + arrowBox.height + 0.5);
        assert.include(tcol.textContent, GONE, "the address as written");
        assert.deepEqual(texts("source"), ["WVLK paper", A.getDisplayTitle(), "Page 2"], "paper › file › annotation");
        // The source annotation's comment is the reference block, not a
        // sub-line as well (MJT 2026-10-27, "The link context is displayed
        // twice ... Is it necessary?"). FAILED on dev.69.
        const subS = [...card().querySelectorAll('[data-side="source"] .wv-bl-card-node-sub')].map((e) => e.textContent);
        const hlS = card().querySelector('[data-side="source"] .wv-bl-card-node-hl');
        assert.strictEqual(hlS && hlS.textContent, "linking words", "the annotated text stays on the node, as a highlight");
        assert.deepEqual(subS.filter((s) => s.startsWith("comment:")), [], "the comment only in the reference block");
        assert.include(refOf().textContent, "See zotero://", "...which shows it");
        broken.blur();
    });

    // MJT 2026-11-02, "Can you find a format where the parent item is not
    // repeated? Maybe put it above the Source / Target headers?" -> "Every
    // shared parent": what both ends share -- the paper, the file too when
    // both are in it -- is drawn once above the two columns, and each column
    // goes on from there. FAILED on dev.136. An end that IS the shared item
    // (a note linking to its own paper) goes up there too, its column empty,
    // the arrow climbing to its title through the gap between the columns
    // ("Arrow to the top title, but arrow stays on the left side of the
    // target"; dev.137 kept the paper in both columns). FAILED on dev.137.
    it("the hover card draws what both ends share once, above the two columns", async function () {
        for (let i = 0; i < 30 && Services.focus.activeWindow !== win; i++) { win.focus(); await new Promise((r) => win.setTimeout(r, 100)); }
        const texts = (side) => [...card().querySelectorAll('[data-side="' + side + '"] .wv-bl-card-node-main')].map((e) => e.textContent);
        const shared = () => [...card().querySelectorAll(".wv-bl-card-shared .wv-bl-card-node-main")].map((e) => e.textContent);
        const open = async (row) => { row.focus(); return wvT.waitFor(() => (card() && !card().hidden) || null, 3000); };
        const M = await note("WVLK same paper", "To zotero://open/library/items/" + A.key + "?annotation=" + X.key + " and back to zotero://select/library/items/" + P.key + " here.", P.id);
        try {
            await wvT.waitFor(() => wv._wvLkOut(M).filter((r) => r.target).length === 2, 10000);
            const h = host();
            await withScope("links", true, () => wv._wvLkRenderBody(h, M, doc));
            const to = (it) => rows(h).find((r) => r._wvLkRow && r._wvLkRow.target && r._wvLkRow.target.id === it.id);
            assert.isOk(await open(to(X)), "the card of the link to X");
            assert.deepEqual(shared(), ["WVLK paper"], "the paper, once");
            assert.deepEqual(texts("source"), ["WVLK same paper"], "the source goes on from it");
            assert.deepEqual(texts("target"), [A.getDisplayTitle(), "Page 2"], "...and the target");
            const sh = card().querySelector(".wv-bl-card-shared").getBoundingClientRect();
            for (const lab of card().querySelectorAll(".wv-bl-card-side")) assert.isAtMost(sh.bottom, lab.getBoundingClientRect().top + 0.5, "above the SOURCE / TARGET headers");
            assert.isOk(card().querySelector("svg.wv-bl-card-arrow"), "the arrow, drawn");
            to(X).blur();
            assert.isOk(await open(to(P)), "the card of the link to its own paper");
            assert.deepEqual(shared(), ["WVLK paper"], "the target IS the paper: above, once");
            assert.deepEqual(texts("target"), [], "...its column empty");
            assert.deepEqual(texts("source"), ["WVLK same paper"]);
            {
                const c = card(), C = c.getBoundingClientRect();
                const path = c.querySelector("svg.wv-bl-card-arrow > path");
                const pts = path.getAttribute("d").match(/-?[\d.]+,-?[\d.]+/g).map((p) => p.split(",").map(Number));
                const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
                const title = c.querySelector(".wv-bl-card-shared .wv-bl-card-node-main").getBoundingClientRect();
                const leaf = c.querySelector('[data-side="source"] .wv-bl-card-node-main').getBoundingClientRect();
                const colT = c.querySelector('[data-side="target"]').getBoundingClientRect();
                assert.closeTo(y1, leaf.top - C.top + leaf.height / 2, 2, "from the note");
                assert.closeTo(y2, title.top - C.top + title.height / 2, 2, "...up to the paper's title");
                assert.isAtLeast(x2, title.right - C.left, "...at its end, clear of its text");
                assert.isAtLeast(x1, leaf.right - C.left, "out of the note's line end");
                const bb = path.getBBox();
                assert.isAtMost(bb.x + bb.width, colT.left - C.left + 0.5, "through the gap, never into the other column");
            }
            to(P).blur();
            // Backlinks on X: the same card, the target left.
            const hb = host();
            wv._wvBlRenderBody(hb, X, doc, "section");
            const brow = rows(hb).find((r) => r._wvBlSrcID === M.id);
            assert.isOk(await open(brow), "the Backlinks row's card");
            assert.deepEqual(shared(), ["WVLK paper"]);
            assert.deepEqual(texts("target"), [A.getDisplayTitle(), "Page 2"]);
            assert.deepEqual(texts("source"), ["WVLK same paper"]);
            brow.blur();
        }
        finally { await wvT.erase(M); }
    });

    // Links plan §4 (approved 2026-10-27; slice 4, 2026-10-28): a Better
    // Notes link carries a position -- `?line=N` (its line index) or
    // `?section=Name` -- that BN's own Outbound Links shows as "Line N" /
    // "#Name" (BN fork, workspace/link.ts). The chip says it too: after
    // "→ note" for a child note, alone for a note that is its own owner (a
    // standalone note, and a note's own Backlinks). FAILED on dev.79.
    it("a Better Notes link's line or section shows in the chip, in Links and in Backlinks", async function () {
        const C = await note("WVLK child target", "sections here", P2.id);
        const B = await note("WVLK bn links", '<a href="zotero://note/u/' + T.key + '/?line=3">a line</a> and <a href="zotero://note/u/' + C.key + '/?section=Methods%20A">a section</a>.');
        try {
            await wvT.waitFor(() => wv._wvLkOut(B).filter((r) => r.target).length === 2, 10000);
            assert.deepEqual(wv._wvLkOut(B).map((r) => wv._wvLkChip(r)), ["→ line 3", "→ note #Methods A"], "Links: standalone T, then C under P2");
            const onT = wv._wvBlDirect(T).find((e) => e.srcID === B.id);
            assert.strictEqual(wv._wvBlChip(onT, T, T), "→ line 3", "T's own Backlinks: the position alone");
            const onC = wv._wvBlDirect(C).find((e) => e.srcID === B.id);
            assert.strictEqual(wv._wvBlChip(onC, C, P2), "→ note #Methods A", "P2's Backlinks, the row aimed at its note");
            assert.strictEqual(wv._wvBlChip({ ref: "link", url: "zotero://select/library/items/" + T.key }, T, T), "", "no position: no chip, as before");
        }
        finally { await wvT.erase(B, C); }
    });

    it("a note target opens through openNote(id, {openInWindow:false}) in the row's window; Shift opens a note window", async function () {
        const h = host();
        wv._wvLkRenderBody(h, S, doc);
        const row = rows(h)[0];
        const zp = /** @type {any} */ (win.ZoteroPane), orig = zp.openNote;
        const calls = [];
        zp.openNote = (id, o) => { calls.push([id, !!(o && o.openInWindow)]); return Promise.resolve(null); };
        try {
            row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
            await wvT.waitFor(() => calls.length >= 1, 3000);
            row.dispatchEvent(new win.MouseEvent("click", { bubbles: true, shiftKey: true }));
            await wvT.waitFor(() => calls.length >= 2, 3000);
        }
        finally { zp.openNote = orig; }
        assert.deepEqual(calls, [[T.id, false], [T.id, true]]);
    });

    it("arrow keys, Home/End and Enter work as in Backlinks; Shift+Enter and a middle click ask for a new window", function () {
        const h = host();
        wv._wvLkRenderBody(h, N, doc);
        const stops = rows(h).filter((r) => !r.closest(".wv-bl-more"));
        const key = (el, k, extra) => el.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true }, extra || {})));
        stops[0].focus();
        key(stops[0], "ArrowDown");
        assert.strictEqual(doc.activeElement, stops[1], "down to the next row");
        key(stops[1], "ArrowDown");
        assert.strictEqual(doc.activeElement, stops[2]);
        // The last stop: N's citation of its own paper, in place (no fold
        // since 2026-10-30).
        key(stops[2], "End");
        assert.strictEqual(doc.activeElement, stops[3], "End: the last row");
        key(doc.activeElement, "Home");
        assert.strictEqual(doc.activeElement, stops[0]);
        const opened = [];
        wv._wvLkOpen = (r, opts) => { opened.push([r.target && r.target.id, !!(opts && opts.newWindow)]); return Promise.resolve(); };   // own property over the shared method
        try {
            key(stops[0], "Enter");
            stops[1].focus();
            key(stops[1], "Enter", { shiftKey: true });
            stops[2].dispatchEvent(new win.MouseEvent("auxclick", { bubbles: true, button: 1 }));
        }
        finally { delete wv._wvLkOpen; }
        assert.deepEqual(opened, [[P2.id, false], [P3.id, true], [Y.id, true]]);
        // (No collapsed row any more: the last, Links' broken links, gave way
        // to the header's broken count on 2026-10-30.)
    });

    it("selecting the paper in the library shows the section with its rows in the item pane", async function () {
        await win.ZoteroPane.selectItem(P.id);
        const n = await wvT.waitFor(() => {
            const sec = doc.querySelector('item-pane-custom-section[data-pane$="weavero-links"]');
            const k = sec ? sec.querySelectorAll(".wv-bl-row").length : 0;
            return k > 0 ? k : null;
        }, 15000);
        assert.strictEqual(n, 6, "N's four (its citation of P included) and X's two, its broken one shown by default");
    });

    // Each link is one row of two lines in the item pane (MJT 2026-10-29, "I
    // would like to have a compact design showing more clearly what part is
    // for the source of the link and what part is for the target" -> "Try one
    // line for the source and one line for the target"): first the item it is
    // written in, then, after an arrow, the item it points at -- one row, so
    // the card answers either line. Each line draws its item as Zotero's
    // Related section does (relatedBox.js: getCSSItemTypeIcon, the display
    // title; "you should use the same pattern as in the related section"),
    // then what the link adds: a citation's page, a page in a file. No
    // headings; the count popups keep theirs. Red on dev.95: headings, one
    // line a row.
    it("each link is a row under the heading of its section's own end, the other end on it after an arrow, as Related draws items", async function () {
        const outside = (h) => rows(h).filter((r) => !r.closest(".wv-bl-more"));
        const ends = (r) => [end(r, "from"), end(r, "to")];
        const nt = N.getDisplayTitle(), xt = X.getDisplayTitle(), yt = Y.getDisplayTitle();
        assert.strictEqual(yt, "“quoted words”", "an annotation's display title (item.js)");
        const h = host();
        // (X's broken link hidden: its row is the broken-links tests'.)
        assert.strictEqual(await withBroken(-1, () => wv._wvLkRenderBody(h, P, doc)), 5);
        assert.isNull(h.querySelector(".wv-bl-owner"), "Links: no popup headings");
        // The current item's end heads its links, named once, as the Tags and
        // Related sections head a part (MJT 2026-10-30, "Option (b)"; from
        // 2026-10-29 to dev.120 it was the first row's first line: "show the
        // current item ... as first line ... Just change the direction of
        // the link arrow"); each row its other end, the arrow kept. Links:
        // the source heads, the arrow down to the target; Backlinks: the
        // target heads, the arrow up from the source.
        const heads = (el) => [...el.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head .wv-count-group-title")].map((e) => e.textContent);
        assert.deepEqual(heads(h), [nt, wv._wvCountSourceLabel(X, P)], "N, then X");
        assert.deepEqual(outside(h).map(ends), [
            [null, ["WVLK target two", ""]],
            [null, ["WVLK cited three", "p. 7"]],
            [null, [yt, "p. 4"]],
            [null, ["WVLK paper", ""]],
            [null, ["WVLK target two", ""]],
        ], "Links: each row its target");
        for (const r of rows(h)) {
            assert.isOk(r.classList.contains("wv-bl-pair"), "a link's row");
            const a = r.querySelector(":scope > .wv-bl-to > .wv-bl-arrow:first-child");
            assert.isOk(a, "the target's line starts with the arrow");
            assert.strictEqual(a.dataset.dir, "down", "from the source above to it");
        }
        assert.isNull(h.querySelector(".wv-bl-refmark"), "no kind mark (MJT 2026-10-30, \"too much\")");
        const xr = outside(h)[4];
        assert.isOk(xr.parentElement.querySelector(":scope > .wv-count-group-head > .annotation-icon"), "each heading its item's icon: X, an annotation");
        assert.isNull(xr.querySelector(".wv-bl-to > .wv-bl-kind.annotation-icon"), "...and P2, a book");
        // Backlinks: P2 is linked by N and X, both written in P. Its own rows
        // alone, under "This item", each the item linking it with the arrow
        // up from it (MJT 2026-11-03, "keep the "This item" header even when
        // there is only the parent item selected"; from 2026-10-30 to dev.171
        // nothing named P2 and no arrow pointed at it).
        const hb = host();
        assert.strictEqual(wv._wvBlRenderBody(hb, P2, doc), 2);
        assert.isNull(hb.querySelector(".wv-bl-owner"), "Backlinks: no source headings");
        assert.deepEqual(heads(hb), ["This item"], "Backlinks: P2 under This item");
        assert.deepEqual(outside(hb).map(ends), [
            [[nt, ""], null],
            [[xt, "p. 2"], null],
        ], "Backlinks: its two sources, the annotation with its page");
        assert.lengthOf(hb.querySelectorAll(".wv-bl-arrow[data-dir='up']"), 2, "an arrow up on each row");
        assert.isTrue(rows(hb).every((r) => r.classList.contains("wv-bl-pair")));
        // P3: N cites it (its own row: the citation's page on the link's
        // line, the source's) and quotes its annotation Y. Widened, its own
        // rows under "This item", Y's under Y's heading (as the Tags and
        // Related sections head them), the arrow up from each source.
        // A line's page is its own, never the other end's (MJT 2026-11-02,
        // "For backlinks, the information that the annotation cited is on page
        // 3 is already contained in the annotation row above, so no need to
        // put that information on the notes. The page number should refer to
        // the current line only, not the other side of the link"): N's
        // citation of P3 at p. 7 puts no page on N's line (it did until
        // dev.142); the card's reference block still says "Note citation —
        // p. 7".
        const h3 = host();
        assert.strictEqual(wv._wvBlRenderBody(h3, P3, doc), 1);
        assert.deepEqual(heads(h3), ["This item"]);
        assert.deepEqual(outside(h3).map(ends), [[[nt, ""], null]]);
        const h3w = host();
        await withScope("backlinks", true, () => wv._wvBlRenderBody(h3w, P3, doc));
        assert.deepEqual(heads(h3w), ["This item", wv._wvCountSourceLabel(Y, P3)]);
        assert.deepEqual(rows(h3w).map(ends), [[[nt, ""], null], [[nt, ""], null]]);
        // An annotation linking to page 9 of P3's PDF: its own page, 3 (the
        // link's 9, alone, until dev.142). FAILED on dev.142.
        const W = await ann(A, "own page words", "3", "See zotero://open/library/items/" + A3.key + "?page=9 here.");
        try {
            await wvT.waitFor(() => wv._wvBlDirect(A3).some((s) => s.srcID === W.id) || null, 10000);
            const h3p = host();
            await withScope("backlinks", true, () => wv._wvBlRenderBody(h3p, P3, doc));
            const wr = rows(h3p).find((r) => r._wvBlSrcID === W.id);
            assert.isOk(wr, "W's row, under the PDF");
            assert.deepEqual(end(wr, "from"), [W.getDisplayTitle(), "p. 3"], "W's own page");
        }
        finally { await wvT.erase(W); }
        for (const r of rows(h3w)) {
            const a = r.querySelector(":scope > .wv-bl-from > .wv-bl-arrow:first-child");
            assert.isOk(a, "the source's line starts with the arrow");
            assert.strictEqual(a.dataset.dir, "up", "from it up to the target");
        }
        // The icons are Related's: each line its item's (X's an annotation's
        // in its colour).
        assert.isOk(outside(hb)[1].querySelector(".wv-bl-from > .wv-bl-kind.annotation-icon"), "the source's line: X's icon");
        // The count popups draw as the section (MJT 2026-11-02, "Keep the
        // same format as in the item pane"): its headings and its rows, no
        // source tree (until dev.147 a popup kept source headings two levels
        // deep, each on its guide, and one-line rows).
        const hp = host();
        wv._wvLkRenderBody(hp, P, doc, "subtree");
        assert.isOk(hp.querySelector(".wv-bl-hgroup > .wv-count-group-head"), "the section's headings");
        assert.isTrue(rows(hp).every((r) => r.classList.contains("wv-bl-pair")), "...and its rows");
        assert.isNull(hp.querySelector(".wv-bl-owner, .wv-bl-src"), "no source tree");
    });

    // MJT 2026-10-29 (screenshot: Related's "ink test — https://doi.org/…"
    // carries a coloured, clickable link; the same title in Backlinks is
    // plain): "Links in Links and Backlinks should be clickable and in the
    // appropriate color". A line's title is marked as the Related section's
    // labels are (pane.ts _processRelatedBoxes: _markTextLinks, "tree"
    // mode): a link span in its kind's colour, opened on the press by the
    // main window's link handler -- not the row's own target. Red on dev.96.
    // (Links' source lines became headings, the Tags and Related sections'
    // kind, on 2026-10-30; the row checked is Backlinks' line naming X.)
    it("a link inside a row's title is coloured and clickable, as in the Related section, and opens itself, not the row", function () {
        const h = host();
        wv._wvBlRenderBody(h, P2, doc);
        const xr = rows(h).find((r) => r._wvBlSrcID === X.id);
        const url = "zotero://select/library/items/" + P2.key;
        const href = (s) => (s.getAttribute("data-href") || s.textContent).trim();
        const sp = xr.querySelector(".wv-bl-from .wv-bl-end-main .wv-url-span");
        assert.isOk(sp, "X's comment link, marked: " + xr.querySelector(".wv-bl-from").textContent);
        assert.strictEqual(href(sp), url);
        assert.isOk(sp.classList.contains("wv-link-zotero"), "a Zotero link's class");
        const probe = doc.createElementNS(XHTML, "span");
        probe.className = "wv-url-span wv-link-zotero";
        doc.documentElement.appendChild(probe);
        made.push(probe);
        assert.strictEqual(win.getComputedStyle(sp).color, win.getComputedStyle(probe).color, "in the Zotero links' colour");
        assert.strictEqual(end(xr, "from")[0], X.getDisplayTitle(), "the title's text unchanged");
        const calls = [], opened = [];
        wv.handleZoteroURI = (u) => { calls.push(u); return Promise.resolve(); };   // own properties over the shared methods
        wv._wvBlOpenSource = (r) => { opened.push(r); return Promise.resolve(); };
        try {
            sp.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, button: 0 }));
            sp.dispatchEvent(new win.MouseEvent("click", { bubbles: true, button: 0 }));
        }
        finally { delete wv.handleZoteroURI; delete wv._wvBlOpenSource; }
        assert.deepEqual(calls, [url], "the press opened the link");
        assert.lengthOf(opened, 0, "the row did not open its source");
        // A Links row's target line is marked the same way (P's links to
        // P2: its title holds no link, so the marking is checked by class).
        const hl = host();
        wv._wvLkRenderBody(hl, P, doc);
        assert.isOk(rows(hl).every((r) => r.querySelector(".wv-bl-to .wv-bl-end-main")), "each Links row has its title line to mark");
    });

    // The rows take Zotero's own row geometry (MJT 2026-10-28, screenshot:
    // "The indentation should be consistent with the native indentation in
    // the Related section"): a row's box, its source's icon and text sit
    // where a native row's do -- the Notes section's here, whose rows share
    // Related's CSS (_notesBox.scss); the target's line hangs under it, the
    // arrow under the icon, the target's icon under the source's text.
    // Offsets are taken from each section's own header title, as measured in
    // this run. Red on dev.93: the icon 12 px left of the native one.
    it("the sections indent as Zotero's Related rows: the source's line level with a native row, the target's hung under it", async function () {
        const det = () => doc.querySelector("#zotero-item-pane item-details");
        const L = (el) => el.getBoundingClientRect().left;
        const from = (el) => L(el) - L(el.closest("collapsible-section").querySelector(".head .title"));
        await win.ZoteroPane.selectItem(P.id);
        const nat = await wvT.waitFor(() => { const b = det() && det().querySelector("notes-box .body .row .box"); return b && b.querySelector(".icon") && b.querySelector(".label") ? b : null; }, 15000);
        const box = from(nat), icon = from(nat.querySelector(".icon")), label = from(nat.querySelector(".label"));
        // Links: the source's heading where a native row sits, as the Tags
        // and Related headings do (MJT 2026-10-30, "Option (b)"); its rows at
        // the heading's own place, each starting with the arrow under the
        // heading's icon, the kind mark, then the target's icon and text
        // (2026-11-03, MJT "Try removing the vertical line so that the arrows
        // get shifted left"; dev.123-161: one 16-px step in, on a guide).
        const lk = await wvT.waitFor(() => det().querySelector('item-pane-custom-section[data-pane$="weavero-links"] .wv-bl-hgroup > .wv-bl-row'), 15000);
        const head = lk.parentElement.querySelector(":scope > .wv-count-group-head");
        assert.closeTo(from(head), box, 0.5, "Links: the heading's box");
        assert.closeTo(from(head.firstElementChild), icon, 0.5, "Links: the heading's icon");
        assert.closeTo(from(head.querySelector(".wv-count-group-title")), label, 0.5, "Links: the heading's text");
        const t = lk.querySelector(":scope > .wv-bl-to");
        assert.closeTo(from(lk), box, 0.5, "Links: the row at the heading's place");
        const arrow = t.querySelector(".wv-bl-arrow");
        assert.closeTo(from(arrow), icon, 0.5, "Links: the arrow under the heading's icon");
        assert.closeTo(from(t.querySelector(".wv-bl-kind")), icon + arrow.getBoundingClientRect().width + 4, 0.5, "Links: the target's icon after the arrow and its mark");
        assert.strictEqual(win.getComputedStyle(lk, "::before").content, "none", "Links: no guide");
        // Backlinks, P2's own rows alone (the default filter): under "This
        // item", laid out as the Links rows -- the heading where a native row
        // sits, each row one line, the item linking it, its arrow under the
        // heading's icon (MJT 2026-11-03, "keep the "This item" header even
        // when there is only the parent item selected"; from 2026-10-30 to
        // dev.171 the rows sat at a native row's place, no heading, no arrow;
        // until dev.118 P2's line led them).
        await win.ZoteroPane.selectItem(P2.id);
        const bls = await wvT.waitFor(() => { const r = [...det().querySelectorAll('item-pane-custom-section[data-pane$="weavero-backlinks"] .wv-bl-hgroup > .wv-bl-row')]; return r.length >= 2 ? r : null; }, 15000);
        const bh = bls[0].parentElement.querySelector(":scope > .wv-count-group-head");
        assert.strictEqual(bh.querySelector(".wv-count-group-title").textContent, "This item");
        assert.closeTo(from(bh.firstElementChild), icon, 0.5, "Backlinks: the heading's icon where a native row's is");
        for (const r of bls) {
            assert.lengthOf(r.querySelectorAll(":scope > .wv-bl-end"), 1, "Backlinks: one line a row");
            const f = r.firstElementChild;
            assert.isOk(f.classList.contains("wv-bl-from"), "...the source's");
            assert.closeTo(from(r), box, 0.5, "Backlinks: the row at the heading's place");
            const a = f.querySelector(".wv-bl-arrow");
            assert.isOk(a, "Backlinks: the arrow");
            assert.closeTo(from(a), icon, 0.5, "Backlinks: the arrow under the heading's icon");
            assert.closeTo(from(f.querySelector(".wv-bl-kind")), icon + a.getBoundingClientRect().width + 4, 0.5, "Backlinks: the source's icon after the arrow");
        }
    });

    // MJT 2026-10-30, "Why the icons on the right disappear when I toggle the
    // annotations?": dev.121's headings lacked `contain: inline-size`, and a
    // long annotation heading ("Annotation p. 1 (Full Text PDF …)") set the
    // Links section's minimum width to 1053 px in a 410-px pane -- the
    // header's end counts, the headings' counts and the rows' U-turns out of
    // view. A heading is one line, cut, as a row's line is (dev.52).
    it("a long heading never widens the item pane: one line, cut", async function () {
        const LN = await note("WVLK " + "very long heading words ".repeat(20), "See zotero://select/library/items/" + P2.key + " here.", P.id);
        const lnID = LN.id;
        try {
            await wvT.waitFor(() => wv._wvLkOut(LN).length === 1 || null, 10000);
            const box = doc.createElementNS(XHTML, "div");
            box.style.cssText = "position:fixed;left:0;top:0;width:min-content;";
            const h = doc.createElementNS(XHTML, "div");
            h.className = "wv-lk-body";
            box.appendChild(h);
            doc.documentElement.appendChild(box);
            made.push(box);
            wv._wvBlEnsureStyle(doc);
            await withScope("links", true, () => wv._wvLkRenderBody(h, P, doc));
            assert.isOk([...h.querySelectorAll(".wv-bl-hgroup .wv-count-group-title")].some((e) => /very long heading/.test(e.textContent)), "the long heading drawn");
            assert.isBelow(box.getBoundingClientRect().width, 250, "the heading does not set the width");
        }
        finally {
            await wvT.erase(LN);
            await wvT.waitFor(() => !wv._wvBlDirect(P2).some((s) => s.srcID === lnID) || null, 10000);
        }
    });

    it("an edited note updates without a rebuild; a trashed source drops out and comes back", async function () {
        const E = await note("WVLK edited", "One zotero://select/library/items/" + P2.key + " two zotero://select/library/items/" + P3.key + ".");
        try {
            await wvT.waitFor(() => wv._wvLkOut(E).length === 2, 10000);
            E.setNote("<p>Only zotero://select/library/items/" + P3.key + " now.</p>");
            await E.saveTx({ skipSelect: true });
            await wvT.waitFor(() => wv._wvLkOut(E).length === 1 && wv._wvLkOut(E)[0].target.id === P3.id, 10000);
            E.deleted = true; await E.saveTx();
            await wvT.waitFor(() => wv._wvLkOut(E).length === 0, 10000);
            E.deleted = false; await E.saveTx();
            await wvT.waitFor(() => wv._wvLkOut(E).length === 1, 10000);
        }
        finally { await wvT.erase(E); }
    });

    // Links plan slice 3 (MJT 2026-10-28: the name "Has Item Links", in the
    // library and the reader filters): the items-list chip mirrors Has
    // Backlinks -- a row that carries a resolved reference itself is
    // primary, a tree is in when the Links column would show a number for
    // it -- and is dormant while the Links switch is off. FAILED on dev.78.
    it("the Has Item Links chip: primary for a note or annotation that links an item, tree-level for its family, dormant while the Links pref is off", async function () {
        const dim = wv._wvFilterDims().find((d) => d.id === "hasItemLinks");
        assert.isOk(dim, "a filter dimension");
        assert.strictEqual(dim.chip, "Has Item Links");
        assert.strictEqual(dim.shape, "tri");
        assert.isNull(wv._emptyFilterGroup().hasItemLinks, "off by default");
        const g = Object.assign(wv._emptyFilterGroup(), { hasItemLinks: true });
        assert.isTrue(wv._rowIsPrimary(N, { groups: [g] }), "N links P2, cites P3, quotes Y");
        assert.isTrue(wv._rowIsPrimary(X, { groups: [g] }), "X links P2 (its broken one aside)");
        assert.isFalse(wv._rowIsPrimary(P, { groups: [g] }), "the paper carries none itself");
        assert.isFalse(wv._rowIsPrimary(P2, { groups: [g] }), "a target is not a source");
        assert.isTrue(wv._treeSatisfiesCrossLevelScoped(A, g), "A's tree (P) has Links");
        assert.isFalse(wv._treeSatisfiesCrossLevelScoped(P2, g), "P2's tree has none");
        assert.isTrue(wv._treeSatisfiesCrossLevelScoped(S, g), "S links note T");
        const gx = Object.assign(wv._emptyFilterGroup(), { hasItemLinks: false });
        assert.isTrue(wv._rowIsPrimary(P2, { groups: [gx] }), "exclude: P2 counts");
        assert.isFalse(wv._treeSatisfiesCrossLevelScoped(A, gx), "exclude: P's tree is out");
        assert.isTrue(wv._isGroupActive(g), "the chip is set");
        await wvT.withPref("weavero.enableLinks", false, async () => {
            assert.isFalse(wv._isGroupActive(g), "dormant: the selection is kept but counts as unset");
        });
        // The switch also unregistered the section; it registers again after
        // the removal notice lands (a deferred step) -- leave it as found.
        await wvT.waitFor(() => (((/** @type {any} */ (Zotero.ItemPaneManager).customSectionData || {}).options) || [])
            .some((o) => /weavero-links$/.test(String(o.paneID))), 5000);
    });

    it("the section registers as weavero-links, follows its pref, and leaves nothing after shutdown", async function () {
        const registered = () => {
            const d = /** @type {any} */ (Zotero.ItemPaneManager).customSectionData;
            return ((d && d.options) || []).some((o) => /weavero-links$/.test(String(o.paneID)));
        };
        assert.isTrue(registered(), "registered while the pref is on");
        await wvT.withPref("weavero.enableLinks", false, async () => {
            wv._wvLkApplySectionPref();
            await wvT.waitFor(() => !registered(), 5000);
            assert.isFalse(registered(), "off with its pref");
        });
        wv._wvLkApplySectionPref();
        await wvT.waitFor(() => registered(), 5000);
        wv._wvLkDestroy();
        assert.isFalse(registered(), "shutdown unregisters it");
        assert.isNull(doc.getElementById("wv-links-menu"), "and leaves no menu behind");
        wv._wvLkInit();
        await wvT.waitFor(() => registered(), 5000);
        assert.isTrue(registered(), "init registers it again");
    });

    it("the Links section sits above Backlinks in the item pane, also once its pref brings it back", async function () {
        // The item pane appends plugin sections in registration order and a
        // re-registered one lands last (MJT 2026-10-27, "The links section
        // should be above the backlinks"). Red on dev.75: Backlinks first.
        const order = () => {
            const det = doc.querySelector("item-details");
            const ids = det ? [...det.querySelectorAll("item-pane-custom-section[data-pane]")].map((e) => String(e.dataset.pane)) : [];
            return { lk: ids.findIndex((id) => /weavero-links$/.test(id)), bl: ids.findIndex((id) => /weavero-backlinks$/.test(id)) };
        };
        const above = () => { const o = order(); return o.lk >= 0 && o.bl >= 0 && o.lk < o.bl ? true : null; };
        assert.isTrue(await wvT.waitFor(above, 8000), "after init: " + JSON.stringify(order()));
        await wvT.withPref("weavero.enableLinks", false, async () => {
            wv._wvLkApplySectionPref();
            await wvT.waitFor(() => (order().lk < 0 ? true : null), 8000);
        });
        wv._wvLkApplySectionPref();
        await wvT.waitFor(() => (order().lk >= 0 ? true : null), 8000);
        assert.isTrue(await wvT.waitFor(above, 8000), "after its pref toggle: " + JSON.stringify(order()));
    });
});
