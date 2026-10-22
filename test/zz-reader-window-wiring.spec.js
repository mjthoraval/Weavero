/* global describe, it, before, assert, Zotero, Services, IOUtils, ChromeUtils */

// Reader and note windows (survey 2026-10-06 §3.2, step 7: wiring slice 2).
// Three kinds of secondary window carry Weavero chrome:
//   reader -- a standalone reader window (Zotero.Reader.open, openInWindow);
//   deck   -- a reader-type window hosting a NOTE tab ("Open notes in a
//             tab-hosting window", the default for notes opened in a window);
//   note   -- Zotero's stock note window (that option off).
// They are wired by several paths: the reader's renderToolbar event
// (_toolbarHandlerImpl), the multi-tab state's lazy creation (_wvWTState),
// the note-window watcher, init's scans of already-open windows, and the
// "Hide title bar" pref observers. Everything Weavero leaves on each window
// is recorded (marks() below) after each of:
//   open   -- the window opened with Weavero running;
//   reload -- the plugin restarted with the window open, as on every update
//             and dev install (AddonManager `reload()`; the runner installs
//             Weavero as a temporary add-on, which that call reinstalls);
//   pref   -- "Hide title bar" for reader and note windows toggled live.
// RUNS LAST (zz-): the reload re-initializes the plugin for every spec after
// it. Set WV_WIRING2_RECORD=<path> to dump the recording.
// Keyed listeners (lib/listen.ts) are recorded by key ("listen <key>";
// re-recorded 2026-10-13, wiring slice 3). The reload parity is the guard
// for the deck window: init, the pref path and destroy() reached only
// windows with a native reader, so once destroy() removed the old
// instance's listeners a reloaded deck window lost Ctrl+T, Ctrl+Shift+T,
// Ctrl+N, its window controls and its close-time cleanup.

describe("Weavero — reader and note window wiring, characterized (reloads the plugin)", function () {
    this.timeout(300000);
    let main = null;
    const sleep = (ms) => new Promise(r => (main || Zotero.getMainWindow()).setTimeout(r, ms));
    const PREFS = ["weavero.compactTitleBarReader", "weavero.compactTitleBarNote", "weavero.noteOpenInDeckWindow"];

    const windowsOf = (type) => {
        const out = [];
        const en = Services.wm.getEnumerator(type);
        while (en.hasMoreElements()) out.push(en.getNext());
        return out;
    };
    const readerOf = (w) => ((Zotero.Reader._readers || []).find(r => r && r._window === w)) || null;

    /** Everything Weavero left on secondary window `w`, as sorted strings per
     *  host: its own `_wv*` expandos (with typeof), those of key elements
     *  with their wvWrap layers, `wv-` ids and classes (with a count when an
     *  element class repeats), root classes and attributes, the native
     *  title-bar attributes, and the same for the window's first reader and
     *  its page. */
    function marks(w) {
        if (!w || w.closed) return { closed: true };
        const lib = wvT.lib();
        const VOLATILE = wvT.WIRING_VOLATILE;
        // Keyed listeners (lib/listen.ts) are recorded by key, not as the
        // bare `_wvListen` table.
        const keys = (o) => {
            try { return Object.getOwnPropertyNames(o).filter(n => /^_wv|^_weavero|^wv/.test(n) && n !== "_wvListen" && !VOLATILE.has(n)).sort(); }
            catch (e) { return ["<err>"]; }
        };
        const listens = (o) => lib.wvListenKeys(o).filter(k => !k.key.startsWith("boot:")).map(k => "listen " + k.key).sort();
        const typed = (o) => keys(o).map(k => { let v; try { v = o[k]; } catch (e) { return k + ":<err>"; } return k + ":" + (v === null ? "null" : typeof v); }).concat(listens(o));
        const layers = (host) => {
            const out = listens(host);
            try {
                const ww = host && host._wvWraps;
                if (ww) for (const m of Object.keys(ww).sort()) out.push("wrap " + m + ":" + lib.wvWrapLayers(host, m).map(l => l.layer).join("+"));
            } catch (e) { out.push("wrap <err>"); }
            return out;
        };
        const docMarks = (doc, out, prefix) => {
            out[prefix + "ids"] = [...doc.querySelectorAll("[id^='wv-']")].map(e => e.id).sort();
            const counts = new Map();
            for (const el of doc.querySelectorAll("[class*='wv-']")) {
                for (const c of el.classList) if (c.startsWith("wv-")) counts.set(c, (counts.get(c) || 0) + 1);
            }
            out[prefix + "classes"] = [...counts].map(([c, n]) => n > 1 ? c + " x" + n : c).sort();
        };
        const doc = w.document;
        const de = doc.documentElement;
        const out = {};
        out.window = typed(w);
        const hosts = {
            document: doc, documentElement: de, menubar: doc.querySelector("menubar"),
            "#menu_EditPopup": doc.getElementById("menu_EditPopup"), "#zotero-reader": doc.getElementById("zotero-reader"),
            "#reader": doc.getElementById("reader"), "#zotero-note-editor": doc.getElementById("zotero-note-editor"),
            Zotero_Tabs: w.Zotero_Tabs,
        };
        for (const [name, h] of Object.entries(hosts)) {
            if (!h) continue;
            const k = keys(h).filter(x => x !== "_wvWraps").concat(layers(h));
            if (k.length) out[name] = k;
        }
        docMarks(doc, out, "");
        out.rootClasses = [...de.classList].filter(c => c.startsWith("wv-")).sort();
        out.rootAttrs = [...de.attributes].map(a => a.name).filter(n => /^(wv|data-wv)/.test(n)).sort();
        out.titlebar = ["customtitlebar", "drawtitle"].map(n => n + "=" + de.getAttribute(n));
        const r = readerOf(w);
        if (r) {
            out.reader = typed(r);
            const iw = r._iframeWindow;
            if (iw && iw.document) docMarks(iw.document, out, "page.");
        }
        return out;
    }

    async function settle(ms) {
        try { main.focus(); } catch (_) {}
        await sleep(ms);
    }

    async function openReaderWindow(itemID) {
        const before = new Set(windowsOf("zotero:reader"));
        await Zotero.Reader.open(itemID, null, { openInWindow: true });
        let w = null;
        for (let i = 0; i < 150 && !w; i++) { await sleep(100); w = windowsOf("zotero:reader").find(x => !before.has(x)) || null; }
        assert.isOk(w, "reader window opened for " + itemID);
        // The toolbar has rendered (the renderToolbar path ran).
        const cleanupWired = () => Zotero.Weavero.lib.wvListenKeys(w).some(k => k.key === "readersCleanup:unload");
        for (let i = 0; i < 150 && !cleanupWired(); i++) await sleep(100);
        assert.isOk(cleanupWired(), "renderToolbar reached the reader window");
        return w;
    }

    async function openStockNoteWindow(noteID) {
        const before = new Set(windowsOf("zotero:note"));
        const deck = Zotero.Prefs.get("weavero.noteOpenInDeckWindow");
        Zotero.Prefs.set("weavero.noteOpenInDeckWindow", false);
        try { await Zotero.Notes.open(noteID, null, { openInWindow: true }); }
        finally { restorePref("weavero.noteOpenInDeckWindow", deck); }
        let w = null;
        for (let i = 0; i < 150 && !w; i++) { await sleep(100); w = windowsOf("zotero:note").find(x => !before.has(x)) || null; }
        assert.isOk(w, "note window opened for " + noteID);
        for (let i = 0; i < 150 && !(w.document && w.document.readyState === "complete" && w.document.getElementById("zotero-note-editor")); i++) await sleep(100);
        return w;
    }

    function restorePref(p, v) {
        if (v === undefined) { try { Zotero.Prefs.clear(p); } catch (e) {} }
        else Zotero.Prefs.set(p, v);
    }

    async function reloadPlugin(addon) {
        /** @type {any} */ (Zotero)._weaveroReady = false;
        await addon.reload();
        for (let i = 0; i < 600 && /** @type {any} */ (Zotero)._weaveroReady !== true; i++) await sleep(100);
        assert.strictEqual(/** @type {any} */ (Zotero)._weaveroReady, true, "the plugin is back after the reload");
        // Past init's deferred passes (the reader-window self-heal at 2 s).
        await settle(5000);
    }

    let got = null;
    before(async function () {
        if (!wvT.plugin()) wvT.absent("plugin");
        const lib = wvT.lib();
        if (!lib || typeof lib.wvWrapLayers !== "function") wvT.absent("Zotero.Weavero.lib.wvWrapLayers");
        wvT.method("_wvOpenNoteInDeckWindow");
        main = Zotero.getMainWindow();
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const addon = await AddonManager.getAddonByID("weavero@mjthoraval");
        if (!addon) wvT.absent("the Weavero add-on in AddonManager");

        const saved = {};
        for (const p of PREFS) saved[p] = Zotero.Prefs.get(p);
        const pdfA = await wvT.createTestPDFItem("wv-wiring2-A");
        const pdfB = await wvT.createTestPDFItem("wv-wiring2-B");
        const parent = await wvT.createItem("journalArticle", { title: "WV-TEST wiring2 parent" });
        const anchor = await wvT.createTestPDFItem("wv-wiring2-anchor", { parentItemID: parent.id });
        const mkNote = async (html, parentItemID) => {
            const n = new Zotero.Item("note");
            n.libraryID = Zotero.Libraries.userLibraryID;
            if (parentItemID) n.parentID = parentItemID;
            n.setNote(html);
            await n.saveTx();
            return n;
        };
        const note1 = await mkNote("<p>WV-TEST wiring2 note one</p>");
        const note2 = await mkNote("<p>WV-TEST wiring2 note two</p>");
        const deckNote = await mkNote("<p>WV-TEST wiring2 deck note</p>", parent.id);

        const W = {};
        got = {};
        const snap = (step) => { for (const [label, w] of Object.entries(W)) got[label + "." + step] = marks(w); };
        try {
            // Hide title bar ON for reader and note windows (the defaults).
            Zotero.Prefs.set("weavero.compactTitleBarReader", true);
            Zotero.Prefs.set("weavero.compactTitleBarNote", true);
            W.reader1 = await openReaderWindow(pdfA.id);
            W.note1 = await openStockNoteWindow(note1.id);
            W.deck1 = await wvT.plugin()._wvOpenNoteInDeckWindow(deckNote.id, null);
            assert.isOk(W.deck1 && W.deck1._wvWT, "deck window opened");
            await settle(4000);
            snap("on.open");

            await reloadPlugin(addon);
            snap("on.reload");

            // The deck window is closed before the toggle: turning the reader
            // strip off moves a window's extra tabs into the main window,
            // which is a window-set change, not wiring.
            try { W.deck1.close(); } catch (_) {}
            for (let i = 0; i < 50 && !W.deck1.closed; i++) await sleep(100);
            delete W.deck1;
            await settle(1000);

            Zotero.Prefs.set("weavero.compactTitleBarReader", false);
            Zotero.Prefs.set("weavero.compactTitleBarNote", false);
            await settle(3000);
            snap("toOff.pref");

            W.reader2 = await openReaderWindow(pdfB.id);
            W.note2 = await openStockNoteWindow(note2.id);
            await settle(4000);
            got["reader2.off.open"] = marks(W.reader2);
            got["note2.off.open"] = marks(W.note2);

            await reloadPlugin(addon);
            snap("off.reload");

            Zotero.Prefs.set("weavero.compactTitleBarReader", true);
            Zotero.Prefs.set("weavero.compactTitleBarNote", true);
            await settle(3000);
            snap("toOn.pref");
        }
        finally {
            for (const p of PREFS) restorePref(p, saved[p]);
            for (const w of [...windowsOf("zotero:reader"), ...windowsOf("zotero:note")]) { try { w.close(); } catch (_) {} }
            for (let i = 0; i < 50 && (windowsOf("zotero:reader").length || windowsOf("zotero:note").length); i++) await sleep(100);
            await settle(1000);
            wvT.purgeDeadReaders();
            await wvT.erase(note1, note2, deckNote, anchor, parent, pdfA, pdfB);
        }
    });

    /** Per host: the marks `a` has and `b` lacks, minus `allowed`. */
    const lacking = (a, b, allowed) => {
        const out = {};
        for (const [k, marks] of Object.entries(a || {})) {
            if (!Array.isArray(marks)) continue;
            const have = new Set((b && b[k]) || []);
            const ok = new Set((allowed && allowed[k]) || []);
            const m = marks.filter(x => !have.has(x) && !ok.has(x));
            if (m.length) out[k] = m;
        }
        return out;
    };

    // Reload: the outline takeover re-initializes each open reader, which
    // leaves its native-outline watcher slot set to null (reader state, not
    // window wiring).
    const RELOAD_EXTRA = { reader: ["_wvNativeOutlineMO:null"] };

    it("a reload leaves each window wired as it was opened", () => {
        assert.isOk(got && got["reader1.on.open"], "recorded");
        const out = {};
        for (const [w, mode] of [["reader1", "on"], ["note1", "on"], ["deck1", "on"], ["reader2", "off"], ["note2", "off"]]) {
            const open = got[w + "." + mode + ".open"], reload = got[w + "." + mode + ".reload"];
            const lost = lacking(open, reload);
            const gained = lacking(reload, open, RELOAD_EXTRA);
            if (Object.keys(lost).length) out[w + " lost"] = lost;
            if (Object.keys(gained).length) out[w + " gained"] = gained;
        }
        // Guard for 2026-10-12: with "Hide title bar" off for reader windows,
        // a reload dropped Edit > Undo, Ctrl+Y and Move to Tab, and gave the
        // window the identity it had not had at open.
        assert.deepEqual(out, {});
    });

    it("a live title-bar toggle wires the window as an open in that mode does", () => {
        assert.isOk(got && got["reader1.toOff.pref"], "recorded");
        const out = {};
        for (const [toggled, opened] of [
            ["reader1.toOff.pref", "reader2.off.open"], ["note1.toOff.pref", "note2.off.open"],
            ["reader1.toOn.pref", "reader1.on.open"], ["reader2.toOn.pref", "reader1.on.open"],
            ["note2.toOn.pref", "note1.on.open"],
        ]) {
            const m = lacking(got[opened], got[toggled]);
            if (Object.keys(m).length) out[toggled + " lacks"] = m;
        }
        // Guard for 2026-10-12: toggling the reader strip off live left the
        // window without Edit > Undo and Ctrl+Y (the strip's teardown unwired
        // them, nothing re-wired them).
        assert.deepEqual(out, {});
    });

    // MJT 2026-10-13 (survey §3.5): Ctrl+N came only with the title-bar strip
    // (a reader / note window opened with "Hide title bar" off had none), and
    // note windows had no Ctrl+Shift+T at all.
    it("Ctrl+N and Ctrl+Shift+T are wired in every reader, note and deck window, whatever the title bar", () => {
        assert.isOk(got && got["reader1.on.open"], "recorded");
        const missing = [];
        for (const [step, marks] of Object.entries(got)) {
            const w = (marks && marks.window) || [];
            for (const key of ["listen newWindowKey", "listen reopenClosedKey"]) {
                if (!w.includes(key)) missing.push(step + ": " + key);
            }
        }
        assert.deepEqual(missing, []);
    });

    it("matches the recording", async () => {
        assert.isOk(got && got["reader1.on.open"], "recorded");
        let rec = null;
        try { rec = Services.env.get("WV_WIRING2_RECORD"); } catch (e) {}
        if (rec) {
            await IOUtils.writeUTF8(rec, JSON.stringify(got, null, 1));
            return;
        }
        // Platform- and theme-neutral (recorded on Windows, dark): wvT.wiringNormalize.
        assert.deepEqual(wvT.wiringNormalize(got), wvT.wiringNormalize(WIRING2_EXPECTED));
    });
});

const WIRING2_EXPECTED = {
    "reader1.on.open": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderDragOverlaySync:function", "_wvReaderMergeAbsorberWired:boolean",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerDragOverlay:diag", "listen readerNewTabKey", "listen readerNotes:unload",
            "listen readersCleanup:unload", "listen reopenClosedKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen winControls:resize", "listen winControls:sizemodechange",
            "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-reader-menu x6", "wv-reader-menubar-icon", "wv-reader-pane-splitter",
            "wv-window-close", "wv-window-control x3", "wv-window-controls", "wv-window-drag-spacer",
            "wv-window-max", "wv-window-min", "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close",
            "wv-window-tab-icon", "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn",
            "wv-window-tabs", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
        reader: [],
        "page.ids": [
            "wv-reader-iframe-nodrag", "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-rf-chev", "wv-ui-dark", "wv-undo-btn x2",
            "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note1.on.open": {
        window: [
            "_wvCompactMenubar:object", "_wvNoteAltOff:function", "_wvNoteAltWired:boolean",
            "_wvReaderMergeAbsorberWired:boolean", "_wvRedoKeyH:function", "_wvTabStrip:object",
            "listen newWindowKey", "listen reopenClosedKey", "listen winControls:resize",
            "listen winControls:sizemodechange",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-note-menubar-styles", "wv-note-window-tab-context-menu",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-find-item",
            "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-menubar-zicon", "wv-reader-menu x6", "wv-window-close",
            "wv-window-control x3", "wv-window-controls", "wv-window-max", "wv-window-min",
            "wv-window-strip-fill", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
    "deck1.on.open": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvNoteDeckHidden:boolean", "_wvNoteDeckRevealTimer:null",
            "_wvOvActivateHandler:function", "_wvOvBirthMon:string", "_wvOvFollowWired:number",
            "_wvOvMoveHandler:function", "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean",
            "_wvPrevWinIcons:object", "_wvReaderDragOverlaySync:function",
            "_wvReaderMergeAbsorberWired:boolean", "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number",
            "_wvRedoKeyH:function", "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object",
            "_wvThemeMQ:object", "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTClosed:object",
            "_wvWTMultiSelOff:function", "_wvWTRestored:boolean", "_wvWinIconName:string",
            "listen newWindowKey", "listen ovFollow:unload", "listen readerDragOverlay:diag",
            "listen readerNewTabKey", "listen readerNotes:unload", "listen readersCleanup:unload",
            "listen reopenClosedKey", "listen tabGroupWinDnD:dragover", "listen tabGroupWinDnD:drop",
            "listen winControls:resize", "listen winControls:sizemodechange", "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles", "wv-wt-note-1",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-note-outline-editorbox", "wv-note-outline-empty", "wv-note-outline-hbox",
            "wv-note-outline-header", "wv-note-outline-pane", "wv-note-outline-splitter", "wv-reader-menu x6",
            "wv-reader-menubar-icon", "wv-reader-pane-splitter", "wv-window-close", "wv-window-control x3",
            "wv-window-controls", "wv-window-drag-spacer", "wv-window-max", "wv-window-min",
            "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn", "wv-window-tabs",
            "wv-window-tabstrip", "wv-wt-note",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
    "reader1.on.reload": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderDragOverlaySync:function", "_wvReaderMergeAbsorberWired:boolean",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerDragOverlay:diag", "listen readerNewTabKey", "listen readerNotes:unload",
            "listen readersCleanup:unload", "listen reopenClosedKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen winControls:resize", "listen winControls:sizemodechange",
            "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-reader-menu x6", "wv-reader-menubar-icon", "wv-reader-pane-splitter",
            "wv-window-close", "wv-window-control x3", "wv-window-controls", "wv-window-drag-spacer",
            "wv-window-max", "wv-window-min", "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close",
            "wv-window-tab-icon", "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn",
            "wv-window-tabs", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-iframe-nodrag", "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-rf-chev", "wv-ui-dark", "wv-undo-btn x2",
            "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note1.on.reload": {
        window: [
            "_wvCompactMenubar:object", "_wvNoteAltOff:function", "_wvNoteAltWired:boolean",
            "_wvReaderMergeAbsorberWired:boolean", "_wvRedoKeyH:function", "_wvTabStrip:object",
            "listen newWindowKey", "listen reopenClosedKey", "listen winControls:resize",
            "listen winControls:sizemodechange",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-note-menubar-styles", "wv-note-window-tab-context-menu",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-find-item",
            "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-menubar-zicon", "wv-reader-menu x6", "wv-window-close",
            "wv-window-control x3", "wv-window-controls", "wv-window-max", "wv-window-min",
            "wv-window-strip-fill", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
    "deck1.on.reload": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvNoteDeckHidden:boolean", "_wvNoteDeckRevealTimer:null",
            "_wvOvActivateHandler:function", "_wvOvBirthMon:string", "_wvOvFollowWired:number",
            "_wvOvMoveHandler:function", "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean",
            "_wvPrevWinIcons:object", "_wvReaderDragOverlaySync:function",
            "_wvReaderMergeAbsorberWired:boolean", "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number",
            "_wvRedoKeyH:function", "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object",
            "_wvThemeMQ:object", "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTClosed:object",
            "_wvWTMultiSelOff:function", "_wvWTRestored:boolean", "_wvWinIconName:string",
            "listen newWindowKey", "listen ovFollow:unload", "listen readerDragOverlay:diag",
            "listen readerNewTabKey", "listen readerNotes:unload", "listen readersCleanup:unload",
            "listen reopenClosedKey", "listen tabGroupWinDnD:dragover", "listen tabGroupWinDnD:drop",
            "listen winControls:resize", "listen winControls:sizemodechange", "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles", "wv-wt-note-1",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-note-outline-editorbox", "wv-note-outline-empty", "wv-note-outline-hbox",
            "wv-note-outline-header", "wv-note-outline-pane", "wv-note-outline-splitter", "wv-reader-menu x6",
            "wv-reader-menubar-icon", "wv-reader-pane-splitter", "wv-window-close", "wv-window-control x3",
            "wv-window-controls", "wv-window-drag-spacer", "wv-window-max", "wv-window-min",
            "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn", "wv-window-tabs",
            "wv-window-tabstrip", "wv-wt-note",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
    "reader1.toOff.pref": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvIdentityTag:string",
            "_wvOvActivateHandler:function", "_wvOvBirthMon:string", "_wvOvFollowWired:number",
            "_wvOvMoveHandler:function", "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean",
            "_wvPrevWinIcons:object", "_wvReaderDragOverlaySync:function",
            "_wvReaderMergeAbsorberWired:boolean", "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number",
            "_wvRedoKeyH:function", "_wvTabGroupWinDnDOff:function", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerDragOverlay:diag", "listen readerNewTabKey", "listen readerNotes:unload",
            "listen readersCleanup:unload", "listen reopenClosedKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer",
        ],
        ids: [
            "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-drag-overlay", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip",
        ],
        classes: [
            "wv-layout-item x4", "wv-layout-menu", "wv-layout-sep",
            "wv-reader-pane-splitter",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-reader-to-tab", "wv-rf-chev", "wv-ui-dark",
            "wv-undo-btn x2", "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note1.toOff.pref": {
        window: [
            "_wvNoteAltOff:function", "_wvNoteAltWired:boolean", "_wvReaderMergeAbsorberWired:boolean",
            "listen newWindowKey", "listen reopenClosedKey",
        ],
        ids: [
            "wv-note-window-tab-context-menu", "wv-window-tabstrip-styles",
        ],
        classes: [],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
    },
    "reader2.off.open": {
        window: [
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTitleGlyphIdx:number", "_wvWinIconName:string", "listen newWindowKey",
            "listen ovFollow:unload", "listen readerNotes:unload", "listen readersCleanup:unload",
            "listen reopenClosedKey", "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer",
        ],
        ids: [
            "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-item-details", "wv-reader-item-sidenav",
            "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck", "wv-reader-pane-splitter",
            "wv-reader-pane-style", "wv-view-menuitem-outline", "wv-view-menuitem-pane",
            "wv-view-menuitem-selector", "wv-view-menuitem-sidebar", "wv-window-badge-dot-style",
        ],
        classes: [
            "wv-layout-item x4", "wv-layout-menu", "wv-layout-sep",
            "wv-reader-pane-splitter",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
        reader: [],
        "page.ids": [
            "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-reader-to-tab", "wv-rf-chev", "wv-ui-dark",
            "wv-undo-btn x2", "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note2.off.open": {
        window: [
            "listen newWindowKey", "listen reopenClosedKey",
        ],
        ids: [],
        classes: [],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
    },
    "reader1.off.reload": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvIdentityTag:string",
            "_wvOvActivateHandler:function", "_wvOvBirthMon:string", "_wvOvFollowWired:number",
            "_wvOvMoveHandler:function", "_wvOvPollId:number", "_wvOvPosKey:string", "_wvOvSettled:boolean",
            "_wvPrevWinIcons:object", "_wvReaderDragOverlaySync:function",
            "_wvReaderMergeAbsorberWired:boolean", "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number",
            "_wvRedoKeyH:function", "_wvTabGroupWinDnDOff:function", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerNotes:unload", "listen readersCleanup:unload", "listen reopenClosedKey",
            "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer",
        ],
        ids: [
            "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-drag-overlay", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip",
        ],
        classes: [
            "wv-layout-item x4", "wv-layout-menu", "wv-layout-sep",
            "wv-reader-pane-splitter",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-reader-to-tab", "wv-rf-chev", "wv-ui-dark",
            "wv-undo-btn x2", "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note1.off.reload": {
        window: [
            "_wvNoteAltOff:function", "_wvNoteAltWired:boolean", "_wvReaderMergeAbsorberWired:boolean",
            "listen newWindowKey", "listen reopenClosedKey",
        ],
        ids: [
            "wv-note-window-tab-context-menu", "wv-window-tabstrip-styles",
        ],
        classes: [],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
    },
    "reader2.off.reload": {
        window: [
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTitleGlyphIdx:number", "_wvWinIconName:string", "listen newWindowKey",
            "listen ovFollow:unload", "listen readerNotes:unload", "listen readersCleanup:unload",
            "listen reopenClosedKey", "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer",
        ],
        ids: [
            "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-item-details", "wv-reader-item-sidenav",
            "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck", "wv-reader-pane-splitter",
            "wv-reader-pane-style", "wv-view-menuitem-outline", "wv-view-menuitem-pane",
            "wv-view-menuitem-selector", "wv-view-menuitem-sidebar", "wv-window-badge-dot-style",
        ],
        classes: [
            "wv-layout-item x4", "wv-layout-menu", "wv-layout-sep",
            "wv-reader-pane-splitter",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-reader-to-tab", "wv-rf-chev", "wv-ui-dark",
            "wv-undo-btn x2", "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note2.off.reload": {
        window: [
            "listen newWindowKey", "listen reopenClosedKey",
        ],
        ids: [],
        classes: [],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=null", "drawtitle=null",
        ],
    },
    "reader1.toOn.pref": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderDragOverlaySync:function", "_wvReaderMergeAbsorberWired:boolean",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerDragOverlay:diag", "listen readerNewTabKey", "listen readerNotes:unload",
            "listen readersCleanup:unload", "listen reopenClosedKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen winControls:resize", "listen winControls:sizemodechange",
            "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-reader-menu x6", "wv-reader-menubar-icon", "wv-reader-pane-splitter",
            "wv-window-close", "wv-window-control x3", "wv-window-controls", "wv-window-drag-spacer",
            "wv-window-max", "wv-window-min", "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close",
            "wv-window-tab-icon", "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn",
            "wv-window-tabs", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-iframe-nodrag", "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-rf-chev", "wv-ui-dark", "wv-undo-btn x2",
            "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note1.toOn.pref": {
        window: [
            "_wvCompactMenubar:object", "_wvNoteAltOff:function", "_wvNoteAltWired:boolean",
            "_wvReaderMergeAbsorberWired:boolean", "_wvRedoKeyH:function", "_wvTabStrip:object",
            "listen newWindowKey", "listen reopenClosedKey", "listen winControls:resize",
            "listen winControls:sizemodechange",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-note-menubar-styles", "wv-note-window-tab-context-menu",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-find-item",
            "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-menubar-zicon", "wv-reader-menu x6", "wv-window-close",
            "wv-window-control x3", "wv-window-controls", "wv-window-max", "wv-window-min",
            "wv-window-strip-fill", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
    "reader2.toOn.pref": {
        window: [
            "_wvCloseBtnPending:boolean", "_wvCloseBtnRO:object", "_wvCompactMenubar:object",
            "_wvIdentityTag:string", "_wvOvActivateHandler:function", "_wvOvBirthMon:string",
            "_wvOvFollowWired:number", "_wvOvMoveHandler:function", "_wvOvPollId:number",
            "_wvOvPosKey:string", "_wvOvSettled:boolean", "_wvPrevWinIcons:object",
            "_wvReaderDragOverlaySync:function", "_wvReaderMergeAbsorberWired:boolean",
            "_wvReaderNotesObsID:string", "_wvReaderPaneItemID:number", "_wvRedoKeyH:function",
            "_wvTabGroupWinDnDOff:function", "_wvTabStrip:object", "_wvThemeMQ:object",
            "_wvTitleGlyphIdx:number", "_wvWT:object", "_wvWTMultiSelOff:function", "_wvWTRestored:boolean",
            "_wvWinIconName:string", "listen newWindowKey", "listen ovFollow:unload",
            "listen readerDragOverlay:diag", "listen readerNewTabKey", "listen readerNotes:unload",
            "listen readersCleanup:unload", "listen reopenClosedKey", "listen tabGroupWinDnD:dragover",
            "listen tabGroupWinDnD:drop", "listen winControls:resize", "listen winControls:sizemodechange",
            "listen wvWT:teardown",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-layout-menu", "wv-layout-menu-popup", "wv-reader-compact-menubar-styles",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-drag-overlay",
            "wv-reader-find-item", "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-item-details",
            "wv-reader-item-sidenav", "wv-reader-notes-context", "wv-reader-pane", "wv-reader-pane-deck",
            "wv-reader-pane-splitter", "wv-reader-pane-style", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-selected-tab-ring", "wv-tab-group-styles",
            "wv-view-menuitem-outline", "wv-view-menuitem-pane", "wv-view-menuitem-selector",
            "wv-view-menuitem-sidebar", "wv-win-name-tooltip", "wv-window-badge-dot-style",
            "wv-window-tab-context-menu", "wv-window-tab-tooltip", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-layout-item x4", "wv-layout-menu",
            "wv-layout-sep", "wv-reader-menu x6", "wv-reader-menubar-icon", "wv-reader-pane-splitter",
            "wv-window-close", "wv-window-control x3", "wv-window-controls", "wv-window-drag-spacer",
            "wv-window-max", "wv-window-min", "wv-window-newtab-btn", "wv-window-tab", "wv-window-tab-close",
            "wv-window-tab-icon", "wv-window-tab-title", "wv-window-tabfill", "wv-window-tablist-btn",
            "wv-window-tabs", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
        reader: [
            "_wvNativeOutlineMO:null",
        ],
        "page.ids": [
            "wv-reader-iframe-nodrag", "wv-reader-panels-style",
        ],
        "page.classes": [
            "wv-filter-svg", "wv-reader-filter-btn", "wv-rf-chev", "wv-ui-dark", "wv-undo-btn x2",
            "wv-undo-divider", "wv-undo-off x2",
        ],
    },
    "note2.toOn.pref": {
        window: [
            "_wvCompactMenubar:object", "_wvNoteAltOff:function", "_wvNoteAltWired:boolean",
            "_wvReaderMergeAbsorberWired:boolean", "_wvRedoKeyH:function", "_wvTabStrip:object",
            "listen newWindowKey", "listen reopenClosedKey", "listen winControls:resize",
            "listen winControls:sizemodechange",
        ],
        "#menu_EditPopup": [
            "_wvUndoMenuH", "_wvUndoMenuVer", "listen readerMenubar:editShowing",
        ],
        ids: [
            "wv-hamburger-popup", "wv-note-menubar-styles", "wv-note-window-tab-context-menu",
            "wv-reader-copy-bibliography", "wv-reader-copy-citation", "wv-reader-find-item",
            "wv-reader-help-menu", "wv-reader-help-menu-popup", "wv-reader-tools-menu",
            "wv-reader-tools-menu-popup", "wv-window-tabstrip-styles",
        ],
        classes: [
            "wv-active", "wv-hamburger-btn", "wv-menubar-zicon", "wv-reader-menu x6", "wv-window-close",
            "wv-window-control x3", "wv-window-controls", "wv-window-max", "wv-window-min",
            "wv-window-strip-fill", "wv-window-tab", "wv-window-tab-close", "wv-window-tab-icon",
            "wv-window-tab-title", "wv-window-tabstrip",
        ],
        rootClasses: [],
        rootAttrs: [],
        titlebar: [
            "customtitlebar=true", "drawtitle=null",
        ],
    },
};
