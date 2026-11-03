/* global describe, it, before, after, assert, Zotero, wvT */

// The hover card where a reference is written (MJT 2026-11-03: "Hovering on
// a Zotero link in a note or an annotation, or a Note Citation in a note
// should display a similar preview as in the item pane"; intake: the note
// editors and the reader sidebar's annotation comments; plan "Go"). The
// card is the Item Links row's -- both ends with their lineage, the
// reference's kind and place -- opened on the node as drawn, after the
// rows' rest, gone when the pointer moves off it. Written before the code:
// every `it` fails on 0.22.3-dev.167.

describe("Weavero — the hover card on links in notes and annotation comments", function () {
    this.timeout(150000);
    let wv, win, doc, ZP, lib, P, A, X, P2, P3, A3, Y, N;
    const enc = (o) => encodeURIComponent(JSON.stringify(o));
    const NEEDLE = "WVHC";

    const note = async (title, body, parentID) => {
        const n = /** @type {any} */ (new Zotero.Item("note"));
        n.libraryID = lib;
        if (parentID) n.parentID = parentID;
        n.setNote('<div data-schema-version="9"><h1>' + title + "</h1><p>" + body + "</p></div>");
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
    const card = () => doc.getElementById("wv-bl-card");
    const shown = () => { const c = card(); return c && !c.hidden ? c : null; };
    const kindOf = (c) => (c.querySelector(".wv-bl-card-ref-kind") || { textContent: "" }).textContent;
    const editorDoc = () => {
        for (const ne of doc.querySelectorAll("note-editor")) {
            const f = ne.querySelector("iframe");
            const d = f && f.contentDocument;
            if (d && d.querySelector(".ProseMirror") && (d.body.textContent || "").includes(NEEDLE)) return d;
        }
        return null;
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvLkHoverNode", "_wvLkHoverRow", "_wvLkHoverCardShow", "_wvLkHoverCardHide", "_wvLkOut", "_wvBlEnsure", "_processNoteEditors", "_processReaderSidebar"]) wvT.method(m);
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane; lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVHC paper" });
        A = await wvT.createTestPDFItem("wvhc-pdf", { parentItemID: P.id });
        P2 = await wvT.createItem("book", { title: "WVHC target two" });
        P3 = await wvT.createItem("book", { title: "WVHC cited three" });
        A3 = await wvT.createTestPDFItem("wvhc-pdf3", { parentItemID: P3.id });
        Y = await ann(A3, "quoted words", "4");
        X = await ann(A, "linking words", "2", "See zotero://select/library/items/" + P2.key + " here and https://example.com/wvhc there.");
        const uriP3 = Zotero.URI.getItemURI(P3), uriA3 = Zotero.URI.getItemURI(A3);
        N = await note(NEEDLE + " note", "A link zotero://select/library/items/" + P2.key
            + ' then <span class="citation" data-citation="' + enc({ citationItems: [{ uris: [uriP3], locator: "7" }], properties: {} }) + '">(Three, p. 7)</span>'
            + ' then <span class="highlight" data-annotation="' + enc({ attachmentURI: uriA3, annotationKey: Y.key, citationItem: { uris: [uriP3], locator: "4" }, position: { pageIndex: 3, rects: [[10, 10, 60, 20]] } }) + '">“quoted words”</span>'
            + " end.", P.id);
        await wv._wvBlEnsure();
        assert.isOk(await wvT.waitFor(() => wv._wvLkOut(N).length >= 3 && wv._wvLkOut(X).length >= 1 || null, 15000), "the index holds N's three references and X's link");
    });

    after(async function () {
        try { wv._wvLkHoverCardHide(doc.documentElement); } catch (e) {}
        await wvT.erase(P, P2, P3);
    });

    it("the index row behind a node: a zotero link by its address, a citation and a quote by their order", async function () {
        await ZP.selectItem(N.id);
        const edoc = await wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const d = editorDoc();
            // A bare address in the editor is Weavero's decoration span
            // (`data-wv-href`, note-editor-inject.ts), not an anchor; a
            // citation and a highlight are drawn by node views that set
            // the class alone, without the stored data attribute.
            return d && d.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]') && d.querySelector(".citation") && d.querySelector(".highlight, [data-annotation]") ? d : null;
        }, 45000, 500);
        assert.isOk(edoc, "the note's editor, with its link, citation and quote drawn");
        const a = edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]'), c = edoc.querySelector(".citation"), q = edoc.querySelector(".highlight, [data-annotation]");
        assert.strictEqual(wv._wvLkHoverNode(a.firstChild || a), a, "a text node inside the link resolves to it");
        assert.strictEqual(wv._wvLkHoverNode(edoc.body), null, "the body is no reference");
        const rl = wv._wvLkHoverRow(a, N), rc = wv._wvLkHoverRow(c, N), rq = wv._wvLkHoverRow(q, N);
        assert.isOk(rl && rl.entry.ref === "link" && rl.target && rl.target.id === P2.id, "the link's row: aimed at P2");
        assert.isOk(rc && rc.entry.ref === "citation" && rc.target && rc.target.id === P3.id && rc.entry.locator === "7", "the citation's row: P3, p. 7");
        assert.isOk(rq && rq.entry.ref === "quote" && rq.target && rq.target.id === Y.id, "the quote's row: the annotation Y");
    });

    it("a note's editor: the card for each of the three, from the node, in the main window; hidden again", async function () {
        const edoc = editorDoc();
        assert.isOk(edoc, "the editor still up");
        const a = edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]'), c = edoc.querySelector(".citation"), q = edoc.querySelector(".highlight, [data-annotation]");
        assert.isTrue(wv._wvLkHoverCardShow(a, N), "the link's card");
        let cd = shown();
        assert.isOk(cd, "shown, in the main window's document");
        assert.match(kindOf(cd), /^Zotero link/, "its kind: " + kindOf(cd));
        assert.include(cd.textContent, P2.getDisplayTitle(), "its target");
        assert.isTrue(wv._wvLkHoverCardHide(a), "hidden");
        assert.isNull(shown());
        assert.isTrue(wv._wvLkHoverCardShow(c, N), "the citation's card");
        cd = shown();
        assert.match(kindOf(cd), /^Note citation/, "its kind: " + kindOf(cd));
        assert.include(kindOf(cd), "p. 7", "its page");
        assert.include(cd.textContent, P3.getDisplayTitle(), "its target");
        wv._wvLkHoverCardHide(c);
        assert.isTrue(wv._wvLkHoverCardShow(q, N), "the quote's card");
        cd = shown();
        assert.match(kindOf(cd), /^Note citation/, "a quote is a note citation too: " + kindOf(cd));
        assert.include(cd.textContent, P3.getDisplayTitle(), "the annotation's paper in its lineage");
        wv._wvLkHoverCardHide(q);
        assert.isNull(shown());
    });

    it("a rest on the link opens the card, a move off it closes it", async function () {
        const edoc = editorDoc();
        const iwin = edoc.defaultView;
        const a = edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]');
        const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
        const move = (el) => el.dispatchEvent(new iwin.MouseEvent("mousemove", Cu.cloneInto(Object.assign({ bubbles: true, cancelable: true }, at(el)), iwin)));
        move(a);
        assert.isNull(shown(), "nothing before the rest");
        assert.isOk(await wvT.waitFor(() => shown(), 3000), "the card after the rest");
        assert.match(kindOf(shown()), /^Zotero link/);
        move(edoc.querySelector("h1") || edoc.body);
        assert.isOk(await wvT.waitFor(() => !shown() || null, 1000), "moved off the link: gone");
    });

    it("the reader sidebar: a zotero link in an annotation comment gets the card, the annotation its source", async function () {
        const reader = await wvT.openReaderTab(A.id);
        try {
            try { reader._internalReader.toggleSidebar(true); } catch (e) {}
            const idoc = reader._iframeWindow.document;
            const span = await wvT.waitFor(() => {
                try { wv._processReaderSidebar(idoc); } catch (e) {}
                return idoc.querySelector('[data-sidebar-annotation-id="' + X.key + '"] .wv-md-preview .wv-url-span.wv-link-zotero');
            }, 30000, 500);
            assert.isOk(span, "X's comment drawn with its zotero link");
            assert.include(wvT.lib().wvListenKeys(span).map((k) => k.key), "lkcard:enter", "the rows' hover on it");
            assert.isTrue(wv._wvLkHoverCardShow(span, X, span.closest(".wv-md-preview")), "the card");
            const cd = shown();
            assert.isOk(cd, "in the main window's document, over the reader's frame");
            assert.match(kindOf(cd), /^Zotero link/);
            assert.include(cd.textContent, P2.getDisplayTitle(), "its target");
            assert.include(cd.textContent, "linking words", "the annotation, its source");
            wv._wvLkHoverCardHide(span);
            assert.isNull(shown());
        }
        finally { wvT.closeReaderTab(reader); }
    });

    // MJT 2026-11-03: "I also want the Zotero hover preview in the items
    // list" (an annotation row's comment showed the address as a plain
    // tooltip). The items tree draws a zotero:// address in a comment as a
    // Weavero span (pane.ts _markCellLinks); the card is the Item Links
    // row's, the row's annotation its source, after the rows' rest; the
    // address's tooltip gone (the card says more), a web address keeping its
    // own. FAILED on dev.170.
    it("the items list: a zotero link in an annotation row's comment gets the card, the row's annotation its source; no address tooltip", async function () {
        const tree = doc.getElementById("item-tree-main") || doc.getElementById("item-tree-main-default");
        assert.isOk(tree, "the items tree");
        await ZP.selectItems([X.id]);
        const cell = await wvT.waitFor(() => {
            try { wv._markCellLinks(doc); } catch (e) {}
            for (const row of tree.querySelectorAll(".annotation-row")) {
                const it = wv._getItemFromTreeRow(row);
                if (!it || it.id !== X.id) continue;
                const c = row.querySelector(".cell.annotation-comment");
                return c && c.querySelector(".wv-url-span.wv-link-zotero") ? c : null;
            }
            return null;
        }, 30000, 300);
        assert.isOk(cell, "X's row, its comment drawn with its zotero link");
        const span = cell.querySelector(".wv-url-span.wv-link-zotero");
        assert.include(wvT.lib().wvListenKeys(span).map((k) => k.key), "lkcard:enter", "the rows' hover on it");
        assert.isTrue(wvT.method("_wvTreeLkCardShow").call(wv, span), "the card, from the row");
        const cd = shown();
        assert.isOk(cd, "in the main window's document");
        assert.match(kindOf(cd), /^Zotero link/);
        assert.include(cd.textContent, P2.getDisplayTitle(), "its target");
        assert.include(cd.textContent, "linking words", "the row's annotation, its source");
        wv._wvLkHoverCardHide(span);
        assert.isNull(shown());
        // The tooltips, after the tree's own mouseover and Weavero's restore.
        const web = cell.querySelector(".wv-url-span:not(.wv-link-zotero)");
        assert.isOk(web, "the web address drawn too");
        for (const s of [span, web]) s.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
        await wvT.sleep(150);
        assert.isFalse(span.hasAttribute("title"), "no tooltip on the zotero link: the card says more");
        assert.strictEqual(web.getAttribute("title"), "https://example.com/wvhc", "the web link keeps its address tooltip");
    });

    // MJT 2026-11-03: "Make the z icon in the Zotero link color everywhere"
    // (the card's label and arrow drew it grey). The z, wherever it names a
    // Zotero link -- the Item Links header's count, the card's label, the
    // card's arrow -- in the colour its address is written in; the note
    // citations' quote mark keeps the text's. FAILED on dev.170.
    it("the z in the Zotero links' colour everywhere: the header's count, the card's label and arrow; the quote mark not", async function () {
        const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        probe.className = "wv-url-span wv-link-zotero";
        doc.documentElement.appendChild(probe);
        const Z = Zotero.Weavero.lib.WV_ZLINK_KIND_PATH, Q = Zotero.Weavero.lib.WV_CITE_KIND_PATH;
        const colour = (el) => win.getComputedStyle(el).color;
        const pathOf = (root, d) => [...root.querySelectorAll("path")].find((p) => p.getAttribute("d") === d) || null;
        try {
            const zc = colour(probe);
            // The card: the link's (from the note's editor) and the citation's.
            await ZP.selectItem(N.id);
            const edoc = await wvT.waitFor(() => { try { wv._processNoteEditors(); } catch (e) {} const d = editorDoc(); return d && d.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]') && d.querySelector(".citation") ? d : null; }, 45000, 500);
            assert.isOk(edoc, "the note's editor");
            assert.isTrue(wv._wvLkHoverCardShow(edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]'), N));
            let cd = shown();
            const lab = pathOf(cd.querySelector(".wv-bl-card-ref-label"), Z), mid = pathOf(cd.querySelector("svg.wv-bl-card-arrow .wv-bl-card-ref-mark"), Z);
            assert.isOk(lab && mid, "the z before the label and on the arrow");
            assert.strictEqual(colour(lab), zc, "the label's z in the Zotero links' colour");
            assert.strictEqual(colour(mid), zc, "the arrow's z too");
            wv._wvLkHoverCardHide(edoc.body);
            assert.isTrue(wv._wvLkHoverCardShow(edoc.querySelector(".citation"), N));
            cd = shown();
            const q = pathOf(cd.querySelector(".wv-bl-card-ref-label"), Q);
            assert.isOk(q, "the quote mark before a citation's label");
            assert.notStrictEqual(colour(q), zc, "the quote mark keeps the text's colour");
            wv._wvLkHoverCardHide(edoc.body);
            // The Item Links header of the paper: its two kinds counted.
            await ZP.selectItem(P.id);
            const head = await wvT.waitFor(() => {
                const s = doc.querySelector('#zotero-item-pane item-details item-pane-custom-section[data-pane$="weavero-links"]');
                const c = s && s.querySelector('.head .wv-scope-count[data-kind="link"]');
                return c && pathOf(c, Z) ? c : null;
            }, 15000);
            assert.isOk(head, "the Item Links header's Zotero-link count");
            assert.strictEqual(colour(pathOf(head, Z)), zc, "its z in the Zotero links' colour");
            const cz = head.parentNode.querySelector('.wv-scope-count[data-kind="zotero"]');
            assert.notStrictEqual(colour(pathOf(cz, Q)), zc, "the note citations' quote mark not");
        }
        finally { probe.remove(); try { wv._wvLkHoverCardHide(doc.documentElement); } catch (e) {} }
    });

    // MJT 2026-11-03 (screenshot): "Cards have the same background as the
    // item pane. Can you suggest something better?" -> option A, "Try A":
    // Zotero's raised surface, --material-button (#404040 dark, white
    // light), over the pane's --material-sidepane, inside Zotero's popup
    // border (--material-border); the discs behind the arrow's icons paint
    // the card's colour. FAILED on dev.173 (the pane's own colour).
    it("the card is a raised surface: Zotero's button material inside its popup border, the arrow's discs alike", async function () {
        await ZP.selectItem(N.id);
        const edoc = await wvT.waitFor(() => { try { wv._processNoteEditors(); } catch (e) {} const d = editorDoc(); return d && d.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]') ? d : null; }, 45000, 500);
        assert.isOk(edoc, "the note's editor");
        assert.isTrue(wv._wvLkHoverCardShow(edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]'), N));
        const cd = shown();
        const probes = [];
        const probe = (css) => { const p = doc.createElementNS("http://www.w3.org/1999/xhtml", "div"); p.style.cssText = "position:fixed;left:-99px;top:0;width:4px;height:4px;" + css; doc.documentElement.appendChild(p); probes.push(p); return win.getComputedStyle(p); };
        try {
            const btn = probe("background: var(--material-button)"), side = probe("background: var(--material-sidepane)"), bord = probe("border: var(--material-border)");
            const cs = win.getComputedStyle(cd);
            assert.notStrictEqual(btn.backgroundColor, side.backgroundColor, "Zotero's two materials differ in this theme");
            assert.strictEqual(cs.backgroundColor, btn.backgroundColor, "the card paints Zotero's button material");
            assert.strictEqual(cs.borderTopColor, bord.borderTopColor, "inside Zotero's popup border");
            const disc = cd.querySelector(".wv-bl-card-icon-bg");
            assert.isOk(disc, "the kind mark's disc on the arrow");
            assert.strictEqual(win.getComputedStyle(disc).fill, btn.backgroundColor, "the disc paints the card's colour");
        }
        finally { for (const p of probes) p.remove(); wv._wvLkHoverCardHide(edoc.body); }
    });

    // MJT 2026-11-03 ("Have you gated the new Links and Backlinks features
    // behind a toggle in the settings, so that users who don't like it can
    // disable it?" -> "Ok for the fixes you recommend"): the card is the
    // Item Links row's, so the Item Links switch turns it off wherever a
    // reference is written -- a note's editor, the reader sidebar, the items
    // list -- and the address's tooltip comes back. Until dev.172 the note
    // and sidebar cards ignored the switch. FAILED on dev.172.
    it("the Item Links switch off: no card where a link is written, the tooltip back; on again, the card", async function () {
        const tree = doc.getElementById("item-tree-main") || doc.getElementById("item-tree-main-default");
        await ZP.selectItem(N.id);
        const edoc = await wvT.waitFor(() => { try { wv._processNoteEditors(); } catch (e) {} const d = editorDoc(); return d && d.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]') ? d : null; }, 45000, 500);
        assert.isOk(edoc, "the note's editor");
        const a = edoc.querySelector('a[href^="zotero://"], [data-wv-href^="zotero://"]');
        const iwin = edoc.defaultView;
        const at = (el) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
        const move = (el) => el.dispatchEvent(new iwin.MouseEvent("mousemove", Cu.cloneInto(Object.assign({ bubbles: true, cancelable: true }, at(el)), iwin)));
        wv._getEnableLinks = () => false;   // own property over the prototype getter
        try {
            assert.isFalse(wv._wvLkHoverCardShow(a, N), "the card refused from the node");
            assert.isNull(shown());
            move(a);
            await wvT.sleep(900);
            assert.isNull(shown(), "a rest on the note's link: no card");
            move(edoc.querySelector("h1") || edoc.body);
            // The items list: X's row, its comment's link.
            await ZP.selectItems([X.id]);
            const span = await wvT.waitFor(() => {
                try { wv._markCellLinks(doc); } catch (e) {}
                for (const row of tree.querySelectorAll(".annotation-row")) {
                    const it = wv._getItemFromTreeRow(row);
                    if (it && it.id === X.id) return row.querySelector(".cell.annotation-comment .wv-url-span.wv-link-zotero");
                }
                return null;
            }, 30000, 300);
            assert.isOk(span, "X's row with its zotero link");
            assert.isFalse(wvT.method("_wvTreeLkCardShow").call(wv, span), "no card from the items list");
            assert.isNull(shown());
            span.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
            await wvT.sleep(150);
            assert.strictEqual(span.getAttribute("title"), "zotero://select/library/items/" + P2.key, "its address's tooltip back");
        }
        finally { delete wv._getEnableLinks; }
        assert.isTrue(wv._wvLkHoverCardShow(a, N), "switched back on: the card");
        wv._wvLkHoverCardHide(a);
    });
});
