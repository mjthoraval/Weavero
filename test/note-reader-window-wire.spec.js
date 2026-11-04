/* global describe, it, before, after, assert, Zotero */
// A note tab in a reader window (a "deck" window holding only a note) is
// wired once its editor's content is real. The tab's <note-editor> mounts its
// iframe asynchronously and fills it later, and the global sweeps know
// nothing of that timing, so the switch polls for the content and sweeps
// then, as the old reader-window outline did. notenav's _wvNoteTabWire
// stopped at the iframe: the editor stayed unwired five seconds after opening
// (no link handling, no outline), and a plugin reload could lose every note
// listener in reader windows (the merged full suite, 2026-11-04).
// FAILED on 1.0.0-beta.2-dev.10.
describe("Weavero — a note in a reader window is wired once its editor is ready", function () {
    this.timeout(60000);
    let wv, parent, anchor, note, deckWin = null;

    before(async function () {
        wv = wvT.plugin();
        for (const m of ["_wvOpenNoteInDeckWindow", "_wvNoteTabWire"]) wvT.method(m);
        parent = await wvT.createItem("journalArticle", { title: "WV-TEST reader-window note" });
        anchor = await wvT.createTestPDFItem("wv-note-wire-anchor", { parentItemID: parent.id });
        note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.parentID = parent.id;
        note.setNote('<div data-schema-version="9"><h1>WV-TEST heading one</h1><p>text</p><h2>WV-TEST heading two</h2><p>more</p></div>');
        await note.saveTx({ skipSelect: true });
    });

    after(async function () {
        try { if (deckWin && !deckWin.closed) deckWin.close(); } catch (e) {}
        for (let i = 0; i < 50 && deckWin && !deckWin.closed; i++) await wvT.sleep(100);
        // Closing an editor saves it: let that land before the erase
        // (note-outline.spec.js says what a late one does).
        await wvT.sleep(1500);
        wvT.purgeDeadReaders();
        await wvT.erase(note, anchor, parent);
    });

    it("its editor's document is wired and its outline drawn, with no other sweep's help", async function () {
        deckWin = await wv._wvOpenNoteInDeckWindow(note.id, null);
        assert.isOk(deckWin && deckWin._wvWT, "the deck window");
        const tab = deckWin._wvWT.tabs.find((t) => t.type === "note");
        assert.isOk(tab && tab.noteEditor, "its note tab");
        const ne = tab.noteEditor;
        const frame = () => ne.querySelector("iframe#editor-view") || ne.querySelector("iframe");
        for (let i = 0; i < 100; i++) {
            try { if (frame().contentDocument.querySelector(".ProseMirror")) break; } catch (e) {}
            await wvT.sleep(100);
        }
        assert.isOk(frame().contentDocument.querySelector(".ProseMirror"), "the editor's content");
        // Well inside the 5 s the failing state was still there at.
        for (let i = 0; i < 30 && frame().contentDocument._wvNoteLinksWired !== wv; i++) await wvT.sleep(100);
        assert.strictEqual(frame().contentDocument._wvNoteLinksWired === wv, true, "the note's document wired by the live instance");
        // Its rows follow the page's injected heading code. This spec's note
        // is the runner's FIRST (it runs alone in a fresh profile): the
        // bundle's first fetch outran the outline's first render and nothing
        // rendered again, the headings there in the page and no panel, 8 s on
        // (dev.11, Zotero 11 and 10.0.7). `_wvInstallNoteLinkify` renders
        // again when the code lands.
        const t0 = Date.now();
        for (let i = 0; i < 80 && ne.querySelectorAll(".wv-note-outline-row").length < 2; i++) await wvT.sleep(100);
        Zotero.debug("[wv-test] reader-window outline rows after " + (Date.now() - t0) + " ms");
        assert.lengthOf([...ne.querySelectorAll(".wv-note-outline-row")], 2, "the outline panel with its two headings, " + (Date.now() - t0) + " ms after the wiring");
    });
});
