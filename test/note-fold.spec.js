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

// List folding (MJT 2026-11-09, "the Obsidian way"). Contracts:
//  - an arrow on every list item, bulleted or numbered, that holds anything
//    under its first line (sub-items or further paragraphs); none on a
//    one-line item;
//  - a fold hides everything in the item after its first line, nested folds
//    compose, the items after it stay, and NOTHING reaches the note;
//  - list folds are remembered per note with the heading folds
//    (weavero/note-view.json, entries {k: "li"}) and come back;
//  - the caret landing in a folded item opens it;
//  - "Fold All" / "Unfold All" end the note's own menu and cover headings
//    and lists at every level, each disabled when it has nothing to do;
//  - the Fold switch takes list arrows and list folds away too.
describe("Weavero — note list folding", function () {
    this.timeout(120000);
    let wv, win, doc, ZP, note, other, ed;
    const NEEDLE = "WV-LISTFOLD-SPEC";
    const HTML = '<div data-schema-version="9">'
        + "<h1>" + NEEDLE + "</h1>"
        + "<ul><li><p>Methods</p><p>methods second paragraph</p>"
        + "<ul><li><p>Setup</p></li><li><p>Imaging</p><ul><li><p>camera detail</p></li></ul></li></ul></li>"
        + "<li><p>Results</p></li></ul>"
        + "<ol><li><p>First step</p><ol><li><p>first sub</p></li></ol></li>"
        + "<li><p>Second step</p></li><li><p>Third step</p></li></ol>"
        + "<h2>Tail</h2><p>tail body</p>"
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
    const items = () => [...ed.d.querySelectorAll(".ProseMirror li")];
    const first = (li) => li && li.firstElementChild;
    const itemByText = (t) => items().find((li) => first(li) && (first(li).textContent || "").trim() === t);
    const paraByText = (t) => [...ed.d.querySelectorAll(".ProseMirror p")].find((p) => (p.textContent || "").trim() === t);
    const arrowOf = (li) => first(li) ? first(li).querySelector(":scope > .wv-fold-toggle") : null;
    // A block inside a hidden one keeps its own display: look at its boxes.
    const visible = (el) => !!el && el.getClientRects().length > 0;
    const folded = (t) => !!first(itemByText(t)) && first(itemByText(t)).classList.contains("wv-fold-folded");
    function press(li) {
        const tog = arrowOf(li);
        if (!tog) throw new Error("no fold arrow on " + (li && li.textContent));
        tog.dispatchEvent(new ed.d.defaultView.MouseEvent("mousedown",
            clone({ bubbles: true, cancelable: true, button: 0 }, ed.d.defaultView)));
    }
    const counts = () => { try { return String(ed.f.contentWindow.wrappedJSObject.__wvFoldCounts()); } catch (e) { return "?" + e; } };
    function menuOpen(target) {
        const menu = ed.ne.querySelector("#editor-menu");
        wv._wvNnOnContext({ target }, ed.ne, ed.f);
        menu.dispatchEvent(new win.Event("popupshowing"));
        return menu;
    }

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvNoteNavWire", "_wvNoteFoldOn", "_wvNnFoldRestore", "_wvNoteNavRefreshAll", "_wvNnOnMenuShowing"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(HTML);
        await note.saveTx();
        other = new Zotero.Item("book");
        other.libraryID = Zotero.Libraries.userLibraryID;
        other.setField("title", "WV-LISTFOLD-SPEC other");
        await other.saveTx();
        ed = await openInPane();
    });

    after(async function () {
        for (const it of [note, other]) { if (it) { try { await it.eraseTx(); } catch (e) {} } }
        try { if (wv._wvNv) { delete wv._wvNv.folds[note.libraryID + ":" + note.key]; wv._wvNvSave(); } } catch (e) {}
    });

    it("draws an arrow only on items with something under their first line, in both kinds of list", function () {
        expect(ed, "note editor with fold arrows").to.be.ok;
        const withArrow = items().filter((li) => arrowOf(li)).map((li) => first(li).textContent.trim());
        expect(withArrow).to.deep.equal(["Methods", "Imaging", "First step"]);
        const path = arrowOf(itemByText("Imaging")).querySelector("svg path");
        expect(path && path.getAttribute("d"), "the heading folds' chevron-8").to.match(/^M0 2\.70711L4 6\.70711L8 2\.70711/);
    });

    it("each arrow hugs its block's grab handle on the left, headings and list items, in both views", async function () {
        // Zotero's own handle (note-editor drag.js), brought up by a mouse
        // move over the block, as a pointer would (MJT 2026-11-09: "left of
        // the grab handle, same as for titles"; "In narrow windows, cannot
        // click the arrow to fold"; "a gap between the arrow and the handle
        // where the arrow is not visible"; "Does the horizontal gap need to
        // be so large?"). The item pane, where this note is, uses the "wide"
        // view: there Zotero's handle offset is an invalid var() and every
        // handle sat at the editor's left edge, on the arrows
        // (WV-TEMP-DRAGHANDLE in note-editor.ts). Note tabs use
        // "comfortable". The handle's dots start 8px into its box.
        const W = ed.d.defaultView;
        const root = ed.d.documentElement, mode = root.getAttribute("contentViewMode");
        const h1 = () => [...ed.d.querySelectorAll(".ProseMirror h1")].find((h) => h.textContent.includes(NEEDLE));
        const blocks = [{ t: "Methods", get: () => first(itemByText("Methods")) },
            { t: "Imaging", get: () => first(itemByText("Imaging")) },
            { t: "First step", get: () => first(itemByText("First step")) }, { t: "the h1", get: h1 }];
        try {
            for (const view of ["wide", "comfortable"]) {
                root.setAttribute("contentViewMode", view);
                for (const { t, get } of blocks) {
                    const el = get();
                    el.dispatchEvent(new W.MouseEvent("mousemove", clone({ bubbles: true }, W)));
                    const handle = await wvT.waitFor(() => {
                        const h = ed.d.querySelector(".drag-handle");
                        if (!h || W.getComputedStyle(h).display === "none") return null;
                        const hr = h.getBoundingClientRect(), er = el.getBoundingClientRect();
                        return Math.abs(hr.top + 2 - er.top) < 3 ? hr : null;   // on this block's line
                    }, 3000);
                    expect(handle, view + ", " + t + ": Zotero's grab handle on the block").to.be.ok;
                    const a = el.querySelector(":scope > .wv-fold-toggle").getBoundingClientRect();
                    const chev = el.querySelector(":scope > .wv-fold-toggle svg").getBoundingClientRect();
                    const dots = handle.left + 8;
                    const where = view + ", " + t + ": chevron " + JSON.stringify([chev.left, chev.right])
                        + ", handle " + JSON.stringify([handle.left, handle.right]);
                    expect(chev.right, where + " -- left of the dots").to.be.at.most(dots - 2);
                    expect(chev.right, where + " -- close to them").to.be.at.least(dots - 6);
                    // Across the row from the arrow's left edge to the end of
                    // the handle: the arrow, then the handle's dots -- never a
                    // strip that is neither, and the arrow above the handle's
                    // empty left part, so a press there folds.
                    const y = (a.top + a.bottom) / 2, row = [];
                    for (let x = Math.ceil(a.left); x < handle.right; x++) {
                        const at = ed.d.elementFromPoint(x, y);
                        row.push(!at ? "-" : at.closest && at.closest(".wv-fold-toggle") ? "A"
                            : at.classList.contains("drag-handle") ? "H" : "x");
                    }
                    expect(row.join(""), where + " -- A arrow, H handle").to.match(/^A+H+$/);
                    expect(row.indexOf("H") + Math.ceil(a.left), where + " -- the handle starts at its dots").to.be.within(dots - 2, dots + 1);
                    // The pointer on the handle keeps the arrow lit (MJT 2026-11-09).
                    const hEl = ed.d.querySelector(".drag-handle"), arrowEl = el.querySelector(":scope > .wv-fold-toggle");
                    const op = () => W.getComputedStyle(arrowEl).opacity;
                    hEl.dispatchEvent(new W.MouseEvent("mouseover", clone({ bubbles: true }, W)));
                    expect(op(), view + ", " + t + ": lit while the pointer is on the handle").to.equal("1");
                    hEl.dispatchEvent(new W.MouseEvent("mouseout", clone({ bubbles: true }, W)));
                    expect(op(), view + ", " + t + ": out again when it leaves").to.equal("0");
                }
            }
        }
        finally {
            if (mode == null) root.removeAttribute("contentViewMode");
            else root.setAttribute("contentViewMode", mode);
        }
    });

    it("hides everything under the item's first line; the next items stay; the note is untouched", async function () {
        const it0 = /** @type {any} */ (Zotero.Items.get(note.id));
        const html0 = it0.getNote(), mod0 = it0.dateModified;
        press(itemByText("Methods"));
        await wvT.waitFor(() => !visible(paraByText("methods second paragraph")), 5000);
        for (const t of ["methods second paragraph", "Setup", "Imaging", "camera detail"]) {
            expect(visible(paraByText(t)), t).to.equal(false);
        }
        expect(visible(paraByText("Methods")), "the first line stays").to.equal(true);
        expect(visible(paraByText("Results")), "the next item stays").to.equal(true);
        expect(folded("Methods")).to.equal(true);
        const turn = () => ed.d.defaultView.getComputedStyle(arrowOf(itemByText("Methods")).querySelector("svg")).transform;
        expect(await wvT.waitFor(() => /^matrix\([^,]+, -1, 1,/.test(turn()), 2000), "turned -90deg: " + turn()).to.equal(true);
        // A numbered list: the sub-list goes, the outer items stay.
        press(itemByText("First step"));
        await wvT.waitFor(() => !visible(paraByText("first sub")), 5000);
        for (const t of ["First step", "Second step", "Third step"]) expect(visible(paraByText(t)), t).to.equal(true);
        await wvT.sleep(1500);   // past the editor's save debounce
        const it1 = /** @type {any} */ (Zotero.Items.get(note.id));
        expect(it1.getNote(), "stored HTML").to.equal(html0);
        expect(it1.dateModified, "modified date").to.equal(mod0);
    });

    it("nested folds compose: opening the parent keeps the child folded", async function () {
        press(itemByText("First step"));   // open
        press(itemByText("Methods"));      // open
        await wvT.waitFor(() => visible(paraByText("Imaging")), 5000);
        press(itemByText("Imaging"));
        await wvT.waitFor(() => !visible(paraByText("camera detail")), 5000);
        press(itemByText("Methods"));      // fold, the folded child inside
        await wvT.waitFor(() => !visible(paraByText("Imaging")), 5000);
        press(itemByText("Methods"));      // open again
        await wvT.waitFor(() => visible(paraByText("Imaging")), 5000);
        expect(visible(paraByText("first sub")), "First step open").to.equal(true);
        expect(visible(paraByText("camera detail")), "camera detail still folded").to.equal(false);
        expect(folded("Imaging")).to.equal(true);
    });

    it("remembers the list folds per note and restores them when the note opens again", async function () {
        const key = note.libraryID + ":" + note.key;
        const saved = await wvT.waitFor(() => {
            const s = wv._wvNv && wv._wvNv.folds[key];
            const li = s && s.filter((e) => e && e.k === "li");
            return li && li.length === 1 && li[0].t === "Imaging" ? li : null;
        }, 5000);
        expect(saved, "one list entry, Imaging").to.be.ok;
        await wvT.sleep(800);   // the store's write debounce
        const file = PathUtils.join(Zotero.DataDirectory.dir, "weavero", "note-view.json");
        const onDisk = JSON.parse(await IOUtils.readUTF8(file));
        expect((onDisk.folds[key] || []).filter((e) => e.k === "li"), "written to note-view.json").to.deep.equal(saved);
        await ZP.selectItem(other.id);
        await wvT.sleep(500);
        ed = await openInPane();
        expect(ed, "note open again").to.be.ok;
        expect(await wvT.waitFor(() => folded("Imaging"), 10000), "Imaging folded again").to.equal(true);
        expect(visible(paraByText("camera detail"))).to.equal(false);
        expect(visible(paraByText("Imaging"))).to.equal(true);
    });

    it("the caret landing inside a folded item opens it", async function () {
        expect(folded("Imaging") && !visible(paraByText("camera detail")), "precondition: Imaging folded").to.equal(true);
        const pos = Components.utils.waiveXrays(ed.f.contentWindow).eval(
            "(function () { const v = window._currentEditorInstance._editorCore.view; let pos = -1;"
            + " v.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text.includes('camera detail')) pos = p + 2; });"
            + " if (pos > 0) v.dispatch(v.state.tr.setSelection(v.state.selection.constructor.create(v.state.doc, pos)));"
            + " return pos; })()");
        expect(pos, "position in the folded item").to.be.above(0);
        expect(await wvT.waitFor(() => visible(paraByText("camera detail")), 5000), "opened by the caret").to.equal(true);
        expect(folded("Imaging")).to.equal(false);
    });

    it("Fold All and Unfold All end the note's menu and cover headings and lists", async function () {
        let menu = menuOpen(paraByText("Results"));
        try {
            const fa = menu.querySelector("#wv-note-fold-all"), ua = menu.querySelector("#wv-note-unfold-all");
            expect(fa, "Fold All").to.be.ok;
            expect(ua, "Unfold All").to.be.ok;
            expect(fa.getAttribute("label")).to.equal("Fold All");
            expect(ua.getAttribute("label")).to.equal("Unfold All");
            expect(menu.lastElementChild, "at the end of the menu").to.equal(ua);
            expect(ua.hasAttribute("disabled"), "nothing folded yet " + counts()).to.equal(true);
            expect(fa.hasAttribute("disabled"), "Fold All live " + counts()).to.equal(false);
            fa.dispatchEvent(new win.Event("command"));
        }
        finally { menu.dispatchEvent(new win.Event("popuphidden")); }
        for (const id of ["wv-note-fold-sep", "wv-note-fold-all", "wv-note-unfold-all"]) {
            expect(menu.querySelector("#" + id), id + " removed on close").to.equal(null);
        }
        await wvT.waitFor(() => folded("Methods"), 5000);
        for (const t of ["Methods", "Imaging", "First step"]) expect(folded(t), t + " folded").to.equal(true);
        const h1 = [...ed.d.querySelectorAll(".ProseMirror h1")].find((h) => h.textContent.includes(NEEDLE));
        expect(h1.classList.contains("wv-fold-folded"), "the heading too").to.equal(true);
        expect(visible(paraByText("Results")), "everything under the h1").to.equal(false);
        menu = menuOpen(h1);
        try {
            const fa = menu.querySelector("#wv-note-fold-all"), ua = menu.querySelector("#wv-note-unfold-all");
            expect(fa.hasAttribute("disabled"), "everything folded " + counts()).to.equal(true);
            expect(ua.hasAttribute("disabled"), "Unfold All live " + counts()).to.equal(false);
            ua.dispatchEvent(new win.Event("command"));
        }
        finally { menu.dispatchEvent(new win.Event("popuphidden")); }
        expect(await wvT.waitFor(() => visible(paraByText("camera detail")) && visible(paraByText("tail body")), 5000),
            "everything back").to.equal(true);
        expect(ed.d.querySelector(".ProseMirror .wv-fold-folded"), "no fold left").to.equal(null);
    });

    it("the Fold switch takes list arrows and list folds away, and back", async function () {
        press(itemByText("Methods"));
        await wvT.waitFor(() => !visible(paraByText("methods second paragraph")), 5000);
        await wvT.withPref("weavero.noteFolding", false, async () => {
            wv._wvNoteNavRefreshAll();
            expect(await wvT.waitFor(() => !ed.d.querySelector("li .wv-fold-toggle")
                && visible(paraByText("methods second paragraph")), 5000), "no arrows, nothing hidden").to.equal(true);
            const menu = menuOpen(paraByText("Results"));
            try { expect(menu.querySelector("#wv-note-fold-all"), "no Fold All while off").to.equal(null); }
            finally { menu.dispatchEvent(new win.Event("popuphidden")); }
        });
        wv._wvNoteNavRefreshAll();
        expect(await wvT.waitFor(() => !!arrowOf(itemByText("Methods")) && !visible(paraByText("methods second paragraph")), 5000),
            "arrows and the Methods fold back").to.equal(true);
    });

    it("after a disable and a re-wire in place, a note with no folds gets its arrows back", async function () {
        // A plugin reload or update: the old instance strips (folding off,
        // repainted), the new one wires the same page, whose bundle answers
        // "already". With no fold to restore, nothing used to repaint and
        // every arrow stayed away until the note's next edit or click
        // (2026-11-09). No reselect here: that loads a new view and repaints.
        press(itemByText("Methods"));   // open: no fold left in this note
        const key = note.libraryID + ":" + note.key;
        expect(await wvT.waitFor(() => !(wv._wvNv.folds[key] || []).length, 5000), "no saved fold").to.equal(true);
        wv._stripNotes();
        expect(await wvT.waitFor(() => !ed.d.querySelector(".wv-fold-toggle"), 5000), "stripped").to.equal(true);
        wv._processNoteEditors();
        expect(await wvT.waitFor(() => { try { wv._processNoteEditors(); } catch (e) {} return !!arrowOf(itemByText("Methods")); }, 10000),
            "arrows back without an edit").to.equal(true);
        expect(!!ed.d.querySelector(".ProseMirror h1 .wv-fold-toggle"), "the heading's too").to.equal(true);
    });

    it("a note open across an update from 1.0.0 folds its lists and takes typing", async function () {
        // MJT 2026-11-09: in notes open since before 1.0.1, a list item's
        // arrow folded nothing -- and a typed character threw. The install
        // swaps the fold plugin in one reconfigure under the SAME key, and
        // ProseMirror keeps a state field whose key is in both plugin sets:
        // 1.0.0's state ({ folded, flash }, inject 10) outlived its plugin,
        // and the new one read its missing list part. Here the page's own
        // install runs over a 1.0.0-shaped plugin, as an update does.
        const iw = Components.utils.waiveXrays(ed.f.contentWindow);
        const swapped = String(iw.eval(
            "(function () { const v = window._currentEditorInstance._editorCore.view;"
            + " const fp = v.state.plugins.find((p) => p.spec && p.spec.__wvFold);"
            + " v.updateState(v.state.reconfigure({ plugins: v.state.plugins.filter((p) => p !== fp) }));"
            + " const old = new fp.constructor({ key: fp.spec.key, __wvFold: true, __wvFoldV: 10,"
            + "   state: { init: () => ({ folded: [], flash: null }), apply: (tr, prev) => prev } });"
            + " v.updateState(v.state.reconfigure({ plugins: v.state.plugins.concat([old]) }));"
            + " const was = Object.keys(old.getState(v.state)).join(',');"
            + " return was + '|' + window.__wvInstallNoteLinkify(); })()"));
        expect(swapped, "1.0.0's state, then the current plugin installed over it").to.equal("folded,flash|installed");
        expect(await wvT.waitFor(() => !!arrowOf(itemByText("Methods")), 5000), "arrows drawn").to.equal(true);
        press(itemByText("Methods"));
        expect(await wvT.waitFor(() => folded("Methods") && !visible(paraByText("methods second paragraph")), 5000),
            "the arrow folds the item").to.equal(true);
        press(itemByText("Methods"));
        expect(await wvT.waitFor(() => !folded("Methods") && visible(paraByText("methods second paragraph")), 5000),
            "and opens it again").to.equal(true);
        const typed = String(iw.eval(
            "(function () { const v = window._currentEditorInstance._editorCore.view; let pos = -1;"
            + " v.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === 'Results') pos = p + n.nodeSize; });"
            + " try { v.dispatch(v.state.tr.insertText('!', pos)); } catch (e) { return 'threw: ' + e; }"
            + " return v.state.doc.textContent.includes('Results!') ? 'typed' : 'lost'; })()"));
        expect(typed, "a typed character").to.equal("typed");
        // Zotero saves the edit a moment later: wait for it. The after hook
        // erases this note, and a save landing on an erased note fails
        // (FOREIGN KEY on itemNotes) and sets Zotero.crash() -- every main
        // window opened later in the run then stops at "Please restart
        // Zotero" (the 1.0.2 gates' full suite, 2026-11-09: 25 failures from
        // the next real window on).
        expect(await wvT.waitFor(() => /** @type {any} */ (Zotero.Items.get(note.id)).getNote().includes("Results!") ? true : null, 15000, 300),
            "the edit saved").to.equal(true);
    });
});
