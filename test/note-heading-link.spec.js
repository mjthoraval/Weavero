/* global describe, it, before, after, expect, Zotero, Components */

// Links to a heading inside a note (note-nav.ts, 2026-11-03; the second
// Weavero-only link exception, MJT's OK the same day). Contracts:
//  - "Copy Link to Heading" writes a random `id` onto a heading that has
//    none, ONCE (a second copy reuses it), and splits a shared one;
//  - the link is zotero://select/<lib>/items/<noteKey>?wvheading=<id> and
//    the id reaches the SAVED note;
//  - Weavero's handler and the ZoteroPane.loadURI hook select the note and
//    bring the heading to the reading line, opening a fold over it;
//  - a read-only note cannot take an id: the page refuses, the menu entry
//    is greyed (still enabled when the heading already has a unique id);
//  - the entry sits at the top of the note's own right-click menu when the
//    click was in a heading.

describe("Weavero — links to a note heading", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, note, dup, ed;
    const NEEDLE = "WV-HLINK-SPEC";
    const paras = (w, n) => Array.from({ length: n }, (_, i) => "<p>" + w + " " + i + "</p>").join("");
    const HTML = '<div data-schema-version="9">'
        + "<h1>" + NEEDLE + " Top</h1>" + paras("top", 30)
        + "<h2>Middle</h2>" + paras("middle", 30)
        + "<h3>Deep</h3>" + paras("deep", 40)
        + "</div>";

    async function openInPane(item) {
        await ZP.selectItem(item.id);
        return wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            for (const ne of doc.querySelectorAll("note-editor")) {
                const f = ne.querySelector("iframe");
                const d = f && f.contentDocument;
                if (d && ne.item && ne.item.id === item.id && !ne.classList.contains("note-tab")
                    && d.querySelector(".ProseMirror") && d.querySelector(".wv-fold-toggle")) {
                    // The page's editor instance must be the chrome side's: a
                    // note selected right after another leaves the page on an
                    // orphaned instance for the OTHER note for a while (seen
                    // on 11.0-beta.3: the id went into a document nobody saved).
                    const ci = f.contentWindow.wrappedJSObject._currentEditorInstance;
                    if (!ci || !ne._editorInstance || ci.instanceID !== ne._editorInstance.instanceID) continue;
                    return { ne, f, d };
                }
            }
            return null;
        }, 45000, 400);
    }
    const heads = () => JSON.parse(String(ed.f.contentWindow.wrappedJSObject.__wvNoteHeadings()));
    const headEl = (t) => [...ed.d.querySelectorAll(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")]
        .find((h) => (h.textContent || "").trim().endsWith(t));

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvNoteCopyHeadingLink", "_wvNoteRevealHeading", "_wvNnLinkMenuItem", "_wvNnOnMenuShowing"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        win.Zotero_Tabs.select("zotero-pane");
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(HTML);
        // skipSelect: Zotero's items tree selects a note it sees added, and
        // the item pane then starts loading it -- two creations in a row
        // raced the editor into the orphaned-instance state above.
        await note.saveTx({ skipSelect: true });
        dup = new Zotero.Item("note");
        dup.libraryID = Zotero.Libraries.userLibraryID;
        dup.setNote('<div data-schema-version="9"><h1 id="dup">' + NEEDLE + ' One</h1><p>a</p><h1 id="dup">Two</h1><p>b</p></div>');
        await dup.saveTx({ skipSelect: true });
        ed = await openInPane(note);
    });

    after(async function () {
        for (const it of [note, dup]) { if (it) { try { await it.eraseTx(); } catch (e) {} } }
    });

    let link = "", id = "";

    it("copies a select link with the heading's new id, and the id reaches the saved note", async function () {
        expect(ed, "note editor").to.be.ok;
        const ord = heads().findIndex((h) => h.text === "Deep");
        expect(heads()[ord].id, "no id yet").to.equal("");
        link = wv._wvNoteCopyHeadingLink(ed.ne, ord);
        expect(link).to.match(new RegExp("^zotero://select/library/items/" + note.key + "\\?wvheading=wv-[a-z0-9]+$"));
        id = decodeURIComponent(link.split("wvheading=")[1]);
        expect(heads()[ord].id, "id on the heading").to.equal(id);
        const saved = await wvT.waitFor(() => (/** @type {any} */ (Zotero.Items.get(note.id)).getNote().includes('id="' + id + '"') ? true : null), 15000, 300);
        let diag = "";
        if (!saved) {
            // What the editor looks like when the save never came (first run,
            // runner on 11.0-beta.3: the id was on the heading, the note never
            // changed, and every later page call found no headings).
            try {
                const wj = ed.f.contentWindow.wrappedJSObject;
                const ci = wj._currentEditorInstance;
                const v = ci && ci._editorCore && ci._editorCore.view;
                diag = " " + JSON.stringify({
                    neConnected: ed.ne.isConnected, neItem: ed.ne.item && ed.ne.item.id, mode: ed.ne.mode,
                    sameDoc: ed.f.contentDocument === ed.d, api: typeof wj.__wvNoteHeadings, ci: !!ci,
                    childCount: v && v.state.doc.childCount, docChanged: ci && ci._editorCore && ci._editorCore.docChanged,
                    headsNow: heads().length, html: /** @type {any} */ (Zotero.Items.get(note.id)).getNote().slice(0, 120),
                    firstText: v && v.state.doc.firstChild && String(v.state.doc.firstChild.textContent).slice(0, 40),
                    editors: [...doc.querySelectorAll("note-editor")].map((x) => (x.item ? x.item.id : "-") + ":" + x.className
                        + ":" + (x._editorInstance ? x._editorInstance.instanceID : "-")),
                    pageInst: ci && ci.instanceID, selected: ZP.getSelectedItems().map((i) => i.id),
                    errors: (Zotero.getErrors(true) || []).slice(-3).map((e) => String(e).slice(0, 160)),
                });
            }
            catch (e) { diag = " diag failed: " + e; }
        }
        expect(saved, "the id is in the saved note" + diag).to.equal(true);
        const clip = Zotero.Utilities.Internal.getClipboard("text/plain");
        expect(clip, "on the clipboard").to.equal(link);
    });

    it("a second copy reuses the id (no second write)", function () {
        const ord = heads().findIndex((h) => h.text === "Deep");
        const res = JSON.parse(String(ed.f.contentWindow.wrappedJSObject.__wvHeadingEnsureId(ord)));
        expect(res).to.deep.equal({ id, written: false });
        expect(wv._wvNoteCopyHeadingLink(ed.ne, ord)).to.equal(link);
    });

    it("the link selects the note and brings the heading to the reading line, opening a fold over it", async function () {
        // Fold the section holding "Deep" first.
        const wj = ed.f.contentWindow.wrappedJSObject;
        wj.__wvFoldToggle(heads().findIndex((h) => h.text === "Middle"));
        expect(await wvT.waitFor(() => heads().find((h) => h.text === "Deep").hidden, 5000), "Deep hidden").to.equal(true);
        await ZP.selectItem(dup.id);
        await wvT.sleep(400);
        await wv.handleZoteroURI(link);
        ed = await openInPane(note);
        const sc = () => ed.d.querySelector(".editor-core");
        const landed = await wvT.waitFor(() => {
            const el = headEl("Deep");
            if (!el || !el.getClientRects().length) return null;
            const dy = el.getBoundingClientRect().top - sc().getBoundingClientRect().top;
            return Math.abs(dy - sc().clientHeight * 0.25) < 6 ? true : null;
        }, 10000);
        expect(landed, "Deep on the reading line").to.equal(true);
        expect(heads().find((h) => h.text === "Middle").folded, "the fold over it opened").to.equal(false);
        expect(ZP.getSelectedItems().map((i) => i.id)).to.deep.equal([note.id]);
    });

    // MJT 2026-11-05: the link scrolled to the heading but never lit it up in
    // the My Library tab. The flash is drawn by the page plugin, and a note
    // loaded into the item pane's open editor gets a new view without it.
    // Not through openInPane: its loop drives the sweep that hid this.
    it("the link lights the heading up in the item pane, with no sweep to help it", async function () {
        await ZP.selectItem(dup.id);
        await wvT.sleep(800);
        await wv.handleZoteroURI(link);
        const lit = await wvT.waitFor(() => {
            for (const ne of doc.querySelectorAll("note-editor")) {
                const f = ne.querySelector("iframe");
                const d = f && f.contentDocument;
                if (!d || !ne.item || ne.item.id !== note.id || ne.classList.contains("note-tab")) continue;
                const el = d.querySelector(".ProseMirror .wv-nn-flash");
                if (el) return (el.textContent || "").trim();
            }
            return null;
        }, 6000, 30);
        expect(lit, "the heading's text flashes").to.equal("Deep");
        ed = await openInPane(note);
    });

    it("the loadURI hook routes a heading link to Weavero", async function () {
        const top = heads().findIndex((h) => h.text.endsWith("Top"));
        const topLink = wv._wvNoteCopyHeadingLink(ed.ne, top);
        ed.d.querySelector(".editor-core").scrollTop = 99999;
        // The ring is capped (it shifts at 200): look for the entry, not a count.
        ZP.loadURI(topLink);
        expect(await wvT.waitFor(() => (/** @type {any} */ (Zotero)._wvLinkLog || []).some((l) => /intercepted note-heading/.test(String(l))), 5000),
            "intercepted").to.equal(true);
        const landed = await wvT.waitFor(() => {
            const el = headEl("Top");
            const sc = ed.d.querySelector(".editor-core");
            return el && sc.scrollTop < sc.scrollHeight / 2 ? true : null;
        }, 10000);
        expect(landed, "scrolled back up to Top").to.equal(true);
    });

    it("a shared id is split: the linked heading gets its own", async function () {
        const ed2 = await openInPane(dup);
        expect(ed2, "dup note").to.be.ok;
        const ord = 1;
        const l2 = wv._wvNoteCopyHeadingLink(ed2.ne, ord);
        const h2 = JSON.parse(String(ed2.f.contentWindow.wrappedJSObject.__wvNoteHeadings()));
        expect(h2[0].id, "first keeps its id").to.equal("dup");
        expect(h2[1].id).to.match(/^wv-/);
        expect(l2).to.match(new RegExp("wvheading=" + h2[1].id + "$"));
        ed = await openInPane(note);
    });

    it("a read-only note: the page refuses an id, the menu entry is greyed unless the id exists", function () {
        const wj = ed.f.contentWindow.wrappedJSObject;
        const core = wj._currentEditorInstance._editorCore;
        const ord = heads().findIndex((h) => h.text === "Middle");
        const was = core.readOnly;
        core.readOnly = true;
        try {
            expect(JSON.parse(String(wj.__wvHeadingEnsureId(ord)))).to.deep.equal({ error: "read-only" });
        }
        finally { core.readOnly = was; }
        const hs = heads();
        const fakeRo = { mode: "view" };
        expect(wv._wvNnLinkMenuItem(doc, fakeRo, hs, hs[ord]).hasAttribute("disabled"), "no id: greyed").to.equal(true);
        const deep = hs.find((h) => h.text === "Deep");
        expect(wv._wvNnLinkMenuItem(doc, fakeRo, hs, deep).hasAttribute("disabled"), "unique id: still links").to.equal(false);
    });

    it("the entry sits at the top of the note's own menu after a right-click in a heading", function () {
        const menu = ed.ne.querySelector("#editor-menu");
        expect(menu, "Zotero's note menu").to.be.ok;
        const el = headEl("Middle");
        wv._wvNnOnContext({ target: el.firstChild || el }, ed.ne, ed.f);
        const z = doc.createXULElement("menuitem");
        z.setAttribute("label", "zotero item");
        menu.appendChild(z);
        try {
            menu.dispatchEvent(new win.Event("popupshowing"));
            expect(menu.firstElementChild && menu.firstElementChild.id).to.equal("wv-note-heading-link");
            expect(menu.firstElementChild.getAttribute("label")).to.equal("Copy Select Link to Heading");
            expect(menu.firstElementChild.nextElementSibling.id, "the open link under it").to.equal("wv-note-heading-link-open");
            expect(menu.firstElementChild.nextElementSibling.getAttribute("label")).to.equal("Copy Open Link to Heading");
            menu.dispatchEvent(new win.Event("popuphidden"));
            expect(menu.querySelector("#wv-note-heading-link"), "removed on close").to.equal(null);
            expect(menu.querySelector("#wv-note-heading-link-open"), "both").to.equal(null);
            // A right-click outside a heading adds nothing.
            wv._wvNnOnContext({ target: ed.d.querySelector(".ProseMirror p") }, ed.ne, ed.f);
            menu.dispatchEvent(new win.Event("popupshowing"));
            expect(menu.querySelector("#wv-note-heading-link")).to.equal(null);
        }
        finally { z.remove(); }
    });
});
