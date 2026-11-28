/* global describe, it, before, after, assert, Zotero, wvT */

// The default attachment in the ITEM PANE (MJT 2026-11-19, with a screenshot
// of the Attachments section: "The item pane should carry the same
// information about the default item to open as the items list, with the
// same ability to change from the right-click menu"; on the plan: "Ok, with
// default first same as in the items list").
//
// Zotero's own Attachments and Notes sections (pane ids "attachments" and
// "notes"; the library's item pane and a reader tab's) mark their rows as
// the items list marks the children (attachments.ts): the chosen default with
// the tag's own ▶️, Zotero's automatic choice with the dimmed ▷, both between
// the type icon and the title; a right-click on a row offers the items list's
// own entry ("Set as Default Attachment" / "Clear Default Attachment"); and
// the default comes first, by the items list's rule. The feature's switch
// takes all of it away. Written before the code (the feature skill's
// check-first rule).

describe("Weavero — the default attachment in the item pane", function () {
    this.timeout(150000);
    const SEL_ATT = 'attachments-box[data-pane="attachments"]';
    const SEL_NOTES = 'notes-box[data-pane="notes"]';
    const NOTE_A = "WVDP note alpha", NOTE_B = "WVDP note beta";
    let wv, win, doc, ZP, iv, lib, P, A1, A2, L, N1, N2, auto, other;

    const glyph = () => wv._wvOpenByDefaultEmoji;
    const libDet = () => doc.querySelector("#zotero-item-pane item-details");
    const attBoxIn = (det) => det && det.querySelector(SEL_ATT);
    const attRowsIn = (det) => { const b = attBoxIn(det); return b ? [...b.querySelectorAll("attachment-row")].filter(r => !r.hidden) : []; };
    const attRows = () => attRowsIn(libDet());
    const attOrder = (det) => attRowsIn(det || libDet()).map(r => r.attachment && r.attachment.id);
    const attRowOf = (it) => attRows().find(r => r.attachment && r.attachment.id === it.id) || null;
    const noteRows = () => { const d = libDet(); const b = d && d.querySelector(SEL_NOTES); return b ? [...b.querySelectorAll(".body > .row")] : []; };
    const noteTitle = (r) => { const l = r.querySelector(".label"); return l ? l.textContent.trim() : ""; };
    const noteRowOf = (title) => noteRows().find(r => noteTitle(r) === title) || null;
    const markOf = (row) => { const m = row && row.querySelector(".wv-defpane-mark"); return m ? m.getAttribute("data-wv-mark") : null; };
    const marksIn = (det) => { const o = {}; for (const r of attRowsIn(det)) o[r.attachment.id] = markOf(r); return JSON.stringify(o); };
    const want = (o) => { const s = {}; for (const [k, v] of o) s[k] = v; return JSON.stringify(s); };
    const noteMarks = () => JSON.stringify(noteRows().map(r => [noteTitle(r), markOf(r)]));
    const scrollTo = (det, pane) => { try { det.scrollToPane(pane, "instant"); } catch (e) {} };

    const selectP = async () => {
        if (ZP.getSelectedItems().map(x => x.id).join() !== String(P.id)) await ZP.selectItems([P.id]);
        scrollTo(libDet(), "attachments");
        return wvT.waitFor(() => attRows().length === 3 && noteRows().length === 2 ? true : null, 15000);
    };
    const clearAll = async () => {
        for (const c of [A1, A2, L, N1, N2]) { try { await wv._wvClearDefaultChild(Zotero.Items.get(c.id)); } catch (e) {} }
    };
    // The items list's children of P, freshly opened (Zotero reads the order
    // when a row opens: itemTreeRow.js getChildItems, notes then attachments).
    const listChildren = async () => {
        let i = iv.getRowIndexByID(P.id);
        if (iv.isContainerOpen(i)) iv.toggleOpenState(i);
        await wvT.sleep(50);
        i = iv.getRowIndexByID(P.id);
        iv.toggleOpenState(i);
        await wvT.sleep(50);
        i = iv.getRowIndexByID(P.id);
        const out = [];
        for (let j = i + 1; j < iv.getRowCount() && iv.getLevel(j) > iv.getLevel(i); j++) out.push(iv.getRow(j).ref.id);
        return out;
    };
    // An items-list row as Zotero draws it (its own renderer, paint or no
    // paint: tests.md): the tag's emoji swatch, Weavero's ▷.
    const listRow = (it) => {
        const i = iv.getRowIndexByID(it.id);
        if (i === false || i == null || i < 0) return null;
        return iv._renderItem(i, iv.selection, null, iv._getColumns());
    };
    const listEmoji = (it) => { const r = listRow(it); const s = r && r.querySelector(".tag-swatch.emoji"); return s ? s.textContent : ""; };
    const listAuto = (it) => { const r = listRow(it); return !!(r && r.querySelector(".wv-defatt-auto-glyph")); };
    const rightClick = (el) => {
        const ev = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, button: 2, screenX: 200, screenY: 200 });
        el.dispatchEvent(ev);
        return ev;
    };
    const openMenu = () => wvT.waitFor(() => { const m = doc.getElementById("wv-defpane-menu"); return m && m.state === "open" ? m : null; }, 4000);
    const closeMenus = async () => {
        const m = doc.getElementById("wv-defpane-menu");
        if (m && m.state !== "closed") { try { m.hidePopup(); } catch (e) {} await wvT.waitFor(() => m.state === "closed" || null, 2000); }
    };

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvSetDefaultChild");
        win = Zotero.getMainWindow(); doc = win.document; ZP = win.ZoteroPane; iv = ZP.itemsView;
        lib = Zotero.Libraries.userLibraryID;
        P = await wvT.createItem("journalArticle", { title: "WVDP parent" });
        // A real PDF (a reader tab opens it), a second file attachment, a
        // linked URL: Zotero's own pane puts its best FILE first, the items
        // list the default of any kind.
        A1 = await wvT.createTestPDFItem("wvdp-a1", { parentItemID: P.id });
        A2 = new Zotero.Item("attachment"); A2.libraryID = lib; A2.parentID = P.id;
        A2.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
        A2.attachmentContentType = "application/pdf";
        A2.setField("title", "WVDP file two");
        await A2.saveTx();
        L = new Zotero.Item("attachment"); L.libraryID = lib; L.parentID = P.id;
        L.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
        L.setField("title", "WVDP link");
        L.setField("url", "https://example.com/wvdp");
        await L.saveTx();
        // Notes sort by title (getNotes, sortNotesChronologically off):
        // alpha first, so a default beta must move.
        N1 = new Zotero.Item("note"); N1.libraryID = lib; N1.parentID = P.id; N1.setNote("<p>" + NOTE_A + "</p>"); await N1.saveTx();
        N2 = new Zotero.Item("note"); N2.libraryID = lib; N2.parentID = P.id; N2.setNote("<p>" + NOTE_B + "</p>"); await N2.saveTx();
        auto = wv._wvBestAttachmentHeuristicSync(P);
        assert.isOk(auto && (auto.id === A1.id || auto.id === A2.id), "one of the two PDFs is Zotero's automatic choice");
        other = auto.id === A1.id ? A2 : A1;
        await ZP.collectionsView.selectLibrary(lib);
        await iv.waitForLoad();
        assert.isOk(await selectP(), "P's Attachments (3) and Notes (2) are drawn");
    });

    after(async function () {
        await closeMenus();
        await clearAll();
        await wvT.erase(N1, N2, L, A2, A1, P);
    });

    it("each row carries the items list's mark: ▶️ on the default, the dimmed ▷ on Zotero's automatic choice", async function () {
        await clearAll();
        assert.isOk(await selectP());
        const none = want([[auto.id, "auto"], [other.id, null], [L.id, null]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === none || null, 10000), "no default: ▷ on the automatic choice only; got " + marksIn(libDet()));
        await wv._wvSetDefaultChild(Zotero.Items.get(other.id));
        const picked = want([[auto.id, "auto"], [other.id, "pick"], [L.id, null]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === picked || null, 10000), "the default ▶️, the automatic choice still ▷; got " + marksIn(libDet()));
        const r = attRowOf(other), ra = attRowOf(auto), rl = attRowOf(L);
        const m = r.querySelector(".wv-defpane-mark"), ma = ra.querySelector(".wv-defpane-mark");
        assert.strictEqual(m.textContent, glyph(), "the tag's own glyph, as the items list draws it");
        assert.strictEqual(ma.textContent, "▷");
        assert.closeTo(Number(win.getComputedStyle(ma).opacity), 0.5, 0.01, "dimmed, as the items list's ▷");
        assert.closeTo(Number(win.getComputedStyle(m).opacity), 1, 0.01);
        // Placed as the items list places them (tags before the title,
        // itemTreeRow.js renderPrimaryCell): after the type icon, before the title.
        assert.isOk(m.previousElementSibling && m.previousElementSibling.classList.contains("icon"), "right after the type icon");
        assert.isOk(m.nextElementSibling && m.nextElementSibling.classList.contains("label"), "right before the title");
        // Zotero's row geometry: a marked row is as tall as an unmarked one,
        // the title on the same line, the mark on the title's line.
        const R = (el) => el.getBoundingClientRect();
        const head = (row) => row.querySelector(".head");
        assert.closeTo(R(head(r)).height, R(head(rl)).height, 0.5, "a marked row is as tall as an unmarked one");
        assert.closeTo(R(r.querySelector(".label")).top - R(head(r)).top, R(rl.querySelector(".label")).top - R(head(rl)).top, 0.5, "the title where an unmarked row has it");
        assert.closeTo(R(m).top, R(r.querySelector(".label")).top, 1, "the mark on the title's line");
        assert.closeTo(R(m).height, R(r.querySelector(".label")).height, 1, "as tall as the title's line");
        assert.match(win.getComputedStyle(m).contain, /inline-size/, "contain: inline-size");
        // Notes: the default ▶️, no automatic choice among notes.
        await wv._wvSetDefaultChild(Zotero.Items.get(N1.id));
        scrollTo(libDet(), "notes");
        const nm = JSON.stringify([[NOTE_A, "pick"], [NOTE_B, null]]);
        assert.isOk(await wvT.waitFor(() => noteMarks() === nm || null, 10000), "the default note ▶️; got " + noteMarks());
        const nr = noteRowOf(NOTE_A).querySelector(".wv-defpane-mark");
        assert.strictEqual(nr.textContent, glyph());
        assert.isOk(nr.previousElementSibling && nr.previousElementSibling.classList.contains("icon"), "after the note icon");
        const none2 = want([[auto.id, "auto"], [other.id, null], [L.id, null]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === none2 || null, 10000), "the attachments lose their ▶️ when a note is the default; got " + marksIn(libDet()));
    });

    // MJT 2026-11-22: "When only 1 attachment, no need to show the right arrow to
    // say that it is the default attachment": the dimmed ▷ marks a choice, and a
    // lone attachment is no choice. A chosen default keeps its ▶️.
    it("a lone attachment gets no ▷, in the items list or the item pane; a second one brings it back", async function () {
        await clearAll();
        const P1 = await wvT.createItem("journalArticle", { title: "WVDP lone parent" });
        const B1 = await wvT.createTestPDFItem("wvdp-lone", { parentItemID: P1.id });
        let B2 = null;
        try {
            assert.strictEqual(wv._wvBestAttachmentHeuristicSync(P1).id, B1.id, "Zotero's automatic choice is the lone PDF");
            const openP1 = async () => {
                let i = iv.getRowIndexByID(P1.id);
                if (!iv.isContainerOpen(i)) iv.toggleOpenState(i);
                await wvT.sleep(50);
            };
            await openP1();
            assert.isFalse(listAuto(B1), "items list: no ▷ on the lone attachment");
            await ZP.selectItems([P1.id]);
            scrollTo(libDet(), "attachments");
            assert.isOk(await wvT.waitFor(() => attRows().length === 1 && attRows()[0].attachment.id === B1.id ? true : null, 15000), "P1's one attachment drawn");
            await wvT.sleep(200);
            assert.strictEqual(marksIn(libDet()), want([[B1.id, null]]), "item pane: no ▷ either");
            // A second file attachment: a choice again, the ▷ comes back.
            B2 = new Zotero.Item("attachment"); B2.libraryID = lib; B2.parentID = P1.id;
            B2.attachmentLinkMode = Zotero.Attachments.LINK_MODE_LINKED_URL;
            B2.setField("title", "WVDP lone link"); B2.setField("url", "https://example.com/wvdp-lone");
            await B2.saveTx();
            await openP1();
            assert.isOk(await wvT.waitFor(() => listAuto(B1) || null, 5000), "items list: ▷ back with two attachments");
            assert.isOk(await wvT.waitFor(() => markOf(attRowOf(B1)) === "auto" || null, 10000), "item pane: ▷ back; got " + marksIn(libDet()));
            // The user's own default on a lone attachment keeps its ▶️.
            await B2.eraseTx(); B2 = null;
            await wv._wvSetDefaultChild(Zotero.Items.get(B1.id));
            assert.isOk(await wvT.waitFor(() => markOf(attRowOf(B1)) === "pick" || null, 10000), "a chosen default keeps ▶️; got " + marksIn(libDet()));
            await wv._wvClearDefaultChild(Zotero.Items.get(B1.id));
        }
        finally {
            if (B2) { try { await B2.eraseTx(); } catch (e) {} }
            await wvT.erase(B1, P1);
            assert.isOk(await selectP(), "back on P");
        }
    });

    it("the default comes first, by the items list's rule, whatever its kind", async function () {
        await clearAll();
        assert.isOk(await selectP());
        const atts = new Set([A1.id, A2.id, L.id]), notes = new Set([N1.id, N2.id]);
        const check = async (first, label) => {
            const ok = await wvT.waitFor(() => attOrder()[0] === first || null, 10000);
            assert.isOk(ok, label + ": first in the Attachments section; got " + attOrder().join());
            const kids = await listChildren();
            assert.deepEqual(attOrder(), kids.filter(id => atts.has(id)), label + ": the items list's attachment order");
            return kids;
        };
        await check(auto.id, "no default (the automatic choice)");
        await wv._wvSetDefaultChild(Zotero.Items.get(other.id));
        await check(other.id, "a file attachment");
        // Zotero's own pane puts its best FILE first (attachmentsBox.js
        // _updateAttachmentIDs); the items list puts the default first.
        await wv._wvSetDefaultChild(Zotero.Items.get(L.id));
        await check(L.id, "a linked URL");
        await wv._wvSetDefaultChild(Zotero.Items.get(N2.id));
        scrollTo(libDet(), "notes");
        const nOk = await wvT.waitFor(() => noteRows().length === 2 && noteTitle(noteRows()[0]) === NOTE_B || null, 10000);
        assert.isOk(nOk, "a default note first in the Notes section; got " + noteRows().map(noteTitle).join());
        const kids = await check(auto.id, "a note (the attachments: the automatic choice first)");
        assert.deepEqual(kids.filter(id => notes.has(id)), [N2.id, N1.id], "the items list's notes: the default first too");
        assert.deepEqual(noteRows().map(noteTitle), [NOTE_B, NOTE_A]);
    });

    it("a right-click on a row offers the items list's entry, and the items list follows", async function () {
        await clearAll();
        assert.isOk(await selectP());
        let i = iv.getRowIndexByID(P.id);
        if (!iv.isContainerOpen(i)) iv.toggleOpenState(i);
        assert.isOk(await wvT.waitFor(() => attRowOf(other) || null, 10000));
        // Set.
        const ev = rightClick(attRowOf(other).querySelector(".attachment-btn"));
        const menu = await openMenu();
        assert.isOk(menu, "the right-click opens Weavero's menu");
        assert.isTrue(ev.defaultPrevented, "and claims the event");
        let items = [...menu.querySelectorAll("menuitem")].filter(x => !x.hidden);
        assert.strictEqual(items.length, 1, "one entry");
        assert.strictEqual(items[0].getAttribute("data-l10n-id"), "weavero-menu-items-default-attachment", "the items list's own string");
        assert.deepEqual(JSON.parse(items[0].getAttribute("data-l10n-args")), { marked: "no", glyph: glyph() + " " });
        assert.strictEqual(items[0].getAttribute("label"), glyph() + " Set as Default Attachment");
        items[0].doCommand();
        assert.isOk(await wvT.waitFor(() => wv._wvIsDefaultChild(Zotero.Items.get(other.id)) || null, 10000), "the entry sets the default (the tag, as the items list does)");
        assert.isOk(await wvT.waitFor(() => markOf(attRowOf(other)) === "pick" || null, 10000), "the row shows ▶️");
        assert.isOk(await wvT.waitFor(() => listEmoji(other) === glyph() || null, 10000), "the items list's row shows the tag's ▶️");
        assert.isTrue(listAuto(auto), "and keeps the ▷ on the automatic choice");
        await closeMenus();
        // Clear.
        rightClick(attRowOf(other).querySelector(".label"));
        const menu2 = await openMenu();
        assert.isOk(menu2, "again on the default's row");
        items = [...menu2.querySelectorAll("menuitem")].filter(x => !x.hidden);
        assert.deepEqual(JSON.parse(items[0].getAttribute("data-l10n-args")), { marked: "yes", glyph: glyph() + " " });
        assert.strictEqual(items[0].getAttribute("label"), glyph() + " Clear Default Attachment");
        items[0].doCommand();
        assert.isOk(await wvT.waitFor(() => !wv._wvIsDefaultChild(Zotero.Items.get(other.id)) || null, 10000), "the entry clears it");
        assert.isOk(await wvT.waitFor(() => markOf(attRowOf(other)) === null || null, 10000), "no mark left");
        assert.isOk(await wvT.waitFor(() => listEmoji(other) === "" || null, 10000), "the items list follows");
        await closeMenus();
        // A note's row.
        scrollTo(libDet(), "notes");
        assert.isOk(await wvT.waitFor(() => noteRowOf(NOTE_B) || null, 10000));
        rightClick(noteRowOf(NOTE_B).querySelector(".box"));
        const menu3 = await openMenu();
        assert.isOk(menu3, "a note's row offers it too");
        items = [...menu3.querySelectorAll("menuitem")].filter(x => !x.hidden);
        assert.deepEqual(JSON.parse(items[0].getAttribute("data-l10n-args")), { marked: "no", glyph: glyph() + " " });
        items[0].doCommand();
        assert.isOk(await wvT.waitFor(() => wv._wvIsDefaultChild(Zotero.Items.get(N2.id)) || null, 10000), "the note is the default");
        assert.isOk(await wvT.waitFor(() => markOf(noteRowOf(NOTE_B)) === "pick" || null, 10000), "its row shows ▶️");
        assert.isOk(await wvT.waitFor(() => listEmoji(N2) === glyph() || null, 10000), "the items list's note row too");
        await closeMenus();
    });

    it("a default set from the items list shows in the pane at once, in the right place", async function () {
        await clearAll();
        assert.isOk(await selectP());
        // The storage the items list's entry writes (the marker tag): the pane
        // follows the library, not one gesture.
        await wv._wvSetDefaultChild(Zotero.Items.get(L.id));
        const picked = want([[auto.id, "auto"], [other.id, null], [L.id, "pick"]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === picked && attOrder()[0] === L.id || null, 10000),
            "▶️ and first, with no reselection; got " + marksIn(libDet()) + " / " + attOrder().join());
        await wv._wvSetDefaultChild(Zotero.Items.get(other.id));
        const moved = want([[auto.id, "auto"], [other.id, "pick"], [L.id, null]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === moved && attOrder()[0] === other.id || null, 10000),
            "moved to another child; got " + marksIn(libDet()) + " / " + attOrder().join());
    });

    it("the feature's switch takes the marks, the entry and the order away, and brings them back", async function () {
        await clearAll();
        assert.isOk(await selectP());
        await wv._wvSetDefaultChild(Zotero.Items.get(L.id));
        const on = want([[auto.id, "auto"], [other.id, null], [L.id, "pick"]]);
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === on && attOrder()[0] === L.id || null, 10000), "on; got " + marksIn(libDet()));
        await wvT.withPref("weavero.enableDefaultChild", false, async () => {
            const off = want([[auto.id, null], [other.id, null], [L.id, null]]);
            assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === off || null, 10000), "off: no mark; got " + marksIn(libDet()));
            assert.isOk(await wvT.waitFor(() => attOrder()[0] === auto.id || null, 10000), "off: Zotero's own order (its best file first); got " + attOrder().join());
            const ev = rightClick(attRowOf(L).querySelector(".attachment-btn"));
            await wvT.sleep(400);
            const m = doc.getElementById("wv-defpane-menu");
            assert.isFalse(!!(m && m.state === "open"), "off: no menu");
            assert.isFalse(ev.defaultPrevented, "off: the right-click is left alone");
        });
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === on && attOrder()[0] === L.id || null, 10000), "back on; got " + marksIn(libDet()));
        // The mark-the-automatic-choice option off: the ▷ goes, the ▶️ stays.
        await wvT.withPref("weavero.defattMarkAuto", false, async () => {
            const noAuto = want([[auto.id, null], [other.id, null], [L.id, "pick"]]);
            assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === noAuto || null, 10000), "the ▷ follows its own option; got " + marksIn(libDet()));
        });
        assert.isOk(await wvT.waitFor(() => marksIn(libDet()) === on || null, 10000), "the ▷ back with its option");
    });

    it("a reader tab's item pane carries the same marks and order", async function () {
        await clearAll();
        await wv._wvSetDefaultChild(Zotero.Items.get(L.id));
        const ctxWasCollapsed = !!win.ZoteroContextPane.collapsed;
        const reader = await wvT.openReaderTab(A1.id);
        assert.isOk(reader, "the reader tab opened");
        try {
            if (win.ZoteroContextPane.collapsed) win.ZoteroContextPane.collapsed = false;
            const ctxDet = () => [...doc.querySelectorAll("#zotero-context-pane item-details")]
                .find(d => { const b = attBoxIn(d); return b && b.item && b.item.id === P.id && b.tabType === "reader"; }) || null;
            const det = await wvT.waitFor(ctxDet, 20000);
            assert.isOk(det, "the reader tab's item pane shows P");
            scrollTo(det, "attachments");
            const picked = want([[auto.id, "auto"], [other.id, null], [L.id, "pick"]]);
            assert.isOk(await wvT.waitFor(() => { const d = ctxDet(); scrollTo(d, "attachments"); return d && marksIn(d) === picked && attOrder(d)[0] === L.id ? true : null; }, 20000),
                "▶️, ▷ and the default first there too; got " + (ctxDet() ? marksIn(ctxDet()) + " / " + attOrder(ctxDet()).join() : "no pane"));
        }
        finally {
            wvT.closeReaderTab(reader);
            try { if (!!win.ZoteroContextPane.collapsed !== ctxWasCollapsed) win.ZoteroContextPane.collapsed = ctxWasCollapsed; } catch (e) {}
            await wvT.sleep(300);
        }
    });

    it("every main window: a second one is wired as the first, and a teardown gives everything back", async function () {
        const lib2 = wvT.lib();
        wvT.method("_wvDefPaneWire");
        wvT.method("_wvDefPaneUnwire");
        wvT.method("_wvDefPaneRefreshAll");
        const proto = (w) => { const C = w.customElements && w.customElements.get("attachments-box"); return C && C.prototype; };
        const wired = (w) => lib2.wvWrapLayers(proto(w), "_updateAttachmentIDs").map(l => l.layer).includes("defpane")
            && lib2.wvListenKeys(w.document).some(k => k.key === "defpane:contextmenu");
        assert.isTrue(wired(win), "the first window: its Attachments class and the right-click");
        // A second main window: Zotero's own on a Zotero that has them, else
        // Weavero's (wvT.openMainWindow); timers from the first (tests.md).
        const sleep = (ms) => new Promise(r => win.setTimeout(r, ms));
        const w2 = await wvT.openMainWindow(30000);
        assert.isOk(w2, "second window opened");
        try { win.focus(); } catch (e) {}
        try {
            for (let i = 0; i < 120 && !(w2.ZoteroPane && w2.ZoteroPane.itemsView && w2.ZoteroPane.collectionsView && w2.document.readyState === "complete" && proto(w2)); i++) await sleep(150);
            assert.isOk(await wvT.waitFor(() => wired(w2) || null, 15000), "the second window too");
        }
        finally {
            try { w2.close(); } catch (e) {}
            for (let i = 0; i < 60 && Zotero.getMainWindows().includes(w2); i++) await sleep(100);
            try { win.focus(); } catch (e) {}
        }
        // Teardown and back.
        await wv._wvSetDefaultChild(Zotero.Items.get(other.id));
        assert.isOk(await selectP());
        assert.isOk(await wvT.waitFor(() => markOf(attRowOf(other)) === "pick" || null, 10000));
        try {
            wv._wvDefPaneUnwire(win);
            assert.deepEqual(lib2.wvWrapLayers(proto(win), "_updateAttachmentIDs"), [], "the Attachments class given back");
            assert.isFalse(Object.prototype.hasOwnProperty.call(proto(win), "_wvWraps"), "no wrap table left on it");
            assert.isFalse(lib2.wvListenKeys(doc).some(k => k.key === "defpane:contextmenu"), "the right-click listener gone");
            assert.strictEqual(doc.querySelectorAll(".wv-defpane-mark").length, 0, "no mark left in the window");
        }
        finally {
            wv._wvDefPaneWire(win);
            wv._wvDefPaneRefreshAll();
        }
        assert.isTrue(wired(win), "rewired");
        assert.isOk(await wvT.waitFor(() => markOf(attRowOf(other)) === "pick" || null, 10000), "the marks back");
    });
});
