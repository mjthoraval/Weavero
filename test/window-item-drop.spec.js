/* global describe, it, before, after, assert, Zotero, Services */

// A library item dragged from the items list onto a note becomes a citation,
// natively in every note editor (MJT 2026-10-30: "In troubleshooting mode, I
// can drag a parent item to a note to make a citation. It does not work with
// Weavero active."). The tab strip's window-level capture handler on reader
// and note windows (_wvWireReaderWindowMergeAbsorber) refused every item drag
// off the strip from 2026-06-30 (stopPropagation + dropEffect "none"), so the
// note editor never saw the dragover and the cursor read "no drop". The
// dragovers here are synthetic: what is checked is who sees the event and
// whether the editor accepts it. The drop itself needs a real drag.

describe("Weavero — item drags onto notes in reader and note windows", function () {
    this.timeout(120000);
    let main = null, parent = null, anchor = null, deckNote = null, stockNote = null, deck = null, stock = null;
    const PREFS = ["weavero.compactTitleBarNote", "weavero.noteOpenInDeckWindow"];
    const saved = {};
    const sleep = (ms) => new Promise(r => main.setTimeout(r, ms));

    const windowsOf = (type) => {
        const out = [];
        const en = Services.wm.getEnumerator(type);
        while (en.hasMoreElements()) out.push(en.getNext());
        return out;
    };
    const restorePref = (p, v) => {
        if (v === undefined) { try { Zotero.Prefs.clear(p); } catch (e) {} }
        else Zotero.Prefs.set(p, v);
    };
    const mkNote = async (html, parentItemID) => {
        const n = new Zotero.Item("note");
        n.libraryID = Zotero.Libraries.userLibraryID;
        if (parentItemID) n.parentID = parentItemID;
        n.setNote(html);
        await n.saveTx();
        return n;
    };

    /** The ProseMirror view of the shown note editor in window `w`. */
    const editorIn = async (w) => {
        for (let i = 0; i < 150; i++) {
            for (const ne of w.document.querySelectorAll("note-editor")) {
                try {
                    const pm = ne.querySelector("iframe").contentWindow.document.querySelector(".ProseMirror");
                    if (pm && ne.getBoundingClientRect().width > 0) return pm;
                } catch (e) {}
            }
            await sleep(100);
        }
        return null;
    };

    /** A dragover carrying library item `parent` dispatched at `target`:
     *  whether `target` saw it, and whether something accepted it. */
    const dragItemOver = (w, target) => {
        const tw = target.ownerDocument.defaultView;
        const dt = new w.DataTransfer();
        dt.setData("zotero/item", String(parent.id));
        let seen = false;
        const mark = () => { seen = true; };
        target.addEventListener("dragover", mark);
        const ev = new tw.DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 10, clientY: 10 });
        target.dispatchEvent(ev);
        target.removeEventListener("dragover", mark);
        return { seen, accepted: ev.defaultPrevented, dropEffect: dt.dropEffect };
    };

    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        wvT.method("_wvOpenNoteInDeckWindow");
        wvT.method("_wvHideReaderStripItemDropIndicator");
        main = Zotero.getMainWindow();
        for (const p of PREFS) saved[p] = Zotero.Prefs.get(p);
        // The note window's strip (and the handler with it) is the default.
        Zotero.Prefs.set("weavero.compactTitleBarNote", true);
        parent = await wvT.createItem("journalArticle", { title: "WV-TEST item drop parent" });
        // A tab-hosting window opens on an anchor attachment of the note's
        // parent (_wvPickNoteDeckAnchor), then swaps it for the note.
        anchor = await wvT.createTestPDFItem("wv-itemdrop-anchor", { parentItemID: parent.id });
        deckNote = await mkNote("<p>WV-TEST item drop deck note</p>", parent.id);
        stockNote = await mkNote("<p>WV-TEST item drop stock note</p>");

        deck = await wvT.plugin()._wvOpenNoteInDeckWindow(deckNote.id, null);
        assert.isOk(deck && deck._wvWT, "tab-hosting window opened");

        const before = new Set(windowsOf("zotero:note"));
        Zotero.Prefs.set("weavero.noteOpenInDeckWindow", false);
        try { await Zotero.Notes.open(stockNote.id, null, { openInWindow: true }); }
        finally { restorePref("weavero.noteOpenInDeckWindow", saved["weavero.noteOpenInDeckWindow"]); }
        for (let i = 0; i < 150 && !stock; i++) { await sleep(100); stock = windowsOf("zotero:note").find(x => !before.has(x)) || null; }
        assert.isOk(stock, "note window opened");
        for (let i = 0; i < 150 && !(stock.document.readyState === "complete" && stock.document.querySelector(".wv-window-tabstrip")); i++) await sleep(100);
    });

    after(async function () {
        for (const w of [deck, stock]) { try { if (w && !w.closed) w.close(); } catch (e) {} }
        for (const p of PREFS) restorePref(p, saved[p]);
        await wvT.settleSecondaryWindows();
        wvT.purgeDeadReaders();
        await wvT.erase(deckNote, stockNote, anchor, parent);
    });

    it("a note tab in a tab-hosting window takes the item (its editor sees the drag and accepts it)", async () => {
        const pm = await editorIn(deck);
        assert.isOk(pm, "the note tab's editor loaded");
        const r = dragItemOver(deck, pm);
        assert.deepEqual({ seen: r.seen, accepted: r.accepted }, { seen: true, accepted: true });
    });

    it("a note window with the tab strip takes it too", async () => {
        assert.isOk(stock.document.querySelector(".wv-window-tabstrip"), "the note window has its strip");
        const pm = await editorIn(stock);
        assert.isOk(pm, "the note window's editor loaded");
        const r = dragItemOver(stock, pm);
        assert.deepEqual({ seen: r.seen, accepted: r.accepted }, { seen: true, accepted: true });
    });

    it("the strip still opens the item in a tab-hosting window, and refuses it in a note window", () => {
        const deckStrip = deck.document.querySelector(".wv-window-tabstrip");
        const noteStrip = stock.document.querySelector(".wv-window-tabstrip");
        assert.isOk(deckStrip && noteStrip, "both strips");
        const onDeck = dragItemOver(deck, deckStrip);
        try { wvT.plugin()._wvHideReaderStripItemDropIndicator(deck); } catch (e) {}
        const onNote = dragItemOver(stock, noteStrip);
        assert.deepEqual(
            { deck: [onDeck.accepted, onDeck.dropEffect], note: [onNote.accepted, onNote.dropEffect] },
            { deck: [true, "copy"], note: [false, "none"] });
    });
});
