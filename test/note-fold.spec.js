/* global describe, it, before, after, expect, Zotero, Components, IOUtils, PathUtils */

// Heading folding in the note editor (note-nav.ts + the injected bundle's
// wvNoteFold plugin, 2026-11-03). Contracts:
//  - an arrow on every top-level heading that has something under it,
//    none on a heading followed at once by one of its own or a higher level;
//  - a fold hides every block down to the next heading of the same or a
//    higher level, nested folds compose, and NOTHING reaches the note
//    (HTML and modified date unchanged -- a fold carries no steps);
//  - folds are remembered per note (weavero/note-view.json) and come back
//    when the note is opened again;
//  - the caret landing in a folded section opens it;
//  - the Fold switch and a disable (_stripNotes) show the whole note again.

describe("Weavero — note heading folding", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, note, other, ed;
    const NEEDLE = "WV-FOLD-SPEC";
    const HTML = '<div data-schema-version="9">'
        + "<h1>" + NEEDLE + " Alpha</h1><p>alpha body one</p><p>alpha body two</p>"
        + "<h2>Alpha child</h2><p>child body</p>"
        + "<h1>Beta</h1><h2>Beta child</h2><p>beta body</p>"
        + "<h2>Empty child</h2>"
        + "<h1>Gamma</h1><ul><li><p>gamma list</p></li></ul>"
        + "</div>";

    const clone = (o, w) => Components.utils.cloneInto(o, w);

    async function openInPane() {
        await ZP.selectItem(note.id);
        return wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            for (const ne of doc.querySelectorAll("note-editor")) {
                const f = ne.querySelector("iframe");
                const d = f && f.contentDocument;
                if (d && ne.item && ne.item.id === note.id && d.querySelector(".ProseMirror")
                    && (d.body.textContent || "").includes(NEEDLE) && d.querySelector(".wv-fold-toggle")) {
                    return { ne, f, d };
                }
            }
            return null;
        }, 45000, 400);
    }
    const heads = () => [...ed.d.querySelectorAll(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")];
    const headByText = (t) => heads().find((h) => (h.textContent || "").trim().startsWith(t));
    const blockByText = (t) => [...ed.d.querySelectorAll(".ProseMirror > *")].find((b) => (b.textContent || "").includes(t));
    const shown = (el) => !!el && ed.d.defaultView.getComputedStyle(el).display !== "none";
    function press(h) {
        const tog = h.querySelector(".wv-fold-toggle");
        if (!tog) throw new Error("no fold arrow on " + h.textContent);
        tog.dispatchEvent(new ed.d.defaultView.MouseEvent("mousedown",
            clone({ bubbles: true, cancelable: true, button: 0 }, ed.d.defaultView)));
    }
    const view = () => ed.f.contentWindow.wrappedJSObject._currentEditorInstance._editorCore.view;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvNoteNavWire", "_wvNoteFoldOn", "_wvNnFoldRestore", "_wvNoteNavRefreshAll"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(HTML);
        await note.saveTx();
        other = new Zotero.Item("book");
        other.libraryID = Zotero.Libraries.userLibraryID;
        other.setField("title", "WV-FOLD-SPEC other");
        await other.saveTx();
        ed = await openInPane();
    });

    after(async function () {
        for (const it of [note, other]) { if (it) { try { await it.eraseTx(); } catch (e) {} } }
        try { if (wv._wvNv) { delete wv._wvNv.folds[note.libraryID + ":" + note.key]; wv._wvNvSave(); } } catch (e) {}
    });

    it("draws an arrow only where a heading has something to fold", function () {
        expect(ed, "note editor with fold arrows").to.be.ok;
        const withArrow = heads().filter((h) => h.querySelector(".wv-fold-toggle")).map((h) => h.textContent.trim());
        expect(withArrow).to.deep.equal([NEEDLE + " Alpha", "Alpha child", "Beta", "Beta child", "Gamma"]);
        expect(headByText("Empty child").querySelector(".wv-fold-toggle"), "nothing under it before the h1").to.equal(null);
        expect(ed.d.body.classList.contains("wv-fold-on"), "the gutter class").to.equal(true);
        // Zotero's tree twisty (chevron-8.svg), not a drawn triangle (MJT 2026-11-04).
        const path = headByText("Beta").querySelector(".wv-fold-toggle svg path");
        expect(path && path.getAttribute("d"), "chevron-8").to.match(/^M0 2\.70711L4 6\.70711L8 2\.70711/);
    });

    it("hides down to the next heading of the same or a higher level; the note is untouched", async function () {
        const it0 = /** @type {any} */ (Zotero.Items.get(note.id));
        const html0 = it0.getNote(), mod0 = it0.dateModified;
        press(headByText(NEEDLE + " Alpha"));
        await wvT.waitFor(() => !shown(blockByText("alpha body one")), 5000);
        for (const t of ["alpha body one", "alpha body two", "child body"]) expect(shown(blockByText(t)), t).to.equal(false);
        expect(shown(headByText("Alpha child")), "the sub-heading goes too").to.equal(false);
        expect(shown(headByText("Beta")), "the next h1 stays").to.equal(true);
        expect(headByText(NEEDLE + " Alpha").classList.contains("wv-fold-folded")).to.equal(true);
        // Folded = the chevron turned to point at the text, as a closed tree row.
        const turn = () => ed.d.defaultView.getComputedStyle(headByText(NEEDLE + " Alpha").querySelector(".wv-fold-toggle svg")).transform;
        expect(await wvT.waitFor(() => /^matrix\([^,]+, -1, 1,/.test(turn()), 2000), "turned -90deg: " + turn()).to.equal(true);
        await wvT.sleep(1500);   // past the editor's save debounce
        const it1 = /** @type {any} */ (Zotero.Items.get(note.id));
        expect(it1.getNote(), "stored HTML").to.equal(html0);
        expect(it1.dateModified, "modified date").to.equal(mod0);
    });

    it("nested folds compose: opening the parent keeps the child folded", async function () {
        press(headByText(NEEDLE + " Alpha"));   // open Alpha
        await wvT.waitFor(() => shown(blockByText("alpha body one")), 5000);
        press(headByText("Alpha child"));
        await wvT.waitFor(() => !shown(blockByText("child body")), 5000);
        press(headByText(NEEDLE + " Alpha"));   // fold Alpha (hides the folded child too)
        await wvT.waitFor(() => !shown(blockByText("alpha body one")), 5000);
        press(headByText(NEEDLE + " Alpha"));   // open Alpha again
        await wvT.waitFor(() => shown(blockByText("alpha body one")), 5000);
        expect(shown(headByText("Alpha child")), "child heading back").to.equal(true);
        expect(shown(blockByText("child body")), "child body still folded").to.equal(false);
    });

    it("remembers the folds per note and restores them when the note opens again", async function () {
        const key = note.libraryID + ":" + note.key;
        // The store follows the folds through a 150-ms debounce: wait for the
        // last state, the test above having left it a moment ago. (Until the
        // page's code rendered on arrival, 2026-11-04, a note's first fold
        // was not stored at all, so the only entry here was this one.)
        const saved = await wvT.waitFor(() => {
            const s = wv._wvNv && wv._wvNv.folds[key];
            return s && s.length === 1 && s[0].t === "Alpha child" ? s : null;
        }, 5000);
        expect(saved, "fold entry for the note, in its last state").to.be.ok;
        expect(saved.map((e) => e.t)).to.deep.equal(["Alpha child"]);
        await wvT.sleep(800);   // the store's write debounce
        const file = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "note-view.json");
        const onDisk = JSON.parse(await IOUtils.readUTF8(file));
        expect(onDisk.producer).to.equal("weavero");
        expect(onDisk.folds[key], "written to note-view.json").to.deep.equal(saved);
        await ZP.selectItem(other.id);
        await wvT.sleep(500);
        ed = await openInPane();
        expect(ed, "note open again").to.be.ok;
        const back = await wvT.waitFor(() => headByText("Alpha child")
            && headByText("Alpha child").classList.contains("wv-fold-folded"), 10000);
        expect(back, "Alpha child folded again").to.equal(true);
        expect(shown(blockByText("child body"))).to.equal(false);
        expect(shown(blockByText("alpha body one"))).to.equal(true);
    });

    it("the caret landing inside a folded section opens it", async function () {
        // Both steps run IN the page: a node handed to a chrome callback by
        // content code is an Xray, whose prototype getters (isText) read
        // undefined (the first run found no position this way).
        const pos = Components.utils.waiveXrays(ed.f.contentWindow).eval(
            "(function () { const v = window._currentEditorInstance._editorCore.view; let pos = -1;"
            + " v.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text.includes('child body')) pos = p + 2; });"
            + " if (pos > 0) v.dispatch(v.state.tr.setSelection(v.state.selection.constructor.create(v.state.doc, pos)));"
            + " return pos; })()");
        expect(pos, "position in the folded body").to.be.above(0);
        expect(await wvT.waitFor(() => shown(blockByText("child body")), 5000), "opened by the caret").to.equal(true);
        expect(headByText("Alpha child").classList.contains("wv-fold-folded")).to.equal(false);
    });

    it("the Fold switch takes the arrows and the folds away, and back", async function () {
        press(headByText("Beta"));
        await wvT.waitFor(() => !shown(blockByText("beta body")), 5000);
        await wvT.withPref("weavero.noteFolding", false, async () => {
            wv._wvNoteNavRefreshAll();
            expect(await wvT.waitFor(() => !ed.d.querySelector(".wv-fold-toggle") && shown(blockByText("beta body")), 5000),
                "no arrows, nothing hidden").to.equal(true);
            expect(ed.d.body.classList.contains("wv-fold-on")).to.equal(false);
        });
        wv._wvNoteNavRefreshAll();
        expect(await wvT.waitFor(() => !!ed.d.querySelector(".wv-fold-toggle") && !shown(blockByText("beta body")), 5000),
            "arrows and the Beta fold back").to.equal(true);
    });

    it("a disable shows the whole note; re-wiring brings the arrows back", async function () {
        wv._stripNotes();
        expect(await wvT.waitFor(() => shown(blockByText("beta body")) && !ed.d.querySelector(".wv-fold-toggle"), 5000),
            "everything visible after the strip").to.equal(true);
        expect(ed.ne.querySelector(".wv-note-outline"), "outline panel removed").to.equal(null);
        ed = await openInPane();
        expect(ed && ed.d.querySelector(".wv-fold-toggle"), "re-wired").to.be.ok;
    });
});
