/* global describe, it, before, after, assert, Zotero, Services, ChromeUtils, wvT */

// The old instance's destroy() swept every reader window's Weavero chrome
// (_wvStripWindowChrome) 1.5 s after a disable -- and after a reload or an
// update as well, unless the new instance was back by then. A Zotero 10
// reload often took longer (dev.99 triage, 2026-11-27): the sweep took a
// reader window's item pane and a deck window's note editor, the new pane
// stayed unbound (its bind cache still named the item) and the note was never
// mounted again -- zz-reader-window-wiring and zz-reload-listeners failed on
// every dev-line Zotero 10 run, and a user updating Weavero with a reader
// window open would see the same. Since then the sweep is a disable's or an
// uninstall's only (index.ts destroy, reason 4/6; a reload and an update pass
// 7/8, Zotero's plugins.js getVersionChangeReason), and a stripped window
// heals at the next init: a new pane binds, a note tab with no editor gets one
// (reader.ts _ensureReaderWindowItemPane, _wvWTRemountDetachedNotes).
//
// The first case forces the timing: an add-on listener holds the reinstall
// for 3 s after Zotero's own onInstalling has shut the old instance down
// (Zotero's AddonManager awaits each listener in turn: callAddonListeners),
// so the old instance's 1.5-s timer always fires before the new instance
// starts. The second strips the windows by hand and runs the init path.
// RUNS LAST (zz-): the reload re-initializes the plugin for every spec after
// it. Zotero 9/10 only: on a Zotero with its own windows a document opened in
// a window is a main window's tab, and there is no deck window (NATIVE_RETIRED).

describe("Weavero — a plugin reload keeps the reader windows' chrome (the strip is a disable's)", function () {
    this.timeout(240000);
    const ID = "weavero@mjthoraval";
    let main = null;
    let parentR = null, pdf = null, deckParent = null, deckAnchor = null, deckNote = null;
    let rw = null, dw = null;
    let before0 = null, after0 = null, deckEd0 = null;
    const hold = { heard: 0, gone: null, back: 0 };
    const sleep = (ms) => new Promise(r => (main || Zotero.getMainWindow()).setTimeout(r, ms));
    const windowsOf = (type) => { const out = []; const en = Services.wm.getEnumerator(type); while (en.hasMoreElements()) out.push(en.getNext()); return out; };
    const ids = (w) => [...w.document.querySelectorAll("[id^='wv-']")].map(e => e.id).sort();
    /** The window's Weavero item pane: the item it is bound to, and how many of
     *  Weavero's own sections it holds. */
    const paneOf = (w) => {
        const d = w && w.document && w.document.getElementById("wv-reader-item-details");
        return {
            pane: !!d,
            item: d && d.item ? d.item.id : null,
            sections: d ? [...d.querySelectorAll("item-pane-custom-section")].filter(s => /weavero/.test(s.dataset.pane || "")).length : 0,
        };
    };
    const noteTab = (w) => { const st = w && w._wvWT; return st && st.tabs ? st.tabs.find(t => t && t.type === "note") || null : null; };
    const edOk = (w) => { const t = noteTab(w); return !!(t && t.noteEditor && t.noteEditor.isConnected); };

    async function openReaderWindow(itemID) {
        const was = new Set(windowsOf("zotero:reader"));
        await Zotero.Reader.open(itemID, null, { openInWindow: true });
        const w = await wvT.waitFor(() => windowsOf("zotero:reader").find(x => !was.has(x)) || null, 15000, 100);
        assert.isOk(w, "reader window opened for " + itemID);
        // The toolbar has rendered (the renderToolbar path ran).
        assert.ok(await wvT.waitFor(() => wvT.lib().wvListenKeys(w).some(k => k.key === "readersCleanup:unload"), 15000, 100), "renderToolbar reached the reader window");
        return w;
    }

    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        for (const m of ["_wvOpenNoteInDeckWindow", "_wvStripWindowChrome", "_wvReaderWindowTargets", "_wvWireReaderWindow"]) wvT.method(m);
        main = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const addon = await AddonManager.getAddonByID(ID);
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");

        parentR = await wvT.createItem("journalArticle", { title: "WV-TEST strip reader parent" });
        pdf = await wvT.createTestPDFItem("wv-strip-reader", { parentItemID: parentR.id });
        deckParent = await wvT.createItem("journalArticle", { title: "WV-TEST strip deck parent" });
        deckAnchor = await wvT.createTestPDFItem("wv-strip-deck-anchor", { parentItemID: deckParent.id });
        deckNote = new Zotero.Item("note");
        deckNote.libraryID = Zotero.Libraries.userLibraryID;
        deckNote.parentID = deckParent.id;
        deckNote.setNote("<p>WV-TEST strip deck note</p>");
        await deckNote.saveTx();

        rw = await openReaderWindow(pdf.id);
        dw = await wvT.plugin()._wvOpenNoteInDeckWindow(deckNote.id, null);
        assert.isOk(dw && dw._wvWT, "deck window opened");
        assert.ok(await wvT.waitFor(() => paneOf(rw).item === parentR.id && paneOf(rw).sections > 0, 30000, 100),
            "fixture: the reader window's pane bound to its paper, Weavero's sections in it: " + JSON.stringify(paneOf(rw)));
        assert.ok(await wvT.waitFor(() => edOk(dw) && paneOf(dw).item === deckNote.id, 30000, 100),
            "fixture: the deck window's note editor, its pane bound to the note: " + JSON.stringify(paneOf(dw)));
        try { main.focus(); } catch (_) {}
        await sleep(3000);
        before0 = { rw: ids(rw), dw: ids(dw) };
        deckEd0 = noteTab(dw).noteEditor;

        // The reload, held 3 s between the old instance's shutdown and the new
        // one's start (a slow Zotero 10 reload, made certain).
        const listener = {
            onInstalling(a) {
                if (!a || a.id !== ID) return undefined;
                hold.heard = Date.now();
                hold.gone = !(/** @type {any} */ (Zotero).Weavero && /** @type {any} */ (Zotero).Weavero.plugin);
                return new Promise(r => main.setTimeout(r, 3000));
            },
        };
        AddonManager.addAddonListener(listener);
        try {
            /** @type {any} */ (Zotero)._weaveroReady = false;
            await addon.reload();
            for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
            assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back after the reload");
            hold.back = Date.now();
        }
        finally { AddonManager.removeAddonListener(listener); }
        // Past the new instance's init and its deferred passes (the reader-window
        // self-heal at 2 s), and long past the old instance's 1.5-s timer.
        try { main.focus(); } catch (_) {}
        await sleep(5000);
        after0 = { rw: ids(rw), dw: ids(dw) };
    });

    after(async function () {
        for (const w of windowsOf("zotero:reader")) { try { w.close(); } catch (_) {} }
        await wvT.waitFor(() => !windowsOf("zotero:reader").length, 5000, 100);
        await sleep(1000);
        wvT.purgeDeadReaders();
        await wvT.erase(deckNote, deckAnchor, deckParent, pdf, parentR);
    });

    it("a reload slower than 1.5 s leaves each reader window's chrome in place: the old instance strips nothing", function () {
        assert.isAbove(hold.heard, 0, "fixture: the reinstall was held");
        assert.isTrue(hold.gone, "fixture: the old instance had shut down before the hold");
        assert.isAtLeast(hold.back - hold.heard, 2900, "fixture: the new instance came back 3 s after the old one went");
        const lacking = (a, b) => a.filter(x => !b.includes(x));
        assert.deepEqual({ reader: lacking(before0.rw, after0.rw), deck: lacking(before0.dw, after0.dw) }, { reader: [], deck: [] }, "no Weavero element lost");
        assert.strictEqual(noteTab(dw).noteEditor, deckEd0, "the deck window's note editor is the one it had");
        assert.isTrue(deckEd0.isConnected, "still in the window");
        const p = paneOf(rw);
        assert.ok(p.item === parentR.id && p.sections > 0, "the reader window's pane bound, with Weavero's sections: " + JSON.stringify(p));
    });

    it("a stripped reader window and deck window are whole again after the next instance's init: the new pane binds, the note tab gets an editor", async function () {
        const wv = wvT.plugin();
        for (const w of [rw, dw]) wv._wvStripWindowChrome(w);
        assert.isNull(rw.document.getElementById("wv-reader-pane"), "fixture: the strip took the reader window's pane");
        assert.isFalse(edOk(dw), "fixture: and the deck window's note editor");
        // What a new instance's init runs on every open reader window (index.ts).
        for (const t of wv._wvReaderWindowTargets()) wv._wvWireReaderWindow(t.win, t.r, "init");
        assert.ok(await wvT.waitFor(() => paneOf(rw).item === parentR.id && paneOf(rw).sections > 0, 30000, 100),
            "the reader window's new pane bound to its paper, with Weavero's sections: " + JSON.stringify(paneOf(rw)));
        assert.ok(await wvT.waitFor(() => paneOf(dw).item === deckNote.id, 30000, 100), "the deck window's new pane bound to its note: " + JSON.stringify(paneOf(dw)));
        const t = noteTab(dw);
        assert.ok(edOk(dw), "the note tab has an editor in the window again");
        assert.strictEqual(t.noteEditor.id, "wv-wt-note-" + String(t.id).replace(/^wvwt-/, ""), "under the tab's own id");
        assert.strictEqual(t.noteEditor.item && t.noteEditor.item.id, deckNote.id, "showing its note");
        if (dw._wvWT.activeId === t.id) assert.isFalse(t.noteEditor.collapsed, "shown: the window's active tab");
    });
});
