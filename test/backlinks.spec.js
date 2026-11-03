/* global describe, it, before, after, assert, Zotero, wvT */

// Backlinks (issue #60, 2026-10-22): "what links here" for an item, derived
// from the zotero:// links found in annotation comments and notes. The
// index is in memory only (the links are plain Zotero data; backlinks are a
// view over them), built on first use, kept fresh by the item notifier.
// Three consumers read it: the item-pane section, the Backlinks column and
// the Has Backlinks chip. Written before the code (the feature skill's
// check-first rule); every `it` below fails on 0.22.3-dev.3.

describe("Weavero — backlinks index, section, column and chip", function () {
    this.timeout(90000);
    let wv, win, ZP, iv, rp, P1, P2, A1, A2, X1, N2, C2, S1, SA, lib;
    const made = [];

    const mkAnn = async (att, i, comment, type) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = type || "highlight";
        if (a.annotationType === "highlight") a.annotationText = "backlink fixture text " + i;
        a.annotationColor = "#ffd400";
        a.annotationComment = comment || "";
        a.annotationSortIndex = "00000|00000" + i + "|00000";
        a.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[10, 10 + i * 20, 60, 20 + i * 20]] });
        await a.saveTx();
        return a;
    };
    const ids = (list) => list.map(s => s.srcID).sort((a, b) => a - b);

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvBlEnsure", "_wvBlDirect", "_wvBlCount", "_wvBlRenderBody", "_wvBlRegisterSection", "_wvBlIndexSource",
            "_wvBlDestroy", "_wvBlInit", "_wvBlEnsureFtl"]) wvT.method(m);
        win = Zotero.getMainWindow(); ZP = win.ZoteroPane; iv = ZP.itemsView; rp = iv.rowProvider;
        lib = Zotero.Libraries.userLibraryID;
        P1 = await wvT.createItem("journalArticle", { title: "WVBL P1 target" });
        P2 = await wvT.createItem("book", { title: "WVBL P2 target and source" });
        A1 = await wvT.createTestPDFItem("wvbl-a1", { parentItemID: P1.id });
        A2 = await wvT.createTestPDFItem("wvbl-a2", { parentItemID: P2.id });
        X1 = await mkAnn(A1, 1, "");                       // a target (?annotation= form)
        // C2: an item note under P2 with an href link to P1 and one to a key
        // no item has (broken: never a backlink). Until dev.108 the second
        // was a link to its own parent P2, then dropped as a self link; a
        // link inside its own item, to itself included, is an internal link
        // now, counted (backlinks-context.spec.js, MJT 2026-10-29).
        C2 = new Zotero.Item("note"); C2.libraryID = lib; C2.parentID = P2.id;
        C2.setNote('<p>See <a href="zotero://select/library/items/' + P1.key + '">P1</a> and the gone <a href="zotero://select/library/items/WVBLG0NE">gone</a>.</p>');
        await C2.saveTx();
        // S1: a standalone note with the multi-key form and Better Notes' form.
        S1 = new Zotero.Item("note"); S1.libraryID = lib;
        S1.setNote("<p>Both: zotero://select/library/items?itemKey=" + P1.key + "," + P2.key + " and the note zotero://note/u/" + C2.key + "/?line=0</p>");
        await S1.saveTx();
        // N2: an annotation on A2 whose comment links P1 by its NUMERIC id
        // (the legacy form) and X1 through the attachment's open link.
        N2 = await mkAnn(A2, 2, "legacy zotero://select/library/items/" + P1.id + " and zotero://open/library/items/" + A1.key + "?page=1&annotation=" + X1.key);
        SA = await wvT.createTestPDFItem("wvbl-sa");       // standalone, no links at all
        made.push(P1, P2, S1, SA);
        await ZP.collectionsView.selectLibrary(lib);
        await iv.waitForLoad();
        await wv._wvBlEnsure();
    });

    after(async function () {
        try { wv._clearAllFilters(); } catch (e) {}
        await wvT.erase(...made);
    });

    it("the index sees every link form in the three sources", async function () {
        const d1 = wv._wvBlDirect(P1);
        assert.deepEqual(ids(d1), ids([{ srcID: C2.id }, { srcID: S1.id }, { srcID: N2.id }]), "P1: the item note (href), the standalone note (multi-key), the annotation (numeric id)");
        const kinds = {}; for (const s of d1) kinds[s.srcID] = s.kind;
        assert.strictEqual(kinds[C2.id], "itemNote");
        assert.strictEqual(kinds[S1.id], "standaloneNote");
        assert.strictEqual(kinds[N2.id], "annotation");
        assert.deepEqual(ids(wv._wvBlDirect(P2)), [S1.id], "P2: the standalone note only");
        assert.deepEqual(ids(wv._wvBlDirect(X1)), [N2.id], "the annotation named by ?annotation= is a target");
        assert.deepEqual(ids(wv._wvBlDirect(C2)), [S1.id], "Better Notes' zotero://note form names the note");
        assert.deepEqual(ids(wv._wvBlDirect(SA)), [], "nothing links the standalone attachment");
        const s1 = wv._wvBlDirect(P1).find(s => s.srcID === S1.id);
        assert.isOk(s1 && s1.excerpt && /Both/.test(s1.excerpt.before), "an excerpt carries the text around the link");
    });

    // MJT 2026-10-23: "Better show the links as they appear in the original
    // place. You can highlight it in some way" -- the excerpt read
    // "⟨link⟩ zotero://…", an invented marker plus the link's own label cut
    // short. Now: every link as written (a note link by its label, a bare URL
    // in full), the one pointing HERE highlighted like a search hit.
    it("an excerpt shows the links as written in their source, the matching one marked", function () {
        const c2 = wv._wvBlDirect(P1).find(s => s.srcID === C2.id);
        const segs = (c2 && c2.excerpt && c2.excerpt.segs) || [];
        const hits = segs.filter(s => s.hit);
        assert.strictEqual(hits.length, 1, "one matched link");
        assert.strictEqual(hits[0].t, "P1", "a note link shows its label, not its address");
        assert.strictEqual(hits[0].href, "zotero://select/library/items/" + P1.key);
        const other = segs.find(s => !s.hit && s.href);
        assert.isOk(other && other.t === "gone", "the note's other link keeps its label and stays a link");
        assert.notMatch(segs.map(s => s.t).join(""), /zotero:\/\/…|⟨link⟩/, "nothing shortened, nothing invented");
        const s1 = wv._wvBlDirect(P1).find(s => s.srcID === S1.id);
        const h1 = ((s1 && s1.excerpt && s1.excerpt.segs) || []).find(s => s.hit);
        assert.isOk(h1, "the bare URL is the match");
        assert.match(h1.t, /^zotero:\/\/select\/library\/items\?itemKey=/, "a bare URL shows in full, as written");
        // Drawn where the excerpt is shown, the hover card (rows carry none:
        // the section's since dev.77, the count popups' since they draw as
        // it, MJT 2026-11-02).
        const doc = win.document;
        const body = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        body.style.cssText = "position:fixed;left:10px;top:10px;width:360px;";
        doc.documentElement.appendChild(body);
        try {
            wv._wvBlRenderBody(body, P1, doc, "own");
            wv._wvBlCardShow([...body.querySelectorAll(".wv-bl-row")].find(r => r._wvBlSrcID === C2.id));
            const txt = doc.querySelector("#wv-bl-card .wv-bl-card-text");
            assert.include([...txt.querySelectorAll(".wv-bl-hit")].map(e => e.textContent), "P1", "the label is the highlighted text");
            assert.isNull(txt.querySelector(".wv-bl-mark"), "no marker");
            assert.isOk(txt.querySelector(".wv-bl-link.wv-link-zotero:not(.wv-bl-hit)"), "the other links are drawn as links");
        }
        finally { body.remove(); doc.getElementById("wv-bl-card").hidden = true; }
    });

    it("a shortened excerpt keeps each link whole or drops it, never a fragment", async function () {
        // Long links on both sides of the match, past the excerpt's reach:
        // cut, they read "otero.org" / "zotero://select/libra" (dev.16).
        const full = ["https://www.zotero.org/support/kb/a-rather-long-path-segment-for-the-cut",
                      "https://example.com/another/rather/long/path/that/crosses/the/edge"];
        const S3 = new Zotero.Item("note"); S3.libraryID = lib;
        S3.setNote("<p>" + "alpha ".repeat(40) + "see " + full[0] + " and zotero://select/library/items/" + P1.key
            + " then " + full[1] + " " + "omega ".repeat(40) + "</p>");
        await S3.saveTx();
        const s3id = S3.id;
        try {
            const src = await wvT.waitFor(() => wv._wvBlDirect(P1).find(s => s.srcID === s3id), 10000);
            assert.isOk(src, "indexed");
            const links = src.excerpt.segs.filter(s => s.href && !s.hit);
            for (const s of links) assert.include(full, s.t, "a whole link, not a piece: " + s.t);
            const txt = src.excerpt.segs.map(s => s.t).join("");
            assert.match(txt, /^… /, "the cut side says so");
            assert.notMatch(txt, /\balph\b|\balp\b|\bomeg\b/, "no half word at a cut edge");
        }
        finally {
            // The later tests count P1's sources: leave none of ours behind.
            await S3.eraseTx();
            await wvT.waitFor(() => !wv._wvBlDirect(P1).some(s => s.srcID === s3id), 10000);
        }
        // The length limit falling inside a word: a long link right after
        // the match leaves room for a few characters of " Collection link:
        // ...", which dev.17 kept as "Collecti …" (the link is as long as
        // the after-side allows minus 9, whatever that limit is).
        const N4 = await mkAnn(A2, 4, "x zotero://select/library/items/" + P1.key + " https://example.com/" + "p".repeat(wvT.plugin()._wvBlExcerptAfter() - 29) + " Collection link: more words here");
        const n4id = N4.id;
        try {
            const src = await wvT.waitFor(() => wv._wvBlDirect(P1).find(s => s.srcID === n4id), 10000);
            const t = src.excerpt.segs.map(x => x.t).join("");
            assert.notInclude(t, "Collecti", "no half word before the ellipsis: " + t);
            assert.match(t, /p …$/, "the whole link, then the ellipsis");
        }
        finally {
            await N4.eraseTx();
            await wvT.waitFor(() => !wv._wvBlDirect(P1).some(s => s.srcID === n4id), 10000);
        }
    });

    // MJT 2026-10-23: "The annotations in the items list do not have the
    // column information. So need to add an icon at the end of the line."
    // Zotero draws an annotation row as a title cell plus one comment cell,
    // so no column cell exists there.
    it("an annotation row carries a Backlinks icon at its end while the column is shown, which lists what links it", async function () {
        // The icon stands in for the column's cell: it follows whether the
        // Backlinks column is shown in this tree (Weavero's columns start
        // hidden; the column picker shows them).
        const C = iv.tree._columns;
        const ci = C._columns.findIndex((c) => /weaveroBacklinks$/.test(String(c.dataKey)));
        assert.isAtLeast(ci, 0, "the Backlinks column is in the tree");
        const wasHidden = !!C._columns[ci].hidden;
        const iconOf = () => {
            for (const row of win.document.querySelectorAll("#zotero-items-tree .annotation-row")) {
                const it = wv._getItemFromTreeRow(row);
                if (it && it.id === X1.id) return row.querySelector(".wv-tree-bl-icon") || false;
            }
            return null;
        };
        try {
            if (wasHidden) C.toggleHidden(ci);
            await ZP.selectItems([X1.id]);
            const icon = await wvT.waitFor(() => iconOf() || null, 15000);
            assert.isOk(icon, "the linked annotation's row has the icon");
            assert.strictEqual(icon.title, "1 Backlink");
            // The item pane's card for the selected annotation carries the
            // same icon, after Related (MJT 2026-10-23: "Same backlink icon
            // in the item pane").
            const paneBtn = await wvT.waitFor(() => {
                for (const r of win.document.querySelectorAll("annotation-row")) {
                    if (r.annotation && r.annotation.id === X1.id) return wv._qsDeep(r, ".wv-btn-backlinks");
                }
                return null;
            }, 15000);
            assert.isOk(paneBtn, "the item pane's annotation card has the Backlinks button");
            assert.strictEqual(paneBtn.title, "1 Backlink");
            icon.click();
            const p = await wvT.waitFor(() => { const e = win.document.getElementById("weavero-panel"); return e && e.style.display === "block" ? e : null; }, 3000);
            assert.isOk(p, "the click opens the backlinks list");
            assert.match(p.querySelector(".wv-relations-header-title").textContent, /^1 Backlink$/);
            assert.strictEqual(p.querySelectorAll(".wv-bl-row").length, 1, "N2, the annotation that links it");
            p.style.display = "none";
            C.toggleHidden(ci);
            const gone = await wvT.waitFor(() => iconOf() === false ? true : null, 15000);
            assert.isOk(gone, "the column hidden: no icon on the row");
        }
        finally {
            if (!!C._columns[ci].hidden !== wasHidden) C.toggleHidden(ci);
        }
    });

    // MJT 2026-10-28, "Same also for links" -> "Add a Links button": an
    // annotation's row carries a Links icon while the Links column is shown
    // and its item-pane card a Links button, each just before the Backlinks
    // one; either opens the annotation's Links popup, laid out as an item's.
    it("an annotation's row and its item-pane card carry a Links icon, which lists what it links", async function () {
        const C = iv.tree._columns;
        const ci = C._columns.findIndex((c) => /weaveroLinks$/.test(String(c.dataKey)));
        assert.isAtLeast(ci, 0, "the Links column is in the tree");
        const wasHidden = !!C._columns[ci].hidden;
        const rowOf = () => {
            for (const row of win.document.querySelectorAll("#zotero-items-tree .annotation-row")) {
                const it = wv._getItemFromTreeRow(row);
                if (it && it.id === N2.id) return row;
            }
            return null;
        };
        const iconOf = () => { const r = rowOf(); return r ? (r.querySelector(".wv-tree-lk-icon") || false) : null; };
        assert.strictEqual(wv._wvLkOwnCount(N2), 2, "N2's comment links P1 (numeric id) and X1");
        try {
            if (wasHidden) C.toggleHidden(ci);
            await ZP.selectItems([N2.id]);
            const icon = await wvT.waitFor(() => iconOf() || null, 15000);
            assert.isOk(icon, "N2's row has the Links icon");
            assert.strictEqual(icon.title, "2 Item Links");
            const paneBtn = await wvT.waitFor(() => {
                for (const r of win.document.querySelectorAll("annotation-row")) {
                    if (r.annotation && r.annotation.id === N2.id) return wv._qsDeep(r, ".wv-btn-links");
                }
                return null;
            }, 15000);
            assert.isOk(paneBtn, "the item pane's annotation card has the Links button");
            assert.strictEqual(paneBtn.title, "2 Item Links");
            icon.click();
            const p = await wvT.waitFor(() => { const e = win.document.getElementById("weavero-panel"); return e && e.style.display === "block" ? e : null; }, 3000);
            assert.isOk(p, "the click opens the Links list");
            assert.match(p.querySelector(".wv-relations-header-title").textContent, /^2 Item Links$/);
            // As its section: an annotation's own rows under "This item" (MJT
            // 2026-11-02, "Keep the same format as in the item pane"; the
            // section's own rows alone keep the heading since 2026-11-03, none
            // from dev.148 to dev.171).
            assert.deepEqual([...p.querySelectorAll(".wv-lk-body .wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "under This item");
            assert.isNull(p.querySelector(".wv-lk-body .wv-bl-owner"), "no source tree");
            assert.strictEqual(p.querySelectorAll(".wv-lk-row").length, 2);
            p.style.display = "none";
            C.toggleHidden(ci);
            const gone = await wvT.waitFor(() => iconOf() === false ? true : null, 15000);
            assert.isOk(gone, "the column hidden: no icon on the row");
        }
        finally {
            if (!!C._columns[ci].hidden !== wasHidden) C.toggleHidden(ci);
        }
    });

    // Backlinks part 2 (MJT 2026-10-28, "Backlinks part 2" / "Ok"; design
    // report "Backlinks and related context display": the counts go on the
    // children they count). A file's row in the Attachments section shows
    // the links aimed at the file or at its annotations -- the number its
    // collapsed items-list row shows -- beside Zotero's annotation count.
    it("an attachment's row in the Attachments section carries its backlinks count, kept current", async function () {
        const d = win.document;
        const rowOf = (att) => [...d.querySelectorAll("#zotero-item-pane attachment-row")].find(r => r.attachment && r.attachment.id === att.id) || null;
        const badgeOf = (att) => { const r = rowOf(att); return r ? r.querySelector(".wv-att-bl-btn") : null; };
        const label = (b) => b && b.querySelector(".label") ? b.querySelector(".label").textContent : null;
        // Zotero draws a section's rows once it is in view (attachmentsBox.js
        // asyncRender): the pane may be pinned further down.
        const showAttachments = () => { try { d.querySelector("#zotero-item-pane item-details").scrollToPane("attachments", "instant"); } catch (e) {} };
        await ZP.selectItems([P1.id]);
        showAttachments();
        const b1 = await wvT.waitFor(() => badgeOf(A1), 15000);
        assert.isOk(b1, "A1's row: its annotation X1 is linked");
        assert.strictEqual(label(b1), "1");
        assert.strictEqual(b1.title, "1 Backlink");
        assert.strictEqual(b1.previousElementSibling, rowOf(A1).querySelector(".annotation-btn"), "right after Zotero's annotation count");
        const S5 = new Zotero.Item("note"); S5.libraryID = lib;
        S5.setNote("<p>the file zotero://open/library/items/" + A1.key + "</p>");
        await S5.saveTx();
        try {
            const b2 = await wvT.waitFor(() => { const b = badgeOf(A1); return label(b) === "2" ? b : null; }, 10000);
            assert.isOk(b2, "a link to the file itself counts too, with no reselection");
            assert.strictEqual(b2.title, "2 Backlinks");
            b2.click();
            const p = await wvT.waitFor(() => { const e = d.getElementById("weavero-panel"); return e && e.style.display === "block" ? e : null; }, 3000);
            assert.isOk(p, "a click opens the list");
            assert.match(p.querySelector(".wv-relations-header-title").textContent, /^2 Backlinks$/);
            assert.deepEqual([...p.querySelectorAll(".wv-bl-hgroup > .wv-count-group-head .wv-count-group-title")].map(e => e.textContent),
                ["This item", X1.getDisplayTitle()], "as the widened section: the file's own link, then its annotation's, by Zotero's title for it");
            p.style.display = "none";
        }
        finally { await S5.eraseTx(); }
        assert.isOk(await wvT.waitFor(() => label(badgeOf(A1)) === "1" || null, 10000), "back to 1 once that note is gone");
        wv._getEnableBacklinks = () => false;   // own property over the prototype getter
        try {
            wv._wvBlDecorateAttRows(d);
            assert.isNull(badgeOf(A1), "the Backlinks switch off: no badge");
        }
        finally { delete wv._getEnableBacklinks; wv._wvBlDecorateAttRows(d); }
        assert.isOk(badgeOf(A1), "switched back on");
        // Nothing links A2 or its annotation N2.
        await ZP.selectItems([P2.id]);
        showAttachments();
        assert.isOk(await wvT.waitFor(() => rowOf(A2), 15000), "A2's row is drawn");
        assert.isNull(badgeOf(A2), "no badge at zero, as Zotero hides its annotation count at zero");
    });

    // Reader parity (same request): the reader's annotation cards and the
    // annotation popup in the PDF carry a Backlinks button after Related, as
    // the item pane's annotation cards have since 2026-10-23 -- and a Links
    // button just before it (MJT 2026-10-28, "Same also for links" -> "Add a
    // Links button"). Their popups open in the window holding the reader,
    // laid out as an item's ("The popup for annotations backlinks should be
    // the same as for items").
    it("in the reader, an annotation's card and its popup carry the Links and Backlinks buttons, kept current", async function () {
        // X3 links P2 and is linked by nothing (until S6 below).
        const X3 = await mkAnn(A1, 3, "see zotero://select/library/items/" + P2.key);
        const x3id = X3.id;
        const reader = await wvT.openReaderTab(A1.id);
        try {
            // The annotations sidebar open (ann-list-filter.spec.js does the same).
            try { reader._internalReader.toggleSidebar(true); } catch (e) {}
            try { reader._internalReader.setSidebarView("annotations"); } catch (e) {}
            const idoc = reader._iframeWindow.document;
            const cardOf = (a) => idoc.querySelector('[data-sidebar-annotation-id="' + a.key + '"]');
            const btnOf = (a, kind) => { const c = cardOf(a); return c ? c.querySelector(".wv-btn-" + kind) : null; };
            const panelOpen = () => wvT.waitFor(() => { const e = win.document.getElementById("weavero-panel"); return e && e.style.display === "block" ? e : null; }, 3000);
            const where = () => {
                const out = {};
                for (const [k, d] of [["main", win.document], ["reader", idoc]]) {
                    const e = d.getElementById("weavero-panel");
                    out[k] = e ? e.style.display + ":" + ((e.querySelector(".wv-relations-header-title") || {}).textContent || "") : null;
                }
                return JSON.stringify(out);
            };
            assert.isOk(await wvT.waitFor(() => cardOf(X1), 20000), "X1's card is drawn");
            const bl = await wvT.waitFor(() => btnOf(X1, "backlinks"), 10000);
            assert.isOk(bl, "X1's card: N2 links it");
            assert.strictEqual(bl.title, "1 Backlink");
            assert.isNull(btnOf(X1, "links"), "X1's comment links nothing: no Links button");
            assert.isOk(await wvT.waitFor(() => cardOf(X3), 10000), "X3's card is drawn");
            const lk = await wvT.waitFor(() => btnOf(X3, "links"), 10000);
            assert.isOk(lk, "X3's card: its comment links P2");
            assert.strictEqual(lk.title, "1 Item Link");
            assert.isNull(btnOf(X3, "backlinks"), "nothing links X3: no Backlinks button");
            bl.click();
            let p = await panelOpen();
            assert.isOk(p, "the click opens the list in the window holding the reader " + (p ? "" : where()));
            assert.match(p.querySelector(".wv-relations-header-title").textContent, /^1 Backlink$/);
            // As its section: an annotation's own rows under "This item" (MJT
            // 2026-11-02 and 2026-11-03; no heading from dev.148 to dev.171).
            assert.deepEqual([...p.querySelectorAll(".wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "under This item, as its section");
            assert.isNull(p.querySelector(".wv-bl-part"), "no by-part popup");
            assert.strictEqual(p.querySelectorAll(".wv-bl-row").length, 1, "N2");
            p.style.display = "none";
            lk.click();
            p = await panelOpen();
            assert.isOk(p, "the Links button opens its list " + (p ? "" : where()));
            assert.match(p.querySelector(".wv-relations-header-title").textContent, /^1 Item Link$/);
            assert.deepEqual([...p.querySelectorAll(".wv-lk-body .wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "under This item, as its section");
            assert.isNull(p.querySelector(".wv-lk-body .wv-bl-owner"), "no source tree");
            assert.strictEqual(p.querySelectorAll(".wv-lk-row").length, 1, "P2");
            p.style.display = "none";
            // A link written elsewhere changes no annotation of this reader:
            // the card still follows, the Links button stays first.
            const S6 = new Zotero.Item("note"); S6.libraryID = lib;
            S6.setNote("<p>see zotero://open/library/items/" + A1.key + "?annotation=" + X3.key + "</p>");
            await S6.saveTx();
            try {
                const b3 = await wvT.waitFor(() => btnOf(X3, "backlinks"), 10000);
                assert.isOk(b3, "X3 gets its Backlinks button once a note links it");
                assert.strictEqual(b3.title, "1 Backlink");
                assert.strictEqual(btnOf(X3, "links").nextElementSibling, b3, "[links][backlinks]");
                // The popup in the PDF is Zotero's PopupPreview: no custom
                // sections, Weavero injects into its header -- after Related,
                // before the ⋯ button. Its comment pass must not take either
                // button for a comment icon and drop it.
                const pop = idoc.createElement("div");
                pop.className = "view-popup annotation-popup";
                pop.innerHTML = '<div class="preview"><header><div class="start"></div><div class="end"><button class="more"></button></div></header>'
                    + '<div class="comment"><div class="content" id="' + X3.key + '"></div></div></div>';
                idoc.body.appendChild(pop);
                try {
                    wv._injectIconIntoPopup(pop, reader);
                    const end = pop.querySelector("header .end");
                    assert.deepEqual([...end.children].map(e => e.classList.contains("wv-btn-links") ? "links" : e.classList.contains("wv-btn-backlinks") ? "backlinks" : e.classList.contains("more") ? "more" : e.className),
                        ["links", "backlinks", "more"], "after Related, before ⋯");
                    assert.strictEqual(end.querySelector(".wv-btn-links").title, "1 Item Link");
                    assert.strictEqual(end.querySelector(".wv-btn-backlinks").title, "1 Backlink");
                    wv._injectIconIntoPopup(pop, reader);
                    assert.strictEqual(pop.querySelectorAll(".wv-btn-links, .wv-btn-backlinks").length, 2, "a second pass adds none");
                }
                finally { pop.remove(); }
            }
            finally { await S6.eraseTx(); }
            assert.isOk(await wvT.waitFor(() => btnOf(X3, "backlinks") ? null : true, 10000), "gone with that note");
        }
        finally {
            wvT.closeReaderTab(reader);
            await X3.eraseTx();
            // The later tests count P2's sources: leave none of X3's behind.
            await wvT.waitFor(() => !wv._wvBlDirect(P2).some(s => s.srcID === x3id) || null, 10000);
        }
    });

    // MJT 2026-10-23: "Still seeing the wrong icon color" -- the section's
    // annotation icons drew black: Zotero's icon carries the colour as
    // `style.fill`, which needs -moz-context-properties to reach the SVG.
    it("an annotation's icon in the section keeps the annotation's colour", function () {
        wv._wvBlEnsureStyle(win.document);
        const body = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        win.document.documentElement.appendChild(body);
        try {
            wv._wvBlRenderBody(body, P1, win.document);
            const ic = body.querySelector(".wv-bl-kind.annotation-icon");
            assert.isOk(ic, "N2's row shows Zotero's annotation icon");
            assert.include(win.getComputedStyle(ic).getPropertyValue("-moz-context-properties"), "fill", "the fill reaches the SVG");
            assert.isOk(ic.style.fill, "carrying the annotation's colour");
        }
        finally { body.remove(); }
    });

    // MJT 2026-10-23: "When I open the backlink to where it is cited when it
    // is in a note, can it highlight the link in the note? What does
    // Obsidian do?" -> "OK": open the note scrolled to the link, flash it.
    it("opening a note backlink scrolls to its link in the note and flashes it", async function () {
        const src = wv._wvBlDirect(P1).find(s => s.srcID === C2.id);
        assert.isOk(src, "C2 links P1");
        await wv._wvBlOpenSource(C2, src);
        const tabID = win.Zotero_Tabs.getTabIDByItemID(C2.id);
        try {
            assert.isOk(tabID, "the note opened in a tab");
            const ed = win.document.getElementById(tabID).querySelector("note-editor");
            const iwin = ed && ed._editorInstance && ed._editorInstance._iframeWindow;
            const flash = await wvT.waitFor(() => iwin && iwin.document.querySelector(".wv-bl-flash"), 5000);
            assert.isOk(flash, "the flash layer is there");
            const a = [...iwin.document.querySelectorAll(".primary-editor a[href]")].find(x => x.getAttribute("href") === src.url);
            assert.isOk(a, "the link in the note");
            const ar = a.getBoundingClientRect(), fr = flash.firstElementChild.getBoundingClientRect();
            assert.isOk(fr.left <= ar.left && fr.right >= ar.right && fr.top <= ar.top && fr.bottom >= ar.bottom, "the flash covers the link");
            assert.isNull(iwin.document.querySelector(".primary-editor .wv-bl-flash"), "drawn outside the note's own content");
        }
        finally { if (tabID) win.Zotero_Tabs.close(tabID); }
    });

    // MJT 2026-10-28, "Do one row per written link": the same target linked
    // twice in one note was one row -- the second mention's words and page
    // were dropped, and a click opened the note at the first. Every written
    // reference is its own row now; a click opens the note at THAT one; an
    // anchor whose label spells its address out is still one link.
    it("each written link is its own row, with its own context and page; opening one goes to that one", async function () {
        const sel = "zotero://select/library/items/" + P1.key;
        const pdf = (p) => "zotero://open-pdf/library/items/" + A1.key + "?page=" + p;
        const S7 = new Zotero.Item("note"); S7.libraryID = lib;
        S7.setNote("<p>First mention " + sel + " here.</p><p>Second mention " + sel + " there.</p>"
            + '<p>Anchored <a href="' + sel + '">' + sel + "</a>.</p>"
            + '<p>Pages <a href="' + pdf(3) + '">p. 3</a> and <a href="' + pdf(7) + '">p. 7</a>.</p>');
        await S7.saveTx();
        const s7id = S7.id;
        let tabID = null;
        try {
            const mine = await wvT.waitFor(() => { const l = wv._wvBlDirect(P1).filter(s => s.srcID === s7id); return l.length ? l : null; }, 10000);
            assert.strictEqual((mine || []).length, 3, "P1: two typed mentions and the anchor -- its address-as-label not a fourth");
            mine.sort((a, b) => a.at - b.at);
            assert.deepEqual(mine.map(s => s.nth), [0, 1, 2], "numbered in the note's order");
            assert.match(mine[0].excerpt.before, /First mention/);
            assert.match(mine[1].excerpt.before, /Second mention/, "the second row has its own words");
            const pages = wv._wvBlDirect(A1).filter(s => s.srcID === s7id).map(s => s.page).sort();
            assert.deepEqual(pages, ["3", "7"], "two pages of one file: two rows");
            // Open the second mention: the flash sits on it, not on the first.
            await wv._wvBlOpenSource(S7, mine[1]);
            tabID = win.Zotero_Tabs.getTabIDByItemID(s7id);
            assert.isOk(tabID, "the note opened in a tab");
            const ed = win.document.getElementById(tabID).querySelector("note-editor");
            const iwin = ed && ed._editorInstance && ed._editorInstance._iframeWindow;
            const flash = await wvT.waitFor(() => iwin && iwin.document.querySelector(".wv-bl-flash"), 5000);
            assert.isOk(flash, "the flash layer is there");
            const para = [...iwin.document.querySelectorAll(".primary-editor p")].find(p => /Second mention/.test(p.textContent));
            assert.isOk(para, "the second paragraph");
            const tn = [...para.childNodes].find(n => n.nodeType === 3 && n.nodeValue.includes(sel));
            const r = iwin.document.createRange();
            if (tn) { const i = tn.nodeValue.indexOf(sel); r.setStart(tn, i); r.setEnd(tn, i + sel.length); }
            else r.selectNodeContents(para.querySelector("a") || para);
            const want = r.getClientRects()[0], got = flash.firstElementChild.getBoundingClientRect();
            assert.approximately(got.top, want.top, 3, "the flash is on the second mention's line");
            assert.approximately(got.left, want.left, 3, "and on the link itself");
        }
        finally {
            if (tabID) win.Zotero_Tabs.close(tabID);
            await S7.eraseTx();
            await wvT.waitFor(() => !wv._wvBlDirect(P1).some(s => s.srcID === s7id) || null, 10000);
        }
    });

    it("the count rolls the subtree up: links to the item, its children and their annotations", function () {
        assert.strictEqual(wv._wvBlCount(P1), 4, "P1: three direct + one on its annotation X1");
        assert.strictEqual(wv._wvBlCount(A1), 1, "A1: its annotation's backlink");
        assert.strictEqual(wv._wvBlCount(P2), 2, "P2: one direct + one on its note C2");
        assert.strictEqual(wv._wvBlCount(SA), 0);
    });

    it("an edited comment or note updates the index without a rebuild; a trashed source drops out and a restored one comes back", async function () {
        N2.annotationComment = "no links any more";
        await N2.saveTx();
        await wvT.waitFor(() => !wv._wvBlDirect(P1).some(s => s.srcID === N2.id), 10000);
        assert.deepEqual(ids(wv._wvBlDirect(X1)), [], "X1 lost its only source");
        N2.annotationComment = "back: zotero://select/library/items/" + P1.key;
        await N2.saveTx();
        await wvT.waitFor(() => wv._wvBlDirect(P1).some(s => s.srcID === N2.id), 10000);
        C2.deleted = true; await C2.saveTx();
        await wvT.waitFor(() => !wv._wvBlDirect(P1).some(s => s.srcID === C2.id), 10000);
        C2.deleted = false; await C2.saveTx();
        await wvT.waitFor(() => wv._wvBlDirect(P1).some(s => s.srcID === C2.id), 10000);
        assert.strictEqual(wv._wvBlCount(P1), 3, "after the edits: C2, S1, N2 on the item itself");
    });

    it("the section is registered through ItemPaneManager and renders rows grouped by source item", async function () {
        const data = /** @type {any} */ (Zotero.ItemPaneManager).customSectionData;
        const opts = (data && data.options) || [];
        const mine = opts.find(o => o.paneID === "weavero-backlinks" || /weavero-backlinks$/.test(String(o.paneID)));
        assert.isOk(mine, "the pane is registered");
        const body = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        const n = wv._wvBlRenderBody(body, P1, win.document);
        assert.strictEqual(n, 3, "three entries for P1");
        // The item's own; the links aimed at its children sit in the
        // collapsed `.wv-bl-more` row (backlinks-context.spec.js).
        const own = (sel) => [...body.querySelectorAll(sel)].filter(e => !e.closest(".wv-bl-more"));
        assert.sameMembers(own(".wv-bl-row").map(r => r.querySelector(".wv-bl-from .wv-bl-end-main").textContent),
            [C2, N2, S1].map(it => it.getDisplayTitle()), "each row names the item its link is written in: P2's note and annotation, the standalone note");
        assert.strictEqual(own(".wv-bl-row").length, 3);
        // The section's rows carry no excerpt and no annotated text: too
        // narrow to show anything useful (MJT 2026-10-27); the card keeps
        // them. FAILED on dev.76. The count popups' rows neither, since they
        // draw as the section (MJT 2026-11-02, "Keep the same format as in
        // the item pane"; their rows carried excerpts until dev.147).
        assert.isNull(body.querySelector(".wv-bl-excerpt"), "section rows: no excerpt");
        assert.isNull(body.querySelector(".wv-bl-ann-text"), "section rows: no annotated text");
        const pop = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        assert.strictEqual(wv._wvBlRenderBody(pop, P1, win.document, "own"), 3);
        assert.strictEqual(pop.querySelectorAll(".wv-bl-row").length, 3, "a popup lists the same rows");
        assert.isNull(pop.querySelector(".wv-bl-excerpt"), "...without excerpt");
        const empty = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        assert.strictEqual(wv._wvBlRenderBody(empty, SA, win.document), 0);
        assert.strictEqual(empty.querySelectorAll(".wv-bl-row").length, 0, "nothing listed, no '0 backlinks' noise");
        // MJT 2026-10-23: "The backlinks section should follow the related
        // section convention: only the data for the parent item." P2 is
        // linked by S1 itself and, through its note C2, by S1 again.
        const b2 = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        assert.strictEqual(wv._wvBlRenderBody(b2, P2, win.document), 1, "the section: P2's own link only");
        assert.strictEqual(b2.querySelectorAll(".wv-bl-via").length, 0, "nothing 'via' a child");
        assert.strictEqual(wv._wvBlRenderBody(b2, P2, win.document, "subtree"), 2, "the collapsed row's popup: with the note's");
    });

    // MJT 2026-10-28 ("For Links, the first line shows the origin of the link
    // in the current paper, down to the annotation level. For Backlinks, the
    // first line shows the origin of the link, but at the parent level. I
    // find this confusing.") and 2026-10-29 ("Try one line for the source and
    // one line for the target" / "use the same pattern as in the related
    // section"): each row's first line is the item the link is written in,
    // its second the item it lands on, each with the icon and the title
    // Zotero's Related section gives it; the rows in the order of the source
    // tree they replace: papers by title, under one its notes then its
    // annotations. Red on dev.95: headings.
    it("the section's rows read source, then target, each line an item as Related draws it, in the source tree's order", function () {
        const body = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        wv._wvBlRenderBody(body, P1, win.document);
        const host = body.querySelector(".wv-bl-body");
        const end = (r, side) => { const e = r.querySelector(":scope > .wv-bl-" + side + " > .wv-bl-end-main"); return e ? e.textContent : null; };
        const rows = [...host.querySelectorAll(":scope > .wv-bl-hgroup > .wv-bl-row")];
        const p1 = P1.getDisplayTitle();
        const mine = [C2.getDisplayTitle(), N2.getDisplayTitle()], s1 = [S1.getDisplayTitle()];
        const srcs = Zotero.localeCompare(P2.getDisplayTitle(), S1.getNoteTitle()) <= 0 ? mine.concat(s1) : s1.concat(mine);
        // Each source on its own line. The item's own rows alone come under
        // "This item", each with the arrow up from it (MJT 2026-11-03, "keep
        // the "This item" header even when there is only the parent item
        // selected, because the links color now add another information";
        // from 2026-10-30 to dev.171 nothing named the item and no arrow
        // pointed at it; until dev.118 the item's title led them).
        assert.deepEqual([...host.querySelectorAll(".wv-bl-hgroup .wv-count-group-title")].map((e) => e.textContent), ["This item"], "under This item");
        assert.deepEqual(rows.map((r) => [end(r, "from"), end(r, "to")]), srcs.map((s) => [s, null]), "papers by title; under one, its notes then its annotations");
        assert.notInclude(rows.map((r) => [end(r, "from"), end(r, "to")]).flat(), p1, "the item not named on a row");
        assert.isNull(host.querySelector(".wv-bl-owner"), "no source headings: the first line names the source");
        assert.isTrue(rows.every((r) => r.querySelector(".wv-bl-arrow[data-dir='up']")), "an arrow up on each row");
        assert.isOk(rows.find((r) => r._wvBlSrcID === N2.id).querySelector(".wv-bl-from > .wv-bl-kind.annotation-icon"), "the source's line, the source's icon");
    });

    // MJT 2026-10-23: "When no backlink, the Backlinks section should show 0,
    // same as Related section" -- Zotero's section-related is
    // "{ $count } Related"; the header had a [0] variant without the number.
    it("the section header reads its count at zero too, as Related does", async function () {
        const fmt = async (count) => {
            const [m] = await win.document.l10n.formatMessages([{ id: "weavero-backlinks-header", args: { count } }]);
            const a = m && m.attributes && m.attributes.find((x) => x.name === "label");
            return String(a ? a.value : "").replace(/[⁨⁩]/g, "");
        };
        assert.strictEqual(await fmt(0), "0 Backlinks");
        assert.strictEqual(await fmt(1), "1 Backlink");
        assert.strictEqual(await fmt(2), "2 Backlinks");
    });

    it("selecting a target in the library shows the section with its rows in the item pane", async function () {
        await ZP.selectItem(P1.id);
        // The LIBRARY's item pane: a reader tab opened earlier in this block
        // keeps a context pane with its own section for the same paper,
        // drawn when the links were different (2026-10-28).
        // P1 may be selected already (the Attachments test): the section then
        // keeps its rows until the index's debounced refresh after the edits
        // above -- wait for it to settle rather than take the first draw.
        const count = () => {
            const sec = win.document.querySelector('#zotero-item-pane item-pane-custom-section[data-pane$="weavero-backlinks"]');
            return sec ? sec.querySelectorAll(".wv-bl-row").length : 0;
        };
        await wvT.waitFor(() => count() === 3 || null, 15000);
        assert.strictEqual(count(), 3, "the live section lists P1's three sources");
    });

    it("the Backlinks column reports the rolled-up count", function () {
        const cols = /** @type {any} */ (Zotero.ItemTreeManager).getCustomColumns();
        // The manager namespaces the key: `<pluginID>-<dataKey>`, CSS-escaped.
        const col = cols.find(c => /weaveroBacklinks$/.test(String(c.dataKey)));
        assert.isOk(col, "the column is registered (pref on by default)");
        assert.strictEqual(col.dataProvider(P1), 3);
        assert.strictEqual(col.dataProvider(SA), 0);
    });

    it("the Has Backlinks chip: primary for a direct target, tree-level for its family, dormant while the section pref is off", async function () {
        const g = Object.assign(wv._emptyFilterGroup(), { hasBacklinks: true });
        assert.isTrue(wv._rowIsPrimary(P1, { groups: [g] }), "P1 is a direct target");
        assert.isFalse(wv._rowIsPrimary(A1, { groups: [g] }), "A1 itself is not linked");
        assert.isTrue(wv._treeSatisfiesCrossLevelScoped(A1, g), "A1's tree (P1) has backlinks");
        assert.isFalse(wv._treeSatisfiesCrossLevelScoped(SA, g), "the standalone attachment's tree has none");
        const gx = Object.assign(wv._emptyFilterGroup(), { hasBacklinks: false });
        assert.isTrue(wv._rowIsPrimary(SA, { groups: [gx] }), "exclude: SA counts");
        assert.isTrue(wv._isGroupActive(g), "the chip is set");
        await wvT.withPref("weavero.enableBacklinks", false, async () => {
            assert.isFalse(wv._isGroupActive(g), "dormant: the selection is kept but counts as unset");
        });
    });

    // MJT 2026-10-30 ("The Has Item Link and Has Backlink filters should also
    // get a dropdown next to them" -> "Ok for what is proposed"): Has
    // Backlinks' ▾ says WHAT is linked -- the item, its attachments, its
    // notes, its annotations (Has Tag's "Apply to"); Has Item Links' ▾ WHERE
    // the link is written -- annotation comments, item notes, standalone notes
    // (Has External Link's). Until dev.132 neither had a scope.
    it("Has Backlinks' ▾ narrows what is linked; Has Item Links' ▾ where the link is written", async function () {
        // X1 linked again (the live-update test above left N2 linking P1
        // only): a standalone note naming it.
        const LX = new Zotero.Item("note"); LX.libraryID = lib;
        LX.setNote("<p>to X1 zotero://open/library/items/" + A1.key + "?annotation=" + X1.key + "</p>");
        await LX.saveTx();
        try {
            await wvT.waitFor(() => wv._wvBlDirect(X1).some((s) => s.srcID === LX.id) || null, 10000);
            await scopedChecks();
        }
        finally {
            await LX.eraseTx();
            await wvT.waitFor(() => !wv._wvBlDirect(X1).some((s) => s.srcID === LX.id) || null, 10000);
        }
    });
    const scopedChecks = async () => {
        const e = wv._emptyFilterGroup();
        assert.deepEqual(e.hasBacklinksScope, { parent: true, attachment: true, note: true, annotation: true }, "every kind by default");
        assert.deepEqual(e.hasItemLinksScope, { standaloneText: true, itemNoteText: true, annotationComment: true }, "every source by default");
        const bl = (sc) => Object.assign(wv._emptyFilterGroup(), { hasBacklinks: true, hasBacklinksScope: Object.assign({ parent: false, attachment: false, note: false, annotation: false }, sc) });
        const prim = (row, g) => wv._rowIsPrimary(row, { groups: [g] });
        const tree = (row, g) => wv._treeSatisfiesCrossLevelScoped(row, g);
        assert.isTrue(tree(P1, bl({ parent: true })), "P1 itself is linked");
        assert.isTrue(prim(P1, bl({ parent: true })));
        assert.isFalse(prim(X1, bl({ parent: true })), "X1, an annotation: out of scope");
        assert.isTrue(tree(P1, bl({ annotation: true })), "P1's annotation X1 is linked");
        assert.isFalse(prim(P1, bl({ annotation: true })), "P1 itself: out of scope");
        assert.isTrue(prim(X1, bl({ annotation: true })));
        assert.isFalse(tree(P1, bl({ attachment: true })), "A1 itself is not linked");
        assert.isTrue(tree(P2, bl({ note: true })), "P2's item note C2 is linked");
        assert.isFalse(tree(P1, bl({ note: true })), "P1 has no note");
        const lk = (sc) => Object.assign(wv._emptyFilterGroup(), { hasItemLinks: true, hasItemLinksScope: Object.assign({ standaloneText: false, itemNoteText: false, annotationComment: false }, sc) });
        assert.isTrue(tree(P2, lk({ annotationComment: true })), "N2's comment, on P2's file");
        assert.isTrue(prim(N2, lk({ annotationComment: true })));
        assert.isTrue(tree(P2, lk({ itemNoteText: true })), "C2, P2's item note");
        assert.isFalse(prim(N2, lk({ itemNoteText: true })), "N2, an annotation comment: out of scope");
        assert.isFalse(tree(P2, lk({ standaloneText: true })), "P2 holds no standalone note");
        assert.isTrue(tree(S1, lk({ standaloneText: true })), "S1, a standalone note");
        assert.isFalse(tree(S1, lk({ annotationComment: true })));
        // Both tiles carry the ▾, beside Has Tag's, Has Related's and Has
        // External Link's.
        const doc = win.document;
        const section = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
        wv._renderCrossLevelSection(doc, section, () => {});
        const arrowed = [...section.querySelectorAll(".wv-filter-cross-slot")].filter((s) => s.querySelector(".wv-filter-cross-scope-arrow")).map((s) => s.querySelector(".wv-filter-cross-main").title.split(" — ")[0]);
        assert.includeMembers(arrowed, ["Has Item Links", "Has Backlinks"]);
    };

    // An attachment's own note -- Zotero's legacy note on a file, shown
    // read-only with a button that turns it into a real note (attachmentBox.js
    // initAttachmentNoteEditor / convertAttachmentNote) -- is no source: the
    // live updates and Has Link never read one, but the startup scan did
    // (found 2026-10-28 while classifying the link types; MJT "Ok to fix").
    // After a conversion the attachment stayed a source next to the new note
    // until the next restart. FAILED on dev.88.
    it("an attachment's own note is no source, at startup as live", async function () {
        const T = await wvT.createItem("book", { title: "WVBL attachment-note target" });
        const AN = await wvT.createTestPDFItem("wvbl-attnote", { parentItemID: P2.id });
        AN.setNote("<p>legacy zotero://select/library/items/" + T.key + "</p>");
        await AN.saveTx();
        try {
            wv._wvBlIndex = null; wv._wvBlCountCache = null;   // a fresh index, as at startup
            await wv._wvBlEnsure();
            assert.deepEqual(wv._wvBlDirect(T).map((s) => s.srcID), [], "the attachment's note is not read by the startup scan");
            assert.isFalse(wv._itemHasLinks(AN), "nor by Has Link (unchanged)");
        }
        finally { await AN.eraseTx(); await wvT.erase(T); }
    });

    // 2026-10-28: Zotero stores a note wrapped in `<div class="zotero-note
    // znvN">` and getNote() drops the wrapper; the startup scan read the
    // stored text, so a note's positions sat 30 characters off until its
    // first edit and the hover card lost its wide context.
    it("a note read by the startup scan keeps the positions getNote() reads", async function () {
        wv._wvBlIndex = null; wv._wvBlCountCache = null;   // a fresh index, as at startup
        await wv._wvBlEnsure();
        for (const [note, target] of [[C2, P1], [S1, P1]]) {
            const e = wv._wvBlDirect(target).find((s) => s.srcID === note.id);
            assert.isOk(e, "indexed at startup");
            assert.strictEqual(note.getNote().slice(e.at, e.at + e.len), e.url, "the link sits at its position in the note as Zotero reads it");
        }
    });

    // 2026-10-26, dev profile: every Zotero string of a main window (item-pane
    // headers, the column menu) went blank. One linked FTL file the registry
    // cannot find makes the window's whole Localization resolve nothing, and
    // Zotero unregisters a plugin's locale files after its shutdown -- so a
    // weavero.ftl link left behind by shutdown blanks the window. Last in the
    // block: it tears the feature down and brings it back.
    it("shutdown unlinks weavero.ftl from the window, and the wiring links it once again", async function () {
        const d = win.document;
        const links = () => d.querySelectorAll('link[rel="localization"][href="weavero.ftl"]').length;
        const resolves = async (id, args) => { const [m] = await d.l10n.formatMessages([{ id, args }]); return !!m; };
        // The failure itself: a linked file that cannot be found.
        d.l10n.addResourceIds(["wv-missing-probe.ftl"]);
        try { assert.isFalse(await resolves("section-related", { count: 1 }), "one missing file: Zotero's own string is gone too"); }
        finally { d.l10n.removeResourceIds(["wv-missing-probe.ftl"]); }
        assert.isTrue(await resolves("section-related", { count: 1 }));
        assert.strictEqual(links(), 1, "linked while Weavero runs");
        try {
            wv._wvBlDestroy();
            assert.strictEqual(links(), 0, "shutdown leaves no link for Zotero's unregister to break");
            assert.isTrue(await resolves("section-related", { count: 1 }));
        }
        finally {
            wv._wvBlInit();
            wv._wvBlEnsureFtl(win, true);
        }
        assert.strictEqual(links(), 1, "the wiring links it again");
        // A link an older build left behind is replaced, never doubled.
        wv._wvBlEnsureFtl(win, true);
        assert.strictEqual(links(), 1);
        assert.isTrue(await resolves("section-related", { count: 1 }));
        assert.isTrue(await resolves("weavero-backlinks-header", { count: 2 }));
    });
});
