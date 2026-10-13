/* global describe, it, before, assert, Zotero, Services, IOUtils, ChromeUtils, Components */

// Listener stamps (survey 2026-10-06 §3.2, step 7: wiring slice 3). A
// listener on a LONG-LIVED target -- a window, a document, a chrome element
// that outlives a render, a reader or note-editor frame -- belongs to the
// plugin instance that added it. After a plugin reload (every update and
// dev install) the new instance must not leave the previous one's listeners
// in place: a boolean or hand-bumped stamp made the new instance skip its
// own wiring (the old code kept running until a restart), and a listener
// with no stamp and no teardown simply doubled (the old one kept acting
// through a dead `this`).
//
// Every function's global tells its instance: the bundle loads into the
// add-on's bootstrap scope, a fresh one per startup. This spec opens the
// surfaces that carry such listeners (a reader tab, a reader window, a note
// window, a deck window holding a note, an item with a related item
// selected), reloads the plugin, and
// lists every listener whose function comes from a Weavero scope other
// than the live one, across every open window and the frames inside them.
// RUNS LAST (zz-): the reload re-initializes the plugin for every spec after
// it. WV_LISTENERS_RECORD=<path> dumps the list.

describe("Weavero — a plugin reload leaves no listener of the previous instance", function () {
    this.timeout(300000);
    let main = null;
    const sleep = (ms) => new Promise(r => (main || Zotero.getMainWindow()).setTimeout(r, ms));
    // `Components.*`, not the Cc/Ci/Cu shorthands: the runner page does not
    // define those, and a ReferenceError here dropped the suite silently.
    let els = null;
    let Cu = null;

    const isWeaveroScope = (g) => {
        try { return typeof g.startup === "function" && String(g.startup).includes("Zotero.Weavero"); }
        catch (e) { return false; }
    };
    const liveScope = () => Cu.getGlobalForObject(wvT.plugin()._wvWireTag);

    /** A short, stable name for a listener target. */
    const nameOf = (t, w, doc) => {
        if (t === w) return "window";
        if (t === doc) return "document";
        if (t.id) return "#" + t.id;
        const cls = String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : (t.className || "")).split(/\s+/).filter(Boolean)[0];
        return t.localName + (cls ? "." + cls : "");
    };
    /** The Weavero names a handler's source mentions (its signature). */
    const hint = (fn) => {
        const src = String(fn).replace(/\s+/g, " ");
        const m = src.match(/\b_wv\w+|\b_(?:setup|update|patch|ensure|render|open|resolve|on|handle|build|apply|teardown)\w+/g);
        return m ? [...new Set(m)].slice(0, 3).join(",") : src.slice(0, 40);
    };

    /** Weavero listeners on every node of `doc` (and the frames inside it)
     *  whose scope is not `scope`, as "kind | target type :: hint" -> count. */
    function staleIn(w, kind, scope, out, depth) {
        let doc;
        try { doc = w.document; } catch (e) { return; }
        if (!doc) return;
        const nodes = [w, doc, ...doc.querySelectorAll("*")];
        for (const t of nodes) {
            let infos;
            try { infos = els.getListenerInfoFor(t); } catch (e) { continue; }
            for (const li of infos) {
                let fn = null;
                try { fn = li.listenerObject; } catch (e) {}
                if (!fn) continue;
                let g;
                try { g = Cu.getGlobalForObject(fn); } catch (e) { continue; }
                if (g === scope || !isWeaveroScope(g)) continue;
                const k = kind + " | " + nameOf(t, w, doc) + " " + li.type + (li.capturing ? "(c)" : "") + " :: " + hint(fn);
                out[k] = (out[k] || 0) + 1;
            }
            if (depth < 3 && (t.localName === "iframe" || t.localName === "browser")) {
                let cw = null;
                try { cw = t.contentWindow; } catch (e) {}
                if (cw) staleIn(cw, kind + ">" + (t.id || t.localName), scope, out, depth + 1);
            }
        }
    }

    /** Every wvListen record (lib/listen.ts) on every node of every window,
     *  as "kind | target :: key" -> tag. The reload must hand each key to the
     *  new instance: a migrated listener that no path re-wires after a
     *  reload would vanish with the old instance's destroy(). */
    function keyed() {
        const lib = wvT.lib();
        const out = {};
        const walk = (w, kind, depth) => {
            let doc;
            try { doc = w.document; } catch (e) { return; }
            if (!doc) return;
            for (const t of [w, doc, ...doc.querySelectorAll("*")]) {
                for (const k of lib.wvListenKeys(t)) out[kind + " | " + nameOf(t, w, doc) + " :: " + k.key] = k.tag;
                if (depth < 3 && (t.localName === "iframe" || t.localName === "browser")) {
                    let cw = null;
                    try { cw = t.contentWindow; } catch (e) {}
                    if (cw) walk(cw, kind + ">" + (t.id || t.localName), depth + 1);
                }
            }
        };
        const en = Services.wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w = /** @type {any} */ (en.getNext());
            let type = "";
            try { type = w.document.documentElement.getAttribute("windowtype") || ""; } catch (e) {}
            if (/Test Runn/.test(String(w.document && w.document.title))) continue;
            walk(w, type.replace(/^zotero:|^navigator:/, "") || "window", 0);
        }
        return out;
    }

    function audit() {
        if (!els) els = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
        if (!Cu) Cu = Components.utils;
        const scope = liveScope();
        const out = {};
        const en = Services.wm.getEnumerator(null);
        while (en.hasMoreElements()) {
            const w = /** @type {any} */ (en.getNext());
            let type = "";
            try { type = w.document.documentElement.getAttribute("windowtype") || ""; } catch (e) {}
            if (/Test Runn/.test(String(w.document && w.document.title))) continue;
            staleIn(w, type.replace(/^zotero:|^navigator:/, "") || "window", scope, out, 0);
        }
        return out;
    }

    let atStart = null, afterReload = null, keysBefore = null, keysAfter = null, liveTag = null;
    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        main = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");

        const pdfTab = await wvT.createTestPDFItem("wv-listeners-tab");
        const pdfWin = await wvT.createTestPDFItem("wv-listeners-win");
        const item = await wvT.createItem("journalArticle", { title: "WV-TEST listeners item" });
        const rel = await wvT.createItem("journalArticle", { title: "WV-TEST listeners related" });
        item.addRelatedItem(rel); await item.saveTx();
        rel.addRelatedItem(item); await rel.saveTx();
        const note = new Zotero.Item("note");
        note.libraryID = Zotero.Libraries.userLibraryID;
        note.setNote("<p>WV-TEST listeners note</p>");
        await note.saveTx();
        // A DECK window (a reader window holding only a note: no native
        // reader in Zotero.Reader._readers) -- the init and teardown paths
        // missed those until 2026-10-13.
        const deckParent = await wvT.createItem("journalArticle", { title: "WV-TEST listeners deck parent" });
        const deckAnchor = await wvT.createTestPDFItem("wv-listeners-deck-anchor", { parentItemID: deckParent.id });
        const deckNote = new Zotero.Item("note");
        deckNote.libraryID = Zotero.Libraries.userLibraryID;
        deckNote.parentID = deckParent.id;
        deckNote.setNote("<p>WV-TEST listeners deck note</p>");
        await deckNote.saveTx();
        const deck = Zotero.Prefs.get("weavero.noteOpenInDeckWindow");
        try {
            await Zotero.Reader.open(pdfTab.id);
            await Zotero.Reader.open(pdfWin.id, null, { openInWindow: true });
            Zotero.Prefs.set("weavero.noteOpenInDeckWindow", false);
            await Zotero.Notes.open(note.id, null, { openInWindow: true });
            if (deck === undefined) Zotero.Prefs.clear("weavero.noteOpenInDeckWindow"); else Zotero.Prefs.set("weavero.noteOpenInDeckWindow", deck);
            const deckWin = await wvT.plugin()._wvOpenNoteInDeckWindow(deckNote.id, null);
            assert.isOk(deckWin && deckWin._wvWT, "deck window opened");
            main.focus();
            main.Zotero_Tabs.select("zotero-pane");
            await main.ZoteroPane.selectItem(item.id);
            await sleep(5000);
            atStart = audit();
            keysBefore = keyed();
            /** @type {any} */ (Zotero)._weaveroReady = false;
            await addon.reload();
            for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
            assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back after the reload");
            main.focus();
            await sleep(6000);
            afterReload = audit();
            keysAfter = keyed();
            liveTag = wvT.plugin()._wvWireTag();
        }
        finally {
            if (deck === undefined) { try { Zotero.Prefs.clear("weavero.noteOpenInDeckWindow"); } catch (e) {} }
            else Zotero.Prefs.set("weavero.noteOpenInDeckWindow", deck);
            for (const t of ["zotero:reader", "zotero:note"]) {
                const en = Services.wm.getEnumerator(t);
                while (en.hasMoreElements()) { try { /** @type {any} */ (en.getNext()).close(); } catch (e) {} }
            }
            try {
                const Z = main.Zotero_Tabs;
                const ids = Z._tabs.filter(x => x.type !== "library" && x.data && x.data.itemID === pdfTab.id).map(x => x.id);
                if (ids.length) Z.close(ids);
            } catch (e) {}
            await sleep(1500);
            wvT.purgeDeadReaders();
            await wvT.erase(note, item, rel, pdfTab, pdfWin, deckNote, deckAnchor, deckParent);
        }
    });

    it("before the reload every Weavero listener is the live instance's", () => {
        assert.deepEqual(atStart, {});
    });

    it("every keyed listener is wired again by the new instance", () => {
        assert.isOk(keysBefore && keysAfter, "recorded");
        // "boot:" keys belong to app startup only (the background-restore
        // shepherd): a reload does not run that again, by design. "lazy:"
        // keys are wired on first use (a popup's Escape on its first open).
        const lost = Object.keys(keysBefore).filter(k => !(k in keysAfter) && !/ :: (boot|lazy):/.test(k));
        // With the tag it carries (vs the live one), and the outline takeover
        // pref: the full suite (2026-10-13) left the outline click-focus
        // capture under an old tag, which the targeted runs never did.
        const stale = Object.keys(keysAfter).filter(k => keysAfter[k] !== liveTag)
            .map(k => k + " @" + keysAfter[k] + " (live " + liveTag + ", readerOutlineTakeover "
                + Zotero.Prefs.get("weavero.readerOutlineTakeover") + ")");
        assert.deepEqual({ lost, stale }, { lost: [], stale: [] });
    });

    // destroy() removes by REGISTRY, then sweeps the chrome tables by tag
    // (wvSweepTagOnChrome). Anything the sweep had to remove is a record the
    // registry lost -- a defect even though the sweep cleaned it up.
    it("destroy's table sweep found nothing the registry missed", () => {
        assert.deepEqual(/** @type {any} */ (Zotero)._wvListenSweepMisses || [], []);
    });

    it("after the reload no listener of the previous instance is left", async () => {
        let rec = null;
        try { rec = Services.env.get("WV_LISTENERS_RECORD"); } catch (e) {}
        if (rec) await IOUtils.writeUTF8(rec, JSON.stringify(afterReload, null, 1));
        assert.deepEqual(afterReload, {});
    });
});
