/* global describe, it, before, after, expect, Zotero, Components, wvT */

// Citations after Zotero links in a note (MJT 2026-11-09, picks 1a 2b 3abc
// 4b): a zotero:// link to an item, a PDF page or an annotation keeps its
// text and gets Zotero's own citation right after it -- an annotation link
// the annotation's quote and its citation, as Zotero writes them when an
// annotation is dragged into a note. Contracts:
//  - "Add Citation After Link" on a right-clicked link; "Add Citations
//    After Links in Selection (N)" when the selection holds links; "Add
//    Citations After All Links (N)" at the end of the note's own menu;
//  - an item link: a citation of the item; a PDF page link: of the PDF's
//    parent, the page as the locator (the printed page of an annotation on
//    that page, else the link's number); an annotation link: the quote
//    (highlight / underline) and a citation with the annotation's page; a
//    note annotation: the citation with its page;
//  - the link stays; a link already followed by a citation of the same
//    item gets no second one;
//  - not convertible (greyed, a tooltip says why): a note, a file with no
//    parent, a library not in this profile, a web link;
//  - one Ctrl+Z takes a whole batch back; the citation's item data reaches
//    the note's metadata (Zotero's pull-item-data);
//  - the setting off: no entries.

describe("Weavero — citations after Zotero links in a note", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, P1, P2, A1, S1, H1, N1, NT, note, ed;
    const NEEDLE = "WV-NOTECITE-SPEC";
    const lib = () => Zotero.Libraries.userLibraryID;
    const sel = (key) => "zotero://select/library/items/" + key;
    const clone = (o, w) => Components.utils.cloneInto(o, w);

    const mkAnn = async (att, type, fields) => {
        const a = /** @type {any} */ (new Zotero.Item("annotation"));
        a.libraryID = att.libraryID;
        a.parentID = att.id;
        a.annotationType = type;
        if (fields.text) a.annotationText = fields.text;
        a.annotationComment = fields.comment || "";
        a.annotationColor = "#ffd400";
        a.annotationPageLabel = fields.pageLabel;
        a.annotationSortIndex = String(fields.pageIndex).padStart(5, "0") + "|000100|00100";
        a.annotationPosition = JSON.stringify({ pageIndex: fields.pageIndex, rects: [[10, 10, 60, 20]] });
        await a.saveTx();
        return a;
    };

    async function openInPane() {
        await ZP.selectItem(note.id);
        return wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            for (const ne of doc.querySelectorAll("note-editor")) {
                const f = ne.querySelector("iframe");
                const d = f && f.contentDocument;
                const wj = f && f.contentWindow && f.contentWindow.wrappedJSObject;
                if (d && ne.item && ne.item.id === note.id && d.querySelector(".ProseMirror")
                    && (d.body.textContent || "").includes(NEEDLE) && wj && typeof wj.__wvZoteroLinks === "function") {
                    return { ne, f, d, wj };
                }
            }
            return null;
        }, 45000, 400);
    }
    const linkByText = (t) => [...ed.d.querySelectorAll(".ProseMirror a")].find((a) => (a.textContent || "").trim() === t);
    const paraByText = (t) => [...ed.d.querySelectorAll(".ProseMirror p")].find((p) => (p.textContent || "").includes(t));
    function menuAt(el) {
        const menu = ed.ne.querySelector("#editor-menu");
        const r = el.getBoundingClientRect();
        wv._wvNnOnContext({ target: el, clientX: r.left + Math.min(4, r.width / 2), clientY: r.top + r.height / 2 }, ed.ne, ed.f);
        menu.dispatchEvent(new win.Event("popupshowing"));
        return menu;
    }
    const closeMenu = (menu) => menu.dispatchEvent(new win.Event("popuphidden"));
    const entry = (menu, id) => menu.querySelector("#" + id);
    function run(menu, id) {
        const mi = entry(menu, id);
        if (!mi) throw new Error("no menu entry " + id);
        mi.dispatchEvent(new win.Event("command"));
    }
    /** The saved note, parsed. */
    const saved = () => new win.DOMParser().parseFromString(/** @type {any} */ (Zotero.Items.get(note.id)).getNote(), "text/html");
    const decode = (v) => JSON.parse(decodeURIComponent(v));
    /** What follows the link `href` in the saved note: the element siblings
     *  after it, up to the next link or the end of its block, as
     *  {cls, data} (data: the decoded data-citation / data-annotation). */
    function following(sdoc, href) {
        const a = [...sdoc.querySelectorAll("a")].find((x) => x.getAttribute("href") === href);
        if (!a) return null;
        const out = [];
        for (let n = a.nextSibling; n; n = n.nextSibling) {
            if (n.nodeType === 3) { if (n.textContent.trim()) break; continue; }
            if (n.localName === "a") break;
            const cls = n.getAttribute("class") || "";
            const raw = n.getAttribute("data-citation") || n.getAttribute("data-annotation");
            out.push({ cls, data: raw ? decode(raw) : null, text: n.textContent });
        }
        return out;
    }
    const undo = () => {
        const v = ed.wj._currentEditorInstance._editorCore.view;
        v.dom.dispatchEvent(new ed.d.defaultView.KeyboardEvent("keydown",
            clone({ key: "z", code: "KeyZ", keyCode: 90, ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac, bubbles: true, cancelable: true }, ed.d.defaultView)));
    };
    const savedHas = (href, cls) => wvT.waitFor(() => { const x = following(saved(), href); return x && x.some((e) => e.cls === cls) ? x : null; }, 8000);
    const uriOf = (it) => Zotero.URI.getItemURI(it);

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvNnOnMenuShowing", "_wvNnOnContext"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        P1 = await wvT.createItem("journalArticle", { title: "WVNC Smith paper", date: "2020" });
        P1.setCreators([{ firstName: "Ann", lastName: "Smith", creatorType: "author" }]);
        await P1.saveTx();
        P2 = await wvT.createItem("book", { title: "WVNC Jones book", date: "2021" });
        P2.setCreators([{ firstName: "Bob", lastName: "Jones", creatorType: "author" }]);
        await P2.saveTx();
        A1 = await wvT.createTestPDFItem("wvnc-a1", { parentItemID: P1.id });
        S1 = await wvT.createTestPDFItem("wvnc-loose");
        H1 = await mkAnn(A1, "highlight", { text: "the quoted words", pageLabel: "12", pageIndex: 4 });
        N1 = await mkAnn(A1, "note", { comment: "a remark", pageLabel: "3", pageIndex: 2 });
        NT = new Zotero.Item("note");
        NT.libraryID = lib();
        NT.setNote("<p>WVNC a linked note</p>");
        await NT.saveTx();
        const pdf = (q) => "zotero://open-pdf/library/items/" + A1.key + q;
        note = new Zotero.Item("note");
        note.libraryID = lib();
        note.setNote('<div data-schema-version="9">'
            + "<h1>" + NEEDLE + "</h1>"
            + '<p>Item link <a href="' + sel(P1.key) + '">Smith paper</a> here.</p>'
            + '<p>Page link <a href="' + pdf("?page=5") + '">page five</a>.</p>'
            + '<p>Plain page <a href="' + pdf("?page=2") + '">page two</a>.</p>'
            + '<p>Select page <a href="' + sel(A1.key) + '?page=5">select five</a>.</p>'
            + '<p>Quote link <a href="' + pdf("?annotation=" + H1.key) + '">quote me</a>.</p>'
            + '<p>Remark link <a href="' + pdf("?annotation=" + N1.key) + '">remark</a>.</p>'
            + "<p>Bare " + sel(P2.key) + " text</p>"
            + '<p>Not these: <a href="' + sel(NT.key) + '">a note</a>, <a href="' + sel(S1.key) + '">loose file</a>, '
            + '<a href="zotero://select/groups/999999/items/ABCDEFGH">elsewhere</a>, <a href="https://example.com/wvnc">web</a>.</p>'
            + "</div>");
        await note.saveTx();
        ed = await openInPane();
    });

    after(async function () {
        await wvT.erase(note, NT, H1, N1, A1, S1, P1, P2);
    });

    it("an item link: the citation goes right after it, the link stays, the item data reaches the note", async function () {
        expect(ed, "note editor with the page code").to.be.ok;
        const menu = menuAt(linkByText("Smith paper"));
        try {
            const mi = entry(menu, "wv-note-cite-link");
            expect(mi, "Add Citation After Link").to.be.ok;
            expect(mi.getAttribute("label")).to.equal("Add Citation After Link");
            expect(mi.hasAttribute("disabled")).to.equal(false);
            expect(menu.firstElementChild, "at the top of the note's menu").to.equal(mi);
            run(menu, "wv-note-cite-link");
        }
        finally { closeMenu(menu); }
        const x = await savedHas(sel(P1.key), "citation");
        expect(x, "a citation after the link").to.be.ok;
        expect(x[0].cls).to.equal("citation");
        expect(x[0].data.citationItems.map((c) => c.uris[0])).to.deep.equal([uriOf(P1)]);
        expect(x[0].data.citationItems[0].locator, "no page for an item link").to.not.be.ok;
        const sdoc = saved();
        expect(!!sdoc.querySelector('a[href="' + sel(P1.key) + '"]'), "the link stays").to.equal(true);
        const meta = sdoc.querySelector("[data-citation-items]");
        expect(meta && decode(meta.getAttribute("data-citation-items")).some((c) => c.uris[0] === uriOf(P1) && c.itemData),
            "the item's data in the note's metadata").to.equal(true);
        expect(paraByText("Item link").textContent, "drawn as Zotero draws a citation").to.match(/Smith, 2020/);
    });

    it("the same link again: no second citation (greyed)", function () {
        const menu = menuAt(linkByText("Smith paper"));
        try {
            const mi = entry(menu, "wv-note-cite-link");
            expect(mi && mi.hasAttribute("disabled"), "already cited right after it").to.equal(true);
        }
        finally { closeMenu(menu); }
    });

    it("a page link: the PDF's parent, the printed page of an annotation on that page, else the link's number", async function () {
        const pdf = (q) => "zotero://open-pdf/library/items/" + A1.key + q;
        // A select link with a page too (MJT's own test note, 2026-11-09).
        for (const [text, href, locator] of [["page five", pdf("?page=5"), "12"], ["page two", pdf("?page=2"), "2"],
            ["select five", sel(A1.key) + "?page=5", "12"]]) {
            const menu = menuAt(linkByText(text));
            try { run(menu, "wv-note-cite-link"); }
            finally { closeMenu(menu); }
            const x = await savedHas(href, "citation");
            expect(x, text).to.be.ok;
            expect(x[0].data.citationItems[0].uris[0], text + ": the parent").to.equal(uriOf(P1));
            expect(x[0].data.citationItems[0].locator, text + ": the page").to.equal(locator);
        }
    });

    it("an annotation link: the quote and its citation, as Zotero writes a dragged annotation; a note annotation: the citation", async function () {
        let menu = menuAt(linkByText("quote me"));
        try { run(menu, "wv-note-cite-link"); }
        finally { closeMenu(menu); }
        const href = "zotero://open-pdf/library/items/" + A1.key + "?annotation=" + H1.key;
        const x = await savedHas(href, "citation");
        const para = () => { const a = [...saved().querySelectorAll("a")].find((q) => q.getAttribute("href") === href); return a ? a.parentElement.outerHTML : "no link"; };
        expect(x, "quote and citation; saved: " + para()).to.be.ok;
        expect(x.map((e) => e.cls)).to.deep.equal(["highlight", "citation"]);
        expect(x[0].data.annotationKey).to.equal(H1.key);
        expect(x[0].data.attachmentURI).to.equal(uriOf(A1));
        expect(x[0].text, "quoted with Zotero's own marks").to.equal(
            Zotero.getString("punctuation.openingQMark") + "the quoted words" + Zotero.getString("punctuation.closingQMark"));
        expect(x[1].data.citationItems[0].uris[0]).to.equal(uriOf(P1));
        expect(x[1].data.citationItems[0].locator).to.equal("12");
        menu = menuAt(linkByText("remark"));
        try { run(menu, "wv-note-cite-link"); }
        finally { closeMenu(menu); }
        const y = await savedHas("zotero://open-pdf/library/items/" + A1.key + "?annotation=" + N1.key, "citation");
        expect(y.map((e) => e.cls), "no quote for a note annotation").to.deep.equal(["citation"]);
        expect(y[0].data.citationItems[0].locator).to.equal("3");
    });

    it("a bare zotero:// address in the text gets its citation too", async function () {
        const p = paraByText("Bare zotero");
        const span = p.querySelector("[data-wv-href]") || p;
        const menu = menuAt(span);
        try {
            expect(entry(menu, "wv-note-cite-link") && !entry(menu, "wv-note-cite-link").hasAttribute("disabled")).to.equal(true);
            run(menu, "wv-note-cite-link");
        }
        finally { closeMenu(menu); }
        expect(await wvT.waitFor(() => {
            const sp = [...saved().querySelectorAll("p")].find((q) => q.textContent.includes("Bare zotero"));
            const c = sp && sp.querySelector("span.citation");
            return c ? decode(c.getAttribute("data-citation")).citationItems[0].uris[0] === uriOf(P2) : null;
        }, 8000), "a citation of P2 in that paragraph").to.equal(true);
        expect(saved().body.textContent, "the address stays").to.include(sel(P2.key));
    });

    it("what cannot be cited is greyed, with the reason", function () {
        for (const t of ["a note", "loose file", "elsewhere", "web"]) {
            const menu = menuAt(linkByText(t));
            try {
                const mi = entry(menu, "wv-note-cite-link");
                if (t === "web") { expect(mi, "a web link is not a Zotero link: no entry").to.equal(null); continue; }
                expect(mi && mi.hasAttribute("disabled"), t + " greyed").to.equal(true);
                expect(mi.getAttribute("tooltiptext") || "", t + " says why").to.not.equal("");
            }
            finally { closeMenu(menu); }
        }
    });

    it("all links: a count at the end of the menu, one Ctrl+Z takes the batch back", async function () {
        // Fresh links, none cited yet.
        const v = ed.wj._currentEditorInstance._editorCore.view;
        const before = v.state.doc.toJSON();
        const P = (t) => '<p>Batch ' + t + ' <a href="' + sel(P2.key) + '">jones ' + t + "</a></p>";
        Components.utils.waiveXrays(ed.f.contentWindow).eval(
            "(function () { const c = window._currentEditorInstance._editorCore; c.insertHTML(c.view.state.doc.content.size - 1, "
            + JSON.stringify(P("one") + P("two")) + "); })()");
        expect(await wvT.waitFor(() => (linkByText("jones two") ? true : null), 5000), "two fresh links").to.equal(true);
        // Past the editor's undo grouping (prosemirror-history newGroupDelay,
        // 500 ms): typed links are older than that when a user converts them,
        // and one Ctrl+Z must take back the citations only.
        await wvT.sleep(800);
        const menu = menuAt(linkByText("jones one"));
        let label = "";
        try {
            const all = entry(menu, "wv-note-cite-all");
            expect(all, "Add Citations After All Links").to.be.ok;
            label = all.getAttribute("label");
            expect(menu.lastElementChild === all || [...menu.children].indexOf(all) > [...menu.children].indexOf(entry(menu, "wv-note-cite-link")),
                "after the link entry, with the note-wide entries").to.equal(true);
            run(menu, "wv-note-cite-all");
        }
        finally { closeMenu(menu); }
        const counted = () => { try { const r = wv._wvNcLinks(ed.f, { mode: "all" }); return JSON.stringify(r.links.map((l) => [l.href.slice(-22), wv._wvNcPlan(l, lib(), true).ok])); } catch (e) { return String(e); } };
        expect(label, "the count: the two fresh links " + counted()).to.equal("Add Citations After All Links (2)");
        expect(await wvT.waitFor(() => (following(saved(), sel(P2.key)) || []).length ? true : null, 8000)).to.equal(true);
        const cites = () => [...ed.d.querySelectorAll(".ProseMirror p")].filter((p) => /Batch/.test(p.textContent) && p.querySelector(".citation")).length;
        expect(cites(), "both").to.equal(2);
        undo();
        expect(await wvT.waitFor(() => (cites() === 0 ? true : null), 5000), "one Ctrl+Z, both gone").to.equal(true);
        expect(!!linkByText("jones one") && !!linkByText("jones two"), "the links stay").to.equal(true);
        void before;
    });

    it("the links in a selection", async function () {
        const W = Components.utils.waiveXrays(ed.f.contentWindow);
        // Select from the start of "Batch one" to the end of "Batch two".
        const n = W.eval("(function () { const v = window._currentEditorInstance._editorCore.view; let a = -1, b = -1;"
            + " v.state.doc.descendants((nd, p) => { if (nd.isText && nd.text.startsWith('Batch one')) a = p; if (nd.isText && nd.text === 'jones two') b = p + nd.nodeSize; });"
            + " v.dispatch(v.state.tr.setSelection(v.state.selection.constructor.create(v.state.doc, a, b))); return a > 0 && b > a; })()");
        expect(n, "selection set").to.equal(true);
        const menu = menuAt(linkByText("jones one"));
        let label = "";
        try {
            const mi = entry(menu, "wv-note-cite-sel");
            expect(mi, "Add Citations After Links in Selection").to.be.ok;
            label = mi.getAttribute("label");
            run(menu, "wv-note-cite-sel");
        }
        finally { closeMenu(menu); }
        expect(label).to.equal("Add Citations After Links in Selection (2)");
        expect(await wvT.waitFor(() => ([...ed.d.querySelectorAll(".ProseMirror p")].filter((p) => /Batch/.test(p.textContent) && p.querySelector(".citation")).length === 2 ? true : null), 5000)).to.equal(true);
    });

    it("the setting off: no entries", async function () {
        await wvT.withPref("weavero.noteLinkCitations", false, async () => {
            const menu = menuAt(linkByText("page two"));
            try { expect(menu.querySelector("[id^='wv-note-cite']"), "none").to.equal(null); }
            finally { closeMenu(menu); }
        });
    });
});
