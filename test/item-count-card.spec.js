/* global describe, it, before, after, assert, Zotero, wvT */

// The item pane's detailed count -- Weavero's card under "N items in this view", and
// under "N items selected" in the batch-edit prompt (filter.ts
// _wvWireItemCountBreakdown) -- follows its option at once. MJT 2026-11-19: unticking
// Settings > Sort & Filters > "Detailed item count" (weavero.itemCountBreakdown) left
// the card in place until the next redraw: the card is drawn only when Zotero renders
// the message, and no pref observer watched the option (fix: prefs-observers.ts ->
// _wvCountMessageRedraw). Each case flips the pref and does nothing else.
describe("Weavero — the detailed item count follows its option", function () {
    this.timeout(60000);
    let wv, win, ZP;
    const made = [];
    const PREF = "weavero.itemCountBreakdown";
    const MASTER = "weavero.enableFilters";
    const pane = () => (ZP.libraryView && ZP.libraryView.itemPane) || ZP.itemPane || win.document.getElementById("zotero-item-pane");
    const mode = () => { const p = pane(); return p ? p.getAttribute("view-type") : null; };
    /** The card in the message box, or in the batch-edit prompt. */
    const card = (where) => {
        const host = win.document.getElementById(where === "batch" ? "batch-edit-prompt" : "zotero-item-pane-message-box");
        return host ? host.querySelector(".wv-count-tree") : null;
    };
    /** Set `key` to `value` -- nothing else -- and wait for the card in `where` to be
     *  there (`want`) or gone. */
    async function flip(key, value, where, want) {
        Zotero.Prefs.set(key, value);
        return !!(await wvT.waitFor(() => (!!card(where) === want) || null, 3000, 50));
    }
    async function nothingSelected() {
        ZP.itemsView.selection.clearSelection();
        await ZP.itemSelected();
        assert.ok(await wvT.waitFor(() => (mode() === "message" && card("message")) || null, 5000, 50),
            "fixture: the card under the message (mode " + mode() + ")");
    }

    before(async function () {
        wv = wvT.plugin();
        if (!wv) wvT.absent("plugin");
        wvT.method("_wvCountMessageRedraw");
        win = Zotero.getMainWindow();
        ZP = win.ZoteroPane;
        // Two papers with a child note each: rows on two levels for the card.
        for (const n of ["A", "B"]) {
            const it = await wvT.createItem("journalArticle", { title: "WV count card " + n });
            made.push(it);
            const note = new Zotero.Item("note");
            note.parentID = it.id;
            note.setNote("<p>WV count card child " + n + "</p>");
            await note.saveTx();
        }
        await ZP.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
        await wvT.sleep(600);
    });

    after(async function () {
        try { ZP.itemsView.selection.clearSelection(); } catch (e) {}
        await wvT.erase(...made);
    });

    it("nothing selected: unticked, the card under \"N items in this view\" goes at once; ticked, it comes back", async function () {
        await wvT.withPref(PREF, true, async () => {
            await nothingSelected();
            assert.isTrue(await flip(PREF, false, "message", false), "unticked: the card is gone");
            assert.strictEqual(mode(), "message", "Zotero's message still shown");
            assert.isTrue(await flip(PREF, true, "message", true), "ticked again: the card is back");
        });
    });

    it("several items selected: the card in the batch-edit prompt goes and comes back with the option", async function () {
        await wvT.withPref(PREF, true, async () => {
            await ZP.itemsView.selectItems(made.map(x => x.id));
            assert.ok(await wvT.waitFor(() => (mode() === "batch-edit-prompt" && card("batch")) || null, 5000, 50),
                "fixture: the batch-edit prompt with the card (mode " + mode() + ")");
            assert.isTrue(await flip(PREF, false, "batch", false), "unticked: the card is gone");
            assert.isTrue(await flip(PREF, true, "batch", true), "ticked again: the card is back");
            assert.strictEqual(ZP.getSelectedItems().length, 2, "the selection kept");
        });
    });

    it("the Sort & Filters master too: off, the card goes; on, it comes back", async function () {
        await wvT.withPref(PREF, true, async () => {
            await wvT.withPref(MASTER, true, async () => {
                await nothingSelected();
                assert.isTrue(await flip(MASTER, false, "message", false), "master off: the card is gone");
                assert.isTrue(await flip(MASTER, true, "message", true), "master on: the card is back");
            });
        });
    });
});
