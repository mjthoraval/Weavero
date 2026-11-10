/* global describe, it, before, after, expect, Zotero, Components */

// The note outline (note-nav.ts, 2026-11-03): a panel left of the note
// editor listing its headings. Contracts:
//  - open in a note tab, folded away in the item pane (MJT 2026-11-03);
//    the toggle on its edge opens / folds it, remembered per kind;
//  - rows nest by heading level; a click brings the heading to the reading
//    line (a quarter of the way down, as the reader outline lands) and
//    marks it; the mark then follows scrolling (the last heading the line
//    has passed -- the reader outline's rule);
//  - the list follows edits; a note without headings has no panel;
//  - the Outline switch removes every panel and brings them back.

describe("Weavero — note outline", function () {
    this.timeout(150000);
    let wv, win, doc, ZP, note, bare, tabID, tab;
    const NEEDLE = "WV-OUTLINE-SPEC";
    const paras = (w, n) => Array.from({ length: n }, (_, i) => "<p>" + w + " paragraph " + i + " of filler text.</p>").join("");
    const HTML = '<div data-schema-version="9">'
        + "<h1>" + NEEDLE + " Intro</h1>" + paras("intro", 20)
        + "<h2>Background</h2>" + paras("background", 20)
        + "<h3>Detail</h3>" + paras("detail", 20)
        + "<h1>Results</h1>" + paras("results", 20)
        + "<h2>Discussion</h2>" + paras("discussion", 30)
        + "</div>";

    function editorFor(item, pred) {
        for (const ne of doc.querySelectorAll("note-editor")) {
            const f = ne.querySelector("iframe");
            const d = f && f.contentDocument;
            if (d && ne.item && ne.item.id === item.id && d.querySelector(".ProseMirror") && (!pred || pred(ne))) {
                return { ne, f, d };
            }
        }
        return null;
    }
    const rows = (ne) => [...ne.querySelectorAll(".wv-note-outline-row")];
    const rowByText = (ne, t) => rows(ne).find((r) => (r.textContent || "").trim().endsWith(t));
    const headEl = (d, t) => [...d.querySelectorAll(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3")]
        .find((h) => (h.textContent || "").trim().endsWith(t));
    const scroller = (d) => d.querySelector(".editor-core");
    const view = (f) => f.contentWindow.wrappedJSObject._currentEditorInstance._editorCore.view;

    before(async function () {
        wv = Zotero.Weavero && Zotero.Weavero.plugin;
        if (!wv) wvT.absent("plugin");
        for (const m of ["_wvNoteOutlineRender", "_wvNoteOutlineGo", "_wvNnSpy", "_wvNoteNavRefreshAll"]) wvT.method(m);
        win = Zotero.getMainWindow();
        doc = win.document;
        ZP = win.ZoteroPane;
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote(HTML);
        await note.saveTx();
        bare = new Zotero.Item("note");
        bare.libraryID = Zotero.Libraries.userLibraryID;
        bare.setNote('<div data-schema-version="9"><p>' + NEEDLE + " no headings https://example.com/x</p></div>");
        await bare.saveTx();
        // Note tabs open ONLY through openNote(id, { openInWindow: false })
        // (CLAUDE.md hard invariant).
        await ZP.openNote(note.id, { openInWindow: false });
        tabID = win.Zotero_Tabs.selectedID;
        tab = await wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const e = editorFor(note, (ne) => ne.classList.contains("note-tab"));
            return e && e.ne.querySelector(".wv-note-outline-row") ? e : null;
        }, 45000, 400);
    });

    after(async function () {
        try { if (tabID) win.Zotero_Tabs.close(tabID); } catch (e) {}
        try { win.Zotero_Tabs.select("zotero-pane"); } catch (e) {}
        // Closing an editor saves it (editorInstance.js uninit), and these
        // tests edit the note: a save landing after the erase fails on its
        // FOREIGN KEY, the editor calls Zotero.crash(), and every main window
        // opened for the rest of the run stops at a startup-error dialog. CI,
        // 2026-11-04: 13 to 24 failures in the second-window specs far later.
        try { ZP.itemsView.selection.clearSelection(); } catch (e) {}
        await wvT.sleep(1500);
        for (const it of [note, bare]) { if (it) { try { await it.eraseTx(); } catch (e) {} } }
    });

    it("lists the headings, nested by level, open in a note tab", function () {
        expect(tab, "note tab with an outline").to.be.ok;
        const panel = tab.ne.querySelector(".wv-note-outline");
        expect(panel.hasAttribute("data-wv-closed"), "open in a tab").to.equal(false);
        // Below the note's toolbar, which runs over it with Toggle Outline at
        // its left end, as the reader's toolbar over its sidebar (MJT 2026-11-04).
        expect(panel.nextElementSibling && panel.nextElementSibling.id, "over the editor's left edge").to.equal("editor-view");
        const f = tab.ne.querySelector("#editor-view"), d = f.contentDocument;
        const pr = panel.getBoundingClientRect(), fr = f.getBoundingClientRect();
        const tb = d.querySelector(".toolbar").getBoundingClientRect();
        expect(Math.round(fr.left), "the toolbar starts at the panel's left").to.equal(Math.round(pr.left));
        expect(Math.abs(pr.top - (fr.top + tb.bottom)), "the panel starts at the toolbar's bottom").to.be.below(1.5);
        expect(Math.abs(pr.bottom - fr.bottom), "...and reaches the editor's bottom").to.be.below(1.5);
        expect(fr.height, "the editor keeps its height (a grid does not stretch an iframe by itself)").to.be.above(300);
        const core = d.querySelector(".editor-core").getBoundingClientRect();
        expect(Math.abs(fr.left + core.left - pr.right), "the note starts right of the panel").to.be.below(1.5);
        const tg = d.querySelector(".toolbar .start > .wv-nn-outline-toggle").getBoundingClientRect();
        expect(fr.left + tg.right, "the toggle sits above the panel").to.be.below(pr.right);
        expect(rows(tab.ne).map((r) => r.textContent.trim().replace(NEEDLE + " ", ""))).to.deep.equal(
            ["Intro", "Background", "Detail", "Results", "Discussion"]);
        const pad = (t) => parseFloat(rowByText(tab.ne, t).style.paddingInlineStart);
        expect(pad("Background")).to.be.above(pad("Intro"));
        expect(pad("Detail")).to.be.above(pad("Background"));
        expect(pad("Results")).to.equal(pad("Intro"));
        // Zotero's tree twisty (chevron-8.svg), open = pointing down (MJT 2026-11-04).
        const tw = rowByText(tab.ne, "Intro").querySelector(".wv-note-outline-twisty.wv-nn-kids");
        const cs = tab.ne.ownerDocument.defaultView.getComputedStyle(tw);
        expect(cs.backgroundImage, "chevron-8").to.include("chrome://zotero/skin/8/universal/chevron-8.svg");
        expect(cs.transform, "open").to.equal("none");
    });

    it("a click brings the heading to the reading line and marks it", async function () {
        rowByText(tab.ne, "Results").click();
        const sc = scroller(tab.d);
        const landed = await wvT.waitFor(() => {
            const dy = headEl(tab.d, "Results").getBoundingClientRect().top - sc.getBoundingClientRect().top;
            return Math.abs(dy - sc.clientHeight * 0.25) < 6 ? dy : null;
        }, 5000);
        expect(landed, "heading a quarter of the way down").to.be.ok;
        expect(rowByText(tab.ne, "Results").classList.contains("wv-note-outline-current")).to.equal(true);
    });

    // MJT 2026-11-04: "A click on the outline entry should highlight it in
    // the editor" -- the reader outline's text flash, under the same setting
    // (enableOutlineTextHighlight): a decoration over the heading TEXT, gone
    // after the reader's 2 s + fade, and the note untouched.
    it("a click flashes the heading's text in the note (the reader's setting governs it)", async function () {
        const html0 = /** @type {any} */ (Zotero.Items.get(note.id)).getNote();
        const flashIn = (t) => {
            const h = headEl(tab.d, t);
            const f = h && h.querySelector(".wv-nn-flash");
            return f ? f.textContent.trim() : null;
        };
        rowByText(tab.ne, "Detail").click();
        expect(await wvT.waitFor(() => flashIn("Detail"), 2000), "the heading's text flashes").to.equal("Detail");
        expect(await wvT.waitFor(() => !tab.d.querySelector(".ProseMirror .wv-nn-flash"), 4000), "and the flash goes").to.equal(true);
        expect(/** @type {any} */ (Zotero.Items.get(note.id)).getNote(), "nothing written into the note").to.equal(html0);
        await wvT.withPref("weavero.enableOutlineTextHighlight", false, async () => {
            rowByText(tab.ne, "Background").click();
            await wvT.sleep(400);
            expect(tab.d.querySelector(".ProseMirror .wv-nn-flash"), "setting off: no flash").to.equal(null);
        });
    });

    it("the mark follows scrolling: the last heading the reading line has passed", async function () {
        const st = wv._wvNnState(tab.ne);
        st.spyHoldUntil = 0;
        const sc = scroller(tab.d);
        const bg = headEl(tab.d, "Background");
        sc.scrollTop += (bg.getBoundingClientRect().top - sc.getBoundingClientRect().top) - sc.clientHeight * 0.25 + 4;
        expect(await wvT.waitFor(() => rowByText(tab.ne, "Background").classList.contains("wv-note-outline-current"), 5000),
            "Background passed the line").to.equal(true);
        sc.scrollTop -= 60;
        expect(await wvT.waitFor(() => rowByText(tab.ne, "Intro").classList.contains("wv-note-outline-current"), 5000),
            "back above Background: Intro").to.equal(true);
    });

    // The reader Outline tab's keys (reader-panels.ts _wvListKeyNav), minus
    // its multi-selection; Enter puts the caret at the heading in the note.
    it("keys: arrows, Home/End move and land; Left/Right close, open and climb; Enter puts the caret there", async function () {
        const list = tab.ne.querySelector(".wv-note-outline-list");
        const st = wv._wvNnState(tab.ne);
        st.cursor = "";
        list.focus();
        const press = (key) => {
            const t = doc.activeElement && list.contains(doc.activeElement) ? doc.activeElement : list;
            t.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        };
        const active = () => {
            const r = list.querySelector(".wv-note-outline-row.wv-note-outline-active");
            return r ? r.textContent.trim().replace(NEEDLE + " ", "") : null;
        };
        const sc = scroller(tab.d);
        const onLine = (t) => {
            const dy = headEl(tab.d, t).getBoundingClientRect().top - sc.getBoundingClientRect().top;
            return Math.abs(dy - sc.clientHeight * 0.25) < 6;
        };
        press("Home");
        expect(active()).to.equal("Intro");
        press("ArrowDown");
        expect(active()).to.equal("Background");
        expect(await wvT.waitFor(() => onLine("Background"), 3000), "Background on the reading line").to.equal(true);
        press("ArrowDown");
        expect(active()).to.equal("Detail");
        press("ArrowLeft");
        expect(active(), "Left on a leaf climbs to the parent").to.equal("Background");
        press("ArrowLeft");
        expect(rowByText(tab.ne, "Detail").hidden, "Left on an open parent closes it").to.equal(true);
        expect(list.contains(doc.activeElement), "focus stays in the list across the redraw").to.equal(true);
        press("ArrowDown");
        expect(active(), "a closed child is skipped").to.equal("Results");
        press("ArrowUp");
        press("ArrowRight");
        expect(rowByText(tab.ne, "Detail").hidden, "Right opens it").to.equal(false);
        press("ArrowRight");
        expect(active(), "Right on an open parent steps in").to.equal("Detail");
        press("End");
        expect(active()).to.equal("Discussion");
        press("Enter");
        const caretIn = Components.utils.waiveXrays(tab.f.contentWindow).eval(
            "window._currentEditorInstance._editorCore.view.state.selection.$head.parent.textContent");
        expect(caretIn, "the caret sits in that heading").to.equal("Discussion");
        press("Escape");   // back to the note: must not throw
    });

    // Navigation only (MJT 2026-11-04, "I do not want to do outline edition
    // directly in the outline pane"): the reader's +/- and Ctrl+F, but none of
    // its editing tools -- no multi-selection (Shift / Ctrl+arrows, Space,
    // Ctrl+click), no undo / redo from the outline, Delete inert. Ctrl+A is
    // back for opening / closing everything (next test).
    it("keys: +/- and Ctrl+F search as in the reader; its selection, undo and Delete do nothing", async function () {
        const list = tab.ne.querySelector(".wv-note-outline-list");
        list.focus();
        const press = (key, mods) => {
            const t = doc.activeElement && tab.ne.querySelector(".wv-note-outline").contains(doc.activeElement) ? doc.activeElement : list;
            t.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true }, mods || {})));
        };
        const selected = () => [...list.querySelectorAll(".wv-note-outline-row.wv-note-outline-selected")]
            .map((r) => r.textContent.trim().replace(NEEDLE + " ", ""));
        const active = () => {
            const r = list.querySelector(".wv-note-outline-row.wv-note-outline-active");
            return r ? r.textContent.trim().replace(NEEDLE + " ", "") : null;
        };
        const ctrl = { ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac };
        press("Home");
        expect(selected(), "a plain move marks the row alone").to.deep.equal(["Intro"]);
        press("ArrowDown", { shiftKey: true });
        press("ArrowDown", ctrl);
        press(" ");
        expect(selected(), "Shift / Ctrl+arrows, Space: no selection").to.deep.equal(["Intro"]);
        expect(active(), "...and no move").to.equal("Intro");
        const r2 = rowByText(tab.ne, "Results");
        r2.dispatchEvent(new win.MouseEvent("click", { bubbles: true, ctrlKey: true }));
        expect(selected(), "Ctrl+click selects that row alone").to.deep.equal(["Results"]);
        press("-");
        expect(rows(tab.ne).filter((r) => !r.hidden).map((r) => r.textContent.trim().replace(NEEDLE + " ", "")),
            "- closes every row").to.deep.equal(["Intro", "Results"]);
        press("+");
        expect(rows(tab.ne).filter((r) => !r.hidden).length, "+ opens every row").to.equal(5);
        press("Delete");
        expect(rows(tab.ne).length, "Delete removes nothing").to.equal(5);
        expect(/** @type {any} */ (Zotero.Items.get(note.id)).getNote()).to.include("<h3>Detail</h3>");
        // Ctrl+Z / Ctrl+Y from the outline leave the note alone.
        const pw = Components.utils.waiveXrays(tab.f.contentWindow);
        const text = () => String(pw.eval("window._currentEditorInstance._editorCore.view.state.doc.textContent"));
        pw.eval("(function () { const v = window._currentEditorInstance._editorCore.view;"
            + " v.dispatch(v.state.tr.insertText(' WVKEEP', v.state.doc.content.size - 1)); })()");
        list.focus();
        press("z", ctrl);
        press("y", ctrl);
        await wvT.sleep(300);
        expect(text(), "Ctrl+Z in the outline does not undo the note").to.include("WVKEEP");
        // The search behind a magnifier in the bar (MJT 2026-11-04): its row
        // costs nothing until opened, and opens below, the title in view.
        const sin = tab.ne.querySelector(".wv-note-outline-search-input");
        const mag = tab.ne.querySelector(".wv-note-outline-search-btn");
        const sbox = tab.ne.querySelector(".wv-note-outline-search");
        const titleEl = tab.ne.querySelector(".wv-note-outline-title");
        const listEl = tab.ne.querySelector(".wv-note-outline-list");
        const on = (el) => win.getComputedStyle(el).display !== "none";
        const bottomOfBar = () => tab.ne.querySelector(".wv-note-outline-bar").getBoundingClientRect().bottom;
        expect([on(mag), on(sbox)], "at rest: the magnifier, no search row").to.deep.equal([true, false]);
        expect(Math.abs(listEl.getBoundingClientRect().top - bottomOfBar()), "the list right under the bar").to.be.below(1.5);
        mag.click();
        expect([on(titleEl), on(mag), on(sbox)], "a click opens the row; the title and the magnifier stay").to.deep.equal([true, true, true]);
        expect(sbox.getBoundingClientRect().top, "...below the bar").to.be.at.least(bottomOfBar() - 1);
        expect(listEl.getBoundingClientRect().top, "...above the list").to.be.at.least(sbox.getBoundingClientRect().bottom - 1);
        expect(doc.activeElement, "...and it takes the focus").to.equal(sin);
        sin.value = "x";
        sin.dispatchEvent(new win.Event("blur"));
        expect(on(sbox), "leaving it with a query keeps it").to.equal(true);
        sin.value = "";
        sin.dispatchEvent(new win.Event("blur"));
        expect(on(sbox), "leaving it empty closes it").to.equal(false);
        mag.click();
        mag.click();
        expect(on(sbox), "the magnifier closes it again").to.equal(false);
        expect(doc.activeElement, "...back to the list").to.equal(listEl);
        // Ctrl+F: the search box; typing filters, keeping the parents (dimmed).
        press("f", ctrl);
        expect(doc.activeElement, "Ctrl+F focuses the search").to.equal(sin);
        sin.value = "det";
        sin.dispatchEvent(new win.Event("input", { bubbles: true }));
        const visible = rows(tab.ne).filter((r) => !r.hidden);
        expect(visible.map((r) => r.textContent.trim().replace(NEEDLE + " ", ""))).to.deep.equal(["Intro", "Background", "Detail"]);
        expect(visible.filter((r) => r.classList.contains("wv-note-outline-dimmed")).length, "the parents are dimmed").to.equal(2);
        sin.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(sin.value, "Escape empties the search").to.equal("");
        expect(rows(tab.ne).filter((r) => !r.hidden).length).to.equal(5);
        expect(on(sbox), "...and closes it").to.equal(false);
    });

    // MJT 2026-11-10: "I still want the CTRL+A in the Outline of a note to
    // select all, so that I can expand all or collapse all." Every heading,
    // those inside a closed one too: a second Ctrl+A after closing all must
    // open the inner levels as well.
    it("Ctrl+A selects every heading; Right / Left then open or close them all", async function () {
        const list = tab.ne.querySelector(".wv-note-outline-list");
        list.focus();
        const press = (key, mods) => {
            const t = doc.activeElement && list.contains(doc.activeElement) ? doc.activeElement : list;
            t.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true }, mods || {})));
        };
        const name = (r) => r.textContent.trim().replace(NEEDLE + " ", "");
        const shown = () => rows(tab.ne).filter((r) => !r.hidden).map(name);
        const selected = () => rows(tab.ne).filter((r) => r.classList.contains("wv-note-outline-selected")).map(name);
        const ctrl = { ctrlKey: !Zotero.isMac, metaKey: !!Zotero.isMac };
        press("Home");
        press("a", ctrl);
        expect(selected(), "every heading").to.deep.equal(["Intro", "Background", "Detail", "Results", "Discussion"]);
        press("ArrowLeft");
        expect(shown(), "Left closes them all").to.deep.equal(["Intro", "Results"]);
        press("a", ctrl);
        press("ArrowRight");
        expect(shown(), "Right opens them all, the inner levels too").to.deep.equal(["Intro", "Background", "Detail", "Results", "Discussion"]);
        press("Home");
        expect(selected(), "a plain move goes back to one row").to.deep.equal(["Intro"]);
    });

    // MJT 2026-11-10: "The fold option on a right-click in the Outline actually
    // folds the section in the reader. This is counterintuitive. The context
    // menu of the outline should apply to the outline."
    it("the outline's right-click menu acts on the outline: Collapse / Expand, Expand All, Collapse All", async function () {
        const open = (t) => {
            const row = rowByText(tab.ne, t), r = row.getBoundingClientRect();
            wv._wvNoteOutlineContext({ target: row, preventDefault() {},
                screenX: Math.round(win.mozInnerScreenX + r.left + 10), screenY: Math.round(win.mozInnerScreenY + r.top + 5) }, tab.ne, tab.f);
            return doc.getElementById("wv-note-outline-menu");
        };
        const close = (m) => { try { m.hidePopup(); } catch (e) {} try { m.remove(); } catch (e) {} };
        let menu = open("Background");
        try {
            expect(menu, "the menu").to.be.ok;
            const labels = [...menu.querySelectorAll("menuitem")].map((m) => m.getAttribute("label"));
            expect(labels, "no fold of the note's section here: " + labels.join(" | ")).to.not.include("Fold Section");
            const tog = menu.querySelector("#wv-note-outline-toggle");
            expect(tog && tog.getAttribute("label")).to.equal("Collapse");
            expect(menu.querySelector("#wv-note-outline-expand-all").hasAttribute("disabled"), "nothing closed: Expand All grey").to.equal(true);
            expect(menu.querySelector("#wv-note-outline-collapse-all").hasAttribute("disabled")).to.equal(false);
            expect(menu.querySelector("#wv-note-outline-expand-all").getAttribute("acceltext")).to.equal("+");
            tog.dispatchEvent(new win.Event("command"));
        }
        finally { close(menu); }
        // Gecko runs a menu item's command once its popup has closed.
        expect(await wvT.waitFor(() => rowByText(tab.ne, "Detail").hidden, 3000), "Collapse closed Background in the outline").to.equal(true);
        expect(headEl(tab.d, "Detail").getClientRects().length, "...and left the note alone").to.be.above(0);
        menu = open("Background");
        try {
            expect(menu.querySelector("#wv-note-outline-toggle").getAttribute("label")).to.equal("Expand");
            const ea = menu.querySelector("#wv-note-outline-expand-all");
            expect(ea.hasAttribute("disabled"), "a row closed: Expand All live").to.equal(false);
            ea.dispatchEvent(new win.Event("command"));
        }
        finally { close(menu); }
        expect(await wvT.waitFor(() => rows(tab.ne).filter((r) => !r.hidden).length === 5, 3000), "Expand All").to.equal(true);
        menu = open("Detail");
        try { expect(menu.querySelector("#wv-note-outline-toggle"), "a heading without sub-headings has no Collapse").to.equal(null); }
        finally { close(menu); }
    });

    it("follows edits to the note", async function () {
        const v = view(tab.f);
        const s = v.state.schema;
        v.dispatch(v.state.tr.insert(v.state.doc.content.size,
            s.nodes.heading.create(Components.utils.cloneInto({ level: 2 }, tab.f.contentWindow), s.text("Appendix"))));
        expect(await wvT.waitFor(() => rows(tab.ne).length === 6 && rowByText(tab.ne, "Appendix"), 5000),
            "the new heading listed").to.be.ok;
    });

    // MJT 2026-11-04 (screenshot of a note of bullet lists, no toggle): "I still
    // want to be able to toggle the outline pane, even if the outline is
    // empty." FAILED on 1.0.0-beta.2.
    it("a note without headings keeps its toggle and its panel says so; the item pane starts with it folded away", async function () {
        win.Zotero_Tabs.select("zotero-pane");
        await ZP.selectItem(bare.id);
        const b = await wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const e = editorFor(bare, (ne) => !ne.classList.contains("note-tab"));
            return e && e.d.querySelector(".wv-note-linkified") ? e : null;
        }, 30000, 400);
        expect(b, "item-pane editor on the bare note").to.be.ok;
        // The sweep re-renders a note loaded into the same iframe.
        const empty = await wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            return b.ne.querySelector(".wv-note-outline .wv-note-outline-empty");
        }, 5000, 200);
        expect(empty && empty.textContent, "the panel says the note has none").to.equal("No headings in this note.");
        expect(b.ne.querySelectorAll(".wv-note-outline-row").length, "no rows left from the note before").to.equal(0);
        const bareBtn = b.d.querySelector(".toolbar .start > .wv-nn-outline-toggle");
        expect(bareBtn, "Toggle Outline with no headings too").to.be.ok;
        const bareHad = wv._wvNv.outline.open ? Object.assign({}, wv._wvNv.outline.open) : undefined;
        try {
            const barePanel = b.ne.querySelector(".wv-note-outline");
            expect(barePanel.hasAttribute("data-wv-closed"), "folded away in the item pane").to.equal(true);
            bareBtn.click();
            expect(win.getComputedStyle(barePanel).display, "it opens the empty panel").to.not.equal("none");
            expect(bareBtn.getAttribute("aria-pressed")).to.equal("true");
            bareBtn.click();
            expect(win.getComputedStyle(barePanel).display, "and closes it").to.equal("none");
        }
        finally {
            wv._wvNv.outline.open = bareHad;
            wv._wvNvSave();
        }
        await ZP.selectItem(note.id);
        const p = await wvT.waitFor(() => {
            try { wv._processNoteEditors(); } catch (e) {}
            const e = editorFor(note, (ne) => !ne.classList.contains("note-tab"));
            return e && e.ne.querySelector(".wv-note-outline-row") ? e : null;
        }, 30000, 400);
        expect(p, "item-pane outline").to.be.ok;
        const panel = p.ne.querySelector(".wv-note-outline");
        expect(panel.hasAttribute("data-wv-closed"), "folded away in the item pane").to.equal(true);
        expect(win.getComputedStyle(panel).display, "folded away = gone, no strip").to.equal("none");
        const coreLeft = () => p.d.querySelector(".editor-core").getBoundingClientRect().left;
        expect(coreLeft(), "...and the note keeps its full width").to.equal(0);
        // The toggle follows Zotero's pane toggles (MJT 2026-11-04): a
        // toolbar button at the START of the note's own toolbar, Zotero's
        // sidebar.svg -- the mirror of its Toggle Context Pane at the end.
        const btn = p.d.querySelector(".toolbar .start > .wv-nn-outline-toggle");
        expect(btn, "Toggle Outline in the note toolbar's start").to.be.ok;
        expect(btn.classList.contains("toolbar-button"), "drawn as Zotero's toolbar buttons").to.equal(true);
        expect(btn.parentNode.firstElementChild, "first in .start").to.equal(btn);
        expect(btn.getAttribute("aria-pressed")).to.equal("false");
        // It opens the outline, remembered for the item pane.
        const had = wv._wvNv.outline.open ? Object.assign({}, wv._wvNv.outline.open) : undefined;
        try {
            btn.click();
            expect(panel.hasAttribute("data-wv-closed"), "opened").to.equal(false);
            expect(btn.getAttribute("aria-pressed")).to.equal("true");
            expect(Math.abs(coreLeft() - panel.getBoundingClientRect().width), "the note moves right of the panel").to.be.below(1.5);
            expect(wv._wvNv.outline.open.pane).to.equal(true);
            expect(tab.ne.querySelector(".wv-note-outline").hasAttribute("data-wv-closed"), "the tab keeps its own").to.equal(false);
        }
        finally {
            wv._wvNv.outline.open = had;
            wv._wvNvSave();
        }
    });

    // MJT 2026-11-04, on Better Notes' two toolbar buttons left of Toggle
    // Outline: "Replace the left pane of BN completely when the Weavero note
    // outline is active." With both on, a note tab showed two outlines side
    // by side. Better Notes' structure stood in for here, from its 3.3.3
    // source (patches/noteEditor.ts, editor/toolbar.ts): the pane and its
    // splitter around the editor box, its buttons first in the toolbar's
    // start, the toggle with an inline display. The real plugin:
    // plugin-compat.spec.js. FAILED on 1.0.0-beta.2-dev.13.
    it("takes Better Notes' left pane's place while on, and gives it back when off", async function () {
        const f = tab.ne.querySelector("#editor-view"), d = f.contentDocument, start = d.querySelector(".toolbar .start");
        const pane = doc.createXULElement("vbox"), split = doc.createXULElement("splitter");
        pane.id = "bn-outline-container"; pane.style.width = "240px";
        split.id = "bn-outline-splitter";
        const box = doc.createXULElement("hbox");
        box.append(pane, split);
        tab.ne.append(box);
        const creator = d.createElement("button"), toggle = d.createElement("button");
        creator.className = "toolbar-button bn-editor-tool bn-link-creator";
        toggle.className = "toolbar-button bn-editor-tool bn-toggle-left-pane";
        toggle.style.display = "inherit";
        start.insertBefore(toggle, start.firstChild);
        start.insertBefore(creator, start.firstChild);
        const shown = (w, el) => w.getComputedStyle(el).display !== "none";
        const ours = () => d.querySelector(".wv-nn-outline-toggle");
        try {
            expect(shown(win, pane), "its pane replaced").to.equal(false);
            expect(shown(win, split), "and its splitter").to.equal(false);
            expect(shown(d.defaultView, toggle), "its toggle, inline style or not").to.equal(false);
            expect(shown(d.defaultView, creator), "its Link creator is not the pane's: it stays").to.equal(true);
            expect(ours().getBoundingClientRect().left, "Toggle Outline at the toolbar's left end, whoever came first")
                .to.be.below(creator.getBoundingClientRect().left);
            await wvT.withPref("weavero.noteOutline", false, async () => {
                wv._wvNoteNavRefreshAll();
                expect(await wvT.waitFor(() => shown(win, pane), 5000), "its pane back with the setting off").to.equal(true);
                expect(shown(win, split), "and its splitter").to.equal(true);
                expect(shown(d.defaultView, toggle), "and its toggle").to.equal(true);
            });
            wv._wvNoteNavRefreshAll();
            expect(await wvT.waitFor(() => !shown(win, pane), 5000), "replaced again").to.equal(true);
        }
        finally { box.remove(); creator.remove(); toggle.remove(); }
    });

    it("the Outline switch removes every panel and brings them back", async function () {
        await wvT.withPref("weavero.noteOutline", false, async () => {
            wv._wvNoteNavRefreshAll();
            expect(await wvT.waitFor(() => !doc.querySelector(".wv-note-outline"), 5000), "all panels gone").to.equal(true);
        });
        wv._wvNoteNavRefreshAll();
        expect(await wvT.waitFor(() => !!tab.ne.querySelector(".wv-note-outline-row"), 5000), "back").to.equal(true);
    });
});
